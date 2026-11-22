// swf: logic.Trooper (§P!L/\x02§.§59=F\x03§) — state, init and small helpers. The behaviour is
// split by responsibility: combat.ts (hits, damage, falls), ai.ts (turn, moves, weapons),
// supers.ts (super skills and grenades). Each class method delegates to its port there.
import { SKILL, VEHICULE, arrayRemove, has } from "../../data/data.ts";
import { SKILLS } from "../../data/enums.ts";
import { Ghost } from "../ghost.ts";
import type { GhostData } from "../ghost.ts";
import type { GhostPref } from "../../data/data.ts";
import { BattleMsg, HitEvent } from "../../msg/battleMsg.ts";
import { HxEnum, enumIndex } from "../../msg/hx.ts";
import type { Battle } from "../battle.ts";
import { Ent } from "../ent.ts";
import { LogicVehicle } from "../logicVehicle.ts";
import { LogicWeapon } from "../logicWeapon.ts";
import { DamageType, MoveSystem, ReloadSystem, Size, SkillCategoryIdx, TrooperState, WeaponClass } from "../logicEnums.ts";
import type { Player } from "../player.ts";
import type { Square } from "../square.ts";
import { SIZE } from "../square.ts";
import type { HitResult, PrefData, TrooperData } from "../types.ts";
import * as ai from "./ai.ts";
import * as combat from "./combat.ts";
import * as setup from "./setup.ts";
import * as supers from "./supers.ts";

/** A super/auto skill slot (`{skill §r\x0b\x01§, num, weight, vh}`). */
export interface SkillSlot {
  skill: number;
  num: number;
  weight: number | null;
  vh: boolean;
}

/** A status (`{status §o\x1a\x01§, end §iy^\x10\x03§}`). */
export interface StatusEntry {
  status: number;
  end: number;
}

/** Damage dealt by an enemy (`{tr §\x05-C,§, score}`). */
export interface Predator {
  tr: Trooper;
  score: number;
}

/** `Data.§\x03\x1b8n§()` as an anonymous object. */
export const defaultPrefData = (): PrefData =>
  ({
    CBody: null,
    CWeapon: null,
    targetSystem: 0,
    targetType: 0,
    moveSystem: MoveSystem.STANDARD,
    reloadSystem: ReloadSystem.DEFAULT,
    leftOver: [],
  }) as PrefData;

const ghostDataOf = (d: TrooperData): GhostData => {
  const p = d.pref!;
  const pref: GhostPref = {
    CBody: p.CBody,
    CWeapon: p.CWeapon,
    targetSystem: p.targetSystem,
    targetType: enumIndex(p.targetType),
    moveSystem: p.moveSystem,
    reloadSystem: p.reloadSystem,
    leftOver: p.leftOver,
  };
  if (p.targetType instanceof HxEnum) pref.targetClass = p.targetType.params![0] as number;
  return { id: d.id, name: d.name, seed: d.seed, type: d.type, choices: d.choices, force: d.force, pref };
};

