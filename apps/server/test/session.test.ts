import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { createApp, type Env } from "../src/app.ts";
import { actionKey } from "../src/session.ts";

function setup(env: Record<string, string> = {}) {
  const db = openDb(":memory:");
  const cfg = loadConfig(env);
  const app = createApp({ cfg, db }, (pages: Hono<Env>) => {
    pages.get("/key", (c) => c.text(c.get("session").key));
    pages.get("/act", actionKey("chk"), (c) => c.text("done"));
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

test("first visit sets ssid (random 128-bit token, not the key) and persistent cid, HttpOnly SameSite=Lax", async () => {
  const { app, db } = setup();
  const res = await app.request("/key");
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
  const first = await app.request("/key");
  const c = cookies(first);
  const key = await first.text();
  const res = await app.request("/key", { headers: { cookie: `ssid=${c.ssid}; cid=${c.cid}` } });
  assert.equal(await res.text(), key);
  assert.equal(res.headers.getSetCookie().length, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions").get() as { n: number }).n, 1);
});

test("the 6-char key of the action URLs is not a session cookie: ssid=<key> is a stranger", async () => {
  const { app, db } = setup();
  const first = await app.request("/key");
  const c = cookies(first);
  const key = await first.text();
  db.prepare("INSERT INTO armies(host, name, created_at) VALUES ('nsun', 'nSun', 1)").run();
  db.prepare("UPDATE sessions SET army_id = 1 WHERE key = ?").run(key);
  const res = await app.request(`/act?chk=${key}`, { headers: { cookie: `ssid=${key}; cid=${c.cid}` } });
  assert.equal(res.status, 403);
  const stolen = cookies(res).ssid;
  assert.ok(stolen && stolen !== c.ssid, "a fresh session was opened");
  const row = db.prepare("SELECT key, army_id FROM sessions WHERE token = ?").get(stolen) as { key: string; army_id: number | null };
  assert.notEqual(row.key, key);
  assert.equal(row.army_id, null);
});

test("cookies are Secure when PUBLIC_URL is https", async () => {
  const { app } = setup({ PUBLIC_URL: "https://x.example" });
  const res = await app.request("/key");
  for (const s of res.headers.getSetCookie()) assert.match(s, /Secure/);
});

test("action URL with a wrong or missing key -> 403, right key -> 200", async () => {
  const { app } = setup();
  const first = await app.request("/key");
  const c = { ...cookies(first), key: await first.text() };
  const h = { headers: { cookie: `ssid=${c.ssid}; cid=${c.cid}` } };
  assert.equal((await app.request("/act?chk=WRONG1", h)).status, 403);
  assert.equal((await app.request("/act", h)).status, 403);
  assert.equal((await app.request("/act?chk=", h)).status, 403);
  assert.equal((await app.request(`/act?opp=3;chk=${c.key}`, h)).status, 200); // original ';' separator
  assert.equal((await app.request(`/act?chk=${c.key}`)).status, 403); // no cookie
  assert.equal((await app.request(`/act?chk=${c.ssid}`, h)).status, 403); // the cookie value is not the key
  const ok = await app.request(`/act?chk=${c.key}`, h);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "done");
});

test("an unknown ssid cookie is replaced by a fresh session", async () => {
  const { app } = setup();
  const res = await app.request("/key", { headers: { cookie: "ssid=zzzzzz; cid=abcdefghijklmnop" } });
  const c = cookies(res);
  assert.notEqual(c.ssid, "zzzzzz");
  assert.equal(c.cid, undefined); // cid kept
});

test("path mode exposes the army host param; both mounts work", async () => {
  const db = openDb(":memory:");
  const cfg = loadConfig({});
  const app = createApp({ cfg, db }, (p: Hono<Env>) => p.get("/who", (c) => c.text(String(c.get("armyHost")))));
  assert.equal(await (await app.request("/a/nsun/who")).text(), "nsun");
  assert.equal(await (await app.request("/who")).text(), "null");
  assert.equal((await app.request("/a/Bad_Host/who")).status, 404);
});

test("a 404 under /a/<host>/ sets a single session cookie", async () => {
  const { app } = setup();
  const res = await app.request("/a/nsun/nothing");
  assert.equal(res.status, 404);
  assert.equal(res.headers.getSetCookie().filter((s) => s.startsWith("ssid=")).length, 1);
});

test("subdomain mode sets Domain=BASE_DOMAIN on both cookies, path mode sets none", async () => {
  const sub = setup({ URL_MODE: "subdomain", BASE_DOMAIN: "lvh.me:8080" });
  const set = (await sub.app.request("/key")).headers.getSetCookie();
  assert.equal(set.length, 2);
  for (const s of set) assert.match(s, /Domain=lvh\.me(;|$)/i);
  for (const s of (await setup().app.request("/key")).headers.getSetCookie()) assert.doesNotMatch(s, /Domain=/i);
});
