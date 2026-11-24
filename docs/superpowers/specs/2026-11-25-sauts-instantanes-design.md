# Sauts instantanés (images clés) et bulle d'aide — conception

## Intention

Killian trouve le lecteur « BEAUCOUP » moins fluide que BetterTrooper : chez eux, avancer ou reculer est instantané.
Il a choisi de faire « comme eux » : des images clés restaurées sur place. Il veut aussi leur bouton « ? » qui ouvre
une bulle d'aide au survol.

## Mesures (Brave natif ARM64, GPU Adreno, médianes, 2026-11-24)

| Action | Nous (combat 16, 400 événements) | BetterTrooper |
|---|---|---|
| Avant vers le début de la vague 3 | 3,5 s | 0,03–0,09 s |
| Arrière, de la fin à la vague 2 | 3,5–4,3 s | 0,24 s |
| Événement −1 (en pause) | 1,1 s | 0,11 s |
| Début | 0,9 s | 0,025 s |
| SWF retéléchargés par saut arrière | 2 | 0 |

Causes :
- Un saut de vague vise le `NewWave` (39), alors que le `CheckPoint` (38) arrive 3–4 entrées plus tard : on repart
  du point de reprise de la vague précédente et on rejoue une vague entière en caché (~23 ms de CPU par événement,
  presque tout dans l'interpréteur AVM2 de Ruffle).
- 5 points de reprise pour 400 événements.
- Un saut arrière recrée tout le lecteur Ruffle (~0,9 s avant même de rejouer).

La lecture normale n'est pas en cause (56–60 i/s des deux côtés sur le même combat).

BetterTrooper : un appel synchrone par saut (`labNavSeek`…), sans rechargement. Une image clé environ tous les
5 événements, plus une à chaque début de vague. La restauration remet les troopers à l'écran, recrée les corps de la
vague (animation de mort figée sur sa dernière image), puis applique les événements restants sans animation.

## Objectifs

1. Tout saut — avant, arrière, vague, événement, début, fin, clic sur la frise ou le journal, `?at=` — prend moins
   de ~150 ms sur la machine de Killian, sans recharger Ruffle ni le SWF.
2. Après un saut, l'écran montre exactement l'état qu'aurait une lecture normale arrivée au même événement :
   position, PV, état (au sol, mort), arme, munitions, casque, véhicule, statuts, corps de la vague, panneaux
   latéraux, bannière de fin seulement à la fin.
3. Bouton « ? » : au survol (et au focus clavier), une bulle « Raccourcis clavier » ancrée au bouton, comme
   BetterTrooper (référence : `scratchpad/work/bt-ref/help-hover.png`). Chaque touche est dessinée comme une touche de
   clavier. Deux colonnes touches / action, lignes alternées, puis une section « Souris » (terrain, frise : clic,
   glisser, Maj+clic ; journal : clic sur une ligne). La bulle se ferme quand la souris sort. `?` et Ctrl+/ la font
   basculer, Échap la ferme.

## Non-objectifs

- Changer la lecture normale ou le rendu.
- Modifier le calcul du combat. Le seul ajout dans l'état 0 est une lecture des troopers (voir Contraintes).

## Anti-objectifs

- Un combat dont le vainqueur affiché change, ou un état d'écran incohérent après un saut (trooper au sol qui se
  relève, mort qui réapparaît, arme ou munitions fausses).
- Un saut plus lent qu'aujourd'hui dans un cas quelconque.

## Contraintes

- Le SWF de l'oracle (`client_fr_trace.swf`, SHA `a4afe044…`) reste identique. Le SWF de jeu reste reproductible.
- Exception encadrée au « jamais l'état 0 » : un appel `mtKf(battle)` après chaque `battle.MnRZ()`, qui ne fait que
  **lire** les troopers (`getInfos()`…), sans aléatoire ni effet de bord. Il est prouvé sans effet par un test : sur
  les combats de référence, l'historique produit par le SWF de jeu (sérialisé entrée par entrée) est identique, à
  l'octet près, aux lignes `EV` de l'oracle.
- L'historique n'est jamais modifié par la lecture : copie de la file à `mtInit`, sauvegarde des tableaux que
  `apply` vide (entrées 41/42) et remise en place avant chaque restauration, copies des infos de l'image clé à chaque
  restauration.

## Conception

Détails et noms obfusqués : rapport de mesures ci-dessus et `docs/research/lecteur-swf.md`.

- **Images clés** : `mtKf(battle)` toutes les K = 4 entrées, plus une à chaque `NewWave`. Contenu :
  - l'index de l'entrée, et `getInfos()` de chaque trooper (côté, données, x/y, armes et munitions, arme courante,
    PV, état dont FALLEN, casque, véhicule) ;
  - en plus : les morts de la vague courante (id, position, côté), les statuts, les positions hors carte, les armes
    au sol si c'est faisable.
  - Coût estimé : 1–1,5 Mo par combat.
- **`mtGoto(n)`** : un seul appel synchrone, dans les deux sens.
  1. Refusé si l'écran de pause natif est ouvert. Prend l'image clé ≤ n, ou continue depuis la position courante si
     elle est plus proche.
  2. Remet à zéro l'étape, les animations, les à-coups, les particules, les tweens, les objets au sol et la fin.
  3. Reconstruit la file : un `CheckPoint` artificiel (infos clonées) puis `mtHist.slice(kf.idx)`.
  4. Remet l'horloge d'affichage et sa valeur haute, applique le point de reprise (reconstruction de la scène),
     puis les corps, statuts, poses au sol et derniers panneaux latéraux.
  5. Rejoue jusqu'à n en caché et en synchrone (≤ ~250 ms, en pratique < 100 ms), réaffiche, envoie `mtProgress`.
- **`mtSeek(n)`** devient un alias de `mtGoto(n)`. La page supprime `recreate()` (plus de saut arrière par
  rechargement).
- **Vérification automatique** : pour des combats de référence, comparer l'état de chaque trooper après `mtGoto(n)` à
  celui d'une lecture directe jusqu'à n (position, PV, état, arme, munitions, casque, véhicule, vivant/mort), pour
  de nombreux n tirés au hasard, en avant et en arrière.

## Laissé au constructeur

K (4 par défaut), plafond synchrone, représentation exacte des statuts et des objets au sol, styles exacts de la
bulle (en reprenant ceux de la référence).
