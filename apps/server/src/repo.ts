import type { DatabaseSync } from "node:sqlite";
import { Data, type BattleTrooperInput, type TrooperPref } from "@mt/engine";

/** All SQL of the game tables lives here; routes and views only see these typed rows. */

export interface ArmyRow {
  id: number;
  host: string;
  name: string;
  part: number;
  faction: number;
  credits: number;
  recruiterId: number | null;
  createdAt: number;
  createdIp: string | null;
  passwordHash: string | null;
  isFaction: boolean;
}

export interface TrooperRow {
  id: number;
  armyId: number;
  /** 0-based position in the army; also the trooper id in the client grid (`/t/<slot>`). */
  slot: number;
  seed: number;
  name: string;
  renamed: boolean;
  choices: number[];
  pendingLevelup: string | null;
  pref: TrooperPref | null;
  /** Equipment left aside (re-equip), null when never computed. */
  leftOver: number[] | null;
}

type Raw = Record<string, unknown>;

const armyOf = (r: Raw): ArmyRow => ({
  id: r.id as number,
  host: r.host as string,
  name: r.name as string,
  part: r.part as number,
  faction: r.faction as number,
  credits: r.credits as number,
  recruiterId: (r.recruiter_id as number | null) ?? null,
  createdAt: r.created_at as number,
  createdIp: (r.created_ip as string | null) ?? null,
  passwordHash: (r.password_hash as string | null) ?? null,
  isFaction: r.is_faction === 1,
});

const trooperOf = (r: Raw): TrooperRow => ({
  id: r.id as number,
  armyId: r.army_id as number,
  slot: r.slot as number,
  seed: r.seed as number,
  name: r.name as string,
  renamed: r.renamed === 1,
  choices: JSON.parse(r.choices as string) as number[],
  pendingLevelup: (r.pending_levelup as string | null) ?? null,
  pref: r.pref === null ? null : (JSON.parse(r.pref as string) as TrooperPref),
  leftOver: r.left_over === null ? null : (JSON.parse(r.left_over as string) as number[]),
});

export function armyByHost(db: DatabaseSync, host: string): ArmyRow | null {
  const r = db.prepare("SELECT * FROM armies WHERE host = ?").get(host);
  return r ? armyOf(r) : null;
}

export function armyById(db: DatabaseSync, id: number): ArmyRow | null {
  const r = db.prepare("SELECT * FROM armies WHERE id = ?").get(id);
  return r ? armyOf(r) : null;
}

export function troopersOf(db: DatabaseSync, armyId: number): TrooperRow[] {
  return db.prepare("SELECT * FROM troopers WHERE army_id = ? ORDER BY slot").all(armyId).map(trooperOf);
}

/** Number of armies recruited through this army's link. */
export function recruitCount(db: DatabaseSync, armyId: number): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM armies WHERE recruiter_id = ?").get(armyId) as { n: number }).n);
}

/** A trooper as the engine and the client SWF see it. `leftOver` (when stored) is merged into the pref. */
export function trooperInput(t: TrooperRow): BattleTrooperInput {
  let pref: TrooperPref | null = t.pref;
  if (t.leftOver !== null) {
    const base = pref ?? Data.defaultPref();
    pref = { ...base, leftOver: t.leftOver.slice() } as TrooperPref;
  }
  return { id: t.slot, name: t.name, seed: t.seed, type: 0, choices: t.choices.slice(), force: [], pref };
}

export interface NewArmy {
  host: string;
  name: string;
  part: number;
  faction: number;
  credits: number;
  recruiterId: number | null;
  createdIp: string;
  now: number;
  /** First trooper (the chosen daily offer). */
  trooper: { seed: number; name: string };
  /** Max armies created per IP per game day. */
  maxPerIp: number;
  /** Game day of an instant (dayKey in the game time zone). */
  dayOf: (ms: number) => string;
}

export type CreateResult = { ok: true; army: ArmyRow } | { ok: false; reason: "taken" | "limit" };

/**
 * Creates an army and its first trooper atomically. The host UNIQUE constraint is the last word on duplicates
 * (double submission, concurrent creation); the per-IP daily limit is counted inside the same transaction.
 */
