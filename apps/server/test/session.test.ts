import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { createApp, type Env } from "../src/app.ts";
import { actionKey, persistSession } from "../src/session.ts";

function setup(env: Record<string, string> = {}) {
  const db = openDb(":memory:");
  const cfg = loadConfig(env);
  const app = createApp({ cfg, db }, (pages: Hono<Env>) => {
    pages.get("/key", (c) => c.text(c.get("session").key));
    pages.get("/act", actionKey("chk"), (c) => c.text("done"));
    pages.get("/persist", (c) => c.text(persistSession(c, c.get("db")).key));
    pages.get("/persist2", (c) => c.text(persistSession(c, c.get("db")).key === persistSession(c, c.get("db")).key ? "same" : "diff"));
    pages.get("/persisted", (c) => c.text(String(c.get("session").persisted)));
  });
  return { app, db, cfg };
}

const cookies = (res: Response): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const sc of res.headers.getSetCookie()) {
    const [kv] = sc.split(";");
    const i = kv!.indexOf("=");
    out[kv!.slice(0, i)] = kv!.slice(i + 1);
  }
  return out;
};

test("lazy: anonymous visits store nothing and set no ssid, only cid; persistSession creates the row once", async () => {
  const { app, db } = setup();
  let cid: string | undefined;
  for (let i = 0; i < 50; i++) {
    const res = await app.request("/persisted", { headers: cid ? { cookie: `cid=${cid}` } : {} });
    assert.equal(await res.text(), "false");
    const c = cookies(res);
    assert.equal(c.ssid, undefined);
    cid ??= c.cid;
  }
  assert.ok(cid);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 0);
  const res = await app.request("/persist", { headers: { cookie: `cid=${cid}` } });
  const key = await res.text();
  const c = cookies(res);
  assert.match(c.ssid!, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(c.cid, undefined); // already held
  assert.deepEqual({ ...(db.prepare("SELECT key, token, client_id FROM sessions").get() as object) }, { key, token: c.ssid, client_id: cid });
  const again = await app.request("/persisted", { headers: { cookie: `ssid=${c.ssid}; cid=${cid}` } });
  assert.equal(await again.text(), "true");
  assert.equal(again.headers.getSetCookie().length, 0);
});

test("persistSession is idempotent within a request", async () => {
  const { app, db } = setup();
  const res = await app.request("/persist2");
  assert.equal(await res.text(), "same");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 1);
  assert.equal(res.headers.getSetCookie().filter((x) => x.startsWith("ssid=")).length, 1);
});

