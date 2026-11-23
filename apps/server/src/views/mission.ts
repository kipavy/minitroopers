import type { MissionType } from "@mt/game";
import type { Config } from "../config.ts";
import type { DayBattle } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { html, jsq, raw, type Html } from "./html.ts";

/** Box title ("Mission : Infiltrer", sitemap) and background (/img/mode/<bg>.jpg) of each mission type (RECON3 §4). */
export const MISSION_BOX: Record<MissionType, { title: string; bg: string }> = {
  exterminate: { title: "Mission : Exterminer", bg: "attic" },
  infiltrate: { title: "Mission : Infiltrer", bg: "sewer" },
  epic: { title: "Mission : Epique", bg: "road" },
};

export interface MissionBoxView {
  host: string;
  type: MissionType;
  /** Protected army seen without the password: title only (hq.html: empty `bcount0` action). */
  locked: boolean;
  unlocked: boolean;
  /** The day's tries, oldest first. */
  tries: DayBattle[];
  attempts: number;
  unlockCost: number;
  /** Session key (`chk`) of the action links. */
  key: string;
  /** "Nouvelle mission dans" + chrono. */
  timer: Html;
}

const BG = (name: string): string => `style="background-image : url('/img/mode/${name}.jpg')"`;

/**
 * The mission box of the HQ, from $EX/html/fr/hq-levelup.html (one `bwin` tile after a won first try, "Nouvelle mission
 * dans" chrono) and hq.html (protected: empty action). Before the unlock: a single "Débloquer pour 5" tile.
 */
export function missionBox(cfg: Config, v: MissionBoxView): Html {
  const box = MISSION_BOX[v.type];
  const frame = (count: number, inner: Html | ""): Html => html`<div class="box2"><div class="box2bg" ${raw(BG(box.bg))}><h1 class="hbox">${box.title}</h1>
<div class="box2bottom"><div class="action bcount${count}">${inner}</div></div></div></div>
`;
  if (v.locked) return frame(0, "");
  if (!v.unlocked) {
    // UNVERIFIED: the unlock tile was never archived; text from $GL ("Débloquer pour 5" + token), drawn as a `bgo2` tile.
    const tile = html`<div class="b bgo2"><div class="b_right bgo2_right"><a href="${armyUrl(cfg, v.host, `/b/unlock?chk=${v.key}`)}" class="b_bg bgo2_bg" onmouseover="_.showTip('miss_tip','${jsq(`Débloquer pour ${v.unlockCost}`)}')" onmouseout="_.resetTip('miss_tip')">Débloquer pour ${v.unlockCost}
<img src="/img/token.png"/></a></div></div>
`;
    return frame(1, html`
${tile}${v.timer}`);
  }
  const won = v.tries.some((t) => t.win);
  const left = won ? 0 : Math.max(0, v.attempts - v.tries.length);
  const done = v.tries.map((t) => {
    const k = t.win ? "bwin" : "bdefeat";
    // UNVERIFIED: the tooltip of a lost try was never archived; the archived replay text is used.
    const text = t.win ? "Tu as remporté la mission du jour !" : "Ce combat s'est soldé par un échec !";
    return html`<div class="b ${k}"><div class="b_right ${k}_right"><a href="${armyUrl(cfg, v.host, `/b/view/miss${t.n}`)}" class="b_bg ${k}_bg" onmouseover="_.showTip('miss_tip','${jsq(text)}')" onmouseout="_.resetTip('miss_tip')"><img src="/img/${k}.gif"/></a></div></div>
`;
  });
  // UNVERIFIED: tiles of the remaining tries and their tooltip ($GL "Il te reste N essais pour la mission du jour !").
  const go = html`<div class="b bgo2"><div class="b_right bgo2_right"><a href="${armyUrl(cfg, v.host, `/b/mission?n=${v.tries.length};chk=${v.key}`)}" class="b_bg bgo2_bg" onmouseover="_.showTip('miss_tip','${jsq(`Il te reste ${left} essais pour la mission du jour !`)}')" onmouseout="_.resetTip('miss_tip')"><img src="/img/bgo2.gif"/></a></div></div>
`;
  const tiles = [...done, ...Array.from({ length: left }, () => go)];
  return frame(tiles.length, html`

${tiles}
${v.timer}`);
}
