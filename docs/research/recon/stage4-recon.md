# Reconnaissance étape 4 (RECON4) — historique, classements, ordre de déploiement, fin de journée, finitions

Sources : `$EX` = `~/minitroopers-work/recon/assets/extra/site-elements` (pages FR/COM originales 2022),
`$S3` = `~/minitroopers-work/recon/stage3/wayback`, `$WB` = `~/minitroopers-work/recon/assets/wayback`,
`$DEC` = `~/minitroopers-work/decomp/orig/scripts` (JPEXS de client_fr.swf), `$GL` = `~/minitroopers-ref`,
`$TS` = `~/minitroopers-work/recon/testsrv`. Flashvars décodées avec `apps/server/test/hxdecode.ts`
(scripts jetables dans le scratchpad de la session du 2026-11-23).

## 1. `/history`

### 1.1 Colonne « Historique des Combats » ($EX fr/history.html l.131-145, $S3 03602485362_history.html l.98)
- Uniquement les combats **subis par infiltration du mode Bataille** (attaque par nom → `/b/fview/<id>`).
  Texte vide archivé, mot pour mot : « Aucune armée adverse ne t'a encore attaquée via l'infiltration du mode Bataille. »
  (`<p>` directement sous le `<h2>`, pas de `<ul>`). Sitemap : l'id numérique `/b/fview/<id>` n'existe que pour l'infiltration.
- Item : `<li class="defeat|win"><a href="/b/fview/<id>"><p><em><img src="/img/defeat.png|win.png"/>\nDéfaite|Victoire</em>\ncontre\n<strong>L'armée de X</strong></p>\n<p class="extra"><span>DATE</span></p></a></li>`
  (`X` = attaquant). Victoire/défaite **du point de vue du défenseur** : b_fview_262579954 (nSun défend, gagnant
  calculé par le moteur = camp 0 = attaquant) ↔ « Défaite » dans l'historique de nSun.
