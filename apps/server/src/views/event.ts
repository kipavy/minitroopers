import { dayKey, isWeekend } from "@mt/game";
import type { Config } from "../config.ts";
import { html, type Html } from "./html.ts";
import { requestNow } from "../requestClock.ts";
import { tip } from "./layout.ts";

/**
 * Banner of the weekend event (WEEKEND_MULTIPLIER on Saturdays and Sundays of the game day, at the time of the request
 * being served), empty otherwise. Shown on the HQ only, at the top of its right column (Killian, 2026-11-24).
 */
export function eventBanner(cfg: Config, now: number = requestNow()): Html | "" {
  const n = cfg.weekendMultiplier;
  if (n === 1 || !isWeekend(dayKey(new Date(now), cfg.tzGame))) return "";
  return html`<div class="event-banner"><img src="/img/info.png" ${tip(`Week-end ×${n}`, `Batailles, missions et raids rapportent ${n} fois plus de crédits jusqu'à dimanche minuit.`)}/>
Événement du week-end : <strong>×${n} <img src="/img/token.png" class="coin"/> dans tous les combats</strong> !</div>
`;
}
