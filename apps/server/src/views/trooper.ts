import { Data, clientParams, trooperData, type BattleTrooperInput, type TrooperPref, type TrooperSheet } from "@mt/engine";
import skillsPlacement from "../../data/skills-placement.json" with { type: "json" };
import type { Config } from "../config.ts";
import type { ArmyRow } from "../repo.ts";
import { armyUrl } from "../urls.ts";
import { notification } from "./army.ts";
import { html, raw, type Html } from "./html.ts";
import { tip } from "./layout.ts";
import { shellPage } from "./panel.ts";
import { MINI_SWF, swfEmbed } from "./swf.ts";
import { skillIconStyle, skillTip } from "./tips.ts";
import { selection, unlocked, type PrefField } from "../prefs.ts";

const PLACEMENT: readonly number[] = skillsPlacement;

export interface SheetView {
  army: ArmyRow;
  troopers: readonly BattleTrooperInput[];
  power: number;
  slot: number;
  renamed: boolean;
  /** The trooper as the client sees it (name, pref, leftOver). */
  trooper: BattleTrooperInput;
  sheet: TrooperSheet;
  pref: TrooperPref;
  /** Session key: the `chk`/action token of every URL of the page. */
  key: string;
  /** Cost of the next level-up, null at the level cap. */
  upgradeCost: number | null;
  /** Number of level-up choices the trooper has now: the level the upgrade link is bound to. */
  level: number;
  error?: string;
}

const BODY = ["Dans la tête !", "Droit au coeur !", "Poumon droit", "Dans les tripes (miam)", "Bras gauche", "Bras droit", "Jambe gauche", "Jambe droite"];
const TARGET = ["Le plus proche", "Le plus facile", "Le plus faible (eheh)", "Le plus menaçant"];
const MOVE = ["Chasseur", "Standard", "Défensif"];
const JOBS = ["Soldat", "Medecin", "Pilote", "Artificier", "Scout", "Espion", "Officier COM", "Saboteur"];

const option = (value: number, label: string, cur: number): Html => html`<option value="${value}"${value === cur ? raw(' selected="selected"') : ""}>${label}</option>
`;

function configField(field: PrefField, label: string, title: string, body: string, options: Html[]): Html {
  return html`<div class="config"><label ${tip(title, body)}>${label} :</label>
<select name="${field}" onchange="$('#config').submit()">
${options}</select></div>
`;
}

function configForm(cfg: Config, v: SheetView): Html {
  const sel = selection(v.pref, v.sheet.weapons);
  const u = (f: PrefField): boolean => unlocked(f, v.sheet);
  const fields = [
    u("weapon")
      ? configField("weapon", "Arme Préférée", "Arme Préférée", "Défini l'arme avec laquelle ton trooper commencera à exploser la tronche de ses adversaires", [
          option(-1, "Aucune", sel.weapon),
          ...v.sheet.weapons.map((w, i) => option(i, Data.WEAPON[w]!.name, sel.weapon)),
        ])
      : "",
    u("loc")
      ? configField("loc", "Localisation Favorite", "Localisation Favorite", "Détermine quelle partie du corps de ses adversaires ton trooper aime particulièrement viser", [
          option(-1, "Partout !", sel.loc),
          ...BODY.map((l, i) => option(i, l, sel.loc)),
        ])
      : "",
    u("target")
      ? configField("target", "Ciblage", "Ciblage", "Détermine quel ennemi ton trooper va cibler en priorité", TARGET.map((l, i) => option(i, l, sel.target)))
      : "",
    u("move")
      ? configField("move", "Comportement", "Comportement", "Détermine la façon dont ton trooper va se déplacer au sein du champ de bataille", MOVE.map((l, i) => option(i, l, sel.move)))
      : "",
    u("ttype")
      ? configField("ttype", "Priorité", "Priorité", "Détermine sur quel métier ton trooper va concentrer ses tirs en priorité", [
          option(-1, "Défaut", sel.ttype),
          ...JOBS.map((l, i) => option(i, l, sel.ttype)),
        ])
      : "",
  ];
  return html`<form id="config" method="POST" action="${armyUrl(cfg, v.army.host, `/t/${v.slot}?config=${v.key}`)}">
${fields}
<a href="${armyUrl(cfg, v.army.host, "/hq")}" class="button5">Retour</a></form>`;
}

function skillList(v: SheetView): Html {
  const owned = new Set(v.sheet.skills);
  const name = v.trooper.name;
  const flashvars = clientParams(trooperData(v.trooper, v.army.faction, MINI_SWF));
  const icons = PLACEMENT.map((s) =>
    owned.has(s) ? html`<li class="on" ${skillTip(s, name)} style="${skillIconStyle(s)}"></li>
` : html`<li style="${skillIconStyle(s)}"></li>
`,
  );
  return html`<ul class="skills"><li class="soldier">
${swfEmbed({ id: `swf_showtr_${v.slot}`, width: 72, height: 72, flashvars, objId: `showtr_${v.slot}` })}</li>
${icons}</ul>`;
}

/** The trooper sheet, from $EX/html/fr/t_0.html (ads, promos and the second "Plus de jeux" band left out). */
export function sheetPage(cfg: Config, v: SheetView): Html {
  const u = (p: string): string => armyUrl(cfg, v.army.host, p);
  const upgrade =
    v.upgradeCost === null
      ? ""
      : html`<div class="but b3"><div class="but_right b3_right"><a class="but_bg b3_bg img" href="${u(`/t/${v.slot}?levelup=${v.key}&lv=${v.level}`)}">Améliorer
pour
${v.upgradeCost}
<img src="/img/token.png"/></a></div></div>
`;
  const rename = v.renamed
    ? ""
    : html`<div class="but b3"><div class="but_right b3_right"><a class="but_bg b3_bg" href="#" onclick="$('#rename').show(); $('#name').focus()">Renommer</a></div></div>

<form id="rename" style="display:none"><p><img src="/img/att.png"/>
Attention :
tu ne pourras changer le nom de ton trooper qu'<strong>une seule fois</strong> !</p>
Nouveau nom :
<input id="name" name="name" value="${v.trooper.name}" maxlength="12" class="field"/>
<input type="hidden" name="chk" value="${v.key}" class="field"/>
<input type="submit" value="Renommer" class="button7" onclick="return confirm('Confirmer cette action ?')"/>
<input type="submit" value="Annuler" onclick="$('#rename').hide(); return false" class="button7"/></form>
`;
  // UNVERIFIED: the FR label of the re-equip link ("Re-equip" in the EN capture only).
  const equip =
    v.sheet.equipment.length > v.sheet.carry
      ? html`<div class="but b3"><div class="but_right b3_right"><a class="but_bg b3_bg" href="${u(`/t/${v.slot}?equip=${v.key}`)}" onclick="return confirm('Confirmer cette action ?')">Rééquiper</a></div></div>
`
      : "";
  const right = html`<div class="sheet">
<table class="tablesheet"><tr><td>${skillList(v)}</td>
<td class="sheetright">${upgrade}${rename}${equip}${configForm(cfg, v)}</td></tr></table></div>`;
  return shellPage(cfg, {
    army: v.army,
    troopers: v.troopers,
    power: v.power,
    title: `Fiche de ${v.trooper.name}`,
    right,
    ...(v.error ? { notice: notification(v.error, true) } : {}),
  });
}
