import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dayKey } from "@mt/game";
import type { BattleInput } from "@mt/engine";
import { buildModeInput, type ModeKind } from "../src/battleInput.ts";
import { armyByHost, createArmy } from "../src/repo.ts";
import { create, setup, type Client, type Env, type Mode } from "./helpers.ts";
import { decodeBattleFlashvars } from "./hxdecode.ts";

const MODES: Mode[] = ["path", "subdomain"];
const FIXTURES = new URL("../../../packages/engine/test/fixtures/modes/", import.meta.url);
const BG_MODE: Record<number, ModeKind> = { 1: "exterminate", 2: "infiltrate", 3: "epic", 4: "raid" };

test("buildModeInput rebuilds the 13 archived mission and raid inputs from their armies", () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 13);
  const seen = new Set<ModeKind>();
  for (const f of files) {
    const { input } = JSON.parse(readFileSync(new URL(f, FIXTURES), "utf8")) as { input: BattleInput };
    const mode = BG_MODE[input.background.id]!;
    seen.add(mode);
    const [atk, foe] = input.armies;
    // the archived ids are renumbered from scratch: feed the armies with other ids
    const shift = <T extends { id: number }>(t: T): T => ({ ...t, id: t.id + 1000 });
    const built = buildModeInput({
      mode,
      seed: input.seed,
      attacker: { faction: atk.faction, troopers: atk.troopers.map(shift), spawn: atk.spawnOrder.length },
      foe: { faction: foe.faction, spawnOrder: foe.spawnOrder.map((id) => id + 1000), troopers: foe.troopers.map(shift) },
    });
    assert.deepEqual(built, input, f);
  }
  assert.deepEqual([...seen].sort(), ["epic", "exterminate", "infiltrate", "raid"]);
});

// ---- routes -------------------------------------------------------------------------------------------------------

const today = (env: Env): string => dayKey(new Date(env.clock.t), "Europe/Paris");
const credits = (env: Env, id: number): number => (env.db.prepare("SELECT credits FROM armies WHERE id = ?").get(id) as { credits: number }).credits;
type Row = { id: number; kind: string; mode: string; defender_id: number | null; defender_ref: string | null; input: string; winner: number | null; day: string };
const missions = (env: Env, id: number): Row[] => env.db.prepare("SELECT * FROM battles WHERE attacker_id = ? AND kind = 'mission' ORDER BY id").all(id) as unknown as Row[];
const won = (r: Row): boolean => r.winner !== null && r.winner === (JSON.parse(r.input) as BattleInput).attackerSide;
type Daily = { missions_used: number; mission_won: number; mission_type: string | null; mission_target: string | null };
const daily = (env: Env, id: number, day = today(env)): Daily | undefined =>
  env.db.prepare("SELECT missions_used, mission_won, mission_type, mission_target FROM daily WHERE army_id = ? AND day = ?").get(id, day) as Daily | undefined;

/** A stored army made directly: `troopers[i]` goes to slot i. */
function army(env: Env, host: string, troopers: { seed: number; name: string; choices?: number[] }[], o: { recruiterId?: number | null } = {}): number {
  const r = createArmy(env.db, {
    host,
    name: host,
    part: 0,
    faction: 1,
    credits: 0,
    recruiterId: o.recruiterId ?? null,
    createdIp: "9.9.9.9",
    createdCid: null,
    now: env.clock.t,
    trooper: troopers[0]!,
    maxPerIp: 9999,
    dayOf: () => "x",
  });
  if (!r.ok) throw new Error(r.reason);
  env.db.prepare("UPDATE troopers SET choices = ? WHERE army_id = ?").run(JSON.stringify(troopers[0]!.choices ?? []), r.army.id);
  const ins = env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?, ?, ?, ?, ?)");
  troopers.slice(1).forEach((t, i) => ins.run(r.army.id, i + 1, t.seed, t.name, JSON.stringify(t.choices ?? [])));
  return r.army.id;
}

async function warp(env: Env, credit = 100) {
  const cl = env.client();
  const res = await create(env, cl, "Warp", { part: "0" });
  assert.equal(res.status, 302);
  const a = armyByHost(env.db, "warp")!;
  env.db.prepare("UPDATE armies SET credits = ? WHERE id = ?").run(credit, a.id);
  return { cl, key: cl.key!, id: a.id };
}

