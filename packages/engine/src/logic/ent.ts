// swf: logic.Ent (§P!L/\x02§.§\x15)\x01\x02§) — base class of Trooper.
import type { HxEnum } from "../msg/hx.ts";
import type { Battle } from "./battle.ts";
import type { Player } from "./player.ts";
import type { Square } from "./square.ts";

export class Ent {
  /** §uN\x0ed§ (int) — initiative. */
  time: number;
  /** §UrNA\x01§ — every square of the footprint. */
  squares: Square[] = [];
  /** §v\x13\x059\x03§ */
  square: Square | null = null;
  /** §9\x118u§ (int) */
  side: number;
  /** §\tnP+§ */
  player: Player;
  /** §\x12?g-§ (int) */
  life: number;
  /** §XEC3\x03§ */
  healed = false;
  /** §Kr)r§ (int) */
  flag: number;
  /** §\x01x8\x01§ */
  bat: Battle;

  // swf: Ent.<constructor>
  constructor(bat: Battle, player: Player) {
    this.player = player;
    this.side = player.side;
    this.life = 10;
    this.flag = 0;
    this.time = 0;
    this.bat = bat;
  }

  // swf: Ent.§\rlj\x1a§ (play)
  play(): void {}

  // swf: Ent.§SV\x1d\x01§ (msg)
  msg(m: HxEnum): void {
    this.bat.msg(m, this.getId());
  }

  // swf: Ent.§)/Z\f\x02§
  isTrooper(): boolean {
    return false;
  }

  // swf: Ent.§\x01\x19Hx\x03§ (incTime)
  incTime(n: number): void {
    this.time = (this.time + (n | 0)) | 0;
  }

  // swf: Ent.§A7b;§ (heal)
  heal(n: number): void {
    this.life = (this.life + (n | 0)) | 0;
    this.healed = true;
    if (this.life > this.getLifeMax()) this.life = this.getLifeMax();
  }

  // swf: Ent.§(%Q\x02§ (have)
  have(_skill: number): boolean {
    return false;
  }

  // swf: Ent.§)L`\x07§ (getLifeMax)
  getLifeMax(): number {
    return 10;
  }

  // swf: Ent.§(m\x0fl\x01§ (getId)
  getId(): number {
    return 0;
  }

  // swf: Ent.§WU|\x04§ (getInfos)
  getInfos(): object | null {
    return null;
  }
}
