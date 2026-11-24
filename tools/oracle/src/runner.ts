// Runs the instrumented SWF (assets/oracle/client_fr_trace.swf) in Ruffle web
// (@ruffle-rs/ruffle, pinned) inside headless Chromium (Playwright), and collects the
// TRP/EV/END/MTDONE trace lines. See tools/oracle/instrument/README.md « Exécuteur ».
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { toFlashvars, type BattleInput } from "@mt/engine";
import type { BattleRecord, TrooperSnapshot } from "@mt/engine/internal";

export type { BattleRecord, TrooperSnapshot };

export interface OracleTrace {
  formatVersion: 1;
  swfSha256: string;
  input: BattleInput;
  record: BattleRecord;
}

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const TRACE_SWF = join(REPO_ROOT, "assets/oracle/client_fr_trace.swf");
export const PLAY_SWF = join(REPO_ROOT, "assets/swf/client_fr_play.swf");
export const EDIT_SWF = join(REPO_ROOT, "assets/swf/client_fr_edit.swf");
const ARMY_SWF = join(REPO_ROOT, "assets/swf/army.swf");
const MINI_SWF = join(REPO_ROOT, "assets/swf/mini.swf");
/** Stand-in for the site's /img/bg/*.jpg: the display SWF does not start a battle without its background. */
const BG_JPG = join(REPO_ROOT, "tools/oracle/test/fixtures/bg.jpg");
/** Playwright browsers live in the gitignored tools/bin, never in the user profile. */
export const BROWSERS_PATH = join(REPO_ROOT, "tools/bin/ms-playwright");
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;

const PROFILES_DIR = join(REPO_ROOT, "tools/bin/tmp");

export const DEFAULT_TIMEOUT_MS = 30_000;

export class OracleTimeoutError extends Error {
  readonly lines: string[];
  constructor(ms: number, lines: string[]) {
    super(`oracle: no MTDONE within ${ms} ms (${lines.length} trace lines received)`);
    this.lines = lines;
  }
}

const KEPT = /^(TRP |EV |END |MTDONE$)/;

/** Keeps only oracle lines (the SWF's embedded interpreter may emit other traces). */
export const filterTraceLines = (lines: readonly string[]): string[] =>
  lines.filter((l) => KEPT.test(l));

const parseInt10 = (s: string, what: string): number => {
  if (!/^-?\d+$/.test(s)) throw new Error(`oracle: bad ${what} ${JSON.stringify(s)}`);
  return Number(s);
};

/** Builds a BattleRecord from filtered trace lines (must end with END then MTDONE). */
export const parseTrace = (lines: readonly string[]): BattleRecord => {
  const troopers: TrooperSnapshot[] = [];
  const events: string[] = [];
  let end: string | undefined;
  for (const line of lines) {
    if (line.startsWith("TRP ")) {
      const [id, side] = line.slice(4).split("|");
      const s = parseInt10(side ?? "", "side");
      if (s !== 0 && s !== 1) throw new Error(`oracle: bad side in ${line}`);
      troopers.push({ id: parseInt10(id ?? "", "id"), side: s, line });
    } else if (line.startsWith("EV ")) {
      events.push(line);
    } else if (line.startsWith("END ")) {
      if (end !== undefined) throw new Error("oracle: duplicate END");
      end = line;
    }
  }
  if (end === undefined || lines.at(-1) !== "MTDONE") {
    throw new Error("oracle: trace incomplete (missing END/MTDONE)");
  }
  const [w = "", gy = ""] = end.slice(4).split("|");
  let winner: 0 | 1 | null;
  if (w === "null") winner = null;
  else if (w === "0" || w === "1") winner = Number(w) as 0 | 1;
  else throw new Error(`oracle: bad winner in ${end}`);
  const graveyard = gy === "" ? [] : gy.split(",").map((g) => parseInt10(g, "graveyard id"));
  return { troopers, events, winner, graveyard };
};

