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
- Paliers de parrainage 100 / 50×3 / 10×10 / 5×20 / 0 (`referralBounty`) : $EX/html/fr/history.html et l'historique Wayback de RECON3 §5 ($GL décalé d'un).
- Formes des armées de mission et de raid (rats, PNJ, recrues, numérotation des ids) : 13 combats archivés décodés, RECON3 §1–2 ; `npcArmy`, `ratArmy`, `buildModeInput` les reproduisent.
- Raid phase 1 = puissance 11 (`raidPower(1)`) : 3 raids archivés à 1 PNJ niveau 7, RECON3 §3.
- Parcours complet de l'étape 3 dans un vrai navigateur, dans les deux modes d'URL (test « [e2e …] referral, mission and raid » de `apps/server/test/e2e.test.ts`) : parrainage confirmé sur `/history`, mission et raid rejoués par le SWF avec le vainqueur enregistré, mot de passe posé par `/protect` (contrôle d'origine des POST).
- Parcours de l'étape 4 dans un vrai navigateur, dans les deux modes d'URL (test « [e2e …] stage-4 pages » de `apps/server/test/e2e.test.ts`) : aucune réponse 404 du site sur `/`, `/hq`, `/t/0`, `/add`, `/b/opp`, `/b/view/bat1`, `/history`, `/ranks`, `/choice`, `/protect`, `/endDay` ; « Valider » de `/choice` envoie à `/save` l'ordre affiché par le SWF (grille de 32 cases, cases vides en entrées vides, ignorées) ; l'animation des recrues de `/history` reste sur la page.

## Jeu hors combat (`@mt/game`)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Crédits de départ | `STARTING_CREDITS = 0` | aucune trace d'un cadeau initial (infobulle originale « Crédits : tu les gagnes en combat ») ; $GL met 100 | `packages/game/src/economy.ts` |
| Offres quotidiennes | graine = FNV-1a 32 bits de `jour\|clientId\|recruteur\|sel\|slot` ramenée dans [273018, 16491340] (collisions décalées), couleur 3..5 | formule serveur originale inconnue ; entrées connues = jour, ordinateur, lien de recrutement | `packages/game/src/offers.ts` |
| Générateur de noms | `[préfixe] base+suffixe [postfixe]`, tables dérivées du corpus extrait des pages originales (`packages/game/data/names-corpus.json`, `scripts/extract-names.mjs`), ≤ 12 car., probabilités 1/6 (préfixe) et 1/5 (postfixe) | tables originales inconnues (côté serveur) | `packages/game/src/names.ts` |
| Liste de sous-domaines réservés | liste du serveur de test (`www, local, data, admin, …`) + `a` | `Common.hostValid` original : seulement `≥ 3` car., `www`, `local`, `data` connus | `packages/game/src/host.ts` |
| Noms d'armée avec `.` | `host()` garde `.` (port exact d'app.js) ; `validateArmyName` rejette tout nom dont le host contient `.` | un point créerait un sous-domaine à plusieurs labels ; règle serveur originale inconnue | `packages/game/src/host.ts` |
| Noms d'armée inadressables | `validateArmyName` rejette un host qui commence ou finit par `-` (dont `---`) ou commence par `xn--` (« Ce nom ne peut pas servir d'adresse. », texte de notre cru) | un label DNS ne commence ni ne finit par `-` ; `xn--` est un label punycode que les navigateurs refusent (`new URL("http://xn--a.mt.localhost")` lève une erreur) ; règle originale inconnue | `packages/game/src/host.ts` |
| Intervalle des couleurs d'offre | 3..5 | seules les valeurs 3..5 observées sur l'accueil (cosmétique) | `packages/game/src/offers.ts` |
| Armée de faction 3 (« Torses velus ») | roster généré (6 troopers, niveaux 20..10, choix à 0, noms du générateur, graines FNV-1a `faction\|3\|torses-velus\|slot`), numéro de faction 3 et article « des » (part 4) supposés | jamais archivée : Wayback CDX sans résultat pour `*torse*` / `torses-velus` / `torse-velu` (Wayback hors ligne, 503, le 2026-11-23) | `packages/game/data/factions.json` (`verified:false`), `packages/game/scripts/gen-faction3.ts` |
| Choix des 5 adversaires | armées réelles (≠ soi, sans doublon) par anneaux de puissance : fenêtre 10 % de la puissance propre (min 10), doublée jusqu'à 5 trouvées mais plafonnée à ±50 % (une armée réelle plus éloignée n'est jamais tirée : sinon les 6 factions semées, puissance 114, prenaient les 5 places d'une armée neuve de puissance 5) ; ordre dans un anneau par hash(jour\|client\|id) ; complété par des armées de remplissage à ±20 % | règle originale inconnue (wiki « near power » ; listes d'époque tardive peu serrées : 14,14,21,14,79) | `packages/game/src/opponents.ts` |
| Armées de remplissage | puissance exacte demandée (min 5) ; ceil(puissance/40) troopers (1..12), niveaux répartis également, choix à 0, noms du générateur, faction tirée ; id `filler:<puissance>:<graine>` | aucune armée générée à l'origine (listes tardives pleines d'armées de puissance 14) | `packages/game/src/fillers.ts` |

