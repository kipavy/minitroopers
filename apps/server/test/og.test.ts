import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBattleInput } from "../src/battleInput.ts";
import { battleTroopers } from "../src/deploy.ts";
import { bannerJpeg, bannerSvg, BANNER_VERSION, fitText, textWidth100, xmlText, type Banner } from "../src/og.ts";
import { purgeBattleImages } from "../src/ogCache.ts";
import { battleById, createArmy, deleteArmy } from "../src/repo.ts";
import { battleBanner, ogLimits, ogStats } from "../src/routes/og.ts";
import { setup, type Env, type Mode } from "./helpers.ts";

const MODES: Mode[] = ["path", "subdomain"];

function army(env: Env, host: string, name: string, faction: number, troopers = 1): number {
  const r = createArmy(env.db, {
    host,
    name,
    part: 0,
    faction,
    credits: 0,
    recruiterId: null,
    createdIp: "9.9.9.9",
    createdCid: null,
    now: env.clock.t,
    trooper: { seed: 1234567, name: "Bob" },
    maxPerIp: 999,
    dayOf: () => "x",
  });
  if (!r.ok) throw new Error(r.reason);
  const ins = env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?, ?, ?, ?, '[]')");
  for (let i = 1; i < troopers; i++) ins.run(r.army.id, i, 1000 + i, `T${i}`);
  return r.army.id;
}

/** Stores a battle `a` vs `b` of the given kind (as the fight transaction would), returns its id. */
function battle(env: Env, a: number, b: number, kind = "battle"): number {
  const side = (id: number) => ({ faction: (env.db.prepare("SELECT faction FROM armies WHERE id = ?").get(id) as { faction: number }).faction, troopers: battleTroopers(env.db, id) });
  const input = buildBattleInput(4242, side(a), (() => {
    const s = side(b);
    return { faction: s.faction, spawnOrder: s.troopers.map((t) => t.id), troopers: s.troopers };
  })());
  const r = env.db
    .prepare("INSERT INTO battles(day, attacker_id, defender_id, input, winner, kind) VALUES ('2026-11-23', ?, ?, ?, 0, ?)")
    .run(a, b, JSON.stringify(input), kind);
  return Number(r.lastInsertRowid);
}

/** Width and height of a JPEG from its first SOF marker. */
function jpegSize(buf: Buffer): { w: number; h: number } {
  assert.deepEqual([...buf.subarray(0, 3)], [0xff, 0xd8, 0xff], "SOI");
  let pos = 2;
  while (pos < buf.length) {
    assert.equal(buf[pos], 0xff, "marker");
    const marker = buf[pos + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(pos + 5), w: buf.readUInt16BE(pos + 7) };
    }
    pos += 2 + buf.readUInt16BE(pos + 2);
  }
  throw new Error("no SOF");
}

function env(mode: Mode): Env & { dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "mt-og-"));
  const e = setup(mode, { DATA_DIR: dir });
  test.after(() => rmSync(dir, { recursive: true, force: true }));
  return Object.assign(e, { dir });
}

for (const mode of MODES) {
  test(`[${mode}] /og/battle/<id>.jpg: a 1200x630 JPEG for a daily battle, from any host, no cookie`, async () => {
    const e = env(mode);
    const id = battle(e, army(e, "killian", "killian", 3, 12), army(e, "ip-mat", "ip-mat", 2, 12));
    const hosts = mode === "path" ? ["localhost"] : ["lvh.me:8080", "killian.lvh.me:8080"];
    for (const host of hosts) {
      const res = await e.app.request(`/og/battle/${id}.jpg`, { headers: { host } });
      assert.equal(res.status, 200, host);
      assert.equal(res.headers.get("content-type"), "image/jpeg");
      assert.match(res.headers.get("cache-control")!, /^public, max-age=\d{6,}$/);
      assert.equal(res.headers.get("set-cookie"), null);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      const buf = Buffer.from(await res.arrayBuffer());
      assert.deepEqual(jpegSize(buf), { w: 1200, h: 630 });
      assert.ok(buf.length < 300 * 1024, `${buf.length} bytes`);
    }
  });
}

