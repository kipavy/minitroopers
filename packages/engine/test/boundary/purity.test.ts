// The engine source must stay I/O-free and deterministic: no Node APIs, no process, no unseeded
// randomness, no clock (comments included, to keep greps of the source unambiguous).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".ts") ? [join(dir, d.name)] : [],
  );

test("packages/engine/src uses no node:, process., Math.random or Date", () => {
  const all = files(SRC);
  assert.ok(all.length > 20);
  const bad: string[] = [];
  for (const f of all) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/node:|process\.|Math\.random|\bDate\b/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(bad, []);
});

test("Data tables are deeply frozen", async () => {
  const { Data } = await import("../../src/index.ts");
  for (const t of [Data.SKILL, Data.WEAPON, Data.VEHICULE, Data.STATUS, Data.COMS, Data.XP_LEVELS, Data.DEPLOY_ORDER]) {
    assert.ok(Object.isFrozen(t));
  }
  assert.ok(Object.isFrozen(Data.skillRow(1)));
  assert.ok(Object.isFrozen(Data.skillRow(1).open));
  assert.throws(() => {
    (Data.XP_LEVELS as number[])[1] = 0;
  }, TypeError);
});
