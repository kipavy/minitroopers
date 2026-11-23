// swf: ClientMode (§OP`\t\x01§) — the `data=` flashvars of every client_fr.swf embed of the original
// pages (dispatcher §,7u\x1f§ §\x074\x10\r§), rebuilt byte for byte: key order, string cache and
// string escaping of the original server. Ctor indexes: 0 battle, 1 choice, 2 trooper, 3 machine id,
// 4 grid, 5 recruits.
import { HaxeEnum, originalUrlEncode, serializeHaxe } from "../input/haxeSerializer.ts";
import { objectObfuscator } from "../input/flashvars.ts";
import type { BattleArmyInput, BattleInput, BattleTrooperInput, TrooperPref } from "../input/types.ts";

/** ClientMode 4 argument: a grid of troopers (HQ, opponent list). */
export interface ClientGrid {
  /** Cells, row by row; `null` = empty cell (an "add" tile when `add`). */
  army: (BattleTrooperInput | null)[];
  xmax: number;
  ymax: number;
  add: boolean;
  fac: number;
  /** -1 on every original page. */
  space: number;
  /** JS callback prefix (`<action>Over/Out/Click(id)`), null for none. */
  action: string | null;
}

/** ClientMode 1 argument: the army reorganisation page (choice.html, RECON4 §3). */
export interface ClientChoice {
  /** Troopers in deployment order, id = -slot; `spawnOrder` = those ids. */
  army: BattleArmyInput;
  /** Number of recruits (the SWF pages them through `load`). */
  recruits: number;
  /** `/load?` URL prefix (the SWF appends `pos=<n>;count=16`). */
  load: string;
  /** `[]` on every original page. */
  loaded: BattleTrooperInput[];
  /** `/save?c=` URL prefix (the SWF appends the ids joined by `:`). */
  save: string;
}

const en = (name: string, index: number, args: readonly unknown[] = []): HaxeEnum => new HaxeEnum(name, index, args);

// Key order of the original pages: moveSystem, reloadSystem, leftOver, __CBody, __CWeapon,
// targetType, targetSystem (no name, no selectedItems).
const pref = (p: TrooperPref | null): Record<string, unknown> | null => {
  if (p === null) return null;
  let targetType: HaxeEnum;
  if (p.targetType === 0) targetType = en("TargetType", 0);
  else if (p.targetType === 1 && p.targetClass !== undefined) targetType = en("TargetType", 1, [en("Skill", p.targetClass)]);
  else throw new RangeError("Invalid targetType/targetClass");
  return {
    moveSystem: en("MoveSystem", p.moveSystem),
    reloadSystem: en("ReloadSystem", p.reloadSystem ?? 2),
    leftOver: p.leftOver.map((s) => en("Skill", s)),
    __CBody: p.CBody === null ? null : en("BodyLoc", p.CBody),
    __CWeapon: p.CWeapon === null ? null : en("Weapon", p.CWeapon),
    targetType,
    targetSystem: en("TargetSystem", p.targetSystem),
  };
};

// Key order of the original pages: name, pref, seed, type, choices, id, force.
const trooper = (t: BattleTrooperInput): Record<string, unknown> => ({
  name: t.name,
  pref: pref(t.pref),
  seed: t.seed,
  type: en("TrooperType", t.type),
  choices: t.choices,
  id: t.id,
  force: t.force.map((s) => en("Skill", s)),
});

const army = (a: BattleArmyInput): Record<string, unknown> => ({
  troopers: a.troopers.map(trooper),
  __UP2: a.spawnOrder,
  faction: a.faction,
});

const clientData = (mode: HaxeEnum, gfx: string | undefined): string =>
  serializeHaxe(objectObfuscator(gfx === undefined ? { mode } : { mode, gfx }), originalUrlEncode);

/** ClientMode 0 (battle, attackerSide): the battle page; `gfx` = army.swf. */
export const battleData = (input: BattleInput, gfx: string): string =>
  clientData(
    en("ClientMode", 0, [
      {
        bg: { id: en("BackgroundType", input.background.id), gfx: input.background.gfx },
        id: input.seed,
        armies: input.armies.map(army),
      },
      input.attackerSide,
    ]),
    gfx,
  );

/** ClientMode 2 (trooper, faction): one trooper (sheet, level-up, offers); `gfx` = mini.swf. */
export const trooperData = (t: BattleTrooperInput, faction: number, gfx: string): string =>
  clientData(en("ClientMode", 2, [trooper(t), faction]), gfx);

/** ClientMode 4 (grid): HQ / opponent grids; `gfx` = mini.swf. */
export const gridData = (g: ClientGrid, gfx: string): string =>
  clientData(
    en("ClientMode", 4, [
      {
        army: g.army.map((t) => (t === null ? null : trooper(t))),
        xmax: g.xmax,
        ymax: g.ymax,
        add: g.add,
        fac: g.fac,
        space: g.space,
        action: g.action,
      },
    ]),
    gfx,
  );

/** ClientMode 1 (choice): the army reorganisation page; `gfx` = mini.swf. */
export const choiceData = (c: ClientChoice, gfx: string): string =>
  clientData(
    en("ClientMode", 1, [
      { army: army(c.army), recruits: c.recruits, load: c.load, loaded: c.loaded.map(trooper), save: c.save },
    ]),
    gfx,
  );

/** ClientMode 5 (army, n, bg): the recruits animation of /history; `gfx` = army.swf. */
export const recruitsData = (a: BattleArmyInput, n: number, bg: BattleInput["background"], gfx: string): string =>
  clientData(en("ClientMode", 5, [army(a), n, { id: en("BackgroundType", bg.id), gfx: bg.gfx }]), gfx);

/** Body of `/load` (choice.html's SWF pages the recruits through it): a Haxe array of troopers. */
export const troopersList = (troopers: readonly BattleTrooperInput[]): string =>
  serializeHaxe(objectObfuscator(troopers.map(trooper)), originalUrlEncode);

/** ClientMode 3 (string): the 1×1 machine-id SWF of the creation form (the pages pass mini.swf as gfx). */
export const midData = (s: string, gfx?: string): string => clientData(en("ClientMode", 3, [s]), gfx);

/**
 * Flashvars of a client_fr.swf embed: `data=<data>&chk=play&imageurl=/img/[&endMsg=…][&onclick=…]`.
 * `chk` is a placeholder: the shipped SWF has the `chk` check bypassed (recon §3.2). `endMsg` is
 * escaped like the original server; `onclick` (a JS call) kept readable like the original pages.
 */
export const clientParams = (data: string, extra?: { endMsg?: string; onclick?: string }): string => {
  let s = `data=${encodeURIComponent(data)}&chk=play&imageurl=/img/`;
  if (extra?.endMsg !== undefined) s += `&endMsg=${originalUrlEncode(extra.endMsg)}`;
  if (extra?.onclick !== undefined) s += `&onclick=${encodeURIComponent(extra.onclick).replace(/%2C/g, ",")}`;
  return s;
};
