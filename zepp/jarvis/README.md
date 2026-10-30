# Jarvis sur la montre (Amazfit T-Rex 3)

Jarvis, c'est Majordome au poignet. Il y a deux niveaux, et le premier marche sans rien installer sur la montre.

## 1. Les notifications sur la montre (rien à installer)

L'appli **Zepp** du téléphone recopie sur la montre les notifications des applis que vous cochez.

1. Sur le téléphone, ouvrez **Majordome › Réglages › Montre connectée** et activez l'option.
   Choisissez les alertes que vous voulez recevoir :
   - **Vent fort (chantier)** : rafales prévues au-dessus de votre seuil. Une alerte par jour au plus.
   - **Vigilance orange ou rouge.**
   - **Résumé du matin** : envoyé après la routine « Bonjour », avec l'heure, la météo, le vent et le premier rendez-vous.
   - **Mes réponses** : quand vous parlez à Jarvis, sa réponse s'affiche aussi sur la montre. Cette alerte est coupée au départ.
2. Ouvrez **Zepp › Profil › T-Rex 3 › Notifications des applis**. Activez les notifications des applis.
   Si Android le demande, autorisez Zepp à lire les notifications.
3. Dans la liste des applis, cochez **Majordome**.
4. Revenez dans Majordome et touchez **Envoyer un essai**. Le message doit arriver sur la montre.

Les rappels, les minuteurs et les réveils de Majordome arrivent aussi sur la montre. Les textes sont courts : 30 caractères au plus pour le titre, 120 pour le texte.

Majordome ne fait aucune requête internet en plus pour la montre. Il vérifie le vent et la vigilance quand il les lit déjà : quand vous les demandez, et pendant la routine « Bonjour ».

## 2. La mini-appli « Jarvis » sur la montre

### Ce qu'elle fait

- **Écran principal** :
  - une petite sphère et l'heure ;
  - la météo et le vent, avec la couleur du seuil chantier : vert si c'est bon, orange pour prudence, rouge au-delà du seuil ;
  - le prochain rendez-vous et les lumières allumées.
- **Boutons en un toucher**, accessibles en faisant défiler l'écran : Éteindre les lumières, vos 3 pièces favorites, Bonjour, Bonne nuit et Ouvrir la clim. Le bouton clim ouvre Comfort Cloud sur le téléphone.
- **Parler** : maintenez le bouton « Parler » pendant que vous parlez, puis relâchez. Le bouton du haut à droite de la montre fait la même chose : un appui pour commencer, un appui pour envoyer. Majordome reconnaît la phrase sur le téléphone, avec Vosk et sans internet.
- **Les réponses** s'affichent en texte avec une vibration, puisque la montre n'a pas de haut-parleur. Quand Jarvis pose une question, par exemple « Appeler Paul ? », la montre affiche les boutons **Oui** et **Non**.

### Avant de commencer

- La T-Rex 3 est appairée au téléphone dans l'appli Zepp.
- Majordome est à jour, et l'option **Montre connectée** est activée dans ses réglages.
- Pour la voix, le modèle vocal de Majordome est installé : Réglages › Reconnaissance vocale.

### Installer la mini-appli

Zepp n'a pas de boutique ouverte aux applis personnelles. Il y a deux façons de faire.

#### Voie A, officielle et documentée par Zepp (un ordinateur est nécessaire)

1. Activez le mode développeur dans l'appli Zepp : **Profil › Paramètres › À propos**, puis touchez **7 fois** le logo Zepp.
2. Créez un compte développeur gratuit sur **console.zepp.com**, avec le même compte que l'appli Zepp.
3. Sur l'ordinateur, installez Node.js, puis tapez dans un terminal :
   ```
   npm install -g @zeppos/zeus-cli
   git clone https://github.com/gilbertmamadou-design/atelier-signature
   cd atelier-signature/zepp/jarvis
   npm install
   zeus login
   zeus preview
   ```
   `zeus login` ouvre la page de connexion Zepp. `zeus preview` envoie le paquet aux serveurs de Zepp et affiche un QR code.
4. Sur le téléphone, ouvrez **Zepp › Profil › T-Rex 3 › Mode développeur**, touchez l'icône de scan en haut à droite, puis scannez ce QR code.
5. Si `zeus preview` refuse l'identifiant de l'appli, créez une appli dans console.zepp.com. Recopiez ensuite son numéro dans `app.json`, à la ligne `"appId"`.

#### Voie B, plus simple mais non documentée par Zepp

Chaque version publiée dans « Releases » contient :
- `jarvis-trex3-apercu.zab` ;
- `jarvis-qr.png`, un QR code au format `zpkd1://` qui pointe vers ce fichier.

D'autres développeurs installent ainsi leurs mini-applis par le scanner du mode développeur, mais **Zepp ne le documente pas**. Cela peut ne pas marcher, ou ne plus marcher après une mise à jour de l'appli Zepp. Si l'installation échoue, prenez la voie A.

1. Activez le mode développeur (voie A, étape 1).
2. Affichez `jarvis-qr.png` sur un autre écran, par exemple l'ordinateur. Scannez-le avec **Zepp › Profil › T-Rex 3 › Mode développeur › scan**.

