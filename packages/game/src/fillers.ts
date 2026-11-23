import { Rand } from "@mt/engine";
import type { BattleArmyInput } from "@mt/engine";
import { fnv1a } from "./hash.ts";
import { trooperName } from "./names.ts";

export type FillerTrooper = { id: number; name: string; seed: number; choices: number[] };
/** A generated army (never persisted as an account). `power` = Σ (5 + choices.length), exactly the requested power. */
export type FillerArmy = {
  id: string;
  name: string;
  part: number;
  faction: number;
  power: number;
  troopers: FillerTrooper[];
};

const SEED_MIN = 273018;
const SEED_MAX = 16491340;
const MAX_TROOPERS = 12;
const TROOPER_POWER_TARGET = 40; // bigger armies get more troopers instead of absurd levels
const MIN_POWER = 5;

export const fillerId = (power: number, seed: number): string => `filler:${power}:${seed}`;

/** Inverse of `fillerId`; null when `id` is not a filler id. */
export function parseFillerId(id: string): { power: number; seed: number } | null {
  const m = /^filler:(\d+):(\d+)$/.exec(id);
  return m ? { power: Number(m[1]), seed: Number(m[2]) } : null;
}

/**
 * Deterministic generated army of exactly `power` (min 5). UNVERIFIED: the original had no generated armies
 * (late-era lists were full of power-14 single-trooper armies); composition is ours: n = ceil(power/40) troopers
 * (1..12), power spread evenly over them, choices all 0 (like the factions), names from the corpus generator.
 */
export function fillerArmy(p: { power: number; seed: number }): FillerArmy {
  const power = Math.max(MIN_POWER, Math.floor(p.power));
  const n = Math.min(MAX_TROOPERS, Math.max(1, Math.ceil(power / TROOPER_POWER_TARGET)));
  const extra = power - MIN_POWER * n; // level-ups to distribute
  const rand = new Rand(p.seed);
  const used = new Set<string>();
  const nameOf = (): string => {
    let name = trooperName(rand);
    while (used.has(name)) name = trooperName(rand);
    used.add(name);
    return name;
  };
  const span = SEED_MAX - SEED_MIN + 1;
  const troopers: FillerTrooper[] = [];
  for (let i = 0; i < n; i++) {
    const c = Math.floor(extra / n) + (i < extra % n ? 1 : 0);
    troopers.push({
      id: i,
      name: nameOf(),
      seed: SEED_MIN + (fnv1a(`filler|${p.seed}|${i}`) % span),
      choices: new Array<number>(c).fill(0),
    });
  }
  return {
    id: fillerId(power, p.seed),
    name: nameOf(),
    part: 0,
    faction: rand.random(6),
    power,
    troopers,
  };
}

/** The filler as battle input (HUMAN troopers, pref null, `__UP2` = 0..n-1). */
export function fillerBattleArmy(f: FillerArmy): BattleArmyInput {
  return {
    faction: f.faction,
    spawnOrder: f.troopers.map((t) => t.id),
    troopers: f.troopers.map((t) => ({ id: t.id, name: t.name, seed: t.seed, type: 0, choices: [...t.choices], force: [], pref: null })),
  };
}
