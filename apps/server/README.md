# @mt/server

Serveur Hono + SQLite (`node:sqlite`) du remake : pages HTML reprises de l'original, combats calculés par
`@mt/engine` et rejoués dans le navigateur par `client_fr_play.swf` sous Ruffle.

## Lancer en local

Depuis la racine du dépôt (Node 24.12+, rien d'autre à installer) :

```sh
npm ci
npm run dev        # http://localhost:8080/ en mode chemin, rechargé à chaque modification du code
npm start          # même chose sans rechargement
```

Les données (base SQLite `minitroopers.db`, WAL) vont dans `var/` (gitignoré). Au premier démarrage
(base absente), les six armées de faction sont créées.

## Configuration (variables d'environnement)

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8080` | port d'écoute |
| `LISTEN_HOST` | `127.0.0.1` | adresse d'écoute (`0.0.0.0` pour toutes les interfaces, par exemple dans un conteneur). `HOST` est ignoré (avertissement au démarrage) : tcsh l'exporte avec le nom de la machine |
| `URL_MODE` | `path` | `path` : armées sous `/a/<hôte>/hq` ; `subdomain` : `<hôte>.<BASE_DOMAIN>/hq` |
| `BASE_DOMAIN` | `localhost` | domaine des sous-domaines d'armées (mode `subdomain`, au moins deux labels, **sans port** : le port des URL vient de `PUBLIC_URL`) |
| `PUBLIC_URL` | `http://localhost:<PORT>` (`http://<BASE_DOMAIN>:<PORT>` en mode `subdomain`) | origine publique `http(s)://…` ; `https://` ⇒ cookies `Secure`. **Doit être exactement l'origine utilisée par le navigateur** (`127.0.0.1` ≠ `localhost`) : tout POST dont l'en-tête `Origin` diffère reçoit 403 « Requête refusée » |
| `DATA_DIR` | `var` | dossier des données (relatif à la racine du dépôt) |
| `TRUST_PROXY` | `0` | `0`/`false` ou `1`/`true` : IP client lue dans `CF-Connecting-IP` (derrière Cloudflare Tunnel seulement, voir ci-dessous) |
| `TZ_GAME` | `Europe/Paris` | fuseau IANA du jour de jeu |

Toute valeur invalide (`TRUST_PROXY` autre que `0`/`1`/`true`/`false`, `PUBLIC_URL` qui n'est pas une URL http(s),
`TZ_GAME` inconnu, `BASE_DOMAIN` avec un port) arrête le serveur au démarrage avec un message explicite.

**`TRUST_PROXY=1` n'est sûr que si le port n'est joignable que par le proxy** (`cloudflared` ou le reverse proxy) :
le serveur croit alors l'en-tête `CF-Connecting-IP`, que n'importe quel client direct pourrait forger pour
contourner les limites par IP. Garder `LISTEN_HOST=127.0.0.1` (défaut) avec `cloudflared` sur la même machine, ou
fermer le port au reste du réseau.

### Mode sous-domaines en local

```sh
URL_MODE=subdomain BASE_DOMAIN=mt.localhost npm run dev   # http://mt.localhost:8080/
```

La session est partagée entre le site racine et les armées par un cookie `Domain=<BASE_DOMAIN>`.
Vérifié dans Chromium (test « [e2e cookies] » de `test/e2e.test.ts`) : un cookie `Domain=localhost` est accepté mais **jamais envoyé** à
`<armée>.localhost` ; avec `Domain=mt.localhost` il l'est bien à `<armée>.mt.localhost`. Le serveur refuse
donc de démarrer en mode `subdomain` avec un `BASE_DOMAIN` à un seul label. Les navigateurs résolvent tout
`*.localhost` vers la machine sans DNS ; `lvh.me` marche aussi mais passe par un DNS public.
Non vérifié dans Firefox et Safari.

## Exploitation

- `GET /healthz` répond `200 ok` après un `SELECT 1` sur la base, sans session ni cookie (sonde de santé).
- `SIGTERM` / `SIGINT` (`docker stop`, Ctrl+C) : le serveur ferme le port et les connexions inactives (les
  autres au plus tard après 3 s), arrête la tâche horaire puis ferme la base (WAL vidé) et sort avec le code 0.
- Image Docker, Docker Compose derrière Cloudflare Tunnel, sauvegarde et mise à jour :
  [deploy/README.md](../../deploy/README.md). `node deploy/dryrun.mjs` vérifie l'image sans Docker (contexte
  filtré par `.dockerignore`, installation sans dépendances de développement, démarrage, routes, arrêt).

