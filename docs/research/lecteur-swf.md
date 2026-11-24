# Enhanced replay player: research on the battle client (`client_fr_play.swf`)

Research notes for a native replay player (pause, speed ×1/8…×32, seek to wave/event, progress reporting,
share-a-moment links, stuck detection, screenshot) built by patching `assets/swf/client_fr_play.swf` with the same
P-code path as `tools/oracle/instrument/` (`ffdec -replace` + helpers in the empty class `§(m]a\x02§`).

Sources: FFDec 26.5.0 AS3 export of `client_fr_play.swf` (290 classes) and a P-code export of the Game class.
No Motion-Twin code is reproduced here beyond identifiers and ≤5-line P-code excerpts at hook points.

## 0. Identifier conventions (read first)

- Identifiers are written as FFDec prints them (`§…§`, `\xNN` escapes). **Several contain a raw U+007F**, written
  `{DEL}` here (same convention as `patch-msg.as` / `build.ps1`). The FFDec AS3 export *does* contain the raw
  U+007F but it is invisible in most terminals/editors: always copy names from a P-code export or a
  `sed 's/\x7f/{DEL}/g'` view.
- Names that carry `{DEL}` and matter here: Game's animation list `§{DEL}=\x04u§` (also the Key callback table
  `§\x19o#c§.§{DEL}=\x04u§`), the state value `§(\x1ar3§.§{DEL}\x0fY@§`, the tween/FX packages `§`\x0b\x01§.§{DEL}\f\x01§`
  and top-level `§{DEL}\f\x01§`, the fading tween `§{DEL}C\x12o\x01§`, the particle class `§)Kw{DEL}\x02§`, the
  display-trooper "busy" flag `§{DEL}\x0b;_\x02§`, the local/field `§{DEL}(\x01§` (trooper), the text field
  `§9AJ{DEL}§` (`name` of data rows), the ammo field `§+8\x19{DEL}§`.
- Names verified to have **no** `{DEL}` (grep of the DEL-substituted export): everything else cited below.
- P-code: `QName(PackageNamespace(""),"<name without §>")`; e.g. Game frame() is
  `QName(PackageNamespace(""),"k\n/$\x03")`.

## 1. Startup flow

| Step | Where | What |
|---|---|---|
| Flashvars | `Main §,7u\x1f§._rsq()` (`scripts/§,7u%5Cx1f§.as`) | reads `imageurl`, `data`, `chk` (check bypassed in the play build), `endMsg`, `onclick`; Haxe-unserializes `data` into `Main.§dA+v§`; loads the gfx (`army.swf`). |
| Game creation | gfx COMPLETE handler `Main.§\x074\x10\r§` | ClientMode 0 → `new §Q\btf§(params[0], params[1])` (3rd ctor arg never passed → always a plain `logic.Battle`), adds `game.§\x011wD§` (the Game MovieClip) to `Main.§E_i\b§`. |
| Game ctor | `§Q\btf§` (`scripts/§Q%5Cbtf§.as`) | builds `battle §S\rNK\x02§ = new §\x0b\x0eNO§(data)`, state `§)\x11\x1d\x0e§ = §(\x1ar3§.§\x15;R\f§` (0), Key init, `ENTER_FRAME → §&l\f[\x01§` on `§\x011wD§`, `ExternalInterface.addCallback("logerror", §\x02#\x01\x0e\x03§)`. |
| Compute | ENTER_FRAME `§&l\f[\x01§`, state 0 | up to 200 `battle.MnRZ()` (resolve) per frame; when true: `queue §\x1e-\x02\x07\x01§ = battle.§7\x13JZ\x03§` (history, **same array**) and state = `§{DEL}\x0fY@§` (1). |
| Wait background | state 1 | waits `§n#\x07\f§.§*#\x01§.§*M\x01§ != null` (background image from `imageurl` loaded), calls the no-op `§e\b(C\x03§`, state = `§c8Y#\x02§` (2). **If the image never loads, the replay never starts.** |
| Playback | state 2 | `this.§k\n/$\x03§()` once per frame (= **frame()**). |

Frame rate: 40 fps (`[SWF(frameRate="40")]` on the preloader `§Z(Hf\x02§`); `stage.frameRate` is never written.

### P-code of the hook points (ENTER_FRAME `§&l\f[\x01§`)

State 0 → 1 (same spot as the oracle's `PC_GAME`; insert `mtInit` after the `initproperty`):
```
findproperty QName(PackageNamespace(""),")\x11\x1d\x0e")
getlex QName(PackageNamespace(""),"(\x1ar3")
getproperty QName(PackageNamespace(""),"{DEL}\x0fY@")
initproperty QName(PackageNamespace(""),")\x11\x1d\x0e")
jump ofs0068
```
State 2 call site (the whole case; note `findproperty`, not `getlocal0`):
```
ofs0093:
findproperty QName(PackageNamespace(""),"k\n/$\x03")
callpropvoid QName(PackageNamespace(""),"k\n/$\x03"), 0
ofs009a:
returnvoid
```
Proposed replacement of the two middle lines: `getlex QName(PackageNamespace(""),"(m]a\x02")`, `getlocal0`,
`callpropvoid QName(PackageNamespace(""),"mtFrame"), 1` (label `ofs0093` kept on the first instruction).

## 2. Playback loop

### Game (`§Q\btf§`) members used

| Readable | Name | Type / note |
|---|---|---|
| singleton | `§Q\btf§.§*#\x01§` (static) | current Game |
| state | `§)\x11\x1d\x0e§` | enum `§(\x1ar3§`: 0 `§\x15;R\f§`, 1 `§{DEL}\x0fY@§`, 2 `§c8Y#\x02§`; index in `.§)-Z\x19\x01§` |
| battle | `§S\rNK\x02§` | `logic.Battle`; `.§7\x13JZ\x03§` = history |
| queue | `§\x1e-\x02\x07\x01§` : Array | pending history entries (consumed with `shift()`; it *is* `Battle.history`) |
| current step | `§^h'l\x02§` : `§I&\x01§.§;!\x11[§` | null between steps |
| display clock | `§uN\x0ed§` : int | btime units, advances toward the step's entry time |
| clock high-water | `§|H6s\x03§` : int | steps apply only when this ≥ entry time |
| ticks per frame | `§\x0bKd~\x03§` : int | recomputed at each frame() |
| seek target time | `§(3\x07&§` : Object | **dead code**: never set; when set, 64 ticks/frame until clock ≥ target |
| hit-stop queue | `§~Y\x12(\x01§` : Array | frames to freeze; filled by `§;M?*\x01§(arr)` |
| animations | `§{DEL}=\x04u§` : Array | live `§kw|c\x02§` actions |
| tween manager | `§;\x1az\x01§` : `§`\x0b\x01§.§{DEL}\f\x01§.§\x1b\b2E\x02§` | also installed as `§5\x1f\x01§.§\x1bxD1\x03§` (static) |
| map / scene | `§F;R\x12\x01§` : `§n#\x07\f§` | particles in `§n#\x07\f§.§\x1fs\x0ev§` |
| side panels | `§a]e\x1b\x02§` : Array of `§f\x03\x02§` | updated by BattleMsg 40 |
| clock widget | `§-\x05p,\x03§` : `§^\x05\x01!§.§'/~0\x03§` | top-right time counter |
| display troopers | `§`1\x1f*\x02§` : Array of top-level `§59=F\x03§` | lookup by id: `§;|^W§(id:int)` |
| corpses | `§\x1dI\x02\r\x03§` | cleared on NewWave |
| ground items | `§\\\x123a\x03§` | removed on checkpoint rebuild |
| skip flag | `§'A~X§` : Boolean | set by the skip, consumed by the checkpoint rebuild |
| pause screen | `§w\x0b\x01o\x02§` : `§^\x05\x01!§.§J\b\x17Z\x03§` | native "PAUSE" overlay |
| ended | `§HUgt\x03§` : Boolean | set by the End action |
| step counter | `§\x02^\x10}\x03§` | ticks since current step started (clock acceleration) |

### Methods

| Readable | Signature | Behaviour |
|---|---|---|
| onEnterFrame | `§&l\f[\x01§(param1:*):void` | 3-state machine above |
| **frame()** | `§k\n/$\x03§():void` | if pause screen: `pause.§&l\f[\x01§()`; return. Else `ticks = 1`; `16` if `Key.§\x13\x01§[107]` (numpad +); `64` if `§(3\x07&§ != null`. Then hit-stop: if `§~Y\x12(\x01§` non-empty, decrement head, `return` unless it reached 0 (**one hit-stop frame per frame() call, not per tick**). Then runs tick() `ticks` times (stops early when clock ≥ `§(3\x07&§`). |
| **tick()** | `§&~\x03'§():void` | updates every `§{DEL}=\x04u§` animation (`§&l\f[\x01§`); if no step and queue non-empty → `§|Icg§()`; advances `§uN\x0ed§` by `1 + int(stepTicks*0.1)` toward the step time, updates `§|H6s\x03§`; clock widget; `§;\x1az\x01§.§&l\f[\x01§()` (tweens); panels; `§;io&§.§i'\x04W\x02§()` and `§;io&§.§?d0r\x01§()` (Clip anims); `§F;R\x12\x01§.§&l\f[\x01§()` (map + particles). |
| nextStep | `§|Icg§():void` | `§^h'l\x02§ = new §;!\x11[§(queue.shift())` |
| apply | `apply(param1:Object, param2:Array):void` | big switch on `entry.§An%6§.§)-Z\x19\x01§` (BattleMsg index), creates the action anim, then `anim.§?{\x1em\x03§(troopers)` |
| isFast | `§Bl{K\x01§():Boolean` | `return §\x0bKd~\x03§ >= 8` (suppresses some FX) |
| **skip to next checkpoint** | `§KV\t\x16\x03§():void` | bound to Space |
| checkpoint rebuild | `§;`b\x1c\x02§(param1:Array):void` | apply case 38; does nothing unless `§'A~X§` |
| togglePause | `§;y\x1a-§():void` | creates / closes the native pause screen (unless ended) |
| show trooper card | `§5 \x01\x04\x02§(param1:§59=F\x03§):void` | pauses + card (trooper MOUSE_DOWN) |
| abort | `§g\x11-B\x02§():void` | Ctrl+Alt+B: pause + `logerror` |
| destroy | `aGx2():void` | removes listeners/clip, resets Key |

### Step: `§I&\x01§.§;!\x11[§` (`scripts/§I&%5Cx01§/§;!%5Cx11[§.as`), extends `§kw|c\x02§`

- Fields: entry `§SV\x1d\x01§`, involved display troopers `§\tN]t\x01§`, ids not yet on screen `§(;D\n§`,
  timeout counter `§/\x12#\x1c\x02§ = 500` (inherited, decremented every tick).
- Each tick: when the counter hits 0 → `new §{DEL}\f\x01§.§\x01w\x19\x14§.§\x04]z)\x03§()` (debug: tints troopers
  that are not idle). Waits for every pending id to exist, every trooper `§\x01|fz\x01§()` true, and
  `game.§|H6s\x03§ >= entry.time`; then `game.apply(entry, troopers)` and `aGx2()` (which nulls `game.§^h'l\x02§`).
- History entry keys: `type "An%6"`, `time "uN\x0ed"`, `tid "\x1e,d\x01"` (README of the oracle).

### Animations: base `§kw|c\x02§` (top-level file `§kw%7Cc%5Cx02§.as`)

- Ctor pushes itself into `game.§{DEL}=\x04u§`. `§&l\f[\x01§()` = `--§/\x12#\x1c\x02§`.
- `§?{\x1em\x03§(troopers)` locks them (`trooper.§\x07\x15np\x02§ = true`); `aGx2()` → `§XMY/§()` unlocks, removes from
  the list. `ylcZ()` = skip (default `aGx2`; overridden in `§\x0f9G@\x01§`, `§(qs[§`, `§ae\x1f\t§`).
- End of an action: tween callbacks (`§Zw\x04\x03\x02§` on `§5\x1f\x01§` tweens) or the action's own tick counter.
- Display trooper idle: `§59=F\x03§.§\x01|fz\x01§()` = `!§r\x01w#§ && !§{DEL}\x0b;_\x02§ && !§\x07\x15np\x02§`
  (moving / busy / locked).

### Waves and checkpoints in history

- Engine (`packages/engine/src/logic/battle.ts`): `CheckPoint` (38, all trooper infos) is emitted by `check()` at
  battle start (after the initial deploy), at the end of every `newWave()` (after `NewWave` 39 and the redeploy), and
  in `setWinner()` right before `Winner` (34). `check()` is followed by `PlayerStatus` (40) per side.
- Wave k (k ≥ 1) starts at the k-th 39; seek anchors = 38 entries. Winner (34) is the last entry.

### Native skip `§KV\t\x16\x03§` (Space)

Finds the first 38 in the queue (returns if it is the head or absent), slices the queue there, `step.aGx2()`,
`§'A~X§ = true`, `§uN\x0ed§ = entry.time - 1`, then `ylcZ()` on a copy of `§{DEL}=\x04u§`. When the 38 entry is
applied, `§;`b\x1c\x02§(infos)`: ground items `§h|\x1dr§`, troopers `§'~i\x17\x03§` (reset), update or create each
trooper from infos (`§\x17;!\x01§(info, true)` / `§y#;B\x01§`), destroy the others, re-sort the scene
(`§qp[q\x02§`), fade corpses with `§{DEL}C\x12o\x01§`, clear `§'A~X§`.

### End of battle

- apply case 34 → `new §I&\x01§.§r`M8\x03§(winner, side)` and **queue = []**. Constructor sets `§HUgt\x03§`, picks
  victory/defeat text `§\x17@E{§.§\x16IT\x04§[5|6].§9AJ{DEL}§` ("bataille terminee." hard-coded for side 2), slides it
  in; after 60 ticks `§;\x12TI\x02§()` shows the panel `§^\x05\x01!§.§b*i\b\x01§(text, endMsg, §tX\x121\x03§)`; its
  button calls `§tX\x121\x03§` → `ExternalInterface.call("endBattle")` (**on click only**).

### Native keys (`§`\x0b\x01§.§NOJE\x03§.§\x19o#c§`)

Space → `§5z77\x01§` = Game skip; numpad + held (`§\x13\x01§[107]`) → 16 ticks/frame; Ctrl+Alt+B (`§{DEL}=\x04u§[66]`)
→ abort. Map click (`§n#\x07\f§.§\x19u\tu\x02§`) → togglePause; trooper click → card.

## 3. Time sources and speed

- Tick-driven (scale exactly with the number of ticks): actions, steps, tweens (`§5\x1f\x01§` subclasses),
  Clip animations (`§;io&§`, frame cursor + `gotoAndStop`), particle physics and lifetimes (`§)Kw{DEL}\x02§`, map
  update), hit-stop (per frame() call), clock.
- Not tick-driven: **native MovieClip timelines** — `gotoAndPlay` in `§(qs[§`, `§n#\x07\f§`, `§{DEL}\f\x01§.§\x05r')\x02§`;
  `play()` in `§i7R!\x01§` / `§M#+6§`; frame-script one-shots (`§b\x0feq\x03§` removes itself at frame 46, symbols
  200/55/56/184 `stop()`). No code waits on a timeline frame.
- `getTimer` (wrapper `§};N\x01§.§2\x14\x04z§`) is unused; `setTimeout` only at boot; no Timer; no delta time;
  **no sound at all** (no `flash.media`).

Options:
- (a) `stage.frameRate`: uniform for everything (timelines included) but choppy; above ~1.5× unreliable
  (Ruffle limits catch-up frames per tick — not verified in source; Flash caps at 1000).
- (b) **call frame() N times per player frame** (recommended): exact for all tick-driven state *and* hit-stop
  (consumed per call). Timelines keep 1 frame/frame → at high speed they look slow or are cut short (particle
  lifetime ends first). Cosmetic only.
- (c) global delta: none exists; would need hundreds of edits. Rejected.

Recommendation: speed ≥ 1 → frameRate 40, `n = floor(acc += speed)` calls; speed < 1 → either `stage.frameRate =
40*speed` (uniform, choppy) or accumulator at 40 fps (smooth, timelines unslowed). Pause → n = 0 (timelines finish
their few remaining frames). Add a helper flag to `§Bl{K\x01§` so speeds ≥ 8 suppress the same FX as the native
16× mode. Native 16×/64× do **not** scale hit-stop (~22 frames ≈ 0.55 s per critical).

`§Bl{K\x01§` body (patch: OR a helper static before `returnvalue`):
```
findproperty QName(PackageNamespace(""),"\x0bKd~\x03")
getproperty QName(PackageNamespace(""),"\x0bKd~\x03")
pushbyte 8
greaterequals
returnvalue
```

## 4. Seek

- **Forward (robust):** jump to the last 38 at or before N (prefer the one right after a 39) with a helper copy of
  `§KV\t\x16\x03§` generalised to a target index (also clear `§~Y\x12(\x01§`), then fast-forward: loop frame() inside a
  getTimer budget (~10 ms/frame) with the fast flag on and `game.§\x011wD§.visible = false`, until the applied index
  reaches N. Pure fast-forward without jump also works (deterministic up to cosmetic `Math.random`).
- Cosmetic RNG: `Math.random` (also via the random-int helper `§j\x14\x17\x01§.§(f-(§`); end
  animation uses `§b\x17-*§` seeded with the battle id. Nothing is drawn into the background after load (no lost
  decals). Jumping to the pre-Winner checkpoint fades the current wave's corpses and drops its ground weapons.
- **Backward:** not possible in place. The queue *is* `Battle.history` (consumed); apply mutates entries (cases
  41/42 `shift()` their arrays) and display troopers keep references to checkpoint info objects. v1: the page
  recreates the Ruffle player and calls `mtSeek(N)` on `mtReady`. v2 option: `game.aGx2()`, reset
  `§P!L/\x02§.§&Z\x01H§.§\x02XD\x01§ = 0` (static weapon-id counter, the only shared logic static), `new §Q\btf§(...)`;
  risks: Key listeners added twice, static singletons swapped; verify total and winner match.

## 5. Outcome boundary

History is complete before state 1. The logic package `§P!L/\x02§` uses no `Math.random`/`getTimer`; the display
only reads it (trooper cards build Ghosts with their own RNG). Hooks at state ≥ 1 cannot change the battle. Never
patch Game state 0, the Battle constructor or `_rsq`'s `data` parsing. The server computes the result with the
engine anyway; `endBattle` only navigates.

## 6. JS bridge

- Existing: `addCallback("logerror")` (Game ctor); `call("eval","document.location.host")`, `call("eval","battleID")`;
  `call("endBattle")`; `onclick` flashvar → `call("eval", …)`; `navigateToURL` in `§};N\x01§`; unused
  `"onKeyEvent"` in `§yep\x01§`.
- Embed already sets `allowScriptAccess:'always'`; element id `battle` (`apps/server/src/views/battle.ts`,
  `views/swf.ts`, `public/js/embed.js`). Ruffle exposes `addCallback` names as element methods and supports
  objects/arrays in `call`. Whole-player freeze: element `.pause()` / `.suspend()`.
- Proposed helper statics in `§(m]a\x02§`, registered from `mtInit` (state 0→1):
  - calls in: `mtPause()`, `mtResume()`, `mtSpeed(x:Number)`, `mtSeek(index:int)`, `mtState():Object`,
    `mtShot():String`;
  - calls out: `mtReady({total, checkpoints, waves})`, `mtProgress(idx, time, wave)` (≤ once per frame, on change),
    `mtStuck(idx, nonIdleIds)`, `mtEnd()`.
  - Applied index without touching apply: `idx = total - queue.length - (step != null ? 1 : 0)` (jumps to `total`
    at Winner).
- Stuck: `game.§^h'l\x02§.§/\x12#\x1c\x02§ <= 0` (> 500 ticks waiting), or state 1 for > ~10 s. Remedy offered:
  checkpoint skip.
- Screenshot: SWF side `BitmapData(720,440).draw(stage)` → `getPixels` → base64 (~1.7 MB) → page canvas (the pause
  screen already relies on `draw` under Ruffle). Ruffle's WebGL context has no `preserveDrawingBuffer`, so
  `toDataURL` page-side is unreliable.

## 7. Battle log

The SWF prints no log, only floating texts (`§59=F\x03§.§,k!6\x03§`, `§\x18nr\r\x02§`): skill names
`§\x17@E{§.§\x05\x04;|§[i].§\x032\x1a4§`, comms orders `§}}*h§`, statuses `§@)Z@§`, UI texts `§\x16IT\x04§`
(resource `_res/_44f8f2b8…`: 4 end button, 5/6 win/lose, 7/8 floating hit texts). Generate the log server-side from
the engine history (index-aligned with the SWF); names are in `packages/engine/src/data/swfTables.gen.ts`; the UI
text table is not yet extracted (`gen-engine-data.mjs` could).

## 8. Patch sizes and risk (lowest first)

| Patch | Size | Risk |
|---|---|---|
| `mtInit(this)` at state 0→1 | 3 P-code lines | very low (read-only) |
| state-2 call site → `mtFrame(this)` | 2 → 3 lines | low |
| `§Bl{K\x01§` fast flag | ~4 lines | low |
| helper AS3 in `§(m]a\x02§` (mtFrame ~90, mtJump ~25, mtInit/callbacks ~40, mtShot+base64 ~40) | ~200 lines | low–medium |
| page JS (controls, timeline, synced log, `?at=N`) | ~150 lines | — |
| server log text | 200–400 lines TS | — |

Risk order: progress (none) < speed/pause by call count < fast-forward seek (perf only) < screenshot < checkpoint
jump (Motion-Twin's own skip, cosmetic gaps) < in-SWF rewind (high → use page reload).
Performance: cap calls per frame by time, hide the Game clip while seeking; the map already thins particles
(`§n#\x07\f§.§\b&\tS§`). Free today: Space (next wave) and numpad + (16×) once the player has focus.
