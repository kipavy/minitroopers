# tools/shots

Captures et contrôles de mise en page par CDP brut (Brave ou Chrome sans interface, aucune dépendance npm).

    # serveur local (base de démo : armée demo, mot de passe maquette-demo-42)
    DATA_DIR=var/mob PORT=18080 PUBLIC_URL=http://localhost:18080 node apps/server/src/main.ts
    node tools/shots/shots.mjs --out var/shots/x --widths 320,390,600,768,1280 [--pages hq,opp] [--freeze]
    node tools/shots/shots.mjs --compare var/shots/before var/shots/x

- `--out` reçoit `<page>-<largeur>.png` et `report.json` ; code de sortie 1 si une page déborde (`scrollWidth > largeur`) sous 980 px.
- `--freeze` cache les Flash, les minuteurs et les zones tirées au hasard (`mask` de `pages.json`) : comparaisons au pixel près.
- `--compare` compare les captures à 1280 px de même nom ; code de sortie 1 s'il y a une différence.
- Pages : `pages.json` (`login: true` = connecté à l'armée `--army`, profil gardé dans `var/shots-profile` pour ne se connecter qu'une fois).
- Navigateur : `SHOTS_BROWSER` (par défaut Brave sous `%LOCALAPPDATA%`). Utiliser `http://localhost`, pas `127.0.0.1` (contrôle d'origine).

Horloge simulée (captures d'un week-end, par exemple) : `MT_FAKE_NOW=2026-11-28T09:30:00Z` au lancement du serveur local. L'horloge part de cet instant et avance normalement. Le fuseau est obligatoire (Z ou ±hh:mm). Jamais en production.
