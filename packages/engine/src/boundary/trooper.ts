// Stage-2 boundary: trooper sheet, level-up offers and re-equip, all on top of the SWF Ghost
// (logic.Ghost, see ../logic/ghost.ts) so that what the server shows is what the battle generates.
import type { Rand } from "../core/rand.ts";
import { skillWeapon } from "../data/data.ts";
import type { BattleTrooperInput } from "../input/types.ts";
import { Ghost } from "../logic/ghost.ts";
import type { GhostPhysical } from "../logic/ghost.ts";
import { generateTrooper, toGhostData } from "../logic/trooperGen.ts";

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
  /** How many equipment skills the trooper may carry (`carryCapacity`); the rest is left over. */
  carry: number;
  physical: GhostPhysical;
}

/** Ghost with the pref's leftOver ignored: everything the trooper owns. */
const fullGhost = (t: BattleTrooperInput): Ghost => {
  const d = toGhostData(t);
  return new Ghost(d.pref === null ? d : { ...d, pref: { ...d.pref, leftOver: [] } });
};

/** Every EQUIPMENT skill the trooper owns (leftOver included, Ghost skill order) and its carry capacity. */
const equipmentOf = (t: BattleTrooperInput): { items: number[]; carry: number } => {
  const g = fullGhost(t);
  return { items: g.getEquipment(), carry: Math.max(0, g.stat17G) };
};

/**
 * Carry capacity: Ghost §G§ (`stat17G`, 3, −1 with skill 54 "Débardeur Bruce",
 * ghost.ts `apply`). The battle never reads it: it is the server-side equipment limit.
 * UNVERIFIED: whether the original took it from every owned skill or only from the kept ones.
 * Taken from the full Ghost (skill 54 counts even when left over): of the 7 archived troopers
 * owning 54 with a non-empty leftOver, this matches 5 (2 carrying 54 with 2 items, 3 leaving 54
 * over with 2 items); "kept set only" matches 4. The 28 others all carry 3 (both rules agree).
 */
export const carryCapacity = (t: BattleTrooperInput): number => equipmentOf(t).carry;

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
    equipment: equipmentOf(t).items,
    leftOver: t.pref === null ? [] : t.pref.leftOver.slice(),
    carry: carryCapacity(t),
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
 * Shown = the first `choiceCount - 1` drawn: verified on html/fr/levelup_0.html (Edonnell, level 9:
 * drawn [137, 86, 39], the page offers 137 then 86).
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
 * with more equipment than `carryCapacity` (N, 3 or 2), the kept set is `pref.selectedItems`
 * (owned ones, at most N) filled up to N with the first other equipment in skill order;
 * leftOver = the rest, skill order. Divergences from $GL: N instead of a constant 3, selectedItems
 * beyond N are ignored, an absent selectedItems keeps the first N (in $GL it left everything over).
 * UNVERIFIED: the original server's choice of the kept set is unknown; "first N in skill order"
 * matches 9 of the 35 archived leftOver sets (incl. hq-levelup.html, the cleanest case).
 */
export const defaultLeftOver = (t: BattleTrooperInput): number[] => {
  const { items, carry } = equipmentOf(t);
  if (items.length <= carry) return [];
  const kept: number[] = [];
  for (const s of t.pref?.selectedItems ?? []) {
    if (kept.length < carry && items.includes(s) && !kept.includes(s)) kept.push(s);
  }
  for (const s of items) {
    if (kept.length >= carry) break;
    if (!kept.includes(s)) kept.push(s);
  }
  return items.filter((s) => !kept.includes(s));
};

/**
 * Re-equip (`/t/<n>?equip=`): a new random `carryCapacity`-subset of the trooper's equipment is
 * kept; returns the new leftOver (skill order), `[]` when everything fits.
 * UNVERIFIED: the original result was never captured ("re-rolls the equipped set"); the draw
 * (N × `rand.random(remaining)`) is ours.
 */
export const reequip = (t: BattleTrooperInput, rand: Rand): number[] => {
  const { items, carry } = equipmentOf(t);
  if (items.length <= carry) return [];
  const pool = items.slice();
  const kept: number[] = [];
  for (let k = 0; k < carry; k++) kept.push(pool.splice(rand.random(pool.length), 1)[0] as number);
  return items.filter((s) => !kept.includes(s));
};
