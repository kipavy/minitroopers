import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { BattleInput } from "@mt/engine";
import { simulateBattle } from "@mt/engine/internal";
import { battleLog } from "../src/battleLog.ts";

const GOLDEN = join(import.meta.dirname, "../../../tools/oracle/golden");
const load = (tag: string, n = 3): BattleInput[] =>
  readdirSync(join(GOLDEN, tag))
    .filter((f) => f.endsWith(".json.gz"))
    .sort()
    .slice(0, n)
    .map((f) => (JSON.parse(gunzipSync(readFileSync(join(GOLDEN, tag, f))).toString("utf8")) as { input: BattleInput }).input);

const NAMES: [string, string] = ["Armée Alpha", "Armée Beta"];

for (const tag of ["basic", "rats", "large"]) {
  test(`battleLog: ${tag} goldens`, () => {
    for (const input of load(tag)) {
      const rec = simulateBattle(input);
      const log = battleLog(input, NAMES);
      const winLine = rec.winner === null ? "Match nul" : `Victoire de ${NAMES[rec.winner]}`;
      assert.equal(log.length, rec.events.length + (rec.winner === null ? 1 : 0), "one line per history entry");
      log.forEach((l, k) => assert.equal(l.i, k));
      const waves = rec.events.filter((e) => /\|39\(/.test(e)).length;
      assert.equal(new Set(log.map((l) => l.w)).size, waves + 1, "w = NewWave count + 1");
      assert.equal(log[0]!.w, 0);
      for (let k = 1; k < log.length; k++) assert.ok(log[k]!.w >= log[k - 1]!.w);
      const nonEmpty = log.filter((l) => l.t !== "");
      assert.ok(nonEmpty.length > 0);
      assert.equal(nonEmpty[nonEmpty.length - 1]!.t, winLine);
      for (const l of log) assert.doesNotMatch(l.t, /undefined|null|NaN|\[object/);
    }
  });
}

test("battleLog: names fall back without army names", () => {
  const input = load("rats", 1)[0]!;
  const log = battleLog(input);
  assert.match(log.filter((l) => l.t)!.at(-1)!.t, /^(Victoire de .+|Match nul)$/);
});

test("battleLog: damage and kills mention trooper names", () => {
  const input = load("basic", 1)[0]!;
  const text = battleLog(input, NAMES).map((l) => l.t).join("\n");
  assert.match(text, /tire sur .+ : \d+ dégâts?/);
  assert.match(text, /est mort/);
});
