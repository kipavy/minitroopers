# Sitemap

Inventaire des URL utiles sur le site

<details><summary>todo</summary>
`/save` Modifier l'ordre des troopers.
</details>

## Cookie

Les données du cookie de session sont récupérables sous la forme d'un objet sérialisé :

```javascript
var tmp = document.cookie.match(/ssid=([^o]+)(oy\d+.+)$/);
var ssid = tmp[1];
var cookie = Unserializer.unserialize(tmp[2]);
```

### Structure du cookie

```javascript
{
  "opps": [
    2855984,
    3245309,
    2921266,
    2921236,
    2913188
  ],
  "battle": null,
  "key": "5aAEeR",
  "uid": 26762,
  "lastCheck": 1658961106000,
  "notifications": []
}
```

## Mes Troopers

Client SWF listant les unités de l'armée dans une grille, détaillant le personnage et ses principales caractériqtiques (Physique, arme par défaut/préférée, niveau, 3 principaux skills, nom). Cliquer sur une case accède à une page de détails et configuation de l'unité.

### Fiche

 ref. | terme | note 
---|---|---
url | `/t/0` | privé
param | `/t/{id}` | id = n° de l'unité partant de zéro
titre | Fiche de $trooperName *(FR)* | $trooperName's stats sheet *(EN)*

Présente un tableau complet des équipements et compétences (grisé). Celles qui sont acquises sont mises en évidence et un tooltip en affiche le détail au survol de la souris.

#### Config

Formulaire composé de liste déroulantes pour établir les préférences d'usage du trooper. L'enregistrement est automatique au changement d'une des liste.

 ref. | terme | note
---|---|---
method | POST
action | `/t/0?config=jNLXwh` | privé
param | `/t/{id}?config={key}` | id = n° de l'unité partant de zéro ; key (cookie)

- **weapon** -1~? : Arme Préférée *(FR)*, Favourite Weapon *(EN)*
 - *Arme Préférée : Défini l'arme avec laquelle ton trooper commencera à exploser la tronche de ses adversaires*
- **loc** 0~7 : Localisation Favorite *(FR)*, Favourite Target *(EN)* 
 - *Localisation Favorite : Détermine quelle partie du corps de ses adversaires ton trooper aime particulièrement viser*
- **target** 0~3 : Ciblage *(FR)*, Preferred Victim *(EN)*
 - *Ciblage : Détermine quel ennemi ton trooper va cibler en priorité*
- **move** 0~2 : Comportement *(FR)*, Fighting Style *(EN)*
 - *Comportement  : Détermine la façon dont ton trooper va se déplacer au sein du champ de bataille*
- **ttype** -1~7 : Priorité *(FR)*, Priority Target *(EN)*
 - *Priorité : Détermine sur quel métier ton trooper va concentrer ses tirs en priorité*

#### Sous-menu : Améliorer

 ref. | terme | note 
---|---|---
url | `/t/0?levelup=jNLXwh` | privé
param | `/t/{id}?levelup={key}` | id = n° de l'unité partant de zéro ; key (cookie)
redirect | `/levelup/{id}` | Si les fonds sont suffisant pour payer
bouton | Améliorer pour $value *(FR)* | Upgrade for $value *(EN)*

Redirige vers `/levelup/{id}` tant que le choix de skill n'est pas fait.

#### Sous-menu : Renommer

 ref. | terme | note 
---|---|---
action | `$('#rename').show(); $('#name').focus()` | Affiche un formulaire
url | # | privé
bouton | Renommer *(FR)* | Rename *(EN)*
param | `name="name" value="{$trooperName}"` | `maxlength="12"`
param | `name="chk" value="jNLXwh"` | `type="hidden"` ; key (cookie)
submit |  | demande confirmation

Complète le formulaire de config de l'unité par un champs de texte et un vartissement que ce changement de nom d'une unité ne peut être fait qu'une seule fois. Le bouton n'apparait plus au sous-menu par la suite.

#### Sous-menu : Rééquiper

 ref. | terme | note 
---|---|---
url | `/t/1?equip=jNLXwh` | privé
param | `/t/{id}?equip={key}"` | id = n° de l'unité partant de zéro ; key (cookie)
bouton | Rééquiper *(FR)* | Re-equip *(EN)*

**Équipement :** Certaines compétences demandent une place dans l'équipement (sur l'image du trooper, ce sont les 3 cases sur le côté gauche). Lorsque celui-ci est plein, le bouton ré-équiper apparait et vous permets de modifier les bonus que vous voudrez emporter avec vous lors des combats. L'action est gratuite et illimitée, mais il est bon de savoir que vous ne pourrez avoir que 3 équipements au maximum.

##### tooltips

- FR : **Rééquiper** / Change les objets équipés par ton trooper
- EN : **Re-equip** / Change your trooper's equipment

### Levelup

 ref. | terme | note 
