import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setup } from "./helpers.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const MAIN = join(REPO, "apps/server/src/main.ts");
const CLI = join(REPO, "apps/server/src/admin/cli.ts");

test("GET /healthz: 200 ok, no session row, no cookie", async () => {
  const { app, db } = setup();
  const res = await app.request("/healthz");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 0);
});

test("main.ts: /healthz answers, SIGTERM stops it with code 0 in < 5 s and the WAL checkpointed", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mt-ops-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, [MAIN], {
    env: { ...process.env, PORT: "0", DATA_DIR: dir, LISTEN_HOST: "127.0.0.1", HOST: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });
  let out = "";
  child.stderr.on("data", (d) => (out += d));
  const port = await new Promise<number>((ok, ko) => {
    const timer = setTimeout(() => ko(new Error(`no start line: ${out}`)), 10_000);
    child.stdout.on("data", (d) => {
      out += d;
      const m = /MiniTroopers server on [^\s]*:(\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        ok(Number(m[1]));
      }
    });
    child.on("exit", () => ko(new Error(`exited early: ${out}`)));
  });
  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");
  const t0 = Date.now();
  const exit = new Promise<number | null>((ok) => child.on("exit", (code) => ok(code)));
  child.kill("SIGTERM");
  const code = await exit;
  assert.equal(code, 0, out);
  assert.ok(Date.now() - t0 < 5000, `stopped in ${Date.now() - t0} ms`);
  const wal = join(dir, "minitroopers.db-wal");
  assert.ok(!existsSync(wal) || statSync(wal).size === 0, "WAL left behind");
});

test("admin backup --out: consistent copy (same armies count); an existing file is refused", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mt-backup-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env: Record<string, string | undefined> = { ...process.env, DATA_DIR: dir };
  delete env.MT_ARMY_PASSWORD;
  const cli = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" });
  for (const name of ["Alpha", "Bravo"]) {
    const r = cli("create-army", "--name", name, "--troopers", '[{"seed":7,"name":"Solo"}]');
    assert.equal(r.status, 0, r.stderr);
  }
  const out = join(dir, "x.db");
  const r1 = cli("backup", "--out", out);
  assert.equal(r1.status, 0, r1.stderr);
  const count = (file: string) => {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      return (db.prepare("SELECT COUNT(*) AS n FROM armies").get() as { n: number }).n;
    } finally {
      db.close();
    }
  };
  const n = count(join(dir, "minitroopers.db"));
  assert.ok(n >= 2);
  assert.equal(count(out), n);
  const r2 = cli("backup", "--out", out);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /existe déjà/);
});
