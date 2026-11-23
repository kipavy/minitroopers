import type { Hono } from "hono";
import { battleAllowance, dayKey, pickOpponents, type ArmyRef } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { foeOf } from "../foes.ts";
import { armyPowers, battlesUsed, freezeOpponents } from "../repo.ts";
import { queryParam } from "../session.ts";
import { armyUrl } from "../urls.ts";
import { oppPage, type OppFoe } from "../views/opp.ts";
import { ownedArmy } from "./owner.ts";

/**
 * Messages a refused attack may ask the opponents page to show (`?err=code`): codes only, never text from the URL.
 * "Cette armée n'existe pas." is the original message for an unknown army name (sitemap, login form).
 * UNVERIFIED: the other refusals were never captured; texts are ours.
 */
export const BATTLE_ERRORS: Record<string, string> = {
  missing: "Cette armée n'existe pas.",
  self: "Tu ne peux pas attaquer ta propre armée.",
  opp: "Cet adversaire ne fait pas partie de ta liste du jour.",
  invalid: "Ce combat est impossible.",
  // UNVERIFIED: text of ours (an old attack link, replayed after another battle).
  stale: "Cette attaque n'est plus valable.",
};

export function registerOpp(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;

  pages.get("/b/opp", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const day = dayKey(new Date(now()), cfg.tzGame);
    const used = battlesUsed(db, o.army.id, day);
    if (used >= battleAllowance(o.troopers)) return c.redirect(armyUrl(cfg, o.army.host, "/hq"));
    // Drawn on the first visit of the day and frozen: reloading cannot fish for weaker opponents.
    const refs = freezeOpponents<ArmyRef>(db, o.army.id, day, () =>
      pickOpponents({
        self: { id: String(o.army.id), power: o.power },
        candidates: armyPowers(db).map((a) => ({ id: String(a.id), power: a.power })),
        day,
        clientId: c.get("session").clientId,
      }),
    );
    const foes: OppFoe[] = [];
    for (const r of refs) {
      const f = foeOf(db, r.id);
      if (f) foes.push({ ref: r.id, title: f.title, power: f.power, faction: f.faction, troopers: f.army.troopers });
    }
    const err = queryParam(c, "err");
    const error = err !== undefined && Object.hasOwn(BATTLE_ERRORS, err) ? BATTLE_ERRORS[err] : undefined;
    const view = { army: o.army, troopers: o.troopers, power: o.power, foes, key: c.get("session").key, used, ...(error ? { error } : {}) };
    return c.html(String(oppPage(cfg, view)), error ? 400 : 200);
  });
}
