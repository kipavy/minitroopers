import { fnv1a } from "./hash.ts";
import { fillerArmy, fillerId } from "./fillers.ts";

export type ArmyRef = { id: string; power: number; isFiller?: boolean };

export const OPPONENT_COUNT = 5;

// First power window = 10 % of max(own power, 10); it doubles up to MAX_WINDOW, never beyond.
const FIRST_WINDOW = 0.1;
// Real armies farther than 50 % of max(own power, 10) are never shown: the slots go to fillers instead
// (spec: fillers "à Power comparable … quand il manque des armées réelles"). Without a bound, the six faction
// armies (power 114, seeded at first start) took every slot of a new power-5 army.
const MAX_WINDOW = 0.5;

/**
 * The 5 opponents shown on the home page for (day, client): real armies of the closest power first, then
 * generated fillers around the own power. Stable for a given (day, client) and inputs.
 * UNVERIFIED: the original rule is unknown (wiki: "near power"; late-era archived lists were not tight);
 * window 10 % of the own power, doubled until 5 are found but capped at ±50 % (a real army farther than that is never picked,
 * fillers take the slots), order inside a window by hash(day|clientId|id), fillers within ±20 %.
 */
export function pickOpponents(p: { self: ArmyRef; candidates: ArmyRef[]; day: string; clientId: string; salt?: string }): ArmyRef[] {
  // `salt` (admin reset-day): another draw for the same day; absent, the original derivation.
  const key = (id: string): number => fnv1a(p.salt ? `${p.day}|${p.clientId}|${p.salt}|${id}` : `${p.day}|${p.clientId}|${id}`);
  const seen = new Set<string>([p.self.id]);
  const pool: ArmyRef[] = [];
  for (const c of p.candidates) {
    if (c.isFiller || seen.has(c.id)) continue;
    seen.add(c.id);
    pool.push(c);
  }
  const base = Math.max(p.self.power, 10);
  const dist = (c: ArmyRef): number => Math.abs(c.power - p.self.power);
  const picked: ArmyRef[] = [];
  const cap = MAX_WINDOW * base;
  let lo = -1; // previous window edge: each ring holds the candidates not yet considered
  for (let w = FIRST_WINDOW * base; picked.length < OPPONENT_COUNT && lo < cap; w = Math.min(w * 2, cap)) {
    const ring = pool.filter((c) => dist(c) > lo && dist(c) <= w).sort((a, b) => key(a.id) - key(b.id) || (a.id < b.id ? -1 : 1));
    for (const c of ring) if (picked.length < OPPONENT_COUNT) picked.push({ id: c.id, power: c.power });
    lo = w;
  }
  return fillUp(picked, p.self.power, key);
}

/** Completes `picked` up to OPPONENT_COUNT with generated armies within ±20 % of `power` (slots hashed with `key`). */
function fillUp(picked: ArmyRef[], power: number, key: (id: string) => number): ArmyRef[] {
  for (let slot = 0; picked.length < OPPONENT_COUNT; slot++) {
    const h = key(`filler#${slot}`);
    const p = Math.max(5, Math.round(power * (0.8 + 0.4 * ((h % 1001) / 1000))));
    let seed = h % 2147483647;
    while (picked.some((a) => a.id === fillerId(p, seed))) seed++;
    const f = fillerArmy({ power: p, seed });
    picked.push({ id: f.id, power: f.power, isFiller: true });
  }
  return picked;
}

/**
 * Opponents of the training page (/b/train): OPPONENT_COUNT drawn uniformly (order by hash(seed|id)) among the real
 * armies other than `self` whose power is between half and double max(own power, 10), completed by generated armies
 * like pickOpponents. A new `seed` at each visit gives a new draw ("Autres adversaires").
 */
export function pickTrainingOpponents(p: { self: ArmyRef; candidates: ArmyRef[]; seed: string }): ArmyRef[] {
  const key = (id: string): number => fnv1a(`${p.seed}|${id}`);
  const base = Math.max(p.self.power, 10);
  const seen = new Set<string>([p.self.id]);
  const pool: ArmyRef[] = [];
  for (const c of p.candidates) {
    if (c.isFiller || seen.has(c.id) || c.power < base / 2 || c.power > base * 2) continue;
    seen.add(c.id);
    pool.push(c);
  }
  pool.sort((a, b) => key(a.id) - key(b.id) || (a.id < b.id ? -1 : 1));
  return fillUp(pool.slice(0, OPPONENT_COUNT).map((c) => ({ id: c.id, power: c.power })), p.self.power, key);
}
