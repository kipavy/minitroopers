# MiniTroopers remake — design

Date : 2026-11-22 · Statut : brouillon, à valider par Killian

## Intention

Killian veut faire tourner sa propre instance privée de MiniTroopers (Motion-Twin, 2011),
sans attendre qu'Eternaltwin publie le code du serveur de test (`*.trooperstest.gued.es`,
code non public). Le dépôt GitLab public `eternaltwin/minitroopers/minitroopers` (MIT) est
inachevé : mission Epic absente, pas d'historique, de protection d'armée ni de classement
global, et le moteur de combat tourne encore dans le SWF original via Ruffle.

Critère de réussite : quelqu'un qui a joué à l'original ne voit **aucune différence de
gameplay** (mêmes combats pour une même graine, mêmes règles, mêmes pages, même économie).

## Objectifs

1. **Moteur de combat en TypeScript pur, bit-exact** avec le SWF original. On le prouve par
   des tests différentiels, on ne se contente pas de le supposer.
2. **Toutes les fonctionnalités joueur de l'original** (checklist en annexe A) : création
   d'armée, recrutement, montée de niveau avec choix de compétences, réglages du trooper
   (préférences de cible, de rechargement, de déplacement, objets), combats quotidiens,
   missions Extermination / Infiltration / Epic, raids, parrainage, historique, classements,
   protection d'armée, fiche trooper.
3. **Apparence de l'original** : pages HTML/CSS reprises de l'original (archives,
   `minitroopers-extra/site-elements`, CSS du serveur de test comme référence visuelle).
   Combats rejoués dans le navigateur par le SWF original sous Ruffle.
4. **Serveur léger et rapide**, un seul processus, déployable dans Docker sur le homelab.

## Non-objectifs

- Hébergement public ou montée en charge (instance privée pour un petit groupe).
- Monétisation (tokens/Twinoid) : les fonctions payantes de l'original deviennent gratuites
  ou désactivées (voir annexe A).
- Connexion Twinoid/Eternaltwin OAuth (comptes locaux suffisent, voir décisions).
- Réécrire le rendu des combats (PixiJS, etc.) : hors périmètre, peut-être plus tard.

## Anti-objectifs (échec même si « ça marche »)

- Le moteur TS diverge du SWF sur un seul combat du corpus de test.
- Le serveur de production dépend de Flash/Ruffle.
- Des fichiers Motion-Twin (SWF, images, sons) se retrouvent dans un dépôt public.
- Une règle de jeu inventée là où l'original est connu (si une règle est inconnue, on la
  marque `UNVERIFIED` dans le code et dans l'annexe, on ne la devine pas en silence).

## Contraintes

- Dépôt GitHub **privé** `kipavy/minitroopers` (il peut donc contenir les assets Motion-Twin).
- Machine de dev : Windows 11 ARM64, Node 24.12 installé, Bun absent.
- Code réutilisé du dépôt GitLab sous MIT : attribution conservée (LICENSE + NOTICE).
- Ruffle (`ruffle_desktop`) sert **uniquement** au banc de test différentiel (dev/CI).

## Approches considérées (moteur de combat)

1. **Repartir du travail GitLab + banc différentiel contre le SWF** — retenue.
   Attention : `flash-port/` n'est **pas** un portage exécutable. C'est la sortie brute du
   décompilateur JPEXS (AS3 collé dans des `.ts`, « Auto-converted — do not edit », noms
   `_obf_*` partiellement renommés via `identifier-map.json`). Il sert de texte source lisible
   et de début de désobfuscation ; le portage en vrai TypeScript reste à écrire, module par
   module, et chaque module est validé par le banc jusqu'à zéro écart.
2. Re-porter tout depuis la décompilation JPEXS : même banc à la fin, beaucoup plus de travail,
   aucun gain.
3. Garder leur portage sans vérification : rapide mais fidélité inconnue. Rejetée.

Choix de Killian : approche 1, dépôt privé, moteur TS.

## Conception

### Organisation (monorepo npm workspaces)

```
packages/engine   moteur de combat déterministe, TS pur, zéro dépendance
                  entrée : BattleInput (graine, fond, armées, troopers + préférences)
                  sortie : vainqueur, cimetière, journal d'événements ordonné
packages/game     règles hors combat : génération des troopers depuis la graine,
                  arbre de compétences et tirage des choix, armes, coûts (recrutement,
                  amélioration, missions), génération d'adversaires/rats/raids, puissance
apps/server       Hono sur Node 24, HTML rendu côté serveur, SQLite
tools/oracle      banc différentiel : génère des BattleInput aléatoires, les passe dans
                  le SWF (ruffle_desktop) et dans packages/engine, compare
assets/           SWF, images, CSS de l'original (dépôt privé)
```

