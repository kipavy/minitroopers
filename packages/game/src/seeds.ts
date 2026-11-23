import { levelUpOptions } from "@mt/engine";

const SEED_MIN = 273018;

/**
 * Seeds >= `from` whose first level-up offers `skill` (fresh human trooper, no choices). Throws a RangeError after
 * `max` seeds examined (a skill no first level-up offers would loop forever).
 */
export function seedsOffering(skill: number, count: number, from = SEED_MIN, max = 1_000_000): number[] {
  const out: number[] = [];
  for (let seed = from; out.length < count; seed++) {
    if (seed - from >= max) throw new RangeError(`seedsOffering: ${count} seed(s) offering skill ${skill} not found in ${max} seeds from ${from}`);
    const o = levelUpOptions({ id: 0, name: "x", seed, type: 0, choices: [], force: [], pref: null });
    if (o.shown.includes(skill)) out.push(seed);
  }
  return out;
}