export function createArmy(db: DatabaseSync, p: NewArmy): CreateResult {
  db.exec("BEGIN IMMEDIATE");
  let open = true;
  try {
    if (armyByHost(db, p.host)) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "taken" };
    }
    const recent = db
      .prepare("SELECT created_at FROM armies WHERE created_ip = ? AND created_at >= ?")
      .all(p.createdIp, p.now - 2 * 86_400_000) as { created_at: number }[];
    const today = p.dayOf(p.now);
    if (recent.filter((r) => p.dayOf(r.created_at) === today).length >= p.maxPerIp) {
      db.exec("ROLLBACK");
      return { ok: false, reason: "limit" };
    }
    const id = Number(
      db
        .prepare("INSERT INTO armies(host, name, part, faction, credits, recruiter_id, created_at, created_ip) VALUES (?,?,?,?,?,?,?,?)")
        .run(p.host, p.name, p.part, p.faction, p.credits, p.recruiterId, p.now, p.createdIp).lastInsertRowid,
    );
    db.prepare("INSERT INTO troopers(army_id, slot, seed, name) VALUES (?, 0, ?, ?)").run(id, p.trooper.seed, p.trooper.name);
    db.exec("COMMIT");
    open = false;
    return { ok: true, army: armyById(db, id)! };
  } catch (e) {
    if (open) db.exec("ROLLBACK");
    if (/UNIQUE/i.test(String(e))) return { ok: false, reason: "taken" };
    throw e;
  }
}

export interface DayBattle {
  /** 1-based number of the battle of the day (`/b/view/bat<n>`). */
  n: number;
  win: boolean;
}

/**
 * Battles the army attacked today, oldest first. `winner` is the winning side index of the stored BattleInput;
 * the army won when that is its `attackerSide`. An unreadable input counts as a defeat.
 */
export function battlesOfDay(db: DatabaseSync, armyId: number, day: string): DayBattle[] {
  const rows = db
    .prepare("SELECT input, winner FROM battles WHERE attacker_id = ? AND day = ? AND kind = 'battle' ORDER BY id")
    .all(armyId, day) as { input: string; winner: number | null }[];
  return rows.map((r, i) => {
    let side: unknown;
    try {
      side = (JSON.parse(r.input) as { attackerSide?: unknown }).attackerSide;
    } catch {
      side = undefined;
    }
    return { n: i + 1, win: r.winner !== null && r.winner === side };
  });
}

export function trooperBySlot(db: DatabaseSync, armyId: number, slot: number): TrooperRow | null {
  const r = db.prepare("SELECT * FROM troopers WHERE army_id = ? AND slot = ?").get(armyId, slot);
  return r ? trooperOf(r) : null;
}

