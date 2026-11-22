import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Data, SKILLS } from "@mt/engine";
import { SKILL_COUNT, SKILL_GEN, SKILL_NAMES } from "../src/data/skills.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("engine data tables are up to date with client_fr.swf (gen-engine-data.mjs)", () => {
  const fresh = execFileSync(process.execPath, [root + "tools/oracle/scripts/gen-engine-data.mjs"], {
    encoding: "utf8",
  });
  const committed = readFileSync(root + "packages/engine/src/data/swfTables.gen.ts", "utf8").replace(/\r\n/g, "\n");
  assert.equal(fresh, committed);
});

test("oracle forced-skill indexes ($GL SkillEnum) equal the engine SKILLS indexes", () => {
  assert.equal(Object.keys(SKILLS).length, SKILL_COUNT);
  assert.equal(Data.SKILL.length, SKILL_COUNT);
  SKILL_NAMES.forEach((name, i) => assert.equal((SKILLS as Record<string, number>)[name], i, name));
});

test("oracle corpus skill data ($GL skills.model.ts) agrees with the SWF table", () => {
  SKILL_GEN.forEach((g, i) => {
    const row = Data.skillRow(i);
    assert.equal(row.weight, g.w, `weight ${i}`);
    assert.equal(row.min, g.min, `min ${i}`);
    assert.deepEqual([...row.open], [...g.open], `open ${i}`);
    assert.equal(row.cat.length, g.cats.length, `cat count ${i}`);
  });
});
