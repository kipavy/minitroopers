/// <reference lib="dom" />
// The enhanced battle player's page side (public/js/player.js, public/css/player.css) in headless Chromium, against a
// stand-in for client_fr_play.swf: a plain element with the replay API (mtState, mtGoto, mtPause, mtResume, mtSpeed,
// mtShot) and Ruffle's pause()/play()/isPlaying, recording every call. Fast checks of what BetterTrooper's viewer does
// (scratchpad audit, bettertrooper-audit.md): transport steps, held steps, keyboard, speed notches, share and capture
// dialogs, toasts, the stuck banner, the fps readout, the log veil, mobile layouts. The real SWF is in e2e.test.ts.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { decodePng } from "./png.ts";

const REPO = resolve(import.meta.dirname, "../../..");
const PUBLIC = join(REPO, "apps/server/public");
const BROWSERS = join(REPO, "tools/bin/ms-playwright");
const TMP = join(REPO, "tools/bin/tmp");
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS;
const installed = existsSync(BROWSERS) && readdirSync(BROWSERS).some((d) => d.startsWith("chromium"));

/** 40 history entries, NewWave at 10 and 25, wave seeks landing on 12 and 27. */
const READY = { total: 40, checkpoints: [0, 12, 27], waves: [10, 25], starts: [12, 27] };
const LOG = Array.from({ length: 40 }, (_, i) => ({ i, w: i < 10 ? 0 : i < 25 ? 1 : 2, t: i % 7 === 3 ? "" : `ligne ${i}`, c: i, x: 0, s: null }));

