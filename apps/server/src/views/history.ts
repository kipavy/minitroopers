import type { Config } from "../config.ts";
import type { RecruitRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle } from "./army.ts";
import { html, type Html } from "./html.ts";
import { shellPage, type ShellView } from "./panel.ts";

function recruitItem(cfg: Config, r: RecruitRow): Html {
  return html`<li><a href="${armyUrl(cfg, r.host, "/hq")}" target="_blank"><p>
Tu
as
recruté
<strong>${armyTitle(r.name, r.part)}</strong></p>
<p class="extra pp"><span>Gain
:
${r.bounty ?? 0}
<img src="/img/token.png"/></span></p></a></li>`;
}

/**
 * Right column of the history page, from $EX/html/fr/history.html. The combats column and the ClientMode 5
 * recruits animation (`swf_recuits`) are stage 4: left as an empty slot.
 */
export function historyRight(cfg: Config, recruits: readonly RecruitRow[], total: number): Html {
  return html`<table class="log"><tr><td><h2>Historique des Combats</h2>
<ul class="history"></ul>
</td>
<td class="right"><h2>Historique des Recrues</h2>
<ul class="history">${recruits.map((r) => recruitItem(cfg, r))}</ul>
<p>
Tu
as
<strong>${total}</strong>
<img src="/favicon.ico"/>
recrues
dans
ton
armée.
Pour
augmenter
ce
nombre,
<a href="javascript:_.startRecruit()">recrute tes amis !</a></p></td></tr></table>`;
}

export function historyPage(cfg: Config, v: Omit<ShellView, "title" | "right"> & { recruits: readonly RecruitRow[]; total: number }): Html {
  const { recruits, total, ...shell } = v;
  return shellPage(cfg, { ...shell, title: "Historique", right: historyRight(cfg, recruits, total) });
}
