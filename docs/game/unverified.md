# Règles non vérifiables (UNVERIFIED)

Chaque valeur choisie faute de source (SWF > pages archivées > wikis > serveur de test > GitLab)
porte un commentaire `// UNVERIFIED: <raison>` dans le code et une entrée ici.

## Moteur (`@mt/engine`, frontière étape 2)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Rééquipement (`/t/<n>?equip=`) | `carryCapacity` équipements gardés tirés par `rand.random(restants)` ×N, le reste en `leftOver` | l'écran de résultat original n'a jamais été capturé | `packages/engine/src/boundary/trooper.ts` `reequip` |
| Capacité d'emport (`carryCapacity`) | `stat17G` du Ghost complet : 3, 2 si le trooper possède la compétence 54 (Débardeur Bruce), même laissée de côté | le SWF ne lit pas `stat17G` en combat ; sur les 7 troopers archivés avec 54 et un leftOver, « Ghost complet » colle à 5 (2 portant 54 avec 2 objets, 3 laissant 54 avec 2 objets ; PADOVA et kicker portent 3), « objets gardés seulement » à 4 ; les 28 autres portent 3 | `packages/engine/src/boundary/trooper.ts` `carryCapacity` |
| Choix des objets gardés par défaut | `selectedItems` d'abord, puis les premiers équipements dans l'ordre des compétences jusqu'à la capacité | règle du serveur original inconnue ; « les N premiers » ne reproduit que 9 des 35 leftOver archivés (dont le cas net de hq-levelup.html) | `packages/engine/src/boundary/trooper.ts` `defaultLeftOver` |
| Plage de `faction` acceptée | 0..5 | plage du SWF inconnue ; 6 factions observées | `packages/engine/src/boundary/validate.ts` |
| Échappement des chaînes `data=` / `endMsg=` pour `'` et `_` | `'` échappé (`%27`), `_` conservé | jamais présents dans les pages archivées (`! * ( )` y sont échappés, `~` aussi : `%257E` dans html/com/b_view_miss1.html) | `packages/engine/src/input/haxeSerializer.ts` `originalUrlEncode` |

## Vérifié depuis

- Options de montée de niveau affichées = les `choiceCount - 1` premières de `drawOptions()` : html/fr/levelup_0.html (le moteur tire [137, 86, 39], la page propose 137 puis 86).
