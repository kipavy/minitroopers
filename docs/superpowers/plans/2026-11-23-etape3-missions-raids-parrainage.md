# Étape 3 — Missions, raids, parrainage, protection — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** l'instance locale offre tout le jeu quotidien de 2011 : mission du jour (Exterminer, Infiltrer, Épique) avec 3 essais, raid enchaîné par les recrues, parrainage effectif confirmé sur `/history`, mot de passe d'armée `/protect` ; les dettes de sécurité de l'étape 2 sont soldées ; l'armée du frère (12 troopers Malin) est créée par la CLI.

**Architecture:** même chaîne que `/b/opp` : `@mt/game` génère adversaires (rats, PNJ, cible d'infiltration) de façon déterministe par (jour, armée) ; le serveur construit la `BattleInput`, la résout par `simulateOutcome` dans une transaction `BEGIN IMMEDIATE`, stocke l'entrée ; `/b/view/miss<n>` et `/b/view/raid` la rejouent par `client_fr_play.swf` sous Ruffle avec la même entrée. Migration 005 (colonnes d'état quotidien, clés étrangères `ON DELETE`).

**Tech Stack:** inchangée (Node 24.12 TS natif, Hono, `node:sqlite`, `node:test`, Ruffle web épinglé, Playwright headless de `tools/bin`).

**Spec:** `docs/superpowers/specs/2026-11-22-minitroopers-remake-design.md` (« Livraison par étapes » 3, « Serveur », Annexe A : Modes de jeu, Économie, Compte). Référence jeu : `docs/research/original-game.md`. **Reconnaissance (source des valeurs de ce plan) :** `~/minitroopers-work/recon/stage3-recon.md` (noté `RECON3`, § = section) ; pages Wayback et flashvars décodées dans `~/minitroopers-work/recon/stage3/{wayback,decoded}/` (noté `$S3`) ; `$EX` = `~/minitroopers-work/recon/assets/extra/site-elements` ; `$GL` = `~/minitroopers-ref`.

## Global Constraints

- Dépôt privé ; assets Motion-Twin autorisés dans le dépôt.
- Node 24.12, ESM, TS natif, `erasableSyntaxOnly` ; dépendances d'exécution du serveur limitées à `hono` et `@hono/node-server` ; `@mt/engine` et `@mt/game` : zéro dépendance externe, zéro I/O (`@mt/game` → `@mt/engine` seulement).
- Français seul. Textes et HTML repris des pages originales FR (`$EX/html/fr/*.html`, `$S3/wayback/*.html`) mot pour mot quand ils existent (fautes d'origine comprises : « tu peut tenter le raid suivant »).
- Priorité des sources : SWF > pages archivées > wikis > serveur de test > GitLab. Règle non vérifiable → valeur choisie + `// UNVERIFIED: <raison>` + entrée dans `docs/game/unverified.md` (dans la tâche qui l'introduit).
- PC de Killian propre ; données locales dans `var/` (gitignoré).
- Instance publique future derrière Cloudflare Tunnel : IP = `CF-Connecting-IP` seulement si `TRUST_PROXY=1` ; cookies `HttpOnly`, `SameSite=Lax`, `Secure` si `PUBLIC_URL` est https.
- Deux modes d'URL de première classe (`URL_MODE=subdomain|path`), tout lien interne par `armyUrl(cfg, host, path)`.
- Combats : le serveur calcule avec `simulateOutcome` ; le navigateur rejoue `client_fr_play.swf` ; les deux reçoivent exactement la même `BattleInput` (stockée en base).
- Toute URL d'action porte la clé de session (`chk`) **et** un compteur d'état (`n` = essais faits, `phase`) qui la rend inerte une fois utilisée ; toute action finit par une redirection.
- Commits terminés par :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` et
  `Claude-Session: https://claude.ai/code/session_01KQAKEPkLFWFrHJudw5MqJT`.

## Review Focus

1. **Rejeu / double soumission** (mission, raid, déblocage, confirmation des recrues, `/protect`) : une seule dépense, un seul combat, une seule prime. Tests tâches 4, 6, 7.
2. **Bascule de jour** pendant une mission ou un raid (00:00 Europe/Paris) : rats, cible, type de mission, phase et recrues mortes du bon jour. Tests tâches 6 et 7 (horloge injectée).
3. **Fidélité des grands combats** (100 PNJ + 32 troopers, 35 rats) et identité entrée stockée ↔ flashvars de la page. Tests tâches 1, 6, 7.
4. **Requêtes intersites et sessions** : POST `/login`, `/`, `/protect` refusés depuis une autre origine ; aucune ligne `sessions` pour un visiteur anonyme ; `/protect` depuis un autre poste refusé. Tests tâches 3 et 5.
5. **Suppression / remplacement d'armée** (`--force`) alors que combats, recrues et sessions la référencent : aucune erreur de clé étrangère, combats des autres conservés. Tests tâches 3 et 8.

---

## Structure des fichiers

```
packages/engine/test/fixtures/modes/*.json      13 combats archivés (entrée + issue) (tâche 1)
packages/engine/test/boundary/modes.test.ts     tools/oracle/scripts/import-modes.ts
packages/game/src/{npc,rats,raid,missions,seeds}.ts   + tests packages/game/test/*.test.ts
apps/server/migrations/005_modes.sql
apps/server/src/{config,session,origin,battleInput,repo,foes}.ts
apps/server/src/routes/{mission,raid,history,protect}.ts   (+ battle.ts, hq.ts, home.ts)
apps/server/src/views/{mission,history,protect}.ts         (+ hq.ts, panel.ts, layout.ts, battle.ts)
apps/server/src/admin/{cli,army}.ts
apps/server/test/{origin,session,db,mission,raid,history,protect,admin,e2e}.test.ts
docs/game/unverified.md   apps/server/README.md
```

---

### Task 1: Fidélité du moteur sur les modes archivés

**Files:** Create `tools/oracle/scripts/import-modes.ts`, `packages/engine/test/fixtures/modes/*.json`, `packages/engine/test/boundary/modes.test.ts`.

**Interfaces — Produces:** fixtures `{ source: string; input: BattleInput; winner: 0 | 1 }` (13 fichiers, noms = RECON3 §1) ; `winner` déduit de l'`endMsg` (« remporté » → `attackerSide`, sinon l'autre camp). Les champs obfusqués supplémentaires de l'armée de rats et `force: null` sont normalisés (`force: []`) et notés dans le fichier.

- [ ] **Step 1:** Écrire `import-modes.ts` (décode les `flashvars` de `$EX/html/{fr,com}/b_view_{miss1,miss2,raid}.html` et `$S3/wayback/*_b_view_*.html` via le décodeur de `apps/server/test/hxdecode.ts`) et générer les fixtures. Test : pour chaque fixture, `validateBattleInput(input).ok === true` et `simulateOutcome(input).winner === winner` ; contrôles de forme : `1100gex90_b_view_miss2` a `armies[0].troopers.length === 32` et `armies[1].troopers.length === 100` ; `03602485362_b_view_miss1` a 4 rats `type === 2`.
- [ ] **Step 2:** Lancer `node --test packages/engine/test/boundary/modes.test.ts`. Attendu : PASS. Un écart = bogue moteur sur un cas jamais couvert (armées > 32, rats nombreux) : le reproduire avec `npm run oracle:diff` sur cette entrée, corriger le moteur jusqu'à zéro écart (règle de l'étape 1), figer un golden. Si l'écart vient d'un SWF de 2011 différent (Ruffle d'accord avec le moteur), le consigner dans le fichier de fixture et dans `unverified.md`.
- [ ] **Step 3:** `npm test`, `npm run typecheck` → verts. Commit `test(engine): archived mission and raid battles (up to 132 troopers)`.

### Task 2: `@mt/game` — rats, PNJ, raid, épique, mission du jour, graines

**Files:** Create `packages/game/src/{npc,rats,raid,missions,seeds}.ts`, tests `packages/game/test/{npc,rats,raid,missions,seeds}.test.ts` ; Modify `packages/game/src/{index,economy}.ts`, `docs/game/unverified.md`.

**Interfaces — Produces:**
```ts
type MissionType = "exterminate" | "infiltrate" | "epic"
MISSION_UNLOCK_COST = 5; MISSION_ATTEMPTS = 3; missionReward(win: boolean): number        // 4 / 0
RAID_REWARD = 4; RAID_MAX_PHASE = 20; RAID_PER_BATTLE = 100                                // UNVERIFIED (Data, RECON3 §7)
EPIC_MIN_RECRUITS = 10; EPIC_SIDE_MAX = 32; EPIC_NPC_MAX = 100; NPC_SEED_MAX = 100_000
RAT_SKILLS: readonly number[]                // [112,55,70,76,79,97,74,53,114,117,123,116,131,137]
type RatSpec = { seed: number; force: [number, number] }
dayRats(p: { day: string; armyId: number; count: number; salt: string }): RatSpec[]
ratArmy(rats: readonly RatSpec[], firstId: number): BattleArmyInput      // faction 0, spawnOrder [], name "rat", type 2, pref = defaultPref
armyComposition(power: number, min: number, max: number, rand: Rand): number[]   // niveaux, port $GL generateRandomArmyComposition
npcArmy(p: { power: number; min: number; max: number; seed: number; firstId: number }): BattleArmyInput
raidPower(phase: number): number; raidTrooperRange(phase: number): { min: number; max: number }
epicPower(wins: number): number              // UNVERIFIED: raidPower(wins + 11)
missionOfDay(p: { day: string; armyId: number; recruits: number; salt: string }): MissionType
pickInfiltrationTarget(p: { self: string; candidates: ArmyRef[]; fought: readonly string[]; day: string; armyId: number }): ArmyRef | null
seedsOffering(skill: number, count: number, from?: number): number[]    // graines ≥ from (défaut 273018) dont la 1re montée de niveau propose `skill`
```
- `npcArmy` (RECON3 §2) : graines `rand.random(NPC_SEED_MAX)`, `choices` de longueur niveau−1 tirés 0/1, `force: []`, `pref = Data.defaultPref()` (leftOver `[]` ⇒ tous les objets), noms `trooperName`, faction `rand.random(6)`, ids `firstId..`, `spawnOrder []`. `dayRats` : FNV-1a de `day|armyId|rats|salt` → `Rand` ; mêmes rats pour les 3 essais du jour. `missionOfDay` : hachage `day|armyId|mission|salt` ; si `recruits ≥ 10`, épique 1 jour sur 3, sinon exterminer/infiltrer à parts égales (`// UNVERIFIED`). `pickInfiltrationTarget` : une fois sur deux parmi `fought` s'il y en a, sinon uniforme parmi `candidates` ; `null` si aucun (`// UNVERIFIED`, wiki « biais »). Formules raid : RECON3 §3 (source $GL, recoupée par 4 raids archivés).

- [ ] **Step 1:** Tests : `raidPower(1)===11`, `raidPower(2)===15`, `raidPower(11)===326`, `raidPower(16)===797`, `raidPower(20)===1375` ; `raidTrooperRange(1)` = `{min:1,max:2}`, `(11)` = `{min:32,max:32}` ; `epicPower(0)===326` ; `armyComposition(11,1,2,r)` donne 1 ou 2 niveaux de puissance `Σ(4+niveau)` = 11 ; `npcArmy({power:325,min:32,max:32,…})` : 32 troopers, puissance `armyPower` = 325, toutes graines < 100000, `validateBattleInput` OK ; `dayRats` : `count:4` → 4 rats, 2 compétences distinctes ⊂ `RAT_SKILLS`, identique pour mêmes paramètres, différent si `day` change ; `ratArmy(…,1)` ids 1..4, `spawnOrder` `[]` ; `missionOfDay` jamais `"epic"` avec `recruits:9`, déterministe, les trois types apparaissent sur 60 jours avec `recruits:10` ; `pickInfiltrationTarget` exclut `self`, `null` sans candidat ; `seedsOffering(64, 3)` = `[273027, 273048, 273071]` et `seedsOffering(64, 12)[11] === 273347` (valeurs relevées avec le moteur) ; `missionReward(true)===4`, `missionReward(false)===0`.
- [ ] **Step 2:** FAIL → implémenter ; entrées `unverified.md` (type du jour, croissance épique, cible d'infiltration, plage des graines PNJ, correspondance des constantes `Data`).
- [ ] **Step 3:** PASS. Commit `feat(game): rats, NPC armies, raid and epic scaling, daily mission, seed search`.

### Task 3: Serveur — socle de l'étape 3 et dettes de l'étape 2

**Files:** Create `apps/server/migrations/005_modes.sql`, `apps/server/src/origin.ts`, tests `apps/server/test/origin.test.ts` ; Modify `config.ts`, `main.ts`, `session.ts`, `app.ts`, `repo.ts`, `routes/{home,hq,battle}.ts`, `apps/server/test/{db,session,battle}.test.ts`, `apps/server/README.md`.

**Interfaces — Produces:**
- Migration 005 : reconstruit `armies` (`recruiter_id … ON DELETE SET NULL`) et `battles` (`attacker_id … ON DELETE CASCADE`, `defender_id … ON DELETE SET NULL`) en copiant les données ; ajoute `armies.{created_cid TEXT, missions_unlocked INTEGER DEFAULT 0, rats INTEGER DEFAULT 1, epic_wins INTEGER DEFAULT 0, recruit_confirmed_at INTEGER, recruit_bounty INTEGER}`, `battles.{mode TEXT, phase INTEGER, opp TEXT}` (`kind` ∈ `battle|mission|raid`), `daily.{missions_used, mission_won, mission_type, mission_target, raid_phase DEFAULT 1, raid_dead DEFAULT '[]', raid_over DEFAULT 0}`.
- `deleteArmy(db: DatabaseSync, armyId: number): boolean` — refuse une armée de faction ; pose `defender_ref = 'gone:<nom>'` sur les combats où elle défend, puis supprime (cascades).
- `loadConfig` : `listenHost` lu dans `LISTEN_HOST` (défaut `127.0.0.1`) ; `HOST` ignoré, `warnings: string[]` le signale (tcsh exporte `HOST`=nom de machine).
- `sameOrigin(cfg: Config): MiddlewareHandler<Env>` sur tout POST : `Origin` présent ⇒ doit valoir l'origine de `PUBLIC_URL` ou, en mode sous-domaine, `<schéma>://<x>.<BASE_DOMAIN>[:port]` ; `Origin` absent ⇒ `Sec-Fetch-Site` absent ou ∈ {`same-origin`, `same-site`, `none`} ; sinon 403 « Requête refusée ».
- Sessions paresseuses : `Session` gagne `persisted: boolean` ; le middleware ne crée plus de ligne ni de cookie `ssid` pour un visiteur sans cookie (seul `cid` est posé) ; `persistSession(c: Context<Env>, db: DatabaseSync): Session` crée la ligne et le cookie (idempotent), appelé avant tout `bindArmy` (création, connexion).
- Lien `/b/opp` périmé : `battles.opp` mémorise l'`opp` demandé ; une URL rejouée ne redirige vers `/b/view/bat<n+1>` que si ce combat visait le même `opp`, sinon `/b/opp?err=stale` (« Cette attaque n'est plus valable. », `// UNVERIFIED` texte de notre cru).

- [ ] **Step 1:** Tests : migrations 001→005 sur une base contenant armées, combats (dont filler), recrues : données conservées, `PRAGMA foreign_key_check` vide ; `deleteArmy` d'un défendeur garde le combat de l'attaquant (`defender_ref` = `gone:<nom>`), d'un recruteur met `recruiter_id` à NULL ; `loadConfig({HOST:"pc-killian"}).listenHost === "127.0.0.1"` et `warnings.length === 1`, `LISTEN_HOST=0.0.0.0` respecté ; POST `/login` avec `Origin: https://evil.example` → 403 et session inchangée, avec `Sec-Fetch-Site: cross-site` sans Origin → 403, même origine → 303 ; idem POST `/` ; 50 `GET /` sans cookie → `SELECT COUNT(*) FROM sessions` = 0, puis création d'armée → 1 ; ancien lien d'attaque vers un autre adversaire après un combat → `/b/opp?err=stale`, double clic sur le même → `/b/view/bat1`.
- [ ] **Step 2:** FAIL → implémenter (`main.ts` affiche les `warnings` ; README : `LISTEN_HOST`).
- [ ] **Step 3:** PASS ; `npm test`, `npm run typecheck`. Commit `fix(server): FK on delete, LISTEN_HOST, same-origin POST, lazy sessions, stale attack links`.

### Task 4: Parrainage effectif — `/history` (recrues) et confirmation

**Files:** Create `apps/server/src/{routes,views}/history.ts`, `apps/server/test/history.test.ts` ; Modify `repo.ts`, `routes/{home,hq,index}.ts`, `views/hq.ts`, `docs/game/unverified.md`.

**Interfaces — Produces:**
```ts
type RecruitRow = { armyId: number; host: string; name: string; part: number; bounty: number | null; confirmedAt: number | null }
pendingRecruits(db: DatabaseSync, recruiterId: number): number
confirmRecruits(db: DatabaseSync, recruiterId: number, now: number, bountyOf: (rank: number) => number): { confirmed: number; credited: number }
recruitsOf(db: DatabaseSync, recruiterId: number, limit: number): RecruitRow[]   // confirmées, plus récentes d'abord
confirmedRecruitCount(db: DatabaseSync, recruiterId: number): number
```
- Création d'armée : `created_cid` = `clientId` du créateur. `rank` = rang de création parmi les recrues de ce recruteur (1-based) ; prime `referralBounty(rank)` ; une recrue créée depuis le même `cid` que son recruteur est confirmée avec prime 0 (`// UNVERIFIED` anti-auto-parrainage).
- `GET /history` (propriétaire) : confirme les recrues en attente dans la même transaction (prime créditée, `recruit_bounty`, `recruit_confirmed_at`), puis affiche la colonne « Historique des Recrues » de `$EX/html/fr/history.html` : `<li>` « Tu as recruté <strong>L'armée de X</strong> » + « Gain : N [token] » (lien vers `armyUrl(X,'/hq')`), 10 dernières, puis « Tu as <strong>N</strong> [favicon] recrues dans ton armée. Pour augmenter ce nombre, recrute tes amis ! ». Colonne « Historique des Combats » et animation ClientMode 5 : étape 4 (emplacement vide).
- QG : `<li class="newchild"><a href="/history"><p><img src="/img/newrecruit.gif"/> Nouvelle recrue disponible !</p></a></li>` tant que `pendingRecruits > 0` ; « Ta prochaine recrue te rapportera N » = `referralBounty(recruitCount + 1)`.

- [ ] **Step 1:** Tests : A recrute B → QG de A montre « Nouvelle recrue disponible ! », crédits inchangés ; `GET /history` → +100, item « Gain : 100 », QG sans `newchild` ; recharger `/history` ne crédite pas (crédits identiques) ; deux `GET /history` simultanés → +100 une seule fois ; 5 recrues confirmées d'un coup → +100+50+50+50+10 = 260 ; recrue créée avec le même cookie `cid` → prime 0 ; `/history` d'un tiers → redirection QG ; noms hostiles échappés.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): recruits confirmed on /history with referral bounties`.

### Task 5: `/protect` — mot de passe d'armée

**Files:** Create `apps/server/src/{routes,views}/protect.ts`, `apps/server/test/protect.test.ts` ; Modify `repo.ts` (`setPassword(db, armyId, hash): void`), `views/{panel,layout}.ts`, `routes/index.ts`, `docs/game/unverified.md`.

- `GET /protect` (propriétaire) : sans mot de passe, page `protect.html` (encadré « Créer un mot de passe… », « Tape un mot de passe de ton choix ci-dessous : », `pass`, `passconf`) ; avec mot de passe, `protect-2.html` (« Modifier le mot de passe », `pass` ancien, `newpass`, `passconf`). Poste différent (`created_cid` non NULL ≠ `cid` de la session) : bloc `#bad` mot pour mot, bouton « Retour ». `created_cid` NULL (armées d'avant la migration, CLI) : autorisé (`// UNVERIFIED`).
- `POST /protect?submit=1` : champ caché `chk` (clé de session) en plus de `mid` ; 1..100 caractères ; `passconf` identique ; ancien mot de passe vérifié (`verifyPassword`) avec la limite de `/login` (10 / 10 min par IP+armée) ; succès → `/hq` avec notification « Ton mot de passe a été enregistré. » ; erreurs : « Les deux mots de passe sont différents. », « Ancien mot de passe incorrect. », « Mot de passe vide. » (`// UNVERIFIED` textes non archivés). Les autres sessions de l'armée sont déliées au changement.
- Menu : « Protéger mon armée » masqué une fois protégé (déjà fait) ; pied de page « Modifier mon pass » (`/protect`) quand protégée ; la route « bientôt » de `/protect` disparaît.

- [ ] **Step 1:** Tests : création → `password_hash` non NULL et `/login` avec ce mot de passe ouvre l'armée ; `passconf` différent → message, rien d'enregistré ; changement avec mauvais ancien → message ; 11ᵉ essai → refus limite ; autre `cid` → texte « depuis l'ordinateur que tu utilises actuellement » ; POST sans `chk` ou d'une autre origine → 403/redirection sans effet ; après changement, une seconde session de la même armée est déconnectée ; pied de page « Modifier mon pass » présent.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): /protect army password`.

### Task 6: Missions — déblocage, mission du jour, 3 essais

**Files:** Create `apps/server/src/routes/mission.ts`, `apps/server/src/views/mission.ts`, `apps/server/test/mission.test.ts` ; Modify `battleInput.ts`, `foes.ts`, `repo.ts`, `views/{hq,battle}.ts`, `routes/index.ts`, `docs/game/unverified.md`.

**Interfaces — Produces:**
```ts
type ModeKind = MissionType | "raid"
buildModeInput(p: { mode: ModeKind; seed: number; attacker: { faction: number; troopers: readonly BattleTrooperInput[]; spawn: number }; foe: BattleArmyInput }): BattleInput
unlockMissions(db: DatabaseSync, armyId: number, cost: number): "ok" | "already" | "poor"
fightMission(db: DatabaseSync, p: { armyId: number; day: string; used: number; decide: () => NewModeBattle | string }): ModeResult
type NewModeBattle = NewBattle & { mode: ModeKind; phase?: number; dead?: number[] }
type ModeResult = { ok: true; id: number; n: number } | { ok: false; reason: "stale" | "limit" | "locked" | "won"; used: number } | { ok: false; reason: "refused"; code: string }
modeBattleOfDay(db: DatabaseSync, armyId: number, day: string, kind: "mission" | "raid", n: number): BattleRow | null
```
- `buildModeInput` (RECON3 §2) : fond `exterminate` attic (1), `infiltrate` sewer (2), `epic` road (3), `raid` wood (4) ; ids : défenseur d'abord pour `infiltrate`/`raid`, attaquant d'abord pour `exterminate`/`epic` ; `spawnOrder` attaquant = ses `spawn` premiers troopers (épique : les troopers propres ; raid : `[]`), adversaires PNJ/rats `[]`.
- Routes : `GET /b/unlock?chk=KEY` (débite 5 une fois → `/hq`) ; `GET /b/mission?n=<essais faits>;chk=KEY` : type = `daily.mission_type` figé au premier accès (`missionOfDay`, recrues confirmées) ; refus si non débloqué, 3 essais faits ou mission gagnée ; adversaire figé pour le jour : `exterminate` → `ratArmy(dayRats({count: armies.rats}))`, `infiltrate` → `pickInfiltrationTarget` (armées stockées ≠ soi avec ≥ 1 trooper, `fought` = adversaires de mes combats et attaquants des miens ; repli `fillerArmy` de ma puissance) mémorisé dans `daily.mission_target`, `epic` → armée propre + recrues confirmées (1er trooper, `pref null`, niveau décroissant) jusqu'à 32 contre `npcArmy({power: epicPower(epic_wins), min: 32, max: 100})` ; graine de combat aléatoire par essai ; victoire : +4, `rats+1` (exterminer) ou `epic_wins+1` (épique) ; → `/b/view/miss<n>`.
- Vue `/b/view/miss<n>` (n = 1..3, propriétaire) : `b_view_miss1.html` ; `<h1>` « Infiltrer la base de L'armée de X » pour l'infiltration seulement (`swfframe nam`) ; première vue : `endMsg` « Tu as remporté la mission du jour ! Ton armée gagne +4 [T] » / « Ce combat s'est soldé par un échec ! » (`// UNVERIFIED` victoire), `endBattle` → `/hq?money=4` si gagnée ; vues suivantes : textes de rediffusion archivés, `/hq`, « Retour ».
- QG : boîte « Mission : Infiltrer | Exterminer | Epique » (fond sewer/attic/road) ; non débloquée : une tuile « Débloquer pour 5 [token] » → `/b/unlock` (`// UNVERIFIED`, texte $GL) ; sinon une tuile par essai (`bwin`/`bdefeat` → `/b/view/miss<n>`, infobulle « Tu as remporté la mission du jour ! » sur la victoire), tuiles `bgo2` restantes (« Il te reste N essais pour la mission du jour ! », `// UNVERIFIED`) masquées après une victoire, chrono « Nouvelle mission dans » conservé.

- [ ] **Step 1:** Tests : `buildModeInput` reconstruit exactement les fixtures de la tâche 1 à partir de leurs armées (ids, `spawnOrder`, fond) pour les 4 modes ; `/b/mission` non débloqué → QG sans combat ; déblocage débite 5 une fois (URL rechargée : crédits identiques ; 4 crédits → « poor ») ; 3 défaites → 4ᵉ refusée ; victoire au 1er essai → 2ᵉ refusée, +4 ; mêmes rats aux 3 essais (graines identiques), 2 rats le lendemain d'une victoire ; même cible d'infiltration aux 3 essais ; épique : 12 troopers + 25 recrues → côté joueur de 32, `spawnOrder` = 12 ids ; requêtes simultanées sur la même URL → un combat ; 23:59:59 → 00:00:01 : compteur à 0 et nouveau type tiré ; la page `/b/view/miss1` contient une flashvar `data=` qui décode exactement l'`input` stocké.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): daily missions (exterminate, infiltrate, epic)`.

### Task 7: Raids

**Files:** Create `apps/server/src/routes/raid.ts`, `apps/server/test/raid.test.ts` ; Modify `repo.ts`, `views/hq.ts`, `routes/index.ts`, `docs/game/unverified.md`.

**Interfaces — Produces:**
```ts
type RaidRecruit = { recruitArmyId: number; trooper: BattleTrooperInput }      // 1er trooper (slot 0), pref null
raidRecruits(db: DatabaseSync, armyId: number): RaidRecruit[]                 // recrues confirmées, niveau croissant puis id
fightRaid(db: DatabaseSync, p: { armyId: number; day: string; phase: number; decide: (alive: RaidRecruit[]) => NewModeBattle | string }): ModeResult
```
- `GET /b/raid?phase=<p>;chk=KEY` : vivantes = `raidRecruits` moins `daily.raid_dead` ; refus si 0 vivante, `raid_over` ou `phase` ≠ `daily.raid_phase` ; jusqu'à `RAID_PER_BATTLE` vivantes (les plus faibles) contre `npcArmy({power: raidPower(p), ...raidTrooperRange(p), seed: hash(jour|armée|phase)})`, attaquant de la faction du joueur ; les recrues du cimetière (`outcome.graveyard`) rejoignent `raid_dead` ; victoire : +4, `raid_phase+1`, `raid_over` à la 20ᵉ ; défaite : `raid_over`. → `/b/view/raid`.
- `/b/view/raid` (propriétaire) : dernier raid du jour ; première vue gagnée : `endMsg` archivé « Félicitations, tu as remporté le raid ! Ton armée gagne +4 [T] et tu peut tenter le raid suivant. », `endBattle` → `/hq?money=4` ; défaite : « Ce combat s'est soldé par un échec ! » ; pas de `<h1>`.
- QG (`hq-levelup.html`) : titre « Raid » puis « Raid Phase N » (N > 1, d'après `com/hq.html`) ; `.rcount` N + infobulle « Recrues Disponibles » archivée ; tuile `bgo` → `/b/raid?phase=N;chk=KEY` « Lancer un raid avec les N recrues encore vivantes ! », hqtip « Encore N recrues disponibles pour le raid ! » ; raid fini : tuile `bdefeat`/`bwin` → `/b/view/raid` et « Nouveau raid dans » + chrono ; aucune recrue : `bcount0` + « Recrute tes amis pour lancer un raid ! » (`// UNVERIFIED` ces deux textes).

- [ ] **Step 1:** Tests : sans recrue confirmée → aucun combat ; 3 recrues de niveaux 3,1,2 → attaquants dans l'ordre des niveaux 1,2,3 ; PNJ (1 ou 2) d'ids 0..m−1 et de puissance 11, recrues d'ids m..m+2 ; victoire → +4, phase 2, QG « Raid Phase 2 » ; recrue morte en phase 1 absente de la phase 2 ; défaite → plus de tuile `bgo` ; URL de la phase 1 rejouée après la phase 2 → aucun combat ; 20 victoires → `raid_over` (phase 21 jamais tirée, `// UNVERIFIED` plafond) ; lendemain : phase 1 et toutes les recrues vivantes ; flashvar `data=` de `/b/view/raid` = `input` stocké.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): raids with recruit pool and chained phases`.

### Task 8: Armée du frère — `create-bro-army`

**Files:** Modify `apps/server/src/admin/{cli,army}.ts`, `apps/server/test/admin.test.ts`, `apps/server/README.md`, `docs/game/unverified.md`.

**Interfaces — Consumes:** `seedsOffering` (tâche 2), `deleteArmy` (tâche 3), `buildTroopers` (spec `skills: ["SMART"]`). **Produces :**
- `npm run admin -- create-bro-army --name <nom> [--part 0-5] [--faction 0-5] [--count 12] [--rats 35] [--credits 0] [--force]` : `--name` obligatoire (jamais codé en dur) ; mot de passe **uniquement** par `MT_ARMY_PASSWORD` (absent ou vide → erreur) ; troopers = `seedsOffering(SKILLS.SMART, count)` (12 graines à partir de 273018), noms `trooperName(new Rand(graine))`, une montée de niveau choisissant Malin (niveau 2) ; `armies.rats` = `--rats` (défaut 35 = rats de la prochaine extermination, `// UNVERIFIED` « environ 30 à 40 ») et missions débloquées ; `created_cid` NULL.
- `create-army` gagne `--rats N` et `--force` ; `--force` (les deux commandes) remplace une armée existante de même hôte dans une seule transaction (`deleteArmy` puis insertion) ; refusé sur une armée de faction ; sans `--force`, armée existante → erreur « existe déjà ».

- [ ] **Step 1:** Tests : `create-bro-army --name "Les Frangins"` avec `MT_ARMY_PASSWORD=x` → 12 troopers, chacun `describeTrooper(...).skills` contient 64 et niveau 2, `rats === 35`, `verifyPassword("x", hash)` ; sans variable → erreur et rien en base ; 2ᵉ appel sans `--force` → « existe déjà » ; avec `--force` → nouvel id, ses anciens combats d'attaquant supprimés, les combats où elle défendait conservés (`gone:`), ses recrues gardées avec `recruiter_id` NULL ; la première extermination de cette armée oppose 35 rats ; `--force` sur une faction → refus.
- [ ] **Step 2:** FAIL → implémenter (README : exemple de commande, sans nom d'armée réel). **Step 3:** PASS. Commit `feat(admin): create-bro-army (SMART troopers, extermination progress, --force)`.

### Task 9: Bout en bout et documentation

**Files:** Modify `apps/server/test/e2e.test.ts`, `apps/server/README.md`, `docs/game/unverified.md`, `docs/research/original-game.md` (« Vérifié depuis » : paliers de parrainage, formes des armées de mode, raid phase 1 = 11).

- e2e (Playwright headless, ignoré si navigateurs absents), paramétré `URL_MODE=path|subdomain` : A crée son armée ; B s'inscrit par le lien de A ; A visite `/history` (+100) ; A débloque et joue la mission du jour ; A lance un raid avec B ; A pose un mot de passe ; pour la mission et le raid, la page charge Ruffle et le SWF émet la fin de combat avec le même vainqueur que la base.

- [ ] **Step 1:** Écrire l'e2e → FAIL. **Step 2:** corriger → PASS dans les deux modes. **Step 3:** `npm test`, `npm run typecheck`, `npm run oracle:diff` → verts / 0 KO. Commit `test(server): stage-3 end-to-end` et push.

---

## Hors de ce plan

Étape 4 : `/history` complet (combats défensifs, animation ClientMode 5), `/ranks`, `/choice`, `/endDay` (redirection après le dernier combat, mission et raid), Docker + Cloudflare Tunnel, CLI `replace-army` générique (au-delà de `--force`), aide de semis SMART généralisée, nettoyages DRY, images CSS manquantes (`buttons/button.png`, `art_1.jpg`, `loc/moreg_*.png`, `upcup/bg.jpg`) et polices Open Sans / Forum du gabarit (le `<!DOCTYPE html>` est déjà présent) : à récupérer sur Wayback, pas bon marché ici.
