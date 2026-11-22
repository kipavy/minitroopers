// swf: logic.Battle (§P!L/\x02§.§\x0b\x0eNO§) — grid, players, turn loop, events and triggers.
import { Rand } from "../core/rand.ts";
import { Num } from "../core/num.ts";
import { SKILLS, WEAPONS } from "../data/enums.ts";
import { XMAX, YMAX, arrayRemove } from "../data/data.ts";
import { BattleMsg, HitEvent } from "../msg/battleMsg.ts";
import { as3Sort } from "../core/sort.ts";
import { BattleEvent, COM_PERIOD, DamageType, POISON_PERIOD, TrooperState, VehiculeKind } from "./logicEnums.ts";
import { Player } from "./player.ts";
import { Square } from "./square.ts";
import { LogicWeapon } from "./logicWeapon.ts";
import type { Trooper } from "./trooper/trooper.ts";
import type { BattleData, HitResult } from "./types.ts";
import type { BattleInput } from "../input/types.ts";
import type { BattleRecord } from "../simulate.ts";
import { battleData } from "./battleData.ts";
import { Ent } from "./ent.ts";
import { HxEnum, haxeString, registerRefKinds } from "../msg/hx.ts";

registerRefKinds({
  isEnt: (v): v is Ent => v instanceof Ent,
  isSquare: (v): v is Square => v instanceof Square,
});

/** A `Battle.history` entry (§7\x13JZ\x03§): `{type, time, tid}`. */
export interface HistoryEntry {
  type: HxEnum;
  time: number;
  tid: unknown;
}

/** A pending battle event (§iE!m\x02§): `{type: BattleEvent, time}`. */
export interface BattleEventEntry {
  type: HxEnum;
  time: number;
}

/** A skill announced once for a group of troopers (§Z\x01)P\x01§ entries `{skill, a}`). */
interface Announce {
  skill: number;
  a: Trooper[];
}

/** §~K3\x01§ DIR / §e2/@§ QDIR / §a/i\x05§ HDIR */
export const DIR = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;
export const QDIR = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
] as const;
export const HDIR = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

export class Battle {
  /** §-[$(§ */
  work: Square[] = [];
  /** §\x1e1\\J\x01§ */
  winner: number | null = null;
  /** §`1\x1f*\x02§ */
  troopers: Trooper[] = [];
  /** §q\x1c)M\x01§ */
  triggers: HxEnum[] = [];
  /** §UrNA\x01§ */
  squares: Square[] = [];
  /** §\fA2c§ */
  seed: Rand;
  /** §p\x05e\x06\x01§ */
  players: Player[] = [];
  /** §i\x0f\x17\x02\x03§ (int) — spawned-clown id counter. */
  clownCounter = 0;
  /** §(n\x1f@§ (int) */
  interceptions = 0;
  /** §7\x13JZ\x03§ */
  history: HistoryEntry[] = [];
  /** §'5'T§ */
  hero: Trooper | null = null;
  /** §Z\x01)P\x01§ */
  announces: Announce[] = [];
  /** §Hqz\b§ */
  grid: Square[][] = [];
  /** §8X}L\x01§ */
  graveyard: number[] = [];
  /** §iE!m\x02§ */
  events: BattleEventEntry[] = [];
  /** §5E[\x1d§ */
  data: BattleData;
  /** §U-\x19i\x03§ (int) */
  btime = 0;

  /** Static counter of LogicWeapon (§\x02XD\x01§): one battle per SWF process, so per battle here. */
  weaponCounter = 0;
  /** TRP lines (oracle instrumentation of Trooper.init), in emission order. */
  trpLines: { id: number; side: number; line: string }[] = [];

  // swf: Battle.<constructor> — `input` is turned into the SWF's data object first.
  constructor(input: BattleInput) {
    const data = battleData(input);
    this.data = data;
    this.seed = new Rand(data.id | 0);
    for (let i = 0; i < 2; i++) {
      this.players.push(new Player(i, data.armies[i]!, this));
    }
    for (let i = 0; i < 2; i++) {
      this.players[i]!.opp = this.players[1 - i]!;
    }
    this.initGrid();
    this.start();
  }

  // swf: Battle.§hwj]\x02§ — a random point within ±n of a square.
  randomNear(sq: Square, n = 3): { x: number; y: number } {
    const x = sq.x + this.seed.random(n * 2) - n;
    return { x, y: sq.y + this.seed.random(n * 2) - n };
  }

