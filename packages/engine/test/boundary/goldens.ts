// Reads the committed oracle goldens (tools/oracle/golden/<tag>/*.json.gz) as data.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { BattleInput } from "../../src/index.ts";
import type { BattleRecord } from "../../src/internal.ts";

export const GOLDEN_DIR = fileURLToPath(new URL("../../../../tools/oracle/golden/", import.meta.url));

export interface GoldenTrace {
  formatVersion: number;
  swfSha256: string;
  input: BattleInput;
  record: BattleRecord;
}

export const goldenTags = (): string[] =>
  readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

export const readGoldens = (tag: string): { file: string; trace: GoldenTrace }[] =>
  readdirSync(GOLDEN_DIR + tag)
    .filter((f) => f.endsWith(".json.gz"))
    .sort()
    .map((file) => ({
      file,
      trace: JSON.parse(gunzipSync(readFileSync(GOLDEN_DIR + tag + "/" + file)).toString("utf8")) as GoldenTrace,
    }));
