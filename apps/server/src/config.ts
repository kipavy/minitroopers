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
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, "");
  return {
    port,
    urlMode: mode,
    publicUrl,
    baseDomain: env.BASE_DOMAIN ?? "localhost",
    dataDir: env.DATA_DIR ?? "var",
    trustProxy: env.TRUST_PROXY === "1",
    tzGame: env.TZ_GAME ?? "Europe/Paris",
    adminToken: env.ADMIN_TOKEN ? env.ADMIN_TOKEN : null,
    secureCookies: publicUrl.startsWith("https://"),
  };
}