const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" type="text/css" href="/css/style.css"/><link rel="stylesheet" type="text/css" href="/css/extras.css"/>
<link rel="stylesheet" type="text/css" href="/css/player.css"/>
<script src="/js/jquery.min.js"></script><script src="/js/app.js"></script>
<script>
var calls = [];
window.swfobject = { embedSWF: function (url, id) {
  var at = document.getElementById(id);
  var el = document.createElement("div");
  el.id = "battle";
  el.style.cssText = "width:720px;height:440px;background:#cde";
  var s = { idx: 0, wave: 0, total: 40, speed: 1, paused: false, ended: false, seeking: false, hidden: false, banner: false };
  var waveOf = function (n) { return n >= 27 ? 2 : n >= 12 ? 1 : 0; };
  el.isPlaying = true;
  el.pause = function () { calls.push(["pause"]); el.isPlaying = false; };
  el.play = function () { calls.push(["play"]); el.isPlaying = true; };
  el.mtState = function () { return Object.assign({}, s); };
  // simulated so far (the whole battle unless ?lazy: then 10 entries every 150 ms, held at ?stop=N until window.simGo)
  var lazy = /lazy/.test(location.search);
  var stop = Number((location.search.match(/stop=(\\d+)/) || [])[1] || 0);
  var events = lazy ? 0 : 40;
  s.target = -1;
  s.complete = !lazy;
  var land = function (n) { s.idx = n; s.wave = waveOf(n); s.ended = n >= 40; window.mtProgress(n, s.wave); if (s.ended) window.mtEnd(); };
  el.mtGoto = function (n) {
    calls.push(["goto", n]);
    if (n > events && !s.complete) { s.target = n; s.seeking = true; return false; }
    s.target = -1;
    s.seeking = false;
    land(n);
    return true;
  };
  el.mtAhead = function (n) { calls.push(["ahead", n]); };
  var READY = { waves: [10, 25], starts: [12, 27] };
  var sim = function () {
    var known = function (a) { return a.filter(function (w, i) { return READY.waves[i] < events; }); };
    s.total = events;
    window.mtSim({ events: events, complete: s.complete, waves: known(READY.waves), starts: known(READY.starts), checkpoints: [0] });
  };
  el.readyState = lazy ? 0 : 2;
  if (lazy) {
    s.total = 0;

    setTimeout(function () { el.readyState = 2; }, 1000);
    setTimeout(function () {
      api.forEach(function (a) { el[a[0]] = a[1]; });
      sim();
      var t = setInterval(function () {
        if (window.simHold || (stop && events >= stop && !window.simGo)) return;
        events = Math.min(40, events + 10);
        if (events >= 40) { s.complete = true; clearInterval(t); }
        sim();
        if (s.target >= 0 && events >= s.target) { var n = s.target; s.target = -1; s.seeking = false; land(n); }
        if (s.complete) window.mtReady({ total: 40, checkpoints: [0, 12, 27], waves: READY.waves, starts: READY.starts });
      }, 150);
      // ?noplay: the battle never plays its first entry (the loading veil stays)
      if (!/noplay/.test(location.search)) setTimeout(function () { land(1); }, 300);
    }, 1500);
  }
  // the game's own pause screen: it opens at the next frame, and the SWF tells the page (mtPaused) whatever the origin
  var tell = function (p) { setTimeout(function () { s.paused = p; window.mtPaused(p); }, window.frameMs || 20); };
  el.mtPause = function () { calls.push(["mtPause"]); if (!s.paused) tell(true); };
  el.mtResume = function () { calls.push(["mtResume"]); if (s.paused) tell(false); };
  el.clickField = function () { tell(!s.paused); };
  el.mtSpeed = function (x) { calls.push(["speed", x]); s.speed = x; };
  el.mtShot = function () { var b = ""; for (var i = 0; i < 720 * 440; i++) b += "\\xff\\x40\\x80\\xc0"; return btoa(b); };
  var api = [];
  if (lazy) ["mtState", "mtGoto", "mtAhead", "mtPause", "mtResume", "mtSpeed", "mtShot"].forEach(function (k) { api.push([k, el[k]]); delete el[k]; });
  at.parentNode.replaceChild(el, at);
} };
var mtLog = ${JSON.stringify(LOG)};
var mtAt = null;
var mtSides = [["A"], ["B"]];
var mtSide = 0;
var mtShare = "http://mt.example/b/fview/7";
var mtDate = "2026-11-25";
battleID = "7";
</script>
<script src="/js/sfx.js"></script><script src="/js/player.js"></script></head><body class="mtp">
<div class="game mtp-game"><div class="swfframe nam "><h1>
L'armée de A
VS
L'armée de B
</h1>
<div class="mtp-screen"><div class="mtp-stage"><div id="swf_battle"></div></div></div>
<div id="mtp-bar" class="mtp-bar"></div></div>
<div id="mtp-log" class="mtp-log"></div>
<script>swfobject.embedSWF("/x.swf", "swf_battle", 720, 440);</script>
</div></body></html>`;

const TYPES: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".gif": "image/gif", ".jpg": "image/jpeg", ".mp3": "audio/mpeg" };
let server: Server;
let base = "";
let browser: Awaited<ReturnType<typeof launch>>;

async function launch() {
  const { chromium } = await import("playwright");
  mkdirSync(TMP, { recursive: true });
  return chromium.launch({ headless: true, env: { ...process.env, TEMP: TMP, TMP: TMP, TMPDIR: TMP } as Record<string, string> });
}

before(async () => {
  if (!installed) return;
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (path === "/test.html") return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
    const file = join(PUBLIC, path);
    if (!file.startsWith(PUBLIC) || !existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await launch();
});
after(async () => {
  if (!installed) return;
  await browser.close();
  await new Promise((ok) => server.close(ok));
});

type Page = Awaited<ReturnType<typeof browser.newPage>>;
type Opts = { width?: number; height?: number; touch?: boolean; spy?: boolean };

/** The test page, the stand-in SWF ready (mtReady), the battle playing at idx `at`. */
async function open(o: Opts = {}, at = 5): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: o.width ?? 1280, height: o.height ?? 1000 }, acceptDownloads: true, hasTouch: !!o.touch, isMobile: !!o.touch });
  if (o.spy) await ctx.addInitScript(SPY);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const consoleMsgs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleMsgs.push(m.text());
  });
  (page as unknown as { console: string[] }).console = consoleMsgs;
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto(`${base}/test.html`);
  await page.evaluate(([r, n]) => {
    const w = window as unknown as { mtReady(r: unknown): void; document: Document };
    w.mtReady(r);
    (w.document.getElementById("battle") as unknown as { mtGoto(n: number): boolean }).mtGoto(n as number);
    (window as unknown as { calls: unknown[] }).calls.length = 0;
  }, [READY, at] as const);
  await page.waitForFunction(() => (document.querySelector(".mtp-veil") as HTMLElement).hidden, null, { timeout: 5000 });
  await page.waitForTimeout(450); // keys wait 400 ms more after the veil
  return page;
}
const calls = (page: Page): Promise<[string, number?][]> => page.evaluate(() => (window as unknown as { calls: [string, number?][] }).calls.slice());
const gotos = async (page: Page): Promise<number[]> => (await calls(page)).filter((c) => c[0] === "goto").map((c) => c[1]!);
const swf = (page: Page): Promise<{ idx: number; paused: boolean; speed: number }> =>
  page.evaluate(() => (document.getElementById("battle") as unknown as { mtState(): { idx: number; paused: boolean; speed: number } }).mtState());
const close = (page: Page): Promise<void> => page.context().close();
const skip = (t: { skip(m: string): void }): boolean => {
  if (!installed) t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
  return !installed;
};

test("transport: BetterTrooper's eight steps -50 -10 -5 -1 ‖ +1 +5 +10 +50 events, chevron masks, widths by icon", async (t) => {
  if (skip(t)) return;
  const page = await open();
  try {
    const steps = await page.$$eval(".mtp-transport .mtp-step", (bs) => bs.map((b) => ({ step: Number(b.getAttribute("data-step")), title: b.getAttribute("title"), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height, icon: b.querySelector(".mtp-chev")?.className ?? "" })));
    assert.deepEqual(steps.map((s) => s.step), [-50, -10, -5, -1, 1, 5, 10, 50]);
    assert.deepEqual(steps.map((s) => s.title), ["50 événements en arrière", "10 événements en arrière", "5 événements en arrière", "1 événement en arrière", "1 événement en avant", "5 événements en avant", "10 événements en avant", "50 événements en avant"]);
    assert.deepEqual(steps.map((s) => Math.round(s.w)), [46, 40, 34, 30, 30, 34, 40, 46], "padding 8 px + 10/16/22/28 px of chevrons (BetterTrooper measured 46 and 30)");
    assert.ok(steps.every((s) => Math.round(s.h) === 26));
    assert.match(steps[0]!.icon, /mtp-chev--4 mtp-chev--back/);
    const play = await page.$eval("#mtp-play", (b) => ({ w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height, label: b.getAttribute("aria-label"), title: b.getAttribute("title"), icon: b.querySelector(".mtp-playicon")?.className }));
    assert.deepEqual([Math.round(play.w), Math.round(play.h)], [52, 34]);
    assert.equal(play.label, "Pause");
    assert.equal(play.title, "Pause (K ou Maj + Espace, ou un clic sur le terrain)");
    assert.equal(play.icon, "mtp-playicon");
    for (const [sel, n] of [['[data-step="5"]', 10], ['[data-step="-50"]', 0], ['[data-step="50"]', 40]] as const) {
      await page.click(`.mtp-transport ${sel}`);
      assert.equal((await gotos(page)).at(-1), n, sel);
    }
    assert.equal(await page.$("#mtp-start, #mtp-end, #mtp-prevwave, #mtp-nextwave"), null, "no start, end or wave buttons");
    assert.deepEqual((page as unknown as { errors: string[] }).errors, []);
  } finally {
    await close(page);
  }
});

test("transport: a held step repeats after 500 ms, faster and faster; the pause button toggles, no « Revoir » at the end", async (t) => {
  if (skip(t)) return;
  const page = await open({}, 1);
  try {
    const b = (await page.$('.mtp-transport [data-step="1"]'))!.boundingBox();
    const box = (await b)!;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(250);
    assert.deepEqual(await gotos(page), [2], "one step at once, nothing more before 500 ms");
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForTimeout(100); // the steps added up for the next frame land with it
    const g = await gotos(page);
    assert.ok(g.length >= 3 && g.at(-1)! > 3, `repeated: ${JSON.stringify(g)}`);
    const n = g.length;
    await page.waitForTimeout(200);
    assert.equal((await gotos(page)).length, n, "stops on release");
    await page.evaluate(() => ((window as unknown as { frameMs: number }).frameMs = 400));
    await page.click("#mtp-play");
    assert.equal(await page.getAttribute("#mtp-play", "aria-label"), "Pause", "nothing before the SWF says so (mtPaused)");
    await page.waitForFunction(() => document.getElementById("mtp-play")!.getAttribute("aria-label") === "Reprendre");
    assert.equal((await swf(page)).paused, true);
    assert.match((await page.getAttribute("#mtp-play .mtp-playicon", "class"))!, /mtp-playicon--paused/);
    await page.click("#mtp-play");
    await page.waitForFunction(() => document.getElementById("mtp-play")!.getAttribute("aria-label") === "Pause");
    assert.equal((await swf(page)).paused, false);
    // a click on the battlefield: the SWF's own toggle, the page follows (mtPaused) without toggling again
    await page.evaluate(() => (document.getElementById("battle") as unknown as { clickField(): void }).clickField());
    await page.waitForFunction(() => document.getElementById("mtp-play")!.getAttribute("aria-label") === "Reprendre");
    assert.equal(await page.getAttribute("#mtp-play .mtp-playicon", "class"), "mtp-playicon mtp-playicon--paused");
    assert.deepEqual((await calls(page)).filter((c) => c[0] === "mtPause" || c[0] === "mtResume").length, 2, "no page toggle for the field click");
    await page.evaluate(() => (document.getElementById("battle") as unknown as { clickField(): void }).clickField());
    await page.waitForFunction(() => document.getElementById("mtp-play")!.getAttribute("aria-label") === "Pause");
    await page.click('.mtp-transport [data-step="50"]');
    await page.waitForTimeout(100);
    assert.equal(await page.getAttribute("#mtp-play", "aria-label"), "Pause", "still « Pause » at the end");
    assert.equal(await page.$("#mtp-play [data-shape=again]"), null);
  } finally {
    await close(page);
  }
});

test("keyboard: Space next wave, Shift+Space or K pause, arrows ±1/±10, H E, P (twice: the wave before), [ ] < >, + held ×2, S, C; nothing for - or PgDn", async (t) => {
  if (skip(t)) return;
  const page = await open({}, 5);
  try {
    await page.keyboard.press(" ");
    assert.deepEqual(await gotos(page), [12], "Space: start of the next wave");
    await page.keyboard.press("Shift+Space");
    await page.waitForTimeout(100);
    assert.equal((await swf(page)).paused, true, "Shift+Space pauses");
    await page.keyboard.press(" ");
    assert.equal((await gotos(page)).at(-1), 27, "Space paused: the next wave, pause kept");
    assert.equal((await swf(page)).paused, true);
    await page.keyboard.press("k");
    await page.waitForTimeout(100);
    assert.equal((await swf(page)).paused, false, "K resumes");
    await page.keyboard.press(" ");
    assert.equal((await gotos(page)).length, 2, "Space on the last wave: nothing");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("ArrowRight");
    assert.deepEqual((await gotos(page)).slice(-3), [26, 16, 17]);
    await page.keyboard.press("p");
    assert.equal((await gotos(page)).at(-1), 12, "P: start of the current wave");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("e");
    assert.equal((await gotos(page)).at(-1), 40, "E: the end");
    await page.waitForTimeout(800);
    await page.keyboard.press("p");
    await page.keyboard.press("p");
    assert.deepEqual((await gotos(page)).slice(-2), [27, 12], "P twice quickly: the wave before");
    await page.waitForTimeout(800);
    await page.keyboard.press("p");
    assert.equal((await gotos(page)).at(-1), 12, "P after 700 ms: the current wave again");
    await page.keyboard.press("h");
    assert.equal((await gotos(page)).at(-1), 0, "H: the start");
    await page.keyboard.press("End");
    await page.keyboard.press("Home");
    assert.deepEqual((await gotos(page)).slice(-2), [40, 0]);
    const n = (await gotos(page)).length;
    await page.keyboard.press("-");
    await page.keyboard.press("PageDown");
    assert.equal((await gotos(page)).length, n, "- and PgDn do nothing");
    assert.equal((await swf(page)).speed, 1, "- is no speed key");
    await page.keyboard.press("]");
    assert.equal((await swf(page)).speed, 1.25);
    await page.keyboard.press(">");
    assert.equal((await swf(page)).speed, 1.5);
    await page.keyboard.press("[");
    await page.keyboard.press("<");
    assert.equal((await swf(page)).speed, 1);
    await page.keyboard.down("+");
    assert.equal((await swf(page)).speed, 2, "+ held: ×2");
    await page.keyboard.up("+");
    assert.equal((await swf(page)).speed, 1, "released: back to ×1");
    await page.keyboard.press("s");
    assert.equal(await page.$eval("#mtp-share", (d) => (d as HTMLDialogElement).open), true, "S: the share dialog");
    await page.keyboard.press("Escape");
    await page.keyboard.press("c");
    await page.waitForFunction(() => (document.getElementById("mtp-shotdlg") as HTMLDialogElement).open);
  } finally {
    await close(page);
  }
});

test("speed: BetterTrooper's 19 notches 1/16 … 32 on 230 px, ×1 marked, the ×2 / ×1 button", async (t) => {
  if (skip(t)) return;
  const page = await open();
  try {
    const r = await page.$eval("#mtp-speed", (i) => ({ min: (i as HTMLInputElement).min, max: (i as HTMLInputElement).max, value: (i as HTMLInputElement).value, w: i.getBoundingClientRect().width }));
    assert.deepEqual(r, { min: "0", max: "18", value: "5", w: 230 });
    assert.equal(await page.textContent("#mtp-speed-v"), "×1");
    assert.equal(await page.getAttribute(".mtp-speed", "title"), "Vitesse du combat, de ×1/16 à ×32 (< et >) ; la touche + maintenue donne au moins ×2");
    assert.equal(await page.$$eval(".mtp-scale__mark", (m) => m.length), 1, "one mark: ×1");
    const expect = ["1/16", "1/8", "1/4", "1/2", "3/4", "1", "1.25", "1.5", "1.75", "2", "2.5", "3", "4", "6", "8", "12", "16", "24", "32"];
    for (const [v, label] of [[0, "1/16"], [4, "3/4"], [6, "1.25"], [18, "32"]] as const) {
      await page.$eval("#mtp-speed", (i, v) => {
        (i as HTMLInputElement).value = String(v);
        i.dispatchEvent(new Event("input", { bubbles: true }));
      }, v);
      assert.equal(await page.textContent("#mtp-speed-v"), `×${label}`);
      assert.equal((await swf(page)).speed, eval(expect[v]!.replace(/^(\d+)\/(\d+)$/, "$1/$2")) as number);
    }
    await page.click("#mtp-x2");
    assert.equal((await swf(page)).speed, 1, "×1 button away from ×1: back to ×1");
    assert.equal(await page.textContent("#mtp-x2"), "×2");
    assert.equal(await page.getAttribute("#mtp-x2", "title"), "Vitesse ×2");
    await page.click("#mtp-x2");
    assert.equal((await swf(page)).speed, 2);
    assert.equal(await page.textContent("#mtp-x2"), "×1");
    assert.equal(await page.getAttribute("#mtp-x2", "title"), "Vitesse normale");
    assert.equal(await page.getAttribute("#mtp-x2", "aria-pressed"), null, "no green pressed state");
  } finally {
    await close(page);
  }
});

test("share dialog: start at the beginning, the wave or the event, a Discord message with ?at=, the game paused while open", async (t) => {
  if (skip(t)) return;
  const page = await open({}, 30);
  try {
    await page.click("#mtp-link");
    const d = await page.$eval("#mtp-share", (d) => ({
      open: (d as HTMLDialogElement).open,
      title: d.querySelector(".mtp-dialog__title")?.textContent,
      choices: Array.from(d.querySelectorAll(".mtp-share__choice:not([hidden]) .mtp-share__choice-title"), (e) => e.textContent),
      text: (d.querySelector("textarea") as HTMLTextAreaElement).value,
      buttons: Array.from(d.querySelectorAll(".mtp-dialog__footer button:not([hidden])"), (b) => b.textContent),
    }));
    assert.equal(d.open, true);
    assert.equal(d.title, "Partager ce combat");
    assert.deepEqual(d.choices, ["Le début", "Vague 3", "Événement 30"]);
    assert.equal(d.text, "⚔️ **L'armée de A VS L'armée de B**\n[**mt.example/b/fview/7**](http://mt.example/b/fview/7)");
    assert.deepEqual(d.buttons, ["Copier pour Discord1", "Copier le lien2"]);
    await page.waitForTimeout(100);
    assert.equal((await swf(page)).paused, true, "the game paused (its own pause) while the dialog is open");
    await page.click('.mtp-share__choice[data-start="wave"]');
    assert.equal(await page.inputValue("#mtp-share textarea"), "⚔️ **L'armée de A VS L'armée de B** (vague 3)\n[**mt.example/b/fview/7?at=27**](http://mt.example/b/fview/7?at=27)");
    await page.click('.mtp-share__choice[data-start="event"]');
    assert.match(await page.inputValue("#mtp-share textarea"), /\(événement 30\)\n\[\*\*mt\.example\/b\/fview\/7\?at=30\*\*\]\(http:\/\/mt\.example\/b\/fview\/7\?at=30\)$/);
    await page.click("#mtp-share .mtp-dialog__close");
    assert.equal(await page.$eval("#mtp-share", (d) => (d as HTMLDialogElement).open), false);
    await page.waitForTimeout(100);
    assert.equal((await swf(page)).paused, false, "playing again once closed");
    // paused before: still paused after the dialog
    await page.click("#mtp-play");
    await page.waitForTimeout(100);
    await page.keyboard.press("s");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    assert.equal((await swf(page)).paused, true, "paused before the dialog: still paused");
  } finally {
    await close(page);
  }
});

test("capture dialog: framed and game-only pictures, Download gives the 720x440 game; toasts at the bottom", async (t) => {
  if (skip(t)) return;
  const page = await open({}, 20);
  try {
    await page.click("#mtp-shot");
    await page.waitForFunction(() => (document.getElementById("mtp-shotdlg") as HTMLDialogElement).open);
    const items = await page.$$eval("#mtp-shotdlg .mtp-shot__item", (s) => s.map((e) => ({ name: e.querySelector(".mtp-shot__name")?.textContent, w: Number(e.querySelector("img")!.getAttribute("width")) })));
    assert.deepEqual(items.map((i) => i.name), ["Avec les détails du combat", "Le jeu seul"]);
    assert.equal(items[1]!.w, 720);
    assert.equal(items[0]!.w, 740, "the framed picture: BetterTrooper's 740 px frame");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click('#mtp-shotdlg [data-shot="game"] [data-act="download"]')]);
    assert.equal(download.suggestedFilename(), "minitroopers-7.png");
    const png = decodePng(readFileSync((await download.path())!));
    assert.deepEqual([png.width, png.height], [720, 440]);
    const [framed] = await Promise.all([page.waitForEvent("download"), page.click('#mtp-shotdlg [data-shot="framed"] [data-act="download"]')]);
    assert.equal(framed.suggestedFilename(), "minitroopers-7-encadre.png");
    await page.keyboard.press("Escape");
    await page.click("#mtp-sound");
    const toast = await page.waitForSelector(".mtp-toast[data-shown]");
    assert.equal(await toast.textContent(), "Son coupé");
    assert.doesNotMatch((await toast.getAttribute("class"))!, /mtp-toast--warning/);
    await page.waitForTimeout(400); // its 0.2 s slide up
    const r = await toast.boundingBox();
    assert.ok(r && Math.abs(1000 - (r.y + r.height) - 22) <= 1, `22 px above the bottom: ${JSON.stringify(r)}`);
  } finally {
    await close(page);
  }
});

test("stuck: a red banner above the player, gone once the battle moves on; status line and fps readout", async (t) => {
  if (skip(t)) return;
  const page = await open({}, 8);
  try {
    await page.evaluate(() => (window as unknown as { mtStuck(n: number): void }).mtStuck(8));
    const banner = await page.waitForSelector(".mtp-banners .mtp-alert--error");
    assert.equal(await banner.textContent(), "Le combat est bloqué à l'événement 8 : le jeu n'avance plus. Espace, la frise ou les boutons +1 à +50 font avancer le combat.");
    const [b, f] = await Promise.all([banner.boundingBox(), page.locator(".mtp-game .swfframe").boundingBox()]);
    assert.ok(b!.y + b!.height <= f!.y, "above the frame");
    await page.click('.mtp-transport [data-step="1"]');
    assert.equal(await page.$(".mtp-banners .mtp-alert--error"), null);
    assert.equal(await page.textContent(".mtp-where"), "Combat #7 · événement 9 / 40 · vague 1 / 3");
    await page.waitForFunction(() => /^\d+ i\/s · moy \d+ · min \d+$/.test(document.querySelector(".mtp-fps")!.textContent!), null, { timeout: 4000 });
    assert.equal(await page.$eval(".mtp-fps", (e) => getComputedStyle(e).opacity), "0.6");
    assert.match((await page.getAttribute(".mtp-fps", "title"))!, /^dernière seconde : \d+ i\/s\ndernière minute : moy \d+, min \d+\ndepuis le début : \d+ i\/s\nimage de la page : [\d.]+ ms en moyenne, \d+ ms au plus$/);
  } finally {
    await close(page);
  }
});

test("title with the date, log: one veil over the future lines, no bold wave lines, help button BetterTrooper's", async (t) => {
  if (skip(t)) return;
  const page = await open({}, 20);
  try {
    assert.equal((await page.textContent(".mtp-title__text"))!.replace(/\s+/g, " ").trim(), "L'armée de A VS L'armée de B (25/11/2026)");
    const log = await page.evaluate(() => {
      const veil = document.querySelector(".mtp-lines .mtp-logveil") as HTMLElement;
      const cur = document.querySelector(".mtp-line.mtp-cur") as HTMLElement;
      const lines = Array.from(document.querySelectorAll(".mtp-line")) as HTMLElement[];
      return {
        veils: document.querySelectorAll(".mtp-logveil").length,
        bg: getComputedStyle(veil).backgroundColor,
        top: veil.offsetTop,
        curBottom: cur.offsetTop + cur.offsetHeight,
        opacities: [...new Set(lines.map((l) => getComputedStyle(l).opacity))],
        weights: [...new Set(lines.map((l) => getComputedStyle(l).fontWeight))],
      };
    });
    assert.equal(log.veils, 1);
    assert.equal(log.bg, "rgba(242, 221, 184, 0.62)");
    assert.equal(log.top, log.curBottom, "from the bottom of the current line");
    assert.deepEqual(log.opacities, ["1"]);
    assert.deepEqual(log.weights, ["400"]);
    const help = await page.$eval("#mtp-helpbtn", (b) => ({ w: b.getBoundingClientRect().width, bg: getComputedStyle(b).backgroundColor, border: getComputedStyle(b).borderTopWidth }));
    assert.deepEqual(help, { w: 26, bg: "rgba(0, 0, 0, 0)", border: "0px" });
    await page.keyboard.press("?");
    const tip = await page.$eval("#tooltip .tiptop", (e) => {
      const r = e.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rows: Array.from(e.querySelectorAll(".mtp-keys td"), (d) => d.textContent) };
    });
    assert.ok(Math.abs(tip.cx - 640) <= 12 && Math.abs(tip.cy - 500) <= 12, `opened by the keyboard: centred ${JSON.stringify(tip)}`);
    assert.deepEqual(tip.rows, ["Pause, reprise", "Vague suivante", "Un événement en arrière, en avant", "Dix événements", "Début de la vague (deux fois vite : la précédente, trois fois : deux avant)", "Début, fin du combat", "Plus lent, plus vite (un cran)", "Vitesse ×2 tant qu'elle est enfoncée", "Partager le combat", "Capture du combat", "Cette liste (de nouveau : la ferme)"]);
  } finally {
    await close(page);
  }
});

test("log: no automatic scrolling for 4 s after the reader scrolled it", async (t) => {
  if (skip(t)) return;
  const page = await open({ width: 800 }, 2);
  try {
    await page.$eval(".mtp-lines", (l) => ((l as HTMLElement).style.maxHeight = "100px"));
    await page.$eval(".mtp-lines", (l) => l.dispatchEvent(new WheelEvent("wheel", { bubbles: true })));
    await page.evaluate(() => (document.getElementById("battle") as unknown as { mtGoto(n: number): void }).mtGoto(38));
    assert.equal(await page.$eval(".mtp-lines", (l) => l.scrollTop), 0, "left where the reader is");
    await page.waitForTimeout(4100);
    await page.evaluate(() => (document.getElementById("battle") as unknown as { mtGoto(n: number): void }).mtGoto(39));
    assert.ok((await page.$eval(".mtp-lines", (l) => l.scrollTop)) > 0, "followed again after 4 s");
  } finally {
    await close(page);
  }
});

test("mobile: four steps (playing -50 -10 +10 +50, paused -5 -1 +1 +5) under 720 px; help hidden on touch screens", async (t) => {
  if (skip(t)) return;
  const page = await open({ width: 390, height: 844, touch: true });
  try {
    const steps = (): Promise<number[]> => page.$$eval(".mtp-transport .mtp-step", (bs) => bs.map((b) => Number(b.getAttribute("data-step"))));
    assert.deepEqual(await steps(), [-50, -10, 10, 50]);
    await page.tap("#mtp-play");
    await page.waitForFunction(() => document.querySelectorAll('.mtp-transport [data-step="5"]').length === 1);
    assert.deepEqual(await steps(), [-5, -1, 1, 5]);
    assert.equal(await page.isVisible("#mtp-helpbtn"), false);
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(sizes.scroll <= sizes.client, JSON.stringify(sizes));
  } finally {
    await close(page);
  }
});

test("mobile landscape: the stage as high as the screen, the controls in a column on its right", async (t) => {
  if (skip(t)) return;
  const page = await open({ width: 844, height: 390, touch: true });
  try {
    const l = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return { screen: r(".mtp-screen"), play: r("#mtp-play"), track: r("#mtp-track"), scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
    });
    assert.ok(l.play.left >= l.screen.right, `controls on the right: ${JSON.stringify(l)}`);
    assert.ok(l.screen.height >= 250, `stage high: ${JSON.stringify(l.screen)}`);
    assert.ok(Math.abs(l.screen.width / l.screen.height - 720 / 440) < 0.03, "720:440");
    assert.ok(l.track.top >= l.screen.bottom - 15 && Math.abs(l.track.width - l.screen.width) <= 3, `timeline under the stage: ${JSON.stringify(l)}`);
    assert.ok(l.scroll <= l.client);
  } finally {
    await close(page);
  }
});

/** The lazy page: the stand-in SWF loads in steps and simulates 10 entries every 150 ms (?stop=N: held there until window.simGo). */
async function openLazy(o: Opts = {}, q = ""): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: o.width ?? 1280, height: o.height ?? 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/test.html?lazy${q}`);
  return page;
}
const veilText = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const v = document.querySelector(".mtp-veil") as HTMLElement;
    return v.hidden ? null : v.querySelector(".mtp-veil__text")!.textContent;
  });
