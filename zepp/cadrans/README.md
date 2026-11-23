# Atelier de cadrans (Amazfit T-Rex 3)

Cadrans Zepp OS fabriqués à partir de **réglages** (un petit JSON) : fond, couleurs, police, heure numérique ou à aiguilles,
date, anneau, quatre cases d'infos, écran toujours allumé.

- `cadran.js` : réglages, mise en page et dessin, en un seul fichier. Le même code sert à l'aperçu de l'appli « Atelier de cadrans »
  (`applis/www-cadrans`) et à la fabrication des images (`outils/fabriquer.mjs`, dans Chromium) : l'aperçu est fidèle.
- `watchface/index.js` : cadran générique. Il crée, dans l'ordre, les widgets décrits par `shared/style.js` (fabriqué).
  Tout ce qui bouge est dessiné par le système (`IMG_TIME`, `TIME_POINTER`, `IMG_DATE`, `TEXT_IMG`, `IMG_LEVEL`) : ni minuteur, ni téléphone.
- `collection/*.json` : la collection (appId fixes, 1093201 à 1093238 ; les cinq « Jarvis » : 1093234 à 1093238). Un cadran perso prend un appId tiré de son nom
  (même nom = même cadran, remplacé à l'installation).
- Fonds et animations « Jarvis » (`j_sphere`, `j_reacteur`, `j_onde`, `j_atome`, `j_cristal`) : les modèles de Majordome
  (`applis/www-majordome/mj-orb.js`) redessinés par `jarvis()` dans `cadran.js`, à la couleur d'accent du cadran.
- `polices/` : polices libres (OFL, Bitstream Vera, GUST), réduites au latin ; voir `polices/LISEZMOI.txt`.
- `test/simulation.test.mjs` : charge un cadran fabriqué avec un Zepp OS simulé et vérifie que chaque image citée existe.

## Fabriquer

Robot GitHub : `.github/workflows/cadrans.yml`.
- Sans réglage : toute la collection → release fixe `cadrans-collection` (`<id>-qr.png`, `<id>-apercu.zab`, `<id>.png`…).
- Avec l'entrée `cadran` (réglages JSON en base64, envoyés par l'appli) → release `cadran-perso-N`.

En local : `npm install && npx playwright install chromium`, puis `node outils/fabriquer.mjs collection/hud.json --sortie travail`
et `cd travail/hud && zeus build`.

## Installer sur la montre

Scanner le QR avec **Zepp › Profil › T-Rex 3 › Mode développeur › scan** (le QR est valable tant que la release existe).
