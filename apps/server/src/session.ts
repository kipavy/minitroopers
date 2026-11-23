import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "./app.ts";
import type { Config } from "./config.ts";

export interface Session {
  /** 6-char key, also the anti-CSRF token of every action URL (like the original `ssid`). */
  key: string;
  armyId: number | null;
  /**
   * Persistent client identifier (`cid` cookie): stand-in for the original Flash "machine id".
   * UNVERIFIED: the original `mid` is computed by a 1x1 SWF in ClientMode#3 and cannot be reproduced without `chk`.
   */
  clientId: string;
}

const KEY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const KEY_RE = /^[A-Za-z0-9]{6}$/;
const CID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const DAY_MS = 86_400_000;

const newKey = (): string => Array.from({ length: 6 }, () => KEY_CHARS[randomInt(KEY_CHARS.length)]).join("");

export function bindArmy(db: DatabaseSync, key: string, armyId: number | null): void {
  db.prepare("UPDATE sessions SET army_id = ? WHERE key = ?").run(armyId, key);
}

export function sessionMiddleware(cfg: Config, db: DatabaseSync, now: () => number = Date.now): MiddlewareHandler<Env> {
  // Subdomain mode: share the session between the root site and <host>.<BASE_DOMAIN> via Domain=<BASE_DOMAIN> (no port).
  // UNVERIFIED in browsers for single-label domains (BASE_DOMAIN=localhost): Chromium may refuse Domain=localhost; use lvh.me if so.
  const domain = cfg.urlMode === "subdomain" ? { domain: cfg.baseDomain.replace(/:\d+$/, "") } : {};
  const opts = { httpOnly: true, sameSite: "Lax" as const, path: "/", secure: cfg.secureCookies, ...domain };
  return async (c, next) => {
    if (c.get("session")) return next(); // pages are mounted twice in path mode: a 404 falls through both chains
    const ssid = getCookie(c, "ssid");
    const cidCookie = getCookie(c, "cid");
    let row = ssid && KEY_RE.test(ssid)
      ? (db.prepare("SELECT key, army_id, client_id FROM sessions WHERE key = ?").get(ssid) as { key: string; army_id: number | null; client_id: string } | undefined)
      : undefined;
    if (!row) {
      const clientId = cidCookie && CID_RE.test(cidCookie) ? cidCookie : randomBytes(16).toString("base64url");
      for (;;) {
        const key = newKey();
        try {
          db.prepare("INSERT INTO sessions(key, army_id, client_id, created_at) VALUES (?, NULL, ?, ?)").run(key, clientId, now());
          row = { key, army_id: null, client_id: clientId };
          break;
        } catch (e) {
          if (!/UNIQUE|constraint/i.test(String(e))) throw e;
        }
      }
      setCookie(c, "ssid", row.key, { ...opts, maxAge: 30 * 86400 });
    }
    if (cidCookie !== row.client_id) setCookie(c, "cid", row.client_id, { ...opts, maxAge: 400 * 86400 });
    c.set("session", { key: row.key, armyId: row.army_id, clientId: row.client_id });
    await next();
  };
}

/** Query parameter parser accepting both '&' and the original ';' separators (`?opp=12;chk=KEY`). */
export function queryParam(c: Context, name: string): string | undefined {
  const q = c.req.url.split("?", 2)[1];
  if (!q) return undefined;
  for (const part of q.split("#")[0]!.split(/[&;]/)) {
    const i = part.indexOf("=");
    if ((i < 0 ? part : part.slice(0, i)) !== name) continue;
    try {
      return decodeURIComponent((i < 0 ? "" : part.slice(i + 1)).replace(/\+/g, " "));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** True when query parameter `param` equals the session key (the anti-CSRF token of action URLs). */
export function hasKey(c: Context<Env>, param: string): boolean {
  return isSessionKey(c, queryParam(c, param));
}

/** True when `value` (query parameter or form field) is the session key. */
export function isSessionKey(c: Context<Env>, value: unknown): boolean {
  const given = Buffer.from(typeof value === "string" ? value : "");
  const want = Buffer.from(c.get("session").key);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Guard for action URLs: query parameter `param` must equal the session key, else 403. */
export function actionKey(param: string): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (!hasKey(c, param)) return c.text("Forbidden", 403);
    await next();
  };
}