const knownOf = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { mtPlayer: { known: number } }).mtPlayer.known);
/** Simulation held once 20 of the 40 entries are known, the loading veil gone. */
async function heldAt20(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { mtPlayer: { known: number } }).mtPlayer.known >= 20);
  await page.waitForFunction(() => (document.querySelector(".mtp-veil") as HTMLElement).hidden);
  await page.waitForTimeout(500);
}

test("loading: BetterTrooper's three steps under a veil over the greyed stage, gone once the battle plays", async (t) => {
  if (skip(t)) return;
  const page = await openLazy();
  try {
    const seen: string[] = [];
    let busy = false;
    for (let i = 0; i < 60; i++) {
      const v = await veilText(page);
      if (v && seen.at(-1) !== v) seen.push(v);
      if (v) busy = busy || (await page.$eval(".mtp-stage", (e) => e.classList.contains("mtp-busy")));
      if (v === null && seen.length) break;
      await page.waitForTimeout(50);
    }
    assert.deepEqual(seen, ["Chargement du lecteur et du jeu… (1/3)", "Démarrage du jeu… (2/3)", "Préparation du combat… (3/3)"]);
    assert.ok(busy, "the stage greyed under the veil");
    assert.equal(await page.$eval(".mtp-stage", (e) => e.classList.contains("mtp-busy")), false);
    assert.ok(!(await calls(page)).some((c) => c[0] === "ahead"), "no mtAhead: the SWF's own pace (Killian's choice)");
  } finally {
    await close(page);
  }
});

