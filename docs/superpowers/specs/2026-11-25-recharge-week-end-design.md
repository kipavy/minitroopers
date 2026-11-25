# Événement du week-end tiré au sort, avec recharge des combats : conception

## Pourquoi

Le week-end a aujourd'hui un seul événement fixe : tous les gains ×3. Killian veut des combats qui se rechargent dans la
journée. Il préfère en faire un **événement**, comme le ×3, plutôt qu'une règle permanente, pour ne pas gonfler
l'économie de la semaine. Pour que chaque week-end soit différent, la formule est **tirée au sort chaque week-end** parmi :
×3 + recharge, recharge seule, ×3 seul.

## Objectifs

- Chaque week-end (samedi et dimanche du jour de jeu, Europe/Paris), une formule tirée au sort, la même pour tous les
  joueurs.
- Pendant un week-end avec recharge : +1 combat toutes les 2 h, dans une réserve de 3 au plus.
- Un affichage au QG qui a l'air natif au jeu d'origine : version F validée par Killian sur captures, le 2026-11-25.

## Hors sujet

- Pas de recharge en semaine.
- Ni commande d'administration ni réglage pour forcer ou désactiver une formule (non demandé).
- Pas de changement :
  - du quota de base : 5, +1 par Commandement, au plus 7 ;
  - des gains de base : 2 crédits pour une victoire, 1 pour une défaite ;
  - du moteur de combat ;
  - des missions et du raid, au-delà du ×3 qu'ils suivent déjà.

## À éviter absolument

- Un cadre qui se voit rajouté : deux images superposées, liseré au milieu, image étirée.
- Des boutons qui ne sont pas les vraies cases du jeu.
- Une ligne qui sort du cadre.
- `style.css` modifié : il reste octet pour octet l'original.
- La moindre différence de pixel sur les pages en dehors d'un week-end avec recharge (`tools/shots --compare`).

## Approches envisagées

- **Recharge permanente** (+1 toutes les 1 à 2 h, tous les jours). Écartée par Killian : trop d'impact sur l'économie.
- **Événement à jour fixe** (par exemple le mercredi). Écarté : Killian préfère le week-end.
- **Le week-end, tiré au sort parmi 3 formules.** Retenu, idée de Killian.
- Accumulation de la recharge :
  - A. Sans limite. Écartée : on joue tout le soir, aucune raison de revenir.
  - **B. Réserve plafonnée à 3. Retenue.**
  - C. Minuteur qui ne démarre qu'une fois le quota épuisé. Écartée : un oubli fait perdre du temps de recharge.
- Affichage (maquettes A à F sur la vraie page) :
  - A : mini-cases dans la ligne d'info, trop serré.
  - B : 3 cases à la place des résultats.
  - C : jauge non cliquable.
  - D : faux boutons arrondis.
  - E : deux cadres superposés.
  - **F, retenue** : voir plus bas.

## Règles

### 1. Tirage de la formule

Ces points sont fixés par Killian, sauf la fonction de hachage, qui est mon choix.

- Un tirage par week-end : la clé est la date du samedi (`AAAA-MM-JJ`), et le dimanche reprend celle de la veille.
- Il est déterministe : `fnv1a(<samedi>) % 3` donne 0 = ×3 + recharge, 1 = recharge seule, 2 = ×3 seul. Rien n'est
  stocké en base, le résultat survit aux redémarrages et il est identique pour tout le monde.
- Si `WEEKEND_MULTIPLIER` vaut 1 (×3 désactivé), le tirage est `% 2` : 0 = recharge, 1 = rien.
- Le multiplicateur de gains (`rewardMultiplier`) ne s'applique que si la formule contient ×3. Il concerne les combats,
  les missions et le raid, comme aujourd'hui. Gains d'un week-end « recharge seule » : ×1.

Tirage des prochains week-ends (FNV-1a 32 bits) :

- 28/11 et 5/12 : recharge seule ;
- 12/12 et 19/12 : ×3 seul ;
- 26/12 et 2/1 : ×3 + recharge.

Killian l'accepte tel quel : pas de ×3 au lancement (2026-11-25).

