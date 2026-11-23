import { Data, clientParams, trooperData, type BattleTrooperInput } from "@mt/engine";
import tips from "../../data/tips.fr.json" with { type: "json" };
import type { Config } from "../config.ts";
import type { ArmyRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { notification } from "./army.ts";
import { esc, html, raw, type Html } from "./html.ts";
import { shellPage } from "./panel.ts";
import { MINI_SWF, jsStr, swfEmbed } from "./swf.ts";
import { skillIconStyle } from "./tips.ts";

const TIPS: Readonly<Record<string, { title: string; body: string }>> = tips;

export interface LevelUpView {
  army: ArmyRow;
  troopers: readonly BattleTrooperInput[];
  power: number;
  slot: number;
  trooper: BattleTrooperInput;
  /** Level the trooper reaches with this choice. */
  level: number;
  /** `levelUpOptions.shown`. */
  options: readonly number[];
  key: string;
  /** Choices the trooper has now: the level the choice links are bound to. */
  choices: number;
  error?: string;
}

function box(cfg: Config, v: LevelUpView, skill: number): Html {
  const url = armyUrl(cfg, v.army.host, `/levelup/${v.slot}?skill=${skill}&chk=${v.key}&lv=${v.choices}`);
  const onclick = esc(`if( confirm('Confirmer cette action ?') ) document.location = ${jsStr(url)}`);
  const t = TIPS[String(skill)];
  const desc = t ? raw(`<div class="s">${t.body.replaceAll("{name}", esc(v.trooper.name))}</div>`) : "";
  return html`<div class="box8" onclick="${raw(onclick)}"><div class="levelskill" style="${skillIconStyle(skill)}"></div>

<h2>${Data.skillRow(skill).name}</h2>
${desc}</div>
`;
}

/** Level-up page, from $EX/html/fr/levelup_0.html (2 boxes, 3 with MALIN: `levelup2.png`..`levelup4.png`). */
export function levelUpPage(cfg: Config, v: LevelUpView): Html {
  const flashvars = clientParams(trooperData(v.trooper, v.army.faction, MINI_SWF));
  const right = html`<div class="cache"><img src="/img/box8_over.png"/></div>
<p>${v.trooper.name}
est passé au niveau
${v.level} ! Choisis une nouvelle compétence à lui apprendre parmi celles proposées ci-dessous :</p>
<table class="levelup"><tr><td>
${swfEmbed({ id: `swf_showtr_${v.slot}`, width: 72, height: 72, flashvars, objId: `showtr_${v.slot}` })}
<div class="up"></div></td>
<td><div class="levelup${v.options.length}"></div></td>
<td class="boxes">
${v.options.map((s) => box(cfg, v, s))}</td></tr></table>`;
  return shellPage(cfg, { army: v.army, troopers: v.troopers, power: v.power, title: "Choisir une compétence", right, ...(v.error ? { notice: notification(v.error, true) } : {}) });
}

export interface LevelUpNotice {
  trooper: string;
  level: number;
  skill: number;
}

/** HQ popup text after a choice (from hq-levelup.html). */
export const levelUpNoticeText = (n: LevelUpNotice): Html =>
  html`Félicitations ! Ton trooper <b>${n.trooper}</b> a atteint le niveau <b>${n.level}</b> et a appris la compétence <b>${Data.skillRow(n.skill).name}</b> !`;

/** The popup body for the stored notices (JSON written by the level-up route), or null when there is none. Malformed rows are skipped. */
export function notices(rows: readonly unknown[]): Html | null {
  const items = rows.flatMap((r) => {
    const n = r as Partial<LevelUpNotice> | null;
    return n && typeof n.trooper === "string" && Number.isInteger(n.level) && Number.isInteger(n.skill) && Data.SKILL[n.skill as number]
      ? [levelUpNoticeText(n as LevelUpNotice)]
      : [];
  });
  return items.length === 0 ? null : html`${items.flatMap((t, i) => (i === 0 ? [t] : [raw("<br/>"), t]))}`;
}
