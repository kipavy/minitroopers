import type { BattleTrooperInput } from "@mt/engine";
import { MISSION_ATTEMPTS, MISSION_UNLOCK_COST, type MissionType } from "@mt/game";
import type { Config } from "../config.ts";
import type { ArmyRow, DayBattle, DefenseRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { absoluteArmyUrl, armyTitle, notification } from "./army.ts";
import { BG, esc, html, jsq, raw, type Html } from "./html.ts";
import { eventBanner } from "./event.ts";
import { layout, tip } from "./layout.ts";
import { jsStr } from "./swf.ts";
import { armyGrid, armyMenu, insertPass, menuOf, newChildItem } from "./panel.ts";
import { missionBox } from "./mission.ts";
import { defenseItem } from "./history.ts";

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
  /** Recruits waiting for their confirmation on /history. */
  pendingRecruits?: number;
  /** The last battle the army defended by infiltration (fr/hq-levelup.html: one item only), and the time it is seen at. */
  lastDefense?: { row: DefenseRow; now: number } | null;
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
  /** The mission of the day (box title, unlock, tries) and the session key of its action links. */
  mission: { type: MissionType; unlocked: boolean; tries: DayBattle[]; next: number; key: string };
  /**
   * Today's raid: phase to fight (or last fought once over), URL counter of its link (`RaidDay.step`), living recruits,
   * outcome of the last phase once over.
   */
  raid: { phase: number; step: number; alive: number; over: boolean; lastWin: boolean; key: string };
}

