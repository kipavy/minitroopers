import type { DatabaseSync } from "node:sqlite";
import { FACTIONS } from "@mt/game";
import { armyByHost, insertArmy } from "../repo.ts";

/**
 * Stores the faction armies (`is_faction` = 1) that are not in the database yet; idempotent. Each trooper is the one
 * `factionBattleArmy` builds (level L = L-1 choices of 0, no pref, slot = its id), so a stored faction fights exactly
 * like the never-stored `faction:<host>` defender. No password, credits 0.
 * Returns the hosts created and the hosts that were already there.
 */
export function seedFactions(db: DatabaseSync, now: number): { created: string[]; existing: string[] } {
  const created: string[] = [];
  const existing: string[] = [];
  for (const f of FACTIONS) {
    if (armyByHost(db, f.host)) {
      existing.push(f.host);
      continue;
    }
    f.troopers.forEach((t, i) => {
      if (t.id !== i) throw new Error(`faction ${f.host}: trooper ids must be 0..n in order`);
    });
    const army = insertArmy(db, {
      host: f.host,
      name: f.name,
      part: f.part,
      faction: f.id,
      credits: 0,
      isFaction: true,
      passwordHash: null,
      now,
      troopers: f.troopers.map((t) => ({ seed: t.seed, name: t.name, choices: new Array<number>(t.level - 1).fill(0), leftOver: null })),
    });
    (army ? created : existing).push(f.host);
  }
  return { created, existing };
}
