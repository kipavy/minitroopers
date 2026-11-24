import { clientParams, gridData, type BattleTrooperInput } from "@mt/engine";
import type { Config } from "../config.ts";
import type { ArmyRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { esc, html, raw, type Html } from "./html.ts";
import { eventBanner } from "./event.ts";
import { layout, tip } from "./layout.ts";
import { MINI_SWF, jsStr, swfEmbed } from "./swf.ts";

export const MAX_TROOPERS = 12; // Data.XP_LEVELS.length
const GRID_COLS = 3;
const CELL_H = 72;

/** The troopers grid (SWF) with its hover/click script, from the HQ page of the original. */
export function armyGrid(cfg: Config, army: ArmyRow, troopers: readonly BattleTrooperInput[]): Html {
  const host = army.host;
  const add = troopers.length < MAX_TROOPERS;
  const rows = Math.max(1, Math.ceil((troopers.length + (add ? 1 : 0)) / GRID_COLS));
  const data = gridData({ army: troopers.slice(), xmax: GRID_COLS, ymax: rows, add, fac: army.faction, space: -1, action: "on" }, MINI_SWF);
  const tips = [
    ...(add ? ["Ajoute un nouveau trooper à ton armée !"] : [""]),
    ...troopers.map((t) => `Accède aux informations du trooper <strong>${esc(t.name)}</strong>`),
  ];
  // onOver/onOut/onClick are called by the SWF with the trooper id (null for the "add" tile).
  const script = `
var ttips = [
\t${tips.map(jsStr).join("\n\t,")}
];
function onOver(id) {
\t_.showTip('menuTip',ttips[id == null?0:parseInt(id)+1]);
}
function onOut(id) {
\t_.resetTip('menuTip');
}
function onClick(id) {
\tdocument.location = id == null ? ${jsStr(armyUrl(cfg, host, "/add"))} : ${jsStr(armyUrl(cfg, host, "/t/"))}+id;
}
`;
  return html`${swfEmbed({ id: "swf_tr_view", width: 214, height: CELL_H * rows, flashvars: clientParams(data), objId: "tr_view" })}
<script type="text/javascript">${raw(script)}</script>`;
}

const menuBtn = (cls: string, href: string, label: string, tipText: string): Html =>
  html`<div class="but ${cls}"><div class="but_right ${cls}_right"><a href="${href}" class="but_bg ${cls}_bg" onmouseover="${raw(`_.showTip('menuTip',${esc(jsStr(tipText))})`)}" onmouseout="_.resetTip('menuTip')">${label}</a></div></div>
`;

/** Troopers needed for "Gérer mon armée" (RECON4 §3: wiki, archives 6/8/12 shown, 1/2/4 absent). */
export const CHOICE_MIN_TROOPERS = 5;
/** Power needed for "Hiérarchie" (RECON4 §2: archived 20, 24, 39, 75, 98 shown; 16, 14, 11, 10, 7 absent). */
export const RANKS_MIN_POWER = 20;

export interface MenuFlags {
  history: boolean;
  choice: boolean;
  protect: boolean;
  ranks: boolean;
}

/** Which optional entries of the left menu the original shows (RECON4 §5). */
export function menuFlags(p: { power: number; troopers: number; recruits: number; protected: boolean }): MenuFlags {
  return { history: p.recruits >= 1, choice: p.troopers >= CHOICE_MIN_TROOPERS, protect: !p.protected, ranks: p.power >= RANKS_MIN_POWER };
}

/** Flags of an army's menu from what the page already holds. */
export const menuOf = (army: ArmyRow, troopers: readonly BattleTrooperInput[], power: number): MenuFlags =>
  menuFlags({ power, troopers: troopers.length, recruits: army.recruits, protected: army.passwordHash !== null });

/** Password form shown under the troopers panel, instead of the menu, to a visitor of a protected army. */
export function insertPass(cfg: Config, host: string): Html {
  return html`<div class="insertpass"><form method="POST" action="${armyUrl(cfg, host, "/login")}"><input type="hidden" name="login" value="${host}"/>
Mot
de
passe
:
<p><input name="pass" type="password" class="field"/>
<input type="submit" value="Valider" class="button7"/></p></form></div>`;
}

/** First item of `ul.history` under the troopers panel (fr/hq.html, ranks.html, protect-3.html: also to a locked visitor). */
export function newChildItem(cfg: Config, host: string): Html {
  return html`<li class="newchild"><a href="${armyUrl(cfg, host, "/history")}"><p><img src="/img/newrecruit.gif"/> Nouvelle recrue disponible !</p></a></li>`;
}

/** Left menu; `back` adds the "Quartier Général" entry the original shows on every page but the HQ. */
export function armyMenu(cfg: Config, army: ArmyRow, flags: MenuFlags, back = false): Html {
  const u = (p: string): string => armyUrl(cfg, army.host, p);
  return html`
<div class="but b1"><div class="but_right b1_right"><a href="javascript:_.startRecruit()" class="but_bg b1_bg" onmouseover="_.showTip('menuTip','Demande à tes amis de rejoindre ton armée !')" onmouseout="_.resetTip('menuTip')">Recruter un trooper</a></div></div>

${flags.history ? menuBtn("b2", u("/history"), "Historique", "Historique de tes recrues et batailles ciblées !") : ""}
${flags.choice ? menuBtn("b2", u("/choice"), "Gérer mon armée", "Change l'ordre de déploiement de tes troopers") : ""}
${flags.protect ? menuBtn("b3", u("/protect"), "Protéger mon armée", "Protége ton armée avec un mot de passe !") : ""}
${flags.ranks ? menuBtn("b3", u("/ranks"), "Hiérarchie", "Ton classement avec les autres joueurs") : ""}
${back ? menuBtn("b3", u("/hq"), "Quartier Général", "Retourner à la page de lancement des batailles.") : ""}
`;
}

export interface ShellView {
  army: ArmyRow;
  troopers: readonly BattleTrooperInput[];
  power: number;
  /** Text of the `a.company` heading ("Fiche de X", "Ajoute un trooper"…), escaped here. */
  title: string;
  /** Content of the right-hand column. */
  right: Html;
  /** Popup (already built by `notification`). */
  notice?: Html;
  /**
   * Who looks: the owner (troopers panel and menu, default), a visitor of a protected army (troopers panel then the
   * password form, no menu: fr/ranks.html) or of an open one (troopers panel without menu).
   */
  visitor?: "owner" | "locked" | "stranger";
}

/** Frame shared by the trooper sheet, level-up and add pages: money, power, left troopers panel and a right column. */
export function shellPage(cfg: Config, v: ShellView): Html {
  const visitor = v.visitor ?? "owner";
  const left =
    visitor === "owner"
      ? html`${armyGrid(cfg, v.army, v.troopers)}</div>
<div class="clear"></div>

${armyMenu(cfg, v.army, menuOf(v.army, v.troopers, v.power), true)}
</div>`
      : visitor === "locked"
        ? html`${armyGrid(cfg, v.army, v.troopers)}</div>
<div class="clear"></div>



${insertPass(cfg, v.army.host)}
</div>`
        : html`${armyGrid(cfg, v.army, v.troopers)}</div>
<div class="clear"></div>
</div>`;
  const content = html`${v.notice ?? ""}

<div class="home">

<div id="recruit"></div>
<div class="money" ${tip("Crédits", "Tu les gagnes en faisant des batailles. Utilise-les pour améliorer tes troopers !")}>
${v.army.credits}
</div>
<div class="power" ${tip("Puissance", "Représente la puissance totale de l'armée")}>${v.power}</div>

<a href="${armyUrl(cfg, v.army.host, "/hq")}" class="company">${v.title}</a>
<table class="panels"><tr><td class="left"><div class="box1 hq">
<h1 class="hbox">Mes Troopers</h1>
<div class="box1bottom"><div class="box1bg"><div id="trhome">

${left}
<div class="tipbox"><div class="hqtip" style="display:none"><img src="/img/info.png"/>
<span class="label">INFO :</span>
<span id="menuTip"></span></div></div></div></div>
${visitor !== "stranger" && v.army.pendingRecruits > 0 ? html`<ul class="history">${newChildItem(cfg, v.army.host)}
</ul>` : ""}</td>
<td class="right">
${eventBanner(cfg)}
${v.right}

<div class="clear"></div></td></tr></table></div>`;
  return layout(cfg, { title: v.title, content, host: v.army.host, pass: v.army.passwordHash !== null });
}
