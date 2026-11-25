import { test } from "node:test";
import assert from "node:assert/strict";
import type { BattleInput } from "@mt/engine";
import { confirmedRecruitCount, confirmRecruits, createArmy, defensesOf, pendingRecruits, recruitsOf, armyByHost, troopersOf, trooperInput } from "../src/repo.ts";
import { recruitsByLevel } from "../src/deploy.ts";
import { loadConfig } from "../src/config.ts";
import { historyRight } from "../src/views/history.ts";
import { create, setup, type Env, type Mode } from "./helpers.ts";
import { decodeBattleFlashvars, decodeRecruitsFlashvars } from "./hxdecode.ts";

const MODES: Mode[] = ["path", "subdomain"];
const get = (env: Env, cl: ReturnType<Env["client"]>, host: string, p: string): Promise<Response> => {
  const at = env.at(host, p);
  return cl.req(at.url, { host: at.host });
};
const credits = (env: Env, host: string): number => armyByHost(env.db, host)!.credits;
let ipN = 10;
async function recruit(env: Env, recruiter: string, name: string, cl = env.client(`9.9.9.${ipN++}`)) {
  const res = await create(env, cl, name, { recruit: recruiter });
  assert.equal(res.status, 302);
  return cl;
}
async function owner(env: Env, name = "Boss") {
  const cl = env.client("1.1.1.1");
  assert.equal((await create(env, cl, name)).status, 302);
  return cl;
}

for (const mode of MODES) {
  test(`[${mode}] a recruit shows "Nouvelle recrue disponible" at the HQ, credits unchanged; /history credits once`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    await recruit(env, "boss", "Fresh");
    assert.equal(pendingRecruits(env.db, armyByHost(env.db, "boss")!.id), 1);
    const hq = await (await get(env, a, "boss", "/hq")).text();
    assert.ok(hq.includes('<li class="newchild"><a href="'));
    assert.ok(hq.includes('<img src="/img/newrecruit.gif"/> Nouvelle recrue disponible !'));
    assert.equal(credits(env, "boss"), 0);

    const res = await get(env, a, "boss", "/history");
    assert.equal(res.status, 200);
    const page = await res.text();
    assert.equal(credits(env, "boss"), 100);
    assert.match(page, /Tu\s+as\s+recruté\s+<strong>L&#39;armée[^<]*Fresh<\/strong>/);
    assert.match(page, /Gain\s+:\s+100\s+<img src="\/img\/token.png"\/>/);
    assert.ok(page.includes(`href="${mode === "path" ? "/a/fresh/hq" : "http://fresh.lvh.me:8080/hq"}"`));
    assert.match(page, /Tu\s+as\s+<strong>1<\/strong>\s+<img src="\/favicon.ico"\/>\s+recrues/);
    assert.ok(page.includes("Historique des Combats") && page.includes("Historique des Recrues"));
    assert.ok(!(await (await get(env, a, "boss", "/hq")).text()).includes("newchild"));

    await get(env, a, "boss", "/history");
    assert.equal(credits(env, "boss"), 100);
    assert.match(await (await get(env, a, "boss", "/hq")).text(), /Ta prochaine recrue te rapportera 50/);
  });

  test(`[${mode}] two simultaneous GET /history credit once`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    await recruit(env, "boss", "Fresh");
    await Promise.all([get(env, a, "boss", "/history"), get(env, a, "boss", "/history")]);
    assert.equal(credits(env, "boss"), 100);
  });

  test(`[${mode}] 5 recruits confirmed at once pay 100+50+50+50+10`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    for (const n of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) await recruit(env, "boss", n);
    await get(env, a, "boss", "/history");
    assert.equal(credits(env, "boss"), 260);
    assert.equal(confirmedRecruitCount(env.db, armyByHost(env.db, "boss")!.id), 5);
    const page = await (await get(env, a, "boss", "/history")).text();
    assert.match(page, /Tu\s+as\s+<strong>5<\/strong>/);
    assert.deepEqual([...page.matchAll(/Gain\s+:\s+(\d+)/g)].map((m) => Number(m[1])), [10, 50, 50, 50, 100]);
  });

  test(`[${mode}] a recruit created from the recruiter's own client pays 0`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    const same = env.client("9.9.9.99"); // another browser session carrying the recruiter's cid cookie
    same.cookies.cid = a.cookies.cid!;
    await recruit(env, "boss", "Self", same);
    await get(env, a, "boss", "/history");
    assert.equal(credits(env, "boss"), 0);
    assert.match(await (await get(env, a, "boss", "/history")).text(), /Gain\s+:\s+0\s/);
  });

  test(`[${mode}] /history of someone else's army redirects to its HQ and credits nothing`, async () => {
    const env = setup(mode);
    await owner(env);
    await recruit(env, "boss", "Fresh");
    const res = await get(env, env.client("4.4.4.4"), "boss", "/history");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), mode === "path" ? "/a/boss/hq" : "http://boss.lvh.me:8080/hq");
    assert.equal(credits(env, "boss"), 0);
    assert.equal(pendingRecruits(env.db, armyByHost(env.db, "boss")!.id), 1);
  });

  test(`[${mode}] hostile army names are escaped`, async () => {
    const env = setup(mode);
    const a = await owner(env);
    await recruit(env, "boss", "Fresh");
    env.db.prepare("UPDATE armies SET name = ? WHERE host = 'fresh'").run('<script>alert(1)</script>"x');
    const page = await (await get(env, a, "boss", "/history")).text();
    assert.ok(!page.includes("<script>alert(1)"));
    assert.ok(page.includes("&lt;script&gt;alert(1)&lt;/script&gt;&quot;x"));
  });
}

