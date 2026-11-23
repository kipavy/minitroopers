import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { openDb, migrate } from "../src/db.ts";

const tables = (db: DatabaseSync): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);

test("migrations create the schema and are idempotent", () => {
  const db = openDb(":memory:");
  const first = tables(db);
  for (const t of ["armies", "troopers", "battles", "daily", "sessions"]) assert.ok(first.includes(t), t);
  assert.deepEqual(migrate(db), []); // nothing left to apply
  assert.deepEqual(tables(db), first);
  const v = (db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n;
  migrate(db);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n, v);
});

test("armies.host is unique and columns match the spec", () => {
  const db = openDb(":memory:");
  const cols = (db.prepare("PRAGMA table_info(armies)").all() as { name: string }[]).map((c) => c.name);
  assert.deepEqual(cols, ["id", "host", "name", "part", "faction", "credits", "recruiter_id", "created_at", "created_ip", "password_hash", "is_faction"]);
  const ins = db.prepare("INSERT INTO armies(host,name,created_at) VALUES (?,?,?)");
  ins.run("nsun", "nSun", 1);
  assert.throws(() => ins.run("nsun", "Other", 2), /UNIQUE/);
});
