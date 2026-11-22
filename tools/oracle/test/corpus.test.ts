import { test } from "node:test";
import assert from "node:assert/strict";
import type { BattleInput, BattleTrooperInput } from "@mt/engine";
import {
  CORPUS_TAGS,
  VEHICLE_SKILLS,
  corpusFullSize,
  generateCorpus,
  type CorpusTag,
} from "../src/corpus.ts";
import { RAT_SKILLS, SKILL_COUNT, SKILL_GEN } from "../src/data/skills.ts";

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

const isEquip = (k: number) => SKILL_GEN[k]!.cats.includes("EQUIPMENT");

test("forced-skill: each skill forced 3 times on a lone side-0 trooper; >3 equipment with leftOver", () => {
  const n = corpusFullSize("forced-skill");
  assert.equal(n, 3 * SKILL_COUNT + 9);
  const all = gen("forced-skill", n!);
  assert.equal(all.length, n);
  assert.equal(gen("forced-skill", n! + 50).length, n, "capped at the full size");
  const perSkill = new Map<number, Set<number>>();
  all.forEach((b, i) => {
    assert.equal(b.armies[0].troopers.length, 1, `#${i}: forced trooper alone on side 0`);
    assert.ok(b.armies[1].troopers.length >= 1 && b.armies[1].troopers.length <= 3);
    assert.ok(b.armies[1].troopers.every((t) => t.force.length === 0));
    const t = b.armies[0].troopers[0]!;
    if (i < 3 * SKILL_COUNT) {
      assert.deepEqual(t.force, [Math.floor(i / 3)]);
      const seeds = perSkill.get(t.force[0]!) ?? new Set();
      perSkill.set(t.force[0]!, seeds.add(b.seed));
    } else {
      assert.ok(t.force.length >= 4 && t.force.length <= 6 && t.force.every(isEquip));
      assert.ok(t.pref !== null);
      assert.deepEqual(t.pref.selectedItems, t.force.slice(0, 3));
      assert.deepEqual(t.pref.leftOver, t.force.slice(3));
    }
  });
  for (let k = 0; k < SKILL_COUNT; k++) assert.equal(perSkill.get(k)?.size, 3, `skill ${k}: 3 seeds`);
});

test("leftOver is [] everywhere except the forced-skill equipment extras", () => {
  for (const tag of CORPUS_TAGS) {
    const all = gen(tag, tag === "forced-skill" ? 3 * SKILL_COUNT : 60);
    for (const t of all.flatMap(troopers)) if (t.pref) assert.deepEqual(t.pref.leftOver, [], tag);
  }
});

test("vehicles: [PILOT, vehicle skill] forced first, companions after, every vehicle skill", () => {
  const seen = new Set<number>();
  for (const b of gen("vehicles", 100)) {
    const forced = b.armies[0].troopers.filter((t) => t.force[0] === 2);
    assert.ok(forced.length >= 1 && forced.length <= 2);
    assert.deepEqual(b.armies[0].troopers.slice(0, forced.length), forced, "pilots deploy first");
    const companions = b.armies[0].troopers.slice(forced.length);
    if (forced[0]!.force[1] === 42) {
      // heavy tank: 5 SCOUT companions -> 9 deploy squares, room for its 3x2 footprint
      assert.equal(companions.length, 5);
      assert.ok(companions.every((t) => t.force.length === 1 && t.force[0] === 4));
    } else {
      assert.ok(companions.length >= 1 && companions.length <= 3);
      assert.ok(companions.every((t) => t.force.length === 0));
    }
    for (const t of forced) {
      assert.equal(t.force.length, 2);
      assert.equal(t.force[0], 2);
      assert.ok((VEHICLE_SKILLS as readonly number[]).includes(t.force[1]!));
      assert.ok(level(t) >= 15 && level(t) <= 30);
      seen.add(t.force[1]!);
    }
    assert.ok(b.armies[1].troopers.every((t) => t.force.length === 0));
  }
  assert.equal(seen.size, VEHICLE_SKILLS.length);
});

test("specialists: each of the 8 specializations forced, plus opened skills, level 7-30", () => {
  const jobs = new Set<number>();
  let withOpen = 0;
  for (const b of gen("specialists", 100)) {
    for (const t of b.armies[0].troopers) {
      const job = t.force[0]!;
      assert.ok(job >= 0 && job <= 7);
      assert.ok(level(t) >= 7 && level(t) <= 30);
      if (t.force.length === 2) {
        assert.ok(SKILL_GEN[job]!.open.includes(t.force[1]!));
        withOpen++;
      } else assert.equal(t.force.length, 1);
      jobs.add(job);
    }
  }
  assert.equal(jobs.size, 8);
  assert.ok(withOpen > 0);
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

test("comms / martyr-saviour / jet / sabotage: the forced rare-mechanic troopers", () => {
  const forced = (tag: CorpusTag, side: 0 | 1) =>
    gen(tag, 40).map((b) => b.armies[side].troopers.map((t) => t.force));
  for (const f of forced("comms", 0)) {
    const officers = f.filter((x) => x[0] === 6);
    assert.ok(officers.length >= 2 && officers.length <= 3);
    assert.ok(officers.every((x) => x.length === 1 || x[1] === 109));
  }
  for (const f of forced("comms", 1)) assert.ok(f.every((x) => x.length === 0 || (x.length === 1 && x[0] === 4)));
  for (const side of [0, 1] as const) {
    for (const f of forced("martyr-saviour", side)) {
      assert.deepEqual(f.slice(0, 4), [[139], [139], [1, 111], [1, 111]]);
    }
  }
  for (const f of forced("jet", 0)) assert.deepEqual(f[0], [2, 40]);
  for (const f of forced("sabotage", 0)) assert.deepEqual(f[0], [7]);
});

test("helicopter: 2-3 [PILOT, HELICOPTER] vs 20-32 shotgun/knife troopers", () => {
  for (const b of gen("helicopter", 40)) {
    const pilots = b.armies[0].troopers.filter((t) => t.force[0] === 2 && t.force[1] === 41);
    assert.ok(pilots.length >= 2 && pilots.length <= 3);
    assert.ok(b.armies[1].troopers.length >= 20 && b.armies[1].troopers.length <= 32);
    for (const t of b.armies[1].troopers) assert.ok([13, 14, 15, 16, 17, 37].includes(t.force[0]!));
  }
});