test("confirmRecruits / recruitsOf: nothing pending credits nothing; list is newest first and limited", () => {
  const env = setup("path");
  const ins = env.db.prepare("INSERT INTO armies(host, name, credits, recruiter_id, created_at) VALUES (?,?,0,?,0)");
  const r = Number(ins.run("r", "R", null).lastInsertRowid);
  assert.deepEqual(confirmRecruits(env.db, r, 5, () => 7), { confirmed: 0, credited: 0 });
  for (const h of ["a", "b", "c"]) ins.run(h, h.toUpperCase(), r);
  assert.deepEqual(confirmRecruits(env.db, r, 5, (rank) => rank), { confirmed: 3, credited: 6 });
  assert.equal(credits(env, "r"), 6);
  assert.deepEqual(recruitsOf(env.db, r, 2).map((x) => [x.host, x.bounty]), [["c", 3], ["b", 2]]);
});

// ---- battles column, last defence on the HQ, defender's replay, recruits animation (stage 4) --------------------------

const flashvarsOf = (html: string, div: string): string => {
  const part = html.split(`<div id="${div}" class="swf"></div>`)[1];
  assert.ok(part, `${div} embed present`);
  return JSON.parse(/flashvars : ("(?:[^"\\]|\\.)*")/.exec(part!)![1]!) as string;
};
const fviewOf = (mode: Mode, host: string, id: number): string => (mode === "path" ? `/a/${host}/b/fview/${id}` : `http://${host}.lvh.me:8080/b/fview/${id}`);
const combats = (page: string): string => page.split("<h2>Historique des Combats</h2>")[1]!.split('<td class="right"><h2>Historique des Recrues</h2>')[0]!;
const items = (part: string): { cls: string; href: string }[] => [...part.matchAll(/<li class="(win|defeat)"><a href="([^"]+)">/g)].map((m) => ({ cls: m[1]!, href: m[2]! }));

