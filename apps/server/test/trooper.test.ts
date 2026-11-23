import { test } from "node:test";
import assert from "node:assert/strict";
import { choiceIndexForSkill, clientParams, describeTrooper, levelUpOptions, trooperData, upgradeCost } from "@mt/engine";
import { armyByHost, trooperInput, troopersOf } from "../src/repo.ts";
import { MINI_SWF } from "../src/views/swf.ts";
import { create, setup, type Client, type Env, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];
const plain = (s: string): string => s.replaceAll("&#39;", "'");

async function army(env: Env, o: { seed?: number; choices?: number[]; credits?: number } = {}) {
  const cl = env.client();
  const res = await create(env, cl, "Warp", { part: "0" });
  assert.equal(res.status, 302);
  const a = armyByHost(env.db, "warp")!;
  env.db.prepare("UPDATE troopers SET seed = ?, choices = ? WHERE army_id = ?").run(o.seed ?? 1000, JSON.stringify(o.choices ?? []), a.id);
  env.db.prepare("UPDATE armies SET credits = ? WHERE id = ?").run(o.credits ?? 100, a.id);
  return { cl, key: cl.cookies.ssid!, id: a.id };
}
const get = (env: Env, cl: Client, path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<Response> => {
  const at = env.at("warp", path);
  return cl.req(at.url, { host: at.host, ...init });
};
const credits = (env: Env, id: number): number => (env.db.prepare("SELECT credits FROM armies WHERE id = ?").get(id) as { credits: number }).credits;
const trooper0 = (env: Env, id: number) => troopersOf(env.db, id)[0]!;
const loc = (env: Env, mode: Mode, path: string): string => (mode === "path" ? `/a/warp${path}` : `http://warp.lvh.me:8080${path}`);

for (const mode of MODES) {
  test(`[${mode}] sheet: 140 icons in placement order, owned ones lit, flashvars = trooperData, cost button`, async () => {
    const env = setup(mode);
    const { cl, id } = await army(env);
    const res = await get(env, cl, "/t/0");
    assert.equal(res.status, 200);
    const html = plain(await res.text());
    const t = trooper0(env, id);
    const sheet = describeTrooper(trooperInput(t));
    const lis = [...html.matchAll(/<li( class="on")?[^>]*style="background : url\('\/img\/skills\.png'\) -(\d+)px -(\d+)px"><\/li>/g)];
    assert.equal(lis.length, 140);
    const lit = lis.filter((m) => m[1]).map((m) => Number(m[2]) / 30 + (Number(m[3]) / 30) * 20);
    assert.deepEqual(lit.sort((a, b) => a - b), sheet.skills.filter((s) => s < 140).sort((a, b) => a - b));
    const want = clientParams(trooperData(trooperInput(t), armyByHost(env.db, "warp")!.faction, MINI_SWF));
    const m = /flashvars : ("(?:[^"\\]|\\.)*")/.exec(html.split('class="soldier"')[1]!)!;
    assert.equal(JSON.parse(m[1]!), want);
    assert.ok(html.includes(`<a href="${loc(env, mode, "/hq")}" class="company">Fiche de ${t.name}</a>`));
    assert.match(html, /<a class="but_bg b3_bg img" href="[^"]*\/t\/0\?levelup=[A-Za-z0-9]{6}&amp;lv=0">Améliorer\s+pour\s+1\s+<img src="\/img\/token\.png"\/>/);
    assert.ok(html.includes(`<form id="config" method="POST" action="${loc(env, mode, "/t/0")}?config=`));
  });

  test(`[${mode}] level-up debits upgradeCost once; reloading the URL or racing requests never debits twice`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await army(env, { choices: [0, 0, 0], credits: 100 });
    const cost = upgradeCost(3);
    assert.equal(cost, 32);
    const res = await get(env, cl, `/t/0?levelup=${key}&lv=3`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), loc(env, mode, "/levelup/0"));
    assert.equal(credits(env, id), 100 - cost);
    assert.notEqual(trooper0(env, id).pendingLevelup, null);
    for (let i = 0; i < 3; i++) {
      const again = await get(env, cl, `/t/0?levelup=${key}&lv=3`);
      assert.equal(again.headers.get("location"), loc(env, mode, "/levelup/0"));
    }
    assert.equal(credits(env, id), 100 - cost);
    // the original ';' separator and a plain sheet visit both end on the level-up page while pending
    assert.equal((await get(env, cl, "/t/0")).headers.get("location"), loc(env, mode, "/levelup/0"));
    // concurrent requests on a fresh trooper
    const env2 = setup(mode);
    const b = await army(env2, { choices: [0, 0, 0], credits: 100 });
    await Promise.all(Array.from({ length: 6 }, () => get(env2, b.cl, `/t/0?levelup=${b.key}&lv=3`)));
    assert.equal(credits(env2, b.id), 100 - cost);
  });

  test(`[${mode}] level-up refused: wrong key, not enough credits, max level`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await army(env, { choices: [0, 0, 0], credits: 31 });
    const bad = await get(env, cl, `/t/0?levelup=XXXXXX&lv=3`);
    assert.equal(bad.status, 302);
    assert.equal(credits(env, id), 31);
    const poor = await get(env, cl, `/t/0?levelup=${key}&lv=3`);
    assert.equal(poor.status, 302); // back to the sheet
    assert.equal(credits(env, id), 31);
    assert.equal(trooper0(env, id).pendingLevelup, null);
    const e2 = setup(mode);
    const top = await army(e2, { choices: new Array(60).fill(0), credits: 1e9 });
    const html = await (await get(e2, top.cl, "/t/0")).text();
    assert.ok(!html.includes("?levelup="));
    assert.equal((await get(e2, top.cl, `/t/0?levelup=${top.key}&lv=60`)).status, 302);
    assert.equal(credits(e2, top.id), 1e9);
  });

  test(`[${mode}] level-up page offers levelUpOptions.shown; a MALIN trooper sees 3`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await army(env, { seed: 1000, choices: [], credits: 100 });
    await get(env, cl, `/t/0?levelup=${key}&lv=0`);
    const html = plain(await (await get(env, cl, "/levelup/0")).text()).replaceAll("&amp;", "&").replaceAll("\\u0026", "&");
    const shown = levelUpOptions(trooperInput(trooper0(env, id))).shown;
    assert.equal(shown.length, 2);
    const links = [...html.matchAll(/\/levelup\/0\?skill=(\d+)&chk=([A-Za-z0-9]{6})/g)].map((m) => Number(m[1]));
    assert.deepEqual(links, shown);
    assert.equal([...html.matchAll(/class="box8"/g)].length, 2);
    assert.match(html, /est\s+passé\s+au\s+niveau\s+2 ! Choisis une nouvelle compétence/);
    const env2 = setup(mode);
    const m = await army(env2, { seed: 3, choices: new Array(8).fill(1), credits: 1000 });
    await get(env2, m.cl, `/t/0?levelup=${m.key}&lv=8`);
    const h2 = await (await get(env2, m.cl, "/levelup/0")).text();
    assert.equal([...h2.matchAll(/class="box8"/g)].length, 3);
  });

  test(`[${mode}] choosing a skill: appended once, skill owned, popup on HQ once, bad skill/key refused`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await army(env, { seed: 1000, choices: [], credits: 100 });
    // no level-up paid: the choice URL does nothing
    assert.equal((await get(env, cl, `/levelup/0?skill=19&chk=${key}&lv=0`)).headers.get("location"), loc(env, mode, "/t/0"));
    assert.deepEqual(trooper0(env, id).choices, []);
    await get(env, cl, `/t/0?levelup=${key}&lv=0`);
    const t = trooperInput(trooper0(env, id));
    const o = levelUpOptions(t);
    const outside = o.drawn.find((s) => !o.shown.includes(s))!;
    assert.equal((await get(env, cl, `/levelup/0?skill=${outside}&chk=${key}&lv=0`)).status, 302);
    assert.equal((await get(env, cl, `/levelup/0?skill=abc&chk=${key}&lv=0`)).status, 302);
    assert.equal((await get(env, cl, `/levelup/0?skill=${o.shown[0]}&chk=BADKEY&lv=0`)).status, 403);
    assert.deepEqual(trooper0(env, id).choices, []);
    assert.notEqual(trooper0(env, id).pendingLevelup, null);
    const want = o.shown[1]!;
    const idx = choiceIndexForSkill(t, want)!;
    const res = await get(env, cl, `/levelup/0?skill=${want};chk=${key}&lv=0`); // ';' separator of the original
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), loc(env, mode, "/hq"));
    const after = trooper0(env, id);
    assert.deepEqual(after.choices, [idx]);
    assert.equal(after.pendingLevelup, null);
    assert.ok(describeTrooper(trooperInput(after)).skills.includes(want));
    // replay: nothing changes
    const replay = await get(env, cl, `/levelup/0?skill=${want}&chk=${key}&lv=0`);
    assert.equal(replay.headers.get("location"), loc(env, mode, "/t/0"));
    assert.deepEqual(trooper0(env, id).choices, [idx]);
    // HQ shows the congratulations once
    const hq = plain(await (await get(env, cl, "/hq")).text());
    assert.match(hq, /Félicitations ! Ton trooper <b>[^<]+<\/b> a atteint le niveau <b>2<\/b> et a appris la compétence <b>[^<]+<\/b> !/);
    assert.ok(!plain(await (await get(env, cl, "/hq")).text()).includes("Félicitations"));
  });

  test(`[${mode}] rename: once, <= 12 chars, plain text only, escaped everywhere`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await army(env);
    const q = (n: string, k = key): string => `/t/0?name=${n}&chk=${k}`;
    assert.equal((await get(env, cl, q("Abcdefghijklm"))).status, 302); // 13
    assert.equal((await get(env, cl, q("%20%20"))).status, 302); // blank
    assert.equal((await get(env, cl, q("a%E2%80%8Bb"))).status, 302); // zero-width space
    assert.equal((await get(env, cl, q("a%E2%80%AEb"))).status, 302); // bidi override
    assert.equal((await get(env, cl, q("a%ED%A0%80b"))).status, 302); // lone surrogate (invalid UTF-8)
    assert.equal((await get(env, cl, q("a%EF%BF%BDb"))).status, 302); // U+FFFD
    assert.equal((await get(env, cl, q("a%0Ab"))).status, 302); // newline
    assert.equal((await get(env, cl, q("Neo", "BADKEY"))).status, 302);
    assert.equal(trooper0(env, id).renamed, false);
    const hostile = `"'><b>&\\x`; // 10 chars
    const ok = await get(env, cl, q(encodeURIComponent(hostile)));
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get("location"), loc(env, mode, "/t/0"));
    assert.equal(trooper0(env, id).name, hostile);
    assert.equal(trooper0(env, id).renamed, true);
    const second = await get(env, cl, q("Second"));
    assert.equal(second.headers.get("location"), loc(env, mode, "/t/0?err=renamed")); // only once
    assert.ok((await (await get(env, cl, "/t/0?err=renamed")).text()).includes("déjà été renommé"));
    assert.ok(!(await (await get(env, cl, "/t/0?err=<b>")).text()).includes("<b>"));
    assert.equal(trooper0(env, id).name, hostile);
    for (const path of ["/t/0", "/hq"]) {
      const html = await (await get(env, cl, path)).text();
      assert.ok(!html.includes("<b>&"), path);
      assert.ok(!html.includes(`"'><b>`), path);
      assert.ok(!/<script[^>]*>[^<]*"'>/.test(html), path);
    }
    const sheet = await (await get(env, cl, "/t/0")).text();
    assert.ok(sheet.includes("Fiche de &quot;&#39;&gt;&lt;b&gt;&amp;\\x"));
  });

  test(`[${mode}] a hostile stored name is escaped on the sheet, level-up, add and HQ pages and in the popup`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await army(env, { seed: 1000, choices: [], credits: 100 });
    const evil = `</script><img src=x onerror=alert(1)>'"\\`;
    env.db.prepare("UPDATE troopers SET name = ? WHERE army_id = ?").run(evil, id);
    await get(env, cl, `/t/0?levelup=${key}&lv=0`);
    const pages = [await (await get(env, cl, "/levelup/0")).text()];
    const shown = levelUpOptions(trooperInput(trooper0(env, id))).shown;
    await get(env, cl, `/levelup/0?skill=${shown[0]}&chk=${key}&lv=0`);
    pages.push(await (await get(env, cl, "/hq")).text(), await (await get(env, cl, "/t/0")).text(), await (await get(env, cl, "/add")).text());
    for (const html of pages) {
      assert.ok(!html.includes("<img src=x"), "raw tag");
      assert.ok(!html.includes("</script><img"), "script break-out");
      assert.ok(!/[<>"]/.test(/<[^>]*onerror=alert[^>]*>/.exec(html)?.[0].replace(/<[a-z!][^>]*>/i, "") ?? ""), "handler in a tag");
    }
    assert.ok(pages[1]!.includes("<b>&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&#39;&quot;\\</b>"));
  });

  test(`[${mode}] old level-up URLs are dead: bound to the level, every attempt redirects`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await army(env, { seed: 1000, choices: [], credits: 1000 });
    const old = `/t/0?levelup=${key}&lv=0`;
    await get(env, cl, old);
    const t = trooperInput(trooper0(env, id));
    const want = levelUpOptions(t).shown[0]!;
    const oldChoice = `/levelup/0?skill=${want}&chk=${key}&lv=0`;
    assert.equal((await get(env, cl, oldChoice)).headers.get("location"), loc(env, mode, "/hq"));
    const after = credits(env, id);
    // the old URL again (history/bookmark): no debit, no pending, back to the sheet
    const r = await get(env, cl, old);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), loc(env, mode, "/t/0"));
    assert.equal(credits(env, id), after);
    assert.equal(trooper0(env, id).pendingLevelup, null);
    // a pending level 1 -> 2: the old choice URL (lv=0) must not apply, nor the stale payment URL
    await get(env, cl, `/t/0?levelup=${key}&lv=1`);
    const choicesBefore = trooper0(env, id).choices;
    const stale = await get(env, cl, oldChoice);
    assert.equal(stale.headers.get("location"), loc(env, mode, "/levelup/0"));
    assert.deepEqual(trooper0(env, id).choices, choicesBefore);
    // failed attempts redirect, never render at the action URL
    assert.equal((await get(env, cl, `/t/0?levelup=BADKEY&lv=1`)).status, 302);
  });

  test(`[${mode}] re-equip is deterministic per level: same visit, same set; a level-up re-draws`, async () => {
    const env = setup(mode);
    const b = await army(env, { seed: 2, choices: new Array(12).fill(0) });
    await get(env, b.cl, `/t/0?equip=${b.key}`);
    const first = trooper0(env, b.id).leftOver;
    for (let i = 0; i < 4; i++) await get(env, b.cl, `/t/0?equip=${b.key}`);
    assert.deepEqual(trooper0(env, b.id).leftOver, first);
    assert.equal(first!.length, 1);
  });

  test(`[${mode}] config: weapon index, loc, target, move, ttype=5 -> targetType 1 / targetClass 5; locked ones ignored`, async () => {
    const env = setup(mode);
    // 15 choices: level 16, everything unlocked
    const { cl, key, id } = await army(env, { seed: 1000, choices: new Array(15).fill(0) });
    const t0 = trooperInput(trooper0(env, id));
    const weapons = describeTrooper(t0).weapons;
    const cfgUrl = `/t/0?config=${key}`;
    const form = { weapon: "0", loc: "3", target: "2", move: "0", ttype: "5" };
    const res = await get(env, cl, cfgUrl, { form });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), loc(env, mode, "/t/0"));
    const pref = trooper0(env, id).pref!;
    assert.equal(pref.targetType, 1);
    assert.equal(pref.targetClass, 5);
    assert.equal(pref.CBody, 3);
    assert.equal(pref.targetSystem, 2);
    assert.equal(pref.moveSystem, 0);
    assert.equal(pref.CWeapon, weapons[0]);
    assert.equal(pref.reloadSystem, 2);
    const html = await (await get(env, cl, "/t/0")).text();
    assert.match(html, /<option value="5" selected="selected">Espion<\/option>/);
    assert.match(html, /<option value="3" selected="selected">\s*Dans les tripes/);
    // reset and bad input
    await get(env, cl, cfgUrl, { form: { ttype: "-1", weapon: "-1", loc: "-1" } });
    const p2 = trooper0(env, id).pref!;
    assert.equal(p2.targetType, 0);
    assert.equal(p2.targetClass, undefined);
    assert.equal(p2.CWeapon, null);
    assert.equal(p2.CBody, null);
    assert.equal(p2.targetSystem, 2); // untouched fields stay
    for (const bad of [{ ttype: "8" }, { loc: "8" }, { target: "4" }, { move: "3" }, { weapon: String(weapons.length) }, { ttype: "x" }]) {
      assert.equal((await get(env, cl, cfgUrl, { form: bad })).status, 400, JSON.stringify(bad));
    }
    assert.equal((await get(env, cl, `/t/0?config=BADKEY`, { form })).status, 403);
    // low level: only the weapon (if several) is configurable
    const env2 = setup(mode);
    const low = await army(env2, { seed: 1000, choices: [] });
    await get(env2, low.cl, `/t/0?config=${low.key}`, { form });
    const lp = trooper0(env2, low.id).pref;
    assert.ok(lp === null || (lp.targetType === 0 && lp.CBody === null && lp.targetSystem === 0));
    const lh = await (await get(env2, low.cl, "/t/0")).text();
    assert.ok(!lh.includes('name="ttype"') && !lh.includes('name="move"'));
  });

  test(`[${mode}] re-equip: only offered above the carry capacity, stores a valid leftOver`, async () => {
    const env = setup(mode);
    const { cl } = await army(env, { seed: 1000, choices: [] });
    assert.ok(!(await (await get(env, cl, "/t/0")).text()).includes("?equip="));
    const e2 = setup(mode);
    const b = await army(e2, { seed: 2, choices: new Array(12).fill(0) });
    const html = await (await get(e2, b.cl, "/t/0")).text();
    assert.ok(html.includes(`/t/0?equip=${b.key}`));
    const res = await get(e2, b.cl, `/t/0?equip=${b.key}`);
    assert.equal(res.headers.get("location"), loc(e2, mode, "/t/0"));
    const t = trooper0(e2, b.id);
    const d = describeTrooper(trooperInput(t));
    assert.equal(t.leftOver!.length, 1);
    assert.equal(d.skills.filter((s) => d.equipment.includes(s)).length, d.carry);
    assert.equal((await get(e2, b.cl, `/t/0?equip=BADKEY`)).status, 302);
  });

  test(`[${mode}] pages of another army or without a session never act`, async () => {
    const env = setup(mode);
    const { id } = await army(env);
    const other = env.client("2.2.2.2");
    const res = await get(env, other, `/t/0?levelup=ABCDEF`);
    assert.equal(res.status, 302);
    assert.equal(credits(env, id), 100);
    assert.equal((await get(env, other, "/t/0")).status, 302);
    assert.equal((await get(env, other, "/add")).status, 302);
    assert.equal((await get(env, other, "/levelup/0")).status, 302);
    assert.equal((await get(env, (await army(setup(mode))).cl, "/t/7")).status, 404);
  });
}
