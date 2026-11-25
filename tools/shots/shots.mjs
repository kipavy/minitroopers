// Page screenshots and layout checks over raw CDP (headless Brave or Chrome, no npm dependency). See README.md.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { decodePng } from "../../apps/server/test/png.ts";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const REPO = resolve(HERE, "../..");
const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string", default: "http://localhost:18080" },
    out: { type: "string" },
    widths: { type: "string", default: "390,768,1280" },
    pages: { type: "string" },
    freeze: { type: "boolean", default: false },
    compare: { type: "boolean", default: false },
    army: { type: "string", default: "demo" },
    pass: { type: "string", default: "maquette-demo-42" },
  },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (opt.compare) process.exit(compare(positionals[0], positionals[1]));

/** Pixel comparison of the same-named 1280 px captures of two directories; exit code 1 when any differs. */
function compare(a, b) {
  if (!a || !b) throw new Error("usage: --compare <dirA> <dirB>");
  const all = (d) => readdirSync(d).filter((f) => f.endsWith("-1280.png"));
  const names = all(a).filter((f) => existsSync(join(b, f)));
  const diff = [...all(a), ...all(b)].filter((f) => !existsSync(join(a, f)) || !existsSync(join(b, f))).map((f) => `${f}: missing in ${existsSync(join(a, f)) ? b : a}`);
  for (const f of names) {
    const x = decodePng(readFileSync(join(a, f)));
    const y = decodePng(readFileSync(join(b, f)));
    if (x.width !== y.width || x.height !== y.height) diff.push(`${f}: size ${x.width}x${x.height} vs ${y.width}x${y.height}`);
    else {
      let n = 0;
      for (let i = 0; i < x.rgba.length; i += 4) if (x.rgba[i] !== y.rgba[i] || x.rgba[i + 1] !== y.rgba[i + 1] || x.rgba[i + 2] !== y.rgba[i + 2]) n++;
      if (n > 0) diff.push(`${f}: ${n} pixel(s)`);
    }
  }
  console.log(`${names.length} capture(s) compared, ${diff.length} difference(s)`);
  for (const d of diff) console.log("  " + d);
  return diff.length === 0 ? 0 : 1;
}

const BROWSER = process.env.SHOTS_BROWSER || join(process.env.LOCALAPPDATA ?? "", "BraveSoftware/Brave-Browser/Application/brave.exe");
const FREEZE_CSS = "ruffle-player, ruffle-object, object, embed { visibility : hidden !important; } #miss_tip, #raid_tip { visibility : hidden !important; }";

/** One headless browser on `profile`; returns a small CDP driver. */
async function openBrowser(profile) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const proc = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let list;
  for (let i = 0; i < 60 && !list; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      await sleep(200);
    }
  }
  if (!list) throw new Error(`no CDP endpoint (browser: ${BROWSER})`);
  const ws = new WebSocket(list.find((x) => x.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let seq = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result);
    } else if (d.method) events.push(d);
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;
  await send("Page.enable");
  await send("Runtime.enable");
  return {
    send,
    evalJs,
    async go(url, wait) {
      events.length = 0;
      await send("Page.navigate", { url });
      for (let i = 0; i < 150 && !events.some((e) => e.method === "Page.loadEventFired"); i++) await sleep(100);
      await sleep(wait);
    },
    async width(w) {
      const mobile = w < 980;
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    },
    async close() {
      await Promise.race([send("Browser.close").catch(() => {}), sleep(1500)]);
      await sleep(800);
      ws.close();
      proc.kill();
    },
  };
}

async function login(b) {
  await b.width(1280);
  await b.go(`${opt.base}/a/${opt.army}/hq`, 300);
  if (await b.evalJs("!document.querySelector('input[type=password]') && !!document.querySelector('.action')")) return;
  await b.go(`${opt.base}/`, 300);
  await b.evalJs(`(()=>{const f=document.querySelector('form[action="/login"]');f.login.value=${JSON.stringify(opt.army)};f.submit();})()`);
  await sleep(1500);
  if (await b.evalJs("!!document.querySelector('input[type=password]')")) {
    await b.evalJs(`(()=>{const p=document.querySelector('input[type=password]');p.value=${JSON.stringify(opt.pass)};p.form.submit();})()`);
    for (let i = 0; i < 25 && !(await b.evalJs("!!document.querySelector('.action')")); i++) await sleep(200);
  }
  if (!(await b.evalJs("!document.querySelector('input[type=password]') && !!document.querySelector('.action')"))) throw new Error(`login failed (rate limiter?) at ${await b.evalJs("location.href + ' | ' + document.body.innerText.slice(0, 300)")}`);
}

async function shoot(b, pages, widths, report) {
  for (const w of widths) {
    await b.width(w);
    for (const p of pages) {
      await b.go(opt.base + p.path, p.wait ?? 2500);
      if (opt.freeze) {
        const css = FREEZE_CSS + (p.mask ? ` ${p.mask} { visibility : hidden !important; }` : "");
        await b.evalJs(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})()`);
      }
      await sleep(150);
      const m = await b.send("Page.getLayoutMetrics");
      const shot = await b.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.max(w, Math.ceil(m.cssContentSize.width)), height: Math.ceil(m.cssContentSize.height), scale: 1 } });
      writeFileSync(join(opt.out, `${p.name}-${w}.png`), Buffer.from(shot.data, "base64"));
      const scrollWidth = await b.evalJs("document.documentElement.scrollWidth");
      const url = await b.evalJs("location.pathname");
      const row = { page: p.name, width: w, scrollWidth, overflow: w < 980 && scrollWidth > w, url };
      report.push(row);
      console.log(`${row.overflow ? "OVERFLOW" : "ok      "} ${p.name}-${w} scrollWidth=${scrollWidth}${url !== p.path ? ` (at ${url})` : ""}`);
    }
  }
}

if (!opt.out) throw new Error("--out <dir> is required");
mkdirSync(opt.out, { recursive: true });
const all = JSON.parse(readFileSync(join(HERE, "pages.json"), "utf8"));
const wanted = opt.pages ? opt.pages.split(",") : null;
const pages = wanted ? all.filter((p) => wanted.includes(p.name)) : all;
const widths = opt.widths.split(",").map(Number);
const report = [];

const owned = pages.filter((p) => p.login);
if (owned.length) {
  const dir = join(REPO, "var/shots-profile");
  mkdirSync(dir, { recursive: true });
  const b = await openBrowser(dir);
  try {
    await login(b);
    await shoot(b, owned, widths, report);
  } finally {
    await b.close();
  }
}
const anon = pages.filter((p) => !p.login);
if (anon.length) {
  const dir = mkdtempSync(join(tmpdir(), "mtshots-"));
  const b = await openBrowser(dir);
  try {
    await shoot(b, anon, widths, report);
  } finally {
    await b.close();
    await sleep(300);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}
writeFileSync(join(opt.out, "report.json"), JSON.stringify(report, null, 1));
process.exit(report.some((r) => r.overflow) ? 1 : 0);