test("first persisted visit has ssid (random 128-bit token, not the key) and persistent cid, HttpOnly SameSite=Lax", async () => {
  const { app, db } = setup();
  const res = await app.request("/persist");
  const set = res.headers.getSetCookie();
  const c = cookies(res);
  assert.match(c.ssid!, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(c.cid && c.cid.length >= 16);
  for (const s of set) {
    assert.match(s, /HttpOnly/i);
    assert.match(s, /SameSite=Lax/i);
    assert.doesNotMatch(s, /Secure/i);
  }
  const key = await res.text();
  assert.match(key, /^[A-Za-z0-9]{6}$/);
  assert.notEqual(c.ssid, key);
  const row = db.prepare("SELECT key, token, client_id FROM sessions").get() as { key: string; token: string; client_id: string };
  assert.deepEqual({ ...row }, { key, token: c.ssid, client_id: c.cid });
});

test("returning visit keeps the session and cid", async () => {
  const { app, db } = setup();
  const first = await app.request("/persist");
  const c = cookies(first);
  const key = await first.text();
  const res = await app.request("/key", { headers: { cookie: `ssid=${c.ssid}; cid=${c.cid}` } });
  assert.equal(await res.text(), key);
  assert.equal(res.headers.getSetCookie().length, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 1);
});

test("the 6-char key of the action URLs is not a session cookie: ssid=<key> is a stranger", async () => {
  const { app, db } = setup();
  const first = await app.request("/persist");
  const c = cookies(first);
  const key = await first.text();
  db.prepare("INSERT INTO armies(host, name, created_at) VALUES ('nsun', 'nSun', 1)").run();
  db.prepare("UPDATE sessions SET army_id = 1 WHERE key = ?").run(key);
  const res = await app.request(`/act?chk=${key}`, { headers: { cookie: `ssid=${key}; cid=${c.cid}` } });
  assert.equal(res.status, 403);
  assert.equal(cookies(res).ssid, undefined, "an anonymous visitor: no session opened");
  const rows = db.prepare("SELECT key, army_id FROM sessions").all() as { key: string; army_id: number | null }[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.army_id, 1);
});

test("cookies are Secure when PUBLIC_URL is https", async () => {
  const { app } = setup({ PUBLIC_URL: "https://x.example" });
  const res = await app.request("/key");
  for (const s of res.headers.getSetCookie()) assert.match(s, /Secure/);
});

test("action URL with a wrong or missing key -> 403, right key -> 200", async () => {
  const { app } = setup();
  const first = await app.request("/persist");
  const c = cookies(first);
  const key = await first.text();
  const h = { headers: { cookie: `ssid=${c.ssid}; cid=${c.cid}` } };
  assert.equal((await app.request("/act?chk=WRONG1", h)).status, 403);
  assert.equal((await app.request("/act", h)).status, 403);
  assert.equal((await app.request("/act?chk=", h)).status, 403);
  assert.equal((await app.request(`/act?opp=3;chk=${key}`, h)).status, 200); // original ';' separator
  assert.equal((await app.request(`/act?chk=${key}`)).status, 403); // no cookie
  assert.equal((await app.request(`/act?chk=${c.ssid}`, h)).status, 403); // the cookie value is not the key
  const ok = await app.request(`/act?chk=${key}`, h);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "done");
});

test("an unknown ssid cookie is an anonymous visitor, replaced by a fresh session when it persists", async () => {
  const { app, db } = setup();
  const h = { headers: { cookie: "ssid=zzzzzz; cid=abcdefghijklmnop" } };
  const anon = cookies(await app.request("/key", h));
  assert.equal(anon.ssid, undefined);
  assert.equal(anon.cid, undefined); // cid kept
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 0);
  const c = cookies(await app.request("/persist", h));
  assert.match(c.ssid!, /^[A-Za-z0-9_-]{22}$/);
});

test("path mode exposes the army host param; both mounts work", async () => {
  const db = openDb(":memory:");
  const cfg = loadConfig({});
  const app = createApp({ cfg, db }, (p: Hono<Env>) => p.get("/who", (c) => c.text(String(c.get("armyHost")))));
  assert.equal(await (await app.request("/a/nsun/who")).text(), "nsun");
  assert.equal(await (await app.request("/who")).text(), "null");
  assert.equal((await app.request("/a/Bad_Host/who")).status, 404);
});

test("a 404 under /a/<host>/ sets a single cid cookie and no session", async () => {
  const { app, db } = setup();
  const res = await app.request("/a/nsun/nothing");
  assert.equal(res.status, 404);
  assert.equal(res.headers.getSetCookie().filter((s) => s.startsWith("cid=")).length, 1);
  assert.equal(res.headers.getSetCookie().filter((s) => s.startsWith("ssid=")).length, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 0);
});

test("subdomain mode sets Domain=BASE_DOMAIN on both cookies, path mode sets none", async () => {
  const sub = setup({ URL_MODE: "subdomain", BASE_DOMAIN: "lvh.me" });
  const set = (await sub.app.request("/persist")).headers.getSetCookie();
  assert.equal(set.length, 2);
  for (const s of set) assert.match(s, /Domain=lvh\.me(;|$)/i);
  for (const s of (await setup().app.request("/persist")).headers.getSetCookie()) assert.doesNotMatch(s, /Domain=/i);
});
