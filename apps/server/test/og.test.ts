import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBattleInput } from "../src/battleInput.ts";
import { battleTroopers } from "../src/deploy.ts";
import { bannerSvg, BANNER_VERSION, fitText, xmlText, type Banner } from "../src/og.ts";
import { createArmy } from "../src/repo.ts";
import { ogStats } from "../src/routes/og.ts";
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
    assert.equal((await e.app.request(path)).status, 404, path);
  }
  assert.equal(existsSync(join(e.dir, "og")), false, "nothing drawn");
});

test("/og/battle: drawn once into DATA_DIR/og/<id>-v<version>.jpg, then served from that file", async () => {
  const e = env("path");
  const id = battle(e, army(e, "warp", "Warp", 1, 3), army(e, "foe", "Foe", 4, 2));
  const before = ogStats.generated;
  // concurrent first requests share one drawing
  const [r1, r2] = await Promise.all([e.app.request(`/og/battle/${id}.jpg`), e.app.request(`/og/battle/${id}.jpg`)]);
  const b1 = Buffer.from(await r1.arrayBuffer());
  assert.ok(b1.equals(Buffer.from(await r2.arrayBuffer())));
  assert.equal(ogStats.generated, before + 1);
  const file = join(e.dir, "og", `${id}-v${BANNER_VERSION}.jpg`);
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
