// Reads the static data tables (`Data.SKILL`, `Data.WEAPONS`, …) out of client_fr.swf.
//
// The SWF does not hold them as code: `Data`'s static init (decompiled `§Z(Hf\x02§`, line ~170)
// calls `§EFJ\x04\x01§.§*{\x121\x02§(<resource md5>, <field names>, <enum classes>)` (mt.data loader,
// `§`\x0b\x01§.§5E[\x1d§.§EFJ\x04\x01§`), which:
//   1. loads the haxe resource `_res._<md5>` (a DefineBinaryData tag bound by SymbolClass),
//   2. de-obfuscates it (`§\x1b^\x07\x05§`: 5-byte key → 256-entry permutation of 0..127, XOR,
//      a zero result keeps the original byte; bytes 5..8 = adler-like checksum, checked here too),
//   3. haxe-unserializes it into ONE flat array, enums resolved by `"$<n>"` → <enum classes>[n],
//   4. cuts the flat array into records of `fields.length` values, in field-list order.
// This module reproduces 1–4 (enum values become their constructor index; enums with
// parameters do not occur). No SWF-specific code is executed.
import { inflateSync } from "node:zlib";

/** @param {Buffer} swf */
export const readResources = (swf) => {
  const sig = swf.toString("latin1", 0, 3);
  let body = swf.subarray(8);
  if (sig === "CWS") body = inflateSync(body);
  else if (sig !== "FWS") throw new Error(`unsupported SWF signature ${sig}`);
  const nbits = body[0] >> 3;
  let p = Math.ceil((5 + nbits * 4) / 8) + 4;
  const bins = new Map();
  const syms = new Map();
  while (p < body.length) {
    const hdr = body.readUInt16LE(p);
    p += 2;
    const code = hdr >> 6;
    let len = hdr & 0x3f;
    if (len === 0x3f) {
      len = body.readUInt32LE(p);
      p += 4;
    }
    const d = body.subarray(p, p + len);
    p += len;
    if (code === 87) bins.set(d.readUInt16LE(0), d.subarray(6)); // DefineBinaryData
    if (code === 76) {
      // SymbolClass
      const n = d.readUInt16LE(0);
      let q = 2;
      for (let i = 0; i < n; i++) {
        const id = d.readUInt16LE(q);
        q += 2;
        let e = q;
        while (d[e]) e++;
        syms.set(d.toString("latin1", q, e), id);
        q = e + 1;
      }
    }
    if (code === 0) break;
  }
  /** @type {Map<string, Buffer>} */
  const out = new Map();
  for (const [name, id] of syms) {
    if (name.startsWith("_res._")) out.set(name.slice(6), bins.get(id));
  }
  return out;
};

const B64 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

/** `§\x1b^\x07\x05§`. @param {Buffer} b */
export const deobfuscate = (b) => {
  const key = b.subarray(0, 5).toString("utf8");
  const check = b.subarray(5, 9).toString("utf8");
  const s = [];
  for (let i = 0; i < 256; i++) s[i] = i & 0x7f;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) & 0x7f;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
  }
  let a = s[0];
  let c = s[1];
  const d = Buffer.from(b.subarray(9));
  for (let i = 0; i < d.length; i++) {
    let v = d[i];
    const x = v ^ s[i & 0xff];
    d[i] = x === 0 ? v : x;
    if (x === 0) v = 0;
    a = (a + v) % 65521;
    c = (c + a) % 65521;
  }
  const h = a ^ (c << 8);
  const want = [h & 0x3f, (h >> 6) & 0x3f, (h >> 12) & 0x3f, (h >> 18) & 0x3f].map((k) => B64[k]).join("");
  if (want !== check) throw new Error("Corrupted data");
  return d.toString("utf8");
};

/** Minimal haxe Unserializer (the tokens the data tables use). */
export const unserialize = (str) => {
  let pos = 0;
  const scache = [];
  const cache = [];
  const readInt = () => {
    const m = /^-?\d+/.exec(str.slice(pos));
    if (!m) throw new Error(`int expected at ${pos}`);
    pos += m[0].length;
    return Number(m[0]);
  };
  const expect = (ch) => {
    if (str[pos] !== ch) throw new Error(`'${ch}' expected at ${pos}`);
    pos++;
  };
  const read = () => {
    const t = str[pos++];
    switch (t) {
      case "n":
        return null;
      case "t":
        return true;
      case "f":
        return false;
      case "z":
        return 0;
      case "i":
        return readInt();
      case "d": {
        const m = /^[-+0-9.eE]+/.exec(str.slice(pos));
        pos += m[0].length;
        return parseFloat(m[0]);
      }
      case "k":
        return NaN;
      case "m":
        return -Infinity;
      case "p":
        return Infinity;
      case "y": {
        const len = readInt();
        expect(":");
        const s = decodeURIComponent(str.slice(pos, pos + len));
        pos += len;
        scache.push(s);
        return s;
      }
      case "R":
        return scache[readInt()];
      case "r":
        return cache[readInt()];
      case "a": {
        const a = [];
        cache.push(a);
        for (;;) {
          const c = str[pos];
          if (c === "h") {
            pos++;
            return a;
          }
          if (c === "u") {
            pos++;
            const n = readInt();
            for (let i = 0; i < n; i++) a.push(null);
          } else a.push(read());
        }
      }
      case "o": {
        const o = {};
        cache.push(o);
        while (str[pos] !== "g") {
          const k = read();
          o[k] = read();
        }
        pos++;
        return o;
      }
      case "j": {
        const name = read();
        expect(":");
        const index = readInt();
        expect(":");
        const n = readInt();
        const args = [];
        for (let i = 0; i < n; i++) args.push(read());
        const e = n === 0 ? index : { enumRef: name, index, args };
        if (n !== 0) throw new Error(`enum with parameters (${name}:${index})`);
        if (!/^\$\d+$/.test(name)) throw new Error(`unexpected enum name ${name}`);
        cache.push(e);
        return e;
      }
      default:
        throw new Error(`unsupported token '${t}' at ${pos - 1}`);
    }
  };
  const v = read();
  if (pos !== str.length) throw new Error(`trailing data at ${pos}`);
  return v;
};

/** Decode one resource into records of `fields.length` values. */
export const readTable = (resources, md5, fields) => {
  const raw = resources.get(md5);
  if (!raw) throw new Error(`resource _res._${md5} not found`);
  const flat = unserialize(deobfuscate(raw));
  if (!Array.isArray(flat) || flat.length % fields.length !== 0) {
    throw new Error(`${md5}: ${flat.length} values, not a multiple of ${fields.length}`);
  }
  const rows = [];
  for (let i = 0; i < flat.length; ) {
    const r = {};
    for (const f of fields) r[f] = flat[i++];
    rows.push(r);
  }
  return rows;
};
