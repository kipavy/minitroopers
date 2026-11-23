import { clientParams, gridData, type BattleTrooperInput } from "@mt/engine";
import type { Config } from "../config.ts";
import type { ArmyRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle, notification } from "./army.ts";
import { esc, html, raw, type Html } from "./html.ts";
import { shellPage } from "./panel.ts";
import { MINI_SWF, swfEmbed } from "./swf.ts";

export interface OppFoe {
  /** Opponent id of the daily list (army id or filler id), sent back as `opp=`. */
  ref: string;
  /** "L'armée de X" (plain text). */
  title: string;
  power: number;
  faction: number;
  troopers: BattleTrooperInput[];
}

export interface OppView {
  army: ArmyRow;
  troopers: readonly BattleTrooperInput[];
  power: number;
  foes: OppFoe[];
  /** Session key (anti-CSRF `chk`). */
  key: string;
  /** Battles already fought today: binds the action URLs, so a replayed one fights nothing. */
  used: number;
  error?: string;
}

const GRID_COLS = 4;
const CELL_H = 72;

/** The power tooltip of the original list (`<h2>Puissance</h2>` only). */
const POWER_TIP = raw(
  `onmouseover="mt.js.Tip.show(this,'${esc("<div class=\\'tiptop\\'><div class=\\'tipbottom\\'><div class=\\'tipbg\\'><div class=\\'tipcontent\\'><img src=\\'/img/pixel.gif\\' class=\\'pixel\\' /><h2>Puissance</h2></div></div></div>")}')" onmouseout="mt.js.Tip.hide()"`,
);

function foeCell(cfg: Config, v: OppView, f: OppFoe, i: number): Html {
  // UNVERIFIED: the archived lists show 1-row (285x72, size1) and 2-row (285x144, size2) grids; rows = ceil(n/4).
  const rows = Math.max(1, Math.ceil(f.troopers.length / GRID_COLS));
  const data = gridData({ army: f.troopers, xmax: GRID_COLS, ymax: rows, add: false, fac: f.faction, space: -1, action: null }, MINI_SWF);
  const attack = armyUrl(cfg, v.army.host, `/b/battle?opp=${encodeURIComponent(f.ref)};n=${v.used};chk=${v.key}`);
  return html`<td class="choosetd size${rows}"><div class="backchoose"><div class="troopers">${swfEmbed({ id: `swf_opp_${i}`, width: 285, height: CELL_H * rows, flashvars: clientParams(data), objId: `opp_${i}` })}</div>
<div class="clear"></div>
<a href="${attack}" class="button5" onclick="return confirm('Confirmer cette action ?')">Attaquer !</a>
<h1>${f.title}</h1>
<ul class="carac"><li class="po"><img src="/img/powers.png" ${POWER_TIP}/>
${f.power}</li></ul></div></td>
`;
}

function mateCell(cfg: Config, v: OppView): Html {
  return html`<td class="choosetd mate"><div class="backchoose"><h1>Infiltre la base d'une armée de ton choix :</h1>
<form action="${armyUrl(cfg, v.army.host, "/b/battle")}" id="friends" method="POST"><input name="chk" type="hidden" value="${v.key}"/><input name="n" type="hidden" value="${v.used}"/>
<input name="friend" class="field"/></form>
<a href="#" onclick="if( confirm('Confirmer cette action ?') ) $('#friends').submit()" class="button5">Infiltrer !</a></div></td>
`;
}

/** The opponents page, from $EX/html/fr/b_opp.html: 5 opponents and the attack-by-name form, two cells per row. */
export function oppPage(cfg: Config, v: OppView): Html {
  const cells = v.foes.map((f, i) => foeCell(cfg, v, f, i));
  cells.splice(Math.min(1, cells.length), 0, mateCell(cfg, v));
  const rows: Html[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(html`<tr>
${cells.slice(i, i + 2)}</tr>`);
  const right = html`<table class="choose">${rows}</table>
`;
  return shellPage(cfg, {
    army: v.army,
    troopers: v.troopers,
    power: v.power,
    title: armyTitle(v.army.name, v.army.part),
    right,
    ...(v.error ? { notice: notification(v.error, true) } : {}),
  });
}
