// Provenance of the UNVERIFIED faction 3 ("Torses velus") roster in data/factions.json (original page never archived).
// Usage: node scripts/gen-faction3.ts
import { Rand } from "@mt/engine";
import { trooperName } from "../src/names.ts";
import { fnv1a } from "../src/hash.ts";

const SEED_MIN = 273018;
const SEED_MAX = 16491340;
const used = new Set<string>();
const out = [];
for (let i = 0; i < 6; i++) {
  const seed = SEED_MIN + (fnv1a(`faction|3|torses-velus|${i}`) % (SEED_MAX - SEED_MIN + 1));
  const rand = new Rand(seed);
  let name = trooperName(rand);
  while (used.has(name)) name = trooperName(rand);
  used.add(name);
  out.push({ id: i, name, seed, level: 20 - 2 * i });
}
console.log(JSON.stringify(out));
