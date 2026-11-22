import { test } from "node:test";
import assert from "node:assert/strict";
import { Rand } from "../../src/core/rand.ts";
import { Num } from "../../src/core/num.ts";
import { BMath } from "../../src/core/bmath.ts";
import { Arr } from "../../src/core/arr.ts";

// Independent reference: exact integer arithmetic, same recurrence as the decompiled
// `seed = seed * 16807 % 2147483647` then `& 0x3FFFFFFF` (swf: mt.Rand, obfuscated §b\x17-*§).
const reference = (seed: number, n: number): number[] => {
  let s = BigInt(Math.abs(seed)) + 131n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 16807n) % 2147483647n;
    out.push(Number(s & 0x3fffffffn));
  }
  return out;
};

for (const seed of [1, 12345678, 2147483646]) {
  test(`Rand(${seed}).int() matches the BigInt reference over 1000 draws`, () => {
    const r = new Rand(seed);
    assert.deepEqual(
      Array.from({ length: 1000 }, () => r.int()),
      reference(seed, 1000),
    );
  });
  test(`Rand(${seed}).random(n) and rand() match the reference over 1000 draws`, () => {
    const ref = reference(seed, 2000);
    const r = new Rand(seed);
    const mods = [2, 3, 7, 40, 100, 2000, 3300];
    for (let i = 0; i < 1000; i++) {
      const n = mods[i % mods.length]!;
      assert.equal(r.random(n), ref[i]! % n, `random #${i}`);
    }
    const q = new Rand(seed);
    for (let i = 0; i < 1000; i++) {
      assert.equal(q.rand(), (ref[i]! % 10007) / 10007, `rand #${i}`);
    }
  });
}

test("Rand(12345678) hand-checked sequence (same recurrence as $GL flashRand.ts)", () => {
  // seed0 = 12345678 + 131 = 12345809; first draw = (12345809 * 16807 % 2147483647) & 0x3FFFFFFF.
  const r = new Rand(12345678);
  assert.deepEqual([r.int(), r.int(), r.int()], reference(12345678, 3));
  assert.equal(new Rand(12345678).int(), 12345809 * 16807 % 2147483647 & 0x3fffffff);
});

test("negative seeds are mirrored; seed is int-coerced", () => {
  assert.equal(new Rand(-5).seed, 136);
  assert.equal(new Rand(5).seed, 136);
  assert.equal(new Rand(2 ** 32 + 7).seed, 138);
});

test("random(0) gives 0 (AS3 int(NaN))", () => {
  assert.equal(new Rand(1).random(0), 0);
});

test("getSeed/clone/addSeed/initSeed", () => {
  const r = new Rand(77);
  assert.equal(r.getSeed(), 77);
  const c = r.clone();
  assert.equal(c.int(), r.int());
  const a = new Rand(0);
  a.seed = 5;
  a.addSeed(2147483647 - 5); // (seed + d) % modulus == 0 -> seed = d + 1
  assert.equal(a.seed, 2147483647 - 5 + 1);
  const b = new Rand(0);
  b.initSeed(123456789);
  assert.equal(b.seed, initSeedRef(123456789) + 131);
});

const initSeedRef = (p: number, rounds = 5): number => {
  const i32 = (x: bigint) => BigInt.asIntN(32, x);
  let param = BigInt(p);
  for (let i = 0; i < rounds; i++) {
    param = i32(param ^ (i32(param << 7n) & 0x2b5b2500n));
    param = i32(param ^ (i32(param << 15n) & 0x1b8b0000n));
    param = i32(param ^ (BigInt.asUintN(32, param) >> 16n));
    param &= 1073741823n;
    let h = 5381n;
    h = i32((h << 5n) + h + (param & 0xffn));
    h = i32((h << 5n) + h + ((param >> 8n) & 0xffn));
    h = i32((h << 5n) + h + ((param >> 16n) & 0xffn));
    h = i32((h << 5n) + h + (param >> 24n));
    param = h & 0x3fffffffn;
  }
  return Number(param & 0x1fffffffn);
};

test("initSeed matches an int32-wrapping BigInt reference", () => {
  for (const v of [0, 1, 94448464, 1073741823, -1, 2147483647]) {
    const r = new Rand(0);
    r.initSeed(v);
    assert.equal(r.seed, initSeedRef(v) + 131, `initSeed(${v})`);
  }
});

test("cross-check with the SWF: first Trooper.init initiative draws of golden basic/00000", () => {
  // Trooper.init ends with `time += bat.seed.random(40)`. Golden basic/00000 (battle seed
  // 94448464): TRP 0|…|time 11, TRP 1|…|time 21, TRP 2|…|time 12 are battle-rand draws
  // #4, #9 and #15 (0-based) mod 40; the draws before each are weapon ammo / spare-weapon
  // draws of Trooper.init, not ported yet (Task 6+).
  const r = new Rand(94448464);
  const draws = Array.from({ length: 16 }, () => r.random(40));
  assert.equal(draws[4], 11);
  assert.equal(draws[9], 21);
  assert.equal(draws[15], 12);
});

test("Num: mm, clamp, sMod, hMod", () => {
  assert.equal(Num.mm(5, 0, 3), 3);
  assert.equal(Num.mm(-1, 0, 3), 0);
  assert.equal(Num.clamp(0, 5, 3), 3);
  assert.equal(Num.clamp(0, -2, 3), 0);
  assert.equal(Num.clamp(0, 2, 3), 2);
  assert.equal(Num.sMod(7, 3), 1);
  assert.equal(Num.sMod(-1, 3), 2);
  assert.equal(Num.sMod(5, 0), 5);
  assert.equal(Num.hMod(7, 3), 1);
  assert.equal(Num.hMod(-7, 3), -1);
});

test("BMath.bresenham follows the decompiled (swap-quirk) algorithm", () => {
  assert.deepEqual(BMath.bresenham(0, 0, 3, 0), [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ]);
  assert.deepEqual(BMath.bresenham(0, 0, 4, 2), [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 2 },
  ]);
});

test("Arr.shuffle uses rand.random(len + 1) with pop/insert order", () => {
  const a = [1, 2, 3, 4, 5];
  Arr.shuffle(a, new Rand(42));
  // replay by hand
  const r = new Rand(42);
  const src = [5, 4, 3, 2, 1];
  const out: number[] = [];
  while (src.length > 0) out.splice(r.random(out.length + 1), 0, src.pop()!);
  assert.deepEqual(a, out);
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
});
