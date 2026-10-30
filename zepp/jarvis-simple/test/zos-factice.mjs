// Zepp OS simulé. Comme sur la montre (QuickJS), les constantes sont des propriétés NON énumérables :
// Object.assign({}, ui.widget) y donne {} — c'est la cause d'écran noir trouvée dans le grand cadran.
// Réglages par scénario dans globalThis.__zos.opts : echecImg, echecCapteurs, sansUi (seul le global hmUI existe), inconnus (liste de widgets absents)
const J = globalThis.__zos || (globalThis.__zos = { widgets: [], opts: {}, minutes: [], batterie: [], heure: { h: 9, m: 5, jour: 1, mois: 5, semaine: 5 }, niveau: 82 })
const natif = (paires) => { const o = {}; for (const [k, v] of Object.entries(paires)) Object.defineProperty(o, k, { value: v, enumerable: false }); return o }
const noms = ['IMG', 'TEXT', 'FILL_RECT', 'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'IMG_ANIM', 'IMG_LEVEL', 'TEXT_IMG', 'IMG_CLICK', 'WIDGET_DELEGATE']
const widget = new Proxy(natif(Object.fromEntries(noms.map((n) => [n, 'w:' + n]))), {
  get: (o, k) => ((J.opts.inconnus || []).includes(k) ? undefined : o[k]),
})
const show_level = natif({ ONLY_NORMAL: 1, ONAL_AOD: 2, ONLY_EDIT: 4 })
const data_type = natif(Object.fromEntries(['BATTERY', 'STEP', 'HEART', 'WEATHER_CURRENT', 'WIND', 'SUN_RISE', 'SUN_SET', 'ALTITUDE', 'ALTIMETER'].map((n, i) => [n, 100 + i])))
const align = natif({ LEFT: 'L', RIGHT: 'R', CENTER_H: 'C', CENTER_V: 'V' })
const prop = natif({ ANIM_STATUS: 'anim_status', SRC: 'src', VISIBLE: 'visible', TEXT: 'text', MORE: 'more' })
const event = natif({ CLICK_UP: 'up', CLICK_DOWN: 'down' })
const anim_status = natif({ START: 1, PAUSE: 2, RESUME: 3, STOP: 4 })
function createWidget(type, o) {
  if (typeof type !== 'string') throw new TypeError('type de widget invalide : ' + type)
  if (J.opts.echecImg && (type === 'w:IMG' || type === 'w:IMG_TIME')) throw new Error('image introuvable')
  const w = { type, o: Object.assign({}, o), ecouteurs: {}, etats: [],
    setProperty(p, v) { if (p === 'anim_status') this.etats.push(v); else if (p === 'more') Object.assign(this.o, v); else this.o[p] = v },
    addEventListener(e, f) { this.ecouteurs[e] = f } }
  J.widgets.push(w)
  return w
}
const ui = natif({ widget, show_level, data_type, align, prop, event, anim_status, createWidget })
globalThis.hmUI = ui
export default new Proxy({}, { get: (_, k) => (J.opts.sansUi ? undefined : ui[k]) })
export { widget, show_level, data_type, align, prop, event, anim_status, createWidget }
export function launchApp(o) { (J.lancements || (J.lancements = [])).push(o) }
const panne = () => { if (J.opts.echecCapteurs) throw new Error('capteur indisponible') }
export class Time {
  constructor() { panne() }
  getHours() { return J.heure.h } getMinutes() { return J.heure.m } getDate() { return J.heure.jour }
  getMonth() { return J.heure.mois } getDay() { return J.heure.semaine }
  onPerMinute(f) { J.minutes.push(f) }
}
export class Battery {
  constructor() { panne() }
  getCurrent() { return J.niveau }
  onChange(f) { J.batterie.push(f) } offChange() {}
}
export function getScene() { return 1 }
export const SCENE_AOD = 2
