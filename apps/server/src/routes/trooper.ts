import { randomInt } from "node:crypto";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { Rand, describeTrooper, levelUpOptions, reequip, upgradeCost } from "@mt/engine";
import type { Deps, Env } from "../app.ts";
import { hasKey, queryParam } from "../session.ts";
import { renameTrooper, saveTrooperPref, startLevelUp, trooperInput, type TrooperRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { checkTrooperName } from "../validate.ts";
import { applyPrefForm, defaultTrooperPref } from "../prefs.ts";
import { sheetPage } from "../views/trooper.ts";
import { missingPage } from "../views/soon.ts";
import { ownedArmy, slotOf, type Owned } from "./owner.ts";

const SLOT = "/t/:n{[0-9]{1,2}}";
const ERR_RENAMED = "Ce trooper a déjà été renommé.";


/** True when `name` is present in the query, even when its value cannot be decoded. */
const hasParam = (c: Context, name: string): boolean => new RegExp(`(^|[&;])${name}=`).test(c.req.url.split("?", 2)[1]?.split("#")[0] ?? "");

export function registerTrooper(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const to = (c: Context<Env>, o: Owned, path: string, status: 302 | 303 = 302): Response => c.redirect(armyUrl(cfg, o.army.host, path), status);

  function sheet(c: Context<Env>, o: Owned, row: TrooperRow, key: string, error?: string, status: 200 | 400 = 200): Response {
    const trooper = trooperInput(row);
    const view = {
      army: o.army,
      troopers: o.troopers,
      power: o.power,
      slot: row.slot,
      renamed: row.renamed,
      trooper,
      sheet: describeTrooper(trooper, o.army.faction),
      pref: row.pref ?? defaultTrooperPref(),
      key,
      upgradeCost: levelUpOptions(trooper).choiceCount > 0 ? upgradeCost(row.choices.length) : null,
      ...(error ? { error } : {}),
    };
    return c.html(String(sheetPage(cfg, view)), status);
  }

  pages.get(SLOT, (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const slot = slotOf(c);
    const row = o.rows.find((r) => r.slot === slot);
    if (!row) return c.html(String(missingPage(cfg, "Trooper introuvable")), 404);
    // A paid level-up must be chosen first (the choice survives reloads and days).
    if (row.pendingLevelup !== null) return to(c, o, `/levelup/${slot}`);
    const key = c.get("session").key;
    const input = trooperInput(row);

    if (queryParam(c, "levelup") !== undefined && hasKey(c, "levelup")) {
      const can = levelUpOptions(input).choiceCount > 0;
      const r = startLevelUp(db, o.army.id, slot, (n) => (can ? upgradeCost(n) : null));
      if (r === "started" || r === "pending") return to(c, o, `/levelup/${slot}`);
      // not enough credits / level cap / bad key: the sheet again (as the original does)
    } else if (hasParam(c, "name") && hasKey(c, "chk")) {
      const v = checkTrooperName(queryParam(c, "name"));
      if (!v.ok) return sheet(c, o, row, key, v.error, 400);
      return renameTrooper(db, o.army.id, slot, v.name) ? to(c, o, `/t/${slot}`) : sheet(c, o, row, key, ERR_RENAMED, 400);
    } else if (queryParam(c, "equip") !== undefined && hasKey(c, "equip")) {
      const d = describeTrooper(input);
      if (d.equipment.length > d.carry) {
        // UNVERIFIED: the original re-equip draw is unknown; a fresh random carry-sized subset is kept (engine `reequip`).
        const left = reequip(input, new Rand(randomInt(1, 2 ** 31 - 1)));
        const pref = { ...(row.pref ?? defaultTrooperPref()), selectedItems: d.equipment.filter((s) => !left.includes(s)) };
        saveTrooperPref(db, row.id, pref, left);
      }
      return to(c, o, `/t/${slot}`);
    }
    return sheet(c, o, row, key);
  });

  pages.post(SLOT, bodyLimit({ maxSize: 4096, onError: (c) => c.text("Requête trop grande", 413) }), async (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    if (!hasKey(c, "config")) return c.text("Forbidden", 403);
    const form = await c.req.parseBody();
    const slot = slotOf(c);
    // Re-read after the await: the stored trooper is what the form applies to.
    const fresh = ownedArmy(deps, c);
    if (fresh instanceof Response) return fresh;
    const row = fresh.rows.find((r) => r.slot === slot);
    if (!row) return c.html(String(missingPage(cfg, "Trooper introuvable")), 404);
    if (row.pendingLevelup !== null) return to(c, fresh, `/levelup/${slot}`);
    const next = applyPrefForm(row.pref ?? defaultTrooperPref(), form, describeTrooper(trooperInput(row)));
    if (!next) return c.text("Réglage invalide", 400);
    saveTrooperPref(db, row.id, next);
    return to(c, fresh, `/t/${slot}`, 303);
  });
}