## Administration

```sh
npm run admin -- <commande> [options]      # même DATA_DIR que le serveur, utilisable pendant qu'il tourne
```

| Commande | Effet |
|---|---|
| `seed-factions` | crée les armées de faction absentes (sans effet si elles existent déjà) |
| `create-army --name <nom> --troopers <json \| @fichier.json> [--part 0-5] [--faction 0-5] [--credits N] [--password P] [--rats N] [--force]` | crée une armée complète (mot de passe : `--password` ou `MT_ARMY_PASSWORD`, jamais vide) ; `--rats` : rats de la prochaine extermination (1-100, défaut 1) ; `--force` : remplace l'armée de même hôte (jamais une faction) en une transaction |
| `create-bro-army --name <nom> [--part 0-5] [--faction 0-5] [--count 12] [--rats 35] [--credits N] [--force]` | armée « du frère » : `count` troopers niveau 2 (Malin), extermination avancée, missions débloquées ; mot de passe **uniquement** par `MT_ARMY_PASSWORD` (obligatoire) |
| `set-password --name <hôte>` | pose ou remplace le mot de passe d'une armée, **uniquement** par `MT_ARMY_PASSWORD` (obligatoire, jamais vide) ; déconnecte ses sessions. Seule voie pour une armée dont l'ordinateur de création est inconnu (`created_cid` NULL), que `/protect` refuse |
| `give-credits --army <nom ou hôte> --amount <N>` | ajoute N crédits (N négatif : en retire, jamais sous 0) |
| `list` | liste les armées (id, hôte, titre, faction, crédits, troopers, puissance) |
| `show --army <x> [--day AAAA-MM-JJ]` | état complet d'une armée : crédits, mot de passe, missions, rats, recruteur, recrues confirmées / en attente, troopers (niveau, compétences), ordre de déploiement, et la journée (défaut : aujourd'hui dans `TZ_GAME`) : batailles jouées / permises, mission, raid |
| `reset-day --army <x> [--day AAAA-MM-JJ] [--what battles\|mission\|raid\|shop\|all]` | rend les quotas d'une journée (défaut : aujourd'hui, `all`), sans rien effacer (voir plus bas) |
| `set-credits --army <x> --amount <N>` | fixe les crédits à N (≥ 0) |
| `set-rats --army <x> --rats <1-100>` | rats de la prochaine extermination |
| `unlock-missions --army <x> [--lock]` | débloque les missions sans les faire payer ; `--lock` les verrouille à nouveau |
| `rename --army <x> --name <nouveau nom>` | renomme l'armée (règles de la création, article conservé) ; refuse un hôte déjà pris ; les sessions restent ouvertes, la nouvelle adresse est affichée (en mode sous-domaines, l'adresse change avec l'hôte). Une attaque par nom (« ami ») rejouée après le renommage de son défenseur ne combat pas : déjà jouée, elle montre le combat qu'elle a produit ; jamais jouée, l'ancien nom n'existe plus (`/b/opp?err=missing`) |
| `level-up --army <x> --slot <N> --skill <NOM \| id>` | une montée de niveau gratuite du trooper de l'emplacement N, avec cette compétence seulement si le jeu la propose à ce niveau (sinon : liste des compétences proposées) ; refusée si une montée payée attend son choix |
| `confirm-recruits --army <x>` | confirme les recrues en attente et crédite leurs primes, exactement comme l'ouverture de `/history` |
| `delete-army --army <x> [--yes]` | supprime l'armée, ses troopers et les combats qu'elle a lancés (ses défenses restent chez leurs attaquants, ses recrues perdent leur recruteur) ; sans `--yes`, affiche seulement ce qui serait supprimé et sort avec le code 1 |
| `backup --out <fichier>` | copie cohérente de la base (`VACUUM INTO`), possible pendant que le serveur tourne ; refuse un fichier existant ; dans le conteneur Docker, chemin absolu sous `/data` |

