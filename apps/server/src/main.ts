import { mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { startDailyJob } from "./jobs/daily.ts";

const cfg = loadConfig(process.env);
// A relative DATA_DIR is relative to the repository root (var/ is gitignored).
const dataDir = isAbsolute(cfg.dataDir) ? cfg.dataDir : resolve(import.meta.dirname, "../../..", cfg.dataDir);
mkdirSync(dataDir, { recursive: true });
const db = openDb(join(dataDir, "minitroopers.db"));
startDailyJob(db);
const app = createApp({ cfg, db });
serve({ fetch: app.fetch, port: cfg.port, hostname: "127.0.0.1" }, (i) => {
  console.log(`MiniTroopers server on http://127.0.0.1:${i.port} (${cfg.urlMode} mode, data in ${dataDir})`);
});
