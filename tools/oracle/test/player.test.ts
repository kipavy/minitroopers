// Replay API of client_fr_play.swf (tools/oracle/instrument/patch-msg.as, HELPERS_PLAY + PC_PLAY_GAME_*/PC_PLAY_FAST):
// the SWF calls mtReady({total, checkpoints, waves}) / mtProgress(idx, wave) / mtEnd() / mtStuck(idx) on the page and
// exposes mtPause / mtResume / mtSpeed / mtState / mtSeek / mtShot on its Ruffle element (#battle).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { battleData, clientParams } from "@mt/engine";
import { OracleRunner, chromiumAvailable, type OracleTrace } from "../src/runner.ts";

const golden = (id: string): OracleTrace =>
  JSON.parse(gunzipSync(readFileSync(new URL(`../golden/${id}`, import.meta.url))).toString("utf8")) as OracleTrace;

/** BattleMsg index of an `EV time|tid|type` line. */
const msgType = (ev: string): number => Number(/^(\d+)/.exec(ev.slice(3).split("|")[2] ?? "")![1]);
const indicesOf = (t: OracleTrace, type: number): number[] =>
  t.record.events.flatMap((e, i) => (msgType(e) === type ? [i] : []));

interface Ready {
  total: number;
  checkpoints: number[];
  waves: number[];
}
interface Calls {
  ready: Ready[];
  progress: [number, number, number][]; // [idx, wave, performance.now()]
  end: number[]; // performance.now()
  stuck: [number, number][]; // [idx, performance.now()]
  readyAt: number;
}

const available = await chromiumAvailable();
const runner = new OracleRunner();
after(() => runner.close());

/**
 * Loads client_fr_play.swf with a golden's battle in a fresh page (element #battle), the mt* callbacks recording.
 * `flashvars` overrides some of the client's flashvars ("{origin}" is replaced by the runner's origin).
 */
const open = async (id: string, flashvars: Record<string, string> = {}) => {
  const t = golden(id);
  const { page, origin, playSwf, embed } = await runner.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const parameters = {
    ...Object.fromEntries(new URLSearchParams(clientParams(battleData(t.input, `${origin}/swf/army.swf`)))),
    ...Object.fromEntries(Object.entries(flashvars).map(([k, v]) => [k, v.replace("{origin}", origin)])),
  };
  await page.evaluate(
    ([u, p, x]) => {
      const w = globalThis as any;
      const c: Calls = (w.__calls = { ready: [], progress: [], end: [], stuck: [], readyAt: 0 });
      w.mtReady = (r: Ready) => {
        c.ready.push(r);
        c.readyAt = performance.now();
      };
      w.mtProgress = (idx: number, wave: number) => c.progress.push([idx, wave, performance.now()]);
      w.mtEnd = () => c.end.push(performance.now());
      w.mtStuck = (idx: number) => c.stuck.push([idx, performance.now()]);
      w.__mtLoad(u, p, x);
      w.document.querySelector("#c > *").id = "battle";
    },
    [playSwf, parameters, embed] as [string, Record<string, string>, typeof embed],
  );
  const calls = (): Promise<Calls> => page.evaluate(() => (globalThis as any).__calls as Calls);
  const call = (fn: string, ...args: unknown[]): Promise<any> =>
    page.evaluate(([f, a]) => (globalThis as any).document.getElementById("battle")[f as string](...(a as unknown[])), [fn, args] as [string, unknown[]]);
  const waitFor = async (pred: (c: Calls) => boolean, ms: number, what: string): Promise<Calls> => {
    const deadline = Date.now() + ms;
    for (;;) {
      const c = await calls();
      if (pred(c)) return c;
      if (Date.now() > deadline) throw new Error(`${id}: ${what} not within ${ms} ms (${JSON.stringify({ ready: c.ready.length, progress: c.progress.slice(-3), end: c.end.length })})`);
      await page.waitForTimeout(50);
    }
  };
  /** Calls fn on #battle; returns the number of mtProgress calls recorded just before it (same JS turn). */
  const callMarked = (fn: string, ...args: unknown[]): Promise<number> =>
    page.evaluate(
      ([f, a]) => {
        const w = globalThis as any;
        const n = (w.__calls as Calls).progress.length;
        w.document.getElementById("battle")[f as string](...(a as unknown[]));
        return n;
      },
      [fn, args] as [string, unknown[]],
    );
  return { t, page, errors, calls, call, callMarked, waitFor, close: () => page.close().catch(() => {}) };
};

