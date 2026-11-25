# Sons des combats — conception

## Intention

Le jeu original est muet (aucun son dans client_fr.swf, army.swf ni mini.swf ; BetterTrooper non plus). Killian veut
ajouter des sons aux combats pour donner du cachet au jeu, à une condition : « il FAUT que ça soit bien fait, des sons
propres, réalistes, adaptés et satisfaisants ». Après écoute de la planche (scratchpad/work/sons/planche-sons.html), il a
choisi le style **réaliste**. Il essaiera en prod et donnera son avis (déploiement sans validation préalable par
captures, à sa demande).

## Objectifs

- Chaque action visible du combat a son son réaliste, joué **au moment exact de l'animation** (coup qui part, impact,
  chute, explosion…), placé à gauche/droite selon la position du trooper.
- Le bouton son du lecteur (aujourd'hui grisé, « Le jeu n'a pas encore de son ») devient actif ; choix mémorisé.
- Aucun changement du combat ni de la lecture.

## Non-objectifs

- Musique, voix.
- Sons ailleurs que dans le lecteur de combats (QG, recrutement…).

## Anti-objectifs

- Son décalé de l'image, bouillie sonore à grande vitesse, rafales de sons pendant un saut, son qui continue en pause,
  volume qui sature, sons de mauvaise qualité ou à licence douteuse.

## Approches

1. Page seule, à partir des entrées d'historique (mtProgress) : simple, mais le son part au début de l'événement et pas
   au moment de l'animation (décalage visible).
2. **Retenue** : le SWF appelle la page (`window.mtSfx(...)`) aux moments exacts des animations ; la page joue les sons
   par Web Audio (panoramique, variations, limiteur, gestion vitesse/saut/pause). Sons = fichiers servis à part, faciles
   à remplacer.
3. Sons embarqués dans le SWF (API Sound de Flash) : SWF plus lourd, rebuild à chaque réglage, mixage difficile.

Killian a validé l'approche 2.

## Conception

- **SWF** (helpers de patch-msg.as, lecture seule, uniquement dans le code d'AFFICHAGE, jamais dans l'état 0 ni dans
  la logique) : aux points d'animation (tir effectif par type d'arme, impact/blessure, coup critique, mort/chute,
  explosion, lancer et explosion de grenade selon son type, rechargement, changement d'arme, véhicule qui arrive/part,
  déploiement de vague, victoire/défaite, rats…), appel `mtSfx(kind, arme ou détail, x)` (x normalisé pour le
  panoramique). Pas d'appel pendant le rejeu caché d'un saut ni pendant le calcul. Trace SWF de l'oracle inchangé ;
  play SWF reproductible, `?v=` incrémenté.
- **Page** : module audio (Web Audio) : chargement paresseux des sons (au premier geste utilisateur, exigence des
  navigateurs), variations légères (hauteur ±3 %, choix aléatoire parmi plusieurs prises quand il y en a), panoramique
  doux, compresseur/limiteur global, plafond de voix simultanées et regroupement par type ; à ×4 et plus, sons espacés
  (fenêtre minimale par type) ; silence pendant un saut et à la pause ; reprise normale ensuite.
- **Bouton son** : actif, icônes on/off existantes, état dans localStorage, actif par défaut (le son démarre au premier
  geste). Mise à jour de l'aide si un raccourci est ajouté (pas de raccourci chez BetterTrooper : aucun ajout).
- **Sons** : uniquement CC0 (Freesound, déjà relevés dans scratchpad/work/sons/raw/meta.json), style réaliste de la
  planche ; pour les manques (goupille, clairon, sifflet), le son réaliste le plus proche ou rien. Fichiers courts
  (mp3/ogg), normalisés, servis depuis apps/server/public ; crédits dans le README.

## Laissé au constructeur

Liste exacte des points d'animation et correspondance arme → son, formats/débits, réglages de mixage, fenêtres
anti-bouillie. Vérification : vidéo d'un combat avec le son (enregistrement navigateur) avant déploiement.
