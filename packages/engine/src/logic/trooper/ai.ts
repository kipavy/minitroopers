// swf: logic.Trooper (§59=F\x03§) — a trooper's turn: weapons, moves, side actions.
import { SKILLS } from "../../data/enums.ts";
import { BattleMsg } from "../../msg/battleMsg.ts";
import { Anim, DamageType, MoveSystem, SideAction, Size, Status, TrooperState } from "../logicEnums.ts";
import type { LogicWeapon } from "../logicWeapon.ts";
import type { Square } from "../square.ts";
import type { HitResult } from "../types.ts";
import type { Trooper } from "./trooper.ts";

// swf: Trooper.§\rlj\x1a§ (play)
export const play = (t: Trooper): void => {
  t.moving = false;
  const w = t.weap!;
  switch (t.state) {
    case 0: {
      if (t.vehicule != null) {
        t.vehicule.play();
        return;
      }
      const sk = t.getSuper();
      if (sk != null) {
        t.useSuper(sk);
        return;
      }
      if (t.chooseWeapon()) return;
      if (t.pickWeapon()) return;
      if (t.sideAction()) return;
      if (w.shootOrReload(false)) return;
      if (t.approach()) {
        if (t.have(SKILLS.RUSH)) {
          w.shootOrReload(true);
          if ((t.state as number) === TrooperState.AIM) t.weap!.fire();
        }
        return;
      }
      if (t.sideAction()) return;
      t.incTime(120);
      break;
    }
    case 1:
      if (t.weap!.target == null) t.msg(BattleMsg.Positions([t.square!.x, t.square!.y]));
      if (t.weap!.isValidTarget(t.weap!.target) && t.weap!.canTarget(t.weap!.target)) {
        t.weap!.fire();
      } else {
        t.msg(BattleMsg.Aim(-1));
        t.state = TrooperState.IDLE;
        t.incTime(10);
      }
      break;
    case 2:
      w.reload();
      break;
    case 3:
      t.incTime(1000);
      break;
    case 4:
      t.state = TrooperState.IDLE;
      if (t.have(SKILLS.BOUNCE_BACK)) t.boost(100, true);
      t.msg(BattleMsg.Anim(Anim.GET_UP));
      t.incTime(10);
      break;
  }
};

// swf: Trooper.§I\x14\x040§ — switches to the best-scored weapon.
export const chooseWeapon = (t: Trooper): boolean => {
  let max = -999999.9;
  let best = t.weap;
  t.log = "";
  for (const w of t.weapons) {
    w.updateScore(t);
    if (w.score > max) {
      best = w;
      max = w.score;
    }
  }
  if (best === t.weap) return false;
  t.switchWeapon(best!);
  return true;
};

// swf: Trooper.§O5w\x03§ — picks up a better weapon lying within reach.
export const pickWeapon = (t: Trooper): boolean => {
  if (t.ghost.data.type === 2) return false;
  let max = t.weap!.score;
  let best: LogicWeapon | null = null;
  let n = 5;
  if (t.have(SKILLS.SPRINTER)) n *= 2;
  const area = t.square!.around(n);
  const list: Square[] = [];
  for (const sq of area) if (sq.isFree() && sq.weapons.length > 0) list.push(sq);
  for (const sq of list) {
    for (const w of sq.weapons) {
      w.updateScore(t);
      if (w.score > max) {
        max = w.score;
        best = w;
      }
    }
  }
  if (best == null) return false;
  t.moveTo(best.square!, null, false);
  t.msg(BattleMsg.PickUp(best.uid));
  t.incTime(30 + best.switchCost(t));
  best.takenBy(t);
  return true;
};

// swf: Trooper.§d~'K\x03§ — moves towards the weapon's target.
export const approach = (t: Trooper): boolean => {
  if (t.hasStatus(Status.PARALYZED)) return false;
  const sq = t.bestMove(t.weap!.target);
  if (sq == null) return false;
  t.moveTo(sq, null, true);
  t.moving = true;
  return true;
};

// swf: Trooper.§_[V\x1e\x01§ — moves to a safer square (DEFENDER).
export const flee = (t: Trooper): boolean => {
  const oside = t.player.opp.side;
  const danger = t.square!.danger[oside]! | 0;
  const mr = t.moveRange();
  const range = t.square!.range[oside]! | 0;
  const rmax = t.weap!.rangeMax();
  const rmin = t.weap!.rangeMin();
  const inRange = range <= rmax && range >= rmin;
  const list = t.reachable(mr);
  let to: Square | null = null;
  let best = 9999999;
  let lim = (danger - (Math.ceil(10 / mr) | 0)) | 0;
  if (lim < 0) lim = 0;
  for (const sq of list) {
    if ((sq.danger[oside]! | 0) <= lim) {
      if (inRange) {
        const r = sq.range[oside]! | 0;
        if (r > rmax || r < rmin) continue;
      }
      const d = sq.getDist(t.square!);
      if (d < best) {
        best = d;
        to = sq;
      }
    }
  }
  if (to == null) return false;
  t.moveTo(to, null, true);
  t.moving = true;
  t.fleeCount = (t.fleeCount + 1) | 0;
  return true;
};

