// End to end: the real server (src/main.ts) and admin CLI (src/admin/cli.ts) as child processes, driven by headless
// Chromium (Playwright, browsers under tools/bin/ms-playwright; skipped when absent), in both URL modes.
// Path: create an army, give it credits (CLI), upgrade its trooper and pick a skill, buy a trooper, fight a battle;
// the battle page loads Ruffle and client_fr_play.swf, whose end banner (VICTOIRE / DEFAITE) must show the winner
// stored in the database, and whose `endBattle()` must lead to `/hq?money=<reward>`.
//
// Subdomain mode uses BASE_DOMAIN=mt.localhost: Chromium resolves every *.localhost name to the loopback without DNS,
// and (verified by the "[e2e cookies]" test below) shares a `Domain=mt.localhost` cookie with `<army>.mt.localhost`, which it does not do
// for `Domain=localhost`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BattleInput } from "@mt/engine";
import { pngDistance } from "./png.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const MAIN = join(REPO, "apps/server/src/main.ts");
const CLI = join(REPO, "apps/server/src/admin/cli.ts");
const BROWSERS = join(REPO, "tools/bin/ms-playwright");
const TMP = join(REPO, "tools/bin/tmp");
const FIXTURES = join(REPO, "tools/oracle/test/fixtures");
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;

type Mode = "path" | "subdomain";
const BASE_DOMAIN = "mt.localhost";

/** Crop of the end banner title and the "continuer" button, relative to the 720x440 battle player (tools/oracle play test). */
const BANNER = { dx: 300, dy: 160, width: 120, height: 24 };
const CONTINUE = { dx: 360, dy: 267 };

const browsersInstalled = (): boolean => existsSync(BROWSERS) && readdirSync(BROWSERS).some((d) => d.startsWith("chromium"));

const freePort = (): Promise<number> =>
  new Promise((ok, ko) => {
    const s = createServer();
    s.once("error", ko);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });

/** Starts src/main.ts and resolves once it listens. */
async function startServer(env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(process.execPath, [MAIN], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  await new Promise<void>((ok, ko) => {
    const timer = setTimeout(() => ko(new Error(`server did not start:\n${log}`)), 20_000);
    const onData = (b: Buffer): void => {
      log += b.toString();
      if (log.includes("MiniTroopers server on")) {
        clearTimeout(timer);
        ok();
      }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      ko(new Error(`server exited (${code}):\n${log}`));
    });
  });
  child.removeAllListeners("exit");
  return child;
}

const stop = (child: ChildProcess): Promise<void> =>
  new Promise((ok) => {
    if (child.exitCode !== null) return ok();
    child.once("exit", () => ok());
    child.kill("SIGTERM");
  });

