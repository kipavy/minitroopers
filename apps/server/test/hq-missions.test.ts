import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey } from "@mt/game";
import { hashPassword } from "../src/password.ts";
import { armyByHost, createArmy } from "../src/repo.ts";
import { create, setup, type Client, type Env } from "./helpers.ts";

// All the missions every day: the route by type and the HQ boxes (spec 2026-11-25-missions-quotidiennes-design.md §3, §5).

async function warp(env: Env, o: { unlocked?: boolean; recruits?: number } = {}) {
  const cl = env.client();
  assert.equal((await create(env, cl, "Warp", { part: "0" })).status, 302);
  const id = armyByHost(env.db, "warp")!.id;
  env.db.prepare("UPDATE armies SET missions_unlocked = ?, credits = 100 WHERE id = ?").run(o.unlocked === false ? 0 : 1, id);
  for (let i = 0; i < (o.recruits ?? 0); i++) {
    const r = createArmy(env.db, { host: `rec${i}`, name: `rec${i}`, part: 0, faction: 1, credits: 0, recruiterId: id, createdIp: "9.9.9.9", createdCid: null, now: env.clock.t, trooper: { seed: 2_000_000 + i, name: `R${i}` }, maxPerIp: 9999, dayOf: () => "x" });
    if (!r.ok) throw new Error(r.reason);
    env.db.prepare("UPDATE armies SET recruit_confirmed_at = ? WHERE id = ?").run(env.clock.t, r.army.id);
  }
  return { cl, key: cl.key!, id };
}
const get = (cl: Client, path: string): Promise<Response> => cl.req(`/a/warp${path}`, { host: "localhost" });
const today = (env: Env): string => dayKey(new Date(env.clock.t), "Europe/Paris");
const modes = (env: Env, id: number): string[] =>
  (env.db.prepare("SELECT mode FROM battles WHERE attacker_id = ? AND kind = 'mission' ORDER BY id").all(id) as { mode: string }[]).map((r) => r.mode);
const used = (env: Env, id: number, type: string): number =>
  Number((env.db.prepare("SELECT used FROM mission_day WHERE army_id = ? AND day = ? AND type = ?").get(id, today(env), type) as { used: number } | undefined)?.used ?? 0);
/** One try of `type` at its current count; the redirect target. */
async function play(env: Env, w: { cl: Client; key: string; id: number }, type: string): Promise<string> {
  const res = await get(w.cl, `/b/mission?type=${type};n=${used(env, w.id, type)};chk=${w.key}`);
  return res.headers.get("location")!;
}
/** The HQ boxes: title → inner HTML of its action. */
function boxes(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<h1 class="hbox">([^<]+)<\/h1>\s*<div class="box2bottom"><div class="action[^"]*">([\s\S]*?)<\/div><\/div><\/div><\/div>/g)) out.set(m[1]!, m[2]!);
  return out;
}

test("the three missions the same day: each by its type, replays numbered across them in order", async () => {
  const env = setup("path");
  const w = await warp(env, { recruits: 10 });
  const seen: string[] = [];
  // one try each (a won try closes its mission: a 2nd try would depend on the random outcome)
  for (const type of ["exterminate", "infiltrate", "epic"]) seen.push(await play(env, w, type));
  assert.deepEqual(seen.map((l) => /miss(\d+)/.exec(l)?.[1]), ["1", "2", "3"]);
  assert.deepEqual(modes(env, w.id), ["exterminate", "infiltrate", "epic"]);
  for (const n of [1, 2, 3]) assert.equal((await get(w.cl, `/b/view/miss${n}`)).status, 200);
});

test("a replayed infiltrate URL shows the infiltrate try it made, not another mission's", async () => {
  const env = setup("path");
  const w = await warp(env);
  await play(env, w, "exterminate"); // miss1
  const first = await play(env, w, "infiltrate"); // miss2
  assert.match(first, /miss2/);
  const again = await get(w.cl, `/b/mission?type=infiltrate;n=0;chk=${w.key}`);
  assert.match(again.headers.get("location")!, /\/b\/view\/miss2\?d=/);
  assert.equal(modes(env, w.id).length, 2, "nothing fought");
});

