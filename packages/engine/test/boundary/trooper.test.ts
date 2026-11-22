import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  choiceIndexForSkill,
  Data,
  defaultLeftOver,
  describeTrooper,
  generateTrooper,
  levelUpOptions,
  Rand,
  reequip,
  SKILL_CATEGORIES,
  SKILLS,
  WEAPONS,
  type BattleTrooperInput,
} from "../../src/index.ts";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/original-pages.json", import.meta.url), "utf8")) as {
  trooper: { trooper: BattleTrooperInput };
};

const human = (seed: number, choices: number[] = [], pref: BattleTrooperInput["pref"] = null): BattleTrooperInput => ({
  id: 0,
  name: "T",
  seed,
  type: 0,
  choices,
  force: [],
  pref,
});

const isJob = (s: number): boolean => Data.skillRow(s).cat.includes(SKILL_CATEGORIES.ARMY_JOB);
const isEquipment = (s: number): boolean => Data.skillRow(s).cat.includes(SKILL_CATEGORIES.EQUIPMENT);

test("levelUpOptions: 3 drawn, 2 shown without SMART", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const o = levelUpOptions(human(seed));
    assert.equal(o.choiceCount, 3);
    assert.equal(o.drawn.length, 3);
    assert.deepEqual(o.shown, o.drawn.slice(0, 2));
    assert.equal(new Set(o.drawn).size, 3);
  }
});

test("levelUpOptions: choosing level 6 (4 choices) only offers ARMY_JOB skills", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const o = levelUpOptions(human(seed, [0, 0, 0, 0]));
    assert.ok(o.drawn.every(isJob), `seed ${seed}: ${o.drawn.join(",")}`);
    const before = levelUpOptions(human(seed, [0, 0, 0]));
    assert.ok(!before.drawn.every(isJob), `seed ${seed}: level 5 should draw from the normal pool`);
  }
});

test("levelUpOptions: SMART (MALIN) taken through a level-up → 4 drawn, 3 shown", () => {
  let found = 0;
  for (let seed = 1; seed <= 3000 && found < 5; seed++) {
    const choices: number[] = [];
    for (let lvl = 0; lvl < 10; lvl++) {
      const t = human(seed, choices);
      const idx = choiceIndexForSkill(t, SKILLS.SMART);
      if (idx === null) {
        choices.push(0);
        continue;
      }
      const after = levelUpOptions(human(seed, [...choices, idx]));
      assert.equal(after.choiceCount, 4);
      assert.equal(after.drawn.length, 4);
      assert.equal(after.shown.length, 3);
      assert.deepEqual(after.shown, after.drawn.slice(0, 3));
      assert.ok(generateTrooper(human(seed, [...choices, idx]), 0, []).ghost.skills.includes(SKILLS.SMART));
      found++;
      break;
    }
  }
  assert.equal(found, 5, "expected 5 seeds reaching SMART within 10 levels");
});

test("choiceIndexForSkill: replaying choices + [index] grants the skill; hidden option → null", () => {
  for (let seed = 100; seed < 140; seed++) {
    for (const choices of [[], [1, 0], [0, 0, 1, 1], [0, 1, 0, 1, 0, 1, 1, 0, 0]]) {
      const t = human(seed, choices);
      const o = levelUpOptions(t);
      for (const s of o.shown) {
        const idx = choiceIndexForSkill(t, s);
        assert.notEqual(idx, null);
        assert.equal(o.drawn[idx!], s);
        const g = generateTrooper({ ...t, choices: [...choices, idx!] }, 0, []);
        assert.ok(g.ghost.skills.includes(s), `seed ${seed} choices ${choices.join(",")} skill ${s}`);
      }
      assert.equal(choiceIndexForSkill(t, o.drawn[o.choiceCount - 1]!), null, "the last drawn option is not shown");
      const notDrawn = [...Array(Data.SKILL.length).keys()].find((s) => !o.drawn.includes(s))!;
      assert.equal(choiceIndexForSkill(t, notDrawn), null);
    }
  }
});

test("levelUpOptions: rats never level up", () => {
  assert.deepEqual(levelUpOptions({ ...human(5), type: 2 }), { shown: [], drawn: [], choiceCount: 0 });
});

test("describeTrooper: the t_0.html sheet (Edonnell, level 8, weapons Sniper / Tube Infernal / Fusil à pompe)", () => {
  const t = fixtures.trooper.trooper;
  const sheet = describeTrooper(t, 2);
  assert.equal(sheet.level, 8);
  assert.deepEqual(sheet.weapons, [WEAPONS.SNIPER, WEAPONS.INFERNAL_TUBE, WEAPONS.PUMP_ACTION_SHOTGUN]);
  const g = generateTrooper(t, 0, []);
  assert.equal(sheet.life, g.ghost.life);
  assert.deepEqual(sheet.skills, g.ghost.skills);
  assert.equal(sheet.job, g.ghost.job);
  assert.deepEqual(sheet.physical, g.ghost.physical);
  assert.deepEqual(sheet.leftOver, []);
  assert.deepEqual(sheet.equipment, g.ghost.skills.filter(isEquipment));
});

/** A level-`n` HUMAN (always the first option) owning exactly `count` equipment skills. */
const findWithEquipment = (count: number): BattleTrooperInput => {
  for (let seed = 1; seed < 20_000; seed++) {
    for (let n = 8; n <= 30; n += 2) {
      const t = human(seed, Array(n).fill(0), {
        CWeapon: null,
        CBody: null,
        targetSystem: 0,
        targetType: 0,
        moveSystem: 1,
        leftOver: [],
      });
      if (describeTrooper(t).equipment.length === count) return t;
    }
  }
  throw new Error(`no trooper with ${count} equipment`);
};

test("defaultLeftOver: a trooper with 5 equipment keeps 3 (the first ones, or selectedItems first)", () => {
  const t = findWithEquipment(5);
  const all = describeTrooper(t).equipment;
  const lo = defaultLeftOver(t);
  assert.deepEqual(lo, all.slice(3));
  const kept = describeTrooper({ ...t, pref: { ...t.pref!, leftOver: lo } });
  assert.deepEqual(kept.skills.filter(isEquipment), all.slice(0, 3));
  assert.deepEqual(kept.equipment, all, "equipment lists everything owned, carried or not");
  assert.deepEqual(kept.leftOver, lo);

  const sel = defaultLeftOver({ ...t, pref: { ...t.pref!, selectedItems: [all[4]!, all[3]!] } });
  assert.deepEqual(sel, [all[1]!, all[2]!]);
});

test("defaultLeftOver: 3 equipment or fewer → []", () => {
  const t = findWithEquipment(3);
  assert.deepEqual(defaultLeftOver(t), []);
  assert.deepEqual(reequip(t, new Rand(1)), []);
});

test("reequip: keeps 3 equipment, deterministic for a given Rand", () => {
  const t = findWithEquipment(5);
  const all = describeTrooper(t).equipment;
  const seen = new Set<string>();
  for (let s = 1; s <= 30; s++) {
    const a = reequip(t, new Rand(s));
    assert.deepEqual(reequip(t, new Rand(s)), a);
    assert.equal(a.length, 2);
    assert.ok(a.every((x) => all.includes(x)));
    assert.deepEqual(a, all.filter((x) => a.includes(x)), "leftOver keeps skill order");
    const sheet = describeTrooper({ ...t, pref: { ...t.pref!, leftOver: a } });
    assert.equal(sheet.skills.filter(isEquipment).length, 3);
    seen.add(a.join(","));
  }
  assert.ok(seen.size > 1, "different Rand seeds give different sets");
});