### Moteur et banc différentiel (le cœur du projet)

- Point de départ : décompilation JPEXS de `client_fr.swf` (original Motion-Twin), avec
  `flash-port/` et `identifier-map.json` de GitLab comme aide à la lecture.
- **Oracle = `client_fr.swf` original**, instrumenté par nous (traces ajoutées en P-code
  JPEXS, sans toucher à la logique). `client_fr_edit.swf` d'Eternaltwin n'est pas la
  référence : on diffe sa logique avec l'original pour savoir ce qu'ils ont modifié, mais on
  ne s'aligne pas dessus. La trace couvre chaque événement du combat (tick, acteur, action,
  cible, dégâts, morts, tirages du PRNG), dans un format que le moteur TS produit à l'identique.
- **Ruffle fait foi.** Pas de Flash Player Adobe disponible proprement ; Ruffle exécute
  l'AVM2 de façon déterministe et c'est lui qui rejoue les combats dans le navigateur, donc
  s'aligner sur lui garantit l'absence de désynchronisation. Si un écart est attribué à un
  bug de Ruffle (arithmétique, tri), on le documente ; le moteur suit le comportement Flash
  documenté et on note le cas.
- **Ce que l'oracle couvre au-delà du combat** : les flashvars ne transmettent que graine +
  liste de choix binaires par trooper, donc le SWF dérive lui-même compétences, armes,
  apparence et arbre de montée de niveau depuis la graine. Cette génération est donc portée
  et vérifiée par le même banc (troopers aléatoires : compétences/armes calculées par le SWF
  vs par `packages/game`). `army.swf`/`mini.swf` (rendu des troopers sur les pages) utilisent
  les mêmes données.
- Les règles qui ne tournaient que sur le serveur Motion-Twin (coûts, adversaires, nombre de
  rats, paliers de raid) ne sont pas vérifiables par oracle : elles suivent l'annexe A.
- **Corpus** : génération aléatoire couvrant toutes les compétences, armes, véhicules,
  types de troopers (humain, rat, boss de raid…), fonds et tailles d'armée (1 à 32),
  plus des cas ciblés par compétence. Taille cible : 10 000 combats, zéro écart.
- Un écart = un test de régression figé (entrée + trace attendue) committé dans le dépôt,
  pour que la CI n'ait plus besoin de Ruffle sur ces cas.
- Le moteur doit aussi reproduire le PRNG `mt.Rand` exactement (entiers 32 bits, ordre des
  tirages).

### Règles de jeu (`packages/game`)

Source principale : le code GitLab (MIT), recoupé avec l'annexe A (wikis, archives) et le
SWF quand la règle y vit (génération des troopers, compétences). Valeurs connues à reprendre :
coût d'amélioration `floor((L−1)^2.5)` pour atteindre le niveau L (concorde avec GitLab),
coût d'achat du N-ième trooper selon la **table du wiki** (GitLab utilise `6n²+2`, faux dès
le 3ᵉ trooper : 26 au lieu de 24), plafond 12 troopers, Power = 4×troopers + somme des
niveaux, 140 compétences (8 spécialisations, 30 armes, 5 véhicules, 97 autres) + compétences
PNJ, paliers de raid. Quand GitLab et les wikis divergent, voir annexe A.
Chaque règle porte sa source en commentaire (`// source: wiki X` / `// source: SWF` /
`// UNVERIFIED`). Priorité des sources : SWF > archives des pages originales > wikis >
GitLab. Quand rien ne permet de vérifier une règle, on livre quand même la valeur GitLab
marquée `UNVERIFIED` (on ne bloque pas la fonctionnalité) et elle est listée dans l'annexe A.

### Serveur (`apps/server`)

- Node 24 (TS natif) + Hono, un seul processus. SQLite intégré (`node:sqlite`), sans
  dépendance native (important sur ARM64). Migrations SQL versionnées.
- Pages rendues côté serveur avec les mêmes URLs que l'original : un sous-domaine par armée
  (`<armée>.domaine/hq`), `/b/opp`, `/b/mission?t=…`, `/b/raid`, `/b/fview/<id>`, `/history`,
  `/ranks`, `/global-ranks`, `/protect`, `/t/<n>`, `/add`. Un mode chemin (`/a/<armée>/hq`)
  sert de repli quand on n'a pas de DNS wildcard (localhost).
- On stocke les **entrées** de combat (graine + composition), pas le résultat brut : la
  rediffusion les renvoie au SWF, le serveur recalcule avec le moteur TS.
