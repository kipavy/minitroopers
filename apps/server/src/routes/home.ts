import { createHash } from "node:crypto";
import type { Context, Hono } from "hono";
import { formBody } from "../form.ts";
import { ERR_OFFER } from "../texts.ts";
import { describeTrooper } from "@mt/engine";
import { dailyOffers, dayKey, FACTIONS, STARTING_CREDITS, type Faction } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { bindArmy, persistSession } from "../session.ts";
import { createRateLimiter } from "../ratelimit.ts";
import { armyByHost, armyById, createArmy } from "../repo.ts";
import { checkArmyName } from "../validate.ts";
import { isValidHost, armyUrl } from "../urls.ts";
import { armyTitle, missingPage } from "../views/army.ts";
import { homePage, type HomeView, type OfferView } from "../views/home.ts";

/** UNVERIFIED: "~2 armées par jour et par IP" comes from the wiki (spec table); the exact figure is not confirmed. */
export const MAX_ARMIES_PER_IP_PER_DAY = 2;

/** A repeated creation POST within this delay of the army's creation is a double submission, not a name clash. */
const DOUBLE_SUBMIT_MS = 10_000;
const ERR_TAKEN = "Ce nom est déjà pris.";
const ERR_LIMIT = "Trop d'armées ont déjà été créées depuis cette adresse aujourd'hui. Reviens demain !";

/** Recruiting side of the page: a stored army, or a faction (stored or not yet seeded). */
interface Recruiter {
  host: string;
  title: string;
  faction: number;
  /** Stored army id when there is one (credited/linked as `recruiter_id`). */
  armyId: number | null;
}

const factionRecruiter = (f: Faction, armyId: number | null): Recruiter => ({ host: f.host, title: armyTitle(f.name, f.part), faction: f.id, armyId });

function recruiterOf(deps: Deps, host: string): Recruiter | null {
  const a = armyByHost(deps.db, host);
  if (a) return { host: a.host, title: armyTitle(a.name, a.part), faction: a.faction, armyId: a.id };
  const f = FACTIONS.find((x) => x.host === host);
  return f ? factionRecruiter(f, null) : null;
}

/** No recruiter in the URL: a faction picked by client and day ("faction aléatoire" that stays stable across reload and POST). */
function randomFaction(clientId: string, day: string): Faction {
  const n = createHash("sha256").update(`${day}|${clientId}`).digest().readUInt32BE(0);
  return FACTIONS[n % FACTIONS.length]!;
}

/** The day's offers of this client; `shopResets` > 0 (admin `reset-day --what shop`, /add only) draws them again. */
export function offersFor(c: Context<Env>, day: string, recruiter: string | null, shopResets = 0): OfferView[] {
  const salt = shopResets === 0 ? "offers" : `offers#${shopResets}`;
  return dailyOffers({ day, clientId: c.get("session").clientId, recruiter, salt }).map((o) => ({
    ...o,
    skills: describeTrooper({ id: 0, name: o.name, seed: o.seed, type: 0, choices: [], force: [], pref: null }).skills.slice(0, 2),
  }));
}

export type HomeError = (c: Context<Env>, error: string, status: 400 | 404) => Response;

