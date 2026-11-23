import { fnv1a } from "./hash.ts";
import { fillerArmy, fillerId } from "./fillers.ts";

export type ArmyRef = { id: string; power: number; isFiller?: boolean };

export const OPPONENT_COUNT = 5;

// First power window = 10 % of max(own power, 10); it doubles until every candidate is covered.
const FIRST_WINDOW = 0.1;

/**
 * The 5 opponents shown on the home page for (day, client): real armies of the closest power first, then
 * generated fillers around the own power. Stable for a given (day, client) and inputs.
 * UNVERIFIED: the original rule is unknown (wiki: "near power"; late-era archived lists were not tight);
 * window 10 % of the own power, doubled until 5 are found, order inside a window by hash(day|clientId|id), fillers within ±20 %.
 */
export function pickOpponents(p: { self: ArmyRef; candidates: ArmyRef[]; day: string; clientId: string }): ArmyRef[] {
  const key = (id: string): number => fnv1a(`${p.day}|${p.clientId}|${id}`);
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
  const maxDist = pool.reduce((m, c) => Math.max(m, dist(c)), 0);
  let lo = -1; // previous window edge: each ring holds the candidates not yet considered
  for (let w = FIRST_WINDOW * base; picked.length < OPPONENT_COUNT && lo < maxDist; w *= 2) {
    const ring = pool.filter((c) => dist(c) > lo && dist(c) <= w).sort((a, b) => key(a.id) - key(b.id) || (a.id < b.id ? -1 : 1));
    for (const c of ring) if (picked.length < OPPONENT_COUNT) picked.push({ id: c.id, power: c.power });
    lo = w;
  }
  for (let slot = 0; picked.length < OPPONENT_COUNT; slot++) {
    const h = key(`filler#${slot}`);
    const power = Math.max(5, Math.round(p.self.power * (0.8 + 0.4 * ((h % 1001) / 1000))));
    let seed = h % 2147483647;
    while (picked.some((a) => a.id === fillerId(power, seed))) seed++;
    const f = fillerArmy({ power, seed });
    picked.push({ id: f.id, power: f.power, isFiller: true });
  }
  return picked;
}
