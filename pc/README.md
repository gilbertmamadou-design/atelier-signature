# Suite MAG sur PC

Les applis Android du dossier `applis/`, en **applis web installables (PWA)** pour Windows (Edge, Chrome).
Adresse : <https://gilbertmamadou-design.github.io/atelier-signature/pc/>

Une seule source : chaque appli PC est **générée** à partir de `applis/www-<appli>/index.html`.
La page ne sait presque rien du PC : elle appelle ses ponts habituels (`window.MAGPrint`, `window.MAGLecteur`…),
qui sont ici simulés en JavaScript au-dessus des API du navigateur.

```
pc/
  build-pc.py            génère tout ce qui suit (à relancer après chaque modification)
  pc-apps.json           liste des applis PC, bibliothèques, adaptations de libellés
  package.json           versions des bibliothèques (npm), pour --vendor
  index.html             lanceur « Suite MAG sur PC »          (généré)
  <appli>/               une appli par dossier                  (généré, ne pas modifier)
    index.html             copie de applis/www-<appli>/index.html + injections PC
    manifest.webmanifest   installable, standalone, file_handlers (.pdf…)
    sw.js                  service worker : hors ligne + mises à jour
    icon-192/512/maskable  tirées de applis/www-<appli>/icon-512.png
    ocr-worker.js          (si l'appli fait de l'OCR) copie de shared/ocr-worker.js
  shared/
    pc-shim.js           couche commune : window.MAGPC + window.MAGPrint (version PC)
    pc.css               toasts, dialogues, bandeau de mise à jour, dépôt, impression
    apps/<appli>.js      pont simulé propre à l'appli (MAGLecteur, MAGPdf…), raccourcis
    apps/<appli>.css     mise en page grand écran de l'appli
    sw-template.js       modèle du service worker
    launcher.html        modèle du lanceur
    ocr-worker.js        OCR Tesseract (français) hors ligne
    toile.html           page de Toile sur PC (propre au PC, champ « page » de pc-apps.json)
    toile-worker.js      moteur de recadrage de Toile (portage JS de applis/scripts/WallpaperJob.java)
                         (« Images en ligne » : applis/www-fonds/en-ligne.js, copié dans pc/toile/toile-en-ligne.js)
    ecran-pc.html        page d'Écran sur PC (propre au PC) : vidéos du PC et liens vidéo
    apps/fenetres.css    commun : feuilles du bas en fenêtres centrées (champ « styles » de pc-apps.json)
    apps/souris.css      commun : curseurs, survol, barres de défilement
    office/              pièces communes des applis bureautiques (Présentation, puis Texte et Tableur), voir « Applis bureautiques »
    vendor/              bibliothèques (pdf.js, pdf-lib, jszip, tesseract, leaflet, jspdf, xlsx, hls.js, PptxGenJS, KaTeX,
                         icônes Lucide) + LICENSES/ + VENDOR.json
  hls-build.mjs          construit vendor/hls.min.js depuis les sources taguées de hls.js (si npm est injoignable)
  relais/worker.js       relais réseau personnel FACULTATIF (Cloudflare Worker), voir « Relais réseau »
```

## Les applis

