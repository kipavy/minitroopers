import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  OracleRunner,
  chromiumAvailable,
  filterTraceLines,
  parseTrace,
  traceSwfSha256,
} from "../src/runner.ts";
import { readFileSync } from "node:fs";
import { fixture1v1 } from "./fixtures.ts";

test("filterTraceLines keeps only TRP/EV/END/MTDONE lines", () => {
  const raw = ["TRP 0|0|x", "hello", "EV 1|0|2", "ENDX", "END 1|0", "MTDONEX", "MTDONE", " EV 3"];
  assert.deepEqual(filterTraceLines(raw), ["TRP 0|0|x", "EV 1|0|2", "END 1|0", "MTDONE"]);
});

test("parseTrace builds the record", () => {
  const rec = parseTrace([
    "TRP 4|1|10|19|0|8|0:1:-1:0|0|-|0|1",
    "TRP 0|0|10|12|0|13|0:1:-1:0|0|-|0|1",
    "EV 0|null|3",
    "EV 12|0|11(3,2)",
    "END 0|4,7",
    "MTDONE",
  ]);
  assert.deepEqual(rec, {
    troopers: [
      { id: 4, side: 1, line: "TRP 4|1|10|19|0|8|0:1:-1:0|0|-|0|1" },
      { id: 0, side: 0, line: "TRP 0|0|10|12|0|13|0:1:-1:0|0|-|0|1" },
    ],
    events: ["EV 0|null|3", "EV 12|0|11(3,2)"],
    winner: 0,
    graveyard: [4, 7],
  });
});

test("parseTrace: winner null (btime > 50000) and empty graveyard", () => {
  const rec = parseTrace(["END null|", "MTDONE"]);
  assert.equal(rec.winner, null);
  assert.deepEqual(rec.graveyard, []);
});

test("parseTrace rejects incomplete traces", () => {
  assert.throws(() => parseTrace(["TRP 0|0|1", "EV 0|null|3"]), /incomplete/);
  assert.throws(() => parseTrace(["END 2|", "MTDONE"]), /bad winner/);
});

test("traceSwfSha256 matches the committed .sha256", () => {
  const expected = readFileSync(
    new URL("../../../assets/oracle/client_fr_trace.swf.sha256", import.meta.url),
    "utf8",
  ).split(/\s/)[0];
  assert.equal(traceSwfSha256(), expected);
});

const runner = new OracleRunner();
after(() => runner.close());

test("oracle 1v1: deterministic, complete, agrees with client_fr_edit.swf", async (t) => {
  if (!(await chromiumAvailable())) {
    t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
    return;
  }
  const [a, b, edit] = await Promise.all([
    runner.run(fixture1v1()),
    runner.run(fixture1v1()),
    runner.runRaw(fixture1v1(), { swf: "edit" }),
  ]);
  assert.deepEqual(a, b);
  assert.equal(a.formatVersion, 1);
  assert.equal(a.swfSha256, traceSwfSha256());
  assert.deepEqual(a.input, fixture1v1());
  assert.ok(a.record.events.length > 0);
  assert.ok(a.record.winner === 0 || a.record.winner === 1);
  assert.deepEqual(
    a.record.troopers.map((tr) => [tr.id, tr.side]),
    [
      [0, 0],
      [1, 1],
    ],
  );
  // client_fr_edit.swf: ExternalInterface.call("battleResult", graveyard) then
  // ("battleResult", winnerSide).
  assert.deepEqual(edit.calls, [[a.record.graveyard], [a.record.winner]]);
});