/** Boss (the defender, owner client `b`) and Warp (the attacker, owner client `a`) attacking Boss by name once. */
async function infiltration(env: Env) {
  const b = await owner(env);
  const a = env.client("2.2.2.2");
  assert.equal((await create(env, a, "Warp")).status, 302);
  const at = env.at("warp", "/b/battle");
  const res = await a.req(at.url, { host: at.host, form: { chk: a.key!, n: "0", friend: "Boss" } });
  assert.equal(res.status, 303);
  const row = env.db.prepare("SELECT * FROM battles WHERE attacker_id = ?").get(armyByHost(env.db, "warp")!.id) as { id: number; input: string; opp: string };
  assert.equal(row.opp, "friend:boss");
  return { a, b, row, warp: armyByHost(env.db, "warp")!.id, boss: armyByHost(env.db, "boss")!.id };
}

/** Stores a battle of `attacker` against `defender` (copying a stored input), as made by an attack for `opp`. */
function storeBattle(env: Env, attacker: number, defender: number, input: string, o: { opp: string; winner: number; createdAt: number | null; day?: string }): number {
  return Number(
    env.db
      .prepare("INSERT INTO battles(day, attacker_id, defender_id, input, winner, kind, opp, seen, created_at) VALUES (?, ?, ?, ?, ?, 'battle', ?, 1, ?)")
      .run(o.day ?? "2026-11-23", attacker, defender, input, o.winner, o.opp, o.createdAt).lastInsertRowid,
  );
}

/** A confirmed recruit of `recruiterId` whose first trooper has `level` choices. */
function confirmedRecruit(env: Env, host: string, recruiterId: number, level: number): number {
  const r = createArmy(env.db, {
    host, name: host, part: 0, faction: 2, credits: 0, recruiterId, createdIp: "9.9.9.9", createdCid: null, now: env.clock.t,
    trooper: { seed: 7000 + level * 10 + host.length, name: `R${host}` }, maxPerIp: 999, dayOf: () => "x",
  });
  if (!r.ok) throw new Error(r.reason);
  env.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(Array(level).fill(0)), r.army.id);
  env.db.prepare("UPDATE armies SET recruit_confirmed_at = ?, recruit_bounty = 0 WHERE id = ?").run(env.clock.t, r.army.id);
  return r.army.id;
}

