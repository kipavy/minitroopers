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
import { decodePng, pngDistance } from "./png.ts";

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

interface Ready {
  total: number;
  checkpoints: number[];
  waves: number[];
  /** First keyframe after each NewWave: where wave seeks land. */
  starts: number[];
}
/** What public/js/player.js exposes as `window.mtPlayer`. */
interface PlayerInfo {
  ready: Ready | null;
  idx: number;
  /** First idx reported by the current Ruffle player (null before its first mtProgress). */
  first: number | null;
  /** Ruffle players created so far (always 1: seeks never reload it). */
  players: number;
}
interface SwfState {
  idx: number;
  wave: number;
  total: number;
  speed: number;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  hidden: boolean;
  banner: boolean;
}
const playerInfo = (page: Page): Promise<PlayerInfo> =>
  page.evaluate(() => {
    const p = (globalThis as unknown as { mtPlayer: PlayerInfo }).mtPlayer;
    return { ready: p.ready, idx: p.idx, first: p.first, players: p.players };
  });
const swfState = (page: Page): Promise<SwfState> =>
  page.evaluate(() => (globalThis as unknown as { document: { getElementById(id: string): { mtState(): SwfState } } }).document.getElementById("battle").mtState());

/** Polls `get` until `ok` holds. */
async function until<T>(page: Page, get: () => Promise<T>, ok: (v: T) => boolean, ms: number, what: string): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await get().catch(() => undefined);
    if (v !== undefined && ok(v)) return v;
    if (Date.now() > deadline) assert.fail(`${what} not within ${ms} ms (last: ${JSON.stringify(v)})`);
    await page.waitForTimeout(100);
  }
}

/**
 * Waits for the enhanced player (mtReady) and checks the page's log against the SWF: one line per history entry, as
 * many waves. Returns what mtReady reported.
 */
async function playerReady(page: Page, label: string): Promise<Ready> {
  const info = await until(page, () => playerInfo(page), (p) => p.ready !== null, 120_000, `${label}: mtReady`);
  const ready = info.ready!;
  const log = await page.evaluate(() => (globalThis as unknown as { mtLog: { i: number; w: number; t: string }[] }).mtLog);
  assert.equal(log.length, ready.total, `${label}: log lines = SWF history entries`);
  assert.equal(Math.max(0, ...log.map((l) => l.w)), ready.waves.length, `${label}: log waves = SWF waves`);
  assert.ok(await page.locator("#mtp-bar").isVisible(), `${label}: control bar shown`);
  return ready;
}

/**
 * Waits for the battle page's Ruffle player, jumps to the end through the enhanced player ("Fin", mtGoto(total): the
 * emulated Chromium of the dev PC plays far slower than real time), waits for the end banner of client_fr_play.swf,
 * checks it against the winner stored in the database (`won`), then clicks "continuer" until the SWF's endBattle()
 * reaches `end`.
 */
