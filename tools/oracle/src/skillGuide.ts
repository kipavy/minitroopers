// Derived from minitroopers (Eternaltwin), MIT, Copyright (c) 2026 YesLifeTechnology:
// $GL packages/shared/src/troopers.model.ts (Rand, TrooperSkill), commit b06792e.
//
// Corpus aid only: predicts which skills a trooper is offered at each level-up so that the
// `vehicles` / `specialists` corpus can steer its 0/1 choices. It is $GL's approximation, not
// the oracle: a wrong prediction only weakens the steering, never the golden.
import { BASIC_WEAPONS, SKILL_COUNT, SKILL_GEN } from "./data/skills.ts";

class GlRand {
  seed: bigint;
  constructor(seed: number) {
    this.seed = BigInt(seed + 131);
  }
  next(): number {
    this.seed = (this.seed * 16807n) % 2147483647n;
    return Number(this.seed & 1073741823n);
  }
  random(max: number): number {
    return this.next() % max;
  }
}

/** Level-up simulator: `offers()` = the skills proposed at the next level, `pick(i)` picks one. */
export class SkillGuide {
  private readonly rand: GlRand;
  private readonly iav = new Array<number>(SKILL_COUNT).fill(0);
  private ssum = 0;
  private readonly lock: { id: number; lim: number }[] = [];
  level = 0;
  readonly skills: number[] = [];

  constructor(seed: number) {
    this.rand = new GlRand(seed);
    SKILL_GEN.forEach((s, i) => {
      if (s.min === 0) {
        if (!s.cats.includes("ARMY_JOB")) this.add(i);
      } else {
        const pos = this.lock.findIndex((e) => e.lim >= s.min);
        if (pos === -1) this.lock.push({ id: i, lim: s.min });
        else this.lock.splice(pos, 0, { id: i, lim: s.min });
      }
    });
    for (const s of SKILL_GEN) for (const o of s.open) this.remove(o);
    // physical traits
    this.rand.next();
    this.rand.next();
    this.rand.next();
    const skin = this.rand.next() % 4;
    if (skin === 0 || skin === 1) this.rand.next();
    const weapon = BASIC_WEAPONS[this.rand.random(BASIC_WEAPONS.length)]!;
    this.skills.push(weapon);
    for (const w of BASIC_WEAPONS) this.remove(w);
    this.pick(0);
  }

  private add(i: number): void {
    if (this.iav[i]! > 0) return;
    this.iav[i] = SKILL_GEN[i]!.w;
    this.ssum += SKILL_GEN[i]!.w;
  }

  private remove(i: number): void {
    if (this.iav[i] === 0) return;
    this.ssum -= this.iav[i]!;
    this.iav[i] = 0;
  }

  /** Draws the 3 offered skills for the next level (consumes the random stream). */
  private draw(): number[] {
    let weights = [...this.iav];
    let total = this.ssum;
    if (this.level === 4) {
      weights = SKILL_GEN.map((s) => (s.cats.includes("ARMY_JOB") ? s.w : 0));
      total = weights.reduce((a, b) => a + b, 0);
    }
    const out: number[] = [];
    for (let k = 0; k < 3 && total > 0; k++) {
      const r = this.rand.random(total);
      let acc = 0;
      let sel = -1;
      for (let j = 0; j < weights.length; j++) {
        acc += weights[j]!;
        if (acc > r) {
          sel = j;
          break;
        }
      }
      if (sel === -1) break;
      out.push(sel);
      total -= weights[sel]!;
      weights[sel] = 0;
    }
    return out;
  }

  private pending: number[] | undefined;

  /** Skills offered at the next level-up. */
  offers(): number[] {
    return (this.pending ??= this.draw());
  }

  /** Picks offer `choice` (0/1) and levels up. */
  pick(choice: number): void {
    const offers = this.offers();
    this.pending = undefined;
    const sel = offers[choice];
    if (sel !== undefined) {
      this.skills.push(sel);
      this.remove(sel);
    }
    this.level++;
    while (this.lock.length > 0 && this.level > this.lock[0]!.lim) this.add(this.lock.shift()!.id);
    if (sel !== undefined) for (const o of SKILL_GEN[sel]!.open) this.add(o);
  }
}
