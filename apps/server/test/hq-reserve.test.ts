import { test } from "node:test";
import assert from "node:assert/strict";
import { armyByHost } from "../src/repo.ts";
import { create, setup, type Env } from "./helpers.ts";

// HQ battle box on a recharge weekend, version F (spec 2026-11-25-recharge-week-end-design.md §4).
// 2026-11-28 = « recharge seule », 2026-12-12 = « ×3 seul », 2026-11-25 = Wednesday. Paris = UTC+1.
const local = (day: string, h: number, mi = 0): number => Date.parse(`${day}T${String(h - 1).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00Z`);
const SAT = "2026-11-28";

async function hqAt(t: number, battles: number[] = []): Promise<{ html: string; box: string; row: string }> {
  const env: Env = setup("path");
  env.clock.t = t;
  const cl = env.client();
  assert.equal((await create(env, cl, "Warp", { part: "0" })).status, 302);
  const id = armyByHost(env.db, "warp")!.id;
  const day = new Date(t + 3_600_000).toISOString().slice(0, 10);
  const input = JSON.stringify({ attackerSide: 0 });
  for (const at of battles) {
    env.db
      .prepare("INSERT INTO battles(day, attacker_id, defender_id, defender_ref, input, winner, kind, opp, reward, created_at) VALUES (?, ?, NULL, 'x', ?, 0, 'battle', 'x', 2, ?)")
      .run(day, id, input, at);
  }
  const html = await (await cl.req("/a/warp/hq", { host: "localhost" })).text();
  const box = html.split('<h1 class="hbox">Mission :')[0]!.split('<h1 class="hbox">Bataille</h1>')[1] ?? "";
  const row = box.split('<div class="reserve-row">')[1]?.split('<div class="hqtip">')[0] ?? "";
  return { html: html.replaceAll("&#39;", "'"), box: box.replaceAll("&#39;", "'"), row };
}
const ready = (row: string): number => row.split('<div class="b bgo2"><div class="b_right bgo2_right"><a href="/a/warp/b/opp"').length - 1;
const count = (s: string, part: string): number => s.split(part).length - 1;
const dayTiles = (box: string): number => [...box.split('<div class="reserve-row">')[0]!.matchAll(/<div class="b (bgo2|bwin|bdefeat)">/g)].length;

test("recharge Saturday 10:30, no battle: the reserve row has 3 ready GO (cap), base text", async () => {
  const p = await hqAt(local(SAT, 10, 30));
  assert.ok(p.box.includes('<div class="reserve-row">'));
  assert.equal(ready(p.row), 3);
  assert.equal(count(p.row, "recharging"), 0);
  assert.ok(p.box.includes("Il te reste 5 batailles aujourd'hui !"));
  assert.ok(p.html.includes('<div class="box2 reserve">'));
  assert.ok(p.box.includes('<div class="action bcount5 reserve">'));
});

test("5 base battles then 1 from the reserve: 2 ready + 1 recharging until 12:00, 5 day tiles, reserve text", async () => {
  const battles = [...Array.from({ length: 5 }, () => local(SAT, 9)), local(SAT, 10, 20)];
  const p = await hqAt(local(SAT, 10, 30), battles);
  assert.equal(ready(p.row), 2);
  assert.equal(count(p.row, 'class="b bgo2 recharging"'), 1);
  assert.ok(p.row.includes(`data-to="${local(SAT, 12)}"`));
  assert.ok(p.row.includes(`data-from="${local(SAT, 10)}"`));
  assert.ok(p.row.includes('style="--p:'));
  assert.equal(dayTiles(p.box), 5);
  assert.equal(count(p.box.split('<div class="reserve-row">')[0]!, '<div class="b bwin">'), 5);
  assert.ok(p.box.includes("Réserve : 2 batailles sur 3 !"));
});

test("empty reserve with a recharge to come: « Prochaine bataille dans » and the chrono", async () => {
  const battles = [...Array.from({ length: 5 }, () => local(SAT, 9)), ...Array.from({ length: 3 }, () => local(SAT, 10, 20))];
  const p = await hqAt(local(SAT, 10, 30), battles);
  assert.equal(ready(p.row), 0);
  assert.equal(count(p.row, 'class="b bgo2 recharging"'), 1);
  assert.equal(count(p.row, 'class="b bgo2 empty"'), 2);
  assert.match(p.box, /Prochaine bataille dans\s*<img src="\/img\/anim_small_chrono\.gif"\/>/);
});

test("22:30 with 1 left in the reserve: 1 GO, 2 empty, nothing recharging", async () => {
  const battles = [...Array.from({ length: 5 }, () => local(SAT, 9)), local(SAT, 22, 10), local(SAT, 22, 11)];
  const p = await hqAt(local(SAT, 22, 30), battles);
  assert.equal(ready(p.row), 1);
  assert.equal(count(p.row, 'class="b bgo2 empty"'), 2);
  assert.equal(count(p.row, "recharging"), 0);
  assert.ok(p.box.includes("Réserve : 1 bataille sur 3 !"));
});

test("everything played after 22:00: « Tu as terminé tes batailles du jour ! »", async () => {
  const battles = [...Array.from({ length: 5 }, () => local(SAT, 9)), ...Array.from({ length: 3 }, () => local(SAT, 22, 10))];
  const p = await hqAt(local(SAT, 22, 30), battles);
  assert.equal(count(p.row, 'class="b bgo2 empty"'), 3);
  assert.ok(p.box.includes("Tu as terminé tes batailles du jour !"));
});

test("a ×3-only weekend and a weekday: no reserve row, the battle box as before", async () => {
  for (const t of [local("2026-12-12", 10, 30), local("2026-11-25", 10, 30)]) {
    const p = await hqAt(t);
    assert.ok(!p.html.includes("reserve-row"));
    assert.ok(!p.html.includes("box2 reserve"));
    assert.ok(p.box.includes('<div class="action bcount5">'));
    assert.ok(!p.html.includes("/js/reserve.js"));
  }
});

test("the live script is included only with the reserve row", async () => {
  assert.ok((await hqAt(local(SAT, 10, 30))).html.includes('<script type="text/javascript" src="/js/reserve.js?v='));
});
