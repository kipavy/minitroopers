import { levelUpOptions } from "@mt/engine";

const SEED_MIN = 273018;

/** Seeds >= `from` whose first level-up offers `skill` (fresh human trooper, no choices). */
export function seedsOffering(skill: number, count: number, from = SEED_MIN): number[] {
  const out: number[] = [];
  for (let seed = from; out.length < count; seed++) {
    const o = levelUpOptions({ id: 0, name: "x", seed, type: 0, choices: [], force: [], pref: null });
    if (o.shown.includes(skill)) out.push(seed);
  }
  return out;
}
