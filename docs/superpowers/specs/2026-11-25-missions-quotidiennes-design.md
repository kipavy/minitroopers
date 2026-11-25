# Toutes les missions chaque jour — conception

## Pourquoi

Aujourd'hui, une seule mission est tirée chaque jour, Exterminer ou Infiltrer. Épique s'y ajoute un jour sur trois, à
partir de 10 recrues. Killian veut **les missions tous les jours**, comme sur le remaster d'Eternaltwin
(cardio.trooperstest.gued.es/hq, observé le 2026-11-25). Le QG y montre cinq boîtes : Choisis un combat, Mission :
Exterminer, Mission : Infiltrer, Mission : Épique et Raid. Les trois missions sont présentes en même temps.

## Objectifs

- Tous les jours, une fois les missions débloquées : **Exterminer** et **Infiltrer**. **Épique** s'y ajoute pour les
  armées d'au moins 10 recrues confirmées (`EPIC_MIN_RECRUITS`, déjà utilisé).
- Chaque mission a ses propres **3 essais** (`MISSION_ATTEMPTS`), sa victoire et son gain, soit 4 crédits (×3 un
  week-end ×3).
- Le QG reprend la disposition de trooperstest, sur des captures validées par Killian.

## Hors sujet

- Ces éléments ne changent pas :
  - le combat des missions et la façon de choisir les adversaires (rats, cible d'infiltration, PNJ épiques) ;
  - le coût de déblocage (`MISSION_UNLOCK_COST`) ;
  - le Raid et les combats du jour.
- Exterminer ne peut toujours être gagnée qu'une fois par jour : le compteur de rats monte d'au plus 1 par jour, ce qui
  protège la progression de 1 à 100.

## À éviter absolument

- Une ligne qui sort d'un cadre ou une boîte mal alignée (vérifié au pixel sur les maquettes).
- `style.css` modifié.
- Une ancienne URL de rediffusion (`/b/view/miss<n>`, partages) qui ne marche plus.

## Approches envisagées

- **Une mission tirée au sort par jour**, comme aujourd'hui. C'est ce qu'on remplace.
- **Exterminer et Infiltrer chaque jour, Épique tirée un jour sur trois à la place d'Infiltrer.** Écartée : trooperstest
  montre les trois en même temps.
- **Les trois missions disponibles chaque jour**, chacune dans sa boîte. **Retenue**, alignée sur trooperstest.
- Mes choix d'implémentation, à confirmer par le développeur s'il voit mieux :
  - stockage : un nouvel état par mission et par jour (table `mission_day`), plutôt que des colonnes en plus dans
    `daily` ;
  - les numéros de rediffusion `/b/view/miss<n>` restent communs à toutes les missions du jour, pour que les liens déjà
    partagés restent valables.

## Règles

### 1. Missions disponibles

- Avant le déblocage : aucune mission jouable (inchangé).
- Après : `exterminate` et `infiltrate` chaque jour. `epic` aussi si `confirmedRecruitCount >= EPIC_MIN_RECRUITS`.
- Il n'y a plus de tirage du type du jour. `missionOfDay`, `freezeMissionType` et la colonne `daily.mission_type`
  deviennent inutiles (colonne laissée en place, plus lue).

### 2. État par mission (mon choix)

- Nouvelle table (migration `011`) `mission_day(army_id, day, type, used, reset, won, target)`, clé
  `(army_id, day, type)`. Elle reprend, pour chaque mission, ce que `daily` gardait pour la mission unique :
  - `used` : nombre d'essais, qui sert de compteur d'URL ;
  - `reset` : essais d'avant un `reset-day` d'administration ;
  - `won` : mission gagnée ;
  - `target` : cible figée pour Infiltrer et Épique.
- La migration recopie chaque ligne de `daily` qui a un `mission_type` vers `mission_day` pour ce type. Les journées en
  cours au moment du déploiement gardent ainsi leurs essais.
- **Le jour du déploiement** (mon choix) : un joueur qui a déjà gagné ou épuisé sa mission unique peut jouer les autres
  missions le même jour. C'est un petit bonus de lancement, plus simple que de les marquer finies. Une journée déjà
  « finie » redevient donc ouverte ce jour-là.
- `fightMission` prend le type, vérifie ses 3 essais et sa victoire, et met à jour sa ligne.
  - Les rats (+1, plafond `RATS_MAX`) et `epic_wins` ne changent pas.
  - Il refuse `epic` sous 10 recrues (`locked`).
- **Droit à l'Épique en cours de journée** (mon choix) : l'armée y a droit si elle a 10 recrues confirmées, **ou** si
  elle a déjà joué l'Épique ce jour-là (une ligne `mission_day` epic existe).
  - Une armée qui repasse sous 10 recrues garde donc ses essais du jour. La boîte reste cohérente avec `fightMission` et
    `dayOver`.
  - Une armée qui atteint 10 recrues dans la journée voit l'Épique s'ouvrir aussitôt, et sa journée n'est plus « finie »
    tant qu'elle ne l'a pas jouée. C'est un cas rare, et voulu.
- `reset-day --what mission` remet à zéro les trois missions du jour.
- `admin show` affiche une ligne par mission.

### 3. Adresses

- Pour jouer : `/b/mission?type=<exterminate|infiltrate|epic>;n=<essais de ce type>;chk=<clé>`. Sans `type` ou avec un
  type inconnu, on revient au QG.
- Les rediffusions restent `/b/view/miss<n>`, avec `n` compté sur toutes les missions du jour, dans l'ordre
  (`modeBattleOfDay`, inchangé). La page d'une rediffusion lit le type de la mission dans le combat enregistré (son
  `mode`).

