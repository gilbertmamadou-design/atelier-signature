/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-voyage/cv-model.js : ne pas modifier ici. */
/* =====================================================================
   Carnet de voyage — données : carnets et photos dans IndexedDB (« carnet-voyage »), import des photos
   (orientation EXIF appliquée, réduites à 2048 px, date et position GPS lues), fichier .magcarnet (zip),
   lieu en clair (facultatif) et météo du jour, mises en page automatiques (« Composer »).
   ===================================================================== */
(function () {
  'use strict';
  const CV = window.CV = window.CV || {};
  const A = CV.Art, W = A.W, H = A.H;
  const M = CV.M = {};
  M.uid = (p) => (p || '') + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 7);
  M.MAX = 2048; M.MID = 1024;

  /* ---------------- IndexedDB ---------------- */
  let dbp = null;
  M.db = function () {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('carnet-voyage', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('carnets')) d.createObjectStore('carnets', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' }).createIndex('carnet', 'carnet');
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  };
  function tx(store, mode, fn) {
    return M.db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store); let out;
      const q = fn(s); if (q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Stockage plein'));
    }));
  }
  M.carnets = () => tx('carnets', 'readonly', (s) => s.getAll()).then((l) => (l || []).sort((a, b) => (b.updated || 0) - (a.updated || 0)));
  M.getCarnet = (id) => tx('carnets', 'readonly', (s) => s.get(id));
  M.putCarnet = (c) => tx('carnets', 'readwrite', (s) => s.put(c));
  M.getMedia = (id) => tx('media', 'readonly', (s) => s.get(id));
  M.putMedia = (m) => tx('media', 'readwrite', (s) => s.put(m));
  M.mediaOf = (cid) => tx('media', 'readonly', (s) => s.index('carnet').getAll(cid));
  M.delMedia = (id) => tx('media', 'readwrite', (s) => s.delete(id));
  M.kvGet = (k) => tx('kv', 'readonly', (s) => s.get(k));
  M.kvPut = (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k));
  M.delCarnet = async function (id) {
    const ms = await M.mediaOf(id);
    await tx('media', 'readwrite', (s) => { ms.forEach((m) => s.delete(m.id)); });
    await tx('carnets', 'readwrite', (s) => s.delete(id));
  };

  /* ---------------- Cache des photos (adresses blob: et dimensions) ---------------- */
  const info = {}, urls = {}, datas = {};
  M.info = (id) => info[id];
  M.loadMedia = async function (cid) {
    const l = await M.mediaOf(cid);
    l.forEach((m) => { info[m.id] = { w: m.w, h: m.h, name: m.name, exif: m.exif || {}, carnet: m.carnet }; });
    return l;
  };
  M.url = function (id) {
    if (!id) return '';
    if (urls[id]) return urls[id].u;
    return '';
  };
  M.ensureUrls = async function (ids) {
    for (const id of ids) {
      if (!id || urls[id]) continue;
      const m = await M.getMedia(id); if (!m) continue;
      info[id] = { w: m.w, h: m.h, name: m.name, exif: m.exif || {}, carnet: m.carnet };
      urls[id] = { u: URL.createObjectURL(m.mid || m.full) };
    }
  };
  M.releaseUrls = function () { Object.keys(urls).forEach((k) => { URL.revokeObjectURL(urls[k].u); delete urls[k]; }); Object.keys(datas).forEach((k) => delete datas[k]); };
  /** data: URL pleine définition (export) ; « mid » pour les vignettes */
  M.dataUrl = async function (id, which) {
    const key = id + ':' + (which || 'full');
    if (datas[key]) return datas[key];
    const m = await M.getMedia(id); if (!m) return '';
    const b = which === 'mid' ? (m.mid || m.full) : m.full;
    datas[key] = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(''); r.readAsDataURL(b); });
    return datas[key];
  };
  M.forgetData = () => { Object.keys(datas).forEach((k) => delete datas[k]); };

  /* ---------------- EXIF (JPEG) : orientation, date, GPS ---------------- */
  M.exif = function (buf) {
    const v = new DataView(buf), out = {};
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return out;
    let p = 2;
    while (p + 4 < v.byteLength) {
      const mk = v.getUint16(p), len = v.getUint16(p + 2);
      if (mk === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) { parseTiff(v, p + 10, out); break; }
      if ((mk & 0xFF00) !== 0xFF00 || mk === 0xFFDA) break;
      p += 2 + len;
    }
    return out;
  };
  function parseTiff(v, t, out) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = (o) => v.getUint16(o, le), u32 = (o) => v.getUint32(o, le);
    const rat = (o) => { const a = u32(o), b = u32(o + 4); return b ? a / b : 0; };
    const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
    function ifd(o, fn) {
      if (o <= 0 || t + o + 2 > v.byteLength) return;
      const n = u16(t + o);
      for (let i = 0; i < n; i++) {
        const e = t + o + 2 + i * 12; if (e + 12 > v.byteLength) return;
        const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), vo = e + 8;
        const off = (type === 2 && cnt > 4) || (type === 5) || (type === 10) ? t + u32(vo) : vo;
        fn(tag, type, cnt, off, vo);
      }
    }
    let exifOff = 0, gpsOff = 0;
    ifd(u32(t + 4), (tag, type, cnt, off, vo) => {
      if (tag === 0x0112) out.orientation = u16(vo);
      else if (tag === 0x8769) exifOff = u32(vo);
      else if (tag === 0x8825) gpsOff = u32(vo);
      else if (tag === 0x0132 && !out.date) out.date = str(off, cnt);
    });
    if (exifOff) ifd(exifOff, (tag, type, cnt, off) => { if (tag === 0x9003 || (tag === 0x9004 && !out.date)) out.date = str(off, cnt); });
    if (gpsOff) {
      const g = {};
      ifd(gpsOff, (tag, type, cnt, off, vo) => {
        if (tag === 1) g.latRef = String.fromCharCode(v.getUint8(vo)); else if (tag === 3) g.lonRef = String.fromCharCode(v.getUint8(vo));
        else if (tag === 2 && cnt === 3) g.lat = rat(off) + rat(off + 8) / 60 + rat(off + 16) / 3600;
        else if (tag === 4 && cnt === 3) g.lon = rat(off) + rat(off + 8) / 60 + rat(off + 16) / 3600;
      });
      if (g.lat != null && g.lon != null && (g.lat || g.lon)) { out.lat = g.latRef === 'S' ? -g.lat : g.lat; out.lon = g.lonRef === 'W' ? -g.lon : g.lon; }
    }
  }
  /** « 2026:10:31 14:05:00 » → timestamp local */
  M.exifTime = (s) => { const m = /^(\d{4}):(\d\d):(\d\d)[ T](\d\d):(\d\d):?(\d\d)?/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() : 0; };

  /* ---------------- Import d'une photo ---------------- */
  async function decode(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { }
      try { return await createImageBitmap(blob); } catch (e) { }
    }
    const u = URL.createObjectURL(blob);
    try { const im = new Image(); im.src = u; await im.decode(); return im; } finally { setTimeout(() => URL.revokeObjectURL(u), 1000); }
  }
  function scaled(src, max, q) {
    const w0 = src.width, h0 = src.height, k = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob((b) => res({ b, w: c.width, h: c.height }), 'image/jpeg', q));
  }
  /** Fichier image → enregistrement « media » (pleine définition ≤ 2048 px, intermédiaire ≤ 1024 px) */
  M.importPhoto = async function (blob, name, cid, extra) {
    const buf = await blob.arrayBuffer();
    const ex = M.exif(buf);
    if (extra && extra.lat != null && ex.lat == null) { ex.lat = extra.lat; ex.lon = extra.lon; }
    if (extra && extra.date && !ex.date) ex.date = extra.date;
    let bmp;
    try { bmp = await decode(new Blob([buf], { type: blob.type || 'image/jpeg' })); }
    catch (e) { throw new Error((name || 'image') + ' : format non pris en charge' + (/heic|heif/i.test((blob.type || '') + name) ? ' (HEIC : choisis plutôt la version JPEG)' : '')); }
    if (!bmp.width) throw new Error((name || 'image') + ' : image illisible');
    const full = await scaled(bmp, M.MAX, 0.86), mid = await scaled(bmp, M.MID, 0.8);
    if (bmp.close) bmp.close();
    const m = { id: M.uid('m'), carnet: cid, name: name || 'photo.jpg', full: full.b, mid: mid.b, w: full.w, h: full.h, exif: { date: ex.date || '', t: M.exifTime(ex.date), lat: ex.lat, lon: ex.lon, orientation: ex.orientation || 1 }, added: Date.now() };
    await M.putMedia(m);
    info[m.id] = { w: m.w, h: m.h, name: m.name, exif: m.exif, carnet: cid };
    return m;
  };

  /* ---------------- Carnet ---------------- */
  M.newPage = (bg) => ({ id: M.uid('p'), bg: bg || 'creme', items: [] });
  M.newCarnet = function (o) {
    o = o || {};
    return { id: M.uid('c'), v: 1, title: o.title || 'Mon carnet de voyage', dates: o.dates || '', cover: { style: o.style || 'cuir', color: o.color || '', photo: null, titleStyle: o.titleStyle || '', font: o.font || '' }, coverItems: [], pages: [M.newPage(o.bg), M.newPage(o.bg)], created: Date.now(), updated: Date.now() };
  };
  M.mediaIds = function (c) {
    const s = new Set(); if (c.cover && c.cover.photo) s.add(c.cover.photo);
    (c.pages || []).concat([{ items: c.coverItems || [] }]).forEach((p) => (p.items || []).forEach((it) => { if (it.media) s.add(it.media); }));
    return s;
  };
  M.stats = function (c) { const ids = M.mediaIds(c); return (c.pages || []).length + ' page' + ((c.pages || []).length > 1 ? 's' : '') + ' · ' + ids.size + ' photo' + (ids.size > 1 ? 's' : ''); };

  /* ---------------- .magcarnet (zip : carnet.json + photos) ---------------- */
  M.exportFile = async function (c) {
    if (!window.JSZip) throw new Error('JSZip manquant');
    const z = new window.JSZip(), ms = await M.mediaOf(c.id), list = [];
    for (const m of ms) {
      z.file('photos/' + m.id + '.jpg', m.full);
      if (m.mid) z.file('photos/' + m.id + '-mid.jpg', m.mid);
      list.push({ id: m.id, name: m.name, w: m.w, h: m.h, exif: m.exif, added: m.added });
    }
    z.file('carnet.json', JSON.stringify({ format: 'magcarnet', version: 1, app: 'Carnet de voyage (Suite MAG)', exported: new Date().toISOString(), carnet: c, media: list }, null, 1));
    z.file('LISEZ-MOI.txt', 'Carnet de voyage de la Suite MAG : « ' + c.title + ' ».\nOuvre ce fichier .magcarnet avec l\'appli Carnet de voyage (Android ou PC) pour le retrouver tel quel.\n');
    return z.generateAsync({ type: 'blob', mimeType: 'application/x-magcarnet', compression: 'STORE' });
  };
  M.importFile = async function (blob, asCopy) {
    if (!window.JSZip) throw new Error('JSZip manquant');
    let z; try { z = await window.JSZip.loadAsync(blob); } catch (e) { throw new Error('Ce fichier n\'est pas un carnet (.magcarnet) lisible'); }
    const j = z.file('carnet.json'); if (!j) throw new Error('carnet.json introuvable : ce n\'est pas un fichier .magcarnet');
    const data = JSON.parse(await j.async('string'));
    if (data.format !== 'magcarnet' || !data.carnet) throw new Error('Format inconnu');
    const c = data.carnet;
    const exists = await M.getCarnet(c.id);
    const remap = {};
    if (exists || asCopy) { c.id = M.uid('c'); if (exists && !asCopy) c.title = c.title + ' (copie)'; }
    for (const m of data.media || []) {
      const fz = z.file('photos/' + m.id + '.jpg'); if (!fz) continue;
      const full = new Blob([await fz.async('arraybuffer')], { type: 'image/jpeg' });
      const fm = z.file('photos/' + m.id + '-mid.jpg');
      const mid = fm ? new Blob([await fm.async('arraybuffer')], { type: 'image/jpeg' }) : full;
      const nid = (exists || asCopy) ? M.uid('m') : m.id; remap[m.id] = nid;
      await M.putMedia({ id: nid, carnet: c.id, name: m.name, full, mid, w: m.w, h: m.h, exif: m.exif || {}, added: m.added || Date.now() });
    }
    const fix = (it) => { if (it.media && remap[it.media]) it.media = remap[it.media]; };
    (c.pages || []).forEach((p) => (p.items || []).forEach(fix)); (c.coverItems || []).forEach(fix);
    if (c.cover && c.cover.photo && remap[c.cover.photo]) c.cover.photo = remap[c.cover.photo];
    c.updated = Date.now();
    await M.putCarnet(c);
    return c;
  };

  /* ---------------- Lieu en clair et météo (Internet, facultatifs) ---------------- */
  M.fmtCoord = (lat, lon) => Math.abs(lat).toFixed(3).replace('.', ',') + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(lon).toFixed(3).replace('.', ',') + '° ' + (lon >= 0 ? 'E' : 'O');
  M.place = async function (lat, lon) {
    const key = 'geo:' + lat.toFixed(3) + ',' + lon.toFixed(3);
    const c = await M.kvGet(key).catch(() => null); if (c) return c;
    // BigDataCloud « reverse-geocode-client » : gratuit, sans clé ni compte (position envoyée à ce service)
    const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=fr');
    if (!r.ok) throw new Error('Service de lieux indisponible (' + r.status + ')');
    const j = await r.json();
    const town = j.city || j.locality || '', ctry = j.countryName || '';
    const s = [town, ctry].filter(Boolean).join(', ');
    if (s) await M.kvPut(key, s).catch(() => { });
    return s;
  };
  M.WMO = { 0: ['☀', 'ensoleillé'], 1: ['🌤', 'plutôt beau'], 2: ['⛅', 'nuageux'], 3: ['☁', 'couvert'], 45: ['🌫', 'brouillard'], 48: ['🌫', 'brouillard givrant'], 51: ['🌦', 'bruine'], 53: ['🌦', 'bruine'], 55: ['🌦', 'bruine'], 61: ['🌧', 'pluie faible'], 63: ['🌧', 'pluie'], 65: ['🌧', 'forte pluie'], 71: ['🌨', 'neige faible'], 73: ['🌨', 'neige'], 75: ['🌨', 'forte neige'], 80: ['🌦', 'averses'], 81: ['🌦', 'averses'], 82: ['⛈', 'fortes averses'], 95: ['⛈', 'orage'], 96: ['⛈', 'orage'], 99: ['⛈', 'orage'] };
  /** Météo d'une journée (Open-Meteo, sans clé) : {code, tmax, tmin, txt, sym} */
  M.weather = async function (lat, lon, day) {
    const today = new Date().toISOString().slice(0, 10);
    const past = day < today;
    const base = past && (Date.now() - new Date(day).getTime()) > 5 * 864e5 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
    const r = await fetch(base + '?latitude=' + lat.toFixed(3) + '&longitude=' + lon.toFixed(3) + '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=' + day + '&end_date=' + day);
    if (!r.ok) throw new Error('Météo indisponible (' + r.status + ')');
    const j = await r.json(), d = j.daily || {};
    const code = (d.weather_code || [])[0], tmax = (d.temperature_2m_max || [])[0], tmin = (d.temperature_2m_min || [])[0];
    if (code == null && tmax == null) throw new Error('Pas de météo pour ce jour');
    const w = M.WMO[code] || M.WMO[Math.floor(code / 10) * 10] || ['☁', ''];
    return { code, tmax, tmin, sym: w[0], txt: w[1] };
  };

  /* ---------------- Composer : mises en page automatiques de 3 à 6 photos ---------------- */
  // Chaque agencement : liste de cases [x, y, w, h, rot, cadre] en fractions de page ; la photo est ajustée à la case.
  const L = {
    3: [
      { name: 'Classique', cells: [[0.07, 0.05, 0.86, 0.42, 0, 'bord'], [0.07, 0.52, 0.41, 0.38, 0, 'bord'], [0.52, 0.52, 0.41, 0.38, 0, 'bord']] },
      { name: 'Polaroids', cells: [[0.1, 0.06, 0.5, 0.42, -5, 'polaroid'], [0.42, 0.3, 0.5, 0.42, 4, 'polaroid'], [0.12, 0.54, 0.5, 0.42, -2, 'polaroid']] },
      { name: 'Timbres', cells: [[0.1, 0.1, 0.38, 0.32, -4, 'timbre'], [0.53, 0.2, 0.38, 0.32, 5, 'timbre'], [0.25, 0.56, 0.45, 0.36, -2, 'timbre']] },
      { name: 'Bandeau', cells: [[0, 0, 1, 0.4, 0, 'aucun'], [0.08, 0.46, 0.4, 0.46, 3, 'washi'], [0.53, 0.5, 0.4, 0.42, -3, 'washi']] }
    ],
    4: [
      { name: 'Grille', cells: [[0.06, 0.05, 0.42, 0.42, 0, 'bord'], [0.52, 0.05, 0.42, 0.42, 0, 'bord'], [0.06, 0.52, 0.42, 0.42, 0, 'bord'], [0.52, 0.52, 0.42, 0.42, 0, 'bord']] },
      { name: 'Album', cells: [[0.08, 0.06, 0.4, 0.38, -2, 'coins'], [0.53, 0.1, 0.4, 0.34, 2, 'coins'], [0.07, 0.52, 0.4, 0.34, 1, 'coins'], [0.52, 0.5, 0.41, 0.4, -2, 'coins']] },
      { name: 'Vedette', cells: [[0.06, 0.04, 0.88, 0.48, 0, 'bord'], [0.05, 0.58, 0.29, 0.34, -3, 'polaroid'], [0.36, 0.6, 0.29, 0.34, 2, 'polaroid'], [0.67, 0.58, 0.29, 0.34, -1, 'polaroid']] },
      { name: 'Bric-à-brac', cells: [[0.05, 0.05, 0.5, 0.36, -6, 'punaise'], [0.5, 0.12, 0.45, 0.33, 5, 'trombone'], [0.08, 0.5, 0.42, 0.4, 3, 'dechire'], [0.52, 0.52, 0.42, 0.36, -4, 'timbre']] }
    ],
    5: [
      { name: 'Mosaïque', cells: [[0.05, 0.04, 0.9, 0.36, 0, 'bord'], [0.05, 0.44, 0.43, 0.25, 0, 'bord'], [0.52, 0.44, 0.43, 0.25, 0, 'bord'], [0.05, 0.72, 0.43, 0.25, 0, 'bord'], [0.52, 0.72, 0.43, 0.25, 0, 'bord']] },
      { name: 'Éparpillé', cells: [[0.04, 0.04, 0.46, 0.34, -6, 'polaroid'], [0.5, 0.06, 0.45, 0.33, 5, 'polaroid'], [0.27, 0.33, 0.46, 0.34, -2, 'polaroid'], [0.04, 0.62, 0.45, 0.34, 4, 'polaroid'], [0.51, 0.61, 0.45, 0.34, -5, 'polaroid']] },
      { name: 'Collection de timbres', cells: [[0.07, 0.06, 0.4, 0.27, -3, 'timbre'], [0.53, 0.06, 0.4, 0.27, 2, 'timbre'], [0.3, 0.37, 0.4, 0.27, -1, 'timbre'], [0.07, 0.68, 0.4, 0.27, 3, 'timbre'], [0.53, 0.68, 0.4, 0.27, -2, 'timbre']] },
      { name: 'Washi', cells: [[0.06, 0.05, 0.55, 0.38, -2, 'washi'], [0.63, 0.08, 0.32, 0.3, 4, 'washi'], [0.06, 0.48, 0.32, 0.3, 3, 'washi'], [0.4, 0.46, 0.55, 0.32, -3, 'washi'], [0.25, 0.79, 0.5, 0.18, 1, 'washi']] }
    ],
    6: [
      { name: 'Planche contact', cells: [[0.05, 0.04, 0.43, 0.29, 0, 'bord'], [0.52, 0.04, 0.43, 0.29, 0, 'bord'], [0.05, 0.355, 0.43, 0.29, 0, 'bord'], [0.52, 0.355, 0.43, 0.29, 0, 'bord'], [0.05, 0.67, 0.43, 0.29, 0, 'bord'], [0.52, 0.67, 0.43, 0.29, 0, 'bord']] },
      { name: 'Polaroids', cells: [[0.03, 0.04, 0.46, 0.3, -5, 'polaroid'], [0.51, 0.05, 0.46, 0.3, 4, 'polaroid'], [0.05, 0.36, 0.46, 0.3, 3, 'polaroid'], [0.5, 0.36, 0.46, 0.3, -3, 'polaroid'], [0.03, 0.67, 0.46, 0.3, -2, 'polaroid'], [0.51, 0.68, 0.46, 0.3, 5, 'polaroid']] },
      { name: 'Vedette et timbres', cells: [[0.05, 0.04, 0.9, 0.42, 0, 'coins'], [0.05, 0.52, 0.28, 0.2, -3, 'timbre'], [0.36, 0.52, 0.28, 0.2, 2, 'timbre'], [0.67, 0.52, 0.28, 0.2, -1, 'timbre'], [0.1, 0.76, 0.38, 0.2, 2, 'bord'], [0.52, 0.76, 0.38, 0.2, -2, 'bord']] },
      { name: 'Souvenirs', cells: [[0.04, 0.04, 0.44, 0.27, -4, 'trombone'], [0.52, 0.05, 0.44, 0.3, 3, 'punaise'], [0.08, 0.36, 0.4, 0.28, 2, 'dechire'], [0.52, 0.4, 0.42, 0.26, -3, 'washi'], [0.05, 0.69, 0.44, 0.27, 3, 'coins'], [0.52, 0.7, 0.43, 0.26, -2, 'timbre']] }
    ]
  };
  /** Propositions pour n photos (3 à 6) : [{name, items}] — les photos les plus horizontales vont dans les cases larges */
  M.compose = function (mediaIds, opt) {
    opt = opt || {};
    const n = Math.max(3, Math.min(6, mediaIds.length)), ids = mediaIds.slice(0, n);
    const ratio = (id) => { const i = info[id] || {}; return i.w && i.h ? i.w / i.h : 4 / 3; };
    return (L[n] || []).map((lay, k) => {
      const cells = lay.cells.map((c, i) => ({ c, i, ar: (c[2] * W) / (c[3] * H) }));
      const byCell = cells.slice().sort((a, b) => b.ar - a.ar), byPhoto = ids.slice().sort((a, b) => ratio(b) - ratio(a));
      const assign = {}; byCell.forEach((c, i) => { assign[c.i] = byPhoto[i]; });
      const items = lay.cells.map((c, i) => {
        const id = assign[i], fr = c[5];
        const cw = c[2] * W, ch = c[3] * H, cx = (c[0] + c[2] / 2) * W, cy = (c[1] + c[3] / 2) * H;
        let w = cw, h = A.idealH(fr, w, info[id]);
        if (h > ch) { w = w * ch / h; h = ch; }
        return M.photoItem(id, { frame: fr, x: cx - w / 2, y: cy - h / 2, w, h, rot: c[4] + (opt.jitter ? (Math.random() - 0.5) * 2 : 0), seq: k });
      });
      return { name: lay.name, items };
    });
  };
  M.photoItem = function (mid, o) {
    o = o || {};
    const i = info[mid] || {}, ex = i.exif || {};
    const d = ex.t ? new Date(ex.t) : null;
    const it = { id: M.uid('i'), type: 'photo', media: mid, frame: o.frame || 'bord', shape: 'rect', x: o.x || 0, y: o.y || 0, w: o.w || 400, h: o.h || 300, rot: o.rot || 0, filter: 'aucun', adj: {}, crop: {}, o: {} };
    if (d) { it.o.pmDate = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.'); it.o.dsText = ('0' + d.getDate()).slice(-2) + ' ' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ’' + String(d.getFullYear()).slice(-2); it.o.tDate = d.toLocaleDateString('fr-FR'); }
    if (ex.place) { const town = ex.place.split(',')[0]; it.o.pmCity = town; it.o.cap = town; }
    else it.o.cap = '';
    if (it.frame === 'polaroid' && d && !it.o.cap) it.o.cap = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return it;
  };
})();
