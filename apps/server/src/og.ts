import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { Resvg } from "@resvg/resvg-js";
import type { Job } from "./ogWorker.ts";

/**
 * Link preview banner of a battle (1200x630 JPEG): the battle's background split by a lightning bolt, the logo, the kind
 * line, both army names in their faction colour around a "VS", their trooper counts, date and id at the bottom left and
 * the site host at the bottom right. Drawn as an SVG and rasterised by resvg with the bundled Lilita One font
 * (fonts/OFL.txt). The band y 330..560 is left free for trooper cards.
 */
export interface BannerSide {
  /** Army name as stored (without "L'armée de"). */
  name: string;
  /** Faction index 0..5. */
  faction: number;
  troopers: number;
}

export interface Banner {
  /** Line under the logo, e.g. "COMBAT". */
  kind: string;
  left: BannerSide;
  right: BannerSide;
  /** Background image below public/img, e.g. "bg/garden.jpg" (the stored input's `background.gfx`). */
  bg: string;
  /** Bottom left, e.g. "23/11/2026 · Combat #42". */
  footer: string;
  /** Bottom right, e.g. "minitroopers.example". */
  site: string;
}

/** Bumped on any design change: cached files are named after it. */
export const BANNER_VERSION = 1;

export const W = 1200;
export const H = 630;

const FONT_FILE = fileURLToPath(new URL("../fonts/LilitaOne-Regular.ttf", import.meta.url));
const FONT = "Lilita One";
const IMG_DIR = new URL("../public/img/", import.meta.url);
const RESVG_OPTS = { font: { fontFiles: [FONT_FILE], loadSystemFonts: false, defaultFontFamily: FONT } };

/** Faction colours of public/css/style.css (.faction0 … .faction5). */
export const FACTION_COLOURS = ["#E87D5F", "#FFAA27", "#FFDB7F", "#96B732", "#9EADEF", "#A55DC6"] as const;
const colourOf = (f: number): string => FACTION_COLOURS[f] ?? "#FFDB7F";

const dataUri = (rel: string, type: string): string => `data:${type};base64,${readFileSync(new URL(rel, IMG_DIR)).toString("base64")}`;
let logoUri: string | undefined;
const bgUris = new Map<string, string>();
function bgUri(gfx: string): string {
  const rel = /^bg\/[a-z]{1,20}\.jpg$/.test(gfx) ? gfx : "bg/garden.jpg";
  let u = bgUris.get(rel);
  if (u === undefined) {
    try {
      u = dataUri(rel, "image/jpeg");
    } catch {
      u = rel === "bg/garden.jpg" ? "" : bgUri("bg/garden.jpg");
    }
    bgUris.set(rel, u);
  }
  return u;
}

/** Text content for SVG/XML: escaped, control characters (invalid in XML) dropped. */
export function xmlText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const widthCache = new Map<string, number>();
/** Advance width of `text` in the bundled font at size 100 (resvg layout, so kerning and fallbacks count). */
export function textWidth100(text: string): number {
  let w = widthCache.get(text);
  if (w === undefined) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><text x="0" y="150" font-family="${FONT}" font-size="100">${xmlText(text)}</text></svg>`;
    w = new Resvg(svg, RESVG_OPTS).getBBox()?.width ?? 0;
    if (widthCache.size > 500) widthCache.clear();
    widthCache.set(text, w);
  }
  return w;
}

/** Font size (and text, ellipsized when needed) so that `text` fits `maxW` px: `size` at most, shrunk down to `min`. */
export function fitText(text: string, maxW: number, size: number, min: number): { text: string; size: number } {
  const w = textWidth100(text);
  if ((w * size) / 100 <= maxW) return { text, size };
  if ((w * min) / 100 <= maxW) return { text, size: Math.floor((maxW * 100) / w) };
  const chars = [...text];
  for (let n = chars.length - 1; n > 0; n--) {
    const t = chars.slice(0, n).join("").trimEnd() + "…";
    if ((textWidth100(t) * min) / 100 <= maxW) return { text: t, size: min };
  }
  return { text: "…", size: min };
}

/** Outlined text: drop shadow, dark outline, fill (a gradient id or a colour). */
function outlined(text: string, x: number, y: number, size: number, fill: string, stroke: number, anchor = "middle", shadow = 0.6 * stroke): string {
  const t = xmlText(text);
  const common = `x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" text-anchor="${anchor}"`;
  return (
    `<text ${common} transform="translate(0 ${shadow.toFixed(1)})" fill="#1c0d03" fill-opacity="0.75" stroke="#1c0d03" stroke-opacity="0.75" stroke-width="${stroke}" stroke-linejoin="round">${t}</text>` +
    `<text ${common} fill="none" stroke="#2b1506" stroke-width="${stroke}" stroke-linejoin="round">${t}</text>` +
    `<text ${common} fill="${fill}">${t}</text>`
  );
}

