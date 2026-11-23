import type { Hono } from "hono";
import { referralBounty } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { confirmedRecruitCount, confirmRecruits, recruitsOf } from "../repo.ts";
import { historyPage } from "../views/history.ts";
import { ownedArmy, withTroopers } from "./owner.ts";

const SHOWN = 10;

export function registerHistory(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;

  // Opening the page confirms the pending recruits and credits their bounties (one transaction: a reload or a
  // concurrent request finds nothing pending). A stranger is redirected before anything is touched.
  pages.get("/history", (c) => {
    const o0 = ownedArmy(deps, c);
    if (o0 instanceof Response) return o0;
    confirmRecruits(db, o0.army.id, now(), referralBounty);
    const o = withTroopers(deps, { ...o0.army, credits: (db.prepare("SELECT credits FROM armies WHERE id = ?").get(o0.army.id) as { credits: number }).credits });
    return c.html(String(historyPage(cfg, { army: o.army, troopers: o.troopers, power: o.power, recruits: recruitsOf(db, o.army.id, SHOWN), total: confirmedRecruitCount(db, o.army.id) })));
  });
}
