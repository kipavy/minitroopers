export const ENGINE_VERSION = "1.0.0";
export * from "./input/types.ts";
export { HaxeEnum, serializeHaxe } from "./input/haxeSerializer.ts";
export { toFlashvars } from "./input/flashvars.ts";
export {
  simulateBattle,
  simulateBattleCapped,
  StepCapExceeded,
  DEFAULT_MAX_STEPS,
  NotImplemented,
} from "./simulate.ts";
export type { BattleRecord, TrooperSnapshot } from "./simulate.ts";
export { Rand } from "./core/rand.ts";
export { Num } from "./core/num.ts";
export { BMath } from "./core/bmath.ts";
export type { BCell } from "./core/bmath.ts";
export { Arr } from "./core/arr.ts";
export * from "./data/enums.ts";
export * as Data from "./data/data.ts";
export { Ghost } from "./logic/ghost.ts";
export type { GhostData, GhostPhysical } from "./logic/ghost.ts";
export {
  clownData,
  formatTrooperLine,
  generateTrooper,
  projectGenerated,
  toGhostData,
  trooperProjection,
} from "./logic/trooperGen.ts";
export type { GeneratedTrooper, TrooperLineState } from "./logic/trooperGen.ts";
export { Battle } from "./logic/battle.ts";
export { BattleMsg, HitEvent, Announce } from "./msg/battleMsg.ts";
export { HxEnum, haxeString, OBF_KEYS } from "./msg/hx.ts";
// Exposed for the verification harness (coverage replay observers); not a game API.
export { Trooper } from "./logic/trooper/trooper.ts";
export { as3Sort } from "./core/sort.ts";
