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
startDailyJob(db);
const app = createApp({ cfg, db }, mountPages({ cfg, db }));
serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host }, (i) => {
  console.log(`MiniTroopers server on ${cfg.host}:${i.port} (${cfg.urlMode} mode, ${cfg.publicUrl}, data in ${dataDir})`);
});
