/* =====================================================================
   Mélodie sur PC. La page a un mode « navigateur » qui COPIE chaque morceau
   dans le stockage du navigateur. Sur PC, les morceaux des dossiers choisis
   restent à leur place : seules leurs poignées File System Access sont
   gardées (IndexedDB « melodie »), et le fichier est relu à la lecture.

   Dossiers de musique (module commun pc/shared/folders.js, comme Écran et
   Rangement) :
     - liste « Mes dossiers » gardée (« melodie » › kv › pc:dossiers) :
       Musique, OneDrive, un autre disque… ; ajouter, retirer ; dossier déjà
       compris dans un autre : pas ajouté ; dossier qui en contient un autre :
       fusion ; anciens morceaux « laissés à leur place » : dossiers repris ;
     - au démarrage, la bibliothèque (titres, artistes, pochettes, durées,
       dernière écoute) s'affiche tout de suite depuis IndexedDB ; si l'accès
       est à redemander : « Vos dossiers : Musique, OneDrive » et UN bouton
       « Autoriser l'accès » (tous les dossiers d'un coup) ; la lecture d'un
       morceau le demande aussi. Un refus ne retire rien ;
     - accès autorisé : les dossiers sont relus (nouveaux morceaux ajoutés,
       morceaux déplacés retrouvés, morceaux disparus retirés).
   Les fichiers choisis un par un sont copiés comme avant.
   Raccourcis : Espace lecture/pause, Ctrl+← →  morceau, Ctrl+F chercher.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var AUDIO = /\.(mp3|m4a|flac|ogg|oga|opus|wav|aac|wma)$/i, IMG = /\.(jpe?g|png|webp)$/i;
  var TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', wma: 'audio/x-ms-wma' };
  var esc = M.esc;
  function pl(n, w, ws) { return n + ' ' + (n > 1 ? (ws || w + 's') : w); }
  var DB = M.openDb('melodie', ['kv'], 1);   // même base et même magasin que la page
  var KEY = 'pc:dossiers', IGN = 'pc:retires';

  /* ---------------- Liste des dossiers ---------------- */
  var F = M.Folders({
    mode: 'read', label: 'Mélodie',
    get: function () { return DB.get('kv', KEY); },
    put: function (l) { return DB.put('kv', l, KEY); },
    // version précédente : pas de liste, chaque morceau gardait la poignée de son dossier racine → dossiers repris
    legacy: async function () {
      var keys = await DB.keys('kv'), vals = await DB.all('kv'), roots = [];
      for (var i = 0; i < keys.length; i++) {
        var v = vals[i];
        if (!/^blob:/.test(keys[i]) || !v || !v.mpcRoot || v.mpcRoot.kind !== 'directory') continue;
        var dup = false;
        for (var j = 0; j < roots.length && !dup; j++) { try { dup = await roots[j].isSameEntry(v.mpcRoot); } catch (e) { } }
        if (!dup) roots.push(v.mpcRoot);
      }
      return roots.length ? roots.map(function (h) { return { handle: h, at: Date.now() }; }) : null;
    }
  });
  var readyOk, READY = new Promise(function (r) { readyOk = r; });   // liste chargée et autorisations vérifiées

  /* ---------------- Parcours d'un dossier ---------------- */
  async function walk(dh, path, out, depth, root) {
    if (depth > 12 || out.length > 20000) return;
    for await (var e of dh.values()) {
      if (e.kind === 'directory') { if (!/^\./.test(e.name)) await walk(e, path + '/' + e.name, out, depth + 1, root); continue; }
      if (!AUDIO.test(e.name) && !IMG.test(e.name)) continue;
      try {
        var f = await e.getFile(), ext = (e.name.match(/\.([^.]+)$/) || [])[1] || '';
        if (!f.type && TYPES[ext.toLowerCase()]) f = new File([f], f.name, { type: TYPES[ext.toLowerCase()], lastModified: f.lastModified });
        Object.defineProperty(f, 'webkitRelativePath', { value: path.slice(1) + '/' + e.name });
        f.__mpcHandle = e; f.__mpcRoot = root.handle; f.__mpcRootId = root.id;
        out.push(f);
      } catch (x) { }
    }
  }
  /* global TR, P, SH, curView, render, refreshing, LIB_READY, mi, sheet, importFiles, saveWebMeta, index, paintNow, goTab */
  // variables de la page (let/const globaux, communs à tous les scripts de la page)
  function pageTR() { return typeof TR !== 'undefined' ? TR : []; }
  function pageView() { return typeof curView !== 'undefined' ? curView : ''; }
  function relOf(t) { return (t.f || '') + '/' + t.fn; }
  async function records() {
    var keys = await DB.keys('kv'), vals = await DB.all('kv'), out = {};
    for (var i = 0; i < keys.length; i++) if (/^blob:/.test(keys[i])) out[keys[i].slice(5)] = vals[i];
    return out;
  }
  function isCopy(v) { return v instanceof Blob; }
  async function ignored() { return (await DB.get('kv', IGN).catch(function () { return null; })) || {}; }

  /* ---------------- Relire les dossiers : nouveaux morceaux, déplacés, disparus ---------------- */
  var syncP = null;
  function sync(list, opt) {
    if (syncP) return syncP.then(function () { return sync(list, opt); });
    syncP = doSync(list || F.ok(), opt || {}).catch(function (e) { M.toast('Lecture des dossiers impossible : ' + (e && e.message || e), { bad: true }); })
      .then(function (r) { syncP = null; return r; });
    return syncP;
  }
  async function doSync(list, opt) {
    list = list.filter(function (r) { return r.ok; });
    if (!list.length || typeof importFiles !== 'function') return null;   // eslint-disable-line no-undef
    while (typeof refreshing !== 'undefined' && refreshing) await new Promise(function (r) { setTimeout(r, 120); });
    if (opt.loud) M.toast('Lecture de ' + (list.length > 1 ? pl(list.length, 'dossier') : '« ' + list[0].name + ' »') + '…', { ms: 60000 });
    var found = [], walked = {};
    for (var i = 0; i < list.length; i++) {
      var r = list[i], files = [];
      try { await walk(r.handle, '/' + r.handle.name, files, 0, r); found = found.concat(files); walked[r.id] = 1; }
      catch (e) {
        if (e && e.name === 'NotFoundError') M.toast('« ' + r.name + ' » est introuvable (disque débranché, dossier déplacé ?) : ses morceaux restent dans la liste', { bad: true, ms: 6000 });
        else { r.ok = false; paintBar(); }
      }
    }
    var TRL = pageTR(), recs = await records(), ign = await ignored();
    var byRel = {}, orphans = [], mine = [];
    TRL.forEach(function (t) {
      var v = recs[t.id];
      if (isCopy(v)) return;                                         // copie (fichier choisi un par un) : jamais touchée
      var rid = v && v.mpcRootId;
      if (rid && walked[rid]) { byRel[rid + '|' + relOf(t)] = t; mine.push(t); }
      else if (!rid || !F.byId(rid)) orphans.push(t);                // ancien format, dossier fusionné, poignée perdue (import de données)
    });
    var seen = new Set(), unmatched = [];
    found.forEach(function (f) {
      if (!AUDIO.test(f.name)) return;
      var t = byRel[f.__mpcRootId + '|' + f.webkitRelativePath];
      if (t) { seen.add(t); return; }
      if ((ign[f.__mpcRootId] || []).indexOf(f.webkitRelativePath) >= 0) return;   // retiré par l'utilisateur
      unmatched.push(f);
    });
    // morceau déplacé dans un dossier, ou repris d'un ancien dossier : même nom et même taille
    var pool = {};
    mine.filter(function (t) { return !seen.has(t); }).concat(orphans).forEach(function (t) { var k = t.fn + '|' + t.size; (pool[k] = pool[k] || []).push(t); });
    var rebound = 0, fresh = [];
    for (var j = 0; j < unmatched.length; j++) {
      var f2 = unmatched[j], c = (pool[f2.name + '|' + f2.size] || []).shift();
      if (!c) { fresh.push(f2); continue; }
      c.f = f2.webkitRelativePath.split('/').slice(0, -1).join('/');
      await DB.put('kv', { mpcHandle: f2.__mpcHandle, mpcRoot: f2.__mpcRoot, mpcRootId: f2.__mpcRootId, type: f2.type || recs[c.id] && recs[c.id].type || 'audio/mpeg' }, 'blob:' + c.id);
      seen.add(c); rebound++;
    }
    // disparus des dossiers relus en entier
    var gone = mine.filter(function (t) { return !seen.has(t); });
    if (gone.length) await removeTracks(gone.map(function (t) { return String(t.id); }));
    else if (rebound) await refreshLib();
    // nouveaux morceaux (et images des mêmes dossiers, pour les pochettes) : import de la page
    var added = 0;
    if (fresh.length) {
      var dirs = {}; fresh.forEach(function (f) { dirs[f.webkitRelativePath.split('/').slice(0, -1).join('/')] = 1; });
      var imgs = found.filter(function (f) { return IMG.test(f.name) && dirs[f.webkitRelativePath.split('/').slice(0, -1).join('/')]; });
      var before = pageTR().length, view = pageView();
      await importFiles(fresh.concat(imgs));                         // eslint-disable-line no-undef
      added = pageTR().length - before;
      if (view && view !== 'titres' && /^(albums|artistes|dossiers|listes)$/.test(view) && typeof goTab === 'function') goTab(view);   // eslint-disable-line no-undef
    }
    if (opt.loud) M.toastOff();
    var msg = [added ? pl(added, 'nouveau morceau', 'nouveaux morceaux') : '', rebound ? pl(rebound, 'morceau retrouvé', 'morceaux retrouvés') : '', gone.length ? pl(gone.length, 'morceau disparu', 'morceaux disparus') + ' du PC' : ''].filter(Boolean);
    if (msg.length) M.toast('Bibliothèque à jour : ' + msg.join(', '), { ms: 5000 });
    else if (opt.loud) M.toast('Bibliothèque à jour : rien de nouveau dans ' + (list.length > 1 ? 'vos dossiers' : '« ' + list[0].name + ' »'));
    paintBar();
    return { added: added, rebound: rebound, gone: gone.length };
  }
  /* Retire des morceaux de la bibliothèque (pas du PC) */
  async function removeTracks(ids) {
    if (!ids.length) return;
    var set = new Set(ids);
    for (var i = 0; i < ids.length; i++) await DB.del('kv', 'blob:' + ids[i]).catch(function () { });
    if (typeof P !== 'undefined' && P.queue) {                       // file d'attente : le morceau en cours reste
      var cur = P.queue[P.i];
      P.queue = P.queue.filter(function (id) { return !set.has(String(id)) || String(id) === String(cur); });
      P.i = P.queue.indexOf(cur);
    }
    if (typeof TR !== 'undefined') TR = TR.filter(function (t) { return !set.has(String(t.id)); });
    await refreshLib();
  }
  async function refreshLib() {
    if (typeof saveWebMeta === 'function') await saveWebMeta();     // eslint-disable-line no-undef
    if (typeof index === 'function') index();                         // eslint-disable-line no-undef
    var v = pageView(), R = typeof render !== 'undefined' ? render : null;
    if (R && R[v] && v !== 'gate') { var m = document.getElementById('main'), y = m.scrollTop; R[v](); m.scrollTop = y; }
    if (typeof paintNow === 'function') paintNow();                   // eslint-disable-line no-undef
  }

  /* ---------------- Ajouter, retirer, autoriser ---------------- */
  async function addFolder(h) {
    await READY;
    var res = await F.add(h, 'read');
    if (res.k === 'same') {
      if (!res.root.ok) await F.ask(res.root);
      paintBar();
      M.toast('« ' + res.root.name + ' » est déjà dans vos dossiers : relecture…');
      return sync([res.root], { loud: true });
    }
    if (res.k === 'inside') {
      M.dialog({ title: 'Déjà dans vos dossiers', html: '<p>« ' + esc(h.name) + ' » se trouve dans « ' + esc(res.root.name) + ' », qui est déjà dans vos dossiers :</p><p><b>' +
        esc([res.root.name].concat(res.path).join(' › ')) + '</b></p><p class="mpc-small">Ses morceaux sont donc déjà dans la bibliothèque (onglet « Dossiers »).</p>' });
      return null;
    }
    if (res.merged.length) M.toast('« ' + h.name + ' » contient déjà ' + res.merged.map(function (r) { return '« ' + r.name + ' »'; }).join(', ') + ' : dossiers fusionnés', { ms: 6000 });
    paintBar();
    return sync([res.root], { loud: true });
  }
  function pickDir() {
    if (typeof window.showDirectoryPicker !== 'function') return false;
    F.pick({ id: 'melodie', startIn: 'music', note: 'Edge et Chrome refusent <b>C:\\</b>, les dossiers du système et, selon les versions, Documents ou Téléchargements pris en entier : choisissez <b>Musique</b>, OneDrive, un sous-dossier ou un autre disque.' })
      .then(function (h) { if (h) addFolder(h); });
    return true;
  }
  async function removeFolder(id) {
    var r = F.byId(id); if (!r) return;
    var recs = await records(), ids = [];
    for (var k in recs) {
      var v = recs[k]; if (!v || isCopy(v)) continue;
      var mineR = v.mpcRootId ? v.mpcRootId === id : false;
      if (!v.mpcRootId && v.mpcRoot) { try { mineR = await r.handle.isSameEntry(v.mpcRoot) || !!(await r.handle.resolve(v.mpcRoot)); } catch (e) { } }
      if (mineR) ids.push(k);
    }
    if (!await M.confirm('Retirer « ' + r.name + ' » ?', (ids.length ? pl(ids.length, 'morceau', 'morceaux') + ' de ce dossier quittent la bibliothèque de Mélodie. ' : '') + 'Rien n\'est supprimé sur le PC ; vos listes et favoris sont gardés.', 'Retirer')) return;
    await F.remove(id);
    var ign = await ignored(); delete ign[id]; await DB.put('kv', ign, IGN).catch(function () { });
    await removeTracks(ids);
    M.toast('« ' + r.name + ' » retiré de vos dossiers (rien n\'a été supprimé sur le PC)');
    paintBar();
  }
  /** Un clic : tous les dossiers en attente, puis relecture. La liste n'est jamais vidée. */
  async function reauth() {
    var res = await F.reauth();
    paintBar();
    if (!res.got && res.left) M.toast('Accès non autorisé : vos dossiers et la bibliothèque sont gardés. Recliquez sur « Autoriser l\'accès » quand vous voulez.', { bad: true, ms: 6000 });
    else if (res.left) M.toast(pl(res.left, 'dossier') + ' toujours à autoriser', { bad: true });
    if (res.got) sync(F.ok());
    return res;
  }

  /* ---------------- Lecture : fichier relu dans son dossier ---------------- */
  var synced = false;
  /** valeur gardée pour un morceau : Blob (copie) ou {mpcHandle} (fichier du PC, relu à la demande) */
  async function resolve(v) {
    if (!v || !v.mpcHandle) return v;
    try {
      await READY;
      var r = v.mpcRootId ? F.byId(v.mpcRootId) : null;
      if (await v.mpcHandle.queryPermission({ mode: 'read' }) !== 'granted') {
        if (F.waiting().length) {
          // une seule demande pour tous les dossiers de musique (sinon Windows demanderait pour chacun)
          await F.ensure({ text: 'Mélodie doit lire vos dossiers de musique : ' + F.names(F.waiting()).join(', ') + '.' }); paintBar();
          if (F.ok().length && !synced) { synced = true; setTimeout(function () { sync(F.ok()); }, 1500); }
        } else if (!r && v.mpcRoot) await M.fs.perm(v.mpcRoot, 'read', true, 'Mélodie');
        if (await v.mpcHandle.queryPermission({ mode: 'read' }) !== 'granted') throw Object.assign(new Error('perm'), { perm: true });
      }
      var f = await v.mpcHandle.getFile();
      return f.type ? f : new Blob([f], { type: v.type || 'audio/mpeg' });
    } catch (e) {
      M.toast(e && e.name === 'NotFoundError' ? 'Fichier déplacé ou supprimé du PC : ' + v.mpcHandle.name + ' (Actualiser pour relire vos dossiers)' : e && e.cancel ? 'Lecture annulée' :
        'Accès non autorisé à « ' + v.mpcHandle.name + ' » : cliquez sur « Autoriser l\'accès » en haut de la liste', { bad: true, ms: 5500 });
      return undefined;
    }
  }

  /* ---------------- Interface : bandeau « Vos dossiers », « Mes dossiers » ---------------- */
  var bar = null;
  function paintBar() {
    if (!bar) return;
    var w = F.waiting();
    bar.hidden = !w.length;
    if (!w.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = '<svg class="ic"><use href="#i-folder"/></svg><div class="tx">Vos dossiers : <b>' + esc(F.names(w).join(', ')) + '</b><span>Le navigateur redemande l\'accès à chaque session. La bibliothèque reste affichée ; la lecture demandera l\'accès.</span></div>' +
      '<button class="pill main" data-mpc="reauth">Autoriser l\'accès</button><a href="#" data-mpc="why">Toujours autoriser ?</a>';
  }
  function manage() {
    var w = F.waiting();
    if (typeof sheet !== 'function' || typeof mi !== 'function') return;
    var SHo = {
      add: function () { pickDir(); },
      reauth: function () { reauth(); },
      rescan: function () { if (F.waiting().length) reauth(); else sync(F.ok(), { loud: true }); },
      why: function () { M.Folders.help(); }
    };
    F.list.forEach(function (r) { SHo['rm_' + r.id] = function () { removeFolder(r.id); }; });
    SH = SHo;
    sheet('<div class="hd"><div style="min-width:0"><div class="t">Mes dossiers de musique</div><div class="s">Morceaux laissés à leur place · retirer un dossier ne supprime rien</div></div></div><div class="body">' +
      (F.list.length ? F.list.map(function (r) { return mi('rm_' + r.id, 'folder', esc(r.name), (r.ok ? '' : 'à autoriser · ') + 'Retirer ✕'); }).join('') : '<p style="padding:6px 16px;color:var(--tx3)">Aucun dossier pour l\'instant.</p>') +
      (w.length ? mi('reauth', 'check', 'Autoriser l\'accès', w.length > 1 ? w.length + ' dossiers, 1 clic' : '1 clic') : '') +
      mi('add', 'plus', 'Ajouter un dossier', 'Musique, OneDrive, D:\\…') +
      (F.list.length ? mi('rescan', 'refresh', 'Relire mes dossiers', 'nouveaux morceaux') : '') +
      mi('why', 'help', 'Accès redemandé ? « Toujours autoriser »') + '</div>');
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* global IDB */
    if (typeof IDB === 'object' && IDB && IDB.get) { var get0 = IDB.get; IDB.get = function (k) { return get0(k).then(function (v) { return /^blob:/.test(k) ? resolve(v) : v; }); }; }
    var di = document.getElementById('dirIn'); if (di) di.click = function () { if (!pickDir()) HTMLInputElement.prototype.click.call(di); };
    // bandeau « Vos dossiers » en haut de la liste
    var main = document.getElementById('main');
    if (main) {
      bar = document.createElement('div'); bar.id = 'mpcDirs'; bar.className = 'mpc-dirbar'; bar.hidden = true;
      main.insertBefore(bar, main.firstChild);
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mpc]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        if (b.dataset.mpc === 'reauth') reauth(); else if (b.dataset.mpc === 'why') M.Folders.help();
      });
    }
    // menu ⋮ : « Mes dossiers » après « Ajouter un dossier »
    var mb = document.getElementById('menuBtn');
    if (mb) mb.addEventListener('click', function () {
      if (typeof window.showDirectoryPicker !== 'function') return;
      var b = document.querySelector('#sheetIn [data-sh="dir"]'); if (!b || typeof mi !== 'function') return;
      SH.mpcDirs = manage;
      b.insertAdjacentHTML('afterend', mi('mpcDirs', 'folder', 'Mes dossiers', F.list.length ? pl(F.list.length, 'dossier') + (F.waiting().length ? ' · à autoriser' : '') : ''));
    });
    // Actualiser (⟳) : relit aussi les dossiers (pendant ce clic : l'accès peut être redemandé)
    var rb = document.getElementById('refreshBtn');
    if (rb) rb.addEventListener('click', function () { if (!F.list.length) return; if (F.waiting().length) reauth(); else sync(F.ok(), { loud: true }); });
    // onglet « Dossiers » : vos dossiers du PC en tête
    var R = typeof render !== 'undefined' ? render : null;
    if (R && R.dossiers) {
      var dos0 = R.dossiers;
      R.dossiers = function () {
        dos0.apply(this, arguments);
        if (typeof window.showDirectoryPicker !== 'function') return;
        var el = document.getElementById('v-dossiers'); if (!el) return;
        el.insertAdjacentHTML('afterbegin', '<div class="mpc-dirs-head"><div><b>Dossiers du PC</b><span>' + (F.list.length ? esc(F.names().join(', ')) : 'aucun : ajoutez Musique, OneDrive…') + '</span></div><button class="pill" data-mpc-manage="1"><svg class="ic"><use href="#i-folder"/></svg>Mes dossiers</button></div>');
        el.querySelector('[data-mpc-manage]').onclick = function (e) { e.stopPropagation(); manage(); };
      };
    }
    // aide de la page : dossiers et accès
    if (R && R.aide) {
      var aide0 = R.aide;
      R.aide = function () {
        aide0.apply(this, arguments);
        var el = document.getElementById('v-aide'); if (!el || typeof window.showDirectoryPicker !== 'function') return;
        el.insertAdjacentHTML('beforeend', '<div class="mpc-aide"><h3>💻 Vos dossiers de musique sur PC</h3><p>Menu ⋮ › « Ajouter un dossier » (Musique, OneDrive, un autre disque…) : les morceaux restent à leur place. ' +
          'Menu ⋮ › « Mes dossiers » : retirer un dossier (rien n\'est supprimé), relire les dossiers. Les nouveaux morceaux sont ajoutés à chaque ouverture et avec ⟳.</p>' + M.Folders.HELP + '</div>');
      };
    }
    // « Tout retirer » : la liste des dossiers est vidée aussi (sinon ils reviendraient à la prochaine ouverture)
    if (typeof window.clearWeb === 'function') {
      var clear0 = window.clearWeb;
      window.clearWeb = async function () { await clear0.apply(this, arguments); F.list = []; await F.save(); await DB.del('kv', IGN).catch(function () { }); paintBar(); };
    }
    // « Retirer » un morceau d'un dossier : il ne revient pas à la relecture suivante
    if (typeof window.removeWebTrack === 'function') {
      var rm0 = window.removeWebTrack;
      window.removeWebTrack = async function (id) {
        try {
          var v = await DB.get('kv', 'blob:' + id), t = pageTR().filter(function (x) { return String(x.id) === String(id); })[0];
          if (v && v.mpcRootId && t) { var ign = await ignored(); (ign[v.mpcRootId] = ign[v.mpcRootId] || []).push(relOf(t)); await DB.put('kv', ign, IGN); }
        } catch (e) { }
        return rm0.apply(this, arguments);
      };
    }
    // démarrage : liste des dossiers, accès, relecture (la bibliothèque gardée est déjà affichée par la page)
    (async function () {
      try { await F.load(); await F.checkAll(); } catch (e) { }
      readyOk();
      for (var i = 0; i < 200 && !(typeof LIB_READY !== 'undefined' && LIB_READY); i++) await new Promise(function (r) { setTimeout(r, 50); });
      paintBar();
      if (F.ok().length) { synced = !F.waiting().length; sync(F.ok()); }
    })();
  });
  M.conf.dropHint = 'Dossier de musique (gardé à sa place) ou morceaux à ajouter';
  M.onFiles(function (o) {
    var dirs = o.items.filter(function (x) { return x.dir; }), files = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && (AUDIO.test(f.name) || /^audio\//.test(f.type)); });
    if (dirs.length) { (async function () { for (var i = 0; i < dirs.length; i++) await addFolder(dirs[i].handle); })(); return; }
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
