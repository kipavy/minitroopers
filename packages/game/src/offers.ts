import { Rand } from "@mt/engine";
import { trooperName } from "./names.ts";
import { fnv1a } from "./hash.ts";

export type OfferTrooper = { seed: number; name: string; colour: number };

const SEED_MIN = 273018; // observed range of original player trooper seeds (recon §2.1)
const SEED_MAX = 16491340;
const SLOTS = 5;

/**
 * The 5 daily offers of a client. UNVERIFIED: the original derivation is server-side and unknown; known inputs
 * are day, computer (clientId) and recruit link (recruiter). Seed = FNV-1a(day|clientId|recruiter|salt|slot)
 * mapped into the observed seed range; colour 3..5 as observed on the home page (cosmetic).
 */
export function dailyOffers(p: { day: string; clientId: string; recruiter: string | null; salt: string }): OfferTrooper[] {
  const used = new Set<number>();
  const names = new Set<string>();
  const out: OfferTrooper[] = [];
  const span = SEED_MAX - SEED_MIN + 1;
  for (let slot = 0; slot < SLOTS; slot++) {
    const h = fnv1a(`${p.day}|${p.clientId}|${p.recruiter ?? ""}|${p.salt}|${slot}`);
    let seed = SEED_MIN + (h % span);
    while (used.has(seed)) seed = SEED_MIN + ((seed - SEED_MIN + 1) % span);
    used.add(seed);
    const rand = new Rand(seed);
    let name = trooperName(rand);
    while (names.has(name)) name = trooperName(rand); // deterministic re-draw: names distinct within a day
    names.add(name);
    out.push({ seed, name, colour: 3 + rand.random(3) });
  }
  return out;
}
