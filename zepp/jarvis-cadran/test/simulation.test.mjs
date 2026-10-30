// Simulation du cadran : watchface/index.js chargé avec un Zepp OS factice, puis contrôle des widgets créés
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as K from '../shared/cadran.js'

register('./zos-crochets.mjs', import.meta.url)
const ASSETS = fileURLToPath(new URL('../assets/trex3/', import.meta.url))
let def = null
globalThis.WatchFace = (o) => { def = o }
await import('../watchface/index.js')
globalThis.__zos.heure = 10
def.build()
const J = globalThis.__zos
const de = (t) => J.widgets.filter((w) => w.type === 'w:' + t)
const NORMAL = 1, AOD = 2

test('toutes les images citées existent', () => {
  const chemins = []
  for (const w of J.widgets) for (const [k, v] of Object.entries(w.o)) {
    if (typeof v === 'string' && v.startsWith('images/')) chemins.push(v)
    if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && chemins.push(x))
  }
  for (const w of de('IMG_ANIM')) for (let i = 0; i < w.o.anim_size; i++) chemins.push(w.o.anim_path + '/' + w.o.anim_prefix + '_' + i + '.png')
  assert.ok(chemins.length > 150)
  for (const c of chemins) assert.ok(existsSync(ASSETS + c), 'manque ' + c)
})

test('heure et date : une version écran allumé, une version AOD', () => {
  for (const t of ['IMG_TIME', 'IMG_WEEK', 'IMG_DATE']) {
    assert.deepEqual(de(t).map((w) => w.o.show_level).sort(), [NORMAL, AOD], t)
  }
  const d = de('IMG_DATE')[0].o
  assert.equal(d.day_en_array.length, 31); assert.equal(d.month_en_array.length, 12); assert.ok(d.day_is_character && d.month_is_character)
  assert.equal(de('IMG_WEEK')[0].o.week_en.length, 7)
})

test('AOD minimal : fond, heure, date, sphère fixe ; rien d\'animé', () => {
  const aod = J.widgets.filter((w) => w.o.show_level === AOD)
  assert.deepEqual(aod.map((w) => w.type).sort(), ['w:IMG', 'w:IMG', 'w:IMG_DATE', 'w:IMG_TIME', 'w:IMG_WEEK'])
  assert.ok(aod.some((w) => w.o.src === 'images/sphere_aod.png'))
  assert.equal(de('IMG_ANIM')[0].o.show_level, NORMAL)
})

test('sphère : animation bornée, relancée au retour, arrêtée en pause', () => {
  const a = de('IMG_ANIM')[0]
  assert.equal(a.o.repeat_count, K.ANIM.tours); assert.equal(a.o.anim_size, K.ANIM.images); assert.equal(a.o.anim_fps, K.ANIM.fps)
  const del = de('WIDGET_DELEGATE')[0].o
  del.pause_call(); assert.deepEqual(a.etats.slice(-1), [4])
  del.resume_call(); assert.deepEqual(a.etats.slice(-2), [4, 1])
})

test('toucher la sphère ouvre la mini-appli Jarvis', () => {
  const z = J.widgets.find((w) => w.o.src === 'images/zone/sphere.png')
  assert.ok(z && z.ecouteurs.up)
  z.ecouteurs.up()
  assert.deepEqual(J.lancements.at(-1), { appId: 1093117, url: 'page/index', native: false })
})

test('zones météo, cœur, pas, soleil, altitude : IMG_CLICK vers les applis système', () => {
  const types = de('IMG_CLICK').map((w) => w.o.type).sort()
  const dt = TYPES
  assert.deepEqual(types, ['WEATHER_CURRENT', 'HEART', 'STEP', 'SUN_RISE', 'ALTIMETER'].map((n) => dt[n]).sort())
  for (const w of de('IMG_CLICK')) assert.equal(w.o.show_level, NORMAL)
})
const TYPES = { BATTERY: 100, STEP: 101, HEART: 102, WEATHER_CURRENT: 103, WIND: 104, SUN_RISE: 105, SUN_SET: 106, ALTITUDE: 107, ALTIMETER: 108 }   // valeurs du Zepp OS factice (liste de la doc data_type : pas de WEATHER)

