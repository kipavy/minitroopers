# MiniTroopers — remake

Recréation fidèle de **MiniTroopers** (Motion-Twin, 2011–2023) : serveur léger en TypeScript,
pages identiques à l'original, et un moteur de combat **prouvé identique** au SWF d'origine.

![Page de création d'armée du remake](docs/img/creation-armee.png)

Les fichiers du jeu (`assets/swf/`) sont © Motion-Twin. Voir [LICENSE](LICENSE) et [NOTICE](NOTICE).

## Pourquoi ce projet

Le remake public d'Eternaltwin ([GitLab](https://gitlab.com/eternaltwin/minitroopers/minitroopers))
est inachevé : mission Epic absente, plusieurs règles divergentes de l'original, et son moteur
de combat tourne encore dans le SWF Flash via Ruffle. Le serveur de test d'Eternaltwin repose
sur un autre code, non publié.

Objectif ici : un joueur de l'original ne doit voir **aucune différence de gameplay** — mêmes
combats pour une même graine, mêmes règles, mêmes pages, même économie.

## Avancement

Les quatre étapes sont terminées. Le jeu complet tourne en production depuis le 2026-11-23.

| Étape | Contenu | État |
|---|---|---|
| 1 | Banc différentiel + moteur de combat exact | ✅ `@mt/engine` 1.0.0, 0 écart sur 10 000 combats oracle |
| 2 | Règles de jeu, serveur, création d'armée, HQ, recrutement, amélioration, combats quotidiens | ✅ |
| 3 | Missions (Extermination, Infiltration, Epic), raids, parrainage, protection par mot de passe | ✅ |
| 4 | Historique, classements, ordre de déploiement, fin de journée, image Docker, CLI d'administration | ✅ |

Ajouts depuis la fin de l'étape 4 :

- infobulles des 141 compétences et armes, tirées du texte de `client_fr.swf` (#2) ;
- `reset-day` tire à nouveau la boutique `/add` et les adversaires `/b/opp` du jour (#3) ;
- `set-faction` change la couleur d'uniforme d'une armée (#4) ;
- Ruffle utilise le rendu WebGL : animations fluides sur les GPU où le rendu par défaut (wgpu) rame (#5).

## Fonctionnalités

Toutes les fonctionnalités joueur de l'original sont présentes, avec les mêmes URLs et les mêmes pages.

**Armée et compte**
- Création d'une armée : un nom et 1 trooper à choisir parmi 5 offres du jour. Le nombre de créations par IP et par jour est limité.
- Mode sous-domaine (`<armée>.domaine/hq`) ou mode chemin (`/a/<armée>/hq`) quand il n'y a pas de DNS wildcard.
- `/protect` : mot de passe d'armée.
- 6 armées de faction (bots) créées au premier démarrage. Une recrue hérite de la couleur de son recruteur.

**Pages**
- `/hq` : crédits, puissance, troopers, combats, mission, raid et recrutement.
- `/t/<n>` : fiche d'un trooper. Elle permet :
  - d'améliorer le trooper ;
  - de choisir une compétence à la montée de niveau (2 choix, 3 avec Malin ; spécialisation au niveau 6) ;
  - de le renommer une seule fois ;
  - de le rééquiper s'il porte plus de 3 objets ;
  - de régler ses préférences d'IA, débloquées selon le niveau.
- `/add` : achat d'un trooper au coût de la table originale (8, 24, 60… 2000), 12 troopers au maximum.
- `/b/opp` : environ 5 adversaires de puissance proche, plus l'attaque d'une armée par son nom.
- `/history` : les 10 dernières défenses, les recrues et leur animation, et la confirmation des primes de parrainage.
- `/ranks` : classement des armées du même recruteur.
- `/choice` : ordre de déploiement, à partir de 5 troopers.
- `/endDay` : « C'est tout pour aujourd'hui », avec compte à rebours.
- Rediffusion des combats (`/b/view/…`, `/b/fview/<id>`) par le SWF original sous Ruffle auto-hébergé.

**Modes de jeu et économie**
- Combats quotidiens : 3 par jour, +1 par trooper Commandement, 5 au maximum. Un combat gagné rapporte 2 crédits, un combat perdu 1.
- Missions :
  - déblocage pour 5 crédits ;
  - un type tiré au hasard chaque jour, 3 essais ;
  - 4 crédits par mission gagnée.
- Les trois types de mission :
  - Extermination : le nombre de rats augmente à chaque victoire ;
  - Infiltration ;
  - Epic : dès 10 recrues.
- Raids : les recrues enchaînent les phases et les survivants continuent. Chaque phase gagnée rapporte 4 crédits.
- Parrainage : 100, puis 50×3, 10×10, 5×20.
- Remise à zéro quotidienne à minuit, dans le fuseau configurable `TZ_GAME`.

**Exploitation**
- Image Docker `ghcr.io/kipavy/minitroopers` publiée par la CI (amd64/arm64), Docker Compose, `HEALTHCHECK` sur `/healthz`, arrêt propre.
- Fonctionne derrière Cloudflare Tunnel : avec `TRUST_PROXY=1`, l'IP du client est lue dans `CF-Connecting-IP`.
- CLI d'administration (`npm run admin`), voir [apps/server/README.md#administration](apps/server/README.md#administration) :
  - créer, afficher, renommer ou supprimer une armée ;
  - poser un mot de passe, gérer les crédits et la faction ;
  - fixer le nombre de rats, débloquer les missions ;
  - offrir une montée de niveau ;
  - rendre les quotas d'une journée ;
  - confirmer les recrues ;
  - sauvegarder la base pendant que le serveur tourne ;
  - créer l'« armée du frère » (`create-bro-army` : 12 troopers Malin, extermination avancée).

**Hors périmètre** (comme dans l'original, ou volontairement) : pas de chat, d'amis, de premium, de trophées,
de connexion Twinoid/Eternaltwin. Les fonctions payantes de l'original sont gratuites ou désactivées.
Les bâtiments, territoires et événements n'ont pas été repris : ils avaient été abandonnés dans l'original et
les archives n'en gardent aucune trace.

### Règles non vérifiables

Le moteur de combat est prouvé identique au SWF. En revanche, certaines règles ne s'exécutaient que sur le
serveur Motion-Twin : génération des offres, choix des adversaires, rééquipement, plafond de raid… Quand
aucune source ne les fixe, la valeur choisie porte un commentaire `// UNVERIFIED` dans le code. Elle est listée,
avec sa raison, dans [docs/game/unverified.md](docs/game/unverified.md).

## Comment on garantit la fidélité

Le SWF original calcule tout le combat d'avance (tableau `history`) avant de l'animer.
On s'en sert comme **oracle** :

```
                 ┌──────────────────────────────┐
  corpus de      │  client_fr.swf instrumenté   │──► trace golden (TRP / EV / END)
  combats   ───► │  (Ruffle, headless)          │                │
  aléatoires     └──────────────────────────────┘                ▼
       │                                                    oracle:diff ──► premier écart
       │         ┌──────────────────────────────┐                ▲
       └───────► │  @mt/engine (TypeScript pur) │──► trace ──────┘
                 └──────────────────────────────┘
```

1. Le SWF d'origine (`client_fr.swf`) est instrumenté pour imprimer les troopers générés et
   chaque événement du combat, sans toucher à sa logique.
2. Des milliers de combats aléatoires (toutes compétences, armes, véhicules, rats, armées
   de 1 à 32) passent dans le SWF : leurs traces deviennent des fichiers **golden**.
3. Le moteur TypeScript est porté depuis la décompilation, module par module, jusqu'à
   **zéro écart sur 10 000 combats**.
4. Les golden sont committés : la CI vérifie le moteur sans Flash ni Ruffle.

## Structure

```
packages/engine   moteur de combat déterministe, zéro dépendance
packages/game     règles hors combat : coûts, génération, offres, missions, raids, parrainage
apps/server       serveur Hono + SQLite, pages rendues côté serveur, CLI d'administration
tools/oracle      banc différentiel : instrumentation SWF, runner Ruffle, corpus, diff
assets/swf        SWF originaux (© Motion-Twin) + SHA256SUMS
docs/             conception, plans, référence du jeu original
```

## Démarrer

Prérequis : **Node 24.12+**.

```sh
npm ci
npm test          # tests unitaires + rejeu des golden
npm run typecheck
```

### Jouer en local

```sh
npm run dev                                  # http://localhost:8080/ (mode chemin), données dans var/
npm run admin -- list                        # administration : voir apps/server/README.md#administration
URL_MODE=subdomain BASE_DOMAIN=mt.localhost npm run dev   # mode sous-domaines : http://mt.localhost:8080/
```

Au premier démarrage, les armées de faction sont créées. Configuration et test de bout en bout :
[apps/server/README.md](apps/server/README.md).

### Héberger son instance

Image Docker publiée par la CI sur `ghcr.io/kipavy/minitroopers` (amd64/arm64), Docker Compose derrière Cloudflare Tunnel, sauvegardes, mise à jour :
[deploy/README.md](deploy/README.md).

Le banc différentiel (`tools/oracle`) demande en plus Java 21 et JPEXS FFDec (instrumentation
du SWF), ainsi que Chromium via Playwright ou `ruffle_desktop` (exécution). Ces outils ne servent
qu'en développement : la procédure est décrite dans `tools/oracle/instrument/README.md`.

## Documentation

- [Conception](docs/superpowers/specs/2026-11-22-minitroopers-remake-design.md) : objectifs,
  choix d'architecture, checklist des fonctionnalités de l'original
- [Référence du jeu original](docs/research/original-game.md) : 140 compétences, 30 armes,
  véhicules, économie, modes de jeu, mécaniques de combat (wikis + archives)
- [Règles non vérifiables](docs/game/unverified.md) : valeurs choisies faute de source, avec leur raison
- Plans : [étape 1](docs/superpowers/plans/2026-11-22-etape1-banc-et-moteur.md),
  [étape 2](docs/superpowers/plans/2026-11-22-etape2-serveur-armee-combats.md),
  [étape 3](docs/superpowers/plans/2026-11-23-etape3-missions-raids-parrainage.md),
  [étape 4](docs/superpowers/plans/2026-11-23-etape4-historique-classements-docker.md)
- [Hébergement Docker](deploy/README.md) et [serveur et administration](apps/server/README.md)

## Crédits

- **Motion-Twin** — jeu original et tous ses assets.
- **Eternaltwin / YesLifeTechnology** — remake GitLab (MIT), dont ce projet reprend le
  sérialiseur Haxe, des règles de jeu et la table de désobfuscation.
- **Ruffle** et **JPEXS FFDec** — exécution et décompilation des SWF.
- Wikis communautaires : MiniTroopers Fandom (EN) et Twinpedia (FR).
