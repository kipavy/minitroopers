// swf: logic.Trooper (§59=F\x03§) — hits, dodges, damage, falls (methods of Trooper).
import { BMath } from "../../core/bmath.ts";
import { arrayRemove } from "../../data/data.ts";
import { SKILLS, WEAPONS } from "../../data/enums.ts";
import { HitEvent } from "../../msg/battleMsg.ts";
import { HDIR } from "../battle.ts";
import { BodyLoc, DamageType, Status, TrooperState, WeaponClass, WeaponHab } from "../logicEnums.ts";
import { LogicWeapon } from "../logicWeapon.ts";
import type { Square } from "../square.ts";
import { Trigger } from "../logicEnums.ts";
import type { HitResult } from "../types.ts";
import type { Trooper } from "./trooper.ts";

// swf: Trooper.§@\x1f\x1eb\x03§ — dodge (DODGER), cover, tuck-and-roll.
export const dodge = (t: Trooper, h: HitResult, dt: number): boolean => {
  if (dt === DamageType.CRASH) return false;
  if (t.rolling) return true;
  if (dt !== DamageType.EXPLOSION && t.tryAuto(SKILLS.DODGER, h)) return true;
  // P-code: the seed local is set to bat.seed inside the condition (decompile hides it).
  if (t.have(SKILLS.TAKE_COVER) && t.state === TrooperState.RELOAD && t.bat.seed.random(2) === 0) return true;
  if (
    dt !== DamageType.MELEE &&
    !t.weap!.have(WeaponHab.HEAVY) &&
    !t.hasStatus(Status.PARALYZED) &&
    t.tryAuto(SKILLS.TUCK_AND_ROLL, h)
  ) {
    let list: Square[] = [];
    for (const d of HDIR) {
      const sq = t.bat.getSq(t.square!.x + d[0], t.square!.y + d[1]);
      if (sq != null && sq.tr == null) list.push(sq);
    }
    const armed: Square[] = [];
    for (const sq of list) if (sq.weapons.length > 0) armed.push(sq);
    if (armed.length > 0) list = armed;
    if (list.length > 0) {
      t.rolling = true;
      const to = list[t.bat.seed.random(list.length)]!;
      h.dmg = -1;
      h.type = DamageType.MISS;
      t.weap!.updateScore(t);
      let took = false;
      for (const w of to.weapons) {
        w.updateScore(t);
        if (w.score > t.weap!.score) {
          w.takenBy(t);
          took = true;
          break;
        }
      }
      if (took) t.boost(50, false);
      h.events.push(HitEvent.ROLL(to.x, to.y, t.weap!.getInfos(), took));
      if (t.state === TrooperState.FALLEN) t.state = TrooperState.IDLE;
      t.setSquare(to);
    }
    return true;
  }
  return false;
};

