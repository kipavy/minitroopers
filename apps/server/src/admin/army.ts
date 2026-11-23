import { SKILLS, defaultLeftOver, levelUpOptions, type BattleTrooperInput } from "@mt/engine";
import { checkTrooperName } from "../validate.ts";
import { MAX_TROOPERS } from "../views/panel.ts";
import type { ArmySeed } from "../repo.ts";

/**
 * Troopers of `admin create-army --troopers <json>`: an array (slot order) of
 *   { "seed": <1..2^31-1>, "name": "<1..12 chars>", "skills": [<skill id or SKILLS name>, ...] }
 * or, instead of "skills", "choices": [<index of a shown option>, ...] (the raw stored form). Each entry of `skills`
 * is the skill picked at the next level-up and must be one of the options the game would show at that point, so the
 * army is one a player could have built. Neither: a level-1 trooper.
 */
export interface TrooperSpec {
  seed: number;
  name: string;
  skills?: (number | string)[];
  choices?: number[];
}

export class SpecError extends Error {}

const SKILL_NAMES = new Map(Object.entries(SKILLS).map(([k, v]) => [k.toUpperCase(), v as number]));
const SKILL_OF = new Map(Object.entries(SKILLS).map(([k, v]) => [v as number, k]));
const label = (s: number): string => `${SKILL_OF.get(s) ?? "?"}(${s})`;

function skillId(v: unknown, where: string): number {
  if (typeof v === "number" && Number.isInteger(v) && SKILL_OF.has(v)) return v;
  if (typeof v === "string" && SKILL_NAMES.has(v.toUpperCase())) return SKILL_NAMES.get(v.toUpperCase())!;
  throw new SpecError(`${where} : compétence inconnue ${JSON.stringify(v)}`);
}

/** Builds one trooper's choices by replaying its level-ups. */
function build(spec: Record<string, unknown>, i: number): ArmySeed["troopers"][number] {
  const where = `troopers[${i}]`;
  const seed = spec.seed;
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 1 || seed > 0x7fffffff) throw new SpecError(`${where}.seed : un entier entre 1 et 2147483647`);
  const name = checkTrooperName(spec.name);
  if (!name.ok) throw new SpecError(`${where}.name : ${name.error}`);
  if (spec.skills !== undefined && spec.choices !== undefined) throw new SpecError(`${where} : "skills" ou "choices", pas les deux`);
  const picks = spec.skills ?? spec.choices ?? [];
  if (!Array.isArray(picks)) throw new SpecError(`${where} : "skills" / "choices" doit être un tableau`);
  const t: BattleTrooperInput = { id: i, name: name.name, seed, type: 0, choices: [], force: [], pref: null };
  picks.forEach((p: unknown, n) => {
    const at = `${where}.${spec.skills !== undefined ? "skills" : "choices"}[${n}] (niveau ${n + 2})`;
    const o = levelUpOptions(t);
    if (o.shown.length === 0) throw new SpecError(`${at} : ce trooper ne peut plus monter de niveau`);
    let idx: number;
    if (spec.skills !== undefined) {
      const s = skillId(p, at);
      idx = o.shown.includes(s) ? o.drawn.indexOf(s) : -1;
      if (idx < 0) throw new SpecError(`${at} : ${label(s)} n'est pas proposée ; proposées : ${o.shown.map(label).join(", ")}`);
    } else {
      if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p >= o.shown.length) throw new SpecError(`${at} : un indice d'option entre 0 et ${o.shown.length - 1}`);
      idx = p;
    }
    t.choices.push(idx);
  });
  // Equipment beyond the carry capacity is left over, as after a level-up in the game (kept set: first in skill order).
  const left = defaultLeftOver(t);
  return { seed, name: name.name, choices: t.choices.slice(), leftOver: left.length > 0 ? left : null };
}

/** Parses and validates the troopers JSON; throws SpecError with the first problem found. */
export function buildTroopers(json: string): ArmySeed["troopers"] {
  let spec: unknown;
  try {
    spec = JSON.parse(json);
  } catch (e) {
    throw new SpecError(`troopers : JSON invalide (${(e as Error).message})`);
  }
  if (!Array.isArray(spec) || spec.length < 1 || spec.length > MAX_TROOPERS) throw new SpecError(`troopers : un tableau de 1 à ${MAX_TROOPERS} troopers`);
  const out = spec.map((s: unknown, i) => {
    if (typeof s !== "object" || s === null || Array.isArray(s)) throw new SpecError(`troopers[${i}] : un objet`);
    return build(s as Record<string, unknown>, i);
  });
  const seeds = new Set<number>();
  out.forEach((t, i) => {
    if (seeds.has(t.seed)) throw new SpecError(`troopers[${i}].seed : ${t.seed} déjà utilisée dans cette armée`);
    seeds.add(t.seed);
  });
  return out;
}
