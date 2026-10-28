/* =====================================================================
   Suite MAG sur PC : couche commune (« shim »), chargée AVANT le code de
   chaque appli dans pc/<appli>/index.html (ajoutée par pc/build-pc.py).

   Les pages Android appellent des ponts natifs (window.MAGPrint,
   window.MAGLecteur…). Sur PC il n'y en a pas : ce fichier fournit
     - window.MAGPC : boîte à outils navigateur (fichiers, stockage, partage,
       impression, presse-papier, notifications, toasts, dialogues, code PIN,
       raccourcis clavier, glisser-déposer, « Ouvrir avec », OCR, mises à jour) ;
     - window.MAGPrint : version PC des fonctions communes du pont Android
       (impression, fichiers, notifications, écran allumé…). Les fonctions sans
       équivalent ne sont PAS définies (la page garde son comportement
       « navigateur ») ; une appli peut en déclarer avec MAGPC.stub() pour
       afficher un message clair au lieu de planter.
   Les ponts propres à une appli (MAGLecteur, MAGPdf…) sont dans
   pc/shared/apps/<appli>.js et s'appuient sur MAGPC.
   Documentation : pc/README.md
   ===================================================================== */
(function () {
  'use strict';
  if (window.MAGPC) return;
  var CONF = window.MAGPC_CONF || {};
  var M = { version: '1', app: CONF.app || 'app', conf: CONF, native: false };
  window.MAGPC = M;
  var root = document.documentElement;
  root.classList.add('mag-pc');
  // Fonctions natives gardées avant le code des pages : certaines pages Android les remplacent quand MAGPrint existe
  // (impression, ouverture des liens blob:), ce qui ferait boucler le shim.
  var NATIVE = { click: HTMLAnchorElement.prototype.click, open: window.open, print: window.print };
  /** window.open d'origine (certaines pages le remplacent) */
  M.nativeOpen = function (u, t, f) { return NATIVE.open.call(window, u, t || '_blank', f); };
  /** Lien temporaire NON inséré dans la page : les écouteurs de clic de la page ne le voient pas */
  function anchorGo(href, o) { var a = document.createElement('a'); a.href = href; if (o.download != null) a.download = o.download; if (o.target) { a.target = o.target; a.rel = 'noopener'; } NATIVE.click.call(a); }

  /* ---------------- Outils ---------------- */
  function uid(p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kb(n) { if (!(n > 0)) return ''; return n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' Ko' : (n / 1048576).toFixed(1).replace('.', ',') + ' Mo'; }
  function b64ToBytes(b) { var s = atob(b || ''), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function bytesToB64(u) { var s = '', CH = 0x8000; for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH)); return btoa(s); }
  /** Blob à partir d'un Blob, ArrayBuffer, Uint8Array ou d'une chaîne base64 */
  function toBlob(x, type) {
    if (x instanceof Blob) return x;
    if (typeof x === 'string') x = b64ToBytes(x);
    return new Blob([x], { type: type || 'application/octet-stream' });
  }
  function safeName(n, ext) {
    n = String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'document';
    if (ext && n.toLowerCase().slice(-ext.length) !== ext) n += ext;
    return n.length > 140 ? n.slice(0, 130) + (ext || '') : n;
  }
  function mimeOf(name, fallback) {
    var e = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1];
    return { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', csv: 'text/csv', json: 'application/json', html: 'text/html' }[(e || '').toLowerCase()] || fallback || 'application/octet-stream';
  }
  var VENDOR = CONF.vendor || '../shared/vendor/';
  M.uid = uid; M.esc = esc; M.kb = kb; M.b64ToBytes = b64ToBytes; M.bytesToB64 = bytesToB64; M.toBlob = toBlob; M.safeName = safeName; M.mimeOf = mimeOf;
  function whenBody(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  M.whenBody = whenBody;

  /* ---------------- Stockage ----------------
     MAGPC.store : localStorage en JSON (petits réglages).
     MAGPC.db    : IndexedDB « mag-pc », partagée par toutes les applis PC (même origine) :
                   kv (clé → valeur), files (fichiers retenus : poignées File System Access ou copies),
                   inbox (fichiers envoyés d'une appli PC à une autre). */
  M.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  /** Petite base IndexedDB propre à une appli : M.openDb('agenda-pc', ['photos', {name:'x', keyPath:'id'}], 1)
      → {get(store, clé), put(store, valeur, clé?), del(store, clé), all(store), keys(store), clear(store)} (promesses) */
  M.openDb = function (name, stores, version) {
    var p = null;
    function open() {
      if (p) return p;
      p = new Promise(function (res, rej) {
        var r = indexedDB.open(name, version || 1);
        r.onupgradeneeded = function () {
          var d = r.result;
          (stores || []).forEach(function (st) { var o = typeof st === 'string' ? { name: st } : st; if (!d.objectStoreNames.contains(o.name)) d.createObjectStore(o.name, o.keyPath ? { keyPath: o.keyPath } : undefined); });
        };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { p = null; rej(r.error); };
        r.onblocked = function () { p = null; rej(new Error('Base occupée : ferme les autres fenêtres de l\'appli')); };
      });
      return p;
    }
    function req(store, mode, fn) {
      return open().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(store, mode), q = fn(t.objectStore(store)), out;
          if (q) q.onsuccess = function () { out = q.result; };
          t.oncomplete = function () { res(out); };
          t.onerror = function () { rej(t.error); };
          t.onabort = function () { rej(t.error || new Error('Stockage plein')); };
        });
      });
    }
    return {
      get: function (st, k) { return req(st, 'readonly', function (s) { return s.get(k); }); },
      put: function (st, v, k) { return req(st, 'readwrite', function (s) { return k === undefined ? s.put(v) : s.put(v, k); }); },
      del: function (st, k) { return req(st, 'readwrite', function (s) { return s.delete(k); }); },
      all: function (st) { return req(st, 'readonly', function (s) { return s.getAll(); }); },
      keys: function (st) { return req(st, 'readonly', function (s) { return s.getAllKeys(); }); },
      clear: function (st) { return req(st, 'readwrite', function (s) { return s.clear(); }); },
      open: open
    };
  };
  M.db = M.openDb('mag-pc', ['kv', { name: 'files', keyPath: 'id' }, { name: 'inbox', keyPath: 'id' }], 1);
  M.kv = {
    get: function (k) { return M.db.get('kv', k); },
    set: function (k, v) { return M.db.put('kv', v, k); },
    del: function (k) { return M.db.del('kv', k); }
  };

  /* ---------------- Réseau : relais facultatif pour les sites sans CORS ----------------
     Un navigateur ne lit un flux d'un autre site que si ce site l'autorise (CORS). Sur Android, les applis lisent
     elles-mêmes ; sur PC, Le Monde, la BBC, Gutenberg, PVGIS… bloquent. Si l'utilisateur a installé son relais
     personnel (pc/relais/worker.js, adresse saisie dans le lanceur), les lectures (GET) vers ces sites passent par
     lui ; pour les autres sites (flux de podcasts…), le relais n'est essayé qu'après un échec direct.
     Sans relais : rien ne change, la page affiche son message d'erreur habituel. */
  M.net = {
    HOSTS: ['lemonde.fr', 'lefigaro.fr', 'liberation.fr', 'rfi.fr', 'france24.com', '20minutes.fr', 'ouest-france.fr', 'leparisien.fr',
      'la-croix.com', 'euronews.com', 'bbci.co.uk', 'theguardian.com', 'brut.media', 'sudouest.fr', 'nicematin.com', 'actu.fr', 'meteoalarm.org',
      'ccmixter.org', 'youtube.com', 'legifrss.org', 'service-public.gouv.fr', 're.jrc.ec.europa.eu', 'gutenberg.org', 'gutendex.com', 'ws-export.wmcloud.org'],
    proxy: function () { var p = M.store.get('mag-pc-relais', ''); return /^(https:\/\/|http:\/\/localhost[:/])[^\s]+$/.test(p || '') ? p : ''; },
    listed: function (h) { h = String(h || '').toLowerCase(); return M.net.HOSTS.some(function (d) { return h === d || h.slice(-d.length - 1) === '.' + d; }); },
    // sites vérifiés sans CORS (sonde du 28/10/2026) : sans relais, la lecture est refusée tout de suite, sans requête
    // (évite une erreur CORS dans la console et une attente inutile) ; gutendex.com n'a pas pu être vérifié
    blocked: function (h) { return M.net.listed(h) && !/(^|\.)gutendex\.com$/i.test(h); },
    via: function (url) { var p = M.net.proxy(); return p ? p + (p.indexOf('?') < 0 ? '?' : '&') + 'url=' + encodeURIComponent(url) : ''; }
  };
  var nativeFetch = window.fetch;
  if (nativeFetch) window.fetch = function (input, init) {
    var args = arguments, url;
    try { url = new URL(typeof input === 'string' ? input : (input && input.url) || String(input), location.href); } catch (e) { return nativeFetch.apply(window, args); }
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(), px = M.net.proxy();
    if (!px && method === 'GET' && url.origin !== location.origin && M.net.blocked(url.hostname)) {
      M.net.refused = (M.net.refused || 0) + 1;
      return Promise.reject(new TypeError('« ' + url.hostname + ' » refuse la lecture depuis une page web (CORS) : relais réseau non configuré'));
    }
    if (!px || method !== 'GET' || url.protocol !== 'https:' || url.origin === location.origin || url.href.indexOf(px) === 0) return nativeFetch.apply(window, args);
    var opt = Object.assign({}, init || {}, { credentials: 'omit' });
    if (M.net.listed(url.hostname)) return nativeFetch.call(window, M.net.via(url.href), opt);
    return nativeFetch.apply(window, args).catch(function (e) {
      if (e && e.name === 'AbortError') throw e;
      return nativeFetch.call(window, M.net.via(url.href), opt).catch(function () { throw e; });
    });
  };

  /* ---------------- Interface : toasts, dialogues ---------------- */
  var ui = null;
  function UI() {
    if (ui) return ui;
    ui = document.createElement('div'); ui.id = 'mpc-root';
    ui.innerHTML = '<div id="mpc-toast" role="status" aria-live="polite"></div>';
    document.body.appendChild(ui);
    return ui;
  }
  var toastT = null;
  /** Message bref en bas de l'écran. opt : {bad:true, ms:4000} */
  M.toast = function (text, opt) {
    opt = opt || {};
    whenBody(function () {
      var t = UI().querySelector('#mpc-toast');
      t.textContent = text; t.className = 'on' + (opt.bad ? ' bad' : '');
      clearTimeout(toastT); toastT = setTimeout(function () { t.className = ''; }, opt.ms || (opt.bad ? 5000 : 3200));
    });
  };
  M.toastOff = function () { clearTimeout(toastT); var t = ui && ui.querySelector('#mpc-toast'); if (t) t.className = ''; };
  /** Fonction absente sur PC : message clair, jamais d'erreur */
  M.unavailable = function (what, alt) {
    M.toast((what || 'Cette fonction') + ' n\'est pas disponible sur PC' + (alt ? ' : ' + alt : '.'), { bad: true, ms: 5000 });
  };
  /** Déclare des fonctions « indisponibles sur PC » sur un pont simulé : obj.nom() affiche un message et renvoie ret */
  M.stub = function (obj, names, ret, label) {
    (names || []).forEach(function (n) {
      if (obj[n]) return;
      obj[n] = function () { M.unavailable(label ? label(n) : '« ' + n + ' »'); return typeof ret === 'function' ? ret(n) : ret; };
    });
    return obj;
  };

  var dlgStack = [];
  /** Dialogue modal. opt : {title, text | html, buttons:[{label, value, primary, bad, onClick}], dismiss:true, wide, onOpen(el, close)}
      Résout avec la valeur du bouton (null si fermé). onClick(close) est appelé PENDANT le clic (geste utilisateur valable). */
  M.dialog = function (opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      whenBody(function () {
        var wrap = document.createElement('div'); wrap.className = 'mpc-dlg-wrap';
        var btns = opt.buttons || [{ label: 'OK', value: true, primary: true }];
        wrap.innerHTML = '<div class="mpc-dlg' + (opt.wide ? ' wide' : '') + (opt.cls ? ' ' + opt.cls : '') + '" role="dialog" aria-modal="true">' +
          (opt.title ? '<h2>' + esc(opt.title) + '</h2>' : '') +
          '<div class="mpc-body">' + (opt.html != null ? opt.html : (opt.text ? '<p>' + esc(opt.text) + '</p>' : '')) + '</div>' +
          '<div class="mpc-btns">' + btns.map(function (b, i) { return '<button type="button" data-i="' + i + '" class="' + (b.primary ? 'pri' : '') + (b.bad ? ' bad' : '') + '">' + esc(b.label) + '</button>'; }).join('') + '</div></div>';
        UI().appendChild(wrap);
        var done = false;
        function close(v) {
          if (done) return; done = true;
          wrap.classList.remove('on'); setTimeout(function () { wrap.remove(); }, 160);
          dlgStack = dlgStack.filter(function (x) { return x !== close; });
          resolve(v === undefined ? null : v);
        }
        dlgStack.push(close);
        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-i]');
          if (b && wrap.contains(b) && b.parentNode.classList.contains('mpc-btns')) {
            var o = btns[+b.dataset.i];
            if (o.onClick) { var r = o.onClick(close, wrap.querySelector('.mpc-dlg')); if (r === false) return; }
            close(o.value);
            return;
          }
          if (e.target === wrap && opt.dismiss !== false) close(null);
        });
        requestAnimationFrame(function () { wrap.classList.add('on'); });
        if (opt.onOpen) opt.onOpen(wrap.querySelector('.mpc-dlg'), close);
        var f = wrap.querySelector('[autofocus]') || wrap.querySelector('.mpc-btns .pri');
        if (f) setTimeout(function () { try { f.focus(); } catch (e) { } }, 30);
      });
    });
  };
  M.dialogOpen = function () { return dlgStack.length > 0; };
  M.confirm = function (title, text, ok, bad) {
    return M.dialog({ title: title, text: text, buttons: [{ label: 'Annuler', value: false }, { label: ok || 'OK', value: true, primary: true, bad: bad }] }).then(function (v) { return !!v; });
  };
  /** Exécute fn() pendant un geste de l'utilisateur (requis par les sélecteurs de fichiers, le partage, les autorisations).
      Si le geste d'origine a expiré (traitement long), un petit dialogue demande un clic. Rejette {cancel:true} si annulé. */
  M.withGesture = function (fn, opt) {
    opt = opt || {};
    var ua = navigator.userActivation;
    if (!opt.force && (!ua || ua.isActive)) {
      try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
    }
    return new Promise(function (resolve, reject) {
      M.dialog({
        title: opt.title || 'Confirmer', text: opt.text || '',
        buttons: [{ label: 'Annuler', value: 'x' }, {
          label: opt.label || 'Continuer', primary: true, value: 'ok',
          onClick: function () { try { Promise.resolve(fn()).then(resolve, reject); } catch (e) { reject(e); } }
        }]
      }).then(function (v) { if (v !== 'ok') { var e = new Error('Annulé'); e.cancel = true; e.name = 'AbortError'; reject(e); } });
    });
  };

  /* ---------------- Fichiers ----------------
     File System Access API (Edge, Chrome) : vrais fichiers du PC, réenregistrables ;
     sinon <input type=file> et téléchargement. */
  var FS = M.fs = {
    canPick: typeof window.showOpenFilePicker === 'function',
    canSave: typeof window.showSaveFilePicker === 'function'
  };
  FS.PDF = { description: 'Document PDF', accept: { 'application/pdf': ['.pdf'] } };
  /** Choisir des fichiers. opt : {types:[{description, accept}], multiple, accept:'application/pdf,.pdf'}
      → [{file, handle|null, name, size}] ([] si annulé) */
  FS.open = function (opt) {
    opt = opt || {};
    if (FS.canPick && opt.picker !== false) {
      return window.showOpenFilePicker({ types: opt.types, multiple: !!opt.multiple, excludeAcceptAllOption: false, id: opt.id || M.app })
        .then(function (hs) { return Promise.all(hs.map(function (h) { return h.getFile().then(function (f) { return { file: f, handle: h, name: f.name, size: f.size }; }); })); })
        .catch(function (e) { if (e && e.name === 'AbortError') return []; throw e; });
    }
    return new Promise(function (resolve) {
      var inp = document.createElement('input'); inp.type = 'file'; inp.multiple = !!opt.multiple;
      if (opt.accept) inp.accept = opt.accept;
      inp.style.display = 'none'; document.body.appendChild(inp);
      inp.onchange = function () { var l = Array.prototype.map.call(inp.files || [], function (f) { return { file: f, handle: null, name: f.name, size: f.size }; }); inp.remove(); resolve(l); };
      inp.addEventListener('cancel', function () { inp.remove(); resolve([]); });
      inp.click();
    });
  };
  /** Télécharger (dossier Téléchargements du navigateur) */
  FS.download = function (blob, name) {
    var u = URL.createObjectURL(blob);
    anchorGo(u, { download: name || 'fichier' });
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
    return true;
  };
  /** « Enregistrer sous… » : {ok, handle, name} ; {ok:false, cancel:true} si annulé ; sans File System Access : téléchargement {ok, downloaded} */
  FS.saveAs = function (blob, name, opt) {
    opt = opt || {};
    if (!FS.canSave) { FS.download(blob, name); return Promise.resolve({ ok: true, downloaded: true, name: name }); }
    return M.withGesture(function () {
      return window.showSaveFilePicker({ suggestedName: name, types: opt.types, id: opt.id || M.app, startIn: opt.startIn || 'documents' });
    }, { title: 'Enregistrer', text: '« ' + name + ' » est prêt.', label: 'Choisir l\'emplacement…' })
      .then(function (h) { return FS.write(h, blob, true).then(function () { return { ok: true, handle: h, name: h.name }; }); })
      .catch(function (e) { if (e && (e.name === 'AbortError' || e.cancel)) return { ok: false, cancel: true }; throw e; });
  };
  /** État de l'autorisation d'une poignée ; ask : la redemander (avec un clic si besoin). → 'granted' | 'denied' | 'prompt' */
  FS.perm = function (h, mode, ask, label) {
    var o = { mode: mode || 'read' };
    if (!h || !h.queryPermission) return Promise.resolve('granted');
    return h.queryPermission(o).then(function (s) {
      if (s === 'granted' || !ask) return s;
      var verb = o.mode === 'readwrite' ? 'enregistrer dans' : 'ouvrir';
      return M.withGesture(function () { return h.requestPermission(o); },
        { title: 'Autoriser l\'accès', text: (label || M.conf.name || 'L\'appli') + ' doit ' + verb + ' « ' + h.name + ' ». Windows demande ton accord à chaque nouvelle session.', label: 'Autoriser' });
    });
  };
  /** Écrire dans un fichier du PC (autorisation demandée si besoin) */
  FS.write = function (h, blob, fresh) {
    var go = function () { return h.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }); }); };
    if (fresh) return go();
    return FS.perm(h, 'readwrite', true).then(function (s) { if (s !== 'granted') { var e = new Error('Autorisation refusée'); e.code = 'perm'; throw e; } return go(); });
  };
  /** Lire un fichier retenu (poignée → autorisation redemandée si besoin) */
  FS.read = function (h, label) {
    return FS.perm(h, 'read', true, label).then(function (s) {
      if (s !== 'granted') { var e = new Error('Autorisation refusée'); e.code = 'perm'; throw e; }
      return h.getFile();
    });
  };
  /** Retenir un fichier pour plus tard (récents, favoris) : {handle} ou {blob}, + name. → id */
  FS.remember = function (o) {
    var id = uid('f');
    return M.db.put('files', { id: id, app: M.app, name: o.name || (o.handle && o.handle.name) || (o.blob && o.blob.name) || '', handle: o.handle || null, blob: o.handle ? null : (o.blob || null), at: Date.now() }).then(function () { return id; });
  };
  FS.get = function (id) { return M.db.get('files', id); };
  FS.forget = function (id) { return M.db.del('files', id).catch(function () { }); };
  FS.list = function () { return M.db.all('files').then(function (l) { return (l || []).filter(function (x) { return x.app === M.app; }); }); };
  /** Contenu d'un fichier retenu → File/Blob ; erreurs : code 'missing', 'perm', ou cancel */
  FS.recall = function (id, label) {
    return FS.get(id).then(function (r) {
      if (!r) { var e = new Error('Fichier introuvable'); e.code = 'missing'; throw e; }
      if (r.blob) return r.blob;
      return FS.read(r.handle, label).catch(function (e) {
        if (e && e.cancel) throw e;
        if (e && e.name === 'NotFoundError') { var x = new Error('Fichier introuvable'); x.code = 'missing'; throw x; }
        if (e && (e.code === 'perm' || e.name === 'NotAllowedError' || e.name === 'SecurityError')) { var y = new Error('Autorisation refusée'); y.code = 'perm'; throw y; }
        throw e;
      });
    });
  };
  /** Le fichier retenu existe-t-il encore ? 'ok' | 'missing' | 'perm' (sans rien demander à l'utilisateur) */
  FS.check = function (id) {
    return FS.get(id).then(function (r) {
      if (!r) return 'missing';
      if (r.blob) return 'ok';
      return r.handle.queryPermission({ mode: 'read' }).then(function (s) {
        if (s !== 'granted') return 'ok';   // inconnu : on ne dérange pas l'utilisateur
        return r.handle.getFile().then(function () { return 'ok'; }, function (e) { return e && e.name === 'NotFoundError' ? 'missing' : 'ok'; });
      });
    }).catch(function () { return 'ok'; });
  };

  /* ---------------- Partage, ouverture ---------------- */
  /** Partage Windows (Web Share) si disponible, sinon téléchargement */
  M.share = function (blob, name, opt) {
    opt = opt || {};
    var f = new File([blob], name, { type: blob.type || mimeOf(name) });
    var can = false; try { can = !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { }
    if (!can) { FS.download(blob, name); M.toast('Partage indisponible sur ce PC : « ' + name + ' » est téléchargé, joins-le à ton message.', { ms: 5500 }); return Promise.resolve({ ok: true, downloaded: true }); }
    return M.withGesture(function () { return navigator.share({ files: [f], title: opt.title || name, text: opt.text || undefined }); },
      { title: 'Partager', text: '« ' + name + ' » est prêt.', label: 'Partager…' })
      .then(function () { return { ok: true }; })
      .catch(function (e) { if (e && (e.name === 'AbortError' || e.cancel)) return { ok: false, cancel: true }; FS.download(blob, name); M.toast('Partage impossible : fichier téléchargé'); return { ok: true, downloaded: true }; });
  };
  /** Ouvre un fichier (PDF, image, texte) dans un onglet du navigateur */
  M.openBlob = function (blob, name) {
    var u = URL.createObjectURL(blob), w = null;
    try { w = NATIVE.open.call(window, u, '_blank'); } catch (e) { }
    if (!w) anchorGo(u, { target: '_blank' });
    setTimeout(function () { URL.revokeObjectURL(u); }, 10 * 60000);
    return true;
  };

  /* ---------------- Impression ----------------
     Tout est imprimé depuis la page elle-même (conteneur #mpc-print, le reste est masqué à l'impression) :
     pas d'iframe, que certaines pages Android « accrochent » pour leur propre impression. */
  function loadScript(src) { return new Promise(function (ok, ko) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
  M.loadScript = loadScript;
  /** pdf.js (version vendorisée) */
  M.pdfjs = function () {
    var go = function () { var L = window.pdfjsLib; if (!L.GlobalWorkerOptions.workerSrc) L.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.js'; return L; };
    if (window.pdfjsLib) return Promise.resolve(go());
    return loadScript(VENDOR + 'pdf.min.js').then(go);
  };
  var printing = false;
  /** Imprime le contenu de box (élément #mpc-print) avec la boîte d'impression du navigateur */
  function printBox(box, title, urls) {
    var t0 = document.title, imgs = Array.prototype.slice.call((box.shadowRoot || box).querySelectorAll('img'));
    document.body.appendChild(box);
    return Promise.all(imgs.map(function (im) { return im.decode ? im.decode().catch(function () { }) : null; })).then(function () {
      return new Promise(function (resolve) {
        if (title) document.title = title;
        root.classList.add('mpc-printing');
        var done = false;
        var end = function () {
          if (done) return; done = true;
          root.classList.remove('mpc-printing'); box.remove(); document.title = t0; printing = false;
          (urls || []).forEach(function (u) { URL.revokeObjectURL(u); });
          window.removeEventListener('afterprint', end); resolve(true);
        };
        window.addEventListener('afterprint', end);
        setTimeout(function () { NATIVE.print.call(window); setTimeout(end, 1000); }, 60);
      });
    });
  }
  /** Imprime un PDF : pages rendues en images (≈ 150 ppp) puis boîte d'impression du navigateur */
  M.printPdf = function (data, name) {
    if (printing) return Promise.resolve(false);
    printing = true;
    var box = document.createElement('div'), urls = [];
    box.id = 'mpc-print';
    M.toast('Préparation de l\'impression…', { ms: 60000 });
    return toBlob(data, 'application/pdf').arrayBuffer().then(function (buf) {
      return M.pdfjs().then(function (L) { return L.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; });
    }).then(function (pdf) {
      var st = document.createElement('style'); st.textContent = '@page{margin:0}'; box.appendChild(st);
      var chain = Promise.resolve();
      for (var i = 1; i <= pdf.numPages; i++) (function (p) {
        chain = chain.then(function () { return pdf.getPage(p); }).then(function (pg) {
          var v = pg.getViewport({ scale: 150 / 72 }), c = document.createElement('canvas');
          c.width = Math.ceil(v.width); c.height = Math.ceil(v.height);
          var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
          return pg.render({ canvasContext: x, viewport: v }).promise.then(function () {
            return new Promise(function (ok) { c.toBlob(function (b) { var u = URL.createObjectURL(b); urls.push(u); var im = new Image(); im.src = u; box.appendChild(im); c.width = c.height = 0; ok(); }, 'image/jpeg', 0.92); });
          });
        });
      })(i);
      return chain.then(function () { pdf.destroy(); });
    }).then(function () {
      M.toastOff();
      return printBox(box, String(name || '').replace(/\.pdf$/i, ''), urls);
    }).catch(function (e) {
      printing = false; box.remove(); urls.forEach(function (u) { URL.revokeObjectURL(u); });
      M.toast('Impression impossible : ' + (e && e.message || e), { bad: true });
      return false;
    });
  };
  /** Imprime une page HTML (ses styles restent isolés dans un Shadow DOM) */
  M.printHtml = function (html, title) {
    if (printing) return Promise.resolve(false);
    printing = true;
    var box = document.createElement('div'); box.id = 'mpc-print';
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll('script').forEach(function (s) { s.remove(); });
    var css = Array.prototype.map.call(doc.querySelectorAll('style'), function (n) { return n.outerHTML; }).join('');
    box.attachShadow({ mode: 'open' }).innerHTML = css + '<div class="mpc-doc">' + doc.body.innerHTML + '</div>';
    return printBox(box, title || doc.title);
  };
  M.printImage = function (blob, name) {
    var u = URL.createObjectURL(blob);
    return M.printHtml('<style>img{display:block;max-width:100%;max-height:98vh;margin:auto}</style><img src="' + u + '">', name).then(function (r) { URL.revokeObjectURL(u); return r; });
  };

  /* ---------------- Images ---------------- */
  /** Réduit une image (File/Blob) : {max: 720, square: false, type: 'image/jpeg', quality: .86} → data: URL (orientation EXIF respectée) */
  M.scaleImage = function (blob, opt) {
    opt = opt || {};
    var max = opt.max || 720;
    return createImageBitmap(blob, { imageOrientation: 'from-image' }).then(function (bm) {
      var sx = 0, sy = 0, sw = bm.width, sh = bm.height;
      if (opt.square) { var sq = Math.min(sw, sh); sx = (sw - sq) / 2; sy = (sh - sq) / 2; sw = sh = sq; }
      var k = Math.min(1, max / Math.max(sw, sh)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
      var x = c.getContext('2d'); if ((opt.type || 'image/jpeg') === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(bm, sx, sy, sw, sh, 0, 0, c.width, c.height);
      if (bm.close) bm.close();
      return c.toDataURL(opt.type || 'image/jpeg', opt.quality || 0.86);
    });
  };

  /* ---------------- Presse-papier ---------------- */
  M.clip = {
    write: function (t) { return navigator.clipboard.writeText(String(t)).then(function () { return true; }, function () { return false; }); },
    writeImage: function (blob) { try { return navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]).then(function () { return true; }, function () { return false; }); } catch (e) { return Promise.resolve(false); } },
    read: function () { return navigator.clipboard.readText().catch(function () { M.unavailable('La lecture du presse-papier', 'autorise-la dans le navigateur ou utilise Ctrl+V'); return ''; }); }
  };

  /* ---------------- Notifications (pendant que l'appli est ouverte) ---------------- */
  M.notify = function (title, body, opt) {
    opt = opt || {};
    if (!('Notification' in window)) { M.toast(title + (body ? ' : ' + body : '')); return Promise.resolve(false); }
    var show = function () { try { var n = new Notification(title || M.conf.name || '', { body: body || '', icon: opt.icon || 'icon-192.png', tag: opt.tag }); n.onclick = function () { window.focus(); n.close(); }; return true; } catch (e) { M.toast(title + (body ? ' : ' + body : '')); return false; } };
    if (Notification.permission === 'granted') return Promise.resolve(show());
    if (Notification.permission === 'denied') { M.toast(title + (body ? ' : ' + body : '')); return Promise.resolve(false); }
    return Notification.requestPermission().then(function (p) { if (p === 'granted') return show(); M.toast(title + (body ? ' : ' + body : '')); return false; });
  };
  var timers = {};
  /** Notification différée : seulement tant que la fenêtre de l'appli reste ouverte (pas de service en arrière-plan sur PC) */
  M.schedule = function (id, delay, title, body) {
    M.cancel(id);
    var at = Date.now() + Math.max(0, delay);
    (function arm() {   // setTimeout ne dépasse pas ~24 jours : on réarme par étapes
      var left = at - Date.now();
      timers[id] = setTimeout(function () { if (at - Date.now() > 1000) { arm(); return; } delete timers[id]; M.notify(title, body, { tag: String(id) }); }, Math.min(Math.max(0, left), 2e9));
    })();
  };
  M.cancel = function (id) { if (timers[id]) { clearTimeout(timers[id]); delete timers[id]; } };

  /* ---------------- Écran allumé, voix ---------------- */
  var wake = null, wantWake = false;
  M.keepScreen = function (on) {
    wantWake = !!on;
    if (!('wakeLock' in navigator)) return;
    if (on && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }, function () { });
    if (!on && wake) { try { wake.release(); } catch (e) { } wake = null; }
  };
  document.addEventListener('visibilitychange', function () { if (!document.hidden && wantWake && !wake) M.keepScreen(true); });
  M.speak = function (text) {
    if (!window.speechSynthesis) { M.unavailable('La lecture à voix haute'); return; }
    var u = new SpeechSynthesisUtterance(String(text || '')); u.lang = 'fr-FR';
    var v = speechSynthesis.getVoices().filter(function (x) { return /^fr/i.test(x.lang); })[0]; if (v) u.voice = v;
    speechSynthesis.speak(u);
  };

  /* ---------------- Code PIN local (remplace l'empreinte / le visage d'Android) ----------------
     Un code de 4 à 8 chiffres, commun aux applis PC de la Suite sur ce navigateur. Seule une empreinte
     PBKDF2-SHA-256 (sel aléatoire) est gardée dans localStorage. Ce n'est pas Windows Hello : c'est une
     vérification de présence, comme le code du téléphone sur Android. */
  var PINK = 'mag-pc-pin', PINF = 'mag-pc-pin-fails';
  function hashPin(pin, salt, iter) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(salt), iterations: iter }, k, 256);
    }).then(function (b) { return bytesToB64(new Uint8Array(b)); });
  }
  function pinField(id, ph, af) { return '<input class="mpc-pin" id="' + id + '" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="' + esc(ph) + '"' + (af ? ' autofocus' : '') + '>'; }
  M.pin = {
    has: function () { return !!M.store.get(PINK, null); },
    /** Crée le code (deux saisies). → true si créé */
    create: function (why) {
      return new Promise(function (resolve) {
        var err = function (el, t) { el.querySelector('.mpc-err').textContent = t; };
        M.dialog({
          title: 'Choisir un code PIN',
          html: '<p>' + esc(why || 'Sur PC, ta signature est protégée par un code PIN propre à cet ordinateur (il remplace l\'empreinte ou le visage du téléphone).') + '</p>' +
            pinField('mpcP1', 'Nouveau code (4 à 8 chiffres)', true) + pinField('mpcP2', 'Confirmer le code') + '<p class="mpc-err"></p><p class="mpc-small">Retiens-le : sans lui, il faudra effacer ta signature pour en refaire une.</p>',
          buttons: [{ label: 'Annuler', value: false }, {
            label: 'Enregistrer', primary: true, value: true, onClick: function (close, el) {
              var a = el.querySelector('#mpcP1').value, b = el.querySelector('#mpcP2').value;
              if (!/^\d{4,8}$/.test(a)) { err(el, 'Le code doit faire 4 à 8 chiffres.'); return false; }
              if (a !== b) { err(el, 'Les deux codes sont différents.'); return false; }
              var salt = bytesToB64(crypto.getRandomValues(new Uint8Array(16))), iter = 150000;
              hashPin(a, salt, iter).then(function (h) { M.store.set(PINK, { salt: salt, iter: iter, hash: h, at: Date.now() }); M.store.del(PINF); resolve(true); });
            }
          }],
          onOpen: function (el) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('.mpc-btns .pri').click(); } }); }
        }).then(function (v) { if (!v) resolve(false); });
      });
    },
    /** Demande le code. opt : {title, sub, onForgot}. → {ok} | {ok:false, cancel} | {ok:false, err} */
    verify: function (opt) {
      opt = opt || {};
      if (!M.pin.has()) return M.pin.create(opt.createWhy).then(function (ok) { return ok ? { ok: true, created: true } : { ok: false, cancel: true }; });
      return new Promise(function (resolve) {
        var rec = M.store.get(PINK, {}), settled = false;
        var fin = function (r) { if (!settled) { settled = true; resolve(r); } };
        M.dialog({
          title: opt.title || 'Code PIN',
          html: '<p>' + esc(opt.sub || 'Tape ton code PIN') + '</p>' + pinField('mpcPin', 'Code PIN', true) + '<p class="mpc-err"></p>' +
            (opt.onForgot ? '<p class="mpc-small"><a href="#" id="mpcForgot">Code oublié ?</a></p>' : ''),
          buttons: [{ label: 'Annuler', value: 'x' }, {
            label: 'Valider', primary: true, value: 'v', onClick: function (close, el) {
              var inp = el.querySelector('#mpcPin'), f = M.store.get(PINF, { n: 0, until: 0 });
              if (f.until > Date.now()) { el.querySelector('.mpc-err').textContent = 'Trop d\'essais : attends ' + Math.ceil((f.until - Date.now()) / 1000) + ' s.'; return false; }
              hashPin(inp.value, rec.salt, rec.iter || 150000).then(function (h) {
                if (h === rec.hash) { M.store.del(PINF); close('v'); fin({ ok: true }); return; }
                f.n = (f.n || 0) + 1; if (f.n >= 5) { f.until = Date.now() + 30000; f.n = 0; } M.store.set(PINF, f);
                el.querySelector('.mpc-err').textContent = f.until > Date.now() ? 'Code incorrect. Trop d\'essais : attends 30 s.' : 'Code incorrect.';
                inp.value = ''; inp.focus();
              });
              return false;
            }
          }],
          onOpen: function (el, close) {
            el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('.mpc-btns .pri').click(); } });
            var fg = el.querySelector('#mpcForgot');
            if (fg) fg.onclick = function (e) { e.preventDefault(); close('x'); fin({ ok: false, cancel: true }); setTimeout(opt.onForgot, 50); };
          }
        }).then(function (v) { if (v !== 'v') fin({ ok: false, cancel: true }); });
      });
    },
    reset: function () { M.store.del(PINK); M.store.del(PINF); }
  };

  /* ---------------- Clavier, molette, glisser-déposer, « Ouvrir avec » ---------------- */
  var KEYS = [];
  /** Raccourcis : MAGPC.keys({'mod+o': fn, 'mod+shift+s': fn, 'escape': fn, 'arrowleft': fn…}) ; mod = Ctrl (ou Cmd).
      fn(e) renvoie false pour laisser l'événement au navigateur. Hors combinaisons Ctrl et Échap, ignoré pendant la saisie. */
  M.keys = function (map) { Object.keys(map).forEach(function (k) { KEYS.push({ k: k.toLowerCase().replace(/\s+/g, ''), fn: map[k] }); }); };
  function keyName(e) {
    var k = (e.key || '').toLowerCase(); if (k === ' ') k = 'space'; if (k === 'esc') k = 'escape';
    if ((e.ctrlKey || e.metaKey) && /^(Digit|Numpad)0$/.test(e.code || '')) k = '0';   // Ctrl+0 sur clavier AZERTY
    return ((e.ctrlKey || e.metaKey) ? 'mod+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey && k.length > 1 ? 'shift+' : '') + (e.shiftKey && k.length === 1 && /[a-z]/.test(k) ? 'shift+' : '') + k;
  }
  M.typing = function () { var a = document.activeElement; return !!(a && (a.isContentEditable || /^(input|textarea|select)$/i.test(a.tagName)) && !(a.type && /^(button|checkbox|radio|range|submit)$/i.test(a.type))); };
  window.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.isComposing) return;
    if (dlgStack.length) { if (e.key === 'Escape') { e.preventDefault(); dlgStack[dlgStack.length - 1](null); } return; }
    var n = keyName(e), mod = e.ctrlKey || e.metaKey;
    if (!mod && n !== 'escape' && M.typing()) return;
    for (var i = KEYS.length - 1; i >= 0; i--) {
      if (KEYS[i].k === n || (KEYS[i].k === 'mod+=' && n === 'mod++')) {
        var r = KEYS[i].fn(e);
        if (r !== false) { e.preventDefault(); e.stopPropagation(); }
        return;
      }
    }
  }, true);
  /** Ctrl + molette (ou pincement du pavé tactile) : fn(facteur, e). La page n'est plus agrandie par le navigateur. */
  M.onZoom = function (fn) {
    var acc = 1, last = null, t = null;
    window.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      acc *= Math.exp(-Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * 0.006);
      last = e;
      if (!t) t = setTimeout(function () { t = null; var k = acc; acc = 1; fn(k, last); }, 90);
    }, { passive: false });
  };
  var fileHandler = null, fileQueue = [];
  /** Fichiers déposés sur la fenêtre ou reçus par « Ouvrir avec » (appli installée) : fn({items:[{file, handle}], via:'drop'|'launch'})
      (un dossier déposé : {file:null, handle: poignée du dossier, dir:true}) */
  M.onFiles = function (fn) { fileHandler = fn; var q = fileQueue; fileQueue = []; q.forEach(function (x) { fn(x); }); };
  function deliverFiles(o) { if (!o.items.length) return; if (fileHandler) fileHandler(o); else fileQueue.push(o); }
  var dropUi = null, dragN = 0;
  function dropShow(on) {
    if (!dropUi) { dropUi = document.createElement('div'); dropUi.id = 'mpc-drop'; dropUi.innerHTML = '<div><b>Déposer pour ouvrir</b><span>' + esc(M.conf.dropHint || '') + '</span></div>'; UI().appendChild(dropUi); }
    dropUi.classList.toggle('on', !!on);
  }
  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  function ownsDrop(el) { return !!(el && el.closest && el.closest('[data-mpc-drop], .drop')); }   // zones de dépôt de la page elle-même
  window.addEventListener('dragenter', function (e) { if (!hasFiles(e) || !fileHandler) return; dragN++; if (!ownsDrop(e.target)) dropShow(true); });
  window.addEventListener('dragleave', function () { if (--dragN <= 0) { dragN = 0; dropShow(false); } });
  window.addEventListener('dragover', function (e) { if (!hasFiles(e) || !fileHandler) return; if (!ownsDrop(e.target)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dropShow(true); } else dropShow(false); });
  window.addEventListener('drop', function (e) {
    dragN = 0; dropShow(false);
    if (e.defaultPrevented || !hasFiles(e) || !fileHandler) return;
    e.preventDefault();
    var dt = e.dataTransfer, its = Array.prototype.slice.call(dt.items || []).filter(function (i) { return i.kind === 'file'; });
    // les poignées doivent être demandées pendant l'événement
    var ps = its.map(function (i) {
      var f = i.getAsFile(), hp = i.getAsFileSystemHandle ? i.getAsFileSystemHandle().catch(function () { return null; }) : Promise.resolve(null);
      return hp.then(function (h) { return h && h.kind === 'directory' ? { file: null, handle: h, dir: true } : h && h.kind === 'file' ? { file: f, handle: h } : (f ? { file: f, handle: null } : null); });
    });
    if (!ps.length) ps = Array.prototype.map.call(dt.files || [], function (f) { return Promise.resolve({ file: f, handle: null }); });
    Promise.all(ps).then(function (l) { deliverFiles({ items: l.filter(Boolean), via: 'drop' }); });
  });
  if ('launchQueue' in window && window.launchQueue && window.launchQueue.setConsumer) {
    window.launchQueue.setConsumer(function (p) {
      if (!p || !p.files || !p.files.length) return;
      Promise.all(p.files.map(function (h) { return h.getFile().then(function (f) { return { file: f, handle: h }; }, function () { return null; }); }))
        .then(function (l) { deliverFiles({ items: l.filter(Boolean), via: 'launch' }); });
    });
  }

  /* ---------------- Reconnaissance de texte (Tesseract, hors ligne) ----------------
     MAGPC.ocr.recognize(image JPEG/PNG) → {w, h, text, blocks:[{lines:[{t, p:[8 coins], words:[{t, p}]}]}]}
     (même forme que le résultat de ML Kit renvoyé par le pont Android). Moteur : pc/shared/ocr-worker.js. */
  var ocrW = null, ocrN = 0, ocrWait = {}, ocrIdle = null;
  function simdOk() { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; } }
  function parseTsv(tsv) {
    var out = { w: 0, h: 0, blocks: [] }, blocks = {}, lines = {}, order = [];
    String(tsv || '').split('\n').forEach(function (row) {
      var c = row.split('\t'); if (c.length < 11) return;
      var lv = +c[0], b = c[2], pa = c[3], ln = c[4], x = +c[6], y = +c[7], w = +c[8], h = +c[9], txt = c.slice(11).join('\t');
      var pts = [x, y, x + w, y, x + w, y + h, x, y + h];
      if (lv === 1) { out.w = Math.max(out.w, x + w); out.h = Math.max(out.h, y + h); }
      else if (lv === 2) { if (!blocks[b]) { blocks[b] = { lines: [] }; order.push(b); } }
      else if (lv === 4) { var k = b + '.' + pa + '.' + ln; if (!blocks[b]) { blocks[b] = { lines: [] }; order.push(b); } lines[k] = { t: '', p: pts, words: [] }; blocks[b].lines.push(lines[k]); }
      else if (lv === 5) { var L2 = lines[b + '.' + pa + '.' + ln]; if (!L2 || !txt.trim()) return; L2.words.push({ t: txt, p: pts }); L2.t += (L2.t ? ' ' : '') + txt; }
    });
    out.blocks = order.map(function (b) { var o = blocks[b]; o.lines = o.lines.filter(function (l) { return l.words.length; }); return o; }).filter(function (o) { return o.lines.length; });
    out.text = out.blocks.map(function (b) { return b.lines.map(function (l) { return l.t; }).join('\n'); }).join('\n\n');
    return out;
  }
  M.ocr = {
    supported: function () { return typeof WebAssembly === 'object' && typeof Worker === 'function' && simdOk(); },
    recognize: function (img, opt) {
      opt = opt || {};
      if (!M.ocr.supported()) return Promise.reject(new Error('ce navigateur ne peut pas faire tourner le moteur de reconnaissance (WebAssembly SIMD requis : Edge ou Chrome récents)'));
      clearTimeout(ocrIdle);
      if (!ocrW) {
        ocrW = new Worker(CONF.ocrWorker || 'ocr-worker.js');   // copié dans le dossier de l'appli (portée du service worker)
        ocrW.onmessage = function (e) { var d = e.data, w = ocrWait[d.id]; if (!w) return; delete ocrWait[d.id]; if (d.ok) w.ok(parseTsv(d.tsv)); else w.ko(new Error(d.err || 'reconnaissance impossible')); };
        ocrW.onerror = function (e) { var l = ocrWait; ocrWait = {}; Object.keys(l).forEach(function (k) { l[k].ko(new Error('moteur de reconnaissance indisponible' + (e && e.message ? ' : ' + e.message : ''))); }); try { ocrW.terminate(); } catch (x) { } ocrW = null; };
      }
      return toBlob(img, 'image/jpeg').arrayBuffer().then(function (buf) {
        return new Promise(function (ok, ko) {
          var id = ++ocrN; ocrWait[id] = { ok: ok, ko: ko };
          ocrW.postMessage({ id: id, cmd: 'rec', img: buf, lang: opt.lang || 'fra', base: new URL(VENDOR + 'tesseract/', location.href).href }, [buf]);
        });
      }).then(function (r) { ocrIdle = setTimeout(M.ocr.stop, 120000); return r; }, function (e) { ocrIdle = setTimeout(M.ocr.stop, 120000); throw e; });
    },
    stop: function () { if (ocrW && !Object.keys(ocrWait).length) { try { ocrW.terminate(); } catch (e) { } ocrW = null; } },
    parseTsv: parseTsv
  };

  /* ---------------- Service worker : hors ligne et mises à jour ---------------- */
  var swReady = null;
  M.sw = { reg: null };
  function showUpdate(w) {
    if (!w || M.sw.shown) return; M.sw.shown = true;
    whenBody(function () {
      var b = document.createElement('div'); b.id = 'mpc-update'; b.setAttribute('role', 'alert');
      b.innerHTML = '<span><b>Nouvelle version disponible</b><small>' + esc(M.conf.name || '') + '</small></span><button type="button" class="later">Plus tard</button><button type="button" class="go">Mettre à jour</button>';
      UI().appendChild(b); requestAnimationFrame(function () { b.classList.add('on'); });
      b.querySelector('.later').onclick = function () { b.remove(); };
      b.querySelector('.go').onclick = function () {
        b.querySelector('.go').textContent = 'Mise à jour…';
        M.sw.reloading = true;
        var wt = (M.sw.reg && M.sw.reg.waiting) || w;
        wt.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(function () { location.reload(); }, 4000);
      };
    });
  }
  M.update = function () { return M.sw.reg ? M.sw.reg.update().catch(function () { }) : Promise.resolve(); };
  if ('serviceWorker' in navigator && CONF.sw !== false && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    swReady = navigator.serviceWorker.register(CONF.sw || 'sw.js').then(function (reg) {
      M.sw.reg = reg;
      var watch = function (w) { if (!w) return; w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); }); };
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      if (reg.installing) watch(reg.installing);
      reg.addEventListener('updatefound', function () { watch(reg.installing); });
      var lastCheck = Date.now();
      setInterval(M.update, 60 * 60000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - lastCheck > 10 * 60000) { lastCheck = Date.now(); M.update(); } });
      return reg;
    }).catch(function (e) { console.warn('Service worker non enregistré', e); });
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (M.sw.reloading) location.reload(); });
  }
  M.sw.ready = swReady || Promise.resolve(null);

  /* ---------------- Installation (Edge, Chrome) ---------------- */
  M.installed = function () { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches; } catch (e) { return false; } };
  M.installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); M.installPrompt = e;
    if (CONF.installPill === false || M.store.get('mag-pc-noinstall-' + M.app, false)) return;
    whenBody(function () {
      if (document.getElementById('mpc-install')) return;
      var p = document.createElement('div'); p.id = 'mpc-install';
      p.innerHTML = '<button type="button" class="go" title="Installer ' + esc(M.conf.name || '') + ' sur cet ordinateur">⤓ Installer l\'appli</button><button type="button" class="x" aria-label="Ne plus proposer">✕</button>';
      UI().appendChild(p);
      p.querySelector('.go').onclick = function () { M.install(); };
      p.querySelector('.x').onclick = function () { M.store.set('mag-pc-noinstall-' + M.app, true); p.remove(); };
    });
  });
  window.addEventListener('appinstalled', function () { var p = document.getElementById('mpc-install'); if (p) p.remove(); M.installPrompt = null; M.toast('Appli installée : elle est dans le menu Démarrer'); });
  M.install = function () {
    var e = M.installPrompt;
    if (!e) { M.toast('Pour installer : menu ⋯ du navigateur › Applications › Installer cette appli'); return Promise.resolve(false); }
    return e.prompt().then(function () { return e.userChoice; }).then(function (c) { M.installPrompt = null; var p = document.getElementById('mpc-install'); if (p && c && c.outcome === 'accepted') p.remove(); return !!(c && c.outcome === 'accepted'); });
  };

  /* ---------------- window.MAGPrint, version PC ----------------
     Seulement les fonctions qui ont un équivalent sur PC. Les pages testent leur présence
     (if (P.musicScan)…) : une fonction absente garde le comportement « navigateur » de la page. */
  function fileMenu(b64, name, mime) {
    var blob = toBlob(b64, mime || mimeOf(name)), isPdf = /pdf/.test(blob.type), isImg = /^image\//.test(blob.type);
    var b = [];
    b.push({ label: FS.canSave ? '💾 Enregistrer sous…' : '⬇ Télécharger', primary: true, value: 'save', onClick: function () { FS.saveAs(blob, name, { types: isPdf ? [FS.PDF] : undefined }).then(function (r) { if (r.ok) M.toast(r.downloaded ? 'Fichier téléchargé' : 'Enregistré : ' + r.name); }, function (e) { M.toast('Enregistrement impossible : ' + (e && e.message || e), { bad: true }); }); } });
    if (FS.canSave) b.push({ label: '⬇ Télécharger', value: 'dl', onClick: function () { FS.download(blob, name); } });
    var canShare = false; try { canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] })); } catch (e) { }
    if (canShare) b.push({ label: '📤 Partager…', value: 'share', onClick: function () { M.share(blob, name); } });
    if (isPdf || isImg) b.push({ label: '🖨 Imprimer', value: 'print', onClick: function () { isPdf ? M.printPdf(blob, name) : M.printImage(blob, name); } });
    if (isPdf || isImg || /^text\//.test(blob.type)) b.push({ label: '👁 Ouvrir dans un onglet', value: 'open', onClick: function () { M.openBlob(blob, name); } });
    b.push({ label: 'Fermer', value: null });
    return M.dialog({ title: name, html: '<p class="mpc-small">' + esc(kb(blob.size)) + '</p>', buttons: b, cls: 'menu' });
  }
  M.fileMenu = function (blob, name) { return fileMenu(blob, name, blob.type); };
  if (!window.MAGPrint) {
    var socle = null;
    try { var q = new URLSearchParams(location.search); socle = q.get('socle'); if (socle) history.replaceState(null, '', location.pathname + location.hash); } catch (e) { }
    window.MAGPrint = {
      version: function () { return 'pc-' + M.version; },
      printHtml: function (html, title) { M.printHtml(html, title); },
      printPdf: function (b64, name) { M.printPdf(b64, name); },
      openFile: function (b64, name, mime) { M.openBlob(toBlob(b64, mime || mimeOf(name)), name); },
      fileMenu: function (b64, name, mime) { fileMenu(b64, name, mime); },
      notifyUser: function (title, text) { M.notify(title, text); },
      scheduleNotif: function (delay, title, text, id) { M.schedule(id, delay, title, text); },
      cancelNotif: function (id) { M.cancel(id); },
      speak: function (text) { M.speak(text); },
      keepScreen: function (on) { M.keepScreen(on); },
      takeSocle: function () { var s = socle; socle = null; return s || ''; },
      appBack: function () { history.back(); }
    };
  }
})();
