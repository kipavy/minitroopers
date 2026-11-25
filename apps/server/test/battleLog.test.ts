import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { BattleInput } from "@mt/engine";
import { Battle, simulateBattle } from "@mt/engine/internal";
import { battleLog, markStalemate, segPlain, type LogLine, type Seg } from "../src/battleLog.ts";

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
      assert.equal(log.length, rec.events.length, "one line per history entry");
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

/** The plain text of a line's segments (what player.js draws, without the styling). */
const segText = (l: LogLine): string => (l.s ?? []).map(segPlain).join("");

for (const tag of ["basic", "vehicles", "rats", "comms", "large"]) {
  test(`battleLog: ${tag}: segments spell the text; clock = running max of the entry times, warp below it`, () => {
    for (const input of load(tag)) {
      const b = new Battle(input);
      b.run();
      const log = battleLog(input, NAMES);
      let max = 0;
      log.forEach((l, k) => {
        assert.equal(segText(l), l.t, `line ${k}: segments = text`);
        const time = b.history[k]!.time | 0;
        assert.equal(l.x === 1, time < max, `line ${k}: warp iff its time (${time}) is below the clock (${max})`);
        max = Math.max(max, time);
        assert.equal(l.c, max, `line ${k}: clock`);
      });
    }
  });
}

test("battleLog: deploys, HUD, moves, weapons, factions and heads as segments", () => {
  const all = ["basic", "vehicles", "rats", "large"].flatMap((tag) => load(tag).map((input) => ({ input, log: battleLog(input, NAMES) })));
  const segs = all.flatMap(({ log }) => log.flatMap((l) => l.s ?? []));
  const kinds = (k: string) => segs.filter((s): s is Exclude<Seg, string> => typeof s === "object" && k in s);
  // deploy lines: "<army> déploie : A, B (en Moto)"
  const deploys = all.flatMap(({ log }) => log.filter((l) => / déploie : /.test(l.t)));
  assert.ok(deploys.length > 0, "deploy lines");
  for (const l of deploys) assert.ok(l.s!.some((s) => typeof s === "object" && "a" in s), "the deploying army");
  // HUD lines: pool, deploys, com, sabotage
  const huds = kinds("h");
  assert.ok(huds.length > 0, "HUD lines");
  for (const h of huds) assert.equal((h as { h: unknown[] }).h.length, 4);
  // moves with coordinates
  assert.ok(all.some(({ log }) => log.some((l) => /se déplace en \(\d+, \d+\)/.test(l.t))), "moves");
  assert.ok(kinds("xy").length > 0, "coordinates");
  // shots name the weapon, with its cell of the game's weapon sheet (8 columns of 7 rows); fists have none
  const weapons = kinds("w") as { w: string; g?: [number, number] }[];
  assert.ok(weapons.some((w) => w.g !== undefined), "weapons with icons");
  for (const w of weapons) if (w.g) assert.ok(w.g[0] >= 0 && w.g[0] < 8 && w.g[1] >= 0 && w.g[1] < 7, `icon of ${w.w}`);
  assert.ok(weapons.filter((w) => w.w === "Poings").every((w) => w.g === undefined), "no icon for fists");
  // equipment shows its equipment icon, other skills their skill icon
  const skills = kinds("k") as { k: string; e?: number; i?: number }[];
  assert.ok(skills.some((k) => k.e !== undefined), "equipment icons");
  for (const k of skills) if (k.e !== undefined) assert.ok(k.e >= 0 && k.e < 50 && k.i === undefined);
  // names carry their army's faction; rats are marked
  const names = kinds("n") as { n: string; f: number; u?: string }[];
  for (const n of names) assert.ok(n.f >= 0 && n.f <= 5, `faction of ${n.n}`);
  assert.ok(names.some((n) => n.u === "rat"), "rats marked");
  const factions = new Set(all.flatMap(({ input }) => input.armies.map((a) => a.faction)));
  for (const n of names) if (n.u === undefined) assert.ok(factions.has(n.f));
  // damage numbers and deaths
  assert.ok(kinds("d").length > 0 && kinds("x").length > 0, "damage and deaths");
});

test("markStalemate: Match nul lands on the last entry, no extra line", () => {
  // No committed golden ends in a stalemate (btime > 50000), so the finishing step is tested directly.
  const lines: LogLine[] = [{ i: 0, w: 0, t: "A tire sur B : 3 dégâts", c: 0 }, { i: 1, w: 0, t: "", c: 0 }];
  markStalemate(lines);
  assert.equal(lines.length, 2);
  assert.equal(lines.filter((l) => l.t).at(-1)!.t, "Match nul");
  const spoken: LogLine[] = [{ i: 0, w: 0, t: "A recharge", c: 0 }];
  markStalemate(spoken);
  assert.equal(spoken[0]!.t, "A recharge. Match nul");
  const none: LogLine[] = [];
  markStalemate(none);
  assert.deepEqual(none, []);
});