export class Trooper extends Ent {
  /** §\x1dI\x02\r\x03§ */
  weapons: LogicWeapon[] = [];
  /** §5\tmF§ — current weapon. */
  weap: LogicWeapon | null = null;
  /** §J@`r§ */
  vehicule: LogicVehicle | null = null;
  /** §\t\x11\x1c\t§ — targets of the chosen super / side action. */
  targets: Trooper[] = [];
  /** §&;(8§ — target square of the chosen super. */
  aimSquare: Square | null = null;
  /** §'\x1f;a\x01§ */
  supers: SkillSlot[] = [];
  /** §\x13fT$\x03§ */
  status: StatusEntry[] = [];
  /** §=\x01XR\x02§ */
  state: number = TrooperState.IDLE;
  /** §K(m`\x01§ — Vehicule drawn at creation (enum index). */
  vtype: number | null = null;
  /** §|~RT§ — side actions (SideAction). */
  sides: number[] = [];
  /** §iZ\x19\\§ (int) */
  fleeCount = 0;
  /** §M)6Q§ */
  rolling = false;
  /** §_7S\x06§ (int) */
  road = 0;
  /** §beWD\x01§ */
  predators: Predator[] = [];
  /** §@@\f\x01§ (int) */
  pid = 0;
  /** §r/Ke\x02§ */
  moving = false;
  /** §r\x0e;\x01§ */
  log = "";
  /** §\x1c(h7\x03§ */
  leader: boolean;
  /** §\x06TY0§ */
  killed = false;
  /** §3\x12\x06c\x03§ — BodyLoc of each wound. */
  injuries: number[] = [];
  /** §(\x1f\x15F\x01§ */
  helmet = false;
  /** §{(b?\x01§ — `have` cache, by Skill index. */
  haveCache: (boolean | undefined)[];
  /** §we\f=\x03§ */
  ghost: Ghost;
  /** §\x17d'm§ (int) — FRENETIC kill count. */
  frenzy = 0;
  /** DFEf (int) — kills. */
  frag: number;
  /** §wZy`\x01§ (int) */
  unused04 = 0;
  /** §5E[\x1d§ */
  data: TrooperData;
  /** §N\bA\f§ */
  auto: SkillSlot[] = [];

  // swf: Trooper.<constructor>
  constructor(bat: Battle, data: TrooperData, player: Player) {
    super(bat, player);
    this.data = data;
    // Ghost constructor: `if (data.pref == null) data.pref = Data.defaultPref()` (mutates data).
    if (data.pref == null) data.pref = defaultPrefData();
    this.ghost = new Ghost(ghostDataOf(data));
    this.frag = 0;
    this.unused04 = 0;
    this.haveCache = [];
    this.leader = false;
    for (const id of player.data.leaders) {
      if ((id | 0) === (data.id | 0)) {
        this.leader = true;
        break;
      }
    }
  }

  // swf: Trooper.§fZ\x06\x15§ (vhave)
  vhave(kind: number): boolean {
    if (this.vehicule == null) return false;
    return kind === this.vehicule.data.id;
  }

  // swf: Trooper.§lB{u\x01§ (useSuper)
  useSuper(skill: number): void {
    supers.useSuper(this, skill);
  }

  // swf: Trooper.§\x04Bpx\x03§ (unkill)
  unkill(): void {
    this.killed = false;
    this.setSquare(this.square!);
    this.player.register(this, true);
    arrayRemove(this.bat.graveyard, this.data.id | 0);
  }

  // swf: Trooper.§I\x14\x040§ — switches to the best-scored weapon.
  chooseWeapon(): boolean {
    return ai.chooseWeapon(this);
  }

  // swf: Trooper.§@\x1f\x1eb\x03§ — dodge / roll.
  dodge(h: HitResult, dt: number): boolean {
    return combat.dodge(this, h, dt);
  }

  // swf: Trooper.§\x05Cvl\x01§ (switchTeam)
  switchTeam(): void {
    arrayRemove(this.player.troopers, this);
    this.player = this.player.opp;
    this.player.troopers.push(this);
    this.side = (1 - this.side) | 0;
  }

  // swf: Trooper.§mF\x0e\x07\x02§ — takes weapon `w` in hand.
  switchWeapon(w: LogicWeapon): void {
    this.incTime(w.switchCost(this));
    this.weap = w;
    this.msg(BattleMsg.SwitchWeapon(this.weap.data.id, this.weap.getStatus()));
    this.player.invalidateDanger();
  }

  // swf: Trooper.§\x0bJ\x15g\x03§ — side actions (stomp, cure, wander, strangle, reload, defend).
  sideAction(): boolean {
    return ai.sideAction(this);
  }

  // swf: Trooper.§Xl['§ (shock)
  shock(): HitResult {
    return { tid: this.data.id | 0, dmg: 0, type: DamageType.SHOCK, events: [], loc: null };
  }

