/* =====================================================================
   Lecteur PDF sur PC : pont simulé window.MAGLecteur (même interface que
   applis/scripts/LecteurBridge.java), raccourcis clavier, molette, dépôt
   de fichiers et « Ouvrir avec ».
   Sources de documents (chaîne « src » gardée par la page) :
     pcf:<id>  fichier du PC retenu par sa poignée File System Access (IndexedDB « mag-pc », store files) :
               relu à chaque ouverture, autorisation redemandée si Windows l'a oubliée ;
     pcb:<id>  copie gardée dans le navigateur (quand le navigateur ne donne pas de poignée).
   La page appelle openAsync / checkAsync / outOverwrite quand ils existent (ajoutés pour le PC,
   absents du pont Android) ; tout le reste suit exactement le contrat du pont Android.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var L = function () { return window.__lecteur || null; };
  var V = function () { var l = L(); return l ? l.V() : { open: false }; };
  var APPS = M.conf.apps || {};                       // identifiant Android → adresse de la version PC
  var CACHE = {}, OUTS = {}, KNOWN = [], started = false, pending = null;
  window.__lecteurMaxW = 940;                       // « ajuster à la largeur » : pages lisibles sur grand écran (Ctrl+molette pour agrandir)

  function emit(type, o) { if (window.lecteurEvent) window.lecteurEvent(type, JSON.stringify(o)); }
  function emitOut(token, mode, ok, uri, name, err) { var o = { token: token || '', mode: mode, ok: !!ok }; if (uri) o.uri = uri; if (name) o.name = name; if (err) o.err = err; emit('out', o); }
  function idOf(src) { var m = /^pc[fb]:(.+)$/.exec(src || ''); return m ? m[1] : null; }
  function safeName(n) { return M.safeName(n, '.pdf'); }
  function isPdfFile(f) { return /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name || ''); }

  /** Fichiers choisis / déposés / reçus → {src, files:[{src, name, size, persist}], errors:[…]} (comme intake() côté Android) */
  async function intake(items, from) {
    var files = [], errors = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], name = (it.file && it.file.name) || 'document.pdf';
      try {
        var head = new Uint8Array(await it.file.slice(0, 1024).arrayBuffer()), s = '';
        for (var k = 0; k < head.length; k++) s += String.fromCharCode(head[k]);
        if (s.indexOf('%PDF') < 0) { errors.push(name + ' (ce n\'est pas un PDF)'); continue; }
        var id = await M.fs.remember(it.handle ? { handle: it.handle, name: name } : { blob: it.file, name: name });
        files.push({ src: (it.handle ? 'pcf:' : 'pcb:') + id, name: name, size: it.file.size, persist: !!it.handle });
      } catch (e) { errors.push(name); }
    }
    return { src: from, files: files, errors: errors };
  }
  /** Remet les fichiers à la page : tout de suite si elle a démarré, sinon au premier pending() */
  function deliver(o) {
    if (started && window.lecteurEvent) { emit('files', o); return; }
    if (!pending) pending = o; else { pending.files = pending.files.concat(o.files); pending.errors = pending.errors.concat(o.errors); if (o.src === 'view') pending.src = 'view'; }
  }
  async function readSrc(src) {
    var id = idOf(src); if (!id) { var e = new Error('Fichier introuvable'); e.code = 'missing'; throw e; }
    return M.fs.recall(id, 'Lecteur PDF');
  }
  function refreshKnown() { M.fs.list().then(function (l) { KNOWN = l; }).catch(function () { }); }
  refreshKnown();

  function deliverOut(blob, name, mode, token) {
    if (mode === 'download') { M.fs.download(blob, name); emitOut(token, 'browser', true, null, name); return; }
    if (mode === 'saveas') {
      M.fs.saveAs(blob, name, { types: [M.fs.PDF] }).then(function (r) {
        if (!r.ok) { emitOut(token, 'saveas', false, null, name, 'Annulé'); return; }
        if (r.downloaded) { emitOut(token, 'browser', true, null, name); return; }
        return M.fs.remember({ handle: r.handle, name: r.name }).then(function (id) { refreshKnown(); emitOut(token, 'saveas', true, 'pcf:' + id, r.name); });
      }).catch(function (e) { emitOut(token, 'saveas', false, null, name, e && e.message || 'Enregistrement impossible'); });
      return;
    }
    if (mode === 'share') { M.share(blob, name).then(function (r) { emitOut(token, 'share', r.ok || r.cancel, null, name, r.ok || r.cancel ? null : 'Partage impossible'); }); return; }
    if (mode === 'print') { M.printPdf(blob, name).then(function (ok) { emitOut(token, 'print', ok, null, name, ok ? null : 'Impression impossible'); }); return; }
    if (mode === 'view') { M.openBlob(blob, name); emitOut(token, 'view', true, null, name); return; }
    emitOut(token, mode, false, null, name, 'Mode inconnu');
  }

  var B = {
    version: function () { return '1-pc'; },
    toast: function (t) { M.toast(t); },
    /* ---------- Ouvrir ---------- */
    pick: function () {
      M.fs.open({ types: [M.fs.PDF], multiple: true, accept: 'application/pdf,.pdf', id: 'lecteur' }).then(function (items) {
        if (!items.length) { emit('files', { src: 'pick', files: [], cancel: true }); return; }
        return intake(items, 'pick').then(function (o) { emit('files', o); });
      }).catch(function (e) { M.toast('Ouverture impossible : ' + (e && e.message || e), { bad: true }); emit('files', { src: 'pick', files: [], cancel: true }); });
    },
    pending: function () { started = true; if (!pending) return ''; var o = pending; pending = null; return JSON.stringify(o); },
    open: function () { return JSON.stringify({ ok: false, err: 'Lecture directe indisponible sur PC' }); },
    openAsync: async function (src) {
      try {
        var f = await readSrc(src), u = new Uint8Array(await f.arrayBuffer()), h = M.uid('h');
        CACHE[h] = u;
        return JSON.stringify({ ok: true, h: h, size: u.length });
      } catch (e) { return JSON.stringify({ ok: false, err: e && e.cancel ? 'cancel' : (e && e.code) || (e && e.message) || '?' }); }
    },
    check: function () { return 'ok'; },
    checkAsync: function (src) { var id = idOf(src); return id ? M.fs.check(id) : Promise.resolve('missing'); },
    read: function (h, off, len) {
      var u = CACHE[h]; if (!u) return '';
      off = Math.floor(off); if (off >= u.length) return '';
      return M.bytesToB64(u.subarray(off, Math.min(u.length, off + Math.max(1, Math.min(len, 4194304)))));
    },
    close: function (h) { delete CACHE[h]; },
    forget: function (src) { var id = idOf(src); if (id) M.fs.forget(id).then(refreshKnown); },
    /** Fichiers retenus depuis plus d'une minute (la page supprime ceux qui ne sont plus dans sa liste) */
    locals: function () { var t = Date.now() - 60000; return JSON.stringify(KNOWN.filter(function (r) { return (r.at || 0) < t; }).map(function (r) { return (r.handle ? 'pcf:' : 'pcb:') + r.id; })); },
    /* ---------- Enregistrer, partager, imprimer ---------- */
    outBegin: function () { var t = M.uid('o'); OUTS[t] = []; return t; },
    outChunk: function (t, b64) { if (!OUTS[t]) return false; try { OUTS[t].push(M.b64ToBytes(b64)); return true; } catch (e) { return false; } },
    outCancel: function (t) { delete OUTS[t]; },
    outEnd: function (t, mode, name) {
      var parts = OUTS[t]; delete OUTS[t];
      if (!parts) { emitOut(t, mode, false, null, name, 'Fichier introuvable'); return; }
      deliverOut(new Blob(parts, { type: 'application/pdf' }), safeName(name), mode, t);
    },
    canOverwrite: function (src) { return /^pcf:/.test(src || '') && M.fs.canSave; },
    /** Remplace le fichier d'origine (poignée gardée) par le PDF reçu */
    outOverwrite: function (t, src, name) {
      var parts = OUTS[t]; delete OUTS[t];
      if (!parts) { emitOut(t, 'overwrite', false, null, name, 'Fichier introuvable'); return; }
      var id = idOf(src);
      M.fs.get(id).then(function (r) {
        if (!r || !r.handle) throw new Error('Fichier d\'origine introuvable');
        return M.fs.write(r.handle, new Blob(parts, { type: 'application/pdf' })).then(function () { emitOut(t, 'overwrite', true, src, r.handle.name); });
      }).catch(function (e) { emitOut(t, 'overwrite', false, null, name, e && e.cancel ? 'Annulé' : (e && e.code === 'perm' ? 'Windows a refusé l\'écriture dans ce fichier' : (e && e.message) || 'Enregistrement impossible')); });
    },
    srcAction: function (src, name, mode) {
      var t = M.uid('s');
      readSrc(src).then(function (f) { deliverOut(f, safeName(name), mode, t); }, function (e) { emitOut(t, mode, false, null, name, e && e.cancel ? 'Annulé' : e && e.message); });
      return t;
    },
    /* ---------- Autres applis de la Suite sur PC ---------- */
    installed: function (pkg) { return !!APPS[pkg]; },
    launch: function (pkg) { if (!APPS[pkg]) return false; window.open(APPS[pkg], '_blank'); return true; },
    /** Envoie une copie à une autre appli PC (même origine : boîte de réception IndexedDB « mag-pc/inbox ») */
    sendTo: function (src, name, pkg, socle) {
      var t = M.uid('t');
      if (!APPS[pkg]) { setTimeout(function () { emitOut(t, 'send', false, null, name, 'Appli absente sur PC'); }, 0); return t; }
      readSrc(src).then(function (f) {
        return M.db.put('inbox', { id: M.uid('i'), to: pkg, name: safeName(name), blob: f, at: Date.now() });
      }).then(function () {
        window.open(APPS[pkg] + (socle ? '?socle=' + encodeURIComponent(socle) : ''), '_blank');
        emitOut(t, 'send', true, null, name);
      }).catch(function (e) { emitOut(t, 'send', false, null, name, e && e.cancel ? 'Annulé' : e && e.message); });
      return t;
    },
    /* ---------- « Ma signature » : code PIN local au lieu de l'empreinte du téléphone ---------- */
    authAvailable: function () { return '{"ok":true}'; },
    authenticate: function (token, title, sub) {
      M.pin.verify({
        title: title || 'Ma signature', sub: (sub || 'Confirme que c\'est bien toi') + ' : tape ton code PIN.',
        createWhy: 'Sur PC, ta signature est protégée par un code PIN propre à cet ordinateur (il remplace l\'empreinte, le visage ou le code du téléphone).',
        onForgot: forgotPin
      }).then(function (r) { emit('auth', { token: token, ok: !!r.ok, cancel: !!r.cancel, err: r.err }); });
    }
    // ttsSpeak / ttsStop absents : la page utilise la synthèse vocale du navigateur (voix françaises de Windows)
  };
  /** Code oublié : la signature protégée et le code sont effacés (sinon le code ne protégerait rien) */
  function forgotPin() {
    M.confirm('Code PIN oublié', 'Ta signature enregistrée et le code PIN seront effacés. Tu pourras dessiner une nouvelle signature et choisir un nouveau code. Les documents déjà signés ne changent pas.', 'Effacer', true).then(function (ok) {
      if (!ok) return;
      try { localStorage.removeItem('lecteur-sign'); var s = JSON.parse(localStorage.getItem('lecteur-set') || '{}'); s.signProt = false; localStorage.setItem('lecteur-set', JSON.stringify(s)); } catch (e) { }
      M.pin.reset(); location.reload();
    });
  }
  window.MAGLecteur = B;

  /* ---------- Fichiers déposés sur la fenêtre, « Ouvrir avec » (appli installée) ---------- */
  M.conf.dropHint = 'PDF à ajouter aux récents';
  M.onFiles(function (o) {
    var pdf = o.items.filter(function (x) { return x.file && isPdfFile(x.file); });
    if (!pdf.length) { M.toast('Seuls les fichiers PDF s\'ouvrent ici', { bad: true }); return; }
    intake(pdf, o.via === 'launch' ? 'view' : 'pick').then(deliver);
  });

  /* ---------- PDF envoyés par l'Atelier PDF (« Lire dans le Lecteur PDF ») : boîte « mag-pc/inbox » ---------- */
  var myId = 'fr.magformation13.lecteur', inboxBusy = false;
  function takeInbox() {
    if (inboxBusy) return; inboxBusy = true;
    M.db.all('inbox').then(function (l) {
      l = (l || []).filter(function (x) { return x.to === myId; });
      return Promise.all(l.map(function (x) {
        return M.db.del('inbox', x.id).then(function () {
          if (Date.now() - (x.at || 0) > 30 * 60000 || !x.blob) return null;
          return { file: new File([x.blob], x.name || 'document.pdf', { type: 'application/pdf' }), handle: null };
        });
      }));
    }).then(function (items) {
      items = items.filter(Boolean);
      if (items.length) return intake(items, 'view').then(deliver);
    }).catch(function (e) { console.warn('boîte de réception', e); }).then(function () { inboxBusy = false; });
  }
  if (document.readyState === 'complete') takeInbox(); else window.addEventListener('load', takeInbox);
  window.addEventListener('focus', takeInbox);

  /* ---------- Clavier et molette ---------- */
  function inViewer() { var v = V(); return !!(v && v.open && v.n); }
  function sc() { return document.getElementById('scroller'); }
  M.keys({
    'mod+o': function () { var l = L(); if (l) l.pick(); },
    'mod+s': function () { var l = L(); if (!l || !inViewer()) return false; if (!l.sheetOpen()) l.saveSheet(); },
    'mod+shift+s': function () { var l = L(); if (!l || !inViewer()) return false; l.saveAs(); },
    'mod+p': function () { var l = L(); if (!l || !inViewer()) return false; l.print(); },
    'mod+f': function () { var l = L(); if (!l) return false; if (inViewer()) l.enterSearch(); else { var q = document.getElementById('q'); if (q) { q.focus(); q.select(); } } },
    'mod+z': function () { var l = L(), v = V(); if (!l || !inViewer() || !v.annot || M.typing()) return false; l.undo(); },
    'escape': function () { var l = L(); if (!l || !l.navDepth()) return false; l.back(); },
    'mod+=': function () { var l = L(), v = V(); if (!l || !inViewer()) return false; l.zoomTo(v.zoom * 1.2); },
    'mod+-': function () { var l = L(), v = V(); if (!l || !inViewer()) return false; l.zoomTo(v.zoom / 1.2); },
    'mod+0': function () { var l = L(); if (!l || !inViewer()) return false; l.zoomTo(1); },
    'arrowleft': function () { var l = L(), v = V(); if (!l || !inViewer() || v.mode !== 'page' || l.sheetOpen()) return false; l.goTo(v.cur - 1); },
    'arrowright': function () { var l = L(), v = V(); if (!l || !inViewer() || v.mode !== 'page' || l.sheetOpen()) return false; l.goTo(v.cur + 1); },
    'pagedown': function () { var l = L(), v = V(); if (!l || !inViewer() || l.sheetOpen()) return false; if (v.mode === 'page') l.goTo(v.cur + 1); else sc().scrollBy({ top: sc().clientHeight * 0.9 }); },
    'pageup': function () { var l = L(), v = V(); if (!l || !inViewer() || l.sheetOpen()) return false; if (v.mode === 'page') l.goTo(v.cur - 1); else sc().scrollBy({ top: -sc().clientHeight * 0.9 }); },
    'space': function () { var l = L(); if (!l || !inViewer() || l.sheetOpen()) return false; sc().scrollBy({ top: sc().clientHeight * 0.9 }); },
    'arrowdown': function () { var l = L(); if (!l || !inViewer() || l.sheetOpen()) return false; sc().scrollBy({ top: 60 }); },
    'arrowup': function () { var l = L(); if (!l || !inViewer() || l.sheetOpen()) return false; sc().scrollBy({ top: -60 }); },
    'home': function () { var l = L(); if (!l || !inViewer() || l.sheetOpen()) return false; l.goTo(1); },
    'end': function () { var l = L(), v = V(); if (!l || !inViewer() || l.sheetOpen()) return false; l.goTo(v.n); }
  });
  /* Barres du lecteur : sur Android elles se masquent au défilement et reviennent au toucher.
     À la souris, elles reviennent aussi quand le pointeur approche du haut ou du bas de la fenêtre. */
  var barT = 0;
  window.addEventListener('mousemove', function (e) {
    if (barT || !inViewer()) return;
    var vw = document.getElementById('viewer');
    if (!vw || !vw.classList.contains('nobars') || (e.clientY > 80 && e.clientY < window.innerHeight - 170)) return;
    barT = setTimeout(function () { barT = 0; }, 150);
    var v = V(); vw.classList.remove('nobars'); v.bars = true; v.barsAt = sc().scrollTop;
  }, { passive: true });
  M.onZoom(function (k, e) {
    var l = L(), v = V(); if (!l || !inViewer()) return;
    var r = sc().getBoundingClientRect();
    l.zoomTo(v.zoom * k, e.clientX - r.left, e.clientY - r.top);
  });
})();
