// swf: logic.Ghost (§P!L/\x02§.§9\x19\x02~§) — trooper build from its seed, level-up choices,
// forced skills and `pref.leftOver`. Constructed in the Trooper constructor (Player construction),
// before the battle Rand is ever used: everything here depends on the trooper input only.
import { Rand } from "../core/rand.ts";
import { SKILL_CATEGORIES, SKILL_TYPES, SKILLS } from "../data/enums.ts";
import {
  at,
  arrayRemove,
  defaultPref,
  has,
  skillRow,
  SKILL,
  START_WEAPON_SKILLS,
  VEHICULE,
  WEAPON,
  skillWeapon,
} from "../data/data.ts";
import type { GhostPref } from "../data/data.ts";

/** The trooper data object the SWF hands to `new Ghost(data)` (enum fields as constructor indexes). */
export interface GhostData {
  id: number; // §7X\x01§
  name: string; // §\x032\x1a4§
  seed: number; // §\fA2c§
  type: number; // §An%6§ TrooperType
  choices: readonly number[]; // §\nz\nv§
  force: readonly number[] | null; // §}&\x16Y\x01§ Skill[]
  pref: GhostPref | null; // §V\x1bE|§
}

/** `physical` (§N{%\r\x02§); keys are the SWF's ($GL names where known). */
export interface GhostPhysical {
  skinColor: number; // §\x05d9k\x03§
  hairCut: number; // §u0g/\x02§
  hairColor: number; // §\x0f\x0en\x12\x02§
  LKZ: number; // §LKZ\x14§
  m3: number; // §m;3\x17\x01§
}

/** A pending skill unlocked once `lvl > lim` (§r\x01w#§ entries `{\x04\x11\x16\x01: sid, c\t\x02\x02: lim}`). */
interface Lock {
  sid: number;
  lim: number;
}

export class Ghost {
  /** §5E[\x1d§ — the data object; `pref` is filled with the default when null. */
  readonly data: GhostData & { pref: GhostPref };
  /** §Kr)r§ */
  flag = false;
  /** §\x078MB\x03§ — number of options drawn per level-up. */
  choiceCount = 3;
  /** §\x17G\x01\x13\x03§ */
  stat17G = 3;
  /** §\fA2c§ */
  readonly seed: Rand;
  /** §N{%\r\x02§ */
  physical!: GhostPhysical;
  /** §\n@?\x01§ */
  lvl = 0;
  /** §\x03\f;Z\x03§ — life (Trooper.getLifeMax). */
  life = 10;
  /** §W}\r#\x02§ — speed coefficient (Trooper.getSpeed base). */
  speedCoef = 1;
  /** §\x01\f4b\x02§ — base move value of the speed formula (§/^(F\x01§). */
  moveBase = 1;
  /** §0\x06@F\x03§ — Skill indexes, in application order. */
  skills: number[] = [];
  /** §&N?\x0f\x02§ — Data.SKILL.length. */
  skillCount = 0;
  /** §p\x13\b\x02§ — draw weight of each skill still available. */
  iav: number[] = [];
  /** §W~\bh§ (int) — Σ iav. */
  ssum = 0;
  /** §r\x01w#§ — skills locked until a level, sorted by `lim`. */
  lock: Lock[] = [];
  /** §/4D\x1f\x01§ — categories still open once (the ARMY_JOB slot). */
  openCats: number[] = [];
  /** §P4Y_\x03§ — the last applied skill with category 0 (ARMY_JOB); a helmet when non-null. */
  job: number | null = null;

  constructor(param1: GhostData) {
    const data = param1 as GhostData & { pref: GhostPref };
    this.data = data;
    this.flag = false;
    this.choiceCount = 3;
    this.stat17G = 3;
    this.seed = new Rand(param1.seed | 0);
    if (data.pref == null) data.pref = defaultPref();
    this.initPhysical(); // §\x07@\x19E§
    this.initStats(); // §\x1e\x0f}\x03\x02§
    this.initPool(); // §D%\x05e\x02§
    switch (data.type) {
      case 0: {
        const list = START_WEAPON_SKILLS;
        // int(((int(seed = seed * 16807 % 2147483647)) & 0x3FFFFFFF) % int(list.length)) = Rand.random
        const pick = at(list, this.seed.random(list.length));
        this.apply(pick);
        for (const s of list) this.rem(s);
        this.lvl = -1;
        this.levelUp(0);
        for (const c of data.choices) this.levelUp(c | 0);
        break;
      }
      default:
        break;
    }
    if (data.force != null) {
      for (const s of data.force) this.apply(s);
    }
    for (const s of data.pref.leftOver) arrayRemove(this.skills, s);
  }

  /** §{z\r@\x01§ — remove from the pool every skill of category `cat`. */
  remCategory(cat: number): void {
    const n = this.iav.length; // iterates iav.copy()
    for (let i = 0; i < n; i++) {
      if (has(skillRow(i).cat, cat)) this.rem(i);
    }
  }

  /** §om\t\x01§ */
  rem(skill: number): void {
    const w = this.iav[skill] as number;
    this.ssum = (this.ssum - w) | 0;
    this.iav[skill] = 0;
  }

