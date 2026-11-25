/* Caméras (Suite MAG.exe) : même travail que CamerasBridge.java sur Android, côté programme Windows.
   - discover() : recherche ONVIF (WS-Discovery, multicast 239.255.255.250:3702) sur chaque carte réseau, 4 s ;
   - probe(id, ip, user, pwd, xaddr) : adresse RTSP du flux principal et du flux réduit (ONVIF GetStreamUri, sinon adresses
     habituelles), vérifiée par une requête DESCRIBE (identification Basic ou Digest) ;
   - flux : petit serveur local 127.0.0.1 qui convertit le RTSP en MJPEG avec ffmpeg (lecteur <img> de la mosaïque) ;
   - ptz(cam, dir) : caméras motorisées (ONVIF ContinuousMove / Stop).
   Réseau local seulement (adresses privées). */
'use strict';
const dgram = require('dgram');
const net = require('net');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

function privateIp(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip || ''); if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const param = (h, k) => { const m = new RegExp(k + '="([^"]*)"').exec(h); return m ? m[1] : ''; };
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unXml = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();

/* ================= Recherche ONVIF ================= */
function discover() {
  return new Promise((resolve) => {
    const seen = new Map(), socks = [];
    const msg = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">' +
      '<e:Header><w:MessageID>uuid:' + crypto.randomUUID() + '</w:MessageID><w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header>' +
      '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>', 'utf8');
    const addrs = [];
    Object.values(os.networkInterfaces()).forEach((l) => (l || []).forEach((x) => { if (x.family === 'IPv4' && !x.internal && privateIp(x.address)) addrs.push(x.address); }));
    if (!addrs.length) addrs.push('0.0.0.0');
    addrs.forEach((addr) => {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      socks.push(s);
      s.on('error', () => { });
      s.on('message', (buf, rinfo) => {
        const ip = rinfo.address; if (!privateIp(ip) || seen.has(ip)) return;
        const x = buf.toString('utf8'), o = { ip };
        let m = /<[^>]*XAddrs>([^<]+)</.exec(x); if (m) o.xaddr = m[1].trim().split(/\s+/)[0];
        m = /<[^>]*Scopes[^>]*>([^<]+)</.exec(x);
        if (m) m[1].trim().split(/\s+/).forEach((sc) => {
          const low = sc.toLowerCase();
          try {
            if (low.includes('/name/')) o.name = decodeURIComponent(sc.slice(low.indexOf('/name/') + 6));
            if (low.includes('/hardware/')) o.model = decodeURIComponent(sc.slice(low.indexOf('/hardware/') + 10));
          } catch (e) { }
        });
        seen.set(ip, o);
      });
      s.bind({ address: addr === '0.0.0.0' ? undefined : addr, port: 0 }, () => {
        try { if (addr !== '0.0.0.0') s.setMulticastInterface(addr); } catch (e) { }
        for (let i = 0; i < 2; i++) setTimeout(() => s.send(msg, 3702, '239.255.255.250', () => { }), i * 300);
      });
    });
    setTimeout(() => { socks.forEach((s) => { try { s.close(); } catch (e) { } }); resolve([...seen.values()]); }, 4000);
  });
}

/* ================= RTSP DESCRIBE ================= */
const MAIN = ['/Streaming/Channels/101', '/stream1', '/onvif1', '/live/ch00_0', '/11', '/h264_stream', '/live/main', '/av0_0', '/ch0_0.h264', '/0', '/live/0/MAIN', '/media/video1', '/h264/ch1/main/av_stream', '/cam/realmonitor?channel=1&subtype=0', '/'];
const SUB = ['/Streaming/Channels/102', '/stream2', '/onvif2', '/live/ch00_1', '/12', '', '/live/sub', '/av0_1', '/ch0_1.h264', '/1', '/live/0/SUB', '/media/video2', '/h264/ch1/sub/av_stream', '/cam/realmonitor?channel=1&subtype=1', ''];