- Nombre : 10 (wiki, research doc « last 10 defensive battles ») ; 3 archivés.
- Dates archivées : « Hier à 12:25 » (fr/hq.html), « Samedi à 14:14 », « Le 27 juillet » (fr/history.html, capture
  ≈ 2022-08-10 d'après les chronos `Timer.alloc` des pages voisines ⇒ samedi 6 août = 4 jours, 27 juillet = 14 jours).
  Règle retenue : aujourd'hui « Aujourd'hui à HH:MM » (UNVERIFIED ; $GL utilise « Aujourd'hui »), veille « Hier à HH:MM »,
  2 à 6 jours « <Jour> à HH:MM » (jour capitalisé), au-delà « Le <j> <mois> » (mois en minuscules, jour sans zéro ;
  UNVERIFIED pour le 1er du mois et l'année). Fuseau : `TZ_GAME`.
- QG : `<ul class="history">` du panneau gauche = `li.newchild` éventuel **puis le dernier combat défensif seulement**
  (fr/hq-levelup.html : 1 item alors que l'historique en a 3 ; fr/hq.html : newchild + 1).

### 1.2 `attackerSide` = camp du spectateur
- b_fview_262581433 (nSun attaque) : armies[0] = nSun, `attackerSide` 0. b_fview_262579954 (« L'armée de la 3°1 boss »
  attaque nSun, `<h1>` attaquant d'abord) : armies[0] = attaquant, armies[1] = nSun, **`attackerSide` 1** et endMsg
  « Ce combat s'est soldé par un échec ! » pour nSun. Le moteur ne lit pas `attackerSide` (gagnant identique avec 0 et 1).
  ⇒ la rediffusion vue par le défenseur passe `attackerSide` = son camp ; l'entrée stockée ne change pas.

### 1.3 Animation des recrues (ClientMode 5) — $EX fr/history.html l.128, com/history.html, $S3 03602485362_history.html
- Embed : `<div id="swf_recuits" class="swf"></div>` dans `td.right` avant `table.log` ; `embedSWF(client_fr.swf,'swf_recuits',670,240,…,{ id : 'recuits', 'class' : 'swf' })`,
  `bgcolor '#F2DDB8'`, sans `wmode`. Flashvars `data`, `chk`, `imageurl` ; `gfx` = **army.swf** (pas mini.swf).
- `ClientMode#5(army, n, bg)` :
  - `army` = `{troopers, __UP2: [], faction: <faction de l'armée>}` ;
  - `troopers[0]` = **1er trooper (slot 0) de l'armée, id = n**, pref conservée ; puis le 1er trooper de chaque recrue,
    ids 0..n-1, pref stockée conservée (null si aucune) ;
  - ordre des recrues : niveau décroissant puis **id d'armée de la recrue décroissant** (16/16 cohérent dans
    fr/load_pos_0_count_16.html, même ordre dans l'animation fr) ;
  - `n` = nombre de recrues affichées (fr : 18 = total ; com : 3 ; S3 : 1) ; plafond 50 (wiki « up to 50 best recruits »,
    UNVERIFIED, aucun cas > 18 archivé) ;
  - `bg` = `{id: BackgroundType#0, gfx: "bg/garden.jpg"}`.
- Page visible seulement si l'armée a au moins une recrue (menu, §5).

## 2. `/ranks` — $EX fr/ranks.html, com/ranks.html, sitemap « Hiérarchie »
- Public (sitemap). `a.company` « Hiérarchie ». Panneau gauche = celui de l'armée visitée (fr/com : armée protégée vue
  sans session ⇒ formulaire `insertpass`, menu absent).
- Texte : `<div class="ranks"><p>\nLe\nclassement\nrassemble\nles\ndifférentes\narmées\nrecrutées\npar\n<a href="<recruteur>/hq" target="_blank">L'armée de R</a> en fonction de leur puissance.</p>`
- Table : `<th>Faction</th>`, `<th>Armée</th>`, `<th>Effectif</th>`, `<th>Puissance</th>` ; 1re ligne `tr.top` = recruteur
  (`<img src="/img/top.png"/>` + lien **sans** `target`) ; puis **10** co-recrues (même recruteur) par puissance
  décroissante, liens `target="_blank"` ; l'armée consultée ajoutée en bas si absente du top 10 (fr : Warp 24) ; aucune
  mise en évidence quand elle y figure (com : Warp 3e). Égalités (fr 265/265, com 18/18, 15/15/15) : ordre non
  déductible ⇒ id croissant (UNVERIFIED).
- Cellule faction : `<div class="faction factionN" onmouseover="mt.js.Tip.show(this,'…<h2>Faction de fol-ecume</h2>…')">`
  — **`<h2>`** sans corps (≠ helper `tip` à `<h1>`) ; FR = « Faction de <hôte de la faction> » (faction 4 = fol-ecume ;
  autres libellés UNVERIFIED) ; com = « Faction <nom anglais> ».
- Recruteur = faction quand l'armée a été créée depuis l'accueil (fr : recruteur « L'armée de Fol-ecume », 6 troopers,
  puissance 114). Chez nous `recruiter_id` est NULL pour ces armées ⇒ recruteur effectif = armée de faction `FACTIONS[faction]`.
- Bouton final `<a href="/hq" class="button5">Retour</a>`.
- Menu « Hiérarchie » : affiché si puissance ≥ 20 (wiki « ≥20 power or 3 troopers bought » ; pages archivées : 0y0 1 trooper
  puissance 20 ⇒ affiché ; 16, 14, 11, 10, 7 ⇒ absent ; 24, 39, 75, 98 ⇒ affiché).
- `/global-ranks` : **n'existait pas** ; seulement sur le serveur de test ($TS hq.html « Global rankings ») et $GL (top 25).

## 3. `/choice` — $EX fr/choice.html, fr/choice-2.html, com/choice.html ; $DEC `§(\x12\x1c\x01§/§\x0bVa\x1e\x02§.as`
- `a.company` « Gérer mon armée » ; texte : « Réorganise ton armée en mettant en priorité tes troopers les plus puissants !
  Pour cela, clique et fais glisser le trooper pour ainsi le changer de place (n'oublie pas de cliquer sur Valider !) : »
- Embed `swf_client` 630×254, `wmode : 'transparent'`, `{ id : 'client', 'class' : 'swf_transparent' }`, gfx mini.swf ;
  boutons `<a href="javascript:_.swfAction('client','save')" class="button5">Valider</a>` et `<a href="/hq" class="button5">Annuler</a>`.
- `ClientMode#1(o)`, clés dans l'ordre : `army` (`;\x1f\x0fJ`) = `{troopers, __UP2, faction}` avec les troopers **dans l'ordre
  de déploiement**, **id = −slot** (slot 0 → 0), `__UP2` = ces ids dans le même ordre ; `C0\b*\x02` = nombre de recrues
  (fr 6 et 18, com 3) ; `T3D\n` = `"/load?"` ; `c\x12sN\x01` = `[]` ; `wW\x01T\x03` = `"/save?c="`.
- SWF : callback JS `save` → `navigateToURL(saveUrl + ids.join(":"), "_self")` ; si nombre > 0, requête
  `loadUrl + "pos=" + page*16 + ";count=16"` ; **en cas d'échec de `/load`, navigation vers `/hq`** ; clic sur un trooper →
  `_.showDetails(id)`.
- `/load` (fr/load_pos_0_count_16.html) : texte brut = tableau Haxe sérialisé des 1ers troopers des recrues (objets trooper
  obfusqués, pref conservée), **id = id de l'armée recrue**, ordre niveau décroissant puis id décroissant, 16 par page.
  Sitemap : « dispositif paraît bloqué ou buggé » ; effet d'une recrue glissée dans l'armée inconnu ⇒ ids > 0 ignorés à
  l'enregistrement (UNVERIFIED).
- Effet en combat (b_fview_262581433, b_view_bat1, b_view_miss1, b_fview_262579954 pour nSun ; b_view_miss2 pour l'armée de
  choice.html) : **les troopers de l'armée sont listés dans l'ordre de déploiement**, ids consécutifs dans cet ordre,
  `spawnOrder` = cet ordre — attaquant comme défenseur. La grille du QG reste dans l'ordre des slots (choice-2 : grille
  Edonnell… ; déploiement McBombewis…).
- Menu « Gérer mon armée » : affiché si ≥ 5 troopers (wiki ; archives : 6, 8, 12 ⇒ affiché ; 1, 2, 4 ⇒ absent).

## 4. `/endDay` — $EX fr/endDay.html, sitemap « Fin »
- « Redirigé sur cette page après le dernier combat disponible pour la journée. » `a.company` « C'est tout pour aujourd'hui ! ».
- Corps : `<div class="over"><img src="/img/art_congrats.png" class="imgcongrats"/>\n<div class="congrats"><p><strong>Félicitations : ton armée s'est bien battue !</strong> Elle pourra faire de nouvelles batailles, tenter de nouvelles missions, et effectuer un nouveau Raid d'ici quelques heures.</p>\n<div class="wait">\nPatiente\nencore\n<img src="/img/anim_small_chrono.gif"/>\n<script …>mt.js.Timer.TIMES="jhms"; mt.js.Timer.alloc('<maintenant>','<prochain minuit>',2,null);</script> avant de pouvoir jouer plus.</div>`
  puis « Pendant ce temps n'hésite pas à visiter les autres jeux de Motion-Twin… » + `box9` de publicités (Arkadeo, Mush)
  et « N'oublie pas non plus de <a href="javascript:_.startRecruit()">Recruter des Troopers</a> et de visiter le
  <a href="/forum">Forum MiniTroopers</a> pour échanger des astuces avec d'autres joueurs ! ».
- Déclencheur exact non archivé (combat seul ? mission et raid ?) ⇒ UNVERIFIED (voir plan).

## 5. Menu gauche (toutes pages archivées, script menu.ts)
| Entrée | Condition | Preuve |
|---|---|---|
| Recruter un trooper | toujours | toutes |
| Historique | ≥ 1 recrue | alfredhitchcock, 03602485362 (1 recrue) ; absent chez agen06, hugov40, amandine0, 0one2 |
| Gérer mon armée | ≥ 5 troopers | §3 |
| Protéger mon armée | pas de mot de passe | déjà livré |
| Hiérarchie | puissance ≥ 20 | §2 |
| Quartier Général | toute page sauf le QG | déjà livré |

## 6. Fiche trooper (Annexe A)
Renommage unique, ré-équipement > capacité, préférences par niveau, montée de niveau : livrés aux étapes 2-3
(`routes/trooper.ts`). Aucune lacune trouvée par rapport à $EX fr/t_0.html.

## 7. Images CSS et polices
- `url()` de `public/css/style.css` absents : `/img/art_1.jpg` (`.box2 .box2bg`, toujours surchargé par un `style` en ligne
  dans nos vues), `/img/buttons/button.png` (`a.sbutton`, jamais émis), `/img/upcup/bg.jpg` (`.headSpecial`, jamais émis),
  `/img/loc/moreg_*.png` (`h1.moreg`, bandeau « Plus de jeux » non reproduit).
- Wayback CDX (2026-11-23) : `moreg_fr.png` (2011-06-13, 9 777 o) et `upcup/bg.jpg` (2014) archivés ; `art_1.jpg` et
  `buttons/button.png` introuvables (data.minitroopers.fr/.com/.es).
- **`/favicon.ico` absent de `public/`** alors que nos vues l'affichent (`.rcount`, compte de recrues de `/history`) et que
  les navigateurs le demandent : 404 sur chaque page. Archivé : `https://web.archive.org/web/20111218041829id_/http://minitroopers.fr/favicon.ico`
  (image/x-icon, 1 410 o, SHA-1 base32 `EOBKFFWDRFZRNY74FHID5IV4SJST5UPJ`, même empreinte sur .fr, data.minitroopers.fr et .com).
- Polices : la seule police externe des pages originales est `Open Sans Condensed:700` (Google Fonts), utilisée
  uniquement par le bandeau promo Braziball (non reproduit). Aucune règle de style.css ne cite Open Sans ni « Forum ».
  ⇒ rien à charger.
