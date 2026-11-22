# Règles non vérifiables (UNVERIFIED)

Chaque valeur choisie faute de source (SWF > pages archivées > wikis > serveur de test > GitLab)
porte un commentaire `// UNVERIFIED: <raison>` dans le code et une entrée ici.

## Moteur (`@mt/engine`, frontière étape 2)

| Règle | Valeur choisie | Raison | Code |
|---|---|---|---|
| Options de montée de niveau affichées | les `choiceCount - 1` premières de `drawOptions()` (2, 3 avec Malin) | la page originale montre 2 (3) cases sur 3 (4) tirées ; « les premières » est déduit de la sémantique d'index de `choices` | `packages/engine/src/boundary/trooper.ts` `levelUpOptions` |
| Rééquipement (`/t/<n>?equip=`) | 3 équipements gardés tirés par `rand.random(restants)` ×3, le reste en `leftOver` | l'écran de résultat original n'a jamais été capturé | `packages/engine/src/boundary/trooper.ts` `reequip` |
| Plage de `faction` acceptée | 0..5 | plage du SWF inconnue ; 6 factions observées | `packages/engine/src/boundary/validate.ts` |
| Échappement des chaînes `data=` / `endMsg=` pour `'` et `~` | échappés (`%27`, `%7E`), `_` conservé | jamais présents dans les pages archivées (`! * ( )` y sont bien échappés) | `packages/engine/src/input/haxeSerializer.ts` `originalUrlEncode` |