---|---|---
url | `/levelup/0` | privé
param | `/levelup/{id}` | id = n° de l'unité partant de zéro
titre | Choisir une compétence *(FR)* | *(EN)*
url | `/levelup/0?skill=115&chk=5aAEeR` | Demande confirmation du choix
param | `/levelup/{id}?skill={skillId}&chk={key}` | skillID = index au tableau (?) ; key (cookie)

### Ajoute un trooper

 ref. | terme | note 
---|---|---
url | `/add` | privé
bouton | icone +
titre | Ajoute un trooper *(FR)* | Add a trooper *(EN)*
redirect | `/hq` | Si l'armée compte déjà 12 unités

##### Info

- FR : Ajoute un nouveau trooper à ton armée !
- EN : Add a new trooper in my army!

##### Formulaire de sélection

Choix entre 5 unités, dont la sélection met à jour un champs caché de formulaire, à la valeur du seed(?) de l'unité cliquée.

 ref. | terme | note 
---|---|---
action | `/add` | privé
method | POST | `onclick="return doRecruit()"`
param | `name="tselect" value="12888706"` | `type="hidden"`

## Menu principal

Boutons en 3 coloris : b1 (vert), b2 (jaune), b3 (bleu)

### Recruter un trooper

 ref. | terme | note 
---|---|---
action | `javascript:_.startRecruit()` | 
url | `/recruit` | Modal, public
bouton | Recruter un trooper *(FR)* | Recruit a trooper *(EN)*
titre | Recruter un ami *(FR)* | Recruit a friend *(EN)*

##### Info

- FR : Demande à tes amis de rejoindre ton armée !
- EN : Ask your friends to join your army!

### Historique

 ref. | terme | note 
---|---|---
url | `/history` | privé
bouton | Historique *(FR)* | History *(EN)*
titre | Historique *(FR)* | History *(EN)*

- Historique des Combats (FR), Combat History (EN)
 - Liste des X dernières agressions (délais ?)
- Historique des Recrues (FR), Recruit History (EN)
 - Liste les 10 dernières recrues
 - Affiche le nombre total des recrues

##### Info

- FR : Historique de tes recrues et batailles ciblées !
- EN : Your recruitment and battle history!

### Gérer mon armée

 ref. | terme | note 
---|---|---
url | `/choice` | privé
bouton | Gérer mon armée *(FR)* | Command my troops *(EN)*
titre | Gérer mon armée *(FR)* | Command my troops *(EN)*

Client SWF permettant de ééorganiser l'armée en mettant en priorité des troopers par rapport à d'autres (glisser).

##### Info

- FR : Change l'ordre de déploiement de tes troopers
- EN : Change the deployment sequence of my troopers

### Protéger mon armée

 ref. | terme | note 
---|---|---
url | `/protect` | public
bouton | Protéger mon armée *(FR)* | Protect my army *(EN)*
titre | Protéger mon armée *(FR)* | Protect my army *(EN)*

Le bouton disparait du menu dés qu'un mot de passe est enregistré. Apparait ensuite discrètement sous forme de lien de bas de page "Modifier mon pass" *(FR)*, "Change my password" *(EN)*.

##### Info

- FR : Protége ton armée avec un mot de passe !
- EN : Protect your army with a password!

##### Formulaire

 ref. | terme | note 
---|---|---
action | `/protect?submit=1`
method | POST
param |  `name="mid"` | `type="hidden"`
param |  `name="pass"` | `type="password"`
param |  `name="newpass"` | `type="password"`
param |  `name="passconf"` | `type="password"`
submit | `value="Valider"` | `onclick="return confirm('Confirmer cette action ?')"`
submit | `value="Annuler"` | `onclick="document.location = '/hq'; return false"`

### Hiérarchie

 ref. | terme | note 
---|---|---
url | `/ranks` | public
bouton | Hiérarchie *(FR)* | Rankings *(EN)*
titre | Hiérarchie *(FR)* | Rankings *(EN)*

Lien vers l'armée de son recuteur, et le classement rassemblant les 10 armées les plus puissantes co-recrues. Si son armée ne figure pas dans les 10 premiers, elle est rajoutée au bas du tableau.

### Quartier Général

 ref. | terme | note 
---|---|---
url | `/hq` | public
get | `/hq?money=2` | Anime l'ajout au compteur de tokens
bouton | Quartier Général *(FR)* | Headquarters *(EN)*
titre | L'armée `(de\|d\'\|du\|de la\|des)?` $name *(FR)* | $name *(EN)*

##### Info

- FR : Retourner à la page de lancement des batailles.
- EN : Go back to battle page.

## Combats

### Bataille

#### Choix entre différents opposants.

 ref. | terme | note 
---|---|---
url | `/b/opp` | privé
titre | L'armée de $

5 propositions d'opposants de différent degrés de puissance, légèrement supérieure, équivalentes et inférieures. D'anciens opposants (choisis ou subis ?) ont des chances d'y paraitres.

#### Choix parmis les opposants proposés

 ref. | terme | note 
---|---|---
url | `/b/battle?opp=3530179;chk=5aAEeR` | privé
param | `/b/battle?opp={nb};chk={key}` | opp = ? ; key (cookie)
redirect | `/b/view/bat{nb}` | nb = 1~5