function cli(dataDir: string, ...args: string[]): string {
  const r = spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, DATA_DIR: dataDir }, encoding: "utf8" });
  assert.equal(r.status, 0, `admin ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

async function launch() {
  const { chromium } = await import("playwright");
  // Playwright and Chromium write temporary files under os.tmpdir(): keep them in the gitignored tools/bin/tmp.
  mkdirSync(TMP, { recursive: true });
  const saved = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
  process.env.TEMP = process.env.TMP = process.env.TMPDIR = TMP;
  try {
    return await chromium.launch({ headless: true, env: { ...process.env, TEMP: TMP, TMP: TMP, TMPDIR: TMP } as Record<string, string> });
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof launch>>["newPage"]>>;

/**
 * Waits for the battle page's Ruffle player to show the end banner of client_fr_play.swf, checks it against the winner
 * stored in the database (`won`), then clicks "continuer" until the SWF's endBattle() reaches `end`.
 */
async function swfReplay(page: Page, label: string, won: boolean, end: string): Promise<void> {
  const player = page.locator("ruffle-player#battle");
  await player.waitFor({ timeout: 30_000 });
  const box = (await player.boundingBox())!;
  const victory = readFileSync(join(FIXTURES, "banner-victoire.png"));
  const defeat = readFileSync(join(FIXTURES, "banner-defaite.png"));
  const clip = { x: box.x + BANNER.dx, y: box.y + BANNER.dy, width: BANNER.width, height: BANNER.height };
  const deadline = Date.now() + Number(process.env.MT_E2E_BATTLE_MS ?? 400_000);
  // The crop matches a reference up to PNG encoding noise (measured: 0.0002 mean channel difference, banners 10.4 apart).
  const banner = (png: Buffer): "VICTOIRE" | "DEFAITE" | null =>
    pngDistance(png, victory) < 1 ? "VICTOIRE" : pngDistance(png, defeat) < 1 ? "DEFAITE" : null;
  let shot = await page.screenshot({ clip });
  while (banner(shot) === null) {
    if (Date.now() > deadline) {
      // kept for diagnosis (var/ is gitignored)
      writeFileSync(join(REPO, "var", `e2e-${label}-banner.png`), shot);
      writeFileSync(join(REPO, "var", `e2e-${label}-player.png`), await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } }));
      assert.fail(`${label}: no end-of-battle banner (crops saved in var/)`);
    }
    await page.waitForTimeout(1000);
    shot = await page.screenshot({ clip });
  }
  assert.equal(banner(shot), won ? "VICTOIRE" : "DEFAITE", `${label}: banner drawn by the SWF vs winner in the database`);
  // Ruffle swallows the first click on a fresh page (activation); the next one reaches "continuer".
  for (let i = 0; i < 4 && page.url() !== end; i++) {
    await page.mouse.click(box.x + CONTINUE.dx, box.y + CONTINUE.dy);
    await page.waitForURL(end, { timeout: 2_000 }).catch(() => {});
  }
  assert.equal(page.url(), end, `${label}: endBattle() called by the SWF`);
}

// Why subdomain mode refuses a single-label BASE_DOMAIN (config.ts): what Chromium does with Domain= cookies on *.localhost.
test("[e2e cookies] Chromium never sends a Domain=localhost cookie to <army>.localhost, but sends Domain=mt.localhost to <army>.mt.localhost", { timeout: 60_000 }, async (t) => {
  if (!browsersInstalled()) return t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
  const { createServer: httpServer } = await import("node:http");
  const srv = httpServer((req, res) => {
    const d = new URL(req.url ?? "/", "http://x").searchParams.get("d");
    if (d) res.writeHead(200, { "set-cookie": `c=${d.replace(/\W/g, "_")}; Path=/; HttpOnly; SameSite=Lax; Domain=${d}` }).end("set");
    else res.writeHead(200).end(req.headers.cookie ?? "");
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  const port = (srv.address() as { port: number }).port;
  const browser = await launch();
  try {
    const seen = async (base: string): Promise<{ root: string; sub: string }> => {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`http://${base}:${port}/?d=${base}`);
      await page.goto(`http://army.${base}:${port}/`);
      const sub = (await page.textContent("body")) ?? "";
      await page.goto(`http://${base}:${port}/`);
      const root = (await page.textContent("body")) ?? "";
      await page.context().close();
      return { root, sub };
    };
    assert.deepEqual(await seen("localhost"), { root: "c=localhost", sub: "" });
    assert.deepEqual(await seen(BASE_DOMAIN), { root: "c=mt_localhost", sub: "c=mt_localhost" });
  } finally {
    await browser.close();
    await new Promise((ok) => srv.close(ok));
  }
});

