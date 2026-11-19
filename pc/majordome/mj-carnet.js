/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-carnet.js : ne pas modifier ici. */
/* =====================================================================
   Majordome › Carnet des phrases non comprises
   Chaque phrase que Majordome ne comprend pas est notée (ce qu'il a entendu, moteur de dictée, suggestion proposée),
   avec, s'il y en a une, la phrase comprise juste après (« puis : … »), qui dit souvent ce que vous vouliez.
   Réglages › Carnet des phrases non comprises : liste, « Envoyer » (feuille de partage, par exemple vers Claude
   pour ajouter ces formulations), « Copier », « Vider ». Par la voix : « montre le carnet », « envoie le carnet ».
   Rien ne part tout seul : le carnet reste sur l'appareil tant que vous ne l'envoyez pas.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, S = X.S, esc = X.esc, B = X.B;
  var KEY = 'majordome:carnet', MAX = 300;
  function load() { try { var l = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function save(l) { try { localStorage.setItem(KEY, JSON.stringify(l.slice(-MAX))); } catch (e) { } }
  function when(t) { var d = new Date(t); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }

  // 1. noter chaque phrase non comprise
  var prevUnknown = H.unknown;
  H.unknown = function (p, r) {
    var q = String((r && r.raw) || (MJ.cur && MJ.cur.q) || '').trim();
    if (q) {
      var l = load();
      l.push({ at: Date.now(), q: q, via: MJ.voiceTurn ? 'voix' : 'clavier', eng: MJ.voiceTurn ? (S.engine || '') : '', sg: p && p.suggest && p.suggest.phrase ? p.suggest.phrase : '' });
      save(l);
    }
    return prevUnknown ? prevUnknown(p, r) : X.answer('Je n\'ai pas compris.').done;
  };
  // 2. la phrase comprise juste après (moins de 45 s) : souvent la bonne formulation
  var prevAfter = MJ.afterCmd;
  MJ.afterCmd = function (text, r) {
    try {
      if (r && r.intent && !/^(unknown|carnet|help|stop|thanks|repeat)$/.test(r.intent)) {
        var l = load(), e = l[l.length - 1];
        if (e && !e.puis && Date.now() - e.at < 45000 && String(text).trim() !== e.q) { e.puis = String(text).trim(); e.intent = r.intent; save(l); }
      }
    } catch (x) { }
    return prevAfter ? prevAfter(text, r) : undefined;
  };

  function report() {
    var l = load();
    if (!l.length) return '';
    return 'Carnet des phrases non comprises par Majordome (' + l.length + ')\n' +
      l.map(function (e) { return '- ' + when(e.at) + ' [' + e.via + (e.eng ? ', ' + e.eng : '') + '] « ' + e.q + ' »' + (e.sg ? ' (suggestion : ' + e.sg + ')' : '') + (e.puis ? ' → puis : « ' + e.puis + ' » (' + e.intent + ')' : ''); }).join('\n') +
      '\n\nVersion de Majordome : ' + (X.MJ_VERSION || '') + '\n';
  }
  function send() {
    var t = report(); if (!t) { X.toast('Le carnet est vide.'); return; }
    if (B && B.shareText) B.shareText('Phrases non comprises par Majordome', t);
    else if (navigator.share) navigator.share({ title: 'Phrases non comprises par Majordome', text: t }).catch(function () { });
    else copy();
  }
  function copy() {
    var t = report(); if (!t) { X.toast('Le carnet est vide.'); return; }
    if (B && B.copyText) B.copyText('Carnet Majordome', t);
    else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { X.toast('Copié'); }, function () { X.toast('Copie impossible'); });
  }

  // 3. réglages
  function html() {
    var l = load(), last = l.slice(-15).reverse();
    return '<div class="sect" id="f-carnet">Carnet des phrases non comprises</div>' +
      '<p class="note">' + (l.length ? l.length + ' phrase' + (l.length > 1 ? 's' : '') + ' notée' + (l.length > 1 ? 's' : '') + '. Envoyez le carnet de temps en temps (par exemple à Claude) pour que ces formulations soient ajoutées.' : 'Vide : les phrases que je ne comprends pas seront notées ici.') + '</p>' +
      (last.length ? '<div class="list">' + last.map(function (e) { return '<div class="set"><div class="t">« ' + esc(e.q) + ' »<small>' + when(e.at) + ' · ' + e.via + (e.puis ? ' · puis : « ' + esc(e.puis) + ' »' : '') + '</small></div></div>'; }).join('') + '</div>' : '') +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button class="btn sm" id="cnSend"' + (l.length ? '' : ' disabled') + '>Envoyer</button><button class="btn sm" id="cnCopy"' + (l.length ? '' : ' disabled') + '>Copier</button><button class="btn sm" id="cnClear"' + (l.length ? '' : ' disabled') + '>Vider</button></div>';
  }
  function bind() {
    var g = function (id) { return document.getElementById(id); };
    if (g('cnSend')) g('cnSend').onclick = send;
    if (g('cnCopy')) g('cnCopy').onclick = copy;
    if (g('cnClear')) g('cnClear').onclick = function () { if (!confirm('Vider le carnet des phrases non comprises ?')) return; save([]); X.settingsSheet('carnet'); };
  }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + html(); };
  MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };

  // 4. commandes vocales
  H.carnet = function (p) {
    var l = load();
    if (p.act === 'send') { if (!l.length) return X.answer('Le carnet est vide : je n\'ai rien raté récemment.').done; send(); return X.answer('Voici le carnet, choisissez où l\'envoyer.').done; }
    if (p.act === 'clear') { save([]); return X.answer('Carnet vidé.').done; }
    if (!l.length) return X.answer('Le carnet est vide : je n\'ai rien raté récemment.').done;
    var last = l.slice(-6).reverse();
    var c = X.answer({ say: l.length + ' phrase' + (l.length > 1 ? 's' : '') + ' non comprise' + (l.length > 1 ? 's' : '') + '. Voici les dernières.', html: '<div class="k">Carnet</div><ul>' + last.map(function (e) { return '<li>« ' + esc(e.q) + ' »' + (e.puis ? ' → « ' + esc(e.puis) + ' »' : '') + '</li>'; }).join('') + '</ul><div class="row"><button class="btn sm" data-cn="send">Envoyer le carnet</button></div>' });
    var b = c.querySelector('[data-cn="send"]'); if (b) b.onclick = send;
    return c.done;
  };
  MJ.carnet = { report: report, send: send, count: function () { return load().length; } };
})();
