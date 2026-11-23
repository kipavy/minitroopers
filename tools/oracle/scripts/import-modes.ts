// Imports the archived mission/raid battle views (RECON3 §1: 13 battles) as engine fidelity fixtures
// packages/engine/test/fixtures/modes/<name>.json = { source, input, winner, notes }.
//   node tools/oracle/scripts/import-modes.ts [<recon dir>]   (default docs/research/recon)
// The flashvars are decoded with the server's test decoder; `winner` comes from the archived endMsg
// ("remporté"/"won"/"successfuly" → attackerSide, "échec"/"fail"/"lost" → the other side, anything else throws). Normalizations are listed in `notes`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeBattleFlashvars, unserialize } from "../../../apps/server/test/hxdecode.ts";

const RECON = process.argv[2] ?? fileURLToPath(new URL("../../../docs/research/recon", import.meta.url));
const EX = join(RECON, "assets/extra/site-elements/html");
const S3 = join(RECON, "stage3/wayback");
const OUT = fileURLToPath(new URL("../../../packages/engine/test/fixtures/modes/", import.meta.url));

const SOURCES: Record<string, string> = {
  com_b_view_miss1: join(EX, "com/b_view_miss1.html"),
  "03602485362_b_view_miss1": join(S3, "03602485362_b_view_miss1.html"),
  "03602485362_b_view_miss2": join(S3, "03602485362_b_view_miss2.html"),
  "03602485362_b_view_miss3": join(S3, "03602485362_b_view_miss3.html"),
  fr_b_view_miss1: join(EX, "fr/b_view_miss1.html"),
  fr_b_view_miss2: join(EX, "fr/b_view_miss2.html"),
  "1100gex90_b_view_miss1": join(S3, "1100gex90_b_view_miss1.html"),
  "1100gex90_b_view_miss2": join(S3, "1100gex90_b_view_miss2.html"),
  "1100gex90_b_view_miss3": join(S3, "1100gex90_b_view_miss3.html"),
  fr_b_view_raid: join(EX, "fr/b_view_raid.html"),
  com_b_view_raid: join(EX, "com/b_view_raid.html"),
  "03602485362_b_view_raid": join(S3, "03602485362_b_view_raid.html"),
  "1100gex90_b_view_raid": join(S3, "1100gex90_b_view_raid.html"),
};

// Army keys the decoder reads (unserialize already maps the known obfuscated keys to these names).
const ARMY_KEYS = new Set(["troopers", "faction", "__UP2"]);

mkdirSync(OUT, { recursive: true });
for (const [name, path] of Object.entries(SOURCES)) {
  const html = readFileSync(path, "utf8");
  const m = /flashvars : '([^']*)'/.exec(html);
  if (m === null) throw new Error(`${path}: no flashvars`);
  const { input, vars } = decodeBattleFlashvars(m[1]!, { nullForce: true });
  const endMsg = vars.endMsg ?? "";
  const won = /remport|won|successful/i.test(endMsg);
  if (!won && !/échec|fail|lost/i.test(endMsg)) throw new Error(`${path}: unrecognized endMsg ${JSON.stringify(endMsg)}`);
  const winner = (won ? input.attackerSide : 1 - input.attackerSide) as 0 | 1;

  const notes: string[] = [];
  const raw = unserialize(vars.data!) as { mode: { args: [{ armies: Record<string, unknown>[] }] } };
  raw.mode.args[0].armies.forEach((a, side) => {
    const extra = Object.keys(a).filter((k) => !ARMY_KEYS.has(k));
    if (extra.length > 0)
      notes.push(`armies[${side}] carries extra obfuscated fields ${extra.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(a[k])}`).join(", ")} (ignored by the engine, dropped)`);
    const nulls = (a.troopers as Record<string, unknown>[]).filter((t) => t.force === null).length;
    if (nulls > 0) notes.push(`armies[${side}]: ${nulls} trooper(s) with force: null, normalized to force: []`);
  });

  const source = path.slice(RECON.length + 1);
  const fixture = { source, endMsg, winner, notes, input };
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(fixture, null, 1) + "\n");
  const sizes = input.armies.map((a) => a.troopers.length).join(" vs ");
  console.log(`${name}: ${sizes}, winner ${winner} (${endMsg})${notes.length ? ` [${notes.length} note(s)]` : ""}`);
}