const skip = (t: { skip: (m: string) => void }): boolean => {
  if (!available) t.skip("Playwright Chromium not installed under tools/bin/ms-playwright");
  return !available;
};

for (const id of ["basic/00028.json.gz", "rats/00047.json.gz"]) {
  test(`mtReady reports the history's length, checkpoints and waves (${id})`, { timeout: 120_000 }, async (t) => {
    if (skip(t)) return;
    const p = await open(id);
    try {
      const c = await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
      const waves = indicesOf(p.t, 39);
      assert.ok(waves.length > 0, "golden with at least one wave");
      assert.deepEqual(c.ready, [{ total: p.t.record.events.length, checkpoints: indicesOf(p.t, 38), waves }]);
      assert.deepEqual(p.errors, []);
    } finally {
      await p.close();
    }
  });
}

// 87 history entries, one wave (45-170 s at x1 on the emulated Chromium): mtProgress idx strictly increase to total, its wave counts the
// NewWave entries applied, mtEnd fires once; then the same battle at x32 ends at least 4 times sooner (mtReady -> mtEnd).
// Ratio 4, not 32: under the emulated x64 Chromium one frame() costs 3-15 ms and the call budget is time-bound
// (patch-msg.as mtFrame); a shorter battle is dominated by its first, slow frames.
const BATTLE = "basic/00028.json.gz";
test(`x1 then x32 on ${BATTLE}: progress reaches total, mtEnd fires, x32 is at least 4 times faster`, { timeout: 900_000 }, async (t) => {
  if (skip(t)) return;
  const run = async (speed: number): Promise<{ ms: number; c: Calls; total: number }> => {
    const p = await open(BATTLE);
    try {
      await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
      if (speed !== 1) await p.call("mtSpeed", speed);
      const c = await p.waitFor((c) => c.end.length > 0, 400_000, "mtEnd");
      await p.page.waitForTimeout(300);
      const after = await p.calls();
      assert.equal(after.end.length, 1, "mtEnd once");
      const state = await p.call("mtState");
      assert.deepEqual(
        { idx: state.idx, total: state.total, ended: state.ended, paused: state.paused, speed: state.speed },
        { idx: p.t.record.events.length, total: p.t.record.events.length, ended: true, paused: false, speed },
      );
      assert.deepEqual(p.errors, []);
      return { ms: c.end[0]! - c.readyAt, c: after, total: p.t.record.events.length };
    } finally {
      await p.close();
    }
  };
  const x1 = await run(1);
  const idx = x1.c.progress.map(([i]) => i);
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i]! > idx[i - 1]!, `mtProgress idx increasing: ${idx.join(",")}`);
  assert.equal(idx.at(-1), x1.total);
  const waves = indicesOf(golden(BATTLE), 39);
  for (const [i, w] of x1.c.progress) assert.equal(w, waves.filter((k) => k < i).length, `wave at idx ${i}`);
  assert.equal(x1.c.progress.at(-1)![1], waves.length);
  const x32 = await run(32);
  t.diagnostic(`x1 ${Math.round(x1.ms)} ms, x32 ${Math.round(x32.ms)} ms (ratio ${(x1.ms / x32.ms).toFixed(1)})`);
  assert.ok(x32.ms < x1.ms / 4, `x32 ${Math.round(x32.ms)} ms vs x1 ${Math.round(x1.ms)} ms`);
});

test("mtPause freezes the applied index, mtResume restarts it; mtSpeed is clamped", { timeout: 180_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open("basic/00028.json.gz");
  try {
    await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
    await p.call("mtSpeed", 4);
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) >= 5, 60_000, "idx >= 5");
    await p.call("mtPause");
    const s0 = await p.call("mtState");
    assert.equal(s0.paused, true);
    await p.page.waitForTimeout(1000);
    const s1 = await p.call("mtState");
    assert.equal(s1.idx, s0.idx, "idx frozen while paused");
    await p.call("mtResume");
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) > s1.idx, 30_000, "idx increases after mtResume");
    assert.equal((await p.call("mtState")).paused, false);
    await p.call("mtSpeed", 1000);
    assert.equal((await p.call("mtState")).speed, 32);
    await p.call("mtSpeed", 0.01);
    assert.equal((await p.call("mtState")).speed, 0.125);
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