## Serveur (`apps/server`, accueil / QG)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Limite de création | 2 armées par jour de jeu et par IP | « ~2 armées/jour/IP » du wiki, chiffre non confirmé | `apps/server/src/routes/home.ts` `MAX_ARMIES_PER_IP_PER_DAY` |
| Faction sans recruteur | faction tirée par hash(jour, client) parmi `FACTIONS` (stable entre l'affichage et le POST) ; `recruiter_id` NULL | « recruteur aléatoire » de l'original non détaillé | `apps/server/src/routes/home.ts` |
| Faction d'une recrue | celle du recruteur (armée stockée ou faction non encore semée) | recherche de l'original (recrues héritent de la faction) | `apps/server/src/routes/home.ts` |
| Auto-parrainage | une recrue créée depuis le même `cid` que son recruteur est confirmée avec prime 0 ; le rang de prime est le rang de création parmi les recrues (confirmées ou non) | contrôle de l'original inconnu ; anti-abus | `apps/server/src/repo.ts` `confirmRecruits` |
| Erreur « tselect hors offres » | fenêtre d'erreur « Cette action nécessite que tu sois enregistré sur le site. » | seul message d'erreur des pages archivées ; autres erreurs (nom pris, limite, mot de passe, armée inconnue) : textes FR de notre cru | `apps/server/src/routes/home.ts`, `routes/hq.ts` |
| Machine id (`mid`/`midc`) | non reproduit : le « poste » est le cookie `cid` ; pas de SWF `swf_regmid` | l'`mid` original vient d'un SWF 1x1 non reproductible sans `chk` | `apps/server/src/views/home.ts` |
| Cookie de session | `ssid` porte un jeton aléatoire de 128 bits (`sessions.token`) ; la clé de 6 caractères reste le `chk` anti-CSRF des URL d'action | l'original semblait utiliser la même valeur pour le cookie et le `chk` ; écart volontaire : une URL d'action vue suffisait sinon à prendre l'armée | `apps/server/src/session.ts`, `migrations/004_session_token.sql` |
| Connexion « As-tu déjà une armée ? » | `POST /login` ouvre une armée sans mot de passe pour quiconque tape son nom ; avec mot de passe : scrypt, 10 essais/10 min par IP+armée, 40/10 min par IP ; `GET /login` redirige sans toucher à la session | l'original n'avait pas d'autre contrôle ; limites à nous | `apps/server/src/routes/hq.ts`, `src/password.ts` |
| `/hq` d'une armée par un tiers | protégée : grille des troopers puis formulaire de mot de passe, sans menu (hq.html) ; non protégée : redirection vers sa page de recrutement | comportement de l'original non capturé | `apps/server/src/routes/hq.ts` |
| Noms d'armée | texte brut seulement : rejet des caractères de contrôle, de format (0-largeur, bidi), substituts isolés, U+FFFD, séparateurs de ligne, privés/non assignés | règle serveur originale inconnue ; protège pages, infobulles et flashvars | `apps/server/src/validate.ts` |
| Tuile de bataille gagnée / perdue | gagnée si `winner === attackerSide` de l'entrée stockée ; infobulles « Tu as remporté / perdu cette bataille ! » (par analogie avec « Tu as remporté la mission du jour ! ») ; « Il te reste N bataille(s) aujourd'hui ! », « Tu as terminé tes batailles du jour ! » à 0 | textes 0/1 reste non capturés | `apps/server/src/views/hq.ts` |
| Infobulles de compétences | seules les 22 infobulles archivées (accueil, `/add`, fiche, montée de niveau) ; les autres compétences n'affichent que leur nom ; `{name}` remplace le trooper d'exemple | les descriptions FR ne sont pas dans le SWF ; l'indice du sprite `skills.png` = id de la compétence (20 colonnes de 30 px, vérifié sur 19/20 infobulles) | `apps/server/scripts/extract-tips.mjs`, `data/tips.fr.json` |
| Déverrouillage des réglages par niveau | arme dès le niveau 1 (si plus d'une arme), localisation 2, ciblage 3, comportement 5, priorité 6 ; un champ verrouillé n'est pas affiché et est ignoré s'il est posté | wiki « Prefs by level » ; non observable dans les pages archivées (fiches de haut niveau) | `apps/server/src/prefs.ts` |
| Rééquipement (`?equip=`) | tirage d'un sous-ensemble de `carryCapacity` équipements (moteur `reequip`), déterministe par (graine du trooper, nombre de choix) : revisiter au même niveau redonne le même jeu, une montée de niveau retire ; le jeu gardé est mémorisé dans `pref.selectedItems` et conservé aux montées de niveau suivantes ; lien « Rééquiper » (libellé FR non archivé, « Re-equip » en EN) | résultat original jamais capturé | `apps/server/src/routes/trooper.ts`, `routes/levelup.ts`, `views/trooper.ts` |
| Renommage : caractères | texte brut seulement (mêmes rejets que les noms d'armée), 1..12 unités UTF-16 après `trim` Haxe ; lien « Renommer » masqué une fois renommé | règles serveur originales inconnues ; erreurs en français de notre cru | `apps/server/src/validate.ts`, `views/trooper.ts` |
| Offres de `/add` | mêmes 5 offres que l'accueil (jour, poste, recruteur = armée qui a recruté), moins celles déjà dans l'armée ; une offre déjà achetée rejouée redirige vers `/hq` sans débit | dérivation originale inconnue ; protège la double soumission | `apps/server/src/routes/add.ts` |
| Crédits insuffisants à l'achat | fenêtre d'erreur « Tu n'as pas assez de crédits pour ajouter ce trooper. » ; à la montée de niveau on retombe sur la fiche sans message (comme l'original) | texte non archivé | `apps/server/src/routes/add.ts` |
| Fenêtre de félicitations | stockée en base (table `notices`, JSON) et affichée une seule fois sur le prochain `/hq` du propriétaire ; texte de `hq-levelup.html` | l'original passait par la session/redirection, non capturé | `apps/server/src/routes/levelup.ts`, `views/levelup.ts` |
| Erreur de choix de compétence | « Cette compétence n'est pas proposée. » (redirection `/levelup/<n>?err=skill`) ; URLs d'action liées au niveau (`lv=`) et toujours suivies d'une redirection | texte non archivé ; empêche le rejeu d'une URL d'action | `apps/server/src/routes/levelup.ts`, `routes/trooper.ts` |

## Serveur (`apps/server`, adversaires et combats)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Refus d'attaque | « Cette armée n'existe pas. » (texte original du sitemap pour une armée inconnue) pour un nom introuvable ou une armée sans trooper ; « Tu ne peux pas attaquer ta propre armée. », « Cet adversaire ne fait pas partie de ta liste du jour. », « Ce combat est impossible. » : textes de notre cru, en fenêtre d'erreur sur `/b/opp?err=<code>` | refus jamais capturés | `apps/server/src/routes/opp.ts` `BATTLE_ERRORS` |
| URL d'attaque | `/b/battle?opp=<id>;n=<combats déjà faits>;chk=KEY` (et champ caché `n` du formulaire « Infiltrer ! ») ; une URL rejouée (rechargement, double clic, requêtes simultanées) ne combat pas et redirige vers le combat qu'elle a produit (`/b/view/bat<n+1>`) | l'original n'a que `opp` et `chk` ; `n` rend l'URL inerte une fois utilisée | `apps/server/src/routes/battle.ts`, `repo.ts` `fight` |
| Attaque par nom | consomme un combat du jour, compte dans les tuiles du QG, redirige vers `/b/fview/<id>` ; une armée de faction non stockée est attaquable par son nom (`defender_ref = faction:<host>`) | sitemap : `/b/fview/<id>` après le formulaire ; décompte non documenté | `apps/server/src/routes/battle.ts`, `src/foes.ts` |
| Quota du jour épuisé | `/b/opp` et `/b/battle` renvoient au QG (tuiles « Tu as terminé tes batailles du jour ! ») | la page `/endDay` originale suppose missions et raid (étapes 3-4) | `apps/server/src/routes/opp.ts`, `routes/battle.ts` |
| Graine de combat | `randomInt(1, 2^30)` (crypto) | plage originale inconnue (graines archivées < 2^25) ; toute graine int32 se rejoue à l'identique | `apps/server/src/routes/battle.ts` |
| Message de fin « défaite » du combat qui vient d'être joué | « Tu as perdu cette bataille ! Ton armée gagne +1 [T] » | seule la victoire est archivée (« Tu as remporté cette bataille ! Ton armée gagne +2 [T] », b_fview_262581433) ; rediffusions : « Tu as remporté ce combat ! » / « Ce combat s'est soldé par un échec ! » (archivés), du point de vue du défenseur quand c'est lui qui regarde | `apps/server/src/routes/battle.ts` |
| Page « vient d'être joué » | la première vue d'un combat par l'attaquant (colonne `battles.seen`) : message « +N [T] », `endBattle()` → `/hq?money=N`, pas de bouton ; vues suivantes : rediffusion (`/hq`, bouton « Retour ») | l'original distinguait par la session (non capturé) ; pages archivées des deux sortes | `apps/server/src/routes/battle.ts`, `views/battle.ts` |
| Grille d'un adversaire | `ymax = ceil(n/4)`, hauteur 72×ymax, classe `size<ymax>` | seules des grilles de 1 ligne (285×72, size1) et 2 lignes (285×144, size2) archivées | `apps/server/src/views/opp.ts` |
| `/b/fview/<id>` | public (comme l'original : historique, factions) ; 404 « Combat introuvable » sinon | droits d'accès originaux non documentés | `apps/server/src/routes/battle.ts` |
| Armées de faction semées | `npm run admin -- seed-factions` et premier démarrage : armées `is_faction`, sans mot de passe, 0 crédit, troopers identiques à `factionBattleArmy` ; une fois semées elles entrent dans les tirages d'adversaires comme toute armée stockée (donc seulement pour les armées à ±50 % de leur puissance) | statut et propriétaire des armées de faction originales inconnus | `apps/server/src/admin/factions.ts`, `src/main.ts` |
| Connexion à une armée de faction | jamais ouverte par son nom (`POST /login` redirige vers sa page de recrutement) | sans propriétaire ni mot de passe, n'importe qui la prendrait | `apps/server/src/routes/hq.ts` |
| Mode sous-domaines en local | `BASE_DOMAIN` à un seul label refusé (vérifié par le test « [e2e cookies] » de `apps/server/test/e2e.test.ts` : Chromium ne renvoie pas un cookie `Domain=localhost` à `<armée>.localhost`) ; utiliser `mt.localhost` ; non vérifié dans Firefox/Safari | comportement des navigateurs pour les domaines sans point | `apps/server/src/config.ts` |

## Missions, raids, PNJ (`packages/game`, étape 3)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Type de mission du jour | hachage `jour\|armée\|mission\|sel` ; exterminer/infiltrer à parts égales, épique 1 jour sur 3 dès 10 recrues | règle d'origine inconnue (un type par jour archivé) | `packages/game/src/missions.ts` |
| Croissance de l'épique | `epicPower(victoires) = raidPower(victoires + 11)` | épique archivé = 325 ≈ phase 11 ; croissance non documentée | `packages/game/src/raid.ts` |
| Cible d'infiltration | une fois sur deux parmi les armées déjà combattues (s'il y en a), sinon uniforme | wiki : choix « biaisé » sans détail | `packages/game/src/missions.ts` |
| Graines et choix des PNJ | graines `random(100000)`, choix 0/1 équiprobables, ordre des tirages de notre cru | formes archivées seulement (graines < 100 000, choix 0/1) | `packages/game/src/npc.ts` |
| Rats du jour | tirés d'un hachage `jour\|armée\|rats\|sel` (mêmes pour les 3 essais) | dérivation serveur inconnue | `packages/game/src/rats.ts` |
| Constantes `Data` (5, 3, 4, 4, 20, 100) | déblocage 5, 3 essais, mission 4, raid 4, 20 phases, 100 par combat | constantes SWF non nommées | `packages/game/src/economy.ts` |
| Lien d'attaque périmé | « Cette attaque n'est plus valable. » (`/b/opp?err=stale`) quand une URL d'attaque rejouée visait un autre adversaire que le combat déjà livré | texte jamais capturé | `apps/server/src/routes/opp.ts` |
| Poste créateur de `/protect` | seul le navigateur dont le cookie `cid` = `armies.created_cid` crée le premier mot de passe ; `created_cid` des armées d'étape 2 repris par la migration 005 de la plus ancienne session liée à l'armée ; `created_cid` resté NULL (aucune session, armée CLI sans mot de passe) : création refusée à tous (bloc « depuis l'ordinateur… »), l'admin pose le mot de passe par `set-password` (`MT_ARMY_PASSWORD`) ; le changement (ancien mot de passe requis) n'est pas limité au poste | `mid` d'origine = SWF ClientMode 3, non reproductible | `apps/server/src/routes/protect.ts` |
| Messages d'erreur de `/protect` | « Les deux mots de passe sont différents. », « Ancien mot de passe incorrect. », « Mot de passe vide. », « Mot de passe trop long (100 caractères au maximum). », « Ton mot de passe a été enregistré. » | textes jamais capturés | `apps/server/src/routes/protect.ts` |
| Sessions déliées au changement | les autres sessions de l'armée sont déliées à chaque enregistrement de mot de passe (création comprise) | comportement d'origine inconnu | `apps/server/src/repo.ts` (`setPassword`) |
| Tuile de déblocage des missions | une tuile `bgo2` « Débloquer pour 5 [token] » → `/b/unlock?chk=KEY` (débite une seule fois, puis `/hq`) ; refus faute de crédits : popup « Pas assez d'argent pour débloquer la mission. » | tuile jamais archivée ; textes de $GL | `apps/server/src/views/mission.ts`, `routes/mission.ts` |
| Tuiles des essais restants | tuiles `bgo2` → `/b/mission?n=<essais faits>;chk=KEY`, infobulle « Il te reste N essais pour la mission du jour ! » ($GL) ; masquées après une victoire ; infobulle d'un essai perdu : « Ce combat s'est soldé par un échec ! » | seul le QG après une victoire au 1er essai est archivé | `apps/server/src/views/mission.ts` |
| Message « vient d'être joué » d'une mission | victoire : « Tu as remporté la mission du jour ! Ton armée gagne +4 [T] » (`endBattle` → `/hq?money=4`) ; défaite : « Ce combat s'est soldé par un échec ! » (→ `/hq`) ; vues suivantes : textes de rediffusion archivés et bouton « Retour » | seules des rediffusions de missions sont archivées | `apps/server/src/routes/mission.ts` |
| Adversaire de mission figé pour le jour | type figé à la première visite du QG (ou au premier essai) dans `daily.mission_type` ; infiltration : cible dans `daily.mission_target` (armée stockée ≠ soi avec ≥ 1 trooper ; « déjà combattues » = défenseurs de mes combats et attaquants des miens ; à défaut une armée générée de ma puissance) ; épique : graine des PNJ tirée au premier essai (`npc:<graine>`) ; rats : hachage du jour (sel « missions ») | l'original tirait côté serveur sans trace | `apps/server/src/routes/mission.ts` |
| Côté joueur de l'épique | armée propre puis 1er trooper de chaque recrue confirmée (`pref null`), niveau décroissant (à égalité : ordre de recrutement), jusqu'à 32 ; PNJ `npcArmy({ power: epicPower(victoires), min 32, max 100 })` | ordre archivé (10,8,8…) sans règle d'égalité | `apps/server/src/routes/mission.ts` |
| Plafond des raids | 20 phases par jour : après la 20ᵉ victoire `raid_over` = 1 et la phase reste 20 (la 21ᵉ n'est jamais tirée) | constante SWF `Data` 20 présumée « raid » ; wiki « 20 (21 ?) » | `apps/server/src/repo.ts` (`fightRaid`) |
| PNJ d'une phase de raid | graine = sha256(`jour\|armée\|raid\|phase`) (une phase donnée affronte toujours la même armée) ; attaquants : jusqu'à 100 recrues vivantes, niveau croissant puis ordre de recrutement, sans déploiement initial | dérivation serveur inconnue ; ordre d'origine non documenté | `apps/server/src/routes/raid.ts`, `repo.ts` (`raidRecruits`) |
| Boîte Raid sans recrue / raid terminé | sans recrue : `bcount0` + « Recrute tes amis pour lancer un raid ! » ; terminé : tuile `bwin` (« Tu as remporté le raid ! ») ou `bdefeat` (« Ce combat s'est soldé par un échec ! ») → `/b/view/raid`, compteur `.rcount` des recrues vivantes, « Nouveau raid dans » + chrono | seul le QG avec un raid à lancer est archivé | `apps/server/src/views/hq.ts` |
| Message de défaite d'un raid | « Ce combat s'est soldé par un échec ! » (→ `/hq`) ; rediffusion d'une victoire : « Tu as remporté ce combat ! » + « Retour » ; `/b/view/raid` = dernier raid du jour | seul le message de victoire (1re vue) est archivé | `apps/server/src/routes/raid.ts` |
| Plafond des rats d'extermination | `RATS_MAX` = 100 : `armies.rats` ne dépasse jamais 100 (victoire d'extermination : `MIN(rats + 1, 100)` ; `--rats` de la CLI limité à 1-100) | aucun plafond connu de l'original ; 100 = échelle moteur de `RAID_PER_BATTLE` et `EPIC_NPC_MAX` | `packages/game/src/economy.ts`, `apps/server/src/repo.ts` `fightMission` |
| Rats de la première extermination du frère | `create-bro-army --rats 35` (défaut) : `armies.rats` = 35 | « environ 30 à 40 » (observation de la progression d'une vraie armée) | `apps/server/src/admin/cli.ts` |

## Ordre de déploiement (`apps/server`, étape 4)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Recrue glissée dans l'armée sur `/choice` | à l'enregistrement (`/save?c=…`), les ids > 0 (recrues, id = id de leur armée) sont ignorés ; seuls les ids ≤ 0 (troopers, slot = −id) forment l'ordre, qui doit être une permutation exacte des slots (sinon rien n'est enregistré, retour à `/choice`) | effet d'origine inconnu (sitemap : « dispositif paraît bloqué ou buggé ») | `apps/server/src/routes/choice.ts` |
| Trooper acheté après un enregistrement | ajouté à la fin de l'ordre de déploiement (ordre des slots) tant que l'ordre n'est pas réenregistré | comportement d'origine non archivé | `apps/server/src/deploy.ts` |
| Grilles des adversaires de `/b/opp` | une armée stockée est montrée dans son ordre de déploiement (celui où elle défend) | aucune liste d'adversaires archivée ne montre une armée réordonnée | `apps/server/src/foes.ts` (`stored`), `routes/opp.ts` |
| Paramètres invalides de `/load` | `pos`/`count` absents ou non entiers, `count` > 16 : 400 (le SWF retourne alors au QG) | seul `pos=0;count=16` est archivé | `apps/server/src/routes/choice.ts` |

## Historique (`apps/server`, étape 4)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Date d'un combat du jour | « Aujourd'hui à HH:MM » (jours calendaires de `TZ_GAME`) | seuls « Hier à 12:25 », « Samedi à 14:14 » et « Le 27 juillet » sont archivés ; mot repris de $GL | `apps/server/src/dates.ts` |
| Date du 1er du mois, autre année | « Le 1er <mois> » ; jamais d'année | aucun cas archivé | `apps/server/src/dates.ts` |
| Date d'un combat sans `created_at` | « Le <j> <mois> » de sa colonne `day` (combats antérieurs à la migration 006) | heure inconnue | `apps/server/src/views/history.ts` (`defenseItem`), `dates.ts` (`dayDate`) |
| Plafond de l'animation des recrues | 50 recrues au plus (`n` = min(recrues, 50)) | wiki « up to 50 best recruits » ; aucun cas > 18 archivé | `apps/server/src/routes/history.ts` |
| Match nul d'un combat défensif | compté comme une défaite du défenseur (« Défaite », `li.defeat`) comme de l'attaquant | aucun match nul archivé dans un historique | `apps/server/src/repo.ts` (`defensesOf`) |
| Combat défensif au QG d'une armée protégée | affiché aussi sans mot de passe (lien public `/b/fview/<id>`) | fr/hq.html (vue protégée) le montre ; seule cette page est archivée | `apps/server/src/views/hq.ts` (`historyList`) |

## Hiérarchie (`apps/server`, étape 4)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Égalités de puissance dans `/ranks` | id d'armée croissant | ordre d'origine non déductible (fr 265/265, com 18/18, 15/15/15) | `apps/server/src/repo.ts` (`ranking`) |
| Libellé de la faction (infobulle `<h2>`) | « Faction de <hôte de la faction> » pour toutes les factions | seul « Faction de fol-ecume » (faction 4) est archivé | `apps/server/src/views/ranks.ts` |
| Recruteur d'une armée créée depuis l'accueil | l'armée de faction (stockée si semée, sinon décrite par son effectif et sa puissance) ; co-recrues = armées non-faction sans recruteur de la même faction | chez nous `recruiter_id` est NULL pour ces armées ; l'original affiche « L'armée de Fol-ecume » (6 troopers, 114) | `apps/server/src/repo.ts` (`ranking`) |
| Recruteur supprimé | `recruiter_id` passe à NULL (`ON DELETE SET NULL`, migration 005) : l'armée rejoint le groupe de sa faction (recruteur = armée de faction, co-recrues = armées sans recruteur de la même faction) ; la branche « classée seule » de `ranking` n'est que défensive (faction inconnue) | cas absent de l'original | `apps/server/src/repo.ts` (`ranking`), `migrations/005_modes.sql` |
| `/global-ranks` | redirection 301 vers `/ranks` | page absente du jeu archivé (seulement sur le serveur de test) | `apps/server/src/routes/ranks.ts` |
| Menu « Hiérarchie » / « Historique » / « Gérer mon armée » | puissance ≥ 20 / ≥ 1 recrue (confirmée ou non) / ≥ 5 troopers | pages archivées (RECON4 §5) ; seuil de recrue « en attente » non archivé | `apps/server/src/views/panel.ts` (`menuFlags`) |
| Visiteur d'une armée non protégée sur `/ranks` | panneau des troopers sans menu | cas non archivé (le QG redirige ce visiteur) | `apps/server/src/views/panel.ts` |
| `/protect` d'une armée protégée sans son mot de passe | redirection vers `/hq` (formulaire de mot de passe), au lieu de la page de protect-3.html (panneau des troopers, formulaire de mot de passe et formulaire de création du mot de passe) | écart volontaire : la page d'origine montrait à un tiers le formulaire de création, inutilisable sans session | `apps/server/src/routes/owner.ts` (`ownedArmy`) |

## Fin de journée (`apps/server`, étape 4)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Déclencheur de `/endDay` | première vue d'un combat, d'une mission ou d'un raid après laquelle tout est fini : combats du jour ≥ allocation, mission finie (non débloquée, gagnée ou 3 essais), raid fini (`raid_over` ou aucune recrue vivante) ; sinon `/hq?money=N` | RECON4 §4 : seulement « après le dernier combat disponible pour la journée » ; mission et raid sont notre lecture | `apps/server/src/repo.ts` (`dayOver`), `routes/{battle,mission,raid}.ts` |
| Contenu de `/endDay` | publicités Motion-Twin et phrase « Pendant ce temps… » omises ; dernière phrase réduite au lien « Recruter des Troopers » (pas de forum) ; page vers `/hq` tant que la journée n'est pas finie | jeux tiers et forum absents de notre version | `apps/server/src/views/endday.ts`, `routes/endday.ts` |