Avec les deux voies, une appli installée en mode développeur reste une appli « d'essai » pour Zepp.
Les paquets portent aussi une durée de validité. Le champ `expiredTime` de `zeus build` vaut 48 heures. Zepp ne documente pas ce qu'il limite : le téléchargement ou l'appli installée.
Si le scan refuse un paquet ancien, relancez la construction : Actions › « Fabriquer la mini-appli Zepp OS » › Run workflow.

### Relier Jarvis à Majordome (une seule fois)

1. Dans **Majordome › Réglages › Montre connectée**, touchez **Copier** à côté du jeton.
2. Dans **Zepp › Profil › T-Rex 3 › Jarvis › Réglages**, collez le jeton. Laissez le port à **47615**, sauf si vous l'avez changé dans Majordome.
3. Ouvrez Jarvis sur la montre : la météo et les lumières s'affichent.

### En cas de problème

| Message sur la montre | Que faire |
|---|---|
| « Jeton refusé » ou « Jeton absent » | Recopiez le jeton de Majordome dans les réglages de Jarvis. Si vous avez créé un nouveau jeton, l'ancien ne marche plus. |
| « Majordome ne répond pas » | Activez « Montre connectée » dans Majordome. Si besoin, retirez Majordome de l'optimisation de batterie. |
| « Téléphone injoignable » | Gardez le Bluetooth actif et l'appli Zepp ouverte en arrière-plan. |
| « Autorisez le micro… » | Acceptez la demande sur la montre, puis maintenez de nouveau « Parler ». |
| « Majordome n'a pas répondu à temps » | Ouvrez Majordome une fois sur le téléphone. Autorisez aussi « Affichage par-dessus » dans Majordome › Autorisations. |

### Secours pour les lumières (facultatif)

Quand Majordome ne répond pas, Jarvis peut commander le pont Hue directement. Ce secours passe par l'API v1, en http, sur le Wi-Fi de la maison seulement.

1. Dans les réglages de Jarvis, activez **Secours lumières** et saisissez l'adresse IP du pont.
2. Appuyez sur le bouton rond du pont, puis touchez **Jumeler le pont Hue** dans les 30 secondes.

Ce secours est coupé au départ.

## Sécurité

- **Adresse 127.0.0.1 seulement** : Majordome écoute uniquement sur le téléphone. On ne peut pas le joindre depuis le Wi-Fi ni depuis internet.
- **Jeton obligatoire** à chaque demande :
  - le jeton fait 20 caractères tirés au hasard, soit environ 99 bits ;
  - Majordome le compare sans laisser de prise au chronométrage ;
  - après 10 jetons faux en une minute, tout est bloqué pendant une minute ;
  - un nouveau jeton annule l'ancien.
- **Six actions seulement** : état, commande, audio, lumières, routine, clim. Tout le reste est refusé.
  - La commande passe par les mêmes règles que la voix : un appel ou un SMS demande toujours une confirmation (Oui / Non).
  - Majordome refuse aussi les demandes envoyées par une page web : il vérifie l'hôte et ne renvoie aucun en-tête CORS.
  - La taille des demandes est limitée.
- **Option coupée = liaison arrêtée** : le service s'arrête et le port se ferme.

## Ce qui est vérifié, et ce qui ne l'est pas

**Vérifié ici**, sans montre, par des essais automatiques en Java et en Node.js :
- le serveur de Majordome ;
- les textes et les limites de longueur ;
- la disposition de l'écran rond ;
- le dialogue montre → Side Service → Majordome, avec Zepp simulé ;
- le Side Service face au vrai serveur Java ;
- le décodage du format Opus de la montre.

**Pas vérifié sur la vraie montre ni sur le vrai téléphone** :
- l'affichage exact sur la T-Rex 3 ;
- l'enregistrement par le micro de la T-Rex 3 : le format est connu par un projet public sur la T-Rex 3 **Pro** ;
- le décodage Opus par Android ;
- le `fetch` en http vers 127.0.0.1 depuis l'appli Zepp : d'autres applis l'utilisent vers le réseau local, mais rien n'a été essayé vers 127.0.0.1 ;
- l'installation par la voie B ;
- la recopie des notifications par Zepp.

## Pour les développeurs

- **Pages** : `page/index.js` pour l'écran principal, `page/reponse.js` pour les réponses.
- **Side Service** : `app-side/index.js`.
- **Réglages dans l'appli Zepp** : `setting/index.js`.
- **Logique en JavaScript pur** : `shared/vue.js` pour la mise en forme et la disposition, `shared/proto.js` pour le dialogue avec Majordome et le secours Hue.
- **Construction** : `.github/workflows/zepp.yml` lance Zeus CLI (licence ISC) sur GitHub Actions. Bibliothèque : `@zeppos/zml` (Apache 2.0).
- **Côté Majordome** : `applis/scripts/MajordomeBridge.java`, sections « Montre connectée » (`Lien`, `Montre`). Côté page : `applis/www-majordome/mj-montre.js`.
