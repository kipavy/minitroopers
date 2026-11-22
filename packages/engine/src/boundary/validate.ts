// Stage-2 boundary: checks a BattleInput before it reaches the battle (server side), so that a
// malformed input is rejected with readable messages instead of crashing or diverging from the SWF.
import { BODY_LOC, SKILL, WEAPON } from "../data/data.ts";
import type { BattleInput, BattleTrooperInput, TrooperPref } from "../input/types.ts";
import { Ghost } from "../logic/ghost.ts";
import { toGhostData } from "../logic/trooperGen.ts";

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

export class InvalidBattleInput extends Error {
  readonly errors: readonly string[];
  constructor(errors: readonly string[]) {
    super(`InvalidBattleInput: ${errors.join("; ")}`);
    this.name = "InvalidBattleInput";
    this.errors = errors;
  }
}

/** Maximum trooper name length, in UTF-16 code units (original creation/recruit forms: maxlength 20). */
export const MAX_NAME_LENGTH = 20;

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const BACKGROUND_COUNT = 5; // BackgroundType: GARDEN, ATTIC, SEWER, ROAD, WOOD
// UNVERIFIED: the SWF range of `faction` (army colour) is unknown; 0..5 = the six factions seen.
const FACTION_MAX = 5;
const TARGET_SYSTEM_COUNT = 4;
const MOVE_SYSTEM_COUNT = 3;
const RELOAD_SYSTEM_COUNT = 4;

const isInt32 = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= INT32_MIN && (v as number) <= INT32_MAX;
const inRange = (v: unknown, lo: number, hi: number): v is number =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const show = (v: unknown): string => (typeof v === "string" ? JSON.stringify(v) : String(v));
const isSkill = (v: unknown): v is number => inRange(v, 0, SKILL.length - 1);

/** True when `s` has no lone surrogate (String.prototype.isWellFormed). */
const isWellFormed = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
};

const checkSkillList = (errors: string[], path: string, list: unknown): void => {
  if (!Array.isArray(list)) {
    errors.push(`${path}: not an array`);
    return;
  }
  list.forEach((s, i) => {
    if (!isSkill(s)) errors.push(`${path}[${i}]: ${show(s)} is not a Skill index (0..${SKILL.length - 1})`);
  });
};

const checkPref = (errors: string[], path: string, p: TrooperPref): void => {
  if (p.CWeapon !== null && !inRange(p.CWeapon, 0, WEAPON.length - 1)) {
    errors.push(`${path}.CWeapon: ${show(p.CWeapon)} is not null or a Weapon index (0..${WEAPON.length - 1})`);
  }
  if (p.CBody !== null && !inRange(p.CBody, 0, BODY_LOC.length - 1)) {
    errors.push(`${path}.CBody: ${show(p.CBody)} is not null or a BodyLoc index (0..${BODY_LOC.length - 1})`);
  }
  if (!inRange(p.targetSystem, 0, TARGET_SYSTEM_COUNT - 1)) {
    errors.push(`${path}.targetSystem: ${show(p.targetSystem)} is not a TargetSystem index (0..${TARGET_SYSTEM_COUNT - 1})`);
  }
  if (p.targetType === 1) {
    if (!isSkill(p.targetClass)) errors.push(`${path}.targetClass: required Skill index when targetType is 1, got ${show(p.targetClass)}`);
  } else if (p.targetType !== 0) {
    errors.push(`${path}.targetType: ${show(p.targetType)} is not 0 (DEFAULT) or 1 (SPECIFIC_CLASS)`);
  }
  if (!inRange(p.moveSystem, 0, MOVE_SYSTEM_COUNT - 1)) {
    errors.push(`${path}.moveSystem: ${show(p.moveSystem)} is not a MoveSystem index (0..${MOVE_SYSTEM_COUNT - 1})`);
  }
  if (p.reloadSystem !== undefined && !inRange(p.reloadSystem, 0, RELOAD_SYSTEM_COUNT - 1)) {
    errors.push(`${path}.reloadSystem: ${show(p.reloadSystem)} is not a ReloadSystem index (0..${RELOAD_SYSTEM_COUNT - 1})`);
  }
  checkSkillList(errors, `${path}.leftOver`, p.leftOver);
};

/**
 * `choices` ∈ {-1} ∪ [0, choiceCount) at each level-up, choiceCount being the Ghost's at that point
 * (3, 4 once SMART is owned). Replays the Ghost's level-ups the way its constructor does (the
 * forced skills are applied after the choices, so they never change a draw).
 */