function tile(cfg: Config, v: HqView, i: number): Html {
  const done = v.battles[i];
  if (done) {
    const k = done.win ? "bwin" : "bdefeat";
    const text = done.win ? "Tu as remporté cette bataille !" : "Tu as perdu cette bataille !";
    return html`<div class="b ${k}"><div class="b_right ${k}_right"><a href="${armyUrl(cfg, v.army.host, `/b/view/bat${done.n}`)}" class="b_bg ${k}_bg" onmouseover="_.showTip('bat_tip','${jsq(text)}')" onmouseout="_.resetTip('bat_tip')"><img src="/img/${k}.gif"/></a></div></div>
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
  const train = html`<a href="${armyUrl(cfg, v.army.host, "/b/train")}" class="train-link" ${tip("Entraînement", "Combats illimités pour le plaisir : ils ne rapportent rien et ne comptent pas dans tes batailles du jour.")}>» S'entraîner (illimité)</a>`;
  return html`<div class="box2"><div class="box2bg" ${raw(BG("garden"))}><h1 class="hbox">Bataille</h1>
<div class="box2bottom"><div class="action bcount${count}">

${tiles}
<div class="hqtip">${train}<img src="/img/info.png"/>
<span id="bat_tip">${tipText}</span></div>
</div></div></div></div>`;
}

/** The chrono itself (image and `mt.js.Timer`): `seconds` left, shown from a fixed base date. */
export function chrono(seconds: number): Html {
  const base = Date.UTC(2000, 0, 1);
  const fmt = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  return html`<img src="/img/anim_small_chrono.gif"/>
<script type="text/javascript">
	mt.js.Timer.TIMES="jhms";
	mt.js.Timer.alloc('${raw(fmt(base))}','${raw(fmt(base + Math.max(0, seconds) * 1000))}',2,null);</script>`;
}

/** Countdown to the daily reset, as the original prints it in the mission box ("Nouvelle mission dans" + chrono). */
export function resetTimer(seconds: number, id = "miss_tip", label = "Nouvelle mission dans"): Html {
  return html`<div class="hqtip"><img src="/img/info.png"/>
<span id="${id}">${label}
${chrono(seconds)}
</span></div>
`;
}

const RCOUNT_TIP = "Pour chaque armée que tu recrutes, son premier trooper sera disponible pour le Raid jusqu'à ce qu'il soit tué en combat ! ";

/**
 * The raid box, from $EX/html/fr/hq-levelup.html (`.rcount` with its "Recrues Disponibles" tooltip, `bgo` tile, hqtip)
 * and com/hq.html ("Raid Phase 2" once phase 1 is won; protected: empty `bcount1` action).
 */
function raidBox(cfg: Config, v: HqView): Html {
  const r = v.raid;
  const title = r.phase > 1 ? `Raid Phase ${r.phase}` : "Raid";
  const frame = (count: number, inner: Html): Html => html`<div class="box2"><div class="box2bg" ${raw(BG("wood"))}><h1 class="hbox">${title}</h1>
<div class="box2bottom"><div class="action bcount${count}">${inner}</div></div></div></div>
`;
  if (v.locked) return frame(1, html``);
  if (!r.over && r.alive === 0) {
    // UNVERIFIED: the box of an army without recruits was never archived (text of our own).
    return frame(0, html`
<div class="hqtip"><img src="/img/info.png"/>
<span id="raid_tip">Recrute tes amis pour lancer un raid !</span></div>
`);
  }
  const rcount = html`<div class="rcount" ${tip("Recrues Disponibles", RCOUNT_TIP)}>${r.alive}
<img src="/favicon.ico"/></div>

`;
  if (r.over) {
    // UNVERIFIED: the box after the day's raid was never archived; built like the mission box ("Nouveau raid dans" + chrono).
    const k = r.lastWin ? "bwin" : "bdefeat";
    const text = r.lastWin ? "Tu as remporté le raid !" : "Ce combat s'est soldé par un échec !";
    return frame(1, html`
${rcount}
<div class="b ${k}"><div class="b_right ${k}_right"><a href="${armyUrl(cfg, v.army.host, "/b/view/raid")}" class="b_bg ${k}_bg" onmouseover="_.showTip('raid_tip','${jsq(text)}')" onmouseout="_.resetTip('raid_tip')"><img src="/img/${k}.gif"/></a></div></div>
${resetTimer(v.resetIn, "raid_tip", "Nouveau raid dans")}`);
  }
  return frame(1, html`
${rcount}
<div class="b bgo"><div class="b_right bgo_right"><a href="${armyUrl(cfg, v.army.host, `/b/raid?phase=${r.step};chk=${r.key}`)}" class="b_bg bgo_bg" onmouseover="_.showTip('raid_tip','${jsq(`Lancer un raid avec les ${r.alive} recrues encore vivantes !`)}')" onmouseout="_.resetTip('raid_tip')"><img src="/img/bgo.gif"/></a></div></div>
<div class="hqtip"><img src="/img/info.png"/>
<span id="raid_tip">Encore ${r.alive} recrues disponibles pour le raid !</span></div>
`);
}

/**
 * Empty, hidden stand-in for the ad `.box3` that both originals put right after the raid box (row 2, right of it):
 * it keeps the grid of fr/hq.html, so the recruit box lands in row 3 on the left instead of floating into that slot
 * 18 px off (`.box10` has a left margin, `.box3` none).
 */
const AD_SLOT = raw(`<div class="box3" style="visibility:hidden"></div>`);

function recruitBox(cfg: Config, v: HqView): Html {
  const link = absoluteArmyUrl(cfg, v.army.host, "/");
  return html`<div class="box10"><p>
Passe ton lien à tes amis pour recruter !

Ta prochaine recrue te rapportera ${v.nextBounty}
<img src="/img/token.png"/>
</p>
<ul class="social"><li><input onclick="$(this).select()" readonly="readonly" value="${link}" class="field"/></li></ul></div>`;
}

/**
 * `ul.history` under the troopers panel: the "Nouvelle recrue disponible !" item, then the last defence only
 * (fr/hq.html, protected: both, the item linking to /history like the owner's; fr/hq-levelup.html: the defence alone).
 * Absent when both are.
 */
function historyList(cfg: Config, v: HqView): Html | "" {
  const host = v.army.host;
  const child = (v.pendingRecruits ?? 0) > 0;
  // UNVERIFIED: the last defence is also shown to a visitor without the password (public `/b/fview/<id>` link);
  // fr/hq.html (protected view) shows it, but it is the only protected HQ archived.
  const d = v.lastDefense ?? null;
  if (!child && d === null) return "";
  return html`<ul class="history">${child ? newChildItem(cfg, host) : ""}${
    d === null ? "" : html`


${defenseItem(cfg, host, d.row, d.now)}

`
  }</ul>`;
}

/** The HQ page, from $EX/html/fr/hq-levelup.html (logged in) and hq.html (protected). Ads, promos and social widgets left out. */
export function hqPage(cfg: Config, v: HqView): Html {
  const a = v.army;
  const title = armyTitle(a.name, a.part);
  const shownMoney = v.moneyDelta > 0 ? Math.max(0, a.credits - v.moneyDelta) : a.credits;
  const notice = v.locked ? (v.lockError ? notification(v.lockError, true) : "") : v.notice ? notification(v.notice) : "";
  // fr/hq.html (protected): the troopers grid, then the password form in place of the menu.
  const left = v.locked
    ? html`${armyGrid(cfg, v.army, v.troopers)}</div>
<div class="clear"></div>



${insertPass(cfg, v.army.host)}`
    : html`${armyGrid(cfg, v.army, v.troopers)}</div>
<div class="clear"></div>
${armyMenu(cfg, v.army, menuOf(v.army, v.troopers, v.power))}`;
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
${historyList(cfg, v)}
</td>
<td class="right">
${eventBanner(cfg)}
${battleBox(cfg, v)}

${missionBox(cfg, { host: a.host, locked: v.locked, attempts: MISSION_ATTEMPTS, unlockCost: MISSION_UNLOCK_COST, timer: resetTimer(v.resetIn), ...v.mission })}
${raidBox(cfg, v)}
${AD_SLOT}
${recruitBox(cfg, v)}

<div class="clear"></div></td></tr></table></div>`;
  return layout(cfg, { title, content, host: a.host, pass: a.passwordHash !== null });
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