### 2. Recharge, réserve B

Fixé avec Killian.

- Le quota de base du jour reste inchangé.
- Une **réserve** démarre à 0 à minuit, heure du jeu. Elle gagne +1 combat à chaque recharge, à 02:00, 04:00, … 22:00
  (heure locale du jeu), soit 11 recharges au plus. Elle ne dépasse jamais 3.
- Les combats prennent d'abord sur le quota de base, puis sur la réserve.
- La réserve se remplit même si le quota de base n'est pas épuisé.
- À minuit, la réserve repart à 0 : le dimanche recommence pareil.
- **Rien de nouveau n'est stocké.** Je propose de rejouer chronologiquement les recharges passées (heures ≤ maintenant)
  et les combats comptés du jour, avec leur `created_at` :
  - recharge : `réserve = min(3, réserve + 1)` ;
  - combat : on décompte le quota de base s'il en reste, sinon la réserve.
  - On en tire `quota du jour = combats comptés + base restante + réserve`.
- Les combats d'avant un `reset-day` d'administration ne comptent pas, comme aujourd'hui avec `battlesCounted`.
- Ce quota dépendant de l'heure remplace `battleAllowance` partout où il décide :
  - `fight` (la transaction) ;
  - la redirection de /b/opp vers le QG ;
  - le QG ;
  - `dayOver` et /endDay ;
  - `admin show` / `reset-day`.
- **Fin de journée** : un jour de recharge n'est pas « fini » tant qu'une recharge reste à venir aujourd'hui (avant
  22:00). Quand il n'y a plus de combat disponible, le QG montre le chrono de la prochaine recharge au lieu de renvoyer
  vers /endDay.

### 3. Bandeau du week-end

Le texte est mon choix ; l'apparence est celle du bandeau actuel.

- ×3 + recharge : « Événement du week-end : **×3 [pièce] et combats qui se rechargent toutes les 2 h** ! »
  (texte validé sur les captures).
- Recharge seule : « Événement du week-end : **combats qui se rechargent toutes les 2 h** ! »
- ×3 seul : le texte actuel, sans changement.
- Info-bulle : on y explique la formule, par exemple « +1 bataille toutes les 2 h, jusqu'à 3 en réserve, jusqu'à
  dimanche minuit » pour la recharge.

### 4. Boîte Bataille du QG, version F

Validée par Killian sur captures.

- Les jours de recharge, la boîte a une **seconde rangée de 3 cases**, sous les cases du jour.
- **Cadre d'une seule pièce.** Le bas de la boîte devient une image plus haute de 32 px, `box2bottom-reserve.png`, tirée
  de `box2bottom.png` : la bande camouflage intérieure (lignes 0 à 29) est prolongée en recopiant ses propres lignes.
  - Après la ligne 26, on insère les lignes 25 à 11 en miroir, puis 11 à 26 dans l'ordre : chaque raccord est continu.
  - Pas d'étirement ni de superposition.
  - L'image est générée par un script versionné (`apps/server/scripts/`), comme `gen-og-image.mjs`.
  - La zone `.action` passe de 51 à 83 px.
  - La ligne d'info dépasse le bas de la boîte de **4 px, comme l'original**. C'est mesuré.
