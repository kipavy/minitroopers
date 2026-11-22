// swf: enum BattleMsg (§|\x10i \x02§) and the other Haxe enums with parameters that reach
// Battle.history: HitEvent (§\x0fUf,\x01§), Announce (§\t'\x1d!§), Trigger (§(}$N\x02§),
// BattleEvent (§\f0$,\x02§). Constructor INDEXES come from each class's `__constructs__`; the
// readable names are labels (comment = obfuscated constructor name). Every constructor builds its
// `params` array with all declared arguments, omitted optional ones being `undefined` (→ `null`).
import { HxEnum, haxeString } from "./hx.ts";

export { HxEnum, haxeString };

const e = (index: number, params: unknown[] | null): HxEnum => new HxEnum(index, params);

export const BattleMsg = {
  /** 0 §MB~P\x02§(Object, int, int, int) */
  Msg0: (a: unknown, b: number, c: number, d: number) => e(0, [a, b, c, d]),
  /** 1 §\x1afOe\x02§(infos[], side) */
  Deploy: (infos: unknown[], side: number) => e(1, [infos, side]),
  /** 2 §V-\x18\x01§(target id, -1 = none) */
  Aim: (tid: number) => e(2, [tid]),
  /** 3 §0c\x06p§ */
  ReloadStart: e(3, null),
  /** 4 §b\x18\x13!\x03§(rounds) */
  Reload: (n: number) => e(4, [n]),
  /** 5 §n#5*§ */
  ReloadEnd: e(5, null),
  /** 6 §11\x01\x15\x02§ */
  AutoReload: e(6, null),
  /** 7 §\x1b\x07\x04b\x01§(anim) */
  Anim: (anim: number) => e(7, [anim]),
  /** 8 §rL\x1ff\x03§(hit results) */
  Shots: (hits: unknown[]) => e(8, [hits]),
  /** 9 §)=\x1bS§(tid, Weapon, hit, anim) */
  Brawl: (tid: number, weapon: number | null, hit: unknown, anim: number) => e(9, [tid, weapon, hit, anim]),
  /** 10 §ae\x1f\t§(Weapon, x, y, hits) */
  Explosion: (weapon: number, x: number, y: number, hits: unknown[]) => e(10, [weapon, x, y, hits]),
  /** 11 §Z\b4]§(x, y) */
  Move: (x: number, y: number) => e(11, [x, y]),
  /** 12 §Wob(§(tid, amount) */
  Heal: (tid: number, n: number) => e(12, [tid, n]),
  /** 13 §\x11\x1aSj\x02§(tid, int) */
  Cure: (tid: number, n: number) => e(13, [tid, n]),
  /** 14 §(qs[§(Skill, x, y, hits, ?Object, ?Object) */
  Grenade: (skill: number, x: number, y: number, hits: unknown[], p5?: unknown, p6?: unknown) =>
    e(14, [skill, x, y, hits, p5, p6]),
  /** 15 §0eh\b\x02§(Array) */
  Msg15: (a: unknown[]) => e(15, [a]),
  /** 16 §\x15a9=\x01§(Skill, ?Array, ?Array, ?Array) */
  Skill: (skill: number, a?: unknown[] | null, b?: unknown[] | null, c?: unknown[] | null) => e(16, [skill, a, b, c]),
  /** 17 §\x02)1L\x03§(Skill, Array, ?Array, ?Array) */
  SkillGroup: (skill: number, a: unknown[], b?: unknown[], c?: unknown[]) => e(17, [skill, a, b, c]),
  /** 18 §\x0b`\\0\x03§(tid, hit, dir) */
  Wrestle: (tid: number, hit: unknown, dir: number) => e(18, [tid, hit, dir]),
  /** 19 §WgpZ\x01§(tid, x, y) */
  Rescue: (tid: number, x: number, y: number) => e(19, [tid, x, y]),
  /** 20 §ZC|\x0f\x01§(Announce) */
  Announce: (a: HxEnum) => e(20, [a]),
  /** 21 §$\x02p\x02§(side, x, y, hits) */
  Airstrike: (side: number, x: number, y: number, hits: unknown[]) => e(21, [side, x, y, hits]),
  /** 22 §\x136nf\x02§(Status) */
  StatusOn: (s: number) => e(22, [s]),
  /** 23 §UzR'§(Status) */
  StatusOff: (s: number) => e(23, [s]),
  /** 24 §-\rt\x1e\x01§(Skill) */
  LastUse: (skill: number) => e(24, [skill]),
  /** 25 §Q\x15#S\x03§(Weapon, status) */
  SwitchWeapon: (weapon: number, status: unknown) => e(25, [weapon, status]),
  /** 26 §\x1f0f1\x01§(weapon uid) */
  PickUp: (wid: number) => e(26, [wid]),
  /** 27 §[\x10j\x03§(hit) */
  Damage: (hit: unknown) => e(27, [hit]),
  /** 28 §\x05r')\x02§(int) */
  Boost: (n: number) => e(28, [n]),
  /** 29 §3m\x01\x02\x03§(side, Boolean) */
  Leave: (side: number, b: boolean) => e(29, [side, b]),
  /** 30 §\r~\x1b;§(tid) */
  Propaganda: (tid: number) => e(30, [tid]),
  /** 31 §\x14\x0eX|\x01§(int) */
  Msg31: (n: number) => e(31, [n]),
  /** 32 §k\tQG§(tid, hits) */
  Strangle: (tid: number, hits: unknown[]) => e(32, [tid, hits]),
  /** 33 §\x15s\x04R\x02§(Array) */
  Msg33: (a: unknown[]) => e(33, [a]),
  /** 34 §r`M8\x03§(winner) */
  Winner: (w: unknown) => e(34, [w]),
  /** 35 §j\x07\x12T\x02§(hits, int) */
  Melee: (hits: unknown[], n: number) => e(35, [hits, n]),
  /** 36 §\x0f9G@\x01§(x, y) */
  Dismount: (x: number, y: number) => e(36, [x, y]),
  /** 37 §\x14\x01fp§(Array) */
  Msg37: (a: unknown[]) => e(37, [a]),
  /** 38 §Rv\b8\x03§(infos[]) */
  CheckPoint: (infos: unknown[]) => e(38, [infos]),
  /** 39 §\x1bv;\x15\x01§(dead ids) */
  NewWave: (ids: number[]) => e(39, [ids]),
  /** 40 §)\\T\x1d\x03§(side, status object) */
  PlayerStatus: (side: number, o: unknown) => e(40, [side, o]),
  /** 41 §\x03\x13t0§(coordinates) */
  Positions: (xy: number[]) => e(41, [xy]),
  /** 42 §~-~\x1e§(Array) */
  Msg42: (a: unknown[]) => e(42, [a]),
} as const;

