import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captureTag } from "../src/capture.ts";
import { CORPUS_VERSIONS } from "../src/corpus.ts";
import { OracleRunner, REPO_ROOT } from "../src/runner.ts";

const tmp = () => {
  mkdirSync(join(REPO_ROOT, "tools/bin/tmp"), { recursive: true });
  return mkdtempSync(join(REPO_ROOT, "tools/bin/tmp/capture-test-"));
};
const opts = (out: string, seed = 1) => ({
  tag: "basic" as const,
  count: 0,
  seed,
  jobs: 1,
  out,
  timeoutMs: 1000,
  runner: new OracleRunner(),
});

test("capture writes meta.json with seed and corpus version", async () => {
  const out = tmp();
  try {
    await captureTag(opts(out));
    assert.deepEqual(JSON.parse(readFileSync(join(out, "basic/meta.json"), "utf8")), {
      tag: "basic",
      seed: 1,
      corpusVersion: CORPUS_VERSIONS.basic,
    });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("capture refuses to resume a tag captured with another seed or corpus version", async () => {
  const out = tmp();
  try {
    mkdirSync(join(out, "basic"));
    writeFileSync(join(out, "basic/meta.json"), JSON.stringify({ tag: "basic", seed: 1, corpusVersion: 1 }));
    await assert.rejects(captureTag(opts(out)), /corpus version 1, not/);
    await assert.rejects(captureTag(opts(out, 2)), /--seed 1, not 2/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
