import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { armyPower, describeTrooper } from "@mt/engine";
import { battlesPerDay, dayKey, host as hostOf, nextResetAt, referralBounty } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { bindArmy, queryParam } from "../session.ts";
import { createRateLimiter } from "../ratelimit.ts";
import { armyByHost, armyById, battlesOfDay, recruitCount, troopersOf, trooperInput, type ArmyRow } from "../repo.ts";
import { isValidHost, armyUrl } from "../urls.ts";
import { verifyPassword } from "../password.ts";
import { hqPage, recruitFragment, type HqView } from "../views/hq.ts";
import { missingPage, soonPage } from "../views/soon.ts";
import type { HomeError } from "./home.ts";

const ERR_LOGIN = "Aucune armée de ce nom.";
const ERR_PASS = "Mot de passe incorrect.";
const ERR_RATE = "Trop de tentatives. Réessaie dans quelques minutes.";

/** Menu entries that stages 3-4 implement; until then they answer with a "bientôt" page. */
const SOON: Record<string, string> = {
  "/history": "Historique",
  "/choice": "Gérer mon armée",
  "/protect": "Protéger mon armée",
  "/ranks": "Hiérarchie",
  "/global-ranks": "Hiérarchie",
};

export function registerHq(pages: Hono<Env>, deps: Deps, homeError: HomeError): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;
  const loginLimiter = createRateLimiter({ limit: 10, windowMs: 600_000, now });
  const loginIpLimiter = createRateLimiter({ limit: 40, windowMs: 600_000, now });

  function hqView(army: ArmyRow, o: { locked: boolean; lockError?: string; moneyDelta?: number }): HqView {
    const rows = troopersOf(db, army.id);
    const troopers = rows.map(trooperInput);
    const t = now();
    const day = dayKey(new Date(t), cfg.tzGame);
    return {
      army,
      troopers,
      power: armyPower(troopers),
      battles: o.locked ? [] : battlesOfDay(db, army.id, day),
      battleTotal: battlesPerDay(troopers.map((tr) => ({ skills: describeTrooper(tr).skills }))),
      resetIn: Math.max(0, Math.round((nextResetAt(new Date(t), cfg.tzGame).getTime() - t) / 1000)),
      nextBounty: referralBounty(recruitCount(db, army.id) + 1),
      moneyDelta: o.moneyDelta ?? 0,
      notice: null,
      locked: o.locked,
      ...(o.lockError ? { lockError: o.lockError } : {}),
    };
  }

  /** The army of the request: the one in the URL, else the session's. */
  const requestArmy = (c: Context<Env>): ArmyRow | null => {
    const h = c.get("armyHost");
    if (h !== null) return armyByHost(db, h);
    const id = c.get("session").armyId;
    return id === null ? null : armyById(db, id);
  };

  pages.get("/hq", (c) => {
    const session = c.get("session");
    if (c.get("armyHost") === null) {
      const own = session.armyId === null ? null : armyById(db, session.armyId);
      return c.redirect(own ? armyUrl(cfg, own.host, "/hq") : "/");
    }
    const army = requestArmy(c);
    if (!army) return c.html(String(missingPage(cfg, "Armée introuvable")), 404);
    if (session.armyId === army.id) {
      const m = Number(queryParam(c, "money"));
      const moneyDelta = Number.isInteger(m) && m > 0 ? Math.min(m, army.credits) : 0;
      return c.html(String(hqPage(cfg, hqView(army, { locked: false, moneyDelta }))));
    }
    // Not the owner: a protected army asks for its password; an open one is only reachable through its recruit page / login.
    if (army.passwordHash !== null) return c.html(String(hqPage(cfg, hqView(army, { locked: true }))));
    return c.redirect(armyUrl(cfg, army.host, "/"));
  });

  const findLogin = (login: unknown): ArmyRow | null => {
    if (typeof login !== "string" || login.length > 100) return null;
    const h = hostOf(login);
    return isValidHost(h) ? armyByHost(db, h) : null;
  };

  // GET only redirects (like the original `/login?login=x`) and never touches the session.
  pages.get("/login", (c) => {
    const a = findLogin(c.req.query("login"));
    return a ? c.redirect(armyUrl(cfg, a.host, "/hq")) : homeError(c, ERR_LOGIN, 404);
  });

  pages.post("/login", bodyLimit({ maxSize: 4096, onError: (c) => c.text("Requête trop grande", 413) }), async (c) => {
    const form = await c.req.parseBody();
    const a = findLogin(form.login);
    if (!a) return homeError(c, ERR_LOGIN, 404);
    if (a.passwordHash !== null) {
      // UNVERIFIED: attempt limits (10 per 10 min per IP+army, 40 per IP) are ours; the original's are unknown.
      if (!loginLimiter.hit(`${c.get("ip")}|${a.id}`) || !loginIpLimiter.hit(c.get("ip"))) return c.html(String(missingPage(cfg, ERR_RATE)), 429);
      const pass = typeof form.pass === "string" ? form.pass.slice(0, 200) : "";
      if (!verifyPassword(pass, a.passwordHash)) return c.html(String(hqPage(cfg, hqView(a, { locked: true, lockError: ERR_PASS }))), 403);
    }
    // UNVERIFIED: an army without password is opened by anyone who types its name (the original had no other check).
    bindArmy(db, c.get("session").key, a.id);
    return c.redirect(armyUrl(cfg, a.host, "/hq"));
  });

  // "Recruter un trooper": AJAX fragment fetched at the absolute URL "/recruit" by the original app.js, so in path
  // mode it is served at the root too and resolves the army from the session.
  pages.get("/recruit", (c) => {
    const army = requestArmy(c);
    if (!army || c.get("session").armyId !== army.id) return c.text("Forbidden", 403);
    return c.html(String(recruitFragment(cfg, army, referralBounty(recruitCount(db, army.id) + 1))));
  });

  for (const [path, label] of Object.entries(SOON)) {
    pages.get(path, (c) => c.html(String(soonPage(cfg, requestArmy(c)?.host ?? null, label))));
  }
}
