import { test } from "node:test";
import assert from "node:assert/strict";
import { create, setup, type Mode } from "./helpers.ts";

const count = (env: ReturnType<typeof setup>, sql: string): number => Number((env.db.prepare(sql).get() as { n: number }).n);

/** A POST with extra headers (the test client does not send any Origin or Sec-Fetch-Site). */
function post(env: ReturnType<typeof setup>, path: string, form: Record<string, string>, headers: Record<string, string>, host = "localhost"): Promise<Response> {
  return Promise.resolve(
    env.app.request(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", host, "cf-connecting-ip": "1.1.1.1", ...headers }, body: new URLSearchParams(form).toString() }),
  );
}

test("POST /login: foreign Origin 403 and nothing changes; cross-site Sec-Fetch-Site without Origin 403; same origin passes (redirect)", async () => {
  const env = setup("path");
  const owner = env.client();
  await create(env, owner, "Warp", { part: "0" });
  const sessions = count(env, "SELECT COUNT(*) AS n FROM sessions");
  const evil = await post(env, "/login", { login: "Warp" }, { origin: "https://evil.example" });
  assert.equal(evil.status, 403);
  assert.equal(await evil.text(), "Requête refusée");
  const cross = await post(env, "/login", { login: "Warp" }, { "sec-fetch-site": "cross-site" });
  assert.equal(cross.status, 403);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM sessions"), sessions);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM sessions WHERE army_id IS NOT NULL"), 1); // only the owner's
  for (const h of [{ origin: "http://localhost:8080" }, { "sec-fetch-site": "same-origin" }, { "sec-fetch-site": "none" }, {}]) {
    const ok = await post(env, "/login", { login: "Warp" }, h);
    assert.equal(ok.status, 302, JSON.stringify(h)); // a redirect, not 403
  }
});

test("POST /: same rule on army creation", async () => {
  const env = setup("path");
  const page = await env.app.request("/");
  const cid = page.headers.getSetCookie().find((x) => x.startsWith("cid="))!.split(";")[0]!; // the offers depend on the client id
  const html = await page.text();
  const seed = [...html.matchAll(/_\.selectTrooper\(100\d,(\d+)\)" style/g)][0]![1]!;
  const form = { part: "5", name: "Evil", tselect: seed };
  const cookie = { cookie: cid };
  assert.equal((await post(env, "/", form, { ...cookie, origin: "https://evil.example" })).status, 403);
  assert.equal((await post(env, "/", form, { ...cookie, "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await post(env, "/", form, { ...cookie, origin: "null" })).status, 403);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM armies"), 0);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM sessions"), 0);
  const ok = await post(env, "/", form, { ...cookie, origin: "http://localhost:8080" });
  assert.ok(ok.status === 302 || ok.status === 303);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM armies"), 1);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM sessions"), 1);
});

test("subdomain mode: Origin may be <x>.<BASE_DOMAIN> with the public scheme and port, nothing else", async () => {
  const env = setup("subdomain" satisfies Mode);
  const form = { login: "Nobody" };
  const host = "lvh.me:8080";
  for (const origin of ["http://lvh.me:8080", "http://warp.lvh.me:8080"]) assert.notEqual((await post(env, "/login", form, { origin }, host)).status, 403, origin);
  for (const origin of ["http://evil.example", "http://lvh.me.evil.example:8080", "https://warp.lvh.me:8080", "http://warp.lvh.me:9999", "http://a.b.lvh.me:8080", "http://warp.lvh.me"]) {
    assert.equal((await post(env, "/login", form, { origin }, host)).status, 403, origin);
  }
});

test("path mode refuses a subdomain Origin; GET is never filtered", async () => {
  const env = setup("path");
  assert.equal((await post(env, "/login", { login: "x" }, { origin: "http://warp.localhost:8080" })).status, 403);
  const get = await env.app.request("/", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  assert.equal(get.status, 200);
});
