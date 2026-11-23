/** Dates of the history lists (RECON4 §1.1: "Hier à 12:25", "Samedi à 14:14", "Le 27 juillet"). */

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

interface Wall {
  y: number;
  m: number;
  d: number;
  hh: string;
  mm: string;
}

function wall(ts: number, tz: string): Wall {
  const p: Record<string, string> = {};
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const x of fmt.formatToParts(new Date(ts))) p[x.type] = x.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: p.hour!.padStart(2, "0"), mm: p.minute!.padStart(2, "0") };
}

// UNVERIFIED: no archived date on the 1st of a month ("1er", the usual French form) nor of another year (no year shown).
const longDate = (m: number, d: number): string => `Le ${d === 1 ? "1er" : d} ${MONTHS[m - 1]}`;

/**
 * Date of a battle at `ts` seen at `now`, by calendar days of `tz`: today "Aujourd'hui à HH:MM" (UNVERIFIED: never
 * archived, $GL's word), yesterday "Hier à HH:MM", 2 to 6 days "<Jour> à HH:MM", older "Le <j> <mois>".
 */
export function historyDate(ts: number, now: number, tz: string): string {
  const a = wall(ts, tz);
  const b = wall(now, tz);
  const days = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
  const time = `${a.hh}:${a.mm}`;
  if (days <= 0) return `Aujourd'hui à ${time}`;
  if (days === 1) return `Hier à ${time}`;
  if (days <= 6) return `${DAYS[new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay()]} à ${time}`;
  return longDate(a.m, a.d);
}

/** "Le <j> <mois>" of a "YYYY-MM-DD" day key (battles stored before `battles.created_at` existed). */
export function dayDate(day: string): string {
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  return longDate(m, d);
}
