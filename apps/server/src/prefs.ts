import { Data, type TrooperPref, type TrooperSheet } from "@mt/engine";

/**
 * Trooper level from which each AI preference can be configured (wiki, docs/research/original-game.md "Prefs by level").
 * UNVERIFIED: not observable in the archived pages (only high-level sheets); `weapon` also needs more than one weapon.
 */
export const UNLOCK = { weapon: 1, loc: 2, target: 3, move: 5, ttype: 6 } as const;
export type PrefField = keyof typeof UNLOCK;

export const unlocked = (field: PrefField, sheet: Pick<TrooperSheet, "level" | "weapons">): boolean =>
  sheet.level >= UNLOCK[field] && (field !== "weapon" || sheet.weapons.length > 1);

export const defaultTrooperPref = (): TrooperPref => ({ ...Data.defaultPref() }) as TrooperPref;

/** Values of the five selects of the sheet for a stored pref (-1 = "none/default"). */
export function selection(pref: TrooperPref, weapons: readonly number[]): Record<PrefField, number> {
  const w = pref.CWeapon === null ? -1 : weapons.indexOf(pref.CWeapon);
  return {
    weapon: w,
    loc: pref.CBody ?? -1,
    target: pref.targetSystem,
    move: pref.moveSystem,
    ttype: pref.targetType === 1 ? (pref.targetClass ?? -1) : -1,
  };
}

const RANGE: Record<PrefField, (sheet: Pick<TrooperSheet, "weapons">) => [number, number]> = {
  weapon: (s) => [-1, s.weapons.length - 1],
  loc: () => [-1, 7],
  target: () => [0, 3],
  move: () => [0, 2],
  ttype: () => [-1, 7],
};

/**
 * Applies a submitted config form to `cur`. Absent or locked fields keep their value; a present, unlocked field
 * outside its range makes the whole form invalid (null). `weapon` is an index into the trooper's own weapons,
 * `ttype` -1 is "default" and s in 0..7 is SPECIFIC_CLASS with the ARMY_JOB skill s.
 */
export function applyPrefForm(cur: TrooperPref, form: Record<string, unknown>, sheet: Pick<TrooperSheet, "level" | "weapons">): TrooperPref | null {
  const next: TrooperPref = { ...cur };
  for (const field of Object.keys(UNLOCK) as PrefField[]) {
    const raw = form[field];
    if (raw === undefined || !unlocked(field, sheet)) continue;
    if (typeof raw !== "string" || !/^-?\d{1,2}$/.test(raw)) return null;
    const n = Number(raw);
    const [lo, hi] = RANGE[field](sheet);
    if (n < lo || n > hi) return null;
    if (field === "weapon") next.CWeapon = n < 0 ? null : (sheet.weapons[n] as number);
    else if (field === "loc") next.CBody = n < 0 ? null : n;
    else if (field === "target") next.targetSystem = n;
    else if (field === "move") next.moveSystem = n;
    else if (n < 0) {
      next.targetType = 0;
      delete next.targetClass;
    } else {
      next.targetType = 1;
      next.targetClass = n;
    }
  }
  return next;
}
