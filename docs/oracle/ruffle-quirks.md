# Particularités de Ruffle qui touchent l'oracle

Règle du projet : Ruffle fait foi (commit `a111ceec3873b019c79e8554963bfdc8307adcc0`, le même
cœur pour `ruffle_desktop.exe` et `@ruffle-rs/ruffle` 0.2.0-nightly.2025.7.28). Un comportement
de Ruffle qui diffère de Flash Player est reproduit dans le moteur et consigné ici.

Résultat de l'étape 1 : **aucun écart n'a jamais été attribué à un bug de Ruffle** (0 écart sur
10 000 combats, tous les golden viennent de Ruffle). Les points suivants sont des
comportements de Ruffle que le moteur reproduit volontairement, pas des corrections.

## `Array.sort(compareFunction)` : port de qsort d'avmplus

- Le tri de Ruffle (`core/src/avm2/globals/array.rs`, `sort`, `sort_inner`, `qsort`) est un port
  du QuickSort d'avmplus : **non stable**, et avec un comparateur incohérent (qui ne renvoie
  jamais 0, ou non transitif) l'ordre obtenu est celui de cet algorithme précis. Un tri stable
  de JavaScript produit un autre ordre sur plusieurs golden : `packages/engine/src/core/sort.ts`
  (`as3Sort`) transcrit l'algorithme ligne à ligne ; test de non-régression
  `as3Sort reproduces Ruffle's sort on goldens that a stable sort breaks`.
- Le résultat du comparateur est converti en `Number` : `> 0` Greater, `< 0` Less, sinon Equal
  (NaN inclus), **sans troncature en entier** même pour un SWF version 10 (Flash Player tronque
  dans ce cas). Les comparateurs de la logique renvoient tous -1/0/1, donc sans effet réel.
- Le même tri sert à ordonner les clés des objets anonymes dans le format « valeur » de la trace
  (`Array.sort()` sans comparateur : ordre des unités UTF-16).

## Formatage des nombres (`String(n)`)

- Les valeurs `int`/`uint`/`Number` des lignes `EV` sont écrites par `String(n)` tel que Ruffle
  l'implémente ; le moteur reproduit ce format dans `packages/engine/src/msg/hx.ts`
  (`haxeString` / format « valeur »). Aucun écart n'a été observé sur les 10 000 combats.

## Divers (sans conséquence sur les résultats)

- Le renderer `canvas` de Ruffle web est inutilisable (le handler COMPLETE du Main lève une
  erreur) : l'exécuteur utilise le renderer par défaut wgpu-webgl.
- Les `trace()` ne sortent de Ruffle web qu'avec `logLevel: "info"` (via `console.log`).
- Le compteur statique de numérotation des armes n'est pas remis à zéro entre deux combats d'un
  même processus : un combat = une nouvelle page (nouvelle instance wasm).
