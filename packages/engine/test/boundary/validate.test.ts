import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InvalidBattleInput,
  simulateOutcome,
  validateBattleInput,
  type BattleInput,
  type BattleTrooperInput,
} from "../../src/index.ts";
import { goldenTags, readGoldens } from "./goldens.ts";

const trooper = (id: number, seed: number): BattleTrooperInput => ({
  id,
  name: `T${id}`,
  seed,
  type: 0,
  choices: [0, 1, -1, 0],
  force: [],
  pref: { CWeapon: null, CBody: null, targetSystem: 0, targetType: 0, moveSystem: 1, leftOver: [] },
});

const base = (): BattleInput => ({
  seed: 12_345,
  background: { gfx: "bg/garden.jpg", id: 0 },
  armies: [
    { faction: 1, spawnOrder: [0], troopers: [trooper(0, 1_111_111)] },
    { faction: 2, spawnOrder: [1], troopers: [trooper(1, 2_222_222)] },
  ],
  attackerSide: 0,
});

const errorsOf = (input: BattleInput): string[] => {
  const r = validateBattleInput(input);
  assert.equal(r.ok, false, "expected the input to be rejected");
  return r.ok ? [] : r.errors;
};

test("validateBattleInput accepts a well-formed input", () => {
  assert.deepEqual(validateBattleInput(base()), { ok: true });
});

test("validateBattleInput rejects 0v0", () => {
  const i = base();
  i.armies[0].troopers = [];
  i.armies[1].troopers = [];
  assert.match(errorsOf(i).join("\n"), /both armies are empty/);
  // One empty side is accepted: the SWF handles it (oracle goldens edge/00002 and edge/00003).
  const j = base();
  j.armies[0].troopers = [];
  assert.deepEqual(validateBattleInput(j), { ok: true });
});

test("validateBattleInput rejects an unknown skill (force 9999)", () => {
  const i = base();
  i.armies[0].troopers[0]!.force = [9999];
  assert.match(errorsOf(i).join("\n"), /force.*9999/);
});

test("validateBattleInput rejects an unknown leftOver skill", () => {
  const i = base();
  i.armies[1].troopers[0]!.pref!.leftOver = [-1];
  assert.match(errorsOf(i).join("\n"), /leftOver/);
});

test("validateBattleInput rejects TrooperType 7", () => {
  const i = base();
  i.armies[0].troopers[0]!.type = 7;
  assert.match(errorsOf(i).join("\n"), /type.*7/);
});

test("validateBattleInput rejects a battle seed of 2^31 and a trooper seed of 1.5", () => {
  const i = base();
  i.seed = 2 ** 31;
  i.armies[1].troopers[0]!.seed = 1.5;
  const e = errorsOf(i).join("\n");
  assert.match(e, /^seed.*2147483648/m);
  assert.match(e, /armies\[1\]\.troopers\[0\]\.seed/);
});

test("validateBattleInput rejects a name with a lone surrogate, and names over 20", () => {
  const i = base();
  i.armies[0].troopers[0]!.name = "Bad\uD800name";
  i.armies[1].troopers[0]!.name = "x".repeat(21);
  const e = errorsOf(i).join("\n");
  assert.match(e, /armies\[0\]\.troopers\[0\]\.name.*UTF-16/);
  assert.match(e, /armies\[1\]\.troopers\[0\]\.name.*20/);
});

test("validateBattleInput rejects duplicate and negative trooper ids", () => {
  const i = base();
  i.armies[1].troopers[0]!.id = 0;
  assert.match(errorsOf(i).join("\n"), /duplicate.*id 0/);
  const j = base();
  j.armies[1].troopers[0]!.id = -3;
  assert.match(errorsOf(j).join("\n"), /id.*-3/);
});

test("validateBattleInput rejects out-of-range choices (index >= choiceCount, < -1)", () => {
  const i = base();
  i.armies[0].troopers[0]!.choices = [0, 3];
  assert.match(errorsOf(i).join("\n"), /choices\[1\].*3/);
  const j = base();
  j.armies[0].troopers[0]!.choices = [-2];
  assert.match(errorsOf(j).join("\n"), /choices\[0\]/);
});

test("validateBattleInput rejects enums out of range", () => {
  const i = base();
  i.background.id = 5;
  i.attackerSide = 2;
  i.armies[0].faction = 6;
  const p = i.armies[0].troopers[0]!.pref!;
  p.CWeapon = 38;
  p.CBody = 8;
  p.targetSystem = 4;
  p.moveSystem = 3;
  p.reloadSystem = 4;
  p.targetType = 1; // SPECIFIC_CLASS without targetClass
  const e = errorsOf(i).join("\n");
  for (const re of [/background/, /attackerSide/, /faction/, /CWeapon/, /CBody/, /targetSystem/, /moveSystem/, /reloadSystem/, /targetClass/]) {
    assert.match(e, re);
  }
});

test("simulateOutcome throws InvalidBattleInput on a rejected input", () => {
  const i = base();
  i.armies[0].troopers[0]!.type = 7;
  assert.throws(
    () => simulateOutcome(i),
    (err: unknown) => err instanceof InvalidBattleInput && err.errors.length > 0,
  );
});

for (const tag of goldenTags()) {
  test(`validateBattleInput accepts and simulateOutcome reproduces every golden (${tag})`, () => {
    for (const { file, trace } of readGoldens(tag)) {
      assert.deepEqual(validateBattleInput(trace.input), { ok: true }, `${tag}/${file}`);
      const o = simulateOutcome(trace.input);
      assert.equal(o.winner, trace.record.winner, `${tag}/${file} winner`);
      assert.deepEqual(o.graveyard, trace.record.graveyard, `${tag}/${file} graveyard`);
      assert.deepEqual(
        o.deployed,
        trace.record.troopers.map((t) => t.id),
        `${tag}/${file} deployed`,
      );
      assert.equal(o.events, trace.record.events.length, `${tag}/${file} events`);
    }
  });
}
