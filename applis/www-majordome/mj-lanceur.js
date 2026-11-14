/* =====================================================================
   Majordome › Lanceur : Majordome peut servir d'écran d'accueil du téléphone (bouton ⌂).
   - Android : l'activité déclare la catégorie HOME (print-patch.sh) ; on la choisit dans
     Paramètres › Applis par défaut › Écran d'accueil (bouton dans les réglages).
   - En écran d'accueil (ou si l'option « toujours » est choisie) : dock de favoris en bas,
     bouton « Applis » et glissé vers le haut pour le tiroir de toutes les applis (recherche).
     Appui long sur une appli : favori, infos, désinstaller.
   - Bouton retour : ferme le panneau ou le tiroir, ne quitte jamais l'accueil (MainActivity → mjBack).
     Bouton ⌂ pendant qu'on est dans Majordome : retour à l'écran principal (→ mjHome).
   - Liste et icônes : MAGPrint.homeApps / homeIcon (LauncherService.java, commun à la Suite).
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, P = X.P, S = X.S, esc = X.esc, J = X.J;
  if (!X.ANDROID || !P || !P.homeApps) return;
  var $ = function (id) { return document.getElementById(id); };
  if (!Array.isArray(S.dock)) S.dock = [];
  if (!S.launcher) S.launcher = 'auto';          // auto (seulement en écran d'accueil) | on | off
  var save = X.saveS;

  function isHome() { try { return !!(J(P.homePerms(), {}) || {}).home; } catch (e) { return false; } }
  /* Accueil complet : Majordome est la page principale de l'interface Socle (socle.html), dans un cadre */
  var INT = !!window.MJ_DANS_ACCUEIL, PI = null;
  try { PI = INT ? window.parent.mjInt : null; } catch (e) { }
  function active() { return !INT && (S.launcher === 'on' || (S.launcher === 'auto' && isHome())); }
  function hasFull() { return !!P.homeMjInt; }

  /* ---------- Applis ---------- */
  var apps = [], raw0 = null, icons = {};
  function load() {
    var raw = ''; try { raw = P.homeApps(); } catch (e) { }
    if (raw === raw0) return apps;
    raw0 = raw;
    apps = (J(raw, []) || []).filter(function (a) { return a && a.pkg && a.label; })
      .map(function (a) { return { pkg: String(a.pkg), cls: String(a.cls || ''), label: String(a.label), upd: +a.upd || 0 }; })
      .sort(function (a, b) { return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }); });
    // favoris dont l'appli a disparu
    var n = S.dock.length; S.dock = S.dock.filter(function (d) { return apps.some(function (a) { return a.pkg === d.pkg; }); }); if (n !== S.dock.length) save();
    return apps;
  }
  function key(a) { return a.pkg + '/' + a.cls; }
  function icon(a) {
    var k = key(a); if (icons[k]) return icons[k];
    try { icons[k] = P.homeIcon(a.pkg, a.cls, 128, a.upd || 0) || ''; } catch (e) { icons[k] = ''; }
    return icons[k];
  }
  function find(d) { return apps.filter(function (a) { return a.pkg === d.pkg && (!d.cls || a.cls === d.cls); })[0] || apps.filter(function (a) { return a.pkg === d.pkg; })[0]; }
  function launch(a) { closeDrawer(); try { P.homeLaunch(a.pkg, a.cls); } catch (e) { X.toast && X.toast('Impossible d\'ouvrir ' + a.label); } }
  function isFav(a) { return S.dock.some(function (d) { return d.pkg === a.pkg && d.cls === a.cls; }); }

  /* ---------- Dock ---------- */
  function paintDock() {
    var box = $('dock'); if (!box) return;
    if (!active()) { box.hidden = true; return; }
    load();
    var h = S.dock.map(function (d) { var a = find(d); if (!a) return ''; var ic = icon(a); return '<button data-k="' + esc(key(a)) + '" aria-label="' + esc(a.label) + '">' + (ic ? '<img alt="" src="' + ic + '">' : '<i></i>') + '</button>'; }).join('');
    h += '<button id="dockAll" aria-label="Toutes les applis"><svg class="ic" viewBox="0 0 24 24"><path d="M5 5h3v3H5zM10.5 5h3v3h-3zM16 5h3v3h-3zM5 10.5h3v3H5zM10.5 10.5h3v3h-3zM16 10.5h3v3h-3zM5 16h3v3H5zM10.5 16h3v3h-3zM16 16h3v3h-3z"/></svg>Applis</button>';
    box.innerHTML = h; box.hidden = false;
  }
  $('dock').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.id === 'dockAll') return openDrawer();
    var a = apps.filter(function (x) { return key(x) === b.dataset.k; })[0]; if (a) launch(a);
  });
  pressHold($('dock'), function (b) { var a = apps.filter(function (x) { return key(x) === b.dataset.k; })[0]; if (a) menu(a); });

  /* ---------- Tiroir ---------- */
  var io = null;
  function openDrawer() {
    load(); X.closeSheet && X.closeSheet();
    $('drawer').hidden = false; $('dq').value = ''; $('dm').hidden = true; paintGrid('');
    if (!history.state || !history.state.mjDrawer) try { history.pushState({ mjDrawer: 1 }, ''); } catch (e) { }
  }
  function closeDrawer(fromPop) {
    if ($('drawer').hidden) return false;
    $('drawer').hidden = true; $('dm').hidden = true; $('dq').blur();
    if (!fromPop && history.state && history.state.mjDrawer) try { history.back(); } catch (e) { }
    return true;
  }
  window.addEventListener('popstate', function () { if (!$('drawer').hidden) closeDrawer(true); });
  function norm(s) { return X.deacc ? X.deacc(s) : String(s).toLowerCase(); }
  function paintGrid(q) {
    var n = norm(q.trim()), l = !n ? apps : apps.filter(function (a) { return norm(a.label).indexOf(n) >= 0; });
    $('dg').innerHTML = l.length ? l.map(function (a) {
      var k = key(a), ic = icons[k];
      return '<button class="ap' + (isFav(a) ? ' fav' : '') + '" data-k="' + esc(k) + '">' + (ic ? '<img alt="" src="' + ic + '">' : '<i data-ic="' + esc(k) + '"></i>') + '<span>' + esc(a.label) + '</span></button>';
    }).join('') : '<p class="note" style="grid-column:1/-1;text-align:center">Aucune appli « ' + esc(q) + ' ».</p>';
    // icônes chargées au fil du défilement (sinon l'ouverture serait lente)
    if (io) io.disconnect();
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (!en.isIntersecting) return; var el = en.target; io.unobserve(el);
          var a = apps.filter(function (x) { return key(x) === el.dataset.ic; })[0]; if (!a) return;
          var src = icon(a); if (src) { var im = document.createElement('img'); im.alt = ''; im.src = src; el.replaceWith(im); }
        });
      }, { root: $('dg'), rootMargin: '200px' });
      $('dg').querySelectorAll('[data-ic]').forEach(function (el) { io.observe(el); });
    }
  }
  $('dq').addEventListener('input', function () { paintGrid(this.value); });
  $('dq').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var f = $('dg').querySelector('.ap'); if (f) f.click(); } });
  $('dX').onclick = function () { closeDrawer(); };
  $('dg').addEventListener('click', function (e) {
    var b = e.target.closest('.ap'); if (!b || b.dataset.held) { if (b) delete b.dataset.held; return; }
    var a = apps.filter(function (x) { return key(x) === b.dataset.k; })[0]; if (a) launch(a);
  });
  pressHold($('dg'), function (b) { var a = apps.filter(function (x) { return key(x) === b.dataset.k; })[0]; if (a) menu(a); }, '.ap');

  /* ---------- Menu d'une appli (appui long) ---------- */
  function menu(a) {
    var fav = isFav(a), full = S.dock.length >= 5;
    var m = $('dm');
    m.innerHTML = '<b>' + esc(a.label) + '</b>' +
      '<button class="btn" data-m="fav">' + (fav ? 'Retirer du dock' : full ? 'Dock plein (5) : retirez d\'abord un favori' : 'Ajouter au dock') + '</button>' +
      '<button class="btn" data-m="info">Infos de l\'appli</button>' +
      '<button class="btn bad" data-m="del">Désinstaller</button>' +
      '<button class="btn" data-m="x">Fermer</button>';
    if (!fav && full) m.querySelector('[data-m="fav"]').disabled = true;
    if ($('drawer').hidden) { $('drawer').hidden = false; $('dg').innerHTML = ''; $('drawer').dataset.only = '1'; }
    m.hidden = false;
    m.onclick = function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return; var k = b.dataset.m;
      if (k === 'fav') { if (fav) S.dock = S.dock.filter(function (d) { return !(d.pkg === a.pkg && d.cls === a.cls); }); else S.dock.push({ pkg: a.pkg, cls: a.cls, label: a.label }); save(); paintDock(); }
      if (k === 'info') try { P.homeOpen('appinfo', a.pkg); } catch (er) { }
      if (k === 'del') try { P.homeOpen('uninstall', a.pkg); } catch (er) { }
      m.hidden = true;
      if ($('drawer').dataset.only) { delete $('drawer').dataset.only; $('drawer').hidden = true; }
      else paintGrid($('dq').value);
    };
  }
  function pressHold(box, fn, sel) {
    var t = null, sx = 0, sy = 0, tgt = null;
    box.addEventListener('pointerdown', function (e) {
      tgt = e.target.closest(sel || 'button[data-k]'); if (!tgt) return; sx = e.clientX; sy = e.clientY;
      clearTimeout(t); t = setTimeout(function () { if (tgt) { tgt.dataset.held = '1'; try { navigator.vibrate && navigator.vibrate(15); } catch (er) { } fn(tgt); } }, 520);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { box.addEventListener(ev, function () { clearTimeout(t); }); });
    box.addEventListener('pointermove', function (e) { if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 12) clearTimeout(t); });
    box.addEventListener('contextmenu', function (e) { if (e.target.closest(sel || 'button[data-k]')) e.preventDefault(); });
    box.addEventListener('click', function (e) { var b = e.target.closest(sel || 'button[data-k]'); if (b && b.dataset.held) { delete b.dataset.held; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  /* ---------- Glisser vers le haut sur la sphère : tiroir ---------- */
  (function () {
    var st = $('stage'), y0 = null, x0 = 0;
    if (!st) return;
    st.addEventListener('touchstart', function (e) { if (!(active() || PI) || e.touches.length !== 1) { y0 = null; return; } y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; }, { passive: true });
    st.addEventListener('touchend', function (e) {
      if (y0 == null) return; var t = e.changedTouches[0], dy = y0 - t.clientY, dx = Math.abs(t.clientX - x0); y0 = null;
      if (dy > 90 && dx < 60) { if (PI) PI.drawer(); else openDrawer(); }
    }, { passive: true });
  })();

  /* ---------- Accueil complet : glisser vers la gauche pour les pages de l'accueil, marges du système ---------- */
  if (PI) {
    (function () {
      var x0 = 0, y0 = 0, mode = 0;   // 0 : rien, 1 : glissé de page, 2 : défilement normal
      function blocked(t) { return !!(t.closest && t.closest('input,textarea,select,[contenteditable],#sheet,.sheet,#drawer,#dm')) || !!(X.curSheet && X.curSheet()); }
      document.addEventListener('touchstart', function (e) { if (e.touches.length !== 1 || blocked(e.target)) { mode = 2; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; mode = 0; }, { passive: true });
      document.addEventListener('touchmove', function (e) {
        if (mode === 2) return; var t = e.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
        if (mode === 0) { if (Math.abs(dx) > 14 && Math.abs(dx) > 1.6 * Math.abs(dy) && dx < 0) { mode = 1; x0 = t.clientX; PI.drag('start', 0); } else if (Math.abs(dy) > 14) mode = 2; return; }
        PI.drag('move', t.clientX - x0);
      }, { passive: true });
      function end(e) { if (mode === 1) { var t = e.changedTouches[0]; PI.drag('end', t.clientX - x0); } mode = 0; }
      document.addEventListener('touchend', end, { passive: true });
      document.addEventListener('touchcancel', end, { passive: true });
    })();
    MJ.onAssist = function () { try { PI.show(); } catch (e) { } };
    var ins = function () {
      try {
        var cs = window.parent.getComputedStyle(window.parent.document.documentElement), t = parseFloat(cs.getPropertyValue('--st')) || 0, b = parseFloat(cs.getPropertyValue('--nb')) || 0;
        document.documentElement.style.setProperty('--safe-t', Math.max(t, 6) + 'px'); document.documentElement.style.setProperty('--safe-b', (b + 16) + 'px');
      } catch (e) { }
    };
    ins(); setTimeout(ins, 1500); window.addEventListener('resize', ins);
  }

  /* ---------- Boutons système (MainActivity) ---------- */
  window.mjBack = function () {
    if (!$('dm').hidden) { $('dm').hidden = true; if ($('drawer').dataset.only) { delete $('drawer').dataset.only; $('drawer').hidden = true; } return; }
    if (closeDrawer()) return;
    if (X.curSheet && X.curSheet()) { X.closeSheet(); return true; }
    var c = document.getElementById('cards'); if (c && c.scrollTop) c.scrollTop = 0;
    return false;
  };
  window.mjHome = function () {
    $('dm').hidden = true; closeDrawer();
    if (X.curSheet && X.curSheet()) X.closeSheet();
    paintDock();
  };

  /* ---------- Réglages ---------- */
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () {
    var home = isHome();
    if (INT) return (prevExtra ? prevExtra() : '') +
      '<div class="sect" id="f-lanceur">Accueil complet</div>' +
      '<div class="set"><div class="t">Pages, tuiles et panneaux<small>Glissez vers la gauche depuis cette page ; les réglages de l\'accueil sont aussi dans la barre en bas des autres pages</small></div><button class="btn sm" id="sLnSet">Réglages</button></div>' +
      '<div class="set"><div class="t">Écran d\'accueil du téléphone<small>' + (home ? 'Actif : le bouton ⌂ ramène ici.' : 'Pas encore : choisissez « Majordome » dans la liste.') + '</small></div><button class="btn sm" id="sLnHome">' + (home ? 'Changer' : 'Choisir') + '</button></div>' +
      '<div class="set"><div class="t">Revenir à l\'accueil simple<small>Sphère, dock et tiroir d\'applis seulement</small></div><button class="btn sm" id="sLnSimple">Accueil simple</button></div>';
    return (prevExtra ? prevExtra() : '') +
      '<div class="sect" id="f-lanceur">Lanceur : ' + esc(S.name) + ' comme écran d\'accueil</div>' +
      '<div class="set"><div class="t">Écran d\'accueil du téléphone<small>' + (home ? 'Actif : le bouton ⌂ ramène ici.' : 'Pas encore : choisissez « Majordome » dans la liste. Vous pourrez revenir à Socle de la même façon.') + '</small></div><button class="btn sm" id="sLnHome">' + (home ? 'Changer' : 'Choisir') + '</button></div>' +
      '<div class="set"><div class="t">Dock et tiroir d\'applis<small>Favoris en bas, bouton « Applis », glisser vers le haut sur la sphère</small></div><select class="in" id="sLnMode" style="width:auto">' +
      [['auto', 'Seulement en écran d\'accueil'], ['on', 'Toujours'], ['off', 'Jamais']].map(function (o) { return '<option value="' + o[0] + '"' + (S.launcher === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<p class="note">Favoris du dock (5 au plus) : appui long sur une appli dans le tiroir › « Ajouter au dock ». Bouton retour : ferme le tiroir ou le panneau, sans quitter l\'accueil.</p>' +
      (hasFull() ? '<div class="set"><div class="t">Accueil complet, comme Socle<small>' + esc(S.name) + ' en page principale, et à côté les pages de tuiles, panneaux, raccourcis et widgets de Socle (disposition de Socle reprise s\'il est à jour)</small></div><button class="btn sm pri" id="sLnFull">Activer</button></div>' : '');
  };
  MJ.settingsBind = function (b) {
    if (prevBind) prevBind(b);
    var h = document.getElementById('sLnHome'); if (h) h.onclick = function () { try { P.homeOpen('home', ''); } catch (e) { } };
    var m = document.getElementById('sLnMode'); if (m) m.onchange = function () { S.launcher = this.value; save(); paintDock(); };
    var f = document.getElementById('sLnFull'); if (f) f.onclick = function () {
      if (!confirm('Passer à l\'accueil complet ? ' + S.name + ' reste la page principale ; glissez vers la gauche pour les pages de tuiles. L\'écran se recharge.')) return;
      try { P.homeMjInt(true); } catch (e) { }
    };
    var sm = document.getElementById('sLnSimple'); if (sm) sm.onclick = function () { if (confirm('Revenir à l\'accueil simple ? L\'écran se recharge.')) try { P.homeMjInt(false); } catch (e) { } };
    var se = document.getElementById('sLnSet'); if (se) se.onclick = function () { X.closeSheet(); try { PI.settings(); } catch (e) { } };
  };

  /* ---------- Mise à jour ---------- */
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { raw0 = null; paintDock(); } });
  setTimeout(paintDock, 600);
})();
