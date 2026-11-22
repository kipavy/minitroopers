// Derived from minitroopers (Eternaltwin), MIT, (c) 2026 YesLifeTechnology

/** A Haxe enum value, serialized by index (`j<name>:<index>:<nargs>...`). */
export class HaxeEnum {
  readonly name: string;
  readonly index: number;
  readonly args: readonly unknown[];

  constructor(name: string, index: number, args: readonly unknown[] = []) {
    this.name = name;
    this.index = index;
    this.args = args;
  }
}

class Serializer {
  private readonly stringCache: string[] = [];
  private readonly urlEncode: (s: string) => string;

  constructor(urlEncode: (s: string) => string) {
    this.urlEncode = urlEncode;
  }

  run(v: unknown): string {
    if (v === null) return "n";
    switch (typeof v) {
      case "boolean":
        return v ? "t" : "f";
      case "number":
        return this.serializeNumber(v);
      case "string":
        return this.serializeString(v);
      case "object":
        if (v instanceof HaxeEnum) return this.serializeEnum(v);
        if (Array.isArray(v)) return this.serializeArray(v);
        return this.serializeObject(v as Record<string, unknown>);
      default:
        throw new Error(`Unsupported type ${typeof v}`);
    }
  }

  private serializeString(s: string): string {
    const i = this.stringCache.indexOf(s);
    if (i > -1) return `R${i}`;
    this.stringCache.push(s);
    const enc = this.urlEncode(s);
    return `y${enc.length}:${enc}`;
  }

  private serializeNumber(n: number): string {
    if (Number.isNaN(n)) return "k";
    if (!Number.isFinite(n)) return n > 0 ? "p" : "m";
    if (!Number.isSafeInteger(n)) {
      return Number.isInteger(n) ? `d${n.toExponential()}` : `d${n}`;
    }
    return n === 0 ? "z" : `i${n}`;
  }

  private serializeArray(a: readonly unknown[]): string {
    let buffer = "";
    let nulls = 0;
    for (const v of a) {
      if (v === null) {
        nulls++;
        continue;
      }
      if (nulls > 0) {
        buffer += nulls > 1 ? `u${nulls}` : "n";
        nulls = 0;
      }
      buffer += this.run(v);
    }
    if (nulls > 0) buffer += nulls > 1 ? `u${nulls}` : "n";
    return `a${buffer}h`;
  }

  private serializeObject(o: Record<string, unknown>): string {
    let buffer = "";
    for (const [k, v] of Object.entries(o)) {
      buffer += this.run(k) + this.run(v);
    }
    return `o${buffer}g`;
  }

  private serializeEnum(e: HaxeEnum): string {
    let buffer = `j${this.run(e.name)}:${e.index}:${e.args.length}`;
    for (const a of e.args) buffer += this.run(a);
    return buffer;
  }
}

/**
 * Haxe `Serializer.run` (index-based enums, string cache, no object cache). Strings are escaped with
 * `urlEncode`: `encodeURIComponent` by default ($GL parity), `originalUrlEncode` to match the
 * original server's pages.
 */
export const serializeHaxe = (value: unknown, urlEncode: (s: string) => string = encodeURIComponent): string =>
  new Serializer(urlEncode).run(value);

/**
 * The string escaping of the original server (Haxe `StringTools.urlEncode`), as seen in every
 * `data=` / `endMsg=` of the archived pages: `encodeURIComponent` that also escapes `! * ( )`
 * (observed as `%21`, `%2A`, `%29` in the obfuscated keys and in endMsg).
 * UNVERIFIED: `'` and `~` never occur in the archives; they are escaped too. `_` is kept.
 */
export const originalUrlEncode = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
