import { test } from "node:test";
import assert from "node:assert/strict";
import { armyPower, validateBattleInput } from "@mt/engine";
import type { BattleInput } from "@mt/engine";
import {
  FACTIONS, factionBattleArmy, fillerArmy, fillerBattleArmy, parseFillerId, pickOpponents, trooperName,
} from "../src/index.ts";
import type { ArmyRef } from "../src/index.ts";

// Trooper ids are global to a battle: the server numbers the defender after the attacker.
const input = (a: BattleInput["armies"][0], b: BattleInput["armies"][1]): BattleInput => ({
  seed: 1234,
  background: { gfx: "bg/garden.jpg", id: 0 },
  armies: [a, { ...b, spawnOrder: b.spawnOrder.map((i) => i + 100), troopers: b.troopers.map((t) => ({ ...t, id: t.id + 100 })) }],
  attackerSide: 0,
});

test("factions: 6 factions, ids 0..5, names and parts", () => {
  assert.deepEqual(FACTIONS.map((f) => f.id), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(FACTIONS.map((f) => [f.name, f.part, f.host]), [
    ["Sang-surs", 0, "sang-surs"],
    ["Soleil rugissant", 2, "soleil-rugissant"],
    ["Gecko nevrosé", 2, "gecko-nevrose"],
    ["Torses velus", 4, "torses-velus"],
    ["Fol-ecume", 0, "fol-ecume"],
    ["Groin céleste", 2, "groin-celeste"],
  ]);
});

test("factions: recovered rosters have exact names and seeds", () => {
  const roster = (id: number) => FACTIONS[id]!.troopers.map((t) => `${t.name} ${t.seed}`);
  assert.deepEqual(roster(0), ["Sgt.Krawney 31958229", "Jackersen 13652125", "Hulkows 6850416", "Russeham 17101081", "Sexy Anders 16589479", "Kevo Lee 25775299"]);
  assert.deepEqual(roster(1), ["MaxRogie 10203179", "Goldison 13114631", "Bombomes 3839934", "Burtersen 28544340", "Edu 23438256", "Georgater 24329918"]);
  assert.deepEqual(roster(2), ["Edeiber 20634579", "T-Joneves 21347269", "T-Kevemack 20668338", "Orlason 4687580", "Don Maxi 20021619", "Karlips 18331880"]);
  assert.deepEqual(roster(4), ["Maxoff-X 9879995", "Van Georgeed 8035197", "T-Davinson 14458708", "Goldi 23550997", "Harre 13619293", "Samips 23558064"]);
  assert.deepEqual(roster(5), ["Rogeter Samu 14997688", "Hulkito Kong 17249963", "G.I.Goldium 25279721", "Lukater Edo 23924483", "Rickas 21776570", "Kevewis 27803433"]);
  assert.equal(FACTIONS[3]!.verified, false);
  assert.deepEqual(FACTIONS.filter((f) => f.verified).map((f) => f.id), [0, 1, 2, 4, 5]);
});

test("factions: 6 troopers, ids 0..5, levels 20..10, power 114, valid battle input", () => {
  for (const f of FACTIONS) {
    assert.deepEqual(f.troopers.map((t) => t.id), [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(f.troopers.map((t) => t.level), [20, 18, 16, 14, 12, 10]);
    const a = factionBattleArmy(f);
    assert.equal(armyPower(a.troopers), 114);
    assert.deepEqual(a.spawnOrder, [0, 1, 2, 3, 4, 5]);
    assert.equal(a.faction, f.id);
    for (const t of a.troopers) {
      assert.equal(t.pref, null);
      assert.ok(t.choices.every((c) => c === 0));
    }
    assert.deepEqual(validateBattleInput(input(a, factionBattleArmy(FACTIONS[(f.id + 1) % 6]!))), { ok: true });
  }
  assert.equal(new Set(FACTIONS[3]!.troopers.map((t) => t.name)).size, 6);
});

test("fillerArmy: exact power, deterministic, valid battle input", () => {
  for (const power of [1, 5, 14, 39, 40, 75, 114, 300, 1000]) {
    const f = fillerArmy({ power, seed: 4242 });
    const target = Math.max(5, power);
    assert.ok(Math.abs(f.power - target) <= target * 0.2);
    assert.equal(armyPower(f.troopers), f.power);
    assert.deepEqual(fillerArmy({ power, seed: 4242 }), f);
    assert.ok(f.troopers.length >= 1 && f.troopers.length <= 12);
    assert.equal(new Set(f.troopers.map((t) => t.name)).size, f.troopers.length);
    const res = validateBattleInput(input(fillerBattleArmy(f), factionBattleArmy(FACTIONS[0]!)));
    assert.deepEqual(res, { ok: true });
  }
  assert.notDeepEqual(fillerArmy({ power: 114, seed: 1 }), fillerArmy({ power: 114, seed: 2 }));
});

test("fillerArmy: id round-trips", () => {
  const f = fillerArmy({ power: 60, seed: 99 });
  assert.deepEqual(parseFillerId(f.id), { power: 60, seed: 99 });
  assert.equal(parseFillerId("army-7"), null);
});

const real = (n: number, power: number): ArmyRef => ({ id: `a${n}`, power });
const base = { day: "2026-11-23", clientId: "c1" };

test("pickOpponents: exactly 5, distinct, without self, deterministic", () => {
  const self = real(0, 114);
  const candidates = Array.from({ length: 40 }, (_, i) => real(i, 20 + i * 5)); // a0 = self
  const a = pickOpponents({ self, candidates, ...base });
  assert.equal(a.length, 5);
  assert.equal(new Set(a.map((x) => x.id)).size, 5);
  assert.ok(a.every((x) => x.id !== self.id && !x.isFiller));
  assert.deepEqual(pickOpponents({ self, candidates, ...base }), a);
  assert.deepEqual(pickOpponents({ self, candidates: [...candidates].reverse(), ...base }), a);
});

test("pickOpponents: prefers the closest power", () => {
  const self = real(0, 100);
  const candidates = [real(0, 100), real(1, 101), real(2, 99), real(3, 104), real(4, 96), real(5, 105), real(6, 400), real(7, 12)];
  const ids = pickOpponents({ self, candidates, ...base }).map((x) => x.id).sort();
  assert.deepEqual(ids, ["a1", "a2", "a3", "a4", "a5"]);
});

test("pickOpponents: widens the window progressively", () => {
  const self = real(0, 100);
  const candidates = [real(1, 102), real(2, 98), real(3, 150), real(4, 60), real(5, 300), real(6, 900)];
  const out = pickOpponents({ self, candidates, ...base });
  assert.deepEqual(out.map((x) => x.id).sort(), ["a1", "a2", "a3", "a4", "a5"]); // 900 is farthest, left out
});

test("pickOpponents: real armies first, completed with fillers", () => {
  const self = real(0, 114);
  const out = pickOpponents({ self, candidates: [real(1, 110), real(2, 120)], ...base });
  assert.equal(out.length, 5);
  assert.deepEqual(out.filter((x) => !x.isFiller).map((x) => x.id).sort(), ["a1", "a2"]);
  const fillers = out.filter((x) => x.isFiller);
  assert.equal(fillers.length, 3);
  assert.equal(new Set(out.map((x) => x.id)).size, 5);
  for (const f of fillers) {
    assert.ok(Math.abs(f.power - 114) <= 114 * 0.2 + 1);
    const p = parseFillerId(f.id)!;
    assert.equal(fillerArmy(p).power, f.power);
  }
});

test("pickOpponents: no candidate, self-only or filler candidates -> 5 fillers; stable per (day, client)", () => {
  const self = real(0, 5);
  const none = pickOpponents({ self, candidates: [], ...base });
  assert.equal(none.length, 5);
  assert.ok(none.every((x) => x.isFiller));
  assert.equal(new Set(none.map((x) => x.id)).size, 5);
  assert.deepEqual(pickOpponents({ self, candidates: [self, { id: "f", power: 5, isFiller: true }], ...base }), none);
  assert.deepEqual(pickOpponents({ self, candidates: [], ...base }), none);
  assert.notDeepEqual(pickOpponents({ self, candidates: [], day: "2026-11-24", clientId: "c1" }), none);
  assert.notDeepEqual(pickOpponents({ self, candidates: [], day: base.day, clientId: "c2" }), none);
});

test("pickOpponents: duplicate candidate ids are counted once", () => {
  const self = real(0, 50);
  const out = pickOpponents({ self, candidates: [real(1, 50), real(1, 50), real(1, 50)], ...base });
  assert.equal(out.filter((x) => x.id === "a1").length, 1);
  assert.equal(out.length, 5);
});

test("trooperName still exported", () => {
  assert.equal(typeof trooperName, "function");
});