const get = (env: Env, cl: Client, path: string): Promise<Response> => {
  const at = env.at("warp", path);
  return cl.req(at.url, { host: at.host });
};
const loc = (mode: Mode, path: string): string => (mode === "path" ? `/a/warp${path}` : `http://warp.lvh.me:8080${path}`);
/** Freezes today's mission type (as the first HQ visit would) and unlocks the missions. */
const prepare = (env: Env, id: number, type: string, unlocked = true): void => {
  env.db.prepare("INSERT INTO daily(army_id, day, mission_type) VALUES (?, ?, ?) ON CONFLICT(army_id, day) DO UPDATE SET mission_type = excluded.mission_type").run(id, today(env), type);
  env.db.prepare("UPDATE armies SET missions_unlocked = ? WHERE id = ?").run(unlocked ? 1 : 0, id);
};
/** A strong roster (12 troopers of level 21). */
const strong = Array.from({ length: 12 }, (_, i) => ({ seed: 1_000_000 + i * 7919, name: `S${i}`, choices: new Array(20).fill(0).map((_, k) => k % 2) }));
const setTroopers = (env: Env, id: number, troopers: { seed: number; name: string; choices?: number[] }[]): void => {
  env.db.prepare("DELETE FROM troopers WHERE army_id = ?").run(id);
  const ins = env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?, ?, ?, ?, ?)");
  troopers.forEach((t, i) => ins.run(id, i, t.seed, t.name, JSON.stringify(t.choices ?? [])));
};

/** Flashvars of the battle embed of a page. */
function battleFlashvars(html: string): string {
  const part = html.split('<div id="swf_battle" class="swf"></div>')[1];
  assert.ok(part, "battle embed present");
  return JSON.parse(/flashvars : ("(?:[^"\\]|\\.)*")/.exec(part!)![1]!) as string;
}

/** Mission links of the HQ: [n, key]. */
const missionLinks = (html: string): { n: number; key: string; href: string }[] =>
  [...html.matchAll(/href="([^"]*\/b\/mission\?n=(\d+);chk=([A-Za-z0-9]{6}))"/g)].map((m) => ({ href: m[1]!, n: Number(m[2]), key: m[3]! }));

