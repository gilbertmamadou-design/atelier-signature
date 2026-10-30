// Textes français et disposition de « Jarvis Simple »
import test from 'node:test'
import assert from 'node:assert/strict'
import * as S from '../shared/simple.js'

test('heure 24 h sur deux chiffres', () => {
  assert.equal(S.texteHeure({ h: 9, m: 5 }), '09:05'); assert.equal(S.texteHeure({ h: 23, m: 59 }), '23:59')
})
test('date en français (jour de semaine 1 = lundi, mois 1 = janvier, « 1er »)', () => {
  assert.equal(S.texteDate({ jour: 30, mois: 10, semaine: 4 }), 'Jeudi 30 octobre')
  assert.equal(S.texteDate({ jour: 1, mois: 5, semaine: 5 }), 'Vendredi 1er mai')
  assert.equal(S.texteDate({ jour: 15, mois: 8, semaine: 7 }), 'Dimanche 15 août')
  assert.equal(S.texteDate({ jour: 3, mois: 2, semaine: 1 }), 'Lundi 3 février')
})
test('batterie', () => {
  assert.equal(S.texteBatterie(82), 'Batterie 82 %'); assert.equal(S.texteBatterie(undefined), 'Batterie --'); assert.equal(S.texteBatterie(-1), 'Batterie --')
})
test('lireHeure : capteur Time, sinon Date', () => {
  const t = S.lireHeure({ getHours: () => 7, getMinutes: () => 3, getDate: () => 9, getMonth: () => 12, getDay: () => 2 })
  assert.deepEqual(t, { h: 7, m: 3, jour: 9, mois: 12, semaine: 2 })
  const d = new Date(), u = S.lireHeure(null)
  assert.equal(u.mois, d.getMonth() + 1); assert.ok(u.semaine >= 1 && u.semaine <= 7)
  assert.ok(S.lireHeure({ getHours() { throw new Error('x') } }).h >= 0)
})
test('toutes les boîtes tiennent dans l\'écran rond', () => {
  for (const [k, b] of Object.entries(S.DISPOSITION)) {
    for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) assert.ok(Math.hypot(x - 240, y - 240) <= 240, k)
  }
})
