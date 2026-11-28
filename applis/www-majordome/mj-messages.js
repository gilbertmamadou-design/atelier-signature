/* =====================================================================
   Majordome › Messages reçus : « j'ai des messages ? », « lis-moi mes messages (WhatsApp, mails…) »,
   « qu'est-ce que Marie a dit ? », « la suite », « réponds à Marie : j'arrive ».
   Source : notifications de messagerie recueillies par MajordomeNotifs.java (Android, accès à autoriser une fois).
   Messages lus : retenus ici (localStorage), pour ne pas relire deux fois les mêmes.
   Annonce des nouveaux messages pendant que Majordome est ouvert : réglage (expéditeur seul, ou avec le texte).
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, B = X.B, S = X.S, esc = X.esc, J = X.J, answer = X.answer;
  // téléphone : notifications ; PC (programme Suite MAG.exe) : les mails Gmail de mj-google.js
  var HAS = !!(B && B.notifList && (X.ANDROID || B.gmail));
  var KREAD = 'majordome:msgs-lus';
  var READ = {}; (X.lsGet(KREAD, []) || []).forEach(function (id) { READ[id] = 1; });
  var CUR = { queue: [], last: null };
  if (S.msgAnnonce == null) S.msgAnnonce = 'off';          // off | nombre (arrivée et nombre de non lus) | qui (expéditeur et appli) | texte (avec le message)

  function saveRead() { var l = Object.keys(READ); if (l.length > 400) { l = l.slice(-300); READ = {}; l.forEach(function (id) { READ[id] = 1; }); } X.lsSet(KREAD, l); }
  function norm(s) { return X.deacc(String(s || '')).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function all() { if (!HAS) return []; return (J(B.notifList(), []) || []).sort(function (a, b) { return a.t - b.t; }); }
  var SMS = /messaging|mms|\.sms/;
  function match(m, app, from) {
    if (app) {
      if (app === 'sms') { if (!SMS.test(m.pkg)) return false; }
      else if (app === 'mail') { if (!m.mail) return false; }
      else if (norm(m.app).indexOf(app) < 0 && m.pkg.indexOf(app) < 0) return false;
    }
    if (from) { var f = norm(from), w = norm(m.from + ' ' + (m.conv || '')); if (w.indexOf(f) < 0 && !f.split(' ').every(function (x) { return w.indexOf(x) >= 0; })) return false; }
    return true;
  }
  // Réglages › Écran : case « Messages » (nombre de non lus, messages et mails) ; null : lecture des notifications non autorisée
  MJ.msgNonLus = function () {
    try { if (!HAS || !B.notifAccess()) return null; } catch (e) { return null; }
    var l = all().filter(function (m) { return !READ[m.id]; }), nm = l.filter(function (m) { return m.mail; }).length;
    return { msg: l.length - nm, mails: nm, dernier: l.length ? l[l.length - 1] : null };
  };
  function unread(app, from) { return all().filter(function (m) { return !READ[m.id] && match(m, app, from); }); }
  function kind(m) { return m.mail ? 'mail' : SMS.test(m.pkg) ? 'SMS' : 'message'; }
  function where(m) { return SMS.test(m.pkg) ? 'par SMS' : 'sur ' + m.app; }
  function nb(n, w) { return (n === 1 ? (w === 'mail' ? 'un' : 'un') : n) + ' ' + w + (n > 1 && !/s$/.test(w) ? 's' : ''); }
  function ago(t) {
    var d = Date.now() - t, mn = Math.round(d / 60000);
    if (mn < 1) return 'à l\'instant';
    if (mn < 60) return 'il y a ' + mn + ' minute' + (mn > 1 ? 's' : '');
    var dt = new Date(t), h = dt.getHours() + ' heures' + (dt.getMinutes() ? ' ' + dt.getMinutes() : '');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return t >= today.getTime() ? 'à ' + h : t >= today.getTime() - 86400000 ? 'hier à ' + h : 'le ' + dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  function spoken(s, max) { s = String(s || '').replace(/https?:\/\/\S+/g, 'un lien').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max).replace(/\s\S*$/, '') + '…' : s; }
  function need() {
    if (!HAS) { answer(X.PC ? 'Je lis les messages sur le téléphone seulement.' : 'Cette version de Majordome ne sait pas encore lire les messages.'); return false; }
    if (!B.notifAccess()) {
      answer({ say: 'Il faut d\'abord m\'autoriser à voir les notifications. J\'ouvre le réglage.', html: '<p>Pour lire vos messages, autorisez <b>Majordome</b> dans <b>Accès aux notifications</b>.</p><p class="note">Si Android le grise (« paramètre restreint ») : Infos de l\'appli Majordome › menu ⋮ en haut à droite › « Autoriser les paramètres restreints », puis recommencez.</p><div class="row"><button class="btn pri" data-mjn="acc">Autoriser</button><button class="btn" data-mjn="info">Infos de l\'appli</button></div>' });
      setTimeout(function () { try { B.notifSettings(); } catch (e) { } }, 1800);
      return false;
    }
    return true;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mjn]'); if (!b) return;
    if (b.dataset.mjn === 'acc') B.notifSettings(); else if (b.dataset.mjn === 'info') B.appInfo();
  });

  /* Résumé : « 3 nouveaux messages : 2 de Marie sur WhatsApp et un mail de Jean Dupont » */
  function summary(l) {
    var g = {}, order = [];
    l.forEach(function (m) { var k = kind(m) + '|' + (m.conv || m.from) + '|' + (m.mail ? '' : m.app); if (!g[k]) { g[k] = { m: m, n: 0 }; order.push(k); } g[k].n++; });
    var parts = order.slice(-4).reverse().map(function (k) {
      var x = g[k], m = x.m;
      return m.mail ? nb(x.n, 'mail') + ' de ' + m.from : nb(x.n, 'message') + (m.conv ? ' du groupe ' + m.conv : ' de ' + m.from) + ' ' + where(m);
    });
    if (order.length > 4) parts.push('et d\'autres');
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1] : parts[0];
  }
  function sayOne(m) {
    var head = m.mail ? 'Mail de ' + m.from : m.conv ? m.from + ', dans ' + m.conv + ', ' + where(m) : m.from + ', ' + where(m);
    return head + ', ' + ago(m.t) + ' : ' + spoken(m.text, m.mail ? 320 : 400);
  }
  function cardHtml(l) {
    return '<div class="k">Messages</div>' + l.map(function (m) {
      return '<div style="padding:6px 0;border-bottom:1px solid #ffffff14"><b>' + esc(m.from) + '</b> <span class="note">' + esc((m.conv ? m.conv + ' · ' : '') + (m.mail ? 'mail · ' : '') + m.app + ' · ' + ago(m.t)) + '</span><div>' + esc(spoken(m.text, 600)) + '</div></div>';
    }).join('');
  }
  function readList(l, more) {
    var chunk = l.slice(0, 4), rest = l.slice(4);
    CUR.queue = rest; if (chunk.length) CUR.last = chunk[chunk.length - 1];
    chunk.forEach(function (m) { READ[m.id] = 1; }); saveRead();
    var say = chunk.map(sayOne).join('. ') + '.';
    if (rest.length) say += ' Il en reste ' + rest.length + ' : dites « la suite ».';
    else if (chunk.length && chunk[chunk.length - 1].reply) say += ' Pour répondre, dites « réponds » puis votre message.';
    return answer({ say: say, html: cardHtml(chunk) + (rest.length ? '<p class="note">Encore ' + rest.length + ' : « la suite »</p>' : '') }).done;
  }

  H.msgs = function (p) {
    if (!need()) return;
    var act = p.act || 'count';
    if (act === 'clear') { B.notifClear(); READ = {}; saveRead(); CUR = { queue: [], last: null }; return answer(X.ack('J\'ai oublié les messages reçus.')).done; }
    if (act === 'markread') { unread().forEach(function (m) { READ[m.id] = 1; }); saveRead(); return answer(X.ack('Tous les messages sont marqués comme lus.')).done; }
    if (act === 'more') { if (!CUR.queue.length) return answer('Il n\'y a pas d\'autre message à lire.').done; return readList(CUR.queue.filter(function (m) { return !READ[m.id]; })); }
    if (act === 'last') {
      var la = all().filter(function (m) { return match(m, p.app, p.from); }).pop();
      if (!la) return answer('Je n\'ai aucun message' + (p.from ? ' de ' + p.from : '') + '.').done;
      CUR.last = la; READ[la.id] = 1; saveRead();
      return answer({ say: sayOne(la) + '.', html: cardHtml([la]) }).done;
    }
    var l = unread(p.app, p.from);
    if (act === 'count') {
      if (!l.length) {
        var tot = all().filter(function (m) { return match(m, p.app, p.from); }).length;
        return answer(X.withSir('Pas de nouveau message') + '.' + (tot ? ' Dites « relis le dernier message » pour réentendre le dernier.' : '')).done;
      }
      return answer({ say: (l.length === 1 ? 'Vous avez un nouveau ' + (l[0].mail ? 'mail' : 'message') + ' : ' : 'Vous avez ' + l.length + ' nouveaux messages : ') + summary(l) + '. Voulez-vous que je les lise ? Dites « lis-moi mes messages ».', html: '<div class="k">Messages</div><p>' + esc(l.length + ' non lu' + (l.length > 1 ? 's' : '') + ' : ' + summary(l)) + '</p><div class="row"><button class="btn pri" data-mjn-read>Lire</button></div>' }).done;
    }
    if (!l.length) {
      if (p.from) { var old = all().filter(function (m) { return match(m, p.app, p.from); }).slice(-3); if (old.length) { CUR.last = old[old.length - 1]; return answer({ say: 'Pas de nouveau message de ' + p.from + '. Le dernier : ' + sayOne(old[old.length - 1]) + '.', html: cardHtml(old) }).done; } }
      return answer(X.withSir('Pas de nouveau message' + (p.from ? ' de ' + p.from : '')) + '.').done;
    }
    return readList(l);
  };
  document.addEventListener('click', function (e) { if (e.target.closest('[data-mjn-read]')) { MJ.voiceTurn = false; H.msgs({ act: 'read' }); } });

  H.msg_reply = function (p) {
    if (!need()) return;
    var l = all().filter(function (m) { return m.reply && !m.mail; }), target = null;
    if (p.who) target = l.filter(function (m) { return match(m, '', p.who); }).pop();
    else target = CUR.last && CUR.last.reply ? CUR.last : l.pop();
    if (!target) return answer(p.who ? 'Je ne trouve pas de conversation récente avec ' + p.who + ' à laquelle répondre. Les réponses passent par la notification : elle doit encore être affichée.' : 'Je n\'ai pas de message auquel répondre.').done;
    var to = target.conv || target.from;
    return (p.text ? Promise.resolve(p.text) : X.ask('Que voulez-vous répondre à ' + to + ' ?', 'text')).then(function (txt) {
      if (!txt) return answer('Réponse annulée.');
      return X.ask('Je réponds à ' + to + ' ' + where(target) + ' : « ' + txt + ' ». Je confirme ?', 'yesno', { yes: 'Envoyer', k: 'Réponse' }).then(function (ok) {
        if (!ok) return answer('Réponse annulée.');
        var r = B.notifReply(target.key, txt);
        if (r === 'ok') { all().filter(function (m) { return m.key === target.key; }).forEach(function (m) { READ[m.id] = 1; }); saveRead(); return answer(X.ack('Réponse envoyée à ' + to + '.')); }
        return answer(r === 'absent' ? 'La notification de ' + to + ' a disparu : je ne peux plus répondre par là. Ouvrez ' + target.app + ' pour répondre.' : 'La réponse n\'est pas partie. Ouvrez ' + target.app + ' pour répondre.');
      });
    });
  };

  /* Nouveaux messages pendant que Majordome est ouvert */
  var prevEv = window.majordomeEvent;
  window.majordomeEvent = function (type, data) {
    if (type === 'notif') {
      try {
        var l = (J(data, []) || []).filter(function (m) { return !READ[m.id] && Date.now() - m.t < 10 * 60000; });
        if (l.length && S.msgAnnonce !== 'off' && !X.speaking()) {
          if (S.msgAnnonce === 'nombre') {
            // juste l'arrivée et le nombre de non lus (messages et mails), sans dire qui ni quoi
            var nl = all().filter(function (m) { return !READ[m.id]; }), nm = nl.filter(function (m) { return m.mail; }).length, ns = nl.length - nm;
            var tot = [ns ? nb(ns, 'message') + ' non lu' + (ns > 1 ? 's' : '') : '', nm ? nb(nm, 'mail') + ' non lu' + (nm > 1 ? 's' : '') : ''].filter(Boolean).join(' et ');
            answer({ say: (l.length === 1 ? 'Nouveau ' + kind(l[0]) + '.' : l.length + ' nouveaux messages.') + (tot ? ' Vous avez ' + tot + '.' : ''), html: '<div class="k">Nouveau</div><p>' + esc(tot ? 'Vous avez ' + tot + '.' : 'Nouveau message.') + '</p><div class="row"><button class="btn sm" data-mjn-read>Lire</button></div>' });
          }
          else if (S.msgAnnonce === 'texte' && l.length === 1) { CUR.last = l[0]; READ[l[0].id] = 1; saveRead(); answer({ say: 'Nouveau ' + kind(l[0]) + '. ' + sayOne(l[0]) + '.', html: cardHtml(l) }); }
          else answer({ say: (l.length === 1 ? 'Nouveau ' + kind(l[0]) + ' de ' + (l[0].conv || l[0].from) + ' ' + (l[0].mail ? '' : where(l[0])) : l.length + ' nouveaux messages : ' + summary(l)) + '.', html: '<div class="k">Nouveau</div><p>' + esc(summary(l)) + '</p><div class="row"><button class="btn sm" data-mjn-read>Lire</button></div>' });
        }
      } catch (e) { }
      return;
    }
    if (prevEv) return prevEv.apply(this, arguments);
  };

  /* Réglages › Messages */
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () {
    var h = prevExtra ? prevExtra() : '';
    if (!HAS) return h;
    var ok = B.notifAccess();
    if (B.gmail) return h + '<div class="sect" id="f-messages">Mails reçus</div>' +
      '<div class="set"><div class="t">Gmail<small>' + (ok ? 'Relié : les mails non lus de la boîte principale' : 'Pas encore relié') + '</small></div><button class="btn sm" id="mjnAcc">' + (ok ? 'Réglages' : 'Relier Gmail') + '</button></div>' +
      '<div class="set"><div class="t">Annoncer les nouveaux mails<small>Quand Majordome est ouvert ; chaque profil garde son choix</small></div><select class="in" id="mjnAnn" style="width:auto">' +
      [['off', 'Non'], ['nombre', 'Juste l\'arrivée et le nombre'], ['qui', 'Qui écrit'], ['texte', 'Qui écrit et l\'objet']].map(function (o) { return '<option value="' + o[0] + '"' + (S.msgAnnonce === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<p class="note">À dire : « J\'ai des mails ? », « Lis-moi mes mails », « La suite ».</p>';
    return h + '<div class="sect" id="f-messages">Messages reçus</div>' +
      '<div class="set"><div class="t">Lire les messages et les mails<small>' + (ok ? 'Autorisé : WhatsApp, SMS, Messenger, Outlook, Gmail… (ce qu\'affichent les notifications)' : 'Pas encore autorisé') + '</small></div><button class="btn sm' + (ok ? '' : ' pri') + '" id="mjnAcc">' + (ok ? 'Réglage' : 'Autoriser') + '</button></div>' +
      (ok ? '' : '<p class="note">Android 13 et plus, si l\'option est grisée : Infos de l\'appli › ⋮ › « Autoriser les paramètres restreints ». <button class="btn sm" id="mjnInfo">Infos de l\'appli</button></p>') +
      '<div class="set"><div class="t">Annoncer les nouveaux messages<small>Quand Majordome est ouvert ; chaque profil garde son choix (par défaut Maison et Formation : l\'arrivée et le nombre, Chantier : le message)</small></div><select class="in" id="mjnAnn" style="width:auto">' +
      [['off', 'Non'], ['nombre', 'Juste l\'arrivée et le nombre'], ['qui', 'Qui écrit'], ['texte', 'Qui écrit et le message']].map(function (o) { return '<option value="' + o[0] + '"' + (S.msgAnnonce === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="set"><div class="t">Oublier les messages reçus<small>Ils restent sur le téléphone seulement, 4 jours au plus</small></div><button class="btn sm" id="mjnClr">Oublier</button></div>' +
      '<p class="note">À dire : « J\'ai des messages ? », « Lis-moi mes messages WhatsApp », « Qu\'est-ce que Marie a dit ? », « La suite », « Réponds à Marie : j\'arrive ». Les mails : expéditeur, objet et début du texte.</p>';
  };
  MJ.settingsBind = function (b) {
    if (prevBind) prevBind(b);
    var a = document.getElementById('mjnAcc'); if (a) a.onclick = function () { B.notifSettings(); };
    var i = document.getElementById('mjnInfo'); if (i) i.onclick = function () { B.appInfo(); };
    var n = document.getElementById('mjnAnn'); if (n) n.onchange = function () { S.msgAnnonce = this.value; X.saveS(); };
    var c = document.getElementById('mjnClr'); if (c) c.onclick = function () { if (confirm('Oublier tous les messages reçus gardés par Majordome ?')) { B.notifClear(); READ = {}; saveRead(); X.toast('Messages oubliés'); } };
  };
})();
