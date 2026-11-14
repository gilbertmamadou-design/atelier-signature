// Fabrique un ou plusieurs projets de cadran Zepp OS à partir de réglages (JSON).
//   node outils/fabriquer.mjs <reglages.json>... --sortie <dossier>
// Pour chaque réglage : <sortie>/<id>/ (projet prêt pour « zeus build » : app.json, app.js, watchface/, shared/style.js,
// assets/trex3/images/…) et <sortie>/<id>.png, <id>-aod.png (aperçus). Les images sont dessinées par cadran.js dans
// Chromium (Playwright) : exactement le même dessin que l'aperçu de l'appli « Atelier de cadrans ».
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url)), RACINE = resolve(ICI, '..')
const args = process.argv.slice(2)
const iS = args.indexOf('--sortie'), SORTIE = resolve(iS >= 0 ? args[iS + 1] : join(RACINE, 'travail'))
const fichiers = args.filter((a, i) => a !== '--sortie' && i !== iS + 1)
if (!fichiers.length) { console.error('usage : fabriquer.mjs reglages.json… --sortie dossier'); process.exit(2) }

/** appId : fixé dans les réglages (collection), sinon tiré du nom (même nom = même cadran, mis à jour) */
function appIdDe(cfg) {
  if (Number.isInteger(cfg.appId) && cfg.appId > 1000000) return cfg.appId
  let h = 0; for (const c of String(cfg.nom || 'cadran')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return 1093300 + (h % 600)
}
function idDe(cfg, f) {
  if (cfg.id && /^[a-z0-9-]{1,32}$/.test(cfg.id)) return cfg.id
  return String(cfg.nom || 'perso').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'perso'
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.otf': 'font/otf', '.ttf': 'font/ttf' }
const navig = await chromium.launch()
const page = await navig.newPage()
await page.route('http://cadrans.local/**', (r) => {
  const p = join(RACINE, decodeURIComponent(new URL(r.request().url()).pathname))
  if (!p.startsWith(RACINE) || !existsSync(p)) return r.fulfill({ status: 404, body: '' })
  r.fulfill({ status: 200, body: readFileSync(p), headers: { 'content-type': TYPES[extname(p)] || 'application/octet-stream' } })
})
await page.goto('http://cadrans.local/outils/page.html')
await page.evaluate(() => CADRAN.polices('../polices/'))
const ok = await page.evaluate(() => document.fonts.check('20px "CadPetite"'))
if (!ok) { console.error('polices non chargées'); process.exit(1) }

const liste = []
for (const f of fichiers) {
  const cfg = JSON.parse(readFileSync(f, 'utf8'))
  const id = idDe(cfg, f), appId = appIdDe(cfg), dos = join(SORTIE, id)
  const r = await page.evaluate((cfg) => {
    const p = CADRAN.paquet(cfg), images = {}
    for (const k of Object.keys(p.images)) images[k] = p.images[k].toDataURL('image/png')
    const shot = (aod, taille) => { const c = document.createElement('canvas'); c.width = c.height = taille; CADRAN.apercu(c, cfg, { aod, date: new Date(2026, 9, 30, 10, 9, 30) }); return c.toDataURL('image/png') }
    const spec = JSON.parse(JSON.stringify(p.spec)); delete spec.cfg; spec.w.forEach((w) => { delete w.ex })
    return { spec, cfg: p.spec.cfg, images, apercu: shot(false, 480), aod: shot(true, 480), icone: shot(false, 324) }
  }, cfg)
  mkdirSync(dos, { recursive: true })
  for (const d of ['watchface', 'app.js']) cpSync(join(RACINE, d), join(dos, d), { recursive: true })
  cpSync(join(RACINE, 'package.json'), join(dos, 'package.json'))
  mkdirSync(join(dos, 'shared'), { recursive: true })
  writeFileSync(join(dos, 'shared/style.js'), '// Fabriqué par outils/fabriquer.mjs à partir des réglages « ' + r.cfg.nom.replace(/\*\//g, '') + ' »\nexport const S = ' + JSON.stringify(r.spec) + '\n')
  const ecrire = (chemin, url) => { const p = join(dos, 'assets/trex3/images', chemin); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, Buffer.from(url.split(',')[1], 'base64')) }
  for (const k of Object.keys(r.images)) ecrire(k, r.images[k])
  ecrire('preview.png', r.icone)
  const app = JSON.parse(readFileSync(join(RACINE, 'modele-app.json'), 'utf8'))
  app.app.appId = appId; app.app.appName = r.cfg.nom; app.app.description = 'Cadran « ' + r.cfg.nom + ' » fabriqué avec l\'Atelier de cadrans'
  app.i18n['fr-FR'].appName = app.i18n['en-US'].appName = r.cfg.nom
  writeFileSync(join(dos, 'app.json'), JSON.stringify(app, null, 2))
  writeFileSync(join(SORTIE, id + '.png'), Buffer.from(r.apercu.split(',')[1], 'base64'))
  writeFileSync(join(SORTIE, id + '-aod.png'), Buffer.from(r.aod.split(',')[1], 'base64'))
  writeFileSync(join(SORTIE, id + '.json'), JSON.stringify(Object.assign({ id, appId }, r.cfg), null, 2))
  liste.push({ id, appId, nom: r.cfg.nom, images: Object.keys(r.images).length + 1 })
  console.log('cadran', id, 'appId', appId, '—', Object.keys(r.images).length + 1, 'images')
}
writeFileSync(join(SORTIE, 'liste.json'), JSON.stringify(liste, null, 2))
await navig.close()
