# Règles non vérifiables (UNVERIFIED)

Chaque valeur choisie faute de source (SWF > pages archivées > wikis > serveur de test > GitLab)
porte un commentaire `// UNVERIFIED: <raison>` dans le code et une entrée ici.

## Moteur (`@mt/engine`, frontière étape 2)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Rééquipement (`/t/<n>?equip=`) | `carryCapacity` équipements gardés tirés par `rand.random(restants)` ×N, le reste en `leftOver` | l'écran de résultat original n'a jamais été capturé | `packages/engine/src/boundary/trooper.ts` `reequip` |
| Capacité d'emport (`carryCapacity`) | `stat17G` du Ghost complet : 3, 2 si le trooper possède la compétence 54 (Débardeur Bruce), même laissée de côté | le SWF ne lit pas `stat17G` en combat ; sur les 7 troopers archivés avec 54 et un leftOver, « Ghost complet » colle à 5 (2 portant 54 avec 2 objets, 3 laissant 54 avec 2 objets ; PADOVA et kicker portent 3), « objets gardés seulement » à 4 ; les 28 autres portent 3 | `packages/engine/src/boundary/trooper.ts` `carryCapacity` |
| Choix des objets gardés par défaut | `selectedItems` d'abord, puis les premiers équipements dans l'ordre des compétences jusqu'à la capacité | règle du serveur original inconnue ; « les N premiers » ne reproduit que 9 des 35 leftOver archivés (dont le cas net de hq-levelup.html) | `packages/engine/src/boundary/trooper.ts` `defaultLeftOver` |
| Plage de `faction` acceptée | 0..5 | plage du SWF inconnue ; 6 factions observées | `packages/engine/src/boundary/validate.ts` |
| Échappement des chaînes `data=` / `endMsg=` pour `'` et `_` | `'` échappé (`%27`), `_` conservé | jamais présents dans les pages archivées (`! * ( )` y sont échappés, `~` aussi : `%257E` dans html/com/b_view_miss1.html) | `packages/engine/src/input/haxeSerializer.ts` `originalUrlEncode` |

## Vérifié depuis

- Options de montée de niveau affichées = les `choiceCount - 1` premières de `drawOptions()` : html/fr/levelup_0.html (le moteur tire [137, 86, 39], la page propose 137 puis 86).

## Jeu hors combat (`@mt/game`)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Crédits de départ | `STARTING_CREDITS = 0` | aucune trace d'un cadeau initial (infobulle originale « Crédits : tu les gagnes en combat ») ; $GL met 100 | `packages/game/src/economy.ts` |
| Offres quotidiennes | graine = FNV-1a 32 bits de `jour\|clientId\|recruteur\|sel\|slot` ramenée dans [273018, 16491340] (collisions décalées), couleur 3..5 | formule serveur originale inconnue ; entrées connues = jour, ordinateur, lien de recrutement | `packages/game/src/offers.ts` |
| Générateur de noms | `[préfixe] base+suffixe [postfixe]`, tables dérivées du corpus extrait des pages originales (`packages/game/data/names-corpus.json`, `scripts/extract-names.mjs`), ≤ 12 car., probabilités 1/6 (préfixe) et 1/5 (postfixe) | tables originales inconnues (côté serveur) | `packages/game/src/names.ts` |
| Liste de sous-domaines réservés | liste du serveur de test (`www, local, data, admin, …`) + `a` | `Common.hostValid` original : seulement `≥ 3` car., `www`, `local`, `data` connus | `packages/game/src/host.ts` |
| Noms d'armée avec `.` | `host()` garde `.` (port exact d'app.js) ; `validateArmyName` rejette tout nom dont le host contient `.` | un point créerait un sous-domaine à plusieurs labels ; règle serveur originale inconnue | `packages/game/src/host.ts` |
| Intervalle des couleurs d'offre | 3..5 | seules les valeurs 3..5 observées sur l'accueil (cosmétique) | `packages/game/src/offers.ts` |
| Armée de faction 3 (« Torses velus ») | roster généré (6 troopers, niveaux 20..10, choix à 0, noms du générateur, graines FNV-1a `faction\|3\|torses-velus\|slot`), numéro de faction 3 et article « des » (part 4) supposés | jamais archivée : Wayback CDX sans résultat pour `*torse*` / `torses-velus` / `torse-velu` (Wayback hors ligne, 503, le 2026-11-23) | `packages/game/data/factions.json` (`verified:false`), `packages/game/scripts/gen-faction3.ts` |
| Choix des 5 adversaires | armées réelles (≠ soi, sans doublon) par anneaux de puissance : fenêtre 10 % de la puissance propre (min 10), doublée jusqu'à 5 trouvées ; ordre dans un anneau par hash(jour\|client\|id) ; complété par des armées de remplissage à ±20 % | règle originale inconnue (wiki « near power » ; listes d'époque tardive peu serrées : 14,14,21,14,79) | `packages/game/src/opponents.ts` |
| Armées de remplissage | puissance exacte demandée (min 5) ; ceil(puissance/40) troopers (1..12), niveaux répartis également, choix à 0, noms du générateur, faction tirée ; id `filler:<puissance>:<graine>` | aucune armée générée à l'origine (listes tardives pleines d'armées de puissance 14) | `packages/game/src/fillers.ts` |

