/*
 * Cadran « Jarvis » (Amazfit T-Rex 3, 480 × 480 rond, Zepp OS 4, API 3.0 minimum).
 *
 * Tout ce qui change (heure, date, météo, cœur, pas, batterie, soleil, vent, altitude, pression) est dessiné par le
 * système lui-même avec des widgets « données » du cadran (IMG_TIME, IMG_WEEK, IMG_DATE, TEXT_IMG, IMG_LEVEL avec
 * data_type) : aucun minuteur JavaScript, aucune demande au téléphone.
 * - Écran allumé (ONLY_NORMAL) : sphère animée 24 images à 10 images/s, en boucle jusqu'à l'extinction de l'écran (arrêt par pause_call) ;
 *   relancée quand le cadran revient au premier plan.
 * - Écran toujours allumé (ONAL_AOD) : heure, date, sphère fixe atténuée, quelques repères. Environ 3 % de pixels allumés.
 * - Toucher la sphère : ouvre la mini-appli Jarvis (launchApp, appId 1093117).
 * - Toucher météo, cœur, pas, soleil, altitude : IMG_CLICK ouvre l'appli système correspondante.
 * La disposition vient de shared/cadran.js (testée avec Node), les images de outils/generer.py.
 */
import ui from '@zos/ui'
import { launchApp } from '@zos/router'
import { Time } from '@zos/sensor'
import { DISPOSITION as D, ANIM, JARVIS, salutation } from '../shared/cadran'

