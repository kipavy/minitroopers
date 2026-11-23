import type { BattleTrooperInput } from "@mt/engine";
import type { Config } from "../config.ts";
import type { ArmyRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { notification } from "./army.ts";
import { html, type Html } from "./html.ts";
import { offerItem, type OfferView } from "./home.ts";
import { shellPage } from "./panel.ts";

export interface AddView {
  army: ArmyRow;
  troopers: readonly BattleTrooperInput[];
  power: number;
  offers: readonly OfferView[];
  /** Price of the next trooper. */
  cost: number;
  error?: string;
}

/** Recruitment page of an existing army, from $EX/html/fr/add.html. */
export function addPage(cfg: Config, v: AddView): Html {
  const right = html`<div class="add"><p>Sélectionne un trooper à ajouter à ton armée. Chaque jour de nouveaux troopers sont disponibles. Choisis ton trooper avec soin car tu es limité en nombre :</p>
<ul class="troopers">
${v.offers.map(offerItem)}</ul>
<script type="text/javascript">
	_.onTrooperSelected = function() {
		$("#valid").removeClass("disabled");
	};
	function doRecruit() {
		if( $("#valid").hasClass("disabled") )
			return false;
		if( confirm('Confirmer cette action ?') )
			$("#add")[0].submit();
		return false;
	}
	</script>
<div class="clear"></div>
<form id="add" method="POST" action="${armyUrl(cfg, v.army.host, "/add")}"><input type="hidden" name="tselect" id="tselect"/>
<div class="but b3"><div class="but_right b3_right"><a href="#" id="valid" class="but_bg b3_bg img disabled" onclick="return doRecruit()">
Ajouter
pour
${v.cost}
<img src="/img/token.png"/></a></div></div></form></div>`;
  return shellPage(cfg, {
    army: v.army,
    troopers: v.troopers,
    power: v.power,
    title: "Ajoute un trooper",
    right,
    ...(v.error ? { notice: notification(v.error, true) } : {}),
  });
}
