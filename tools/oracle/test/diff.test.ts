import { test } from "node:test";
import assert from "node:assert/strict";
import type { BattleRecord } from "@mt/engine";
import { NotImplemented } from "@mt/engine";
import { diffRecords, flattenRecord, runDiff } from "../src/diff.ts";
import type { OracleTrace } from "../src/runner.ts";

const rec = (over: Partial<BattleRecord> = {}): BattleRecord => ({
  troopers: [
    { id: 0, side: 0, line: "TRP 0|0|10|11" },
    { id: 1, side: 1, line: "TRP 1|1|12|13" },
  ],
  events: ["EV 0|null|40(0)", "EV 1|0|3", "EV 2|1|4", "EV 3|0|5", "EV 4|1|6", "EV 5|0|7"],
  winner: 0,
  graveyard: [1],
  ...over,
});

test("flattenRecord orders TRP, EV, END (winner 0|1|null)", () => {
  assert.deepEqual(flattenRecord(rec({ winner: null, graveyard: [] })).slice(-1), ["END null|"]);
  assert.deepEqual(flattenRecord(rec({ winner: 1, graveyard: [2, 3] })).slice(-1), ["END 1|2,3"]);
  assert.equal(flattenRecord(rec())[0], "TRP 0|0|10|11");
  assert.equal(flattenRecord(rec())[2], "EV 0|null|40(0)");
});

test("identical records -> no divergence", () => {
  assert.equal(diffRecords(rec(), rec()), null);
});

test("first divergence: index, expected, actual, 5 context lines", () => {
  const actual = rec({ events: ["EV 0|null|40(0)", "EV 1|0|3", "EV 2|1|4", "EV 3|0|5", "EV 4|1|XX", "EV 5|0|7"] });
  const d = diffRecords(rec(), actual)!;
  assert.equal(d.index, 6);
  assert.equal(d.expected, "EV 4|1|6");
  assert.equal(d.actual, "EV 4|1|XX");
  assert.deepEqual(d.context, ["TRP 1|1|12|13", "EV 0|null|40(0)", "EV 1|0|3", "EV 2|1|4", "EV 3|0|5"]);
});

test("divergence on the winner and on length", () => {
  assert.equal(diffRecords(rec(), rec({ winner: null }))!.expected, "END 0|1");
  const short = diffRecords(rec(), rec({ events: ["EV 0|null|40(0)"] }))!;
  assert.equal(short.index, 3);
  assert.equal(short.actual, "END 0|1");
  const longer = diffRecords(rec({ events: [] }), rec())!;
  assert.equal(longer.index, 2);
  assert.equal(longer.expected, "END 0|1");
  assert.equal(diffRecords(rec({ events: ["EV 0|null|40(0)"] }), rec({ events: ["EV 0|null|40(0)", "EV 1|0|3"] }))!.expected, "END 0|1");
});

const trace = (): OracleTrace => ({ formatVersion: 1, swfSha256: "x", input: {} as never, record: rec() });

test("runDiff: engine failures are reported per golden, not thrown", () => {
  const res = runDiff([{ tag: "t", file: "00000.json.gz", trace: trace() }], () => {
    throw new NotImplemented("simulateBattle");
  });
  assert.equal(res.ko, 1);
  assert.equal(res.ok, 0);
  assert.match(res.lines.join("\n"), /KO t\/00000\.json\.gz.*NotImplemented: simulateBattle/);
  assert.match(res.lines.join("\n"), /t: 0 OK, 1 KO/);
});

test("runDiff: OK and divergence output, per tag totals", () => {
  const bad = rec({ winner: 1 });
  const res = runDiff(
    [
      { tag: "t", file: "a", trace: trace() },
      { tag: "t", file: "b", trace: trace() },
    ],
    (() => {
      let n = 0;
      return () => (n++ === 0 ? rec() : bad);
    })(),
  );
  assert.equal(res.ok, 1);
  assert.equal(res.ko, 1);
  const out = res.lines.join("\n");
  assert.match(out, /OK t\/a/);
  assert.match(out, /KO t\/b: divergence at line 8/);
  assert.match(out, /expected: END 0\|1/);
  assert.match(out, /actual: {3}END 1\|1/);
  assert.match(out, /t: 1 OK, 1 KO/);
});

test("runDiff: --limit applies per tag", () => {
  const items = ["a", "b", "c"].map((file) => ({ tag: "t", file, trace: trace() }));
  const res = runDiff(items, () => rec(), { limit: 2 });
  assert.equal(res.ok, 2);
});