| Appli (dossier) | Sur PC | Pas sur PC |
|---|---|---|
| Lecteur PDF (`lecteur`) | lire, remplir, annoter, signer (PIN), « Ouvrir avec » .pdf, envoi vers l'Atelier | — |
| Atelier PDF (`pdf`) | tous les outils, OCR Tesseract, « Lire dans le Lecteur PDF » | chiffrement/déchiffrement PDF |
| Budget (`budget`) | comptes, budgets, import CSV/OFX (dépôt), graphiques, sauvegarde | — |
| Liseuse (`liseuse`) | EPUB/PDF, dossiers suivis (File System Access), « Ouvrir avec » .epub | catalogues sans CORS (Gutenberg) sans relais |
| Rangement (`fichiers`) | plusieurs dossiers du PC analysés ensemble (vue d'ensemble, catégories, doublons d'un dossier à l'autre, gros fichiers, récents, recherche), liste mémorisée, réautorisation en un clic | onglet Applis, stockage du téléphone, corbeille (suppression définitive) |
| Actualités (`actualites`) | franceinfo et flux qui autorisent CORS | les autres médias sans relais |
| Carnet (`notes`), Agenda (`agenda`), Contacts (`contacts`) | tout le contenu ; .ics/.vcf en import/export et « Ouvrir avec » ; rappels fenêtre ouverte | agenda/contacts du téléphone, synchronisation |
| Calcul, QR, Météo, Ciel, Sentiers, Solaire | tout (QR : webcam, image collée ; Sentiers : préparation, GPX) | Sentiers : enregistrement GPS ; Solaire : boussole/inclinomètre, PVGIS sans relais |
| Mélodie (`musique`), Ondes | dossier de musique du PC, podcasts CORS | téléchargements hors ligne d'Ondes |
| Écran (`ecran`, page propre au PC) | vidéos de plusieurs dossiers du PC (miniatures, reprise, vu/non vu, sous-titres .srt/.vtt), « Ouvrir avec », liens YouTube/Vimeo/Dailymotion/PeerTube/Twitch/archive.org (lecteurs officiels intégrés), .mp4/.webm, flux .m3u8 | catalogues de l'APK (PeerTube, NASA, chaînes suivies, applis TV) ; AVI/WMV/FLV (signalés) |
| Toile (`toile`, page propre au PC) | fonds recadrés à la taille de l'écran (mêmes traitements que l'APK) dans un dossier « Fonds Toile », que le diaporama de Windows fait défiler ; mise à jour incrémentale ; onglet « Images en ligne » (thèmes, sources libres, crédits) | changer le fond d'écran lui-même (impossible pour une page web), tuile, changement en arrière-plan |
| Galerie, Scan, Dictaphone | dossier photos du PC (corbeille, EXIF, carte), scan d'images/PDF/webcam, micro + dictée | photos du téléphone, partage vers d'autres applis |
| Coffre (`coffre`) | identique (PBKDF2 600 000 + AES-GCM 256, rien ne sort) | empreinte (mot de passe maître seulement) |
| Présentation (`presentation`) | tout : édition, thèmes, masque, animations, diaporama et mode présentateur (2e fenêtre), .magpres, import/export .pptx, PDF, images, « Ouvrir avec » .pptx/.magpres, enregistrement sur place (File System Access) | — |
| Petits Pas (`petitspas`), Carnet de chasse (`chasse`) | consultation, fiches, statistiques, exports | Petits Pas : sources officielles sans relais ; chasse : position GPS précise |

