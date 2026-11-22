# @mt/engine — moteur de combat MiniTroopers (v1.0.0)

Port TypeScript déterministe du moteur de combat du SWF original de Motion-Twin
(`client_fr.swf`). Zéro dépendance d'exécution, aucun I/O, ni `Math.random` ni `Date` : une même
entrée donne toujours la même sortie.

## API

```ts
import {
  simulateBattle, generateTrooper, toFlashvars, ENGINE_VERSION,
  type BattleInput, type BattleArmyInput, type BattleTrooperInput, type TrooperPref,
  type BattleRecord, type TrooperSnapshot,
} from "@mt/engine";

const record: BattleRecord = simulateBattle(input);   // calcule tout le combat
```

- `simulateBattle(input: BattleInput): BattleRecord` : `troopers` (une ligne `TRP` par trooper
  déployé, dans l'ordre de déploiement), `events` (lignes `EV`, = `Battle.history` du SWF),
  `winner` (`0`, `1` ou `null`) et `graveyard` (ids des morts).
- `generateTrooper(trooper, side, spawnOrder)` : génération d'un trooper (niveau, compétences,
  armes, apparence) depuis sa graine, comme `Ghost` / `Trooper.init` du SWF.
- `toFlashvars(input, gfxUrl)` : sérialise une entrée en flashvars du client original (sert à
  rejouer la même entrée dans l'oracle).
- `ENGINE_VERSION = "1.0.0"`.
- `simulateBattleCapped(input, maxSteps)` : variante à plafond de pas, **pour le banc de
  vérification uniquement** (le SWF et `simulateBattle` n'ont aucun plafond).

Les types d'entrée (`BattleInput`, `BattleArmyInput`, `BattleTrooperInput`, `TrooperPref`) et de
sortie (`BattleRecord`, `TrooperSnapshot`) sont ceux de `src/input/types.ts` et `src/simulate.ts`.
Les autres exports (`Rand`, `Battle`, `Data`, `Trooper`, …) servent au banc `tools/oracle`, ce ne
sont pas des API de jeu.

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
2. `tools/oracle` génère des corpus déterministes (13 familles : basic, levels, forced-skill,
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
