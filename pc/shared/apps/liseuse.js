/* =====================================================================
   Liseuse sur PC : pont simulé window.MAGLiseuse (même interface que
   applis/scripts/LiseuseBridge.java, partie fichiers).
   - pick / pending / readChunk / release / cleanup : livres EPUB et PDF du PC
     (sélecteur, glisser-déposer, « Ouvrir avec › Liseuse »), copiés ensuite
     dans la bibliothèque de la page (IndexedDB « liseuse ») ;
   - dossiers suivis : vrais dossiers du PC (File System Access, lecture seule),
     parcourus à l'ouverture et à l'actualisation (6 niveaux, 5000 éléments) ;
     Windows redemande l'accès à chaque nouvelle session, avec un clic ;
   - fetch / download / tts : NON fournis, la page utilise le réseau et la
     synthèse vocale du navigateur (voir la note CORS dans pc/README.md).
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGLiseuse ? null : window.MAGPC; if (!M) return;
  var CACHE = {}, pend = null, started = false, seq = 0, HANDLES = {}, MAX = 400 * 1048576;
  function emit(type, o) { if (window.liseuseEvent) window.liseuseEvent(type, JSON.stringify(o)); }
  function kindOf(u, name) {
    if (u.length > 4 && u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) return 'pdf';
    if (u.length > 4 && u[0] === 0x50 && u[1] === 0x4b) return 'epub';
    var n = String(name || '').toLowerCase();
    return /\.epub$/.test(n) && u.length > 4 && u[0] === 0x50 ? 'epub' : '';
  }
  /** Fichiers → cache mémoire : {src, files:[{id,name,size,kind}], errors} (comme intake() côté Android) */
  async function intake(files, src) {
    var out = [], errors = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i], name = f.name || 'livre';
      try {
        if (f.size > MAX) { errors.push(name + ' (trop gros)'); continue; }
        var u = new Uint8Array(await f.arrayBuffer()), k = kindOf(u, name);
        if (!k) { errors.push(name + ' (ni EPUB ni PDF)'); continue; }
        var id = 'c' + (++seq) + Date.now().toString(36);
        CACHE[id] = u; out.push({ id: id, name: name, size: u.length, kind: k });
      } catch (e) { errors.push(name); }
    }
    return { src: src, files: out, errors: errors };
  }
  function deliver(o) {
    if (started && window.liseuseEvent) { emit('files', o); return; }
    if (!pend) pend = o; else { pend.files = pend.files.concat(o.files); pend.errors = pend.errors.concat(o.errors); }
  }

  /* ---------------- Dossiers suivis ---------------- */
  function dirId(uri) { var m = /^pcd:([^:]+)$/.exec(uri || ''); return m ? m[1] : null; }
  async function walk(dh, path, depth, budget, uri, found) {
    if (depth > 6 || budget.n <= 0) return;
    var dirs = [];
    for await (var e of dh.values()) {
      if (--budget.n <= 0) break;
      if (e.kind === 'directory') { if (!/^\./.test(e.name)) dirs.push(e); continue; }
      if (!/\.(epub|pdf)$/i.test(e.name)) continue;
      try {
        var f = await e.getFile(), u = uri + ':' + path + e.name;
        HANDLES[u] = e;
        found.push({ uri: u, name: e.name, size: f.size, mod: f.lastModified });
      } catch (x) { }
    }
    for (var i = 0; i < dirs.length; i++) await walk(dirs[i], path + dirs[i].name + '/', depth + 1, budget, uri, found);
  }

  var B = {
    version: function () { return '1-pc'; },
    toast: function (t) { M.toast(t); },
    pick: function () {
      M.fs.open({ types: [{ description: 'Livres (EPUB, PDF)', accept: { 'application/epub+zip': ['.epub'], 'application/pdf': ['.pdf'] } }], multiple: true, accept: '.epub,.pdf,application/epub+zip,application/pdf', id: 'liseuse' })
        .then(function (l) {
          if (!l.length) { emit('files', { src: 'pick', files: [], cancel: true }); return; }
          return intake(l.map(function (x) { return x.file; }), 'pick').then(function (o) { emit('files', o); });
        }).catch(function (e) { M.toast('Ouverture impossible : ' + (e && e.message || e), { bad: true }); emit('files', { src: 'pick', files: [], cancel: true }); });
    },
    pending: function () { started = true; if (!pend) return ''; var o = pend; pend = null; return JSON.stringify(o); },
    readChunk: function (id, off, len) {
      var u = CACHE[id]; if (!u) return '';
      off = Math.floor(off); if (off >= u.length) return '';
      return M.bytesToB64(u.subarray(off, Math.min(u.length, off + Math.max(1, len))));
    },
    release: function (id) { var had = !!CACHE[id]; delete CACHE[id]; return had; },
    cleanup: function () { },
    pickFolder: function () {
      if (typeof window.showDirectoryPicker !== 'function') { M.unavailable('Le suivi de dossiers', 'il faut Edge ou Chrome sur ordinateur'); emit('folder', { cancel: true }); return; }
      M.withGesture(function () { return window.showDirectoryPicker({ mode: 'read', id: 'liseuse-dossier', startIn: 'documents' }); }, { title: 'Suivre un dossier', label: 'Choisir le dossier…' })
        .then(function (h) {
          var id = M.uid('d');
          return M.db.put('files', { id: id, app: M.app, name: h.name, handle: h, dir: true, at: Date.now() }).then(function () { emit('folder', { uri: 'pcd:' + id, name: h.name }); });
        }).catch(function (e) { if (!e || (e.name !== 'AbortError' && !e.cancel)) M.toast('Dossier inaccessible : ' + (e && e.message || e), { bad: true }); emit('folder', { cancel: true }); });
    },
    forgetFolder: function (uri) { var id = dirId(uri); if (id) M.fs.forget(id); },
    scanFolders: function (json) {
      var l = []; try { l = JSON.parse(json || '[]'); } catch (e) { }
      (async function () {
        var folders = [], found = [];
        for (var i = 0; i < l.length; i++) {
          var uri = l[i], id = dirId(uri), r = id ? await M.fs.get(id).catch(function () { return null; }) : null;
          if (!r || !r.handle) { folders.push({ uri: uri, ok: false, err: 'missing' }); continue; }
          try {
            var st = await M.fs.perm(r.handle, 'read', true, 'Liseuse');
            if (st !== 'granted') { folders.push({ uri: uri, ok: false, err: 'perm' }); continue; }
            await walk(r.handle, '', 0, { n: 5000 }, uri, found);
            folders.push({ uri: uri, ok: true });
          } catch (e) { folders.push({ uri: uri, ok: !!(e && e.cancel), err: e && e.cancel ? 'later' : String(e && e.message || e) }); }
        }
        emit('scan', { folders: folders, found: found });
      })();
    },
    importUris: function (json) {
      var l = []; try { l = JSON.parse(json || '[]'); } catch (e) { }
      Promise.all(l.map(function (u) { var h = HANDLES[u]; return h ? h.getFile().catch(function () { return null; }) : null; }))
        .then(function (fs) { return intake(fs.filter(Boolean), 'dir'); })
        .then(function (o) { emit('files', o); });
    },
    share: function (text) {
      var cp = function () { M.clip.write(text).then(function (ok) { M.toast(ok ? 'Copié dans le presse-papier' : 'Partage impossible', { bad: !ok }); }); };
      if (navigator.share) navigator.share({ text: text }).catch(function (e) { if (!e || e.name !== 'AbortError') cp(); }); else cp();
    },
    openUrl: function (url) { M.nativeOpen(url); }
  };
  window.MAGLiseuse = B;

  /* Livres déposés sur la fenêtre ou ouverts avec « Ouvrir avec › Liseuse » */
  M.conf.dropHint = 'Livres EPUB ou PDF à ajouter à la bibliothèque';
  M.onFiles(function (o) {
    var fs = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && /\.(epub|pdf)$/i.test(f.name); });
    if (!fs.length) { M.toast('Dépose des livres EPUB ou PDF', { bad: true }); return; }
    intake(fs, o.via === 'launch' && fs.length === 1 ? 'view' : 'pick').then(deliver);
  });
})();
/* Raccourcis : Ctrl+O ajouter des livres, Échap fermer (fenêtre, livre) */
(function () {
  var M = window.MAGPC; if (!M) return;
  M.keys({
    'mod+o': function () { var b = document.getElementById('hAdd'); if (!b || b.hidden) return false; b.click(); },
    'escape': function () {
      if (M.typing()) { document.activeElement.blur(); return; }
      var w = document.getElementById('sheetWrap'), r = document.getElementById('reader');
      if ((w && !w.hidden) || (r && !r.hidden)) { history.back(); return; }
      return false;
    }
  });
})();
