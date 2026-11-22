// swf: LogicVehicle (§P!L/\x02§.§f;\n@§) — a vehicle driven by a trooper.
import { VEHICULE } from "../data/data.ts";
import type { VehiculeRow } from "../data/data.ts";
import { SKILLS } from "../data/enums.ts";
import { BattleMsg, HitEvent } from "../msg/battleMsg.ts";
import { DamageType, TrooperState, VehiculeKind } from "./logicEnums.ts";
import { LogicWeapon } from "./logicWeapon.ts";
import type { Trooper } from "./trooper/trooper.ts";
import type { HitResult } from "./types.ts";

export class LogicVehicle {
  /** §\x1dI\x02\r\x03§ */
  weapons: LogicWeapon[];
  /** §(\x01§ — driver. */
  tr: Trooper;
  /** §\x12?g-§ (int) */
  life: number;
  /** §\x1cH\x06*\x03§ (int) — idle turns. */
  idle: number;
  /** §5E[\x1d§ */
  data: VehiculeRow;

  // swf: LogicVehicle.<constructor>
  constructor(kind: number, t: Trooper) {
    this.data = VEHICULE[kind]!;
    this.tr = t;
    this.life = (this.data.life as number) | 0;
    this.idle = 0;
    this.weapons = [];
    for (const w of [this.data.weap, this.data.weap2]) {
      if (w != null) {
        const lw = new LogicWeapon(w, t);
        lw.vehicleWeapon = true;
        lw.init(t.bat.seed);
        this.weapons.push(lw);
      }
    }
    if (this.weapons[0] != null) t.weap = this.weapons[0];
  }

  // swf: LogicVehicle.§\x0fa\b\x02§ — the vehicle's turn.
  play(): void {
    const t = this.tr;
    switch (this.data.id) {
      case 0:
        if (t.weap!.canTarget(t.weap!.findTarget()) || t.weap!.spare) {
          this.leave();
        } else {
          const sq = t.bestMove();
          if (sq != null) {
            t.moveTo(sq, null, true);
          } else {
            t.incTime(20);
          }
        }
        break;
      case 2:
      case 4: {
        const r = this.nearestRange();
        let w: LogicWeapon;
        if (r < 3 || this.weapons[0]!.isEmpty()) {
          w = this.weapons[1]!;
        } else {
          w = this.weapons[0]!;
        }
        if (w !== t.weap) {
          t.switchWeapon(w);
          return;
        }
        this.act();
        break;
      }
      case 3:
        this.act();
        break;
      default:
        t.incTime(200);
    }
  }

  // swf: LogicVehicle.MnRZ — aim, leave, reload, move or wait.
  act(): void {
    const t = this.tr;
    if (t.weap!.tryAim()) return;
    if (t.weap!.isEmpty() || this.idle > 3) {
      this.leave();
      return;
    }
    if (t.weap!.rounds === 0 && t.weap!.ammo > 0) {
      t.weap!.startReload();
      return;
    }
    if (t.approach()) return;
    this.idle = (this.idle + 1) | 0;
    t.incTime(50);
  }

  // swf: LogicVehicle.§A\x0f\x06c\x03§ — the driver gets out.
  dismount(): void {
    const t = this.tr;
    const sq = t.square!;
    t.clearSquares();
    t.vehicule = null;
    t.setSquare(sq);
    t.resetWeapon(true);
    t.life = t.getLifeMax();
  }

  // swf: LogicVehicle.§3\x19/\x01§ (hit)
  hit(h: HitResult): HitResult {
    const t = this.tr;
    h.loc = null;
    if (h.type === DamageType.EXPLOSION) h.dmg = (h.dmg | 0) << 1;
    h.dmg = ((h.dmg | 0) - (this.data.armor as number)) | 0;
    if ((h.dmg | 0) < 0) h.dmg = 0;
    this.life = (this.life - (h.dmg | 0)) | 0;
    if (this.life < 0) this.life = 0;
    if (this.life === 0) {
      let sq = t.square!.shake(2, true);
      if (sq == null) sq = t.square!;
      this.dismount();
      let n = (10 + t.bat.seed.random(10)) | 0;
      if (t.tryAuto(SKILLS.FALL_GUY, h)) n = 0;
      if (this.data.id === VehiculeKind.MOTO) n >>= 2;
      const crash = t.selfDamage(n, DamageType.CRASH);
      const r = t.bat.seed.rand();
      const fall = t.fall(1 + ((r * 3) | 0));
      crash.events.push(HitEvent.FLY_TO(sq.x, sq.y, 80 + ((r * 80) | 0), fall));
      t.setSquare(sq);
      h.events.push(HitEvent.CRASH(crash));
    }
    return h;
  }

  // swf: LogicVehicle.§\x03tk\\\x03§ — smallest enemy range over the footprint.
  nearestRange(): number {
    const t = this.tr;
    t.player.opp.computeDanger();
    let best = 99;
    for (const sq of t.squares) {
      const r = sq.range[t.player.opp.side]! | 0;
      if (r < best) best = r;
      if (best === 1) break;
    }
    return best;
  }

  // swf: LogicVehicle.XYEn — leaves the vehicle (helicopter: flies away).
  leave(): void {
    const t = this.tr;
    switch (this.data.id) {
      case 3:
        t.msg(BattleMsg.Leave(t.side, false));
        t.kill();
        break;
      default:
        this.dismount();
        t.msg(BattleMsg.Dismount(t.square!.x, t.square!.y));
        t.incTime(30);
        t.state = TrooperState.IDLE;
    }
  }
}
