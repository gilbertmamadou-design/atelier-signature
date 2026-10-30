# Applis Android personnelles

Petites applications Android faites sur mesure pour un téléphone Oukitel WP60 (Android 15), fabriquées automatiquement en APK par GitHub Actions avec Capacitor.

| Appli | Rôle |
|---|---|
| Socle | Écran d'accueil en tableau de bord (tuiles, tiroir d'applis, gestes) ; page Jarvis plein écran (panneau Majordome en taille « Plein écran » ou Ajouter › page plein écran : grande sphère, heure, météo et seuil de vent, rendez-vous, réveil, minuteurs, lumières Hue et 3 pièces, titres, batterie, dernier échange ; peut devenir la page principale ; la sphère réagit au niveau sonore de Majordome quand il écoute ou parle, et en option, désactivée par défaut, aux sons de la pièce : micro de Socle ouvert seulement page Jarvis visible et écran allumé, niveau seulement, rien d'enregistré) et mode Station Jarvis en charge (écran allumé, nuit atténuée, coupé au débranchement) |
| Toile | Fonds d'écran automatiques, recadrés (bordures, bandeaux de texte, format de l'écran) ; « Images en ligne » par thèmes, sources libres seulement (Wikimedia Commons, Openverse, NASA, Pixabay avec clé), crédits, tâche de fond Wi-Fi |
| Galerie | Photos et vidéos (remplace Google Photos) |
| Agenda | Agenda (remplace Google Agenda) |
| Contacts | Contacts (remplace Google Contacts) |
| Carnet | Notes et listes (remplace Keep) |
| Calcul | Calculatrice avec mode chantier |
| Ondes | Podcasts, musique libre (Creative Commons), fichiers par lien direct |
| Écran | Vidéos : celles du téléphone, PeerTube, domaine public, chaînes YouTube par le lecteur officiel ; rubrique Animés 100 % légale (chaînes officielles, plateformes ayant les droits, premiers animés japonais du domaine public) |
| Photo | Appareil photo et mode chantier (bandeau date/adresse, annotations, rapport PDF) |
| Scan | Numérisation de documents en PDF |
| Mesure | Règle, niveau, pentes, sonomètre, luxmètre, boussole |
| Sauvegarde | Copie automatique vers carte SD, clé USB ou dossier |
| Urgence | SOS avec position, numéros d'urgence, fiche médicale, lampe et sirène |
| Coffre | Mots de passe et codes chiffrés, empreinte, codes 2FA |
| QR | Lire et créer des QR codes et codes-barres |
| Liseuse | Livres EPUB et PDF, livres libres de droits |
| Budget | Dépenses et revenus perso, budgets, relevés bancaires |
| Dictaphone | Enregistrements vocaux, marqueurs, dictée |
| Météo | Prévisions, radar de pluie, qualité de l'air, alertes |
| Réseau | Wifi et 4G/5G : état, test de débit, wifi autour, appareils, connexion aux wifi protégés |
| Lecteur PDF | Lire les PDF (recherche, sommaire, signets, mode nuit), remplir les formulaires, annoter et signer, lecture à voix haute |
| Solaire | Combien de panneaux solaires poser (toiture, sol, ombrière) : adresse → cadastre et règles d'urbanisme (Géoportail de l'urbanisme, secteur protégé), mesure sur photo, plan ou vue aérienne IGN, calepinage, démarches (DP, PC, ABF, Consuel…), production PVGIS, fiche client PDF |
| Actualités | L'essentiel de l'actu en France et dans le monde (flux RSS officiels de franceinfo, Le Monde, Le Figaro, RFI, France 24, BBC…) : sujets regroupés « couvert par N médias », photos, vidéos des médias, vigilance météo du département, alertes infos (heures calmes, plafond, sans doublon), favoris hors ligne, lecture à voix haute |
| Présentation | Diaporamas façon logiciel de présentation : thèmes, masque, formes, images, tableaux, graphiques, SmartArt, vidéos, équations, animations et transitions, mode présentateur, import et export .pptx, PDF ; hors ligne (pièces communes : `pc/shared/office/`, pont `scripts/OfficeBridge.java`) |
| Texte | Traitement de texte paginé : mise en page et sections (portrait/paysage, colonnes), en-têtes et pieds, styles et jeux de styles, listes, tableaux, images, formes, équations, notes, table des matières, renvois, suivi des modifications, commentaires, publipostage CSV, modèles MAG ; .magdoc, .docx, .odt, .rtf, .txt, .md, .html, PDF ; hors ligne (pièces communes : `pc/shared/office/`, ProseMirror et polices libres de `pc/shared/vendor/`, pont `scripts/OfficeBridge.java`) |
| Majordome | Assistant vocal à commandes (sans IA de conversation), nom et mot de réveil réglables ; écran centré pour le téléphone (grande sphère, nom, salutation et état, heure, météo et vent, prochain rendez-vous, lumières, dernier échange) ; sphère qui réagit au son (micro pendant l'écoute, mots et syllabes de la voix pendant la parole ; même niveau pour le fond d'écran animé et Socle) : reconnaissance hors ligne Vosk (modèle français téléchargé une fois), écoute continue facultative (service avec notification, option « seulement en charge »), heure, calculs, conversions, minuteurs, réveils et rappels (AlarmManager), météo et vent pour l'échafaudage, titres franceinfo, agenda, notes et listes, dépense envoyée à Budget, ouverture de n'importe quelle appli du téléphone (« Ouvre WhatsApp », « Lance Waze », « ouvre jimail » : liste MAIN/LAUNCHER en cache, correspondance tolérante aux fautes de Vosk, alias des grandes applis, « Lequel : Google Maps ou Waze ? » en cas de doute, Suite MAG prioritaire, raccourcis « Quand je dis… ouvre… » dans Réglages › Ouvrir une appli, raccourcis du système : paramètres et sous-pages Wi-Fi / Bluetooth / batterie / affichage / son, téléphone, messages, horloge, Play Store, navigateur, appareil photo ; sans confirmation, notification à toucher quand Majordome n'est pas au premier plan et que « Affichage par-dessus » est refusé ; `www-majordome/mj-applis.js`), musique, appel et SMS après confirmation, lampe, volume, modes ; lumières Philips Hue par le pont Hue du réseau local (découverte mDNS, jumelage par le bouton du pont, API CLIP v2 en https avec certificat épinglé, repli API v1 ; pièces, zones, ampoules, scènes, couleurs, minuterie ; écran « Maison » ; `www-majordome/mj-maison.js`) ; climatisation : « ouvre la clim » lance l'appli Panasonic Comfort Cloud (Play Store proposé si elle manque), les réglages de clim restent à Alexa ou à Comfort Cloud (pas d'API officielle Panasonic, pas d'infrarouge sur le téléphone) ; tuile, micro, ligne « Lumières » et page Jarvis plein écran dans Socle ; pour tous les lanceurs : widget Android « Jarvis (Majordome) » redimensionnable jusqu'au plein écran (Parler, Éteindre les lumières, Bonjour) et fond d'écran animé « sphère » (Réglages › Écran d'accueil ; `scripts/MajordomeWidget.java`, `scripts/MajordomeWallpaper.java`) ; montre connectée (Amazfit T-Rex 3 par l'appli Zepp, Réglages › Montre connectée) : rappels, minuteurs et réveils en notifications courtes recopiées par Zepp, alertes facultatives (vent fort, vigilance orange / rouge, résumé du matin, réponses), et liaison locale à jeton (127.0.0.1) pour la mini-appli Zepp OS « Jarvis » de [`zepp/jarvis/`](../zepp/jarvis/README.md) (`www-majordome/mj-montre.js`) (`scripts/MajordomeBridge.java`, Vosk et JNA ajoutés à cette appli seule) |
| Tableur | Tableur : formules en français (plus de 330 fonctions, tableaux dynamiques, noms, références structurées), mises en forme et formats de nombre, mises en forme conditionnelles, tableaux, tris et filtres, sous-totaux et plan, tableaux croisés dynamiques, graphiques et sparklines, validation, commentaires, protection, mise en page et PDF ; .magcalc, .xlsx et .ods (ouvrir et enregistrer), .xls (lecture), .csv ; modèles (budget, dépenses, facture, planning, émargement, stagiaires, inventaire, métré de calorifuge, nomenclature d'échafaudage, vérifications d'équipements) ; hors ligne (pièces communes : `pc/shared/office/`, ExcelJS, pont `scripts/OfficeBridge.java`), tuile Socle « dernier classeur » |
| Mélodie, Rangement, Aube, Ciel, Sentiers, Petits Pas, Carnet de chasse, Atelier PDF | Musique, fichiers, réveil, ciel, randonnée, enfants, chasse, PDF |

## Récupérer un APK

Onglet **Releases**, puis télécharger le fichier `.apk` voulu et l'ouvrir sur le téléphone.

## Fabrication

- `apps.json` : la liste des applis (dossier web, identifiant, nom, icônes).
- `.github/workflows/apk.yml` : seules les applis modifiées sont refabriquées ; lancement manuel possible (« Run workflow », liste d'applis ou « toutes »).
- `scripts/` : code natif Android commun (ponts JavaScript, services, écran d'accueil…).
- La clé de signature n'est **pas** dans le dépôt : elle vient du secret `KEYSTORE_B64` (Settings › Secrets and variables › Actions).

Les applis professionnelles restent dans un dépôt privé séparé.
