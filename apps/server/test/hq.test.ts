import { test } from "node:test";
import assert from "node:assert/strict";
import { clientParams, gridData } from "@mt/engine";
import { hashPassword } from "../src/password.ts";
import { armyByHost, trooperInput, troopersOf } from "../src/repo.ts";
import { hqPage } from "../src/views/hq.ts";
import { notification } from "../src/views/army.ts";
import { esc } from "../src/views/html.ts";
import { MINI_SWF } from "../src/views/swf.ts";
import { create, setup, type Env, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];
const plain = (s: string): string => s.replaceAll("&#39;", "'");
const hqOf = async (env: Env, cl: ReturnType<Env["client"]>, host: string, q = ""): Promise<Response> => {
  const at = env.at(host, "/hq" + q);
  return cl.req(at.url, { host: at.host });
};
/** Tiles of the battle box (the mission box follows it). */
const tilesOf = (html: string): string[] => [...html.split('<h1 class="hbox">Mission :')[0]!.matchAll(/<div class="b (bgo2|bwin|bdefeat)">/g)].map((m) => m[1]!);

/** Seed 1000 with these 15 level-ups owns COMMANDEMENT (skill 69), found by scanning choiceIndexForSkill. */
const COMMANDER = { seed: 1000, choices: JSON.stringify(new Array(15).fill(0)) };

async function army(env: Env, name = "Warp", ip = "1.1.1.1") {
  const cl = env.client(ip);
  const res = await create(env, cl, name, { part: "0" });
  assert.equal(res.status, 302);
  const row = env.db.prepare("SELECT host FROM armies ORDER BY id DESC LIMIT 1").get() as { host: string };
  return { cl, a: armyByHost(env.db, row.host)! };
}