/** Runs `fn` in a BEGIN IMMEDIATE transaction: committed when it returns a non-null value, rolled back on null or error. */
function immediate<T>(db: DatabaseSync, fn: () => T | null): T | null {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec(r === null ? "ROLLBACK" : "COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export type StartLevelUp = "started" | "pending" | "poor" | "max" | "gone";

/**
 * Pays the next level-up of a trooper and marks it pending, atomically: a second call (reload, double click,
 * concurrent request) finds the pending mark and debits nothing. `costOf(choicesLength)` is null when the trooper cannot level up.
 */
export function startLevelUp(db: DatabaseSync, armyId: number, slot: number, costOf: (choicesLength: number) => number | null): StartLevelUp {
  let out: StartLevelUp = "gone";
  immediate(db, () => {
    const t = trooperBySlot(db, armyId, slot);
    if (!t) return null;
    if (t.pendingLevelup !== null) return (out = "pending"), null;
    const cost = costOf(t.choices.length);
    if (cost === null) return (out = "max"), null;
    const paid = db.prepare("UPDATE armies SET credits = credits - ? WHERE id = ? AND credits >= ?").run(cost, armyId, cost);
    if (Number(paid.changes) !== 1) return (out = "poor"), null;
    db.prepare("UPDATE troopers SET pending_levelup = ? WHERE id = ?").run(String(t.choices.length), t.id);
    return (out = "started");
  });
  return out;
}

export interface LevelUpDone {
  choices: number[];
  /** New leftOver (null: leave the column alone). */
  leftOver: number[] | null;
  notice: unknown;
}

/**
 * Applies the choice of a paid level-up. `decide` sees the trooper as stored (with its pending mark) and returns
 * the new state, or null to refuse. The pending mark is cleared in the same statement, so a replay finds "none".
 */
export function finishLevelUp(db: DatabaseSync, armyId: number, slot: number, decide: (t: TrooperRow) => LevelUpDone | null): "done" | "none" | "bad" {
  let out: "done" | "none" | "bad" = "none";
  immediate(db, () => {
    const t = trooperBySlot(db, armyId, slot);
    if (!t || t.pendingLevelup !== String(t.choices.length)) return null;
    const d = decide(t);
    if (!d) return (out = "bad"), null;
    db.prepare("UPDATE troopers SET choices = ?, pending_levelup = NULL, left_over = COALESCE(?, left_over) WHERE id = ?").run(
      JSON.stringify(d.choices),
      d.leftOver === null ? null : JSON.stringify(d.leftOver),
      t.id,
    );
    db.prepare("INSERT INTO notices(army_id, data) VALUES (?, ?)").run(armyId, JSON.stringify(d.notice));
    return (out = "done");
  });
  return out;
}

/** Pending popups of an army, oldest first, removed as they are read. */
export function takeNotices(db: DatabaseSync, armyId: number): unknown[] {
  return (
    immediate(db, () => {
      const rows = db.prepare("SELECT id, data FROM notices WHERE army_id = ? ORDER BY id").all(armyId) as { id: number; data: string }[];
      db.prepare("DELETE FROM notices WHERE army_id = ?").run(armyId);
      return rows.map((r) => JSON.parse(r.data) as unknown);
    }) ?? []
  );
}

/** Renames a trooper once. False when it was already renamed (or does not exist). */
export function renameTrooper(db: DatabaseSync, armyId: number, slot: number, name: string): boolean {
  return Number(db.prepare("UPDATE troopers SET name = ?, renamed = 1 WHERE army_id = ? AND slot = ? AND renamed = 0").run(name, armyId, slot).changes) === 1;
}

/** Stores the AI preferences (and, when given, the leftOver set) of a trooper. */
export function saveTrooperPref(db: DatabaseSync, trooperId: number, pref: TrooperPref, leftOver?: number[]): void {
  db.prepare("UPDATE troopers SET pref = ?, left_over = COALESCE(?, left_over) WHERE id = ?").run(
    JSON.stringify({ ...pref, leftOver: [] }),
    leftOver === undefined ? null : JSON.stringify(leftOver),
    trooperId,
  );
}

export type AddTrooper = { ok: true } | { ok: false; reason: "full" | "poor" | "dup" };

/**
 * Buys a trooper: the slot is the current count, the price is `costOf(count)` (null when full). Count, funds and
 * duplicate seed are checked inside the transaction, so a double submission buys once.
 */
export function addTrooper(db: DatabaseSync, armyId: number, t: { seed: number; name: string }, costOf: (count: number) => number | null): AddTrooper {
  let out: AddTrooper = { ok: false, reason: "full" };
  try {
    immediate(db, () => {
      const rows = troopersOf(db, armyId);
      if (rows.some((r) => r.seed === t.seed)) return (out = { ok: false, reason: "dup" }), null;
      const cost = costOf(rows.length);
      if (cost === null) return (out = { ok: false, reason: "full" }), null;
      const paid = db.prepare("UPDATE armies SET credits = credits - ? WHERE id = ? AND credits >= ?").run(cost, armyId, cost);
      if (Number(paid.changes) !== 1) return (out = { ok: false, reason: "poor" }), null;
      db.prepare("INSERT INTO troopers(army_id, slot, seed, name) VALUES (?, ?, ?, ?)").run(armyId, rows.length, t.seed, t.name);
      return (out = { ok: true });
    });
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return { ok: false, reason: "dup" };
    throw e;
  }
  return out;
}
