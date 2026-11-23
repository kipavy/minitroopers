import { Hono } from "hono";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Config } from "./config.ts";
import { clientIp } from "./ip.ts";
import { sessionMiddleware, type Session } from "./session.ts";
import { serveStatic } from "./static.ts";
import { isValidHost, resolveArmyHost } from "./urls.ts";

export type Env = {
  Variables: {
    cfg: Config;
    db: DatabaseSync;
    ip: string;
    session: Session;
    /** Army host of the current request (subdomain or "/a/<host>/"), null on the site root. */
    armyHost: string | null;
  };
};

export interface Deps {
  cfg: Config;
  db: DatabaseSync;
  now?: () => number;
}

export const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

/**
 * Builds the app: static assets first (no session, no cookie), then the page routes registered by `mount`
 * on a sub-app that is reachable both at "/" and, in path mode, at "/a/:host/".
 */
export function createApp(deps: Deps, mount?: (pages: Hono<Env>) => void): Hono<Env> {
  const { cfg, db } = deps;
  const app = new Hono<Env>();
  app.use("*", serveStatic(PUBLIC_DIR));

  const pages = new Hono<Env>();
  pages.use("*", async (c, next) => {
    c.set("cfg", cfg);
    c.set("db", db);
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
    await next();
  });
  pages.use("*", sessionMiddleware(cfg, db, deps.now));
  mount?.(pages);

  if (cfg.urlMode === "path") {
    app.route("/a/:host", pages);
    app.route("/a/:host/", pages); // armyUrl(host, "/") is "/a/<host>/": Hono is strict about the trailing slash
  }
  app.route("/", pages);
  return app;
}
