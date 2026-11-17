/* =====================================================================
   Majordome › Volets et stores Somfy (boîtier TaHoma, API locale du « mode développeur »)
   - Réglages › Maison › Volets et stores : recherche du boîtier sur le Wi-Fi (mDNS), code PIN, jeton créé dans l'appli
     TaHoma by Somfy (Paramètres de la box › toucher 7 fois le code PIN › Mode développeur › Générer un jeton).
     Le jeton reste dans un fichier privé de l'appli Android (MajordomeBridge.somfySet), jamais dans la page ni les sauvegardes.
   - Commandes (mj-nlu.js, intention « shutter ») : « ferme les stores », « ouvre le volet de la chambre »,
     « descends le store du salon à moitié », « mets les volets en position favorite », « arrête les volets »,
     « est-ce que les volets sont fermés ? ».
   - Routines : les étapes « Demander à Alexa » qui visent des volets ou des stores passent directement par le boîtier
     quand il est réglé (plus besoin que l'Echo entende).
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, S = X.S, esc = X.esc, B = X.B, NLU = window.MJNLU, deacc = X.deacc;
  var OK = !!(B && B.somfyInfo && B.somfyReq && !X.PC);
  var KEYS = 'majordome:somfy';   // liste des volets (noms, adresses, commandes) : jamais le jeton
  var model = X.lsGet(KEYS, null), modelAt = 0, info = { set: false }, waits = {}, found = null, busy = null, lastErr = '';
  function J(s) { return X.J(s, {}) || {}; }
  function refreshInfo() { if (OK) try { info = J(B.somfyInfo()); } catch (e) { info = { set: false }; } return info; }
  refreshInfo();
  if (!info.set && model) { model = null; X.lsSet(KEYS, null); }
  MJ.somfyReady = function () { return OK && !!info.set; };

  /* ---------- Échanges avec le pont natif (événement « somfy ») ---------- */
  var prevEv = window.majordomeEvent;
  window.majordomeEvent = function (type, data) {
    if (type !== 'somfy') return prevEv ? prevEv(type, data) : undefined;
    var d = J(data);
    if (d.op === 'res' && waits[d.id]) {
      var w = waits[d.id]; delete waits[d.id]; clearTimeout(w.t);
      if (d.err) return w.ko(err(d.err));
      if (d.code === 401 || d.code === 403) return w.ko(err('unauthorized'));
      if (d.code >= 400) return w.ko(err('http'));
      w.ok(X.J(d.body, null));
    } else if (d.op === 'set') {
      busy = null;
      if (d.ok) { refreshInfo(); lastErr = ''; setModel(X.J(d.body, [])); X.toast('Boîtier TaHoma relié : ' + model.devs.length + ' volet' + (model.devs.length > 1 ? 's' : '') + ' et store' + (model.devs.length > 1 ? 's' : '')); }
      else lastErr = errText(d.err);
      if (X.curSheet() === 'settings') X.settingsSheet('somfy');
    } else if (d.op === 'later') {
      var pg = progs().filter(function (x) { return x.id === d.id; })[0];
      if (pg && !pg.days.length) { S.sfProgs = progs().filter(function (x) { return x.id !== d.id; }); X.saveS(); }
      if (d.ok) X.toast('Volets : ' + (d.label || 'programme') + ', c\'est fait');
      else X.card('<div class="k">Volets et stores</div><p>Programme « ' + esc(d.label || '') + ' » : ' + esc(errText(d.err)) + '</p>', 'err');
      renderStores();
    } else if (d.op === 'discover') {
      found = d.list || []; busy = null; if (d.err) lastErr = 'Recherche : ' + d.err;
      if (X.curSheet() === 'settings') X.settingsSheet('somfy');
    }
  };
  function err(c) { var e = new Error(c); e.code = c; return e; }
  function req(method, path, body) {
    return new Promise(function (ok, ko) {
      var id = 's' + X.uid();
      waits[id] = { ok: ok, ko: ko, t: setTimeout(function () { if (waits[id]) { delete waits[id]; ko(err('unreachable')); } }, 15000) };
      try { B.somfyReq(id, method, path, body ? JSON.stringify(body) : ''); } catch (e) { delete waits[id]; ko(e); }
    });
  }
  function errText(code) {
    return code === 'unreachable' ? 'Le boîtier TaHoma ne répond pas : êtes-vous sur le Wi-Fi de la maison ?' :
      code === 'unauthorized' ? 'Le boîtier TaHoma refuse le jeton : il a peut-être été supprimé dans l\'appli TaHoma. Créez-en un nouveau et enregistrez-le dans mes réglages.' :
      code === 'cert' ? 'Le boîtier n\'a pas présenté un certificat Somfy valide : par prudence, je n\'envoie rien.' :
      code === 'certname' ? 'Le certificat du boîtier ne correspond pas au code PIN saisi : vérifiez le code PIN.' :
      code === 'notset' ? 'Le boîtier TaHoma n\'est pas réglé : Réglages › Maison › Volets et stores.' :
      code === 'notprivate' ? 'Cette adresse n\'est pas celle d\'un appareil du réseau local : refusée.' :
      code === 'pin' ? 'Le code PIN doit avoir la forme 1234-5678-9012.' :
      code === 'token' ? 'Collez le jeton créé dans l\'appli TaHoma (mode développeur).' :
      code === 'port' ? 'Port invalide (8443 en général).' :
      'Le boîtier TaHoma a répondu par une erreur.';
  }

  /* ---------- Modèle : les volets et stores du boîtier ---------- */
  var MOVERS = /^(RollerShutter|ExteriorScreen|Screen|Awning|Pergola|Shutter|Blind|ExteriorVenetianBlind|VenetianBlind|Curtain|Window|SwingingShutter|Gate|GarageDoor)$/;
  function stateOf(d, n) { var s = (d.states || []).filter(function (x) { return x.name === n; })[0]; return s ? s.value : undefined; }
  function setModel(list) {
    var devs = (Array.isArray(list) ? list : []).filter(function (d) {
      var ui = d.definition && d.definition.uiClass || '', cmds = (d.definition && d.definition.commands || []).map(function (c) { return c.commandName; });
      return d.deviceURL && (MOVERS.test(ui) || cmds.indexOf('close') >= 0 && cmds.indexOf('open') >= 0) && !/^(Gate|GarageDoor)$/.test(ui);
    }).map(function (d) {
      var cmds = (d.definition.commands || []).map(function (c) { return c.commandName; });
      var cl = stateOf(d, 'core:ClosureState'), oc = stateOf(d, 'core:OpenClosedState'), dep = stateOf(d, 'core:DeploymentState');
      return { url: d.deviceURL, name: String(d.label || 'Volet'), ui: d.definition.uiClass || '', cmds: cmds,
        closure: typeof cl === 'number' ? cl : null, deploy: typeof dep === 'number' ? dep : null, oc: typeof oc === 'string' ? oc : null, ok: d.available !== false };
    });
    model = { devs: devs, at: Date.now() }; modelAt = Date.now(); X.lsSet(KEYS, model);
    return model;
  }
  function fetchModel(force) {
    if (!force && model && Date.now() - modelAt < 20000) return Promise.resolve(model);
    return req('GET', '/setup/devices').then(setModel);
  }
  function kindOf(d) {
    var n = deacc(d.name);
    if (/^(Awning|Pergola)$/.test(d.ui) || /\b(banne|terrasse|pergola|toile)\b/.test(n)) return 'banne';
    if (/\bvolet|persienne/.test(n) || /^(RollerShutter|Shutter|SwingingShutter)$/.test(d.ui) && !/\bstore/.test(n)) return 'volet';
    return 'store';
  }
  function words(s) { return deacc(s).replace(/\b(vr|v r|ve r|ve erre|v erre|vers|verre|vert|ver)\b/g, ' ').replace(/\b(le|la|les|l|du|de|des|d|volets?|stores?|roulants?|bannes?)\b/g, ' ').split(/\s+/).filter(Boolean); }
  /** Volets visés : par nom (« salon », « chambre d'amis »), sinon tous ceux du type demandé */
  function pick(p) {
    var l = model.devs.slice();
    if (p.target) {
      var tw = words(p.target), sc = l.map(function (d) { var dw = words(d.name), hit = tw.filter(function (w) { return dw.indexOf(w) >= 0 || dw.some(function (x) { return x.length > 3 && (x.indexOf(w) === 0 || w.indexOf(x) === 0); }); }).length; return { d: d, v: hit / tw.length }; });
      var best = sc.filter(function (x) { return x.v >= 0.5; });
      if (best.length) {
        var typed = best.filter(function (x) { return p.kind === 'all' || kindOf(x.d) === p.kind || p.kind === 'store' && kindOf(x.d) === 'banne'; });
        var keep = (typed.length ? typed : best), top = Math.max.apply(null, keep.map(function (x) { return x.v; }));
        return keep.filter(function (x) { return x.v === top; }).map(function (x) { return x.d; });
      }
      return [];
    }
    if (p.kind === 'all') return l;
    var k = l.filter(function (d) { return kindOf(d) === p.kind; });
    if (!k.length && p.kind === 'store') k = l.filter(function (d) { return kindOf(d) === 'banne'; });
    return k.length ? k : (p.kind === 'banne' ? [] : l);
  }
  function has(d, c) { return d.cmds.indexOf(c) >= 0; }
  function commandFor(d, p) {
    var banne = /^(Awning|Pergola)$/.test(d.ui);
    if (p.act === 'open') return banne && has(d, 'deploy') ? { name: 'deploy' } : has(d, 'open') ? { name: 'open' } : has(d, 'up') ? { name: 'up' } : null;
    if (p.act === 'close') return banne && has(d, 'undeploy') ? { name: 'undeploy' } : has(d, 'close') ? { name: 'close' } : has(d, 'down') ? { name: 'down' } : null;
    if (p.act === 'stop') return has(d, 'stop') ? { name: 'stop' } : has(d, 'my') ? { name: 'my' } : null;
    if (p.act === 'my') return has(d, 'my') ? { name: 'my' } : null;
    if (p.act === 'pos') {
      if (banne && has(d, 'setDeployment')) return { name: 'setDeployment', parameters: [p.pos] };
      if (has(d, 'setClosure')) return { name: 'setClosure', parameters: [100 - p.pos] };
      if (p.pos === 50 && has(d, 'my')) return { name: 'my' };
      return null;
    }
    return null;
  }
  function plural(l, kind) {
    var k = kind === 'volet' ? 'volet' : kind === 'banne' ? 'store banne' : kind === 'all' ? 'volet et store' : 'store';
    if (l.length === 1) return withArt(l[0].name);
    return 'les ' + l.length + ' ' + (kind === 'all' ? 'volets et stores' : k + 's');
  }
  function withArt(n) { if (/^VR\b/i.test(n)) n = 'volet ' + n.replace(/^VR\s*/i, '').toLowerCase(); if (/^(Volet|Store)\b/.test(n)) n = n.charAt(0).toLowerCase() + n.slice(1); var d = deacc(n); return /^(le|la|les|l)\b/.test(d) ? n : (/^volet|^store/.test(d) ? 'le ' : '« ') + n + (/^volet|^store/.test(d) ? '' : ' »'); }
  var DONE = { open: ['J\'ouvre', 'Je sors'], close: ['Je ferme', 'Je rentre'], stop: ['J\'arrête', 'J\'arrête'], my: ['Je mets en position favorite', 'Je mets en position favorite'] };
  function phrase(p, l) {
    var banne = l.every(function (d) { return /^(Awning|Pergola)$/.test(d.ui); }) ? 1 : 0, what = plural(l, p.kind);
    if (p.act === 'pos') return (p.pos === 50 ? 'Je mets ' + what + ' à mi-hauteur' : 'J\'ouvre ' + what + ' à ' + p.pos + ' %');
    return DONE[p.act][banne] + ' ' + what;
  }

  function notReady(p) {
    var t = X.withSir('Je ne pilote pas encore les volets') + ' : reliez le boîtier Somfy TaHoma dans mes réglages, Maison › Volets et stores.';
    if (X.PC) t = 'Sur l\'ordinateur, je ne peux pas joindre le boîtier TaHoma : les volets se commandent depuis le téléphone.';
    var c = X.answer({ say: t, html: '<div class="k">Volets et stores</div><p>' + esc(t) + '</p>' + (OK ? '<div class="row"><button class="btn pri" data-sset>Régler le boîtier</button></div>' : '') });
    var b = c.querySelector('[data-sset]'); if (b) b.onclick = function () { X.settingsSheet('somfy'); };
    return c.done;
  }
  function fail(e) {
    var code = (e && e.code) || 'http', t = errText(code);
    var c = X.errorReply(t);
    if (code === 'unauthorized' || code === 'notset' || code === 'certname') { c.insertAdjacentHTML('beforeend', '<div class="row"><button class="btn pri" data-sset>Réglages du boîtier</button></div>'); c.querySelector('[data-sset]').onclick = function () { X.settingsSheet('somfy'); }; }
    return c.done;
  }
  /** Exécute une commande ; quiet : pas de phrase (routines) sauf erreur */
  function run(p, quiet) {
    if (!MJ.somfyReady()) return quiet ? Promise.resolve(false) : notReady(p);
    return fetchModel(false).then(function () {
      if (!model.devs.length) return quiet ? false : X.answer('Le boîtier TaHoma ne m\'indique aucun volet ni store.').done;
      if (p.act === 'query') return query(p);
      var l = pick(p);
      if (!l.length) return quiet ? false : X.answer('Je ne trouve pas ' + (p.target ? 'de volet ou de store « ' + p.target + ' »' : 'ce type de volet') + '. Les noms sont ceux de l\'appli TaHoma : ' + model.devs.map(function (d) { return d.name; }).join(', ') + '.').done;
      var acts = [], skip = [];
      l.forEach(function (d) { var c = commandFor(d, p); if (c) acts.push({ deviceURL: d.url, commands: [{ name: c.name, parameters: c.parameters || [] }] }); else skip.push(d.name); });
      if (!acts.length) return quiet ? false : X.answer(p.act === 'pos' ? 'Ces volets ne savent pas se mettre à une position précise : seulement ouvrir, fermer ou la position favorite.' : 'Ces volets ne connaissent pas cette commande.').done;
      return req('POST', '/exec/apply', { label: 'Majordome', actions: acts }).then(function () {
        modelAt = 0;
        MJ.lastShutter = { p: p, at: Date.now() };
        if (quiet) return true;
        var t = phrase(p, l.filter(function (d) { return skip.indexOf(d.name) < 0; })) + '.' + (skip.length ? ' Sauf ' + skip.join(', ') + ', qui ne le permet pas.' : '');
        return X.answer({ say: X.ack(t), k: 'Volets et stores' }).done;
      });
    }).catch(function (e) { return fail(e); });
  }
  function closedOf(d) {
    if (/^(Awning|Pergola)$/.test(d.ui) && d.deploy != null) return d.deploy === 0;
    if (d.closure != null) return d.closure >= 98;
    if (d.oc) return d.oc === 'closed';
    return null;
  }
  function query(p) {
    return fetchModel(true).then(function () {
      var l = p.target ? pick(p) : p.kind === 'all' ? model.devs : model.devs.filter(function (d) { return kindOf(d) === p.kind || p.kind === 'store' && kindOf(d) === 'banne'; });
      if (!l.length) l = model.devs;
      var known = l.filter(function (d) { return closedOf(d) != null; });
      if (!known.length) return X.answer('Ces volets ne renvoient pas leur position (moteurs RTS sans retour d\'information) : je ne peux pas savoir s\'ils sont ouverts.').done;
      var open = known.filter(function (d) { return !closedOf(d); }), shut = known.filter(function (d) { return closedOf(d); });
      var t;
      if (known.length === 1) { var d = known[0]; t = cap(withArt(d.name)) + (closedOf(d) ? ' est fermé.' : d.closure != null && d.closure > 2 ? ' est ouvert à ' + (100 - d.closure) + ' %.' : ' est ouvert.'); }
      else if (!open.length) t = 'Tout est fermé : ' + known.length + ' sur ' + known.length + '.';
      else if (!shut.length) t = 'Tout est ouvert.';
      else t = open.length + ' ouvert' + (open.length > 1 ? 's' : '') + ' : ' + open.map(function (d) { return d.name; }).join(', ') + '. Le reste est fermé.';
      if (known.length < l.length) t += ' (' + (l.length - known.length) + ' sans retour de position.)';
      var html = '<div class="k">Volets et stores</div><p>' + esc(t) + '</p><ul class="note" style="margin:6px 0 0;padding-left:18px">' + known.map(function (d) { return '<li>' + esc(d.name) + ' : ' + (closedOf(d) ? 'fermé' : d.closure != null && d.closure > 2 ? 'ouvert à ' + (100 - d.closure) + ' %' : 'ouvert') + '</li>'; }).join('') + '</ul>';
      return X.answer({ say: t, html: html }).done;
    });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  // noms des volets pour l'analyseur (« ferme VR salon ») ; jamais de requête ici
  var prevCtx = MJ.ctxExtra;
  MJ.ctxExtra = function () { var c = prevCtx ? prevCtx() : {}; c = c || {}; if (model && model.devs) c.shutters = model.devs.map(function (d) { return d.name; }); return c; };
  H.shutter = function (p) { return p.at ? planOnce(p) : run(p, false); };

  /* ---------- Écran « Volets et stores » (bouton en haut, comme les lumières) ---------- */
  var css = document.createElement('style');
  css.textContent = '.shut .srt{display:flex;align-items:center;gap:10px}.shut .srt h3{margin:0;font-size:15.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.shut .srt small{color:var(--tx3);font-size:12px}.shut .bt{display:flex;gap:6px;margin-top:8px}.shut .bt button{flex:1;min-height:40px;border:1px solid var(--line2);border-radius:12px;background:var(--bg2);font-size:13.5px;color:var(--tx)}.shut .bt button:active{transform:scale(.96);border-color:var(--acc)}.shut .bt button.my{flex:.8;color:var(--warn)}.shut input[type=range]{width:100%;margin:10px 0 2px}.shut .pos{height:6px;border-radius:4px;background:var(--bg4);margin-top:8px;overflow:hidden}.shut .pos i{display:block;height:100%;background:var(--acc)}.shut.busy{opacity:.7}.shut.off{opacity:.6}';
  document.head.appendChild(css);
  function posTxt(d) {
    var c = closedOf(d);
    if (c == null) return 'position non renvoyée (RTS)';
    if (/^(Awning|Pergola)$/.test(d.ui) && d.deploy != null) return d.deploy ? 'sorti à ' + d.deploy + ' %' : 'rentré';
    if (c) return 'fermé';
    return d.closure != null && d.closure > 2 ? 'ouvert à ' + (100 - d.closure) + ' %' : 'ouvert';
  }
  function openPct(d) { return /^(Awning|Pergola)$/.test(d.ui) && d.deploy != null ? d.deploy : d.closure != null ? 100 - d.closure : null; }
  function devCard(d) {
    var banne = /^(Awning|Pergola)$/.test(d.ui), op = openPct(d), slider = banne ? has(d, 'setDeployment') : has(d, 'setClosure');
    return '<div class="room shut" data-dev="' + esc(d.url) + '"><div class="srt"><h3>' + esc(d.name) + '</h3><small>' + esc(posTxt(d)) + '</small></div>' +
      (slider && op != null ? '<input type="range" min="0" max="100" step="5" data-pos value="' + op + '" aria-label="Ouverture ' + esc(d.name) + '">' : op != null ? '<div class="pos"><i style="width:' + op + '%"></i></div>' : '') +
      '<div class="bt"><button data-a="open">' + (banne ? '⇤ Sortir' : '▲ Ouvrir') + '</button>' + (has(d, 'my') ? '<button class="my" data-a="my" title="Position favorite">★ My</button>' : '') + (has(d, 'stop') ? '<button data-a="stop">■ Stop</button>' : '') + '<button data-a="close">' + (banne ? '⇥ Rentrer' : '▼ Fermer') + '</button></div></div>';
  }
  function storesHtml() {
    if (X.PC || !OK) return '<p class="note">Les volets se commandent depuis le téléphone.</p>';
    if (!refreshInfo().set) return '<p class="note">Le boîtier Somfy TaHoma n\'est pas encore relié.</p><div class="row"><button class="btn pri" data-sfset>Relier le boîtier TaHoma</button></div>';
    if (!model) return '<p class="note">Lecture des volets…</p>';
    var groups = [['volet', 'Volets'], ['store', 'Stores'], ['banne', 'Stores bannes']], h = '';
    var shut = model.devs.filter(function (d) { return closedOf(d) === true; }).length, known = model.devs.filter(function (d) { return closedOf(d) != null; }).length;
    h += '<div class="hbar"><div class="t">' + model.devs.length + ' volet' + (model.devs.length > 1 ? 's' : '') + ' et store' + (model.devs.length > 1 ? 's' : '') + (known ? ' · ' + shut + ' fermé' + (shut > 1 ? 's' : '') : '') + ' · ' + esc(new Date(modelAt || model.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })) + '</div><button class="btn sm" data-all="open">Tout ouvrir</button><button class="btn sm" data-all="close">Tout fermer</button><button class="btn sm" data-sfrf>Actualiser</button></div>';
    groups.forEach(function (g) { var l = model.devs.filter(function (d) { return kindOf(d) === g[0]; }); if (l.length) h += '<div class="sect">' + g[1] + '</div>' + l.map(devCard).join(''); });
    return h + progsHtml() + '<p class="note" style="margin-top:12px">Boîtier TaHoma ' + esc(info.pin || '') + ' · ' + esc(info.ip || '') + '. « Tout ouvrir » et « Tout fermer » laissent les stores bannes de côté.</p>';
  }
  function renderStores() { if (X.curSheet() === 'stores') { var b = document.getElementById('shB'); if (b) b.innerHTML = storesHtml(); } }
  var later = 0;
  function sendDevs(l, p, card) {
    var acts = []; l.forEach(function (d) { var c = commandFor(d, p); if (c) acts.push({ deviceURL: d.url, commands: [{ name: c.name, parameters: c.parameters || [] }] }); });
    if (!acts.length) { X.toast('Commande non disponible'); return; }
    if (card) card.classList.add('busy');
    req('POST', '/exec/apply', { label: 'Majordome', actions: acts }).then(function () {
      if (card) card.classList.remove('busy');
      X.toast({ open: 'Ouverture', close: 'Fermeture', stop: 'Arrêt', my: 'Position favorite', pos: 'Position ' + p.pos + ' %' }[p.act] + (l.length > 1 ? ' (' + l.length + ')' : ''));
      clearTimeout(later);
      var re = function () { if (X.curSheet() === 'stores') fetchModel(true).then(renderStores, function () { }); };
      setTimeout(re, 3000); later = setTimeout(re, 25000);   // les moteurs mettent une vingtaine de secondes
    }, function (e) { if (card) card.classList.remove('busy'); X.toast(errText(e.code)); });
  }
  function devBy(url) { return model && model.devs.filter(function (d) { return d.url === url; })[0]; }
  function storesSheet() {
    var b = X.openSheet('Volets et stores', storesHtml(), 'stores');
    b.onclick = function (e) {
      var t = e.target, c;
      if (t.closest('[data-sfset]')) { X.settingsSheet('somfy'); return; }
      if (t.closest('[data-sfrf]')) { X.toast('Actualisation…'); fetchModel(true).then(function () { renderStores(); X.toast('Actualisé'); }, function (er) { X.toast(errText(er.code)); }); return; }
      if (t.closest('[data-pgnew]')) { progSheet(-1); return; }
      if ((c = t.closest('[data-pgedit]'))) { progSheet(+c.dataset.pgedit); return; }
      if ((c = t.closest('[data-all]'))) { sendDevs(model.devs.filter(function (d) { return kindOf(d) !== 'banne'; }), { act: c.dataset.all }); return; }
      if ((c = t.closest('[data-a]'))) { var card = c.closest('[data-dev]'), d = card && devBy(card.dataset.dev); if (d) sendDevs([d], { act: c.dataset.a }, card); }
    };
    b.onchange = function (e) {
      if (e.target.matches('[data-pgon]')) { var pg = progs()[+e.target.dataset.pgon]; if (pg) { pg.on = e.target.checked; X.saveS(); var at = arm(pg); X.toast(pg.on ? (at ? 'Prochain : ' + whenTxt(at) : 'Rien de prévu') : 'Programme en pause'); renderStores(); } return; }
      if (!e.target.matches('[data-pos]')) return;
      var card = e.target.closest('[data-dev]'), d = card && devBy(card.dataset.dev); if (d) sendDevs([d], { act: 'pos', pos: +e.target.value }, card);
    };
    if (MJ.somfyReady()) fetchModel(true).then(renderStores, function (er) { if (X.curSheet() === 'stores') { var bb = document.getElementById('shB'); if (bb) bb.insertAdjacentHTML('afterbegin', '<p class="note warn">' + esc(errText(er.code)) + '</p>'); } });
  }
  MJ.storesSheet = storesSheet;

  /* ---------- Programmes : ouvrir / fermer tout seul à une heure, au lever ou au coucher du soleil, certains jours ou une fois ----------
     Chaque programme devient une alarme Android (MajordomeBridge.somfyLater) : elle s'exécute même Majordome fermé,
     à condition que le téléphone soit sur le Wi-Fi de la maison à ce moment-là. */
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], ORDRE = [1, 2, 3, 4, 5, 6, 0];
  var ACTS = { open: 'Ouvrir', close: 'Fermer', my: 'Position favorite', pos: 'Ouvrir à' };
  function progs() { if (!Array.isArray(S.sfProgs)) S.sfProgs = []; return S.sfProgs; }
  function place() { var p = S.place; return p && p.lat != null ? { lat: +p.lat, lon: +p.lon, name: p.name || '' } : { lat: 43.3, lon: 5.37, name: 'Marseille' }; }
  function sunUtcMin(d, lat, lon) {
    var y0 = new Date(Date.UTC(d.getFullYear(), 0, 0)), n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - y0) / 864e5), g = 2 * Math.PI / 365 * (n - 1), rad = Math.PI / 180;
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var c = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
    if (c > 1 || c < -1) return null;
    var ha = Math.acos(c) / rad, noon = 720 - 4 * lon - eq; return [noon - 4 * ha, noon + 4 * ha];
  }
  function timeOn(pg, d) {
    if (pg.mode === 'rise' || pg.mode === 'set') {
      var r = sunUtcMin(d, pg.lat, pg.lon); if (!r) return null;
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) + Math.round((pg.mode === 'rise' ? r[0] : r[1]) * 60000) + (+pg.off || 0) * 60000;
    }
    var hm = String(pg.time || '07:00').split(':'); var x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hm[0] || 0, +hm[1] || 0, 0, 0); return x.getTime();
  }
  function nextAt(pg, after) {
    after = after || Date.now();
    if (!pg.days.length) { if (!pg.once) return null; var p = pg.once.split('-'); var t = timeOn(pg, new Date(+p[0], +p[1] - 1, +p[2])); return t && t > after ? t : null; }
    for (var k = 0; k < 9; k++) { var d = new Date(after); d.setDate(d.getDate() + k); if (pg.days.indexOf(d.getDay()) < 0) continue; var t2 = timeOn(pg, d); if (t2 && t2 > after + 30000) return t2; }
    return null;
  }
  function hm(t) { var d = new Date(t), m = d.getMinutes(); return d.getHours() + ' h' + (m ? ' ' + String(m).padStart(2, '0') : ''); }
  function whenTxt(t) {
    var d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0); var dd = new Date(d); dd.setHours(0, 0, 0, 0); var k = Math.round((dd - today) / 864e5);
    return (k === 0 ? 'aujourd\'hui' : k === 1 ? 'demain' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) + ' à ' + hm(t);
  }
  function daysTxt(l) {
    if (l.length === 7) return 'tous les jours';
    var s = l.slice().sort().join(',');
    if (s === '1,2,3,4,5') return 'en semaine'; if (s === '0,6') return 'le week-end';
    return ORDRE.filter(function (j) { return l.indexOf(j) >= 0; }).map(function (j) { return JOURS[j]; }).join(' ');
  }
  function heureTxt(pg) {
    if (pg.mode === 'rise' || pg.mode === 'set') { var o = +pg.off || 0; return (o ? Math.abs(o) + ' min ' + (o < 0 ? 'avant' : 'après') + ' le ' : 'au ') + (pg.mode === 'rise' ? 'lever' : 'coucher') + ' du soleil'; }
    return 'à ' + String(pg.time || '').replace(':', ' h ');
  }
  function devNames(pg) {
    var n = pg.urls.map(function (u) { var d = devBy(u); return d ? d.name : null; }).filter(Boolean);
    if (model && n.length === model.devs.length && n.length > 2) return 'tous les volets et stores';
    return n.length > 3 ? n.slice(0, 3).join(', ') + ' et ' + (n.length - 3) + ' autres' : n.join(', ') || 'aucun volet';
  }
  function actTxt(pg) { return pg.act === 'pos' ? 'Ouvrir à ' + pg.pos + ' %' : ACTS[pg.act]; }
  function progLabel(pg) { return pg.name || (actTxt(pg) + ' · ' + devNames(pg)); }
  function actionsOf(pg) {
    var p = { act: pg.act, pos: pg.pos }, out = [];
    pg.urls.forEach(function (u) { var d = devBy(u); var c = d && commandFor(d, p); if (c) out.push({ deviceURL: d.url, commands: [{ name: c.name, parameters: c.parameters || [] }] }); });
    return out;
  }
  /** Programme → alarme Android (ou annulation) ; renvoie l'heure suivante */
  function arm(pg) {
    try { B.alarmCancel(pg.id); } catch (e) { }
    if (!pg.on) return null;
    var at = nextAt(pg), acts = actionsOf(pg);
    if (!at || !acts.length) return null;
    var o = { id: pg.id, kind: 'somfy', at: at, title: 'Volets', text: progLabel(pg), actions: acts };
    if (pg.days.length) o.prog = alarmProg(pg);
    try { B.alarmSet(JSON.stringify(o)); } catch (e) { return null; }
    return at;
  }
  function progsHtml() {
    var l = progs(), h = '<div class="sect">Programmes</div>';
    if (!l.length) h += '<p class="note">Aucun programme. Exemples : fermer les volets en semaine à 21 h, ouvrir les stores au lever du soleil, fermer le store banne au coucher du soleil.</p>';
    h += l.map(function (pg, i) {
      var nx = pg.on ? nextAt(pg) : null;
      return '<div class="room shut' + (pg.on ? '' : ' off') + '"><div class="srt"><h3>' + esc(progLabel(pg)) + '</h3><label class="sw"><input type="checkbox" data-pgon="' + i + '"' + (pg.on ? ' checked' : '') + ' aria-label="Activer"><span></span></label></div>' +
        '<p class="note" style="margin:4px 0 0">' + esc(actTxt(pg)) + ' · ' + esc(pg.days.length ? daysTxt(pg.days) : 'une fois') + ' ' + esc(heureTxt(pg)) + (pg.name ? ' · ' + esc(devNames(pg)) : '') + '<br>' + (nx ? 'Prochain : ' + esc(whenTxt(nx)) : pg.on ? 'Rien de prévu (date passée)' : 'En pause') + '</p>' +
        '<div class="bt"><button data-pgedit="' + i + '">Modifier</button></div></div>';
    }).join('');
    return h + '<div class="row" style="display:flex;gap:8px;margin-top:6px"><button class="btn sm pri" data-pgnew>+ Nouveau programme</button></div>' +
      '<p class="note">Les programmes partent du téléphone : il doit être sur le Wi-Fi de la maison à l\'heure prévue. Pour des volets qui bougent même quand vous êtes absent, programmez aussi dans l\'appli TaHoma.</p>';
  }
  /* Partie « Quand / Heure » de l'éditeur, commune aux programmes des volets et des lumières (MJ.sched) */
  function whenHtml(pg) {
    var tomorrow = new Date(Date.now() + 864e5), iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    var pl = place();
    return '<div class="set"><div class="t">Quand</div></div><select class="in" id="pgRep"><option value="rep"' + (pg.days.length ? ' selected' : '') + '>Certains jours, chaque semaine</option><option value="once"' + (pg.days.length ? '' : ' selected') + '>Une seule fois, à une date</option></select>' +
      '<div id="pgDaysBox" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"' + (pg.days.length ? '' : ' hidden') + '>' + ORDRE.map(function (j) { return '<button class="btn sm' + (pg.days.indexOf(j) >= 0 ? ' pri' : '') + '" data-pgday="' + j + '" style="min-width:52px">' + JOURS[j] + '</button>'; }).join('') + '</div>' +
      '<input class="in" id="pgDate" type="date" value="' + esc(pg.once || iso(tomorrow)) + '" style="margin-top:8px"' + (pg.days.length ? ' hidden' : '') + '>' +
      '<div class="set"><div class="t">Heure</div></div><select class="in" id="pgMode"><option value="time"' + (pg.mode === 'time' ? ' selected' : '') + '>À une heure précise</option><option value="rise"' + (pg.mode === 'rise' ? ' selected' : '') + '>Au lever du soleil</option><option value="set"' + (pg.mode === 'set' ? ' selected' : '') + '>Au coucher du soleil</option></select>' +
      '<input class="in" id="pgTime" type="time" value="' + esc(pg.time || '21:00') + '" style="margin-top:8px"' + (pg.mode === 'time' ? '' : ' hidden') + '>' +
      '<div id="pgOffBox" style="margin-top:8px"' + (pg.mode === 'time' ? ' hidden' : '') + '><div style="display:flex;gap:8px;align-items:center"><span class="note" style="margin:0">Décalage</span><input class="in" id="pgOff" type="number" min="-180" max="180" step="5" value="' + (+pg.off || 0) + '" style="width:90px"><span class="note" style="margin:0">minutes (− avant, + après)</span></div><p class="note">Calculé pour ' + esc(pl.name || 'votre ville') + ' (ville des réglages météo).</p></div>';
  }
  function whenCollect(b, pg) {
    var $ = function (id) { return b.querySelector('#' + id); };
    pg.days = $('pgRep').value === 'once' ? [] : [].slice.call(b.querySelectorAll('[data-pgday].pri')).map(function (x) { return +x.dataset.pgday; });
    pg.once = $('pgRep').value === 'once' ? $('pgDate').value : '';
    pg.mode = $('pgMode').value; pg.time = $('pgTime').value || '21:00'; pg.off = +$('pgOff').value || 0;
    var pp = place(); pg.lat = pp.lat; pg.lon = pp.lon;
  }
  function whenChange(b, e) {
    var $ = function (id) { return b.querySelector('#' + id); };
    if (e.target.id === 'pgRep') { var once = e.target.value === 'once'; $('pgDaysBox').hidden = once; $('pgDate').hidden = !once; }
    if (e.target.id === 'pgMode') { var tm = e.target.value === 'time'; $('pgTime').hidden = !tm; $('pgOffBox').hidden = tm; }
  }
  function whenPreview(b, pg) { var el = b.querySelector('#pgNext'), nx = nextAt(pg); el.textContent = nx ? 'Prochain : ' + whenTxt(nx) + '.' : b.querySelector('#pgRep').value === 'rep' && !pg.days.length ? 'Choisissez au moins un jour.' : 'Cette date est passée.'; }
  function alarmProg(pg) { return { days: pg.days, h: +String(pg.time || '7:0').split(':')[0], m: +String(pg.time || '7:0').split(':')[1], sun: pg.mode === 'rise' || pg.mode === 'set' ? pg.mode : '', off: +pg.off || 0, lat: pg.lat, lon: pg.lon }; }
  MJ.sched = { nextAt: nextAt, whenTxt: whenTxt, daysTxt: daysTxt, heureTxt: heureTxt, place: place, whenHtml: whenHtml, whenCollect: whenCollect, whenChange: whenChange, whenPreview: whenPreview, alarmProg: alarmProg };
  function progSheet(i) {
    var pg = i >= 0 ? JSON.parse(JSON.stringify(progs()[i])) : { id: 'sfp' + X.uid(), name: '', act: 'close', pos: 50, urls: model.devs.filter(function (d) { return kindOf(d) === 'volet'; }).map(function (d) { return d.url; }), days: [1, 2, 3, 4, 5], once: '', mode: 'time', time: '21:00', off: 0, on: true };
    if (!pg.urls.length && i < 0) pg.urls = model.devs.map(function (d) { return d.url; });
    var h = '<div class="set"><div class="t">Action</div></div><div style="display:flex;gap:8px"><select class="in" id="pgAct" style="flex:1">' + Object.keys(ACTS).map(function (k) { return '<option value="' + k + '"' + (pg.act === k ? ' selected' : '') + '>' + ACTS[k] + (k === 'pos' ? '… %' : '') + '</option>'; }).join('') + '</select><input class="in" id="pgPos" type="number" min="0" max="100" step="5" value="' + (+pg.pos || 50) + '" style="width:80px"' + (pg.act === 'pos' ? '' : ' hidden') + '></div>' +
      '<div class="set"><div class="t">Volets et stores</div></div><div class="row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"><button class="btn sm" data-pgk="volet">Tous les volets</button><button class="btn sm" data-pgk="store">Tous les stores</button><button class="btn sm" data-pgk="all">Tout</button><button class="btn sm" data-pgk="none">Aucun</button></div>' +
      model.devs.map(function (d) { return '<label class="set" style="gap:10px;cursor:pointer"><div class="t">' + esc(d.name) + '</div><input type="checkbox" data-pgd="' + esc(d.url) + '"' + (pg.urls.indexOf(d.url) >= 0 ? ' checked' : '') + ' style="width:20px;height:20px"></label>'; }).join('') +
      whenHtml(pg) +
      '<div class="set"><div class="t">Nom<small>Facultatif, sinon l\'action et les volets</small></div></div><input class="in" id="pgName" value="' + esc(pg.name) + '" placeholder="ex. Fermeture du soir">' +
      '<p class="note" id="pgNext"></p>' +
      '<div class="row" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn pri" id="pgSave">Enregistrer</button>' + (i >= 0 ? '<button class="btn bad" id="pgDel">Supprimer</button>' : '') + '<button class="btn" id="pgBack">Retour</button></div>';
    var b = X.openSheet(i >= 0 ? 'Modifier le programme' : 'Nouveau programme', h, 'sfprog');
    var $ = function (id) { return b.querySelector('#' + id); };
    function collect() {
      pg.act = $('pgAct').value; pg.pos = Math.max(0, Math.min(100, +$('pgPos').value || 0));
      pg.urls = [].slice.call(b.querySelectorAll('[data-pgd]')).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.pgd; });
      whenCollect(b, pg);
      pg.name = $('pgName').value.trim();
    }
    function preview() { collect(); whenPreview(b, pg); }
    b.onclick = function (e) {
      var c = e.target.closest('button'); if (!c) return;
      if (c.dataset.pgday != null) { c.classList.toggle('pri'); preview(); return; }
      if (c.dataset.pgk) { var k = c.dataset.pgk; b.querySelectorAll('[data-pgd]').forEach(function (x) { var d = devBy(x.dataset.pgd); x.checked = k === 'all' || (k !== 'none' && d && (kindOf(d) === k)); }); return; }
    };
    b.onchange = function (e) {
      if (e.target.id === 'pgAct') $('pgPos').hidden = e.target.value !== 'pos';
      whenChange(b, e);
      preview();
    };
    b.oninput = function (e) { if (/^(pgTime|pgOff|pgDate|pgPos)$/.test(e.target.id)) preview(); };
    preview();
    $('pgSave').onclick = function () {
      collect();
      if (!pg.urls.length) { X.toast('Choisissez au moins un volet'); return; }
      if (!pg.days.length && !pg.once) { X.toast('Choisissez les jours ou une date'); return; }
      if (!actionsOf(pg).length) { X.toast('Ces volets ne savent pas faire cette action'); return; }
      var l = progs(); if (i >= 0) l[i] = pg; else l.push(pg);
      S.sfProgs = l; X.saveS();
      var at = arm(pg);
      X.toast(at ? 'Programme enregistré : ' + whenTxt(at) : 'Programme enregistré, rien de prévu');
      storesSheet();
    };
    if ($('pgDel')) $('pgDel').onclick = function () { try { B.alarmCancel(pg.id); } catch (e) { } S.sfProgs = progs().filter(function (x) { return x.id !== pg.id; }); X.saveS(); X.toast('Programme supprimé'); storesSheet(); };
    $('pgBack').onclick = function () { storesSheet(); };
  }
  /** « Ferme les volets à 21 h » : programme d'une seule fois */
  function planOnce(p) {
    if (!MJ.somfyReady()) return notReady(p);
    return fetchModel(false).then(function () {
      var l = pick(p);
      if (!l.length) return X.answer('Je ne trouve pas ' + (p.target ? 'de volet ou de store « ' + p.target + ' »' : 'ce type de volet') + '.').done;
      var d = new Date(p.at), iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var pg = { id: 'sfp' + X.uid(), name: '', act: p.act === 'stop' ? 'my' : p.act, pos: p.pos != null ? p.pos : 50, urls: l.map(function (x) { return x.url; }), days: [], once: iso, mode: 'time', time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), off: 0, on: true };
      if (!actionsOf(pg).length) return X.answer('Ces volets ne savent pas faire cette action.').done;
      progs().push(pg); X.saveS();
      var at = arm(pg);
      if (!at) return X.answer('Je n\'ai pas pu programmer cette commande.').done;
      var verbe = { open: 'J\'ouvrirai', close: 'Je fermerai', my: 'Je mettrai en position favorite', pos: 'J\'ouvrirai à ' + pg.pos + ' %' }[pg.act];
      var t = verbe + ' ' + plural(l, p.kind) + ' ' + whenTxt(at) + '.';
      return X.answer({ say: X.ack(t), html: '<div class="k">Volets et stores</div><p>' + esc(t) + '</p><p class="note">Le téléphone doit être sur le Wi-Fi de la maison à ce moment-là. Programme visible dans Volets et stores.</p>' }).done;
    }).catch(fail);
  }
  // une fois par démarrage : programmes passés retirés, alarmes remises en place (mise à jour de l'appli, changement de ville…)
  if (OK && info.set) setTimeout(function () {
    var l = progs(), keep = l.filter(function (pg) { return pg.days.length || nextAt(pg); });
    if (keep.length !== l.length) { S.sfProgs = keep; X.saveS(); }
    if (model) keep.forEach(arm);
  }, 1500);
  var sb = document.getElementById('bStores');
  if (sb) { sb.hidden = !OK; sb.onclick = storesSheet; }
  MJ.shutterRun = function (p, quiet) { return run(p, quiet); };
  /** Habitude repérée (mj-appris.js) : même commande, même heure, plusieurs jours → programme qui se répète. → { at, where } ou null */
  MJ.shutterHabit = function (p, time, days) {
    if (!MJ.somfyReady()) return Promise.resolve(null);
    return fetchModel(false).then(function () {
      var l = pick(p); if (!l.length) return null;
      var pg = { id: 'sfp' + X.uid(), name: '', act: p.act === 'stop' ? 'my' : p.act, pos: p.pos != null ? p.pos : 50, urls: l.map(function (x) { return x.url; }), days: days, once: '', mode: 'time', time: time, off: 0, on: true };
      if (!actionsOf(pg).length) return null;
      progs().push(pg); X.saveS();
      var at = arm(pg); return at ? { at: at, where: 'Volets et stores', label: progLabel(pg) } : null;
    }).catch(function () { return null; });
  };
  /** Routine « Demander à Alexa » : volets et stores directement par le boîtier quand il est réglé */
  MJ.alexaDirect = function (cmd) {
    if (!MJ.somfyReady()) return null;
    var r = NLU.parse(String(cmd || '').replace(/^(alexa|echo|amazon|ordinateur|ziggy)\b[ ,]*/i, ''), { now: Date.now(), names: [] });
    if (r.intent !== 'shutter' || r.p.act === 'query') return null;
    return run(r.p, true).then(function (ok) { return ok; });
  };

  /* ---------- Réglages › Maison › Volets et stores ---------- */
  function settingsHtml() {
    var h = '<div class="sect" id="f-somfy">Maison › Volets et stores (Somfy TaHoma)</div>';
    if (X.PC || !B) return h + '<p class="note">Sur l\'ordinateur, le navigateur ne peut pas joindre le boîtier TaHoma : les volets se commandent depuis le téléphone.</p>';
    if (!OK) return h + '<p class="note">Non disponible dans cette version de l\'appli.</p>';
    var i = refreshInfo();
    if (i.set) {
      h += '<div class="set"><div class="t">Boîtier TaHoma ' + esc(i.pin) + '<small>' + esc(i.ip) + ':' + (+i.port || 8443) + ' · API locale, certificat Somfy vérifié</small></div></div>' +
        (model ? '<p class="note">' + model.devs.map(function (d) { return esc(d.name); }).join(' · ') + '</p>' : '') +
        '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="sfRefresh">Actualiser la liste</button><button class="btn sm" id="sfEdit">Changer d\'adresse ou de jeton</button><button class="btn sm bad" id="sfForget">Oublier le boîtier</button></div>' +
        '<p class="note">Dites « ferme les stores », « ouvre le volet de la chambre », « descends le store du salon à moitié », « mets les volets en position favorite », « est-ce que les volets sont fermés ? ». Les noms sont ceux de l\'appli TaHoma. Le jeton reste dans un fichier privé de l\'appli, exclu des sauvegardes.</p>';
      if (!S.sfEdit) return h + (lastErr ? '<p class="note warn">' + esc(lastErr) + '</p>' : '');
    }
    var f = found && found[0] || {};
    h += '<p class="note"><b>1.</b> Dans l\'appli <b>TaHoma by Somfy</b> : Configurer l\'installation › Paramètres de la box, touchez <b>7 fois le code PIN</b> pour activer le mode développeur, puis <b>Générer un jeton</b> et copiez-le (il ne s\'affiche qu\'une fois).<br><b>2.</b> Ici, le téléphone sur le Wi-Fi de la maison : recherchez le boîtier, collez le jeton, enregistrez.</p>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm pri" id="sfFind">' + (busy === 'find' ? 'Recherche…' : 'Rechercher le boîtier') + '</button></div>' +
      (found ? (found.length ? found.map(function (x, k) { return '<div class="set"><div class="t">TaHoma ' + esc(x.pin || '') + '<small>' + esc(x.ip) + ':' + x.port + (x.fw ? ' · version ' + esc(x.fw) : '') + '</small></div><button class="btn sm" data-sfuse="' + k + '">Choisir</button></div>'; }).join('') : '<p class="note">Aucun boîtier trouvé : le mode développeur est-il activé ? Sinon, saisissez l\'adresse IP (visible dans la box internet).</p>') : '') +
      '<div class="set"><div class="t">Adresse IP du boîtier</div></div><div style="display:flex;gap:8px"><input class="in" id="sfIp" inputmode="decimal" placeholder="ex. 192.168.1.30" value="' + esc(f.ip || i.ip || '') + '" style="flex:1"><input class="in" id="sfPort" inputmode="numeric" value="' + esc(String(f.port || i.port || 8443)) + '" style="width:80px"></div>' +
      '<div class="set"><div class="t">Code PIN du boîtier<small>Sous le boîtier ou dans les paramètres de la box : 1234-5678-9012</small></div></div><input class="in" id="sfPin" placeholder="1234-5678-9012" value="' + esc(f.pin || i.pin || '') + '">' +
      '<div class="set"><div class="t">Jeton (mode développeur)' + (i.set ? '<small>Laissez vide pour garder le jeton enregistré</small>' : '') + '</div></div><input class="in" id="sfTok" type="password" autocomplete="off" spellcheck="false" placeholder="Collez le jeton">' +
      '<div class="row" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm pri" id="sfSave">' + (busy === 'save' ? 'Essai en cours…' : 'Enregistrer et essayer') + '</button>' + (i.set ? '<button class="btn sm" id="sfCancel">Annuler</button>' : '') + '</div>' +
      (lastErr ? '<p class="note warn">' + esc(lastErr) + '</p>' : '');
    return h;
  }
  function bind(b) {
    var on = function (id, f) { var e = b.querySelector('#' + id); if (e) e.onclick = f; };
    on('sfFind', function () { if (busy) return; busy = 'find'; found = null; lastErr = ''; X.settingsSheet('somfy'); try { B.somfyDiscover(); } catch (e) { busy = null; } });
    b.querySelectorAll('[data-sfuse]').forEach(function (x) { x.onclick = function () { var f = found[+x.dataset.sfuse]; ['sfIp', 'sfPort', 'sfPin'].forEach(function (k, n) { var el = b.querySelector('#' + k); if (el) el.value = [f.ip, f.port, f.pin][n] || el.value; }); var t = b.querySelector('#sfTok'); if (t) t.focus(); }; });
    on('sfSave', function () {
      if (busy) return;
      var v = function (k) { var el = b.querySelector('#' + k); return el ? el.value.trim() : ''; };
      var pin = v('sfPin').replace(/\s/g, ''), ip = v('sfIp'), port = parseInt(v('sfPort'), 10) || 8443, tok = v('sfTok');
      if (/^\d{12}$/.test(pin)) pin = pin.replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3');
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) { X.toast('Adresse IP du boîtier ?'); return; }
      if (!/^\d{4}-\d{4}-\d{4}$/.test(pin)) { X.toast('Code PIN : 1234-5678-9012'); return; }
      if (!tok && !info.set) { X.toast('Collez le jeton du mode développeur'); return; }
      busy = 'save'; lastErr = ''; S.sfEdit = false; X.settingsSheet('somfy');
      try { B.somfySet(ip, port, pin, tok); } catch (e) { busy = null; lastErr = 'Erreur : ' + e.message; }
    });
    on('sfCancel', function () { S.sfEdit = false; X.settingsSheet('somfy'); });
    on('sfEdit', function () { S.sfEdit = true; X.settingsSheet('somfy'); });
    on('sfRefresh', function () { fetchModel(true).then(function () { X.toast(model.devs.length + ' volets et stores'); X.settingsSheet('somfy'); }, function (e) { X.toast(errText(e.code)); }); });
    on('sfForget', function () {
      X.ask('Oublier le boîtier TaHoma ? Le jeton sera effacé de ce téléphone.', 'yesno', { yes: 'Oublier', k: 'Volets et stores' }).then(function (ok) {
        if (!ok) return; try { B.somfyForget(); } catch (e) { } model = null; X.lsSet(KEYS, null); refreshInfo(); X.settingsSheet('somfy');
      });
    });
  }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + settingsHtml(); };
  MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };

  // aide et essais
  if (X.HELP && Array.isArray(X.HELP)) X.HELP.push(['Volets et stores (Somfy)', ['Ferme les stores', 'Ouvre le volet de la chambre', 'Descends le store du salon à moitié', 'Les volets sont-ils fermés ?']]);
  MJ.somfy = { model: function () { return model; }, pick: function (p) { return pick(p); }, setModel: setModel, commandFor: commandFor };
})();