- Tâche quotidienne (minuit, fuseau configurable) : nouvelles recrues du jour, remise à zéro
  des combats/missions/raids.
- Comptes comme l'original : **l'armée est le compte**. Accès lié au cookie de l'appareil
  qui l'a créée, mot de passe d'armée optionnel posé sur `/protect` (hashé), connexion
  « Vous avez déjà une armée ? » sur l'accueil. Limite de création par IP comme l'original.
- **Les 6 armées de faction** de l'original existent (vraies armées en base, troopers niv.
  20→10, recruteurs par défaut).
- **Armées de remplissage** (pas dans l'original, nécessaires avec peu de joueurs) :
  générées à Power comparable, utilisées uniquement par `/b/opp` et l'Infiltration quand il
  manque des armées réelles. Mêmes gains qu'une armée réelle (sinon l'économie change), mais
  absentes des classements et de l'historique, et non stockées comme comptes.

### Livraison par étapes

1. Banc différentiel + moteur exact (aucune UI). Sortie : 10 000 combats, zéro écart.
2. `packages/game` + création d'armée, HQ, recrutement, amélioration, combats quotidiens.
3. Missions (Extermination, Infiltration, Epic), raids, parrainage.
4. Historique, classements, protection, fiche trooper, finitions visuelles, Docker.

## Décisions prises par Claude (à corriger si besoin)

- Stack : Node 24 + Hono + `node:sqlite` plutôt que Bun (absent, support Windows ARM64
  incertain). Le code reste compatible Bun.
