// swf: LogicWeapon (§P!L/\x02§.§&Z\x01H§) — a weapon instance: ammo, target choice, shooting.
import type { Rand } from "../core/rand.ts";
import { BODY_LOC, WEAPON, arrayRemove, has } from "../data/data.ts";
import type { WeaponRow } from "../data/data.ts";
import { SKILLS, WEAPONS } from "../data/enums.ts";
import { Announce, BattleMsg } from "../msg/battleMsg.ts";
import { enumIndex } from "../msg/hx.ts";
import type { Battle } from "./battle.ts";
import { Anim, BodyLoc, DamageType, MoveSystem, TrooperState, WeaponClass, WeaponHab } from "./logicEnums.ts";
import type { Square } from "./square.ts";
import type { Trooper } from "./trooper/trooper.ts";
import type { HitResult } from "./types.ts";

export class LogicWeapon {
  /** §)\x05f\x01§ (int) — unique weapon id (static counter). */
  uid: number;
  /** §T\x13x7\x03§ — vehicle weapon. */
  vehicleWeapon: boolean;
  /** §(\x01§ — owner. */
  tr: Trooper | null;
  /** §tJW\x15\x02§ */
  target: Trooper | null = null;
  /** §v\x13\x059\x03§ — square where it lies. */
  square: Square | null = null;
  /** §f!\x13%§ (Number) */
  score: number;
  /** §w;n\x02\x01§ */
  voluntary: boolean;
  /** §\x0fV8\x16\x02§ — sabotaged spare (never chosen). */
  spare: boolean;
  /** §+8\x19\x7f§ (int) — loaded rounds. */
  rounds: number;
  /** §5E[\x1d§ */
  data: WeaponRow;
  /** §\x01x8\x01§ */
  bat: Battle;
  /** §\x1ap\x04f§ (int) — reserve. */
  ammo: number;

  // swf: LogicWeapon.<constructor>
  constructor(type: number, owner: Trooper) {
    this.bat = owner.bat;
    this.data = WEAPON[type]!;
    this.tr = owner;
    this.rounds = 0;
    this.ammo = this.data.ammo | 0;
    this.score = 0;
    this.vehicleWeapon = false;
    this.spare = false;
    this.voluntary = false;
    this.uid = this.bat.weaponCounter | 0;
    this.bat.weaponCounter = (this.bat.weaponCounter + 1) | 0;
  }

  // swf: LogicWeapon.§\x13qo;\x01§ — natural weapons (never dropped).
  static isNatural(w: number): boolean {
    return w === WEAPONS.FISTS || w === WEAPONS.RAT_TOOTH || w === WEAPONS.CLOWN;
  }

  get owner(): Trooper {
    return this.tr!;
  }

  // swf: LogicWeapon.§1Vd0\x02§ — starts reloading.
  startReload(voluntary = false): void {
    const t = this.owner;
    this.voluntary = voluntary;
    t.state = TrooperState.RELOAD;
    t.msg(BattleMsg.ReloadStart);
    if (t.tryAuto(SKILLS.LOADER)) {
      while (t.state !== TrooperState.IDLE) this.reload(true);
    } else {
      let n = this.data.handling | 0;
      if (t.have(SKILLS.NIMBLE_FINGERS)) n >>= 1;
      t.incTime(n);
    }
  }

