import type { LogLine } from "../battleLog.ts";
import type { Config } from "../config.ts";
import { html, raw, type Html } from "./html.ts";
import { layout, type OgMeta } from "./layout.ts";
import type { BattleRow } from "../repo.ts";
import { absoluteUrl } from "../urls.ts";
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
  /** Link preview tags (battleOg). */
  og: OgMeta;
}

/** Name of each mission type in a link preview title. */
const MISSION_OG: Record<string, string> = { exterminate: "Mission Extermination", infiltrate: "Mission Infiltration", epic: "Mission Épique" };

/**
 * Link preview of a stored battle (Discord, WhatsApp…): "Revoir : <attacker> VS <defender>" (daily battles), "Revoir :
 * <attacker> — Mission …" / "— Raid, phase N"; "Combat MiniTroopers du DD/MM/AAAA." and the stored outcome; the fixed
 * image public/img/og-battle.jpg. `url`: canonical link of the replay (made absolute here).
 */
export function battleOg(cfg: Config, b: BattleRow, attacker: string, defender: string, url: string): OgMeta {
  const title =
    b.kind === "raid"
      ? `Revoir : ${attacker} — Raid${b.phase !== null ? `, phase ${b.phase}` : ""}`
      : b.kind === "mission"
        ? `Revoir : ${attacker} — ${MISSION_OG[b.mode ?? ""] ?? "Mission"}`
        : `Revoir : ${attacker} VS ${defender}`;
  // The opponent is named only when it is an army (daily battles, infiltration); rats, NPC armies: "Défaite de …".
  const named = (b.kind === "battle" || b.mode === "infiltrate") && defender !== "";
  const outcome =
    b.winner === null ? "Match nul." : b.winner === b.input.attackerSide ? `Victoire de ${attacker}.` : named ? `Victoire de ${defender}.` : `Défaite de ${attacker}.`;
  const [y, m, d] = b.day.split("-");
  return {
    title,
    description: `Combat MiniTroopers du ${d}/${m}/${y}. ${outcome}`,
    url: absoluteUrl(cfg, url),
    image: `${cfg.publicUrl}/img/og-battle.jpg`,
    imageAlt: "MiniTroopers : un combat à revoir",
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
</script>
<script type="text/javascript" src="/js/player.js?v=2"></script>
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
  return layout(cfg, { title: null, content, host: v.host, pass: v.pass ?? false, bodyClass: "mtp", viewport: true, css: ["/css/player.css?v=2"], og: v.og });
}
