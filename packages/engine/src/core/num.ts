// swf: mt.bumdum9.Num (§D;A\x01§) — client_fr.swf, package §`\x0b\x01§.§NOJE\x03§.
// mm §K\x15\x01§, clamp §}\x0487\x02§, sMod §R/;L§, hMod §w\x15B1§.
export const Num = {
  mm(a: number, b: number, c: number): number {
    return Math.min(Math.max(a, b), c);
  },

  clamp(a: number, b: number, c: number): number {
    a |= 0;
    b |= 0;
    c |= 0; // int params
    if (b < a) return a;
    if (b > c) return c;
    return b;
  },

  /** Positive modulo by repeated subtraction (kept as is: loops forever if `b < 0`). */
  sMod(a: number, b: number): number {
    if (b === 0) return a;
    while (a >= b) a -= b;
    while (a < 0) a += b;
    return a;
  },

  hMod(a: number, b: number): number {
    while (a > b) a -= b * 2;
    while (a < -b) a += b * 2;
    return a;
  },
} as const;
