import { test } from "node:test";
import assert from "node:assert/strict";
import { recruitCost } from "@mt/engine";
import { dayKey } from "@mt/game";
import { armyByHost, resetDay, troopersOf } from "../src/repo.ts";
import { create, offerSeeds, setup, type Client, type Env, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];

async function army(env: Env, credits: number) {
  const cl = env.client();
  assert.equal((await create(env, cl, "Warp", { part: "0" })).status, 302);
  const a = armyByHost(env.db, "warp")!;
  env.db.prepare("UPDATE armies SET credits = ? WHERE id = ?").run(credits, a.id);
  return { cl, id: a.id };
}
const get = (env: Env, cl: Client, path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<Response> => {
  const at = env.at("warp", path);
  return cl.req(at.url, { host: at.host, ...init });
};
const credits = (env: Env, id: number): number => (env.db.prepare("SELECT credits FROM armies WHERE id = ?").get(id) as { credits: number }).credits;
const hq = (mode: Mode): string => (mode === "path" ? "/a/warp/hq" : "http://warp.lvh.me:8080/hq");

for (const mode of MODES) {
  test(`[${mode}] /add shows the offers and the price of the next trooper`, async () => {
    const env = setup(mode);
    const { cl } = await army(env, 8);
    const html = await (await get(env, cl, "/add")).text();
    assert.ok(offerSeeds(html).length >= 4);
    assert.match(html, /Ajouter\s+pour\s+8\s+<img src="\/img\/token\.png"\/>/);
    assert.ok(html.includes("Sélectionne un trooper à ajouter à ton armée."));
    assert.match(html, /<form id="add" method="POST" action="[^"]*\/add">/);
    // same offers on reload
    assert.deepEqual(offerSeeds(await (await get(env, cl, "/add")).text()), offerSeeds(html));
  });

  test(`[${mode}] buying the 2nd trooper costs recruitCost(1) = 8; a double submission buys once`, async () => {
    const env = setup(mode);
    const { cl, id } = await army(env, 20);
    assert.equal(recruitCost(1), 8);
    const seed = offerSeeds(await (await get(env, cl, "/add")).text())[0]!;
    const res = await get(env, cl, "/add", { form: { tselect: String(seed) } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), hq(mode));
    const ts = troopersOf(env.db, id);
    assert.equal(ts.length, 2);
    assert.equal(ts[1]!.slot, 1);
    assert.equal(ts[1]!.seed, seed);
    assert.equal(credits(env, id), 12);
    await get(env, cl, "/add", { form: { tselect: String(seed) } });
    await Promise.all([1, 2, 3].map(() => get(env, cl, "/add", { form: { tselect: String(seed) } })));
    assert.equal(troopersOf(env.db, id).length, 2);
    assert.equal(credits(env, id), 12);
    // the bought one is no longer offered
    assert.ok(!offerSeeds(await (await get(env, cl, "/add")).text()).includes(seed));
  });

  test(`[${mode}] admin reset-day shop: a fresh set of offers, buyable; the previous offers are refused`, async () => {
    const env = setup(mode);
    const { cl, id } = await army(env, 20);
    const day = dayKey(new Date(env.clock.t), "Europe/Paris");
    const before = offerSeeds(await (await get(env, cl, "/add")).text());
    resetDay(env.db, id, day, { battles: true, mission: true, raid: true }); // other quotas: the shop is untouched
    assert.deepEqual(offerSeeds(await (await get(env, cl, "/add")).text()), before);
    resetDay(env.db, id, day, { shop: true });
    const after = offerSeeds(await (await get(env, cl, "/add")).text());
    assert.ok(after.length >= 4);
    assert.ok(after.every((s) => !before.includes(s)), "every offer is new");
    assert.deepEqual(offerSeeds(await (await get(env, cl, "/add")).text()), after); // stable until the next reset
    const stale = await get(env, cl, "/add", { form: { tselect: String(before[0]) } });
    assert.equal(stale.status, 400); // a pre-reset offer is no longer for sale
    assert.equal(troopersOf(env.db, id).length, 1);
    assert.equal((await get(env, cl, "/add", { form: { tselect: String(after[0]) } })).status, 302);
    assert.equal(troopersOf(env.db, id)[1]!.seed, after[0]);
    resetDay(env.db, id, day, { shop: true });
    const third = offerSeeds(await (await get(env, cl, "/add")).text());
    assert.ok(third.every((s) => !after.includes(s)), "each reset draws again");
  });

  test(`[${mode}] not enough credits: message, nothing bought; seed outside the offers refused`, async () => {
    const env = setup(mode);
    const { cl, id } = await army(env, 7);
    const seed = offerSeeds(await (await get(env, cl, "/add")).text())[0]!;
    const res = await get(env, cl, "/add", { form: { tselect: String(seed) } });
    assert.equal(res.status, 400);
    assert.ok((await res.text()).includes("Tu n&#39;as pas assez de crédits"));
    assert.equal(troopersOf(env.db, id).length, 1);
    assert.equal(credits(env, id), 7);
    env.db.prepare("UPDATE armies SET credits = 100 WHERE id = ?").run(id);
    for (const bad of ["12345", "", "abc", "1e3", `${seed}x`]) {
      const r = await get(env, cl, "/add", { form: { tselect: bad } });
      assert.equal(r.status, 400, bad);
    }
    assert.equal((await get(env, cl, "/add", { method: "POST", form: {} })).status, 400);
    assert.equal(troopersOf(env.db, id).length, 1);
    assert.equal(credits(env, id), 100);
  });

  test(`[${mode}] the 13th trooper is refused: at 12 the page and the POST go back to the HQ`, async () => {
    const env = setup(mode);
    const { cl, id } = await army(env, 100000);
    const seeds = offerSeeds(await (await get(env, cl, "/add")).text());
    // fill up to 11 through the real route, then the 12th and the refused 13th
    for (let i = 0; i < 11; i++) {
      const s = offerSeeds(await (await get(env, cl, "/add")).text());
      if (s.length === 0) env.clock.t += 86_400_000; // offers are exhausted for the day: next day
      const now = offerSeeds(await (await get(env, cl, "/add")).text());
      const r = await get(env, cl, "/add", { form: { tselect: String(now[0]!) } });
      assert.equal(r.status, 302);
      assert.equal(troopersOf(env.db, id).length, i + 2);
      env.clock.t += 86_400_000;
    }
    assert.equal(troopersOf(env.db, id).length, 12);
    const before = credits(env, id);
    const page = await get(env, cl, "/add");
    assert.equal(page.status, 302);
    assert.equal(page.headers.get("location"), hq(mode));
    const r = await get(env, cl, "/add", { form: { tselect: String(seeds[1]!) } });
    assert.equal(r.status, 302);
    assert.equal(troopersOf(env.db, id).length, 12);
    assert.equal(credits(env, id), before);
  });

  test(`[${mode}] /add of a stranger or without a session redirects and buys nothing`, async () => {
    const env = setup(mode);
    const { id } = await army(env, 100);
    const other = env.client("3.3.3.3");
    const r = await get(env, other, "/add", { form: { tselect: "1" } });
    assert.equal(r.status, 302);
    assert.equal(credits(env, id), 100);
  });
}
