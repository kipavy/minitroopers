import type { MissionType } from "@mt/game";
import type { Config } from "../config.ts";
import type { DayBattle } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { BG, html, jsq, raw, type Html } from "./html.ts";

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
  /** The day's tries (since an admin `reset-day`), oldest first. */
  tries: DayBattle[];
  /** Tries made today, resets included: the `n=` of the next try's URL. */
  next: number;
  attempts: number;
  unlockCost: number;
  /** Session key (`chk`) of the action links. */
  key: string;
  /** "Nouvelle mission dans" + chrono. */
  timer: Html;
  /** Epic only, under 10 confirmed recruits: the recruits still missing (blue `bblock` tile "Encore N recrues"). */
  epicMissing?: number;
}

/** Id of the info line of a mission box (one per box: several mission boxes on the HQ). */
export const missionTip = (type: MissionType): string => `miss_tip_${type}`;

/**
 * The mission box of the HQ, from $EX/html/fr/hq-levelup.html (one `bwin` tile after a won first try, "Nouvelle mission
 * dans" chrono) and hq.html (protected: empty action). Before the unlock: a single "Débloquer pour 5" tile.
 */
export function missionBox(cfg: Config, v: MissionBoxView): Html {
  const box = MISSION_BOX[v.type];
  const frame = (count: number, inner: Html | ""): Html => html`<div class="box2"><div class="box2bg" ${raw(BG(box.bg))}><h1 class="hbox">${box.title}</h1>
<div class="box2bottom"><div class="action bcount${count}">${inner}</div></div></div></div>
`;
  const tipId = missionTip(v.type);
  if (v.locked) return frame(0, "");
  if (v.epicMissing !== undefined) {
    // Choice A (Killian, 2026-11-25): the epic box stays visible with the game's blue "blocked" tile.
    return frame(1, html`
<div class="b bblock"><div class="b_right bblock_right"><span class="b_bg bblock_bg"><img src="/img/bblock.gif"/> Encore ${v.epicMissing} ${v.epicMissing > 1 ? "recrues" : "recrue"}</span></div></div>
<div class="hqtip"><img src="/img/info.png"/>
<span id="${tipId}">La mission Épique s'ouvre à 10 recrues confirmées.</span></div>`);
  }
  if (!v.unlocked) {
    // UNVERIFIED: the unlock tile was never archived; text from $GL ("Débloquer pour 5" + token), drawn as a `bgo2` tile.
    const tile = html`<div class="b bgo2"><div class="b_right bgo2_right"><a href="${armyUrl(cfg, v.host, `/b/unlock?chk=${v.key}`)}" class="b_bg bgo2_bg" onmouseover="_.showTip('${tipId}','${jsq(`Débloquer pour ${v.unlockCost}`)}')" onmouseout="_.resetTip('${tipId}')">Débloquer pour ${v.unlockCost}
<img src="/img/token.png"/></a></div></div>
`;
    // Choice D (Killian, 2026-11-25): one "Missions" box before the unlock.
    return html`<div class="box2"><div class="box2bg" ${raw(BG(box.bg))}><h1 class="hbox">Missions</h1>
<div class="box2bottom"><div class="action bcount1">
${tile}<div class="hqtip"><img src="/img/info.png"/>
<span id="${tipId}">Débloque les missions : Exterminer et Infiltrer tous les jours !</span></div></div></div></div></div>
`;
  }
  const won = v.tries.some((t) => t.win);
  const left = won ? 0 : Math.max(0, v.attempts - v.tries.length);
  const done = v.tries.map((t) => {
    const k = t.win ? "bwin" : "bdefeat";
    // UNVERIFIED: the tooltip of a lost try was never archived; the archived replay text is used.
    const text = t.win ? "Tu as remporté la mission du jour !" : "Ce combat s'est soldé par un échec !";
    return html`<div class="b ${k}"><div class="b_right ${k}_right"><a href="${armyUrl(cfg, v.host, `/b/view/miss${t.n}`)}" class="b_bg ${k}_bg" onmouseover="_.showTip('${tipId}','${jsq(text)}')" onmouseout="_.resetTip('${tipId}')"><img src="/img/${k}.gif"/></a></div></div>
`;
  });
  // UNVERIFIED: tiles of the remaining tries and their tooltip ($GL "Il te reste N essais pour la mission du jour !").
  const go = html`<div class="b bgo2"><div class="b_right bgo2_right"><a href="${armyUrl(cfg, v.host, `/b/mission?type=${v.type};n=${v.next};chk=${v.key}`)}" class="b_bg bgo2_bg" onmouseover="_.showTip('${tipId}','${jsq(`Il te reste ${left} essais pour la mission du jour !`)}')" onmouseout="_.resetTip('${tipId}')"><img src="/img/bgo2.gif"/></a></div></div>
`;
  const tiles = [...done, ...Array.from({ length: left }, () => go)];
  return frame(tiles.length, html`

${tiles}
${v.timer}`);
}
