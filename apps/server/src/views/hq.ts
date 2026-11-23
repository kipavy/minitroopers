import { clientParams, gridData, type BattleTrooperInput } from "@mt/engine";
import type { Config } from "../config.ts";
import type { ArmyRow, DayBattle } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { absoluteArmyUrl, armyTitle, notification } from "./army.ts";
import { esc, html, raw, type Html } from "./html.ts";
import { layout, tip } from "./layout.ts";
import { MINI_SWF, jsStr, swfEmbed } from "./swf.ts";

export const MAX_TROOPERS = 12; // Data.XP_LEVELS.length
const GRID_COLS = 3;
const CELL_H = 72;

export interface HqView {
  army: ArmyRow;
  /** Troopers in slot order, as the client SWF sees them. */
  troopers: BattleTrooperInput[];
  power: number;
  /** Battles of the day already fought (oldest first) and the day's total allowance. */
  battles: DayBattle[];
  battleTotal: number;
  /** Seconds until the daily reset. */
  resetIn: number;
  /** What the next recruit through this army's link pays. */
  nextBounty: number;
  /** `?money=N`: the counter animates from credits-N up to credits (`_.deltaMoney`). */
  moneyDelta: number;
  /** Popup message (plain text, e.g. level-up congratulations), or null. */
  notice: Html | string | null;
  /** Protected army seen without the password: password form instead of the menu, no actions. */
  locked: boolean;
  /** Error shown with the locked view (wrong password). */
  lockError?: string;
}

const BG = (name: string): string => `style="background-image : url('/img/mode/${name}.jpg')"`;

