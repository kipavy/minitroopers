// Derived from minitroopers (Eternaltwin), MIT, (c) 2026 YesLifeTechnology

/** Enum indices as used by the SWF (`BackgroundType`). */
export const BackgroundType = {
  BG_GARDEN: 0,
  BG_ATTIC: 1,
  BG_SEWER: 2,
  BG_ROAD: 3,
  BG_WOOD: 4,
} as const;

/** Enum indices as used by the SWF (`TrooperType`). */
export const TrooperType = { HUMAN: 0, RAT: 2 } as const;

export const MoveSystem = { HUNTER: 0, STANDARD: 1, DEFENDER: 2 } as const;

export const ReloadSystem = { RISKY: 0, CAUTIOUS: 1, DEFAULT: 2, FULL: 3 } as const;

export const TargetSystem = { CLOSEST: 0, EASIEST: 1, WEAKEST: 2, STRONGEST: 3 } as const;

/**
 * Field set of $GL `TrooperConfig` (return type of `getTrooperPref()`); every
 * enum-valued field is the enum index. `reloadSystem` is an addition: $GL
 * emits it at runtime (default 2 = DEFAULT) although its declared type omits it.
 */
export type TrooperPref = {
  CWeapon: number | null;
  CBody: number | null;
  targetSystem: number;
  /** 0 = DEFAULT, 1 = SPECIFIC_CLASS (requires `targetClass`). */
  targetType: number;
  /** Skill enum index of the priority class when `targetType` is 1. */
  targetClass?: number;
  moveSystem: number;
  /** $GL wire field; the SWF never reads it (optional, ignored). */
  name?: string;
  /**
   * Skill enum indexes removed from the trooper at generation (SWF Ghost: `skills.remove` for
   * each `pref.leftOver` entry): the equipment beyond the 3 a trooper may carry, computed like
   * $GL `getLeftOver`. $GL itself always sends `[]`.
   */
  leftOver: number[];
  /** Equipment the player kept (UI only: the SWF never reads it; sent for wire parity with $GL). */
  selectedItems?: number[];
  reloadSystem?: number;
};

export interface BattleTrooperInput {
  id: number;
  name: string;
  seed: number;
  /** TrooperType enum index. */
  type: number;
  choices: number[];
  /** Skill enum indices. */
  force: number[];
  pref: TrooperPref | null;
}

export interface BattleArmyInput {
  faction: number;
  /** Flash field `__UP2`: spawn / appearance order. */
  spawnOrder: number[];
  troopers: BattleTrooperInput[];
}

export interface BattleInput {
  seed: number;
  /** `id` is the BackgroundType enum index. */
  background: { gfx: string; id: number };
  armies: [BattleArmyInput, BattleArmyInput];
  /** Attacking side index (0 = left army). */
  attackerSide: number;
}
