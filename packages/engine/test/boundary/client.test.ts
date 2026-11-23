// Client flashvars builders against the original pages (minitroopers-extra site-elements/html/fr,
// fixtures decoded with the recon's hxdec.js): each builder must re-emit the original `data=`
// byte for byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  battleData,
  choiceData,
  clientParams,
  gridData,
  midData,
  recruitsData,
  trooperData,
  troopersList,
  type BattleArmyInput,
  type BattleInput,
  type BattleTrooperInput,
  type ClientChoice,
  type ClientGrid,
} from "../../src/index.ts";

interface Fixtures {
  trooper: { data: string; trooper: BattleTrooperInput; faction: number; gfx: string };
  offer: { data: string; trooper: BattleTrooperInput; faction: number; gfx: string; onclick: string; flashvars: string };
  mid: { data: string; s: string; gfx: string };
  grid: { data: string; grid: ClientGrid; gfx: string };
  battle: { data: string; input: BattleInput; gfx: string; endMsg: string; flashvars: string };
  choice: { data: string; c: ClientChoice; gfx: string };
  recruits: { data: string; army: BattleArmyInput; n: number; bg: BattleInput["background"]; gfx: string };
  load: { body: string; troopers: BattleTrooperInput[] };
}

const fx = JSON.parse(readFileSync(new URL("./fixtures/original-pages.json", import.meta.url), "utf8")) as Fixtures;

test("trooperData (ClientMode 2) re-emits t_0.html's data= byte for byte", () => {
  const d = trooperData(fx.trooper.trooper, fx.trooper.faction, fx.trooper.gfx);
  assert.equal(d, decodeURIComponent(fx.trooper.data));
  assert.equal(encodeURIComponent(d), fx.trooper.data);
});

test("trooperData (ClientMode 2, pref null) re-emits the _.html offer; clientParams adds onclick verbatim", () => {
  const d = trooperData(fx.offer.trooper, fx.offer.faction, fx.offer.gfx);
  assert.equal(encodeURIComponent(d), fx.offer.data);
  const p = clientParams(d, { onclick: fx.offer.onclick });
  const chk = fx.offer.flashvars.match(/&chk=[0-9a-f]+/)![0];
  assert.equal(p, fx.offer.flashvars.replace(chk, "&chk=play&imageurl=/img/"));
});

test("gridData (ClientMode 4) re-emits hq-levelup.html's data= byte for byte", () => {
  assert.equal(encodeURIComponent(gridData(fx.grid.grid, fx.grid.gfx)), fx.grid.data);
});

test("battleData (ClientMode 0) re-emits b_fview_262581433.html's data= byte for byte; endMsg encoded like the original", () => {
  const d = battleData(fx.battle.input, fx.battle.gfx);
  assert.equal(encodeURIComponent(d), fx.battle.data);
  const p = clientParams(d, { endMsg: fx.battle.endMsg });
  const orig = fx.battle.flashvars
    .replace(/&chk=[0-9a-f]+/, "&chk=play")
    .replace("imageurl=http://data.minitroopers.fr/img/", "imageurl=/img/");
  assert.equal(p, orig);
});

test("midData (ClientMode 3) re-emits _.html's machine-id data=", () => {
  assert.equal(encodeURIComponent(midData(fx.mid.s, fx.mid.gfx)), fx.mid.data);
});

test("gridData: null cells and action null", () => {
  const d = gridData({ army: [null, null, fx.offer.trooper, null], xmax: 4, ymax: 1, add: false, fac: 3, space: -1, action: null }, "g");
  assert.match(d, /^oy10:%3B%01%0CZjy10:ClientMode:4:1oy10:%3B%1F%0FJau2o/);
  assert.match(d, /nhy6:hW%2Bai4y4:Vif0i1y8:%10Gv%01fy12:%17%06%09%01i3y13:%0Ag%12%3B%01i-1y13:%05%28%0Bm%02ngy8:%24PS%01y1:gg$/);
});

test("clientParams: plain data, url-encoded", () => {
  assert.equal(clientParams("a:b%"), "data=a%3Ab%25&chk=play&imageurl=/img/");
});

test("choiceData (ClientMode 1) re-emits choice-2.html's data= byte for byte", () => {
  assert.equal(fx.choice.c.recruits, 18);
  assert.equal(encodeURIComponent(choiceData(fx.choice.c, fx.choice.gfx)), fx.choice.data);
});

test("recruitsData (ClientMode 5) re-emits history.html's swf_recuits data= byte for byte", () => {
  assert.equal(fx.recruits.n, 18);
  assert.equal(fx.recruits.army.troopers.length, 19);
  assert.equal(fx.recruits.army.troopers[0]!.id, 18);
  assert.match(fx.recruits.gfx, /army\.swf/);
  assert.equal(encodeURIComponent(recruitsData(fx.recruits.army, fx.recruits.n, fx.recruits.bg, fx.recruits.gfx)), fx.recruits.data);
});

test("troopersList re-emits load_pos_0_count_16.html's body byte for byte", () => {
  assert.equal(fx.load.troopers.length, 16);
  assert.equal(`${fx.load.troopers[0]!.id}:${fx.load.troopers[0]!.name}`, "588344:Jazemiller");
  assert.equal(troopersList(fx.load.troopers), fx.load.body);
});