function grid(cfg: Config, v: HqView): Html {
  const host = v.army.host;
  const add = v.troopers.length < MAX_TROOPERS;
  const rows = Math.max(1, Math.ceil((v.troopers.length + (add ? 1 : 0)) / GRID_COLS));
  const data = gridData(
    { army: v.troopers, xmax: GRID_COLS, ymax: rows, add, fac: v.army.faction, space: -1, action: "on" },
    MINI_SWF,
  );
  const tips = [
    ...(add ? ["Ajoute un nouveau trooper à ton armée !"] : [""]),
    ...v.troopers.map((t) => `Accède aux informations du trooper <strong>${esc(t.name)}</strong>`),
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

function menu(cfg: Config, v: HqView): Html {
  const u = (p: string): string => armyUrl(cfg, v.army.host, p);
  return html`
<div class="but b1"><div class="but_right b1_right"><a href="javascript:_.startRecruit()" class="but_bg b1_bg" onmouseover="_.showTip('menuTip','Demande à tes amis de rejoindre ton armée !')" onmouseout="_.resetTip('menuTip')">Recruter un trooper</a></div></div>

${menuBtn("b2", u("/history"), "Historique", "Historique de tes recrues et batailles ciblées !")}
${menuBtn("b2", u("/choice"), "Gérer mon armée", "Change l'ordre de déploiement de tes troopers")}
${v.army.passwordHash === null ? menuBtn("b3", u("/protect"), "Protéger mon armée", "Protége ton armée avec un mot de passe !") : ""}
${menuBtn("b3", u("/ranks"), "Hiérarchie", "Ton classement avec les autres joueurs")}
`;
}

function insertPass(cfg: Config, v: HqView): Html {
  return html`<div class="insertpass"><form method="POST" action="${armyUrl(cfg, v.army.host, "/login")}"><input type="hidden" name="login" value="${v.army.host}"/>
Mot
de
passe
:
<p><input name="pass" type="password" class="field"/>
<input type="submit" value="Valider" class="button7"/></p></form></div>`;
}

function tile(cfg: Config, v: HqView, i: number): Html {
  const done = v.battles[i];
  if (done) {
    const k = done.win ? "bwin" : "bdefeat";
    const text = done.win ? "Tu as remporté cette bataille !" : "Tu as perdu cette bataille !";
    return html`<div class="b ${k}"><div class="b_right ${k}_right"><a href="${armyUrl(cfg, v.army.host, `/b/view/bat${done.n}`)}" class="b_bg ${k}_bg" onmouseover="_.showTip('bat_tip','${text}')" onmouseout="_.resetTip('bat_tip')"><img src="/img/${k}.gif"/></a></div></div>
`;
  }
  return html`<div class="b bgo2"><div class="b_right bgo2_right"><a href="${armyUrl(cfg, v.army.host, "/b/opp")}" class="b_bg bgo2_bg" onmouseover="_.showTip('bat_tip','Lance une bataille !')" onmouseout="_.resetTip('bat_tip')"><img src="/img/bgo2.gif"/></a></div></div>
`;
}

function battleBox(cfg: Config, v: HqView): Html {
  if (v.locked) {
    return html`<div class="box2"><div class="box2bg" ${raw(BG("garden"))}><h1 class="hbox">Bataille</h1>
<div class="box2bottom"><div class="action bcount0">
<div class="hqtip"><img src="/img/info.png"/>
<span>Cette armée est protégée. Identifie-toi sur la gauche.</span></div>
</div></div></div></div>`;
  }
  const count = Math.max(v.battleTotal, v.battles.length);
  const left = Math.max(0, v.battleTotal - v.battles.length);
  const tiles = Array.from({ length: count }, (_, i) => tile(cfg, v, i));
  const tipText = left === 0 ? "Tu as terminé tes batailles du jour !" : `Il te reste ${left} ${left > 1 ? "batailles" : "bataille"} aujourd'hui !`;
  return html`<div class="box2"><div class="box2bg" ${raw(BG("garden"))}><h1 class="hbox">Bataille</h1>
<div class="box2bottom"><div class="action bcount${count}">

${tiles}
<div class="hqtip"><img src="/img/info.png"/>
<span id="bat_tip">${tipText}</span></div>
</div></div></div></div>`;
}

/** Countdown to the daily reset, as the original prints it in the mission box ("Nouvelle mission dans" + chrono). */
function resetTimer(seconds: number): Html {
  const base = Date.UTC(2000, 0, 1);
  const fmt = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  return html`<div class="hqtip"><img src="/img/info.png"/>
<span id="miss_tip">Nouvelle mission dans
<img src="/img/anim_small_chrono.gif"/>
<script type="text/javascript">
	mt.js.Timer.TIMES="jhms";
	mt.js.Timer.alloc('${raw(fmt(base))}','${raw(fmt(base + Math.max(0, seconds) * 1000))}',2,null);</script>
</span></div>
`;
}

const soonBox = (title: string, bg: string, timer: Html | "" = ""): Html => html`<div class="box2"><div class="box2bg" ${raw(BG(bg))}><h1 class="hbox">${title}</h1>
<div class="box2bottom"><div class="action bcount0">
<div class="hqtip"><img src="/img/info.png"/>
<span>Bientôt disponible !</span></div>
${timer}</div></div></div></div>
`;

function recruitBox(cfg: Config, v: HqView): Html {
  const link = absoluteArmyUrl(cfg, v.army.host, "/");
  return html`<div class="box10"><p>
Passe ton lien à tes amis pour recruter !

Ta prochaine recrue te rapportera ${v.nextBounty}
<img src="/img/token.png"/>
</p>
<ul class="social"><li><input onclick="$(this).select()" readonly="readonly" value="${link}" class="field"/></li></ul></div>`;
}

/** The HQ page, from $EX/html/fr/hq-levelup.html (logged in) and hq.html (protected). Ads, promos and social widgets left out. */
export function hqPage(cfg: Config, v: HqView): Html {
  const a = v.army;
  const title = armyTitle(a.name, a.part);
  const shownMoney = v.moneyDelta > 0 ? Math.max(0, a.credits - v.moneyDelta) : a.credits;
  const notice = v.locked ? (v.lockError ? notification(v.lockError, true) : "") : v.notice ? notification(v.notice) : "";
  const left = v.locked
    ? html`${insertPass(cfg, v)}
</div>`
    : html`${grid(cfg, v)}</div>
<div class="clear"></div>
${menu(cfg, v)}`;
  const content = html`${notice}

<div class="home">

<div id="recruit"></div>
<div class="money" ${tip("Crédits", "Tu les gagnes en faisant des batailles. Utilise-les pour améliorer tes troopers !")}>
<span id="targetMoney">${shownMoney}</span>
</div>
<div class="power" ${tip("Puissance", "Représente la puissance totale de l'armée")}>${v.power}</div>
${v.moneyDelta > 0 ? html`<script type="text/javascript">_.deltaMoney(${v.moneyDelta})</script>` : ""}

<a href="${armyUrl(cfg, a.host, "/hq")}" class="company">${title}</a>
<table class="panels"><tr><td class="left"><div class="box1 hq">
<h1 class="hbox">Mes Troopers</h1>
<div class="box1bottom"><div class="box1bg"><div id="trhome">

${left}
</div>
<div class="tipbox"><div class="hqtip" style="display:none"><img src="/img/info.png"/>
<span class="label">INFO :</span>
<span id="menuTip"></span></div></div></div></div>
</td>
<td class="right">

${battleBox(cfg, v)}

${soonBox("Mission : Infiltrer", "sewer", resetTimer(v.resetIn))}
${soonBox("Raid", "wood")}
${recruitBox(cfg, v)}

<div class="clear"></div></td></tr></table></div>`;
  return layout(cfg, { title, content, host: a.host });
}

/** The "Recruter un ami" popup fragment (`GET /recruit`, injected in #recruit by `_.startRecruit()`). */
export function recruitFragment(cfg: Config, army: ArmyRow, nextBounty: number): Html {
  const link = absoluteArmyUrl(cfg, army.host, "/");
  return html`<div class="black"></div>
<div class="popup"><div class="box7top"><a href="#" class="close" onclick="$('#recruit').html(''); $('body').removeClass('hideSwf')"><img src="/img/pixel.gif"/></a>
<h1>Recruter un ami</h1>
<div class="box7bottom"><div class="box7bg"><table class="contrecruit"><tr><td><img src="/img/art_recruit.png"/></td>
<td class="right"><p>
Donne l'adresse de ton armée à tes amis pour avoir <strong>encore plus de
<img src="/img/token.png"/></strong> et améliorer ton armée !</p>
<div class="mylink"><input value="${link}" readonly="readonly" class="field" onclick="$(this).select()"/></div>
<div class="clear"></div>

<p>
Lorsqu'un de tes amis créera son armée, tu gagneras ${nextBounty}
<img src="/img/token.png"/>
</p>
</td></tr></table></div></div></div></div>`;
}
