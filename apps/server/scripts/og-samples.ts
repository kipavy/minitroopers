// Writes sample banners (dev aid): node apps/server/scripts/og-samples.ts <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { bannerJpeg, type Banner } from "../src/og.ts";

const out = process.argv[2] ?? "var/og-samples";
mkdirSync(out, { recursive: true });
const samples: Record<string, Banner> = {
  "1-killian-vs-ip-mat": { kind: "COMBAT", left: { name: "killian", faction: 3, troopers: 12 }, right: { name: "ip-mat", faction: 2, troopers: 12 }, bg: "bg/garden.jpg", footer: "23/11/2026 · Combat #1287", site: "minitroopers.kipavy.fr" },
  "2-long-names": { kind: "COMBAT", left: { name: "Les Supercalifragilis", faction: 0, troopers: 37 }, right: { name: "WWWWWWWWWWWWWWWWWWWW", faction: 5, troopers: 3 }, bg: "bg/garden.jpg", footer: "01/12/2026 · Combat #99999", site: "minitroopers.kipavy.fr" },
  "3-sewer": { kind: "COMBAT", left: { name: "Cardio", faction: 2, troopers: 8 }, right: { name: "Lukita", faction: 3, troopers: 9 }, bg: "bg/sewer.jpg", footer: "22/11/2026 · Combat #17718813", site: "minitroopers.kipavy.fr" },
};
for (const [name, b] of Object.entries(samples)) {
  const t = performance.now();
  const jpg = await bannerJpeg(b);
  console.log(name, jpg.length, "bytes", Math.round(performance.now() - t), "ms");
  writeFileSync(join(out, `${name}.jpg`), jpg);
}
const ref = process.argv[3];
if (ref) {
  const { readFileSync } = await import("node:fs");
  const uri = (p: string) => `data:image/jpeg;base64,${readFileSync(p).toString("base64")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2410" height="630"><rect width="2410" height="630" fill="#fff"/><image href="${uri(ref)}" width="1200" height="630"/><image href="${uri(join(out, "3-sewer.jpg"))}" x="1210" width="1200" height="630"/></svg>`;
  writeFileSync(join(out, "compare.png"), new Resvg(svg).render().asPng());
}
