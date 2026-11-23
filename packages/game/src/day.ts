// Daily reset at 00:00 in a given IANA time zone (original: ~00:00 GMT+1, recon §2.14 -> Europe/Paris).

function parts(ms: number, tz: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o["year"]!, m: o["month"]!, d: o["day"]!, h: o["hour"]!, mi: o["minute"]!, s: o["second"]! };
}

/** Offset (ms) of `tz` from UTC at instant `ms`. */
function offsetAt(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Local calendar day "YYYY-MM-DD" of `now` in `tz`. */
export function dayKey(now: Date, tz: string): string {
  const p = parts(now.getTime(), tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** The calendar day before a "YYYY-MM-DD" day key (pure date arithmetic, no time zone involved). */
export function prevDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** Next local midnight (strictly after `now`) in `tz`. */
export function nextResetAt(now: Date, tz: string): Date {
  const p = parts(now.getTime(), tz);
  const wall = Date.UTC(p.y, p.m - 1, p.d + 1); // next local midnight as if UTC
  let guess = wall - offsetAt(wall, tz);
  guess = wall - offsetAt(guess, tz); // refine across a DST change
  return new Date(guess);
}
