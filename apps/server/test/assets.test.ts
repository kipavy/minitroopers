// No missing asset: every image of the stylesheet exists under public/ (or is listed below with the selector that
// would show it, a selector our pages never emit), every static file a rendered page points to exists, and the
// favicon (shown by /history and the HQ, requested by every browser) is served.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { armyByHost } from "../src/repo.ts";
import { create, setup, type Client, type Env, type Mode } from "./helpers.ts";

const PUBLIC = resolve(import.meta.dirname, "../public");
const CSS = readFileSync(join(PUBLIC, "css/style.css"), "utf8");

/**
 * Images of style.css not in public/ (RECON4 §7): the rule that shows each one is never in effect on our pages.
 * `classes`: class names whose absence from every rendered page this test checks.
 */
const UNUSED_CSS_IMAGES: Record<string, { selector: string; classes: string[] }> = {
  // always overridden by the inline background-image of BG() (views/hq.ts); not archived (data.minitroopers.fr/.com/.es)
  "/img/art_1.jpg": { selector: ".box2 .box2bg", classes: [] },
  // not archived; no `a.sbutton` in our pages
  "/img/buttons/button.png": { selector: "a.sbutton", classes: ["sbutton"] },
  // "upcup" header of a later event, not reproduced
  "/img/upcup/bg.jpg": { selector: ".headSpecial", classes: ["headSpecial"] },
  // "Plus de jeux" banner, not reproduced
  "/img/loc/moreg_fr.png": { selector: "h1.moreg_fr", classes: ["moreg", "moreg_fr"] },
  "/img/loc/moreg_es.png": { selector: "h1.moreg_es", classes: ["moreg", "moreg_es"] },
  "/img/loc/moreg_de.png": { selector: "h1.moreg_de", classes: ["moreg", "moreg_de"] },
  "/img/loc/moreg_en.png": { selector: "h1.moreg_en", classes: ["moreg", "moreg_en"] },
};
const UNUSED_CLASSES = [...new Set(Object.values(UNUSED_CSS_IMAGES).flatMap((u) => u.classes))];

const STATIC_EXT = new Set([".css", ".js", ".png", ".jpg", ".gif", ".ico", ".swf", ".wasm", ".json"]);

