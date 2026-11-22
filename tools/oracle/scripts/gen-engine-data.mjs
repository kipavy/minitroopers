// Regenerates packages/engine/src/data/swfTables.gen.ts from assets/swf/client_fr.swf:
//   node tools/oracle/scripts/gen-engine-data.mjs > packages/engine/src/data/swfTables.gen.ts
// (tools/oracle/test/engineData.test.ts fails when the committed file is stale.)
//
// Field lists: the exact `__unprotect__` key order of each `§EFJ\x04\x01§.§*{\x121\x02§` call in
// `Data`'s static init (decompiled `§Z(Hf\x02§`). The obfuscated keys are hashes of the original
// Haxe field names, which come in alphabetical order; readable names are given from the usage
// sites noted below (and $GL skills.model.ts / weapons.model.ts, whose key order is the same).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readResources, readTable } from "./swf-tables.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** [readable name, obfuscated key, keep in the engine table] */
const TABLES = [
  {
    name: "SKILL_ROWS",
    row: "SkillRow",
    swf: "Data.SKILL (§\\x05\\x04;|§)",
    md5: "29057e045400f1ba5f3112ae26158d57",
    fields: [
      ["cat", "m*?\\x01", true], // SkillCategory[] (Ghost: Lambda.has(cat, …))
      ["desc", "9AJ", false],
      ["desc2", "TB\\x070", false],
      ["eid", "Y9;\\x01", true],
      ["id", "7X\\x01", true], // Skill
      ["min", "}W\\x05\\x02", true], // Ghost: minimum level (lock)
      ["name", "\\x032\\x1a4", true],
      ["num", "fUd\\x01", true],
      ["open", "\\x1e(wE", true], // Skill[] (Ghost.levelUp: add)
      ["rec", "n\\x10A\\x01", true],
      ["swe", "k4Z\\x01", true],
      ["type", "An%6", true], // SkillType
      ["vh", "(\\t\\x01", true],
      ["weight", "\\x11`\\x10]\\x02", true], // Ghost.add
    ],
  },
  {
    name: "WEAPON_ROWS",
    row: "WeaponRow",
    swf: "Data.WEAPONS (§\\x04jT1\\x01§)",
    md5: "327044d641a893d2f865bafa49da9d6b",
    fields: [
      ["aim", "4H)\\x01", true],
      ["ammo", "\\x1ap\\x04f", true], // Ghost: ws.ammo
      ["crit", "t\\x1512", true], // Data.weaponInfo: "x" + crit
      ["damageType", "e~\\x13|", true], // DamageType
      ["dmax", "\\x14\\x1a~y", true], // Data.weaponInfo: dmin-dmax
      ["dmin", "\\x1bNO&", true],
      ["fr", "{\\x1d\\x01", true],
      ["habilities", "HG!k", true], // WeaponType[] (Ghost speed: HEAVY)
      ["handling", "eG%g\\x03", true],
      ["hitmin", "Wx$\\x0f\\x02", true],
      ["hit", "3\\x19/\\x01", true], // Data.weaponInfo: hit + "%"
      ["id", "7X\\x01", true], // Weapon
      ["name", "\\x032\\x1a4", true],
      ["pfr", "\\tN?\\x01", true],
      ["recovery", "G\\x18\\x1ah", true],
      ["reload", "*\\x179{\\x01", true],
      ["rmax", "X\\x16#A", true], // Data.weaponInfo: rmin-rmax
      ["rmin", "}\\x0b\\bY", true],
      ["rounds", "+8\\x19", true],
      ["score", "f!\\x13%", true],
      ["shots", "C\\x0bx\\r\\x02", true],
      ["skin", "H\\x19Z\\x05", true],
      ["taunt", "{TI'\\x03", true],
      ["type", "An%6", true], // WeaponClass
    ],
  },
  {
    name: "VEHICULE_ROWS",
    row: "VehiculeRow",
    swf: "Data.VEHICULES (§\\x01\\x10\\r\\x03\\x01§)",
    md5: "93c1c2511d9cea450f03bc25d08f4b12",
    fields: [
      ["armor", "`o0+\\x02", true], // LogicVehicle: damage -= armor
      ["hit", "3\\x19/\\x01", true],
      ["life", "NS\\x01", true], // LogicVehicle: life = data.NS
      ["id", "7X\\x01", true], // Vehicule
      ["init", "(\\x07\\x184", true], // Trooper.init: addTime(vehicle.data.init)
      ["score", "f!\\x13%", true],
      ["size", "E\\x1d\\x02\\x11", true], // Size (Trooper.getSize)
      ["skin", "H\\x19Z\\x05", true],
      ["speed", "\\x0bKd~\\x03", true], // Ghost.getSpeed
      ["weap", "5\\tmF", true], // Weapon | null (LogicVehicle weapons[0])
      ["weap2", "`3(k\\x03", true], // Weapon | null (LogicVehicle weapons[1])
    ],
  },
  {
    name: "STATUS_ROWS",
    row: "StatusRow",
    swf: "Data.STATUS (§@)Z@§)",
    md5: "3f7652c84710e1c4e9f0a254ebcf8dd1",
    fields: [
      ["desc", "9AJ", false],
      ["id", "7X\\x01", true], // Status
      ["name", "\\x032\\x1a4", true],
    ],
  },
  {
    name: "COM_ROWS",
    row: "ComRow",
    swf: "Data.COMS (§}}*h§)",
    md5: "88e53be6577914b98357c1f90ffd792e",
    fields: [
      ["id", "7X\\x01", true], // Com
      ["min", "}W\\x05\\x02", true],
      ["name", "\\x032\\x1a4", true],
      ["weight", "\\x11`\\x10]\\x02", true],
    ],
  },
];

const lit = (v) => {
  if (v === null) return "null";
  if (Array.isArray(v)) return `[${v.map(lit).join(", ")}]`;
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return Object.is(v, -0) ? "-0" : String(v);
  if (typeof v === "boolean") return String(v);
  throw new Error(`unexpected value ${JSON.stringify(v)}`);
};

const typeOf = (v) => {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (v.some((x) => typeof x !== "number")) throw new Error("non-numeric array");
    return "readonly number[]";
  }
  return typeof v;
};

const res = readResources(readFileSync(root + "assets/swf/client_fr.swf"));
let out = `// swf: Data (§\\x17@E{§) static tables, decoded from client_fr.swf resources (mt.data,
// §\`\\x0b\\x01§.§5E[\\x1d§.§EFJ\\x04\\x01§). GENERATED by tools/oracle/scripts/gen-engine-data.mjs — do not edit.
// Enum-valued fields hold the constructor index. UI text fields (descriptions) are dropped.
`;
for (const t of TABLES) {
  const rows = readTable(
    res,
    t.md5,
    t.fields.map((f) => f[0]),
  );
  rows.forEach((r, i) => {
    if (r.id !== null && r.id !== i) throw new Error(`${t.name}[${i}].id = ${r.id}`);
  });
  const kept = t.fields.filter((f) => f[2]);
  out += `
export interface ${t.row} {
`;
  for (const f of kept) {
    const types = [...new Set(rows.map((r) => typeOf(r[f[0]])))].sort();
    out += `  readonly ${f[0]}: ${types.join(" | ")}; // ${f[1]}
`;
  }
  out += `}

/** ${t.swf}, resource _res._${t.md5}. */
export const ${t.name}: readonly ${t.row}[] = [
`;
  for (const r of rows) {
    out += `  { ${kept.map((f) => `${f[0]}: ${lit(r[f[0]])}`).join(", ")} },
`;
  }
  out += `];
`;
}
process.stdout.write(out);
