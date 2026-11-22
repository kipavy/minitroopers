// The battle data object as the SWF receives it: the Haxe-unserialized `ClientMode.BATTLE` first
// argument built by input/flashvars.ts (same keys; enum values as indexes / HxEnum).
import type { BattleInput, BattleTrooperInput, TrooperPref } from "../input/types.ts";
import { HxEnum } from "../msg/hx.ts";
import type { BattleData, PrefData, TrooperData } from "./types.ts";

/** Pref object as the SWF deserializes it from the flashvars (see input/flashvars.ts toFlashPref). */
const prefData = (p: TrooperPref | null): PrefData | null => {
  if (p === null) return null;
  let targetType: number | HxEnum;
  if (p.targetType === 0) targetType = 0;
  else if (p.targetType === 1 && p.targetClass !== undefined) targetType = new HxEnum(1, [p.targetClass]);
  else throw new RangeError("Invalid targetType/targetClass");
  const out: PrefData = {
    leftOver: p.leftOver.slice(),
    moveSystem: p.moveSystem,
    reloadSystem: p.reloadSystem ?? 2,
    CBody: p.CBody,
    CWeapon: p.CWeapon,
    targetSystem: p.targetSystem,
    targetType,
  };
  if (p.selectedItems) out.selectedItems = p.selectedItems.slice();
  return out;
};

const trooperData = (t: BattleTrooperInput): TrooperData => ({
  name: t.name,
  seed: t.seed,
  type: t.type,
  id: t.id,
  choices: t.choices.slice(),
  force: t.force.slice(),
  pref: prefData(t.pref),
});

/** The battle data object (`ClientMode.BATTLE` first argument) built from the input. */
export const battleData = (input: BattleInput): BattleData => ({
  id: input.seed,
  armies: input.armies.map((a) => ({
    troopers: a.troopers.map(trooperData),
    faction: a.faction,
    leaders: a.spawnOrder.slice(),
  })),
});

