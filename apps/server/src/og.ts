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
export const BANNER_VERSION = 5;

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
  // Longest prefix + "…" that fits at `min` (binary search: few resvg measurements on the main thread).
  const chars = [...text];
  const cut = (n: number): string => (n > 0 ? chars.slice(0, n).join("").trimEnd() + "…" : "…");
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((textWidth100(cut(mid)) * min) / 100 <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return { text: cut(lo), size: min };
}

/** Outlined text: drop shadow, dark outline, fill (a gradient id or a colour). */
function outlined(text: string, x: number, y: number, size: number, fill: string, stroke: number, anchor = "middle", shadow = 0.6 * stroke): string {
  const t = xmlText(text);
  const common = `x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" text-anchor="${anchor}"`;
  return (
    `<text ${common} transform="translate(0 ${shadow.toFixed(1)})" fill="#1c0d03" fill-opacity="0.75" stroke="#1c0d03" stroke-opacity="0.75" stroke-width="${stroke}" stroke-linejoin="round">${t}</text>` +
    `<text ${common} fill="none" stroke="#1e0e04" stroke-width="${stroke}" stroke-linejoin="round">${t}</text>` +
    `<text ${common} fill="${fill}">${t}</text>`
  );
}

/** Small standing person (trooper count), centred on x, feet on y. */
function person(x: number, y: number): string {
  const body = `M${x} ${y - 17}L${x} ${y - 7}M${x - 8} ${y - 15}L${x} ${y - 12}L${x + 8} ${y - 15}M${x - 6} ${y}L${x} ${y - 7}L${x + 6} ${y}`;
  return (
    `<g stroke-linecap="round" stroke-linejoin="round"><path d="${body}" transform="translate(1 2)" fill="none" stroke="#1e0e04" stroke-opacity="0.6" stroke-width="6"/><circle cx="${x + 1}" cy="${y - 20}" r="5" fill="#1e0e04" fill-opacity="0.6"/>` +
    `<path d="${body}" fill="none" stroke="#fff" stroke-width="3.8"/><circle cx="${x}" cy="${y - 22}" r="3.8" fill="#fff"/></g>`
  );
}

/** Angle of the dark band and of the texts on it (degrees, rising to the right). */
const TILT = -2.5;

/**
 * The "VS" mark, drawn as vector shapes (chunky cartoon letters, blocky italic S) in banner coordinates, around
 * x 528..666, y 128..198.
 */
