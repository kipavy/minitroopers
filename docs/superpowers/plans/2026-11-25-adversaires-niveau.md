# Adversaires à son niveau et « Défie une faction » : plan d'implémentation

> **Pour les agents :** sous-compétence superpowers:executing-plans (exécution native, choisie par Killian :
> « exécute comme tu veux »). Les étapes sont des cases à cocher.

**But :** les combats du jour et l'entraînement tirent des armées à ±20 %, sans les factions. Un encadré
« Défie une faction : » (6 boutons de couleur) donne accès aux factions sur /b/opp et /b/train.

**Architecture :**
- `ArmyRef` gagne `isFaction?: boolean`. Les deux tirages ignorent ces candidats, et la fenêtre des vraies armées passe
  à 20 %.
- `armyPowers` renvoie `isFaction`.
- Un `factionCell()` dans `views/opp.ts`, rendu dans la cellule de `mateCell`, sert les deux pages.

**Pile :** Node 24, TypeScript (type stripping), Hono, node:sqlite, node:test.

**Spécification :** `docs/superpowers/specs/2026-11-25-adversaires-niveau-design.md`

## Contraintes globales

- `style.css` reste identique octet pour octet. Tout le CSS va dans `extras.css`, et `extras.css?v=` passe de 26 à 27
  dans `views/layout.ts`.
- Pages autres que /b/opp et /b/train : identiques au pixel près à 1280 px (`tools/shots --compare`).
- Le moteur de combat n'est pas modifié. Gains, quota et ×3 du week-end restent inchangés.
- Ordre des boutons = id de faction 0..5. Couleurs `#E87D5F #FFAA27 #FFDB7F #96B732 #9EADEF #A55DC6`.
- Texte d'un bouton = nom court (`f.name`). Attribut `title` = `armyTitle(f.name, f.part)`.
- Commits en français, avec les lignes d'attribution.

## Points à surveiller en relecture

1. Une faction posée en dur dans `daily.opponents` avant la mise à jour reste attaquable par son lien du jour. C'est
   voulu : la liste est figée jusqu'au lendemain.
2. Un joueur dont la puissance est inférieure à 10 garde le plancher `max(puissance, 10)` pour la largeur de la fenêtre : écart ≤ 2 autour de sa propre puissance.
   Les armées générées ne descendent pas sous 5.
3. Un bouton de faction sur /b/opp quand le quota est épuisé : la route existante renvoie au QG. Aucun traitement
   nouveau.
4. Sur mobile, l'encadré des factions suit immédiatement « Infiltre », dans la même cellule, en tête. Aucun débordement
   à 320 px (texte « Soleil rugissant » sur deux lignes).
5. Une faction absente de la base (instance sans `seedFactions`) reste attaquable par nom : `foeByName` passe par
   `faction:<host>`. Les boutons utilisent `friend=<host>`.

---

### Tâche 1 : tirages sans factions, à ±20 %

**Fichiers :**
- Modifier : `packages/game/src/opponents.ts`, `apps/server/src/repo.ts` (`armyPowers`),
  `apps/server/src/routes/opp.ts:41`, `apps/server/src/routes/train.ts:42`
- Tests : `packages/game/test/opponents.test.ts`, `apps/server/test/battle.test.ts` (test « seeded factions »)

**Interfaces :**
- `ArmyRef = { id: string; power: number; isFiller?: boolean; isFaction?: boolean }`
- `armyPowers(db): { id: number; power: number; isFaction: boolean }[]`
- `MAX_WINDOW = 0.2`

Étapes :

- [ ] Tests du tirage (`opponents.test.ts`) :
  - « widens … up to ±50 % » devient ±20 % : self 100 avec les candidats 102, 98, 118, 83, 121 et 70 ; vraies armées
    `a1`–`a4`, plus une armée générée.
  - « real armies far … » :
    - à 5 de puissance avec des factions marquées : seulement des armées générées ;
    - le cas `near` (6, 7, 8) donne `a1`, `a2` (écart ≤ 2 = 20 % de max(5, 10)) ;
    - `strong` (100 face à 6 factions à 114, `isFaction: true`) donne 5 armées générées.
  - Nouveau test « factions never drawn » : self 114, 6 candidats à 114 avec `isFaction: true` et 1 vrai à 114. Résultat :
    1 vraie armée et 4 armées générées. Même chose pour `pickTrainingOpponents`.
  - Entraînement :
    - « within half..double » devient « within ±20 % » : self 40 avec les candidats 31, 32, 40, 48, 49, ce qui donne
      `[32, 40, 48]` plus 2 armées générées ;
    - « tiny armies » : self 5, candidats 4, 5, 8, 12, ce qui donne `[4, 5]` (écart ≤ 2 autour de 5) ;
    - le test de graine reste avec des candidats dans la fenêtre : 30 armées entre 85 et 114.
