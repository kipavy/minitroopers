# Étape 4 — Historique, classements, ordre de déploiement, fin de journée, finitions, Docker — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dernière étape : toutes les pages du menu de 2011 existent (`/history` complet avec combats subis et animation des recrues, `/ranks`, `/choice` qui change vraiment l'ordre des combats, `/endDay`), le menu suit les conditions de l'original, plus aucun 404 d'asset, les dettes DRY sont soldées ; une image Docker auto-hébergeable est prête et vérifiée sans Docker ; le déploiement homelab est une liste de contrôle soumise à Killian ; une instance de démonstration tourne sur ce LXC avec l'armée du frère.

**Architecture:** inchangée. `@mt/engine` gagne les flashvars ClientMode 1 (réorganisation) et 5 (animation des recrues) et la liste `/load`, reproduites octet pour octet depuis les pages archivées. L'ordre de déploiement (`armies.deploy_order`) fixe l'ordre des troopers et le `spawnOrder` de toute `BattleInput` construite ensuite (attaquant comme défenseur), les entrées déjà stockées ne changent pas. Migration 006. Image `node:24.12-bookworm-slim` qui lance `node apps/server/src/main.ts`, données dans un volume `/data`, aucun port publié derrière Cloudflare Tunnel.

**Tech Stack:** inchangée (Node 24.12 TS natif, Hono, `node:sqlite`, `node:test`, Ruffle web épinglé, Playwright headless de `tools/bin`). Docker **absent de ce LXC** (`command -v docker` vide) : l'image est vérifiée par un essai à blanc qui rejoue ses étapes sans Docker.

**Spec:** `docs/superpowers/specs/2026-11-22-minitroopers-remake-design.md` (« Livraison par étapes » 4, « Serveur », « Déploiement », Annexe A : `/history`, `/choice`, `/ranks`, `/endDay`). **Reconnaissance (source des valeurs de ce plan) :** `~/minitroopers-work/recon/stage4-recon.md` (noté `RECON4`, § = section) ; `$EX` = `~/minitroopers-work/recon/assets/extra/site-elements` ; `$S3` = `~/minitroopers-work/recon/stage3/wayback` ; `$GL` = `~/minitroopers-ref`. Dettes : `~/.claude/projects/-home-dev-minitroopers/memory/pre-deploy-todo.md` et lignes « minor (deferred) » de `~/minitroopers-work/stage3-ledger.md`.

**Branche :** `etape4`, créée depuis la tête d'`etape3` (`751d1e0`, étape 3 terminée) : `git switch -c etape4 751d1e0`.

## Global Constraints

