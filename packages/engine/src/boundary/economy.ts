// swf: Data (§\x17@E{§) — the army economy formulas of the SWF Data class, as a stable game API.
import { armyLevel, levelCost, XP_LEVELS } from "../data/data.ts";

/** Level of a trooper with `choicesLength` level-up choices (Ghost: one level per choice, from 1). */
export const trooperLevel = (choicesLength: number): number => 1 + choicesLength;

/** Cost of the next level-up: `Data.levelCost(choices.length)` = `int((n+1)^2.5)`. */
export const upgradeCost = (choicesLength: number): number => levelCost(choicesLength);

/**
 * Cost of recruiting the (count+1)-th trooper: `Data.XP_LEVELS[count]` (8, 24, 60, …, 2000);
 * `null` once the army holds `XP_LEVELS.length` (12) troopers.
 */
export const recruitCost = (trooperCount: number): number | null =>
  Number.isInteger(trooperCount) && trooperCount >= 0 && trooperCount < XP_LEVELS.length
    ? (XP_LEVELS[trooperCount] as number)
    : null;

/** Army power: `Data.armyLevel` = Σ (5 + choices.length) over the troopers. */
export const armyPower = (troopers: readonly { choices: readonly number[] }[]): number => armyLevel({ troopers });