  /** §3\x12ku§ */
  mult(skill: number, k: number): void {
    const w = this.iav[skill] as number;
    this.iav[skill] = w * k;
    this.ssum = (this.ssum + w * (k - 1)) | 0;
  }

  /** §\x14b9t§ */
  levelUp(choice: number): void {
    if (choice === -1 || this.lvl > 50) {
      this.lvl++;
      return;
    }
    // int(§zUR§()[param1]): an out-of-range choice reads undefined → int(undefined) = 0 (SOLDIER).
    const skill = (this.drawOptions()[choice] ?? 0) | 0;
    this.lvl++;
    this.apply(skill);
    this.rem(skill);
    const row = skillRow(skill);
    for (const cat of row.cat) {
      if (has(this.openCats, cat)) {
        arrayRemove(this.openCats, cat);
        if (!has(this.openCats, cat)) this.remCategory(cat);
      }
    }
    for (const s of row.open) this.add(s);
    while (this.lock.length > 0 && this.lvl > (this.lock[0] as Lock).lim) {
      this.add((this.lock.shift() as Lock).sid);
    }
  }

  /** §\x07@\x19E§ — 4 draws, plus one for skin colours 0 and 1. */
  initPhysical(): void {
    const r = this.seed;
    const skinColor = r.random(4);
    const hairCut = r.random(13);
    const LKZ = r.random(4);
    const m3 = r.random(4);
    this.physical = { skinColor, hairCut, hairColor: 0, LKZ, m3 };
    switch (skinColor) {
      case 0:
        this.physical.hairColor = (1 + r.random(8)) | 0;
        break;
      case 1:
        this.physical.hairColor = r.random(3);
        break;
      case 2:
      case 3:
        this.physical.hairColor = 0;
        break;
    }
  }

  /** §(%Q\x02§ */
  have(skill: number): boolean {
    return has(this.skills, skill);
  }

  /** §\\\x16\f\n\x02§ — WEAPON-type skills, in skill order. */
  weaponSkills(): number[] {
    return this.skills.filter((s) => skillRow(s).type === SKILL_TYPES.WEAPON);
  }

  /** §j\x02Xl\x01§ — `{type: Weapon, ws: {ammo, rounds: 0, VkD: false}, id: 0}` per WEAPON skill. */
  weaponSlots(): { type: number; ws: { ammo: number; rounds: number; VkD: boolean }; id: number }[] {
    return this.weaponSkills().map((s) => {
      const w = skillWeapon(s);
      return { type: w, ws: { ammo: at(WEAPON, w).ammo | 0, rounds: 0, VkD: false }, id: 0 };
    });
  }

  /** §3v]'\x02§ — skills of category EQUIPMENT. */
  getEquipment(): number[] {
    return this.skills.filter((s) => has(skillRow(s).cat, SKILL_CATEGORIES.EQUIPMENT));
  }

  /** §7M?r\x03§ — preferred weapon (pref.CWeapon) or the first weapon skill's. */
  preferredWeapon(): number {
    if (this.data.pref.CWeapon != null) return this.data.pref.CWeapon;
    return at(this.weaponSlots(), 0).type;
  }

  /** z8KR — per category of `cats`, how many of `skills` carry it. */
  countCats(skills: readonly number[], cats: readonly number[]): number[] {
    const out = cats.map(() => 0);
    for (const s of skills) {
      const row = skillRow(s);
      for (let i = 0; i < cats.length; i++) {
        if (has(row.cat, cats[i] as number)) out[i] = ((out[i] as number) + 1) | 0;
      }
    }
    return out;
  }

  /** §\x18n!\x1e\x01§ — per category, share of the skills owned (normalised). */
  getStats(cats: readonly number[]): number[] {
    const all = this.countCats(
      SKILL.map((r) => r.id),
      cats,
    );
    const mine = this.countCats(this.skills, cats);
    let sum = 0;
    const out: number[] = [];
    for (let i = 0; i < cats.length; i++) {
      const v = (mine[i] as number) / (all[i] as number);
      out.push(v);
      sum += v;
    }
    for (let i = 0; i < cats.length; i++) out[i] = (out[i] as number) / sum;
    return out;
  }

  /**
   * §/^(F\x01§ — move speed: the vehicle's when one is given; else `1 / max(0.1, moveBase − 0.25 ×
   * heavy weapons (+1, or 0 with STURDY) − per wound (LEG_LEFT/LEG_RIGHT 0.25, other 0.05))`.
   */
  getSpeed(weapons: readonly number[], wounds: readonly number[], vehicule: number | null): number {
    if (vehicule != null) return at(VEHICULE, vehicule).speed as number;
    let v = this.moveBase;
    let heavy = 1;
    for (const w of weapons) {
      if (has(at(WEAPON, w).habilities, WEAPON_TYPE_HEAVY)) heavy++;
    }
    if (this.have(SKILLS.STURDY)) heavy = 0;
    v -= 0.25 * heavy;
    for (const loc of wounds) {
      switch (loc) {
        case 6:
          v -= 0.25;
          break;
        case 7:
          v -= 0.25;
          break;
        default:
          v -= 0.05;
      }
    }
    if (v < 0.1) v = 0.1;
    return 1 / v;
  }

