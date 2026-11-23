import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { haxeTrim, seedsOffering } from "@mt/game";
import { checkArmyName, checkTrooperName } from "../src/validate.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SERVER_SRC = join(ROOT, "apps/server/src");
const GAME_SRC = join(ROOT, "packages/game/src");

/** Every .ts file under `dir`, with its text. */
function sources(dir: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (p.endsWith(".ts")) out.push({ file: p.slice(ROOT.length), text: readFileSync(p, "utf8") });
  }
  return out;
}

/** Files (relative to the repo) and occurrence counts of `needle` under the given directories. */
function occurrences(needle: string | RegExp, ...dirs: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { file, text } of dirs.flatMap(sources)) {
    const n = typeof needle === "string" ? text.split(needle).length - 1 : [...text.matchAll(new RegExp(needle.source, "g"))].length;
    if (n > 0) out[file] = n;
  }
  return out;
}

test("haxeTrim: one definition in @mt/game, used by validate.ts (Haxe spaces only)", () => {
  assert.equal(haxeTrim("  a "), "a");
  assert.equal(haxeTrim("\t\n a\r\u000b\u000c"), "a");
  assert.equal(haxeTrim(" a "), " a "); // not a Haxe space
  const t = checkTrooperName("  a ");
  assert.deepEqual(t, { ok: true, name: haxeTrim("  a ") });
  const a = checkArmyName("  Les Rats ", "0");
  assert.ok(a.ok && a.name === haxeTrim("  Les Rats "));
  assert.deepEqual(occurrences("function haxeTrim", SERVER_SRC, GAME_SRC), { "packages/game/src/host.ts": 1 });
});

test("seedsOffering gives up with a RangeError after `max` seeds", () => {
  assert.throws(() => seedsOffering(999, 1, 273018, 50), RangeError);
  assert.deepEqual(seedsOffering(64, 3, 273018, 100), [273027, 273048, 273071]);
});

test("one form body limit, one definition of each shared text, one power SQL", () => {
  assert.deepEqual(occurrences("bodyLimit(", SERVER_SRC), { "apps/server/src/form.ts": 1 });
  assert.deepEqual(occurrences(/(const|let|var) ERR_OFFER\b/, SERVER_SRC), { "apps/server/src/texts.ts": 1 });
  assert.deepEqual(occurrences(/(const|let|var) ERR_RATE\b/, SERVER_SRC), { "apps/server/src/texts.ts": 1 });
  assert.deepEqual(occurrences("Trop de tentatives.", SERVER_SRC), { "apps/server/src/texts.ts": 1 });
  assert.deepEqual(occurrences("json_array_length(", SERVER_SRC), { "apps/server/src/repo.ts": 1 });
  assert.match(readFileSync(join(SERVER_SRC, "repo.ts"), "utf8"), /const POWER_SQL = "SUM\(5 \+ json_array_length\(choices\)\)"/);
  assert.deepEqual(occurrences("INSERT INTO notices", join(SERVER_SRC, "routes")), {});
  assert.deepEqual(occurrences("SELECT credits FROM", join(SERVER_SRC, "routes")), {});
  assert.deepEqual(occurrences("battlesPerDay(", SERVER_SRC), {});
  assert.deepEqual(occurrences(/(const|function) BG\b/, join(SERVER_SRC, "views")), { "apps/server/src/views/hq.ts": 1 });
  assert.deepEqual(occurrences("leftOver: []", GAME_SRC), { "packages/game/src/rats.ts": 1 });
  assert.deepEqual(occurrences(".has(x.recruitArmyId)", SERVER_SRC), {});
  assert.deepEqual(occurrences(/!dead\.has\(/, SERVER_SRC), { "apps/server/src/repo.ts": 1 });
});
