# Toutes les missions chaque jour : plan d'implémentation

> **Pour les agents :** sous-compétence superpowers:executing-plans, exécution native (comme les PR #20 et #21). Les
> étapes sont des cases à cocher.

**But :** une fois les missions débloquées, Exterminer et Infiltrer sont disponibles tous les jours, et Épique aussi à
partir de 10 recrues confirmées. Chaque mission a ses 3 essais. Le QG les affiche sur deux colonnes, dans les choix A
et D validés.

**Architecture :**
- Un état par mission et par jour : table `mission_day`, créée par la migration 011.
- `fightMission` et `decide` prennent le type.
- Une seule fonction dit quelles missions sont disponibles : `availableMissions`.
- Le QG rend une boîte par mission, avec la vue `missionBox` existante, enrichie des états « bloquée » et « Missions »
  (déblocage).

**Pile :** Node 24, TypeScript, Hono, node:sqlite, node:test.

**Spécification :** `docs/superpowers/specs/2026-11-25-missions-quotidiennes-design.md`

## Contraintes globales

- `style.css` reste identique octet pour octet. S'il faut du CSS, il va dans `extras.css`, avec son `?v=` incrémenté.
- Le moteur de combat ne change pas. Les adversaires des missions non plus (rats, cible d'infiltration, PNJ épiques).
- `MISSION_ATTEMPTS = 3` par mission. Gain de 4 par victoire, ×3 si la formule du week-end le prévoit
  (`rewardMultiplier`). Exterminer gagnée au plus une fois par jour.
- `/b/view/miss<n>` : `n` est compté sur toutes les missions du jour, sans changement.
- Textes exacts :
  - `Encore N recrues` (case `bblock`) ;
  - `La mission Épique s'ouvre à 10 recrues confirmées.` ;
  - titre `Missions` ;
  - `Débloque les missions : Exterminer et Infiltrer tous les jours !`.
- Commits en français, avec les lignes d'attribution.

## Points à surveiller en relecture

1. **URL de mission rejouée ou périmée.** Son `n` compte les essais **du type**. On la renvoie vers la rediffusion
   globale de l'essai qu'elle a créé : le k-ième combat de ce mode, numéroté parmi toutes les missions du jour. Testé
   en tâche 2.
2. **Épique jouée puis passage sous 10 recrues.** Les essais restent accessibles et `dayOver` les attend (droit acquis
   par une ligne epic du jour). Testé en tâche 1.
3. **Vue verrouillée d'une armée protégée.** Elle montre toujours 3 boîtes vides et ne dévoile ni le déblocage ni les
   recrues. Testé en tâche 3.
4. **La migration sur une base contenant des journées passées.** Elle recopie toutes les lignes, sans échec si une
   ligne n'a pas de `mission_type`. Testé en tâche 1, dans `db.test`.
5. **Le `reset-day mission` d'administration.** Il remet les 3 missions à zéro et repioche la cible d'Infiltrer et
   d'Épique. Testé en tâche 1.

---

### Tâche 1 : état par mission (migration, repo, dayOver, admin)

**Fichiers :**
- `apps/server/migrations/011_mission_day.sql` ;
- `apps/server/src/repo.ts` ;
- `apps/server/src/admin/cli.ts` ;
- tests : `db.test.ts`, `admin.test.ts`, `endday.test.ts`, nouveau `missions-daily.test.ts`.

**Interfaces :**
- La table SQL `mission_day(army_id INTEGER NOT NULL REFERENCES armies(id) ON DELETE CASCADE, day TEXT NOT NULL, type TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, reset INTEGER NOT NULL DEFAULT 0, won INTEGER NOT NULL DEFAULT 0, target TEXT, PRIMARY KEY(army_id, day, type))`.
  - La migration y recopie les lignes de `daily` dont `mission_type` n'est pas NULL. On garde `used`, `reset`, `won`
    et `target`.
- `missionDay(db, armyId, day, type: MissionType): { used; reset; won; target }`. La signature change : le paramètre
  `type` s'ajoute.
- `setMissionTarget(db, armyId, day, type, ref)`.
- `fightMission(db, { armyId, day, type, now, used, decide })`.
  - Il renvoie `locked` si les missions ne sont pas débloquées, ou si c'est l'Épique sans droit.
  - Sinon, mêmes règles qu'avant, sur la ligne du type.
- `epicAllowed(db, armyId, day): boolean`. Il vaut vrai si `confirmedRecruitCount >= EPIC_MIN_RECRUITS`, ou si une
  ligne epic du jour a `used > 0`.
- `availableMissions(db, army, day): MissionType[]`.
  - Avant déblocage : `[]`.
  - Sinon : `["exterminate", "infiltrate"]`, plus `"epic"` si `epicAllowed`.
- `dayOver` : chaque mission disponible doit être gagnée, ou avoir `used - reset >= MISSION_ATTEMPTS`.
- `resetDay(... mission)` : pour les 3 types, `reset = used`, `won = 0` et `target = NULL`.
- Les fonctions `freezeMissionType`, `missionOfDay` et `missionTypeOf` sont supprimées, ainsi que leurs tests.

Étapes :
- [ ] **Tests `missions-daily.test.ts`** (couche repo, base `openDb` comme `train.test`) :
  - Avant déblocage, `availableMissions` renvoie `[]`.
  - Après déblocage, il renvoie exterminate et infiltrate, plus epic à 10 recrues.
  - 3 essais par type : chaque type est indépendant, et une victoire ne ferme que son type.
  - Une Épique déjà jouée reste jouable sous 10 recrues.
  - Le `reset-day mission` remet les 3 à zéro.
  - `dayOver` vaut faux tant qu'une mission disponible reste à faire.
- [ ] **Tests de migration** (`db.test`) : une ligne de `daily` avec `missions_used 2`, `mission_type 'epic'` donne une
  ligne `mission_day` epic avec `used 2`.
- [ ] Adapter les tests de `admin.test` et `endday.test` qui écrivent dans `daily.mission_*` pour qu'ils écrivent dans
  `mission_day`.
- [ ] Vérifier qu'ils échouent (RED), implémenter, puis vérifier qu'ils passent (GREEN). Lancer `tsc`.
- [ ] Commit : `feat(missions): un état par mission et par jour`.

### Tâche 2 : route de mission par type

**Fichiers :**
- `apps/server/src/routes/mission.ts` ;
- `apps/server/src/repo.ts` : ajouter `missionBattleIndex(db, armyId, day, type, k): number | null`, qui donne le
  numéro global (`miss<n>`) du k-ième combat de ce type ;
- tests : `mission.test.ts`, `e2e.test.ts`.

**Interfaces :**
- `/b/mission?type=<t>;n=<used du type>;chk=`.
  - Un type absent ou inconnu renvoie vers `/hq`.
  - `decide(armyId, day, type)`.
  - Après un combat : `/b/view/miss<n global>`.
  - Si l'URL est périmée et a déjà servi : `/b/view/miss<missionBattleIndex(type, used + 1)>`.

Étapes :
- [ ] **Tests `mission.test.ts`.** Réécrire `prepare` et `daily`, qui passent sur `mission_day`, puis ajouter :
  - le même jour : Exterminer gagnée, puis Infiltrer jouée 3 fois, puis Épique à 10 recrues. On obtient 5 combats et
    les rediffusions `miss1` à `miss5` dans l'ordre, chacune du bon `mode`.
  - Une URL Infiltrer rejouée (`n=0` après un essai) redirige vers la rediffusion de cet essai, et non vers celle
    d'Exterminer.
  - Épique sous 10 recrues renvoie vers `/hq` sans combat.
  - Sans `type` : retour à `/hq`.
  - Les rats ne gagnent qu'un niveau au plus par jour.
- [ ] RED, implémenter, GREEN. Suite de tests complète et `tsc`.
- [ ] Commit : `feat(missions): Exterminer, Infiltrer et Epique jouables le même jour`.

### Tâche 3 : QG, une boîte par mission (choix A et D)

**Fichiers :**
- `apps/server/src/views/mission.ts` : `missionBox` prend `state: "play" | "unlock" | "epicLocked" | "hidden"` et
  `recruitsMissing` ;
- `apps/server/src/views/hq.ts` et `apps/server/src/routes/hq.ts` : `HqView.missions: MissionBoxView[]` ;
- test : `hq-missions.test.ts`.

**Interfaces :**
- Ordre : Bataille, puis les boîtes de mission, puis Raid. Les boîtes sont séparées par un retour à la ligne dans le
  HTML : il donne l'espace entre les blocs `inline-block`, mesuré sur les maquettes.
- Contenu selon l'état :
  - **Avant déblocage** : une seule boîte, titre `Missions`, décor `attic`, case « Débloquer pour 5 ». Ligne d'info :
    `Débloque les missions : Exterminer et Infiltrer tous les jours !`.
  - **Débloqué** : Exterminer, puis Infiltrer, puis Épique.
    - Épique en mode jouable, ou bloquée avec une case `bblock` (`<img src="/img/bblock.gif"/> Encore N recrues`) et
      la ligne d'info `La mission Épique s'ouvre à 10 recrues confirmées.`.
    - Liens : `/b/mission?type=<t>;n=<used>;chk=`.
    - Info-bulles : `miss_tip_<type>`.
  - **Verrouillé (visiteur)** : 3 boîtes vides (Exterminer, Infiltrer, Epique).

Étapes :
- [ ] **Tests** :
  - Avant déblocage : 1 boîte `Missions` avec `/b/unlock`, pas de boîte Infiltrer.
  - Débloqué avec 0 recrue :
    - 3 boîtes dans l'ordre ;
    - l'Épique a `bblock` et `Encore 10 recrues` ;
    - les liens portent leur `type`.
  - Avec 10 recrues : l'Épique a 3 « GO ! ».
  - Exterminer gagnée : 1 `bwin` dans sa boîte, et Infiltrer garde ses 3 « GO ! ».
  - Visiteur d'une armée protégée : 3 boîtes vides, sans `bblock` ni `Débloquer`.
- [ ] RED, implémenter, GREEN. Suite complète et `tsc`.
- [ ] Commit : `feat(missions): le QG affiche une boîte par mission`.

### Tâche 4 : vérification visuelle et relecture

- [ ] Serveur local sur une copie de la base de démo. Captures à 320, 390, 768 et 1280 px dans ces états :
  - avant déblocage ;
  - débloqué sous 10 recrues ;
  - 10 recrues ou plus ;
  - une mission gagnée ;
  - une mission perdue 3 fois ;
  - visiteur.
- [ ] Mesures CDP :
  - colonnes alignées (427 et 771 à 1280 px) ;
  - lignes d'info comme l'original ;
  - aucun débordement.
- [ ] `--compare` avec `origin/main` propre : toutes les pages sont identiques sauf `hq` et `hq-locked`.
- [ ] Relecture indépendante (sous-agent opus) et corrections.
- [ ] Captures montrées à Killian, et son OK obtenu, avant le push.
