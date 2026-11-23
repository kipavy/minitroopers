import type { Config } from "../config.ts";
import { armyUrl } from "../urls.ts";
import { armyTitle } from "./army.ts";
import { html, type Html } from "./html.ts";
import { notification } from "./army.ts";
import { shellPage, type ShellView } from "./panel.ts";

const BOX = html`<div class="warntop confirmtop"><div class="warnbottom confirmbottom"><div class="warnbg confirmbg"><div class="warncontent confirmcontent">Créer un mot de passe pour ton armée empêchera que d'autres joueurs l'utilisent sans ton accord.</div></div></div></div>`;

const BUTTONS = (cfg: Config, host: string): Html => html`<tr><td colspan="2" class="validate"><input type="submit" value="Valider" class="button5" onclick="return confirm('Confirmer cette action ?')"/>
<input type="submit" value="Annuler" onclick="document.location = '${armyUrl(cfg, host, "/hq")}'; return false" class="button5"/></td></tr></table></form>`;

/** Right column of `/protect`, from $EX/html/fr/protect.html (creation) and protect-2.html (change). */
export function protectRight(cfg: Config, v: Pick<ShellView, "army"> & { chk: string; bad: boolean }): Html {
  const a = v.army;
  const action = armyUrl(cfg, a.host, "/protect?submit=1");
  if (a.passwordHash === null && v.bad) {
    return html`<div class="protect">${BOX}
<div id="bad"><div class="warntop infotop"><div class="warnbottom infobottom"><div class="warnbg infobg"><div class="warncontent infocontent"><p>Tu <strong>ne peux pas créer un mot de passe</strong> pour <em>${armyTitle(a.name, a.part)}</em> depuis l'ordinateur que tu utilises actuellement.</p>
		<p> Tu pourras le faire que depuis l'ordinateur t'ayant servi à créer cette armée !</p></div></div></div></div>
<a href="${armyUrl(cfg, a.host, "/hq")}" class="button5">Retour</a></div></div>`;
  }
  if (a.passwordHash === null) {
    return html`<div class="protect">${BOX}
<form method="POST" action="${action}"><input type="hidden" name="chk" value="${v.chk}"/><input type="hidden" name="mid" id="mid"/>
<table class="form">
<tr><td class="intr" colspan="2">Tape un mot de passe de ton choix ci-dessous :</td></tr>
<tr><td class="what">Mot de passe :</td>
<td><input type="password" name="pass" class="field"/></td></tr>

<tr><td class="what">Confirmer le mot de passe :</td>
<td><input type="password" name="passconf" class="field"/></td></tr>
${BUTTONS(cfg, a.host)}
</div>`;
  }
  return html`<div class="protect">${BOX}
<form method="POST" action="${action}"><input type="hidden" name="chk" value="${v.chk}"/><input type="hidden" name="mid" id="mid"/>
<table class="form">
<tr><td class="intr" colspan="2">Remplis les champs ci-dessous pour changer ton mot de passe :</td></tr>
<tr><td class="what">Ancien mot de passe</td>
<td><input type="password" name="pass" class="field"/></td></tr>
<tr><td class="what">Nouveau mot de passe :</td>
<td><input type="password" name="newpass" class="field"/></td></tr>

<tr><td class="what">Confirmer le mot de passe :</td>
<td><input type="password" name="passconf" class="field"/></td></tr>
${BUTTONS(cfg, a.host)}
</div>`;
}

export function protectPage(cfg: Config, v: Omit<ShellView, "title" | "right"> & { chk: string; bad: boolean; error?: string }): Html {
  const { chk, bad, error, ...shell } = v;
  const title = v.army.passwordHash === null ? "Protéger mon armée" : "Modifier le mot de passe";
  return shellPage(cfg, { ...shell, title, right: protectRight(cfg, { army: v.army, chk, bad }), ...(error ? { notice: notification(error, true) } : {}) });
}
