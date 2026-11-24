import { test } from "node:test";
import assert from "node:assert/strict";
import type { BattleInput } from "@mt/engine";
import { openDb } from "../src/db.ts";
import { TRAININGS_KEPT, insertTraining, recentTrainings, trainingById } from "../src/repo.ts";

/** Two bare armies (A, B) in a fresh database. */
function db2() {
  const db = openDb(":memory:");
  const ins = db.prepare("INSERT INTO armies(host, name, part, faction, credits, created_at) VALUES (?,?,?,?,?,?) RETURNING id");
  const a = (ins.get("aaa", "Aaa", 0, 0, 50, 0) as { id: number }).id;
  const b = (ins.get("bbb", "Bbb", 0, 1, 70, 0) as { id: number }).id;
  return { db, a, b };
}
const INPUT = { attackerSide: 0, seed: 7, armies: [{ troopers: [] }, { troopers: [] }] } as unknown as BattleInput;
const add = (db: ReturnType<typeof db2>["db"], attackerId: number, now: number): number =>
  insertTraining(db, { attackerId, defenderId: null, defenderRef: "filler:10:5", input: INPUT, winner: 1, now });

test("insertTraining stores a row readable by trainingById", () => {
  const { db, a, b } = db2();
  const id = insertTraining(db, { attackerId: a, defenderId: b, defenderRef: null, input: INPUT, winner: 0, now: 1234 });
  assert.deepEqual(trainingById(db, id), { id, attackerId: a, defenderId: b, defenderRef: null, input: INPUT, winner: 0, createdAt: 1234 });
  assert.equal(trainingById(db, id + 1), null);
});

test("only the 10 most recent trainings of an army are kept", () => {
  const { db, a, b } = db2();
  assert.equal(TRAININGS_KEPT, 10);
  const ids = Array.from({ length: 11 }, (_, i) => add(db, a, i));
  const other = add(db, b, 99);
  const kept = recentTrainings(db, a).map((t) => t.id);
  assert.deepEqual(kept, ids.slice(1).reverse());
  assert.equal(trainingById(db, ids[0]!), null);
  assert.notEqual(trainingById(db, other), null);
  assert.deepEqual(recentTrainings(db, b).map((t) => t.id), [other]);
});

test("a training never touches battles, credits or notices", () => {
  const { db, a, b } = db2();
  insertTraining(db, { attackerId: a, defenderId: b, defenderRef: null, input: INPUT, winner: 0, now: 1 });
  const count = (sql: string): number => Number((db.prepare(sql).get() as { n: number }).n);
  assert.equal(count("SELECT COUNT(*) AS n FROM battles"), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM notices"), 0);
  assert.deepEqual(db.prepare("SELECT credits FROM armies ORDER BY id").all().map((r) => (r as { credits: number }).credits), [50, 70]);
});