- **Cases.** Ce sont les vraies cases du jeu (`.b.bgo2` : images `bgo_left/right/bg`, coins et survol d'origine), larges.
  - 3 cases de 101 px, espacées de 3 px.
  - La rangée est alignée au pixel sur la rangée du jour (de 433 à 742 à 1280 px).
  - Avec 6 ou 7 cases du jour (Commandement) : les 3 cases, toujours espacées de 3 px, couvrent exactement la largeur de
    la rangée du jour, du bord gauche de sa première case au bord droit de sa dernière. C'est mon choix ; c'est mesuré
    comme pour 5 cases.
- **Résultats des combats de réserve** : uniquement dans l'historique (Killian, option a).
  - La rangée du jour garde exactement le quota de base (5 à 7 cases) et n'affiche que les combats de base, c'est-à-dire
    les N premiers combats comptés du jour.
  - Une case de réserve jouée redevient grise, puis se recharge.
  - La vue reçoit donc les combats de base séparés des combats de réserve.
- **Case en recharge.** C'est la même case « GO ! », sans l'image du tank.
  - Sa partie à venir est désaturée (`saturate(.12) brightness(.97)`).
  - La partie colorée avance de gauche à droite selon le temps écoulé depuis la dernière recharge, sur 2 h : c'est une
    barre de progression.
  - Le chrono du jeu (`anim_small_chrono.gif` et `.timer`) est centré par-dessus.
- **États**, mon choix sauf le cas « 2 prêtes et 1 en recharge », validé.
  - Les cases s'affichent dans cet ordre : d'abord autant de « GO ! » que la réserve en contient, puis la case en
    recharge s'il reste une recharge aujourd'hui et que la réserve n'est pas pleine, puis des cases grises (désaturées,
    vides, sans chrono).
  - Réserve pleine (3/3) : 3 « GO ! ».
  - Après 22:00, sans recharge à venir : « GO ! » pour la réserve restante, et des cases grises pour le reste.
- **Ligne d'info**, mon choix sauf « Réserve : 2 batailles sur 3 ! », validé.
  - S'il reste du quota de base : texte actuel, « Il te reste N batailles aujourd'hui ! ». N = quota de base restant
    seulement (mon choix : la réserve se voit dans sa propre rangée).
  - Sinon, avec une réserve : « Réserve : R bataille(s) sur 3 ! ».
  - Sinon, avec une recharge à venir : « Prochaine bataille dans [chrono] ».
  - Sinon : « Tu as terminé tes batailles du jour ! ».
- **Clic.** Un « GO ! » de la réserve mène à /b/opp, comme les autres. Aucun nouveau chemin de combat : on prend sur le
  quota de base, puis sur la réserve.
- **Direct.** Je propose que la barre et le chrono avancent dans le navigateur sans rechargement. À la fin du chrono, la
  case devient un « GO ! » cliquable ; on peut aussi recharger la page. Le moyen technique est laissé au développeur.
- **Mobile et tablette** : même rendu, capture validée à 390 px. Les règles mobiles existantes (`body.mtm`) ne doivent
  pas casser.
- Tout le CSS va dans `extras.css`, et `?v=` est incrémenté.

### 5. Page « Fin de journée » et après un combat

- Après un combat, `endUrl` ne renvoie vers /endDay que si `dayOver` le dit, avec la nouvelle règle. Sinon, on retourne
  au QG.

## Laissé au développeur

- Le découpage des fonctions et leur nom. Je suggère une fonction pure dans `@mt/game` (`weekendEvent(day, multiplier)`,
  `reserveState({ base, battles, now, day, tz })`) et son branchement côté serveur.
- La façon de calculer les heures de recharge en heure locale du jeu, y compris les jours de changement d'heure.
- Le mécanisme de mise à jour en direct.

## Vérification

- Tests unitaires :
  - tirage : déterministe, le même samedi et dimanche, une répartition plausible sur un grand nombre de week-ends,
    `% 2` si le multiplicateur vaut 1 ;
  - réserve : plafond à 3, ordre « base d'abord », recharges passées seulement, remise à minuit, combats d'avant un
    `reset-day` ignorés, pas de recharge en semaine ni un week-end « ×3 seul ».
- Tests serveur :
  - un week-end avec recharge accepte un 6ᵉ combat après une recharge et refuse le combat au-delà ;
  - `dayOver` est faux avant 22:00 ;
  - le QG affiche les 3 cases et le bon texte ;
  - gains ×1 un week-end « recharge seule ».
- Captures 320, 390, 768 et 1280 px du QG dans plusieurs états (réserve 0, 2/3, 3/3, après 22:00), à montrer à Killian
  avant le push.
- `--compare` : pages identiques au pixel près en dehors d'un week-end avec recharge.
- Mesure CDP : la ligne d'info dépasse de 4 px, comme l'original, et la rangée de réserve est alignée sur celle du
  jour.
