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
  const infoOf = (m) => ({ w: m.w, h: m.h, name: m.name, exif: m.exif || {}, carnet: m.carnet, added: m.added || 0, rank: m.rank || 0, fdate: m.fdate || 0 });
  M.loadMedia = async function (cid) {
    const l = await M.mediaOf(cid);
    l.forEach((m) => { info[m.id] = infoOf(m); });
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
      info[id] = infoOf(m);
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
    // rang : ordre d'arrivée (ordre de sélection) ; fdate : date du fichier, à défaut de date de prise de vue
    const fdate = (extra && extra.fdate) || blob.lastModified || 0;
    const m = { id: M.uid('m'), carnet: cid, name: name || 'photo.jpg', full: full.b, mid: mid.b, w: full.w, h: full.h, exif: { date: ex.date || '', t: M.exifTime(ex.date), lat: ex.lat, lon: ex.lon, orientation: ex.orientation || 1 }, added: Date.now(), rank: M.nextRank(), fdate };
    await M.putMedia(m);
    info[m.id] = infoOf(m);
    return m;
  };

  /* ---------------- Ordre des photos ---------------- */
  // Réglage du carnet (c.ordre) : date de prise de vue (EXIF, puis date du fichier) par défaut, ordre de sélection, ou nom du
  // fichier en ordre naturel (IMG_2 avant IMG_10). « fill » : optimiser le remplissage (photos larges dans les cases larges,
  // peut changer l'ordre), décoché par défaut.
  let rankSeq = 0;
  M.nextRank = () => { const t = Date.now() * 1000; rankSeq = Math.max(rankSeq + 1, t); return rankSeq; };
  M.ORD = [['date', 'Date de prise de vue', 'EXIF, sinon date du fichier'], ['selection', 'Ordre de sélection', 'Dans l’ordre où tu les as choisies'], ['nom', 'Nom du fichier', 'Ordre naturel : IMG_2 avant IMG_10']];
  M.ordre = function (c) { const o = (c && c.ordre) || {}; return { mode: M.ORD.some((x) => x[0] === o.mode) ? o.mode : 'date', fill: !!o.fill }; };
  const coll = (window.Intl && Intl.Collator) ? new Intl.Collator('fr', { numeric: true, sensitivity: 'base' }) : null;
  M.natCmp = (a, b) => coll ? coll.compare(String(a || ''), String(b || '')) : String(a || '').localeCompare(String(b || ''), 'fr', { numeric: true });
  /** Heure d'une photo : prise de vue (EXIF ou index du voyage), sinon date du fichier, sinon arrivée dans le carnet */
  M.timeOf = (id) => { const i = info[id] || {}; return (i.exif && i.exif.t) || i.fdate || i.added || 0; };
  /** Trie des photos selon le mode (tri stable : à égalité, l'ordre reçu est gardé). « selection » : ordre d'arrivée dans le
      carnet (rang), à défaut l'ordre reçu. */
  M.sortIds = function (ids, mode) {
    const idx = new Map(); ids.forEach((id, i) => { if (!idx.has(id)) idx.set(id, i); });
    const nm = (id) => (info[id] || {}).name || '', rk = (id) => { const i = info[id] || {}; return i.rank || i.added || 0; };
    const cmp = {
      date: (a, b) => (M.timeOf(a) - M.timeOf(b)) || M.natCmp(nm(a), nm(b)),
      nom: (a, b) => M.natCmp(nm(a), nm(b)) || (M.timeOf(a) - M.timeOf(b)),
      selection: (a, b) => (rk(a) && rk(b) ? rk(a) - rk(b) : 0)
    }[mode || 'date'] || (() => 0);
    return ids.slice().sort((a, b) => cmp(a, b) || (idx.get(a) - idx.get(b)));
  };
  /** Ordre de lecture de cases [x, y, w, h, …] : par rangées (de haut en bas), puis de gauche à droite dans la rangée.
      Une case rejoint la rangée si son haut est à moins d'une demi-hauteur (de la plus petite des deux) du haut de la
      première case de la rangée : cases de travers ou décalées gardent leur rangée ; une grande case « vedette » sur deux
      rangées est lue en premier, puis les petites à sa droite, de haut en bas. → indices dans l'ordre de lecture */
  M.readingOrder = function (cells) {
    const ix = cells.map((c, i) => i).sort((a, b) => (cells[a][1] - cells[b][1]) || (cells[a][0] - cells[b][0]));
    const rowsOut = []; let row = null;
    ix.forEach((i) => {
      const c = cells[i];
      if (row && c[1] - cells[row[0]][1] < 0.5 * Math.min(c[3], cells[row[0]][3])) row.push(i);
      else { row = [i]; rowsOut.push(row); }
    });
    return rowsOut.flatMap((r) => r.sort((a, b) => (cells[a][0] - cells[b][0]) || (cells[a][1] - cells[b][1])));
  };
  /** Tirage pseudo-aléatoire à graine fixe (même graine → mêmes valeurs à chaque recomposition) */
  M.seeded = function (seed) {
    let h = 2166136261; String(seed).split('').forEach((ch) => { h = Math.imul(h ^ ch.charCodeAt(0), 16777619); });
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  /** Photo ajustée dans une case (boîte [x, y, w, h]) : cadre, inclinaison, proportions de la photo, centrée */
  M.fitIn = function (box, mid, frame, rot) {
    const cw = box[2], ch = box[3];
    let w = cw, h = A.idealH(frame, w, info[mid]);
    if (h > ch) { w = w * ch / h; h = ch; }
    const ra = Math.abs(rot || 0) * Math.PI / 180, bw = w * Math.cos(ra) + h * Math.sin(ra), bh = w * Math.sin(ra) + h * Math.cos(ra);
    const kf = Math.min(1, cw / bw, ch / bh); w *= kf; h *= kf;
    return { x: box[0] + cw / 2 - w / 2, y: box[1] + ch / 2 - h / 2, w, h };
  };
  /** Photos d'une page dans l'ordre de lecture (position des cases) → éléments photo */
  M.photosInOrder = function (page) {
    const ph = (page.items || []).filter((x) => x.type === 'photo' && x.media);
    const box = (it) => it.cell || [it.x, it.y, it.w, it.h];
    return M.readingOrder(ph.map(box)).map((i) => ph[i]);
  };
  /** Ordre voulu pour des photos d'une page : réglage du carnet, la photo « vedette » choisie d'abord */
  M.wantedOrder = function (ids, mode, vedette) {
    const l = M.sortIds(ids, mode);
    if (vedette && l.includes(vedette)) return [vedette].concat(l.filter((x) => x !== vedette));
    return l;
  };
  /** Replace les photos de pages (à la suite, page après page) dans les cases existantes, dans l'ordre voulu (order : médias
      dans l'ordre ; sinon réglage « mode », la vedette d'une page seule en tête). Cases, cadres, inclinaisons et textes ou
      décorations ajoutés à la main restent ; chaque photo garde ses réglages (filtre, légende du cadre…) et sa légende
      rattachée (texte « cap ») la suit, même sur une autre page. → true si quelque chose a bougé */
  M.reorderPages = function (pages, mode, order) {
    const slots = pages.flatMap((p) => M.photosInOrder(p).map((it) => ({ p, it })));
    if (slots.length < 2) return false;
    const cur = slots.map((x) => x.it.media), uniq = Array.from(new Set(cur));
    const want = order ? order.filter((id) => cur.includes(id)) : pages.length === 1 ? M.wantedOrder(uniq, mode, pages[0].vedette) : M.sortIds(uniq, mode);
    // une même photo posée deux fois : autant de fois qu'avant
    const left = cur.slice(), seq = [];
    want.forEach((id) => { for (let k = left.indexOf(id); k >= 0; k = left.indexOf(id)) { seq.push(id); left.splice(k, 1); } });
    left.forEach((id) => seq.push(id));
    if (seq.every((id, i) => id === cur[i])) return false;
    const byMedia = {}; slots.forEach((x) => { (byMedia[x.it.media] = byMedia[x.it.media] || []).push(x); });
    const moves = seq.map((id, k) => {
      const slot = slots[k], src = byMedia[id].shift(), s0 = slot.it;
      const box = s0.cell || [s0.x, s0.y, s0.w, s0.h];
      const f = M.fitIn(box, id, s0.frame, s0.rot);
      const it = Object.assign({}, src.it, { x: f.x, y: f.y, w: f.w, h: f.h, rot: s0.rot, frame: s0.frame, shape: s0.shape, shadow: s0.shadow, cell: s0.cell });
      ['cell', 'shape', 'shadow'].forEach((key) => { if (s0[key] === undefined) delete it[key]; });
      if (s0.group) it.group = s0.group; else delete it.group;
      return { slot, src, it };
    });
    // légendes rattachées : suivent leur photo (sous elle comme avant), sur sa nouvelle page s'il le faut
    const done = new Set();
    moves.forEach((m) => {
      if (done.has(m.src.it.media)) return; done.add(m.src.it.media);
      m.src.p.items.filter((t) => t.type === 'text' && t.cap === m.src.it.media).forEach((t) => {
        const a = m.src.it, b = m.it;
        t.x = Math.max(10, Math.min(W - t.w - 10, t.x + (b.x + b.w / 2) - (a.x + a.w / 2)));
        t.y = Math.max(10, Math.min(H - (t.h || 0) - 10, t.y + (b.y + b.h) - (a.y + a.h)));
        if (m.slot.p !== m.src.p) { m.src.p.items.splice(m.src.p.items.indexOf(t), 1); m.slot.p.items.push(t); }
      });
    });
    moves.forEach((m) => { const l = m.slot.p.items, k = l.indexOf(m.slot.it); if (k >= 0) l[k] = m.it; });
    return true;
  };
  M.reorderPage = (page, mode, order) => M.reorderPages([page], mode, order);
  /** Date d'une page : jour du voyage (minuit : avant toute autre page de ce jour), sinon la plus ancienne photo (0 : sans date) */
  M.pageTime = function (page) {
    if (page.jour) return new Date(page.jour + 'T00:00').getTime();
    const t = (page.items || []).filter((x) => x.type === 'photo' && x.media).map((x) => M.timeOf(x.media)).filter((x) => x > 0);
    return t.length ? Math.min.apply(null, t) : 0;
  };
  /** Trie les pages par date. Une page sans date (carte, page de texte) reste attachée à la page qui la précède ; celles du
      début restent au début. Tri stable : à date égale (pages d'un même jour du voyage), l'ordre actuel est gardé.
      → true si l'ordre a changé */
  M.sortPagesByDate = function (c) {
    const groups = [], head = [];
    c.pages.forEach((p, i) => {
      const t = M.pageTime(p);
      if (t) groups.push({ t, i, pages: [p] });
      else if (groups.length) groups[groups.length - 1].pages.push(p);
      else head.push(p);
    });
    const out = head.concat(groups.sort((a, b) => (a.t - b.t) || (a.i - b.i)).flatMap((g) => g.pages));
    if (out.every((p, i) => p === c.pages[i])) return false;
    c.pages = out;
    return true;
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
      list.push({ id: m.id, name: m.name, w: m.w, h: m.h, exif: m.exif, added: m.added, rank: m.rank || 0, fdate: m.fdate || 0 });
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
      await M.putMedia({ id: nid, carnet: c.id, name: m.name, full, mid, w: m.w, h: m.h, exif: m.exif || {}, added: m.added || Date.now(), rank: m.rank || 0, fdate: m.fdate || 0 });
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

  /* ---------------- Composer : mises en page automatiques de 1 à 9 photos ---------------- */
  // Chaque agencement : liste de cases [x, y, w, h, rot, cadre] en fractions de la zone utilisée ; les cases ne se chevauchent
  // jamais et la photo (inclinée comprise) est ajustée à l'intérieur de sa case : aucune photo n'en recouvre une autre.
  /** Grille en blocs : cols × rows unités, chaque bloc [col, rang, largeur, hauteur] (en unités), marges et gouttières */
  function blocks(cols, rows, list, o) {
    o = o || {};
    const mx = o.mx == null ? 0.05 : o.mx, my = o.my == null ? 0.035 : o.my, gx = o.gx == null ? 0.04 : o.gx, gy = o.gy == null ? 0.03 : o.gy;
    const uw = (1 - 2 * mx - gx * (cols - 1)) / cols, uh = (1 - 2 * my - gy * (rows - 1)) / rows;
    return list.map((b, i) => [mx + b[0] * (uw + gx), my + b[1] * (uh + gy), b[2] * uw + (b[2] - 1) * gx, b[3] * uh + (b[3] - 1) * gy, 0, (o.frames || ['bord'])[i % (o.frames || ['bord']).length]]);
  }
  /** Rangées de cases égales : [3, 2, 3] → 3 cases, puis 2 (centrées), puis 3 */
  function rows(spec, o) {
    o = o || {};
    const most = Math.max.apply(null, spec), list = [];
    spec.forEach((n, r) => { const off = (most - n) / 2; for (let i = 0; i < n; i++) list.push([off + i, r, 1, 1]); });
    return blocks(most, spec.length, list, o);
  }
  /** Façon scrapbook : chaque photo légèrement de travers et décalée dans sa case (sans en sortir) */
  function askew(cells, rots, frames, k) {
    k = k == null ? 0.07 : k;
    return cells.map((c, i) => {
      const dx = (i % 2 ? 1 : -1) * c[2] * k * 0.5, dy = ((i >> 1) % 2 ? 1 : -1) * c[3] * k * 0.4;
      return [c[0] + c[2] * k / 2 + dx, c[1] + c[3] * k / 2 + dy, c[2] * (1 - k), c[3] * (1 - k), rots[i % rots.length], frames[i % frames.length]];
    });
  }
  const TILT = [-4, 3, -2, 4, -3, 2, -5, 3.5, -1.5];
  const MIX = ['polaroid', 'washi', 'timbre', 'coins', 'punaise', 'bord', 'trombone', 'dechire', 'polaroid'];
  const L = {
    1: [
      { name: 'Vedette', cells: [[0.1, 0.06, 0.8, 0.86, -1.5, 'polaroid']] },
      { name: 'Pleine page', cells: [[0.05, 0.04, 0.9, 0.92, 0, 'bord']] },
      { name: 'Coins photo', cells: [[0.1, 0.08, 0.8, 0.8, 0, 'coins']] },
      { name: 'Carte postale', cells: [[0.05, 0.1, 0.9, 0.78, -2, 'carte-postale']] }
    ],
    2: [
      { name: 'Duo', cells: [[0.06, 0.03, 0.58, 0.46, -3, 'polaroid'], [0.36, 0.51, 0.58, 0.46, 3, 'timbre']] },
      { name: 'Duo empilé', cells: [[0.12, 0.03, 0.76, 0.46, -1.5, 'bord'], [0.12, 0.52, 0.76, 0.46, 1.5, 'bord']] },
      { name: 'Côte à côte', cells: [[0.04, 0.12, 0.44, 0.74, -2.5, 'polaroid'], [0.52, 0.16, 0.44, 0.74, 2.5, 'polaroid']] },
      { name: 'Cartes postales', cells: [[0.06, 0.04, 0.88, 0.44, -2, 'carte-postale'], [0.06, 0.52, 0.88, 0.44, 2, 'carte-postale']] }
    ],
    3: [
      { name: 'Classique', cells: [[0.07, 0.05, 0.86, 0.42, 0, 'bord'], [0.07, 0.52, 0.41, 0.38, 0, 'bord'], [0.52, 0.52, 0.41, 0.38, 0, 'bord']] },
      { name: 'Polaroids', cells: [[0.04, 0.03, 0.5, 0.46, -5, 'polaroid'], [0.56, 0.1, 0.4, 0.4, 4, 'polaroid'], [0.2, 0.52, 0.6, 0.45, -2, 'polaroid']] },
      { name: 'Timbres', cells: [[0.1, 0.1, 0.38, 0.32, -4, 'timbre'], [0.53, 0.2, 0.38, 0.32, 5, 'timbre'], [0.25, 0.56, 0.45, 0.36, -2, 'timbre']] },
      { name: 'Bandeau', cells: [[0, 0, 1, 0.4, 0, 'aucun'], [0.08, 0.46, 0.4, 0.46, 3, 'washi'], [0.53, 0.5, 0.4, 0.42, -3, 'washi']] },
      { name: 'Colonne', cells: rows([1, 1, 1], { mx: 0.14 }) },
      { name: 'De travers', cells: askew(rows([2, 1]), [-4, 3.5, -1.5], ['polaroid', 'polaroid', 'polaroid']) }
    ],
    4: [
      { name: 'Grille', cells: [[0.06, 0.05, 0.42, 0.42, 0, 'bord'], [0.52, 0.05, 0.42, 0.42, 0, 'bord'], [0.06, 0.52, 0.42, 0.42, 0, 'bord'], [0.52, 0.52, 0.42, 0.42, 0, 'bord']] },
      { name: 'Album', cells: [[0.08, 0.06, 0.4, 0.38, -2, 'coins'], [0.53, 0.1, 0.4, 0.34, 2, 'coins'], [0.07, 0.52, 0.4, 0.34, 1, 'coins'], [0.52, 0.5, 0.41, 0.4, -2, 'coins']] },
      { name: 'Vedette', cells: [[0.06, 0.04, 0.88, 0.48, 0, 'bord'], [0.05, 0.58, 0.29, 0.34, -3, 'polaroid'], [0.36, 0.6, 0.29, 0.34, 2, 'polaroid'], [0.67, 0.58, 0.29, 0.34, -1, 'polaroid']] },
      { name: 'Bric-à-brac', cells: [[0.04, 0.04, 0.47, 0.38, -6, 'punaise'], [0.53, 0.1, 0.43, 0.34, 5, 'trombone'], [0.06, 0.5, 0.43, 0.4, 3, 'dechire'], [0.52, 0.52, 0.43, 0.38, -4, 'timbre']] },
      { name: 'De travers', cells: askew(rows([2, 2]), TILT, ['polaroid']) }
    ],
    5: [
      { name: 'Mosaïque', cells: [[0.05, 0.04, 0.9, 0.36, 0, 'bord'], [0.05, 0.44, 0.43, 0.25, 0, 'bord'], [0.52, 0.44, 0.43, 0.25, 0, 'bord'], [0.05, 0.72, 0.43, 0.25, 0, 'bord'], [0.52, 0.72, 0.43, 0.25, 0, 'bord']] },
      { name: 'Éparpillé', cells: [[0.04, 0.03, 0.44, 0.3, -6, 'polaroid'], [0.52, 0.05, 0.44, 0.3, 5, 'polaroid'], [0.28, 0.36, 0.44, 0.28, -2, 'polaroid'], [0.04, 0.67, 0.44, 0.3, 4, 'polaroid'], [0.52, 0.67, 0.44, 0.3, -5, 'polaroid']] },
      { name: 'Collection de timbres', cells: [[0.07, 0.06, 0.4, 0.27, -3, 'timbre'], [0.53, 0.06, 0.4, 0.27, 2, 'timbre'], [0.3, 0.37, 0.4, 0.27, -1, 'timbre'], [0.07, 0.68, 0.4, 0.27, 3, 'timbre'], [0.53, 0.68, 0.4, 0.27, -2, 'timbre']] },
      { name: 'Washi', cells: [[0.06, 0.05, 0.55, 0.38, -2, 'washi'], [0.63, 0.08, 0.32, 0.3, 4, 'washi'], [0.06, 0.48, 0.32, 0.3, 3, 'washi'], [0.4, 0.46, 0.55, 0.32, -3, 'washi'], [0.25, 0.79, 0.5, 0.18, 1, 'washi']] },
      { name: 'Grille', cells: rows([2, 1, 2]) }
    ],
    6: [
      { name: 'Planche contact', cells: [[0.05, 0.04, 0.43, 0.29, 0, 'bord'], [0.52, 0.04, 0.43, 0.29, 0, 'bord'], [0.05, 0.355, 0.43, 0.29, 0, 'bord'], [0.52, 0.355, 0.43, 0.29, 0, 'bord'], [0.05, 0.67, 0.43, 0.29, 0, 'bord'], [0.52, 0.67, 0.43, 0.29, 0, 'bord']] },
      { name: 'Polaroids', cells: [[0.03, 0.04, 0.46, 0.3, -5, 'polaroid'], [0.51, 0.05, 0.46, 0.3, 4, 'polaroid'], [0.03, 0.36, 0.46, 0.3, 3, 'polaroid'], [0.52, 0.36, 0.45, 0.3, -3, 'polaroid'], [0.03, 0.67, 0.46, 0.3, -2, 'polaroid'], [0.51, 0.68, 0.46, 0.3, 5, 'polaroid']] },
      { name: 'Vedette et timbres', cells: [[0.05, 0.04, 0.9, 0.42, 0, 'coins'], [0.05, 0.52, 0.28, 0.2, -3, 'timbre'], [0.36, 0.52, 0.28, 0.2, 2, 'timbre'], [0.67, 0.52, 0.28, 0.2, -1, 'timbre'], [0.1, 0.76, 0.38, 0.2, 2, 'bord'], [0.52, 0.76, 0.38, 0.2, -2, 'bord']] },
      { name: 'Souvenirs', cells: [[0.04, 0.04, 0.44, 0.27, -4, 'trombone'], [0.52, 0.05, 0.44, 0.3, 3, 'punaise'], [0.08, 0.36, 0.4, 0.28, 2, 'dechire'], [0.52, 0.4, 0.42, 0.26, -3, 'washi'], [0.05, 0.69, 0.44, 0.27, 3, 'coins'], [0.52, 0.7, 0.43, 0.26, -2, 'timbre']] },
      { name: 'Mosaïque', cells: blocks(3, 3, [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1]]) }
    ],
    7: [
      { name: 'Mosaïque', cells: blocks(3, 4, [[0, 0, 3, 2], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [0, 3, 1, 1], [1, 3, 1, 1], [2, 3, 1, 1]]) },
      { name: 'De travers', cells: askew(rows([2, 3, 2]), TILT, ['polaroid']) },
      { name: 'Grille', cells: rows([2, 3, 2]) },
      { name: 'Collection de timbres', cells: askew(rows([3, 1, 3]), TILT, ['timbre'], 0.05) },
      { name: 'Souvenirs', cells: askew(rows([2, 3, 2]), TILT, MIX) }
    ],
    8: [
      { name: 'Grille', cells: blocks(2, 4, [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1], [0, 3, 1, 1], [1, 3, 1, 1]]) },
      { name: 'De travers', cells: askew(rows([3, 2, 3]), TILT, ['polaroid']) },
      // case haute à gauche (pas en bas à droite) : la dernière photo finit en bas à droite
      { name: 'Mosaïque', cells: blocks(3, 4, [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1], [0, 2, 1, 2], [1, 2, 1, 1], [2, 2, 1, 1], [1, 3, 1, 1], [2, 3, 1, 1]]) },
      { name: 'Collection de timbres', cells: askew(rows([3, 2, 3]), TILT, ['timbre'], 0.05) },
      { name: 'Souvenirs', cells: askew(rows([3, 2, 3]), TILT, MIX) }
    ],
    9: [
      { name: 'Grille', cells: rows([3, 3, 3]) },
      { name: 'De travers', cells: askew(rows([3, 3, 3]), TILT, ['polaroid']) },
      { name: 'Mosaïque', cells: blocks(3, 4, [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1], [0, 3, 1, 1], [1, 3, 1, 1], [2, 3, 1, 1]]) },
      { name: 'Collection de timbres', cells: askew(rows([3, 3, 3]), TILT, ['timbre'], 0.05) },
      { name: 'Souvenirs', cells: askew(rows([3, 3, 3]), TILT, MIX) }
    ]
  };
  // cases de chaque agencement rangées dans l'ordre de lecture : la photo n° 1 va en haut à gauche (ou dans la grande case du
  // haut), la dernière en bas à droite
  Object.keys(L).forEach((n) => L[n].forEach((lay) => { lay.cells = M.readingOrder(lay.cells).map((i) => lay.cells[i]); }));
  M.LAYOUTS = L;
  M.MAXN = 9;
  /** Cadres lourds (billet, étiquette, carte postale) illisibles en petit : simplifiés en bord blanc */
  M.lightFrame = function (fr, w) {
    if ((fr === 'ticket' || fr === 'etiquette') && w < 380) return 'bord';
    if (fr === 'carte-postale' && w < 320) return 'bord';
    return fr;
  };
  /** Répartition de n photos en pages de k au plus : sans « équilibrer », k, k, … et le reste (10 à 4 : 4 + 4 + 2) ;
      en équilibrant, pages de tailles voisines sans dépasser k (10 à 4 : 4 + 3 + 3). k « auto » : 6 au plus, équilibré. */
  M.split = function (n, k, eq) {
    if (!(n > 0)) return [];
    if (!(+k >= 1)) { k = 6; eq = true; }
    k = Math.min(M.MAXN, Math.floor(+k));
    const pages = Math.ceil(n / k), out = [];
    for (let i = 0; i < pages; i++) out.push(eq ? Math.floor(n / pages) + (i < n % pages ? 1 : 0) : Math.min(k, n - i * k));
    return out;
  };
  /** Propositions pour n photos (1 à 9) : [{name, items, cells}] — les photos sont posées à la suite, dans l'ordre reçu et
      dans l'ordre de lecture des cases (de gauche à droite, puis de haut en bas) ; avec opt.fill (« Optimiser le remplissage »),
      les photos les plus horizontales vont dans les cases larges (l'ordre peut changer).
      opt : fill ; jitter et seed (inclinaisons un peu variées, tirage à graine fixe : stables d'une recomposition à l'autre) ; area {x, y, w, h} (fractions de page : zone utilisée, sous un titre par exemple) ;
      frame(cadre, i) → cadre imposé ; rot(i, rot) → inclinaison imposée ; room(id, largeur, hauteur de la case, inclinaison) → part de la case
      (0 à 0,4) laissée sous la photo pour une légende. Chaque photo, inclinée comprise, tient dans sa case. */
  M.compose = function (mediaIds, opt) {
    opt = opt || {};
    const n = Math.max(1, Math.min(M.MAXN, mediaIds.length)), ids = mediaIds.slice(0, n);
    const ar0 = opt.area || { x: 0, y: 0, w: 1, h: 1 };
    const ratio = (id) => { const i = info[id] || {}; return i.w && i.h ? i.w / i.h : 4 / 3; };
    return (L[n] || []).map((lay, k) => {
      const assign = {};
      if (opt.fill) {
        const cells = lay.cells.map((c, i) => ({ c, i, ar: (c[2] * ar0.w * W) / (c[3] * ar0.h * H) }));
        const byCell = cells.slice().sort((a, b) => (b.ar - a.ar) || (a.i - b.i)), byPhoto = ids.slice().sort((a, b) => (ratio(b) - ratio(a)) || (ids.indexOf(a) - ids.indexOf(b)));
        byCell.forEach((c, i) => { assign[c.i] = byPhoto[i]; });
      } else ids.forEach((id, i) => { assign[i] = id; });
      const rnd = opt.jitter ? M.seeded((opt.seed || 'p') + ':' + lay.name) : null;
      const rects = [];
      const items = lay.cells.map((c, i) => {
        const id = assign[i];
        const cw = c[2] * ar0.w * W, ch0 = c[3] * ar0.h * H, x0 = (ar0.x + c[0] * ar0.w) * W, y0 = (ar0.y + c[1] * ar0.h) * H;
        let rot = opt.rot ? opt.rot(i, c[4]) : c[4];
        if (rnd) rot += Math.round((rnd() - 0.5) * 20) / 10;
        const room = opt.room ? Math.max(0, Math.min(0.4, opt.room(id, cw, ch0, rot) || 0)) : 0, ch = ch0 * (1 - room);
        let fr = opt.frame ? opt.frame(c[5], i) : c[5];
        fr = M.lightFrame(fr, cw);
        let w = cw, h = A.idealH(fr, w, info[id]);
        if (h > ch) { w = w * ch / h; h = ch; }
        // inclinée, la photo occupe une boîte plus grande : réduite pour rester dans sa case
        const ra = Math.abs(rot) * Math.PI / 180, bw = w * Math.cos(ra) + h * Math.sin(ra), bh = w * Math.sin(ra) + h * Math.cos(ra);
        const kf = Math.min(1, cw / bw, ch / bh); w *= kf; h *= kf;
        const cx = x0 + cw / 2, cy = y0 + ch / 2;
        rects.push({ x: x0, y: y0, w: cw, h: ch0, rot, frame: fr, media: id });
        const it = M.photoItem(id, { frame: fr, x: cx - w / 2, y: cy - h / 2, w, h, rot, seq: k });
        it.cell = [x0, y0, cw, ch].map((v) => Math.round(v * 10) / 10);   // case de la photo : « Remettre dans l'ordre »
        return it;
      });
      return { name: lay.name, items, cells: rects };
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