  // swf: LogicWeapon.§fY-}\x02§ — fires at the target.
  fire(): void {
    const t = this.owner;
    let target = this.target;
    const rnd = (n: number): number => t.bat.seed.random(n);
    if (target == null) {
      t.incTime(100);
      t.msg(BattleMsg.Positions([t.square!.x, t.square!.y]));
      return;
    }
    const mohican = t.have(SKILLS.LAST_MOHICAN) && t.player.troopers.length === 1;
    const cls = this.data.type;
    let shots = this.data.shots | 0;
    if (t.have(SKILLS.TRIGGER_HAPPY) && this.data.damageType === DamageType.BULLET) shots += 1;
    if (t.have(SKILLS.TAIL_GUNNER) && this.data.type === WeaponClass.SHOTGUN) shots += 2;
    if (mohican) shots = this.rounds;
    if (shots < this.rounds && t.tryAuto(SKILLS.NERVOUS)) shots = this.rounds;
    if (cls !== WeaponClass.MELEE && shots > this.rounds) shots = this.rounds;
    target.initTarget();
    for (let i = 0; i < shots; i++) {
      switch (cls) {
        case 0:
        case 1:
        case 2:
        case 6: {
          const hits: HitResult[] = [];
          let n = this.have(WeaponHab.DOUBLE) ? 2 : 1;
          if (n > this.rounds) n = this.rounds;
          let around: (Square | null)[] = [];
          if (this.have(WeaponHab.SPLASH_NEI)) around = target.square!.nei;
          if (this.have(WeaponHab.SPLASH_3)) around = target.square!.around(3);
          for (let k = 0; k < n; k++) {
            this.rounds = (this.rounds - 1) | 0;
            hits.push(this.shoot(target, i));
            for (const sq of around) {
              if (!(sq == null || sq.tr == null || sq.tr === t || sq === target.square)) {
                if (!(sq.tr.side === t.side && t.have(SKILLS.FRIENDLY_FIRE))) {
                  hits.push(this.shoot(sq.tr, i, 0.5, 0.75));
                }
              }
            }
          }
          t.msg(BattleMsg.Shots(hits));
          if (cls === WeaponClass.SHOTGUN && i + 1 < shots && !t.have(SKILLS.DEATH_GRIP)) {
            for (const sq of target.square!.nei) {
              if (!(sq == null || sq.tr == null || sq.tr === t)) {
                if (!(sq.tr.side === t.side && t.have(SKILLS.FRIENDLY_FIRE))) {
                  if (rnd(2) === 0) {
                    target = sq.tr;
                    break;
                  }
                }
              }
            }
          }
          break;
        }
        case 3: {
          this.rounds = (this.rounds - 1) | 0;
          const touch = t.hitChance(target, i) > t.bat.seed.rand() * 100;
          let hits: HitResult[] = [];
          const sq = target.square!;
          if (touch) hits = t.bat.explode(sq.x, sq.y, 3, this.data.dmin | 0, !target.isFlying(), t);
          t.msg(BattleMsg.Explosion(this.data.id, sq.x, sq.y, hits));
          break;
        }
        case 5: {
          const h = this.shoot(target, i);
          const anims = [Anim.PUNCH_A, Anim.PUNCH_B, Anim.PUNCH_C];
          let anim = anims[this.bat.seed.random(anims.length)]!;
          if (t.data.type !== 0) anim = Anim.PUNCH_A;
          t.msg(BattleMsg.Brawl(target.data.id | 0, this.data.id, h, anim));
          break;
        }
        case 4:
          break;
      }
      if (this.tr == null) return;
      if (target.isDead()) {
        if (!target.isReal() || t.have(SKILLS.COLD_BLOODED)) break;
      }
    }
    target.initTarget();
    if (this.have(WeaponHab.AUTO_RELOAD)) {
      while (this.ammo > 0 && this.rounds < (this.data.rounds | 0)) {
        this.rounds = (this.rounds + 1) | 0;
        this.ammo = (this.ammo - 1) | 0;
      }
      t.msg(BattleMsg.AutoReload);
    }
    let rec = this.data.recovery | 0;
    if (t.have(SKILLS.COMPENSATOR)) rec >>= 1;
    t.incTime(rec);
    t.state = TrooperState.IDLE;
  }

  // swf: LogicWeapon.§)ym\x1e\x03§ — one bullet: location, hit roll, damage.
  shoot(target: Trooper, shot: number, dmgK = 1, hitK = 1): HitResult {
    const t = this.owner;
    const rnd = (n: number): number => t.bat.seed.random(n);
    let chance = t.hitChance(target, shot) * hitK;
    const locs = BODY_LOC.slice();
    if (t.have(SKILLS.VICIOUS)) {
      for (const l of target.injuries) {
        locs.push(l);
        locs.push(l);
        locs.push(l);
        locs.push(l);
      }
    }
    if (t.have(SKILLS.HYDROSHOCK_SHELLS)) {
      locs.push(BodyLoc.TORSO_LEFT);
      locs.push(BodyLoc.TORSO_RIGHT);
      locs.push(BodyLoc.STOMACH);
    }
    const cbody = t.data.pref!.CBody;
    if (cbody != null) {
      let n = 1;
      if (this.have(WeaponHab.AIMED)) n += 3;
      if (t.have(SKILLS.ANATOMY)) n += 3;
      for (let i = 0; i < n; i++) locs.push(cbody);
    }
    const loc = locs[rnd(locs.length)]!;
    if (loc === BodyLoc.HEAD) chance *= 0.75;
    const touch = chance > t.bat.seed.rand() * 100;
    let dmg = ((this.data.dmin | 0) + rnd(1 + (this.data.dmax | 0) - (this.data.dmin | 0))) | 0;
    dmg = (dmg * dmgK) | 0;
    if (t.have(SKILLS.UNFORGIVING) && t.isPredator(target)) dmg = this.data.dmax | 0;
    if (this.data.damageType === DamageType.BULLET && t.tryAuto(SKILLS.EXPLOSIVE_SHELLS)) dmg <<= 2;
    if (t.have(SKILLS.LAST_MOHICAN) && t.player.troopers.length === 1) dmg <<= 1;
    let h = target.missResult();
    if (touch) h = target.hit(dmg, t, this.data.damageType, loc);
    if (touch && this.have(WeaponHab.KNOCKBACK) && rnd(2) === 0 && !target.isDead()) {
      let n = (h.dmg | 0) >> 1;
      if (n > 8) n = 8;
      target.knockOut(t.square!.getAngle(target.square!), n, h);
    }
    return h;
  }

