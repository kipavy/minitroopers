import type { Context, Hono } from "hono";
import { describeTrooper, levelUpOptions } from "@mt/engine";
import type { Deps, Env } from "../app.ts";
import { hasKey, queryParam } from "../session.ts";
import { finishLevelUp, levelUpTo, trooperInput } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { levelUpPage } from "../views/levelup.ts";
import { missingPage } from "../views/army.ts";
import { ownedArmy, slotOf, type Owned } from "./owner.ts";

const ERR_SKILL = "Cette compétence n'est pas proposée."; // UNVERIFIED: our own text

export function registerLevelUp(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const to = (c: Context<Env>, o: Owned, path: string): Response => c.redirect(armyUrl(cfg, o.army.host, path));

  pages.get("/levelup/:n{[0-9]{1,2}}", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const slot = slotOf(c);
    const row = o.rows.find((r) => r.slot === slot);
    if (!row) return c.html(String(missingPage(cfg, "Trooper introuvable")), 404);
    // Nothing paid: no level-up to choose from (also what a replayed choice URL lands on).
    if (row.pendingLevelup === null) return to(c, o, `/t/${slot}`);
    const key = c.get("session").key;
    const page = (error?: string, status: 200 | 400 = 200): Response =>
      c.html(
        String(
          levelUpPage(cfg, {
            army: o.army,
            troopers: o.troopers,
            power: o.power,
            slot,
            trooper: trooperInput(row),
            level: describeTrooper(trooperInput(row)).level + 1,
            options: levelUpOptions(trooperInput(row)).shown,
            key,
            choices: row.choices.length,
            ...(error ? { error } : {}),
          }),
        ),
        status,
      );

    const given = queryParam(c, "skill");
    if (given === undefined) return queryParam(c, "err") === "skill" ? page(ERR_SKILL, 400) : page();
    if (!hasKey(c, "chk")) return c.text("Forbidden", 403);
    // Bound to the level the page was issued for, and every outcome redirects: the choice URL never renders.
    const lv = /^[0-9]{1,3}$/.test(queryParam(c, "lv") ?? "") ? Number(queryParam(c, "lv")) : -1;
    if (lv !== row.choices.length) return to(c, o, `/levelup/${slot}`);
    const skill = /^[0-9]{1,3}$/.test(given) ? Number(given) : -1;
    const r = finishLevelUp(db, o.army.id, slot, (t) => levelUpTo(t, skill)); // null unless `skill` is one of the options shown
    if (r === "done") return to(c, o, "/hq");
    if (r === "none") return to(c, o, `/t/${slot}`);
    return to(c, o, `/levelup/${slot}?err=skill`);
  });
}
