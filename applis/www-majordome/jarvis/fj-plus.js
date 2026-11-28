/* GÉNÉRÉ par pc/build-pc.py depuis pc/shared/fond-jarvis/fj-plus.js : ne pas modifier ici (source : pc/shared/fond-jarvis/, voir pc/README.md). */
/* =====================================================================
   Fond Jarvis : fonctions en plus.
   - Mode Formation : grand minuteur de pause ou de séance autour de la sphère (anneau de progression),
     heure de reprise, message pour les stagiaires, QR code vers un support, annonces vocales,
     panneaux personnels masqués pendant la formation.
   - Organisation : calendrier du mois (jours avec rendez-vous marqués), citation du jour,
     tâches du jour (clavier ou voix), horloges du monde.
   - Ambiance : la sphère et les panneaux suivent la musique (Lively --audio), couleurs selon l'heure
     (nuit, aube, jour, crépuscule), lune (phase, prochaine pleine lune) et course du soleil.
   - Bien-être : rappels de pause, d'eau, de posture et des yeux (20-20-20) aux heures choisies,
     qualité de l'air, UV et pollens (Open-Meteo, sans clé) dans le panneau Météo.
   Réglages dans S.plus (sauvegardés avec les autres : fichier de réglages compris).
   ===================================================================== */