for (const mode of MODES) {
  test(`[${mode}] an attack by name shows in the defender's history: defeat, then victory, from the defender's side`, async () => {
    const env = setup(mode);
    const { a, b, row } = await infiltration(env);
    env.db.prepare("UPDATE battles SET winner = 0 WHERE id = ?").run(row.id); // the attacker (side 0) won
    let page = await (await get(env, b, "boss", "/history")).text();
    assert.deepEqual(items(combats(page)), [{ cls: "defeat", href: fviewOf(mode, "boss", row.id) }]);
    assert.ok(
      combats(page).includes(
        `<ul class="history"><li class="defeat"><a href="${fviewOf(mode, "boss", row.id)}"><p><em><img src="/img/defeat.png"/>\nDéfaite</em>\ncontre\n<strong>L&#39;armée Warp</strong></p>\n<p class="extra"><span>Aujourd&#39;hui à 11:00</span></p></a></li></ul>`,
      ),
    );
    env.db.prepare("UPDATE battles SET winner = 1 WHERE id = ?").run(row.id);
    page = await (await get(env, b, "boss", "/history")).text();
    assert.deepEqual(items(combats(page)).map((x) => x.cls), ["win"]);
    assert.ok(combats(page).includes('<img src="/img/win.png"/>\nVictoire</em>'));
    // the attacker's own history lists nothing (it defended nothing)
    assert.ok(!(await (await get(env, a, "warp", "/history")).text()).includes('class="win"'));
  });

  test(`[${mode}] no defence: the archived empty text; battles from the /b/opp list are left out`, async () => {
    const env = setup(mode);
    const { b, row, warp, boss } = await infiltration(env);
    env.db.prepare("DELETE FROM battles WHERE id = ?").run(row.id);
    storeBattle(env, warp, boss, row.input, { opp: String(boss), winner: 0, createdAt: env.clock.t });
    const page = await (await get(env, b, "boss", "/history")).text();
    assert.ok(
      page.includes(
        "<table class=\"log\"><tr><td><h2>Historique des Combats</h2>\n\n<p>Aucune armée adverse ne t'a encore attaquée via l'infiltration du mode Bataille.</p></td>\n<td class=\"right\">",
      ),
    );
    assert.ok(!(await (await get(env, b, "boss", "/hq")).text()).includes('<ul class="history">'));
  });

  test(`[${mode}] 12 defences: the 10 most recent, newest first; the HQ shows the last one only`, async () => {
    const env = setup(mode);
    const { b, row, warp, boss } = await infiltration(env);
    const ids = [row.id];
    for (let i = 1; i < 12; i++) ids.push(storeBattle(env, warp, boss, row.input, { opp: "friend:boss", winner: i % 2, createdAt: env.clock.t + i * 60_000 }));
    const page = await (await get(env, b, "boss", "/history")).text();
    assert.deepEqual(items(combats(page)).map((x) => x.href), ids.slice(2).reverse().map((id) => fviewOf(mode, "boss", id)));
    const hq = await (await get(env, b, "boss", "/hq")).text();
    const ul = hq.split('<ul class="history">')[1]!.split("</ul>")[0]!;
    assert.deepEqual(items(ul).map((x) => x.href), [fviewOf(mode, "boss", ids[11]!)]);
    assert.ok(ul.includes("<p class=\"extra\"><span>Aujourd&#39;hui à 11:11</span></p>"));
    // after a pending recruit's "newchild" item
    await recruit(env, "boss", "Fresh");
    const hq2 = await (await get(env, b, "boss", "/hq")).text();
    assert.match(hq2, /<ul class="history"><li class="newchild">.*<\/li>\n\n\n<li class="(win|defeat)">/s);
  });

  test(`[${mode}] /b/fview/<id>: attackerSide is the viewer's side; the stored input is unchanged`, async () => {
    const env = setup(mode);
    const { a, b, row } = await infiltration(env);
    const at = (host: string) => env.at(host, `/b/fview/${row.id}`);
    const byB = decodeBattleFlashvars(flashvarsOf(await (await b.req(at("boss").url, { host: at("boss").host })).text(), "swf_battle"));
    const byA = decodeBattleFlashvars(flashvarsOf(await (await a.req(at("warp").url, { host: at("warp").host })).text(), "swf_battle"));
    const stored = JSON.parse(row.input) as BattleInput;
    assert.equal(stored.attackerSide, 0);
    assert.equal(byB.input.attackerSide, 1);
    assert.equal(byA.input.attackerSide, 0);
    assert.deepEqual({ ...byB.input, attackerSide: 0 }, stored);
    assert.deepEqual(byA.input, stored);
    assert.equal((env.db.prepare("SELECT input FROM battles WHERE id = ?").get(row.id) as { input: string }).input, row.input);
  });

  test(`[${mode}] recruits animation: army slot 0 (id n) then the recruits by level, garden, army.swf`, async () => {
    const env = setup(mode);
    const b = await owner(env);
    const boss = armyByHost(env.db, "boss")!;
    confirmedRecruit(env, "rec-a", boss.id, 2);
    confirmedRecruit(env, "rec-b", boss.id, 5);
    confirmedRecruit(env, "rec-c", boss.id, 5);
    const page = await (await get(env, b, "boss", "/history")).text();
    assert.ok(page.includes(`<td class="right">\n\n<div id="swf_recuits" class="swf"></div>`));
    assert.ok(page.includes(`swfobject.embedSWF("/swf/client_fr_play.swf?v=10","swf_recuits",670,240,'10.0.0',null,null,swfp,{ id : "recuits", 'class' : 'swf' })</script>\n\n<table class="log">`));
    assert.ok(page.includes(" ,renderer : 'webgl' };"), "the recruits animation asks for plain WebGL");
    const fv = flashvarsOf(page, "swf_recuits");
    assert.ok(!fv.includes("wmode"));
    const dec = decodeRecruitsFlashvars(fv);
    assert.equal(dec.n, 3);
    assert.equal(dec.army.faction, boss.faction);
    assert.deepEqual(dec.army.spawnOrder, []);
    assert.deepEqual(dec.bg, { id: 0, gfx: "bg/garden.jpg" });
    assert.ok(dec.gfx.endsWith("army.swf?v=2"));
    const slot0 = trooperInput(troopersOf(env.db, boss.id).find((t) => t.slot === 0)!);
    assert.deepEqual(dec.army.troopers[0], { ...slot0, id: 3 });
    const order = recruitsByLevel(env.db, boss.id);
    assert.deepEqual(order.map((r) => r.trooper.choices.length), [5, 5, 2]);
    assert.deepEqual(dec.army.troopers.slice(1), order.map((r, i) => ({ ...r.trooper, id: i })));
  });

  test(`[${mode}] no recruit: no animation; 51 recruits: n = 50`, async () => {
    const env = setup(mode);
    const b = await owner(env);
    assert.ok(!(await (await get(env, b, "boss", "/history")).text()).includes("swf_recuits"));
    const boss = armyByHost(env.db, "boss")!.id;
    for (let i = 0; i < 51; i++) confirmedRecruit(env, `r${i}`, boss, 1 + (i % 7));
    const dec = decodeRecruitsFlashvars(flashvarsOf(await (await get(env, b, "boss", "/history")).text(), "swf_recuits"));
    assert.equal(dec.n, 50);
    assert.equal(dec.army.troopers.length, 51);
    assert.deepEqual(dec.army.troopers.map((t) => t.id), [50, ...Array.from({ length: 50 }, (_, i) => i)]);
  });
}

