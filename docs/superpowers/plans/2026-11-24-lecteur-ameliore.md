# Lecteur de combats amélioré — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pause, vitesse ×1/8–×32, frise vague/événement, journal français synchronisé, lien `?at=N`, capture, raccourcis, alerte de blocage et mise en page mobile sur toutes les pages de combat, nativement.

**Architecture:** `client_fr_play.swf` reçoit, par le chemin P-code existant (`build.ps1 -Play`, `ffdec -replace`), deux points d'appel et des helpers statiques AS3 dans la classe vide `§(m]a\x02§` ; ils pilotent la boucle d'affichage (état 2 du `Game`) et parlent à la page par ExternalInterface. Le serveur génère le journal depuis l'historique du moteur ; `public/js/player.js` construit la barre de contrôle.

**Tech Stack:** JPEXS FFDec 26.5.0 + JDK 21 x64 portables (`tools/bin/`), AS3/P-code, Node 24 + Hono, Ruffle web (épinglé), Playwright Chromium (`tools/bin/ms-playwright`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-24-lecteur-ameliore-design.md`. **Recherche (noms obfusqués, points d'accroche) :** `docs/research/lecteur-swf.md` — à lire avant les tâches 1 et 2.

## Global Constraints

- Ne jamais modifier le calcul : `Game` état 0, constructeur de `Battle`, lecture de `data` dans `_rsq`. Les patchs vivent à l'état ≥ 1.
- `build.ps1` sans `-Play` (oracle `client_fr_trace.swf`) produit exactement le même SHA-256 qu'avant (`a4afe044c3707993f7d49c7afe4fc6319a8c1012fd3e1fd563cd2b6eb9c1b08c`).
- Code décompilé Motion-Twin : seulement dans `-WorkDir` hors dépôt, jamais committé. `patch-msg.as` ne contient que notre code.
- Construction de `client_fr_play.swf` reproductible (deux dossiers de travail → même SHA-256), SHA-256 committé dans `assets/swf/client_fr_play.swf.sha256`, copie servie `apps/server/public/swf/client_fr_play.swf` identique, URL d'embed `?v=4`.
- Rien installé hors `tools/bin/` ; FFDec avec `APPDATA` redirigé (comme `build.ps1`) ; Playwright avec `PLAYWRIGHT_BROWSERS_PATH=tools/bin/ms-playwright`.
- Textes visibles en français ; commentaires de code en anglais, sobres.
- Index de progression : `idx` = nombre d'entrées de `history` appliquées, de 0 à `total` ; l'entrée de journal surlignée est `idx − 1`.
- Sans `mtReady` 10 s après le chargement, la barre se masque et le combat reste regardable (aucune régression).

## Review Focus

- **Combat juste joué** (`/b/view/batN` premier affichage, `endUrl = /hq?money=N`) : `endBattle()` doit toujours naviguer au clic du bouton de fin, même après un saut ou à ×32 — test e2e tâche 4.
- **`?at=` hors bornes ou non numérique** (`?at=-3`, `?at=abc`, `?at=999999`) : ignoré ou borné à `total`, jamais d'erreur 500 — test unitaire tâche 4.
- **Retour en arrière** (clic sur la frise avant la position courante) : le lecteur est recréé et arrive au bon index — test e2e tâche 4.
- **Raid multi-phases et rats** (missions) : le journal et la frise ont le bon nombre de vagues ; `total` du SWF = longueur du journal — test tâche 3 (rats, raid) et tâche 1 (`total` = `events.length` sur un golden rats).
- **Focus clavier** : les raccourcis marchent sans avoir cliqué dans Ruffle, et ne détournent pas les champs de saisie ni Ctrl+R/F5 — test e2e tâche 4.

---

### Task 1: SWF — infrastructure, progression, pause et vitesse

**Files:**
- Modify: `tools/oracle/instrument/patch-msg.as` (sections `HELPERS_PLAY`, `PC_PLAY_GAME_INIT_FIND/REPLACE`, `PC_PLAY_GAME_FRAME_FIND/REPLACE`, `PC_PLAY_FAST_FIND/REPLACE`)
- Modify: `tools/oracle/instrument/build.ps1` (`-Play` : ajoute ces éditions P-code et recompile `§(m]a\x02§` avec `HELPERS_PLAY`)
- Modify: `tools/oracle/instrument/README.md` (section « client_fr_play.swf » : nouveaux patchs)
- Modify: `assets/swf/client_fr_play.swf`, `.sha256`, `apps/server/public/swf/client_fr_play.swf`, `apps/server/src/views/swf.ts` (`?v=4`)
- Create: `tools/oracle/test/player.test.ts` ; Modify: `apps/server/test/assets.test.ts`, `apps/server/test/battle.test.ts` (`?v=4`)

**Interfaces:**
- Produces (SWF → page, `ExternalInterface.call`) : `mtReady({total:int, checkpoints:int[], waves:int[]})` une fois à l'entrée de l'état 2 ; `mtProgress(idx:int, wave:int)` au plus une fois par image, seulement si changé ; `mtEnd()` quand `Winner` (34) est appliqué. `waves[k]` = index de la k-ième entrée `NewWave` (39), `wave` = nombre de `NewWave` appliqués.
- Produces (page → SWF, `ExternalInterface.addCallback` sur l'élément Ruffle `#battle`) : `mtPause()`, `mtResume()`, `mtSpeed(x:Number)` (borné à [0.125, 32]), `mtState():Object` = `{idx, wave, total, speed, paused, ended}`.
- Produces (helpers statiques de `§(m]a\x02§`) : `mtInit(game)`, `mtFrame(game)` ; tâche 2 y ajoute ses fonctions.

- [ ] **Step 1: Write the failing test** `tools/oracle/test/player.test.ts` (skippé si Chromium absent, comme `e2e.test.ts`) : charge `assets/swf/client_fr_play.swf` avec les flashvars d'un golden de `tools/oracle/golden/basic` (via `toFlashvars`, page servie localement avec `bg.jpg`, `army.swf`, Ruffle de `apps/server/public/ruffle`) et des fonctions globales `mtReady/mtProgress/mtEnd` qui enregistrent leurs appels. Tests :
  - `mtReady.total === record.events.length` et `waves.length` = nombre de lignes `EV` de type NewWave du golden ; même chose sur un golden de `golden/rats`.
  - à vitesse ×32 (`battle.mtSpeed(32)` juste après `mtReady`), `mtEnd` arrive en moins de 1/8 du temps mesuré à ×1 sur le même combat (mesurer ×1 sur un golden court).
  - après `mtPause()`, `mtState().idx` ne change pas pendant 1 s ; après `mtResume()`, il augmente.
  - `mtProgress` : les `idx` reçus sont croissants, le dernier vaut `total`.
- [ ] **Step 2: Run** `node --test tools/oracle/test/player.test.ts` — Expected: FAIL (`mtReady` jamais appelé).
- [ ] **Step 3: Implement.** Points d'accroche et noms P-code : `docs/research/lecteur-swf.md` §1–3, §6. `mtInit` au passage état 0 → 1 (même point que `PC_GAME`) ; le site d'appel de `frame()` à l'état 2 devient `mtFrame(game)` : accumulateur `acc += speed; n = floor(acc); acc -= n`, n appels à `frame()` plafonnés par ~10 ms (`getTimer`), 0 en pause ; sous ×1, `stage.frameRate = 40 × speed` (et 40 au-delà) ; drapeau « rapide » (`§Bl{K\x01§` renvoie aussi vrai quand `speed ≥ 8`). `idx = total − queue.length − (step ? 1 : 0)`.
- [ ] **Step 4: Build twice** `build.ps1 -Play -WorkDir <A>` puis `<B>` — Expected: même SHA-256 ; puis `build.ps1 -Verify` (trace) — Expected: SHA-256 `a4afe044…` inchangé.
- [ ] **Step 5: Run** `node --test tools/oracle/test/player.test.ts apps/server/test/assets.test.ts apps/server/test/battle.test.ts` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(swf): replay API — progress, pause and speed`.

### Task 2: SWF — saut, blocage, capture

**Files:**
- Modify: `tools/oracle/instrument/patch-msg.as`, `build.ps1` (si un nouveau point d'appel est nécessaire), `README.md`, les SWF et `.sha256`, `tools/oracle/test/player.test.ts`

**Interfaces:**
- Consumes: tâche 1 (`mtInit`, `mtFrame`, état `idx`).
- Produces: `mtSeek(n:int)` (page → SWF ; n borné à [0, total]) ; `mtStuck(idx:int)` (SWF → page, une fois par blocage) ; `mtShot():String` (page → SWF) = pixels ARGB 720×440 de la scène en base64 (`BitmapData.draw(stage)` + `getPixels`).

- [ ] **Step 1: Write the failing tests** dans `player.test.ts` :
  - `mtSeek(n)` avec n au milieu d'une vague puis n = premier index de la vague 2 : `mtProgress` atteint exactement n puis la lecture reprend à la vitesse courante ; `mtSeek(total)` déclenche `mtEnd`.
  - `mtSeek` vers un index déjà dépassé : sans effet (le retour arrière est géré par la page, tâche 4), `mtState().idx` inchangé.
  - `mtShot()` : base64 décodé = 720 × 440 × 4 octets, pas tous identiques.
  - Blocage : combat dont l'image de fond ne charge pas (URL `imageurl` en 404) → `mtStuck` appelé dans les 12 s.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (recherche §4 et §6) : saut au dernier `CheckPoint` ≤ n en généralisant le saut Espace `§KV\t\x16\x03§` (vider aussi la file d'à-coups `§~Y\x12(\x01§`), puis avance rapide invisible (`game.§\x011wD§.visible = false`, drapeau rapide) jusqu'à n, réparti sur plusieurs images (budget ~10 ms) ; blocage : étape courante en attente > 500 ticks, ou état 1 > 10 s.
- [ ] **Step 4: Build twice + trace inchangée** (comme tâche 1, étape 4).
- [ ] **Step 5: Run** `node --test tools/oracle/test/player.test.ts` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(swf): replay API — seek, stuck warning, screenshot`.

### Task 3: Journal du combat (serveur)

**Files:**
- Create: `apps/server/src/battleLog.ts`, `apps/server/test/battleLog.test.ts`
- Modify (si des textes manquent) : `packages/engine/scripts/gen-engine-data.mjs` et `packages/engine/src/data/swfTables.gen.ts` (table de textes UI `§\x16IT\x04§`, recherche §7)

**Interfaces:**
- Produces: `export interface LogLine { i: number; w: number; t: string }` et `export function battleLog(input: BattleInput): LogLine[]` — une ligne par entrée de `simulateBattle(input).events` (même ordre, `i` = index), `w` = numéro de vague (0 avant le premier `NewWave`), `t` = phrase française courte avec noms de troopers (ex. « Rambo tire sur Kevin : 12 dégâts », « Nouvelle vague », « Victoire de L'armée de X »). Les entrées purement techniques (`CheckPoint`, `Positions`, `Anim`…) ont `t = ""` et ne s'affichent pas, mais gardent leur index.

- [ ] **Step 1: Write the failing tests** : `battleLog(goldenInput).length === record.events.length` sur un golden `basic`, `rats` et `large` ; le nombre de valeurs distinctes de `w` = nombre de `NewWave` + 1 ; la dernière ligne non vide est « Victoire de <nom de l'armée gagnante> » (nom de l'armée du côté `winner`) ; aucun `t` ne contient `undefined`/`null`/`NaN`.
- [ ] **Step 2: Run** `node --test apps/server/test/battleLog.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** à partir des messages `BattleMsg` (`packages/engine/src/msg/battleMsg.ts`) ; noms de compétences, armes, ordres, statuts depuis `swfTables.gen.ts` / `Data`.
- [ ] **Step 4: Run** — Expected: PASS ; `npm run typecheck` propre.
- [ ] **Step 5: Commit** `feat(server): French battle log from the engine history`.

### Task 4: Page de combat — barre, journal, raccourcis, mobile

**Files:**
- Create: `apps/server/public/js/player.js`
- Modify: `apps/server/src/views/battle.ts`, `apps/server/src/routes/battle.ts` (`?at=`, log), `apps/server/public/css/style.css` (bloc `.mtp-*`, `?v=6` dans le layout), `apps/server/test/battle.test.ts`, `apps/server/test/e2e.test.ts`

**Interfaces:**
- Consumes: tâches 1–2 (API SWF), tâche 3 (`battleLog`).
- Produces: `BattleView` gagne `log: LogLine[]` et `at: number | null` ; la page contient `<script>var mtLog = …; var mtAt = …;</script>` (via `jsStr`/JSON échappé) et `player.js`.

- [ ] **Step 1: Write the failing tests** :
  - unitaires (`battle.test.ts`) : la page de combat contient `player.js`, `mtLog` (JSON avec autant d'entrées que d'événements) ; `?at=5` → `mtAt = 5` ; `?at=-3`, `?at=abc` → `mtAt = null` ; `?at=999999` → borné à `total` ; aucun 500.
  - e2e (`e2e.test.ts`, les deux modes d'URL) sur un combat joué : la barre apparaît ; clic pause → `mtState().paused` ; vitesse ×32 → fin atteinte et le bouton de fin mène toujours à `endUrl` ; clic sur une ligne du journal (en avant) puis sur une vague antérieure (retour : lecteur recréé) → `idx` attendu ; `?at=N` démarre à N ; touche Espace/K sans clic préalable met en pause ; F5 non intercepté ; capture → un téléchargement PNG de 720×440 ; fenêtre 390×844 → pas de défilement horizontal.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `player.js` : barre sous le lecteur dans le style des boutons de l'original (lecture/pause, vitesses ×1/8 ×1/4 ×1/2 ×1 ×2 ×4 ×8 ×16 ×32, frise des vagues avec curseur, capture, « Copier le lien » `?at=idx`, aide `?`), journal repliable synchronisé (ligne `idx − 1` surlignée et visible), raccourcis (Espace/K pause, ←/→ événement, N/P vague, Début/Fin, +/− vitesse, C capture, ? aide ; ignorés dans les champs de saisie et avec Ctrl/Meta), alerte rouge sur `mtStuck` avec « Vague suivante » ; retour arrière = recréer le lecteur via `swfobject.embedSWF` puis `mtSeek(n)` à `mtReady` ; capture = canvas 720×440 rempli depuis `mtShot()` → `toBlob` PNG ; mobile : lecteur mis à l'échelle à la largeur (CSS `transform` sur le conteneur), barre tactile. Sans `mtReady` après 10 s : barre masquée.
- [ ] **Step 4: Run** `npm test` (suite complète, e2e compris avec Chromium) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): enhanced battle player — controls, synced log, shortcuts, mobile`.

### Task 5: Documentation

**Files:** Modify: `README.md` (section Fonctionnalités : « Lecteur de combats amélioré », mention que `v1.0.0` garde le lecteur d'origine), `apps/server/README.md` (paramètre `?at=`).

- [ ] **Step 1:** rédiger ; **Step 2:** `npm test` vert ; **Step 3: Commit** `docs: enhanced battle player`.
