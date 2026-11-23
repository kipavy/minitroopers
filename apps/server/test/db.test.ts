import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { openDb, migrate } from "../src/db.ts";
import { deleteArmy } from "../src/repo.ts";

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
  assert.deepEqual(cols, ["id", "host", "name", "part", "faction", "credits", "recruiter_id", "created_at", "created_ip", "password_hash", "is_faction", "created_cid", "missions_unlocked", "rats", "epic_wins", "recruit_confirmed_at", "recruit_bounty"]);
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

const cols = (db: DatabaseSync, t: string): string[] => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
const count = (db: DatabaseSync, sql: string): number => Number((db.prepare(sql).get() as { n: number }).n);

/** A database as stage 2 left it (migrations 001-004 only), holding armies, battles (one filler) and a recruit. */
function stage2Db(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => /^00[1-4]_/.test(x)).sort()) {
    db.exec(readFileSync(new URL(f, dir), "utf8"));
    db.prepare("INSERT INTO schema_migrations VALUES (?, 1)").run(f);
  }
  const army = db.prepare("INSERT INTO armies(host, name, part, faction, credits, recruiter_id, created_at, is_faction) VALUES (?,?,?,?,?,?,?,?)");
  army.run("boss", "Boss", 1, 1, 50, null, 1, 0); // 1
  army.run("recruit", "Recruit", 2, 2, 7, 1, 2, 0); // 2
  army.run("fac", "Fac", 3, 3, 0, null, 3, 1); // 3
  db.prepare("INSERT INTO troopers(army_id, slot, seed, name) VALUES (1, 0, 5, 'T')").run();
  db.prepare("INSERT INTO daily(army_id, day, battles_used, opponents) VALUES (1, '2026-11-22', 2, '[]')").run();
  db.prepare("INSERT INTO sessions(key, token, army_id, client_id, created_at) VALUES ('K1', 'tok', 1, 'c', 1)").run();
  const bat = db.prepare("INSERT INTO battles(day, attacker_id, defender_id, defender_ref, input, winner, kind, seen) VALUES (?,?,?,?,?,?,?,?)");
  bat.run("2026-11-22", 1, 2, null, "{}", 0, "battle", 1); // 1: Boss attacks Recruit
  bat.run("2026-11-22", 1, null, "filler:5:9", "{}", 1, "battle", 0); // 2: filler
  bat.run("2026-11-22", 2, 1, null, "{}", 0, "battle", 1); // 3: Recruit attacks Boss
  return db;
}

test("migration 005 keeps armies, battles (filler included), recruits and sessions; foreign keys stay consistent", () => {
  const db = stage2Db();
  assert.deepEqual(migrate(db), ["005_modes.sql"]);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM armies"), 3);
  const recruit = db.prepare("SELECT * FROM armies WHERE host = 'recruit'").get() as Record<string, unknown>;
  assert.deepEqual({ ...recruit }, { id: 2, host: "recruit", name: "Recruit", part: 2, faction: 2, credits: 7, recruiter_id: 1, created_at: 2, created_ip: null, password_hash: null, is_faction: 0, created_cid: null, missions_unlocked: 0, rats: 1, epic_wins: 0, recruit_confirmed_at: null, recruit_bounty: null });
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM battles"), 3);
  const filler = db.prepare("SELECT * FROM battles WHERE id = 2").get() as Record<string, unknown>;
  assert.equal(filler.defender_id, null);
  assert.equal(filler.defender_ref, "filler:5:9");
  assert.equal(filler.seen, 0);
  assert.equal(filler.kind, "battle");
  assert.equal(filler.mode, null);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM troopers"), 1);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM sessions WHERE army_id = 1"), 1);
  const d = db.prepare("SELECT * FROM daily").get() as Record<string, unknown>;
  assert.deepEqual({ missions_used: d.missions_used, mission_won: d.mission_won, mission_type: d.mission_type, raid_phase: d.raid_phase, raid_dead: d.raid_dead, raid_over: d.raid_over }, { missions_used: 0, mission_won: 0, mission_type: null, raid_phase: 1, raid_dead: "[]", raid_over: 0 });
  assert.ok(cols(db, "battles").includes("opp"));
  assert.ok(cols(db, "daily").includes("mission_target"));
  // AUTOINCREMENT continues after the highest id, and the index is back
  db.prepare("INSERT INTO armies(host, name, created_at) VALUES ('new', 'New', 9)").run();
  assert.equal(count(db, "SELECT MAX(id) AS n FROM armies"), 4);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'battles_attacker'").get());
});

test("deleteArmy: a defender's battle stays for its attacker as gone:<name>; its own battles, troopers and sessions go", () => {
  const db = stage2Db();
  migrate(db);
  assert.equal(deleteArmy(db, 2), true); // Recruit: defended battle 1, attacked battle 3, recruited by Boss
  const b1 = db.prepare("SELECT defender_id, defender_ref FROM battles WHERE id = 1").get() as { defender_id: number | null; defender_ref: string | null };
  assert.deepEqual({ ...b1 }, { defender_id: null, defender_ref: "gone:Recruit" });
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM battles"), 2); // battle 3 (attacked by Recruit) cascaded
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM armies WHERE id = 2"), 0);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(deleteArmy(db, 2), false); // already gone
});

test("deleteArmy: a recruiter's recruits keep existing with recruiter_id NULL; its troopers, daily rows and sessions cascade; factions are refused", () => {
  const db = stage2Db();
  migrate(db);
  assert.equal(deleteArmy(db, 1), true);
  assert.equal((db.prepare("SELECT recruiter_id FROM armies WHERE id = 2").get() as { recruiter_id: number | null }).recruiter_id, null);
  for (const t of ["troopers", "daily", "sessions"]) assert.equal(count(db, `SELECT COUNT(*) AS n FROM ${t}`), 0, t);
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM battles WHERE attacker_id = 1"), 0);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(deleteArmy(db, 3), false); // faction army
  assert.equal(count(db, "SELECT COUNT(*) AS n FROM armies WHERE id = 3"), 1);
});
