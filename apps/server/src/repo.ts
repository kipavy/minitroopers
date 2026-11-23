import type { DatabaseSync } from "node:sqlite";
import type { ModeKind } from "./battleInput.ts";
import { MISSION_ATTEMPTS, RAID_MAX_PHASE } from "@mt/game";
import { Data, type BattleInput, type BattleTrooperInput, type TrooperPref } from "@mt/engine";

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
  /** Client id (`cid` cookie) of the browser that created the army. */
  createdCid: string | null;
  /** Missions unlocked (paid once). */
  missionsUnlocked: boolean;
  /** Rats of the next extermination (1 + extermination wins). */
  rats: number;
  /** Epic missions won (the NPC army grows with them). */
  epicWins: number;
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
  createdCid: (r.created_cid as string | null) ?? null,
  missionsUnlocked: r.missions_unlocked === 1,
  rats: Number(r.rats ?? 1),
  epicWins: Number(r.epic_wins ?? 0),
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

/** Recruits of an army not yet confirmed on its /history page (shown as "Nouvelle recrue disponible !"). */
export function pendingRecruits(db: DatabaseSync, recruiterId: number): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM armies WHERE recruiter_id = ? AND recruit_confirmed_at IS NULL").get(recruiterId) as { n: number }).n);
}

/** Recruits whose bounty was credited (confirmed on /history). */
export function confirmedRecruitCount(db: DatabaseSync, recruiterId: number): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM armies WHERE recruiter_id = ? AND recruit_confirmed_at IS NOT NULL").get(recruiterId) as { n: number }).n);
}

/**
 * Confirms every pending recruit of an army and credits the bounties, in one BEGIN IMMEDIATE transaction: a concurrent
 * or repeated call finds nothing pending and credits nothing. `rank` = creation rank among the recruiter's recruits
 * (1-based, pending ones included). UNVERIFIED: a recruit created from the recruiter's own client id (`created_cid`)
 * is confirmed with bounty 0 (anti self-referral); the original's check is unknown.
 */
export function confirmRecruits(db: DatabaseSync, recruiterId: number, now: number, bountyOf: (rank: number) => number): { confirmed: number; credited: number } {
  const r = immediate(db, () => {
    const pending = db.prepare("SELECT id, created_cid FROM armies WHERE recruiter_id = ? AND recruit_confirmed_at IS NULL ORDER BY id").all(recruiterId) as { id: number; created_cid: string | null }[];
    if (pending.length === 0) return null;
    const own = (db.prepare("SELECT created_cid FROM armies WHERE id = ?").get(recruiterId) as { created_cid: string | null } | undefined)?.created_cid ?? null;
    let credited = 0;
    for (const p of pending) {
      const rank = Number((db.prepare("SELECT COUNT(*) AS n FROM armies WHERE recruiter_id = ? AND id <= ?").get(recruiterId, p.id) as { n: number }).n);
      const bounty = own !== null && p.created_cid === own ? 0 : bountyOf(rank);
      db.prepare("UPDATE armies SET recruit_confirmed_at = ?, recruit_bounty = ? WHERE id = ?").run(now, bounty, p.id);
      credited += bounty;
    }
    db.prepare("UPDATE armies SET credits = credits + ? WHERE id = ?").run(credited, recruiterId);
    return { confirmed: pending.length, credited };
  });
  return r ?? { confirmed: 0, credited: 0 };
}

export type RecruitRow = { armyId: number; host: string; name: string; part: number; bounty: number | null; confirmedAt: number | null };

