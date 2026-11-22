import type { BattleInput } from "./input/types.ts";

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

export class NotImplemented extends Error {
  constructor(what: string) {
    super(`NotImplemented: ${what}`);
    this.name = "NotImplemented";
  }
}

/** Skeleton: the combat engine is ported task by task (see the etape1 plan). */
export const simulateBattle = (_input: BattleInput): BattleRecord => {
  throw new NotImplemented("simulateBattle");
};
