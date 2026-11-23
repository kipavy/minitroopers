import type { DatabaseSync } from "node:sqlite";
import type { BattleTrooperInput } from "@mt/engine";
import { recruitLeaders, saveDeployOrder, storedDeployOrder, trooperInput, troopersOf } from "./repo.ts";

/**
 * Deployment order of an army (`/choice`, RECON4 §3): the trooper slots in the order its troopers are listed and spawn
 * in every new battle, as attacker and as defender. NULL ⇒ slot order. UNVERIFIED: a slot missing from the stored order
 * (a trooper bought after the last `/save`) goes to the end, in slot order.
 */
export function deployOrder(db: DatabaseSync, armyId: number): number[] {
  const slots = troopersOf(db, armyId).map((t) => t.slot);
  return orderOf(slots, storedDeployOrder(db, armyId));
}

const orderOf = (slots: readonly number[], stored: readonly number[] | null): number[] => {
  const have = new Set(slots);
  const out: number[] = [];
  for (const s of stored ?? []) if (have.delete(s)) out.push(s);
  return [...out, ...slots.filter((s) => have.has(s))];
};

/** Stores a deployment order; false (nothing stored) unless `slots` is exactly a permutation of the army's slots. */
export function setDeployOrder(db: DatabaseSync, armyId: number, slots: readonly number[]): boolean {
  return saveDeployOrder(db, armyId, slots, (have) => {
    if (have.length === 0 || slots.length !== have.length) return false;
    const want = new Set(have);
    return slots.every((s) => want.delete(s)) && want.size === 0;
  });
}

/** The army's troopers as a BattleInput side sees them (ids = slots), in deployment order. */
export function battleTroopers(db: DatabaseSync, armyId: number): BattleTrooperInput[] {
  const rows = troopersOf(db, armyId);
  const bySlot = new Map(rows.map((t) => [t.slot, t]));
  return orderOf(rows.map((t) => t.slot), storedDeployOrder(db, armyId)).map((s) => trooperInput(bySlot.get(s)!));
}

/**
 * First trooper of every confirmed recruit (stored pref kept), level descending then recruit army id descending
 * (RECON4 §1.3, fr/load_pos_0_count_16.html).
 */
export function recruitsByLevel(db: DatabaseSync, armyId: number): { armyId: number; trooper: BattleTrooperInput }[] {
  return recruitLeaders(db, armyId)
    .map((t) => ({ armyId: t.armyId, trooper: trooperInput(t) }))
    .sort((a, b) => b.trooper.choices.length - a.trooper.choices.length || b.armyId - a.armyId);
}
