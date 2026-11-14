// Zepp OS simulé pour les essais : enregistre les widgets créés (constantes NON énumérables, comme sur la montre)
const J = globalThis.__zos || (globalThis.__zos = { widgets: [], opts: {} })
const natif = (paires) => { const o = {}; for (const [k, v] of Object.entries(paires)) Object.defineProperty(o, k, { value: v, enumerable: false }); return o }
const enumere = (noms) => natif(Object.fromEntries(noms.map((n) => [n, 'w:' + n])))
const widget = enumere(['IMG', 'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'IMG_LEVEL', 'TEXT_IMG', 'IMG_CLICK', 'FILL_RECT', 'TIME_POINTER'])
const show_level = natif({ ONLY_NORMAL: 1, ONAL_AOD: 2 })
const data_type = natif(Object.fromEntries(['BATTERY', 'STEP', 'HEART', 'WEATHER', 'WEATHER_CURRENT', 'WIND', 'CAL', 'DISTANCE', 'SUN_RISE', 'SUN_SET', 'ALTITUDE', 'ALTIMETER'].map((n, i) => [n, 100 + i])))
const align = natif({ LEFT: 'L', RIGHT: 'R', CENTER_H: 'C' })
function createWidget(type, o) { const w = { type, o: Object.assign({}, o) }; J.widgets.push(w); return w }
const ui = natif({ widget, show_level, data_type, align, createWidget })
globalThis.hmUI = ui
export default ui
