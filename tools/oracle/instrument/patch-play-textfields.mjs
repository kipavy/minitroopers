// Makes the text fields of client_fr_play.swf's TextField factory 20 px high instead of 14, so that the pinned Ruffle
// draws their first line whole, as Flash Player did.
//
// client_fr.swf builds most of its TextFields with one factory (decompiled class §l\x0b\x01§, static method
// §\x13#\fB\x01§(color = 0xFFFFFF, size = 8, align = -1, font = "nokia")): `tf.height = 14; tf.embedFonts = true; ...`.
// Some callers use fonts larger than that: the counters at the bottom left of the battle (troopers in reserve, deploy
// space; "motorola" 16 px, class §f\x03\x02§) and "PAUSE" ("upheaval" 20 px). Their first baseline sits at
// gutter 2 + ascent (motorola: 19220/20480 x 16 = 15 px) = 17 px, below the 14 px field. Flash Player always shows the
// first line of a field even when it overflows; Ruffle (a111ceec, and master as of 2026-11) masks the text to the
// field's full height (edit_text.rs render_self), cutting the bottom of the digits ("08" read as a "ΠR").
//
// The patch changes the operand of that one `pushbyte 14` (P-code: `getlocal 5; pushbyte 14; initproperty height;
// getlocal 5; pushtrue; initproperty embedFonts`) to 20: one byte of the DoABC tag, same length, nothing else moves.
// Fields that set their own height afterwards are unaffected; the others are single-line, without border or
// background, so the extra 6 px below the text draw nothing.
//
// Refuses to write unless the pattern occurs exactly once (14, or 20 on an already patched SWF: idempotent, same file).
// Usage: node tools/oracle/instrument/patch-play-textfields.mjs <in.swf> <out.swf>. No dependency.
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const OLD_HEIGHT = 14;
const NEW_HEIGHT = 20;
const DO_ABC = [72, 82]; // DoABC, DoABC2

/** Offsets, in the uncompressed SWF body, of the factory's `pushbyte <h>` operand, for h = 14 or 20. */
function heightOperands(body) {
  const hits = [];
  let o = Math.ceil((5 + 4 * (body[0] >> 3)) / 8) + 4;
  while (o < body.length) {
    const head = body.readUInt16LE(o);
    const code = head >> 6;
    let len = head & 63;
    let hl = 2;
    if (len === 63) {
      len = body.readUInt32LE(o + 2);
      hl = 6;
    }
    if (DO_ABC.includes(code)) {
      for (let i = o + hl; i < o + hl + len - 12; i++) {
        // getlocal 5; pushbyte h; initproperty <u30>; getlocal 5; pushtrue; initproperty
        if (body[i] !== 0x62 || body[i + 1] !== 5 || body[i + 2] !== 0x24 || body[i + 4] !== 0x68) continue;
        if (body[i + 3] !== OLD_HEIGHT && body[i + 3] !== NEW_HEIGHT) continue;
        let j = i + 5;
        while (body[j] & 0x80) j++;
        j++;
        if (body[j] === 0x62 && body[j + 1] === 5 && body[j + 2] === 0x26 && body[j + 3] === 0x68) hits.push(i + 3);
      }
    }
    o += hl + len;
    if (code === 0) break;
  }
  return hits;
}

/** Uncompressed body of a CWS file. */
function swfBody(file) {
  if (file.toString("latin1", 0, 3) !== "CWS") throw new Error("not a zlib-compressed SWF (CWS)");
  const body = Buffer.from(inflateSync(file.subarray(8)));
  if (body.length !== file.readUInt32LE(4) - 8) throw new Error("header length mismatch");
  return body;
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node patch-play-textfields.mjs <in.swf> <out.swf>");
  process.exit(2);
}
const file = readFileSync(input);
const body = swfBody(file);
const hits = heightOperands(body);
if (hits.length !== 1) throw new Error(`${input}: ${hits.length} matches of the TextField factory's height, expected exactly 1`);
const was = body[hits[0]];
body[hits[0]] = NEW_HEIGHT;
writeFileSync(output, Buffer.concat([file.subarray(0, 8), deflateSync(body, { level: 9 })]));
console.log(`TextField factory height: ${was} -> ${NEW_HEIGHT} (body offset ${hits[0]})`);
