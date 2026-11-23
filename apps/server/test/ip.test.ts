import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.ts";
import { clientIp } from "../src/ip.ts";
import { createRateLimiter } from "../src/ratelimit.ts";

const hdr = (o: Record<string, string>) => (n: string) => o[n.toLowerCase()];

test("CF-Connecting-IP is used only when TRUST_PROXY=1", () => {
  const h = hdr({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" });
  assert.equal(clientIp(loadConfig({}), h, "10.0.0.1"), "10.0.0.1");
  assert.equal(clientIp(loadConfig({ TRUST_PROXY: "0" }), h, "10.0.0.1"), "10.0.0.1");
  assert.equal(clientIp(loadConfig({ TRUST_PROXY: "1" }), h, "10.0.0.1"), "1.2.3.4");
  assert.equal(clientIp(loadConfig({ TRUST_PROXY: "1" }), hdr({}), "10.0.0.1"), "10.0.0.1");
  assert.equal(clientIp(loadConfig({}), hdr({}), undefined), "unknown");
});

test("rate limiter allows `limit` hits per window", () => {
  let t = 0;
  const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
  assert.ok(rl.hit("a") && rl.hit("a"));
  assert.ok(!rl.hit("a"));
  assert.ok(rl.hit("b"));
  t = 1001;
  assert.ok(rl.hit("a"));
});
