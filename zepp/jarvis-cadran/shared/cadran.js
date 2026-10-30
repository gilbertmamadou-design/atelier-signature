/*
 * Cadran « Jarvis » (Amazfit T-Rex 3, 480 × 480 rond, Zepp OS 4) : logique et disposition en JavaScript pur.
 * Source unique : la montre (watchface/index.js), le générateur d'images (outils/generer.py, qui lit DISPOSITION
 * par Node) et les essais (test/cadran.test.mjs) s'en servent tous. 1 px de conception = 1 px de l'écran (designWidth 480).
 */
export const W = 480
export const R = 240

/** Couleurs : celles de la page Jarvis de Socle (turquoise #46d9c2 / #7fe6d2, texte #eafffb), fond noir pour l'AMOLED */
export const COUL = {
  fond: '#000000', accent: '#46d9c2', clair: '#7fe6d2', texte: '#eafffb', doux: '#a9cfc8',
  ligne: '#1f5f57', aod: '#6f9e97', aodSphere: '#3f8f84',
}

/** Mini-appli Jarvis (zepp/jarvis/app.json) ouverte en touchant la sphère */
export const JARVIS = { appId: 1093117, url: 'page/index' }

// IMG_WEEK : 7 images, lundi d'abord (ordre vérifié sur l'exemple officiel zeppos-samples, week_en/1.png = MONDAY)
export const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE']
// IMG_DATE avec month_is_character : 12 images, janvier d'abord ; day_is_character : 31 images, le 1 d'abord
export const MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE']
export const SALUTS = ['Bonjour', 'Bonsoir']

export function jourTexte(n) { return n === 1 ? '1ER' : String(n) }
export function indexSemaine(d) { return (d.getDay() + 6) % 7 }
/** Date telle que l'affiche le cadran, par ex. « JEUDI 30 OCTOBRE », « VENDREDI 1ER MAI » */
export function dateFr(d) { return JOURS[indexSemaine(d)] + ' ' + jourTexte(d.getDate()) + ' ' + MOIS[d.getMonth()] }
export function deux(n) { return (n < 10 ? '0' : '') + n }
/** Heure du cadran : 24 h, deux chiffres (IMG_TIME hour_zero = 1) */
export function heureFr(d) { return deux(d.getHours()) + ':' + deux(d.getMinutes()) }
/** Même règle que le panneau Majordome de Socle (mjGreet) : Bonsoir de 18 h à 5 h, sinon Bonjour. Renvoie l'index de SALUTS */
export function salutation(h) { return h >= 18 || h < 5 ? 1 : 0 }

/** Sphère animée : séquence courte, jouée seulement écran allumé, puis arrêtée sur l'image 0 */
export const ANIM = { images: 24, fps: 10, tours: 3, prefixe: 's', dossier: 'images/anim' }
/** Durée d'animation après chaque réveil de l'écran, en secondes */
export function dureeAnimation() { return (ANIM.images / ANIM.fps) * ANIM.tours }

const CH = 52, DP = 20 // largeur d'un grand chiffre, des deux-points
const L_HEURE = 4 * CH + DP

/**
 * Disposition (coordonnées écran). Chaque bloc { x, y, w, h }.
 * - normal : tout ; AOD : heure, date, sphère fixe atténuée et quelques repères (show_level ONAL_AOD).
 */
