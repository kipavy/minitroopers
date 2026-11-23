// Extracts the FR skill/weapon tooltips found in the archived original pages (22 of them), as a reference for
// gen-tips.mjs, which builds data/tips.fr.json from the SWF (tips.test.ts checks both agree).
//   node apps/server/scripts/extract-tips.mjs [<html/fr dir> [<output json>]]   (no output: JSON on stdout)
// Sources (same pages, same words): `mt.js.Tip.show(this,'...')` list items carrying a sprite offset of
// /img/skills.png (home, add, t_0, ...) and the `box8` skill boxes of the level-up page (h2 + div.s).
// The sprite is a 20-column grid of 30px cells whose index is the skill id (verified on 19/20 tips).
// Output: { "<skillId>": { title, body } } where body is the inner HTML of the tooltip's `<div class="s">`,
// with the name of the example trooper (the <i>..</i> in descriptions) replaced by the `{name}` placeholder.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "../../../docs/research/recon/assets/extra/site-elements/html/fr");
const OUT = process.argv[3];
const COLS = 20;
const CELL = 30;

const idOf = (x, y) => (y / CELL) * COLS + x / CELL;
const unescapeHtml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const nameless = (body) => body.replace(/<i>[^<]*<\/i>/g, "<i>{name}</i>");

const tips = new Map();
const add = (id, title, body, file) => {
  if (!title || body === undefined) return;
  const prev = tips.get(id);
  if (prev && (prev.title !== title || prev.body !== body)) console.warn(`conflict skill ${id}: ${prev.file} vs ${file}`);
  if (!prev) tips.set(id, { title, body, file });
};

const tipRe = /<li[^>]*onmouseover="mt\.js\.Tip\.show\(this,'((?:[^'\\]|\\.)*)'\)"[^>]*style="background : url\('\/img\/skills\.png'\) -(\d+)px -(\d+)px"/g;
const levelRe = /<div class="levelskill" style="background : url\('\/img\/skills\.png'\) -(\d+)px -(\d+)px"><\/div>\s*<h2>([^<]*)<\/h2>\s*<div class="s">([\s\S]*?)<\/div><\/div>/g;

for (const f of readdirSync(DIR).filter((n) => n.endsWith(".html")).sort()) {
  const t = readFileSync(join(DIR, f), "utf8");
  for (const m of t.matchAll(tipRe)) {
    const inner = unescapeHtml(m[1]).replace(/\\'/g, "'");
    const mm = /<h1>(.*?)<\/h1><div class="s">([\s\S]*?)<\/div><\/div><\/div><\/div>$/.exec(inner);
    if (mm) add(idOf(+m[2], +m[3]), mm[1], nameless(mm[2]), f);
  }
  for (const m of t.matchAll(levelRe)) add(idOf(+m[1], +m[2]), m[3], nameless(m[4].replace(/\s*\n\s*/g, " ")), f);
}

const out = {};
for (const id of [...tips.keys()].sort((a, b) => a - b)) out[id] = { title: tips.get(id).title, body: tips.get(id).body };
const json = JSON.stringify(out, null, 1) + "\n";
if (OUT) {
  writeFileSync(OUT, json);
  console.log(`${tips.size} tips -> ${OUT}`);
} else process.stdout.write(json);