  // swf: Trooper.§)%\x0fM\x02§ (setStatus)
  setStatus(s: number, duration: number, h: HitResult | null = null): void {
    const st = this.getStatus(s);
    if ((st.end | 0) === -1) {
      if (h != null) {
        h.events.push(HitEvent.STATUS(s));
      } else {
        this.msg(BattleMsg.StatusOn(s));
      }
    }
    st.end = (this.bat.btime + duration) | 0;
  }

  // swf: Trooper.§\t+e\x02§ — occupies `sq` (and the rest of the footprint).
  setSquare(sq: Square | null): void {
    const dead = this.isDead();
    if (sq == null) throw "setSquare(null)";
    if (sq.tr != null && sq.tr !== this) throw "square.tr override";
    if (this.square != null) this.clearSquares();
    this.square = sq;
    const size = this.getSize();
    for (const d of SIZE[size]!) {
      const s = this.bat.getSq(this.square.x + d[0]!, this.square.y + d[1]!);
      if (s == null || s.tr != null) {
        throw "[" + this.bat.btime + "] ERROR setSquare size(" + size + ")";
      }
      if (!dead) s.tr = this;
      this.squares.push(s);
    }
    this.player.invalidateDanger();
  }

  // swf: Trooper.§}\x13O\x10§ (removeStatus)
  removeStatus(s: number): void {
    arrayRemove(this.status, this.getStatus(s));
  }

  // swf: Trooper.§\x10L6f\x03§ — refills every weapon's reserve; returns the amount.
  refillAmmo(): number {
    let sum = 0;
    for (const w of this.weapons) {
      const n = ((w.data.ammo | 0) - w.ammo) | 0;
      w.ammo = (w.ammo + n) | 0;
      sum = (sum + n) | 0;
    }
    return sum;
  }

  // swf: Trooper.§DY\x07v\x01§ (recal) — to the nearest free square.
  recal(): void {
    ai.recal(this);
  }

  // swf: Trooper.§s(~r\x01§ (reanimate)
  reanimate(): void {
    this.life = 1;
    this.state = TrooperState.IDLE;
    this.time = (this.bat.btime + this.bat.seed.random(60)) | 0;
    while (arrayRemove(this.player.deads, this)) {
      /* empty */
    }
    this.unkill();
  }

  // swf: Trooper.§\rlj\x1a§ (play)
  override play(): void {
    ai.play(this);
  }

  // swf: Trooper.§O5w\x03§ — picks up a better weapon lying around.
  pickWeapon(): boolean {
    return ai.pickWeapon(this);
  }

  // swf: Trooper.§d~'K\x03§ — moves towards the target.
  approach(): boolean {
    return ai.approach(this);
  }

  // swf: Trooper.§cjUQ\x02§ (moveTo)
  moveTo(sq: Square, div: number | null = null, show = true): void {
    const d = this.square!.getDist(sq);
    this.setSquare(sq);
    if (show) this.msg(BattleMsg.Move(sq.x, sq.y));
    this.road = (this.road + d) | 0;
    let cost = this.moveCost(d);
    if (div != null) cost = (cost / div) | 0;
    this.incTime(cost);
  }

  // swf: Trooper.§_[V\x1e\x01§ — moves away from danger.
  flee(): boolean {
    return ai.flee(this);
  }

  // swf: Trooper.§y'n\x1f\x01§ — applies a hit's damage.
  applyDamage(h: HitResult | null, crit = false, by: Trooper | null = null): void {
    combat.applyDamage(this, h, crit, by);
  }

  // swf: Trooper.§\x1f^\x0ej\x01§ — frees the footprint.
  clearSquares(): void {
    while (this.squares.length > 0) this.squares.pop()!.tr = null;
    this.square = null;
  }

