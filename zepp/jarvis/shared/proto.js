/*
 * Jarvis : Side Service (dans l'appli Zepp du téléphone) → Majordome (serveur local 127.0.0.1, jeton).
 * JavaScript pur, testé avec Node contre un faux Majordome et contre le vrai serveur Java (MajordomeBridge.Lien).
 *
 * env : { fetch(options) → { status, body }  (fetch du Side Service : url, method, headers, body seulement),
 *         get(clé), set(clé, valeur)       (settingsStorage des réglages de Jarvis dans l'appli Zepp),
 *         sleep(ms), now() }
 *
 * Réglages : jeton (copié depuis Majordome), port (47615 par défaut), hueSecours ('true' : si Majordome ne répond
 * pas, les lumières passent directement par le pont Hue, API v1 en http sur le réseau local), hueIp, hueKey.
 */
export const PORT = 47615
const ATTENTE_MAX = 45000      // la montre attend 60 s au plus une réponse du Side Service (zml)

export function normJeton(s) { return String(s == null ? '' : s).toUpperCase().replace(/[\s-]/g, '') }
export function ipPrivee(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim())
  if (!m) return false
  const o = m.slice(1).map(Number)
  if (o.some((x) => x > 255) || o[3] === 0 || o[3] === 255) return false
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Base64 sans Buffer ni btoa (absents du Side Service) */
export function base64(data) {
  const b = data instanceof Uint8Array ? data : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)
  let out = ''
  let i = 0
  for (; i + 2 < b.length; i += 3) { const v = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]; out += B64[v >> 18] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63] }
  if (i < b.length) { const v = (b[i] << 16) | ((i + 1 < b.length ? b[i + 1] : 0) << 8); out += B64[v >> 18] + B64[(v >> 12) & 63] + (i + 1 < b.length ? B64[(v >> 6) & 63] : '=') + '=' }
  return out
}

/** Audio de la montre : « JVA1 » + paquets Opus du Recorder ; null sinon */
export function audioDe(buf) {
  const b = buf instanceof Uint8Array ? buf : ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf)
  if (b.length < 20 || b[0] !== 0x4a || b[1] !== 0x56 || b[2] !== 0x41 || b[3] !== 0x31) return null
  return b.subarray(4)
}

const TEXTES = {
  jeton: 'Jeton refusé : recopiez le jeton de Majordome (Réglages › Montre connectée) dans Zepp › Jarvis › Réglages.',
  sansJeton: 'Jeton absent : recopiez-le depuis Majordome (Réglages › Montre connectée) dans Zepp › Jarvis › Réglages.',
  bloque: 'Trop de jetons refusés : Majordome attend une minute.',
  injoignable: 'Majordome ne répond pas : dans Majordome › Réglages, activez « Montre connectée ».',
  version: 'Majordome ne connaît pas cette demande : mettez Majordome à jour.',
  hote: 'Majordome a refusé la liaison (hôte).',
  http: 'Majordome a renvoyé une erreur.',
  attente: 'Majordome n\'a pas répondu à temps : ouvrez-le sur le téléphone.',
}

function lire(body) {
  if (body == null || body === '') return {}
  if (typeof body === 'object') return body
  try { return JSON.parse(body) } catch (e) { return { brut: String(body).slice(0, 200) } }
}

