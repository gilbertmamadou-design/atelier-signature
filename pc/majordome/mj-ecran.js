/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-ecran.js : ne pas modifier ici. */
/* =====================================================================
   Majordome › Réglages › Écran : ce qu'on voit sur l'écran, le même programme sur le téléphone, la tablette et le PC.
   - Informations à afficher (cases sous la sphère, S.infos) : Heure, Météo, Rendez-vous, Minuteur, Lumières (mj-app.js)
     et, ajoutées ici, Batterie, Messages, Listes, Lune et soleil. Chaque case se coche ou se décoche.
   - Commandes rapides (S.cmds) : une rangée de boutons sous les cases ; un appui = la phrase envoyée à Majordome.
   - Fond (S.fond) : grille HUD, étoiles (petit champ d'étoiles fixe, comme le Fond Jarvis) ou uni.
   Le visuel et les effets autour de la sphère (niveau, anneaux, planètes, constellations…) : mj-fx.js, même rubrique.
   Les cases s'adaptent à la largeur : 2 colonnes sur le téléphone, jusqu'à 4 sur la tablette et le PC.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, S = X.S, esc = X.esc, save = X.saveS;
  var $ = function (id) { return document.getElementById(id); };

  // cases : clé, nom ; défaut : celles d'avant (heure, météo, rendez-vous, minuteur, lumières) ; les nouvelles à cocher
  var INFOS = [['time', 'Heure et date'], ['wx', 'Météo et vent'], ['ev', 'Prochain rendez-vous'], ['al', 'Minuteur ou prochain réveil'], ['hue', 'Lumières'],
    ['bat', 'Batterie'], ['msg', 'Messages et mails'], ['notes', 'Notes'], ['list', 'Listes (courses…)'], ['ciel', 'Lune et soleil']];
  S.infos = Object.assign({ time: true, wx: true, ev: true, al: true, hue: true, bat: false, msg: false, notes: false, list: false, ciel: false }, S.infos || {});
  if (!Array.isArray(S.cmds)) S.cmds = [];
  if (!S.fond) S.fond = 'grille';

  var st = document.createElement('style');
  st.textContent =
    '#moment{grid-template-columns:repeat(auto-fit,minmax(min(150px,46%),1fr))}' +
    '@media (min-width:700px){#moment{max-width:760px}}' +
    '#cmdq{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;width:100%;max-width:760px;margin:8px auto 0;position:relative;z-index:1}' +
    '#cmdq:empty{display:none}' +
    '#cmdq button{border:1px solid var(--line2);background:#0d1626e6;border-radius:18px;padding:8px 13px;font-size:13.5px;color:var(--tx);min-height:38px}' +
    '#cmdq button:hover{border-color:var(--acc)}#cmdq button:active{background:var(--bg4)}' +
    'html[data-fond="uni"] #bgfx{background:radial-gradient(ellipse at 50% 38%,#10283344 0,transparent 60%)}' +
    'html[data-fond="etoiles"] #bgfx{background:radial-gradient(ellipse at 50% 38%,#12324055 0,transparent 62%),var(--etoiles) 0 0/420px 420px,var(--etoiles2) 0 0/260px 260px}' +
    '.ecr-inf{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2px 12px;margin:2px 0 8px}' +
    '.ecr-inf label{display:flex;align-items:center;gap:9px;min-height:40px;cursor:pointer}' +
    '.ecr-inf input{width:20px;height:20px;accent-color:var(--acc)}';
  document.head.appendChild(st);

  /* ---------------- fond ---------------- */
  // petit champ d'étoiles en image (aucun calcul à chaque image)
  function etoiles(n, w, seed) {
    var s = seed, r = function () { s = (s * 16807) % 2147483647; return s / 2147483647; }, c = '';
    for (var i = 0; i < n; i++) c += '<circle cx="' + (r() * w).toFixed(1) + '" cy="' + (r() * w).toFixed(1) + '" r="' + (r() < .15 ? 1.1 : .55) + '" fill="#cfeff0" fill-opacity="' + (.25 + r() * .55).toFixed(2) + '"/>';
    return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + w + '">' + c + '</svg>') + '")';
  }
  document.documentElement.style.setProperty('--etoiles', etoiles(70, 420, 7));
  document.documentElement.style.setProperty('--etoiles2', etoiles(30, 260, 101));
  function fond() { document.documentElement.dataset.fond = S.fond || 'grille'; }
  fond();

  /* ---------------- cases en plus ---------------- */
  var batPc = null;
  if (!(window.MAGPrint && window.MAGPrint.homeBattery) && navigator.getBattery) navigator.getBattery().then(function (b) {
    function up() { batPc = (b.charging && b.level === 1 && b.chargingTime === 0) ? null : { level: Math.round(b.level * 100), plugged: b.charging }; }
    ['levelchange', 'chargingchange'].forEach(function (e) { b.addEventListener(e, function () { up(); if (MJ.moment) MJ.moment(); }); }); up();
  }).catch(function () { });
  function batterie() {
    var P = window.MAGPrint;
    if (P && P.homeBattery) { var o = X.J(P.homeBattery(), {}) || {}; if (o.level >= 0) return { level: o.level, plugged: !!o.plugged }; }
    return batPc;
  }
  var LUNE = ['Nouvelle lune', 'Premier croissant', 'Premier quartier', 'Lune gibbeuse croissante', 'Pleine lune', 'Lune gibbeuse décroissante', 'Dernier quartier', 'Dernier croissant'];
  function lune(t) {
    var cyc = 29.530588853, age = ((t / 86400000 - 10962.7597) % cyc + cyc) % cyc;   // nouvelle lune de référence : 6 janvier 2000, 18 h 14 UTC
    var i = Math.floor((age / cyc) * 8 + 0.5) % 8, ecl = Math.round((1 - Math.cos(age / cyc * 2 * Math.PI)) / 2 * 100);
    return { nom: LUNE[i], ecl: ecl };
  }
  function hm(iso) { var m = /T(\d\d):(\d\d)/.exec(iso || ''); return m ? (+m[1]) + ' h ' + m[2] : ''; }
  function soleil() {
    var wc = X.lsGet(X.KEY.wx, null), d = wc && wc.d && wc.d.daily;
    if (!d || !d.sunrise || !d.sunrise[0]) return '';
    return 'Soleil ' + hm(d.sunrise[0]) + ' – ' + hm(d.sunset[0]);
  }
  MJ.ecranCells = function (cells) {
    var inf = S.infos;
    if (inf.bat) {
      var b = batterie();
      cells.push(b ? { k: 'bat', l: 'Batterie', b: b.level + ' %', big: 1, s: b.plugged ? 'En charge' : b.level <= 20 ? 'À recharger' : 'Sur batterie', cls: !b.plugged && b.level <= 20 ? 'warn' : '' }
        : { k: 'bat', l: 'Batterie', b: '—', s: 'Pas de batterie' });
    }
    if (inf.msg) {
      var m = MJ.msgNonLus ? MJ.msgNonLus() : null;
      if (!m) cells.push({ k: 'msg', l: 'Messages', b: '—', s: X.ANDROID ? 'Touchez pour autoriser' : (window.MAGMajordome || {}).gmail ? 'Touchez pour relier Gmail' : 'Sur le téléphone' });
      else { var n = m.msg + m.mails; cells.push({ k: 'msg', l: 'Messages', b: n ? String(n) + ' non lu' + (n > 1 ? 's' : '') : 'Rien de nouveau', big: n ? 1 : 0, s: n ? [m.msg ? m.msg + ' message' + (m.msg > 1 ? 's' : '') : '', m.mails ? m.mails + ' mail' + (m.mails > 1 ? 's' : '') : ''].filter(Boolean).join(' · ') : 'Messages et mails' }); }
    }
    if (inf.notes) {
      var LN = MJ.LS ? (MJ.LS().notes || []) : [], dn = LN.length ? LN[LN.length - 1] : null;
      cells.push(dn ? { k: 'notes', l: LN.length > 1 ? LN.length + ' notes' : 'Note', b: dn.t, s: LN.length > 1 ? 'Touchez pour toutes les voir' : 'Touchez pour la voir' }
        : { k: 'notes', l: 'Notes', b: 'Aucune note', s: '« Note : appeler le client »' });
    }
    if (inf.list) {
      var LS = MJ.LS ? MJ.LS() : null, L = LS && LS.lists || {}, ks = Object.keys(L).filter(function (k) { return (L[k] || []).some(function (x) { return !x.done; }); });
      var k0 = ks.indexOf('course') >= 0 ? 'course' : ks[0], nl = k0 ? L[k0].filter(function (x) { return !x.done; }).length : 0;
      cells.push(k0 ? { k: 'list', l: 'Liste ' + (k0 === 'course' ? 'de courses' : k0), b: nl + ' article' + (nl > 1 ? 's' : ''), s: L[k0].filter(function (x) { return !x.done; }).slice(0, 3).map(function (x) { return x.t; }).join(', ') }
        : { k: 'list', l: 'Listes', b: 'Tout est fait', s: '« Ajoute du pain aux courses »' });
    }
    if (inf.ciel) { var lu = lune(Date.now()); cells.push({ k: 'ciel', l: 'Lune et soleil', b: lu.nom, s: soleil() || lu.ecl + ' % éclairée' }); }
    return cells;
  };
  MJ.ecranClick = function (k) {
    if (k === 'bat') { X.handle('niveau de batterie', 'click'); return true; }
    if (k === 'msg') { if (MJ.msgNonLus && MJ.msgNonLus()) X.handle('j\'ai des messages', 'click'); else X.settingsSheet((window.MAGMajordome || {}).gmail ? 'google' : 'messages'); return true; }
    if (k === 'list' || k === 'notes') { var b = $('bLists'); if (b) b.click(); return true; }
    if (k === 'ciel') { var lu = lune(Date.now()), so = soleil(); X.answer({ say: lu.nom + ', éclairée à ' + lu.ecl + ' %.' + (so ? ' ' + so.replace('Soleil ', 'Lever du soleil à ').replace(' – ', ', coucher à ') + '.' : ''), k: 'Lune et soleil' }); return true; }
    return false;
  };

  /* ---------------- commandes rapides ---------------- */
  var cq = document.createElement('div'); cq.id = 'cmdq'; cq.setAttribute('aria-label', 'Commandes rapides');
  var mo = $('moment'); if (mo && mo.parentNode) mo.parentNode.insertBefore(cq, mo.nextSibling);
  function cmds() {
    cq.innerHTML = (S.cmds || []).filter(Boolean).map(function (c, i) { return '<button type="button" data-cq="' + i + '">' + esc(c) + '</button>'; }).join('');
  }
  cq.addEventListener('click', function (e) { var b = e.target.closest('[data-cq]'); if (!b) return; var c = S.cmds[+b.dataset.cq]; if (c) X.handle(c, 'click'); });
  cmds();

  /* ---------------- Réglages › Écran (appelé par mj-fx.js, même rubrique que le visuel et les effets) ---------------- */
  MJ.ecranHtml = function () {
    return '<div class="set"><div class="t">Informations à afficher<small>Les cases sous la sphère : touchez une case pour en savoir plus</small></div></div>' +
      '<div class="set"><div class="t">Quand les voir<small>« Toujours » : les cases restent à l\'écran ; « Pendant une réponse » : elles n\'apparaissent que quand il vous répond</small></div><select class="in" id="ecCases" style="width:auto"><option value="toujours"' + (S.cases !== 'annonce' ? ' selected' : '') + '>Toujours</option><option value="annonce"' + (S.cases === 'annonce' ? ' selected' : '') + '>Pendant une réponse</option></select></div>' +
      '<div class="ecr-inf">' + INFOS.map(function (o) { return '<label><input type="checkbox" data-inf="' + o[0] + '"' + (S.infos[o[0]] !== false ? ' checked' : '') + '>' + esc(o[1]) + '</label>'; }).join('') + '</div>' +
      '<div class="set"><div class="t">Commandes rapides<small>Des boutons sous les cases, une commande par ligne, comme vous la diriez (« Allume le salon », « Minuteur 5 minutes », « Mode chantier »)</small></div></div>' +
      '<textarea class="in" id="ecCmds" rows="4" style="width:100%;resize:vertical" placeholder="Météo aujourd\'hui&#10;J\'ai des messages ?&#10;Minuteur 10 minutes">' + esc((S.cmds || []).join('\n')) + '</textarea>' +
      '<div class="set"><div class="t">Fond<small>Derrière la sphère et les cases</small></div><select class="in" id="ecFond" style="width:auto">' +
      [['grille', 'Grille HUD'], ['etoiles', 'Étoiles (comme Jarvis)'], ['uni', 'Uni sombre']].map(function (o) { return '<option value="' + o[0] + '"' + (S.fond === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
  };
  MJ.ecranBind = function () {
    var cs = $('ecCases'); if (cs) cs.onchange = function () { S.cases = this.value; save(); document.documentElement.classList.toggle('mj-cases', S.cases === 'annonce'); };
    document.querySelectorAll('[data-inf]').forEach(function (c) {
      c.onchange = function () {
        S.infos[c.dataset.inf] = c.checked;
        // une case cochée doit se voir : si les cases ne s'affichent que pendant une réponse, on passe à « Toujours »
        if (c.checked && S.cases === 'annonce') { S.cases = 'toujours'; document.documentElement.classList.remove('mj-cases'); if (cs) cs.value = 'toujours'; X.toast('Cases affichées en permanence'); }
        save(); if (MJ.moment) MJ.moment();
      };
    });
    var t = $('ecCmds'); if (t) t.oninput = function () { S.cmds = this.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12); save(); cmds(); };
    var f = $('ecFond'); if (f) f.onchange = function () { S.fond = this.value; save(); fond(); };
  };
})();
