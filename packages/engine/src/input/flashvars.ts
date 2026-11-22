// Derived from minitroopers (Eternaltwin), MIT, (c) 2026 YesLifeTechnology
import { HaxeEnum, serializeHaxe } from "./haxeSerializer.ts";
import type { BattleArmyInput, BattleInput, TrooperPref } from "./types.ts";

const OBFU_DICTIONARY: Record<string, string> = {
  "V\x1bE|": "pref",
  "\fA2c": "seed",
  "$PS\x01": "gfx",
  ";\x01\fZ": "mode",
  "An%6": "type",
  "}&\x16Y\x01": "force",
  "\x032\x1A4": "name",
  "7X\x01": "id",
  "\x0bR\x10\x1b\x02": "__CWeapon",
  "\x11!\x0ea\x01": "reloadSystem",
  "\x15S\x17?\x03": "targetType",
  "\x1a)\x13=\x01": "__CBody",
  "\x1dlQK\x03": "moveSystem",
  ")0\x19i\x03": "leftOver",
  ";uXE": "targetSystem",
  ";\x1F\x0FJ": "army",
  "\x05(\x0Bm\x02": "action",
  Vif0: "ymax",
  "hW+a": "xmax",
  "\x17\x06\t\x01": "fac",
  "\x10Gv\x01": "add",
  "\ng\x12;\x01": "space",
  "\nz\nv": "choices",
  "*M\x01": "bg",
  "a]e\x1B\x02": "armies",
  "`1\x1f*\x02": "troopers",
  "OPz\x16\x03": "faction",
  "K)\x16\n\x02": "__UP2",
};

const OBFU_REVERSE = new Map(Object.entries(OBFU_DICTIONARY).map(([k, v]) => [v, k]));

/** Rename known field names to the SWF's obfuscated keys (recursive). */
export const objectObfuscator = (obj: unknown): unknown => {
  if (!obj) return obj;
  if (obj instanceof HaxeEnum) {
    return new HaxeEnum(obj.name, obj.index, obj.args.map(objectObfuscator));
  }
  if (Array.isArray(obj)) return obj.map(objectObfuscator);
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[OBFU_REVERSE.get(k) || k] = objectObfuscator(v);
    }
    return out;
  }
  return obj;
};

const en = (name: string, index: number): HaxeEnum => new HaxeEnum(name, index);

const toFlashPref = (pref: TrooperPref | null) => {
  if (pref === null) return null;
  let targetType: HaxeEnum;
  if (pref.targetType === 0) {
    targetType = en("TargetType", 0);
  } else if (pref.targetType === 1 && pref.targetClass !== undefined) {
    // SPECIFIC_CLASS: decompiled TargetType.UpHmc(Skill) = ctor index 1, one Skill arg.
    targetType = new HaxeEnum("TargetType", 1, [en("Skill", pref.targetClass)]);
  } else {
    throw new RangeError("Invalid targetType/targetClass");
  }
  const out: Record<string, unknown> = {
    leftOver: pref.leftOver.map((k) => en("Skill", k)),
    moveSystem: en("MoveSystem", pref.moveSystem),
    reloadSystem: en("ReloadSystem", pref.reloadSystem ?? 2),
    __CBody: pref.CBody === null ? null : en("BodyLoc", pref.CBody),
    __CWeapon: pref.CWeapon === null ? null : en("Weapon", pref.CWeapon),
    targetSystem: en("TargetSystem", pref.targetSystem),
    targetType,
  };
  if (pref.selectedItems) out.selectedItems = pref.selectedItems;
  return out;
};

const toFlashArmy = (army: BattleArmyInput) => ({
  troopers: army.troopers.map((t) => ({
    name: t.name,
    seed: t.seed,
    type: en("TrooperType", t.type),
    id: t.id,
    choices: t.choices,
    force: t.force.map((f) => en("Skill", f)),
    pref: toFlashPref(t.pref),
  })),
  faction: army.faction,
  __UP2: army.spawnOrder,
});

/** `data=<url-encoded Haxe-serialized ClientMode.BATTLE>` as consumed by the SWF. */
export const toFlashvars = (input: BattleInput, gfxUrl: string): string => {
  const data = {
    mode: new HaxeEnum("ClientMode", 0, [
      {
        id: input.seed,
        bg: { gfx: input.background.gfx, id: en("BackgroundType", input.background.id) },
        armies: input.armies.map(toFlashArmy),
      },
      input.attackerSide,
    ]),
    gfx: gfxUrl,
  };
  return `data=${encodeURIComponent(serializeHaxe(objectObfuscator(data)))}`;
};
