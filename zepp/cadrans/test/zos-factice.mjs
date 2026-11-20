// Zepp OS simulé pour les essais : enregistre les widgets créés (constantes NON énumérables, comme sur la montre)
const J = globalThis.__zos || (globalThis.__zos = { widgets: [], opts: {} })
const natif = (paires) => { const o = {}; for (const [k, v] of Object.entries(paires)) Object.defineProperty(o, k, { value: v, enumerable: false }); return o }
const enumere = (noms) => natif(Object.fromEntries(noms.map((n) => [n, 'w:' + n])))
const widget = enumere(['IMG', 'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'IMG_LEVEL', 'TEXT_IMG', 'IMG_CLICK', 'FILL_RECT', 'TIME_POINTER', 'IMG_ANIM', 'WIDGET_DELEGATE', 'WATCHFACE_EDIT_GROUP', 'IMG_STATUS'])
const show_level = natif({ ONLY_NORMAL: 1, ONAL_AOD: 2 })
const data_type = natif(Object.fromEntries(['BATTERY', 'STEP', 'HEART', 'WEATHER', 'WEATHER_CURRENT', 'WIND', 'CAL', 'DISTANCE', 'SUN_RISE', 'SUN_SET', 'ALTITUDE', 'ALTIMETER', 'WEATHER_LOW', 'WEATHER_HIGH', 'SPO2', 'STRESS', 'PAI_WEEKLY', 'UVI', 'HUMIDITY', 'STAND', 'ALARM_CLOCK'].map((n, i) => [n, 100 + i])))
const align = natif({ LEFT: 'L', RIGHT: 'R', CENTER_H: 'C' })
function createWidget(type, o) { const w = { type, o: Object.assign({}, o), setProperty(k, v) { (w.props || (w.props = [])).push([k, v]) }, getProperty(k) { return o && o.default_type } }; J.widgets.push(w); return w }
const prop = natif({ ANIM_STATUS: 'anim_status', VISIBLE: 'visible', SRC: 'src', CURRENT_TYPE: 'current_type', ANGLE: 'angle' })
const anim_status = natif({ START: 1, STOP: 0 })
const system_status = natif({ DISCONNECT: 1, DISTURB: 2, CLOCK: 3, LOCK: 4 })
const edit_type = natif(Object.fromEntries(['STEP', 'HEART', 'BATTERY', 'CAL', 'DISTANCE', 'WEATHER', 'SPO2', 'STRESS', 'PAI', 'HUMIDITY', 'UVI', 'STAND'].map((n, i) => [n, 10 + i])))
const ui = natif({ widget, show_level, data_type, align, prop, anim_status, system_status, edit_type, createWidget })
globalThis.hmUI = ui
// minuteurs du cadran (mise à jour chaque minute) : ils ne doivent pas empêcher l'essai de se terminer
const siOrig = globalThis.setInterval
globalThis.setInterval = (...a) => { const t = siOrig(...a); if (t && t.unref) t.unref(); J.minuteurs = (J.minuteurs || 0) + 1; return t }
export default ui
