import type { Context, Hono } from "hono";
import { formBody } from "../form.ts";
import { ERR_OFFER } from "../texts.ts";
import { recruitCost } from "@mt/engine";
import { dayKey } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { addTrooper, armyById, shopResets } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { addPage } from "../views/add.ts";
import { MAX_TROOPERS } from "../views/panel.ts";
import { offersFor } from "./home.ts";
import { ownedArmy, withTroopers, type Owned } from "./owner.ts";

const ERR_POOR = "Tu n'as pas assez de crédits pour ajouter ce trooper."; // UNVERIFIED: original text not archived

export function registerAdd(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;
  const toHq = (c: Context<Env>, o: Owned): Response => c.redirect(armyUrl(cfg, o.army.host, "/hq"));

  /**
   * Today's offers of this client for this army. UNVERIFIED: same derivation as the home page (day, computer, recruiter);
   * the recruiter is the army that recruited this one, if any.
   */
  function offers(c: Context<Env>, o: Owned) {
    const recruiter = o.army.recruiterId === null ? null : (armyById(db, o.army.recruiterId)?.host ?? null);
    const day = dayKey(new Date(now()), cfg.tzGame);
    return offersFor(c, day, recruiter, shopResets(db, o.army.id, day));
  }

  function render(c: Context<Env>, o: Owned, error?: string, status: 200 | 400 = 200): Response {
    const owned = new Set(o.rows.map((r) => r.seed));
    const cost = recruitCost(o.rows.length) as number;
    const view = { army: o.army, troopers: o.troopers, power: o.power, offers: offers(c, o).filter((x) => !owned.has(x.seed)), cost, ...(error ? { error } : {}) };
    return c.html(String(addPage(cfg, view)), status);
  }

  pages.get("/add", (c) => {
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    return o.rows.length >= MAX_TROOPERS ? toHq(c, o) : render(c, o);
  });

  pages.post("/add", formBody(), async (c) => {
    const form = await c.req.parseBody();
    const o = ownedArmy(deps, c); // after the await: the state the purchase is judged on
    if (o instanceof Response) return o;
    if (o.rows.length >= MAX_TROOPERS) return toHq(c, o);
    const offer = typeof form.tselect === "string" ? offers(c, o).find((x) => String(x.seed) === form.tselect) : undefined;
    if (!offer) return render(c, o, ERR_OFFER, 400);
    const r = addTrooper(db, o.army.id, { seed: offer.seed, name: offer.name }, recruitCost);
    if (r.ok || r.reason !== "poor") return toHq(c, o); // bought, or already bought / full: the HQ either way
    return render(c, withTroopers(deps, armyById(db, o.army.id)!), ERR_POOR, 400);
  });
}
