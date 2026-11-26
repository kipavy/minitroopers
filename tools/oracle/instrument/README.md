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

### API de lecture (pause, vitesse, progression, saut, blocage, capture)

Points d'accroche et noms : `docs/research/lecteur-swf.md`. Comme pour l'oracle, des appels insérés en P-code dans
le `Game` (`ffdec -replace`, plusieurs paires FIND/REPLACE par corps de méthode via `parts` dans `build.ps1`) et des
helpers statiques AS3 dans la classe vide `§(m]a\x02§` (sections `HELPERS_PLAY_IMPORTS` + `HELPERS_PLAY`, recompilées
par `-importScript` ; le build de trace garde `HELPERS`, son SHA-256 est inchangé) :

| Point | Où | Effet |
|---|---|---|
| `PC_PLAY_GAME_INIT` | handler ENTER_FRAME du Game, passage état 0 → 1 (même endroit que `PC_GAME`) | `mtInit(this)` : enregistre les callbacks, calcule `total`, les index des `CheckPoint` (38), `NewWave` (39) et `Winner` (34), arme la détection de blocage en état 1, envoie `mtSim` ; `mtReady` seulement si le combat est déjà complet (sinon à la fin de la simulation paresseuse, ci-dessous) |
| `PC_PLAY_GAME_FRAME` | même handler, état 2 : `this.frame()` | devient `mtFrame(this)` |
| `PC_PLAY_FAST` | `§Bl{K\x01§` (isFast : `ticks >= 8`) | `(ticks >= 8) \| mtFast` (`bitor` + `convert_b`) : à vitesse ≥ 8 les mêmes effets que le mode natif 16× sont coupés |
| `PC_PLAY_KF` (+ `PC_PLAY_KF_STACK`) | même handler, état 0 : `if (battle.resolve())` | `if (mtKfGo(battle, battle.resolve()))` (`swap` ×2 ; `maxstack` 2 → 3) : `mtKf(battle)` (images clés, en lecture seule), puis vrai si `resolve()` a fini **ou dès que l'historique a une entrée** (simulation paresseuse, ci-dessous) : le Game prend l'historique et passe à l'état 1 comme d'origine. **Seul ajout dans l'état 0** |
| `PC_PLAY_TICK` | `tick()` du Game `§&~\x03'§` : rendu puis avance de tous les clips (`§;io&§.§i'\x04W\x02§`, `§?d0r\x01§`) | `mtClips()` : les mêmes deux appels (temps mesurés pour `mtState().prof`), précédés de `mtKeep` ; pendant un rejeu caché, `mtClipsSeek` (ci-dessous) |

- SWF → page (`ExternalInterface.call`) : `mtReady({total, checkpoints, waves, starts})` une fois, quand le combat est
  complet (`starts[k]` : index
  de la première image clé après le `NewWave` `waves[k]`, la nouvelle vague déployée : un saut de vague y va sans
  rejeu) ; `mtProgress(idx, wave)` au plus
  une fois par image, seulement si `idx` change (`idx = total − queue.length − (step ? 1 : 0)`, `wave` = nombre de
  `NewWave` appliqués) ; `mtEnd()` une fois, quand l'entrée `Winner` est appliquée (son index est relevé par `mtInit` :
  elle n'est pas toujours la dernière ; son application vide la file, donc `idx = total`) ; `mtStuck(idx)` une fois par
  blocage (ci-dessous) ; `mtPaused(paused)` à chaque changement de pause, quelle qu'en soit l'origine (bouton de la
  page, clic sur le terrain, clic sur un trooper, `mtStopAt`).