// swf: Trooper.§\x0bJ\x15g\x03§ — side actions, the best-weighted one above a random threshold.
export const sideAction = (t: Trooper): boolean => {
  let chosenTargets: Trooper[] = [];
  let thr = t.bat.seed.random(100);
  let chosen: number | null = null;
  for (const a of t.sides) {
    let w = 0;
    const targets: Trooper[] = [];
    switch (a) {
      case 0: {
        const n = t.have(SKILLS.STAMP) ? 3 : 7;
        const around = t.square!.troopersAround(n);
        for (const e of around) {
          if (!(e.side === t.side || e.state !== TrooperState.FALLEN)) {
            let ok = true;
            for (const sq of e.square!.nei) {
              if (sq != null && (sq.isFree() || sq.tr === t)) {
                ok = true;
                break;
              }
            }
            if (ok) targets.push(e);
          }
        }
        if (targets.length > 0) w = t.have(SKILLS.STAMP) ? 90 : 60;
        break;
      }
      case 1: {
        const around = t.square!.troopersAround(7);
        for (const e of around) {
          if (e.side === t.side && e.hasStatus(Status.POISON) && e !== t) targets.push(e);
        }
        if (targets.length > 0) w = 80;
        break;
      }
      case 2: {
        const free = t.square!.freeNei();
        if (free.length > 0) w = t.bat.seed.random(100);
        break;
      }
      case 3: {
        const around = t.square!.troopersAround(5);
        for (const e of around) {
          if (e.side !== t.side && e.isMovable()) targets.push(e);
        }
        if (targets.length > 0) w = 20;
        break;
      }
      case 4:
        if (t.weap!.ammo > 0 && t.getDanger() === 0 && t.weap!.rounds < (t.weap!.data.rounds | 0)) w = 75;
        break;
      case 5:
        t.player.opp.computeDanger();
        if (t.getDanger() > 0 && t.moveRange() > 1) {
          w = (100 - t.fleeCount * 25) | 0;
          if (w <= thr) t.fleeCount = 0;
        }
        break;
    }
    if (w > thr) {
      thr = w;
      chosen = a;
      chosenTargets = targets;
    }
  }
  if (chosen == null) return false;
  t.targets = chosenTargets;
  switch (chosen) {
    case SideAction.STOMP: {
      const e = t.getNearest(t.targets)!;
      const sq = t.freeSquareNear(e);
      if (sq != null) t.setSquare(sq);
      const h = e.hit(1 + t.bat.seed.random(3), t, DamageType.MELEE);
      t.msg(BattleMsg.Melee([h], 0));
      let n = 40;
      if (t.have(SKILLS.STAMP)) n >>= 2;
      t.incTime(n);
      break;
    }
    case SideAction.CURE: {
      const e = t.targets[t.bat.seed.random(t.targets.length)]!;
      const list = e.reachable(1);
      if (list.length === 0) return false;
      e.removeStatus(Status.POISON);
      t.moveTo(list[t.bat.seed.random(list.length)]!);
      t.resetWeapon(false);
      t.msg(BattleMsg.Cure(e.data.id | 0, 0));
      e.msg(BattleMsg.StatusOff(Status.POISON));
      t.incTime(10);
      break;
    }
    case SideAction.WANDER: {
      const list = t.square!.freeNei();
      t.moveTo(list[t.bat.seed.random(list.length)]!);
      t.moving = true;
      break;
    }
    case SideAction.STRANGLE: {
      const e = t.targets[t.bat.seed.random(t.targets.length)]!;
      t.resetWeapon(false);
      e.interrupt(20);
      e.state = TrooperState.FALLEN;
      e.resetWeapon(true);
      const n = (t.bat.seed.random(4) + 1) | 0;
      const hits: HitResult[] = [];
      for (let i = 0; i < n; i++) {
        const h = e.hit(2 + t.bat.seed.random(3), t, DamageType.MELEE, e.randomLoc());
        hits.push(h);
        if (e.isDead()) break;
      }
      t.msg(BattleMsg.Strangle(e.data.id | 0, hits));
      t.incTime(100);
      break;
    }
    case SideAction.RELOAD:
      t.weap!.startReload(true);
      break;
    case SideAction.DEFEND:
      if (!t.flee()) return false;
      break;
  }
  return true;
};

