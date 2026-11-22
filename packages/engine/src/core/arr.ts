// swf: mt.bumdum9.Arr (§G0\x15\x01§) — client_fr.swf, package §`\x0b\x01§.§NOJE\x03§.
// shuffle §D\x05X=\x02§. The SWF falls back to Std.random (Math.random) when no Rand is
// given; the engine must stay deterministic, so `rand` is mandatory here.
import type { Rand } from "./rand.ts";

export const Arr = {
  shuffle<T>(arr: T[], rand: Rand): void {
    const tmp: T[] = [];
    while (arr.length > 0) {
      tmp.push(arr.pop() as T);
    }
    while (tmp.length > 0) {
      // Haxe Array.insert(pos, x) = splice(pos, 0, x)
      arr.splice(rand.random(arr.length + 1), 0, tmp.pop() as T);
    }
  },
} as const;
