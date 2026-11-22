// Engine-only search for a battle that emits BattleMsg 41 (Positions) through the live path:
// a TUCK_AND_ROLL trooper (B) aiming is shot by COVERING_FIRE during the checkAim loop of the same
// resolve() step, rolls onto a never-aimed floor weapon (target null), keeps AIM, and is the hero
// of the next step: Trooper.play case AIM emits Positions (41).
//   node tools/oracle/scripts/hunt41.ts --seed 1 --count 50000 [--variant 0..3] [--out tools/bin/tmp]
// Stops at the first hit and writes its BattleInput to <out>/hunt41-found-<seed>-<variant>.json.
// Progress / summary lines go to stdout. Uses only the engine (no oracle, no I/O besides the output).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { BattleInput, BattleTrooperInput } from "@mt/engine";
import { simulateBattleCapped } from "@mt/engine/internal";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    count: { type: "string", default: "50000" },
    variant: { type: "string", default: "0" },
    out: { type: "string", default: "tools/bin/tmp" },
  },
});
const seed = Number(values.seed);
const count = Number(values.count);
const variant = Number(values.variant);

const TUCK_AND_ROLL = 128;
const SHOCK_GRENADE = 87;
const COVERING_FIRE = 73;
const FRAGMENTATION_GRENADE = 86;
const NIMBLE_FINGERS = 105;
const SPRINTER = 117;
const JUGGLER = 99;

/** Variants: 0 = reviewer design; 1 = + fragmentation grenades both sides (more drops);
 * 2 = + speed skills on side 0; 3 = 1 and 2 combined. */
const forceFor = (side: number, r: () => number): number[] => {
  const f = side === 0 ? [TUCK_AND_ROLL, SHOCK_GRENADE] : [COVERING_FIRE, SHOCK_GRENADE];
  if (variant === 1 || variant === 3) f.push(FRAGMENTATION_GRENADE);
  if (side === 0 && (variant === 2 || variant === 3)) f.push([NIMBLE_FINGERS, SPRINTER, JUGGLER][Math.floor(r() * 3)]!);
  return f;
};

let s = (seed * 2654435761) >>> 0 || 1;
const rnd = (): number => {
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return (s >>> 0) / 4294967296;
};
const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));

const make = (): BattleInput => {
  let id = 0;
  const army = (side: number) => {
    const troopers: BattleTrooperInput[] = Array.from({ length: int(20, 32) }, () => {
      const lvl = int(1, 30);
      return {
        id: id++,
        name: `T${id}`,
        seed: int(10_000_000, 99_999_999),
        type: 0,
        choices: Array.from({ length: lvl - 1 }, () => int(0, 1)),
        force: forceFor(side, rnd),
        pref: null,
      };
    });
    return { faction: int(0, 5), spawnOrder: troopers.map((t) => t.id), troopers };
  };
  const bg = int(0, 4);
  return {
    seed: int(10_000_000, 99_999_999),
    background: { gfx: `bg/${["garden", "attic", "sewer", "road", "wood"][bg]}.jpg`, id: bg },
    armies: [army(0), army(1)],
    attackerSide: int(0, 1),
  };
};

const t0 = Date.now();
let errors = 0;
for (let i = 1; i <= count; i++) {
  const input = make();
  let events: string[];
  try {
    events = simulateBattleCapped(input).events;
  } catch {
    errors++;
    continue;
  }
  if (events.some((e) => /^EV [^|]*\|[^|]*\|41\(/.test(e))) {
    mkdirSync(values.out, { recursive: true });
    const file = join(values.out, `hunt41-found-${seed}-${variant}.json`);
    writeFileSync(file, JSON.stringify(input));
    console.log(`FOUND seed=${seed} variant=${variant} battle=${i} after ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${file}`);
    process.exit(0);
  }
  if (i % 5000 === 0) console.log(`progress seed=${seed} variant=${variant} ${i}/${count} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log(`DONE seed=${seed} variant=${variant} ${count} battles, 0 found, ${errors} errors, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
