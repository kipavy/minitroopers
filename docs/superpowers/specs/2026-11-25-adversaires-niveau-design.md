# Adversaires à son niveau et « Défie une faction » — conception courte

## Pourquoi

Sur une petite instance (Killian et son frère), les 5 adversaires du jour sont toujours les armées de faction. Ces 6 armées
officielles de l'original n'ont pas de joueur et sont figées à 114 de puissance. Elles sont tirées comme de vraies armées
dans une fenêtre de ±50 %, et les armées générées ne servent qu'à compléter. À 88 de puissance, Killian ne voit donc
jamais d'armée à son niveau.

L'entraînement pose le même problème : il tire de la moitié au double de sa puissance, factions comprises. Pour Killian,
« ça n'a aucun intérêt ».

## Objectifs

- Combats du jour (/b/opp) et entraînement (/b/train) proposent des armées **à ±20 %** de sa puissance.
- Les factions sortent des deux tirages automatiques. On peut toujours les défier par un nouvel encadré
  **« Défie une faction : »**, car personne ne connaît leur nom.

## Hors sujet

- La puissance des factions (114) ne change pas.
- Les gains, le quota et le ×3 du week-end ne changent pas.
- Le moteur de combat n'est pas modifié.

## À éviter absolument

- Toute différence d'un pixel sur les autres pages en version ordinateur (`--compare`).
- Tout changement de `style.css`.

## Approches envisagées

- **A.** Fenêtre ±20 % pour toutes les vraies armées, factions comprises. Écartée : à 95–143 de puissance, les factions
  reprennent toutes les places.
- **B. Retenue.** Factions retirées des tirages automatiques, vrais joueurs à ±20 %, complément par des armées générées
  (±20 %). Accès aux factions par l'encadré dédié.
- **C.** Comme B, avec au plus une faction par jour. Écartée au profit de l'encadré, choisi par Killian.

Présentation de l'encadré : trois maquettes ont été capturées sur la vraie page.

- A : dans l'encadré « Infiltre ».
- B : pastilles.
- **C, choisie par Killian** : encadré doré séparé (même style que « Infiltre »), 6 boutons pleins à la couleur de chaque
  faction, en 3 × 2.

## Règles

1. **`pickOpponents` (combats du jour)**
   - Les candidats excluent les factions. Il faut un indicateur `isFaction` sur la référence, ou un filtre chez
     l'appelant (au choix du développeur).
   - La recherche par cercles est conservée (10 % puis 20 % de `max(puissance, 10)`), avec un plafond ramené de 50 % à
     **20 %**.
   - Les places restantes vont aux armées générées (±20 %, inchangé).
   - Le tirage du jour déjà enregistré dans `daily.opponents` reste valable jusqu'au lendemain, ou jusqu'à un
     `reset-day --what battles`.
2. **`pickTrainingOpponents`**
   - Vraies armées hors factions dont l'écart est ≤ 20 % de `max(puissance, 10)`, au lieu de ½–2×.
   - L'ordre est tiré par la graine de la visite (inchangé), puis complété par des armées générées.
3. **Encadré « Défie une faction : »**
   - Il apparaît sur /b/opp et /b/train, juste sous l'encadré « Infiltre / armée de ton choix », dans la même cellule.
   - Il est donc en tête sur mobile, comme l'autre encadré (`order: -1` déjà en place).
   - Boutons dans l'ordre des factions 0 à 5 (rouge, orange, jaune, vert, bleu, violet), fond = `FACTION_COLOURS`.
     La constante est aujourd'hui dans `og.ts` ; elle sera partagée.
   - Texte : le nom court (« Sang-surs »…). Info-bulle : le titre complet (« L'armée de Sang-surs »).
   - /b/opp : un bouton = attaque par nom (`/b/battle?friend=<host>;n=<used>;chk=<clé>`), avec la même confirmation que
     « Infiltrer ! ». Cela compte comme un combat du jour avec le gain normal.
   - /b/train : un bouton = `/b/train/fight?friend=<host>;chk=<clé>`, sans confirmation, comme « S'entraîner ! ».
   - Styles dans `extras.css` (ordinateur et mobile) ; `extras.css?v=` incrémenté.
   - Le bloc est construit une seule fois dans `opp.ts`, à côté de `mateCell`, et partagé entre les deux pages.

## Laissé au développeur

- La forme exacte de l'exclusion des factions.
- Le nom des constantes.
- Le détail du CSS, à condition de rester fidèle à la capture C (encadré `#e2c066`, bord `#86623e`, boutons 34 px avec
  reflet haut et ombre basse, petites capitales).

## Vérification

- Tests unitaires du tirage :
  - plus aucune faction ;
  - fenêtre ±20 % ;
  - complément par des armées générées ;
  - tirage stable pour un même jour.
- Tests des pages : présence des 6 liens avec la bonne URL sur les deux pages.
- Captures 390 / 768 / 1280 px de /b/opp et /b/train, à montrer à Killian avant tout push.
- `--compare` : les autres pages restent identiques au pixel près en version ordinateur.