/** Confirmed recruits of an army, most recent first. */
export function recruitsOf(db: DatabaseSync, recruiterId: number, limit: number): RecruitRow[] {
  return db
    .prepare("SELECT id, host, name, part, recruit_bounty, recruit_confirmed_at FROM armies WHERE recruiter_id = ? AND recruit_confirmed_at IS NOT NULL ORDER BY recruit_confirmed_at DESC, id DESC LIMIT ?")
    .all(recruiterId, limit)
    .map((r) => ({ armyId: r.id as number, host: r.host as string, name: r.name as string, part: r.part as number, bounty: (r.recruit_bounty as number | null) ?? null, confirmedAt: (r.recruit_confirmed_at as number | null) ?? null }));
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
  createdCid: string | null;
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
        .prepare("INSERT INTO armies(host, name, part, faction, credits, recruiter_id, created_at, created_ip, created_cid) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(p.host, p.name, p.part, p.faction, p.credits, p.recruiterId, p.now, p.createdIp, p.createdCid).lastInsertRowid,
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

export type StartLevelUp = "started" | "pending" | "poor" | "max" | "stale" | "gone";

/**
 * Pays the next level-up of a trooper and marks it pending, atomically: a second call (reload, double click,
 * concurrent request) finds the pending mark and debits nothing; `level` (choices length the link was issued for) must still match. `costOf(choicesLength)` is null when the trooper cannot level up.
 */
export function startLevelUp(db: DatabaseSync, armyId: number, slot: number, level: number, costOf: (choicesLength: number) => number | null): StartLevelUp {
  let out: StartLevelUp = "gone";
  immediate(db, () => {
    const t = trooperBySlot(db, armyId, slot);
    if (!t) return null;
    if (t.pendingLevelup !== null) return (out = "pending"), null;
    if (t.choices.length !== level) return (out = "stale"), null; // the URL was issued for another level
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

/**
 * Re-equip, atomically against the stored trooper: `decide` sees it as stored (no pending level-up) and returns the
 * new pref and leftOver, or null for no change. A concurrent level-up cannot interleave (BEGIN IMMEDIATE).
 */
export function reequipTrooper(db: DatabaseSync, armyId: number, slot: number, decide: (t: TrooperRow) => { pref: TrooperPref; leftOver: number[] } | null): boolean {
  return (
    immediate(db, () => {
      const t = trooperBySlot(db, armyId, slot);
      const d = t && t.pendingLevelup === null ? decide(t) : null;
      if (!t || !d) return null;
      saveTrooperPref(db, t.id, d.pref, d.leftOver);
      return true;
    }) !== null
  );
}

/** Power of every army that has at least one trooper: Σ (5 + choices), like `armyPower`. */
export function armyPowers(db: DatabaseSync): { id: number; power: number }[] {
  return (
    db
      .prepare("SELECT army_id AS id, SUM(5 + json_array_length(choices)) AS power FROM troopers GROUP BY army_id ORDER BY army_id")
      .all() as { id: number; power: number }[]
  ).map((r) => ({ id: Number(r.id), power: Number(r.power) }));
}

/** Today's opponent list of an army, null when not drawn yet. */
export function dayOpponents<T>(db: DatabaseSync, armyId: number, day: string): T[] | null {
  const r = db.prepare("SELECT opponents FROM daily WHERE army_id = ? AND day = ?").get(armyId, day) as { opponents: string | null } | undefined;
  return r?.opponents ? (JSON.parse(r.opponents) as T[]) : null;
}

/** The day's opponents, drawn by `pick` the first time and frozen in `daily.opponents` (the first draw wins a race). */
export function freezeOpponents<T>(db: DatabaseSync, armyId: number, day: string, pick: () => T[]): T[] {
  const have = dayOpponents<T>(db, armyId, day);
  if (have) return have;
  db.prepare(
    "INSERT INTO daily(army_id, day, opponents) VALUES (?, ?, ?) ON CONFLICT(army_id, day) DO UPDATE SET opponents = COALESCE(daily.opponents, excluded.opponents)",
  ).run(armyId, day, JSON.stringify(pick()));
  return dayOpponents<T>(db, armyId, day)!;
}

/** Battles (kind 'battle') an army attacked on `day`. */
export function battlesUsed(db: DatabaseSync, armyId: number, day: string): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM battles WHERE attacker_id = ? AND day = ? AND kind = 'battle'").get(armyId, day) as { n: number }).n);
}

export interface BattleRow {
  id: number;
  day: string;
  attackerId: number;
  defenderId: number | null;
  defenderRef: string | null;
  input: BattleInput;
  winner: number | null;
  seen: boolean;
  /** 'battle', 'mission' or 'raid'. */
  kind: string;
  /** Mission type or "raid" (null for daily battles). */
  mode: string | null;
  /** Raid phase (null otherwise). */
  phase: number | null;
}

const battleOf = (r: Raw): BattleRow => ({
  id: r.id as number,
  day: r.day as string,
  attackerId: r.attacker_id as number,
  defenderId: (r.defender_id as number | null) ?? null,
  defenderRef: (r.defender_ref as string | null) ?? null,
  input: JSON.parse(r.input as string) as BattleInput,
  winner: (r.winner as number | null) ?? null,
  seen: r.seen === 1,
  kind: r.kind as string,
  mode: (r.mode as string | null) ?? null,
  phase: (r.phase as number | null) ?? null,
});

export function battleById(db: DatabaseSync, id: number): BattleRow | null {
  const r = db.prepare("SELECT * FROM battles WHERE id = ? AND kind = 'battle'").get(id);
  return r ? battleOf(r) : null;
}

/** The `n`-th (1-based) battle an army attacked on `day`, as numbered by `battlesOfDay`. */
export function battleOfDay(db: DatabaseSync, armyId: number, day: string, n: number): BattleRow | null {
  if (!Number.isInteger(n) || n < 1) return null;
  const r = db.prepare("SELECT * FROM battles WHERE attacker_id = ? AND day = ? AND kind = 'battle' ORDER BY id LIMIT 1 OFFSET ?").get(armyId, day, n - 1);
  return r ? battleOf(r) : null;
}

/** Marks the battle as seen by its attacker. True only for the first call. */
export function markSeen(db: DatabaseSync, id: number): boolean {
  return Number(db.prepare("UPDATE battles SET seen = 1 WHERE id = ? AND seen = 0").run(id).changes) === 1;
}

/** The `opp` an attack was made for, as stored on its battle (null for other kinds). */
export function battleOppOfDay(db: DatabaseSync, armyId: number, day: string, n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return null;
  const r = db.prepare("SELECT opp FROM battles WHERE attacker_id = ? AND day = ? AND kind = 'battle' ORDER BY id LIMIT 1 OFFSET ?").get(armyId, day, n - 1) as { opp: string | null } | undefined;
  return r?.opp ?? null;
}

/**
 * Deletes an army (admin, abuse). Its own battles, troopers, daily rows, sessions and notices go with it (cascades);
 * battles it defended stay for their attackers with `defender_ref = 'gone:<name>'`; armies it recruited lose their recruiter.
 * A faction army is never deleted (false), nor an unknown id.
 */
export function deleteArmy(db: DatabaseSync, armyId: number): boolean {
  return immediate(db, () => (deleteArmyTx(db, armyId) ? true : null)) === true;
}

/** deleteArmy's body, for a caller already inside a transaction. */
function deleteArmyTx(db: DatabaseSync, armyId: number): boolean {
  const a = db.prepare("SELECT name, is_faction FROM armies WHERE id = ?").get(armyId) as { name: string; is_faction: number } | undefined;
  if (!a || a.is_faction === 1) return false;
  db.prepare("UPDATE battles SET defender_ref = ? WHERE defender_id = ?").run(`gone:${a.name}`, armyId);
  db.prepare("DELETE FROM armies WHERE id = ?").run(armyId);
  return true;
}

export interface NewBattle {
  defenderId: number | null;
  defenderRef: string | null;
  input: BattleInput;
  winner: number | null;
  reward: number;
}

export type FightResult =
  | { ok: true; id: number; n: number }
  | { ok: false; reason: "stale"; used: number }
  | { ok: false; reason: "limit" }
  | { ok: false; reason: "refused"; code: string };

/**
 * Fights one daily battle atomically (BEGIN IMMEDIATE). `used` is the number of battles of the day the action URL was
 * issued for: a replay (reload, double click, concurrent request) finds a different count and fights nothing ("stale").
 * Then the day's allowance is checked and `decide` (run inside the transaction, so it reads the armies as stored)
 * builds and resolves the battle, or returns an error code. The battle row, the reward and the daily counter are
 * written together.
 */
export function fight(
  db: DatabaseSync,
  p: { armyId: number; day: string; used: number; opp: string | null; allowance: () => number; decide: () => NewBattle | string },
): FightResult {
  let out: FightResult = { ok: false, reason: "limit" };
  immediate(db, () => {
    const used = battlesUsed(db, p.armyId, p.day);
    if (used !== p.used) return (out = { ok: false, reason: "stale", used }), null;
    if (used >= p.allowance()) return (out = { ok: false, reason: "limit" }), null;
    const d = p.decide();
    if (typeof d === "string") return (out = { ok: false, reason: "refused", code: d }), null;
    const id = Number(
      db
        .prepare("INSERT INTO battles(day, attacker_id, defender_id, defender_ref, input, winner, kind, opp) VALUES (?, ?, ?, ?, ?, ?, 'battle', ?)")
        .run(p.day, p.armyId, d.defenderId, d.defenderRef, JSON.stringify(d.input), d.winner, p.opp).lastInsertRowid,
    );
    db.prepare("UPDATE armies SET credits = credits + ? WHERE id = ?").run(d.reward, p.armyId);
    db.prepare(
      "INSERT INTO daily(army_id, day, battles_used) VALUES (?, ?, ?) ON CONFLICT(army_id, day) DO UPDATE SET battles_used = excluded.battles_used",
    ).run(p.armyId, p.day, used + 1);
    return (out = { ok: true, id, n: used + 1 });
  });
  return out;
}

/** A complete army written by the admin CLI (faction armies, prepared armies). `troopers[i]` goes to slot i. */
export interface ArmySeed {
  host: string;
  name: string;
  part: number;
  faction: number;
  credits: number;
  isFaction: boolean;
  passwordHash: string | null;
  now: number;
  /** Extermination progress (`armies.rats`, default 1) and whether missions are already unlocked (admin only). */
  rats?: number;
  missionsUnlocked?: boolean;
  /** Admin `--force`: delete the army already at this host first (not a faction army: null), in the same transaction. */
  replace?: boolean;
  troopers: { seed: number; name: string; choices: number[]; leftOver: number[] | null }[];
}

/** Inserts an army and all its troopers atomically. Null when the host is already taken. */
export function insertArmy(db: DatabaseSync, a: ArmySeed): ArmyRow | null {
  try {
    return immediate(db, () => {
      const old = armyByHost(db, a.host);
      if (old && (!a.replace || !deleteArmyTx(db, old.id))) return null;
      const id = Number(
        db
          .prepare("INSERT INTO armies(host, name, part, faction, credits, created_at, password_hash, is_faction, rats, missions_unlocked) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(a.host, a.name, a.part, a.faction, a.credits, a.now, a.passwordHash, a.isFaction ? 1 : 0, a.rats ?? 1, a.missionsUnlocked ? 1 : 0).lastInsertRowid,
      );
      const ins = db.prepare("INSERT INTO troopers(army_id, slot, seed, name, choices, left_over) VALUES (?, ?, ?, ?, ?, ?)");
      a.troopers.forEach((t, slot) => ins.run(id, slot, t.seed, t.name, JSON.stringify(t.choices), t.leftOver === null ? null : JSON.stringify(t.leftOver)));
      return armyById(db, id);
    });
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return null;
    throw e;
  }
}

/** Adds `amount` (may be negative) to an army's credits, never below 0. Returns the new balance, null for no such army. */
export function addCredits(db: DatabaseSync, armyId: number, amount: number): number | null {
  const r = db.prepare("UPDATE armies SET credits = MAX(0, credits + ?) WHERE id = ? RETURNING credits").get(amount, armyId) as { credits: number } | undefined;
  return r ? Number(r.credits) : null;
}

export interface ArmySummary {
  army: ArmyRow;
  troopers: number;
  /** Σ (5 + choices), like `armyPower`. */
  power: number;
}

/** Every army with its trooper count and power, by id. */
export function armySummaries(db: DatabaseSync): ArmySummary[] {
  const rows = db
    .prepare(
      "SELECT a.*, COUNT(t.id) AS n_troopers, COALESCE(SUM(5 + json_array_length(t.choices)), 0) AS power FROM armies a LEFT JOIN troopers t ON t.army_id = a.id GROUP BY a.id ORDER BY a.id",
    )
    .all();
  return rows.map((r) => ({ army: armyOf(r), troopers: Number(r.n_troopers), power: Number(r.power) }));
}

/** Stores the army password hash and signs the army out of every session but `keepKey`'s (null: of all of them). */
export function setPassword(db: DatabaseSync, armyId: number, hash: string, keepKey: string | null = null): void {
  immediate(db, () => {
    db.prepare("UPDATE armies SET password_hash = ? WHERE id = ?").run(hash, armyId);
    db.prepare("UPDATE sessions SET army_id = NULL WHERE army_id = ? AND key IS NOT ?").run(armyId, keepKey);
    db.prepare("INSERT INTO notices(army_id, data) VALUES (?, ?)").run(armyId, JSON.stringify({ text: "Ton mot de passe a été enregistré." }));
    return true;
  });
}

// ---- missions (and the shared shape of mode battles, used by raids too) -----------------------------------------

/** Today's mission state of an army (defaults when the day has no row yet). */
export interface MissionDay {
  /** Mission type frozen for the day, null before the first visit. */
  type: string | null;
  /** Tries made today. */
  used: number;
  won: boolean;
  /** Frozen opponent: army id or filler id (infiltrate), `npc:<seed>` (epic); null before the first try. */
  target: string | null;
}

export function missionDay(db: DatabaseSync, armyId: number, day: string): MissionDay {
  const r = db.prepare("SELECT missions_used, mission_won, mission_type, mission_target FROM daily WHERE army_id = ? AND day = ?").get(armyId, day) as
    | { missions_used: number; mission_won: number; mission_type: string | null; mission_target: string | null }
    | undefined;
  return { type: r?.mission_type ?? null, used: Number(r?.missions_used ?? 0), won: r?.mission_won === 1, target: r?.mission_target ?? null };
}

/** The day's mission type, drawn by `pick` the first time and frozen in `daily.mission_type` (the first draw wins a race). */
export function freezeMissionType(db: DatabaseSync, armyId: number, day: string, pick: () => string): string {
  const have = missionDay(db, armyId, day).type;
  if (have !== null) return have;
  db.prepare(
    "INSERT INTO daily(army_id, day, mission_type) VALUES (?, ?, ?) ON CONFLICT(army_id, day) DO UPDATE SET mission_type = COALESCE(daily.mission_type, excluded.mission_type)",
  ).run(armyId, day, pick());
  return missionDay(db, armyId, day).type!;
}

/** Freezes the day's mission opponent (call inside the fight transaction). */
export function setMissionTarget(db: DatabaseSync, armyId: number, day: string, target: string): void {
  db.prepare("INSERT INTO daily(army_id, day, mission_target) VALUES (?, ?, ?) ON CONFLICT(army_id, day) DO UPDATE SET mission_target = excluded.mission_target").run(
    armyId,
    day,
    target,
  );
}

/** Armies this army has fought: the defenders of its battles and the attackers of the battles it defended (ids as strings). */
export function foughtArmies(db: DatabaseSync, armyId: number): string[] {
  return (
    db
      .prepare("SELECT defender_id AS id FROM battles WHERE attacker_id = ? AND defender_id IS NOT NULL UNION SELECT attacker_id AS id FROM battles WHERE defender_id = ?")
      .all(armyId, armyId) as { id: number }[]
  ).map((r) => String(r.id));
}

/** First trooper of every confirmed recruit of an army (recruits in creation order). */
export function recruitLeaders(db: DatabaseSync, recruiterId: number): TrooperRow[] {
  return db
    .prepare("SELECT t.* FROM armies a JOIN troopers t ON t.army_id = a.id AND t.slot = 0 WHERE a.recruiter_id = ? AND a.recruit_confirmed_at IS NOT NULL ORDER BY a.id")
    .all(recruiterId)
    .map(trooperOf);
}

/** Pays the mission unlock once: a second call (reload, concurrent request) finds it unlocked and debits nothing. */
export function unlockMissions(db: DatabaseSync, armyId: number, cost: number): "ok" | "already" | "poor" {
  let out: "ok" | "already" | "poor" = "poor";
  immediate(db, () => {
    const a = armyById(db, armyId);
    if (!a) return null;
    if (a.missionsUnlocked) return (out = "already"), null;
    const paid = db.prepare("UPDATE armies SET credits = credits - ?, missions_unlocked = 1 WHERE id = ? AND credits >= ?").run(cost, armyId, cost);
    if (Number(paid.changes) !== 1) return (out = "poor"), null;
    return (out = "ok");
  });
  return out;
}

/** A mission or raid battle to store: `mode` and, for raids, the recruits killed (army ids of the recruits). */
export type NewModeBattle = NewBattle & { mode: ModeKind; phase?: number; dead?: number[] };

export type ModeResult =
  | { ok: true; id: number; n: number }
  | { ok: false; reason: "stale" | "limit" | "locked" | "won"; used: number }
  | { ok: false; reason: "refused"; code: string };

/** Writes a mission or raid battle and credits its reward (call inside the fight transaction). Returns the battle id. */
function insertModeBattle(db: DatabaseSync, p: { armyId: number; day: string; kind: "mission" | "raid"; phase?: number }, d: NewModeBattle): number {
  const id = Number(
    db
      .prepare("INSERT INTO battles(day, attacker_id, defender_id, defender_ref, input, winner, kind, mode, phase) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(p.day, p.armyId, d.defenderId, d.defenderRef, JSON.stringify(d.input), d.winner, p.kind, d.mode, p.phase ?? null).lastInsertRowid,
  );
  db.prepare("UPDATE armies SET credits = credits + ? WHERE id = ?").run(d.reward, p.armyId);
  return id;
}

/**
 * One try of the mission of the day, atomically (BEGIN IMMEDIATE), like `fight`: refused when the missions are not
 * unlocked; `used` (tries the URL was issued for) must match the stored count ("stale" otherwise: replays fight
 * nothing); refused after a won mission or the last try. `decide` (inside the transaction) builds and resolves the
 * battle. The battle (kind 'mission'), the reward, the daily counters and the win effects (exterminate: one more
 * rat; epic: one more epic win) are written together.
 */
export function fightMission(db: DatabaseSync, p: { armyId: number; day: string; used: number; decide: () => NewModeBattle | string }): ModeResult {
  let out: ModeResult = { ok: false, reason: "locked", used: 0 };
  immediate(db, () => {
    const a = armyById(db, p.armyId);
    const m = missionDay(db, p.armyId, p.day);
    if (!a || !a.missionsUnlocked) return (out = { ok: false, reason: "locked", used: m.used }), null;
    if (m.used !== p.used) return (out = { ok: false, reason: "stale", used: m.used }), null;
    if (m.won) return (out = { ok: false, reason: "won", used: m.used }), null;
    if (m.used >= MISSION_ATTEMPTS) return (out = { ok: false, reason: "limit", used: m.used }), null;
    const d = p.decide();
    if (typeof d === "string") return (out = { ok: false, reason: "refused", code: d }), null;
    const win = d.winner !== null && d.winner === d.input.attackerSide;
    const id = insertModeBattle(db, { armyId: p.armyId, day: p.day, kind: "mission" }, d);
    if (win && d.mode === "exterminate") db.prepare("UPDATE armies SET rats = rats + 1 WHERE id = ?").run(p.armyId);
    if (win && d.mode === "epic") db.prepare("UPDATE armies SET epic_wins = epic_wins + 1 WHERE id = ?").run(p.armyId);
    db.prepare(
      "INSERT INTO daily(army_id, day, missions_used, mission_won) VALUES (?, ?, ?, ?) ON CONFLICT(army_id, day) DO UPDATE SET missions_used = excluded.missions_used, mission_won = excluded.mission_won",
    ).run(p.armyId, p.day, m.used + 1, win ? 1 : 0);
    return (out = { ok: true, id, n: m.used + 1 });
  });
  return out;
}

/** The `n`-th (1-based) mission or raid battle of an army on `day`, oldest first (`/b/view/miss<n>`). */
export function modeBattleOfDay(db: DatabaseSync, armyId: number, day: string, kind: "mission" | "raid", n: number): BattleRow | null {
  if (!Number.isInteger(n) || n < 1) return null;
  const r = db.prepare("SELECT * FROM battles WHERE attacker_id = ? AND day = ? AND kind = ? ORDER BY id LIMIT 1 OFFSET ?").get(armyId, day, kind, n - 1);
  return r ? battleOf(r) : null;
}

/** Results of the day's mission tries, oldest first. */
export function missionsOfDay(db: DatabaseSync, armyId: number, day: string): DayBattle[] {
  const rows = db.prepare("SELECT input, winner FROM battles WHERE attacker_id = ? AND day = ? AND kind = 'mission' ORDER BY id").all(armyId, day) as { input: string; winner: number | null }[];
  return rows.map((r, i) => ({ n: i + 1, win: r.winner !== null && r.winner === (JSON.parse(r.input) as BattleInput).attackerSide }));
}

// ---- raids ------------------------------------------------------------------------------------------------------

/** A raid fighter: the first trooper (slot 0) of a confirmed recruit, `pref` null. */
export type RaidRecruit = { recruitArmyId: number; trooper: BattleTrooperInput };

// UNVERIFIED: the original fighting order of the recruits is undocumented (weakest first, ties in recruitment order).
/** The raid pool: first trooper of every confirmed recruit, lowest level first, then in recruitment order. */
export function raidRecruits(db: DatabaseSync, armyId: number): RaidRecruit[] {
  return recruitLeaders(db, armyId)
    .map((t) => ({ recruitArmyId: t.armyId, trooper: { ...trooperInput(t), pref: null } }))
    .sort((a, b) => a.trooper.choices.length - b.trooper.choices.length || a.recruitArmyId - b.recruitArmyId);
}

/** Today's raid state of an army (defaults when the day has no row yet). */
export interface RaidDay {
  /** Phase to fight next (the last one fought once the raid is over). */
  phase: number;
  /** Army ids of the recruits killed today. */
  dead: number[];
  over: boolean;
}

export function raidDay(db: DatabaseSync, armyId: number, day: string): RaidDay {
  const r = db.prepare("SELECT raid_phase, raid_dead, raid_over FROM daily WHERE army_id = ? AND day = ?").get(armyId, day) as
    | { raid_phase: number; raid_dead: string; raid_over: number }
    | undefined;
  let dead: number[] = [];
  try {
    const v = JSON.parse(r?.raid_dead ?? "[]") as unknown;
    if (Array.isArray(v)) dead = v.filter((x): x is number => Number.isInteger(x));
  } catch {
    dead = [];
  }
  return { phase: Number(r?.raid_phase ?? 1), dead, over: r?.raid_over === 1 };
}

/** The recruits still alive in today's raid, in fighting order. */
export function raidAlive(db: DatabaseSync, armyId: number, day: string): RaidRecruit[] {
  const dead = new Set(raidDay(db, armyId, day).dead);
  return raidRecruits(db, armyId).filter((r) => !dead.has(r.recruitArmyId));
}

/**
 * One raid phase, atomically (BEGIN IMMEDIATE). `phase` (the phase the URL was issued for) must be today's phase
 * ("stale" otherwise: replays fight nothing); refused once the raid is over ("limit") or without a living recruit
 * ("refused", code "none"). `decide` (inside the transaction) gets the living recruits and builds and resolves the
 * battle; its `dead` (recruit army ids) join `daily.raid_dead`. A win pays the reward and opens the next phase
 * (the raid is over after RAID_MAX_PHASE won phases, the phase then stays at RAID_MAX_PHASE); a defeat ends the raid.
 */
export function fightRaid(db: DatabaseSync, p: { armyId: number; day: string; phase: number; decide: (alive: RaidRecruit[]) => NewModeBattle | string }): ModeResult {
  let out: ModeResult = { ok: false, reason: "limit", used: 0 };
  immediate(db, () => {
    const r = raidDay(db, p.armyId, p.day);
    if (r.over) return (out = { ok: false, reason: "limit", used: r.phase }), null;
    if (r.phase !== p.phase) return (out = { ok: false, reason: "stale", used: r.phase }), null;
    const dead = new Set(r.dead);
    const alive = raidRecruits(db, p.armyId).filter((x) => !dead.has(x.recruitArmyId));
    if (alive.length === 0) return (out = { ok: false, reason: "refused", code: "none" }), null;
    const d = p.decide(alive);
    if (typeof d === "string") return (out = { ok: false, reason: "refused", code: d }), null;
    const win = d.winner !== null && d.winner === d.input.attackerSide;
    const id = insertModeBattle(db, { armyId: p.armyId, day: p.day, kind: "raid", phase: r.phase }, d);
    for (const x of d.dead ?? []) dead.add(x);
    // UNVERIFIED: 20 phases a day (SWF constant presumed to be the raid cap; wiki "20 (21 ?)").
    const last = !win || r.phase >= RAID_MAX_PHASE;
    db.prepare(
      "INSERT INTO daily(army_id, day, raid_phase, raid_dead, raid_over) VALUES (?, ?, ?, ?, ?) ON CONFLICT(army_id, day) DO UPDATE SET raid_phase = excluded.raid_phase, raid_dead = excluded.raid_dead, raid_over = excluded.raid_over",
    ).run(p.armyId, p.day, last ? r.phase : r.phase + 1, JSON.stringify([...dead]), last ? 1 : 0);
    const n = Number((db.prepare("SELECT COUNT(*) AS n FROM battles WHERE attacker_id = ? AND day = ? AND kind = 'raid'").get(p.armyId, p.day) as { n: number }).n);
    return (out = { ok: true, id, n });
  });
  return out;
}

/** The last raid battle of an army on `day`, or null. */
export function lastRaidOfDay(db: DatabaseSync, armyId: number, day: string): BattleRow | null {
  const r = db.prepare("SELECT * FROM battles WHERE attacker_id = ? AND day = ? AND kind = 'raid' ORDER BY id DESC LIMIT 1").get(armyId, day);
  return r ? battleOf(r) : null;
}