test("epic under 10 recruits, an unknown or missing type: back to the HQ, nothing fought", async () => {
  const env = setup("path");
  const w = await warp(env, { recruits: 3 });
  for (const q of ["type=epic;n=0", "type=raid;n=0", "n=0"]) {
    const res = await get(w.cl, `/b/mission?${q};chk=${w.key}`);
    assert.match(res.headers.get("location")!, /\/a\/warp\/hq$/, q);
  }
  assert.equal(modes(env, w.id).length, 0);
});

test("HQ before the unlock: one « Missions » box with « Débloquer pour 5 » (choice D)", async () => {
  const env = setup("path");
  const w = await warp(env, { unlocked: false });
  const b = boxes(await (await get(w.cl, "/hq")).text());
  assert.deepEqual([...b.keys()].filter((k) => k.startsWith("Mission")), ["Missions"]);
  assert.ok(b.get("Missions")!.includes("/b/unlock?chk="));
  assert.ok(b.get("Missions")!.includes("Débloque les missions : Exterminer et Infiltrer tous les jours !"));
});

test("HQ unlocked under 10 recruits: Exterminer, Infiltrer, Epique in order; epic blocked « Encore 7 recrues » (choice A)", async () => {
  const env = setup("path");
  const w = await warp(env, { recruits: 3 });
  const html = await (await get(w.cl, "/hq")).text();
  const b = boxes(html);
  assert.deepEqual([...b.keys()].filter((k) => k.startsWith("Mission")), ["Mission : Exterminer", "Mission : Infiltrer", "Mission : Epique"]);
  assert.equal(b.get("Mission : Infiltrer")!.split("/b/mission?type=infiltrate;n=0;").length - 1, 3);
  const epic = b.get("Mission : Epique")!.replaceAll("&#39;", "'");
  assert.ok(epic.includes('<div class="b bblock">') && epic.includes("Encore 7 recrues"));
  assert.ok(epic.includes("La mission Épique s'ouvre à 10 recrues confirmées."));
  assert.ok(!epic.includes("/b/mission"));
  // the boxes are separated by whitespace (inline-block gaps), as the validated mockups
  assert.match(html, /<\/div><\/div><\/div><\/div>\s+<div class="box2"><div class="box2bg"[^>]*><h1 class="hbox">Mission : Infiltrer/);
});

test("HQ with 10 recruits: epic playable; exterminate won shows one win tile, infiltrate keeps its 3 tries", async () => {
  const env = setup("path", {}, { battleSeed: () => 4242 });
  const w = await warp(env, { recruits: 10 });
  env.db.prepare("INSERT INTO mission_day(army_id, day, type, used, won) VALUES (?, ?, 'exterminate', 1, 1)").run(w.id, today(env));
  env.db
    .prepare("INSERT INTO battles(day, attacker_id, defender_id, defender_ref, input, winner, kind, mode, created_at) VALUES (?, ?, NULL, NULL, ?, 0, 'mission', 'exterminate', ?)")
    .run(today(env), w.id, JSON.stringify({ attackerSide: 0 }), env.clock.t);
  const b = boxes(await (await get(w.cl, "/hq")).text());
  assert.equal(b.get("Mission : Exterminer")!.split('<div class="b bwin">').length - 1, 1);
  assert.ok(!b.get("Mission : Exterminer")!.includes("/b/mission?"));
  assert.equal(b.get("Mission : Infiltrer")!.split("/b/mission?type=infiltrate;n=0;").length - 1, 3);
  assert.equal(b.get("Mission : Epique")!.split("/b/mission?type=epic;n=0;").length - 1, 3);
});

test("a stranger on a protected army sees three empty mission boxes, whatever its state", async () => {
  for (const o of [{ unlocked: false }, { unlocked: true, recruits: 3 }]) {
    const env = setup("path");
    const w = await warp(env, o);
    env.db.prepare("UPDATE armies SET password_hash = ? WHERE id = ?").run(hashPassword("pw"), w.id);
    const html = await (await env.client("2.2.2.2").req("/a/warp/hq", { host: "localhost" })).text();
    const b = boxes(html);
    assert.deepEqual([...b.keys()].filter((k) => k.startsWith("Mission")), ["Mission : Exterminer", "Mission : Infiltrer", "Mission : Epique"]);
    for (const k of ["Mission : Exterminer", "Mission : Infiltrer", "Mission : Epique"]) assert.equal(b.get(k)!.trim(), "", k);
    assert.ok(!html.includes("bblock") && !html.includes("Débloquer"));
  }
});