function rawExchange(ip, port, data, untilHeaders, timeout) {
  return new Promise((resolve) => {
    const so = net.connect({ host: ip, port, timeout: 2500 });
    let buf = Buffer.alloc(0), done = false;
    const end = (v) => { if (done) return; done = true; try { so.destroy(); } catch (e) { } resolve(v); };
    so.setTimeout(timeout || 5000, () => end(buf.length ? buf.toString('utf8') : null));
    so.on('connect', () => so.write(data));
    so.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (untilHeaders && buf.indexOf('\r\n\r\n') >= 0) end(buf.toString('utf8'));
      if (buf.length > 2000000) end(buf.toString('utf8'));
    });
    so.on('end', () => end(buf.toString('utf8')));
    so.on('error', () => end(buf.length ? buf.toString('utf8') : null));
  });
}
function portOpen(ip, port) {
  return new Promise((resolve) => {
    const so = net.connect({ host: ip, port });
    const t = setTimeout(() => { so.destroy(); resolve(false); }, 2000);
    so.on('connect', () => { clearTimeout(t); so.destroy(); resolve(true); });
    so.on('error', () => { clearTimeout(t); resolve(false); });
  });
}
/** 200 trouvé, 404 absent, 401 refusé, 0 injoignable */
async function describe(ip, port, path, user, pwd) {
  const uri = 'rtsp://' + ip + ':' + port + path;
  let auth = null;
  for (let round = 0; round < 2; round++) {
    const head = await rawExchange(ip, port, 'DESCRIBE ' + uri + ' RTSP/1.0\r\nCSeq: ' + (round + 1) + '\r\nAccept: application/sdp\r\nUser-Agent: MAG-Cameras\r\n' + (auth ? 'Authorization: ' + auth + '\r\n' : '') + '\r\n', true, 3000);
    if (head == null) return 0;
    const st = /^RTSP\/1\.\d (\d{3})/.exec(head), code = st ? +st[1] : 0;
    if (code !== 401) return code;
    if (auth || !user) return 401;
    let digest = null, basic = null; const re = /^WWW-Authenticate:\s*(.+)$/gim; let w;
    while ((w = re.exec(head))) { const v = w[1].trim(); if (/^digest/i.test(v)) digest = v; else if (/^basic/i.test(v)) basic = v; }
    if (digest) {
      const realm = param(digest, 'realm'), nonce = param(digest, 'nonce');
      auth = 'Digest username="' + user + '", realm="' + realm + '", nonce="' + nonce + '", uri="' + uri + '", response="' + md5(md5(user + ':' + realm + ':' + pwd) + ':' + nonce + ':' + md5('DESCRIBE:' + uri)) + '"';
    } else if (basic) auth = 'Basic ' + Buffer.from(user + ':' + pwd).toString('base64');
    else return 401;
  }
  return 401;
}