- Dépôt privé ; assets Motion-Twin autorisés dans le dépôt, **jamais dans un registre d'images public**.
- Node 24.12, ESM, TS natif, `erasableSyntaxOnly` ; dépendances d'exécution du serveur limitées à `hono` et `@hono/node-server` ; `@mt/engine` et `@mt/game` : zéro dépendance externe, zéro I/O (`@mt/game` → `@mt/engine` seulement).
- Français seul. Textes et HTML repris des pages originales FR (`$EX/html/fr/*.html`, `$S3/*.html`) mot pour mot quand ils existent (un mot par ligne comme l'original).
- Priorité des sources : SWF > pages archivées > wikis > serveur de test > GitLab. Règle non vérifiable → valeur choisie + `// UNVERIFIED: <raison>` + entrée dans `docs/game/unverified.md` (dans la tâche qui l'introduit).
- PC de Killian propre ; données locales dans `var/` (gitignoré).
- Instance publique derrière Cloudflare Tunnel : IP = `CF-Connecting-IP` seulement si `TRUST_PROXY=1` ; cookies `HttpOnly`, `SameSite=Lax`, `Secure` si `PUBLIC_URL` est https.
- Deux modes d'URL de première classe (`URL_MODE=subdomain|path`), tout lien interne par `armyUrl(cfg, host, path)`, y compris les URL passées au SWF (`/load?`, `/save?…`).
- Combats : le serveur calcule avec `simulateOutcome` ; le navigateur rejoue `client_fr_play.swf` ; les deux reçoivent exactement la même `BattleInput` (stockée en base), hors `attackerSide` qui n'est qu'un point de vue (RECON4 §1.2).
- Toute URL d'action porte la clé de session (`chk`) ; toute action finit par une redirection.
- Rien ne touche l'infrastructure de Killian (CT104 `docker.lan`, `/opt/stacks`, Cloudflare) sans son accord explicite (tâche 9).
- Commits terminés par :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` et
  `Claude-Session: https://claude.ai/code/session_01KQAKEPkLFWFrHJudw5MqJT`.

## Review Focus

1. **Ordre de déploiement ↔ combats** : après `/save`, la `BattleInput` stockée et les flashvars de la page listent les troopers dans l'ordre choisi (attaquant et défenseur) ; les combats déjà stockés et leurs rediffusions sont inchangés. Tests tâches 3 et 4.
2. **`/save` en GET** : `chk` obligatoire, permutation exacte des slots exigée, rien d'écrit sinon. Tests tâche 3.
3. **Point de vue du défenseur** : `/history`, QG et `/b/fview` disent Victoire/Défaite du bon côté sans changer le gagnant stocké. Tests tâche 4.
4. **Classement** : armées de faction, de remplissage et inconnues jamais listées comme co-recrues ; armée protégée vue sans session = formulaire de mot de passe. Tests tâche 5.
5. **Exploitation** : aucun port publié, `TRUST_PROXY=1` seulement derrière le tunnel, arrêt propre sur `SIGTERM` (WAL vidé), sauvegarde à chaud. Tests tâche 8.
6. **Migration 006** sur une base peuplée (suppression de `daily.battles_used`, `rats` plafonné) et **bascule de minuit** des combats quotidiens (`?d=`). Tests tâche 1.

---

## Structure des fichiers

```
apps/server/migrations/006_history_order.sql
packages/engine/src/boundary/client.ts (+ input/flashvars.ts)   packages/engine/test/boundary/client.test.ts (+ fixtures/original-pages.json)
apps/server/src/{form,texts,dates,deploy}.ts
apps/server/src/routes/{choice,ranks,endday}.ts  (+ history.ts, battle.ts, hq.ts, mission.ts, raid.ts, index.ts)
apps/server/src/views/{choice,ranks,endday}.ts   (+ history.ts, hq.ts, panel.ts, battle.ts, soon.ts supprimé)
apps/server/src/admin/cli.ts (backup)   apps/server/src/main.ts (healthz, SIGTERM)
apps/server/public/favicon.ico
apps/server/test/{dry,choice,ranks,endday,assets,ops}.test.ts (+ history, e2e)
Dockerfile  .dockerignore  deploy/{compose.yaml,dryrun.mjs,README.md}
docs/game/unverified.md  docs/research/original-game.md  apps/server/README.md
```

---

### Task 1: Socle — migration 006 et dettes DRY

**Files:** Create `apps/server/migrations/006_history_order.sql`, `apps/server/src/{form,texts}.ts`, `apps/server/test/dry.test.ts` ; Modify `repo.ts`, `validate.ts`, `routes/{home,add,hq,protect,trooper,battle,opp,history,mission}.ts`, `apps/server/test/battle.test.ts`, `views/{hq,mission}.ts`, `packages/game/src/{host,index,rats,npc,seeds}.ts`, `tools/oracle/scripts/import-modes.ts`, `apps/server/test/db.test.ts`.

**Interfaces — Produces:**
- Migration 006 : `battles.created_at INTEGER` (NULL pour les combats existants), `armies.deploy_order TEXT` (JSON de slots, NULL = ordre des slots), `ALTER TABLE daily DROP COLUMN battles_used` (jamais lu : le compte vient des lignes `battles`), `UPDATE armies SET rats = MIN(rats, 100)` (`RATS_MAX` de `@mt/game` ; plafond déjà appliqué aux victoires et à la CLI depuis l'étape 3, pas aux armées déjà au-delà). Tout `INSERT INTO battles` pose `created_at = now()` (horloge `deps.now`).
- `formBody(maxSize = 4096): MiddlewareHandler` (`form.ts`) remplace les 6 `bodyLimit(... "Requête trop grande", 413)`.
- `texts.ts` : `ERR_OFFER`, `ERR_RATE` (une seule définition chacun) ; `rateLimited(c, cfg): Response` (429 + `missingPage(ERR_RATE)`) partagé par `/login` et `/protect`.
- `@mt/game` exporte `haxeTrim(s: string): string` ; `validate.ts` l'importe. `battleAllowance(troopers: readonly BattleTrooperInput[]): number` (`routes/opp.ts`) seule voie, utilisée aussi par `routes/hq.ts`.
- `repo.ts` : `POWER_SQL = "SUM(5 + json_array_length(choices))"` réutilisé par `armyPowers` et `armySummaries` ; `creditsOf(db, armyId): number` (remplace le SQL brut de `routes/history.ts`) ; `addNotice(db, armyId, notice: unknown): void` (remplace l'`INSERT INTO notices` de `routes/mission.ts`) ; filtre des recrues mortes écrit une fois.
- **Bogue de minuit des combats quotidiens** : `/b/battle` redirige vers `/b/view/bat<n>` qui cherche le combat avec `today()` ⇒ un combat livré à 23:59:59 n'est plus affiché après minuit. Même correctif que missions et raids à l'étape 3 : redirection vers `/b/view/bat<n>?d=<jour du combat>` (y compris la redirection « double clic » vers le combat existant) et lecture par `viewDay(c, today())` (`routes/owner.ts`, `prevDay` de `@mt/game` : seuls aujourd'hui et hier acceptés) ; les tuiles du QG gardent leur lien sans `d`.
- Petites dettes de l'étape 3 : helper `BG` unique (`views/hq.ts` exporté, `views/mission.ts` l'importe) ; `ratPref()` unique pour `{...defaultPref(), leftOver: []}` (`rats.ts`, `npc.ts`) ; `seedsOffering(skill, count, from?, max = 1_000_000)` lève `RangeError` après `max` graines examinées ; `NewModeBattle.phase` retiré (inutilisé) ; `import-modes.ts` lève sur un `endMsg` non reconnu.

- [ ] **Step 1:** Tests (`dry.test.ts`, `db.test.ts`) : migrations 001→006 sur une base avec armées, combats, `daily` : données conservées, `PRAGMA table_info(daily)` sans `battles_used`, `PRAGMA foreign_key_check` vide ; un combat livré après migration a `created_at` = horloge injectée ; `seedsOffering(999, 1, 273018, 50)` lève `RangeError` ; armée à `rats = 150` avant migration → 100 après, armée à 35 inchangée ; combat livré à 23:59:59 (horloge injectée) → redirection `/b/view/bat1?d=<jour>`, la page à 00:00:01 montre ce combat (flashvars = entrée stockée) et sa première vue garde « +N [T] » une seule fois, `?d=` d'avant-hier ou mal formé → jour courant (QG si aucun combat) ; `haxeTrim("  a ")` identique depuis `@mt/game` et `validate.ts` ; garde-fous texte : `grep -c "bodyLimit(" apps/server/src -r` = 1 (dans `form.ts`), une seule définition de `ERR_OFFER`, `ERR_RATE`, `function haxeTrim`, `json_array_length(` (hors `POWER_SQL`) — tests lisant les sources.
- [ ] **Step 2:** FAIL → implémenter. `node tools/oracle/scripts/import-modes.ts` puis `git diff --exit-code packages/engine/test/fixtures/modes` (fixtures identiques).
- [ ] **Step 3:** PASS ; `npm test`, `npm run typecheck` verts. Commit `refactor(server): migration 006, midnight-safe battle views, shared form limit, texts and power SQL; stage-3 minors`.

### Task 2: `@mt/engine` — flashvars ClientMode 1, ClientMode 5 et liste `/load`

**Files:** Modify `packages/engine/src/boundary/client.ts`, `packages/engine/src/input/flashvars.ts`, `packages/engine/src/index.ts`, `packages/engine/test/boundary/client.test.ts`, `packages/engine/test/fixtures/original-pages.json`.

**Interfaces — Produces** (RECON4 §1.3, §3) :
```ts
interface ClientChoice { army: BattleArmyInput; recruits: number; load: string; loaded: BattleTrooperInput[]; save: string }
choiceData(c: ClientChoice, gfx: string): string            // ClientMode 1 ; clés : army, recruits (C0\b*\x02), load (T3D\n), loaded (c\x12sN\x01), save (wW\x01T\x03)
recruitsData(army: BattleArmyInput, n: number, bg: BattleInput["background"], gfx: string): string   // ClientMode 5 (army, int, bg{id,gfx})
troopersList(troopers: readonly BattleTrooperInput[]): string   // corps texte de /load : tableau Haxe de troopers obfusqués
```
- [ ] **Step 1:** Ajouter à `original-pages.json` (même méthode que `grid`) : `choice` décodé de `$EX/html/fr/choice-2.html` (2ᵉ embed), `recruits` de `$EX/html/fr/history.html` (embed `swf_recuits`), `load` = contenu de `$EX/html/fr/load_pos_0_count_16.html` (sans fin de ligne). Tests : `encodeURIComponent(choiceData(fx.choice.c, fx.choice.gfx)) === fx.choice.data` ; idem `recruitsData(...)` avec `n = 18`, 19 troopers, 1er id 18, `gfx` army.swf ; `troopersList(fx.load.troopers) === fx.load.body` (16 troopers, 1er `588344:Jazemiller`).
- [ ] **Step 2:** FAIL → implémenter (nouvelles clés dans `OBFU_DICTIONARY`).
- [ ] **Step 3:** PASS ; `npm run oracle:diff` 0 KO. Commit `feat(engine): ClientMode 1 and 5 flashvars, /load troopers list (byte-exact)`.

### Task 3: Ordre de déploiement — `/choice`, `/load`, `/save`, combats

**Files:** Create `apps/server/src/deploy.ts`, `apps/server/src/{routes,views}/choice.ts`, `apps/server/test/choice.test.ts` ; Modify `repo.ts`, `foes.ts`, `routes/{battle,mission,add,index,hq}.ts`, `docs/game/unverified.md`.

**Interfaces — Consumes:** `choiceData`, `troopersList` (tâche 2). **Produces :**
```ts
deployOrder(db: DatabaseSync, armyId: number): number[]                     // slots ; NULL ⇒ [0..n-1] ; slots absents (achat) ajoutés à la fin
setDeployOrder(db: DatabaseSync, armyId: number, slots: readonly number[]): boolean   // false si pas une permutation exacte des slots
battleTroopers(db: DatabaseSync, armyId: number): BattleTrooperInput[]      // dans l'ordre de déploiement
recruitsByLevel(db: DatabaseSync, armyId: number): { armyId: number; trooper: BattleTrooperInput }[]   // 1er trooper des recrues confirmées, niveau ↓ puis id d'armée ↓, pref stockée
```
- `battleTroopers` remplace `troopersOf(...).map(trooperInput)` partout où une `BattleInput` est construite (attaquant de `/b/opp` et des missions, défenseur `foes.ts`, épique) : RECON4 §3, les troopers et leur `spawnOrder` suivent l'ordre de déploiement. Grille du QG et fiches inchangées (ordre des slots).
- `GET /choice` (propriétaire, ≥ 5 troopers sinon `/hq`) : page de `$EX/html/fr/choice.html` (texte, embed `swf_client` 630×254 `wmode transparent`, boutons « Valider » / « Annuler ») ; `army` = troopers dans l'ordre de déploiement, id = −slot, `__UP2` = mêmes ids ; `recruits` = recrues confirmées ; `load` = `armyUrl(…, "/load?")` ; `save` = `armyUrl(…, "/save?chk=<clé>;c=")`.
- `GET /load?pos=P;count=C` (propriétaire, C ≤ 16) : `text/plain`, `troopersList` de `recruitsByLevel` tranche `[P, P+C)`, ids = id de l'armée recrue.
- `GET /save?chk=K;c=a:b:…` : ids ≤ 0 → slots (−id), ids > 0 ignorés (`// UNVERIFIED` recrue glissée, RECON4 §3) ; permutation exacte → enregistrée, `/hq` ; sinon rien, `/choice`. Sans `chk` valide → 403.

- [ ] **Step 1:** Tests : 5 troopers (slots 0..4, noms N0..N4), `GET /save?chk=K;c=-4:-3:-2:-1:0` → 302 `/hq`, puis combat `/b/opp` : `input.armies[0].troopers` noms `N4,N3,N2,N1,N0`, ids consécutifs, `spawnOrder` dans cet ordre, flashvars `data=` de `/b/view/bat1` décodent exactement l'entrée stockée ; armée attaquée par nom ensuite : côté défenseur dans le même ordre ; le combat stocké avant `/save` est relu octet pour octet identique ; `c=0:0:-1:-2:-3`, `c=0:-1:-2:-3`, `c=0:-1:-2:-3:-7`, `c=x` → ordre inchangé, `/choice` ; `c=12345:-4:-3:-2:-1:0` → enregistré (12345 ignoré) ; sans `chk` → 403 ; 4 troopers → `/choice` redirige `/hq` ; achat d'un 6ᵉ trooper après `/save` → `deployOrder` = `[4,3,2,1,0,5]` ; page `/choice` : `choiceData` décodé a `army.troopers[0].id === -4` et `save` se termine par `;c=` ; `/load?pos=0;count=16` avec 3 recrues de niveaux 2,5,5 → ordre niveau 5 (id le plus grand d'abord), 5, 2, corps = `troopersList(...)`.
- [ ] **Step 2:** FAIL → implémenter (`unverified.md` : recrues ignorées à l'enregistrement, nouveaux troopers en fin d'ordre).
- [ ] **Step 3:** PASS. Commit `feat(server): /choice deployment order used by every new battle`.

### Task 4: `/history` complet, dernier combat subi au QG, point de vue du défenseur

**Files:** Create `apps/server/src/dates.ts`, `apps/server/test/dates.test.ts` ; Modify `repo.ts`, `routes/{history,hq,battle}.ts`, `views/{history,hq,battle}.ts`, `apps/server/test/history.test.ts`, `docs/game/unverified.md`.

**Interfaces — Consumes:** `recruitsData` (tâche 2), `recruitsByLevel` (tâche 3), `battles.created_at` (tâche 1). **Produces :**
```ts
type DefenseRow = { id: number; attacker: { host: string; name: string; part: number } | null; won: boolean; createdAt: number | null; day: string }
defensesOf(db: DatabaseSync, armyId: number, limit: number): DefenseRow[]   // kind 'battle' et opp LIKE 'friend:%' où l'armée défend, plus récent d'abord
historyDate(ts: number, now: number, tz: string): string                    // RECON4 §1.1
dayDate(day: string): string                                                // "Le 27 juillet" pour created_at NULL
```
- Colonne gauche de `/history` (RECON4 §1.1) : 10 `<li class="win|defeat">` (`won` = gagnant ≠ camp attaquant), « Victoire|Défaite contre <strong>L'armée de X</strong> », date ; sans combat : « Aucune armée adverse ne t'a encore attaquée via l'infiltration du mode Bataille. ». Attaquant supprimé : titre `L'armée inconnue`.
- Animation (RECON4 §1.3) : si ≥ 1 recrue confirmée, `<div id="swf_recuits" class="swf">` + embed 670×240 `{ id : 'recuits', 'class' : 'swf' }`, `recruitsData({faction, spawnOrder: [], troopers: [slot 0 (id n), recrues 0..n-1]}, n, garden, ARMY_SWF)`, `n` = min(recrues, 50) (`// UNVERIFIED` plafond 50, wiki).
- QG : après `li.newchild`, le dernier `DefenseRow` seulement (fr/hq-levelup.html).
- `/b/fview/<id>` vu par le défenseur : flashvars avec `attackerSide` = camp du défenseur (1), entrée stockée inchangée.
- `historyDate` : même jour « Aujourd'hui à HH:MM » (`// UNVERIFIED`), veille « Hier à HH:MM », 2–6 jours « <Jour> à HH:MM », sinon « Le <j> <mois> » (`// UNVERIFIED` 1er du mois, année).

- [ ] **Step 1:** Tests `dates.test.ts` (tz `Europe/Paris`, `now = Date.parse("2022-08-10T01:02:24+02:00")`) : `2022-08-06T14:14+02:00` → `"Samedi à 14:14"` ; `2022-08-09T12:25+02:00` → `"Hier à 12:25"` ; `2022-08-10T00:30+02:00` → `"Aujourd'hui à 00:30"` ; `2022-08-04T00:01+02:00` → `"Jeudi à 00:01"` ; `2022-08-03T23:59+02:00` → `"Le 3 août"` ; `2022-07-27T18:00+02:00` → `"Le 27 juillet"` ; `dayDate("2022-07-27") === "Le 27 juillet"`. Tests `history.test.ts` : A attaque B par nom et gagne → `/history` de B : `li.defeat`, « Défaite », lien `/b/fview/<id>` ; B gagne → `li.win` ; A attaque B depuis la liste `/b/opp` → absent ; aucun → texte vide exact ; 12 attaques → 10 items, plus récent d'abord ; QG de B : un seul item défensif ; `/b/fview/<id>` vu par B : `attackerSide === 1` décodé, par A : 0, `battles.input` inchangé ; animation : 3 recrues niveaux 2,5,5 → `n = 3`, `troopers[0]` = slot 0 de B avec id 3, puis ids 0,1,2 dans l'ordre de `recruitsByLevel`, `gfx` se termine par `army.swf` ; sans recrue → pas de `swf_recuits` ; 51 recrues → `n = 50`.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): /history battles and recruits animation, last defence on the HQ`.

### Task 5: `/ranks`, menu conditionnel, `/global-ranks`

**Files:** Create `apps/server/src/{routes,views}/ranks.ts`, `apps/server/test/ranks.test.ts` ; Modify `repo.ts`, `views/{panel,layout}.ts`, `routes/{hq,index}.ts`, delete `views/soon.ts` (`missingPage` déplacé dans `views/army.ts`), `docs/game/unverified.md`.

**Interfaces — Produces:**
```ts
type RankRow = { id: number | null; host: string; name: string; part: number; faction: number; size: number; power: number }
ranking(db: DatabaseSync, armyId: number): { recruiter: RankRow; rows: RankRow[]; self: RankRow | null }   // rows ≤ 10 ; self seulement hors top 10
menuFlags(p: { power: number; troopers: number; recruits: number; protected: boolean }): { history: boolean; choice: boolean; protect: boolean; ranks: boolean }
```
- Recruteur effectif (RECON4 §2) : `recruiter_id`, sinon l'armée de faction `FACTIONS[faction]` (ligne stockée si présente, sinon synthétisée : 6 troopers, puissance de `factionBattleArmy`) ; une armée de faction est son propre recruteur. Co-recrues : armées non-faction de même recruteur effectif (`recruiter_id = R` ou `recruiter_id IS NULL AND faction = f` pour une faction), puissance ↓ puis id ↑ (`// UNVERIFIED` égalités).
- Page (`$EX/html/fr/ranks.html`) : `a.company` « Hiérarchie », phrase mot par ligne, `tr.top` + `top.png` + lien sans `target`, lignes `target="_blank"`, cellule faction avec infobulle `<h2>Faction de <hôte></h2>` (variante `tipH2` du helper `tip`, `// UNVERIFIED` libellés des factions ≠ 4), « Retour ». Public ; panneau gauche identique au QG pour ce visiteur (formulaire `insertpass` si protégée). Armée inconnue → 404 `missingPage`.
- Menu (RECON4 §5) : Historique si recrues (confirmées + en attente) ≥ 1, Gérer mon armée si ≥ 5 troopers, Hiérarchie si puissance ≥ 20 ; « Quartier Général » inchangé. `/global-ranks` → 301 `/ranks` (n'existait pas, spec). Plus aucune page « Bientôt disponible ».

- [ ] **Step 1:** Tests : recruteur R stocké + 12 recrues de puissances 30,40,…,140 + V (puissance 20) recruté par R → `/ranks` de V : 1ʳᵉ ligne R (`class="top"`), 10 lignes 140…50, puis V ; V à puissance 150 → V 1ʳᵉ des 10, 10 lignes exactement ; deux recrues à 60 → l'id le plus petit d'abord ; armée créée depuis l'accueil (faction 4, `recruiter_id` NULL) → recruteur « L'armée de Fol-ecume », infobulle `&lt;h2&gt;Faction de fol-ecume&lt;/h2&gt;`, les autres armées faction 4 sans recruteur listées, les armées de faction jamais en co-recrues ; visiteur sans session d'une armée protégée → formulaire `insertpass`, aucun menu ; `menuFlags` : puissance 19 → `ranks:false`, 20 → `true` ; 4 troopers → `choice:false`, 5 → `true` ; 0 recrue → `history:false`, 1 en attente → `true` ; `/global-ranks` → 301 `/ranks` ; `GET /choice` à 4 troopers → `/hq` ; noms hostiles échappés.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): /ranks by recruiter and the original's conditional menu`.

### Task 6: `/endDay`

**Files:** Create `apps/server/src/{routes,views}/endday.ts`, `apps/server/test/endday.test.ts` ; Modify `repo.ts`, `routes/{battle,mission,raid,index}.ts`, `views/hq.ts` (`resetTimer` exporté), `docs/game/unverified.md`.

**Interfaces — Produces:** `dayOver(db: DatabaseSync, armyId: number, day: string): boolean` = combats du jour ≥ `battleAllowance` **et** mission finie (non débloquée, gagnée ou 3 essais) **et** raid fini (`raid_over` ou 0 recrue vivante) (`// UNVERIFIED` : RECON4 §4 ne dit que « après le dernier combat disponible »).
- Première vue d'un combat, d'une mission ou d'un raid qui rend `dayOver` vrai : `endBattle()` → `armyUrl(…, "/endDay")` au lieu de `/hq?money=N` (crédits déjà versés).
- `GET /endDay` (propriétaire) : si `dayOver` faux → `/hq` ; sinon page de `$EX/html/fr/endDay.html` : `a.company` « C'est tout pour aujourd'hui ! », `div.over` + `art_congrats.png`, paragraphe « Félicitations : ton armée s'est bien battue ! … d'ici quelques heures. », `div.wait` « Patiente encore [chrono] avant de pouvoir jouer plus. » (chrono `mt.js.Timer` jusqu'à minuit `TZ_GAME`) ; publicités Motion-Twin et phrase « Pendant ce temps… » omises ; dernière phrase réduite à « N'oublie pas non plus de <a href="javascript:_.startRecruit()">Recruter des Troopers</a> ! » (`// UNVERIFIED` : pas de forum).

- [ ] **Step 1:** Tests (horloge 23:00:00 Europe/Paris) : armée sans recrue, missions verrouillées, 3 combats → la page du 3ᵉ contient `document.location = '<…>/endDay'`, celle du 2ᵉ `/hq?money=` ; `/endDay` contient « Félicitations : ton armée s'est bien battue ! » et `mt.js.Timer.alloc('2000-01-01 00:00:00','2000-01-01 01:00:00',2,null)` ; missions débloquées non jouées → 3ᵉ combat vers `/hq?money=`, puis 3 défaites de mission → la 3ᵉ vue de mission vers `/endDay` ; une recrue vivante → jamais `/endDay` avant le raid perdu ; `GET /endDay` jour non fini → 302 `/hq` ; tiers → redirection QG.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): /endDay after the day's last action`.

### Task 7: Finitions visuelles — favicon, images CSS, polices, zéro 404

**Files:** Create `apps/server/public/favicon.ico`, `apps/server/test/assets.test.ts` ; Modify `apps/server/test/e2e.test.ts`, `docs/research/original-game.md`, `docs/game/unverified.md`, `~/.claude/projects/-home-dev-minitroopers/memory/pre-deploy-todo.md` (items soldés).

- RECON4 §7 : `favicon.ico` téléchargé depuis `https://web.archive.org/web/20111218041829id_/http://minitroopers.fr/favicon.ico` (1 410 o ; vérifier l'empreinte SHA-1 base32 `EOBKFFWDRFZRNY74FHID5IV4SJST5UPJ`). `art_1.jpg`, `buttons/button.png`, `upcup/bg.jpg`, `loc/moreg_*.png` : sélecteurs jamais émis (ou toujours surchargés) ⇒ non téléchargés, listés dans `UNUSED_CSS_IMAGES` avec leur sélecteur. Polices : aucune (Open Sans Condensed ne servait qu'au bandeau Braziball).
- [ ] **Step 1:** Tests `assets.test.ts` : chaque `url()` de `public/css/style.css` existe sous `public/` ou figure dans `UNUSED_CSS_IMAGES` ; les pages rendues (`/`, `/hq`, `/t/0`, `/add`, `/b/opp`, `/history`, `/ranks`, `/choice`, `/protect`, `/endDay`, `/b/view/bat1`) n'émettent aucune classe de cette liste (`sbutton`, `headSpecial`, `moreg`) et chaque `src="/…"`/`href="/…"` statique y existe ; `GET /favicon.ico` → 200 `image/x-icon`. e2e (Playwright, ignoré sans navigateurs, `URL_MODE=path|subdomain`) : parcours des mêmes pages pour une armée de 5 troopers avec une recrue et un combat subi → aucune réponse 404 du même site ; `/choice` : appeler `_.swfAction('client','save')` après chargement du SWF → navigation vers `/hq` et `deploy_order` = ordre affiché (câblage SWF ↔ `/load` ↔ `/save`) ; `/history` : l'animation charge sans quitter la page.
- [ ] **Step 2:** FAIL → corriger. **Step 3:** PASS ; `npm test`, `npm run typecheck`, `npm run oracle:diff` → verts / 0 KO. Commit `fix(server): favicon, no missing asset on any page; stage-4 end-to-end`.

### Task 8: Image Docker auto-hébergeable (vérifiée sans Docker)

**Files:** Create `Dockerfile`, `.dockerignore`, `deploy/{compose.yaml,dryrun.mjs,README.md}`, `apps/server/test/ops.test.ts` ; Modify `apps/server/src/{main,app}.ts`, `apps/server/src/admin/cli.ts`, `apps/server/README.md`, `README.md` (lien).

**Interfaces — Produces:**
- `GET /healthz` → 200 `ok` (`SELECT 1`), sans session ni cookie.
- `main.ts` : `SIGTERM`/`SIGINT` → fermeture du serveur HTTP, arrêt du job, `db.close()`, sortie 0.
- `npm run admin -- backup --out <fichier>` : `VACUUM INTO` (cohérent pendant que le serveur tourne) ; fichier existant → erreur « existe déjà ».
- `Dockerfile` : `FROM node:24.12-bookworm-slim` (multi-arch amd64/arm64) ; copie des `package.json` des workspaces puis `npm ci --omit=dev --ignore-scripts` (Playwright exclu), puis `COPY . .` filtré par `.dockerignore` (`node_modules`, `var`, `.git`, `.superpowers`, `tools/bin`, `tools/oracle/golden*`, `assets`, `docs`, `**/test`, `**/dist`) ; `ENV NODE_ENV=production PORT=8080 LISTEN_HOST=0.0.0.0 DATA_DIR=/data URL_MODE=path` ; `/data` possédé par `node` ; `USER node` ; `VOLUME /data` ; `EXPOSE 8080` ; `HEALTHCHECK` par `node -e "fetch('http://127.0.0.1:8080/healthz')…"` ; `CMD ["node","apps/server/src/main.ts"]`.
- `deploy/dryrun.mjs` (sans dépendance) : copie dans un dossier temporaire les fichiers de `git ls-files` non exclus par `.dockerignore`, y lance `npm ci --omit=dev --ignore-scripts`, lit les lignes `ENV` et `CMD` du `Dockerfile` et lance cette commande avec ces variables (`PORT` libre, `DATA_DIR` temporaire), vérifie `GET /healthz`, `/`, `/css/style.css`, `/ruffle/ruffle.js`, `/swf/client_fr_play.swf`, `/favicon.ico` = 200, envoie `SIGTERM` et exige la sortie 0 en < 5 s, affiche la taille copiée (`du`), échoue sur la moindre erreur.
- `deploy/compose.yaml` : service `minitroopers` (`build: ..`, `init: true`, `restart: unless-stopped`, volume `./data:/data`, `TRUST_PROXY=1`, `PUBLIC_URL`, `URL_MODE`, `BASE_DOMAIN`, `TZ_GAME` depuis `.env`), **aucun `ports:`**, réseau externe partagé avec `cloudflared` (`${CF_NETWORK}`).
- `deploy/README.md` (auto-hébergement, pour tous) : `docker build -t minitroopers .` ; `docker run -d --name minitroopers -p 127.0.0.1:8080:8080 -v minitroopers-data:/data -e PUBLIC_URL=http://localhost:8080 minitroopers` ; `docker buildx build --platform linux/amd64,linux/arm64` ; variables ; sauvegarde (`docker exec minitroopers npm run admin -- backup --out /data/backup-$(date +%F).db`) ; mise à jour ; Cloudflare Tunnel : `TRUST_PROXY=1` seulement sans port publié ; mode sous-domaine = DNS `*.<domaine>` vers le tunnel, le certificat universel ne couvre qu'**un** niveau (`*.exemple.fr`, pas `*.mt.exemple.fr`) ; **ne jamais pousser l'image sur un registre public** (assets Motion-Twin).

- [ ] **Step 1:** Tests `ops.test.ts` : `GET /healthz` → 200 `ok`, aucune ligne `sessions`, aucun `Set-Cookie` ; `main.ts` lancé en sous-processus (`PORT=0`, `DATA_DIR` temporaire, port lu dans le journal « MiniTroopers server on ») : `/healthz` 200, `SIGTERM` → code 0 en < 5 s et `minitroopers.db-wal` absent ou vide ; `backup --out x.db` après 2 armées → `SELECT COUNT(*) FROM armies` identique dans la copie ; 2ᵉ appel même chemin → « existe déjà ».
- [ ] **Step 2:** FAIL → implémenter. Revue du `Dockerfile` à la main (liste dans le rapport de tâche) : base épinglée, `npm ci` avant `COPY . .`, `--omit=dev`, utilisateur non root, pas de secret dans `ENV`, `HEALTHCHECK` sans `curl`, `.dockerignore` excluant `var/`, `.git`, `tools/bin`.
- [ ] **Step 3:** `node deploy/dryrun.mjs` → « OK » ; `npm test`, `npm run typecheck` verts. Si `command -v docker` répond (autre machine), `docker build .` et `docker run` du README en plus. Commit `feat(deploy): self-host Docker image, healthz, graceful stop, backup, dry run`.

### Task 9: Déploiement homelab — **nécessite l'accord de Killian** (non exécuté automatiquement)

Liste de contrôle à présenter à Killian, puis à dérouler avec lui ; rien n'est lancé sur CT104 ni chez Cloudflare sans son « go » explicite à chaque étape marquée ⚠.

- [ ] Choix de Killian : domaine public, `URL_MODE` (`path` d'abord recommandé : aucun DNS joker ; `subdomain` ⇒ `BASE_DOMAIN` = domaine racine à cause du certificat universel à un niveau), nom de la stack (`/opt/stacks/minitroopers`).
- [ ] Repérage en lecture seule sur `docker.lan` (⚠ accès SSH) : `docker ps --format '{{.Names}} {{.Image}} {{.Networks}}' | grep -i cloudflared` ; tunnel géré dans le tableau de bord ou par `config.yml` ; architecture (`uname -m`).
- [ ] ⚠ Copie du dépôt privé sur CT104 (`git clone` par clé de déploiement ou `git archive | ssh`), `.env` (`PUBLIC_URL=https://<domaine>`, `TRUST_PROXY=1`, `CF_NETWORK=<réseau de cloudflared>`), `mkdir data && chown 1000:1000 data`.
- [ ] ⚠ `docker compose -f deploy/compose.yaml up -d --build` ; `docker compose ps` « healthy » ; `docker compose logs` sans « Warning ».
- [ ] ⚠ Règle d'entrée du tunnel `<domaine>` → `http://minitroopers:8080` (et `*.<domaine>` en mode sous-domaine) + DNS CNAME vers le tunnel.
- [ ] Vérifications depuis l'extérieur : `curl -fsS https://<domaine>/healthz` ; création d'armée ; la limite par IP voit l'IP réelle (deux créations depuis le même poste) ; `Set-Cookie` avec `Secure` ; aucun port ouvert (`ss -ltn` sur CT104 sans 8080 publié).
- [ ] Mot de passe d'une armée sans ordinateur de création connu (armées CLI) : `MT_ARMY_PASSWORD=… npm run admin -- set-password --name <hôte>` (mot de passe lu **uniquement** dans `MT_ARMY_PASSWORD`).
- [ ] ⚠ Sauvegarde quotidienne (cron hôte : `docker compose exec -T minitroopers npm run admin -- backup --out /data/backups/$(date +%F).db`, rotation 14 jours) et armée du frère recréée par `create-bro-army` sur cette instance.

### Task 10: Instance de démonstration sur ce LXC

Code figé dans un worktree, données isolées dans son `var/demo/` ; adresse `http://192.168.1.120:8080/` (mode chemin, `hostname -I` vérifié = `192.168.1.120`, port 8080 libre).

- [ ] **Step 1 — démarrer :**
  ```sh
  git -C /home/dev/minitroopers worktree add /home/dev/minitroopers-demo etape4
  cd /home/dev/minitroopers-demo && npm ci --omit=dev && mkdir -p var/demo
  DATA_DIR=var/demo LISTEN_HOST=0.0.0.0 PORT=8080 URL_MODE=path PUBLIC_URL=http://192.168.1.120:8080 TRUST_PROXY=0 \
    setsid nohup node apps/server/src/main.ts > var/demo/server.log 2>&1 < /dev/null & echo $! > var/demo/server.pid
  curl -fsS http://192.168.1.120:8080/healthz          # ok
  ```
- [ ] **Step 2 — armée du frère** (nom et mot de passe fournis par Killian, jamais écrits dans un fichier) :
  ```sh
  cd /home/dev/minitroopers-demo
  read -rs MT_ARMY_PASSWORD && export MT_ARMY_PASSWORD
  DATA_DIR=var/demo npm run admin -- create-bro-army --name "<nom donné par Killian>"
  unset MT_ARMY_PASSWORD
  DATA_DIR=var/demo npm run admin -- list               # 12 troopers niveau 2, faction, puissance 72
  # mot de passe à changer plus tard : même read/export puis DATA_DIR=var/demo npm run admin -- set-password --name <hôte>
  ```
  Vérifier dans un navigateur du LAN : accueil → « Vous avez déjà une armée ? » → nom + mot de passe → QG ; un combat se rejoue sous Ruffle.
- [ ] **Step 3 — arrêter / nettoyer :** `kill "$(cat /home/dev/minitroopers-demo/var/demo/server.pid)"` (arrêt propre, tâche 8) ; `ss -ltn | grep -c :8080` → 0 ; données gardées dans `var/demo/` ; suppression complète : `git -C /home/dev/minitroopers worktree remove --force /home/dev/minitroopers-demo`. Pas de commit (rien dans le dépôt ne change).

---

## Hors de ce plan

`/global-ranks` réel (classement global du serveur de test, absent de l'original : redirigé vers `/ranks`) ; effet d'une recrue glissée dans `/choice` (ignorée) ; publicités Motion-Twin et forum ; CLI `replace-army` générique et aide de semis SMART généralisée (couvertes par `--force` et `seedsOffering` de l'étape 3) ; images CSS introuvables sur Wayback (`art_1.jpg`, `buttons/button.png`), inutiles car jamais affichées.
