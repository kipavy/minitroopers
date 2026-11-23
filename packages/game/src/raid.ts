import { EPIC_SIDE_MAX } from "./economy.ts";

/** $GL calculateRaidPower, i = phase - 1 (RECON3 §3). */
export function raidPower(phase: number): number {
  const i = phase - 1;
  return Math.round(0.07556333 * i ** 3 + 2.28671329 * i ** 2 + 1.07362082 * i + 11.1958042);
}

/** $GL getRaidTrooperRange. */
export function raidTrooperRange(phase: number): { min: number; max: number } {
  if (phase <= 2) return { min: 1, max: 2 };
  const t: Record<number, [number, number]> = { 3: [1, 4], 4: [3, 6], 5: [4, 9], 6: [7, 13], 7: [10, 16], 8: [16, 24], 9: [19, 29], 10: [29, 32] };
  const r = t[phase];
  return r ? { min: r[0], max: r[1] } : { min: EPIC_SIDE_MAX, max: EPIC_SIDE_MAX };
}

/** Epic mission NPC power after `wins` won epics. UNVERIFIED: growth presumed equal to the raid curve, starting at phase 11 (power 326 ~ the archived 325). */
export function epicPower(wins: number): number {
  return raidPower(wins + 11);
}
