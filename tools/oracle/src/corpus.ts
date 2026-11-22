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
import { SkillGuide } from "./skillGuide.ts";

export const CORPUS_TAGS = [
  "basic",
  "levels",
  "forced-skill",
  "vehicles",
  "specialists",
  "large",
  "rats",
  "edge",
] as const;
export type CorpusTag = (typeof CORPUS_TAGS)[number];

const HUMAN = 0;
const RAT = 2;
const MAX_SEED = 2147483646;
const BACKGROUNDS = ["garden", "attic", "sewer", "road", "wood"] as const;
const WEAPON_COUNT = 38;
const BODY_LOC_COUNT = 8;
const ARMY_JOBS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
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

const randomPref = (r: Rng, name: string): TrooperPref | null => {
  if (r.chance(0.2)) return null;
  const specific = r.chance(0.2);
  const pref: TrooperPref = {
    CWeapon: r.chance(0.25) ? r.int(0, WEAPON_COUNT - 1) : null,
    CBody: r.chance(0.3) ? r.int(0, BODY_LOC_COUNT - 1) : null,
    targetSystem: r.int(0, 3),
    targetType: specific ? 1 : 0,
    moveSystem: r.int(0, 2),
    name,
    selectedItems: [],
    reloadSystem: r.int(0, 3),
  };
  if (specific) pref.targetClass = r.pick(ARMY_JOBS);
  return pref;
};

type Steer = (offers: number[], level: number) => number | undefined;

/** `level - 1` choices; `steer` may pick the offer index, otherwise random 0/1. */
const makeChoices = (r: Rng, seed: number, lvl: number, steer?: Steer): number[] => {
  const choices: number[] = [];
  const guide = steer ? new SkillGuide(seed) : undefined;
  for (let i = 1; i < lvl; i++) {
    let c = r.int(0, 1);
    if (guide) {
      const offers = guide.offers().slice(0, 2);
      c = steer!(offers, guide.level) ?? (offers.length < 2 ? 0 : c);
      guide.pick(c);
    }
    choices.push(c);
  }
  return choices;
};

const human = (
  r: Rng,
  id: number,
  lvl: number,
  opts: { steer?: Steer; force?: number[]; seed?: number } = {},
): BattleTrooperInput => {
  const seed = opts.seed ?? gameSeed(r);
  const name = `T${id}`;
  return {
    id,
    name,
    seed,
    type: HUMAN,
    choices: makeChoices(r, seed, lvl, opts.steer),
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

const vehicleSteer: Steer = (offers, level) => {
  if (level === 4) {
    const pilot = offers.indexOf(2);
    if (pilot >= 0) return pilot;
  }
  const i = offers.findIndex((k) => hasCat(k, "VEHICULE"));
  return i >= 0 ? i : undefined;
};

const specialistSteer = (job: number): Steer => {
  const opened = new Set(SKILL_GEN[job]!.open);
  return (offers) => {
    const i = offers.indexOf(job);
    if (i >= 0) return i;
    const j = offers.findIndex((k) => opened.has(k));
    return j >= 0 ? j : undefined;
  };
};

const levelIn = (r: Rng, min: number, max: number) => r.int(min, max);

/** Random battle `i` of a random tag. */
const RANDOM_TAGS: Record<Exclude<CorpusTag, "forced-skill" | "edge">, (r: Rng) => BattleInput> = {
  basic: (r) => {
    const mk = (id: number) => human(r, id, 1);
    return battle(r, [r.int(1, 6), r.int(1, 6)], [mk, mk]);
  },
  levels: (r) => {
    const mk = (id: number) => human(r, id, levelIn(r, 1, 30));
    return battle(r, [r.int(1, 6), r.int(1, 6)], [mk, mk]);
  },
  vehicles: (r) => {
    const mk = (id: number) => human(r, id, levelIn(r, 7, 30), { steer: vehicleSteer });
    return battle(r, [r.int(1, 6), r.int(1, 6)], [mk, mk]);
  },
  specialists: (r) => {
    const mk = (id: number) =>
      human(r, id, levelIn(r, 7, 30), { steer: specialistSteer(r.pick(ARMY_JOBS)) });
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

/** Fixed lists: index -> battle. */
const forcedSkill = (r: Rng, i: number): BattleInput => {
  const opp = (id: number) => human(r, id, levelIn(r, 1, 10));
  if (i < SKILL_COUNT) {
    // One trooper forced with skill i (NPC/rat-only skills included) vs 1-3 random troopers.
    const forcedLevel = levelIn(r, 1, 10);
    let first = true;
    const left = (id: number) => {
      if (!first) return opp(id);
      first = false;
      return human(r, id, forcedLevel, { force: [i] });
    };
    return battle(r, [r.int(1, 3), r.int(1, 3)], [left, opp]);
  }
  // Extras: one trooper forced with 4-6 equipment skills (more than the 3 a pref can select).
  const n = 4 + ((i - SKILL_COUNT) % 3);
  const pool = [...EQUIPMENT];
  const force = Array.from({ length: n }, () => pool.splice(r.int(0, pool.length - 1), 1)[0]!);
  let first = true;
  const left = (id: number) => {
    if (!first) return opp(id);
    first = false;
    const t = human(r, id, levelIn(r, 1, 10), { force });
    if (t.pref) t.pref.selectedItems = force.slice(0, 3);
    return t;
  };
  return battle(r, [r.int(1, 3), r.int(1, 3)], [left, opp]);
};
const FORCED_SKILL_EXTRAS = 9;

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
  tag === "forced-skill" ? SKILL_COUNT + FORCED_SKILL_EXTRAS : tag === "edge" ? EDGE_SIZE : null;

export const generateCorpus = (opts: { seed: number; count: number; tag: CorpusTag }): BattleInput[] => {
  const { seed, tag } = opts;
  const full = corpusFullSize(tag);
  const count = full === null ? opts.count : Math.min(opts.count, full);
  return Array.from({ length: count }, (_, i) => {
    const r = new Rng(`${seed}|${tag}|${i}`);
    if (tag === "forced-skill") return forcedSkill(r, i);
    if (tag === "edge") return edge(r, i);
    return RANDOM_TAGS[tag](r);
  });
};
