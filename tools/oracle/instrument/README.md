# Oracle SWF instrumenté (`assets/oracle/client_fr_trace.swf`)

`client_fr_trace.swf` est `assets/swf/client_fr.swf` (original Motion-Twin, SHA-256
`dfdb6659…4c22`) auquel on a ajouté des `trace()` : chargé avec les flashvars d'un combat,
il imprime les troopers générés, tout `Battle.history` dès que le calcul est terminé
(avant toute animation), le vainqueur, puis `MTDONE`. Aucune logique de combat n'est
recompilée ni modifiée (voir « Innocuité »).

- Source du patch (notre code uniquement) : `patch-msg.as`
- Construction : `build.ps1`
- Résultat : `assets/oracle/client_fr_trace.swf` + `client_fr_trace.swf.sha256`
  (`a4afe044c3707993f7d49c7afe4fc6319a8c1012fd3e1fd563cd2b6eb9c1b08c`, build reproductible :
  deux builds dans deux dossiers de travail donnent le même SHA-256).

Le code décompilé de Motion-Twin n'est jamais écrit dans le dépôt : `build.ps1` travaille dans
`..\minitroopers-work\oracle-build` (à côté du worktree), paramètre `-WorkDir`.

## Outils (portables, rien d'installé)

Tout vit dans `tools/bin/` (ignoré par git) ; supprimer `tools/bin/` suffit à tout enlever.

