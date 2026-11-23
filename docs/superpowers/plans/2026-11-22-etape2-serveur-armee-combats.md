# Étape 2 — Règles, serveur, armée et combats quotidiens — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** une instance jouable en local : créer son armée, voir son QG, consulter/améliorer/renommer/régler ses troopers, en acheter, et livrer ses combats quotidiens rejoués par le SWF original — fidèle aux pages et règles de 2011.

**Architecture:** `@mt/engine` (v1.0.0, prouvé) reçoit une couche « frontière » (validation, résultat structuré, API de jeu). Nouveau paquet `@mt/game` (règles hors combat, pur, testable). `apps/server` : Hono sur Node 24 + `node:sqlite`, pages HTML rendues côté serveur reprenant le HTML/CSS/JS originaux de `minitroopers-extra`, Flash remplacé par `ruffle.js` auto-hébergé qui charge `client_fr_play.swf` (= `client_fr.swf` avec le seul contrôle `chk` neutralisé).

**Tech Stack:** Node 24.12 (TS natif), Hono + `@hono/node-server`, `node:sqlite`, `node:test`; Ruffle web épinglé (même cœur que l'oracle, nightly 2025.7.28 / a111ceec); Playwright headless (outils portables `tools/bin`) pour les tests de bout en bout.

**Spec:** `docs/superpowers/specs/2026-11-22-minitroopers-remake-design.md` (dont « Affichage des combats », « Passation vers l'étape 2 », « Déploiement »). Référence jeu : `docs/research/original-game.md`. **Reconnaissance (source des valeurs de ce plan) :** `C:\Users\kikik\minitroopers-work\recon\stage2-recon.md` (noté `RECON`), assets bruts dans `C:\Users\kikik\minitroopers-work\recon\` ; copie de `minitroopers-extra/site-elements` dans `RECON\assets\extra\site-elements` (noté `$EX`).

## Global Constraints

- Dépôt privé ; assets Motion-Twin (HTML/CSS/JS/images/SWF originaux) autorisés dans le dépôt.
- Node 24.12, ESM, TS natif, `erasableSyntaxOnly` ; dépendances d'exécution du serveur limitées à `hono` et `@hono/node-server` ; `@mt/engine` et `@mt/game` : zéro dépendance, zéro I/O.
- Français seul. Textes et HTML repris des pages originales FR (`$EX/html/fr/*.html`) mot pour mot quand ils existent.
- Priorité des sources : SWF > pages archivées > wikis > serveur de test > GitLab. Règle non vérifiable → valeur choisie + commentaire `// UNVERIFIED: <raison>` + entrée dans `docs/game/unverified.md`.
- PC de Killian propre : rien d'installé ; données locales (SQLite, logs) dans `var/` (gitignoré) ; navigateurs de test sous `tools/bin/ms-playwright`.
- Instance publique future derrière Cloudflare Tunnel : IP client = `CF-Connecting-IP` seulement si `TRUST_PROXY=1` ; cookies `HttpOnly`, `SameSite=Lax`, `Secure` si `PUBLIC_URL` est https.
- Deux modes d'URL de première classe, choisis par `URL_MODE=subdomain|path` : `<host>.<domaine>/hq` ou `/a/<host>/hq`. Tout lien interne passe par un helper `armyUrl(host, path)`.
- Combats : le serveur calcule avec `simulateOutcome` ; le navigateur rejoue avec `client_fr_play.swf` ; les deux reçoivent exactement la même `BattleInput`.
- Commits terminés par :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` et
  `Claude-Session: https://claude.ai/code/session_01KQAKEQ6K3ZCfz4LPURkqeE`.

## Review Focus

1. **Double soumission / rejeu d'URL d'action** (`?levelup=KEY` rechargé, double clic « Attaquer ») : une seule dépense, un seul combat. Tests dans les tâches 6 et 8.
2. **Armée attaquée pendant qu'on la modifie / armée inexistante attaquée par nom** : message d'erreur original, pas de crash. Test tâche 8.
3. **Bascule de jour pendant une session** (combat lancé à 23:59:59 / 00:00:01) : compteurs du bon jour, offres renouvelées. Tests tâches 3 et 8 avec horloge injectée.
4. **Noms hostiles** (balises HTML, guillemets, surrogates isolés, 0-largeur, très longs) dans noms d'armée/trooper : échappés partout, rejetés si invalides, jamais dans un attribut non échappé ni dans une flashvar non encodée. Tests tâches 5 et 6.
5. **Mode chemin vs sous-domaine** : chaque page et redirection fonctionne dans les deux modes. Test paramétré tâche 9.

---

## Structure des fichiers

```
packages/engine/src/boundary/{validate.ts,outcome.ts,api.ts,flashvars.ts}  frontière (tâche 1)
packages/engine/src/internal.ts          export "@mt/engine/internal" (harnais)
packages/game/src/{names.ts,host.ts,offers.ts,economy.ts,opponents.ts,factions.ts,fillers.ts,day.ts,equip.ts}
packages/game/data/{names-corpus.json,factions.json}
assets/swf/client_fr_play.swf (+ .sha256)  tools/oracle/instrument/build-play.ps1
apps/server/src/{main.ts,config.ts,db/{schema.sql,db.ts,repo.ts},http/{app.ts,session.ts,urls.ts,ip.ts,ratelimit.ts},
  views/{layout.ts,html.ts,tips.ts,home.ts,hq.ts,trooper.ts,levelup.ts,add.ts,opp.ts,battle.ts,errors.ts},
  routes/{home.ts,hq.ts,trooper.ts,add.ts,battle.ts},jobs/daily.ts,admin/cli.ts}
apps/server/public/{css,js,img,swf,ruffle}/   assets originaux + ruffle + embed.js
apps/server/test/**   docs/game/unverified.md
```

---

### Task 1: Frontière du moteur (passation étape 1)

**Files:** Create `packages/engine/src/boundary/*`, `packages/engine/src/internal.ts`, tests `packages/engine/test/boundary/*.test.ts` ; Modify `packages/engine/src/index.ts`, `packages/engine/package.json` (exports `.` et `./internal`), `packages/engine/test/golden.test.ts`, `tools/oracle/src/**` (imports internes), `packages/engine/tsconfig.json` (src sans `types:["node"]`).

**Interfaces — Produces:**
```ts
validateBattleInput(input: BattleInput): { ok: true } | { ok: false; errors: string[] }
simulateOutcome(input: BattleInput): BattleOutcome   // valide d'abord (lève InvalidBattleInput)
type BattleOutcome = { winner: 0 | 1 | null; graveyard: number[]; deployed: number[]; events: number }
describeTrooper(t: BattleTrooperInput, faction?: number): TrooperSheet
type TrooperSheet = { level: number; life: number; job: number | null; skills: number[];
  weapons: number[]; equipment: number[]; leftOver: number[]; physical: GhostPhysical }
levelUpOptions(t: BattleTrooperInput): { shown: number[]; drawn: number[]; choiceCount: number }
choiceIndexForSkill(t: BattleTrooperInput, skill: number): number | null   // index dans drawn, si skill ∈ shown
reequip(t: BattleTrooperInput, rand: Rand): number[]                        // nouveau leftOver
defaultLeftOver(t: BattleTrooperInput): number[]                            // port $GL getLeftOver sur Ghost
upgradeCost(choicesLength: number): number; recruitCost(trooperCount: number): number | null
armyPower(armies: { choices: number[] }[]): number; trooperLevel(choicesLength: number): number
clientParams(data: string, extra?: { endMsg?: string; onclick?: string }): string   // "data=…&chk=play&imageurl=/img/…"
battleData(input, gfx) / trooperData(t, faction, gfx) / gridData(g, gfx) / midData(s): string   // ClientMode 0/2/4/3
```
- Valeurs : `recruitCost` = `Data.XP_LEVELS[count]` (8,24,60,120,200,340,500,720,1000,1300,2000 ; `null` à 12) ; `upgradeCost(n) = int((n+1)^2.5)` ; `armyPower = Σ(5 + choices.length)` ; `shown` = les `choiceCount-1` premières options de `drawOptions()` (choiceCount 3, 4 avec MALIN=64) ; au choix du niveau 6 le pool est ARMY_JOB (RECON §2.5).
- Validation : enums dans leurs plages (`enums.ts`), armées non vides, ids uniques ≥ 0, graines int32, `choices` ∈ {-1} ∪ [0, choiceCount), noms UTF-16 bien formés ≤ 20, `force`/`leftOver` = index de compétence valides.

- [ ] **Step 1:** Tests : (a) `validateBattleInput` rejette 0v0, skill 9999, type 7, seed 2^31, nom avec surrogate isolé, ids dupliqués — chacun avec un message ; accepte tous les inputs des goldens committés. (b) `simulateOutcome` sur chaque golden committé : `winner`/`graveyard` = ceux de `simulateBattle`. (c) `levelUpOptions` : trooper sans MALIN → `shown.length===2`, avec MALIN → 3 ; niveau 6 → toutes les options sont des ARMY_JOB ; rejouer `choices + [choiceIndexForSkill(s)]` dans `generateTrooper` donne un trooper possédant `s`. (d) `recruitCost(1)===8`, `recruitCost(6)===340`, `recruitCost(12)===null`, `upgradeCost(8)===243`. (e) `defaultLeftOver` sur un trooper à 5 équipements laisse 3 objets ; `reequip` garde 3 objets et est déterministe pour un `Rand` donné. (f) `trooperData` sur le trooper de `$EX/html/fr/t_0.html` redonne exactement le `data=` original (décodeur `RECON\assets\tools\hxdec.js`) ; idem `gridData` sur `hq-levelup.html` et `battleData` sur `b_fview_262581433.html`. (g) test qui échoue si `packages/engine/src` contient `node:`, `process.`, `Math.random`, `Date`. (h) `golden.test.ts` vérifie `formatVersion===1` et `swfSha256`.
- [ ] **Step 2:** Lancer → FAIL. Implémenter ; `Object.freeze` récursif des tables `Data` ; déplacer `Battle`, `Trooper`, `as3Sort`, `OBF_KEYS`, `formatTrooperLine`, `projectGenerated`, `trooperProjection`, `simulateBattle*` vers `internal.ts` ; supprimer `NotImplemented`.
- [ ] **Step 3:** `npm test`, `npm run typecheck`, `npm run oracle:diff` → PASS / 0 KO. Commit `feat(engine): stage-2 boundary API`.

### Task 2: SWF d'affichage `client_fr_play.swf`

**Files:** Create `tools/oracle/instrument/build-play.ps1`, `assets/swf/client_fr_play.swf(.sha256)`, `tools/oracle/test/play.test.ts` ; Modify `tools/oracle/instrument/README.md`.

**Interfaces — Produces:** `client_fr_play.swf` = `client_fr.swf` + uniquement le contournement `PC_MAIN` (branche `chk`) de `build.ps1`, sans helpers de trace ; accepte n'importe quel `chk`.

- [ ] **Step 1:** Test (ignoré si Chromium absent) : pour 20 goldens committés variés, charger `client_fr_play.swf` dans le runner Ruffle web avec `battleData(input)` + `clientParams` et capter le résultat via le callback ExternalInterface de fin de combat ; il égale `simulateOutcome(input).winner`. Plus : modes 2 et 4 (trooper de `t_0.html`, grille de `hq-levelup.html`) se chargent sans erreur Ruffle dans la console.
- [ ] **Step 2:** FAIL → écrire `build-play.ps1` (réutilise `build.ps1` : même source vérifiée par SHA, seul patch `PC_MAIN`), produire le SWF, diff P-code = une seule branche modifiée (consigné dans le README).
- [ ] **Step 3:** PASS. Commit `feat(oracle): client_fr_play.swf (chk bypass only)`.

### Task 3: `@mt/game` — économie, jour, offres, noms, sous-domaine

**Files:** Create `packages/game/{package.json,tsconfig.json,src/{index,names,host,offers,economy,day}.ts,data/names-corpus.json}`, tests `packages/game/test/*.test.ts`, `docs/game/unverified.md`.

**Interfaces — Produces:**
```ts
dayKey(now: Date, tz: string): string                     // "2026-11-22", reset à 00:00 Europe/Paris
nextResetAt(now: Date, tz: string): Date
host(name: string): string                                // port exact de Common.host (app.js original)
validateArmyName(name: string, part: number): { ok: true; host: string } | { ok: false; error: string }
dailyOffers(p: { day: string; clientId: string; recruiter: string | null; salt: string }): OfferTrooper[]   // 5 offres
type OfferTrooper = { seed: number; name: string; colour: number }
trooperName(rand: Rand): string
battlesPerDay(troopers: { skills: number[] }[]): number   // 3 + nb COMMANDEMENT(69), max 5
battleReward(win: boolean): number                         // 2 / 1
referralBounty(recruitIndex: number): number               // 100 ; 50×3 ; 10×10 ; 5×20 ; 0 (index 1-based)
STARTING_CREDITS: number                                    // UNVERIFIED, valeur documentée
```
- `host` : removeAccents → minuscules → trim → `\s+`→`-` → retirer `[^a-z0-9-]` → si >16 : première partie si ≥8 car., sinon 16 premiers sans `-` final (RECON §2.3). `validateArmyName` : 1–20 car., `part` ∈ 0..5, `host` ≥ 3 car. et hors liste réservée (`www, data, admin, api, static, a, …`), unique (vérifié par le serveur).
- `dailyOffers` : graines = hachage déterministe (FNV-1a 32 bits) de `(day, clientId, recruiter, salt, slot)` ramené dans [273018, 16491340] (plage observée) ; noms via `trooperName` alimenté par le corpus des noms originaux (RECON §2.2, base + suffixe + décorations). `// UNVERIFIED` (formule originale inconnue).

- [ ] **Step 1:** Tests : `host` sur les cas de RECON (« agen-blakla », « Tyraël » → « tyrael », nom de 20 car. avec tiret) ; `dailyOffers` identique pour mêmes paramètres, différent si jour/client/recruteur change, 5 graines distinctes ; `referralBounty` 1→100, 2..4→50, 5..14→10, 15..34→5, 35→0 ; `battlesPerDay` 0 COMMANDEMENT→3, 3→5 ; `dayKey` 22:59:59Z vs 23:00:01Z en hiver (Paris) change de jour ; `trooperName` donne ≤ 12 car.
- [ ] **Step 2:** FAIL → implémenter (corpus extrait des HTML originaux par un script `packages/game/scripts/extract-names.mjs` committé).
- [ ] **Step 3:** PASS. Commit `feat(game): economy, day, offers, names, host`.

### Task 4: `@mt/game` — adversaires, factions, remplissage

**Files:** Create `packages/game/src/{opponents,factions,fillers}.ts`, `packages/game/data/factions.json`, tests.

**Interfaces — Produces:**
```ts
FACTIONS: { id: number; name: string; part: number; host: string; troopers: { id: number; name: string; seed: number; level: number }[] }[]
pickOpponents(p: { self: ArmyRef; candidates: ArmyRef[]; day: string; clientId: string }): ArmyRef[]   // exactement 5
fillerArmy(p: { power: number; seed: number }): FillerArmy        // armée générée, jamais persistée comme compte
type ArmyRef = { id: string; power: number; isFiller?: boolean }
```
- Factions : 5 armées récupérées de RECON §2.15 (noms, graines, ids 0..5, niveaux 20..10, choices tous 0, `pref:null`) ; faction 3 (« Torses velus ») : refaire une recherche CDX Wayback (variantes de sous-domaine) ; si introuvable, générer 6 troopers par `dailyOffers`-like seed fixe et marquer `// UNVERIFIED`.
- `pickOpponents` : 5 armées distinctes ≠ soi, priorité aux armées réelles de puissance la plus proche (fenêtre élargie progressivement), complétées par `fillerArmy` ; stable pour (jour, client). `// UNVERIFIED` (règle originale inconnue, wiki « near power »).

- [ ] **Step 1:** Tests : 5 factions récupérées ont puissance 114 et les noms exacts ; `pickOpponents` retourne 5 éléments, sans soi, déterministe, préfère réel à remplissage, complète avec remplissage si 0 candidat ; `fillerArmy` a une puissance ±20 % de la cible et passe `validateBattleInput`.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(game): opponents, factions, fillers`.

### Task 5: Serveur — socle, base, session, assets, gabarit

**Files:** Create `apps/server/**` (structure ci-dessus) sauf vues de pages ; `apps/server/public/` (copie de `$EX/css/style.css`, `$EX/js/app.js`, `$EX/img/**`, jQuery 1.5.1 et 11 images de `RECON\assets\wayback\`, `ruffle/` épinglé, `swf/{client_fr_play,mini,army}.swf`, `js/embed.js`) ; tests `apps/server/test/{session,urls,ip,layout,db}.test.ts` ; `.gitignore` (`var/`).

**Interfaces — Produces:**
- `loadConfig(env): Config` — `PORT` (défaut 8080), `URL_MODE` (défaut `path`), `PUBLIC_URL`, `BASE_DOMAIN`, `DATA_DIR` (défaut `var/`), `TRUST_PROXY`, `TZ_GAME` (`Europe/Paris`), `HOST` (`127.0.0.1`). (`ADMIN_TOKEN` abandonné : l'administration passe par la CLI locale.)
- Schéma SQLite (`schema.sql`, migrations numérotées) : `armies(id, host UNIQUE, name, part, faction, credits, recruiter_id, created_at, created_ip, password_hash NULL, is_faction)`, `troopers(id, army_id, slot, seed, name, renamed, choices JSON, pending_levelup, pref JSON, left_over JSON)`, `battles(id, day, attacker_id, defender_id, input JSON, winner, kind)`, `daily(army_id, day, battles_used, opponents JSON)`, `sessions(key, army_id, client_id, created_at)`.
- `session.ts` : cookie `ssid` (clé 6 car. comme l'original, anti-CSRF sur toute URL d'action) + `cid` (identifiant client persistant = « machine id » de remplacement, `// UNVERIFIED` : le `mid` Flash n'est pas vérifiable sans `chk`).
- `urls.ts` : `armyUrl(cfg, host, path)` ; résolution de l'armée courante depuis l'hôte ou `/a/<host>/`.
- `embed.js` : remplace `swfobject.embedSWF(url,id,w,h,ver,x,fv,params,attrs)` par Ruffle (`RufflePlayer.newest().createPlayer()`, `config` = params originaux + `autoplay:"on"`, `splashScreen:false`, `contextMenu:"off"`, `backgroundColor:"#F2DDB8"`), une instance par appel, pour que les `<script>` originaux restent inchangés.
- `views/layout.ts` : cadre commun repris de `$EX/html/fr/hq-levelup.html` (ptop … dbottom, `.copy`), helpers `html` (échappement par défaut), `tip(title, body)`.
- `jobs/daily.ts` : rien à recalculer à minuit (tout est indexé par `dayKey`) sauf purge des sessions > 30 j.

- [ ] **Step 1:** Tests : migrations idempotentes ; `armyUrl` dans les deux modes ; IP = `CF-Connecting-IP` seulement si `TRUST_PROXY=1` ; URL d'action avec mauvaise clé → 403 ; le gabarit échappe `<script>` dans un nom ; `GET /css/style.css` = octets de `$EX/css/style.css`.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): skeleton, db, session, assets, layout`.

### Task 6: Accueil, création d'armée, connexion, QG

**Files:** Create `apps/server/src/{views,routes}/{home,hq}.ts`, `views/tips.ts` (infobulles compétences/armes : textes FR extraits des pages originales par `apps/server/scripts/extract-tips.mjs` → `apps/server/data/tips.fr.json`), tests `apps/server/test/{home,hq}.test.ts`.

- Routes : `GET /` (sans armée : recrutement par la faction aléatoire ; via `<recruteur>/` : « L'armée de X recrute ») ; `GET /check?name=` → `free|used` ; `POST /` (`part`, `name`, `tselect`) ; `POST /login` (`login` → redirection vers l'armée ; avec `pass` si protégée) ; `GET /hq` ; `GET /hq?money=N`.
- Création : `tselect` ∈ offres du jour du client, nom valide et libre, limite 2 armées/jour/IP (`// UNVERIFIED` chiffre du wiki), faction = celle du recruteur sinon aléatoire, crédits = `STARTING_CREDITS`, cookie posé, redirection `/hq`.
- QG : HTML de `hq-levelup.html` : argent, puissance, grille ClientMode 4 (`gridData`, `add:true` si < 12), menu (Recruter, Historique/Gérer/Protéger/Hiérarchie présents mais renvoyant une page « bientôt » d'étape 3–4), boîte Bataille (une tuile par combat du jour : `bwin`/`bdefeat` vers `/b/view/batN` sinon `bgo2` vers `/b/opp`, « Il te reste N batailles aujourd'hui ! »), boîtes Mission/Raid affichées verrouillées (« bientôt »), lien de recrutement + « Ta prochaine recrue te rapportera N », minuteur jusqu'au reset, notifications (`#notification`).

- [ ] **Step 1:** Tests : création complète (offres → POST → cookie → `/hq` 200 contenant le nom) ; `tselect` hors offres → erreur originale ; 3ᵉ armée même IP même jour refusée ; nom déjà pris → `used` ; `/hq` sans cookie → accueil ; `/hq` d'une armée protégée sans session → formulaire mot de passe ; QG affiche 3 tuiles puis 4 avec un trooper COMMANDEMENT ; noms hostiles échappés.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): home, army creation, login, HQ`.

### Task 7: Fiche trooper, amélioration, niveau, renommage, réglages, ré-équipement, achat

**Files:** Create `apps/server/src/{views,routes}/{trooper,levelup,add}.ts`, tests.

- `GET /t/<n>` (fiche `t_0.html` : SWF mode 2, ~140 icônes dans l'ordre `skills_placement.txt` avec `class="on"` si possédée, bouton « Améliorer pour X », formulaire `config`) ; `GET /t/<n>?levelup=KEY` (débite `upgradeCost`, pose `pending_levelup`, → `/levelup/<n>` ; une seule fois même si rechargé) ; `GET /levelup/<n>` (options `levelUpOptions.shown`, textes FR) ; `GET /levelup/<n>?skill=<id>&chk=KEY` (`choiceIndexForSkill` → ajoute à `choices`, efface `pending`, notification de félicitations sur `/hq`) ; tant que `pending`, `/t/<n>` redirige vers `/levelup/<n>` ; `GET /t/<n>?name=…&chk=KEY` (une fois, ≤ 12 car., `renamed=1`) ; `POST /t/<n>?config=KEY` (`weapon` = index dans les armes du trooper → `CWeapon`, `loc`, `target`, `move`, `ttype` → `targetType/targetClass` ; déverrouillage par niveau L1/L2/L3/L5/L6 `// UNVERIFIED`) ; `GET /t/<n>?equip=KEY` si > 3 équipements (`reequip`).
- `GET /add` + `POST /add` (`tselect` ∈ offres, `recruitCost(count)`, refus à 12, slot suivant).

- [ ] **Step 1:** Tests : améliorer débite exactement `upgradeCost`, recharger l'URL ne débite pas deux fois ; skill hors `shown` refusé ; après choix, le trooper possède la compétence (via `describeTrooper`) ; trooper MALIN voit 3 options ; renommer deux fois refusé, nom 13 car. refusé ; `config` avec `ttype=5` → `targetType 1, targetClass 5` ; achat du 2ᵉ trooper à 8 crédits, 13ᵉ refusé ; crédits insuffisants → message original.
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): trooper sheet, level-up, rename, prefs, re-equip, add`.

### Task 8: Adversaires et combats quotidiens

**Files:** Create `apps/server/src/{views,routes}/{opp,battle}.ts`, tests.

- `GET /b/opp` (5 adversaires `pickOpponents`, figés dans `daily.opponents` pour le jour ; grilles mode 4 `xmax:4`, puissance, `Attaquer !` → `/b/battle?opp=<id>;chk=KEY` ; formulaire « Infiltrer ! » par nom) ; `GET|POST /b/battle` (vérifie clé, combats restants `battlesPerDay`, adversaire ∈ liste du jour ou armée nommée existante ≠ soi ; construit `BattleInput` (graine de combat aléatoire serveur, fond `garden`, `attackerSide 0`, armée attaquante complète, défenseur complet ; `spawnOrder` = ordre des slots), `simulateOutcome`, crédite `battleReward`, enregistre, → `/b/view/batN` ou `/b/fview/<id>`) ; `GET /b/view/batN` et `GET /b/fview/<id>` (page `b_fview_*.html` : `embedSWF(client_fr_play.swf, 720×440)`, flashvars `battleData + clientParams(endMsg)`, `endBattle()` → `/hq?money=N`, bouton Retour).
- Armées de remplissage : construites à la volée depuis `fillerArmy`, jamais en base ; un combat contre elles est enregistré avec `defender_id NULL` et l'input complet.

- [ ] **Step 1:** Tests : 4ᵉ combat refusé (3/jour) ; double requête simultanée sur la même URL → un seul combat ; adversaire hors liste refusé ; attaque par nom inexistant → message ; la page de rediffusion contient une flashvar `data=` dont le décodage redonne exactement l'`input` stocké ; crédits +2/+1 selon `winner` ; bascule de jour à 00:00 Europe/Paris réinitialise le compteur (horloge injectée).
- [ ] **Step 2:** FAIL → implémenter. **Step 3:** PASS. Commit `feat(server): opponents and daily battles`.

### Task 9: Administration, bout en bout, lancement local

**Files:** Create `apps/server/src/admin/cli.ts`, `apps/server/test/e2e.test.ts`, `apps/server/README.md` ; Modify root `package.json` (scripts `dev`, `start`, `admin`), README racine.

- `npm run admin -- seed-factions` (crée les armées de faction), `create-army --name … --troopers <json>` (armée avec graines/choix fournis ; servira à l'armée du frère), `give-credits`, `list`.
- e2e (Playwright headless, navigateurs `tools/bin/ms-playwright`, ignoré si absents), paramétré `URL_MODE=path|subdomain` (sous-domaines via `*.localhost`) : créer une armée, améliorer un trooper, choisir une compétence, acheter un trooper, livrer un combat, la page de combat charge Ruffle et le SWF émet la fin de combat avec le même vainqueur que la base.
- `npm run dev` : serveur sur `http://localhost:8080/` en mode chemin, données dans `var/`, factions semées au premier démarrage.

- [ ] **Step 1:** Écrire e2e → FAIL. **Step 2:** implémenter CLI/scripts → PASS dans les deux modes. **Step 3:** `npm test`, `typecheck`, `oracle:diff` → verts. Commit `feat(server): admin CLI, e2e, local run` et push.

---

## Hors de ce plan

Étape 3 : missions (Extermination, Infiltration, Epic), raids, parrainage effectif (`/history` qui confirme les recrues), `/protect`. Étape 4 : `/history`, `/ranks`, `/choice`, `/endDay`, Docker + Cloudflare Tunnel, armée du frère (via `admin create-army`).
