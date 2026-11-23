import type { Hono } from "hono";
import { createHash, randomInt } from "node:crypto";
import { InvalidBattleInput, battleData, clientParams, simulateOutcome } from "@mt/engine";
import { RAID_PER_BATTLE, RAID_REWARD, dayKey, npcArmy, raidPower, raidTrooperRange } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { buildModeInput } from "../battleInput.ts";
import { armyById, dayOver, fightRaid, lastRaidOfDay, markSeen, type NewModeBattle, type RaidRecruit } from "../repo.ts";
import { isSessionKey, queryParam } from "../session.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle } from "../views/army.ts";
import { battlePage } from "../views/battle.ts";
import { ARMY_SWF } from "../views/swf.ts";
import { ownedArmy, viewDay } from "./owner.ts";

// UNVERIFIED: the original battle seed range is unknown (same range as the daily battles).
const SEED_MAX = 0x40000000;

// UNVERIFIED: the server-side NPC seed derivation is unknown.
/** Seed of the NPC army of a raid phase: a hash of day|army|phase, so a phase always meets the same army. */
export function raidNpcSeed(day: string, armyId: number, phase: number): number {
  return (createHash("sha256").update(`${day}|${armyId}|raid|${phase}`).digest().readUInt32BE(0) % 0x7ffffffe) + 1;
}

/** Archived first-view message of a won raid ($EX/html/fr/b_view_raid.html; "tu peut" sic). */
const WON_FIRST = `Félicitations, tu as remporté le raid ! Ton armée gagne +${RAID_REWARD} [T] et tu peut tenter le raid suivant.`;
const LOST = "Ce combat s'est soldé par un échec !";

export function registerRaid(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;
  const battleSeed = deps.battleSeed ?? (() => randomInt(1, SEED_MAX));
  const dayOf = (t: number): string => dayKey(new Date(t), cfg.tzGame);
  const today = (): string => dayOf(now());

  /** One phase: up to RAID_PER_BATTLE living recruits (the weakest first) against the phase's NPC army. */
  function decide(armyId: number, day: string, phase: number, alive: RaidRecruit[]): NewModeBattle | string {
    const army = armyById(db, armyId);
    if (!army) return "gone";
    const fighters = alive.slice(0, RAID_PER_BATTLE);
    const foe = npcArmy({ power: raidPower(phase), ...raidTrooperRange(phase), seed: raidNpcSeed(day, armyId, phase), firstId: 0 });
    if (foe.troopers.length === 0) return "invalid";
    const input = buildModeInput({ mode: "raid", seed: battleSeed(), attacker: { faction: army.faction, troopers: fighters.map((r) => r.trooper), spawn: 0 }, foe });
    let outcome: ReturnType<typeof simulateOutcome>;
    try {
      outcome = simulateOutcome(input);
    } catch (e) {
      if (e instanceof InvalidBattleInput) return "invalid";
      throw e;
    }
    // The graveyard holds input trooper ids; the attackers are listed in `fighters` order.
    const byId = new Map(input.armies[input.attackerSide]!.troopers.map((t, i) => [t.id, fighters[i]!.recruitArmyId]));
    const dead = outcome.graveyard.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const win = outcome.winner !== null && outcome.winner === input.attackerSide;
    return { mode: "raid", defenderId: null, defenderRef: null, input, winner: outcome.winner, reward: win ? RAID_REWARD : 0, dead };
  }

  /**
   * One raid phase (`/b/raid?phase=<p>;chk=KEY`), post/redirect/get: the phase counter makes a used URL inert, and a
   * replayed one (reload, double click, concurrent requests) shows the last raid instead.
   */
  pages.get("/b/raid", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const to = (path: string): Response => c.redirect(armyUrl(cfg, o.army.host, path));
    if (!isSessionKey(c, queryParam(c, "chk"))) return to("/hq");
    const q = queryParam(c, "phase");
    const phase = q !== undefined && /^[0-9]{1,3}$/.test(q) ? Number(q) : -1;
    const t = now();
    const day = dayOf(t);
    const r = fightRaid(db, { armyId: o.army.id, day, now: t, phase, decide: (alive) => decide(o.army.id, day, phase, alive) });
    if (r.ok) return to(`/b/view/raid?d=${day}`);
    if ((r.reason === "stale" || r.reason === "limit") && phase >= 1 && phase <= r.used && lastRaidOfDay(db, o.army.id, day)) return to(`/b/view/raid?d=${day}`);
    return to("/hq");
  });

  /**
   * The day's last raid, for its owner ($EX/html/fr/b_view_raid.html, no `<h1>`). First view: the archived win
   * message → `/hq?money=4`, or the failure text → `/hq`, no button. Later views: replay texts, "Retour".
   */
  pages.get("/b/view/raid", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const hq = armyUrl(cfg, o.army.host, "/hq");
    const b = lastRaidOfDay(db, o.army.id, viewDay(c, today()));
    if (!b) return c.redirect(hq);
    const fresh = !b.seen && markSeen(db, b.id);
    const won = b.winner !== null && b.winner === b.input.attackerSide;
    // UNVERIFIED: the defeat message of a raid was never archived; the archived replay text is used.
    const endMsg = won ? (fresh ? WON_FIRST : "Tu as remporté ce combat !") : LOST;
    const view = {
      host: o.army.host,
      attacker: armyTitle(o.army.name, o.army.part),
      defender: "",
      heading: null,
      flashvars: clientParams(battleData(b.input, ARMY_SWF), { endMsg }),
      endUrl: fresh && dayOver(db, o.army.id, b.day) ? armyUrl(cfg, o.army.host, "/endDay") : fresh && won ? armyUrl(cfg, o.army.host, `/hq?money=${RAID_REWARD}`) : hq,
      back: fresh ? null : hq,
      battleId: `${o.army.id}@${b.id}`,
    };
    return c.html(String(battlePage(cfg, view)));
  });
}
