/* Majordome sur PC (Suite MAG.exe) : lumières Philips Hue et volets Somfy TaHoma, comme sur le téléphone.
   Portage de applis/scripts/MajordomeBridge.java (classes Hue et Somfy) : mêmes règles, mêmes événements pour la page.
   - Une page web ne peut pas joindre ces boîtiers (certificats auto-signés, réseau local bloqué par le navigateur) :
     c'est le programme qui leur parle, la page (mj-maison.js, mj-somfy.js) lui passe les demandes.
   - Réseau : seulement des adresses IPv4 privées (10/8, 172.16/12, 192.168/16).
   - Hue : jumelage par le bouton du pont ; certificat du pont épinglé au jumelage (empreinte SHA-256) ; clé gardée par
     le programme (userData/hue.json, chiffrée par Windows), jamais renvoyée à la page. Seules les ressources des lumières.
   - TaHoma : API locale du mode développeur, certificat signé par l'autorité Overkiz et portant le code PIN du boîtier ;
     jeton chiffré par Windows (userData/somfy.json). Seules requêtes : GET /apiVersion, GET /setup/devices, POST /exec/apply.
   - Découverte : mDNS (_hue._tcp, _kizboxdev._tcp) ; pour Hue, sur demande, discovery.meethue.com.
   - Actions programmées (« éteins le salon dans 10 minutes », programmes des lumières et des volets) : gardées par le
     programme (userData/maison-alarmes.json) et exécutées tant que Suite MAG.exe tourne, puis reprogrammées si elles se répètent.
   Événements vers les pages : canal « maison-ev » (type 'hue' | 'somfy', JSON identique à celui d'Android). */
const path = require('path');
const fs = require('fs');
const tls = require('tls');
const net = require('net');
const crypto = require('crypto');
const dgram = require('dgram');

const SOMFY_CA = `-----BEGIN CERTIFICATE-----
MIIDPDCCAiSgAwIBAgIJAOvswclbF4QnMA0GCSqGSIb3DQEBCwUAMEsxEDAOBgNV
BAoTB092ZXJraXoxEDAOBgNVBAsTB1Jvb3QgQ0ExGDAWBgNVBAMTD092ZXJraXog
Um9vdCBDQTELMAkGA1UEBhMCRlIwHhcNMTYwNDI3MTI1ODE1WhcNMzYwNDI3MTI1
ODE1WjBLMRAwDgYDVQQKEwdPdmVya2l6MRAwDgYDVQQLEwdSb290IENBMRgwFgYD
VQQDEw9PdmVya2l6IFJvb3QgQ0ExCzAJBgNVBAYTAkZSMIIBIjANBgkqhkiG9w0B
AQEFAAOCAQ8AMIIBCgKCAQEAsszRfbcNCEoD9ZfzTbXfuMK8CrXGqBR/ZOCk4guN
aRKqZ/rLQm3V6Q+dlJ/8qle5J3KN5bZmqT4qXKHwJsaOiLfPyAptSM6vuIlls2N+
UsKkv3m5+gTyLaSGMS4wh2GoOCa21V9t5wYUQnoFaQByVNyl+kkrWLpKw5gQasU0
xkVsjAVKgkkb3puBl7sZgiSoz97I9U9JUkg3spH0I84CZRI+JejioDHvkZEyf83j
+QFxSTV/hZkUwUY/X0zt2dTZuliCTePeCdANryo6+9TbBp98j/SB1s59FcO8NSSK
sV07rTFlM9/soko2/J0aTtXHE86wFq7vfFVZzZxsQpIBbwIDAQABoyMwITAPBgNV
HRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjANBgkqhkiG9w0BAQsFAAOCAQEA
GU7xUWlZZEVnEK0k3Z1FoRl9xA7cLOiDVCQ5qQDFfQgGpMtXv1PKsQNZ6T6tZN3d
bdzsqcQXtLhXknz6aGBZNR4g6liQhVuCaiyURaI+LM2KuSZnbixs3+1SPBvxHrJh
/gOsxctxq+0DALnOK9qbGl6N5DtjM/EC5Qve71c+UVTEcJjJ3L2S1Ne+PxDOJuUC
JsOLUk96G+uLn6CQB5Wu8fYrkWAjF3yrxkCoZCqOvVrnbL77vXmz2mlqNHSJt3Ur
ndWJLVvrRFKdSG6WiNCh/Q+ARQAorN60JD9x8+IyXRGvlZl7KVeRduE2rjZuom7h
QLMnmaF+oFW5mnhh9gu6Gg==
-----END CERTIFICATE-----
`;
const SOMFY_BASE = '/enduser-mobile-web/1/enduserAPI';
const DEVICETYPE = 'majordome#pc';

