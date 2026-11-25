import { test } from "node:test";
import assert from "node:assert/strict";
import { fnv1a } from "../src/hash.ts";
import { RESERVE_MAX, atLocal, prevDay, rechargeTimes, reserveState, rewardMultiplier, weekendEvent } from "../src/index.ts";

const TZ = "Europe/Paris";

test("weekendEvent: one draw per weekend, the same on Saturday and Sunday", () => {
  assert.deepEqual(weekendEvent("2026-11-28", 3), { x3: false, regen: true });
  assert.deepEqual(weekendEvent("2026-11-29", 3), { x3: false, regen: true });
  assert.deepEqual(weekendEvent("2026-12-12", 3), { x3: true, regen: false });
  assert.deepEqual(weekendEvent("2026-12-26", 3), { x3: true, regen: true });
  assert.deepEqual(weekendEvent("2026-12-27", 3), { x3: true, regen: true });
  assert.deepEqual(weekendEvent("2026-11-25", 3), { x3: false, regen: false });
});

test("weekendEvent: with the ×3 disabled (multiplier 1), recharge or nothing", () => {
  for (const sat of ["2026-11-28", "2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26"]) {
    const e = weekendEvent(sat, 1);
    assert.equal(e.x3, false);
    assert.equal(e.regen, fnv1a(sat) % 2 === 0);
  }
});

test("weekendEvent: each formula comes up 150 to 250 times over 600 Saturdays", () => {
  const n = { both: 0, regen: 0, x3: 0 };
  let d = "2026-11-28";
  for (let i = 0; i < 600; i++) {
    const e = weekendEvent(d, 3);
    if (e.x3 && e.regen) n.both++;
    else if (e.regen) n.regen++;
    else if (e.x3) n.x3++;
    for (let k = 0; k < 7; k++) d = nextDay(d);
  }
  for (const v of Object.values(n)) assert.ok(v >= 150 && v <= 250, JSON.stringify(n));
});

function nextDay(day: string): string {
  const [y, m, dd] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
}

test("prevDay still exported (used for Sundays)", () => assert.equal(prevDay("2026-11-29"), "2026-11-28"));

test("rechargeTimes: 11 recharges at 02:00 … 22:00 local time", () => {
  const t = rechargeTimes("2026-11-28", TZ);
  assert.equal(t.length, 11);
  assert.equal(t[0], Date.parse("2026-11-28T01:00:00Z"));
  assert.equal(t[10], Date.parse("2026-11-28T21:00:00Z"));
  assert.equal(atLocal("2026-11-28", 0, TZ), Date.parse("2026-11-27T23:00:00Z"));
});

test("rechargeTimes: the day the clocks go back (25 h) still has 11 recharges, 02:00 once", () => {
  const t = rechargeTimes("2026-10-25", TZ);
  assert.equal(t.length, 11);
  assert.equal(t[0], Date.parse("2026-10-25T01:00:00Z"));
  assert.equal(t[10], Date.parse("2026-10-25T21:00:00Z"));
  assert.equal(new Set(t).size, 11);
});

const DAY = "2026-11-28";
const at = (h: number, mi = 0): number => atLocal(DAY, 0, TZ) + (h * 60 + mi) * 60_000;
const ticks = rechargeTimes(DAY, TZ);
const midnight = atLocal(DAY, 0, TZ);

test("reserveState: no battle at 10:30 → reserve capped at 3, base untouched", () => {
  const s = reserveState({ base: 5, battles: [], ticks, now: at(10, 30), midnight });
  assert.equal(RESERVE_MAX, 3);
  assert.deepEqual([s.reserve, s.baseLeft, s.allowance], [3, 5, 8]);
  assert.equal(s.nextAt, null, "reserve full: no recharge in progress");
});

test("reserveState: base first, then the reserve", () => {
  const battles = [...Array.from({ length: 5 }, () => at(1)), at(5)];
  const s = reserveState({ base: 5, battles, ticks, now: at(5, 30), midnight });
  assert.deepEqual([s.baseLeft, s.reserve, s.allowance], [0, 1, 7]);
  assert.equal(s.nextAt, at(6));
  assert.equal(s.prevAt, at(4));
});

test("reserveState: the cap loses the recharges of a full reserve", () => {
  const battles = [at(7)]; // base battle: the reserve stays full
  const s = reserveState({ base: 5, battles, ticks, now: at(8, 1), midnight });
  assert.equal(s.reserve, 3);
});

test("reserveState: prevAt is midnight before 02:00; nextAt null after 22:00", () => {
  const early = reserveState({ base: 5, battles: [], ticks, now: at(1), midnight });
  assert.deepEqual([early.prevAt, early.nextAt, early.reserve], [midnight, at(2), 0]);
  const battles = [...Array.from({ length: 5 }, () => at(9)), at(22, 10), at(22, 11)];
  const late = reserveState({ base: 5, battles, ticks, now: at(22, 30), midnight });
  assert.deepEqual([late.reserve, late.nextAt], [1, null]);
});

test("reserveState: no ticks (no recharge) → the base allowance only", () => {
  const s = reserveState({ base: 6, battles: [at(9), at(10)], ticks: [], now: at(23), midnight });
  assert.deepEqual([s.allowance, s.baseLeft, s.reserve, s.nextAt], [6, 4, 0, null]);
});

test("reserveState: a recharge at the same instant as a battle counts first", () => {
  const battles = [...Array.from({ length: 5 }, () => at(1)), at(2)];
  const s = reserveState({ base: 5, battles, ticks, now: at(2), midnight });
  assert.deepEqual([s.reserve, s.allowance], [0, 6]);
});

test("rewardMultiplier follows the draw", () => {
  assert.equal(rewardMultiplier("2026-11-28", 3), 1);
  assert.equal(rewardMultiplier("2026-12-12", 3), 3);
  assert.equal(rewardMultiplier("2026-12-26", 3), 3);
  assert.equal(rewardMultiplier("2026-11-25", 3), 1);
});

test("rechargeTimes: the day the clocks go forward (02:00 does not exist) still has 11 recharges, 03:00 then 04:00", () => {
  const t = rechargeTimes("2027-03-28", TZ);
  assert.equal(t.length, 11);
  assert.equal(new Set(t).size, 11);
  assert.equal(t[0], Date.parse("2027-03-28T01:00:00Z")); // 02:00 does not exist: 03:00 summer time
  assert.equal(t[1], Date.parse("2027-03-28T02:00:00Z")); // 04:00 summer time, 1 h later
  assert.equal(t[10], Date.parse("2027-03-28T20:00:00Z")); // 22:00 summer time
});
