# Interface adaptative (téléphone et tablette) — conception

Date : 2026-11-25. Décisions de Killian prises sur captures réelles (prototypes CSS injectés dans le vrai site local).

## Intention

Killian et son frère jouent aussi sur téléphone. Aujourd'hui, toutes les pages sauf le combat n'ont pas de balise `viewport` : un téléphone affiche le site de 980 px dézoomé à environ 37 %, illisible. Le but est d'avoir un vrai site mobile, qui ressemble au jeu, et pas un zoom.

Priorité d'usage : le **passage quotidien** (QG → batailles, mission, raid → replays). Mais **chaque page doit être propre** : aucune page ne peut être laissée cassée.

## Objectifs

- Toutes les pages sont lisibles et utilisables au doigt de 320 à 979 px de large, sans défilement horizontal.
- Sous 600 px : une colonne. De 600 à 979 px : deux colonnes, avec le panneau « Mes troopers » à gauche comme l'original (choix T2).
- L'identité MiniTroopers est conservée : cadre, boîtes, bandeaux et boutons d'origine, à leur taille réelle quand ils tiennent.
- La page de combat partage le même habillage (choix de Killian après comparaison), en coordination avec la session kikik-7e qui possède le lecteur.

## Non-objectifs

- Pas de refonte de l'ordinateur : **au-dessus de 980 px, aucun pixel ne change**.
- Pas de nouvelles fonctions de jeu, pas de changement des combats ni du moteur.
- Pas d'application, pas de PWA ni de mode hors ligne.

## Anti-objectifs (échec même si « ça marche »)

- Un zoom paresseux (`zoom`, `transform: scale` sur la page entière, viewport fixe à 980).
- Des images d'origine étirées ou déformées. C'était le défaut de la v1 refusée : bandeau du titre étiré, boîte écrasée.
- Du contenu qui flotte sur le fond camouflage sans le cadre beige. C'était l'autre défaut de la v1 refusée.
- `style.css` modifié : il reste octet pour octet l'original, un test vérifie son sha256.
- Une modification des fichiers du lecteur (`views/battle.ts`, `public/js/player.js`, `public/css/player.css`, SWF) sans l'accord de kikik-7e.

## Contraintes

- Les ajouts vont dans `apps/server/public/css/extras.css`, et `extras.css?v=` est incrémenté dans `views/layout.ts`.
- Le cadre d'origine est fait d'images d'une ligne de haut : `bg_content.png` 972×1, `dbg.png` 972×1, `dbottom.png` 972×11. Mesures relevées :
  - `bg_content.png` : bordure gauche sur x 0–6, beige de 7 à 961, bordure droite et ombre de 962 à 971 ;
  - `dbg.png` : bordure gauche sur 1 px, droite sur 4 px ;
  - `dbottom.png` : coins arrondis sur environ 5 px de chaque côté.
