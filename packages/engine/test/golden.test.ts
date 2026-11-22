// Replays every committed oracle golden (tools/oracle/golden/**) through the engine, without
// Ruffle: the engine must reproduce the SWF's trace line for line. Reads the files only (the
// engine package never imports tools/). Uses the step cap, a harness guard (see simulate.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { ENGINE_VERSION } from "../src/index.ts";
import type { BattleInput } from "../src/index.ts";
import { simulateBattleCapped, DEFAULT_MAX_STEPS } from "../src/internal.ts";
import type { BattleRecord } from "../src/internal.ts";

const GOLDEN_DIR = join(import.meta.dirname, "../../../tools/oracle/golden");
// The trace SWF every committed golden was captured with (assets/oracle/client_fr_trace.swf).
const SWF_SHA256 = readFileSync(join(import.meta.dirname, "../../../assets/oracle/client_fr_trace.swf.sha256"), "utf8").split(/\s+/)[0];

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
        formatVersion: number;
        swfSha256: string;
        input: BattleInput;
        record: BattleRecord;
      };
      assert.equal(trace.formatVersion, 1, `${tag}/${file}: formatVersion`);
      assert.equal(trace.swfSha256, SWF_SHA256, `${tag}/${file}: swfSha256`);
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
  assert.equal(ENGINE_VERSION, "2.0.0");
});
