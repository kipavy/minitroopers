import { Rand } from "@mt/engine";
import { EPIC_MIN_RECRUITS } from "./economy.ts";
import { fnv1a } from "./hash.ts";
import type { ArmyRef } from "./opponents.ts";

export type MissionType = "exterminate" | "infiltrate" | "epic";

/**
 * Mission of the day. UNVERIFIED: the original rule is unknown (one type per day, RECON3 §4); with >= 10 recruits
 * epic one day in three, otherwise exterminate / infiltrate equally.
 */
export function missionOfDay(p: { day: string; armyId: number; recruits: number; salt: string }): MissionType {
  const h = fnv1a(`${p.day}|${p.armyId}|mission|${p.salt}`);
  if (p.recruits >= EPIC_MIN_RECRUITS) return (["exterminate", "infiltrate", "epic"] as const)[h % 3]!;
  return h % 2 === 0 ? "exterminate" : "infiltrate";
}

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
