import { test } from "node:test";
import assert from "node:assert/strict";
import type { BattleInput } from "@mt/engine";
import { openDb } from "../src/db.ts";
import { TRAININGS_KEPT, armyByHost, createArmy, deleteArmy, insertTraining, recentTrainings, trainingById } from "../src/repo.ts";
import { create, setup, type Client, type Env } from "./helpers.ts";
import { decodeBattleFlashvars } from "./hxdecode.ts";

/** endMsg and attackerSide of the battle embed of a page. */
function embedOf(page: string): { endMsg: string; attackerSide: number } {
  const part = page.split('<div id="swf_battle" class="swf"></div>')[1]!;
  const fv = JSON.parse(/flashvars : ("(?:[^"\\]|\\.)*")/.exec(part)![1]!) as string;
  const d = decodeBattleFlashvars(fv);
  return { endMsg: d.vars.endMsg as string, attackerSide: d.input.attackerSide };
}

/** Two bare armies (A, B) in a fresh database. */
function db2() {
  const db = openDb(":memory:");
  const ins = db.prepare("INSERT INTO armies(host, name, part, faction, credits, created_at) VALUES (?,?,?,?,?,?) RETURNING id");
  const a = (ins.get("aaa", "Aaa", 0, 0, 50, 0) as { id: number }).id;
  const b = (ins.get("bbb", "Bbb", 0, 1, 70, 0) as { id: number }).id;
  return { db, a, b };
}
const INPUT = { attackerSide: 0, seed: 7, armies: [{ troopers: [] }, { troopers: [] }] } as unknown as BattleInput;
const add = (db: ReturnType<typeof db2>["db"], attackerId: number, now: number): number =>
  insertTraining(db, { attackerId, defenderId: null, defenderRef: "filler:10:5", input: INPUT, winner: 1, now });

test("insertTraining stores a row readable by trainingById", () => {
  const { db, a, b } = db2();
  const id = insertTraining(db, { attackerId: a, defenderId: b, defenderRef: null, input: INPUT, winner: 0, now: 1234 });
  assert.deepEqual(trainingById(db, id), { id, attackerId: a, defenderId: b, defenderRef: null, input: INPUT, winner: 0, createdAt: 1234 });
  assert.equal(trainingById(db, id + 1), null);
});

test("only the 10 most recent trainings of an army are kept", () => {
  const { db, a, b } = db2();
  assert.equal(TRAININGS_KEPT, 10);
  const ids = Array.from({ length: 11 }, (_, i) => add(db, a, i));
  const other = add(db, b, 99);
  const kept = recentTrainings(db, a).map((t) => t.id);
  assert.deepEqual(kept, ids.slice(1).reverse());
  assert.equal(trainingById(db, ids[0]!), null);
  assert.notEqual(trainingById(db, other), null);
  assert.deepEqual(recentTrainings(db, b).map((t) => t.id), [other]);
});

