// Deterministic random battle corpus for the oracle (tools/oracle/golden/<tag>/).
// Battle i of (seed, tag) depends only on (seed, tag, i): corpora are prefix-stable, so a
// resumed capture (`capture.ts` skips existing files) always pairs a file with the same input.
import type {
  BattleArmyInput,
  BattleInput,
  BattleTrooperInput,
  TrooperPref,
} from "@mt/engine";
import { RAT_SKILLS, SKILL_COUNT, SKILL_GEN } from "./data/skills.ts";


export const CORPUS_TAGS = [
  "basic",
  "levels",
  "forced-skill",
  "vehicles",
  "specialists",
  "large",
  "rats",
  "edge",
  "comms",
  "martyr-saviour",
  "jet",
  "sabotage",
  "helicopter",
] as const;
export type CorpusTag = (typeof CORPUS_TAGS)[number];

/** Per-tag generator version; bump a tag's entry when its generation changes: capture refuses to
 * resume a tag directory captured with another version. */
export const CORPUS_VERSIONS: Record<CorpusTag, number> = {
  basic: 2,
  levels: 2,
  "forced-skill": 2,
  vehicles: 4,
  specialists: 2,
  large: 2,
  rats: 2,
  edge: 2,
  comms: 1,
  "martyr-saviour": 1,
  jet: 1,
  sabotage: 1,
  helicopter: 1,
};

const HUMAN = 0;
const RAT = 2;
const MAX_SEED = 2147483646;
const BACKGROUNDS = ["garden", "attic", "sewer", "road", "wood"] as const;
const WEAPON_COUNT = 38;
const BODY_LOC_COUNT = 8;
const ARMY_JOBS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const PILOT = 2;
/** LIGHT_TANK, MOTORCYCLE, FIGHTER_JET, HELICOPTER, HEAVY_TANK (SPAWN skills -> Vehicule). */
export const VEHICLE_SKILLS = [38, 39, 40, 41, 42] as const;
const hasCat = (k: number, cat: string): boolean => SKILL_GEN[k]!.cats.includes(cat);
const EQUIPMENT = Array.from({ length: SKILL_COUNT }, (_, k) => k).filter((k) =>
  hasCat(k, "EQUIPMENT"),
);

