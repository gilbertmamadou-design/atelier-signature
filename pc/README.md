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
  versions.json          empreinte et date de chaque appli (« Version du JJ/MM »)   (généré, publié)
  <appli>/               une appli par dossier                  (généré, ne pas modifier)
    index.html             copie de applis/www-<appli>/index.html + injections PC
    manifest.webmanifest   installable, standalone, file_handlers (.pdf…)
    sw.js                  service worker : hors ligne + mises à jour
    icon-192/512/maskable  tirées de applis/www-<appli>/icon-512.png
    ocr-worker.js          (si l'appli fait de l'OCR) copie de shared/ocr-worker.js
  shared/
    pc-shim.js           couche commune : window.MAGPC + window.MAGPrint (version PC)
    folders.js           module commun « dossiers du PC mémorisés » (MAGPC.Folders), champ « modules » de pc-apps.json
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
    apps/majordome.js    pont simulé MAGMajordome : Vosk (vendor/vosk/vosk-worker.js), Web Speech facultatif, écoute continue, agenda partagé
    office/              pièces communes des applis bureautiques (Présentation, Texte, Tableur), voir « Applis bureautiques »
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
| Mélodie (`musique`), Ondes | plusieurs dossiers de musique du PC (laissés à leur place, liste mémorisée, relus à l'ouverture), podcasts CORS | téléchargements hors ligne d'Ondes |
| Écran (`ecran`, page propre au PC) | vidéos de plusieurs dossiers du PC (miniatures, reprise, vu/non vu, sous-titres .srt/.vtt), « Ouvrir avec », liens YouTube/Vimeo/Dailymotion/PeerTube/Twitch/archive.org (lecteurs officiels intégrés), .mp4/.webm, flux .m3u8 | catalogues de l'APK (PeerTube, NASA, chaînes suivies, applis TV) ; AVI/WMV/FLV (signalés) |
| Toile (`toile`, page propre au PC) | fonds recadrés à la taille de l'écran (mêmes traitements que l'APK) dans un dossier « Fonds Toile », que le diaporama de Windows fait défiler ; mise à jour incrémentale ; onglet « Images en ligne » (thèmes, sources libres, crédits) | changer le fond d'écran lui-même (impossible pour une page web), tuile, changement en arrière-plan |
| Galerie, Scan, Dictaphone | dossier photos du PC (corbeille, EXIF, carte), scan d'images/PDF/webcam, micro + dictée | photos du téléphone, partage vers d'autres applis |
| Coffre (`coffre`) | identique (PBKDF2 600 000 + AES-GCM 256, rien ne sort) | empreinte (mot de passe maître seulement) |
| Présentation (`presentation`) | tout : édition, thèmes, masque, animations (objet entier ou paragraphe par paragraphe, déclencheurs « au clic sur » un objet), vidéos et sons (démarrer au clic, automatiquement ou en cliquant dessus, lecture / pause / arrêt dans les animations, plein écran, masquer pendant la non-lecture, boucle, rembobiner), diaporama et mode présentateur (2e fenêtre), .magpres, import/export .pptx, PDF, images, « Ouvrir avec » .pptx/.magpres, enregistrement sur place (File System Access) | — |
| Texte (`texte`) | tout : traitement de texte paginé (sections, en-têtes et pieds, notes, tableaux, images habillées, styles, listes, table des matières, suivi des modifications, commentaires, publipostage CSV), .magdoc, .docx et .odt (ouvrir et enregistrer), .rtf/.txt/.md/.html, PDF à signets, « Ouvrir avec » .docx/.magdoc/.odt/.rtf/.txt/.md, enregistrement sur place, PDF envoyé à l'Atelier PDF | — |
| Majordome (`majordome`) | assistant vocal à commandes (sans IA) : reconnaissance hors ligne Vosk (WebAssembly), mot de réveil fenêtre ouverte, Ctrl+Espace, saisie au clavier ; heure, calculs, conversions, minuteurs, rappels, météo et vent (Open-Meteo), titres franceinfo, agenda (celui d'Agenda sur PC), notes et listes, dépense ajoutée dans Budget (après confirmation, jamais de solde lu), ouverture des applis de la Suite et des sites connus ; pour une appli du téléphone (« lance WhatsApp »), réponse honnête et proposition de son site s'il existe (web.whatsapp.com, open.spotify.com…), pause / suivant de Mélodie | appels, SMS, lampe, volume du système, modes, Wi-Fi / Bluetooth ; lumières Philips Hue (une page web ne peut pas joindre le pont Hue : certificat auto-signé, contenu mixte, protection du réseau local des navigateurs ; expliqué dans l'appli) ; vigilance MeteoAlarm sans relais ; alarmes appli fermée |
| Fond Jarvis (`fond-jarvis`, page propre au PC) | fond d'écran animé pour **Lively Wallpaper** (paquet `fond-jarvis-lively.zip`) ou en page plein écran : sphère de Majordome, anneaux, circuits, horloge, météo, titres, système (Lively), musique en cours (Lively), raccourcis, assistant au clavier (analyseur de Majordome) | lancer un .exe, éteindre ou verrouiller Windows, micro dans Lively |
| Tableur (`tableur`) | tout : tableur (formules en français ou en anglais, plus de 330 fonctions, tableaux dynamiques, mises en forme conditionnelles, tableaux, tris et filtres, tableaux croisés, graphiques), .magcalc, .xlsx et .ods (ouvrir et enregistrer), .xls (lecture), .csv/.tsv, .html, PDF, « Ouvrir avec » .xlsx/.xls/.ods/.csv/.tsv/.magcalc, enregistrement sur place, PDF envoyé à l'Atelier PDF | — |
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
Le déploiement est celui de GitHub Pages (racine de `main`) : pousser suffit. Chaque envoi (`git push`) déclenche
« pages build and deployment » sur le dernier commit envoyé, `[skip ci]` compris (constaté le 30/10/2026 : `[skip ci]`
n'évite que le workflow des APK). Vérifier la publication : API REST
`GET /repos/<dépôt>/actions/runs?per_page=30`, run « pages build and deployment » dont `head_sha` = `main`, `conclusion`
= `success`.

## Ajouter une appli

1. **`pc-apps.json`** : ajouter une entrée.
   ```json
   { "id": "notes", "android": "notes", "name": "Carnet", "short_name": "Carnet", "description": "…",
     "theme_color": "#…", "background_color": "#…",
     "vendor": ["jszip.min.js"],                       // bibliothèques chargées par la page (précachées)
     "workers": [],                                    // ex. ["ocr-worker.js"]
     "file_handlers": [{ "accept": { "text/plain": [".txt"] } }],   // facultatif : « Ouvrir avec »
     "styles": ["fenetres", "souris"],                 // feuilles communes de shared/apps/ (avant <id>.css)
     "modules": ["folders"],                           // scripts communs de shared/ (après pc-shim.js, avant <id>.js), précachés
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

## Majordome sur PC

Même page que l'APK (`applis/www-majordome` : `mj-nlu.js` analyse des commandes, `mj-orb.js` sphère de particules en canvas 2D,
`mj-app.js` exécution, `mj-depts.js` départements pour la vigilance), copiée par `copies`. `shared/apps/majordome.js` définit
`window.MAGMajordome` :

- **Reconnaissance hors ligne** : `vendor/vosk/vosk-worker.js` (vosk-browser 0.0.8, Vosk compilé en WebAssembly, 4,2 Mo, précaché).
  Le modèle `vosk-model-small-fr-0.22` (Alpha Cephei, Apache-2.0, ~41 Mo) se télécharge une fois depuis alphacephei.com (barre de
  progression) ou se choisit comme fichier `.zip` (« Choisir le fichier du modèle » si le site refuse la lecture depuis une page web) ;
  le worker l'extrait (libarchive) et le garde dans IndexedDB `/vosk` (clé `vosk-model-small-fr-0.22`, d'où le petit ajout « key » au
  message `load`). Drapeau `localStorage` `majordome:modele`. Micro : `getUserMedia` + `ScriptProcessor`, échantillons ×32768 vers le worker.
- **Web Speech** (Edge / Chrome) : seulement si l'utilisateur l'a choisi et a coché l'avertissement (l'audio part chez Microsoft / Google).
- **Mot de réveil** : reconnaissance continue, mot cherché dans les résultats partiels (accents et variantes « jar vis » tolérés),
  ignorée pendant que l'assistant parle (`hold`). Ctrl+Espace : parler.
- **Agenda** : `loadAgenda()` charge `shared/apps/agenda.js` (sans son interface : test `M.app`), même stockage `agenda-pc.v1` qu'Agenda ;
  une modification faite dans une autre fenêtre est relue (événement `storage`).
- **Budget** : la page écrit l'opération dans `budget.v1` (même origine) après confirmation ; `shared/apps/budget.js` relit les données
  si Budget est ouvert (`BudgetApp.reload`). Le solde n'est jamais lu.
- **Mélodie** : « pause », « suivant »… passent par `BroadcastChannel('mag-media')`, écouté par `shared/apps/musique.js`.
- Voix : `speechSynthesis` du navigateur (voix françaises de Windows, vitesse, hauteur, volume), ou **voix Piper hors ligne**
  (ci-dessous) ; minuteurs et rappels dans la page.
- Réglages, historique, notes, listes, minuteurs : `localStorage` `majordome:*` (exportables par le lanceur, sauf le modèle).

### Voix Piper et effet « Jarvis » (Majordome, APK et PC ; Fond Jarvis)

Fichiers communs dans `applis/www-majordome/` (copiés sur PC par `copies`) : `mj-voix.js` (catalogue, téléchargement, stockage,
lecture, effets, panneau Réglages › Voix), `mj-voix-worker.js` (synthèse dans un worker), `mj-phon.js` (phonétiseur français),
`piper/` (moteur). Le moteur n'est pas recopié dans `pc/` : les pages PC lisent `../../applis/www-majordome/piper/` (le site
publie tout le dépôt) ; il n'est pas précaché (13,7 Mo) mais gardé par le service worker au premier usage (réseau puis cache).

- **Moteur** : sherpa-onnx 2.0.1 en WebAssembly (Apache-2.0 ; onnxruntime MIT), construction officielle `wasm-simd` (un fil,
  sans SharedArrayBuffer : marche dans la WebView d'Android et dans WebView2 de Lively) ; glue emscripten sans le paquet `.data`
  de démonstration (`piper/LISEZ-MOI.txt`). `.wasm` 13,7 Mo, 3,8 Mo compressé. APK Majordome : +4,5 Mo (17,6 Mo au lieu de
  13,1). La bibliothèque native (AAR sherpa-onnx 2.0.1) ajoutait 31 Mo de `.so` pour arm64 seul (onnxruntime 22 Mo) et aurait
  demandé un second phonétiseur en Java : la WebView fait tourner le même WASM, dans un worker (interface jamais bloquée).
- **Licences et phonétisation** : les voix Piper attendent des phonèmes produits par espeak-ng (**GPL-3.0**). sherpa-onnx ≥ 2.0
  ne contient plus espeak-ng (CHANGELOG : « Remove espeak-ng and piper-phonemize », #4055) et reçoit des phonèmes tout faits
  (`GenerationConfig.phonemeCodepoints`) ; piper-tts-web et le module `piper-phonemize` (WASM, ~18 Mo de données) embarquent
  espeak-ng, donc GPL. Choix : **phonétiseur écrit pour Majordome** (`mj-phon.js`, règles graphème → phonème, lexique,
  nombres, élisions, liaisons, accent final, mêmes conventions de transcription que l'entraînement des voix). Aucun code GPL
  publié ni chargé. Écart avec espeak-ng (référence de développement, jamais publiée) : 1,0 % de phonèmes sur des phrases
  générales, 1,8 % sur les phrases de Majordome ; intelligibilité mesurée par reconnaissance automatique (Whisper small,
  10 phrases) : 2 à 12 % de mots erronés selon la voix et l'effet, du même ordre qu'avec espeak-ng.
- **Voix** (`rhasspy/piper-voices`, licences lues dans les MODEL_CARD) : Pierre et Jessica (`fr_FR-upmc-medium`, un fichier
  pour deux voix, 73 Mo, CC BY-SA 4.0), Gilles (`fr_FR-gilles-low`, 60 Mo, 16 kHz, CC0), Siwis (`fr_FR-siwis-medium`, 60 Mo,
  CC BY 4.0). Écartées : `fr_FR-tom-medium` (AGPL-3.0), `fr_FR-mls-medium` (CC BY 4.0 mais 125 locuteurs mêlés, non retenue).
  Pierre est la voix par défaut (homme, posée). Les modèles ne sont pas dans le dépôt.
- **Téléchargement** : `https://huggingface.co/rhasspy/piper-voices/resolve/main/…` (CORS vérifié depuis Internet : 302 vers
  le CDN, `Access-Control-Allow-Origin` à chaque étape, origines `*.localhost` de Lively comprises) ; somme SHA-256 figée
  dans `MODELS` (fichiers de la révision b4e358f) ou annoncée par l'API `…/api/models/rhasspy/piper-voices/tree/main/…`
  (oid LFS ; oid git pour le `.onnx.json`). Repli : « Choisir les fichiers téléchargés » (`.onnx` + `.onnx.json`).
  Stockage : IndexedDB `mj-voix` (PC, Lively), liste `localStorage` `mj-voix:installees` commune au même site ; Android :
  stockage privé `files/piper/<modèle>/` (MajordomeBridge, lu par `Capacitor.convertFileSrc`).
- **Chargement** : les `.onnx` d'origine n'ont pas les métadonnées que sherpa-onnx lit (`sample_rate`, `n_speakers`,
  `comment=piper`…) : le worker les ajoute en fin de fichier (champ 14 répétable du protobuf `ModelProto`) et écrit
  `tokens.txt` depuis `phoneme_id_map`. Préchargé au démarrage quand Piper est choisi.
- **Lecture** : découpage par phrases (première tranche ≤ 70 caractères, coupée à une virgule) ; la suivante est synthétisée
  pendant la lecture. Premier son mesuré : < 1 s moteur préchauffé (Chromium sans GPU, 2 cœurs). Web Audio sur PC ; Android :
  PCM 16 bits vers `MajordomeBridge.piperPlay` → AudioTrack (USAGE_ASSISTANT), focus audio « transitoire, atténuer les
  autres », micro de veille coupé (`Ear.hold`). Niveau de la sphère, de Socle et du fond animé : RMS réel de l'audio joué.
- **Effet** (`MJVoix.render`, OfflineAudioContext ; même calcul sur Android puisque l'audio est produit dans la page) :
  Aucun, Discret, Majordome (défaut de Majordome), IA de film (défaut du Fond Jarvis), Radio ; réglages fins : réverbération
  et taille de pièce, chorus ou flanger, passe-haut / passe-bas, saturation, grave, présence, hauteur (rééchantillonnage
  compensé à la synthèse). Sortie : crête ≤ −1 dBFS et niveau moyen plafonné (RMS 0,2) : jamais d'écrêtage, même volume d'un
  effet à l'autre. Les voix du système ne passent pas par Web Audio : effet réservé à Piper. Effet générique, aucune imitation.
- **Repli** : voix absente, moteur qui ne se charge pas ou erreur avant le premier son → voix du système, sans message.

## Fond Jarvis (fond d'écran animé)

Source : `pc/shared/fond-jarvis/` (page `index.html`, `fj.css`, `fj-icons.js`, `fj-hud.js`, `fj-app.js`, `fj-jarvis.js`,
`LivelyInfo.json`, `LivelyProperties.json`, `agenda/vide.ics`, `thumbnail.jpg`, `preview.gif`, `icon-512.png`, `guide.html`).
Sphère et analyseur : `applis/www-majordome/mj-orb.js` et `mj-nlu.js` (copies, inchangés). Entrée de `pc-apps.json` :
`page`, `icon` (icône propre), `pcconf` (ni bouton ⓘ ni « Installer » sur un fond d'écran), `raw` (fichiers publiés tels quels,
non précachés : guide, aperçu) et `lively` (paquet).

- **Paquet Lively** : `build-pc.py` fabrique `pc/fond-jarvis/fond-jarvis-lively.zip` (entrées à date fixe : même contenu, même
  fichier ; `LivelyInfo.json` à la racine, type 1 = page web locale, `Arguments` = `--system-information --system-nowplaying
  --pause-event true`), `fj-version.js` (empreinte et date, dans le paquet et la page) et `fj-version.json` (le paquet installé le
  lit une fois par jour pour signaler une nouvelle version). Le paquet contient la page (pas une adresse) : d'après le code de
  Lively (`WallpaperLibraryFactory`, `Lively.Player.WebView2/Form1.cs`), un fond « adresse web » n'a ni `LivelyProperties.json`
  ni valeurs envoyées au chargement, et resterait noir hors ligne au démarrage.
- **Lively** sert la page sur `https://<empreinte>.localhost/` (WebView2, `SetVirtualHostNameToFolderMapping`) : `FJ.mode =
  'lively'`. Stockage propre à Lively (et à chaque écran en mode « Écran ») : pas de partage avec la Suite ouverte dans Edge.
  Liens : `window.open` dans un clic → Lively les passe à Windows (`Process.Start`), protocoles `ms-settings:` compris ; une
  navigation dans la page remplacerait le fond. Pas de micro (aucune autorisation prévue par le lecteur), clavier à activer dans
  Lively.
- **Suite** (`FJ.mode = 'suite'`) : même origine que Majordome, Agenda (`agenda-pc.v1`, via `shared/apps/agenda.js`), notes et
  listes (`majordome:listes`), modèle vocal Vosk (pont `shared/apps/majordome.js`, chargé au premier clic sur le micro) ; mise à
  jour du service worker appliquée sans bandeau.
- **Énergie** : une seule boucle d'images (`FJ.loop`, 30 i/s au plus, 15 sur batterie, 10 en animations réduites) ; la sphère de
  Majordome y passe (requestAnimationFrame redirigé), toile en résolution réduite ; anneaux lents dessinés une fois dans le fond
  fixe, anneaux tournants en vectoriel sur un calque limité à la scène, impulsions effacées par zones ; arrêt complet quand Lively
  met en pause ou que la page est cachée. Réseau : météo toutes les 30 min, titres toutes les 20 min.
- Réglages : `localStorage` `fond-jarvis:*` ; une valeur de `LivelyProperties.json` déjà reçue n'écrase pas un choix fait depuis
  dans le panneau ⚙ (`fond-jarvis:lively`).
- **Voix Piper** : mêmes fichiers que Majordome (paquet : `mj-voix.js`, `mj-voix-worker.js`, `mj-phon.js`, `piper/`, 4,3 Mo en
  tout) ; ⚙ › Voix (panneau commun ; `S.vfx` / `S.vfxo` pour l'effet, `S.fx` restant l'intensité des effets visuels) ;
  propriétés Lively « Voix » et « Effet sur la voix Piper ». Dans Lively, IndexedDB propre au fond : la voix se télécharge une
  fois dans le fond (ou se choisit en fichiers) ; dans la Suite, elle est partagée avec Majordome PC.

## Applis bureautiques (shared/office/)

Présentation, Texte et Tableur sont les applis bureautiques. Leurs pièces communes sont dans
`pc/shared/office/` et servent **telles quelles** au PC et à l'APK (une seule source) :

| Fichier | Rôle |
|---|---|
| `office-core.js` | `window.Office` : utilitaires, icônes Lucide (avec alias), dialogues, menus (feuille du bas sur téléphone), sélecteur de couleurs (couleurs du thème), raccourcis, polices |
| `office-ribbon.js` | ruban à onglets (boutons, menus, listes, galeries, onglets contextuels, recherche de commande, mode compact, repli) ; champs numériques à la française (virgule décimale, flèches haut / bas) |
| `office-richtext.js` | texte riche (contentEditable) : nettoyage du collé, styles par plage, listes, reproduire la mise en forme, rechercher/remplacer |
| `office-files.js` | ouvrir, enregistrer sur place, enregistrer sous, exporter, partager, « Ouvrir avec », récents, enregistrement automatique et récupération (IndexedDB) ; trois moteurs : `MAGPC` (PC), `MAGOffice` (APK, `applis/scripts/OfficeBridge.java`), navigateur |
| `office-themes.js` | 16 thèmes (couleurs, polices), rôles de couleur, contrôle de contraste WCAG |
| `office-pdf.js` | PDF avec jsPDF : pages, documents à distribuer (1 à 9 par page), pages de commentaires, texte |
| `office-raster.js` | rendu d'un morceau de page en image (SVG `foreignObject` en `data:`), pour les exports et vignettes |
| `office-history.js` | annuler / rétablir illimité (instantanés à partage de structure) |
| `office.css` | jetons clair/sombre, dialogues, menus, ruban, tailles tactiles |

Fichiers réels (audit d'octobre 2026) — aides communes de `office-core.js` :

| Aide | Rôle |
|---|---|
| `O.progress(libellé)` | barre de progression (affichée au-delà de 300 ms ; `prog(i, n)`, `prog.text()`, `prog.end()`) : ouverture, enregistrement, PDF |
| `O.yieldUi(ms)` | rend la main à l'interface (au plus toutes les `ms`, 40 par défaut) pendant une lecture ou une écriture longue |
| `O.openZip(données)` | archive .docx/.xlsx/.odt : lecture normale, sinon récupération des parties lisibles d'une archive tronquée (en-têtes locaux, `DecompressionStream`) ; fichier protégé par mot de passe (`O.isEncryptedOffice`) : message clair |
| `O.parseXmlLenient(xml)` | XML tronqué ou mal fermé complété (balises refermées au bon endroit) plutôt qu'abandonné |
| `O.unviewableImage(type)`, `O.placeholderImage()`, `O.sniffImage(octets)` | EMF / WMF / TIFF / SVM : montrées par un cadre « Image EMF — conservée telle quelle », jamais converties ni perdues à l'enregistrement ; type reconnu d'après le contenu |

`pres-charts.js` (servi aussi à Texte) : `P.chartFromXml(chartSpace)` et `P.smartFromXml(dataModel, disposition)`, lecture des
graphiques et SmartArt Office (Présentation et Texte).

Une appli bureautique a `"office": true` dans `pc-apps.json` : `build-pc.py` réécrit `"office/…"` en
`"../shared/office/…"` et précache tout le dossier. Côté APK, `applis/www-<appli>/office-deps.txt` liste ce qu'il
faut copier (pièces communes, bibliothèques, licences) : `applis/scripts/office-deps.sh`, lancé par `print-patch.sh`.
Les fichiers propres à l'appli (`pres-*.js`, `pres.css`, `tx-*.js`, `texte*.css`, `tb-*.js`, `tableur.css`) sont des `copies` (même fichier que dans l'APK).

Texte ajoute deux bibliothèques communes, prêtes pour Tableur :

| Fichier (shared/vendor/) | Rôle |
|---|---|
| `prosemirror.min.js`, `prosemirror.css` | éditeur structuré ProseMirror (modèle, état, vue, historique, raccourcis, règles de saisie, listes, tableaux), objet global `window.PM` ; construit par `shared/office/tools/prosemirror-build.mjs` (esbuild) depuis les tags GitHub officiels |
| `fonts/` | polices libres pour l'écran et le PDF (texte vectoriel incorporé) : Mag Sans, Mag Serif, Mag Mono (Liberation 2.1.5), Mag Sans Douce (Carlito), Caladea ; métriques dans `metrics.json` ; `shared/office/tools/fonts-build.py` |

Formats de Texte : `.magdoc` (zip : `document.json`, `media/`, `thumb.jpg`) est le format complet ; `.docx` et `.odt`
sont écrits et lus directement en XML (`tx-docx.js`, `tx-odt.js`, sans bibliothèque) ; PDF vectoriel (`tx-pdf.js`, jsPDF :
chaque mot à sa place mesurée, polices incluses, signets des titres, liens, commentaires en notes PDF).

### Présentation : animations d'un .pptx

- **Cible** d'une animation (`slide.anims[]`) : l'objet entier, un ou plusieurs paragraphes de son texte (`para: [début, fin]`,
  `<p:txEl><p:pRg>`), ou la forme sans son texte (`bg`, `<p:bg/>`). Un paragraphe = un bloc du HTML (`Pres.paraWalk`), le même
  découpage que l'import (un `<a:p>` = un bloc) et l'export (`IO.htmlRuns`, qui note pour chaque `<a:p>` écrit le bloc d'origine).
- **Départ caché** : comme PowerPoint, un objet ou un paragraphe dont le premier effet est une entrée est caché au départ ;
  les paragraphes non animés restent visibles.
- **Déclencheurs** (`trigger: id de l'objet`, `interactiveSeq`) : chaque clic sur l'objet joue l'étape suivante de sa séquence,
  qui recommence une fois finie ; le diaporama n'avance pas ; la fenêtre publique suit. La lecture / pause au clic sur une
  vidéo, que PowerPoint écrit pour chaque média, reste le comportement natif (rien n'est ajouté aux animations).
- **Médias** : `cat: 'media'`, `fx` = `play` (`playFrom(x)`, `from`), `pause` (`togglePause`), `stop`. La lecture de la séquence
  principale suit le réglage « Démarrer : au clic » ; les autres commandes sont des animations ordinaires. « Masquer pendant
  la non-lecture » = `hideStopped` (`showWhenStopped="0"`).
- **Paragraphe disparu** (texte raccourci après la pose des animations) : l'étape est gardée sans effet, comme LibreOffice,
  avec un avertissement et « Retirer ces étapes » (volet Animation aussi) ; l'export ne l'écrit pas (fichier valide).
- **Export** : liste de construction (`bldP build="p"` pour un texte animé par paragraphe, `animBg="1"` pour une forme),
  `grpId`, une séquence interactive par objet déclencheur ; images EMF / WMF gardées telles quelles (`image/x-emf`).
- **Éditeur** : volet Animation (« ¶2 texte… », section par déclencheur, « Effets du texte : tout à la fois / par paragraphe »,
  « Déclencheur »), ruban (Options d'effet > Séquence, Déclencheur, Ajouter une animation > Média).
- **Gros fichiers** : barre de progression à l'ouverture, la main est rendue à l'interface toutes les 40 ms, miniatures
  dessinées par lots (les plus proches d'abord).

### Texte : repères

Raccourcis principaux : Ctrl+S / F12 (enregistrer, enregistrer sous), Ctrl+O, Ctrl+N, Ctrl+P, Ctrl+F / Ctrl+H
(rechercher, remplacer), Ctrl+B/I/U, Ctrl+Maj+=  et Ctrl+= (exposant, indice), Ctrl+L/E/R/J (alignements),
Ctrl+1/2/5 (interlignes), Ctrl+Alt+1/2/3 (Titres 1 à 3), Ctrl+Maj+N (Normal), Ctrl+Entrée (saut de page),
Ctrl+Maj+Entrée (saut de colonne), Ctrl+Alt+F (note de bas de page), Ctrl+Alt+D (note de fin), Ctrl+Alt+M
(commentaire), Ctrl+Maj+E (suivi des modifications), Ctrl+K (lien), F9 (mettre à jour les champs), F7 (orthographe),
Maj+F3 (casse), Alt+Q (rechercher une commande), Ctrl+F1 (replier le ruban). Le panneau « Raccourcis » de l'appli
(Fichier › À propos) donne la liste complète.

### Texte : fichiers Word réels

- **Gardé tel quel** (`keep` sur les nœuds `image` et `drawing`) : graphiques (`c:chart`, classeur incorporé), SmartArt
  (`dgm`), groupes (`wpg`), zones de dessin, objets OLE (`w:object`), dessins VML. À l'import : XML d'origine + parties liées
  (relations suivies, types de `[Content_Types].xml`) rangées dans les médias (donc dans le .magdoc) ; affichage d'après
  les données (graphique : valeurs en cache ; SmartArt : textes) ou cadre « … (conservé tel quel) ». À l'export .docx :
  parties recopiées sous un nouveau nom, relations et `wp:docPr` renumérotés, taille mise à jour si l'objet a été
  redimensionné ; un graphique ou SmartArt modifié dans Texte est réécrit à la manière de Texte (image).
- **Images** : EMF / WMF / TIFF (et SVM de LibreOffice) affichées par un cadre, gardées telles quelles (.docx, .odt) ; SVG
  écrit avec son image PNG de repli (`a:blip` + `asvg:svgBlip`) comme Word ; PDF et impression ne s'arrêtent plus sur une
  image illisible. RTF : `\emfblip` / `\wmetafile` gardés (en-tête « placeable » ajouté au WMF).
- **Champs et formulaires** : `HYPERLINK` (lien sur le texte affiché), `FORMCHECKBOX` → ☒ / ☐, `FORMTEXT` / `FORMDROPDOWN` et
  contrôles de contenu → leur texte ; sommaire : paragraphes du bloc qui ne sont pas des entrées (titre « Sommaire »…) gardés.
  `w:altChunk` (HTML, RTF, texte) repris. Texte inséré puis supprimé (`w:ins` > `w:del`) : supprimé.
- **Fichiers abîmés** : archive tronquée → parties lisibles récupérées ; XML mal fermé → complété ; partie principale
  absente, fichier vide, aléatoire, .doc, protégé par mot de passe → message en français (`e.user`, `console.warn`).
- **Gros documents** : lecture découpée (main rendue toutes les 40 ms) et barre de progression ; tabulations calculées par
  « tours » de lecture puis d'écriture (un recalcul de mise en page par tour, plus un par paragraphe) ; vignette limitée à
  la 1re page ; second passage des champs dans une tâche à part. Reste une mise en page complète d'un seul tenant
  (≈ 0,2-0,4 s pour 150 pages sur la machine d'essai).
- **Mise en page** : un paragraphe déjà passé à la page suivante (avec ses paragraphes « solidaires ») n'y repasse plus,
  même s'il ne tient toujours pas (sinon pages créées sans fin et onglet figé) ; image de repli VML d'un groupe (SmartArt
  enregistré par LibreOffice) : taille prise sur le groupe ou sur le choix DrawingML, pas sur la forme (unités du groupe).

### Tableur : fichiers Excel réels

- **Formules non calculables ici** (fonction inconnue : `MAFONCTION()`, `WEBSERVICE`, `CUBEVALUE`… ; lien vers un autre
  classeur `[1]Feuille!A1` ; syntaxe non comprise) : `WP.markOpaque()` garde la dernière valeur calculée (`f.keep`), la
  formule d'origine est réécrite telle quelle (`f.raw`, `_xlfn.` compris) ; avertissement à l'ouverture ; une saisie dans
  la cellule la remplace. Gardé aussi dans le .magcalc (`raw`).
- **Liens externes** (`xl/externalLinks/`) et **macros** (`xl/vbaProject.bin`, jamais exécutées) gardés (`wb.keep`) :
  réécrits dans le .xlsx ; un .xlsm reste un .xlsm (type `macroEnabled`, Excel refuse sinon), « Enregistrer sous » propose
  .xlsm ; enregistré en .xlsx, les macros sont retirées avec un avertissement. `.xltx` : type modèle.
- **Codes d'erreur** écrits en anglais dans le fichier (`#N/A`, `#NAME?`…), jamais traduits (`#NOM?` rendait le fichier invalide).
- **Dessins sans préfixe** (`<wsDr xmlns=…>` d'openpyxl et d'outils de rapport) : préfixés `xdr:`/`a:` avant ExcelJS, qui
  s'arrêtait sur tout le classeur. Une partie secondaire illisible (dessin, note, tableau, croisé) est retirée et le reste
  s'ouvre ; dernier recours : SheetJS (valeurs, formules) ; XML abîmé complété (`O.parseXmlLenient`).
- **Très grandes feuilles** (XML > 4 Mo, ≈ 40 000 lignes et plus) : cellules lues par `bigAside`/`bigLoad` (expressions
  régulières, par morceaux, formules partagées décalées avec `P.shift`, styles retrouvés par une ligne témoin 1 048 576 lue
  par ExcelJS) et écrites par `bigWrite` (chaînes en ligne) ; conversion, recalcul (`finishLoadAsync`, par lots de 3 000),
  écriture .ods et PDF découpés ; barre de progression (`O.progress`). 200 000 lignes × 8 colonnes + 200 000 formules :
  ouverture ≈ 7 s sans tâche de plus de 110 ms, .xlsx ≈ 10 s (≈ 0,4 s au plus), .ods ≈ 12 s (0,15 s au plus) ; .magcalc
  ≈ 3 s avec ≈ 0,8 s d'un tenant (`JSON.stringify`).

### Tableur : repères

Fichiers de `applis/www-tableur/` : `tb-core` (adresses, dates, nombres, styles), `tb-format` (formats de nombre des
tableurs, affichage français), `tb-formula` (analyse et écriture des formules, noms français et anglais, `;` ou `,`),
`tb-engine` (classeur, recalcul par dépendances, références circulaires et itérations, tableaux dynamiques, annuler /
rétablir), `tb-functions` (fonctions), `tb-grid` (grille sur canevas, virtualisée), `tb-data` (presse-papiers, CSV,
recopie, tri, filtres, sous-totaux, plan, tableaux croisés, valeur cible, remplissage instantané), `tb-cf` (mises en forme
conditionnelles, styles de tableau, sparklines), `tb-charts`, `tb-objects` (graphiques, images, formes, icônes),
`tb-io` (aiguillage des formats, .magcalc, CSV, HTML, .xls), `tb-xlsx` et `tb-xlsx-charts` (.xlsx), `tb-ods` (.ods),
`tb-pdf`, `tb-templates`, `tb-dialogs`, `tb-panes`, `tb-ui` (ruban, barre de formule, onglets, raccourcis), `tb-app`.

Bibliothèques : **ExcelJS 4.4.0** (MIT) lit et écrit les .xlsx (styles, fusions, volets, validations, mises en forme
conditionnelles, notes, images, mise en page) ; Tableur ajoute au paquet les tableaux, les noms et les graphiques
(XML Office standard) et corrige deux défauts d'ExcelJS (ordre de l'`extLst`, styles différentiels absents des fichiers
de LibreOffice). **SheetJS CE 0.18.5** (Apache-2.0) lit les anciens .xls. Le .ods est lu et écrit en XML OpenDocument
(`tb-ods.js`). Le moteur de formules est celui de Tableur (`tb-formula.js`, `tb-engine.js`, `tb-functions.js`) : il gère
les noms français des fonctions, les tableaux dynamiques et les références structurées, et a été comparé au recalcul de
LibreOffice (voir Essais).

**Mettre à jour une bibliothèque** : changer la version dans `pc/package.json` et dans `vendor` de `pc/pc-apps.json`,
puis GitHub › Actions › « Mettre à jour les bibliothèques (pc/shared/vendor) » › Run workflow (champ « fichiers » :
par exemple `exceljs.min.js`, ou `toutes`) ; le workflow recopie le fichier et sa licence dans `pc/shared/vendor/` et
enregistre sur `main`. En local : `cd pc && npm install && python3 build-pc.py --vendor=exceljs.min.js`.

Formats : `.magcalc` (zip : `workbook.json`, `media/`, `thumb.jpg`, `LISEZMOI.txt`) est le format complet ; `.xlsx`,
`.ods` en lecture et écriture ; `.xls` en lecture ; `.csv` / `.tsv` (assistant : encodage UTF-8 ou Windows-1252,
séparateur, virgule décimale, ordre des dates) ; `.html` ; PDF vectoriel à polices incluses (`tb-pdf.js`).

Raccourcis principaux : flèches, Entrée / Tab (Entrée revient à la colonne de départ après des Tab), F2 (modifier),
Échap, Ctrl+flèches (bord des données), Maj+flèches (étendre), Ctrl+Espace / Maj+Espace (colonne, ligne),
Ctrl+A, Ctrl+Début / Fin, Ctrl+; (date du jour), Ctrl+Maj+: (heure), F4 ($ dans une formule, sinon répéter),
Alt+= (somme automatique), Ctrl+D / Ctrl+R (recopier en bas, à droite), Ctrl+E (remplissage instantané),
Ctrl+Maj+L (filtre), Ctrl+L ou Ctrl+T (tableau), Ctrl+1 (format de cellule), Ctrl+B/I/U, Ctrl+Z / Ctrl+Y,
Ctrl+C / X / V et Ctrl+Alt+V (collage spécial), Ctrl++ / Ctrl+- (insérer, supprimer), Ctrl+9 / Ctrl+0 (masquer),
Ctrl+Entrée (remplir la sélection), Ctrl+Maj+Entrée (formule matricielle), Alt+Entrée (retour à la ligne),
Alt+↓ (liste de validation ou filtre), F9 (recalculer ; dans une formule : évaluer la partie choisie), Maj+F3
(insérer une fonction), Ctrl+F3 (noms), Maj+F2 (note), F11 / Alt+F1 (graphique), Maj+F11 (feuille),
Ctrl+Pg préc. / Pg suiv. (feuilles), Ctrl+F / Ctrl+H (rechercher, remplacer), Ctrl+G / F5 (atteindre),
Ctrl+` (afficher les formules), Ctrl+S / F12, Ctrl+O, Ctrl+N, Ctrl+P.

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

## Dossiers du PC mémorisés (shared/folders.js)

Rangement, Écran, Mélodie, Galerie et Liseuse partagent `MAGPC.Folders` (`"modules": ["folders"]`) :

- **Liste gardée** : les poignées `FileSystemDirectoryHandle` sont rangées telles quelles dans IndexedDB (clonage
  structuré, jamais en JSON) et relues au démarrage. Chaque appli garde son enregistrement : Rangement `mag-pc` › `files` ›
  `fichiers-racines`, Écran `ecran-pc` › `kv` › `racines`, Mélodie `melodie` › `kv` › `pc:dossiers`, Galerie `mag-pc` ›
  `files` › `galerie-dossier`, Liseuse `mag-pc` › `files` (un enregistrement par dossier suivi). Mêmes bases et mêmes clés
  quelle que soit la page (appli installée ou onglet : même origine) ; une nouvelle version du service worker ne touche pas
  à IndexedDB (versions de bases inchangées). `navigator.storage.persist()` est demandé (sans fenêtre dans Edge/Chrome,
  accordé d'office à une appli installée ou très utilisée) pour que le navigateur n'efface pas les données s'il manque de place.
- **Accès** : Edge et Chrome remettent l'autorisation à « prompt » à chaque session. `F.checkAll()` (queryPermission) au
  démarrage ; `F.reauth()`, pendant UN clic, appelle `requestPermission` pour tous les dossiers en attente, à la suite, en
  revérifiant d'abord chacun (la fenêtre « Restaurer l'accès » de Chrome 122+ les rend tous d'un coup) ; si le navigateur
  exige un nouveau clic (`SecurityError`), une petite fenêtre « Encore N dossiers » le demande. Un refus ou une fenêtre fermée
  ne retire **jamais** rien de la liste. `F.ensure()` : même chose depuis une lecture (une seule demande à la fois).
- **Ajout** : dossier déjà dans la liste, compris dans un autre (`resolve()`), ou qui en contient d'autres (fusion).
  Ancien format (un seul dossier) repris une fois (`legacy`).
- **Aide commune** `MAGPC.Folders.help()` : pourquoi l'accès est redemandé ; **« Toujours autoriser »** : depuis Chrome 122,
  une appli **installée** garde l'accès une fois accordé, et dans un onglet la fenêtre propose « Autoriser à chaque visite »
  (<https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api>) ; Edge (même moteur) selon sa
  version, sans documentation de Microsoft ; réglage d'Edge qui efface les « cookies et données de site » à la fermeture.
- `MAGPC.Folders.bar(F, {onGranted})` : bandeau flottant « Vos dossiers : … · Autoriser l'accès » pour les pages Android sans
  place prévue (Galerie, Liseuse).

**Mélodie** (`shared/apps/musique.js`) : « Ajouter un dossier » (menu ⋮, glisser un dossier), « Mes dossiers » (menu ⋮ et
onglet Dossiers : retirer, relire, autoriser). Chaque morceau garde `{mpcHandle, mpcRoot, mpcRootId}` (`blob:<id>`). La
bibliothèque (titres, artistes, pochettes, durées, dernière écoute) est celle de la page, gardée dans IndexedDB : elle s'affiche
avant toute autorisation ; bandeau « Vos dossiers : Musique, OneDrive » + un bouton ; cliquer un titre demande l'accès pour
tous. Accès accordé : les dossiers sont relus (nouveaux morceaux importés, morceau déplacé ou ancien format retrouvé par
nom et taille, morceaux disparus retirés ; un morceau « Retiré » par l'utilisateur ne revient pas : `pc:retires`).
**Galerie** : une fenêtre « Autoriser l'accès » au démarrage ; refus : bandeau, rien d'oublié. **Liseuse** : une seule demande
pour tous les dossiers suivis ; un dossier non autorisé reste suivi (plus « Accès perdu »), bandeau.

## Rangement : plusieurs dossiers

`shared/apps/fichiers.js` remplace, sans toucher à la page Android, le pilote `PcDrv` à un dossier par une liste de
« racines » (`/Documents`, `/Images`, `/Images (2)` si deux dossiers ont le même nom) analysées ensemble : `roots()`,
`root()`, `scan()` (toutes les racines), `pick()` (ajout). La liste est dans IndexedDB `mag-pc` › `files` › `fichiers-racines`
(l'ancien `fichiers-dossier` du lot 1 est repris ; logique commune `shared/folders.js`). Au démarrage, `queryPermission` ; si l'accès est à redemander :
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
contient un autre → fusion ; lecture seule, `showDirectoryPicker({mode:'read', startIn:'videos'})` ; logique commune `shared/folders.js`).
La liste des vidéos (nom, dossier, taille, date, poignées des fichiers et des sous-titres) est gardée dans `ecran-pc` › `kv` ›
`bibliotheque` : au démarrage, la bibliothèque s'affiche tout de suite, même avant la réautorisation (bandeau « Vos dossiers :
… » et un bouton) ; seule la lecture demande l'accès (pendant le clic, pour tous les dossiers). L'ancien dossier unique
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
tous ces fichiers (page, copies `tx-*`/`tb-*`/`pres-*`, pièces communes `shared/office/`, bibliothèques, modules,
workers) : toute modification publiée change l'empreinte. Les polices Google de l'Atelier sont gardées en cache après la
première visite.

- **Date de version** : `pc/versions.json` (généré, à publier) garde pour chaque appli son empreinte et le jour où elle a
  changé (`build-pc.py` met la date du jour, heure de Paris, seulement quand l'empreinte change : `--check` reste stable).
  `sw.js` porte `DATE` et répond au message `{type:'VERSION'}` par `{app, version, date}`.
- **Arrivée d'une mise à jour** : le navigateur revérifie `sw.js` à chaque ouverture (et `MAGPC.update()` toutes les heures,
  et au retour sur la fenêtre après 10 min). Appli **fermée** : la nouvelle version s'installe et s'active d'elle-même
  (rien à faire). Appli **ouverte** : la nouvelle version attend ; bandeau « Nouvelle version disponible · version du
  JJ/MM » (« Plus tard » / « Mettre à jour » → `SKIP_WAITING`, rechargement, puis « Mise à jour installée : version du
  JJ/MM »). L'activation supprime les caches `mag-pc-<appli>-<ancienne version>` ; IndexedDB, `localStorage`, poignées de
  dossiers et fichiers mémorisées ne sont jamais touchés.
- **Voir sa version** : bouton **ⓘ** en bas à gauche de chaque appli (≥ 900 px de large) → « À propos » : version du
  JJ/MM/AAAA, code de version, « Rechercher une mise à jour » (`MAGPC.checkUpdate()` : « Vous avez la dernière version »,
  ou bandeau), « Toutes les applis ». Présentation, Texte et Tableur : Fichier › À propos (`MAGPC.aboutBlock()`).
- **Lanceur** (`pc/index.html`, page sans service worker : toujours la dernière publication, cache HTTP de GitHub Pages
  10 min) : « Version du JJ/MM » sur chaque tuile, date de la Suite, bouton **« Rechercher les mises à jour »** qui fait
  vérifier toutes les applis déjà ouvertes sur ce PC (`getRegistrations()`, `update()`, message `VERSION`) : « à jour »,
  « Mise à jour prête » (appli ouverte : cliquer « Mettre à jour » dans sa fenêtre) ou « N appli(s) mise(s) à jour à
  l'instant » ; il recharge la page si `versions.json` publié est plus récent que la page affichée.

## Tests

Playwright (Chromium) contre un serveur http local servant la racine du dépôt, en 1366×768 et 412×915.
Les sélecteurs de fichiers sont simulés avec l'OPFS (vraies poignées File System Access, stockables dans
IndexedDB) ; `launchQueue` et `window.print` sont simulés. Vérifier : `Page.getInstallabilityErrors` (CDP) vide,
service worker maître de la page, rechargement hors ligne, fonctions principales, console sans erreur, et le banc
Android (pages `applis/` avec ponts simulés, sans `MAGPC`). Toile : comparer les zones gardées de `toile-worker.js`
avec les fonctions de `WallpaperJob.java` compilées telles quelles (faux `android.graphics` en Java : `Bitmap`,
`Rect`, `Canvas` bilinéaire) sur des images construites exprès (bordures, bandeau, logo, paysage, portrait).
Autorisations « à redemander » : `queryPermission` simulé à `prompt` jusqu'au clic ; aussi refus (`denied`), fenêtre fermée
(`prompt`), et un dossier par demande avec clic « consommé » (fenêtre « Encore N dossiers »).
Dossiers mémorisés (Mélodie, Écran, Galerie, Liseuse, Rangement) : ajout, rechargement complet, nouvelle version du service
worker activée, bibliothèque affichée depuis le cache avant l'accès, un seul bouton, refus sans rien perdre, lecture qui
demande l'accès, dossier imbriqué, fusion, retrait, ancien format repris, fichiers ajoutés ou supprimés sur le PC.
Présentation : création de 8 diapositives (tous les contenus, animations, transitions, notes), diaporama et mode
présentateur (fenêtre publique), annuler/rétablir, .magpres réouvert à l'identique, .pptx exporté puis validé par
python-pptx et LibreOffice et réimporté, import d'un .pptx fait avec python-pptx, PDF (1 à 6 par page, commentaires),
images, téléphone 412 px au doigt (événements tactiles CDP) et pont `MAGOffice` simulé.
Présentation, animations : calendrier comparé à PowerPoint (« avec » part avec le groupe, « après » à la fin de ce qui
précède), délais, durées et répétitions lus dans les animations jouées (`getAnimations`), objets cachés au départ, trois
diaporamas de suite dans la même page (un clic = une étape), .magpres, copie de sécurité (fermeture juste après Ctrl+S,
récupération, fichier plus récent que la copie, copie impossible faute de place), ordre changé dans le volet, durée
modifiée, Ctrl+D, copier-coller, diapositive dupliquée, fenêtre publique ; `<p:timing>` contrôlé (identifiants, cibles,
déclencheurs, délais, répétitions), lu par LibreOffice (conversion .odp), réimporté à l'identique ; import d'un .pptx
python-pptx au minutage écrit comme PowerPoint 365 (aller-retour, répétitions, lecture vidéo, déclencheur, boucle, plein écran).
Présentation, vidéos : WebM VP9/Opus de 6 s et de 180 Mo (ffmpeg), Chromium lancé avec `--autoplay-policy=user-gesture-required` ;
au clic / automatiquement / en cliquant dessus, clic sur la vidéo (pause sans avancer), commandes, Alt+P, flèches pendant la
lecture, plein écran et rembobinage, mode présentateur (son dans la fenêtre publique, pause synchronisée), .magpres
rouvert, appli rouverte, .pptx exporté, lu par LibreOffice et rouvert ; en 1366×768 et 412×915 au doigt.
Présentation, animations par paragraphe et déclencheurs : .pptx synthétique (python-pptx, `<p:timing>` écrit à la main) avec
« Apparaître » paragraphe par paragraphe (`txEl`/`pRg`, `bldP build="p"`), fondu, entrée brusque, balayer, sortie et emphase
sur des paragraphes, avec / après, délais et durées (lus par `getAnimations`), forme sans son texte (`<p:bg/>`), départ
automatique (`onBegin`), `charRg` (objet entier), paragraphe visé qui n'existe plus (étape sans effet, avertissement,
« Retirer ces étapes »), déclencheurs au clic sur une forme (`interactiveSeq`, étapes successives, le diaporama n'avance pas),
commandes média (`playFrom(1.0)`, `togglePause`, `stop`) dans la séquence et dans un déclencheur, vidéo masquée pendant la
non-lecture (`showWhenStopped="0"`) ; même découpage en paragraphes à l'affichage et à l'export ; volet Animation
(« ¶1 … », « Effets du texte : tout à la fois / par paragraphe », déclencheur), ruban (Options d'effet > Séquence,
Déclencheur, commandes Média), Ctrl+Z ; .magpres rouvert à l'identique ; .pptx exporté (cibles, textes des paragraphes visés,
liste de construction, séquences interactives, commandes, `showWhenStopped`), lu par LibreOffice (paragraphes visés,
séquences interactives, commandes) et réimporté à l'identique ; en 1366×768 et 412×915 au doigt. Essai local sur un
gros diaporama réel (hors dépôt, rien de son contenu ici) : clics par diapositive d'après le XML,
visibilité de chaque paragraphe à chaque étape, vidéos lues au clic, pause / reprise au clic sur la vidéo, import sans
tâche de plus de 200 ms, barre de progression, aller-retour .magpres et .pptx.
Texte : document de 9 à 10 pages (page de titre, table des matières, titres, tableau de 35 lignes à en-tête répété et
cellules fusionnées, image habillée, 12 notes, en-tête de première page différent, section paysage), PDF (pages, signets,
texte extractible), .docx validé par python-docx et LibreOffice (même nombre de pages) puis réimporté, .odt converti
par LibreOffice et réimporté, .magdoc à l'identique ; suivi des modifications et commentaire saisis au clavier, exportés
en `w:ins`/`w:del`/`w:comment` et relus ; publipostage (aperçu, un PDF de 3 pages, un document, un .docx par
destinataire) ; import d'un .docx fait avec python-docx (styles, listes, fusions, image, en-tête, note) ; téléphone
412 px, aucune requête extérieure ; pont `MAGOffice` simulé (Ouvrir avec, enregistrer sur place, imprimer, tuile Socle).
Majordome : 265 phrases françaises pour l'analyseur (intention et paramètres, nombres en lettres, fautes de reconnaissance), page PC en
1366×768 et 412×915 avec reconnaissance simulée (texte injecté), voix simulée, horloge simulée (minuteur, rappel), Open-Meteo et
franceinfo simulés, confirmation obligatoire (« non » puis « oui »), solde jamais lu, ouverture des applis, nom « Jarvis », Ctrl+Espace,
historique effacé ; ouvrir une appli : 150 phrases avec une liste simulée de 123 applis (fautes de Vosk, alias, ambiguïtés, raccourcis du système, Suite prioritaire, domotique non avalée), banc Android simulé (lancement, notification hors premier plan, montre, alias, appli absente) et PC (site de l'appli proposé ; pas de `ms-settings:` : non vérifiable ici, et le navigateur exige un geste de l'utilisateur pour un protocole externe, impossible à la voix) ; installabilité, hors ligne, et chargement réel du moteur Vosk WebAssembly dans Chromium (faux modèle refusé
proprement : le vrai modèle n'était pas téléchargeable depuis l'environnement d'essai) ; banc Android (ponts simulés : appel, SMS,
Budget, applis, Mélodie, lampe, volume, modes, Wi-Fi, alarmes, agenda, titres) et tuile Socle.
Tableur : saisie au clavier (formules françaises, dates, %, €, Tab/Entrée, F2, F4, Ctrl+D, Alt+=, annuler) ; classeur de
3 feuilles et 126 formules (130 fonctions distinctes) exporté en .xlsx, recalculé par LibreOffice 24.2 sans valeurs en
cache : 125 résultats identiques (le dernier, TEXTE(x;"0.0"), dépend de la langue, comme dans les tableurs courants),
tableaux dynamiques (TRIER, UNIQUE, FILTRE, SEQUENCE, RECHERCHEX, A4#) vérifiés à part (absents de LibreOffice 24.2) ;
import d'un .xlsx fait avec openpyxl (styles, bordures, alignements, format €, fusion, volets, largeurs, MFC de 5 types,
validations, note, lien, tableau, filtre, couleur d'onglet, nom, mise en page, _xlfn.XLOOKUP) ; les 11 modèles en
.xlsx, .ods, .magcalc et .csv, rouverts à l'identique, ouverts par openpyxl et LibreOffice, puis les fichiers réécrits par
LibreOffice (.ods et .xlsx) réimportés (valeurs, formules, formats, styles, fusions, validations, MFC) ; 17 types de
graphiques en .xlsx relus et affichés par LibreOffice ; CSV français en UTF-8 et Windows-1252, .xls écrit par
LibreOffice ; boîtes de dialogue (32) ; parcours filtre / tri / MFC / tableau croisé / remplacer / commentaire / volets /
lignes / feuilles / copier-coller (interne, texte tabulé, HTML) / poignée de recopie / graphique / PDF ;
100 000 lignes × 200 colonnes + 100 004 formules (recalcul complet 0,3 s, saisie et recalcul de SOMME(A:A) 25 ms,
dessin médian 4 ms, tri de 100 000 lignes 0,6 s) ; téléphone 412 px au doigt (dossier web de l'APK) ; PC : manifeste,
service worker, « Ouvrir avec » .xlsx, Ctrl+S dans le fichier d'origine, récupération après fermeture, hors ligne.
Écran : vidéos de test faites avec ffmpeg en VP9/Opus (le Chromium de Playwright n'a ni H.264 ni AAC : un .mp4 H.264 y sert
à vérifier « Codec non pris en charge »), `.srt` en Windows-1252, faux lecteurs intégrés (page qui répond au `postMessage`
de YouTube), serveur à requêtes partielles (Range) pour le lien direct, flux HLS fMP4, second serveur sans CORS.

Audit « fichiers réels » de Texte et Tableur (30/10/2026, hors dépôt : corpus et bancs dans le dossier d'essais) :
- **Corpus synthétique** fabriqué exprès (`mk_texte.py`, `mk_tableur.py`) : .docx écrit « comme Word » en XML (styles
  personnalisés, numérotation multiniveau liée aux titres, tableau fusionné et imbriqué à largeurs fixes, PNG / JPEG flottant /
  TIFF / EMF / WMF ancré / SVG, zone de texte, forme, groupe, SmartArt, graphique avec classeur incorporé, en-têtes et pieds
  par section, paysage, deux colonnes, notes, champs TOC / PAGE / DATE / REF / HYPERLINK, signets, liens, révisions,
  commentaires et réponse, contrôles de contenu, formulaires hérités, altChunk, équation, polices absentes, accents et
  emoji) et ses dérivés LibreOffice (.odt, .docx, .doc, .rtf), document de 150 pages, document à 58 Mo de photos, textes
  UTF-8 / UTF-16 / Windows-1252, Markdown ; classeur « comme Excel » (formules de 24 sortes dont fonction inconnue, lien
  externe et WEBSERVICE avec valeurs en cache, noms, tableau structuré, 8 mises en forme conditionnelles, 4 validations,
  notes, lien, fusion, volets, plan, feuilles masquée et très masquée, protection, image, 3 graphiques, mise en page),
  .xlsm (vrai `vbaProject.bin`), dates 1904, formats personnalisés, 200 000 lignes, 5 CSV (; , tabulation, UTF-8 avec BOM,
  UTF-16, Windows-1252, champ sur deux lignes), dérivés LibreOffice (.ods, .xlsx, .xls) ; 13 fichiers abîmés (vide,
  aléatoire, tronqué, XML invalide, partie absente, relations ou styles illisibles, image manquante, graphique invalide).
- **Fichiers publics de test** (gardés hors dépôt) : Apache POI `test-data` (Apache-2.0 : 130 .docx, 368 .xlsx/.xlsm/.ods,
  dont fichiers de fuzzing et chiffrés), LibreOffice `sw/qa/extras/ooxmlexport/data` et `sc/qa/unit/data/xlsx` (MPL-2.0,
  SmartArt, graphiques, contrôles de contenu, tableaux croisés, mises en forme conditionnelles), python-docx (MIT).
- **Banc** (`tx-run.js`, `tb-run.js`) : pour chaque fichier, dans `/pc/texte/` ou `/pc/tableur/` (1366×768) : ouverture
  (durée, tâches longues `PerformanceObserver('longtask')`, barre de progression), contenu comparé au XML source (mots du
  corps, des en-têtes, notes et commentaires ; cellules : valeurs littérales et valeurs en cache, présence des formules),
  .magdoc / .magcalc rouvert à l'identique, export au même format relu par python-docx / openpyxl, LibreOffice (PDF : nombre
  de pages ; classeur recalculé par LibreOffice comparé aux valeurs de Tableur), export rouvert, .odt / .ods, PDF,
  impression, console.
- **Essais de non-régression** : Texte `t9.js` (fichiers réalistes, abîmés, protégés, gros document), Tableur `t15.js`
  (classeur réaliste, macros, 1904, CSV, abîmés, protégés, 60 000 lignes lues et écrites sans tâche de plus de 0,25 s / 0,4 s),
  PC `t-maj.js` (mises à jour des 29 applis : v1 → v2 → v3 servies à la même adresse, bandeau, « Rechercher une mise à jour »,
  caches, données IndexedDB / localStorage / fichiers mémorisés intactes, hors ligne après la mise à jour, lanceur).

Voix Piper (banc hors dépôt, Playwright + Chromium) : HuggingFace simulé par `route` (vrais modèles des releases de sherpa-onnx,
métadonnées retirées ; API `tree` avec oid LFS ; CORS) — téléchargement, somme vérifiée, fichier abîmé refusé, somme figée exigée
sans API ; moteur WASM, synthèse, durée / RMS / crête / écrêtage de chaque préréglage et de réglages extrêmes ; découpage ; niveau
envoyé à la sphère ; réglages persistants ; repli (voix absente, `.wasm` bloqué) ; console sans erreur ; page de l'APK avec pont
Android simulé (téléchargement par le pont, `piperPlay` / `pchunk`) ; Majordome PC ; paquet Lively décompressé servi sur
`http://fj.localhost` (même règle d'hôte `*.localhost` que Lively). Essai complémentaire sur un runner GitHub avec les vrais
fichiers de HuggingFace. Java : `MajordomeBridge`, `MajordomeWallpaper` compilés contre android.jar. Phonétiseur comparé à
espeak-ng (piper-phonemize WASM, référence de développement) ; intelligibilité par Whisper small (sherpa-onnx natif).

## Licences des bibliothèques (shared/vendor/LICENSES)

Voix Piper (APK, PC, Fond Jarvis) : sherpa-onnx 2.0.1 (Apache-2.0) avec onnxruntime (MIT), dans `applis/www-majordome/piper/`
(licences et provenance dans ce dossier) ; voix téléchargées par l'utilisateur, non publiées (CC BY-SA 4.0, CC0, CC BY 4.0).

pdf.js 3.11.174 (Apache-2.0) · pdf-lib 1.17.1 (MIT) · JSZip 3.10.1 (MIT ou GPL-3.0) ·
tesseract.js-core 7.0.0 (Apache-2.0) · données françaises tessdata_fast 4.1.0 (Apache-2.0) ·
Leaflet 1.9.4 (BSD-2-Clause) · jsPDF 2.5.1 (MIT) · SheetJS xlsx 0.18.5 (Apache-2.0) — mêmes versions que dans les APK.
ExcelJS 4.4.0 (MIT) : `dist/exceljs.min.js` du paquet npm, recopié par le workflow « Mettre à jour les bibliothèques » ·
PptxGenJS 4.0.1 (MIT) : `dist/pptxgen.min.js` du tag v4.0.1 de github.com/gitbrent/PptxGenJS (identique au paquet npm,
ligne `sourceMappingURL` retirée) · KaTeX 0.16.47 (MIT) : `dist/` du paquet (polices woff2 seulement) · Lucide 1.64.0
(ISC) : `vendor/lucide-icons.js` généré par `shared/office/tools/lucide-build.py` depuis le dossier `icons/` du tag 1.64.0
de github.com/lucide-icons/lucide (1999 icônes) — dans les APK Présentation et Texte aussi, mêmes fichiers.
ProseMirror (MIT) : model 1.25.4, state 1.4.4, transform 1.12.0, view 1.41.7, commands 1.7.1, keymap 1.2.3, history 1.5.0,
inputrules 1.5.1, schema-list 1.5.1, tables 1.8.5, dropcursor 1.8.2, gapcursor 1.4.1 (+ orderedmap 2.1.1, rope-sequence
1.3.4, w3c-keyname 2.2.8, MIT) : tags des dépôts github.com/ProseMirror (registre npm injoignable), réunis par
`shared/office/tools/prosemirror-build.mjs`. Polices (OFL-1.1) : Liberation 2.1.5, Carlito 1.103, Caladea 1.002 (paquets
Debian), sous-ensembles latins renommés Mag Sans / Mag Serif / Mag Mono / Mag Sans Douce (noms réservés de l'OFL).
vosk-browser 0.0.8 (Apache-2.0, PC seulement ; Vosk, Kaldi, OpenFST Apache-2.0, CLAPACK et libarchive BSD, zlib, emscripten MIT) :
`vendor/vosk/vosk-worker.js`, worker décodé tel quel de la démo officielle (branche gh-pages de github.com/ccoreilly/vosk-browser,
commit a4b0d0f), registre npm injoignable ; seule modification : clé de cache « key » (voir l'en-tête du fichier).
hls.js 1.6.19 (Apache-2.0, PC seulement, avec eventemitter3 MIT, url-toolkit et common-media-library Apache-2.0) : construit
depuis le tag v1.6.19 par `pc/hls-build.mjs` (registre npm injoignable) ; `--vendor` le remplace par le `dist/hls.min.js` npm.