(function (root) {
  'use strict';
  var FJ = root.FJ, doc = document; if (!FJ || !FJ.S) return;
  var S = FJ.S, esc = FJ.esc, cap = FJ.cap, MIN = 60000, HOUR = 3600000, DAY = 86400000, TAU = Math.PI * 2;
  function $(id) { return doc.getElementById(id); }
  function el(tag, attrs, html) { var e = doc.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (html != null) e.innerHTML = html; return e; }
  function deacc(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hmTx(ms) { var d = new Date(ms); return d.getHours() + ' h ' + pad(d.getMinutes()); }
  function hmSay(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return (h === 12 && !m ? 'midi' : h === 0 && !m ? 'minuit' : h + (h > 1 ? ' heures' : ' heure') + (m ? ' ' + m : '')); }
  function say(t) { try { return FJ.jarvis && FJ.jarvis.say ? FJ.jarvis.say(t) : Promise.resolve(); } catch (e) { return Promise.resolve(); } }
  var NUMW = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, quarante5: 45, cinquante: 50, soixante: 60 };
  function num(v) { if (v == null) return NaN; var n = parseInt(v, 10); if (!isNaN(n)) return n; try { if (root.MJNLU && root.MJNLU.num) { var x = root.MJNLU.num(v, NaN); if (!isNaN(x)) return x; } } catch (e) { } return NUMW[String(v).trim()] || NaN; }

  /* ---------------- Réglages ---------------- */
  var DEFP = {
    panels: { mois: true, taches: true, monde: true, air: true, cmd: true },
    // panneau « Commandes » : boutons qui envoient la phrase à Jarvis (et à Majordome, son cerveau)
    cmds: ['Météo aujourd\'hui', 'Mes rendez-vous', 'J\'ai des messages ?', 'Minuteur 10 minutes', 'Bonsoir', 'Je rentre'],
    villes: ['America/Montreal', 'Africa/Dakar', 'Asia/Tokyo'],
    taches: [],
    form: { on: false, mode: '', fin: 0, debut: 0, msg: 'Bienvenue à la formation', qr: '', qrLab: 'Le support de la formation', masquer: true, voix: true },
    bien: { on: false, pause: 50, eau: 60, posture: 40, yeux: false, de: 8, a: 19, voix: true, semaine: true },
    amb: { musique: true, auto: false, base: '' }
  };
  function merge(d, s) { var o = {}; Object.keys(d).forEach(function (k) { var dv = d[k], sv = s && s[k]; o[k] = dv && typeof dv === 'object' && !Array.isArray(dv) ? merge(dv, sv) : sv === undefined ? (Array.isArray(dv) ? dv.slice() : dv) : sv; }); return o; }
  function P() { if (!S.plus || S.plus.__v !== 2) { S.plus = merge(DEFP, S.plus || {}); S.plus.__v = 2; } return S.plus; }   // __v 2 : panneau Commandes
  P();
  function save() { FJ.save(); }

  /* ---------------- Panneaux (créés dans les colonnes) ---------------- */
  function pan(id, tag, label) { return el('article', { 'class': 'pan plus', id: id, 'aria-label': label }, '<header><span class="tag">' + tag + '</span><span class="meta" id="' + id + 'M"></span></header><div class="pb" id="' + id + 'B"></div>'); }
  var pMois = pan('pMois', 'Calendrier', 'Calendrier du mois'), pTaches = pan('pTaches', 'Tâches', 'Tâches du jour'), pMonde = pan('pMonde', 'Ciel et monde', 'Lune, soleil et heures du monde');
  var pCmd = pan('pCmd', 'Commandes', 'Commandes rapides');
  pMois.dataset.prio = 2; pTaches.dataset.prio = 3; pMonde.dataset.prio = 1; pCmd.dataset.prio = 4;
  $('colL').insertBefore(pCmd, $('pWx'));
  $('colL').appendChild(pMois);
  $('colR').insertBefore(pTaches, $('pNews'));
  $('colR').appendChild(pMonde);
  var wxAir = el('div', { 'class': 'wx-air', id: 'wxAir', hidden: '' }); $('pWx').appendChild(wxAir);

  /* --- calendrier du mois et citation --- */
  var JOURS = FJ.JOURS || ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = FJ.MOIS || ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var CIT = [
    ['Rien ne sert de courir ; il faut partir à point.', 'Jean de La Fontaine'], ['Patience et longueur de temps font plus que force ni que rage.', 'Jean de La Fontaine'],
    ['Aide-toi, le ciel t\'aidera.', 'Jean de La Fontaine'], ['On a souvent besoin d\'un plus petit que soi.', 'Jean de La Fontaine'],
    ['Ce que l\'on conçoit bien s\'énonce clairement.', 'Nicolas Boileau'], ['Hâtez-vous lentement, et sans perdre courage.', 'Nicolas Boileau'],
    ['Vingt fois sur le métier remettez votre ouvrage.', 'Nicolas Boileau'], ['Il faut cultiver notre jardin.', 'Voltaire'],
    ['Le travail éloigne de nous trois grands maux : l\'ennui, le vice et le besoin.', 'Voltaire'], ['Le cœur a ses raisons que la raison ne connaît point.', 'Blaise Pascal'],
    ['L\'homme n\'est qu\'un roseau, le plus faible de la nature ; mais c\'est un roseau pensant.', 'Blaise Pascal'], ['Je pense, donc je suis.', 'René Descartes'],
    ['À vaincre sans péril, on triomphe sans gloire.', 'Pierre Corneille'], ['Qui veut voyager loin ménage sa monture.', 'Jean Racine'],
    ['Il n\'est point de vent favorable pour celui qui ne sait où il va.', 'Sénèque'], ['Ce n\'est pas parce que les choses sont difficiles que nous n\'osons pas ; c\'est parce que nous n\'osons pas qu\'elles sont difficiles.', 'Sénèque'],
    ['Apprendre sans réfléchir est vain ; réfléchir sans apprendre est dangereux.', 'Confucius'], ['Un voyage de mille lieues commence par un premier pas.', 'Lao-tseu'],
    ['Le commencement est la moitié du tout.', 'Platon'], ['Les racines de l\'éducation sont amères, mais ses fruits sont doux.', 'Aristote'],
    ['Connais-toi toi-même.', 'Maxime du temple de Delphes'], ['Le génie n\'est qu\'une plus grande aptitude à la patience.', 'Buffon'],
    ['Le style est l\'homme même.', 'Buffon'], ['Les grandes pensées viennent du cœur.', 'Vauvenargues'],
    ['Rien de grand ne s\'est accompli dans le monde sans passion.', 'Hegel'], ['Aie le courage de te servir de ton propre entendement.', 'Emmanuel Kant'],
    ['L\'expérience est le nom que chacun donne à ses erreurs.', 'Oscar Wilde'], ['Le temps, c\'est de l\'argent.', 'Benjamin Franklin'],
    ['La musique exprime ce qui ne peut être dit et sur quoi il est impossible de rester silencieux.', 'Victor Hugo'], ['Tout vient à point à qui sait attendre.', 'Proverbe français'],
    ['Petit à petit, l\'oiseau fait son nid.', 'Proverbe français'], ['C\'est en forgeant qu\'on devient forgeron.', 'Proverbe français']
  ];
  function dayOfYear(d) { var s = new Date(d.getFullYear(), 0, 1); return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - s) / DAY) + 1; }
  function renderMois() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth(), first = new Date(y, m, 1), nd = new Date(y, m + 1, 0).getDate();
    var lead = (first.getDay() + 6) % 7, busy = {};
    try { (FJ.agendaBetween ? FJ.agendaBetween(first.getTime(), new Date(y, m + 1, 1).getTime()) : []).forEach(function (e) { busy[new Date(e.b).getDate()] = 1; }); } catch (e) { }
    var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0, doy = dayOfYear(now), tot = leap ? 366 : 365;
    $('pMoisM').textContent = 'Jour ' + doy + ' / ' + tot + (FJ.isoWeek ? ' · S' + FJ.isoWeek(now) : '');
    var h = '<div class="mo-h"><b>' + cap(MOIS[m]) + '</b> ' + y + '<i style="--p:' + (doy / tot).toFixed(3) + '"></i></div><div class="mo">';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (j, i) { h += '<span class="dn' + (i > 4 ? ' we' : '') + '">' + j + '</span>'; });
    for (var i = 0; i < lead; i++) h += '<span></span>';
    for (var d = 1; d <= nd; d++) {
      var wd = (lead + d - 1) % 7, c = (d === now.getDate() ? ' today' : d < now.getDate() ? ' past' : '') + (wd > 4 ? ' we' : '') + (busy[d] ? ' ev' : '');
      h += '<span class="d' + c + '">' + d + '</span>';
    }
    h += '</div>';
    var q = CIT[(doy + y) % CIT.length];
    h += '<blockquote class="cit"><p>« ' + esc(q[0]) + ' »</p><cite>— ' + esc(q[1]) + '</cite></blockquote>';
    $('pMoisB').innerHTML = h;
  }

  /* --- tâches --- */
  function tid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function taches() { var p = P(); if (!Array.isArray(p.taches)) p.taches = []; return p.taches; }
  FJ.tacheAdd = function (t) { t = String(t || '').trim().slice(0, 120); if (!t) return false; taches().push({ id: tid(), t: t, ok: false, at: Date.now() }); save(); renderTaches(); return true; };
  function renderTaches() {
    var l = taches(), done = l.filter(function (x) { return x.ok; }).length;
    $('pTachesM').textContent = l.length ? done + ' / ' + l.length + ' faite' + (done > 1 ? 's' : '') : '';
    var h = '<ul class="tk">' + l.map(function (x) {
      return '<li class="' + (x.ok ? 'ok' : '') + '" data-id="' + x.id + '"><button type="button" class="ck" aria-label="' + (x.ok ? 'Marquer à faire' : 'Marquer faite') + '"><svg viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="1"/><path d="M5.5 10.5l3 3 6-7"/></svg></button><span>' + esc(x.t) + '</span><button type="button" class="rm" aria-label="Supprimer">×</button></li>';
    }).join('') + '</ul>';
    h += '<form class="tk-add" autocomplete="off"><span aria-hidden="true">+</span><input type="text" maxlength="120" placeholder="Ajouter une tâche…" aria-label="Nouvelle tâche"></form>';
    if (done) h += '<button type="button" class="tk-clean">Effacer les tâches faites</button>';
    var B = $('pTachesB'); B.innerHTML = h;
    var bar = l.length ? done / l.length : 0; pTaches.style.setProperty('--tp', bar.toFixed(3));
    B.querySelectorAll('li').forEach(function (li) {
      var x = l.filter(function (y) { return y.id === li.dataset.id; })[0];
      li.querySelector('.ck').onclick = function () { x.ok = !x.ok; save(); renderTaches(); if (x.ok && l.every(function (y) { return y.ok; })) FJ.toast('Toutes les tâches sont faites. Bravo !'); };
      li.querySelector('.rm').onclick = function () { l.splice(l.indexOf(x), 1); save(); renderTaches(); };
    });
    B.querySelector('form').onsubmit = function (e) { e.preventDefault(); var i = e.target.querySelector('input'); if (FJ.tacheAdd(i.value)) { i.value = ''; B.querySelector('input').focus(); } };
    var cl = B.querySelector('.tk-clean'); if (cl) cl.onclick = function () { P().taches = l.filter(function (y) { return !y.ok; }); save(); renderTaches(); };
    fitSoon();
  }

  /* --- ciel : soleil, lune ; heures du monde --- */
  var RAD = Math.PI / 180;
  function sunAlt(t, lat, lon) {
    var d = t / DAY - 0.5 + 2440588 - 2451545, M = RAD * (357.5291 + 0.98560028 * d);
    var C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)), L = M + C + RAD * 102.9372 + Math.PI, e = RAD * 23.4397;
    var dec = Math.asin(Math.sin(e) * Math.sin(L)), ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    var lw = RAD * -lon, phi = RAD * lat, H = RAD * (280.16 + 360.9856235 * d) - lw - ra;
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
  }
  FJ.sunAlt = sunAlt;
  var SYN = 29.530588853, NEW0 = Date.UTC(2000, 0, 6, 18, 14);
  function moon(t) {
    var age = (((t - NEW0) / DAY) % SYN + SYN) % SYN, f = age / SYN, ill = (1 - Math.cos(TAU * f)) / 2;
    var names = ['Nouvelle lune', 'Premier croissant', 'Premier quartier', 'Gibbeuse croissante', 'Pleine lune', 'Gibbeuse décroissante', 'Dernier quartier', 'Dernier croissant'];
    var full = (SYN / 2 - age + SYN) % SYN, nw = (SYN - age) % SYN;
    return { f: f, ill: ill, name: names[Math.round(f * 8) % 8], full: full, nw: nw };
  }
  FJ.moon = moon;
  function moonSvg(f, r) {
    var cx = r + 2, cy = r + 2, w = r * 2 + 4, k = Math.abs(Math.cos(TAU * f)) * r, wax = f < 0.5, cres = f < 0.25 || f > 0.75;
    var outer = wax ? 1 : 0, inner = wax ? (cres ? 0 : 1) : (cres ? 1 : 0);
    var lit = 'M' + cx + ' ' + (cy - r) + 'A' + r + ' ' + r + ' 0 0 ' + outer + ' ' + cx + ' ' + (cy + r) + 'A' + k.toFixed(2) + ' ' + r + ' 0 0 ' + inner + ' ' + cx + ' ' + (cy - r) + 'Z';
    return '<svg class="moon" viewBox="0 0 ' + w + ' ' + w + '" aria-hidden="true"><defs><radialGradient id="mg" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="rgb(var(--ink))" stop-opacity=".75"/></radialGradient></defs>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="mdark"/>' + (f > 0.01 && f < 0.99 ? '<path d="' + lit + '" fill="url(#mg)"/>' : '') +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="mrim"/></svg>';
  }
  var VILLES = [
    ['Europe/Paris', 'Paris'], ['Europe/London', 'Londres'], ['Europe/Madrid', 'Madrid'], ['Europe/Berlin', 'Berlin'], ['Europe/Moscow', 'Moscou'], ['Europe/Istanbul', 'Istanbul'],
    ['Africa/Dakar', 'Dakar'], ['Africa/Abidjan', 'Abidjan'], ['Africa/Casablanca', 'Casablanca'], ['Africa/Algiers', 'Alger'], ['Africa/Tunis', 'Tunis'], ['Africa/Kinshasa', 'Kinshasa'], ['Africa/Johannesburg', 'Johannesburg'],
    ['Indian/Reunion', 'La Réunion'], ['Indian/Mayotte', 'Mayotte'], ['America/Martinique', 'Martinique'], ['America/Guadeloupe', 'Guadeloupe'], ['America/Cayenne', 'Cayenne'], ['Pacific/Noumea', 'Nouméa'], ['Pacific/Tahiti', 'Tahiti'],
    ['America/Montreal', 'Montréal'], ['America/New_York', 'New York'], ['America/Los_Angeles', 'Los Angeles'], ['America/Sao_Paulo', 'São Paulo'],
    ['Asia/Dubai', 'Dubaï'], ['Asia/Kolkata', 'Bombay'], ['Asia/Shanghai', 'Pékin'], ['Asia/Tokyo', 'Tokyo'], ['Australia/Sydney', 'Sydney']
  ];
  function villeNom(tz) { for (var i = 0; i < VILLES.length; i++) if (VILLES[i][0] === tz) return VILLES[i][1]; return tz.split('/').pop().replace(/_/g, ' '); }
  function tzParts(tz, t) {
    try {
      var o = {}; new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', year: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(t)).forEach(function (p) { o[p.type] = p.value; });
      return { h: +o.hour, m: +o.minute, key: o.year + '-' + o.month + '-' + o.day };
    } catch (e) { return null; }
  }
  function lieu() {
    var d = FJ.wx && FJ.wx.data; if (d && isFinite(d.latitude)) return { lat: d.latitude, lon: d.longitude };
    if (S.place && isFinite(S.place.lat)) return { lat: S.place.lat, lon: S.place.lon };
    return null;
  }
  function renderMonde() {
    var t = Date.now(), mo = moon(t), L = lieu(), h = '<div class="sky">';
    // course du soleil (lever → coucher), position actuelle
    var d = FJ.wx && FJ.wx.data, sr = d && d.daily && new Date(d.daily.sunrise[0]).getTime(), ss = d && d.daily && new Date(d.daily.sunset[0]).getTime();
    if (sr && ss && ss > sr) {
      var k = (t - sr) / (ss - sr), day = k >= 0 && k <= 1, kk = Math.max(0, Math.min(1, k)), a = Math.PI * (1 - kk), x = 60 + 52 * Math.cos(a), y = 58 - 46 * Math.sin(a);
      var alt = L ? sunAlt(t, L.lat, L.lon) : null;
      h += '<svg class="arc" viewBox="0 0 120 70" aria-hidden="true"><path class="hz" d="M2 58H118"/><path class="tr" d="M8 58A52 46 0 0 1 112 58"/>' +
        '<path class="dn" d="M8 58A52 46 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) + '"/>' + (day ? '<circle class="sun" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5"/>' : '') + '</svg>' +
        '<div class="sky-tx"><span>☀ <b>' + FJ.hm(sr) + '</b> → <b>' + FJ.hm(ss) + '</b></span><span>' + (day ? 'Jour : ' + String(Math.round((ss - sr) / HOUR * 10) / 10).replace('.', ',') + ' h · soleil à ' + Math.round(alt != null ? alt : 0) + '°' : t < sr ? 'Lever dans ' + dTx(sr - t) : 'Nuit · lever demain') + '</span></div>';
    }
    h += '<div class="lune">' + moonSvg(mo.f, 20) + '<div><b>' + mo.name + '</b><span>' + Math.round(mo.ill * 100) + ' % éclairée</span><span>' + (mo.ill > .97 ? (mo.f < .5 ? 'Pleine lune demain' : 'Nouvelle lune dans ' + Math.round(mo.nw) + ' j') : mo.ill < .03 ? (mo.f > .5 ? 'Nouvelle lune demain' : 'Pleine lune dans ' + Math.round(mo.full) + ' j') : mo.f < .5 ? 'Pleine lune dans ' + Math.round(mo.full) + ' j' : 'Nouvelle lune dans ' + Math.round(mo.nw) + ' j') + '</span></div></div></div>';
    var here = tzParts(Intl.DateTimeFormat().resolvedOptions().timeZone, t);
    h += '<div class="wc">' + (P().villes || []).filter(Boolean).slice(0, 4).map(function (tz) {
      var p = tzParts(tz, t); if (!p) return '';
      var off = here ? (p.key > here.key ? ' +1 j' : p.key < here.key ? ' −1 j' : '') : '', jour = p.h >= 7 && p.h < 20;
      return '<div><span class="ic">' + (jour ? '☀' : '☾') + '</span><span class="vn">' + esc(villeNom(tz)) + '</span><b class="num">' + pad(p.h) + ':' + pad(p.m) + '</b><i>' + off + '</i></div>';
    }).join('') + '</div>';
    $('pMondeB').innerHTML = h;
    $('pMondeM').textContent = L ? '' : 'ville : ⚙ › Météo';
  }
  function dTx(ms) { var m = Math.round(ms / MIN), h = Math.floor(m / 60); return h ? h + ' h ' + pad(m % 60) : m + ' min'; }

  /* --- qualité de l'air, UV et pollens (Open-Meteo) --- */
  var AIR = { d: null, at: 0, busy: false };
  var POL = { alder_pollen: 'Aulne', birch_pollen: 'Bouleau', grass_pollen: 'Graminées', mugwort_pollen: 'Armoise', olive_pollen: 'Olivier', ragweed_pollen: 'Ambroisie' };
  function loadAir(force) {
    var L = lieu(); if (!L || !P().panels.air || AIR.busy) return;
    var key = L.lat.toFixed(2) + ',' + L.lon.toFixed(2);
    if (!force && AIR.d && AIR.k === key && Date.now() - AIR.at < HOUR) return renderAir();
    AIR.busy = true;
    var url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + L.lat.toFixed(3) + '&longitude=' + L.lon.toFixed(3) +
      '&current=european_aqi,pm2_5,pm10,ozone,uv_index,' + Object.keys(POL).join(',') + '&timezone=auto';
    (FJ.http ? FJ.http(url) : fetch(url).then(function (r) { return r.text(); })).then(function (t) {
      var d = FJ.J(t, null); if (d && d.current) { AIR.d = d.current; AIR.at = Date.now(); AIR.k = key; FJ.lsSet('fond-jarvis:air', { d: AIR.d, at: AIR.at, k: key }); }
    }).catch(function () { }).then(function () { AIR.busy = false; renderAir(); });
  }
  (function () { var c = FJ.lsGet('fond-jarvis:air', null); if (c && c.d && Date.now() - c.at < 3 * HOUR) { AIR.d = c.d; AIR.at = c.at; AIR.k = c.k; } })();
  function aqiLvl(v) { return v == null ? null : v <= 20 ? ['Bon', 1] : v <= 40 ? ['Correct', 2] : v <= 60 ? ['Moyen', 3] : v <= 80 ? ['Médiocre', 4] : v <= 100 ? ['Mauvais', 5] : ['Très mauvais', 6]; }
  function polLvl(v) { return v < 1 ? null : v < 10 ? ['faible', 1] : v < 50 ? ['moyen', 3] : v < 200 ? ['élevé', 5] : ['très élevé', 6]; }
  function renderAir() {
    var a = AIR.d, on = P().panels.air && a;
    wxAir.hidden = !on; if (!on) return;
    var q = aqiLvl(a.european_aqi), h = '';
    if (q) h += '<span class="aq l' + q[1] + '" title="Indice européen de la qualité de l\'air : ' + Math.round(a.european_aqi) + '"><i style="--v:' + Math.min(1, a.european_aqi / 100).toFixed(2) + '"></i>Air <b>' + q[0] + '</b> <small>' + Math.round(a.european_aqi) + '</small></span>';
    if (a.uv_index != null && a.uv_index >= 1) h += '<span class="aq l' + (a.uv_index < 3 ? 1 : a.uv_index < 6 ? 3 : a.uv_index < 8 ? 4 : 5) + '">UV <b>' + Math.round(a.uv_index) + '</b></span>';
    Object.keys(POL).forEach(function (k) { var l = polLvl(a[k] || 0); if (l) h += '<span class="aq l' + l[1] + '" title="Pollens de ' + POL[k].toLowerCase() + ' : ' + Math.round(a[k]) + ' grains/m³">' + POL[k] + ' <b>' + l[0] + '</b></span>'; });
    wxAir.innerHTML = h;
  }
  FJ.air = AIR;

  /* ---------------- Mode Formation ---------------- */
  var stage = $('stage'), orbBox = $('orbBox');
  var fm = el('div', { id: 'fmBig', hidden: '', 'aria-live': 'polite' }, '<svg class="fm-ring" viewBox="0 0 200 200" aria-hidden="true"><circle class="bg" cx="100" cy="100" r="92"/><circle class="pr" id="fmPr" cx="100" cy="100" r="92" pathLength="1000"/><g id="fmTk"></g></svg>' +
    '<div class="fm-tx"><span class="fm-k" id="fmK">Pause</span><b class="fm-t num" id="fmT">--:--</b><span class="fm-s" id="fmS"></span><div class="fm-b"><button type="button" class="btn" data-plus5>+5 min</button><button type="button" class="btn" data-stop>Terminer</button></div></div>');
  orbBox.appendChild(fm);
  var tk = ''; for (var i = 0; i < 60; i++) { var a0 = i / 60 * TAU, r1 = i % 5 ? 84 : 80; tk += '<line x1="' + (100 + Math.cos(a0) * r1).toFixed(1) + '" y1="' + (100 + Math.sin(a0) * r1).toFixed(1) + '" x2="' + (100 + Math.cos(a0) * 87).toFixed(1) + '" y2="' + (100 + Math.sin(a0) * 87).toFixed(1) + '"' + (i % 5 ? '' : ' class="q"') + '/>'; }
  $('fmTk').innerHTML = tk;
  var fmMsg = el('div', { id: 'fmMsg', hidden: '' }); stage.appendChild(fmMsg);
  var fmQr = el('figure', { id: 'fmQr', hidden: '' }); stage.appendChild(fmQr);
  fm.querySelector('[data-plus5]').onclick = function () { FJ.formation.ajoute(5); };
  fm.querySelector('[data-stop]').onclick = function () { FJ.formation.stop(); };
  var warned = 0, endedAt = 0;
  var F = FJ.formation = {
    on: function (v) { var f = P().form; f.on = v !== false; if (!f.on) { f.mode = ''; f.fin = 0; } save(); renderForm(); FJ.apply(); },
    pause: function (min) {
      var f = P().form; min = Math.max(1, Math.min(240, Math.round(min) || 15));
      f.on = true; f.mode = 'pause'; f.debut = Date.now(); f.fin = f.debut + min * MIN; warned = 0; endedAt = 0; save(); renderForm(); FJ.apply();
      return 'Pause de ' + min + ' minute' + (min > 1 ? 's' : '') + '. Reprise à ' + hmSay(f.fin) + '.';
    },
    seance: function (fin) {
      var f = P().form; f.on = true; f.mode = 'seance'; f.debut = Date.now(); f.fin = fin; warned = 0; endedAt = 0; save(); renderForm(); FJ.apply();
      return 'Séance jusqu\'à ' + hmSay(fin) + '.';
    },
    ajoute: function (min) { var f = P().form; if (!f.mode || !f.fin) return null; f.fin = Math.max(Date.now(), f.fin) + min * MIN; warned = 0; endedAt = 0; save(); renderForm(); return 'C\'est noté : ' + (f.mode === 'pause' ? 'reprise' : 'fin') + ' à ' + hmSay(f.fin) + '.'; },
    stop: function () { var f = P().form; var was = f.mode; f.mode = ''; f.fin = 0; save(); renderForm(); FJ.apply(); return was === 'pause' ? 'Fin de la pause. On reprend !' : 'Minuteur arrêté.'; },
    render: function () { renderForm(); }
  };
  function renderForm() {
    var f = P().form, R = doc.documentElement, act = f.on && f.mode && f.fin;
    R.classList.toggle('fm-on', !!f.on); R.classList.toggle('fm-timer', !!act); R.classList.toggle('fm-masque', !!(f.on && f.masquer));
    fm.hidden = !act; fm.dataset.mode = f.mode || '';
    fmMsg.hidden = !(f.on && f.msg); fmMsg.textContent = f.msg || ''; fmMsg.className = (f.msg || '').length > 52 ? 'xl' : (f.msg || '').length > 34 ? 'l' : '';
    var qr = f.on && f.qr && root.FJQR;
    if (qr) { try { fmQr.innerHTML = root.FJQR.svg(f.qr, { quiet: 2, bg: '#fff', fg: '#02060c' }) + '<figcaption>' + esc(f.qrLab || '') + '</figcaption>'; fmQr.hidden = false; } catch (e) { fmQr.hidden = true; } }
    else fmQr.hidden = true;
    tickForm();
    FJ.relayout();
  }
  function tickForm() {
    var f = P().form; if (!f.on || !f.mode || !f.fin) return;
    var now = Date.now(), left = f.fin - now, tot = Math.max(1, f.fin - (f.debut || now)), s = Math.max(0, Math.ceil(left / 1000));
    $('fmK').textContent = f.mode === 'pause' ? (left > 0 ? 'Pause' : 'C\'est reparti') : (left > 0 ? 'Séance' : 'Séance terminée');
    $('fmT').textContent = (s >= 3600 ? Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) : Math.floor(s / 60)) + ':' + pad(s % 60);
    $('fmS').textContent = left > 0 ? (f.mode === 'pause' ? 'Reprise à ' : 'Fin à ') + hmTx(f.fin) : f.mode === 'pause' ? 'Merci de regagner vos places' : 'Merci à tous';
    $('fmPr').style.strokeDashoffset = String(Math.round(1000 * (1 - Math.max(0, Math.min(1, left / tot)))));
    fm.classList.toggle('soon', left > 0 && left <= 2 * MIN); fm.classList.toggle('end', left <= 0);
    if (left > 0 && left <= 2 * MIN && f.mode === 'pause' && !warned && tot > 4 * MIN) { warned = 1; if (f.voix) say('Plus que deux minutes de pause.'); else FJ.toast('Plus que 2 minutes de pause'); }
    if (left <= 0 && !endedAt) {
      endedAt = now;
      if (f.voix) say(f.mode === 'pause' ? 'La pause est terminée. On reprend !' : 'La séance est terminée. Merci à tous !'); else FJ.toast(f.mode === 'pause' ? 'Fin de la pause' : 'Fin de la séance');
      try { if (FJ.orb) { FJ.orb.state('speak'); setTimeout(function () { if (FJ.orb.get() === 'speak') FJ.orb.state('idle'); }, 1500); } } catch (e) { }
    }
    if (endedAt && now - endedAt > 90000) { f.mode = ''; f.fin = 0; endedAt = 0; save(); renderForm(); FJ.apply(); }
  }

  /* ---------------- Bien-être : rappels ---------------- */
  var RAPPELS = {
    pause: ['Pause écran', 'Levez-vous et marchez deux minutes : vos jambes et vos yeux vous diront merci.', 'Petite pause : levez-vous et marchez deux minutes.'],
    eau: ['Hydratation', 'Buvez un verre d\'eau.', 'Pensez à boire un verre d\'eau.'],
    posture: ['Posture', 'Dos droit, épaules relâchées, écran à hauteur des yeux.', 'Vérifiez votre posture : dos droit, épaules relâchées.'],
    yeux: ['Repos des yeux', 'Regardez au loin pendant vingt secondes (règle 20-20-20).', 'Regardez au loin pendant vingt secondes.']
  };
  var ICB = {
    pause: '<path d="M8 21l2-6 3 3v3M10 15l1-5 4 2 2 3M11 10l-3 1-1 3"/><circle cx="13" cy="5" r="2"/>',
    eau: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
    posture: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v8M8 10h8M10 21l2-6 2 6"/>',
    yeux: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  };
  var next = {}, bienCard = el('div', { id: 'bien', hidden: '', role: 'status' }); doc.body.appendChild(bienCard);
  function bienOk(t) {
    var b = P().bien, d = new Date(t), h = d.getHours() + d.getMinutes() / 60;
    if (!b.on || h < b.de || h >= b.a) return false;
    if (b.semaine && (d.getDay() === 0 || d.getDay() === 6)) return false;
    var f = P().form; if (f.on && f.mode === 'pause' && f.fin > t) return false;
    return !FJ.loop.paused;
  }
  function bienTick() {
    var b = P().bien, t = Date.now();
    ['pause', 'eau', 'posture', 'yeux'].forEach(function (k) {
      var per = k === 'yeux' ? (b.yeux ? 20 : 0) : +b[k] || 0;
      if (!per) { delete next[k]; return; }
      if (!next[k]) next[k] = t + per * MIN;
      if (t >= next[k]) { next[k] = t + per * MIN; if (bienOk(t)) rappel(k); }
    });
  }
  function rappel(k) {
    var r = RAPPELS[k];
    bienCard.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICB[k] + '</svg><div><b>' + r[0] + '</b><span>' + r[1] + '</span></div><button type="button" class="btn pri" data-ok>C\'est fait</button><button type="button" class="btn" data-snz>Dans 10 min</button>';
    bienCard.hidden = false; requestAnimationFrame(function () { bienCard.classList.add('on'); });
    var close = function () { bienCard.classList.remove('on'); setTimeout(function () { bienCard.hidden = true; }, 400); };
    bienCard.querySelector('[data-ok]').onclick = close;
    bienCard.querySelector('[data-snz]').onclick = function () { next[k] = Date.now() + 10 * MIN; close(); };
    clearTimeout(bienCard.t); bienCard.t = setTimeout(close, 90000);
    if (P().bien.voix) say(r[2]);
  }
  FJ.rappel = rappel;

  /* ---------------- Ambiance : musique (Lively --audio) et couleurs selon l'heure ---------------- */
  var beat = 0, lastAudio = 0, quiet = true, lastSet = 0;
  root.livelyAudioListener = function (arr) {
    if (!P().amb.musique || !arr || !arr.length || FJ.loop.paused) return;
    var n = Math.min(arr.length, 128), half = n / 2, s = 0, bass = 0;
    for (var i = 0; i < n; i++) { var v = +arr[i] || 0; s += v; if ((i % half) < 8) bass += v; }
    var lvl = Math.min(1, (bass / 16) * 1.6 * 0.6 + (s / n) * 2.2 * 0.4), t = performance.now();
    beat += (lvl - beat) * (lvl > beat ? 0.55 : 0.12);
    lastAudio = t; quiet = beat < 0.02;
    if (t - lastSet < 33) return; lastSet = t;
    doc.documentElement.style.setProperty('--beat', beat.toFixed(3));
    var o = FJ.orb; if (o && o.get && o.get() === 'idle' && o.level) { try { o.level(beat); } catch (e) { } }
  };
  setInterval(function () { if (lastAudio && performance.now() - lastAudio > 1200 && beat) { beat = 0; doc.documentElement.style.setProperty('--beat', '0'); var o = FJ.orb; if (o && o.get && o.get() === 'idle') try { o.level(0); } catch (e) { } } }, 1000);

  var PHASE = { nuit: 'bleu', aube: 'ambre', jour: 'cyan', soir: 'rouge' };
  function phaseNow() {
    var L = lieu(), t = Date.now();
    if (L) { var a = sunAlt(t, L.lat, L.lon), am = new Date(t).getHours() < 13; return a < -6 ? 'nuit' : a < 8 ? (am ? 'aube' : 'soir') : 'jour'; }
    var h = new Date(t).getHours(); return h < 6 || h >= 21 ? 'nuit' : h < 9 ? 'aube' : h < 18 ? 'jour' : 'soir';
  }
  function autoTheme() {
    var a = P().amb; if (!a.auto) return;
    var th = PHASE[phaseNow()];
    if (th && S.theme !== th) { S.theme = th; FJ.save(); FJ.apply('quiet'); try { FJ.hud.redrawStatic(); } catch (e) { } }
  }
  FJ.phaseNow = phaseNow;

  /* --- commandes rapides --- */
  var cmdSig = '';
  function renderCmd() {
    var l = (P().cmds || []).filter(Boolean), sig = l.join('\n');
    if (sig === cmdSig) return; cmdSig = sig;
    $('pCmdM').textContent = FJ.mode === 'mj' ? 'Majordome' : '';
    $('pCmdB').innerHTML = l.length ? '<div class="cmdg">' + l.map(function (c, i) { return '<button type="button" class="cmdb" data-c="' + i + '">' + esc(c) + '</button>'; }).join('') + '</div>' : '<p class="hint" style="margin:0">Aucune commande : ⚙ › Écran.</p>';
  }
  $('pCmdB').addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]'); if (!b) return;
    var c = (P().cmds || [])[+b.dataset.c]; if (c && FJ.jarvis) FJ.jarvis.handle(c, 'text');
  });

  /* ---------------- Visibilité, place dans les colonnes ---------------- */
  FJ.plusVisible = function () {
    var p = P().panels;
    pMois.hidden = !p.mois; pTaches.hidden = !p.taches; pMonde.hidden = !p.monde; pCmd.hidden = !p.cmd;
    renderCmd();
    renderAir();
  };
  // une colonne trop pleine : les panneaux « en plus » les moins utiles se cachent d'eux-mêmes
  function fitCols() {
    ['colL', 'colR'].forEach(function (id) {
      var col = $(id); if (!col || !col.offsetParent) return;
      var ps = Array.prototype.slice.call(col.querySelectorAll('.pan.plus'));
      ps.forEach(function (p) { p.classList.remove('fit-out'); });
      ps.sort(function (a, b) { return (+a.dataset.prio || 0) - (+b.dataset.prio || 0); });
      for (var i = 0; i < ps.length && col.scrollHeight > col.clientHeight + 2; i++) if (!ps[i].hidden) ps[i].classList.add('fit-out');
    });
  }
  var fitT = 0; function fitSoon() { clearTimeout(fitT); fitT = setTimeout(function () { FJ.relayout(); }, 60); }
  var rel = FJ.relayout; FJ.relayout = function () { try { fitCols(); } catch (e) { } return rel.apply(this, arguments); };


  /* ---------------- Place des panneaux : gauche ou droite, et ordre ----------------
     ⚙ › Écran › Place des panneaux (Gauche / Droite, ↑ ↓) ou « Déplacer à la souris » (glisser un panneau).
     S.place = { L: [ids], R: [ids] } ; un panneau absent de la liste (nouveau) garde sa place d'origine.
     Téléphone et tablette en hauteur : le même ordre (gauche puis droite) pour la liste qui défile. */
  var BASE = null;
  function colIds(c) { return Array.prototype.filter.call($(c).children, function (e) { return e.classList.contains('pan') && e.id; }).map(function (e) { return e.id; }); }
  function placeNow() { return { L: colIds('colL'), R: colIds('colR') }; }
  function placeApply() {
    if (!BASE) BASE = placeNow();
    var p = S.place && Array.isArray(S.place.L) && Array.isArray(S.place.R) ? S.place : null, src = p || BASE, seen = {}, L = [], R = [];
    function prend(l, dst) { l.forEach(function (id) { if (!seen[id] && $(id)) { seen[id] = 1; dst.push(id); } }); }
    prend(src.L, L); prend(src.R, R);
    BASE.L.forEach(function (id) { if (!seen[id] && $(id)) { seen[id] = 1; L.push(id); } });
    BASE.R.forEach(function (id) { if (!seen[id] && $(id)) { seen[id] = 1; R.push(id); } });
    L.forEach(function (id) { $('colL').appendChild($(id)); }); R.forEach(function (id) { $('colR').appendChild($(id)); });
    L.concat(R).forEach(function (id, i) { $(id).style.order = p ? String(i + 1) : ''; });
  }
  function placeSave(o) { S.place = o; FJ.save(); placeApply(); FJ.relayout(); }
  FJ.place = { apply: placeApply, now: placeNow, reset: function () { delete S.place; FJ.save(); placeApply(); FJ.relayout(); } };
  function nomPan(id) { var e = $(id); return e ? (e.getAttribute('aria-label') || id) : id; }

  /* déplacer à la souris (ou au doigt) : on attrape un panneau, on le pose dans une colonne, à la hauteur voulue */
  var DEP = null;
  FJ.deplacer = function (on) {
    var R0 = doc.documentElement;
    if (on === false) {
      if (!DEP) return;
      R0.classList.remove('fj-deplace'); DEP.bar.remove();
      doc.removeEventListener('pointerdown', DEP.down, true); doc.removeEventListener('click', DEP.click, true); doc.removeEventListener('keydown', DEP.key, true);
      DEP = null; FJ.toast('Place des panneaux enregistrée', 1800); return;
    }
    if (DEP) return;
    if (FJ.ecranScroll && FJ.ecranScroll()) { FJ.settings('ecran'); FJ.toast('Sur cet écran : flèches ↑ ↓ et Gauche / Droite dans ⚙ › Écran', 3200); return; }
    if (FJ.closeSettings) FJ.closeSettings();
    R0.classList.add('fj-deplace');
    var bar = doc.createElement('div'); bar.id = 'depBar';
    bar.innerHTML = '<span>Glissez les panneaux à leur place, d\'une colonne à l\'autre</span><button type="button" class="btn" data-d="raz">Rétablir</button><button type="button" class="btn pri" data-d="ok">Terminer</button>';
    doc.body.appendChild(bar);
    bar.onclick = function (e) { var b = e.target.closest('[data-d]'); if (!b) return; if (b.dataset.d === 'raz') FJ.place.reset(); else FJ.deplacer(false); };
    var cur = null;
    function cols() { return ['colL', 'colR'].map($).filter(function (c) { return c && c.getClientRects().length; }); }
    function cible(x, y) {
      var best = null, bd = 1e9;
      cols().forEach(function (c) { var r = c.getBoundingClientRect(), d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0; if (d < bd) { bd = d; best = c; } });
      if (!best) return null;
      var list = Array.prototype.filter.call(best.children, function (e) { return e.classList.contains('pan') && e !== cur.el && !e.hidden && e.getClientRects().length; }), avant = null;
      for (var i = 0; i < list.length; i++) { var r2 = list[i].getBoundingClientRect(); if (y < r2.top + r2.height / 2) { avant = list[i]; break; } }
      return { col: best, avant: avant };
    }
    function move(e) {
      if (!cur) return;
      var dx = e.clientX - cur.x, dy = e.clientY - cur.y;
      if (!cur.on) {
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        var r = cur.el.getBoundingClientRect();
        cur.on = true; cur.ph = doc.createElement('div'); cur.ph.className = 'dep-ph'; cur.ph.style.height = r.height + 'px';
        cur.el.parentNode.insertBefore(cur.ph, cur.el);
        cur.ox = cur.x - r.left; cur.oy = cur.y - r.top;
        Object.assign(cur.el.style, { position: 'fixed', width: r.width + 'px', left: r.left + 'px', top: r.top + 'px', zIndex: 9, pointerEvents: 'none' });
        cur.el.classList.add('dep-drag');
      }
      cur.el.style.left = (e.clientX - cur.ox) + 'px'; cur.el.style.top = (e.clientY - cur.oy) + 'px';
      var t = cible(e.clientX, e.clientY); if (t) { if (t.avant) t.col.insertBefore(cur.ph, t.avant); else t.col.appendChild(cur.ph); }
      e.preventDefault();
    }
    function up() {
      doc.removeEventListener('pointermove', move, true); doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', up, true);
      if (!cur) return;
      if (cur.on) {
        cur.ph.parentNode.insertBefore(cur.el, cur.ph); cur.ph.remove();
        ['position', 'width', 'left', 'top', 'zIndex', 'pointerEvents'].forEach(function (k) { cur.el.style[k] = ''; });
        cur.el.classList.remove('dep-drag');
        placeSave(placeNow());
      }
      cur = null;
    }
    DEP = {
      bar: bar,
      down: function (e) {
        if (e.button > 0 || e.target.closest('#depBar')) return;
        var p = e.target.closest('#colL > .pan, #colR > .pan'); if (!p) return;
        cur = { el: p, x: e.clientX, y: e.clientY, on: false };
        doc.addEventListener('pointermove', move, true); doc.addEventListener('pointerup', up, true); doc.addEventListener('pointercancel', up, true);
        e.preventDefault();
      },
      click: function (e) { if (!e.target.closest('#depBar')) { e.preventDefault(); e.stopPropagation(); } },
      key: function (e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); FJ.deplacer(false); } }
    };
    doc.addEventListener('pointerdown', DEP.down, true); doc.addEventListener('click', DEP.click, true); doc.addEventListener('keydown', DEP.key, true);
    FJ.toast('Attrapez un panneau et posez-le où vous voulez', 2600);
  };

  /* ---------------- Commandes vocales et clavier ---------------- */
  function rawTail(raw, tail) {   // retrouve dans la phrase d'origine (accents, majuscules) le passage qui correspond à « tail »
    var w = String(raw || '').trim().split(/\s+/);
    for (var i = 0; i < w.length; i++) for (var j = w.length; j > i; j--) { var part = w.slice(i, j).join(' '); if (deacc(part) === tail) return part.replace(/^[«"“']+|[»"”'.!?]+$/g, ''); }
    return tail;
  }
  FJ.plusCmd = function (t, raw) {
    var m, f = P().form, J = FJ.jarvis;
    function ok(txt) { return J.answer(txt).done; }
    if ((m = /^(?:on (?:fait|prend) |faisons |lance |demarre |mets |commence )?(?:une )?pause(?: de| d)? ([a-z0-9]+)(?: minutes?| min| mn)?$/.exec(t)) && !isNaN(num(m[1]))) return ok(F.pause(num(m[1])));
    if (/^(?:fin de (?:la )?pause|on reprend|reprise|la pause est (?:finie|terminee)|arrete (?:la )?pause)$/.test(t) && f.mode === 'pause') return ok(F.stop());
    if ((m = /^(?:la )?(?:seance|formation|cours|session)(?: dure| se termine| finit)? jusqu a ([0-9]{1,2})(?: ?h| heures?)?(?: ?([0-9]{2}))?$/.exec(t)) || (m = /^(?:fin de (?:la )?(?:seance|formation) a) ([0-9]{1,2})(?: ?h| heures?)?(?: ?([0-9]{2}))?$/.exec(t))) {
      var d = new Date(); d.setHours(+m[1], +(m[2] || 0), 0, 0); if (d.getTime() <= Date.now()) return ok('Cette heure est déjà passée.');
      return ok(F.seance(d.getTime()));
    }
    if (/^(?:mode formation|(?:lance|active|demarre|passe en)(?: le)? mode formation)$/.test(t)) { F.on(true); return ok('Mode formation activé.'); }
    if (/^(?:(?:arrete|quitte|desactive|coupe)(?: le)? mode formation|fin (?:du mode formation|de la formation))$/.test(t)) { F.on(false); return ok('Mode formation désactivé.'); }
    if ((m = /^(?:ajoute|rajoute|encore|prolonge(?: de)?) ([a-z0-9]+) minutes?(?: de (?:pause|seance))?$/.exec(t)) && f.mode && !isNaN(num(m[1]))) return ok(F.ajoute(num(m[1])));
    if ((m = /^(?:nouvelle tache|ajoute (?:une |la )?tache|tache) (.+)$/.exec(t)) || (m = /^ajoute (.+) (?:a|dans|aux) (?:mes |les )?taches$/.exec(t))) {
      var txt = cap(rawTail(raw, m[1]));
      FJ.tacheAdd(txt); if (!P().panels.taches) { P().panels.taches = true; save(); FJ.apply(); } return ok('Tâche ajoutée : ' + txt + '.');
    }
    if (/^(?:quelles sont |lis |liste |dis moi )?(?:mes |les )?taches(?: du jour)?$/.test(t)) {
      var l = taches().filter(function (x) { return !x.ok; });
      return ok(l.length ? l.length + ' tâche' + (l.length > 1 ? 's' : '') + ' à faire : ' + l.map(function (x) { return x.t; }).join(', ') + '.' : 'Aucune tâche à faire.');
    }
    if (/^(?:efface|supprime|vide) (?:les |mes )?taches (?:faites|terminees)$/.test(t)) { P().taches = taches().filter(function (x) { return !x.ok; }); save(); renderTaches(); return ok('Tâches faites effacées.'); }
    if (/^(?:quelle est la |)(?:phase de la lune|lune)$/.test(t) || /\b(?:phase de la lune|pleine lune)\b/.test(t)) { var mo = moon(Date.now()); return ok(mo.name + ', éclairée à ' + Math.round(mo.ill * 100) + ' %. ' + (mo.ill > .97 ? 'C\'est la pleine lune.' : mo.f < .5 ? 'Prochaine pleine lune dans ' + Math.round(mo.full) + ' jours.' : 'Prochaine nouvelle lune dans ' + Math.round(mo.nw) + ' jours.')); }
    if (/\b(?:qualite de l air|pollens?|pollution)\b/.test(t)) {
      var a = AIR.d; if (!a) { loadAir(true); return ok('Je n\'ai pas encore la qualité de l\'air : choisissez une ville dans les réglages météo.'); }
      var q = aqiLvl(a.european_aqi), pl = Object.keys(POL).filter(function (k) { return (a[k] || 0) >= 10; }).map(function (k) { return POL[k].toLowerCase() + ' ' + polLvl(a[k])[0]; });
      return ok('Qualité de l\'air : ' + (q ? q[0].toLowerCase() : 'inconnue') + '. ' + (pl.length ? 'Pollens : ' + pl.join(', ') + '.' : 'Peu de pollens.'));
    }
    if ((m = /^quelle heure (?:est il|il est) (?:a|en|au) (.+)$/.exec(t))) {
      var q2 = m[1].trim(), hit = VILLES.filter(function (v) { return deacc(v[1]) === q2; })[0];
      if (hit) { var p = tzParts(hit[0], Date.now()); return ok('À ' + hit[1] + ', il est ' + p.h + ' h ' + pad(p.m) + '.'); }
    }
    if (/^(?:active|allume|lance)(?: les)? rappels(?: de pause| bien etre)?$/.test(t)) { P().bien.on = true; save(); return ok('Rappels de bien-être activés, de ' + P().bien.de + ' h à ' + P().bien.a + ' h.'); }
    if (/^(?:desactive|coupe|arrete)(?: les)? rappels(?: de pause| bien etre)?$/.test(t)) { P().bien.on = false; save(); return ok('Rappels de bien-être désactivés.'); }
    if (/^(?:couleurs?|theme) (?:automatique|selon l heure|auto)$/.test(t)) { setAuto(true); return ok('Les couleurs suivent maintenant l\'heure du jour.'); }
    return null;
  };
  function setAuto(v) {
    var a = P().amb; if (v && !a.auto) a.base = S.theme; a.auto = !!v;
    if (!v && a.base) { S.theme = a.base; FJ.apply(); try { FJ.hud.redrawStatic(); } catch (e) { } }
    save(); autoTheme();
  }

  /* ---------------- Réglages ⚙ : onglets « Formation » et « Plus » ---------------- */
  FJ.plusTabs = [['ecran', 'Écran'], ['formation', 'Formation'], ['plus', 'Plus']];
  FJ.plusTab = {
    // Écran : le même écran sur le téléphone, la tablette et le PC ; on choisit l'appareil et ce qu'on y voit
    ecran: function (B, U) {
      var p = P(), h = '';
      h += '<h3>Appareil</h3><div class="ecr-ch" role="group" aria-label="Appareil">' + (FJ.ECRANS || []).map(function (e) {
        return '<button type="button" class="btn' + ((S.ecran || 'auto') === e[0] ? ' pri' : '') + '" data-ecr="' + e[0] + '">' + FJI.svg('ecr_' + e[0]) + '<span>' + esc(e[1]) + '</span></button>';
      }).join('') + '</div><p class="hint">Même écran partout : seule la place des panneaux change (téléphone : en dessous de la sphère ; tablette : 2 colonnes ; PC : autour).</p>';
      h += '<h3>Sur l\'écran</h3><div class="ecr-pan">';
      [['S', 'clock', 'Horloge'], ['S', 'bat', 'Niveau de la batterie'], ['S', 'wx', 'Météo'], ['P', 'air', 'Qualité de l\'air, UV, pollens'], ['S', 'agenda', 'Agenda (s\'il y a des rendez-vous)'], ['P', 'taches', 'Tâches'], ['P', 'cmd', 'Commandes rapides'],
       ['P', 'mois', 'Calendrier et citation'], ['P', 'monde', 'Ciel et monde'], ['S', 'news', 'Actualités'], ['S', 'music', 'Musique en cours'], ['S', 'sys', 'Système et batterie']].forEach(function (x) {
        var v = x[0] === 'S' ? S.panels[x[1]] : p.panels[x[1]];
        h += U.chk('eP_' + x[0] + x[1], x[2], v !== false);
      });
      h += '</div>';
      var fxl = S.reduce ? 0 : S.fx <= 0 ? 0 : S.fx <= 40 ? 35 : S.fx <= 75 ? 65 : 100;
      // place des panneaux : Gauche / Droite et ↑ ↓
      var pl = placeNow(), lst = pl.L.map(function (id) { return [id, 'L']; }).concat(pl.R.map(function (id) { return [id, 'R']; }));
      h += '<h3>Place des panneaux</h3><div class="plc">' + lst.map(function (x) {
        var col = x[1] === 'L' ? pl.L : pl.R, i = col.indexOf(x[0]);
        return '<div class="plr' + ($(x[0]).hidden ? ' off' : '') + '"><span class="pln">' + esc(nomPan(x[0])) + '</span>' +
          '<span class="plg"><button type="button" class="btn sm' + (x[1] === 'L' ? ' pri' : '') + '" data-pl="' + x[0] + '" data-a="L" aria-label="À gauche">Gauche</button><button type="button" class="btn sm' + (x[1] === 'R' ? ' pri' : '') + '" data-pl="' + x[0] + '" data-a="R" aria-label="À droite">Droite</button></span>' +
          '<span class="plg"><button type="button" class="btn sm" data-pl="' + x[0] + '" data-a="up"' + (i === 0 ? ' disabled' : '') + ' aria-label="Monter">↑</button><button type="button" class="btn sm" data-pl="' + x[0] + '" data-a="down"' + (i === col.length - 1 ? ' disabled' : '') + ' aria-label="Descendre">↓</button></span></div>';
      }).join('') + '</div><div class="ecr-pl"><button type="button" class="btn" id="eDep">Déplacer à la souris</button><button type="button" class="btn" id="eRaz">Rétablir les places d\'origine</button></div><p class="hint">Les panneaux décochés plus haut restent à leur place, cachés. Sur le téléphone, le même ordre sert pour la liste qui défile (gauche puis droite).</p>';
      h += '<h3>Effets visuels</h3>' + U.fld('Niveau', U.sel('eFx', [[0, 'Aucun (écran calme, moins de batterie)'], [35, 'Légers'], [65, 'Normaux'], [100, 'Complets']], fxl), 'Anneaux, lueurs, circuits, étoiles, flux de données autour de la sphère.');
      h += U.chk('eFx2', 'Effets avancés', S.fx2 !== false, 'Constellations, satellites, ondes, balayage des panneaux, flux de données sur les côtés.');
      h += U.chk('eSaver', 'Économie sur batterie', !!S.saver, 'Moins d\'images par seconde quand l\'appareil n\'est pas branché.');
      h += '<h3>Commandes rapides</h3>' + U.fld('Boutons', '<textarea id="eCmds" rows="6" style="width:100%">' + esc((p.cmds || []).join('\n')) + '</textarea>', 'Une commande par ligne, comme vous la diriez' + (FJ.mode === 'mj' ? ' à Majordome' : '') + ' (ex. « Allume le salon », « Minuteur 5 minutes »).');
      B.innerHTML = h;
      B.querySelectorAll('[data-ecr]').forEach(function (b) { b.onclick = function () { FJ.setEcran(b.dataset.ecr); FJ.plusTab.ecran(B, U); }; });
      B.querySelectorAll('[id^="eP_"]').forEach(function (c) {
        c.onchange = function () {
          var k = c.id.slice(3), src = k[0] === 'S' ? S.panels : p.panels; src[k.slice(1)] = c.checked; save(); FJ.apply();
          if (k === 'Pair' && c.checked) loadAir(true);
        };
      });
      B.querySelectorAll('[data-pl]').forEach(function (b) {
        b.onclick = function () {
          var o = placeNow(), id = b.dataset.pl, a = b.dataset.a, inL = o.L.indexOf(id) >= 0, col = inL ? o.L : o.R, i = col.indexOf(id);
          if (a === 'L' && !inL) { o.R.splice(i, 1); o.L.push(id); }
          else if (a === 'R' && inL) { o.L.splice(i, 1); o.R.push(id); }
          else if (a === 'up' && i > 0) { col.splice(i, 1); col.splice(i - 1, 0, id); }
          else if (a === 'down' && i < col.length - 1) { col.splice(i, 1); col.splice(i + 1, 0, id); }
          else return;
          placeSave(o); FJ.plusTab.ecran(B, U);
        };
      });
      $('eDep').onclick = function () { FJ.deplacer(true); };
      $('eRaz').onclick = function () { FJ.place.reset(); FJ.plusTab.ecran(B, U); };
      U.bind('eFx', function (v) { v = +v; S.reduce = v === 0; S.fx = v || 0; save(); FJ.apply(); });
      U.bind('eFx2', function (v) { S.fx2 = v; save(); FJ.apply(); });
      U.bind('eSaver', function (v) { S.saver = v; save(); FJ.apply(); });
      $('eCmds').oninput = function () { p.cmds = this.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12); save(); renderCmd(); };
    },
    formation: function (B, U) {
      var f = P().form, h = '';
      h += '<p class="hint">Pour vos formations : un grand minuteur autour de la sphère, l\'heure de reprise, un message et un QR code à scanner par les stagiaires. À la voix : « pause de 15 minutes », « on reprend », « séance jusqu\'à 17 h », « ajoute 5 minutes ».</p>';
      h += U.chk('fOn', 'Mode formation', f.on, 'Affiche le message et le QR code ci-dessous');
      h += U.fld('Message affiché', '<input type="text" id="fMsg" maxlength="90" value="' + esc(f.msg) + '">');
      h += U.fld('Lien du QR code', '<input type="text" id="fQr" maxlength="400" placeholder="https://… (support, questionnaire, Wi-Fi…)" value="' + esc(f.qr) + '">', 'Vide : pas de QR code.');
      h += U.fld('Légende du QR code', '<input type="text" id="fQrL" maxlength="60" value="' + esc(f.qrLab) + '">');
      h += '<h3>Minuteur</h3><div class="row" style="display:flex;gap:.5em;flex-wrap:wrap">' + [5, 10, 15, 20, 30, 45, 60].map(function (n) { return '<button type="button" class="btn" data-p="' + n + '">Pause ' + n + ' min</button>'; }).join('') + '</div>';
      h += U.fld('Séance jusqu\'à', '<div style="display:flex;gap:.5em"><input type="time" id="fFin" value="' + (f.mode === 'seance' && f.fin ? pad(new Date(f.fin).getHours()) + ':' + pad(new Date(f.fin).getMinutes()) : '') + '"><button type="button" class="btn pri" id="fGo">Lancer</button><button type="button" class="btn" id="fStop"' + (f.mode ? '' : ' disabled') + '>Arrêter le minuteur</button></div>');
      h += U.chk('fMask', 'Masquer mes panneaux personnels pendant la formation', f.masquer, 'Tâches, agenda, actualités, musique et système : rien de privé à l\'écran projeté');
      h += U.chk('fVoix', 'Annonces à voix haute', f.voix, '« Plus que deux minutes de pause », « La pause est terminée, on reprend ! »');
      h += '<div id="fPrev" class="fqprev"></div>';
      B.innerHTML = h;
      function prev() { var q = $('fQr').value.trim(), b = $('fPrev'); try { b.innerHTML = q && root.FJQR ? root.FJQR.svg(q, { quiet: 2, bg: '#fff', fg: '#02060c' }) : ''; } catch (e) { b.textContent = 'Lien trop long pour un QR code.'; } }
      U.bind('fOn', function (v) { F.on(v); });
      U.bind('fMsg', function (v) { f.msg = v; save(); renderForm(); }, 'input');
      U.bind('fQr', function (v) { f.qr = v.trim(); save(); renderForm(); prev(); }, 'input');
      U.bind('fQrL', function (v) { f.qrLab = v; save(); renderForm(); }, 'input');
      U.bind('fMask', function (v) { f.masquer = v; save(); renderForm(); FJ.apply(); });
      U.bind('fVoix', function (v) { f.voix = v; save(); });
      B.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { FJ.toast(F.pause(+b.dataset.p)); FJ.plusTab.formation(B, U); }; });
      $('fGo').onclick = function () { var v = $('fFin').value; if (!v) return; var d = new Date(); d.setHours(+v.split(':')[0], +v.split(':')[1], 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); FJ.toast(F.seance(d.getTime())); FJ.plusTab.formation(B, U); };
      $('fStop').onclick = function () { F.stop(); FJ.plusTab.formation(B, U); };
      prev();
    },
    plus: function (B, U) {
      var p = P(), h = '';
      h += '<h3>Panneaux en plus</h3>';
      [['mois', 'Calendrier du mois et citation du jour'], ['taches', 'Tâches du jour'], ['monde', 'Ciel et monde (soleil, lune, heures du monde)'], ['air', 'Qualité de l\'air, UV et pollens (dans la Météo)']].forEach(function (x) { h += U.chk('pP_' + x[0], x[1], p.panels[x[0]]); });
      h += '<p class="hint">Si l\'écran manque de place, ces panneaux se cachent d\'eux-mêmes.</p>';
      h += '<h3>Heures du monde</h3><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5em">';
      for (var i = 0; i < 4; i++) h += U.sel('pV' + i, [['', '—']].concat(VILLES), p.villes[i] || '');
      h += '</div>';
      if (root.MAGEXE && root.MAGEXE.veille) h += '<h3>Écran de veille</h3>' + U.chk('xVeille', 'Jarvis comme écran de veille de Windows', false, 'Programme Suite MAG installé : le Fond Jarvis s\'affiche en plein écran quand le PC est inactif') +
        U.fld('Après', U.sel('xVMin', [[1, '1 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h']], 10) + ' <button type="button" class="btn" id="xVTest">Essayer</button>');
      if (root.MAGEXE && root.MAGEXE.demarrage) h += '<h3>Démarrage</h3>' + U.chk('xBoot', 'Ouvrir Jarvis en plein écran au démarrage de Windows', false, 'Programme Suite MAG : Jarvis s\'ouvre tout seul à l\'ouverture de la session (F11 pour quitter le plein écran)');
      if (FJ.mode !== 'mj') h += '<h3>Majordome, le cerveau de Jarvis</h3>' + U.chk('xCerv', 'Majordome répond pour ce que Jarvis ne sait pas faire', S.cerveau !== false, 'Mémoire, lumières, routines, rappels, questions libres… Jarvis passe la demande à Majordome et répond avec sa propre voix. Programme Suite MAG : automatique ; Suite du navigateur : Majordome ouvert dans un onglet.');
      h += '<h3>Ambiance</h3>' + U.chk('aMus', 'La sphère et les panneaux suivent la musique', p.amb.musique, 'Dans Lively : le son joué sur le PC fait vibrer la sphère') +
        U.chk('aAuto', 'Couleurs selon l\'heure', p.amb.auto, 'Bleu la nuit, ambre à l\'aube, cyan le jour, rouge au crépuscule (d\'après le soleil de votre ville)');
      var b = p.bien;
      h += '<h3>Bien-être</h3>' + U.chk('bOn', 'Rappels de bien-être', b.on, 'Une carte discrète en haut de l\'écran, et la voix si vous le souhaitez');
      h += U.fld('Pause écran', U.sel('bPause', [[0, 'Jamais'], [30, 'Toutes les 30 min'], [45, 'Toutes les 45 min'], [50, 'Toutes les 50 min'], [60, 'Toutes les heures'], [90, 'Toutes les 1 h 30']], b.pause));
      h += U.fld('Boire de l\'eau', U.sel('bEau', [[0, 'Jamais'], [30, 'Toutes les 30 min'], [45, 'Toutes les 45 min'], [60, 'Toutes les heures'], [90, 'Toutes les 1 h 30'], [120, 'Toutes les 2 h']], b.eau));
      h += U.fld('Posture', U.sel('bPost', [[0, 'Jamais'], [20, 'Toutes les 20 min'], [30, 'Toutes les 30 min'], [40, 'Toutes les 40 min'], [60, 'Toutes les heures']], b.posture));
      h += U.chk('bYeux', 'Repos des yeux toutes les 20 minutes (règle 20-20-20)', b.yeux);
      h += U.fld('Heures', '<div style="display:flex;gap:.5em;align-items:center">de ' + U.sel('bDe', range(5, 13), b.de) + ' à ' + U.sel('bA', range(12, 24), b.a) + '</div>');
      h += U.chk('bSem', 'Seulement du lundi au vendredi', b.semaine) + U.chk('bVoix', 'Rappels à voix haute', b.voix);
      h += '<div style="margin-top:.6em"><button type="button" class="btn" id="bTest">Essayer un rappel</button></div>';
      B.innerHTML = h;
      ['mois', 'taches', 'monde', 'air'].forEach(function (k) { U.bind('pP_' + k, function (v) { p.panels[k] = v; save(); FJ.apply(); if (k === 'air' && v) loadAir(true); }); });
      for (i = 0; i < 4; i++) (function (i) { U.bind('pV' + i, function (v) { p.villes[i] = v; save(); renderMonde(); }); })(i);
      if (root.MAGEXE && root.MAGEXE.veille && $('xVeille')) {
        root.MAGEXE.veille().then(function (r) { var c = $('xVeille'); if (!c) return; c.checked = !!r.on; $('xVMin').value = String(r.min || 10); if (!r.ok) { c.disabled = true; c.parentNode.querySelector('small').textContent = r.portable ? 'Disponible avec la version installée (Suite-MAG-Installation.exe)' : 'Non disponible ici'; } });
        var setV = function () { root.MAGEXE.veille($('xVeille').checked, +$('xVMin').value).then(function (r) { $('xVeille').checked = !!r.on; FJ.toast(r.ok ? (r.on ? 'Jarvis est votre écran de veille (après ' + r.min + ' min)' : 'Écran de veille Jarvis retiré') : 'Impossible de changer l\'écran de veille'); }); };
        U.bind('xVeille', setV); U.bind('xVMin', function () { if ($('xVeille').checked) setV(); });
        $('xVTest').onclick = function () { FJ.closeSettings(); if (root.MAGEXE.essaiVeille) root.MAGEXE.essaiVeille(); };
      }
      if (root.MAGEXE && root.MAGEXE.demarrage) { root.MAGEXE.demarrage().then(function (r) { var c = $('xBoot'); if (c) c.checked = !!r.on; }); U.bind('xBoot', function (v) { root.MAGEXE.demarrage(!!v).then(function (r) { FJ.toast(r.on ? 'Jarvis s\'ouvrira au démarrage de Windows' : 'Jarvis ne s\'ouvrira plus au démarrage'); }); }); }
      U.bind('xCerv', function (v) { S.cerveau = !!v; FJ.save(); });
      U.bind('aMus', function (v) { p.amb.musique = v; save(); });
      U.bind('aAuto', function (v) { setAuto(v); });
      U.bind('bOn', function (v) { b.on = v; next = {}; save(); });
      U.bind('bPause', function (v) { b.pause = +v; delete next.pause; save(); });
      U.bind('bEau', function (v) { b.eau = +v; delete next.eau; save(); });
      U.bind('bPost', function (v) { b.posture = +v; delete next.posture; save(); });
      U.bind('bYeux', function (v) { b.yeux = v; delete next.yeux; save(); });
      U.bind('bDe', function (v) { b.de = +v; save(); });
      U.bind('bA', function (v) { b.a = +v; save(); });
      U.bind('bSem', function (v) { b.semaine = v; save(); });
      U.bind('bVoix', function (v) { b.voix = v; save(); });
      $('bTest').onclick = function () { FJ.closeSettings(); rappel(['pause', 'eau', 'posture', 'yeux'][Math.floor(Math.random() * 4)]); };
    }
  };
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push([i, i + ' h']); return r; }

  /* propriétés de Lively (LivelyProperties.json) propres à ces fonctions */
  FJ.plusProp = function (name, val) {
    var p = P();
    if (name === 'musicReact') { p.amb.musique = !!val; return true; }
    if (name === 'autoTheme') { setAuto(!!val); return true; }
    if (name === 'formation') { F.on(!!val); return true; }
    if (name === 'formationMsg') { p.form.msg = String(val || '').slice(0, 90); renderForm(); return true; }
    if (name === 'formationQr') { p.form.qr = String(val || '').trim().slice(0, 400); renderForm(); return true; }
    if (name === 'bienEtre') { p.bien.on = !!val; return true; }
    return false;
  };

  /* ---------------- Démarrage et rafraîchissements ---------------- */
  function everyMin() { renderMois(); renderMonde(); autoTheme(); bienTick(); }
  function boot() {
    placeApply();
    renderMois(); renderTaches(); renderMonde(); renderForm(); FJ.plusVisible();
    loadAir();
    setInterval(tickForm, 1000);
    var t = new Date(); setTimeout(function () { everyMin(); setInterval(function () { if (!doc.hidden) everyMin(); }, MIN); }, (60 - t.getSeconds()) * 1000 + 50);
    setInterval(function () { if (!doc.hidden && !FJ.loop.paused) loadAir(); }, 20 * MIN);
    // météo arrivée ou changée (nouvelle ville…) : soleil, air, couleurs
    var wxAt = -1; setInterval(function () { var a = FJ.wx && FJ.wx.at || 0; if (a !== wxAt) { wxAt = a; renderMonde(); loadAir(); autoTheme(); } }, 2000);
    root.addEventListener('storage', function (e) { if (e.key === 'agenda-pc.v1') setTimeout(renderMois, 300); });
    autoTheme();
    setTimeout(function () { renderMonde(); loadAir(); FJ.relayout(); }, 3000);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); }); else setTimeout(boot, 0);
})(window);
