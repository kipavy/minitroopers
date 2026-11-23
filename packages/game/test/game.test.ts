import { test } from "node:test";
import assert from "node:assert/strict";
import { Rand } from "@mt/engine";
import {
  dayKey, nextResetAt, prevDay, host, validateArmyName, dailyOffers, trooperName,
  battlesPerDay, battleReward, referralBounty, STARTING_CREDITS,
} from "../src/index.ts";

test("host: recon cases", () => {
  assert.equal(host("Agen Blakla"), "agen-blakla");
  assert.equal(host("Tyraël"), "tyrael");
  assert.equal(host("  Œuvre  d'Art "), "oeuvre-dart");
  assert.equal(host("Groin céleste"), "groin-celeste");
});

test("host: dot kept (exact original)", () => {
  assert.equal(host("a.b"), "a.b");
  assert.equal(host("Sgt. Pepper"), "sgt.-pepper");
  assert.equal(validateArmyName("Sgt. Pepper", 0).ok, false);
});

test("dailyOffers: distinct names", () => {
  for (let i = 0; i < 300; i++) {
    const o = dailyOffers({ day: "2026-11-22", clientId: "c" + i, recruiter: null, salt: "s" });
    assert.equal(new Set(o.map((x) => x.name)).size, 5);
  }
});

test("host: >16 chars", () => {
  assert.equal(host("a-bcdefghijklmnopqrs"), "a-bcdefghijklmno"); // 16 first chars, first part < 8
  assert.equal(host("a-bcdefghijklmn-opqr"), "a-bcdefghijklmn"); // cut ends on "-": removed
  assert.equal(host("abcdefgh-ijklmnopqrs"), "abcdefgh"); // first part >= 8
  assert.equal(host("abc-defghijklmn-opqrs"), "abc-defghijklmn"); // trailing "-" removed at cut
  assert.equal(host("12345678901234567890"), "12345678901234567890"); // no dash: whole name is the first part (original quirk)
});

test("validateArmyName", () => {
  assert.deepEqual(validateArmyName("Groin céleste", 3), { ok: true, host: "groin-celeste" });
  assert.equal(validateArmyName("", 0).ok, false);
  assert.equal(validateArmyName("x".repeat(21), 0).ok, false);
  assert.equal(validateArmyName("abcdef", 6).ok, false);
  assert.equal(validateArmyName("abcdef", -1).ok, false);
  assert.equal(validateArmyName("ab", 0).ok, false);
  assert.equal(validateArmyName("!!!", 0).ok, false);
  assert.equal(validateArmyName("WWW", 0).ok, false);
  assert.equal(validateArmyName("Admin", 0).ok, false);
  assert.equal(validateArmyName("a-b-c-d-e-f-g-h-i-j-", 5).ok, true);
});

test("validateArmyName: hosts a browser or DNS cannot reach are refused", () => {
  // new URL("http://xn--a.mt.localhost") throws: "xn--" starts a punycode label
  assert.equal(validateArmyName("xn--abc", 0).ok, false);
  assert.equal(validateArmyName("XN--Warp", 0).ok, false);
  // a DNS label cannot start or end with "-"
  assert.equal(validateArmyName("-Warp", 0).ok, false);
  assert.equal(validateArmyName("Warp-", 0).ok, false);
  assert.equal(validateArmyName("- Warp -", 0).ok, false);
  assert.equal(validateArmyName("---", 0).ok, false);
  assert.equal(validateArmyName("! Warp", 0).ok, false); // "!" dropped, the space became a leading "-"
  assert.deepEqual(validateArmyName("War-p", 0), { ok: true, host: "war-p" });
});

test("dailyOffers: deterministic, 5 distinct, sensitive to inputs", () => {
  const p = { day: "2026-11-22", clientId: "c1", recruiter: null, salt: "s" };
  const a = dailyOffers(p);
  assert.deepEqual(dailyOffers(p), a);
  assert.equal(a.length, 5);
  assert.equal(new Set(a.map((o) => o.seed)).size, 5);
  for (const o of a) {
    assert.ok(o.seed >= 273018 && o.seed <= 16491340);
    assert.ok(o.name.length > 0 && o.name.length <= 12);
    assert.ok(o.colour >= 3 && o.colour <= 5);
  }
  assert.notDeepEqual(dailyOffers({ ...p, day: "2026-11-23" }), a);
  assert.notDeepEqual(dailyOffers({ ...p, clientId: "c2" }), a);
  assert.notDeepEqual(dailyOffers({ ...p, recruiter: "r" }), a);
  assert.notDeepEqual(dailyOffers({ ...p, salt: "t" }), a);
});

test("trooperName: <= 12 chars, deterministic", () => {
  for (let s = 1; s <= 500; s++) {
    const n = trooperName(new Rand(s));
    assert.ok(n.length >= 2 && n.length <= 12, n);
    assert.equal(trooperName(new Rand(s)), n);
  }
});

test("economy", () => {
  assert.equal(referralBounty(1), 100);
  for (const i of [2, 3, 4]) assert.equal(referralBounty(i), 50);
  for (let i = 5; i <= 14; i++) assert.equal(referralBounty(i), 10);
  for (let i = 15; i <= 34; i++) assert.equal(referralBounty(i), 5);
  assert.equal(referralBounty(35), 0);
  assert.equal(battlesPerDay([{ skills: [1] }, { skills: [] }]), 3);
  const c = { skills: [69, 2] };
  assert.equal(battlesPerDay([c, c, c]), 5);
  assert.equal(battlesPerDay([c, c, c, c, c]), 5);
  assert.equal(battlesPerDay([c]), 4);
  assert.equal(battleReward(true), 2);
  assert.equal(battleReward(false), 1);
  assert.equal(STARTING_CREDITS, 0);
});

test("prevDay: the calendar day before a day key (month, year, leap day)", () => {
  assert.equal(prevDay("2026-11-24"), "2026-11-23");
  assert.equal(prevDay("2026-03-01"), "2026-02-28");
  assert.equal(prevDay("2028-03-01"), "2028-02-29");
  assert.equal(prevDay("2027-01-01"), "2026-12-31");
});

test("dayKey / nextResetAt Europe/Paris", () => {
  const tz = "Europe/Paris";
  assert.equal(dayKey(new Date("2026-01-15T22:59:59Z"), tz), "2026-01-15");
  assert.equal(dayKey(new Date("2026-01-15T23:00:01Z"), tz), "2026-01-16");
  assert.equal(dayKey(new Date("2026-07-15T21:59:59Z"), tz), "2026-07-15");
  assert.equal(dayKey(new Date("2026-07-15T22:00:01Z"), tz), "2026-07-16");
  assert.equal(nextResetAt(new Date("2026-01-15T12:00:00Z"), tz).toISOString(), "2026-01-15T23:00:00.000Z");
  assert.equal(nextResetAt(new Date("2026-07-15T12:00:00Z"), tz).toISOString(), "2026-07-15T22:00:00.000Z");
  assert.equal(nextResetAt(new Date("2026-01-15T23:00:00Z"), tz).toISOString(), "2026-01-16T23:00:00.000Z");
  // DST change days (spring forward 2026-03-29, fall back 2026-10-25)
  assert.equal(nextResetAt(new Date("2026-03-29T12:00:00Z"), tz).toISOString(), "2026-03-29T22:00:00.000Z");
  assert.equal(nextResetAt(new Date("2026-03-28T12:00:00Z"), tz).toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(nextResetAt(new Date("2026-10-25T12:00:00Z"), tz).toISOString(), "2026-10-25T23:00:00.000Z");
});