  // swf: LogicWeapon.§X&Tq§ — vehicle weapon turn: aim if possible.
  tryAim(): boolean {
    if (!this.isLoaded()) return false;
    this.target = this.findTarget();
    if (this.target == null) return false;
    if (this.canTarget(this.target)) {
      this.aim();
      return true;
    }
    return this.owner.approach();
  }

  // swf: LogicWeapon.§uSk0\x01§ — shoot or reload.
  shootOrReload(rush: boolean): boolean {
    const loaded = this.isLoaded();
    if (!loaded) {
      if (this.ammo > 0) {
        this.startReload();
        return true;
      }
      return false;
    }
    this.target = this.findTarget();
    if (this.target == null || !this.canTarget(this.target)) return false;
    if (rush) this.owner.msg(BattleMsg.Announce(Announce.Skill(SKILLS.RUSH)));
    this.aim();
    return true;
  }

  // swf: LogicWeapon.§*\x179{\x01§ (reload) — one reload step.
  reload(full = false): void {
    const t = this.owner;
    let done = this.ammo === 0 || this.rounds === (this.data.rounds | 0);
    if (!done) {
      switch (t.data.pref!.reloadSystem) {
        case 0: {
          let k = 1;
          k /= 1 + t.getDanger();
          done = t.bat.seed.rand() * k < this.rounds / (this.data.rounds | 0);
          break;
        }
        case 1:
          if (this.voluntary && t.getDanger() === 0) {
            done = false;
          } else {
            done = t.bat.seed.rand() < this.rounds / (this.data.rounds | 0);
          }
          break;
        case 2:
          done = t.bat.seed.rand() < this.rounds / (this.data.rounds | 0);
          break;
        case 3:
          done = this.rounds === (this.data.rounds | 0);
          break;
      }
    }
    if (done) {
      t.msg(BattleMsg.ReloadEnd);
      let n = this.data.handling | 0;
      if (t.have(SKILLS.NIMBLE_FINGERS)) n >>= 1;
      if (full) n = 0;
      t.incTime(n);
      t.state = TrooperState.IDLE;
    } else {
      let n = 1;
      if (this.rounds + n < (this.data.rounds | 0) && this.ammo > 1 && t.have(SKILLS.NIMBLE_FINGERS)) n++;
      if (full) n = Math.min(this.ammo, this.data.rounds | 0) | 0;
      this.rounds = (this.rounds + n) | 0;
      this.ammo = (this.ammo - n) | 0;
      t.msg(BattleMsg.Reload(n));
      if (!full) t.incTime(this.data.reload | 0);
    }
  }

  // swf: LogicWeapon.§8\x0eWl\x01§ — taken by a trooper (picked up / stolen).
  takenBy(t: Trooper): void {
    if (this.square != null) arrayRemove(this.square.weapons, this);
    if (this.tr != null) {
      arrayRemove(this.tr.weapons, this);
      this.tr.resetWeapon(true);
    }
    this.tr = t;
    t.weapons.push(this);
    t.weap = this;
    this.square = null;
  }