  // swf: Battle.§Gp3\x13\x03§ (setWinner)
  setWinner(side: number): void {
    this.winner = side;
    this.check();
    this.msg(BattleMsg.Winner(this.winner));
  }

  // swf: Battle.§\x0fa7P\x03§ — resolves the grouped skill announces.
  flushAnnounces(): void {
    for (const an of this.announces) {
      const ids: number[] = [];
      const b: number[] = [];
      const c: number[] = [];
      for (const t of an.a) {
        ids.push(t.data.id | 0);
        switch (an.skill) {
          case 46: {
            const n = ((t.weap!.data.ammo | 0) - t.weap!.ammo) | 0;
            t.weap!.ammo = (t.weap!.ammo + n) | 0;
            if (n > 0) b.push(n);
            break;
          }
          case 77: {
            let n = t.getLifeMax() >> 1;
            const m = (t.getLifeMax() - t.life) | 0;
            if (n > m) n = m;
            t.life = (t.life + n) | 0;
            b.push(n);
            break;
          }
          case 110:
            t.resetWeapon(false);
            t.player.opp.addDepBonus(-2);
            t.state = TrooperState.IDLE;
            break;
          case 113:
            t.boost(200, true);
            break;
          default:
            break;
        }
      }
      for (let i = 0; i < 2; i++) {
        const p = this.players[i]!;
        if (an.skill === 3) {
          const list = p.troopers.slice();
          as3Sort(list, (x, y) => p.cmpAmmo(x, y));
          let n = 0;
          for (const t of an.a) n = (n + t.ghost.lvl + 1) | 0;
          while (n > 0 && list.length > 0) {
            const t = list.shift()!;
            n--;
            const k = t.refillAmmo();
            if (k === 0) break;
            b.push(t.data.id | 0);
            c.push(k);
          }
        }
      }
      this.msg(BattleMsg.SkillGroup(an.skill, ids, b, c));
    }
    this.announces = [];
  }

  // swf: Battle.MnRZ (resolve) — one step; true when the battle is over.
  resolve(): boolean {
    let best = 999999999;
    for (const t of this.troopers) {
      if (t.time < best) {
        best = t.time;
        this.hero = t;
      }
    }
    for (const t of this.troopers) t.checkStatus();
    const hero = this.hero!;
    if (this.events.length === 0 || this.events[0] == null || hero.time < (this.events[0].time | 0)) {
      this.btime = hero.time;
      hero.play();
    } else {
      this.runEvent();
    }
    for (const t of this.troopers) {
      if (t.state === TrooperState.AIM && t !== this.hero) t.checkAim();
    }
    const trig = this.triggers.slice();
    this.triggers = [];
    for (const tr of trig) this.runTrigger(tr);
    if (this.winner != null) return true;
    if (this.btime > 50000) return true;
    return false;
  }

  // swf: Battle.§\x1f2T\x17\x01§ — runs the first battle event.
  runEvent(): void {
    const ev = this.events[0]!;
    if ((ev.time | 0) > this.btime) this.btime = ev.time | 0;
    const p = ev.type.params;
    switch (ev.type.index) {
      case 0:
        ev.time = ((ev.time | 0) + POISON_PERIOD) | 0;
        for (const t of this.troopers) {
          if (t.hasStatus(1)) {
            const h = t.selfDamage(1, DamageType.POISON);
            if (!t.isDead()) h.events.push(HitEvent.STILL);
            this.msg(BattleMsg.Damage(h), h.tid | 0);
          }
        }
        break;
      case 1: {
        const o = p![0] as { type: number; num: number; tr: Trooper };
        o.num++;
        let k = 999;
        switch (o.type) {
          case 7: {
            const sq = o.tr.bestArea(1, 3, true, false)!;
            const hits = this.explode(sq.x, sq.y, 3, 6, true, o.tr);
            this.msg(BattleMsg.Airstrike(o.tr.side, sq.x, sq.y, hits));
            k = 3;
            break;
          }
        }
        ev.time = ((ev.time | 0) + (500 + this.seed.random(2000))) | 0;
        if (this.seed.random((o.num | 0) * k) > 0) this.events.shift();
        break;
      }
      case 2: {
        let sum = 0;
        for (const pl of this.players) sum = (sum + pl.com) | 0;
        if (sum > 0) {
          const r = this.players[0]!.com / sum;
          this.players[r > this.seed.rand() ? 0 : 1]!.useCom();
        }
        ev.time = ((ev.time | 0) + COM_PERIOD) | 0;
        break;
      }
    }
    as3Sort(this.events, (a, b) => this.eventOrder(a, b));
  }