const checkChoices = (errors: string[], path: string, t: BattleTrooperInput, prefOk: boolean): void => {
  if (!Array.isArray(t.choices)) {
    errors.push(`${path}.choices: not an array`);
    return;
  }
  const choices: readonly unknown[] = t.choices;
  if (t.type !== 0 || !prefOk) {
    // Non-HUMAN troopers never level up (the SWF ignores their choices): only the shape is checked.
    choices.forEach((c, i) => {
      if (!inRange(c, -1, 2)) errors.push(`${path}.choices[${i}]: ${show(c)} is not -1 or an option index < 3`);
    });
    return;
  }
  let ghost: Ghost;
  try {
    ghost = new Ghost({ ...toGhostData(t), choices: [], force: null });
  } catch (e) {
    errors.push(`${path}: trooper generation failed (${(e as Error).message})`);
    return;
  }
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    const n = ghost.choiceCount;
    if (!inRange(c, -1, n - 1)) {
      errors.push(`${path}.choices[${i}]: ${show(c)} is not -1 or an option index < ${n}`);
      return;
    }
    try {
      ghost.levelUp(c);
    } catch (e) {
      errors.push(`${path}.choices[${i}]: level-up draw failed (${(e as Error).message})`);
      return;
    }
  }
};

const checkTrooper = (errors: string[], path: string, t: BattleTrooperInput, ids: Set<number>): void => {
  if (typeof t !== "object" || t === null) {
    errors.push(`${path}: not an object`);
    return;
  }
  if (!inRange(t.id, 0, INT32_MAX)) {
    errors.push(`${path}.id: ${show(t.id)} is not an int32 >= 0`);
  } else if (ids.has(t.id)) {
    errors.push(`${path}.id: duplicate trooper id ${t.id}`);
  } else {
    ids.add(t.id);
  }
  if (typeof t.name !== "string") {
    errors.push(`${path}.name: not a string`);
  } else {
    if (!isWellFormed(t.name)) errors.push(`${path}.name: not well-formed UTF-16 (lone surrogate)`);
    if (t.name.length > MAX_NAME_LENGTH) errors.push(`${path}.name: longer than ${MAX_NAME_LENGTH} UTF-16 code units`);
  }
  if (!isInt32(t.seed)) errors.push(`${path}.seed: ${show(t.seed)} is not an int32`);
  const typeOk = t.type === 0 || t.type === 2;
  if (!typeOk) errors.push(`${path}.type: ${show(t.type)} is not a TrooperType (0 HUMAN, 2 RAT)`);
  checkSkillList(errors, `${path}.force`, t.force);
  const before = errors.length;
  if (t.pref !== null) {
    if (typeof t.pref !== "object") errors.push(`${path}.pref: not null or an object`);
    else checkPref(errors, `${path}.pref`, t.pref);
  }
  if (typeOk && isInt32(t.seed)) checkChoices(errors, path, t, errors.length === before);
};

/** Checks every field the battle reads; `{ ok: true }` guarantees `simulateOutcome` accepts the input. */
export const validateBattleInput = (input: BattleInput): ValidationResult => {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) return { ok: false, errors: ["input: not an object"] };
  if (!isInt32(input.seed)) errors.push(`seed: ${show(input.seed)} is not an int32`);
  const bg = input.background;
  if (typeof bg !== "object" || bg === null) {
    errors.push("background: not an object");
  } else {
    if (typeof bg.gfx !== "string") errors.push("background.gfx: not a string");
    if (!inRange(bg.id, 0, BACKGROUND_COUNT - 1)) {
      errors.push(`background.id: ${show(bg.id)} is not a BackgroundType index (0..${BACKGROUND_COUNT - 1})`);
    }
  }
  if (input.attackerSide !== 0 && input.attackerSide !== 1) {
    errors.push(`attackerSide: ${show(input.attackerSide)} is not 0 or 1`);
  }
  if (!Array.isArray(input.armies) || input.armies.length !== 2) {
    errors.push("armies: not an array of exactly 2 armies");
    return { ok: false, errors };
  }
  const ids = new Set<number>();
  input.armies.forEach((army, a) => {
    const path = `armies[${a}]`;
    if (typeof army !== "object" || army === null) {
      errors.push(`${path}: not an object`);
      return;
    }
    if (!inRange(army.faction, 0, FACTION_MAX)) errors.push(`${path}.faction: ${show(army.faction)} is not in 0..${FACTION_MAX}`);
    if (!Array.isArray(army.spawnOrder)) {
      errors.push(`${path}.spawnOrder: not an array`);
    } else {
      army.spawnOrder.forEach((id, i) => {
        if (!isInt32(id)) errors.push(`${path}.spawnOrder[${i}]: ${show(id)} is not an int32`);
      });
    }
    if (!Array.isArray(army.troopers)) {
      errors.push(`${path}.troopers: not an array`);
      return;
    }
    army.troopers.forEach((t, i) => checkTrooper(errors, `${path}.troopers[${i}]`, t, ids));
  });
  // One empty side is a proven SWF case (oracle goldens edge/00002, edge/00003: the other side wins
  // at once); two empty sides never were.
  if (input.armies.every((a) => Array.isArray(a?.troopers) && a.troopers.length === 0)) {
    errors.push("armies: both armies are empty (0v0)");
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
};
