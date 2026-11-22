// CLI: what the captured goldens actually cover.
//   npm run oracle:coverage [-- --dir tools/oracle/golden]
// Reports per tag: battles, winner=null, TRP lines vs input troopers, TRP vehicle index
// histogram, jet runs (EV type 21); EV type histogram; forced-skill: per skill, whether the
// forced trooper got a TRP line; pref.leftOver: leftover skills absent from the TRP skills.
// Then the trigger-level mechanics (src/mechanics.ts): every useSuper case, Comms order, status,
// vehicle, Martyr/Vendetta/Frenetic (engine replay), etc., with the tags they fired in; exit
// code != 0 when a reachable mechanic fired fewer than MIN_FIRES times.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { SKILL_COUNT, SKILL_NAMES } from "./data/skills.ts";
import type { OracleTrace } from "./runner.ts";
import { GOLDEN_DIR } from "./capture.ts";
import {
  MIN_FIRES,
  UNREACHED_DOCUMENTED,
  expectedMechanics,
  mechanicProblems,
  replayMechanics,
  traceMechanics,
  type MechanicCounts,
} from "./mechanics.ts";

/** BattleMsg constructor index of the fighter-jet strike (decompiled Battle event case 1, Vehicule
 * index 7: `msg(BattleMsg.$\x7f\x02p\x02(side, x, y, hits))`, ctor 21 of 43). A jet trooper is
 * removed from its pool and never deployed (no TRP); its presence shows only as these events. */
export const JET_EV_TYPE = 21;
/** Vehicule enum: MOTO, JEEP, LIGHT_TANK, HELICOPTER, HEAVY_TANK, ARTILLERY, ?, jet. */
export const VEHICULE_NAMES = ["MOTO", "JEEP", "LIGHT_TANK", "HELICOPTER", "HEAVY_TANK", "ARTILLERY", "#6", "JET"];

export interface Golden {
  tag: string;
  file: string;
  trace: OracleTrace;
}

export const evType = (line: string): number => {
  const m = /^EV [^|]*\|[^|]*\|(\d+)/.exec(line);
  if (!m) throw new Error(`bad EV line ${line}`);
  return Number(m[1]);
};

const trpFields = (line: string): string[] => line.slice(4).split("|");

const inc = <K>(m: Map<K, number>, k: K, by = 1): void => {
  m.set(k, (m.get(k) ?? 0) + by);
};

export interface TagCoverage {
  battles: number;
  winnerNull: number;
  trpLines: number;
  inputTroopers: number;
  /** TRP `vehicle` field ("-" = none) -> count. */
  vehicles: Map<string, number>;
  /** Battles containing at least one jet strike event. */
  jetBattles: number;
}

export interface Coverage {
  tags: Map<string, TagCoverage>;
  evTypes: Map<number, number>;
  /** forced-skill: skill -> [battles, battles where the forced trooper has a TRP line, jet battles]. */
  forced: Map<number, [number, number, number]>;
  /** vehicles: forced vehicle skill -> TRP vehicle field of the forced troopers -> count. */
  vehicleSkills: Map<number, Map<string, number>>;
  /** vehicles: forced vehicle skill -> battles with a jet strike. */
  vehicleSkillJet: Map<number, number>;
  leftOver: { troopers: number; deployed: number; violations: string[] };
}

