/*
 * Jarvis (montre) : mise en forme et disposition, en JavaScript pur (testé avec Node, sans montre).
 * Écran rond 480 × 480 de l'Amazfit T-Rex 3 (designWidth 480 : 1 px de conception = 1 px de l'écran).
 * La page (page/index.js) crée les widgets décrits ici ; les essais vérifient que tout tient dans le cercle
 * et que les boutons sont grands (au moins 80 px de haut, utilisables avec des gants ou en mouvement).
 */
export const W = 480
export const R = 240

export const C = {
  fond: 0x000000, texte: 0xffffff, doux: 0x9aa4b2, sphere: 0x3fe0c5, sphereFond: 0x0b2e2b,
  ok: 0x34d399, prudence: 0xf5a524, danger: 0xef4444, bouton: 0x1d2633, boutonAppui: 0x2b3a4d,
  allume: 0x7a5410, allumeAppui: 0x9a6a14, parler: 0x0f766e, parlerAppui: 0x14a394, ecoute: 0xb91c1c,
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function deux(n) { return (n < 10 ? '0' : '') + n }
export function heure(t) { const d = new Date(t); return d.getHours() + ':' + deux(d.getMinutes()) }
export function date(t) { const d = new Date(t); return JOURS[d.getDay()] + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] }

/** Texte coupé au dernier mot entier, avec « … » */
export function couper(s, max) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  let h = t.slice(0, max - 1)
  const sp = h.lastIndexOf(' ')
  if (sp >= max / 2) h = h.slice(0, sp)
  return h.replace(/[\s,;:.·«(-]+$/, '') + '…'
}

export function couleurVent(niveau) { return niveau === 2 ? C.danger : niveau === 1 ? C.prudence : niveau === 0 ? C.ok : C.doux }

/** Écran principal à partir de l'état renvoyé par Majordome (GET /etat), ou d'une erreur */
export function resume(e, now) {
  const t = now || Date.now()
  const v = { heure: heure(t), date: date(t), meteo: '', meteoSous: '', couleurMeteo: C.doux, rdv: '', lumieres: '', pieces: [], derniere: '', erreur: '' }
  if (!e || e.ok === false) {
    v.erreur = (e && e.texte) || 'Majordome ne répond pas.'
    return v
  }
  const m = e.meteo
  if (m && typeof m.t === 'number') {
    v.meteo = m.t + '° · vent ' + m.vent + ' · raf. ' + m.rafales
    v.meteoSous = m.niveau === 2 ? 'Chantier : au-delà du seuil (' + m.seuil + ')' : m.niveau === 1 ? 'Chantier : prudence (' + m.seuil + ')' : 'Chantier : vent OK (' + m.seuil + ')'
    v.couleurMeteo = couleurVent(m.niveau)
  } else { v.meteo = 'Météo : demandez-la à Jarvis'; v.meteoSous = '' }
  v.rdv = e.rdv ? couper(e.rdv.quand + ' · ' + e.rdv.titre, 64) : 'Aucun rendez-vous prévu'
  const l = e.lumieres || {}
  if (!l.jumele) v.lumieres = 'Lumières : pas de pont Hue'
  else if (l.erreur) v.lumieres = l.erreur === 'unauthorized' ? 'Lumières : pont à rejumeler' : 'Lumières : pont injoignable'
  else if (l.allumees < 0) v.lumieres = 'Lumières : …'
  else if (l.allumees === 0) v.lumieres = 'Toutes les lumières sont éteintes'
  else v.lumieres = l.allumees + ' lumière' + (l.allumees > 1 ? 's allumées' : ' allumée') + (l.total ? ' sur ' + l.total : '')
  v.pieces = (l.pieces || []).slice(0, 3).map((p) => ({ id: p.id, nom: couper(p.nom, 16), on: !!p.on, texte: couper(p.nom, 16) + (p.on ? ' · allumée' : ' · éteinte') }))
  if (e.derniere) v.derniere = couper(e.derniere, 120)
  return v
}

/** Largeur disponible à la hauteur y sur l'écran rond (corde du cercle, marge comprise) */
export function corde(y, marge) {
  const dy = Math.abs(y - R)
  if (dy >= R) return 0
  return 2 * Math.sqrt(R * R - dy * dy) - 2 * (marge || 0)
}

/**
 * Disposition : liste de widgets { id, type, x, y, w, h, … } en coordonnées de page (la page défile).
 * Premier écran (0 à 480) : sphère, heure, date, météo, rendez-vous, lumières, bouton « Parler ».
 * En faisant défiler : boutons en un toucher (lumières, 3 pièces, Bonjour, Bonne nuit, clim), 90 px de haut.
 */
