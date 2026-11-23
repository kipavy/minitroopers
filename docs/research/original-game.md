# MiniTroopers (Motion-Twin, 2011–2023) — original game reference

Compiled 2026-11-22 from: Fandom EN wiki (minitroopers.fandom.com, 283 pages via api.php raw
wikitext), Twinpedia FR (Wayback: /minitroopers/bonus/start 2011 & 2016, /start 2013,
/niveau/start 2017), archived minitroopers.com pages (0one2.minitroopers.com /hq /t/0 /add
/endDay /protect /b/opp; 0y0.minitroopers.com /ranks /history; k.1.minitroopers.com/choice;
0wolf0.minitroopers.com/b/view/raid; www.minitroopers.com/), Wayback CDX of minitroopers.com.
FR release 27 Apr 2011. Items marked (?) are unverified.

## Key facts
- 8 specializations (helmets, chosen at level 6): Soldier, Doctor, Munitions, Pilot, Scout,
  Spy, Comms. Officier, Saboteur. No Sniper/Medic/Rat class.
- 140 skills = 8 specs + 30 weapons + 5 vehicles + 97 others. Random level-up pool excludes
  specs and the 4 starting weapons: 125 (126 Scout, 128 Doctor).
- Single currency: Credits. No premium, no Twinoid/Muxxu login, no trophies, no chat/friends.

## Accounts & pages
- Army = account, subdomain `<army>.minitroopers.com`. Cookie-bound; optional password on
  `/protect` (only from creating computer). Armies cannot be deleted. ~2 armies/IP, ≤3/day.
- Creation on `/`: name army, choose first trooper among 5 offered (offer changes daily /
  per recruit link / per computer).
- Factions (6 bot armies, 6 troopers lvl 20,18,16,14,12,10, power 114): Dalai Farmers (green),
  OK Lumberjacks (yellow), Exploding Carrots (red), Party-loving Hermits (orange), Order of the
  Sainted Trousers (blue), Wretched Individuals (purple). Uniform colour inherited from
  recruiter's faction; random if created from main site. No gameplay effect.
  FR names (pairing ?): torses velus, Gecko nevrosé, Sang-surs, Soleil rugissant, Fol-ecume,
  Groin celeste.
- `/hq`: credits, power, trooper list, "Pick a fight!" (N left), "Mission: <type>, 3 attempts",
  Raid, recruit panel (link, "next recruit will earn you N", share), last defensive replay,
  "New recruit available!".
- `/t/<n>`: upgrade for X credits; rename ONCE (≤12 chars, `?name=`); `?equip=` re-rolls the
  equipped set when >3 equipment items; AI preference dropdowns; `?levelup=` choice screen.
- `/add`: buy trooper from daily offer. `/b/opp`: ~5 armies near your power + "Select an army
  base to infiltrate: [name]". `/b/view/bat<N>|miss<N>|raid`: Flash `client_en.swf`.
  `/b/fview/<id>`: share replay (expired eventually).
- `/history` (after first recruit): up to 50 best recruits animation; last 10 defensive
  battles; last 10 recruits with credits + total.
- `/choice` (≥5 troopers): drag-and-drop deployment order.
- `/ranks` (≥20 power or 3 troopers bought): armies recruited by your recruiter, by power
  (Faction, Army, Size, Power). No global ladder.
- `/endDay`: "That's all for today!" + countdown.
- Daily reset ~00:00 GMT+1: battles, missions, raid recruit pool, trooper offers. Pending
  level-up choices persist (sheet locked until chosen).

## Economy
| Source | Credits |
|---|---|
| Battle win / loss | 2 / 1 |
| Mission win / loss | 4 / 0 |
| Raid phase won | 4 |
| Recruit #1 | 100 |
| Recruits 2–4 | 50 each |
| 5–14 | 10 each |
| 15–34 | 5 each |
| 35+ | 0 |
- Unlock missions: 5 credits once.
- Nth trooper cost: 2nd 8, 3rd 24, 4th 60, 5th 120, 6th 200, 7th 340, 8th 500, 9th 720,
  10th 1000, 11th 1300, 12th 2000. Max 12.
- Upgrade to level L: floor((L−1)^2.5) (fits table L=2..30: 1,5,15,32,55,88,129,181,243,316,
  401,498,609,733,871,1024,1191,1374,1573 … 25→2821, 30→4528).
