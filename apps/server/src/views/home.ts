import { clientParams, trooperData, type BattleTrooperInput } from "@mt/engine";
import type { Config } from "../config.ts";
import { armyUrl } from "../urls.ts";
import { html, raw, type Html } from "./html.ts";
import { layout } from "./layout.ts";
import { notification, PART_LABELS } from "./army.ts";
import { MINI_SWF, jsStr, swfEmbed } from "./swf.ts";
import { skillIconStyle, skillTip } from "./tips.ts";

export interface OfferView {
  seed: number;
  name: string;
  colour: number;
  /** The two skills shown under the trooper (weapon first). */
  skills: number[];
}

export interface HomeView {
  /** Recruiting army: host (link target) and display title ("L'armée de X"). */
  recruiter: { host: string; title: string };
  /** Where the creation form posts: the recruiter's page (so the server knows who recruits). */
  formAction: string;
  offers: OfferView[];
  /** Previous input, kept when the form is shown again after an error. */
  name?: string;
  part?: number;
  error?: string;
}

const offerInput = (o: OfferView, i: number): BattleTrooperInput => ({ id: 1000 + i, name: o.name, seed: o.seed, type: 0, choices: [], force: [], pref: null });

export function offerItem(o: OfferView, i: number): Html {
  const tid = 1000 + i;
  const onclick = `_.selectTrooper(${tid},${o.seed})`;
  const flashvars = clientParams(trooperData(offerInput(o, i), o.colour, MINI_SWF), { onclick });
  const icons = o.skills.map((s) => html`<li ${skillTip(s, o.name)} style="${skillIconStyle(s)}"></li>`);
  return html`<li class="trooper" id="tr_${tid}" onclick="${onclick}" style="cursor:pointer">
${swfEmbed({ id: `swf_showtr_${tid}`, width: 72, height: 71, flashvars, objId: `showtr_${tid}` })}

<ul>
${icons}
</ul></li>
`;
}

/** Home / recruitment landing, from $EX/html/fr/_.html (Braziball promo, ads and the machine-id SWF left out). */
export function homePage(cfg: Config, v: HomeView): Html {
  const parts = PART_LABELS.map((l, i) => html`<option value="${i}"${i === (v.part ?? 0) ? raw(" selected") : ""}>${l}</option>`);
  const content = html`${v.error ? notification(v.error, true) : ""}

<div class="subscribe">
<div class="cache"><img src="/img/fb/minitroopers1.png"/>
<img src="/img/fb/minitroopers2.png"/>
<img src="/img/fb/minitroopers3.png"/>
<img src="/img/fb/minitroopers4.png"/>
<img src="/img/fb/minitroopers5.png"/>
<img src="/img/fb/minitroopers_general.png"/>
<img src="/img/fb/minitroopers.png"/>
<img src="/img/buttons/button4_over.png"/>
<img src="/img/buttons/button7_over.png"/></div>
<form action="${v.formAction}" method="POST" class="create"><div class="box4"><p><a href="${armyUrl(cfg, v.recruiter.host, "/")}">${v.recruiter.title}</a> recrute : crée ta propre armée !</p>
<p class="nameit">
Armée
&nbsp;
<select name="part" class="field">
${parts}
</select>
<input id="name" class="field" name="name" maxlength="20" value="${v.name ?? ""}"/></p>
<div class="host" style="display:none"><div class="hostcheck"></div>
<div class="hostname"></div></div>
<input id="tselect" name="tselect" type="hidden" value=""/></div>
<div class="box5"><p>Choisis ton premier trooper parmi ceux-ci :</p>
<ul class="troopers">
${v.offers.map(offerItem)}
</ul></div>
<input id="submit" class="button4 button_off" type="submit" value="Valider" disabled="disabled"/></form>
<div class="alreadyhave"><form action="/login" method="POST"><p>As-tu déjà une armée ? :</p>
<p><input class="field" name="login" maxlength="40"/>
<input class="button7" type="submit" value="Chercher"/></p></form></div>
<script type="text/javascript">_.initCreate(${raw(jsStr(cfg.baseDomain))});</script>
</div>`;
  return layout(cfg, { title: "Crée ton armée ! Ils sont petits, brutaux, et ils sont sous tes ordres !", content });
}