- Les Flash (Ruffle) ont des tailles fixes : grilles 214, 285 et 72 px, `choice` 630×254, animation de l'historique 670×240, combat 720×440 (géré par player.js).
- Les infobulles du site passent par `mt.js.Tip` (app.js, code Haxe d'origine) au survol, positionnées à la souris.

## Approches envisagées

1. **CSS dans `extras.css` sous requêtes média, plus quelques classes ou enveloppes dans le HTML** quand le CSS seul ne suffit pas. *Retenue.* L'ordinateur est garanti identique (aucune règle au-dessus de 980 px), un seul gabarit par page, et le prototype validé est déjà écrit ainsi.
2. Gabarits séparés pour mobile (détection côté serveur). *Écartée* : chaque page serait doublée et les deux versions divergeraient.
3. Remise en page en JavaScript. *Écartée* : la page clignote au chargement, et c'est fragile avec Ruffle.

## Ce que Killian a décidé

1. **Habillage « C », barre compacte**, sous 980 px :
   - Une barre fixe en haut, en métal bleu (#515b7e) avec la bande de rayures `dtop.png` en dessous.
   - Le logo réduit (environ 130×50) à gauche, les crédits et la puissance à droite. La barre reste en place au défilement.
   - Sur la page de combat, qui n'a ni crédits ni puissance, la barre n'affiche que le logo.
2. **Cadre d'origine reconstruit** à la largeur de l'écran, avec `border-image` sur ses propres images :
   - bordures gauche et droite de `bg_content.png`, fond beige étiré ;
   - bord arrondi haut : `dbottom.png` retourné ;
   - bord bas : `dbottom.png` ;
   - bande bleue `dbg.png`, ramenée à environ 40 px, avec les rayures.
   Le décor (tuyaux, caméra, rats, sp, pleft/pright, arthead, ptopleft, art_mouse, pbottomleft) est caché.
3. **Bandeau du titre** (`a.company`, title.png 479×64) : réduit en gardant ses proportions, jamais étiré.
4. **QG en une colonne** : Bataille, Mission, Raid (et le bandeau du week-end au-dessus s'il est actif), puis « Mes troopers » et son menu, puis l'historique, puis la boîte de lien de recrutement. L'encart publicitaire masqué (`.box3`) disparaît.
5. **Autres pages en une colonne** (option 1) : le contenu d'abord, le panneau « Mes troopers » et son menu sous la page.
6. **Page Bataille** : l'encadré « Infiltre la base d'une armée de ton choix » passe **tout en haut** sur mobile.
7. **Tablette, de 600 à 979 px** (T2) : deux colonnes, le panneau « Mes troopers » à gauche et le contenu à droite. Le QG met Bataille, Mission et Raid dans la colonne de droite. Le même habillage reste en place (barre compacte, cadre reconstruit).
8. **Page de combat** : même barre et même cadre que le reste du site. Elle garde ses propres règles de lecteur et de journal (player.css).
9. **Pas de confirmation à ajouter ni à retirer** : le mobile ne change aucun comportement.
10. **Au doigt, un toucher navigue directement.** Cela vaut pour les cases du QG (Bataille, Mission, Raid), le lien « S'entraîner (illimité) », les boutons du menu et tout lien qui porte une infobulle. Les textes de survol `_.showTip` (`bat_tip`, `miss_tip`, `raid_tip`, `menuTip`) ne s'affichent pas sur mobile : c'est accepté, et le texte par défaut de chaque zone reste visible. Pas de « premier toucher = bulle ».

## Mes choix, que Killian peut corriger

- **La balise `viewport`** passe sur toutes les pages (`layout.ts`, option par défaut). Toutes les règles mobiles sont rangées sous `@media (max-width: 979px)`, et les deux colonnes sous `@media (min-width: 600px) and (max-width: 979px)`. Elles portent sur la classe `mtm`, que `layout()` ajoute automatiquement au `<body>` de toute page avec `viewport` (à côté d'une éventuelle `bodyClass`, comme `mtp` sur le combat). battle.ts ne change pas de `bodyClass`, à la demande de kikik-7e.
- **Habillage partagé avec le combat** : les règles communes vont dans `extras.css`. Le bloc « narrow screens » de player.css (`.site`, décor, `a.logo`, `.frame`, `.ptopsite`, `#content`, `.copy`) est retiré **par kikik-7e, ou par moi avec son accord, sur le périmètre qu'il indique**. Voir « Coordination ».
- **Zone bleue « INFO » sous le menu** (`.box1 .tipbox`, bulle d'aide au survol des boutons) : cachée sur mobile, parce qu'il n'y a pas de survol au doigt. Le bord bas arrondi de la boîte (`.box1bottom`) doit rester visible : sur le prototype il était coupé, c'est à corriger.
- **Infobulles `mt.js.Tip` au doigt** (uniquement sur des éléments qui ne sont pas des liens ni des boutons : icônes « ? », crédits, puissance, compétences de la fiche…) : un toucher l'affiche, et un toucher ailleurs la ferme. Sur mobile, la bulle est placée dans l'écran (bornée à la largeur de la fenêtre) au lieu d'être collée à la souris. Les liens et boutons du menu naviguent directement. Le code Haxe d'origine d'app.js n'est pas modifié : on ajoute un petit script à part, ou un réglage CSS de `#tooltip`.
- **Flash plus large que l'écran** (`choice` 630, animation de l'historique 670) : réduction proportionnelle à la largeur disponible (largeur 100 %, hauteur selon le rapport d'origine). Ceux qui tiennent gardent leur taille réelle, pour rester nets.
- **Pages à vérifier une par une**, chacune devant passer sans défilement horizontal à 320, 390 et 768 px :
  - pages du QG et de combat : `/` (accueil sans session : création d'armée et connexion), `/hq` (propriétaire, protégé verrouillé, visiteur), `/b/opp`, `/b/train`, et les pages de combat (`/b/view/*`, `/b/fview/*`, `/b/tview/*`) ;
  - pages de l'armée : `/t/<n>` (fiche), `/levelup/<n>`, `/add`, `/choice`, `/history`, `/ranks`, `/global-ranks`, `/protect` ;
  - autres : `/endDay`, la page 404 « introuvable ».
  À l'état actuel, la fiche, les classements, l'historique et le mot de passe débordent : il faudra y réorganiser les tableaux et les grilles (compétences de la fiche notamment).
- **Retouches de compactage** autorisées si elles restent dans l'esprit : par exemple la hauteur fixe de la boîte de recrutement (`.box10`), ou l'espacement entre les cases d'adversaires.
- **Petit nettoyage DRY demandé par Killian** : `opp.ts` et `train.ts` ont chacun leur `mateCell`, et le même assemblage du tableau (encadré inséré en 2ᵉ case, lignes de 2). Je les regroupe dans une fonction partagée. L'affichage ne change pas.

## Coordination avec kikik-7e

Réponse de kikik-7e le 2026-11-25 : il est d'accord.

- **Retrait dans player.css : c'est moi qui le fais, dans cette PR.** Le périmètre est exact, dans le bloc `@media (max-width : 979px)` (lignes 666 à 702 d'origin/main) :
  - je supprime les règles `body.mtp .site`, puis `body.mtp .ptop, .sp, .pleft, .pright, .arthead, .camera, .ptopleft, .art_mouse, .pbottomleft`, puis `body.mtp a.logo`, `body.mtp .frame`, `body.mtp .ptopsite`, `body.mtp #content` et `body.mtp .copy` ;
  - je garde `body.mtp .game { padding-bottom }` et `body.mtp .game .button5 { margin-left }`, et le commentaire devient « narrow screens: the 720x440 player is scaled (player.js) » ;
  - je ne touche ni au bloc 560 px, ni à `pointer: coarse`, ni à `reduced-motion`, ni à rien d'autre de ses fichiers.
- **Sa branche `feat/keyframe-seek`** : sa tâche en cours ne touche que le SWF. La suivante modifiera player.js et player.css (un nouveau bloc `@media (min-width: 980px)` pour le journal, la bulle du « ? », le saut), mais pas layout.ts. Il rebasera sur notre fusion.
- **La page de combat garde la classe `mtp`**, puisque tout player.css est préfixé `body.mtp`. `mtm` est ajoutée automatiquement par `layout()`, sans toucher à `bodyClass` dans battle.ts.
- **Seule modification dans battle.ts, acceptée par kikik-7e** : `player.css?v=2` passe à `?v=3`, avec le test qui l'épingle s'il existe. Cela évite que les téléphones gardent en cache l'ancien bloc. Sa tâche suivante passera à `?v=4` après rebase.
- **Échelle du lecteur** : `fit()` (player.js, vers la ligne 518) calcule `s = ui.screen.clientWidth / 720` et le recalcule au redimensionnement. Elle suivra donc la largeur réduite par le cadre : à 390 px, le lecteur passe d'environ 370 à 340 px.
- **Une capture à 390 px de la page de combat avec l'habillage commun** est à montrer à Killian. C'est déjà fait en prototype, et ce sera refait sur la version finale.

## Vérification

- Tests (Node) :
  - la balise `viewport` et la classe `<body>` sont présentes sur toutes les pages ;
  - le sha256 de `style.css` reste inchangé (test existant) ;
  - `extras.css?v=` est incrémenté.
- **L'ordinateur ne change pas** : captures à 1280 px de chaque page, avant et après, comparées au pixel près. Elles doivent être identiques. Seules les animations Flash et l'horloge du QG sont masquées ou figées pendant la comparaison.
- **Captures à 390, 768 et 1280 px** de chaque page (Brave sans interface, profil temporaire, CDP), montrées à Killian. Aucun push sans son OK explicite.
- **Pas de défilement horizontal** : `scrollWidth` = largeur de la fenêtre à 320, 390, 600 et 768 px pour chaque page.

## Références visuelles

- Le CSS du prototype validé est conservé localement dans `.superpowers/mobile-proto/` (ignoré par git, à porter puis corriger, pas à recopier tel quel). Fichiers à porter : `base.css` (habillage commun), `hq.css` (ordre du QG), `side.css` (autres pages + encadré « Infiltre » en haut), `tab2.css` (deux colonnes de 600 à 979 px), `battle.css` (combat).
- Les captures qui font foi (dans `.superpowers/brainstorm/*/content/`) : `v2-hq`, `v2-opp-d1`, `v3-opp`, `t2-hq`, `t2-opp`, `battle-new-390`, `battle-new-768`. Les autres (hq-a/b/c, side-d1/d2, v2-opp-d2, t1-*, battle-now-*) sont des variantes écartées ou l'état actuel.
- Défauts connus du prototype, à corriger : le bas arrondi de « Mes troopers » (`.box1bottom`) est coupé depuis que `.tipbox` est caché, et le logo de la barre chevauche un peu la bande de rayures.

## Ce qui reste au constructeur

- L'ordre exact des règles CSS, les noms de classes complémentaires et les marges fines, tant que le rendu correspond aux captures validées.
- Le détail de la réorganisation des pages qui débordent (fiche, classements, historique, mot de passe, choix). Si une page demande un vrai choix de présentation, on fait des captures et Killian tranche.