test("simulation: the timeline's unknown part hatched with « simulation NN % », the log waiting, a jump beyond waits", async (t) => {
  if (skip(t)) return;
  const page = await openLazy({}, "&stop=20");
  try {
    await heldAt20(page);
    const known = await knownOf(page);
    const tl = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const u = document.querySelector(".mtp-unknown") as HTMLElement;
      return { track: r("#mtp-track"), unknown: r(".mtp-unknown"), bg: getComputedStyle(u).backgroundImage, label: document.querySelector(".mtp-unknown__label")!.textContent, where: document.querySelector(".mtp-where")!.textContent };
    });
    const pct = Math.min(99, Math.floor((100 * known) / 40));
    assert.equal(tl.label, `simulation ${pct} %`);
    assert.ok(Math.abs(tl.unknown.left - (tl.track.left + 2 + (known / 40) * (tl.track.width - 4))) <= 2, JSON.stringify(tl));
    assert.match(tl.bg, /repeating-linear-gradient\(135deg, rgb\(122, 100, 67\)/);
    assert.match(tl.where!, new RegExp(`· événement \\d+ / ${known}\\+ · vague \\d / \\d\\+$`));
    assert.equal(await page.textContent(".mtp-logwait .mtp-veil__text"), `Simulation du combat : ${Math.round(100 * Math.min(0.97, known / 40))} % (${known} événements)`);
    // the unknown part: no seek on a click, its own tip
    const x = tl.unknown.left + tl.unknown.width / 2;
    await page.mouse.move(x, tl.track.top + 10);
    assert.equal(await page.getAttribute("#mtp-track", "title"), "Pas encore simulé");
    const before = (await gotos(page)).length;
    await page.mouse.click(x, tl.track.top + 10);
    assert.equal((await gotos(page)).length, before, "a click past the simulated part does nothing");
    // E: the end is not simulated yet: the game pauses, a determined veil waits for it
    await page.mouse.move(5, 5);
    await page.keyboard.press("e");
    await page.waitForTimeout(250);
    assert.equal(await veilText(page), `Simulation jusqu'à la fin : ${known} / 40 événements`);
    assert.equal(await page.$eval(".mtp-veil .mtp-progress", (e) => e.getAttribute("aria-valuenow")), String(Math.round((100 * known) / 40)));
    assert.ok((await calls(page)).some((c) => c[0] === "mtPause"), "paused while waiting");
    await page.evaluate(() => ((window as unknown as { simGo: boolean }).simGo = true));
    await page.waitForFunction(() => (document.querySelector(".mtp-veil") as HTMLElement).hidden, null, { timeout: 5000 });
    assert.equal((await swf(page)).idx, 40, "landed at the end");
    await page.waitForTimeout(200);
    assert.ok((await calls(page)).some((c) => c[0] === "mtResume"), "resumed once landed");
    assert.equal(await page.$(".mtp-logwait"), null, "the log no longer waits");
    assert.equal(await page.$(".mtp-unknown:not([hidden])"), null, "no unknown part once complete");
  } finally {
    await close(page);
  }
});

