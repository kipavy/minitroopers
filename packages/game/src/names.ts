import type { Rand } from "@mt/engine";
import corpus from "../data/names-corpus.json" with { type: "json" };

// UNVERIFIED: the original generator tables are unknown (server-side). Tables are derived from the names
// seen in archived offers/faction rosters (data/names-corpus.json, built by scripts/extract-names.mjs):
// name = [prefix] base + suffix [postfix].
const bases: string[] = corpus.bases;
const suffixes: string[] = corpus.suffixes;
const prefixes: string[] = corpus.prefixes;
const postfixes: string[] = corpus.postfixes;

export const MAX_NAME_LENGTH = 12; // longest observed generated name

const pick = (rand: Rand, a: string[]): string => a[rand.random(a.length)]!;

/** Generates a trooper name in the style of the originals ("Kevie", "T-Joneves", "Rogeter Samu"), <= 12 chars. */
export function trooperName(rand: Rand): string {
  for (let i = 0; i < 20; i++) {
    const pre = rand.random(6) === 0 ? pick(rand, prefixes) : "";
    const post = rand.random(5) === 0 ? pick(rand, postfixes) : "";
    const n = pre + pick(rand, bases) + pick(rand, suffixes) + post;
    if (n.length <= MAX_NAME_LENGTH) return n;
  }
  return (pick(rand, bases) + pick(rand, suffixes)).slice(0, MAX_NAME_LENGTH);
}
