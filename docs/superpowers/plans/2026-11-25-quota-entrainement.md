# Quota à 5 combats + entraînement illimité — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 combats par jour (+1 par Commandement, max 7) avec les cases 6/7 validées, et des combats d'entraînement illimités sans aucun effet, lancés depuis un lien de la case Bataille, contre des adversaires tirés au hasard ou une armée choisie par son nom.

**Architecture:** Le quota change dans `@mt/game` (`battlesPerDay`). Les entraînements vivent dans une **table à part** (`trainings`, migration 009) avec leurs fonctions de repo, une route `routes/train.ts` (page de choix, lancement, replay public) et une vue `views/train.ts` qui reprend la grille d'adversaires de `views/opp.ts`. Le replay réutilise `battlePage` et `playerData` sans modifier `views/battle.ts` (fichier d'une autre session).

**Tech Stack:** Node 24 (TS natif), Hono, node:sqlite, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-24-combats-quota-entrainement-design.md`

## Global Constraints

- `style.css` reste octet pour octet l'original : tout style va dans `apps/server/public/css/extras.css` ; incrémenter `extras.css?v=` dans `views/layout.ts` à chaque modification.
- Ne pas modifier les fichiers du lecteur (autre session) : `views/battle.ts`, `public/js/player.js`, `public/css/player.css`, le SWF. Les consommer seulement (`battlePage`, `playerData`).
- Moteur et entrées de combat inchangés (`buildBattleInput`, `simulateOutcome`, `battleTroopers`).
- Un entraînement n'a **aucun effet** : pas de crédits, pas de ligne dans `battles`, pas de décompte du quota, rien dans `notices`, l'historique, le classement, les stats attaqué/défendu, le biais d'infiltration.
- Textes en français, ton du jeu. Lien du QG : « » S'entraîner (illimité) ». Bouton d'une cellule : « S'entraîner ! ». Champ par nom : titre « Affronte l'armée de ton choix : », bouton « Affronter ! ». Bouton de retirage : « Autres adversaires ». Titre de la page : « Entraînement ». Infobulle du lien : « Combats illimités pour le plaisir : ils ne rapportent rien et ne comptent pas dans tes batailles du jour. »
- Aucun push sans captures validées par Killian (dernière tâche).

## Review Focus

- Entraînement contre sa propre armée (par nom ou id) : refusé avec un message sur la page, rien d'enregistré.
- Nom inconnu, armée vide, `opp` inexistant ou mal formé : message d'erreur sur la page Entraînement, statut 400, rien d'enregistré.
- Lancement sans clé `chk` valide (lien copié, CSRF) : rien d'enregistré, retour à `/b/train`.
- 11e entraînement : le plus ancien de l'armée est supprimé, son replay répond 404 ; ceux des autres armées ne sont pas touchés.
- Armée protégée (QG verrouillé) : pas de lien « S'entraîner » ; `/b/train` d'une armée dont on n'a pas la session redirige comme les autres pages de propriétaire (`ownedArmy`).

---

### Task 1: Quota à 5 (+2 Commandement, max 7) et cases 6/7

**Files:**
- Modify: `packages/game/src/economy.ts:8-12` (`battlesPerDay` : `Math.min(7, 5 + n)`, commentaire mis à jour), `apps/server/public/css/extras.css`, `apps/server/src/views/layout.ts` (`extras.css?v=`)
- Test: `packages/game/test/game.test.ts` (l.~94-98), `apps/server/test/hq.test.ts`, et les tests qui supposent l'ancien quota (relevés : `hq.test.ts:57,59,105,106`, `battle.test.ts:209,452`, `endday.test.ts:52-90`, `mission.test.ts` si concerné, `admin.test.ts:319` lit `battleAllowance`, donc s'adapte seul)

**Interfaces:**
- Produces: `battlesPerDay(troopers)` → 5, 6, 7, 7 pour 0, 1, 2, 3+ troopers ayant la compétence 69.

- [ ] **Step 1: Write the failing tests**
  - game.test.ts : `assert.equal(battlesPerDay([{ skills: [1] }, { skills: [] }]), 5)`, `battlesPerDay([c]) === 6`, `battlesPerDay([c, c]) === 7`, `battlesPerDay([c, c, c, c, c]) === 7`.
  - hq.test.ts : armée sans Commandement → `bcount5` et « Il te reste 5 batailles aujourd'hui ! » ; armée avec 2 troopers à Commandement (même montage que le test existant à `bcount4`) → `bcount7`, 7 cases `bgo2`.
- [ ] **Step 2: Run** `node --test packages/game/test/game.test.ts apps/server/test/hq.test.ts` — Expected: FAIL sur les nouvelles valeurs.
- [ ] **Step 3: Implement** `battlesPerDay`. Puis lancer toute la suite serveur et adapter **uniquement les valeurs** des tests qui encodaient « 3 par jour » (nombre de combats avant `/endDay`, « Il te reste N », `bcountN`) — pas leur logique. CSS (`extras.css`), valeurs validées par Killian pour 7 cases, même principe pour 6 :
  ```css
  .bcount7 { padding-left : 6.5px !important; }   .bcount7 .b { width : 43px; }
  .bcount6 { padding-left : 4.5px !important; }   .bcount6 .b { width : 51px; }
  .bcount6 .b.bgo2 a img, .bcount7 .b.bgo2 a img { width : 26px; height : 22px; object-fit : none; object-position : 0 0; position : relative; left : -3px; }
  ```
  (vide égal des deux côtés : 7,5 px pour 7 cases, 5,5 px pour 6 ; le pictogramme `bgo2.gif` 52×22 est recadré à sa partie gauche, flash du tir compris, et décalé de 3 px pour centrer le char.)
- [ ] **Step 4: Run** `node --test "apps/server/test/**/*.test.ts" "packages/*/test/**/*.test.ts"` — Expected: PASS sauf les 3 tests connus pour échouer sous Windows (`haxeTrim…`, `main.ts: /healthz…`, `one form body limit…`).
- [ ] **Step 5: Commit** `feat(quota): 5 batailles par jour (+1 par Commandement, max 7), cases 6 et 7`

### Task 2: Table et repo des entraînements

**Files:**
- Create: `apps/server/migrations/009_trainings.sql`
- Modify: `apps/server/src/repo.ts` (section « trainings » à la fin)
- Test: `apps/server/test/train.test.ts` (nouveau)

**Interfaces:**
- Produces (repo.ts) :
  - `TRAININGS_KEPT = 10`
  - `interface TrainingRow { id: number; attackerId: number; defenderId: number | null; defenderRef: string | null; input: BattleInput; winner: number | null; createdAt: number }`
  - `insertTraining(db, t: { attackerId: number; defenderId: number | null; defenderRef: string | null; input: BattleInput; winner: number | null; now: number }): number` — insère puis supprime, **dans la même transaction**, les entraînements de cet attaquant au-delà des `TRAININGS_KEPT` plus récents (par id).
  - `trainingById(db, id: number): TrainingRow | null`
  - `recentTrainings(db, attackerId: number): TrainingRow[]` — les plus récents d'abord, au plus `TRAININGS_KEPT`.
- Migration : `CREATE TABLE trainings (id INTEGER PRIMARY KEY AUTOINCREMENT, attacker_id INTEGER NOT NULL REFERENCES armies(id) ON DELETE CASCADE, defender_id INTEGER REFERENCES armies(id) ON DELETE SET NULL, defender_ref TEXT, input TEXT NOT NULL, winner INTEGER, created_at INTEGER NOT NULL); CREATE INDEX trainings_attacker ON trainings(attacker_id, id);` (suivre la façon dont `db.ts` applique les migrations existantes).

- [ ] **Step 1: Write the failing tests** (`train.test.ts`, via `setup()` / `openDb(":memory:")`) :
  - `insertTraining stores a row readable by trainingById` (input/ winner / defender relus à l'identique).
  - `only the 10 most recent trainings of an army are kept`: 11 insertions pour l'armée A et 1 pour B → `recentTrainings(A)` a 10 lignes (ids 2..11 dans l'ordre décroissant), `trainingById(premier de A) === null`, celui de B existe toujours.
  - `a training never touches battles, credits, notices`: après `insertTraining`, `SELECT COUNT(*) FROM battles` et `notices` = 0, crédits inchangés.
- [ ] **Step 2: Run** `node --test apps/server/test/train.test.ts` — Expected: FAIL (exports absents).
- [ ] **Step 3: Implement** migration + fonctions.
- [ ] **Step 4: Run** `node --test apps/server/test/train.test.ts apps/server/test/db.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(train): table des entraînements, 10 derniers gardés`

### Task 3: Tirage des adversaires d'entraînement

**Files:**
- Modify: `packages/game/src/opponents.ts` (ajout), `packages/game/src/index.ts` (export)
- Test: `packages/game/test/opponents.test.ts`

**Interfaces:**
- Produces: `pickTrainingOpponents(p: { self: ArmyRef; candidates: ArmyRef[]; seed: string }): ArmyRef[]` — `OPPONENT_COUNT` adversaires : un tirage **uniforme** (ordre par `fnv1a(seed|id)`) parmi les vraies armées hors `self`, non `isFiller`, de puissance `p` telle que `self.power / 2 <= p <= self.power * 2` (avec `self.power` remplacé par `max(self.power, 10)` comme `pickOpponents`) ; s'il en manque, des armées générées complètent exactement comme la boucle de remplissage de `pickOpponents` (factoriser cette boucle en une fonction interne partagée plutôt que la dupliquer).

- [ ] **Step 1: Write the failing tests**
  - `training draw: only real armies within half..double the own power, never self`: self power 40, candidats de puissance 10, 19, 20, 40 (self), 55, 80, 81 → seuls 20, 55, 80 peuvent sortir ; complété par 2 fillers (`isFiller: true`), 5 au total.
  - `training draw: another seed gives another order among many candidates`: 30 candidats dans la bande → deux graines différentes ne donnent pas la même liste ; la même graine donne la même liste.
  - `training draw: tiny armies use the same floor of 10 as pickOpponents`: self power 5 → bande 5..20.
- [ ] **Step 2: Run** `node --test packages/game/test/opponents.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** the same — Expected: PASS (anciens tests de `pickOpponents` compris).
- [ ] **Step 5: Commit** `feat(train): tirage d'adversaires d'entraînement`

