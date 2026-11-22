# Étape 1 — Banc différentiel et moteur de combat — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un moteur de combat MiniTroopers en TypeScript pur qui produit, pour toute entrée, exactement le même historique de combat que le SWF original `client_fr.swf`, prouvé sur un corpus de 10 000 combats.

**Architecture:** on instrumente `client_fr.swf` pour qu'il imprime, après calcul, son tableau `history` (le SWF calcule tout le combat d'avance dans `Battle.history: {type: BattleMsg, time, tid}[]`, puis l'anime) et les fiches des troopers générés. Un exécuteur (Ruffle) produit des fichiers « golden » depuis un corpus d'entrées aléatoires. Le moteur TS est porté module par module depuis la décompilation, et un outil de diff signale le premier événement divergent. Les golden committés permettent à la CI de vérifier sans Ruffle.

**Tech Stack:** Node 24.12 (TypeScript natif par effacement de types, `node --test`), npm workspaces, JPEXS FFDec (décompilation/édition SWF, nécessite Java 21), Ruffle (web via Playwright/Chromium headless en priorité, `ruffle_desktop.exe` en repli).

**Spec:** `docs/superpowers/specs/2026-11-22-minitroopers-remake-design.md` (sections « Moteur et banc différentiel », « Approches »). Référence jeu : `docs/research/original-game.md`.

**Source de référence (lecture seule, MIT, YesLifeTechnology 2026) :** clone GitLab `eternaltwin/minitroopers/minitroopers`, noté `$GL` ci-dessous. Le cloner dans `C:\Users\kikik\minitroopers-ref` (hors du dépôt) au début de la tâche 1 : `git clone https://gitlab.com/eternaltwin/minitroopers/minitroopers.git C:\Users\kikik\minitroopers-ref`. Fichiers utiles : `packages/shared/src/serializer.ts`, `packages/shared/src/helperSerial/*`, `packages/shared/src/swfData.model.ts`, `packages/shared/src/combat/battleInput.ts`, `packages/shared/src/combat/flash-port/**` (sortie JPEXS brute, **pas** du TS exécutable), `flash-port/identifier-map.json`, `apps/client/src/assets/swf/*.swf`.

## Global Constraints