let swfShaCache: string | undefined;
export const traceSwfSha256 = (): string =>
  (swfShaCache ??= createHash("sha256").update(readFileSync(TRACE_SWF)).digest("hex"));

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="c" style="width:800px;height:600px"></div>
<script>
window.__mt = { lines: [], calls: [], done: false, ended: false, errors: [] };
// Ruffle web routes AVM trace() to log::info! in web/src/log_adapter.rs, which prints
// console.log("%cINFO%c web/src/log_adapter.rs:<n>%c <line>", css…) when logLevel >= info.
// Capture those in-page (no CDP console traffic) and pass everything else through.
(function () {
  const orig = console.log.bind(console);
  const prefix = "%cINFO%c web/src/log_adapter.rs:";
  for (const k of ["error", "warn"]) {
    const o = console[k].bind(console);
    console[k] = function () { window.__mt.errors.push(k + ": " + Array.from(arguments).join(" ").slice(0, 300)); return o.apply(null, arguments); };
  }
  console.log = function (first) {
    const at = typeof first === "string" && first.startsWith(prefix) ? first.indexOf("%c ", prefix.length) : -1;
    if (at < 0) return orig.apply(null, arguments);
    const line = first.slice(at + 3);
    window.__mt.lines.push(line);
    if (line === "MTDONE") window.__mt.done = true;
  };
})();
// client_fr_edit.swf reports its result through ExternalInterface.call("battleResult", …).
// the original battle page defines endBattle(); client_fr_play.swf calls it when "continuer" is clicked (the first click on a fresh page is swallowed).
window.endBattle = function () { window.__mt.ended = true; };
window.battleResult = function () { window.__mt.calls.push(Array.from(arguments)); };
window.RufflePlayer = window.RufflePlayer || {};
window.RufflePlayer.config = {
  logLevel: "info",          // AVM trace() is logged at INFO (target avm_trace)
  autoplay: "on",
  unmuteOverlay: "hidden",
  splashScreen: false,
  allowScriptAccess: true,
  warnOnUnsupportedContent: false,
  openUrlMode: "deny",
  publicPath: "/ruffle/",
  polyfills: false,
  showSwfDownload: false,
  contextMenu: "off",
};
</script>
<script src="/ruffle/ruffle.js"></script>
<script>
window.__mtLoad = function (swf, parameters, extra) {
  const player = window.RufflePlayer.newest().createPlayer();
  document.getElementById("c").appendChild(player);
  player.style.width = ((extra && extra.width) || 800) + "px"; player.style.height = ((extra && extra.height) || 600) + "px";
  return player.ruffle().load({ url: swf, parameters, allowScriptAccess: true, ...(extra || {}) });
};
</script></body></html>`;

const RUFFLE_DIR = dirname(createRequire(import.meta.url).resolve("@ruffle-rs/ruffle"));

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".wasm": "application/wasm",
  ".swf": "application/x-shockwave-flash",
  ".map": "application/json",
  ".jpg": "image/jpeg",
};

const startServer = async (): Promise<Server> => {
  const files: Record<string, string> = {
    "/swf/trace.swf": TRACE_SWF,
    "/swf/edit.swf": EDIT_SWF,
    "/swf/play.swf": PLAY_SWF,
    "/swf/army.swf": ARMY_SWF,
    "/swf/mini.swf": MINI_SWF,
  };
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    if (url === "/") {
      res.writeHead(200, { "content-type": "text/html" }).end(PAGE);
      return;
    }
    let file = files[url];
    if (file === undefined && /^\/img\/bg\/[\w-]+\.jpg$/.test(url)) file = BG_JPG;
    if (file === undefined && url.startsWith("/ruffle/") && /^[\w.-]+$/.test(url.slice(8))) {
      file = join(RUFFLE_DIR, url.slice(8));
    }
    if (file === undefined || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      // no-store: parallel pages racing on cache writes abort wasm streaming (ERR_CACHE_WRITE_FAILURE)
      "cache-control": "no-store",
    });
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  return server;
};

type BrowserContext = import("playwright").BrowserContext;

export interface RunOptions {
  /** `trace` (default) = instrumented oracle; `edit` = Eternaltwin's client_fr_edit.swf. */
  swf?: "trace" | "edit";
  timeoutMs?: number;
}

/** The original pages embed client_fr.swf at 720x440 with scale=noscale, bgcolor #F2DDB8. */
const PLAY_EMBED = { scale: "noscale", backgroundColor: "#F2DDB8", width: 720, height: 440 };

export interface PlayOptions {
  timeoutMs?: number;
  /** Non-battle modes: wait this long after the load (default 5000), then screenshot and report. */
  settleMs?: number;
  /**
   * Battles: poll a screenshot of `clip` (page CSS px) every `pollMs` (default 1000) until
   * `ready(png)` accepts it (the end-of-battle banner is up).
   */
  battle?: {
    clip: { x: number; y: number; width: number; height: number };
    ready: (png: Buffer) => boolean;
    pollMs?: number;
    /** The banner's "continuer" button (page px): clicked twice, the first click only activates the player. */
    continueAt?: { x: number; y: number } | undefined;
  };
}

export interface PlayRun {
  /** The SWF called endBattle() (only checked when `battle.continueAt` is set). */
  ended: boolean;
  /** console.error/warn lines and uncaught page errors. */
  errors: string[];
  /** Battles: the screenshot of `battle.clip` accepted by `ready`. Other modes: the 720x440 embed. */
  shot: Buffer;
}

export interface RawRun {
  /** Filtered oracle lines (TRP/EV/END/MTDONE). */
  lines: string[];
  /** ExternalInterface `battleResult` calls (edit SWF). */
  calls: unknown[][];
}

/** Headless Chromium with an explicit profile under tools/bin/tmp (instead of Playwright's
 * default %TEMP%/playwright_chromiumdev_profile-*); caller removes it with removeProfile. */
const launchContext = async (): Promise<[BrowserContext, string]> => {
  const { chromium } = await import("playwright");
  mkdirSync(PROFILES_DIR, { recursive: true });
  const dir = mkdtempSync(join(PROFILES_DIR, "chromium-"));
  try {
    // Playwright creates %TEMP%playwright-artifacts-* (os.tmpdir()) during launch, and Chromium
    // inherits TEMP: point both at tools/bin/tmp for the launch, then restore this process's env.
    const saved = { TEMP: process.env.TEMP, TMP: process.env.TMP };
    process.env.TEMP = process.env.TMP = PROFILES_DIR;
    try {
      const env = { ...process.env, TEMP: PROFILES_DIR, TMP: PROFILES_DIR } as Record<string, string>;
      return [await chromium.launchPersistentContext(dir, { headless: true, env }), dir];
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  } catch (e) {
    removeProfile(dir);
    throw e;
  }
};

const removeProfile = (dir: string): void =>
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });

/** Shares one HTTP server and one headless Chromium across runs; one fresh page (= one
 * fresh Ruffle instance, fresh AVM statics) per battle. */
export class OracleRunner {
  private server: Server | undefined;
  private profileDir: string | undefined;
  private context: BrowserContext | undefined;
  private starting: Promise<void> | undefined;

  private async start(): Promise<void> {
    this.starting ??= (async () => {
      this.server = await startServer();
      // One persistent context (profile in tools/bin/tmp, removed by close()), one page per battle.
      [this.context, this.profileDir] = await launchContext();
    })();
    await this.starting;
  }

  private get origin(): string {
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async runRaw(input: BattleInput, opts: RunOptions = {}): Promise<RawRun> {
    await this.start();
    const swf = opts.swf ?? "trace";
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const page = await this.context!.newPage();
    try {
      if (process.env.MT_ORACLE_DEBUG) {
        page.on("console", (m) => console.error(`[console.${m.type()}]`, m.text().slice(0, 300)));
        page.on("pageerror", (e) => console.error("[pageerror]", e));
      }
      await page.goto(this.origin + "/");
      const flashvars = toFlashvars(input, `${this.origin}/swf/army.swf`).slice("data=".length);
      await page.evaluate(
        ([u, p]) => (globalThis as any).__mtLoad(u, { data: decodeURIComponent(p) }),
        [`${this.origin}/swf/${swf}.swf`, flashvars] as [string, string],
      );
      let timedOut = false;
      await page
        .waitForFunction(
          (edit) => (edit ? (globalThis as any).__mt.calls.length >= 2 : (globalThis as any).__mt.done),
          swf === "edit",
          { timeout: timeoutMs, polling: 50 },
        )
        .catch((e: unknown) => {
          if ((e as Error).name !== "TimeoutError") throw e;
          timedOut = true;
        });
      const got = (await page.evaluate(() => (globalThis as any).__mt)) as { lines: string[]; calls: unknown[][] };
      const lines = filterTraceLines(got.lines);
      if (timedOut) throw new OracleTimeoutError(timeoutMs, lines);
      return { lines, calls: got.calls };
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Loads the display SWF (client_fr_play.swf) with the flashvars built by `params(origin)` (a
   * `clientParams()` string; `origin` serves army.swf / mini.swf under /swf/ and a background
   * under /img/bg/). The untouched client never reports the winner to JS: for battles the
   * end-of-battle banner (victory/defeat title) is screenshotted and, on request, the button clicked (see PlayOptions.battle).
   */
  async runPlay(params: (origin: string) => string, opts: PlayOptions = {}): Promise<PlayRun> {
    await this.start();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const page = await this.context!.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    try {
      await page.goto(this.origin + "/");
      const parameters = Object.fromEntries(new URLSearchParams(params(this.origin)));
      await page.evaluate(
        ([u, p, x]) => (globalThis as any).__mtLoad(u, p, x),
        [`${this.origin}/swf/play.swf`, parameters, PLAY_EMBED] as [string, Record<string, string>, typeof PLAY_EMBED],
      );
      let shot: Buffer;
      if (opts.battle !== undefined) {
        const { clip, ready, pollMs = 1000, continueAt } = opts.battle;
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          shot = await page.screenshot({ clip });
          if (ready(shot)) break;
          if (Date.now() > deadline) throw new OracleTimeoutError(timeoutMs, []);
          await page.waitForTimeout(pollMs);
        }
        if (continueAt !== undefined) {
          // Ruffle swallows the first click (focus/activation); the second one reaches the button.
          for (let i = 0; i < 3 && !(await page.evaluate(() => (globalThis as any).__mt.ended)); i++) {
            await page.mouse.move(continueAt.x, continueAt.y);
            await page.mouse.down();
            await page.mouse.up();
            await page.waitForTimeout(400);
          }
        }
      } else {
        await page.waitForTimeout(opts.settleMs ?? 5000);
        shot = await page.screenshot({ clip: { x: 8, y: 8, width: PLAY_EMBED.width, height: PLAY_EMBED.height } });
      }
      const got = (await page.evaluate(() => (globalThis as any).__mt)) as { errors: string[]; ended: boolean };
      return { ended: got.ended, errors: [...got.errors, ...pageErrors], shot };
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Opens a fresh page on the runner's server (`/` = the Ruffle page above, `__mtLoad(url, params, extra)`),
   * for tests that drive a player themselves; the caller closes it.
   */
  async newPage(): Promise<{ page: import("playwright").Page; origin: string; playSwf: string; embed: typeof PLAY_EMBED }> {
    await this.start();
    const page = await this.context!.newPage();
    await page.goto(this.origin + "/");
    return { page, origin: this.origin, playSwf: `${this.origin}/swf/play.swf`, embed: PLAY_EMBED };
  }

  async run(input: BattleInput, opts: Omit<RunOptions, "swf"> = {}): Promise<OracleTrace> {
    const { lines } = await this.runRaw(input, { ...opts, swf: "trace" });
    return { formatVersion: 1, swfSha256: traceSwfSha256(), input, record: parseTrace(lines) };
  }

  async close(): Promise<void> {
    await this.starting?.catch(() => {});
    await this.context?.close().catch(() => {});
    await new Promise<void>((ok) => (this.server ? this.server.close(() => ok()) : ok()));
    if (this.profileDir) removeProfile(this.profileDir);
    this.profileDir = undefined;
    this.context = undefined;
    this.server = undefined;
    this.starting = undefined;
  }
}

let shared: OracleRunner | undefined;

/** Runs one battle in the oracle (shared runner; call `closeOracle()` when done). */
export const runOracle = (input: BattleInput): Promise<OracleTrace> =>
  (shared ??= new OracleRunner()).run(input);

export const closeOracle = async (): Promise<void> => {
  const s = shared;
  shared = undefined;
  await s?.close();
};

/** True when Playwright's headless Chromium (tools/bin/ms-playwright) can be launched. */
export const chromiumAvailable = async (): Promise<boolean> => {
  try {
    // headless runs use chromium_headless_shell-*, which executablePath() does not report.
    const [context, dir] = await launchContext();
    await context.close();
    removeProfile(dir);
    return true;
  } catch {
    return false;
  }
};
