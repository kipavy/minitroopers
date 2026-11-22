import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { BattleInput, BattleTrooperInput } from "../../src/input/types.ts";
import {
  clownData,
  formatTrooperLine,
  generateTrooper,
  projectGenerated,
  trooperProjection,
} from "../../src/logic/trooperGen.ts";
import { Ghost } from "../../src/logic/ghost.ts";
import { SKILLS, WEAPONS } from "../../src/data/enums.ts";
import { SKILL, skillWeapon } from "../../src/data/data.ts";

// Golden traces are read as data (no code is imported from tools/).
const GOLDEN = fileURLToPath(new URL("../../../../tools/oracle/golden/", import.meta.url));

interface Trace {
  input: BattleInput;
  record: { troopers: { id: number; side: 0 | 1; line: string }[] };
}

const loadTag = (tag: string): { file: string; trace: Trace }[] =>
  readdirSync(GOLDEN + tag)
    .filter((f) => f.endsWith(".json.gz"))
    .sort()
    .map((file) => ({ file, trace: JSON.parse(gunzipSync(readFileSync(GOLDEN + tag + "/" + file)).toString()) }));

const tags = existsSync(GOLDEN) ? readdirSync(GOLDEN).filter((t) => existsSync(GOLDEN + t + "/meta.json")) : [];

test("golden corpus is present", () => {
  assert.ok(tags.length >= 8, `tags: ${tags.join(",")}`);
});

for (const tag of tags) {
  test(`generateTrooper reproduces the input-derived part of every TRP line (${tag})`, () => {
    let lines = 0;
    let spawned = 0;
    const bad: string[] = [];
    for (const { file, trace } of loadTag(tag)) {
      for (const trp of trace.record.troopers) {
        const army = trace.input.armies[trp.side];
        let t: BattleTrooperInput | undefined = army.troopers.find((x) => x.id === trp.id);
        let g;
        if (t === undefined) {
          // Trooper spawned in battle by CLOWN_GRENADE (Trooper §lB{u\x01§ case 85): its seed is a
          // battle draw (`% 3300`), which only feeds Ghost.physical — not part of the projection.
          spawned++;
          g = generateTrooper(clownData(trp.id, 0), trp.side, army.spawnOrder);
        } else {
          g = generateTrooper(t, trp.side, army.spawnOrder);
        }
        lines++;
        const want = trooperProjection(trp.line);
        const got = projectGenerated(g);
        if (want !== got && bad.length < 10) bad.push(`${file}: want ${want} got ${got}  (${trp.line})`);
      }
    }
    assert.deepEqual(bad, [], `${tag}: ${bad.length} mismatches over ${lines} TRP lines`);
    assert.ok(lines > 0);
    console.log(`# ${tag}: ${lines}/${lines} TRP lines match (${spawned} spawned clowns)`);
  });
}

test("trooperProjection keeps id|side|life|lvl|skills|weapon types|helmet|leader", () => {
  assert.equal(
    trooperProjection("TRP 1|1|10|19|0|8,24|0:1:-1:0,1:3:1:0,17:1:1:0|1|-|0|1"),
    "1|1|10|0|8,24|0,1,17|0|1",
  );
  assert.equal(trooperProjection("TRP -1|0|10|-194|0|74,140|37:1:-1:0|0|-|0|0"), "-1|0|10|0|74,140|37|0|0");
});

test("formatTrooperLine renders the full TRP line (README format)", () => {
  assert.equal(
    formatTrooperLine({
      id: 0,
      side: 0,
      life: 10,
      time: 12,
      lvl: 0,
      skills: [13, 128],
      weapons: [
        { type: 0, ammo: 1, reserve: -1, flag: false },
        { type: 6, ammo: 1, reserve: 3, flag: false },
      ],
      weapIdx: 1,
      vehicle: null,
      helmet: false,
      leader: true,
    }),
    "TRP 0|0|10|12|0|13,128|0:1:-1:0,6:1:3:0|1|-|0|1",
  );
  assert.equal(
    formatTrooperLine({
      id: 3,
      side: 1,
      life: 25,
      time: -40,
      lvl: 12,
      skills: [],
      weapons: [],
      weapIdx: -1,
      vehicle: 4,
      helmet: true,
      leader: false,
    }),
    "TRP 3|1|25|-40|12|||-1|4|1|0",
  );
});

test("Data: skill → weapon mapping (2 + skill − REVOLVER) and table ids", () => {
  assert.equal(skillWeapon(SKILLS.PISTOL), WEAPONS.PISTOL);
  assert.equal(skillWeapon(SKILLS.SHOTGUN), WEAPONS.SHOTGUN);
  assert.equal(skillWeapon(SKILLS.KNIFE), WEAPONS.KNIFE);
  assert.equal(SKILL.length, 141);
  SKILL.forEach((r, i) => assert.equal(r.id, i));
});

test("Ghost: force applies after generation, leftOver removes the first occurrence", () => {
  const base = { id: 1, name: "a", seed: 42, type: 0, choices: [0, 1, 0] };
  const g0 = new Ghost({ ...base, force: null, pref: null });
  const forced = new Ghost({ ...base, force: [SKILLS.BAIT, SKILLS.BAIT], pref: null });
  assert.deepEqual(forced.skills, [...g0.skills, SKILLS.BAIT, SKILLS.BAIT]);
  assert.equal(forced.life, g0.life + 16); // BAIT (47): +8 life, applied twice
  const first = g0.skills[0] as number;
  const left = new Ghost({
    ...base,
    force: null,
    pref: { CBody: null, CWeapon: null, targetSystem: 0, targetType: 0, moveSystem: 1, reloadSystem: 2, leftOver: [first] },
  });
  assert.ok(!left.skills.includes(first));
});

test("Ghost.levelUp: an out-of-range choice reads int(undefined) = 0 → SOLDIER (no throw)", () => {
  for (const c of [3, 7, -2]) {
    const g = new Ghost({ id: 1, name: "a", seed: 42, type: 0, choices: [c], force: null, pref: null });
    assert.equal(g.lvl, 1, `choice ${c}`);
    assert.equal(g.skills[2], SKILLS.SOLDIER, `choice ${c}`); // [start weapon, levelUp(0), choice]
    assert.equal(g.life, 10 + 1, `choice ${c}: SOLDIER adds choices.length`);
  }
  // -1 only levels up, without drawing.
  const g = new Ghost({ id: 1, name: "a", seed: 42, type: 0, choices: [-1], force: null, pref: null });
  assert.equal(g.lvl, 1);
  assert.equal(g.skills.length, 2);
});
