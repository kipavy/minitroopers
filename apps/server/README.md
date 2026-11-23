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
| `PORT` | `8080` | port d'écoute (sur 127.0.0.1) |
| `URL_MODE` | `path` | `path` : armées sous `/a/<hôte>/hq` ; `subdomain` : `<hôte>.<BASE_DOMAIN>/hq` |
| `BASE_DOMAIN` | `localhost` | domaine des sous-domaines d'armées (mode `subdomain`, au moins deux labels) |
| `PUBLIC_URL` | `http://localhost:<PORT>` (`http://<BASE_DOMAIN>:<PORT>` en mode `subdomain`) | origine publique ; `https://` ⇒ cookies `Secure` |
| `DATA_DIR` | `var` | dossier des données (relatif à la racine du dépôt) |
| `TRUST_PROXY` | `0` | `1` : IP client lue dans `CF-Connecting-IP` (derrière Cloudflare Tunnel seulement) |
| `TZ_GAME` | `Europe/Paris` | fuseau du jour de jeu |

### Mode sous-domaines en local

```sh
URL_MODE=subdomain BASE_DOMAIN=mt.localhost npm run dev   # http://mt.localhost:8080/
```

La session est partagée entre le site racine et les armées par un cookie `Domain=<BASE_DOMAIN>`.
Vérifié dans Chromium (test e2e) : un cookie `Domain=localhost` est accepté mais **jamais envoyé** à
`<armée>.localhost` ; avec `Domain=mt.localhost` il l'est bien à `<armée>.mt.localhost`. Le serveur refuse
donc de démarrer en mode `subdomain` avec un `BASE_DOMAIN` à un seul label. Les navigateurs résolvent tout
`*.localhost` vers la machine sans DNS ; `lvh.me` marche aussi mais passe par un DNS public.
Non vérifié dans Firefox et Safari.

## Administration

```sh
npm run admin -- <commande> [options]      # même DATA_DIR que le serveur, utilisable pendant qu'il tourne
```

| Commande | Effet |
|---|---|
| `seed-factions` | crée les armées de faction absentes (sans effet si elles existent déjà) |
| `create-army --name <nom> --troopers <json \| @fichier.json> [--part 0-5] [--faction 0-5] [--credits N] [--password P]` | crée une armée complète |
| `give-credits --army <nom ou hôte> --amount <N>` | ajoute N crédits (N négatif : en retire, jamais sous 0) |
| `list` | liste les armées (id, hôte, titre, faction, crédits, troopers, puissance) |

`--part` est l'article du formulaire de création (0 de, 1 d', 2 du, 3 de la, 4 des, 5 aucun) ; une armée de
faction (`is_faction`) ne peut pas être ouverte par son nom.

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
enregistré en base, puis « continuer » doit appeler `endBattle()` vers `/hq?money=<gain>`. Durée : quelques
minutes (le combat est rejoué en temps réel).
