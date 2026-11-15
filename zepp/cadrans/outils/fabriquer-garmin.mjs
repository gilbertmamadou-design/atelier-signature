// Fabrique les projets Garmin Connect IQ (Fenix 6X Pro, Fenix 6S) à partir des réglages d'un cadran (même format que la T-Rex 3).
//   node outils/fabriquer-garmin.mjs <reglages.json>... --sortie <dossier>
// Pour chaque réglage : <sortie>/<id>/ (manifest.xml, monkey.jungle, source/, source-<montre>/Spec.mc, resources-<montre>/…)
// et <sortie>/<id>-<montre>.png (aperçu 64 couleurs). Le dessin vient de cadran.js (CADRAN.garmin), dans Chromium.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const ICI = dirname(fileURLToPath(import.meta.url)), RACINE = resolve(ICI, '..'), MODELE = join(RACINE, 'garmin')
const args = process.argv.slice(2)
const iS = args.indexOf('--sortie'), SORTIE = resolve(iS >= 0 ? args[iS + 1] : join(RACINE, 'travail-garmin'))
const fichiers = args.filter((a, i) => a !== '--sortie' && i !== iS + 1)
if (!fichiers.length) { console.error('usage : fabriquer-garmin.mjs reglages.json… --sortie dossier'); process.exit(2) }
export const MONTRES = { fenix6xpro: 280, fenix6s: 240 }

const idDe = (cfg) => (cfg.id && /^[a-z0-9-]{1,32}$/.test(cfg.id)) ? cfg.id
  : String(cfg.nom || 'perso').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'perso'
// valeur Monkey C littérale
function mc(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(mc).join(', ') + ']'
  return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ' => ' + mc(v[k])).join(', ') + '}'
}
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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
if (!await page.evaluate(() => document.fonts.check('20px "CadPetite"'))) { console.error('polices non chargées'); process.exit(1) }

const ecrire = (p, url) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, Buffer.from(url.split(',')[1], 'base64')) }
const liste = []
for (const f of fichiers) {
  const cfg0 = JSON.parse(readFileSync(f, 'utf8'))
  const id = idDe(cfg0), dos = join(SORTIE, id)
  const uuid = createHash('md5').update(String(cfg0.nom || id) + '|garmin').digest('hex')
  mkdirSync(dos, { recursive: true })
  cpSync(join(MODELE, 'source'), join(dos, 'source'), { recursive: true })
  cpSync(join(MODELE, 'resources'), join(dos, 'resources'), { recursive: true })
  let nom = ''
  const jungle = ['project.manifest = manifest.xml']
  for (const [dev, S] of Object.entries(MONTRES)) {
    const r = await page.evaluate(async ([cfg, S]) => {
      await CADRAN.chargerPhoto(cfg.photo)
      const G = CADRAN.garmin(cfg, S)
      // palette du fond : les 16 couleurs (de l'écran 64 couleurs) les plus présentes
      const fc = G.fond, d = fc.getContext('2d').getImageData(0, 0, S, S).data, n = {}
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const q = (v) => Math.round(v / 85) * 85, c = (q(d[i]) << 16) | (q(d[i + 1]) << 8) | q(d[i + 2]); n[c] = (n[c] || 0) + 1 }
      const pal = Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 16).map((c) => (+c).toString(16).padStart(6, '0'))
      if (!pal.includes('000000')) pal[Math.min(pal.length, 15)] = '000000'
      const polices = G.polices.map((p) => { const o = CADRAN.policeGarmin(p); return { png: o.png.toDataURL('image/png'), fnt: o.fnt } })
      const icones = G.icones.map((c) => c.toDataURL('image/png'))
      const ap = document.createElement('canvas'); ap.width = ap.height = S
      CADRAN.apercuGarmin(ap, cfg, S, { date: new Date(2026, 9, 30, 10, 9, 30) })
      return { fond: fc.toDataURL('image/png'), pal, ops: G.ops, polices, icones, meteo: G.meteo, nom: CADRAN.norm(cfg).nom, apercu: ap.toDataURL('image/png') }
    }, [cfg0, S])
    nom = r.nom
    const rd = join(dos, 'resources-' + dev), sd = join(dos, 'source-' + dev)
    ecrire(join(rd, 'fond.png'), r.fond)
    r.polices.forEach((p, i) => { ecrire(join(rd, 'f' + i + '.png'), p.png); writeFileSync(join(rd, 'f' + i + '.fnt'), p.fnt.replace('FICHIER', 'f' + i + '.png')) })
    r.icones.forEach((u, i) => ecrire(join(rd, 'i' + i + '.png'), u))
    writeFileSync(join(rd, 'cadran.xml'), ['<resources>', '  <drawables>',
      '    <bitmap id="Fond" filename="fond.png" dithering="floyd_steinberg"><palette disableTransparency="true">' + r.pal.map((c) => '<color>' + c.toUpperCase() + '</color>').join('') + '</palette></bitmap>',
      ...r.icones.map((_, i) => '    <bitmap id="I' + i + '" filename="i' + i + '.png"/>'), '  </drawables>',
      '  <fonts>', ...r.polices.map((_, i) => '    <font id="F' + i + '" filename="f' + i + '.fnt" antialias="true"/>'), '  </fonts>', '</resources>', ''].join('\n'))
    mkdirSync(sd, { recursive: true })
    writeFileSync(join(sd, 'Spec.mc'), ['// Fabriqué par outils/fabriquer-garmin.mjs (' + dev + ', ' + S + ' px)', 'import Toybox.Lang;', 'import Toybox.WatchUi;', '', 'module Spec {',
      '    function ops() { return ' + mc(r.ops) + '; }',
      '    function polices() { return [' + r.polices.map((_, i) => 'Rez.Fonts.F' + i).join(', ') + ']; }',
      '    function icones() { return [' + r.icones.map((_, i) => 'Rez.Drawables.I' + i).join(', ') + ']; }',
      '    function meteo() { return ' + mc(r.meteo) + '; }', '}', ''].join('\n'))
    jungle.push(dev + '.sourcePath = source;source-' + dev, dev + '.resourcePath = resources;resources-' + dev)
    ecrire(join(SORTIE, id + '-' + dev + '.png'), r.apercu)
  }
  writeFileSync(join(dos, 'monkey.jungle'), jungle.join('\n') + '\n')
  writeFileSync(join(dos, 'resources', 'nom.xml'), '<resources><strings><string id="AppName">' + xmlEsc(nom) + '</string></strings></resources>\n')
  writeFileSync(join(dos, 'manifest.xml'), `<?xml version="1.0"?>
<iq:manifest xmlns:iq="http://www.garmin.com/xml/connectiq" version="3">
    <iq:application id="${uuid}" type="watchface" name="@Strings.AppName" entry="AtelierApp" launcherIcon="@Drawables.LauncherIcon" minApiLevel="3.0.0">
        <iq:products>${Object.keys(MONTRES).map((d) => '<iq:product id="' + d + '"/>').join('')}</iq:products>
        <iq:permissions><iq:uses-permission id="SensorHistory"/></iq:permissions>
        <iq:languages><iq:language>fre</iq:language></iq:languages>
        <iq:barrels/>
    </iq:application>
</iq:manifest>
`)
  liste.push({ id, nom })
  console.log('cadran Garmin', id, '(' + nom + ')')
}
writeFileSync(join(SORTIE, 'liste.json'), JSON.stringify(liste, null, 2))
await navig.close()
