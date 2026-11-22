// swf: mt.Rand (§b\x17-*§) — client_fr.swf, package §`\x0b\x01§ ("mt").
// Park-Miller LCG on an AS3 `Number` (double); every `int(...)` is a ToInt32 (`| 0`).
// The engine also inlines this recurrence at each call site (Battle/Trooper/...): the
// inlined form is exactly `random(n)` / `rand()` / `int()` below.

/** `seed * 16807` stays < 2^53 (seed < 2^31), so the double product is exact. */
export class Rand {
  /** AS3 `Number` field (§\fA2c§): `|seed| + 131` initially, then always < 2147483647. */
  seed: number;

  constructor(seed = 0) {
    const p = seed | 0; // param1:int
    this.seed = (p < 0 ? -p : p) + 131;
  }

  /** `random(max)`: `int(((int(seed = seed * 16807 % 2147483647)) & 0x3FFFFFFF) % max)`. */
  random(max: number): number {
    return ((((this.seed = (this.seed * 16807) % 2147483647) | 0) & 0x3fffffff) % (max | 0)) | 0;
  }

  /** `rand()`: `int(((int(seed = …)) & 0x3FFFFFFF) % 10007) / 10007`. */
  rand(): number {
    return (((((this.seed = (this.seed * 16807) % 2147483647) | 0) & 0x3fffffff) % 10007) | 0) / 10007;
  }

  /** `_int()` (AS3 name `_int`). */
  int(): number {
    return ((this.seed = (this.seed * 16807) % 2147483647) | 0) & 0x3fffffff;
  }

  initSeed(value: number, rounds = 5): void {
    let param1 = value | 0;
    const n = rounds | 0;
    for (let i = 0; i < n; i++) {
      param1 ^= (param1 << 7) & 0x2b5b2500;
      param1 ^= (param1 << 15) & 0x1b8b0000;
      param1 ^= param1 >>> 16;
      param1 &= 1073741823;
      let h = 5381;
      h = ((h << 5) + h + (param1 & 0xff)) | 0;
      h = ((h << 5) + h + ((param1 >> 8) & 0xff)) | 0;
      h = ((h << 5) + h + ((param1 >> 16) & 0xff)) | 0;
      h = ((h << 5) + h + (param1 >> 24)) | 0;
      param1 = h & 0x3fffffff;
    }
    this.seed = (param1 & 0x1fffffff) + 131;
  }

  getSeed(): number {
    return ((this.seed | 0) - 131) | 0;
  }

  clone(): Rand {
    const c = new Rand(0);
    c.seed = this.seed;
    return c;
  }

  addSeed(delta: number): void {
    const d = delta | 0;
    this.seed = (((this.seed + d) % 2147483647) | 0) & 0x3fffffff;
    if (this.seed === 0) {
      this.seed = d + 1;
    }
  }
}