export function createClient(env) {
  const get = (k) => { const v = env.get(k); return v == null ? '' : String(v) }
  const cfg = () => {
    const p = parseInt(get('port'), 10)
    return { jeton: normJeton(get('jeton')), port: p >= 1024 && p <= 65535 ? p : PORT, hue: get('hueSecours') === 'true', hueIp: get('hueIp').trim(), hueKey: get('hueKey').trim() }
  }

  /** Une requête à Majordome ; rend { ok, data } ou { ok:false, erreur, texte } */
  async function appel(chemin, methode, corps) {
    const c = cfg()
    if (c.jeton.length < 16) return { ok: false, erreur: 'jeton', texte: TEXTES.sansJeton }
    let res
    try {
      const o = { url: 'http://127.0.0.1:' + c.port + chemin, method: methode, headers: { Authorization: 'Bearer ' + c.jeton, 'Content-Type': 'application/json' } }
      if (corps !== undefined) o.body = JSON.stringify(corps)
      res = await env.fetch(o)
    } catch (e) { return { ok: false, erreur: 'injoignable', texte: TEXTES.injoignable } }
    const st = res && (res.status || res.statusCode)
    const data = lire(res && res.body)
    if (!st) return { ok: false, erreur: 'injoignable', texte: TEXTES.injoignable }
    if (st === 200) return { ok: true, data }
    const e = st === 401 ? 'jeton' : st === 429 ? 'bloque' : st === 404 || st === 405 ? 'version' : st === 403 ? 'hote' : 'http'
    return { ok: false, erreur: e, code: st, texte: TEXTES[e] + (e === 'http' && data.erreur ? ' (' + data.erreur + ')' : '') }
  }

  /** Commande, routine, audio : si Majordome répond « attente », on redemande la « suite » jusqu'à 45 s */
  async function avecSuite(r0) {
    let r = r0
    const fin = env.now() + ATTENTE_MAX
    while (r.ok && r.data && r.data.attente) {
      if (env.now() > fin) return { ok: false, texte: TEXTES.attente }
      await env.sleep(400)
      const s = await appel('/commande', 'POST', { suite: r.data.attente })
      if (!s.ok) return s
      if (r.data.entendu && !s.data.entendu) s.data.entendu = r.data.entendu
      r = s
    }
    return r
  }
  const sortie = (r) => (r.ok ? Object.assign({ ok: true }, r.data) : { ok: false, erreur: r.erreur, texte: r.texte })

  // ---------- Secours : pont Hue en direct (API v1, http, réseau local), seulement si l'utilisateur l'a autorisé ----------
  async function hue(methode, chemin, corps) {
    const c = cfg()
    if (!c.hue) return { ok: false, texte: 'secours désactivé' }
    if (!ipPrivee(c.hueIp) || !/^[A-Za-z0-9-]{8,80}$/.test(c.hueKey)) return { ok: false, texte: 'Secours Hue : adresse ou clé du pont manquante (réglages de Jarvis).' }
    try {
      const o = { url: 'http://' + c.hueIp + '/api/' + c.hueKey + chemin, method: methode, headers: { 'Content-Type': 'application/json' } }
      if (corps !== undefined) o.body = JSON.stringify(corps)
      const res = await env.fetch(o)
      const d = lire(res && res.body)
      if (Array.isArray(d) && d[0] && d[0].error) return { ok: false, texte: 'Pont Hue : ' + (d[0].error.type === 1 ? 'clé refusée, jumelez à nouveau.' : d[0].error.description) }
      return { ok: (res && (res.status || res.statusCode)) === 200, data: d }
    } catch (e) { return { ok: false, texte: 'Le pont Hue ne répond pas.' } }
  }
  async function hueSecours(p) {
    if (p.action === 'tout_eteindre') {
      const r = await hue('PUT', '/groups/0/action', { on: false })
      return r.ok ? { ok: true, secours: true, texte: 'Lumières éteintes (pont Hue en direct).' } : { ok: false, texte: r.texte || 'Le pont Hue a refusé.' }
    }
    // une pièce : retrouvée par son nom (les identifiants de Majordome sont ceux de l'API v2)
    const g = await hue('GET', '/groups')
    if (!g.ok || !g.data || typeof g.data !== 'object') return { ok: false, texte: g.texte || 'Pièces du pont Hue illisibles.' }
    const nom = String(p.nom || '').toLowerCase().replace(/…$/, '')
    const id = Object.keys(g.data).find((k) => g.data[k] && g.data[k].type === 'Room' && String(g.data[k].name).toLowerCase().startsWith(nom))
    if (!nom || !id) return { ok: false, texte: 'Pièce « ' + (p.nom || '?') + ' » introuvable sur le pont Hue.' }
    const on = !(g.data[id].state && g.data[id].state.any_on)
    const r = await hue('PUT', '/groups/' + id + '/action', { on })
    return r.ok ? { ok: true, secours: true, texte: g.data[id].name + (on ? ' : allumée' : ' : éteinte') + ' (pont Hue en direct).' } : { ok: false, texte: r.texte || 'Le pont Hue a refusé.' }
  }

  // ---------- Demandes de la montre ----------
  async function handle(methode, p) {
    p = p || {}
    switch (methode) {
      case 'etat': {
        const r = await appel('/etat', 'GET')
        return r.ok ? Object.assign({ ok: true }, r.data) : { ok: false, erreur: r.erreur, texte: r.texte, secours: cfg().hue }
      }
      case 'commande': {
        const t = String(p.texte || '').trim().slice(0, 200)
        if (!t) return { ok: false, texte: 'Commande vide.' }
        return sortie(await avecSuite(await appel('/commande', 'POST', { texte: t })))
      }
      case 'routine': {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(p.id || ''))) return { ok: false, texte: 'Routine inconnue.' }
        return sortie(await avecSuite(await appel('/routine', 'POST', { id: p.id })))
      }
      case 'lumieres': {
        const corps = p.action === 'piece' ? { action: 'piece', id: String(p.id || '') } : { action: 'tout_eteindre' }
        const r = await appel('/lumieres', 'POST', corps)
        if (!r.ok && r.erreur === 'injoignable' && cfg().hue) return hueSecours(p)
        return sortie(r)
      }
      case 'clim': return sortie(await appel('/clim', 'POST', {}))
      default: return { ok: false, texte: 'Demande inconnue.' }
    }
  }
  async function audio(buf) {
    const a = audioDe(buf)
    if (!a) return { ok: false, texte: 'Enregistrement vide.' }
    return sortie(await avecSuite(await appel('/audio', 'POST', { opus: base64(a) })))
  }

  /** Réglages › « Jumeler le pont Hue » (secours) : une tentative, après l'appui sur le bouton du pont */
  async function huePair() {
    const ip = get('hueIp').trim()
    if (!ipPrivee(ip)) { env.set('huePairMsg', 'Adresse du pont invalide : il faut une adresse du réseau local (192.168.x.x…).'); return false }
    try {
      const res = await env.fetch({ url: 'http://' + ip + '/api', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ devicetype: 'jarvis#zepp' }) })
      const d = lire(res && res.body)
      const u = Array.isArray(d) && d[0] && d[0].success && d[0].success.username
      if (u && /^[A-Za-z0-9-]{8,80}$/.test(u)) { env.set('hueKey', u); env.set('huePairMsg', 'Pont Hue jumelé pour le secours.'); return true }
      const t = Array.isArray(d) && d[0] && d[0].error && d[0].error.type
      env.set('huePairMsg', t === 101 ? 'Appuyez d\'abord sur le bouton rond du pont, puis touchez « Jumeler » dans les 30 secondes.' : 'Le pont a refusé le jumelage.')
    } catch (e) { env.set('huePairMsg', 'Le pont Hue ne répond pas à cette adresse.') }
    return false
  }

  return { handle, audio, huePair, appel, cfg }
}
