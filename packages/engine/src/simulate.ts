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

export class NotImplemented extends Error {
  constructor(what: string) {
    super(`NotImplemented: ${what}`);
    this.name = "NotImplemented";
  }
}

/** Runs the battle like the SWF's Game (`resolve()` until true) and renders the oracle trace. */
export const simulateBattle = (input: BattleInput): BattleRecord => new Battle(input).run();
