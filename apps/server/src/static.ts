import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { MiddlewareHandler } from "hono";

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".swf": "application/x-shockwave-flash",
  ".wasm": "application/wasm",
};

/** Serves files below `root` (GET/HEAD); falls through (next) when no such file. No directory listing, no traversal. */
export function serveStatic(root: string): MiddlewareHandler {
  const base = resolve(root);
  return async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    let rel: string;
    try {
      rel = decodeURIComponent(c.req.path);
    } catch {
      return next();
    }
    if (rel.includes("\0") || rel.includes("\\")) return next();
    const file = resolve(base, "." + rel);
    if (!file.startsWith(base + sep)) return next();
    const type = TYPES[extname(file).toLowerCase()];
    if (!type) return next();
    try {
      if (!(await stat(file)).isFile()) return next();
      const body = await readFile(file);
      return new Response(c.req.method === "HEAD" ? null : body, {
        headers: { "content-type": type, "content-length": String(body.length), "cache-control": "public, max-age=300" },
      });
    } catch {
      return next();
    }
  };
}