for (const mode of MODES) {
  test(`[${mode}] /hq without a session goes back to the home page`, async () => {
    const env = setup(mode);
    const res = await env.client().req("/hq");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/");
  });

  test(`[${mode}] /hq at the root redirects an owner to the army's HQ`, async () => {
    const env = setup(mode);
    const { cl } = await army(env);
    const res = await cl.req("/hq");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), mode === "path" ? "/a/warp/hq" : "http://warp.lvh.me:8080/hq");
  });

  test(`[${mode}] HQ of a new army: money, power, 3 battle tiles, locked mission/raid, recruit link, timer`, async () => {
    const env = setup(mode);
    const { cl, a } = await army(env);
    const html = plain(await (await hqOf(env, cl, "warp")).text());
    const base = mode === "path" ? "/a/warp" : "http://warp.lvh.me:8080";
    assert.ok(html.includes(`<a href="${base}/hq" class="company">L'armée de Warp</a>`));
    assert.match(html, /<span id="targetMoney">0<\/span>/);
    assert.match(html, /class="power"[^>]*>5<\/div>/); // 1 trooper: 5 + 0 choices
    assert.deepEqual(tilesOf(html), ["bgo2", "bgo2", "bgo2"]);
    assert.ok(html.includes('<div class="action bcount3">'));
    assert.ok(html.includes(`<a href="${base}/b/opp" class="b_bg bgo2_bg"`));
    assert.ok(html.includes("Il te reste 3 batailles aujourd'hui !"));
    assert.ok(html.includes("Nouvelle mission dans") && !html.includes("Nouvelles batailles"));
    assert.ok(html.includes("Protége ton armée avec un mot de passe !"));
    assert.match(html, /<h1 class="hbox">Mission : (Infiltrer|Exterminer)<\/h1>/);
    assert.ok(html.includes("Débloquer pour 5") && html.includes("<h1 class=\"hbox\">Raid</h1>"));
    assert.equal([...html.matchAll(/Bientôt disponible !/g)].length, 0);
    assert.ok(html.includes("Recrute tes amis pour lancer un raid !"));
    for (const [p, label] of [["/history", "Historique"], ["/choice", "Gérer mon armée"], ["/protect", "Protéger mon armée"], ["/ranks", "Hiérarchie"]]) {
      assert.ok(html.includes(`<a href="${base}${p}" class="but_bg`), p);
      assert.ok(html.includes(`>${label}</a>`), label);
    }
    assert.ok(html.includes("javascript:_.startRecruit()"));
    const link = mode === "path" ? "http://localhost:8080/a/warp/" : "http://warp.lvh.me:8080/";
    assert.ok(html.includes(`value="${link}"`));
    assert.match(html, /Ta prochaine recrue te rapportera 100/);
    assert.match(html, /mt\.js\.Timer\.alloc\('2000-01-01 00:00:00','2000-01-01 1[0-9]:[0-9]{2}:[0-9]{2}',2,null\)/);
    assert.ok(!html.includes('id="notification"'));
    void a;
  });

  test(`[${mode}] HQ grid flashvars = gridData of the stored army (add tile while < 12)`, async () => {
    const env = setup(mode);
    const { cl, a } = await army(env);
    const t = troopersOf(env.db, a.id).map(trooperInput);
    const want = clientParams(gridData({ army: t, xmax: 3, ymax: 1, add: true, fac: a.faction, space: -1, action: "on" }, MINI_SWF));
    const html = await (await hqOf(env, cl, "warp")).text();
    const m = /flashvars : ("(?:[^"\\]|\\.)*")/.exec(html)!;
    assert.equal(JSON.parse(m[1]!), want);
    assert.match(html, /embedSWF\("\/swf\/client_fr_play\.swf\?v=2","swf_tr_view",214,72,/);
    assert.match(html, /var ttips = \[\n\t"Ajoute un nouveau trooper à ton armée !"\n\t,"Accède aux informations du trooper \\u003cstrong\\u003e/);
    // 12 troopers: no add tile, 4 rows
    for (let s = 1; s < 12; s++) env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name) VALUES (?,?,?,?)").run(a.id, s, 500 + s, `T${s}`);
    const html12 = await (await hqOf(env, cl, "warp")).text();
    const want12 = clientParams(gridData({ army: troopersOf(env.db, a.id).map(trooperInput), xmax: 3, ymax: 4, add: false, fac: a.faction, space: -1, action: "on" }, MINI_SWF));
    assert.equal(JSON.parse(/flashvars : ("(?:[^"\\]|\\.)*")/.exec(html12)![1]!), want12);
    assert.match(html12, /"swf_tr_view",214,288,/);
    assert.ok(!html12.includes("Ajoute un nouveau trooper"));
    assert.match(html12, /class="power"[^>]*>60<\/div>/); // 12 * 5
  });

  test(`[${mode}] 3 battle tiles, 4 with a COMMANDEMENT trooper`, async () => {
    const env = setup(mode);
    const { cl, a } = await army(env);
    assert.equal(tilesOf(await (await hqOf(env, cl, "warp")).text()).length, 3);
    env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?,1,?,?,?)").run(a.id, COMMANDER.seed, "Chef", COMMANDER.choices);
    const html = plain(await (await hqOf(env, cl, "warp")).text());
    assert.deepEqual(tilesOf(html), ["bgo2", "bgo2", "bgo2", "bgo2"]);
    assert.ok(html.includes("Il te reste 4 batailles aujourd'hui !"));
    assert.ok(html.includes('<div class="action bcount4">'));
  });

  test(`[${mode}] played battles of today show as win/defeat tiles linking /b/view/batN`, async () => {
    const env = setup(mode);
    const { cl, a } = await army(env);
    const ins = env.db.prepare("INSERT INTO battles(day, attacker_id, defender_id, input, winner, kind) VALUES (?,?,NULL,?,?,?)");
    ins.run("2026-11-23", a.id, JSON.stringify({ attackerSide: 0 }), 0, "battle"); // won
    ins.run("2026-11-23", a.id, JSON.stringify({ attackerSide: 1 }), 0, "battle"); // lost
    ins.run("2026-11-22", a.id, JSON.stringify({ attackerSide: 0 }), 0, "battle"); // yesterday
    ins.run("2026-11-23", a.id, JSON.stringify({ attackerSide: 0 }), 0, "mission"); // not a battle
    const html = plain(await (await hqOf(env, cl, "warp")).text());
    const base = mode === "path" ? "/a/warp" : "http://warp.lvh.me:8080";
    assert.deepEqual(tilesOf(html), ["bwin", "bdefeat", "bgo2"]);
    assert.ok(html.includes(`<a href="${base}/b/view/bat1" class="b_bg bwin_bg"`));
    assert.ok(html.includes(`<a href="${base}/b/view/bat2" class="b_bg bdefeat_bg"`));
    assert.ok(html.includes("Il te reste 1 bataille aujourd'hui !"));
    ins.run("2026-11-23", a.id, JSON.stringify({ attackerSide: 0 }), 1, "battle");
    const done = plain(await (await hqOf(env, cl, "warp")).text());
    assert.deepEqual(tilesOf(done), ["bwin", "bdefeat", "bdefeat"]);
    assert.ok(done.includes("Tu as terminé tes batailles du jour !"));
    // the next game day starts from zero
    env.clock.t += 86_400_000;
    assert.deepEqual(tilesOf(await (await hqOf(env, cl, "warp")).text()), ["bgo2", "bgo2", "bgo2"]);
  });

  test(`[${mode}] ?money=N animates the counter from credits-N`, async () => {
    const env = setup(mode);
    const { cl, a } = await army(env);
    env.db.prepare("UPDATE armies SET credits = 241 WHERE id = ?").run(a.id);
    const html = await (await hqOf(env, cl, "warp", "?money=7")).text();
    assert.match(html, /<span id="targetMoney">234<\/span>/);
    assert.ok(html.includes("_.deltaMoney(7)"));
    const clamp = await (await hqOf(env, cl, "warp", "?money=9999")).text();
    assert.match(clamp, /<span id="targetMoney">0<\/span>/);
    assert.ok(clamp.includes("_.deltaMoney(241)"));
    for (const bad of ["?money=-5", "?money=abc", "?money=1.5", "?money="]) {
      const h = await (await hqOf(env, cl, "warp", bad)).text();
      assert.match(h, /<span id="targetMoney">241<\/span>/, bad);
      assert.ok(!h.includes("_.deltaMoney"), bad);
    }
  });

  test(`[${mode}] protected army without its session shows the password form only`, async () => {
    const env = setup(mode);
    const { cl, a } = await army(env);
    env.db.prepare("UPDATE armies SET password_hash = ? WHERE id = ?").run(hashPassword("pw"), a.id);
    const stranger = env.client("2.2.2.2");
    const res = await hqOf(env, stranger, "warp");
    assert.equal(res.status, 200);
    const html = plain(await res.text());
    assert.ok(html.includes('<div class="insertpass">'));
    assert.ok(html.includes('<input type="hidden" name="login" value="warp"/>'));
    assert.ok(html.includes('type="password"'));
    assert.ok(html.includes("Cette armée est protégée. Identifie-toi sur la gauche."));
    assert.deepEqual(tilesOf(html), []);
    assert.ok(!html.includes("swf_tr_view") && !html.includes("startRecruit"));
    assert.ok(html.includes('class="box10"')); // the original locked view keeps the recruit link
    assert.ok(html.includes("Modifier mon pass")); // footer of every page
    assert.equal((await stranger.req("/recruit")).status, 403);
    // another army's session is a stranger too
    const other = await army(env, "Autre", "3.3.3.3");
    assert.ok((await (await hqOf(env, other.cl, "warp")).text()).includes("insertpass"));
    // the owner (and nobody else) gets the real HQ; the protect entry is gone once a password is set
    const own = await (await hqOf(env, cl, "warp")).text();
    assert.ok(own.includes("swf_tr_view") && !own.includes("insertpass") && !own.includes("Protéger mon armée") && own.includes("Modifier mon pass"));
    // log in with the password: the form's own flow
    const at = env.at("warp", "/login");
    const ok = await stranger.req(at.url, { host: at.host, form: { login: "warp", pass: "pw" } });
    assert.equal(ok.status, 303);
    assert.ok((await (await hqOf(env, stranger, "warp")).text()).includes("swf_tr_view"));
  });

  test(`[${mode}] an open army seen by a stranger redirects to its recruit page, never to its HQ`, async () => {
    const env = setup(mode);
    await army(env);
    const res = await hqOf(env, env.client("2.2.2.2"), "warp");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), mode === "path" ? "/a/warp/" : "http://warp.lvh.me:8080/");
    assert.equal((await hqOf(env, env.client("2.2.2.2"), "nobody-here")).status, 404);
  });

  test(`[${mode}] menu entries of later stages answer "bientôt"; /recruit fragment for the owner`, async () => {
    const env = setup(mode);
    const { cl } = await army(env);
    for (const p of ["/choice", "/ranks", "/global-ranks"]) {
      const at = env.at("warp", p);
      const res = await cl.req(at.url, { host: at.host });
      assert.equal(res.status, 200, p);
      const html = await res.text();
      assert.ok(html.includes("Bientôt disponible !"), p);
      assert.ok(html.includes(mode === "path" ? 'href="/a/warp/hq" class="button5"' : 'href="http://warp.lvh.me:8080/hq" class="button5"'), p);
    }
    const at = env.at("warp", "/recruit");
    const frag = plain(await (await cl.req(at.url, { host: at.host })).text());
    assert.ok(frag.includes("Recruter un ami"));
    assert.ok(frag.includes(mode === "path" ? 'value="http://localhost:8080/a/warp/"' : 'value="http://warp.lvh.me:8080/"'));
    assert.ok(frag.includes("tu gagneras 100"));
    // path mode: app.js fetches the absolute "/recruit": the session's army answers
    const root = await cl.req("/recruit");
    assert.equal(root.status, 200);
    assert.equal((await env.client("9.9.9.9").req("/recruit")).status, 403);
  });

  test(`[${mode}] hostile trooper and army names stay inert in the HQ (html, tooltips, script, flashvars)`, async () => {
    const env = setup(mode);
    const { cl, a } = await army(env, "<b>x</b>");
    const evil = "</script><img src=x onerror=alert(1)>\"'\\\u2028\ud800";
    env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name) VALUES (?,1,77,?)").run(a.id, evil);
    const html = await (await hqOf(env, cl, a.host)).text();
    assert.ok(!html.includes("<img src=x onerror"));
    assert.ok(!html.includes("</script><img"));
    assert.ok(!html.includes("<b>x</b>"));
    assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
    // every inline script still parses (the hostile name cannot break out of a string literal)
    for (const m of html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)) {
      if (m[1]!.includes("document.write") || m[1]!.includes("$(")) continue;
      assert.doesNotThrow(() => new Function(m[1]!.replaceAll("swfobject.embedSWF", "void ").replace(/^var swfp =/, "var swfp =")), m[1]!.slice(0, 80));
    }
    const tips = /var ttips = \[([\s\S]*?)\];/.exec(html)![1]!;
    const arr = JSON.parse(`[${tips}]`) as string[];
    const stored = (env.db.prepare("SELECT name FROM troopers WHERE army_id = ? AND slot = 1").get(a.id) as { name: string }).name;
    assert.equal(arr[2], `Accède aux informations du trooper <strong>${esc(stored)}</strong>`);
  });
}

