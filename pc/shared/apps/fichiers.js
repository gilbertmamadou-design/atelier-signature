/* =====================================================================
   Rangement sur PC : plusieurs dossiers analysés ensemble.
   La page Android a un pilote « ordinateur » (PcDrv : un dossier choisi avec
   File System Access). Ici, sans modifier la page (l'APK ne change pas) :
     - une LISTE de dossiers (« racines ») : Documents, Images, OneDrive, un
       autre disque… ajoutés un par un, retirés sans rien supprimer ;
     - analyse commune : vue d'ensemble, catégories, doublons d'un dossier à
       l'autre, gros fichiers, récents, recherche ;
     - chaque dossier est une racine : raccourci à l'accueil, fil d'Ariane,
       puces de dossiers dans l'onglet Fichiers ;
     - liste mémorisée (poignées dans IndexedDB « mag-pc ») ; à la session
       suivante, un clic réautorise tous les dossiers (requestPermission) ;
       logique commune à Écran, Mélodie, Galerie, Liseuse : pc/shared/folders.js ;
     - dossier imbriqué dans un autre déjà présent : pas de double analyse
       (on prévient, ou on fusionne si le nouveau contient un ancien).
   Chemins internes : /<nom du dossier>/…, deux dossiers de même nom :
   « Images » et « Images (2) ». Onglet « Applis » (Android) masqué.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var KEY = 'fichiers-racines', OLD = 'fichiers-dossier';
    var esc = M.esc;
  var NOTE = '<b>Dossiers refusés par le navigateur.</b> Edge et Chrome n\'ouvrent jamais <b>C:\\</b> ni les dossiers du système ' +
    '(Windows, Program Files, AppData). Essayez votre dossier personnel <b>C:\\Users\\&lt;nom&gt;</b> : s\'il est refusé lui aussi ' +
    '(certaines versions refusent ce dossier, ainsi que Documents, Bureau ou Téléchargements pris en entier), ajoutez plutôt ' +
    'leurs sous-dossiers, ou Images, Musique, Vidéos, OneDrive, un autre disque (D:\\Photos…) : tous sont analysés ensemble.';

  // liste commune (pc/shared/folders.js) : même enregistrement qu'avant (« mag-pc » › files › fichiers-racines)
  var F = M.Folders({
    mode: 'readwrite', label: 'Rangement',
    get: function () { return M.db.get('files', KEY).then(function (rec) { return rec ? (rec.roots || []) : null; }); },
    put: function (l) { return M.db.put('files', { id: KEY, app: M.app, dir: true, name: l.map(function (r) { return r.handle.name; }).join(', '), roots: l, at: Date.now() }); },
    legacy: function () { return M.db.get('files', OLD).then(function (old) { return old && old.handle ? [{ handle: old.handle, at: old.at }] : null; }); }   // lot 1 : un seul dossier retenu
  });
  function ok() { return F.ok(); }
  function waiting() { return F.waiting(); }
  function save() { return F.save(); }
  async function load() { await F.load(); }
  function check(r) { return F.check(r); }
  function ask(r) { return F.ask(r); }
  /** Ajoute un dossier à la liste. → true s'il faut relancer l'analyse */
  async function addRoot(h, mode) {
    var res = await F.add(h, mode);
    if (res.k === 'same') {
      M.toast('« ' + h.name + ' » est déjà dans la liste');
      if (!res.root.ok && await F.ask(res.root)) return true;
      return false;
    }
    if (res.k === 'inside') {
      var r = res.root, where = [r.name].concat(res.path).join(' › ');
      var go = await M.dialog({ title: 'Déjà analysé', html: '<p>« ' + esc(h.name) + ' » se trouve dans « ' + esc(r.name) + ' », qui est déjà dans la liste :</p><p><b>' + esc(where) + '</b></p><p class="mpc-small">Il est donc déjà compris dans l\'analyse : rien à ajouter (pas de doublons en double).</p>',
        buttons: [{ label: 'Fermer', value: false }, { label: 'Ouvrir ce dossier', value: true, primary: true }] });
      if (go && r.ok && typeof cd === 'function') {                    // eslint-disable-line no-undef
        var p = r.path + '/' + res.path.join('/');
        setTimeout(function () { cd(p); }, 50);                       // eslint-disable-line no-undef
      }
      return false;
    }
    if (res.merged.length) M.toast('« ' + h.name + ' » contient déjà ' + res.merged.map(function (r) { return '« ' + r.name + ' »'; }).join(', ') + ' : dossiers fusionnés, analysés une seule fois', { ms: 6000 });
    return true;
  }
  async function pickFolder() {
    if (!window.showDirectoryPicker) return null;
    var h = await F.pick({ id: 'rangement', startIn: 'documents', note: NOTE });
    return h ? { h: h, mode: 'readwrite' } : null;
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof PcDrv === 'undefined') return;                           // eslint-disable-line no-undef
    var D = PcDrv;                                                      // eslint-disable-line no-undef
    var pick0 = D.pick, scan0 = D.scan, fallbackName = '';

    /* ---- pilote PC : plusieurs racines ---- */
    Object.defineProperty(D, 'rootName', {
      configurable: true,
      get: function () { return D.files ? fallbackName : ok().map(function (r) { return r.name; }).join(', '); },
      set: function (v) { fallbackName = v; }
    });
    D.root = function () { if (D.files) return '/' + (fallbackName || 'Dossier'); var r = ok()[0]; return r ? r.path : '/Dossier'; };
    D.roots = function () {
      if (D.files) return fallbackName ? [{ path: D.root(), name: fallbackName, total: 0, free: 0 }] : [];
      return ok().map(function (r) { return { path: r.path, name: r.name, total: 0, free: 0 }; });
    };
    D.pick = async function () {
      if (!window.showDirectoryPicker) return pick0.apply(D, arguments);   // autre navigateur : un dossier, analyse seule
      var p = await pickFolder(); if (!p) return false;
      D.files = null;
      var again = await addRoot(p.h, p.mode);
      D.canWrite = ok().some(function (r) { return r.mode === 'readwrite'; });
      return again;
    };
    D.scan = async function (ui) {
      if (D.files) return scan0.call(D, ui);
      var lines = [], n = 0, bytes = 0, H = D.H;
      H.clear();
      var walk = async function (dh, path, depth) {
        if (depth > 30) return;
        var cnt = 0;
        for await (var e of dh.entries()) {
          var name = e[0], h = e[1];
          cnt++;
          var p = path + '/' + name;
          if (h.kind === 'directory') { if (name === '.Corbeille-Rangement') continue; H.set(p, { h: h, parent: dh }); await walk(h, p, depth + 1); }
          else {
            try {
              var f = await h.getFile();
              H.set(p, { h: h, parent: dh, file: f }); lines.push('F\t' + p + '\t' + f.size + '\t' + f.lastModified); n++; bytes += f.size;
              if (n % 200 === 0 && ui) ui({ done: n, bytes: bytes, cur: name, running: true });
            } catch (x) { }
          }
        }
        lines.push('D\t' + path + '\t' + cnt);
      };
      for (var r of ok()) {
        try { await walk(r.handle, r.path, 0); }
        catch (e) { r.ok = false; r.mode = null; M.toast('« ' + r.name + ' » : accès perdu (' + (e && e.name === 'NotFoundError' ? 'dossier introuvable' : 'autorisation retirée') + ')', { bad: true }); }
      }
      D.canWrite = ok().some(function (x) { return x.mode === 'readwrite'; });
      return lines.join('\n');
    };

    /* ---- chemins affichés : « Documents › Factures » (au lieu de « Mémoire interne ») ---- */
    var shortDir0 = window.shortDir;
    window.shortDir = function (d) {
      if (DRV !== D || D.files) return shortDir0(d);                    // eslint-disable-line no-undef
      return String(d || '').replace(/^\//, '').split('/').join(' › ') || '/';
    };

    /* ---- démarrage : liste mémorisée, réautorisation en un clic ---- */
    window.startPc = async function () {
      DRV = D;                                                          // eslint-disable-line no-undef
      await load();
      await Promise.all(F.list.map(check));
      D.canWrite = ok().some(function (r) { return r.mode === 'readwrite'; });
      if (!F.list.length) return welcome();
      if (!ok().length) return reauthGate();
      ungate(); fullScan(true);                                          // eslint-disable-line no-undef
    };
    function welcome() {
      gate('<div class="gate"><div class="big">' + icon('folder') + '</div><h2 style="margin:0 0 8px">Rangement sur ordinateur</h2>' +   // eslint-disable-line no-undef
        '<p>Ajoutez un ou plusieurs dossiers de votre PC (Images, Musique, OneDrive, sous-dossiers de Documents ou de Téléchargements, un autre disque…) : ' +
        'Rangement les analyse <b>ensemble</b> — ce qui prend de la place, les doublons d\'un dossier à l\'autre, les gros fichiers, les récents.</p>' +
        '<button class="btn main" id="pickBtn" style="padding:13px 26px;font-size:16px">' + icon('plus') + 'Ajouter un dossier</button>' +   // eslint-disable-line no-undef
        '<div class="note" style="text-align:left;max-width:560px;margin:18px auto 0">' + icon('info') + '<div>' + NOTE + '</div></div>' +   // eslint-disable-line no-undef
        '<p class="tiny" style="margin-top:16px">Rien n\'est envoyé sur Internet. Retirer un dossier de la liste ne supprime rien.</p></div>');
      document.getElementById('pickBtn').onclick = async function () {
        if (!window.showDirectoryPicker) { document.getElementById('dirIn').click(); return; }
        if (await D.pick()) { ungate(); IDX = null; CWD = null; fullScan(true); }   // eslint-disable-line no-undef
      };
    }
    function rootLine(r) {
      return '<div class="row" style="cursor:default"><div class="th" style="background-color:var(--acc2)">' + icon('folder') + '</div>' +   // eslint-disable-line no-undef
        '<div class="meta"><div class="t">' + esc(r.name) + '</div><div class="s">' + (r.ok ? 'Accès autorisé' : 'À réautoriser') + '</div></div>' +
        (r.ok ? '' : '<button class="chip" data-mpc-ask="' + r.id + '">Autoriser</button>') +
        '<button class="iconbtn" data-mpc-rm="' + r.id + '" title="Retirer de la liste (rien n\'est supprimé)" aria-label="Retirer « ' + esc(r.name) + ' » de la liste">' + icon('x') + '</button></div>';   // eslint-disable-line no-undef
    }
    function reauthGate() {
      var w = waiting();
      gate('<div class="gate"><div class="big">' + icon('folder') + '</div><h2 style="margin:0 0 8px">Vos dossiers</h2>' +   // eslint-disable-line no-undef
        '<p>Windows redemande l\'accès aux dossiers à chaque nouvelle session : un clic suffit pour ' + (w.length > 1 ? 'les ' + w.length : 'le') + ' réautoriser.</p>' +
        '<button class="btn main" id="mpcReauth" style="padding:13px 26px;font-size:16px">' + icon('check') + (w.length > 1 ? 'Réautoriser les ' + w.length + ' dossiers' : 'Réautoriser « ' + esc(w[0].name) + ' »') + '</button>' +   // eslint-disable-line no-undef
        '<div style="max-width:520px;margin:18px auto 6px;text-align:left" id="mpcList">' + F.list.map(rootLine).join('') + '</div>' +
        '<button class="btn" id="mpcAdd" style="margin-top:8px">' + icon('plus') + 'Ajouter un dossier</button>' +   // eslint-disable-line no-undef
        '<p class="tiny" style="margin-top:14px"><a href="#" id="mpcWhy">Pourquoi l\'accès est redemandé ? Comment « Toujours autoriser »</a></p></div>');
      var gv = document.getElementById('v-gate');
      document.getElementById('mpcWhy').onclick = function (e) { e.preventDefault(); M.Folders.help(); };
      document.getElementById('mpcReauth').onclick = function () { reauthAll(); };
      document.getElementById('mpcAdd').onclick = async function () { if (await D.pick()) { ungate(); IDX = null; CWD = null; fullScan(true); } };   // eslint-disable-line no-undef
      gv.onclick = async function (e) {
        var a = e.target.closest('[data-mpc-ask]'), rm = e.target.closest('[data-mpc-rm]');
        if (a) { var r = F.list.find(function (x) { return x.id === a.dataset.mpcAsk; }); if (r && await ask(r)) { ungate(); IDX = null; CWD = null; fullScan(true); } else if (r) M.toast('Accès refusé pour « ' + r.name + ' »', { bad: true }); }   // eslint-disable-line no-undef
        if (rm) removeRoot(rm.dataset.mpcRm, true);
      };
    }
    async function reauthAll() {
      var w = waiting(), res = await F.reauth(), got = res.got;          // un clic : tous les dossiers (pc/shared/folders.js)
      D.canWrite = ok().some(function (x) { return x.mode === 'readwrite'; });
      if (!got) { M.toast('Accès refusé : vous pouvez autoriser chaque dossier séparément', { bad: true }); if (curView === 'gate') reauthGate(); return; }   // eslint-disable-line no-undef
      if (got < w.length) M.toast(pl(w.length - got, 'dossier') + ' toujours à autoriser (voir l\'accueil)', { bad: true });   // eslint-disable-line no-undef
      ungate(); IDX = null; CWD = null; CLEAN = null; fullScan(true);                // eslint-disable-line no-undef
    }
    async function removeRoot(id, fromGate) {
      var r = F.list.find(function (x) { return x.id === id; }); if (!r) return;
      await F.remove(r.id);
      M.toast('« ' + r.name + ' » retiré de la liste (rien n\'a été supprimé sur le PC)');
      IDX = null; CWD = null; CLEAN = null;                              // eslint-disable-line no-undef
      if (!F.list.length) { closeSheet(); welcome(); return; }            // eslint-disable-line no-undef
      if (fromGate && !ok().length) { reauthGate(); return; }
      if (!ok().length) { closeSheet(); reauthGate(); return; }          // eslint-disable-line no-undef
      fullScan(curView === 'home' || curView === 'gate');                // eslint-disable-line no-undef
      if (!fromGate && document.getElementById('sheet').classList.contains('on')) manage();
    }
    // Feuille « Mes dossiers » : ajouter, retirer, réautoriser
    function manage() {
      SH = {                                                            // eslint-disable-line no-undef
        add: async function () { closeSheet(); if (await D.pick()) { IDX = null; CWD = null; CLEAN = null; fullScan(true); } },   // eslint-disable-line no-undef
        reauth: function () { closeSheet(); reauthAll(); }               // eslint-disable-line no-undef
      };
      F.list.forEach(function (r) { SH['rm_' + r.id] = function () { removeRoot(r.id); }; });
      var tot = function (r) { return IDX && IDX.dsize.get(r.path) ? fsz(IDX.dsize.get(r.path)) : r.ok ? '' : 'à réautoriser'; };   // eslint-disable-line no-undef
      sheet('<div class="shd"><div style="flex:1"><div class="t">Mes dossiers</div><div class="s">Analysés ensemble · retirer un dossier ne supprime rien</div></div></div><div class="sbody" id="mpcRoots">' +   // eslint-disable-line no-undef
        F.list.map(function (r) { return '<button class="mi" data-sh="rm_' + r.id + '" data-keep="1" title="Retirer de la liste">' + icon('folder') + '<span>' + esc(r.name) + '<div class="tiny">' + esc(tot(r)) + '</div></span><span class="r">Retirer ' + icon('x') + '</span></button>'; }).join('') +   // eslint-disable-line no-undef
        (waiting().length ? mi('reauth', 'check', 'Réautoriser ' + pl(waiting().length, 'dossier'), '1 clic') : '') +   // eslint-disable-line no-undef
        mi('add', 'plus', 'Ajouter un dossier', 'Images, OneDrive, D:\\…') +   // eslint-disable-line no-undef
        '<div class="note" style="margin:10px 14px 4px">' + icon('info') + '<div>' + NOTE + '</div></div></div>');   // eslint-disable-line no-undef
    }
    ACT.mpcRoots = manage;                                               // eslint-disable-line no-undef
    ACT.mpcReauth = function () { reauthAll(); };                        // eslint-disable-line no-undef

    /* ---- accueil : raccourcis des dossiers, « Ajouter », « Mes dossiers », dossiers à réautoriser ---- */
    var home0 = R.home;                                                 // eslint-disable-line no-undef
    R.home = function () {                                              // eslint-disable-line no-undef
      home0.apply(this, arguments);
      if (DRV !== D || D.files) return;                                 // eslint-disable-line no-undef
      var el = document.getElementById('v-home'), o = ok();
      el.querySelectorAll('.card .tiny').forEach(function (t) {
        if (/^Dossier « /.test(t.textContent) && o.length > 1) t.textContent = o.length + ' dossiers analysés ensemble · ' + pl(IDX ? IDX.files.length : 0, 'fichier');   // eslint-disable-line no-undef
      });
      el.querySelectorAll('[data-root]').forEach(function (row) {
        var u = row.querySelector('.th use'); if (u) u.setAttribute('href', '#i-folder');
        var s = row.querySelector('.s'), p = row.dataset.root, n = 0;
        if (IDX && s) { IDX.files.forEach(function (f) { if (f.p.indexOf(p + '/') === 0) n++; }); s.textContent = pl(n, 'fichier') + (IDX.dsize.get(p) ? ' · ' + fsz(IDX.dsize.get(p)) : '');   // eslint-disable-line no-undef
        }
      });
      var pk = el.querySelector('[data-act="pick"]');
      if (pk) {
        pk.querySelector('.t').textContent = 'Ajouter un dossier';
        pk.querySelector('.s').textContent = 'Images, OneDrive, un autre disque… analysés avec les autres';
        var u2 = pk.querySelector('.th use'); if (u2) u2.setAttribute('href', '#i-plus');
        pk.insertAdjacentHTML('afterend', '<div class="row" data-act="mpcRoots"><div class="th" style="background-color:#64748b">' + icon('gear') + '</div><div class="meta"><div class="t">Mes dossiers</div><div class="s">' + pl(F.list.length, 'dossier') + ' · ajouter, retirer, réautoriser</div></div></div>');   // eslint-disable-line no-undef
      }
      var w = waiting(), first = el.querySelector('[data-root]');
      if (w.length && first) first.insertAdjacentHTML('beforebegin', '<div class="row" data-act="mpcReauth"><div class="th" style="background-color:var(--warn)">' + icon('folder') + '</div><div class="meta"><div class="t">' + (w.length > 1 ? w.length + ' dossiers à réautoriser' : '« ' + esc(w[0].name) + ' » à réautoriser') + '</div><div class="s">' + esc(w.map(function (r) { return r.name; }).join(', ')) + ' · un clic</div></div></div>');   // eslint-disable-line no-undef
    };
    /* ---- onglet Fichiers : icônes de dossier pour les puces de racines ---- */
    var files0 = R.files;                                               // eslint-disable-line no-undef
    R.files = function () {                                             // eslint-disable-line no-undef
      files0.apply(this, arguments);
      if (DRV !== D) return;                                            // eslint-disable-line no-undef
      document.querySelectorAll('#v-files .tools [data-dir] use').forEach(function (u) { u.setAttribute('href', '#i-folder'); });
    };
    /* ---- menu ⋮ : « Ajouter un dossier », « Mes dossiers » ---- */
    document.getElementById('menuBtn').addEventListener('click', function () {
      if (DRV !== D || D.files || !window.showDirectoryPicker) return; // eslint-disable-line no-undef
      var b = document.querySelector('#sheetIn [data-sh="pick"]'); if (!b) return;
      b.querySelector('span').textContent = 'Ajouter un dossier';
      SH.mpcRoots = manage;                                             // eslint-disable-line no-undef
      b.insertAdjacentHTML('afterend', mi('mpcRoots', 'gear', 'Mes dossiers', pl(F.list.length, 'dossier')));   // eslint-disable-line no-undef
    });
    /* ---- aide ---- */
    var help0 = window.helpHTML;
    window.helpHTML = function () {
      var h = help0();
      if (DRV !== D) return h;                                          // eslint-disable-line no-undef
      return h.replace(/<h3>💻 Sur PC<\/h3><p>[\s\S]*?<\/p>/, '<h3>💻 Sur PC : plusieurs dossiers</h3><p>Accueil → « Ajouter un dossier » (ou menu ⋮) : ajoutez autant de dossiers que vous voulez (Images, Musique, OneDrive, sous-dossiers de Documents, un autre disque…). ' +
        'Ils sont <b>analysés ensemble</b> : l\'anneau, les catégories, les gros fichiers, les récents, la recherche et les <b>doublons d\'un dossier à l\'autre</b> portent sur tous. Chaque dossier a son raccourci à l\'accueil et dans l\'onglet Fichiers.</p>' +
        '<ul><li>« Mes dossiers » : retirer un dossier de la liste (rien n\'est supprimé), réautoriser.</li><li>La liste est gardée : à la session suivante, un clic sur « Réautoriser » suffit (Windows redemande l\'accès).</li>' +
        '<li>Un dossier déjà compris dans un autre n\'est pas ajouté deux fois ; un dossier qui en contient un autre de la liste le remplace.</li>' +
        '<li>Avec Edge ou Chrome, la suppression est possible (définitive sur PC : pas de corbeille).</li></ul><h3>🔑 Accès aux dossiers</h3>' + M.Folders.HELP + '<p class="tiny">' + NOTE + '</p>');
    };
  });
  M.keys({
    'mod+f': function () { var q = document.querySelector('input[type=search]'); if (!q) return false; q.focus(); q.select(); },
    'escape': function () { if (M.typing()) { document.activeElement.blur(); return; } return false; }
  });
})();
