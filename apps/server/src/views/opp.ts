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

/** One opponent of the list: its grid, the action button (`href`, `label`, confirmed unless `confirm` is false), its title and power. Shared with /b/train. */
export function foeCell(f: OppFoe, i: number, href: string, label: string, confirm = true): Html {
  // UNVERIFIED: the archived lists show 1-row (285x72, size1) and 2-row (285x144, size2) grids; rows = ceil(n/4).
  const rows = Math.max(1, Math.ceil(f.troopers.length / GRID_COLS));
  const data = gridData({ army: f.troopers, xmax: GRID_COLS, ymax: rows, add: false, fac: f.faction, space: -1, action: null }, MINI_SWF);
  return html`<td class="choosetd size${rows}"><div class="backchoose"><div class="troopers">${swfEmbed({ id: `swf_opp_${i}`, width: 285, height: CELL_H * rows, flashvars: clientParams(data), objId: `opp_${i}` })}</div>
<div class="clear"></div>
${confirm ? html`<a href="${href}" class="button5" onclick="return confirm('Confirmer cette action ?')">${label}</a>` : html`<a href="${href}" class="button5">${label}</a>`}
<h1>${f.title}</h1>
<ul class="carac"><li class="po"><img src="/img/powers.png" ${POWER_TIP}/>
${f.power}</li></ul></div></td>
`;
}

/** The by-name form cell ("… l'armée de ton choix"), shared with /b/train: `hidden` inputs, confirmed unless `confirm` is false. */
export function mateCell(o: { action: string; heading: Html; button: string; hidden: Html; confirm: boolean }): Html {
  const submit = o.confirm
    ? html`<a href="#" onclick="if( confirm('Confirmer cette action ?') ) $('#friends').submit()" class="button5">${o.button}</a>`
    : html`<a href="#" onclick="$('#friends').submit(); return false" class="button5">${o.button}</a>`;
  return html`<td class="choosetd mate"><div class="backchoose"><h1>${o.heading}</h1>
<form action="${o.action}" id="friends" method="POST">${o.hidden}
<input name="friend" class="field"/></form>
${submit}</div></td>
`;
}

/** The opponents table (b_opp.html), shared with /b/train: the by-name cell second, two cells per row. */
export function chooseTable(cells: Html[], mate: Html): Html {
  const all = [...cells];
  all.splice(Math.min(1, all.length), 0, mate);
  const rows: Html[] = [];
  for (let i = 0; i < all.length; i += 2) rows.push(html`<tr>
${all.slice(i, i + 2)}</tr>`);
  return html`<table class="choose">${rows}</table>`;
}

/** The opponents page, from $EX/html/fr/b_opp.html: 5 opponents and the attack-by-name form, two cells per row. */
export function oppPage(cfg: Config, v: OppView): Html {
  const cells = v.foes.map((f, i) => foeCell(f, i, armyUrl(cfg, v.army.host, `/b/battle?opp=${encodeURIComponent(f.ref)};n=${v.used};chk=${v.key}`), "Attaquer !"));
  const mate = mateCell({
    action: armyUrl(cfg, v.army.host, "/b/battle"),
    heading: html`Infiltre la base d'une armée de ton choix :`,
    button: "Infiltrer !",
    hidden: html`<input name="chk" type="hidden" value="${v.key}"/><input name="n" type="hidden" value="${v.used}"/>`,
    confirm: true,
  });
  const right = html`${chooseTable(cells, mate)}
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
