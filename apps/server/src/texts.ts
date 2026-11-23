import type { Context } from "hono";
import type { Config } from "./config.ts";
import { missingPage } from "./views/soon.ts";

/** The only error text of the archived pages for a missing offer (home page, /add). */
export const ERR_OFFER = "Cette action nécessite que tu sois enregistré sur le site.";

// UNVERIFIED: the archived pages show no rate-limit text; ours.
export const ERR_RATE = "Trop de tentatives. Réessaie dans quelques minutes.";

/** Too many password attempts (/login, /protect): 429 with the rate-limit page. */
export const rateLimited = (c: Context, cfg: Config): Response => c.html(String(missingPage(cfg, ERR_RATE)), 429);
