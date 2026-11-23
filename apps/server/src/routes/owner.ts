import type { Context } from "hono";
import { armyPower, type BattleTrooperInput } from "@mt/engine";
import { prevDay } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { armyByHost, armyById, troopersOf, trooperInput, type ArmyRow, type TrooperRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { missingPage } from "../views/soon.ts";
import { queryParam } from "../session.ts";

export interface Owned {
  army: ArmyRow;
  rows: TrooperRow[];
  troopers: BattleTrooperInput[];
  power: number;
}

/**
 * The army of the request (the one in the URL, else the session's) when the session owns it; otherwise the response
 * to send instead: 404 for an unknown army, a redirect to the army's HQ (password form when protected) for a stranger.
 * Action routes call this first, so nothing a stranger sends ever reaches the database.
 */
export function ownedArmy(deps: Deps, c: Context<Env>): Owned | Response {
  const { cfg, db } = deps;
  const h = c.get("armyHost");
  const session = c.get("session");
  const army = h !== null ? armyByHost(db, h) : session.armyId === null ? null : armyById(db, session.armyId);
  if (!army) return c.html(String(missingPage(cfg, "Armée introuvable")), 404);
  if (session.armyId !== army.id) return c.redirect(armyUrl(cfg, army.host, "/hq"));
  return withTroopers(deps, army);
}

/**
 * Day of the battle a view route shows: `?d=YYYY-MM-DD` when it is today or yesterday, else today. A try or raid fought
 * at 23:59:59 redirects with its day, so its first view still works after midnight. Callers look the battle up among
 * the session army's own battles only, and the first-view reward message stays single-shot (`markSeen`).
 */
export function viewDay(c: Context<Env>, today: string): string {
  const d = queryParam(c, "d");
  return d !== undefined && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d) && (d === today || d === prevDay(today)) ? d : today;
}

/** Fresh view data of an army (call again after a change). */
export function withTroopers(deps: Deps, army: ArmyRow): Owned {
  const rows = troopersOf(deps.db, army.id);
  const troopers = rows.map(trooperInput);
  return { army, rows, troopers, power: armyPower(troopers) };
}

/** Slot of a `/t/:n` style path parameter. */
export const slotOf = (c: Context<Env>): number => Number((c.req.param() as Record<string, string>).n);
