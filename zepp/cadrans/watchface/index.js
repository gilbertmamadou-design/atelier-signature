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
const widget = table('widget', ['IMG', 'FILL_RECT', 'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'IMG_LEVEL', 'TEXT_IMG', 'IMG_CLICK', 'TIME_POINTER', 'IMG_ANIM', 'WIDGET_DELEGATE', 'WATCHFACE_EDIT_GROUP', 'IMG_STATUS'])
const prop = table('prop', ['ANIM_STATUS', 'VISIBLE', 'SRC', 'CURRENT_TYPE'])
const animSt = table('anim_status', ['START', 'STOP'])
const niveau = table('show_level', ['ONLY_NORMAL', 'ONAL_AOD'])
const donnee = table('data_type', ['WEATHER', 'WEATHER_CURRENT', 'WEATHER_LOW', 'WEATHER_HIGH', 'WIND', 'HEART', 'STEP', 'BATTERY', 'CAL', 'DISTANCE',
  'SUN_RISE', 'SUN_SET', 'ALTITUDE', 'ALTIMETER', 'SPO2', 'STRESS', 'PAI_WEEKLY', 'UVI', 'HUMIDITY', 'STAND', 'ALARM_CLOCK'])
const etat = table('system_status', ['DISCONNECT', 'DISTURB', 'CLOCK', 'LOCK'])
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

const ANIMS = []
/* ---------- éléments qui changent selon l'heure ou la date (calculés ici, mis à jour au réveil de l'écran et chaque minute) ---------- */
const MAJ = []
const voir = (w, v) => { if (!w) return; try { w.setProperty(prop.VISIBLE, !!v) } catch (e) {} }
const image = (w, src) => { if (!w) return; try { w.setProperty(prop.SRC, src) } catch (e) {} }
const maintenant = () => new Date()
// heure en lettres : même calcul que l'Atelier (cadran.js, motsActifs)
const motsActifs = (h, m) => {
  const r = ['il', 'est'], m5 = Math.floor(m / 5) * 5; if (m5 >= 35) h = (h + 1) % 24
  const HH = ['minuit', 'une', 'deux', 'trois', 'quatre', 'cinqh', 'six', 'sept', 'huit', 'neuf', 'dixh', 'onze']
  if (h === 0) r.push('minuit'); else if (h === 12) r.push('midi'); else { r.push(HH[h % 12]); r.push('heure'); if (h % 12 !== 1) r.push('s') }
  const plein = h !== 0 && h !== 12
  const M = { 5: ['cinqm'], 10: ['dixm'], 15: ['et1', 'quart'], 20: ['vingt'], 25: ['vingt', 'tiret', 'cinqm'], 30: plein ? ['et2', 'demi', 'e'] : ['et2', 'demi'],
    35: ['moins', 'vingt', 'tiret', 'cinqm'], 40: ['moins', 'vingt'], 45: ['moins', 'le', 'quart'], 50: ['moins', 'dixm'], 55: ['moins', 'cinqm'] }[m5] || []
  return r.concat(M)
}
const lunePhase = (d) => { let a = ((d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % 29.530588853; if (a < 0) a += 29.530588853; return Math.floor(a / 29.530588853 * 30) % 30 }
const joursAvant = (w, d) => {
  const q = w.date.split('-').map(Number), auj = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  let c = new Date(q[0], q[1] - 1, q[2])
  if (w.annuel) { c = new Date(d.getFullYear(), q[1] - 1, q[2]); if (c < auj) c = new Date(d.getFullYear() + 1, q[1] - 1, q[2]) }
  return Math.round((c - auj) / 864e5)
}
let FOND = null
const FAIRE = {
  img(w, show) {
    const i = creer(widget.IMG, { x: w.x, y: w.y, w: w.w, h: w.h, src: w.src, show_level: show, aod: w.aod })
    if (w.role === 'fond') FOND = i
    if (w.role === 'nuit' && i) MAJ.push((d) => { const h = d.getHours(); voir(i, w.de > w.a ? (h >= w.de || h < w.a) : (h >= w.de && h < w.a)) })
    return i
  },
  mots(w) {
    const L = w.items.map((it) => ({ id: it.id, i: creer(widget.IMG, { x: it.x, y: it.y, src: 'images/' + w.dossier + '/' + it.id + '.png', show_level: NORMAL }) }))
    const P = (w.points || []).map((p) => creer(widget.IMG, { x: p.x, y: p.y, src: 'images/' + w.dossier + '/point.png', show_level: NORMAL }))
    MAJ.push((d) => { const on = motsActifs(d.getHours(), d.getMinutes()); L.forEach((o) => voir(o.i, on.indexOf(o.id) >= 0)); const n = d.getMinutes() % 5; P.forEach((p, k) => voir(p, k < n)) })
  },
  compte(w) {
    const pre = creer(widget.IMG, { x: w.x, y: w.y, src: w.pre.src, show_level: NORMAL })
    const ch = [0, 1, 2].map((k) => creer(widget.IMG, { x: w.x + w.pre.w + k * w.cw, y: w.y, src: 'images/' + w.dossier + '/0.png', show_level: NORMAL }))
    const jj = creer(widget.IMG, { x: w.jj.x, y: w.jj.y, src: w.jj.src, show_level: NORMAL })
    MAJ.push((d) => {
      const j = joursAvant(w, d), t = String(Math.max(0, Math.min(999, j)))
      voir(jj, j === 0); voir(pre, j !== 0)
      ch.forEach((c, k) => { if (j !== 0 && k < t.length) { image(c, 'images/' + w.dossier + '/' + t[k] + '.png'); voir(c, true) } else voir(c, false) })
    })
  },
  statut(w) {
    const t = etat[w.type]; if (t === undefined) return null
    return creer(widget.IMG_STATUS, { x: w.x, y: w.y, w: w.w, h: w.h, type: t, src: w.src, show_level: NORMAL })
  },
  fuseau(w) {
    const xs = [0, 1, 'dp', 2, 3], I = [], dp = 'images/' + w.dossier + '/dp.png'
    let x = w.x
    xs.forEach((k) => { I.push(k === 'dp' ? null : creer(widget.IMG, { x, y: w.y, src: 'images/' + w.dossier + '/0.png', show_level: NORMAL })); if (k === 'dp') creer(widget.IMG, { x, y: w.y, src: dp, show_level: NORMAL }); x += k === 'dp' ? w.dpw : w.cw })
    MAJ.push((d) => { const d2 = new Date(d.getTime() + w.ecart * 36e5), t = ('0' + d2.getHours()).slice(-2) + ('0' + d2.getMinutes()).slice(-2); [0, 1, 3, 4].forEach((k, i) => image(I[k], 'images/' + w.dossier + '/' + t[i] + '.png')) })
  },
  lune(w) {
    const i = creer(widget.IMG, { x: w.x, y: w.y, w: w.w, h: w.h, src: 'images/' + w.dossier + '/0.png', show_level: NORMAL })
    MAJ.push((d) => image(i, 'images/' + w.dossier + '/' + lunePhase(d) + '.png'))
  },
  level(w, show) {
    const t = typeDe(w.type); if (t === undefined) return null
    return creer(widget.IMG_LEVEL, { x: w.x, y: w.y, w: w.w, h: w.h, image_array: serie(w.dossier, w.n), image_length: w.n, type: t, show_level: show, aod: w.aod })
  },
  num(w, show) {
    const t = donnee[w.type]; if (t === undefined) return null
    const d = w.dossier || 'infos', u = w.unite ? 'images/' + d + '/' + w.unite + '.png' : null
    return creer(widget.TEXT_IMG, Object.assign({
      x: w.x, y: w.y, w: w.w, h: w.h, type: t, font_array: serie(d, 10), h_space: 0,
      align_h: w.align === 'gauche' ? align.LEFT : w.align === 'droite' ? align.RIGHT : align.CENTER_H,
      negative_image: 'images/' + d + '/moins.png', invalid_image: 'images/' + d + '/invalide.png', dot_image: 'images/' + d + '/' + (w.point || 'point') + '.png',
      show_level: show, aod: w.aod,
    }, u ? { unit_sc: u, unit_tc: u, unit_en: u } : {}))
  },
  click(w) {
    const t = donnee[w.type]; if (t === undefined) return null
    return creer(widget.IMG_CLICK, { x: w.x, y: w.y, w: w.w, h: w.h, src: 'images/zone.png', type: t, show_level: NORMAL })
  },
  time(w, show) {
    const ch = serie(w.dossier, 10), dp = 'images/' + w.dossier + '/dp.png'
    const o = {
      hour_zero: 1, hour_startX: w.x, hour_startY: w.y, hour_array: ch, hour_space: 0, hour_align: align.LEFT,
      hour_unit_sc: dp, hour_unit_tc: dp, hour_unit_en: dp,
      minute_zero: 1, minute_follow: 1, minute_array: ch, minute_space: 0,
      show_level: show, aod: w.aod,
    }
    if (w.sec) Object.assign(o, { second_zero: 1, second_follow: 0, second_startX: w.sec.x, second_startY: w.sec.y, second_array: serie(w.sec.dossier, 10), second_space: 0, second_align: align.LEFT })
    return creer(widget.IMG_TIME, o)
  },
  date(w, show) {
    // anciens paquets : dossiers « semaine<suf> », « jour<suf> »… ; nouveaux : « <dossier>/semaine »…
    const dos = (n) => (w.dossier ? w.dossier + '/' + n : n + (w.suf || ''))
    if (w.sem) { const sem = serie(dos('semaine'), 7); bloc(() => creer(widget.IMG_WEEK, { x: w.sem.x, y: w.sem.y, week_en: sem, week_tc: sem, week_sc: sem, show_level: show, aod: w.aod })) }
    if (!w.jour && !w.mois) return null
    const o = { show_level: show, aod: w.aod }
    if (w.mois) {
      const mois = serie(dos('mois'), 12)
      Object.assign(o, { month_startX: w.mois.x, month_startY: w.mois.y, month_is_character: true, month_follow: 0, month_align: align.LEFT, month_space: 0,
        month_en_array: mois, month_sc_array: mois, month_tc_array: mois })
    }
    if (w.jour) {
      const jours = serie(dos('jour'), 31)
      Object.assign(o, { day_startX: w.jour.x, day_startY: w.jour.y, day_is_character: true, day_follow: 0, day_align: align.LEFT, day_space: 0,
        day_en_array: jours, day_sc_array: jours, day_tc_array: jours })
    }
    return creer(widget.IMG_DATE, o)
  },
  // animation (engrenages, balancier, radar…) : même réglages que la sphère du cadran Jarvis, déjà éprouvée sur la T-Rex 3
  anim(w) {
    const a = creer(widget.IMG_ANIM, {
      x: w.x, y: w.y, anim_path: 'images/' + w.dossier, anim_prefix: 'f', anim_ext: 'png', anim_fps: w.fps || 12,
      anim_size: w.n, repeat_count: 0, anim_repeat: true, anim_status: animSt.START,
      display_on_restart: true, default_frame_index: 0, show_level: NORMAL,
    })
    if (a) ANIMS.push(a)
    return a
  },
  pointer(w, show) {
    const cx = w.cx == null ? 240 : w.cx, cy = w.cy == null ? 240 : w.cy
    const o = {
      hour_centerX: cx, hour_centerY: cy, hour_posX: w.h.px, hour_posY: w.h.py, hour_path: w.h.src,
      minute_centerX: cx, minute_centerY: cy, minute_posX: w.m.px, minute_posY: w.m.py, minute_path: w.m.src,
      show_level: show, aod: w.aod,
    }
    if (w.s) Object.assign(o, { second_centerX: cx, second_centerY: cy, second_posX: w.s.px, second_posY: w.s.py, second_path: w.s.src })
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
    // fonds au choix (appui long sur le cadran › Modifier) : le fond choisi remplace le fond principal
    if (S.edit && widget.WATCHFACE_EDIT_GROUP !== undefined) bloc(() => {
      const t = S.edit.types, g = creer(widget.WATCHFACE_EDIT_GROUP, {
        edit_id: 101, x: S.edit.x, y: S.edit.y, w: S.edit.w, h: S.edit.h,
        select_image: 'images/edit/sel.png', un_select_image: 'images/edit/unsel.png',
        default_type: t[0].type, optional_types: t.map((o) => ({ type: o.type, preview: o.preview })), count: t.length,
        tips_BG: 'images/edit/tip.png', tips_x: 30, tips_y: -50, tips_width: 110, tips_margin: 6,
      })
      const cur = g ? g.getProperty(prop.CURRENT_TYPE) : t[0].type, o = t.filter((x) => x.type === cur)[0]
      if (o && o.src !== 'images/fond.png') image(FOND, o.src)
    })
    // heure en lettres, compte à rebours, lune, fond de nuit : calculés maintenant, au réveil de l'écran et chaque minute
    const maj = () => { const d = maintenant(); MAJ.forEach((f) => bloc(() => f(d))) }
    let tic = null
    const demarre = () => { maj(); if (MAJ.length && tic === null) { try { tic = setInterval(maj, 20000) } catch (e) {} } }
    const arrete = () => { if (tic !== null) { try { clearInterval(tic) } catch (e) {} tic = null } }
    if (MAJ.length) demarre()
    // animations : relancées quand le cadran revient à l'écran, arrêtées écran éteint ou en AOD (autonomie)
    const pour = (st) => ANIMS.forEach((a) => { try { a.setProperty(prop.ANIM_STATUS, st) } catch (e) {} })
    if ((ANIMS.length || MAJ.length) && widget.WIDGET_DELEGATE !== undefined) {
      bloc(() => creer(widget.WIDGET_DELEGATE, {
        resume_call: () => { if (ANIMS.length) { pour(animSt.STOP); pour(animSt.START) } if (MAJ.length) demarre() },
        pause_call: () => { if (ANIMS.length) pour(animSt.STOP); arrete() },
      }))
    }
  },
  onDestroy() {},
})