export function registerHome(pages: Hono<Env>, deps: Deps): HomeError {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;
  const day = (ms: number): string => dayKey(new Date(ms), cfg.tzGame);
  const checkLimiter = createRateLimiter({ limit: 120, windowMs: 60_000, now });

  /** Context of the creation page for this request, or null when the recruiter in the URL does not exist. */
  function context(c: Context<Env>): { recruiter: Recruiter; keyHost: string | null; offers: OfferView[] } | null {
    const h = c.get("armyHost");
    const today = day(now());
    if (h !== null) {
      const recruiter = recruiterOf(deps, h);
      return recruiter ? { recruiter, keyHost: recruiter.host, offers: offersFor(c, today, recruiter.host) } : null;
    }
    return { recruiter: factionRecruiter(randomFaction(c.get("session").clientId, today), null), keyHost: null, offers: offersFor(c, today, null) };
  }

  function render(c: Context<Env>, ctx: NonNullable<ReturnType<typeof context>>, extra: Partial<HomeView> = {}, status: 200 | 400 | 403 | 404 | 409 | 429 = 200): Response {
    const view: HomeView = {
      recruiter: { host: ctx.recruiter.host, title: ctx.recruiter.title },
      formAction: ctx.keyHost === null ? "/" : armyUrl(cfg, ctx.keyHost, "/"),
      offers: ctx.offers,
      ...extra,
    };
    return c.html(String(homePage(cfg, view)), status);
  }

  const ownHqUrl = (armyId: number | null): string | null => {
    const a = armyId === null ? null : armyById(db, armyId);
    return a ? armyUrl(cfg, a.host, "/hq") : null;
  };

  pages.get("/", (c) => {
    if (c.get("armyHost") === null) {
      const own = ownHqUrl(c.get("session").armyId);
      if (own) return c.redirect(own);
    }
    const ctx = context(c);
    if (!ctx) return c.html(String(missingPage(cfg, "Armée introuvable")), 404);
    return render(c, ctx);
  });

  // Availability of a host (the client sends Common.host(name)). Invalid, reserved and faction hosts are "used".
  pages.get("/check", (c) => {
    if (!checkLimiter.hit(c.get("ip"))) return c.text("used", 429);
    const h = (c.req.query("name") ?? "").slice(0, 60);
    const v = isValidHost(h) ? checkArmyName(h, "5") : null;
    const free = v !== null && v.ok && v.host === h && armyByHost(db, h) === null;
    return c.text(free ? "free" : "used");
  });

  pages.post("/", formBody(), async (c) => {
    const ctx = context(c);
    if (!ctx) return c.html(String(missingPage(cfg, "Armée introuvable")), 404);
    const form = await c.req.parseBody();
    const name = typeof form.name === "string" ? form.name : "";
    const part = typeof form.part === "string" ? form.part : "";
    const shown = { name: name.slice(0, 20), part: /^[0-5]$/.test(part) ? Number(part) : 0 };
    // Everything below runs synchronously: no await between the checks, the insert and the session binding.
    const offer = typeof form.tselect === "string" ? ctx.offers.find((o) => String(o.seed) === form.tselect) : undefined;
    if (!offer) return render(c, ctx, { ...shown, error: ERR_OFFER }, 400);
    const v = checkArmyName(name, part);
    if (!v.ok) return render(c, ctx, { ...shown, error: v.error }, 400);
    const session = c.get("session");
    // Fresh binding: a double submission may have bound this session while we were parsing the body.
    const bound = session.persisted ? ((db.prepare("SELECT army_id FROM sessions WHERE key = ?").get(session.key) as { army_id: number | null } | undefined)?.army_id ?? null) : null;
    const existing = armyByHost(db, v.host);
    if (existing && bound === existing.id) return c.redirect(armyUrl(cfg, existing.host, "/hq"));
    // Double submission before the first response (no session yet, army made seconds ago): the browser that just created it gets in.
    if (existing && !session.persisted && !existing.isFaction && existing.passwordHash === null && existing.createdCid === session.clientId && now() - existing.createdAt <= DOUBLE_SUBMIT_MS) {
      bindArmy(db, persistSession(c, db).key, existing.id);
      return c.redirect(armyUrl(cfg, existing.host, "/hq"));
    }
    const res = createArmy(db, {
      host: v.host,
      name: v.name,
      part: v.part,
      faction: ctx.recruiter.faction,
      credits: STARTING_CREDITS,
      recruiterId: ctx.recruiter.armyId,
      createdIp: c.get("ip"),
      createdCid: session.clientId,
      now: now(),
      trooper: { seed: offer.seed, name: offer.name },
      maxPerIp: MAX_ARMIES_PER_IP_PER_DAY,
      dayOf: day,
    });
    if (!res.ok) return render(c, ctx, { ...shown, error: res.reason === "taken" ? ERR_TAKEN : ERR_LIMIT }, res.reason === "taken" ? 409 : 429);
    bindArmy(db, persistSession(c, db).key, res.army.id);
    return c.redirect(armyUrl(cfg, res.army.host, "/hq"));
  });

  /** The home page with an error popup (used by the login routes when the army does not exist). */
  return (c, error, status) => {
    const ctx = context(c);
    return ctx ? render(c, ctx, { error }, status) : c.html(String(missingPage(cfg, "Armée introuvable")), 404);
  };
}
