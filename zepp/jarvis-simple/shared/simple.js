/*
 * Cadran « Jarvis Simple » (Amazfit T-Rex 3, 480 × 480 rond) : textes français et disposition, en JavaScript pur.
 * Utilisé par la montre (watchface/index.js), le générateur d'images (outils/generer.py) et les essais (test/).
 */
export const W = 480
export const R = 240

/** Couleurs en 0xRRGGBB (TEXT et FILL_RECT de Zepp OS) */
export const COUL = {
  fond: 0x06282a,     // fond de couleur visible : preuve que le cadran tourne, même sans image
  titre: 0x46d9c2,
  heure: 0xeafffb,
  date: 0xa9cfc8,
  batterie: 0x7fe6d2,
  aod: 0x6f9e97,
  noir: 0x000000,
}

/** Boîtes { x, y, w, h } en pixels écran (designWidth 480 = écran) */
export const DISPOSITION = {
  titre: { x: 170, y: 32, w: 140, h: 28, taille: 20 },
  heure: { x: 90, y: 64, w: 300, h: 108, taille: 92 },
  date: { x: 70, y: 176, w: 340, h: 38, taille: 28 },
  sphere: { x: 165, y: 226, w: 150, h: 150 },          // dessinée dans le fond
  batterie: { x: 130, y: 392, w: 220, h: 36, taille: 26 },
  // AOD : heure en images (IMG_TIME), sinon en TEXT dans la même boîte
  heureAod: { x: 120, y: 190, w: 240, h: 80, taille: 72, chiffre: 54, deuxPoints: 24 },
}

export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function deux(n) { return (n < 10 ? '0' : '') + n }

/** Instantané de l'heure : capteur Time de Zepp OS (mois 1-12, jour de semaine 1 = lundi), sinon Date de JavaScript */
export function lireHeure(capteur) {
  if (capteur) {
    try {
      const h = capteur.getHours(), m = capteur.getMinutes(), j = capteur.getDate(), mo = capteur.getMonth(), s = capteur.getDay()
      if ([h, m, j, mo, s].every((v) => typeof v === 'number' && !isNaN(v))) return { h, m, jour: j, mois: mo, semaine: s }
    } catch (e) {}
  }
  const d = new Date()
  return { h: d.getHours(), m: d.getMinutes(), jour: d.getDate(), mois: d.getMonth() + 1, semaine: ((d.getDay() + 6) % 7) + 1 }
}

/** « 09:05 » (24 h) */
export function texteHeure(t) { return deux(t.h) + ':' + deux(t.m) }

/** « Jeudi 30 octobre », « Vendredi 1er mai » */
export function texteDate(t) {
  const j = JOURS[(t.semaine - 1 + 7) % 7] || ''
  const jour = t.jour === 1 ? '1er' : String(t.jour)
  const mois = MOIS[(t.mois - 1 + 12) % 12] || ''
  return (j.charAt(0).toUpperCase() + j.slice(1) + ' ' + jour + ' ' + mois).trim()
}

/** « Batterie 82 % » ; « Batterie -- » si la valeur est illisible */
export function texteBatterie(v) {
  return typeof v === 'number' && v >= 0 && v <= 100 ? 'Batterie ' + Math.round(v) + ' %' : 'Batterie --'
}
