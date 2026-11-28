import { isAbsolute, resolve } from "node:path";
import { LEVEL_COST_EXPONENT } from "@mt/game";

export type UrlMode = "path" | "subdomain";

export interface Config {
  port: number;
  /** Listening address (LISTEN_HOST), 127.0.0.1 by default. */
  listenHost: string;
  /** Non-fatal configuration notes, printed at startup (e.g. an ignored HOST). */
  warnings: string[];
  urlMode: UrlMode;
  /** Public origin without trailing slash, e.g. "http://localhost:8080". The port of army URLs comes from here. */
  publicUrl: string;
  /** Lowercase, never with a port. */
  baseDomain: string;
  dataDir: string;
  trustProxy: boolean;
  tzGame: string;
  /** Credits multiplier of rewards won on Saturdays and Sundays of the game day (WEEKEND_MULTIPLIER, 1-10, 1 = off). */
  weekendMultiplier: number;
  /** Exponent of the level-up price `int((n+1)^e)` (LEVEL_COST_EXPONENT, 1 to 3, default 2; 2.5 = the original). */
  levelCostExponent: number;
  /** Cookies get the Secure flag when the public URL is https. */
  secureCookies: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = env.PORT ? Number(env.PORT) : 8080;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid PORT: ${env.PORT}`);
  const mode = env.URL_MODE ?? "path";
  if (mode !== "path" && mode !== "subdomain") throw new Error(`invalid URL_MODE: ${mode} (path|subdomain)`);
  const baseDomain = (env.BASE_DOMAIN ?? "localhost").toLowerCase();
  // One rule for every helper (cookie Domain, armyUrl, resolveArmyHost): no port here, the port comes from PUBLIC_URL.
  if (baseDomain.includes(":")) throw new Error(`invalid BASE_DOMAIN: ${baseDomain} (no port: the port of army URLs comes from PUBLIC_URL)`);
  if (!/^[a-z0-9.-]+$/.test(baseDomain)) throw new Error(`invalid BASE_DOMAIN: ${baseDomain}`);
  // Subdomain mode shares the session cookie with every army via Domain=<BASE_DOMAIN>. Verified in Chromium (test/e2e.test.ts, "[e2e cookies]"):
  // a Domain=localhost cookie is stored but never sent to <army>.localhost, so a single-label domain cannot work.
  // Locally, use a name under localhost such as mt.localhost (browsers resolve *.localhost without DNS).
  if (mode === "subdomain" && !baseDomain.includes(".")) {
    throw new Error(`invalid BASE_DOMAIN for URL_MODE=subdomain: ${baseDomain} (needs two labels or more, e.g. mt.localhost)`);
  }
  const host = mode === "subdomain" ? baseDomain : "localhost";
  const publicUrl = (env.PUBLIC_URL ?? `http://${host}:${port}`).replace(/\/+$/, "");
  let pub: URL;
  try {
    pub = new URL(publicUrl);
  } catch {
    throw new Error(`invalid PUBLIC_URL: ${env.PUBLIC_URL} (an http:// or https:// origin, e.g. https://minitroopers.example)`);
  }
  if ((pub.protocol !== "http:" && pub.protocol !== "https:") || !pub.hostname) {
    throw new Error(`invalid PUBLIC_URL: ${env.PUBLIC_URL} (an http:// or https:// origin, e.g. https://minitroopers.example)`);
  }
  const trust = env.TRUST_PROXY ?? "0";
  if (!["0", "1", "true", "false"].includes(trust)) throw new Error(`invalid TRUST_PROXY: ${JSON.stringify(trust)} (0|1|true|false)`);
  const tzGame = env.TZ_GAME ?? "Europe/Paris";
  try {
    if (!tzGame) throw new RangeError("empty");
    new Intl.DateTimeFormat("en", { timeZone: tzGame });
  } catch {
    throw new Error(`invalid TZ_GAME: ${JSON.stringify(tzGame)} (an IANA time zone, e.g. Europe/Paris)`);
  }
  const wm = env.WEEKEND_MULTIPLIER ?? "3";
  if (!/^[0-9]+$/.test(wm) || Number(wm) < 1 || Number(wm) > 10) {
    throw new Error(`invalid WEEKEND_MULTIPLIER: ${JSON.stringify(wm)} (an integer from 1 to 10; 1 disables the weekend event)`);
  }
  const lce = env.LEVEL_COST_EXPONENT ?? String(LEVEL_COST_EXPONENT);
  if (!/^[0-9](\.[0-9]{1,2})?$/.test(lce) || Number(lce) < 1 || Number(lce) > 3) {
    throw new Error(`invalid LEVEL_COST_EXPONENT: ${JSON.stringify(lce)} (a number from 1 to 3, at most 2 decimals; 2.5 = the original)`);
  }
  // HOST is deliberately not read: tcsh and others export it as the machine name, which is not an address to bind.
  const warnings: string[] = [];
  if (env.HOST) warnings.push(`HOST=${env.HOST} is ignored (often the machine name); set LISTEN_HOST to choose the listening address`);
  return {
    port,
    listenHost: env.LISTEN_HOST || "127.0.0.1",
    warnings,
    urlMode: mode,
    publicUrl,
    baseDomain,
    dataDir: env.DATA_DIR ?? "var",
    trustProxy: trust === "1" || trust === "true",
    tzGame,
    weekendMultiplier: Number(wm),
    levelCostExponent: Number(lce),
    secureCookies: pub.protocol === "https:",
  };
}

/** Data directory: a relative DATA_DIR is relative to the repository root (var/ is gitignored). */
export function resolveDataDir(dataDir: string): string {
  return isAbsolute(dataDir) ? dataDir : resolve(import.meta.dirname, "../../..", dataDir);
}
