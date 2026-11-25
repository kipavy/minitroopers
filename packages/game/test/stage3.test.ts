import { test } from "node:test";
import assert from "node:assert/strict";
import { Rand, armyPower, validateBattleInput } from "@mt/engine";
import {
  RAT_SKILLS, armyComposition, dayRats, missionReward, npcArmy, pickInfiltrationTarget,
  ratArmy, raidPower, raidTrooperRange, epicPower, seedsOffering,
} from "../src/index.ts";

test("raid power and trooper range", () => {
  assert.deepEqual([1, 2, 11, 16, 20].map(raidPower), [11, 15, 326, 797, 1375]);
  assert.deepEqual(raidTrooperRange(1), { min: 1, max: 2 });
  assert.deepEqual(raidTrooperRange(11), { min: 32, max: 32 });
  assert.equal(epicPower(0), 326);
});

test("armyComposition: power Σ(4+level)", () => {
  for (let s = 0; s < 20; s++) {
    const l = armyComposition(11, 1, 2, new Rand(s));
    assert.ok(l.length === 1 || l.length === 2);
    assert.equal(l.reduce((a, v) => a + 4 + v, 0), 11);
  }
});

test("npcArmy: 32 troopers, power 325, seeds < 100000, valid", () => {
  const a = npcArmy({ power: 325, min: 32, max: 32, seed: 7, firstId: 0 });
  assert.equal(a.troopers.length, 32);
  assert.equal(armyPower(a.troopers), 325);
  assert.ok(a.troopers.every((t) => t.seed < 100000 && t.force.length === 0));
  const b = ratArmy(dayRats({ day: "d", armyId: 1, count: 1, salt: "s" }), 100);
  const r = validateBattleInput({ seed: 5, background: { gfx: "bg/garden.jpg", id: 0 }, armies: [b, a], attackerSide: 0 });
  assert.ok(r.ok, JSON.stringify(r));
});

test("dayRats / ratArmy", () => {
  const p = { day: "2026-11-23", armyId: 3, count: 4, salt: "x" };
  const r = dayRats(p);
  assert.equal(r.length, 4);
  for (const x of r) {
    assert.notEqual(x.force[0], x.force[1]);
    assert.ok(x.force.every((s) => RAT_SKILLS.includes(s)));
  }
  assert.deepEqual(dayRats(p), r);
  assert.notDeepEqual(dayRats({ ...p, day: "2026-11-24" }), r);
  const a = ratArmy(r, 1);
  assert.deepEqual(a.troopers.map((t) => t.id), [1, 2, 3, 4]);
  assert.deepEqual(a.spawnOrder, []);
  assert.equal(a.faction, 0);
});


test("pickInfiltrationTarget", () => {
  const c = [{ id: "a", power: 1 }, { id: "me", power: 1 }, { id: "b", power: 2 }];
  for (let i = 0; i < 30; i++) {
    const t = pickInfiltrationTarget({ self: "me", candidates: c, fought: ["a"], day: `d${i}`, armyId: 1 });
    assert.ok(t && t.id !== "me");
  }
  assert.equal(pickInfiltrationTarget({ self: "me", candidates: [c[1]!], fought: [], day: "d", armyId: 1 }), null);
  assert.equal(pickInfiltrationTarget({ self: "me", candidates: [], fought: [], day: "d", armyId: 1 }), null);
});

test("seedsOffering", () => {
  assert.deepEqual(seedsOffering(64, 3), [273027, 273048, 273071]);
  assert.equal(seedsOffering(64, 12)[11], 273347);
});