### 4. Fin de journée

- `dayOver` : chaque mission disponible doit être gagnée ou avoir joué ses 3 essais. Exterminer et Infiltrer, plus
  Épique si l'armée y a droit.
- Missions non débloquées : comme aujourd'hui, elles ne retiennent pas la journée.

### 5. QG (validé par Killian sur captures, 2026-11-25)

- **Ordre des boîtes** : Bataille, Mission : Exterminer, Mission : Infiltrer, Mission : Epique, Raid. Avec les boîtes
  sur deux colonnes, ça donne :
  - Bataille | Exterminer ;
  - Infiltrer | Épique ;
  - Raid.
- Chaque boîte reprend l'affichage actuel de la mission unique :
  - les décors (`attic`, `sewer`, `road`) ;
  - les cases victoire, défaite ou « GO ! » ;
  - la ligne d'info avec le chrono « Nouvelle mission dans ».
- Les identifiants d'info-bulle deviennent uniques par boîte (`miss_tip_<type>`).
- **Épique sous 10 recrues (choix A)** :
  - la boîte est visible, avec une seule case bleue « bloquée » d'origine (`bblock` et `bblock.gif`) qui porte
    « Encore N recrues », où N = 10 − recrues confirmées ;
  - ligne d'info : « La mission Épique s'ouvre à 10 recrues confirmées. »
- **Avant le déblocage (choix D)** :
  - **une seule** boîte, titre « Missions », décor `attic`, avec la case actuelle « Débloquer pour 5 » ;
  - ligne d'info : « Débloque les missions : Exterminer et Infiltrer tous les jours ! » ;
  - pas de boîte Infiltrer ni Épique.
- **Vue verrouillée** (armée protégée, vue par un visiteur), mon choix : les trois boîtes Exterminer, Infiltrer et
  Epique, toujours vides, quel que soit l'état de l'armée.
  - Un inconnu ne peut deviner ni si les missions sont débloquées, ni le nombre de recrues. Aujourd'hui, ces
    informations sont déjà cachées.
  - La grille est la même que pour l'armée débloquée : à capturer aussi.
- Tout le CSS éventuel va dans `extras.css` (`?v=` incrémenté). Les maquettes n'en ont pas eu besoin : les boîtes
  `box2` se rangent seules sur deux colonnes, pourvu qu'un espace les sépare dans le HTML. Mobile : une boîte sous
  l'autre, comme aujourd'hui.

## Laissé au développeur

- Le détail de la migration et des requêtes. Le nom des fonctions (`missionDay(db, id, day, type)` par exemple).
- La façon de transmettre le type au gestionnaire de combat.

## Vérification

- **Tests** :
  - les trois types jouables le même jour, chacun avec ses 3 essais, et une victoire qui ne ferme que sa mission ;
  - Épique refusée sous 10 recrues ;
  - une seule victoire d'Exterminer par jour (les rats montent de 1 au plus) ;
  - la migration conserve la journée en cours ;
  - `reset-day mission` remet les trois à zéro ;
  - `dayOver` attend toutes les missions disponibles ;
  - les URL rejouées ou périmées ne jouent rien ;
  - `/b/view/miss<n>` affiche les combats des trois types ;
  - gains ×3 un week-end ×3.
- **Captures** à 320, 390, 768 et 1280 px du QG dans ces états : avant déblocage, débloqué sous 10 recrues, 10 recrues
  ou plus, une mission gagnée, une mission perdue 3 fois. Mesures CDP : grille alignée, ligne d'info des boîtes comme
  l'original, aucun débordement.
- `--compare` : les pages autres que le QG restent identiques au pixel près.
