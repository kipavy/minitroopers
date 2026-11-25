# Sauts instantanés et bulle d'aide — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tout saut du lecteur de combats en moins de ~150 ms, dans les deux sens, sans recharger Ruffle, avec un écran identique à une lecture directe ; bulle d'aide au survol du « ? » comme BetterTrooper.

**Architecture:** images clés prises pendant le calcul (`mtKf`, lecture seule) et restaurées sur place par `mtGoto(n)` (point de reprise artificiel + rejeu caché synchrone) dans les helpers de `client_fr_play.swf` ; `player.js` route tous les sauts vers `mtGoto` ; bulle d'aide en HTML/CSS.

**Tech Stack:** JPEXS FFDec 26.5.0 + JDK 21 portables (`tools/bin/`), P-code/AS3 (`tools/oracle/instrument/`), Ruffle web épinglé, Playwright Chromium, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-25-sauts-instantanes-design.md`. Recherche : `docs/research/lecteur-swf.md`.

## Global Constraints

- Trace SWF (`build.ps1` sans `-Play`) : SHA-256 inchangé `a4afe044c3707993f7d49c7afe4fc6319a8c1012fd3e1fd563cd2b6eb9c1b08c`. Play SWF reproductible (deux dossiers de travail → même SHA), copie servie identique, `.sha256` à jour, URL d'embed `?v=` incrémentée.
- Seul ajout dans l'état 0 : `mtKf(battle)` après chaque `battle.MnRZ()`, lecture seule ; prouvé par un test d'égalité de l'historique (entrées sérialisées) avec les lignes `EV` de l'oracle sur des combats de référence.
- L'historique (`Battle.history`) n'est jamais modifié par la lecture ou les sauts.
- Code décompilé Motion-Twin jamais committé ; `-WorkDir` hors dépôt. Outils seulement sous `tools/bin/`. Jamais de jonction vers d'autres dossiers.
- Textes visibles en français ; commentaires en anglais, sobres.
- `idx` = nombre d'entrées appliquées (0..total) ; ligne de journal surlignée = `idx − 1`.

## Review Focus

- Saut arrière depuis la fin : bannière de fin et panneau retirés, `ended` remis à faux, `mtEnd` renvoyé quand on revient à la fin.
- Saut au milieu d'une animation de mort ou d'un trooper au sol : il ne se relève pas, le mort ne réapparaît pas.
- Combats avec véhicules, rats, raids multi-phases : la vérification d'état les couvre.
- Saut pendant la pause, puis reprise : la vitesse et la pause sont conservées.
- Coût mémoire des images clés sur le plus grand combat de référence (`large`), mesuré et rapporté.

---

### Task 1: SWF — images clés et `mtGoto(n)`

**Files:** `tools/oracle/instrument/patch-msg.as` (helpers + nouvelle section P-code `PC_PLAY_KF` dans la boucle de l'état 0), `build.ps1` (-Play), `tools/oracle/instrument/README.md`, `assets/swf/client_fr_play.swf` (+ `.sha256`), `apps/server/public/swf/client_fr_play.swf`, `apps/server/src/views/swf.ts` (`?v=7`) et tests qui l'épinglent, `tools/oracle/test/player.test.ts`.

**Interfaces:**
- Produces: `mtGoto(n:int):Boolean` (page → SWF, synchrone, deux sens, n borné à [0, total]) ; `mtSeek(n)` = alias de `mtGoto(n)` ; `mtState()` inchangé plus `kf:int` (nombre d'images clés) ; `mtDump():String` (test seulement : état comparable de chaque trooper à l'écran — id, x, y, PV, état, arme, munitions, casque, véhicule, vivant/mort, corps de la vague) ; `mtHistStr():String` (test seulement : l'historique sérialisé entrée par entrée).

- [ ] **Step 1: Write the failing tests** dans `player.test.ts` :
  - Historique : pour 30 combats de référence variés (basic, rats, large, véhicules, raid), `mtHistStr()` après une lecture complète est identique aux lignes `EV` du golden, et identique avant/après une série de sauts.
  - Équivalence d'état : pour 5 combats, 20 n tirés au hasard (graine fixe) dans les deux sens, `mtDump()` après `mtGoto(n)` = `mtDump()` d'une lecture directe jusqu'à n (nouveau lecteur, `mtSpeed(32)` puis pause à n).
  - Durée : `mtGoto` vers le début de la vague 3, vers 0 depuis la fin et vers total−1 depuis 0 : chacun < 300 ms dans le Chromium du banc (marge pour l'émulation) ; mesure rapportée.
  - Retour depuis la fin : `ended` faux, plus de bannière (`mtState`), puis `mtGoto(total)` renvoie `mtEnd`.
- [ ] **Step 2: Run** `node --test tools/oracle/test/player.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** selon la spec (images clés K = 4 + chaque `NewWave` ; restauration par `CheckPoint` artificiel ; corps, statuts, poses, panneaux ; rejeu caché synchrone ; historique copié et entrées 41/42 restaurées).
- [ ] **Step 4: Build twice** (`-WorkDir` A et B) — Expected : même SHA ; trace : `a4afe044…`.
- [ ] **Step 5: Run** `player.test.ts`, `play.test.ts` et les tests serveur qui épinglent le SWF — Expected : PASS. Rapporter la mémoire mesurée sur le plus grand combat.
- [ ] **Step 6: Commit** `feat(swf): instant seeks from keyframes (mtGoto)`.

### Task 2: Page — tous les sauts par `mtGoto`, bulle d'aide au survol

**Files:** `apps/server/public/js/player.js`, `apps/server/public/css/player.css`, `apps/server/src/views/battle.ts` (`?v=` de player.js/css), `apps/server/test/e2e.test.ts`, `apps/server/test/battle.test.ts`.

**Interfaces:** Consumes Task 1 (`mtGoto`; `mtReady(...).starts[k]` = première image clé après le `NewWave` `waves[k]`, nouvelle vague déployée : cible des sauts de vague et des clics de vague sur la frise, sans rejeu ; `mtState().prof` pour les diagnostics).

- [ ] **Step 1: Write the failing tests** (e2e, mode chemin au minimum) : un saut arrière ne recrée pas l'élément Ruffle (même nœud `#battle`, aucune nouvelle requête de SWF) et arrive au bon `idx` ; ←/→, frise, journal, Début/Fin, `?at=` passent par `mtGoto` ; survol du « ? » → bulle visible ancrée au bouton, avec les sections Clavier/Souris ; sortie de la souris → cachée ; `?` / Ctrl+/ basculent, Échap ferme.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** : supprimer `recreate()` et ses chemins ; un seul chemin de saut `goto(n)` ; bulle reproduisant la référence `scratchpad/work/bt-ref/help-hover.png` (titre « Raccourcis clavier », touches en keycaps, lignes alternées, section « Souris »), positionnée au-dessus/à côté du bouton sans sortir de l'écran, utilisable au clavier (focus).
- [ ] **Step 4: Run** `npm test` ciblé (battle, e2e lecteur) + `tsc -b` — Expected: PASS.
- [ ] **Step 5: Captures** bureau (bulle ouverte) et mobile dans `scratchpad/work/shots/` (suffixe `-v3`) pour validation par Killian.
- [ ] **Step 6: Commit** `feat(web): every seek through mtGoto; hover help bubble`.

### Task 3: Documentation

**Files:** `README.md`, `tools/oracle/instrument/README.md` (si non fait), `docs/research/lecteur-swf.md` (section images clés).

- [ ] Rédiger ; tests de sanité ; commit `docs: instant seeks`.
