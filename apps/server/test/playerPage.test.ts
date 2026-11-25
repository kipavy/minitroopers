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
  el.mtGoto = function (n) { calls.push(["goto", n]); s.idx = n; s.wave = waveOf(n); s.ended = n >= 40; window.mtProgress(n, s.wave); if (s.ended) window.mtEnd(); return true; };
  el.mtPause = function () { calls.push(["mtPause"]); s.paused = true; };
  el.mtResume = function () { calls.push(["mtResume"]); s.paused = false; };
  el.mtSpeed = function (x) { calls.push(["speed", x]); s.speed = x; };
  el.mtShot = function () { var b = ""; for (var i = 0; i < 720 * 440; i++) b += "\\xff\\x40\\x80\\xc0"; return btoa(b); };
  at.parentNode.replaceChild(el, at);
} };
var mtLog = ${JSON.stringify(LOG)};
var mtAt = null;
var mtSides = [["A"], ["B"]];
var mtShare = "http://mt.example/b/fview/7";
var mtDate = "2026-11-25";
battleID = "7";
</script>
<script src="/js/player.js"></script></head><body class="mtp">
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

const TYPES: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".gif": "image/gif", ".jpg": "image/jpeg" };
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
type Opts = { width?: number; height?: number; touch?: boolean };

/** The test page, the stand-in SWF ready (mtReady), the battle playing at idx `at`. */
async function open(o: Opts = {}, at = 5): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: o.width ?? 1280, height: o.height ?? 1000 }, acceptDownloads: true, hasTouch: !!o.touch, isMobile: !!o.touch });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto(`${base}/test.html`);
  await page.evaluate(([r, n]) => {
    const w = window as unknown as { mtReady(r: unknown): void; document: Document };
    w.mtReady(r);
    (w.document.getElementById("battle") as unknown as { mtGoto(n: number): boolean }).mtGoto(n as number);
    (window as unknown as { calls: unknown[] }).calls.length = 0;
  }, [READY, at] as const);
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
  const page = await open({}, 0);
  try {
    const b = (await page.$('.mtp-transport [data-step="1"]'))!.boundingBox();
    const box = (await b)!;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(400);
    assert.deepEqual(await gotos(page), [1], "one step at once, nothing more before 500 ms");
    await page.waitForTimeout(500);
    await page.mouse.up();
    await page.waitForTimeout(100); // the steps added up for the next frame land with it
    const g = await gotos(page);
    assert.ok(g.length >= 3 && g.at(-1)! > 3, `repeated: ${JSON.stringify(g)}`);
    const n = g.length;
    await page.waitForTimeout(200);
    assert.equal((await gotos(page)).length, n, "stops on release");
    await page.click("#mtp-play");
    assert.equal((await swf(page)).paused, true);
    assert.equal(await page.getAttribute("#mtp-play", "aria-label"), "Reprendre");
    assert.match((await page.getAttribute("#mtp-play .mtp-playicon", "class"))!, /mtp-playicon--paused/);
    await page.click("#mtp-play");
    assert.equal((await swf(page)).paused, false);
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
    assert.equal((await swf(page)).paused, true, "Shift+Space pauses");
    await page.keyboard.press(" ");
    assert.equal((await gotos(page)).at(-1), 27, "Space paused: the next wave, pause kept");
    assert.equal((await swf(page)).paused, true);
    await page.keyboard.press("k");
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
    assert.equal(await page.evaluate(() => (document.getElementById("battle") as unknown as { isPlaying: boolean }).isPlaying), false, "Ruffle paused while the dialog is open");
    await page.click('.mtp-share__choice[data-start="wave"]');
    assert.equal(await page.inputValue("#mtp-share textarea"), "⚔️ **L'armée de A VS L'armée de B** (vague 3)\n[**mt.example/b/fview/7?at=27**](http://mt.example/b/fview/7?at=27)");
    await page.click('.mtp-share__choice[data-start="event"]');
    assert.match(await page.inputValue("#mtp-share textarea"), /\(événement 30\)\n\[\*\*mt\.example\/b\/fview\/7\?at=30\*\*\]\(http:\/\/mt\.example\/b\/fview\/7\?at=30\)$/);
    await page.click("#mtp-share .mtp-dialog__close");
    assert.equal(await page.$eval("#mtp-share", (d) => (d as HTMLDialogElement).open), false);
    assert.equal(await page.evaluate(() => (document.getElementById("battle") as unknown as { isPlaying: boolean }).isPlaying), true, "playing again once closed");
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
    await page.click("#mtp-sound-box");
    const toast = await page.waitForSelector(".mtp-toast[data-shown]");
    assert.equal(await toast.textContent(), "Le jeu n'a pas encore de son");
    assert.match((await toast.getAttribute("class"))!, /mtp-toast--warning/);
    await page.waitForTimeout(400); // its 0.2 s slide up
    const r = await toast.boundingBox();
    assert.ok(r && Math.abs(1000 - (r.y + r.height) - 22) <= 1, `22 px above the bottom: ${JSON.stringify(r)}`);
    assert.equal(await page.getAttribute("#mtp-sound", "aria-disabled"), "true");
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
