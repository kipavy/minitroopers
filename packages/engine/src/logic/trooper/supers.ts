// swf: logic.Trooper (§59=F\x03§) — super skills: choice, use, grenades.
import { Arr } from "../../core/arr.ts";
import { BODY_LOC, SKILL, XMAX, YMAX, arrayRemove, has } from "../../data/data.ts";
import { SKILLS, WEAPONS } from "../../data/enums.ts";
import { BattleMsg, HitEvent } from "../../msg/battleMsg.ts";
import { Anim, DamageType, SkillCategoryIdx, Status, TrooperState, WeaponClass } from "../logicEnums.ts";
import { LogicWeapon } from "../logicWeapon.ts";
import type { Square } from "../square.ts";
import type { HitResult, TrooperData } from "../types.ts";
import { Trooper, defaultPrefData } from "./trooper.ts";

// swf: Trooper.§,\x01\x12K§ (getSuper) — draws the super skill to use this turn, if any.
export const getSuper = (t: Trooper): number | null => {
  if (t.vehicule != null || t.hasStatus(Status.PARALYZED)) return null;
  const range = t.square!.range[t.player.opp.side]! | 0;
  let slot: (typeof t.supers)[number] | null = null;
  let i = 0;
  const list = t.supers;
  search: for (;;) {
    if (i >= list.length) return null;
    slot = list[i]!;
    i++;
    t.targets = [];
    t.aimSquare = null;
    let w = (slot.weight as number) | 0;
    if (t.have(SKILLS.MUNITIONS) && has(SKILL[slot.skill]!.cat, SkillCategoryIdx.GRENADE)) w >>= 1;
    if (t.have(SKILLS.HURRY)) w >>= 1;
    if (t.bat.seed.random(w) <= 0) {
      switch (slot.skill) {
        case 1: {
          for (const e of t.player.getWounded()) {
            if (!(e === t || e.healed)) {
              if (e.getDistTo(t.square!) < 6) {
                if (e.square!.freeNei().length > 0) t.targets.push(e);
              }
            }
          }
          if (t.targets.length !== 0) break search;
          continue;
        }
        case 50: {
          const r = (t.player.opp.troopers.length | 0) / (t.player.troopers.length | 0);
          if (!(r > 0.5 || t.player.opp.pool.length === 0)) break search;
          continue;
        }
        case 63:
          if (!(t.getSpeed() > 2 || t.weap!.isHeavy() || t.weap!.data.type === WeaponClass.EXPLOSIVE || t.weap!.data.type === WeaponClass.C6)) {
            for (const e of t.player.opp.troopers) {
              if (!(!e.isMovable() || !e.knockOut(t.square!.getAngle(e.square!), 4))) {
                const d = t.getDistTo(e.square!);
                if (!(d < 3 || d > 7)) t.targets.push(e);
              }
            }
            if (t.targets.length !== 0) break search;
          }
          continue;
        case 68:
          for (const e of t.player.opp.troopers) {
            const d = e.getDistTo(t.square!);
            if (d > 3 && d < 8 && !LogicWeapon.isNatural(e.weap!.data.id) && e.isMovable()) t.targets.push(e);
          }
          if (t.targets.length !== 0) break search;
          continue;
        case 82:
          if (range > 1) {
            t.aimSquare = t.bestArea(2, 2);
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 83:
          if (range > 1) {
            t.aimSquare = t.bestArea(2, 3, true, false, (e) => (e.hasStatus(Status.BLIND) ? -100 : 0));
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 84:
          if (range > 1) {
            t.aimSquare = t.bestArea(1, 3, true, false, (e) => (e.statusImmune() ? -100 : 0));
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 85:
          if (range > 1) {
            const free: Square[] = [];
            for (const sq of t.bat.squares) if (sq.isFree()) free.push(sq);
            if (free.length !== 0) {
              t.aimSquare = free[t.bat.seed.random(free.length)]!;
              break search;
            }
          }
          continue;
        case 86:
          if (range > 1) {
            t.aimSquare = t.bestArea(1, 4);
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 87:
          if (range > 1) {
            t.aimSquare = t.bestArea(1, 3, true, false, (e) => (e.weap!.data.id === WEAPONS.FISTS ? -100 : 0));
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 88:
          if (range > 1) {
            t.aimSquare = t.bestArea(1, 3);
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 89:
          if (range > 1) {
            t.aimSquare = t.bestArea(2, 3);
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 90:
          if (range > 1) {
            t.aimSquare = t.bestArea(1, 3, true, true, (e) => (-(e.life / e.getLifeMax()) * 100) | 0);
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 91:
          if (range > 1) {
            // The SWF builds a bonus closure here but does not pass it.
            t.aimSquare = t.bestArea(2, 3);
            if (!(t.aimSquare == null || t.aimSquare.flag <= 0)) break search;
          }
          continue;
        case 111:
          for (const e of t.player.deads) {
            if (e.square != null) {
              if (e.square.sideDist(e.side) < 6) t.targets.push(e);
            }
          }
          if (t.targets.length !== 0) break search;
          continue;
        case 122: {
          // `break loop0`: melee targets around, else no super at all.
          for (const sq of t.square!.nei) {
            if (!(sq == null || sq.tr == null || sq.tr.side === t.side || sq.tr.state === TrooperState.FALLEN || sq.tr.isFlying())) {
              t.targets.push(sq.tr);
            }
          }
          if (t.targets.length === 0) return null;
          break search;
        }
        case 125:
          if (!(t.player.troopers.length > 12 || t.player.pool.length === 0 || t.player.getDeploySquares().length === 0)) {
            const r = (t.player.troopers.length | 0) / (t.player.opp.troopers.length | 0);
            if (!(r < 0.5 && t.player.pool.length > t.player.troopers.length)) break search;
          }
          continue;
        case 129:
          if (t.life >= 6) break search;
          continue;
        case 133:
          for (const e of t.player.opp.troopers) if (!e.hasStatus(Status.CURSED)) t.targets.push(e);
          if ((t.targets.length | 0) / (t.player.opp.troopers.length | 0) >= 0.25) break search;
          continue;
        case 136:
          for (const e of t.enemyNeighbours()) if (e.isMovable()) t.targets.push(e);
          if (t.targets.length !== 0) break search;
          continue;
        case 44:
          break search;
        default:
          continue;
      }
    }
  }
  slot!.num--;
  if ((slot!.num | 0) === 0) {
    arrayRemove(t.supers, slot!);
    t.lastUse(slot!.skill);
  }
  return slot!.skill;
};

// swf: Trooper.§lB{u\x01§ (useSuper)
export const useSuper = (t: Trooper, skill: number): void => {
  const hits: HitResult[] = [];
  let rec = SKILL[skill]!.rec as number | null;
  const lvls = t.data.choices.length | 0;
  const bat = t.bat;
  const rnd = (n: number): number => bat.seed.random(n);
  sw: switch (skill) {
    case 1: {
      let e: Trooper | null = null;
      let best = 999;
      for (const o of t.targets) {
        const d = t.square!.getDist(o.square!);
        if (d < best) {
          best = d;
          e = o;
        }
      }
      if (e != null) {
        const sq = t.freeSquareNear(e)!;
        t.moveTo(sq);
        t.resetWeapon(false);
        const n = (5 + lvls) | 0;
        t.msg(BattleMsg.Skill(SKILLS.DOCTOR, [e.data.id | 0]));
        e.heal(n);
        e.injuries = [];
        t.msg(BattleMsg.Heal(e.data.id | 0, n));
        rec = (rec as number) - lvls;
      }
      break;
    }
    case 44:
      t.resetWeapon(false);
      t.msg(BattleMsg.Skill(skill));
      t.setStatus(Status.AMPHETAMINE, 300);
      break;
    case 50: {
      t.resetWeapon(false);
      t.msg(BattleMsg.Skill(SKILLS.BINOCULARS));
      const list = t.player.opp.deploy(1);
      if (list.length > 0) list[0]!.time = (list[0]!.time + 400) | 0;
      break;
    }
    case 63: {
      const res: HitResult[] = [];
      const e = t.targets[rnd(t.targets.length)]!;
      const sq = e.square!;
      const a = t.square!.getAngle(sq);
      const h = e.hit(t.getLifeMax() >> 1, t, DamageType.WRESTLE, e.randomLoc());
      res.push(h);
      const ko = e.knockOut(a, 4, h, 0.5);
      if (ko) {
        t.moveTo(sq, 3, false);
      } else {
        const h2 = t.selfDamage(e.getLifeMax() >> 2, DamageType.WRESTLE);
        const tmp = bat.firstFreeSquare();
        e.setSquare(tmp);
        t.moveTo(sq, 3, false);
        if (!t.knockOut(a + 3.14, 4, h2, 0.5)) t.recal();
        e.setSquare(sq);
        res.push(h2);
      }
      t.moving = true;
      t.msg(BattleMsg.Skill(skill, [e.data.id | 0], null, res));
      break;
    }
    case 68: {
      t.resetWeapon(false);
      const e = t.targets[rnd(t.targets.length)]!;
      e.weap!.takenBy(t);
      e.interrupt(10);
      t.msg(BattleMsg.Skill(skill, [e.data.id | 0]));
      break;
    }
    case 82: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const res = bat.explode(p.x | 0, p.y | 0, 2, 6, true, t);
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, res));
      break;
    }
    case 83: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const list = bat.troopersInArea(p.x | 0, p.y | 0, 3, true);
      for (const e of list) {
        const h = e.shock();
        e.setStatus(Status.BLIND, 500 + rnd(200), h);
        hits.push(h);
      }
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, hits));
      break;
    }
    case 84: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const list = bat.troopersInArea(p.x | 0, p.y | 0, 3, true);
      for (const e of list) hits.push(e.shock());
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, hits));
      for (const e of list) e.tryStatus(500 + rnd(200), Status.POISON);
      break;
    }
    case 85: {
      const data: TrooperData = {
        pref: defaultPrefData(),
        name: "bibi le clown",
        force: [SKILLS.INVINCIBLE, SKILLS.SEMELLES_DE_PLOMB],
        choices: [],
        type: 1,
        id: -(bat.clownCounter = (bat.clownCounter + 1) | 0),
        seed: rnd(3300),
      };
      const c = new Trooper(bat, data, t.player);
      t.player.troopers.push(c);
      bat.troopers.push(c);
      c.init(bat);
      c.setSquare(t.aimSquare);
      c.incTime(200000);
      const infos = c.getInfos();
      t.msg(BattleMsg.Grenade(skill, t.aimSquare!.x, t.aimSquare!.y, [], null, infos));
      break;
    }
    case 86: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const list = bat.troopersInArea(p.x | 0, p.y | 0, 4, true);
      for (const e of list) {
        const loc = BODY_LOC[rnd(BODY_LOC.length)]!;
        hits.push(e.hit(1 + rnd(5), t, DamageType.BULLET, loc));
      }
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, hits));
      break;
    }
    case 87: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const list = bat.troopersInArea(p.x | 0, p.y | 0, 3, true);
      for (const e of list) {
        if (!e.have(SKILLS.DEATH_GRIP)) {
          const h = e.shock();
          h.events.push(HitEvent.SHOCKED);
          e.dropWeapon(h, false);
          e.interrupt(60);
          hits.push(h);
        }
      }
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, hits));
      break;
    }
    case 88: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const list = bat.troopersInArea(p.x | 0, p.y | 0, 3, true);
      for (const e of list) {
        const h = e.shock();
        h.events.push(HitEvent.SHOCKED);
        e.interrupt(200);
        hits.push(h);
      }
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, hits));
      break;
    }
    case 89: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const res = bat.explode(p.x | 0, p.y | 0, 3, 12, true, t);
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, res));
      break;
    }
    case 90: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const list = bat.troopersInArea(p.x | 0, p.y | 0, 3, true);
      for (const e of list) {
        if (e.vehicule == null) {
          e.heal(10);
          hits.push(e.missResult());
        }
      }
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, hits));
      break;
    }
    case 91: {
      const p = t.aimGrenade(skill, 1);
      if (p == null) break sw;
      const list = bat.troopersInArea(p.x | 0, p.y | 0, 3, true);
      for (const e of list) {
        if (e.canBeMoved()) {
          e.kill();
          hits.push(e.missResult());
        }
      }
      t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, hits));
      break;
    }
    case 111: {
      t.resetWeapon(false);
      const e = t.targets[rnd(t.targets.length)]!;
      t.player.addToPool(e.data, false);
      arrayRemove(t.player.deads, e);
      const sq = t.respawnSquare()!;
      t.setSquare(sq);
      t.msg(BattleMsg.Rescue(e.data.id | 0, sq.x, sq.y));
      break;
    }
    case 122: {
      const e = t.targets[rnd(t.targets.length)]!;
      const h = e.hit(3, t, DamageType.MELEE);
      const dx = (e.square!.x - t.square!.x) | 0;
      if (e.vehicule == null && Math.abs(dx) > 0 && rnd(200) > 0 && e.isReal()) {
        let x = e.square!.x;
        const list: Square[] = [];
        for (let i = 0; i < 3; i++) {
          x = (x + dx) | 0;
          const sq = bat.getSq(x, e.square!.y);
          if (sq != null && sq.isFree()) list.push(sq);
        }
        if (list.length > 0) {
          const sq = list[rnd(list.length)]!;
          h.events.push(HitEvent.FLY_TO(sq.x, sq.y, 20, e.fall(1)));
          e.setSquare(sq);
        }
      }
      t.msg(BattleMsg.Brawl(e.data.id | 0, null, h, Anim.KICK));
      break;
    }
    case 125: {
      t.resetWeapon(false);
      t.msg(BattleMsg.Skill(skill));
      const list = t.player.deploy(1);
      if (list.length > 0) list[0]!.boost(100, true);
      break;
    }
    case 129:
      t.resetWeapon(false);
      t.msg(BattleMsg.Skill(skill));
      t.boost(500, true);
      t.setStatus(Status.POISON, 180);
      break;
    case 133: {
      t.resetWeapon(false);
      const ids: number[] = [];
      for (const e of t.targets) ids.push(e.data.id | 0);
      t.msg(BattleMsg.Skill(skill, ids));
      for (const e of t.targets) e.setStatus(Status.CURSED, 800);
      break;
    }
    case 136: {
      if (t.weap!.data.type !== WeaponClass.MELEE) t.holster(false);
      const e = t.targets[rnd(t.targets.length)]!;
      const dir = e.square!.x - t.square!.x > 0 ? 1 : -1;
      let x = e.square!.x;
      const list: Square[] = [];
      for (let i = 0; i < 5; i++) {
        x = (x - dir) | 0;
        const sq = bat.getSq(x, e.square!.y);
        if (sq != null && sq.isFree()) list.push(sq);
      }
      if (list.length === 0) return;
      const to = list[rnd(list.length)]!;
      const from = e.square!;
      const n = Math.abs(to.x - from.x) | 0;
      e.setSquare(to);
      t.setSquare(from);
      const h = e.hit(4, t, DamageType.WRESTLE);
      h.events.push(HitEvent.FLY_TO(to.x, to.y, 60 + n * 10, e.fall(n)));
      t.msg(BattleMsg.Wrestle(e.data.id | 0, h, dir));
      break;
    }
  }
  t.incTime((rec as number) | 0);
};