**Écartées** (n'ont de sens que sur le téléphone) : Socle (accueil Android), Aube (réveil), Urgence, Mesure
(capteurs), Photo (appareil photo), Réseau (Wi-Fi/mobile du téléphone), Sauvegarde (sauvegarde des applis du
téléphone).

## Fabriquer

```
python3 pc/build-pc.py            # régénère pc/<appli>/ et pc/index.html
python3 pc/build-pc.py --check    # code 1 si un fichier généré n'est pas à jour
python3 pc/build-pc.py --vendor   # en plus : recopie les bibliothèques depuis pc/node_modules (après « cd pc && npm ci »)
```

Le script ne touche jamais `applis/` : les APK ne changent pas. Il affiche `ATTENTION` quand une phrase à adapter
n'est plus trouvée dans la page Android (elle a été réécrite) : mettre à jour `pc-apps.json`.
Le déploiement est celui de GitHub Pages (racine de `main`) : pousser suffit. Attention, un commit `[skip ci]`
ne déclenche pas « pages build and deployment ».

## Ajouter une appli

1. **`pc-apps.json`** : ajouter une entrée.
   ```json
   { "id": "notes", "android": "notes", "name": "Carnet", "short_name": "Carnet", "description": "…",
     "theme_color": "#…", "background_color": "#…",
     "vendor": ["jszip.min.js"],                       // bibliothèques chargées par la page (précachées)
     "workers": [],                                    // ex. ["ocr-worker.js"]
     "file_handlers": [{ "accept": { "text/plain": [".txt"] } }],   // facultatif : « Ouvrir avec »
     "styles": ["fenetres", "souris"],                 // feuilles communes de shared/apps/ (avant <id>.css)
     "data": { "ls": ["notes."], "idb": ["carnet"], "note": "…" },  // pour « Exporter / importer mes données »
     "patches": [{ "from": "sur le téléphone", "to": "sur l'ordinateur", "count": 1 }] }
   ```
   `count` : nombre exact d'occurrences attendues (1 par défaut) ; `0` = toutes, au moins une.
   `data` : préfixes `localStorage` et bases IndexedDB de l'appli, que le lanceur exporte dans un fichier JSON
   (`format: "mag-pc-donnees"`, Blob/ArrayBuffer/Date encodés, poignées de dossiers non exportées) et réimporte
   (bases recréées à l'identique). `note` : la sauvegarde propre de l'appli, quand elle existe (même fichier que
   sur le téléphone).
   `android` = champ `app` de `applis/apps.json` (sert au dossier `www-…`, aux icônes et à l'identifiant).
   `copies` (facultatif) : fichiers du dépôt copiés dans le dossier de l'appli et précachés, ex. Toile :
   `{"toile-en-ligne.js": "applis/www-fonds/en-ligne.js"}` (même fichier que dans l'APK).
   `page` (facultatif) : page propre au PC à la place de `applis/www-<appli>/index.html` (ex. Toile :
   `"page": "pc/shared/toile.html"`, l'icône reste celle de l'appli Android).
2. **`shared/apps/<id>.js`** (si la page appelle un pont propre à l'appli) : définir `window.MAG<Appli>` avec
   **exactement** les méthodes du `scripts/<Appli>Bridge.java`, en s'appuyant sur `MAGPC`. Garder les mêmes
   formats de retour (chaînes JSON) et les mêmes événements (`window.<appli>Event(type, json)`).
   Une méthode sans équivalent : ne pas la définir (la page garde son comportement « navigateur »), ou
   `MAGPC.stub(pont, ['nom'], valeur)` pour afficher « … n'est pas disponible sur PC ».
3. **`shared/apps/<id>.css`** : règles préfixées `html.mag-pc`, grand écran dans `@media (min-width:900px)`
   (contenu centré, grilles à plusieurs colonnes, feuilles du bas en fenêtres centrées, curseurs).
4. `python3 pc/build-pc.py`, tester (voir plus bas), pousser.

### Conventions

- **Synchrone → asynchrone.** Les ponts Android renvoient souvent un résultat tout de suite (`open(src)`),
  ce que le navigateur ne peut pas faire pour un fichier. Ajouter dans la page Android un appel *asynchrone
  facultatif*, activé seulement sur PC : `window.MAGPC && b.openAsync ? await b.openAsync(src) : b.open(src)`.
  Toujours tester `window.MAGPC` : les bancs d'essai Android simulent les ponts avec des `Proxy` qui
  « possèdent » toutes les méthodes. Si la page Android change, refaire un APK.
- **Libellés** (« téléphone », « Touche… », empreinte…) : adaptations dans `patches` (texte exact du source),
  pas dans la page Android.
- **Bibliothèques** : la page charge `'pdf.min.js'` (copiée dans l'APK) ; le script réécrit ces chaînes en
  `'../shared/vendor/pdf.min.js'`. Une nouvelle bibliothèque : l'ajouter dans `pc-apps.json › vendor`,
  `package.json`, `shared/vendor/` et sa licence dans `vendor/LICENSES/`.
- **Workers** : à copier dans le dossier de l'appli (`workers`), sinon ils échappent au service worker et ne
  marchent pas hors ligne.
- **Fonctions natives remplacées par la page** : certaines pages Android remplacent `window.print`,
  `window.open` ou le clic des liens `blob:` quand `MAGPrint` existe ; `pc-shim.js` garde les originaux.
- **Stockage** : l'origine est commune à toutes les applis PC (`gilbertmamadou-design.github.io`) :
  préfixer les clés `localStorage` et les bases IndexedDB par l'appli. Échanges entre applis : store `inbox`
  de la base `mag-pc` (voir `MAGLecteur.sendTo` → `MAGPdf.pending`).

## Applis bureautiques (shared/office/)

Présentation est la première des applis bureautiques (Texte et Tableur suivront). Ses pièces communes sont dans
`pc/shared/office/` et servent **telles quelles** au PC et à l'APK (une seule source) :

| Fichier | Rôle |
|---|---|
| `office-core.js` | `window.Office` : utilitaires, icônes Lucide (avec alias), dialogues, menus (feuille du bas sur téléphone), sélecteur de couleurs (couleurs du thème), raccourcis, polices |
| `office-ribbon.js` | ruban à onglets (boutons, menus, listes, galeries, onglets contextuels, recherche de commande, mode compact, repli) |
| `office-richtext.js` | texte riche (contentEditable) : nettoyage du collé, styles par plage, listes, reproduire la mise en forme, rechercher/remplacer |
| `office-files.js` | ouvrir, enregistrer sur place, enregistrer sous, exporter, partager, « Ouvrir avec », récents, enregistrement automatique et récupération (IndexedDB) ; trois moteurs : `MAGPC` (PC), `MAGOffice` (APK, `applis/scripts/OfficeBridge.java`), navigateur |
| `office-themes.js` | 16 thèmes (couleurs, polices), rôles de couleur, contrôle de contraste WCAG |
| `office-pdf.js` | PDF avec jsPDF : pages, documents à distribuer (1 à 9 par page), pages de commentaires, texte |
| `office-raster.js` | rendu d'un morceau de page en image (SVG `foreignObject` en `data:`), pour les exports et vignettes |
| `office-history.js` | annuler / rétablir illimité (instantanés à partage de structure) |
| `office.css` | jetons clair/sombre, dialogues, menus, ruban, tailles tactiles |

Une appli bureautique a `"office": true` dans `pc-apps.json` : `build-pc.py` réécrit `"office/…"` en
`"../shared/office/…"` et précache tout le dossier. Côté APK, `applis/www-<appli>/office-deps.txt` liste ce qu'il
faut copier (pièces communes, bibliothèques, licences) : `applis/scripts/office-deps.sh`, lancé par `print-patch.sh`.
Les fichiers propres à l'appli (`pres-*.js`, `pres.css`) sont des `copies` (même fichier que dans l'APK).

## API de `window.MAGPC` (shared/pc-shim.js)

| Domaine | Fonctions |
|---|---|
| Fichiers | `fs.open({types, multiple, accept})` → `[{file, handle}]` · `fs.saveAs(blob, nom, {types})` · `fs.download(blob, nom)` · `fs.write(handle, blob)` · `fs.perm(handle, mode, demander)` · `fs.remember({handle|blob, name})` → id · `fs.recall(id)` · `fs.check(id)` · `fs.forget(id)` · `fs.list()` · `fs.PDF` |
| Stockage | `store.get/set/del` (localStorage JSON) · `db.get/put/del/all(store, …)` (IndexedDB `mag-pc` : `kv`, `files`, `inbox`) · `kv.get/set/del` |
| Partage, ouverture | `share(blob, nom)` (Web Share de Windows, sinon téléchargement) · `openBlob(blob, nom)` (onglet) · `fileMenu(blob, nom)` |
| Impression | `printPdf(données, nom)` (pages rendues ≈ 150 ppp puis `window.print`) · `printHtml(html, titre)` · `printImage(blob)` |
| Presse-papier | `clip.write(texte)` · `clip.writeImage(blob)` · `clip.read()` |
| Notifications | `notify(titre, texte)` · `schedule(id, délai, titre, texte)` · `cancel(id)` (seulement fenêtre ouverte) |
| Interface | `toast(texte, {bad, ms})` · `dialog({title, html, buttons, onOpen})` · `confirm()` · `withGesture(fn)` · `unavailable(quoi, alternative)` · `stub(pont, noms, retour)` |
| Saisie | `keys({'mod+o': fn, 'escape': fn, …})` · `onZoom(fn)` (Ctrl+molette) · `onFiles(fn)` (dépôt sur la fenêtre + « Ouvrir avec ») · `typing()` |
| Sécurité | `pin.verify({title, sub, onForgot})` · `pin.create()` · `pin.has()` · `pin.reset()` — code PIN local (PBKDF2), remplace l'empreinte |
| Bases | `openDb(nom, stores, version)` → `{get, put, del, all, keys, clear}` (base propre à une appli) |
| Images | `scaleImage(blob, {max, square, type, quality})` → data URL |
| Réseau | `net.proxy()` · `net.via(url)` · `net.HOSTS` — `fetch` passe par le relais personnel s'il est configuré |
| Divers | `nativeOpen(url)` (le `window.open` d'origine) · `keepScreen(on)` (Wake Lock) · `speak(texte)` · `ocr.recognize(image)` → format ML Kit · `pdfjs()` · `update()` · `install()` · `installed()` |

`window.MAGPrint` (PC) : `printHtml`, `printPdf`, `openFile`, `fileMenu`, `notifyUser`, `scheduleNotif`,
`cancelNotif`, `speak`, `keepScreen`, `takeSocle` (paramètre `?socle=`),
`appBack`. Absentes : musique, fichiers du téléphone, alarmes, accueil, météo en arrière-plan…

`window.MAGPC_CONF` (injecté) : `{app, name, vendor, ocrWorker, sw, apps: {identifiant Android: '../<id>/'}}`.

## Identifiant des applis installées

Chaque manifeste a un `id` **unique** : `/atelier-signature/pc/<appli>/`. Le navigateur résout `id` par rapport à
l'**origine** du site (pas au dossier de l'appli) : un id relatif comme `"./"` donnait le même identifiant
(`https://gilbertmamadou-design.github.io/`) à toutes les applis, et Edge les confondait (installer l'Atelier PDF
proposait « Lecteur PDF »). `build-pc.py` (et `--check`) s'arrête si deux identifiants résolus sont identiques.
Une appli installée avec l'ancien identifiant doit être désinstallée puis réinstallée.

## Rangement : plusieurs dossiers

`shared/apps/fichiers.js` remplace, sans toucher à la page Android, le pilote `PcDrv` à un dossier par une liste de
« racines » (`/Documents`, `/Images`, `/Images (2)` si deux dossiers ont le même nom) analysées ensemble : `roots()`,
`root()`, `scan()` (toutes les racines), `pick()` (ajout). La liste est dans IndexedDB `mag-pc` › `files` › `fichiers-racines`
(l'ancien `fichiers-dossier` du lot 1 est repris). Au démarrage, `queryPermission` ; si l'accès est à redemander :
écran « Vos dossiers » et un bouton qui appelle `requestPermission` pour chacun (un clic). Un dossier déjà compris dans
un autre (`resolve()`) n'est pas ajouté (« Déjà analysé », avec « Ouvrir ce dossier ») ; un dossier qui en contient un
autre le remplace (fusion). Retirer un dossier ne supprime rien. Edge et Chrome refusent `C:\`, Windows, Program Files,
AppData et, selon les versions, le dossier personnel, Documents, Bureau et Téléchargements pris en entier (leurs
sous-dossiers sont acceptés) : l'appli l'explique.

## Toile sur PC

Une page web ne peut pas changer le fond d'écran de Windows. Toile prépare donc les fonds, et Windows les fait défiler :

1. dossiers de photos source (lecture seule, `showDirectoryPicker({mode:'read'})`, sous-dossiers sur 4 niveaux, 5 000
   images au plus, comme l'APK) ;
2. dossier de sortie : « Créer « Fonds Toile » dans… » (`getDirectoryHandle('Fonds Toile', {create:true})`) ou un
   dossier existant ;
3. traitement à la résolution de l'écran (`screen.width × devicePixelRatio`…, ou 1920×1080, 2560×1440, 3840×2160,
   ou saisie), JPEG de qualité réglable, fichiers `toile-<nom>-<empreinte>.jpg` ;
4. Windows : Paramètres › Personnalisation › Arrière-plan › Diaporama › Parcourir → « Fonds Toile » (guide dans l'appli).

`toile-worker.js` est le portage de `WallpaperJob.java` (`borders`, `textBands`, `logoBands`, `trim`, `fit` avec
`bestOffset`, `blurFit`, `scaleRegion`) : mêmes seuils, divisions entières et arrondis `float` de Java. Décodage direct
à taille réduite (`createImageBitmap` + `resizeWidth/Height`, réduction par 2, 4… comme `inSampleSize`, 16 Mpx au plus),
orientation EXIF appliquée par le navigateur. Formats : JPEG, PNG, WebP, AVIF, BMP ; HEIC seulement si le navigateur
le décode (sinon image « Ignorée » avec un message).

`toile-manifest.json` (dossier de sortie) : pour chaque fond, la source, sa taille, sa date et les réglages
(`sig`). « Mettre à jour » ne traite que les images nouvelles ou modifiées (ou dont le réglage a changé), et ne
supprime que les fichiers listés dans ce manifeste (préfixe `toile-`) dont la source a disparu ou a été exclue.
Rien n'est jamais écrit dans les dossiers source. Réglages : `localStorage` `toile-pc:reglages` ; poignées et choix
par image : IndexedDB `toile-pc`.

### Toile : images en ligne

Onglet « Images en ligne » (même code que l'APK : `applis/www-fonds/en-ligne.js`, copié en `pc/toile/toile-en-ligne.js`).
Récupère des images par **thèmes** (16 prédéfinis + 5 thèmes libres, poids Peu / Normal / Beaucoup) uniquement depuis des
sources qui autorisent la réutilisation, avec l'auteur et la licence de chaque image :

| Source | Clé | Conditions retenues |
|---|---|---|
| Wikimedia Commons (`commons.wikimedia.org/w/api.php`, `origin=*`, en-tête `Api-User-Agent`) | non | licences CC0, domaine public, CC BY, CC BY-SA seulement (NC, ND, GFDL seule, « fair use », `NonFree` exclus) ; vignettes aux tailles standard (960, 1280, 1920, 3840) |
| Openverse (`api.openverse.org/v1/images/`, `license=by,by-sa,cc0,pdm`, `mature=false`, `aspect_ratio`, `size=large`, sources Flickr, Wikimedia, Met) | non | anonyme : 20 recherches/min, 200/jour |
| NASA APOD (`api.nasa.gov/planetary/apod`) | DEMO_KEY (30/h, 50/jour) ou clé gratuite | thème Espace ; images avec champ `copyright` exclues |
| Pixabay (`pixabay.com/api/`, `safesearch=true`) | clé gratuite obligatoire | réponses gardées 24 h, images téléchargées (pas de lien permanent), « Image de X sur Pixabay » ; sans compte approuvé ≤ 1 280 px (résolution « tolérante ») |

**Non retenues** : Unsplash (règles d'API : pas d'« applications de fonds d'écran », images affichées depuis leurs serveurs) et
Pexels (conditions : pas de « wallpaper app »). L'appli l'explique. Pas de scraping ; « Manga / anime » = illustrations de
style sous licence libre, les personnages de séries ne sont pas proposés (message dans l'appli).

Règles communes (identiques dans `applis/scripts/ToileBridge.java`) : orientation de l'écran (paysage sur PC), résolution
minimale = celle des fonds (ou la moitié en « tolérante »), mots-clés adultes refusés (titre, catégories, mots-clés),
doublons par identifiant source, fichier Wikimedia (même image via Commons et Openverse) et empreinte SHA-256 du fichier ;
une image refusée (« Ne plus montrer », « Signaler ») ne revient jamais ; plafond de stockage (les plus anciennes non favorites
sont supprimées).

Sur PC : `fetch` direct sans cookies ; une API ou un serveur d'images qui refuse le CORS (constaté deux fois alors que le
réseau marche) est désactivé 7 jours avec un message (« Réessayer » le réactive). Fichiers dans le stockage privé du
navigateur (OPFS `toile-en-ligne/`), liste dans IndexedDB `toile-pc` (`web-items`, `web-seen`, `web-refused`, `web-cache`…),
réglages `localStorage` `toile-pc:en-ligne`, clés dans `toile-cles-pc` (hors du préfixe exporté). « Récupérer N images »
puis traitement automatique vers « Fonds Toile » (mêmes réglages de recadrage) ; `toile-credits.txt` (dans la sortie) donne,
pour chaque fond `toile-<source>-<id>-….jpg`, l'auteur, la licence et la source ; « Crédit » retrouve une image par ce nom.

## Écran sur PC

Page propre au PC (`shared/ecran-pc.html`, champ `page`), à la place de la page Android, à la même adresse et avec le
même identifiant d'installation (`/atelier-signature/pc/ecran/`) : l'appli déjà installée se met à jour. L'APK ne change pas.

**Mes vidéos.** Plusieurs dossiers (code repris de Rangement : poignées dans IndexedDB `ecran-pc` › `kv` › `racines`,
`queryPermission` au démarrage, un clic « Autoriser l'accès » pour tous, dossier déjà compris → pas ajouté, dossier qui en
contient un autre → fusion ; lecture seule, `showDirectoryPicker({mode:'read', startIn:'videos'})`). L'ancien dossier unique
(`mag-pc` › `files` › `ecran-dossier`) est repris. Parcours récursif (14 niveaux ; dossiers cachés, `$RECYCLE.BIN`,
`System Volume Information`… ignorés). Lisibles : `.mp4 .m4v .mov .webm .mkv .ogv .ogg` ; listés mais signalés « non lisible ici » :
`.avi .wmv .flv .f4v .mpg .mpeg .m2ts .mts .vob .3gp .asf .rm .rmvb .divx…` (une page web ne peut pas lancer le lecteur de
Windows : l'appli explique « clic droit › Ouvrir avec » et copie le nom). Un codec refusé à la lecture (HEVC sans
l'extension de Windows, son AC-3/DTS) est retenu et affiché « Codec non pris en charge ».
Miniatures, durée et résolution : `<video>` + canvas (image à 15 % de la durée, 90 s au plus), une à la fois, dans l'ordre
d'affichage, gardées dans IndexedDB `ecran-pc-miniatures` (clé `nom|taille|date` ; base non exportée, recalculable).
Position et « vu » : `localStorage` `ecran-pc:positions` / `ecran-pc:vues`, clé `nom|taille` (survit à un déplacement) ;
« vue » à 95 % ou à moins de 25 s de la fin. Recherche sans accents (nom et dossier), tris, regroupement par dossier,
arborescence des dossiers dans la barre latérale.

**Lecteur.** Contrôles propres (barre masquée après 2,6 s), plein écran du lecteur, vitesse, boucle, image dans l'image,
suivant/précédent dans le dossier (avec « À suivre » en fin de vidéo). Sous-titres : `.srt`/`.vtt` du même nom (aussi
`nom.fr.srt`…) chargés tout seuls, ou choisis à la main ; SRT → VTT (virgules, coordonnées, balises `{\an8}`), texte en
UTF-8, UTF-16 ou Windows-1252. Pistes audio : `audioTracks` si le navigateur l'expose (Chrome/Edge : derrière un drapeau),
pistes HLS. Raccourcis : Espace/K, ←/→ (J/L, Maj = 30 s), ↑/↓, M, F, N/P, chiffres (`event.code`, donc AZERTY sans Maj),
C, `<`/`>`, I, Échap ; Ctrl+O, Ctrl+F, Ctrl+L. Dépôt d'une vidéo, d'un `.srt` ou d'un dossier ; `file_handlers` .mp4 .m4v
.webm .mkv .mov .ogv.

**Liens.** `EcranLiens.parse()` construit sans réseau l'adresse du **lecteur officiel intégré** : YouTube →
`youtube-nocookie.com/embed/<id>` (watch, youtu.be, shorts, live, playlist `videoseries?list=`, `t=`/`start=` en secondes,
`enablejsapi=1&origin=`) ; Vimeo → `player.vimeo.com/video/<id>?h=…&dnt=1#t=` ; Dailymotion → `/embed/video/<id>` ;
PeerTube (instances connues, ou chemins `/w/<id>`, `/videos/watch/<id>`, `/w/p/<liste>`) → `/videos/embed/<id>?p2p=0` ;
Twitch → `player.twitch.tv/?video=v…|channel=…&parent=<site>`, clips `clips.twitch.tv/embed?clip=` ; archive.org →
`/embed/<id>`. Aucun téléchargement, aucune extraction de flux, aucun script de ces sites dans la page : seulement leur
iframe. Le lecteur YouTube signale ses erreurs par `postMessage` (101/150 : intégration refusée) → « Ouvrir sur YouTube »
(bouton présent de toute façon). Fichier `.mp4`/`.webm`… : lecteur d'Écran. `.m3u8` : natif si le navigateur sait, sinon
hls.js (`vendor/hls.min.js`, chargé à la demande, précaché) ; sans CORS : message clair. Autre lien : « Ouvrir dans le
navigateur ». Historique (150) et « À regarder plus tard » : `localStorage` `ecran-pc:liens` / `ecran-pc:plus-tard`, avec
la dernière position connue. Ctrl+V n'importe où (hors champ de saisie) lit le lien collé.

## Relais réseau

Une page web ne lit un flux d'un autre site que si ce site envoie `Access-Control-Allow-Origin` (CORS). Sonde du
28/10/2026 : passent sans rien faire franceinfo (11 flux), La Dépêche, DNA, Open-Meteo, RainViewer, Photon,
api-adresse, apicarto, la plupart des hébergeurs de podcasts (Audiomeans, Anchor, Octopus, Megaphone, Omny,
Libsyn, Simplecast, Art19…), iTunes, archive.org, PeerTube (Sepia), NASA, Wikimedia, Wikisource, Gutenberg OPDS.
Bloquent : Le Monde, Le Figaro, Libération, RFI, France 24, 20 Minutes, Ouest-France, Le Parisien, La Croix,
Euronews, BBC, The Guardian, Brut, Sud Ouest, Nice-Matin, actu.fr, MeteoAlarm, ccMixter, flux YouTube,
Légifrance/legifrss, Service-Public, PVGIS, téléchargement des EPUB Gutenberg, ws-export, et des podcasts (Acast,
Ausha, Spreaker, Audioboom, Arte Radio…). Sans relais, `pc-shim.js` refuse tout de suite ces sites (message clair,
pas d'erreur CORS dans la console). Aucun proxy CORS public n'est utilisé, et aucun agrégateur ne republie la
presse sur Pages (droit d'auteur).

**Relais personnel facultatif** (`relais/worker.js`, Cloudflare Workers, offre gratuite : 100 000 lectures/jour) :
il lit pour l'utilisateur, en GET seulement, les sites de sa liste (et les flux RSS/Atom), uniquement pour les pages
venant de `https://gilbertmamadou-design.github.io`, sans rien stocker.

1. Créer un compte gratuit sur <https://dash.cloudflare.com> (adresse e-mail suffisante).
2. *Workers & Pages › Create › Create Worker*, nom `mag-relais`, *Deploy*.
3. *Edit code* : remplacer tout le code par le contenu de `pc/relais/worker.js`, *Deploy*.
4. Copier l'adresse affichée (`https://mag-relais.<compte>.workers.dev`).
5. Lanceur › *Relais réseau* : coller l'adresse, *Tester*, *Enregistrer*. Les applis l'utilisent aussitôt
   (clé `localStorage` `mag-pc-relais`, commune à toutes les applis du site).

Garder l'adresse pour soi : le contrôle d'origine arrête les autres sites web, pas un programme qui imiterait
l'en-tête `Origin`. Si la liste `HOSTS` change, la changer aussi dans `MAGPC.net.HOSTS` (pc-shim.js).

## Hors ligne et mises à jour

`sw.js` précache la page, le shim, l'adaptateur et les bibliothèques de l'appli. Sa `VERSION` est l'empreinte de
tous ces fichiers : toute modification publiée installe une nouvelle version en arrière-plan, et la page affiche
« Nouvelle version disponible » (bouton « Mettre à jour » → activation et rechargement). Les polices Google de
l'Atelier sont gardées en cache après la première visite.

## Tests

Playwright (Chromium) contre un serveur http local servant la racine du dépôt, en 1366×768 et 412×915.
Les sélecteurs de fichiers sont simulés avec l'OPFS (vraies poignées File System Access, stockables dans
IndexedDB) ; `launchQueue` et `window.print` sont simulés. Vérifier : `Page.getInstallabilityErrors` (CDP) vide,
service worker maître de la page, rechargement hors ligne, fonctions principales, console sans erreur, et le banc
Android (pages `applis/` avec ponts simulés, sans `MAGPC`). Toile : comparer les zones gardées de `toile-worker.js`
avec les fonctions de `WallpaperJob.java` compilées telles quelles (faux `android.graphics` en Java : `Bitmap`,
`Rect`, `Canvas` bilinéaire) sur des images construites exprès (bordures, bandeau, logo, paysage, portrait).
Autorisations « à redemander » : `queryPermission` simulé à `prompt` jusqu'au clic.
Écran : vidéos de test faites avec ffmpeg en VP9/Opus (le Chromium de Playwright n'a ni H.264 ni AAC : un .mp4 H.264 y sert
à vérifier « Codec non pris en charge »), `.srt` en Windows-1252, faux lecteurs intégrés (page qui répond au `postMessage`
de YouTube), serveur à requêtes partielles (Range) pour le lien direct, flux HLS fMP4, second serveur sans CORS.

## Licences des bibliothèques (shared/vendor/LICENSES)

pdf.js 3.11.174 (Apache-2.0) · pdf-lib 1.17.1 (MIT) · JSZip 3.10.1 (MIT ou GPL-3.0) ·
tesseract.js-core 7.0.0 (Apache-2.0) · données françaises tessdata_fast 4.1.0 (Apache-2.0) ·
Leaflet 1.9.4 (BSD-2-Clause) · jsPDF 2.5.1 (MIT) · SheetJS xlsx 0.18.5 (Apache-2.0) — mêmes versions que dans les APK.
PptxGenJS 4.0.1 (MIT) : `dist/pptxgen.min.js` du tag v4.0.1 de github.com/gitbrent/PptxGenJS (identique au paquet npm,
ligne `sourceMappingURL` retirée) · KaTeX 0.16.47 (MIT) : `dist/` du paquet (polices woff2 seulement) · Lucide 1.64.0
(ISC) : `vendor/lucide-icons.js` généré par `shared/office/tools/lucide-build.py` depuis le dossier `icons/` du tag 1.64.0
de github.com/lucide-icons/lucide (1999 icônes) — dans l'APK Présentation aussi, mêmes fichiers.
hls.js 1.6.19 (Apache-2.0, PC seulement, avec eventemitter3 MIT, url-toolkit et common-media-library Apache-2.0) : construit
depuis le tag v1.6.19 par `pc/hls-build.mjs` (registre npm injoignable) ; `--vendor` le remplace par le `dist/hls.min.js` npm.
