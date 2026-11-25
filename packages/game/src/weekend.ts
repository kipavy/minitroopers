import { atLocal, prevDay } from "./day.ts";
import { isWeekend } from "./economy.ts";
import { fnv1a } from "./hash.ts";

/** The weekend formula: credits ×WEEKEND_MULTIPLIER and/or battles that recharge every 2 h (Killian, 2026-11-25). */
export type WeekendEvent = { x3: boolean; regen: boolean };

/** Battles waiting in the reserve at most. */
export const RESERVE_MAX = 3;
/** One recharge every RECHARGE_EVERY_H hours, from 02:00 to 22:00 local time. */
export const RECHARGE_EVERY_H = 2;

/**
 * The formula of the weekend of `day` (none on weekdays), drawn from its Saturday so that both days and every player get
 * the same one, nothing stored: fnv1a(saturday) % 3 → ×3 + recharge, recharge only, ×3 only; % 2 → recharge or nothing
 * when the multiplier is 1 (×3 disabled).
 */
export function weekendEvent(day: string, multiplier: number): WeekendEvent {
  if (!isWeekend(day)) return { x3: false, regen: false };
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const saturday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0 ? prevDay(day) : day;
  const h = fnv1a(saturday);
  if (multiplier === 1) return { x3: false, regen: h % 2 === 0 };
  return [
    { x3: true, regen: true },
    { x3: false, regen: true },
    { x3: true, regen: false },
  ][h % 3]!;
}

/** The recharge instants of `day`: 02:00, 04:00 … 22:00 local time in `tz`. */
export function rechargeTimes(day: string, tz: string): number[] {
  const out: number[] = [];
  for (let h = RECHARGE_EVERY_H; h < 24; h += RECHARGE_EVERY_H) out.push(atLocal(day, h, tz));
  return out;
}

export type ReserveState = {
  /** Battles that may be fought today in all: counted ones + base left + reserve. */
  allowance: number;
  baseLeft: number;
  reserve: number;
  /** Next recharge filling the reserve, null when none is left today or the reserve is full. */
  nextAt: number | null;
  /** Last recharge (or midnight): the start of the progress bar. */
  prevAt: number;
};

/**
 * Replays the day: recharges (at or before `now`) and counted battles (`created_at`, oldest first) in time order, a
 * recharge first on a tie. A recharge adds 1 to the reserve (max RESERVE_MAX); a battle takes from the base, then from
 * the reserve. Without ticks (no recharge today) the allowance is the base.
 */
export function reserveState(p: { base: number; battles: readonly number[]; ticks: readonly number[]; now: number; midnight: number }): ReserveState {
  let baseLeft = p.base;
  let reserve = 0;
  let prevAt = p.midnight;
  const past = p.ticks.filter((t) => t <= p.now);
  let i = 0;
  for (const b of p.battles) {
    while (i < past.length && past[i]! <= b) {
      reserve = Math.min(RESERVE_MAX, reserve + 1);
      prevAt = past[i++]!;
    }
    if (baseLeft > 0) baseLeft--;
    else reserve = Math.max(0, reserve - 1);
  }
  for (; i < past.length; i++) {
    reserve = Math.min(RESERVE_MAX, reserve + 1);
    prevAt = past[i]!;
  }
  const next = p.ticks.find((t) => t > p.now) ?? null;
  return { allowance: p.battles.length + baseLeft + reserve, baseLeft, reserve, nextAt: reserve < RESERVE_MAX ? next : null, prevAt };
}