// swf: Trooper.§q8 \x03§ — grenade landing point near aimSquare; an enemy may intercept it.
export const aimGrenade = (t: Trooper, skill: number, err: number): { x: number; y: number } | null => {
  const bat = t.bat;
  if (t.have(SKILLS.KING_OF_BOULES)) err = 0;
  if (t.hasStatus(Status.BLIND)) err += 2;
  const p = bat.randomNear(t.aimSquare!, err);
  const sq = bat.getSq(p.x | 0, p.y | 0);
  if (sq == null) return p;
  const around = sq.troopersAround(3);
  const list: Trooper[] = [];
  for (const e of around) {
    // P-code: the seed local is bat.seed (draw only when the first two tests pass).
    if (e.side !== t.side && e.vehicule == null && bat.seed.random(2) === 0 && e.tryAuto(SKILLS.INTERCEPTION, null, true) && !e.weap!.isHeavy()) {
      list.push(e);
    }
  }
  if (list.length > 0 && sq != null && skill !== SKILLS.FRAGMENTATION_GRENADE && bat.seed.random(bat.interceptions) === 0) {
    bat.interceptions = (bat.interceptions + 1) | 0;
    let by: Trooper | null = null;
    let best = 99.9;
    for (const e of list) {
      const d = Math.abs(e.square!.x - (p.x | 0)) + Math.abs(e.square!.y - (p.y | 0));
      if (d < best) {
        best = d;
        by = e;
      }
    }
    by!.holster();
    by!.state = TrooperState.IDLE;
    t.msg(BattleMsg.Grenade(skill, p.x | 0, p.y | 0, [], by!.data.id | 0));
    if (sq.tr == null) {
      by!.setSquare(sq);
    } else if (sq.tr !== by) {
      const s = by!.square!;
      by!.msg(BattleMsg.Move(s.x, s.y));
    }
    by!.aimSquare = by!.bestArea(2, 2);
    by!.useSuper(skill);
    return null;
  }
  return p;
};

