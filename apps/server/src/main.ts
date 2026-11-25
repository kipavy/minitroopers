import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { seedFactions } from "./admin/factions.ts";
import { createApp } from "./app.ts";
import { loadConfig, resolveDataDir, type Config } from "./config.ts";
import { openDb } from "./db.ts";
import { startDailyJob } from "./jobs/daily.ts";
import { mountPages } from "./routes/index.ts";

let cfg: Config;
try {
  cfg = loadConfig(process.env);
} catch (e) {
  console.error(`Configuration error: ${(e as Error).message}`);
  process.exit(1);
}
for (const w of cfg.warnings) console.warn(`Warning: ${w}`);
const dataDir = resolveDataDir(cfg.dataDir);
mkdirSync(dataDir, { recursive: true });
const dbFile = join(dataDir, "minitroopers.db");
const fresh = !existsSync(dbFile);
const db = openDb(dbFile);
// First start (new database): the faction armies exist from the beginning. Later: `npm run admin -- seed-factions`.
if (fresh) {
  const { created } = seedFactions(db, Date.now());
  console.log(`New database: ${created.length} faction armies seeded`);
}
const stopJob = startDailyJob(db);
// NOW (local screenshots only, tools/shots/README.md): the app clock starts at this instant and runs normally.
const fake = process.env.NOW ? Date.parse(process.env.NOW) : null;
if (fake !== null && Number.isNaN(fake)) throw new Error(`invalid NOW: ${JSON.stringify(process.env.NOW)}`);
const started = Date.now();
const clock = fake === null ? {} : { now: () => fake + (Date.now() - started) };
if (fake !== null) console.warn(`NOW=${process.env.NOW}: horloge simulée (captures uniquement, jamais en production)`);
const app = createApp({ cfg, db, ...clock }, mountPages({ cfg, db, ...clock }));
const server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.listenHost }, (i) => {
  console.log(`MiniTroopers server on ${cfg.listenHost}:${i.port} (${cfg.urlMode} mode, ${cfg.publicUrl}, data in ${dataDir})`);
});

// Clean stop (docker stop, Ctrl+C): no new connection, idle keep-alive sockets closed, job stopped, then db.close()
// checkpoints and removes the WAL. Connections still busy after 3 s are cut so that the stop stays under docker's 10 s.
let stopping = false;
const stop = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: stopping`);
  const finish = (): void => {
    stopJob();
    try {
      db.close();
    } catch (e) {
      console.error("database close failed:", e instanceof Error ? e.message : e);
      process.exit(1);
    }
    process.exit(0);
  };
  const force = setTimeout(() => {
    (server as { closeAllConnections?: () => void }).closeAllConnections?.();
  }, 3000);
  force.unref();
  server.close(() => {
    clearTimeout(force);
    finish();
  });
  (server as { closeIdleConnections?: () => void }).closeIdleConnections?.();
};
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
