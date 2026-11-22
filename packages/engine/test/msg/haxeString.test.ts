import { test } from "node:test";
import assert from "node:assert/strict";
import { BattleMsg, HitEvent, haxeString } from "../../src/msg/battleMsg.ts";
import { HxEnum, mtEsc } from "../../src/msg/hx.ts";

test("haxeString: enum without argument prints its index", () => {
  assert.equal(haxeString(BattleMsg.ReloadStart), "3");
  assert.equal(haxeString(HitEvent.STILL), "10");
  assert.equal(haxeString(new HxEnum(7, [])), "7");
});

test("haxeString: enum with an array argument", () => {
  assert.equal(haxeString(BattleMsg.NewWave([3, 2])), "39([3,2])");
  assert.equal(haxeString(BattleMsg.Positions([])), "41([])");
});

test("haxeString: null / undefined arguments (omitted optional constructor arguments)", () => {
  assert.equal(haxeString(null), "null");
  assert.equal(haxeString(undefined), "null");
  assert.equal(haxeString(BattleMsg.Skill(77)), "16(77,null,null,null)");
  assert.equal(haxeString(BattleMsg.Brawl(4, null, null, 20)), "9(4,null,null,20)");
});

test("haxeString: numbers (AS3 String(n)), booleans, strings", () => {
  assert.equal(haxeString(0.5), "0.5");
  assert.equal(haxeString(-1.25), "-1.25");
  assert.equal(haxeString(-0), "0");
  assert.equal(haxeString(12), "12");
  assert.equal(haxeString(true), "true");
  assert.equal(haxeString(false), "false");
  assert.equal(haxeString('a"b|c'), '"a\\u0022b\\u007cc"');
});

test("haxeString: anonymous objects use the SWF keys, escaped and sorted", () => {
  // Player status message, as in every golden: {dep, pool, sabotage, com}.
  assert.equal(
    haxeString(BattleMsg.PlayerStatus(0, { pool: 2, com: 0, vkd: 0, dep: 4 })),
    "40(0,{\\u0005\\u000b\\u007f\\u0001=4;Se3Z=2;VkD\\u0001=0;WJb\\u0001=0})",
  );
  // Unknown keys are printed as is (selectedItems is sent in clear by $GL).
  assert.equal(haxeString({ selectedItems: [] }), "{selectedItems=[]}");
});

test("mtEsc: control chars, > 0x7E and separators", () => {
  assert.equal(mtEsc("ab\x01\x7f;=,{}[]()<>\\"), "ab\\u0001\\u007f\\u003b\\u003d\\u002c\\u007b\\u007d\\u005b\\u005d\\u0028\\u0029\\u003c\\u003e\\u005c");
});