test('données système affichées : météo, vent, cœur, pas, batterie, soleil, altitude, pression', () => {
  const dt = TYPES
  const t = de('TEXT_IMG').map((w) => w.o.type).sort((a, b) => a - b)
  assert.deepEqual(t, [dt.WEATHER_CURRENT, dt.WIND, dt.HEART, dt.STEP, dt.BATTERY, dt.SUN_RISE, dt.SUN_SET, dt.ALTITUDE, dt.ALTIMETER].sort((a, b) => a - b))
  const lv = de('IMG_LEVEL').map((w) => [w.o.type, w.o.image_array.length]).sort()
  assert.deepEqual(lv, [[dt.BATTERY, 11], [dt.WEATHER_CURRENT, 29]].sort())
  for (const w of de('TEXT_IMG')) assert.equal(w.o.font_array.length, 10)
})

test('salutation changée à la minute selon l\'heure', () => {
  const s = J.widgets.find((w) => /salut\//.test(w.o.src || ''))
  assert.equal(s.o.src, 'images/salut/0.png')
  J.heure = 19; J.minutes.forEach((f) => f())
  assert.equal(s.o.src, 'images/salut/1.png')
  J.heure = 6; J.minutes.forEach((f) => f())
  assert.equal(s.o.src, 'images/salut/0.png')
})

test('micrologiciel sans data_type dans @zos/ui : repli clé par clé sur hmUI, aucun plantage', async () => {
  J.opts = { sansDataType: true }
  const avant = J.widgets.length
  let d2 = null
  globalThis.WatchFace = (o) => { d2 = o }
  await import('../watchface/index.js?repli')
  d2.build()
  const nouveaux = J.widgets.slice(avant)
  assert.equal(nouveaux.filter((w) => w.type === 'w:IMG_CLICK').length, 5)
  assert.equal(nouveaux.filter((w) => w.type === 'w:TEXT_IMG').length, 9)
  J.opts = {}
})

test('widget inconnu du micrologiciel : ignoré, le reste du cadran est créé', async () => {
  J.opts = { inconnus: ['IMG_ANIM'] }
  const avant = J.widgets.length
  let d3 = null
  globalThis.WatchFace = (o) => { d3 = o }
  await import('../watchface/index.js?sans-anim')
  d3.build()
  const nouveaux = J.widgets.slice(avant)
  assert.equal(nouveaux.filter((w) => w.type === 'w:IMG_ANIM').length, 0)
  assert.ok(nouveaux.some((w) => w.type === 'w:IMG_TIME'))
  nouveaux.find((w) => w.type === 'w:WIDGET_DELEGATE').o.resume_call()   // sans sphère : pas d'erreur
  J.opts = {}
})

test('constantes natives non énumérables (comme sur la montre) : le cadran n\'est jamais vide (écran noir de la 1.0.0)', () => {
  assert.equal(Object.keys(Object.assign({}, globalThis.hmUI.widget)).length, 0, 'le factice imite bien la montre')
  assert.ok(J.widgets.length > 25)
})

test('sans IMG_TIME ni images (micrologiciel ou fichiers en panne) : base noire et heure en TEXT, écran allumé et AOD', async () => {
  J.opts = { inconnus: ['IMG_TIME', 'IMG'] }; J.heure = 10
  const avant = J.widgets.length
  let d4 = null
  globalThis.WatchFace = (o) => { d4 = o }
  await import('../watchface/index.js?sans-images')
  assert.doesNotThrow(() => d4.build())
  const nouveaux = J.widgets.slice(avant)
  assert.equal(nouveaux[0].type, 'w:FILL_RECT')
  const t = nouveaux.filter((w) => w.type === 'w:TEXT')
  assert.deepEqual(t.map((w) => w.o.show_level), [NORMAL, AOD])
  assert.equal(t[0].o.text, '10:00')
  J.heure = 13; J.minutes.at(-1)()
  assert.equal(t[0].o.text, '13:00'); assert.equal(t[1].o.text, '13:00')
  J.heure = 10; J.opts = {}
})
