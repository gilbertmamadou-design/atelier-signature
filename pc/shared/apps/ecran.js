/* =====================================================================
   Écran sur PC : pont simulé window.MAGEcran (même interface que
   applis/scripts/EcranBridge.java).
   - play / resume / positions / forget : lecteur vidéo du navigateur (fenêtre
     de lecture par-dessus la page, plein écran, sous-titres, reprise à la
     dernière position ; positions dans localStorage « ecran-pc-pos ») ;
   - Mes vidéos (perm / askPerm / scan / thumbs) : un dossier de vidéos du PC
     choisi avec File System Access (lecture seule), miniatures calculées ici ;
   - openYouTube / openUrl : nouvel onglet (lecteur officiel de YouTube) ;
   - installed / openApp : seulement les applis de la Suite présentes sur PC ;
   - fetch : NON fourni (la page lit le réseau elle-même ; flux YouTube : relais).
   Flux HLS (.m3u8) : non lus par Chrome/Edge sans bibliothèque ; message clair.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var PK = 'ecran-pc-pos', LK = 'ecran-pc-last', APPS = M.conf.apps || {};
  // applis TV des diffuseurs (Android) → leur site officiel sur PC
  var WEB = { 'fr.francetv.pluzz': 'https://www.france.tv/', 'tv.arte.plus7': 'https://www.arte.tv/fr/', 'fr.tf1.mytf1': 'https://www.tf1.fr/', 'fr.m6.m6replay': 'https://www.m6.fr/',
    'com.dotscreen.tv5mondeplus.mobile': 'https://www.tv5mondeplus.com/', 'fr.artestudio.arteradio.mobile': 'https://www.arteradio.com/' };
  var POS = M.store.get(PK, {}) || {}, VIDS = {}, DIRKEY = 'ecran-dossier', VEXT = /\.(mp4|m4v|webm|mov|mkv|ogv)$/i;
  function emit(type, data) { if (window.ecranEvent) window.ecranEvent(type, typeof data === 'string' ? data : JSON.stringify(data)); }
  function savePos() { M.store.set(PK, POS); }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h); }

  /* ---------------- Lecteur ---------------- */
  var P = null;   // {list, i, el, v, key, external}
  function srtToVtt(t) { return 'WEBVTT\n\n' + String(t).replace(/\r/g, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2'); }
  function srcOf(it) {
    if (/^pcv:/.test(it.url)) {
      var h = VIDS[it.url]; if (!h) return Promise.reject(new Error('Vidéo introuvable : relance « Actualiser » dans Mes vidéos'));
      return h.getFile().then(function (f) { return URL.createObjectURL(f); });
    }
    return Promise.resolve(it.url);
  }
  function close() {
    if (!P) return;
    store(true);
    try { P.v.pause(); P.v.removeAttribute('src'); P.v.load(); } catch (e) { }
    if (document.fullscreenElement) document.exitFullscreen().catch(function () { });
    P.el.remove(); if (P.blob) URL.revokeObjectURL(P.blob); P = null;
    emit('closed', B.positions());
  }
  function store(force) {
    if (!P || !P.v) return;
    var it = P.list[P.i], key = it.id || it.url, v = P.v, dur = Math.round((v.duration || 0) * 1000), pos = Math.round(v.currentTime * 1000);
    if (!isFinite(dur) || dur <= 0) return;
    if (pos < 3000 && !v.ended && !force) return;
    var done = v.ended || pos > dur - Math.min(30000, dur * 0.05);
    var item = { url: it.url, title: it.title || '', sub: it.sub || '' }; if (/^https?:/.test(it.thumb || '')) item.thumb = it.thumb;
    POS[key] = { pos: done ? 0 : pos, dur: dur, at: Date.now(), done: done, item: item };
    savePos(); emit('progress', B.positions());
  }
  function load(i) {
    if (!P) return;
    P.i = Math.max(0, Math.min(P.list.length - 1, i));
    var it = P.list[P.i];
    M.store.set(LK, { list: P.list, index: P.i });
    P.el.querySelector('.mpcv-t').textContent = it.title || 'Vidéo';
    P.el.querySelector('.mpcv-s').textContent = it.sub || '';
    P.el.querySelector('.mpcv-prev').disabled = P.i === 0; P.el.querySelector('.mpcv-next').disabled = P.i >= P.list.length - 1;
    var msg = P.el.querySelector('.mpcv-msg'); msg.hidden = true;
    Array.prototype.slice.call(P.v.querySelectorAll('track')).forEach(function (t) { t.remove(); });
    if (/\.m3u8(\?|$)/i.test(it.url)) {
      msg.hidden = false; msg.innerHTML = 'Cette vidéo n\'existe qu\'en flux HLS, que le navigateur ne lit pas sans module supplémentaire.' + (it.page ? ' <a href="' + M.esc(it.page) + '" target="_blank" rel="noopener">Ouvrir sa page</a>' : '');
      return;
    }
    if (P.blob) { URL.revokeObjectURL(P.blob); P.blob = null; }
    srcOf(it).then(function (src) {
      if (/^blob:/.test(src)) P.blob = src;
      P.v.src = src;
      var p = POS[it.id || it.url];
      if (p && !p.done && p.pos > 5000) P.v.addEventListener('loadedmetadata', function () { P.v.currentTime = p.pos / 1000; }, { once: true });
      P.v.play().catch(function () { });
      if (it.srt) fetch(it.srt).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
        if (!t || !P) return;
        var tr = document.createElement('track'); tr.kind = 'subtitles'; tr.label = 'Français'; tr.srclang = 'fr'; tr.default = true;
        tr.src = URL.createObjectURL(new Blob([/^WEBVTT/.test(t) ? t : srtToVtt(t)], { type: 'text/vtt' })); P.v.appendChild(tr);
      }).catch(function () { });
    }, function (e) { msg.hidden = false; msg.textContent = e.message; });
  }
  function open(list, index) {
    if (P) close();
    var el = document.createElement('div'); el.id = 'mpcVid'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Lecteur vidéo');
    el.innerHTML = '<div class="mpcv-bar"><button type="button" class="mpcv-x" aria-label="Fermer (Échap)">✕</button><div class="mpcv-tt"><b class="mpcv-t"></b><span class="mpcv-s"></span></div>' +
      '<button type="button" class="mpcv-prev" aria-label="Vidéo précédente (P)">⏮</button><button type="button" class="mpcv-next" aria-label="Vidéo suivante (N)">⏭</button><button type="button" class="mpcv-fs" aria-label="Plein écran (F)">⛶</button></div>' +
      '<video class="mpcv-v" controls autoplay playsinline></video><div class="mpcv-msg" hidden></div>';
    document.body.appendChild(el);
    P = { list: list, i: 0, el: el, v: el.querySelector('video') };
    el.querySelector('.mpcv-x').onclick = close;
    el.querySelector('.mpcv-prev').onclick = function () { store(true); load(P.i - 1); };
    el.querySelector('.mpcv-next').onclick = function () { store(true); load(P.i + 1); };
    el.querySelector('.mpcv-fs').onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen().catch(function () { }); };
    P.v.addEventListener('dblclick', function () { el.querySelector('.mpcv-fs').click(); });
    var t = 0; P.v.addEventListener('timeupdate', function () { if (Date.now() - t > 5000) { t = Date.now(); store(); } });
    P.v.addEventListener('pause', function () { store(); });
    P.v.addEventListener('ended', function () { store(true); if (P.i < P.list.length - 1) load(P.i + 1); });
    P.v.addEventListener('error', function () { var m = el.querySelector('.mpcv-msg'); m.hidden = false; m.textContent = 'Lecture impossible : format non pris en charge par le navigateur, ou vidéo injoignable.'; });
    load(index);
  }

  /* ---------------- Mes vidéos (dossier du PC) ---------------- */
  var thumbQ = [], thumbBusy = false;
  function thumbNext() {
    if (thumbBusy || !thumbQ.length) return;
    thumbBusy = true;
    var job = thumbQ.shift(), h = VIDS['pcv:' + job.id], v = document.createElement('video'), url = null;
    var fin = function (data) { emit('thumb', { id: job.id, w: job.w, data: data || '' }); if (url) URL.revokeObjectURL(url); v.removeAttribute('src'); thumbBusy = false; setTimeout(thumbNext, 30); };
    if (!h) { fin(''); return; }
    h.getFile().then(function (f) {
      url = URL.createObjectURL(f); v.muted = true; v.preload = 'metadata'; v.src = url;
      var to = setTimeout(function () { fin(''); }, 8000);
      v.addEventListener('loadedmetadata', function () { v.currentTime = Math.min(2, (v.duration || 4) / 3); }, { once: true });
      v.addEventListener('seeked', function () {
        clearTimeout(to);
        try { var c = document.createElement('canvas'), k = job.w / (v.videoWidth || job.w); c.width = job.w; c.height = Math.max(1, Math.round((v.videoHeight || job.w * 9 / 16) * k)); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); fin(c.toDataURL('image/jpeg', 0.74)); } catch (e) { fin(''); }
      }, { once: true });
      v.addEventListener('error', function () { clearTimeout(to); fin(''); }, { once: true });
    }, function () { fin(''); });
  }
  async function walk(dh, path, out, depth) {
    if (depth > 8 || out.length > 5000) return;
    for await (var e of dh.values()) {
      if (e.kind === 'directory') { if (!/^\./.test(e.name)) await walk(e, path + e.name + '/', out, depth + 1); continue; }
      if (!VEXT.test(e.name)) continue;
      try {
        var f = await e.getFile(), id = hash(path + e.name + '|' + f.size), url = 'pcv:' + id;
        VIDS[url] = e;
        out.push({ id: id, url: url, name: e.name, title: e.name.replace(/\.[^.]+$/, ''), folder: (path.split('/').filter(Boolean).pop()) || dh.name, path: path, date: f.lastModified, mod: Math.round(f.lastModified / 1000), dur: 0, size: f.size, w: 0, h: 0, mime: f.type || 'video/mp4' });
      } catch (x) { }
    }
  }
  var dirRec = null;
  M.db.get('files', DIRKEY).then(function (r) { dirRec = r || null; if (r && window.ecranEvent) emit('perm', ''); }).catch(function () { });

  var B = {
    version: function () { return '1-pc'; },
    perm: function () { return dirRec ? 'all' : 'none'; },
    askPerm: function () {
      if (typeof window.showDirectoryPicker !== 'function') { M.unavailable('Le choix d\'un dossier de vidéos', 'il faut Edge ou Chrome'); return; }
      M.withGesture(function () { return window.showDirectoryPicker({ mode: 'read', id: 'ecran-videos', startIn: 'videos' }); }, { title: 'Mes vidéos', label: 'Choisir le dossier…' }).then(function (h) {
        dirRec = { id: DIRKEY, app: M.app, name: h.name, handle: h, dir: true, at: Date.now() };
        return M.db.put('files', dirRec).then(function () { emit('perm', 'all'); });
      }).catch(function (e) { if (!e || (e.name !== 'AbortError' && !e.cancel)) M.toast('Dossier inaccessible : ' + (e && e.message || e), { bad: true }); });
    },
    appSettings: function () { M.unavailable('Les réglages Android'); },
    scan: function () {
      (async function () {
        if (!dirRec) { emit('scan', '[]'); return; }
        try {
          var st = await M.fs.perm(dirRec.handle, 'read', true, 'Écran');
          if (st !== 'granted') { emit('scan', { err: 'Windows n\'a pas autorisé l\'accès au dossier « ' + dirRec.name + ' »' }); return; }
          var out = []; await walk(dirRec.handle, '', out, 0);
          out.sort(function (a, b) { return b.date - a.date; });
          emit('scan', out);
        } catch (e) { emit('scan', { err: e && e.cancel ? 'accès au dossier non autorisé' : String(e && e.message || e) }); }
      })();
    },
    thumbs: function (ids, w) { var l = []; try { l = JSON.parse(ids); } catch (e) { } l.forEach(function (id) { thumbQ.push({ id: id, w: Math.max(96, Math.min(640, w || 320)) }); }); thumbNext(); },
    play: function (json, index) {
      var l = []; try { l = JSON.parse(json); } catch (e) { }
      l = l.filter(function (x) { return x && x.url; });
      if (!l.length) { M.toast('Rien à lire', { bad: true }); return false; }
      open(l, index || 0); return true;
    },
    resume: function () { var r = M.store.get(LK, null); if (!r || !r.list) return false; open(r.list, r.index || 0); return true; },
    last: function () {
      var r = M.store.get(LK, null); if (!r || !r.list) return '{}';
      var it = r.list[r.index || 0], p = POS[it.id || it.url] || {};
      return JSON.stringify({ item: it, pos: p.pos || 0, dur: p.dur || 0, at: p.at || 0, done: !!p.done });
    },
    positions: function () { return JSON.stringify(POS); },
    forget: function (id) { delete POS[id]; savePos(); },
    openYouTube: function (vid) { M.nativeOpen('https://www.youtube.com/watch?v=' + encodeURIComponent(vid)); },
    openUrl: function (u) { M.nativeOpen(/^[a-z]+:/i.test(u) ? u : 'https://' + u); },
    installed: function (json) { var o = {}; try { JSON.parse(json).forEach(function (p) { if (APPS[p] || WEB[p]) o[p] = true; }); } catch (e) { } return JSON.stringify(o); },
    openApp: function (pkg, name) { if (APPS[pkg]) M.nativeOpen(APPS[pkg]); else if (WEB[pkg]) M.nativeOpen(WEB[pkg]); else M.unavailable('L\'appli « ' + (name || pkg) + ' »', 'elle n\'existe que sur le téléphone'); },
    openStore: function (pkg, name) { M.unavailable('Le Play Store', 'installe « ' + (name || pkg) + ' » sur le téléphone'); },
    share: function (text) {
      var cp = function () { M.clip.write(text).then(function (ok) { M.toast(ok ? 'Lien copié dans le presse-papier' : 'Partage impossible', { bad: !ok }); }); };
      if (navigator.share) navigator.share({ text: text }).catch(function (e) { if (!e || e.name !== 'AbortError') cp(); }); else cp();
    },
    toastMsg: function (t) { M.toast(t); }
  };
  window.MAGEcran = B;

  /* Vidéos déposées : lues tout de suite */
  M.conf.dropHint = 'Vidéos à regarder';
  M.onFiles(function (o) {
    var l = o.items.filter(function (x) { return x.file && (VEXT.test(x.file.name) || /^video\//.test(x.file.type)); }).map(function (x) {
      var url = 'pcv:drop' + hash(x.file.name + x.file.size);
      VIDS[url] = { getFile: function () { return Promise.resolve(x.file); } };
      return { url: url, id: 'l:drop-' + hash(x.file.name + x.file.size), title: x.file.name.replace(/\.[^.]+$/, ''), sub: 'Fichier déposé' };
    });
    if (!l.length) { M.toast('Dépose des fichiers vidéo (MP4, WebM…)', { bad: true }); return; }
    open(l, 0);
  });

  /* Clavier du lecteur */
  M.keys({
    'escape': function () { if (P) { if (document.fullscreenElement) document.exitFullscreen(); else close(); return; } var b = document.getElementById('bBack'); if (!b || b.hidden) return false; b.click(); },
    'space': function () { if (!P) return false; if (P.v.paused) P.v.play().catch(function () { }); else P.v.pause(); },
    'k': function () { if (!P) return false; if (P.v.paused) P.v.play().catch(function () { }); else P.v.pause(); },
    'arrowleft': function () { if (!P) return false; P.v.currentTime = Math.max(0, P.v.currentTime - 10); },
    'arrowright': function () { if (!P) return false; P.v.currentTime = Math.min(P.v.duration || 1e9, P.v.currentTime + 10); },
    'f': function () { if (!P) return false; P.el.querySelector('.mpcv-fs').click(); },
    'n': function () { if (!P || P.i >= P.list.length - 1) return false; store(true); load(P.i + 1); },
    'p': function () { if (!P || P.i === 0) return false; store(true); load(P.i - 1); },
    'm': function () { if (!P) return false; P.v.muted = !P.v.muted; }
  });
})();