// 83 entries, two waves (NewWave at 35 and 52), checkpoints at 6, 38, 55 and 78; Winner (81) is not the last entry.
const SEEK = "regression/modes-fr_b_view_miss2.json.gz";
test(`mtSeek on ${SEEK}: lands exactly on the target and plays on; backward is ignored; mtSeek(total) ends`, { timeout: 300_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open(SEEK);
  try {
    const total = p.t.record.events.length;
    const waves = indicesOf(p.t, 39);
    assert.ok(waves.length >= 2, "golden with two waves");
    const waveAt = (i: number): number => waves.filter((k) => k < i).length;
    await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
    await p.call("mtSpeed", 2);
    const seekTo = async (n: number): Promise<void> => {
      const mark = await p.callMarked("mtSeek", n);
      const c = await p.waitFor((c) => c.progress.length > mark, 60_000, `mtProgress after mtSeek(${n})`);
      assert.deepEqual(c.progress[mark]!.slice(0, 2), [n, waveAt(n)], `first mtProgress after mtSeek(${n})`);
      await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) > n, 60_000, `playback goes on after ${n}`);
      assert.equal((await p.call("mtState")).speed, 2, "speed kept");
    };
    // middle of the first wave: jump to the checkpoint at 6, then fast-forward
    await seekTo(20);
    // backward: no effect (the page reloads the player instead)
    await p.call("mtPause");
    const s0 = await p.call("mtState");
    const mark = await p.callMarked("mtSeek", 10);
    await p.page.waitForTimeout(800);
    assert.equal((await p.call("mtState")).idx, s0.idx, "idx unchanged by a backward mtSeek");
    assert.equal((await p.calls()).progress.length, mark, "no mtProgress after a backward mtSeek");
    await p.call("mtResume");
    // first entry of the next wave (its NewWave): jump to the checkpoint at 38, then fast-forward
    await seekTo(waves[1]!);
    // the end: mtEnd once, last mtProgress = total
    await p.call("mtSeek", total);
    await p.waitFor((c) => c.end.length > 0, 60_000, "mtEnd after mtSeek(total)");
    await p.page.waitForTimeout(300);
    const c = await p.calls();
    assert.equal(c.end.length, 1, "mtEnd once");
    assert.equal(c.progress.at(-1)![0], total);
    assert.equal((await p.call("mtState")).ended, true);
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

test("mtShot returns the stage's 720x440 ARGB pixels in base64", { timeout: 180_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open("basic/00028.json.gz");
  try {
    await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) >= 3, 60_000, "idx >= 3");
    const t0 = Date.now();
    const b64: unknown = await p.call("mtShot");
    assert.equal(typeof b64, "string");
    t.diagnostic(`mtShot ${Date.now() - t0} ms, ${(b64 as string).length} chars`);
    assert.match(b64 as string, /^[A-Za-z0-9+/]+=*$/);
    const px = Buffer.from(b64 as string, "base64");
    assert.equal(px.length, 720 * 440 * 4);
    assert.ok(px.some((b) => b !== px[0]), "not all bytes identical");
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

test("mtStuck fires once, within 12 s, when the background image never loads", { timeout: 120_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open("basic/00028.json.gz", { imageurl: "{origin}/missing/" });
  try {
    const r = await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
    const c = await p.waitFor((c) => c.stuck.length > 0, 15_000, "mtStuck");
    const after = c.stuck[0]![1] - r.readyAt;
    t.diagnostic(`mtStuck ${Math.round(after)} ms after mtReady`);
    assert.ok(after >= 9_500 && after < 12_000, `mtStuck ${Math.round(after)} ms after mtReady (state 1 for 10 s)`);
    assert.equal(c.stuck[0]![0], 0);
    await p.page.waitForTimeout(1500);
    const c2 = await p.calls();
    assert.equal(c2.stuck.length, 1, "mtStuck once");
    assert.deepEqual(c2.progress, []);
  } finally {
    await p.close();
  }
});
