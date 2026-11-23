import type { DatabaseSync } from "node:sqlite";

export const SESSION_MAX_AGE_MS = 30 * 86_400_000;

/**
 * Nothing to recompute at midnight: offers, opponents and battle counters are all keyed by dayKey.
 * The only housekeeping is purging sessions older than 30 days. Returns the number purged.
 */
export function purgeSessions(db: DatabaseSync, now: number): number {
  return Number(db.prepare("DELETE FROM sessions WHERE created_at < ?").run(now - SESSION_MAX_AGE_MS).changes);
}

/** Runs the purge now and then hourly. The timer does not keep the process alive. */
export function startDailyJob(db: DatabaseSync, now: () => number = Date.now): () => void {
  purgeSessions(db, now());
  const t = setInterval(() => purgeSessions(db, now()), 3_600_000);
  t.unref();
  return () => clearInterval(t);
}
