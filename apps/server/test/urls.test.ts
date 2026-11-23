import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.ts";
import { armyUrl, resolveArmyHost } from "../src/urls.ts";

test("loadConfig defaults", () => {
  const c = loadConfig({});
  assert.equal(c.port, 8080);
  assert.equal(c.urlMode, "path");
  assert.equal(c.dataDir, "var");
  assert.equal(c.trustProxy, false);
  assert.equal(c.tzGame, "Europe/Paris");
  assert.equal(c.secureCookies, false);
  assert.equal(loadConfig({ PUBLIC_URL: "https://x.example", TRUST_PROXY: "1", URL_MODE: "subdomain", PORT: "9000" }).secureCookies, true);
  assert.throws(() => loadConfig({ URL_MODE: "nope" }));
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
