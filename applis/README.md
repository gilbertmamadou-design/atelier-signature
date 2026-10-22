# Applis Android personnelles

Petites applications Android faites sur mesure pour un téléphone Oukitel WP60 (Android 15), fabriquées automatiquement en APK par GitHub Actions avec Capacitor.

| Appli | Rôle |
|---|---|
| Socle | Écran d'accueil en tableau de bord (tuiles, tiroir d'applis, gestes) |
| Toile | Fonds d'écran automatiques, recadrés (bordures, bandeaux de texte, format de l'écran) |
| Galerie | Photos et vidéos (remplace Google Photos) |
| Agenda | Agenda (remplace Google Agenda) |
| Contacts | Contacts (remplace Google Contacts) |
| Carnet | Notes et listes (remplace Keep) |
| Calcul | Calculatrice avec mode chantier |
| Ondes | Podcasts, musique libre (Creative Commons), fichiers par lien direct |
| Écran | Vidéos : celles du téléphone, PeerTube, domaine public, chaînes YouTube par le lecteur officiel |
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
| Mélodie, Rangement, Aube, Ciel, Sentiers, Petits Pas, Carnet de chasse, Atelier PDF | Musique, fichiers, réveil, ciel, randonnée, enfants, chasse, PDF |

## Récupérer un APK

Onglet **Releases**, puis télécharger le fichier `.apk` voulu et l'ouvrir sur le téléphone.

## Fabrication

- `apps.json` : la liste des applis (dossier web, identifiant, nom, icônes).
- `.github/workflows/apk.yml` : seules les applis modifiées sont refabriquées ; lancement manuel possible (« Run workflow », liste d'applis ou « toutes »).
- `scripts/` : code natif Android commun (ponts JavaScript, services, écran d'accueil…).
- La clé de signature n'est **pas** dans le dépôt : elle vient du secret `KEYSTORE_B64` (Settings › Secrets and variables › Actions).

Les applis professionnelles restent dans un dépôt privé séparé.
