/* COPIE GÉNÉRÉE par pc/build-pc.py depuis zepp/cadrans/cadran.js : ne pas modifier ici. */
/* =====================================================================
   Cadrans pour Amazfit T-Rex 3 (480 × 480 rond, Zepp OS) : réglages, mise en page et dessin, en un seul fichier.
   Le même code sert :
     - à l'appli « Atelier de cadrans » (aperçu en direct, applis/www-cadrans) ;
     - à la fabrication des images du cadran (outils/fabriquer.mjs, dans Chromium, sur le robot GitHub).
   L'aperçu est donc composé avec les mêmes images que celles de la montre.

   CADRAN.DEFAUT, CADRAN.CHOIX       réglages par défaut et listes de choix (pour l'éditeur)
   CADRAN.polices(base)              charge les polices (FontFace) depuis le dossier « base »
   CADRAN.paquet(cfg)                → { spec, images: { chemin: canvas } } : widgets de la montre et images
   CADRAN.apercu(canvas, cfg, opt)   dessine le cadran tel qu'il apparaîtra (opt.aod, opt.date, opt.valeurs)
   ===================================================================== */
(function (root) {
  'use strict';
  var W = 480, CX = 240, CY = 240;

  var POLICES = {
    fine: { nom: 'Fine', fam: 'CadFine', fichier: 'Inter-Thin.otf', echelle: 1 },
    legere: { nom: 'Légère', fam: 'CadLegere', fichier: 'Inter-Light.otf', echelle: 1 },
    moderne: { nom: 'Moderne', fam: 'CadModerne', fichier: 'Poppins-Medium.ttf', echelle: .92 },
    grasse: { nom: 'Grasse', fam: 'CadGrasse', fichier: 'Inter-Black.otf', echelle: .95 },
    sport: { nom: 'Sport', fam: 'CadSport', fichier: 'texgyreheroscn-bold.otf', echelle: 1.12 },
    militaire: { nom: 'Militaire', fam: 'CadMili', fichier: 'DejaVuSansMono-Bold.ttf', echelle: .9 },
    classique: { nom: 'Classique', fam: 'CadClassique', fichier: 'Lora-Variable.ttf', echelle: .98 }
  };
  var PETITE = { fam: 'CadPetite', fichier: 'Inter-SemiBold.otf' };

  /* Ce qu'on peut afficher dans les cases : donnée de la montre (data_type), étiquette, unité, exemple pour l'aperçu */
  var INFOS = {
    aucun: { n: 'Rien' },
    pas: { n: 'Pas', type: 'STEP', lab: 'PAS', ic: 'pas', ex: 8432 },
    coeur: { n: 'Cœur', type: 'HEART', lab: 'BPM', ic: 'coeur', ex: 72 },
    batterie: { n: 'Batterie', type: 'BATTERY', lab: 'BATTERIE', unite: 'pct', ic: 'batterie', ex: 86 },
    meteo: { n: 'Météo', type: 'WEATHER_CURRENT', lab: 'MÉTÉO', unite: 'deg', ic: 'meteo', ex: 14 },
    calories: { n: 'Calories', type: 'CAL', lab: 'KCAL', ic: 'flamme', ex: 412 },
    distance: { n: 'Distance', type: 'DISTANCE', lab: 'KM', ic: 'route', ex: '5.4', point: 'point' },
    lever: { n: 'Lever du soleil', type: 'SUN_RISE', lab: 'LEVER', ic: 'lever', ex: '07:42', point: 'dp' },
    coucher: { n: 'Coucher du soleil', type: 'SUN_SET', lab: 'COUCHER', ic: 'coucher', ex: '17:28', point: 'dp' },
    altitude: { n: 'Altitude', type: 'ALTITUDE', lab: 'ALT. M', ic: 'montagne', ex: 412 },
    pression: { n: 'Pression', type: 'ALTIMETER', lab: 'HPA', ic: 'jauge', ex: 1013 },
    vent: { n: 'Vent', type: 'WIND', lab: 'VENT', ic: 'vent', ex: 3 }
  };
  var FONDS = { uni: 'Uni', degrade: 'Dégradé', radial: 'Halo', carbone: 'Carbone', grille: 'Grille', hud: 'HUD', camo: 'Camouflage' };
  var ANNEAUX = { graduations: 'Graduations', chiffres: 'Chiffres', batterie: 'Batterie', pas: 'Pas (objectif)', aucun: 'Aucun' };
  var AIGUILLES = { fines: 'Fines', epees: 'Épées', larges: 'Larges' };
  var JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
  var JOURS3 = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  var MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
  var MOIS4 = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'];
  /* Icône météo : code Zepp OS 0 à 28 → dessin */
  var METEO = ['nuages', 'averses', 'neige', 'soleil', 'couvert', 'pluie', 'neige', 'pluie', 'neige', 'neige', 'pluie', 'sable', 'neige', 'brouillard', 'brouillard', 'orage', 'neige', 'sable', 'pluie', 'neige', 'orage', 'pluie', 'sable', 'sable', 'pluie', 'inconnu', 'nuages_nuit', 'averses', 'nuit'];

  var DEFAUT = {
    nom: 'Mon cadran', fond: 'radial', c1: '#000000', c2: '#10283a', accent: '#46d9c2', texte: '#f2fbff', doux: '#7e98a6',
    heure: 'numerique', police: 'legere', taille: 'grande', secondes: false, aiguilles: 'epees',
    date: true, anneau: 'graduations', infos: ['meteo', 'coeur', 'pas', 'batterie'], aod: 'heure_date'
  };
  var CHOIX = { POLICES: POLICES, INFOS: INFOS, FONDS: FONDS, ANNEAUX: ANNEAUX, AIGUILLES: AIGUILLES,
    HEURE: { numerique: 'Numérique', analogique: 'À aiguilles', mixte: 'Aiguilles + heure' }, TAILLE: { grande: 'Grande', moyenne: 'Moyenne' },
    AOD: { heure_date: 'Heure et date', heure: 'Heure seule' } };

  function norm(c) {
    var o = {}, k; for (k in DEFAUT) o[k] = DEFAUT[k];
    c = c || {}; for (k in c) if (c[k] != null && k in DEFAUT) o[k] = c[k];
    if (!POLICES[o.police]) o.police = DEFAUT.police;
    if (!FONDS[o.fond]) o.fond = DEFAUT.fond;
    if (!ANNEAUX[o.anneau]) o.anneau = DEFAUT.anneau;
    if (!AIGUILLES[o.aiguilles]) o.aiguilles = DEFAUT.aiguilles;
    if (!CHOIX.HEURE[o.heure]) o.heure = 'numerique';
    o.infos = (Array.isArray(o.infos) ? o.infos : DEFAUT.infos).slice(0, 4);
    while (o.infos.length < 4) o.infos.push('aucun');
    o.infos = o.infos.map(function (x) { return INFOS[x] ? x : 'aucun'; });
    ['c1', 'c2', 'accent', 'texte', 'doux'].forEach(function (k) { if (!/^#[0-9a-f]{6}$/i.test(o[k])) o[k] = DEFAUT[k]; });
    o.nom = String(o.nom || 'Mon cadran').slice(0, 24);
    return o;
  }

  /* ---------------- outils de dessin ---------------- */
  function toile(w, h) {
    if (root.document) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (root.OffscreenCanvas) return new root.OffscreenCanvas(w, h);
    throw new Error('Pas de canvas');
  }
  var MES = null;
  function mesure(fam, taille, t, esp) {
    if (!MES) MES = toile(8, 8).getContext('2d');
    MES.font = taille + 'px "' + fam + '"';
    return MES.measureText(t).width + (esp || 0) * Math.max(0, t.length - 1);
  }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + (a == null ? 1 : a) + ')'; }
  function mix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), r = function (s) { return Math.round(((x >> s & 255) * (1 - t)) + ((y >> s & 255) * t)); };
    return '#' + [16, 8, 0].map(function (s) { return ('0' + r(s).toString(16)).slice(-2); }).join('');
  }
  function texte(g, t, x, y, fam, taille, coul, align, esp) {
    g.font = taille + 'px "' + fam + '"'; g.fillStyle = coul; g.textBaseline = 'alphabetic';
    esp = esp || 0;
    if (!esp) { g.textAlign = align || 'left'; g.fillText(t, x, y); return; }
    var w = mesure(fam, taille, t, esp), x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.textAlign = 'left';
    for (var i = 0; i < t.length; i++) { g.fillText(t[i], x0, y); x0 += mesure(fam, taille, t[i]) + esp; }
  }
  /* image d'un texte dans une boîte (chiffres, jours, mois) : ligne de base calée sur la hauteur des majuscules */
  function boite(w, h, t, fam, taille, coul, align, esp) {
    var c = toile(w, h), g = c.getContext('2d');
    var base = Math.round(h / 2 + taille * .36);
    texte(g, t, align === 'center' ? w / 2 : align === 'right' ? w - 1 : 1, base, fam, taille, coul, align, esp);
    return c;
  }

  /* ---------------- icônes (traits) ---------------- */
  function icone(g, nom, cx, cy, s, coul) {
    g.save(); g.translate(cx, cy); g.scale(s / 24, s / 24); g.translate(-12, -12);
    g.strokeStyle = coul; g.fillStyle = coul; g.lineWidth = 1.9; g.lineCap = 'round'; g.lineJoin = 'round';
    var P = function (d) { g.stroke(new Path2D(d)); }, F = function (d) { g.fill(new Path2D(d)); };
    switch (nom) {
      case 'pas': F('M8.5 3.5c1.6 0 2.6 1.9 2.4 4.3-.2 2.2-1 3.4-2.6 3.4-1.4 0-2.3-1.3-2.4-3.2C5.8 5.5 6.9 3.5 8.5 3.5zM6.6 12.6h3.8l-.3 2.3c-.2 1.2-1 1.9-1.9 1.9-1 0-1.7-.8-1.7-2zM15.5 7.5c1.6 0 2.7 2 2.5 4.4-.1 1.9-1 3.2-2.4 3.2-1.6 0-2.4-1.2-2.6-3.4-.2-2.4.9-4.2 2.5-4.2zM13.6 16.6h3.8l.1 1.3c0 1.2-.7 2-1.7 2-.9 0-1.7-.7-1.9-1.9z'); break;
      case 'coeur': F('M12 20.5s-7.5-4.4-8.6-9.6C2.7 7.5 4.8 4.5 7.8 4.5c1.8 0 3.2 1 4.2 2.4 1-1.4 2.4-2.4 4.2-2.4 3 0 5.1 3 4.4 6.4-1.1 5.2-8.6 9.6-8.6 9.6z'); break;
      case 'batterie': P('M3.5 8h15a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 2 14.5v-5A1.5 1.5 0 0 1 3.5 8zM22 10.5v3'); F('M4.5 10h9v4h-9z'); break;
      case 'meteo': P('M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z'); break;
      case 'flamme': P('M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.8-2.8-5.6-3.8-9.5-1.8 1.9-2.6 3.8-2.6 5.6-1-1-1.8-2-1.8-3.8C7.6 9.6 5.5 12.4 5.5 14.5A6.5 6.5 0 0 0 12 21z'); break;
      case 'route': P('M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z'); g.beginPath(); g.arc(12, 11, 2.2, 0, 7); g.stroke(); break;
      case 'lever': P('M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 3v5M9.5 5.5 12 3l2.5 2.5M4.2 11.2l1.6 1.2M19.8 11.2l-1.6 1.2'); break;
      case 'coucher': P('M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 3v5M9.5 5.5 12 8l2.5-2.5M4.2 11.2l1.6 1.2M19.8 11.2l-1.6 1.2'); break;
      case 'montagne': P('M2.5 19.5 9 8l3.5 6 2.5-4 6.5 9.5z'); P('M7.3 11 9 12.3 10.5 11'); break;
      case 'jauge': P('M4 17a8.5 8.5 0 1 1 16 0'); P('M12 16.5 15.5 10'); g.beginPath(); g.arc(12, 16.5, 1.4, 0, 7); g.fill(); break;
      case 'vent': P('M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7'); break;
    }
    g.restore();
  }
  /* icônes météo (IMG_LEVEL : une image par code Zepp OS) */
  function meteoIcone(genre, s, coul, coul2) {
    var c = toile(s, s), g = c.getContext('2d');
    g.save(); g.scale(s / 48, s / 48); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2.6; g.strokeStyle = coul; g.fillStyle = coul;
    function soleil(x, y, r, rayons) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); if (rayons) for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; g.beginPath(); g.moveTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4)); g.lineTo(x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8)); g.stroke(); } }
    function lune(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x + r * .55, y - r * .35, r * .85, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    function nuage(dy, plein) { var p = new Path2D('M13 ' + (34 + dy) + 'h22a7 7 0 0 0 .8-13.9A10 10 0 0 0 16.6 ' + (22 + dy) + 'a6.2 6.2 0 0 0-3.6 12z'); if (plein) { g.fillStyle = coul2; g.fill(p); g.fillStyle = coul; } g.stroke(p); }
    function traits(n, y0, lg) { for (var i = 0; i < n; i++) { var x = 16 + i * 8; g.beginPath(); g.moveTo(x, y0); g.lineTo(x - 3, y0 + lg); g.stroke(); } }
    function flocons(n, y0) { for (var i = 0; i < n; i++) { g.beginPath(); g.arc(16 + i * 8, y0 + (i % 2) * 4, 2, 0, 7); g.fill(); } }
    switch (genre) {
      case 'soleil': soleil(24, 24, 8, true); break;
      case 'nuit': lune(24, 24, 11); break;
      case 'nuages': soleil(17, 17, 6, true); nuage(4, true); break;
      case 'nuages_nuit': lune(17, 16, 7); nuage(4, true); break;
      case 'couvert': nuage(-2, true); break;
      case 'pluie': nuage(-6, true); traits(4, 33, 7); break;
      case 'averses': soleil(16, 13, 5, false); nuage(-6, true); traits(3, 33, 6); break;
      case 'neige': nuage(-6, true); flocons(4, 35); break;
      case 'orage': nuage(-6, true); g.beginPath(); g.moveTo(25, 30); g.lineTo(20, 38); g.lineTo(26, 38); g.lineTo(21, 46); g.stroke(); break;
      case 'brouillard': [16, 23, 30, 37].forEach(function (y, i) { g.beginPath(); g.moveTo(8 + (i % 2) * 4, y); g.lineTo(40 - (i % 2) * 4, y); g.stroke(); }); break;
      case 'sable': [18, 26, 34].forEach(function (y, i) { g.beginPath(); g.moveTo(8, y); g.bezierCurveTo(18, y - 6, 26, y + 6, 40 - i * 4, y); g.stroke(); }); break;
      default: g.font = '700 26px "' + PETITE.fam + '"'; g.textAlign = 'center'; g.fillText('?', 24, 33);
    }
    g.restore(); return c;
  }

  /* ---------------- mise en page ---------------- */
  function police(cfg) { return POLICES[cfg.police]; }
  function policeInfos(cfg) { return cfg.police === 'militaire' ? POLICES.militaire : cfg.police === 'sport' ? POLICES.sport : cfg.police === 'classique' ? POLICES.classique : PETITE; }
  function slotsPos(cfg) {
    if (cfg.heure === 'numerique') {
      var g = cfg.taille === 'grande';
      return { w: 116, h: 78, ic: 24, val: 30, lab: 12, pos: [[CX - 80, g ? 62 : 70], [CX + 80, g ? 62 : 70], [CX - 80, g ? 302 : 294], [CX + 80, g ? 302 : 294]] };
    }
    // aiguilles : quatre petits cadrans (haut, gauche, droite, bas) ; en « mixte », l'heure numérique prend la place du haut
    return { w: 92, h: 70, ic: 20, val: 25, lab: 10, pos: [[CX, 108], [CX - 96, 205], [CX + 96, 205], [CX, 318]] };
  }

  /* Tout le cadran : liste des widgets (dans l'ordre de création sur la montre) et images à fabriquer */
  function paquet(c) {
    var cfg = norm(c), P = police(cfg), PI = policeInfos(cfg), IM = {}, spec = { w: [], nom: cfg.nom };
    var add = function (w) { spec.w.push(w); return w; };
    var put = function (chemin, canvas) { IM[chemin] = canvas; return 'images/' + chemin; };
    var analog = cfg.heure !== 'numerique';
    var aodDim = mix(cfg.doux, '#000000', .25);

    // -------- fonds : la partie fixe (anneau, icônes, étiquettes) est dessinée dans l'image de fond
    put('fond.png', fond(cfg, false));
    put('fond_aod.png', fond(cfg, true));
    add({ k: 'img', x: 0, y: 0, w: W, h: W, src: 'images/fond.png' });
    add({ k: 'img', x: 0, y: 0, w: W, h: W, src: 'images/fond_aod.png', aod: 1 });

    // -------- anneau de progression (batterie ou pas) : IMG_LEVEL, 11 images
    if (cfg.anneau === 'batterie' || cfg.anneau === 'pas') {
      for (var a = 0; a <= 10; a++) put('anneau/' + a + '.png', anneau(cfg, a / 10));
      add({ k: 'level', type: cfg.anneau === 'batterie' ? 'BATTERY' : 'STEP', x: 0, y: 0, w: W, h: W, dossier: 'anneau', n: 11 });
    }

    // -------- chiffres des infos
    var S = slotsPos(cfg), fv = Math.round(S.val * (PI.echelle || 1));
    var cwI = Math.ceil(Math.max.apply(null, '0123456789'.split('').map(function (d) { return mesure(PI.fam, fv, d); }))) + 1;
    var hI = Math.round(S.val * 1.08);
    for (var d = 0; d <= 9; d++) put('infos/' + d + '.png', boite(cwI, hI, String(d), PI.fam, fv, cfg.texte, 'center'));
    put('infos/moins.png', boite(Math.round(cwI * .7), hI, '-', PI.fam, fv, cfg.texte, 'center'));
    put('infos/invalide.png', boite(cwI * 2, hI, '--', PI.fam, fv, cfg.doux, 'center'));
    put('infos/point.png', boite(Math.round(cwI * .45), hI, '.', PI.fam, fv, cfg.texte, 'center'));
    put('infos/dp.png', boite(Math.round(cwI * .5), hI, ':', PI.fam, fv, cfg.texte, 'center'));
    put('infos/pct.png', boite(Math.round(fv * .9), hI, '%', PI.fam, Math.round(fv * .7), cfg.doux, 'left'));
    put('infos/deg.png', boite(Math.round(fv * .55), hI, '°', PI.fam, fv, cfg.texte, 'left'));
    spec.infos = { cw: cwI, h: hI };

    // -------- cases d'infos
    var meteoFaite = false;
    cfg.infos.forEach(function (id, i) {
      var inf = INFOS[id]; if (!inf || !inf.type) return;
      if (cfg.heure === 'mixte' && i === 0) return;     // place prise par l'heure numérique
      var p = S.pos[i], x = Math.round(p[0] - S.w / 2), y = p[1];
      var b = { x: x, y: y + S.ic + 4, w: S.w, h: hI };
      if (id === 'meteo') {
        if (!meteoFaite) { for (var m = 0; m < 29; m++) put('meteo/' + m + '.png', meteoIcone(METEO[m], 32, cfg.accent, mix(cfg.c1, cfg.accent, .12))); meteoFaite = true; }
        add({ k: 'level', type: 'WEATHER', x: Math.round(p[0] - 16), y: y - 4, w: 32, h: 32, dossier: 'meteo', n: 29 });
      }
      add({ k: 'num', type: inf.type, x: b.x, y: b.y, w: b.w, h: b.h, align: 'centre', unite: inf.unite || null, point: inf.point || null, ex: inf.ex });
      add({ k: 'click', type: inf.type, x: x, y: y - 4, w: S.w, h: S.h });
    });

    // -------- heure
    if (cfg.heure === 'numerique' || cfg.heure === 'mixte') {
      var gr = cfg.heure === 'mixte' ? 46 : cfg.taille === 'grande' ? 118 : 92, ft = Math.round(gr * P.echelle);
      var cw = Math.ceil(Math.max.apply(null, '0123456789'.split('').map(function (d) { return mesure(P.fam, ft, d); }))) + 2;
      var hT = Math.round(gr * .82), dpw = Math.max(10, Math.round(gr * .3));
      var y0 = cfg.heure === 'mixte' ? 112 : cfg.taille === 'grande' ? 150 : 162;
      var x0 = Math.round(CX - (4 * cw + dpw) / 2);
      ['heure', 'heure_aod'].forEach(function (dos, k) {
        var col = k ? aodDim : cfg.texte;
        for (var d2 = 0; d2 <= 9; d2++) put(dos + '/' + d2 + '.png', boite(cw, hT, String(d2), P.fam, ft, col, 'center'));
        put(dos + '/dp.png', boite(dpw, hT, ':', P.fam, ft, k ? aodDim : cfg.accent, 'center'));
      });
      add({ k: 'time', x: x0, y: y0, dossier: 'heure', cw: cw, dpw: dpw, h: hT });
      add({ k: 'time', x: x0, y: y0, dossier: 'heure_aod', cw: cw, dpw: dpw, h: hT, aod: 1 });
      spec.heure = { x: x0, y: y0, w: 4 * cw + dpw, h: hT };
    }
    // -------- date
    if (cfg.date) {
      var dA = analog, fs = dA ? 16 : 21, hD = dA ? 24 : 30;
      var esp = dA ? 1 : 2, semL = dA ? JOURS3 : JOURS, moisL = dA ? MOIS4 : MOIS;
      var larg = function (l) { return Math.ceil(Math.max.apply(null, l.map(function (t) { return mesure(PETITE.fam, fs, t, esp); }))) + 4; };
      var wW = larg(semL), wD = dA ? 34 : 50, wM = larg(moisL), gap = 6;
      var yD = dA ? 268 : (spec.heure.y + spec.heure.h + 10);
      var xD = Math.round(CX - wD / 2), xW = xD - gap - wW, xM = xD + wD + gap;
      ['', '_aod'].forEach(function (suf, k) {
        if (k && cfg.aod !== 'heure_date') return;
        var col = k ? aodDim : cfg.doux, colJ = k ? aodDim : cfg.accent, sem = dA ? JOURS3 : JOURS, mois = dA ? MOIS4 : MOIS;
        sem.forEach(function (j, i) { put('semaine' + suf + '/' + i + '.png', boite(wW, hD, j, PETITE.fam, fs, col, 'right', dA ? 1 : 2)); });
        for (var n = 1; n <= 31; n++) put('jour' + suf + '/' + (n - 1) + '.png', boite(wD, hD, n === 1 && !dA ? '1ER' : String(n), PETITE.fam, fs + 1, colJ, 'center'));
        mois.forEach(function (j, i) { put('mois' + suf + '/' + i + '.png', boite(wM, hD, j, PETITE.fam, fs, col, 'left', dA ? 1 : 2)); });
        add({ k: 'date', aod: k ? 1 : 0, suf: suf, sem: { x: xW, y: yD }, jour: { x: xD, y: yD }, mois: { x: xM, y: yD }, w: [wW, wD, wM], h: hD });
      });
    }
    // -------- aiguilles
    if (analog) {
      var H = aiguille(cfg, 'h', false), M = aiguille(cfg, 'm', false), Sd = cfg.secondes ? aiguille(cfg, 's', false) : null;
      put('aiguilles/h.png', H.c); put('aiguilles/m.png', M.c); if (Sd) put('aiguilles/s.png', Sd.c);
      var Ha = aiguille(cfg, 'h', true), Ma = aiguille(cfg, 'm', true);
      put('aiguilles/h_aod.png', Ha.c); put('aiguilles/m_aod.png', Ma.c);
      put('aiguilles/centre.png', centre(cfg, false)); put('aiguilles/centre_aod.png', centre(cfg, true));
      add({ k: 'pointer', h: { src: 'images/aiguilles/h.png', px: H.px, py: H.py }, m: { src: 'images/aiguilles/m.png', px: M.px, py: M.py },
        s: Sd ? { src: 'images/aiguilles/s.png', px: Sd.px, py: Sd.py } : null });
      add({ k: 'img', x: CX - 12, y: CY - 12, w: 24, h: 24, src: 'images/aiguilles/centre.png' });
      add({ k: 'pointer', aod: 1, h: { src: 'images/aiguilles/h_aod.png', px: Ha.px, py: Ha.py }, m: { src: 'images/aiguilles/m_aod.png', px: Ma.px, py: Ma.py }, s: null });
      add({ k: 'img', x: CX - 12, y: CY - 12, w: 24, h: 24, src: 'images/aiguilles/centre_aod.png', aod: 1 });
    }
    // zone tactile transparente (IMG_CLICK demande une image)
    put('zone.png', toile(4, 4));
    spec.cfg = cfg;
    return { spec: spec, images: IM };
  }

  /* ---------------- fonds ---------------- */
  function fond(cfg, aod) {
    var c = toile(W, W), g = c.getContext('2d');
    g.save(); g.beginPath(); g.arc(CX, CY, CX, 0, 7); g.clip();
    if (aod) { g.fillStyle = '#000'; g.fillRect(0, 0, W, W); }
    else {
      var A = cfg.c1, B = cfg.c2, gr;
      if (cfg.fond === 'degrade') { gr = g.createLinearGradient(0, 0, 0, W); gr.addColorStop(0, B); gr.addColorStop(1, A); g.fillStyle = gr; }
      else if (cfg.fond === 'radial' || cfg.fond === 'hud') { gr = g.createRadialGradient(CX, CY * .9, 10, CX, CY, CX); gr.addColorStop(0, B); gr.addColorStop(1, A); g.fillStyle = gr; }
      else g.fillStyle = A;
      g.fillRect(0, 0, W, W);
      if (cfg.fond === 'carbone') {
        for (var y = 0; y < W; y += 8) for (var x = 0; x < W; x += 8) {
          var s = ((x / 8 + y / 8) % 2) ? .07 : .02;
          g.fillStyle = rgba(B, 1); g.globalAlpha = .55; g.fillRect(x, y, 8, 4); g.globalAlpha = 1;
          g.fillStyle = 'rgba(255,255,255,' + s + ')'; g.fillRect(x + ((y / 8) % 2 ? 0 : 4), y, 4, 8);
        }
      }
      if (cfg.fond === 'grille' || cfg.fond === 'hud') {
        g.strokeStyle = rgba(cfg.accent, cfg.fond === 'hud' ? .06 : .09); g.lineWidth = 1;
        for (var k = 0; k <= W; k += 24) { g.beginPath(); g.moveTo(k + .5, 0); g.lineTo(k + .5, W); g.moveTo(0, k + .5); g.lineTo(W, k + .5); g.stroke(); }
      }
      if (cfg.fond === 'hud') {
        g.strokeStyle = rgba(cfg.accent, .22); g.lineWidth = 1.2;
        [70, 140, 200].forEach(function (r, i) { g.setLineDash(i === 1 ? [2, 6] : []); g.beginPath(); g.arc(CX, CY, r, 0, 7); g.stroke(); });
        g.setLineDash([]);
        for (var q = 0; q < 4; q++) { g.beginPath(); g.arc(CX, CY, 212, q * Math.PI / 2 + .25, q * Math.PI / 2 + 1.3); g.strokeStyle = rgba(cfg.accent, .4); g.lineWidth = 2; g.stroke(); }
      }
      if (cfg.fond === 'camo') {
        var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        var cols = [B, mix(A, B, .5), mix(B, '#000000', .35)];
        for (var t = 0; t < 70; t++) {
          g.fillStyle = cols[t % 3]; g.beginPath();
          var bx = rnd() * W, by = rnd() * W, r0 = 18 + rnd() * 34;
          for (var a2 = 0; a2 <= 12; a2++) { var an = a2 / 12 * Math.PI * 2, rr = r0 * (.6 + rnd() * .6); g[a2 ? 'lineTo' : 'moveTo'](bx + Math.cos(an) * rr * 1.4, by + Math.sin(an) * rr); }
          g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, W, W);
      }
    }
    // anneau fixe
    var acc = aod ? mix(cfg.doux, '#000', .5) : cfg.accent, fin = aod ? mix(cfg.doux, '#000', .65) : rgba(cfg.texte, .5);
    var analog = cfg.heure !== 'numerique';
    if (cfg.anneau === 'graduations' || (analog && cfg.anneau !== 'chiffres')) {
      for (var i = 0; i < 60; i++) {
        if (aod && i % 5) continue;
        var an2 = i * Math.PI / 30, maj = i % 5 === 0, r1 = 236, r2 = maj ? 220 : 229;
        if (cfg.anneau === 'batterie' || cfg.anneau === 'pas') { r1 = 214; r2 = maj ? 202 : 208; }
        g.strokeStyle = maj ? acc : fin; g.lineWidth = maj ? 3 : 1.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(CX + Math.sin(an2) * r1, CY - Math.cos(an2) * r1); g.lineTo(CX + Math.sin(an2) * r2, CY - Math.cos(an2) * r2); g.stroke();
      }
    }
    if (cfg.anneau === 'chiffres') {
      var PF = POLICES[cfg.police];
      for (var h = 1; h <= 12; h++) {
        if (!analog && h % 3) continue;
        if (aod && h % 3) continue;
        var an3 = h * Math.PI / 6, rr2 = analog ? 205 : 214, ts = analog ? (h % 3 ? 22 : 30) : 24;
        texte(g, String(h), CX + Math.sin(an3) * rr2, CY - Math.cos(an3) * rr2 + ts * .36, PF.fam, Math.round(ts * PF.echelle), h % 3 ? fin : acc, 'center');
      }
      if (!aod) for (var j = 0; j < 60; j++) { if (j % 5 === 0) continue; var an4 = j * Math.PI / 30; g.fillStyle = fin; g.beginPath(); g.arc(CX + Math.sin(an4) * 232, CY - Math.cos(an4) * 232, 1.3, 0, 7); g.fill(); }
    }
    // icônes et étiquettes des cases (écran allumé seulement)
    if (!aod) {
      var S = slotsPos(cfg);
      cfg.infos.forEach(function (id, i) {
        var inf = INFOS[id]; if (!inf || !inf.type) return;
        if (cfg.heure === 'mixte' && i === 0) return;
        var p = S.pos[i];
        if (id !== 'meteo') icone(g, inf.ic, p[0], p[1] + S.ic / 2 - 2, S.ic, cfg.accent);
        texte(g, inf.lab, p[0], p[1] + S.ic + 4 + Math.round(S.val * 1.08) + S.lab + 1, PETITE.fam, S.lab, cfg.doux, 'center', 1.5);
      });
      if (analog) { g.strokeStyle = rgba(cfg.accent, .25); g.lineWidth = 1; S.pos.forEach(function (p, i) { if (cfg.infos[i] === 'aucun' || (cfg.heure === 'mixte' && i === 0)) return; g.beginPath(); g.arc(p[0], p[1] + S.h / 2 - 4, 44, 0, 7); g.stroke(); }); }
    }
    g.restore();
    return c;
  }
  function anneau(cfg, f) {
    var c = toile(W, W), g = c.getContext('2d');
    g.lineCap = 'round'; g.lineWidth = 9;
    g.strokeStyle = rgba(cfg.accent, .16); g.beginPath(); g.arc(CX, CY, 228, 0, 7); g.stroke();
    if (f > 0) { g.strokeStyle = cfg.accent; g.beginPath(); g.arc(CX, CY, 228, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2 - (f >= 1 ? 0 : .02)); g.stroke(); }
    return c;
  }
  /* aiguille dessinée vers le haut ; px, py : point de rotation dans l'image */
  function aiguille(cfg, quoi, aod) {
    var L = quoi === 'h' ? 112 : quoi === 's' ? 196 : 178, T = quoi === 's' ? 42 : 20, st = cfg.aiguilles;
    var lw = quoi === 's' ? 3 : st === 'larges' ? (quoi === 'h' ? 16 : 12) : st === 'epees' ? (quoi === 'h' ? 14 : 11) : (quoi === 'h' ? 8 : 6);
    var w = Math.max(16, lw + 8), h = L + T, c = toile(w, h), g = c.getContext('2d'), cx = w / 2, py = L;
    var col = quoi === 's' ? cfg.accent : aod ? mix(cfg.doux, '#000', .2) : cfg.texte;
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (quoi === 's') { g.strokeStyle = col; g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx, py + T - 4); g.lineTo(cx, 4); g.stroke(); g.beginPath(); g.arc(cx, py, 5, 0, 7); g.fillStyle = col; g.fill(); }
    else if (st === 'fines') { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(cx, py + T - lw); g.lineTo(cx, lw); g.stroke(); }
    else {
      var p = new Path2D();
      if (st === 'epees') { p.moveTo(cx, 2); p.lineTo(cx + lw / 2, L * .2); p.lineTo(cx + lw * .3, py + T - 4); p.lineTo(cx - lw * .3, py + T - 4); p.lineTo(cx - lw / 2, L * .2); p.closePath(); }
      else { var r = lw / 2; p.moveTo(cx - r, py + T - 2); p.lineTo(cx - r, 6 + r); p.arcTo(cx - r, 4, cx, 4, r); p.arcTo(cx + r, 4, cx + r, 6 + r, r); p.lineTo(cx + r, py + T - 2); p.closePath(); }
      if (aod) { g.strokeStyle = col; g.lineWidth = 1.6; g.stroke(p); }
      else {
        g.fillStyle = col; g.fill(p);
        // repère lumineux au bout
        g.fillStyle = cfg.accent; g.globalAlpha = .9;
        if (st === 'larges') g.fillRect(cx - lw / 2 + 3, 12, lw - 6, L * .45); else { g.beginPath(); g.moveTo(cx, 8); g.lineTo(cx + lw * .22, L * .22); g.lineTo(cx - lw * .22, L * .22); g.closePath(); g.fill(); }
        g.globalAlpha = 1;
      }
    }
    return { c: c, px: Math.round(cx), py: py };
  }
  function centre(cfg, aod) {
    var c = toile(24, 24), g = c.getContext('2d');
    g.fillStyle = aod ? mix(cfg.doux, '#000', .3) : cfg.accent; g.beginPath(); g.arc(12, 12, 9, 0, 7); g.fill();
    g.fillStyle = aod ? '#000' : cfg.c1; g.beginPath(); g.arc(12, 12, 3.5, 0, 7); g.fill();
    return c;
  }

  /* ---------------- aperçu : la montre simulée avec les mêmes images ---------------- */
  var CACHE = { cle: '', p: null };
  function apercu(cv, c, opt) {
    opt = opt || {};
    var cle = JSON.stringify(norm(c));
    if (CACHE.cle !== cle) { CACHE.cle = cle; CACHE.p = paquet(c); }
    var pk = CACHE.p, IM = pk.images, sp = pk.spec, cfg = sp.cfg, aod = !!opt.aod;
    var g = cv.getContext('2d'), sc = cv.width / W, d = opt.date || new Date();
    var val = opt.valeurs || {};
    g.save(); g.clearRect(0, 0, cv.width, cv.height); g.scale(sc, sc);
    g.fillStyle = '#000'; g.beginPath(); g.arc(CX, CY, CX, 0, 7); g.fill(); g.save(); g.clip();
    var im = function (src) { return IM[String(src).replace(/^images\//, '')]; };
    sp.w.forEach(function (w) {
      if (!!w.aod !== aod) return;
      if (w.k === 'img') { var i0 = im(w.src); if (i0) g.drawImage(i0, w.x, w.y); }
      else if (w.k === 'level') {
        var v = val[w.type] != null ? val[w.type] : w.type === 'BATTERY' ? 86 : w.type === 'STEP' ? 64 : 3;
        var idx = w.type === 'WEATHER' ? v : Math.max(0, Math.min(w.n - 1, Math.round(v / 100 * (w.n - 1))));
        var i1 = IM[w.dossier + '/' + idx + '.png']; if (i1) g.drawImage(i1, w.x, w.y);
      }
      else if (w.k === 'num') {
        var tx = String(val[w.type] != null ? val[w.type] : w.ex), parts = [];
        tx.split('').forEach(function (ch) { var n = /\d/.test(ch) ? ch : ch === '-' ? 'moins' : ch === ':' ? 'dp' : ch === '.' ? (w.point || 'point') : null; if (n) parts.push(IM['infos/' + n + '.png']); });
        if (w.unite) parts.push(IM['infos/' + w.unite + '.png']);
        var tw = parts.reduce(function (s, p) { return s + (p ? p.width : 0); }, 0), x = w.x + (w.w - tw) / 2;
        parts.forEach(function (p) { if (p) { g.drawImage(p, x, w.y); x += p.width; } });
      }
      else if (w.k === 'time') {
        var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2), x2 = w.x;
        [hh[0], hh[1], 'dp', mm[0], mm[1]].forEach(function (ch) { var i2 = IM[w.dossier + '/' + ch + '.png']; if (i2) g.drawImage(i2, x2, w.y); x2 += ch === 'dp' ? w.dpw : w.cw; });
      }
      else if (w.k === 'date') {
        var j = (d.getDay() + 6) % 7, s = w.suf;
        [['semaine', j, w.sem], ['jour', d.getDate() - 1, w.jour], ['mois', d.getMonth(), w.mois]].forEach(function (r) { var i3 = IM[r[0] + s + '/' + r[1] + '.png']; if (i3) g.drawImage(i3, r[2].x, r[2].y); });
      }
      else if (w.k === 'pointer') {
        var hA = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, mA = (d.getMinutes() + d.getSeconds() / 60) / 60 * Math.PI * 2, sA = d.getSeconds() / 60 * Math.PI * 2;
        [[w.h, hA], [w.m, mA], [w.s, sA]].forEach(function (r) {
          if (!r[0]) return; var i4 = im(r[0].src); if (!i4) return;
          g.save(); g.translate(CX, CY); g.rotate(r[1]); g.drawImage(i4, -r[0].px, -r[0].py); g.restore();
        });
      }
    });
    g.restore(); g.restore();
    return pk;
  }

  /* ---------------- polices ---------------- */
  function polices(base) {
    if (!root.FontFace || !root.document) return Promise.resolve();
    var l = [PETITE].concat(Object.keys(POLICES).map(function (k) { return POLICES[k]; }));
    return Promise.all(l.map(function (p) {
      if (p.charge) return p.charge;
      var f = new root.FontFace(p.fam, 'url(' + (base || '') + p.fichier + ')');
      p.charge = f.load().then(function (x) { root.document.fonts.add(x); MES = null; }).catch(function () { });
      return p.charge;
    }));
  }

  root.CADRAN = { W: W, DEFAUT: DEFAUT, CHOIX: CHOIX, INFOS: INFOS, METEO: METEO, norm: norm, paquet: paquet, apercu: apercu, polices: polices,
    JOURS: JOURS, MOIS: MOIS, slotsPos: slotsPos };
})(typeof window !== 'undefined' ? window : globalThis);