// swf: Trooper.§3\x19/\x01§ (hit) — damage `dmg` by `by`, at body location `loc`.
export const hit = (t: Trooper, dmg: number, by: Trooper | null, dt: number | null, loc: number | null): HitResult => {
  const h: HitResult = { tid: t.data.id | 0, dmg: dmg | 0, type: dt as number, loc, events: [] };
  if (t.isDead()) return h;
  const b = by!;
  if (b.side === t.side) {
    if (t.have(SKILLS.SUSPICIOUS)) {
      h.dmg = 0;
      h.type = DamageType.MISS;
      h.events.push(HitEvent.SKILL(SKILLS.SUSPICIOUS));
    }
  }
  if (t.hasStatus(Status.CURSED)) h.dmg = ((h.dmg | 0) + 1) | 0;
  if (t.vehicule != null) return t.vehicule.hit(h);
  if (
    dt !== DamageType.WRESTLE &&
    dt !== DamageType.FALL &&
    h.type !== DamageType.MISS &&
    !b.have(SKILLS.HEAT_SENSOR) &&
    !t.hasStatus(Status.LOCKED)
  ) {
    if (t.dodge(h, dt as number)) {
      h.dmg = -1;
      h.type = DamageType.MISS;
    }
  }
  let crit: number | null = null;
  let stagger = 36;
  let k: number;
  if (loc != null && h.type !== DamageType.MISS) {
    k = (t.getInjuries(loc) + 1) | 0;
    switch (loc) {
      case 0:
        if (!t.have(SKILLS.FULL_METAL_BALACLAVA)) k = (k * 2) | 0;
        crit = 4;
        if (t.helmet) {
          t.helmet = false;
          h.events.push(HitEvent.HELMET);
          switch (t.ghost.job) {
            default:
              h.dmg = 1;
              crit = null;
              break;
            case 4:
            case 6:
              break;
          }
        }
        break;
      case 1:
        crit = 8;
        if (by != null && by.have(SKILLS.HEARTBREAKER)) crit >>= 1;
        break;
      case 2:
        crit = 20;
        break;
      case 3:
        crit = 18;
        break;
      case 4:
        stagger = 4;
        break;
      case 5:
        stagger = 2;
        break;
      case 6:
      case 7:
        break;
    }
    if (crit != null) {
      if (b.weap != null && dt === b.weap.data.damageType) crit = ((crit * 10) / (b.weap.data.crit | 0)) | 0;
      if (b.have(SKILLS.ANATOMY)) crit >>= 1;
      if (t.hasStatus(Status.CURSED)) crit >>= 1;
      if (t.have(SKILLS.INVINCIBLE)) crit = null;
      switch (dt) {
        default:
          crit = null;
          break;
        case 0:
        case 1:
        case 3:
          break;
      }
    }
    if (t.have(SKILLS.HARD_BOILED)) k = 1;
    h.dmg = ((h.dmg | 0) * k) | 0;
  }
  k = 0;
  if (t.have(SKILLS.HEAVY_ARMOR)) k++;
  if (t.have(SKILLS.BULLETPROOF_VEST) && (loc === BodyLoc.TORSO_LEFT || loc === BodyLoc.TORSO_RIGHT || loc === BodyLoc.STOMACH)) {
    k++;
    if (crit != null) crit <<= 1;
  }
  if (t.have(SKILLS.FULL_METAL_BALACLAVA) && loc === BodyLoc.HEAD) {
    k++;
    if (crit != null) crit <<= 1;
  }
  if (b.have(SKILLS.ARMOR_PIERCING_SHELLS) && dt === DamageType.BULLET) k = 0;
  if (b.weap != null && b.weap.have(WeaponHab.PIERCE)) k = 0;
  h.dmg = ((h.dmg | 0) - k) | 0;
  if (dt === DamageType.MELEE) {
    if (b.have(SKILLS.FISTS_OF_FURY)) {
      h.dmg = ((h.dmg as number) + 1) as number;
      stagger = 2;
    }
    if (b.have(SKILLS.DEATH_GRIP)) h.dmg = ((h.dmg as number) + 1) as number;
  }
  if (dt === DamageType.BULLET) {
    if (b.have(SKILLS.TOXIC_SHELLS)) t.tryStatus(200 + t.bat.seed.random(200), Status.POISON, h);
    if (b.have(SKILLS.HYDROSHOCK_SHELLS) && crit != null) crit >>= 2;
    if (b.have(SKILLS.PARALYSING_SHELLS)) t.tryStatus(400 + t.bat.seed.random(200), Status.PARALYZED, h);
  }
  t.addPredatorScore(by, h.dmg | 0);
  let critical = false;
  if (crit != null && h.type !== DamageType.MISS) {
    critical = t.bat.seed.random(crit) === 0;
  }
  const w = t.weap!.data.id;
  if ((h.dmg | 0) > 1 && w !== WEAPONS.FISTS && t.vehicule == null) {
    // P-code: the seed local is bat.seed here too.
    if (!t.have(SKILLS.DEATH_GRIP) && t.bat.seed.random(stagger) === 0) {
      t.dropWeapon(h, false);
      t.interrupt(10);
    }
  }
  if ((h.dmg | 0) < 0) h.dmg = 0;
  let shaken = true;
  if ((h.dmg | 0) === 0 || t.have(SKILLS.UNSHAKABLE)) shaken = false;
  if ((dt === DamageType.MELEE || dt === DamageType.D3) && t.bat.seed.random(4) > 0) shaken = false;
  t.applyDamage(h, critical, by);
  if (loc != null && (h.dmg | 0) > 0) t.injuries.push(loc);
  if (t.life === 0) {
    if (critical) h.events.push(HitEvent.CRITICAL);
  } else if ((h.dmg | 0) > 0 && t.state !== TrooperState.FALLEN) {
    if (shaken) {
      t.interrupt(10);
    } else {
      h.events.push(HitEvent.STILL);
    }
  }
  return h;
};

// swf: Trooper.§y'n\x1f\x01§ — applies `h.dmg`; death unless LUCKY_CHARM (Skill h$qD).
export const applyDamage = (t: Trooper, h: HitResult | null, crit: boolean, by: Trooper | null): void => {
  if (t.isDead()) return;
  let n = h!.dmg | 0;
  if (n < 0) n = 0;
  t.life = (t.life - n) | 0;
  if (t.life <= 0) t.life = 0;
  if (t.life === 0 || crit) {
    if (t.tryAuto(SKILLS.LUCKY_CHARM, h)) {
      t.life = 1;
      h!.events.push(HitEvent.E9);
      return;
    }
    if (h != null) t.dropWeapon(h, true);
    t.die();
    t.bat.addTrigger(Trigger.Kill(by, t));
  }
};