- Level-up: 2 choices (3 with Smart), mandatory, irreversible. Level 6: 2 (3) helmets.
- Power = 4 × troopers + Σ levels.
- Recruit: someone creates army via your link → bounty; only the recruit's FIRST trooper joins
  your recruit pool (raids, epic). Recruit confirmed by visiting `/history`.

## Game modes
- Battle: 3/day, +1 per Commander trooper, max 5. Random opponents (whole or partial army) or
  named target (whole army). Defender sees it in history.
- Mission (after unlock): ONE random type per day, 3 attempts, win 4 credits.
  - Infiltrate: random player army, biased to armies you fought / that fought you.
  - Exterminate: rats lvl1, 10 HP, melee 1–4, leap knocks down + chain hits, undodgeable;
    can't attack downed troopers or helicopters; 2 random skills each from Bounce Back, Brick
    Shithouse, Commando, Dodger, Frenetic, Hyperactif, Invincible, On Point, Rush, Sprinter,
    Survivor, Unforgiving, Vendetta, Zigzag. Count grows with each success (records >700).
  - Epic: every few days once ≥10 recruits; main army + best recruits (cap 32) vs NPCs that
    can carry >3 equipment; grows after each success.
- Raid: needs ≥1 recruit; only recruits fight (weakest first); phases chain, survivors
  continue, enemy power rises (+4,+4,+6,+6…?); 4 credits/phase; pool max 500, 100 per battle;
  pool refreshes 00:00; end at raid 20 (? some report 21). No boss found.
- Backgrounds: garden (battle), wood (raid), attic (exterminate), sewer (infiltrate ?),
  road/streets (epic).

## Troopers & AI preferences
- New trooper: 10 HP, 0 armor, same base aim/speed; 1 of 4 default weapons (Pistol, Shotgun,
  Assault Rifle, Sniper) + 1 random level-1 skill; random name, skin, haircut.
- Prefs by level: L1 favourite weapon (if >1); L2 favourite body part (anywhere, head, heart,
  right lung, gut, left/right arm, left/right leg); L3 preferred victim (closest, easiest,
  weakest, biggest threat); L5 fighting style (standard, hunter, defender); L6 spec +
  priority target class.
- Whole skill tree seemingly predetermined by seed; flashvars serialize trooper as seed +
  binary choice list + enums (MoveSystem, ReloadSystem, BodyLoc, Weapon, TargetType,
  TargetSystem, TrooperType).

### Specializations
- Soldier: +5 HP, +1/level.
- Doctor: heals one ally 5 (+1/level) once per target per battle (reset by Saviour/Retreat),
  heals limbs, cures poison; immune to poison/paralysis (not own Twinoid); no self-heal.
  Exclusive: Healing Grenade, Saviour, Anatomy, Amphetamine Shot.
- Munitions: resupplies allies at each reinforcement (count by level), doubles grenade
  frequency (army-wide ?), not vehicles.
- Pilot: vehicle deploy chance × (0.25·L + 0.75). Base ≈ moto 30–35%, light tank 6–7.5%,
  heli/jet 10%.
- Scout: +1 global Deployment (cap 20); exclusive Binoculars; no level scaling.
- Spy: deploys inside enemy wave; enemy Deployment −1; +50 Initiative +10/level.
- Comms Officier: +5 Communications +1/level, works from reserve.
- Saboteur: +5 Sabotage +1/level, from reserve; jams enemy weapons at wave start ("sab !"),
  not vehicles; Smart halves, Suspicious negates.
- Helmets (Doctor, Munitions, Pilot, Saboteur, Soldier, Spy): no head killshot, first head
  hit capped. Caps (Comms, Scout): no headshot bonus.

