import type { Context, Hono } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { randomInt } from "node:crypto";
import { InvalidBattleInput, armyPower, battleData, clientParams, simulateOutcome, type BattleArmyInput, type BattleTrooperInput } from "@mt/engine";
import {
  EPIC_NPC_MAX, EPIC_SIDE_MAX, MISSION_UNLOCK_COST, dayKey, dayRats, epicPower, fillerArmy, missionOfDay, missionReward, npcArmy,
  pickInfiltrationTarget, ratArmy, type MissionType,
} from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { buildModeInput } from "../battleInput.ts";
import { battleTroopers } from "../deploy.ts";
import { defenderTitle, foeOf, type Foe } from "../foes.ts";
import {
  addNotice, armyById, dayOver, armyPowers, confirmedRecruitCount, fightMission, foughtArmies, freezeMissionType, markSeen, missionDay, modeBattleOfDay,
  recruitLeaders, setMissionTarget, trooperInput, unlockMissions, type ArmyRow, type NewModeBattle,
} from "../repo.ts";
import { isSessionKey, queryParam } from "../session.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle } from "../views/army.ts";
import { battlePage } from "../views/battle.ts";
import { ARMY_SWF } from "../views/swf.ts";
import { ownedArmy, viewDay } from "./owner.ts";

// UNVERIFIED: the original battle seed range is unknown (same range as the daily battles).
const SEED_MAX = 0x40000000;
/** Salt of the day's draws (mission type, rats), like the "offers" salt of the daily offers. */
const SALT = "missions";
const TYPES: readonly MissionType[] = ["exterminate", "infiltrate", "epic"];

export const asMissionType = (s: string | null): MissionType => (TYPES as readonly (string | null)[]).includes(s) ? (s as MissionType) : "infiltrate";

/** The day's mission type of an army (before it is frozen): `missionOfDay` with its confirmed recruits. */
export const missionTypeOf = (db: DatabaseSync, armyId: number, day: string): MissionType =>
  missionOfDay({ day, armyId, recruits: confirmedRecruitCount(db, armyId), salt: SALT });

/** UNVERIFIED: text of $GL ("Pas assez d'argent pour débloquer la mission"); the original refusal was never captured. */
const POOR = "Pas assez d'argent pour débloquer la mission.";

