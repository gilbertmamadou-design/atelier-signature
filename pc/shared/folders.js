/* =====================================================================
   Dossiers du PC mémorisés : commun à Rangement, Écran, Mélodie, Galerie
   et Liseuse (champ « modules » de pc-apps.json : ["folders"]).

   Une page web ne garde pas l'ACCÈS à un dossier d'une session à l'autre
   (Edge et Chrome le redemandent), mais elle peut garder le DOSSIER : sa
   poignée File System Access se range telle quelle dans IndexedDB (clonage
   structuré, jamais en JSON). Ici :
     - liste de dossiers relue au démarrage, jamais effacée parce que
       l'accès est « à redemander » ou refusé ;
     - un seul clic « Autoriser l'accès » pour tous les dossiers (requestPermission
       à la suite ; si le navigateur exige un nouveau clic, une petite fenêtre
       le demande pour les suivants) ;
     - dossier déjà compris dans un autre / qui en contient un autre ;
     - navigator.storage.persist() : le navigateur ne doit pas effacer les
       données du site (liste, bibliothèque) pour faire de la place ;
     - aide commune « Pourquoi l'accès est-il redemandé ? Toujours autoriser ».

   const F = MAGPC.Folders({ get, put, legacy, mode: 'read' | 'readwrite', label })
     get()  → Promise<[{id, handle, at}] | null>   (null = jamais enregistré)
     put(l) → Promise                              (l : [{id, handle, at}])
     legacy() → Promise<[{handle, at}] | null>     (ancien format, repris une fois)
   F.list [{id, handle, at, name (unique), path ('/'+name), ok, mode}]
   F.load() F.save() F.checkAll() F.ok() F.waiting() F.byId(id)
   F.reauth() → {asked, got, refused, left}   (à appeler pendant un clic)
   F.ensure(opt) → true si tout est autorisé (clic demandé si besoin)
   F.add(handle, mode) → {k:'added'|'same'|'inside', root, merged, path}
   F.remove(id) F.pick({id, startIn, note})
   MAGPC.Folders.help() (fenêtre d'aide) · MAGPC.Folders.HELP (texte) · MAGPC.persist()
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M || M.Folders) return;
  var esc = M.esc || function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function pl(n, w) { return n + ' ' + w + (n > 1 ? 's' : ''); }
  function uid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* Stockage « persistant » : sans fenêtre dans Edge et Chrome (accordé d'office à une appli installée ou très utilisée).
     Sans lui, le navigateur peut effacer les données du site quand le disque est presque plein. */
  var persistP = null;
  M.persist = function () {
    if (!persistP) persistP = (async function () {
      try {
        if (!navigator.storage || !navigator.storage.persist) return null;
        if (await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
      } catch (e) { return null; }
    })();
    return persistP;
  };

  async function query(h, mode) { try { return await h.queryPermission({ mode: mode }); } catch (e) { return 'prompt'; } }

  M.Folders = function (o) {
    o = o || {};
    var F = { list: [], mode: o.mode || 'read' };
    F.ok = function () { return F.list.filter(function (r) { return r.ok; }); };
    F.waiting = function () { return F.list.filter(function (r) { return !r.ok; }); };
    F.byId = function (id) { for (var i = 0; i < F.list.length; i++) if (F.list[i].id === id) return F.list[i]; return null; };
    F.names = function (l) { return (l || F.list).map(function (r) { return r.name; }); };
    /** Noms affichés uniques : « Images », « Images (2) » */
    F.labels = function () {
      var used = {};
      F.list.forEach(function (r) {
        var base = String((r.handle && r.handle.name) || 'Dossier').replace(/\//g, '_') || 'Dossier', n = base, k = 2;
        while (used[n.toLowerCase()]) n = base + ' (' + k++ + ')';
        used[n.toLowerCase()] = 1; r.name = n; r.path = '/' + n;
      });
    };
    F.save = function () {
      M.persist();
      var l = F.list.filter(function (r) { return r.handle; }).map(function (r) { return { id: r.id, handle: r.handle, at: r.at }; });
      return Promise.resolve().then(function () { return o.put && o.put(l); }).catch(function () { });
    };
    F.load = async function () {
      var l = null, migrated = false;
      try { l = o.get ? await o.get() : null; } catch (e) { }
      if (l == null && o.legacy) {
        try { var x = await o.legacy(); if (x && x.length) { l = x; migrated = true; } } catch (e) { }
      }
      F.list = (Array.isArray(l) ? l : []).filter(function (r) { return r && r.handle && r.handle.kind === 'directory'; })
        .map(function (r) { return { id: r.id || uid(), handle: r.handle, at: r.at || 0, ok: false, mode: null }; });
      F.labels();
      if (migrated) await F.save();
      if (F.list.length) M.persist();
      return F.list;
    };
    /** Accès déjà accordé ? (sans rien demander) */
    F.check = async function (r) {
      if (F.mode === 'readwrite' && await query(r.handle, 'readwrite') === 'granted') { r.ok = true; r.mode = 'readwrite'; return true; }
      if (await query(r.handle, 'read') === 'granted') { r.ok = true; r.mode = 'read'; return true; }
      r.ok = false; r.mode = null; return false;
    };
    F.checkAll = function () { return Promise.all(F.list.map(F.check)); };
    // → 'granted' | 'denied' | 'prompt' (fenêtre fermée) | 'gesture' (le navigateur veut un nouveau clic) | 'error'
    async function request(r) {
      try {
        var s = await r.handle.requestPermission({ mode: F.mode });
        if (s === 'granted') { r.ok = true; r.mode = F.mode; return s; }
        if (F.mode === 'readwrite' && await query(r.handle, 'read') === 'granted') { r.ok = true; r.mode = 'read'; return 'granted'; }
        return s;
      } catch (e) {
        r.err = e;
        return e && (e.name === 'SecurityError' || e.name === 'NotAllowedError' && /activation|gesture/i.test(e.message || '')) ? 'gesture' : 'error';
      }
    }
    F.ask = async function (r) { return (await request(r)) === 'granted'; };
    /** Réautorise tous les dossiers en attente, à la suite. À appeler PENDANT un clic.
        Rien n'est jamais retiré de la liste : un refus laisse les dossiers « à autoriser ». */
    F.reauth = async function (again) {
      var w = F.waiting(), got = 0, refused = false, rest = [];
      for (var i = 0; i < w.length; i++) {
        var r = w[i];
        // Chrome / Edge récents : la fenêtre « Restaurer l'accès » rend tous les dossiers d'un coup
        if (await F.check(r)) { got++; continue; }
        if (refused) continue;
        var s = await request(r);
        if (s === 'granted') got++;
        else if (s === 'gesture') rest.push(r);
        else if (s !== 'error') refused = true;   // refus ou fenêtre fermée : on ne redemande pas pour les suivants
      }
      if (!refused && rest.length && !again) {
        // le clic d'origine a expiré pendant la première demande : un clic de plus pour les suivants
        try {
          var more = await M.withGesture(function () { return F.reauth(true); }, { force: true, title: 'Encore ' + pl(rest.length, 'dossier'),
            text: (o.label || 'L\'appli') + ' doit encore lire : ' + F.names(rest).join(', ') + '.', label: 'Autoriser' });
          got += more.got; refused = more.refused;
        } catch (e) { }
      }
      return { asked: w.length, got: got, refused: refused, left: F.waiting().length };
    };
    /** Tous les dossiers autorisés ? Sinon les demande (directement pendant un clic, sinon par une petite fenêtre). */
    var ens = null;
    F.ensure = function (opt) {           // une seule demande à la fois (deux lectures simultanées : une seule fenêtre)
      if (!ens) ens = ensure(opt).then(function (v) { ens = null; return v; }, function (e) { ens = null; throw e; });
      return ens;
    };
    async function ensure(opt) {
      opt = opt || {};
      if (!F.waiting().length) return true;
      await F.checkAll();
      if (!F.waiting().length) return true;
      var ua = navigator.userActivation;
      if (!ua || ua.isActive) { await F.reauth(); return !F.waiting().length; }
      if (opt.ask === false) return false;
      try {
        await M.withGesture(function () { return F.reauth(); }, { force: true, title: opt.title || 'Autoriser l\'accès',
          text: opt.text || ((o.label || 'L\'appli') + ' doit lire vos dossiers : ' + F.names(F.waiting()).join(', ') + '. Le navigateur redemande votre accord à chaque nouvelle session.'),
          label: 'Autoriser l\'accès' });
      } catch (e) { }
      return !F.waiting().length;
    }
    async function relation(a, b) {
      try { if (await a.isSameEntry(b)) return { k: 'same' }; } catch (e) { }
      try { var p = await a.resolve(b); if (p) return { k: 'inside', path: p }; } catch (e) { }
      try { var q = await b.resolve(a); if (q) return { k: 'contains', path: q }; } catch (e) { }
      return null;
    }
    F.relation = relation;
    /** Ajoute un dossier. 'same' : déjà là ; 'inside' : compris dans root (path : chemin depuis root) ;
        'added' : ajouté (merged : dossiers de la liste qu'il contient, retirés de la liste, fusionnés). */
    F.add = async function (h, mode) {
      var merged = [];
      for (var i = 0; i < F.list.length; i++) {
        var r = F.list[i], rel = await relation(r.handle, h);
        if (!rel) continue;
        if (rel.k === 'same') return { k: 'same', root: r };
        if (rel.k === 'inside') return { k: 'inside', root: r, path: rel.path };
        if (rel.k === 'contains') merged.push(r);
      }
      F.list = F.list.filter(function (r) { return merged.indexOf(r) < 0; });
      var root = { id: uid(), handle: h, at: Date.now(), ok: true, mode: mode || F.mode };
      F.list.push(root);
      F.labels(); await F.save();
      return { k: 'added', root: root, merged: merged };
    };
    F.remove = async function (id) {
      var r = F.byId(id); if (!r) return null;
      F.list = F.list.filter(function (x) { return x !== r; });
      F.labels(); await F.save();
      return r;
    };
    /** Sélecteur de dossier → poignée (null si annulé ; dossier refusé : explication) */
    F.pick = async function (opt) {
      opt = opt || {};
      if (typeof window.showDirectoryPicker !== 'function') return null;
      try { return await window.showDirectoryPicker({ mode: F.mode, id: opt.id, startIn: opt.startIn }); }
      catch (e) {
        if (e && e.name === 'AbortError') return null;
        M.dialog({ title: 'Dossier refusé', html: '<p>' + esc(e && e.message || e) + '</p>' + (opt.note ? '<p class="mpc-small">' + opt.note + '</p>' : '') });
        return null;
      }
    };
    return F;
  };

  /* Bandeau flottant commun (Galerie, Liseuse : pages Android sans place prévue) :
     « Vos dossiers : Photos — Autoriser l'accès · Toujours autoriser ? ». bar.update() l'affiche s'il reste des dossiers à autoriser. */
  M.Folders.bar = function (F, opt) {
    opt = opt || {};
    var el = null;
    function make() {
      if (el) return el;
      if (!document.getElementById('mpc-fbar-css')) {
        var css = document.createElement('style'); css.id = 'mpc-fbar-css';
        css.textContent = '.mpc-fbar{position:fixed;left:50%;transform:translateX(-50%);top:calc(10px + env(safe-area-inset-top,0px));z-index:2147483000;display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;' +
          'width:min(680px,calc(100vw - 24px));box-sizing:border-box;padding:10px 12px 10px 14px;border-radius:14px;background:#1f2430;color:#f3f4f7;box-shadow:0 8px 30px #0006;font:14px/1.35 system-ui,"Segoe UI",sans-serif}' +
          '.mpc-fbar[hidden]{display:none}.mpc-fbar .tx{flex:1 1 220px;min-width:0}.mpc-fbar .tx span{display:block;font-size:12.5px;color:#aab0bd}' +
          '.mpc-fbar button{font:inherit;border:0;border-radius:10px;padding:8px 13px;cursor:pointer;font-weight:600}.mpc-fbar .go{background:#4f8cff;color:#fff}' +
          '.mpc-fbar .why{background:none;color:#9ec1ff;padding:6px 4px;text-decoration:underline}.mpc-fbar .x{background:none;color:#aab0bd;padding:6px 8px}';
        document.head.appendChild(css);
      }
      el = document.createElement('div'); el.className = 'mpc-fbar'; el.setAttribute('role', 'status'); el.hidden = true;
      el.addEventListener('click', async function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.classList.contains('why')) { M.Folders.help(); return; }
        if (b.classList.contains('x')) { el.hidden = true; return; }
        var res = await F.reauth();
        update();
        if (res.got && opt.onGranted) opt.onGranted(res);
        else if (!res.got) M.toast('Accès non autorisé : vos dossiers restent dans la liste. Recliquez quand vous voulez.', { bad: true, ms: 5500 });
      });
      document.body.appendChild(el);
      return el;
    }
    function update() {
      var w = F.waiting();
      if (!w.length) { if (el) el.hidden = true; return; }
      make();
      el.innerHTML = '<div class="tx">' + (w.length > 1 ? 'Vos dossiers : ' : 'Votre dossier : ') + '<b>' + esc(F.names(w).join(', ')) + '</b><span>' + esc(opt.sub || 'Le navigateur redemande l\'accès à chaque session ; rien n\'a été oublié.') + '</span></div>' +
        '<button type="button" class="go">Autoriser l\'accès</button><button type="button" class="why">Toujours autoriser ?</button><button type="button" class="x" aria-label="Masquer">✕</button>';
      el.hidden = false;
    }
    return { update: update, hide: function () { if (el) el.hidden = true; } };
  };

  /* Aide commune : pourquoi l'accès est redemandé, comment ne plus avoir à cliquer */
  M.Folders.HELP =
    '<p><b>La liste de vos dossiers est gardée</b> sur ce PC. Ce qui est redemandé, c\'est l\'<b>accès</b> : par sécurité, Edge et Chrome ' +
    'ne laissent une page web lire vos dossiers que pour la session en cours. Un clic sur <b>« Autoriser l\'accès »</b> suffit, pour tous les dossiers d\'un coup ; ' +
    'en attendant, la bibliothèque déjà connue reste affichée.</p>' +
    '<p><b>Ne plus avoir à cliquer</b> (Chrome 122 ou plus récent ; Edge selon sa version) :</p><ul>' +
    '<li><b>Installez l\'appli</b> (bouton « Installer » de la barre d\'adresse, ou lanceur Suite MAG › Installer) et ouvrez-la depuis le menu Démarrer : ' +
    'une appli installée <b>garde l\'accès</b> une fois qu\'il a été accordé.</li>' +
    '<li>Dans un onglet : quand le navigateur demande l\'accès, choisissez <b>« Autoriser à chaque visite »</b> (au lieu de « Autoriser cette fois ») si cette option est proposée.</li>' +
    '<li>Ne cliquez pas trois fois de suite sur « Ne pas autoriser » : le navigateur cesse alors de proposer « Autoriser à chaque visite ».</li></ul>' +
    '<p><b>Retirer l\'accès</b> : icône à gauche de l\'adresse › Autorisations du site (ou Paramètres › Cookies et autorisations de site).</p>' +
    '<p><b>Si la liste elle-même disparaît</b> : Edge ou un logiciel de nettoyage efface les « cookies et données de site ». Dans Edge : Paramètres › ' +
    'Confidentialité › « Choisir les éléments à effacer à chaque fermeture du navigateur » › « Cookies et autres données de site » : ajoutez ' +
    '<b>gilbertmamadou-design.github.io</b> à « Ne pas effacer ».</p>';
  M.Folders.help = function () {
    return M.persist().then(function (p) {
      return M.dialog({ title: 'Accès à vos dossiers', wide: true, html: M.Folders.HELP +
        '<p class="mpc-small">' + (p === true ? 'Données de la Suite protégées : le navigateur ne les efface pas pour faire de la place.' :
          'Le navigateur n\'a pas (encore) protégé les données de la Suite : il pourrait les effacer si le disque est presque plein. Installer l\'appli aide.') + '</p>' });
    });
  };
})();
