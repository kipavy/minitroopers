import type { Config } from "./config.ts";

/** Army hosts are produced by @mt/game `host()` and validated names: lowercase letters, digits, '-'. */
const HOST_RE = /^[a-z0-9-]{1,16}$/;
export const isValidHost = (h: string): boolean => HOST_RE.test(h);

/**
 * Link to a page of an army. `path` starts with "/" and may carry a query.
 * path mode: "/a/<host>/hq"; subdomain mode: "<scheme>://<host>.<BASE_DOMAIN>[:port]/hq".
 */
export function armyUrl(cfg: Config, host: string, path: string): string {
  if (cfg.urlMode === "path") return `/a/${host}${path}`;
  const u = new URL(cfg.publicUrl);
  return `${u.protocol}//${host}.${cfg.baseDomain}${u.port ? `:${u.port}` : ""}${path}`;
}

/** Current army host and army-relative path from the request (Host header or "/a/<host>/..."), else null. */
export function resolveArmyHost(cfg: Config, hostHeader: string | undefined, pathname: string): { host: string; path: string } | null {
  if (cfg.urlMode === "path") {
    const m = /^\/a\/([^/]+)(\/.*)?$/.exec(pathname);
    if (!m || !isValidHost(m[1]!)) return null;
    return { host: m[1]!, path: m[2] ?? "/" };
  }
  const h = (hostHeader ?? "").toLowerCase().replace(/:\d+$/, "");
  const suffix = `.${cfg.baseDomain.toLowerCase()}`;
  if (!h.endsWith(suffix)) return null;
  const sub = h.slice(0, -suffix.length);
  return isValidHost(sub) ? { host: sub, path: pathname } : null;
}
