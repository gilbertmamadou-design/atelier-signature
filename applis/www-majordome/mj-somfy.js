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
  function words(s) { return deacc(s).replace(/\b(le|la|les|l|du|de|des|d|volets?|stores?|roulants?|bannes?)\b/g, ' ').split(/\s+/).filter(Boolean); }
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
  function withArt(n) { if (/^(Volet|Store)\b/.test(n)) n = n.charAt(0).toLowerCase() + n.slice(1); var d = deacc(n); return /^(le|la|les|l)\b/.test(d) ? n : (/^volet|^store/.test(d) ? 'le ' : '« ') + n + (/^volet|^store/.test(d) ? '' : ' »'); }
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
  H.shutter = function (p) { return run(p, false); };
  MJ.shutterRun = function (p, quiet) { return run(p, quiet); };
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
