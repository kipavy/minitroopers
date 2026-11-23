import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SKILLS, defaultLeftOver, describeTrooper, levelUpOptions, type BattleInput, type BattleTrooperInput } from "@mt/engine";
import { FACTIONS, MISSION_ATTEMPTS, battleAllowance, dayKey, dayRats, factionBattleArmy, ratArmy, seedsOffering } from "@mt/game";
import { openDb } from "../src/db.ts";
import { verifyPassword } from "../src/password.ts";
import { SpecError, buildTroopers } from "../src/admin/army.ts";
import { seedFactions } from "../src/admin/factions.ts";
import {
  addCredits, armyById, armyByHost, battleOfDay, battlesCounted, battlesOfDay, battlesUsed, fight, fightMission, fightRaid, insertArmy, armySummaries, missionDay,
  missionsOfDay, raidDay, renameArmy, resetDay, troopersOf, trooperInput, dayOpponents, type NewBattle, type NewModeBattle,
} from "../src/repo.ts";
import { foeByName } from "../src/foes.ts";
import { create, setup } from "./helpers.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const CLI = join(REPO, "apps/server/src/admin/cli.ts");
const NAMES = new Map(Object.entries(SKILLS).map(([k, v]) => [v as number, k]));

test("seedFactions stores every faction once, as factionBattleArmy builds it; idempotent", () => {
  const db = openDb(":memory:");
  const first = seedFactions(db, 1);
  assert.deepEqual(first.created, FACTIONS.map((f) => f.host));
  assert.deepEqual(seedFactions(db, 2), { created: [], existing: FACTIONS.map((f) => f.host) });
  assert.equal(armySummaries(db).length, FACTIONS.length);
  for (const f of FACTIONS) {
    const a = armyByHost(db, f.host)!;
    assert.equal(a.isFaction, true);
    assert.equal(a.passwordHash, null);
    assert.equal(a.faction, f.id);
    assert.deepEqual(troopersOf(db, a.id).map(trooperInput), factionBattleArmy(f).troopers);
    assert.deepEqual(foeByName(db, f.name)!.army, factionBattleArmy(f));
  }
});

/** Level-ups picking the first shown option each time: [skills, choices]. */
function firstPicks(seed: number, n: number): { skills: number[]; choices: number[] } {
  const t: BattleTrooperInput = { id: 0, name: "X", seed, type: 0, choices: [], force: [], pref: null };
  const skills: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = levelUpOptions(t);
    skills.push(o.shown[0]!);
    t.choices.push(o.drawn.indexOf(o.shown[0]!));
  }
  return { skills, choices: t.choices };
}

test("buildTroopers: skills (ids or names) replay the level-ups; choices are raw shown-option indexes", () => {
  const p = firstPicks(1234567, 9);
  const viaSkills = buildTroopers(JSON.stringify([{ seed: 1234567, name: "Rambo", skills: p.skills.map((s, i) => (i % 2 ? NAMES.get(s)!.toLowerCase() : s)) }]));
  const viaChoices = buildTroopers(JSON.stringify([{ seed: 1234567, name: "Rambo", choices: p.choices }]));
  assert.deepEqual(viaSkills, viaChoices);
  assert.deepEqual(viaSkills[0]!.choices, p.choices);
  const left = defaultLeftOver({ id: 0, name: "Rambo", seed: 1234567, type: 0, choices: p.choices, force: [], pref: null });
  assert.deepEqual(viaSkills[0]!.leftOver, left.length > 0 ? left : null);
  assert.deepEqual(buildTroopers('[{"seed":7,"name":"Solo"}]'), [{ seed: 7, name: "Solo", choices: [], leftOver: null }]);
});

test("buildTroopers refuses what the game could not produce", () => {
  const offered = levelUpOptions({ id: 0, name: "X", seed: 1234567, type: 0, choices: [], force: [], pref: null }).shown;
  const notOffered = Object.values(SKILLS).find((s) => !offered.includes(s as number))!;
  const bad = [
    "nope",
    "[]",
    JSON.stringify(new Array(13).fill(0).map((_, i) => ({ seed: i + 1, name: `T${i}` }))),
    '[{"seed":0,"name":"A"}]',
    '[{"seed":1.5,"name":"A"}]',
    '[{"seed":1,"name":""}]',
    '[{"seed":1,"name":"Beaucoup trop long"}]',
    '[{"seed":1,"name":"A"},{"seed":1,"name":"B"}]',
    '[{"seed":1,"name":"A","skills":[],"choices":[]}]',
    `[{"seed":1234567,"name":"A","skills":[${notOffered}]}]`,
    '[{"seed":1234567,"name":"A","skills":["NOT_A_SKILL"]}]',
    `[{"seed":1234567,"name":"A","choices":[${offered.length}]}]`,
    '[{"seed":1234567,"name":"A","choices":[-1]}]',
  ];
  for (const b of bad) assert.throws(() => buildTroopers(b), SpecError, b);
});

