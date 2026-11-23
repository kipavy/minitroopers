import type { Hono } from "hono";
import type { Deps, Env } from "../app.ts";
import { registerHome } from "./home.ts";
import { registerHq } from "./hq.ts";
import { registerTrooper } from "./trooper.ts";
import { registerLevelUp } from "./levelup.ts";
import { registerAdd } from "./add.ts";
import { registerOpp } from "./opp.ts";
import { registerBattle } from "./battle.ts";
import { registerMission } from "./mission.ts";
import { registerHistory } from "./history.ts";
import { registerProtect } from "./protect.ts";
import { createPasswordLimits } from "../ratelimit.ts";

/** Page routes of the game, mounted on the app sub-app (reachable at "/" and, in path mode, "/a/:host/"). */
export function mountPages(deps: Deps): (pages: Hono<Env>) => void {
  const limits = createPasswordLimits(deps.now ?? Date.now);
  return (pages) => {
    const homeError = registerHome(pages, deps);
    registerHq(pages, deps, homeError, limits);
    registerTrooper(pages, deps);
    registerLevelUp(pages, deps);
    registerAdd(pages, deps);
    registerOpp(pages, deps);
    registerBattle(pages, deps);
    registerMission(pages, deps);
    registerHistory(pages, deps);
    registerProtect(pages, deps, limits);
  };
}