/* ================= ONVIF (SOAP) ================= */
async function post(url, xml, user, pwd) {
  const u = new URL(url), host = u.hostname, port = +u.port || 80, path = (u.pathname || '/') + (u.search || '');
  if (!privateIp(host)) throw new Error('ip');
  let auth = null;
  for (let round = 0; round < 2; round++) {
    const b = Buffer.from(xml, 'utf8');
    const req = 'POST ' + path + ' HTTP/1.0\r\nHost: ' + host + ':' + port + '\r\nContent-Type: application/soap+xml; charset=utf-8\r\nContent-Length: ' + b.length + '\r\nConnection: close\r\n' + (auth ? 'Authorization: ' + auth + '\r\n' : '') + '\r\n';
    const all = await rawExchange(host, port, Buffer.concat([Buffer.from(req, 'utf8'), b]), false, 6000);
    const h = { code: 0, head: '', body: '' };
    if (all == null) return h;
    const sep = all.indexOf('\r\n\r\n'); h.head = sep >= 0 ? all.slice(0, sep) : all; h.body = sep >= 0 ? all.slice(sep + 4) : '';
    const st = /^HTTP\/1\.\d (\d{3})/.exec(h.head); h.code = st ? +st[1] : 0;
    if (h.code !== 401 || auth || !user) return h;
    const w = /^WWW-Authenticate:\s*Digest\s+(.+)$/im.exec(h.head); if (!w) return h;
    const d = w[1], realm = param(d, 'realm'), nonce = param(d, 'nonce'), qop = param(d, 'qop'), cn = crypto.randomBytes(8).toString('hex');
    const ha1 = md5(user + ':' + realm + ':' + pwd), ha2 = md5('POST:' + path);
    auth = qop.includes('auth')
      ? 'Digest username="' + user + '", realm="' + realm + '", nonce="' + nonce + '", uri="' + path + '", qop=auth, nc=00000001, cnonce="' + cn + '", response="' + md5(ha1 + ':' + nonce + ':00000001:' + cn + ':auth:' + ha2) + '"'
      : 'Digest username="' + user + '", realm="' + realm + '", nonce="' + nonce + '", uri="' + path + '", response="' + md5(ha1 + ':' + nonce + ':' + ha2) + '"';
  }
  return { code: 0, head: '', body: '' };
}
/** mode 0 : mot de passe condensé ; 1 : en clair ; 2 : sans en-tête */
function soap(body, user, pwd, mode, skew) {
  let sec = '';
  const WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd', TOK = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0';
  if (mode === 1 && user) sec = '<s:Header><Security s:mustUnderstand="1" xmlns="' + WSSE + '"><UsernameToken><Username>' + xmlEsc(user) + '</Username><Password Type="' + TOK + '#PasswordText">' + xmlEsc(pwd) + '</Password></UsernameToken></Security></s:Header>';
  else if (!mode && user) {
    const nonce = crypto.randomBytes(16), created = new Date(Date.now() + (skew || 0)).toISOString().replace(/\.\d+Z$/, 'Z');
    const dg = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created, 'utf8'), Buffer.from(pwd || '', 'utf8')])).digest('base64');
    sec = '<s:Header><Security s:mustUnderstand="1" xmlns="' + WSSE + '"><UsernameToken><Username>' + xmlEsc(user) + '</Username><Password Type="' + TOK + '#PasswordDigest">' + dg + '</Password>' +
      '<Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">' + nonce.toString('base64') + '</Nonce>' +
      '<Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">' + created + '</Created></UsernameToken></Security></s:Header>';
  }
  return '<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">' + sec + '<s:Body>' + body + '</s:Body></s:Envelope>';
}
const call = (url, body, user, pwd, mode, skew) => post(url, soap(body, user, pwd, mode || 0, skew || 0), user, pwd);
const refused = (h) => h.code === 401 || /NotAuthorized|FailedAuthentication|Sender not Authorized/.test(h.body);
async function skewOf(dev) {
  try {
    const h = await post(dev, soap('<GetSystemDateAndTime xmlns="http://www.onvif.org/ver10/device/wsdl"/>', null, null, 2, 0), null, null);
    const u = /UTCDateTime>([\s\S]*?)<\/[^>]*UTCDateTime>/.exec(h.body); if (!u) return 0;
    const v = ['Year', 'Month', 'Day', 'Hour', 'Minute', 'Second'].map((k) => { const m = new RegExp(k + '>(\\d+)<').exec(u[1]); return m ? +m[1] : null; });
    if (v.some((x) => x == null)) return 0;
    return Date.UTC(v[0], v[1] - 1, v[2], v[3], v[4], v[5]) - Date.now();
  } catch (e) { return 0; }
}
function local(ip, url) { try { const u = new URL(url); if (u.hostname === ip) return url; return 'http://' + ip + ':' + (u.port || 80) + u.pathname; } catch (e) { return url; } }

