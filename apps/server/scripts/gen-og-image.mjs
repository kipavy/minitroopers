// Generates the fixed link-preview image of the battle pages (og:image, 1200x630 JPEG) from images of public/img only:
// the garden battle background, the header logo and a big "VS" in the game's orange/yellow with a dark outline.
//   node apps/server/scripts/gen-og-image.mjs [<output jpg>]
// Needs the Playwright Chromium (PLAYWRIGHT_BROWSERS_PATH if it is not in the default location). The "VS" uses the
// system's bold sans-serif fonts, so another OS may give a slightly different image.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const IMG = join(here, "../public/img");
const OUT = process.argv[2] ?? join(IMG, "og-battle.jpg");
const W = 1200;
const H = 630;

const data = (file, type) => `data:${type};base64,${readFileSync(join(IMG, file)).toString("base64")}`;

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #2b1a08; }
.bg { position: absolute; inset: 0; background: url("${data("bg/garden.jpg", "image/jpeg")}") center / cover no-repeat; }
.shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 35%, rgba(30,15,0,.55) 100%); }
.logo { position: absolute; left: 50%; top: 26px; width: 592px; height: 228px; transform: translateX(-50%);
  filter: drop-shadow(0 6px 6px rgba(0,0,0,.45)); }
.vs { position: absolute; left: 0; right: 0; top: 230px; text-align: center;
  font: italic 900 330px/1 Impact, "Arial Black", "Segoe UI Black", sans-serif; letter-spacing: 6px;
  transform: skewX(-6deg); }
.vs span { position: relative; display: inline-block; }
.vs .outline { position: absolute; left: 0; top: 0; color: transparent; -webkit-text-stroke: 34px #3a1d05;
  text-shadow: 0 14px 0 #3a1d05, 0 22px 18px rgba(0,0,0,.55); }
.vs .fill { position: relative; background: linear-gradient(#fff3a6 0%, #ffd23f 38%, #f7931e 72%, #d4561a 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
</style></head><body>
<div class="bg"></div><div class="shade"></div>
<img class="logo" src="${data("logo.png", "image/png")}" alt="">
<div class="vs"><span><span class="outline">VS</span><span class="fill">VS</span></span></div>
</body></html>`;

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await tab.setContent(page, { waitUntil: "load" });
  await tab.screenshot({ path: OUT, type: "jpeg", quality: 85, clip: { x: 0, y: 0, width: W, height: H } });
} finally {
  await browser.close();
}
console.log(`wrote ${OUT}`);
