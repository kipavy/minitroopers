import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, evType, formatCoverage, type Golden } from "../src/coverage.ts";
import type { OracleTrace } from "../src/runner.ts";
import { fixture1v1 } from "./fixtures.ts";

const golden = (tag: string, mutate: (t: OracleTrace) => void): Golden => {
  const trace: OracleTrace = {
    formatVersion: 1,
    swfSha256: "x",
    input: fixture1v1(),
    record: {
      troopers: [{ id: 1, side: 1, line: "TRP 1|1|10|19|0|8,24,57|0:1:-1:0|0|2|0|1" }],
      events: ["EV 0|null|40(0,{a=1})", "EV 12|0|11(3,2)", "EV 30|1|21(1,2,3,[])"],
      winner: null,
      graveyard: [],
    },
  };
  mutate(trace);
  return { tag, file: "00000.json.gz", trace };
};

test("evType reads the BattleMsg constructor index", () => {
  assert.equal(evType("EV 0|null|40(0,{a=1})"), 40);
  assert.equal(evType("EV 659|0|3"), 3);
  assert.throws(() => evType("TRP 1|1"));
});

test("analyze: tags, EV histogram, forced deployment, vehicles, leftOver violations", () => {
  const cov = analyze([
    golden("forced-skill", (t) => {
      t.input.armies[0].troopers[0]!.force = [40];
      t.input.armies[1].troopers[0]!.pref!.leftOver = [57, 99];
    }),
    golden("vehicles", (t) => {
      t.input.armies[0].troopers[0]!.force = [2, 38];
    }),
  ]);
  const fs = cov.tags.get("forced-skill")!;
  assert.deepEqual([fs.battles, fs.winnerNull, fs.trpLines, fs.inputTroopers, fs.jetBattles], [1, 1, 1, 2, 1]);
  assert.deepEqual([...fs.vehicles], [["2", 1]]);
  assert.deepEqual(cov.evTypes.get(21), 2);
  assert.deepEqual(cov.forced.get(40), [1, 0, 1], "forced trooper 0 has no TRP; jet strike seen");
  assert.deepEqual([...cov.vehicleSkills.get(38)!], [["no TRP", 1]]);
  assert.equal(cov.vehicleSkillJet.get(38), 1);
  assert.equal(cov.leftOver.troopers, 1);
  assert.equal(cov.leftOver.deployed, 1);
  assert.deepEqual(cov.leftOver.violations, ["forced-skill/00000.json.gz T1: 57"]);
  const text = formatCoverage(cov);
  assert.match(text, /40:FIGHTER_JET \(0\/1 deployed, jet strikes in 1\)/);
  assert.match(text, /1 with a leftover skill still in TRP/);
});
