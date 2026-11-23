import { test } from "node:test";
import assert from "node:assert/strict";
import { recruitCost, troopersList, type BattleInput } from "@mt/engine";
import { dayKey } from "@mt/game";
import { armyByHost, createArmy } from "../src/repo.ts";
import { battleTroopers, deployOrder, recruitsByLevel, setDeployOrder } from "../src/deploy.ts";
import { create, offerSeeds, setup, type Client, type Env, type Mode } from "./helpers.ts";
import { decodeBattleFlashvars, decodeChoiceFlashvars, decodeTroopersList } from "./hxdecode.ts";

const MODES: Mode[] = ["path", "subdomain"];

const get = (env: Env, cl: Client, host: string, path: string, init: { form?: Record<string, string> } = {}): Promise<Response> => {
  const at = env.at(host, path);
  return cl.req(at.url, { host: at.host, ...init });
};
const loc = (mode: Mode, host: string, path: string): string => (mode === "path" ? `/a/${host}${path}` : `http://${host}.lvh.me:8080${path}`);
const today = (env: Env): string => dayKey(new Date(env.clock.t), "Europe/Paris");
const flashvarsOf = (html: string, div: string): string => {
  const part = html.split(`<div id="${div}" class="swf"></div>`)[1];
  assert.ok(part, `${div} embed present`);
  return JSON.parse(/flashvars : ("(?:[^"\\]|\\.)*")/.exec(part!)![1]!) as string;
};

/** Warp, created through the form, with `n` troopers named N0..N(n-1) in slots 0..n-1. */
async function warp(env: Env, n = 5) {
  const cl = env.client();
  assert.equal((await create(env, cl, "Warp", { part: "0" })).status, 302);
  const id = armyByHost(env.db, "warp")!.id;
  env.db.prepare("UPDATE troopers SET name = 'N0' WHERE army_id = ? AND slot = 0").run(id);
  const ins = env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?, ?, ?, ?, '[0]')");
  for (let s = 1; s < n; s++) ins.run(id, s, 1000 + s, `N${s}`);
  return { cl, key: cl.key!, id };
}

/** A recruit army of `recruiterId` whose first trooper has `level` choices. */
function recruit(env: Env, host: string, recruiterId: number, level: number, confirmed = true): number {
  const r = createArmy(env.db, {
    host, name: host, part: 0, faction: 2, credits: 0, recruiterId, createdIp: "9.9.9.9", createdCid: null, now: env.clock.t,
    trooper: { seed: 5000 + level * 10 + host.length, name: `R${host}` }, maxPerIp: 999, dayOf: () => "x",
  });
  if (!r.ok) throw new Error(r.reason);
  env.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(Array(level).fill(0)), r.army.id);
  if (confirmed) env.db.prepare("UPDATE armies SET recruit_confirmed_at = ? WHERE id = ?").run(env.clock.t, r.army.id);
  return r.army.id;
}

const names = (ts: readonly { name: string }[]): string[] => ts.map((t) => t.name);