test("addCredits never goes below 0; unknown army is null", () => {
  const db = openDb(":memory:");
  seedFactions(db, 1);
  const id = armyByHost(db, "sang-surs")!.id;
  assert.equal(addCredits(db, id, 30), 30);
  assert.equal(addCredits(db, id, -50), 0);
  assert.equal(addCredits(db, 9999, 1), null);
});

test("a faction army is never opened by name: login goes to its recruit page", async () => {
  for (const mode of ["path", "subdomain"] as const) {
    const env = setup(mode);
    seedFactions(env.db, env.clock.t);
    const cl = env.client();
    const res = await cl.req("/login", { form: { login: "Sang-surs" } });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), mode === "path" ? "/a/sang-surs/" : "http://sang-surs.lvh.me:8080/");
    assert.equal(cl.cookies.ssid, undefined); // not logged in: no session at all
  }
});

function cli(dataDir: string, ...args: string[]) {
  return cliEnv(dataDir, {}, ...args);
}
function cliEnv(dataDir: string, env: Record<string, string>, ...args: string[]) {
  const base = { ...process.env };
  delete base.MT_ARMY_PASSWORD;
  return spawnSync(process.execPath, [CLI, ...args], { env: { ...base, DATA_DIR: dataDir, ...env }, encoding: "utf8" });
}

