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
