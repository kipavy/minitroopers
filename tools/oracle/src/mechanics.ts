// Trigger-level coverage: which game mechanics actually FIRED in the goldens.
//
// Most mechanics are read from the golden traces themselves (EV lines parsed back from the oracle
// "value" format, TRP lines). Three leave no unambiguous mark in the trace (their only output is
// `Boost(0)` messages, emitted by many other paths too): Martyr, Vendetta and Frenetic, all in
// `Battle.runTrigger(Kill)`. Those are counted by replaying the golden input through the engine
// with observers wrapped around `Battle.prototype.runTrigger` and `Trooper.prototype.boost`
// (harness-side wrapping only: no engine code is changed, the wrappers call the originals and only
// read fields). A replay counts only if it reproduces the golden exactly (otherwise it is reported).
import type { BattleInput } from "@mt/engine";
import { Battle, OBF_KEYS, Trooper, type BattleRecord } from "@mt/engine/internal";
import { flattenRecord } from "./diff.ts";

// ---------------------------------------------------------------------------------------------
// Parser for the oracle value format (tools/oracle/instrument/README.md, "Format valeur").

export type Val =
  | null
  | boolean
  | number
  | string
  | { k: "enum"; i: number; p: Val[] }
  | { k: "arr"; v: Val[] }
  | { k: "obj"; m: Record<string, Val> }
  | { k: "trp"; id: number }
  | { k: "sq"; x: number; y: number }
  | { k: "other"; s: string };

