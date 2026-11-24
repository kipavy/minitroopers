import { test } from "node:test";
import assert from "node:assert/strict";
import { battleReward, dayKey } from "@mt/game";
import { clientParams, gridData, simulateOutcome, type BattleInput } from "@mt/engine";
import { armyByHost, createArmy, trooperInput, troopersOf } from "../src/repo.ts";
import { MINI_SWF } from "../src/views/swf.ts";
import { seedFactions } from "../src/admin/factions.ts";
import { create, setup, type Client, type Env, type Mode } from "./helpers.ts";
import { decodeBattleFlashvars } from "./hxdecode.ts";
import { simulateBattle } from "@mt/engine/internal";
import { readFileSync, readdirSync } from "node:fs";
import type { Context } from "hono";
import type { Env as AppEnv } from "../src/app.ts";
import { battleLog } from "../src/battleLog.ts";
import { playerData } from "../src/routes/battle.ts";
import { battleOg } from "../src/views/battle.ts";
import type { BattleRow } from "../src/repo.ts";

const MODES: Mode[] = ["path", "subdomain"];

/** A stored army made directly (no client): `troopers[i]` goes to slot i. */
function foe(env: Env, host: string, name: string, troopers: { seed: number; name: string; choices?: number[] }[], faction = 1): number {
  const r = createArmy(env.db, {
    host,
    name,
    part: 0,
    faction,
    credits: 0,
    recruiterId: null,
    createdIp: "9.9.9.9",
    createdCid: null,
    now: env.clock.t,
    trooper: troopers[0]!,
    maxPerIp: 999,
    dayOf: () => "x",
  });
  if (!r.ok) throw new Error(r.reason);
  const ins = env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?, ?, ?, ?, ?)");
  troopers.forEach((t, i) => {
    if (i === 0) env.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(t.choices ?? []), r.army.id);
    else ins.run(r.army.id, i, t.seed, t.name, JSON.stringify(t.choices ?? []));
  });
  return r.army.id;
}

async function warp(env: Env) {
  const cl = env.client();
  const res = await create(env, cl, "Warp", { part: "0" });
  assert.equal(res.status, 302);
  const a = armyByHost(env.db, "warp")!;
  return { cl, key: cl.key!, id: a.id };
}

