# MiniTroopers — remake privé

Recréation fidèle de **MiniTroopers** (Motion-Twin, 2011–2023) pour une instance privée :
serveur léger en TypeScript, pages identiques à l'original, et un moteur de combat
**prouvé identique** au SWF d'origine.

> Projet privé. Les fichiers du jeu (`assets/swf/`) sont © Motion-Twin et ne doivent
> jamais être publiés dans un dépôt public. Voir [LICENSE](LICENSE) et [NOTICE](NOTICE).

## Pourquoi ce projet

Le remake public d'Eternaltwin ([GitLab](https://gitlab.com/eternaltwin/minitroopers/minitroopers))
est inachevé : mission Epic absente, plusieurs règles divergentes de l'original, et son moteur
de combat tourne encore dans le SWF Flash via Ruffle. Le serveur de test d'Eternaltwin repose
sur un autre code, non publié.

Objectif ici : un joueur de l'original ne doit voir **aucune différence de gameplay** — mêmes
combats pour une même graine, mêmes règles, mêmes pages, même économie.

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
packages/game     règles hors combat : coûts, génération, missions, raids   (étape 2)
apps/server       serveur Hono + SQLite, pages rendues côté serveur        (étape 2)
tools/oracle      banc différentiel : instrumentation SWF, runner Ruffle, corpus, diff
assets/swf        SWF originaux (© Motion-Twin) + SHA256SUMS
docs/             conception, plans, référence du jeu original
```

## Avancement

| Étape | Contenu | État |
|---|---|---|
| 1 | Banc différentiel + moteur de combat exact | ✅ terminée (`@mt/engine` 1.0.0, 0 écart sur 10 000 combats oracle) |
| 2 | Règles de jeu, serveur, création d'armée, HQ, recrutement, amélioration, combats quotidiens | ✅ terminée (`npm run dev`) |
| 3 | Missions (Extermination, Infiltration, Epic), raids, parrainage | à venir |
| 4 | Historique, classements, protection, ordre de déploiement, fin de journée, Docker | à venir |

La checklist complète des fonctionnalités de l'original et leur état est en annexe du
[document de conception](docs/superpowers/specs/2026-11-22-minitroopers-remake-design.md).

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
[apps/server/README.md](apps/server/README.md). Administration (créer, afficher, modifier une armée, rendre les
quotas du jour, renommer, supprimer, sauvegarder ; en local ou dans Docker) :
[apps/server/README.md#administration](apps/server/README.md#administration).

### Héberger son instance

Image Docker auto-hébergeable (amd64/arm64), Docker Compose derrière Cloudflare Tunnel, sauvegardes :
[deploy/README.md](deploy/README.md).

Le banc différentiel (`tools/oracle`) demande en plus Java 21 et JPEXS FFDec (instrumentation
du SWF), ainsi que Chromium via Playwright ou `ruffle_desktop` (exécution). Ces outils ne servent
qu'en développement : la procédure est décrite dans `tools/oracle/instrument/README.md`.

## Documentation

- [Conception](docs/superpowers/specs/2026-11-22-minitroopers-remake-design.md) : objectifs,
  choix d'architecture, checklist des fonctionnalités de l'original
- [Référence du jeu original](docs/research/original-game.md) : 140 compétences, 30 armes,
  véhicules, économie, modes de jeu, mécaniques de combat (wikis + archives)
- [Plan de l'étape 1](docs/superpowers/plans/2026-11-22-etape1-banc-et-moteur.md)

## Crédits

- **Motion-Twin** — jeu original et tous ses assets.
- **Eternaltwin / YesLifeTechnology** — remake GitLab (MIT), dont ce projet reprend le
  sérialiseur Haxe, des règles de jeu et la table de désobfuscation.
- **Ruffle** et **JPEXS FFDec** — exécution et décompilation des SWF.
- Wikis communautaires : MiniTroopers Fandom (EN) et Twinpedia (FR).
