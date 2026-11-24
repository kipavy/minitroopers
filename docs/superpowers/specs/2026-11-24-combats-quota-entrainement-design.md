# Plus de combats : quota à 5 et entraînement illimité — conception

## Intention

Killian trouve que 3 combats par jour, c'est trop peu : il veut « pouvoir attaquer plus chaque jour », sans dépendre
de la compétence Commandement. Deux réponses complémentaires, validées avec lui le 2026-11-24 :

1. **plus de combats qui comptent** : le quota de base passe de 3 à 5 ;
2. **des combats d'entraînement illimités** qui ne rapportent rien, « pour le plaisir », y compris contre l'armée d'un
   joueur précis.

L'instance est celle de Killian, de son frère et de recrues ; après v1.0.0 (version fidèle), les écarts à l'original
sont acceptés s'ils restent dans l'esprit MiniTroopers.

## Objectifs

### Quota

- `battlesPerDay` : **5 + 1 par trooper ayant Commandement (skill 69), maximum 7** (aujourd'hui 3 + n, max 5). La
  description de Commandement (« +1 bataille par jour (+2 max) ») reste vraie et n'est pas modifiée.
- La case « Bataille » du QG affiche 6 ou 7 cases quand l'armée y a droit : `style.css` (vérifié octet pour octet) ne
  prévoit que `.bcount1`…`.bcount5`, donc `.bcount6` et `.bcount7` vont dans `extras.css`, cases aussi lisibles que
  celles de `.bcount5` (58 px) dans la même largeur de case.
- Les journées déjà commencées au moment du déploiement profitent tout de suite du nouveau quota (il est recalculé à
  chaque affichage, rien n'est figé en base).

### Entraînement

- **Accès** (maquette B validée) : un lien « » S'entraîner (illimité) » aligné à droite sur la ligne d'info (`hqtip`)
  de la case Bataille du QG, toujours présent (même quand les combats du jour sont épuisés), absent sur un QG verrouillé
  (armée protégée non identifiée).
- **Page Entraînement** (nouvelle route, ex. `/b/train`), construite comme la page de choix d'adversaire (`/b/opp`,
  `views/opp.ts`) :
  - des adversaires tirés au hasard (même tirage que `pickOpponents`, même nombre `OPPONENT_COUNT`), **nouveau tirage
    à chaque visite**, et un bouton « Autres adversaires » qui retire ;
  - un champ « Nom de l'armée » + bouton pour affronter une armée précise (même résolution que l'attaque ciblée
    existante, `foeByName`) ;
  - l'armée ne peut pas s'affronter elle-même ; une armée inconnue ou vide donne une erreur sur la page, comme `/b/opp`.
- **Combat** : même moteur, même entrée (`battleTroopers` dans l'ordre de déploiement, adversaire entier), joué
  immédiatement, puis affiché dans le **nouveau lecteur** (celui de PR #9) avec un bouton retour vers la page
  Entraînement.
- **Aucun effet** : pas de crédits (donc pas de ×3 du week-end), pas de décompte dans le quota, rien dans le classement,
  les statistiques attaqué/défendu, le biais d'infiltration, ni l'historique de l'adversaire ou de l'attaquant ; aucune
  notification.
- **Conservation** : les **10 derniers** entraînements de chaque armée sont gardés (les plus anciens supprimés à
  l'insertion) pour pouvoir les revoir ou partager le lien ; la page Entraînement liste ces 10 derniers (adversaire,
  victoire/défaite, lien de replay).

## Non-objectifs

- La **recharge** de combats dans la journée (+1 toutes les 1–2 h) : idée gardée, traitée plus tard, une fois le rythme
  à 5–7 combats observé.
- Pas de changement aux missions, raids, récompenses (sauf l'événement week-end, conçu à part :
  `2026-11-24-evenement-weekend-design.md`).
- Pas d'interface mobile spécifique ici (sujet mobile séparé ; la page Entraînement suivra les mêmes règles que les
  autres pages quand il sera fait).

## Anti-objectifs

- Un entraînement qui « compte » quelque part (crédits, quota, classement, historique, infiltration, stats) : c'est la
  raison du stockage séparé.
- Toucher au moteur de combat ou au résultat d'un combat : l'oracle (10 000 combats, zéro divergence) reste valable.
- Modifier `style.css`.
- Un moyen de spammer le serveur : l'entraînement est illimité pour un joueur, mais protégé par la clé de session
  (`chk`) comme les autres actions et par la limitation de débit existante si elle s'applique.

## Approches (stockage des entraînements)

- **A (retenue) : table à part** (`trainings`, migration 009) : id, attacker_id, defender_id (armée réelle) ou référence
  d'adversaire, input, winner, created_at ; purge au-delà de 10 par armée. Isolation garantie : aucune requête existante
  ne la voit.
- **B (écartée) : `kind = 'train'` dans `battles`** : réutilise plus de code de replay, mais 4 requêtes existantes ne
  filtrent pas `kind` (stats attaqué/défendu `repo.ts:749-750`, biais d'infiltration `repo.ts:840`, historique
  `repo.ts:1031`) ; un oubli ferait compter un entraînement.

## Ce qui est décidé avec Killian

- Quota 5 (+2 Commandement, max 7).
- Entraînement illimité, sans gain, accessible par le lien dans la case Bataille (maquette B).
- Possibilité d'affronter une armée précise.
- Recharge : plus tard.
- Validation par **captures d'écran avant tout push** (ordinateur et, quand le mobile sera fait, téléphone).

## Calls de Claude (à vérifier par Killian à la lecture)

- **Branches** : ce travail s'empile sur `evenement-weekend`, elle-même sur `competences-non-acquises` (qui crée
  `extras.css` et son `<link>`). Ordre de fusion : compétences → événement → combats. L'événement n'a pas de migration :
  celle des entraînements est la 009.
- **Liste des 10 derniers** : uniquement les entraînements **lancés** par l'armée (pas ceux où elle était l'adversaire) ;
  purge et index sur `attacker_id`.
- **Pas de nouvelle limite de débit** : aucune n'existe pour les combats aujourd'hui (seulement pour les mots de passe) ;
  l'entraînement est protégé par la clé de session `chk`.

## Laissé au constructeur

- URL exactes des routes (`/b/train`, replay `/b/tview/<id>`…), noms de migration et de fonctions.
- Mise en page fine de la page Entraînement (reprendre `opp.ts` au plus près) et des cases 6/7 — à montrer en captures.
- Les textes exacts (français, ton du jeu), dont l'infobulle du lien et les erreurs.
- Tests : quota (0/1/2/3 Commandants → 5/6/7/7), cases 6/7 rendues, lien présent/absent, entraînement sans effet sur
  crédits/quota/historique/stats/infiltration, purge à 10, combat contre soi refusé, nom inconnu, clé `chk` requise.
