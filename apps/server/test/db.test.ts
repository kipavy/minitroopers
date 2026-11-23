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

test("openDb waits for a lock held by another process (admin CLI vs server) instead of failing with SQLITE_BUSY", async () => {
  const { mkdirSync, mkdtempSync, rmSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  const { spawn } = await import("node:child_process");
  const varDir = resolve(import.meta.dirname, "../../../var");
  mkdirSync(varDir, { recursive: true });
  const dir = mkdtempSync(join(varDir, "busy-"));
  const file = join(dir, "t.db");
  const db = openDb(file);
  try {
    assert.equal((db.prepare("PRAGMA busy_timeout").get() as { timeout: number }).timeout, 5000);
    // another process takes the write lock for 400 ms
    const holder = spawn(process.execPath, ["-e", `
      const { DatabaseSync } = require("node:sqlite");
      const d = new DatabaseSync(${JSON.stringify(file)});
      d.exec("BEGIN IMMEDIATE");
      d.exec("INSERT INTO sessions(key, army_id, client_id, created_at) VALUES ('held01', NULL, 'c', 1)");
      console.log("locked");
      setTimeout(() => { d.exec("COMMIT"); d.close(); }, 400);
    `], { stdio: ["ignore", "pipe", "inherit"] });
    await new Promise<void>((ok) => holder.stdout!.on("data", (b: Buffer) => b.toString().includes("locked") && ok()));
    const t0 = Date.now();
    db.prepare("INSERT INTO sessions(key, army_id, client_id, created_at) VALUES ('mine01', NULL, 'c', 2)").run(); // blocks, then succeeds
    assert.ok(Date.now() - t0 >= 100, "the write waited for the other process");
    await new Promise((ok) => holder.once("exit", ok));
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 2);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
