/*
 * Cadran générique « Atelier de cadrans » (Amazfit T-Rex 3, 480 × 480, Zepp OS 3+).
 * Le cadran ne contient aucun dessin : il crée, dans l'ordre, les widgets décrits par shared/style.js
 * (fabriqué par outils/fabriquer.mjs à partir des réglages, avec les images de assets/trex3/images).
 * Tout ce qui bouge (heure, aiguilles, date, pas, cœur, batterie, météo…) est dessiné par le système avec les
 * widgets « données » du cadran : aucun minuteur JavaScript, aucune demande au téléphone.
 * Même prudence que le cadran Jarvis : constantes Zepp OS lues une à une (jamais copiées), chaque widget isolé.
 */
import ui from '@zos/ui'
import { S } from '../shared/style'

const H = typeof hmUI !== 'undefined' ? hmUI : null
const pris = (groupe, cle) => {
  const srcs = [ui, H]
  for (let i = 0; i < srcs.length; i++) {
    try { const g = srcs[i] && srcs[i][groupe]; if (g && g[cle] !== undefined) return g[cle] } catch (e) {}
  }
  return undefined
}
const table = (groupe, cles) => { const o = {}; cles.forEach((k) => { const v = pris(groupe, k); if (v !== undefined) o[k] = v }); return o }
const widget = table('widget', ['IMG', 'FILL_RECT', 'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'IMG_LEVEL', 'TEXT_IMG', 'IMG_CLICK', 'TIME_POINTER'])
const niveau = table('show_level', ['ONLY_NORMAL', 'ONAL_AOD'])
const donnee = table('data_type', ['WEATHER', 'WEATHER_CURRENT', 'WIND', 'HEART', 'STEP', 'BATTERY', 'CAL', 'DISTANCE', 'SUN_RISE', 'SUN_SET', 'ALTITUDE', 'ALTIMETER'])
const align = table('align', ['LEFT', 'RIGHT', 'CENTER_H'])
const UI = ui && typeof ui.createWidget === 'function' ? ui : H

const creer = (type, o) => {
  if (type === undefined || !UI) return null
  if (o && 'show_level' in o && o.show_level === undefined) {
    if (o.aod) return null
    o = Object.assign({}, o); delete o.show_level
  }
  if (o && 'aod' in o) { o = Object.assign({}, o); delete o.aod }
  try { return UI.createWidget(type, o) || null } catch (e) { return null }
}
const bloc = (f) => { try { return f() } catch (e) { return null } }
const NORMAL = niveau.ONLY_NORMAL
const AOD = niveau.ONAL_AOD
const serie = (dossier, n, depart) => Array.from({ length: n }, (_, i) => 'images/' + dossier + '/' + (i + (depart || 0)) + '.png')
const typeDe = (t) => (t === 'WEATHER' ? (donnee.WEATHER !== undefined ? donnee.WEATHER : donnee.WEATHER_CURRENT) : donnee[t])

const FAIRE = {
  img(w, show) { return creer(widget.IMG, { x: w.x, y: w.y, w: w.w, h: w.h, src: w.src, show_level: show, aod: w.aod }) },
  level(w, show) {
    const t = typeDe(w.type); if (t === undefined) return null
    return creer(widget.IMG_LEVEL, { x: w.x, y: w.y, w: w.w, h: w.h, image_array: serie(w.dossier, w.n), image_length: w.n, type: t, show_level: show, aod: w.aod })
  },
  num(w, show) {
    const t = donnee[w.type]; if (t === undefined) return null
    const u = w.unite ? 'images/infos/' + w.unite + '.png' : null
    return creer(widget.TEXT_IMG, Object.assign({
      x: w.x, y: w.y, w: w.w, h: w.h, type: t, font_array: serie('infos', 10), h_space: 0,
      align_h: w.align === 'gauche' ? align.LEFT : w.align === 'droite' ? align.RIGHT : align.CENTER_H,
      negative_image: 'images/infos/moins.png', invalid_image: 'images/infos/invalide.png', dot_image: 'images/infos/' + (w.point || 'point') + '.png',
      show_level: show, aod: w.aod,
    }, u ? { unit_sc: u, unit_tc: u, unit_en: u } : {}))
  },
  click(w) {
    const t = donnee[w.type]; if (t === undefined) return null
    return creer(widget.IMG_CLICK, { x: w.x, y: w.y, w: w.w, h: w.h, src: 'images/zone.png', type: t, show_level: NORMAL })
  },
  time(w, show) {
    const ch = serie(w.dossier, 10), dp = 'images/' + w.dossier + '/dp.png'
    return creer(widget.IMG_TIME, {
      hour_zero: 1, hour_startX: w.x, hour_startY: w.y, hour_array: ch, hour_space: 0, hour_align: align.LEFT,
      hour_unit_sc: dp, hour_unit_tc: dp, hour_unit_en: dp,
      minute_zero: 1, minute_follow: 1, minute_array: ch, minute_space: 0,
      show_level: show, aod: w.aod,
    })
  },
  date(w, show) {
    const sem = serie('semaine' + w.suf, 7), jours = serie('jour' + w.suf, 31), mois = serie('mois' + w.suf, 12)
    creer(widget.IMG_WEEK, { x: w.sem.x, y: w.sem.y, week_en: sem, week_tc: sem, week_sc: sem, show_level: show, aod: w.aod })
    return creer(widget.IMG_DATE, {
      month_startX: w.mois.x, month_startY: w.mois.y, month_is_character: true, month_follow: 0, month_align: align.LEFT, month_space: 0,
      month_en_array: mois, month_sc_array: mois, month_tc_array: mois,
      day_startX: w.jour.x, day_startY: w.jour.y, day_is_character: true, day_follow: 0, day_align: align.LEFT, day_space: 0,
      day_en_array: jours, day_sc_array: jours, day_tc_array: jours,
      show_level: show, aod: w.aod,
    })
  },
  pointer(w, show) {
    const o = {
      hour_centerX: 240, hour_centerY: 240, hour_posX: w.h.px, hour_posY: w.h.py, hour_path: w.h.src,
      minute_centerX: 240, minute_centerY: 240, minute_posX: w.m.px, minute_posY: w.m.py, minute_path: w.m.src,
      show_level: show, aod: w.aod,
    }
    if (w.s) Object.assign(o, { second_centerX: 240, second_centerY: 240, second_posX: w.s.px, second_posY: w.s.py, second_path: w.s.src })
    return creer(widget.TIME_POINTER, o)
  },
}

WatchFace({
  build() {
    // base noire d'abord, toujours
    bloc(() => creer(widget.FILL_RECT, { x: 0, y: 0, w: 480, h: 480, color: 0x000000, show_level: NORMAL }))
    ;(S.w || []).forEach((w) => bloc(() => {
      if (w.aod && AOD === undefined) return
      const f = FAIRE[w.k]; if (f) f(w, w.aod ? AOD : NORMAL)
    }))
  },
  onDestroy() {},
})
