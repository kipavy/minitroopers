// Indicative benchmark (no threshold): `node packages/engine/bench/bench.ts [count]`.
// Simulates `count` (default 1000) battles of the `large` tag (20-32 troopers per side) using the
// inputs of the golden files: tools/oracle/golden/large first, then tools/oracle/golden-full/large
// if present; the list is cycled when shorter than `count`. Files are read only, tools/ is never imported.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { simulateBattle } from "../src/index.ts";
import type { BattleInput } from "../src/index.ts";

const root = join(import.meta.dirname, "../../../tools/oracle");
const count = Number(process.argv[2] ?? 1000);
const inputs: BattleInput[] = [];
for (const base of ["golden", "golden-full"]) {
  const dir = join(root, base, "large");
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json.gz")).sort()) {
    inputs.push((JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString("utf8")) as { input: BattleInput }).input);
  }
}
if (inputs.length === 0) throw new Error("no large golden found");

simulateBattle(inputs[0]!); // warm-up (JIT)
let events = 0;
const t0 = performance.now();
for (let i = 0; i < count; i++) events += simulateBattle(inputs[i % inputs.length]!).events.length;
const ms = performance.now() - t0;
console.log(
  `${count} large battles (${inputs.length} distinct inputs): ${(ms / 1000).toFixed(2)} s total, ` +
    `${(ms / count).toFixed(2)} ms/battle, ${(events / count).toFixed(0)} events/battle`,
);
