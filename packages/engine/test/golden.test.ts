// Replays every committed oracle golden (tools/oracle/golden/**) through the engine, without
// Ruffle: the engine must reproduce the SWF's trace line for line. Reads the files only (the
// engine package never imports tools/). Uses the step cap, a harness guard (see simulate.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { simulateBattleCapped, DEFAULT_MAX_STEPS, ENGINE_VERSION } from "../src/index.ts";
import type { BattleInput, BattleRecord } from "../src/index.ts";

const GOLDEN_DIR = join(import.meta.dirname, "../../../tools/oracle/golden");

const flatten = (r: BattleRecord): string[] => [
  ...r.troopers.map((t) => t.line),
  ...r.events,
  `END ${r.winner === null ? "null" : r.winner}|${r.graveyard.join(",")}`,
];

const tags = readdirSync(GOLDEN_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

test("golden directory is populated", () => {
  assert.ok(tags.length >= 13, `expected the 13+ golden tags, found ${tags.length}`);
});

for (const tag of tags) {
  test(`golden replay: ${tag}`, () => {
    const files = readdirSync(join(GOLDEN_DIR, tag)).filter((f) => f.endsWith(".json.gz")).sort();
    assert.ok(files.length > 0, `no golden in ${tag}`);
    for (const file of files) {
      const trace = JSON.parse(gunzipSync(readFileSync(join(GOLDEN_DIR, tag, file))).toString("utf8")) as {
        input: BattleInput;
        record: BattleRecord;
      };
      const expected = flatten(trace.record);
      const actual = flatten(simulateBattleCapped(trace.input, DEFAULT_MAX_STEPS));
      const n = Math.max(expected.length, actual.length);
      for (let i = 0; i < n; i++) {
        if (expected[i] !== actual[i]) {
          assert.fail(
            `${tag}/${file}: divergence at line ${i}\n  expected: ${expected[i] ?? "<absent>"}\n  actual:   ${actual[i] ?? "<absent>"}`,
          );
        }
      }
    }
  });
}

test("engine version", () => {
  assert.equal(ENGINE_VERSION, "1.0.0");
});
