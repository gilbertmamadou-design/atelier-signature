// Zepp OS simulé pour les essais : enregistre les widgets créés, les écouteurs, les lancements d'appli
const J = globalThis.__zos || (globalThis.__zos = { widgets: [], lancements: [], minutes: [], heure: 10, opts: {} })
// opts : sansDataType (data_type absent de @zos/ui, fourni par hmUI), inconnus (widgets absents des deux)
// Comme sur la montre (QuickJS) : constantes NON énumérables ; Object.assign({}, ui.widget) y donne {}
const natif = (paires) => { const o = {}; for (const [k, v] of Object.entries(paires)) Object.defineProperty(o, k, { value: v, enumerable: false }); return o }
const enumere = (noms) => natif(Object.fromEntries(noms.map((n, i) => [n, 'w:' + n])))
const widget = enumere(['IMG', 'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'IMG_ANIM', 'IMG_LEVEL', 'TEXT_IMG', 'IMG_CLICK', 'WIDGET_DELEGATE', 'FILL_RECT', 'TEXT'])
const show_level = new Proxy(natif({ ONLY_NORMAL: 1, ONAL_AOD: 2, ONLY_EDIT: 4 }), { get: (o, k) => (J.opts.sansNiveaux ? undefined : o[k]) })
const data_type = natif(Object.fromEntries(['BATTERY', 'STEP', 'HEART', 'WEATHER_CURRENT', 'WIND', 'SUN_RISE', 'SUN_SET', 'ALTITUDE', 'ALTIMETER'].map((n, i) => [n, 100 + i])))
const align = natif({ LEFT: 'L', RIGHT: 'R', CENTER_H: 'C', CENTER_V: 'V' })
const prop = natif({ ANIM_STATUS: 'anim_status', SRC: 'src', VISIBLE: 'visible', TEXT: 'text', MORE: 'more' })
const event = natif({ CLICK_UP: 'up', CLICK_DOWN: 'down' })
const anim_status = natif({ START: 1, PAUSE: 2, RESUME: 3, STOP: 4 })
function createWidget(type, o) {
  const w = { type, o: Object.assign({}, o), ecouteurs: {}, etats: [],
    setProperty(p, v) { if (p === 'anim_status') this.etats.push(v); else this.o[p] = v },
    addEventListener(e, f) { this.ecouteurs[e] = f } }
  J.widgets.push(w)
  return w
}
const widgetVu = new Proxy(widget, { get: (o, k) => ((J.opts.inconnus || []).includes(k) ? undefined : o[k]) })
const ui = natif({ widget: widgetVu, show_level, data_type, align, prop, event, anim_status, createWidget })
const hm = natif({ widget: widgetVu, show_level, data_type, align, prop, event, anim_status, createWidget })
globalThis.hmUI = hm
export default new Proxy({}, { get: (_, k) => (J.opts.sansDataType && k === 'data_type' ? undefined : ui[k]) })
export { widget, show_level, data_type, align, prop, event, anim_status, createWidget }
export function launchApp(o) { J.lancements.push(o) }
export class Time { getHours() { return J.heure } getMinutes() { return 0 } onPerMinute(f) { J.minutes.push(f) } }
