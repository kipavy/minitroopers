import type { LogLine } from "../battleLog.ts";
import type { Config } from "../config.ts";
import { html, raw, type Html } from "./html.ts";
import { layout, type OgMeta } from "./layout.ts";
import type { BattleRow } from "../repo.ts";
import { absoluteUrl, battleImageUrl } from "../urls.ts";
import { jsJson, jsStr, swfEmbed } from "./swf.ts";

export interface BattleView {
  /** Army host of the page frame (logo / footer links), null on the site root. */
  host: string | null;
  /** That army has a password (footer "Modifier mon pass"). */
  pass?: boolean;
  /** "L'armée de X" of both sides (plain text), attacker first. */
  attacker: string;
  defender: string;
  /** clientParams(battleData(input), { endMsg }). */
  flashvars: string;
  /** Where `endBattle()` (called by the SWF) goes: `/hq?money=N` after a new battle, `/hq` for a replay. */
  endUrl: string;
  /** "Retour" button of the replay pages (absent from the page shown right after the battle). */
  back: string | null;
  battleId: string;
  /**
   * Title above the battle: absent = "<attacker> VS <defender>" (daily battles); a text = that title (infiltration:
   * "Infiltrer la base de L'armée de X", b_view_miss1.html); null = no title (`swfframe` without `nam`: extermination,
   * epic and raid pages, RECON3).
   */
  heading?: string | null;
  /** French log of the battle, one line per history entry (enhanced player, public/js/player.js). */
  log: readonly LogLine[];
  /** `?at=`: history index the player starts at (null: from the start). */
  at: number | null;
  /** Army and trooper names of input sides 0 and 1 (the log colours them by side). */
  sides: readonly [readonly string[], readonly string[]];
  /**
   * Link preview tags (battleOg): daily battles only, whose public page `/b/fview/<id>` crawlers can read. Missions and
   * raids have no public replay (owner-only pages), so no preview.
   */
  og?: OgMeta;
}

/**
 * Link preview of a daily battle (Discord, WhatsApp…): "Revoir : <attacker> VS <defender>", "Combat MiniTroopers du
 * DD/MM/AAAA." and the stored outcome, the battle's own banner (/og/battle/<id>.jpg, routes/og.ts). `url`: canonical
 * public link of the replay (made absolute here).
 */
export function battleOg(cfg: Config, b: Pick<BattleRow, "id" | "day" | "winner" | "input">, attacker: string, defender: string, url: string): OgMeta {
  const title = `Revoir : ${attacker} VS ${defender}`;
  const outcome = b.winner === null ? "Match nul." : `Victoire de ${b.winner === b.input.attackerSide ? attacker : defender}.`;
  const [y, m, d] = b.day.split("-");
  return {
    title,
    description: `Combat MiniTroopers du ${d}/${m}/${y}. ${outcome}`,
    url: absoluteUrl(cfg, url),
    image: battleImageUrl(cfg, b.id),
    imageAlt: title,
  };
}

/**
 * Battle page, from $EX/html/fr/b_fview_262581433.html (just fought: `/hq?money=2`, no button) and
 * b_view_bat1.html / b_fview_262579954.html (replay: `/hq`, "Retour"). Title "MiniTroopers" only, like the originals.
 */
export function battlePage(cfg: Config, v: BattleView): Html {
  const title =
    v.heading === undefined
      ? html`<div class="swfframe nam "><h1>
${v.attacker}
VS
${v.defender}
</h1>
`
      : v.heading === null
        ? html`<div class="swfframe ">
`
        : html`<div class="swfframe nam "><h1>
${v.heading}
</h1>
`;
  // The enhanced player (player.js) wraps swfobject.embedSWF before the embed runs; the log is drawn beside the frame.
  const content = html`<script type="text/javascript">
var mtLog = ${raw(jsJson(v.log))};
var mtAt = ${raw(jsJson(v.at))};
var mtSides = ${raw(jsJson(v.sides))};
var mtShare = ${raw(jsJson(v.og?.url ?? null))};
</script>
<script type="text/javascript" src="/js/player.js?v=3"></script>
<div class="game mtp-game">${title}<div class="mtp-screen"><div class="mtp-stage">${swfEmbed({ id: "swf_battle", width: 720, height: 440, flashvars: v.flashvars, objId: "battle", opaque: true })}</div></div>
<div id="mtp-bar" class="mtp-bar"></div></div>
<div id="mtp-log" class="mtp-log"></div>

<script type="text/javascript">
	function endBattle() {
		document.location = ${raw(jsStr(v.endUrl))};
	}
	battleID = ${raw(jsStr(v.battleId))};</script>

${v.back !== null ? html`<a href="${v.back}" class="button5">Retour</a>
` : ""}
</div>`;
  return layout(cfg, { title: null, content, host: v.host, pass: v.pass ?? false, bodyClass: "mtp", viewport: true, css: ["/css/player.css?v=3"], ...(v.og ? { og: v.og } : {}) });
}
