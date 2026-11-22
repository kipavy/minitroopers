// AS3 `Array.sort(compareFunction)` as Ruffle implements it (Ruffle a111ceec,
// core/src/avm2/globals/array.rs `qsort`: "a port of the avmplus QuickSort implementation").
// Not stable; with an inconsistent comparator (e.g. one that never returns 0) the result is
// whatever this exact algorithm produces, so it is reproduced step by step. Only the sign of the
// comparator result matters (> 0 Greater, < 0 Less, else Equal).

const qsort = <T>(a: T[], lo: number, len: number, cmp: (x: T, y: T) => number): void => {
  if (len <= 1) return;
  const sw = (i: number, j: number): void => {
    const t = a[lo + i] as T;
    a[lo + i] = a[lo + j] as T;
    a[lo + j] = t;
  };
  const gt = (i: number, j: number): boolean => cmp(a[lo + i] as T, a[lo + j] as T) > 0;
  const lt = (i: number, j: number): boolean => cmp(a[lo + i] as T, a[lo + j] as T) < 0;
  if (len === 2) {
    if (gt(0, 1)) sw(0, 1);
    return;
  }
  if (len === 3) {
    if (gt(0, 1)) sw(0, 1);
    if (gt(1, 2)) {
      sw(1, 2);
      if (gt(0, 1)) sw(0, 1);
    }
    return;
  }
  sw(0, Math.floor(len / 2));
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
  sw(0, right);
  // fst = [0, right), snd = [left, len); the smaller one first (order is irrelevant: disjoint).
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