test("simulation: Space past the last known wave waits for that wave (« Simulation jusqu'à la vague 3 »)", async (t) => {
  if (skip(t)) return;
  const page = await openLazy({}, "&stop=20");
  try {
    await heldAt20(page);
    await page.evaluate(() => (document.getElementById("battle") as unknown as { mtGoto(n: number): void }).mtGoto(14));
    await page.keyboard.press(" ");
    await page.waitForTimeout(250);
    assert.equal(await veilText(page), "Simulation jusqu'à la vague 3 : 2 / 3 vagues");
    await page.evaluate(() => ((window as unknown as { simGo: boolean }).simGo = true));
    await page.waitForFunction(() => (document.querySelector(".mtp-veil") as HTMLElement).hidden, null, { timeout: 5000 });
    assert.equal((await gotos(page)).at(-1), 27, "the start of wave 3 once known");
    assert.ok((await gotos(page)).includes(40), "the wait went through mtGoto past the simulated part (the SWF catches up at once)");
  } finally {
    await close(page);
  }
});

test("while loading: only the player's keys wait (Tab, Enter, Échap pass), the timeline is inert, a dialog opened then keeps the battle paused", async (t) => {
  if (skip(t)) return;
  const page = await openLazy();
  try {
    await page.waitForFunction(() => /\(1\/3\)/.test(document.querySelector(".mtp-veil__text")!.textContent!));
    const prevented = await page.evaluate(() =>
      ["Tab", "Enter", "Escape", "PageDown", " ", "k", "ArrowRight"].map((key) => {
        const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        document.body.dispatchEvent(e);
        return e.defaultPrevented;
      }),
    );
    assert.deepEqual(prevented, [false, false, false, false, true, true, true]);
    // the header's Partager opens its dialog at once; the battle, once it plays, stays paused under it
    await page.click("#mtp-link");
    await page.waitForFunction(() => (window as unknown as { mtPlayer: { idx: number } }).mtPlayer.idx > 0, null, { timeout: 10000 });
    await page.waitForTimeout(600);
    assert.equal((await swf(page)).paused, true, "paused under the dialog once playing");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    assert.equal((await swf(page)).paused, false, "playing once the dialog is closed");
  } finally {
    await close(page);
  }
});

