// Generates the FR skill/weapon tooltips (data/tips.fr.json) from the original client_fr.swf.
//   node apps/server/scripts/gen-tips.mjs [<output json>]
// Skills: Data.SKILL `desc` ("$" = the trooper's name) + "." + " <em>desc2</em>", as on the original pages.
// Weapons (no desc): the Data.weaponInfo sheet built from Data.WEAPONS (damage, range, crits, bursts, aim,
// recovery, abilities labelled by the WeaponType table). Whitespace is collapsed like in the archived pages.
// apps/server/test/tips.test.ts checks that the 22 tooltips archived from the original site
// (docs/research/recon, read by extract-tips.mjs) come out byte-identical.
// Output: { "<skillId>": { title, body } }, body = inner HTML of the tooltip's `<div class="s">`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deobfuscate, readResources, readTable, unserialize } from "../../../tools/oracle/scripts/swf-tables.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(here, "../data/tips.fr.json");
const SWF = join(here, "../../../assets/swf/client_fr.swf");

// Field order of the resources (same as tools/oracle/scripts/gen-engine-data.mjs).
const SKILL_FIELDS = ["cat", "desc", "desc2", "eid", "id", "min", "name", "num", "open", "rec", "swe", "type", "vh", "weight"];
const WEAPON_FIELDS = ["aim", "ammo", "crit", "damageType", "dmax", "dmin", "fr", "habilities", "handling", "hitmin", "hit", "id",
  "name", "pfr", "recovery", "reload", "rmax", "rmin", "rounds", "score", "shots", "skin", "taunt", "type"];
const SKILL_WEAPON = 2; // SkillType.WEAPON

/**
 * Departures from the SWF text, each listed in docs/game/unverified.md:
 * - 107 Occupation: its "$" is money ("+1$ par jour", like the buildings table), not the trooper's name.
 * - 140 Semelles de plomb (only on the clown of the clown grenade): the SWF holds a developer note
 *   ("ne décolle pas sur FLY_TO ou KNOCKOUT"); the text below is ours, written from the engine
 *   (Trooper.isMovable / canBeMoved).
 */
const LITERAL_DOLLAR = new Set([107]);
const OURS = {
  140: { desc: "$ ne peut être ni projeté, ni renversé, ni déplacé", desc2: "\"Avec mes grolles, même un obus ne me fait pas décoller.\"" },
};

const res = readResources(readFileSync(SWF));
const skills = readTable(res, "29057e045400f1ba5f3112ae26158d57", SKILL_FIELDS);
const weapons = readTable(res, "327044d641a893d2f865bafa49da9d6b", WEAPON_FIELDS);
const habRaw = unserialize(deobfuscate(res.get("a8936ffb91995cfa622bfc06dc5467f7"))); // [label, index, ...]
const habLabel = new Map();
for (let i = 0; i < habRaw.length; i += 2) habLabel.set(habRaw[i + 1], habRaw[i]);

const li = (k, v) => `<li><b>${k}</b> : ${v}</li>`;
const weaponSheet = (w) =>
  "<ul>" +
  li("Dégâts", w.dmin === w.dmax ? w.dmin : `${w.dmin}-${w.dmax}`) +
  li("Portée", w.rmin == null ? w.rmax : `${w.rmin}-${w.rmax ?? "max"}`) +
  li("Critiques", `x${w.crit}`) +
  (w.shots > 1 ? li("Rafales", w.shots) : "") +
  li("Visée", `${w.hit}%`) +
  li("Récupération", w.recovery) +
  (w.habilities.length ? li("Habilités", w.habilities.map((h) => habLabel.get(h)).join(", ")) : "") +
  "</ul>";

const out = {};
for (const s of skills) {
  const { desc, desc2 } = OURS[s.id] ?? s;
  let body;
  if (desc || desc2) {
    const d = desc ? (LITERAL_DOLLAR.has(s.id) ? desc : desc.replaceAll("$", "<i>{name}</i>")) + "." : "";
    body = d + (desc2 ? `${d ? " " : ""}<em>${desc2}</em>` : "");
  } else if (s.type === SKILL_WEAPON) {
    const w = weapons.filter((x) => x.name === s.name);
    if (w.length !== 1) throw new Error(`skill ${s.id} ${s.name}: ${w.length} weapons with that name`);
    body = weaponSheet(w[0]);
  } else throw new Error(`skill ${s.id} ${s.name}: no text`);
  out[s.id] = { title: s.name, body: body.replace(/\s+/g, " ") };
}

writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(out).length} tips -> ${OUT}`);
