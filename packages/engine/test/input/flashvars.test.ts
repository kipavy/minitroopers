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
    leftOver: [],
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

// Second golden, generated the same way: $GL buildExterminateBattleInput (2 humans, one with
// choices + CWeapon + CBody + selectedItems; 2 rats with force skills and pref null), then
// background set to BG_SEWER, attackerSide 1 and right faction 4 before $GL serializeBattleInput.
const INPUT_RICH: BattleInput = {
  "seed": 87654321,
  "background": {
    "gfx": "bg/sewer.jpg",
    "id": 2
  },
  "armies": [
    {
      "faction": 3,
      "spawnOrder": [
        0,
        1
      ],
      "troopers": [
        {
          "id": 0,
          "name": "Zoé:Alpha",
          "seed": 3333333,
          "type": 0,
          "choices": [
            0,
            2,
            1
          ],
          "force": [],
          "pref": {
            "CWeapon": 12,
            "CBody": 3,
            "targetSystem": 2,
            "targetType": 0,
            "moveSystem": 0,
            "reloadSystem": 3,
            "name": "Zoé:Alpha",
            "leftOver": [],
            "selectedItems": [
              5,
              7
            ]
          }
        },
        {
          "id": 1,
          "name": "Bravo",
          "seed": 5555555,
          "type": 0,
          "choices": [
            1
          ],
          "force": [],
          "pref": {
            "CWeapon": null,
            "CBody": null,
            "targetSystem": 3,
            "targetType": 0,
            "moveSystem": 2,
            "reloadSystem": 0,
            "name": "Bravo",
            "leftOver": [],
            "selectedItems": []
          }
        }
      ]
    },
    {
      "faction": 4,
      "spawnOrder": [
        2,
        3
      ],
      "troopers": [
        {
          "id": 2,
          "name": "Rat",
          "seed": 4444444,
          "type": 2,
          "choices": [],
          "force": [
            1,
            2,
            5
          ],
          "pref": null
        },
        {
          "id": 3,
          "name": "Rat",
          "seed": 6666666,
          "type": 2,
          "choices": [],
          "force": [
            0
          ],
          "pref": null
        }
      ]
    }
  ],
  "attackerSide": 1
};

const EXPECTED_RICH =
  "data=oy10%3A%253B%2501%250CZjy10%3AClientMode%3A0%3A2oy5%3A7X%2501i87654321y5%3A*M%2501oy8%3A%2524PS%2501y14%3Abg%252Fsewer.jpgR2jy14%3ABackgroundType%3A2%3A0gy11%3Aa%255De%251B%2502aoy11%3A%25601%251F*%2502aoy8%3A%25032%251A4y16%3AZo%25C3%25A9%253AAlphay6%3A%250CA2ci3333333y6%3AAn%25256jy11%3ATrooperType%3A0%3A0R2zy8%3A%250Az%250Avazi2i1hy13%3A%257D%2526%2516Y%2501ahy8%3AV%251BE%257Coy9%3A)0%2519i%2503ahy9%3A%251DlQK%2503jy10%3AMoveSystem%3A0%3A0y11%3A%2511!%250Ea%2501jy12%3AReloadSystem%3A3%3A0y13%3A%251A)%2513%253D%2501jy7%3ABodyLoc%3A3%3A0y13%3A%250BR%2510%251B%2502jy6%3AWeapon%3A12%3A0y6%3A%253BuXEjy12%3ATargetSystem%3A2%3A0y13%3A%2515S%2517%253F%2503jy10%3ATargetType%3A0%3A0y13%3AselectedItemsai5i7hggoR9y5%3ABravoR11i5555555R12jR13%3A0%3A0R2i1R14ai1hR15ahR16oR17ahR18jR19%3A2%3A0R20jR21%3A0%3A0R22nR24nR26jR27%3A3%3A0R28jR29%3A0%3A0R30ahgghy9%3AOPz%2516%2503i3y11%3AK)%2516%250A%2502azi1hgoR8aoR9y3%3ARatR11i4444444R12jR13%3A2%3A0R2i2R14ahR15ajy5%3ASkill%3A1%3A0jR35%3A2%3A0jR35%3A5%3A0hR16ngoR9R34R11i6666666R12jR13%3A2%3A0R2i3R14ahR15ajR35%3A0%3A0hR16nghR32i4R33ai2i3hghgi1R4y55%3Ahttp%253A%252F%252Flocalhost%253A4200%252Fassets%252Fswf%252Farmy.swfg";

test("toFlashvars matches $GL on rats, rich prefs, non-garden background, attackerSide 1", () => {
  assert.equal(toFlashvars(INPUT_RICH, GFX_URL), EXPECTED_RICH);
});

// Decompiled TargetType (combat/flash-port/TargetType.ts:29-31):
// `static function UpHmc(param1:Skill)` returns `new TargetType("UpHmc", 1, [param1])`,
// i.e. constructor index 1 with one Skill enum argument. SPECIFIC_CLASS is that constructor.
test("TargetType.SPECIFIC_CLASS encodes as index 1 with one Skill enum argument", () => {
  assert.equal(
    serializeHaxe(new HaxeEnum("TargetType", 1, [new HaxeEnum("Skill", 4)])),
    "jy10:TargetType:1:1jy5:Skill:4:0",
  );
  const input = structuredClone(INPUT_RICH);
  const pref = input.armies[0].troopers[0]!.pref!;
  pref.targetType = 1;
  pref.targetClass = 4;
  const withClass = toFlashvars(input, GFX_URL);
  assert.ok(decodeURIComponent(withClass).includes("jy10:TargetType:1:1jy5:Skill:4:0"));
  delete pref.targetClass;
  assert.throws(() => toFlashvars(input, GFX_URL), RangeError);
});

// $GL always sends leftOver: [] (no reference bytes for a non-empty list). The SWF compares and
// removes leftOver entries as Skill enum values (Ghost: skills.remove(pref.leftOver[i])), so they
// serialize as Skill enums; the oracle goldens (forced-skill extras) check the removal end to end.
test("pref.leftOver serializes as Skill enum values", () => {
  const input = fixture1v1();
  input.armies[0].troopers[0]!.pref!.leftOver = [57, 58];
  const fv = decodeURIComponent(toFlashvars(input, GFX_URL).slice("data=".length));
  assert.match(fv, /y9:\)0%19i%03ajy5:Skill:57:0jR\d+:58:0h/);
});
