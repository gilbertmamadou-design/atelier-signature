# Cadran « Jarvis Simple » (Amazfit T-Rex 3)

Cadran de secours, volontairement minimal, à essayer **avant** le grand cadran Jarvis (`zepp/jarvis-cadran`).

## Ce qu'il affiche

- un fond turquoise très sombre et « JARVIS » en haut : c'est la preuve que le cadran tourne, même sans aucune image ;
- le décor et la sphère, dessinés dans une seule image fixe (pas d'animation) ;
- l'heure, la date en français (« Jeudi 30 octobre ») et la batterie (« Batterie 82 % »), en texte ;
- écran toujours allumé (AOD) : fond noir et heure.

Chaque élément est protégé : si l'un d'eux échoue, les autres s'affichent quand même.

## Installer

Scannez `jarvis-simple-qr.png` (Releases, « Cadran Jarvis Simple ») avec **Zepp › Profil › T-Rex 3 › Mode développeur › scan**.

## Pour les développeurs

- `watchface/index.js` : sur le modèle de l'exemple officiel `zeppos-samples/watchface/3.0/timer` (`import ui from '@zos/ui'`, `WatchFace({ build() })`).
  Les constantes (`ui.widget.TEXT`…) sont lues directement, jamais copiées : sur la montre, ce sont des propriétés natives non énumérables.
- `shared/simple.js` : textes français et disposition.
- `outils/generer.py` : images (`fond.png`, chiffres AOD, `preview.png`) et aperçus (`python3 outils/generer.py dossier`). Il réutilise le dessin de `zepp/jarvis-cadran/outils/generer.py`.
- `test/` : `node --test test/*.test.mjs` (app.json, `build()` sans exception avec un Zepp OS simulé, images).
