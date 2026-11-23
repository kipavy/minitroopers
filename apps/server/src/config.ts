import { isAbsolute, resolve } from "node:path";

export type UrlMode = "path" | "subdomain";

export interface Config {
  port: number;
  /** Listening address (HOST), 127.0.0.1 by default. */
  host: string;
  urlMode: UrlMode;
  /** Public origin without trailing slash, e.g. "http://localhost:8080". The port of army URLs comes from here. */
  publicUrl: string;
  /** Lowercase, never with a port. */
  baseDomain: string;
  dataDir: string;
  trustProxy: boolean;
  tzGame: string;
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
  return {
    port,
    host: env.HOST || "127.0.0.1",
    urlMode: mode,
    publicUrl,
    baseDomain,
    dataDir: env.DATA_DIR ?? "var",
    trustProxy: trust === "1" || trust === "true",
    tzGame,
    secureCookies: pub.protocol === "https:",
  };
}

/** Data directory: a relative DATA_DIR is relative to the repository root (var/ is gitignored). */
export function resolveDataDir(dataDir: string): string {
  return isAbsolute(dataDir) ? dataDir : resolve(import.meta.dirname, "../../..", dataDir);
}
