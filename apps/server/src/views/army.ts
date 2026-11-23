import type { Config } from "../config.ts";
import { armyUrl } from "../urls.ts";
import { html, type Html } from "./html.ts";

/** Article of the army name, by `part` (original form: 0 "de ", 1 "d'", 2 "du ", 3 "de la ", 4 "des ", 5 none). */
export const PART_LABELS: readonly string[] = ["de ", "d'", "du ", "de la ", "des ", ""];

/** "L'armée de X" as the original pages print it (plain text: escape when interpolating). */
export const armyTitle = (name: string, part: number): string => `L'armée ${PART_LABELS[part] ?? ""}${name}`;

/** Absolute link of an army page (recruit links are copied and shared, so path mode needs the origin). */
export function absoluteArmyUrl(cfg: Config, host: string, path: string): string {
  const u = armyUrl(cfg, host, path);
  return u.startsWith("/") ? cfg.publicUrl + u : u;
}

/**
 * Notification popup of the original pages (`#notification`, closed by `_.hideNotif()`); `error` gives it the
 * `poperror` class. The message is text and is escaped.
 */
export function notification(message: Html | string, error = false): Html {
  return html`<div id="notification"${error ? html` class="poperror"` : ""}><div class="poptop"><div class="popbottom"><div class="popbg"><div class="popcontent"><div class="pop">${message}
<p><a href="#" onclick="return _.hideNotif()" class="button5">Ok</a></p></div></div></div></div></div>
<div class="black"></div>
<script type="text/javascript">$('body').addClass('hideSwf')</script></div>`;
}
