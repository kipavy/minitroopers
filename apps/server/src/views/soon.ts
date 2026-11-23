import type { Config } from "../config.ts";
import { armyUrl } from "../urls.ts";
import { html, type Html } from "./html.ts";
import { layout } from "./layout.ts";

/** Placeholder of the menu entries that stages 3-4 will implement (history, army order, protection, ranks). */
export function soonPage(cfg: Config, host: string | null, what: string): Html {
  const back = host ? armyUrl(cfg, host, "/hq") : "/";
  return layout(cfg, {
    title: what,
    host,
    content: html`<div class="home"><div class="add"><h1>${what}</h1>
<p>Bientôt disponible !</p>
<p><a href="${back}" class="button5">Retour</a></p></div></div>`,
  });
}

/** Unknown army (or page). */
export function missingPage(cfg: Config, message: string): Html {
  return layout(cfg, { title: message, content: html`<div class="home"><div class="add"><h1>${message}</h1>
<p><a href="/" class="button5">Accueil</a></p></div></div>` });
}
