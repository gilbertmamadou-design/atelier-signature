// Images aux bons chemins et aux bonnes tailles (PNG lus sans dépendance : en-tête IHDR)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DISPOSITION as D } from '../shared/simple.js'

const IMG = new URL('../assets/trex3/images/', import.meta.url)
function taille(p) {
  const b = readFileSync(new URL(p, IMG))
  assert.equal(b.toString('latin1', 1, 4), 'PNG', p + ' : PNG attendu')
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] }
}

test('fond 480 × 480 avec transparence (la couleur du FILL_RECT reste visible)', () => {
  const t = taille('fond.png')
  assert.deepEqual([t.w, t.h], [480, 480]); assert.equal(t.type, 6, 'RGBA')
})

test('aperçu 324 × 324 (comme l\'exemple officiel)', () => {
  const t = taille('preview.png'); assert.deepEqual([t.w, t.h], [324, 324])
})

test('chiffres AOD : 0-9 et deux-points, hauteur commune, largeurs de la disposition', () => {
  const b = D.heureAod
  for (let i = 0; i < 10; i++) assert.deepEqual(Object.values(taille('aod/' + i + '.png')).slice(0, 2), [b.chiffre, b.h])
  assert.deepEqual(Object.values(taille('aod/dp.png')).slice(0, 2), [b.deuxPoints, b.h])
})

test('rien d\'autre dans le paquet que ce qui est utilisé', () => {
  assert.deepEqual(readdirSync(IMG).sort(), ['aod', 'fond.png', 'preview.png'])
  assert.equal(readdirSync(new URL('aod/', IMG)).length, 11)
})
