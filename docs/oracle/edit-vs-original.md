# `client_fr_edit.swf` (Eternaltwin) vs `client_fr.swf` (original)

Méthode : export JPEXS FFDec 26.5.0 des deux SWF (AS3 et P-code, mêmes options), `diff -r`
des 290 scripts. P-code : 50 fichiers diffèrent octet à octet, 6 après avoir ignoré la
renumérotation `newfunction N` ; ces 6 classes ont été **recompilées depuis l'AS3** par
Eternaltwin (bytecode entièrement réécrit : multinames, slots, `debug`, labels). Les
différences ci-dessous sont celles qui restent au niveau AS3 décompilé, classées à la main.
Aucune autre classe (notamment `logic.Trooper`, `logic.Player`, `LogicWeapon`, `Data`, `Rand`)
n'est modifiée.

Noms : voir `tools/oracle/instrument/README.md` (table des noms obfusqués).

## Verdict

**`client_fr_edit.swf` ne calcule pas les mêmes combats que l'original** : la génération de
l'apparence physique des troopers (`Ghost.§\x07@\x19E§`) a été cassée par la recompilation, ce
qui décale le flux aléatoire de `Ghost` et change, pour une fraction des seeds, les compétences
tirées à la génération. Le reste des modifications touchant le calcul est sémantiquement
neutre (réécritures équivalentes) ou n'a que des effets de bord (ExternalInterface). Cela
confirme la règle « `client_fr_edit.swf` n'est pas une référence » ; l'oracle part de
`client_fr.swf`.

## Détail par classe / méthode

### `logic.Ghost` (`§P!L/\x02§.§9\x19\x02~§`) — génération du trooper depuis sa seed

| Méthode | Changement | Touche le combat ? |
|---|---|---|
| `§\x07@\x19E§()` (apparence physique, appelée en **premier** dans le constructeur, avant la génération des compétences) | Original : 4 tirages `seed` successifs, un par champ (`\x05d9k\x03` = d1 % 4, `u0g/\x02` = d2 % 13, `LKZ\x14` = d3 % 4, `m;3\x17\x01` = d4 % 4). Edit (vérifié dans le P-code) : les 4 tirages sont faits, mais **tous les champs utilisent le dernier** (d4). Puis `switch(physical.\x05d9k\x03)` fait un tirage supplémentaire si la valeur vaut 0 ou 1. | **OUI.** Les champs sont cosmétiques (lus seulement par l'affichage `§^\x05\x01!§.§)J\x0e1\x03§`), mais le nombre de tirages consommés dépend de `d1 % 4` (original) vs `d4 % 4` (edit) : quand l'un est < 2 et pas l'autre, le flux de `Ghost.seed` est décalé d'un cran pour toute la suite (compétence initiale, `levelUp`, armes, véhicule). |
| constructeur | `idx` du tirage de compétence initiale calculé en deux temps (`v = seed*16807 % M; seed = v; idx = (v & 0x3FFFFFFF) % n`) ; `switch` : `default: case 2: case 1:` (vides) réordonnés ; `super()` ajouté. | Non (équivalent). |
| `§\x0ezUR\x02§()` (tirage pondéré sans remise) | Boucle `while(i<n){…; if(miss){throw "ouch"}}; return a;` réécrite en `while(true){ if(i>=n) return a; …; if(miss) break; } throw "ouch";` ; tirage en deux temps comme ci-dessus. | Non (équivalent). |

### `logic.Battle` (`§P!L/\x02§.§\x0b\x0eNO§`)

| Méthode | Changement | Touche le combat ? |
|---|---|---|
| `§Gp3\x13\x03§(winner)` (setWinner, émet le message vainqueur) | Ajout de `ExternalInterface.call("battleResult", graveyard)` puis `ExternalInterface.call("battleResult", winner)` (c'est ce que lit `$GL ruffleSimulator.ts`). | Non (effet de bord uniquement). |
| `MnRZ()` (resolve) | `minTime = int(t.time)` au lieu de `t.time` (champ déjà `int`). | Non. |
| `§\x0fa7P\x03§()` ($GL `_obf_b17f2d5f`) | Boucle `while(true){ if(!(k>0 && list.length>0)) break label; … }` réécrite en `while(k>0 && list.length>0){…}` ; `int()` autour d'un appel qui renvoie déjà `int`. | Non (équivalent). |
| `§hwj]\x02§(square, r)` (décalage aléatoire) | Temporaires supprimés, `int()` retiré autour de `seed = …` avant le `& 0x3FFFFFFF` (le `&` fait déjà `ToInt32`). | Non (même ordre de tirages). |
| `§E\x0f?Q\x03§(…)` | Idem (temporaires, `int()` avant `&`). | Non. |
| `§\x1f2T\x17\x01§()` (événements) | `o.x++` → `o.x = Number(o.x) + 1` ; temporaires supprimés ; `§§push/§§pop` du décompilateur remplacés par l'expression directe. | Non (même ordre d'évaluation et de tirages). |
| `§9\x1cr=\x02§(trigger)` | Temporaire supprimé dans le `switch`. | Non. |
| constructeur | `super()` ajouté. | Non. |

### Hors calcul

| Classe | Changement |
|---|---|
| `Main` `§,7u\x1f§._rsq` | Contrôle `hash(data) == chk` supprimé ; `imageurl` forcé à `http://localhost:4200/assets/img/` ; `endMsg` = `"end"` ; `onclick` forcé ; `ExternalInterface.call("console.log","S T A R T")`. |
| document `§Z(Hf\x02§` (init) | Suppression de `Math.NaN = Number(Number.§j\x1b9\x01§)` (init Haxe ; effet non vérifié, a priori neutre pour le combat) ; chargement des tables `Data` réécrit avec un temporaire (équivalent). |
| `§(\x12\x1c\x01§.§\x12^ \x1e\x01§` (autre mode du client) | `ExternalInterface.call("console.log","clicked")` + `ExternalInterface.call("selectTrooper", id)` au clic. |
| `§(\x12\x1c\x01§.§T$W\x16\x03§` | Recompilée, sans différence AS3 visible. |

## Limites

- Comparaison faite au niveau AS3 décompilé : pour les 6 classes recompilées par Eternaltwin,
  une différence purement bytecode (non visible après décompilation) n'est pas exclue.
- L'écart de `Ghost.§\x07@\x19E§` est établi par lecture du P-code de l'edit ; il n'a pas
  encore été mesuré sur un corpus (ce sera visible en comparant `battleResult` de l'edit aux
  lignes `END` de l'oracle).
