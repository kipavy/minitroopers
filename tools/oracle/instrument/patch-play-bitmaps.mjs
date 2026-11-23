// Pre-applies, in client_fr_play.swf, the BitmapData.threshold() that client_fr.swf runs on two of its bitmaps at
// startup, so that the icons are transparent under our pinned Ruffle.
//
// The original turns the opaque white of two bitmaps into transparency once, at startup
// (decompiled class §$9Y\x01§, method §(\x07\x184§):
//   bmp.threshold(bmp, bmp.rect, new Point(0, 0), "==", -1, 0x00FFFFFF)   // mask 0xFFFFFFFF by default
// on DefineBitsLossless2 id 17 (160x160 sheet of 16x16 status icons: the left column of the trooper cards)
// and id 19 (64x64, arrows). Ruffle nightly 2025.7.28 (a111ceec, pinned: same core as the oracle) writes the new
// colour without premultiplying it: 0x00FFFFFF is stored as alpha 0 with RGB 255, which premultiplied blending draws
// as WHITE. Fixed upstream by ruffle-rs/ruffle 1d2b894 (2025-11-06), after our pin.
//
// The patch sets those same pixels (ARGB exactly 0xFFFFFFFF) to 0x00000000, which is what Flash Player stores after
// the threshold, so the runtime call then matches nothing. Only the zlib data of these two tags changes; every other
// tag is copied byte for byte and no code is touched. Idempotent: on an already patched SWF it gives the same file.
//
// Usage: node tools/oracle/instrument/patch-play-bitmaps.mjs <in.swf> <out.swf>
// (in: the chk-bypassed build of build-play.ps1, or an already patched client_fr_play.swf). No dependency.
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const BITMAPS = [17, 19];
const DEFINE_BITS_LOSSLESS2 = 36;
const FORMAT_ARGB = 5;

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node patch-play-bitmaps.mjs <in.swf> <out.swf>");
  process.exit(2);
}
const file = readFileSync(input);
if (file.toString("latin1", 0, 3) !== "CWS") throw new Error(`${input}: not a zlib-compressed SWF (CWS)`);
const body = inflateSync(file.subarray(8));
if (body.length !== file.readUInt32LE(4) - 8) throw new Error(`${input}: header length mismatch`);

// body starts with the RECT frame size (5-bit field count), then frame rate and count (4 bytes)
let o = Math.ceil((5 + 4 * (body[0] >> 3)) / 8) + 4;
const parts = [body.subarray(0, o)];
const done = new Map();
for (;;) {
  const head = body.readUInt16LE(o);
  const code = head >> 6;
  let len = head & 63;
  let hl = 2;
  if (len === 63) {
    len = body.readUInt32LE(o + 2);
    hl = 6;
  }
  let tag = body.subarray(o, o + hl + len);
  const data = body.subarray(o + hl, o + hl + len);
  if (code === DEFINE_BITS_LOSSLESS2 && BITMAPS.includes(data.readUInt16LE(0))) {
    const id = data.readUInt16LE(0);
    if (data[2] !== FORMAT_ARGB) throw new Error(`bitmap ${id}: format ${data[2]}, expected ARGB`);
    const px = Buffer.from(inflateSync(data.subarray(7)));
    if (px.length !== data.readUInt16LE(3) * data.readUInt16LE(5) * 4) throw new Error(`bitmap ${id}: size mismatch`);
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px.readUInt32BE(i) === 0xffffffff) {
        px.writeUInt32BE(0, i);
        n++;
      }
    }
    const nd = Buffer.concat([data.subarray(0, 7), deflateSync(px, { level: 9 })]);
    const nh = Buffer.alloc(6);
    nh.writeUInt16LE((DEFINE_BITS_LOSSLESS2 << 6) | 63);
    nh.writeUInt32LE(nd.length, 2);
    tag = Buffer.concat([nh, nd]);
    done.set(id, n);
  }
  parts.push(tag);
  o += hl + len;
  if (code === 0) break;
}
if (o !== body.length) throw new Error(`${input}: ${body.length - o} bytes after the End tag`);
for (const id of BITMAPS) if (!done.has(id)) throw new Error(`bitmap ${id} not found`);

const nb = Buffer.concat(parts);
const header = Buffer.from(file.subarray(0, 8));
header.writeUInt32LE(nb.length + 8, 4);
writeFileSync(output, Buffer.concat([header, deflateSync(nb, { level: 9 })]));
for (const [id, n] of done) console.log(`bitmap ${id}: ${n} opaque-white pixels made transparent`);
