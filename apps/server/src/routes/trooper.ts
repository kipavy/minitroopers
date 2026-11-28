import type { Context, Hono } from "hono";
import { formBody } from "../form.ts";
import { Rand, describeTrooper, levelUpOptions, reequip } from "@mt/engine";
import { levelUpCost } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { hasKey, queryParam } from "../session.ts";
import { reequipTrooper, renameTrooper, saveTrooperPref, startLevelUp, trooperInput, type TrooperRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { MAX_TROOPER_NAME, checkTrooperName } from "../validate.ts";
import { applyPrefForm, defaultTrooperPref } from "../prefs.ts";
import { sheetPage } from "../views/trooper.ts";
import { missingPage } from "../views/army.ts";
import { ownedArmy, slotOf, type Owned } from "./owner.ts";

const SLOT = "/t/:n{[0-9]{1,2}}";
/** Messages a redirect may ask the sheet to show (`?err=code`): codes only, never text from the URL. */
const FLASH: Record<string, string> = {
  renamed: "Ce trooper a déjà été renommé.",
  length: `Le nom doit faire entre 1 et ${MAX_TROOPER_NAME} caractères.`,
  chars: "Le nom contient des caractères interdits.",
};


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
      level: row.choices.length,
      upgradeCost: levelUpOptions(trooper).choiceCount > 0 ? levelUpCost(row.choices.length, cfg.levelCostExponent) : null,
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

    // Every action attempt ends in a redirect (post/redirect/get): the action URL never renders a page, so reloading,
    // history or a bookmark cannot repeat it by itself.
    const back = (err?: string): Response => to(c, o, `/t/${slot}${err ? `?err=${err}` : ""}`);
    if (queryParam(c, "levelup") !== undefined) {
      if (!hasKey(c, "levelup")) return back();
      const can = levelUpOptions(input).choiceCount > 0;
      const lv = /^[0-9]{1,3}$/.test(queryParam(c, "lv") ?? "") ? Number(queryParam(c, "lv")) : -1;
      const r = startLevelUp(db, o.army.id, slot, lv, (n) => (can ? levelUpCost(n, cfg.levelCostExponent) : null));
      return r === "started" || r === "pending" ? to(c, o, `/levelup/${slot}`) : back(); // poor / cap / stale: the sheet again
    }
    if (hasParam(c, "name")) {
      if (!hasKey(c, "chk")) return back();
      const v = checkTrooperName(queryParam(c, "name"));
      if (!v.ok) return back(v.code);
      return back(renameTrooper(db, o.army.id, slot, v.name) ? undefined : "renamed");
    }
    if (queryParam(c, "equip") !== undefined) {
      if (!hasKey(c, "equip")) return back();
      // UNVERIFIED: the original re-equip draw is unknown; the kept carry-sized subset is drawn with a Rand seeded by
      // (trooper seed, level), so revisiting at the same level gives the same set (no fishing) and a level-up re-draws.
      reequipTrooper(db, o.army.id, slot, (t) => {
        const inp = trooperInput(t);
        const d = describeTrooper(inp);
        if (d.equipment.length <= d.carry) return null;
        const left = reequip(inp, new Rand(1 + ((t.seed * 2654435761 + t.choices.length * 40503) >>> 1) % 2147483646));
        return { pref: { ...(t.pref ?? defaultTrooperPref()), selectedItems: d.equipment.filter((x) => !left.includes(x)) }, leftOver: left };
      });
      return back();
    }
    const err = queryParam(c, "err");
    const flash = err !== undefined && Object.hasOwn(FLASH, err) ? FLASH[err] : undefined; // never "constructor" & co.
    return sheet(c, o, row, key, flash, flash ? 400 : 200);
  });

  pages.post(SLOT, formBody(), async (c) => {
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
