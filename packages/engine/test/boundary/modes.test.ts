// Archived mission and raid battles (RECON3 §1): up to 132 troopers, many rats. The engine must accept
// each input and find the archived winner. Fixtures: tools/oracle/scripts/import-modes.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { simulateOutcome, validateBattleInput, type BattleInput } from "../../src/index.ts";

interface ModeFixture {
  source: string;
  endMsg: string;
  winner: 0 | 1;
  notes: string[];
  input: BattleInput;
}

const DIR = new URL("../fixtures/modes/", import.meta.url);
const NAMES = [
  "com_b_view_miss1",
  "03602485362_b_view_miss1",
  "03602485362_b_view_miss2",
  "03602485362_b_view_miss3",
  "fr_b_view_miss1",
  "fr_b_view_miss2",
  "1100gex90_b_view_miss1",
  "1100gex90_b_view_miss2",
  "1100gex90_b_view_miss3",
  "fr_b_view_raid",
  "com_b_view_raid",
  "03602485362_b_view_raid",
  "1100gex90_b_view_raid",
];
const load = (name: string): ModeFixture =>
  JSON.parse(readFileSync(new URL(`${name}.json`, DIR), "utf8")) as ModeFixture;

test("the 13 archived mode battles are all there", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  assert.deepEqual(files.sort(), [...NAMES].sort());
});

for (const name of NAMES) {
  test(`${name}: valid input, engine finds the archived winner`, () => {
    const { input, winner } = load(name);
    assert.deepEqual(validateBattleInput(input), { ok: true });
    assert.equal(simulateOutcome(input).winner, winner);
  });
}

test("shapes: epic mission 32 vs 100, extermination with 4 rats", () => {
  const epic = load("1100gex90_b_view_miss2").input;
  assert.equal(epic.armies[0].troopers.length, 32);
  assert.equal(epic.armies[1].troopers.length, 100);
  const rats = load("03602485362_b_view_miss1").input.armies[1].troopers;
  assert.equal(rats.length, 4);
  assert.ok(rats.every((t) => t.type === 2));
});