  // swf: Trooper.§\x16!J9\x03§ (lastUse)
  lastUse(skill: number): void {
    if (has(SKILL[skill]!.cat, SkillCategoryIdx.LAST_USE_MSG)) this.msg(BattleMsg.LastUse(skill));
  }

  // swf: Trooper.§r\x13N\x01§ (knockOut)
  knockOut(angle: number, dist: number, h: HitResult | null = null, spread = 0.25): boolean {
    return combat.knockOut(this, angle, dist, h, spread);
  }

  // swf: Trooper.aGx2 (kill) — leaves the battlefield (graveyard).
  kill(): void {
    this.killed = true;
    for (const sq of this.squares) sq.tr = null;
    this.player.unregister(this);
    this.bat.graveyard.push(this.data.id | 0);
  }

  // swf: Trooper.§)/Z\f\x02§
  override isTrooper(): boolean {
    return true;
  }

  // swf: Trooper.§\r\x03)f\x01§ — not a PUPPET (clown).
  isReal(): boolean {
    return this.ghost.data.type !== 1;
  }

  // swf: Trooper.§\\;u\x0b\x03§ — `t` already hit us.
  isPredator(t: Trooper): boolean {
    for (const p of this.predators) if (p.tr === t) return true;
    return false;
  }

  // swf: Trooper.§Sp6F\x03§ — immune to statuses.
  statusImmune(): boolean {
    if (this.ghost.job === SKILLS.DOCTOR || !this.isReal()) return true;
    if (this.vehicule != null && this.vehicule.data.id !== 0) return true;
    return false;
  }

  // swf: Trooper.§\x12-NH\x01§
  isMovable(): boolean {
    return this.vehicule == null && this.state !== TrooperState.FALLEN && !this.have(SKILLS.SEMELLES_DE_PLOMB);
  }

  // swf: Trooper.§wC|;\x03§ (isFlying)
  isFlying(): boolean {
    return this.vehicule != null && this.vehicule.data.id === 3;
  }

  // swf: Trooper.§s*\x12\x1f§ (isDead)
  isDead(): boolean {
    return this.killed;
  }

  // swf: Trooper.§N\x06A\n\x02§ (invade)
  invade(): void {
    const m = 2;
    const x = ((1 - this.side) * (14 + m * 2) - m) | 0;
    this.msg(BattleMsg.Move(x, this.square!.y));
  }

  // swf: Trooper.§p\x02a\f\x03§ (interrupt)
  interrupt(n = 0): void {
    switch (this.state) {
      case 1:
        this.time = this.bat.btime;
        break;
      case 4:
        this.time = (this.time + n) | 0;
        return;
    }
    this.time = (this.time + n) | 0;
    this.state = TrooperState.IDLE;
  }

  // swf: Trooper.§7UmY\x02§ — status unless immune.
  tryStatus(duration: number, s: number, h: HitResult | null = null): void {
    if (this.statusImmune()) return;
    this.setStatus(s, duration, h);
  }

  // swf: Trooper.§'Eka§ (initWeapon)
  initWeapon(w: number): void {
    const lw = new LogicWeapon(w, this);
    lw.init(this.bat.seed);
    this.weapons.push(lw);
  }

  // swf: Trooper.§r398\x03§ (initTarget)
  initTarget(): void {
    this.rolling = false;
  }

  // swf: Trooper.§(\x07\x184§ (init) — weapons, skills, spare weapons, vehicle, initiative.
  init(bat: Battle): void {
    setup.init(this, bat);
  }

  /** The oracle's `TRP` line for the current state (patch-msg.as `mtTrp`). */
  trpLine(): string {
    return setup.trpLine(this);
  }

  // swf: Trooper.§\x01\x19Hx\x03§ (incTime) — divided by the speed coefficient (int param).
  override incTime(n: number): void {
    n = ((n | 0) / this.speedCoef()) | 0;
    this.time = (this.time + n) | 0;
  }

