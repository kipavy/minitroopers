// swf: logic.Trooper (§P!L/\x02§.§59=F\x03§) — the input-only part of a trooper: constructor
// (Ghost + leader flag) and the battle-Rand-free steps of `init` (§(\x07\x184§): weapon types,
// helmet, life. The rest of `init` (LogicWeapon.init ammo draws, spare-weapon flags, current
// weapon, vehicle, initiative) draws on the battle Rand and is completed by the battle (Task 7).
import { has, skillRow, skillWeapon } from "../data/data.ts";
import { SKILL_TYPES, SKILLS, TROOPER_TYPES, WEAPONS } from "../data/enums.ts";
import type { BattleTrooperInput } from "../input/types.ts";
import { Ghost } from "./ghost.ts";
import type { GhostData } from "./ghost.ts";
import type { GhostPref } from "../data/data.ts";

/** What a trooper is before the battle Rand touches it. */
export interface GeneratedTrooper {
  id: number;
  side: 0 | 1;
  /** Trooper.§we\f=\x03§ — level, skills (array order), life, speed coefficients, physical. */
  ghost: Ghost;
  /** Weapon enum indexes of `Trooper.weapons`, in creation order (`init`: type weapon, then WEAPON skills). */
  weaponTypes: number[];
  /** §\x1c(h7\x03§ — the trooper's id is in its army's `__UP2` list (spawnOrder). */
  leader: boolean;
  /** §(\x1f\x15F\x01§ — set by `init` when the Ghost holds an ARMY_JOB skill (§P4Y_\x03§ non-null). */
  helmet: boolean;
  /** §\x12?g-§ after `init` = getLifeMax() = ghost life (§\x03\f;Z\x03§). */
  life: number;
}

const toGhostPref = (t: BattleTrooperInput): GhostPref | null => {
  const p = t.pref;
  if (p === null) return null;
  const out: GhostPref = {
    CBody: p.CBody,
    CWeapon: p.CWeapon,
    targetSystem: p.targetSystem,
    targetType: p.targetType,
    moveSystem: p.moveSystem,
    reloadSystem: p.reloadSystem ?? 2,
    leftOver: p.leftOver,
  };
  if (p.targetClass !== undefined) out.targetClass = p.targetClass;
  return out;
};

/** Trooper data object (as the SWF deserialises it) from the battle input. */
export const toGhostData = (t: BattleTrooperInput): GhostData => ({
  id: t.id,
  name: t.name,
  seed: t.seed,
  type: t.type,
  choices: t.choices,
  force: t.force,
  pref: toGhostPref(t),
});

/**
 * Data of the trooper spawned by CLOWN_GRENADE (Trooper §lB{u\x01§, case 85): `{pref: Data default,
 * name: "bibi le clown", force: [Skill 74, Skill 140], choices: [], type: TrooperType PUPPET,
 * id: -(++battle counter), seed: battle.seed % 3300}` (id and seed are battle draws).
 */
export const clownData = (id: number, seed: number): BattleTrooperInput => ({
  id,
  name: "bibi le clown",
  seed,
  type: TROOPER_TYPES.PUPPET,
  choices: [],
  // Skill §+,v\x1e\x01§ (74) and §x\x18k\x7f\x01§ (140).
  force: [SKILLS.INVINCIBLE, SKILLS.SEMELLES_DE_PLOMB],
  pref: null,
});

/** `Trooper.init` type switch: the weapon every trooper of a TrooperType starts with. */
const typeWeapon = (type: number): number | null => {
  switch (type) {
    case 0:
      return WEAPONS.FISTS; // §ud\\\\§
    case 1:
      return WEAPONS.CLOWN; // §\x1c\x1dS,\x03§
    case 2:
      return WEAPONS.RAT_TOOTH; // §1[a@\x01§
    default:
      return null;
  }
};

/**
 * Trooper constructor + the input-only steps of `Trooper.init`. `spawnOrder` is the army's
 * `__UP2` (Player.data.§K)\x16\n\x02§): the leader flag is `id ∈ spawnOrder`.
 */
export const generateTrooper = (
  t: BattleTrooperInput,
  side: 0 | 1,
  spawnOrder: readonly number[],
): GeneratedTrooper => {
  const ghost = new Ghost(toGhostData(t));
  let leader = false;
  for (const id of spawnOrder) {
    if ((id | 0) === (t.id | 0)) {
      leader = true;
      break;
    }
  }
  const weaponTypes: number[] = [];
  const tw = typeWeapon(t.type);
  if (tw !== null) weaponTypes.push(tw);
  for (const s of ghost.skills) {
    if (skillRow(s).type === SKILL_TYPES.WEAPON) weaponTypes.push(skillWeapon(s));
  }
  return { id: t.id, side, ghost, weaponTypes, leader, helmet: ghost.job != null, life: ghost.life };
};

/** Full post-`init` state of a trooper, as printed by the oracle's `mtTrp`. */
export interface TrooperLineState {
  id: number;
  side: 0 | 1;
  life: number;
  time: number;
  lvl: number;
  skills: readonly number[];
  weapons: readonly { type: number; ammo: number; reserve: number; flag: boolean }[];
  /** Index of the current weapon in `weapons`, -1 when none. */
  weapIdx: number;
  /** Vehicule enum index, null when none. */
  vehicle: number | null;
  helmet: boolean;
  leader: boolean;
}

/** `TRP <id>|<side>|<life>|<time>|<lvl>|<skills>|<weapons>|<weapIdx>|<vehicle>|<helmet>|<leader>`. */
export const formatTrooperLine = (s: TrooperLineState): string =>
  "TRP " +
  [
    String(s.id),
    String(s.side),
    String(s.life),
    String(s.time),
    String(s.lvl),
    s.skills.map(String).join(","),
    s.weapons.map((w) => `${w.type}:${w.ammo}:${w.reserve}:${w.flag ? 1 : 0}`).join(","),
    String(s.weapIdx),
    s.vehicle === null ? "-" : String(s.vehicle),
    s.helmet ? "1" : "0",
    s.leader ? "1" : "0",
  ].join("|");

/**
 * Input-derived projection of a TRP line: `id|side|life|lvl|skills|<weapon types>|helmet|leader`.
 * Dropped (battle-Rand): `time`, each weapon's `ammo:reserve:flag`, `weapIdx`, `vehicle`.
 */
export const trooperProjection = (line: string): string => {
  if (!line.startsWith("TRP ")) throw new Error(`not a TRP line: ${line}`);
  const f = line.slice(4).split("|");
  if (f.length !== 11) throw new Error(`TRP line with ${f.length} fields: ${line}`);
  const [id, side, life, , lvl, skills, weapons, , , helmet, leader] = f as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const types = weapons === "" ? "" : weapons
    .split(",")
    .map((w) => w.split(":")[0])
    .join(",");
  return [id, side, life, lvl, skills, types, helmet, leader].join("|");
};

/** Same projection, computed from a generated trooper. */
export const projectGenerated = (g: GeneratedTrooper): string =>
  [
    String(g.id),
    String(g.side),
    String(g.life),
    String(g.ghost.lvl),
    g.ghost.skills.map(String).join(","),
    g.weaponTypes.map(String).join(","),
    g.helmet ? "1" : "0",
    g.leader ? "1" : "0",
  ].join("|");

/** True when the trooper has a skill (Ghost §(%Q\x02§). */
export const trooperHas = (g: GeneratedTrooper, skill: number): boolean => has(g.ghost.skills, skill);
