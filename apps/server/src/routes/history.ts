import type { Hono } from "hono";
import { BackgroundType, clientParams, recruitsData } from "@mt/engine";
import { referralBounty } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { recruitsByLevel } from "../deploy.ts";
import { confirmedRecruitCount, confirmRecruits, creditsOf, defensesOf, recruitsOf, troopersOf, trooperInput, type ArmyRow } from "../repo.ts";
import { historyPage } from "../views/history.ts";
import { ARMY_SWF } from "../views/swf.ts";
import { ownedArmy, withTroopers } from "./owner.ts";

const SHOWN = 10;
/** Recruits shown by the animation. UNVERIFIED: wiki "up to 50 best recruits"; no archived case above 18. */
const ANIMATION_MAX = 50;

/**
 * Flashvars of the recruits animation (ClientMode 5, RECON4 §1.3): the army's slot-0 trooper (id n), then the first
 * trooper of its n best recruits (ids 0..n-1, level then recruit id descending); garden background; gfx army.swf.
 * Null without a confirmed recruit.
 */
function recruitsAnimation(deps: Deps, army: ArmyRow): string | null {
  const best = recruitsByLevel(deps.db, army.id).slice(0, ANIMATION_MAX);
  const lead = troopersOf(deps.db, army.id).find((t) => t.slot === 0);
  if (best.length === 0 || !lead) return null;
  const n = best.length;
  const troopers = [{ ...trooperInput(lead), id: n }, ...best.map((r, i) => ({ ...r.trooper, id: i }))];
  return clientParams(recruitsData({ faction: army.faction, spawnOrder: [], troopers }, n, { id: BackgroundType.BG_GARDEN, gfx: "bg/garden.jpg" }, ARMY_SWF));
}

export function registerHistory(pages: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;

  // Opening the page confirms the pending recruits and credits their bounties (one transaction: a reload or a
  // concurrent request finds nothing pending). A stranger is redirected before anything is touched.
  pages.get("/history", (c) => {
    const o0 = ownedArmy(deps, c);
    if (o0 instanceof Response) return o0;
    const t = now();
    confirmRecruits(db, o0.army.id, t, referralBounty);
    const o = withTroopers(deps, { ...o0.army, credits: creditsOf(db, o0.army.id) });
    return c.html(
      String(
        historyPage(cfg, {
          army: o.army,
          troopers: o.troopers,
          power: o.power,
          defenses: defensesOf(db, o.army.id, SHOWN),
          now: t,
          recruits: recruitsOf(db, o.army.id, SHOWN),
          total: confirmedRecruitCount(db, o.army.id),
          animation: recruitsAnimation(deps, o.army),
        }),
      ),
    );
  });
}
