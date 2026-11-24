import { dayKey, isWeekend } from "@mt/game";
import type { Config } from "../config.ts";
import { html, type Html } from "./html.ts";
import { tip } from "./layout.ts";

/** Banner of the weekend event (WEEKEND_MULTIPLIER on Saturdays and Sundays of the game day), empty otherwise. */
export function eventBanner(cfg: Config, now: number): Html | "" {
  const n = cfg.weekendMultiplier;
  if (n === 1 || !isWeekend(dayKey(new Date(now), cfg.tzGame))) return "";
  return html`<div class="event-banner"><img src="/img/info.png" ${tip(`Week-end ×${n}`, `Batailles, missions et raids rapportent ${n} fois plus de crédits jusqu'à dimanche minuit.`)}/>
Événement du week-end : <strong>×${n} crédits dans tous les combats</strong> !</div>
`;
}
