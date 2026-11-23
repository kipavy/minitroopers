import type { MiddlewareHandler } from "hono";
import type { Env } from "./app.ts";
import type { Config } from "./config.ts";

/** Sec-Fetch-Site values of a request the user's own browser made from our pages (or typed in the address bar). */
const SAME_SITE = new Set(["same-origin", "same-site", "none"]);

/** True when `origin` (an Origin header) is the public origin, or in subdomain mode an army's `<x>.<BASE_DOMAIN>`. */
function allowedOrigin(cfg: Config, origin: string): boolean {
  const pub = new URL(cfg.publicUrl);
  if (origin === pub.origin) return true;
  if (cfg.urlMode !== "subdomain") return false;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  return o.origin === origin && o.protocol === pub.protocol && o.port === pub.port && /^[a-z0-9-]+$/.test(o.hostname.slice(0, -cfg.baseDomain.length - 1)) && o.hostname.endsWith(`.${cfg.baseDomain}`);
}

/**
 * CSRF guard of every POST (the session cookie is SameSite=Lax, which does not cover same-site subdomains or old
 * browsers): `Origin` when present must be ours, else `Sec-Fetch-Site` when present must not be cross-site.
 * Clients that send neither (curl, tests) pass: they cannot be driven by another site's page.
 */
export function sameOrigin(cfg: Config): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (c.req.method !== "POST") return next();
    const origin = c.req.header("origin");
    const ok = origin !== undefined ? allowedOrigin(cfg, origin) : (() => {
      const site = c.req.header("sec-fetch-site");
      return site === undefined || SAME_SITE.has(site);
    })();
    // Plain text, and the request's Origin is never echoed. The usual cause on a self-hosted server is a PUBLIC_URL
    // that differs from the address in the browser (another host, scheme or port): every POST is then refused.
    if (!ok) return c.text(`Requête refusée\nSi tu héberges toi-même le serveur, PUBLIC_URL doit correspondre à l'adresse affichée dans ton navigateur (PUBLIC_URL actuel : ${cfg.publicUrl}).`, 403);
    await next();
  };
}
