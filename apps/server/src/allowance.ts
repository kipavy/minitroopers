import type { BattleTrooperInput } from "@mt/engine";
import { atLocal, battleAllowance, dayKey, rechargeTimes, reserveState, weekendEvent, type ReserveState } from "@mt/game";
import type { DatabaseSync } from "node:sqlite";
import type { Config } from "./config.ts";
import { countedBattleTimes, dayOver, trooperInput, troopersOf } from "./repo.ts";

export type Allowance = ReserveState & {
  /** Whether today is a recharge day (weekend drawn with the recharge). */
  regen: boolean;
  /** The day's base allowance (5, +1 per COMMANDEMENT, max 7). */
  base: number;
  /** Recharges still to come today (after `now`). */
  ahead: number;
  /** For dayOver: a recharge is still coming today, so the day is not over. */
  rechargeAhead: boolean;
};

/**
 * Battles an army may fight today at `now`: the base allowance, plus on a recharge weekend the reserve replayed from the
 * counted battles' times (spec 2026-11-25-recharge-week-end-design.md). The single source for fight, /b/opp, the HQ,
 * dayOver and the admin CLI.
 */
export function allowanceOf(db: DatabaseSync, cfg: Config, armyId: number, troopers: readonly BattleTrooperInput[], now: number): Allowance {
  const day = dayKey(new Date(now), cfg.tzGame);
  const regen = weekendEvent(day, cfg.weekendMultiplier).regen;
  const ticks = regen ? rechargeTimes(day, cfg.tzGame) : [];
  const base = battleAllowance(troopers);
  const s = reserveState({ base, battles: countedBattleTimes(db, armyId, day), ticks, now, midnight: atLocal(day, 0, cfg.tzGame) });
  const ahead = ticks.filter((t) => t > now).length;
  return { ...s, regen, base, ahead, rechargeAhead: ahead > 0 };
}

/** Whether today is over for an army at `now` (dayOver with the time-dependent allowance). */
export function dayOverAt(db: DatabaseSync, cfg: Config, armyId: number, now: number): boolean {
  const a = allowanceOf(db, cfg, armyId, troopersOf(db, armyId).map(trooperInput), now);
  return dayOver(db, armyId, dayKey(new Date(now), cfg.tzGame), a);
}