  // swf: LogicWeapon.§6rOn\x01§ — interest score of this weapon for trooper `t`.
  updateScore(t: Trooper): void {
    const opp = t.player.opp;
    let from = t.square!;
    this.score = 0;
    if (this.spare) {
      this.score = -5000;
      return;
    }
    let d: number;
    if (this.square != null) {
      from = this.square;
      d = t.square!.getDist(from);
      this.score -= 30 + t.moveCost(d);
    }
    if (t.data.pref!.CWeapon === this.data.id) this.score += 200;
    opp.computeDanger();
    d = from.range[opp.side]! | 0;
    if (t.weap !== this) this.score -= this.switchCost(t);
    if (this.rounds === 0 && this.data.type !== WeaponClass.MELEE) this.score -= this.reloadCost(t);
    if (this.data.type === WeaponClass.EXPLOSIVE) {
      if (opp.hasVehicle()) this.score += 100;
      if (d <= 4) this.score -= [1000, 500, 200, 100, 50][d]! | 0;
    }
    if (this.data.type === WeaponClass.MELEE) {
      this.score -= d * d * 10;
      this.score -= (t.getSpeed() * 50) | 0;
      this.score += t.have(SKILLS.FACEBOOT) ? 50 : 0;
      this.score += t.have(SKILLS.WRESTLER) ? 80 : 0;
      if (t.road > 42) this.score += 10000;
    }
    if (this.data.id === WEAPONS.FISTS) {
      this.score += t.have(SKILLS.FISTS_OF_FURY) ? 80 : 0;
      this.score += t.have(SKILLS.DEATH_GRIP) ? 80 : 0;
    }
    let n = 0;
    for (const e of t.player.opp.troopers) {
      if (this.isValidTarget(e, t)) n++;
    }
    this.score += n * 5;
    if (n === 0) this.score -= 500;
    let fill = this.rounds / (this.data.rounds | 0) + this.ammo / (this.data.ammo | 0);
    if ((this.data.rounds | 0) === 0 || (this.data.ammo | 0) === 0) fill = 1;
    this.score += (this.data.score | 0) * fill;
  }

  // swf: LogicWeapon.§\x1c\x0bbJ\x01§ — `e` is a target this weapon can hit at all.
  isValidTarget(e: Trooper | null, by: Trooper | null = null): boolean {
    if (by == null) by = this.tr;
    if (e == null) return false;
    if (e.isDead() || e.square == null || e.side === by!.side) return false;
    if (e.state === TrooperState.FALLEN) {
      if (this.data.type === WeaponClass.EXPLOSIVE || this.data.type === WeaponClass.MELEE) return false;
    }
    switch (this.data.type) {
      case 1:
      case 5:
        if (e.isFlying()) return false;
    }
    return true;
  }

  // swf: LogicWeapon.§s] \x19§ (canTarget) — in range.
  canTarget(e: Trooper | null): boolean {
    if (e == null) return false;
    const d = e.square!.getDist(this.owner.square!);
    const rmax = this.rangeMax();
    const rmin = this.rangeMin();
    if (d > rmax) return false;
    if (d < rmin) return false;
    if (this.have(WeaponHab.MIN_RANGE) && (this.owner.square!.range[e.side]! | 0) < (this.data.rmin as number)) return false;
    return true;
  }

  // swf: LogicWeapon.§\x01|fz\x01§
  isLoaded(): boolean {
    return this.rounds > 0 || (this.data.rounds | 0) === 0;
  }

  // swf: LogicWeapon.§tXV;\x03§
  isHeavy(): boolean {
    return has(this.data.habilities, WeaponHab.HEAVY);
  }

  // swf: LogicWeapon.§j/\x15w§
  isEmpty(): boolean {
    return this.rounds === 0 && this.ammo === 0;
  }

  // swf: LogicWeapon.§(\x07\x184§ (init) — initial load: 1 + rnd(rounds) (or full).
  init(r: Rand): void {
    let n = (1 + r.random(this.data.rounds | 0)) | 0;
    if (this.owner.have(SKILLS.BATTLE_READY) || this.have(WeaponHab.FULL_LOAD)) n = this.data.rounds | 0;
    this.rounds = n;
    this.ammo = (this.ammo - n) | 0;
  }

  // swf: LogicWeapon.§(%Q\x02§ (have)
  have(h: number): boolean {
    for (const x of this.data.habilities) if (h === x) return true;
    return false;
  }

