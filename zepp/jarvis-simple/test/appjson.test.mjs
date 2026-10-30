// app.json conforme à l'exemple officiel zeppos-samples/watchface/3.0/timer (configVersion v3, appType watchface,
// module.watchface path/main/editable/lockscreen, runtime.apiVersion compatible/target/minVersion, designWidth),
// avec les codes T-Rex 3 de la mini-appli Jarvis (qui s'installe)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const lire = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)))
const A = lire('../app.json')
const MINI = lire('../../jarvis/app.json')
const GRAND = lire('../../jarvis-cadran/app.json')

test('en-tête de cadran', () => {
  assert.equal(A.configVersion, 'v3')
  assert.equal(A.app.appType, 'watchface')
  assert.equal(A.app.appName, 'Jarvis Simple')
  for (const k of ['appId', 'appName', 'appType', 'version', 'vender', 'description', 'icon']) assert.ok(k in A.app, k)
  assert.ok(Number.isInteger(A.app.appId))
  assert.notEqual(A.app.appId, MINI.app.appId); assert.notEqual(A.app.appId, GRAND.app.appId)
  assert.ok(Number.isInteger(A.app.version.code) && typeof A.app.version.name === 'string')
  assert.ok(existsSync(new URL('../assets/trex3/' + A.app.icon, import.meta.url)), 'icône')
  assert.deepEqual(A.permissions, [])
})

test('runtime.apiVersion : chaînes « x.y », minVersion ≤ target', () => {
  const v = A.runtime.apiVersion
  for (const k of ['compatible', 'target', 'minVersion']) assert.match(v[k], /^\d+\.\d+$/, k)
  assert.ok(parseFloat(v.minVersion) <= parseFloat(v.target))
  assert.deepEqual(v, MINI.runtime.apiVersion)
})

test('cible trex3 : module.watchface seul, plateformes de la mini-appli, designWidth 480', () => {
  assert.deepEqual(Object.keys(A.targets), ['trex3'])
  const t = A.targets.trex3
  assert.deepEqual(Object.keys(t.module), ['watchface'])
  const wf = t.module.watchface
  assert.equal(wf.main, 1); assert.equal(wf.editable, 0); assert.equal(wf.lockscreen, 0)
  assert.ok(existsSync(new URL('../' + wf.path + '.js', import.meta.url)), 'point d\'entrée ' + wf.path)
  assert.deepEqual(t.platforms, MINI.targets.trex3.platforms)
  assert.deepEqual(t.platforms.map((p) => p.deviceSource).sort(), [8716544, 8716545, 8716547])
  assert.equal(t.designWidth, 480)
  assert.ok(!('page' in t.module) && !('app-side' in t.module))
})

test('i18n et langue par défaut', () => {
  assert.equal(A.defaultLanguage, 'fr-FR')
  assert.equal(A.i18n['fr-FR'].appName, 'Jarvis Simple')
})

test('point d\'entrée : WatchFace({ build }), @zos/ui comme l\'exemple officiel, jamais de copie des constantes', () => {
  const src = readFileSync(new URL('../watchface/index.js', import.meta.url), 'utf8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.match(code, /WatchFace\(\{/); assert.doesNotMatch(code, /\bPage\(/)
  assert.match(code, /import ui from '@zos\/ui'/)
  assert.doesNotMatch(code, /Object\.assign\(\s*\{\}\s*,\s*[^)]*(widget|show_level|prop|align|data_type)/)
  assert.doesNotMatch(code, /\.\.\.\s*(ui|hmUI)\b/)
})
