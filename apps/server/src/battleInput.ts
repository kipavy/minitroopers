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

/**
 * A daily battle: garden background, the attacker on side 0 (`attackerSide` 0), both armies complete.
 * Trooper ids must be unique across the two armies: the defender gets 0..m-1 and the attacker m..m+n-1, both in
 * their own order, as in every archived battle (b_view_bat1: defender [0], attacker [1..8]; b_view_miss1: [0..3], [4..11]).
 * The attacker's spawn order is its slot order; the defender's keeps its own order, renumbered.
 */
export function buildBattleInput(seed: number, attacker: { faction: number; troopers: readonly BattleTrooperInput[] }, defender: BattleArmyInput): BattleInput {
  const m = defender.troopers.length;
  const newId = new Map(defender.troopers.map((t, i) => [t.id, i]));
  const atk = attacker.troopers.map((t, i) => wire(t, m + i));
  return {
    seed,
    background: { gfx: "bg/garden.jpg", id: BackgroundType.BG_GARDEN },
    armies: [
      { faction: attacker.faction, spawnOrder: atk.map((t) => t.id), troopers: atk },
      {
        faction: defender.faction,
        spawnOrder: defender.spawnOrder.map((id) => newId.get(id) ?? -1),
        troopers: defender.troopers.map((t, i) => wire(t, i)),
      },
    ],
    attackerSide: 0,
  };
}
