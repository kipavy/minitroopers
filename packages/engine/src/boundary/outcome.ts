// Stage-2 boundary: the server-side result of a battle (the browser replays the same input in the SWF).
import type { BattleInput } from "../input/types.ts";
import { Battle } from "../logic/battle.ts";
import { InvalidBattleInput, validateBattleInput } from "./validate.ts";

export interface BattleOutcome {
  /** Winning side, `null` when the battle stops at `btime > 50000` without a winner. */
  winner: 0 | 1 | null;
  /** Ids of the dead troopers (SWF graveyard order). */
  graveyard: number[];
  /** Ids of the deployed troopers, in deploy order (one per oracle `TRP` line). */
  deployed: number[];
  /** Number of `Battle.history` events. */
  events: number;
}

/** Validates (throws `InvalidBattleInput`), then runs the whole battle exactly like the SWF. */
export const simulateOutcome = (input: BattleInput): BattleOutcome => {
  const v = validateBattleInput(input);
  if (!v.ok) throw new InvalidBattleInput(v.errors);
  const r = new Battle(input).run();
  return {
    winner: r.winner,
    graveyard: [...r.graveyard],
    deployed: r.troopers.map((t) => t.id),
    events: r.events.length,
  };
};