test("admin CLI: seed-factions, create-army, give-credits, list, errors", () => {
  mkdirSync(join(REPO, "var"), { recursive: true });
  const dir = mkdtempSync(join(REPO, "var", "admin-test-"));
  try {
    const s1 = cli(dir, "seed-factions");
    assert.equal(s1.status, 0, s1.stderr);
    assert.match(s1.stdout, /Factions créées : sang-surs, /);
    assert.match(cli(dir, "seed-factions").stdout, /Factions créées : aucune/);

    const p = firstPicks(2222222, 3);
    const file = join(dir, "troopers.json");
    writeFileSync(file, JSON.stringify([{ seed: 2222222, name: "Malin", skills: p.skills }, { seed: 3333333, name: "Bleu" }]));
    const c = cli(dir, "create-army", "--name", "Rats Morts", "--part", "4", "--faction", "2", "--credits", "15", "--password", "secret", "--troopers", `@${file}`);
    assert.equal(c.status, 0, c.stderr);
    assert.match(c.stdout, /Armée créée : rats-morts .*2 troopers, niveaux 4, 1/);
    const dup = cli(dir, "create-army", "--name", "Rats Morts", "--troopers", '[{"seed":5,"name":"X"}]');
    assert.equal(dup.status, 1);
    assert.match(dup.stderr, /existe déjà/);
    const badSkill = cli(dir, "create-army", "--name", "Autre", "--troopers", '[{"seed":5,"name":"X","skills":["NOPE"]}]');
    assert.equal(badSkill.status, 1);
    assert.match(badSkill.stderr, /compétence inconnue/);

    const g = cli(dir, "give-credits", "--army", "Rats Morts", "--amount", "10");
    assert.equal(g.status, 0, g.stderr);
    assert.match(g.stdout, /rats-morts : 25 crédits/);
    assert.equal(cli(dir, "give-credits", "--army", "Inconnue", "--amount", "1").status, 1);
    assert.equal(cli(dir, "give-credits", "--army", "Rats Morts", "--amount", "x").status, 1);

    const l = cli(dir, "list");
    assert.equal(l.status, 0, l.stderr);
    assert.match(l.stdout, /rats-morts\tL'armée des Rats Morts\tfaction 2\t25 crédits\t2 troopers\tpuissance 13\tprotégée/);
    assert.match(l.stdout, /sang-surs\t.*\tfaction$/m);

    const db = openDb(join(dir, "minitroopers.db"));
    const a = armyByHost(db, "rats-morts")!;
    assert.deepEqual(troopersOf(db, a.id).map((t) => [t.slot, t.seed, t.choices]), [[0, 2222222, p.choices], [1, 3333333, []]]);
    db.close();

    // password: never empty; MT_ARMY_PASSWORD keeps it out of `ps` and the shell history
    const empty = cli(dir, "create-army", "--name", "Vide", "--password", "", "--troopers", '[{"seed":5,"name":"X"}]');
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /mot de passe.*vide/i);
    const emptyEnv = cliEnv(dir, { MT_ARMY_PASSWORD: "" }, "create-army", "--name", "Vide", "--troopers", '[{"seed":5,"name":"X"}]');
    assert.equal(emptyEnv.status, 1);
    assert.match(emptyEnv.stderr, /MT_ARMY_PASSWORD.*vide/i);
    const envPass = cliEnv(dir, { MT_ARMY_PASSWORD: "from-env" }, "create-army", "--name", "Secrete", "--troopers", '[{"seed":5,"name":"X"}]');
    assert.equal(envPass.status, 0, envPass.stderr);
    const both = cliEnv(dir, { MT_ARMY_PASSWORD: "from-env" }, "create-army", "--name", "Double", "--password", "x", "--troopers", '[{"seed":5,"name":"X"}]');
    assert.equal(both.status, 1);
    assert.match(both.stderr, /MT_ARMY_PASSWORD/);
    const pdb = openDb(join(dir, "minitroopers.db"));
    assert.equal(armyByHost(pdb, "vide"), null);
    assert.equal(armyByHost(pdb, "double"), null);
    assert.ok(verifyPassword("from-env", armyByHost(pdb, "secrete")!.passwordHash!));
    pdb.close();

    assert.equal(cli(dir, "frobnicate").status, 1);
    assert.match(cli(dir).stdout, /Usage/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("admin CLI create-bro-army: SMART troopers, 35 rats, password from env only, --force replace", () => {
  mkdirSync(join(REPO, "var"), { recursive: true });
  const dir = mkdtempSync(join(REPO, "var", "admin-test-"));
  const env = { MT_ARMY_PASSWORD: "x" };
  try {
    assert.equal(cli(dir, "seed-factions").status, 0);
    // no password / empty password / --password: error, nothing stored
    for (const [e, extra] of [[{}, []], [{ MT_ARMY_PASSWORD: "" }, []], [env, ["--password", "y"]]] as const) {
      const r = cliEnv(dir, e, "create-bro-army", "--name", "Les Frangins", ...extra);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /MT_ARMY_PASSWORD|--password/);
    }
    assert.equal(cliEnv(dir, env, "create-bro-army").status, 1); // --name required
    let db = openDb(join(dir, "minitroopers.db"));
    assert.equal(armyByHost(db, "les-frangins"), null);
    db.close();

    const c = cliEnv(dir, env, "create-bro-army", "--name", "Les Frangins");
    assert.equal(c.status, 0, c.stderr);
    db = openDb(join(dir, "minitroopers.db"));
    const a = armyByHost(db, "les-frangins")!;
    const ts = troopersOf(db, a.id);
    assert.equal(ts.length, 12);
    assert.deepEqual(ts.map((t) => t.seed), seedsOffering(SKILLS.SMART, 12));
    for (const t of ts) {
      const d = describeTrooper(trooperInput(t));
      assert.ok(d.skills.includes(SKILLS.SMART));
      assert.equal(d.level, 2);
    }
    assert.equal(a.rats, 35);
    assert.equal(a.missionsUnlocked, true);
    assert.equal(a.createdCid ?? null, null);
    assert.ok(verifyPassword("x", a.passwordHash!));
    // first extermination (same builder as routes/mission.ts) opposes 35 rats
    assert.equal(ratArmy(dayRats({ day: "2026-01-01", armyId: a.id, count: a.rats, salt: "missions" }), 0).troopers.length, 35);

    // a battle it attacked, one it defended, a recruit
    const mk = (att: number, def: number | null) => Number(db.prepare("INSERT INTO battles(day, attacker_id, defender_id, input, winner) VALUES ('2026-01-01', ?, ?, '{}', 0)").run(att, def).lastInsertRowid);
    const other = Number(db.prepare("INSERT INTO armies(host, name, part, faction, credits, created_at) VALUES ('autre','Autre',0,0,0,1)").run().lastInsertRowid);
    const mine = mk(a.id, other);
    const theirs = mk(other, a.id);
    const rec = Number(db.prepare("INSERT INTO armies(host, name, part, faction, credits, created_at, recruiter_id) VALUES ('recrue','Recrue',0,0,0,1,?)").run(a.id).lastInsertRowid);
    db.close();

    const dup = cliEnv(dir, env, "create-bro-army", "--name", "Les Frangins");
    assert.equal(dup.status, 1);
    assert.match(dup.stderr, /existe déjà/);

    const f = cliEnv(dir, env, "create-bro-army", "--name", "Les Frangins", "--force", "--count", "3", "--rats", "40");
    assert.equal(f.status, 0, f.stderr);
    db = openDb(join(dir, "minitroopers.db"));
    const b = armyByHost(db, "les-frangins")!;
    assert.notEqual(b.id, a.id);
    assert.equal(troopersOf(db, b.id).length, 3);
    assert.equal(b.rats, 40);
    assert.equal(db.prepare("SELECT id FROM battles WHERE id = ?").get(mine), undefined);
    assert.equal((db.prepare("SELECT defender_ref FROM battles WHERE id = ?").get(theirs) as { defender_ref: string }).defender_ref, "gone:Les Frangins");
    assert.equal(armyById(db, rec)!.recruiterId, null);
    db.close();

    // --rats is capped at RATS_MAX (100, UNVERIFIED)
    const tooMany = cli(dir, "create-army", "--name", "Trop De Rats", "--rats", "101", "--troopers", '[{"seed":5,"name":"X"}]');
    assert.equal(tooMany.status, 1);
    assert.match(tooMany.stderr, /--rats : un entier entre 1 et 100/);
    // create-army gains --rats and --force; a faction army is never replaced
    const ca = cli(dir, "create-army", "--name", "Les Frangins", "--rats", "9", "--force", "--troopers", '[{"seed":5,"name":"X"}]');
    assert.equal(ca.status, 0, ca.stderr);
    db = openDb(join(dir, "minitroopers.db"));
    assert.equal(armyByHost(db, "les-frangins")!.rats, 9);
    assert.equal(armyByHost(db, "les-frangins")!.missionsUnlocked, false);
    db.close();
    const fac = FACTIONS[0]!;
    const rf = cliEnv(dir, env, "create-bro-army", "--name", fac.name, "--force");
    assert.equal(rf.status, 1); // faction names are reserved by the name check already
    db = openDb(join(dir, "minitroopers.db"));
    assert.equal(armyByHost(db, fac.host)!.isFaction, true);
    // and insertArmy itself refuses to replace a faction army (nothing deleted)
    const seedOf = { host: fac.host, name: "X", part: 0, faction: 0, credits: 0, isFaction: false, passwordHash: null, now: 1, replace: true, troopers: [{ seed: 5, name: "X", choices: [], leftOver: null }] };
    assert.equal(insertArmy(db, seedOf), null);
    assert.equal(armyByHost(db, fac.host)!.isFaction, true);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("admin CLI set-password: password from MT_ARMY_PASSWORD only, never empty; signs out the army's sessions", () => {
  mkdirSync(join(REPO, "var"), { recursive: true });
  const dir = mkdtempSync(join(REPO, "var", "admin-test-"));
  try {
    assert.equal(cli(dir, "seed-factions").status, 0);
    assert.equal(cli(dir, "create-army", "--name", "Sans Pass", "--troopers", '[{"seed":5,"name":"X"}]').status, 0);
    let db = openDb(join(dir, "minitroopers.db"));
    const a = armyByHost(db, "sans-pass")!;
    assert.equal(a.passwordHash, null);
    db.prepare("INSERT INTO sessions(key, token, army_id, client_id, created_at) VALUES ('KS', 'tokS', ?, 'c', 1)").run(a.id);
    db.close();
    for (const [e, extra] of [[{}, []], [{ MT_ARMY_PASSWORD: "" }, []], [{ MT_ARMY_PASSWORD: "p" }, ["--password", "y"]]] as const) {
      const r = cliEnv(dir, e, "set-password", "--name", "sans-pass", ...extra);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /MT_ARMY_PASSWORD|--password/);
    }
    assert.equal(cliEnv(dir, { MT_ARMY_PASSWORD: "p" }, "set-password").status, 1); // --name required
    assert.match(cliEnv(dir, { MT_ARMY_PASSWORD: "p" }, "set-password", "--name", "inconnue").stderr, /introuvable/);
    assert.match(cliEnv(dir, { MT_ARMY_PASSWORD: "p" }, "set-password", "--name", FACTIONS[0]!.host).stderr, /faction/);
    db = openDb(join(dir, "minitroopers.db"));
    assert.equal(armyByHost(db, "sans-pass")!.passwordHash, null);
    assert.equal(armyByHost(db, FACTIONS[0]!.host)!.passwordHash, null);
    db.close();

    const ok = cliEnv(dir, { MT_ARMY_PASSWORD: "admin-set" }, "set-password", "--name", "Sans Pass");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /sans-pass/);
    db = openDb(join(dir, "minitroopers.db"));
    assert.ok(verifyPassword("admin-set", armyByHost(db, "sans-pass")!.passwordHash!));
    assert.equal((db.prepare("SELECT army_id FROM sessions WHERE key = 'KS'").get() as { army_id: number | null }).army_id, null);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- admin edits: reset-day and friends ----------------------------------------------------------------------------

const dayOf = (env: ReturnType<typeof setup>): string => dayKey(new Date(env.clock.t), "Europe/Paris");
const creditsOf = (db: ReturnType<typeof openDb>, id: number): number => (db.prepare("SELECT credits FROM armies WHERE id = ?").get(id) as { credits: number }).credits;
const STUB_INPUT = { seed: 1, background: { gfx: "bg/wood.jpg", id: 4 }, armies: [], attackerSide: 0 } as unknown as BattleInput;
const stubBattle = (win: boolean): NewBattle => ({ defenderId: null, defenderRef: "stub", input: STUB_INPUT, winner: win ? 0 : 1, reward: win ? 2 : 1 });
const stubMode = (mode: "exterminate" | "raid", win: boolean, dead: number[] = []): NewModeBattle => ({ ...stubBattle(win), mode, dead, reward: win ? 4 : 0 });
const rowsOf = (db: ReturnType<typeof openDb>, id: number, kind: string) =>
  db.prepare("SELECT id, input, winner, phase FROM battles WHERE attacker_id = ? AND kind = ? ORDER BY id").all(id, kind).map((r) => ({ ...r }));

async function warpArmy(env: ReturnType<typeof setup>) {
  const cl = env.client();
  assert.equal((await create(env, cl, "Warp", { part: "0" })).status, 302);
  const a = armyByHost(env.db, "warp")!;
  return { cl, id: a.id, at: (path: string) => env.at("warp", path) };
}

test("reset-day battles: battle rows and replays kept, exactly one more full day of battles, old URLs stay inert", async () => {
  const env = setup();
  const { cl, id, at } = await warpArmy(env);
  const day = dayOf(env);
  const allowance = battleAllowance(troopersOf(env.db, id).map(trooperInput));
  let calls = 0;
  const go = (used: number) => fight(env.db, { armyId: id, day, now: env.clock.t, used, opp: "x", allowance: () => allowance, decide: () => (calls++, stubBattle(true)) });
  for (let n = 0; n < allowance; n++) assert.equal(go(n).ok, true);
  assert.deepEqual(go(allowance), { ok: false, reason: "limit" });
  const before = rowsOf(env.db, id, "battle");
  const firstId = battleOfDay(env.db, id, day, 1)!.id;
  resetDay(env.db, id, day, { battles: true });
  resetDay(env.db, id, day, { battles: true }); // idempotent: nothing fought since
  assert.deepEqual(rowsOf(env.db, id, "battle"), before); // history and stored inputs untouched
  assert.equal(battleOfDay(env.db, id, day, 1)!.id, firstId); // /b/view/bat1 still shows the same battle
  assert.equal(battlesUsed(env.db, id, day), allowance); // the URL counter never goes back
  assert.equal(battlesCounted(env.db, id, day), 0);
  assert.deepEqual(battlesOfDay(env.db, id, day), []); // the HQ shows a fresh day
  const credits = creditsOf(env.db, id);
  for (const old of [0, allowance - 1]) assert.equal(go(old).ok, false); // a pre-reset URL fights nothing
  assert.equal(creditsOf(env.db, id), credits);
  for (let n = allowance; n < 2 * allowance; n++) {
    const r = go(n);
    assert.equal(r.ok && r.n, n + 1); // /b/view/bat<n+1>: a number never used before
  }
  assert.deepEqual(go(2 * allowance), { ok: false, reason: "limit" });
  assert.equal(calls, 2 * allowance);
  assert.deepEqual(battlesOfDay(env.db, id, day).map((b) => b.n), Array.from({ length: allowance }, (_, i) => allowance + i + 1));
  // the HQ links the new battles by their global number and offers no more
  const hq = await (await cl.req(at("/hq").url, { host: at("/hq").host })).text();
  assert.match(hq, new RegExp(`/b/view/bat${2 * allowance}"`));
  assert.doesNotMatch(hq, /\/b\/view\/bat1"/);
  assert.match(hq, /Tu as terminé tes batailles du jour/);
});

test("reset-day battles: the day's opponents are drawn again (frozen until the next reset); a pre-reset opponent is refused", async () => {
  const env = setup();
  const { cl, id, at } = await warpArmy(env);
  const day = dayOf(env);
  const opp = async (): Promise<string[]> => {
    const r = await cl.req(at("/b/opp").url, { host: at("/b/opp").host });
    assert.equal(r.status, 200);
    return (dayOpponents<{ id: string }>(env.db, id, day) ?? []).map((x) => x.id);
  };
  const before = await opp();
  assert.equal(before.length, 5);
  assert.deepEqual(await opp(), before); // frozen: reloading draws nothing
  resetDay(env.db, id, day, { mission: true, raid: true, shop: true }); // other quotas: the opponents stay
  assert.deepEqual(await opp(), before);
  resetDay(env.db, id, day, { battles: true });
  const after = await opp();
  assert.equal(after.length, 5);
  assert.notDeepEqual(after, before);
  assert.deepEqual(await opp(), after); // frozen again until the next reset
  const gone = before.find((x) => !after.includes(x))!;
  const u = at(`/b/battle?chk=${cl.key};n=0;opp=${encodeURIComponent(gone)}`);
  const r = await cl.req(u.url, { host: u.host });
  assert.match(r.headers.get("location")!, /\/b\/opp\?err=/); // no longer one of the day's opponents
  assert.equal(battlesUsed(env.db, id, day), 0);
});

test("reset-day mission: same mission again, MISSION_ATTEMPTS fresh tries, a pre-reset URL replays nothing", async () => {
  const env = setup();
  const { cl, id, at } = await warpArmy(env);
  const day = dayOf(env);
  env.db.prepare("INSERT INTO daily(army_id, day, mission_type, mission_target) VALUES (?, ?, 'exterminate', 'tgt')").run(id, day);
  env.db.prepare("UPDATE armies SET missions_unlocked = 1 WHERE id = ?").run(id);
  let calls = 0;
  const go = (used: number, win: boolean) => fightMission(env.db, { armyId: id, day, now: env.clock.t, used, decide: () => (calls++, stubMode("exterminate", win)) });
  assert.equal(go(0, true).ok, true);
  assert.equal(go(1, true).ok, false); // won: done for the day
  const before = rowsOf(env.db, id, "mission");
  resetDay(env.db, id, day, { mission: true });
  const m = missionDay(env.db, id, day);
  assert.deepEqual({ type: m.type, target: m.target, won: m.won, used: m.used }, { type: "exterminate", target: "tgt", won: false, used: 1 });
  assert.deepEqual(rowsOf(env.db, id, "mission"), before);
  const credits = creditsOf(env.db, id);
  // the pre-reset URL (n=0), through the route: shows the try it made, fights nothing
  const stale = at(`/b/mission?n=0;chk=${cl.key}`);
  const r = await cl.req(stale.url, { host: stale.host });
  assert.equal(r.status, 302);
  assert.match(r.headers.get("location")!, /\/b\/view\/miss1\?d=/);
  assert.equal(calls, 1);
  assert.equal(creditsOf(env.db, id), credits);
  for (let k = 0; k < MISSION_ATTEMPTS; k++) assert.equal(go(1 + k, false).ok, true);
  assert.equal(go(1 + MISSION_ATTEMPTS, false).ok, false);
  assert.equal(calls, 1 + MISSION_ATTEMPTS);
  assert.deepEqual(missionsOfDay(env.db, id, day).map((t) => t.n), [2, 3, 4]);
});

test("reset-day raid: phase 1 again with every recruit alive, at a new URL counter; the pre-reset URL replays nothing", async () => {
  const env = setup();
  const { cl, id, at } = await warpArmy(env);
  const day = dayOf(env);
  const rec = Number(env.db.prepare("INSERT INTO armies(host, name, part, faction, credits, created_at, recruiter_id, recruit_confirmed_at) VALUES ('recrue','Recrue',0,0,0,1,?,1)").run(id).lastInsertRowid);
  env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name) VALUES (?, 0, 77, 'Rec')").run(rec);
  const phases: number[] = [];
  const go = (phase: number, win: boolean) =>
    fightRaid(env.db, { armyId: id, day, now: env.clock.t, phase, decide: (_alive, p) => (phases.push(p), stubMode("raid", win, win ? [] : [rec])) });
  assert.equal(go(1, true).ok, true);
  assert.equal(go(2, false).ok, true); // lost: raid over, the recruit is dead
  assert.equal(raidDay(env.db, id, day).over, true);
  const before = rowsOf(env.db, id, "raid");
  resetDay(env.db, id, day, { raid: true });
  resetDay(env.db, id, day, { raid: true }); // idempotent: nothing fought since
  assert.deepEqual(raidDay(env.db, id, day), { phase: 1, step: 3, dead: [], over: false });
  assert.deepEqual(rowsOf(env.db, id, "raid"), before);
  const credits = creditsOf(env.db, id);
  for (const old of [1, 2]) {
    const u = at(`/b/raid?phase=${old};chk=${cl.key}`);
    const r = await cl.req(u.url, { host: u.host });
    assert.match(r.headers.get("location")!, /\/b\/view\/raid\?d=/); // shows the last raid, fights nothing
  }
  assert.equal(rowsOf(env.db, id, "raid").length, 2);
  assert.equal(creditsOf(env.db, id), credits);
  const hq = await (await cl.req(at("/hq").url, { host: at("/hq").host })).text();
  assert.match(hq, /\/b\/raid\?phase=3;chk=/);
  assert.equal(go(3, true).ok, true);
  assert.deepEqual(phases, [1, 2, 1]); // the NPC of game phase 1 again
  assert.deepEqual(rowsOf(env.db, id, "raid").map((r) => r.phase), [1, 2, 1]);
  assert.deepEqual(raidDay(env.db, id, day), { phase: 2, step: 4, dead: [], over: false });
});

test("renameArmy: new host, sessions kept, login by the new name; a taken host is refused", async () => {
  for (const mode of ["path", "subdomain"] as const) {
    const env = setup(mode);
    const { cl, id } = await warpArmy(env);
    const cl2 = env.client();
    assert.equal((await create(env, cl2, "Autre", { part: "0" })).status, 302);
    assert.equal(renameArmy(env.db, id, "Autre", "autre"), false);
    assert.equal(renameArmy(env.db, id, "Nouveau Nom", "nouveau-nom"), true);
    assert.equal(armyById(env.db, id)!.host, "nouveau-nom");
    const hq = env.at("nouveau-nom", "/hq");
    const own = await cl.req(hq.url, { host: hq.host }); // the creator's session still owns the army at its new address
    assert.equal(own.status, 200);
    assert.match(await own.text(), /Lance une bataille/);
    const res = await env.client().req("/login", { form: { login: "Nouveau Nom" } });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), mode === "path" ? "/a/nouveau-nom/hq" : "http://nouveau-nom.lvh.me:8080/hq");
  }
});

function adminDir() {
  mkdirSync(join(REPO, "var"), { recursive: true });
  return mkdtempSync(join(REPO, "var", "admin-test-"));
}

test("admin CLI edits: show, set-credits, set-rats, unlock-missions, rename, level-up, confirm-recruits, reset-day, delete-army", () => {
  const dir = adminDir();
  try {
    assert.equal(cli(dir, "seed-factions").status, 0);
    const p = firstPicks(2222222, 2);
    assert.equal(cli(dir, "create-army", "--name", "Rats Morts", "--part", "4", "--credits", "5", "--troopers", JSON.stringify([{ seed: 2222222, name: "Malin", skills: p.skills.slice(0, 1) }, { seed: 3333333, name: "Bleu" }])).status, 0);
    const fac = FACTIONS[0]!.host;
    const err = (r: ReturnType<typeof cli>, re: RegExp) => {
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stderr, re);
    };

    const s = cli(dir, "show", "--army", "Rats Morts");
    assert.equal(s.status, 0, s.stderr);
    for (const re of [/rats-morts/, /L'armée des Rats Morts/, /Crédits : 5/, /Mot de passe : non/, /Missions débloquées : non/, /Rats : 1/, /Recrues : 0 confirmée\(s\), 0 en attente/, /0\tMalin\tniveau 2\t.*/, /1\tBleu\tniveau 1/, /Batailles : 0\/\d+/, /Raid : phase 1/])
      assert.match(s.stdout, re);
    err(cli(dir, "show", "--army", "Inconnue"), /introuvable/);

    assert.match(cli(dir, "set-credits", "--army", "rats-morts", "--amount", "42").stdout, /rats-morts : 42 crédits/);
    err(cli(dir, "set-credits", "--army", "rats-morts", "--amount", "-1"), /--amount/);

    assert.match(cli(dir, "set-rats", "--army", "rats-morts", "--rats", "50").stdout, /rats-morts : 50 rats/);
    err(cli(dir, "set-rats", "--army", "rats-morts", "--rats", "101"), /--rats : un entier entre 1 et 100/);
    err(cli(dir, "set-rats", "--army", fac, "--rats", "5"), /faction/);

    // set-faction: the uniform colour, by number or colour name
    assert.match(cli(dir, "set-faction", "--army", "rats-morts", "--faction", "vert").stdout, /rats-morts : faction 3 \(vert\)/);
    assert.match(cli(dir, "show", "--army", "rats-morts").stdout, /Faction : 3 \(vert\)/);
    assert.match(cli(dir, "set-faction", "--army", "rats-morts", "--faction", "5").stdout, /rats-morts : faction 5 \(violet\)/);
    err(cli(dir, "set-faction", "--army", "rats-morts", "--faction", "6"), /--faction : 0 à 5 ou rouge, orange, jaune, vert, bleu, violet/);
    err(cli(dir, "set-faction", "--army", "rats-morts", "--faction", "rose"), /--faction : 0 à 5/);
    err(cli(dir, "set-faction", "--army", "rats-morts"), /--faction/);
    err(cli(dir, "set-faction", "--army", fac, "--faction", "1"), /faction/);
    const d0 = openDb(join(dir, "minitroopers.db"));
    assert.equal(armyByHost(d0, "rats-morts")!.faction, 5);
    assert.equal(armyByHost(d0, fac)!.faction, FACTIONS[0]!.id); // a faction army keeps its own
    d0.close();

    assert.match(cli(dir, "unlock-missions", "--army", "rats-morts").stdout, /missions débloquées/);
    let db = openDb(join(dir, "minitroopers.db"));
    const a = armyByHost(db, "rats-morts")!;
    assert.deepEqual([a.credits, a.rats, a.missionsUnlocked], [42, 50, true]);
    db.close();
    assert.match(cli(dir, "unlock-missions", "--army", "rats-morts", "--lock").stdout, /missions verrouillées/);

    // level-up: only a skill the game offers at that level, nothing paid
    const offered = levelUpOptions({ id: 0, name: "X", seed: 2222222, type: 0, choices: p.choices.slice(0, 1), force: [], pref: null }).shown;
    const notOffered = Object.values(SKILLS).find((x) => !offered.includes(x as number))!;
    err(cli(dir, "level-up", "--army", "rats-morts", "--slot", "0", "--skill", String(notOffered)), /n'est pas proposée ; proposées : /);
    err(cli(dir, "level-up", "--army", "rats-morts", "--slot", "7", "--skill", "SMART"), /trooper introuvable/);
    const lu = cli(dir, "level-up", "--army", "rats-morts", "--slot", "0", "--skill", NAMES.get(p.skills[1]!)!.toLowerCase());
    assert.equal(lu.status, 0, lu.stderr);
    assert.match(lu.stdout, /Malin : niveau 3/);
    db = openDb(join(dir, "minitroopers.db"));
    assert.deepEqual(troopersOf(db, a.id)[0]!.choices, p.choices);
    assert.equal(armyById(db, a.id)!.credits, 42);
    // a recruit to confirm, a battle and mission state to reset
    db.prepare("INSERT INTO armies(host, name, part, faction, credits, created_at, recruiter_id) VALUES ('recrue','Recrue',0,0,0,1,?)").run(a.id);
    const today = "2026-01-15"; // explicit --day below: never flaky around midnight
    db.prepare("INSERT INTO battles(day, attacker_id, input, winner) VALUES (?, ?, '{}', 0)").run(today, a.id);
    db.prepare("INSERT INTO daily(army_id, day, missions_used, mission_won, mission_type) VALUES (?, ?, 1, 1, 'epic')").run(a.id, today);
    db.close();

    assert.match(cli(dir, "show", "--army", "rats-morts").stdout, /Recrues : 0 confirmée\(s\), 1 en attente/);
    const cr = cli(dir, "confirm-recruits", "--army", "rats-morts");
    assert.equal(cr.status, 0, cr.stderr);
    assert.match(cr.stdout, /1 recrue\(s\) confirmée\(s\), \+100 crédits/);
    assert.match(cli(dir, "confirm-recruits", "--army", "rats-morts").stdout, /0 recrue\(s\) confirmée\(s\), \+0 crédits/);

    assert.match(cli(dir, "show", "--army", "rats-morts", "--day", today).stdout, /Batailles : 1\/\d+/);
    err(cli(dir, "reset-day", "--army", "rats-morts", "--what", "tout"), /--what/);
    err(cli(dir, "reset-day", "--army", "rats-morts", "--day", "2026-02-30"), /--day/);
    err(cli(dir, "reset-day", "--army", fac), /faction/);
    const rd = cli(dir, "reset-day", "--army", "rats-morts", "--day", today, "--what", "battles");
    assert.equal(rd.status, 0, rd.stderr);
    assert.match(rd.stdout, /Batailles : 0\//);
    assert.match(rd.stdout, /Mission : epic, essais 1\/3, gagnée : oui/);
    assert.match(cli(dir, "reset-day", "--army", "rats-morts", "--day", today).stdout, /Mission : epic, essais 0\/3, gagnée : non/);
    db = openDb(join(dir, "minitroopers.db"));
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM battles WHERE attacker_id = ?").get(a.id) as { n: number }).n, 1);
    db.close();

    // rename: same rules as creation, prints the new address
    err(cli(dir, "rename", "--army", "rats-morts", "--name", "Recrue"), /existe déjà/);
    err(cli(dir, "rename", "--army", "rats-morts", "--name", "<b>"), /--name/);
    err(cli(dir, "rename", "--army", fac, "--name", "Libre"), /faction/);
    const rn = cli(dir, "rename", "--army", "rats-morts", "--name", "Nouveau Nom");
    assert.equal(rn.status, 0, rn.stderr);
    assert.match(rn.stdout, /rats-morts → nouveau-nom .*\/a\/nouveau-nom\//);

    // delete-army: without --yes, only what would go; factions never
    const dry = cli(dir, "delete-army", "--army", "nouveau-nom");
    assert.equal(dry.status, 1);
    assert.match(dry.stdout, /2 troopers/);
    assert.match(dry.stdout, /--yes/);
    db = openDb(join(dir, "minitroopers.db"));
    assert.ok(armyByHost(db, "nouveau-nom"));
    db.close();
    err(cli(dir, "delete-army", "--army", fac, "--yes"), /faction/);
    const del = cli(dir, "delete-army", "--army", "nouveau-nom", "--yes");
    assert.equal(del.status, 0, del.stderr);
    db = openDb(join(dir, "minitroopers.db"));
    assert.equal(armyByHost(db, "nouveau-nom"), null);
    assert.ok(armyByHost(db, fac));
    db.close();
    assert.match(cli(dir).stdout, /reset-day/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