## Weapons (30) — Damage / Range / Crit / Aim / Recovery / Capacity / Total
Handguns (point-blank OK): Pistol* 2-3/7/x5/90%/100/3/4; Beretta 3-4/8/x10/90%/50/4/8;
Desert Eagle 4/10/x10/100%/100/4/8 ignores armor; Dual Pistols 3-4/8/x10/80%/100/8/16 fires
twice; Revolver 4-6/9/x10/75%/120/6/12 knockback, loaded at start.
Shotguns (zone + knockback): Shotgun* 5-8/4/x10/150%/150/1/4; Double-Barrelled 5-10/5/x10/
150%/150/2/6 fires twice; Pump Action 5-10/4/x10/150%/90/1/6 auto-reload; Scattergun 4-12/4/
x5/150%/100/1/6 extended zone; Semi-Auto 5-10/4/x10/150%/70/4/8.
Assault (Dmg/Burst/Range/Crit/Aim/Rec/Cap/Shots; min range 2 except FAMAS): Assault Rifle*
2-3/3/2-6/x5/80%/100/9/18; AK47 2-3/4/2-7/x10/100%/100/12/16; FAMAS 3-4/3/5/x10/90%/50/9/18;
M16 2-3/3/2-6/x10/80%/80/12/18; Thompson 3-7(TP: 3-4)/3/2-6/x10/80%/80/9/18 ignores armor;
UMP 3-4/3/2-6/x20/100%/80/9/18.
Rifles (heavy except Sniper; favour body part; need secure zone): Sniper* 4/3-max/x15/150%/
100/1/2; CK-Magellan 3/2-max/x25/150%/65/6/12; Lizaro Jungle 5/3-max/x20/120%/100/2/4;
MOS-TECK 6-7/3-max/x25/150%/120/3/6; SparrowHawk 3/3-max/x50/300%/100/1/4.
Machine guns (heavy; Dmg/Burst/Range/Crit/Aim/Rec/Cap/Shots): Comanche Auto 3-4/6/6/x5/90%/
60/18/36; Gatling 3-6/5/7/x5/70%/110/20/40; Heavy MG 3-4/8(TP:5)/6/x5/70%/150/22/44 loaded at
start; Minigun 2-3/6/6/x5/100%/80/22/44.
Launchers (3-max, no crit, secure zone, knockback 1–5 fall dmg, ×2 vs vehicles): Bazooka M1
8-15/100%/100/1/2 heavy; Bazooka M25 6-12/80%/120/3/6 heavy; Infernal Tube 14-28/95%/150/1/1
heavy; Rocket Launcher 8-15/80%/120/1/3.
Melee: Knife 2-4/1/x10/120%/40. Built-in: fists 1–2; kick downed 1–3.
Vehicle weapons: Cannon (1+1), Fixed MG (23+46), Cannon v2 / MG v2 (heavy tank), Apache
cannon 2–3 ×2 rounds 23/46. Cut: Water Pistol, Mauser, Scimitar.
(* = default starting weapons)

## Vehicles (5)
Motorcycle (lvl1, 5 HP, cost 0, unarmed, dismount with initiative boost); Light Tank (lvl7,
40 HP, armor 2, cost 2; out of ammo → pilot on foot); Heavy Tank (lvl7, 50 HP, armor 3, cost
6, needs 8 deployment); Helicopter (lvl7, 15 HP, armor 1, cost 2, immune melee/shotgun/gas,
out of ammo → leaves); Fighter Jet (lvl ~11 ?, trooper absent, periodic bombs 6–9 +
knockback, untargetable). Large vehicles force first wave in PvP. Cut: jeep, howitzer.

