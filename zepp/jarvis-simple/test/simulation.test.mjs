// « Jarvis Simple » chargé avec un Zepp OS simulé (constantes non énumérables, comme sur la montre) : build() ne lève
// jamais d'exception, la preuve de vie (FILL_RECT puis TEXT) vient avant toute image, et un bloc en panne n'arrête pas les autres
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

register('./zos-crochets.mjs', import.meta.url)
const ASSETS = fileURLToPath(new URL('../assets/trex3/', import.meta.url))
let n = 0
async function lancer(opts) {
  await import('./zos-factice.mjs?m=ui')
  const J = globalThis.__zos
  J.widgets = []; J.minutes = []; J.batterie = []; J.opts = opts || {}
  J.heure = { h: 9, m: 5, jour: 1, mois: 5, semaine: 5 }; J.niveau = 82
  let def = null
  globalThis.WatchFace = (o) => { def = o }
  await import('../watchface/index.js?s=' + (++n))
  assert.ok(def && typeof def.build === 'function', 'WatchFace({ build }) attendu')
  assert.doesNotThrow(() => { def.onInit && def.onInit(); def.build() })
  const de = (t) => J.widgets.filter((w) => w.type === 'w:' + t)
  return { J, def, de, textes: de('TEXT').map((w) => w.o.text) }
}
const NORMAL = 1, AOD = 2

test('cas normal : preuve de vie d\'abord, puis fond, heure, date, batterie ; AOD noir avec heure', async () => {
  const { J, de, textes } = await lancer()
  assert.equal(J.widgets[0].type, 'w:FILL_RECT'); assert.equal(J.widgets[0].o.show_level, NORMAL)
  assert.equal(J.widgets[1].type, 'w:TEXT'); assert.equal(J.widgets[1].o.text, 'JARVIS')
  const premiereImage = J.widgets.findIndex((w) => /IMG/.test(w.type))
  assert.ok(premiereImage > 1, 'aucune image avant la preuve de vie')
  assert.equal(de('IMG')[0].o.src, 'images/fond.png')
  assert.deepEqual(textes.slice(0, 4), ['JARVIS', '09:05', 'Vendredi 1er mai', 'Batterie 82 %'])
  const aod = J.widgets.filter((w) => w.o.show_level === AOD)
  assert.deepEqual(aod.map((w) => w.type), ['w:FILL_RECT', 'w:IMG_TIME'])
  assert.equal(aod[0].o.color, 0)
  assert.ok(!J.widgets.some((w) => w.type === 'w:IMG_ANIM'), 'pas d\'animation')
  for (const w of J.widgets) if (w.type !== 'w:WIDGET_DELEGATE') assert.ok([NORMAL, AOD].includes(w.o.show_level), w.type + ' sans show_level')
})

test('mises à jour : minute, batterie, retour sur le cadran', async () => {
  const { J, de } = await lancer()
  assert.equal(J.minutes.length, 1); assert.equal(J.batterie.length, 1)
  J.heure = { h: 21, m: 47, jour: 30, mois: 10, semaine: 4 }; J.minutes[0]()
  assert.equal(de('TEXT')[1].o.text, '21:47'); assert.equal(de('TEXT')[2].o.text, 'Jeudi 30 octobre')
  J.niveau = 7; J.batterie[0]()
  assert.equal(de('TEXT')[3].o.text, 'Batterie 7 %')
  J.heure = { h: 6, m: 0, jour: 2, mois: 1, semaine: 7 }; J.niveau = 55
  de('WIDGET_DELEGATE')[0].o.resume_call()
  assert.equal(de('TEXT')[1].o.text, '06:00'); assert.equal(de('TEXT')[2].o.text, 'Dimanche 2 janvier'); assert.equal(de('TEXT')[3].o.text, 'Batterie 55 %')
})

test('images en panne : couleur, textes et heure AOD (TEXT) restent', async () => {
  const { J, de, textes } = await lancer({ echecImg: true })
  assert.equal(de('IMG').length, 0)
  assert.equal(J.widgets[0].type, 'w:FILL_RECT')
  assert.deepEqual(textes.slice(0, 4), ['JARVIS', '09:05', 'Vendredi 1er mai', 'Batterie 82 %'])
  const aodTexte = de('TEXT').find((w) => w.o.show_level === AOD)
  assert.ok(aodTexte, 'heure AOD de secours en TEXT'); assert.equal(aodTexte.o.text, '09:05')
  J.heure = { h: 10, m: 1, jour: 1, mois: 5, semaine: 5 }; J.minutes[0]()
  assert.equal(aodTexte.o.text, '10:01')
})

test('capteurs en panne : heure par Date, batterie « -- », rien ne casse', async () => {
  const { J, textes } = await lancer({ echecCapteurs: true })
  assert.equal(J.minutes.length, 0)
  assert.match(textes[1], /^\d\d:\d\d$/)
  assert.match(textes[2], /^[A-Z][a-z]+ (1er|\d+) [a-zéû]+$/)
  assert.equal(textes[3], 'Batterie --')
})

test('seul le global hmUI existe : le cadran s\'affiche quand même', async () => {
  const { J, textes } = await lancer({ sansUi: true })
  assert.equal(J.widgets[0].type, 'w:FILL_RECT'); assert.equal(textes[0], 'JARVIS')
})

test('widgets inconnus de ce micrologiciel (FILL_RECT, IMG_TIME, WIDGET_DELEGATE) : ignorés sans arrêt', async () => {
  const { J, textes } = await lancer({ inconnus: ['FILL_RECT', 'IMG_TIME', 'WIDGET_DELEGATE'] })
  assert.equal(J.widgets[0].type, 'w:TEXT')
  assert.deepEqual(textes.slice(0, 4), ['JARVIS', '09:05', 'Vendredi 1er mai', 'Batterie 82 %'])
  assert.ok(J.widgets.some((w) => w.type === 'w:TEXT' && w.o.show_level === AOD))
})

test('toutes les images citées existent', async () => {
  const { J } = await lancer()
  const chemins = []
  for (const w of J.widgets) for (const v of Object.values(w.o)) {
    if (typeof v === 'string' && v.startsWith('images/')) chemins.push(v)
    if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && chemins.push(x))
  }
  assert.ok(chemins.length >= 12)
  for (const c of chemins) assert.ok(existsSync(ASSETS + c), 'manque ' + c)
})