- Comptes au modèle de l'original (armée = compte, cookie + mot de passe `/protect`), pas d'OAuth.
- Classement : celui de l'original (armées recrutées par ton recruteur). Pas de classement
  global (n'existait pas ; ajout du serveur de test).
- Armées bots pour remplir les adversaires.
- Fonctions payantes de l'original : gratuites ou retirées, selon l'annexe A.

## Réponses de Killian (2026-11-22)

- **Langue : français seul.** Pages en français, `client_fr.swf` uniquement. Pas de couche
  de traduction.
- **Hébergement : pas encore décidé.** Les deux modes d'URL sont de première classe :
  sous-domaine par armée (DNS + certificat wildcard) et chemin `/a/<armée>/…`, choisis par
  configuration. Le cookie de session suit le mode (domaine parent ou chemin). L'image Docker
  est construite pour amd64 et arm64.
- **Serveur de test Eternaltwin : utilisable avec une armée.** Un outil `tools/capture`
  enregistre, depuis une armée de test créée sur `*.trooperstest.gued.es`, les flashvars des
  combats/missions/raids, les coûts affichés, les offres de troopers et le HTML des pages.
  Ces captures servent de cas de test supplémentaires (entrées réelles pour le banc) et de
  référence pour les règles absentes de GitLab (Epic, protection). Usage modéré : quelques
  actions par jour comme un joueur normal, pas de scraping massif. Leur comportement reste
  une référence secondaire (c'est aussi un remake) : priorité SWF > archives > wikis >
  serveur de test > GitLab.

## Décisions complémentaires de Claude

- Pas d'import d'anciennes armées : les identifiants et graines sont libres (graine tirée
  aléatoirement à la création, comme l'original côté client).

## Laissé au constructeur

- Format exact de la trace d'événements et méthode d'instrumentation du SWF.
- Couche d'accès SQL (requêtes directes ou petit query builder).
- Choix du lanceur de tests et de la CI.

## Annexe A — checklist des fonctionnalités de l'original

Sources : wiki Fandom EN (283 pages lues via l'API), Twinpedia FR (snapshots Wayback
2011/2016), pages minitroopers.com archivées (`/hq`, `/t/0`, `/add`, `/b/opp`, `/ranks`,
`/history`, `/choice`, `/protect`, `/endDay`, `/b/view/raid`). Le rapport complet (listes
des 140 compétences avec effets et niveaux, stats des 30 armes, véhicules, ordres Comms,
mécaniques de combat) est copié dans `docs/research/original-game.md` et sert de référence.

Légende : ✅ présent dans GitLab et conforme · ⚠️ présent mais divergent · ❌ absent · ❓ incertain

### Compte, armée, pages
| Fonction | Original | État GitLab |
|---|---|---|
| Armée = compte, sous-domaine par armée | oui | ❌ (comptes OAuth) |
| Mot de passe d'armée `/protect`, limite ~2 armées/jour/IP | oui | ❌ |
| Création : nom + 1 trooper parmi 5 offerts, offre quotidienne | oui | ✅ |
| 6 factions bots (6 troopers niv. 20→10), couleur héritée du recruteur | oui | ⚠️ (couleur seule) |
| `/hq` (crédits, Power, troopers, combats, mission, raid, recrutement) | oui | ✅ |
| `/t/<n>` fiche : amélioration, renommage **une seule fois** (12 car.), ré-équipement si >3 objets, préférences IA débloquées par niveau | oui | ⚠️ (pas de renommage) |
| `/add` achat de trooper, plafond 12 | oui | ⚠️ (coût faux) |
| `/b/opp` ~5 adversaires de Power proche + attaque d'une armée par son nom | oui | ⚠️ (4 slots, pas d'attaque par nom) |
| `/b/fview/<id>` lien de rediffusion | oui | ✅ |
| `/history` combats défensifs (10), recrues (10), animation des recrues | oui | ❌ |
| `/choice` ordre de déploiement (≥5 troopers) | oui | ❌ |
| `/ranks` armées du même recruteur | oui | ⚠️ (classement global) |
| `/endDay` « C'est tout pour aujourd'hui » + compte à rebours | oui | ❌ |
| Pas de chat, d'amis, de premium, de trophées | — | — |

### Économie
| Règle | Original | État GitLab |
|---|---|---|
| Combat : 2 crédits gagné, 1 perdu | oui | ✅ |
| Mission : 4 gagnée, 0 perdue ; déblocage 5 crédits | oui | ✅ |
| Raid : 4 par phase gagnée | oui | ✅ |
| Parrainage : 100 / 50×3 / 10×10 / 5×20 / 0 ensuite | oui | ❓ (`referralGold` à vérifier) |
| Coût d'achat : 8, 24, 60, 120, 200, 340, 500, 720, 1000, 1300, 2000 | oui | ⚠️ (formule fausse) |
| Coût d'amélioration `floor((L−1)^2.5)` | oui | ✅ |
| Level-up : 2 choix (3 avec Malin), spécialisation au niv. 6 | oui | ✅ (à confirmer par le banc) |
| Power = 4×troopers + Σ niveaux | oui | ✅ |
| Remise à zéro quotidienne ~00:00 (GMT+1) | oui | ✅ |

### Modes de jeu
| Mode | Original | État GitLab |
|---|---|---|
| Combats : 3/jour, +1 par trooper Commandement, max 5 | oui | ⚠️ (5 fixes) |
| Missions : **un seul type tiré au hasard par jour**, 3 essais | oui | ⚠️ (types indépendants) |
| Infiltration : biais vers les armées déjà affrontées | oui | ❓ |
| Extermination : rats niv. 1, 2 compétences aléatoires, nombre croissant à chaque victoire | oui | ✅ (`ratsCount`) |
| Epic : dès 10 recrues, armée + meilleures recrues (max 32), PNJ à >3 objets, croissante | oui | ❌ |
| Raid : recrues uniquement (1er trooper de chaque recrue), phases enchaînées, survivants continuent, 100 par combat | oui | ⚠️ (inclut ton 1er trooper ; plafond 20 ❓) |
| Fonds : garden, wood (raid), attic (extermination), sewer ❓, road (epic) | oui | ❓ |

### Combat (moteur)
Toute la mécanique (ticks et Initiative, vagues et Deployment, ordres Comms, sabotage,
zones du corps et killshots, armes/munitions/portée minimale, véhicules, statuts, IA de
ciblage) vit dans le SWF : elle est couverte par le banc différentiel, pas par cette
checklist. Les descriptions du wiki servent à générer des cas ciblés.

### Points incertains (marqués `UNVERIFIED` dans le code)
Plafond de raid (20 ou 21+), niveaux minimum de l'avion de chasse / grenade trou noir /
Martyr / Commandement / Occupation, fond « sewer », correspondance des noms de factions FR/EN,
inclusion du trooper du joueur dans les raids.

## Déploiement (précisé par Killian le 2026-11-22)

- Stack Docker sur l'hôte Docker existant du homelab (pas de LXC dédiée).
- Instance **publique** sur Internet **sans ouvrir aucun port** : exposition par Cloudflare
  Tunnel (réutiliser le `cloudflared` existant s'il y en a un). Le mode sous-domaine passe par
  un enregistrement `*.domaine` vers le tunnel (certificat universel Cloudflare).
- Conséquences pour l'étape 2 : IP client lue dans `CF-Connecting-IP` (limite de création
  d'armées par IP), cookies `Secure`, limitation de débit sur la création d'armée et les
  tentatives de mot de passe `/protect`.
