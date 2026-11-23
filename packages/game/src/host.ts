// Army name -> subdomain. Port of Common.host (original app.js, recon §2.3) and mt.db.Phoneme.removeAccentsUTF8.

function removeAccentsUTF8(s: string): string {
  let b = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 233: case 232: case 234: case 235: b += "e"; break;
      case 201: case 200: case 202: case 203: b += "E"; break;
      case 224: case 226: case 228: case 225: b += "a"; break;
      case 192: case 194: case 196: case 193: b += "A"; break;
      case 249: case 251: case 252: case 250: b += "u"; break;
      case 217: case 219: case 220: case 218: b += "U"; break;
      case 238: case 239: case 237: b += "i"; break;
      case 206: case 207: case 205: b += "I"; break;
      case 244: case 243: case 246: case 245: b += "o"; break;
      case 212: case 211: case 214: b += "O"; break;
      case 230: case 198: b += "ae"; break;
      case 339: case 338: b += "oe"; break;
      case 231: b += "c"; break;
      case 199: b += "C"; break;
      case 241: b += "n"; break;
      case 209: b += "N"; break;
      default: b += s[i];
    }
  }
  return b;
}

/** Haxe StringTools.isSpace: 9..13 or 32 (narrower than JS String.trim). */
const isSpace = (c: number): boolean => (c > 8 && c < 14) || c === 32;

function haxeTrim(s: string): string {
  let a = 0;
  let z = s.length;
  while (z > a && isSpace(s.charCodeAt(z - 1))) z--;
  while (a < z && isSpace(s.charCodeAt(a))) a++;
  return s.slice(a, z);
}

/**
 * Exact port of Common.host (original app.js:8 keeps "." in the class [^a-z0-9.-]).
 */
export function host(name: string): string {
  let h = removeAccentsUTF8(name).toLowerCase();
  h = haxeTrim(h);
  h = h.replace(/\s+/g, "-");
  h = h.replace(/[^a-z0-9.-]+/g, "");
  if (h.length > 16) {
    const first = h.split("-")[0]!;
    if (first.length >= 8) h = first;
    else {
      h = h.slice(0, 16);
      if (h.endsWith("-")) h = h.slice(0, -1);
    }
  }
  return h;
}

/** UNVERIFIED: original reserved list unknown; this is the test-server list (testsrv app.js hostValid) plus "a". */
export const RESERVED_HOSTS: readonly string[] = [
  "www", "local", "data", "admin", "administrator", "root", "host", "server", "ftp", "mail", "smtp", "imap", "pop",
  "api", "test", "sandbox", "secure", "login", "logout", "signin", "signup", "user", "motiontwin", "eternaltwin",
  "users", "support", "help", "status", "minitroopers", "static", "panel", "localhost", "opentroopers", "a",
];

/** Name 1..20 chars, article `part` 0..5, derived host >= 3 chars and not reserved. Uniqueness is the server's job. */
export function validateArmyName(name: string, part: number): { ok: true; host: string } | { ok: false; error: string } {
  const n = haxeTrim(name);
  if (n.length < 1 || n.length > 20) return { ok: false, error: "Le nom doit faire entre 1 et 20 caractères." };
  if (!Number.isInteger(part) || part < 0 || part > 5) return { ok: false, error: "Article invalide." };
  const h = host(n);
  // UNVERIFIED: original server-side rule unknown; a dot would make a multi-label subdomain.
  if (h.includes(".")) return { ok: false, error: "Le nom ne peut pas contenir de point." };
  if (h.length < 3) return { ok: false, error: "Nom trop court (3 caractères minimum une fois simplifié)." };
  // UNVERIFIED: original server-side rule unknown. A DNS label cannot start or end with "-" (this also refuses "---"),
  // and "xn--" starts a punycode label that browsers refuse (new URL("http://xn--a.mt.localhost") throws).
  if (h.startsWith("-") || h.endsWith("-") || h.startsWith("xn--")) return { ok: false, error: "Ce nom ne peut pas servir d'adresse." };
  if (RESERVED_HOSTS.includes(h)) return { ok: false, error: "Ce nom est réservé." };
  return { ok: true, host: h };
}