const get = (env: Env, cl: Client, path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<Response> => {
  const at = env.at("warp", path);
  return cl.req(at.url, { host: at.host, ...init });
};
const loc = (mode: Mode, path: string): string => (mode === "path" ? `/a/warp${path}` : `http://warp.lvh.me:8080${path}`);
const credits = (env: Env, id: number): number => (env.db.prepare("SELECT credits FROM armies WHERE id = ?").get(id) as { credits: number }).credits;
type Row = { id: number; day: string; attacker_id: number; defender_id: number | null; defender_ref: string | null; input: string; winner: number | null };
const battles = (env: Env, id: number): Row[] => env.db.prepare("SELECT * FROM battles WHERE attacker_id = ? ORDER BY id").all(id) as unknown as Row[];
const today = (env: Env): string => dayKey(new Date(env.clock.t), "Europe/Paris");

/** Attack links of the opponents page: [ref, n, key]. */
function attackLinks(html: string): { ref: string; n: number; key: string; href: string }[] {
  return [...html.matchAll(/href="([^"]*\/b\/battle\?opp=([^;"]+);n=(\d+);chk=([A-Za-z0-9]{6}))"/g)].map((m) => ({
    href: m[1]!,
    ref: decodeURIComponent(m[2]!),
    n: Number(m[3]),
    key: m[4]!,
  }));
}
/** Path of an army page from an absolute (subdomain) or relative link. */
const pathOf = (mode: Mode, href: string): string => (mode === "path" ? href.replace(/^\/a\/warp/, "") : href.replace(/^http:\/\/warp\.lvh\.me:8080/, ""));

/** Flashvars of the battle embed of a page. */
function battleFlashvars(html: string): string {
  const part = html.split('<div id="swf_battle" class="swf"></div>')[1];
  assert.ok(part, "battle embed present");
  const m = /flashvars : ("(?:[^"\\]|\\.)*")/.exec(part!)!;
  return JSON.parse(m[1]!) as string;
}

const won = (r: Row): boolean => r.winner !== null && r.winner === (JSON.parse(r.input) as BattleInput).attackerSide;

/** The enhanced player's data of a battle page: `var mtLog = [...];` and `var mtAt = n|null;`. */
function playerVars(html: string): { log: { i: number; w: number; t: string }[]; at: number | null } {
  const log = /^var mtLog = (.*);$/m.exec(html);
  const at = /^var mtAt = (.*);$/m.exec(html);
  assert.ok(log && at, "player data present");
  return { log: JSON.parse(log[1]!) as { i: number; w: number; t: string }[], at: JSON.parse(at[1]!) as number | null };
}

for (const mode of MODES) {
  test(`[${mode}] /b/opp: 5 opponents frozen for the day, grids xmax 4, attack links and the friend form`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const foeId = foe(env, "foe", "Foe", [{ seed: 1234567, name: "Bob", choices: [0, 0] }]);
    const res = await get(env, cl, "/b/opp");
    assert.equal(res.status, 200);
    const html = await res.text();
    const links = attackLinks(html);
    assert.equal(links.length, 5);
    for (const l of links) {
      assert.equal(l.key, key);
      assert.equal(l.n, 0);
      assert.ok(l.href.startsWith(loc(mode, "/b/battle?opp=")));
    }
    assert.ok(links.some((l) => l.ref === String(foeId)), "the real army is listed");
    assert.equal(links.filter((l) => l.ref.startsWith("filler:")).length, 4);
    assert.ok(html.includes("<h1>L&#39;armée de Foe</h1>"));
    assert.ok(html.includes("Attaquer !"));
    // grid of the real opponent = gridData mode 4, xmax 4, ymax 1, no add, no action
    const foeTroopers = troopersOf(env.db, foeId).map(trooperInput);
    const want = clientParams(gridData({ army: foeTroopers, xmax: 4, ymax: 1, add: false, fac: 1, space: -1, action: null }, MINI_SWF));
    const fvs = [...html.matchAll(/flashvars : ("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1]!) as string);
    assert.ok(fvs.includes(want));
    assert.ok(html.includes("285,72,"));
    // friend form: POST /b/battle with chk + n
    assert.ok(html.includes(`<form action="${loc(mode, "/b/battle")}" id="friends" method="POST"><input name="chk" type="hidden" value="${key}"/>`));
    assert.ok(html.includes('<input name="n" type="hidden" value="0"/>'));
    assert.ok(html.includes("Infiltre la base d'une armée de ton choix :"));
    assert.ok(html.includes("Infiltrer !"));
    // frozen: a new army does not change today's list, a second visit shows the same opponents
    const stored = (env.db.prepare("SELECT opponents FROM daily WHERE army_id = ? AND day = ?").get(id, today(env)) as { opponents: string }).opponents;
    assert.equal((JSON.parse(stored) as unknown[]).length, 5);
    foe(env, "newcomer", "Newcomer", [{ seed: 7654321, name: "Al", choices: [0, 0] }]);
    const again = attackLinks(await (await get(env, cl, "/b/opp")).text());
    assert.deepEqual(again.map((l) => l.ref), links.map((l) => l.ref));
  });

  test(`[${mode}] /b/opp with the seeded factions: a new army gets fillers, factions only near its power`, async () => {
    const env = setup(mode);
    seedFactions(env.db, env.clock.t);
    const factionIds = env.db.prepare("SELECT id FROM armies WHERE is_faction = 1").all().map((r) => String(r.id));
    assert.equal(factionIds.length, 6);
    const { cl } = await warp(env); // power 5
    const near = foe(env, "foe", "Foe", [{ seed: 1234567, name: "Bob", choices: [0, 0] }]); // power 7
    const refs = attackLinks(await (await get(env, cl, "/b/opp")).text()).map((l) => l.ref);
    assert.equal(refs.length, 5);
    assert.ok(refs.includes(String(near)), "a real army of comparable power is listed");
    assert.equal(refs.filter((r) => r.startsWith("filler:")).length, 4, "the far factions leave their slots to fillers");
    assert.ok(!refs.some((r) => factionIds.includes(r)));
    // a strong army (power 105) is within the bound of the factions (114): they are listed
    const strong = setup(mode);
    seedFactions(strong.db, strong.clock.t);
    const ids = strong.db.prepare("SELECT id FROM armies WHERE is_faction = 1").all().map((r) => String(r.id));
    const w = await warp(strong);
    strong.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(new Array(100).fill(0)), w.id);
    const strongRefs = attackLinks(await (await get(strong, w.cl, "/b/opp")).text()).map((l) => l.ref);
    assert.equal(strongRefs.length, 5);
    assert.ok(strongRefs.every((r) => ids.includes(r)), "the factions are of comparable power");
  });

  test(`[${mode}] attack: one battle stored, reward credited, replay page decodes to the stored input`, async () => {
    const env = setup(mode);
    const { cl, id } = await warp(env);
    const foeId = foe(env, "foe", "Foe", [
      { seed: 1234567, name: "Bob" },
      { seed: 2345678, name: "Rob" },
    ]); // power 10: within the opponent bound of a power-5 army (5 +- max(5, 10) * 50 %)
    const links = attackLinks(await (await get(env, cl, "/b/opp")).text());
    const target = links.find((l) => l.ref === String(foeId))!;
    const before = credits(env, id);
    const res = await get(env, cl, pathOf(mode, target.href));
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), loc(mode, `/b/view/bat1?d=${today(env)}`));
    const rows = battles(env, id);
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.equal(row.defender_id, foeId);
    assert.equal(row.day, today(env));
    const input = JSON.parse(row.input) as BattleInput;
    assert.equal(input.attackerSide, 0);
    assert.deepEqual(input.background, { gfx: "bg/garden.jpg", id: 0 });
    // defender keeps ids 0..m-1, the attacker follows (like the archived battles); spawn order = slot order
    assert.deepEqual(input.armies[1].troopers.map((t) => [t.id, t.name]), [[0, "Bob"], [1, "Rob"]]);
    assert.deepEqual(input.armies[1].spawnOrder, [0, 1]);
    assert.deepEqual(input.armies[0].troopers.map((t) => t.id), [2]);
    assert.deepEqual(input.armies[0].spawnOrder, [2]);
    assert.equal(row.winner, simulateOutcome(input).winner);
    const reward = battleReward(won(row));
    assert.equal(credits(env, id), before + reward);
    assert.equal((env.db.prepare("SELECT created_at FROM battles WHERE id = ?").get(row.id) as { created_at: number }).created_at, env.clock.t);

    // first view: the "+N" message and the counter animation
    const page = await (await get(env, cl, "/b/view/bat1")).text();
    const fv = battleFlashvars(page);
    const dec = decodeBattleFlashvars(fv);
    assert.deepEqual(dec.input, input);
    assert.equal(dec.gfx, "/swf/army.swf?v=2");
    assert.equal(dec.vars.endMsg, won(row) ? "Tu as remporté cette bataille ! Ton armée gagne +2 [T]" : "Tu as perdu cette bataille ! Ton armée gagne +1 [T]");
    assert.equal(dec.vars.imageurl, "/img/");
    assert.ok(page.includes(`document.location = ${JSON.stringify(loc(mode, `/hq?money=${reward}`))};`));
    assert.ok(page.includes("/swf/client_fr_play.swf?v=6"));
    assert.ok(page.includes(",720,440,"));
    assert.match(page, /<h1>\nL&#39;armée de Warp\nVS\nL&#39;armée de Foe\n<\/h1>/);
    assert.ok(page.includes("<title>MiniTroopers</title>"));
    // later views: replay message, back to the HQ, "Retour" button
    const replay = await (await get(env, cl, "/b/view/bat1")).text();
    const dec2 = decodeBattleFlashvars(battleFlashvars(replay));
    assert.deepEqual(dec2.input, input);
    assert.equal(dec2.vars.endMsg, won(row) ? "Tu as remporté ce combat !" : "Ce combat s'est soldé par un échec !");
    assert.ok(replay.includes(`document.location = ${JSON.stringify(loc(mode, "/hq"))};`));
    assert.ok(replay.includes(`<a href="${loc(mode, "/hq")}" class="button5">Retour</a>`));
    // the HQ tile links the battle
    const hq = await (await get(env, cl, "/hq")).text();
    assert.ok(hq.includes(`<a href="${loc(mode, "/b/view/bat1")}"`));
    assert.ok(hq.includes("Il te reste 4 batailles aujourd&#39;hui !"));
    // unknown battle number: back to the HQ
    const none = await get(env, cl, "/b/view/bat2");
    assert.equal(none.status, 302);
    assert.equal(none.headers.get("location"), loc(mode, "/hq"));
  });

  test(`[${mode}] a battle at 23:59:59 is still shown (first view, once) after midnight; ?d= only today/yesterday`, async () => {
    const env = setup(mode);
    env.clock.t = Date.parse("2026-11-23T22:59:59Z"); // 23:59:59 in Paris (UTC+1)
    const { cl, id } = await warp(env);
    const links = attackLinks(await (await get(env, cl, "/b/opp")).text());
    const url = pathOf(mode, links[0]!.href);
    const r = await get(env, cl, url);
    assert.equal(r.headers.get("location"), loc(mode, "/b/view/bat1?d=2026-11-23"));
    assert.equal((await get(env, cl, url)).headers.get("location"), loc(mode, "/b/view/bat1?d=2026-11-23"), "double click: same battle, same day");
    const row = battles(env, id)[0]!;
    assert.equal((env.db.prepare("SELECT created_at FROM battles WHERE id = ?").get(row.id) as { created_at: number }).created_at, Date.parse("2026-11-23T22:59:59Z"));
    env.clock.t += 2000; // 00:00:01, the next day
    assert.equal(today(env), "2026-11-24");
    const path = "/b/view/bat1?d=2026-11-23";
    const page = await get(env, cl, path);
    assert.equal(page.status, 200);
    const first = decodeBattleFlashvars(battleFlashvars(await page.text()));
    assert.deepEqual(first.input, JSON.parse(row.input));
    assert.match(first.vars.endMsg!, /Ton armée gagne \+[12] \[T\]$/);
    const again = decodeBattleFlashvars(battleFlashvars(await (await get(env, cl, path)).text()));
    assert.ok(!again.vars.endMsg!.includes("[T]"), "single-shot first view");
    for (const q of ["", "?d=2026-11-22", "?d=2026-11-25", "?d=junk", "?d=2026-11-23T00"]) {
      assert.equal((await get(env, cl, `/b/view/bat1${q}`)).headers.get("location"), loc(mode, "/hq"), q);
    }
    // another army cannot see it with ?d= either (its own battles only)
    const other = env.client("7.7.7.7");
    await create(env, other, "Autre");
    const o = env.at("autre", path);
    assert.equal((await other.req(o.url, { host: o.host })).headers.get("location"), mode === "path" ? "/a/autre/hq" : "http://autre.lvh.me:8080/hq");
  });

  test(`[${mode}] replayed or concurrent attack URL: exactly one battle, one increment, one reward`, async () => {
    const env = setup(mode);
    const { cl, id } = await warp(env);
    const links = attackLinks(await (await get(env, cl, "/b/opp")).text());
    const before = credits(env, id);
    const url = pathOf(mode, links[0]!.href);
    const all = await Promise.all(Array.from({ length: 6 }, () => get(env, cl, url)));
    for (const r of all) {
      assert.equal(r.status, 302);
      assert.equal(r.headers.get("location"), loc(mode, `/b/view/bat1?d=${today(env)}`));
    }
    const again = await get(env, cl, url); // reload later
    assert.equal(again.headers.get("location"), loc(mode, `/b/view/bat1?d=${today(env)}`));
    const rows = battles(env, id);
    assert.equal(rows.length, 1);
    assert.equal(credits(env, id), before + battleReward(won(rows[0]!)));
    // filler opponent: never stored as an army, battle with defender_id NULL and the complete input
    assert.equal(rows[0]!.defender_id, null);
    assert.equal(rows[0]!.defender_ref, links[0]!.ref);
    assert.ok(links[0]!.ref.startsWith("filler:"));
    assert.equal((env.db.prepare("SELECT COUNT(*) AS n FROM armies").get() as { n: number }).n, 1);
    const input = JSON.parse(rows[0]!.input) as BattleInput;
    assert.ok(input.armies[1].troopers.length >= 1);
    assert.equal(rows[0]!.winner, simulateOutcome(input).winner);
    // another target replayed with the same n does not fight again either, and is not shown the first battle
    const post = await get(env, cl, "/b/battle", { form: { chk: cl.key!, n: "0", friend: "Warp2" } });
    assert.equal(post.headers.get("location"), loc(mode, "/b/opp?err=stale"));
    assert.equal(battles(env, id).length, 1);
  });

  test(`[${mode}] malformed or future n goes to plain /b/opp, not err=stale`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const links = attackLinks(await (await get(env, cl, "/b/opp")).text());
    await get(env, cl, pathOf(mode, links[0]!.href));
    for (const n of ["-1", "abc", "7", "99"]) {
      const r = await get(env, cl, `/b/battle?opp=${encodeURIComponent(links[1]!.ref)};n=${n};chk=${key}`);
      assert.equal(r.headers.get("location"), loc(mode, "/b/opp"), n);
    }
    assert.equal(battles(env, id).length, 1);
  });

  test(`[${mode}] stale attack link: a link for another opponent after a battle is refused, the same one shows its battle`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const links = attackLinks(await (await get(env, cl, "/b/opp")).text());
    const first = await get(env, cl, pathOf(mode, links[0]!.href));
    assert.equal(first.headers.get("location"), loc(mode, `/b/view/bat1?d=${today(env)}`));
    assert.equal((env.db.prepare("SELECT opp FROM battles WHERE attacker_id = ?").get(id) as { opp: string }).opp, links[0]!.ref);
    const other = await get(env, cl, `/b/battle?opp=${encodeURIComponent(links[1]!.ref)};n=0;chk=${key}`);
    assert.equal(other.headers.get("location"), loc(mode, "/b/opp?err=stale"));
    const same = await get(env, cl, pathOf(mode, links[0]!.href));
    assert.equal(same.headers.get("location"), loc(mode, `/b/view/bat1?d=${today(env)}`));
    assert.equal(battles(env, id).length, 1);
    const page = await (await get(env, cl, "/b/opp?err=stale")).text();
    assert.ok(page.includes("Cette attaque n&#39;est plus valable.") || page.includes("Cette attaque n'est plus valable."));
  });

  test(`[${mode}] 5 battles a day: the 6th is refused; wrong key and opponents off the list are refused`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const other = foe(env, "other", "Other", [{ seed: 1234567, name: "Bob" }]);
    const html = await (await get(env, cl, "/b/opp")).text();
    const links = attackLinks(html);
    // wrong key
    const bad = await get(env, cl, `/b/battle?opp=${encodeURIComponent(links[0]!.ref)};n=0;chk=XXXXXX`);
    assert.equal(bad.status, 302);
    assert.equal(battles(env, id).length, 0);
    // off the list: a filler of another power, a non-existent army, one's own army
    for (const opp of ["filler:5:1", "999999", String(id)]) {
      const r = await get(env, cl, `/b/battle?opp=${encodeURIComponent(opp)};n=0;chk=${key}`);
      assert.equal(r.status, 302);
      assert.equal(r.headers.get("location"), loc(mode, "/b/opp?err=opp"));
    }
    assert.equal(battles(env, id).length, 0);
    const err = await (await get(env, cl, "/b/opp?err=opp")).text();
    assert.ok(err.includes("poperror"));
    assert.ok(err.includes("Cet adversaire ne fait pas partie de ta liste du jour."));
    void other;
    for (let n = 0; n < 5; n++) {
      const r = await get(env, cl, `/b/battle?opp=${encodeURIComponent(links[n]!.ref)};n=${n};chk=${key}`);
      assert.equal(r.headers.get("location"), loc(mode, `/b/view/bat${n + 1}?d=${today(env)}`));
    }
    const c3 = credits(env, id);
    const sixth = await get(env, cl, `/b/battle?opp=${encodeURIComponent(links[0]!.ref)};n=5;chk=${key}`);
    assert.equal(sixth.status, 302);
    assert.equal(sixth.headers.get("location"), loc(mode, "/hq"));
    const friend = await get(env, cl, "/b/battle", { form: { chk: key, n: "5", friend: "Other" } });
    assert.equal(friend.headers.get("location"), loc(mode, "/hq"));
    assert.equal(battles(env, id).length, 5);
    assert.equal(credits(env, id), c3);
    // no battle left: the opponents page sends back to the HQ
    assert.equal((await get(env, cl, "/b/opp")).headers.get("location"), loc(mode, "/hq"));
  });

  test(`[${mode}] attack by name: unknown name -> message; own army refused; existing army and faction -> /b/fview/<id>`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const otherId = foe(env, "other-one", "Other One", [{ seed: 1234567, name: "Bob" }]);
    await get(env, cl, "/b/opp");
    const miss = await get(env, cl, "/b/battle", { form: { chk: key, n: "0", friend: "Nobody Here" } });
    assert.equal(miss.status, 303);
    assert.equal(miss.headers.get("location"), loc(mode, "/b/opp?err=missing"));
    const page = await (await get(env, cl, "/b/opp?err=missing")).text();
    assert.ok(page.includes("Cette armée n&#39;existe pas."));
    for (const friend of ["", "x".repeat(500), "Warp"]) {
      const r = await get(env, cl, "/b/battle", { form: { chk: key, n: "0", friend } });
      assert.equal(r.status, 303);
      assert.match(r.headers.get("location")!, /\/b\/opp\?err=(missing|self)$/);
    }
    assert.equal(battles(env, id).length, 0);
    // wrong key on the form
    await get(env, cl, "/b/battle", { form: { chk: "XXXXXX", n: "0", friend: "Other One" } });
    assert.equal(battles(env, id).length, 0);

    const ok = await get(env, cl, "/b/battle", { form: { chk: key, n: "0", friend: "Other One" } });
    assert.equal(ok.status, 303);
    const rows = battles(env, id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.defender_id, otherId);
    assert.equal(ok.headers.get("location"), loc(mode, `/b/fview/${rows[0]!.id}`));
    const view = await (await get(env, cl, `/b/fview/${rows[0]!.id}`)).text();
    assert.deepEqual(decodeBattleFlashvars(battleFlashvars(view)).input, JSON.parse(rows[0]!.input));
    assert.match(view, /L&#39;armée de Warp\nVS\nL&#39;armée de Other One/);
    // a faction army (never stored) by name
    const fac = await get(env, cl, "/b/battle", { form: { chk: key, n: "1", friend: "Sang-surs" } });
    assert.equal(fac.status, 303);
    const r2 = battles(env, id)[1]!;
    assert.equal(r2.defender_id, null);
    assert.equal(r2.defender_ref, "faction:sang-surs");
    assert.equal((JSON.parse(r2.input) as BattleInput).armies[1].troopers.length, 6);
    const fview = await (await get(env, cl, `/b/fview/${r2.id}`)).text();
    assert.match(fview, /VS\nL&#39;armée de Sang-surs/);
    // the HQ tiles count both
    assert.ok((await (await get(env, cl, "/hq")).text()).includes("Il te reste 3 batailles aujourd&#39;hui !"));
    assert.equal((await get(env, cl, "/b/fview/999999")).status, 404);
  });

  test(`[${mode}] credits: +2 for a victory, +1 for a defeat`, async () => {
    // fixed battle seed: both outcomes below are fixed by construction, not by how lopsided a random fight is
    const env = setup(mode, {}, { battleSeed: () => 4242 });
    const { cl, key, id } = await warp(env);
    // and a fixed first trooper (the offers, hence its seed, depend on the random client id)
    env.db.prepare("UPDATE troopers SET seed = 3141592, name = 'Fixed' WHERE army_id = ?").run(id);
    foe(env, "weak", "Weak", [{ seed: 1234567, name: "Bob" }]);
    // a lone level-1 trooper against the faction army (6 troopers, levels 20..10): a defeat
    const before = credits(env, id);
    await get(env, cl, "/b/battle", { form: { chk: key, n: "0", friend: "Sang-surs" } });
    const lost = battles(env, id)[0]!;
    assert.equal((JSON.parse(lost.input) as BattleInput).seed, 4242);
    assert.equal(lost.winner, 1);
    assert.equal(credits(env, id), before + 1);
    // the same army grown to 6 level-20 troopers against a lone level-1 trooper: a victory
    env.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(new Array(19).fill(0)), id);
    const ins = env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?, ?, ?, ?, ?)");
    for (let i = 1; i < 6; i++) ins.run(id, i, 2000000 + i * 7919, `T${i}`, JSON.stringify(new Array(19).fill(0)));
    await get(env, cl, "/b/battle", { form: { chk: key, n: "1", friend: "Weak" } });
    const win = battles(env, id)[1]!;
    assert.equal((JSON.parse(win.input) as BattleInput).seed, 4242);
    assert.equal(win.winner, 0);
    assert.equal(credits(env, id), before + 1 + 2);
    const page = await (await get(env, cl, `/b/fview/${win.id}`)).text();
    assert.equal(decodeBattleFlashvars(battleFlashvars(page)).vars.endMsg, "Tu as remporté cette bataille ! Ton armée gagne +2 [T]");
    assert.ok(page.includes(`document.location = ${JSON.stringify(loc(mode, "/hq?money=2"))};`));
    assert.ok(!page.includes("Retour"));
  });

  test(`[${mode}] armies in the middle of a level-up fight as stored; an emptied army is refused without crash`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const foeId = foe(env, "busy", "Busy", [{ seed: 1234567, name: "Bob", choices: [0] }]);
    env.db.prepare("UPDATE troopers SET pending_levelup = '1' WHERE army_id = ?").run(foeId);
    env.db.prepare("UPDATE troopers SET pending_levelup = '0' WHERE army_id = ?").run(id);
    const ok = await get(env, cl, "/b/battle", { form: { chk: key, n: "0", friend: "Busy" } });
    assert.equal(ok.status, 303);
    const row = battles(env, id)[0]!;
    assert.deepEqual((JSON.parse(row.input) as BattleInput).armies[1].troopers[0]!.choices, [0]);
    // an army without troopers (not reachable through the game) is "Cette armée n'existe pas."
    env.db.prepare("DELETE FROM troopers WHERE army_id = ?").run(foeId);
    const r = await get(env, cl, "/b/battle", { form: { chk: key, n: "1", friend: "Busy" } });
    assert.equal(r.headers.get("location"), loc(mode, "/b/opp?err=missing"));
    assert.equal(battles(env, id).length, 1);
  });

  test(`[${mode}] day rollover at 00:00 Europe/Paris resets the counter and renews the opponents`, async () => {
    const env = setup(mode);
    env.clock.t = Date.parse("2026-11-23T22:59:00Z"); // 23:59 in Paris (UTC+1)
    const { cl, key, id } = await warp(env);
    const links = attackLinks(await (await get(env, cl, "/b/opp")).text());
    for (let n = 0; n < 5; n++) await get(env, cl, `/b/battle?opp=${encodeURIComponent(links[n]!.ref)};n=${n};chk=${key}`);
    assert.equal(battles(env, id).length, 5);
    assert.equal((await get(env, cl, `/b/battle?opp=${encodeURIComponent(links[0]!.ref)};n=5;chk=${key}`)).headers.get("location"), loc(mode, "/hq"));
    env.clock.t = Date.parse("2026-11-23T23:00:00Z"); // 00:00 in Paris
    assert.equal(today(env), "2026-11-24");
    // yesterday's opponent and URL are no longer valid
    const stale = await get(env, cl, `/b/battle?opp=${encodeURIComponent(links[3]!.ref)};n=0;chk=${key}`);
    assert.equal(stale.headers.get("location"), loc(mode, "/b/opp?err=opp"));
    const fresh = await (await get(env, cl, "/b/opp")).text();
    const next = attackLinks(fresh);
    assert.equal(next.length, 5);
    assert.ok(next.every((l) => l.n === 0));
    assert.notDeepEqual(next.map((l) => l.ref), links.map((l) => l.ref));
    const r = await get(env, cl, pathOf(mode, next[0]!.href));
    assert.equal(r.headers.get("location"), loc(mode, `/b/view/bat1?d=${today(env)}`));
    assert.equal(battles(env, id).filter((b) => b.day === "2026-11-24").length, 1);
    assert.ok((await (await get(env, cl, "/hq")).text()).includes("Il te reste 4 batailles aujourd&#39;hui !"));
  });

  test(`[${mode}] hostile army and trooper names never reach a flashvar or an attribute unencoded`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const evil = `</script><img src=x onerror=alert(1)>'"&`;
    const foeId = foe(env, "evil", "Evil", [{ seed: 1234567, name: "Bob" }]);
    env.db.prepare("UPDATE armies SET name = ? WHERE id = ?").run(evil, foeId);
    env.db.prepare("UPDATE troopers SET name = ? WHERE army_id = ?").run("</script>'\"x", foeId);
    const html = await (await get(env, cl, "/b/opp")).text();
    assert.ok(!html.includes(evil));
    assert.ok(!html.includes("</script>'"));
    assert.ok(!/<img src=x/.test(html));
    const res = await get(env, cl, `/b/battle?opp=${foeId};n=0;chk=${key}`);
    assert.equal(res.headers.get("location"), loc(mode, `/b/view/bat1?d=${today(env)}`));
    const page = await (await get(env, cl, "/b/view/bat1")).text();
    assert.ok(!page.includes(evil));
    assert.ok(!page.includes("</script>'"));
    assert.ok(!/<img src=x/.test(page));
    const dec = decodeBattleFlashvars(battleFlashvars(page));
    assert.equal(dec.input.armies[1].troopers[0]!.name, "</script>'\"x");
    assert.deepEqual(dec.input, JSON.parse(battles(env, id)[0]!.input));
  });

  test(`[${mode}] enhanced player: player.js, one log line per history entry, ?at= parsed and bounded`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const foeId = foe(env, "foe", "Foe", [{ seed: 1234567, name: "Bob" }]);
    void foeId;
    await get(env, cl, "/b/battle", { form: { chk: key, n: "0", friend: "Foe" } });
    const row = battles(env, id)[0]!;
    const input = JSON.parse(row.input) as BattleInput;
    const total = simulateBattle(input).events.length;
    const page = await (await get(env, cl, "/b/view/bat1")).text();
    assert.ok(page.includes('<script type="text/javascript" src="/js/player.js?v=3"></script>'));
    assert.ok(page.indexOf("/js/player.js") < page.indexOf('<div id="swf_battle"'), "player.js before the embed (it wraps embedSWF)");
    assert.ok(page.includes('<link rel="stylesheet" type="text/css" href="/css/player.css?v=2"/>'));
    const { log, at } = playerVars(page);
    assert.equal(log.length, total, "one line per history entry");
    assert.deepEqual(log.map((l) => l.i), [...log.keys()]);
    assert.equal(at, null);
    const sides = JSON.parse(/^var mtSides = (.*);$/m.exec(page)![1]!) as string[][];
    assert.deepEqual(sides, [["L'armée de Warp", ...input.armies[0].troopers.map((t) => t.name)], ["L'armée de Foe", "Bob"]]);
    assert.ok(log.some((l) => l.t.includes("L'armée de Warp") || l.t.includes("L'armée de Foe")), "army names in the log");
    // ?at=: a positive integer, bounded by the history length; anything else is ignored
    const atOf = async (q: string): Promise<number | null> => {
      const r = await get(env, cl, `/b/view/bat1${q}`);
      assert.equal(r.status, 200, q);
      return playerVars(await r.text()).at;
    };
    assert.equal(await atOf("?at=5"), 5);
    assert.equal(await atOf(`?d=${today(env)};at=7`), 7);
    assert.equal(await atOf(`?d=${today(env)}&at=${total}`), total);
    assert.equal(await atOf("?at=999999"), total);
    assert.equal(await atOf(`?at=${"9".repeat(400)}`), total);
    for (const q of ["?at=-3", "?at=abc", "?at=0", "?at=", "?at=5.5", "?at=+5", "?at=0x10", "?at=%00"]) assert.equal(await atOf(q), null, q);
    // the public replay page too
    const fview = await get(env, cl, `/b/fview/${row.id}?at=3`);
    assert.equal(fview.status, 200);
    assert.equal(playerVars(await fview.text()).at, 3);
    // only battle pages load the player
    for (const p of ["/hq", "/b/opp", "/history"]) {
      const other = await (await get(env, cl, p)).text();
      assert.ok(!other.includes("player.js") && !other.includes("player.css"), p);
    }
  });

  test(`[${mode}] strangers and other armies: no action, no page of someone else's battles`, async () => {
    const env = setup(mode);
    const { id } = await warp(env);
    const stranger = env.client("2.2.2.2");
    const at = env.at("warp", "/b/opp");
    const r = await stranger.req(at.url, { host: at.host });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), loc(mode, "/hq"));
    const b = env.at("warp", `/b/battle?opp=1;n=0;chk=${stranger.key ?? "AAAAAA"}`);
    await stranger.req(b.url, { host: b.host });
    const v = env.at("warp", "/b/view/bat1");
    assert.equal((await stranger.req(v.url, { host: v.host })).status, 302);
    assert.equal(battles(env, id).length, 0);
  });
}

