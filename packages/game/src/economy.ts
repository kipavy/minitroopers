/** Starting credits. UNVERIFIED: no evidence of a starting grant (original tooltip "Credits: You win these in combat"; $GL uses 100). */
export const STARTING_CREDITS = 0;

const COMMANDEMENT = 69;

/** 3 battles a day, +1 per trooper with COMMANDEMENT (skill 69), max 5 (recon §2.10). */
export function battlesPerDay(troopers: { skills: number[] }[]): number {
  const n = troopers.filter((t) => t.skills.includes(COMMANDEMENT)).length;
  return Math.min(5, 3 + n);
}

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
