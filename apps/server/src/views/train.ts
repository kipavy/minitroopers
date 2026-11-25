import type { BattleTrooperInput } from "@mt/engine";
import type { Config } from "../config.ts";
import type { ArmyRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { notification } from "./army.ts";
import { html, type Html } from "./html.ts";
import { chooseTable, factionBox, foeCell, mateCell, type OppFoe } from "./opp.ts";
import { shellPage } from "./panel.ts";

/** One stored training of the army, for the "recent trainings" list. */
export interface TrainingItem {
  id: number;
  /** "L'armée de X" of the opponent (plain text). */
  opponent: string;
  won: boolean;
}

export interface TrainView {
  army: ArmyRow;
  troopers: readonly BattleTrooperInput[];
  power: number;
  foes: OppFoe[];
  /** Session key (anti-CSRF `chk`). */
  key: string;
  recent: TrainingItem[];
  error?: string;
}

function recentList(cfg: Config, v: TrainView): Html | "" {
  if (v.recent.length === 0) return "";
  const items = v.recent.map(
    (t) => html`<li class="${t.won ? "win" : "defeat"}"><a href="${armyUrl(cfg, v.army.host, `/b/tview/${t.id}`)}">${t.won ? "Victoire" : "Défaite"} contre ${t.opponent}</a></li>
`,
  );
  return html`<div class="train-recent"><h2>Tes derniers entraînements</h2>
<ul>${items}</ul></div>
`;
}

/**
 * The training page (/b/train): like the opponents page (b_opp.html), with unlimited fights that count nowhere, a new
 * draw at each visit ("Autres adversaires"), the by-name form and the army's last trainings.
 */
export function trainPage(cfg: Config, v: TrainView): Html {
  const fight = (ref: string): string => armyUrl(cfg, v.army.host, `/b/train/fight?opp=${encodeURIComponent(ref)};chk=${v.key}`);
  const cells = v.foes.map((f, i) => foeCell(f, i, fight(f.ref), "S'entraîner !", false));
  const mate = mateCell({
    action: armyUrl(cfg, v.army.host, "/b/train/fight"),
    heading: html`Affronte l'armée de ton choix :`,
    button: "Affronter !",
    hidden: html`<input name="chk" type="hidden" value="${v.key}"/>`,
    confirm: false,
    extra: factionBox((h) => armyUrl(cfg, v.army.host, `/b/train/fight?friend=${h};chk=${v.key}`), false),
  });
  const right = html`<div class="train"><div class="train-head"><p>Combats illimités pour le plaisir : ils ne rapportent rien et ne comptent pas dans tes batailles du jour.</p>
<div class="but b3"><div class="but_right b3_right"><a class="but_bg b3_bg" href="${armyUrl(cfg, v.army.host, "/b/train")}">Autres adversaires</a></div></div></div>
${chooseTable(cells, mate)}
${recentList(cfg, v)}</div>`;
  return shellPage(cfg, {
    duo: true,
    army: v.army,
    troopers: v.troopers,
    power: v.power,
    title: "Entraînement",
    right,
    ...(v.error ? { notice: notification(v.error, true) } : {}),
  });
}