/* ---------------- règles (comme MajordomeBridge.java) ---------------- */
const T = { loopback: false };   // banc d'essai seulement : autorise 127.0.0.1
function privateIp(ip) {
  if (typeof ip !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return false;
  const p = ip.split('.'); const o = [];
  for (let i = 0; i < 4; i++) { if (p[i].length > 1 && p[i][0] === '0') return false; o[i] = +p[i]; if (o[i] > 255) return false; }
  if (T.loopback && ip === '127.0.0.1') return true;
  if (o[3] === 0 || o[3] === 255) return false;
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
}
const okPath = (p) => typeof p === 'string' && p.length <= 200 && /^\/[A-Za-z0-9/_\-]*$/.test(p) && !p.includes('//');
const okKey = (k) => typeof k === 'string' && /^[A-Za-z0-9\-]{8,80}$/.test(k);
const okPin = (p) => typeof p === 'string' && /^\d{4}-\d{4}-\d{4}$/.test(p);
const okToken = (t) => typeof t === 'string' && /^[A-Za-z0-9._~+/=\-]{8,512}$/.test(t);
const okPort = (p) => Number.isInteger(p) && p >= 1 && p <= 65535;
const okSomfyReq = (m, p) => (m === 'GET' && (p === '/apiVersion' || p === '/setup/devices')) || (m === 'POST' && p === '/exec/apply');
const str = (json, key) => { const m = new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"').exec(json || ''); return m ? m[1] : null; };
const num = (json, key) => { const m = new RegExp('"' + key + '"\\s*:\\s*(\\d+)').exec(json || ''); return m ? m[1] : null; };
class Err extends Error { constructor(code, msg) { super(msg || code); this.code = code; } }

/* ---------------- HTTP/1.1 minimal sur une socket (en clair ou TLS) ---------------- */
function parse(buf) {
  const i = buf.indexOf('\r\n\r\n'); if (i < 0) throw new Err('unreachable', 'réponse invalide');
  const head = buf.slice(0, i).toString('utf8').split('\r\n'); const st = head.shift();
  if (!/^HTTP\/1\./.test(st)) throw new Err('unreachable', 'réponse invalide');
  const r = { code: parseInt(st.split(' ')[1], 10) || 0, body: '' };
  const h = {}; head.forEach((l) => { const k = l.indexOf(':'); if (k > 0) h[l.slice(0, k).trim().toLowerCase()] = l.slice(k + 1).trim(); });
  let b = buf.slice(i + 4);
  if (/chunked/i.test(h['transfer-encoding'] || '')) {
    const out = []; let p = 0;
    for (;;) {
      const e = b.indexOf('\r\n', p); if (e < 0) break;
      const n = parseInt(b.slice(p, e).toString().split(';')[0].trim(), 16); if (!n) break;
      out.push(b.slice(e + 2, e + 2 + n)); p = e + 2 + n + 2;
    }
    b = Buffer.concat(out);
  } else if (h['content-length']) b = b.slice(0, parseInt(h['content-length'], 10));
  r.body = b.toString('utf8');
  return r;
}
/** o : { ip, port, tls, pin (empreinte attendue), tofu, somfyPin, method, path, host, headers, body, timeout } */
function http(o) {
  return new Promise((res, rej) => {
    if (!privateIp(o.ip)) return rej(new Err('notprivate'));
    const body = o.body == null ? null : Buffer.from(String(o.body), 'utf8');
    let done = false, sock = null, seen = null, cn = null; const chunks = []; let size = 0;
    const fin = (e, r) => { if (done) return; done = true; clearTimeout(tm); try { sock && sock.destroy(); } catch (x) { } e ? rej(e) : res(r); };
    const tm = setTimeout(() => fin(new Err('unreachable', 'délai dépassé')), o.timeout || 6000);
    const send = () => {
      let h = o.method + ' ' + o.path + ' HTTP/1.1\r\nHost: ' + (o.host || o.ip) + '\r\nConnection: close\r\nAccept: application/json\r\nUser-Agent: Majordome\r\n';
      Object.keys(o.headers || {}).forEach((k) => { h += k + ': ' + o.headers[k] + '\r\n'; });
      if (body) h += 'Content-Type: application/json\r\nContent-Length: ' + body.length + '\r\n';
      sock.write(h + '\r\n'); if (body) sock.write(body);
    };
    const onData = (d) => { chunks.push(d); size += d.length; if (size > 4 << 20) fin(new Err('unreachable', 'réponse trop grande')); };
    const onEnd = () => { try { const r = parse(Buffer.concat(chunks)); r.fp = seen; r.cn = cn; fin(null, r); } catch (e) { fin(e); } };
    const onErr = (e) => fin(e instanceof Err ? e : new Err(e && e.code === 'ECONNREFUSED' ? 'refused' : 'unreachable', e && e.message));
    if (!o.tls) {
      sock = net.connect({ host: o.ip, port: o.port }, send);
    } else if (o.somfyPin) {
      // TaHoma : autorité Overkiz seulement, et le certificat doit nommer le code PIN du boîtier
      sock = tls.connect({
        host: o.ip, port: o.port, servername: 'gateway-' + o.somfyPin + '.local', ca: [SOMFY_CA], rejectUnauthorized: true,
        checkServerIdentity: (h, cert) => {
          const n = (String(cert.subject && cert.subject.CN || '') + ' ' + String(cert.subjectaltname || '')).toLowerCase();
          return n.includes(o.somfyPin.toLowerCase()) ? undefined : new Err('certname');
        }
      }, send);
      sock.on('error', (e) => { if (e && e.code === 'certname') return fin(new Err('certname')); if (/certificate|self.signed|unable to verify|CERT/i.test(String(e && (e.code || e.message)))) return fin(new Err('cert')); });
    } else {
      // Hue : certificat accepté seulement s'il a l'empreinte notée au jumelage (tofu : jumelage, empreinte notée)
      sock = tls.connect({ host: o.ip, port: o.port, rejectUnauthorized: false }, () => {
        const c = sock.getPeerCertificate(false);
        seen = c && c.raw ? crypto.createHash('sha256').update(c.raw).digest('hex') : null;
        cn = c && c.subject ? c.subject.CN || null : null;
        if (!seen) return fin(new Err('cert'));
        if (!o.tofu && (!o.pin || o.pin.toLowerCase() !== seen)) return fin(new Err('cert'));
        send();
      });
    }
    sock.on('data', onData); sock.on('end', onEnd); sock.on('close', () => { if (!done && chunks.length) onEnd(); else if (!done) fin(new Err('unreachable')); }); sock.on('error', onErr);
  });
}

/* ---------------- Hue ---------------- */
function hueHttp(ip, useTls, pin, tofu, method, p, key, body, timeout) {
  if (!okPath(p)) return Promise.reject(new Err('path'));
  if (!['GET', 'PUT', 'POST'].includes(method)) return Promise.reject(new Err('method'));
  if (useTls && !pin && !tofu) return Promise.reject(new Err('cert'));
  if (key != null && !okKey(key)) return Promise.reject(new Err('key'));
  if (body != null && (body.length > 8192 || !String(body).trim().startsWith('{'))) return Promise.reject(new Err('body'));
  return http({ ip, port: useTls ? (T.huePort || 443) : (T.huePortHttp || 80), tls: useTls, pin, tofu, method, path: p, headers: key ? { 'hue-application-key': key } : {}, body, timeout });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function huePair(ip, stop, left) {
  if (!privateIp(ip)) return { err: 'notprivate' };
  let useTls = true, fp = null, cfg = null;
  try { cfg = await hueHttp(ip, true, null, true, 'GET', '/api/config', null, null, 4000); fp = cfg.fp; }
  catch (e) { if (e.code === 'refused') useTls = false; else return { err: e.code === 'cert' ? 'cert' : 'unreachable', msg: e.message }; }
  if (!useTls) { try { cfg = await hueHttp(ip, false, null, false, 'GET', '/api/config', null, null, 4000); } catch (e) { return { err: 'unreachable', msg: e.message }; } }
  if (cfg.code !== 200 || (!cfg.body.includes('"bridgeid"') && !cfg.body.includes('"swversion"'))) return { err: 'notbridge' };
  const res = { bridgeId: str(cfg.body, 'bridgeid'), name: str(cfg.body, 'name'), model: str(cfg.body, 'modelid'), sw: str(cfg.body, 'swversion') };
  if (useTls && cfg.cn && /^[0-9A-Fa-f]{16}$/.test(cfg.cn) && res.bridgeId && cfg.cn.toLowerCase() !== res.bridgeId.toLowerCase()) return { err: 'certid' };
  const end = Date.now() + 30000, bodyPair = JSON.stringify({ devicetype: DEVICETYPE, generateclientkey: true });
  for (;;) {
    if (stop.v) return { err: 'cancel' };
    let r;
    try { r = await hueHttp(ip, useTls, fp, false, 'POST', '/api', null, bodyPair, 5000); } catch (e) { return { err: e.code || 'unreachable', msg: e.message }; }
    const u = str(r.body, 'username');
    if (u) {
      if (!okKey(u)) return { err: 'notbridge' };
      Object.assign(res, { user: u, clientkey: str(r.body, 'clientkey'), tls: useTls, fp: useTls ? fp : null });
      res.api = 'v1';
      if (useTls) { res.api = 'v1s'; try { const d = await hueHttp(ip, true, fp, false, 'GET', '/clip/v2/resource/bridge', u, null, 5000); if (d.code === 200 && d.body.includes('"data"')) res.api = 'v2'; } catch (e) { } }
      return res;
    }
    if (num(r.body, 'type') !== '101') return { err: 'bridge', msg: str(r.body, 'description') };
    const l = end - Date.now(); if (l <= 0) return { err: 'timeout' };
    left(Math.ceil(l / 1000));
    await sleep(Math.min(1500, l));
  }
}

/* ---------------- mDNS minimal (requête PTR, réponses PTR/SRV/TXT/A) ---------------- */
function mdns(service, ms) {
  return new Promise((resolve) => {
    const found = new Map(); let sock;
    const name = service + '.local';
    function qname(n) { return Buffer.concat(n.split('.').filter(Boolean).map((l) => Buffer.concat([Buffer.from([Buffer.byteLength(l)]), Buffer.from(l)])).concat([Buffer.from([0])])); }
    function readName(b, o) {
      const parts = []; let jumped = false, end = o, guard = 0;
      while (guard++ < 64) {
        const l = b[o]; if (l === undefined) break;
        if (l === 0) { o++; break; }
        if ((l & 0xc0) === 0xc0) { if (!jumped) end = o + 2; o = ((l & 0x3f) << 8) | b[o + 1]; jumped = true; continue; }
        parts.push(b.slice(o + 1, o + 1 + l).toString('utf8')); o += 1 + l;
      }
      return { name: parts.join('.'), next: jumped ? end : o };
    }
    function onMsg(b) {
      try {
        const qd = b.readUInt16BE(4), an = b.readUInt16BE(6) + b.readUInt16BE(8) + b.readUInt16BE(10); let o = 12;
        for (let i = 0; i < qd; i++) { o = readName(b, o).next + 4; }
        const recs = [];
        for (let i = 0; i < an; i++) {
          const n = readName(b, o); o = n.next; const type = b.readUInt16BE(o), len = b.readUInt16BE(o + 8); const d = o + 10; o = d + len;
          recs.push({ name: n.name.toLowerCase(), type, d, len });
        }
        const inst = recs.filter((r) => r.type === 12 && r.name === name.toLowerCase()).map((r) => readName(b, r.d).name);
        const hosts = {}, ips = {};
        recs.forEach((r) => {
          if (r.type === 1 && r.len === 4) ips[r.name] = [b[r.d], b[r.d + 1], b[r.d + 2], b[r.d + 3]].join('.');
        });
        inst.forEach((i) => {
          const li = i.toLowerCase(); const it = found.get(li) || { name: i.split('.')[0], txt: {} };
          recs.filter((r) => r.name === li).forEach((r) => {
            if (r.type === 33) { it.port = b.readUInt16BE(r.d + 4); it.host = readName(b, r.d + 6).name.toLowerCase(); }
            if (r.type === 16) { let p = r.d; while (p < r.d + r.len) { const l = b[p]; const s = b.slice(p + 1, p + 1 + l).toString('utf8'); const k = s.indexOf('='); if (k > 0) it.txt[s.slice(0, k).toLowerCase()] = s.slice(k + 1); p += 1 + l; } }
          });
          if (it.host && ips[it.host]) it.ip = ips[it.host];
          if (!it.ip) { const a = recs.find((r) => r.type === 1 && r.len === 4); if (a && !it.host) it.ip = ips[a.name]; }
          found.set(li, it); hosts[li] = it.host;
        });
        // adresse arrivée dans un autre paquet
        found.forEach((it) => { if (!it.ip && it.host && ips[it.host]) it.ip = ips[it.host]; });
        // dernier recours : l'expéditeur du paquet
      } catch (e) { }
    }
    try {
      sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', () => { });
      sock.on('message', (b, rinfo) => { onMsg(b); found.forEach((it) => { if (!it.ip && rinfo && privateIp(rinfo.address)) it.ip = rinfo.address; }); });
      sock.bind(0, () => {
        const q = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), qname(name), Buffer.from([0, 12, 0x80, 1])]);   // PTR, réponse en direct (bit QU)
        const send = () => { try { sock.send(q, 5353, '224.0.0.251'); } catch (e) { } };
        send(); setTimeout(send, 1000); setTimeout(send, 2500);
      });
    } catch (e) { return resolve([]); }
    setTimeout(() => { try { sock.close(); } catch (e) { } resolve(Array.from(found.values()).filter((x) => x.ip && privateIp(x.ip))); }, ms || 6000);
  });
}

