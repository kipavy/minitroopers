// swf: logic.Player (§P!L/\x02§.§\x02oh\\§) — one army: pool, deployment, communications.
import { Arr } from "../core/arr.ts";
import { as3Sort } from "../core/sort.ts";
import { COMS, DEPLOY_ORDER, XMAX, YMAX, armyLevel, arrayRemove } from "../data/data.ts";
import { SKILLS } from "../data/enums.ts";
import { Announce, BattleMsg } from "../msg/battleMsg.ts";
import type { Battle } from "./battle.ts";
import { BattleEvent, Status, Trigger } from "./logicEnums.ts";
import { SIZE, type Square } from "./square.ts";
import { Trooper } from "./trooper/trooper.ts";
import type { ArmyData, TrooperData } from "./types.ts";

export class Player {
  /** §`1\x1f*\x02§ — deployed troopers. */
  troopers: Trooper[] = [];
  /** §9\x118u§ (int) */
  side: number;
  /** §\x136@\x02\x01§ (int) */
  sens: number;
  /** §VkD\x01§ (int) — sabotage. */
  sabotage = 0;
  /** §=%1F\x02§ — next deploy is reversed (never set by the logic). */
  reversed = false;
  /** §B&\x07m\x01§ — danger map is up to date. */
  dangerOk = false;
  /** Se3Z — troopers not deployed yet. */
  pool: Trooper[] = [];
  /** §C/d\x01§ */
  opp!: Player;
  /** §b\x06;[§ (int) */
  depBonus = 0;
  /** §\x1asM^\x01§ */
  martyr = false;
  /** §\n@?\x01§ (int) */
  lvl: number;
  /** §Yx\t\x01§ (int) — army size. */
  eff: number;
  /** §\x05\x0b\x7f\x01§ (int) — number of deploy squares. */
  dep = 0;
  /** §p\x18\x16j§ */
  deads: Trooper[] = [];
  /** §5E[\x1d§ */
  data: ArmyData;
  /** §WJb\x01§ (int) */
  com = 0;
  /** §\x01x8\x01§ */
  bat: Battle;

  // swf: Player.<constructor>
  constructor(side: number, data: ArmyData, bat: Battle) {
    this.bat = bat;
    this.side = side | 0;
    this.data = data;
    this.lvl = armyLevel(data);
    this.eff = data.troopers.length | 0;
    this.pool = [];
    for (const td of data.troopers) this.addToPool(td, true);
    this.depBonus = 0;
    this.troopers = [];
    this.deads = [];
    this.sens = (side * 2 - 1) | 0;
  }

  // swf: Player.§9|6J\x02§ (unregister)
  unregister(t: Trooper): void {
    arrayRemove(this.bat.troopers, t);
    arrayRemove(this.troopers, t);
    this.invalidateDanger();
    this.bat.addTrigger(Trigger.Check(this.side));
    this.sendStatus();
  }

  // swf: Player.§P\t\x1fC§ — before the first deploy: spies change sides, fighter jets leave.
  prepare(): void {
    const list = this.pool.slice();
    let spies = this.opp.eff >> 2;
    for (const t of list) {
      if (t.have(SKILLS.SPY) && t.vtype == null && t.side === this.side && spies-- > 0) {
        arrayRemove(this.pool, t);
        this.opp.pool.splice(this.bat.seed.random(this.opp.pool.length), 0, t);
      }
      if (t.vtype == null) continue;
      switch (t.vtype) {
        case 7:
          arrayRemove(this.pool, t);
          this.bat.addEvent(BattleEvent.Strike({ type: t.vtype, num: 0, tr: t }), 100 + this.bat.seed.random(2000));
          break;
      }
    }
  }

  // swf: Player.§pl;\x01§ (spawn)
  spawn(t: Trooper, sq: Square): void {
    t.init(this.bat);
    t.setSquare(sq);
    this.register(t, false);
    arrayRemove(this.pool, t);
  }

