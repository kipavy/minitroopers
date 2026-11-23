import type { Hono } from "hono";
import type { Deps, Env } from "../app.ts";
import { registerHome } from "./home.ts";
import { registerHq } from "./hq.ts";
import { registerTrooper } from "./trooper.ts";
import { registerLevelUp } from "./levelup.ts";
import { registerAdd } from "./add.ts";
import { registerOpp } from "./opp.ts";
import { registerBattle } from "./battle.ts";
import { registerHistory } from "./history.ts";

/** Page routes of the game, mounted on the app sub-app (reachable at "/" and, in path mode, "/a/:host/"). */
export function mountPages(deps: Deps): (pages: Hono<Env>) => void {
  return (pages) => {
    const homeError = registerHome(pages, deps);
    registerHq(pages, deps, homeError);
    registerTrooper(pages, deps);
    registerLevelUp(pages, deps);
    registerAdd(pages, deps);
    registerOpp(pages, deps);
    registerBattle(pages, deps);
    registerHistory(pages, deps);
  };
}