  // swf: Battle.§R\x01V}\x01§ — event order (never 0).
  eventOrder(a: BattleEventEntry, b: BattleEventEntry): number {
    if ((a.time | 0) < (b.time | 0)) return -1;
    return 1;
  }

  // swf: Battle.§\x18Wzv\x02§ (order)
  order(a: Trooper, b: Trooper): number {
    if (a.time < b.time) return -1;
    if (a.time > b.time) return 1;
    return 0;
  }

  // swf: Battle.§9\x1cr=\x02§ — runs a trigger.
  runTrigger(tr: HxEnum): void {
    const p = tr.params!;
    switch (tr.index) {
      case 0: {
        const killer = p[0] as Trooper | null | undefined;
        const victim = p[1] as Trooper;
        if (killer != null) {
          if (killer.have(SKILLS.FRENETIC) && killer.vtype !== VehiculeKind.FIGHTER_JET) {
            const k = Math.max(1 - killer.frenzy * 0.1, 0.25);
            killer.boost((200 * k) | 0, true);
            killer.frenzy = (killer.frenzy + 1) | 0;
          }
          killer.frag = (killer.frag + 1) | 0;
        }
        for (const t of victim.player.troopers) {
          if (t.have(SKILLS.VENDETTA)) t.boost(50, true);
        }
        if (!victim.player.martyr && victim.have(SKILLS.MARTYR)) {
          victim.player.deploy(5);
          for (const t of victim.player.troopers) t.boost(150, true);
          victim.player.martyr = true;
        }
        break;
      }
      case 1: {
        const side = (p[0] as number) | 0;
        const pl = this.players[side]!;
        if (pl.isWaveOver() || pl.crybabyCheck()) {
          this.newWave(pl.side);
          break;
        }
        let allOut = true;
        for (const t of pl.troopers) {
          if (t.isReal()) {
            allOut = false;
            break;
          }
        }
        if (allOut) this.setWinner(1 - side);
        break;
      }
    }
  }

  // swf: Battle.§SV\x1d\x01§ (msg)
  msg(m: HxEnum, tid?: unknown): void {
    if (tid == null && this.hero != null) tid = this.hero.getId();
    this.history.push({ type: m, time: this.btime, tid });
  }

  // swf: Battle.§e\x13^}§ (isIn)
  isIn(x: number, y: number): boolean {
    return x >= 0 && x < XMAX && y >= 0 && y < YMAX;
  }

  // swf: Battle.§Qm\x14!§ (isFree)
  isFree(x: number, y: number): boolean {
    const sq = this.getSq(x, y);
    return sq != null && sq.tr == null;
  }

  // swf: Battle.§\x14C7!\x03§ (initGrid)
  initGrid(): void {
    this.grid = [];
    this.squares = [];
    for (let x = 0; x < XMAX; x++) {
      this.grid[x] = [];
      for (let y = 0; y < YMAX; y++) {
        const sq = new Square(this, x, y);
        this.grid[x]![y] = sq;
        this.squares.push(sq);
      }
    }
    for (const sq of this.squares) {
      for (let i = 0; i < 4; i++) {
        const d = DIR[i]!;
        const x = sq.x + d[0];
        const y = sq.y + d[1];
        sq.nei[i] = this.isIn(x, y) ? this.grid[x]![y]! : null;
      }
      for (const d of QDIR) {
        const x = sq.x + d[0];
        const y = sq.y + d[1];
        if (this.isIn(x, y)) sq.quad.push(this.grid[x]![y]!);
      }
    }
  }