export const analyze = (goldens: Iterable<Golden>): Coverage => {
  const cov: Coverage = {
    tags: new Map(),
    evTypes: new Map(),
    forced: new Map(),
    vehicleSkills: new Map(),
    vehicleSkillJet: new Map(),
    leftOver: { troopers: 0, deployed: 0, violations: [] },
  };
  for (const { tag, file, trace } of goldens) {
    const { input, record } = trace;
    let tc = cov.tags.get(tag);
    if (!tc) {
      tc = { battles: 0, winnerNull: 0, trpLines: 0, inputTroopers: 0, vehicles: new Map(), jetBattles: 0 };
      cov.tags.set(tag, tc);
    }
    const trp = new Map(record.troopers.map((t) => [t.id, trpFields(t.line)]));
    const types = record.events.map(evType);
    const jet = types.includes(JET_EV_TYPE);
    tc.battles++;
    if (record.winner === null) tc.winnerNull++;
    tc.trpLines += record.troopers.length;
    tc.inputTroopers += input.armies.reduce((n, a) => n + a.troopers.length, 0);
    for (const f of trp.values()) inc(tc.vehicles, f[8] ?? "?");
    if (jet) tc.jetBattles++;
    for (const t of types) inc(cov.evTypes, t);

    const side0 = input.armies[0].troopers;
    if (tag === "forced-skill" && side0.length === 1 && side0[0]!.force.length === 1) {
      const k = side0[0]!.force[0]!;
      const e = cov.forced.get(k) ?? [0, 0, 0];
      e[0]++;
      if (trp.has(side0[0]!.id)) e[1]++;
      if (jet) e[2]++;
      cov.forced.set(k, e);
    }
    if (tag === "vehicles") {
      const v = side0[0]?.force[1];
      if (v !== undefined) {
        const h = cov.vehicleSkills.get(v) ?? new Map<string, number>();
        for (const t of side0) if (t.force[0] === 2 && t.force.length === 2) inc(h, trp.get(t.id)?.[8] ?? "no TRP");
        cov.vehicleSkills.set(v, h);
        if (jet) inc(cov.vehicleSkillJet, v);
      }
    }
    for (const t of input.armies.flatMap((a) => a.troopers)) {
      const leftOver = t.pref?.leftOver ?? [];
      if (leftOver.length === 0) continue;
      cov.leftOver.troopers++;
      const f = trp.get(t.id);
      if (!f) continue;
      cov.leftOver.deployed++;
      const skills = new Set((f[5] ?? "").split(",").filter((s) => s !== "").map(Number));
      const kept = leftOver.filter((k) => skills.has(k));
      if (kept.length > 0) cov.leftOver.violations.push(`${tag}/${file} T${t.id}: ${kept.join(",")}`);
    }
  }
  return cov;
};

const hist = (m: Map<string | number, number>, name?: (k: string | number) => string): string =>
  [...m]
    .sort(([a], [b]) => (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))))
    .map(([k, v]) => `${name ? name(k) : k}=${v}`)
    .join(" ");

const vehName = (k: string | number): string =>
  k === "-" || k === "no TRP" ? String(k) : `${k}:${VEHICULE_NAMES[Number(k)] ?? "?"}`;

export const formatCoverage = (cov: Coverage): string => {
  const out: string[] = [];
  out.push("tag            battles  winner=null  TRP/input  jet-battles  TRP vehicle histogram");
  for (const [tag, t] of [...cov.tags].sort(([a], [b]) => a.localeCompare(b))) {
    out.push(
      `${tag.padEnd(14)} ${String(t.battles).padStart(7)}  ${String(t.winnerNull).padStart(11)}  ` +
        `${`${t.trpLines}/${t.inputTroopers}`.padStart(9)}  ${String(t.jetBattles).padStart(11)}  ` +
        hist(t.vehicles, vehName),
    );
  }
  out.push(`EV types (index=count): ${hist(cov.evTypes)}`);
  const seen = [...cov.evTypes.keys()];
  const missing = Array.from({ length: 43 }, (_, i) => i).filter((i) => !seen.includes(i));
  out.push(`EV types never seen (of 43): ${missing.join(",") || "none"}`);
  if (cov.forced.size > 0) {
    const never: string[] = [];
    let deployedAll = 0;
    for (let k = 0; k < SKILL_COUNT; k++) {
      const e = cov.forced.get(k);
      if (!e) never.push(`${k}:${SKILL_NAMES[k]} (no battle)`);
      else if (e[1] === 0) never.push(`${k}:${SKILL_NAMES[k]} (0/${e[0]} deployed, jet strikes in ${e[2]})`);
      else if (e[1] === e[0]) deployedAll++;
    }
    const partial = [...cov.forced].filter(([, e]) => e[1] > 0 && e[1] < e[0]);
    out.push(
      `forced-skill: ${cov.forced.size}/${SKILL_COUNT} skills; forced trooper deployed in every battle ` +
        `for ${deployedAll}; partially: ${partial.map(([k, e]) => `${k}:${SKILL_NAMES[k]} ${e[1]}/${e[0]}`).join(", ") || "none"}`,
    );
    out.push(`forced-skill: forced trooper never deployed: ${never.join("; ") || "none"}`);
  }
  for (const [v, h] of [...cov.vehicleSkills].sort(([a], [b]) => a - b)) {
    out.push(
      `vehicles: forced ${v}:${SKILL_NAMES[v]} -> ${hist(h, vehName)}; ` +
        `battles with jet strikes: ${cov.vehicleSkillJet.get(v) ?? 0}`,
    );
  }
  const lo = cov.leftOver;
  out.push(
    `leftOver: ${lo.troopers} troopers with a non-empty pref.leftOver, ${lo.deployed} deployed, ` +
      `${lo.violations.length} with a leftover skill still in TRP${lo.violations.length ? `: ${lo.violations.join("; ")}` : ""}`,
  );
  return out.join("\n");
};

