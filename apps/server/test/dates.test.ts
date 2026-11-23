import { test } from "node:test";
import assert from "node:assert/strict";
import { dayDate, historyDate } from "../src/dates.ts";

const TZ = "Europe/Paris";
const NOW = Date.parse("2022-08-10T01:02:24+02:00");
const at = (s: string): string => historyDate(Date.parse(s), NOW, TZ);

test("historyDate: archived and chosen forms (RECON4 §1.1)", () => {
  assert.equal(at("2022-08-06T14:14+02:00"), "Samedi à 14:14");
  assert.equal(at("2022-08-09T12:25+02:00"), "Hier à 12:25");
  assert.equal(at("2022-08-10T00:30+02:00"), "Aujourd'hui à 00:30");
  assert.equal(at("2022-08-04T00:01+02:00"), "Jeudi à 00:01");
  assert.equal(at("2022-08-03T23:59+02:00"), "Le 3 août");
  assert.equal(at("2022-07-27T18:00+02:00"), "Le 27 juillet");
});

test("historyDate: calendar days of the game time zone, not 24-hour spans", () => {
  // 23:59 the day before, 2 minutes earlier in absolute time: "Hier"
  assert.equal(historyDate(Date.parse("2022-08-09T23:59+02:00"), Date.parse("2022-08-10T00:01+02:00"), TZ), "Hier à 23:59");
  // the same instant in another zone
  assert.equal(historyDate(Date.parse("2022-08-09T23:59+02:00"), Date.parse("2022-08-10T00:01+02:00"), "UTC"), "Aujourd'hui à 21:59");
  // a date in the future (clock skew) reads as today
  assert.equal(historyDate(NOW + 60_000, NOW, TZ), "Aujourd'hui à 01:03");
  assert.equal(at("2022-08-01T10:00+02:00"), "Le 1er août");
});

test("dayDate: day key of a battle stored without created_at", () => {
  assert.equal(dayDate("2022-07-27"), "Le 27 juillet");
  assert.equal(dayDate("2021-12-05"), "Le 5 décembre");
});
