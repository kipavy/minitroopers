import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Hono } from "hono";
import type { Deps, Env } from "../app.ts";
import { resolveDataDir, type Config } from "../config.ts";
import { defenderName } from "../foes.ts";
import { BANNER_VERSION, bannerJpeg, type Banner } from "../og.ts";
import { armyById, battleById, type BattleRow } from "../repo.ts";
import type { DatabaseSync } from "node:sqlite";

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

/** Generation counters (tests). */
export const ogStats = { generated: 0 };

/** At most this many banners are drawn at once; others wait (a crawler opening many old battles). */
const MAX_PARALLEL = 2;

/**
 * GET /og/battle/<id>.jpg: the link preview image of a daily battle (the only kind with a public page), 404 otherwise.
 * Drawn once, then served from DATA_DIR/og/<id>-v<BANNER_VERSION>.jpg. Outside the page sub-app: no session, no cookie.
 */
export function registerOg(app: Hono<Env>, deps: Deps): void {
  const { cfg, db } = deps;
  const dir = join(resolveDataDir(cfg.dataDir), "og");
  const pending = new Map<number, Promise<Buffer>>();
  let running = 0;
  const queue: (() => void)[] = [];

  async function draw(b: BattleRow, file: string): Promise<Buffer> {
    if (running >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r));
    running++;
    try {
      const jpg = await bannerJpeg(battleBanner(cfg, db, b));
      ogStats.generated++;
      await mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, jpg);
      await rename(tmp, file);
      return jpg;
    } finally {
      running--;
      queue.shift()?.();
    }
  }

  app.get("/og/battle/:file{[0-9]{1,10}\\.jpg}", async (c) => {
    const id = Number(c.req.param("file").slice(0, -4));
    const b = battleById(db, id);
    if (!b) return c.text("Not found", 404);
    const file = join(dir, `${id}-v${BANNER_VERSION}.jpg`);
    let jpg: Buffer;
    try {
      jpg = await readFile(file);
    } catch {
      let p = pending.get(id);
      if (!p) {
        p = draw(b, file).finally(() => pending.delete(id));
        pending.set(id, p);
      }
      try {
        jpg = await p;
      } catch (e) {
        console.error("og image failed for battle", id, e);
        return c.text("Error", 500);
      }
    }
    return c.body(new Uint8Array(jpg), 200, {
      "content-type": "image/jpeg",
      "content-length": String(jpg.length),
      "cache-control": "public, max-age=604800",
    });
  });
}
