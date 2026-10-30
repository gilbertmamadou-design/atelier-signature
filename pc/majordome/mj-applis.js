/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-applis.js : ne pas modifier ici. */
/* =====================================================================
   Majordome › Ouvrir n'importe quelle appli du téléphone (« Ouvre WhatsApp », « Lance Waze »)
   - Liste des applis lançables : MajordomeBridge.appList() (MAIN/LAUNCHER, mise en cache côté Java,
     rafraîchie à l'installation / désinstallation et au retour dans Majordome). Repli : MAGPrint.homeApps().
   - L'analyseur (mj-nlu.js) choisit : Suite MAG d'abord, puis les applis installées (correspondance tolérante,
     alias des grandes applis), raccourcis du système, sites connus.
   - Lancement : MajordomeBridge.appLaunch / sysOpen. Majordome au premier plan : ouverture directe ; en arrière-plan
     (écoute continue, montre) : « Affichage par-dessus » si autorisé, sinon notification à toucher (règles d'Android).
   - Alias personnels (réglages) : « Quand je dis… ouvre… » (S.appAliases).
   - PC : pas de lancement de programmes Windows ; applis de la Suite, sites connus, et proposition honnête du site
     de l'appli quand il existe (WhatsApp → web.whatsapp.com).
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, B = X.B, P = X.P, S = X.S, esc = X.esc, J = X.J, NLU = window.MJNLU;
  var ANDROID = X.ANDROID, PC = X.PC;
  if (!Array.isArray(S.appAliases)) S.appAliases = [];

  /* ---------------- Liste des applis (Android) ---------------- */
  var raw0 = null, list = [];
  function appList() {
    if (!ANDROID) return null;
    var raw = '';
    try { raw = B && B.appList ? B.appList() : (P && P.homeApps ? P.homeApps() : ''); } catch (e) { raw = ''; }
    if (raw !== raw0) {
      raw0 = raw;
      list = (J(raw, []) || []).filter(function (a) { return a && a.pkg && a.label; }).map(function (a) { return { label: String(a.label), pkg: String(a.pkg), cls: String(a.cls || '') }; });
    }
    return list;
  }
  var prevCtx = MJ.ctxExtra;
  MJ.ctxExtra = function () {
    var o = {}; if (prevCtx) try { o = Object.assign({}, prevCtx() || {}); } catch (e) { }
    var l = appList(); if (l && l.length) o.apps = l;
    if (S.appAliases && S.appAliases.length) o.aliases = S.appAliases;
    return o;
  };

  /* ---------------- Lancement ---------------- */
  function say(t, k) { return X.answer({ say: t, k: k || '' }).done; }
  function result(r, name) {
    if (r === 'ok') return say(X.withSir('J\'ouvre ' + name) + '.');
    if (r === 'notif') return say('Touchez la notification pour ouvrir ' + name + '.');
    if (r === 'absent') return say(cap(name) + ' n\'est pas installée sur ce téléphone.');
    if (r === 'none') return say('Aucune appli de ce téléphone ne sait ouvrir ' + name + '.');
    return X.answer({ say: 'Impossible d\'ouvrir ' + name + '.', cls: 'err' }).done;
  }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function launch(pkg, cls, name) {
    var r = '';
    if (B && B.appLaunch) { try { r = B.appLaunch(pkg, cls || '', name || ''); } catch (e) { r = 'err'; } }
    else if (P && P.homeLaunch) { P.homeLaunch(pkg, cls || ''); r = 'ok'; }
    else return say('Je ne peux pas ouvrir ' + name + ' ici.');
    return result(r, name);
  }
  // repli quand le pont de Majordome est ancien : raccourcis du Socle (MAGPrint.homeOpen)
  var HOMEOPEN = { dialer: 'dial', sms: 'sms', camera: 'camera', clock: 'alarms', calendar: 'calendar', settings: 'settings' };
  function sysOpen(what, sub, name) {
    if (B && B.sysOpen) { var r = ''; try { r = B.sysOpen(what, sub || '', name); } catch (e) { r = 'err'; } return result(r, name); }
    if (what === 'settings' && B && B.panel && /^(wifi|bluetooth|)$/.test(sub || '')) { B.panel(sub || 'settings'); return result('ok', name); }
    if (P && P.homeOpen && HOMEOPEN[what] && !sub) { P.homeOpen(HOMEOPEN[what], ''); return result('ok', name); }
    return say('Je ne peux pas ouvrir ' + name + ' ici.');
  }
  function storeCard(name, pkg) {
    var t = cap(name) + ' n\'est pas installée sur ce téléphone.';
    var c = X.answer({ say: t, html: '<p>' + esc(t) + '</p>' + (pkg ? '<div class="row"><button class="btn pri" data-store>Voir dans le Play Store</button></div>' : '') });
    var b = c.querySelector('[data-store]');
    if (b) b.onclick = function () { if (B && B.openUrl) B.openUrl('https://play.google.com/store/apps/details?id=' + encodeURIComponent(pkg)); };
    return c.done;
  }
  function names(l) { return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' ou ' + l[l.length - 1]; }

  /* ---------------- Gestionnaires ---------------- */
  var H = X.H;
  H.open_app = function (p) {
    if (p.choices) return choose(p);
    if (p.unknown) return unknown(p);
    if (p.id === 'majordome') return say('Je suis déjà là.');
    if (p.ext) {
      if (PC) return pcOther(p.name, null);
      return launch(p.pkg, p.cls, p.name);
    }
    // applis de la Suite
    if (PC) {
      var conf = (window.MAGPC.conf && window.MAGPC.conf.apps) || {}, url = conf[p.pkg];
      if (!url) return say(p.name + ' n\'existe pas dans la Suite sur PC' + (p.id === 'echafaudage' ? ' : c\'est une appli du téléphone.' : '.'));
      return X.openLink(url, p.name);
    }
    if (P && P.homeInstalled && P.homeInstalled(p.pkg) !== '1') {
      if (p.alt) return launch(p.alt.pkg, p.alt.cls, p.alt.name);
      if (p.sys) { var sn = (NLU.SYS.filter(function (x) { return x[0] === p.sys; })[0] || [0, p.name])[1]; return sysOpen(p.sys, '', sn); }
      return say('L\'appli ' + p.name + ' n\'est pas installée sur ce téléphone.');
    }
    if ((B && B.appLaunch) || (P && P.homeLaunch)) return launch(p.pkg, '', p.name);
    return say('Je ne peux pas ouvrir ' + p.name + ' ici.');
  };
  function choose(p) {
    var l = p.choices.map(function (c) { return c.name; });
    return X.ask('Lequel : ' + names(l) + ' ?', 'choice', { choices: l, k: 'Ouvrir' }).then(function (v) {
      if (v == null) return say('D\'accord.');
      var c = typeof v === 'number' ? p.choices[v - 1] : null;
      if (!c && typeof v === 'string') {
        var w = NLU.prep(v, {}).t.replace(/^(?:ouvre|lance|prends|mets|choisis|plutot|c est)\s+/, '').replace(/^(?:l appli |le |la |les |l )/, '');
        var pk = NLU.pickApp(w, p.choices.map(function (x) { return { label: x.name, pkg: x.pkg, cls: x.cls }; }));
        if (pk.app) c = p.choices.filter(function (x) { return x.pkg === pk.app.pkg; })[0];
      }
      if (!c) return say('Je n\'ai pas compris laquelle : redemandez.');
      return H.open_app(c);
    });
  }
  function unknown(p) {
    if (PC) return pcOther(p.unknown, p);
    var k = p.known;
    if (k && !k.group && p.apps) return storeCard(k.name, k.pkg);
    if (k && k.group && p.apps) return say('Je ne trouve pas d\'appli ' + ({ gps: 'de GPS', banque: 'de banque', musique: 'de musique', mail: 'de messagerie' }[k.id] || 'pour cela') + ' sur ce téléphone.');
    var t = 'Je ne trouve pas d\'appli nommée ' + p.unknown + '.';
    if (p.near) return X.ask(t + ' Vouliez-vous dire ' + p.near.name + ' ?', 'yesno', { yes: 'Ouvrir ' + p.near.name, k: 'Ouvrir' }).then(function (ok) { if (ok) return H.open_app(p.near); return say('D\'accord.'); });
    return say(t);
  }
  /** PC : Majordome ne lance pas les programmes Windows (le navigateur l'interdit) ; site de l'appli proposé s'il existe */
  function pcOther(name, p) {
    var k = p && p.known, near = p && p.near;
    if (k && k.web) {
      var host = k.web.replace(/^https:\/\/(www\.)?/, '').replace(/\/.*$/, '');
      return X.ask('Sur l\'ordinateur, je ne peux pas lancer ' + k.name + ' : je n\'ouvre que les applis de la Suite et des sites. Voulez-vous le site ' + host + ' ?', 'yesno', { yes: 'Ouvrir ' + host, k: 'Ouvrir' })
        .then(function (ok) { if (ok) return X.openLink(k.web, k.name + ' (' + host + ')'); return say('D\'accord.'); });
    }
    if (k) return say('Sur l\'ordinateur, je ne peux pas lancer ' + k.name + ' : je n\'ouvre que les applis de la Suite et des sites.');
    if (near && !near.ext) return X.ask('Je ne trouve pas d\'appli nommée ' + name + '. Vouliez-vous dire ' + near.name + ' ?', 'yesno', { yes: 'Ouvrir ' + near.name, k: 'Ouvrir' }).then(function (ok) { if (ok) return H.open_app(near); return say('D\'accord.'); });
    return say('Je ne trouve pas d\'appli nommée ' + name + '. Sur l\'ordinateur, je n\'ouvre que les applis de la Suite et des sites connus.');
  }
  H.open_sys = function (p) {
    if (PC) {
      if (p.what === 'settings') { X.settingsSheet(); return say('Sur l\'ordinateur, je n\'ouvre pas les paramètres de Windows : voici mes réglages.'); }
      if (p.what === 'browser') return say('Vous y êtes : je fonctionne dans le navigateur.');
      return say('Sur l\'ordinateur, je ne peux pas ouvrir ' + p.name + ' : c\'est une commande du téléphone.');
    }
    return sysOpen(p.what, p.sub, p.name);
  };
  H.domo = function (p) {
    return say(X.withSir('Je ne pilote pas ' + p.what) + ' : seulement les lumières Philips Hue' + (ANDROID ? ', et j\'ouvre les applis du téléphone.' : '.'));
  };

  /* ---------------- Réglages › Ouvrir une appli : alias personnels ---------------- */
  function targets() {
    if (ANDROID) return (appList() || []).slice().sort(function (a, b) { return a.label.localeCompare(b.label, 'fr'); }).map(function (a) { return { name: a.label, pkg: a.pkg, cls: a.cls }; });
    var conf = PC && window.MAGPC.conf && window.MAGPC.conf.apps || {}, out = [];
    NLU.APPS.forEach(function (a) { if (conf[a[2]]) out.push({ name: a[1], pkg: a[2] }); });
    NLU.SITES.forEach(function (s) { out.push({ name: s[1] + ' (site)', url: s[2] }); });
    return out;
  }
  var TG = [];
  function applisHtml() {
    TG = targets();
    var l = S.appAliases || [];
    var h = '<div class="sect" id="f-applis">Ouvrir une appli</div>' +
      '<p class="note">' + (ANDROID ? 'Dites « Ouvre WhatsApp », « Lance Waze », « Ouvre les paramètres Wi-Fi »… Je cherche parmi les ' + TG.length + ' applis du téléphone, même mal prononcées ; les applis de la Suite passent en premier.' : 'Sur l\'ordinateur, j\'ouvre les applis de la Suite et des sites connus, pas les programmes Windows.') + '</p>' +
      '<div class="set"><div class="t">Vos raccourcis<small>« Quand je dis… ouvre… » : par exemple « la banque » → l\'appli de votre banque, « le GPS » → Waze.</small></div></div>';
    h += l.length ? l.map(function (a, i) { return '<div class="set"><div class="t">« ' + esc(a.say) + ' »<small>ouvre ' + esc(a.name) + '</small></div><button class="btn sm" data-aldel="' + i + '">Supprimer</button></div>'; }).join('') : '<p class="note">Aucun raccourci pour l\'instant.</p>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0"><input class="in" id="alSay" placeholder="Quand je dis… (ex. la banque)" style="flex:1 1 160px;min-width:0">' +
      '<select class="in" id="alApp" style="flex:1 1 160px;min-width:0"><option value="">… ouvre</option>' + TG.map(function (a, i) { return '<option value="' + i + '">' + esc(a.name) + '</option>'; }).join('') + '</select>' +
      '<button class="btn sm pri" id="alAdd">Ajouter</button></div>';
    return h;
  }
  function bind(b) {
    var add = document.getElementById('alAdd');
    if (add) add.onclick = function () {
      var say0 = (document.getElementById('alSay').value || '').trim(), k = document.getElementById('alApp').value, tg = TG[+k];
      if (!say0 || !NLU.akey(say0)) { X.toast('Écrivez ce que vous direz'); return; }
      if (k === '' || !tg) { X.toast('Choisissez l\'appli à ouvrir'); return; }
      var key = NLU.akey(say0), l = (S.appAliases || []).filter(function (a) { return NLU.akey(a.say) !== key; });
      var o = { say: say0, name: tg.name.replace(/ \(site\)$/, '') }; if (tg.url) o.url = tg.url; else { o.pkg = tg.pkg; if (tg.cls) o.cls = tg.cls; }
      l.push(o); S.appAliases = l; X.saveS();
      X.toast('« ' + say0 + ' » ouvre ' + o.name); X.settingsSheet('applis');
    };
    b.querySelectorAll('[data-aldel]').forEach(function (x) {
      x.onclick = function () { var l = (S.appAliases || []).slice(); l.splice(+x.dataset.aldel, 1); S.appAliases = l; X.saveS(); X.settingsSheet('applis'); };
    });
  }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + applisHtml(); };
  MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };

  // pour les essais
  MJ.applis = { list: appList, targets: targets };
})();