export function registerMission(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;
  const battleSeed = deps.battleSeed ?? (() => randomInt(1, SEED_MAX));
  const dayOf = (t: number): string => dayKey(new Date(t), cfg.tzGame);
  const today = (): string => dayOf(now());

  /** Infiltration target, frozen for the day in `daily.mission_target` (redrawn only if it vanished). */
  function infiltrationFoe(army: ArmyRow, day: string, power: number): Foe | null {
    const have = missionDay(db, army.id, day).target;
    const kept = have !== null ? foeOf(db, have) : null;
    if (kept && kept.defenderId !== army.id) return kept;
    const pick = pickInfiltrationTarget({
      self: String(army.id),
      candidates: armyPowers(db).map((a) => ({ id: String(a.id), power: a.power })),
      fought: foughtArmies(db, army.id),
      day,
      armyId: army.id,
    });
    // UNVERIFIED: no other army with a trooper: a generated army of the own power.
    const ref = pick?.id ?? fillerArmy({ power, seed: randomInt(1, 0x7fffffff) }).id;
    const foe = foeOf(db, ref);
    if (foe) setMissionTarget(db, army.id, day, ref);
    return foe;
  }

  /** Epic NPC seed, frozen for the day (`npc:<seed>`), so the 3 tries face the same army. */
  function epicSeed(army: ArmyRow, day: string): number {
    const m = /^npc:(\d{1,10})$/.exec(missionDay(db, army.id, day).target ?? "");
    if (m) return Number(m[1]);
    const seed = randomInt(1, 0x7fffffff);
    setMissionTarget(db, army.id, day, `npc:${seed}`);
    return seed;
  }

  /** Builds and resolves one try, reading the army as stored (inside the fight transaction). */
  function decide(armyId: number, day: string): NewModeBattle | string {
    const army = armyById(db, armyId);
    if (!army) return "gone";
    const mode = asMissionType(missionDay(db, army.id, day).type);
    const mine: BattleTrooperInput[] = battleTroopers(db, army.id); // deployment order (RECON4 §3)
    if (mine.length === 0) return "invalid";
    let troopers = mine;
    let foe: BattleArmyInput;
    let defenderId: number | null = null;
    let defenderRef: string | null = null;
    if (mode === "exterminate") {
      foe = ratArmy(dayRats({ day, armyId: army.id, count: army.rats, salt: SALT }), 0);
    } else if (mode === "infiltrate") {
      const f = infiltrationFoe(army, day, armyPower(mine));
      if (!f) return "invalid";
      foe = f.army;
      defenderId = f.defenderId;
      defenderRef = f.defenderRef;
    } else {
      // Own army, then the first trooper of each confirmed recruit (pref null), highest level first, up to 32 (RECON3 §2).
      const recruits = recruitLeaders(db, army.id)
        .map((t) => ({ ...trooperInput(t), pref: null }))
        .sort((a, b) => b.choices.length - a.choices.length);
      troopers = [...mine, ...recruits].slice(0, Math.max(EPIC_SIDE_MAX, mine.length));
      foe = npcArmy({ power: epicPower(army.epicWins), min: EPIC_SIDE_MAX, max: EPIC_NPC_MAX, seed: epicSeed(army, day), firstId: 0 });
    }
    if (foe.troopers.length === 0) return "invalid";
    const input = buildModeInput({ mode, seed: battleSeed(), attacker: { faction: army.faction, troopers, spawn: mine.length }, foe });
    let winner: number | null;
    try {
      winner = simulateOutcome(input).winner;
    } catch (e) {
      if (e instanceof InvalidBattleInput) return "invalid";
      throw e;
    }
    return { mode, defenderId, defenderRef, input, winner, reward: missionReward(winner === input.attackerSide) };
  }

  // "Débloquer pour 5": paid once, then back to the HQ.
  pages.get("/b/unlock", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    if (isSessionKey(c, queryParam(c, "chk")) && unlockMissions(db, o.army.id, MISSION_UNLOCK_COST) === "poor") {
      addNotice(db, o.army.id, { text: POOR });
    }
    return c.redirect(armyUrl(cfg, o.army.host, "/hq"));
  });

  /**
   * One try of the mission of the day (`/b/mission?n=<tries made>;chk=KEY`), post/redirect/get like `/b/battle`: a
   * replayed URL (reload, double click, concurrent requests) fights nothing and shows the try it made.
   */
  pages.get("/b/mission", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const to = (path: string): Response => c.redirect(armyUrl(cfg, o.army.host, path));
    if (!isSessionKey(c, queryParam(c, "chk"))) return to("/hq");
    const n = queryParam(c, "n");
    const used = n !== undefined && /^[0-9]{1,3}$/.test(n) ? Number(n) : -1;
    const t = now();
    const day = dayOf(t);
    freezeMissionType(db, o.army.id, day, () => missionTypeOf(db, o.army.id, day));
    const r = fightMission(db, { armyId: o.army.id, day, now: t, used, decide: () => decide(o.army.id, day) });
    if (r.ok) return to(`/b/view/miss${r.n}?d=${day}`);
    if (r.reason === "stale" && used >= 0 && used < r.used) return to(`/b/view/miss${used + 1}?d=${day}`);
    return to("/hq");
  });

  /**
   * A try of the day, for its owner. First view (b_view_miss1.html with the "just played" message): "Tu as remporté la
   * mission du jour ! Ton armée gagne +4 [T]" → `/hq?money=4`, or the failure text → `/hq`, no button. Later views:
   * archived replay texts, `/hq`, "Retour". Title only for the infiltration.
   */
  pages.get("/b/view/:m{miss[0-9]{1,3}}", (c: Context<Env>) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const b = modeBattleOfDay(db, o.army.id, viewDay(c, today()), "mission", Number(c.req.param("m")!.slice(4)));
    const hq = armyUrl(cfg, o.army.host, "/hq");
    if (!b) return c.redirect(hq);
    const fresh = !b.seen && markSeen(db, b.id);
    const won = b.winner !== null && b.winner === b.input.attackerSide;
    const reward = missionReward(won);
    // UNVERIFIED: the "just played" message of a mission was never archived; built like the battle one.
    const endMsg = fresh
      ? won
        ? `Tu as remporté la mission du jour ! Ton armée gagne +${reward} [T]`
        : "Ce combat s'est soldé par un échec !"
      : won
        ? "Tu as remporté ce combat !"
        : "Ce combat s'est soldé par un échec !";
    const defender = defenderTitle(db, b);
    const view = {
      host: o.army.host,
      pass: o.army.passwordHash !== null,
      attacker: armyTitle(o.army.name, o.army.part),
      defender,
      heading: b.mode === "infiltrate" ? `Infiltrer la base de ${defender}` : null,
      flashvars: clientParams(battleData(b.input, ARMY_SWF), { endMsg }),
      endUrl: fresh && dayOver(db, o.army.id, b.day) ? armyUrl(cfg, o.army.host, "/endDay") : fresh && won ? armyUrl(cfg, o.army.host, `/hq?money=${reward}`) : hq,
      back: fresh ? null : hq,
      battleId: `${o.army.id}@${b.id}`,
    };
    return c.html(String(battlePage(cfg, view)));
  });
}