test("defensesOf: infiltrations only, newest first, limited; created_at NULL falls back to the day", () => {
  const env = setup("path");
  const ins = env.db.prepare("INSERT INTO armies(host, name, part, credits, created_at) VALUES (?,?,?,0,0)");
  const atk = Number(ins.run("atk", "Atk", 2).lastInsertRowid);
  const def = Number(ins.run("def", "Def", 0).lastInsertRowid);
  const input = JSON.stringify({ attackerSide: 0 });
  const old = storeBattle(env, atk, def, input, { opp: "friend:def", winner: 1, createdAt: null, day: "2022-07-27" });
  storeBattle(env, atk, def, input, { opp: String(def), winner: 0, createdAt: 5 });
  const recent = storeBattle(env, atk, def, input, { opp: "friend:def", winner: 0, createdAt: 9 });
  env.db.prepare("INSERT INTO battles(day, attacker_id, defender_id, input, winner, kind, opp) VALUES ('2022-07-28', ?, ?, ?, 0, 'mission', 'friend:def')").run(atk, def, input);
  assert.deepEqual(defensesOf(env.db, def, 10), [
    { id: recent, attacker: { host: "atk", name: "Atk", part: 2 }, won: false, createdAt: 9, day: "2026-11-23" },
    { id: old, attacker: { host: "atk", name: "Atk", part: 2 }, won: true, createdAt: null, day: "2022-07-27" },
  ]);
  assert.equal(defensesOf(env.db, def, 1).length, 1);
  assert.deepEqual(defensesOf(env.db, atk, 10), []);
});

test("battles column: an unknown attacker reads L'armée inconnue; a NULL created_at shows its day", () => {
  const cfg = loadConfig({ URL_MODE: "path" });
  const out = String(historyRight(cfg, { host: "def", defenses: [{ id: 7, attacker: null, won: true, createdAt: null, day: "2022-07-27" }], now: 0, recruits: [], total: 0, animation: null }));
  assert.ok(out.includes('<li class="win"><a href="/a/def/b/fview/7">'));
  assert.ok(out.includes("<strong>L&#39;armée inconnue</strong>"));
  assert.ok(out.includes("<span>Le 27 juillet</span>"));
});
