import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { resolveDataDir, type Config } from "./config.ts";

/** Directory of the cached banners. */
export const ogDir = (cfg: Config): string => join(resolveDataDir(cfg.dataDir), "og");

/** Deletes the cached banners of these battles (and their leftover temporary files), e.g. after an army is deleted. */
export function purgeBattleImages(dir: string, ids: Iterable<number>, keep?: string): number {
  const set = new Set([...ids].map(String));
  if (set.size === 0) return 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0; // no cache yet
  }
  let n = 0;
  for (const f of names) {
    const id = /^([0-9]+)-/.exec(f)?.[1];
    if (id === undefined || !set.has(id) || join(dir, f) === keep) continue;
    try {
      unlinkSync(join(dir, f));
      n++;
    } catch {
      // already gone
    }
  }
  return n;
}