async function onvif(ip, xaddr, user, pwd, diag, ex) {
  const devs = [];
  if (xaddr && /^http/.test(xaddr)) devs.push(xaddr);
  [10000, 8000, 80, 8080, 2020, 6688, 8899, 5000].forEach((p) => devs.push('http://' + ip + (p === 80 ? '' : ':' + p) + '/onvif/device_service'));
  for (const dev of devs) {
    try {
      const du = new URL(dev), port = +du.port || 80;
      if (du.hostname !== ip || !(await portOpen(ip, port))) continue;
      let h = await call(dev, '<GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl"><Category>All</Category></GetCapabilities>', user, pwd);
      if (!h.body.includes('XAddr')) h = await call(dev, '<GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl"><Category>Media</Category></GetCapabilities>', user, pwd);
      diag.push('ONVIF ' + port + ' : ' + h.code);
      if (h.code !== 200 && refused(h)) diag.push('refus');
      let media = dev;
      const mm = /Media>\s*<[^>]*XAddr>([^<]+)</.exec(h.body); if (mm) media = unXml(mm[1]);
      media = local(ip, media);
      const skew = await skewOf(dev); if (Math.abs(skew) > 5000) diag.push('horloge ' + Math.round(skew / 1000) + ' s');
      let pr = null, mode = -1;
      for (let md = 0; md < 3; md++) {
        const t2 = await call(media, '<GetProfiles xmlns="http://www.onvif.org/ver10/media/wsdl"/>', user, pwd, md, skew);
        if (!refused(t2) && t2.body.includes('token=')) { pr = t2; mode = md; break; }
      }
      if (!pr) { diag.push('profils refusés (3 essais)'); return ['auth']; }
      ex.dev = dev; ex.mode = mode;
      const pz = /PTZ>\s*<[^>]*XAddr>([^<]+)</.exec(h.body); if (pz) ex.ptz = local(ip, unXml(pz[1]));
      const ev = /Events>\s*<[^>]*XAddr>([^<]+)</.exec(h.body); if (ev) ex.events = local(ip, unXml(ev[1]));
      diag.push('ident ' + (mode === 0 ? 'condensée' : mode === 1 ? 'en clair' : 'aucune'));
      const tokens = []; const re = /Profiles[^>]*token="([^"]+)"/g; let t;
      while ((t = re.exec(pr.body))) if (!tokens.includes(t[1])) tokens.push(t[1]);
      diag.push(tokens.length + ' profil(s)');
      if (tokens.length) ex.token = tokens[0];
      const uris = [];
      for (const tk of tokens) {
        const su = await call(media, '<GetStreamUri xmlns="http://www.onvif.org/ver10/media/wsdl"><StreamSetup><Stream xmlns="http://www.onvif.org/ver10/schema">RTP-Unicast</Stream><Transport xmlns="http://www.onvif.org/ver10/schema"><Protocol>RTSP</Protocol></Transport></StreamSetup><ProfileToken>' + xmlEsc(tk) + '</ProfileToken></GetStreamUri>', user, pwd, mode, skew);
        const um = /<[^>]*Uri>([^<]+)</.exec(su.body); if (um) uris.push(unXml(um[1]));
        if (uris.length >= 2) break;
      }
      if (uris.length) { diag.push('flux : ' + uris[0].replace(/\/\/[^@/]*@/, '//')); return uris; }
    } catch (e) { diag.push('erreur ' + (e && e.message || e)); }
  }
  return null;
}

async function probe(id, ip, user, pwd, xaddr) {
  const diag = [], ev = { op: 'probe', id };
  try {
    if (!privateIp(ip)) return Object.assign(ev, { ok: false, err: 'ip' });
    let isRefused = false;
    const ex = {};
    const u = await onvif(ip, xaddr, user, pwd, diag, ex);
    if (u && u.length === 1 && u[0] === 'auth') isRefused = true;
    else if (u) {
      const m = new URL(u[0].replace(/^rtsp:/i, 'http:')), port = +m.port || 554, main = (m.pathname || '/') + (m.search || '');
      const code = await describe(ip, port, main, user, pwd);
      diag.push('DESCRIBE ' + code);
      let sub = '';
      if (u.length > 1) { const sm = new URL(u[1].replace(/^rtsp:/i, 'http:')); if ((+sm.port || 554) === port) sub = (sm.pathname || '/') + (sm.search || ''); }
      if (code === 401) isRefused = true;
      else return Object.assign(ev, { ok: true, port, main, sub, diag: diag.join('; '), onvif: ex });
    }
    let any = false;
    for (const port of [8554, 554]) {
      if (!(await portOpen(ip, port))) continue;
      any = true; const codes = [];
      for (let i = 0; i < MAIN.length; i++) {
        const c = await describe(ip, port, MAIN[i], user, pwd); codes.push(c);
        if (c === 401) { isRefused = true; continue; }
        if (c === 200) {
          let sub = '';
          if (SUB[i] && (await describe(ip, port, SUB[i], user, pwd)) === 200) sub = SUB[i];
          diag.push('RTSP ' + port + ' : ' + codes.join(' '));
          return Object.assign(ev, { ok: true, port, main: MAIN[i], sub, diag: diag.join('; ') });
        }
      }
      diag.push('RTSP ' + port + ' : ' + codes.join(' '));
    }
    return Object.assign(ev, { ok: false, err: isRefused ? 'auth' : !any && !u ? 'closed' : 'path', diag: diag.join('; ') });
  } catch (e) { return Object.assign(ev, { ok: false, err: 'closed', diag: diag.concat(String(e && e.message || e)).join('; ') }); }
}

