import { test } from "node:test";
import assert from "node:assert/strict";
import { armyByHost, createArmy, resetDay } from "../src/repo.ts";
import { create, setup, type Client, type Env } from "./helpers.ts";

// Weekend recharge (spec 2026-11-25-recharge-week-end-design.md): 2026-11-28/29 draw "recharge seule",
// 2026-11-25 is a Wednesday. Local time = Europe/Paris = UTC+1 in November.
const local = (day: string, h: number, mi = 0): number => Date.parse(`${day}T${String(h - 1).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00Z`);
const SAT = "2026-11-28";

async function world(t: number) {
  const env = setup("path");
  env.clock.t = t;
  const cl = env.client();
  assert.equal((await create(env, cl, "Warp", { part: "0" })).status, 302);
  const r = createArmy(env.db, { host: "foe", name: "Foe", part: 0, faction: 1, credits: 0, recruiterId: null, createdIp: "9.9.9.9", createdCid: null, now: t, trooper: { seed: 1234567, name: "Bob" }, maxPerIp: 999, dayOf: () => "x" });
  if (!r.ok) throw new Error(r.reason);
  return { env, cl, key: cl.key!, id: armyByHost(env.db, "warp")!.id };
}
const get = (cl: Client, path: string): Promise<Response> => cl.req(`/a/warp${path}`, { host: "localhost" });
const used = (env: Env, id: number): number => Number((env.db.prepare("SELECT COUNT(*) AS n FROM battles WHERE attacker_id = ? AND kind = 'battle'").get(id) as { n: number }).n);

/** One attack by name at the current count; "ok" when a battle was stored, else the redirect target. */
async function attack(w: Awaited<ReturnType<typeof world>>): Promise<string> {
  const before = used(w.env, w.id);
  const res = await get(w.cl, `/b/battle?friend=foe;n=${before};chk=${w.key}`);
  return used(w.env, w.id) === before + 1 ? "ok" : res.headers.get("location")!;
}
async function attacks(w: Awaited<ReturnType<typeof world>>, n: number): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(await attack(w));
  return out;
}

test("recharge weekend: at 10:00, 5 base battles + 3 in reserve, the 9th goes back to the HQ", async () => {
  const w = await world(local(SAT, 10));
  const r = await attacks(w, 9);
  assert.deepEqual(r.slice(0, 8), new Array(8).fill("ok"));
  assert.match(r[8]!, /\/a\/warp\/hq$/);
});

test("recharge weekend: the 12:00 recharge gives exactly one more battle", async () => {
  const w = await world(local(SAT, 10));
  await attacks(w, 8);
  w.env.clock.t = local(SAT, 12, 1);
  const r = await attacks(w, 2);
  assert.equal(r[0], "ok");
  assert.match(r[1]!, /\/hq$/);
});

test("recharge weekend: the day is not over before the last recharge (22:00), it is after", async () => {
  const w = await world(local(SAT, 21));
  await attacks(w, 20);
  assert.match((await get(w.cl, "/endDay")).headers.get("location") ?? "", /\/hq$/, "a recharge is still coming");
  w.env.clock.t = local(SAT, 22, 30);
  await attacks(w, 2);
  assert.equal((await get(w.cl, "/endDay")).status, 200);
});

test("recharge weekend: battles before a reset-day consume neither the base nor the reserve", async () => {
  const w = await world(local(SAT, 10));
  await attacks(w, 8);
  resetDay(w.env.db, w.id, SAT, { battles: true, mission: false, raid: false, shop: false });
  const r = await attacks(w, 9);
  assert.deepEqual(r.slice(0, 8), new Array(8).fill("ok"));
  assert.match(r[8]!, /\/hq$/);
});

test("weekday: no reserve, the 6th battle is refused as before", async () => {
  const w = await world(local("2026-11-25", 10));
  const r = await attacks(w, 6);
  assert.deepEqual(r.slice(0, 5), new Array(5).fill("ok"));
  assert.match(r[5]!, /\/hq$/);
});

test("recharge weekend: two concurrent attacks on the last reserve battle store only one", async () => {
  const w = await world(local(SAT, 10));
  await attacks(w, 7);
  const n = used(w.env, w.id);
  await Promise.all([get(w.cl, `/b/battle?friend=foe;n=${n};chk=${w.key}`), get(w.cl, `/b/battle?friend=foe;n=${n};chk=${w.key}`)]);
  assert.equal(used(w.env, w.id), 8);
  assert.match(await attack(w), /\/hq$/);
});