`<x>` est le nom de l'armée ou son hôte (`"Mon Armée"` ou `mon-armee`). Les erreurs sont écrites en français
sur la sortie d'erreur, avec le code de sortie 1. Chaque modification est une seule transaction
(`BEGIN IMMEDIATE`), sans risque pendant que le serveur tourne. Les armées de faction sont refusées par
`reset-day`, `set-rats`, `unlock-missions`, `rename`, `level-up` et `delete-army`.

Un exemple par commande (noms à remplacer) :

```sh
npm run admin -- seed-factions
npm run admin -- create-army --name "<nom de l'armée>" --troopers @armee.json
MT_ARMY_PASSWORD='<mot de passe>' npm run admin -- create-bro-army --name "<nom de l'armée>"
MT_ARMY_PASSWORD='<mot de passe>' npm run admin -- set-password --name <hôte>
npm run admin -- give-credits --army <hôte> --amount 50
npm run admin -- list
npm run admin -- backup --out var/sauvegarde.db
npm run admin -- show --army <hôte>
npm run admin -- reset-day --army <hôte> --what battles
npm run admin -- set-credits --army <hôte> --amount 200
npm run admin -- set-rats --army <hôte> --rats 20
npm run admin -- unlock-missions --army <hôte>
npm run admin -- rename --army <hôte> --name "<nouveau nom>"
npm run admin -- level-up --army <hôte> --slot 0 --skill SMART
npm run admin -- confirm-recruits --army <hôte>
npm run admin -- delete-army --army <hôte>          # aperçu ; ajouter --yes pour supprimer
```

### Dans Docker

La CLI tourne dans le conteneur, sur la même base (`/data`), pendant que le serveur tourne :

```sh
docker compose exec minitroopers npm run admin -- show --army <hôte>     # deploy/compose.yaml
docker exec minitroopers npm run admin -- show --army <hôte>             # conteneur lancé par docker run --name minitroopers
```

Pour un mot de passe : `docker exec -e MT_ARMY_PASSWORD minitroopers npm run admin -- set-password --name <hôte>`
(la variable est reprise de l'environnement du shell, après `read -rs MT_ARMY_PASSWORD && export MT_ARMY_PASSWORD`).

### `reset-day` : rendre une journée sans effacer l'historique

Rien n'est supprimé et aucun compteur ne recule : les combats déjà joués restent dans l'historique et se
rejouent à l'identique, et leurs numéros (`/b/view/bat<n>`, `/b/view/miss<n>`) restent uniques. La remise à
zéro enregistre ce qui était déjà utilisé (`daily.battles_reset`, `missions_reset`, `raid_reset`, migration
007) et les quotas comptent à partir de là :

- `battles` : toutes les batailles du jour sont rendues (la limite complète du jour, de nouveau), comptées à partir
  des batailles déjà jouées ; la page QG n'affiche plus que les batailles jouées depuis ;
- `mission` : la même mission (type et adversaire gelés) retrouve tous ses essais et n'est plus gagnée ;
- `raid` : phase 1 avec toutes les recrues vivantes ; le compteur du lien (`/b/raid?phase=`) passe à une valeur
  jamais utilisée, la phase jouée étant ce compteur moins `raid_reset` ;
- `shop` : nouvelles offres sur « Ajouter un trooper » (`/add`). Ces offres ne sont pas stockées : elles se
  déduisent du jour, du navigateur et du recruteur. `daily.shop_reset` (migration 008) compte les remises à zéro et
  change ce tirage ; à 0, ce sont les offres d'origine du jour. Contrairement aux autres, **chaque appel tire de
  nouvelles offres**, et une offre d'avant la remise à zéro n'est plus achetable ;
- `all` (défaut) : les quatre.

Les liens d'action portent ces compteurs qui ne font que croître : un lien émis avant la remise à zéro (onglet
resté ouvert, rechargement) ne correspond à aucun nouveau combat et ne rejoue rien, il affiche le combat qu'il
avait produit ou renvoie au QG. Relancer `reset-day` sans nouveau combat ne change rien, sauf pour la boutique.

