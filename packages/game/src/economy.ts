import { weekendEvent } from "./weekend.ts";
import { describeTrooper, type BattleTrooperInput } from "@mt/engine";

/** Starting credits. UNVERIFIED: no evidence of a starting grant (original tooltip "Credits: You win these in combat"; $GL uses 100). */
export const STARTING_CREDITS = 0;

const COMMANDEMENT = 69;

/**
 * 5 battles a day, +1 per trooper with COMMANDEMENT (skill 69), max 7. The original gave 3 (+1 each, max 5, recon
 * §2.10); raised for this instance (2026-11-24), the skill still adds at most 2 as its description says.
 */
export function battlesPerDay(troopers: { skills: number[] }[]): number {
  const n = troopers.filter((t) => t.skills.includes(COMMANDEMENT)).length;
  return Math.min(7, 5 + n);
}

/** Battles a day for these troopers (5, +1 per COMMANDEMENT trooper, max 7). */
export const battleAllowance = (troopers: readonly BattleTrooperInput[]): number =>
  battlesPerDay(troopers.map((t) => ({ skills: describeTrooper(t).skills })));

/** Credits won per battle: 2 for a win, 1 otherwise (recon §2.12). */
export function battleReward(win: boolean): number {
  return win ? 2 : 1;
}

/** Bounty for the `recruitIndex`-th recruit (1-based): #1 100, #2-4 50, #5-14 10, #15-34 5, #35+ 0 (recon §2.13). */
export function referralBounty(recruitIndex: number): number {
  if (recruitIndex <= 1) return 100;
  if (recruitIndex <= 4) return 50;
  if (recruitIndex <= 14) return 10;
  if (recruitIndex <= 34) return 5;
  return 0;
}

/** Missions (RECON3 §4/§7). UNVERIFIED: the SWF `Data` constants (5 unlock, 3 tries, 4 reward) are unnamed; mapping presumed. */
export const MISSION_UNLOCK_COST = 5;
export const MISSION_ATTEMPTS = 3;
/** Credits for a won mission, 0 for a lost one. */
export function missionReward(win: boolean): number {
  return win ? 4 : 0;
}

/** Raids and epic (RECON3 §3/§7). UNVERIFIED: `Data` constants 4 / 20 / 100 unnamed; mapping presumed. */
export const RAID_REWARD = 4;
export const RAID_MAX_PHASE = 20;
export const RAID_PER_BATTLE = 100;
export const EPIC_MIN_RECRUITS = 10;
export const EPIC_SIDE_MAX = 32;
export const EPIC_NPC_MAX = 100;
/**
 * Most rats an extermination can oppose (`armies.rats` stops growing there).
 * UNVERIFIED: no cap is known from the original; 100 matches the engine scale of RAID_PER_BATTLE and EPIC_NPC_MAX.
 */
export const RATS_MAX = 100;
export const NPC_SEED_MAX = 100_000;

/** True when the game day `day` ("YYYY-MM-DD") is a Saturday or a Sunday. */
export function isWeekend(day: string): boolean {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 || wd === 6;
}

/** Credits multiplier of a reward won on game day `day`: `weekend` when the weekend's drawn formula has the ×3, 1 otherwise. */
export function rewardMultiplier(day: string, weekend: number): number {
  return weekendEvent(day, weekend).x3 ? weekend : 1;
}

/** Default exponent of the level-up price (LEVEL_COST_EXPONENT). The original `Data.levelCost` uses 2.5. */
export const LEVEL_COST_EXPONENT = 2;

/**
 * Cost of the next level-up of a trooper with `choicesLength` choices: `int((n+1)^exponent)`, the shape of the original
 * `Data.levelCost` with a softer default exponent on this instance (2 instead of 2.5, 2026-11-28: at ~40 credits a day a
 * level-21 trooper took 50 days per level). The total stays cubic, so spreading levels beats stacking one trooper.
 */
export function levelUpCost(choicesLength: number, exponent: number = LEVEL_COST_EXPONENT): number {
  return Math.pow(choicesLength + 1, exponent) | 0;
}
