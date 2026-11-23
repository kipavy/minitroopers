# Stage 3 recon — missions, raids, parrainage, /protect (RECON3)

2026-11-23. Sources par priorité : SWF > pages archivées > wikis > serveur de test > GitLab ($GL = `~/minitroopers-ref`).
`$EX` = `recon/assets/extra/site-elements` ; `$S3` = `recon/stage3/` (pages Wayback récupérées le 2026-11-23, 9 requêtes,
`wayback/*.html`, flashvars décodées par `assets/tools/hxdec.js` dans `decoded/*.json`).

## 1. Corpus archivé des modes (13 combats décodés)

| Fichier | Mode (fond) | Attaquant (ids, spawn) | Défenseur (ids, spawn) | Puissances | Issue (endMsg) |
|---|---|---|---|---|---|
| `$EX/html/com/b_view_miss1` | Exterminer (attic, Bg#1) | 4 troopers, ids 0..3, `[0..3]` | 1 rat, id 4, `[]` | 39 / 5 | gagné |
| `$S3 03602485362_b_view_miss1..3` | Exterminer (attic) | 1 trooper, id 0, `[0]` | 4 rats, ids 1..4, `[]` | 11 / 20 | perdu ×3 |
| `$EX/html/fr/b_view_miss1` | Infiltrer (sewer, Bg#2) | 8, ids 4..11, `[4..11]` | 4, ids 0..3, `[0..3]` | 98 / 24 | gagné |
| `$EX/html/fr/b_view_miss2` | Infiltrer (sewer) | 6, ids 12..17 | 12, ids 0..11 | 75 / 373 | perdu |
| `$S3 1100gex90_b_view_miss1` (2013) | Infiltrer (sewer) | 12, ids 1..12 | 1 (niv. 1), id 0 | 181 / 5 | gagné |
| `$S3 1100gex90_b_view_miss2,3` | **Epic (road, Bg#3)** | **32** (12 propres + 20 recrues), ids 0..31, spawn `[0..11]` | **100** PNJ, ids 32..131, `[]`, faction 3 | 424 / 784 | perdu ×2 |
| `$EX/html/fr/b_view_raid` | Raid (wood, Bg#4) | 18 recrues, ids 1..18, `[]`, triées par niveau croissant | 1 PNJ niv. 7, id 0, faction 5 | 180 / 11 | gagné |
| `$EX/html/com/b_view_raid` | Raid | 3 recrues, ids 1..3 | 1 PNJ niv. 7, id 0, faction 3 | 17 / 11 | gagné |
| `$S3 03602485362_b_view_raid` | Raid | 1 recrue, id 1 | 1 PNJ niv. 7, id 0, faction 4 | 7 / 11 | perdu |
| `$S3 1100gex90_b_view_raid` | Raid | 6 recrues (niv. 7,8,8,8,8,10 croissants), ids 32..37 | **32** PNJ, ids 0..31 | 79 / 325 | perdu |

`attackerSide` = 0 partout. Ces 13 entrées (+ issue) sont des cas de test de fidélité (moteur sur armées de 100 et 132 troopers).

## 2. Formes des armées (source : flashvars archivées ci-dessus)
- **Rats** : `name:"rat"`, `type` TrooperType#2, `choices []`, `force` = 2 compétences distinctes, toutes dans
  $GL `RatSkills` {112,55,70,76,79,97,74,53,114,117,123,116,131,137} (observées : 131,70,53,76,116,117,123) ; `pref` = objet par défaut
  (move 1, reload 2, cibles 0, CBody/CWeapon null, leftOver []) ; graines < 100 000 (34888, 38341..80487) ; armée faction 0,
  spawn `[]`. L'armée de rats porte 2 champs obfusqués de plus (`c)4p\x03`: 0, `U,*~\x01`: null) que le moteur ignore (banc vert sans).
- **Mêmes rats pour les 3 essais du jour** (miss1..3 de 03602485362 : graines de rats identiques, graine de combat différente).
- **Nombre de rats** : 1 au premier archivage (com), 4 ailleurs ⇒ cohérent avec « 1 + victoires d'extermination » (wiki : croît à
  chaque victoire ; $GL `ratsCount + 1`).
- **PNJ de raid/épique** : `type` humain, graine < 100 000 (max observé 99 607), `choices` aléatoires 0/1 (pas tous 0 comme $GL),
  `force: null`, `pref` objet par défaut (leftOver [] ⇒ gardent tous leurs objets : « PNJ à >3 objets » du wiki), noms du générateur
  (« Burtunoff Yu », « MaxEdando », « Joniwe »), faction 0..5 variable.
- **Recrues (raid, épique)** : 1er trooper de chaque armée recrutée, `pref: null`, `force []`, niveau actuel ; raid : triées par
  niveau croissant (« les plus faibles d'abord ») ; épique : armée propre puis recrues par niveau décroissant (10,8,8,8,8,7…6),
  total 32, spawn = troopers propres seulement.
- **Numérotation des ids** : défenseur d'abord puis attaquant (infiltration, raid — comme `/b/opp`) ; **attaquant d'abord** puis
  adversaires (extermination, épique).
- **Faction** : attaquant = faction du joueur (raid compris).

## 3. Raid
- Puissance de la phase p : $GL `calculateRaidPower(p) = round(0.07556333 i³ + 2.28671329 i² + 1.07362082 i + 11.1958042)`, i = p−1 ;
  nombre de PNJ $GL `getRaidTrooperRange` (p≤2: 1–2, 3: 1–4, 4: 3–6, 5: 4–9, 6: 7–13, 7: 10–16, 8: 16–24, 9: 19–29, 10: 29–32, ≥11: 32).
  **Recoupé** : phase 1 = 11 (3 raids archivés : 1 PNJ niv. 7 = puissance 11) ; raid 1100gex90 = 32 PNJ, puissance 325 ≈ p=11 (326).
- Gain : +4 par phase gagnée (endMsg FR archivé : « Félicitations, tu as remporté le raid ! Ton armée gagne +4 [T] et tu peut tenter
  le raid suivant. » — faute « peut » d'origine ; `endBattle` → `/hq?money=4`).
- Plafond : constante SWF `Data` = 20 placée entre 100 et 500 (bloc présumé « raid ») ⇒ 20 phases/jour ; wiki « 20 (21 ?) ».
  UNVERIFIED (constantes non nommées, non lues par le client).
- Recrues mortes indisponibles jusqu'au reset (infobulle HQ archivée : « …son premier trooper sera disponible pour le Raid jusqu'à ce
  qu'il soit tué en combat ! » ; endDay : « effectuer un nouveau Raid d'ici quelques heures »).
- 100 par combat (constante `Data` 100 ; wiki « pool max 500, 100 per battle ») ; aucun combat archivé > 32 recrues.
- HQ (`$EX/html/fr/hq-levelup.html`) : boîte `Raid` (com : « Raid Phase 2 » quand phase > 1), `.rcount` N + favicon + infobulle
  « Recrues Disponibles », tuile `bgo` → `/b/raid?chk=KEY`, infobulle « Lancer un raid avec les N recrues encore vivantes ! »,
  hqtip « Encore N recrues disponibles pour le raid ! ». Vue `/b/view/raid` (sitemap), pas de `<h1>` (swfframe sans `nam`).
- Pas de boss de raid (aucun dans les 4 raids archivés).

## 4. Missions
- Un type par jour : HQ archivés FR/EN montrent une seule boîte « Mission : Infiltrer » / « Mission: Exterminate » ; sitemap :
  « Mission : Infiltrer », « Mission : Exterminer », « Mission : Epique ». Fonds : sewer / attic / road (flashvars + images de boîte).
- 3 essais jusqu'à la première victoire : `/b/view/miss{1..3}` (sitemap), 03602485362 a 3 défaites le même jour ; HQ archivé après
  victoire au 1er essai : `bcount1` + tuile `bwin` « Tu as remporté la mission du jour ! » + « Nouvelle mission dans » chrono.
- Gain : 4 victoire / 0 défaite (wiki, $GL) ; déblocage 5 crédits une fois (wiki ; $GL `BuyingMissionCost = 5`, mais par type).
  Texte de la tuile de déblocage non archivé ($GL : « Débloquer pour 5 »).
- Infiltration : cible = armée de joueur quelconque (2013 : cible niv. 1 puissance 5 contre 181 ; FR : 24 contre 98, 373 contre 75)
  ⇒ pas d'appariement par puissance ; wiki : biais vers armées déjà affrontées. Titre `<h1>` : « Infiltrer la base de L'armée de X ».
- Épique : dès 10 recrues (wiki), « tous les quelques jours » ; 32 de notre côté (constante `Data` 32), 100 PNJ (constante 100) ;
  croît après chaque victoire (wiki) — loi de croissance inconnue.
- Vues archivées (rediffusions) : endMsg « Tu as remporté ce combat ! » / « Ce combat s'est soldé par un échec ! », `endBattle` →
  `/hq`, bouton « Retour ». Message « vient d'être joué » d'une mission : non archivé.

## 5. Parrainage
- Paliers : historique archivé `$EX/html/fr/history.html` (18 recrues, gains 5,5,5,5,10×6 du plus récent au plus ancien) et
  `$S3 03602485362_history.html` (1 recrue, « Gain : 100 ») ⇒ 100 / 50×3 / 10×10 / 5×20 / 0 confirmés ($GL décalé d'un).
- Confirmation par visite de `/history` : HQ archivé `<li class="newchild"><a href="/history">…newrecruit.gif… Nouvelle recrue
  disponible !` ; recherche (wiki). Liste « Tu as recruté <strong>L'armée de X</strong> » + « Gain : N [token] », phrase finale
  « Tu as <strong>N</strong> [favicon] recrues dans ton armée. Pour augmenter ce nombre, recrute tes amis ! ».
- Animation des recrues : SWF ClientMode 5 (670×240) — étape 4.

## 6. /protect (`$EX/html/fr/protect.html`, `protect-2.html`, `protect-3.html`)
- Création : titre « Protéger mon armée », encadré « Créer un mot de passe pour ton armée empêchera que d'autres joueurs l'utilisent sans
  ton accord. », « Tape un mot de passe de ton choix ci-dessous : », champs `pass`, `passconf`, POST `/protect?submit=1`, boutons
  Valider (confirm « Confirmer cette action ? ») / Annuler.
- Changement : titre « Modifier le mot de passe », « Remplis les champs ci-dessous pour changer ton mot de passe : », `pass` (Ancien
  mot de passe), `newpass`, `passconf`.
- Autre ordinateur : `#bad` « Tu <strong>ne peux pas créer un mot de passe</strong> pour <em>L'armée de X</em> depuis l'ordinateur que tu
  utilises actuellement. » / « Tu pourras le faire que depuis l'ordinateur t'ayant servi à créer cette armée ! » (contrôle `mid` par
  SWF ⇒ chez nous : cookie `cid` de création).
- Menu : bouton « Protéger mon armée » masqué une fois protégé ; lien de pied de page « Modifier mon pass » (`/protect`).
- Messages de succès/erreur (mots de passe différents, ancien faux) : non archivés.

## 7. Constantes `Data` du SWF (`decomp/orig/scripts/§%5Cx17@E{§.as`), ordre de déclaration
14, 5 (XMAX/YMAX), 3, 32, 6, 2, 1, 4, 4, 100, 20, 500, 100, 3, 3, 1, [XP_LEVELS], 5, 4, 400 (période des ordres, lu en combat),
35 (lu en combat — **pas** le seuil de parrainage), 5, 20. Seules 400 et 35 sont lues par le client ; les autres sont des constantes
serveur partagées, correspondance présumée : 3 combats/jour, 32 côté épique, 2/1 gains combat, 4 mission, 4 raid, 100 par combat,
20 phases, 500 réserve, 100 1re prime, 3 essais, 5 déblocage.
