export const ENGINE_VERSION = "2.0.0";
export * from "./input/types.ts";
export { HaxeEnum, originalUrlEncode, serializeHaxe } from "./input/haxeSerializer.ts";
export { toFlashvars } from "./input/flashvars.ts";
export { Rand } from "./core/rand.ts";
export { Num } from "./core/num.ts";
export { BMath } from "./core/bmath.ts";
export type { BCell } from "./core/bmath.ts";
export { Arr } from "./core/arr.ts";
export * from "./data/enums.ts";
export * as Data from "./data/data.ts";
export { Ghost } from "./logic/ghost.ts";
export type { GhostData, GhostPhysical } from "./logic/ghost.ts";
export { clownData, generateTrooper, toGhostData } from "./logic/trooperGen.ts";
export type { GeneratedTrooper } from "./logic/trooperGen.ts";
export { BattleMsg, HitEvent, Announce } from "./msg/battleMsg.ts";
export { HxEnum, haxeString } from "./msg/hx.ts";
// Stage-2 boundary (game server API).
export { InvalidBattleInput, MAX_NAME_LENGTH, validateBattleInput } from "./boundary/validate.ts";
export type { ValidationResult } from "./boundary/validate.ts";
export { simulateOutcome } from "./boundary/outcome.ts";
export type { BattleOutcome } from "./boundary/outcome.ts";
export {
  choiceIndexForSkill,
  defaultLeftOver,
  describeTrooper,
  carryCapacity,
  levelUpOptions,
  reequip,
} from "./boundary/trooper.ts";
export type { LevelUpOptions, TrooperSheet } from "./boundary/trooper.ts";
export { armyPower, recruitCost, trooperLevel, upgradeCost } from "./boundary/economy.ts";
export {
  battleData,
  choiceData,
  clientParams,
  gridData,
  midData,
  recruitsData,
  trooperData,
  troopersList,
} from "./boundary/client.ts";
export type { ClientChoice, ClientGrid } from "./boundary/client.ts";
