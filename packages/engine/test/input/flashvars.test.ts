import { test } from "node:test";
import assert from "node:assert/strict";
import { toFlashvars } from "../../src/input/flashvars.ts";
import { HaxeEnum, serializeHaxe } from "../../src/input/haxeSerializer.ts";
import {
  BackgroundType,
  MoveSystem,
  ReloadSystem,
  TargetSystem,
  TrooperType,
  type BattleInput,
  type BattleTrooperInput,
} from "../../src/input/types.ts";

const GFX_URL = "http://localhost:4200/assets/swf/army.swf";

// Generated once by running $GL's own buildWarBattleInput + serializeBattleInput
// (packages/shared/src/combat) via tsx on the 1v1 fixture of simulateBattle.test.ts.
const EXPECTED_1V1 =
  "data=oy10%3A%253B%2501%250CZjy10%3AClientMode%3A0%3A2oy5%3A7X%2501i12345678y5%3A*M%2501oy8%3A%2524PS%2501y15%3Abg%252Fgarden.jpgR2jy14%3ABackgroundType%3A0%3A0gy11%3Aa%255De%251B%2502aoy11%3A%25601%251F*%2502aoy8%3A%25032%251A4y5%3AAlphay6%3A%250CA2ci1111111y6%3AAn%25256jy11%3ATrooperType%3A0%3A0R2zy8%3A%250Az%250Avahy13%3A%257D%2526%2516Y%2501ahy8%3AV%251BE%257Coy9%3A)0%2519i%2503ahy9%3A%251DlQK%2503jy10%3AMoveSystem%3A1%3A0y11%3A%2511!%250Ea%2501jy12%3AReloadSystem%3A2%3A0y13%3A%251A)%2513%253D%2501ny13%3A%250BR%2510%251B%2502ny6%3A%253BuXEjy12%3ATargetSystem%3A0%3A0y13%3A%2515S%2517%253F%2503jy10%3ATargetType%3A0%3A0y13%3AselectedItemsahgghy9%3AOPz%2516%2503i1y11%3AK)%2516%250A%2502azhgoR8aoR9y4%3ABetaR11i2222222R12jR13%3A0%3A0R2i1R14ahR15ahR16oR17ahR18jR19%3A1%3A0R20jR21%3A2%3A0R22nR23nR24jR25%3A0%3A0R26jR27%3A0%3A0R28ahgghR29i2R30ai1hghgzR4y55%3Ahttp%253A%252F%252Flocalhost%253A4200%252Fassets%252Fswf%252Farmy.swfg";

const trooper = (id: number, name: string, seed: number): BattleTrooperInput => ({
  id,
  name,
  seed,
  type: TrooperType.HUMAN,
  choices: [],
  force: [],
  pref: {
    CWeapon: null,
    CBody: null,
    targetSystem: TargetSystem.CLOSEST,
    targetType: 0,
    moveSystem: MoveSystem.STANDARD,
    reloadSystem: ReloadSystem.DEFAULT,
    name,
    selectedItems: [],
  },
});

const fixture1v1 = (): BattleInput => ({
  seed: 12_345_678,
  background: { gfx: "bg/garden.jpg", id: BackgroundType.BG_GARDEN },
  armies: [
    { faction: 1, spawnOrder: [0], troopers: [trooper(0, "Alpha", 1_111_111)] },
    { faction: 2, spawnOrder: [1], troopers: [trooper(1, "Beta", 2_222_222)] },
  ],
  attackerSide: 0,
});

test("toFlashvars matches $GL serializeBattleInput on the 1v1 fixture", () => {
  assert.equal(toFlashvars(fixture1v1(), GFX_URL), EXPECTED_1V1);
});

// Expected values produced by $GL's Serializer.serialize on the same inputs.
test("serializeHaxe: numbers", () => {
  assert.equal(serializeHaxe(-5), "i-5");
  assert.equal(serializeHaxe(0), "z");
  assert.equal(serializeHaxe(2147483647), "i2147483647");
  assert.equal(serializeHaxe(-2147483648), "i-2147483648");
  assert.equal(serializeHaxe(1.5), "d1.5");
});

test("serializeHaxe: strings, booleans, null", () => {
  assert.equal(serializeHaxe("a:é b"), "y14:a%3A%C3%A9%20b");
  assert.equal(serializeHaxe(true), "t");
  assert.equal(serializeHaxe(null), "n");
});

test("serializeHaxe: arrays and objects", () => {
  assert.equal(serializeHaxe([]), "ah");
  assert.equal(serializeHaxe([1, null, null, 2, null]), "ai1u2i2nh");
  assert.equal(serializeHaxe({ a: 1, b: "a", c: "a" }), "oy1:ai1y1:bR0y1:cR0g");
});

test("serializeHaxe: enums", () => {
  assert.equal(serializeHaxe(new HaxeEnum("TrooperType", 2)), "jy11:TrooperType:2:0");
  assert.equal(
    serializeHaxe(new HaxeEnum("TargetType", 1, [7])),
    "jy10:TargetType:1:1i7",
  );
  assert.equal(
    serializeHaxe([new HaxeEnum("Skill", 0), new HaxeEnum("Skill", 0)]),
    "ajy5:Skill:0:0jR0:0:0h",
  );
});
