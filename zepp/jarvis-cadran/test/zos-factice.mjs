// Zepp OS simulé pour les essais : enregistre les widgets créés, les écouteurs, les lancements d'appli
const J = globalThis.__zos || (globalThis.__zos = { widgets: [], lancements: [], minutes: [], heure: 10 })
const enumere = (noms) => Object.fromEntries(noms.map((n, i) => [n, 'w:' + n]))
const widget = enumere(['IMG', 'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'IMG_ANIM', 'IMG_LEVEL', 'TEXT_IMG', 'IMG_CLICK', 'WIDGET_DELEGATE', 'FILL_RECT', 'TEXT'])
const show_level = { ONLY_NORMAL: 1, ONAL_AOD: 2, ONLY_EDIT: 4 }
const data_type = Object.fromEntries(['BATTERY', 'STEP', 'HEART', 'WEATHER', 'WEATHER_CURRENT', 'WIND', 'SUN_RISE', 'SUN_SET', 'ALTITUDE', 'ALTIMETER'].map((n, i) => [n, 100 + i]))
const align = { LEFT: 'L', RIGHT: 'R', CENTER_H: 'C' }
const prop = { ANIM_STATUS: 'anim_status', SRC: 'src', VISIBLE: 'visible' }
const event = { CLICK_UP: 'up', CLICK_DOWN: 'down' }
const anim_status = { START: 1, PAUSE: 2, RESUME: 3, STOP: 4 }
function createWidget(type, o) {
  const w = { type, o: Object.assign({}, o), ecouteurs: {}, etats: [],
    setProperty(p, v) { if (p === 'anim_status') this.etats.push(v); else this.o[p] = v },
    addEventListener(e, f) { this.ecouteurs[e] = f } }
  J.widgets.push(w)
  return w
}
const ui = { widget, show_level, data_type, align, prop, event, anim_status, createWidget }
export default ui
export { widget, show_level, data_type, align, prop, event, anim_status, createWidget }
export function launchApp(o) { J.lancements.push(o) }
export class Time { getHours() { return J.heure } onPerMinute(f) { J.minutes.push(f) } }
