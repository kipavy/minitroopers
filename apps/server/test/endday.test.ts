import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey } from "@mt/game";
import { armyByHost, createArmy, dayOver } from "../src/repo.ts";
import { create, setup, type Client, type Env, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];
const loc = (mode: Mode, path: string): string => (mode === "path" ? `/a/warp${path}` : `http://warp.lvh.me:8080${path}`);
const today = (env: Env): string => dayKey(new Date(env.clock.t), "Europe/Paris");

async function warp(env: Env) {
  env.clock.t = Date.parse("2026-11-23T22:00:00Z"); // 23:00:00 in Paris (UTC+1)
  const cl = env.client();
  assert.equal((await create(env, cl, "Warp", { part: "0" })).status, 302);
  return { cl, id: armyByHost(env.db, "warp")!.id };
}
const get = (env: Env, cl: Client, path: string): Promise<Response> => {
  const at = env.at("warp", path);
  return cl.req(at.url, { host: at.host });
};

const pathOf = (href: string): string => href.replace(/^http:\/\/warp\.lvh\.me:8080/, "").replace(/^\/a\/warp/, "");

/** One daily battle through the real routes; returns the path of its view. */
async function fight(env: Env, cl: Client): Promise<string> {
  const opp = await (await get(env, cl, "/b/opp")).text();
  const m = /href="([^"]*\/b\/battle\?opp=[^"]+)"/.exec(opp)!;
  const res = await get(env, cl, pathOf(m[1]!.replaceAll("&amp;", "&")));
  assert.equal(res.status, 302);
  return pathOf(res.headers.get("location")!);
}
const view = async (env: Env, cl: Client, path: string): Promise<string> => {
  const res = await get(env, cl, path);
  assert.equal(res.status, 200);
  return res.text();
};
const endsAt = (html: string, mode: Mode): boolean => html.includes(`document.location = '${loc(mode, "/endDay")}'`) || html.includes(`document.location = "${loc(mode, "/endDay")}"`);
const toHq = (html: string): boolean => /document\.location = ['"][^'"]*\/hq\?money=/.test(html);

/** A real battle row copied as another kind (valid stored input), unseen. */
function copyAs(env: Env, id: number, kind: string, mode: string | null, phase: number | null, winLoss: "win" | "loss"): number {
  const src = env.db.prepare("SELECT input FROM battles WHERE attacker_id = ? ORDER BY id LIMIT 1").get(id) as { input: string };
  const side = (JSON.parse(src.input) as { attackerSide: number }).attackerSide;
  return Number(
    env.db
      .prepare("INSERT INTO battles(day, attacker_id, defender_id, defender_ref, input, winner, kind, mode, phase, created_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)")
      .run(today(env), id, src.input, winLoss === "win" ? side : 1 - side, kind, mode, phase, env.clock.t).lastInsertRowid,
  );
}

for (const mode of MODES) {
  test(`[${mode}] no recruit, missions locked: the 3rd battle view goes to /endDay, the 2nd to /hq?money`, async () => {
    const env = setup(mode);
    const { cl, id } = await warp(env);
    const v1 = await fight(env, cl);
    assert.equal(dayOver(env.db, id, today(env)), false);
    assert.ok(toHq(await view(env, cl, v1)));
    const v2 = await fight(env, cl);
    const p2 = await view(env, cl, v2);
    assert.ok(toHq(p2) && !endsAt(p2, mode));
    const v3 = await fight(env, cl);
    assert.equal(dayOver(env.db, id, today(env)), true);
    const p3 = await view(env, cl, v3);
    assert.ok(endsAt(p3, mode), "3rd view ends the day");
    // single shot: the replay is a plain replay
    assert.ok(!endsAt(await view(env, cl, v3), mode));

    const res = await get(env, cl, "/endDay");
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.ok(page.includes("Félicitations : ton armée s&#39;est bien battue !") || page.includes("Félicitations : ton armée s'est bien battue !"));
    assert.ok(page.includes("C'est tout pour aujourd'hui !") || page.includes("C&#39;est tout pour aujourd&#39;hui !"));
    assert.ok(page.includes("mt.js.Timer.alloc('2000-01-01 00:00:00','2000-01-01 01:00:00',2,null)"));
    assert.ok(page.includes('<div class="over"><img src="/img/art_congrats.png" class="imgcongrats"/>'));
    assert.ok(page.includes('<a href="javascript:_.startRecruit()">Recruter des Troopers</a>'));
    assert.ok(!page.includes("braziball") && !page.includes("trax.motion-twin"));
  });

  test(`[${mode}] unlocked missions unplayed: 3rd battle goes to /hq, then the 3rd failed mission try goes to /endDay`, async () => {
    const env = setup(mode);
    const { cl, id } = await warp(env);
    env.db.prepare("UPDATE armies SET missions_unlocked = 1 WHERE id = ?").run(id);
    await fight(env, cl);
    await fight(env, cl);
    const v3 = await fight(env, cl);
    assert.equal(dayOver(env.db, id, today(env)), false);
    assert.ok(toHq(await view(env, cl, v3)));
    assert.equal((await get(env, cl, "/endDay")).status, 302);
    assert.equal((await get(env, cl, "/endDay")).headers.get("location"), loc(mode, "/hq"));
    // 3 lost tries, stored one by one
    const ids: number[] = [];
    for (let n = 1; n <= 3; n++) {
      ids.push(copyAs(env, id, "mission", "exterminate", null, "loss"));
      env.db.prepare("INSERT INTO daily(army_id, day, missions_used) VALUES (?, ?, ?) ON CONFLICT(army_id, day) DO UPDATE SET missions_used = excluded.missions_used").run(id, today(env), n);
      const p = await view(env, cl, `/b/view/miss${n}?d=${today(env)}`);
      assert.equal(endsAt(p, mode), n === 3, `try ${n}`);
    }
  });

  test(`[${mode}] a live recruit: never /endDay before the raid is lost`, async () => {
    const env = setup(mode);
    const { cl, id } = await warp(env);
    const r = createArmy(env.db, { host: "rec", name: "rec", part: 0, faction: 1, credits: 0, recruiterId: id, createdIp: "9.9.9.9", createdCid: null, now: env.clock.t, trooper: { seed: 77, name: "Rec" }, maxPerIp: 99, dayOf: () => "x" });
    assert.ok(r.ok);
    env.db.prepare("UPDATE armies SET recruit_confirmed_at = ? WHERE id = ?").run(env.clock.t, r.army.id);
    await fight(env, cl);
    await fight(env, cl);
    const v3 = await fight(env, cl);
    assert.equal(dayOver(env.db, id, today(env)), false);
    assert.ok(toHq(await view(env, cl, v3)));
    assert.equal((await get(env, cl, "/endDay")).status, 302);
    // the raid is lost: its first view ends the day
    copyAs(env, id, "raid", "raid", 1, "loss");
    env.db.prepare("INSERT INTO daily(army_id, day, raid_over) VALUES (?, ?, 1) ON CONFLICT(army_id, day) DO UPDATE SET raid_over = 1").run(id, today(env));
    assert.equal(dayOver(env.db, id, today(env)), true);
    assert.ok(endsAt(await view(env, cl, `/b/view/raid?d=${today(env)}`), mode));
  });

  test(`[${mode}] /endDay: a stranger goes to the HQ`, async () => {
    const env = setup(mode);
    await warp(env);
    const other = env.client("2.2.2.2");
    const res = await get(env, other, "/endDay");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), loc(mode, "/hq"));
  });
}
