import type { Config } from "../config.ts";
import { html, type Html } from "./html.ts";
import { shellPage, type ShellView } from "./panel.ts";
import { chrono } from "./hq.ts";

/**
 * Right column of `/endDay`, from $EX/html/fr/endDay.html. Left out: the Motion-Twin game ads and the "Pendant ce
 * temps…" sentence. UNVERIFIED: no forum here, so the last sentence only keeps the recruit link.
 */
export function enddayRight(resetIn: number): Html {
  return html`<div class="over"><img src="/img/art_congrats.png" class="imgcongrats"/>
<div class="congrats"><p><strong>Félicitations : ton armée s'est bien battue !</strong> Elle pourra faire de nouvelles batailles, tenter de nouvelles missions, et effectuer un nouveau Raid d'ici quelques heures.</p>
<div class="wait">
Patiente
encore
${chrono(resetIn)} avant de pouvoir jouer plus.</div></div>
<p>
N'oublie
pas
non
plus
de
<a href="javascript:_.startRecruit()">Recruter des Troopers</a> !</p></div>`;
}

export function enddayPage(cfg: Config, v: Omit<ShellView, "title" | "right"> & { resetIn: number }): Html {
  const { resetIn, ...shell } = v;
  return shellPage(cfg, { ...shell, title: "C'est tout pour aujourd'hui !", right: enddayRight(resetIn) });
}
