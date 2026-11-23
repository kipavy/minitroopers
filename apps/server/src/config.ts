import { isAbsolute, resolve } from "node:path";

export type UrlMode = "path" | "subdomain";

export interface Config {
  port: number;
  urlMode: UrlMode;
  /** Public origin without trailing slash, e.g. "http://localhost:8080". */
  publicUrl: string;
  baseDomain: string;
  dataDir: string;
  trustProxy: boolean;
  tzGame: string;
  adminToken: string | null;
  /** Cookies get the Secure flag when the public URL is https. */
  secureCookies: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = env.PORT ? Number(env.PORT) : 8080;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid PORT: ${env.PORT}`);
  const mode = env.URL_MODE ?? "path";
  if (mode !== "path" && mode !== "subdomain") throw new Error(`invalid URL_MODE: ${mode} (path|subdomain)`);
  const baseDomain = env.BASE_DOMAIN ?? "localhost";
  // Subdomain mode shares the session cookie with every army via Domain=<BASE_DOMAIN>. Verified in Chromium (e2e):
  // a Domain=localhost cookie is stored but never sent to <army>.localhost, so a single-label domain cannot work.
  // Locally, use a name under localhost such as mt.localhost (browsers resolve *.localhost without DNS).
  if (mode === "subdomain" && !baseDomain.replace(/:\d+$/, "").includes(".")) {
    throw new Error(`invalid BASE_DOMAIN for URL_MODE=subdomain: ${baseDomain} (needs two labels or more, e.g. mt.localhost)`);
  }
  const host = mode === "subdomain" ? baseDomain.replace(/:\d+$/, "") : "localhost";
  const publicUrl = (env.PUBLIC_URL ?? `http://${host}:${port}`).replace(/\/+$/, "");
  return {
    port,
    urlMode: mode,
    publicUrl,
    baseDomain,
    dataDir: env.DATA_DIR ?? "var",
    trustProxy: env.TRUST_PROXY === "1",
    tzGame: env.TZ_GAME ?? "Europe/Paris",
    adminToken: env.ADMIN_TOKEN ? env.ADMIN_TOKEN : null,
    secureCookies: publicUrl.startsWith("https://"),
  };
}

/** Data directory: a relative DATA_DIR is relative to the repository root (var/ is gitignored). */
export function resolveDataDir(dataDir: string): string {
  return isAbsolute(dataDir) ? dataDir : resolve(import.meta.dirname, "../../..", dataDir);
}