  // swf: Player.§8w/#\x02§ — by life ratio (never 0). Dead in the SWF: defined but never
  // referenced (no caller anywhere in the client_fr.swf decompile); kept for completeness, never called.
  cmpLife(a: Trooper, b: Trooper): number {
    const x = a.life / a.getLifeMax();
    const y = b.life / b.getLifeMax();
    if (x < y) return -1;
    return 1;
  }

  // swf: Player.§z\x1bW=\x01§ — by ammo ratio (never 0).
  cmpAmmo(a: Trooper, b: Trooper): number {
    const x = a.weap!.ammo / (a.weap!.data.ammo | 0);
    const y = b.weap!.ammo / (b.weap!.data.ammo | 0);
    if (x < y) return -1;
    return 1;
  }

  // swf: Player.§1\x01D\x0f\x03§ (register)
  register(t: Trooper, notify: boolean): void {
    this.bat.troopers.push(t);
    this.bat.players[t.side]!.troopers.push(t);
    if (!notify) return;
    this.invalidateDanger();
    this.sendStatus();
  }

  // swf: Player.§dZ(*\x02§ — deploy order: bigger first, then pool order.
  cmpDeploy(a: Trooper, b: Trooper): number {
    const x = (a.sizeWeight() * 1000 - a.pid) | 0;
    const y = (b.sizeWeight() * 1000 - b.pid) | 0;
    if (x > y) return -1;
    if (x < y) return 1;
    return 0;
  }

