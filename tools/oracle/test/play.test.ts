// client_fr_play.swf (assets/swf): client_fr.swf with only the `chk` check bypassed. Loaded in
// Ruffle web (same runner as the oracle) with the engine boundary's own flashvars builders.
//
// What a battle exposes: the untouched client never tells JS who won. Its only JS callback is
// endBattle() (no argument), fired when the player clicks "continuer" on the end banner — and
// that click does not reach the button under Ruffle web. The banner itself carries the result:
// title VICTOIRE when the winner is the attacker's side (viewer = attacker), DEFAITE otherwise
// (decompile: end screen `new r`M8(winner, attackerSide)`, title = Data.XXX[winner == attackerSide ? 5 : 6]).
// So the strongest check available is the banner title, rendered by the SWF from the battle it
// replayed itself, compared byte for byte with two reference crops (test/fixtures/banner-*.png,
// captured once from the SWF and checked by eye).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { battleData, clientParams, gridData, simulateOutcome, trooperData } from "@mt/engine";
import type { BattleInput, BattleTrooperInput, ClientGrid } from "@mt/engine";
import { OracleRunner, PLAY_SWF, chromiumAvailable, type OracleTrace } from "../src/runner.ts";

const GOLDEN_DIR = new URL("../golden/", import.meta.url);
const goldenTags = (): string[] =>
  readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
const readGoldens = (tag: string): { file: string; trace: OracleTrace }[] =>
  readdirSync(new URL(`${tag}/`, GOLDEN_DIR))
    .filter((f) => f.endsWith(".json.gz"))
    .sort()
    .map((file) => ({
      file,
      trace: JSON.parse(gunzipSync(readFileSync(new URL(`${tag}/${file}`, GOLDEN_DIR))).toString("utf8")) as OracleTrace,
    }));

const fix = (name: string): Buffer => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const VICTORY = fix("banner-victoire.png");
const DEFEAT = fix("banner-defaite.png");

test("client_fr_play.swf matches its committed .sha256 and differs from the original", () => {
  const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
  const committed = readFileSync(new URL("../../../assets/swf/client_fr_play.swf.sha256", import.meta.url), "utf8").split(/\s/)[0];
  assert.equal(sha(readFileSync(PLAY_SWF)), committed);
  const original = readFileSync(new URL("../../../assets/swf/SHA256SUMS", import.meta.url), "utf8").match(/^(\w+) \*client_fr\.swf$/m)![1];
  assert.notEqual(committed, original);
});

/** 20 goldens: per tag (alphabetical), the shortest battle won by the attacker and the shortest lost. */
const pick = (): { id: string; input: BattleInput }[] => {
  const out: { id: string; input: BattleInput; n: number; won: boolean }[] = [];
  for (const tag of goldenTags()) {
    if (["regression", "large", "helicopter"].includes(tag)) continue; // long battles: the replay is real time (helicopter: > 5 min)
    const gs = readGoldens(tag).map((g) => ({
      id: `${tag}/${g.file}`,
      input: g.trace.input,
      n: g.trace.record.events.length,
      won: g.trace.record.winner === g.trace.input.attackerSide,
    }));
    for (const won of [true, false]) {
      const best = gs.filter((g) => g.won === won).sort((a, b) => a.n - b.n)[0];
      if (best) out.push(best);
    }
  }
  return out.slice(0, 20);
};

const BASE = 8; // body margin: the 720x440 embed sits at (8, 8) of the page
const clip = { x: BASE + 300, y: BASE + 160, width: 120, height: 24 };

const available = await chromiumAvailable();
const runner = new OracleRunner();
after(() => runner.close());

const hardErrors = (errors: string[]): string[] => errors.filter((e) => !e.startsWith("warn:"));

test("20 goldens replay in client_fr_play.swf: the end banner shows the engine's winner", { timeout: 1_800_000 }, async (t) => {
  if (!available) {
    t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
    return;
  }
  const picked = pick();
  assert.equal(picked.length, 20);
  const wins = picked.filter((p) => simulateOutcome(p.input).winner === p.input.attackerSide).length;
  assert.ok(wins >= 6 && picked.length - wins >= 6, `outcome mix ${wins}/${picked.length}`);
  const results: string[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < picked.length; i = next++) {
      const { id, input } = picked[i]!;
      const expected = simulateOutcome(input).winner === input.attackerSide ? VICTORY : DEFEAT;
      const run = await runner
        .runPlay((o) => clientParams(battleData(input, `${o}/swf/army.swf`)), {
          timeoutMs: 240_000,
          battle: { clip, ready: (png) => png.equals(VICTORY) || png.equals(DEFEAT) },
        })
        .catch((e: unknown) => {
          throw new Error(`${id}: ${(e as Error).message}`);
        });
      assert.deepEqual(hardErrors(run.errors), [], id);
      assert.ok(run.shot.equals(expected), `${id}: banner is ${run.shot.equals(VICTORY) ? "VICTOIRE" : "DEFAITE"}, engine says ${expected === VICTORY ? "VICTOIRE" : "DEFAITE"}`);
      results.push(id);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  assert.equal(results.length, 20);
});

const original = JSON.parse(readFileSync(new URL("../../../packages/engine/test/boundary/fixtures/original-pages.json", import.meta.url), "utf8")) as {
  trooper: { trooper: BattleTrooperInput; faction: number };
  grid: { grid: ClientGrid };
};

test("mode 2 (trooper of t_0.html) loads without Ruffle error and draws", async (t) => {
  if (!available) return t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
  const { trooper, faction } = original.trooper;
  const run = await runner.runPlay((o) => clientParams(trooperData(trooper, faction, `${o}/swf/mini.swf`)));
  assert.deepEqual(hardErrors(run.errors), []);
  assert.ok(run.shot.length > 4000, "the trooper card is drawn");
});

test("mode 4 (grid of hq-levelup.html) loads without Ruffle error and draws", async (t) => {
  if (!available) return t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
  const { grid } = original.grid;
  const run = await runner.runPlay((o) => clientParams(gridData(grid, `${o}/swf/mini.swf`)));
  assert.deepEqual(hardErrors(run.errors), []);
  assert.ok(run.shot.length > 4000, "the grid is drawn");
});