## Other skills (97) — EN / FR / min level / effect; [E] = equipment slot (3 slots)
Ammo [E]: Explosive Shells / Balle explosive /1 up to 6 rounds ×2; Hydroshock / Balle
Hydroshock /1 ×4 killshot; Paralysing / Balle paralysante /1 ~400 ticks, ×2 easier to hit,
even if dodged; Toxic / Balle toxique /1 3 poison rounds; Armor-Piercing / Balle perçante /7.
Grenades [E]: Grenade /1 6–12 2×2; Fragmentation /1 1–5 per fragment, can killshot;
Flashbang /1 blind −50% aim; Gas /1 poison; Glue / gluante /1 −200 init; Shock / secousse /1
drop weapons; Clown /1–5 decoy Bibi (10 HP, Invincible, knockdown-immune, Smart ignores);
Grenade Bénie /7 12–24 3×3; Healing /7 Doctor 3×3; Black Hole / trou noir /~13–18 kills 2×2.
Melee: Faceboot / Coup de tatane /1; Fists of Fury / Grosse-beigne /1 +1, 50% disarm;
Wrestler / Lutte /1 throw; Charge /7; Stamp / Piétinement /5–7 ×2 trample; Death Grip / Forte
poigne /5–7 +1 fists, never drops weapon/target.
Aim/damage: Unforgiving / Rancunier /1 max dmg vs who hit you; King of Boules / Roi de la
pétanque /1 grenades never miss; Biped / Bipied [E] /1 no moving-target penalty; Laser Sights
/ Visée laser [E] /1 +80% aim; Eye of the Tiger / Œil de lynx /1 +50% firearms; Heat Sensor /
Détecteur de chaleur [E] /1 +20%, undodgeable; Barrel Extension / Extension de canon [E] /1
+1 range +10%; Compensator / Compensateur [E] /1 halves successive-shot penalty, −30% wait;
Cold Blooded / Sang froid /1 aims ×2 faster; Vicious / Vicieux /1 injured parts; Heartbreaker
/ Bourreau des cœurs /1 ×3 heart killshot; Anatomy /7 Doctor ×2 killshot + fav part; Blind
Fury / Tir aveugle /7 no LOS penalty, blind-immune; Covering Fire / Tir de couverture /7–8.
Handling: Loader / Chargeur [E] /1 one instant reload; Nimble Fingers / Doigts-agiles /1 ×2
speed, 2 rounds per load; Juggler / Jongleur /1 instant switch; Battle-Ready / Bien organisé
/1 all loaded at start; Rucksack / Sac à dos [E] /7 refill after first move; Trigger Happy /
Gâchette facile /1 +1 per burst; Tail Gunner / Mitrailleur /2–4 +2 auto; Nervous / Nerveux /5
empties clip; Last Mohican / Dernier Mohican /5 last alive ×2; Scavenger / Aimant de combat
[E] /1–5 grabs enemy weapon; Unshakable / Inébranlable /1 hits don't interrupt.
Initiative/speed: Twinoid [E] /1 +500 then self-poison 5; On Point / Vif /1 +200 start;
Frenetic / Frénésie /1 +200/kill; Vendetta /1 +50 per ally death; Restless / Sans repos /7–8
+200 each deployment; Adrenaline /1 faster per missed shot on you; Bounce Back / Ressort /7 no
fall dmg, instant up, +100; Sprinter /1 +100% speed; Survival Instinct /1 +50% under half HP;
Enthusiastic /1 +25% unhurt; Thermos of Coffee [E] /1 +25%; Hyperactif /5–7 +50% erratic;
Amphetamine Shot /5–7 Doctor +100% 500 ticks; Wife Beater / Débardeur Bruce [E] /7–8 +30%
speed +30% dodge; Hurry / Pressé /7 +10% speed, ×2 power use; Rush / Ruée /1 fire after move.
Defence: Full Metal Balaclava / Cagoule amidonnée [E] /1; Bulletproof Vest [E] /1 +1 armor;
Heavy Armor / Armure complète [E] /1 −1 dmg −20% speed; Hard Boiled / Dur-à-cuire /1; Lucky
Charm / Porte-bonheur [E] /1 survive at 1 HP; Invincible / Increvable /5 no killshot; Dodger /
Esquive /1 first shot dodged; Tuck 'n' Roll / Roulé-boulé /1; Take Cover / À couvert /1 50%
reloading; Zigzag /1 50% moving; Camouflage /1 20% miss, less targeted; Huge Calves / Gros
mollets /1 +3 HP +25% move; Sturdy / Robuste /1 +3 HP no heavy penalty; Brick Shithouse /
Armoire à glace /1 +3 HP cover allies; Commando /1 +5 HP; Bait / Appât /1 +8 HP priority
target; Heavyweight / Poids lourd /1–5 +10 HP −20%; Fall Guy / Cascadeur /5–7; First Aid /
Premiers soins [E] /7–8 regain ≤50% end of round; Survivor / Survivant /7–8 up with 1 HP at
reinforcements; Suspicious / Méfiant /7–8; Friendly Fire / Tir ami /7 never hurts allies;
Interception /7–8 throws grenades back.
Tactical: Smart / Malin /1 (3 choices, immune Bait/Clown/Propaganda, ½ sabotage); Binoculars
/ Jumelles [E] Scout −400 init enemy next; Radio /7 +1 Comms; Talky-Walky [E] /7 extra trooper
free (or pulls enemy spy); Out of Bounds / Débordement /7 no deployment cost on foot; Reverse
Attack / Attaque à revers /7 enemy Deployment −2; Commander / Commandement /~7 +1 daily battle
(max +2); Occupation /~7 enemy deploys one fewer; Martyr /~7 on death up to 5 reinforcements
+150 init; Crybaby / Geignard /7 reinforcements while alive; Saviour / Sauveteur /7 Doctor;
Voodoo Doll / Bâton vaudou [E] /7 curse 800 ticks.
NPC-only: Semelles de Plomb (knockdown immunity, Bibi).