for (const mode of ["path", "subdomain"] as Mode[]) {
  test(`[e2e ${mode}] create, upgrade, skill, buy, battle replayed by the SWF with the stored winner`, { timeout: 600_000 }, async (t) => {
    if (!browsersInstalled()) return t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
    mkdirSync(join(REPO, "var"), { recursive: true });
    const dataDir = mkdtempSync(join(REPO, "var", `e2e-${mode}-`));
    const port = await freePort();
    const root = mode === "path" ? `http://localhost:${port}` : `http://${BASE_DOMAIN}:${port}`;
    const at = (host: string, path: string): string => (mode === "path" ? `${root}/a/${host}${path}` : `http://${host}.${BASE_DOMAIN}:${port}${path}`);
    const env: Record<string, string> = { URL_MODE: mode, PORT: String(port), DATA_DIR: dataDir, ...(mode === "subdomain" ? { BASE_DOMAIN } : {}) };
    const server = await startServer(env);
    const browser = await launch();
    let db: DatabaseSync | undefined;
    try {
      // first start seeded the faction armies
      const listed = cli(dataDir, "list");
      assert.match(listed, /sang-surs/);
      db = new DatabaseSync(join(dataDir, "minitroopers.db"), { readOnly: true });
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
      page.on("dialog", (d) => void d.accept());

      // 1. create an army on the root site; the session must follow to the army's HQ (subdomain: cookie domain)
      await page.goto(`${root}/`);
      await page.fill("#name", "Bidasses");
      await page.click("#tr_1000 > ul");
      await page.mouse.move(0, 0); // the skill tooltip follows the mouse and would cover the button
      await page.waitForSelector("#submit:not([disabled])", { timeout: 15_000 });
      await Promise.all([page.waitForURL(at("bidasses", "/hq")).catch(async (e: unknown) => {
        throw new Error(`creation: at ${page.url()}: ${(await page.textContent("body"))?.replace(/\s+/g, " ").slice(0, 400)}`, { cause: e });
      }), page.click("#submit")]);
      assert.equal(page.url(), at("bidasses", "/hq"));
      const army = db.prepare("SELECT id, credits FROM armies WHERE host = 'bidasses'").get() as { id: number; credits: number };
      assert.ok(army, "army stored");
      const trooperLink = JSON.stringify(mode === "path" ? "/a/bidasses/t/" : at("bidasses", "/t/"));
      assert.ok((await page.content()).includes(trooperLink), "owner HQ (trooper grid links), not the recruit page");

      // 2. credits from the admin CLI
      assert.match(cli(dataDir, "give-credits", "--army", "Bidasses", "--amount", "100"), /bidasses/);

      // 3. upgrade trooper 0 and choose the first skill offered
      await page.goto(at("bidasses", "/t/0"));
      await Promise.all([page.waitForURL(at("bidasses", "/levelup/0")), page.click('a[href*="levelup="]')]);
      await Promise.all([page.waitForURL(at("bidasses", "/hq")), page.click(".box8 >> nth=0")]);
      const t0 = db.prepare("SELECT choices FROM troopers WHERE army_id = ? AND slot = 0").get(army.id) as { choices: string };
      assert.equal((JSON.parse(t0.choices) as number[]).length, 1);

      // 4. buy a trooper
      await page.goto(at("bidasses", "/add"));
      await page.click("#tr_1000 > ul");
      await page.mouse.move(0, 0); // the skill tooltip follows the mouse: leave the icons before aiming at the button
      await Promise.all([page.waitForURL(at("bidasses", "/hq")), page.click("#valid")]);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM troopers WHERE army_id = ?").get(army.id) as { n: number }).n, 2);

      // 5. fight the first opponent of the day
      await page.goto(at("bidasses", "/b/opp"));
      await Promise.all([page.waitForURL((u) => u.href.startsWith(at("bidasses", "/b/view/bat1?d="))), page.click('a.button5[href*="/b/battle?"] >> nth=0')]);
      const b = db.prepare("SELECT input, winner FROM battles WHERE attacker_id = ?").get(army.id) as { input: string; winner: number | null };
      const won = b.winner !== null && b.winner === (JSON.parse(b.input) as BattleInput).attackerSide;

      // 6. Ruffle replays it: the SWF's end banner shows the stored winner, its endBattle() goes to /hq?money=<reward>
      await swfReplay(page, `${mode}-battle`, won, at("bidasses", `/hq?money=${won ? 2 : 1}`));
    } finally {
      db?.close();
      await browser.close();
      await stop(server);
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
}

/** Fills the creation form shown at the current URL (first offer) and waits for the new army's HQ. */
async function createArmyIn(page: Page, name: string, hq: string): Promise<void> {
  await page.fill("#name", name);
  await page.click("#tr_1000 > ul");
  await page.mouse.move(0, 0); // the skill tooltip follows the mouse and would cover the button
  await page.waitForSelector("#submit:not([disabled])", { timeout: 15_000 });
  await Promise.all([page.waitForURL(hq).catch(async (e: unknown) => {
    throw new Error(`creation of ${name}: at ${page.url()}: ${(await page.textContent("body"))?.replace(/\s+/g, " ").slice(0, 400)}`, { cause: e });
  }), page.click("#submit")]);
}

// Stage 3: referral, mission of the day, raid, password. A creates an army; B signs up through A's recruit link;
// A opens /history (+100 bounty), unlocks and plays the mission of the day, raids with B, then sets a password.
// The mission and the raid are replayed by the SWF with the winner stored in the database.
for (const mode of ["path", "subdomain"] as Mode[]) {
  test(`[e2e ${mode}] referral, mission and raid replayed by the SWF with the stored winner, password`, { timeout: 1_200_000 }, async (t) => {
    if (!browsersInstalled()) return t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
    const { MISSION_UNLOCK_COST, RAID_REWARD, missionReward, referralBounty } = await import("@mt/game");
    mkdirSync(join(REPO, "var"), { recursive: true });
    const dataDir = mkdtempSync(join(REPO, "var", `e2e3-${mode}-`));
    const port = await freePort();
    const root = mode === "path" ? `http://localhost:${port}` : `http://${BASE_DOMAIN}:${port}`;
    const at = (host: string, path: string): string => (mode === "path" ? `${root}/a/${host}${path}` : `http://${host}.${BASE_DOMAIN}:${port}${path}`);
    const env: Record<string, string> = { URL_MODE: mode, PORT: String(port), DATA_DIR: dataDir, ...(mode === "subdomain" ? { BASE_DOMAIN } : {}) };
    const server = await startServer(env);
    const browser = await launch();
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(join(dataDir, "minitroopers.db"), { readOnly: true });
      const armyOf = (host: string) => db!.prepare("SELECT id, credits, recruiter_id, recruit_confirmed_at, password_hash FROM armies WHERE host = ?").get(host) as
        { id: number; credits: number; recruiter_id: number | null; recruit_confirmed_at: number | null; password_hash: string | null } | undefined;
      const newPage = async (): Promise<Page> => {
        const p = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
        p.on("dialog", (d) => void d.accept());
        return p;
      };

      // 1. A creates an army; its HQ shows the recruit link
      const pa = await newPage();
      await pa.goto(`${root}/`);
      await createArmyIn(pa, "Bidasses", at("bidasses", "/hq"));
      const a = armyOf("bidasses")!;
      assert.equal(a.credits, 0, "STARTING_CREDITS");
      const link = await pa.inputValue(".social input");
      assert.equal(link, mode === "path" ? `http://localhost:${port}/a/bidasses/` : at("bidasses", "/"));

      // 2. B signs up through A's link (another browser: no session)
      const pb = await newPage();
      await pb.goto(link);
      await createArmyIn(pb, "Planques", at("planques", "/hq"));
      const b = armyOf("planques")!;
      assert.equal(b.recruiter_id, a.id, "B recruited by A");
      assert.equal(b.recruit_confirmed_at, null, "pending until A opens /history");
      await pb.context().close();

      // 3. A sees "Nouvelle recrue disponible !" and opens /history: the recruit is confirmed, +bounty
      await pa.goto(at("bidasses", "/hq"));
      await Promise.all([pa.waitForURL(at("bidasses", "/history")), pa.click(".newchild a")]);
      assert.notEqual(armyOf("planques")!.recruit_confirmed_at, null, "recruit confirmed");
      assert.equal(armyOf("bidasses")!.credits, referralBounty(1), "first recruit bounty");
      assert.equal(referralBounty(1), 100);

      // 4. A unlocks the missions (5) and plays the mission of the day (whatever type the day draws)
      await pa.goto(at("bidasses", "/hq"));
      await Promise.all([pa.waitForURL(at("bidasses", "/hq")), pa.click('a[href*="/b/unlock?chk="]')]);
      assert.equal(armyOf("bidasses")!.credits, 100 - MISSION_UNLOCK_COST);
      await Promise.all([pa.waitForURL((u) => u.href.startsWith(at("bidasses", "/b/view/miss1?d="))), pa.click('a[href*="/b/mission?n=0;chk="]')]);
      const m = db.prepare("SELECT input, winner, mode FROM battles WHERE attacker_id = ? AND kind = 'mission'").get(a.id) as { input: string; winner: number | null; mode: string };
      assert.ok(["exterminate", "infiltrate", "epic"].includes(m.mode), `mission type ${m.mode}`);
      const mWon = m.winner !== null && m.winner === (JSON.parse(m.input) as BattleInput).attackerSide;
      await swfReplay(pa, `${mode}-mission-${m.mode}`, mWon, mWon ? at("bidasses", `/hq?money=${missionReward(true)}`) : at("bidasses", "/hq"));
      // replay page (seen): no reward link any more
      await pa.goto(at("bidasses", "/b/view/miss1"));
      await pa.locator("ruffle-player#battle").waitFor({ timeout: 30_000 });

      // 5. A raids with B (phase 1)
      await pa.goto(at("bidasses", "/hq"));
      await Promise.all([pa.waitForURL((u) => u.href.startsWith(at("bidasses", "/b/view/raid?d="))), pa.click('a[href*="/b/raid?phase=1;chk="]')]);
      const r = db.prepare("SELECT input, winner, phase FROM battles WHERE attacker_id = ? AND kind = 'raid'").get(a.id) as { input: string; winner: number | null; phase: number };
      assert.equal(r.phase, 1);
      const rInput = JSON.parse(r.input) as BattleInput;
      assert.equal(rInput.armies[rInput.attackerSide]!.troopers.length, 1, "B's first trooper raids");
      const rWon = r.winner !== null && r.winner === rInput.attackerSide;
      await swfReplay(pa, `${mode}-raid`, rWon, rWon ? at("bidasses", `/hq?money=${RAID_REWARD}`) : at("bidasses", "/hq"));

      // 6. A protects its army with a password (POST passes the same-origin check)
      await pa.goto(at("bidasses", "/protect"));
      await pa.fill('input[name="pass"]', "motdepasse");
      await pa.fill('input[name="passconf"]', "motdepasse");
      await Promise.all([pa.waitForURL(at("bidasses", "/hq")), pa.click('input[type="submit"][value="Valider"]')]);
      assert.notEqual(armyOf("bidasses")!.password_hash, null, "password stored");
      // the owner's session stays logged in: the menu no longer offers "Protéger mon armée"
      assert.ok(!(await pa.content()).includes("Protéger mon armée"));
    } finally {
      db?.close();
      await browser.close();
      await stop(server);
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
}