Sur base d'un n°id (?)

#### Choix ciblé

 ref. | terme | note 
---|---|---
action | `/b/battle` | privé
method | POST
param | `name="friend"` | Entrée texte
param | `name="chk" value="5aAEeR"` | `type="hidden"` ; key (cookie)
redirect | `/b/fview/{battleID}` | battleID != `battle?opp={nb}`

*Infiltre la base d'une armée de ton choix :* (D'après le nom d'une armée.)

#### Scène de bataille (opposant choisi)

 ref. | terme | note 
---|---|---
url | `/b/fview/262575101` | public
param | `/b/fview/{battleID}` | battleID != `battle?opp={nb}`
titre | L'armée de $ VS L'armée de $

Commun pour afficher les scènes de combats du mode *Bataille: Infiltre la base d'une armée de ton choix* ainsi que les agressions listées dans la page Historique.

#### Scène de bataille (opposant proposé)

 ref. | terme | note 
---|---|---
url | `/b/view/bat1` | public
param | `/b/view/bat{nb}` | nb = 1~5 (Selon le nombre de combats disponibles : 3 + 2 bonus)
titre | L'armée de $ VS L'armée de $

Décors possibles : Garden.

### Mission

 ref. | terme | note 
---|---|---
url | `/b/view/miss1` | public
param | `/b/view/miss{nb}` | nb = 1~3
titre | *variable*

- *Mission : Infiltrer* : Infiltrer la base de L'armée de $
- *Mission : Exterminer* : (aucun)
- *Mission : Epique* : (aucun)

### Raid

 ref. | terme | note 
---|---|---
url | `/b/raid?chk=5aAEeR` | privé, déclenche un raid
param | `/b/raid?chk={key}` | key (cookie)
redirection  | `/b/view/raid` | 

 ref. | terme | note 
---|---|---
url | `/b/view/raid` | public
titre | Raid Phase $

### Fin

 ref. | terme | note 
---|---|---
url | `/endDay` | privé
titre | C'est tout pour aujourd'hui ! *(FR)* | *(EN)*

Redirigé sur cette page après le dernier combat disponible pour la journée.

## Recherche

 ref. | terme | note 
---|---|---
action | `/login` | public
method | POST
param | `name="login"`
submit | `value="Chercher"`
redirect | success: `//{login}.minitroopers.fr/hq` | not found: `/` *(Cette armée n'existe pas.)*

Fonction de recherche d'une armée existante.
Fonctionne également en GET: `/login?login=warp`

## Webservice

 ref. | terme | note 
---|---|---
url | `/check?name=Warp` | public
param | `/check?name={str}` | str = nom d'armée souhaité

Retourne en texte brut :

- `free` si ne nom est disponible
- `used` losrque le nom est déjà pris

La valeur retournée est insérée comme classe de l'élément `"host used"`

 ref. | terme | note 
---|---|---
url | `/details?t=0` | public
param | `/details?t={id}` | id = n° de l'unité partant de zéro, peut être un nombre négatif
redirect | not found: `/` | 

Fiche synthétique d'un trooper, liste des skills et flashvars.

 ref. | terme | note 
---|---|---
url | `/load?pos=0;count=16` | privée
param | `/load?pos={index};count={length}` | pagination de la requète

Retourne en texte brut un tableau sérialisé contenant les premières unités de chaque recrues. Ce webservice a vocation dans la page `/choice` à ajouter les recrues dans la liste des unités pour en changer l'ordre d'apparition. Ce dispositif parrait bloqué ou buggé, mais les boutons de pagination sont toujours fonctionnels (visible dont l'effectif en unités + recrue excède 32).

### Log

 ref. | terme | note 
---|---|---
url | `/b/log?b=262576016` | public
param | `/b/log?b={battleID}` | 2 formats possibles

La fonction exacte de ce service n'est pas déterminée.

L'accès direct affiche le mot "OK", sinon une page vide (battleID invalide ou périmé ?).
Le paramètre **battleID** est un nombre lorsqu'il s'agit d'un affrontement en mode Bataille:Infiltrer (Infiltre la base d'une armée de ton choix). De telle sorte que l'url d'accès à la scène suit ce format : `/b/fview/262575101`

Lorsque l'url d'accès à la scène de bataille ne mentionne pas de **battleID** comme c'est le cas dans le mode Raid, Mission, et Bataille avec un adversaire proposé, le format du **battleID** est préfixé du `uid` joint par un arobase `@`. Il peut être récupéré en veillant les requêtes émises pars le client swf, vers `/b/log?b=26762@28953901` lorsque l'on effectue le raccourci clavier `[Ctrl]+[Alt]+[B]`.

Le `uid` est une variable qui figure dans le cookie de session. N'importe quel `uid` semble faire l'affaire, même si certains fonctionnent, d'autres pas. Un `uid` trop élevé provoque un message d'erreur *"zlib.error: Error -5 while decompressing data"*
