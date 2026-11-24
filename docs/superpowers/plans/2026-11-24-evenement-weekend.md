# Événement « week-end ×3 » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le samedi et le dimanche (jour de jeu), les crédits gagnés en combat, mission et raid sont multipliés par `WEEKEND_MULTIPLIER` (3 par défaut), avec une bannière sur toutes les pages.

**Architecture:** Une règle pure `rewardMultiplier(day, weekend)` dans `@mt/game`, lue à partir de la clé de jour déjà stockée avec chaque combat ; les routes battle/mission/raid multiplient leurs récompenses (versement, message de fin, `?money=`). La bannière est rendue par `layout()` à partir de l'heure de la requête, transmise par un `AsyncLocalStorage` posé dans le middleware de `app.ts` (pas de plomberie dans chaque vue).

**Tech Stack:** Node 24 (TS natif), Hono, node:sqlite, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-24-evenement-weekend-design.md`

## Global Constraints

- `style.css` ne change pas (test octet pour octet) : tout style va dans `apps/server/public/css/extras.css` (créée par la branche `competences-non-acquises`, sur laquelle cette branche est empilée) ; incrémenter son `?v=` dans `layout.ts` quand on la modifie.
- Moteur de combat et entrées de combat inchangés : seul le montant crédité change.
- Jour de jeu = `dayKey(date, cfg.tzGame)` ; samedi/dimanche se lisent sur la clé « YYYY-MM-DD » (pas sur l'heure locale du serveur).
- Multiplicateur : entier, 1 ≤ N ≤ 10, défaut 3 ; 1 = désactivé (aucun ×, aucune bannière).
- Textes en français, ton du jeu. Bannière : « Événement du week-end : ×N crédits dans tous les combats ! » ; infobulle (titre « Week-end ×N ») : « Batailles, missions et raids rapportent N fois plus de crédits jusqu'à dimanche minuit. »
- Les tests existants tournent à l'horloge `2026-11-23T10:00:00Z` (un lundi) : ils ne doivent pas changer.
- Aucun push sans captures validées par Killian (Task 5).

## Review Focus

- Combat lancé samedi 23:59 heure de Paris (= 22:59Z) : ×3 ; dimanche 23:30 Paris → lundi 00:30 Paris : ×1. Fuseau ≠ UTC autour de minuit.
- Replay d'un combat du samedi revu le lundi : le message « just fought » n'apparaît qu'une fois (`fresh`) — le montant recalculé à l'affichage vient de `b.day`, donc reste ×3 ; pas de bannière le lundi.
- Mission perdue un samedi : 0 × 3 = 0, `endUrl` reste `/hq` (pas de `?money=0`).
- `WEEKEND_MULTIPLIER` invalide (`0`, `-1`, `2.5`, `abc`, `11`, vide) : refus au démarrage avec un message clair, comme `TZ_GAME`.
- Page sans armée (accueil `/`) un samedi : bannière présente aussi.

---

### Task 1: Règle `rewardMultiplier`

**Files:**
- Modify: `packages/game/src/economy.ts` (ajout), `packages/game/src/index.ts` (export)
- Test: `packages/game/test/game.test.ts`

**Interfaces:**
- Produces: `rewardMultiplier(day: string, weekend: number): number` — `weekend` si `day` (« YYYY-MM-DD ») est un samedi ou un dimanche, sinon 1. `isWeekend(day: string): boolean` exporté aussi.

- [ ] **Step 1: Write the failing test** `rewardMultiplier: weekend days only`

```ts
assert.equal(rewardMultiplier("2026-11-28", 3), 3); // samedi
assert.equal(rewardMultiplier("2026-11-29", 3), 3); // dimanche
assert.equal(rewardMultiplier("2026-11-27", 3), 1); // vendredi
assert.equal(rewardMultiplier("2026-11-30", 3), 1); // lundi
assert.equal(rewardMultiplier("2026-11-28", 1), 1);
assert.equal(isWeekend("2027-01-02"), true); // samedi, autre année
```

- [ ] **Step 2: Run** `node --test packages/game/test/game.test.ts` — Expected: FAIL (`rewardMultiplier` is not exported).
- [ ] **Step 3: Implement** in `economy.ts` with `new Date(Date.UTC(y, m - 1, d)).getUTCDay()` (0 ou 6 = week-end) ; export from `index.ts`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(game): rewardMultiplier du week-end`

