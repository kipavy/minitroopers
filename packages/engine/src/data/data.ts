// swf: Data (§\x17@E{§) — static helpers and the hard-coded lists of its static init (§Z(Hf\x02§).
import { SKILLS, VEHICLES } from "./enums.ts";
import { COM_ROWS, SKILL_ROWS, STATUS_ROWS, VEHICULE_ROWS, WEAPON_ROWS } from "./swfTables.gen.ts";
import type { ComRow, SkillRow, StatusRow, VehiculeRow, WeaponRow } from "./swfTables.gen.ts";

export type { ComRow, SkillRow, StatusRow, VehiculeRow, WeaponRow };

/** Freezes a table and everything it holds: Data is shared, read-only state (any write throws). */
const deepFreeze = <T>(v: T): T => {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
};

/** `Data.SKILL` (§\x05\x04;|§), indexed by Skill. */
export const SKILL: readonly SkillRow[] = deepFreeze(SKILL_ROWS);
/** `Data.WEAPONS` (§\x04jT1\x01§), indexed by Weapon. */
export const WEAPON: readonly WeaponRow[] = deepFreeze(WEAPON_ROWS);
/** `Data.VEHICULES` (§\x01\x10\r\x03\x01§), indexed by Vehicule. */
export const VEHICULE: readonly VehiculeRow[] = deepFreeze(VEHICULE_ROWS);
/** `Data.STATUS` (§@)Z@§), indexed by Status. */
export const STATUS: readonly StatusRow[] = deepFreeze(STATUS_ROWS);
/** `Data.COMS` (§}}*h§), indexed by Com. */
export const COMS: readonly ComRow[] = deepFreeze(COM_ROWS);

/**
 * Accessor that throws on a missing element. Use it only where AS3 throws too, i.e. a field read
 * on the element (`Data.SKILL[i].field` → TypeError on null). `int(array[i])` does NOT throw in
 * AS3 (int(undefined) = 0): such sites must read `?? 0` instead.
 */
export const at = <T>(a: readonly T[], i: number): T => {
  const v = a[i];
  if (v === undefined) throw new RangeError(`index ${i} out of ${a.length}`);
  return v;
};

export const skillRow = (skill: number): SkillRow => at(SKILL, skill);

/** `Data.XMAX` (§\x0eg\x06O§) / `Data.YMAX` (§H\x01qr§). */
export const XMAX = 14;
export const YMAX = 5;

/** `Data.§x\x1bc\x19\x01§` ($GL `_obf_1afae07b`): deploy-square order. */
export const DEPLOY_ORDER: readonly number[] = deepFreeze([
  2, 1, 3, 7, 6, 8, 12, 11, 13, 0, 4, 5, 9, 10, 14, 17, 16, 18, 15, 19, 22, 21, 23, 20, 24, 27, 26, 28, 25, 29, 32,
  31, 33, 30, 34, 37, 36, 38, 35, 39, 42, 41, 43, 40, 44,
]);

/** `Data.§S\x18\x16^§` ($GL `_obf_1b788964`). */
export const XP_LEVELS: readonly number[] = deepFreeze([0, 8, 24, 60, 120, 200, 340, 500, 720, 1000, 1300, 2000]);

/** `Data.§PyFL\x02§` (BODY_LOC): every BodyLoc, constructor order. */
export const BODY_LOC: readonly number[] = deepFreeze([0, 1, 2, 3, 4, 5, 6, 7]);

/**
 * `Data.§P\x01z\x12\x02§` ($GL `_obf_c630e187`): Skill.(\x149N\x01, HaHO, \x03\x1cz-\x03, X\x1fU =
 * PISTOL, SHOTGUN, ASSAULT_RIFLE, SNIPER — the starting weapons a HUMAN Ghost draws one of.
 */
export const START_WEAPON_SKILLS: readonly number[] = deepFreeze([SKILLS.PISTOL, SKILLS.SHOTGUN, SKILLS.ASSAULT_RIFLE, SKILLS.SNIPER]);

/**
 * `Data.§nb;\x13\x02§`: SkillCategory kP|r, SXJJ, \x18iJ\f, y0\rQ, a(c=, f[B, \b-\x17\x07 (indexes 0, 5..10).
 */