// V: measured on the reference (final position: already tilted with the band and leaning).
const VS_V = "M528 135L550 132L563 165L572 133L597 130L576 197.5L553 198.5Z";
// S: drawn upright around (633, 162), then leaned (skewX −13.5°) and tilted (−5°) like the reference's S.
const VS_S = ((): string => {
  const pts: [number, number][] = [
    [5, 0], [59, 0], [64, 5], [64, 25], [46, 25], [46, 18], [26, 18], [26, 27], [58, 26], [64, 32], [64, 61], [59, 66],
    [5, 66], [0, 61], [0, 43], [18, 43], [18, 50], [38, 50], [38, 40], [6, 40], [0, 34], [0, 5],
  ];
  const sk = Math.tan((13.5 * Math.PI) / 180);
  const r = (-5 * Math.PI) / 180;
  return (
    pts
      .map(([u, v], i) => {
        const x0 = u - 32 - (v - 33) * sk;
        const y0 = v - 33;
        const x = 633 + x0 * Math.cos(r) - y0 * Math.sin(r);
        const y = 162 + x0 * Math.sin(r) + y0 * Math.cos(r);
        return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join("") + "Z"
  );
})();

function vsMark(): string {
  const glyph = (d: string, id: string): string =>
    `<clipPath id="${id}"><path d="${d}"/></clipPath>` +
    `<path d="${d}" transform="translate(3 5)" fill="#120802" fill-opacity="0.55" stroke="#120802" stroke-opacity="0.55" stroke-width="13" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#2a1406" stroke-width="12" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="url(#vs)"/>` +
    `<g clip-path="url(#${id})"><path d="${d}" transform="translate(2.5 3.5)" fill="none" stroke="#fffbe0" stroke-opacity="0.7" stroke-width="4"/>` +
    `<path d="${d}" transform="translate(-2 -3)" fill="none" stroke="#b8410a" stroke-opacity="0.45" stroke-width="4"/></g>`;
  return glyph(VS_V, "vsv") + glyph(VS_S, "vss");
}

/** Lightning bolt from the top edge to the bottom edge, through the centre (x, y pairs). */
const BOLT: readonly (readonly [number, number])[] = [
  [652, -10], [626, 50], [648, 92], [606, 150], [628, 196], [578, 250], [608, 284], [560, 336],
  [600, 374], [552, 424], [588, 462], [548, 516], [574, 560], [544, 640],
];
const boltPath = (dx = 0): string => BOLT.map(([x, y], i) => `${i ? "L" : "M"}${x + dx} ${y}`).join("");
/** Thin forks of the bolt. */
const FORKS = "M578 250L548 292L556 300L522 338M600 374L632 410L624 418L652 466M552 424L526 456L532 464L506 498M608 284L640 300";

/** Origins of the light rays, along the bright part of the bolt. */
const RAY_ORIGINS: readonly (readonly [number, number])[] = [[584, 300], [572, 356], [592, 262]];
/** Polygon of the left half (left of the bolt). */
const LEFT_HALF = `M-10 -10${BOLT.map(([x, y]) => `L${x} ${y}`).join("")}L-10 640Z`;

/** Thin light rays from the centre of the bolt (angle in degrees, length, half width at the base). */
const RAYS: readonly (readonly [number, number, number])[] = [
  [208, 190, 9], [222, 230, 6], [196, 150, 6], [160, 170, 7], [146, 130, 5], [-24, 200, 8], [-40, 160, 6], [-14, 120, 5],
  [22, 170, 7], [38, 130, 5], [252, 140, 5], [286, 150, 6], [112, 120, 5], [72, 150, 6], [-62, 110, 4], [232, 120, 4],
];

/** Faction tint of the two halves: flat layer opacity and central glow opacity, per side. */
export interface Tint {
  left: number;
  right: number;
  glowL: number;
  glowR: number;
  /** mix-blend-mode of the flat layers (normal: plain alpha). */
  blend?: string;
  /** Extra black over the whole background (0 = none). */
  dark?: number;
  /** Warm grade of the whole background: opacity of an orange layer blended like the tints (0 = none). */
  warm?: number;
  warmColour?: string;
}
/**
 * Fitted to BetterTrooper's card on the same sewer background (colour picked on 10 terrain patches, mean colour and
 * texture contrast): overlay blending keeps the terrain's texture, a light orange grade warms both halves.
 */
export const TINT: Tint = { left: 0.3, right: 0.3, glowL: 0.2, glowR: 0.16, blend: "overlay", warm: 0.2, warmColour: "#d08030" };

export function bannerSvg(b: Banner, tint: Tint = TINT): string {
  logoUri ??= dataUri("logo.png", "image/png");
  const nameL = fitText(b.left.name.toUpperCase(), 430, 94, 52);
  const nameR = fitText(b.right.name.toUpperCase(), 430, 94, 52);
  const rays = RAYS.map(([a, len, w], i) => {
    const [cx, cy] = RAY_ORIGINS[i % RAY_ORIGINS.length]!;
    const r = (a * Math.PI) / 180;
    const ex = cx + Math.cos(r) * len;
    const ey = cy + Math.sin(r) * len;
    const px = -Math.sin(r) * w;
    const py = Math.cos(r) * w;
    return `<path d="M${(cx + px).toFixed(1)} ${(cy + py).toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}L${(cx - px).toFixed(1)} ${(cy - py).toFixed(1)}Z"/>`;
  }).join("");
  const count = (x: number, y: number, n: number): string => {
    const t = String(n);
    const w = (textWidth100(t) * 31) / 100;
    const left = x - (w + 32) / 2;
    return person(left + 10, y) + outlined(t, left + 28, y, 31, "#fff", 7, "start", 3);
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
<linearGradient id="vs" gradientUnits="userSpaceOnUse" x1="0" y1="129" x2="0" y2="198"><stop offset="0" stop-color="#ffe98a"/><stop offset="0.3" stop-color="#ffd23f"/><stop offset="0.62" stop-color="#ffa424"/><stop offset="1" stop-color="#ff7c0c"/></linearGradient>
<linearGradient id="kind" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#fff"/><stop offset="0.6" stop-color="#d9d9d9"/><stop offset="1" stop-color="#c4c4c4"/></linearGradient>
<linearGradient id="nl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.3" stop-color="#000" stop-opacity="0.1"/><stop offset="0.75" stop-color="#000" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient>
<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>
<radialGradient id="flash" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fffbe8" stop-opacity="0.9"/><stop offset="0.4" stop-color="#ffe9a8" stop-opacity="0.4"/><stop offset="1" stop-color="#fff3c0" stop-opacity="0"/></radialGradient>
<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.12" stop-color="#000" stop-opacity="0.5"/><stop offset="0.88" stop-color="#000" stop-opacity="0.5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<clipPath id="lh"><path d="${LEFT_HALF}"/></clipPath>
<filter id="glow" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>
<linearGradient id="boltFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset="0.2" stop-color="#fff" stop-opacity="0"/><stop offset="0.38" stop-color="#fff"/><stop offset="0.82" stop-color="#fff"/><stop offset="0.97" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="boltMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#boltFade)"/></mask>
<radialGradient id="warmL" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${colourOf(b.left.faction)}" stop-opacity="${tint.glowL}"/><stop offset="1" stop-color="${colourOf(b.left.faction)}" stop-opacity="0"/></radialGradient>
<radialGradient id="warmR" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${colourOf(b.right.faction)}" stop-opacity="${tint.glowR}"/><stop offset="1" stop-color="${colourOf(b.right.faction)}" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
</defs>
<image href="${bgUri(b.bg)}" x="0" y="-52" width="1200" height="734" preserveAspectRatio="xMidYMid slice"/>
<rect width="${W}" height="${H}" fill="#000" fill-opacity="${0.12 + (tint.dark ?? 0)}"/>
<rect width="${W}" height="${H}" fill="${tint.warmColour ?? "#ff9a2e"}" fill-opacity="${tint.warm ?? 0}" style="mix-blend-mode:${tint.blend ?? "normal"}"/>
<rect width="${W}" height="${H}" fill="${colourOf(b.right.faction)}" fill-opacity="${tint.right}" style="mix-blend-mode:${tint.blend ?? "normal"}"/>
<rect width="${W}" height="${H}" fill="#000" fill-opacity="0.05" clip-path="url(#lh)"/>
<g style="mix-blend-mode:${tint.blend ?? "normal"}"><rect width="${W}" height="${H}" fill="${colourOf(b.left.faction)}" fill-opacity="${tint.left}" clip-path="url(#lh)"/></g>
<rect width="${W}" height="${H}" fill="url(#top)"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<g transform="rotate(${TILT} 600 150)"><rect x="-60" y="56" width="1320" height="42" fill="#fff" fill-opacity="0.08"/><rect x="-60" y="98" width="1320" height="104" fill="#000" fill-opacity="0.5"/><rect x="-60" y="202" width="1320" height="5" fill="#000" fill-opacity="0.22"/></g>
<g clip-path="url(#lh)"><ellipse cx="470" cy="340" rx="300" ry="280" fill="url(#warmL)"/></g>
<ellipse cx="760" cy="340" rx="280" ry="260" fill="url(#warmR)"/>
<ellipse cx="582" cy="360" rx="210" ry="300" fill="url(#flash)"/>
<ellipse cx="584" cy="330" rx="70" ry="150" fill="url(#flash)"/>
<g fill="#fff" fill-opacity="0.8" filter="url(#soft)">${rays}</g>
<path d="${boltPath()}" fill="none" stroke="#2a1405" stroke-width="9" stroke-linejoin="miter" stroke-opacity="0.85"/>
<path d="${boltPath(3)}" fill="none" stroke="#e8962e" stroke-width="3" stroke-linejoin="miter"/>
<g mask="url(#boltMask)">
<path d="${boltPath()}" fill="none" stroke="#bfe0ff" stroke-width="34" stroke-linejoin="round" stroke-opacity="0.85" filter="url(#glow)"/>
<path d="${FORKS}" fill="none" stroke="#bfe0ff" stroke-width="7" stroke-linejoin="round" stroke-opacity="0.5" filter="url(#soft)"/>
<path d="${FORKS}" fill="none" stroke="#f2f9ff" stroke-width="2.4" stroke-linejoin="miter"/>
<path d="${boltPath()}" fill="none" stroke="#cfe8ff" stroke-width="11" stroke-linejoin="miter"/>
<path d="${boltPath()}" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="miter"/>
</g>
<image href="${logoUri}" x="503" y="4" width="194" height="75"/>
<g transform="rotate(${TILT * 0.8} 600 100)">${outlined(b.kind, 600, 108, 27, "url(#kind)", 7, "middle", 3)}</g>
<g transform="rotate(${TILT} 270 165)">${name(nameL, 270, 165, colourOf(b.left.faction))}${count(276, 248, b.left.troopers)}</g>
<g transform="rotate(${TILT} 931 134)">${name(nameR, 931, 134, colourOf(b.right.faction))}${count(937, 214, b.right.troopers)}</g>
${vsMark()}
${outlined(b.footer, 30, 612, 23, "#fff", 4, "start", 2)}
${outlined(b.site, 1170, 612, 23, "#fff", 4, "end", 2)}
</svg>`;
}

let worker: Worker | null = null;
let nextJob = 0;
const jobs = new Map<number, { resolve: (b: Buffer) => void; reject: (e: Error) => void }>();

/** A banner not rendered within this time is abandoned and the rasteriser restarted. */
export const RENDER_TIMEOUT_MS = 10_000;

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
    if (worker !== w) return; // an abandoned thread (timeout): its jobs are already rejected, the map is the new thread's
    worker = null;
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
export function bannerJpeg(b: Banner, o: { quality?: number; timeoutMs?: number } = {}): Promise<Buffer> {
  const job: Job = { id: nextJob++, svg: bannerSvg(b), opts: RESVG_OPTS, quality: o.quality ?? 86 };
  return new Promise((resolve, reject) => {
    const w = rasteriser();
    // Stuck render: every pending job fails and the thread is killed (its exit handler forgets it; the next job starts a new one).
    const timer = setTimeout(() => {
      const e = new Error("og render timeout");
      for (const j of jobs.values()) j.reject(e);
      jobs.clear();
      if (worker === w) worker = null;
      void w.terminate();
    }, o.timeoutMs ?? RENDER_TIMEOUT_MS);
    timer.unref();
    jobs.set(job.id, {
      resolve: (buf) => (clearTimeout(timer), resolve(buf)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    w.ref();
    w.postMessage(job);
  });
}