- **Simulation paresseuse** (comme BetterTrooper) : le combat n'est plus calculé en entier avant d'être joué. L'état 0
  du Game (200 `resolve()` par image jusqu'à la fin) est quitté dès que l'historique a une entrée (`mtKfGo`) ; `mtInit`
  part de cet historique partiel et `mtSimFrame` (écouteur ENTER_FRAME du clip du Game, avant celui du Game, priorité 1 : états 1
  et 2) continue `resolve()` + `mtKf` par tranches pendant la lecture : par défaut autant de pas que 5 ms par image en
  permettent (au moins un : le combat est complet ~0,4 s après le début sur un ordinateur, et un saut qui suit coûte
  comme en `?v=10`) ; la page peut fixer un nombre de pas par image avec `mtAhead(n)` (comme leur `labNavAhead`,
  1 à 200, sans limite de temps), et revenir au défaut avec `mtAhead(0)` ; tant qu'un saut
  attend, tous les pas jusqu'à son entrée dans l'image suivante. Chaque image, les nouvelles entrées sont copiées dans `mtHist` et
  ajoutées à la file du Game (sauf si le `Winner` est déjà appliqué : il vide la file), et vagues, checkpoints,
  `Winner` (inconnu d'ici là : pas de fin), état d'affichage des images clés (`mtShownStep`, incrémental) et débuts de
  vague sont mis à jour. Mêmes appels à `resolve()` dans le même ordre : l'historique est le même, entrée pour entrée
  (tests d'historique sur 30 combats, et après un saut fait pendant la simulation). Mesures (Brave natif, combat 16) :
  toute la simulation coûte ~0,3 s de `resolve()` (354 pas) ; d'origine elle tient en 2 images avant la première.
  - SWF → page : `mtSim({events, complete, waves, starts, checkpoints})` à `mtInit` puis à chaque image où des entrées
    arrivent, et une dernière fois avec `complete: true` ; **`mtReady` ne vient qu'une fois le combat complet**
    (inchangé : `total`, `checkpoints`, `waves`, `starts` définitifs). La lecture commence avant : le premier
    `mtProgress` précède `mtReady`. `mtState()` : `total` = entrées connues (croît), `complete`, `target` (saut en
    attente, -1 sinon), `ahead`, `sim` ([premier resolve, mtInit, fin (ms getTimer), ms dans resolve après mtInit,
    pas, images, ms de synchro]).
  - Saut au-delà des entrées connues : `mtGoto(n)` retourne faux, `seeking` vrai et `target = n` ; à l'image suivante,
    `mtSimFrame` fait tous les pas jusqu'à l'entrée `n` (au plus le combat entier, ~0,3 s une fois, comme l'état 0
    d'origine) puis le saut, dans la même image : un saut à la fin juste après le chargement n'est pas plus lent qu'en
    `?v=10`. Pas dans l'appel de la page : 300 ms de `resolve()` dans un appel ExternalInterface figeraient la page et
    risquent le tampon détaché (ci-dessous). La page peut afficher son voile tant que `target >= 0` (une image ou deux).
  - Pourcentage : BetterTrooper l'estime (`events / (lignes du journal × 1,1 + 5)`, plafonné à 97 %) ; ici la page
    connaît le nombre exact d'entrées (journal du serveur) : `events / total`.
- **Sons** (`?v=14`) : le jeu original est muet ; le SWF signale à la page les moments audibles **à l'instant où
  l'affichage les montre** : `window.mtSfx(kind, detail, x)`, `x` dans [0, 1] (gauche → droite du terrain, 720 px ;
  0,5 quand l'action n'a pas de trooper). Quatre insertions P-code au début de méthodes d'affichage, qui appellent un
  helper : `PC_PLAY_SFX_APPLY` (`Game.apply(entrée)` : l'action de l'entrée est créée à cet instant ; un tir part
  dans le même appel), `PC_PLAY_SFX_HIT` (`§3\x19/\x01§(coup, angle)` du trooper affiché : tout coup reçu, balle,
  explosion ou corps à corps, à l'image de l'impact), `PC_PLAY_SFX_DIE` (`§\x16mf\x01§()` : sa mort),
  `PC_PLAY_SFX_BLAST` (`§nEI(\x01§` de la carte : les débris d'une explosion). Deuxième ronde (`?v=15`), quatre
  insertions de plus : `PC_PLAY_SFX_ANIM` (`§PNcV\x01§(anim)` du trooper affiché : il commence une animation, étiquette
  lue dans `Data.ANIMS`, `§\x17@E{§.§\x10\x18'\x14\x03§`, liste blanche `mtSfxAnims`), `PC_PLAY_SFX_MOVE` (image d'un
  déplacement affiché `§{DEL}\f\x01§.§Z\b4]§.§&l\f[\x01§` : à la première, avancement 0, sa durée en images
  `ceil(1 / pas)` ; déploiement, déplacement, véhicule, rats), `PC_PLAY_SFX_THROW` (grenade à main
  `§I&\x01§.§(qs[§.§87 9§` : elle quitte la main, à l'image `hit` de l'animation `launch`) et `PC_PLAY_SFX_DETONATE`
  (`OX2i` : elle touche le sol et agit, effet propre à chaque type). Jamais hors de l'état 2 (calcul,
  simulation paresseuse : la logique n'appelle rien), pendant un saut (restauration, rejeu caché : `mtSfxMute`,
  `mtSeekTo`), `mtSettle`, le pré-chauffage, ni l'écran PAUSE ouvert ; `mtState().sfx` compte les appels.
  Contrat pour la page (kind : detail) :

  | kind | detail | quand |
  |---|---|---|
  | `deploy` | — | entrée 1 : troupes déployées (début de vague) |
  | `wave` | — | entrée 39 : nouvelle vague |
  | `move` | `<qui>:<images>` | un déplacement affiché commence (déploiement compris) ; qui = `run` (à pied), `rat`, `v<véhicule>` (`VEHICULE_ROWS` : 0 moto, 1 jeep, 2 char léger, 3 hélicoptère, 4 char lourd…) ; images = sa durée à ×1 (40 images/s) |
  | `anim` | étiquette (`rat:` devant pour un rat) | animation commencée : `ball` (roulade, Roulé-boulé / ramassage d'arme), `jump`, `land`, `fly` (projeté), `ground_crash` (chute), `wake_up`, `pillule` (Twinoïde), `autoPique` (amphet), `anti_poison`, `talky_walky`, `scout`, `magnet`, `voodoo`, `treat`, `kick`, `ground_kick`, `tomoe_nage`, `dodge_punch`, `intercept`, `hide_weapon`, `charge`, `shock`, `leave`, `boite`, `blueprint`, `lifted_up`, `taunt1-4` |
  | `pin` | id de grenade (82 à 91) | entrée 14 : début du lancer d'une grenade à main (goupille) |
  | `throw` | id de grenade | elle quitte la main |
  | `detonate` | id de grenade, `catch` si interceptée | elle touche le sol : 82 grenade et 89 bénie (+ `explosion`), 83 flash, 84 gaz, 85 clown, 86 fragmentation, 87 secousse, 88 gluante, 90 soin, 91 trou noir |
  | `switch` | — | entrée 25 : changement d'arme |
  | `reload` | `start` / `load` | entrées 3 (début du rechargement) / 4 (balles remises) |
  | `empty` | id d'arme | entrée 5 : arme à sec (en lecture, un changement d'arme suit) |
  | `fire` | id d'arme | entrée 8 : tir (les impacts suivent dans le même appel : `hit`…) |
  | `melee` | id d'arme | entrée 9 : coup au contact |
  | `charge` | id d'arme | entrée 18 : course vers la cible pour la frapper (l'impact vient plus tard : `hit`) |
  | `carry` | — | entrée 19 : un trooper en emporte un autre |
  | `grenade` | id d'arme (lance-roquettes, canons…) | entrée 10 : départ du projectile ; l'explosion suit (`explosion`) |
  | `explosion` | `grenade` / `big` | débris d'explosion : grenade ou roquette (16 éclats), frappe aérienne / avion (20) |
  | `jet` | — | entrée 21 : passage de l'avion de chasse |
  | `heal` | — | entrées 12 (soin) et 13 (antidote) |
  | `skill` | id de compétence | entrées 16, 17 : compétence active, compétence d'équipe |
  | `hit` | type de coup (0-8), `vehicle` ou `rat` | coup qui blesse (sur un véhicule : `vehicle` ; sur un rat : `rat`, de même pour `crit`, `miss`, `block`, `nodmg`) |
  | `crit` | type de coup | coup critique (effet « localisé », texte et à-coup) |
  | `miss` | `9` | tir manqué (MISS) |
  | `block` | type de coup | coup paré / esquivé (texte de parade) |
  | `nodmg` | type de coup | coup sans dégât (armure, gilet) |
  | `death` | classe du trooper (`5E[\x1d`.`An%6`) | mort, à l'image où il tombe |
  | `end` | camp vainqueur (`0` gauche, `1` droite) | entrée 34 : fin du combat (la page sait quel camp est le sien) |

  Ids d'arme = index de l'arme (`WEAPON_ROWS` de `@mt/engine`, 0 Poings … 37 Clown, 36 Dents de Rat).
- **Pause = la pause native** : un clic sur le terrain bascule la pause du Game (`§;y\x1a-§`) : écran de pause
  `§J\b\x17Z\x03§` (instantané du terrain en gris, « PAUSE » qui glisse, fiche d'un trooper sur un clic sur lui ; ses
  tweens dans sa propre liste), `frame()` ne fait plus que l'animer ; la reprise le fait disparaître en fondu.
  `mtPause()` ouvre ce même écran à l'image suivante (`new §J\b\x17Z\x03§`, comme le natif ; aussi après la fin, où le
  natif refuse ; pas dans l'appel de la page : sous Ruffle web, une croissance de la mémoire pendant un appel
  ExternalInterface détache le tampon de la page ; `paused` est vrai tout de suite et aucune entrée n'est jouée),
  `mtResume()` le ferme comme le natif (`§fl@@\x02§`, fondu). Le clic natif est suivi par un écouteur MOUSE_DOWN
  posé après celui du Game sur le même sprite (`mtOnClick`), le clic sur un trooper par `mtPauseSync` (chaque image) :
  `paused` et `mtPaused(...)` suivent. En pause, une image = un `frame()` (l'écran s'anime), aucune entrée. **Un saut
  en pause est permis et la pause reste** : l'écran ouvert est mis de côté (toujours affiché, `frame()` rejoue le
  combat ; liste de tweens du Game rétablie), puis remis à l'image qui suit la fin du saut avec un nouvel instantané du terrain à `n`
  (rendu des clips d'abord, fiche de trooper fermée) ; `mtSettle` fait de même. Un clic natif pendant un saut
  asynchrone bascule la pause voulue à sa fin. `mtShot()` cache l'écran de pause le temps de la capture.
- Page → SWF (méthodes de l'élément Ruffle) : `mtPause()`, `mtResume()`, `mtSpeed(x)` (borné à [1/16, 32]),
  `mtState()` = `{idx, wave, total, speed, paused, screen, ended, seeking, hidden, calls, kf, banner, playing, prof, pool,
  waves, starts}` (`screen` : écran de pause natif ouvert, `playing` : le Game est en état 2, `prof` : temps du dernier saut, `pool` : compteurs de la réserve ; `seeking` : saut en
  cours, `hidden` : clip du Game masqué, `calls` : appels à `frame()` de lecture, hors sauts — la vitesse effective, `kf` :
  nombre d'images clés, `banner` : l'action `Winner` et sa bannière sont à l'écran), `mtGoto(n)` (`mtSeek(n)` : alias),
  `mtShot()`. Pour les tests seulement : `mtDump()`, `mtHistStr()`, `mtStopAt(n)`, `mtSettle(max)`, `mtKfSize()`
  (ci-dessous).
- `mtFrame` : écran de pause ouvert (ou en fondu) : un appel (il l'anime) ; sinon, hors pause, `acc += max(speed, 1)`, `n = floor(acc)` appels à `frame()` (exact au tick,
  à-coups compris, consommés par appel) ; sous ×1, `stage.frameRate = 40 × speed`
  (au-delà, 40). Budget de temps : 10 ms, ou la moitié de l'intervalle entre les deux dernières images si elles sont plus
  lentes (plafond 100 ms), au moins un appel ; l'intervalle de référence part de la première image de l'état 2 (pas de
  `mtInit`, sinon l'attente de l'image de fond compterait). Sur une machine rapide c'est 10 ms ; sous le Chromium x64
  émulé (un `frame()` y coûte 3 à 15 ms, une image 40 à 150 ms) un budget fixe de 10 ms plafonne ×32 à ≈ ×1,5, le budget
  relatif donne ≈ ×5 au prix d'une cadence au plus divisée par deux.
- **Images clés** (`mtKf`, `PC_PLAY_KF`) : appelé après chaque `battle.resolve()` de l'état 0, il ne fait que **lire**
  l'historique et les troopers : `getInfos()` (`§WU|\x04§`) construit des objets neufs à partir des champs du trooper
  (`§` V\x11§` = copie de tableau Haxe, `concat`, `§*\x1f\n$§` des armes = objets neufs), sans tirage aléatoire ni
  écriture — c'est la même fonction que le `CheckPoint` natif appelle. Une image clé dès que l'historique a 4 entrées de
  plus que la précédente (`resolve()` en ajoute parfois plusieurs d'un coup : l'écart réel est celui d'un tour), et
  après chaque `NewWave` (39), plus une image vide à l'index 0. Contenu : `i` (entrées appliquées), `t` (infos des
  troopers vivants), `x` (en plus pour chacun : état `TrooperState`, statuts, blessures, soigné, PV du véhicule), `d`/`dx`
  (morts de la vague : listes de morts des équipes, vidées par `NewWave` ; un corps est « au sol » s'il était `FALLEN`
  au `resolve()` précédent sa mort, ou si le `resolve()` qui l'a tué l'a projeté — effet de tir 2, `mtFly` —, ce que
  son état `DEAD` ne dit plus), `g` (armes au sol : `[x, y, infos]` des cases).
  Une erreur dans `mtKf` est rattrapée (`try`/`catch`) : les images clés s'arrêtent pour ce combat (seule l'image vide
  à 0 reste, les sauts rejouent depuis le début) et le calcul continue tel quel. Une image clé aussi au dernier
  `resolve()` (combat fini). Preuve d'innocuité : `player.test.ts` compare `Battle.history` (sérialisé par `mtHistStr`, mêmes `mtStr` que la trace)
  aux lignes `EV` de l'oracle, à l'octet près, sur 30 combats de référence.
- **Historique jamais modifié** : `mtInit` en garde une copie profonde (`mtHist`) et la file du Game devient
  `mtHist.slice(0)` (le Game consommait `Battle.history` lui-même). L'affichage modifie les entrées qu'il joue (le
  déploiement vide ses infos par `pop()`, les infos des `CheckPoint`/déploiements finissent dans les troopers créés, les
  tableaux des entrées 41/42 sont vidés par `shift()`, un tir manqué reçoit 0 dégât) : `mtFresh`, appelé avant chaque
  `frame()` (via `mtUnwait`), remplace les 16 premières entrées de la file encore « vierges » (dictionnaire
  `mtPristine`) par des copies (au plus un pas commence par tick, au plus 16 ticks par `frame()` : la touche native +).
- `mtGoto(n)` (n borné à `[0, total]`) : saut **synchrone, dans les deux sens, sans recharger le lecteur**, permis en
  pause (l'écran PAUSE reste, ci-dessus) ; au-delà des entrées simulées il attend l'image suivante (simulation
  paresseuse, ci-dessus) ; avant l'état 2 il est différé à la première image de lecture. Il
  prend la dernière image clé `≤ n` (et `≤` l'index du `Winner`, pour que la fin soit rejouée) ; si l'index appliqué
  courant est entre cette image et `n`, il continue simplement depuis la position courante. Au-delà du `Winner` (la
  fin) : l'image clé finale est restaurée puis l'entrée `Winner` appliquée directement (`apply`), sans rejeu. Pendant
  l'état 1 (image de fond attendue), si l'image est là, le saut passe le Game en état 2 comme son image suivante le
  ferait. Sinon `mtRestore` :
  - arrêt de l'étape courante, `ylcZ()` sur chaque action (comme le saut natif Espace) ; l'action `Winner` est retirée
    avec sa bannière et son panneau de fin ; tweens détruits sauf celui des marqueurs de chef (`§*\x17Z\x10§`, un
    singleton qui ne se recrée pas) ; file d'à-coups vidée ; armes et objets au sol, particules retirés ; fin
    annulée (`§HUgt\x03§`, teinte de la carte, opacité des panneaux et de l'horloge) ;
  - horloge et sa valeur haute = temps de la dernière entrée appliquée ; file = `mtHist` depuis l'image clé ;
  - troopers : celui qui est vivant, sans véhicule, du même côté et avec le même type d'arme en main que dans l'image
    clé est **réutilisé** (`mtReuse` : champs de `§\x17;!\x01§` sans reconstruire la peinture, debout, orientation par
    défaut du côté, plus de statut, blessure, étiquette, tremblement, vitesse, effet de couleur ni sprite d'effet) ;
    les autres vont dans la **réserve** (`mtPool`, par id, 4 au plus : détachés de la scène, de la liste des troopers,
    des particules et de la liste des clips avancés et dessinés ; marqueur de chef masqué). Un trooper absent est pris
    dans la réserve s'il y en a un compatible (`mtUnstash` + `mtReuse`), sinon créé par `§y#;B\x01§(infos)` (ce que
    fait la reconstruction native du `CheckPoint`). `mtReuse` n'écrit les propriétés d'affichage que si elles
    changent (une écriture fait redessiner l'objet et ses filtres par Ruffle) et ne recolore la peinture que si l'une de
    ses entrées change. Créer une peinture est le plus coûteux (≈ 10 ms natif, 7 à 40 ms sous le banc émulé ; un
    corps ≈ 40 ms natif) ; réutiliser ou raccrocher : 1 à 3 ms. Les images pré-rendues des peintures (cache
    `§;io&§.§n6?\f\x02§`, compté par référence, vidé à 0) reçoivent leur drapeau « garder » `§\x10)L\x13\x02§` (`mtKeep`,
    à chaque tick) : une peinture n'est rendue qu'une fois par combat ;
  - **pré-chauffage** (`mtWarm`, depuis `mtFrame`) : un trooper par image, **seulement en pause ou combat fini**, après le
    travail de l'image (jamais pendant la lecture : elle reste celle de `?v=6`), rien pendant les 20 images qui suivent
    un saut ; jamais un trooper à véhicule (ni réutilisable ni mis en réserve ; `mtStash` arrête son tween de flottement
    `§''R?§` et vide les rappels d'étiquette de son animation, comme `mtReuse` et `mtUnstash`) : les troopers et corps des images clés (débuts et fins de
    vague et fin d'abord, puis toutes) sont créés hors champ et mis en réserve dans le même appel (jamais dessinés) ;
  - état en plus (`mtExtra`) : statuts, blessures, soigné — **tels que l'affichage les tient** : `mtShown` (à `mtInit`)
    les rejoue depuis l'historique jusqu'à chaque image clé avec les règles de l'affichage (statuts : 22, 23, 13
    antidote, effet de tir 12 ; blessures : localisation de chaque tir de dégât > 0 hors MISS ; soigné : 12, 17 compétence
    77, 14 compétence 90 ; les effets d'un tir après un 5 ou un 6 ne sont pas appliqués), car ceux de la logique en
    diffèrent (un soin efface les blessures côté logique, pas à l'écran ; un statut posé sans entrée ; un id qui revient sans arme en commun est un autre soldat, parti de zéro) —, compétences à usage unique
    restantes (liste lue par la fiche du trooper en pause : celle que son info donne à sa création, moins celles que les
    entrées 24 ont consommées avant l'image clé, `mtSkills`), PV du véhicule ; poses tenues jouées jusqu'à leur dernière
    image (`mtFf` : de saut en saut jusqu'à la prochaine opération de contrôle de la frise — arrêt, aller à, boucle —
    que le rendu n'exécute que pour l'image qu'il montre, les images intermédiaires rattrapées par un seul rendu) : au sol (`FALLEN` → `ground_crash`), en joue (`AIM` →
    `aim`), rechargement (`RELOAD` → `reload_init`) ; ces poses rendent le trooper occupé jusqu'à leur fin, comme en
    lecture quand elles commencent ;
  - morts de la vague : déjà à l'écran, pris dans la réserve, ou créés depuis leurs infos, état en plus, tués (`§\x16mf\x01§`), animation `dead` (ou
    `ground_crash` pour un corps au sol) jouée ;
  - armes au sol recréées (`§z&\x01§.§lv\x0f0§`, posées) ; panneaux latéraux : dernière entrée `PlayerStatus` (40) de chaque
    côté avant l'image clé, ou l'état de départ (cases masquées, « 00 »).
  
  Puis rejeu caché et synchrone jusqu'à `n` (drapeau rapide, clip masqué, `mtHurry` : la valeur haute de l'horloge est
  mise au temps de l'étape courante, qui s'applique dès que ses troopers sont libres au lieu d'attendre que l'horloge y
  monte ; les clips des troopers inactifs dont l'animation boucle ou est finie ne sont ni avancés ni dessinés :
  `mtClipsSeek`), au plus 250 ms ; s'il en reste, la suite est répartie sur les images suivantes (`mtSeekStep`, budget par image
  comme la lecture). Le clip n'est masqué que si un rejeu a lieu. À la fin : valeur haute de l'horloge ramenée à
  l'horloge (pas de couleurs de rattrapage), clip réaffiché, drapeau rapide rétabli, `ended` recalculé (faux avant le `Winner`), un
  seul `mtProgress(n, wave)`, et `mtEnd()` de nouveau si la fin est atteinte. Pause et vitesse inchangées. Retour :
  `true` si `n` est atteint au retour de l'appel.
- Ce qu'une image clé ne peut pas rendre (données d'affichage que l'historique ne porte pas) : les décalages en pixels
  ajoutés par l'affichage (recul à l'impact, attaquant au corps à corps arrêté contre la position *dessinée* de sa
  victime) — conservés en lecture jusqu'au prochain déplacement du trooper, absents après un saut (le test d'équivalence
  compare les positions à 40 px près, celles des corps à 47 px — moins d'une case —, et à 96 px pour les corps
  listés dans `BLASTED`, à partir de l'index des coups qui les ont poussés) ; l'orientation
  (gauche/droite) d'un trooper qui n'a pas bougé depuis l'image clé ; les blessures portées par un corps après sa mort ;
  l'image exacte de l'animation des corps ; la réserve de munitions des armes (`§\x1ap\x04f§`, dessinée dans le panneau
  d'armes de la fiche) : l'affichage la compte à sa façon (rechargements 4/6, changements d'arme 25), l'image clé donne
  celle de la logique (le test d'équivalence ne compare que le chargeur) ; les compétences à usage unique déjà consommées (liste de la fiche du
  trooper, `§\x1e;h\n\x01§`).
- Pour les tests : `mtDump()` (une ligne par trooper à l'écran — vivants : `sk[...]`, index des compétences à usage
  unique restantes : id, côté, position en pixels, PV, mort, au sol, arme en
  main, armes `id/type/munitions/réserve`, casque, véhicule, statuts, blessures des vivants, soigné ; armes au sol ;
  panneaux ; fin et bannière), `mtHistStr(copie)` (`Battle.history`, ou `mtHist`), `mtStopAt(n)` (la lecture se met en
  pause dès que `n` est appliqué), `mtSettle(max)` (`frame()` sans nouvelle étape jusqu'à ce qu'aucune action, tween,
  à-coup ni trooper occupé ne reste, 8 s au plus : le pas en attente est remis en tête de file, la file est rendue
  quoi qu'il arrive), `mtKfSize()` (`[images clés,
  objets et tableaux qu'elles possèdent, valeurs, plus grand écart entre deux images]`).
- Blocage : `mtStuck(idx)` quand l'étape courante attend depuis plus de ses 500 ticks (compteur hérité
  `§/\x12#\x1c\x02§ ≤ 0`, le délai de débogage du Game lui-même), une fois par étape ; ou quand aucune image de l'état 2
  n'a eu lieu 10 s (horloge murale) après `mtInit` (image de fond jamais chargée, `imageurl` en 404). Le `setTimeout` de
  Ruffle a été vu se déclencher après ≈ 7 s pour 10 s : `mtWaitCheck` se réarme jusqu'à 10 s de `Date`. Remède proposé
  par la page : un `mtSeek` au-delà du point de blocage (le saut détruit l'étape bloquée).
- `mtUnwait` (avant chaque `frame()` de lecture ou de saut) : les étapes `PlayerStatus` (40) et `Winner` (34)
  n'utilisent pas le trooper `tid` de leur entrée dans `apply()`, mais leur constructeur attend qu'il soit à l'écran.
  Après un saut, la reconstruction du `CheckPoint` a retiré les morts : une telle entrée après ce `CheckPoint` dont le
  `tid` est mort attendait pour toujours (raid de l'e2e bloqué à 35/38 après « Fin », puis à 37 sur le `Winner`).
  Leurs ids en attente sont vidés ; en lecture normale le `tid` est encore à l'écran (mourant au pire), rien ne change. Test : `player.test.ts`
  (« dead trooper's PlayerStatus », `basic/00047` et `fixtures/raid-seek-stuck.json`).
- `mtShot()` : `BitmapData(720, 440).draw(stage)`, `getPixels` → ARGB 720 × 440 × 4 octets en base64 (≈ 1,7 Mo ;
  encodeur `mtB64` par table de 4096 paires de caractères écrites dans un `ByteArray`, ≈ 1,8 s sous le Chromium émulé).
  Le canvas WebGL de Ruffle n'a pas `preserveDrawingBuffer` : la page ne peut pas le lire de façon fiable. `""` en cas
  d'échec.
- Test : `tools/oracle/test/player.test.ts` (Ruffle web, `OracleRunner.newPage`).

### Infobulles au toucher (`?v=15`)

La fiche d'un trooper en pause (`§^\x05\x01!§.§cfKo\x03§`) a des infobulles (compétences `§r\x14XV\x01§`, santé,
statuts `§th\b\x01§`, armes) : chaque élément, sur son survol (`ROLL_OVER` / `MOUSE_OVER`), appelle le gestionnaire
`§^\x05\x01!§.§xy\x04\x06§` (affiche `§\x14;T\x07§`, masque `§\x07MJ\x1f§`). Un écran tactile n'a pas de survol, et le
navigateur envoie une sortie du pointeur juste après le toucher (Ruffle la traduit en sortie de l'élément). Deux
insertions : `PC_PLAY_TIP_SHOW` (début de l'affichage : `mtTipShow`, l'infobulle est **tenue**) et `PC_PLAY_TIP_HIDE`
(après `visible = false` du masquage : `mtTipHid` la réaffiche si elle est tenue). Un écouteur `MOUSE_DOWN` sur la
scène, en capture, priorité 100 (`mtTipDown`) : un appui termine la tenue d'une infobulle affichée **avant** lui et la
masque ; si l'appui n'en a affiché aucune (pas de survol au toucher), sa cible puis ses parents (6 au plus, jusqu'à ce
qu'une infobulle s'affiche) reçoivent `MOUSE_OVER` / `ROLL_OVER`, comme un survol : un toucher sur un élément affiche
son infobulle, sur un autre la remplace, ailleurs la ferme. Seulement si la page a signalé un toucher : `mtTouch(bool)`
(méthode de l'élément Ruffle, qui pose aussi l'écouteur de scène), que `player.js` appelle à chaque `pointerdown`
(phase de capture, avant Ruffle) avec `pointerType === "touch"` ; à la souris, rien ne change. `mtState().tip` /
`tipHold` : infobulle visible / tenue.
Test : `player.test.ts` (« touch: a tap on the pause sheet… »).

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

Avec l'API de lecture (tâche « lecteur amélioré ») : pause/vitesse/progression `9049b212…` (`?v=4`) ; avec saut,
blocage et capture, SHA-256 `1e54abf53911950cae99bcc819721b4eb7f5842b7c186cdbc9130ff6a50a5b4a` (deux builds dans
deux dossiers de travail : même SHA-256), `CLIENT_SWF` en `?v=5` ; avec `mtUnwait`, SHA-256
`dd1519e16f986931b696624d2159d3f0294577c7cd8c0d2059a252d3108c1c45` (deux builds : même SHA-256), `?v=6`. Le `pushbyte 14` du correctif ci-dessus est alors
à l'octet 302920 du corps décompressé (la classe des helpers a grandi ; un peu plus loin avec `mtUnwait`, `patch-play-textfields.mjs` le retrouve).
Avec les sauts instantanés (images clés) : SHA-256 `58e072e1d23e740452e4ba59e6eada186f39f3f03c488574d5879b5078bea466`, `?v=7` ;
plus rapides (réserve de soldats, pré-chauffage, rejeu caché allégé, état d'affichage rejoué) :
`7e0cf56b7b17438fc0b95936d3d89c08cdf67ef9dc61184762acf61dd24efc14`, `?v=8` ; pré-chauffage seulement en pause ou après la
fin (la lecture ne change pas), sans véhicule ni tween orphelin, rappels d'étiquette vidés :
`28ca9f9cf2662158b0e56708fabc72fde86bf23fc192f3782cbe42923b62ea81`, `?v=9` ; pause = la pause native (écran PAUSE,
sauts permis en pause) : `0b0d8d3b66aa8eb42548c1b24742379ba5c6cfa75072d696c9bd0cfa1b96202d`, `?v=10` ; simulation paresseuse :
`c88b2140e6752ed74976714dc1991c6734ec471ffb4fdf1a391c9a2a8410b646`, `?v=11` ; saut en attente rattrapé dans l'image
suivante, simulation par budget de 5 ms par image : `224914b5ca241b088aac0e3aa784e680843b5a3db06fa7decbbd750226137bab`,
`?v=12` ; pause (fondu, clics simultanés), ×1/16, compétences consommées rétablies : `00889d8b7ab730169172e94adb9cbb0e8579a07003f84c718acc3e2842fafe2b`, `?v=13` ; sons (`mtSfx`) :
`5334e1970720ea123c89b9c581514cf9bcff09f93546fa3a832cc5e5858292ce`, `?v=14` (à chaque fois deux builds dans deux dossiers de travail : même SHA-256). Depuis `?v=7`, deux
insertions P-code de plus dans le Game : `PC_PLAY_KF` (état 0, après `resolve()`) et `PC_PLAY_TICK` (`tick()`), ci-dessous ;
le reste du nouveau code est dans les helpers.

- Innocuité (`build.ps1 -Play -Verify`, `?v=14`) : 31 fichiers P-code diffèrent octet à octet, 6 hors renumérotation
  `newfunction N` : en plus de ceux ci-dessous, `§59=F\x03§` (trooper affiché : un appel en tête de `§3\x19/\x01§` et de
  `§\x16mf\x01§`), `§n#\x07\f§` (carte : un appel en tête de `§nEI(\x01§`) et, dans le Game, un appel en tête de
  `apply` (sons, ci-dessus) ; `§(m]a\x02§` (helpers), `§l\x0b\x01§` (`pushbyte 14` → `20`, ci-dessus), et, hors renumérotation des labels de saut (le Game n'importe plus `§;io&§`, que seul `tick()` appelait) :

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
 …
   callproperty QName(PackageNamespace(""),"MnRZ"), 0          (état 0 : battle.resolve(), PC_PLAY_KF)
+  getlex QName(PackageNamespace(""),"(m]a\x02")
+  swap
+  findproperty QName(PackageNamespace(""),"S\rNK\x02")
+  getproperty QName(PackageNamespace(""),"S\rNK\x02")
+  swap
+  callproperty QName(PackageNamespace(""),"mtKfGo"), 2
   convert_b
-  maxstack 2
+  maxstack 3

=== §Q\btf§ (Game, tick() §&~\x03'§, PC_PLAY_TICK)
-  getlex QName(PackageNamespace("`\x0b\x01.\tnP+"),";io&")
-  callpropvoid QName(PackageNamespace(""),"i\'\x04W\x02"), 0
-  getlex QName(PackageNamespace("`\x0b\x01.\tnP+"),";io&")
-  callpropvoid QName(PackageNamespace(""),"?d0r\x01"), 0
+  getlex QName(PackageNamespace(""),"(m]a\x02")
+  callpropvoid QName(PackageNamespace(""),"mtClips"), 0

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
