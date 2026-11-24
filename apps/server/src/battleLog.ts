import { createHash } from "node:crypto";
import { Data, HitEvent, type BattleInput, type HxEnum } from "@mt/engine";
import { Battle } from "@mt/engine/internal";

/** One line of the French battle log; `i` is the index of the `Battle.history` entry it describes. */
export interface LogLine {
  i: number;
  /** Wave number: 0 before the first `NewWave`, then 1, 2... (the `NewWave` line itself carries the new number). */
  w: number;
  /** Short French sentence; empty for purely technical entries (kept so indexes still align). */
  t: string;
}

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
const TROOPER_RAT = 2;
const CRITICAL = HitEvent.CRITICAL.index;

const isEnum = (v: unknown): v is HxEnum => typeof v === "object" && v !== null && "index" in v && "params" in v;
const isHit = (v: unknown): v is Hit =>
  typeof v === "object" && v !== null && typeof (v as Hit).tid === "number" && typeof (v as Hit).dmg === "number";
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const hitList = (v: unknown): Hit[] => (Array.isArray(v) ? v.filter(isHit) : []);
const one = (v: unknown): Hit[] => (isHit(v) ? [v] : []);

const dmgText = (n: number): string => (n <= 0 ? "aucun dégât" : `${n} dégât${n > 1 ? "s" : ""}`);
const skillName = (id: unknown): string => Data.SKILL.find((s) => s.id === id)?.name ?? "une compétence";
const weaponName = (id: unknown): string | null => Data.WEAPON.find((w) => w.id === id)?.name ?? null;
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

/** Closes a log of a battle without winner: "Match nul" goes on the last entry's line (no extra line). */
export function markStalemate(lines: LogLine[]): void {
  const last = lines[lines.length - 1];
  if (last) last.t += `${last.t ? ". " : ""}Match nul`;
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
  const known = new Map<number, { name: string; type: number }>(input.armies.flatMap((a) => a.troopers).map((t) => [t.id, t]));
  const nameOf = (id: unknown): string => {
    const n = num(id);
    if (n === null) return "Quelqu'un";
    const data = known.get(n);
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    if (name) return name;
    return data?.type === TROOPER_RAT ? "Rat" : `Trooper n°${n}`;
  };
  const armyName = (side: unknown): string => {
    const s = side === 1 ? 1 : 0;
    return armyNames?.[s] ?? (s === 0 ? "l'armée de gauche" : "l'armée de droite");
  };

  const strike = (verb: string, actor: string, hits: Hit[]): string =>
    merge(hits)
      .map((m) =>
        m.miss
          ? `${actor} rate ${nameOf(m.tid)}`
          : `${actor} ${verb} ${nameOf(m.tid)} : ${dmgText(m.dmg)}${m.crit ? " (coup critique)" : ""}`,
      )
      .join(" ; ");

  const area = (head: string, hits: Hit[]): string => {
    const touched = merge(hits).filter((m) => !m.miss);
    if (touched.length === 0) return `${head} : personne n'est touché`;
    return `${head} : ${touched.map((m) => `${nameOf(m.tid)} (${dmgText(m.dmg)})`).join(", ")}`;
  };

  let wave = 0;
  let over = false;
  const describe = (m: HxEnum, tid: unknown): string => {
    // Whatever the SWF still records after the winner is announced stays silent.
    if (over) return "";
    if (m.index === 34) over = true;
    const p = m.params ?? [];
    const who = nameOf(tid);
    switch (m.index) {
      case 2: {
        const t = num(p[0]);
        return t === null || t < 0 ? "" : `${who} vise ${nameOf(t)}`;
      }
      case 3:
      case 6:
        return `${who} recharge`;
      case 8:
        return strike("tire sur", who, hitList(p[0]));
      case 9:
        return strike("frappe", who, one(p[2]));
      case 10: {
        const w = weaponName(p[0]);
        return area(`${who} fait exploser ${w ? `son ${w.toLowerCase()}` : "une charge"}`, hitList(p[3]));
      }
      case 12: {
        const n = num(p[1]);
        return `${who} soigne ${nameOf(p[0])}${n !== null && n > 0 ? ` : +${n} PV` : ""}`;
      }
      case 13:
        return `${who} soigne ${nameOf(p[0])}`;
      case 14:
        return area(`${who} lance ${skillName(p[0]).toLowerCase()}`, hitList(p[3]));
      case 16:
        return `${who} utilise ${skillName(p[0])}`;
      case 17:
        return `${skillName(p[0])} !`;
      case 18:
        return strike("projette", who, one(p[1]));
      case 19:
        return `${who} secourt ${nameOf(p[0])}`;
      case 20: {
        const a = p[0];
        if (!isEnum(a)) return "";
        const q = a.params ?? [];
        if (a.index === 0) return `${skillName(q[0])} !`;
        if (a.index === 1) return `Ordre : ${comName(q[0])}`;
        return typeof q[0] === "string" ? q[0] : "";
      }
      case 21:
        return area("Frappe aérienne", hitList(p[3]));
      case 22:
        return `${who} est ${statusName(p[0])}`;
      case 23:
        return `${who} n'est plus ${statusName(p[0])}`;
      case 24:
        return `${who} utilise sa dernière ${skillName(p[0]).toLowerCase()}`;
      case 25: {
        const w = weaponName(p[0]);
        return w ? `${who} passe à : ${w}` : `${who} change d'arme`;
      }
      case 26:
        return `${who} ramasse une arme`;
      case 27: {
        const h = one(p[0])[0];
        return h ? `${nameOf(h.tid)} subit ${dmgText(h.dmg | 0)}` : "";
      }
      case 28:
        return `${who} est survolté`;
      case 29:
        return `${armyName(p[0])} bat en retraite`;
      case 30:
        return `${who} fait de la propagande`;
      case 32:
        return strike("étrangle", who, hitList(p[1]));
      case 34:
        return `Victoire de ${armyName(isEnum(p[0]) ? p[0].index : p[0])}`;
      case 35:
        return strike("frappe", who, hitList(p[0]));
      case 36:
        return `${who} descend de son véhicule`;
      case 39:
        return `Nouvelle vague (${wave})`;
      default:
        return "";
    }
  };

  // Step the battle like Battle.run(), noticing which troopers die during each step.
  const lines: LogLine[] = [];
  let dead = new Set<number>();
  let done = 0;
  const flush = (): void => {
    const current = new Set(b.graveyard);
    const fresh = [...current].filter((id) => !dead.has(id));
    dead = current;
    const from = done;
    for (; done < b.history.length; done++) {
      const h = b.history[done]!;
      if (h.type.index === 39) wave++;
      lines.push({ i: done, w: wave, t: describe(h.type, h.tid) });
    }
    // The death goes on the last line of the step that hit the trooper, else on its last spoken line.
    for (const id of fresh) {
      let at = -1;
      for (let k = lines.length - 1; k >= from && at < 0; k--) {
        if (hitsOf(b.history[k]!.type).some((h) => h.tid === id && h.type !== DAMAGE_MISS)) at = k;
      }
      for (let k = lines.length - 1; k >= from && at < 0; k--) if (lines[k]!.t) at = k;
      if (at >= 0) lines[at]!.t += `${lines[at]!.t ? ". " : ""}${nameOf(id)} est mort`;
    }
  };
  const remember = (): void => {
    for (const t of b.troopers) if (!known.has(t.data.id | 0)) known.set(t.data.id | 0, t.data);
  };
  remember();
  while (!b.resolve()) {
    flush();
    remember();
  }
  flush();
  if (b.winner === null) markStalemate(lines);
  return lines;
}

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
