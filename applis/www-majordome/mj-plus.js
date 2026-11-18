/* =====================================================================
   Majordome › Plus : mieux se comprendre et maison automatique
   - Plusieurs ordres dans une phrase : « ferme les volets et allume le salon » (découpe de mj-appris.js).
   - Suites : « et la cuisine ? » après une commande de lumière, « et demain ? » après la météo.
   - Wikipédia : « c'est quoi un ornithorynque », « qui est Victor Hugo » (résumé en français, connexion nécessaire).
   - Point du soir : météo et agenda de demain, lumières allumées et volets ouverts (proposition de tout fermer).
   - Annonces sur les Echo : « annonce à table » → « Alexa, annonce à table » (toutes les enceintes).
   - Automatismes (exécutés par le téléphone, même Majordome fermé, MajordomeBridge.autoSet) :
       vent fort → rentrer les stores choisis ; retour à la maison (Wi-Fi de la maison) → routine « Je rentre » ;
       téléphone branché le soir → routine « Bonne nuit » ; réveil en douceur avant l'alarme du téléphone.
     Les routines sont « compilées » ici en requêtes Hue et actions TaHoma : seules ces étapes s'exécutent sans la page.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, S = X.S, esc = X.esc, B = X.B, NLU = window.MJNLU, DAY = 864e5;
  function known(r) { return MJ.known ? MJ.known(r) : r && r.intent !== 'unknown' && r.intent !== 'empty'; }
  function ctx() { return X.ctx ? X.ctx() : { now: Date.now(), names: [] }; }

  /* ---------- Plusieurs ordres dans une phrase ---------- */
  var NOSPLIT = /^(social|websearch|teach|teach_forget|note_add|list_add|list_remove|sms|reminder|reminder_cancel|msgs|calc|convert|quiz|wiki|announce|call|search|website|agenda_add|translate|book|routine)$/;
  MJ.multi = function (text, r) {
    if (!MJ.splitActs || NOSPLIT.test(r.intent) || !/[,;]|\s(et|puis|ensuite)\s/i.test(text)) return null;
    var parts = MJ.splitActs(text); if (parts.length < 2) return null;
    var rs = parts.map(function (pc) { return NLU.parse(pc, ctx()); });
    if (rs.some(function (x) { return !known(x) || NOSPLIT.test(x.intent) || /^(stop|thanks|repeat|greet|help)$/.test(x.intent); })) return null;
    var chain = Promise.resolve();
    rs.forEach(function (x) { chain = chain.then(function () { return Promise.resolve(X.exec(x)).catch(function (e) { console.warn(e); }); }); });
    return chain;
  };

  /* ---------- Suites de questions ---------- */
  var last = null;
  var prevAfter = MJ.afterCmd;
  MJ.afterCmd = function (text, r) {
    if (r && known(r) && !/^(stop|thanks|repeat|help|wake|confirm_yes|confirm_no|slot|teach|teach_list|teach_forget|quiz)$/.test(r.intent)) last = { text: text, r: r, at: Date.now() };
    return prevAfter ? prevAfter(text, r) : undefined;
  };
  var TIME = /\b(aujourd hui|demain|apres demain|ce soir|ce matin|cet apres midi|cette nuit|ce week end|le week end|ce weekend|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|la semaine prochaine|cette semaine|maintenant|tout a l heure)\b/g;
  MJ.follow = function (text) {
    if (!last || Date.now() - last.at > 10 * 60000) return null;
    // « et … » (prep() retire le « et » de tête : on le cherche dans le texte brut, après un éventuel mot de réveil)
    var mm = /^\s*(?:[^\s,]+[\s,]+)?et\s+(.+?)[\s?!.…]*$/i.exec(String(text)); if (!mm) return null;
    var raw = mm[1].trim(), t = NLU.prep(raw, ctx()).t, m = [null, t], L = last.r, p = JSON.parse(JSON.stringify(L.p || {}));
    if (!t) return null;
    var base = NLU.prep(last.text, ctx()).t;
    if (new RegExp(TIME.source).test(m[1]) || /^(a|au|en|pour) [a-z]/.test(m[1]) && !/^(light|shutter)$/.test(L.intent)) {
      var r2 = NLU.parse(base.replace(TIME, ' ').replace(/\s+/g, ' ').trim() + ' ' + raw, ctx());
      if (r2.intent === L.intent) return r2;
    }
    var tg = raw.replace(/^(?:pour |dans |avec )?(?:le |la |les |l'|l’|du |de la |des )?/i, '').trim();
    if (L.intent === 'light' && /^(on|off|bri|ct|color|step)$/.test(p.act) && tg) { p.target = tg; p.full = tg; p.all = /^(tout|toute la maison|partout)$/i.test(tg); delete p.at; delete p.delay; return { intent: 'light', p: p, t: t, raw: text }; }
    if (L.intent === 'shutter' && tg) { p.target = tg; p.kind = 'all'; delete p.at; return { intent: 'shutter', p: p, t: t, raw: text }; }
    var r3 = NLU.parse(base + ' ' + raw, ctx());
    return r3.intent === L.intent ? r3 : null;
  };

  /* ---------- Wikipédia ---------- */
  H.wiki = function (p) {
    var q = String(p.q || '').replace(/^(?:un |une |le |la |les |l'|l’|des |du |de la |de l')/i, '').trim();
    if (!q) return X.answer('Que voulez-vous savoir ?').done;
    if (X.online && !X.online()) return X.answer('Il faut une connexion internet pour chercher dans Wikipédia.').done;
    var base = 'https://fr.wikipedia.org';
    return X.httpText(base + '/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=' + encodeURIComponent(q)).then(function (t) {
      var d = X.J(t, {}) || {}, h = d.query && d.query.search && d.query.search[0];
      if (!h) throw new Error('none');
      return X.httpText(base + '/api/rest_v1/page/summary/' + encodeURIComponent(h.title.replace(/ /g, '_'))).then(function (t2) { return X.J(t2, null); });
    }).then(function (s) {
      if (!s || !s.extract) throw new Error('none');
      var ex = String(s.extract).replace(/\s*\([^()]*\)/g, '').replace(/\s+/g, ' ').trim(), sent = ex.match(/[^.!?]+[.!?]+(\s|$)/g) || [ex];
      var say = s.type === 'disambiguation' ? 'Il y a plusieurs sens pour « ' + q + ' ». Précisez, par exemple : ' + q + ' et un mot de plus.' : sent.slice(0, 2).join(' ').trim();
      var url = s.content_urls && (s.content_urls.mobile || s.content_urls.desktop) && (s.content_urls.mobile || s.content_urls.desktop).page;
      var c = X.answer({ say: say, html: '<div class="k">Wikipédia · ' + esc(s.title || q) + '</div><p>' + esc(sent.slice(0, 5).join(' ').trim()) + '</p>' + (url ? '<div class="row"><button class="btn sm" data-wk>Lire l\'article</button></div>' : '') + '<p class="note">Source : Wikipédia (licence CC BY-SA).</p>' });
      var b = c.querySelector('[data-wk]'); if (b) b.onclick = function () { X.openLink(url, 'l\'article Wikipédia'); };
      return c.done;
    }).catch(function () { return X.answer('Je n\'ai rien trouvé sur « ' + q + ' » dans Wikipédia.').done; });
  };

  /* ---------- Recherche sur internet : résultats dans le navigateur ; réponse courte de Wikipédia quand elle existe ---------- */
  var ENGINES = { google: ['Google', 'https://www.google.com/search?q='], qwant: ['Qwant', 'https://www.qwant.com/?q='], duck: ['DuckDuckGo', 'https://duckduckgo.com/?q='], bing: ['Bing', 'https://www.bing.com/search?q='], ecosia: ['Ecosia', 'https://www.ecosia.org/search?q='] };
  H.websearch = function (p) {
    var q = String(p.q || '').replace(/\s*\?+$/, '').trim(); if (!q) return X.answer('Que voulez-vous chercher ?').done;
    var e = ENGINES[S.searchEngine] || ENGINES.google, url = e[1] + encodeURIComponent(q);
    var c = X.answer({ say: X.ack('Je cherche « ' + q + ' » sur ' + e[0]), html: '<div class="k">Recherche · ' + esc(e[0]) + '</div><p>« ' + esc(q) + ' »</p><div class="row"><button class="btn sm pri" data-ws>Voir les résultats</button></div>' });
    c.querySelector('[data-ws]').onclick = function () { X.openLink(url, 'la recherche'); };
    return c.done.then(function () { return X.openLink(url, 'la recherche'); });
  };
  MJ.searchEngines = ENGINES;

  /* ---------- Style de voix (préréglages de mj-voix.js) ---------- */
  H.voicestyle = function (p) {
    var w = String(p.style || ''), k = /sensuel|douce|doux/.test(w) ? 'sensuelle' : /energique|dynamique/.test(w) ? 'energique' : /calme|pose/.test(w) ? 'calme' : /joyeu/.test(w) ? 'joyeuse' : /grave|profond/.test(w) ? 'grave' : /intime/.test(w) ? 'intime' : /conteur/.test(w) ? 'conteur' : 'aucun';
    var FX = window.MJVoix && MJVoix.FX; if (!FX || !FX[k]) return X.answer('Je ne connais pas ce style de voix.').done;
    S.fx = k; S.fxo = null; X.saveS();
    if (S.tts !== 'piper') return X.answer({ say: 'C\'est noté. Le style s\'entend seulement avec une voix Piper : choisissez-en une dans Réglages, Voix.', k: 'Voix' }).done;
    return X.answer(k === 'aucun' ? 'Je reprends ma voix habituelle.' : { sensuelle: 'Voilà… une voix plus douce.', energique: 'C\'est parti, en pleine forme !', calme: 'Bien. Je parlerai calmement.', joyeuse: 'Avec plaisir, et le sourire !', grave: 'Entendu. Une voix plus grave.', intime: 'Comme ceci, tout près de vous.', conteur: 'Il était une fois… une voix de conteur.' }[k]).done;
  };

  /* ---------- Annonce sur les Echo ---------- */
  H.announce = function (p) {
    var t = String(p.text || '').trim(); if (!t) return X.answer('Que faut-il annoncer ?').done;
    X.card('<div class="k">Annonce</div><p>« ' + esc(t) + ' » sur toutes les Echo.</p><p class="note">L\'Echo la plus proche doit entendre le téléphone.</p>');
    return X.alexaSay('annonce ' + t);
  };

  /* ---------- Point du soir ---------- */
  function andList(l) { return l.length > 1 ? l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1] : l[0] || ''; }
  H.evening = function () {
    var t0 = NLU.startOfDay(Date.now()) + DAY;
    var chain = X.answer({ say: X.withSir('Voici le point du soir') + '.', k: 'Point du soir' }).done;
    chain = chain.then(function () { return H.weather({ when: 'tomorrow' }); }).catch(function () { });
    if (X.ANDROID) chain = chain.then(function () { return H.agenda({ from: t0, to: t0 + DAY }); }).catch(function () { });
    return chain.then(function () {
      return Promise.all([MJ.lightsOn ? MJ.lightsOn() : null, MJ.shuttersOpen ? MJ.shuttersOpen() : null]);
    }).then(function (res) {
      var lo = res[0], so = res[1], parts = [];
      if (lo && lo.length) parts.push('lumière allumée : ' + andList(lo));
      if (so && so.length) parts.push((so.length > 1 ? 'volets ouverts : ' : 'volet ouvert : ') + andList(so));
      if (!parts.length) return (lo || so) ? X.answer({ say: 'Dans la maison, tout est éteint' + (so ? ' et fermé' : '') + '.', k: 'Maison' }).done : null;
      return X.ask('Dans la maison : ' + parts.join(' ; ') + '. J\'éteins et je ferme ?', 'yesno', { yes: 'Oui, tout fermer', k: 'Maison' }).then(function (y) {
        if (!y) return X.answer('D\'accord, je laisse comme ça.').done;
        var c = Promise.resolve();
        if (lo && lo.length) c = c.then(function () { return X.exec({ intent: 'light', p: { act: 'off', all: true } }); });
        (so || []).forEach(function (n) { c = c.then(function () { return MJ.shutterRun({ act: 'close', target: n, kind: 'all' }, true); }); });
        return c.then(function () { return X.answer(X.withSir('C\'est fait. Bonne soirée') + '.').done; });
      });
    });
  };

  /* ---------- Automatismes : préparés ici, exécutés par le téléphone ---------- */
  var AUTO = !!(B && B.autoSet && X.ANDROID && !X.PC);
  function A() {
    var a = S.auto && typeof S.auto === 'object' ? S.auto : (S.auto = {});
    a.vent = Object.assign({ on: false, limit: 50, urls: null }, a.vent || {});
    a.retour = Object.assign({ on: false, routine: 'rentre' }, a.retour || {});
    a.nuit = Object.assign({ on: false, from: '22:00', routine: 'nuit' }, a.nuit || {});
    a.reveil = Object.assign({ on: false, lead: 10, group: '', bri: 70, urls: [], matin: true }, a.reveil || {});
    return a;
  }
  function place() { var p = S.place; return p && p.lat != null ? { lat: +p.lat, lon: +p.lon } : { lat: 43.3, lon: 5.37 }; }
  /** Routine → { day:{reqs,acts,say}, night:{…}, skip:[] } : seules les lumières Hue, les volets TaHoma et les phrases passent */
  function compile(id) {
    var r = (S.routines || []).filter(function (x) { return x.id === id; })[0];
    var pk = { name: r ? r.name : '', day: { reqs: [], acts: [], say: [] }, night: { reqs: [], acts: [], say: [] }, skip: [] };
    if (!r) return pk;
    (r.steps || []).forEach(function (s0) {
      var m = /^(jour|nuit)>/.exec(s0), s = m ? s0.slice(m[0].length) : s0, tg = m ? [m[1] === 'jour' ? pk.day : pk.night] : [pk.day, pk.night];
      function add(k, v) { tg.forEach(function (t) { t[k] = t[k].concat(v); }); }
      if (/^dit:/.test(s)) return add('say', [s.slice(4).trim()]);
      if (s === 'bonnenuit') return add('say', ['Bonne nuit']);
      if (s === 'salut') return add('say', ['Bonjour']);
      var text = /^(lum|cmd|alexa):/.test(s) ? s.replace(/^(lum|cmd|alexa):/, '').replace(/^(alexa|echo)\b[ ,]*/i, '') : null;
      if (text != null) {
        var pr = NLU.parse(text, ctx()), q;
        if (pr.intent === 'light' && MJ.lightPlanFor && (q = MJ.lightPlanFor(pr.p)) && q.length) return add('reqs', q);
        if (pr.intent === 'shutter' && MJ.shutterActsFor && (q = MJ.shutterActsFor(pr.p)) && q.length) return add('acts', q);
      }
      pk.skip.push(s);
    });
    return pk;
  }
  function fade(gid, bri, minutes) {
    if (!gid || !MJ.hueGroupPlan) return [];
    var a = MJ.hueGroupPlan(gid, { act: 'bri', bri: 1 }), b = MJ.hueGroupPlan(gid, { act: 'bri', bri: bri }), v2 = MJ.hueV2 && MJ.hueV2();
    b.forEach(function (q) { q.body = Object.assign({}, q.body); if (v2) q.body.dynamics = { duration: Math.min(6000000, minutes * 60000) }; else q.body.transitiontime = Math.min(65535, minutes * 600); });
    return a.concat(b);
  }
  function payload() {
    var a = A(), pl = place(), out = { lat: pl.lat, lon: pl.lon };
    var vurls = a.vent.urls || (MJ.somfyDevs ? MJ.somfyDevs().filter(function (d) { return d.kind === 'banne'; }).map(function (d) { return d.url; }) : []);
    out.vent = a.vent.on && MJ.somfyActsFor ? { on: true, limit: +a.vent.limit || 50, acts: MJ.somfyActsFor(vurls, 'close') } : { on: false };
    out.retour = a.retour.on ? Object.assign({ on: true }, compile(a.retour.routine)) : { on: false };
    out.nuit = a.nuit.on ? Object.assign({ on: true, from: a.nuit.from || '22:00' }, compile(a.nuit.routine)) : { on: false };
    if (a.reveil.on) {
      var s1 = MJ.somfyActsFor ? MJ.somfyActsFor(a.reveil.urls, 'pos', 30) : [], s2 = MJ.somfyActsFor ? MJ.somfyActsFor(a.reveil.urls, 'open') : [];
      out.reveil = { on: true, lead: +a.reveil.lead || 10, s1: { reqs: fade(a.reveil.group, +a.reveil.bri || 70, +a.reveil.lead || 10), acts: s1 }, s2: { reqs: [], acts: s2 }, matin: !!a.reveil.matin };
    } else out.reveil = { on: false };
    return out;
  }
  function push() { if (!AUTO) return; try { B.autoSet(JSON.stringify(payload())); } catch (e) { console.warn(e); } }
  MJ.autoPush = push;
  if (AUTO) {
    setTimeout(push, 5000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) push(); });
  }

  /* ---------- Réglages › Automatismes ---------- */
  function rtOpts(cur) { return (S.routines || []).map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === cur ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join(''); }
  function sw(id, on) { return '<label class="sw"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label>'; }
  function searchHtml() {
    return '<div class="sect" id="f-recherche">Recherche sur internet</div><div class="set"><div class="t">Moteur de recherche<small>« Cherche sur internet … » ouvre les résultats dans le navigateur.</small></div><select class="in" id="seEng" style="max-width:150px">' +
      Object.keys(ENGINES).map(function (k) { return '<option value="' + k + '"' + ((S.searchEngine || 'google') === k ? ' selected' : '') + '>' + ENGINES[k][0] + '</option>'; }).join('') + '</select></div>';
  }
  function html() {
    if (!AUTO) return searchHtml();
    var a = A(), info = X.J(B.autoInfo ? B.autoInfo() : '{}', {}) || {}, devs = MJ.somfyDevs ? MJ.somfyDevs() : [], groups = MJ.hueGroups ? MJ.hueGroups() : [];
    var vurls = a.vent.urls || devs.filter(function (d) { return d.kind === 'banne'; }).map(function (d) { return d.url; });
    function skipNote(id) { var c = compile(id), n = c.day.reqs.length + c.day.acts.length + c.night.reqs.length + c.night.acts.length; return n ? (c.skip.length ? ' Sans la page, seules les lumières, les volets et les phrases (en notification) s\'exécutent.' : '') : ' Cette routine n\'a ni lumières Hue ni volets TaHoma : rien à faire tout seul.'; }
    var h = searchHtml() + '<div class="sect" id="f-auto">Automatismes</div><p class="note">Exécutés par le téléphone, même Majordome fermé, s\'il est sur le Wi-Fi de la maison.</p>';
    h += '<div class="set"><div class="t">Vent fort : rentrer les stores<small>Contrôle toutes les 20 minutes (Open-Meteo, rafales maintenant et dans l\'heure).' + (info.vent && info.vent.last ? ' Dernière fois : ' + esc(new Date(info.vent.last).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '.' : '') + '</small></div>' + sw('auVent', a.vent.on) + '</div>';
    if (a.vent.on) {
      h += '<div class="set"><div class="t">Rafales à partir de (km/h)</div><input class="in" id="auVentL" type="number" min="20" max="120" step="5" value="' + (+a.vent.limit || 50) + '" style="width:90px"></div>' +
        (devs.length ? devs.map(function (d) { return '<label class="set" style="gap:10px;cursor:pointer"><div class="t">' + esc(d.name) + '<small>' + esc(d.kind) + '</small></div><input type="checkbox" data-auv="' + esc(d.url) + '"' + (vurls.indexOf(d.url) >= 0 ? ' checked' : '') + ' style="width:20px;height:20px"></label>'; }).join('') : '<p class="note">Reliez d\'abord le boîtier TaHoma (Volets et stores).</p>');
    }
    h += '<div class="set"><div class="t">Retour à la maison<small>Quand le téléphone retrouve le Wi-Fi de la maison après au moins 40 minutes ailleurs (reconnu au pont Hue ou au boîtier TaHoma).' + skipNote(a.retour.routine) + '</small></div>' + sw('auRet', a.retour.on) + '</div>';
    if (a.retour.on) h += '<div class="set"><div class="t">Routine lancée</div><select class="in" id="auRetR" style="max-width:170px">' + rtOpts(a.retour.routine) + '</select></div>';
    h += '<div class="set"><div class="t">Téléphone branché le soir<small>Le soir, quand vous mettez le téléphone en charge (vérifié toutes les 15 minutes), une fois par nuit.' + skipNote(a.nuit.routine) + '</small></div>' + sw('auNuit', a.nuit.on) + '</div>';
    if (a.nuit.on) h += '<div class="set"><div class="t">À partir de</div><input class="in" id="auNuitH" type="time" value="' + esc(a.nuit.from) + '" style="width:110px"></div><div class="set"><div class="t">Routine lancée</div><select class="in" id="auNuitR" style="max-width:170px">' + rtOpts(a.nuit.routine) + '</select></div>';
    h += '<div class="set"><div class="t">Réveil en douceur<small>Avant l\'alarme du téléphone (entre 4 h et 11 h) : la lumière monte doucement et les volets s\'entrouvrent, puis s\'ouvrent à l\'heure de l\'alarme.' + (info.reveil && info.reveil.next ? ' Prochain : ' + esc(new Date(info.reveil.next).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })) + '.' : '') + '</small></div>' + sw('auRev', a.reveil.on) + '</div>';
    if (a.reveil.on) {
      h += '<div class="set"><div class="t">Commencer avant l\'alarme</div><select class="in" id="auRevL" style="width:110px">' + [5, 10, 15, 20, 30].map(function (n) { return '<option value="' + n + '"' + (+a.reveil.lead === n ? ' selected' : '') + '>' + n + ' min</option>'; }).join('') + '</select></div>' +
        '<div class="set"><div class="t">Lumière</div><select class="in" id="auRevG" style="max-width:170px"><option value="">Aucune</option>' + groups.filter(function (g) { return g.kind === 'room' || g.kind === 'zone'; }).map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === a.reveil.group ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="set"><div class="t">Luminosité finale (%)</div><input class="in" id="auRevB" type="number" min="10" max="100" step="10" value="' + (+a.reveil.bri || 70) + '" style="width:90px"></div>' +
        devs.filter(function (d) { return d.kind !== 'banne'; }).map(function (d) { return '<label class="set" style="gap:10px;cursor:pointer"><div class="t">Ouvrir ' + esc(d.name) + '</div><input type="checkbox" data-aur="' + esc(d.url) + '"' + (a.reveil.urls.indexOf(d.url) >= 0 ? ' checked' : '') + ' style="width:20px;height:20px"></label>'; }).join('') +
        '<div class="set"><div class="t">Point du matin<small>Une notification à l\'heure de l\'alarme : touchez-la pour la routine « Bonjour ».</small></div>' + sw('auRevM', a.reveil.matin) + '</div>';
    }
    return h;
  }
  function bind(b) {
    var se = b.querySelector('#seEng'); if (se) se.onchange = function () { S.searchEngine = this.value; X.saveS(); };
    if (!AUTO) return;
    var $ = function (id) { return b.querySelector('#' + id); }, a = A();
    function save(re) { X.saveS(); push(); if (re) X.settingsSheet('auto'); }
    function on(id, ev, fn) { var e = $(id); if (e) e[ev] = fn; }
    on('auVent', 'onchange', function () { a.vent.on = this.checked; save(true); });
    on('auVentL', 'onchange', function () { a.vent.limit = Math.max(20, Math.min(120, +this.value || 50)); save(); });
    on('auRet', 'onchange', function () { a.retour.on = this.checked; save(true); });
    on('auRetR', 'onchange', function () { a.retour.routine = this.value; save(true); });
    on('auNuit', 'onchange', function () { a.nuit.on = this.checked; save(true); });
    on('auNuitH', 'onchange', function () { a.nuit.from = this.value || '22:00'; save(); });
    on('auNuitR', 'onchange', function () { a.nuit.routine = this.value; save(true); });
    on('auRev', 'onchange', function () { a.reveil.on = this.checked; save(true); });
    on('auRevL', 'onchange', function () { a.reveil.lead = +this.value || 10; save(); });
    on('auRevG', 'onchange', function () { a.reveil.group = this.value; save(); });
    on('auRevB', 'onchange', function () { a.reveil.bri = Math.max(10, Math.min(100, +this.value || 70)); save(); });
    on('auRevM', 'onchange', function () { a.reveil.matin = this.checked; save(); });
    b.addEventListener('change', function (e) {
      var v = e.target.closest('[data-auv]');
      if (v) { a.vent.urls = [].slice.call(b.querySelectorAll('[data-auv]')).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.auv; }); save(); }
      var w = e.target.closest('[data-aur]');
      if (w) { a.reveil.urls = [].slice.call(b.querySelectorAll('[data-aur]')).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.aur; }); save(); }
    });
  }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + html(); };
  MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };

  if (X.HELP) X.HELP.splice(X.HELP.length - 1, 0, ['Plus', ['Ferme les volets et allume le salon', 'Et la cuisine ? (après une commande)', 'Et demain ? (après la météo)', 'C\'est quoi un ornithorynque ?', 'Qui est Victor Hugo ?', 'Le point du soir', 'Annonce à table', 'Tourne la caméra du jardin à gauche', 'Cherche sur internet les horaires de la piscine', 'Prends une voix sensuelle', 'Parle de façon énergique', 'Reprends ta voix normale']]);
})();
