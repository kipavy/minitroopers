import { validateArmyName, FACTIONS } from "@mt/game";

// Names are shown in pages, tooltips and (for troopers) flashvars: refuse anything that is not plain text.
// \p{Cc} control, \p{Cf} format (zero-width, bidi overrides), \p{Cs} surrogates (lone ones under /u), \p{Co} private use,
// \p{Cn} unassigned, \p{Zl}/\p{Zp} line/paragraph separators.
// U+FFFD is what a form decoder turns an invalid sequence / lone surrogate into.
const UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\uFFFD]/u;

/** Haxe StringTools.trim (9..13, 32), as used by the original name handling. */
const isSpace = (c: number): boolean => (c > 8 && c < 14) || c === 32;
function haxeTrim(s: string): string {
  let a = 0;
  let z = s.length;
  while (z > a && isSpace(s.charCodeAt(z - 1))) z--;
  while (a < z && isSpace(s.charCodeAt(a))) a++;
  return s.slice(a, z);
}

export type NameCheck = { ok: true; name: string; host: string; part: number } | { ok: false; error: string };

/**
 * Army creation input: `name` and `part` come straight from the form. Returns the trimmed name to store and its host.
 * The rules of @mt/game (length 1..20, derived host >= 3 chars, not reserved) plus: plain text only, and the
 * host of a faction army is never free even before the factions are seeded.
 */
export function checkArmyName(rawName: unknown, rawPart: unknown): NameCheck {
  if (typeof rawName !== "string" || rawName.length > 200) return { ok: false, error: "Le nom doit faire entre 1 et 20 caractères." };
  if (typeof rawPart !== "string" || !/^[0-5]$/.test(rawPart)) return { ok: false, error: "Article invalide." };
  if (UNSAFE.test(rawName)) return { ok: false, error: "Le nom contient des caractères interdits." };
  const name = haxeTrim(rawName);
  const part = Number(rawPart);
  const v = validateArmyName(name, part);
  if (!v.ok) return v;
  if (FACTIONS.some((f) => f.host === v.host)) return { ok: false, error: "Ce nom est déjà pris." };
  return { ok: true, name, host: v.host, part };
}

export const MAX_TROOPER_NAME = 12; // maxlength of the original rename field (UTF-16 units, like the HTML attribute)

export type TrooperNameCheck = { ok: true; name: string } | { ok: false; error: string; code: "length" | "chars" };

/**
 * New trooper name from the rename form: plain text only (same rules as army names), trimmed, 1..12 UTF-16 units.
 * UNVERIFIED: the original server-side character rules are unknown (archived names contain spaces, accents, punctuation).
 */
export function checkTrooperName(raw: unknown): TrooperNameCheck {
  const bad = { ok: false as const, code: "length" as const, error: `Le nom doit faire entre 1 et ${MAX_TROOPER_NAME} caractères.` };
  if (typeof raw !== "string" || raw.length > 200) return bad;
  if (UNSAFE.test(raw)) return { ok: false, code: "chars", error: "Le nom contient des caractères interdits." };
  const name = haxeTrim(raw);
  return name.length >= 1 && name.length <= MAX_TROOPER_NAME ? { ok: true, name } : bad;
}
