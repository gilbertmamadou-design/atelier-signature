/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-montre.js : ne pas modifier ici. */
/* =====================================================================
   Majordome › Montre connectée (Amazfit T-Rex 3, Zepp OS 4 ; toute montre de l'appli Zepp)
   1. Notifications : l'appli Zepp recopie sur la montre les notifications des applis cochées.
      Rappels, minuteurs, réveils : déjà des notifications système (MajordomeBridge, titres ≤ 30, textes ≤ 120).
      Alertes facultatives, décidées ici, au moment où la page lit DÉJÀ la météo, la vigilance ou exécute la
      routine « Bonjour » (aucune tâche réseau en boucle) :
        - vent fort : rafales prévues au-dessus du seuil de l'échafaudage (une fois par jour et par niveau) ;
        - vigilance orange ou rouge (une fois par jour et par niveau) ;
        - résumé du matin après « Bonjour » : heure, météo et vent, premier rendez-vous ;
        - réponse de Jarvis quand on lui parle (désactivée par défaut).
   2. Mini-appli Zepp OS « Jarvis » (zepp/jarvis/) : ses demandes arrivent par MajordomeBridge.Montre (serveur
      127.0.0.1 à jeton) et l'événement « watch » ; la réponse repart en texte (la montre n'a pas de haut-parleur).
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, B = X.B, S = X.S, esc = X.esc, J = X.J;
  var ON = !!(B && B.watchInfo && X.ANDROID);
  var KEYA = 'majordome:montre:alertes';
  var HOUR = 3600000, DAY = 86400000;

  function info() { return ON ? (J(B.watchInfo(), {}) || {}) : {}; }
  function notify(kind, title, text) { if (!ON) return false; try { return !!B.watchNotify(JSON.stringify({ kind: kind, title: title, text: text })); } catch (e) { return false; } }
  function ymd(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  /** Une alerte par jour et par contenu : la clé change si le niveau monte */
  function once(kind, key) {
    var a = X.lsGet(KEYA, {}) || {};
    if (a[kind] === key) return false;
    a[kind] = key; X.lsSet(KEYA, a); return true;
  }
  function strip(h) { return String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/\s+/g, ' ').trim(); }
  function hh(t) { return X.hm(t); }

  /* ---------------- Vent fort (après chaque lecture de la météo) ---------------- */
  // Créneau regardé : reste de la journée (6 h - 20 h) ; après 18 h, la journée de demain.
  function windAlert(d, where, at) {
    if (!d || !d.hourly || !d.hourly.time) return null;
    var t0 = at || Date.now(), lim = +S.windLimit || 45, base = new Date(t0);
    var tomorrow = base.getHours() >= 18, day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (tomorrow ? 1 : 0));
    var dayStr = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
    var over = [], gmax = 0, gAt = 0;
    d.hourly.time.forEach(function (t, i) {
      if (t.slice(0, 10) !== dayStr) return;
      var ms = new Date(t).getTime(), h = new Date(t).getHours();
      if (h < 6 || h > 20 || (!tomorrow && ms < t0 - HOUR)) return;
      var g = +d.hourly.wind_gusts_10m[i] || 0;
      if (g > gmax) { gmax = g; gAt = ms; }
      if (g >= lim) over.push(h);
    });
    if (!over.length) return null;
    var lieu = String(where || '').replace(/^(à|chez) /, '');
    return {
      key: dayStr + ':' + (gmax >= lim * 1.3 ? 2 : 1),
      title: 'Vent fort ' + (tomorrow ? 'demain' : 'aujourd\'hui'),
      text: 'Rafales jusqu\'à ' + Math.round(gmax) + ' km/h vers ' + hh(gAt) + ' (seuil ' + lim + ')' + (lieu && lieu !== 'vous' ? ' à ' + lieu : '') + ', de ' + over[0] + ' h à ' + (over[over.length - 1] + 1) + ' h. Échafaudage : prudence.'
    };
  }
  MJ.onWeather = function (d, where) {
    if (!ON) return;
    var w = windAlert(d, where); if (!w) return;
    var i = info(); if (!i.on || i.vent === false) return;
    if (once('vent', w.key)) notify('vent', w.title, w.text);
  };

  /* ---------------- Vigilance orange / rouge (après chaque lecture de la vigilance) ---------------- */
  function vigAlert(v, at) {
    if (!v || v.lv < 3) return null;
    return { key: ymd(at || Date.now()) + ':' + v.lv + ':' + (v.list || []).join(','), title: 'Vigilance ' + v.col + (v.dep && v.dep.name ? ' · ' + v.dep.name : ''), text: (v.dep ? v.dep.name + ' : ' : '') + (v.list || []).join(', ') + '. Prudence.' };
  }
  MJ.onVigilance = function (v) {
    if (!ON) return;
    var a = vigAlert(v); if (!a) return;
    var i = info(); if (!i.on || i.vigilance === false) return;
    if (once('vigilance', a.key)) notify('vigilance', a.title, a.text);
  };

  /* ---------------- Résumé du matin, après la routine « Bonjour » ---------------- */
  function summary(at, wx, ev, lim) {
    var t = at || Date.now(), parts = [];
    if (wx && wx.d && wx.d.current && t - wx.at < 3 * HOUR) {
      var c = wx.d.current, g = Math.round(c.wind_gusts_10m || 0), sky = X.WMO[c.weather_code] || '';
      parts.push(Math.round(c.temperature_2m) + '°' + (sky ? ' ' + sky : '') + ', vent ' + Math.round(c.wind_speed_10m || 0) + ' raf. ' + g + ' km/h' + (g >= lim ? ' (au-delà du seuil ' + lim + ')' : g >= lim * 0.75 ? ' (prudence)' : ''));
    } else parts.push('Météo non lue');
    if (ev) parts.push((ev.all ? 'Journée : ' : hh(ev.b) + ' ') + (ev.t || 'Rendez-vous'));
    else parts.push('Rien à l\'agenda aujourd\'hui');
    return { title: 'Bonjour · ' + hh(t), text: parts.join(' · ') };
  }
  function firstEvent(t) {
    try {
      var A = window.MAGAgenda; if (!A || !A.instances || (A.perm && !A.perm())) return null;
      var d0 = new Date(t), s = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();
      var l = J(A.instances(s, s + DAY), []) || [];
      var timed = l.filter(function (e) { return !e.all && e.e > t; }).sort(function (a, b) { return a.b - b.b; });
      return timed[0] || l.filter(function (e) { return e.all; })[0] || null;
    } catch (e) { return null; }
  }
  MJ.onRoutine = function (r) {
    if (!ON || !r || r.id !== 'matin') return;
    var i = info(); if (!i.on) return;
    var steps = r.steps || [], jobs = [];
    // vérifications silencieuses, seulement si la routine ne les a pas déjà faites (une lecture, pas de boucle)
    if (i.vent !== false && steps.indexOf('meteo') < 0 && steps.indexOf('vent') < 0) jobs.push(X.weatherData().catch(function () { }));
    if (i.vigilance !== false && steps.indexOf('vigilance') < 0) jobs.push(X.weatherData && MJ.vigilanceData ? MJ.vigilanceData().catch(function () { }) : null);
    return Promise.all(jobs).then(function () {
      if (i.matin === false) return;
      var s = summary(Date.now(), X.lsGet(X.KEY.wx, null), firstEvent(Date.now()), +S.windLimit || 45);
      notify('matin', s.title, s.text);
    });
  };

  /* ---------------- Réponse de Jarvis en notification, et tour de la montre ---------------- */
  var turn = null, chain = Promise.resolve();
  MJ.onAnswer = function (o) {
    var t = o.show || o.say || strip(o.html);
    if (turn) {
      if (t) turn.texts.push(t);
      if (o.ask) { turn.question = true; turn.ouinon = o.ask === 'yesno'; if (o.choices) turn.choix = o.choices.slice(0, 4); if (turn.done) turn.done(); }
      if (turn.got) turn.got();
      return;
    }
    // commande dite au téléphone (micro, mot de réveil) : copie facultative pour la montre
    if (MJ.voiceTurn && t) { var i = info(); if (i.on && i.reponse) notify('reponse', S.name || 'Majordome', t); }
  };
  function waitAnswers(tn) {
    // après la fin du traitement : on attend la première réponse (au plus 2,5 s), puis 300 ms de plus pour les suivantes
    return new Promise(function (res) {
      var fin = function () { clearTimeout(t1); setTimeout(res, 300); };
      var t1 = setTimeout(fin, tn.texts.length ? 0 : 2500);
      if (!tn.texts.length) tn.got = function () { tn.got = null; fin(); };
    });
  }
  function runWatch(d) {
    var tn = { id: String(d.id || ''), texts: [], question: false, ouinon: false };
    if (!/^[0-9a-f]{16}$/.test(tn.id)) return Promise.resolve();
    var i = info();
    turn = tn; MJ.quiet = !i.parle;
    var work;
    // une question (confirmation, précision) termine le tour tout de suite : la montre répond par une nouvelle commande
    var asked = new Promise(function (res) { tn.done = res; });
    try {
      if (d.kind === 'routine') work = Promise.resolve(X.H.routine({ id: String(d.routine || '') }));
      else work = Promise.resolve(X.handle(String(d.text || '').slice(0, 200), 'watch'));
    } catch (e) { work = Promise.reject(e); }
    return Promise.race([work.then(function () { return waitAnswers(tn); }), asked]).catch(function (e) { tn.texts.push('Erreur : ' + (e && e.message || e)); }).then(function () {
      if (turn === tn) turn = null;
      MJ.quiet = false;
      var txt = tn.texts.join(' ').replace(/\s+/g, ' ').trim() || 'C\'est fait.';
      var rep = { ok: true, texte: txt, question: tn.question, ouinon: tn.ouinon };
      try { B.watchReply(tn.id, JSON.stringify(rep)); } catch (e) { }
      return rep;
    });
  }
  MJ.onWatch = function (d) {
    if (!ON || !d) return;
    chain = chain.then(function () { return runWatch(d); }).catch(function () { });
    return chain;
  };

  /* ---------------- Réglages › Montre connectée ---------------- */
  function ago(t) { if (!t) return 'jamais'; var s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'il y a ' + s + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function sw(id, on, t, small) { return '<div class="set"><div class="t">' + t + (small ? '<small>' + small + '</small>' : '') + '</div><label class="sw"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label></div>'; }
  function montreHtml() {
    var h = '<div class="sect" id="f-montre">Montre connectée</div>';
    if (!ON) return h + '<p class="note">Sur le téléphone seulement : l\'appli Zepp (Amazfit) recopie les notifications de Majordome sur la montre, et la mini-appli « Jarvis » de la montre passe par Majordome.</p>';
    var i = info(), favs = String(i.favs || '').split(',').filter(Boolean), rooms = i.rooms || [];
    h += sw('wOn', i.on, 'Montre connectée (Amazfit, appli Zepp)', 'Notifications courtes pour la montre, et liaison locale pour la mini-appli Jarvis.');
    if (!i.on) return h + '<p class="note">Rappels, minuteurs et réveils sont déjà des notifications du téléphone : cochez Majordome dans l\'appli Zepp (voir ci-dessous) pour les recevoir sur la montre. Activez l\'option pour les alertes en plus et la mini-appli.</p>' + zeppHelp(i);
    if (i.notif === false) h += '<div class="set"><div class="t">Notifications de Majordome<small>Refusées : rien n\'arrive sur la montre.</small></div><button class="btn sm" data-fix="notif">Autoriser</button></div>';
    h += '<div class="sect">Sur la montre, en notification</div>' +
      sw('wVent', i.vent !== false, 'Vent fort (chantier)', 'Rafales prévues au-dessus de votre seuil (' + (+S.windLimit || 45) + ' km/h), une fois par jour : vérifié quand je lis la météo.') +
      sw('wVig', i.vigilance !== false, 'Vigilance orange ou rouge', 'Vérifiée quand je lis la vigilance, et avec la routine « Bonjour ».') +
      sw('wMatin', i.matin !== false, 'Résumé du matin', 'Après « Bonjour » : heure, météo et vent, premier rendez-vous.') +
      sw('wRep', !!i.reponse, 'Mes réponses', 'Quand vous me parlez, ma réponse s\'affiche aussi sur la montre.') +
      '<div class="row" style="display:flex;gap:8px;margin:8px 0"><button class="btn sm" id="wTest">Envoyer un essai</button></div>' +
      '<div class="sect">Mini-appli « Jarvis » sur la montre</div>' +
      '<div class="set"><div class="t">Liaison locale<small>' + (i.running ? 'Active sur 127.0.0.1:' + i.port + ' (ce téléphone seulement). Dernière demande : ' + ago(i.lastAt) + (i.refused ? ' · ' + i.refused + ' refusée' + (i.refused > 1 ? 's' : '') : '') + '.' : 'Arrêtée' + (i.err ? ' : ' + esc(i.err) : '') + '.') + '</small></div><span class="chip ' + (i.running ? 'on' : 'warn') + '"><b></b>' + (i.running ? 'Active' : 'Arrêtée') + '</span></div>' +
      '<div class="set"><div class="t">Jeton à recopier<small>Dans l\'appli Zepp : Profil › votre montre › Jarvis › Réglages › Jeton. Sans lui, Majordome refuse tout.</small></div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><code id="wTok" style="font-size:1.15em;letter-spacing:.06em;user-select:all">' + esc(i.token || '') + '</code><button class="btn sm pri" id="wCopy">Copier</button><button class="btn sm" id="wNew">Nouveau jeton</button></div>' +
      '<div class="set"><div class="t">Port<small>À changer seulement si une autre appli l\'utilise ; le même dans les réglages de Jarvis.</small></div><input class="in" id="wPort" type="number" min="1024" max="65535" style="width:110px" value="' + (+i.port || 47615) + '"></div>' +
      sw('wParle', !!i.parle, 'Répondre aussi à voix haute sur le téléphone', 'Par défaut, une demande venue de la montre reçoit sa réponse sur la montre seulement.');
    if (rooms.length) {
      var opt = function (cur) { return '<option value="">—</option>' + rooms.map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === cur ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join(''); };
      h += '<div class="set"><div class="t">3 pièces favorites<small>Boutons de la montre (sinon les 3 premières pièces du pont Hue).</small></div></div><div style="display:flex;gap:6px;flex-wrap:wrap">' + [0, 1, 2].map(function (k) { return '<select class="in" data-wfav="' + k + '" style="flex:1;min-width:30%">' + opt(favs[k] || '') + '</select>'; }).join('') + '</div>';
    }
    h += '<p class="note">Sécurité : Majordome n\'écoute que sur ce téléphone (adresse 127.0.0.1, injoignable depuis le Wi-Fi), exige le jeton à chaque demande et n\'accepte que six actions : état, commande, audio, lumières, routine, clim. Couper l\'option arrête la liaison. Nouveau jeton = l\'ancien ne marche plus.</p>' + zeppHelp(i);
    return h;
  }
  function zeppHelp(i) {
    return '<div class="sect">Dans l\'appli Zepp</div><ol class="note" style="padding-left:20px;margin:6px 0">' +
      '<li>Ouvrez <b>Zepp</b> › <b>Profil</b> › votre montre (T-Rex 3).</li>' +
      '<li><b>Notifications des applis</b> : activez-les, autorisez Zepp à lire les notifications si Android le demande.</li>' +
      '<li>Dans la liste, cochez <b>Majordome</b>.</li>' +
      '<li>Sur la montre, laissez les notifications actives (pas de mode « Ne pas déranger » à ce moment-là).</li></ol>' +
      (i && i.zepp === false ? '<p class="note warn">L\'appli Zepp n\'est pas installée sur ce téléphone.</p>' : '') +
      '<p class="note">La mini-appli Jarvis s\'installe une fois depuis l\'ordinateur ou par QR code : voir le guide « Jarvis sur la montre » fourni avec l\'appli.</p>';
  }
  function bind(b) {
    if (!ON) return;
    var set = function (o) { try { B.watchSet(JSON.stringify(o)); } catch (e) { } };
    var on = function (id, ev, fn) { var e = document.getElementById(id); if (e) e[ev] = fn; };
    on('wOn', 'onchange', function () { set({ on: this.checked }); setTimeout(function () { X.settingsSheet('montre'); }, 400); });
    on('wVent', 'onchange', function () { set({ vent: this.checked }); });
    on('wVig', 'onchange', function () { set({ vigilance: this.checked }); });
    on('wMatin', 'onchange', function () { set({ matin: this.checked }); });
    on('wRep', 'onchange', function () { set({ reponse: this.checked }); });
    on('wParle', 'onchange', function () { set({ parle: this.checked }); });
    on('wPort', 'onchange', function () { var v = Math.round(+this.value); if (!(v >= 1024 && v <= 65535)) { X.toast('Port entre 1024 et 65535'); this.value = info().port; return; } set({ port: v }); setTimeout(function () { X.settingsSheet('montre'); }, 600); });
    on('wCopy', 'onclick', function () { B.watchCopy(); });
    on('wNew', 'onclick', function () {
      X.ask('Créer un nouveau jeton ? L\'ancien ne marchera plus : il faudra recopier le nouveau dans les réglages de Jarvis (appli Zepp).', 'yesno', { danger: true, yes: 'Nouveau jeton', k: 'Montre connectée' }).then(function (ok) { if (!ok) return; B.watchNewToken(); X.toast('Nouveau jeton créé'); X.settingsSheet('montre'); });
    });
    on('wTest', 'onclick', function () {
      var ok = notify('essai', 'Essai · ' + (S.name || 'Majordome'), 'Si ce message est sur la montre, les notifications de Majordome arrivent bien.');
      X.toast(ok ? 'Essai envoyé : regardez la montre' : 'Essai impossible : notifications de Majordome refusées ?');
    });
    b.querySelectorAll('[data-wfav]').forEach(function (s) {
      s.onchange = function () { var l = []; b.querySelectorAll('[data-wfav]').forEach(function (x) { if (x.value && l.indexOf(x.value) < 0) l.push(x.value); }); set({ favs: l.join(',') }); };
    });
  }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + montreHtml(); };
  MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };

  // pour les essais
  MJ.montre = { windAlert: windAlert, vigAlert: vigAlert, summary: summary, firstEvent: firstEvent, runWatch: runWatch };
})();