test("a training never touches battles, credits or notices", () => {
  const { db, a, b } = db2();
  insertTraining(db, { attackerId: a, defenderId: b, defenderRef: null, input: INPUT, winner: 0, now: 1 });
  const count = (sql: string): number => Number((db.prepare(sql).get() as { n: number }).n);
  assert.equal(count("SELECT COUNT(*) AS n FROM battles"), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM notices"), 0);
  assert.deepEqual(db.prepare("SELECT credits FROM armies ORDER BY id").all().map((r) => (r as { credits: number }).credits), [50, 70]);
});

// --- the training page, its fights and replays (path mode) ---

/** A stored army made directly (no client), like battle.test.ts. */
function storedArmy(env: Env, host: string, name: string, troopers: { seed: number; name: string }[]): number {
  const r = createArmy(env.db, { host, name, part: 0, faction: 1, credits: 0, recruiterId: null, createdIp: "9.9.9.9", createdCid: null, now: env.clock.t, trooper: troopers[0]!, maxPerIp: 999, dayOf: () => "x" });
  if (!r.ok) throw new Error(r.reason);
  troopers.slice(1).forEach((t, i) => env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?,?,?,?,'[]')").run(r.army.id, i + 1, t.seed, t.name));
  return r.army.id;
}
async function world() {
  const env = setup("path");
  const cl = env.client();
  assert.equal((await create(env, cl, "Warp", { part: "0" })).status, 302);
  const id = armyByHost(env.db, "warp")!.id;
  const foeId = storedArmy(env, "foe", "Foe", [{ seed: 1234567, name: "Bob" }]);
  return { env, cl, key: cl.key!, id, foeId };
}
const get = (env: Env, cl: Client, path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<Response> =>
  cl.req(`/a/warp${path}`, { host: "localhost", ...init });
const count = (env: Env, sql: string, ...p: (string | number)[]): number => Number((env.db.prepare(sql).get(...p) as { n: number }).n);
const credits = (env: Env, id: number): number => count(env, "SELECT credits AS n FROM armies WHERE id = ?", id);
const fightLinks = (page: string): string[] => [...page.matchAll(/href="\/a\/warp(\/b\/train\/fight\?opp=[^"]+)"/g)].map((m) => m[1]!.replaceAll("&amp;", "&"));

test("/b/train shows 5 opponents with \"S'entraîner !\" links, the by-name form and \"Autres adversaires\"", async () => {
  const { env, cl } = await world();
  const res = await get(env, cl, "/b/train");
  assert.equal(res.status, 200);
  const page = (await res.text()).replaceAll("&#39;", "'");
  assert.equal(fightLinks(page).length, 5);
  assert.equal([...page.matchAll(/>S'entraîner !</g)].length, 5);
  assert.ok(page.includes("Affronte l'armée de ton choix :") && page.includes(">Affronter !<"));
  assert.match(page, /href="\/a\/warp\/b\/train"[^>]*>Autres adversaires</);
  assert.ok(page.includes("Entraînement"));
  assert.ok(!page.includes("confirm("), "a free training never asks for a confirmation (Killian, 2026-11-25)");
});

test("a training: replay page, no credits, no battle, quota unchanged", async () => {
  const { env, cl, key, id, foeId } = await world();
  const before = credits(env, id);
  const res = await get(env, cl, `/b/train/fight?opp=${foeId};chk=${key}`);
  assert.equal(res.status, 302);
  const m = /\/b\/tview\/(\d+)$/.exec(res.headers.get("location")!);
  assert.ok(m, res.headers.get("location")!);
  assert.equal(credits(env, id), before);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM battles"), 0);
  const hq = (await (await get(env, cl, "/hq")).text()).replaceAll("&#39;", "'");
  assert.ok(hq.includes("Il te reste 5 batailles aujourd'hui !"));
  const replay = (await (await cl.req(`/a/warp/b/tview/${m![1]}`, { host: "localhost" })).text()).replaceAll("&#39;", "'");
  assert.ok(replay.includes("Entraînement : L'armée de Warp VS L'armée de Foe"));
  assert.ok(!/Ton armée gagne/.test(replay));
  assert.ok(replay.includes(`document.location = "/a/warp/b/train";`));
});

test("training by name: another army works; itself is refused (err=self); unknown name (err=missing); nothing stored", async () => {
  const { env, cl, key } = await world();
  const post = (friend: string) => get(env, cl, "/b/train/fight", { method: "POST", form: { chk: key, friend } });
  assert.match((await post("Foe")).headers.get("location")!, /\/b\/tview\/\d+$/);
  assert.match((await post("Warp")).headers.get("location")!, /\/b\/train\?err=self$/);
  assert.match((await post("Nobody here")).headers.get("location")!, /\/b\/train\?err=missing$/);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM trainings"), 1);
  const err = await get(env, cl, "/b/train?err=self");
  assert.equal(err.status, 400);
});

test("training without a valid chk stores nothing and goes back to /b/train", async () => {
  const { env, cl, foeId } = await world();
  const res = await get(env, cl, `/b/train/fight?opp=${foeId};chk=XXXXXX`);
  assert.match(res.headers.get("location")!, /\/b\/train$/);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM trainings"), 0);
});

test("the defender sees nothing: no notice, nothing in its history", async () => {
  const { env, cl, key, foeId } = await world();
  await get(env, cl, `/b/train/fight?opp=${foeId};chk=${key}`);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM notices"), 0);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM battles WHERE defender_id = ?", foeId), 0);
});

test("/b/tview/<id> is public; after 11 trainings the oldest one answers 404; /b/train lists the recent ones", async () => {
  const { env, cl, key, foeId } = await world();
  const ids: string[] = [];
  for (let i = 0; i < 11; i++) ids.push(/(\d+)$/.exec((await get(env, cl, `/b/train/fight?opp=${foeId};chk=${key}`)).headers.get("location")!)![1]!);
  const stranger = env.client("8.8.8.8");
  assert.equal((await stranger.req(`/b/tview/${ids[10]}`, { host: "localhost" })).status, 200);
  assert.equal((await stranger.req(`/b/tview/${ids[0]}`, { host: "localhost" })).status, 404);
  const page = await (await get(env, cl, "/b/train")).text();
  assert.equal([...page.matchAll(/href="[^"]*\/b\/tview\/(\d+)"/g)].length, 10);
  assert.ok(page.includes(`/b/tview/${ids[10]}"`) && !page.includes(`/b/tview/${ids[0]}"`));
});

test("a generated opponent far beyond the drawable power is refused (err=missing), nothing stored", async () => {
  const { env, cl, key } = await world();
  for (const opp of ["filler:10000000:1", "filler:999:1"]) {
    const res = await get(env, cl, `/b/train/fight?opp=${opp};chk=${key}`);
    assert.match(res.headers.get("location")!, /\/b\/train\?err=missing$/, opp);
  }
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM trainings"), 0);
});

test("own army, malformed or nonexistent opp are refused, nothing stored", async () => {
  const { env, cl, key, id } = await world();
  assert.match((await get(env, cl, `/b/train/fight?opp=${id};chk=${key}`)).headers.get("location")!, /err=self$/);
  for (const opp of ["abc", "999999"]) assert.match((await get(env, cl, `/b/train/fight?opp=${opp};chk=${key}`)).headers.get("location")!, /err=missing$/, opp);
  assert.equal(count(env, "SELECT COUNT(*) AS n FROM trainings"), 0);
});

test("the defender opening a shared training sees it from its own side", async () => {
  const { env, cl, key } = await world();
  // the defender is a real army with a session: Foe2 created through a client
  const other = env.client("7.7.7.7");
  assert.equal((await create(env, other, "Foe2", { part: "0" })).status, 302);
  const res = await get(env, cl, "/b/train/fight", { method: "POST", form: { chk: key, friend: "Foe2" } });
  const tid = /(\d+)$/.exec(res.headers.get("location")!)![1]!;
  const t = trainingById(env.db, Number(tid))!;
  const attackerWon = t.winner !== null && t.winner === t.input.attackerSide;
  const seen = embedOf(await (await other.req(`/a/foe2/b/tview/${tid}`, { host: "localhost" })).text());
  assert.equal(seen.endMsg, attackerWon ? "Ce combat s'est soldé par un échec !" : "Tu as remporté ce combat !");
  assert.equal(seen.attackerSide, 1 - t.input.attackerSide);
  const mine = embedOf(await (await get(env, cl, `/b/tview/${tid}`)).text());
  assert.equal(mine.endMsg, attackerWon ? "Tu as remporté ce combat !" : "Ce combat s'est soldé par un échec !");
});

test("deleteArmy: a training against the deleted army keeps its name as gone:<name>, like battles", () => {
  const { db, a, b } = db2();
  const id = insertTraining(db, { attackerId: a, defenderId: b, defenderRef: null, input: INPUT, winner: 1, now: 1 });
  assert.equal(deleteArmy(db, b), true);
  const t = trainingById(db, id)!;
  assert.deepEqual({ defenderId: t.defenderId, defenderRef: t.defenderRef }, { defenderId: null, defenderRef: "gone:Bbb" });
});
