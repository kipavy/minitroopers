import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomInt } from "node:crypto";
import { InvalidBattleInput, battleData, clientParams, simulateOutcome } from "@mt/engine";
import { battleReward, dayKey, type ArmyRef } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { buildBattleInput } from "../battleInput.ts";
import { defenderTitle, foeByName, foeOf, type Foe } from "../foes.ts";
import { armyById, battleById, battleOfDay, dayOpponents, fight, markSeen, troopersOf, trooperInput, type ArmyRow, type BattleRow, type NewBattle } from "../repo.ts";
import { isSessionKey, queryParam } from "../session.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle } from "../views/army.ts";
import { battlePage } from "../views/battle.ts";
import { missingPage } from "../views/soon.ts";
import { ARMY_SWF } from "../views/swf.ts";
import { allowanceOf } from "./opp.ts";
import { ownedArmy } from "./owner.ts";

// UNVERIFIED: the original battle seed range is unknown; archived seeds are all below 2^25. Any int32 replays the same.
const SEED_MAX = 0x40000000;

/** Attack parameters, from the query (`/b/battle?opp=<id>;n=<used>;chk=KEY`) or the "Infiltrer" form (POST friend, chk, n). */
interface Attack {
  chk: unknown;
  n: unknown;
  opp: string | undefined;
  friend: unknown;
}

export function registerBattle(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;
  const battleSeed = deps.battleSeed ?? (() => randomInt(1, SEED_MAX));
  const today = (): string => dayKey(new Date(now()), cfg.tzGame);

  /** Builds and resolves the battle against `foe`, reading the attacker as stored (inside the fight transaction). */
  function resolve(army: ArmyRow, foe: Foe): NewBattle | string {
    if (foe.defenderId === army.id) return "self";
    const mine = troopersOf(db, army.id).map(trooperInput);
    if (mine.length === 0 || foe.army.troopers.length === 0) return "invalid"; // the engine only rejects 0 vs 0
    const input = buildBattleInput(battleSeed(), { faction: army.faction, troopers: mine }, foe.army);
    let winner: number | null;
    try {
      winner = simulateOutcome(input).winner;
    } catch (e) {
      if (e instanceof InvalidBattleInput) return "invalid";
      throw e;
    }
    return { defenderId: foe.defenderId, defenderRef: foe.defenderRef, input, winner, reward: battleReward(winner === input.attackerSide) };
  }

  /**
   * Every attempt ends in a redirect (post/redirect/get). The URL is bound to the number of battles already fought
   * today (`n`): replaying it (reload, double click, concurrent requests) finds another count, fights nothing and shows
   * the battle that URL produced.
   */
  function attack(c: Context<Env>, a: Attack, status: 302 | 303): Response {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const to = (path: string): Response => c.redirect(armyUrl(cfg, o.army.host, path), status);
    if (!isSessionKey(c, a.chk)) return to("/b/opp");
    const used = typeof a.n === "string" && /^[0-9]{1,2}$/.test(a.n) ? Number(a.n) : -1;
    const day = today();
    const byName = a.friend !== undefined;
    const r = fight(db, {
      armyId: o.army.id,
      day,
      used,
      allowance: () => allowanceOf(troopersOf(db, o.army.id).map(trooperInput)),
      decide: () => {
        if (byName) {
          const foe = foeByName(db, a.friend);
          return foe ? resolve(o.army, foe) : "missing";
        }
        const list = dayOpponents<ArmyRef>(db, o.army.id, day) ?? [];
        const foe = a.opp !== undefined && list.some((x) => x.id === a.opp) ? foeOf(db, a.opp) : null;
        if (!foe || foe.defenderId === o.army.id) return "opp";
        return resolve(o.army, foe);
      },
    });
    if (r.ok) return to(byName ? `/b/fview/${r.id}` : `/b/view/bat${r.n}`);
    if (r.reason === "limit") return to("/hq");
    if (r.reason === "refused") return to(`/b/opp?err=${r.code}`);
    return to(used >= 0 && used < r.used ? `/b/view/bat${used + 1}` : "/b/opp"); // stale: the battle this URL made
  }

  pages.get("/b/battle", (c) =>
    attack(c, { chk: queryParam(c, "chk"), n: queryParam(c, "n"), opp: queryParam(c, "opp"), friend: queryParam(c, "friend") }, 302),
  );

  pages.post("/b/battle", bodyLimit({ maxSize: 4096, onError: (c) => c.text("Requête trop grande", 413) }), async (c) => {
    const form = await c.req.parseBody();
    const opp = typeof form.opp === "string" ? form.opp : undefined;
    return attack(c, { chk: form.chk, n: form.n, opp, friend: opp === undefined ? (form.friend ?? "") : undefined }, 303);
  });

  /**
   * Shows a stored battle. The first view by its attacker is the "just fought" page (b_fview_262581433.html: "+N [T]"
   * message, `endBattle()` → `/hq?money=N`, no button); later views are replays (b_view_bat1.html: `/hq`, "Retour").
   * `viewer` is the army whose point of view the replay message takes (attacker unless the viewer defended).
   */
  function show(c: Context<Env>, b: BattleRow, host: string | null, battleId: string): Response {
    const attacker = armyById(db, b.attackerId);
    const sessionArmy = c.get("session").armyId;
    const fresh = sessionArmy === b.attackerId && !b.seen && markSeen(db, b.id);
    const won = b.winner !== null && b.winner === b.input.attackerSide;
    const reward = battleReward(won);
    const viewerWon = sessionArmy !== null && sessionArmy === b.defenderId ? b.winner !== null && !won : won;
    // UNVERIFIED: the defeat variant of the "just fought" message was never captured; built like the victory one.
    const endMsg = fresh
      ? `${won ? "Tu as remporté cette bataille !" : "Tu as perdu cette bataille !"} Ton armée gagne +${reward} [T]`
      : viewerWon
        ? "Tu as remporté ce combat !"
        : "Ce combat s'est soldé par un échec !";
    const hq = host !== null ? armyUrl(cfg, host, "/hq") : "/";
    const view = {
      host,
      attacker: attacker ? armyTitle(attacker.name, attacker.part) : "L'armée inconnue",
      defender: defenderTitle(db, b),
      flashvars: clientParams(battleData(b.input, ARMY_SWF), { endMsg }),
      endUrl: fresh && attacker ? armyUrl(cfg, attacker.host, `/hq?money=${reward}`) : hq,
      back: fresh ? null : hq,
      battleId,
    };
    return c.html(String(battlePage(cfg, view)));
  }

  // The owner's battles of the day, numbered like the HQ tiles.
  pages.get("/b/view/:b{bat[0-9]{1,2}}", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const n = Number(c.req.param("b").slice(3));
    const b = battleOfDay(db, o.army.id, today(), n);
    if (!b) return c.redirect(armyUrl(cfg, o.army.host, "/hq"));
    return show(c, b, o.army.host, `${o.army.id}@${b.id}`);
  });

  // Any battle by id (attack by name, and later the history): public, like the original.
  pages.get("/b/fview/:id{[0-9]{1,10}}", (c) => {
    const b = battleById(db, Number(c.req.param("id")));
    if (!b) return c.html(String(missingPage(cfg, "Combat introuvable")), 404);
    const own = c.get("session").armyId;
    const host = c.get("armyHost") ?? (own === null ? null : (armyById(db, own)?.host ?? null));
    return show(c, b, host, String(b.id));
  });
}