// Constantes lues DIRECTEMENT (ui.widget.IMG, sinon hmUI.widget.IMG), comme l'exemple officiel zeppos-samples/watchface/3.0.
// Ne jamais les copier par Object.assign ou « ... » : sur la montre ce sont des propriétés natives NON énumérables,
// la copie donnait des objets vides, aucun widget n'était créé, d'où l'écran tout noir (version 1.0.0).
const H = typeof hmUI !== 'undefined' ? hmUI : null
const pris = (groupe, cle) => {
  const srcs = [ui, H]
  for (let i = 0; i < srcs.length; i++) {
    try { const g = srcs[i] && srcs[i][groupe]; if (g && g[cle] !== undefined) return g[cle] } catch (e) {}
  }
  return undefined
}
/** Table des constantes utiles, clé par clé, en lecture directe (les absentes restent undefined) */
const table = (groupe, cles) => {
  const o = {}
  cles.forEach((k) => { const v = pris(groupe, k); if (v !== undefined) o[k] = v })
  return o
}
const widget = table('widget', ['IMG', 'TEXT', 'FILL_RECT', 'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'IMG_ANIM', 'IMG_LEVEL', 'TEXT_IMG', 'IMG_CLICK', 'WIDGET_DELEGATE'])
const niveau = table('show_level', ['ONLY_NORMAL', 'ONAL_AOD'])
const donnee = table('data_type', ['WEATHER', 'WEATHER_CURRENT', 'WIND', 'HEART', 'STEP', 'BATTERY', 'SUN_RISE', 'SUN_SET', 'ALTITUDE', 'ALTIMETER'])
const align = table('align', ['LEFT', 'RIGHT', 'CENTER_H', 'CENTER_V'])
const prop = table('prop', ['ANIM_STATUS', 'SRC', 'TEXT', 'MORE'])
const evt = table('event', ['CLICK_UP'])
const anim = table('anim_status', ['START', 'STOP'])
const UI = ui && typeof ui.createWidget === 'function' ? ui : H
/** Crée un widget ; un widget inconnu de ce micrologiciel ou une erreur est ignoré au lieu d'arrêter tout le cadran */
const creer = (type, o) => {
  if (type === undefined || !UI) return null
  // sans constante ONAL_AOD, un calque AOD se superposerait à l'écran normal : on ne le crée pas ;
  // sans ONLY_NORMAL, on laisse le niveau par défaut (écran normal)
  if (o && 'show_level' in o && o.show_level === undefined) {
    if (o.aod) return null
    o = Object.assign({}, o); delete o.show_level
  }
  if (o && 'aod' in o) { o = Object.assign({}, o); delete o.aod }
  try { return UI.createWidget(type, o) || null } catch (e) { return null }
}
/** Chaque bloc du cadran est isolé : une panne n'empêche jamais les suivants */
const bloc = (f) => { try { return f() } catch (e) { return null } }

const NORMAL = niveau.ONLY_NORMAL
const AOD = niveau.ONAL_AOD

const img = (p) => 'images/' + p
const serie = (dossier, n) => Array.from({ length: n }, (_, i) => img(dossier + '/' + i + '.png'))
const unite = (p) => ({ unit_sc: img(p), unit_tc: img(p), unit_en: img(p) })

function heure(dossier, show) {
  const ch = serie(dossier, 10), dp = img(dossier + '/dp.png'), h = D.heure
  return creer(widget.IMG_TIME, {
    hour_zero: 1, hour_startX: h.x, hour_startY: h.y, hour_array: ch, hour_space: 0, hour_align: align.LEFT,
    hour_unit_sc: dp, hour_unit_tc: dp, hour_unit_en: dp,
    minute_zero: 1, minute_follow: 1, minute_array: ch, minute_space: 0,
    show_level: show,
  })
}

function date(suffixe, show) {
  const sem = serie('semaine' + suffixe, 7), jours = serie('jour' + suffixe, 31), mois = serie('mois' + suffixe, 12)
  creer(widget.IMG_WEEK, { x: D.semaine.x, y: D.semaine.y, week_en: sem, week_tc: sem, week_sc: sem, show_level: show })
  creer(widget.IMG_DATE, {
    month_startX: D.mois.x, month_startY: D.mois.y, month_is_character: true, month_follow: 0, month_align: align.LEFT, month_space: 0,
    month_en_array: mois, month_sc_array: mois, month_tc_array: mois,
    day_startX: D.jour.x, day_startY: D.jour.y, day_is_character: true, day_follow: 0, day_align: align.LEFT, day_space: 0,
    day_en_array: jours, day_sc_array: jours, day_tc_array: jours,
    show_level: show,
  })
}

/** Nombre dessiné par le système ; rien n'est créé si la donnée n'existe pas sur ce micrologiciel */
function nombre(type, b, police, opts) {
  if (type === undefined) return null
  const o = opts || {}
  const f = img(police + '/')
  return creer(widget.TEXT_IMG, Object.assign({
    x: b.x, y: b.y, w: b.w, h: b.h, type, font_array: serie(police, 10), h_space: 0,
    align_h: o.align === 'gauche' ? align.LEFT : o.align === 'centre' ? align.CENTER_H : align.RIGHT,
    negative_image: f + 'moins.png', invalid_image: f + 'invalide.png', dot_image: f + 'dp.png',
    show_level: NORMAL,
  }, o.unite ? unite(police + '/' + o.unite + '.png') : {}))
}

function ouvrirJarvis() {
  try { launchApp({ appId: JARVIS.appId, url: JARVIS.url, native: false }) } catch (e) {
    try { hmApp.startApp({ appid: JARVIS.appId, url: JARVIS.url }) } catch (e2) {}
  }
}

WatchFace({
  build() {
    // ---------- fonds (d'abord, toujours) : base noire puis décor
    bloc(() => creer(widget.FILL_RECT, { x: 0, y: 0, w: 480, h: 480, color: 0x000000, show_level: NORMAL }))
    bloc(() => creer(widget.IMG, { x: 0, y: 0, w: 480, h: 480, src: img('fond.png'), show_level: NORMAL }))
    bloc(() => creer(widget.IMG, { x: 0, y: 0, w: 480, h: 480, src: img('fond_aod.png'), show_level: AOD, aod: true }))

    // ---------- heure (toujours) : IMG_TIME, sinon TEXT mis à jour à la minute ; puis date
    let horloge = null
    bloc(() => { horloge = new Time() })
    const secours = []
    const hm = () => { const d = new Date(); let h = d.getHours(), m = d.getMinutes()
      try { h = horloge.getHours(); m = horloge.getMinutes() } catch (e) {}
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m }
    const heureTexte = (couleur, show) => {
      const h = D.heure
      const t = creer(widget.TEXT, { x: h.x - 20, y: h.y, w: h.w + 40, h: h.h, color: couleur, text_size: 72,
        align_h: align.CENTER_H, align_v: align.CENTER_V, text: hm(), show_level: show })
      if (t) secours.push(t)
    }
    if (!bloc(() => heure('heure', NORMAL))) bloc(() => heureTexte(0xeafffb, NORMAL))
    if (AOD !== undefined && !bloc(() => heure('heure_aod', AOD))) bloc(() => heureTexte(0x6f9e97, AOD))
    const majSecours = () => secours.forEach((t) => { try { t.setProperty(prop.TEXT, hm()) } catch (e) {} })
    bloc(() => date('', NORMAL))
    if (AOD !== undefined) bloc(() => date('_aod', AOD))

    // ---------- sphère
    const s = D.sphere
    const sphere = bloc(() => creer(widget.IMG_ANIM, {
      x: s.x, y: s.y, anim_path: ANIM.dossier, anim_prefix: ANIM.prefixe, anim_ext: 'png', anim_fps: ANIM.fps,
      anim_size: ANIM.images, repeat_count: 0, anim_repeat: true, anim_status: anim.START, // en boucle tant que l'écran est allumé ; arrêt par pause_call (écran éteint / AOD)
      display_on_restart: true, default_frame_index: 0, show_level: NORMAL,
    }))
    bloc(() => creer(widget.IMG, { x: s.x, y: s.y, w: s.w, h: s.h, src: img('sphere_aod.png'), show_level: AOD, aod: true }))
    const jouer = () => {
      if (!sphere) return
      try { sphere.setProperty(prop.ANIM_STATUS, anim.STOP) } catch (e) {}
      try { sphere.setProperty(prop.ANIM_STATUS, anim.START) } catch (e) {}
    }
    const arreter = () => { if (sphere) try { sphere.setProperty(prop.ANIM_STATUS, anim.STOP) } catch (e) {} }

    // ---------- salutation selon l'heure (Bonjour / Bonsoir, comme Socle)
    const salut = bloc(() => creer(widget.IMG, { x: D.salut.x, y: D.salut.y, w: D.salut.w, h: D.salut.h, src: img('salut/0.png'), show_level: NORMAL }))
    let actuel = -1
    const majSalut = () => {
      let h = new Date().getHours()
      try { h = horloge.getHours() } catch (e) {}
      const i = salutation(h)
      if (i !== actuel && salut) { actuel = i; try { salut.setProperty(prop.SRC, img('salut/' + i + '.png')) } catch (e) {} }
    }
    bloc(() => horloge.onPerMinute(() => { majSecours(); bloc(majSalut) }))
    bloc(majSalut)

    // ---------- météo
    const icone = donnee.WEATHER !== undefined ? donnee.WEATHER : donnee.WEATHER_CURRENT
    if (icone !== undefined) {
      bloc(() => creer(widget.IMG_LEVEL, { x: D.meteoIcone.x, y: D.meteoIcone.y, w: D.meteoIcone.w, h: D.meteoIcone.h,
        image_array: serie('meteo', 29), image_length: 29, type: icone, show_level: NORMAL }))
    }
    bloc(() => nombre(donnee.WEATHER_CURRENT, D.meteoTemp, 'moyen', { align: 'centre', unite: 'deg' }))
    bloc(() => nombre(donnee.WIND, D.vent, 'petit', { align: 'gauche' }))

    // ---------- cœur, pas, batterie
    bloc(() => nombre(donnee.HEART, D.coeur, 'moyen', { align: 'centre' }))
    bloc(() => nombre(donnee.STEP, D.pas, 'petit'))
    bloc(() => nombre(donnee.BATTERY, D.batterie, 'petit', { unite: 'pct' }))
    if (donnee.BATTERY !== undefined) {
      const b = D.barreBatterie
      bloc(() => creer(widget.IMG_LEVEL, { x: b.x, y: b.y, w: b.w, h: b.h, image_array: serie('batterie', 11), image_length: 11,
        type: donnee.BATTERY, show_level: NORMAL }))
    }

    // ---------- terrain : soleil, altitude, pression
    bloc(() => nombre(donnee.SUN_RISE, D.leve, 'petit', { align: 'gauche' }))
    bloc(() => nombre(donnee.SUN_SET, D.couche, 'petit', { align: 'gauche' }))
    bloc(() => nombre(donnee.ALTITUDE, D.altitude, 'mini', { unite: 'm' }))
    bloc(() => nombre(donnee.ALTIMETER, D.pression, 'mini', { align: 'gauche', unite: 'hpa' }))

    // ---------- zones tactiles : applis système (IMG_CLICK) et mini-appli Jarvis (sphère)
    Object.keys(D.zones).forEach((nom) => bloc(() => {
      const z = D.zones[nom]
      if (z.ouvre === 'jarvis') {
        const t = creer(widget.IMG, { x: z.x, y: z.y, w: z.w, h: z.h, src: img('zone/' + nom + '.png'), show_level: NORMAL })
        if (t) try { t.addEventListener(evt.CLICK_UP, ouvrirJarvis) } catch (e) {}
      } else if (donnee[z.ouvre] !== undefined) {
        creer(widget.IMG_CLICK, { x: z.x, y: z.y, w: z.w, h: z.h, src: img('zone/' + nom + '.png'), type: donnee[z.ouvre], show_level: NORMAL })
      }
    }))

    // ---------- animation seulement quand le cadran est au premier plan
    if (widget.WIDGET_DELEGATE !== undefined) {
      bloc(() => creer(widget.WIDGET_DELEGATE, {
        resume_call: () => { bloc(majSecours); bloc(majSalut); bloc(jouer) },
        pause_call: () => { bloc(arreter) },
      }))
    }
  },

  onDestroy() {},
})
