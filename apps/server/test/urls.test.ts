import { test } from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, resolveDataDir } from "../src/config.ts";
import { armyUrl, resolveArmyHost } from "../src/urls.ts";

test("loadConfig defaults", () => {
  const c = loadConfig({});
  assert.equal(c.port, 8080);
  assert.equal(c.urlMode, "path");
  assert.equal(c.dataDir, "var");
  assert.equal(c.trustProxy, false);
  assert.equal(c.tzGame, "Europe/Paris");
  assert.equal(c.secureCookies, false);
  assert.equal(loadConfig({ PUBLIC_URL: "https://x.example", TRUST_PROXY: "1", URL_MODE: "subdomain", BASE_DOMAIN: "x.example", PORT: "9000" }).secureCookies, true);
  assert.throws(() => loadConfig({ URL_MODE: "nope" }));
});

test("subdomain mode needs a BASE_DOMAIN of two labels or more; PUBLIC_URL defaults to it", () => {
  // Chromium keeps a Domain=localhost cookie away from <army>.localhost (verified by the "[e2e cookies]" test of e2e.test.ts): the session
  // could never reach the army subdomains.
  assert.throws(() => loadConfig({ URL_MODE: "subdomain" }), /BASE_DOMAIN/);
  assert.throws(() => loadConfig({ URL_MODE: "subdomain", BASE_DOMAIN: "localhost:8080" }), /BASE_DOMAIN/);
  assert.equal(loadConfig({ URL_MODE: "path" }).baseDomain, "localhost");
  const c = loadConfig({ URL_MODE: "subdomain", BASE_DOMAIN: "mt.localhost", PORT: "9000" });
  assert.equal(c.publicUrl, "http://mt.localhost:9000");
  assert.equal(armyUrl(c, "nsun", "/hq"), "http://nsun.mt.localhost:9000/hq");
  assert.equal(loadConfig({ URL_MODE: "path", PORT: "9000" }).publicUrl, "http://localhost:9000");
});

test("LISTEN_HOST: listening address, 127.0.0.1 by default; HOST is ignored with a warning", () => {
  assert.equal(loadConfig({}).listenHost, "127.0.0.1");
  assert.deepEqual(loadConfig({}).warnings, []);
  assert.equal(loadConfig({ LISTEN_HOST: "0.0.0.0" }).listenHost, "0.0.0.0");
  assert.equal(loadConfig({ LISTEN_HOST: "::1" }).listenHost, "::1");
  const c = loadConfig({ HOST: "pc-killian" });
  assert.equal(c.listenHost, "127.0.0.1");
  assert.equal(c.warnings.length, 1);
  assert.equal(loadConfig({ HOST: "pc-killian", LISTEN_HOST: "0.0.0.0" }).listenHost, "0.0.0.0");
});

test("strict parsing: TRUST_PROXY, PUBLIC_URL, TZ_GAME, BASE_DOMAIN fail at startup with a clear message", () => {
  assert.equal(loadConfig({ TRUST_PROXY: "0" }).trustProxy, false);
  assert.equal(loadConfig({ TRUST_PROXY: "1" }).trustProxy, true);
  assert.equal(loadConfig({ TRUST_PROXY: "true" }).trustProxy, true);
  assert.equal(loadConfig({ TRUST_PROXY: "false" }).trustProxy, false);
  for (const v of ["yes", "on", "2", "TRUE ", ""]) assert.throws(() => loadConfig({ TRUST_PROXY: v }), /TRUST_PROXY/, v);
  for (const v of ["localhost:8080", "ftp://x.example", "not a url", "//x.example"]) assert.throws(() => loadConfig({ PUBLIC_URL: v }), /PUBLIC_URL/, v);
  assert.equal(loadConfig({ PUBLIC_URL: "https://x.example/" }).publicUrl, "https://x.example");
  assert.equal(loadConfig({ TZ_GAME: "America/New_York" }).tzGame, "America/New_York");
  for (const v of ["Mars/Olympus", "", "Europe/Pariss"]) assert.throws(() => loadConfig({ TZ_GAME: v }), /TZ_GAME/, v);
  assert.equal(loadConfig({}).weekendMultiplier, 3);
  assert.equal(loadConfig({ WEEKEND_MULTIPLIER: "1" }).weekendMultiplier, 1);
  assert.equal(loadConfig({ WEEKEND_MULTIPLIER: "10" }).weekendMultiplier, 10);
  for (const v of ["0", "-1", "2.5", "abc", "11", ""]) assert.throws(() => loadConfig({ WEEKEND_MULTIPLIER: v }), /WEEKEND_MULTIPLIER/, v);
  assert.equal(loadConfig({}).levelCostExponent, 2);
  assert.equal(loadConfig({ LEVEL_COST_EXPONENT: "2.5" }).levelCostExponent, 2.5);
  assert.equal(loadConfig({ LEVEL_COST_EXPONENT: "1" }).levelCostExponent, 1);
  assert.equal(loadConfig({ LEVEL_COST_EXPONENT: "3" }).levelCostExponent, 3);
  for (const v of ["0", "0.5", "3.01", "-2", "2,5", "abc", "", "2.555", "10"]) {
    assert.throws(() => loadConfig({ LEVEL_COST_EXPONENT: v }), /LEVEL_COST_EXPONENT/, v);
  }
  // the port of the army URLs comes from PUBLIC_URL: a port in BASE_DOMAIN is refused (it would never match a Host header)
  assert.throws(() => loadConfig({ URL_MODE: "subdomain", BASE_DOMAIN: "lvh.me:8080" }), /BASE_DOMAIN.*port/);
  assert.throws(() => loadConfig({ URL_MODE: "path", BASE_DOMAIN: "lvh.me:8080" }), /BASE_DOMAIN.*port/);
  assert.equal("adminToken" in loadConfig({ ADMIN_TOKEN: "x" }), false);
});