// swf: Trooper.§_A\x1es\x03§ — the square whose n×n area scores best (enemies +100, allies −100).
export const bestArea = (
  t: Trooper,
  minDist: number,
  n: number,
  ground: boolean,
  friendly: boolean,
  bonus: ((e: Trooper) => number) | null,
): Square | null => {
  let to: Square | null = null;
  let best = -10;
  const k = friendly ? -1 : 1;
  const list = t.bat.squares.slice();
  Arr.shuffle(list, t.bat.seed);
  for (const sq of list) {
    if (!(minDist > 1 && t.getDistTo(sq) < minDist)) {
      const around = sq.troopersAround(n);
      let s = 0;
      for (const e of around) {
        if (e.isFlying() !== ground) {
          if (bonus != null) s = (s + (bonus(e) | 0)) | 0;
          s = (s - e.square!.getDist(sq)) | 0;
          if (e.player === t.player.opp) {
            s = (s + 100 * k) | 0;
          } else {
            s = (s - 100 * k) | 0;
          }
        }
      }
      if (s > best) {
        best = s;
        to = sq;
        sq.flag = s;
      }
    }
  }
  return to;
};

// swf: Trooper.§ 4q}\x03§ — free square on the first column (from our edge) nearest our row.
export const respawnSquare = (t: Trooper): Square | null => {
  let x = 0;
  if (t.side === 1) x = XMAX - 1;
  let to: Square | null = null;
  for (let i = 0; i < 6; i++) {
    let best = 99.9;
    for (let y = 0; y < YMAX; y++) {
      const sq = t.bat.getSq(x, y)!;
      if (sq.isFree()) {
        const d = Math.abs(y - t.square!.y);
        if (d < best) {
          best = d;
          to = sq;
        }
      }
    }
    if (to != null) break;
    x = (x - (t.side * 2 - 1)) | 0;
  }
  return to;
};