  // swf: Trooper.§3\x19/\x01§ (hit)
  hit(dmg: number, by: Trooper | null, dt: number | null = null, loc: number | null = null): HitResult {
    return combat.hit(this, dmg, by, dt, loc);
  }

  // swf: Trooper.§z\r)M\x01§ — has a status.
  hasStatus(s: number): boolean {
    for (const st of this.status) if (st.status === s) return true;
    return false;
  }

  // swf: Trooper.§\fQ\x16S\x01§ — rolls an AUTO skill (weight draw), consumes a use.
  tryAuto(skill: number, h: HitResult | null = null, silent = false): boolean {
    return setup.tryAuto(this, skill, h, silent);
  }

  // swf: Trooper.§\x15[\x1eF§ — the Ghost holds `skill`.
  hasSkill(skill: number): boolean {
    for (const s of this.ghost.skills) if (s === skill) return true;
    return false;
  }

  // swf: Trooper.§(%Q\x02§ (have) — cached hasSkill.
  override have(skill: number): boolean {
    const c = this.haveCache[skill];
    if (c != null) return c;
    const r = this.hasSkill(skill);
    this.haveCache[skill] = r;
    return r;
  }

  // swf: Trooper.§W\x11s!\x02§ — time to walk `d` squares.
  moveCost(d: number): number {
    return (d * this.getSpeed() * 48) | 0;
  }

  // swf: Trooper.§,\x01\x12K§ (getSuper)
  getSuper(): number | null {
    return supers.getSuper(this);
  }

  // swf: Trooper.§q6,}\x03§ (getStatus) — the entry for `s`, created (end -1) if absent.
  getStatus(s: number): StatusEntry {
    for (const st of this.status) if (st.status === s) return st;
    const st: StatusEntry = { status: s, end: -1 };
    this.status.push(st);
    return st;
  }

  // swf: Trooper.§\x1b|\x02\x19\x02§ — deploy weight of the footprint.
  sizeWeight(): number {
    return [1, 2, 4, 6][this.getSize()]! | 0;
  }

  // swf: Trooper.§\x0esEt\x01§ — speed coefficient (incTime divisor).
  speedCoef(): number {
    let k = this.ghost.speedCoef;
    if (this.have(SKILLS.SURVIVAL_INSTINCT) && this.life <= this.getLifeMax() * 0.5) k += 0.5;
    if (this.hasStatus(2)) k += 1;
    if (this.have(SKILLS.ENTHUSIASTIC) && this.injuries.length === 0) k += 0.25;
    if (k < 0.1) k = 0.1;
    return k;
  }

  // swf: Trooper.§\x02e\x0fp\x03§ (getSize) — Size index.
  getSize(): number {
    if (this.square == null) {
      if (this.vtype != null) return VEHICULE[this.vtype]!.size as number;
      return Size.SMALL;
    }
    if (this.vehicule == null) return Size.SMALL;
    return this.vehicule.data.size as number;
  }

  // swf: Trooper.§/^(F\x01§ — move speed (Ghost formula on weapons, wounds, vehicle).
  getSpeed(): number {
    let v: number | null = null;
    if (this.vehicule != null) v = this.vehicule.data.id;
    const ws: number[] = [];
    for (const w of this.weapons) ws.push(w.data.id);
    return this.ghost.getSpeed(ws, this.injuries, v);
  }

  // swf: Trooper.§\b\x1d{\b\x03§ — nearest square neither flagged nor occupied (fitting our size).
  nearestUnflagged(): Square | null {
    return ai.nearestUnflagged(this);
  }

  // swf: Trooper.§H 7E§ — random BodyLoc.
  randomLoc(): number {
    return this.bat.seed.random(8);
  }

  // swf: Trooper.weKB — predator entry for `t` (created if absent).
  predator(t: Trooper): Predator {
    for (const p of this.predators) if (p.tr === t) return p;
    const p: Predator = { tr: t, score: 0 };
    this.predators.push(p);
    return p;
  }