## Combat engine notes (for targeted test cases)
- Precomputed, deterministic from seed in flashvars; client replays. Click pauses / stat sheet;
  Space skips. HUD: tick clock (blue bar while initiative freezes it), trooper counter,
  Deployment, Sabotage %, Communications.
- Ticks; Initiative pool freezes the clock for extra actions; reset between waves (except
  Restless); poison paused while frozen.
- Waves: default Deployment 4 (cap 20), order from /choice (raid: weakest first). Modifiers:
  Scout +1, Out of Bounds, Spy −1, Reverse Attack −2, Occupation −1; vehicle costs.
- Reserve specialists (Comms, Sabotage, Scout) count while alive even undeployed.
- Comms orders every 400 ticks, one side only: Solo Mission (1), Locked (1), Commando (5),
  Support (5), Retreat (10, outnumbered >1:2), Propaganda (20).
- Sabotage per enemy weapon at wave start; chance from (Σ saboteur levels − saboteur count)
  vs enemy count (value 5: 1 enemy 100%, 5 → 50%, 24 → 10%).
- Actions: shoot, melee, move (range + style), reload (1 round, interruptible), switch, pick up
  fallen weapon (any side), kick downed, use skill/equipment; vehicle: move/reload/attack.
- Random partial initial load; resupply can exceed stock; minimum ranges; heavy −50% speed
  stacking; bursts spread to nearby units (friendly fire on by default); shotgun area;
  grenades/launchers toss (1–7 fall dmg), ×2 vs vehicles.
- Body: head, heart, right lung, gut, arms, legs. Killshots only head/heart/lung/gut via crit
  multiplier (not fists/rats). Headshot ×2; injured part +100%, heavily +200%; arm → disarm /
  aim penalty; leg → speed (≤ −75%). 1 armor = −1 dmg.
- Hit = base aim × weapon aim; penalties: moving target, successive shots, no LOS, blind.
  Dodge only from skills/running; downed can't dodge (except Dodger/Tuck 'n' Roll).
- Statuses: poison −1/20 ticks, paralysed ~400, blind, cursed 800, knocked down, bandaged,
  "sab!".
- Targeting: preferred victim, priority class, favourite part, decoys, Smart.

## Unverified
Raid cap (20 vs 21+), no raid boss found; exact initiative/dodge/speed/deploy formulas; min
levels for Fighter Jet, Black Hole, Martyr, Commander, Occupation; sewer mapping; FR/EN faction
pairing; post-2016 changes; minitroopers.fr archive not reachable.

## Vérifié depuis

Recoupé à l'étape 3 (2026-11-23) sur les pages archivées et les flashvars décodées
(`~/minitroopers-work/recon/stage3-recon.md`, RECON3) :

- **Paliers de parrainage** : 100 / 50 ×3 / 10 ×10 / 5 ×20 / 0, comptés sur les recrues confirmées
  (`$EX/html/fr/history.html` : 18 recrues, gains 5,5,5,5,10×6 du plus récent au plus ancien ; 2e historique Wayback :
  1 recrue, « Gain : 100 »). Le tableau Economy ci-dessus est donc juste ($GL est décalé d'un). Confirmation à la
  visite de `/history` (lien « Nouvelle recrue disponible ! » du QG archivé).
- **Formes des armées de mode** (13 combats archivés décodés) : rats `name "rat"`, type 2, `choices []`, 2 compétences
  `force` du jeu de rats, graines < 100 000, faction 0, mêmes rats pour les 3 essais du jour, nombre = 1 + victoires
  d'extermination ; PNJ de raid/épique humains, graines < 100 000, `choices` aléatoires 0/1, `force null`, gardent tous
  leurs objets ; recrues = 1er trooper de chaque armée recrutée, `pref null` (raid : niveau croissant ; épique : armée
  propre puis recrues par niveau décroissant, 32 au total, 100 PNJ) ; ids défenseur d'abord (infiltration, raid),
  attaquant d'abord (extermination, épique) ; `attackerSide` = 0.
- **Raid phase 1 = puissance 11** : 3 raids archivés opposent 1 PNJ niveau 7 (puissance 11), ce que donne
  `calculateRaidPower(1)` de $GL ; un 4e raid à 32 PNJ, puissance 325 ≈ phase 11 (326). Gain +4 par phase gagnée
  (endMsg FR archivé). Aucun boss de raid dans les 4 raids archivés.
