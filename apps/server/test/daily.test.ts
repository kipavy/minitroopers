import { test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { startDailyJob } from "../src/jobs/daily.ts";

test("the daily job logs a failing purge and keeps running (never an uncaught error in the timer)", async () => {
  let calls = 0;
  const broken = { prepare: () => { calls++; throw new Error("database is locked"); } } as unknown as DatabaseSync;
  const logged: unknown[] = [];
  const stop = startDailyJob(broken, Date.now, { everyMs: 10, log: (...a: unknown[]) => logged.push(a) });
  await new Promise((ok) => setTimeout(ok, 60));
  stop();
  assert.ok(calls >= 3, `purge attempted ${calls} times`);
  assert.equal(logged.length, calls);
  assert.match(String((logged[0] as unknown[])[1]), /database is locked/);
});