/** Vehicle skill -> Vehicule index it spawns (Data: 38 LIGHT_TANK, 39 MOTO, 41 HELICOPTER,
 * 42 HEAVY_TANK; 40 = jet, never deployed, checked through EV 21 instead). */
export const DEPLOYED_VEHICLE: Record<number, number> = { 38: 2, 39: 0, 41: 3, 42: 4 };

/** Coverage gaps that must fail the CLI (empty = OK). */
export const coverageProblems = (cov: Coverage): string[] => {
  const problems: string[] = [];
  const all = new Map<string, number>();
  for (const t of cov.tags.values()) for (const [k, v] of t.vehicles) inc(all, k, v);
  for (const [skill, idx] of Object.entries(DEPLOYED_VEHICLE)) {
    if (!all.get(String(idx))) {
      problems.push(`no deployed ${VEHICULE_NAMES[idx]} (vehicle ${idx}, skill ${skill}) in any TRP line`);
    }
  }
  if (!cov.evTypes.get(JET_EV_TYPE)) problems.push(`no fighter-jet strike (EV type ${JET_EV_TYPE}) in any golden`);
  if (cov.leftOver.violations.length > 0) problems.push(`${cov.leftOver.violations.length} leftOver violations`);
  return problems;
};

export function* readGoldens(dir: string): Generator<Golden> {
  for (const tag of readdirSync(dir, { withFileTypes: true })) {
    if (!tag.isDirectory()) continue;
    for (const file of readdirSync(join(dir, tag.name)).filter((f) => f.endsWith(".json.gz")).sort()) {
      const trace = JSON.parse(gunzipSync(readFileSync(join(dir, tag.name, file))).toString("utf8"));
      yield { tag: tag.name, file, trace };
    }
  }
}

export interface MechanicCoverage {
  counts: MechanicCounts;
  /** mechanic -> tag -> count */
  byTag: Map<string, Map<string, number>>;
  /** goldens whose engine replay differs from the trace (replay counts then unreliable). */
  replayMismatches: string[];
}

/** Runs traceMechanics + replayMechanics over every golden passing through `goldens`. */
export function* tapMechanics(goldens: Iterable<Golden>, mc: MechanicCoverage): Generator<Golden> {
  for (const g of goldens) {
    const one: MechanicCounts = new Map();
    traceMechanics(g.trace.record, one);
    const { same } = replayMechanics(g.trace.input, g.trace.record, one);
    if (!same) mc.replayMismatches.push(`${g.tag}/${g.file}`);
    for (const [k, v] of one) {
      mc.counts.set(k, (mc.counts.get(k) ?? 0) + v);
      const t = mc.byTag.get(k) ?? new Map<string, number>();
      t.set(g.tag, (t.get(g.tag) ?? 0) + v);
      mc.byTag.set(k, t);
    }
    yield g;
  }
}

export const formatMechanics = (mc: MechanicCoverage): string => {
  const out = [`mechanics (fired count; gate >= ${MIN_FIRES}; tags):`];
  for (const m of expectedMechanics()) {
    const n = mc.counts.get(m) ?? 0;
    const tags = [...(mc.byTag.get(m) ?? [])].sort(([a], [b]) => a.localeCompare(b)).map(([t, c]) => `${t}=${c}`);
    const flag = UNREACHED_DOCUMENTED.has(m) ? "--" : n < MIN_FIRES ? "!!" : "  ";
    out.push(`  ${flag} ${String(n).padStart(7)}  ${m}  [${tags.join(" ")}]`);
  }
  for (const [m, why] of UNREACHED_DOCUMENTED) out.push(`UNREACHED (documented, not gated): ${m}: ${why}`);
  out.push(`replay mismatches: ${mc.replayMismatches.length ? mc.replayMismatches.join(", ") : "none"}`);
  return out.join("\n");
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const { values } = parseArgs({ options: { dir: { type: "string", default: GOLDEN_DIR } } });
  const mc: MechanicCoverage = { counts: new Map(), byTag: new Map(), replayMismatches: [] };
  const cov = analyze(tapMechanics(readGoldens(values.dir), mc));
  console.log(formatCoverage(cov));
  console.log(formatMechanics(mc));
  const problems = [
    ...coverageProblems(cov),
    ...mechanicProblems(mc.counts),
    ...mc.replayMismatches.map((f) => `engine replay differs from golden ${f}`),
  ];
  for (const p of problems) console.log(`COVERAGE GAP: ${p}`);
  if (problems.length > 0) process.exitCode = 1;
}