Le mot de passe d'une armée protégée ne peut pas être vide. Pour qu'il n'apparaisse ni dans `ps` ni dans
l'historique du shell, le passer par la variable `MT_ARMY_PASSWORD` à la place de `--password` (pas les deux) :

```sh
read -rs MT_ARMY_PASSWORD && export MT_ARMY_PASSWORD
npm run admin -- create-army --name "Rats Morts" --troopers @armee.json
unset MT_ARMY_PASSWORD
```

`--part` est l'article du formulaire de création (0 de, 1 d', 2 du, 3 de la, 4 des, 5 aucun) ; une armée de
faction (`is_faction`) ne peut pas être ouverte par son nom.

```sh
MT_ARMY_PASSWORD='mot-de-passe' npm run admin -- create-bro-army --name "<nom de l'armée>" --part 4
```

### Troopers de `create-army`

Un tableau JSON, un objet par trooper dans l'ordre des emplacements :

- `seed` : graine du trooper (1..2147483647), unique dans l'armée ; elle fixe son apparence, ses compétences de
  départ et les options de chaque montée de niveau ;
- `name` : 1 à 12 caractères ;
- `skills` : la compétence choisie à chaque montée de niveau (id numérique ou nom de `SKILLS` de `@mt/engine`,
  sans tenir compte de la casse : `"SMART"` est la compétence « Malin ») ; chacune doit faire partie des options
  que le jeu proposerait à ce moment, sinon la commande échoue et affiche les options proposées ;
- ou `choices` : les indices bruts des options choisies (forme stockée), à la place de `skills` ;
- ni l'un ni l'autre : un trooper de niveau 1.

Le niveau d'un trooper est `1 + nombre de choix`. Exemple (`armee.json`) :

```json
[
  { "seed": 1234582, "name": "Rambo", "skills": ["SMART", "THERMOS_COFFEE"] },
  { "seed": 7654321, "name": "Bob", "choices": [0, 1] },
  { "seed": 2468024, "name": "Bleu" }
]
```

```sh
npm run admin -- create-army --name "Rats Morts" --part 4 --faction 2 --troopers @armee.json
```

Les noms de compétences de l'exemple sont à adapter : la commande indique, pour chaque montée de niveau
refusée, les options que la graine propose réellement.

## Tests

```sh
npm test                                   # tout le dépôt, dont apps/server/test
node --test apps/server/test/e2e.test.ts   # bout en bout seul
```

`test/e2e.test.ts` lance le vrai serveur (`src/main.ts`) et la CLI dans les deux modes d'URL et pilote
Chromium headless (Playwright, navigateurs sous `tools/bin/ms-playwright`, ignoré s'ils sont absents) :
création d'armée, crédits par la CLI, amélioration et choix de compétence, achat d'un trooper, combat ; la page
de combat charge Ruffle et le SWF, dont la bannière de fin (VICTOIRE/DÉFAITE) doit montrer le vainqueur
enregistré en base, puis « continuer » doit appeler `endBattle()` vers `/hq?money=<gain>`. Un second parcours
(étape 3) : A crée son armée, B s'inscrit par le lien de recrutement de A, A ouvre `/history` (recrue confirmée,
+100), débloque et joue la mission du jour (quel que soit son type), lance un raid avec B, puis pose un mot de
passe par `/protect` ; la mission et le raid sont rejoués par le SWF avec le vainqueur enregistré en base.
Durée : plusieurs minutes (chaque combat est rejoué en temps réel ; `MT_E2E_BATTLE_MS` borne l'attente d'une
bannière, 400 000 ms par défaut).

En cas d'échec d'une bannière, les captures `var/e2e-<mode>-<combat>-{banner,player}.png` aident au diagnostic.
