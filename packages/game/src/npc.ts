import { Data, Rand } from "@mt/engine";
import type { BattleArmyInput } from "@mt/engine";
import { NPC_SEED_MAX } from "./economy.ts";
import { trooperName } from "./names.ts";

/**
 * Levels of a generated army: port of $GL generateRandomArmyComposition (levels start at 1, power = Σ(4 + level),
 * trooper count between max(min, ceil(power/54)) and min(max, floor(power/5)), level cap 50, then a mostly-descending shuffle).
 */
export function armyComposition(power: number, min: number, max: number, rand: Rand): number[] {
  const absMin = Math.ceil(power / 54);
  const absMax = Math.max(1, Math.floor(power / 5));
  let lo = Math.ceil(Math.max(min, absMin));
  const hi = Math.floor(Math.min(max, absMax));
  if (hi < lo) lo = hi;
  const n = lo + rand.random(hi - lo + 1);
  let remaining = power - 5 * n;
  const levels = new Array<number>(n).fill(1);
  while (remaining > 0) {
    const avail: number[] = [];
    levels.forEach((l, i) => { if (l < 50) avail.push(i); });
    if (avail.length === 0) break;
    levels[avail[rand.random(avail.length)]!]!++;
    remaining--;
  }
  return levels.sort((a, b) => (rand.random(100) < 80 ? b - a : a - b));
}

/**
 * NPC army of raids and epic missions (RECON3 §2): human troopers, seed < NPC_SEED_MAX, random 0/1 choices,
 * `force: []`, default pref (leftOver [] keeps every item), random faction.
 * UNVERIFIED: draw order and the 0/1 choice distribution (archived NPCs only show 0/1 values).
 */
export function npcArmy(p: { power: number; min: number; max: number; seed: number; firstId: number }): BattleArmyInput {
  const rand = new Rand(p.seed);
  const levels = armyComposition(p.power, p.min, p.max, rand);
  const troopers = levels.map((level, i) => {
    const seed = rand.random(NPC_SEED_MAX);
    const choices: number[] = [];
    for (let c = 1; c < level; c++) choices.push(rand.random(2));
    return { id: p.firstId + i, name: trooperName(rand), seed, type: 0, choices, force: [] as number[], pref: { ...Data.defaultPref(), leftOver: [] } };
  });
  return { faction: rand.random(6), spawnOrder: [], troopers };
}
