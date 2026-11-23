import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

/** Apply every numbered migration (NNN_name.sql) not yet recorded. Returns the names applied now. */
export function migrate(db: DatabaseSync): string[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const done = new Set((db.prepare("SELECT name FROM schema_migrations").all() as { name: string }[]).map((r) => r.name));
  const applied: string[] = [];
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    // Table rebuilds (create new, copy, drop, rename) need foreign keys OFF, a pragma that is a no-op inside a transaction.
    const fk = (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys;
    if (fk) db.exec("PRAGMA foreign_keys = OFF");
    try {
      db.exec("BEGIN");
      try {
        db.exec(readFileSync(new URL(f, MIGRATIONS), "utf8"));
        const bad = db.prepare("PRAGMA foreign_key_check").all();
        if (bad.length > 0) throw new Error(`migration ${f} breaks foreign keys: ${JSON.stringify(bad[0])}`);
        db.prepare("INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)").run(f, Date.now());
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    } finally {
      if (fk) db.exec("PRAGMA foreign_keys = ON");
    }
    applied.push(f);
  }
  return applied;
}

/** How long a statement waits for another connection's lock (the admin CLI next to the server) before SQLITE_BUSY. */
export const BUSY_TIMEOUT_MS = 5000;

/** Open (or create) the database at `path` (":memory:" for tests) and migrate it. */
export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { timeout: BUSY_TIMEOUT_MS });
  db.exec("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}
