// CLI: compares the TS engine (simulateBattle) with the golden traces.
//   npm run oracle:diff -- [--tag t] [--limit n] [--dir golden-dir]
// Per golden: `OK` or the first divergence (0-based line index in the TRP…, EV…, END
// sequence, expected vs actual, 5 preceding lines of context). Totals per tag and overall;
// exit code 1 on any divergence or engine failure (e.g. NotImplemented).
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { simulateBattle, type BattleInput, type BattleRecord } from "@mt/engine";
import { GOLDEN_DIR } from "./capture.ts";
import type { OracleTrace } from "./runner.ts";

export const CONTEXT_LINES = 5;

export interface Divergence {
  index: number;
  expected: string;
  actual: string;
  /** Up to CONTEXT_LINES expected lines preceding `index`. */
  context: string[];
}

/** The ordered line sequence of a record: TRP lines, EV lines, then `END winner|graveyard`. */
export const flattenRecord = (r: BattleRecord): string[] => [
  ...r.troopers.map((t) => t.line),
  ...r.events,
  `END ${r.winner === null ? "null" : r.winner}|${r.graveyard.join(",")}`,
];

export const diffRecords = (expected: BattleRecord, actual: BattleRecord): Divergence | null => {
  const e = flattenRecord(expected);
  const a = flattenRecord(actual);
  const n = Math.max(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (e[i] !== a[i]) {
      return {
        index: i,
        expected: e[i] ?? "<absent>",
        actual: a[i] ?? "<absent>",
        context: e.slice(Math.max(0, i - CONTEXT_LINES), i),
      };
    }
  }
  return null;
};

export interface GoldenItem {
  tag: string;
  file: string;
  trace: OracleTrace;
}

export interface DiffResult {
  ok: number;
  ko: number;
  lines: string[];
  perTag: Record<string, { ok: number; ko: number }>;
}

export const runDiff = (
  goldens: Iterable<GoldenItem>,
  simulate: (input: BattleInput) => BattleRecord,
  opts: { limit?: number } = {},
): DiffResult => {
  const res: DiffResult = { ok: 0, ko: 0, lines: [], perTag: {} };
  const seen: Record<string, number> = {};
  for (const g of goldens) {
    seen[g.tag] = (seen[g.tag] ?? 0) + 1;
    if (opts.limit !== undefined && seen[g.tag]! > opts.limit) continue;
    const tot = (res.perTag[g.tag] ??= { ok: 0, ko: 0 });
    const name = `${g.tag}/${g.file}`;
    let actual: BattleRecord;
    try {
      actual = simulate(g.trace.input);
    } catch (err) {
      tot.ko++;
      res.ko++;
      res.lines.push(`KO ${name}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const d = diffRecords(g.trace.record, actual);
    if (d === null) {
      tot.ok++;
      res.ok++;
      res.lines.push(`OK ${name}`);
    } else {
      tot.ko++;
      res.ko++;
      res.lines.push(`KO ${name}: divergence at line ${d.index}`);
      for (const c of d.context) res.lines.push(`    ${c}`);
      res.lines.push(`  expected: ${d.expected}`, `  actual:   ${d.actual}`);
    }
  }
  for (const [tag, t] of Object.entries(res.perTag)) res.lines.push(`${tag}: ${t.ok} OK, ${t.ko} KO`);
  res.lines.push(`TOTAL: ${res.ok} OK, ${res.ko} KO`);
  return res;
};

export function* readGoldenItems(dir: string, tag?: string): Generator<GoldenItem> {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || (tag !== undefined && d.name !== tag)) continue;
    for (const file of readdirSync(join(dir, d.name)).filter((f) => f.endsWith(".json.gz")).sort()) {
      const trace = JSON.parse(gunzipSync(readFileSync(join(dir, d.name, file))).toString("utf8")) as OracleTrace;
      yield { tag: d.name, file, trace };
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const { values } = parseArgs({
    options: {
      tag: { type: "string" },
      limit: { type: "string" },
      dir: { type: "string", default: GOLDEN_DIR },
    },
  });
  const res = runDiff(
    readGoldenItems(values.dir, values.tag),
    simulateBattle,
    values.limit !== undefined ? { limit: Number(values.limit) } : {},
  );
  console.log(res.lines.join("\n"));
  if (res.ko > 0 || res.ok === 0) process.exitCode = 1;
}
