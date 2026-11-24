import type { Context, Hono } from "hono";
import type { Html } from "../views/html.ts";
import { formBody } from "../form.ts";
import { rateLimited } from "../texts.ts";
import { armyPower } from "@mt/engine";
import { battleAllowance, dayKey, host as hostOf, nextResetAt, referralBounty } from "@mt/game";
import type { Deps, Env } from "../app.ts";
import { bindArmy, persistSession, queryParam } from "../session.ts";
import type { PasswordLimits } from "../ratelimit.ts";
import { asMissionType, missionTypeOf } from "./mission.ts";
import {
  armyByHost, armyById, battlesOfDay, defensesOf, freezeMissionType, lastRaidOfDay, missionDay, missionsOfDay, pendingRecruits, raidAlive, raidDay, recruitCount, takeNotices,
  troopersOf, trooperInput, type ArmyRow, type DefenseRow,
} from "../repo.ts";
import { isValidHost, armyUrl } from "../urls.ts";
import { verifyPassword } from "../password.ts";
import { hqPage, recruitFragment, type HqView } from "../views/hq.ts";
import { notices } from "../views/levelup.ts";
import { missingPage } from "../views/army.ts";
import { requestArmy } from "./owner.ts";
import type { HomeError } from "./home.ts";

const ERR_LOGIN = "Aucune armée de ce nom.";
const ERR_PASS = "Mot de passe incorrect.";

export function registerHq(pages: Hono<Env>, deps: Deps, homeError: HomeError, limits: PasswordLimits): void {
  const { cfg, db } = deps;
  const now = deps.now ?? Date.now;

  function hqView(army: ArmyRow, o: { locked: boolean; lockError?: string; moneyDelta?: number; notice?: Html | null; key?: string }): HqView {
    const rows = troopersOf(db, army.id);
    const troopers = rows.map(trooperInput);
    const t = now();
    const day = dayKey(new Date(t), cfg.tzGame);
    // The owner's first visit of the day draws and freezes the mission type; a stranger only sees it.
    const type = o.locked ? (missionDay(db, army.id, day).type ?? missionTypeOf(db, army.id, day)) : freezeMissionType(db, army.id, day, () => missionTypeOf(db, army.id, day));
    return {
      army,
      troopers,
      power: armyPower(troopers),
      battles: o.locked ? [] : battlesOfDay(db, army.id, day),
      battleTotal: battleAllowance(troopers),
      now: t,
      resetIn: Math.max(0, Math.round((nextResetAt(new Date(t), cfg.tzGame).getTime() - t) / 1000)),
      pendingRecruits: pendingRecruits(db, army.id),
      lastDefense: lastDefense(army.id, t),
      nextBounty: referralBounty(recruitCount(db, army.id) + 1),
      moneyDelta: o.moneyDelta ?? 0,
      notice: o.notice ?? null,
      locked: o.locked,
      mission: {
        type: asMissionType(type),
        unlocked: army.missionsUnlocked,
        tries: o.locked ? [] : missionsOfDay(db, army.id, day),
        next: o.locked ? 0 : missionDay(db, army.id, day).used,
        key: o.key ?? "",
      },
      raid: raidBox(army, day, o.key ?? ""),
      ...(o.lockError ? { lockError: o.lockError } : {}),
    };
  }

  function lastDefense(armyId: number, t: number): { row: DefenseRow; now: number } | null {
    const row = defensesOf(db, armyId, 1)[0];
    return row ? { row, now: t } : null;
  }

  function raidBox(army: ArmyRow, day: string, key: string): HqView["raid"] {
    const r = raidDay(db, army.id, day);
    const last = r.over ? lastRaidOfDay(db, army.id, day) : null;
    return {
      phase: r.phase,
      step: r.step,
      alive: raidAlive(db, army.id, day).length,
      over: r.over,
      lastWin: last !== null && last.winner !== null && last.winner === last.input.attackerSide,
      key,
    };
  }

  pages.get("/hq", (c) => {
    const session = c.get("session");
    if (c.get("armyHost") === null) {
      const own = session.armyId === null ? null : armyById(db, session.armyId);
      return c.redirect(own ? armyUrl(cfg, own.host, "/hq") : "/");
    }
    const army = requestArmy(deps, c);
    if (!army) return c.html(String(missingPage(cfg, "Armée introuvable")), 404);
    if (session.armyId === army.id) {
      const m = Number(queryParam(c, "money"));
      const moneyDelta = Number.isInteger(m) && m > 0 ? Math.min(m, army.credits) : 0;
      return c.html(String(hqPage(cfg, hqView(army, { locked: false, moneyDelta, notice: notices(takeNotices(db, army.id)), key: session.key }))));
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

  pages.post("/login", formBody(), async (c) => {
    const form = await c.req.parseBody();
    const a = findLogin(form.login);
    if (!a) return homeError(c, ERR_LOGIN, 404);
    // UNVERIFIED: a faction army (no owner, no password) is never opened by name; its recruit page instead.
    if (a.isFaction) return c.redirect(armyUrl(cfg, a.host, "/"));
    if (a.passwordHash !== null) {
      if (!limits.allow(c.get("ip"), a.id)) return rateLimited(c, cfg);
      const pass = typeof form.pass === "string" ? form.pass.slice(0, 200) : "";
      if (!verifyPassword(pass, a.passwordHash)) return c.html(String(hqPage(cfg, hqView(a, { locked: true, lockError: ERR_PASS }))), 403);
    }
    // UNVERIFIED: an army without password is opened by anyone who types its name (the original had no other check).
    bindArmy(db, persistSession(c, db).key, a.id);
    return c.redirect(armyUrl(cfg, a.host, "/hq"), 303);
  });

  // "Recruter un trooper": AJAX fragment fetched at the absolute URL "/recruit" by the original app.js, so in path
  // mode it is served at the root too and resolves the army from the session.
  pages.get("/recruit", (c) => {
    const army = requestArmy(deps, c);
    if (!army || c.get("session").armyId !== army.id) return c.text("Forbidden", 403);
    return c.html(String(recruitFragment(cfg, army, referralBounty(recruitCount(db, army.id) + 1))));
  });
}