- [ ] Lancer `node --test packages/game/test/opponents.test.ts` : échec attendu.
- [ ] Implémenter :
  - `MAX_WINDOW = 0.2` ;
  - les deux pools ignorent `c.isFaction` ;
  - l'entraînement filtre `Math.abs(c.power - self.power) <= 0.2 * base` ;
  - mettre à jour les commentaires de tête (fin de la mention « six faction armies … »).
- [ ] `armyPowers` ajoute `MAX(a.is_faction)` par jointure sur `armies`, et les deux routes passent `isFaction`.
- [ ] `battle.test.ts` « seeded factions » : le cas `strong` (105) ne voit plus de factions, et toutes ses places vont à
  des armées générées. Renommer : « factions are never drawn ».
- [ ] Lancer `node --test packages/game/test/opponents.test.ts apps/server/test/battle.test.ts apps/server/test/train.test.ts` :
  tout passe.
- [ ] Commit : `feat(adversaires): tirages sans factions, à ±20 % de sa puissance`.

### Tâche 2 : encadré « Défie une faction : »

**Fichiers :**
- Modifier :
  - `packages/game/src/factions.ts` (export `FACTION_COLOURS`, déplacé depuis `apps/server/src/og.ts`, qui l'importe) ;
  - `apps/server/src/views/opp.ts` ;
  - `apps/server/src/views/train.ts` ;
  - `apps/server/public/css/extras.css` ;
  - `apps/server/src/views/layout.ts` (`v=27`).
- Tests : `apps/server/test/battle.test.ts`, `apps/server/test/train.test.ts`

**Interfaces :**
- `factionBox(link: (host: string) => string, confirm: boolean): Html`. Elle produit
  `<div class="facbox"><h1>Défie une faction :</h1><div class="facs">` puis 6
  `<a class="fac" href="…" title="L'armée de …" style="background:#…">Nom</a>`, puis `</div></div>`.
  - Avec `confirm` : `onclick="return confirm('Confirmer cette action ?')"`.
- `mateCell` reçoit `extra?: Html`, inséré après `</div>` de `.backchoose`, dans le même `<td>`.
- Liens :
  - /b/opp : `armyUrl(cfg, host, "/b/battle?friend=<fhost>;n=<used>;chk=<key>")` ;
  - /b/train : `armyUrl(cfg, host, "/b/train/fight?friend=<fhost>;chk=<key>")`.

Étapes :

- [ ] Tests de pages :
  - /b/opp contient « Défie une faction : » et 6 liens `href="…/b/battle?friend=<host>;n=0;chk=<key>"`, dans l'ordre
    `sang-surs … groin-celeste`. Chaque lien a son `title` complet et sa couleur.
  - Suivre le lien `sang-surs` stocke un combat dont `opp` vaut `friend:sang-surs` et redirige vers `/b/fview/<id>`.
  - /b/train contient 6 liens `/b/train/fight?friend=<host>;chk=<key>` et aucun `confirm(`.
  - Suivre `fol-ecume` stocke un entraînement.
- [ ] Lancer les tests : échec attendu.
- [ ] Implémenter :
  - `factionBox` ;
  - le paramètre `extra` de `mateCell` ;
  - l'appel dans `oppPage` et `trainPage`.
- [ ] CSS dans `extras.css`, hors media query (ordinateur et mobile) : `table.choose .mate .facbox`, fidèle à la
  maquette C (`var/shots/fac.js`, classe `.mk-c`). Points de style :
  - largeur 283 px ;
  - fond `#e2c066`, bord `1px solid #86623e`, rayon 5 px, `margin-top` 12 px ;
  - grille de 3 colonnes, écart 5 px ;
  - boutons de 34 px, avec reflet haut et ombre basse, en petites capitales 0.8em.
  - En mobile : `width: auto` si la règle existante de `.backchoose` l'exige. Vérifier à 320 px.
- [ ] `layout.ts` : `extras.css?v=27`. Ajuster `layout.test` si la version y figure.
- [ ] Lancer la suite complète et `npx tsc -b`. Seuls les 3 échecs Windows connus sont acceptés.
- [ ] Commit : `feat(adversaires): encadré « Défie une faction » sur Bataille et Entraînement`.

### Tâche 3 : vérification visuelle

- [ ] Redémarrer le serveur local, puis lancer
  `node var/shots/shots.mjs --out var/shots/after --widths 320,390,768,1280`. Aucun débordement attendu.
- [ ] Référence : capturer sur un `origin/main` détaché propre avec `--freeze`, puis faire de même sur la branche, puis
  lancer `--compare`. Seules `opp`, `opp-notice` et `train` diffèrent.
- [ ] Relecture indépendante de la branche par un sous-agent opus. Corriger ce qu'elle trouve.
- [ ] Montrer les captures 390 et 1280 de /b/opp et /b/train à Killian et attendre son OK avant tout push.
