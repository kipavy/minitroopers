import type { Config } from "../config.ts";
import { dayDate, historyDate } from "../dates.ts";
import type { DefenseRow, RecruitRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle } from "./army.ts";
import { html, type Html } from "./html.ts";
import { shellPage, type ShellView } from "./panel.ts";
import { swfEmbed } from "./swf.ts";

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
 * One battle the army defended (`li.win|defeat`, from $EX/html/fr/history.html and hq-levelup.html), linked to its
 * replay on the defender's host. Won/lost from the defender's side; a deleted attacker reads "L'armée inconnue".
 */
export function defenseItem(cfg: Config, host: string, d: DefenseRow, now: number): Html {
  const k = d.won ? "win" : "defeat";
  // UNVERIFIED: a battle stored before `battles.created_at` (migration 006) has no time: "Le <j> <mois>" of its day.
  const date = d.createdAt === null ? dayDate(d.day) : historyDate(d.createdAt, now, cfg.tzGame);
  return html`<li class="${k}"><a href="${armyUrl(cfg, host, `/b/fview/${d.id}`)}"><p><em><img src="/img/${k}.png"/>
${d.won ? "Victoire" : "Défaite"}</em>
contre
<strong>${d.attacker ? armyTitle(d.attacker.name, d.attacker.part) : "L'armée inconnue"}</strong></p>
<p class="extra"><span>${date}</span></p></a></li>`;
}

export interface HistoryView {
  /** Host of the army whose history this is. */
  host: string;
  /** Battles it defended by infiltration, newest first (at most 10). */
  defenses: readonly DefenseRow[];
  now: number;
  recruits: readonly RecruitRow[];
  total: number;
  /** Flashvars of the recruits animation (ClientMode 5), null without a confirmed recruit. */
  animation: string | null;
}

/**
 * Right column of the history page, from $EX/html/fr/history.html (animation, battles, recruits) and
 * $S3/03602485362_history.html (no defence: the text right under the `<h2>`, no `<ul>`).
 */
export function historyRight(cfg: Config, v: HistoryView): Html {
  const anim = v.animation === null ? "" : html`${swfEmbed({ id: "swf_recuits", width: 670, height: 240, flashvars: v.animation, objId: "recuits", opaque: true })}

`;
  const battles =
    v.defenses.length === 0
      ? html`

<p>Aucune armée adverse ne t'a encore attaquée via l'infiltration du mode Bataille.</p>`
      : html`
<ul class="history">${v.defenses.map((d) => defenseItem(cfg, v.host, d, v.now))}</ul>
`;
  return html`${anim}<table class="log"><tr><td><h2>Historique des Combats</h2>${battles}</td>
<td class="right"><h2>Historique des Recrues</h2>
<ul class="history">${v.recruits.map((r) => recruitItem(cfg, r))}</ul>
<p>
Tu
as
<strong>${v.total}</strong>
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

export function historyPage(cfg: Config, v: Omit<ShellView, "title" | "right"> & Omit<HistoryView, "host">): Html {
  const { defenses, now, recruits, total, animation, ...shell } = v;
  return shellPage(cfg, { ...shell, title: "Historique", right: historyRight(cfg, { host: shell.army.host, defenses, now, recruits, total, animation }) });
}