  // swf: LogicWeapon.§x\x1a\x18~\x02§ (findTarget)
  findTarget(): Trooper | null {
    const t = this.owner;
    const ms = t.data.pref!.moveSystem;
    const list: Trooper[] = [];
    for (const e of t.player.opp.troopers) {
      if (this.isValidTarget(e)) {
        if (!(!this.canTarget(e) && ms !== MoveSystem.HUNTER)) list.push(e);
      }
    }
    let best: Trooper | null = null;
    let max = -99999.9;
    for (const e of list) {
      let s = 0;
      const chance = t.hitChance(e);
      const d = t.getDistTo(e.square!);
      s -= d;
      switch (t.data.pref!.targetSystem) {
        case 0:
          s -= d * 10;
          break;
        case 1:
          s += chance;
          break;
        case 2:
          s -= e.life * 8;
          break;
        case 3:
          s += e.state === TrooperState.AIM ? 60 : 0;
          break;
      }
      if (e.have(SKILLS.BAIT) && !t.have(SKILLS.SMART)) s += 400;
      if (e.have(SKILLS.CAMOUFLAGE)) s -= 100;
      if (e.data.type === 1) s += t.have(SKILLS.SMART) ? -500 : 100;
      if (e.vehicule != null && this.data.type === WeaponClass.EXPLOSIVE) s += 200;
      if (e.have(SKILLS.SPY) && t.have(SKILLS.SUSPICIOUS)) s += 200;
      const tt = t.data.pref!.targetType;
      switch (enumIndex(tt)) {
        case 0:
          break;
        case 1: {
          const sk = (tt as { params: unknown[] }).params[0] as number;
          if (e.have(sk)) s += 100;
          break;
        }
      }
      if (s > max) {
        max = s;
        best = e;
      }
    }
    return best;
  }

  // swf: LogicWeapon.§X\x1e`\x1b§ — time to switch to this weapon.
  switchCost(t: Trooper): number {
    if (this === t.weap) return 0;
    let n = 0;
    if (!t.have(SKILLS.JUGGLER)) n = (n + (this.data.handling | 0) + (t.weap!.data.handling | 0)) | 0;
    if (this.square != null) n = (n + 30) | 0;
    return n;
  }

  // swf: LogicWeapon.§q6,}\x03§ (getStatus)
  getStatus(): { rounds: number; ammo: number; vkd: boolean } {
    return { rounds: this.rounds, ammo: this.ammo, vkd: this.spare };
  }

  // swf: LogicWeapon.§*\x1f\n$§ — infos sent to the client.
  getInfos(): { type: number; status: object; id: number } {
    return { type: this.data.id, status: this.getStatus(), id: this.uid };
  }

  // swf: LogicWeapon.§z\x14\x01G\x03§ — time to reload this weapon.
  reloadCost(t: Trooper): number {
    if (this.ammo > 0 && t.hasAuto(SKILLS.LOADER)) return 0;
    let n = this.data.rounds | 0;
    if (n > this.ammo) n = this.ammo;
    if (n > 0) {
      let c = ((this.data.handling | 0) * 2 + (this.data.reload | 0) * n) | 0;
      if (t.have(SKILLS.NIMBLE_FINGERS)) c >>= 1;
      return c;
    }
    return 20000;
  }

  // swf: LogicWeapon.§Z0D\\\x02§
  rangeMin(): number {
    if (this.data.rmin == null) return 1;
    return this.data.rmin | 0;
  }

  // swf: LogicWeapon.§;\x1d`3\x01§
  rangeMax(): number {
    if (this.data.rmax == null) return 48;
    let r = this.data.rmax;
    if (this.owner.have(SKILLS.BARREL_EXTENSION) && this.data.rmax > 1) r += 1;
    return r | 0;
  }

  // swf: LogicWeapon.§4%DX§ — dropped on `sq` (or lost when `lost`).
  drop(sq: Square, lost = false): void {
    if (LogicWeapon.isNatural(this.data.id)) return;
    arrayRemove(this.owner.weapons, this);
    this.owner.resetWeapon();
    this.tr = null;
    if (lost) return;
    this.square = sq;
    sq.weapons.push(this);
  }

  // swf: LogicWeapon.§4H)\x01§ (aim)
  aim(): boolean {
    const t = this.owner;
    t.state = TrooperState.AIM;
    t.msg(BattleMsg.Aim(this.target!.data.id | 0));
    let n = ((this.data.aim | 0) * this.target!.square!.getDist(t.square!)) | 0;
    if (t.have(SKILLS.COLD_BLOODED)) n >>= 1;
    t.incTime(n);
    return true;
  }
}