/** mulberry32 over an FNV-1a hash of the key. */
class Rng {
  private s: number;
  constructor(key: string) {
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
    this.s = h >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(a: readonly T[]): T {
    return a[this.int(0, a.length - 1)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Seeds as $GL draws them (createBattleSeed / ratSeed): 10 000 000 + random(90 000 000). */
const gameSeed = (r: Rng): number => r.int(10_000_000, 99_999_999);

const randomPref = (r: Rng, name: string, nullable = true): TrooperPref | null => {
  if (nullable && r.chance(0.2)) return null;
  const specific = r.chance(0.2);
  const pref: TrooperPref = {
    CWeapon: r.chance(0.25) ? r.int(0, WEAPON_COUNT - 1) : null,
    CBody: r.chance(0.3) ? r.int(0, BODY_LOC_COUNT - 1) : null,
    targetSystem: r.int(0, 3),
    targetType: specific ? 1 : 0,
    moveSystem: r.int(0, 2),
    name,
    leftOver: [],
    selectedItems: [],
    reloadSystem: r.int(0, 3),
  };
  if (specific) pref.targetClass = r.pick(ARMY_JOBS);
  return pref;
};

/** `level - 1` random 0/1 choices (level = choices.length + 1). */
const makeChoices = (r: Rng, lvl: number): number[] =>
  Array.from({ length: lvl - 1 }, () => r.int(0, 1));

const human = (
  r: Rng,
  id: number,
  lvl: number,
  opts: { force?: number[]; seed?: number } = {},
): BattleTrooperInput => {
  const seed = opts.seed ?? gameSeed(r);
  const name = `T${id}`;
  return {
    id,
    name,
    seed,
    type: HUMAN,
    choices: makeChoices(r, lvl),
    force: opts.force ?? [],
    pref: randomPref(r, name),
  };
};

const rat = (r: Rng, id: number): BattleTrooperInput => {
  const pool = [...RAT_SKILLS];
  const force: number[] = [];
  for (let i = 0; i < 2; i++) force.push(pool.splice(r.int(0, pool.length - 1), 1)[0]!);
  return { id, name: "Rat", seed: gameSeed(r), type: RAT, choices: [], force, pref: null };
};

type TrooperMaker = (id: number) => BattleTrooperInput;

const battle = (
  r: Rng,
  sides: [number, number],
  make: [TrooperMaker, TrooperMaker],
  over: { seed?: number; factions?: [number, number] } = {},
): BattleInput => {
  let next = 0;
  const armies = sides.map((n, s): BattleArmyInput => {
    const troopers = Array.from({ length: n }, () => make[s]!(next++));
    return {
      faction: over.factions?.[s] ?? r.int(0, 5),
      spawnOrder: troopers.map((t) => t.id),
      troopers,
    };
  }) as [BattleArmyInput, BattleArmyInput];
  const bg = r.int(0, BACKGROUNDS.length - 1);
  return {
    seed: over.seed ?? gameSeed(r),
    background: { gfx: `bg/${BACKGROUNDS[bg]}.jpg`, id: bg },
    armies,
    attackerSide: r.int(0, 1),
  };
};

const levelIn = (r: Rng, min: number, max: number) => r.int(min, max);

/** Random battle `i` of a random tag. */
const RANDOM_TAGS: Record<"basic" | "levels" | "large" | "rats", (r: Rng) => BattleInput> = {
  basic: (r) => {
    const mk = (id: number) => human(r, id, 1);
    return battle(r, [r.int(1, 6), r.int(1, 6)], [mk, mk]);
  },
  levels: (r) => {
    const mk = (id: number) => human(r, id, levelIn(r, 1, 30));
    return battle(r, [r.int(1, 6), r.int(1, 6)], [mk, mk]);
  },
  large: (r) => {
    const mk = (id: number) => human(r, id, levelIn(r, 1, 30));
    return battle(r, [r.int(20, 32), r.int(20, 32)], [mk, mk]);
  },
  rats: (r) => {
    const mk = (id: number) => human(r, id, levelIn(r, 1, 15));
    // $GL exterminate mission: user army left (attacker), rats right with faction 0.
    const b = battle(r, [r.int(1, 12), r.int(1, 16)], [mk, (id) => rat(r, id)]);
    b.armies[1].faction = 0;
    b.background = { gfx: "bg/attic.jpg", id: 1 };
    b.attackerSide = 0;
    return b;
  },
};

/** A single trooper on side 0 (always deployed first) vs 1-3 opponents of level 1-10. */
const soloVs = (r: Rng, solo: (id: number) => BattleTrooperInput): BattleInput => {
  const opp = (id: number) => human(r, id, levelIn(r, 1, 10));
  return battle(r, [1, r.int(1, 3)], [solo, opp]);
};

/** Equipment beyond the 3 a trooper keeps goes to `pref.leftOver`, like $GL getLeftOver. */
const withLeftOver = (t: BattleTrooperInput, r: Rng, items: number[]): BattleTrooperInput => {
  const pref = t.pref ?? randomPref(r, t.name, false)!;
  pref.selectedItems = items.slice(0, 3);
  pref.leftOver = items.slice(3);
  return { ...t, pref };
};

const FORCED_SEEDS_PER_SKILL = 3;
const FORCED_SKILL_EXTRAS = 9;

/** i < 3 x SKILL_COUNT: skill floor(i / 3) forced on a lone trooper (3 battle seeds per skill,
 * NPC/rat-only skills included). Then extras: a lone trooper forced with 4-6 equipment skills,
 * the ones beyond 3 in `pref.leftOver`. */
const forcedSkill = (r: Rng, i: number): BattleInput => {
  if (i < SKILL_COUNT * FORCED_SEEDS_PER_SKILL) {
    const k = Math.floor(i / FORCED_SEEDS_PER_SKILL);
    return soloVs(r, (id) => human(r, id, levelIn(r, 1, 10), { force: [k] }));
  }
  const n = 4 + ((i - SKILL_COUNT * FORCED_SEEDS_PER_SKILL) % 3);
  const pool = [...EQUIPMENT];
  const items = Array.from({ length: n }, () => pool.splice(r.int(0, pool.length - 1), 1)[0]!);
  return soloVs(r, (id) => withLeftOver(human(r, id, levelIn(r, 1, 10), { force: items }), r, items));
};

const SCOUT = 4;
const HEAVY_TANK_SKILL = 42;
/** Rotation of the forced vehicle skill: HEAVY_TANK twice as often (it also needs the dice). */
export const VEHICLE_ROTATION = [38, 39, 40, 41, 42, 42] as const;

/** Battle i: 1-2 high-level troopers forced [PILOT, VEHICLE_ROTATION[i % 6]] (deployed first),
 * then companions on the same side, vs 1-4 random troopers. The vehicle is drawn per battle from
 * the battle seed (PILOT only raises the odds), and Player.deploy drops it when no deploy square
 * fits its size.
 * - Companions keep the side alive: a fighter-jet trooper leaves the deployment pool and only
 *   strikes later (EV 21), so a side made of jets alone loses before any strike.
 * - HEAVY_TANK (size index 2 = a 3x2 block) only fits when the side has >= 8 deploy squares:
 *   dep = 4 + 1 per SCOUT that is not also Comms/Saboteur, so its 5 companions are forced SCOUT. */
const vehicles = (r: Rng, i: number): BattleInput => {
  const v = VEHICLE_ROTATION[i % VEHICLE_ROTATION.length]!;
  const pilots = r.int(1, 2);
  const heavy = v === HEAVY_TANK_SKILL;
  const left = (id: number) =>
    id < pilots
      ? human(r, id, levelIn(r, 15, 30), { force: [PILOT, v] })
      : human(r, id, levelIn(r, 1, 30), heavy ? { force: [SCOUT] } : {});
  const opp = (id: number) => human(r, id, levelIn(r, 1, 30));
  return battle(r, [pilots + (heavy ? 5 : r.int(1, 3)), r.int(1, 4)], [left, opp]);
};

/** Battle i: 1-3 troopers of level 7-30 forced specialization i % 8, half of them also forced
 * one of the skills that specialization opens; vs 1-4 random troopers. */
const specialists = (r: Rng, i: number): BattleInput => {
  const job = ARMY_JOBS[i % ARMY_JOBS.length]!;
  const opens = SKILL_GEN[job]!.open;
  const spec = (id: number) =>
    human(r, id, levelIn(r, 7, 30), {
      force: opens.length > 0 && r.chance(0.5) ? [job, r.pick(opens)] : [job],
    });
  const opp = (id: number) => human(r, id, levelIn(r, 1, 30));
  return battle(r, [r.int(1, 3), r.int(1, 4)], [spec, opp]);
};

const COMMS_OFFICIER = 6;
const SABOTEUR = 7;
const DOCTOR = 1;
const RADIO = 109;
const SAVIOUR = 111;
const MARTYR = 139;
const FIGHTER_JET = 40;

/** Comms orders need a Communications DIFFERENCE (Player.useCom: com - opp.com >= Data.COMS min:
 * Solo 0, Locked 0, Commando 5, Support 5, Retreat 10, Propaganda 20); com = sum of Comms Officer
 * levels (choices.length) + 1 per RADIO, counted from the reserve too. Battle i: side 0 has 2-3
 * Comms Officers of level 22-30 (half also forced RADIO) + 2-8 others; side 1 has 6-16 troopers,
 * in one battle out of two about half forced SCOUT (+1 deploy square each) so more of them stand
 * on the field: the
 * ratio-gated orders (Support 0.5 < ratio < 1, Retreat ratio <= 0.5 with <= 5 fighters) and
 * Propaganda (an enemy next to one of ours) all occur. */
const comms = (r: Rng): BattleInput => {
  const officers = r.int(2, 3);
  const left = (id: number) =>
    id < officers
      ? human(r, id, levelIn(r, 22, 30), { force: r.chance(0.5) ? [COMMS_OFFICIER, RADIO] : [COMMS_OFFICIER] })
      : human(r, id, levelIn(r, 1, 30));
  const scouts = r.chance(0.5);
  const opp = (id: number) => human(r, id, levelIn(r, 1, 30), scouts && r.chance(0.5) ? { force: [SCOUT] } : {});
  return battle(r, [officers + r.int(2, 8), r.int(6, 16)], [left, opp]);
};

/** Martyr (Battle.runTrigger Kill: first MARTYR death of a side deploys up to 5 + boosts) and
 * Saviour (Doctor-only super: a dead ally back to the pool). Battle i: 4-10 per side; on each side
 * 1-3 troopers forced MARTYR (level 7-30) and 1-2 forced [DOCTOR, SAVIOUR] (level 7-30); armies
 * larger than one wave keep a reserve for Martyr to deploy. */
const martyrSaviour = (r: Rng): BattleInput => {
  const mk = (id: number, side: number): BattleTrooperInput => {
    const k = side === 0 ? id : id - nLeft;
    if (k < 2) return human(r, id, levelIn(r, 7, 30), { force: [MARTYR] });
    if (k < 4) return human(r, id, levelIn(r, 7, 30), { force: [DOCTOR, SAVIOUR] });
    return human(r, id, levelIn(r, 1, 30));
  };
  const nLeft = r.int(4, 10);
  return battle(r, [nLeft, r.int(4, 10)], [(id) => mk(id, 0), (id) => mk(id, 1)]);
};

/** Fighter-jet strikes (Battle event case 1, first one 100 + rand(2000) ticks in): battle i: on
 * side 0, 1-2 troopers of level 15-30 forced [PILOT, FIGHTER_JET] (the jet is drawn on the seed:
 * PILOT raises the odds) + 4-10 sturdy companions of level 15-30 so the battle lasts; side 1:
 * 4-10 troopers of level 15-30. */
const jet = (r: Rng): BattleInput => {
  const pilots = r.int(1, 2);
  const left = (id: number) =>
    id < pilots ? human(r, id, levelIn(r, 15, 30), { force: [PILOT, FIGHTER_JET] }) : human(r, id, levelIn(r, 15, 30));
  const opp = (id: number) => human(r, id, levelIn(r, 15, 30));
  return battle(r, [pilots + r.int(4, 10), r.int(4, 10)], [left, opp]);
};

/** Sabotage (Trooper.init: each spare weapon jammed with chance opp.sabotage %, halved per jam;
 * sabotage = 50 * sum of Saboteur levels / enemy army size, capped at 100): battle i: side 0 has
 * 1-3 Saboteurs of level 10-30 + 0-4 others, side 1 has 1-8 troopers of level 7-30 (spares). */
const sabotage = (r: Rng): BattleInput => {
  const sab = r.int(1, 3);
  const left = (id: number) =>
    id < sab ? human(r, id, levelIn(r, 10, 30), { force: [SABOTEUR] }) : human(r, id, levelIn(r, 1, 30));
  const opp = (id: number) => human(r, id, levelIn(r, 7, 30));
  return battle(r, [sab + r.int(0, 4), r.int(1, 8)], [left, opp]);
};

const HELICOPTER = 41;
const MELEE_OR_SHOTGUN = [13, 14, 15, 16, 17, 37] as const;

/** Helicopter flying away (LogicVehicle.leave case 3: `Leave(side, false)` then kill, when its
 * weapon is empty or it idled > 3 turns): battle i: side 0 has 2-3 troopers of level 15-30 forced
 * [PILOT, HELICOPTER] (vehicle drawn on the seed) + 1-2 others; side 1 has 20-32 troopers of
 * level 1-5, each forced a shotgun or the knife (weapon types 1/5 cannot target a flying
 * helicopter): many weak targets, so the helicopters live long enough to empty their gun. */
const helicopter = (r: Rng): BattleInput => {
  const pilots = r.int(2, 3);
  const left = (id: number) =>
    id < pilots ? human(r, id, levelIn(r, 15, 30), { force: [PILOT, HELICOPTER] }) : human(r, id, levelIn(r, 1, 30));
  const opp = (id: number) => human(r, id, levelIn(r, 1, 5), { force: [r.pick(MELEE_OR_SHOTGUN)] });
  return battle(r, [pilots + r.int(1, 2), r.int(20, 32)], [left, opp]);
};

const EXTREME_SEEDS = [0, 1, MAX_SEED] as const;

const edge = (r: Rng, i: number): BattleInput => {
  const lvl1 = (id: number) => human(r, id, 1);
  const lvl30 = (id: number) => human(r, id, 30);
  const cases: (() => BattleInput)[] = [
    () => battle(r, [1, 1], [lvl1, lvl1]),
    () => {
      const b = battle(r, [1, 1], [lvl30, lvl30]);
      b.armies[0].troopers[0]!.name = "Zoé:Alpha|é";
      return b;
    },
    () => battle(r, [0, 3], [lvl1, lvl1]),
    () => battle(r, [3, 0], [lvl1, lvl1]),
    ...EXTREME_SEEDS.map((s) => () => battle(r, [2, 2], [lvl1, lvl1], { seed: s })),
    ...EXTREME_SEEDS.map((s) => () => {
      const mk = (id: number) => human(r, id, id % 2 === 0 ? 1 : 10, { seed: s });
      return battle(r, [2, 2], [mk, mk]);
    }),
    () => battle(r, [12, 12], [lvl30, lvl30]),
    () => battle(r, [12, 1], [lvl30, lvl1]),
  ];
  return cases[i]!();
};
const EDGE_SIZE = 12;

/** Number of battles of a fixed-list tag (`forced-skill`, `edge`); `null` for random tags. */
export const corpusFullSize = (tag: CorpusTag): number | null =>
  tag === "forced-skill" ? SKILL_COUNT * FORCED_SEEDS_PER_SKILL + FORCED_SKILL_EXTRAS : tag === "edge" ? EDGE_SIZE : null;

export const generateCorpus = (opts: { seed: number; count: number; tag: CorpusTag }): BattleInput[] => {
  const { seed, tag } = opts;
  const full = corpusFullSize(tag);
  const count = full === null ? opts.count : Math.min(opts.count, full);
  return Array.from({ length: count }, (_, i) => {
    const r = new Rng(`${seed}|${tag}|${i}`);
    if (tag === "forced-skill") return forcedSkill(r, i);
    if (tag === "edge") return edge(r, i);
    if (tag === "vehicles") return vehicles(r, i);
    if (tag === "specialists") return specialists(r, i);
    if (tag === "comms") return comms(r);
    if (tag === "martyr-saviour") return martyrSaviour(r);
    if (tag === "jet") return jet(r);
    if (tag === "sabotage") return sabotage(r);
    if (tag === "helicopter") return helicopter(r);
    return RANDOM_TAGS[tag](r);
  });
};
