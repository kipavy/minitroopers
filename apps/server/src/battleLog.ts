import { createHash } from "node:crypto";
import { Data, HitEvent, type BattleInput, type HxEnum } from "@mt/engine";
import { Battle } from "@mt/engine/internal";

/**
 * A styled piece of a log line (drawn by public/js/player.js): plain text, or
 * - `n`: a trooper's name, `f` its army's faction (0..5), `u` "rat" or "clown" for those units (head icon);
 * - `a`: an army's name, `f` its faction;
 * - `w`: a weapon, `i` its icon (cell of /img/skills.png) when it has one;
 * - `k`: a skill or an order, `i` its icon;
 * - `v`: a vehicle; `xy`: board coordinates; `d`: a damage amount; `f`: a critical hit; `p`: a status;
 * - `x`: a death; `h`: the HUD of an army [troopers left, troopers per wave, radio range, sabotage %].
 */
export type Seg =
  | string
  | { n: string; f: number; u?: "rat" | "clown" }
  | { a: string; f: number }
  | { w: string; i?: number }
  | { k: string; i?: number }
  | { v: string }
  | { xy: [number, number] }
  | { d: number }
  | { f: string }
  | { p: string }
  | { x: string }
  | { h: [number, number, number, number] };

/** One line of the French battle log; `i` is the index of the `Battle.history` entry it describes. */
export interface LogLine {
  i: number;
  /** Wave number: 0 before the first `NewWave`, then 1, 2... (the `NewWave` line itself carries the new number). */
  w: number;
  /** Short French sentence (the segments' text); empty for purely technical entries (kept so indexes still align). */
  t: string;
  /** Battle clock at this entry: the highest entry time so far (the SWF's clock never goes back), at least 0. */
  c: number;
  /** 1 when the entry's own time is below the clock: played "in advance" (vehicle starts, On point...). */
  x?: 1;
  /** `t` as styled segments; absent when `t` is empty. */
  s?: Seg[];
}

/** The plain text of a segment. */
export function segPlain(s: Seg): string {
  if (typeof s === "string") return s;
  if ("n" in s) return s.n;
  if ("a" in s) return s.a;
  if ("w" in s) return s.w;
  if ("k" in s) return s.k;
  if ("v" in s) return s.v;
  if ("xy" in s) return `(${s.xy[0]}, ${s.xy[1]})`;
  if ("d" in s) return String(s.d);
  if ("f" in s) return s.f;
  if ("p" in s) return s.p;
  if ("x" in s) return s.x;
  const [pool, dep, com, sab] = s.h;
  return hudText(pool, dep, com, sab);
}

const two = (n: number): string => String(Math.max(0, n)).padStart(2, "0");
/** As the SWF's panel: troopers left and per wave when some are left, radio range when there is one, sabotage. */
const hudText = (pool: number, dep: number, com: number, sab: number): string =>
  [...(pool > 0 ? [two(pool), `+${two(dep)}`] : []), ...(com > 0 ? [String(com)] : []), `${sab}%`].join(" ");

interface Hit {
  tid: number;
  dmg: number;
  type: number;
  events: unknown[];
}

interface Merged {
  tid: number;
  dmg: number;
  miss: boolean;
  crit: boolean;
}

const DAMAGE_MISS = 9;
const TROOPER_PUPPET = 1;
const TROOPER_RAT = 2;
const CRITICAL = HitEvent.CRITICAL.index;
/** Weapons 2..30 are the skills REVOLVER (9)..KNIFE (37): their icon is that skill's cell of /img/skills.png. */
const WEAPON_SKILL_FIRST = 2;
const WEAPON_SKILL_LAST = 30;
const WEAPON_SKILL_OFFSET = 7;
/** French vehicle names (Data.VEHICULE has none; 2, 3, 4 and 7 are those of their skills). */
const VEHICLES = ["Moto", "Jeep", "Tank léger", "Hélicoptère", "Tank lourd", "Artillerie", "Lance-missiles", "Avion de chasse"];

const isEnum = (v: unknown): v is HxEnum => typeof v === "object" && v !== null && "index" in v && "params" in v;
const isHit = (v: unknown): v is Hit =>
  typeof v === "object" && v !== null && typeof (v as Hit).tid === "number" && typeof (v as Hit).dmg === "number";
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const hitList = (v: unknown): Hit[] => (Array.isArray(v) ? v.filter(isHit) : []);
const one = (v: unknown): Hit[] => (isHit(v) ? [v] : []);