// swf: Trooper.§mll)\x02§ — best square to move to (ranges, danger), or null.
export const bestMove = (t: Trooper, target: Trooper | null): Square | null => {
  let k = t.player.opp.side;
  if (target != null) {
    k = 2;
    t.bat.computeRange([target], k);
  } else {
    t.player.opp.computeDanger();
  }
  const rmax = t.weap!.rangeMax();
  const rmin = t.weap!.rangeMin();
  let to: Square | null = null;
  let best = 9999999;
  const mr = t.moveRange();
  const list = t.reachable(mr);
  const defender = t.data.pref!.moveSystem === MoveSystem.DEFENDER;
  for (const sq of list) {
    if (sq.isFree()) {
      const r = sq.range[k]! | 0;
      const d = t.square!.getDist(sq);
      let s = Math.abs(rmax - r) * 10 + d * 10;
      if (r > rmax) s += 10000;
      if (r < rmin) s += 10000;
      s += (sq.danger[t.player.opp.side]! | 0) * (defender ? 10 : 5);
      // P-code: the seed local is bat.seed (draw only on ties).
      if (s < best || (s === best && t.bat.seed.random(2) === 0)) {
        best = s | 0;
        to = sq;
      }
    }
  }
  return to;
};

// swf: Trooper.§o\tC\x03§ — free squares reachable in n steps (breadth first).
export const reachable = (t: Trooper, n: number): Square[] => {
  const out: Square[] = [];
  for (const sq of t.bat.squares) sq.flag = 0;
  let front: Square[] = [t.square!];
  t.square!.flag = 1;
  for (let i = 0; i < n; i++) {
    const next: Square[] = [];
    for (const sq of front) {
      for (const s of sq.nei) {
        if (!(s == null || s.flag === 1)) {
          s.flag = 1;
          if (s.isFree()) out.push(s);
          next.push(s);
        }
      }
    }
    front = next;
  }
  return t.filterFits(out);
};

// swf: Trooper.§Dtg\x14\x01§ — an aiming trooper checks its target (COVERING_FIRE).
export const checkAim = (t: Trooper): void => {
  const w = t.weap!;
  if (w.target == null || !w.isValidTarget(w.target) || !w.canTarget(w.target) || w.target.side === t.side) {
    t.msg(BattleMsg.Aim(-1));
    t.state = TrooperState.IDLE;
    t.interrupt(10);
    return;
  }
  if (w.target.state === TrooperState.AIM && t.tryAuto(SKILLS.COVERING_FIRE)) {
    t.time = t.bat.btime;
    t.play();
  }
};

// swf: Trooper.§DY\x07v\x01§ (recal) — to the nearest free square.
export const recal = (t: Trooper): void => {
  let best = 9999;
  let to: Square | null = null;
  for (const sq of t.bat.squares) {
    if (sq.isFree()) {
      const d = sq.getDist(t.square!);
      if (d < best) {
        best = d;
        to = sq;
      }
    }
  }
  t.setSquare(to);
};

// swf: Trooper.§\b\x1d{\b\x03§ — nearest square neither flagged nor occupied (fitting our size).
export const nearestUnflagged = (t: Trooper): Square | null => {
  let to: Square | null = null;
  let best = 999;
  const size = t.getSize();
  for (const sq of t.bat.squares) {
    if (!(sq.flag === 1 || sq.tr != null)) {
      if (!(size !== Size.SMALL && !sq.fits(size))) {
        const d = sq.getDist(t.square!);
        if (d < best) {
          best = d;
          to = sq;
        }
      }
    }
  }
  return to;
};

// swf: Trooper.§qk\x02\x19§ — nearest free neighbour square of `e`.
export const freeSquareNear = (t: Trooper, e: Trooper): Square | null => {
  let to: Square | null = null;
  let best = 99;
  for (const sq of e.square!.nei) {
    if (!(sq == null || sq.tr != null)) {
      const d = t.square!.getDist(sq);
      if (d < best) {
        best = d;
        to = sq;
      }
    }
  }
  return to;
};

// swf: Trooper.§\x1c\x07}\t§ (getNearest)
export const getNearest = (t: Trooper, list: Trooper[]): Trooper | null => {
  let to: Trooper | null = null;
  let best = 99;
  for (const o of list) {
    const d = o.square!.getDist(t.square!);
    if (d < best) {
      best = d;
      to = o;
    }
  }
  return to;
};
