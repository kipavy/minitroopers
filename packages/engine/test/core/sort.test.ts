import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { as3Sort } from "../../src/core/sort.ts";

// Expected outputs come from Ruffle itself (commit a111ceec), not from our port:
//
// 1. Ruffle's own regression test tests/tests/swfs/avm2/array_sort_random (Test.as + output.txt,
//    copied verbatim to fixtures/ruffle-array_sort_random.output.txt; Ruffle is MIT/Apache-2.0,
//    see NOTICE). It sorts 0..49 with a comparator whose results come from a xorshift PRNG
//    (1 call in 8 returns 0: tie-heavy and inconsistent), tracing every comparison. Added with
//    commit 725d887c "avm2: replace Rust's sort by avmplus' for `Array` sorts"; the trace pins
//    the exact sequence of comparisons, not just the final permutation.
// 2. Cases traced by hand through core/src/avm2/globals/array.rs `qsort` (l.801-883) as written.

const FIXTURE = new URL("./fixtures/ruffle-array_sort_random.output.txt", import.meta.url);

test("as3Sort replays Ruffle's array_sort_random test (every comparison and the result)", () => {
  // Test.as: `var rngState: int = 0x12345678; function rng(): int { rngState ^= rngState << 13;
  // rngState ^= rngState >>> 17; rngState ^= rngState << 5; return rngState; }`
  let s = 0x12345678 | 0;
  const rng = (): number => {
    s = (s ^ (s << 13)) | 0;
    s = (s ^ (s >>> 17)) | 0;
    s = (s ^ (s << 5)) | 0;
    return s;
  };
  const out: string[] = [];
  const array: number[] = [];
  for (let i = 0; i < 50; i++) array.push(i);
  as3Sort(array, (a, b) => {
    const r = rng();
    if (r % 8 === 0) {
      out.push(`cmp: ${a} == ${b}`);
      return 0;
    } else if (r > 0) {
      out.push(`cmp: ${a} > ${b}`);
      return 1;
    } else {
      out.push(`cmp: ${a} < ${b}`);
      return -1;
    }
  });
  out.push("// contents of array");
  out.push(array.join(","));
  const expected = readFileSync(FIXTURE, "utf8").replace(/\r\n/g, "\n").trimEnd().split("\n");
  assert.equal(expected.length, 210);
  assert.deepEqual(out, expected);
});

test("as3Sort: all-ties comparator (always 0) leaves the middle element first", () => {
  // len 5: swap(0, 2) → [2,1,0,3,4]; left scan never sees > 0 → left = 5; right scan never sees
  // < 0 → right = 0; right < left → swap(0, 0); fst = [0,0), snd = [5,5): both empty.
  assert.deepEqual(as3Sort([0, 1, 2, 3, 4], () => 0), [2, 1, 0, 3, 4]);
  // len 3 fast path: no comparison is > 0 → unchanged.
  assert.deepEqual(as3Sort([0, 1, 2], () => 0), [0, 1, 2]);
});

test("as3Sort: always-greater comparator (never 0, never < 0)", () => {
  // len 4: swap(0, 2) → [2,1,0,3]; left stops at 1 (cmp > 0); right runs down to 0;
  // swap(0, 0); fst = [0,0) (len 0) < snd = [1,4) (len 3) → no swap; snd [1,0,3] through the
  // 3-element fast path: >  → [0,1,3]; > → [0,3,1]; > → [3,0,1].
  assert.deepEqual(as3Sort([0, 1, 2, 3], () => 1), [2, 3, 0, 1]);
});

test("as3Sort: never-0 comparator on equal keys (Battle event order)", () => {
  // cmp(x, y) = x.t < y.t ? -1 : 1 (Battle.§R\x01V}\x01§) on 5 equal keys:
  // [0,1,2,3,4] → swap(0, 2) → [2,1,0,3,4]; left stops at 1 (cmp > 0); right scan: cmp is never
  // < 0, runs down to 0; right < left → swap(0, 0); fst = [], snd = [1..5) = [1,0,3,4]
  // (len 4): swap(0, 2) → [3,0,1,4]; left stops at 1; right → 0; snd = [0,1,4] (len 3):
  // cmp(0,1) > 0 → [1,0,4]; cmp(0,4) > 0 → [1,4,0]; cmp(1,4) > 0 → [4,1,0].
  const evs = [0, 1, 2, 3, 4].map((i) => ({ t: 0, i }));
  as3Sort(evs, (a, b) => (a.t < b.t ? -1 : 1));
  assert.deepEqual(
    evs.map((e) => e.i),
    [2, 3, 4, 1, 0],
  );
});

test("as3Sort: NaN comparator result counts as Equal (array.rs l.1077-1083)", () => {
  assert.deepEqual(as3Sort([0, 1, 2, 3, 4], () => NaN), [2, 1, 0, 3, 4]);
});

test("as3Sort: consistent comparators sort", () => {
  assert.deepEqual(as3Sort([5, 3, 9, 1, 7, 3, 8], (a, b) => a - b), [1, 3, 3, 5, 7, 8, 9]);
  assert.deepEqual(as3Sort([2, 1], (a, b) => a - b), [1, 2]);
  assert.deepEqual(as3Sort([3, 2, 1], (a, b) => a - b), [1, 2, 3]);
  assert.deepEqual(as3Sort([], (a: number, b: number) => a - b), []);
});