export function disposition(v, opts) {
  const o = opts || {}
  const L = []
  // sphère : halo et points d'une sphère de Fibonacci (même idée que le fond animé du téléphone)
  const cx = 240, cy = 86, rs = 44
  L.push({ id: 'halo', type: 'CIRCLE', center_x: cx, center_y: cy, radius: rs + 16, color: C.sphereFond, alpha: 255 })
  const n = 34, ang = Math.PI * (3 - Math.sqrt(5)), rotY = 0.6, rotX = 0.35
  for (let i = 0; i < n; i++) {
    const y0 = 1 - (i / (n - 1)) * 2, r0 = Math.sqrt(1 - y0 * y0), th = ang * i
    let x = Math.cos(th) * r0, y = y0, z = Math.sin(th) * r0
    const x1 = x * Math.cos(rotY) + z * Math.sin(rotY), z1 = -x * Math.sin(rotY) + z * Math.cos(rotY)
    const y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX), z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX)
    const depth = (z2 + 1) / 2
    L.push({ id: 'p' + i, type: 'CIRCLE', center_x: Math.round(cx + x1 * rs), center_y: Math.round(cy + y2 * rs), radius: depth > 0.5 ? 4 : 3, color: C.sphere, alpha: Math.round(70 + 185 * depth) })
  }
  L.push({ id: 'coeur', type: 'CIRCLE', center_x: cx, center_y: cy, radius: 9, color: o.ecoute ? C.ecoute : C.sphere, alpha: 255 })
  L.push({ id: 'heure', type: 'TEXT', x: 90, y: 138, w: 300, h: 72, text: v.heure, text_size: 64, color: C.texte })
  L.push({ id: 'date', type: 'TEXT', x: 70, y: 208, w: 340, h: 32, text: v.date, text_size: 26, color: C.doux })
  if (v.erreur) {
    L.push({ id: 'erreur', type: 'TEXT', x: 50, y: 248, w: 380, h: 140, text: v.erreur, text_size: 26, color: C.prudence, wrap: true })
  } else {
    L.push({ id: 'meteo', type: 'TEXT', x: 40, y: 246, w: 400, h: 38, text: v.meteo, text_size: 30, color: v.couleurMeteo })
    L.push({ id: 'meteoSous', type: 'TEXT', x: 50, y: 282, w: 380, h: 30, text: v.meteoSous, text_size: 24, color: v.couleurMeteo })
    L.push({ id: 'rdv', type: 'TEXT', x: 50, y: 314, w: 380, h: 62, text: v.rdv, text_size: 25, color: C.texte, wrap: true })
    L.push({ id: 'lumieres', type: 'TEXT', x: 60, y: 376, w: 360, h: 32, text: v.lumieres, text_size: 25, color: C.doux })
  }
  // « Parler » : maintenir appuyé (le micro enregistre tant que le doigt reste), ou bouton du haut à droite
  L.push({ id: 'parler', type: 'HOLD', x: 140, y: 405, w: 200, h: 56, radius: 28, text: o.ecoute ? 'J\'écoute…' : (o.voix === false ? 'Voix indisponible' : 'Maintenir · Parler'), text_size: 26, normal_color: o.ecoute ? C.ecoute : C.parler })
  // boutons en un toucher
  let y = 500
  const btn = (id, text, action, extra) => { L.push(Object.assign({ id, type: 'BUTTON', x: 50, y, w: 380, h: 90, radius: 45, text, text_size: 30, normal_color: C.bouton, press_color: C.boutonAppui, action }, extra || {})); y += 104 }
  btn('eteindre', 'Éteindre les lumières', { a: 'lumieres', action: 'tout_eteindre' })
  ;(v.pieces || []).forEach((p, i) => btn('piece' + i, p.texte, { a: 'lumieres', action: 'piece', id: p.id, nom: p.nom }, p.on ? { normal_color: C.allume, press_color: C.allumeAppui } : null))
  btn('bonjour', 'Bonjour', { a: 'routine', id: 'matin' })
  btn('nuit', 'Bonne nuit', { a: 'routine', id: 'nuit' })
  btn('clim', 'Ouvrir la clim (téléphone)', { a: 'clim' }, { text_size: 28 })
  if (v.derniere) { L.push({ id: 'derniere', type: 'TEXT', x: 50, y, w: 380, h: 120, text: '« ' + v.derniere + ' »', text_size: 24, color: C.doux, wrap: true }); y += 130 }
  L.push({ id: 'fin', type: 'TEXT', x: 140, y: y + 10, w: 200, h: 30, text: 'Jarvis · Majordome', text_size: 20, color: C.doux })
  return L
}

/** Écran de réponse : texte (défilant), et boutons Oui / Non si Jarvis pose une question */
export function reponse(r) {
  const x = r || {}
  const t = String(x.texte || (x.ok === false ? 'Erreur.' : 'C\'est fait.'))
  const L = []
  if (x.entendu) L.push({ id: 'entendu', type: 'TEXT', x: 70, y: 40, w: 340, h: 60, text: '« ' + couper(x.entendu, 60) + ' »', text_size: 24, color: C.doux, wrap: true })
  const y0 = x.entendu ? 104 : 60
  const lignes = Math.max(2, Math.ceil(t.length / 22))
  const h = Math.max(120, lignes * 36)
  L.push({ id: 'texte', type: 'TEXT', x: 50, y: y0, w: 380, h, text: t, text_size: 30, color: x.ok === false ? C.prudence : C.texte, wrap: true })
  let y = y0 + h + 20
  if (x.ouinon) {
    L.push({ id: 'oui', type: 'BUTTON', x: 60, y, w: 170, h: 90, radius: 45, text: 'Oui', text_size: 32, normal_color: C.parler, press_color: C.parlerAppui, action: { a: 'commande', texte: 'oui' } })
    L.push({ id: 'non', type: 'BUTTON', x: 250, y, w: 170, h: 90, radius: 45, text: 'Non', text_size: 32, normal_color: C.bouton, press_color: C.boutonAppui, action: { a: 'commande', texte: 'non' } })
    y += 110
  }
  L.push({ id: 'retour', type: 'BUTTON', x: 140, y, w: 200, h: 80, radius: 40, text: 'OK', text_size: 30, normal_color: C.bouton, press_color: C.boutonAppui, action: { a: 'retour' } })
  return L
}

/** Message bref (toast) pour les lumières, la clim : la réponse tient en une ligne */
export function bref(r) { return couper((r && r.texte) || (r && r.ok === false ? 'Erreur.' : 'C\'est fait.'), 60) }