// swf: Trooper.§r\x13N\x01§ (knockOut) — pushed back along `angle` up to `dist`.
export const knockOut = (t: Trooper, angle: number, dist: number, h: HitResult | null, spread: number): boolean => {
  if (t.state === TrooperState.FALLEN || t.have(SKILLS.UNSHAKABLE) || !t.canBeMoved()) return false;
  const cone = t.bat.getCone(t.square!, angle, spread, dist);
  const free: Square[] = [];
  for (const sq of cone) if (sq.isFree()) free.push(sq);
  arrayRemove(free, t.square!);
  if (free.length === 0) return false;
  if (h == null) return true;
  const to = free[t.bat.seed.random(free.length)]!;
  const f = t.fall(0);
  t.interrupt(10);
  h.events.push(HitEvent.FLY_TO(to.x, to.y, 30, f));
  t.setSquare(to);
  return true;
};

// swf: Trooper.§vx\r&§ (fall) — falls down (fall damage n draws).
export const fall = (t: Trooper, n: number): HitResult => {
  t.holster(true);
  let wait = (90 + t.bat.seed.random(40)) | 0;
  let dmg = (1 + t.bat.seed.random(2 + n)) | 0;
  if (t.have(SKILLS.BOUNCE_BACK)) {
    wait = 0;
    dmg = 0;
    t.time = (t.bat.btime - 1) | 0;
  }
  t.interrupt(wait);
  t.state = TrooperState.FALLEN;
  return t.selfDamage(dmg, DamageType.FALL);
};

// swf: Trooper.§R\x12SM§ — the weapon in hand is dropped nearby (or lost on death).
export const dropWeapon = (t: Trooper, h: HitResult, lost: boolean): void => {
  if (LogicWeapon.isNatural(t.weap!.data.id) || t.vehicule != null) return;
  const sq = lost ? t.square! : t.square!.shake(1)!;
  h.events.push(HitEvent.DROP(sq.x, sq.y, lost));
  t.weap!.drop(sq, lost);
};

// swf: Trooper.§f\x06ac\x02§ — hit chance (%) of the weapon in hand against `e`, shot index `shot`.
export const hitChance = (t: Trooper, e: Trooper, shot: number): number => {
  if (e.hasStatus(Status.LOCKED)) return 100;
  let c = t.weap!.data.hit | 0;
  let m = (shot * (t.weap!.data.hitmin | 0)) | 0;
  if (t.have(SKILLS.COMPENSATOR)) m >>= 1;
  c -= m;
  const melee = t.weap!.data.type === WeaponClass.MELEE;
  if (e.moving && !t.have(SKILLS.BIPED)) {
    const s = e.getSpeed();
    const k = s * 0.75;
    if (k < 1) c *= k;
    if (e.have(SKILLS.ZIGZAG)) c *= 0.5;
  }
  if (e.hasStatus(Status.PARALYZED)) c *= 2;
  if (e.have(SKILLS.WIFE_BEATER)) c *= 0.7;
  if (t.hasStatus(Status.BLIND) && !t.have(SKILLS.BLIND_FURY)) c *= 0.5;
  if (!melee) {
    if (!t.have(SKILLS.BLIND_FURY)) {
      let cover = 0;
      const line = BMath.bresenham(t.square!.x, t.square!.y, e.square!.x, e.square!.y);
      for (const o of t.bat.troopers) o.flag = 0;
      for (const p of line) {
        const sq = t.bat.getSq(p.x | 0, p.y | 0);
        if (!(sq == null || sq.tr == null || sq.tr.flag === 1)) {
          if (!(sq.tr === t || sq.tr === e)) {
            sq.tr.flag = 1;
            cover = (cover + sq.tr.getCover(t.side)) | 0;
          }
        }
      }
      c *= Math.max(0, 1 - cover * 0.2);
    }
    if (t.have(SKILLS.LASER_SIGHTS)) c *= 1.8;
    if (t.have(SKILLS.EYE_OF_THE_TIGER)) c *= 1.5;
    if (t.have(SKILLS.HEAT_SENSOR)) c *= 1.2;
    if (t.have(SKILLS.BARREL_EXTENSION)) c *= 1.1;
    if (e.have(SKILLS.CAMOUFLAGE)) c *= 0.8;
    if (e.have(SKILLS.BAIT)) c *= 2;
  }
  if (e.vehicule != null) c *= (e.vehicule.data.hit | 0) / 100;
  if (c < 5) c = 5;
  return c;
};
