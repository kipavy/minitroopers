import type { Hono } from "hono";
import { dayKey, nextResetAt } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { dayOverAt } from "../allowance.ts";
import { armyUrl } from "../urls.ts";
import { enddayPage } from "../views/endday.ts";
import { ownedArmy } from "./owner.ts";

export function registerEndDay(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;

  // Where the last action of the day ends: owner only, and only once the day is really over.
  pages.get("/endDay", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const t = now();
    if (!dayOverAt(db, cfg, o.army.id, t)) return c.redirect(armyUrl(cfg, o.army.host, "/hq"));
    const resetIn = Math.max(0, Math.round((nextResetAt(new Date(t), cfg.tzGame).getTime() - t) / 1000));
    return c.html(String(enddayPage(cfg, { army: o.army, troopers: o.troopers, power: o.power, resetIn })));
  });
}
