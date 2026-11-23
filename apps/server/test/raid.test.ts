import { test } from "node:test";
import assert from "node:assert/strict";
import { RAID_MAX_PHASE, dayKey } from "@mt/game";
import { armyPower, type BattleInput } from "@mt/engine";
import { armyByHost, createArmy, fightRaid, raidRecruits, type NewModeBattle, type RaidRecruit } from "../src/repo.ts";
import { create, setup, type Client, type Env, type Mode } from "./helpers.ts";
import { decodeBattleFlashvars } from "./hxdecode.ts";

const MODES: Mode[] = ["path", "subdomain"];

const today = (env: Env): string => dayKey(new Date(env.clock.t), "Europe/Paris");
const credits = (env: Env, id: number): number => (env.db.prepare("SELECT credits FROM armies WHERE id = ?").get(id) as { credits: number }).credits;
type Row = { id: number; kind: string; mode: string; phase: number; input: string; winner: number | null; day: string };
const raids = (env: Env, id: number): Row[] => env.db.prepare("SELECT * FROM battles WHERE attacker_id = ? AND kind = 'raid' ORDER BY id").all(id) as unknown as Row[];
const won = (r: Row): boolean => r.winner !== null && r.winner === (JSON.parse(r.input) as BattleInput).attackerSide;
type Daily = { raid_phase: number; raid_dead: string; raid_over: number };
const daily = (env: Env, id: number, day = today(env)): Daily | undefined =>
  env.db.prepare("SELECT raid_phase, raid_dead, raid_over FROM daily WHERE army_id = ? AND day = ?").get(id, day) as Daily | undefined;

type T = { seed: number; name: string; choices?: number[] };
/** A stored army made directly: `troopers[i]` goes to slot i. */
function army(env: Env, host: string, troopers: T[], o: { recruiterId?: number | null; confirmed?: boolean } = {}): number {
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
  if (o.confirmed !== false && o.recruiterId) env.db.prepare("UPDATE armies SET recruit_confirmed_at = ? WHERE id = ?").run(env.clock.t, r.army.id);
  return r.army.id;
}
/** A confirmed recruit of `of` whose first trooper has `level` (and a second trooper that never fights). */
const recruit = (env: Env, of: number, host: string, level: number, seed: number): number =>
  army(env, host, [{ seed, name: host.toUpperCase(), choices: Array.from({ length: level - 1 }, (_, k) => k % 2) }, { seed: seed + 1, name: "Second" }], { recruiterId: of });

async function warp(env: Env) {
  const cl = env.client();
  const res = await create(env, cl, "Warp", { part: "0" });
  assert.equal(res.status, 302);
  const a = armyByHost(env.db, "warp")!;
  env.db.prepare("UPDATE armies SET credits = 100 WHERE id = ?").run(a.id);
  return { cl, key: cl.key!, id: a.id, faction: a.faction };
}

const get = (env: Env, cl: Client, path: string): Promise<Response> => {
  const at = env.at("warp", path);
  return cl.req(at.url, { host: at.host });
};
const loc = (mode: Mode, path: string): string => (mode === "path" ? `/a/warp${path}` : `http://warp.lvh.me:8080${path}`);

function battleFlashvars(html: string): string {
  const part = html.split('<div id="swf_battle" class="swf"></div>')[1];
  assert.ok(part, "battle embed present");
  return JSON.parse(/flashvars : ("(?:[^"\\]|\\.)*")/.exec(part!)![1]!) as string;
}