| Outil | Emplacement | Version | Source | SHA-256 de l'archive |
|---|---|---|---|---|
| JDK (x64) | `tools/bin/jdk/` | Microsoft Build of OpenJDK 21.0.13.1+2, windows-x64 | `https://aka.ms/download-jdk/microsoft-jdk-21.0.13.1-windows-x64.zip` (→ `download.visualstudio.microsoft.com/…/microsoft-jdk-21.0.13.1-windows-x64.zip`) | `071c10e8e7fa62cfef83137b152f5f40e37012dd48e4d5586c5125667cf0b8de` (= `.sha256sum.txt` publié) |
| JPEXS FFDec | `tools/bin/ffdec/` | 26.5.0 (zip, pas l'installeur) | `https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.5.0/ffdec_26.5.0.zip` | `8d00c2713a724bb3f7e6c9a64994836ce3a953b5ac264f405d98f92e7c266d33` |
| Ruffle desktop | `tools/bin/ruffle/ruffle_desktop.exe` | `Ruffle 0.1.0-local (a111ceec3873b019c79e8554963bfdc8307adcc0 2025-07-27)`, build Windows x64 | copie de `$GL apps/server/src/bin/ruffle_desktop.exe` ($GL `b06792e5`) | `585af1c75c1171c0352d900fbd4f490ef9660ce073aa18e99d4f6321dbc97a5d` (exe) |

Remise en place :

```sh
# JDK
curl -L -o jdk.zip https://aka.ms/download-jdk/microsoft-jdk-21.0.13.1-windows-x64.zip
sha256sum jdk.zip   # 071c10e8…b8de
unzip jdk.zip -d tmp && mv tmp/jdk-21.0.13.1+2 tools/bin/jdk
# FFDec
curl -L -o ffdec.zip https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.5.0/ffdec_26.5.0.zip
sha256sum ffdec.zip # 8d00c271…6d33
unzip ffdec.zip -d tools/bin/ffdec
# Ruffle
mkdir -p tools/bin/ruffle && cp "$GL/apps/server/src/bin/ruffle_desktop.exe" tools/bin/ruffle/
```

Pourquoi un JDK **x64** sur une machine ARM64 : FFDec 26.5.0 embarque JNA 3.5.1, qui n'a de
bibliothèque native que pour `win32-x86`/`win32-amd64`. Avec un JVM aarch64, `Main.initJna`
ouvre une boîte de dialogue modale et la CLI reste bloquée indéfiniment (même pour `-help`).
Le JVM x64 tourne sous l'émulation x64 de Windows ARM64.

Empreinte hors dépôt :
- FFDec écrit ses logs sous `%APPDATA%\JPEXS\FFDec\logs` ; `build.ps1` redirige `APPDATA`
  vers `tools/bin/ffdec-home` **pour le seul processus FFDec** (variable restaurée ensuite).
- Ruffle écrit sa config/son cache (dont la DLL OpenH264 téléchargée) sous
  `%LOCALAPPDATA%\ruffle` par défaut ; toujours lui passer `--config tools/bin/ruffle-home
  --cache-directory tools/bin/ruffle-home/cache`.

## Construire

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/oracle/instrument/build.ps1 [-Verify] [-WorkDir <dir>]
```

1. vérifie le SHA-256 de `client_fr.swf` contre `assets/swf/SHA256SUMS` ;
2. décompile (AS3 avec `showMethodBodyId=true`, et P-code) dans `-WorkDir` ;
3. insère les sections `PC_*` de `patch-msg.as` dans le **P-code** de trois méthodes
   originales et remplace ces trois corps (`ffdec -replace <script> <pcode> <methodBodyIndex>`) ;
   l'index de corps est relu dans l'export AS3, chaque motif `PC_*_FIND` doit apparaître
   exactement une fois dans la méthode, sinon échec ;
4. ajoute les fonctions de la section `HELPERS` comme méthodes statiques de `§(m]a\x02§`,
   classe vide et jamais référencée du SWF original, et recompile **cette seule classe** depuis
   l'AS3 (`ffdec -importScript`) ;
5. écrit le SWF et son `.sha256`. `-Verify` exporte le P-code du résultat et liste les fichiers
   dont le P-code diffère de l'original (en ignorant la renumérotation `newfunction N`).

Pourquoi pas d'édition AS3 directe des classes originales : la recompilation AS3 de
`Trooper` échoue (`Compiling §§goto is not available`), et recompiler `Game` réussit mais
réécrit tout son bytecode (≈6 500 lignes de P-code différentes). L'édition P-code ciblée
garantit que seules les instructions insérées changent. `-importScript` ne sait pas ajouter
une nouvelle classe, d'où l'hébergement des helpers dans la classe vide `§(m]a\x02§`.

## Noms obfusqués réels (client_fr.swf)

FFDec affiche les identifiants entre `§…§` avec des échappements `\xNN` ; certains contiennent
en plus un caractère U+007F brut, noté `{DEL}` dans `patch-msg.as` et `build.ps1`.

| Rôle ($GL `flash-port`) | Nom obfusqué | Fichier d'export |
|---|---|---|
| `Main` (flashvars, `chk`, charge le gfx, crée le Game) | `§,7u\x1f§` ; `_rsq()` ; handler COMPLETE `§\x074\x10\r§` | `scripts/§,7u%5Cx1f§.as` |
| `Game` (possède le Battle) | `§Q\btf§` ; champ battle `§S\rNK\x02§` ; ENTER_FRAME `§&l\f[\x01§` | `scripts/§Q%5Cbtf§.as` |
| hôte des helpers (classe vide) | `§(m]a\x02§` | `scripts/§(m]a%5Cx02§.as` |
| package `logic` | `§P!L/\x02§` | `scripts/§P!L%2F%5Cx02§/` |
| `logic.Battle` | `§\x0b\x0eNO§` | `…/§%5Cx0b%5Cx0eNO§.as` |
| `Battle.resolve()` (→ `true` = fini) | `MnRZ()` | |
| `Battle.msg(BattleMsg, ?tid)` | `§SV\x1d\x01§` | |
| `Battle.history` / `btime` / `winner` / `graveyard` / `troopers` / `hero` / `seed` | `§7\x13JZ\x03§` / `§U-\x19i\x03§` / `§\x1e1\\J\x01§` / `§8X}L\x01§` / `` §`1\x1f*\x02§ `` / `§'5'T§` / `§\fA2c§` | |
| `Battle.setWinner` ($GL `Battle.ts:127`, émet le message vainqueur) | `§Gp3\x13\x03§` | |
| clés d'une entrée `history` `type` / `time` / `tid` | `"An%6"` / `"uN\x0ed"` / `"\x1e,d\x01"` | |
| `logic.Ent` (`getId()`, `side`, `life`, `time`) | `§\x15)\x01\x02§` (`§(m\x0fl\x01§()`, `§9\x118u§`, `§\x12?g-§`, `§uN\x0ed§`) | |
| `logic.Trooper` | `§59=F\x03§` | `…/§59=F%5Cx03§.as` |
| `Trooper.init(Battle)` (fin de génération) | `§(\x07\x184§` (corps n° 1521) | |
| `Trooper.ghost` / `weapons` / `weap` / `vehicule`(enum) / `helmet` / `leader` | `§we\f=\x03§` / `§\x1dI\x02\r\x03§` / `§5\tmF§` / `` §K(m`\x01§ `` / `§(\x1f\x15F\x01§` / `§\x1c(h7\x03§` | |
| `logic.Ghost` (génération depuis la seed) ; `skills` / `lvl` | `§9\x19\x02~§` ; `§0\x06@F\x03§` / `§\n@?\x01§` | `…/§9%5Cx19%5Cx02~§.as` |
| `logic.Square` (`x`, `y`) | `§\r\x07 \x05\x01§` (`§v\x01§`, `§l\x01§`) | |
| `LogicWeapon` (`data`, munitions, réserve, drapeau `_obf_75b4f881`) | `§&Z\x01H§` (`§5E[\x1d§`, `§+8\x19{DEL}§`, `§\x1ap\x04f§`, `§\x0fV8\x16\x02§`) | |
| enum `BattleMsg` | `§|\x10i \x02§` | `scripts/§%7C%5Cx10i %5Cx02§.as` |
| champs d'une valeur d'enum Haxe `tag` / `index` / `params` | `§\x14s\x1e\x01§` / `§)-Z\x19\x01§` / `§7\x02@d\x02§` (+ `__enum__ = true`) | |

## Le patch

| Point | Où | Effet |
|---|---|---|
| `PC_TROOPER` | dernière instruction de `Trooper.init` | `§(m]a\x02§.mtTrp(this)` → une ligne `TRP` par trooper, au moment où il vient d'être initialisé (déploiement initial **et** troopers apparus en cours de combat) |
| `PC_GAME` | handler ENTER_FRAME du Game, étape 0, juste après `if (battle.resolve()) { history = battle.history; step = … }` | `§(m]a\x02§.mtDump(battle)` → toutes les lignes `EV`, puis `END`, puis `MTDONE`, avant toute animation |
| `PC_MAIN` | `Main._rsq` : `if (hash(data) != chk) return;` | devient `if (hash(data) != chk && chk != null) return;` : le hash est toujours calculé, mais l'oracle tourne sans flashvar `chk` (le hash est un algorithme maison exécuté par un interpréteur embarqué ; Eternaltwin a supprimé ce contrôle dans `client_fr_edit.swf`). Aucun effet sur le combat. |
| `HELPERS` | classe `§(m]a\x02§` | `mtEsc`, `mtStr`, `mtTrp`, `mtDump` |

## Format des lignes (figé)

Une ligne par `trace()` :

```
TRP <id>|<side>|<life>|<time>|<lvl>|<skills>|<weapons>|<weapIdx>|<vehicle>|<helmet>|<leader>
EV <time>|<tid>|<type>
END <winner>|<graveyard>
MTDONE
```

- `TRP` (fin de `Trooper.init`) — **uniquement pour les troopers effectivement déployés**, dans
  l'ordre de déploiement (déploiement initial puis apparitions en cours de combat) ; un trooper
  jamais déployé (combat terminé avant son tour, par ex. 12 contre 1) n'a **pas** de ligne `TRP` :
  - `id` = `getId()` (= `data.id`), `side` = 0/1 ;
  - `life` = vie après init (= `getLifeMax()`), `time` = initiative après init (tirage
    `bat.seed % 40`, véhicule, ON_POINT/SPY inclus), `lvl` = `ghost.lvl` ;
  - `skills` = chaque valeur de `ghost.skills` au format valeur ci-dessous (donc l'index de
    l'enum `Skill`), **dans l'ordre du tableau** (non trié : l'ordre conditionne `init`),
    séparés par `,` ;
  - `weapons` = pour chaque `LogicWeapon` de `trooper.weapons`, dans l'ordre :
    `<index enum Weapon>:<munitions chargées>:<réserve>:<drapeau 0|1>` (munitions = tirage
    `1 + seed % chargeur` de `LogicWeapon.init`, réserve = reste ; `-1` pour les poings ;
    drapeau = `§\x0fV8\x16\x02§`, $GL `_obf_75b4f881`, posé par la boucle aléatoire de `init`),
    séparés par `,` ;
  - `weapIdx` = index de l'arme courante (`weap`) dans `weapons` (`-1` si aucune) ;
  - `vehicle` = valeur de l'enum véhicule `` §K(m`\x01§ `` (index) ou `-` ;
  - `helmet`, `leader` = `0`/`1`.
- `EV` : une ligne par entrée de `Battle.history`, dans l'ordre, `time`/`tid`/`type` au
  format valeur (`tid` vaut `null` quand aucun héros n'est actif).
  Les lignes sont imprimées en bloc une fois `resolve()` terminé : chaque valeur est donc
  dans son **état final, après résolution complète du combat** (un argument mutable — objet,
  tableau — partagé avec l'état du combat montre l'état de fin de combat, pas celui du moment
  où l'entrée a été ajoutée à `history`).
- `END` : `winner` au format valeur (`0`/`1`, ou `null` si le combat s'arrête par
  `btime > 50000`) ; `graveyard` = ids au format valeur séparés par `,` (vide si aucun mort).
- `MTDONE` : fin de trace ; le processus Ruffle continue (animation) et doit être tué.

Format « valeur » (`mtStr`), à reproduire à l'identique côté TS :

| Valeur AS3 | Sortie |
|---|---|
| `null` / `undefined` | `null` |
| `Boolean` | `true` / `false` |
| `int` / `uint` / `Number` | `String(n)` AS3 (tel que Ruffle l'implémente) |
| `String` | `"` + échappé + `"` |
| `Array` | `[v1,v2,…]` |
| instance de `logic.Ent` (Trooper…) | `T<getId()>` |
| instance de `logic.Square` | `Q<x>:<y>` |
| valeur d'enum Haxe sans paramètre | `<index>` |
| valeur d'enum Haxe avec paramètres | `<index>(<p1>,<p2>,…)` |
| objet anonyme (`getQualifiedClassName == "Object"`) | `{<clé>=<valeur>;…}`, clés triées par `Array.sort()` AS3 (ordre des unités UTF-16), clés échappées |
| `Function` | `<fn>` |
| autre instance de classe | `<` + nom de classe qualifié échappé + `>` (non rencontré à ce jour) |
| profondeur > 16 | `<deep>` |

Échappement (`mtEsc`) : tout caractère de code < 0x20 ou > 0x7E, et chacun de
`\ " | ; = , { } [ ] ( ) < >`, devient `\uXXXX` (4 chiffres hexadécimaux minuscules) ; le reste
est copié tel quel. Une ligne ne contient donc jamais de saut de ligne ni de `|` hors séparateurs.

Pourquoi pas `Std.string` : la valeur d'enum Haxe compilée en AS3 imprime son `tag`, c'est-à-dire
le nom obfusqué du constructeur, plein de caractères de contrôle (par ex. `` "\x0b`\\0\x03" ``) ;
l'index est stable et lisible. Les objets anonymes gardent leurs clés obfusquées (échappées),
par exemple `{\u0005\u000b\u007f\u0001=4;Se3Z=1;VkD\u0001=0;WJb\u0001=0}` : le moteur TS devra
produire les mêmes clés (table de correspondance à tenir côté TS).

## Exécuter (smoke run)

```sh
FV=$(node -e '…decodeURIComponent(toFlashvars(input, "file:///C:/…/assets/swf/army.swf"))')
tools/bin/ruffle/ruffle_desktop.exe assets/oracle/client_fr_trace.swf -P "$FV" \
  --dummy-external-interface --storage memory --filesystem-access-mode allow \
  --config tools/bin/ruffle-home --cache-directory tools/bin/ruffle-home/cache
```

- Les `trace()` sortent sur **stdout** dans le log de Ruffle : `<horodatage>  INFO avm_trace: <ligne>`
  (avec codes couleur ANSI) ; extraire avec `sed 's/\x1b\[[0-9;]*m//g' | grep avm_trace | sed 's/.*avm_trace: //'`.
- `-P` reçoit `toFlashvars(...)` **décodé une fois** (`decodeURIComponent`), comme le fait $GL.
- **Le gfx doit être joignable** : le `Game` (donc le `Battle`) n'est construit que dans le
  handler `COMPLETE` du chargement de `gfx` (`army.swf`). Sans gfx, aucune ligne n'est émise.
  Un `file:///…/assets/swf/army.swf` fonctionne, à condition de passer
  `--filesystem-access-mode allow` (sinon Ruffle demande l'autorisation dans sa fenêtre et
  le chargement reste bloqué silencieusement). `http://localhost:4200/…` sans serveur échoue
  (`InvalidDomain`).
- `--dummy-external-interface` est nécessaire (le Game appelle `ExternalInterface.addCallback`).
- `imageurl` absent → l'image de fond `nullbg/garden.jpg` échoue à charger : sans effet sur le calcul.
- Ruffle ouvre une fenêtre ; le processus ne se termine pas seul.
- Le compteur statique d'armes (`LogicWeapon.§\x02XD\x01§`, qui numérote `wid`) n'est pas remis
  à zéro entre deux combats d'un même processus : un combat par processus Ruffle.

Smoke run (fixture 1v1 de `packages/engine/test/input/flashvars.test.ts`, gfx en `file:///`) :
37 lignes, identiques sur deux exécutions ; extrait :

```
TRP 0|0|10|12|0|13,128|0:1:-1:0,6:1:3:0|1|-|0|1
TRP 1|1|10|19|0|8,24|0:1:-1:0,1:3:1:0,17:1:1:0|1|-|0|1
EV 0|null|40(0,{\u0005\u000b\u007f\u0001=4;Se3Z=1;VkD\u0001=0;WJb\u0001=0})
…
EV 12|0|11(3,2)
EV 19|1|11(11,2)
EV 204|0|11(6,2)
EV 211|1|2(0)
…
EV 860|1|34(1)
END 1|0
MTDONE
```

(`client_fr_edit.swf` sur les mêmes flashvars rapporte `battleResult` = graveyard `[0]`,
résultat `1` : cohérent avec `END 1|0`.)

## Exécuteur (`tools/oracle/src/runner.ts`) — voie retenue : Ruffle web + Chromium headless

Voie principale retenue (et seule utilisée) : **Ruffle web** dans **Chromium headless** piloté par
Playwright. `ruffle_desktop.exe` (repli) ouvre une fenêtre visible par combat ; il n'est pas utilisé.

- `@ruffle-rs/ruffle` **0.2.0-nightly.2025.7.28** (figé, devDependency de `@mt/oracle`) : son
  `commitHash` est `a111ceec3873b019c79e8554963bfdc8307adcc0`, **le même commit** que
  `tools/bin/ruffle/ruffle_desktop.exe` — web et desktop exécutent le même cœur Ruffle.
- `playwright` **1.65.1** (figé) ; navigateur = Chrome Headless Shell 159.0.8154.6 (build
  `chromium_headless_shell-1255`, win64, tourne sous émulation x64), installé **uniquement** dans
  `tools/bin/ms-playwright` :
  ```sh
  PLAYWRIGHT_BROWSERS_PATH=tools/bin/ms-playwright npx playwright install --only-shell chromium
  ```
  `runner.ts` fixe `PLAYWRIGHT_BROWSERS_PATH` pour son seul processus (jamais globalement) et
  lance Chromium avec un profil explicite `tools/bin/tmp/chromium-*`, supprimé à la fermeture
  (au lieu du `%TEMP%playwright_chromiumdev_profile-*` par défaut de Playwright). Pendant le
  lancement, `TEMP`/`TMP` pointent aussi vers `tools/bin/tmp` (Playwright y crée son
  `playwright-artifacts-*`, Chromium hérite de `TEMP`), puis sont restaurés.
- Un petit serveur `node:http` (127.0.0.1, port libre) sert la page, Ruffle, le SWF et
  `army.swf` (le `gfx` des flashvars pointe dessus : même origine, aucun accès fichier). Réponses
  `cache-control: no-store` : avec le cache HTTP, des pages parallèles se disputent l'écriture du
  `.wasm` (`ERR_CACHE_WRITE_FAILURE`, « Failed to load Ruffle WASM »).
- **Traces** : Ruffle web envoie `trace()` à `log::info!` (`web/src/log_adapter.rs`), qui n'est
  imprimé que si `logLevel` ≥ `"info"` (défaut `"error"` : rien ne sort). Avec `logLevel: "info"`,
  chaque trace devient `console.log("%cINFO%c web/src/log_adapter.rs:<n>%c <ligne>", css…)`. La page
  remplace `console.log` pour capturer ces lignes en mémoire (sans trafic CDP) ; Node attend
  `MTDONE` (sondage 50 ms, délai max 30 s, sinon `OracleTimeoutError`), puis ne garde que les
  lignes `TRP `/`EV `/`END `/`MTDONE`.
- Flashvars : `parameters: { data: decodeURIComponent(<toFlashvars sans "data=">) }`.
- Un combat = une **nouvelle page** (nouvelle instance wasm, statiques AVM neuves — cf. compteur
  d'armes ci-dessus) ; un seul Chromium et un seul contexte pour tous les combats.
- Renderer : wgpu-webgl par défaut. Le renderer `canvas` est **inutilisable** : le handler
  COMPLETE de Main lève une erreur et aucun combat n'est construit.
- `client_fr_edit.swf` (sanity check) : `ExternalInterface.call("battleResult", graveyard)` puis
  `("battleResult", vainqueur)` ; la page définit `window.battleResult` pour les capter.

Capture : `npm run oracle:capture -- --tag <tag|all> [--count n] [--seed s] [--jobs 4]` →
`tools/oracle/golden/<tag>/<NNNNN>.json.gz` (JSON `OracleTrace` gzip, NNNNN = index dans le corpus).
Reprise : fichiers existants sautés ; `meta.json` fige la graine **et la version du corpus**
(entrée du tag dans `CORPUS_VERSIONS` : 2, `vehicles` 4, tags de la tâche 8 : 1) : un dossier d'une autre version est refusé (le supprimer
pour recapturer). Écriture atomique (`.tmp` puis renommage). Échecs et délais dépassés (après
une seconde tentative) : `<tag>/capture-failures.jsonl`, jamais ignorés.

Corpus (`src/corpus.ts`) : `basic` (niveau 1, 1–6 par côté), `levels` (1–30, choix
0/1 aléatoires), `forced-skill` (chaque compétence forcée via `force` sur un trooper **seul de
son côté** — déployé en premier — contre 1–3 adversaires, **3 graines de combat par compétence**,
puis 9 combats « plus de 3 équipements » : 4–6 équipements forcés, les 3 premiers dans
`selectedItems`, le reste dans `pref.leftOver` comme `getLeftOver` de $GL), `vehicles`
(1–2 troopers niveau 15–30 forcés `[PILOT, compétence véhicule]`, déployés en premier, puis 1–3
compagnons aléatoires du même côté — un côté fait d'avions seuls perd avant toute frappe —, les 5
véhicules en rotation, HEAVY_TANK deux fois plus souvent ;
le véhicule est tiré à chaque combat sur la graine du combat, PILOT ne fait qu'augmenter la
probabilité ; **et** `Player.deploy` l'annule si aucune case de déploiement n'est assez grande :
la taille d'une case = plus grande empreinte `Battle.SIZE` qui tient dans les cases de
déploiement marquées, HEAVY_TANK = `SIZE[2]`, un bloc 3×2 ; les cases de déploiement sont les
`dep` premières de `Data._obf_1afae07b` = [2,1,3,7,6,8,12,11,…] (YMAX = 5), donc un 3×2 exige
`dep` ≥ 8 ; `dep` = 4 + 1 par trooper du côté ayant SCOUT sans être aussi Comms/Saboteur. D'où,
dans les combats HEAVY_TANK, 5 compagnons forcés `[SCOUT]` du côté du char (dep = 9)), `specialists` (les 8 spécialisations forcées en rotation, une fois sur deux avec
une compétence qu'elle débloque), `large` (20–32 par côté), `rats`, `edge`, puis les tags ciblés de la
tâche 8 (mécaniques rares) : `comms` (côté 0 : 2–3 Comms Officers niveau 22–30, une fois sur deux
+ RADIO, + 2–8 autres ; côté 1 : 6–16 troopers sans comms forcés, dans un combat sur deux la moitié
forcés SCOUT pour peupler le terrain — les ordres dépendent de l'écart de Communications et du
rapport des effectifs), `martyr-saviour` (4–10 par côté, sur chaque côté 2 MARTYR et 2
`[DOCTOR, SAVIOUR]` niveau 7–30), `jet` (1–2 `[PILOT, FIGHTER_JET]` niveau 15–30 + 4–10 compagnons
niveau 15–30, contre 4–10 : combats longs), `sabotage` (1–3 SABOTEUR niveau 10–30 + 0–4, contre
1–8 troopers niveau 7–30), `helicopter` (2–3 `[PILOT, HELICOPTER]` niveau 15–30 + 1–2, contre
20–32 troopers niveau 1–5 forcés fusil à pompe ou couteau, qui ne peuvent viser un hélicoptère :
l'hélicoptère vide son arme puis s'en va, `Leave(side, false)`).

Avion de chasse (compétence 40, `Vehicule` index 7) : `Trooper.init` ne crée pas de véhicule
pour l'index 7, et `Player` retire ce trooper de sa réserve avant tout déploiement (il n'a donc
**jamais** de ligne `TRP`) pour programmer un événement de combat qui bombarde périodiquement :
sa présence se lit uniquement aux lignes `EV …|21(<side>,<x>,<y>,<impacts>)` (constructeur 21
de `BattleMsg`).

`pref.leftOver` : liste d'index `Skill` retirés du trooper à sa génération (le SWF fait
`skills.remove` pour chaque entrée) ; sérialisé en valeurs d'enum `Skill`. `selectedItems` n'est
jamais lu par le SWF (envoyé pour rester identique à $GL, qui envoie toujours `leftOver: []`).

Couverture : `npm run oracle:coverage [-- --dir <dossier>]` lit les golden et affiche, par tag,
combats / `winner=null` / lignes TRP vs troopers d'entrée / combats avec frappe d'avion /
histogramme du champ `vehicle` des TRP ; l'histogramme des types `EV` ; pour `forced-skill`, si
le trooper forcé a une ligne `TRP` (liste explicite des compétences jamais déployées) ; pour
`vehicles`, le véhicule obtenu par compétence ; pour `leftOver`, qu'aucune compétence retirée
ne figure dans la ligne TRP. Code de sortie ≠ 0 (`COVERAGE GAP: …`) si MOTO, LIGHT_TANK,
HELICOPTER ou HEAVY_TANK n'apparaît dans aucune ligne TRP, si aucune frappe d'avion (`EV` 21)
n'existe, ou si un `leftOver` n'est pas respecté.

Couverture par déclenchement (`src/mechanics.ts`, tâche 8) : la même commande compte ensuite, sur
tous les golden, chaque mécanique qui s'est **réellement produite**, avec les tags où elle apparaît,
et sort en erreur si l'une d'elles a eu moins de 3 occurrences (`MIN_FIRES`). Liste : chaque cas de
`useSuper` (21 compétences), interception de grenade, apparition d'un clown, les 6 ordres Comms (comptés en
**marques** dans la trace, pas en ordres : voir ci-dessous),
Propagande, Martyr, Vendetta, Frénésie, frappe d'avion, chaque véhicule déployé, démontage,
hélicoptère qui part, retraite, sabotage (drapeau d'arme TRP et valeur de `PlayerStatus`), chaque
statut (cécité, poison, amphétamine, paralysie, malédiction, verrouillage), `winner=null`, chaque
constructeur `BattleMsg` et `HitEvent`.

- Lecture depuis la trace : les lignes `EV` sont relues dans le format « valeur » (`parseValue`) ;
  les `HitEvent` sont lus dans le tableau `events` (clé obfusquée) de chaque résultat de coup, à
  toute profondeur. Le premier paramètre (`Skill`) de `Skill`(16)/`Grenade`(14) identifie le cas de
  `useSuper` ; `Rescue`(19) = SAVIOUR, `Brawl`(9) sans arme = FACEBOOT, `Wrestle`(18) = WRESTLER ;
  `Grenade` avec un 5ᵉ paramètre = interception ; `Announce(Com(c))` (20(1(c))) = une marque de
  l'ordre c — un ordre en émet une par trooper concerné (Commando : chaque trooper du groupe,
  Renfort : chaque déployé, Retraite : chaque partant ; Objectif solo et Propagande : une seule) —,
  et `StatusOn(LOCKED)` = ordre « cible repérée » (seule source de LOCKED, une marque par ordre).
- Martyr, Vendetta et Frénésie ne laissent que des `Boost(0)`, émis aussi ailleurs : ils sont
  comptés en **rejouant** l'entrée du golden dans le moteur, avec des observateurs posés depuis
  `tools/` sur `Battle.prototype.runTrigger` et `Trooper.prototype.boost` (aucune ligne du moteur
  modifiée ; les observateurs appellent l'original et ne lisent que des champs). Le rejeu doit
  reproduire le golden à l'identique, sinon `COVERAGE GAP`.
- Jamais émis (preuve par le décompilé) : `Battle.msg` n'est appelé que depuis le paquetage
  `logic` (`§P!L/\x02§`), qui ne référence jamais les constructeurs `BattleMsg` 0, 15, 31, 33, 37,
  42 ni `HitEvent` 0 (leurs noms obfusqués n'apparaissent que dans les classes d'affichage).
- `winner=null` : non atteint, hors barrière (toujours affiché « UNREACHED »). Argument (revue de la
  tâche 8) : aucune entrée valide ne garde `btime` > 50 000 sans vainqueur. L'armure retire au plus 3
  et seulement sur la zone correspondante (gilet : torse/ventre, cagoule : tête, armure lourde : 1),
  donc les poings infligent encore 1 sur les membres ; les véhicules partent ou démontent quand ils
  sont vides ou inactifs ; les blocages du redéploiement sont passagers (OCCUPATION : 10 % par
  `newWave`, 3 utilisations ; REVERSE_ATTACK ne vaut que pour un déploiement, car `deploy()` remet
  `depBonus` à 0 et `sendStatus` recalcule `dep`). Le seul blocage durable serait ≥ `dep` clowns du
  côté posés exactement sur les premières cases de `DEPLOY_ORDER` (`player.ts` 396–447) à la fin
  d'une vague. Recherches : `btime` max 6 627 sur 80 000 combats aléatoires (tâche 8), 13 706 dans
  celles de la revue ; aucun `winner=null`.
- `BattleMsg` 41 `Positions` : rare mais atteint, dans la barrière. Les trois méthodes de `Battle`
  qui l'émettent n'ont aucun appelant ; les émetteurs vivants sont `Trooper.play` en visée (cas AIM)
  avec `weap.target == null` et `LogicWeapon.fire` sans cible. Chemin : B (TUCK_AND_ROLL) est le
  héros et passe en visée ; dans la boucle `checkAim` du même pas, un ennemi A qui vise déjà B
  déclenche COVERING_FIRE et tire sur B ; B roule sur une case voisine où traîne une arme jamais
  pointée (`target` nul, meilleur score), la ramasse (`takenBy`) et reste en visée (le héros saute
  `checkAim`) ; si B a le plus petit temps au pas suivant, `play` émet 41. Il faut des combats de
  20–32 par côté : `tools/oracle/scripts/hunt41.ts` (moteur seul ; côté 0 forcé
  `[TUCK_AND_ROLL, SHOCK_GRENADE]`, côté 1 `[COVERING_FIRE, SHOCK_GRENADE]`, variantes avec
  grenade à fragmentation / compétences de vitesse) en trouve un en 1 000–5 000 combats ; trois
  entrées trouvées sont capturées par l'oracle (`scripts/capture-input.ts`) dans
  `golden/regression/ev41-hunt-*.json.gz` : le SWF émet bien 41, 0 écart avec le moteur.

Plafond de pas : `oracle:diff` et les tests golden simulent via `simulateBattleCapped` (moteur),
qui abandonne un combat encore en cours après `--max-steps` appels à `resolve()` (défaut
`DEFAULT_MAX_STEPS` = 500 000 ; le plus long golden en fait ≈ 1 035) et le compte KO
(`StepCapExceeded`). Garde-fou du banc uniquement : le SWF n'a pas de plafond, `simulateBattle`
non plus. Une boucle infinie à l'intérieur d'un seul `resolve()` n'est pas interceptée.

Durée (lot du 2026-11-22, Snapdragon X / Windows ARM64, Chromium x64 émulé, 4 jobs) :
**≈ 3,9 s par combat** en moyenne (chargement de la page → `MTDONE`, dont ≈ 2,7 s de démarrage du
SWF avant la première ligne `TRP`), soit **≈ 1 s par combat** en débit avec 4 pages parallèles
(corpus v2 : 1 144 combats hors `vehicles` en 1 229 s). Par tag : basic 3,86 s · levels 3,86 ·
forced-skill 3,82 · specialists 7,57 (machine chargée) · large 4,87 · rats 3,86 · edge 3,78.
La capture `vehicles` (v3) a été interrompue par une mise en veille de la machine : 4 combats
ont dépassé le délai à la première tentative (consignés dans `vehicles/capture-failures.jsonl`)
puis ont réussi à la seconde ; sa moyenne (26 s) n'est pas représentative. Aucun échec définitif.

## Innocuité

`build.ps1 -Verify` : P-code de `client_fr.swf` vs `client_fr_trace.swf`, 290 scripts.
28 fichiers diffèrent octet à octet ; 24 ne diffèrent que par la renumérotation des opérandes
`newfunction N` (indices de méthodes décalés par l'ajout des helpers). Après normalisation,
4 fichiers diffèrent, exactement aux endroits patchés :

```
=== §P!L/\x02§.§59=F\x03§ (Trooper.init)
   ofs0698:
+  getlex QName(PackageNamespace(""),"(m]a\x02")
+  getlocal0
+  callpropvoid QName(PackageNamespace(""),"mtTrp"), 1
   returnvoid

=== §Q\btf§ (Game, handler ENTER_FRAME §&l\f[\x01§) — seules autres différences : offsets des labels de saut décalés
   getlex QName(PackageNamespace(""),"(\x1ar3")
   getproperty QName(PackageNamespace(""),"{DEL}\x0fY@")
   initproperty QName(PackageNamespace(""),")\x11\x1d\x0e")
+  getlex QName(PackageNamespace(""),"(m]a\x02")
+  getlocal0
+  getproperty QName(PackageNamespace(""),"S\rNK\x02")
+  callpropvoid QName(PackageNamespace(""),"mtDump"), 1
   jump …

=== §,7u\x1f§ (Main._rsq) — + offsets de labels décalés
   getlocal 6
   ifeq ofs0088
+  getlocal 6
+  pushnull
+  ifeq ofs0088
   returnvoid

=== §(m]a\x02§ : la classe vide reçoit les 4 méthodes statiques mtEsc/mtStr/mtTrp/mtDump
```

## `client_fr_play.swf` (affichage navigateur, `assets/swf/client_fr_play.swf`)

SWF servi aux navigateurs pour tous les éléments Flash du site (combats, fiches de trooper, grilles) :
`client_fr.swf` (même source vérifiée par SHA-256) dont **une seule branche** est modifiée, celle du
contrôle d'intégrité `chk` de `Main._rsq` (`if (hash(data) != chk) return;`, voir `PC_MAIN` ci-dessus).
Le hash est un algorithme maison exécuté par un interpréteur embarqué que le serveur ne peut pas
calculer : l'original n'affiche rien sans un `chk` valide. Aucun helper de trace ; autres
modifications : l'**API de lecture** (« API de lecture » ci-dessous), des **données d'image** (« Icônes
transparentes ») et la hauteur des champs de texte (« Champs de texte »).

- Construction : `build-play.ps1` (appelle `build.ps1 -Play`, mêmes outils, même `-replace` P-code ;
  `-WorkDir` par défaut `..\minitroopers-work\oracle-build-play`, `-Verify` liste les différences P-code).
- Patch : section `PC_PLAY_MAIN_*` de `patch-msg.as`. Différence avec `PC_MAIN` : celui-ci devient
  `chk != null && …` (l'oracle tourne sans `chk`) ; ici le `returnvoid` est **supprimé** : le test
  `ifeq` saute vers l'instruction suivante dans les deux cas, donc **tout `chk` (ou aucun) est accepté**
  (le serveur envoie `chk=play`, cf. `clientParams` du moteur).
- Résultat : `client_fr_play.swf` + `.sha256`, reproductible (deux builds donnent le même SHA-256).

### API de lecture (pause, vitesse, progression)

Points d'accroche et noms : `docs/research/lecteur-swf.md`. Comme pour l'oracle, des appels insérés en P-code dans
le `Game` (`ffdec -replace`, plusieurs paires FIND/REPLACE par corps de méthode via `parts` dans `build.ps1`) et des
helpers statiques AS3 dans la classe vide `§(m]a\x02§` (sections `HELPERS_PLAY_IMPORTS` + `HELPERS_PLAY`, recompilées
par `-importScript` ; le build de trace garde `HELPERS`, son SHA-256 est inchangé) :

| Point | Où | Effet |
|---|---|---|
| `PC_PLAY_GAME_INIT` | handler ENTER_FRAME du Game, passage état 0 → 1 (même endroit que `PC_GAME`) | `mtInit(this)` : enregistre les callbacks, calcule `total`, les index des `CheckPoint` (38) et `NewWave` (39), appelle `mtReady` |
| `PC_PLAY_GAME_FRAME` | même handler, état 2 : `this.frame()` | devient `mtFrame(this)` |
| `PC_PLAY_FAST` | `§Bl{K\x01§` (isFast : `ticks >= 8`) | `(ticks >= 8) \| mtFast` (`bitor` + `convert_b`) : à vitesse ≥ 8 les mêmes effets que le mode natif 16× sont coupés |

- SWF → page (`ExternalInterface.call`) : `mtReady({total, checkpoints, waves})` une fois ; `mtProgress(idx, wave)` au plus
  une fois par image, seulement si `idx` change (`idx = total − queue.length − (step ? 1 : 0)`, `wave` = nombre de
  `NewWave` appliqués) ; `mtEnd()` une fois, quand `Winner` (dernière entrée) est appliqué (`idx = total`).
- Page → SWF (méthodes de l'élément Ruffle) : `mtPause()`, `mtResume()`, `mtSpeed(x)` (borné à [0.125, 32]),
  `mtState()` = `{idx, wave, total, speed, paused, ended}`.
- `mtFrame` : en pause aucun appel ; sinon `acc += max(speed, 1)`, `n = floor(acc)` appels à `frame()` (exact au tick,
  à-coups compris, consommés par appel), 1 seul si l'écran PAUSE natif est ouvert ; sous ×1, `stage.frameRate = 40 × speed`
  (au-delà, 40). Budget de temps : 10 ms, ou la moitié de l'intervalle entre les deux dernières images si elles sont plus
  lentes (plafond 100 ms), au moins un appel. Sur une machine rapide c'est 10 ms ; sous le Chromium x64 émulé (un
  `frame()` y coûte 3 à 15 ms, une image 40 à 150 ms) un budget fixe de 10 ms plafonne ×32 à ≈ ×1,5, le budget relatif
  donne ≈ ×5 au prix d'une cadence au plus divisée par deux.
- Test : `tools/oracle/test/player.test.ts` (Ruffle web, `OracleRunner.newPage`).

### Icônes transparentes (bitmaps 17 et 19, bogue de Ruffle a111ceec)

Au démarrage, l'original rend transparent le blanc opaque de deux bitmaps (classe décompilée `§$9Y\x01§`) :
`bmp.threshold(bmp, bmp.rect, new Point(0,0), "==", -1, 0x00FFFFFF)` sur le DefineBitsLossless2 **17**
(160×160, icônes d'état 16×16 de la colonne gauche des cartes de trooper : gilet, etc.) et **19** (64×64, flèches).
Le Ruffle épinglé (nightly 2025.7.28, `a111ceec`, même cœur que l'oracle) écrit la couleur de `threshold` **sans la
prémultiplier** (`core/src/bitmap/operations.rs` : `set_pixel32_raw(…, Color::from(colour))`) : 0x00FFFFFF est
stocké alpha 0 avec RVB 255, que le mélange prémultiplié dessine en **blanc** (carré blanc derrière l'icône).
Corrigé en amont par ruffle-rs/ruffle `1d2b894` (2025-11-06, `to_premultiplied_alpha(true)`), après notre épingle.

`patch-play-bitmaps.mjs` (Node, sans dépendance, appelé par `build.ps1 -Play` après le `-replace`) applique ce même
seuil à l'avance : les pixels ARGB exactement 0xFFFFFFFF de ces deux bitmaps deviennent 0x00000000 (ce que Flash Player
stocke après le `threshold`), soit 21 560 pixels pour 17 et 3 583 pour 19 ; le `threshold` d'exécution ne trouve plus
rien. Seules les données zlib de ces deux balises changent, les autres balises sont recopiées octet pour octet ;
idempotent (relancé sur `client_fr_play.swf`, il redonne le même fichier) :
`node tools/oracle/instrument/patch-play-bitmaps.mjs assets/swf/client_fr_play.swf <sortie>`.
SHA-256 : avant (chk seul) `0b22159735b96b721516957851487db23a69c393831b59b1549c10c89df37409`, après
`294fea6b0d73f43d0eb8c8eb10ffa201db7afa4484d62ff2be211eb06740856b`. Copie servie : `apps/server/public/swf/client_fr_play.swf`
(identique, vérifié avec les bitmaps par `apps/server/test/assets.test.ts`). L'oracle (`client_fr_trace.swf`) n'est pas
concerné : il ne dessine pas ces icônes et garde son propre SWF.

### Champs de texte (hauteur 14 → 20, Ruffle masque la première ligne)

La plupart des TextField du client sortent d'une fabrique (classe décompilée `§l\x0b\x01§`, méthode statique
`§\x13#\fB\x01§(couleur = 0xFFFFFF, taille = 8, alignement = -1, police = "nokia")`) : `tf.height = 14;
tf.embedFonts = true;`, format, `selectable = false`. Certains appelants y mettent une police plus grande que le champ :
les compteurs en bas à gauche du combat (troopers en réserve, place de déploiement ; « motorola » 16 px, classe
`§f\x03\x02§`) et « PAUSE » (« upheaval » 20 px). La première ligne a sa ligne de base à gouttière 2 + ascendante
(motorola, DefineFont3 id 18 : 19220/20480 × 16 = 15 px) = 17 px, sous le bas du champ (14 px). Flash Player affiche
toujours la première ligne d'un champ même si elle déborde. Ruffle (a111ceec, et `master` en 2026-11) masque le texte
à la hauteur du champ (`core/src/display_object/edit_text.rs`, `render_self` : masque = bornes réduites en x seulement) :
le bas des chiffres était coupé (« 08 » lu « ΠR »).

`patch-play-textfields.mjs` (Node, sans dépendance, appelé par `build.ps1 -Play` après `patch-play-bitmaps.mjs`)
remplace l'opérande de ce seul `pushbyte 14` (P-code `getlocal 5 ; pushbyte 14 ; initproperty height ; getlocal 5 ;
pushtrue ; initproperty embedFonts`) par 20 : un octet de la balise DoABC (72), même longueur, rien d'autre ne bouge
(corps décompressé : seul l'octet 301443 diffère). Refuse d'écrire sans exactement une occurrence (14, ou 20 sur un SWF
déjà corrigé : idempotent, même fichier). Les champs qui fixent ensuite leur hauteur ne changent pas ; les autres sont
mono-ligne, sans bordure ni fond : les 6 px ajoutés sous le texte ne dessinent rien.
`node tools/oracle/instrument/patch-play-textfields.mjs assets/swf/client_fr_play.swf <sortie>`.
SHA-256 : avant `294fea6b0d73f43d0eb8c8eb10ffa201db7afa4484d62ff2be211eb06740856b`, après
`7e6a9b1aef651aa0e76e4d1c7b10237d58b4ed5e807e60d0404567750ee2de5c` (vérifié par `apps/server/test/assets.test.ts`).
`CLIENT_SWF` passe à `?v=3` pour que les navigateurs reprennent les deux correctifs.

Avec l'API de lecture (tâche « lecteur amélioré ») : SHA-256
`9049b2123bc96f3a9f3952fb10e345230789465f90689e9e4a8e88f536268bb0` (deux builds dans deux dossiers de travail :
même SHA-256), `CLIENT_SWF` en `?v=4`. Le `pushbyte 14` du correctif ci-dessus est alors à l'octet 302188 du corps
décompressé (la classe des helpers a grandi).

- Innocuité (`build-play.ps1 -Verify`) : 29 fichiers P-code diffèrent octet à octet sur 290, 4 hors renumérotation
  `newfunction N` : `§(m]a\x02§` (helpers), `§l\x0b\x01§` (`pushbyte 14` → `20`, ci-dessus), et, hors renumérotation
  des labels de saut :

```
=== §,7u\x1f§ (Main._rsq)
                     getlocal 6
                     ifeq ofs0081
-                    returnvoid
                  ofs0081:

=== §Q\btf§ (Game, handler ENTER_FRAME §&l\f[\x01§)
   initproperty QName(PackageNamespace(""),")\x11\x1d\x0e")
+  getlex QName(PackageNamespace(""),"(m]a\x02")
+  getlocal0
+  callpropvoid QName(PackageNamespace(""),"mtInit"), 1
   jump …
 …
-  findproperty QName(PackageNamespace(""),"k\n/$\x03")
-  callpropvoid QName(PackageNamespace(""),"k\n/$\x03"), 0
+  getlex QName(PackageNamespace(""),"(m]a\x02")
+  getlocal0
+  callpropvoid QName(PackageNamespace(""),"mtFrame"), 1

=== §Q\btf§ (Game, §Bl{K\x01§)
   pushbyte 8
   greaterequals
+  getlex QName(PackageNamespace(""),"(m]a\x02")
+  getproperty QName(PackageNamespace(""),"mtFast")
+  bitor
+  convert_b
   returnvalue
```

Affichage (Ruffle web, `OracleRunner.runPlay`, `test/play.test.ts`) :
- embed comme les pages originales : 720×440, `scale: noscale`, fond `#F2DDB8`, `data` = `battleData(...)`/
  `trooperData(...)`/`gridData(...)` + `chk=play&imageurl=/img/` ;
- l'original **attend son image de fond** (`imageurl` + `bg/<x>.jpg`) avant de lancer le combat : sans elle
  (404) l'écran reste vide avec le pictogramme de chargement. Le serveur du site doit donc servir `/img/bg/*.jpg` ;
  le test en sert une de substitution (`test/fixtures/bg.jpg`, 720×440 uni) ;
- le client original **ne transmet pas le vainqueur au JS** : son seul rappel est `ExternalInterface.call("endBattle")`
  (sans argument), déclenché par le bouton « continuer » de la bannière de fin (un Sprite avec un écouteur CLICK).
  Sous Ruffle web le **premier clic sur une page neuve est avalé** (prise de focus/activation), le second atteint le
  bouton : le test clique donc deux fois (au plus trois) puis vérifie que `endBattle` a été appelé. Le résultat
  affiché est lu sur la bannière de fin, titre VICTOIRE si le vainqueur est le côté attaquant, DÉFAITE sinon, rendue
  par le SWF à partir du combat qu'il a lui-même rejoué ; le test compare octet à octet un recadrage de 120×24 px à
  deux références (`test/fixtures/banner-victoire.png`, `banner-defaite.png`) ;
- le combat est rejoué en temps réel (≈ 25 s pour 20 événements d'historique, ≈ 60 s pour 25) : le test
  prend les goldens les plus courts. `npm test` n'en rejoue que 2 (un gagné, un perdu, ≈ 30 s) ; `npm run test:play`
  (`MT_PLAY_FULL=1`) en rejoue 20 (≈ 3,5 min).
