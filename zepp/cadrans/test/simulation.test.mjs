// Simulation : charge le cadran fabriqué (CADRAN_PROJET=dossier d'un projet produit par outils/fabriquer.mjs)
// avec un Zepp OS factice, puis vérifie les widgets et l'existence de chaque image citée.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROJET = resolve(process.env.CADRAN_PROJET || '')
register('./zos-crochets.mjs', import.meta.url)
let def = null
globalThis.WatchFace = (o) => { def = o }
await import(pathToFileURL(join(PROJET, 'watchface/index.js')).href)
def.build()
const J = globalThis.__zos
const de = (t) => J.widgets.filter((w) => w.type === 'w:' + t)

test('chaque image citée existe', () => {
  const chemins = []
  for (const w of J.widgets) for (const v of Object.values(w.o)) {
    if (typeof v === 'string' && v.startsWith('images/')) chemins.push(v)
    if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && chemins.push(x))
  }
  assert.ok(chemins.length > 40, 'trop peu d\'images : ' + chemins.length)
  for (const c of chemins) assert.ok(existsSync(join(PROJET, 'assets/trex3', c)), 'manque ' + c)
})
test('fond, heure et AOD présents', () => {
  assert.ok(de('IMG').some((w) => w.o.src === 'images/fond.png' && w.o.show_level === 1))
  assert.ok(de('IMG').some((w) => w.o.src === 'images/fond_aod.png' && w.o.show_level === 2))
  const heures = de('IMG_TIME').length + de('TIME_POINTER').length
  assert.ok(heures >= 2, 'heure écran allumé + AOD')
  assert.ok(J.widgets.every((w) => !('aod' in w.o)), 'la clé interne « aod » ne doit pas partir vers la montre')
})
test('aiguilles : centre et pivots dans l\'image', () => {
  for (const w of de('TIME_POINTER')) {
    assert.ok(w.o.hour_centerX >= 0 && w.o.hour_centerX <= 480 && w.o.minute_centerY >= 0 && w.o.minute_centerY <= 480)
    assert.equal(w.o.hour_centerX, w.o.minute_centerX)
    assert.ok(w.o.hour_posY > 20 && w.o.minute_posY > w.o.hour_posY)
  }
})
test('données : chaque nombre a sa police complète', () => {
  for (const w of de('TEXT_IMG')) { assert.equal(w.o.font_array.length, 10); assert.ok(w.o.type >= 100) }
  for (const w of de('IMG_LEVEL')) assert.equal(w.o.image_array.length, w.o.image_length)
})
test('secondes : 10 chiffres si présentes', () => {
  for (const w of de('IMG_TIME')) if (w.o.second_array) { assert.equal(w.o.second_array.length, 10); assert.ok(w.o.second_startX > w.o.hour_startX) }
})