test("every url() of style.css is under public/ or listed in UNUSED_CSS_IMAGES with a selector of style.css", () => {
  const urls = [...new Set([...CSS.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]!))];
  assert.ok(urls.length > 100, "the stylesheet's images");
  const missing = urls.filter((u) => !existsSync(join(PUBLIC, u)));
  assert.deepEqual(missing.sort(), Object.keys(UNUSED_CSS_IMAGES).sort());
  for (const [u, { selector }] of Object.entries(UNUSED_CSS_IMAGES)) {
    const rule = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*url\\("${u.replace(/[.]/g, "\\.")}"\\)`);
    assert.match(CSS, rule, `${u} is drawn by ${selector}`);
  }
  // no web font: Open Sans Condensed only served the Braziball banner (not reproduced)
  assert.ok(!/@font-face|Open Sans|Forum/.test(CSS));
});

test("GET /favicon.ico: the archived icon, image/x-icon", async () => {
  const env = setup("path");
  const res = await env.app.request("/favicon.ico");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/x-icon");
  const body = Buffer.from(await res.arrayBuffer());
  // https://web.archive.org/web/20111218041829id_/http://minitroopers.fr/favicon.ico, SHA-1 base32 EOBKFFWDRFZRNY74FHID5IV4SJST5UPJ
  const { createHash } = await import("node:crypto");
  assert.equal(createHash("sha1").update(body).digest("hex"), "2382a296c3897316e3fc29d03ea2bc92653ed1e9");
  assert.deepEqual([...body.subarray(0, 4)], [0, 0, 1, 0], "ICO header");
});

/** Static files a page points to: src/href/url() starting with one "/" whose path has a static extension. */
function staticRefs(page: string): string[] {
  const refs = new Set<string>();
  for (const m of page.matchAll(/(?:src|href)=(?:"|'|&#39;|\\&#39;)(\/[^"'&\\\s]*)/g)) refs.add(m[1]!);
  for (const m of page.matchAll(/url\((?:"|'|&#39;)?(\/[^"')&]+)/g)) refs.add(m[1]!);
  return [...refs].filter((r) => !r.startsWith("//")).map((r) => r.split("?")[0]!).filter((p) => STATIC_EXT.has(extname(p)));
}
const classesOf = (page: string): Set<string> => new Set([...page.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/)));

const MODES: Mode[] = ["path", "subdomain"];
const get = (env: Env, cl: Client, host: string, path: string): Promise<Response> => {
  const at = env.at(host, path);
  return cl.req(at.url, { host: at.host });
};
const pathOf = (host: string, href: string): string => href.replace(new RegExp(`^http://${host}\\.lvh\\.me:8080`), "").replace(new RegExp(`^/a/${host}`), "");

/** First daily battle of the opponents page, through the real routes. */
async function fight(env: Env, cl: Client, host: string): Promise<void> {
  const opp = await (await get(env, cl, host, "/b/opp")).text();
  const m = /href="([^"]*\/b\/battle\?opp=[^"]+)"/.exec(opp);
  assert.ok(m, `${host}: an opponent to fight`);
  assert.equal((await get(env, cl, host, pathOf(host, m[1]!.replaceAll("&amp;", "&")))).status, 302);
}

for (const mode of MODES) {
  test(`[${mode}] the stage-4 pages emit no class of UNUSED_CSS_IMAGES and point only to files of public/`, async () => {
    const env = setup(mode);
    env.clock.t = Date.parse("2026-11-23T21:00:00Z");
    // Boss: 5 troopers, one recruit (Warp), a battle suffered (Warp attacks it by name), one battle fought
    const boss = env.client("1.1.1.1");
    assert.equal((await create(env, boss, "Boss", { part: "0" })).status, 302);
    const bossId = armyByHost(env.db, "boss")!.id;
    const ins = env.db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices) VALUES (?, ?, ?, ?, '[0]')");
    for (let s = 1; s < 5; s++) ins.run(bossId, s, 1000 + s, `N${s}`);
    const warp = env.client("2.2.2.2");
    assert.equal((await create(env, warp, "Warp", { part: "0", recruit: "boss" })).status, 302);
    const at = env.at("warp", "/b/battle");
    assert.equal((await warp.req(at.url, { host: at.host, form: { chk: warp.key!, n: "0", friend: "Boss" } })).status, 303);
    // Warp (1 trooper, no recruit, missions locked) ends its day with 4 more battles: /endDay is shown
    for (let n = 0; n < 4; n++) await fight(env, warp, "warp");
    await fight(env, boss, "boss");

    const pages: [Client, string, string][] = [
      [env.client("3.3.3.3"), "", "/"], // a visitor: the creation page
      ...["/hq", "/t/0", "/add", "/b/opp", "/history", "/ranks", "/choice", "/protect", "/b/view/bat1"].map((p): [Client, string, string] => [boss, "boss", p]),
      [warp, "warp", "/endDay"],
    ];
    for (const [cl, host, path] of pages) {
      const res = host ? await get(env, cl, host, path) : await cl.req(path, { host: mode === "path" ? "localhost" : "lvh.me:8080" });
      assert.equal(res.status, 200, `${host}${path}`);
      const page = await res.text();
      const cls = classesOf(page);
      for (const c of UNUSED_CLASSES) assert.ok(!cls.has(c), `${host}${path}: class ${c}`);
      const refs = staticRefs(page);
      assert.ok(refs.includes("/css/style.css") && refs.includes("/js/jquery.min.js"), `${host}${path}: refs found`);
      for (const ref of refs) assert.ok(existsSync(join(PUBLIC, decodeURIComponent(ref))), `${host}${path}: ${ref} missing under public/`);
      // .box2bg (style.css: art_1.jpg, absent) always carries its own background image
      for (const m of page.matchAll(/class="box2bg"([^>]*)>/g)) assert.match(m[1]!, /style="background-image : url\('\/img\/mode\/\w+\.jpg'\)"/, `${host}${path}: box2bg`);
    }
  });
}

/** Pixels (premultiplied ARGB, 4 bytes each) of the DefineBitsLossless2 tags of a CWS SWF, by character id. */
function swfBitmaps(swf: Buffer): Map<number, { width: number; height: number; argb: Buffer }> {
  assert.equal(swf.toString("latin1", 0, 3), "CWS");
  const body = inflateSync(swf.subarray(8));
  let o = Math.ceil((5 + 4 * (body[0]! >> 3)) / 8) + 4;
  const out = new Map<number, { width: number; height: number; argb: Buffer }>();
  while (o < body.length) {
    const head = body.readUInt16LE(o);
    let len = head & 63;
    o += 2;
    if (len === 63) {
      len = body.readUInt32LE(o);
      o += 4;
    }
    const d = body.subarray(o, o + len);
    if (head >> 6 === 36 && d[2] === 5) out.set(d.readUInt16LE(0), { width: d.readUInt16LE(3), height: d.readUInt16LE(5), argb: inflateSync(d.subarray(7)) });
    o += len;
    if (head >> 6 === 0) break;
  }
  return out;
}

// The original makes the opaque white of bitmaps 17 (status icons of the trooper cards) and 19 (arrows) transparent at
// startup with BitmapData.threshold(); the pinned Ruffle (a111ceec) stores that colour unpremultiplied and draws it
// white (fixed upstream by 1d2b894), so client_fr_play.swf ships them already transparent
// (tools/oracle/instrument/patch-play-bitmaps.mjs).
test("client_fr_play.swf: bitmaps 17 and 19 have no opaque-white pixel; the served copy is assets/swf's", () => {
  const swf = readFileSync(join(PUBLIC, "swf/client_fr_play.swf"));
  assert.ok(swf.equals(readFileSync(resolve(import.meta.dirname, "../../../assets/swf/client_fr_play.swf"))));
  const bitmaps = swfBitmaps(swf);
  for (const [id, size] of [[17, 160], [19, 64]] as const) {
    const b = bitmaps.get(id);
    assert.ok(b, `bitmap ${id}`);
    assert.deepEqual([b.width, b.height], [size, size]);
    let white = 0;
    let clear = 0;
    for (let i = 0; i < b.argb.length; i += 4) {
      const p = b.argb.readUInt32BE(i);
      if (p === 0xffffffff) white++;
      if (p === 0) clear++;
    }
    assert.equal(white, 0, `bitmap ${id}: opaque-white pixels`);
    assert.equal(b.argb.readUInt32BE(0), 0, `bitmap ${id}: corner pixel transparent`);
    assert.ok(clear > b.width * b.height / 2, `bitmap ${id}: background transparent`);
  }
});

/**
 * Operands h of `getlocal 5; pushbyte h; initproperty <height>; getlocal 5; pushtrue; initproperty <embedFonts>` in the
 * uncompressed body of a CWS SWF: the `tf.height = 14` of the client's TextField factory (§l\x0b\x01§).
 */
function factoryHeights(swf: Buffer): number[] {
  const body = inflateSync(swf.subarray(8));
  const out: number[] = [];
  for (let i = 0; i + 12 < body.length; i++) {
    if (body[i] !== 0x62 || body[i + 1] !== 5 || body[i + 2] !== 0x24 || body[i + 4] !== 0x68) continue;
    let j = i + 5;
    while (body[j]! & 0x80) j++;
    j++;
    if (body[j] === 0x62 && body[j + 1] === 5 && body[j + 2] === 0x26 && body[j + 3] === 0x68) out.push(body[i + 3]!);
  }
  return out;
}

// Ruffle masks a text field's first line to the field's height (Flash let it overflow): the 14 px fields of the factory
// cut the bottom of the 16 px battle counters (bottom left) and of "PAUSE". client_fr_play.swf makes them 20 px high
// (tools/oracle/instrument/patch-play-textfields.mjs); the served URL carries a new ?v= so browsers reload it.
test("client_fr_play.swf: the TextField factory's height is 20 (14 in client_fr.swf), the embed URL is ?v=9", async () => {
  const play = readFileSync(join(PUBLIC, "swf/client_fr_play.swf"));
  assert.ok(play.equals(readFileSync(resolve(import.meta.dirname, "../../../assets/swf/client_fr_play.swf"))));
  assert.deepEqual(factoryHeights(play), [20]);
  assert.deepEqual(factoryHeights(readFileSync(resolve(import.meta.dirname, "../../../assets/swf/client_fr.swf"))), [14]);
  const { CLIENT_SWF } = await import("../src/views/swf.ts");
  assert.equal(CLIENT_SWF, "/swf/client_fr_play.swf?v=9");
});

test("GET /img/mtp/*.svg: the battle player's SVG textures and icons, image/svg+xml (CSS masks need the type)", async () => {
  const env = setup("path");
  const res = await env.app.request("/img/mtp/chevrons-1.svg");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/svg+xml");
  assert.match(await res.text(), /^<svg /);
});
