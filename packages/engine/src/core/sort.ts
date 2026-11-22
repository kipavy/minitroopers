// AS3 `Array.sort(compareFunction)` as Ruffle implements it. Transliterated from Ruffle commit
// a111ceec3873b019c79e8554963bfdc8307adcc0, core/src/avm2/globals/array.rs:
// - `sort` (l.1029-1110): the comparator result is coerced to Number; > 0 Greater, < 0 Less,
//   else Equal (NaN included). No int truncation of the result, whatever the SWF version
//   (client_fr.swf is SWF 10; Flash Player truncates there, Ruffle does not: Ruffle fait foi;
//   every comparator of the logic returns -1/0/1 anyway).
// - `sort_inner` (l.752-789): undefined elements sort last; never present in our arrays.
// - `qsort` (l.801-883): "a port of the avmplus QuickSort implementation". Reproduced below
//   line by line. Not stable; with an inconsistent comparator (e.g. one that never returns 0)
//   the result is whatever this exact algorithm produces.

const qsort = <T>(a: T[], lo: number, len: number, cmp: (x: T, y: T) => number): void => {
  const sw = (i: number, j: number): void => {
    const t = a[lo + i] as T;
    a[lo + i] = a[lo + j] as T;
    a[lo + j] = t;
  };
  const gt = (i: number, j: number): boolean => cmp(a[lo + i] as T, a[lo + j] as T) > 0;
  const lt = (i: number, j: number): boolean => cmp(a[lo + i] as T, a[lo + j] as T) < 0;
  // l.805-807: empty and one-element slices.
  if (len <= 1) return;
  // l.808-814: fast path for two elements.
  if (len === 2) {
    if (gt(0, 1)) sw(0, 1);
    return;
  }
  // l.815-827: fast path for three elements.
  if (len === 3) {
    if (gt(0, 1)) sw(0, 1);
    if (gt(1, 2)) {
      sw(1, 2);
      if (gt(0, 1)) sw(0, 1);
    }
    return;
  }
  // l.831-832: middle element as pivot, moved to the front (`len / 2` on usize = floor).
  sw(0, Math.floor(len / 2));
  // l.838-865: partition.
  let left = 0;
  let right = len;
  for (;;) {
    for (;;) {
      left += 1;
      if (left >= len || gt(left, 0)) break;
    }
    for (;;) {
      right -= 1;
      if (right === 0 || lt(right, 0)) break;
    }
    if (right < left) break;
    sw(left, right);
  }
  // l.867-868: pivot to its final position.
  sw(0, right);
  // l.875-882: fst = [0, right), snd = [left, len); the smaller one first (swap when
  // fst.len() >= snd.len()).
  let f0 = 0;
  let fl = right;
  let s0 = left;
  let sl = len - left;
  if (fl >= sl) {
    [f0, fl, s0, sl] = [s0, sl, f0, fl];
  }
  qsort(a, lo + f0, fl, cmp);
  qsort(a, lo + s0, sl, cmp);
};

/** In-place AS3/Ruffle `Array.sort(cmp)`. */
export const as3Sort = <T>(a: T[], cmp: (x: T, y: T) => number): T[] => {
  qsort(a, 0, a.length, cmp);
  return a;
};
