// Shapes of the anonymous objects the battle logic builds or receives (readable keys; see
// msg/hx.ts OBF_KEYS for the SWF field names).
import type { HxEnum } from "../msg/hx.ts";

/** Trooper preferences as deserialized from the flashvars (enum values: index or HxEnum). */
export interface PrefData {
  leftOver: number[];
  moveSystem: number;
  reloadSystem: number;
  CBody: number | null;
  CWeapon: number | null;
  targetSystem: number;
  /** TargetType: 0, or HxEnum(1, [Skill]) (SPECIFIC_CLASS). */
  targetType: number | HxEnum;
  selectedItems?: number[];
}

/** Trooper data object (Trooper.§5E[\x1d§ / Ghost data). */
export interface TrooperData {
  name: string;
  seed: number;
  type: number;
  id: number;
  choices: number[];
  force: number[];
  pref: PrefData | null;
}

export interface ArmyData {
  troopers: TrooperData[];
  faction: number;
  /** __UP2 (§K)\x16\n\x02§) */
  leaders: number[];
}

export interface BattleData {
  id: number;
  armies: ArmyData[];
}

/** Hit result (`{tid, dmg, type, loc, events}`). */
export interface HitResult {
  tid: number;
  dmg: number;
  type: number;
  loc: number | null;
  events: unknown[];
}
