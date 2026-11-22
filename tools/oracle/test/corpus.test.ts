import { test } from "node:test";
import assert from "node:assert/strict";
import type { BattleInput, BattleTrooperInput } from "@mt/engine";
import { CORPUS_TAGS, corpusFullSize, generateCorpus, type CorpusTag } from "../src/corpus.ts";
import { RAT_SKILLS, SKILL_COUNT, SKILL_GEN } from "../src/data/skills.ts";
import { SkillGuide } from "../src/skillGuide.ts";

const troopers = (b: BattleInput): BattleTrooperInput[] => b.armies.flatMap((a) => a.troopers);
const level = (t: BattleTrooperInput): number => t.choices.length + 1;
const gen = (tag: CorpusTag, count = 60, seed = 7) => generateCorpus({ seed, count, tag });

const assertWellFormed = (b: BattleInput): void => {
  const all = troopers(b);
  assert.deepEqual(
    all.map((t) => t.id),
    all.map((_, i) => i),
    "ids are 0..n-1, left army first",
  );
  for (const a of b.armies) {
    assert.deepEqual(a.spawnOrder, a.troopers.map((t) => t.id));
    assert.ok(Number.isInteger(a.faction) && a.faction >= 0 && a.faction <= 5);
  }
  assert.ok(b.attackerSide === 0 || b.attackerSide === 1);
  assert.ok(b.background.id >= 0 && b.background.id <= 4);
  assert.ok(Number.isInteger(b.seed) && b.seed >= 0 && b.seed <= 2147483646);
  for (const t of all) {
    assert.ok(t.choices.every((c) => c === 0 || c === 1));
    assert.ok(t.force.every((f) => Number.isInteger(f) && f >= 0 && f < SKILL_COUNT));
    assert.ok(Number.isInteger(t.seed) && t.seed >= 0 && t.seed <= 2147483646);
  }
};

test("every tag is deterministic, prefix-stable and well formed", () => {
  for (const tag of CORPUS_TAGS) {
    const a = gen(tag);
    assert.deepEqual(a, gen(tag), `${tag}: same seed, same corpus`);
    assert.notDeepEqual(a, gen(tag, 60, 8), `${tag}: other seed, other corpus`);
    assert.deepEqual(gen(tag, 10), a.slice(0, 10), `${tag}: prefix-stable (capture resume)`);
    a.forEach(assertWellFormed);
  }
});

test("basic: level 1, 1-6 troopers per side", () => {
  for (const b of gen("basic", 200)) {
    for (const a of b.armies) assert.ok(a.troopers.length >= 1 && a.troopers.length <= 6);
    for (const t of troopers(b)) {
      assert.equal(level(t), 1);
      assert.deepEqual(t.force, []);
      assert.equal(t.type, 0);
    }
  }
});

test("levels: levels 1-30, all reached", () => {
  const seen = new Set<number>();
  for (const b of gen("levels", 200)) {
    for (const t of troopers(b)) {
      assert.ok(level(t) >= 1 && level(t) <= 30);
      seen.add(level(t));
    }
  }
  assert.equal(seen.size, 30);
});

test("forced-skill: every skill forced at least once, including >3 equipment", () => {
  const n = corpusFullSize("forced-skill");
  assert.ok(n !== null && n >= SKILL_COUNT);
  const all = gen("forced-skill", n);
  assert.equal(all.length, n);
  assert.equal(gen("forced-skill", n + 50).length, n, "capped at the full size");
  const forced = new Set(all.flatMap((b) => troopers(b).flatMap((t) => t.force)));
  for (let k = 0; k < SKILL_COUNT; k++) assert.ok(forced.has(k), `skill ${k} forced`);
  const isEquip = (k: number) => SKILL_GEN[k]!.cats.includes("EQUIPMENT");
  assert.ok(all.some((b) => troopers(b).some((t) => t.force.filter(isEquip).length > 3)));
});

test("vehicles / specialists: level >= 7, choices steered", () => {
  const isVehicle = (k: number) => SKILL_GEN[k]!.cats.includes("VEHICULE");
  const isJob = (k: number) => SKILL_GEN[k]!.cats.includes("ARMY_JOB");
  for (const [tag, want] of [
    ["vehicles", isVehicle],
    ["specialists", isJob],
  ] as const) {
    let hit = 0;
    let n = 0;
    for (const b of gen(tag, 100)) {
      for (const t of troopers(b)) {
        assert.ok(level(t) >= 7 && level(t) <= 30, `${tag}: level ${level(t)}`);
        const g = new SkillGuide(t.seed);
        for (const c of t.choices) g.pick(c);
        n++;
        if (g.skills.some(want)) hit++;
      }
    }
    // Random 0/1 choices give ~55% for vehicles (seed 7); steering gives ~75%.
    assert.ok(hit / n > 0.7, `${tag}: ${hit}/${n} troopers predicted to get a target skill`);
  }
});

test("large: 20-32 troopers per side", () => {
  for (const b of gen("large", 30)) {
    for (const a of b.armies) assert.ok(a.troopers.length >= 20 && a.troopers.length <= 32);
  }
});

test("rats: rat army (type 2, 2 rat skills, pref null) vs 1-12 humans", () => {
  for (const b of gen("rats", 100)) {
    const [humans, rats] = b.armies;
    assert.ok(humans.troopers.length >= 1 && humans.troopers.length <= 12);
    assert.ok(humans.troopers.every((t) => t.type === 0));
    assert.ok(rats.troopers.length >= 1);
    for (const r of rats.troopers) {
      assert.equal(r.type, 2);
      assert.equal(r.pref, null);
      assert.deepEqual(r.choices, []);
      assert.equal(r.force.length, 2);
      assert.notEqual(r.force[0], r.force[1]);
      assert.ok(r.force.every((f) => (RAT_SKILLS as readonly number[]).includes(f)));
    }
  }
});

test("edge: 1v1, empty side, extreme seeds, 12 level-30 troopers", () => {
  const n = corpusFullSize("edge");
  assert.ok(n !== null);
  const all = gen("edge", n);
  assert.equal(all.length, n);
  const sizes = all.map((b) => b.armies.map((a) => a.troopers.length).join("v"));
  assert.ok(sizes.includes("1v1"));
  assert.ok(sizes.some((s) => s.startsWith("0v") || s.endsWith("v0")));
  for (const s of [0, 1, 2147483646]) {
    assert.ok(all.some((b) => b.seed === s), `battle seed ${s}`);
    assert.ok(all.some((b) => troopers(b).some((t) => t.seed === s)), `trooper seed ${s}`);
  }
  assert.ok(all.some((b) => b.armies.some((a) => a.troopers.length === 12 && a.troopers.every((t) => level(t) === 30))));
});
