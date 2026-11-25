import type { Context, Hono } from "hono";
import { randomBytes, randomInt } from "node:crypto";
import { InvalidBattleInput, battleData, clientParams, simulateOutcome } from "@mt/engine";
import { parseFillerId, pickTrainingOpponents } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { buildBattleInput } from "../battleInput.ts";
import { battleTroopers } from "../deploy.ts";
import { defenderTitle, foeByName, foeOf, type Foe } from "../foes.ts";
import { formBody } from "../form.ts";
import { armyById, armyByHost, armyPowers, insertTraining, recentTrainings, trainingById, type ArmyRow, type BattleRow, type TrainingRow } from "../repo.ts";
import { isSessionKey, queryParam } from "../session.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle, missingPage } from "../views/army.ts";
import { battlePage } from "../views/battle.ts";
import type { OppFoe } from "../views/opp.ts";
import { ARMY_SWF } from "../views/swf.ts";
import { trainPage } from "../views/train.ts";
import { playerData } from "./battle.ts";
import { BATTLE_ERRORS } from "./opp.ts";
import { ownedArmy } from "./owner.ts";

const SEED_MAX = 0x40000000;

/** The replay helpers read a BattleRow: a training seen as one (never "fresh", no day, no reward). */
const asBattle = (t: TrainingRow): BattleRow =>
  ({ id: t.id, day: "", attackerId: t.attackerId, defenderId: t.defenderId, defenderRef: t.defenderRef, input: t.input, winner: t.winner, seen: true, kind: "training", mode: null, phase: null, reward: null }) as BattleRow;

/**
 * Training battles (/b/train): unlimited, no credits, no daily quota, nothing in any history, notice, rank or stat;
 * stored in their own table (the last TRAININGS_KEPT of each army) for their public replay page /b/tview/<id>.
 */
export function registerTrain(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;
  const battleSeed = deps.battleSeed ?? (() => randomInt(1, SEED_MAX));

  pages.get("/b/train", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const refs = pickTrainingOpponents({
      self: { id: String(o.army.id), power: o.power },
      candidates: armyPowers(db).map((a) => ({ id: String(a.id), power: a.power, isFaction: a.isFaction })),
      seed: randomBytes(8).toString("hex"),
    });
    const foes: OppFoe[] = [];
    for (const r of refs) {
      const f = foeOf(db, r.id);
      if (f) foes.push({ ref: r.id, title: f.title, power: f.power, faction: f.faction, troopers: f.army.troopers });
    }
    const recent = recentTrainings(db, o.army.id).map((t) => ({ id: t.id, opponent: defenderTitle(db, t), won: t.winner !== null && t.winner === t.input.attackerSide }));
    const err = queryParam(c, "err");
    const error = err !== undefined && Object.hasOwn(BATTLE_ERRORS, err) ? BATTLE_ERRORS[err] : undefined;
    const view = { army: o.army, troopers: o.troopers, power: o.power, foes, key: c.get("session").key, recent, ...(error ? { error } : {}) };
    return c.html(String(trainPage(cfg, view)), error ? 400 : 200);
  });

  function resolve(army: ArmyRow, foe: Foe | null): { foe: Foe; input: ReturnType<typeof buildBattleInput>; winner: number | null } | string {
    if (!foe) return "missing";
    if (foe.defenderId === army.id) return "self";
    const mine = battleTroopers(db, army.id);
    if (mine.length === 0 || foe.army.troopers.length === 0) return "invalid";
    const input = buildBattleInput(battleSeed(), { faction: army.faction, troopers: mine }, foe.army);
    try {
      return { foe, input, winner: simulateOutcome(input).winner };
    } catch (e) {
      if (e instanceof InvalidBattleInput) return "invalid";
      throw e;
    }
  }

  /**
   * An opponent id sent back by the training page: a stored or faction army, or a generated army whose power the draw
   * could have produced (fillers within ±20 % of the own power; here up to double max(power, 10)). Any other filler id is
   * refused: its power is free in the URL, and a huge one would make a huge army (seconds of simulation, a huge row).
   */
  function drawable(ref: string, power: number): Foe | null {
    const fill = parseFillerId(ref);
    if (fill && fill.power > 2 * Math.max(power, 10)) return null;
    return foeOf(db, ref);
  }

  function train(c: Context<Env>, a: { chk: unknown; opp: string | undefined; friend: unknown }, status: 302 | 303): Response {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const to = (path: string): Response => c.redirect(armyUrl(cfg, o.army.host, path), status);
    if (!isSessionKey(c, a.chk)) return to("/b/train");
    const foe = a.friend !== undefined ? foeByName(db, a.friend) : a.opp !== undefined ? drawable(a.opp, o.power) : null;
    const r = resolve(o.army, foe);
    if (typeof r === "string") return to(`/b/train?err=${r}`);
    const id = insertTraining(db, { attackerId: o.army.id, defenderId: r.foe.defenderId, defenderRef: r.foe.defenderRef, input: r.input, winner: r.winner, now: now() });
    return to(`/b/tview/${id}`);
  }

  pages.get("/b/train/fight", (c) => train(c, { chk: queryParam(c, "chk"), opp: queryParam(c, "opp"), friend: queryParam(c, "friend") }, 302));

  pages.post("/b/train/fight", formBody(), async (c) => {
    const form = await c.req.parseBody();
    return train(c, { chk: form.chk, opp: typeof form.opp === "string" ? form.opp : undefined, friend: form.opp === undefined ? (form.friend ?? "") : undefined }, 303);
  });

  // A training replay: public like /b/fview (anyone with the link), never "fresh", no reward.
  pages.get("/b/tview/:id{[0-9]{1,10}}", (c) => {
    const t = trainingById(db, Number(c.req.param("id")));
    if (!t) return c.html(String(missingPage(cfg, "Combat introuvable")), 404);
    const b = asBattle(t);
    const attacker = armyById(db, t.attackerId);
    const attackerTitle = attacker ? armyTitle(attacker.name, attacker.part) : "L'armée inconnue";
    const defender = defenderTitle(db, t);
    const own = c.get("session").armyId;
    const host = c.get("armyHost") ?? (own === null ? null : (armyById(db, own)?.host ?? null));
    const mine = attacker !== null && own === attacker.id;
    const back = mine ? armyUrl(cfg, attacker.host, "/b/train") : host !== null ? armyUrl(cfg, host, "/hq") : "/";
    // Like /b/fview: the defender sees the replay from its own side, with its own result.
    const viewerDefends = own !== null && own === t.defenderId;
    const attackerWon = t.winner !== null && t.winner === t.input.attackerSide;
    const won = viewerDefends ? t.winner !== null && !attackerWon : attackerWon;
    const endMsg = won ? "Tu as remporté ce combat !" : "Ce combat s'est soldé par un échec !";
    const view = {
      host,
      pass: host !== null && (armyByHost(db, host)?.passwordHash ?? null) !== null,
      attacker: attackerTitle,
      defender,
      heading: `Entraînement : ${attackerTitle} VS ${defender}`,
      ...playerData(c, b, attackerTitle, defender, viewerDefends),
      flashvars: clientParams(battleData(viewerDefends ? { ...t.input, attackerSide: 1 - t.input.attackerSide } : t.input, ARMY_SWF), { endMsg }),
      endUrl: back,
      back,
      battleId: `t${t.id}`,
    };
    return c.html(String(battlePage(cfg, view)));
  });
}
