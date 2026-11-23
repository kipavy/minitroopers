import {
  BackgroundType,
  SkillEnum,
  TrooperType,
} from "../helperSerial/enum";
import { randomMinMax } from "../helper.model";
import { Rand, getTrooperPref } from "../troopers.model";
import type { Trooper } from "../domain-types";
import { UserExtended } from "../user.model";
import {
  buildBattleInput,
  serializeBattleInput,
} from "./battleInput";
import type { BattleArmyInput, BattleInput, BattleTrooperInput } from "./types";

export const createBattleSeed = (): number => {
  const rand = new Rand();
  rand.initSeed(BigInt(Date.now() + randomMinMax(1, 999)), 7);
  return 10_000_000 + rand.random(90_000_000);
};

const mapHumanTrooper = (
  trooper: Trooper,
  id: number,
): BattleTrooperInput => ({
  id,
  name: trooper.name,
  seed: trooper.seed,
  type: TrooperType.HUMAN,
  choices: trooper.choices ?? [],
  force: [],
  pref: getTrooperPref(trooper),
});

export const buildWarBattleInput = (
  leftArmy: UserExtended,
  rightArmy: Pick<UserExtended, "troopers" | "color">,
  gfxUrl: string,
  background = {
    gfx: "bg/garden.jpg",
    id: BackgroundType.BG_GARDEN,
  },
  seed = createBattleSeed(),
): BattleInput => {
  const leftIndexes = leftArmy.troopers.map((_trooper, index) => index);
  const rightIndexes = rightArmy.troopers.map(
    (_trooper, index) => index + leftArmy.troopers.length,
  );

  const armies: [BattleArmyInput, BattleArmyInput] = [
    {
      faction: leftArmy.color,
      spawnOrder: leftIndexes,
      troopers: leftArmy.troopers.map((trooper, index) =>
        mapHumanTrooper(trooper, index),
      ),
    },
    {
      faction: rightArmy.color,
      spawnOrder: rightIndexes,
      troopers: rightArmy.troopers.map((trooper, index) =>
        mapHumanTrooper(trooper, index + leftArmy.troopers.length),
      ),
    },
  ];

  return buildBattleInput({
    seed,
    background,
    armies,
    attackerSide: 0,
    gfxUrl,
  });
};

export const serializeWarBattleInput = (
  leftArmy: UserExtended,
  rightArmy: Pick<UserExtended, "troopers" | "color">,
  gfxUrl: string,
  background?: BattleInput["background"],
): string =>
  serializeBattleInput(
    buildWarBattleInput(leftArmy, rightArmy, gfxUrl, background),
  );

export interface RatDefinition {
  seed: number;
  skills: number[];
}

export const buildExterminateBattleInput = (
  user: UserExtended,
  rats: RatDefinition[],
  gfxUrl: string,
  seed = createBattleSeed(),
): BattleInput => {
  const leftIndexes = user.troopers.map((_trooper, index) => index);
  const rightIndexes = rats.map(
    (_rat, index) => index + user.troopers.length,
  );

  return buildBattleInput({
    seed,
    background: {
      gfx: "bg/attic.jpg",
      id: BackgroundType.BG_ATTIC,
    },
    armies: [
      {
        faction: user.color,
        spawnOrder: leftIndexes,
        troopers: user.troopers.map((trooper, index) =>
          mapHumanTrooper(trooper, index),
        ),
      },
      {
        faction: 0,
        spawnOrder: rightIndexes,
        troopers: rats.map((rat, index) => ({
          id: index + user.troopers.length,
          name: "Rat",
          seed: rat.seed,
          type: TrooperType.RAT,
          choices: [],
          force: rat.skills.map(
            (skill) => new SkillEnum(SkillEnum.__construct__[skill], skill),
          ),
          pref: null,
        })),
      },
    ],
    attackerSide: 0,
    gfxUrl,
  });
};

export interface RaidOpponentDefinition {
  seed: number;
  level: number;
  choices: number[];
}

export const buildRaidBattleInput = (
  user: UserExtended,
  armyTroopers: Trooper[],
  opponents: RaidOpponentDefinition[],
  gfxUrl: string,
  seed = createBattleSeed(),
): BattleInput => {
  const leftIndexes = armyTroopers.map((_trooper, index) => index);
  const rightIndexes = opponents.map(
    (_opponent, index) => index + armyTroopers.length,
  );

  return buildBattleInput({
    seed,
    background: {
      gfx: "bg/wood.jpg",
      id: BackgroundType.BG_WOOD,
    },
    armies: [
      {
        faction: user.color,
        spawnOrder: leftIndexes,
        troopers: armyTroopers.map((trooper, index) =>
          mapHumanTrooper(trooper, index),
        ),
      },
      {
        faction: randomMinMax(0, 5),
        spawnOrder: rightIndexes,
        troopers: opponents.map((opponent, index) => ({
          id: index + armyTroopers.length,
          name: "Fighter",
          seed: opponent.seed,
          type: TrooperType.HUMAN,
          choices: opponent.choices,
          force: [],
          pref: null,
        })),
      },
    ],
    attackerSide: 0,
    gfxUrl,
  });
};
