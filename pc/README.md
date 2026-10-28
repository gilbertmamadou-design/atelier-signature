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
    apps/fenetres.css    commun : feuilles du bas en fenêtres centrées (champ « styles » de pc-apps.json)
    apps/souris.css      commun : curseurs, survol, barres de défilement
    vendor/              bibliothèques (pdf.js, pdf-lib, jszip, tesseract, leaflet, jspdf, xlsx) + LICENSES/ + VENDOR.json
  relais/worker.js       relais réseau personnel FACULTATIF (Cloudflare Worker), voir « Relais réseau »
```

## Les applis

| Appli (dossier) | Sur PC | Pas sur PC |
|---|---|---|
| Lecteur PDF (`lecteur`) | lire, remplir, annoter, signer (PIN), « Ouvrir avec » .pdf, envoi vers l'Atelier | — |
| Atelier PDF (`pdf`) | tous les outils, OCR Tesseract, « Lire dans le Lecteur PDF » | chiffrement/déchiffrement PDF |
| Budget (`budget`) | comptes, budgets, import CSV/OFX (dépôt), graphiques, sauvegarde | — |
| Liseuse (`liseuse`) | EPUB/PDF, dossiers suivis (File System Access), « Ouvrir avec » .epub | catalogues sans CORS (Gutenberg) sans relais |
| Rangement (`fichiers`) | analyse d'un dossier du PC, doublons, gros fichiers | onglet Applis, stockage du téléphone |
| Actualités (`actualites`) | franceinfo et flux qui autorisent CORS | les autres médias sans relais |
| Carnet (`notes`), Agenda (`agenda`), Contacts (`contacts`) | tout le contenu ; .ics/.vcf en import/export et « Ouvrir avec » ; rappels fenêtre ouverte | agenda/contacts du téléphone, synchronisation |
| Calcul, QR, Météo, Ciel, Sentiers, Solaire | tout (QR : webcam, image collée ; Sentiers : préparation, GPX) | Sentiers : enregistrement GPS ; Solaire : boussole/inclinomètre, PVGIS sans relais |
| Mélodie (`musique`), Ondes, Écran | dossier de musique/vidéos du PC, podcasts CORS, PeerTube/NASA/archive | téléchargements hors ligne d'Ondes, applis TV (liens vers les sites) |
| Galerie, Scan, Dictaphone | dossier photos du PC (corbeille, EXIF, carte), scan d'images/PDF/webcam, micro + dictée | photos du téléphone, partage vers d'autres applis |
| Coffre (`coffre`) | identique (PBKDF2 600 000 + AES-GCM 256, rien ne sort) | empreinte (mot de passe maître seulement) |
| Petits Pas (`petitspas`), Carnet de chasse (`chasse`) | consultation, fiches, statistiques, exports | Petits Pas : sources officielles sans relais ; chasse : position GPS précise |

**Écartées** (n'ont de sens que sur le téléphone) : Socle (accueil Android), Aube (réveil), Urgence, Mesure
(capteurs), Photo (appareil photo), Réseau (Wi-Fi/mobile du téléphone), Toile (fond d'écran), Sauvegarde
(sauvegarde des applis du téléphone).

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
Android (pages `applis/` avec ponts simulés, sans `MAGPC`).

## Licences des bibliothèques (shared/vendor/LICENSES)

pdf.js 3.11.174 (Apache-2.0) · pdf-lib 1.17.1 (MIT) · JSZip 3.10.1 (MIT ou GPL-3.0) ·
tesseract.js-core 7.0.0 (Apache-2.0) · données françaises tessdata_fast 4.1.0 (Apache-2.0) ·
Leaflet 1.9.4 (BSD-2-Clause) · jsPDF 2.5.1 (MIT) · SheetJS xlsx 0.18.5 (Apache-2.0) — mêmes versions que dans les APK.
