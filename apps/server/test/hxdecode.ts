// Test-only decoder of the battle flashvars: Haxe unserialize + obfuscated keys back to a BattleInput,
// so tests can check that the page hands the SWF exactly the stored input.
import type { BattleInput, BattleTrooperInput, TrooperPref } from "@mt/engine";

const KEYS: Record<string, string> = {
  "V\x1bE|": "pref",
  "\fA2c": "seed",
  "$PS\x01": "gfx",
  ";\x01\fZ": "mode",
  "An%6": "type",
  "}&\x16Y\x01": "force",
  "\x032\x1A4": "name",
  "7X\x01": "id",
  "\x0bR\x10\x1b\x02": "__CWeapon",
  "\x11!\x0ea\x01": "reloadSystem",
  "\x15S\x17?\x03": "targetType",
  "\x1a)\x13=\x01": "__CBody",
  "\x1dlQK\x03": "moveSystem",
  ")0\x19i\x03": "leftOver",
  ";uXE": "targetSystem",
  "\nz\nv": "choices",
  "*M\x01": "bg",
  "a]e\x1B\x02": "armies",
  "`1\x1f*\x02": "troopers",
  "OPz\x16\x03": "faction",
  "K)\x16\n\x02": "__UP2",
};

interface En {
  enum: string;
  idx: number;
  args: unknown[];
}

export function unserialize(s: string): unknown {
  let p = 0;
  const strs: string[] = [];
  const num = (): number => {
    const st = p;
    if (s[p] === "-") p++;
    while (p < s.length && /[0-9]/.test(s[p]!)) p++;
    return parseInt(s.slice(st, p), 10);
  };
  const r = (): unknown => {
    const c = s[p++];
    switch (c) {
      case "n":
        return null;
      case "t":
        return true;
      case "f":
        return false;
      case "z":
        return 0;
      case "i":
        return num();
      case "y": {
        const l = num();
        p++;
        const v = decodeURIComponent(s.substr(p, l));
        p += l;
        strs.push(v);
        return v;
      }
      case "R":
        return strs[num()];
      case "o": {
        const o: Record<string, unknown> = {};
        while (s[p] !== "g") {
          const k = r() as string;
          o[KEYS[k] ?? k] = r();
        }
        p++;
        return o;
      }
      case "a": {
        const a: unknown[] = [];
        while (s[p] !== "h") {
          if (s[p] === "u") {
            p++;
            const n = num();
            for (let i = 0; i < n; i++) a.push(null);
          } else a.push(r());
        }
        p++;
        return a;
      }
      case "j": {
        const e = r() as string;
        p++;
        const idx = num();
        p++;
        const n = num();
        const args: unknown[] = [];
        for (let i = 0; i < n; i++) args.push(r());
        return { enum: e, idx, args } satisfies En;
      }
      default:
        throw new Error(`bad tag ${c} at ${p - 1}`);
    }
  };
  const v = r();
  if (p !== s.length) throw new Error(`trailing data at ${p}`);
  return v;
}

const idx = (e: unknown, name: string): number => {
  const x = e as En;
  if (x?.enum !== name) throw new Error(`expected ${name}, got ${JSON.stringify(e)}`);
  return x.idx;
};

function pref(p: Record<string, unknown> | null): TrooperPref | null {
  if (p === null) return null;
  const tt = p.targetType as En;
  const out: TrooperPref = {
    CWeapon: p.__CWeapon === null ? null : idx(p.__CWeapon, "Weapon"),
    CBody: p.__CBody === null ? null : idx(p.__CBody, "BodyLoc"),
    targetSystem: idx(p.targetSystem, "TargetSystem"),
    targetType: idx(tt, "TargetType"),
    moveSystem: idx(p.moveSystem, "MoveSystem"),
    leftOver: (p.leftOver as unknown[]).map((s) => idx(s, "Skill")),
    reloadSystem: idx(p.reloadSystem, "ReloadSystem"),
  };
  if (out.targetType === 1) out.targetClass = idx(tt.args[0], "Skill");
  return out;
}

const trooper = (t: Record<string, unknown>, nullForce: boolean): BattleTrooperInput => ({
  id: t.id as number,
  name: t.name as string,
  seed: t.seed as number,
  type: idx(t.type, "TrooperType"),
  choices: t.choices as number[],
  force: (t.force === null && nullForce ? [] : (t.force as unknown[])).map((s) => idx(s, "Skill")),
  pref: pref(t.pref as Record<string, unknown> | null),
});

/** Flashvars string of a battle embed → its BattleInput, gfx and the other variables.
 *  `nullForce`: read an archived `force: null` (2011 raid/epic NPCs) as `[]`; off for our own pages. */
export function decodeBattleFlashvars(fv: string, { nullForce = false } = {}): { input: BattleInput; gfx: string; vars: Record<string, string> } {
  const vars: Record<string, string> = {};
  for (const part of fv.split("&")) {
    const i = part.indexOf("=");
    vars[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
  }
  const root = unserialize(vars.data!) as { mode: En; gfx: string };
  if (idx(root.mode, "ClientMode") !== 0) throw new Error("not a battle");
  const [b, attackerSide] = root.mode.args as [Record<string, unknown>, number];
  const bg = b.bg as { id: En; gfx: string };
  const armies = (b.armies as Record<string, unknown>[]).map((a) => ({
    faction: a.faction as number,
    spawnOrder: a.__UP2 as number[],
    troopers: (a.troopers as Record<string, unknown>[]).map((t) => trooper(t, nullForce)),
  }));
  const input: BattleInput = {
    seed: b.id as number,
    background: { gfx: bg.gfx, id: idx(bg.id, "BackgroundType") },
    armies: [armies[0]!, armies[1]!],
    attackerSide,
  };
  return { input, gfx: root.gfx, vars };
}