test("playerData: a log that cannot be built gives an empty log, not an exception (the page stays up)", () => {
  const input = JSON.parse(readFileSync(new URL("../../../packages/engine/test/fixtures/modes/" + readdirSync(new URL("../../../packages/engine/test/fixtures/modes/", import.meta.url)).find((f) => f.endsWith(".json"))!, import.meta.url), "utf8")).input as BattleInput;
  (input.armies[0].troopers[0] as { force: unknown }).force = null;
  assert.throws(() => battleLog(input, ["A", "B"]), "the corrupted input makes the log builder throw");
  const row = { id: 1, input } as BattleRow;
  const c = { req: { url: "http://x/b/view/bat1" } } as unknown as Context<AppEnv>;
  const err = console.error;
  const seen: unknown[][] = [];
  console.error = (...args: unknown[]) => void seen.push(args);
  try {
    const d = playerData(c, row, "A", "B");
    assert.deepEqual(d.log, []);
    assert.equal(d.at, null);
    assert.equal(d.sides.length, 2);
  } finally {
    console.error = err;
  }
  assert.equal(seen.length, 1, "the failure is logged once");
});

/** One fresh battle at clock `t` (path mode): credits gained, the first-view message and the end URL. */
async function fightAt(t: number, extra: Record<string, string> = {}) {
  const env = setup("path", extra);
  env.clock.t = t;
  const { cl, id } = await warp(env);
  const foeId = foe(env, "foe", "Foe", [
    { seed: 1234567, name: "Bob" },
    { seed: 2345678, name: "Rob" },
  ]);
  const target = attackLinks(await (await get(env, cl, "/b/opp")).text()).find((l) => l.ref === String(foeId))!;
  const before = credits(env, id);
  await get(env, cl, pathOf("path", target.href));
  const row = battles(env, id)[0]!;
  const page = await (await get(env, cl, "/b/view/bat1")).text();
  return { win: won(row), gained: credits(env, id) - before, endMsg: decodeBattleFlashvars(battleFlashvars(page)).vars.endMsg, page };
}