async function swfReplay(page: Page, label: string, won: boolean, end: string): Promise<void> {
  const player = page.locator("ruffle-player#battle");
  await player.waitFor({ timeout: 30_000 });
  await playerReady(page, label);
  // "Fin" again if the jump stopped short (a step stuck before the end: a new seek destroys it, as the stuck warning's
  // "Vague suivante" does)
  let last: SwfState | undefined;
  for (let i = 0; i < 4 && !(last && (last.ended || last.idx >= last.total)); i++) {
    await page.keyboard.press("End");
    last = await until(page, () => swfState(page), (s) => s.ended || s.idx >= s.total, 30_000, `${label}: end of the battle after "Fin"`).catch(() => undefined);
  }
  assert.ok(last, `${label}: end of the battle after "Fin"`);
  // The banner crop is compared at full size: with the log beside it (wide window) the player is scaled down, so the
  // log is folded for the comparison, then unfolded again to click "continuer" on the scaled player.
  const scaled = (await player.boundingBox())!.width < 719;
  if (scaled) {
    await page.click("#mtp-log summary");
    await until(page, async () => (await player.boundingBox())!.width, (w) => Math.abs(w - 720) < 1, 10_000, `${label}: full size with the log folded`);
  }
  let box = (await player.boundingBox())!;
  const victory = readFileSync(join(FIXTURES, "banner-victoire.png"));
  const defeat = readFileSync(join(FIXTURES, "banner-defaite.png"));
  const clip = { x: box.x + BANNER.dx, y: box.y + BANNER.dy, width: BANNER.width, height: BANNER.height };
  const deadline = Date.now() + Number(process.env.MT_E2E_BATTLE_MS ?? 400_000);
  // The crop matches a reference up to PNG encoding noise (measured: 0.0002 mean channel difference, banners 10.4 apart).
  const banner = (png: Buffer): "VICTOIRE" | "DEFAITE" | null =>
    pngDistance(png, victory) < 1 ? "VICTOIRE" : pngDistance(png, defeat) < 1 ? "DEFAITE" : null;
  // Ruffle's "hardware acceleration is disabled" notice (GPU-less Chromium) may cover the banner: closed like its × would.
  const closeNotice = (): Promise<void> =>
    page.evaluate(() => {
      const el = (globalThis as unknown as { document: { getElementById(id: string): { shadowRoot?: { getElementById(id: string): { classList: { add(c: string): void } } | null } } | null } }).document.getElementById("battle");
      el?.shadowRoot?.getElementById("hardware-acceleration-modal")?.classList.add("hidden");
    });
  await closeNotice();
  let shot = await page.screenshot({ clip });
  while (banner(shot) === null) {
    if (Date.now() > deadline) {
      // kept for diagnosis (var/ is gitignored)
      writeFileSync(join(REPO, "var", `e2e-${label}-banner.png`), shot);
      writeFileSync(join(REPO, "var", `e2e-${label}-player.png`), await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } }));
      assert.fail(`${label}: no end-of-battle banner (crops saved in var/)`);
    }
    await page.waitForTimeout(1000);
    await closeNotice();
    shot = await page.screenshot({ clip });
  }
  assert.equal(banner(shot), won ? "VICTOIRE" : "DEFAITE", `${label}: banner drawn by the SWF vs winner in the database`);
  if (scaled) {
    await page.click("#mtp-log summary");
    box = await until(page, async () => (await player.boundingBox())!, (b) => b.width < 719, 10_000, `${label}: scaled again with the log beside`);
  }
  const k = box.width / 720;
  // Ruffle swallows the first click on a fresh page (activation); the next one reaches "continuer".
  for (let i = 0; i < 4 && page.url() !== end; i++) {
    await page.mouse.click(box.x + CONTINUE.dx * k, box.y + CONTINUE.dy * k);
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
      await page.waitForSelector("#submit:not([disabled])", { timeout: 60_000 });
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

// Enhanced battle player (public/js/player.js) on the "just fought" page: keyboard without clicking into Ruffle (and
// never over an input, Ctrl/Meta or F5), pause button, log click forward, wave click backward (mtGoto on the same
// Ruffle element, no SWF reloaded, right index, pause kept), every seek through mtGoto, PNG capture, the hover help
// bubble, the log beside the player (wide window) and folded, x32 then "Fin": the end banner still shows the stored
// winner and its button still leads to /hq?money=N. Then ?at=N on the replay page, and a 390 px wide window without
// horizontal scrolling.
type Doc = {
  body: { appendChild(e: unknown): void; dispatchEvent(e: unknown): boolean };
  documentElement: { scrollWidth: number; clientWidth: number };
  createElement(t: string): { id: string };
  getElementById(id: string): { __old?: boolean; remove(): void; getBoundingClientRect(): { width: number; right: number } };
};

for (const mode of ["path", "subdomain"] as Mode[]) {
  test(`[e2e ${mode}] enhanced player: shortcuts, pause, seeks through mtGoto, capture, help bubble, log beside, x32 to the end, ?at=, mobile`, { timeout: 900_000 }, async (t) => {
    if (!browsersInstalled()) return t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
    mkdirSync(join(REPO, "var"), { recursive: true });
    const dataDir = mkdtempSync(join(REPO, "var", `e2e5-${mode}-`));
    const port = await freePort();
    const root = mode === "path" ? `http://localhost:${port}` : `http://${BASE_DOMAIN}:${port}`;
    const at = (host: string, path: string): string => (mode === "path" ? `${root}/a/${host}${path}` : `http://${host}.${BASE_DOMAIN}:${port}${path}`);
    const env: Record<string, string> = { URL_MODE: mode, PORT: String(port), DATA_DIR: dataDir, ...(mode === "subdomain" ? { BASE_DOMAIN } : {}) };
    const server = await startServer(env);
    const browser = await launch();
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(join(dataDir, "minitroopers.db"), { readOnly: true });
      const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 }, acceptDownloads: true })).newPage();
      page.on("dialog", (d) => void d.accept());
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      let swfLoads = 0;
      page.on("request", (r) => {
        if (r.url().includes("/swf/client_fr_play.swf")) swfLoads++;
      });
      await page.goto(`${root}/`);
      await createArmyIn(page, "Bidasses", at("bidasses", "/hq"));
      const army = db.prepare("SELECT id FROM armies WHERE host = 'bidasses'").get() as { id: number };
      await page.goto(at("bidasses", "/b/opp"));
      await Promise.all([page.waitForURL((u) => u.href.startsWith(at("bidasses", "/b/view/bat1?d="))), page.click('a.button5[href*="/b/battle?"] >> nth=0')]);
      const battleUrl = page.url();
      const b = db.prepare("SELECT input, winner FROM battles WHERE attacker_id = ?").get(army.id) as { input: string; winner: number | null };
      const won = b.winner !== null && b.winner === (JSON.parse(b.input) as BattleInput).attackerSide;
      await page.locator("ruffle-player#battle").waitFor({ timeout: 30_000 });
      const ready = await playerReady(page, `${mode}-player`);
      const landed = (n: number, idx: number): boolean => idx === n;
      // every seek of the page must go through the SWF's mtGoto: its calls are recorded (window.__gotos)
      await page.evaluate(() => {
        const g = globalThis as unknown as { __gotos: number[]; document: { getElementById(id: string): Record<string, (n: number) => boolean> } };
        const el = g.document.getElementById("battle");
        const orig = el.mtGoto!;
        g.__gotos = [];
        // a data property, whatever Ruffle defined (its callbacks may be accessors)
        Object.defineProperty(el, "mtGoto", {
          configurable: true,
          writable: true,
          value: (n: number) => {
            g.__gotos.push(n);
            return orig.call(el, n);
          },
        });
        if (el.mtGoto === orig) throw new Error("mtGoto spy not installed");
      });
      const gotos = (): Promise<number[]> => page.evaluate(() => (globalThis as unknown as { __gotos: number[] }).__gotos.slice());

      // 1. shortcuts without any click into Ruffle: Shift+Space pauses, K resumes (BetterTrooper's keys)
      await page.keyboard.press("Shift+Space");
      await until(page, () => swfState(page), (s) => s.paused, 10_000, "Shift+Space pauses");
      await page.keyboard.press("k");
      await until(page, () => swfState(page), (s) => !s.paused, 10_000, "K resumes");
      // not taken: F5, Ctrl+R, Ctrl+K, Meta+Space (default action kept, nothing done)
      const prevented = await page.evaluate(() => {
        const KE = (globalThis as unknown as { KeyboardEvent: new (t: string, o: object) => { defaultPrevented: boolean } }).KeyboardEvent;
        const d = (globalThis as unknown as { document: Doc }).document;
        return [{ key: "F5" }, { key: "r", ctrlKey: true }, { key: "k", ctrlKey: true }, { key: " ", metaKey: true }].map((k) => {
          const e = new KE("keydown", { ...k, bubbles: true, cancelable: true });
          d.body.dispatchEvent(e);
          return e.defaultPrevented;
        });
      });
      assert.deepEqual(prevented, [false, false, false, false], "F5, Ctrl+R, Ctrl+K, Meta+Space not intercepted");
      // typing into a field types, it does not drive the player
      await page.evaluate(() => {
        const d = (globalThis as unknown as { document: Doc }).document;
        const i = d.createElement("input");
        i.id = "probe";
        d.body.appendChild(i);
      });
      await page.focus("#probe");
      await page.keyboard.type("k c");
      assert.equal(await page.inputValue("#probe"), "k c");
      assert.equal((await swfState(page)).paused, false, "keys typed into a field ignored");
      await page.evaluate(() => (globalThis as unknown as { document: Doc }).document.getElementById("probe").remove());

      // 2. pause button (the seeks below run paused: they land exactly where asked)
      await page.click("#mtp-play");
      const s0 = await until(page, () => swfState(page), (s) => s.paused, 10_000, "pause button");

      // 3. forward: a click on a log line ahead applies that entry (seek to j + 1): it becomes the highlighted line;
      // → goes one history entry further; the share dialog's "event" link reopens there (step 7)
      const lines = await page.locator("#mtp-log li[data-i]").evaluateAll((els) => els.map((e) => Number((e as unknown as { dataset: { i: string } }).dataset.i)));

      // the log's lines as BetterTrooper's: a clock badge (turquoise "warp" when the entry's time is below the
      // clock), faction-coloured names with a head, weapon icons, HUD lines, deploy lines
      const drawn = await page.evaluate(() => {
        type El = { textContent: string; className: string; getAttribute(a: string): string | null; querySelector(s: string): El | null; querySelectorAll(s: string): ArrayLike<El> };
        const g = globalThis as unknown as { document: { querySelectorAll(s: string): ArrayLike<El>; querySelector(s: string): El | null }; mtLog: { i: number; t: string; c: number; x?: number }[]; getComputedStyle(e: El, p?: string): { backgroundImage: string; backgroundColor: string } };
        const lis = Array.from(g.document.querySelectorAll("#mtp-log li[data-i]"));
        const byI = new Map(g.mtLog.map((l) => [l.i, l]));
        const bad: string[] = [];
        for (const li of lis) {
          const l = byI.get(Number(li.getAttribute("data-i")))!;
          const time = li.querySelector(".mtp-time");
          if (!time || time.textContent !== String(l.c)) bad.push(`clock of ${l.i}`);
          if (!!time && time.className.includes("mtp-time--warp") !== (l.x === 1)) bad.push(`warp of ${l.i}`);
          if (!li.textContent.endsWith(l.t)) bad.push(`text of ${l.i}`);
        }
        const name = g.document.querySelectorAll("#mtp-log .mtp-lname[data-faction]")[0];
        return {
          bad,
          names: g.document.querySelectorAll("#mtp-log .mtp-lname[data-faction]").length,
          head: name ? g.getComputedStyle(name, "::before").backgroundImage : "",
          huds: g.document.querySelectorAll("#mtp-log .mtp-hud .mtp-stat").length,
          deploys: lis.filter((li) => li.textContent.includes(" déploie : ")).length,
          wicons: g.document.querySelectorAll("#mtp-log .mtp-wicon").length,
          clock: lis[0] ? g.getComputedStyle(lis[0].querySelector(".mtp-time")!).backgroundImage : "",
          wave: ((e: El | null) => (e ? [g.getComputedStyle(e).backgroundImage, g.getComputedStyle(e).backgroundColor] : []))(g.document.querySelector("#mtp-track .mtp-curwave")),
        };
      });
      assert.deepEqual(drawn.bad, [], "every line: clock badge, warp colour, text");
      assert.ok(drawn.names > 0 && /\/img\/log\/(trooper-[0-5]|rat|clown)\.png/.test(drawn.head), `names with a head: ${JSON.stringify(drawn)}`);
      assert.match(drawn.clock, /\/img\/log\/battle-clock\.png/, "the game's clock in the badge");
      assert.deepEqual(drawn.wave, ["none", "rgb(255, 218, 73)"], "current wave: flat yellow, no gradient");
      assert.ok(drawn.huds > 0 && drawn.deploys > 0 && drawn.wicons > 0, `HUD, deploy lines, weapon icons: ${JSON.stringify(drawn)}`);
      const firstWave = ready.starts[0] ?? 0;
      const k = lines.findIndex((i) => i >= Math.max(s0.idx + 3, firstWave + 3) && i < ready.total - 3);
      assert.ok(k >= 0 && k + 1 < lines.length, "a log line ahead, and one after it");
      const j = lines[k]!;
      const current = (): Promise<number | null> =>
        page.evaluate(() => {
          const li = (globalThis as unknown as { document: { querySelector(s: string): { getAttribute(a: string): string } | null } }).document.querySelector("#mtp-log li.mtp-cur");
          return li ? Number(li.getAttribute("data-i")) : null;
        });
      await page.click(`#mtp-log li[data-i="${j}"]`);
      const s1 = await until(page, () => swfState(page), (s) => !s.seeking && s.idx > j, 120_000, `seek to line ${j}`);
      assert.ok(landed(j + 1, s1.idx), `log click: idx ${s1.idx} for line ${j}`);
      await page.waitForTimeout(800);
      assert.equal((await swfState(page)).idx, s1.idx, "still paused after the seek");
      assert.equal(await page.locator("#mtp-log li.mtp-cur").count(), 1, "one current log line");
      assert.equal(await current(), j, "the clicked line is the highlighted one");
      await page.keyboard.press("ArrowRight");
      const s1b = await until(page, () => swfState(page), (s) => !s.seeking && s.idx > s1.idx, 120_000, "→ one entry further");
      assert.equal(s1b.idx, s1.idx + 1, "→: one history entry");
      const j2 = lines.filter((i) => i <= s1b.idx - 1).at(-1)!;
      assert.equal(await until(page, current, (c) => c === j2, 5_000, "highlight after →"), j2);
      // S: the share dialog (Ruffle paused under it), started at this event
      await page.keyboard.press("s");
      await until(page, () => page.evaluate(() => (globalThis as unknown as { document: { getElementById(id: string): { open: boolean } } }).document.getElementById("mtp-share").open), (o) => o, 5_000, "share dialog");
      await page.click('#mtp-share .mtp-share__choice[data-start="event"]');
      const message = await page.inputValue("#mtp-share textarea");
      const link = /\]\((.*)\)$/.exec(message)![1]!;
      assert.ok(link.endsWith(`at=${s1b.idx}`), `share link ${link}`);
      await page.keyboard.press("Escape");
      const share = await page.evaluate(() => (globalThis as unknown as { mtShare: string | null }).mtShare);
      await page.evaluate(() => (globalThis as unknown as { document: { activeElement: { blur(): void } } }).document.activeElement.blur());

      // 4. backward: a click on the timeline inside wave 2 (= that wave's start: the first keyframe after its NewWave,
      // starts[0]), or without waves Shift + click at half the current index (= that exact event) → mtGoto there on the
      // same Ruffle element, no SWF reloaded, still paused
      const back = ready.waves.length > 0 ? firstWave : Math.floor(s1.idx / 2);
      assert.ok(back < s1.idx && back > 0, `a target before the current index (${back} < ${s1.idx})`);
      await page.evaluate(() => {
        (globalThis as unknown as { document: Doc }).document.getElementById("battle").__old = true;
      });
      const players = (await playerInfo(page)).players;
      const loads = swfLoads;
      assert.ok(loads >= 1, "the SWF was requested");
      const track = (await page.locator("#mtp-track").boundingBox())!;
      const x = track.x + ((ready.waves.length > 0 ? (ready.waves[0]! + back) / 2 + 0.5 : back + 0.25) / ready.total) * track.width;
      if (ready.waves.length === 0) await page.keyboard.down("Shift");
      await page.mouse.click(x, track.y + track.height / 2);
      if (ready.waves.length === 0) await page.keyboard.up("Shift");
      const s2 = await until(page, () => swfState(page), (s) => !s.seeking && s.idx < s1.idx, 10_000, "backward seek done");
      assert.ok(landed(back, s2.idx), `backward: idx ${s2.idx} for ${back}`);
      assert.equal(await page.evaluate(() => (globalThis as unknown as { document: Doc }).document.getElementById("battle").__old), true, "the same Ruffle element");
      assert.equal((await playerInfo(page)).players, players, "no new Ruffle player");
      assert.equal(swfLoads, loads, "no new request of the SWF");
      assert.equal((await playerInfo(page)).idx, back, "the page's idx");
      assert.equal(s2.paused, true, "pause kept");
      assert.equal(s2.speed, s0.speed, "speed kept");
      assert.deepEqual((await gotos()).slice(-1), [back], "the timeline click went through mtGoto");

      // 4b. every other seek goes through mtGoto and lands at once: ← → Maj+→ N P Début Fin, the Début/Fin buttons;
      // back from the end, the end banner is gone and the end is reported again on the way back
      const seekBy = async (what: string, act: () => Promise<void>): Promise<SwfState> => {
        const before = (await gotos()).length;
        await act();
        const calls = await until(page, gotos, (g) => g.length > before, 5_000, `${what}: mtGoto called`);
        const n = calls.at(-1)!;
        const s = await until(page, () => swfState(page), (s) => !s.seeking && s.idx === n, 10_000, `${what}: landed on ${n}`);
        assert.equal(calls.length, before + 1, `${what}: one mtGoto`);
        assert.equal(s.paused, true, `${what}: still paused`);
        return s;
      };
      const r1 = await seekBy("→", () => page.keyboard.press("ArrowRight"));
      assert.ok(r1.idx > back);
      const r2 = await seekBy("←", () => page.keyboard.press("ArrowLeft"));
      assert.ok(r2.idx < r1.idx);
      const r3 = await seekBy("Maj+→", () => page.keyboard.press("Shift+ArrowRight"));
      assert.equal(r3.idx, Math.min(ready.total, r2.idx + 10));
      const r3b = await seekBy("+5", () => page.click('.mtp-transport [data-step="5"]'));
      assert.equal(r3b.idx, Math.min(ready.total, r3.idx + 5));
      if (r3b.wave < ready.waves.length) {
        // N: the start (starts[k]) of the next wave; P: the start of the current wave, which is that one
        const r4 = await seekBy("N", () => page.keyboard.press("n"));
        assert.equal(r4.idx, ready.starts[r3b.wave]);
        const r5 = await seekBy("P", () => page.keyboard.press("p"));
        assert.equal(r5.idx, r4.idx);
      }
      const r6 = await seekBy("Fin", () => page.keyboard.press("End"));
      assert.equal(r6.idx, ready.total);
      await until(page, () => swfState(page), (s) => s.ended, 10_000, "ended at the end");
      const r7 = await seekBy("Début", () => page.keyboard.press("Home"));
      assert.equal(r7.idx, 0);
      assert.equal(r7.ended, false, "not ended any more");
      assert.equal(r7.banner, false, "no end banner any more");
      const r8 = await seekBy("E", () => page.keyboard.press("e"));
      assert.equal(r8.idx, ready.total);
      assert.equal((await seekBy("H", () => page.keyboard.press("h"))).idx, 0);
      await seekBy("back to the wave start", () => page.evaluate((n) => {
        (globalThis as unknown as { document: { querySelector(s: string): { click(): void } } }).document.querySelector(`#mtp-log li[data-i="${n}"]`).click();
      }, lines.find((i) => i >= back)!));
      assert.equal((await playerInfo(page)).players, players, "still one Ruffle player");
      assert.equal(swfLoads, loads, "still no new request of the SWF");

      // 5. capture: the dialog, its game-only picture downloaded as a 720x440 PNG
      await page.click("#mtp-shot");
      await until(page, () => page.evaluate(() => (globalThis as unknown as { document: { getElementById(id: string): { open: boolean } } }).document.getElementById("mtp-shotdlg").open), (o) => o, 10_000, "capture dialog");
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.click('#mtp-shotdlg [data-shot="game"] [data-act="download"]')]);
      assert.match(download.suggestedFilename(), /\.png$/);
      const png = decodePng(readFileSync((await download.path())!));
      assert.deepEqual([png.width, png.height], [720, 440]);
      await page.keyboard.press("Escape");

      // 5b. the "?" button: hovering it shows the site's own tooltip (#tooltip of app.js, .tiptop markup like every
      // other tip) next to it, inside the window, "Raccourcis clavier" then "Souris"; leaving hides it; keyboard focus
      // shows it; ? and Ctrl+/ toggle it, Échap closes it
      type Rect = { left: number; top: number; right: number; bottom: number };
      type HelpState = { shown: boolean; titles: string[]; kbd: number; rows: number; btn: Rect; tip: Rect | null; vw: number; vh: number };
      const helpState = (): Promise<HelpState> =>
        page.evaluate(() => {
          type El = { style: { top: string }; getBoundingClientRect(): Rect; querySelector(s: string): El | null; querySelectorAll(s: string): ArrayLike<{ textContent: string }> };
          const g = globalThis as unknown as { document: { getElementById(id: string): El | null }; innerWidth: number; innerHeight: number; mt: { js: { Tip: { lastRef: unknown } } } };
          const box = (e: El): Rect => {
            const b = e.getBoundingClientRect();
            return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
          };
          const btn = g.document.getElementById("mtp-helpbtn")!;
          const t = g.document.getElementById("tooltip");
          const top = t?.querySelector(".tiptop") ?? null;
          const shown = !!t && t.style.top !== "-1000px" && g.mt.js.Tip.lastRef === btn;
          return { shown, titles: top ? Array.from(top.querySelectorAll("h1"), (h) => h.textContent) : [], kbd: top ? top.querySelectorAll("kbd").length : 0, rows: top ? top.querySelectorAll("tr").length : 0, btn: box(btn), tip: top ? box(top) : null, vw: g.innerWidth, vh: g.innerHeight };
        });
      const helpIs = (shown: boolean, what: string): Promise<HelpState> => until(page, helpState, (s) => s.shown === shown, 2_000, what);
      assert.equal((await helpState()).shown, false, "help hidden at first");
      await page.hover("#mtp-helpbtn");
      const h1 = await helpIs(true, "tooltip on hover");
      assert.deepEqual(h1.titles, ["Raccourcis clavier", "Souris"], "the site's tooltip, two sections");
      assert.ok(h1.kbd >= 15 && h1.rows >= 14, `keys as keycaps, key | action and place | gesture | effect tables: ${JSON.stringify(h1)}`);
      const tb = h1.tip!;
      const gap = Math.max(tb.left - h1.btn.right, h1.btn.left - tb.right, tb.top - h1.btn.bottom, h1.btn.top - tb.bottom);
      assert.ok(gap <= 30, `tooltip next to the button: ${JSON.stringify(h1)}`);
      assert.ok(tb.left >= 0 && tb.top >= 0 && tb.right <= h1.vw && tb.bottom <= h1.vh, `tooltip inside the window: ${JSON.stringify(h1)}`);
      await page.mouse.move(5, 5);
      await helpIs(false, "hidden when the mouse leaves");
      await page.focus("#mtp-helpbtn");
      const h2 = await helpIs(true, "tooltip on keyboard focus");
      assert.ok(h2.tip!.top >= 0 && h2.tip!.bottom <= h2.vh, `focused: inside the window ${JSON.stringify(h2)}`);
      await page.evaluate(() => (globalThis as unknown as { document: { activeElement: { blur(): void } } }).document.activeElement.blur());
      await helpIs(false, "hidden on blur");
      await page.keyboard.press("?");
      await helpIs(true, "? shows it");
      await page.keyboard.press("?");
      await helpIs(false, "? hides it");
      await page.keyboard.press("Control+/");
      await helpIs(true, "Ctrl+/ shows it");
      await page.keyboard.press("Escape");
      await helpIs(false, "Échap hides it");

      // 5c. wide window: the log beside the player, same height, its own scrolling; the player scaled down (mtShot
      // above still gave 720x440); folding the log puts the player back to full size, centred
      type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
      const layout = (): Promise<{ frame: Box; log: Box; battle: Box; game: Box; list: Box; overflow: string }> =>
        page.evaluate(() => {
          const d = (globalThis as unknown as { document: { querySelector(s: string): { getBoundingClientRect(): Box; scrollHeight: number; clientHeight: number } } }).document;
          const r = (s: string): Box => {
            const b = d.querySelector(s).getBoundingClientRect();
            return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
          };
          const list = d.querySelector("#mtp-log .mtp-lines");
          return { frame: r(".mtp-game .swfframe"), log: r("#mtp-log"), battle: r("#battle"), game: r(".mtp-game"), list: r("#mtp-log .mtp-lines"), overflow: (globalThis as unknown as { getComputedStyle(e: unknown): { overflowY: string } }).getComputedStyle(list).overflowY };
        });
      const l1 = await layout();
      assert.ok(l1.log.left >= l1.frame.right, `log on the right: ${JSON.stringify(l1)}`);
      assert.ok(Math.abs(l1.log.top - l1.frame.top) <= 1 && Math.abs(l1.log.height - l1.frame.height) <= 2, `log as high as the player: ${JSON.stringify(l1)}`);
      assert.ok(Math.abs(l1.battle.width - 580) <= 2, `player scaled to 580 px: ${JSON.stringify(l1.battle)}`);
      // the list fills the log down to its bottom and scrolls there (a short battle may not need to)
      assert.ok(l1.overflow === "auto" && Math.abs(l1.list.bottom - l1.log.bottom) <= 2, `the log scrolls inside: ${JSON.stringify(l1)}`);
      await page.click("#mtp-log summary");
      const l2 = await until(page, layout, (l) => Math.abs(l.battle.width - 720) <= 1, 5_000, "full size with the log folded");
      assert.ok(Math.abs((l2.frame.left + l2.frame.right) / 2 - (l2.game.left + l2.game.right) / 2) <= 2, `player centred: ${JSON.stringify(l2)}`);
      assert.ok(l2.log.top >= l2.frame.bottom, "folded log under the player");
      await page.click("#mtp-log summary");
      await until(page, layout, (l) => l.log.left >= l.frame.right, 5_000, "log beside again");

      // 6. x32, play, then "Fin": the banner shows the stored winner, its button leads to /hq?money=N
      await page.locator("#mtp-speed").fill("18"); // the speed slider's last notch: x32
      await page.click("#mtp-play");
      const s3 = await until(page, () => swfState(page), (s) => !s.paused, 10_000, "play button");
      assert.equal(s3.speed, 32);
      assert.deepEqual(errors, []);
      await swfReplay(page, `${mode}-player`, won, at("bidasses", `/hq?money=${won ? 2 : 1}`));

      // 7. the share link (?at=N) on the battle's public page (mtShare): the first reported index is N, whose current
      // line is j2 again
      assert.ok(share && link.startsWith(share), `share link ${link} on the public page ${share}`);
      await page.goto(link);
      await playerReady(page, `${mode}-at`);
      const p = await until(page, () => playerInfo(page), (p) => p.first !== null, 120_000, "first mtProgress with ?at=");
      assert.ok(landed(s1b.idx, p.first!), `?at=${s1b.idx}: started at ${p.first}`);
      assert.equal(p.players, 1, "?at= without a second Ruffle player");
      const lineAt = lines.filter((i) => i <= p.first! - 1).at(-1);
      assert.equal(lineAt, j2, "the shared moment shows the same current line");

      // 8. 390 px wide: the player is scaled down, no horizontal scrolling
      const m = await page.context().newPage();
      await m.setViewportSize({ width: 390, height: 844 });
      await m.goto(battleUrl);
      await m.locator("ruffle-player#battle").waitFor({ timeout: 30_000 });
      await playerReady(m, `${mode}-mobile`);
      const sizes = await m.evaluate(() => {
        const d = (globalThis as unknown as { document: Doc }).document;
        const r = d.getElementById("battle").getBoundingClientRect();
        return { scroll: d.documentElement.scrollWidth, client: d.documentElement.clientWidth, width: r.width, right: r.right };
      });
      assert.ok(sizes.scroll <= sizes.client, `no horizontal scrolling: ${JSON.stringify(sizes)}`);
      assert.ok(sizes.width <= 390 && sizes.width > 300 && sizes.right <= 390, `player scaled to the width: ${JSON.stringify(sizes)}`);
      assert.ok(await m.locator("#mtp-bar").isVisible());
      const under = await m.evaluate(() => {
        const d = (globalThis as unknown as { document: { querySelector(s: string): { getBoundingClientRect(): { top: number; bottom: number } } } }).document;
        return { frame: d.querySelector(".mtp-game .swfframe").getBoundingClientRect().bottom, log: d.querySelector("#mtp-log").getBoundingClientRect().top };
      });
      assert.ok(under.log >= under.frame, `narrow window: the log under the player ${JSON.stringify(under)}`);
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
  await page.waitForSelector("#submit:not([disabled])", { timeout: 60_000 });
  await Promise.all([page.waitForURL(hq).catch(async (e: unknown) => {
    throw new Error(`creation of ${name}: at ${page.url()}: ${(await page.textContent("body"))?.replace(/\s+/g, " ").slice(0, 400)}`, { cause: e });
  }), page.click("#submit")]);
}