/** Small standing person (trooper count), centred on x, feet on y. */
function person(x: number, y: number): string {
  const body = `M${x} ${y - 17}L${x} ${y - 7}M${x - 8} ${y - 15}L${x} ${y - 12}L${x + 8} ${y - 15}M${x - 6} ${y}L${x} ${y - 7}L${x + 6} ${y}`;
  return (
    `<g stroke-linecap="round" stroke-linejoin="round"><path d="${body}" fill="none" stroke="#2b1506" stroke-width="8"/><circle cx="${x}" cy="${y - 22}" r="6" fill="#2b1506"/>` +
    `<path d="${body}" fill="none" stroke="#fff" stroke-width="3.6"/><circle cx="${x}" cy="${y - 22}" r="3.6" fill="#fff"/></g>`
  );
}

/** Lightning bolt from the top edge to the bottom edge, through the centre (x, y pairs). */
const BOLT: readonly (readonly [number, number])[] = [
  [652, -10], [628, 52], [646, 92], [612, 150], [630, 196], [592, 246], [612, 286], [572, 330],
  [600, 372], [566, 420], [588, 462], [556, 512], [574, 560], [548, 640],
];
const boltPath = (dx = 0): string => BOLT.map(([x, y], i) => `${i ? "L" : "M"}${x + dx} ${y}`).join("");
/** Polygon of the left half (left of the bolt). */
const LEFT_HALF = `M-10 -10${BOLT.map(([x, y]) => `L${x} ${y}`).join("")}L-10 640Z`;

/** Thin light rays from the centre of the bolt (angle in degrees, length, half width at the base). */
const RAYS: readonly (readonly [number, number, number])[] = [
  [208, 190, 9], [222, 230, 6], [196, 150, 6], [160, 170, 7], [146, 130, 5], [-24, 200, 8], [-40, 160, 6], [-14, 120, 5],
  [22, 170, 7], [38, 130, 5], [252, 140, 5], [286, 150, 6], [112, 120, 5], [72, 150, 6], [-62, 110, 4], [232, 120, 4],
];

