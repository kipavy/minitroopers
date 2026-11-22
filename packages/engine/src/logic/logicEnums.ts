// Constructor indexes of the parameterless logic enums used by the battle (labels are ours; the
// SWF names are obfuscated). Values are the indexes of each class's `__constructs__`.
import { HxEnum } from "../msg/hx.ts";

/** swf: TrooperState §\x19;v?\x03§. */
export const TrooperState = { IDLE: 0, AIM: 1, RELOAD: 2, DEAD: 3, FALLEN: 4 } as const;

/** swf: DamageType §\x01\x0bB\x07§. */
export const DamageType = {
  BULLET: 0,
  EXPLOSION: 1,
  CRASH: 2,
  D3: 3,
  POISON: 4,
  SHOCK: 5,
  MELEE: 6,
  WRESTLE: 7,
  FALL: 8,
  MISS: 9,
} as const;

/** swf: WeaponClass §\x01\x01\\\r\x01§ (weapon `type`). */
export const WeaponClass = { C0: 0, C1: 1, SHOTGUN: 2, EXPLOSIVE: 3, C4: 4, MELEE: 5, C6: 6 } as const;

/** swf: weapon habilities (enum §(N[\x7f§, 11 constructors). */
export const WeaponHab = {
  PIERCE: 0,
  KNOCKBACK: 1,
  H2: 2,
  AIMED: 3,
  HEAVY: 4,
  AUTO_RELOAD: 5,
  SPLASH_NEI: 6,
  SPLASH_3: 7,
  FULL_LOAD: 8,
  MIN_RANGE: 9,
  DOUBLE: 10,
} as const;

/** swf: trooper side actions (enum §\fmk\x03§). */
export const SideAction = { STOMP: 0, CURE: 1, WANDER: 2, STRANGLE: 3, RELOAD: 4, DEFEND: 5 } as const;

/** swf: Size §\x194ma§. */
export const Size = { SMALL: 0, MEDIUM: 1, LARGE: 2, HUGE: 3 } as const;

/** swf: BodyLoc §7\\(h\x03§. */
export const BodyLoc = {
  HEAD: 0,
  TORSO_LEFT: 1,
  TORSO_RIGHT: 2,
  STOMACH: 3,
  ARM_LEFT: 4,
  ARM_RIGHT: 5,
  LEG_LEFT: 6,
  LEG_RIGHT: 7,
} as const;

/** swf: Status §q\x18\tv\x02§. */
export const Status = { BLIND: 0, POISON: 1, AMPHETAMINE: 2, PARALYZED: 3, CURSED: 4, LOCKED: 5 } as const;

/** swf: troop anims (enum §/U3W§, 64 constructors) — the ones the logic emits. */
export const Anim = { KICK: 20, PUNCH_A: 35, PUNCH_B: 36, PUNCH_C: 37, GET_UP: 56 } as const;

/** swf: Vehicule §g3\x05]\x03§. */
export const VehiculeKind = { MOTO: 0, LIGHT_TANK: 2, HELICOPTER: 3, HEAVY_TANK: 4, FIGHTER_JET: 7 } as const;

/** swf: Trigger §(}$N\x02§. */
export const Trigger = {
  /** 0 (killer, victim) */
  Kill: (killer: unknown, victim: unknown) => new HxEnum(0, [killer, victim]),
  /** 1 (side) */
  Check: (side: number) => new HxEnum(1, [side]),
} as const;

/** swf: BattleEvent §\f0$,\x02§. */
export const BattleEvent = {
  POISON_TICK: new HxEnum(0, null),
  Strike: (o: unknown) => new HxEnum(1, [o]),
  COM: new HxEnum(2, null),
} as const;

/** MoveSystem (§#u^§): HUNTER 0, STANDARD 1, DEFENDER 2. ReloadSystem: RISKY 0, CAUTIOUS 1, DEFAULT 2, FULL 3. */
export const MoveSystem = { HUNTER: 0, STANDARD: 1, DEFENDER: 2 } as const;
export const ReloadSystem = { RISKY: 0, CAUTIOUS: 1, DEFAULT: 2, FULL: 3 } as const;

/** SkillCategory indexes tested by the logic. */
export const SkillCategoryIdx = { LAST_USE_MSG: 11, GRENADE: 17 } as const;

/** Data constants (§\x17@E{§ statics). */
export const POISON_PERIOD = 35; // §p\b\x18§
export const COM_PERIOD = 400; // §atM\x1d§
