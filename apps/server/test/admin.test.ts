import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SKILLS, defaultLeftOver, levelUpOptions, type BattleTrooperInput } from "@mt/engine";
import { FACTIONS, factionBattleArmy } from "@mt/game";
import { openDb } from "../src/db.ts";
import { verifyPassword } from "../src/password.ts";
import { SpecError, buildTroopers } from "../src/admin/army.ts";
import { seedFactions } from "../src/admin/factions.ts";
import { addCredits, armyByHost, armySummaries, troopersOf, trooperInput } from "../src/repo.ts";
import { foeByName } from "../src/foes.ts";
import { setup } from "./helpers.ts";

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
    assert.match(dup.stderr, /déjà pris/);
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