test("while loading: a click on the timeline does nothing", async (t) => {
  if (skip(t)) return;
  const page = await openLazy({}, "&stop=20&noplay");
  try {
    await page.waitForFunction(() => (window as unknown as { mtPlayer: { known: number } }).mtPlayer.known >= 10);
    assert.equal(await page.evaluate(() => !(document.querySelector(".mtp-veil") as HTMLElement).hidden), true, "still loading");
    const tr = (await page.locator("#mtp-track").boundingBox())!;
    await page.mouse.click(tr.x + 10, tr.y + 10);
    assert.deepEqual(await gotos(page), []);
  } finally {
    await close(page);
  }
});

// --- sounds (public/js/sfx.js): the stand-in SWF's cues are sent by hand (window.mtSfx); Web Audio spied on ---

/** Counts AudioContexts, started / stopped sources and keeps the stereo panners (pan of each sound). */
const SPY = `(() => {
  const log = (window.audioLog = { ctx: 0, started: 0, stopped: 0, panners: [] });
  const AC = window.AudioContext;
  window.AudioContext = class extends AC { constructor(o) { super(o); log.ctx++; } };
  const P = AudioBufferSourceNode.prototype;
  const start = P.start, stop = P.stop;
  P.start = function (...a) { log.started++; return start.apply(this, a); };
  P.stop = function (...a) { log.stopped++; return stop.apply(this, a); };
  const cp = BaseAudioContext.prototype.createStereoPanner;
  BaseAudioContext.prototype.createStereoPanner = function () { const n = cp.call(this); log.panners.push(n); return n; };
})();`;
type Audio = { ctx: number; started: number; stopped: number; pans: number[] };
const audio = (page: Page): Promise<Audio> =>
  page.evaluate(() => {
    const l = (window as unknown as { audioLog: { ctx: number; started: number; stopped: number; panners: StereoPannerNode[] } }).audioLog;
    return { ctx: l.ctx, started: l.started, stopped: l.stopped, pans: l.panners.map((p) => p.pan.value) };
  });
