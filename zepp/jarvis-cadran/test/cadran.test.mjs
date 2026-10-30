// Essais de la logique du cadran (sans montre) : node --test test/
import test from 'node:test'
import assert from 'node:assert/strict'
import * as K from '../shared/cadran.js'

const D = K.DISPOSITION

test('date en français, lundi en premier (ordre de IMG_WEEK)', () => {
  assert.equal(K.dateFr(new Date(2026, 9, 30)), 'VENDREDI 30 OCTOBRE')
  assert.equal(K.dateFr(new Date(2026, 4, 1)), 'VENDREDI 1ER MAI')
  assert.equal(K.dateFr(new Date(2026, 7, 2)), 'DIMANCHE 2 AOÛT')
  assert.equal(K.dateFr(new Date(2026, 1, 9)), 'LUNDI 9 FÉVRIER')
  assert.equal(K.dateFr(new Date(2026, 11, 31)), 'JEUDI 31 DÉCEMBRE')
  assert.equal(K.indexSemaine(new Date(2026, 10, 2)), 0)   // lundi 2 novembre 2026
  assert.equal(K.indexSemaine(new Date(2026, 10, 8)), 6)   // dimanche
  assert.equal(K.JOURS.length, 7); assert.equal(K.MOIS.length, 12)
  for (let j = 1; j <= 31; j++) assert.equal(K.jourTexte(j), j === 1 ? '1ER' : String(j))
})

test('heure sur 24 h, deux chiffres', () => {
  assert.equal(K.heureFr(new Date(2026, 0, 1, 7, 5)), '07:05')
  assert.equal(K.heureFr(new Date(2026, 0, 1, 0, 0)), '00:00')
  assert.equal(K.heureFr(new Date(2026, 0, 1, 23, 59)), '23:59')
})

test('salutation : Bonjour de 5 h à 18 h, Bonsoir sinon (comme Socle)', () => {
  const s = (h) => K.SALUTS[K.salutation(h)]
  assert.equal(s(4), 'Bonsoir'); assert.equal(s(5), 'Bonjour'); assert.equal(s(12), 'Bonjour')
  assert.equal(s(17), 'Bonjour'); assert.equal(s(18), 'Bonsoir'); assert.equal(s(23), 'Bonsoir'); assert.equal(s(0), 'Bonsoir')
})

test('tout tient dans l\'écran rond (marge de 6 px)', () => {
  for (const b of K.blocs()) assert.ok(K.dansCercle(b, 6), b.id + ' sort du cercle')
  for (const [n, z] of Object.entries(D.zones)) assert.ok(K.dansCercle(z, 2), 'zone ' + n + ' sort du cercle')
})

test('aucun chevauchement entre blocs affichés', () => {
  const b = K.blocs().filter((x) => x.id !== 'titre')
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    assert.ok(!K.chevauche(b[i], b[j]), b[i].id + ' chevauche ' + b[j].id)
  }
})

test('zones tactiles : distinctes et assez grandes', () => {
  const z = Object.entries(D.zones)
  for (let i = 0; i < z.length; i++) for (let j = i + 1; j < z.length; j++) assert.ok(!K.chevauche(z[i][1], z[j][1]), z[i][0] + ' / ' + z[j][0])
  for (const [n, b] of z) { assert.ok(b.h >= 30 && b.w >= 120, n + ' trop petite') }
  assert.ok(D.zones.sphere.w >= 120 && D.zones.sphere.h >= 120)
  assert.deepEqual(D.zones.sphere, Object.assign({}, D.sphere, { ouvre: 'jarvis' }))
})

test('heure centrée, sphère au centre de l\'écran à 30 px près', () => {
  const h = D.heure
  assert.equal(h.w, 4 * h.chiffre + h.deuxPoints)
  assert.ok(Math.abs(h.x + h.w / 2 - 240) <= 1)
  const s = D.sphere
  assert.ok(Math.hypot(s.x + s.w / 2 - 240, s.y + s.h / 2 - 240) <= 32)
})

test('animation : 12 à 24 images, quelques secondes seulement par réveil', () => {
  assert.ok(K.ANIM.images >= 12 && K.ANIM.images <= 24)
  assert.ok(K.dureeAnimation() <= 8)
  assert.equal(K.METEO.length, 29)
})