/** Raid launch links of the HQ. */
const raidLinks = (html: string): { phase: number; key: string }[] =>
  [...html.matchAll(/href="[^"]*\/b\/raid\?phase=(\d+);chk=([A-Za-z0-9]{6})"/g)].map((m) => ({ phase: Number(m[1]), key: m[2]! }));


// ---- repo ------------------------------------------------------------------------------------------------------

test("raidRecruits: first trooper of the confirmed recruits, lowest level first (then recruitment order), pref null", async () => {
  const env = setup();
  const { id } = await warp(env);
  assert.deepEqual(raidRecruits(env.db, id), []);
  const c = recruit(env, id, "cee", 3, 100);
  const a = recruit(env, id, "aaa", 1, 200);
  const b = recruit(env, id, "bee", 2, 300);
  const a2 = recruit(env, id, "aaa2", 1, 400);
  army(env, "pending", [{ seed: 500, name: "P" }], { recruiterId: id, confirmed: false });
  env.db.prepare("UPDATE troopers SET pref = ? WHERE army_id = ?").run(JSON.stringify({ CWeapon: 1 }), c);
  const r = raidRecruits(env.db, id);
  assert.deepEqual(r.map((x) => x.recruitArmyId), [a, a2, b, c]);
  assert.deepEqual(r.map((x) => x.trooper.name), ["AAA", "AAA2", "BEE", "CEE"]);
  assert.deepEqual(r.map((x) => x.trooper.choices.length), [0, 0, 1, 2]);
  assert.ok(r.every((x) => x.trooper.pref === null));
});

/** A stub raid battle: the recruits win (or lose), the given recruits die. */
const stub = (win: boolean, dead: number[] = []) => (alive: RaidRecruit[]): NewModeBattle => {
  assert.ok(alive.length > 0);
  const input = { seed: 1, background: { gfx: "bg/wood.jpg", id: 4 }, armies: [], attackerSide: 0 } as unknown as BattleInput;
  return { mode: "raid", defenderId: null, defenderRef: null, input, winner: win ? 0 : 1, reward: win ? 4 : 0, dead };
};

test("fightRaid: 20 won phases close the raid; the 21st phase is never fought; stale phases fight nothing", async () => {
  const env = setup();
  const { id } = await warp(env);
  const day = today(env);
  assert.deepEqual(fightRaid(env.db, { armyId: id, day, phase: 1, decide: stub(true) }), { ok: false, reason: "refused", code: "none" });
  recruit(env, id, "rone", 5, 10);
  const r2 = recruit(env, id, "rtwo", 5, 20);
  let calls = 0;
  for (let p = 1; p <= RAID_MAX_PHASE; p++) {
    const r = fightRaid(env.db, { armyId: id, day, phase: p, decide: (alive) => (calls++, stub(true, p === 1 ? [r2] : [])(alive)) });
    assert.equal(r.ok, true, `phase ${p}`);
  }
  assert.equal(calls, RAID_MAX_PHASE);
  assert.equal(credits(env, id), 100 + 4 * RAID_MAX_PHASE);
  const d = daily(env, id)!;
  assert.equal(d.raid_over, 1);
  assert.equal(d.raid_phase, RAID_MAX_PHASE);
  assert.deepEqual(JSON.parse(d.raid_dead), [r2]);
  const rows = raids(env, id);
  assert.deepEqual(rows.map((r) => r.phase), Array.from({ length: RAID_MAX_PHASE }, (_, i) => i + 1));
  assert.ok(rows.every((r) => r.mode === "raid"));
  // the 21st phase and any replay: nothing
  for (const p of [RAID_MAX_PHASE + 1, RAID_MAX_PHASE, 3]) {
    const r = fightRaid(env.db, { armyId: id, day, phase: p, decide: (alive) => (calls++, stub(true)(alive)) });
    assert.equal(r.ok, false);
  }
  assert.equal(calls, RAID_MAX_PHASE);
  assert.equal(raids(env, id).length, RAID_MAX_PHASE);
});

test("fightRaid: the dead recruits are left out of the next phase; a defeat closes the raid", async () => {
  const env = setup();
  const { id } = await warp(env);
  const day = today(env);
  const r1 = recruit(env, id, "rone", 5, 10);
  const r2 = recruit(env, id, "rtwo", 6, 20);
  assert.equal(fightRaid(env.db, { armyId: id, day, phase: 1, decide: stub(true, [r1]) }).ok, true);
  let seen: number[] = [];
  const r = fightRaid(env.db, { armyId: id, day, phase: 2, decide: (alive) => ((seen = alive.map((x) => x.recruitArmyId)), stub(false, [r2])(alive)) });
  assert.equal(r.ok, true);
  assert.deepEqual(seen, [r2]);
  const d = daily(env, id)!;
  assert.deepEqual({ phase: d.raid_phase, over: d.raid_over, dead: JSON.parse(d.raid_dead) }, { phase: 2, over: 1, dead: [r1, r2] });
  assert.equal(credits(env, id), 104);
  assert.equal(fightRaid(env.db, { armyId: id, day, phase: 2, decide: stub(true) }).ok, false);
});

// ---- routes ----------------------------------------------------------------------------------------------------

/** A level-21 roster entry. */
const STRONG = 21;

for (const mode of MODES) {
  test(`[${mode}] no confirmed recruit: no raid, the HQ asks to recruit`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    army(env, "pending", [{ seed: 500, name: "P" }], { recruiterId: id, confirmed: false });
    const r = await get(env, cl, `/b/raid?phase=1;chk=${key}`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), loc(mode, "/hq"));
    assert.equal(raids(env, id).length, 0);
    const hq = await (await get(env, cl, "/hq")).text();
    assert.ok(hq.includes(`url('/img/mode/wood.jpg')"><h1 class="hbox">Raid</h1>`));
    assert.ok(hq.includes("Recrute tes amis pour lancer un raid !"));
    assert.equal(raidLinks(hq).length, 0);
    assert.ok(!hq.includes("Bientôt disponible !"));
    // the view without a raid: back to the HQ
    assert.equal((await get(env, cl, "/b/view/raid")).headers.get("location"), loc(mode, "/hq"));
  });

  test(`[${mode}] recruits of levels 3, 1, 2 attack in level order against the phase-1 NPC army (power 11)`, async () => {
    const env = setup(mode);
    const { cl, key, id, faction } = await warp(env);
    recruit(env, id, "cee", 3, 100);
    recruit(env, id, "aaa", 1, 200);
    recruit(env, id, "bee", 2, 300);
    const hq = await (await get(env, cl, "/hq")).text();
    assert.ok(hq.includes('<h1 class="hbox">Raid</h1>'));
    assert.ok(hq.includes("&lt;h1&gt;Recrues Disponibles&lt;/h1&gt;Pour chaque armée que tu recrutes, son premier trooper sera disponible pour le Raid jusqu&amp;#39;à ce qu&amp;#39;il soit tué en combat ! &lt;/div&gt;"));
    assert.match(hq, /onmouseout="mt\.js\.Tip\.hide\(\)">3\n<img src="\/favicon\.ico"\/><\/div>/);
    assert.ok(hq.includes(`<div class="b bgo"><div class="b_right bgo_right"><a href="${loc(mode, `/b/raid?phase=1;chk=${key}`)}" class="b_bg bgo_bg" onmouseover="_.showTip('raid_tip','Lancer un raid avec les 3 recrues encore vivantes !')" onmouseout="_.resetTip('raid_tip')"><img src="/img/bgo.gif"/></a></div></div>`));
    assert.ok(hq.includes('<span id="raid_tip">Encore 3 recrues disponibles pour le raid !</span>'));
    assert.deepEqual(raidLinks(hq), [{ phase: 1, key }]);
    const r = await get(env, cl, `/b/raid?phase=1;chk=${key}`);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), loc(mode, "/b/view/raid"));
    const [row] = raids(env, id);
    assert.ok(row);
    assert.equal(row.phase, 1);
    const input = JSON.parse(row.input) as BattleInput;
    assert.equal(input.background.gfx, "bg/wood.jpg");
    const [mine, npc] = input.armies;
    assert.equal(mine.faction, faction);
    assert.deepEqual(mine.troopers.map((t) => t.name), ["AAA", "BEE", "CEE"]);
    assert.ok(mine.troopers.every((t) => t.pref === null));
    assert.deepEqual(mine.spawnOrder, []);
    const m = npc.troopers.length;
    assert.ok(m === 1 || m === 2, `NPC count ${m}`);
    assert.deepEqual(npc.troopers.map((t) => t.id), [...Array(m).keys()]);
    assert.equal(armyPower(npc.troopers), 11);
    assert.deepEqual(mine.troopers.map((t) => t.id), [m, m + 1, m + 2]);
  });

  test(`[${mode}] victory: +4, phase 2, the dead stay dead, a replayed phase-1 URL fights nothing`, async () => {
    const env = setup(mode, {}, { battleSeed: () => 4242 });
    const { cl, key, id } = await warp(env);
    const recs = [recruit(env, id, "weak", 1, 7), recruit(env, id, "hero", STRONG, 1_000_000), recruit(env, id, "hera", STRONG, 1_007_919)];
    const r = await get(env, cl, `/b/raid?phase=1;chk=${key}`);
    assert.equal(r.headers.get("location"), loc(mode, "/b/view/raid"));
    const [row] = raids(env, id);
    assert.ok(won(row!), "two level-21 recruits beat power 11");
    assert.equal(credits(env, id), 104);
    const d = daily(env, id)!;
    assert.equal(d.raid_phase, 2);
    assert.equal(d.raid_over, 0);
    const dead = JSON.parse(d.raid_dead) as number[];
    const input = JSON.parse(row!.input) as BattleInput;
    assert.ok(dead.every((x) => recs.includes(x)));
    // first view: the archived message, the counter animation; flashvars = stored input
    const page = await (await get(env, cl, "/b/view/raid")).text();
    const dec = decodeBattleFlashvars(battleFlashvars(page));
    assert.deepEqual(dec.input, input);
    assert.equal(dec.vars.endMsg, "Félicitations, tu as remporté le raid ! Ton armée gagne +4 [T] et tu peut tenter le raid suivant.");
    assert.ok(page.includes(`document.location = ${JSON.stringify(loc(mode, "/hq?money=4"))};`));
    assert.ok(!page.includes("<h1>"));
    assert.ok(!page.includes("Retour</a>"));
    const replay = await (await get(env, cl, "/b/view/raid")).text();
    assert.equal(decodeBattleFlashvars(battleFlashvars(replay)).vars.endMsg, "Tu as remporté ce combat !");
    assert.ok(replay.includes(`<a href="${loc(mode, "/hq")}" class="button5">Retour</a>`));
    // HQ: phase 2
    const alive = recs.length - dead.length;
    const hq = await (await get(env, cl, "/hq")).text();
    assert.ok(hq.includes('<h1 class="hbox">Raid Phase 2</h1>'));
    assert.deepEqual(raidLinks(hq), [{ phase: 2, key }]);
    assert.ok(hq.includes(`Encore ${alive} recrues disponibles pour le raid !`));
    // the phase-1 URL replayed: no battle, the raid it made
    const again = await get(env, cl, `/b/raid?phase=1;chk=${key}`);
    assert.equal(again.headers.get("location"), loc(mode, "/b/view/raid"));
    assert.equal(raids(env, id).length, 1);
    assert.equal(credits(env, id), 104);
    // phase 2: without the dead
    await get(env, cl, `/b/raid?phase=2;chk=${key}`);
    const rows = raids(env, id);
    assert.equal(rows.length, 2);
    assert.equal(rows[1]!.phase, 2);
    const names = (JSON.parse(rows[1]!.input) as BattleInput).armies[0].troopers.map((t) => t.name);
    assert.equal(names.length, alive);
    const NAMES = ["WEAK", "HERO", "HERA"];
    for (const x of dead) assert.ok(!names.includes(NAMES[recs.indexOf(x)]!));
  });

  test(`[${mode}] the weak recruit killed in phase 1 is gone in phase 2`, async () => {
    const env = setup(mode, {}, { battleSeed: () => 42 });
    const { cl, key, id } = await warp(env);
    const weak = recruit(env, id, "weak", 1, 7);
    recruit(env, id, "hero", STRONG, 1_000_000);
    recruit(env, id, "hera", STRONG, 1_007_919);
    await get(env, cl, `/b/raid?phase=1;chk=${key}`);
    const [row] = raids(env, id);
    assert.ok(won(row!));
    // tuned: in this battle the level-1 recruit dies
    assert.deepEqual(JSON.parse(daily(env, id)!.raid_dead), [weak]);
    await get(env, cl, `/b/raid?phase=2;chk=${key}`);
    const names = (JSON.parse(raids(env, id)[1]!.input) as BattleInput).armies[0].troopers.map((t) => t.name);
    assert.deepEqual(names, ["HERO", "HERA"]);
  });

  test(`[${mode}] defeat: the raid is over until tomorrow, then phase 1 with every recruit`, async () => {
    const env = setup(mode, {}, { battleSeed: () => 4242 });
    const { cl, key, id } = await warp(env);
    const weak = recruit(env, id, "weak", 1, 7);
    const r = await get(env, cl, `/b/raid?phase=1;chk=${key}`);
    assert.equal(r.headers.get("location"), loc(mode, "/b/view/raid"));
    const [row] = raids(env, id);
    assert.ok(!won(row!), "a lone level-1 recruit loses against power 11");
    assert.equal(credits(env, id), 100);
    const d = daily(env, id)!;
    assert.equal(d.raid_over, 1);
    assert.equal(d.raid_phase, 1);
    assert.deepEqual(JSON.parse(d.raid_dead), [weak]);
    const page = await (await get(env, cl, "/b/view/raid")).text();
    assert.equal(decodeBattleFlashvars(battleFlashvars(page)).vars.endMsg, "Ce combat s'est soldé par un échec !");
    assert.ok(page.includes(`document.location = ${JSON.stringify(loc(mode, "/hq"))};`));
    const hq = await (await get(env, cl, "/hq")).text();
    assert.equal(raidLinks(hq).length, 0);
    assert.ok(!hq.includes('class="b bgo"'));
    assert.ok(hq.includes(`<a href="${loc(mode, "/b/view/raid")}" class="b_bg bdefeat_bg"`));
    assert.ok(hq.includes("Nouveau raid dans"));
    // replayed: nothing
    await get(env, cl, `/b/raid?phase=1;chk=${key}`);
    assert.equal(raids(env, id).length, 1);
    // next day: phase 1, every recruit alive
    env.clock.t += 86_400_000;
    const next = await (await get(env, cl, "/hq")).text();
    assert.deepEqual(raidLinks(next), [{ phase: 1, key }]);
    assert.ok(next.includes("Encore 1 recrues disponibles pour le raid !"));
    await get(env, cl, `/b/raid?phase=1;chk=${key}`);
    assert.equal(raids(env, id).length, 2);
    assert.equal(raids(env, id)[1]!.day, today(env));
  });

  test(`[${mode}] concurrent requests fight once; wrong key or stranger fight nothing`, async () => {
    const env = setup(mode);
    const { cl, key, id } = await warp(env);
    recruit(env, id, "hero", STRONG, 1_000_000);
    const other = env.client("2.2.2.2");
    await get(env, other, `/b/raid?phase=1;chk=${key}`);
    await get(env, cl, "/b/raid?phase=1;chk=XXXXXX");
    assert.equal(raids(env, id).length, 0);
    const all = await Promise.all(Array.from({ length: 5 }, () => get(env, cl, `/b/raid?phase=1;chk=${key}`)));
    assert.ok(all.every((r) => r.headers.get("location") === loc(mode, "/b/view/raid")));
    assert.equal(raids(env, id).length, 1);
  });
}

