import { dayKey, weekendEvent } from "@mt/game";
import type { Config } from "../config.ts";
import { html, type Html } from "./html.ts";
import { tip } from "./layout.ts";

const RECHARGE = "combats qui se rechargent toutes les 2 h";
const RECHARGE_TIP = "+1 bataille toutes les 2 h, jusqu'à 3 en réserve, jusqu'à dimanche minuit.";

/**
 * Banner of the weekend event drawn for the game day at `now` (the app clock of the request): ×WEEKEND_MULTIPLIER, the
 * battle recharge, or both (spec 2026-11-25-recharge-week-end-design.md); empty when nothing is drawn. Shown on the HQ
 * only, at the top of its right column (Killian, 2026-11-24).
 */
export function eventBanner(cfg: Config, now: number): Html | "" {
  const n = cfg.weekendMultiplier;
  const e = weekendEvent(dayKey(new Date(now), cfg.tzGame), n);
  if (e.x3 && e.regen) {
    return html`<div class="event-banner"><img src="/img/info.png" ${tip(`Week-end ×${n} et recharge`, `Batailles, missions et raids rapportent ${n} fois plus de crédits. ${RECHARGE_TIP}`)}/>
Événement du week-end : <strong>×${n} <img src="/img/token.png" class="coin"/> et ${RECHARGE}</strong> !</div>
`;
  }
  if (e.regen) {
    return html`<div class="event-banner"><img src="/img/info.png" ${tip("Week-end : recharge", RECHARGE_TIP)}/>
Événement du week-end : <strong>${RECHARGE}</strong> !</div>
`;
  }
  if (!e.x3) return "";
  return html`<div class="event-banner"><img src="/img/info.png" ${tip(`Week-end ×${n}`, `Batailles, missions et raids rapportent ${n} fois plus de crédits jusqu'à dimanche minuit.`)}/>
Événement du week-end : <strong>×${n} <img src="/img/token.png" class="coin"/> dans tous les combats</strong> !</div>
`;
}
