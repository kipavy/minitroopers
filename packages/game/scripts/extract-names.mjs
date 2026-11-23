// Extracts the generator-made trooper names from the archived original pages.
// Usage: node packages/game/scripts/extract-names.mjs <dir-or-html>... [--out data/names-corpus.json]
// Reads every `flashvars : '...data=...'` payload (Haxe-serialized), keeps the trooper objects that are
// generator-made: offer previews (ClientMode#2) and faction rosters (`pref: null`). Player-chosen names
// (armies in b_opp/b_view...) are excluded. Then derives base/suffix/decoration tables (see decompose()).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DICT = { "\x032\x1A4": "name", "V\x1bE|": "pref", "\fA2c": "seed" };

function unserialize(s) {
  let p = 0;
  const strs = [];
  const num = () => { const st = p; if (s[p] === "-") p++; while (p < s.length && /[0-9]/.test(s[p])) p++; return parseInt(s.slice(st, p)); };
  function r() {
    const c = s[p++];
    switch (c) {
      case "n": return null; case "t": return true; case "f": return false; case "z": return 0;
      case "i": return num();
      case "d": { const st = p; while (p < s.length && /[0-9eE.+\-]/.test(s[p])) p++; return parseFloat(s.slice(st, p)); }
      case "y": { const l = num(); p++; const v = decodeURIComponent(s.substr(p, l)); p += l; strs.push(v); return v; }
      case "R": return strs[num()];
      case "o": { const o = {}; while (s[p] !== "g") { const k = r(); o[DICT[k] ?? JSON.stringify(k)] = r(); } p++; return o; }
      case "a": { const a = []; while (s[p] !== "h") { if (s[p] === "u") { p++; const n = num(); for (let i = 0; i < n; i++) a.push(null); } else a.push(r()); } p++; return a; }
      case "j": { const e = r(); p++; const idx = num(); p++; const n = num(); const args = []; for (let i = 0; i < n; i++) args.push(r()); return n ? { enum: e, idx, args } : e + "#" + idx; }
      case "w": { const e = r(); const c2 = r(); p++; const n = num(); const args = []; for (let i = 0; i < n; i++) args.push(r()); return { enum: e, ctor: c2, args }; }
      case "r": return "<ref>";
      default: throw new Error("bad tag " + c);
    }
  }
  return r();
}

function* htmlFiles(path) {
  if (statSync(path).isDirectory()) for (const e of readdirSync(path)) yield* htmlFiles(join(path, e));
  else if (path.endsWith(".html")) yield path;
}

function walk(v, generated, out) {
  if (Array.isArray(v)) { for (const x of v) walk(x, generated, out); return; }
  if (v === null || typeof v !== "object") return;
  if (typeof v.name === "string" && typeof v.seed === "number" && (generated || v.pref === null)) out.add(v.name);
  const gen = v.enum === "ClientMode" && v.idx === 2;
  for (const x of Object.values(v)) walk(x, gen || false, out);
}

// Decomposition: [decoration prefix] base suffix [decoration postfix]. Bases are the name stems observed in
// the corpus (recon §2.2 seeds the list; longest match wins); the remainder of the first word is the suffix.
const PREFIXES = ["Sgt.", "T-", "Don ", "Van ", "Sexy ", "Mc", "G.I."];
const POSTFIXES = [" Brown", " Jones", " Jr", " Kong", " Khan", "-X", " Lee", " Dick", " Yu", " Samu", " Craka", " Edo"];
const BASES = ["Kev", "Max", "Jon", "Smith", "Burt", "Harr", "Rog", "Jack", "Jaz", "Huff", "Georg", "Rick", "Mel", "Krak", "Kraw", "Jeff", "Luk", "Dav", "Bru", "Sam", "Russ", "Karl", "Hulk", "Gold", "Bomb", "Ed", "Lu", "Orl", "Edu", "Crak", "Liub", "Liu", "Kra", "Jo", "Anders"];

export function decompose(name) {
  let rest = name, pre = "", post = "";
  for (const p of PREFIXES) if (rest.startsWith(p)) { pre = p; rest = rest.slice(p.length); break; }
  for (const p of POSTFIXES) if (rest.endsWith(p)) { post = p; rest = rest.slice(0, -p.length); break; }
  if (rest.includes(" ")) return { pre, post, base: null, suffix: null, rest };
  let best = null;
  for (const b of BASES) if (rest.startsWith(b) && (best === null || b.length > best.length)) best = b;
  if (best === null) return { pre, post, base: null, suffix: null, rest };
  return { pre, post, base: best, suffix: rest.slice(best.length), rest };
}

const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const outPath = oi >= 0 ? args.splice(oi, 2)[1] : join(dirname(fileURLToPath(import.meta.url)), "../data/names-corpus.json");
const names = new Set();
for (const root of args) for (const f of htmlFiles(root)) {
  const html = readFileSync(f, "utf8");
  for (const m of html.matchAll(/flashvars : '([^']*)'/g)) {
    const d = new URLSearchParams(m[1]).get("data");
    if (!d) continue;
    try { walk(unserialize(d), false, names); } catch { /* not a trooper payload */ }
  }
}
const corpus = [...names].filter((n) => /^[A-Z][a-z.]/.test(n)).sort();
const bases = new Map(), suffixes = new Map(), pre = new Map(), post = new Map(), unparsed = [];
for (const n of corpus) {
  const d = decompose(n);
  if (d.pre) pre.set(d.pre, (pre.get(d.pre) ?? 0) + 1);
  if (d.post) post.set(d.post, (post.get(d.post) ?? 0) + 1);
  if (d.base === null) { unparsed.push(n); continue; }
  bases.set(d.base, (bases.get(d.base) ?? 0) + 1);
  if (d.suffix && /^[a-z]/.test(d.suffix)) suffixes.set(d.suffix, (suffixes.get(d.suffix) ?? 0) + 1);
}
const keys = (m) => [...m.keys()].sort();
writeFileSync(outPath, JSON.stringify({
  note: "UNVERIFIED: generator tables are derived from the names seen in archived offers/faction rosters; original tables unknown",
  names: corpus, bases: keys(bases), suffixes: keys(suffixes), prefixes: keys(pre), postfixes: keys(post), unparsed,
}, null, 1) + "\n");
console.log(`${corpus.length} names, ${bases.size} bases, ${suffixes.size} suffixes, ${unparsed.length} unparsed -> ${outPath}`);