  // swf: Trooper.§mll)\x02§ — best square to move to (range/danger).
  bestMove(target: Trooper | null = null): Square | null {
    return ai.bestMove(this, target);
  }

  // swf: Trooper.§rtM\x03\x03§ — enemies on the 4 neighbours.
  enemyNeighbours(): Trooper[] {
    const out: Trooper[] = [];
    for (const sq of this.square!.nei) {
      if (!(sq == null || sq.tr == null)) {
        if (sq.tr.side !== this.side) out.push(sq.tr);
      }
    }
    return out;
  }

  // swf: Trooper.§qk\x02\x19§ — nearest free neighbour square of `t`.
  freeSquareNear(t: Trooper): Square | null {
    return ai.freeSquareNear(this, t);
  }

  // swf: Trooper.§\x1c\x07}\t§ (getNearest)
  getNearest(list: Trooper[]): Trooper | null {
    return ai.getNearest(this, list);
  }

  // swf: Trooper.§\x03#w\x03§ — a miss result (ADRENALINE boosts).
  missResult(): HitResult {
    const ev: unknown[] = [];
    if (this.have(SKILLS.ADRENALINE)) {
      this.boost(70, false);
      ev.push(HitEvent.E7(0));
    }
    return { tid: this.data.id | 0, dmg: -1, type: DamageType.MISS, events: ev, loc: null };
  }

  // swf: Trooper.§X;h'\x03§ — move range per turn.
  moveRange(): number {
    let n = (5 / this.getSpeed()) | 0;
    if (n === 0) n = 1;
    return n;
  }

  // swf: Trooper.§)L`\x07§ (getLifeMax)
  override getLifeMax(): number {
    return this.ghost.life;
  }

  // swf: Trooper.§aal\x15\x03§ (getInjuries) — wounds at `loc`.
  getInjuries(loc: number): number {
    let n = 0;
    for (const l of this.injuries) if (l === loc) n++;
    return n;
  }

  // swf: Trooper.§(m\x0fl\x01§ (getId)
  override getId(): number {
    return this.data.id | 0;
  }

  // swf: Trooper.§f\x06ac\x02§ — hit chance (%) against `t`.
  hitChance(t: Trooper, shot = 0): number {
    return combat.hitChance(this, t, shot);
  }

  // swf: Trooper.§q8 \x03§ — grenade landing point (or interception).
  aimGrenade(skill: number, err: number): { x: number; y: number } | null {
    return supers.aimGrenade(this, skill, err);
  }

  // swf: Trooper.§o\tC\x03§ — free squares reachable in n steps (fitting our size).
  reachable(n: number): Square[] {
    return ai.reachable(this, n);
  }

  // swf: Trooper.§Rj'+\x02§ (getDistTo)
  getDistTo(p: { x: number; y: number }): number {
    return Math.abs((p.x | 0) - this.square!.x) + Math.abs((p.y | 0) - this.square!.y);
  }

  // swf: Trooper.§WU|\x04§ — infos sent to the client (getInfos).
  override getInfos(): object {
    return setup.getInfos(this);
  }

  // swf: Trooper.§ 4q}\x03§ — respawn square near our edge (RESCUE).
  respawnSquare(): Square | null {
    return supers.respawnSquare(this);
  }

  // swf: Trooper.§&!g-\x03§ (getDanger)
  getDanger(): number {
    return this.square!.danger[this.player.opp.side]! | 0;
  }

  // swf: Trooper.§\x03B\x01|\x03§ (getCover)
  getCover(side: number): number {
    if (this.state === TrooperState.FALLEN) return 0;
    if (side !== this.side && this.have(SKILLS.BRICK_SHOUSE)) return 3;
    return 1;
  }

