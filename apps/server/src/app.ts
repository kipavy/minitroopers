import { Hono, type MiddlewareHandler } from "hono";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Config } from "./config.ts";
import { clientIp } from "./ip.ts";
import { sameOrigin } from "./origin.ts";
import { runWithNow } from "./requestClock.ts";
import { sessionMiddleware, type Session } from "./session.ts";
import { registerOg } from "./routes/og.ts";
import { serveStatic } from "./static.ts";
import { isValidHost, resolveArmyHost } from "./urls.ts";

export type Env = {
  Variables: {
    cfg: Config;
    db: DatabaseSync;
    ip: string;
    /** The clock of the app (tests drive it). */
    now: () => number;
    session: Session;
    /** Army host of the current request (subdomain or "/a/<host>/"), null on the site root. */
    armyHost: string | null;
  };
};

export interface Deps {
  cfg: Config;
  db: DatabaseSync;
  now?: () => number;
  /** Seed of a new battle (tests); default: a random one (routes/battle.ts). */
  battleSeed?: () => number;
}

/**
 * Headers of every page response (HTML, redirects, 404): no URL (they carry the session key `chk`) leaks to another
 * site through Referer, and no other site frames the pages. Ruffle and the SWFs are same-origin, never framed.
 */
const securityHeaders: MiddlewareHandler<Env> = async (c, next) => {
  await next();
  c.res.headers.set("Referrer-Policy", "same-origin");
  c.res.headers.set("X-Frame-Options", "SAMEORIGIN");
};

export const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

/**
 * Builds the app: static assets first (no session, no cookie), then the page routes registered by `mount`
 * on a sub-app that is reachable both at "/" and, in path mode, at "/a/:host/".
 */
export function createApp(deps: Deps, mount?: (pages: Hono<Env>) => void): Hono<Env> {
  const { cfg, db } = deps;
  const app = new Hono<Env>();
  app.use("*", serveStatic(PUBLIC_DIR));
  // Liveness probe (Docker HEALTHCHECK): the database answers. Outside the page sub-app: no session, no cookie.
  app.get("/healthz", (c) => {
    db.prepare("SELECT 1").get();
    return c.text("ok", 200, { "cache-control": "no-store" });
  });
  registerOg(app, deps);

  const pages = new Hono<Env>();
  pages.use("*", securityHeaders);
  pages.use("*", sameOrigin(cfg));
  pages.use("*", async (c, next) => {
    c.set("cfg", cfg);
    c.set("db", db);
    c.set("now", deps.now ?? Date.now);
    let remote: string | undefined;
    try {
      remote = getConnInfo(c).remote.address;
    } catch {
      remote = undefined; // no socket (tests via app.request)
    }
    c.set("ip", clientIp(cfg, (n) => c.req.header(n), remote));
    let host: string | null = null;
    if (cfg.urlMode === "path") {
      const p = (c.req.param() as Record<string, string | undefined>).host;
      if (p !== undefined) {
        if (!isValidHost(p)) return c.notFound();
        host = p;
      }
    } else {
      host = resolveArmyHost(cfg, c.req.header("host"), c.req.path)?.host ?? null;
    }
    c.set("armyHost", host);
    await runWithNow(deps.now ?? Date.now, next);
  });
  pages.use("*", sessionMiddleware(cfg, db));
  mount?.(pages);

  if (cfg.urlMode === "path") {
    app.route("/a/:host", pages);
    app.route("/a/:host/", pages); // armyUrl(host, "/") is "/a/<host>/": Hono is strict about the trailing slash
  }
  app.route("/", pages);
  return app;
}
