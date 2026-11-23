#!/usr/bin/env node
// Dry run of the Docker image without Docker: `node deploy/dryrun.mjs` from anywhere in the repository.
// 1. copies the tracked files (git ls-files) not excluded by .dockerignore into a temporary directory (the build context),
// 2. runs the Dockerfile's install there (npm ci --omit=dev --ignore-scripts),
// 3. starts the Dockerfile's CMD with its ENV (free PORT, temporary DATA_DIR),
// 4. checks a few routes (200), then SIGTERM: exit code 0 within 5 s.
// Prints the copied size and "OK"; exits 1 on the first error. No dependency.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const ROUTES = ["/healthz", "/", "/css/style.css", "/ruffle/ruffle.js", "/swf/client_fr_play.swf", "/favicon.ico"];

/** .dockerignore pattern → RegExp on a slash-separated relative path (`*` within a segment, `**` any segments). */
function patternToRegExp(p) {
  if (p.startsWith("!") || /[?[\]\\]/.test(p)) throw new Error(`.dockerignore: unsupported pattern ${p}`);
  p = p.replace(/^\/+|\/+$/g, "");
  let re = "";
  const parts = p.split("/");
  parts.forEach((seg, i) => {
    const last = i === parts.length - 1;
    if (seg === "**") re += last ? ".*" : "(?:[^/]+/)*";
    else re += seg.replace(/[.+^${}()|]/g, "\\$&").replace(/\*/g, "[^/]*") + (last ? "" : "/");
  });
  return new RegExp(`^${re}$`);
}

/** Excluded when the path itself or one of its parent directories matches a pattern (as Docker does). */
function excluder(file) {
  const res = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"))
    .map(patternToRegExp);
  return (path) => {
    const segs = path.split("/");
    for (let i = 1; i <= segs.length; i++) {
      const prefix = segs.slice(0, i).join("/");
      if (res.some((r) => r.test(prefix))) return true;
    }
    return false;
  };
}

/** ENV (K=V ...) and CMD (exec form) of the Dockerfile, line continuations joined. */
function readDockerfile(file) {
  const lines = readFileSync(file, "utf8").replace(/\\\n/g, " ").split("\n").map((l) => l.trim());
  const env = {};
  let cmd = null;
  for (const l of lines) {
    if (l.startsWith("ENV ")) {
      for (const kv of l.slice(4).trim().split(/\s+/)) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(kv);
        if (!m) throw new Error(`Dockerfile: unsupported ENV ${kv}`);
        env[m[1]] = m[2];
      }
    } else if (l.startsWith("CMD ")) {
      cmd = JSON.parse(l.slice(4));
    }
  }
  if (!Array.isArray(cmd) || cmd.length === 0) throw new Error("Dockerfile: no exec-form CMD");
  return { env, cmd };
}

const freePort = () =>
  new Promise((ok, ko) => {
    const s = createServer();
    s.on("error", ko);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

const du = (dir) => execFileSync("du", ["-sh", dir], { encoding: "utf8" }).split("\t")[0];

async function main() {
  const root = mkdtempSync(join(tmpdir(), "mt-dryrun-"));
  const ctx = join(root, "app");
  const data = join(root, "data");
  let child = null;
  try {
    // 1. Build context
    const ignored = excluder(join(REPO, ".dockerignore"));
    // The rules themselves, on paths that git does not track but a working tree can hold (docker build copies it).
    const MUST_EXCLUDE = ["deploy/data/minitroopers.db", "deploy/data/backup-2026-01-01.db", "deploy/data/minitroopers.db-wal", "deploy/.env", ".env",
      ".env.local", "deploy/.env.production", "var/minitroopers.sqlite", "deploy/data/x.sqlite3", "x.sqlite-wal",
      "var/minitroopers.db", "var/minitroopers.db-shm", "x.db", "apps/server/node_modules/hono/index.js", "tools/bin/ms-playwright/x", "tools/oracle/golden-full/x"];
    const MUST_KEEP = ["Dockerfile", "package-lock.json", "apps/server/src/main.ts", "apps/server/migrations/001_init.sql", "apps/server/data/tips.fr.json",
      "apps/server/public/swf/client_fr_play.swf", "packages/engine/src/index.ts", "tools/oracle/package.json"];
    for (const p of MUST_EXCLUDE) if (!ignored(p)) throw new Error(`.dockerignore does not exclude ${p}`);
    for (const p of MUST_KEEP) if (ignored(p)) throw new Error(`.dockerignore excludes ${p}`);
    console.log(`.dockerignore: ${MUST_EXCLUDE.length} planted paths excluded, ${MUST_KEEP.length} needed paths kept`);
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8" }).split("\0").filter(Boolean);
    let copied = 0;
    for (const f of files) {
      if (ignored(f) || !existsSync(join(REPO, f))) continue;
      mkdirSync(dirname(join(ctx, f)), { recursive: true });
      cpSync(join(REPO, f), join(ctx, f));
      copied++;
    }
    for (const must of ["tools/bin", "tools/oracle/golden", "var", "assets", "docs", ".git", "apps/server/test", "packages/engine/test"]) {
      if (existsSync(join(ctx, must))) throw new Error(`excluded path copied: ${must}`);
    }
    console.log(`context: ${copied} files, ${du(ctx)}`);

    // 2. Install (runtime only)
    execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: ctx, stdio: "inherit" });
    for (const dev of ["playwright", "typescript", "@ruffle-rs/ruffle"]) {
      if (existsSync(join(ctx, "node_modules", dev))) throw new Error(`devDependency installed: ${dev}`);
    }
    console.log(`with node_modules: ${du(ctx)}`);

    // 3. Start the CMD with the Dockerfile's ENV
    const { env, cmd } = readDockerfile(join(REPO, "Dockerfile"));
    const port = await freePort();
    mkdirSync(data);
    const runEnv = { PATH: process.env.PATH, ...env, PORT: String(port), DATA_DIR: data };
    console.log(`start: ${cmd.join(" ")} (${Object.entries(runEnv).filter(([k]) => k !== "PATH").map(([k, v]) => `${k}=${v}`).join(" ")})`);
    child = spawn(cmd[0], cmd.slice(1), { cwd: ctx, env: runEnv, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    const exited = new Promise((ok) => child.on("exit", (code, signal) => ok({ code, signal })));
    const started = Date.now();
    while (!log.includes("MiniTroopers server on")) {
      if (child.exitCode !== null) throw new Error(`server exited early:\n${log}`);
      if (Date.now() - started > 15_000) throw new Error(`server not started after 15 s:\n${log}`);
      await new Promise((r) => setTimeout(r, 100));
    }

    // 4. Routes, then a clean stop
    for (const r of ROUTES) {
      const res = await fetch(`http://127.0.0.1:${port}${r}`);
      await res.arrayBuffer();
      if (res.status !== 200) throw new Error(`GET ${r}: ${res.status}`);
      console.log(`GET ${r}: 200`);
    }
    const t0 = Date.now();
    child.kill("SIGTERM");
    const timeout = new Promise((ok) => setTimeout(() => ok(null), 5000).unref());
    const end = await Promise.race([exited, timeout]);
    if (end === null) throw new Error("SIGTERM: still running after 5 s");
    if (end.code !== 0) throw new Error(`SIGTERM: exit ${end.code ?? end.signal}\n${log}`);
    child = null;
    console.log(`SIGTERM: exit 0 in ${Date.now() - t0} ms`);
    if (/error/i.test(log)) throw new Error(`error in the server log:\n${log}`);
    console.log("OK");
  } finally {
    if (child && child.exitCode === null) child.kill("SIGKILL");
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`dry run FAILED: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
