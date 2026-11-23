import type { Hono } from "hono";
import { armyPower } from "@mt/engine";
import type { Deps, Env } from "../app.ts";
import { ranking, troopersOf, trooperInput } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { missingPage } from "../views/army.ts";
import { ranksPage } from "../views/ranks.ts";
import { requestArmy } from "./owner.ts";

export function registerRanks(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;

  // Public: anyone can read the ranking of an army; the left panel is what that visitor sees at the HQ.
  pages.get("/ranks", (c) => {
    const army = requestArmy(deps, c);
    if (!army) return c.html(String(missingPage(cfg, "Armée introuvable")), 404);
    const troopers = troopersOf(db, army.id).map(trooperInput);
    const visitor = c.get("session").armyId === army.id ? "owner" : army.passwordHash !== null ? "locked" : "stranger";
    return c.html(String(ranksPage(cfg, { army, troopers, power: armyPower(troopers), visitor, ranks: ranking(db, army.id) })));
  });

  // Never existed in the original (only on its test server): the ranking of the army.
  pages.get("/global-ranks", (c) => {
    const army = requestArmy(deps, c);
    return c.redirect(army ? armyUrl(cfg, army.host, "/ranks") : "/ranks", 301);
  });
}
