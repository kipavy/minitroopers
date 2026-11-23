import { Data, Rand } from "@mt/engine";
import type { BattleArmyInput } from "@mt/engine";
import { NPC_SEED_MAX } from "./economy.ts";
import { fnv1a } from "./hash.ts";

/** $GL RatSkills (RECON3 §2). */
export const RAT_SKILLS: readonly number[] = [112, 55, 70, 76, 79, 97, 74, 53, 114, 117, 123, 116, 131, 137];

export type RatSpec = { seed: number; force: [number, number] };

/** The rats of the day: identical for the 3 tries (hash of day|armyId|rats|salt). UNVERIFIED: derivation is ours. */
export function dayRats(p: { day: string; armyId: number; count: number; salt: string }): RatSpec[] {
  const rand = new Rand(fnv1a(`${p.day}|${p.armyId}|rats|${p.salt}`));
  const out: RatSpec[] = [];
  for (let i = 0; i < p.count; i++) {
    const seed = rand.random(NPC_SEED_MAX);
    const a = rand.random(RAT_SKILLS.length);
    let b = rand.random(RAT_SKILLS.length - 1);
    if (b >= a) b++;
    out.push({ seed, force: [RAT_SKILLS[a]!, RAT_SKILLS[b]!] });
  }
  return out;
}

/** Rat army (RECON3 §2): faction 0, spawnOrder [], troopers "rat" of TrooperType 2, no choices, default pref. */
export function ratArmy(rats: readonly RatSpec[], firstId: number): BattleArmyInput {
  return {
    faction: 0,
    spawnOrder: [],
    troopers: rats.map((r, i) => ({ id: firstId + i, name: "rat", seed: r.seed, type: 2, choices: [], force: [...r.force], pref: { ...Data.defaultPref(), leftOver: [] } })),
  };
}
