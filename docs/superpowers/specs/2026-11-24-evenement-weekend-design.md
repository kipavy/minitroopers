# Événement « week-end ×3 » — conception courte

## Intention

Donner un rendez-vous régulier aux joueurs de l'instance (Killian, son frère, les recrues) : chaque week-end, les
gains de combat sont triplés, et une bannière le dit sur toutes les pages, comme le « Server modifier active: 3x
in all battles! » de trooperstest.gued.es. Première amélioration « hors original » de ce type (cf. v1.0.0 = version
fidèle) ; elle reste dans l'esprit MiniTroopers.

## Objectifs

- Samedi et dimanche, **jour de jeu** (fuseau `TZ_GAME`, même découpage que la remise à zéro quotidienne), les crédits
  gagnés sont multipliés par 3 :
  - combats : victoire 2 → 6, défaite 1 → 3 ;
  - missions gagnées : 4 → 12 (une mission perdue reste à 0) ;
  - phases de raid gagnées : 4 → 12.
- Le multiplicateur dépend du **jour du combat** (`day` déjà stocké avec chaque combat), pas de l'heure d'affichage :
  un combat lancé dimanche 23:59 compte ×3.
- Ce qui est montré correspond à ce qui est versé : le « +N » animé du QG (`/hq?money=N`) et les messages de fin
  (« Ton armée gagne +N [T] ») affichent le montant multiplié.
- Bannière en haut du contenu de **toutes** les pages pendant le week-end, au style de la barre de trooperstest
  (fine barre sombre, icône « ? », texte du type « Événement du week-end : ×3 crédits dans tous les combats ! »).
- Réglable par variable d'environnement `WEEKEND_MULTIPLIER` (entier ≥ 1, défaut 3 ; 1 = désactivé, plus de bannière),
  documentée dans `deploy/README.md`, validée par `config.ts` comme les autres.

## Non-objectifs

- Pas d'événements lancés à la main, pas de table en base, pas de commande d'admin (approche B écartée).
- Les primes de recrutement, l'Occupation (+1/jour) et les crédits de départ ne changent pas.
- Pas de changement de quota de combats (sujet séparé, en cours de réflexion).

## Anti-objectifs

- Toucher au moteur de combat ou au résultat d'un combat : seul le montant versé change ; l'oracle reste bit-exact.
- Afficher un montant différent de celui crédité.
- Modifier `style.css` (vérifié octet pour octet) : le style de la bannière va dans `extras.css`.

## Approches

- **A (retenue)** : règle pure calculée à partir de la date du jour de jeu, dans `@mt/game` (ex.
  `rewardMultiplier(day, weekendMultiplier)` à partir de la clé « YYYY-MM-DD »), appliquée là où les récompenses sont
  calculées (`battleReward`, `missionReward`, `RAID_REWARD` dans les routes battle/mission/raid).
- **B (écartée)** : table d'événements + commande d'admin, le week-end étant une entrée récurrente. Plus souple, mais
  personne n'a demandé d'événements manuels.

## Laissé au constructeur

- Comment la bannière connaît le jour courant (horloge `now()` de l'app, injectée en test) : option de `layout`,
  middleware, etc. — au plus simple sans toucher toutes les vues une par une si possible.
- Le texte exact de la bannière et de son infobulle « ? » (en français, ton du jeu).
- Les replays d'anciens combats affichent le montant réellement gagné ce jour-là.
- Tests : la règle (samedi/dimanche/lundi, fuseau, multiplicateur 1), les trois modes crédités ×3 un samedi et ×1 un
  lundi, la bannière présente/absente, la config refusant une valeur invalide.