### Task 4: Page Entraînement, lancement et replay

**Files:**
- Create: `apps/server/src/routes/train.ts`, `apps/server/src/views/train.ts`
- Modify: `apps/server/src/routes/index.ts` (enregistrer `registerTrain`), `apps/server/src/views/opp.ts` (exporter la cellule de grille d'adversaire en la paramétrant par l'URL d'action et le libellé du bouton, sans changer son rendu pour `/b/opp`)
- Test: `apps/server/test/train.test.ts`

**Interfaces:**
- Consumes: Task 2 (`insertTraining`, `trainingById`, `recentTrainings`), Task 3 (`pickTrainingOpponents`), `foeOf`, `foeByName`, `buildBattleInput`, `battleTroopers`, `simulateOutcome`, `battlePage`, `playerData`, `ownedArmy`, `isSessionKey`.
- Produces (routes, préfixe d'armée comme les autres pages) :
  - `GET /b/train` — page « Entraînement » (même cadre que `/b/opp` : panneau des troopers à gauche) : grille de `OPPONENT_COUNT` adversaires tirés avec `pickTrainingOpponents` et une graine aléatoire à chaque visite, chaque cellule ayant un bouton « S'entraîner ! » vers `/b/train/fight?opp=<ref>;chk=<key>` ; un formulaire par nom (POST `/b/train/fight`, champs `friend`, `chk`) ; un lien « Autres adversaires » vers `/b/train` ; la liste des entraînements récents (`recentTrainings`) : adversaire, victoire/défaite, lien vers le replay ; `?err=<code>` affiche le message de `BATTLE_ERRORS` (réutiliser l'export de `routes/opp.ts`) avec le statut 400.
  - `GET|POST /b/train/fight` — clé `chk` invalide → redirection `/b/train` ; résout l'adversaire (`foeOf(opp)` ou `foeByName(friend)`), refuse soi-même (`self`), inconnu (`missing`), vide/impossible (`invalid`) par une redirection `/b/train?err=<code>` ; sinon simule, `insertTraining`, redirige vers `/b/tview/<id>`. Pas de transaction de quota, pas de `n=`.
  - `GET /b/tview/:id{[0-9]{1,10}}` — **public** (comme `/b/fview`) : `battlePage` avec `heading: \`Entraînement : ${attacker} VS ${defender}\``, `endMsg` « Tu as remporté ce combat ! » / « Ce combat s'est soldé par un échec ! » (jamais de « +N »), `endUrl` et `back` = `/b/train` de l'armée attaquante quand la session est la sienne, sinon `/`, pas d'`og`, `battleId` = `t<id>` ; 404 `missingPage` si l'id n'existe plus.

- [ ] **Step 1: Write the failing tests** (dans `train.test.ts`, armée « warp » + adversaire « foe » montés comme dans `battle.test.ts`) :
  - `/b/train shows 5 opponents with "S'entraîner !" links, the by-name form and "Autres adversaires"`.
  - `a training against an opponent of the list: replay page, no credits, no battle, quota unchanged` : crédits, `COUNT(*) battles`, « Il te reste 5 batailles » au QG identiques avant/après ; redirection vers `/b/tview/<id>` ; la page contient « Entraînement : » et l'`endMsg` sans « + ».
  - `training by name against another army works; against itself is refused (err=self); unknown name gives err=missing; nothing stored`.
  - `training without a valid chk stores nothing and goes back to /b/train`.
  - `the defender sees nothing: no notice, nothing in its history, its HQ unchanged`.
  - `/b/tview/<id> is public; after 11 trainings the oldest one answers 404`.
  - `/b/train lists the recent trainings with their replay links`.
- [ ] **Step 2: Run** `node --test apps/server/test/train.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `node --test apps/server/test/train.test.ts apps/server/test/battle.test.ts` et `npx tsc -b` — Expected: PASS, tsc sans erreur.
- [ ] **Step 5: Commit** `feat(train): page Entraînement, combat et replay`

### Task 5: Lien « S'entraîner » dans la case Bataille du QG

**Files:**
- Modify: `apps/server/src/views/hq.ts` (`battleBox`, l.~60-77), `apps/server/public/css/extras.css`, `apps/server/src/views/layout.ts` (`extras.css?v=`)
- Test: `apps/server/test/hq.test.ts`

**Interfaces:**
- Produces: dans la ligne `hqtip` de la case Bataille, avant le texte, `<a href="<armée>/b/train" class="train-link" …infobulle…>» S'entraîner (illimité)</a>`, présent aussi quand les batailles du jour sont épuisées, absent sur le QG verrouillé.

- [ ] **Step 1: Write the failing tests**: `HQ battle box links to the training page (also when no battle is left)` ; `locked HQ has no training link`.
- [ ] **Step 2: Run** `node --test apps/server/test/hq.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**. Style de la maquette B validée : `float : right; font-weight : bold; color : #7a4a12; text-decoration : underline; margin-right : 4px;`.
- [ ] **Step 4: Run** `node --test apps/server/test/hq.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(train): lien « S'entraîner (illimité) » dans la case Bataille`

### Task 6: Captures pour validation (pas de push)

- [ ] **Step 1:** Serveur local sur une copie de la base de démo (armée `demo` + rivales), dont une armée avec 2 troopers à Commandement (ou modifier ses `choices` en local) pour voir 7 cases, et une avec 1 Commandement pour 6.
- [ ] **Step 2:** Captures (Brave sans interface, profil vierge, 1280×800 et 1472×757) : QG à 5, 6 et 7 cases avec le lien ; page Entraînement (grille, formulaire, liste récente) ; replay d'entraînement ; zoom ×3 sur les cases 6 et 7 (marges et char centré mesurés dans la page).
- [ ] **Step 3:** Les envoyer à Killian, attendre son accord explicite avant tout push.
