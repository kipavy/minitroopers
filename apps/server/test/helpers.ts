import { loadConfig, type Config } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { createApp } from "../src/app.ts";
import { mountPages } from "../src/routes/index.ts";
import type { DatabaseSync } from "node:sqlite";

export type Mode = "path" | "subdomain";

export const ENV: Record<Mode, Record<string, string>> = {
  path: { URL_MODE: "path", TRUST_PROXY: "1" },
  subdomain: { URL_MODE: "subdomain", BASE_DOMAIN: "lvh.me", PUBLIC_URL: "http://lvh.me:8080", TRUST_PROXY: "1" },
};

export interface Env {
  app: ReturnType<typeof createApp>;
  db: DatabaseSync;
  cfg: Config;
  clock: { t: number };
  /** A browser: keeps cookies; `ip` is sent as CF-Connecting-IP (TRUST_PROXY=1). */
  client(ip?: string): Client;
  /** Path of an army page for the mode, and the Host header to send with it. */
  at(host: string, path: string): { url: string; host: string };
}

export interface Client {
  req(path: string, init?: { method?: string; form?: Record<string, string>; host?: string }): Promise<Response>;
  cookies: Record<string, string>;
}

export function setup(mode: Mode = "path", extra: Record<string, string> = {}): Env {
  const cfg = loadConfig({ ...ENV[mode], ...extra });
  const db = openDb(":memory:");
  const clock = { t: Date.parse("2026-11-23T10:00:00Z") };
  const deps = { cfg, db, now: () => clock.t };
  const app = createApp(deps, mountPages(deps));
  return {
    app,
    db,
    cfg,
    clock,
    at: (host, path) => (mode === "path" ? { url: `/a/${host}${path}`, host: "localhost" } : { url: path, host: `${host}.lvh.me:8080` }),
    client(ip = "1.1.1.1") {
      const cookies: Record<string, string> = {};
      return {
        cookies,
        async req(path, init = {}) {
          const headers: Record<string, string> = { "cf-connecting-ip": ip };
          if (init.host) headers.host = init.host;
          const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
          if (cookie) headers.cookie = cookie;
          let body: string | undefined;
          if (init.form) {
            body = new URLSearchParams(init.form).toString();
            headers["content-type"] = "application/x-www-form-urlencoded";
          }
          const res = await app.request(path, { method: init.method ?? (init.form ? "POST" : "GET"), headers, ...(body !== undefined ? { body } : {}) });
          for (const sc of res.headers.getSetCookie()) {
            const [kv] = sc.split(";");
            const i = kv!.indexOf("=");
            cookies[kv!.slice(0, i)] = kv!.slice(i + 1);
          }
          return res;
        },
      };
    },
  };
}

/** Seeds of the 5 offers shown on a page. */
export const offerSeeds = (html: string): number[] => [...html.matchAll(/_\.selectTrooper\(100\d,(\d+)\)" style/g)].map((m) => Number(m[1]));

/** Creates an army through the real form flow. Returns the redirect response. */
export async function create(env: Env, cl: Client, name: string, o: { part?: string; recruit?: string; at?: number } = {}): Promise<Response> {
  const page = o.recruit ? env.at(o.recruit, "/") : { url: "/", host: "localhost" };
  const html = await (await cl.req(page.url, { host: page.host })).text();
  const seed = offerSeeds(html)[o.at ?? 0]!;
  return cl.req(page.url, { host: page.host, form: { part: o.part ?? "5", name, tselect: String(seed) } });
}
