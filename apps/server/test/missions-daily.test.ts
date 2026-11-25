import { test } from "node:test";
import assert from "node:assert/strict";
import type { BattleInput } from "@mt/engine";
import type { MissionType } from "@mt/game";
import { openDb } from "../src/db.ts";
import { armyById, availableMissions, dayOver, epicAllowed, fightMission, missionDay, resetDay } from "../src/repo.ts";

// All the missions every day (spec 2026-11-25-missions-quotidiennes-design.md §1, §2, §4).
const DAY = "2026-11-25";

function world(o: { unlocked?: boolean; recruits?: number } = {}) {
  const db = openDb(":memory:");
  const ins = db.prepare("INSERT INTO armies(host, name, part, faction, credits, created_at, missions_unlocked) VALUES (?,?,?,?,?,?,?) RETURNING id");
  const id = (ins.get("aaa", "Aaa", 0, 0, 50, 0, o.unlocked === false ? 0 : 1) as { id: number }).id;
  for (let i = 0; i < (o.recruits ?? 0); i++) {
    db.prepare("INSERT INTO armies(host, name, part, faction, credits, created_at, recruiter_id, recruit_confirmed_at) VALUES (?,?,?,?,?,?,?,?)").run(`r${i}`, `R${i}`, 0, 0, 0, 0, id, 1);
  }
  return { db, id };
}
const INPUT = { attackerSide: 0, seed: 7, armies: [{ troopers: [] }, { troopers: [] }] } as unknown as BattleInput;
/** One try of `type`, won or lost, through fightMission. */
function play(w: ReturnType<typeof world>, type: MissionType, win: boolean) {
  const used = missionDay(w.db, w.id, DAY, type).used;
  return fightMission(w.db, {
    armyId: w.id,
    day: DAY,
    type,
    now: 1,
    used,
    decide: () => ({ mode: type, defenderId: null, defenderRef: null, input: INPUT, winner: win ? 0 : 1, reward: win ? 4 : 0 }),
  });
}
const over = (w: ReturnType<typeof world>): boolean => dayOver(w.db, w.id, DAY, { allowance: 0, rechargeAhead: false });

test("availableMissions: none before the unlock, exterminate + infiltrate after, epic from 10 confirmed recruits", () => {
  assert.deepEqual(availableMissions(world({ unlocked: false }).db, 1, DAY), []);
  const a = world({ recruits: 9 });
  assert.deepEqual(availableMissions(a.db, a.id, DAY), ["exterminate", "infiltrate"]);
  const b = world({ recruits: 10 });
  assert.deepEqual(availableMissions(b.db, b.id, DAY), ["exterminate", "infiltrate", "epic"]);
});

test("each mission has its own 3 tries; a win closes only its own mission", () => {
  const w = world({ recruits: 10 });
  assert.equal(play(w, "exterminate", true).ok, true);
  assert.equal(play(w, "exterminate", true).ok, false, "exterminate already won today");
  for (let i = 0; i < 3; i++) assert.equal(play(w, "infiltrate", false).ok, true);
  assert.equal(play(w, "infiltrate", false).ok, false, "3 tries used");
  assert.equal(play(w, "epic", false).ok, true);
  assert.deepEqual(["exterminate", "infiltrate", "epic"].map((t) => missionDay(w.db, w.id, DAY, t as MissionType).used), [1, 3, 1]);
});

test("exterminate won once a day: the rats go up by one at most", () => {
  const w = world();
  const before = armyById(w.db, w.id)!.rats;
  play(w, "exterminate", true);
  play(w, "exterminate", true);
  assert.equal(armyById(w.db, w.id)!.rats, before + 1);
});

test("epic: refused under 10 recruits; once played today it stays playable even under 10", () => {
  const w = world({ recruits: 10 });
  assert.equal(play(w, "epic", false).ok, true);
  w.db.prepare("UPDATE armies SET recruit_confirmed_at = NULL WHERE recruiter_id = ?").run(w.id);
  assert.equal(epicAllowed(w.db, w.id, DAY), true);
  assert.equal(play(w, "epic", false).ok, true);
  const v = world({ recruits: 3 });
  const r = play(v, "epic", true);
  assert.deepEqual([r.ok, r.ok ? "" : r.reason], [false, "locked"]);
});

test("missions not unlocked: every try refused (locked)", () => {
  const w = world({ unlocked: false });
  const r = play(w, "exterminate", true);
  assert.deepEqual([r.ok, r.ok ? "" : r.reason], [false, "locked"]);
});

test("dayOver waits for every available mission (won or 3 tries)", () => {
  const w = world();
  assert.equal(over(w), false);
  play(w, "exterminate", true);
  assert.equal(over(w), false, "infiltrate still to do");
  for (let i = 0; i < 3; i++) play(w, "infiltrate", false);
  assert.equal(over(w), true);
  const l = world({ unlocked: false });
  assert.equal(over(l), true, "locked missions never hold the day");
});

test("admin reset-day mission: the three missions start again, targets drawn again", () => {
  const w = world({ recruits: 10 });
  play(w, "exterminate", true);
  for (let i = 0; i < 3; i++) play(w, "infiltrate", false);
  w.db.prepare("UPDATE mission_day SET target = 'x' WHERE army_id = ?").run(w.id);
  resetDay(w.db, w.id, DAY, { battles: false, mission: true, raid: false, shop: false });
  for (const t of ["exterminate", "infiltrate", "epic"] as MissionType[]) {
    const m = missionDay(w.db, w.id, DAY, t);
    assert.deepEqual([m.used - m.reset, m.won, m.target], [0, false, null], t);
  }
  assert.equal(play(w, "infiltrate", true).ok, true);
});