test("/og/battle: 404 for an unknown id, a mission, a raid and a malformed path", async () => {
  const e = env("path");
  const a = army(e, "warp", "Warp", 1);
  const b = army(e, "foe", "Foe", 4);
  const mission = battle(e, a, b, "mission");
  const raid = battle(e, a, b, "raid");
  for (const path of ["/og/battle/999999.jpg", `/og/battle/${mission}.jpg`, `/og/battle/${raid}.jpg`, "/og/battle/abc.jpg", `/og/battle/${mission}.png`]) {
    const res = await e.app.request(path);
    assert.equal(res.status, 404, path);
    if (path.startsWith("/og/battle/") && path.endsWith(".jpg") && !path.includes("abc")) assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(existsSync(join(e.dir, "og")), false, "nothing drawn");
});

const ogFiles = (e: { dir: string }): string[] => (existsSync(join(e.dir, "og")) ? readdirSync(join(e.dir, "og")).sort() : []);

test("/og/battle: drawn once into DATA_DIR/og/<id>-v<version>-<hash>.jpg, then served from that file", async () => {
  const e = env("path");
  const id = battle(e, army(e, "warp", "Warp", 1, 3), army(e, "foe", "Foe", 4, 2));
  const before = ogStats.generated;
  // concurrent first requests share one drawing
  const [r1, r2] = await Promise.all([e.app.request(`/og/battle/${id}.jpg`), e.app.request(`/og/battle/${id}.jpg`)]);
  const b1 = Buffer.from(await r1.arrayBuffer());
  assert.ok(b1.equals(Buffer.from(await r2.arrayBuffer())));
  assert.equal(ogStats.generated, before + 1);
  const files = ogFiles(e);
  assert.equal(files.length, 1);
  assert.match(files[0]!, new RegExp(`^${id}-v${BANNER_VERSION}-[0-9a-f]{12}\.jpg$`));
  const file = join(e.dir, "og", files[0]!);
  const mtime = statSync(file).mtimeMs;
  const again = Buffer.from(await (await e.app.request(`/og/battle/${id}.jpg`)).arrayBuffer());
  assert.ok(again.equals(b1));
  assert.equal(ogStats.generated, before + 1, "not drawn again");
  assert.equal(statSync(file).mtimeMs, mtime);
});

test("/og/battle: hostile and long army names still give a valid image", async () => {
  const e = env("path");
  const a = army(e, "evil", "Evil", 0);
  const b = army(e, "long", "Long", 5);
  e.db.prepare("UPDATE armies SET name = ? WHERE id = ?").run(`<script>"&'\u0001]]>`, a);
  e.db.prepare("UPDATE armies SET name = ? WHERE id = ?").run("WWWWWWWWWWWWWWWWWWWW", b);
  const id = battle(e, a, b);
  const res = await e.app.request(`/og/battle/${id}.jpg`);
  assert.equal(res.status, 200);
  assert.deepEqual(jpegSize(Buffer.from(await res.arrayBuffer())), { w: 1200, h: 630 });
});

test("bannerSvg: names are escaped, uppercased, shrunk then ellipsized to fit", () => {
  const banner: Banner = {
    kind: "COMBAT",
    left: { name: `<script>"&'`, faction: 3, troopers: 12 },
    right: { name: "ip-mat", faction: 2, troopers: 12 },
    bg: "../../etc/passwd",
    footer: "23/11/2026 · Combat #1",
    site: "minitroopers.example",
  };
  const svg = bannerSvg(banner);
  assert.ok(!svg.includes("<script"));
  assert.ok(svg.includes("&lt;SCRIPT&gt;&quot;&amp;&#39;"));
  assert.ok(svg.includes(">IP-MAT<"));
  assert.ok(svg.includes("#96B732") && svg.includes("#FFDB7F"), "faction colours");
  assert.equal(xmlText("a\u0000b<"), "ab&lt;");
  const short = fitText("CARDIO", 430, 94, 52);
  assert.deepEqual(short, { text: "CARDIO", size: 94 });
  const mid = fitText("SUPERTROOPERS", 430, 94, 52);
  assert.ok(mid.size < 94 && mid.size >= 52 && mid.text === "SUPERTROOPERS", JSON.stringify(mid));
  const long = fitText("W".repeat(20), 430, 94, 52);
  assert.equal(long.size, 52);
  assert.ok(long.text.endsWith("…") && long.text.length < 20);
});

test("/og/battle: a deleted defender shows as unknown (like the page), and its old banner is replaced, not served", async () => {
  const e = env("path");
  const foe = army(e, "foe", "Secret Name", 4);
  const id = battle(e, army(e, "warp", "Warp", 1), foe);
  assert.equal((await e.app.request(`/og/battle/${id}.jpg`)).status, 200);
  const first = ogFiles(e);
  assert.equal(first.length, 1);
  const before = ogStats.generated;
  assert.equal(deleteArmy(e.db, foe), true);
  const b = battleById(e.db, id)!;
  assert.equal(b.defenderRef, "gone:Secret Name");
  assert.equal(battleBanner(e.cfg, e.db, b).right.name, "Inconnue");
  assert.ok(!bannerSvg(battleBanner(e.cfg, e.db, b)).includes("SECRET"));
  assert.equal((await e.app.request(`/og/battle/${id}.jpg`)).status, 200);
  assert.equal(ogStats.generated, before + 1, "drawn again");
  const now = ogFiles(e);
  assert.equal(now.length, 1, "the old file is removed");
  assert.notEqual(now[0], first[0]);
});

test("purgeBattleImages: removes the files (and temporary files) of the given battles only", () => {
  const dir = mkdtempSync(join(tmpdir(), "mt-og-"));
  try {
    for (const f of ["5-v4-aaaaaaaaaaaa.jpg", "5-v3-bbbbbbbbbbbb.jpg.9.tmp", "50-v4-cccccccccccc.jpg", "6-v4-dddddddddddd.jpg"]) writeFileSync(join(dir, f), "x");
    assert.equal(purgeBattleImages(dir, [5, 6], join(dir, "6-v4-dddddddddddd.jpg")), 2);
    assert.deepEqual(readdirSync(dir).sort(), ["50-v4-cccccccccccc.jpg", "6-v4-dddddddddddd.jpg"]);
    assert.equal(purgeBattleImages(join(dir, "missing"), [5]), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("/og/battle: beyond the waiting line, 503 with Retry-After (nothing drawn for it)", async () => {
  const e = env("path");
  const a = army(e, "warp", "Warp", 1);
  const ids = [0, 1, 2].map(() => battle(e, a, army(e, `foe${Math.random().toString(36).slice(2, 8)}`, "Foe", 4)));
  const saved = { ...ogLimits };
  ogLimits.parallel = 1;
  ogLimits.queue = 1;
  try {
    const p1 = e.app.request(`/og/battle/${ids[0]}.jpg`); // drawing
    const p2 = e.app.request(`/og/battle/${ids[1]}.jpg`); // waiting
    await new Promise((r) => setImmediate(r));
    const busy = await e.app.request(`/og/battle/${ids[2]}.jpg`);
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get("retry-after"), "30");
    assert.equal(busy.headers.get("x-content-type-options"), "nosniff");
    assert.equal((await p1).status, 200);
    assert.equal((await p2).status, 200); // the slot was handed over
    assert.equal((await e.app.request(`/og/battle/${ids[2]}.jpg`)).status, 200);
  } finally {
    Object.assign(ogLimits, saved);
  }
});

test("bannerJpeg: a render past its timeout is rejected, the rasteriser restarts for the next one", async () => {
  const b: Banner = { kind: "COMBAT", left: { name: "a", faction: 0, troopers: 1 }, right: { name: "b", faction: 1, troopers: 1 }, bg: "bg/garden.jpg", footer: "x", site: "y" };
  await assert.rejects(bannerJpeg(b, { timeoutMs: 1 }), /timeout/);
  const ok = await bannerJpeg(b);
  assert.deepEqual(jpegSize(ok), { w: 1200, h: 630 });
});

test("/og/battle: a failed drawing answers 500 for a while without drawing again; an unwritable cache still serves the image", async () => {
  const e = env("path");
  const id = battle(e, army(e, "warp", "Warp", 1), army(e, "foe", "Foe", 4));
  // the cache directory is a file: writing fails, the drawn image is served anyway, no .tmp left
  writeFileSync(join(e.dir, "og"), "not a directory");
  const res = await e.app.request(`/og/battle/${id}.jpg`);
  assert.equal(res.status, 200);
  assert.deepEqual(jpegSize(Buffer.from(await res.arrayBuffer())), { w: 1200, h: 630 });
  rmSync(join(e.dir, "og"));
  // a battle whose input cannot be drawn: 500, then 500 again without a new attempt
  e.db.prepare("UPDATE battles SET input = ? WHERE id = ?").run(JSON.stringify({ attackerSide: 0, background: { gfx: "bg/garden.jpg", id: 0 }, armies: null }), id);
  const before = ogStats.generated;
  const f1 = await e.app.request(`/og/battle/${id}.jpg`);
  assert.equal(f1.status, 500);
  assert.equal(f1.headers.get("retry-after"), "60");
  assert.equal((await e.app.request(`/og/battle/${id}.jpg`)).status, 500);
  assert.equal(ogStats.generated, before);
});

test("fitText: the ellipsis keeps the longest prefix that fits", () => {
  const t = fitText("ABCDEFGHIJKLMNOPQRST", 430, 94, 52);
  assert.ok(t.text.endsWith("…"));
  const n = [...t.text].length - 1;
  assert.ok((textWidth100(t.text) * 52) / 100 <= 430);
  const longer = "ABCDEFGHIJKLMNOPQRST".slice(0, n + 1) + "…";
  assert.ok((textWidth100(longer) * 52) / 100 > 430, "one more character would not fit");
});
