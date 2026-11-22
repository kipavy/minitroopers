import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { BattleInput } from "../../src/input/types.ts";
import { simulateBattle } from "../../src/simulate.ts";
import type { BattleRecord } from "../../src/simulate.ts";
import { as3Sort } from "../../src/core/sort.ts";

// Golden traces are read as data (no code is imported from tools/).
const GOLDEN = fileURLToPath(new URL("../../../../tools/oracle/golden/", import.meta.url));

interface Golden {
  input: BattleInput;
  record: BattleRecord;
}

const load = (tag: string, file: string): Golden =>
  JSON.parse(gunzipSync(readFileSync(GOLDEN + tag + "/" + file)).toString("utf8")) as Golden;

const lines = (r: BattleRecord): string[] => [
  ...r.troopers.map((t) => t.line),
  ...r.events,
  `END ${r.winner === null ? "null" : r.winner}|${r.graveyard.join(",")}`,
];

const assertSame = (tag: string, file: string): void => {
  const g = load(tag, file);
  const exp = lines(g.record);
  const act = lines(simulateBattle(g.input));
  for (let i = 0; i < Math.max(exp.length, act.length); i++) {
    if (exp[i] !== act[i]) assert.fail(`${tag}/${file} line ${i}\n  expected: ${exp[i]}\n  actual:   ${act[i]}`);
  }
};

for (const tag of ["basic", "edge"]) {
  test(`simulateBattle matches every ${tag} golden (TRP, EV, END)`, () => {
    const files = readdirSync(GOLDEN + tag).filter((f) => f.endsWith(".json.gz"));
    assert.ok(files.length > 0);
    for (const f of files) assertSame(tag, f);
  });
}

// Ruffle's Array.sort (avmplus QuickSort port) is not a stable sort: these goldens diverge from
// the TRP/EV sequence when the deploy/event sorts use JS Array.prototype.sort instead (checked by
// swapping the implementation: large/00003 diverges at line 30, large/00016 at line 27).
test("as3Sort reproduces Ruffle's sort on goldens that a stable sort breaks", () => {
  assertSame("large", "00003.json.gz");
  assertSame("large", "00016.json.gz");
});

test("as3Sort: small cases and the never-0 comparator", () => {
  // Never-zero comparator (Battle.§R\x01V}\x01§): equal keys are not kept in input order.
  const cmp = (a: { t: number }, b: { t: number }): number => (a.t < b.t ? -1 : 1);
  const evs = [0, 1, 2, 3, 4].map((i) => ({ t: 0, i }));
  as3Sort(evs, cmp);
  // Pivot = element 2 swapped to the front, then partitioned: deterministic but not stable.
  assert.deepEqual(
    evs.map((e) => e.i),
    as3SortReference(5),
  );
  const nums = [5, 3, 9, 1, 7, 3, 8];
  assert.deepEqual(as3Sort(nums.slice(), (a, b) => a - b), [1, 3, 3, 5, 7, 8, 9]);
  assert.deepEqual(as3Sort([2, 1], (a, b) => a - b), [1, 2]);
  assert.deepEqual(as3Sort([3, 2, 1], (a, b) => a - b), [1, 2, 3]);
});

/** Hand-traced Ruffle qsort on 5 equal keys with a never-0 comparator (`cmp(x, y) = 1`). */
function as3SortReference(n: number): number[] {
  assert.equal(n, 5);
  // [0,1,2,3,4] → swap(0, 2) → [2,1,0,3,4]; left scan stops at 1 (cmp > 0); right scan: cmp is
  // never < 0, runs down to 0; right < left → swap(0, 0); fst = [] , snd = [1..5) = [1,0,3,4]
  // (len 4): swap(0, 2) → [3,0,1,4]; left stops at 1; right → 0; snd = [0,1,4] (len 3):
  // cmp(0,1) > 0 → [1,0,4]; cmp(0,4) > 0 → [1,4,0]; cmp(1,4) > 0 → [4,1,0].
  return [2, 3, 4, 1, 0];
}
