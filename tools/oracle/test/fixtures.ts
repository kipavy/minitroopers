import type { BattleInput, BattleTrooperInput } from "@mt/engine";

// Same 1v1 fixture as packages/engine/test/input/flashvars.test.ts (task 2).
const trooper = (id: number, name: string, seed: number): BattleTrooperInput => ({
  id,
  name,
  seed,
  type: 0,
  choices: [],
  force: [],
  pref: {
    CWeapon: null,
    CBody: null,
    targetSystem: 0,
    targetType: 0,
    moveSystem: 1,
    reloadSystem: 2,
    name,
    leftOver: [],
    selectedItems: [],
  },
});

export const fixture1v1 = (): BattleInput => ({
  seed: 12_345_678,
  background: { gfx: "bg/garden.jpg", id: 0 },
  armies: [
    { faction: 1, spawnOrder: [0], troopers: [trooper(0, "Alpha", 1_111_111)] },
    { faction: 2, spawnOrder: [1], troopers: [trooper(1, "Beta", 2_222_222)] },
  ],
  attackerSide: 0,
});