/* ================= Caméras motorisées ================= */
async function ptz(c, dir) {
  try {
    const url = c.ptz, tok = c.token, user = c.user, pwd = c.pwd; if (!url || !tok) return false;
    const mode = c.mode || 0, skew = mode === 0 ? await skewOf(c.dev || url) : 0;
    const ns = 'http://www.onvif.org/ver20/ptz/wsdl', sc = 'http://www.onvif.org/ver10/schema';
    if (dir !== 'stop') {
      const x = dir === 'left' ? -0.5 : dir === 'right' ? 0.5 : 0, y = dir === 'up' ? 0.5 : dir === 'down' ? -0.5 : 0, z = dir === 'in' ? 0.5 : dir === 'out' ? -0.5 : 0;
      const vel = z ? '<Zoom x="' + z + '" xmlns="' + sc + '"/>' : '<PanTilt x="' + x + '" y="' + y + '" xmlns="' + sc + '"/>';
      const h = await call(url, '<ContinuousMove xmlns="' + ns + '"><ProfileToken>' + xmlEsc(tok) + '</ProfileToken><Velocity>' + vel + '</Velocity></ContinuousMove>', user, pwd, mode, skew);
      if (h.code >= 400 || refused(h)) return false;
      await new Promise((r) => setTimeout(r, 700));
    }
    await call(url, '<Stop xmlns="' + ns + '"><ProfileToken>' + xmlEsc(tok) + '</ProfileToken><PanTilt>true</PanTilt><Zoom>true</Zoom></Stop>', user, pwd, mode, skew);
    return true;
  } catch (e) { return false; }
}

/* ================= Flux vidéo : RTSP → MJPEG (ffmpeg) sur 127.0.0.1 ================= */
let ffmpegPath = null;
try { ffmpegPath = process.env.MAG_FFMPEG || require('ffmpeg-static'); if (ffmpegPath) ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked'); } catch (e) { ffmpegPath = null; }
const streams = new Map();   // jeton → { url, h, fps }
const procs = new Set();
let server = null, serverPort = 0;
function startServer() {
  if (server) return Promise.resolve(serverPort);
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const m = /^\/s\/([a-f0-9]+)/.exec(req.url || ''); const s = m && streams.get(m[1]);
      if (!s || !ffmpegPath) { res.writeHead(404); res.end(); return; }
      const rt = /^rtsp:/i.test(s.url) ? ['-rtsp_transport', s.udp ? 'udp' : 'tcp', '-timeout', '8000000'] : ['-re', '-stream_loop', '-1'];
      const args = ['-hide_banner', '-loglevel', 'error'].concat(rt, ['-fflags', 'nobuffer', '-flags', 'low_delay',
        '-i', s.url, '-an', '-vf', 'scale=-2:' + s.h, '-r', String(s.fps), '-q:v', s.h > 600 ? '4' : '6', '-f', 'mpjpeg', '-boundary_tag', 'magcam', 'pipe:1']);
      const p = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      procs.add(p);
      let err = '';
      p.stderr.on('data', (d) => { err = (err + d).slice(-500); });
      res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace;boundary=magcam', 'Cache-Control': 'no-store', 'Connection': 'close', 'Access-Control-Allow-Origin': '*' });
      p.stdout.pipe(res);
      const stop = () => { try { p.kill('SIGKILL'); } catch (e) { } procs.delete(p); };
      req.on('close', stop); res.on('close', stop);
      p.on('exit', () => { procs.delete(p); try { res.end(); } catch (e) { } if (err) s.lastErr = err.trim(); });
    });
    server.listen(0, '127.0.0.1', () => { serverPort = server.address().port; resolve(serverPort); });
  });
}
/** liste des caméras (camObj de la page) → adresses MJPEG locales { name, sub, main } */
async function prepare(cams) {
  const port = await startServer();
  return cams.map((c) => {
    const one = (url, h, fps) => { if (!url) return ''; const k = crypto.randomBytes(12).toString('hex'); streams.set(k, { url, h, fps }); return 'http://127.0.0.1:' + port + '/s/' + k; };
    return { name: c.name, ptz: !!(c.ptz && c.token), sub: one(c.sub || c.main, 360, 10), main: one(c.main, 1080, 20) };
  });
}
function stopAll() { procs.forEach((p) => { try { p.kill('SIGKILL'); } catch (e) { } }); procs.clear(); }

module.exports = { discover, probe, ptz, prepare, stopAll, describe, hasFfmpeg: () => !!ffmpegPath };
