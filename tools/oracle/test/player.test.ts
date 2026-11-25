// Replay API of client_fr_play.swf (tools/oracle/instrument/patch-msg.as, HELPERS_PLAY + PC_PLAY_GAME_*/PC_PLAY_FAST):
// the SWF calls mtReady({total, checkpoints, waves, starts}) / mtProgress(idx, wave) / mtEnd() / mtStuck(idx) on the page and
// exposes mtPause / mtResume / mtSpeed / mtState / mtGoto (mtSeek: alias) / mtShot on its Ruffle element (#battle), plus
// test support: mtDump / mtHistStr / mtStopAt / mtSettle / mtKfSize.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { battleData, clientParams, toFlashvars, type BattleInput } from "@mt/engine";
import { simulateBattle } from "@mt/engine/internal";
import { OracleRunner, chromiumAvailable, type OracleTrace } from "../src/runner.ts";

/** A golden trace, or a fixture battle input (`fixture:<name>`, events from the engine). */
const golden = (id: string): OracleTrace => {
  if (id.startsWith("fixture:")) {
    const input = JSON.parse(readFileSync(new URL(`fixtures/${id.slice(8)}`, import.meta.url), "utf8")) as BattleInput;
    return { input, record: simulateBattle(input) } as unknown as OracleTrace;
  }
  return JSON.parse(gunzipSync(readFileSync(new URL(`../golden/${id}`, import.meta.url))).toString("utf8")) as OracleTrace;
};

/** BattleMsg index of an `EV time|tid|type` line. */
const msgType = (ev: string): number => Number(/^(\d+)/.exec(ev.slice(3).split("|")[2] ?? "")![1]);
const indicesOf = (t: OracleTrace, type: number): number[] =>
  t.record.events.flatMap((e, i) => (msgType(e) === type ? [i] : []));

interface Ready {
  total: number;
  checkpoints: number[];
  waves: number[];
  starts: number[];
}
interface Calls {
  ready: Ready[];
  progress: [number, number, number][]; // [idx, wave, performance.now()]
  end: number[]; // performance.now()
  stuck: [number, number][]; // [idx, performance.now()]
  paused: boolean[]; // mtPaused(paused) calls
  sim: { events: number; complete: boolean; waves: number[]; starts: number[]; at: number }[]; // mtSim calls
  readyAt: number;
}

const available = await chromiumAvailable();
const runner = new OracleRunner();
after(() => runner.close());

/**
 * Loads client_fr_play.swf with a golden's battle in a fresh page (element #battle), the mt* callbacks recording.
 * `flashvars` overrides some of the client's flashvars ("{origin}" is replaced by the runner's origin). `oracleData`:
 * the `data` flashvar the oracle was captured with (toFlashvars: trooper prefs as sent by the original pages, which
 * the battle history carries in its CheckPoint infos) instead of the server's (battleData).
 */
/**
 * The battle is simulated while it plays (lazy simulation): by default the page asks for 200 resolve() steps per frame
 * (mtAhead) at the first mtSim, so that the battle is complete within a few frames as before; ahead: 0 keeps the SWF's
 * default (a 5 ms budget per frame); pauseAtStart pauses before the first entry is applied (a plain playback from 0, for references).
 */
const open = async (id: string, flashvars: Record<string, string> = {}, oracleData = false, opts: { ahead?: number; pauseAtStart?: boolean } = {}) => {
  const t = golden(id);
  const { page, origin, playSwf, embed } = await runner.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const parameters = {
    ...Object.fromEntries(new URLSearchParams(clientParams(battleData(t.input, `${origin}/swf/army.swf`)))),
    ...(oracleData ? Object.fromEntries(new URLSearchParams(toFlashvars(t.input, `${origin}/swf/army.swf`))) : {}),
    ...Object.fromEntries(Object.entries(flashvars).map(([k, v]) => [k, v.replace("{origin}", origin)])),
  };
  await page.evaluate(
    ([u, p, x, o]) => {
      const w = globalThis as any;
      const c: Calls = (w.__calls = { ready: [], progress: [], end: [], stuck: [], paused: [], sim: [], readyAt: 0 });
      w.mtReady = (r: Ready) => {
        c.ready.push(r);
        c.readyAt = performance.now();
      };
      w.mtProgress = (idx: number, wave: number) => c.progress.push([idx, wave, performance.now()]);
      w.mtEnd = () => c.end.push(performance.now());
      w.mtStuck = (idx: number) => c.stuck.push([idx, performance.now()]);
      w.mtPaused = (b: boolean) => c.paused.push(b);
      w.mtSim = (x: any) => {
        c.sim.push({ ...x, at: performance.now() });
        if (c.sim.length === 1)
          setTimeout(() => {
            const e = w.document.getElementById("battle");
            if (o.ahead) e.mtAhead(o.ahead);
            if (o.pauseAtStart) e.mtPause();
          }, 0);
      };
      w.__mtLoad(u, p, x);
      w.document.querySelector("#c > *").id = "battle";
    },
    [playSwf, parameters, embed, { ahead: opts.ahead ?? 200, pauseAtStart: !!opts.pauseAtStart }] as [string, Record<string, string>, typeof embed, { ahead: number; pauseAtStart: boolean }],
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

/**
 * fn(n) (mtGoto or mtSeek) on #battle; if it returns false (the replay outlasted its synchronous budget: the emulated
 * bench is slow), waits for the end of the seek. Returns fn's result, then mtState and the mtProgress calls since the call.
 */
const jumpDone = async (
  p: Awaited<ReturnType<typeof open>>,
  fn: string,
  n: number,
): Promise<{ r: boolean; s: any; progress: [number, number][] }> => {
  const [r, mark] = await p.page.evaluate(
    ([f, x]) => {
      const w = globalThis as any;
      const mark = (w.__calls as Calls).progress.length;
      return [w.document.getElementById("battle")[f](x) as boolean, mark] as const;
    },
    [fn, n] as [string, number],
  );
  const s = await seekDone(p);
  const progress = (await p.calls()).progress.slice(mark).map(([i, v]) => [i, v] as [number, number]);
  return { r, s, progress };
};

/** Waits for the end of a seek replaying over frames (at most 60 s); returns mtState. */
const seekDone = async (p: Awaited<ReturnType<typeof open>>): Promise<any> => {
  for (let i = 0; i < 1200; i++) {
    const s = await p.call("mtState");
    if (!s.seeking) return s;
    await p.page.waitForTimeout(50);
  }
  return p.call("mtState");
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
      assert.equal(c.ready.length, 1);
      const { starts, ...rest } = c.ready[0]!;
      assert.deepEqual([rest], [{ total: p.t.record.events.length, checkpoints: indicesOf(p.t, 38), waves }]);
      // starts[k]: the first keyframe after NewWave k, before the next one
      assert.equal(starts.length, waves.length);
      starts.forEach((s, k) => assert.ok(s > waves[k]! && (k + 1 >= waves.length || s <= waves[k + 1]!), `starts ${starts} waves ${waves}`));
      assert.deepEqual(p.errors, []);
    } finally {
      await p.close();
    }
  });
}

