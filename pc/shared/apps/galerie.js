/* =====================================================================
   Galerie sur PC : pont simulé window.MAGGalerie (même interface que
   applis/scripts/GalerieBridge.java), au-dessus d'un DOSSIER PHOTOS du PC
   choisi avec File System Access (Images, un disque, une clé USB…).
   - load : photos (JPEG, PNG, WebP, GIF, AVIF) et vidéos (MP4, WebM, MOV)
     du dossier et de ses sous-dossiers ; date de prise de vue, taille,
     orientation et GPS lus dans l'EXIF des JPEG (cache IndexedDB « galerie-pc ») ;
   - thumbs / preview / region / info / geoScan : calculés dans le navigateur ;
   - favoris : gardés dans ce navigateur ;
   - corbeille : dossier « .corbeille-galerie » à la racine du dossier choisi
     (30 jours) ; « Supprimer définitivement » efface vraiment le fichier ;
   - saveCopy (éditeur) : copie JPEG dans le sous-dossier « Galerie » ;
   - partager : partage de Windows, sinon téléchargement ; ouvrir avec : nouvel onglet ;
   - fond d'écran, « utiliser comme », « modifier avec » : indisponibles sur PC.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var KEY = 'galerie-dossier', TRASH = '.corbeille-galerie', COPY = 'Galerie', DAY = 864e5;
  var IMG = /\.(jpe?g|png|webp|gif|avif|bmp)$/i, VID = /\.(mp4|m4v|webm|mov|ogv)$/i;
  var MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg' };
  var db = M.openDb('galerie-pc', ['meta', 'thumbs', 'trash'], 1);
  var ROOT = null, ROWS = [], BYID = {}, HANDLES = {}, TROWS = [], THANDLES = {}, EXT = null, PEND = '';
  var FAVS = M.store.get('galerie-pc-favs', {}) || {};

  function emit(type, o) { if (window.galerieEvent) window.galerieEvent(type, typeof o === 'string' ? o : JSON.stringify(o)); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 2000000000 + 1; }
  function ext(n) { return ((n.match(/\.([^.]+)$/) || [])[1] || '').toLowerCase(); }
  function idOf(tok) { return +String(tok).split(':')[0]; }
  function fileOf(tok) {
    if (tok === 'ext') return EXT ? Promise.resolve(EXT.file) : Promise.reject(new Error('Fichier introuvable'));
    var id = idOf(tok), h = HANDLES[id] || THANDLES[id];
    if (!h) return Promise.reject(new Error('Fichier introuvable'));
    return h.getFile();
  }
  function rowOf(id) { return BYID[id] || TROWS.filter(function (r) { return r[0] === id; })[0] || null; }

  /* ---------------- EXIF (JPEG) ---------------- */
  function exif(buf) {
    var v = new DataView(buf), o = {};
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return o;
    var p = 2;
    while (p + 4 < v.byteLength) {
      var mk = v.getUint16(p), len = v.getUint16(p + 2);
      if (mk === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) { p += 10; break; }
      if ((mk & 0xFF00) !== 0xFF00 || mk === 0xFFDA) return o;
      p += 2 + len;
    }
    if (p + 8 >= v.byteLength) return o;
    var t = p, le = v.getUint16(t) === 0x4949;
    var u16 = function (a) { return v.getUint16(a, le); }, u32 = function (a) { return v.getUint32(a, le); };
    var rat = function (a) { var d = u32(a + 4); return d ? u32(a) / d : 0; };
    function val(e) {
      var type = u16(e + 2), n = u32(e + 4), size = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] || 1, at = n * size > 4 ? t + u32(e + 8) : e + 8;
      if (at + n * size > v.byteLength) return null;
      if (type === 2) { var s = ''; for (var i = 0; i < n - 1; i++) { var c = v.getUint8(at + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
      if (type === 3) return n === 1 ? u16(at) : Array.from({ length: n }, function (_, i) { return u16(at + 2 * i); });
      if (type === 4) return n === 1 ? u32(at) : Array.from({ length: n }, function (_, i) { return u32(at + 4 * i); });
      if (type === 5) return n === 1 ? rat(at) : Array.from({ length: n }, function (_, i) { return rat(at + 8 * i); });
      if (type === 1 || type === 7) return v.getUint8(at);
      return null;
    }
    function ifd(off, tags) {
      if (!off || t + off + 2 > v.byteLength) return;
      var a = t + off, n = u16(a);
      for (var i = 0; i < n; i++) { var e = a + 2 + i * 12; if (e + 12 > v.byteLength) break; var tag = u16(e); if (tags[tag]) o[tags[tag]] = val(e); }
    }
    ifd(u32(t + 4), { 0x10f: 'make', 0x110: 'model', 0x112: 'ori', 0x132: 'date0', 0x8769: 'exifIfd', 0x8825: 'gpsIfd' });
    if (o.exifIfd) ifd(o.exifIfd, { 0x9003: 'date', 0x829d: 'f', 0x829a: 'exp', 0x8827: 'iso', 0x920a: 'focal', 0xa405: 'focal35', 0x9209: 'flash', 0xa002: 'w', 0xa003: 'h', 0xa434: 'lens' });
    if (o.gpsIfd) ifd(o.gpsIfd, { 1: 'latRef', 2: 'lat', 3: 'lonRef', 4: 'lon', 5: 'altRef', 6: 'alt' });
    var dms = function (a) { return Array.isArray(a) ? a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600 : null; };
    if (o.lat && o.lon) { o.la = dms(o.lat) * (o.latRef === 'S' ? -1 : 1); o.lo = dms(o.lon) * (o.lonRef === 'W' ? -1 : 1); if (!o.la && !o.lo) { delete o.la; delete o.lo; } }
    var d = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(o.date || o.date0 || '');
    if (d) o.taken = new Date(+d[1], d[2] - 1, +d[3], +d[4], +d[5], +d[6]).getTime();
    delete o.exifIfd; delete o.gpsIfd; delete o.lat; delete o.lon;
    return o;
  }
  function meta(h, f, rel) {
    var k = rel + '|' + f.size + '|' + f.lastModified;
    return db.get('meta', k).then(function (m) {
      if (m) return m;
      var p = /^image\/jpeg$/.test(f.type) || /\.jpe?g$/i.test(f.name) ? f.slice(0, 196608).arrayBuffer().then(function (b) { try { return exif(b); } catch (e) { return {}; } }) : Promise.resolve({});
      return p.then(function (x) { db.put('meta', x, k).catch(function () { }); return x; });
    }).catch(function () { return {}; });
  }

  /* ---------------- Inventaire ---------------- */
  function row(id, isV, f, m, rel, name, exp) {
    var w = m.w || 0, h = m.h || 0; if (m.ori >= 5) { var x = w; w = h; h = x; }
    var dir = rel.slice(0, rel.length - name.length), album = dir.replace(/\/$/, '').split('/').pop() || (ROOT ? ROOT.name : 'Dossier');
    return [id, isV ? 1 : 0, m.taken || f.lastModified, Math.round(f.lastModified / 1000), w, h, 0, dir || '/', album, name, rel, FAVS[id] ? 1 : 0, f.size, f.type || MIME[ext(name)] || '', dir, exp || 0];
  }
  async function walk(dh, path, out, depth) {
    if (depth > 12 || out.length > 60000) return;
    for await (var e of dh.values()) {
      if (e.kind === 'directory') { if (!/^\./.test(e.name) && e.name !== TRASH) await walk(e, path + e.name + '/', out, depth + 1); continue; }
      var isV = VID.test(e.name); if (!isV && !IMG.test(e.name)) continue;
      out.push({ h: e, rel: path + e.name, v: isV });
    }
  }
  async function loadAll(req) {
    var list = [];
    try { if (ROOT && await M.fs.perm(ROOT, 'read', true, 'Galerie') === 'granted') await walk(ROOT, '', list, 0); }
    catch (e) { emit('items', { req: req, start: 0, items: [], done: true, total: 0, err: e && e.cancel ? 'accès au dossier non autorisé' : String(e && e.message || e) }); return; }
    var rows = [], seen = {};
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      try {
        var f = await x.h.getFile(), m = await meta(x.h, f, x.rel), id = hash(x.rel);
        while (seen[id]) id++; seen[id] = 1;
        HANDLES[id] = x.h; rows.push(row(id, x.v, f, m, x.rel, x.h.name));
      } catch (e) { }
    }
    rows.sort(function (a, b) { return b[2] - a[2]; });
    ROWS = rows; BYID = {}; rows.forEach(function (r) { BYID[r[0]] = r; });
    if (!rows.length) { emit('items', { req: req, start: 0, items: [], done: true, total: 0 }); return; }
    for (var s = 0; s < rows.length; s += 2500) emit('items', { req: req, start: s, items: rows.slice(s, s + 2500), done: s + 2500 >= rows.length, total: rows.length });
  }
  async function trashDir(create) {
    if (!ROOT) return null;
    try { return await ROOT.getDirectoryHandle(TRASH, { create: !!create }); } catch (e) { return null; }
  }
  async function loadTrash(req) {
    TROWS = []; THANDLES = {};
    var d = await trashDir(false), now = Date.now();
    if (d) {
      var metas = await db.all('trash').catch(function () { return []; }), byName = {};
      (metas || []).forEach(function (m) { byName[m.name] = m; });
      for await (var e of d.values()) {
        if (e.kind !== 'file') continue;
        var m = byName[e.name] || { name: e.name, rel: e.name, at: now, id: hash(e.name) };
        if (now - m.at > 30 * DAY) { try { await d.removeEntry(e.name); await db.del('trash', e.name); } catch (x) { } continue; }
        try { var f = await e.getFile(); THANDLES[m.id] = e; TROWS.push(row(m.id, VID.test(e.name), f, {}, m.rel, m.rel.split('/').pop(), Math.round((m.at + 30 * DAY) / 1000))); } catch (x) { }
      }
    }
    emit('items', { req: req, start: 0, items: TROWS, done: true, total: TROWS.length });
  }

  /* ---------------- Images ---------------- */
  function vidFrame(f, max) {
    return new Promise(function (ok, ko) {
      var v = document.createElement('video'), u = URL.createObjectURL(f), fin = function (r, e) { URL.revokeObjectURL(u); v.removeAttribute('src'); r ? ok(r) : ko(e || new Error('vidéo illisible')); };
      v.muted = true; v.preload = 'metadata'; v.src = u;
      var to = setTimeout(function () { fin(null); }, 10000);
      v.onloadedmetadata = function () { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
      v.onseeked = function () { clearTimeout(to); var k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); fin({ c: c, w: c.width, h: c.height, dur: Math.round((v.duration || 0) * 1000), vw: v.videoWidth, vh: v.videoHeight }); };
      v.onerror = function () { clearTimeout(to); fin(null); };
    });
  }
  function render(f, max, square) {
    if (/^video\//.test(f.type) || VID.test(f.name || '')) return vidFrame(f, max).then(function (r) { return { url: r.c.toDataURL('image/jpeg', 0.82), w: r.w, h: r.h, dur: r.dur, vw: r.vw, vh: r.vh }; });
    return createImageBitmap(f, { imageOrientation: 'from-image' }).then(function (bm) {
      var k = square ? Math.min(1, max / Math.min(bm.width, bm.height)) : Math.min(1, max / Math.max(bm.width, bm.height));
      var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bm.width * k)); c.height = Math.max(1, Math.round(bm.height * k));
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0, c.width, c.height);
      var r = { url: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height, fw: bm.width, fh: bm.height }; if (bm.close) bm.close(); return r;
    });
  }
  var TQ = [], tBusy = 0, tOut = [], tFlush = null;
  function pushThumb(r) { tOut.push(r); if (!tFlush) tFlush = setTimeout(function () { var l = tOut; tOut = []; tFlush = null; emit('thumbs', l); }, 45); }
  function thumbLoop() {
    while (tBusy < 3 && TQ.length) (function (job) {
      tBusy++;
      var key = job.tok + '_' + job.size;
      db.get('thumbs', key).then(function (d) {
        if (d) return d;
        return fileOf(job.tok).then(function (f) { return render(f, job.size, true); }).then(function (r) {
          var row = rowOf(idOf(job.tok)); if (row && r.dur && !row[6]) row[6] = r.dur;
          db.put('thumbs', r.url, key).catch(function () { }); return r.url;
        });
      }).then(function (u) { pushThumb([job.tok, 'pc', u]); }, function () { pushThumb([job.tok, '', '']); })
        .then(function () { tBusy--; thumbLoop(); });
    })(TQ.shift());
  }

  /* ---------------- Pont ---------------- */
  function permState() { return JSON.stringify({ sdk: 34, any: !!ROOT, full: !!ROOT, partial: false, video: !!ROOT, loc: true, write: true, asked: !!ROOT, blocked: false, trash: true }); }
  function op(name, ok, toks) { emit('op', { op: name, ok: ok, toks: toks || '' }); }
  function toks(csv) { return String(csv || '').split(',').filter(Boolean); }
  var B = {
    version: function () { return '1-pc'; },
    sdk: function () { return 34; },
    thumbDir: function () { return ''; },
    permState: permState,
    askPerm: function () {
      if (typeof window.showDirectoryPicker !== 'function') { M.unavailable('Le choix d\'un dossier de photos', 'il faut Edge ou Chrome'); return; }
      M.withGesture(function () { return window.showDirectoryPicker({ mode: 'readwrite', id: 'galerie', startIn: 'pictures' }); }, { title: 'Galerie', label: 'Choisir le dossier…' }).then(function (h) {
        ROOT = h;
        return M.db.put('files', { id: KEY, app: M.app, name: h.name, handle: h, dir: true, at: Date.now() }).then(function () { emit('perm', permState()); });
      }).catch(function (e) { if (!e || (e.name !== 'AbortError' && !e.cancel)) M.toast('Dossier inaccessible : ' + (e && e.message || e), { bad: true }); });
    },
    openSettings: function () { B.askPerm(); },
    load: function (req, what) { (what === 'trash' ? loadTrash(req) : loadAll(req)).catch(function (e) { emit('items', { req: req, start: 0, items: [], done: true, total: 0, err: String(e && e.message || e) }); }); },
    item: function (tok) { var r = rowOf(idOf(tok)); return r ? JSON.stringify(r) : ''; },
    thumbs: function (csv, size) { TQ = toks(csv).map(function (t) { return { tok: t, size: Math.max(64, Math.min(size || 320, 1024)) }; }); thumbLoop(); },
    clearCache: function () { db.clear('thumbs').then(function () { emit('cache', {}); }); },
    preview: function (req, tok, max) {
      fileOf(tok).then(function (f) { return render(f, Math.max(256, Math.min(max || 2048, 4096))); })
        .then(function (r) { emit('preview', { req: req, ok: true, p: 'pc', d: r.url, w: r.w, h: r.h }); }, function (e) { emit('preview', { req: req, ok: false, err: e && e.message || 'Image illisible' }); });
    },
    region: function (req, tok, l, t, r, b, max) {
      fileOf(tok).then(function (f) { return createImageBitmap(f, { imageOrientation: 'from-image' }); }).then(function (bm) {
        var x = l * bm.width, y = t * bm.height, w = (r - l) * bm.width, h = (b - t) * bm.height, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        c.getContext('2d').drawImage(bm, x, y, w, h, 0, 0, c.width, c.height); if (bm.close) bm.close();
        emit('region', { req: req, ok: true, p: 'pc', d: c.toDataURL('image/jpeg', 0.9), l: l, t: t, r: r, b: b });
      }).catch(function (e) { emit('region', { req: req, ok: false, err: e && e.message || 'zone illisible' }); });
    },
    info: function (req, tok) {
      var row = tok === 'ext' ? null : rowOf(idOf(tok));
      fileOf(tok).then(function (f) {
        var o = { req: req, tok: tok, loc: true, ok: true, name: f.name, path: (ROOT ? ROOT.name + '/' : '') + (row ? row[10] : f.name), size: f.size, mime: f.type || MIME[ext(f.name)] || '' };
        if (/^video\//.test(o.mime)) return vidFrame(f, 64).then(function (r) { o.w = r.vw; o.h = r.vh; o.dur = r.dur; return o; }, function () { return o; });
        var m = /jpe?g$/.test(o.mime) ? f.slice(0, 196608).arrayBuffer().then(exif) : Promise.resolve({});
        return m.then(function (x) {
          o.make = x.make || ''; o.model = x.model || ''; o.lens = x.lens || ''; o.f = x.f || 0; o.exp = x.exp || 0; o.iso = x.iso || 0; o.focal = x.focal || 0; o.focal35 = x.focal35 || 0; o.flash = (x.flash || 0) & 1;
          o.exifDate = x.date || ''; if (x.la != null) { o.lat = x.la; o.lon = x.lo; } if (x.alt != null) o.alt = Math.round(x.alt * (x.altRef ? -1 : 1));
          if (x.w) { o.w = x.ori >= 5 ? x.h : x.w; o.h = x.ori >= 5 ? x.w : x.h; return o; }
          return createImageBitmap(f).then(function (bm) { o.w = bm.width; o.h = bm.height; if (bm.close) bm.close(); return o; }, function () { return o; });
        });
      }).then(function (o) { emit('info', o); }, function (e) { emit('info', { req: req, tok: tok, ok: false, err: e && e.message || 'illisible' }); });
    },
    geoScan: function () {
      (async function () {
        var imgs = ROWS.filter(function (r) { return !r[1] && /jpe?g/i.test(r[13] || r[9]); }), pts = [], done = 0, last = Date.now();
        emit('geo', { pts: [], done: 0, total: imgs.length, end: !imgs.length, loc: true });
        for (var i = 0; i < imgs.length; i++) {
          var r = imgs[i];
          try { var f = await HANDLES[r[0]].getFile(), m = await meta(HANDLES[r[0]], f, r[10]); if (m.la != null) pts.push([r[0], m.la, m.lo]); } catch (e) { }
          done++;
          if (Date.now() - last > 700) { emit('geo', { pts: pts, done: done, total: imgs.length, end: false, loc: true }); pts = []; last = Date.now(); }
        }
        emit('geo', { pts: pts, done: done, total: imgs.length, end: true, loc: true });
      })();
    },
    share: function (csv) {
      Promise.all(toks(csv).map(function (t) { return fileOf(t).catch(function () { return null; }); })).then(function (fs) {
        fs = fs.filter(Boolean); if (!fs.length) return;
        var can = false; try { can = !!(navigator.canShare && navigator.canShare({ files: fs })); } catch (e) { }
        if (can) return M.withGesture(function () { return navigator.share({ files: fs }); }, { title: 'Partager', label: 'Partager…' }).catch(function () { });
        fs.forEach(function (f) { M.fs.download(f, f.name); });
        M.toast(fs.length > 1 ? fs.length + ' fichiers téléchargés (partage indisponible sur ce PC)' : '« ' + fs[0].name + ' » téléchargé (partage indisponible sur ce PC)');
      });
    },
    openWith: function (tok) { fileOf(tok).then(function (f) { M.openBlob(f, f.name); }, function () { M.toast('Fichier introuvable', { bad: true }); }); },
    useAs: function () { M.unavailable('« Utiliser comme »'); },
    editWith: function (tok) { M.unavailable('« Modifier avec une autre appli »', 'utilise l\'éditeur de Galerie, ou ouvre la photo dans un onglet puis dans ton logiciel'); },
    openUrl: function (u) { M.nativeOpen(/^geo:/.test(u) ? 'https://www.openstreetmap.org/?mlat=' + (u.match(/geo:([-0-9.]+),([-0-9.]+)/) || [])[1] + '&mlon=' + (u.match(/geo:([-0-9.]+),([-0-9.]+)/) || [])[2] + '&zoom=15' : u); },
    immersive: function () { },
    setWallpaper: function (tok) { M.unavailable('Le fond d\'écran', 'dans Windows : Paramètres › Personnalisation › Arrière-plan'); op('wallpaper', false, tok); },
    favorite: function (csv, on) { toks(csv).forEach(function (t) { var id = idOf(t); if (on) FAVS[id] = 1; else delete FAVS[id]; if (BYID[id]) BYID[id][11] = on ? 1 : 0; }); M.store.set('galerie-pc-favs', FAVS); op(on ? 'fav' : 'unfav', true, csv); },
    trash: function (csv) {
      (async function () {
        if (await M.fs.perm(ROOT, 'readwrite', true, 'Galerie') !== 'granted') { op('trash', false, csv); M.toast('Windows n\'a pas autorisé la modification du dossier', { bad: true }); return; }
        var d = await trashDir(true), ok = true;
        for (var t of toks(csv)) {
          var id = idOf(t), h = HANDLES[id], r = BYID[id]; if (!h || !r) continue;
          try {
            var name = Date.now().toString(36) + '-' + h.name, f = await h.getFile();
            var w = await (await d.getFileHandle(name, { create: true })).createWritable(); await w.write(f); await w.close();
            await removeAt(r[10]);
            await db.put('trash', { name: name, rel: r[10], at: Date.now(), id: id }, name);
            delete HANDLES[id]; delete BYID[id];
          } catch (e) { ok = false; }
        }
        ROWS = ROWS.filter(function (r) { return BYID[r[0]]; });
        op('trash', ok, csv);
      })();
    },
    restore: function (csv) {
      (async function () {
        var d = await trashDir(false), ok = !!d, metas = await db.all('trash').catch(function () { return []; });
        for (var t of toks(csv)) {
          var id = idOf(t), m = (metas || []).filter(function (x) { return x.id === id; })[0]; if (!m || !d) { ok = false; continue; }
          try {
            var f = await (await d.getFileHandle(m.name)).getFile(), parts = m.rel.split('/'), dir = ROOT;
            for (var i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create: true });
            var w = await (await dir.getFileHandle(parts[parts.length - 1], { create: true })).createWritable(); await w.write(f); await w.close();
            await d.removeEntry(m.name); await db.del('trash', m.name);
          } catch (e) { ok = false; }
        }
        op('restore', ok, csv);
      })();
    },
    deleteForever: function (csv) {
      M.confirm('Supprimer définitivement ?', 'Sur PC, le fichier est effacé du disque, sans passer par la Corbeille de Windows.', 'Supprimer', true).then(function (yes) {
        if (!yes) { op('delete', false, csv); return; }
        (async function () {
          var d = await trashDir(false), metas = await db.all('trash').catch(function () { return []; }), ok = true;
          for (var t of toks(csv)) {
            var id = idOf(t), m = (metas || []).filter(function (x) { return x.id === id; })[0];
            try { if (m && d) { await d.removeEntry(m.name); await db.del('trash', m.name); } else if (BYID[id]) { await removeAt(BYID[id][10]); delete BYID[id]; delete HANDLES[id]; } } catch (e) { ok = false; }
          }
          op('delete', ok, csv);
        })();
      });
    },
    saveCopy: function (b64, name, srcTok) {
      (async function () {
        try {
          if (!ROOT) throw new Error('aucun dossier');
          if (await M.fs.perm(ROOT, 'readwrite', true, 'Galerie') !== 'granted') throw new Error('Windows n\'a pas autorisé l\'écriture');
          var n = String(name || ('Galerie_' + Date.now() + '.jpg')).replace(/[\\/:*?"<>|]/g, '_'); if (!/\.jpe?g$/i.test(n)) n += '.jpg';
          var dir = await ROOT.getDirectoryHandle(COPY, { create: true }), base = n, k = 1;
          while (true) { try { await dir.getFileHandle(n); n = base.replace(/(\.jpe?g)$/i, '_' + (k++) + '$1'); } catch (e) { break; } }
          var h = await dir.getFileHandle(n, { create: true }), w = await h.createWritable();
          await w.write(M.toBlob(String(b64).replace(/^data:[^,]*,/, ''), 'image/jpeg')); await w.close();
          var f = await h.getFile(), rel = COPY + '/' + n, id = hash(rel), src = srcTok ? rowOf(idOf(srcTok)) : null;
          HANDLES[id] = h; var r = row(id, false, f, { taken: src ? src[2] + 1000 : Date.now(), w: 0, h: 0 }, rel, n); BYID[id] = r; ROWS.unshift(r);
          emit('saved', { ok: true, tok: id + ':0', path: ROOT.name + '/' + rel, item: r });
        } catch (e) { emit('saved', { ok: false, err: e && e.message || String(e) }); }
      })();
    },
    pendingOpen: function () { var p = PEND; PEND = ''; return p; },
    finish: function () { }
  };
  async function removeAt(rel) {
    var parts = rel.split('/'), dir = ROOT;
    for (var i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
    await dir.removeEntry(parts[parts.length - 1]);
  }
  /** Lecture d'une vidéo (la page n'a pas d'adresse de fichier sur PC) : adresse blob: du fichier */
  B.pcVideo = function (tok) { return fileOf(tok).then(function (f) { return URL.createObjectURL(f); }, function () { return ''; }); };
  window.MAGGalerie = B;

  /* Dossier retenu d'une session à l'autre (Windows redemande l'accès d'un clic à la première lecture) */
  M.db.get('files', KEY).then(function (r) {
    if (!r || !r.handle) return;
    ROOT = r.handle;
    if (window.galerieEvent) emit('perm', permState());
  }).catch(function () { });

  /* Photos ou vidéos ouvertes avec « Ouvrir avec › Galerie » ou déposées sur la fenêtre */
  M.conf.dropHint = 'Photo ou vidéo à afficher';
  M.onFiles(function (o) {
    var f = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && (IMG.test(f.name) || VID.test(f.name)); })[0];
    if (!f) { M.toast('Dépose une photo ou une vidéo', { bad: true }); return; }
    EXT = { file: f };
    var d = JSON.stringify({ kind: 'ext', p: f.name, name: f.name, mime: f.type || MIME[ext(f.name)] || '', size: f.size, date: f.lastModified });
    if (window.galerieEvent && document.readyState !== 'loading') emit('open', d); else PEND = d;
  });

  /* Grand écran : la grille suit la largeur de la fenêtre */
  var rzT = null;
  window.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(function () { var g = window.__galerie; if (g && g.MAIN && g.MAIN.layout && !g.V.on) g.MAIN.layout(true); }, 200); });
  /* Clavier : la visionneuse gère déjà ← → et Échap ; ici Échap ferme aussi la feuille d'actions */
  M.keys({ 'escape': function () { var s = document.getElementById('sheet'); if (s && !s.hidden && !(window.__galerie && window.__galerie.V.on)) { history.back(); return; } return false; } });
})();
