// Stage-2 boundary: trooper sheet, level-up offers and re-equip, all on top of the SWF Ghost
// (logic.Ghost, see ../logic/ghost.ts) so that what the server shows is what the battle generates.
import type { Rand } from "../core/rand.ts";
import { skillWeapon } from "../data/data.ts";
import type { BattleTrooperInput } from "../input/types.ts";
import { Ghost } from "../logic/ghost.ts";
import type { GhostPhysical } from "../logic/ghost.ts";
import { generateTrooper, toGhostData } from "../logic/trooperGen.ts";

/** Equipment a trooper may carry; the rest goes to `pref.leftOver`. */
export const MAX_CARRIED_EQUIPMENT = 3;

export interface TrooperSheet {
  /** 1 + choices.length for a HUMAN (Ghost lvl + 1); 1 for a RAT. */
  level: number;
  /** Ghost life = the trooper's max life in battle. */
  life: number;
  /** Specialisation (last ARMY_JOB skill), null when none. */
  job: number | null;
  /** Owned skills, Ghost application order, leftOver equipment excluded (what the battle sees). */
  skills: number[];
  /** Weapon enum of each WEAPON skill, skill order (= the `weapon` select of the /t page; no fists). */
  weapons: number[];
  /** Every EQUIPMENT skill owned, carried or left over, skill order (input of re-equip). */
  equipment: number[];
  /** `pref.leftOver` as given. */
  leftOver: number[];
  physical: GhostPhysical;
}

/** Ghost with the pref's leftOver ignored: everything the trooper owns. */
const fullGhost = (t: BattleTrooperInput): Ghost => {
  const d = toGhostData(t);
  return new Ghost(d.pref === null ? d : { ...d, pref: { ...d.pref, leftOver: [] } });
};

/** Every EQUIPMENT skill the trooper owns (leftOver included), Ghost skill order. */
const allEquipment = (t: BattleTrooperInput): number[] =>
  t.pref !== null && t.pref.leftOver.length > 0 ? fullGhost(t).getEquipment() : generateTrooper(t, 0, []).ghost.getEquipment();

/**
 * Everything a page shows about a trooper. `faction` is accepted for symmetry with the client
 * builders; it changes nothing in the build.
 */
export const describeTrooper = (t: BattleTrooperInput, _faction?: number): TrooperSheet => {
  const g = generateTrooper(t, 0, []).ghost;
  return {
    level: g.lvl + 1,
    life: g.life,
    job: g.job,
    skills: g.skills.slice(),
    weapons: g.weaponSkills().map(skillWeapon),
    equipment: allEquipment(t),
    leftOver: t.pref === null ? [] : t.pref.leftOver.slice(),
    physical: { ...g.physical },
  };
};

export interface LevelUpOptions {
  /** The options the level-up page offers: the first `choiceCount - 1` drawn. */
  shown: number[];
  /** `Ghost.drawOptions()` for the next level-up: `choiceCount` distinct skills. */
  drawn: number[];
  /** 3, or 4 once SMART (64) is owned; 0 when the trooper cannot level up. */
  choiceCount: number;
}

/**
 * Options of the next level-up, i.e. what `generateTrooper` would draw for `choices + [i]`. The
 * Ghost draws at the end of its choices loop, before forced skills are applied, so the Ghost is
 * rebuilt without `force`. Choosing level 6 (4 choices) draws ARMY_JOB skills only.
 * UNVERIFIED: the original page shows 2 boxes (3 with SMART) out of 3 (4) drawn; that it shows the
 * first ones is inferred from the index semantics of `choices`.
 */
export const levelUpOptions = (t: BattleTrooperInput): LevelUpOptions => {
  // Only HUMAN Ghosts run level-ups; past level 51 `levelUp` ignores the choice (no draw).
  if (t.type !== 0) return { shown: [], drawn: [], choiceCount: 0 };
  const g = new Ghost({ ...toGhostData(t), force: null });
  if (g.lvl > 50) return { shown: [], drawn: [], choiceCount: 0 };
  const drawn = g.drawOptions();
  return { shown: drawn.slice(0, g.choiceCount - 1), drawn, choiceCount: g.choiceCount };
};

/** Index to append to `choices` to learn `skill`, when `skill` is one of the shown options; else null. */
export const choiceIndexForSkill = (t: BattleTrooperInput, skill: number): number | null => {
  const o = levelUpOptions(t);
  return o.shown.includes(skill) ? o.drawn.indexOf(skill) : null;
};

/**
 * Port of $GL `getLeftOver` (packages/shared/src/troopers.model.ts:341-364) on the engine Ghost:
 * with more than 3 equipment, the kept set is `pref.selectedItems` (owned ones, at most 3) filled
 * up to 3 with the first other equipment in skill order; leftOver = the rest, skill order.
 * Divergences from $GL: selectedItems beyond 3 are ignored, an absent selectedItems keeps the
 * first 3 (in $GL it left everything over).
 */
export const defaultLeftOver = (t: BattleTrooperInput): number[] => {
  const items = allEquipment(t);
  if (items.length <= MAX_CARRIED_EQUIPMENT) return [];
  const kept: number[] = [];
  for (const s of t.pref?.selectedItems ?? []) {
    if (kept.length < MAX_CARRIED_EQUIPMENT && items.includes(s) && !kept.includes(s)) kept.push(s);
  }
  for (const s of items) {
    if (kept.length >= MAX_CARRIED_EQUIPMENT) break;
    if (!kept.includes(s)) kept.push(s);
  }
  return items.filter((s) => !kept.includes(s));
};

/**
 * Re-equip (`/t/<n>?equip=`): a new random 3-subset of the trooper's equipment is kept; returns
 * the new leftOver (skill order), `[]` with 3 equipment or fewer.
 * UNVERIFIED: the original result was never captured ("re-rolls the equipped set"); the draw
 * (3 × `rand.random(remaining)`) is ours.
 */
export const reequip = (t: BattleTrooperInput, rand: Rand): number[] => {
  const items = allEquipment(t);
  if (items.length <= MAX_CARRIED_EQUIPMENT) return [];
  const pool = items.slice();
  const kept: number[] = [];
  for (let k = 0; k < MAX_CARRIED_EQUIPMENT; k++) kept.push(pool.splice(rand.random(pool.length), 1)[0] as number);
  return items.filter((s) => !kept.includes(s));
};
