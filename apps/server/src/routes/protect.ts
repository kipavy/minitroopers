import type { Hono } from "hono";
import { formBody } from "../form.ts";
import { rateLimited } from "../texts.ts";
import type { Deps, Env } from "../app.ts";
import { hashPassword, verifyPassword } from "../password.ts";
import type { PasswordLimits } from "../ratelimit.ts";
import { setPassword } from "../repo.ts";
import { isSessionKey, queryParam } from "../session.ts";
import { armyUrl } from "../urls.ts";
import { protectPage } from "../views/protect.ts";
import { ownedArmy, type Owned } from "./owner.ts";

const MAX_LEN = 100;
// UNVERIFIED: the archived pages show no error text for /protect; these messages are ours.
const ERR_DIFF = "Les deux mots de passe sont différents.";
const ERR_OLD = "Ancien mot de passe incorrect.";
const ERR_EMPTY = "Mot de passe vide.";
const ERR_LONG = `Mot de passe trop long (${MAX_LEN} caractères au maximum).`;

export function registerProtect(pages: Hono<Env>, deps: Deps, limits: PasswordLimits): void {
  const { cfg, db } = deps;

  // UNVERIFIED: the original only lets the machine that created the army set its first password (machine id `mid`).
  // Ours compares the `cid` cookie. An army with no recorded cid (005 found no session to backfill it from, or a CLI
  // army created without a password) is refused too: it opens by name, so anyone could otherwise lock its owner out.
  // The admin sets such a password with `npm run admin -- set-password`.
  const wrongComputer = (c: Parameters<typeof ownedArmy>[1], o: Owned): boolean =>
    o.army.passwordHash === null && (o.army.createdCid === null || o.army.createdCid !== c.get("session").clientId);

  const render = (c: Parameters<typeof ownedArmy>[1], o: Owned, status: 200 | 400 | 403 | 429, error?: string) =>
    c.html(String(protectPage(cfg, { army: o.army, troopers: o.troopers, power: o.power, chk: c.get("session").key, bad: wrongComputer(c, o), ...(error ? { error } : {}) })), status);

  pages.get("/protect", (c) => {
    const o = ownedArmy(deps, c);
    return o instanceof Response ? o : render(c, o, 200);
  });

  pages.post("/protect", formBody(), async (c) => {
    if (queryParam(c, "submit") !== "1") return c.text("Forbidden", 403);
    const form = await c.req.parseBody();
    if (!isSessionKey(c, form.chk)) return c.text("Forbidden", 403);
    const o = ownedArmy(deps, c);
    if (o instanceof Response) return o;
    const { army } = o;
    if (wrongComputer(c, o)) return render(c, o, 403);
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const protectedAlready = army.passwordHash !== null;
    const next = protectedAlready ? str(form.newpass) : str(form.pass);
    if (next === "") return render(c, o, 400, ERR_EMPTY);
    if (next.length > MAX_LEN) return render(c, o, 400, ERR_LONG);
    if (next !== str(form.passconf)) return render(c, o, 400, ERR_DIFF);
    if (army.passwordHash !== null) {
      if (!limits.allow(c.get("ip"), army.id)) return rateLimited(c, cfg);
      if (!verifyPassword(str(form.pass).slice(0, 200), army.passwordHash)) return render(c, o, 403, ERR_OLD);
    }
    setPassword(db, army.id, hashPassword(next), c.get("session").key);
    return c.redirect(armyUrl(cfg, army.host, "/hq"), 303);
  });
}