/* ---------------- soleil (programmes « au lever / au coucher ») ---------------- */
function sunUtcMin(y, mo, d, lat, lon) {
  const n = Math.round((Date.UTC(y, mo, d) - Date.UTC(y, 0, 1)) / 864e5) + 1, g = 2 * Math.PI / 365 * (n - 1), rad = Math.PI / 180;
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const c = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (c > 1 || c < -1) return null;
  const ha = Math.acos(c) / rad, noon = 720 - 4 * lon - eq;
  return [noon - 4 * ha, noon + 4 * ha];
}
function nextOf(p, after) {
  if (!p) return -1;
  const days = Array.isArray(p.days) ? p.days : [];
  for (let k = 0; k < 9; k++) {
    const d = new Date(after); d.setDate(d.getDate() + k);
    if (days.length && !days.includes(d.getDay())) continue;
    let t;
    if (p.sun === 'rise' || p.sun === 'set') {
      const r = sunUtcMin(d.getFullYear(), d.getMonth(), d.getDate(), +p.lat || 43.3, +p.lon || 5.37); if (!r) continue;
      t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) + Math.round((p.sun === 'rise' ? r[0] : r[1]) * 60000) + (+p.off || 0) * 60000;
    } else { d.setHours(+p.h || 0, +p.m || 0, 0, 0); if (p.h == null) d.setHours(7, +p.m || 0, 0, 0); t = d.getTime(); }
    if (t > after + 30000) return t;
  }
  return -1;
}

