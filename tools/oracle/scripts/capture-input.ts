// Captures oracle goldens for explicit BattleInput JSON files (e.g. a hunt41 hit) into
// tools/oracle/golden/regression/<name>.json.gz, and checks the engine against each one.
//   node tools/oracle/scripts/capture-input.ts <name>=<input.json> [<name>=<input.json> ...]
import { readFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { simulateBattleCapped, type BattleInput } from "@mt/engine";
import { GOLDEN_DIR } from "../src/capture.ts";
import { diffRecords } from "../src/diff.ts";
import { OracleRunner } from "../src/runner.ts";

const dir = join(GOLDEN_DIR, "regression");
mkdirSync(dir, { recursive: true });
const runner = new OracleRunner();
let ko = 0;
try {
  for (const arg of process.argv.slice(2)) {
    const [name, path] = arg.split("=") as [string, string];
    const input = JSON.parse(readFileSync(path, "utf8")) as BattleInput;
    const trace = await runner.run(input);
    const file = join(dir, `${name}.json.gz`);
    writeFileSync(file + ".tmp", gzipSync(JSON.stringify(trace), { level: 9 }));
    renameSync(file + ".tmp", file);
    const d = diffRecords(trace.record, simulateBattleCapped(input));
    const ev41 = trace.record.events.filter((e) => /^EV [^|]*\|[^|]*\|41\(/.test(e));
    console.log(`${file}: ${d === null ? "engine OK" : `engine KO at line ${d.index}`}; oracle EV 41 lines: ${ev41.join(" ; ") || "none"}`);
    if (d !== null) ko++;
  }
} finally {
  await runner.close();
}
if (ko > 0) process.exitCode = 1;
