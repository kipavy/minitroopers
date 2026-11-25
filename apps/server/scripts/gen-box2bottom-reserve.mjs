// box2bottom.png made taller as ONE image for the reserve row of a recharge weekend (spec 2026-11-25-recharge-week-end-design.md §4):
// no second frame on top, nothing stretched. The inner camouflage band (rows 0..29) gets
// `extra` more rows inserted after row R: rows R-1..R-k mirrored then R-k..R forward, so every junction is continuous
// (each inserted row touches an identical or adjacent original row).
// Usage: node apps/server/scripts/gen-box2bottom-reserve.mjs  (writes public/img/box2bottom-reserve.png, 32 rows taller)
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePng } from "../test/png.ts";

const extra = 32;
const out = new URL("../public/img/box2bottom-reserve.png", import.meta.url);
const src = decodePng(readFileSync(new URL("../public/img/box2bottom.png", import.meta.url)));
const R = 26;
const k = Math.floor(extra / 2);
const inserted = [];
for (let i = 1; i <= k; i++) inserted.push(R - i); // mirrored back
for (let i = R - k + (extra % 2 === 0 ? 1 : 0); i <= R; i++) inserted.push(i); // forward again
if (inserted.length !== extra) throw new Error(`rows ${inserted.length} != ${extra}`);
const order = [...Array.from({ length: R + 1 }, (_, i) => i), ...inserted, ...Array.from({ length: src.height - R - 1 }, (_, i) => R + 1 + i)];
const W = src.width;
const H = order.length;
const raw = Buffer.alloc(H * (W * 4 + 1));
order.forEach((y, row) => {
  raw[row * (W * 4 + 1)] = 0;
  Buffer.from(src.rgba.buffer, src.rgba.byteOffset + y * W * 4, W * 4).copy(raw, row * (W * 4 + 1) + 1);
});
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log(`box2bottom-reserve.png: ${W}x${H}`);
