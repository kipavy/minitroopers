import { FACTIONS } from "@mt/game";
import type { Config } from "../config.ts";
import type { RankRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle } from "./army.ts";
import { html, type Html } from "./html.ts";
import { tipH2 } from "./layout.ts";
import { shellPage, type ShellView } from "./panel.ts";

export interface RanksView {
  recruiter: RankRow;
  rows: readonly RankRow[];
  self: RankRow | null;
}

// UNVERIFIED: only "Faction de fol-ecume" (faction 4) is archived; the other factions are labelled the same way, with their host.
const factionLabel = (n: number): string => {
  const f = FACTIONS.find((x) => x.id === n);
  return f ? `Faction de ${f.host}` : "Faction";
};

function line(cfg: Config, r: RankRow, top: boolean): Html {
  const href = armyUrl(cfg, r.host, "/hq");
  const link = top ? html`<img src="/img/top.png"/>
<a href="${href}">${armyTitle(r.name, r.part)}</a>` : html`<a href="${href}" target="_blank">${armyTitle(r.name, r.part)}</a>`;
  return html`<tr${top ? html` class="top"` : ""}><td><div class="faction faction${r.faction}" ${tipH2(factionLabel(r.faction))}></div></td>
<td>${link}</td>
<td>${r.size}</td>
<td>${r.power}</td></tr>`;
}

/** Right column of `/ranks`, from $EX/html/fr/ranks.html: the recruiter first, then its best recruits, then the army itself if it is not among them. */
export function ranksRight(cfg: Config, v: RanksView, host: string): Html {
  const rec = v.recruiter;
  return html`<div class="ranks"><p>
Le
classement
rassemble
les
différentes
armées
recrutées
par
<a href="${armyUrl(cfg, rec.host, "/hq")}" target="_blank">${armyTitle(rec.name, rec.part)}</a> en fonction de leur puissance.</p>
<table><tr><th>Faction</th>
<th>Armée</th>
<th>Effectif</th>
<th>Puissance</th></tr>
${line(cfg, rec, true)}
${v.rows.map((r) => line(cfg, r, false))}${v.self ? line(cfg, v.self, false) : ""}</table>
<a href="${armyUrl(cfg, host, "/hq")}" class="button5">Retour</a></div>`;
}

export function ranksPage(cfg: Config, v: Omit<ShellView, "title" | "right"> & { ranks: RanksView }): Html {
  const { ranks, ...shell } = v;
  return shellPage(cfg, { ...shell, title: "Hiérarchie", right: ranksRight(cfg, ranks, shell.army.host) });
}
