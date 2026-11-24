# Lecteur de combats amélioré — conception

## Intention

Après `v1.0.0` (version fidèle, image `ghcr.io/kipavy/minitroopers:1.0.0`), Killian accepte de s'écarter de
l'original pour l'améliorer, « tant que ça reste dans l'esprit MiniTroopers ». Première amélioration : un lecteur
de combats inspiré de BetterTrooper (bettertrooper.milvintsiss.com, lecteur externe pour trooperstest.gued.es),
mais **natif** : rien à installer, tout dans nos pages. Leur code n'est pas publié : on réimplémente, on ne copie rien.

## Objectifs

Sur toutes les pages de combat (`/b/view/…`, `/b/fview/<id>`, combats juste joués, missions, raids) :

1. **Pause / reprise** et **vitesse** de ×1/8 à ×32.
2. **Frise** des vagues et des événements, cliquable : aller à une vague ou à un événement.
3. **Journal du combat** en français, synchronisé avec l'animation (ligne courante surlignée, clic = aller à).
4. **Lien vers un moment** (`?at=<n>` : le combat démarre à l'événement n).
5. **Capture d'écran** du combat (PNG téléchargé).
6. **Raccourcis clavier** et aide (`?`).
7. **Alerte « combat bloqué »**, avec un bouton pour passer à la vague suivante.
8. **Affichage mobile** (le lecteur 720×440 s'adapte à la largeur, barre de contrôle tactile).

Le lecteur amélioré est **actif par défaut** (décision de Claude ; la `v1.0.0` garde le lecteur d'origine).

## Non-objectifs

- Revenir en arrière dans le SWF : impossible proprement (la file `Battle.history` est consommée). Un retour en
  arrière recharge le lecteur Ruffle puis avance jusqu'au point voulu.
- Statistiques de visionnage, file d'attente, aperçus Discord, extension : machinerie propre à BetterTrooper.
- Fork de Ruffle : exclu (Killian préfère rester sur Ruffle officiel).

## Anti-objectifs

- Une modification qui change l'issue d'un combat. Le calcul (`Game` état 0, constructeur de `Battle`, lecture de
  `data` dans `_rsq`) n'est jamais modifié ; les correctifs ne touchent que l'affichage (état ≥ 1).
- Une page de combat qui ne marche plus si le SWF patché échoue : sans `mtReady` dans les 10 s, la barre de contrôle
  se masque et le combat reste regardable comme avant.

## Contraintes

- PC de Killian propre : outils portables dans `tools/bin/` (ignoré par git), code décompilé hors dépôt, tout
  supprimé à la fin.
- SWF patché par le même chemin que l'existant (`ffdec -replace` en P-code, `tools/oracle/instrument/build.ps1
  -Play`), construction reproductible, SHA-256 committé.
- Aucun code décompilé de Motion-Twin committé (seulement nos patchs et des noms d'identifiants).

## Approches considérées

1. **Patch P-code du SWF + API ExternalInterface** (retenue). Le SWF a déjà le saut de vague (Espace), l'avance
   rapide et un détecteur de blocage ; tout est en ticks, sans son. On appelle `frame()` N fois par image
   (accumulateur fractionnaire), on expose `mtPause/mtSpeed/mtSeek/mtState/mtShot` et on rappelle
   `mtReady/mtProgress/mtStuck/mtEnd`.
2. Contrôle depuis la page seulement (`player.pause()`, `stage.frameRate`) : pas d'avance rapide fiable, pas de
   saut, pas de position. Rejetée.
3. Réécrire l'affichage sans Ruffle : écartée par Killian (on garde Ruffle).

Détails techniques (noms obfusqués, points d'accroche, risques) : [docs/research/lecteur-swf.md](../../research/lecteur-swf.md).

## Conception

### SWF (`client_fr_play.swf`)

- `mtInit(game)` au passage état 0 → 1 : enregistre les callbacks ExternalInterface, calcule `total`, les indices
  des `CheckPoint` (38) et des `NewWave` (39), appelle `mtReady({total, checkpoints, waves})`.
- Le site d'appel de l'état 2 appelle `helper.mtFrame(game)` au lieu de `frame()` :
  `acc += speed ; n = floor(acc)` appels à `frame()`, plafonnés par un budget de temps (~10 ms) ; pause = 0 appel.
  Sous ×1, `stage.frameRate = 40 × speed` (timelines comprises).
- `mtSeek(n)` : saut au dernier `CheckPoint` ≤ n (généralisation du saut Espace, file d'à-coups vidée), puis avance
  rapide invisible (`fast = true`, clip du jeu masqué) jusqu'à n ; si n est avant la position courante, la page
  recharge le lecteur et rappelle `mtSeek(n)` après `mtReady`.
- `mtProgress(idx, wave)` au plus une fois par image, seulement s'il change ;
  `idx = total − queue.length − (step ? 1 : 0)`.
- `mtStuck(idx)` quand une étape attend plus de 500 ticks (ou l'état 1 plus de 10 s).
- `mtShot()` : `BitmapData(720,440).draw(stage)` → pixels en base64 → la page en fait un PNG.
- Le drapeau « rapide » (`§Bl{K\x01§`) coupe aussi les effets coûteux pendant l'avance rapide.

### Serveur

- Le journal est généré par le serveur depuis l'historique du moteur (identique au SWF, index pour index) et
  embarqué dans la page en JSON : `[{i, wave, text}]`, textes français (noms de compétences, ordres, statuts
  depuis `swfTables.gen.ts`).
- `?at=<n>` accepté sur les pages de combat.

### Page

- Barre de contrôle sous le lecteur, dans le style des boutons de l'original (`button5`…) : lecture/pause, vitesse,
  frise, capture, lien, aide. Journal repliable à côté (dessous sur mobile).
- Raccourcis : Espace/K pause, ←/→ événement, Maj+←/→ ou N/P vague, Début/Fin, +/− vitesse, C capture, ? aide.

## Après ce lecteur (feuille de route, chacune vérifiée par le banc)

1. Ruffle officiel le plus récent (adopté seulement à 0 écart sur le corpus) ; mesure WebGL vs wgpu.
2. Optimisations et corrections d'affichage dans le SWF (reproduites d'abord sur notre SWF).
3. Troopers en SVG vectoriel générés par le serveur (comme trooperstest.gued.es).

## Laissé au constructeur

Mise en page exacte de la barre et du journal, formulation des lignes du journal, choix des icônes, plafond de
budget de temps, gestion du focus clavier de Ruffle.
