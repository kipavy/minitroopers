# @mt/engine — moteur de combat MiniTroopers (v2.0.0)

Port TypeScript déterministe du moteur de combat du SWF original de Motion-Twin
(`client_fr.swf`). Zéro dépendance d'exécution, aucun I/O, ni `Math.random` ni `Date` : une même
entrée donne toujours la même sortie.

## API

Deux points d'entrée (`package.json` `exports`) :

- **`@mt/engine`** — API de jeu (serveur de l'étape 2) :
  - `validateBattleInput(input)` → `{ ok: true }` ou `{ ok: false, errors }` (enums dans leurs plages, ids
    uniques ≥ 0, graines int32, `choices` ∈ {-1} ∪ [0, choiceCount) rejoués sur le Ghost, noms UTF-16 bien
    formés ≤ 20, compétences valides ; une armée vide est acceptée — cas prouvé par l'oracle —, 0v0 non).
  - `simulateOutcome(input)` → `{ winner, graveyard, deployed, events }` (valide d'abord, lève
    `InvalidBattleInput`).
  - `describeTrooper(t)` → `TrooperSheet` (niveau, vie, spécialité, compétences, armes dans l'ordre du
    sélecteur de la fiche, équipement, leftOver, physique) ; `levelUpOptions(t)` → `{ shown, drawn,
    choiceCount }` ; `choiceIndexForSkill(t, skill)` ; `defaultLeftOver(t)` ; `reequip(t, rand)` ; `carryCapacity(t)` (3, 2 avec Débardeur Bruce).
  - `upgradeCost`, `recruitCost`, `armyPower`, `trooperLevel` (formules de la classe `Data` du SWF).
  - `battleData`, `trooperData`, `gridData`, `midData` (ClientMode 0/2/4/3, octet pour octet comme les pages
    originales) et `clientParams(data, { endMsg?, onclick? })` → `data=…&chk=play&imageurl=/img/…`.
  - `generateTrooper`, `toFlashvars` (flashvars de l'oracle, parité $GL), types d'entrée (`BattleInput`,
    `BattleArmyInput`, `BattleTrooperInput`, `TrooperPref`), `Data` (tables gelées), enums, `Rand`,
    `ENGINE_VERSION = "2.0.0"` (2.0.0 : exports du banc déplacés vers `/internal`, logique de combat inchangée depuis 1.0.0).
- **`@mt/engine/internal`** — banc de vérification uniquement (`tools/oracle`, golden, bench), pas une API de
  jeu : `simulateBattle(input): BattleRecord` (lignes `TRP`/`EV` de l'oracle, `winner`, `graveyard`),
  `simulateBattleCapped(input, maxSteps)` (plafond de pas ; le SWF n'en a aucun), `StepCapExceeded`,
  `DEFAULT_MAX_STEPS`, `Battle`, `Trooper`, `as3Sort`, `OBF_KEYS`, `formatTrooperLine`, `projectGenerated`,
  `trooperProjection`.

`src/` se compile sans les types Node (`tsconfig.json`, `types: []`) ; tests et bench ont leur propre projet
(`tsconfig.test.json`). `test/boundary/purity.test.ts` refuse `node:`, `process.`, `Math.random` et `Date`
dans `src/`.

## Garanties

- **Fidélité** : sur 10 000 combats aléatoires passés dans le SWF original instrumenté (Ruffle),
  le moteur reproduit les mêmes lignes `TRP`, `EV` et `END`, une à une, **0 écart**.
- **Déterminisme** : pas de source d'aléa ou d'horloge ; seul `input.seed` et les graines des
  troopers pilotent le résultat.
- **Pas de plafond de pas** dans `simulateBattle`, comme le SWF ; aucun combat atteignant
  `btime > 50000` sans vainqueur n'a jamais été observé (voir `tools/oracle/instrument/README.md`).

## Comment la preuve fonctionne

1. `assets/oracle/client_fr_trace.swf` = SWF original + `trace()` (troopers générés, tout
   `Battle.history`, vainqueur), sans toucher à la logique.
2. `tools/oracle` génère des corpus déterministes (14 familles (dont `regression`) : basic, levels, forced-skill,
   vehicles, specialists, large, rats, edge, comms, martyr-saviour, jet, sabotage, helicopter) et
   capture la trace du SWF pour chacun (Ruffle web + Chromium headless).
3. `npm run oracle:diff` compare le moteur à ces traces ; `npm run oracle:coverage` vérifie que
   chaque mécanique atteignable (21 compétences actives, 5 véhicules, ordres Comms, statuts,
   chaque message et événement de coup, …) s'est produite au moins 3 fois.
4. **1 617 golden sont committés** (`tools/oracle/golden/`) : `test/golden.test.ts` les rejoue
   dans `npm test` et en CI, sans Ruffle. Les 8 383 autres (graine de corpus 2) vivent hors dépôt
   dans `tools/oracle/golden-full/` (ignoré par git) : total **10 000**, 0 écart.

## Banc d'essai (indicatif)

`node packages/engine/bench/bench.ts [n]` : 1 000 combats du tag `large` (20 à 32 troopers par
côté, entrées des golden), Snapdragon X (Windows ARM64), Node 24 : **≈ 33 ms par combat**
(≈ 33 s les 1 000, ≈ 960 événements par combat), mono-thread.
