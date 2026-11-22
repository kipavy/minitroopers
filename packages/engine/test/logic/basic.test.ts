import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { BattleInput } from "../../src/input/types.ts";
import { simulateBattle } from "../../src/simulate.ts";
import type { BattleRecord } from "../../src/simulate.ts";

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

// Hand-traced and Ruffle-sourced sort cases: test/core/sort.test.ts.
