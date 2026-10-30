# Cadran « Jarvis » (Amazfit T-Rex 3)

Un cadran de montre, à ne pas confondre avec la mini-appli Jarvis (`zepp/jarvis`) : c'est l'écran que la montre affiche en permanence.

## Ce qu'il affiche

- **En haut** : « JARVIS », une salutation (Bonjour de 5 h à 18 h, Bonsoir ensuite), la grande heure et la date en français, par exemple « VENDREDI 30 OCTOBRE » ou « VENDREDI 1ER MAI ».
- **Au centre** : la sphère de particules de Majordome. Elle tourne environ 7 secondes quand l'écran s'allume, puis s'arrête.
- **À gauche** : la météo (icône et température) et la force du vent.
- **À droite** : la fréquence cardiaque.
- **En bas** : les pas, la batterie (chiffre et barre), le lever et le coucher du soleil, l'altitude et la pression.

Toutes ces données viennent de la montre elle-même. Le cadran ne demande rien au téléphone.

**Écran toujours allumé (AOD)** : l'heure, la date et une sphère fixe atténuée, sur fond noir. Environ 3 % des pixels sont allumés.

**Toucher** :
- la sphère ouvre la mini-appli Jarvis, si elle est installée ;
- la météo, le cœur, les pas, le soleil et l'altitude ouvrent les applis de la montre correspondantes.

## Écran noir avec la version 1.0.0 (corrigé en 1.1.0)

La 1.0.0 copiait les constantes de Zepp OS (`ui.widget`, `show_level`, `data_type`…) avec `Object.assign`. Sur la montre, ces constantes sont natives et non énumérables : la copie donnait des objets vides, aucun widget n'était créé, et l'écran restait noir.
La 1.1.0 lit chaque constante directement, comme l'exemple officiel. Elle crée d'abord une base noire, le fond et l'heure (avec une heure en texte si `IMG_TIME` manque), et isole chaque bloc dans un `try/catch`.
En cas de doute, essayez d'abord le cadran de secours « Jarvis Simple » (`zepp/jarvis-simple`).

## Installer

Il suffit de scanner `jarvis-cadran-qr.png` (Releases, « Cadran Jarvis ») avec **Zepp › Profil › T-Rex 3 › Mode développeur › scan**.
Pour la voie officielle avec un ordinateur, faites comme pour la mini-appli (`zepp/jarvis/README.md`, voie A), mais dans le dossier `zepp/jarvis-cadran`.

## Autonomie

- Les chiffres sont dessinés par le système : il n'y a aucun minuteur JavaScript. Seule la salutation est relue une fois par minute.
- La sphère animée compte 24 images à 10 images par seconde. Elle joue 3 tours (7,2 s) quand le cadran revient au premier plan, puis s'arrête. Elle n'est jamais animée en AOD.
- En AOD : fond noir, environ 3 % de pixels allumés, sous les 10 % conseillés par Zepp. L'écran normal en allume environ 9 %.

## Pour les développeurs

- `shared/cadran.js` : disposition, textes français, salutation. C'est la source unique pour la montre, les images et les essais.
- `watchface/index.js` : widgets de cadran (`IMG_TIME`, `IMG_WEEK`, `IMG_DATE` avec `*_is_character`, `TEXT_IMG` et `IMG_LEVEL` avec `data_type`, `IMG_ANIM`, `IMG_CLICK`, `WIDGET_DELEGATE`), `launchApp` (`@zos/router`) et `Time.onPerMinute` (`@zos/sensor`).
- `outils/generer.py` : génère toutes les images de `assets/trex3/images`, ainsi que les aperçus (`python3 outils/generer.py dossier_apercus`). Il faut Python, Pillow, NumPy, Node, et les polices Inter (OFL) et DejaVu Sans Mono.
  La sphère reprend la logique de `applis/www-majordome/mj-orb.js`, en boucle de 24 images sans saut.
- `outils/variante_apercu.py` : variante « preview » du paquet pour le scanner. C'est la même méthode que pour la mini-appli.
- `test/` : essais Node (`node --test test/*.test.mjs`) :
  - formats français ;
  - salutation ;
  - tout tient dans le cercle ;
  - chevauchements ;
  - zones tactiles ;
  - simulation du cadran avec un Zepp OS factice : images présentes, AOD, animation, lancement de Jarvis, `IMG_CLICK`.
- Construction : job `cadran` de `.github/workflows/zepp.yml` (entrée `cible` : `tous`, `jarvis` ou `cadran`). La release est étiquetée `jarvis-cadran-N`.
