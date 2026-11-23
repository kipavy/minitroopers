import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "./app.ts";
import type { Config } from "./config.ts";

export interface Session {
  /**
   * 6-char key: the anti-CSRF token of every action URL (like the original `ssid`). It is shown in URLs, so the
   * session cookie carries a separate random token (sessions.token), never this key.
   */
  key: string;
  armyId: number | null;
  /**
   * Persistent client identifier (`cid` cookie): stand-in for the original Flash "machine id".
   * UNVERIFIED: the original `mid` is computed by a 1x1 SWF in ClientMode#3 and cannot be reproduced without `chk`.
   */
  clientId: string;
  /**
   * False for a visitor without a session cookie: nothing is stored and no `ssid` is set until `persistSession`
   * (army creation, login). `key` is then a throwaway value that no stored session matches.
   */
  persisted: boolean;
}

const KEY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** `ssid` cookie: random 128-bit token (base64url), never the key, which every action URL shows. */
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const CID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const DAY_MS = 86_400_000;

const newKey = (): string => Array.from({ length: 6 }, () => KEY_CHARS[randomInt(KEY_CHARS.length)]).join("");

export function bindArmy(db: DatabaseSync, key: string, armyId: number | null): void {
  db.prepare("UPDATE sessions SET army_id = ? WHERE key = ?").run(armyId, key);
}

/** Cookie options of the site (Domain=<BASE_DOMAIN> in subdomain mode, to share the session with every army). */
function cookieOpts(cfg: Config) {
  // Verified in Chromium (test/e2e.test.ts, "[e2e cookies]"): works for mt.localhost; Domain=localhost is never sent to
  // <host>.localhost, so loadConfig refuses a single-label BASE_DOMAIN in subdomain mode.
  const domain = cfg.urlMode === "subdomain" ? { domain: cfg.baseDomain } : {};
  return { httpOnly: true, sameSite: "Lax" as const, path: "/", secure: cfg.secureCookies, ...domain };
}

/**
 * Lazy sessions: a visitor without a valid `ssid` cookie gets no row and no `ssid` (only the `cid` client id), so
 * crawlers and drive-by GETs store nothing. `persistSession` creates the row when the visitor becomes someone.
 */
export function sessionMiddleware(cfg: Config, db: DatabaseSync): MiddlewareHandler<Env> {
  const opts = cookieOpts(cfg);
  return async (c, next) => {
    if (c.get("session")) return next(); // pages are mounted twice in path mode: a 404 falls through both chains
    const ssid = getCookie(c, "ssid");
    const cidCookie = getCookie(c, "cid");
    const row = ssid && TOKEN_RE.test(ssid)
      ? (db.prepare("SELECT key, army_id, client_id FROM sessions WHERE token = ?").get(ssid) as { key: string; army_id: number | null; client_id: string } | undefined)
      : undefined;
    const clientId = row ? row.client_id : cidCookie && CID_RE.test(cidCookie) ? cidCookie : randomBytes(16).toString("base64url");
    if (cidCookie !== clientId) setCookie(c, "cid", clientId, { ...opts, maxAge: 400 * 86400 });
    c.set("session", row ? { key: row.key, armyId: row.army_id, clientId, persisted: true } : { key: newKey(), armyId: null, clientId, persisted: false });
    await next();
  };
}

/** Makes the request's session a stored one (row + `ssid` cookie). Idempotent; call before `bindArmy`. */
export function persistSession(c: Context<Env>, db: DatabaseSync): Session {
  const s = c.get("session");
  if (s.persisted) return s;
  const token = randomBytes(16).toString("base64url");
  const created = c.get("now")();
  for (;;) {
    try {
      db.prepare("INSERT INTO sessions(key, token, army_id, client_id, created_at) VALUES (?, ?, NULL, ?, ?)").run(s.key, token, s.clientId, created);
      break;
    } catch (e) {
      if (!/UNIQUE|constraint/i.test(String(e))) throw e;
      s.key = newKey(); // the throwaway key collided with a stored one
    }
  }
  s.persisted = true;
  setCookie(c, "ssid", token, { ...cookieOpts(c.get("cfg")), maxAge: 30 * 86400 });
  return s;
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
