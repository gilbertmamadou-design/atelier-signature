/* =====================================================================
   Mélodie sur PC. La page a un mode « navigateur » qui COPIE chaque morceau
   dans le stockage du navigateur. Sur PC, les morceaux d'un dossier choisi
   (« Un dossier », ou dossier déposé sur la fenêtre) restent à leur place :
   seule leur poignée File System Access est gardée (IndexedDB « melodie »),
   et le fichier est relu à la lecture (Windows redemande l'accès d'un clic
   à chaque nouvelle session). Les fichiers choisis un par un sont copiés
   comme avant. Raccourcis : Espace lecture/pause, Ctrl+← →  morceau, Ctrl+F chercher.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var AUDIO = /\.(mp3|m4a|flac|ogg|oga|opus|wav|aac|wma)$/i, IMG = /\.(jpe?g|png|webp)$/i;
  var TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', wma: 'audio/x-ms-wma' };
  async function walk(dh, path, out, depth, root) {
    root = root || dh;
    if (depth > 12 || out.length > 20000) return;
    for await (var e of dh.values()) {
      if (e.kind === 'directory') { if (!/^\./.test(e.name)) await walk(e, path + '/' + e.name, out, depth + 1, root); continue; }
      if (!AUDIO.test(e.name) && !IMG.test(e.name)) continue;
      try {
        var f = await e.getFile(), ext = (e.name.match(/\.([^.]+)$/) || [])[1] || '';
        if (!f.type && TYPES[ext.toLowerCase()]) f = new File([f], f.name, { type: TYPES[ext.toLowerCase()], lastModified: f.lastModified });
        Object.defineProperty(f, 'webkitRelativePath', { value: path.slice(1) + '/' + e.name });
        f.__mpcHandle = e; f.__mpcRoot = root;
        out.push(f);
      } catch (x) { }
    }
  }
  async function importDir(dh) {
    var files = [];
    M.toast('Lecture du dossier « ' + dh.name + ' »…', { ms: 60000 });
    await walk(dh, '/' + dh.name, files, 0);
    M.toastOff();
    if (typeof importFiles === 'function') importFiles(files);          // eslint-disable-line no-undef
  }
  function pickDir() {
    if (typeof window.showDirectoryPicker !== 'function') return false;
    window.showDirectoryPicker({ mode: 'read', id: 'melodie', startIn: 'music' }).then(importDir, function (e) { if (!e || e.name !== 'AbortError') M.toast('Dossier inaccessible : ' + (e && e.message || e), { bad: true }); });
    return true;
  }
  /** valeur gardée pour un morceau : Blob (copie) ou {mpcHandle} (fichier du PC, relu à la demande) */
  function resolve(v) {
    if (!v || !v.mpcHandle) return Promise.resolve(v);
    // une seule autorisation pour tout le dossier de musique (sinon Windows demanderait pour chaque morceau)
    var ask = v.mpcRoot ? v.mpcHandle.queryPermission({ mode: 'read' }).then(function (s) { return s === 'granted' ? s : M.fs.perm(v.mpcRoot, 'read', true, 'Mélodie'); }) : M.fs.perm(v.mpcHandle, 'read', true, 'Mélodie');
    return ask.then(function (s) {
      if (s !== 'granted') throw new Error('perm');
      return v.mpcHandle.getFile();
    }).then(function (f) { return f.type ? f : new Blob([f], { type: v.type || 'audio/mpeg' }); }, function (e) {
      M.toast(e && e.name === 'NotFoundError' ? 'Fichier déplacé ou supprimé du PC : ' + v.mpcHandle.name : e && e.cancel ? 'Lecture annulée' : 'Windows n\'a pas autorisé la lecture de « ' + v.mpcHandle.name + ' »', { bad: true });
      return undefined;
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    /* global IDB */
    if (typeof IDB === 'object' && IDB && IDB.get) { var g = IDB.get; IDB.get = function (k) { return g(k).then(function (v) { return /^blob:/.test(k) ? resolve(v) : v; }); }; }
    var di = document.getElementById('dirIn'); if (di) di.click = function () { if (!pickDir()) HTMLInputElement.prototype.click.call(di); };
  });
  M.conf.dropHint = 'Dossier de musique (gardé à sa place) ou morceaux à ajouter';
  M.onFiles(function (o) {
    var dirs = o.items.filter(function (x) { return x.dir; }), files = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && (AUDIO.test(f.name) || /^audio\//.test(f.type)); });
    if (dirs.length) { (async function () { for (var i = 0; i < dirs.length; i++) await importDir(dirs[i].handle); })(); return; }
    if (files.length && typeof importFiles === 'function') { importFiles(files); return; }      // eslint-disable-line no-undef
    M.toast('Dépose un dossier de musique ou des fichiers audio', { bad: true });
  });
  /* global next, prev */
  M.keys({
    'space': function () { var b = document.getElementById('miniPlay'); if (!b || !b.getClientRects().length) b = document.getElementById('pPlay'); if (!b) return false; b.click(); },
    'mod+arrowright': function () { if (typeof next !== 'function') return false; next(); },
    'mod+arrowleft': function () { if (typeof prev !== 'function') return false; prev(); },
    'mod+f': function () { var q = document.querySelector('input[type=search]'); if (!q) return false; q.focus(); q.select(); }
  });
  /* Commandes de Majordome (« pause », « suivant »…) : canal BroadcastChannel « mag-media » entre fenêtres de la Suite sur PC */
  /* global toggle, audio */
  try {
    var ch = new BroadcastChannel('mag-media');
    ch.onmessage = function (e) {
      var c = e.data && e.data.cmd; if (!c || typeof toggle !== 'function') return;
      var a = typeof audio !== 'undefined' ? audio : document.getElementById('audio'), playing = a && !a.paused;
      if (c === 'play' && !playing) toggle(); else if (c === 'pause' && playing) toggle();
      else if (c === 'toggle') toggle(); else if (c === 'next' && typeof next === 'function') next(); else if (c === 'prev' && typeof prev === 'function') prev();
      ch.postMessage({ ack: c });
    };
  } catch (x) { }
})();
