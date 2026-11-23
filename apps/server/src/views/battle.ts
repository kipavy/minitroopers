import type { Config } from "../config.ts";
import { html, raw, type Html } from "./html.ts";
import { layout } from "./layout.ts";
import { jsStr, swfEmbed } from "./swf.ts";

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
  const content = html`<div class="game">${title}${swfEmbed({ id: "swf_battle", width: 720, height: 440, flashvars: v.flashvars, objId: "battle", opaque: true })}</div>

<script type="text/javascript">
	function endBattle() {
		document.location = ${raw(jsStr(v.endUrl))};
	}
	battleID = ${raw(jsStr(v.battleId))};</script>

${v.back !== null ? html`<a href="${v.back}" class="button5">Retour</a>
` : ""}
</div>`;
  return layout(cfg, { title: null, content, host: v.host, pass: v.pass ?? false });
}