/** swf: HitEvent §\x0fUf,\x01§. */
export const HitEvent = {
  /** 0 §gA #\x02§ */
  E0: e(0, null),
  /** 1 §\x1c\x04Nq\x01§ — critical death */
  CRITICAL: e(1, null),
  /** 2 §\x12Q\x04B\x01§(x, y, Number, fall result) */
  FLY_TO: (x: number, y: number, h: number, fall: unknown) => e(2, [x, y, h, fall]),
  /** 3 §}uB\x1f\x01§(x, y, Boolean) — weapon dropped */
  DROP: (x: number, y: number, b: boolean) => e(3, [x, y, b]),
  /** 4 § \x18\x06O\x03§ — helmet lost */
  HELMET: e(4, null),
  /** 5 §\x05\x195\x12\x01§(hit) */
  CRASH: (o: unknown) => e(5, [o]),
  /** 6 §\n\tV\x19§(x, y, weapon infos, Boolean) */
  ROLL: (x: number, y: number, w: unknown, b: boolean) => e(6, [x, y, w, b]),
  /** 7 §\x07*D*\x02§(int) */
  E7: (n: number) => e(7, [n]),
  /** 8 §'Ynn\x03§(Skill) */
  SKILL: (s: number) => e(8, [s]),
  /** 9 §!\r]&\x03§ */
  E9: e(9, null),
  /** 10 §9\x01+-\x01§ */
  STILL: e(10, null),
  /** 11 §7,KM\x03§ */
  SHOCKED: e(11, null),
  /** 12 §8\x02\rJ\x01§(Status) */
  STATUS: (s: number) => e(12, [s]),
} as const;

/** swf: Announce §\t'\x1d!§. */
export const Announce = {
  /** 0 §=18|§(Skill) */
  Skill: (s: number) => e(0, [s]),
  /** 1 §TH\x19\x14§(Com) */
  Com: (c: number) => e(1, [c]),
  /** 2 §uR7\r\x01§(String) */
  Text: (s: string) => e(2, [s]),
} as const;
