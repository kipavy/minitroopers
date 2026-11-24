import type { DatabaseSync } from "node:sqlite";
import { armyPower, type BattleArmyInput, type BattleTrooperInput } from "@mt/engine";
import { FACTIONS, factionBattleArmy, fillerArmy, fillerBattleArmy, host as hostOf, parseFillerId } from "@mt/game";
import { battleTroopers } from "./deploy.ts";
import { armyByHost, armyById } from "./repo.ts";
import { isValidHost } from "./urls.ts";
import { armyTitle } from "./views/army.ts";

/**
 * A defender: a stored army (`defenderId`), or one rebuilt from `ref` and never stored — a generated army
 * ("filler:<power>:<seed>") or a faction army that is not seeded in the database ("faction:<host>").
 */
export interface Foe {
  defenderId: number | null;
  defenderRef: string | null;
  /** "L'armée de X" (plain text). */
  title: string;
  /** The army name alone ("X"). */
  name: string;
  faction: number;
  power: number;
  army: BattleArmyInput;
}

const stored = (db: DatabaseSync, id: number): Foe | null => {
  const a = armyById(db, id);
  if (!a) return null;
  // Deployment order (RECON4 §3): listed and spawned in that order as a defender too.
  // UNVERIFIED: the /b/opp grids also show stored armies in deploy order; no archived opponent list shows a reordered army.
  const troopers: BattleTrooperInput[] = battleTroopers(db, a.id);
  if (troopers.length === 0) return null;
  return {
    defenderId: a.id,
    defenderRef: null,
    title: armyTitle(a.name, a.part),
    name: a.name,
    faction: a.faction,
    power: armyPower(troopers),
    army: { faction: a.faction, spawnOrder: troopers.map((t) => t.id), troopers },
  };
};

/** Resolves an opponent id of the daily list (army id or filler id), or a battle's `defender_ref`. */
export function foeOf(db: DatabaseSync, ref: string): Foe | null {
  if (/^[0-9]{1,15}$/.test(ref)) return stored(db, Number(ref));
  const fill = parseFillerId(ref);
  if (fill) {
    const f = fillerArmy(fill);
    if (f.id !== ref) return null; // not canonical (e.g. power below the minimum)
    return { defenderId: null, defenderRef: f.id, title: armyTitle(f.name, f.part), name: f.name, faction: f.faction, power: f.power, army: fillerBattleArmy(f) };
  }
  const m = /^faction:([a-z0-9-]{1,40})$/.exec(ref);
  const fac = m ? FACTIONS.find((x) => x.host === m[1]) : undefined;
  if (fac) {
    const army = factionBattleArmy(fac);
    return { defenderId: null, defenderRef: `faction:${fac.host}`, title: armyTitle(fac.name, fac.part), name: fac.name, faction: fac.id, power: armyPower(army.troopers), army };
  }
  return null;
}

/** "Infiltre la base d'une armée de ton choix" : a stored army by name (like the login form), else a faction army. */
export function foeByName(db: DatabaseSync, name: unknown): Foe | null {
  if (typeof name !== "string" || name.length > 100) return null;
  const h = hostOf(name);
  if (!isValidHost(h)) return null;
  const a = armyByHost(db, h);
  if (a) return stored(db, a.id);
  return FACTIONS.some((f) => f.host === h) ? foeOf(db, `faction:${h}`) : null;
}

/** Name alone of the defender of a stored battle, null if unknown or deleted (`gone:<name>`: shown as unknown, like defenderTitle). */
export function defenderName(db: DatabaseSync, b: { defenderId: number | null; defenderRef: string | null }): string | null {
  if (b.defenderId !== null) {
    const a = armyById(db, b.defenderId);
    if (a) return a.name;
  }
  if (b.defenderRef === null) return null;
  return foeOf(db, b.defenderRef)?.name ?? null;
}

/** Title of the defender of a stored battle (its army, or the rebuilt filler / faction). */
export function defenderTitle(db: DatabaseSync, b: { defenderId: number | null; defenderRef: string | null }): string {
  if (b.defenderId !== null) {
    const a = armyById(db, b.defenderId);
    if (a) return armyTitle(a.name, a.part);
  }
  return (b.defenderRef !== null ? foeOf(db, b.defenderRef)?.title : undefined) ?? "L'armée inconnue";
}