## Serveur (`apps/server`, accueil / QG)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Limite de création | 2 armées par jour de jeu et par IP | « ~2 armées/jour/IP » du wiki, chiffre non confirmé | `apps/server/src/routes/home.ts` `MAX_ARMIES_PER_IP_PER_DAY` |
| Faction sans recruteur | faction tirée par hash(jour, client) parmi `FACTIONS` (stable entre l'affichage et le POST) ; `recruiter_id` NULL | « recruteur aléatoire » de l'original non détaillé | `apps/server/src/routes/home.ts` |
| Faction d'une recrue | celle du recruteur (armée stockée ou faction non encore semée) | recherche de l'original (recrues héritent de la faction) | `apps/server/src/routes/home.ts` |
| Erreur « tselect hors offres » | fenêtre d'erreur « Cette action nécessite que tu sois enregistré sur le site. » | seul message d'erreur des pages archivées ; autres erreurs (nom pris, limite, mot de passe, armée inconnue) : textes FR de notre cru | `apps/server/src/routes/home.ts`, `routes/hq.ts` |
| Machine id (`mid`/`midc`) | non reproduit : le « poste » est le cookie `cid` ; pas de SWF `swf_regmid` | l'`mid` original vient d'un SWF 1x1 non reproductible sans `chk` | `apps/server/src/views/home.ts` |
| Connexion « As-tu déjà une armée ? » | `POST /login` ouvre une armée sans mot de passe pour quiconque tape son nom ; avec mot de passe : scrypt, 10 essais/10 min par IP+armée, 40/10 min par IP ; `GET /login` redirige sans toucher à la session | l'original n'avait pas d'autre contrôle ; limites à nous | `apps/server/src/routes/hq.ts`, `src/password.ts` |
| `/hq` d'une armée par un tiers | protégée : formulaire de mot de passe (hq.html) ; non protégée : redirection vers sa page de recrutement | comportement de l'original non capturé | `apps/server/src/routes/hq.ts` |
| Noms d'armée | texte brut seulement : rejet des caractères de contrôle, de format (0-largeur, bidi), substituts isolés, U+FFFD, séparateurs de ligne, privés/non assignés | règle serveur originale inconnue ; protège pages, infobulles et flashvars | `apps/server/src/validate.ts` |
| Tuile de bataille gagnée / perdue | gagnée si `winner === attackerSide` de l'entrée stockée ; infobulles « Tu as remporté / perdu cette bataille ! » (par analogie avec « Tu as remporté la mission du jour ! ») ; « Il te reste N bataille(s) aujourd'hui ! », « Tu as terminé tes batailles du jour ! » à 0 | textes 0/1 reste non capturés | `apps/server/src/views/hq.ts` |
| Boîtes Mission / Raid, entrées de menu des étapes 3-4 | verrouillées (« Bientôt disponible ! ») ; boutons « Protéger mon armée » (infobulle « Protège ton armée avec un mot de passe ! ») traduits de la version anglaise | pas encore implémentés ; libellé FR du bouton jamais capturé | `apps/server/src/views/hq.ts` |
| Infobulles de compétences | seules les 22 infobulles archivées (accueil, `/add`, fiche, montée de niveau) ; les autres compétences n'affichent que leur nom ; `{name}` remplace le trooper d'exemple | les descriptions FR ne sont pas dans le SWF ; l'indice du sprite `skills.png` = id de la compétence (20 colonnes de 30 px, vérifié sur 19/20 infobulles) | `apps/server/scripts/extract-tips.mjs`, `data/tips.fr.json` |
