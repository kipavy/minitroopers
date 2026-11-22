// swf: logic.Square (§P!L/\x02§.§\r\x07 \x05\x01§).
import { XMAX } from "../data/data.ts";
import type { Battle } from "./battle.ts";
import type { LogicWeapon } from "./logicWeapon.ts";
import type { Trooper } from "./trooper/trooper.ts";

export class Square {
  /** §l\x01§ */
  y: number;
  /** §v\x01§ */
  x: number;
  /** §\x1dI\x02\r\x03§ — weapons lying here. */
  weapons: LogicWeapon[];
  /** §(\x01§ — occupant. */
  tr: Trooper | null;
  /** §E\x1d\x02\x11§ (int) */
  size: number;
  /** §RZ\x06U\x01§ — distance to each side's troopers (index 2: a single target). */
  range: number[];
  /** §$UQ#§ — the 2×2 block starting here. */
  quad: Square[];
  /** §|x6\x01§ — 4-neighbours (null off-grid). */
  nei: (Square | null)[];
  /** §GI0\x1c\x01§ (int) */
  flag2: number;
  /** §Kr)r§ (int) */
  flag: number;
  /** §8h\\;§ — number of enemy weapons in range, per side. */
  danger: number[];
  /** §\x01x8\x01§ */
  bat: Battle;

  // swf: Square.<constructor>
  constructor(bat: Battle, x: number, y: number) {
    this.bat = bat;
    this.x = x | 0;
    this.y = y | 0;
    this.tr = null;
    this.size = 0;
    this.range = [999, 999];
    this.danger = [0, 0];
    this.nei = [];
    this.quad = [];
    this.flag = 0;
    this.flag2 = 0;
    this.weapons = [];
  }

  // swf: Square.§\r\x19O\x03§ (shake)
  shake(n = 1, free = false): Square | null {
    let list = this.around(1 + n * 2);
    if (free) {
      const l2: Square[] = [];
      for (const sq of list) {
        if (sq.tr == null) l2.push(sq);
      }
      list = l2;
    }
    return list[this.bat.seed.random(list.length)] ?? null;
  }

  // swf: Square.§&=\x02%\x02§ — the footprint of SIZE[size] starting here is free.
  fits(size: number): boolean {
    if (size === 0) return true;
    for (const d of SIZE[size]!) {
      const sq = this.bat.getSq(this.x + d[0]!, this.y + d[1]!);
      if (sq == null || sq.tr != null) return false;
    }
    return true;
  }

  // swf: Square.§Qm\x14!§
  isFree(): boolean {
    return this.tr == null;
  }

  // swf: Square.§?\x0e5;\x02§ — the n×n block centred here (on-grid squares).
  around(n: number): Square[] {
    const out: Square[] = [];
    const h = (n * 0.5) | 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const sq = this.bat.getSq(this.x + i - h, this.y + j - h);
        if (sq != null) out.push(sq);
      }
    }
    return out;
  }

  // swf: Square.§\x1aSg8§ — living troopers in the n×n block (each once).
  troopersAround(n: number): Trooper[] {
    for (const t of this.bat.troopers) t.flag = 0;
    const list = this.around(n);
    const out: Trooper[] = [];
    for (const sq of list) {
      if (!(sq == null || sq.tr == null || sq.tr.flag === 1 || sq.tr.isDead())) {
        sq.tr.flag = 1;
        out.push(sq.tr);
      }
    }
    return out;
  }

  // swf: Square.§\x12z(\x02§
  cmpX(x: number): number {
    if (x < this.x) return -1;
    if (x > this.x) return 1;
    return 0;
  }

  // swf: Square.§ \x0ez|\x01§ — free neighbours.
  freeNei(): Square[] {
    const out: Square[] = [];
    for (const sq of this.nei) {
      if (sq != null && sq.isFree()) out.push(sq);
    }
    return out;
  }

  // swf: Square.§'\x0fg]\x01§
  getDist(sq: Square): number {
    return (Math.abs(this.x - sq.x) + Math.abs(this.y - sq.y)) | 0;
  }

  // swf: Square.§J\x1a(Z\x03§ — distance from a side's edge.
  sideDist(side: number): number {
    if (side === 0) return this.x;
    return (XMAX - this.x) | 0;
  }

  // swf: Square.§p\x1a6{\x03§
  getAngle(sq: Square): number {
    const dx = (sq.x - this.x) | 0;
    const dy = (sq.y - this.y) | 0;
    return Math.atan2(dy, dx);
  }
}

/** swf: Battle.§^M~\x05\x01§ (SIZE): footprints per Size. */
export const SIZE: readonly (readonly (readonly number[])[])[] = [
  [[0, 0]],
  [
    [0, 0],
    [1, 0],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
];