  // swf: Battle.§T4E6\x01§ — living troopers in the n×n area centred on (x, y), flying or not.
  troopersInArea(x: number, y: number, n: number, ground: boolean): Trooper[] {
    for (const t of this.troopers) t.flag = 0;
    const out: Trooper[] = [];
    const h = (n * 0.5) | 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const sq = this.getSq(x + i - h, y + j - h);
        if (!(sq == null || sq.tr == null || sq.tr.flag === 1 || sq.tr.isDead())) {
          if (sq.tr.isFlying() !== ground) {
            sq.tr.flag = 1;
            out.push(sq.tr);
          }
        }
      }
    }
    return out;
  }

  // swf: Battle.§;|^W§ (getTrooper)
  getTrooper(id: number): Trooper | null {
    for (const t of this.troopers) if ((t.data.id | 0) === id) return t;
    return null;
  }

  // swf: Battle.§gH-}\x03§ (getSq)
  getSq(x: number, y: number): Square | null {
    if (this.isIn(x, y)) return this.grid[x]![y]!;
    return null;
  }

  // swf: Battle.§'\x19X\x1e\x01§ — first free square.
  firstFreeSquare(): Square | null {
    for (const sq of this.squares) if (sq.isFree()) return sq;
    return null;
  }

  // swf: Battle.§\x15NG\x01\x01§ (getCone)
  getCone(from: Square, angle: number, spread: number, dist: number): Square[] {
    const out: Square[] = [];
    for (const sq of this.squares) {
      const dx = (sq.x - from.x) | 0;
      const dy = (sq.y - from.y) | 0;
      const a = Math.atan2(dy, dx);
      if (Math.abs(Num.hMod(a - angle, 3.14)) <= spread) {
        if (Math.sqrt(dx * dx + dy * dy) <= dist) out.push(sq);
      }
    }
    return out;
  }

  // swf: Battle.§ImYZ\x03§ — one breadth-first step of computeRange.
  spreadRange(k: number): void {
    const next: Square[] = [];
    for (const sq of this.work) {
      for (const n of sq.nei) {
        if (!(n == null || (n.range[k]! | 0) <= (sq.range[k]! | 0) + 1)) {
          n.range[k] = ((sq.range[k]! | 0) + 1) | 0;
          next.push(n);
        }
      }
    }
    this.work = next;
  }

  // swf: Battle.§P=\x1fI\x01§ — a side has no fighter left: new wave.
  newWave(side: number): void {
    this.announces = [];
    for (const pl of this.players) {
      for (const t of pl.troopers) {
        t.flag = 1;
        this.hero = t;
        if (pl.side !== side && t.tryAuto(SKILLS.REVERSE_ATTACK, null, true)) this.announce(SKILLS.REVERSE_ATTACK, t);
        if (t.tryAuto(SKILLS.RUCKSACK, null, true)) this.announce(SKILLS.RUCKSACK, t);
        if (t.life < t.getLifeMax() && t.tryAuto(SKILLS.FIRST_AID, null, true)) this.announce(SKILLS.FIRST_AID, t);
        if (t.tryAuto(SKILLS.RESTLESS, null, true)) this.announce(SKILLS.RESTLESS, t);
        if (t.have(SKILLS.MUNITIONS)) this.announce(SKILLS.MUNITIONS, t);
      }
      const deads = pl.deads.slice();
      for (const t of deads) {
        if (t.square != null && t.square.tr == null && t.vehicule == null && t.tryAuto(SKILLS.SURVIVOR, null, true)) {
          t.reanimate();
          this.announce(SKILLS.SURVIVOR, t);
        }
      }
    }
    this.flushAnnounces();
    const ids: number[] = [];
    for (const pl of this.players) {
      for (const t of pl.deads) ids.push(t.ghost.data.id | 0);
      pl.clearDeads();
    }
    for (const sq of this.squares) sq.weapons = [];
    this.msg(BattleMsg.NewWave(ids));
    this.players[1 - side]!.evacuateZone();
    this.players[side]!.deploy();
    this.check();
  }

  // swf: Battle.§\x14\x13i\x0b\x01§ — positions of occupied squares.
  msgOccupied(): void {
    const xy: number[] = [];
    for (const sq of this.squares) {
      if (sq.tr != null) {
        xy.push(sq.x);
        xy.push(sq.y);
      }
    }
    this.msg(BattleMsg.Positions(xy));
  }

  // swf: Battle.§Em\x14\x05\x02§ (checks)
  checks(): void {
    for (const t of this.troopers) {
      if (t.weap == null) t.weap = new LogicWeapon(WEAPONS.FISTS, t);
      if (t.square!.tr !== t) this.msg(BattleMsg.Positions([t.square!.x, t.square!.y]));
    }
  }

  // swf: Battle.§Q-\x10x§ — every trooper's position.
  msgPositions(): void {
    const xy: number[] = [];
    for (const t of this.troopers) {
      xy.push(t.square!.x);
      xy.push(t.square!.y);
    }
    this.msg(BattleMsg.Positions(xy));
  }

  // swf: Battle.§,\nwX\x03§ (check)
  check(): void {
    const infos: object[] = [];
    for (const t of this.troopers) infos.push(t.getInfos());
    this.msg(BattleMsg.CheckPoint(infos));
    for (const p of this.players) p.sendStatus();
  }

  // swf: Battle.§!@||\x03§ — distance of every square to `list`'s troopers, stored in range[k].
  computeRange(list: Trooper[], k: number): void {
    for (const sq of this.squares) sq.range[k] = 999;
    this.work = [];
    for (const t of list) {
      if (t.square == null) {
        throw "[" + this.btime + "]troopers square is null" + (t.data.id | 0);
      }
      for (const sq of t.squares) sq.range[k] = 0;
      this.work.push(t.square);
    }
    while (this.work.length > 0) this.spreadRange(k);
  }

  // swf: Battle.§E\x0f?Q\x03§ — explosion of size n at (x, y): damage d + rnd(d), knock-backs.
  explode(x: number, y: number, n: number, d: number, ground: boolean, by: Trooper | null): HitResult[] {
    const out: HitResult[] = [];
    const list = this.troopersInArea(x, y, n, ground);
    if (by != null && by.have(SKILLS.FRIENDLY_FIRE)) {
      const copy = list.slice();
      for (const t of copy) {
        if (t.side === by.side) arrayRemove(list, t);
      }
    }
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      const sq = t.square!;
      let fly = this.seed.random(3) > 0;
      if (!t.canBeMoved()) fly = false;
      const h = t.hit(d + this.seed.random(d), by, DamageType.EXPLOSION, null);
      if (h.type === DamageType.MISS) fly = false;
      if (fly) {
        const dx = sq.x - (x + 0.5);
        const dy = sq.y - (y + 0.5);
        const a = Math.atan2(dy, dx);
        const cone = this.getCone(sq, a, 0.7, 3);
        const dest: Square[] = [sq];
        for (const s of cone) if (s.tr == null) dest.push(s);
        if (dest.length > 0) {
          const to = dest[this.seed.random(dest.length)]!;
          const r = this.seed.rand();
          const fall = t.fall(1 + ((r * 3) | 0));
          h.events.push(HitEvent.FLY_TO(to.x, to.y, 80 + ((r * 80) | 0), fall));
          t.setSquare(to);
        }
      }
      out.push(h);
    }
    return out;
  }

  // swf: Battle.§\x1cjL\x06\x03§ — battle start.
  start(): void {
    for (let i = 0; i < 2; i++) this.players[i]!.prepare();
    as3Sort(this.events, (a, b) => this.eventOrder(a, b));
    for (const p of this.players) p.sendStatus();
    for (const p of this.players) p.deploy();
    this.check();
    this.addEvent(BattleEvent.COM, COM_PERIOD);
    this.addEvent(BattleEvent.POISON_TICK, 0);
  }

  // swf: Battle.§-\x1b \x1a\x01§ (addTrigger)
  addTrigger(tr: HxEnum): void {
    this.triggers.push(tr);
  }

  // swf: Battle.§7w\nI\x02§ — groups a skill announce.
  announce(skill: number, t: Trooper): void {
    let an: Announce | null = null;
    for (const a of this.announces) {
      if (a.skill === skill) {
        an = a;
        break;
      }
    }
    if (an == null) {
      an = { skill, a: [] };
      this.announces.push(an);
    }
    an.a.push(t);
  }

  // swf: Battle.§\x05DVO\x03§ (addEvent) — inserted before the first event at time >= t.
  addEvent(type: HxEnum, time: number): void {
    let i = 0;
    for (const ev of this.events) {
      if ((ev.time | 0) >= time) break;
      i++;
    }
    this.events.splice(i, 0, { type, time });
  }

  /**
   * The SWF's Game loop (`if (battle.resolve()) ...`, 200 calls per frame) run to the end, then
   * the oracle dump (patch-msg.as `mtDump`): every history entry formatted in its final state.
   */
  run(): BattleRecord {
    while (!this.resolve()) {
      /* one step per call */
    }
    return this.record();
  }

  /** The oracle dump (patch-msg.as `mtDump`) of the battle as it stands; `run()` calls it once over. */
  record(): BattleRecord {
    return {
      troopers: this.trpLines.map((l) => ({ id: l.id, side: l.side as 0 | 1, line: l.line })),
      events: this.history.map((h) => `EV ${haxeString(h.time)}|${haxeString(h.tid)}|${haxeString(h.type)}`),
      winner: this.winner === null ? null : (this.winner as 0 | 1),
      graveyard: this.graveyard.slice(),
    };
  }
}
