// `@mt/engine/internal`: the verification harness's view of the engine (tools/oracle, golden
// replay, benches). Not a game API: these exports follow the SWF's internals and may change.
export {
  simulateBattle,
  simulateBattleCapped,
  StepCapExceeded,
  DEFAULT_MAX_STEPS,
} from "./simulate.ts";
export type { BattleRecord, TrooperSnapshot } from "./simulate.ts";
export { Battle } from "./logic/battle.ts";
export { Trooper } from "./logic/trooper/trooper.ts";
export { as3Sort } from "./core/sort.ts";
export { OBF_KEYS } from "./msg/hx.ts";
export { formatTrooperLine, projectGenerated, trooperProjection } from "./logic/trooperGen.ts";
export type { TrooperLineState } from "./logic/trooperGen.ts";