const dmgUnit = (n: number): string => ` dégât${n > 1 ? "s" : ""}`;
const skillRow = (id: unknown) => Data.SKILL.find((s) => s.id === id);
const skillSeg = (id: unknown): Seg => {
  const row = skillRow(id);
  return row ? { k: row.name, i: row.id } : { k: "une compétence" };
};
const weaponSeg = (id: unknown): Seg | null => {
  const n = num(id);
  const row = n === null ? undefined : Data.WEAPON.find((w) => w.id === n);
  if (!row) return null;
  return row.id >= WEAPON_SKILL_FIRST && row.id <= WEAPON_SKILL_LAST ? { w: row.name, i: row.id + WEAPON_SKILL_OFFSET } : { w: row.name };
};
const vehicleSeg = (id: unknown): Seg | null => {
  const n = num(id);
  return n !== null && VEHICLES[n] ? { v: VEHICLES[n]! } : null;
};
const statusName = (id: unknown): string => Data.STATUS.find((s) => s.id === id)?.name ?? "affecté";
const comName = (id: unknown): string => Data.COMS.find((c) => c.id === id)?.name ?? "ordre";

/** Hits on one target merged: total damage, or a miss when every hit missed. */
function merge(hits: Hit[]): Merged[] {
  const by = new Map<number, Merged>();
  for (const h of hits) {
    const cur = by.get(h.tid) ?? { tid: h.tid, dmg: 0, miss: true, crit: false };
    if (h.type !== DAMAGE_MISS) {
      cur.miss = false;
      cur.dmg += Math.max(0, h.dmg | 0);
    }
    if (h.events.some((e) => isEnum(e) && e.index === CRITICAL)) cur.crit = true;
    by.set(h.tid, cur);
  }
  return [...by.values()];
}

/** Every hit record directly carried by a message's parameters (or lists of them). */
const hitsOf = (m: HxEnum): Hit[] =>
  (m.params ?? []).flatMap((v) => (isHit(v) ? [v] : Array.isArray(v) ? v.filter(isHit) : []));

const joinSegs = (parts: Seg[][], sep: string): Seg[] => parts.flatMap((p, k) => (k ? [sep, ...p] : p));

/** Sets a line's segments and its text. */
function setLine(l: LogLine, s: Seg[]): void {
  const segs = s.filter((x) => x !== "");
  l.t = segs.map(segPlain).join("");
  if (segs.length) l.s = segs;
  else delete l.s;
}

/** Closes a log of a battle without winner: "Match nul" goes on the last entry's line (no extra line). */
export function markStalemate(lines: LogLine[]): void {
  const last = lines[lines.length - 1];
  if (last) setLine(last, [...(last.s ?? (last.t ? [last.t] : [])), ...(last.t ? [". "] : []), "Match nul"]);
}

interface Who {
  name: string;
  type: number;
  side: number;
}

/**
 * The French battle log: one line per `Battle.history` entry of the battle `input` describes, in
 * order, so line `k` matches the SWF's entry `k`. `armyNames` are the names of the armies on side 0
 * and side 1 (the input carries none); without them the winner is named by its side. A stalemate
 * (no winner) ends with "Match nul" on the last entry's line, so the log always has one line per entry.
 */