// 87 history entries, one wave. One page: the number of frame() calls (game ticks) made over the same wall-clock window
// at x1, then at x32, must grow at least 4 times; then x32 plays to the end: mtProgress idx strictly increase to total,
// its wave counts the NewWave entries applied, mtEnd fires once.
// Ratio 4, not 32: under the emulated x64 Chromium one frame() costs 3-15 ms and the call budget is time-bound
// (patch-msg.as mtFrame). Calls, not whole-battle durations, so that page load and the first slow frames do not count.
const BATTLE = "basic/00028.json.gz";
const WINDOW_MS = 6000;
test(`x1 then x32 on ${BATTLE}: x32 makes at least 4 times more frame() calls; progress reaches total, mtEnd fires`, { timeout: 600_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open(BATTLE, {}, true);
  try {
    const total = p.t.record.events.length;
    await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
    await p.waitFor((c) => c.progress.length > 0, 60_000, "first mtProgress");
    const rate = async (): Promise<{ calls: number; idx: number }> => {
      const a = await p.call("mtState");
      await p.page.waitForTimeout(WINDOW_MS);
      const b = await p.call("mtState");
      return { calls: b.calls - a.calls, idx: b.idx - a.idx };
    };
    const x1 = await rate();
    await p.call("mtSpeed", 32);
    const x32 = await rate();
    t.diagnostic(`over ${WINDOW_MS} ms: x1 ${x1.calls} calls (+${x1.idx} idx), x32 ${x32.calls} calls (+${x32.idx} idx), ratio ${(x32.calls / x1.calls).toFixed(1)}`);
    assert.ok(x1.calls > 0, "x1 makes progress");
    assert.ok(x32.calls >= 4 * x1.calls, `x32 ${x32.calls} calls vs x1 ${x1.calls}`);
    await p.waitFor((c) => c.end.length > 0, 400_000, "mtEnd");
    await p.page.waitForTimeout(300);
    const c = await p.calls();
    assert.equal(c.end.length, 1, "mtEnd once");
    const idx = c.progress.map(([i]) => i);
    for (let i = 1; i < idx.length; i++) assert.ok(idx[i]! > idx[i - 1]!, `mtProgress idx increasing: ${idx.join(",")}`);
    assert.equal(idx.at(-1), total);
    const waves = indicesOf(p.t, 39);
    for (const [i, w] of c.progress) assert.equal(w, waves.filter((k) => k < i).length, `wave at idx ${i}`);
    assert.equal(c.progress.at(-1)![1], waves.length);
    const state = await p.call("mtState");
    assert.deepEqual(
      { idx: state.idx, total: state.total, ended: state.ended, paused: state.paused, speed: state.speed },
      { idx: total, total, ended: true, paused: false, speed: 32 },
    );
    // a whole playback leaves Battle.history as computed, and the copy restores replay from
    assert.equal(await p.call("mtHistStr"), p.t.record.events.join("\n"));
    assert.equal(await p.call("mtHistStr", true), p.t.record.events.join("\n"));
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
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
    assert.equal((await p.call("mtState")).speed, 0.0625);
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

// 83 entries, two waves (NewWave at 35 and 52), checkpoints at 6, 38, 55 and 78; Winner (81) is not the last entry.
const SEEK = "regression/modes-fr_b_view_miss2.json.gz";
test(`mtGoto on ${SEEK}: lands on the target synchronously, both ways, on CheckPoint indexes too; mtSeek is an alias; pause and speed kept`, { timeout: 300_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open(SEEK);
  try {
    const total = p.t.record.events.length;
    const waves = indicesOf(p.t, 39);
    assert.ok(waves.length >= 2, "golden with two waves");
    const waveAt = (i: number): number => waves.filter((k) => k < i).length;
    await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
    await p.waitFor((c) => c.progress.length > 0, 60_000, "first mtProgress");
    await p.call("mtSpeed", 2);
    const jump = (fn: string, n: number) => jumpDone(p, fn, n);
    // paused during the series: the mtProgress calls are the jumps' own
    await p.call("mtPause");
    const checkpoints = indicesOf(p.t, 38);
    let sync = 0;
    for (const [fn, n] of [
      ["mtGoto", 20],
      ["mtGoto", 10],
      ["mtSeek", checkpoints[1]!],
      ["mtGoto", waves[1]!],
      ["mtSeek", 3],
      ["mtGoto", 0],
      ["mtGoto", waves[0]! + 1],
    ] as const) {
      const j = await jump(fn, n);
      if (j.r) sync++;
      assert.deepEqual({ idx: j.s.idx, seeking: j.s.seeking, hidden: j.s.hidden, speed: j.s.speed, paused: j.s.paused }, { idx: n, seeking: false, hidden: false, speed: 2, paused: true }, `${fn}(${n})`);
      assert.deepEqual(j.progress, [[n, waveAt(n)]], `one mtProgress after ${fn}(${n})`);
    }
    t.diagnostic(`${sync}/7 jumps reached within mtGoto's synchronous budget`);
    await p.call("mtResume");
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) > waves[0]! + 1, 60_000, "playback goes on");
    // paused: the jump keeps the pause, playback resumes from the target
    await p.call("mtPause");
    const jp = await jump("mtGoto", 30);
    assert.deepEqual({ idx: jp.s.idx, paused: jp.s.paused, speed: jp.s.speed }, { idx: 30, paused: true, speed: 2 });
    await p.page.waitForTimeout(500);
    assert.equal((await p.call("mtState")).idx, 30, "still paused");
    await p.call("mtResume");
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) > 30, 60_000, "playback goes on after 30");
    // out of range: clamped
    await p.call("mtPause");
    assert.equal((await jump("mtGoto", -5)).s.idx, 0);
    const je = await jump("mtGoto", total + 10);
    assert.equal(je.s.idx, total);
    await p.page.waitForTimeout(300);
    const c = await p.calls();
    assert.equal(c.end.length, 1, "mtEnd once");
    assert.equal(c.progress.at(-1)![0], total);
    assert.equal((await p.call("mtState")).ended, true);
    assert.deepEqual(c.stuck, []);
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

// Going back from the end of the battle: the end banner and panel are removed, `ended` is false again, mtEnd is sent again
// once the end is reached anew.
test("mtGoto back from the end: no end banner, ended false; mtGoto(total) sends mtEnd again", { timeout: 300_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open("basic/00003.json.gz");
  try {
    const total = p.t.record.events.length;
    await p.waitFor((c) => c.progress.length > 0, 60_000, "first mtProgress");
    await jumpDone(p, "mtGoto", total);
    await p.call("mtSpeed", 8);
    await p.waitFor((c) => c.end.length > 0, 30_000, "mtEnd");
    // let the end banner and panel come in (60 ticks, then the panel)
    await p.page.waitForTimeout(3000);
    const s1 = await p.call("mtState");
    assert.deepEqual({ idx: s1.idx, ended: s1.ended, banner: s1.banner }, { idx: total, ended: true, banner: true });
    assert.match(await p.call("mtDump"), /\nE 1 banner$/);
    await p.call("mtPause");
    await jumpDone(p, "mtGoto", total - 10);
    const s2 = await p.call("mtState");
    assert.deepEqual({ idx: s2.idx, ended: s2.ended, banner: s2.banner }, { idx: total - 10, ended: false, banner: false });
    assert.match(await p.call("mtDump"), /\nE 0$/);
    assert.equal((await p.calls()).end.length, 1);
    await jumpDone(p, "mtGoto", total);
    const c = await p.calls();
    assert.equal(c.end.length, 2, "mtEnd again");
    assert.deepEqual(await p.call("mtState").then((s: any) => ({ idx: s.idx, ended: s.ended })), { idx: total, ended: true });
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

// Battle.history is never changed: neither by mtKf (the only addition to the Game's state 0) nor by playback and jumps.
// mtHistStr serialises it entry by entry as the oracle's trace does (`EV time|tid|type`, mtStr): equal to the golden's EV
// lines, byte for byte, on 30 varied battles, before and after a series of jumps.
const HISTORY = [
  "basic/00003.json.gz",
  "basic/00009.json.gz",
  "basic/00028.json.gz",
  "rats/00000.json.gz",
  "rats/00005.json.gz",
  "rats/00014.json.gz",
  "large/00006.json.gz",
  "large/00011.json.gz",
  "large/00016.json.gz",
  "vehicles/00004.json.gz",
  "vehicles/00007.json.gz",
  "vehicles/00012.json.gz",
  "helicopter/00002.json.gz",
  "helicopter/00005.json.gz",
  "jet/00002.json.gz",
  "jet/00008.json.gz",
  "comms/00004.json.gz",
  "comms/00015.json.gz",
  "sabotage/00006.json.gz",
  "sabotage/00018.json.gz",
  "specialists/00007.json.gz",
  "specialists/00016.json.gz",
  "levels/00003.json.gz",
  "levels/00021.json.gz",
  "martyr-saviour/00004.json.gz",
  "martyr-saviour/00012.json.gz",
  "forced-skill/00023.json.gz",
  "edge/00004.json.gz",
  "regression/modes-1100gex90_b_view_raid.json.gz",
  "regression/modes-fr_b_view_miss2.json.gz",
];
// twice: 200 resolve() steps per frame (complete within a few frames), and the SWF's default 5 ms budget (complete while
// the battle plays; the jumps below may wait for the simulation)
for (const [ahead, id] of [200, 0].flatMap((a) => HISTORY.map((h) => [a, h] as const))) {
  test(`Battle.history equals the oracle's EV lines, before and after jumps (${id}${ahead ? "" : ", 5 ms budget"})`, { timeout: 180_000 }, async (t) => {
    if (skip(t)) return;
    const p = await open(id, {}, true, { ahead });
    try {
      const total = p.t.record.events.length;
      const expected = p.t.record.events.join("\n");
      await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady (battle fully simulated)");
      assert.equal(await p.call("mtHistStr"), expected, "as computed");
      await p.call("mtPause");
      const s = await p.call("mtState");
      // one at least every 4 entries, but resolve() adds several at once (a whole turn, a comms strike): the gaps follow it
      t.diagnostic(`${s.kf} keyframes for ${total} entries`);
      assert.ok(s.kf >= Math.floor(total / 16), `${s.kf} keyframes for ${total} entries`);
      for (const n of [total, total >> 1, 0, (total * 3) >> 2, 1, total]) {
        const j = await jumpDone(p, "mtGoto", n);
        assert.equal(j.s.idx, n, `mtGoto(${n})`);
      }
      assert.equal(await p.call("mtHistStr"), expected, "after jumps");
      // the copy restores replay from (the display changes the entries it plays: they get copies)
      assert.equal(await p.call("mtHistStr", true), expected, "restore source after jumps");
      assert.deepEqual(p.errors, []);
    } finally {
      await p.close();
    }
  });
}

/** Deterministic PRNG (mulberry32). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

// After mtGoto(n), the scene is the one a plain playback shows at n: each trooper's position, hp, dead / down, weapons and
// ammo (not the reserve: the display counts it its own way, README), helmet, vehicle, statuses and wounds (alive troopers), this wave's dead, weapons on the ground, side panels, end
// of battle (mtDump). Reference: a fresh player at x32 paused by mtStopAt at each n in turn. Both sides are settled first
// (mtSettle: running animations played out, no new entry), so that the comparison does not depend on how far they are.
// 20 n per battle (fixed seed), visited by mtGoto in a shuffled order: both directions.
// Positions (pixels) are compared within POS_TOL: a keyframe holds the logic's squares; the display adds offsets of its
// own that no history entry carries (hit knock-backs, a melee attacker stopping by its victim's drawn position), which
// a plain playback keeps until the trooper next moves. Squares are 48 px: every tolerance stays under one square, but
// for the bodies listed in BLASTED, from the history index of the pushes on (each hit pushes a display trooper by its
// damage along the shot, a blast pushes a body after its death: offsets no entry carries), allowed up to POS_TOL_BLASTED. The largest offsets seen are reported per kind.
const POS_TOL = 40;
const POS_TOL_DEAD = 47;
const POS_TOL_BLASTED = 96;
const BLASTED: Record<string, { tid: number; from: number }[]> = {
  // hits 147-151 (the last one a blast), dead at 151
  "vehicles/00007.json.gz": [{ tid: 7, from: 147 }],
  // 4 hits in a row (200-203), dead at 203
  "comms/00004.json.gz": [{ tid: 17, from: 200 }],
};
interface SceneStats {
  alive: number;
  dead: number;
  ground: number;
}
/** mtDump lines equal, positions ("@x,y", pixels) within their tolerance; stats gets the largest offsets. */
const sameScene = (a: string, b: string, id: string, at: number, stats: SceneStats): boolean => {
  const la = a.split("\n");
  const lb = b.split("\n");
  if (la.length !== lb.length) return false;
  const pos = /@(-?\d+),(-?\d+)/;
  return la.every((l, i) => {
    const m = pos.exec(l);
    const n = pos.exec(lb[i]!);
    if (!m || !n) return l === lb[i];
    const d = Math.max(Math.abs(+m[1]! - +n[1]!), Math.abs(+m[2]! - +n[2]!));
    const kind: keyof SceneStats = l.startsWith("G ") ? "ground" : l.includes(" dead") ? "dead" : "alive";
    stats[kind] = Math.max(stats[kind], d);
    const tid = Number(/^T(\d+)/.exec(l)?.[1] ?? -1);
    const tol = kind === "alive" ? POS_TOL : kind === "dead" && (BLASTED[id] ?? []).some((x) => x.tid === tid && at >= x.from) ? POS_TOL_BLASTED : POS_TOL_DEAD;
    return l.replace(pos, "@") === lb[i]!.replace(pos, "@") && d <= tol;
  });
};
const EQUIV = [
  "basic/00003.json.gz",
  "rats/00005.json.gz",
  "vehicles/00007.json.gz",
  "helicopter/00002.json.gz",
  "regression/modes-1100gex90_b_view_raid.json.gz",
  "comms/00004.json.gz",
  "jet/00008.json.gz",
  "martyr-saviour/00012.json.gz",
];
for (const [k, id] of EQUIV.entries()) {
  test(`mtGoto(n) shows the scene of a playback stopped at n, 20 n both ways (${id})`, { timeout: 1_200_000 }, async (t) => {
    if (skip(t)) return;
    const total = golden(id).record.events.length;
    const r = rng(1000 + k);
    const ns = new Set<number>([0, total]);
    while (ns.size < 20) ns.add(1 + Math.floor(r() * total));
    const sorted = [...ns].sort((a, b) => a - b);
    const ref = new Map<number, string>();
    const dumps = async (p: Awaited<ReturnType<typeof open>>): Promise<string> => {
      // -2: out of time (Ruffle script limit), settle on
      for (let i = 0; i < 5 && (await p.call("mtSettle", 800)) === -2; i++);
      return (await p.call("mtDump")) as string;
    };
    const a = await open(id, {}, false, { pauseAtStart: true });
    try {
      await a.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
      await a.call("mtPause");
      await a.call("mtSpeed", 32);
      assert.equal((await a.call("mtState")).idx, 0, "reference paused before the first entry");
      for (const n of sorted) {
        if (n > 0) {
          await a.call("mtStopAt", n);
          await a.call("mtResume");
          await a.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) >= n, 600_000, `playback to ${n}`);
          await a.page.waitForTimeout(100);
        }
        const s = await a.call("mtState");
        if (n > 0) assert.deepEqual({ idx: s.idx, paused: s.paused }, { idx: n, paused: true }, `stopped at ${n}`);
        ref.set(n, await dumps(a));
      }
      assert.deepEqual(a.errors, []);
    } finally {
      await a.close();
    }
    const b = await open(id);
    try {
      await b.waitFor((c) => c.progress.length > 0, 60_000, "first mtProgress");
      await b.call("mtPause");
      const order = [...sorted].sort(() => r() - 0.5);
      const bad: string[] = [];
      const stats: SceneStats = { alive: 0, dead: 0, ground: 0 };
      for (const n of order) {
        // under the emulated bench a replay can outlast mtGoto's synchronous budget and end over the next frames
        await b.call("mtGoto", n);
        for (let i = 0; i < 600; i++) {
          const s = await b.call("mtState");
          if (!s.seeking) break;
          await b.page.waitForTimeout(50);
        }
        assert.deepEqual(await b.call("mtState").then((s: any) => ({ idx: s.idx, seeking: s.seeking })), { idx: n, seeking: false }, `mtGoto(${n})`);
        const got = await dumps(b);
        const want = ref.get(n)!;
        if (!sameScene(got, want, id, n, stats)) {
          const g = got.split("\n");
          const w = want.split("\n");
          bad.push(`n=${n}:\n  want ${w.filter((l) => !g.includes(l)).join("\n       ")}\n  got  ${g.filter((l) => !w.includes(l)).join("\n       ")}`);
        }
      }
      t.diagnostic(`largest position offsets (px): alive ${stats.alive}, bodies ${stats.dead}, ground weapons ${stats.ground}`);
      assert.deepEqual(bad, [], `order ${order.join(",")}`);
      assert.deepEqual(b.errors, []);
    } finally {
      await b.close();
    }
  });
}

// Timing in the bench's Chromium (x64 emulated under Windows ARM64, several times slower than a native browser, and
// noisy): the acceptance numbers are measured natively (Brave ARM64, .superpowers report). Here: every jump is reported;
// the warm ones (second visit of a scene: troopers pooled, skins rendered) are asserted under BENCH_MS, which is
// meaningful in the bench, and each jump must land on its target. 437 entries, 3 waves.
const TIMED = "large/00016.json.gz";
const BENCH_MS = 300;
test(`mtGoto timings on ${TIMED}: warm jumps (wave start, step ±1, end, home) under ${BENCH_MS} ms in the bench`, { timeout: 300_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open(TIMED);
  try {
    const total = p.t.record.events.length;
    await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady (battle fully simulated)");
    await p.call("mtPause");
    const st = await p.call("mtState");
    const starts = st.starts as number[];
    assert.equal(starts.length, indicesOf(p.t, 39).length);
    const timed = (n: number): Promise<{ ms: number; r: boolean }> =>
      p.page.evaluate((x) => {
        const el = (globalThis as any).document.getElementById("battle");
        const t0 = performance.now();
        const r = el.mtGoto(x);
        return { ms: performance.now() - t0, r };
      }, n);
    const out: { what: string; warm: boolean; ms: number; sync: boolean }[] = [];
    const jump = async (what: string, n: number, warm: boolean): Promise<void> => {
      await p.page.waitForTimeout(300);
      const m = await timed(n);
      const s = await seekDone(p);
      assert.equal(s.idx, n, what);
      out.push({ what, warm, ms: m.ms, sync: m.r });
    };
    const mid = total >> 1;
    await jump("wave 3 start (cold)", starts[1]!, false);
    await jump("end (cold)", total, false);
    await jump("home", 0, false);
    await jump("middle (cold)", mid, false);
    await jump("wave 2 start", starts[0]!, false);
    await jump("wave 3 start", starts[1]!, true);
    await jump("wave 2 start", starts[0]!, true);
    await jump("middle", mid, true);
    await jump("step -1", mid - 1, true);
    await jump("step +1", mid, true);
    await jump("end", total, true);
    await jump("home", 0, true);
    const [kf, objs, vals, gap] = (await p.call("mtKfSize")) as [number, number, number, number];
    t.diagnostic(`${out.map((o) => `${o.what}${o.warm ? " (warm)" : ""}: ${o.ms.toFixed(0)} ms${o.sync ? "" : " then over frames"}`).join(", ")}; ${kf} keyframes (largest gap ${gap} entries), ${objs} objects / ${vals} values`);
    for (const o of out.filter((o) => o.warm)) assert.ok(o.sync && o.ms < BENCH_MS, `${o.what}: ${o.ms.toFixed(0)} ms, ${o.sync ? "synchronous" : "then over frames"}`);
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

// Keyframe memory on the largest reference battle (1318 entries): reported, bounded.
test("keyframes of the largest reference battle (large/00011): count and size", { timeout: 180_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open("large/00011.json.gz");
  try {
    await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady (battle fully simulated)");
    const [kf, objs, vals, gap] = (await p.call("mtKfSize")) as [number, number, number, number];
    t.diagnostic(`${p.t.record.events.length} entries: ${kf} keyframes (largest gap ${gap} entries), ${objs} objects / ${vals} values (≈ ${Math.round((objs * 64 + vals * 16) / 1024)} KiB at 64 B per object and 16 B per value)`);
    assert.ok(kf >= p.t.record.events.length / 16 && objs < 200_000, `${kf} keyframes, ${objs} objects`);
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
    const r = await p.waitFor((c) => c.sim.length > 0, 60_000, "first mtSim (mtInit)");
    const c = await p.waitFor((c) => c.stuck.length > 0, 15_000, "mtStuck");
    const after = c.stuck[0]![1] - r.sim[0]!.at;
    t.diagnostic(`mtStuck ${Math.round(after)} ms after mtInit`);
    assert.ok(after >= 9_500 && after < 12_000, `mtStuck ${Math.round(after)} ms after mtInit (state 1 for 10 s)`);
    assert.equal(c.ready.length, 1, "the battle is simulated in state 1 too");
    assert.equal(c.stuck[0]![0], 0);
    await p.page.waitForTimeout(1500);
    const c2 = await p.calls();
    assert.equal(c2.stuck.length, 1, "mtStuck once");
    assert.deepEqual(c2.progress, []);
  } finally {
    await p.close();
  }
});

// A PlayerStatus (40) right after a CheckPoint (38), whose tid trooper is dead: after a jump to that CheckPoint the
// scene rebuild has removed the trooper, and the original step waited for it forever (raid seen stuck at idx 35/38
// after "Fin"). mtUnwait drops that wait. basic/00047: CheckPoint 36, PlayerStatus 37, Winner 39; the raid of the
// e2e test that hung (fixtures/raid-seek-stuck.json, 38 entries): CheckPoint 34, PlayerStatus 35 (tid 2, dead).
for (const [id, cp] of [["basic/00047.json.gz", 36], ["fixture:raid-seek-stuck.json", 34]] as const) {
  test(`mtSeek past a CheckPoint followed by a dead trooper's PlayerStatus does not hang (${id})`, { timeout: 300_000 }, async (t) => {
    if (skip(t)) return;
    const p = await open(id);
    try {
      const total = p.t.record.events.length;
      assert.equal(msgType(p.t.record.events[cp]!), 38);
      assert.equal(msgType(p.t.record.events[cp + 1]!), 40);
      await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
      await p.waitFor((c) => c.progress.length > 0, 60_000, "first mtProgress");
      const target = cp + 3 >= total ? total : cp + 3;
      const mark = await p.callMarked("mtSeek", target);
      const c = await p.waitFor((c) => c.progress.length > mark, 90_000, `mtProgress after mtSeek(${target})`);
      assert.ok(c.progress[mark]![0] >= target, `landed at ${c.progress[mark]![0]}, target ${target}`);
      if (target === total) await p.waitFor((c) => c.end.length > 0, 30_000, "mtEnd");
      else await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) > target, 60_000, `playback goes on after ${target}`);
      assert.deepEqual(c.stuck, [], "no mtStuck");
      assert.deepEqual(p.errors, []);
    } finally {
      await p.close();
    }
  });
}

// The pause is the Game's own (a click on the battlefield opens its pause screen: grey snapshot, "PAUSE"): mtPause opens
// that same screen, a native click is reported (mtState().paused, mtPaused(paused)), and jumps keep the pause: the
// screen comes back over the scene at n (as a plain playback stopped at n shows it), the index does not move, resuming
// plays on from n.
test("native pause (click on the battlefield) = mtPause; mtGoto during the pause keeps it, shows n; resume plays on", { timeout: 300_000 }, async (t) => {
  if (skip(t)) return;
  const id = "basic/00028.json.gz";
  const n = 40;
  const a = await open(id, {}, false, { pauseAtStart: true });
  let want = "";
  try {
    await a.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
    await a.call("mtPause");
    await a.call("mtSpeed", 32);
    await a.call("mtStopAt", n);
    await a.call("mtResume");
    await a.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) >= n, 300_000, `playback to ${n}`);
    await a.page.waitForTimeout(100);
    for (let i = 0; i < 5 && (await a.call("mtSettle", 800)) === -2; i++);
    want = await a.call("mtDump");
  } finally {
    await a.close();
  }
  const p = await open(id);
  try {
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) >= 3, 60_000, "idx >= 3");
    const box = (await p.page.locator("#battle").boundingBox())!;
    const click = () => p.page.mouse.click(box.x + 360, box.y + 120);
    // Ruffle swallows the first click on a fresh page (focus)
    await click();
    await p.page.waitForTimeout(500);
    if (!(await p.call("mtState")).paused) {
      await click();
      await p.page.waitForTimeout(500);
    }
    const s0 = await p.call("mtState");
    assert.deepEqual({ paused: s0.paused, screen: s0.screen }, { paused: true, screen: true }, "native click: paused, pause screen open");
    assert.deepEqual((await p.calls()).paused, [true]);
    await p.page.waitForTimeout(800);
    assert.equal((await p.call("mtState")).idx, s0.idx, "idx frozen in the native pause");

    // a jump during the native pause: still paused, screen back, scene at n
    await p.call("mtGoto", n);
    const s1 = await seekDone(p);
    assert.deepEqual({ idx: s1.idx, paused: s1.paused, screen: s1.screen }, { idx: n, paused: true, screen: true }, "mtGoto in the pause");
    await p.page.waitForTimeout(800);
    assert.equal((await p.call("mtState")).idx, n, "still frozen at n");
    for (let i = 0; i < 5 && (await p.call("mtSettle", 800)) === -2; i++);
    const got = await p.call("mtDump");
    const stats: SceneStats = { alive: 0, dead: 0, ground: 0 };
    assert.ok(sameScene(got, want, id, n, stats), `scene at ${n} in the pause\n${got}\n--- want\n${want}`);
    assert.equal((await p.call("mtState")).screen, true, "mtSettle keeps the pause screen");

    // a native click resumes: playback goes on from n
    await click();
    await p.page.waitForTimeout(300);
    assert.equal((await p.call("mtState")).paused, false);
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) > n, 30_000, "idx > n after the resume");
    for (let i = 0; i < 40 && (await p.call("mtState")).screen; i++) await p.page.waitForTimeout(100);
    assert.equal((await p.call("mtState")).screen, false, "pause screen faded out");

    // the button pause is the same pause: same screen, same frozen index, jumps keep it, mtResume plays on
    await p.call("mtPause");
    assert.equal((await p.call("mtState")).paused, true, "mtPause: paused at once");
    await p.page.waitForTimeout(300); // the screen opens at the next frame
    const s2 = await p.call("mtState");
    assert.deepEqual({ paused: s2.paused, screen: s2.screen }, { paused: true, screen: true }, "mtPause: the pause screen");
    await p.page.waitForTimeout(800);
    assert.equal((await p.call("mtState")).idx, s2.idx, "idx frozen by mtPause");
    await p.call("mtGoto", s2.idx - 2);
    const s3 = await seekDone(p);
    assert.deepEqual({ idx: s3.idx, paused: s3.paused, screen: s3.screen }, { idx: s2.idx - 2, paused: true, screen: true }, "step back in the pause");
    await p.call("mtResume");
    assert.equal((await p.call("mtState")).paused, false);
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) > s3.idx, 30_000, "idx increases after mtResume");
    assert.deepEqual((await p.calls()).paused, [true, false, true, false]);
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

