import { Rand } from "@mt/engine";
import { fnv1a } from "./hash.ts";
import type { ArmyRef } from "./opponents.ts";

export type MissionType = "exterminate" | "infiltrate" | "epic";

/**
 * Infiltration target: one time in two among the armies already fought (if any), else uniform among candidates; null if none.
 * UNVERIFIED: wiki only says the choice is "biased".
 */
export function pickInfiltrationTarget(p: { self: string; candidates: ArmyRef[]; fought: readonly string[]; day: string; armyId: number }): ArmyRef | null {
  const all = p.candidates.filter((c) => c.id !== p.self);
  if (all.length === 0) return null;
  const rand = new Rand(fnv1a(`${p.day}|${p.armyId}|infiltrate`));
  const known = all.filter((c) => p.fought.includes(c.id));
  const pool = known.length > 0 && rand.random(2) === 0 ? known : all;
  return pool[rand.random(pool.length)]!;
}