test("hqPage shows a notification popup when given one (level-up congratulations)", () => {
  const env = setup("path");
  const a = armyByHost(env.db, "x");
  assert.equal(a, null);
  const army = { id: 1, host: "nsun", name: "nSun", part: 5, faction: 1, credits: 241, recruiterId: null, createdAt: 0, createdIp: null, passwordHash: null, isFaction: false, createdCid: null, missionsUnlocked: false, rats: 1, epicWins: 0 };
  const mission = { type: "infiltrate" as const, unlocked: false, tries: [], key: "ABCDEF" };
  const view = { army, troopers: [], power: 99, battles: [], battleTotal: 3, resetIn: 100, nextBounty: 50, moneyDelta: 0, notice: "Félicitations ! <b>x</b>", locked: false, mission, raid: { phase: 1, alive: 0, over: false, lastWin: false, key: "ABCDEF" } };
  const html = String(hqPage(env.cfg, view));
  assert.ok(html.includes('<div id="notification"><div class="poptop">'));
  assert.ok(html.includes("Félicitations ! &lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("_.hideNotif()"));
  assert.ok(!String(hqPage(env.cfg, { ...view, notice: null })).includes("notification"));
  assert.ok(String(notification("e", true)).includes('id="notification" class="poperror"'));
  assert.ok(html.includes("Ta prochaine recrue te rapportera 50"));
});