const msgFor = (win: boolean, n: number): string => `${win ? "Tu as remporté cette bataille !" : "Tu as perdu cette bataille !"} Ton armée gagne +${n} [T]`;

test("battle on a weekend day pays ×3 (credits, end message, money animation)", async () => {
  const r = await fightAt(Date.parse("2026-11-28T10:00:00Z")); // samedi
  const n = r.win ? 6 : 3;
  assert.equal(r.gained, n);
  assert.equal(r.endMsg, msgFor(r.win, n));
  assert.ok(r.page.includes(`document.location = ${JSON.stringify(loc("path", `/hq?money=${n}`))};`));
});

test("WEEKEND_MULTIPLIER=1 pays ×1 on Saturday", async () => {
  const r = await fightAt(Date.parse("2026-11-28T10:00:00Z"), { WEEKEND_MULTIPLIER: "1" });
  assert.equal(r.gained, r.win ? 2 : 1);
  assert.equal(r.endMsg, msgFor(r.win, r.win ? 2 : 1));
});

test("the weekend follows the game day (Europe/Paris), not UTC", async () => {
  const sat = await fightAt(Date.parse("2026-11-28T22:30:00Z")); // samedi 23:30 à Paris
  assert.equal(sat.gained, sat.win ? 6 : 3);
  const mon = await fightAt(Date.parse("2026-11-29T23:30:00Z")); // lundi 00:30 à Paris
  assert.equal(mon.gained, mon.win ? 2 : 1);
  const satEarly = await fightAt(Date.parse("2026-11-27T23:30:00Z")); // samedi 00:30 à Paris, vendredi en UTC
  assert.equal(satEarly.gained, satEarly.win ? 6 : 3);
});

