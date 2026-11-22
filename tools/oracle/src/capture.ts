// CLI: corpus -> golden traces via the oracle.
//   npm run oracle:capture -- --tag <tag|all> [--count n] [--seed s] [--jobs 4] [--out dir]
// Writes <out>/<tag>/<NNNNN>.json.gz (gzip JSON OracleTrace; NNNNN = corpus index). Resumable:
// existing files are skipped (corpora are prefix-stable; <out>/<tag>/meta.json pins the seed and
// the tag's CORPUS_VERSIONS entry). Each file is written to <file>.tmp then renamed (no truncated golden on a crash).
// Battles that fail or time out (no MTDONE) are appended to <out>/<tag>/capture-failures.jsonl
// and reported; never silently dropped.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { CORPUS_TAGS, CORPUS_VERSIONS, corpusFullSize, generateCorpus, type CorpusTag } from "./corpus.ts";
import { DEFAULT_TIMEOUT_MS, OracleRunner, OracleTimeoutError, REPO_ROOT } from "./runner.ts";

export const GOLDEN_DIR = join(REPO_ROOT, "tools/oracle/golden");

export const goldenFile = (dir: string, tag: CorpusTag, index: number): string =>
  join(dir, tag, `${String(index).padStart(5, "0")}.json.gz`);

export interface CaptureStats {
  tag: CorpusTag;
  total: number;
  skipped: number;
  ok: number;
  failed: number;
  /** Mean wall time of one successful battle (page load -> MTDONE), seconds. */
  meanSeconds: number;
  /** Elapsed time of the whole tag, seconds. */
  elapsedSeconds: number;
}

export const captureTag = async (opts: {
  tag: CorpusTag;
  count: number;
  seed: number;
  jobs: number;
  out: string;
  timeoutMs: number;
  runner: OracleRunner;
  log?: (s: string) => void;
}): Promise<CaptureStats> => {
  const { tag, seed, out, runner } = opts;
  const log = opts.log ?? (() => {});
  const dir = join(out, tag);
  mkdirSync(dir, { recursive: true });
  const metaFile = join(dir, "meta.json");
  if (existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, "utf8")) as {
      seed: number;
      corpusVersion?: number;
    };
    if (meta.seed !== seed) {
      throw new Error(`${dir} was captured with --seed ${meta.seed}, not ${seed}`);
    }
    if (meta.corpusVersion !== CORPUS_VERSIONS[tag]) {
      throw new Error(
        `${dir} was captured with corpus version ${meta.corpusVersion ?? 1}, not ` +
          `${CORPUS_VERSIONS[tag]}: delete it (or use another --out) to recapture`,
      );
    }
  } else {
    writeFileSync(metaFile, JSON.stringify({ tag, seed, corpusVersion: CORPUS_VERSIONS[tag] }) + "\n");
  }
  const failLog = join(dir, "capture-failures.jsonl");
  const inputs = generateCorpus({ seed, count: opts.count, tag });
  const todo = inputs.map((input, index) => ({ input, index })).filter(
    ({ index }) => !existsSync(goldenFile(out, tag, index)),
  );
  const stats: CaptureStats = {
    tag,
    total: inputs.length,
    skipped: inputs.length - todo.length,
    ok: 0,
    failed: 0,
    meanSeconds: 0,
    elapsedSeconds: 0,
  };
  let busyMs = 0;
  const t0 = Date.now();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const { input, index } = todo[next++]!;
      // One retry: a page that fails to start (e.g. wasm load) is not the battle's fault.
      for (let attempt = 1; attempt <= 2; attempt++) {
        const start = Date.now();
        try {
          const trace = await runner.run(input, { timeoutMs: opts.timeoutMs });
          busyMs += Date.now() - start;
          const file = goldenFile(out, tag, index);
          writeFileSync(file + ".tmp", gzipSync(JSON.stringify(trace), { level: 9 }));
          renameSync(file + ".tmp", file);
          stats.ok++;
          break;
        } catch (e) {
          const err = e as Error;
          appendFileSync(
            failLog,
            JSON.stringify({
              at: new Date().toISOString(),
              tag,
              seed,
              index,
              attempt,
              kind: e instanceof OracleTimeoutError ? "timeout" : "error",
              ms: Date.now() - start,
              message: err.message,
              lines: e instanceof OracleTimeoutError ? e.lines.length : undefined,
            }) + "\n",
          );
          log(`  ${tag} #${index} attempt ${attempt}: ${err.message}`);
          if (attempt === 2) stats.failed++;
        }
      }
      const done = stats.ok + stats.failed;
      if (done % 25 === 0 || done === todo.length) {
        log(`  ${tag}: ${done}/${todo.length} (${stats.failed} failed)`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.jobs) }, worker));
  stats.elapsedSeconds = (Date.now() - t0) / 1000;
  stats.meanSeconds = stats.ok > 0 ? busyMs / stats.ok / 1000 : 0;
  return stats;
};

/** First-batch sizes (task 4): `null` = the whole fixed list. */
export const FIRST_BATCH: Record<CorpusTag, number | null> = {
  basic: 200,
  levels: 200,
  "forced-skill": null,
  vehicles: 100,
  specialists: 100,
  large: 100,
  rats: 100,
  edge: null,
  comms: 150,
  "martyr-saviour": 60,
  jet: 60,
  sabotage: 40,
  helicopter: 60,
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      tag: { type: "string" },
      count: { type: "string" },
      seed: { type: "string", default: "1" },
      jobs: { type: "string", default: "4" },
      out: { type: "string", default: GOLDEN_DIR },
      timeout: { type: "string", default: String(DEFAULT_TIMEOUT_MS) },
    },
  });
  const tags: CorpusTag[] =
    values.tag === "all"
      ? [...CORPUS_TAGS]
      : CORPUS_TAGS.includes(values.tag as CorpusTag)
        ? [values.tag as CorpusTag]
        : [];
  if (tags.length === 0) {
    console.error(`usage: --tag <${CORPUS_TAGS.join("|")}|all> [--count n] [--seed s] [--jobs n] [--out dir]`);
    process.exit(2);
  }
  const runner = new OracleRunner();
  const all: CaptureStats[] = [];
  try {
    for (const tag of tags) {
      const count =
        values.count !== undefined
          ? Number(values.count)
          : values.tag === "all"
            ? (FIRST_BATCH[tag] ?? Infinity)
            : (corpusFullSize(tag) ?? NaN);
      if (!Number.isFinite(count) && corpusFullSize(tag) === null) {
        throw new Error(`--count is required for tag ${tag}`);
      }
      console.log(`${tag}: capturing (seed ${values.seed}, ${values.jobs} jobs)`);
      const s = await captureTag({
        tag,
        count: Number.isFinite(count) ? count : corpusFullSize(tag)!,
        seed: Number(values.seed),
        jobs: Number(values.jobs),
        out: values.out,
        timeoutMs: Number(values.timeout),
        runner,
        log: (l) => console.log(l),
      });
      all.push(s);
      console.log(
        `${tag}: ${s.ok} captured, ${s.skipped} skipped, ${s.failed} failed; ` +
          `mean ${s.meanSeconds.toFixed(2)} s/battle, ${s.elapsedSeconds.toFixed(0)} s elapsed`,
      );
    }
  } finally {
    await runner.close();
  }
  console.log(JSON.stringify(all));
  if (all.some((s) => s.failed > 0)) process.exitCode = 1;
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  await main();
}
