// Haxe enum values and anonymous objects as the SWF builds them, plus the oracle's value
// formatter (tools/oracle/instrument/patch-msg.as `mtStr` / `mtEsc`).
//
// Representation:
// - a Haxe enum value WITHOUT parameters is the constructor index (a plain number): `mtStr`
//   prints it as `<index>`, exactly like a number;
// - a Haxe enum value WITH parameters (BattleMsg, HitEvent, Announce, Trigger, BattleEvent,
//   TargetType.SPECIFIC_CLASS) is an `HxEnum`; omitted optional constructor arguments are
//   `undefined` entries of `params` (printed `null`), as in the SWF (`[param1,param2,...]`);
// - anonymous objects are plain JS objects with readable keys; `OBF_KEYS` maps each readable key
//   to the SWF's obfuscated field name (the obfuscation is global: one name per identifier).

/** A Haxe enum value (SWF: fields `tag` §\x14s\x1e\x01§, `index` §)-Z\x19\x01§, `params` §7\x02@d\x02§). */
export class HxEnum {
  readonly index: number;
  readonly params: unknown[] | null;
  constructor(index: number, params: unknown[] | null) {
    this.index = index;
    this.params = params;
  }
}

/** Index of an enum value stored either as a number (no parameters) or as an `HxEnum`. */
export const enumIndex = (v: number | HxEnum): number => (typeof v === "number" ? v : v.index);

/**
 * Readable key → obfuscated SWF field name, for every anonymous-object key that can reach
 * `Battle.history`. Keys absent from the map are printed as is (e.g. `selectedItems`, sent by
 * $GL in clear).
 */
export const OBF_KEYS: Readonly<Record<string, string>> = {
  // history entry (Battle.msg)
  type: "An%6",
  time: "uN\x0ed",
  tid: "\x1e,d\x01",
  // Player.sendStatus (PlayerDeploy)
  pool: "Se3Z",
  com: "WJb\x01",
  vkd: "VkD\x01", // Player sabotage / LogicWeapon.getStatus spare flag (same identifier)
  dep: "\x05\x0b\x7f\x01",
  // Trooper.getInfos (§WU|\x04§)
  side: "9\x118u",
  data: "5E[\x1d",
  x: "v\x01",
  y: "l\x01",
  weapons: "\x1dI\x02\r\x03",
  weapId: "m\x0e\x01",
  life: "\x12?g-",
  state: "=\x01XR\x02",
  helmet: "(\x1f\x15F\x01",
  vh: "(\t\x01",
  // LogicWeapon.getInfos / getStatus
  status: "\x06\x01\x02",
  id: "7X\x01",
  rounds: "+8\x19\x7f",
  ammo: "\x1ap\x04f",
  // hit result
  dmg: "w;\t'\x02",
  loc: "\x02\x127\x01",
  events: "iE!m\x02",
  // trooper data (flashvars) and pref
  name: "\x032\x1a4",
  seed: "\fA2c",
  choices: "\nz\nv",
  force: "}&\x16Y\x01",
  pref: "V\x1bE|",
  leftOver: ")0\x19i\x03",
  moveSystem: "\x1dlQK\x03",
  reloadSystem: "\x11!\x0ea\x01",
  CBody: "\x1a)\x13=\x01",
  CWeapon: "\x0bR\x10\x1b\x02",
  targetSystem: ";uXE",
  targetType: "\x15S\x17?\x03",
};

/** `mtEsc`: `\uXXXX` (lowercase hex) for < 0x20, > 0x7E and `\ " | ; = , { } [ ] ( ) < >`. */
export const mtEsc = (s: string): string => {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s.charAt(i);
    if (c < 32 || c > 126 || '\\"|;=,{}[]()<>'.indexOf(ch) >= 0) {
      out += "\\u" + c.toString(16).padStart(4, "0");
    } else {
      out += ch;
    }
  }
  return out;
};

/** AS3 `String(n)` for a Number. */
export const as3NumberToString = (n: number): string => {
  if (Object.is(n, -0)) return "0";
  return String(n);
};

/** Classes the formatter prints by reference (`T<id>` / `Q<x>:<y>`), registered by the logic. */
export interface EntLike {
  getId(): number;
}
export interface SquareLike {
  x: number;
  y: number;
}
const refKinds: { isEnt: (v: object) => v is EntLike; isSquare: (v: object) => v is SquareLike } = {
  isEnt: (_v): _v is EntLike => false,
  isSquare: (_v): _v is SquareLike => false,
};
export const registerRefKinds = (k: typeof refKinds): void => {
  refKinds.isEnt = k.isEnt;
  refKinds.isSquare = k.isSquare;
};

/** `mtStr`: the oracle's value format (see tools/oracle/instrument/README.md). */
export const haxeString = (v: unknown, depth = 0): string => {
  if (v === null || v === undefined) return "null";
  if (depth > 16) return "<deep>";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return as3NumberToString(v);
  if (typeof v === "string") return '"' + mtEsc(v) + '"';
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (let i = 0; i < v.length; i++) parts.push(haxeString(v[i], depth + 1));
    return "[" + parts.join(",") + "]";
  }
  if (typeof v === "function") return "<fn>";
  if (typeof v !== "object") throw new Error(`haxeString: unsupported ${typeof v}`);
  if (refKinds.isEnt(v)) return "T" + as3NumberToString(v.getId());
  if (refKinds.isSquare(v)) return "Q" + v.x + ":" + v.y;
  if (v instanceof HxEnum) {
    const idx = String(v.index | 0);
    if (v.params === null || v.params.length === 0) return idx;
    return idx + "(" + haxeString(v.params, depth + 1).slice(1, -1) + ")";
  }
  if (Object.getPrototypeOf(v) === Object.prototype) {
    const o = v as Record<string, unknown>;
    const keys: [string, string][] = [];
    for (const k of Object.keys(o)) keys.push([OBF_KEYS[k] ?? k, k]);
    // AS3 Array.sort() on strings: UTF-16 code unit order (= JS default sort).
    keys.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return "{" + keys.map(([obf, k]) => mtEsc(obf) + "=" + haxeString(o[k], depth + 1)).join(";") + "}";
  }
  throw new Error(`haxeString: unsupported class instance ${(v as object).constructor?.name}`);
};