for (const mode of MODES) {
  test(`[${mode}] unlock: 5 credits once, a reloaded URL debits nothing, 4 credits are not enough; locked missions fight nothing`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env, 12);
    prepare(env, id, "exterminate", false);
    const hq = await (await get(env, cl, "/hq")).text();
    assert.ok(hq.includes('<h1 class="hbox">Mission : Exterminer</h1>'));
    assert.ok(hq.includes("url('/img/mode/attic.jpg')"));
    assert.ok(hq.includes(`href="${loc(mode, `/b/unlock?chk=${key}`)}"`), "unlock tile");
    assert.ok(hq.includes("Débloquer pour 5"));
    assert.equal(missionLinks(hq).length, 0);
    // locked: no battle
    const r0 = await get(env, cl, `/b/mission?n=0;chk=${key}`);
    assert.equal(r0.status, 302);
    assert.equal(r0.headers.get("location"), loc(mode, "/hq"));
    assert.equal(missions(env, id).length, 0);
    // wrong key: nothing
    await get(env, cl, "/b/unlock?chk=XXXXXX");
    assert.equal(credits(env, id), 12);
    const r1 = await get(env, cl, `/b/unlock?chk=${key}`);
    assert.equal(r1.status, 302);
    assert.equal(r1.headers.get("location"), loc(mode, "/hq"));
    assert.equal(credits(env, id), 7);
    await get(env, cl, `/b/unlock?chk=${key}`);
    await Promise.all([get(env, cl, `/b/unlock?chk=${key}`), get(env, cl, `/b/unlock?chk=${key}`)]);
    assert.equal(credits(env, id), 7);
    const after = await (await get(env, cl, "/hq")).text();
    assert.ok(!after.includes("Débloquer pour 5"));
    const links = missionLinks(after);
    assert.equal(links.length, 3);
    assert.ok(links.every((l) => l.n === 0 && l.key === key));
    assert.ok(after.includes("Il te reste 3 essais pour la mission du jour !"));
    assert.ok(after.includes("Nouvelle mission dans"));

    // 4 credits: refused
    const poor = setup(mode);
    const p = await warp(poor, 4);
    prepare(poor, p.id, "exterminate", false);
    const r2 = await get(poor, p.cl, `/b/unlock?chk=${p.key}`);
    assert.equal(r2.headers.get("location"), loc(mode, "/hq"));
    assert.equal(credits(poor, p.id), 4);
    assert.equal((poor.db.prepare("SELECT missions_unlocked FROM armies WHERE id = ?").get(p.id) as { missions_unlocked: number }).missions_unlocked, 0);
    assert.ok((await (await get(poor, p.cl, "/hq")).text()).includes("Pas assez d&#39;argent pour débloquer la mission."));
  });

  test(`[${mode}] exterminate: 3 defeats then the 4th try is refused; same rats each try`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    // 1 trooper of level 1 against 6 rats: lost
    env.db.prepare("UPDATE armies SET rats = 6 WHERE id = ?").run(id);
    prepare(env, id, "exterminate");
    for (let n = 0; n < 3; n++) {
      const r = await get(env, cl, `/b/mission?n=${n};chk=${key}`);
      assert.equal(r.status, 302);
      assert.equal(r.headers.get("location"), loc(mode, `/b/view/miss${n + 1}`));
    }
    const rows = missions(env, id);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => !won(r)), "6 rats beat a lone recruit");
    const inputs = rows.map((r) => JSON.parse(r.input) as BattleInput);
    assert.ok(inputs.every((x) => x.background.gfx === "bg/attic.jpg"));
    const rats = inputs.map((x) => JSON.stringify(x.armies[1]));
    assert.equal(rats[0], rats[1]);
    assert.equal(rats[1], rats[2]);
    assert.equal(inputs[0]!.armies[1].troopers.length, 6);
    assert.ok(inputs[0]!.armies[1].troopers.every((t) => t.name === "rat" && t.type === 2));
    assert.equal(credits(env, id), 100);
    assert.equal(daily(env, id)!.missions_used, 3);
    const r4 = await get(env, cl, `/b/mission?n=3;chk=${key}`);
    assert.equal(r4.headers.get("location"), loc(mode, "/hq"));
    assert.equal(missions(env, id).length, 3);
    // the HQ shows the 3 defeats, no try left
    const hq = await (await get(env, cl, "/hq")).text();
    assert.equal(missionLinks(hq).length, 0);
    for (const n of [1, 2, 3]) assert.ok(hq.includes(`href="${loc(mode, `/b/view/miss${n}`)}" class="b_bg bdefeat_bg"`));
    // the tooltip is a valid JS string: the apostrophe is escaped for JS, not only for HTML (which the browser decodes)
    assert.ok(hq.includes(`onmouseover="_.showTip('miss_tip','Ce combat s\\'est soldé par un échec !')"`));
    assert.ok(!hq.includes("s&#39;est soldé"));
    // first view of a defeat: failure message, back to the HQ, no button
    const page = await (await get(env, cl, "/b/view/miss2")).text();
    const dec = decodeBattleFlashvars(battleFlashvars(page));
    assert.deepEqual(dec.input, inputs[1]);
    assert.equal(dec.vars.endMsg, "Ce combat s'est soldé par un échec !");
    assert.ok(page.includes(`document.location = ${JSON.stringify(loc(mode, "/hq"))};`));
    assert.ok(!page.includes("<h1>"), "no title outside the infiltration");
    assert.ok(page.includes('<div class="swfframe ">'));
    assert.ok(!page.includes("Retour</a>"));
    const replay = await (await get(env, cl, "/b/view/miss2")).text();
    assert.ok(replay.includes(`<a href="${loc(mode, "/hq")}" class="button5">Retour</a>`));
    // not a mission of the day
    assert.equal((await get(env, cl, "/b/view/miss4")).headers.get("location"), loc(mode, "/hq"));
  });

  test(`[${mode}] exterminate won on the 1st try: +4, the 2nd try is refused, 2 rats the next day`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    setTroopers(env, id, strong);
    prepare(env, id, "exterminate");
    const r = await get(env, cl, `/b/mission?n=0;chk=${key}`);
    assert.equal(r.headers.get("location"), loc(mode, "/b/view/miss1"));
    const [row] = missions(env, id);
    assert.ok(won(row!), "12 troopers of level 21 beat one rat");
    assert.equal(JSON.parse(row!.input).armies[1].troopers.length, 1);
    assert.equal(credits(env, id), 104);
    assert.equal(daily(env, id)!.mission_won, 1);
    assert.equal((env.db.prepare("SELECT rats FROM armies WHERE id = ?").get(id) as { rats: number }).rats, 2);
    // the 2nd try is refused (a fresh n=1 URL); replaying n=0 shows the battle it made
    const r2 = await get(env, cl, `/b/mission?n=1;chk=${key}`);
    assert.equal(r2.headers.get("location"), loc(mode, "/hq"));
    const r3 = await get(env, cl, `/b/mission?n=0;chk=${key}`);
    assert.equal(r3.headers.get("location"), loc(mode, "/b/view/miss1"));
    assert.equal(missions(env, id).length, 1);
    assert.equal(credits(env, id), 104);
    // first view: victory message and the counter animation
    const page = await (await get(env, cl, "/b/view/miss1")).text();
    const dec = decodeBattleFlashvars(battleFlashvars(page));
    assert.deepEqual(dec.input, JSON.parse(row!.input));
    assert.equal(dec.vars.endMsg, "Tu as remporté la mission du jour ! Ton armée gagne +4 [T]");
    assert.ok(page.includes(`document.location = ${JSON.stringify(loc(mode, "/hq?money=4"))};`));
    const replay = await (await get(env, cl, "/b/view/miss1")).text();
    assert.equal(decodeBattleFlashvars(battleFlashvars(replay)).vars.endMsg, "Tu as remporté ce combat !");
    assert.ok(replay.includes(`document.location = ${JSON.stringify(loc(mode, "/hq"))};`));
    // HQ: the win tile, no try left
    const hq = await (await get(env, cl, "/hq")).text();
    assert.ok(hq.includes(`href="${loc(mode, "/b/view/miss1")}" class="b_bg bwin_bg" onmouseover="_.showTip('miss_tip','Tu as remporté la mission du jour !')"`));
    assert.equal(missionLinks(hq).length, 0);
    assert.ok(hq.includes('<div class="action bcount1">'));
    // next day: 2 rats
    env.clock.t += 86_400_000;
    prepare(env, id, "exterminate");
    await get(env, cl, `/b/mission?n=0;chk=${key}`);
    const next = missions(env, id);
    assert.equal(next.length, 2);
    assert.equal(JSON.parse(next[1]!.input).armies[1].troopers.length, 2);
  });

  test(`[${mode}] infiltrate: the same stored target for the 3 tries, title on the page`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    const a = army(env, "alpha", strong);
    army(env, "beta", strong);
    prepare(env, id, "infiltrate");
    for (let n = 0; n < 3; n++) await get(env, cl, `/b/mission?n=${n};chk=${key}`);
    const rows = missions(env, id);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => !won(r)));
    const target = rows[0]!.defender_id;
    assert.ok(target !== null && target !== id);
    assert.ok(rows.every((r) => r.defender_id === target && r.mode === "infiltrate"));
    assert.equal(daily(env, id)!.mission_target, String(target));
    const input = JSON.parse(rows[0]!.input) as BattleInput;
    assert.equal(input.background.gfx, "bg/sewer.jpg");
    assert.deepEqual(input.armies[1].troopers.map((t) => t.id), [...Array(12).keys()]);
    assert.deepEqual(input.armies[0].spawnOrder, [12]);
    const page = await (await get(env, cl, "/b/view/miss1")).text();
    const name = target === a ? "alpha" : "beta";
    assert.ok(page.includes(`<div class="swfframe nam "><h1>\nInfiltrer la base de L&#39;armée de ${name}\n</h1>`));
  });

  test(`[${mode}] infiltrate without any other army: a generated army of the own power`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    prepare(env, id, "infiltrate");
    await get(env, cl, `/b/mission?n=0;chk=${key}`);
    const [row] = missions(env, id);
    assert.ok(row);
    assert.equal(row.defender_id, null);
    assert.match(row.defender_ref!, /^filler:5:\d+$/);
    assert.equal(daily(env, id)!.mission_target, row.defender_ref);
  });

  test(`[${mode}] epic: 12 troopers + 25 confirmed recruits fight 32 against the NPC army`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    setTroopers(env, id, strong);
    for (let i = 0; i < 25; i++) {
      const r = army(env, `rec${i}`, [{ seed: 2_000_000 + i, name: `R${i}`, choices: new Array(i % 7).fill(0) }], { recruiterId: id });
      env.db.prepare("UPDATE armies SET recruit_confirmed_at = ? WHERE id = ?").run(env.clock.t, r);
    }
    army(env, "pending", [{ seed: 3_000_000, name: "P" }], { recruiterId: id }); // not confirmed: left out
    prepare(env, id, "epic");
    const r = await get(env, cl, `/b/mission?n=0;chk=${key}`);
    assert.equal(r.headers.get("location"), loc(mode, "/b/view/miss1"));
    const [row] = missions(env, id);
    const input = JSON.parse(row!.input) as BattleInput;
    assert.equal(input.background.gfx, "bg/road.jpg");
    const mine = input.armies[0];
    assert.equal(mine.troopers.length, 32);
    assert.deepEqual(mine.spawnOrder, [...Array(12).keys()]);
    assert.deepEqual(mine.troopers.slice(0, 12).map((t) => t.name), strong.map((t) => t.name));
    const rec = mine.troopers.slice(12);
    assert.ok(rec.every((t) => t.pref === null && t.name.startsWith("R")));
    const levels = rec.map((t) => t.choices.length);
    assert.deepEqual(levels, [...levels].sort((x, y) => y - x), "recruits by level, highest first");
    const npc = input.armies[1];
    assert.ok(npc.troopers.length >= 32 && npc.troopers.length <= 100);
    assert.deepEqual(npc.spawnOrder, []);
    assert.equal(npc.troopers[0]!.id, 32);
  });

  test(`[${mode}] concurrent requests on the same mission URL fight once`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    prepare(env, id, "exterminate");
    const all = await Promise.all(Array.from({ length: 5 }, () => get(env, cl, `/b/mission?n=0;chk=${key}`)));
    assert.ok(all.every((r) => r.headers.get("location") === loc(mode, "/b/view/miss1")));
    assert.equal(missions(env, id).length, 1);
    assert.equal(daily(env, id)!.missions_used, 1);
  });

  test(`[${mode}] the day changes at midnight: counter back to 0, a new type is drawn`, async () => {
    const env = setup(mode);
    env.clock.t = Date.parse("2026-11-23T22:59:59Z"); // 23:59:59 in Paris
    const { cl, key, id } = await warp(env);
    env.db.prepare("UPDATE armies SET missions_unlocked = 1 WHERE id = ?").run(id);
    await get(env, cl, "/hq"); // first visit: the type is drawn and frozen
    const first = daily(env, id)!;
    assert.ok(["exterminate", "infiltrate"].includes(first.mission_type!));
    await get(env, cl, `/b/mission?n=0;chk=${key}`);
    assert.equal(daily(env, id)!.missions_used, 1);
    env.clock.t = Date.parse("2026-11-23T23:00:01Z"); // 00:00:01
    const hq = await (await get(env, cl, "/hq")).text();
    const links = missionLinks(hq);
    assert.equal(links.length, 3);
    assert.ok(links.every((l) => l.n === 0));
    const fresh = daily(env, id, "2026-11-24")!;
    assert.equal(fresh.missions_used, 0);
    assert.ok(fresh.mission_type !== null);
    await get(env, cl, `/b/mission?n=0;chk=${key}`);
    assert.equal(daily(env, id, "2026-11-24")!.missions_used, 1);
  });

  test(`[${mode}] a stranger cannot fight or view the missions`, async () => {
    const env = setup(mode);
    const { key, id } = await warp(env);
    prepare(env, id, "exterminate");
    const other = env.client("2.2.2.2");
    const r = await get(env, other, `/b/mission?n=0;chk=${key}`);
    assert.equal(r.status, 302);
    assert.equal(missions(env, id).length, 0);
    const u = await get(env, other, `/b/unlock?chk=${key}`);
    assert.equal(u.status, 302);
  });
}