const unesc = (s: string): string => s.replace(/\\u([0-9a-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

export const parseValue = (src: string): Val => {
  let i = 0;
  const fail = (what: string): never => {
    throw new Error(`parseValue: ${what} at ${i} in ${src}`);
  };
  const num = (): number => {
    const m = /^-?(?:\d+(?:\.\d+)?(?:e[+-]?\d+)?|NaN|Infinity)/.exec(src.slice(i));
    if (!m) return fail("number");
    i += m[0].length;
    return Number(m[0]);
  };
  const list = (close: string): Val[] => {
    const out: Val[] = [];
    if (src[i] === close) {
      i++;
      return out;
    }
    for (;;) {
      out.push(val());
      if (src[i] === ",") i++;
      else if (src[i] === close) {
        i++;
        return out;
      } else fail(`',' or '${close}'`);
    }
  };
  const val = (): Val => {
    const c = src[i];
    if (src.startsWith("null", i)) return (i += 4), null;
    if (src.startsWith("true", i)) return (i += 4), true;
    if (src.startsWith("false", i)) return (i += 5), false;
    if (c === '"') {
      const j = src.indexOf('"', i + 1);
      if (j < 0) fail("string end");
      const s = unesc(src.slice(i + 1, j));
      i = j + 1;
      return s;
    }
    if (c === "[") {
      i++;
      return { k: "arr", v: list("]") };
    }
    if (c === "{") {
      i++;
      const m: Record<string, Val> = {};
      if (src[i] === "}") return i++, { k: "obj", m };
      for (;;) {
        const eq = src.indexOf("=", i);
        if (eq < 0) fail("'='");
        const key = unesc(src.slice(i, eq));
        i = eq + 1;
        m[key] = val();
        if (src[i] === ";") i++;
        else if (src[i] === "}") {
          i++;
          return { k: "obj", m };
        } else fail("';' or '}'");
      }
    }
    if (c === "T") {
      i++;
      return { k: "trp", id: num() };
    }
    if (c === "Q") {
      i++;
      const x = num();
      if (src[i] !== ":") fail("':'");
      i++;
      return { k: "sq", x, y: num() };
    }
    if (c === "<") {
      const j = src.indexOf(">", i);
      const s = src.slice(i, j + 1);
      i = j + 1;
      return { k: "other", s };
    }
    const n = num();
    if (src[i] === "(") {
      i++;
      return { k: "enum", i: n, p: list(")") };
    }
    return n; // a number, or a parameterless enum value (printed as its index)
  };
  const v = val();
  if (i !== src.length) fail("trailing input");
  return v;
};

/** An EV line split into its time, tid and parsed `type` value. */
export const parseEv = (line: string): { time: number; tid: string; type: Val } => {
  const m = /^EV ([^|]*)\|([^|]*)\|(.*)$/.exec(line);
  if (!m) throw new Error(`bad EV line ${line}`);
  return { time: Number(m[1]), tid: m[2]!, type: parseValue(m[3]!) };
};

const ctor = (v: Val): number | null => (typeof v === "number" ? v : v !== null && typeof v === "object" && v.k === "enum" ? v.i : null);
const params = (v: Val): Val[] => (v !== null && typeof v === "object" && v.k === "enum" ? v.p : []);

/** Every `events` array of a hit result anywhere in `v` (HitEvent values). */
const hitEvents = (v: Val, out: Val[] = []): Val[] => {
  if (v === null || typeof v !== "object") return out;
  if (v.k === "arr") for (const x of v.v) hitEvents(x, out);
  else if (v.k === "enum") for (const x of v.p) hitEvents(x, out);
  else if (v.k === "obj") {
    for (const [key, x] of Object.entries(v.m)) {
      if (key === OBF_KEYS.events && x !== null && typeof x === "object" && x.k === "arr") out.push(...x.v);
      hitEvents(x, out);
    }
  }
  return out;
};

// ---------------------------------------------------------------------------------------------
// Mechanics.

/** useSuper (Trooper.§lB{u\x01§) cases, by Skill index, and the message each one emits. */
export const SUPER_CASES: Record<number, string> = {
  1: "DOCTOR heal (Skill 16(1,..))",
  44: "AMPHETAMINE_SHOT (Skill 16(44))",
  50: "BINOCULARS (Skill 16(50))",
  63: "CHARGE (Skill 16(63,..))",
  68: "SCAVENGER (Skill 16(68,..))",
  82: "GRENADE (Grenade 14(82,..))",
  83: "FLASHBANG (Grenade 14(83,..))",
  84: "GAS_GRENADE (Grenade 14(84,..))",
  85: "CLOWN_GRENADE (Grenade 14(85,..,null,infos))",
  86: "FRAGMENTATION_GRENADE (Grenade 14(86,..))",
  87: "SHOCK_GRENADE (Grenade 14(87,..))",
  88: "GLUE_GRENADE (Grenade 14(88,..))",
  89: "GRENADE_BENIE (Grenade 14(89,..))",
  90: "HEALING_GRENADE (Grenade 14(90,..))",
  91: "BLACK_HOLE_GRENADE (Grenade 14(91,..))",
  111: "SAVIOUR rescue (Rescue 19)",
  122: "FACEBOOT (Brawl 9(tid,null,hit,20))",
  125: "TALKY_WALKY (Skill 16(125))",
  129: "TWINOID (Skill 16(129))",
  133: "VOODOO_DOLL (Skill 16(133,ids))",
  136: "WRESTLER (Wrestle 18)",
};

/** Comms orders (Data.COMS, Player.useCom): index -> name (min Communications difference). */
export const COMS_NAMES = [
  "Solo Mission (objectif solo, min 0)",
  "Commando (min 5)",
  "Propaganda (propagande, min 20)",
  "Support (min 5)",
  "Retreat (retraite, min 10)",
  "Locked (cible repérée, min 0)",
];

/**
 * Coverage label of Comms order c. What is counted are the order's MARKS in the trace, not orders:
 * orders 0-4 emit one `Announce(Com(c))` per affected trooper (Commando: each trooper of the group,
 * Support: each deployed one, Retreat: each leaving one; Solo / Propaganda: one); order 5 (Locked)
 * emits one `StatusOn(LOCKED)` on its single target.
 */
export const comLabel = (c: number): string =>
  c === 5 ? `comms 5 ${COMS_NAMES[5]} [StatusOn(LOCKED) marks]` : `comms ${c} ${COMS_NAMES[c]} [Announce(Com) marks]`;

export const STATUS_NAMES = ["BLIND", "POISON", "AMPHETAMINE", "PARALYZED", "CURSED", "LOCKED"];
export const VEHICLE_NAMES: Record<number, string> = { 0: "MOTO", 2: "LIGHT_TANK", 3: "HELICOPTER", 4: "HEAVY_TANK" };

/** BattleMsg constructors never constructed by the SWF logic package (§P!L/\x02§, the only caller
 * of Battle.msg): proven by the decompile (tools/oracle/instrument/README.md, "Couverture"). */
export const NEVER_EMITTED_MSG = new Set([0, 15, 31, 33, 37, 42]);
/** HitEvent constructors never constructed by the SWF logic package (same proof). */
export const NEVER_EMITTED_HIT = new Set([0]);
export const BATTLE_MSG_COUNT = 43;
export const HIT_EVENT_COUNT = 13;

/** Mechanic name -> occurrences. Names are stable (they key the gate and the report). */
export type MechanicCounts = Map<string, number>;

const inc = (m: MechanicCounts, k: string, by = 1): void => {
  m.set(k, (m.get(k) ?? 0) + by);
};

/** Every mechanic the gate expects (each must fire >= MIN_FIRES times). */
export const expectedMechanics = (): string[] => [
  ...Object.entries(SUPER_CASES).map(([k, v]) => `super ${k} ${v}`),
  "interception (Grenade 14 with interceptor id)",
  "clown spawn (TRP with negative id)",
  ...COMS_NAMES.map((_, i) => comLabel(i)),
  "propaganda switch (Propaganda 30)",
  "martyr (replay)",
  "vendetta boost (replay)",
  "frenetic boost (replay)",
  "jet strike (Airstrike 21)",
  ...Object.entries(VEHICLE_NAMES).map(([k, v]) => `vehicle ${k} ${v} (TRP)`),
  "vehicle dismount (Dismount 36)",
  "helicopter leaves (Leave 29 false)",
  "retreat leave (Leave 29 true)",
  "sabotage (TRP spare weapon flag 1)",
  "sabotage value > 0 (PlayerStatus 40)",
  ...STATUS_NAMES.map((n, i) => `status ${i} ${n} on`),
  "winner=null (btime > 50000)",
  ...Array.from({ length: BATTLE_MSG_COUNT }, (_, i) => i)
    .filter((i) => !NEVER_EMITTED_MSG.has(i))
    .map((i) => `BattleMsg ${i}`),
  ...Array.from({ length: HIT_EVENT_COUNT }, (_, i) => i).filter((i) => !NEVER_EMITTED_HIT.has(i)).map((i) => `HitEvent ${i}`),
];

export const MIN_FIRES = 3;

/**
 * Mechanics with a live emitter in the SWF that no golden and no engine search has produced, and
 * that could not be proven unreachable either. Excluded from the gate, always printed with their
 * reason (details: tools/oracle/instrument/README.md, "Couverture").
 */
export const UNREACHED_DOCUMENTED: ReadonlyMap<string, string> = new Map([
  [
    "winner=null (btime > 50000)",
    "no valid input keeps btime > 50000 (review argument): armour removes <= 3 and only on the " +
      "matching body location, so fists still deal 1 on limbs; vehicles leave/dismount when empty or " +
      "idle; redeploy blockers are transient (OCCUPATION 10% per newWave, 3 uses; REVERSE_ATTACK lasts " +
      "one deploy, deploy() resets depBonus); only >= dep own clowns parked on the first DEPLOY_ORDER " +
      "squares at wave end would last. Searches: max btime 6 627 (80 000 battles), 13 706 (review)",
  ],
]);

/** Mechanics read from one golden's trace. */
export const traceMechanics = (record: BattleRecord, into: MechanicCounts = new Map()): MechanicCounts => {
  for (const t of record.troopers) {
    const f = t.line.slice(4).split("|");
    if (Number(f[0]) < 0) inc(into, "clown spawn (TRP with negative id)");
    const v = VEHICLE_NAMES[Number(f[8])];
    if (f[8] !== "-" && v !== undefined) inc(into, `vehicle ${f[8]} ${v} (TRP)`);
    for (const w of (f[6] ?? "").split(",")) if (w.endsWith(":1")) inc(into, "sabotage (TRP spare weapon flag 1)");
  }
  if (record.winner === null) inc(into, "winner=null (btime > 50000)");
  for (const line of record.events) {
    const { type } = parseEv(line);
    const c = ctor(type)!;
    const p = params(type);
    inc(into, `BattleMsg ${c}`);
    const p0 = ctor(p[0] ?? null);
    switch (c) {
      case 16:
        if (p0 !== null && SUPER_CASES[p0] && p0 !== 111 && p0 !== 122 && p0 !== 136) inc(into, `super ${p0} ${SUPER_CASES[p0]}`);
        break;
      case 14:
        if (p[4] !== null && p[4] !== undefined) inc(into, "interception (Grenade 14 with interceptor id)");
        else if (p0 !== null && SUPER_CASES[p0]) inc(into, `super ${p0} ${SUPER_CASES[p0]}`);
        break;
      case 19:
        inc(into, `super 111 ${SUPER_CASES[111]}`);
        break;
      case 9:
        if (p[1] === null) inc(into, `super 122 ${SUPER_CASES[122]}`);
        break;
      case 18:
        inc(into, `super 136 ${SUPER_CASES[136]}`);
        break;
      case 20: {
        const a = p[0] ?? null;
        if (ctor(a) === 1) inc(into, comLabel(ctor(params(a)[0] ?? null)!));
        break;
      }
      case 22: {
        const s = ctor(p[0] ?? null)!;
        inc(into, `status ${s} ${STATUS_NAMES[s]} on`);
        // LOCKED is set only by the Locked comms order (Player.useCom case 5).
        if (s === 5) inc(into, comLabel(5));
        break;
      }
      case 30:
        inc(into, "propaganda switch (Propaganda 30)");
        break;
      case 21:
        inc(into, "jet strike (Airstrike 21)");
        break;
      case 36:
        inc(into, "vehicle dismount (Dismount 36)");
        break;
      case 29:
        inc(into, p[1] === true ? "retreat leave (Leave 29 true)" : "helicopter leaves (Leave 29 false)");
        break;
      case 40: {
        const o = p[1];
        if (o !== null && typeof o === "object" && o.k === "obj" && Number(o.m[OBF_KEYS.vkd!]) > 0) inc(into, "sabotage value > 0 (PlayerStatus 40)");
        break;
      }
    }
    for (const he of hitEvents(type)) {
      const hc = ctor(he);
      if (hc === null) continue;
      inc(into, `HitEvent ${hc}`);
      if (hc === 12) {
        const s = ctor(params(he)[0] ?? null)!;
        inc(into, `status ${s} ${STATUS_NAMES[s]} on`);
      }
    }
  }
  return into;
};

/**
 * Replays `input` through the engine with observers on the Kill trigger; returns the counts and
 * whether the replay reproduced `expected` exactly.
 */
export const replayMechanics = (
  input: BattleInput,
  expected: BattleRecord,
  into: MechanicCounts = new Map(),
): { counts: MechanicCounts; same: boolean } => {
  const BP = Battle.prototype as unknown as { runTrigger: (tr: { index: number; params: unknown[] | null }) => void };
  const TP = Trooper.prototype as unknown as { boost: (n: number, show: boolean) => void };
  const runTrigger = BP.runTrigger;
  const boost = TP.boost;
  let vendettaList: unknown[] | null = null;
  let killerNow: unknown = null;
  BP.runTrigger = function (this: unknown, tr) {
    if (tr.index !== 0) return runTrigger.call(this, tr);
    const killer = tr.params![0] as { frenzy: number } | null | undefined;
    const victim = tr.params![1] as { player: { martyr: boolean; troopers: unknown[] } };
    const frenzy = killer?.frenzy;
    const martyr = victim.player.martyr;
    // The Vendetta loop runs over victim.player.troopers before Martyr deploys anyone.
    vendettaList = victim.player.troopers.slice();
    killerNow = killer;
    try {
      runTrigger.call(this, tr);
    } finally {
      vendettaList = null;
      killerNow = null;
    }
    if (killer != null && killer.frenzy !== frenzy) inc(into, "frenetic boost (replay)");
    if (!martyr && victim.player.martyr) inc(into, "martyr (replay)");
  };
  TP.boost = function (this: unknown, n, show) {
    // Battle.runTrigger(Kill): `for (t of victim.player.troopers) if (t.have(VENDETTA)) t.boost(50, true)`.
    // (Frenetic boosts the killer, Martyr boosts by 150: neither can be counted here.)
    if (vendettaList !== null && this !== killerNow && vendettaList.includes(this) && n === 50 && show) {
      inc(into, "vendetta boost (replay)");
    }
    return boost.call(this, n, show);
  };
  try {
    const actual = new Battle(input).run();
    const e = flattenRecord(expected);
    const a = flattenRecord(actual);
    return { counts: into, same: e.length === a.length && e.every((l, i) => l === a[i]) };
  } finally {
    BP.runTrigger = runTrigger;
    TP.boost = boost;
  }
};

export const mechanicProblems = (
  counts: MechanicCounts,
  unreached: ReadonlyMap<string, string> = UNREACHED_DOCUMENTED,
): string[] =>
  expectedMechanics()
    .filter((m) => !unreached.has(m) && (counts.get(m) ?? 0) < MIN_FIRES)
    .map((m) => `mechanic "${m}" fired ${counts.get(m) ?? 0} times (< ${MIN_FIRES})`);
