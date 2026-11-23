import type { MissionType } from "@mt/game";
import { BackgroundType, type BattleArmyInput, type BattleInput, type BattleTrooperInput, type TrooperPref } from "@mt/engine";

/**
 * The pref as the SWF receives it (client.ts `pref`): only the fields it serializes, `reloadSystem` explicit.
 * UI-only fields (`selectedItems`, `name`) are dropped so the stored input is exactly what the page sends.
 */
function wirePref(p: TrooperPref | null): TrooperPref | null {
  if (p === null) return null;
  const out: TrooperPref = {
    CWeapon: p.CWeapon,
    CBody: p.CBody,
    targetSystem: p.targetSystem,
    targetType: p.targetType,
    moveSystem: p.moveSystem,
    leftOver: p.leftOver.slice(),
    reloadSystem: p.reloadSystem ?? 2,
  };
  if (p.targetType === 1 && p.targetClass !== undefined) out.targetClass = p.targetClass;
  return out;
}

const wire = (t: BattleTrooperInput, id: number): BattleTrooperInput => ({
  id,
  name: t.name,
  seed: t.seed,
  type: t.type,
  choices: t.choices.slice(),
  force: t.force.slice(),
  pref: wirePref(t.pref),
});

type Side = { faction: number; troopers: readonly BattleTrooperInput[] };

/**
 * Both armies with fresh ids, unique across the input: the side listed first gets 0..k-1, the other one follows, each in
 * its own order. The attacker spawns its first `spawn` troopers; the foe's spawn order is renumbered.
 */
function assemble(seed: number, background: BattleInput["background"], attacker: Side & { spawn: number }, foe: BattleArmyInput, attackerFirst: boolean): BattleInput {
  const atkBase = attackerFirst ? 0 : foe.troopers.length;
  const foeBase = attackerFirst ? attacker.troopers.length : 0;
  const newId = new Map(foe.troopers.map((t, i) => [t.id, foeBase + i]));
  const atk = attacker.troopers.map((t, i) => wire(t, atkBase + i));
  return {
    seed,
    background,
    armies: [
      { faction: attacker.faction, spawnOrder: atk.slice(0, Math.max(0, attacker.spawn)).map((t) => t.id), troopers: atk },
      {
        faction: foe.faction,
        spawnOrder: foe.spawnOrder.map((id) => newId.get(id) ?? -1),
        troopers: foe.troopers.map((t, i) => wire(t, foeBase + i)),
      },
    ],
    attackerSide: 0,
  };
}

/**
 * A daily battle: garden background, the attacker on side 0 (`attackerSide` 0), both armies complete.
 * Trooper ids must be unique across the two armies: the defender gets 0..m-1 and the attacker m..m+n-1, both in
 * their own order, as in every archived battle (b_view_bat1: defender [0], attacker [1..8]; b_view_miss1: [0..3], [4..11]).
 * The attacker's spawn order is its slot order; the defender's keeps its own order, renumbered.
 */
export function buildBattleInput(seed: number, attacker: Side, defender: BattleArmyInput): BattleInput {
  return assemble(seed, { gfx: "bg/garden.jpg", id: BackgroundType.BG_GARDEN }, { ...attacker, spawn: attacker.troopers.length }, defender, false);
}

/** Mission types and the raid. */
export type ModeKind = MissionType | "raid";

const MODE_BG: Record<ModeKind, BattleInput["background"]> = {
  exterminate: { gfx: "bg/attic.jpg", id: BackgroundType.BG_ATTIC },
  infiltrate: { gfx: "bg/sewer.jpg", id: BackgroundType.BG_SEWER },
  epic: { gfx: "bg/road.jpg", id: BackgroundType.BG_ROAD },
  raid: { gfx: "bg/wood.jpg", id: BackgroundType.BG_WOOD },
};

/**
 * A mission or raid battle (RECON3 §1-2, the 13 archived ones): background by mode (attic, sewer, road, wood); the
 * defender is numbered first for `infiltrate` and `raid` (like a daily battle), the attacker first for `exterminate`
 * and `epic`. The attacker spawns its first `spawn` troopers (its own army; epic: without the recruits; raid: none);
 * rats and NPC armies come with an empty spawn order.
 */
export function buildModeInput(p: { mode: ModeKind; seed: number; attacker: Side & { spawn: number }; foe: BattleArmyInput }): BattleInput {
  const attackerFirst = p.mode === "exterminate" || p.mode === "epic";
  return assemble(p.seed, MODE_BG[p.mode], p.attacker, p.foe, attackerFirst);
}