  // swf: Player.§\x16j\x11t\x03§ — largest footprint each deploy square can hold.
  computeSizes(list: Square[]): void {
    for (const sq of this.bat.squares) sq.flag = 0;
    for (const sq of list) sq.flag = 1;
    for (const sq of list) {
      let size = -1;
      for (const fp of SIZE) {
        let ok = true;
        for (const d of fp) {
          const s = this.bat.getSq(sq.x + d[0]!, sq.y + d[1]!);
          if (s == null || s.tr != null || s.flag === 0) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
        size++;
      }
      sq.size = size;
    }
  }

  // swf: Player.§`\x1fT7\x02§ — range and danger maps of this side's troopers.
  computeDanger(): void {
    if (this.dangerOk) return;
    this.dangerOk = true;
    this.bat.computeRange(this.troopers, this.side);
    for (const sq of this.bat.squares) sq.danger[this.side] = 0;
    for (const t of this.troopers) {
      const rmin = t.weap!.rangeMin();
      const rmax = t.weap!.rangeMax();
      for (const sq of this.bat.squares) {
        const d = sq.getDist(t.square!);
        if (d >= rmin && d <= rmax) {
          sq.danger[this.side] = ((sq.danger[this.side]! as number) + 1) | 0;
        }
      }
    }
  }

  // swf: Player.§%l4q\x01§ (PlayerDeploy) — recomputes com/sabotage/dep and sends them.
  sendStatus(): void {
    this.com = 0;
    this.sabotage = 0;
    this.dep = 4;
    const all = this.pool.concat(this.troopers);
    for (const t of all) {
      if (t.have(SKILLS.COMMS_OFFICIER)) {
        this.com = (this.com + (t.data.choices.length | 0)) | 0;
      } else if (t.have(SKILLS.SABOTEUR)) {
        this.sabotage = (this.sabotage + (t.data.choices.length | 0)) | 0;
      } else if (t.have(SKILLS.SCOUT)) {
        this.dep = (this.dep + 1) | 0;
      }
      if (t.have(SKILLS.RADIO)) this.com = (this.com + 1) | 0;
    }
    this.sabotage = ((this.sabotage * 50) / this.opp.eff) | 0;
    if (this.sabotage > 100) this.sabotage = 100;
    if (this.dep > 20) this.dep = 20;
    this.dep = (this.dep + this.depBonus) | 0;
    if (this.dep < 1) this.dep = 1;
    let n = 0;
    for (const t of this.pool.concat(this.opp.pool)) {
      if (t.side === this.side) n++;
    }
    this.bat.msg(BattleMsg.PlayerStatus(this.side, { pool: n, com: this.com, vkd: this.sabotage, dep: this.dep }));
  }

  // swf: Player.§vt\x0b'\x01§ — communications officer event.
  useCom(): void {
    const all = [0, 1, 2, 3, 4, 5];
    const avail: number[] = [];
    let diff = (this.com - this.opp.com) | 0;
    if (diff < 0) diff = 0;
    for (const c of all) {
      if (diff >= (COMS[c]!.min | 0)) avail.push(c);
    }
    const ok: number[] = [];
    const ratio = (this.troopers.length | 0) / (this.opp.troopers.length | 0);
    for (const c of avail) {
      switch (c) {
        case 1:
          if (this.getGroup()!.length >= 3) ok.push(c);
          break;
        case 2:
          if (this.getPropagandaTargets().length > 0) ok.push(c);
          break;
        case 3:
          if (this.pool.length > 0 && ratio < 1 && ratio > 0.5) ok.push(c);
          break;
        case 4:
          if (this.pool.length > 0 && ratio <= 0.5 && this.troopers.length <= 5) ok.push(c);
          break;
        case 5:
          if (this.getUnlocked().length > 0) ok.push(c);
          break;
        default:
          ok.push(c);
      }
    }
    let com = 0;
    let sum = 0;
    for (const c of ok) sum = (sum + (COMS[c]!.weight | 0)) | 0;
    const r = this.bat.seed.random(sum);
    sum = 0;
    for (const c of ok) {
      com = c;
      sum = (sum + (COMS[com]!.weight | 0)) | 0;
      if (sum > r) break;
    }
    switch (com) {
      case 0: {
        const t = this.getRandomTrooper();
        t.boost(500, true);
        t.msg(BattleMsg.Boost(2));
        t.msg(BattleMsg.Announce(Announce.Com(com)));
        break;
      }
      case 1: {
        const list = this.getGroup()!;
        for (const t of list) {
          t.boost(200, true);
          t.msg(BattleMsg.Boost(2));
          t.msg(BattleMsg.Announce(Announce.Com(com)));
        }
        break;
      }
      case 2: {
        const list = this.getPropagandaTargets();
        const t = list[this.bat.seed.random(list.length)]!;
        const by = t.enemyNeighbours()[0];
        if (by == null) throw "[" + this.bat.btime + "]propaganda target error";
        by.interrupt(50);
        t.interrupt(50);
        by.msg(BattleMsg.Boost(2));
        by.msg(BattleMsg.Announce(Announce.Com(com)));
        t.switchTeam();
        by.msg(BattleMsg.Propaganda(t.data.id | 0));
        this.invalidateDanger();
        this.opp.invalidateDanger();
        this.sendStatus();
        this.opp.sendStatus();
        this.bat.addTrigger(Trigger.Check(this.opp.side));
        break;
      }
      case 3: {
        const list = this.deploy(2);
        for (const t of list) {
          t.msg(BattleMsg.Boost(2));
          t.msg(BattleMsg.Announce(Announce.Com(com)));
        }
        break;
      }
      case 4: {
        const list = this.troopers.slice();
        for (const t of list) {
          t.msg(BattleMsg.Boost(2));
          t.msg(BattleMsg.Announce(Announce.Com(com)));
          t.msg(BattleMsg.Leave(this.side, true));
          t.kill();
          this.addToPool(t.data, false);
        }
        break;
      }
      case 5: {
        const list = this.getUnlocked();
        const t = list[this.bat.seed.random(list.length)]!;
        t.msg(BattleMsg.Boost(2));
        t.setStatus(Status.LOCKED, 5000);
        break;
      }
    }
  }

  // swf: Player.§\x1fPQ0\x01§
  invalidateDanger(): void {
    this.dangerOk = false;
  }

  // swf: Player.§m5[(§
  addDepBonus(n: number): void {
    this.depBonus = (this.depBonus + n) | 0;
    this.sendStatus();
  }

  // swf: Player.§\x01~/;\x03§
  hasVehicle(): boolean {
    for (const t of this.troopers) if (t.vehicule != null) return true;
    return false;
  }

  // swf: Player.§'LZF§ — fighters at ≤ 66% life.
  getWounded(): Trooper[] {
    const out: Trooper[] = [];
    for (const t of this.troopers) {
      if (t.isReal()) {
        if (t.life <= t.getLifeMax() * 0.66) out.push(t);
      }
    }
    return out;
  }

  // swf: Player.§0 iJ\x02§
  randomSquare(): Square | null {
    if (this.troopers.length === 0) return null;
    return this.troopers[this.bat.seed.random(this.troopers.length)]!.square;
  }

  // swf: Player.§=aD9\x01§ (getRandomTrooper)
  getRandomTrooper(): Trooper {
    const list: Trooper[] = [];
    for (const t of this.troopers) if (t.isReal()) list.push(t);
    if (list.length === 0) throw "[" + this.bat.btime + "] no getRandomTrooper() !";
    return list[this.bat.seed.random(list.length)]!;
  }

  // swf: Player.§\x1b&@J\x02§
  randomTrooper(): Trooper {
    const list = this.troopers.slice();
    return list[this.bat.seed.random(list.length)]!;
  }

  // swf: Player.§\x01FP;\x01§ — enemies next to our movable troopers that propaganda can turn.
  getPropagandaTargets(): Trooper[] {
    const out: Trooper[] = [];
    for (const t of this.troopers) {
      if (t.isMovable()) {
        for (const e of t.enemyNeighbours()) {
          if (e.data.type === 0 && !e.have(SKILLS.SMART) && e.isMovable()) out.push(e);
        }
      }
    }
    return out;
  }

  // swf: Player.§^_g§ — enemies not LOCKED.
  getUnlocked(): Trooper[] {
    const out: Trooper[] = [];
    for (const t of this.opp.troopers) if (!t.hasStatus(Status.LOCKED)) out.push(t);
    return out;
  }

  // swf: Player.§a#\t\x01\x02§ (getGroup) — the 3×3 area holding most of our fighters.
  getGroup(): Trooper[] | null {
    let best: Trooper[] | null = null;
    let max = -10;
    const list = this.bat.squares.slice();
    Arr.shuffle(list, this.bat.seed);
    for (const sq of list) {
      const ts = sq.troopersAround(3);
      let n = 0;
      for (const t of ts) if (t.side === this.side && t.isReal()) n++;
      if (n > max) {
        max = n;
        best = ts;
      }
    }
    return best;
  }

  // swf: Player.§a]\x046\x03§ — free deploy squares number [start, start + n).
  getDeploySquares(n: number | null = null, start = 0): Square[] {
    const out: Square[] = [];
    if (n == null) n = this.dep;
    if (n > DEPLOY_ORDER.length) n = DEPLOY_ORDER.length;
    const end = (start + n) | 0;
    for (let i = start; i < end; i++) {
      const k = DEPLOY_ORDER[i]! | 0;
      let x = (k / YMAX) | 0;
      const y = k % YMAX | 0;
      if (this.side === 1) x = (XMAX - (x + 1)) | 0;
      const sq = this.bat.getSq(x, y)!;
      if (sq.isFree()) out.push(sq);
    }
    return out;
  }

  // swf: Player.§(\x182j\x03§ — the dep + 1 first deploy squares (free or not).
  getDeployZone(): Square[] {
    const out: Square[] = [];
    let n = this.dep;
    for (const kk of DEPLOY_ORDER) {
      const k = kk | 0;
      let x = (k / YMAX) | 0;
      const y = k % YMAX | 0;
      if (this.side === 1) x = (XMAX - (x + 1)) | 0;
      out.push(this.bat.getSq(x, y)!);
      if (n-- === 0) break;
    }
    return out;
  }

  // swf: Player.XYEn — our troopers standing in the enemy deploy zone move out.
  evacuateZone(): void {
    const zone = this.opp.getDeployZone();
    const out: Trooper[] = [];
    for (const sq of this.bat.squares) sq.flag = 0;
    for (const sq of zone) {
      sq.flag = 1;
      if (sq.tr != null && sq.tr.player === this) {
        if (sq.tr.tryAuto(SKILLS.OCCUPATION)) {
          this.bat.announce(SKILLS.OCCUPATION, sq.tr);
        } else {
          out.push(sq.tr);
        }
      }
    }
    this.bat.flushAnnounces();
    if (out.length === 0) return;
    for (const t of out) {
      const sq = t.nearestUnflagged();
      t.moveTo(sq!);
    }
  }

  // swf: Player.§c)4p\x03§ (deploy) — up to `max` pool troopers enter the battlefield.
  deploy(max = 99): Trooper[] {
    this.depBonus = 0;
    const free = this.getDeploySquares(this.dep);
    const extra = this.getDeploySquares(3, this.dep);
    let bonus = 0;
    const cands: Trooper[] = [];
    let room = 0;
    const pool = this.pool.slice();
    if (this.reversed) {
      this.reversed = false;
      bonus = 200;
      pool.reverse();
    }
    let pid = 0;
    for (const t of pool) {
      cands.push(t);
      t.pid = pid++;
      if (!t.have(SKILLS.OUT_OF_BOUNDS)) room = (room + ([1, 2, 6][t.getSize()]! | 0)) | 0;
      if (room > free.length + 8) break;
    }
    as3Sort(cands, (a, b) => this.cmpDeploy(a, b));
    const done: Trooper[] = [];
    let turned = 0;
    while (free.length > 0 && cands.length > 0 && max-- > 0) {
      this.computeSizes(free);
      const t = cands.shift()!;
      let sq: Square | null = null;
      let size = 0;
      if (t.vtype != null) {
        size = t.getSize();
        for (const s of free) {
          if (s.size >= size) {
            sq = s;
            break;
          }
        }
        if (sq == null) {
          t.vtype = null;
          size = 0;
        }
      }
      if (sq == null) sq = free[0] ?? null;
      if (t.have(SKILLS.OUT_OF_BOUNDS) && t.vtype == null && extra.length > 0) sq = extra.shift() ?? null;
      if (sq == null) throw "[" + this.bat.btime + "] DEPLOY : pas de tsq !!";
      this.spawn(t, sq);
      t.time = (t.time + bonus) | 0;
      if (t.side !== this.side) turned++;
      for (const s of t.squares) arrayRemove(free, s);
      done.push(t);
    }
    const infos: object[] = [];
    for (const t of done) infos.push(t.getInfos());
    this.bat.msg(BattleMsg.Deploy(infos, this.side));
    this.invalidateDanger();
    this.sendStatus();
    this.bat.addTrigger(Trigger.Check(this.side));
    if (turned > 0) {
      for (const t of done) {
        if (t.have(SKILLS.SUSPICIOUS) && t.side === this.side) {
          t.msg(BattleMsg.Announce(Announce.Skill(SKILLS.SUSPICIOUS)));
          t.boost(200 * turned, true);
        }
      }
    }
    return done;
  }

  // swf: Player.VnTG — empties `deads`.
  clearDeads(): void {
    while (this.deads.length > 0) this.deads.pop();
  }

  // swf: Player.§Q\x11\x1a]§ — no fighter left on the field but some in the pool.
  isWaveOver(): boolean {
    for (const t of this.troopers) if (t.isReal()) return false;
    return this.pool.length > 0;
  }

  // swf: Player.§+\x133)\x02§ — every fighter left is a crybaby: they flee.
  crybabyCheck(): boolean {
    if (this.troopers.length === 0) return false;
    let all = true;
    for (const t of this.troopers) {
      if (t.isReal() && !t.hasAuto(SKILLS.CRYBABY)) {
        all = false;
        break;
      }
    }
    if (!all) return false;
    const ids: number[] = [];
    for (const t of this.troopers) {
      if (t.tryAuto(SKILLS.CRYBABY)) ids.push(t.data.id | 0);
    }
    this.bat.msg(BattleMsg.Skill(SKILLS.CRYBABY, ids));
    return true;
  }

  // swf: Player.§uq\x07\x19\x01§ — a new trooper in the pool (`draw`: vehicle draw at creation).
  addToPool(data: TrooperData, draw: boolean): void {
    const t = new Trooper(this.bat, data, this);
    this.pool.push(t);
    if (draw) t.drawVehicle();
  }
}