/** A first gesture (a click beside the player), then every sound decoded. */
async function unlock(page: Page): Promise<void> {
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => (window as unknown as { MtSfx?: { ready: boolean } }).MtSfx?.ready === true, null, { timeout: 10000 });
}
const cue = (page: Page, list: [string, string, number][], gapMs = 0): Promise<void> =>
  page.evaluate(
    async ([l, gap]) => {
      for (const [k, d, x] of l as [string, string, number][]) {
        (window as unknown as { mtSfx(k: string, d: string, x: number): void }).mtSfx(k, d, x);
        if (gap) await new Promise((ok) => setTimeout(ok, gap as number));
      }
    },
    [list, gapMs] as const,
  );

test("sound: the button is on by default; a click mutes it (sound-off icon, « Son coupé », mt-sound=off kept after a reload)", async (t) => {
  if (skip(t)) return;
  const page = await open({});
  try {
    const state = () =>
      page.evaluate(() => {
        const b = document.getElementById("mtp-sound")!;
        return { pressed: b.getAttribute("aria-pressed"), disabled: b.getAttribute("aria-disabled"), on: !!b.querySelector(".mtp-mask--sound-on"), off: !!b.querySelector(".mtp-mask--sound-off"), store: localStorage.getItem("mt-sound"), label: b.getAttribute("aria-label") };
      });
    assert.deepEqual(await state(), { pressed: "true", disabled: null, on: true, off: false, store: null, label: "Son" });
    await page.click("#mtp-sound");
    assert.deepEqual(await state(), { pressed: "false", disabled: null, on: false, off: true, store: "off", label: "Son" });
    assert.equal(await page.textContent(".mtp-toast"), "Son coupé");
    await page.reload();
    await page.waitForSelector("#mtp-sound");
    assert.equal((await state()).pressed, "false", "kept after a reload");
    await page.click("#mtp-sound");
    assert.deepEqual(await state(), { pressed: "true", disabled: null, on: true, off: false, store: "on", label: "Son" });
    assert.equal(await page.textContent(".mtp-toast"), "Son activé");
  } finally {
    await close(page);
  }
});

test("sound: no AudioContext nor console error before a gesture; after one, a cue plays one sound panned by x", async (t) => {
  if (skip(t)) return;
  const page = await open({ spy: true });
  try {
    await cue(page, [["fire", "13", 0.2]]);
    await page.waitForTimeout(200);
    assert.equal((await audio(page)).ctx, 0, "no AudioContext before a gesture");
    assert.deepEqual((page as unknown as { console: string[] }).console, []);
    await unlock(page);
    await cue(page, [["fire", "13", 0.2]]);
    let a = await audio(page);
    assert.equal(a.ctx, 1);
    assert.equal(a.started, 1);
    assert.ok(a.pans.at(-1)! < -0.3 && a.pans.at(-1)! >= -0.6, `left: ${a.pans.at(-1)}`);
    await cue(page, [["explosion", "big", 1]]);
    a = await audio(page);
    assert.equal(a.started, 2);
    assert.ok(Math.abs(a.pans.at(-1)! - 0.6) < 1e-6, `right, at most 0.6: ${a.pans.at(-1)}`);
    await cue(page, [["deploy", "", NaN]]);
    a = await audio(page);
    assert.equal(a.started, 3);
    assert.equal(a.pans.at(-1), 0, "no trooper: centred");
    await cue(page, [["move", "", 0.5], ["carry", "", 0.5], ["charge", "30", 0.5]]);
    assert.equal((await audio(page)).started, 3, "moves are silent");
    assert.deepEqual((page as unknown as { console: string[] }).console, []);
    assert.deepEqual((page as unknown as { errors: string[] }).errors, []);
  } finally {
    await close(page);
  }
});

