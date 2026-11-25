# Événement du week-end tiré au sort et recharge des combats : plan d'implémentation

> **Pour les agents :** sous-compétence superpowers:executing-plans (exécution native, comme la PR #20). Les étapes
> sont des cases à cocher.

**But :** chaque week-end tire une formule parmi « ×3 + recharge », « recharge seule » et « ×3 seul ». Les jours de
recharge donnent +1 combat toutes les 2 h, avec une réserve de 3 au plus, affichée au QG en version F.

**Architecture :**
- Logique pure dans `@mt/game`, nouveau fichier `weekend.ts` :
  - tirage de la formule ;
  - heures de recharge ;
  - calcul de la réserve rejoué à partir des heures des combats.
- `rewardMultiplier` garde sa signature, mais consulte le tirage, donc ses appelants ne changent pas.
- Côté serveur, un seul point d'entrée, `allowanceOf()`, remplace `battleAllowance` partout où le quota décide.
- Le QG reçoit un état de réserve facultatif et l'affiche.

**Pile :** Node 24, TypeScript (type stripping), Hono, node:sqlite, node:test.

**Spécification :** `docs/superpowers/specs/2026-11-25-recharge-week-end-design.md`

## Contraintes globales

- `style.css` ne change pas, même d'un octet. Tout le CSS va dans `extras.css`, et `?v=` est incrémenté dans
  `views/layout.ts`.
- En dehors d'un jour de recharge, les pages restent identiques au pixel près à 1280 px (`tools/shots --compare`).
- Le moteur de combat ne change pas. Quota de base : 5 (+1 par Commandement, 7 au plus). Gains : 2 crédits pour une
  victoire, 1 pour une défaite.
- Le tirage se fait sur `fnv1a(samedi) % 3` avec 0 = ×3 + recharge, 1 = recharge seule, 2 = ×3 seul. Si
  `WEEKEND_MULTIPLIER` vaut 1, c'est `% 2` avec 0 = recharge, 1 = rien.
- Les recharges ont lieu à 02:00, 04:00, … 22:00, heure locale du jeu (`cfg.tzGame`). `RESERVE_MAX = 3`.
- Les combats prennent d'abord sur le quota de base, puis sur la réserve.
- Les résultats des combats de réserve ne s'affichent qu'à l'historique. La rangée du jour garde le quota de base.
- Les textes sont ceux de la spécification, au caractère près.
- Commits en français, avec les lignes d'attribution.

## Points à surveiller en relecture

1. **Changement d'heure** : le dimanche du passage à l'heure d'hiver a 25 h. Les recharges suivent l'heure locale
   affichée : 02:00 tombe une seule fois et il y a toujours 11 recharges. Testé en tâche 1.
2. **Combats d'avant un `reset-day`** : ils ne consomment ni la base ni la réserve. Le rejeu ne part que des combats
   comptés. Testé en tâche 1, avec la liste filtrée côté serveur en tâche 2.
3. **Deux onglets ouverts** : `fight` recalcule le quota dans la transaction, à l'heure de la requête. On ne peut pas
   dépasser la réserve, même avec deux clics simultanés. Testé en tâche 2.
4. **Un ancien combat rejoué le dimanche à 10 h** : `endUrl` n'appelle `dayOver` que pour le combat qu'on vient de
   jouer (`fresh`), à l'heure de la requête. Pas de nouveau cas.
5. **Le minuteur arrive à zéro, page ouverte** : la page se recharge et montre « GO ! ». Pas de boucle de
   rechargement si l'horloge du navigateur avance : le script attend `data-to` du serveur plus 1 s, puis ne recharge
   qu'une fois.

---

### Tâche 1 : tirage et réserve, logique pure

**Fichiers :**
- Créer : `packages/game/src/weekend.ts`
- Modifier : `packages/game/src/day.ts` (export `atLocal`), `packages/game/src/economy.ts` (`rewardMultiplier`),
  `packages/game/src/index.ts`
- Test : `packages/game/test/weekend.test.ts`

**Interfaces produites :**
- `atLocal(day: string, hour: number, tz: string): number`
  - Rend l'instant (en ms) de `day` à `hour:00` heure locale.
  - Corrige le décalage horaire comme `nextResetAt`.
- `type WeekendEvent = { x3: boolean; regen: boolean }`
- `weekendEvent(day: string, multiplier: number): WeekendEvent`
  - Un jour de semaine donne `{ x3: false, regen: false }`.
  - Le dimanche utilise la date de la veille (`prevDay`).
- `RESERVE_MAX = 3`, `RECHARGE_EVERY_H = 2`
- `rechargeTimes(day: string, tz: string): number[]`
  - Donne 11 instants, aux heures locales 2, 4, … 22.
- `type ReserveState = { allowance: number; baseLeft: number; reserve: number; nextAt: number | null; prevAt: number }`
  - `prevAt` est la dernière recharge passée, ou minuit le cas échéant : c'est le début de la barre de progression.
  - `nextAt` est `null` quand aucune recharge n'est à venir aujourd'hui, ou quand la réserve est pleine.
- `reserveState(p: { base: number; battles: readonly number[]; ticks: readonly number[]; now: number; midnight: number }): ReserveState`
  - `battles` contient les `created_at` des combats **comptés** du jour, du plus ancien au plus récent.
  - Avec `ticks` vide (pas de recharge), on obtient `allowance = base`, `reserve = 0` et `nextAt = null`.
  - Algorithme : fusionner les recharges (seulement celles ≤ `now`) et les combats par ordre chronologique. À égalité,
    la recharge passe d'abord.
    - Recharge : `reserve = min(RESERVE_MAX, reserve + 1)`.
    - Combat : si `baseLeft > 0`, `baseLeft--` ; sinon `reserve--` (plancher 0, par sécurité).
    - Résultat : `allowance = battles.length + baseLeft + reserve`.
- `rewardMultiplier(day, weekend)` : rend `weekend` si `weekendEvent(day, weekend).x3`, sinon 1.

Étapes :

- [ ] Tests (`weekend.test.ts`) :
  - `weekendEvent` :
    - `2026-11-28` et `2026-11-29` donnent `{x3:false, regen:true}` ;
    - `2026-12-12` donne `{x3:true, regen:false}` ;
    - `2026-12-26` et `2026-12-27` donnent `{x3:true, regen:true}` ;
    - `2026-11-25` (mercredi) donne tout à false ;
    - avec multiplicateur 1 : `regen` vaut `fnv1a(samedi) % 2 === 0` et `x3` vaut toujours false ;
    - sur 600 samedis consécutifs, chaque formule tombe entre 150 et 250 fois.
  - `rechargeTimes("2026-11-28", "Europe/Paris")` : 11 valeurs, la première vaut `Date.parse("2026-11-28T01:00:00Z")` et
    la dernière `Date.parse("2026-11-28T21:00:00Z")`.
  - Changement d'heure : `rechargeTimes("2026-10-25", "Europe/Paris")[0] === Date.parse("2026-10-25T01:00:00Z")`
    (02:00 en heure d'hiver), avec 11 valeurs.
  - `reserveState` :
    - sans combat, à 10:30 (5 recharges passées : 2, 4, 6, 8 et 10 h), donne `reserve 3` (plafond), `baseLeft 5` et `allowance 8` ;
    - 5 combats à 01:00 puis 1 combat à 05:00, vus à 05:30, donnent `baseLeft 0` et `reserve 1` (recharges à 2 et 4, moins 1), avec
      `allowance 7` ;
    - plafond : les 3 recharges du matin non dépensées, puis une 4ᵉ à 08:00, donnent `reserve` 3 et non 4 ;
    - `nextAt` donne la prochaine recharge, `prevAt` la précédente, et `prevAt` vaut `midnight` avant 02:00 ;
    - à 22:30, `nextAt` vaut `null` ; réserve pleine, `nextAt` vaut `null` ;
    - `ticks: []` donne `allowance === base`.
  - `rewardMultiplier("2026-11-28", 3) === 1`, `rewardMultiplier("2026-12-12", 3) === 3` et
    `rewardMultiplier("2026-11-25", 3) === 1`.
- [ ] `node --test packages/game/test/weekend.test.ts` : échec attendu.
- [ ] Implémenter, puis réexporter les éléments ci-dessus depuis `index.ts`.
- [ ] Relancer `node --test "packages/*/test/**/*.test.ts"` : tout doit passer. Sinon, adapter les anciens tests
  d'économie qui supposaient le ×3 à chaque week-end.
- [ ] Commit : `feat(week-end): tirage de la formule et calcul de la réserve`.

### Tâche 2 : quota dépendant de l'heure côté serveur

**Fichiers :**
- Créer : `apps/server/src/allowance.ts`
- Modifier :
  - `apps/server/src/repo.ts` : `countedBattleTimes`, signature de `dayOver` ;
  - `apps/server/src/routes/battle.ts`, `opp.ts`, `endday.ts`, `mission.ts`, `raid.ts` ;
  - `apps/server/src/admin/cli.ts` ;
  - `apps/server/src/main.ts` (variable d'environnement `NOW`, réservée aux captures).
- Tests :
  - nouveau `apps/server/test/reserve.test.ts` ;
  - tests du week-end existants dans `battle.test.ts`, `mission.test.ts`, `raid.test.ts` et `layout.test.ts`.

**Interfaces :**
- Consomme les éléments de la tâche 1.
- `countedBattleTimes(db, armyId, day): number[]` : les `created_at` des combats comptés (ceux d'après
  `dayResets.battles`), triés par id.
- `allowanceOf(db, cfg, armyId, troopers: readonly BattleTrooperInput[], now: number): ReserveState & { regen: boolean; base: number }`
  - Rejoue la réserve avec `base = battleAllowance(troopers)`.
  - `ticks = weekendEvent(day, cfg.weekendMultiplier).regen ? rechargeTimes(day, cfg.tzGame) : []`.
  - `midnight` = minuit local du jour.
- `dayOver(db, armyId, day, a: { allowance: number; rechargeAhead: boolean }): boolean`
  - Rend faux si `battlesCounted < a.allowance` ou si `a.rechargeAhead`. La suite ne change pas.
  - `rechargeAhead = regen && il reste une recharge > now aujourd'hui`. C'est vrai même avec une réserve pleine, parce
    que la journée n'est pas finie avant 22:00.
- `main.ts` :
  - si `process.env.NOW` est défini, `deps.now = () => Date.parse(NOW) + (Date.now() - démarrage)` ;
  - affiche un avertissement au démarrage ;
  - seulement pour les captures locales, documenté dans `tools/shots/README.md`.

Étapes :

- [ ] Déplacer les tests ×3 existants (2026-11-28, devenu « recharge seule ») au **2026-12-12** (×3 seul). Ajouter un
  test « recharge seule : gains ×1 le 2026-11-28 » pour un combat, une mission et le raid. Fichiers : `battle.test.ts`,
  `mission.test.ts`, `raid.test.ts`, `layout.test.ts`.
- [ ] `reserve.test.ts` : chemin `path`, armée Warp et adversaire comme dans `battle.test.ts`.
  - Le samedi 2026-11-28 à 10:00 heure locale, l'armée a 5 de base et 3 en réserve. Les 8 combats sont acceptés, le
    9ᵉ renvoie au QG (`limit`).
  - Après 12:00 heure locale (avancer `clock.t`), un combat de plus est accepté.
  - `dayOver` vaut false à 21:00 heure locale, même quota et réserve vides. Il vaut true à 22:30 une fois tout joué.
  - Après un `reset-day --what battles` : les combats d'avant ne consomment rien, et la réserve rejouée reste correcte.
  - Mercredi 2026-11-25 : il n'y a pas de réserve et le 6ᵉ combat est refusé, comme aujourd'hui.
  - Deux attaques concurrentes au dernier combat de réserve : une seule est enregistrée.
- [ ] Lancer les tests : échec attendu.
- [ ] Implémenter `allowance.ts` et `countedBattleTimes`, puis brancher `fight` (callback `allowance`), la redirection
  de /b/opp, `dayOver` (ses appelants passent `allowanceOf`), `/endDay` et `admin show`. `admin show` affiche le quota
  de l'instant et la réserve.
- [ ] `main.ts` : `NOW`.
- [ ] Suite complète et `npx tsc -b` : seuls les 3 échecs Windows connus sont tolérés. Vérifier à la main les contrôles
  de `dry.test`, en particulier un seul `json_array_length(`.
- [ ] Commit : `feat(week-end): combats qui se rechargent toutes les 2 h les week-ends tirés`.

### Tâche 3 : bandeau et boîte Bataille, version F

**Fichiers :**
- Créer :
  - `apps/server/scripts/gen-box2bottom-reserve.mjs` (algorithme de `var/shots/mkasset.mjs` : 32 lignes insérées après
    la ligne 26, en miroir puis dans l'ordre) ;
  - `apps/server/public/img/box2bottom-reserve.png` (généré, 322×86) ;
  - `apps/server/public/js/reserve.js`.
- Modifier :
  - `apps/server/src/views/event.ts` ;
  - `apps/server/src/views/hq.ts` : `HqView.reserve`, `battleBox` ;
  - `apps/server/src/routes/hq.ts` ;
  - `apps/server/public/css/extras.css` ;
  - `apps/server/src/views/layout.ts` (`?v=`).
- Tests : `apps/server/test/hq.test.ts`, `apps/server/test/layout.test.ts` (bandeau).

**Interfaces :**
- `HqView.reserve?: { ready: number; nextAt: number | null; prevAt: number; ahead: number; baseLeft: number }`
  - Absent les jours sans recharge.
  - `ahead` = nombre de recharges encore à venir aujourd'hui.
- `HqView.battles` ne contient plus que les `base` premiers combats comptés, et `battleTotal = base`.
- Rangée de réserve, dans `.action` qui reçoit la classe `reserve` :
  - `<div class="reserve-row">` puis, dans l'ordre :
    - `ready` cases `.b.bgo2`, qui sont des liens vers `/b/opp` ;
    - 1 case de progression `.b.bgo2.recharging` si `nextAt` existe, avec
      `data-from=prevAt data-to=nextAt style="--p:<0..100>"` ;
    - des cases `.b.bgo2.empty` jusqu'à 3.
  - La case en recharge contient le chrono existant (`chrono(seconds)` de `hq.ts`).

Étapes :

- [ ] Tests `hq.test.ts` (horloge `2026-11-28T09:30:00Z` = 10:30 à Paris, et `2026-12-12`) :
  - Samedi, 0 combat : `class="reserve-row"` est présent, avec 3 liens `bgo2` de réserve (réserve 3/3, plafond).
    Ligne d'info : `Il te reste 5 batailles aujourd'hui !`.
  - 5 combats à 09:00, puis 1 combat de réserve :
    - 2 `bgo2` prêts et 1 `recharging` (`data-to` = 12:00 locale) ;
    - la rangée du jour compte exactement 5 cases `bwin`/`bdefeat` ;
    - texte : `Réserve : 2 batailles sur 3 !`.
  - Réserve vide avec une recharge à venir : texte `Prochaine bataille dans` puis le chrono.
  - 22:30 avec 1 en réserve : 1 `bgo2`, 2 `empty`, aucun `recharging`.
  - 2026-12-12 (×3 seul) et un mercredi : aucun `reserve-row`. Le HTML de la boîte est identique à celui d'aujourd'hui.
- [ ] Tests de bandeau (`layout.test.ts`), textes exacts de la spécification :
  - le 2026-12-26, `×3` puis l'icône pièce puis `et combats qui se rechargent toutes les 2 h` ;
  - le 2026-11-28, `combats qui se rechargent toutes les 2 h`, sans `×3` ;
  - le 2026-12-12, le texte actuel ;
  - info-bulle de recharge :
    `+1 bataille toutes les 2 h, jusqu'à 3 en réserve, jusqu'à dimanche minuit.`
- [ ] Lancer les tests : échec attendu.
- [ ] Implémenter la vue, la route, le bandeau, le script de génération et l'image. Lancer le script et commiter
  l'image.
- [ ] CSS (`extras.css`), repris de la maquette F (`var/shots/regen.js`, variante `F`) :
  - `.box2 .action.reserve` : hauteur 83 px, et la `.box2bottom` parente prend
    `url(/img/box2bottom-reserve.png)` (sélecteur `.box2bottom:has(.action.reserve)` ou classe posée sur la boîte par
    la vue ; **la classe est préférée**, `has` étant moins sûr).
  - `.reserve-row` : `margin-top` 5 px. Pour 5 cases du jour, les cases font 101 px de large, avec une marge gauche de
    1 px pour la première et 3 px pour les autres.
  - Avec 6 ou 7 cases du jour (`bcount6`, `bcount7`), les largeurs sont calculées pour couvrir exactement la rangée du
    jour.
  - Case en recharge : la case est désaturée (`saturate(.12) brightness(.97)`) sous une copie colorée découpée par
    `clip-path: inset(0 calc(100% - var(--p)*1%) 0 0)`, l'image du tank est masquée et le chrono centré.
  - `.empty` : désaturée et sans contenu.
- [ ] `reserve.js` :
  - toutes les 10 s, recalcule `--p` à partir de `data-from` et `data-to` ;
  - à `Date.now() >= data-to + 1000`, appelle `location.reload()` une fois (garde-fou en `sessionStorage` pour la même
    valeur de `data-to`) ;
  - le script est inclus seulement quand la rangée existe.
- [ ] `?v=` d'`extras.css` incrémenté. Suite complète et `tsc` à jour.
- [ ] Commit : `feat(week-end): bandeau de la formule et réserve au QG (version F)`.

### Tâche 4 : vérification visuelle et relecture

- [ ] Lancer le serveur local avec `NOW=2026-11-28T09:30:00Z` sur une copie de la base de démo (`var/mob`). Jouer les
  combats pour produire chaque état : 3/3, 2/3 avec recharge, 0 avec chrono, après 22:00 (`NOW=…T21:30:00Z`), puis une
  armée avec Commandement (6 ou 7 cases) si la démo en a une. Sinon, monter un trooper avec `admin level-up` sur la
  copie.
- [ ] Captures à 320, 390, 768 et 1280 px. Mesures CDP :
  - la ligne d'info dépasse le bas de la boîte de 4 px, comme l'original ;
  - les bords de la rangée de réserve sont égaux à ceux de la rangée du jour (5, 6 et 7 cases) ;
  - aucun débordement.
- [ ] `--compare` sans `NOW` (mercredi) contre `origin/main` propre : aucune différence.
- [ ] Relecture indépendante de la branche par un sous-agent opus. Corriger ce qu'elle trouve.
- [ ] Montrer à Killian les captures de chaque état et attendre son OK avant tout push.