  // swf: Trooper.§_A\x1es\x03§ — best area square for a grenade/strike.
  bestArea(minDist = 1, n = 0, ground = true, friendly = false, bonus: ((t: Trooper) => number) | null = null): Square | null {
    return supers.bestArea(this, minDist, n, ground, friendly, bonus);
  }

  // swf: Trooper.§=q\x05G\x02§ — squares where our footprint fits.
  filterFits(list: Square[]): Square[] {
    const size = this.getSize();
    if (size === 0) return list;
    const out: Square[] = [];
    for (const sq of list) if (sq.fits(size)) out.push(sq);
    return out;
  }

  // swf: Trooper.§vx\r&§ (fall)
  fall(n: number): HitResult {
    return combat.fall(this, n);
  }

  // swf: Trooper.§R\x12SM§ — drops the weapon in hand.
  dropWeapon(h: HitResult, lost: boolean): void {
    combat.dropWeapon(this, h, lost);
  }

  // swf: Trooper.§)+U\x1c\x03§ — damage without attacker.
  selfDamage(n: number, dt: number): HitResult {
    this.initTarget();
    const h: HitResult = { tid: this.data.id | 0, dmg: n, type: dt, events: [], loc: null };
    this.applyDamage(h);
    return h;
  }

  // swf: Trooper.§\x16mf\x01§ (die)
  die(): void {
    if (this.isDead()) return;
    this.state = TrooperState.DEAD;
    this.life = 0;
    this.resetWeapon(true);
    this.kill();
    if (this.isReal()) this.player.deads.push(this);
  }

  // swf: Trooper.§`,\x16r§ (checkStatus) — expired statuses end.
  checkStatus(): void {
    const list = this.status;
    for (let i = 0; i < list.length; ) {
      const st = list[i]!;
      i++;
      if ((st.end | 0) <= this.bat.btime) {
        arrayRemove(this.status, st);
        this.msg(BattleMsg.StatusOff(st.status));
      }
    }
  }

  // swf: Trooper.§O\x12=G\x03§ — vehicle draw (SPAWN skills) at pool creation.
  drawVehicle(): void {
    setup.drawVehicle(this);
  }

  // swf: Trooper.§qJ30\x02§ — an AUTO skill with uses left.
  hasAuto(skill: number): boolean {
    for (const a of this.auto) {
      if (!(this.vehicule != null && !Boolean(a.vh))) {
        if (a.skill === skill) return (a.num | 0) > 0;
      }
    }
    return false;
  }

  // swf: Trooper.§Dtg\x14\x01§ — aiming trooper re-checks its target (COVERING_FIRE).
  checkAim(): void {
    ai.checkAim(this);
  }

  // swf: Trooper.§6\x1dz\\\x02§ — can be pushed around.
  canBeMoved(): boolean {
    return this.vehicule == null && !this.have(SKILLS.SEMELLES_DE_PLOMB) && !this.have(SKILLS.UNSHAKABLE);
  }

  // swf: Trooper.§8@\x06G§ (boost)
  boost(n: number, show: boolean): void {
    this.time = (this.time - n) | 0;
    if (show && !this.isDead()) this.msg(BattleMsg.Boost(0));
  }

  // swf: Trooper.§\x12\x17@[\x02§ — back to the first weapon.
  resetWeapon(silent = true): void {
    if (this.weap === this.weapons[0]) return;
    this.weap = this.weapons[0] ?? null;
    if (!silent) this.msg(BattleMsg.SwitchWeapon(this.weap!.data.id, this.weap!.getStatus()));
  }

  // swf: Trooper.§*aE\x18\x01§ — back to the first weapon unless in melee.
  holster(silent = true): void {
    if (this.weap!.data.type === WeaponClass.MELEE) return;
    this.resetWeapon(silent);
  }

  // swf: Trooper.§wj|Z\x02§ — records damage dealt by `t`.
  addPredatorScore(t: Trooper | null, n: number): void {
    const p = this.predator(t as Trooper);
    p.score = ((p.score | 0) + n) | 0;
  }
}