/** Open Graph / Twitter meta tags of a page (`<meta property|name="k" content="v"/>`), values still HTML-escaped. */
function metaTags(page: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of page.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+|theme-color)" content="([^"]*)"\/>/g)) out[m[1]!] = m[2]!;
  return out;
}

for (const mode of MODES) {
  test(`[${mode}] link previews: the battle pages carry og:/twitter: tags (title, date, winner, public URL, fixed image)`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const foeId = foe(env, "foe", "Foe", [{ seed: 1234567, name: "Bob" }]);
    await get(env, cl, "/b/opp");
    await get(env, cl, `/b/battle?opp=${foeId};n=0;chk=${key}`);
    const row = battles(env, id)[0]!;
    const winner = row.winner === null ? null : won(row) ? "L&#39;armée de Warp" : "L&#39;armée de Foe";
    const base = env.cfg.publicUrl;
    const url = mode === "path" ? `${base}/a/warp/b/fview/${row.id}` : `http://warp.lvh.me:8080/b/fview/${row.id}`;
    const expected = {
      "theme-color": "#d4a244",
      "og:site_name": "MiniTroopers",
      "og:type": "website",
      "og:title": "Revoir : L&#39;armée de Warp VS L&#39;armée de Foe",
      "og:description": `Combat MiniTroopers du 23/11/2026. ${winner === null ? "Match nul." : `Victoire de ${winner}.`}`,
      "og:url": url,
      "og:image": `${base}/img/og-battle.jpg`,
      "og:image:type": "image/jpeg",
      "og:image:width": "1200",
      "og:image:height": "630",
      "og:image:alt": "MiniTroopers : un combat à revoir",
      "twitter:card": "summary_large_image",
    };
    // 1st view of /b/view/bat1 = the just-fought page ("+N [T]", markSeen), 2nd view = the replay: same tags on both
    const fresh = metaTags(await (await get(env, cl, "/b/view/bat1")).text());
    assert.deepEqual(fresh, expected);
    const replay = await (await get(env, cl, "/b/view/bat1")).text();
    assert.deepEqual(metaTags(replay), expected);
    // "Partager" on the attacker's own /b/view/batN copies the public page, the only one others (and crawlers) can open
    assert.ok(replay.includes(`var mtShare = ${JSON.stringify(url)};`));
    // the public page seen by a stranger (the one crawlers read)
    const stranger = env.client("3.3.3.3");
    const pub = await stranger.req(`/b/fview/${row.id}`, mode === "path" ? {} : { host: "lvh.me:8080" });
    assert.equal(pub.status, 200);
    assert.deepEqual(metaTags(await pub.text()), expected);
    // absolute URLs built from PUBLIC_URL (subdomain mode: the attacker's host on the same scheme and port)
    assert.match(fresh["og:image"]!, /^https?:\/\//);
    assert.ok(fresh["og:image"]!.startsWith(`${env.cfg.publicUrl}/`));
    assert.match(fresh["og:url"]!, /^https?:\/\//);
    if (mode === "path") assert.ok(fresh["og:url"]!.startsWith(`${env.cfg.publicUrl}/a/warp/`));
    else assert.ok(fresh["og:url"]!.startsWith(`${new URL(env.cfg.publicUrl).protocol}//warp.${env.cfg.baseDomain}:${new URL(env.cfg.publicUrl).port}/`));
  });

  test(`[${mode}] link previews: a hostile army name is escaped in og:title / og:description`, async () => {
    const env = setup(mode);
    const { cl, key } = await warp(env);
    const foeId = foe(env, "evil", "Evil", [{ seed: 1234567, name: "Bob" }]);
    env.db.prepare("UPDATE armies SET name = ? WHERE id = ?").run(`<script>"&`, foeId);
    await get(env, cl, "/b/opp");
    await get(env, cl, `/b/battle?opp=${foeId};n=0;chk=${key}`);
    const page = await (await get(env, cl, "/b/view/bat1")).text();
    const tags = metaTags(page);
    assert.equal(tags["og:title"], "Revoir : L&#39;armée de Warp VS L&#39;armée de &lt;script&gt;&quot;&amp;");
    assert.ok(!page.includes(`<script>"&`));
  });

  test(`[${mode}] link previews: no og: tag outside the battle pages (/hq, /history)`, async () => {
    const env = setup(mode);
    const { cl } = await warp(env);
    for (const path of ["/hq", "/history"]) {
      const page = await (await get(env, cl, path)).text();
      assert.ok(page.length > 0);
      assert.deepEqual(metaTags(page), {}, path);
      assert.ok(!page.includes("og:"), path);
    }
  });
}

test("link previews: battleOg names the stored winner (attacker or defender), a null winner is a draw", () => {
  const cfg = setup("path").cfg;
  const row = (winner: number | null) => ({ day: "2026-11-22", winner, input: { attackerSide: 1 } as BattleInput });
  const og = (winner: number | null) => battleOg(cfg, row(winner), "L'armée de A", "L'armée de D", "/b/fview/7");
  assert.equal(og(1).description, "Combat MiniTroopers du 22/11/2026. Victoire de L'armée de A.");
  assert.equal(og(0).description, "Combat MiniTroopers du 22/11/2026. Victoire de L'armée de D.");
  assert.equal(og(null).description, "Combat MiniTroopers du 22/11/2026. Match nul.");
  assert.equal(og(0).title, "Revoir : L'armée de A VS L'armée de D");
  assert.equal(og(0).url, `${cfg.publicUrl}/b/fview/7`);
});

test("link previews: public/img/og-battle.jpg is a 1200x630 JPEG under 200 KB, served as image/jpeg", async () => {
  const res = await setup("path").app.request("/img/og-battle.jpg");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.equals(readFileSync(new URL("../public/img/og-battle.jpg", import.meta.url))));
  assert.ok(buf.length < 200 * 1024, `${buf.length} bytes`);
  assert.deepEqual([...buf.subarray(0, 3)], [0xff, 0xd8, 0xff], "SOI");
  let pos = 2;
  let size: { w: number; h: number } | null = null;
  while (pos < buf.length && !size) {
    assert.equal(buf[pos], 0xff, "marker");
    const marker = buf[pos + 1]!;
    const len = buf.readUInt16BE(pos + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      size = { h: buf.readUInt16BE(pos + 5), w: buf.readUInt16BE(pos + 7) };
    }
    pos += 2 + len;
  }
  assert.deepEqual(size, { w: 1200, h: 630 });
});
