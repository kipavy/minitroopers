export const ENGINE_VERSION = "0.0.0";
export * from "./input/types.ts";
export { HaxeEnum, serializeHaxe } from "./input/haxeSerializer.ts";
export { toFlashvars } from "./input/flashvars.ts";
export { simulateBattle, NotImplemented } from "./simulate.ts";
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
export { HxEnum, haxeString } from "./msg/hx.ts";
export { as3Sort } from "./core/sort.ts";
