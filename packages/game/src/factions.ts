import type { BattleArmyInput } from "@mt/engine";
import data from "../data/factions.json" with { type: "json" };

export type FactionTrooper = { id: number; name: string; seed: number; level: number };
export type Faction = {
  id: number;
  /** Display name without the "L'armée <article>" prefix. */
  name: string;
  /** Article index (0 de, 1 d', 2 du, 3 de la, 4 des, 5 none) as in the army-creation form. */
  part: number;
  host: string;
  troopers: FactionTrooper[];
  /** false = roster not recovered from an archived page (generated, see docs/game/unverified.md). */
  verified: boolean;
};

// Rosters 0,1,2,4,5 decoded from the archived /b/fview pages of the faction subdomains (recon §2.15).
// UNVERIFIED: faction 3 ("Torses velus") was never archived; its roster is generated (scripts/gen-faction3.ts)
// and its faction number and article (part 4, "des") are guesses.
export const FACTIONS: readonly Faction[] = data;

/** The faction army as battle input: levels 20,18..10 = choices all 0 of length level-1, pref null, `__UP2` = 0..5. */
export function factionBattleArmy(f: Faction): BattleArmyInput {
  return {
    faction: f.id,
    spawnOrder: f.troopers.map((t) => t.id),
    troopers: f.troopers.map((t) => ({
      id: t.id,
      name: t.name,
      seed: t.seed,
      type: 0,
      choices: new Array<number>(t.level - 1).fill(0),
      force: [],
      pref: null,
    })),
  };
}