export function battleLog(input: BattleInput, armyNames?: readonly [string, string]): LogLine[] {
  const b = new Battle(input);
  // Troopers known by id: the input's, plus those the battle creates (rats, clones), cached while alive.
  const known = new Map<number, Who>();
  input.armies.forEach((a, side) => {
    for (const t of a.troopers) known.set(t.id, { name: t.name, type: t.type, side });
  });
  const faction = (side: number): number => {
    const f = input.armies[side === 1 ? 1 : 0].faction | 0;
    return f >= 0 && f <= 5 ? f : 0;
  };
  const nameSeg = (id: unknown): Seg => {
    const n = num(id);
    if (n === null) return "Quelqu'un";
    const data = known.get(n);
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    const unit = data?.type === TROOPER_RAT ? "rat" : data?.type === TROOPER_PUPPET ? "clown" : undefined;
    const text = name || (unit === "rat" ? "Rat" : `Trooper n°${n}`);
    return { n: text, f: faction(data?.side ?? 0), ...(unit ? { u: unit } : {}) };
  };
  const armySeg = (side: unknown): Seg => {
    const s = side === 1 ? 1 : 0;
    return { a: armyNames?.[s] ?? (s === 0 ? "l'armée de gauche" : "l'armée de droite"), f: faction(s) };
  };

  // Weapon in hand and vehicle of every trooper, as of the entry being described.
  const weapon = new Map<number, number>();
  const vehicle = new Map<number, number | null>();
  const snapshot = (): void => {
    for (const t of b.troopers) {
      const id = t.data.id | 0;
      if (t.weap) weapon.set(id, t.weap.data.id);
      vehicle.set(id, t.vehicule ? t.vehicule.data.id : null);
    }
  };
  const handSeg = (tid: unknown): Seg[] => {
    const w = weaponSeg(weapon.get(num(tid) ?? -1));
    return w ? [w] : [];
  };

  const strike = (verb: string, actor: Seg, hits: Hit[], how: Seg[] = []): Seg[] =>
    joinSegs(
      merge(hits).map((m) =>
        m.miss
          ? [actor, " rate ", nameSeg(m.tid), ...paren(how)]
          : [actor, ` ${verb} `, nameSeg(m.tid), ...paren(how), " : ", { d: m.dmg }, dmgUnit(m.dmg), ...(m.crit ? [" ", { f: "coup critique" }] : [])],
      ),
      " ; ",
    );

  const area = (head: Seg[], hits: Hit[]): Seg[] => {
    const touched = merge(hits).filter((m) => !m.miss);
    if (touched.length === 0) return [...head, " : personne n'est touché"];
    return [...head, " : ", ...joinSegs(touched.map((m) => [nameSeg(m.tid), " (", { d: m.dmg }, `${dmgUnit(m.dmg)})`]), ", ")];
  };

  let wave = 0;
  let over = false;
  const describe = (m: HxEnum, tid: unknown): Seg[] => {
    // Whatever the SWF still records after the winner is announced stays silent.
    if (over) return [];
    if (m.index === 34) over = true;
    const p = m.params ?? [];
    const who = nameSeg(tid);
    const id = num(tid) ?? -1;
    switch (m.index) {
      case 1: {
        const infos = Array.isArray(p[0]) ? (p[0] as { data?: { id?: number; name?: string; type?: number }; vh?: number | null; weapId?: number }[]) : [];
        const side = p[1] === 1 ? 1 : 0;
        const list = infos.map((info) => {
          const tId = num(info.data?.id);
          if (tId !== null) {
            if (!known.has(tId)) known.set(tId, { name: String(info.data?.name ?? ""), type: info.data?.type ?? 0, side });
            if (num(info.weapId) !== null) weapon.set(tId, info.weapId!);
            vehicle.set(tId, num(info.vh));
          }
          const v = vehicleSeg(info.vh);
          return [nameSeg(tId), ...(v ? [" (en ", v, ")"] : [])];
        });
        return list.length ? [armySeg(side), " déploie : ", ...joinSegs(list, ", ")] : [];
      }
      case 2: {
        const t = num(p[0]);
        return t === null || t < 0 ? [who, " cherche une cible"] : [who, " vise ", nameSeg(t)];
      }
      case 3:
        return [who, " commence à recharger", ...paren(handSeg(tid))];
      case 4: {
        const n = num(p[0]) ?? 0;
        return [who, ` charge ${n} balle${n > 1 ? "s" : ""}`, ...paren(handSeg(tid))];
      }
      case 5:
        return [who, " finit de recharger", ...paren(handSeg(tid))];
      case 6:
        return [who, " recharge", ...paren(handSeg(tid))];
      case 8:
        return strike("tire sur", who, hitList(p[0]), handSeg(tid));
      case 9: {
        const w = weaponSeg(p[1]);
        return strike("frappe", who, one(p[2]), w ? [w] : []);
      }
      case 10: {
        const w = weaponSeg(p[0]);
        return area([who, " fait exploser ", w ?? "une charge"], hitList(p[3]));
      }
      case 11: {
        const x = num(p[0]);
        const y = num(p[1]);
        return x === null || y === null ? [] : [who, " se déplace en ", { xy: [x, y] }];
      }
      case 12: {
        const n = num(p[1]);
        return [who, " soigne ", nameSeg(p[0]), ...(n !== null && n > 0 ? [` : +${n} PV`] : [])];
      }
      case 13:
        return [who, " soigne ", nameSeg(p[0])];
      case 14:
        return area([who, " lance ", skillSeg(p[0])], hitList(p[3]));
      case 16:
        return [who, " utilise ", skillSeg(p[0]), " !"];
      case 17:
        return [skillSeg(p[0]), " !"];
      case 18:
        return strike("projette", who, one(p[1]));
      case 19:
        return [who, " secourt ", nameSeg(p[0])];
      case 20: {
        const a = p[0];
        if (!isEnum(a)) return [];
        const q = a.params ?? [];
        if (a.index === 0) return [skillSeg(q[0]), " !"];
        if (a.index === 1) return ["Ordre : ", { k: comName(q[0]) }];
        return typeof q[0] === "string" ? [q[0]] : [];
      }
      case 21:
        return area(["Frappe aérienne"], hitList(p[3]));
      case 22:
        return [who, " est ", { p: statusName(p[0]) }];
      case 23:
        return [who, " n'est plus ", { p: statusName(p[0]) }];
      case 24:
        return [who, " utilise sa dernière ", skillSeg(p[0])];
      case 25: {
        const w = weaponSeg(p[0]);
        if (num(p[0]) !== null) weapon.set(id, p[0] as number);
        return w ? [who, " passe à ", w] : [who, " change d'arme"];
      }
      case 26:
        return [who, " ramasse une arme"];
      case 27: {
        const h = one(p[0])[0];
        return h ? [nameSeg(h.tid), " subit ", { d: h.dmg | 0 }, dmgUnit(h.dmg | 0)] : [];
      }
      case 28:
        return [who, " est survolté"];
      case 29:
        return [armySeg(p[0]), " bat en retraite"];
      case 30:
        return [who, " fait de la propagande"];
      case 32:
        return strike("étrangle", who, hitList(p[1]));
      case 34:
        return ["Victoire de ", armySeg(isEnum(p[0]) ? p[0].index : p[0])];
      case 35:
        return strike("frappe", who, hitList(p[0]));
      case 36: {
        const v = vehicleSeg(vehicle.get(id));
        const x = num(p[0]);
        const y = num(p[1]);
        vehicle.set(id, null);
        return [who, " descend du véhicule", ...paren(v ? [v] : []), ...(x !== null && y !== null ? [" en ", { xy: [x, y] } as Seg] : [])];
      }
      case 39:
        return [`Vague ${wave + 1}`];
      case 40: {
        const o = (p[1] ?? {}) as { pool?: unknown; dep?: unknown; com?: unknown; vkd?: unknown };
        return [armySeg(p[0]), " ", { h: [num(o.pool) ?? 0, num(o.dep) ?? 0, num(o.com) ?? 0, num(o.vkd) ?? 0] }];
      }
      default:
        return [];
    }
  };

  // Step the battle like Battle.run(), noticing which troopers die during each step.
  const lines: LogLine[] = [];
  let buried = new Set<number>();
  let done = 0;
  let clock = 0;
  const flush = (): void => {
    const current = new Set(b.graveyard);
    const fresh = [...current].filter((id) => !buried.has(id));
    buried = current;
    const from = done;
    for (; done < b.history.length; done++) {
      const h = b.history[done]!;
      if (h.type.index === 39) wave++;
      const time = h.time | 0;
      const line: LogLine = { i: done, w: wave, t: "", c: Math.max(clock, time) };
      if (time < clock) line.x = 1;
      clock = line.c;
      setLine(line, describe(h.type, h.tid));
      lines.push(line);
    }
    // The death goes on the last line of the step that hit the trooper, else on its last spoken line.
    for (const id of fresh) {
      let at = -1;
      for (let k = lines.length - 1; k >= from && at < 0; k--) {
        if (hitsOf(b.history[k]!.type).some((h) => h.tid === id && h.type !== DAMAGE_MISS)) at = k;
      }
      for (let k = lines.length - 1; k >= from && at < 0; k--) if (lines[k]!.t) at = k;
      if (at >= 0) {
        const l = lines[at]!;
        setLine(l, [...(l.s ?? []), ...(l.t ? [". "] : []), nameSeg(id), { x: " est mort" }]);
      }
    }
  };
  const remember = (): void => {
    for (const t of b.troopers) {
      const id = t.data.id | 0;
      if (!known.has(id)) known.set(id, { name: t.data.name, type: t.data.type, side: t.side });
    }
  };
  remember();
  snapshot();
  while (!b.resolve()) {
    flush();
    remember();
    snapshot();
  }
  flush();
  if (b.winner === null) markStalemate(lines);
  return lines;
}

/** " (" + s + ")", or nothing when s is empty. */
const paren = (s: Seg[]): Seg[] => (s.length ? [" (", ...s, ")"] : []);

const LOG_CACHE_SIZE = 32;
const logCache = new Map<string, LogLine[]>();

/**
 * `battleLog`, memoized by input and army names (a whole simulation per call: ~140 ms for a large battle).
 * Bounded LRU; the returned lines are shared, never mutate them.
 */
export function cachedBattleLog(input: BattleInput, armyNames: readonly [string, string]): LogLine[] {
  const key = createHash("sha256").update(JSON.stringify([input, armyNames])).digest("base64");
  let lines = logCache.get(key);
  if (lines) logCache.delete(key);
  else lines = battleLog(input, armyNames);
  logCache.set(key, lines);
  if (logCache.size > LOG_CACHE_SIZE) logCache.delete(logCache.keys().next().value!);
  return lines;
}
