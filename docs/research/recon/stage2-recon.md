# Stage 2 recon — MiniTroopers remake (2026-11-22)

Scratch root: `C:\Users\kikik\minitroopers-work\recon\` (abbrev. `R\`). Abbrev: `$GL` = `C:\Users\kikik\minitroopers-ref`,
`$EX` = `R\assets\extra\site-elements` (copy of gitlab.com/eternaltwin/minitroopers/minitroopers-extra, branch `master`,
`site-elements/`), `$DEC` = `C:\Users\kikik\minitroopers-work\decomp\orig\scripts` (JPEXS of original client_fr.swf),
`$ENG` = `C:\Users\kikik\minitroopers\packages\engine\src`. Source priority per spec: SWF > archived pages > wikis > test server > $GL.

## 0. TL;DR (the decisions this changes)

1. **Original HTML/CSS/JS for every stage-2 page exists** in minitroopers-extra (`$EX/html/fr/*.html`, `$EX/css/style.css`
   = final CSS, `$EX/js/app.js` = final app.js with `mt.js.Tip`, `$EX/js/swfobject.js`, ~220 images in repo `site-elements/img/`).
   Missing pieces recovered from Wayback (`R\assets\wayback\static\jquery.min.js` = jQuery 1.5.1; 11 images in `R\assets\wayback\img\`).
2. **No page embeds army.swf / mini.swf directly.** Every Flash element (army grid on /hq, /b/opp; trooper on /t, /levelup,
   /add, home; battle) is `client_fr.swf?v=2` with `data=<haxe ClientMode>&chk=<32hex>`, the art SWF passed as `gfx`
   (`mini.swf` for troopers/grids, `army.swf` for battles). So **chk matters for every page, not just battles**.
3. **chk is NOT server-computable cheaply**: `chk = enc(md5(utf8(data)) XOR (VM(md5)[i] % 255))`, VM = an obfuscated bytecode
   program embedded in the SWF, run by an embedded interpreter, given a `BitmapData` factory. Verified over 86 original
   (data,chk) pairs: 65 distinct masks → mask depends on the digest. Recommend: **ship client_fr.swf with the one-branch
   `chk` bypass** (same patch point as oracle `PC_MAIN`, no traces). Details §3.
4. **Recruit cost table and upgrade/power formulas are in the SWF `Data` class** (`XP_LEVELS=[0,8,24,60,120,200,340,500,720,1000,1300,2000]`,
   `levelCost(n)=int((n+1)^2.5)`, `armyLevel=Σ(5+choices.length)`) → wiki confirmed, $GL `6n²+2` wrong.
5. **Skill min levels are in SWF data** (resolves most spec `UNVERIFIED` min levels): obtainable level = `min+3` (§2.6).
6. **All 6 faction armies recovered except one** (5/6 with exact names/seeds/choices from Wayback `/b/fview` of faction
   subdomains) — §2.15. Faction troopers: `pref: null`, all-zero choices, levels 20..10.
7. Level-up: SWF draws **3 options (+1 with SMART=4)**, page shows **2 (3 with Smart)**; URL carries the **skill id**,
   not the index. $GL's `generateSkillChoices` ignores Smart's extra draw → wrong offers after Smart (§2.5).
8. Original anti-CSRF: a 6-char session `key` (cookie `ssid`) on every mutating URL (`?levelup=KEY`, `?config=KEY`,
   `chk=KEY` …). Cookie also stores today's opponent list `opps:[5 ids]`.

---

## 1. Original page assets

### 1.1 Sources
- **minitroopers-extra** (`R\assets\extra-tree.txt` = full listing, 3734 entries). Useful dirs:
  - `site-elements/html/fr/`: `_.html` (home), `hq.html` (protected view), `hq-levelup.html` (logged-in + level-up popup),
    `t_0.html`, `levelup_0.html`, `add.html`, `b_opp.html`, `b_opp-2.html`, `b_fview_262579954.html`, `b_fview_262581433.html`,
    `b_view_bat1.html`, `b_view_miss1/2.html`, `b_view_raid.html`, `choice*.html`, `endDay`, `history`, `protect*`, `ranks`,
    `recruit` (AJAX fragment), `load_pos_0_count_16`, `check-name-warp`, `b_log_b_262581433`. `html/com/` = EN equivalents
    (`hq.html` full logged-in EN HQ, `levelup_3.html`, `t_0.html`, `add.html`, `b_opp.html`, `b_fview_172911485.html`…).
  - `site-elements/css/style.css` (44386 B) = byte-identical to Wayback `data.minitroopers.fr/css/style.css?v=5` (2014) and
    `.com` 2022 → final CSS.
  - `site-elements/js/app.js` (60414 B) = final (identical to Wayback 2021/22); Haxe-compiled: `mt.js.Tip`, `mt.js.Timer`,
    `haxe.Http`, `haxe.Md5`, `mt.db.Phoneme`, `Common.host`, global `_ = new js.App()` (`initCreate`, `selectTrooper`,
    `showTip`, `resetTip`, `startRecruit`→AJAX `/recruit`, `hideNotif`, `deltaMoney`, `adCycle`, `toggle`, `showDetails`→`/details?t=`).
    2011 `app.js?v=2` snapshot (53860 B) is an older build.
  - `site-elements/js/swfobject.js` = SWFObject 2.2.
  - `site-elements/img/` (~220 files): `skills.png` (30px sprite), boxes, `buttons/*`, `bg/*.jpg`, `mode/{garden,sewer,attic,wood}.jpg`,
    `levelup2.png/3/4`, `token.png`, `power.png`, `logo.png`, tooltip/popup frames, `swfframe*`, `favicon.ico`.
  - `site-elements/sitemap.md`: route/form/cookie reference (cookie structure lines 11-34; forms throughout). Worth reading.
  - `swf-original/`: `army.swf`, `client.swf`, `client_fr.swf`, `client_en.swf`, `mini.swf`. `swf-exported/`: JPEXS dumps.
    `tools/`: Haxe (un)serializer JS/PHP + obfuscated-key dictionary. `archive/`: fan material, not site markup.
- **Not in repo, recovered from Wayback** (into `R\assets\wayback\`): `static\jquery.min.js` (jQuery 1.5.1,
  `data.minitroopers.fr/js/jquery.min.js` @20110613000753); `img\att.png` (@20151105214113), `newrecruit.gif` (@20160802021025),
  `powers.png` (@20130531013247), `win.png` (data.minitroopers.com @20120516145206), `fb/minitroopers{,1..5,_general}.png`
  (www.minitroopers.com @20151105213412). Dead even originally: `art_1.jpg`, `buttons/button.png`. Ads/promo (braziball,
  twinoid, `mt/*`) skippable.
- Asset URL convention (FR): CSS/JS/SWF absolute on `http://data.minitroopers.fr/` (`css/style.css?v=5` (v=4 in 2012-13),
  `js/jquery.min.js`, `js/swfobject.js`, `js/app.js?v=2`, `swf/client_fr.swf?v=2`, `swf/mini.swf?v=2`, `swf/army.swf?v=2`);
  page HTML also uses relative `/img/...` served from the army subdomain. `imageurl` flashvar = `http://data.minitroopers.fr/img/`.

### 1.2 Wayback snapshots verified (HTTP 200, real content; fetch as `https://web.archive.org/web/<ts>id_/<url>`)
| Page | ts | URL | saved |
|---|---|---|---|
| home `/` | 20120429040253 | `http://dageohu.minitroopers.fr:80/` | `R\assets\wayback\home_fr_dageohu.html` |
| `/hq` | 20120406031104 | `http://agen06.minitroopers.fr:80/hq` | `hq_fr_agen06.html` |
| `/t/0` (EN) | 20120111053604 | `http://alfredhitchcock.minitroopers.com:80/t/0` | `t0_com_alfredhitchcock.html` |
| `/t/0?levelup=` | 20121017040020 | `http://0one2.minitroopers.com:80/t/0?levelup=oXpRGU` | `t0_levelup_com_0one2.html` (stale key → re-renders sheet) |
| `/t/0?equip=` | 20161003012659 | `http://0y0.minitroopers.com:80/t/0?equip=IMsBv6` | `t0_equip_com_0y0.html` (stale key → sheet) |
| `/levelup/0` | 20131001234104 | `http://hugov40.minitroopers.fr:80/levelup/0` | `levelup0_fr_hugov40.html` |
| `/add` | 20130628235008 | `http://amandine0.minitroopers.fr:80/add` | `add_fr_amandine0.html` |
| `/b/opp` | 20130702171835 | `http://jasoncrow.minitroopers.fr:80/b/opp` | `bopp_fr_jasoncrow.html` |
| `/b/fview` | 20210505214052 | `http://groin-celeste.minitroopers.fr/b/fview/261796353` | `bfview_fr_groin-celeste.html` |
| `/b/view/bat1` | 20120804000217 | `http://allanou03.minitroopers.fr:80/b/view/bat1` | `bview_bat1_fr_allanou03.html` |
| faction fviews | see §2.15 | | `R\factions\*.html` |
CDX listings (capped 20000 rows/domain): `R\assets\wayback\cdx-*.txt`. `www.minitroopers.fr/` always 302'd to a random army's
`/` → **home = recruit landing "L'armée de X recrute"** (no recruiter-less home captured).

### 1.3 Per page (FR originals; decoded flashvars in `R\assets\decoded\*.txt`, decoder `R\assets\tools\hxdec.js`)
Shared frame (all pages): `div.ptop > div.bottomsite > div.site > [.sp .pleft a.logo(/hq) .arthead .camera .ptopleft .pright]
> div.frame > div.ptopsite > div#content … div.dbottom (MT footer/ads, .copy "Forum · Modifier mon pass · (c)2011 Motion-Twin")`.
Logged-in pages: `div.home > #recruit, .money (tooltip), .power (tooltip "Puissance"), a.company (title: "L'armée de X" /
"Fiche de N" / "Ajoute un trooper" / "Choisir une compétence"), table.panels td.left (troopers grid + menu) / td.right`.
Notification popup `#notification` (`.poperror`) `.poptop>.popbottom>.popbg>.popcontent>.pop` + `<a onclick="return _.hideNotif()" class="button5">Ok</a>`,
`div.black`, `body.hideSwf`. Tooltips: `onmouseover="mt.js.Tip.show(this,'<div class=\'tiptop\'><div class=\'tipbottom\'><div class=\'tipbg\'><div class=\'tipcontent\'><img src=\'/img/pixel.gif\' class=\'pixel\' /><h1>…</h1><div class="s">…</div></div></div></div></div>')" onmouseout="mt.js.Tip.hide()"`.
Confirmations everywhere: `confirm('Confirmer cette action ?')`.

- **`/` (create)** `$EX/html/fr/_.html`: `<form action="/" method="POST" class="create">`; `.box4`: `<select name="part">` 0 "de ",
  1 "d'", 2 "du ", 3 "de la ", 4 "des ", 5 "" (FR article prefix; EN has none); `<input id="name" class="field" name="name" maxlength="20"/>`;
  `.host>.hostcheck+.hostname` (free/used via `GET /check?name=<host>` → `free|used`); hidden `mid`, `midc`, `tselect`.
  `.box5` "Choisis ton premier trooper parmi ceux-ci :" `ul.troopers` × 5 `li.trooper#tr_1000..1004 onclick="_.selectTrooper(1000,<seed>)"`,
  each a 72×71 SWF (ClientMode#2 (trooper, faction)) + `<ul>` of 2 skill icons (`/img/skills.png` offsets, tooltips = weapon
  stats / skill desc). Submit `<input id="submit" class="button4 button_off" type="submit" value="Valider" disabled>`;
  `_.initCreate('minitroopers.fr')`. A 1×1 `swf_regmid` SWF in ClientMode#3 (string like `"26:12269"`) computes the machine id →
  JS `onMID(mid, midc)` fills hidden fields (§3.4). Login: `.alreadyhave <form action="/login" method="POST"><input name="login"> value="Chercher"`
  (`/login?login=x` GET → `//x.minitroopers.fr/hq`). Test server equivalent (with tooltips HTML): `R\testsrv\home.html`.
- **`/hq`** `$EX/html/fr/hq-levelup.html` (logged-in), `fr/hq.html` (protected: `.insertpass` `<form method="POST" action="/login"><input type="hidden" name="login" value="Warp"/><input name="pass" type="password">`).
  Left: `.box1.hq` "Mes Troopers", `#trhome` grid SWF `swf_tr_view` 214×144 (2 rows) / 214×216 (3 rows), ClientMode#4 `{army, xmax:3, ymax, add:true, fac, space:-1, action:"on"}`,
  page JS `ttips[]`, `onOver(id)`, `onOut(id)`, `onClick(id){document.location = id==null?'/add':'/t/'+id}`. Menu
  `<div class="but bN"><div class="but_right bN_right"><a class="but_bg bN_bg">`: b1 `javascript:_.startRecruit()` "Recruter un trooper",
  b2 `/history`, b2 `/choice` "Gérer mon armée", b3 `/protect` (hidden once password set), b3 `/ranks` "Hiérarchie". `.tipbox .hqtip #menuTip`.
  `ul.history` (`li.defeat|li.victory > a[href=/b/fview/<id>]` "Défaite contre <strong>L'armée nSun</strong>" + `.extra` date;
  `li.newchild` → `/history` `newrecruit.gif`). Right: 3 `.box2` (`.box2bg` bg `/img/mode/{garden|sewer|attic|wood}.jpg`, `h1.hbox`):
  "Bataille": `.action.bcountN` one tile per daily battle: done → `b bwin`/`b bdefeat` linking `/b/view/batN` (img `bwin.gif`/`bdefeat.gif`),
  remaining → `b bgo2 > a[href=/b/opp].b_bg.bgo2_bg > img bgo2.gif`; `#bat_tip` "Il te reste 3 batailles aujourd'hui !".
  Mission box with `mt.js.Timer.TIMES="jhms"; mt.js.Timer.alloc(now, nextMidnight, 2, null)` countdown; Raid box. `.box10` recruit link
  (`value="http://warp.minitroopers.fr"`, FB/Twitter share), "Ta prochaine recrue te rapportera 50 [token]". `/hq?money=N` animates
  the counter (`_.deltaMoney`).
- **`/t/<n>`** `$EX/html/fr/t_0.html`: `a.company` "Fiche de Edonnell". Right: `div.sheet>table.tablesheet>td>ul.skills`:
  `li.soldier` holds 72×72 SWF `swf_showtr_<n>` (ClientMode#2 (trooper, faction)), then ~140 `<li style="background : url('/img/skills.png') -Xpx -Ypx">`
  in fixed order (repo `skills_placement.txt`, saved `R\assets\extra\skills_placement.txt`); owned → `class="on"` + tooltip.
  `td.sheetright`: `<a class="but_bg b3_bg img" href="/t/0?levelup=KEY">Améliorer pour 181 <img src="/img/token.png"/></a>`;
  rename `<a onclick="$('#rename').show(); $('#name').focus()">Renommer</a>` + `<form id="rename" style="display:none">` (no
  action/method → GET current URL `?name=…&chk=KEY`), warning "tu ne pourras changer le nom de ton trooper qu'<strong>une seule fois</strong> !",
  `<input id="name" name="name" maxlength="12">`; re-equip `<a href="/t/0?equip=KEY">` (only when >3 equipment, EN capture
  `t0_equip_com_0y0.html`); `<form id="config" method="POST" action="/t/0?config=KEY">` selects (each `onchange="$('#config').submit()"`):
  `weapon` (-1 Aucune, 0..k = **index into the trooper's own weapon list**), `loc` (-1 Partout, 0 tête, 1 coeur, 2 poumon droit,
  3 tripes, 4 bras g, 5 bras d, 6 jambe g, 7 jambe d), `target` (0 proche, 1 facile, 2 faible, 3 menaçant), `move` (0 Chasseur,
  1 Standard, 2 Défensif), `ttype` (-1 Défaut, 0 Soldat, 1 Medecin, 2 Pilote, 3 Artificier, 4 Scout, 5 Espion, 6 Officier COM,
  7 Saboteur); labels "Arme Préférée :", "Localisation Favorite :", "Ciblage :", "Comportement :", "Priorité :". **No reload pref
  in the UI** (reloadSystem always DEFAULT=2 in all captured data). `<a href="/hq" class="button5">Retour</a>`.
- **Level-up**: `/t/<n>?levelup=KEY` = action (pay + redirect to `/levelup/<n>`; bad key/insufficient funds → sheet). `/levelup/<n>`
  `$EX/html/fr/levelup_0.html`: "Edonnell est passé au niveau 9 ! Choisis une nouvelle compétence…", `table.levelup` (72×72 SWF +
  `div.up`) `div.levelup2` (levelup3/4.png exist) `td.boxes` × `div.box8 onclick="if(confirm(…)) document.location='/levelup/0?skill=137&chk=KEY'"`
  with `div.levelskill` sprite, `<h2>` FR skill name, `div.s` FR description + `<em>` quote. After choice, HQ popup "Félicitations !
  Ton trooper <b>X</b> a atteint le niveau <b>9</b> et a appris la compétence <b>Grenade fragment</b> !" (`fr/hq-levelup.html`).
- **`/add`** `$EX/html/fr/add.html`: `div.add` "Sélectionne un trooper… Chaque jour de nouveaux troopers sont disponibles…",
  same 5 `li.trooper` (SWF 72×71 has extra flashvar `&onclick=_.selectTrooper(1000,273018)`), script `_.onTrooperSelected`/`doRecruit()`,
  `<form id="add" method="POST" action="/add"><input type="hidden" name="tselect" id="tselect"/>` button "Ajouter pour 340 [token]".
  12 troopers → redirect `/hq`.
- **`/b/opp`** `$EX/html/fr/b_opp.html`, `b_opp-2.html`: `table.choose`, 5 × `td.choosetd.size1>div.backchoose>div.troopers`
  285×72 SWF `swf_opp_<armyId>` (ClientMode#4 `add:false, xmax:4, ymax:1, action:null, fac`) + `<a href="/b/battle?opp=<armyId>;chk=KEY" class="button5">Attaquer !</a>`
  (note `;`) + `<h1>L'armée de X</h1><ul class="carac"><li class="po"><img src="/img/powers.png"…/>14</li></ul>`; `td.choosetd.mate`:
  "Infiltre la base d'une armée de ton choix :" `<form action="/b/battle" id="friends" method="POST"><input name="chk" type="hidden" value="KEY"/><input name="friend" class="field"/></form>` "Infiltrer !".
  (sitemap: `/b/battle?opp=` → `/b/view/batN`; friend form → `/b/fview/<id>`.)
- **Battle view** `/b/view/batN` and `/b/fview/<id>` (`$EX/html/fr/b_fview_262581433.html`, `b_view_bat1.html`):
  ```html
  <div class="game"><div class="swfframe nam "><h1>L'armée nSun VS L'armée de Alex75</h1><div id="swf_battle" class="swf"></div>
  <script>var swfp = { menu : false, flashvars : 'data=<haxe>&chk=<32hex>&imageurl=http://data.minitroopers.fr/img/&endMsg=Tu%20as%20remport%C3%A9…%2B2%20%5BT%5D', scale : 'noscale', allowScriptAccess : 'always', bgcolor : '#F2DDB8' };
  swfobject.embedSWF('http://data.minitroopers.fr/swf/client_fr.swf?v=2','swf_battle',720,440,'10.0.0',null,null,swfp,{ id : 'battle', 'class' : 'swf' })</script></div>
  <script>function endBattle() { document.location = '/hq?money=2'; } battleID = '262581433';</script>
  ```
  `/b/view/*` adds `<a href="/hq" class="button5">Retour</a>`, `battleID='<uid>@<n>'`. endMsg variants: "Tu as remporté ce combat !",
  "Ce combat s'est soldé par un échec !", EN "+2 [T]"/"+1 [T]"; `[T]` = token glyph rendered by SWF using `imageurl`.
  The SWF also requests `/b/log` (string present in SWF; `$EX/html/fr/b_log_b_262581433.html`) — UNVERIFIED usage.

### 1.4 In-page trooper rendering (all via client_fr.swf)
ClientMode enum (`$DEC/§OP\`%5Ct%5Cx01§.as`, ctor indexes; dispatcher `$DEC/§,7u%5Cx1f§.as` `§\x074\x10\r§`):
| idx | ctor args | class | use |
|---|---|---|---|
| 0 | (battle obj, attackerSide:int) | `§Q\btf§` Game | battle |
| 1 | (obj) | `§(\x12\x1c\x01§.§\x0bVa\x1e\x02§` | `/choice` reorder (ExternalInterface `save`, `_.showDetails`, `/hq` redirect) — stage 4 |
| 2 | (trooper, faction:int) | `T$W` | single trooper (home/add: int 3..5 = per-offer colour; /t: army faction) |
| 3 | (string) | Main | machine id: `onMID(mid, hash(mid+arg+mid).substr(0,8))`, mid = 16-char base62 stored in SharedObject `gmid` |
| 4 | ({army:[trooper\|null], xmax, ymax, add:bool, fac, space:-1, action:"on"\|null}) | `§\x12^ \x1e\x01§` | grid; empty cells get "add" tile when `add`; JS callbacks `<action>Over/Out/Click(id)` |
| 5 | (army, int, bg) | `§\x02I**\x03§` | army vs itself demo 670×240 (history recruits anim?) |
Trooper object = `{name, seed, type:TrooperType#, id, choices:int[], force:Skill[], pref:null|{moveSystem, reloadSystem, leftOver:Skill[], __CBody, __CWeapon, targetType, targetSystem}}`
(obfuscated keys: `$ENG/input/flashvars.ts:5-34`). `gfx`=`…/swf/mini.swf?v=2`. Engine's `toFlashvars` only builds mode 0 and only `data=`.
Test server instead renders server-side SVG cards `/card/<base64url JSON {s:seed,fac,c:choices,p:{l:leftOver},n:name}>.svg` (R\testsrv\hq.html) — no Flash on HQ.

---

## 2. Rules (source + $GL divergence)

### 2.1 Daily trooper offer
- Original: 5 offers `tr_1000..1004` on `/` and `/add` (`$EX/html/fr/_.html`, `add.html`); "Chaque jour de nouveaux troopers"
  (add.html). Research doc: offer changes daily / per recruit link / per computer → the machine id (ClientMode#3 `mid`/`midc`
  posted with the creation form) is the "per computer" input. The original seed-derivation formula is **unknown** (server-side) → UNVERIFIED;
  derive e.g. `hash(day, mid|cookie, recruiterId, slot)` deterministically so reloads show the same 5.
- Offer previews carry a per-offer colour int (3..5 on home; test server `fac` 4,4,5,0,0) — cosmetic only.
- Seeds observed: 83 original player trooper seeds in `[273018, 16491340]` (< 2^24) ; faction troopers up to 31958229. Range of
  generation UNVERIFIED; any int32 works for the SWF.
- POST carries `tselect=<seed>` (server must check it is one of today's offers for this client).
- $GL (`apps/server/src/utils/TrooperDay.ts:11-59`): one global set of 5/day, seed = `"<daysSinceEpoch><rand 0..999>"`, names from a
  23-name list (`utils/Names.ts`) → diverges (not per computer/recruiter, wrong names).
### 2.2 Trooper names
- Server-side (not in SWF; no generator in `$DEC`). Observed original names = syllable composition: base {Kev, Max, Jon, Smith, Burt,
  Harr, Rog, Jack, Jaz, Huff, Georg, Rick, Mel, Krak/Kraw, Jeff, Luk, Dav, Bru, Sam, Russ, Karl, Hulk, Gold, Bomb, Ed, Lu…} + suffix
  {ones, eves, eed, ott, ips, ws, ey, eson, uter, off, emes, ersen, ield, ie, ust, ewis, onnell, eiber, old, enser, ito, ason, imiller,
  ater, erg, och/uch, aham, nnett, oum, ield, ane…} + optional decorations ("Mc" prefix, "Sgt.", "T-", "Don ", "Van ", "Sexy ",
  " Jr", " Kong", " Khan", "-X", " Lee", " Dick", " Yu", " Samu"). Full corpus extracted from originals: run the snippet in §5 or see
  faction rosters §2.15. Exact tables UNVERIFIED → build a generator from this corpus, mark UNVERIFIED.
### 2.3 Army name / subdomain
- Form: `name` maxlength 20 (FR original), test server 25; `part` article 0..5 (de/d'/du/de la/des/none) → display "L'armée de X",
  "L'armée d'X", "L'armée du Gecko nevrosé", "L'armée des ange purificateur", "L'armée nSun" (part 5) — seen on b_opp/fview.
- Subdomain = `Common.host(name)` (original app.js, identical in test server `R\testsrv\app.js:4-17`): removeAccentsUTF8 →
  lowercase → trim → `\s+`→`-` → strip `[^a-z0-9-]` → if >16 chars: first `-`-part if its length ≥8 else first 16 chars minus trailing `-`.
  Uniqueness checked via `GET /check?name=<host>` → `free|used` (`initCreate`, test app.js:1490-1556). Original `Common.hostValid`
  unknown (test server adds ≥3 chars + reserved list: www, local, data, admin, … `R\testsrv\app.js:18-26`). Forbidden words
  (original) UNVERIFIED; `mt.db.Phoneme` (phonetic normaliser in app.js:2041-2124) suggests phonetic matching was used server-side.
- $GL (`packages/shared/src/helper.model.ts:1-39`): 4–22 chars `^[a-zA-Z ]*$` + forbidden substrings {admin, api, army, discord,
  eternaltwin, false, invite, maintenance, null, oauth, ranking, true, undefined, war} → stricter than original (originals contain
  digits, hyphens, accents: "agen-blakla", "tyraël").
### 2.4 Costs (SWF Data class `$DEC/§%5Cx17@E{§.as:76,196-214`; engine `$ENG/data/data.ts:43,88-100`)
- Recruit: `XP_LEVELS[count]` for the (count+1)-th trooper: 8, 24, 60, 120, 200, 340, 500, 720, 1000, 1300, 2000; max 12 (array length).
  Confirmed by pages: "Ajouter pour 340" with 6 troopers (fr/add.html), EN "Add for 120" (4 troopers). $GL `getAddCost=6n²+2`
  (`troopers.model.ts:16-21`) wrong from 3rd trooper.
- Upgrade: `levelCost(choices.length) = int((n+1)^2.5)` = `floor(L^2.5)` for current level L (seen: 15, 181, 1024). $GL
  `getUpgradeCost(choices.length+1)` equal.
- Power: `armyLevel = Σ(5 + choices.length)` = 4×troopers + Σlevels. Verified against 15 original `/b/opp` displayed powers
  (script `R\chk\opp2.mjs`). $GL +5 on add, +1 per level: equal.
- Other unnamed SWF Data ints (same class, in order, likely server economy constants, mapping UNVERIFIED): 14, 5 (grid XMAX/YMAX),
  3, 32, 6, 2, 1, 4, 4, 100, 20, 500, 100, 3, 3, 1, [cost table], 5, 4, 400, 35, 5, 20. Plausible: 3 daily battles, 32 epic cap,
  2/1 win/loss, 4 mission, 4 raid phase, 100 raid/battle, 20 raid phases, 500 raid pool, 100 first bounty, 3 attempts, 5 mission
  unlock, 4 default deployment, 400 comms period, 35 bounty cutoff, 20 deployment cap.
### 2.5 Level-up choices
- Storage: `choices: int[]`, one entry per level-up after level 1; `level = 1 + choices.length` (Ghost: `lvl=-1; levelUp(0); for c of choices levelUp(c)`,
  `$ENG/logic/ghost.ts:93-103`). Entry = **index into that level's drawn options** (0/1, 2 with Smart); `-1` = skip (level++ without skill,
  ghost.ts:138); out-of-range reads `undefined`→0 = SOLDIER (ghost.ts:142).
- Draw: `drawOptions()` (ghost.ts:271-302) draws `choiceCount` distinct weighted options: base **3**, **+1 if SMART (skill 64)**
  (ghost.ts:363-365). At `lvl===4` (choosing level 6) pool = ARMY_JOB (specialisations) only.
- Display: original shows **2** boxes (3 with Smart: `levelup3.png`) — `$EX/html/fr/levelup_0.html`. So shown = first `choiceCount-1`
  of the drawn options (UNVERIFIED that it's the first ones, but index semantics require it). URL `/levelup/<n>?skill=<skillId>&chk=KEY`
  → server maps skill id → index in `drawOptions()` and appends it.
- Payment happens at `?levelup=KEY` (before the choice); a paid-but-unchosen level must persist (pending flag) — choices only grows on choice.
  Pending level-ups persist across days (research doc).
- $GL: `TrooperSkill.generateSkillChoices` always draws 3 (`troopers.model.ts:171-216`) — ignores Smart's 4th draw ⇒ wrong offers
  after Smart; $GL charges at choice time (`controllers/Troopers.ts:95-167`), accepts skillIndex 0..2.
### 2.6 Skill min levels (SWF `SKILL.min`, `$ENG/data/swfTables.gen.ts`)
Lock released when `lvl > min` after a level-up (ghost.ts:155) ⇒ first obtainable at trooper **level min+3**. min: 2 → lvl 5
(Aimant de combat, Increvable, Grenade clown/secousse, Poids lourd, Hyperactif, Dernier Mohican, Nerveux, Roi de la pétanque,
Forte poigne, Vendetta); 3 → 6 (Charge); 4 → 7 (Tank léger, Hélicoptère, Tank lourd, Bâton vaudou); 5 → 8 (Sac à dos, Tir aveugle,
Débardeur Bruce, Tir de couverture, Méfiant, Premiers-soins, Débordement, Tir ami, Pressé, Interception, Ressort, Sans repos,
Survivant, Talky-walky, Piétinement, Geignard); 6 → 9 (Balle perçante); 8 → 11 (Avion de chasse, Attaque à revers); 10 → 13
(Commandement, Grenade bénie, Grenade trou-noir, Occupation, Radio, Martyre). Resolves spec UNVERIFIED min levels (jet, black hole,
Martyr, Commander, Occupation).
### 2.7 Rename
Once, ≤12 chars (`maxlength="12"`), GET `/t/<n>?name=<new>&chk=KEY` (fr/t_0.html). Char rules UNVERIFIED (originals contain
spaces, accents, punctuation: "caca pipi pr", "chté piraté!", "Sgt.Jonones"). $GL: no rename.
### 2.8 AI prefs
- UI (§1.3 /t) → TrooperPref (`$ENG/input/types.ts:26-45`): `weapon` k → `CWeapon = Weapon enum of the trooper's k-th weapon`
  (-1 → null); `loc` → `CBody` BodyLoc 0..7 (-1 → null); `target` → `targetSystem` 0..3; `move` → `moveSystem` 0..2; `ttype` -1 →
  `targetType 0`, s∈0..7 → `targetType 1, targetClass = Skill s` (ARMY_JOB skill indexes 0..7 = Soldat..Saboteur; captured data:
  `TargetType:1:1 jy5:Skill:6:0`); `reloadSystem` fixed 2; `leftOver` from re-equip.
- Unlock by level (wiki, original-game.md "Prefs by level"): L1 weapon (if >1 weapon), L2 body part, L3 victim, L5 style, L6 priority
  class. Not verifiable from captures (only high-level sheets) → UNVERIFIED; spec passation says SPECIFIC_CLASS ≥6.
- Default pref: `pref: null` in data (faction armies, offers) = SWF `defaultPref()` (moveSystem 1, reload 2, others 0/null) `$ENG/data/data.ts:117-125`.
  Player troopers always send a pref object. $GL `getTrooperPref` forces targetType DEFAULT and `leftOver: []` (`troopers.model.ts:287-339`).
### 2.9 Re-equip (`leftOver`)
- Shown only when equipment (category EQUIPMENT=11) count > 3. Original action `/t/<n>?equip=KEY` ("Re-equip"); result screen not captured
  anywhere. Research doc: "`?equip=` re-rolls the equipped set" — i.e. server picks a new 3-subset (random) UNVERIFIED.
- Original data carries real `leftOver` lists (e.g. b_opp-2: `leftOver:[Skill 54, Skill 62]`; groin-celeste attackers `[Skill 66, Skill 100]`).
  Ghost removes leftOver skills from `skills` and `apply()` skips them (ghost.ts:111, 337-340).
- $GL `getLeftOver` (`troopers.model.ts:341-364`): items = TrooperSkill.getItems (cat EQUIPMENT); if >3: fill `selectedItems` up to 3 with
  the first missing ones in skill order, leftOver = rest; else []. Port needed (spec passation). Note $GL getItems uses $GL's (Smart-broken)
  TrooperSkill → port on top of the engine Ghost instead.
### 2.10 Daily battles
3/day +1 per trooper with COMMANDEMENT (skill 69), max 5 (wiki; SWF has constants 3 and 2 candidates). HQ shows one tile per battle
(`bcountN`, "Il te reste 3 batailles aujourd'hui !"). $GL: 5 fixed slots (`fights.model.ts:165-197`).
### 2.11 Opponent selection
- Original page: exactly **5 opponents** + attack-by-name form (fr/b_opp*.html, com/b_opp.html). Cookie stores `opps:[5 armyIds]`
  (sitemap.md:21-34) → list fixed for the session/day.
- Observed powers vs own power: own 75 → 14,14,14,14,14; own 99 → 14,14,21,14,79; own 39 (EN) → 17,11,37,55,80. So NOT tightly
  "near power" (late-era population); range rule UNVERIFIED. Opponent grids show the full army (displayed power = Σ(5+choices) of shown
  troopers, matched 15/15). "Partial armies" (research doc) happen in the battle, not the listing — UNVERIFIED.
- Attack by name: POST `/b/battle` `friend=<name>&chk=KEY` → `/b/fview/<id>`. Attack link `/b/battle?opp=<id>;chk=KEY` → `/b/view/batN`.
- $GL (`controllers/Fights.ts:27-87`, `fights.model.ts:160-163`): 4 slots, power ±10, excludes already-fought, fills with generated bots
  (`utils/generatedOpponents.ts`, `armyGenerator.model.ts`), name attack also power-limited.
### 2.12 Rewards
Battle 2 win / 1 loss (endMsg "+2 [T]"/"+1 [T]", `/hq?money=2`). $GL same (`Fights.ts:243`). Starting credits: $GL 100
(`Users.ts:18`) UNVERIFIED; creation power 5.
### 2.13 Referral bounty
Original: recruit #1 100, #2–4 50, #5–14 10, #15–34 5, #35+ 0 (research doc; SWF constant 35 present). HQ text "Ta prochaine recrue te rapportera 50".
$GL: `referralGold` default 100 then `getReferralPrice(sponsored+1)` (`Users.ts:85-124`, `user.model.ts:100-106`) ⇒ #1 100, #2–5 50,
#6–15 10, #16–35 5, #36+ 0 → **off by one** (4×50 instead of 3×50, etc.). Recruit counts only after visiting `/history` (stage 3).
### 2.14 Daily reset
~00:00 GMT+1 (research doc; FR HQ timer `alloc('… 00:55:51','… 00:00:00')`). Test server: 22:00 UTC (= 00:00 Paris summer) `R\testsrv\hq.html`.
$GL: cron `0 0 * * *` server-local (`apps/server/src/server.ts:92`).
### 2.15 Faction armies (Wayback `/b/fview` of faction subdomains, saved `R\factions\*.html`)
Each = 6 troopers, ids 0..5, `pref:null`, `type HUMAN`, `force []`, choices all 0 of length 19,17,15,13,11,9 (levels 20,18,16,14,12,10;
power 114), `__UP2 [0..5]`. Name/seed per trooper id 0..5:
| FR army (subdomain) | faction | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|---|
| L'armée de Sang-surs (`sang-surs`, fview 1601386 @20110612223627) | 0 | Sgt.Krawney 31958229 | Jackersen 13652125 | Hulkows 6850416 | Russeham 17101081 | Sexy Anders 16589479 | Kevo Lee 25775299 |
| L'armée du Soleil rugissant (`soleil-rugissant`, 122475487 @20130705214946) | 1 | MaxRogie 10203179 | Goldison 13114631 | Bombomes 3839934 | Burtersen 28544340 | Edu 23438256 | Georgater 24329918 |
| L'armée du Gecko nevrosé (`gecko-nevrose`, 13486569 @20111022122608) | 2 | Edeiber 20634579 | T-Joneves 21347269 | T-Kevemack 20668338 | Orlason 4687580 | Don Maxi 20021619 | Karlips 18331880 |
| (Torses velus — not found in CDX; presumably faction 3) | 3 | ? | | | | | |
| L'armée de Fol-ecume (`fol-ecume`, 13489062 @20111022141714) | 4 | Maxoff-X 9879995 | Van Georgeed 8035197 | T-Davinson 14458708 | Goldi 23550997 | Harre 13619293 | Samips 23558064 |
| L'armée du Groin céleste (`groin-celeste`, 13374045 @2011 and 106166394 @20130509 — identical) | 5 | Rogeter Samu 14997688 | Hulkito Kong 17249963 | G.I.Goldium 25279721 | Lukater Edo 23924483 | Rickas 21776570 | Kevewis 27803433 |
URLs: `https://web.archive.org/web/<ts>id_/http://<sub>.minitroopers.fr:80/b/fview/<id>`. Faction 3 roster: try CDX for other host
spellings (Wayback was rate-limiting/504 during this recon). Faction numbering = `faction` int in battle data (colour). Recruits inherit
recruiter's faction (research doc). $GL: no faction armies (colour only).
### 2.16 Bots / filler
Not original. $GL generator (`armyGenerator.model.ts:61-198`): composition from target power, levels random, choices all 0, names
"Adj Noun". Original-era opponent lists were full of power-14 single-trooper armies (level-10 trooper) — useful as filler template.

---

## 3. Battle replay in the browser

### 3.1 What the original battle page embeds
§1.3 battle view. Flashvars: `data` (Haxe-serialized `{mode: ClientMode#0({id:<battle seed>, bg:{gfx:"bg/garden.jpg", id:BackgroundType#0}, armies:[{troopers, faction, __UP2:[ids]}, …]}, attackerSide), gfx:"http://data.minitroopers.fr/swf/army.swf?v=2"}`),
`chk`, `imageurl=http://data.minitroopers.fr/img/`, `endMsg=<urlencoded text/HTML>`; optional `onclick`. SWF `client_fr.swf?v=2`
720×440, params `menu:false, scale:'noscale', allowScriptAccess:'always', bgcolor:'#F2DDB8'`; page defines `endBattle()` and
`battleID`. Main reads: `imageurl`, `data`, `chk`, `endMsg`, `onclick` (`$DEC/§,7u%5Cx1f§.as` `_rsq`), loads `gfx` via Loader.
Engine `toFlashvars` matches the data part (`$ENG/input/flashvars.ts:95-109`).

### 3.2 chk (decompiled `$DEC/§,7u%5Cx1f§.as` `_rsq`; `$DEC/§%3F6@m§.as`)
```
if (H.hash(params.data) != params.chk) return;          // silently shows nothing
H.hash(s): d = Md5(Bytes.ofString(s))                    // class §m#8\x01§ = haxe.crypto.Md5 (constants 1732584193…)
           m = VMfunc(d.bytes)                           // §R\x13\x19\x1c\x02§ → lazily built §\x12;CH\x01§
           out += cs[(d[i] ^ (m[i] % 255)) & 15] + cs[(d[i]^(m[i]%255)) >> 4]   for i<16
           cs = "0123456798abcdef"  (8/9 swapped; low nibble first)
VMfunc built in §(\x07\x184§(): program1 = s95 blob "CwABaQYAAy4u…" (strings: b, length, =, ^, %, +, r = XOR decryptor)
  run with b = program2 bytes (s378 blob) and r = new Rand(159753).random → decrypts program2; program2 run with B(w,h)=new BitmapData(w,h)
  → returns the function. Interpreter = package §\t[(a\x03§ (~1700 lines incl. _Interp).
```
Evidence it is digest-dependent: `R\chk\chkall.mjs` over all 86 (data,chk) pairs in `$EX/html` → 65 distinct masks
(`dec(chk) XOR md5(data)`); also the `$GL` sample (`apps/client/src/app/pages/admin/utils.js:2`, data with `army.swf?v=2`,
chk `26ceca6e…`) → mask `52cf75f7…`. No server secret in the classic sense: the "secret" is the embedded program (needs porting the
VM, and program2 may depend on Flash `BitmapData` semantics). Same data ⇒ same chk (repo shows identical chk on /t/0 and /levelup/0).
Options:
- (A, recommended) **Patched SWF**: change the single branch (oracle `PC_MAIN`, `tools/oracle/instrument/README.md:112`) to never
  return (or `chk != null` variant), no traces; one SWF for all modes. Keep the 86 vectors as a test if (B) is attempted later.
- (B) Port Md5 + interpreter + decrypt program2 (would let the server emit genuine chk for the untouched SWF). Effort unknown; could be
  validated against the 86 vectors via node.
- Test server does (A): `chk=gitlabRickGuedesOpentroopers` (dummy) with its own `client_en.swf` (`R\testsrv\fview.flashvars`); Eternaltwin
  remake passes only `data=` to `client_fr_edit.swf`.

### 3.3 Test server battle page (`https://bourrepif.trooperstest.gued.es/b/fview/17715841`, saved `R\testsrv\fview.html`)
- Scripts: `data.trooperstest.gued.es/js/ruffle/ruffle.js?v=2`, `jquery-3.7.1.min.js`, `ruffleobject.js` (`R\testsrv\ruffleobject.js`),
  `app.js?v=1` (original Haxe app.js + modified `Common.hostValid`), `select-grid.js`, `card-svg-ios.js`; CSS `css/style.css?v=7`.
- `ruffleobject.js` = drop-in `embedRuffleSWF(swfUrl, id, w, h, ver, express, flashvarsObj, paramsObj, attrs, cb)` with the swfobject
  signature: `RufflePlayer.newest().createPlayer()`, `player.config = {...params, allowScriptAccess:true, backgroundColor:'#F2DDB8',
  scale:'noscale', quality:'high', wmode:'transparent', splashScreen:false, autoplay:'on', unmuteOverlay:'hidden', contextMenu:'off'}`,
  `player.load({url, parameters: flashVars})` where `paramsObj.flashvars` (string) is passed as `parameters`.
- Embed: `embedRuffleSWF('https://data.trooperstest.gued.es/swf/client_en.swf?v=2','swf_battle',720,440,'10.0.0',null,null,swfp,{id:'battle','class':'swf'})`,
  `swfp.flashvars = "data=…&chk=gitlabRickGuedesOpentroopers&imageurl=https://data.trooperstest.gued.es/img/&endMsg=plux276-15%20claimed%20victory…"`,
  data gfx `https://data.trooperstest.gued.es/swf/army.swf?v=1`; `?trace=1` loads `client_en_trace.swf` that calls `ExternalInterface.call("simlog", ev)`.
  Below: a `<details class="battle-log">` server-rendered text log. HQ uses SVG cards instead of Flash; home form identical to original
  (`mid`/`midc` empty).
- Requests made to test server: `/`, `/hq`, `/b/fview/17715841`, `data…/js/app.js`, `data…/js/ruffleobject.js` (GET only).

### 3.4 Machine id (needed for creation limits / per-computer offers)
ClientMode#3(arg) → SWF `§\x0fnj\x1a§`: 16 chars base62 from an xorshift of `Date.now()`, persisted in Flash SharedObject `gmid._x`;
calls JS `onMID(mid, hash(mid + arg + mid).substr(0,8))`; page puts them in hidden `mid`/`midc`. With the chk-bypassed SWF and Ruffle
this still works (Ruffle SharedObject = localStorage) but `midc` needs the same hash (VM) to verify server-side → with option (A) treat
`mid` as unverified client data (or replace with a cookie).

---

## 4. Engine public API gaps for stage 2 (beyond the spec "Passation" list)
1. `levelUpOptions(seed, choices, pref?)` → `{options: skill[] (first choiceCount-1), drawn: skill[], choiceCount}` + `choiceForSkill(…, skillId)`
   — needs Ghost state after replaying choices; today only internal `Ghost.drawOptions` (`$ENG/logic/ghost.ts:271`).
2. Pending/next-level semantics helpers: `trooperLevel(choices)=1+len`, `upgradeCost(choices)=levelCost(len)`, `recruitCost(count)=XP_LEVELS[count]`,
   `armyPower(army)` — exist only as `Data.*` internals (`$ENG/data/data.ts:43,91-100`) → expose as stable game API.
3. `describeTrooper` must include: weapon list in order (for the `weapon` select index → Weapon enum), equipment list (cat 11) for
   re-equip, owned skills (for the ~140-icon sheet with `skills_placement.txt` order), specialisation (job), life, physical.
4. Client flashvars builders for non-battle modes: `toTrooperFlashvars(trooper, faction, gfx)` (mode 2), `toGridFlashvars({army, xmax, ymax, add, fac, space, action}, gfx)`
   (mode 4), `toMidFlashvars(str)` (mode 3), and generic params (`chk`, `imageurl`, `endMsg`, `onclick`) — `toFlashvars` today returns
   only `data=` for mode 0 (`$ENG/input/flashvars.ts:95`). Must allow `pref: null` and `null` grid cells.
5. `pref`→`toFlashPref` should accept `pref: null` with BattleTrooperInput for factions/offers (already typed `TrooperPref|null`) — fine;
   but `TrooperPref.name` field is required and meaningless (types.ts:35) — drop or ignore.
6. Static skill metadata for pages: FR names are in `swfTables.gen.ts` (`name`); **FR descriptions/quotes are not** — must be extracted
   from original page tooltips (`$EX/html/fr/t_0.html`, `levelup_0.html`, home offers) or another source; weapon stat tooltips derivable
   from WEAPON rows. Sprite offsets: `skills_placement.txt`.
7. Battle seed generator + structured result (spec already lists result); attackerSide semantics for name attacks.
8. Optional: chk port (§3.2 B) if the untouched SWF is wanted.

## 5. Reproduce
- chk masks: `node R\chk\chkall.mjs R\assets\extra\site-elements\html`; single vector `node R\chk\chk1.mjs $GL\apps\client\src\app\pages\admin\utils.js`.
- Opponent power check: `node R\chk\opp2.mjs <b_opp.html>`.
- Decode any page payload: `node R\assets\tools\hxdec.js <page.html> [n] [maxlen]`.