export const DISPOSITION = {
  titre: { x: 180, y: 28, w: 120, h: 18 },              // « JARVIS » (dans le fond)
  salut: { x: 140, y: 48, w: 200, h: 28 },              // image changée selon l'heure
  heure: { x: Math.round((W - L_HEURE) / 2), y: 78, w: L_HEURE, h: 84, chiffre: CH, deuxPoints: DP },
  semaine: { x: 46, y: 168, w: 160, h: 28 },            // texte aligné à droite
  jour: { x: 212, y: 168, w: 56, h: 28 },               // centré
  mois: { x: 274, y: 168, w: 166, h: 28 },              // aligné à gauche
  sphere: { x: 165, y: 196, w: 150, h: 150 },
  meteoIcone: { x: 74, y: 214, w: 52, h: 52 },
  meteoTemp: { x: 40, y: 268, w: 120, h: 34 },
  vent: { x: 88, y: 306, w: 40, h: 22 },                // « VENT » dans le fond, valeur à gauche
  coeurIcone: { x: 358, y: 218, w: 44, h: 44 },
  coeur: { x: 320, y: 268, w: 120, h: 34 },
  bpm: { x: 356, y: 308, w: 48, h: 16 },
  pas: { x: 140, y: 350, w: 94, h: 24 },                // « PAS » dans le fond, valeur à droite
  batterie: { x: 282, y: 350, w: 72, h: 24 },           // « BAT » dans le fond, valeur + %
  barreBatterie: { x: 250, y: 378, w: 104, h: 4 },
  leve: { x: 140, y: 392, w: 70, h: 22 },               // lever du soleil
  couche: { x: 286, y: 392, w: 70, h: 22 },             // coucher du soleil
  altitude: { x: 144, y: 422, w: 82, h: 20 },           // « m » compris
  pression: { x: 252, y: 422, w: 96, h: 20 },           // « hPa » compris
  // zones tactiles
  zones: {
    sphere: { x: 165, y: 196, w: 150, h: 150, ouvre: 'jarvis' },
    meteo: { x: 36, y: 210, w: 126, h: 122, ouvre: 'WEATHER_CURRENT' },
    coeur: { x: 318, y: 210, w: 126, h: 122, ouvre: 'HEART' },
    pas: { x: 100, y: 348, w: 140, h: 37, ouvre: 'STEP' },
    soleil: { x: 110, y: 386, w: 260, h: 32, ouvre: 'SUN_RISE' },
    altitude: { x: 130, y: 418, w: 220, h: 30, ouvre: 'ALTIMETER' },
  },
}

/** Libellés fixes du fond (police monospace, majuscules espacées comme les .jl de Socle) */
export const LIBELLES = [
  { t: 'JARVIS', x: 240, y: 37, taille: 15, couleur: 'clair', centre: true, espace: 6 },
  { t: 'VENT', x: 50, y: 317, taille: 12, couleur: 'clair' },
  { t: 'BPM', x: 380, y: 316, taille: 12, couleur: 'clair', centre: true },
  { t: 'PAS', x: 104, y: 362, taille: 12, couleur: 'clair' },
  { t: 'BAT', x: 248, y: 362, taille: 12, couleur: 'clair' },
  { t: 'ALT', x: 112, y: 432, taille: 11, couleur: 'clair' },
]

/** Contrôles : tout bloc doit tenir dans le cercle, marge comprise */
export function dansCercle(b, marge) {
  const m = marge || 0
  const coins = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]
  return coins.every(([x, y]) => Math.hypot(x - R, y - R) <= R - m)
}
export function chevauche(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h }

/** Blocs affichés (hors zones tactiles), pour les essais */
export function blocs() {
  const d = DISPOSITION
  return Object.keys(d).filter((k) => k !== 'zones').map((k) => Object.assign({ id: k }, d[k]))
}

/** Icône météo : code Zepp OS (0 à 28, doc du capteur Weather) → dessin du générateur */
export const METEO = [
  'nuages', 'averses', 'averses_neige', 'soleil', 'couvert', 'pluie_faible', 'neige_faible', 'pluie', 'neige', 'neige_forte',
  'pluie_forte', 'sable', 'pluie_neige', 'brouillard', 'brume', 'orage', 'tempete_neige', 'poussiere', 'pluie_forte', 'grele',
  'orage', 'pluie_forte', 'poussiere', 'sable', 'pluie_forte', 'inconnu', 'nuages_nuit', 'averses_nuit', 'nuit',
]