for (const mode of MODES) {
  test(`[${mode}] /save stores the deployment order; new battles use it as attacker and defender, old ones replay unchanged`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    // a battle fought before the new order, viewed twice (the second view is the replay)
    const links0 = [...(await (await get(env, cl, "warp", "/b/opp")).text()).matchAll(/href="([^"]*\/b\/battle\?[^"]+)"/g)].map((m) => m[1]!);
    const path0 = mode === "path" ? links0[0]!.replace(/^\/a\/warp/, "") : links0[0]!.replace(/^http:\/\/warp\.lvh\.me:8080/, "");
    await get(env, cl, "warp", path0);
    await get(env, cl, "warp", "/b/view/bat1");
    const before = await (await get(env, cl, "warp", "/b/view/bat1")).text();
    const before0 = (env.db.prepare("SELECT input FROM battles WHERE attacker_id = ?").get(id) as { input: string }).input;
    assert.deepEqual(names((JSON.parse(before0) as BattleInput).armies[0].troopers), ["N0", "N1", "N2", "N3", "N4"]);

    const res = await get(env, cl, "warp", `/save?chk=${key};c=-4:-3:-2:-1:0`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), loc(mode, "warp", "/hq"));
    assert.deepEqual(deployOrder(env.db, id), [4, 3, 2, 1, 0]);
    assert.deepEqual(names(battleTroopers(env.db, id)), ["N4", "N3", "N2", "N1", "N0"]);

    // the old battle replays byte for byte
    assert.equal((await (await get(env, cl, "warp", "/b/view/bat1")).text()), before);
    assert.equal((env.db.prepare("SELECT input FROM battles WHERE attacker_id = ? ORDER BY id").get(id) as { input: string }).input, before0);

    // a new battle: the attacker in deployment order, consecutive ids, spawn order in that order
    const links = [...(await (await get(env, cl, "warp", "/b/opp")).text()).matchAll(/href="([^"]*\/b\/battle\?[^"]+)"/g)].map((m) => m[1]!);
    const path = mode === "path" ? links[0]!.replace(/^\/a\/warp/, "") : links[0]!.replace(/^http:\/\/warp\.lvh\.me:8080/, "");
    const r = await get(env, cl, "warp", path);
    assert.equal(r.headers.get("location"), loc(mode, "warp", `/b/view/bat2?d=${today(env)}`));
    const row = env.db.prepare("SELECT input FROM battles WHERE attacker_id = ? ORDER BY id DESC").get(id) as { input: string };
    const input = JSON.parse(row.input) as BattleInput;
    const atk = input.armies[0];
    assert.deepEqual(names(atk.troopers), ["N4", "N3", "N2", "N1", "N0"]);
    const base = atk.troopers[0]!.id;
    assert.deepEqual(atk.troopers.map((t) => t.id), [base, base + 1, base + 2, base + 3, base + 4]);
    assert.deepEqual(atk.spawnOrder, atk.troopers.map((t) => t.id));
    const view = await (await get(env, cl, "warp", "/b/view/bat2")).text();
    assert.deepEqual(decodeBattleFlashvars(flashvarsOf(view, "swf_battle")).input, input);

    // attacked by name: the defender side in the same order
    const other = env.client("7.7.7.7");
    await create(env, other, "Other");
    const at = env.at("other", "/b/battle");
    const fight = await other.req(at.url, { host: at.host, form: { chk: other.key!, n: "0", friend: "Warp" } });
    assert.equal(fight.status, 303);
    const otherId = armyByHost(env.db, "other")!.id;
    const def = (JSON.parse((env.db.prepare("SELECT input FROM battles WHERE attacker_id = ?").get(otherId) as { input: string }).input) as BattleInput).armies[1];
    assert.deepEqual(names(def.troopers), ["N4", "N3", "N2", "N1", "N0"]);
    assert.deepEqual(def.troopers.map((t) => t.id), [0, 1, 2, 3, 4]);
    assert.deepEqual(def.spawnOrder, [0, 1, 2, 3, 4]);
  });

  test(`[${mode}] /save refuses anything but an exact permutation; recruit ids are ignored; chk required`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    for (const c of ["0:0:-1:-2:-3", "0:-1:-2:-3", "0:-1:-2:-3:-7", "x", "", ":::", "0:-1:-2:-3:-4.5", "0:-1:-2:-3:- 4"]) {
      const r = await get(env, cl, "warp", `/save?chk=${key};c=${c}`);
      assert.equal(r.status, 302, c);
      assert.equal(r.headers.get("location"), loc(mode, "warp", "/choice"), c);
      assert.deepEqual(deployOrder(env.db, id), [0, 1, 2, 3, 4], c);
    }
    assert.equal((env.db.prepare("SELECT deploy_order FROM armies WHERE id = ?").get(id) as { deploy_order: string | null }).deploy_order, null);
    // the SWF's grid has 32 cells: empty ones are joined as "" (seen in Ruffle: `c=-3:-1:-4:0:-2:::…`, 31 colons)
    const grid = await get(env, cl, "warp", `/save?chk=${key};c=-3:-1:-4:0:-2${":".repeat(27)}`);
    assert.equal(grid.headers.get("location"), loc(mode, "warp", "/hq"));
    assert.deepEqual(deployOrder(env.db, id), [3, 1, 4, 0, 2]);
    const r = await get(env, cl, "warp", `/save?chk=${key};c=12345:-4:-3:-2:-1:0`);
    assert.equal(r.headers.get("location"), loc(mode, "warp", "/hq"));
    assert.deepEqual(deployOrder(env.db, id), [4, 3, 2, 1, 0]);
    for (const q of ["/save?c=0:-1:-2:-3:-4", "/save?chk=XXXXXX;c=0:-1:-2:-3:-4"]) {
      const bad = await get(env, cl, "warp", q);
      assert.equal(bad.status, 403, q);
    }
    assert.deepEqual(deployOrder(env.db, id), [4, 3, 2, 1, 0]);
    // a stranger's session cannot save
    const other = env.client("7.7.7.7");
    await create(env, other, "Other");
    const s = await get(env, other, "warp", `/save?chk=${other.key!};c=0:-1:-2:-3:-4`);
    assert.equal(s.status, 302);
    assert.equal(s.headers.get("location"), loc(mode, "warp", "/hq"));
    assert.deepEqual(deployOrder(env.db, id), [4, 3, 2, 1, 0]);
  });

  test(`[${mode}] /choice page: ClientMode 1 in deployment order, load and save URLs; under 5 troopers back to /hq`, async () => {
    const env = setup(mode);
    const small = await warp(env, 4);
    const r4 = await get(env, small.cl, "warp", "/choice");
    assert.equal(r4.status, 302);
    assert.equal(r4.headers.get("location"), loc(mode, "warp", "/hq"));
    env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name) VALUES (?, 4, 1004, 'N4')").run(small.id);
    assert.ok(setDeployOrder(env.db, small.id, [4, 3, 2, 1, 0]));
    recruit(env, "rec-a", small.id, 2);
    recruit(env, "rec-b", small.id, 3, false);
    const res = await get(env, small.cl, "warp", "/choice");
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('<td class="right">\n\n<p>Réorganise ton armée en mettant en priorité tes troopers les plus puissants ! Pour cela, clique et fais glisser le trooper pour ainsi le changer de place (n\'oublie pas de cliquer sur Valider !) :</p>\n<div id="swf_client" class="swf"></div>'));
    assert.ok(html.includes(`class="company">Gérer mon armée</a>`));
    assert.ok(html.includes('"swf_client",630,254,\'10.0.0\',null,null,swfp,{ id : "client", \'class\' : \'swf_transparent\' })'));
    assert.ok(html.includes(`<a href="javascript:_.swfAction('client','save')" class="button5">Valider</a>\n<a href="${loc(mode, "warp", "/hq")}" class="button5">Annuler</a>`));
    const fv = flashvarsOf(html, "swf_client");
    assert.ok(/wmode : 'transparent'/.test(html.split('<div id="swf_client"')[1]!));
    const ch = decodeChoiceFlashvars(fv);
    assert.equal(ch.army.troopers[0]!.id, -4);
    assert.deepEqual(ch.army.troopers.map((t) => t.id), [-4, -3, -2, -1, 0]);
    assert.deepEqual(names(ch.army.troopers), ["N4", "N3", "N2", "N1", "N0"]);
    assert.deepEqual(ch.army.spawnOrder, [-4, -3, -2, -1, 0]);
    assert.equal(ch.recruits, 1);
    assert.equal(ch.load, loc(mode, "warp", "/load?"));
    assert.equal(ch.save, loc(mode, "warp", `/save?chk=${small.key};c=`));
    assert.ok(ch.save.endsWith(";c="));
    assert.deepEqual(ch.loaded, []);
    assert.equal(ch.gfx, "/swf/mini.swf?v=2");
  });

  test(`[${mode}] /load pages the confirmed recruits' first troopers, level then army id descending`, async () => {
    const env = setup(mode);
    const { cl, id } = await warp(env);
    const a = recruit(env, "rec-a", id, 2);
    const b = recruit(env, "rec-b", id, 5);
    const c = recruit(env, "rec-c", id, 5);
    recruit(env, "rec-d", id, 9, false);
    const list = recruitsByLevel(env.db, id);
    assert.deepEqual(list.map((x) => x.armyId), [c, b, a]);
    const res = await get(env, cl, "warp", "/load?pos=0;count=16");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
    const body = await res.text();
    assert.equal(body, troopersList(list.map((x) => ({ ...x.trooper, id: x.armyId }))));
    assert.deepEqual(decodeTroopersList(body).map((t) => t.id), [c, b, a]);
    assert.deepEqual(decodeTroopersList(await (await get(env, cl, "warp", "/load?pos=1;count=1")).text()).map((t) => t.id), [b]);
    assert.deepEqual(decodeTroopersList(await (await get(env, cl, "warp", "/load?pos=16;count=16")).text()), []);
    for (const q of ["/load?pos=0;count=17", "/load?pos=x;count=1", "/load", "/load?pos=-1;count=1"]) {
      assert.equal((await get(env, cl, "warp", q)).status, 400, q);
    }
  });

  test(`[${mode}] a trooper bought after /save goes to the end of the deployment order`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    await get(env, cl, "warp", `/save?chk=${key};c=-4:-3:-2:-1:0`);
    env.db.prepare("UPDATE armies SET credits = ? WHERE id = ?").run(recruitCost(5) as number, id);
    const page = await (await get(env, cl, "warp", "/add")).text();
    const seed = offerSeeds(page)[0]!;
    const r = await get(env, cl, "warp", "/add", { form: { tselect: String(seed) } });
    assert.equal(r.status, 302);
    assert.equal((env.db.prepare("SELECT COUNT(*) AS n FROM troopers WHERE army_id = ?").get(id) as { n: number }).n, 6);
    assert.deepEqual(deployOrder(env.db, id), [4, 3, 2, 1, 0, 5]);
    assert.equal(battleTroopers(env.db, id).length, 6);
  });
}