// Lazy simulation (as BetterTrooper): the Game leaves its state 0 as soon as the history has an entry and the battle is
// resolved a few steps per frame while it plays. mtSim reports the entries simulated so far (growing), then complete;
// mtReady comes once complete (same total as the golden). Playback starts before that. A jump past the simulated entries
// waits for them (seeking, target) and lands; the history is the golden's, entry for entry.
test("lazy simulation on large/00016: playback starts before the battle is fully simulated; a jump past it waits and lands", { timeout: 300_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open("large/00016.json.gz", {}, true, { ahead: 1 });
  try {
    const total = p.t.record.events.length;
    const c0 = await p.waitFor((c) => c.progress.length > 0, 60_000, "first mtProgress");
    assert.equal(c0.ready.length, 0, "playback started before mtReady");
    assert.ok(c0.sim.length > 0 && !c0.sim[0]!.complete && c0.sim[0]!.events < total, `first mtSim ${JSON.stringify(c0.sim[0])}`);
    const n = total - 5;
    await p.call("mtPause"); // playback would go on past n once landed
    // the call and the state read in the same JS turn (no frame in between)
    const [r, s0] = await p.page.evaluate((x) => { const e = (globalThis as any).document.getElementById("battle"); const r = e.mtGoto(x); return [r, e.mtState()]; }, n);
    assert.deepEqual({ r, complete: s0.complete, seeking: s0.seeking, target: s0.target }, { r: false, complete: false, seeking: true, target: n }, "the jump waits for the simulation");
    const s1 = await seekDone(p);
    assert.deepEqual({ idx: s1.idx, seeking: s1.seeking }, { idx: n, seeking: false }, `mtGoto(${n}) landed`);
    const c = await p.waitFor((c) => c.ready.length > 0, 60_000, "mtReady");
    assert.equal(c.ready[0]!.total, total);
    const ev = c.sim.map((x) => x.events);
    assert.ok(ev.every((x, i) => i === 0 || x >= ev[i - 1]!), "events never decrease");
    assert.deepEqual({ events: c.sim.at(-1)!.events, complete: c.sim.at(-1)!.complete }, { events: total, complete: true });
    assert.ok(c.sim.filter((x) => x.complete).length === 1, "complete once");
    assert.equal(await p.call("mtHistStr"), p.t.record.events.join("\n"), "history as computed");
    t.diagnostic(`${c.sim.length} mtSim calls; first mtProgress ${Math.round(c0.progress[0]![2])} ms, mtReady ${Math.round(c.readyAt)} ms after load`);
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});

// Controls while the battle is still being simulated (mtAhead(1): one resolve() step per frame, so that it lasts): native
// pause click (the simulation goes on under the PAUSE screen), a trooper's card (native pause with his card), x32, and
// the two pause races: resume then pause at once (the fading screen replaced by a new one: paused), pause then a field
// click before the next frame (the click wins: resumed, the game not frozen). The history stays the golden's.
test("during the simulation: native pause, trooper card, x32, resume+pause and pause+click races (large/00016)", { timeout: 300_000 }, async (t) => {
  if (skip(t)) return;
  const p = await open("large/00016.json.gz", {}, true, { ahead: 1 });
  try {
    const state = () => p.call("mtState");
    const box = (await p.page.locator("#battle").boundingBox())!;
    const clickAt = (x: number, y: number) => p.page.mouse.click(box.x + x, box.y + y);
    const frozenFor = async (ms: number): Promise<boolean> => {
      const a = (await state()).idx;
      await p.page.waitForTimeout(ms);
      return (await state()).idx === a;
    };
    await p.waitFor((c) => (c.progress.at(-1)?.[0] ?? 0) >= 2, 60_000, "idx >= 2");
    assert.equal((await state()).complete, false, "still simulating");

    // native pause (Ruffle swallows the first click on a fresh page)
    await clickAt(360, 120);
    await p.page.waitForTimeout(500);
    if (!(await state()).paused) {
      await clickAt(360, 120);
      await p.page.waitForTimeout(500);
    }
    const s1 = await state();
    assert.deepEqual({ paused: s1.paused, screen: s1.screen, complete: s1.complete }, { paused: true, screen: true, complete: false }, "native pause during the simulation");
    assert.ok(await frozenFor(600), "frozen in the pause");
    assert.ok((await state()).total > s1.total, "the simulation goes on under the pause screen");
    await clickAt(360, 120);
    for (let i = 0; i < 40 && (await state()).screen; i++) await p.page.waitForTimeout(100);
    assert.deepEqual(await state().then((s: any) => ({ paused: s.paused, screen: s.screen })), { paused: false, screen: false }, "native resume");

    // a trooper's card: a click on an alive trooper opens the native pause with his card
    const dump = (await p.call("mtDump")) as string;
    const m = /^T\d+ s\d @(\d+),(\d+) hp[1-9]/m.exec(dump)!;
    await clickAt(Number(m[1]), Number(m[2]) - 20);
    await p.page.waitForTimeout(500);
    const s2 = await state();
    t.diagnostic(`trooper click at ${m[1]},${Number(m[2]) - 20}: paused ${s2.paused}, screen ${s2.screen}`);
    if (s2.paused) {
      assert.equal(s2.screen, true, "trooper card: the pause screen");
      assert.ok(await frozenFor(500), "frozen with the card open");
      await p.call("mtResume");
      for (let i = 0; i < 40 && (await state()).screen; i++) await p.page.waitForTimeout(100);
    }

    // race 1: resume, then pause again while the screen fades out
    await p.call("mtPause");
    await p.page.waitForTimeout(300);
    await p.page.evaluate(() => {
      const e = (globalThis as any).document.getElementById("battle");
      e.mtResume();
      e.mtPause();
    });
    await p.page.waitForTimeout(600);
    const s3 = await state();
    assert.deepEqual({ paused: s3.paused, screen: s3.screen }, { paused: true, screen: true }, "resume + pause: paused");
    assert.ok(await frozenFor(600), "resume + pause: frozen");

    // race 2: (resumed) pause, then a field click before the next frame: the click wins
    await p.call("mtResume");
    for (let i = 0; i < 40 && (await state()).screen; i++) await p.page.waitForTimeout(100);
    await p.page.evaluate(() => (globalThis as any).document.getElementById("battle").mtPause());
    await clickAt(360, 120);
    await p.page.waitForTimeout(800);
    const s4 = await state();
    for (let i = 0; i < 40 && (await state()).screen !== (await state()).paused; i++) await p.page.waitForTimeout(100);
    const s5 = await state();
    assert.equal(s5.screen, s5.paused, `pause + click: screen and paused agree (${JSON.stringify({ paused: s4.paused, screen: s4.screen })})`);
    // resumed: it plays, unless it has caught up with the simulation (one resolve() step per frame here)
    if (!s5.paused && (await frozenFor(1500))) { const s = await state(); assert.equal(s.idx, s.total, `pause + click: resumed but frozen at ${s.idx}/${s.total}`); }

    // x32 during the simulation
    if ((await state()).paused) await p.call("mtResume");
    await p.call("mtSpeed", 32);
    const i0 = (await state()).idx;
    await p.page.waitForTimeout(1500);
    assert.ok((await state()).idx > i0, "x32 plays on during the simulation");
    await p.call("mtAhead", 0);
    const c = await p.waitFor((c) => c.ready.length > 0, 120_000, "mtReady");
    assert.equal(c.ready[0]!.total, p.t.record.events.length);
    assert.equal(await p.call("mtHistStr"), p.t.record.events.join("\n"), "history as computed");
    assert.deepEqual(p.errors, []);
  } finally {
    await p.close();
  }
});
