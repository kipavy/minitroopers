// swf: logic.Trooper (§59=F\x03§) — initialisation (`init`, vehicle draw), AUTO skills, infos.
import { SKILL, VEHICULE, arrayRemove, skillVehicule, skillWeapon } from "../../data/data.ts";
import { SKILLS, SKILL_TYPES, WEAPONS } from "../../data/enums.ts";
import { Announce, BattleMsg, HitEvent } from "../../msg/battleMsg.ts";
import type { Battle } from "../battle.ts";
import { LogicVehicle } from "../logicVehicle.ts";
import { MoveSystem, ReloadSystem, SideAction, TrooperState } from "../logicEnums.ts";
import { formatTrooperLine } from "../trooperGen.ts";
import type { HitResult } from "../types.ts";
import type { Trooper } from "./trooper.ts";

// swf: Trooper.§(\x07\x184§ (init) — weapons, skills, spare weapons, vehicle, initiative.
export const init = (t: Trooper, bat: Battle): void => {
  t.flag = 0;
  t.road = 0;
  t.fleeCount = 0;
  t.frenzy = 0;
  t.bat = bat;
  t.time = t.bat.btime;
  t.state = TrooperState.IDLE;
  t.squares = [];
  t.predators = [];
  t.supers = [];
  t.auto = [];
  t.sides = [];
  t.status = [];
  t.weapons = [];
  switch (t.ghost.data.type) {
    case 0:
      t.initWeapon(WEAPONS.FISTS);
      t.sides.push(SideAction.STOMP);
      break;
    case 1:
      t.initWeapon(WEAPONS.CLOWN);
      break;
    case 2:
      t.initWeapon(WEAPONS.RAT_TOOTH);
      t.sides.push(SideAction.STRANGLE);
      break;
  }
  if (t.data.pref!.reloadSystem === ReloadSystem.CAUTIOUS) t.sides.push(SideAction.RELOAD);
  if (t.data.pref!.moveSystem === MoveSystem.DEFENDER) t.sides.push(SideAction.DEFEND);
  for (const s of t.ghost.skills) {
    const row = SKILL[s]!;
    if (row.type === SKILL_TYPES.SUPER) {
      t.supers.push({ skill: s, num: row.num as number, weight: row.swe, vh: Boolean(row.vh) });
    }
    if (row.type === SKILL_TYPES.AUTO) {
      t.auto.push({ skill: s, num: row.num as number, weight: row.swe, vh: Boolean(row.vh) });
    }
    if (row.type === SKILL_TYPES.WEAPON) t.initWeapon(skillWeapon(s));
    switch (s) {
      case 1:
        t.sides.push(SideAction.CURE);
        break;
      case 97:
        t.sides.push(SideAction.WANDER);
        break;
    }
  }
  t.healed = false;
  if (t.ghost.job != null) t.helmet = true;
  t.injuries = [];
  let sab = t.player.opp.sabotage * 0.01;
  if (t.have(SKILLS.SUSPICIOUS)) {
    sab = 0;
  } else if (t.have(SKILLS.SMART)) {
    sab *= 0.5;
  }
  const spares = t.weapons.slice().slice(1);
  while (spares.length > 0 && t.bat.seed.rand() < sab) {
    t.weap = spares[t.bat.seed.random(spares.length)]!;
    t.weap.spare = true;
    arrayRemove(spares, t.weap);
    sab *= 0.5;
  }
  t.weap = t.weapons[0]!;
  if (t.weapons.length > 1) {
    t.weap = t.weapons[1 + t.bat.seed.random(t.weapons.length - 1)]!;
    const cw = t.data.pref!.CWeapon;
    if (cw != null) {
      for (const w of t.weapons) {
        if (w.data.id === cw) {
          t.weap = w;
          break;
        }
      }
    }
  }
  if (t.vtype != null) {
    const row = VEHICULE[t.vtype]!;
    switch (row.id) {
      default:
        t.vehicule = new LogicVehicle(t.vtype, t);
        t.incTime(t.vehicule.data.init as number);
        break;
      case 7:
        break;
    }
  }
  t.life = t.getLifeMax();
  t.incTime(t.bat.seed.random(40));
  if (t.have(SKILLS.ON_POINT)) t.time = (t.time - 200) | 0;
  if (t.have(SKILLS.SPY)) t.time = (t.time - (50 + t.ghost.lvl * 10)) | 0;
  // Oracle instrumentation (patch-msg.as mtTrp): one TRP line at the end of every init.
  t.bat.trpLines.push({ id: t.getId(), side: t.side, line: t.trpLine() });
};

/** The oracle's `TRP` line for the current state (patch-msg.as `mtTrp`). */
export const trpLine = (t: Trooper): string => {
  return formatTrooperLine({
    id: t.getId(),
    side: t.side as 0 | 1,
    life: t.life,
    time: t.time,
    lvl: t.ghost.lvl,
    skills: t.ghost.skills,
    weapons: t.weapons.map((w) => ({ type: w.data.id, ammo: w.rounds, reserve: w.ammo, flag: w.spare })),
    weapIdx: t.weap == null ? -1 : t.weapons.indexOf(t.weap),
    vehicle: t.vtype,
    helmet: t.helmet,
    leader: t.leader,
  });
};

// swf: Trooper.§WU|\x04§ — infos sent to the client (getInfos).
export const getInfos = (t: Trooper): object => {
  let vh: number | null = null;
  if (t.vehicule != null) vh = t.vehicule.data.id;
  const ws: object[] = [];
  let list = t.weapons.slice();
  if (t.vehicule != null) list = list.concat(t.vehicule.weapons);
  for (const w of list) ws.push(w.getInfos());
  return {
    side: t.player.side,
    data: t.data,
    x: t.square!.x,
    y: t.square!.y,
    weapons: ws,
    weapId: t.weap!.data.id,
    life: t.life,
    state: t.state,
    helmet: t.helmet,
    vh,
  };
};

// swf: Trooper.§O\x12=G\x03§ — vehicle draw (SPAWN skills) at pool creation.
export const drawVehicle = (t: Trooper): void => {
  const list: { skill: number; weight: number }[] = [];
  for (const s of t.ghost.skills) {
    const row = SKILL[s]!;
    if (row.type === SKILL_TYPES.SPAWN) list.push({ skill: s, weight: row.swe as number });
  }
  let k = 1;
  if (t.have(SKILLS.PILOT)) k /= 1 + (t.ghost.lvl + 1) * 0.25;
  for (const o of list) {
    if (t.bat.seed.rand() * k * o.weight <= 1) t.vtype = skillVehicule(o.skill);
  }
};

// swf: Trooper.§\fQ\x16S\x01§ — rolls an AUTO skill (weight draw), consumes a use.
export const tryAuto = (t: Trooper, skill: number, h: HitResult | null, silent: boolean): boolean => {
  for (const a of t.auto.slice(0, t.auto.length)) {
    if (!(t.vehicule != null && !Boolean(a.vh))) {
      if (a.skill === skill) {
        let w = (a.weight as number) | 0;
        if (t.have(SKILLS.HURRY)) w >>= 1;
        if (t.bat.seed.random(w) > 0) return false;
        a.num--;
        if ((a.num | 0) === 0) {
          arrayRemove(t.auto, a);
          t.lastUse(a.skill);
        }
        if (!silent) {
          if (h != null) {
            h.events.push(HitEvent.SKILL(a.skill));
          } else {
            t.msg(BattleMsg.Announce(Announce.Skill(a.skill)));
          }
        }
        return true;
      }
    }
  }
  return false;
};