- Dépôt GitHub **privé** `kipavy/minitroopers` ; les SWF Motion-Twin vivent dans `assets/swf/` et ne sortent jamais vers un dépôt public.
- Node **24.12**, ESM, TypeScript exécuté nativement (`node --test`, pas de bundler). `tsc --noEmit` pour le typage (`erasableSyntaxOnly: true`, donc pas d'`enum` TS ni de `namespace` : utiliser des objets `as const`).
- `packages/engine` : **zéro dépendance** d'exécution, aucun accès I/O, aucun `Math.random`/`Date` ; déterministe.
- Ruffle ne sert qu'au dossier `tools/oracle` (dev). Aucun code de `packages/` n'importe `tools/`.
- Oracle = `assets/swf/client_fr.swf` (original) instrumenté. `client_fr_edit.swf` n'est pas une référence.
- Ruffle fait foi ; un écart attribué à un bug Ruffle est consigné dans `docs/oracle/ruffle-quirks.md`, jamais corrigé silencieusement.
- Attribution MIT : `NOTICE` cite « minitroopers (Eternaltwin), MIT, Copyright (c) 2026 YesLifeTechnology » pour tout code repris de `$GL`.
- Arithmétique AS3 : reproduire exactement `Math.trunc`, entiers 32 bits (`| 0`, `>>> 0`) et flottants double là où l'AS3 les utilise. Ne jamais « simplifier » une expression décompilée.
- Commits avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Combats de grande taille (32 contre 32, raid/epic)** : le diff doit rester correct et l'oracle ne doit pas expirer ; le corpus inclut des tailles 20–32 (tâche 4).
2. **Ordre d'itération des collections** : l'AS3 itère les objets/`IntHash` dans un ordre précis ; un `Map`/objet JS peut différer. Test dédié dans la tâche 6 (ordre d'itération de `IntHash` identique à l'oracle sur un combat à 12 troopers).
3. **Débordements et divisions entières** dans le PRNG et les calculs de dégâts : tests de bornes dans la tâche 5 (graine 2147483646, 1, 0).
4. **Troopers avec plus de 3 équipements et compétences PNJ forcées** (`force`, ex. `SEMELLES_DE_PLOMB`) : présents dans le corpus (tâche 4) puisque Epic/Bibi les utilisent.
5. **Combat à un seul trooper par côté et combat où un côté est vide** : le moteur termine proprement avec le même vainqueur que l'oracle (cas figés dans la tâche 4).

---

## Structure des fichiers

```
package.json                     workspaces, scripts
tsconfig.base.json
NOTICE, LICENSE (propriétaire, privé), .gitignore, .gitattributes (*.swf binary, eol=lf)
.github/workflows/ci.yml         typecheck + tests + golden diff (sans Ruffle)
assets/swf/                      client_fr.swf, client_fr_edit.swf, army.swf, mini.swf (copiés de $GL)
packages/engine/
  src/input/types.ts             BattleInput & co (modèle d'entrée)
  src/input/haxeSerializer.ts    sérialiseur Haxe (port de $GL serializer + helperSerial)
  src/input/flashvars.ts         BattleInput -> flashvars "data=..."
  src/core/rand.ts               mt.Rand
  src/core/num.ts, bmath.ts, arr.ts   mt.bumdum9.*
  src/core/intHash.ts, list.ts   collections Haxe à ordre d'itération fidèle
  src/data/*.ts                  tables Skill, Weapon, Vehicule, BodyLoc, Data (constantes)
  src/msg/battleMsg.ts           enum BattleMsg + formatHaxe()
  src/logic/{square,ent,player,trooper,ghost,battle}.ts   port du moteur
  src/simulate.ts                simulateBattle(input): BattleRecord
  src/index.ts                   API publique
  test/**                        tests unitaires node:test
tools/oracle/
  instrument/README.md           procédure JPEXS reproductible
  instrument/patch-msg.as        corps AS3 injecté
  instrument/build.ps1           client_fr.swf -> assets/oracle/client_fr_trace.swf
  src/runner.ts                  lance Ruffle, collecte la trace -> OracleTrace
  src/corpus.ts                  générateur d'entrées aléatoires étiquetées
  src/capture.ts                 CLI : corpus -> golden via runner
  src/diff.ts                    CLI : golden vs moteur -> premier écart
  golden/<tag>/<id>.json.gz      traces golden committées
docs/oracle/ruffle-quirks.md, docs/oracle/edit-vs-original.md
```

## Types partagés (fixés ici, utilisés par toutes les tâches)

```ts
// packages/engine/src/input/types.ts — forme reprise de $GL combat/types.ts
export type TrooperPref = { /* champs exacts de $GL troopers.model.ts getTrooperPref() */ };
export interface BattleTrooperInput { id: number; name: string; seed: number; type: number;
  choices: number[]; force: number[]; pref: TrooperPref | null; }
export interface BattleArmyInput { faction: number; spawnOrder: number[]; troopers: BattleTrooperInput[]; }
export interface BattleInput { seed: number; background: { gfx: string; id: number };
  armies: [BattleArmyInput, BattleArmyInput]; attackerSide: number; }

// packages/engine/src/simulate.ts
export interface TrooperSnapshot { id: number; side: 0 | 1; line: string } // line = ligne "TRP …" complète (préfixe inclus)
export interface BattleRecord { troopers: TrooperSnapshot[]; // une par ligne TRP, dans l'ordre d'émission
  events: string[];      // lignes "EV …" complètes (préfixe inclus), ordre de Battle.history
  winner: 0 | 1 | null;  // null = arrêt à btime > 50000 (END null|…)
  graveyard: number[]; }

// tools/oracle/src/runner.ts
export interface OracleTrace { formatVersion: 1; swfSha256: string; input: BattleInput; record: BattleRecord; }
```

Format des lignes (identique oracle et moteur ; figé à la tâche 3, référence complète : `tools/oracle/instrument/README.md` § « Format des lignes ») :
- trooper (une ligne à la fin de chaque `Trooper.init`, y compris les troopers apparus en cours de combat ; **uniquement pour les troopers effectivement déployés**, dans l'ordre de déploiement — un trooper jamais déployé, par exemple parce que le combat se termine avant son tour, n'a pas de ligne `TRP`) : `TRP <id>|<side>|<life>|<time>|<lvl>|<skills>|<weapons>|<weapIdx>|<vehicle>|<helmet>|<leader>` — `life`/`time` après init, `lvl` = `ghost.lvl`, `skills` = index des `Skill` de `ghost.skills` **dans l'ordre du tableau** (non trié), séparés par `,` ; `weapons` = pour chaque arme dans l'ordre `<index Weapon>:<munitions>:<réserve>:<drapeau 0|1>` séparées par `,` ; `weapIdx` = index de l'arme courante (`-1` si aucune) ; `vehicle` = index de l'enum véhicule ou `-` ; `helmet`/`leader` = `0|1`.
- événement : `EV <time>|<tid>|<valeur(type)>`, une ligne par entrée de `Battle.history`, émises dès que `resolve()` renvoie `true`, avant animation. Les valeurs sont donc imprimées **dans leur état final, après résolution complète du combat** : un argument mutable (objet, tableau) partagé avec l'état du combat montre l'état de fin de combat, pas celui du moment où l'entrée a été ajoutée.
- l'exécuteur (`tools/oracle/src/runner.ts`) ne garde que les lignes préfixées `TRP `, `EV `, `END ` et la ligne `MTDONE` (l'interpréteur embarqué du SWF peut émettre d'autres `trace()`).
- fin : `END <winner>|<graveyard séparé par ,>` (`winner` = `0|1`, ou `null` si arrêt à `btime > 50000`), puis `MTDONE`.
- format « valeur » (remplace `Std.string`, qui imprimerait les noms obfusqués des constructeurs, pleins de caractères de contrôle) : `null` ; `true|false` ; nombres = AS3 `String(n)` ; chaîne = `"…"` échappée ; tableau `[a,b]` ; enum Haxe = `<index>` ou `<index>(<p1>,<p2>)` ; trooper (instance `Ent`) = `T<id>` ; case = `Q<x>:<y>` ; objet anonyme = `{<clé>=<v>;…}` clés obfusquées échappées et triées (`Array.sort()` AS3) ; échappement `\uXXXX` (hex minuscule) des caractères < 0x20, > 0x7E et de ``\ " | ; = , { } [ ] ( ) < >``.

---

### Task 1: Dépôt, outillage et assets

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/index.ts`, `packages/engine/test/smoke.test.ts`, `tools/oracle/package.json`, `NOTICE`, `LICENSE`, `.gitignore`, `.gitattributes`, `.github/workflows/ci.yml`, `assets/swf/*`

**Interfaces:**
- Produces: scripts racine `npm test` (node --test sur `packages/*/test/**/*.test.ts` et `tools/*/test/**/*.test.ts`), `npm run typecheck` (`tsc -b`), workspace `@mt/engine` exportant `src/index.ts`, workspace `@mt/oracle`.

- [ ] **Step 1:** Cloner `$GL` dans `C:\Users\kikik\minitroopers-ref`, copier `apps/client/src/assets/swf/{client_fr.swf,client_fr_edit.swf,army.swf,mini.swf}` dans `assets/swf/`. Écrire `assets/swf/SHA256SUMS` (`sha256sum`).
- [ ] **Step 2:** Écrire `packages/engine/test/smoke.test.ts` : `import { ENGINE_VERSION } from "../src/index.ts"; assert.equal(typeof ENGINE_VERSION, "string")`.
- [ ] **Step 3:** `npm test` → FAIL (module absent). Créer les package.json/tsconfig, `export const ENGINE_VERSION = "0.0.0"`.
- [ ] **Step 4:** `npm test` et `npm run typecheck` → PASS. CI : `actions/setup-node` 24.12, `npm ci`, typecheck, test.
- [ ] **Step 5:** Créer le dépôt privé et pousser :
  `gh repo create kipavy/minitroopers --private --source . --push` puis commit `chore: scaffold monorepo + assets`.

### Task 2: Modèle d'entrée et flashvars

**Files:**
- Create: `packages/engine/src/input/{types.ts,haxeSerializer.ts,flashvars.ts}`, `packages/engine/test/input/flashvars.test.ts`

**Interfaces:**
- Produces: types ci-dessus ; `serializeHaxe(value): string` ; `toFlashvars(input: BattleInput, gfxUrl: string): string` (retourne `data=<encodé>` identique à `$GL serializeBattleInput` à `gfxUrl` égal).

- [ ] **Step 1:** Test : sur le fixture 1v1 de `$GL combat/simulateBattle.test.ts` (graines 1111111 / 2222222, combat 12345678, BG_GARDEN), `toFlashvars` égale la chaîne produite par `$GL serializeBattleInput` — générer la chaîne attendue une fois avec `$GL` (`npx tsx` dans `$GL`) et la coller dans le test comme littéral.
- [ ] **Step 2:** Test d'aller-retour : `serializeHaxe` sur entiers négatifs, `0`, `2147483647`, chaînes avec `:`/accents, tableaux vides, `null`, enum à arguments.
- [ ] **Step 3:** Lancer → FAIL. Porter `$GL serializer.ts`, `helperSerial/*`, `swfData.model.ts objectObfuscator` et `battleInput.ts` (sans Prisma), en objets `as const` au lieu d'`enum`.
- [ ] **Step 4:** Tests → PASS. Commit `feat(engine): battle input model + Haxe flashvars serializer`.

### Task 3: SWF oracle instrumenté

**Files:**
- Create: `tools/oracle/instrument/{README.md,patch-msg.as,build.ps1}`, `assets/oracle/client_fr_trace.swf` (généré, committé), `docs/oracle/edit-vs-original.md`

**Interfaces:**
- Produces: `client_fr_trace.swf` qui, chargé avec les flashvars d'un combat, imprime via `trace()` : une ligne `TRP` par trooper après génération, toutes les lignes `EV` de `history` dès que le calcul est terminé (avant animation), puis `END`, puis `MTDONE`. Aucune autre modification de logique.

- [ ] **Step 1:** Installer Java 21 (`winget install Microsoft.OpenJDK.21`) et JPEXS FFDec (version figée, release GitHub `jindrapetrik/jpexs-decompiler`, zip sans installeur dans `tools/bin/ffdec/`, ignoré par git, version notée dans le README).
- [ ] **Step 2:** Décompiler `client_fr.swf` (`ffdec -export script out/ assets/swf/client_fr.swf`, hors dépôt). Localiser la classe Battle (obfusquée ; la retrouver via `identifier-map.json` et la fonction `msg(BattleMsg, Object)` qui pousse `{type,time,tid}` dans `history`), l'endroit où le calcul se termine (message vainqueur, `$GL flash-port/logic/Battle.ts:131`) et l'endroit où les troopers sont générés. Consigner chemins/noms obfusqués réels dans le README.
- [ ] **Step 3:** Écrire `patch-msg.as` : à la fin du calcul, boucle sur `history` → `trace("EV " + time + "|" + tid + "|" + Std.string(type))`, puis `END`, puis `MTDONE` ; à la génération, `trace("TRP ...")`. Fixer ici les champs exacts de `TRP` d'après les propriétés réelles et mettre à jour la section « Format des lignes » de ce plan.
- [ ] **Step 4:** `build.ps1` : copie `client_fr.swf`, applique le patch avec `ffdec -replace` (édition AS3 directe ; repli P-code si la recompilation AS3 échoue), écrit `assets/oracle/client_fr_trace.swf` et son SHA-256.
- [ ] **Step 5:** Vérifier l'innocuité : décompiler `client_fr_trace.swf` et `client_fr.swf`, `diff -r` des scripts → seules les méthodes patchées diffèrent. Coller le diff résumé dans le README.
- [ ] **Step 6:** Diff de logique `client_fr.swf` vs `client_fr_edit.swf` (mêmes exports) → `docs/oracle/edit-vs-original.md` : liste des méthodes modifiées par Eternaltwin et si elles touchent le calcul du combat.
- [ ] **Step 7:** Commit `feat(oracle): instrumented client_fr trace SWF`.

### Task 4: Exécuteur Ruffle, corpus et capture des golden

**Files:**
- Create: `tools/oracle/src/{runner.ts,corpus.ts,capture.ts}`, `tools/oracle/test/{runner.test.ts,corpus.test.ts}`, `tools/oracle/golden/**`

**Interfaces:**
- Consumes: `toFlashvars` (tâche 2), `client_fr_trace.swf` (tâche 3).
- Produces: `runOracle(input: BattleInput): Promise<OracleTrace>` ; `generateCorpus(opts: { seed: number; count: number; tag: CorpusTag }): BattleInput[]` ; CLI `npm run oracle:capture -- --tag <tag> --count <n> --seed <s>` écrivant `tools/oracle/golden/<tag>/<NNNNN>.json.gz`.
- `CorpusTag` = `"basic" | "levels" | "forced-skill" | "vehicles" | "specialists" | "large" | "rats" | "edge"`.

- [ ] **Step 1:** Runner, voie principale : page HTML locale servie par un petit serveur `node:http` qui charge Ruffle web (`@ruffle-rs/ruffle`, version figée, en devDependency de `@mt/oracle`) et le SWF avec les flashvars ; Playwright (`playwright` + Chromium, devDependency) récupère les `trace()` via la console (`logLevel` Ruffle réglé pour exposer les traces AVM) jusqu'à `MTDONE` ; délai max 30 s. Repli si les traces ne sortent pas : `ruffle_desktop.exe` (Windows x64, version figée) avec `-P <flashvars> --dummy-external-interface`, lecture de stdout comme `$GL ruffleSimulator.ts`. Consigner la voie retenue dans `tools/oracle/instrument/README.md`.
- [ ] **Step 2:** Test runner (ignoré si Chromium absent : `t.skip`) : le fixture 1v1 de la tâche 2 donne deux exécutions identiques (`deepEqual`), `events.length > 0`, `winner ∈ {0,1}`, et `winner` concorde avec le résultat de `client_fr_edit.swf` lancé de la même façon (sanity check `battleResult`).
- [ ] **Step 3:** Corpus : générateur pseudo-aléatoire déterministe (graine CLI) produisant pour chaque tag :
  - `basic` niveaux 1, 1–6 troopers par côté ;
  - `levels` niveaux 1–30 (`choices` aléatoires 0/1 de longueur niveau−1) ;
  - `forced-skill` un trooper par compétence via `force` (boucle sur tous les index de compétences de `data/`, y compris PNJ et plus de 3 équipements) ;
  - `vehicles`/`specialists` choix orientés vers véhicules/spécialisations niveau ≥ 7 ;
  - `large` 20–32 troopers par côté ;
  - `rats` troopers `type` rat (`TrooperType` de `$GL`) contre 1–12 humains ;
  - `edge` : 1v1, côté vide, graines 0 / 1 / 2147483646, 12 troopers niveau 30.
  Test : même graine → même corpus ; chaque tag respecte ses bornes ; `forced-skill` couvre chaque compétence au moins une fois.
- [ ] **Step 4:** `capture.ts` avec pool de N exécutions parallèles (défaut 4), reprise possible (saute les fichiers existants), gzip JSON. Capturer un premier lot : 200 `basic`, 200 `levels`, tout `forced-skill`, 100 de chacun des autres tags, tout `edge`. Noter durée moyenne par combat dans le README.
- [ ] **Step 5:** Commit `feat(oracle): ruffle runner, corpus generator, first golden batch`.

### Task 5: Outil de diff et noyau déterministe (PRNG, maths)

**Files:**
- Create: `tools/oracle/src/diff.ts`, `packages/engine/src/core/{rand.ts,num.ts,bmath.ts,arr.ts}`, `packages/engine/src/simulate.ts` (squelette), `packages/engine/test/core/rand.test.ts`

**Interfaces:**
- Produces: `class Rand { constructor(seed: number); random(max: number): number; rand(): number; /* + méthodes exactes de mt.Rand décompilé */ }` ; `simulateBattle(input: BattleInput): BattleRecord` (lève `NotImplemented` pour l'instant) ; CLI `npm run oracle:diff -- [--tag t] [--limit n]` qui affiche, par fichier, `OK` ou le premier écart (`index`, ligne attendue, ligne obtenue, 5 lignes de contexte) et un total, code de sortie ≠ 0 si écart.

- [ ] **Step 1:** Tests `Rand` : suite de référence calculée en `BigInt` par la récurrence `seed = seed * 16807 % 2147483647` et la réduction `& 0x3FFFFFFF` vue dans le code décompilé, pour graines 1, 12345678, 2147483646 ; `random(n)` sur 1 000 tirages égal à la référence ; tirages identiques aux valeurs que donne le SWF (une ligne `TRP` ou des `EV` golden dépendant du premier tirage suffisent comme recoupement).
- [ ] **Step 2:** FAIL → porter `mt.Rand` et `mt.bumdum9.{Num,BMath,Arr}` depuis la décompilation (pas depuis `$GL`, qui peut contenir des erreurs de conversion).
- [ ] **Step 3:** PASS. `diff.ts` sur le lot golden → tous en échec `NotImplemented` (attendu).
- [ ] **Step 4:** Commit `feat(engine): deterministic core + golden diff tool`.

### Task 6: Tables de données, collections et génération des troopers

**Files:**
- Create: `packages/engine/src/data/*.ts`, `packages/engine/src/core/{intHash.ts,list.ts}`, `packages/engine/src/logic/trooperGen.ts`, `packages/engine/test/data/trooperGen.test.ts`

**Interfaces:**
- Produces: `generateTrooper(t: BattleTrooperInput, side: 0|1): GeneratedTrooper` et `formatTrooperLine(g: GeneratedTrooper): string` (ligne `TRP`) ; tables `SKILLS`, `WEAPONS`, `VEHICLES`, `BODY_LOCS` en `as const` avec les index du SWF.

- [ ] **Step 1:** Test golden : pour chaque fichier golden (toutes les étiquettes), `generateTrooper` sur chaque trooper d'entrée produit exactement les lignes `TRP` attendues. Test d'ordre : itérer un `IntHash` rempli dans l'ordre des insertions d'un combat à 12 troopers donne le même ordre que l'oracle (ordre des lignes `TRP`).
- [ ] **Step 2:** FAIL → porter les tables (`Data`, `Skill`, `Weapon`, `Vehicule`, `BodyLoc`, `SkillType`, `Status`, `TargetSystem`, `ReloadSystem`, `TrooperType`, `Size`) et la génération graine + choix → compétences/armes/véhicule depuis la décompilation.
- [ ] **Step 3:** PASS sur 100 % des troopers golden. Commit `feat(engine): data tables + trooper generation matching oracle`.

### Task 7: Boucle de combat, terrain, déploiement, tir de base

**Files:**
- Create: `packages/engine/src/msg/battleMsg.ts`, `packages/engine/src/logic/{square.ts,ent.ts,player.ts,battle.ts,trooper.ts}`, `packages/engine/test/logic/basic.test.ts`

**Interfaces:**
- Produces: `simulateBattle` réel ; `BattleMsg` (constructeurs aux noms obfusqués du SWF, `haxeString(msg)`), `class Battle { constructor(input: BattleInput); run(): BattleRecord }`.

- [ ] **Step 1:** Test : `npm run oracle:diff -- --tag basic` → 0 écart ; plus test unitaire `haxeString` (enum sans argument, avec tableau, avec `null`, avec flottant).
- [ ] **Step 2:** FAIL → porter `Battle` (boucle, ticks, Initiative, vagues, Deployment, `msg`/`history`), `Square`, `Ent`, `Player`, et dans `Trooper` : déplacement, tir avec armes par défaut, rechargement, mêlée, chute/mort. Code : traduction ligne à ligne, noms lisibles via `identifier-map.json`, commentaire `// swf: <classe>.<méthode obfusquée>` en tête de chaque méthode.
- [ ] **Step 3:** PASS sur `basic` et `edge`. Commit `feat(engine): battle loop, deployment, basic combat`.

### Task 8: Compétences, statuts et niveaux

**Files:**
- Modify: `packages/engine/src/logic/{trooper.ts,battle.ts,player.ts}` ; Create: `packages/engine/src/logic/ghost.ts`

**Interfaces:**
- Consumes/Produces: mêmes API que la tâche 7.

- [ ] **Step 1:** Critère : `oracle:diff -- --tag forced-skill` et `--tag levels` → 0 écart.
- [ ] **Step 2:** Porter le reste de `Trooper` (toutes les branches de compétences, grenades, munitions spéciales, statuts poison/paralysie/cécité/malédiction, préférences de cible/zone du corps, killshots, désarmement) et `Ghost`. Travailler famille par famille de compétences en filtrant les golden `forced-skill` par index ; commit par famille (`feat(engine): skills <famille>`).
- [ ] **Step 3:** PASS sur les deux tags.

### Task 9: Véhicules, spécialistes, ordres Comms, sabotage, rats, grandes batailles

**Files:**
- Modify: `packages/engine/src/logic/*`

- [ ] **Step 1:** Critère : `oracle:diff` → 0 écart sur `vehicles`, `specialists`, `rats`, `large`.
- [ ] **Step 2:** Porter les branches restantes (moto/tanks/hélico/avion, Pilote/Scout/Espion/Comms/Saboteur/Médecin/Artificier, ordres Comms toutes les 400 ticks, sabotage en début de vague, rats). Commit par sous-système.
- [ ] **Step 3:** PASS sur tous les tags. Commit.

### Task 10: Preuve à 10 000 combats, API publique, CI

**Files:**
- Modify: `packages/engine/src/index.ts`, `.github/workflows/ci.yml` ; Create: `packages/engine/test/golden.test.ts`, `packages/engine/bench/bench.ts`, `docs/oracle/ruffle-quirks.md`

**Interfaces:**
- Produces (API publique pour les étapes 2–4) : `simulateBattle(input: BattleInput): BattleRecord`, `generateTrooper`, `toFlashvars`, types d'entrée, `ENGINE_VERSION = "1.0.0"`.

- [ ] **Step 1:** Capturer le complément pour atteindre **10 000** golden au total (répartition : 3 000 `levels`, 2 000 `large`, 1 500 `vehicles`, 1 500 `specialists`, 1 000 `rats`, reste `basic`/`forced-skill`/`edge`), hors dépôt dans `tools/oracle/golden-full/` (ignoré par git) ; `oracle:diff` sur les 10 000 → **0 écart**. Tout écart corrigé devient un golden committé dans `tools/oracle/golden/regression/`.
- [ ] **Step 2:** `golden.test.ts` : rejoue tous les golden committés (`golden/**`) sans Ruffle → PASS ; ajouté à `npm test` et à la CI.
- [ ] **Step 3:** Bench : 1 000 combats du tag `large` ; noter le temps moyen dans le README du moteur (indicatif, pas de seuil bloquant).
- [ ] **Step 4:** `ruffle-quirks.md` complété (vide si aucun cas). Commit `feat(engine): v1.0.0 — 10k oracle battles, zero divergence` et push.

---

## Hors de ce plan (plans suivants)

Étape 2 (règles `packages/game`, serveur Hono, création d'armée, HQ, recrutement, amélioration, combats quotidiens), étape 3 (missions, raids, parrainage, outil `tools/capture` sur le serveur de test), étape 4 (historique, classements, protection, `/choice`, `/endDay`, Docker). Chacune aura son plan après livraison de l'étape 1.
