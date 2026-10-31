/* =====================================================================
   Fond Jarvis : panneaux, réglages, API de Lively Wallpaper, raccourcis.
   Trois façons d'ouvrir la page (FJ.mode) :
     'lively'  paquet Lively (servi par Lively sur https://<empreinte>.localhost/)
     'suite'   Suite MAG sur PC (GitHub Pages, window.MAGPC présent) : même
               stockage que Majordome PC, Agenda… dans le même navigateur
     'web'     autre (fichier ouvert directement…)
   API de Lively (wiki officiel « Web Guide IV/V », LivelyInfo.json › Arguments) :
     livelyPropertyListener(nom, valeur)   réglages de LivelyProperties.json
     livelySystemInformation(json)         --system-information
     livelyCurrentTrack(json)              --system-nowplaying
     livelyWallpaperPlaybackChanged(json)  --pause-event true
   Réseau : Open-Meteo (météo, toutes les 30 min), franceinfo (titres, toutes
   les 20 min), et en mode Lively la date de la dernière version du paquet.
   ===================================================================== */
(function (root) {
  'use strict';
  var FJ = root.FJ = root.FJ || {};
  var doc = document, MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var SITE = 'https://gilbertmamadou-design.github.io/atelier-signature/pc/';
  function $(id) { return doc.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function J(s, d) { try { var v = typeof s === 'string' ? JSON.parse(s) : s; return v == null ? d : v; } catch (e) { return d; } }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  FJ.esc = esc; FJ.J = J; FJ.lsGet = lsGet; FJ.lsSet = lsSet; FJ.cap = cap; FJ.SITE = SITE;

  /* ---------------- Où tourne la page ---------------- */
  var host = location.hostname || '';
  FJ.mode = /\.localhost$/i.test(host) || location.protocol === 'file:' ? 'lively' : root.MAGPC ? 'suite' : 'web';
  FJ.lively = FJ.mode === 'lively';     // devient vrai aussi dès qu'une fonction de Lively est appelée
  FJ.inSuite = /\/atelier-signature\/pc\/fond-jarvis\/?/.test(location.pathname);
  FJ.suiteUrl = function (id) { return (FJ.inSuite ? '../' : SITE) + id + '/'; };
  doc.documentElement.dataset.mode = FJ.mode;

  /* ---------------- Réglages ---------------- */
  var KEY = { set: 'fond-jarvis:reglages', keys: 'fond-jarvis:raccourcis', wx: 'fond-jarvis:meteo', actu: 'fond-jarvis:actu', ics: 'fond-jarvis:ics', lp: 'fond-jarvis:lively', maj: 'fond-jarvis:maj' };
  FJ.KEY = KEY;
  var MJS = lsGet('majordome:reglages', {}) || {};   // Majordome PC (même origine dans la Suite) : nom, ville, seuil de vent, voix
  var DEF = {
    theme: 'cyan', layout: 'complet', name: '', city: '', place: null, windLimit: +MJS.windLimit || 45,
    voiceOn: true, voice: MJS.voice || '', rate: +MJS.rate || 1, tts: MJS.tts || 'system', piperVoice: MJS.piperVoice || 'pierre', vfx: 'ia', vfxo: null, free: 140, scale: 100, fx: 70, reduce: false, fpsMax: 30, saver: true,
    newsN: 7, panels: { clock: true, wx: true, agenda: true, sys: true, news: true, music: true }, wake: false, wakeOk: false, updates: true
  };
  var S = FJ.S = Object.assign({}, DEF, lsGet(KEY.set, {}));
  S.panels = Object.assign({}, DEF.panels, S.panels || {});
  FJ.save = function () { lsSet(KEY.set, S); };
  FJ.aiName = function () { return (S.name || MJS.name || 'Majordome').trim() || 'Majordome'; };
  var THEMES = ['cyan', 'bleu', 'vert', 'ambre', 'rouge'], LAYOUTS = ['complet', 'epure', 'sphere'];
  FJ.THEMES = THEMES; FJ.LAYOUTS = LAYOUTS;

  /* ---------------- Petits outils d'interface ---------------- */
  var toastT = 0;
  FJ.toast = function (t, ms) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, ms || 3600); };
  function userActive() { try { return !!(navigator.userActivation && navigator.userActivation.isActive); } catch (e) { return false; } }
  FJ.userActive = userActive;
  /** Adresse réelle d'un raccourci (« suite:texte » → appli de la Suite) */
  FJ.resolve = function (u) { u = String(u || '').trim(); var m = /^suite:([a-z0-9-]+)$/.exec(u); return m ? FJ.suiteUrl(m[1]) : u; };
  FJ.isProto = function (u) { return !/^(https?:|suite:|\.\.?\/)/i.test(String(u || '').trim()); };
  /**
   * Ouvre une adresse dans le navigateur par défaut ou l'appli Windows liée au protocole.
   * Lively (lecteur WebView2) : window.open lancé par un clic → le lecteur ouvre l'adresse avec Windows
   * (Process.Start, voir Lively.Player.WebView2/Form1.cs › NewWindowRequested). Un lien sans nouvel onglet
   * remplacerait le fond d'écran lui-même : jamais de navigation dans la page.
   * Navigateur : nouvel onglet pour le web ; protocole (ms-settings:…) par un lien, que le navigateur confirme.
   */
  FJ.open = function (u) {
    var url = FJ.resolve(u);
    if (!url) return false;
    if (FJ.lively || !FJ.isProto(url)) {
      var w = null;
      try { w = (root.MAGPC && root.MAGPC.nativeOpen) ? root.MAGPC.nativeOpen(url, '_blank') : root.open(url, '_blank', 'noopener'); } catch (e) { }
      return true;
    }
    var a = doc.createElement('a'); a.href = url; a.rel = 'noopener'; a.style.display = 'none'; doc.body.appendChild(a); a.click(); a.remove();
    return true;
  };

  /* ---------------- Applis de la Suite, raccourcis ---------------- */
  // identifiant PC, nom, icône
  var SUITE = [
    ['texte', 'Texte', 'texte'], ['tableur', 'Tableur', 'tableur'], ['presentation', 'Présentation', 'presentation'], ['lecteur', 'Lecteur PDF', 'pdf'],
    ['pdf', 'Atelier PDF', 'pdf'], ['fichiers', 'Rangement', 'dossier'], ['ecran', 'Écran', 'ecran'], ['actualites', 'Actualités', 'actu'], ['majordome', 'Majordome', 'sphere'],
    ['agenda', 'Agenda', 'agenda'], ['notes', 'Carnet', 'carnet'], ['contacts', 'Contacts', 'contacts'], ['calcul', 'Calcul', 'calcul'], ['meteo', 'Météo', 'meteo'],
    ['ciel', 'Ciel', 'meteo'], ['budget', 'Budget', 'budget'], ['musique', 'Mélodie', 'musique'], ['ondes', 'Ondes', 'musique'], ['galerie', 'Galerie', 'photo'],
    ['scan', 'Scan', 'capture'], ['dicta', 'Dictaphone', 'micro'], ['coffre', 'Coffre', 'coffre'], ['qr', 'QR', 'capture'], ['liseuse', 'Liseuse', 'livre'],
    ['toile', 'Toile', 'photo'], ['solaire', 'Solaire', 'meteo'], ['sentiers', 'Sentiers', 'maison'], ['petitspas', 'Petits Pas', 'etoile'], ['chasse', 'Carnet de chasse', 'carnet']
  ];
  FJ.SUITE = SUITE;
  FJ.suiteName = function (id) { for (var i = 0; i < SUITE.length; i++) if (SUITE[i][0] === id) return SUITE[i][1]; return null; };
  // raccourcis Windows par protocole : [nom, adresse, icône, état]
  // état : 'doc' = protocole documenté par Microsoft (learn.microsoft.com, « Launch the default app for a URI » / « Launch the Windows Settings app ») ;
  //        'usuel' = protocole installé par une appli de Windows, non documenté ; 'essai' = dépend du lecteur, à essayer.
  var WIN = [
    ['Paramètres', 'ms-settings:', 'reglages', 'doc'], ['Wi-Fi', 'ms-settings:network-wifi', 'wifi', 'doc'], ['Bluetooth', 'ms-settings:bluetooth', 'bluetooth', 'doc'],
    ['Affichage', 'ms-settings:display', 'affichage', 'doc'], ['Son', 'ms-settings:sound', 'son', 'doc'], ['Alimentation et veille', 'ms-settings:powersleep', 'veille', 'doc'],
    ['Économie de batterie', 'ms-settings:batterysaver', 'alim', 'doc'], ['Windows Update', 'ms-settings:windowsupdate', 'maj', 'doc'],
    ['Arrière-plan', 'ms-settings:personalization-background', 'photo', 'doc'], ['Micro (confidentialité)', 'ms-settings:privacy-microphone', 'micro', 'doc'],
    ['Courrier', 'mailto:', 'mail', 'doc'], ['Photos', 'ms-photos:', 'photo', 'doc'], ['Microsoft Store', 'ms-windows-store://home', 'magasin', 'doc'],
    ['Météo Windows', 'msnweather://forecast', 'meteo', 'doc'], ['Horloge (alarmes)', 'ms-clock:', 'horloge', 'usuel'], ['Calculatrice', 'calculator:', 'calcul', 'usuel'],
    ['Capture d\'écran', 'ms-screenclip:', 'capture', 'usuel'], ['Explorateur (C:)', 'file:///C:/', 'dossier', 'essai']
  ];
  FJ.WIN = WIN;
  var SITES = [['YouTube', 'https://www.youtube.com/', 'ecran'], ['Wikipédia', 'https://fr.wikipedia.org/', 'livre'], ['franceinfo', 'https://www.franceinfo.fr/', 'actu'],
    ['Vigilance météo', 'https://vigilance.meteofrance.fr/', 'meteo'], ['Service-Public', 'https://www.service-public.fr/', 'maison'], ['Suite MAG', SITE, 'etoile']];
  FJ.SITES = SITES;
  function kid() { return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  FJ.defaultKeys = function () {
    var l = ['texte', 'tableur', 'presentation', 'lecteur', 'fichiers', 'ecran', 'actualites', 'majordome'].map(function (id) {
      var s = SUITE.filter(function (x) { return x[0] === id; })[0]; return { id: kid(), name: s[1], url: 'suite:' + id, icon: s[2] };
    });
    [['Paramètres', 'ms-settings:', 'reglages'], ['Courrier', 'mailto:', 'mail'], ['Horloge', 'ms-clock:', 'horloge'], ['Calculatrice', 'calculator:', 'calcul']].forEach(function (w) { l.push({ id: kid(), name: w[0], url: w[1], icon: w[2] }); });
    return l;
  };
  FJ.keys = lsGet(KEY.keys, null);
  if (!Array.isArray(FJ.keys)) FJ.keys = FJ.defaultKeys();
  FJ.saveKeys = function () { lsSet(KEY.keys, FJ.keys); renderKeys(); };
  function renderKeys() {
    var box = $('keys'); box.innerHTML = '';
    FJ.keys.forEach(function (k) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'key'; b.title = k.name + ' — ' + FJ.resolve(k.url);
      b.innerHTML = FJI.svg(k.icon || 'etoile') + '<span>' + esc(k.name) + '</span>';
      b.onclick = function () { FJ.open(k.url); FJ.toast('Ouverture : ' + k.name, 1800); };
      box.appendChild(b);
    });
    FJ.relayout();
  }
  FJ.renderKeys = renderKeys;
  /* rangées de raccourcis équilibrées (6 + 6 plutôt que 11 + 1) */
  function fitKeys() {
    var box = $('keys'), n = box.children.length; box.style.maxWidth = '';
    if (!n || !box.offsetParent) return;
    var gap = parseFloat(getComputedStyle(box).columnGap) || 6, kw = box.children[0].getBoundingClientRect().width + gap, avail = $('dock').clientWidth + gap;
    var per = Math.max(1, Math.floor(avail / kw)), rows = Math.ceil(n / per), cols = Math.ceil(n / rows);
    box.style.maxWidth = Math.ceil(cols * kw - gap + 1) + 'px';
  }

  /* ---------------- Thème, disposition, échelle ---------------- */
  // la sphère de Majordome a ses propres couleurs (sarcelle au repos) : rotation de teinte vers celle du thème
  var orbHue = { cyan: 'hue-rotate(18deg) saturate(1.25) brightness(1.75)', bleu: 'hue-rotate(50deg) saturate(1.3) brightness(1.75)', vert: 'hue-rotate(-28deg) saturate(1.25) brightness(1.65)', ambre: 'hue-rotate(-135deg) saturate(1.7) brightness(1.75)', rouge: 'hue-rotate(178deg) saturate(1.7) brightness(1.65)' };
  FJ.apply = function (what) {
    var R = doc.documentElement;
    if (THEMES.indexOf(S.theme) < 0) S.theme = 'cyan';
    if (LAYOUTS.indexOf(S.layout) < 0) S.layout = 'complet';
    R.dataset.theme = S.theme;
    R.style.setProperty('--scale', clamp(+S.scale || 100, 70, 160) / 100);
    R.style.setProperty('--free', clamp(+S.free || 0, 0, 900) + 'px');
    R.style.setProperty('--fx', clamp(+S.fx, 0, 100) / 100);
    R.classList.toggle('fj-reduce', !!S.reduce);
    $('hud').dataset.layout = S.layout;
    $('orb').style.filter = orbHue[S.theme] || '';
    FJ.freeX = clamp(+S.free || 0, 0, 900);
    FJ.hud.intensity = clamp(+S.fx, 0, 100) / 100;
    FJ.hud.reduce = !!S.reduce;
    $('aiName').textContent = FJ.aiName();
    $('q').placeholder = 'Demandez à ' + FJ.aiName() + '…  (Ctrl+Espace)';
    panelsVisible();
    applyPower();
    if (what !== 'quiet') FJ.relayout();
  };
  function panelsVisible() {
    $('pClock').hidden = !S.panels.clock;
    $('pWx').hidden = !S.panels.wx;
    $('pNews').hidden = !S.panels.news;
    $('pAgenda').hidden = !(S.panels.agenda && AG.has);
    $('pMusic').hidden = !(S.panels.music && MU.on);
    $('pSys').hidden = !(S.panels.sys && (SYS.on || BAT.on));
  }

  /* ---------------- Mise en page du HUD (circuits vers les panneaux) ---------------- */
  var lt = 0;
  FJ.relayout = function () {
    if (lt) return;
    lt = requestAnimationFrameNative(function () {
      lt = 0;
      fitNews(); fitKeys();
      var box = $('orbBox').getBoundingClientRect(), st = $('stage').getBoundingClientRect();
      var side = Math.min(st.width, st.height);
      var orbBox = $('orbBox'); orbBox.style.width = orbBox.style.height = Math.floor(side) + 'px';
      box = orbBox.getBoundingClientRect();
      var stage = { cx: box.left + box.width / 2, cy: box.top + box.height / 2, r: box.width / 2 * 0.98 };
      var anchors = [], avoid = [];
      doc.querySelectorAll('#hud .pan').forEach(function (p) {
        if (p.hidden || !p.offsetParent) return;
        var r = p.getBoundingClientRect(); if (!r.width) return;
        avoid.push({ l: r.left, r: r.right, t: r.top, b: r.bottom });
        var hy = r.top + Math.min(r.height / 2, 18 + r.height * 0.12);
        if (r.right < stage.cx - stage.r * 0.5) anchors.push({ x: r.right + 1, y: hy });
        else if (r.left > stage.cx + stage.r * 0.5) anchors.push({ x: r.left - 1, y: hy });
        else anchors.push({ vert: true, x: stage.cx, y: r.top < stage.cy ? r.bottom + 1 : r.top - 1 });
      });
      ['bar', 'keys', 'say'].forEach(function (id) { var e = $(id); if (e && !e.hidden && e.offsetParent) { var r = e.getBoundingClientRect(); if (r.width) avoid.push({ l: r.left, r: r.right, t: r.top, b: r.bottom }); } });
      var bar = $('bar');
      if (bar.offsetParent && S.layout !== 'sphere') { var br = bar.getBoundingClientRect(); anchors.push({ vert: true, x: stage.cx, y: br.top - 1 }); }
      FJ.hud.layout({ stage: stage, anchors: anchors, avoid: avoid });
      FJ.layoutInfo = { stage: stage, anchors: anchors.length };
    });
  };
  // la boucle d'images est plafonnée (et arrêtée en pause) : la mise en page passe par un minuteur
  function requestAnimationFrameNative(cb) { return setTimeout(cb, 16); }
  if (root.ResizeObserver) new ResizeObserver(function () { FJ.relayout(); }).observe($('stage'));

  /* ---------------- Énergie : images par seconde, batterie ---------------- */
  var BAT = FJ.bat = { on: false, level: 1, charging: true };
  function applyPower() {
    var f = clamp(+S.fpsMax || 30, 10, 30);
    if (S.saver && BAT.on && !BAT.charging) f = Math.min(f, 15);
    if (S.reduce) f = Math.min(f, 10);
    FJ.loop.setFps(f);
    var want = S.saver && BAT.on && !BAT.charging ? 600 : 1100;
    if (FJ.orb && FJ.orbCount !== want) makeOrb(want);
  }
  function makeOrb(n) {
    var old = FJ.orb, st = old ? old.get() : 'idle';
    if (old) old.stop();
    FJ.orbCount = n;
    // Toile de la sphère en résolution réduite (agrandie à l'affichage) : son halo est repeint en entier à chaque image,
    // le coût suit le nombre de pixels. mj-orb.js (commun avec l'APK) lit devicePixelRatio à la création : on le fixe le temps de l'appel.
    var real = root.devicePixelRatio || 1, k = FJ.orbRes || 0.6, desc = Object.getOwnPropertyDescriptor(root, 'devicePixelRatio');
    try { Object.defineProperty(root, 'devicePixelRatio', { configurable: true, get: function () { return Math.min(real, 1) * k; } }); } catch (e) { }
    try { FJ.orb = root.MJOrb.create($('orb'), { pad: 1.12, count: n }); }   // toile = 70 % de la scène : sphère = moitié du rayon des anneaux
    finally { try { if (desc) Object.defineProperty(root, 'devicePixelRatio', desc); else delete root.devicePixelRatio; } catch (e) { } }
    if (st !== 'idle') FJ.orb.state(st);
  }
  function batteryUi() {
    var pct = Math.round(BAT.level * 100), low = !BAT.charging && pct <= 20;
    var cb = $('clkBat'); cb.hidden = !BAT.on;
    if (BAT.on) { cb.className = 'bat' + (low ? ' low' : ''); cb.innerHTML = FJI.svg(BAT.charging ? 'eclair' : 'batterie') + '<span class="num">' + pct + ' %</span>'; cb.title = BAT.charging ? 'En charge' : 'Sur batterie'; }
    var row = $('batRow'); row.hidden = !BAT.on;
    if (BAT.on) { row.className = 'batrow' + (low ? ' low' : ''); row.innerHTML = FJI.svg(BAT.charging ? 'eclair' : 'batterie') + '<span>Batterie</span><span class="bar"><i style="width:' + pct + '%"></i></span><b class="num">' + pct + ' %</b><small>' + (BAT.charging ? 'secteur' : 'sur batterie') + '</small>'; }
  }
  if (navigator.getBattery) {
    navigator.getBattery().then(function (b) {
      function up() {
        // ordinateur de bureau : Chromium annonce « en charge, 100 % » sans batterie réelle → panneau masqué
        BAT.on = !(b.charging && b.level === 1 && b.chargingTime === 0);
        BAT.level = b.level; BAT.charging = b.charging;
        batteryUi(); panelsVisible(); applyPower();
      }
      ['levelchange', 'chargingchange'].forEach(function (e) { b.addEventListener(e, up); });
      up();
    }).catch(function () { });
  }

  /* ---------------- Horloge ---------------- */
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  FJ.JOURS = JOURS; FJ.MOIS = MOIS;
  function isoWeek(d) { var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), dn = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dn); var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / DAY + 1) / 7); }
  FJ.isoWeek = isoWeek;
  var dial = $('clkDial'), ticks = [], secTx = null;
  (function buildDial() {
    var ns = 'http://www.w3.org/2000/svg', h = '<circle class="ring" cx="60" cy="60" r="57"/>';
    for (var i = 0; i < 60; i++) { var a = (i / 60) * Math.PI * 2 - Math.PI / 2, r1 = 51, r2 = i % 5 === 0 ? 43 : 46; h += '<line class="tk' + (i % 5 === 0 ? ' q' : '') + '" x1="' + (60 + Math.cos(a) * r1).toFixed(2) + '" y1="' + (60 + Math.sin(a) * r1).toFixed(2) + '" x2="' + (60 + Math.cos(a) * r2).toFixed(2) + '" y2="' + (60 + Math.sin(a) * r2).toFixed(2) + '"/>'; }
    h += '<text class="sec" x="60" y="56">00</text><text class="lab" x="60" y="78">SEC</text>';
    dial.innerHTML = h; ticks = dial.querySelectorAll('.tk'); secTx = dial.querySelector('.sec');
    void ns;
  })();
  var lastMin = -1, lastSec = -1;
  function clock(force) {
    var d = new Date(), s = d.getSeconds();
    if (force || s !== lastSec) {
      for (var i = 0; i < 60; i++) { var on = i <= s; if (force || (on !== ticks[i].classList.contains('on'))) ticks[i].classList.toggle('on', on); }
      secTx.textContent = String(s).padStart(2, '0'); lastSec = s;
    }
    var m = d.getHours() * 60 + d.getMinutes();
    if (force || m !== lastMin) {
      lastMin = m;
      $('clkTime').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      $('clkDate').textContent = cap(JOURS[d.getDay()]) + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
      $('clkWeek').textContent = 'Semaine ' + isoWeek(d);
      try { $('clkZone').textContent = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').replace(/_/g, ' '); } catch (e) { }
      if (d.getMinutes() % 5 === 0) agendaRender();
    }
  }
  var clkT = 0;
  function clockLoop() { if (!(FJ.loop.paused || doc.hidden)) clock(); clkT = setTimeout(clockLoop, 1000 - (Date.now() % 1000) + 8); }
  FJ.clock = clock;

  /* ---------------- Météo (Open-Meteo, sans clé) ---------------- */
  var WMO = FJ.WMO = { 0: 'ciel dégagé', 1: 'plutôt dégagé', 2: 'partiellement nuageux', 3: 'couvert', 45: 'brouillard', 48: 'brouillard givrant', 51: 'bruine légère', 53: 'bruine', 55: 'bruine forte', 56: 'bruine verglaçante', 57: 'bruine verglaçante', 61: 'pluie faible', 63: 'pluie', 65: 'forte pluie', 66: 'pluie verglaçante', 67: 'pluie verglaçante', 71: 'neige faible', 73: 'neige', 75: 'forte neige', 77: 'grains de neige', 80: 'averses', 81: 'averses', 82: 'fortes averses', 85: 'averses de neige', 86: 'fortes averses de neige', 95: 'orages', 96: 'orages avec grêle', 99: 'orages avec grêle' };
  function http(url, ms) {
    var ctl = root.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 20000);
    return fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined, referrerPolicy: 'no-referrer' }).then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }, function (e) { clearTimeout(to); throw e; });
  }
  FJ.http = http;
  function geocode(name) {
    return http('https://geocoding-api.open-meteo.com/v1/search?count=5&language=fr&format=json&name=' + encodeURIComponent(name)).then(function (t) {
      var r = (J(t, {}).results || []); r.sort(function (a, b) { return (b.country_code === 'FR') - (a.country_code === 'FR'); });
      if (!r.length) throw Object.assign(new Error('ville inconnue'), { city: name });
      return { lat: r[0].latitude, lon: r[0].longitude, name: r[0].name, admin: r[0].admin1 || '' };
    });
  }
  FJ.geocode = geocode;
  function locate() {
    return new Promise(function (ok, ko) {
      if (!navigator.geolocation) return ko(new Error('position indisponible'));
      navigator.geolocation.getCurrentPosition(function (p) { ok({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), name: '', auto: true }); }, function () { ko(new Error('position refusée')); }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 6 * HOUR });
    });
  }
  /** Lieu de la météo : réglage (ville), sinon celui de Majordome (Suite), sinon position détectée une fois */
  function place() {
    if (S.place && S.place.lat != null) return Promise.resolve(S.place);
    if (S.city) return geocode(S.city).then(function (p) { S.place = p; FJ.save(); return p; });
    if (MJS.place && MJS.place.lat != null) return Promise.resolve(MJS.place);
    return locate().then(function (p) { S.place = p; FJ.save(); return p; });
  }
  FJ.place = place;
  var WX = FJ.wx = { data: null, at: 0, where: '', busy: null, err: '' };
  (function () { var c = lsGet(KEY.wx, null); if (c && c.d) { WX.data = c.d; WX.at = c.at; WX.where = c.where || ''; } })();
  FJ.weather = function (force) {
    if (WX.busy) return WX.busy;
    if (!force && WX.data && Date.now() - WX.at < 30 * MIN) return Promise.resolve(WX);
    WX.busy = place().then(function (pl) {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pl.lat + '&longitude=' + pl.lon +
        '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,is_day,precipitation' +
        '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset' +
        '&timezone=auto&forecast_days=7&wind_speed_unit=kmh';
      return http(url).then(function (t) {
        var d = J(t, null); if (!d || !d.daily || !d.current) throw new Error('réponse météo illisible');
        WX.data = d; WX.at = Date.now(); WX.where = pl.name || (pl.auto ? 'Position détectée' : ''); WX.err = '';
        lsSet(KEY.wx, { d: d, at: WX.at, where: WX.where });
        return WX;
      });
    }).then(function (w) { WX.busy = null; wxRender(); return w; }, function (e) {
      WX.busy = null; WX.err = e && e.city ? 'Ville « ' + e.city + ' » introuvable' : /position/.test(e && e.message) ? 'nopos' : 'Météo indisponible (hors ligne ?)';
      wxRender(); throw e;
    });
    return WX.busy;
  };
  function hm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  FJ.hm = hm;
  var DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  function wxRender() {
    var box = $('wxNow'), days = $('wxDays'), d = WX.data;
    if (!d) {
      $('wxWhere').textContent = '';
      if (WX.err === 'nopos') box.innerHTML = '<p class="muted">Position inconnue.</p><div class="row"><button type="button" class="btn" data-city>Choisir une ville</button></div>';
      else box.innerHTML = '<p class="muted">' + esc(WX.err || 'Chargement de la météo…') + '</p>' + (WX.err ? '<div class="row"><button type="button" class="btn" data-city>Réglages météo</button></div>' : '');
      var b = box.querySelector('[data-city]'); if (b) b.onclick = function () { FJ.settings('meteo'); };
      days.innerHTML = ''; return;
    }
    var c = d.current, lim = +S.windLimit || 45, g = c.wind_gusts_10m, cls = g >= lim ? 'warn' : g >= lim * 0.8 ? 'near' : '';
    var old = Date.now() - WX.at > 2 * HOUR ? ' · ' + hm(WX.at) : '';
    $('wxWhere').textContent = (WX.where || '') + old;
    var di = 0, sr = d.daily.sunrise[di], ss = d.daily.sunset[di];
    var gmax = d.daily.wind_gusts_10m_max[0];
    box.innerHTML = FJI.wx(c.weather_code, c.is_day) +
      '<div class="wx-t">' + Math.round(c.temperature_2m) + '°<small>ressenti ' + Math.round(c.apparent_temperature) + '°</small></div>' +
      '<div class="wx-d">' + esc(cap(WMO[c.weather_code] || '')) + ' · humidité ' + Math.round(c.relative_humidity_2m) + ' %</div>' +
      '<div class="wx-rows"><span class="' + cls + '">Vent <b>' + Math.round(c.wind_speed_10m) + '</b> km/h ' + (DIRS[Math.round((c.wind_direction_10m || 0) / 45) % 8]) + ' · rafales <b>' + Math.round(g) + '</b></span>' +
      '<span>Lever <b>' + hm(sr) + '</b></span><span>Coucher <b>' + hm(ss) + '</b></span></div>' +
      (gmax >= lim ? '<div class="wx-alert">Rafales jusqu\'à ' + Math.round(gmax) + ' km/h aujourd\'hui : au-dessus du seuil chantier (' + lim + ' km/h).</div>' : '');
    var h = '';
    for (var i = 1; i <= 5 && i < d.daily.time.length; i++) {
      var dt = new Date(d.daily.time[i] + 'T12:00'), gm = d.daily.wind_gusts_10m_max[i], wc = gm >= lim ? 'warn' : gm >= lim * 0.8 ? 'near' : '';
      h += '<div title="' + esc(cap(JOURS[dt.getDay()]) + ' : ' + (WMO[d.daily.weather_code[i]] || '') + ', rafales ' + Math.round(gm) + ' km/h') + '"><div class="dn">' + JOURS[dt.getDay()].slice(0, 3) + '</div>' + FJI.wx(d.daily.weather_code[i], 1) +
        '<div class="mm num">' + Math.round(d.daily.temperature_2m_max[i]) + '° <i>' + Math.round(d.daily.temperature_2m_min[i]) + '°</i></div>' +
        '<div class="xx">' + (d.daily.precipitation_probability_max[i] == null ? '' : d.daily.precipitation_probability_max[i] + ' % · ') + '<span class="' + wc + '">' + Math.round(gm) + '</span></div></div>';
    }
    days.innerHTML = h;
  }
  FJ.wxRender = wxRender;

  /* ---------------- Actualités (franceinfo) ---------------- */
  var NEWS = FJ.news = { items: [], at: 0, err: '', busy: null };
  (function () { var c = lsGet(KEY.actu, null); if (c && c.items) { NEWS.items = c.items; NEWS.at = c.at; } })();
  FJ.loadNews = function (force) {
    if (NEWS.busy) return NEWS.busy;
    if (!force && NEWS.items.length && Date.now() - NEWS.at < 20 * MIN) return Promise.resolve(NEWS);
    NEWS.busy = http('https://www.franceinfo.fr/titres.rss').then(function (xml) {
      var dd = new DOMParser().parseFromString(xml, 'application/xml'), its = dd.getElementsByTagName('item'), out = [];
      for (var i = 0; i < its.length && out.length < 10; i++) {
        var t = its[i].getElementsByTagName('title')[0], l = its[i].getElementsByTagName('link')[0];
        if (t && t.textContent.trim()) out.push({ t: t.textContent.trim().replace(/\s+/g, ' '), l: l ? l.textContent.trim() : '' });
      }
      if (!out.length) throw new Error('flux vide');
      NEWS.items = out; NEWS.at = Date.now(); NEWS.err = '';
      lsSet(KEY.actu, { items: out, at: NEWS.at });
      NEWS.busy = null; newsRender(); return NEWS;
    }).catch(function (e) { NEWS.busy = null; NEWS.err = navigator.onLine === false ? 'Hors ligne' : 'Titres indisponibles'; newsRender(); throw e; });
    return NEWS.busy;
  };
  function newsRender() {
    var ol = $('newsList'), n = clamp(+S.newsN || 7, 5, 10);
    $('newsMeta').textContent = 'franceinfo' + (NEWS.at ? ' · ' + hm(NEWS.at) : '');
    if (!NEWS.items.length) {
      ol.innerHTML = '<li><p class="muted">' + esc(NEWS.err || 'Chargement des titres…') + '</p></li>' + (NEWS.err ? '<li><a data-fi><span>Ouvrir franceinfo.fr</span></a></li>' : '');
      var a = ol.querySelector('[data-fi]'); if (a) a.onclick = function () { FJ.open('https://www.franceinfo.fr/'); };
      return;
    }
    ol.innerHTML = '';
    NEWS.items.slice(0, n).forEach(function (it) {
      var li = doc.createElement('li'), a = doc.createElement('a');
      a.href = it.l || 'https://www.franceinfo.fr/'; a.target = '_blank'; a.rel = 'noopener'; a.title = it.t;
      a.innerHTML = '<span>' + esc(it.t) + '</span>';
      a.onclick = function (e) { e.preventDefault(); FJ.open(it.l || 'https://www.franceinfo.fr/'); };
      li.appendChild(a); ol.appendChild(li);
    });
    fitNews();
  }
  /* titres en trop pour la hauteur disponible : retirés plutôt que coupés */
  function fitNews() {
    var ol = $('newsList'); if (!ol || !ol.offsetParent) return;
    var lis = ol.children; for (var i = 0; i < lis.length; i++) lis[i].classList.remove('cut');
    var lim = ol.getBoundingClientRect().bottom + 0.5;
    for (var j = 0; j < lis.length; j++) if (lis[j].getBoundingClientRect().bottom > lim) lis[j].classList.add('cut');
  }
  FJ.newsRender = newsRender;

  /* ---------------- Agenda : Agenda de la Suite (même navigateur) ou fichier .ics ---------------- */
  var AG = FJ.ag = { has: false, src: '', events: lsGet(KEY.ics, null), suite: null };
  function unfold(t) { return String(t || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, ''); }
  function icsDate(v, params) {
    var m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/.exec(v || ''); if (!m) return null;
    if (!m[4]) return { t: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), all: true };
    if (m[7]) return { t: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)), all: false };
    return { t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime(), all: false };   // heure locale (TZID supposé local)
  }
  /** Lecture d'un .ics : événements, avec répétitions simples (FREQ, INTERVAL, COUNT, UNTIL, BYDAY hebdomadaire) */
  FJ.parseIcs = function (text) {
    var out = [], cur = null;
    unfold(text).split('\n').forEach(function (line) {
      if (/^BEGIN:VEVENT/i.test(line)) { cur = {}; return; }
      if (/^END:VEVENT/i.test(line)) { if (cur && cur.b != null) out.push(cur); cur = null; return; }
      if (!cur) return;
      var k = line.indexOf(':'); if (k < 0) return;
      var name = line.slice(0, k).split(';')[0].toUpperCase(), val = line.slice(k + 1);
      var un = function (s) { return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim(); };
      if (name === 'DTSTART') { var d = icsDate(val.trim()); if (d) { cur.b = d.t; cur.all = d.all; } }
      else if (name === 'DTEND') { var e = icsDate(val.trim()); if (e) cur.e = e.t; }
      else if (name === 'SUMMARY') cur.t = un(val);
      else if (name === 'LOCATION') cur.l = un(val);
      else if (name === 'RRULE') cur.r = val.trim();
      else if (name === 'STATUS' && /CANCELLED/i.test(val)) cur.x = 1;
    });
    return out.filter(function (e) { return !e.x; }).map(function (e) { if (e.e == null) e.e = e.b + (e.all ? DAY : HOUR); return e; }).slice(0, 3000);
  };
  var BYD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  function occurrences(ev, from, to) {
    if (!ev.r) return ev.e > from && ev.b < to ? [ev] : [];
    var r = {}; ev.r.split(';').forEach(function (p) { var kv = p.split('='); r[kv[0].toUpperCase()] = kv[1]; });
    var freq = r.FREQ, iv = Math.max(1, +r.INTERVAL || 1), count = +r.COUNT || 0, until = r.UNTIL ? (icsDate(r.UNTIL) || {}).t : null, dur = ev.e - ev.b, out = [], n = 0;
    var days = freq === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map(function (x) { return BYD[x.slice(-2)]; }).filter(function (x) { return x != null; }) : null;
    var b0 = new Date(ev.b), guard = 0;
    for (var i = 0; guard < 4000; i++, guard++) {
      var cands = [];
      if (freq === 'DAILY') cands.push(new Date(b0.getFullYear(), b0.getMonth(), b0.getDate() + i * iv, b0.getHours(), b0.getMinutes()));
      else if (freq === 'WEEKLY') {
        var ws = new Date(b0.getFullYear(), b0.getMonth(), b0.getDate() - b0.getDay() + i * 7 * iv, b0.getHours(), b0.getMinutes());
        (days || [b0.getDay()]).slice().sort().forEach(function (dw) { cands.push(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + dw, b0.getHours(), b0.getMinutes())); });
      } else if (freq === 'MONTHLY') cands.push(new Date(b0.getFullYear(), b0.getMonth() + i * iv, b0.getDate(), b0.getHours(), b0.getMinutes()));
      else if (freq === 'YEARLY') cands.push(new Date(b0.getFullYear() + i * iv, b0.getMonth(), b0.getDate(), b0.getHours(), b0.getMinutes()));
      else return ev.e > from && ev.b < to ? [ev] : [];
      for (var c = 0; c < cands.length; c++) {
        var t = cands[c].getTime(); if (t < ev.b) continue;
        if ((until && t > until) || (count && n >= count)) return out;
        n++;
        if (t >= to) return out;
        if (t + dur > from) out.push({ b: t, e: t + dur, t: ev.t, l: ev.l, all: ev.all });
      }
    }
    return out;
  }
  /** Événements entre deux dates : [{b, e, t, l, all}] */
  FJ.agendaBetween = function (from, to) {
    var l = [];
    if (AG.suite) l = l.concat(J(AG.suite.instances(from, to), []).map(function (e) { return { b: e.b, e: e.e, t: e.t, l: e.l, all: e.all }; }));
    if (AG.events) AG.events.forEach(function (ev) { l = l.concat(occurrences(ev, from, to)); });
    return l.sort(function (a, b) { return a.b - b.b; });
  };
  function agendaInit() {
    // Suite MAG (même navigateur) : agenda de l'appli Agenda, s'il existe
    var has = false; try { has = !!localStorage.getItem('agenda-pc.v1'); } catch (e) { }
    if (FJ.mode === 'suite' && has && root.MAGPC && root.MAGPC.loadScript) {
      root.MAGPC.loadScript('../shared/apps/agenda.js').then(function () { AG.suite = root.MAGAgenda || null; AG.src = 'Agenda de la Suite'; agendaRender(); }).catch(function () { });
    }
    agendaRender();
  }
  function agendaRender() {
    var now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var from = d0.getTime(), to = from + 3 * DAY;
    AG.has = !!(AG.suite || (AG.events && AG.events.length));
    $('agSrc').textContent = AG.suite ? 'Suite MAG' : AG.events && AG.events.length ? (AG.srcName || 'fichier .ics') : '';
    var l = AG.has ? FJ.agendaBetween(from, to).filter(function (e) { return e.e > now; }) : [];
    var ul = $('agList'), h = '', lastDay = '', shown = 0;
    l.forEach(function (e) {
      if (shown >= 5) return;
      var dd = new Date(e.b), key = dd.toDateString(), off = Math.round((new Date(dd).setHours(0, 0, 0, 0) - from) / DAY);
      if (key !== lastDay) { h += '<li class="day">' + (off <= 0 ? 'Aujourd\'hui' : off === 1 ? 'Demain' : cap(JOURS[dd.getDay()])) + '</li>'; lastDay = key; }
      h += '<li><b>' + (e.all ? 'journée' : hm(e.b)) + '</b><span title="' + esc((e.t || '') + (e.l ? ' — ' + e.l : '')) + '">' + esc(e.t || 'Sans titre') + (e.l ? ' · ' + esc(e.l) : '') + '</span></li>';
      shown++;
    });
    ul.innerHTML = h || '<li class="day">Rien de prévu d\'ici 3 jours</li>';
    var vis = !!(S.panels.agenda && AG.has);
    if ($('pAgenda').hidden === vis) { $('pAgenda').hidden = !vis; FJ.relayout(); }
  }
  FJ.agendaRender = agendaRender;
  FJ.importIcs = function (text, name) {
    var ev = FJ.parseIcs(text);
    if (!ev.length) return 0;
    AG.events = ev; AG.srcName = name || 'fichier .ics'; lsSet(KEY.ics, ev); agendaRender(); return ev.length;
  };
  root.addEventListener('storage', function (e) { if (e.key === 'agenda-pc.v1') agendaRender(); });

  /* ---------------- Système (Lively --system-information), batterie ---------------- */
  var SYS = FJ.sys = { on: false, last: null, down: [], up: [], at: 0 };
  var G = {};
  function gaugeHtml(id, label) {
    return '<div class="gauge" id="g' + id + '"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="tk2" cx="50" cy="50" r="46"/><circle class="tr" cx="50" cy="50" r="38" stroke-dasharray="179 239" transform="rotate(135 50 50)"/>' +
      '<circle class="vl" cx="50" cy="50" r="38" stroke-dasharray="0 239" transform="rotate(135 50 50)"/><text x="50" y="48">–</text><text class="u" x="50" y="68">%</text></svg><div class="gl">' + label + '</div><div class="gs"></div></div>';
  }
  function gaugeSet(id, pct, sub) {
    var g = G[id] || (G[id] = { vl: $('g' + id).querySelector('.vl'), tx: $('g' + id).querySelector('text'), gs: $('g' + id).querySelector('.gs'), box: $('g' + id) });
    pct = clamp(+pct || 0, 0, 100);
    g.vl.setAttribute('stroke-dasharray', (179 * pct / 100).toFixed(1) + ' 239');
    g.tx.textContent = Math.round(pct);
    g.box.classList.toggle('hot', pct >= 90);
    if (sub != null && g.gs.textContent !== sub) g.gs.textContent = sub;
  }
  function rate(bps) { var b = (+bps || 0) * 8; return b >= 1e9 ? (b / 1e9).toFixed(1) + ' Gb/s' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' Mb/s' : b >= 1e3 ? Math.round(b / 1e3) + ' kb/s' : Math.round(b) + ' b/s'; }
  function netDraw() {
    var cv = $('netCv'); if (!cv.offsetParent) return;
    var r = cv.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1), w = Math.max(10, r.width), h = Math.max(10, r.height);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    var cs = getComputedStyle(doc.documentElement), c = cs.getPropertyValue('--c').trim().split(/\s+/).join(','), c2 = cs.getPropertyValue('--c2').trim().split(/\s+/).join(',');
    var mx = Math.max.apply(null, SYS.down.concat(SYS.up, [1024]));
    g.strokeStyle = 'rgba(' + c + ',.12)'; g.lineWidth = 1;
    for (var k = 1; k < 4; k++) { g.beginPath(); g.moveTo(0, h * k / 4); g.lineTo(w, h * k / 4); g.stroke(); }
    [[SYS.down, c, true], [SYS.up, c2, false]].forEach(function (s) {
      var a = s[0]; if (a.length < 2) return;
      g.beginPath();
      a.forEach(function (v, i) { var x = w * i / 59, y = h - 2 - (h - 4) * v / mx; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.strokeStyle = 'rgba(' + s[1] + ',.95)'; g.lineWidth = 1.4; g.stroke();
      if (s[2]) { g.lineTo(w * (a.length - 1) / 59, h); g.lineTo(0, h); g.closePath(); g.fillStyle = 'rgba(' + c + ',.12)'; g.fill(); }
    });
  }
  root.livelySystemInformation = function (data) {
    FJ.lively = true;
    var o = J(data, null); if (!o) return;
    SYS.last = o; SYS.at = Date.now();
    if (!SYS.on) {
      SYS.on = true;
      $('gauges').innerHTML = gaugeHtml('cpu', 'CPU') + gaugeHtml('ram', 'RAM') + gaugeHtml('gpu', 'GPU');
      G = {}; $('net').hidden = false; panelsVisible(); FJ.relayout();
    }
    if (FJ.loop.paused || doc.hidden) return;
    var ramUsed = o.TotalRam ? (o.TotalRam - o.CurrentRamAvail) / o.TotalRam * 100 : 0;
    gaugeSet('cpu', o.CurrentCpu, '');
    gaugeSet('ram', ramUsed, o.TotalRam ? ((o.TotalRam - o.CurrentRamAvail) / 1024).toFixed(1) + ' / ' + (o.TotalRam / 1024).toFixed(0) + ' Go' : '');
    gaugeSet('gpu', o.CurrentGpu3D, '');
    $('sysName').textContent = (o.NameCpu || '').replace(/\(R\)|\(TM\)|CPU|Processor|\s+@.*$/gi, '').replace(/\s+/g, ' ').trim();
    $('sysName').title = [o.NameCpu, o.NameGpu, o.NameNetCard].filter(Boolean).join(' · ');
    SYS.down.push(+o.CurrentNetDown || 0); SYS.up.push(+o.CurrentNetUp || 0);
    if (SYS.down.length > 60) { SYS.down.shift(); SYS.up.shift(); }
    $('netDown').textContent = rate(o.CurrentNetDown); $('netUp').textContent = rate(o.CurrentNetUp);
    netDraw();
  };

  /* ---------------- Musique en cours (Lively --system-nowplaying) ---------------- */
  var MU = FJ.mu = { on: false, track: null };
  root.livelyCurrentTrack = function (data) {
    FJ.lively = true;
    var o = J(data, null); MU.track = o;
    var on = !!(o && (o.Title || o.Artist));
    if (on) {
      $('muTitle').textContent = o.Title || ''; $('muArtist').textContent = [o.Artist, o.AlbumTitle].filter(Boolean).join(' · ');
      $('muType').textContent = o.PlaybackType === 'Video' ? 'Vidéo' : o.PlaybackType === 'Music' ? 'Lecture' : '';
      var img = $('muArt');
      if (o.Thumbnail && /^[A-Za-z0-9+/=\s]+$/.test(o.Thumbnail)) { img.src = 'data:image/png;base64,' + o.Thumbnail.replace(/\s+/g, ''); img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }
    }
    if (on !== MU.on) { MU.on = on; panelsVisible(); FJ.relayout(); }
  };

  /* ---------------- Pause (Lively --pause-event, page cachée) ---------------- */
  root.livelyWallpaperPlaybackChanged = function (data) {
    FJ.lively = true;
    var o = J(data, {}) || {};
    FJ.loop.setPaused(!!o.IsPaused);
  };
  FJ.loop.onPause = function (p) { if (!p) { clock(true); resumeRefresh(); } };
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden) { clock(true); resumeRefresh(); } });
  function resumeRefresh() {
    if (WX.data && Date.now() - WX.at > 30 * MIN) FJ.weather().catch(function () { });
    if (Date.now() - NEWS.at > 20 * MIN) FJ.loadNews().catch(function () { });
  }

  /* ---------------- Réglages de Lively (LivelyProperties.json) ----------------
     Lively envoie toutes les valeurs au chargement, puis chaque changement. Une valeur déjà vue
     (identique à la dernière reçue) n'écrase pas ce qui a été changé depuis dans le panneau ⚙ de la page. */
  var LP = lsGet(KEY.lp, {}) || {};
  var cityT = 0, nameT = 0;
  root.livelyPropertyListener = function (name, val) {
    FJ.lively = true;
    if (name === 'openSettings') { FJ.settings(); return; }
    if (name === 'resetKeys') { FJ.keys = FJ.defaultKeys(); FJ.saveKeys(); FJ.toast('Raccourcis par défaut rétablis'); return; }
    var key = JSON.stringify(val);
    if (LP[name] === key) return;
    LP[name] = key; lsSet(KEY.lp, LP);
    switch (name) {
      case 'theme': S.theme = THEMES[+val] || 'cyan'; break;
      case 'layout': S.layout = LAYOUTS[+val] || 'complet'; break;
      case 'city':
        clearTimeout(cityT); var c = String(val || '').trim();
        cityT = setTimeout(function () { if (c === (S.city || '')) return; S.city = c; S.place = null; FJ.save(); WX.data = null; wxRender(); FJ.weather(true).catch(function () { }); }, 1500);
        return;
      case 'windLimit': S.windLimit = clamp(Math.round(+val) || 45, 10, 150); wxRender(); break;
      case 'voiceOn': S.voiceOn = !!val; break;
      case 'voiceEngine': S.tts = +val === 1 ? 'piper' : 'system'; break;
      case 'voiceFx': S.vfx = ['aucun', 'discret', 'majordome', 'ia', 'radio'][+val] || 'ia'; S.vfxo = null; break;
      case 'assistantName': clearTimeout(nameT); nameT = setTimeout(function () { S.name = String(val || '').trim().slice(0, 30); FJ.save(); FJ.apply(); }, 800); return;
      case 'freeLeft': S.free = clamp(Math.round(+val), 0, 900); break;
      case 'textScale': S.scale = clamp(Math.round(+val), 70, 160); break;
      case 'effects': S.fx = clamp(Math.round(+val), 0, 100); break;
      case 'reduceMotion': S.reduce = !!val; break;
      case 'fpsMax': S.fpsMax = clamp(Math.round(+val), 10, 30); break;
      case 'batterySaver': S.saver = !!val; break;
      case 'newsCount': S.newsN = clamp(Math.round(+val), 5, 10); newsRender(); break;
      case 'icsFile':
        if (val) {
          var path = String(val).replace(/\\/g, '/');
          fetch(path.split('/').map(encodeURIComponent).join('/')).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (t) {
            var n = FJ.importIcs(t, path.split('/').pop()); if (n) FJ.toast('Agenda : ' + n + ' événement(s) lu(s)');
          }).catch(function () { FJ.toast('Fichier agenda illisible'); });
        }
        return;
      default: return;
    }
    FJ.save(); FJ.apply();
  };

  /* ---------------- Mise à jour du paquet Lively ----------------
     Le paquet ne se met pas à jour seul : la page compare sa version à celle publiée (une fois par jour). */
  FJ.build = root.FJ_BUILD || { v: '', date: '' };
  FJ.checkUpdate = function () {
    return http(SITE + 'fond-jarvis/fj-version.json?t=' + Math.floor(Date.now() / HOUR), 15000).then(function (t) {
      var o = J(t, null); if (!o || !o.v) throw new Error('version illisible');
      FJ.latest = o; var newer = o.v !== FJ.build.v;
      if (newer) { var seen = lsGet(KEY.maj, ''); if (seen !== o.v) { lsSet(KEY.maj, o.v); FJ.toast('Nouvelle version du fond (' + (o.date || '') + ') : ⚙ › À propos', 7000); } }
      return newer;
    });
  };

  /* ---------------- Raccourcis clavier ---------------- */
  root.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); if (FJ.jarvis) FJ.jarvis.activate(); return; }
    if (e.key === 'Escape') { if (!$('sheet').hidden) { FJ.closeSettings(); e.preventDefault(); } else if (FJ.jarvis) FJ.jarvis.dismiss(); }
  }, true);
  $('gear').innerHTML = FJI.svg('reglages');
  $('gear').onclick = function () { FJ.settings(); };

  /* ---------------- Panneau de réglages ⚙ ---------------- */
  var TABS = [['general', 'Général'], ['affichage', 'Affichage'], ['meteo', 'Météo et actus'], ['raccourcis', 'Raccourcis'], ['agenda', 'Agenda'], ['voix', 'Voix'], ['apropos', 'À propos']];
  var curTab = 'general';
  FJ.settings = function (tab) {
    curTab = tab || curTab;
    var sh = $('sheet'); sh.hidden = false;
    sh.innerHTML = '<div class="sh"><header><h2 id="shTitle">Réglages du fond</h2><button type="button" class="ib" data-x aria-label="Fermer">' + FJI.svg('croix') + '</button></header>' +
      '<div class="tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === curTab) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div class="sh-body" id="shBody"></div><div class="sh-foot"><button type="button" class="btn pri" data-x>Fermer</button></div></div>';
    sh.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = FJ.closeSettings; });
    sh.onclick = function (e) { if (e.target === sh) FJ.closeSettings(); };
    sh.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { FJ.settings(b.dataset.tab); }; });
    tabBody($('shBody'), curTab);
  };
  FJ.closeSettings = function () { var sh = $('sheet'); sh.hidden = true; sh.innerHTML = ''; };
  function fld(label, html, hint) { return '<div class="fld"><span class="lb">' + label + (hint ? '<small>' + hint + '</small>' : '') + '</span><div>' + html + '</div></div>'; }
  function sel(id, opts, v) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function rng(id, a, b, st, v, unit) { return '<div style="display:flex;gap:.7em;align-items:center"><input type="range" id="' + id + '" min="' + a + '" max="' + b + '" step="' + st + '" value="' + v + '"><b class="num" id="' + id + 'V" style="min-width:4em">' + v + (unit || '') + '</b></div>'; }
  function chk(id, label, v, hint) { return '<label class="chk"><input type="checkbox" id="' + id + '"' + (v ? ' checked' : '') + '><span>' + label + (hint ? '<small>' + hint + '</small>' : '') + '</span></label>'; }
  function bind(id, fn, ev) { var e = $(id); if (e) e.addEventListener(ev || (e.type === 'range' || e.type === 'text' ? 'input' : 'change'), function () { fn(e.type === 'checkbox' ? e.checked : e.value, e); }); }
  function rngBind(id, unit, fn) { bind(id, function (v) { $(id + 'V').textContent = v + (unit || ''); fn(+v); }); }
  function setS(k, v, what) { S[k] = v; FJ.save(); FJ.apply(what); }
  function tabBody(B, tab) {
    var h = '';
    if (tab === 'general') {
      h += fld('Nom de l\'assistant', '<input type="text" id="sName" maxlength="30" value="' + esc(S.name) + '" placeholder="' + esc(MJS.name || 'Majordome') + '">', 'Vide : celui de Majordome' + (MJS.name ? ' (« ' + esc(MJS.name) + ' »)' : ' (« Majordome »)') + '.');
      h += fld('Disposition', sel('sLayout', [['complet', 'Complet'], ['epure', 'Épuré (horloge, sphère, raccourcis)'], ['sphere', 'Sphère seule']], S.layout));
      h += fld('Thème', sel('sTheme', [['cyan', 'Cyan'], ['bleu', 'Bleu'], ['vert', 'Vert'], ['ambre', 'Ambre'], ['rouge', 'Rouge']], S.theme));
      h += '<h3>Panneaux affichés (disposition Complet)</h3>';
      [['clock', 'Horloge'], ['wx', 'Météo'], ['agenda', 'Agenda (s\'il y a des rendez-vous)'], ['sys', 'Système et batterie (si disponibles)'], ['news', 'Actualités'], ['music', 'Musique en cours (Lively)']].forEach(function (p) { h += chk('sP_' + p[0], p[1], S.panels[p[0]]); });
      B.innerHTML = h;
      bind('sName', function (v) { setS('name', v.trim().slice(0, 30), 'quiet'); });
      bind('sLayout', function (v) { setS('layout', v); });
      bind('sTheme', function (v) { setS('theme', v); FJ.hud.redrawStatic(); });
      ['clock', 'wx', 'agenda', 'sys', 'news', 'music'].forEach(function (k) { bind('sP_' + k, function (v) { S.panels[k] = v; FJ.save(); FJ.apply(); if (k === 'news') newsRender(); }); });
    } else if (tab === 'affichage') {
      h += fld('Zone libre à gauche', rng('sFree', 0, 600, 10, S.free, ' px'), 'Pour ne pas cacher les icônes du bureau (0 = aucune).');
      h += fld('Taille du texte', rng('sScale', 70, 160, 5, S.scale, ' %'));
      h += fld('Intensité des effets', rng('sFx', 0, 100, 5, S.fx, ' %'), 'Lueurs, circuits, impulsions, poussières.');
      h += fld('Images par seconde (maximum)', rng('sFps', 10, 30, 5, S.fpsMax, ''), 'Plafonné à 15 sur batterie si l\'économie est cochée.');
      h += chk('sReduce', 'Réduire les animations', S.reduce, 'Anneaux fixes, pas d\'impulsions ni de poussières ; la sphère réagit encore quand l\'assistant parle.');
      h += chk('sSaver', 'Économie sur batterie (portable)', S.saver, 'Moins d\'images par seconde et de particules quand le portable n\'est pas branché.');
      B.innerHTML = h;
      rngBind('sFree', ' px', function (v) { setS('free', v); });
      rngBind('sScale', ' %', function (v) { setS('scale', v); });
      rngBind('sFx', ' %', function (v) { setS('fx', v); });
      rngBind('sFps', '', function (v) { setS('fpsMax', v); });
      bind('sReduce', function (v) { setS('reduce', v); });
      bind('sSaver', function (v) { setS('saver', v); });
    } else if (tab === 'meteo') {
      h += fld('Ville', '<div style="display:flex;gap:.5em"><input type="text" id="sCity" value="' + esc(S.city || '') + '" placeholder="ex. Marseille"><button type="button" class="btn" id="sCityGo">Valider</button></div>', 'Vide : ' + (FJ.mode === 'suite' && MJS.place ? 'ville de Majordome, sinon ' : '') + 'position détectée une fois.');
      h += '<p class="hint" id="sCityMsg">' + esc(S.place ? 'Lieu actuel : ' + (S.place.name || 'position détectée') + (S.place.admin ? ' (' + S.place.admin + ')' : '') : '') + '</p>';
      h += '<div class="row" style="display:flex;gap:.5em;flex-wrap:wrap"><button type="button" class="btn" id="sLocate">Détecter ma position</button><button type="button" class="btn" id="sWxNow">Actualiser la météo</button></div>';
      h += fld('Seuil de vent (chantier)', rng('sWind', 20, 90, 1, S.windLimit, ' km/h'), 'Rafales au-dessus : affichées en couleur d\'alerte.');
      h += '<h3>Actualités</h3>' + fld('Nombre de titres', rng('sNews', 5, 10, 1, S.newsN, ''), 'franceinfo, actualisé toutes les 20 minutes (moins si la place manque).');
      B.innerHTML = h;
      var go = function () { var v = $('sCity').value.trim(); $('sCityMsg').textContent = v ? 'Recherche…' : ''; S.city = v; S.place = null; FJ.save(); WX.data = null; FJ.weather(true).then(function () { $('sCityMsg').textContent = 'Lieu actuel : ' + (S.place ? (S.place.name || 'position détectée') + (S.place.admin ? ' (' + S.place.admin + ')' : '') : WX.where); }, function () { $('sCityMsg').textContent = WX.err === 'nopos' ? 'Position inconnue : saisissez une ville.' : WX.err; }); };
      $('sCityGo').onclick = go; $('sCity').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      $('sLocate').onclick = function () { $('sCity').value = ''; S.city = ''; S.place = null; MJS.place = null; FJ.save(); go(); };
      $('sWxNow').onclick = function () { FJ.weather(true).catch(function () { }); };
      rngBind('sWind', ' km/h', function (v) { S.windLimit = v; FJ.save(); wxRender(); });
      rngBind('sNews', '', function (v) { S.newsN = v; FJ.save(); newsRender(); });
    } else if (tab === 'raccourcis') keysEditor(B);
    else if (tab === 'agenda') {
      h += '<p class="hint">Source actuelle : <b>' + esc(AG.suite ? 'Agenda de la Suite MAG (même navigateur)' : AG.events && AG.events.length ? (AG.srcName || 'fichier .ics') + ' — ' + AG.events.length + ' événement(s)' : 'aucune') + '</b></p>';
      h += '<p class="hint">' + (FJ.mode === 'suite' ? 'Dans la Suite MAG, le fond lit l\'agenda de l\'appli <b>Agenda</b> (même navigateur, même stockage). Vous pouvez aussi importer un fichier .ics.' : FJ.lively ? 'Dans Lively, le fond a son propre stockage : il ne voit pas l\'agenda de la Suite ouvert dans Edge. Importez un fichier <b>.ics</b> (export d\'Agenda, de Google Agenda, d\'Outlook…), ici ou dans Lively › Personnaliser › « Agenda (.ics) ».' : 'Importez un fichier .ics.') + '</p>';
      h += '<div style="display:flex;gap:.5em;flex-wrap:wrap"><label class="btn pri" style="cursor:pointer">Importer un .ics<input type="file" id="sIcs" accept=".ics,text/calendar" hidden></label><button type="button" class="btn" id="sIcsDel">Oublier le fichier importé</button></div><p class="hint" id="sIcsMsg"></p>';
      B.innerHTML = h;
      $('sIcs').onchange = function (e) { var f = e.target.files[0]; if (!f) return; f.text().then(function (t) { var n = FJ.importIcs(t, f.name); $('sIcsMsg').textContent = n ? n + ' événement(s) importé(s).' : 'Aucun événement trouvé dans ce fichier.'; }); };
      $('sIcsDel').onclick = function () { AG.events = null; lsSet(KEY.ics, null); agendaRender(); $('sIcsMsg').textContent = 'Fichier oublié.'; };
    } else if (tab === 'voix') {
      var vs = (root.speechSynthesis && speechSynthesis.getVoices() || []).filter(function (v) { return /^fr/i.test(v.lang); });
      h += chk('sVoiceOn', 'Réponse à voix haute', S.voiceOn, 'Voix française de Windows, ou voix neuronale Piper hors ligne avec l\'effet « Jarvis ». Les réponses restent écrites.');
      // voix Piper : panneau commun (mj-voix.js) ; adaptateur : S.fx est déjà l'intensité des effets visuels du fond
      var VS = { get tts() { return S.tts; }, set tts(v) { S.tts = v; }, get piperVoice() { return S.piperVoice; }, set piperVoice(v) { S.piperVoice = v; }, get fx() { return S.vfx; }, set fx(v) { S.vfx = v; }, get fxo() { return S.vfxo; }, set fxo(v) { S.vfxo = v; } };
      var vp = FJ.VX && root.MJVoix ? MJVoix.panel(FJ.VX, VS, { btn: 'btn', save: function () { FJ.save(); }, refresh: function () { FJ.settings('voix'); }, preview: function (id) { if (FJ.jarvis) FJ.jarvis.preview(id); },
        systemHtml: fld('Voix du système', sel('sVoice', [['', 'Automatique (première voix française)']].concat(vs.map(function (v) { return [v.name, v.name + (v.localService ? '' : ' (en ligne)')]; })), S.voice)) }) : null;
      h += vp ? '<h3>Voix</h3>' + vp.html : fld('Voix', sel('sVoice', [['', 'Automatique (première voix française)']].concat(vs.map(function (v) { return [v.name, v.name + (v.localService ? '' : ' (en ligne)')]; })), S.voice));
      if (vp && FJ.mode === 'lively') h += '<p class="hint">Dans Lively, le fond a son propre stockage : la voix Piper se télécharge une fois ici (ou se choisit dans les fichiers téléchargés), même si elle est déjà installée dans la Suite.</p>';
      h += fld('Débit', rng('sRate', 0.6, 1.6, 0.1, S.rate, ''));
      h += '<div style="display:flex;gap:.5em"><button type="button" class="btn" id="sTest">Essayer la voix</button></div>';
      h += '<h3>Parler à l\'assistant</h3>';
      if (FJ.mode === 'suite') {
        h += '<p class="hint">Dans la Suite MAG, le bouton micro utilise la reconnaissance <b>hors ligne</b> de Majordome (Vosk). Le modèle vocal (41 Mo) s\'installe une fois dans <b>Majordome › Réglages</b> ; il sert ensuite aussi ici.</p>';
        h += chk('sWake', 'Mot de réveil permanent (« ' + esc(FJ.aiName()) + ' »)', S.wake, 'Désactivé par défaut. Le micro reste ouvert tant que la page est affichée : voyant micro de Windows allumé, batterie consommée en continu.');
        h += '<p class="hint warn">Sur un fond d\'écran toujours affiché, préférez Ctrl+Espace ou le bouton micro.</p>';
      } else {
        h += '<p class="hint">Dans Lively, le fond d\'écran n\'a pas accès au micro (aucune autorisation n\'est prévue par le lecteur de Lively). Tapez vos commandes (Ctrl+Espace, clavier activé dans Lively), ou utilisez le bouton micro : il ouvre <b>Majordome</b> de la Suite MAG, qui écoute hors ligne.</p>';
      }
      B.innerHTML = h;
      if (vp) try { vp.bind(B); } catch (e) { console.warn(e); }
      bind('sVoiceOn', function (v) { setS('voiceOn', v, 'quiet'); });
      bind('sVoice', function (v) { setS('voice', v, 'quiet'); });
      rngBind('sRate', '', function (v) { setS('rate', v, 'quiet'); });
      $('sTest').onclick = function () { if (FJ.jarvis) FJ.jarvis.say('Bonjour, je suis ' + FJ.aiName() + '. Les systèmes sont opérationnels.'); };
      bind('sWake', function (v, el) {
        if (v && !S.wakeOk) {
          if (!root.confirm('Le micro restera ouvert en permanence tant que le fond est affiché (voyant micro, batterie). Activer quand même ?')) { el.checked = false; return; }
          S.wakeOk = true;
        }
        setS('wake', v, 'quiet'); if (FJ.jarvis) FJ.jarvis.applyWake();
      });
    } else if (tab === 'apropos') {
      h += '<p><b>Fond Jarvis</b> · Suite MAG sur PC · ' + (FJ.build.date ? 'version du ' + esc(FJ.build.date.split('-').reverse().join('/')) : '') + ' <small class="hint" style="display:inline">(code ' + esc(FJ.build.v || '–') + ')</small></p>';
      h += '<p class="hint">Ouvert dans : <b>' + (FJ.mode === 'lively' ? 'Lively Wallpaper (paquet .zip)' : FJ.mode === 'suite' ? 'la Suite MAG sur PC (navigateur)' : 'un navigateur') + '</b>' + (FJ.lively && FJ.mode !== 'lively' ? ' — API de Lively détectée' : '') + '.</p>';
      if (FJ.mode === 'lively') h += '<p class="hint" id="sMaj">Recherche de mise à jour…</p><div style="display:flex;gap:.5em;flex-wrap:wrap"><button type="button" class="btn pri" id="sZip">Télécharger la dernière version (.zip)</button><button type="button" class="btn" id="sGuide">Guide d\'installation</button></div>';
      else h += '<p class="hint">Mises à jour : automatiques dans la Suite (service worker). Paquet pour Lively : <code>' + esc(SITE) + 'fond-jarvis/fond-jarvis-lively.zip</code></p><div style="display:flex;gap:.5em;flex-wrap:wrap"><button type="button" class="btn" id="sZip">Télécharger le paquet Lively (.zip)</button><button type="button" class="btn" id="sGuide">Guide d\'installation</button></div>';
      h += '<h3>Ce qu\'une page web ne peut pas faire</h3><p class="hint">Lancer un programme .exe, éteindre ou verrouiller Windows, régler le volume du système. Les raccourcis passent par les adresses web et les protocoles de Windows (ms-settings:, mailto:…), qui ouvrent l\'appli correspondante.</p>';
      h += '<h3>Données</h3><p class="hint">Réglages, raccourcis, notes et listes restent sur cet ordinateur (stockage du navigateur ou de Lively). Réseau : Open-Meteo (météo), franceinfo (titres)' + (FJ.mode === 'lively' ? ', et une fois par jour la date de la dernière version du fond sur GitHub Pages' : '') + '.</p>';
      h += '<p class="hint">Sphère de particules et analyse des commandes : celles de Majordome (Suite MAG). Création originale.</p>';
      B.innerHTML = h;
      $('sZip').onclick = function () { FJ.open(SITE + 'fond-jarvis/fond-jarvis-lively.zip'); };
      $('sGuide').onclick = function () { FJ.open(SITE + 'fond-jarvis/guide.html'); };
      if (FJ.mode === 'lively') FJ.checkUpdate().then(function (n) { var m = $('sMaj'); if (m) m.textContent = n ? 'Nouvelle version disponible (' + (FJ.latest.date || '').split('-').reverse().join('/') + ') : téléchargez-la, puis glissez-la dans Lively (elle remplace l\'ancienne après suppression).' : 'Vous avez la dernière version.'; }, function () { var m = $('sMaj'); if (m) m.textContent = 'Recherche impossible (hors ligne ?).'; });
    }
  }

  /* éditeur de raccourcis */
  function keysEditor(B) {
    var h = '<p class="hint">Cliquez une icône pour la changer. Adresse : une appli de la Suite, un site (https://…) ou un protocole de Windows (ms-settings:…). Lancer un programme .exe n\'est pas possible depuis une page web.</p><div class="kl" id="kl"></div>';
    h += '<h3>Ajouter</h3><div class="fld"><span class="lb">Appli de la Suite</span><div style="display:flex;gap:.5em">' + sel('kSuite', SUITE.map(function (s) { return [s[0], s[1]]; }), 'texte') + '<button type="button" class="btn" id="kAddSuite">Ajouter</button></div></div>';
    h += '<div class="fld"><span class="lb">Raccourci Windows</span><div style="display:flex;gap:.5em">' + sel('kWin', WIN.map(function (w, i) { return [i, w[0] + (w[3] === 'usuel' ? ' (courant)' : w[3] === 'essai' ? ' (à essayer)' : '')]; }), 0) + '<button type="button" class="btn" id="kAddWin">Ajouter</button></div></div>';
    h += '<div class="fld"><span class="lb">Site ou adresse</span><div style="display:grid;grid-template-columns:1fr 1.6fr auto;gap:.5em"><input type="text" id="kName" placeholder="Nom"><input type="text" id="kUrl" placeholder="https://… ou ms-settings:…"><button type="button" class="btn" id="kAdd">Ajouter</button></div></div>';
    h += '<div style="display:flex;gap:.5em;margin-top:.8em"><button type="button" class="btn" id="kReset">Rétablir les raccourcis par défaut</button></div><div id="kIcons"></div>';
    h += '<h3>Protocoles de Windows</h3><table class="ptable"><tr><th>Raccourci</th><th>Adresse</th><th>Statut</th></tr>' + WIN.map(function (w) { return '<tr><td>' + esc(w[0]) + '</td><td><code>' + esc(w[1]) + '</code></td><td>' + (w[3] === 'doc' ? 'documenté (Microsoft)' : w[3] === 'usuel' ? 'courant, non documenté' : 'à essayer') + '</td></tr>'; }).join('') + '</table>';
    B.innerHTML = h;
    var editing = null;
    function list() {
      var kl = $('kl'); kl.innerHTML = '';
      FJ.keys.forEach(function (k, i) {
        var r = doc.createElement('div'); r.className = 'kr';
        r.innerHTML = '<button type="button" class="ib" data-ico title="Changer l\'icône">' + FJI.svg(k.icon || 'etoile') + '</button><input type="text" data-n value="' + esc(k.name) + '" aria-label="Nom"><input type="text" data-u value="' + esc(k.url) + '" aria-label="Adresse"><span class="ops"><button type="button" class="ib" data-up title="Monter"' + (i ? '' : ' disabled') + '>' + FJI.svg('haut') + '</button><button type="button" class="ib" data-dn title="Descendre"' + (i < FJ.keys.length - 1 ? '' : ' disabled') + '>' + FJI.svg('bas') + '</button><button type="button" class="ib" data-rm title="Retirer">' + FJI.svg('croix') + '</button></span>';
        r.querySelector('[data-n]').onchange = function (e) { k.name = e.target.value.trim().slice(0, 24) || k.name; FJ.saveKeys(); };
        r.querySelector('[data-u]').onchange = function (e) { var u = e.target.value.trim(); if (/^\s*javascript:/i.test(u) || !u) { e.target.value = k.url; return; } k.url = u; FJ.saveKeys(); };
        r.querySelector('[data-up]').onclick = function () { FJ.keys.splice(i - 1, 0, FJ.keys.splice(i, 1)[0]); FJ.saveKeys(); list(); };
        r.querySelector('[data-dn]').onclick = function () { FJ.keys.splice(i + 1, 0, FJ.keys.splice(i, 1)[0]); FJ.saveKeys(); list(); };
        r.querySelector('[data-rm]').onclick = function () { FJ.keys.splice(i, 1); FJ.saveKeys(); list(); };
        r.querySelector('[data-ico]').onclick = function () { editing = k; icons(); };
        kl.appendChild(r);
      });
    }
    function icons() {
      var box = $('kIcons'); if (!editing) { box.innerHTML = ''; return; }
      box.innerHTML = '<h3>Icône de « ' + esc(editing.name) + ' »</h3><div class="icos">' + FJI.list.map(function (n) { return '<button type="button" data-i="' + n + '" title="' + n + '" aria-pressed="' + (editing.icon === n) + '">' + FJI.svg(n) + '</button>'; }).join('') + '</div>';
      box.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { editing.icon = b.dataset.i; FJ.saveKeys(); list(); icons(); }; });
      box.scrollIntoView({ block: 'nearest' });
    }
    function add(k) { if (FJ.keys.length >= 24) { FJ.toast('24 raccourcis au plus'); return; } k.id = kid(); FJ.keys.push(k); FJ.saveKeys(); list(); }
    $('kAddSuite').onclick = function () { var id = $('kSuite').value, s = SUITE.filter(function (x) { return x[0] === id; })[0]; add({ name: s[1], url: 'suite:' + id, icon: s[2] }); };
    $('kAddWin').onclick = function () { var w = WIN[+$('kWin').value]; add({ name: w[0], url: w[1], icon: w[2] }); };
    $('kAdd').onclick = function () {
      var n = $('kName').value.trim(), u = $('kUrl').value.trim();
      if (!u || /^\s*javascript:/i.test(u)) { FJ.toast('Adresse manquante'); return; }
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      add({ name: n || u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url: u, icon: /^https?:/.test(u) ? 'web' : 'lien' });
      $('kName').value = $('kUrl').value = '';
    };
    $('kReset').onclick = function () { FJ.keys = FJ.defaultKeys(); FJ.saveKeys(); list(); };
    list();
  }

  /* ---------------- Démarrage ---------------- */
  function start() {
    makeOrb(1100);
    FJ.apply('quiet');
    renderKeys();
    clock(true); clockLoop();
    wxRender(); newsRender(); agendaInit(); batteryUi();
    FJ.weather().catch(function () { });
    FJ.loadNews().catch(function () { });
    setInterval(function () { if (!doc.hidden && !FJ.loop.paused) { FJ.weather().catch(function () { }); } }, 30 * MIN);
    setInterval(function () { if (!doc.hidden && !FJ.loop.paused) { FJ.loadNews().catch(function () { }); } }, 20 * MIN);
    setInterval(agendaRender, 5 * MIN);
    if (FJ.mode === 'lively' && S.updates) { setTimeout(function () { FJ.checkUpdate().catch(function () { }); }, 20000); setInterval(function () { FJ.checkUpdate().catch(function () { }); }, DAY); }
    // Suite : mise à jour du fond appliquée d'elle-même (pas de bandeau sur un fond d'écran)
    var M = root.MAGPC;
    if (M && M.sw) {
      M.sw.shown = true;
      M.sw.ready.then(function (reg) {
        if (!reg) return;
        var apply = function () { if (reg.waiting && navigator.serviceWorker.controller) { M.sw.reloading = true; reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } };
        apply();
        reg.addEventListener('updatefound', function () { var w = reg.installing; if (w) w.addEventListener('statechange', function () { if (w.state === 'installed') apply(); }); });
      });
    }
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { FJ.relayout(); });
    setTimeout(FJ.relayout, 300);
  }
  FJ.start = start;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})(window);