export function bannerSvg(b: Banner): string {
  logoUri ??= dataUri("logo.png", "image/png");
  const nameL = fitText(b.left.name.toUpperCase(), 430, 94, 52);
  const nameR = fitText(b.right.name.toUpperCase(), 430, 94, 52);
  const cx = 588;
  const cy = 318;
  const rays = RAYS.map(([a, len, w]) => {
    const r = (a * Math.PI) / 180;
    const ex = cx + Math.cos(r) * len;
    const ey = cy + Math.sin(r) * len;
    const px = -Math.sin(r) * w;
    const py = Math.cos(r) * w;
    return `<path d="M${(cx + px).toFixed(1)} ${(cy + py).toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}L${(cx - px).toFixed(1)} ${(cy - py).toFixed(1)}Z"/>`;
  }).join("");
  const count = (x: number, y: number, n: number): string => {
    const t = String(n);
    const w = (textWidth100(t) * 34) / 100;
    const left = x - (w + 34) / 2;
    return person(left + 11, y) + outlined(t, left + 30, y, 34, "#fff", 7, "start", 3);
  };
  // Names: centred on (268, 166) and (932, 132) (middle of the capitals), the right one higher like the band.
  const name = (n: { text: string; size: number }, x: number, y: number, fill: string): string => {
    const base = y + n.size * 0.345;
    return (
      outlined(n.text, x, base, n.size, fill, 12) +
      `<text x="${x}" y="${base}" font-family="${FONT}" font-size="${n.size}" text-anchor="middle" fill="url(#nl)">${xmlText(n.text)}</text>`
    );
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="vs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset="0.35" stop-color="#ffd23a"/><stop offset="0.7" stop-color="#ff9a17"/><stop offset="1" stop-color="#ff7a00"/></linearGradient>
<linearGradient id="nl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.3" stop-color="#000" stop-opacity="0.1"/><stop offset="0.75" stop-color="#000" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient>
<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>
<radialGradient id="flash" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fffbe8" stop-opacity="0.85"/><stop offset="0.35" stop-color="#fff3c0" stop-opacity="0.35"/><stop offset="1" stop-color="#fff3c0" stop-opacity="0"/></radialGradient>
<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.12" stop-color="#000" stop-opacity="0.5"/><stop offset="0.88" stop-color="#000" stop-opacity="0.5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<clipPath id="lh"><path d="${LEFT_HALF}"/></clipPath>
<filter id="glow" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>
<linearGradient id="boltFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0.2" stop-color="#fff" stop-opacity="0"/><stop offset="0.38" stop-color="#fff"/><stop offset="0.82" stop-color="#fff"/><stop offset="0.97" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="boltMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#boltFade)"/></mask>
<radialGradient id="warmL" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${colourOf(b.left.faction)}" stop-opacity="0.6"/><stop offset="1" stop-color="${colourOf(b.left.faction)}" stop-opacity="0"/></radialGradient>
<radialGradient id="warmR" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${colourOf(b.right.faction)}" stop-opacity="0.45"/><stop offset="1" stop-color="${colourOf(b.right.faction)}" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
</defs>
<image href="${bgUri(b.bg)}" x="0" y="-52" width="1200" height="734" preserveAspectRatio="xMidYMid slice"/>
<rect width="${W}" height="${H}" fill="#000" fill-opacity="0.18"/>
<rect width="${W}" height="${H}" fill="${colourOf(b.right.faction)}" fill-opacity="0.28"/>
<g clip-path="url(#lh)"><rect width="${W}" height="${H}" fill="#000" fill-opacity="0.05"/><rect width="${W}" height="${H}" fill="${colourOf(b.left.faction)}" fill-opacity="0.26"/></g>
<rect width="${W}" height="${H}" fill="url(#top)"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<g transform="rotate(-2.8 600 160)"><rect x="-60" y="58" width="1320" height="44" fill="#fff" fill-opacity="0.07"/><rect x="-60" y="102" width="1320" height="112" fill="#000" fill-opacity="0.42"/><rect x="-60" y="214" width="1320" height="6" fill="#000" fill-opacity="0.2"/></g>
<g clip-path="url(#lh)"><ellipse cx="470" cy="340" rx="300" ry="280" fill="url(#warmL)"/></g>
<ellipse cx="760" cy="340" rx="280" ry="260" fill="url(#warmR)"/>
<ellipse cx="${cx}" cy="${cy + 30}" rx="200" ry="300" fill="url(#flash)"/>
<g fill="#fff" fill-opacity="0.85" filter="url(#soft)">${rays}</g>
<path d="${boltPath()}" fill="none" stroke="#2a1405" stroke-width="9" stroke-linejoin="miter" stroke-opacity="0.85"/>
<path d="${boltPath(3)}" fill="none" stroke="#e8962e" stroke-width="3" stroke-linejoin="miter"/>
<g mask="url(#boltMask)">
<path d="${boltPath()}" fill="none" stroke="#9fd2ff" stroke-width="30" stroke-linejoin="round" filter="url(#glow)"/>
<path d="${boltPath()}" fill="none" stroke="#cfe8ff" stroke-width="11" stroke-linejoin="miter"/>
<path d="${boltPath()}" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="miter"/>
</g>
<image href="${logoUri}" x="503" y="4" width="194" height="75"/>
${outlined(b.kind, 600, 106, 27, "#fff", 6, "middle", 3)}
${name(nameL, 268, 166, colourOf(b.left.faction))}
${name(nameR, 932, 132, colourOf(b.right.faction))}
${count(275, 249, b.left.troopers)}
${count(938, 214, b.right.troopers)}
<g transform="translate(597 199) skewX(-9) scale(1.18 1)">${outlined("VS", 0, 0, 104, "url(#vs)", 12)}</g>
${outlined(b.footer, 30, 612, 23, "#fff", 4, "start", 2)}
${outlined(b.site, 1170, 612, 23, "#fff", 4, "end", 2)}
</svg>`;
}

let worker: Worker | null = null;
let nextJob = 0;
const jobs = new Map<number, { resolve: (b: Buffer) => void; reject: (e: Error) => void }>();

/** The rasteriser thread (ogWorker.ts), started on first use; it keeps the process alive only while a job runs. */
function rasteriser(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./ogWorker.ts", import.meta.url));
  w.on("message", (m: { id: number; data?: Uint8Array; error?: string }) => {
    const j = jobs.get(m.id);
    jobs.delete(m.id);
    if (jobs.size === 0) w.unref();
    if (m.data) j?.resolve(Buffer.from(m.data.buffer, m.data.byteOffset, m.data.byteLength));
    else j?.reject(new Error(m.error ?? "og worker"));
  });
  const fail = (e: Error): void => {
    if (worker === w) worker = null;
    for (const j of jobs.values()) j.reject(e);
    jobs.clear();
  };
  w.on("error", fail);
  w.on("exit", (code) => fail(new Error(`og worker exited (${code})`)));
  worker = w;
  return w;
}

/**
 * The banner as a JPEG. The SVG is built here (a few ms: name widths are measured with resvg); rasterising (~200 ms)
 * and the JPEG encoding (~80 ms) run on a worker thread, so the server keeps answering meanwhile.
 */
export function bannerJpeg(b: Banner, quality = 86): Promise<Buffer> {
  const job: Job = { id: nextJob++, svg: bannerSvg(b), opts: RESVG_OPTS, quality };
  return new Promise((resolve, reject) => {
    jobs.set(job.id, { resolve, reject });
    const w = rasteriser();
    w.ref();
    w.postMessage(job);
  });
}