  /** §\x0ezUR\x02§ — draws `choiceCount` distinct options by weight (lvl 4: ARMY_JOB skills only). */
  drawOptions(): number[] {
    let pool = this.iav.slice();
    let total = this.ssum;
    if (this.lvl === 4) {
      pool = [];
      for (let i = 0; i < this.skillCount; i++) {
        const row = skillRow(i);
        pool[i] = 0;
        if (has(row.cat, SKILL_CATEGORIES.ARMY_JOB)) pool[i] = row.weight | 0;
      }
      total = 0;
      for (const w of pool) total = (total + w) | 0;
    }
    const out: number[] = [];
    for (let k = 0; k < this.choiceCount; k++) {
      // int(((int(seed = seed * 16807 % 2147483647)) & 0x3FFFFFFF) % _loc2_), _loc2_:int = Rand.random
      const r = this.seed.random(total);
      let acc = 0;
      let idx = 0;
      for (const w of pool) {
        acc = (acc + w) | 0;
        if (acc > r) break;
        idx++;
      }
      const w = pool[idx];
      if (w == null) throw new Error("ouch");
      total = (total - w) | 0;
      pool[idx] = 0;
      out.push(idx);
    }
    return out;
  }

  /** §D%\x05e\x02§ */
  initPool(): void {
    this.skillCount = SKILL.length;
    this.iav = [];
    this.ssum = 0;
    this.lock = [];
    for (let i = 0; i < this.skillCount; i++) {
      this.iav[i] = 0;
      const row = skillRow(i);
      if ((row.min | 0) === 0) {
        if (!has(row.cat, SKILL_CATEGORIES.ARMY_JOB)) this.add(i);
      } else {
        this.addLock(i, row.min | 0);
      }
    }
    this.openCats = [SKILL_CATEGORIES.ARMY_JOB];
    this.remCategory(SKILL_CATEGORIES.CAT_1);
    for (let i = 0; i < this.skillCount; i++) {
      for (const s of skillRow(i).open) this.rem(s);
    }
  }

  /** §\x1e\x0f}\x03\x02§ */
  initStats(): void {
    this.lvl = 0;
    this.life = 10;
    this.speedCoef = 1;
    this.moveBase = 1;
    this.skills = [];
  }

  /** apply — adds a skill (unless in pref.leftOver) and its stat effects. */
  apply(skill: number): void {
    const id = skillRow(skill).id;
    for (const s of this.data.pref.leftOver) {
      if (s === id) return;
    }
    switch (id) {
      case 0: // SOLDIER
        this.life = (this.life + this.data.choices.length) | 0;
        break;
      case 2: // PILOT: ×3 the weight of every SPAWN-type skill
        for (let i = 0; i < this.skillCount; i++) {
          if (skillRow(i).type === SKILL_TYPES.SPAWN) this.mult(i, 3);
        }
        break;
      case 47:
        this.life = (this.life + 8) | 0;
        break;
      case 49:
        this.life = (this.life + 3) | 0;
        this.moveBase += 0.25;
        break;
      case 54:
        this.speedCoef += 0.3;
        this.stat17G = (this.stat17G - 1) | 0;
        break;
      case 55:
        this.life = (this.life + 3) | 0;
        break;
      case 64: // SMART: one more option per level-up
        this.choiceCount = (this.choiceCount + 1) | 0;
        break;
      case 66:
        this.speedCoef += 0.25;
        break;
      case 70:
        this.life = (this.life + 5) | 0;
        break;
      case 81:
        this.moveBase -= 0.25;
        break;
      case 95:
        this.life = (this.life + 10) | 0;
        this.speedCoef -= 0.2;
        break;
      case 96:
        this.speedCoef += 0.1;
        break;
      case 97:
        this.speedCoef += 0.5;
        break;
      case 117:
        this.moveBase += 1;
        break;
      case 121:
        this.life = (this.life + 3) | 0;
        break;
    }
    for (const cat of skillRow(id).cat) {
      if (cat === SKILL_CATEGORIES.ARMY_JOB) this.job = id;
    }
    this.skills.push(id);
  }

  /** §jgK\x01§ — insert keeping `lock` sorted by `lim` (before the first entry with lim >= `lim`). */
  addLock(sid: number, lim: number): void {
    let i = 0;
    for (const l of this.lock) {
      if ((l.lim | 0) >= lim) break;
      i++;
    }
    this.lock.splice(i, 0, { sid, lim });
  }

  /** §\x10Gv\x01§ */
  add(skill: number): void {
    if ((this.iav[skill] as number) > 0) return;
    const w = skillRow(skill).weight | 0;
    this.iav[skill] = w;
    this.ssum = (this.ssum + w) | 0;
  }
}

/** WeaponType.§_N+C\x01§ (HEAVY): constructor index of `§(N[§`. */
const WEAPON_TYPE_HEAVY = 4;
