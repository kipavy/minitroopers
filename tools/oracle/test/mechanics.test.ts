import { test } from "node:test";
import assert from "node:assert/strict";
import { Battle, OBF_KEYS, simulateBattle, type BattleRecord } from "@mt/engine";
import {
  MIN_FIRES,
  comLabel,
  UNREACHED_DOCUMENTED,
  expectedMechanics,
  mechanicProblems,
  parseValue,
  replayMechanics,
  traceMechanics,
} from "../src/mechanics.ts";
import { readGoldenItems } from "../src/diff.ts";
import { GOLDEN_DIR } from "../src/capture.ts";
import { fixture1v1 } from "./fixtures.ts";

test("parseValue reads every oracle value form", () => {
  assert.deepEqual(parseValue("null"), null);
  assert.deepEqual(parseValue("-12"), -12);
  assert.deepEqual(parseValue('"a\\u007cb"'), "a|b");
  assert.deepEqual(parseValue("[1,true,T-3,Q4:2]"), {
    k: "arr",
    v: [1, true, { k: "trp", id: -3 }, { k: "sq", x: 4, y: 2 }],
  });
  assert.deepEqual(parseValue("20(1(4))"), { k: "enum", i: 20, p: [{ k: "enum", i: 1, p: [4] }] });
  assert.deepEqual(parseValue("{a\\u0002=1;b=[]}"), { k: "obj", m: { "a\x02": 1, b: { k: "arr", v: [] } } });
  assert.deepEqual(parseValue("<fn>"), { k: "other", s: "<fn>" });
  assert.throws(() => parseValue("1)"));
});

const rec = (events: string[], troopers: string[] = [], winner: 0 | 1 | null = 0): BattleRecord => ({
  troopers: troopers.map((line) => ({ id: Number(line.split("|")[0]!.slice(4)), side: 0, line })),
  events,
  winner,
  graveyard: [],
});

test("traceMechanics: supers, interception, comms, statuses inside hits, vehicles, sabotage", () => {
  const ev = (type: string) => `EV 10|0|${type}`;
  const hitEvents = `{${OBF_KEYS.events!.replace("\x02", "\\u0002")}=[12(3),10]}`;
  const m = traceMechanics(
    rec(
      [
        ev("16(44,null,null,null)"),
        ev("14(82,1,2,[],null,null)"),
        ev("14(82,1,2,[],5,null)"),
        ev("19(3,1,1)"),
        ev("9(2,null,{},20)"),
        ev("9(2,0,{},35)"),
        ev("20(1(2))"),
        ev("22(5)"),
        ev(`8([${hitEvents}])`),
        ev("29(1,false)"),
        ev("29(1,true)"),
      ],
      ["TRP -1|0|10|5|0|74|37:1:-1:0|0|-|0|0", "TRP 2|0|10|5|0|1|0:1:-1:0,1:2:2:1|1|4|0|0"],
      null,
    ),
  );
  const get = (k: string) => m.get(k) ?? 0;
  assert.equal(get("super 44 AMPHETAMINE_SHOT (Skill 16(44))"), 1);
  assert.equal(get("super 82 GRENADE (Grenade 14(82,..))"), 1);
  assert.equal(get("interception (Grenade 14 with interceptor id)"), 1);
  assert.equal(get("super 111 SAVIOUR rescue (Rescue 19)"), 1);
  assert.equal(get("super 122 FACEBOOT (Brawl 9(tid,null,hit,20))"), 1, "weapon brawl not counted");
  assert.equal(get(comLabel(2)), 1);
  assert.equal(get(comLabel(5)), 1);
  assert.equal(get("status 5 LOCKED on"), 1);
  assert.equal(get("status 3 PARALYZED on"), 1, "HitEvent STATUS inside a hit result");
  assert.equal(get("HitEvent 12"), 1);
  assert.equal(get("HitEvent 10"), 1);
  assert.equal(get("helicopter leaves (Leave 29 false)"), 1);
  assert.equal(get("retreat leave (Leave 29 true)"), 1);
  assert.equal(get("clown spawn (TRP with negative id)"), 1);
  assert.equal(get("vehicle 4 HEAVY_TANK (TRP)"), 1);
  assert.equal(get("sabotage (TRP spare weapon flag 1)"), 1);
  assert.equal(get("winner=null (btime > 50000)"), 1);
});

test("replayMechanics observes the Kill trigger without changing the battle", () => {
  const input = fixture1v1();
  const expected = simulateBattle(input);
  const { same } = replayMechanics(input, expected);
  assert.ok(same);
  // The prototype observers are removed afterwards.
  assert.ok(!Battle.prototype.runTrigger.toString().includes("vendettaList"));
  assert.deepEqual(simulateBattle(input), expected);
  const g = readGoldenItems(GOLDEN_DIR, "martyr-saviour").next().value;
  if (g !== undefined) {
    const r = replayMechanics(g.trace.input, g.trace.record);
    assert.ok(r.same);
  }
});

test("mechanicProblems gates < MIN_FIRES, except the documented unreached ones", () => {
  const all = new Map(expectedMechanics().map((m) => [m, MIN_FIRES]));
  assert.deepEqual(mechanicProblems(all), []);
  all.set("martyr (replay)", MIN_FIRES - 1);
  for (const m of UNREACHED_DOCUMENTED.keys()) all.set(m, 0);
  assert.deepEqual(mechanicProblems(all), [`mechanic "martyr (replay)" fired ${MIN_FIRES - 1} times (< ${MIN_FIRES})`]);
  for (const m of UNREACHED_DOCUMENTED.keys()) assert.ok(expectedMechanics().includes(m));
});
