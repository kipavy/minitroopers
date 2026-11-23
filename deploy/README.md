# Auto-hébergement avec Docker

L'image contient le serveur (`node apps/server/src/main.ts`, Node 24.12) et ses deux dépendances d'exécution
(`hono`, `@hono/node-server`) ; ni Playwright, ni les outils du banc, ni les tests. Les données (base SQLite
`minitroopers.db`) vont dans le volume `/data`.

> **Ne jamais pousser l'image sur un registre public** (Docker Hub, GHCR public…) : elle contient les assets
> de Motion-Twin (SWF, images), dont la redistribution n'est pas autorisée. Construire l'image sur la machine
> qui la fait tourner, ou la garder dans un registre privé.

## Démarrage rapide

Depuis la racine du dépôt :

```sh
docker build -t minitroopers .
docker run -d --name minitroopers -p 127.0.0.1:8080:8080 -v minitroopers-data:/data -e PUBLIC_URL=http://localhost:8080 minitroopers
```

Puis ouvrir <http://localhost:8080/>. Au premier démarrage (base absente), les armées de faction sont créées.
`docker ps` affiche l'état de santé (`HEALTHCHECK` sur `GET /healthz`, sans `curl`). La sonde interroge
`127.0.0.1` dans le conteneur : laisser `LISTEN_HOST=0.0.0.0` (valeur de l'image), sinon le conteneur
reste « unhealthy » ou n'est plus joignable.

L'étiquette de base `node:24.12-bookworm-slim` suit les correctifs de Node 24.12 et de Debian : deux
constructions à des dates différentes peuvent donner des images différentes. Pour une construction
reproductible, épingler le condensé (`FROM node:24.12-bookworm-slim@sha256:…`, donné par
`docker buildx imagetools inspect node:24.12-bookworm-slim`) et le mettre à jour volontairement.

`PUBLIC_URL` doit être **exactement** l'origine tapée dans le navigateur (`127.0.0.1` ≠ `localhost`) : sinon
tout formulaire est refusé (403 « Requête refusée »).

Image multi-architecture (amd64 et arm64, par exemple pour un Raspberry Pi), à garder en local ou dans un
registre privé :

```sh
docker buildx build --platform linux/amd64,linux/arm64 -t minitroopers .
```

## Variables

Valeurs fixées par l'image : `NODE_ENV=production`, `PORT=8080`, `LISTEN_HOST=0.0.0.0`, `DATA_DIR=/data`,
`URL_MODE=path`. À fournir selon l'installation :

| Variable | Défaut | Rôle |
|---|---|---|
| `PUBLIC_URL` | `http://localhost:8080` | origine publique `http(s)://…` ; `https://` ⇒ cookies `Secure` |
| `URL_MODE` | `path` | `path` : armées sous `/a/<hôte>/` ; `subdomain` : `<hôte>.<BASE_DOMAIN>` |
| `BASE_DOMAIN` | `localhost` | domaine des armées en mode `subdomain` (au moins deux labels, sans port) |
| `TRUST_PROXY` | `0` | `1` : IP client lue dans `CF-Connecting-IP` (voir Cloudflare Tunnel) |
| `TZ_GAME` | `Europe/Paris` | fuseau IANA du jour de jeu |

Détail et contrôles au démarrage : [apps/server/README.md](../apps/server/README.md).

## Administration et sauvegarde

La CLI d'administration tourne dans le conteneur, sur la même base, pendant que le serveur tourne :

```sh
docker exec minitroopers npm run admin -- list
docker exec minitroopers npm run admin -- backup --out /data/backup-$(date +%F).db
docker cp minitroopers:/data/backup-$(date +%F).db .
```

Avec Docker Compose : `docker compose exec minitroopers npm run admin -- <commande>`. Toutes les commandes
(afficher une armée, crédits, quotas du jour avec `reset-day`, renommer, montée de niveau, supprimer…) :
[apps/server/README.md#administration](../apps/server/README.md#administration).

Dans le conteneur, `--out` doit être un chemin absolu sous `/data` : c'est le seul dossier où l'utilisateur
`node` peut écrire, et le seul conservé quand le conteneur est recréé. `backup` écrit une copie cohérente (`VACUUM INTO`) même pendant les écritures du serveur, et refuse d'écraser
un fichier existant. Pour restaurer : arrêter le conteneur, remplacer `/data/minitroopers.db` par la copie (et
supprimer `minitroopers.db-wal` / `-shm` s'ils existent), redémarrer.

## Mise à jour

```sh
git pull
docker build -t minitroopers .
docker stop minitroopers && docker rm minitroopers
docker run -d --name minitroopers ...        # même commande qu'au démarrage, même volume
```

`docker stop` envoie `SIGTERM` : le serveur ferme ses connexions, arrête sa tâche horaire et ferme la base
(WAL vidé) en moins d'une seconde d'ordinaire, trois au plus. Les migrations de la base s'appliquent seules au
démarrage suivant. Faire un `backup` avant une mise à jour.

## Derrière Cloudflare Tunnel (Docker Compose)

[`compose.yaml`](compose.yaml) lance le serveur **sans port publié**, sur un réseau Docker partagé avec le
conteneur `cloudflared` du tunnel. Créer `deploy/.env` (ignoré par git et par `.dockerignore`, comme `deploy/data/`) :

```sh
PUBLIC_URL=https://minitroopers.example.org
URL_MODE=path
BASE_DOMAIN=example.org
TZ_GAME=Europe/Paris
CF_NETWORK=<réseau-docker-de-cloudflared>
```

```sh
cd deploy
mkdir -p data && sudo chown 1000:1000 data   # le serveur tourne en utilisateur node (uid 1000)
docker compose up -d --build
```

Dans la configuration du tunnel, faire pointer le nom public vers `http://minitroopers:8080`.

- **Le réseau `${CF_NETWORK}` ne doit contenir que `cloudflared`** (et ce serveur) : avec `TRUST_PROXY=1`,
  tout conteneur de ce réseau peut joindre le port 8080 et forger `CF-Connecting-IP`. Créer un réseau dédié
  (`docker network create <réseau>`) plutôt que réutiliser un réseau partagé avec d'autres services.
- **`TRUST_PROXY=1` seulement sans port publié** : le serveur croit alors l'en-tête `CF-Connecting-IP` (limites
  par IP). Si le port était joignable directement, n'importe qui pourrait forger cet en-tête. `compose.yaml`
  n'a donc aucune ligne `ports:` ; avec `docker run -p`, laisser `TRUST_PROXY` à `0`.
- **Mode sous-domaines** (`URL_MODE=subdomain`, `BASE_DOMAIN=<domaine>`, `PUBLIC_URL=https://<domaine>`) :
  ajouter un DNS `*.<domaine>` vers le tunnel (en plus de `<domaine>`) et la même règle joker dans le tunnel.
  Le certificat universel de Cloudflare ne couvre qu'**un** niveau de sous-domaine : `*.exemple.fr` oui,
  `*.mt.exemple.fr` non. Utiliser donc un domaine dont les armées sont directement sous-domaines
  (`<armée>.exemple.fr`), ou un certificat avancé payant.
