import type { BattleInput } from "./input/types.ts";
import { Battle } from "./logic/battle.ts";

export interface TrooperSnapshot {
  id: number;
  side: 0 | 1;
  /** Full `TRP …` trace line, prefix included. */
  line: string;
}

export interface BattleRecord {
  /** One per `TRP` line, in emission (deploy) order. */
  troopers: TrooperSnapshot[];
  /** Full `EV …` trace lines, prefix included, in `Battle.history` order. */
  events: string[];
  /** `null` when the battle stops at `btime > 50000` without a winner. */
  winner: 0 | 1 | null;
  graveyard: number[];
}

/** Runs the battle like the SWF's Game (`resolve()` until true) and renders the oracle trace. */
export const simulateBattle = (input: BattleInput): BattleRecord => new Battle(input).run();

/**
 * Verification-harness cap (oracle:diff, golden tests): the number of `resolve()` steps after
 * which a battle is aborted. Not a game rule, the SWF has no cap: `simulateBattle` never stops
 * early. The longest golden takes ~1 000 steps; a stalemate (`btime > 50000`) far fewer than
 * this. A step that never returns (an infinite loop inside one `resolve()`) is not caught.
 */
export const DEFAULT_MAX_STEPS = 500_000;

export class StepCapExceeded extends Error {
  readonly steps: number;
  readonly btime: number;
  constructor(steps: number, btime: number) {
    super(`StepCapExceeded: battle still running after ${steps} resolve() steps (btime ${btime})`);
    this.name = "StepCapExceeded";
    this.steps = steps;
    this.btime = btime;
  }
}

/** `simulateBattle` with a step cap: throws `StepCapExceeded` instead of looping forever. */
export const simulateBattleCapped = (input: BattleInput, maxSteps: number = DEFAULT_MAX_STEPS): BattleRecord => {
  const b = new Battle(input);
  let steps = 0;
  while (!b.resolve()) {
    if (++steps >= maxSteps) throw new StepCapExceeded(steps, b.btime);
  }
  return b.record();
};