test("HQ raid box: won out (20 phases) and protected views", async () => {
  const { hqPage } = await import("../src/views/hq.ts");
  const env = setup("path");
  const army = { id: 1, host: "nsun", name: "nSun", part: 5, faction: 1, credits: 241, recruiterId: null, createdAt: 0, createdIp: null, passwordHash: null, isFaction: false, createdCid: null, missionsUnlocked: false, rats: 1, epicWins: 0 };
  const mission = { type: "infiltrate" as const, unlocked: false, tries: [], key: "ABCDEF" };
  const base = { army, troopers: [], power: 99, battles: [], battleTotal: 3, resetIn: 100, nextBounty: 50, moneyDelta: 0, notice: null, mission };
  const done = String(hqPage(env.cfg, { ...base, locked: false, raid: { phase: RAID_MAX_PHASE, alive: 4, over: true, lastWin: true, key: "ABCDEF" } }));
  assert.ok(done.includes(`<h1 class="hbox">Raid Phase ${RAID_MAX_PHASE}</h1>`));
  assert.ok(done.includes(`<a href="/a/nsun/b/view/raid" class="b_bg bwin_bg" onmouseover="_.showTip('raid_tip','Tu as remporté le raid !')"`));
  assert.ok(done.includes('<span id="raid_tip">Nouveau raid dans'));
  assert.equal(raidLinks(done).length, 0);
  const locked = String(hqPage(env.cfg, { ...base, locked: true, raid: { phase: 2, alive: 2, over: false, lastWin: false, key: "" } }));
  assert.ok(locked.includes(`<h1 class="hbox">Raid Phase 2</h1>\n<div class="box2bottom"><div class="action bcount1"></div></div></div></div>`));
});