export const CATEGORY_ORDER: readonly number[] = deepFreeze([0, 5, 6, 7, 8, 9, 10]);

/**
 * `Data.§\x06\rQS\x02§(skill)`: `createEnum(Weapon, getEnumConstructs(Weapon)[2 + skill.index -
 * Skill.§^\td8\x01§.index])`, §^\td8\x01§ = Skill index 9 (REVOLVER).
 */
export const skillWeapon = (skill: number): number => {
  const w = 2 + skill - SKILLS.REVOLVER;
  if (w < 0 || w >= WEAPON.length) throw new RangeError(`no Weapon for skill ${skill}`);
  return w;
};

/** `Data.§iw\x0b&\x03§(skill)`: vehicle granted by a vehicle skill, else null. */
export const skillVehicule = (skill: number): number | null => {
  switch (skill) {
    case 38:
      return VEHICLES.LIGHT_TANK;
    case 39:
      return VEHICLES.MOTO;
    case 40:
      return VEHICLES.FIGHTER_JET;
    case 41:
      return VEHICLES.HELICOPTER;
    case 42:
      return VEHICLES.HEAVY_TANK;
    default:
      return null;
  }
};

/** `Data.§?)$L\x03§`. */
export const levelPlus5 = (n: number): number => (5 + n) | 0;

/** `Data.§\nx/H\x01§`: `int(Math.pow(n + 1, 2.5))`. */
export const levelCost = (n: number): number => Math.pow(n + 1, 2.5) | 0;

/** `Data.§\x03\x01(1\x01§(army)`: Σ (5 + choices.length) over the army's troopers (Player level). */
export const armyLevel = (army: { troopers: readonly { choices: readonly number[] }[] }): number => {
  let s = 0;
  for (const t of army.troopers) s = (s + 5 + t.choices.length) | 0;
  return s;
};

/**
 * Trooper preferences as read by the SWF (enum fields as constructor indexes). `leftOver` holds
 * Skill indexes. Default = `Data.§\x03\x1b8n§()`.
 */
export interface GhostPref {
  CBody: number | null; // §\x1a)\x13=\x01§
  CWeapon: number | null; // §\x0bR\x10\x1b\x02§
  targetSystem: number; // §;uXE§
  /** TargetType: index, plus the Skill parameter of SPECIFIC_CLASS (index 1). */
  targetType: number; // §\x15S\x17?\x03§
  targetClass?: number;
  moveSystem: number; // §\x1dlQK\x03§
  reloadSystem: number; // §\x11!\x0ea\x01§
  leftOver: readonly number[]; // §)0\x19i\x03§
}

/** `Data.§\x03\x1b8n§()`: TargetSystem.§0QCw§ (0), TargetType.§3YX,§ (0), MoveSystem.§}C9g§, ReloadSystem.§\x15Z^\x1d§. */
export const defaultPref = (): GhostPref => ({
  CBody: null,
  CWeapon: null,
  targetSystem: 0,
  targetType: 0,
  moveSystem: MOVE_SYSTEM_DEFAULT,
  reloadSystem: RELOAD_SYSTEM_DEFAULT,
  leftOver: [],
});

/** MoveSystem.§}C9g§ — constructor index 1 (STANDARD). */
export const MOVE_SYSTEM_DEFAULT = 1;
/** ReloadSystem.§\x15Z^\x1d\x01§ — constructor index 2 (DEFAULT). */
export const RELOAD_SYSTEM_DEFAULT = 2;

/** `Lambda.has` (§\x17\x12hD§.§'a|\x01§) without comparator: `==` on each element (enum values compare by index). */
export const has = (a: readonly number[], v: number): boolean => {
  for (const x of a) if (x === v) return true;
  return false;
};

/** Haxe `Array.remove` (§fl@@\x02§): removes the first `==` element; false when absent. */
export const arrayRemove = <T>(a: T[], v: T): boolean => {
  const i = a.indexOf(v);
  if (i === -1) return false;
  a.splice(i, 1);
  return true;
};