test("sound: the cue -> sound map (one fire cue per bullet; weapons by family, projectiles (grenades, rockets, shells), explosions, deaths, the viewer's victory or defeat)", async (t) => {
  if (skip(t)) return;
  const page = await open({});
  try {
    const m = await page.evaluate(() => {
      const S = (window as unknown as { MtSfx: { sounds(k: string, d: string): string[] } }).MtSfx;
      const q: [string, string][] = [
        ["fire", "1"], ["fire", "2"], ["fire", "3"], ["fire", "5"], ["fire", "6"], ["fire", "7"], ["fire", "8"], ["fire", "9"], ["fire", "10"],
        ["fire", "11"], ["fire", "13"], ["fire", "15"], ["fire", "17"], ["fire", "20"], ["fire", "21"], ["fire", "24"], ["fire", "25"], ["fire", "29"],
        ["fire", "31"], ["fire", "32"], ["fire", "33"], ["fire", "35"], ["fire", "37"],
        ["melee", "0"], ["melee", "30"], ["melee", "36"], ["grenade", "82"], ["grenade", "17"], ["grenade", "18"], ["grenade", "31"], ["grenade", "33"], ["skill", "83"], ["explosion", "grenade"], ["explosion", "big"],
        ["reload", "start"], ["reload", "load"], ["hit", "0"], ["hit", "1"], ["hit", "3"], ["hit", "4"], ["hit", "6"], ["hit", "vehicle"], ["crit", "0"], ["miss", "9"], ["block", "0"],
        ["death", "0"], ["death", "2"], ["deploy", ""], ["wave", ""], ["end", "0"], ["end", "1"], ["move", ""], ["switch", ""],
      ];
      return Object.fromEntries(q.map(([k, d]) => [k + ":" + d, S.sounds(k, d).join(",")]));
    });
    assert.deepEqual(m, {
      "fire:1": "pistol", "fire:2": "pistol-heavy", "fire:3": "pistol-heavy", "fire:5": "pistol-dual", "fire:6": "rifle", "fire:7": "rifle-auto",
      "fire:8": "rifle-double", "fire:9": "shotgun", "fire:10": "shotgun-dry", "fire:11": "assault", "fire:13": "assault", "fire:15": "rifle-auto",
      "fire:17": "rocket", "fire:20": "rocket", "fire:21": "mg", "fire:24": "mg", "fire:25": "sniper", "fire:29": "sniper", "fire:31": "cannon",
      "fire:32": "mg", "fire:33": "cannon", "fire:35": "mg", "fire:37": "",
      "melee:0": "punch", "melee:30": "knife", "melee:36": "rat,rat-2", "grenade:82": "throw", "grenade:17": "rocket", "grenade:18": "rocket", "grenade:31": "cannon", "grenade:33": "cannon", "skill:83": "", "explosion:grenade": "explosion", "explosion:big": "explosion-big",
      "reload:start": "", "reload:load": "reload", "hit:0": "hit", "hit:1": "", "hit:3": "hit", "hit:4": "", "hit:6": "punch", "hit:vehicle": "", "crit:0": "crit", "miss:9": "miss", "block:0": "",
      "death:0": "death,death-2", "death:2": "rat,rat-2", "deploy:": "deploy", "wave:": "deploy", "end:0": "victory", "end:1": "defeat", "move:": "", "switch:": "",
    });
  } finally {
    await close(page);
  }
});

test("sound: silent when muted, paused, under a dialog or in a hidden tab; a jump or the pause cuts the sounds playing", async (t) => {
  if (skip(t)) return;
  const page = await open({ spy: true });
  try {
    await unlock(page);
    await cue(page, [["explosion", "big", 0.5]]);
    assert.equal((await audio(page)).started, 1);
    // a jump (→: one entry on) cuts it
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(50);
    assert.ok((await audio(page)).stopped >= 1, "cut by the jump");
    // pause: the sound playing cut, nothing while paused
    await cue(page, [["explosion", "grenade", 0.5]]);
    const before = await audio(page);
    await page.evaluate(() => (document.getElementById("battle") as unknown as { clickField(): void }).clickField());
    await page.waitForFunction(() => (document.getElementById("battle") as unknown as { mtState(): { paused: boolean } }).mtState().paused);
    assert.ok((await audio(page)).stopped > before.stopped, "cut by the pause");
    await cue(page, [["fire", "1", 0.5]]);
    assert.equal((await audio(page)).started, before.started, "nothing while paused");
    await page.evaluate(() => (document.getElementById("battle") as unknown as { clickField(): void }).clickField());
    await page.waitForFunction(() => !(document.getElementById("battle") as unknown as { mtState(): { paused: boolean } }).mtState().paused);
    await cue(page, [["fire", "1", 0.5]]);
    assert.equal((await audio(page)).started, before.started + 1, "again once resumed");
    // muted
    await page.click("#mtp-sound");
    await page.waitForTimeout(60);
    await cue(page, [["fire", "2", 0.5]]);
    assert.equal((await audio(page)).started, before.started + 1, "nothing muted");
    await page.click("#mtp-sound");
    // a dialog open
    await page.click("#mtp-link");
    await cue(page, [["fire", "3", 0.5]]);
    assert.equal((await audio(page)).started, before.started + 1, "nothing under a dialog");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    // a hidden tab
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await cue(page, [["fire", "4", 0.5]]);
    assert.equal((await audio(page)).started, before.started + 1, "nothing in a hidden tab");
  } finally {
    await close(page);
  }
});

test("sound: at most 8 voices for 50 cues at once; at ×8 a repeated sound is spaced out", async (t) => {
  if (skip(t)) return;
  const page = await open({ spy: true });
  try {
    await unlock(page);
    const many: [string, string, number][] = [];
    for (let i = 0; i < 50; i++) many.push(i % 5 === 0 ? ["explosion", "grenade", i / 50] : i % 5 === 1 ? ["hit", "0", i / 50] : ["fire", String(1 + (i % 29)), i / 50]);
    await cue(page, many);
    const a = await audio(page);
    assert.ok(a.started >= 6 && a.started - a.stopped <= 8, `voices: ${JSON.stringify(a)}`);
    await page.waitForTimeout(1500);
    // ×1: hits 60 ms apart all heard
    const s1 = (await audio(page)).started;
    await cue(page, Array.from({ length: 6 }, () => ["hit", "0", 0.5] as [string, string, number]), 60);
    assert.equal((await audio(page)).started - s1, 6, "×1: every hit");
    await page.evaluate(() => {
      const r = document.getElementById("mtp-speed") as HTMLInputElement;
      r.value = "14";
      r.dispatchEvent(new Event("input"));
    });
    await page.waitForTimeout(300);
    const s8 = (await audio(page)).started;
    await cue(page, Array.from({ length: 6 }, () => ["hit", "0", 0.5] as [string, string, number]), 60);
    assert.ok((await audio(page)).started - s8 <= 2, "×8: spaced out");
  } finally {
    await close(page);
  }
});
