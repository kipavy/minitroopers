import type { Config } from "../config.ts";
import { armyUrl } from "../urls.ts";
import { html } from "./html.ts";
import { shellPage, type ShellView } from "./panel.ts";
import { swfEmbed } from "./swf.ts";

/** `/choice` ("Gérer mon armée"), from $EX/html/fr/choice.html: the ClientMode 1 SWF and its Valider / Annuler buttons. */
export function choicePage(cfg: Config, v: Omit<ShellView, "title" | "right"> & { flashvars: string }): string {
  const { flashvars, ...shell } = v;
  const right = html`<p>Réorganise ton armée en mettant en priorité tes troopers les plus puissants ! Pour cela, clique et fais glisser le trooper pour ainsi le changer de place (n'oublie pas de cliquer sur Valider !) :</p>
${swfEmbed({ id: "swf_client", width: 630, height: 254, flashvars, objId: "client" })}
<a href="javascript:_.swfAction('client','save')" class="button5">Valider</a>
<a href="${armyUrl(cfg, v.army.host, "/hq")}" class="button5">Annuler</a>`;
  return String(shellPage(cfg, { ...shell, title: "Gérer mon armée", right }));
}