### Task 2: Configuration `WEEKEND_MULTIPLIER`

**Files:**
- Modify: `apps/server/src/config.ts` (champ `weekendMultiplier: number` dans `Config`, lu dans `loadConfig`), `deploy/README.md` (ligne du tableau des variables, après `TZ_GAME`), `apps/server/README.md` (section des contrôles au démarrage, si les variables y sont listées)
- Test: `apps/server/test/urls.test.ts` (test « strict parsing »)

**Interfaces:**
- Produces: `cfg.weekendMultiplier: number`.

- [ ] **Step 1: Write the failing test** (dans le test « strict parsing » ou un test voisin)

```ts
assert.equal(loadConfig({}).weekendMultiplier, 3);
assert.equal(loadConfig({ WEEKEND_MULTIPLIER: "1" }).weekendMultiplier, 1);
assert.equal(loadConfig({ WEEKEND_MULTIPLIER: "10" }).weekendMultiplier, 10);
for (const v of ["0", "-1", "2.5", "abc", "11", ""]) assert.throws(() => loadConfig({ WEEKEND_MULTIPLIER: v }), /WEEKEND_MULTIPLIER/, v);
```

- [ ] **Step 2: Run** `node --test apps/server/test/urls.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** : `/^[0-9]+$/` puis 1..10, sinon `throw new Error(\`invalid WEEKEND_MULTIPLIER: ${JSON.stringify(v)} (an integer from 1 to 10; 1 disables the weekend event)\`)`. Doc : `| \`WEEKEND_MULTIPLIER\` | \`3\` | gains de combat (batailles, missions, raids) multipliés le samedi et le dimanche du jour de jeu ; \`1\` désactive l'événement |`.
- [ ] **Step 4: Run** — Expected: PASS ; `npx tsc -b` sans erreur.
- [ ] **Step 5: Commit** `feat(config): WEEKEND_MULTIPLIER`

### Task 3: Gains multipliés (batailles, missions, raids)

**Files:**
- Modify: `apps/server/src/routes/battle.ts` (`resolve` l.68-81 reçoit `day`, `show` l.139-170), `apps/server/src/routes/mission.ts` (resolve l.~111, vue l.~155-176), `apps/server/src/routes/raid.ts` (`WON_FIRST` l.26 devient une fonction du montant, resolve l.55, vue l.~88-100)
- Test: `apps/server/test/battle.test.ts`, `mission.test.ts`, `raid.test.ts`

**Interfaces:**
- Consumes: `rewardMultiplier(day, cfg.weekendMultiplier)` (Task 1, Task 2).
- Produces: dans chaque route, `reward = base × rewardMultiplier(day, cfg.weekendMultiplier)` où `day` est celui du combat (`day` à la création, `b.day` à l'affichage) ; le même `reward` sert au versement, à `endMsg` et à `?money=`.

- [ ] **Step 1: Write the failing tests** (à chaque fois en dupliquant le test « just fought » existant du fichier, horloge mise à `Date.parse("2026-11-28T10:00:00Z")` — samedi — avant le combat) :
  - battle : `battle on a weekend day pays ×3`: crédits `before + 6` (victoire) ou `+ 3` (défaite) selon `winner` ; `endMsg` « … Ton armée gagne +6 [T] » / « +3 » ; `document.location` vers `/hq?money=6` / `=3`.
  - battle : `WEEKEND_MULTIPLIER=1 pays ×1 on Saturday`: `setup(mode, { WEEKEND_MULTIPLIER: "1" })`, gains `+2`/`+1`.
  - battle : `Saturday 23:30 Paris counts as Saturday`: horloge `Date.parse("2026-11-28T22:30:00Z")` → ×3 ; `Date.parse("2026-11-29T23:30:00Z")` (lundi 00:30 Paris) → ×1.
  - mission : victoire un samedi : `endMsg` « Tu as remporté la mission du jour ! Ton armée gagne +12 [T] », `/hq?money=12`, crédits `+12` ; défaite : crédits inchangés, `endUrl` `/hq`.
  - raid : victoire de phase un samedi : `endMsg` « Félicitations, tu as remporté le raid ! Ton armée gagne +12 [T] et tu peut tenter le raid suivant. », `/hq?money=12`, crédits `+12`.
- [ ] **Step 2: Run** `node --test apps/server/test/battle.test.ts apps/server/test/mission.test.ts apps/server/test/raid.test.ts` — Expected: the new tests FAIL, the old ones PASS.
- [ ] **Step 3: Implement** : `resolve(army, foe, day)` dans battle.ts (l'appelant `decide` a `day`) ; `missionReward(won) * mult` et `RAID_REWARD * mult` ; `wonFirst(reward: number): string` remplace la constante `WON_FIRST` (même texte, montant variable).
- [ ] **Step 4: Run** the same command — Expected: PASS (anciens et nouveaux).
- [ ] **Step 5: Commit** `feat(event): gains ×N le week-end (batailles, missions, raids)`

### Task 4: Bannière d'événement sur toutes les pages

**Files:**
- Create: `apps/server/src/requestClock.ts`, `apps/server/src/views/event.ts`
- Modify: `apps/server/src/app.ts` (middleware l.62-66 : exécuter `next()` dans `runWithNow(now, …)`), `apps/server/src/views/layout.ts` (rendu de la bannière en tête de `#content`, `extras.css?v=` incrémenté), `apps/server/public/css/extras.css`
- Test: `apps/server/test/layout.test.ts`

**Interfaces:**
- Produces: `runWithNow<T>(now: () => number, fn: () => T): T` et `requestNow(): number` (retombe sur `Date.now()` hors requête) dans `requestClock.ts` (`AsyncLocalStorage`) ; `eventBanner(cfg: Config, now: number): Html` dans `views/event.ts` — vide si `cfg.weekendMultiplier === 1` ou si `dayKey(new Date(now), cfg.tzGame)` n'est pas un week-end ; sinon `<div class="event-banner">` avec l'icône `/img/info.png` portant l'infobulle (`tip()` de `layout.ts`) et le texte de la contrainte globale.

- [ ] **Step 1: Write the failing tests** (via `setup()` de `helpers.ts`, en pilotant `env.clock.t`) :
  - `event banner on Saturday, on the home page and on an army HQ`: horloge samedi 10:00Z → `GET /` contient `class="event-banner"` et `×3 crédits dans tous les combats` ; même chose sur le QG d'une armée créée dans le test.
  - `no banner on Monday`: horloge `2026-11-23T10:00:00Z` → absent.
  - `no banner when WEEKEND_MULTIPLIER=1`: samedi → absent.
  - `banner follows TZ_GAME`: `Date.parse("2026-11-27T23:30:00Z")` (samedi 00:30 à Paris) → présent.
- [ ] **Step 2: Run** `node --test apps/server/test/layout.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**. Style dans `extras.css` : barre sombre fine dans l'esprit trooperstest (fond brun foncé semi-opaque, texte crème, coins arrondis 3 px, icône info à gauche, largeur de la colonne de contenu) ; elle ne doit décaler ni l'argent, la puissance et le titre du QG (positionnés en absolu par `style.css`) ni le lecteur des pages de combat — vérifier visuellement en Task 5 et ajuster la position (par exemple en tête de `.ptopsite`) si besoin.
- [ ] **Step 4: Run** `node --test apps/server/test/layout.test.ts` et toute la suite `node --test "apps/server/test/**/*.test.ts"` — Expected: PASS, sauf les 3 tests déjà connus pour échouer sous Windows (`haxeTrim…`, `main.ts: /healthz…`, `one form body limit…`) ; `npx tsc -b` sans erreur.
- [ ] **Step 5: Commit** `feat(event): bannière du week-end`

### Task 5: Captures pour validation (pas de push)

- [ ] **Step 1:** Serveur local (`DATA_DIR=var PORT=18080`) avec l'horloge réelle impossible à piloter : lancer avec `TZ_GAME` choisi pour qu'il soit samedi ou dimanche dans ce fuseau au moment de la capture, ou, si ce n'est pas possible, injecter temporairement un `now` de test via un petit script local non commité qui appelle `createApp({ cfg, db, now })` — ne rien commiter de ce montage.
- [ ] **Step 2:** Captures (Brave sans interface, profil vierge) à 1280×800 : accueil, QG, fiche trooper, page de combat juste après une victoire (« +6 »), QG avec l'animation `+6`.
- [ ] **Step 3:** Les envoyer à Killian et attendre son accord explicite avant tout push.