// Stage 3: referral, missions, raid, password. A creates an army; B signs up through A's recruit link;
// A opens /history (+100 bounty), unlocks the missions and plays Exterminer, raids with B, then sets a password.
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

      // 4. A unlocks the missions (5) and plays one of them (Exterminer: every mission is there every day)
      await pa.goto(at("bidasses", "/hq"));
      await Promise.all([pa.waitForURL(at("bidasses", "/hq")), pa.click('a[href*="/b/unlock?chk="]')]);
      assert.equal(armyOf("bidasses")!.credits, 100 - MISSION_UNLOCK_COST);
      await Promise.all([pa.waitForURL((u) => u.href.startsWith(at("bidasses", "/b/view/miss1?d="))), pa.click('a[href*="/b/mission?type=exterminate;n=0;chk="]')]);
      const m = db.prepare("SELECT input, winner, mode FROM battles WHERE attacker_id = ? AND kind = 'mission'").get(a.id) as { input: string; winner: number | null; mode: string };
      assert.equal(m.mode, "exterminate");
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

// Stage 4: an army of 5 troopers with one recruit and one battle suffered walks every page (no same-site 404, the
// favicon and the stylesheet's images included); /choice's "Valider" (`_.swfAction('client','save')`, the original
// app.js helper calling the SWF's ExternalInterface `save`) sends the order the SWF read from /load to /save; the
// /history recruits animation plays without leaving the page; the recruit (1 trooper) ends its day on /endDay.
for (const mode of ["path", "subdomain"] as Mode[]) {
  test(`[e2e ${mode}] stage-4 pages without a 404, /choice saved by the SWF, recruits animation, /endDay`, { timeout: 600_000 }, async (t) => {
    if (!browsersInstalled()) return t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
    mkdirSync(join(REPO, "var"), { recursive: true });
    const dataDir = mkdtempSync(join(REPO, "var", `e2e4-${mode}-`));
    const port = await freePort();
    const root = mode === "path" ? `http://localhost:${port}` : `http://${BASE_DOMAIN}:${port}`;
    const at = (host: string, path: string): string => (mode === "path" ? `${root}/a/${host}${path}` : `http://${host}.${BASE_DOMAIN}:${port}${path}`);
    const env: Record<string, string> = { URL_MODE: mode, PORT: String(port), DATA_DIR: dataDir, ...(mode === "subdomain" ? { BASE_DOMAIN } : {}) };
    const server = await startServer(env);
    const browser = await launch();
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(join(dataDir, "minitroopers.db"));
      const missing: string[] = [];
      const sameSite = (u: string): boolean => {
        const { hostname, port: p } = new URL(u);
        return p === String(port) && (hostname === "localhost" || hostname === BASE_DOMAIN || hostname.endsWith(`.${BASE_DOMAIN}`));
      };
      const newPage = async (): Promise<Page> => {
        const p = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
        p.on("dialog", (d) => void d.accept());
        p.on("response", (r) => {
          if (r.status() === 404 && sameSite(r.url())) missing.push(r.url());
        });
        return p;
      };

      // 1. Boss: created in the browser, 5 troopers, a stored deployment order that is not the slot order
      const pa = await newPage();
      await pa.goto(`${root}/`);
      await createArmyIn(pa, "Boss", at("boss", "/hq"));
      const boss = (db.prepare("SELECT id FROM armies WHERE host = 'boss'").get() as { id: number }).id;
      const ins = db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?, ?, ?, ?, '[0]')");
      for (let s = 1; s < 5; s++) ins.run(boss, s, 1000 + s, `N${s}`);
      const order = [3, 1, 4, 0, 2];
      db.prepare("UPDATE armies SET deploy_order = ? WHERE id = ?").run(JSON.stringify(order), boss);

      // 2. Warp signs up through Boss's link, attacks Boss by name ("Infiltrer !"), then ends its day with 2 battles
      const pb = await newPage();
      await pb.goto(at("boss", "/"));
      await createArmyIn(pb, "Warp", at("warp", "/hq"));
      await pb.goto(at("warp", "/b/opp"));
      await pb.fill('#friends input[name="friend"]', "Boss");
      await Promise.all([pb.waitForURL(at("warp", "/b/fview/1")), pb.click('a.button5:has-text("Infiltrer")')]);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM battles WHERE defender_id = ?").get(boss) as { n: number }).n, 1, "battle suffered by Boss");
      for (let i = 0; i < 2; i++) {
        await pb.goto(at("warp", "/b/opp"));
        await Promise.all([pb.waitForURL((u) => u.href.startsWith(at("warp", "/b/view/"))), pb.click('a.button5[href*="/b/battle?"] >> nth=0')]);
      }
      await pb.goto(at("warp", "/endDay"));
      assert.equal(pb.url(), at("warp", "/endDay"), "Warp's day is over: /endDay is shown");
      assert.ok((await pb.content()).includes("art_congrats.png"));

      // 3. Boss fights one battle (its /b/view/bat1?d=), then walks the stage-4 pages
      await pa.goto(at("boss", "/b/opp"));
      await Promise.all([pa.waitForURL((u) => u.href.startsWith(at("boss", "/b/view/bat1?d="))), pa.click('a.button5[href*="/b/battle?"] >> nth=0')]);
      await pa.locator("ruffle-player#battle").waitFor({ timeout: 30_000 });
      for (const p of ["/hq", "/t/0", "/add", "/b/opp", "/ranks", "/protect"]) {
        const res = await pa.goto(at("boss", p));
        assert.equal(res?.status(), 200, p);
        assert.equal(pa.url(), at("boss", p));
      }
      assert.ok((await pa.content()).includes("Gérer mon armée"), "menu with 5 troopers");
      const visitor = await newPage();
      await visitor.goto(`${root}/`);

      // 4. /history: confirms the recruit, shows the defence, plays the recruits animation in place
      await pa.goto(at("boss", "/history"));
      const hist = await pa.content();
      assert.match(hist, /<li class="(win|defeat)"><a href=/, "the defence is listed");
      await pa.locator("ruffle-player#recuits").waitFor({ timeout: 30_000 });
      await pa.waitForTimeout(5_000);
      assert.equal(pa.url(), at("boss", "/history"), "the animation does not leave the page");

      // 5. /choice: the SWF loads the troopers (/load), "Valider" sends its order to /save, back to /hq
      const saves: string[] = [];
      pa.on("request", (r) => {
        if (r.url().includes("/save?")) saves.push(r.url());
      });
      const loaded = pa.waitForResponse((r) => r.url().startsWith(at("boss", "/load?pos=0;count=16")), { timeout: 30_000 });
      await pa.goto(at("boss", "/choice"));
      assert.equal((await loaded).status(), 200, "the SWF pages the recruits through /load");
      await pa.locator("ruffle-player#client").waitFor({ timeout: 30_000 });
      db.prepare("UPDATE armies SET deploy_order = NULL WHERE id = ?").run(boss); // the SWF already holds the order: /save must write it back
      // The SWF registers its `save` callback before it has drawn the army: a call made too early throws inside the SWF
      // (Error #1009, logged by Ruffle) and sends nothing, so "Valider" is retried until the page leaves for /hq.
      const valider = (): Promise<void> => pa.evaluate(() => (globalThis as unknown as { _: { swfAction(s: string, n: string): void } })._.swfAction("client", "save"));
      for (let i = 0; i < 30 && saves.length === 0; i++) {
        await pa.waitForTimeout(1_000);
        await valider().catch(() => {});
      }
      await pa.waitForURL(at("boss", "/hq"), { timeout: 15_000 });
      assert.equal(saves.length, 1, `one /save: ${saves.join(" ")}`);
      const ids = /[?;&]c=([^;&]*)/.exec(decodeURIComponent(saves[0]!))![1]!.split(":").filter((x) => x !== "").map(Number); // empty grid cells: ""
      assert.deepEqual(ids.filter((id) => id <= 0).map((id) => Math.abs(id)), order, "/save gets the order shown by the SWF");
      const stored = db.prepare("SELECT deploy_order FROM armies WHERE id = ?").get(boss) as { deploy_order: string | null };
      assert.deepEqual(JSON.parse(stored.deploy_order ?? "null"), order, "deploy_order stored");

      assert.deepEqual(missing, [], "no same-site 404");
      // Playwright reports no response for /favicon.ico (not even for the <img src="/favicon.ico"/> of /history, observed
      // with the file removed): fetched directly.
      const fav = await pa.request.get(`${root}/favicon.ico`);
      assert.equal(fav.status(), 200);
      assert.equal(fav.headers()["content-type"], "image/x-icon");
    } finally {
      db?.close();
      await browser.close();
      await stop(server);
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
}