test("subdomain URL helpers agree with each other (BASE_DOMAIN without port, port from PUBLIC_URL)", () => {
  const c = loadConfig({ URL_MODE: "subdomain", BASE_DOMAIN: "mt.localhost", PUBLIC_URL: "http://mt.localhost:8080" });
  const u = new URL(armyUrl(c, "nsun", "/hq"));
  assert.equal(u.href, "http://nsun.mt.localhost:8080/hq");
  assert.deepEqual(resolveArmyHost(c, u.host, u.pathname), { host: "nsun", path: "/hq" });
  const d = loadConfig({ URL_MODE: "subdomain", BASE_DOMAIN: "Mt.Example", PUBLIC_URL: "https://mt.example" });
  const v = new URL(armyUrl(d, "nsun", "/"));
  assert.equal(v.href, "https://nsun.mt.example/");
  assert.deepEqual(resolveArmyHost(d, v.host, v.pathname), { host: "nsun", path: "/" });
});

test("resolveDataDir: relative to the repository root, absolute kept", () => {
  assert.equal(resolveDataDir("var"), join(fileURLToPath(new URL("../../../", import.meta.url)), "var"));
  const abs = resolve("/srv/mt");
  assert.equal(resolveDataDir(abs), abs);
});

test("armyUrl in path mode", () => {
  const c = loadConfig({ URL_MODE: "path" });
  assert.equal(armyUrl(c, "nsun", "/hq"), "/a/nsun/hq");
  assert.equal(armyUrl(c, "nsun", "/"), "/a/nsun/");
  assert.equal(armyUrl(c, "nsun", "/t/0?levelup=abc"), "/a/nsun/t/0?levelup=abc");
});

test("armyUrl in subdomain mode", () => {
  const c = loadConfig({ URL_MODE: "subdomain", PUBLIC_URL: "http://lvh.me:8080", BASE_DOMAIN: "lvh.me" });
  assert.equal(armyUrl(c, "nsun", "/hq"), "http://nsun.lvh.me:8080/hq");
  const s = loadConfig({ URL_MODE: "subdomain", PUBLIC_URL: "https://minitroopers.example", BASE_DOMAIN: "minitroopers.example" });
  assert.equal(armyUrl(s, "nsun", "/hq"), "https://nsun.minitroopers.example/hq");
});

test("resolveArmyHost from path or Host header", () => {
  const p = loadConfig({ URL_MODE: "path" });
  assert.deepEqual(resolveArmyHost(p, "localhost:8080", "/a/nsun/hq"), { host: "nsun", path: "/hq" });
  assert.deepEqual(resolveArmyHost(p, "localhost:8080", "/a/nsun"), { host: "nsun", path: "/" });
  assert.equal(resolveArmyHost(p, "localhost:8080", "/hq"), null);
  assert.equal(resolveArmyHost(p, "localhost", "/a/Bad_Host/hq"), null);
  const s = loadConfig({ URL_MODE: "subdomain", BASE_DOMAIN: "lvh.me" });
  assert.deepEqual(resolveArmyHost(s, "nsun.lvh.me:8080", "/hq"), { host: "nsun", path: "/hq" });
  assert.equal(resolveArmyHost(s, "lvh.me:8080", "/hq"), null);
  assert.equal(resolveArmyHost(s, "evil.com", "/hq"), null);
  assert.equal(resolveArmyHost(s, "a.b.lvh.me", "/hq"), null);
});

import { validateArmyName } from "@mt/game";
import { isValidHost } from "../src/urls.ts";

test("a 20-char army name yields a host that is valid and resolves in both modes", () => {
  const v = validateArmyName("abcdefghijklmnopqrst", 0);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.host.length, 20);
  assert.ok(isValidHost(v.host));
  const p = loadConfig({ URL_MODE: "path" });
  assert.deepEqual(resolveArmyHost(p, "localhost", `/a/${v.host}/hq`), { host: v.host, path: "/hq" });
  const s = loadConfig({ URL_MODE: "subdomain", BASE_DOMAIN: "lvh.me" });
  assert.deepEqual(resolveArmyHost(s, `${v.host}.lvh.me:8080`, "/hq"), { host: v.host, path: "/hq" });
});
