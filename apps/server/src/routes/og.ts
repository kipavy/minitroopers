import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Hono } from "hono";
import type { Deps, Env } from "../app.ts";
import type { Config } from "../config.ts";
import { defenderName } from "../foes.ts";
import { BANNER_VERSION, bannerJpeg, type Banner } from "../og.ts";
import { ogDir, purgeBattleImages } from "../ogCache.ts";
import { armyById, battleById, type BattleRow } from "../repo.ts";

/** Banner of a stored daily battle: attacker on the left, defender on the right (like the "X VS Y" title). */
export function battleBanner(cfg: Config, db: DatabaseSync, b: BattleRow): Banner {
  const atk = b.input.attackerSide === 1 ? 1 : 0;
  const side = (s: number, name: string | null) => ({
    name: name ?? "Inconnue",
    faction: b.input.armies[s]?.faction ?? 0,
    troopers: b.input.armies[s]?.troopers.length ?? 0,
  });
  const [y, m, d] = b.day.split("-");
  return {
    kind: "COMBAT",
    left: side(atk, armyById(db, b.attackerId)?.name ?? null),
    right: side(1 - atk, defenderName(db, b)),
    bg: b.input.background?.gfx ?? "bg/garden.jpg",
    footer: `${d}/${m}/${y} · Combat #${b.id}`,
    site: new URL(cfg.publicUrl).host,
  };
}

/**
 * Cache file of a banner: `<id>-v<BANNER_VERSION>-<hash of its content>.jpg`. Any change of what it shows (an army
 * renamed or deleted, PUBLIC_URL) gives another name, so a stale image is never served.
 */
export function bannerFile(dir: string, id: number, banner: Banner): string {
  const h = createHash("sha256").update(JSON.stringify(banner)).digest("hex").slice(0, 12);
  return join(dir, `${id}-v${BANNER_VERSION}-${h}.jpg`);
}

/** Counters and limits (tests adjust the limits). */
export const ogStats = { generated: 0 };
export const ogLimits = {
  /** Banners drawn at once. */
  parallel: 2,
  /** Requests waiting for a slot; beyond, 503 (a crawler opening many old battles). */
  queue: 20,
  /** A failed battle answers 500 without a new attempt for this long. */
  failMs: 60_000,
};

const HEADERS = { "x-content-type-options": "nosniff" };

/**
 * GET /og/battle/<id>.jpg: the link preview image of a daily battle (the only kind with a public page), 404 otherwise.
 * Drawn once, then served from DATA_DIR/og/ (bannerFile). Outside the page sub-app: no session, no cookie.
 */
export function registerOg(app: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const dir = ogDir(cfg);
  const pending = new Map<string, Promise<Buffer>>();
  const failed = new Map<number, number>();
  let running = 0;
  const queue: (() => void)[] = [];

  /** Takes a drawing slot (waiting in line if needed); `release` hands it straight to the next in line. */
  async function acquire(): Promise<void> {
    if (running < ogLimits.parallel) {
      running++;
      return;
    }
    await new Promise<void>((r) => queue.push(r));
  }
  function release(): void {
    const next = queue.shift();
    if (next) next();
    else running--;
  }

  async function store(file: string, jpg: Buffer, id: number): Promise<void> {
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(tmp, jpg);
      await rename(tmp, file);
      purgeBattleImages(dir, [id], file); // older versions / contents of this battle
    } catch (e) {
      console.error("og image cache write failed for battle", id, e);
      await unlink(tmp).catch(() => undefined);
    }
  }

  async function draw(id: number, banner: Banner, file: string): Promise<Buffer> {
    await acquire();
    try {
      const jpg = await bannerJpeg(banner);
      ogStats.generated++;
      await store(file, jpg, id);
      return jpg;
    } finally {
      release();
    }
  }

  app.get("/og/battle/:file{[0-9]{1,10}\\.jpg}", async (c) => {
    const id = Number(c.req.param("file").slice(0, -4));
    const b = battleById(db, id);
    if (!b) return c.text("Not found", 404, HEADERS);
    const fail = (e: unknown): Response => {
      console.error("og image failed for battle", id, e);
      failed.set(id, Date.now() + ogLimits.failMs);
      if (failed.size > 1000) failed.delete(failed.keys().next().value!);
      return c.text("Error", 500, { ...HEADERS, "retry-after": "60" });
    };
    const until = failed.get(id);
    if (until !== undefined && until > Date.now()) return c.text("Error", 500, { ...HEADERS, "retry-after": "60" });
    failed.delete(id);
    let banner: Banner;
    try {
      banner = battleBanner(cfg, db, b);
    } catch (e) {
      return fail(e); // a stored input it cannot read
    }
    const file = bannerFile(dir, id, banner);
    let jpg: Buffer;
    try {
      jpg = await readFile(file);
    } catch {
      let p = pending.get(file);
      if (!p) {
        if (running >= ogLimits.parallel && queue.length >= ogLimits.queue) return c.text("Busy", 503, { ...HEADERS, "retry-after": "30" });
        p = draw(id, banner, file).finally(() => pending.delete(file));
        pending.set(file, p);
      }
      try {
        jpg = await p;
      } catch (e) {
        return fail(e);
      }
    }
    return c.body(new Uint8Array(jpg), 200, {
      ...HEADERS,
      "content-type": "image/jpeg",
      "content-length": String(jpg.length),
      "cache-control": "public, max-age=604800",
    });
  });
}