/* ---------------- branchement au programme ---------------- */
module.exports = function (app, ipcMain, BrowserWindow, safeStorage, net0) {
  const DIR = app.getPath('userData');
  const F = { hue: path.join(DIR, 'hue.json'), somfy: path.join(DIR, 'somfy.json'), al: path.join(DIR, 'maison-alarmes.json') };
  const chiffre = () => { try { return !!(safeStorage && safeStorage.isEncryptionAvailable()); } catch (e) { return false; } };
  function lire(f, secret) {
    try {
      const o = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (o[secret + 'E']) o[secret] = safeStorage.decryptString(Buffer.from(o[secret + 'E'], 'base64'));
      return o;
    } catch (e) { return null; }
  }
  function ecrire(f, o, secret) {
    const c = Object.assign({}, o);
    if (chiffre() && c[secret]) { c[secret + 'E'] = safeStorage.encryptString(c[secret]).toString('base64'); delete c[secret]; }
    fs.writeFileSync(f + '.tmp', JSON.stringify(c)); fs.renameSync(f + '.tmp', f);
  }
  const hueLoad = () => { const o = lire(F.hue, 'user'); return o && okKey(o.user) && privateIp(o.ip) ? o : null; };
  const somfyLoad = () => { const o = lire(F.somfy, 'token'); return o && privateIp(o.ip) && okPin(o.pin) && okToken(o.token) ? o : null; };
  function emit(type, o) {
    const j = JSON.stringify(o);
    BrowserWindow.getAllWindows().forEach((w) => { try { if (!w.isDestroyed()) w.webContents.send('maison-ev', type, j); } catch (e) { } });
  }
  const ev = (op, kv) => { const o = { op }; Object.keys(kv || {}).forEach((k) => { if (kv[k] != null) o[k] = kv[k]; }); return o; };

  async function hueCall(method, p, body) {
    const o = hueLoad(); if (!o) throw new Err('notpaired');
    if (method !== 'GET' && method !== 'PUT') throw new Err('method');
    let useTls, full, key = null;
    if (/^\/clip\/v2\/resource\/(light|room|zone|device|grouped_light|scene|bridge_home|bridge)(\/[0-9a-fA-F\-]{8,64})?$/.test(p || '')) { if (o.api !== 'v2') throw new Err('path'); useTls = true; full = p; key = o.user; }
    else if (/^v1:\/(lights|groups|scenes)(\/[A-Za-z0-9\-]{1,64}(\/(state|action))?)?$/.test(p || '')) { useTls = o.api !== 'v1'; full = '/api/' + o.user + p.slice(3); }
    else throw new Err('path');
    if (useTls && !o.fp) throw new Err('cert');
    try { return await hueHttp(o.ip, useTls, useTls ? o.fp : null, false, method, full, key, body || null, 6000); }
    catch (e) { throw new Err(['notprivate', 'path', 'cert', 'method', 'key', 'body'].includes(e.code) ? e.code : 'unreachable'); }
  }
  async function somfyHttp(ip, port, pin, token, method, p, body, timeout) {
    if (!privateIp(ip)) throw new Err('notprivate');
    if (!okPort(port)) throw new Err('port');
    if (!okPin(pin)) throw new Err('pin');
    if (!okToken(token)) throw new Err('token');
    if (!okSomfyReq(method, p)) throw new Err('path');
    if (body != null && (body.length > 16384 || !String(body).trim().startsWith('{'))) throw new Err('body');
    try { return await http({ ip, port, tls: true, somfyPin: pin, method, path: SOMFY_BASE + p, host: 'gateway-' + pin + '.local:' + port, headers: { Authorization: 'Bearer ' + token }, body, timeout }); }
    catch (e) { throw new Err(['cert', 'certname'].includes(e.code) ? e.code : 'unreachable'); }
  }

  /* Hue */
  ipcMain.on('hue-info', (e) => {
    const o = hueLoad();
    e.returnValue = JSON.stringify(o ? { paired: true, ip: o.ip, id: o.id || '', name: o.name || '', api: o.api, model: o.model || '', fp: o.fp || '', at: o.at || 0 } : { paired: false });
  });
  ipcMain.on('hue-req', async (e, id, method, p, body) => {
    try { const r = await hueCall(method, p, body); emit('hue', ev('res', { id, code: r.code, body: r.body })); }
    catch (x) { emit('hue', ev('res', { id, err: x.code || 'unreachable' })); }
  });
  let pairStop = { v: false };
  ipcMain.on('hue-pair', async (e, ip) => {
    pairStop.v = true; const stop = pairStop = { v: false };
    const p = await huePair(String(ip || ''), stop, (s) => emit('hue', ev('pair', { state: 'wait', left: s, ip })));
    if (!p.user) return emit('hue', ev('pair', { state: 'error', code: p.err, msg: p.msg }));
    try {
      ecrire(F.hue, { ip, user: p.user, clientkey: p.clientkey || '', fp: p.fp || '', api: p.api, id: p.bridgeId || '', name: p.name || 'Hue', model: p.model || '', sw: p.sw || '', at: Date.now() }, 'user');
      emit('hue', ev('pair', { state: 'ok', api: p.api, name: p.name }));
    } catch (x) { emit('hue', ev('pair', { state: 'error', code: 'save', msg: x.message })); }
  });
  ipcMain.on('hue-pair-cancel', () => { pairStop.v = true; });
  ipcMain.on('hue-forget', () => { try { fs.unlinkSync(F.hue); } catch (e) { } });
  ipcMain.on('hue-move', async (e, ip) => {
    const o = hueLoad(); let ok = false;
    if (o && privateIp(ip) && o.fp) {
      try { const r = await hueHttp(ip, true, o.fp, false, 'GET', '/api/config', null, null, 4000); const b = str(r.body, 'bridgeid'); if (r.code === 200 && b && o.id && b.toLowerCase() === o.id.toLowerCase()) { o.ip = ip; ecrire(F.hue, o, 'user'); ok = true; } } catch (x) { }
    }
    emit('hue', ev('move', { ok, ip }));
  });
  ipcMain.on('hue-discover', async (e, cloud) => {
    if (cloud) {
      const l = []; let err = null;
      try {
        const r = await (net0 && net0.fetch ? net0.fetch('https://discovery.meethue.com/', { headers: { Accept: 'application/json' } }) : fetch('https://discovery.meethue.com/'));
        if (r.status !== 200) err = r.status === 429 ? 'trop de demandes, réessayez dans quelques minutes' : 'HTTP ' + r.status;
        else (await r.json()).forEach((x) => { if (privateIp(x.internalipaddress)) l.push({ ip: x.internalipaddress, id: x.id || '', name: 'Pont Hue', via: 'cloud' }); });
      } catch (x) { err = 'injoignable'; }
      return emit('hue', ev('discover', { via: 'cloud', list: l, err }));
    }
    const l = (await mdns('_hue._tcp', 6000)).map((x) => ({ ip: x.ip, id: x.txt.bridgeid || '', name: x.name, via: 'mdns' }));
    emit('hue', ev('discover', { via: 'mdns', list: l }));
  });

  /* Somfy TaHoma */
  ipcMain.on('somfy-info', (e) => {
    const o = somfyLoad();
    e.returnValue = JSON.stringify(o ? { set: true, ip: o.ip, port: o.port || 8443, pin: o.pin, at: o.at || 0 } : { set: false });
  });
  ipcMain.on('somfy-set', async (e, ip, port, pin, token) => {
    let o;
    try {
      const old = somfyLoad(); let tk = String(token || '').trim(); pin = String(pin || '').trim(); ip = String(ip || '').trim(); port = +port || 8443;
      if (!tk && old && old.pin.toLowerCase() === pin.toLowerCase()) tk = old.token;
      const r = await somfyHttp(ip, port, pin, tk, 'GET', '/setup/devices', null, 8000);
      if (r.code === 401 || r.code === 403) o = ev('set', { ok: false, err: 'unauthorized' });
      else if (r.code !== 200) o = ev('set', { ok: false, err: 'http', code: r.code });
      else { ecrire(F.somfy, { ip, port, pin, token: tk, at: Date.now() }, 'token'); o = ev('set', { ok: true, body: r.body }); }
    } catch (x) { o = ev('set', { ok: false, err: x.code || 'save' }); }
    emit('somfy', o);
  });
  ipcMain.on('somfy-req', async (e, id, method, p, body) => {
    try {
      const o = somfyLoad(); if (!o) throw new Err('notset');
      const r = await somfyHttp(o.ip, o.port || 8443, o.pin, o.token, method, p, body || null, 8000);
      emit('somfy', ev('res', { id, code: r.code, body: r.body }));
    } catch (x) { emit('somfy', ev('res', { id, err: x.code || 'unreachable' })); }
  });
  ipcMain.on('somfy-forget', () => { try { fs.unlinkSync(F.somfy); } catch (e) { } });
  ipcMain.on('somfy-discover', async () => {
    const l = (await mdns('_kizboxdev._tcp', 6000)).map((x) => ({ ip: x.ip, port: x.port || 8443, pin: x.txt.gateway_pin || '', fw: x.txt.fw_version || '' }));
    emit('somfy', ev('discover', { list: l }));
  });

  /* Actions programmées des lumières et des volets */
  let AL = {}; try { AL = JSON.parse(fs.readFileSync(F.al, 'utf8')) || {}; } catch (e) { }
  const timers = {};
  const saveAl = () => { try { fs.writeFileSync(F.al, JSON.stringify(AL)); } catch (e) { } };
  function plan(o) {
    clearTimeout(timers[o.id]);
    const d = Math.max(0, (+o.at || 0) - Date.now());
    timers[o.id] = setTimeout(() => run(o.id), Math.min(d, 2 ** 31 - 1));
  }
  async function run(id) {
    const o = AL[id]; if (!o) return;
    if (+o.at > Date.now() + 1000) return plan(o);   // délai trop long pour un seul minuteur
    let ok = true, err = null, next = -1;
    try {
      if (o.kind === 'hue') {
        const reqs = Array.isArray(o.reqs) ? o.reqs : [];
        for (let i = 0; i < reqs.length; i++) {
          const r = reqs[i]; const b = r.body == null ? null : (typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
          const x = await hueCall(r.method || 'PUT', r.path, b);
          if (x.code >= 400) { ok = false; err = x.code === 403 ? 'unauthorized' : 'http'; }
          if (i < reqs.length - 1) await sleep(110);
        }
      } else {
        const cf = somfyLoad(); if (!cf) throw new Err('notset');
        if (!Array.isArray(o.actions) || !o.actions.length) throw new Err('body');
        const body = JSON.stringify({ label: 'Majordome : ' + (o.text || 'programme'), actions: o.actions });
        let r = null;
        for (let i = 0; i < 3; i++) { try { r = await somfyHttp(cf.ip, cf.port || 8443, cf.pin, cf.token, 'POST', '/exec/apply', body, 8000); break; } catch (x) { if (x.code !== 'unreachable' || i === 2) throw x; await sleep(8000); } }
        if (r.code === 401 || r.code === 403) { ok = false; err = 'unauthorized'; } else if (r.code >= 400) { ok = false; err = 'http'; }
      }
    } catch (x) { ok = false; err = x.code || 'unreachable'; }
    if (o.prog) { next = nextOf(o.prog, Date.now()); if (next > 0) { o.at = next; plan(o); } else delete AL[id]; } else delete AL[id];
    saveAl();
    emit(o.kind, ev('later', { id, ok, err, label: o.text || '', next }));
  }
  ipcMain.on('maison-alarm-set', (e, json) => {
    try { const o = JSON.parse(json); if (!o.id || (o.kind !== 'hue' && o.kind !== 'somfy')) return; AL[o.id] = o; saveAl(); plan(o); } catch (x) { }
  });
  ipcMain.on('maison-alarm-cancel', (e, id) => { if (AL[id]) { clearTimeout(timers[id]); delete AL[id]; saveAl(); } });
  ipcMain.on('maison-alarm-list', (e) => { e.returnValue = JSON.stringify(AL); });
  // au démarrage : actions en attente (une action passée de plus de 10 minutes n'est pas rattrapée, sauf un programme qui se répète)
  Object.keys(AL).forEach((id) => {
    const o = AL[id];
    if (+o.at < Date.now() - 600000) { if (o.prog) { o.at = nextOf(o.prog, Date.now()); if (o.at > 0) plan(o); else delete AL[id]; } else delete AL[id]; }
    else plan(o);
  });
  saveAl();
};
module.exports._test = { T, privateIp, http, hueHttp, huePair, nextOf, mdns, parse };
