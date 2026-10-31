/* =====================================================================
   Fond Jarvis : l'assistant dans le fond d'écran.
   - Analyse : MJNLU.parse de Majordome (mj-nlu.js, copie de applis/www-majordome),
     sans IA ni réseau. Exécution : seulement ce qui marche dans une page web
     (heure, date, calculs, conversions, minuteurs et rappels tant que le fond
     tourne, météo et vent, lever et coucher du soleil, titres, agenda, notes et
     listes de Majordome, applis de la Suite, sites connus, réglages de Windows).
   - Réponse écrite dans le panneau de dialogue et dite à voix haute : voix française du
     système (speechSynthesis) ou voix Piper hors ligne avec effet « Jarvis » (mj-voix.js,
     moteur sherpa-onnx WASM : piper/ dans le paquet Lively, ../../applis/www-majordome/piper/
     sur le site) ; repli silencieux sur la voix du système. La sphère réagit (niveau réel
     de la voix Piper, sinon enveloppe des mots).
   - Voix en entrée : dans la Suite MAG, pont de Majordome PC (Vosk hors ligne,
     pc/shared/apps/majordome.js, chargé au premier clic sur le micro) ;
     dans Lively, pas de micro : saisie au clavier et bouton vers Majordome.
   ===================================================================== */
(function (root) {
  'use strict';
  var FJ = root.FJ, NLU = root.MJNLU, doc = document, S = FJ.S, esc = FJ.esc, cap = FJ.cap;
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  function $(id) { return doc.getElementById(id); }
  function now() { return Date.now(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function num(v, d) { return NLU.num(v, d); }
  function deacc(s) { return NLU.deacc(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  var JOURS = FJ.JOURS, MOIS = FJ.MOIS;
  function hm(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : ''); }
  function hmSay(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return h === 0 && !m ? 'minuit' : h === 12 && !m ? 'midi' : h + (h > 1 ? ' heures' : ' heure') + (m ? ' ' + m : ''); }
  function dayName(ms, withDate) {
    var d0 = new Date(now()); d0.setHours(0, 0, 0, 0); var d = new Date(ms), d1 = new Date(ms); d1.setHours(0, 0, 0, 0);
    var off = Math.round((d1 - d0) / DAY);
    var base = off === 0 ? 'aujourd\'hui' : off === 1 ? 'demain' : off === -1 ? 'hier' : off === 2 ? 'après-demain' : JOURS[d.getDay()];
    return withDate || (off > 6 || off < -1) ? base + ', ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] : base;
  }
  function dur(ms) {
    var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, p = [];
    if (h) p.push(h + ' heure' + (h > 1 ? 's' : '')); if (m) p.push(m + ' minute' + (m > 1 ? 's' : '')); if (x && !h) p.push(x + ' seconde' + (x > 1 ? 's' : ''));
    return p.join(' et ') || '0 seconde';
  }
  function clockTx(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
  function sir() { var m = FJ.lsGet('majordome:reglages', {}) || {}; return m.address === 'madame' ? 'Madame' : m.address === 'prenom' ? (m.prenom || '') : m.address === 'aucun' ? '' : 'Monsieur'; }
  function withSir(s) { var x = sir(); return x ? s.replace(/([.!?])?$/, ', ' + x + '$1') : s; }
  var ACKS = ['Bien', 'Entendu', 'Très bien', 'C\'est noté'];
  function ack(extra) { var x = sir(); return ACKS[Math.floor(Math.random() * ACKS.length)] + (x ? ', ' + x : '') + '.' + (extra ? ' ' + extra : ''); }

  /* ---------------- Voix (synthèse) ---------------- */
  var lastSaid = '', speakId = 0;
  function frVoice() {
    var vs = root.speechSynthesis ? speechSynthesis.getVoices() : [];
    var fr = vs.filter(function (v) { return /^fr/i.test(v.lang); });
    return fr.filter(function (v) { return v.name === S.voice; })[0] || fr.filter(function (v) { return /fr-FR/i.test(v.lang) && v.localService; })[0] || fr[0] || null;
  }
  function speechText(t) { return String(t || '').replace(/km\/h/g, 'kilomètres heure').replace(/°C?/g, ' degrés').replace(/\s%/g, ' pour cent').replace(/[«»"]/g, ''); }
  var VX = FJ.VX = root.MJVoix ? MJVoix.create({ engine: FJ.mode === 'lively' ? 'piper/' : '../../applis/www-majordome/piper/', worker: 'mj-voix-worker.js', phon: 'mj-phon.js' }) : null;
  if (VX && S.tts === 'piper' && VX.hasVoice(S.piperVoice)) setTimeout(function () { VX.warm(S.piperVoice).catch(function () { }); }, 3000);   // première phrase rapide
  function piperSay(t, orb, id, end) {
    var heard = false;
    if (orb) orb.speak(true, t, S.rate);
    setState('Réponse');
    return VX.speak(t, { voice: S.piperVoice, rate: S.rate, pitch: 1, volume: 1, fx: S.vfx, fxo: S.vfxo }, { onStart: function () { heard = true; }, onLevel: function (v) { if (orb && speakId === id) orb.voice(v); } })
      .then(function () { end(); return true; }, function () { if (heard) { end(); return true; } return false; });
  }
  function speak(text) {
    lastSaid = text;
    var orb = FJ.orb, id = ++speakId;
    return new Promise(function (done) {
      if (S.voiceOn && S.tts === 'piper' && VX && VX.usable(S.piperVoice)) {   // voix Piper ; échec avant le premier son : voix du système, sans message
        if (VX) VX.stop(); try { if (root.speechSynthesis) speechSynthesis.cancel(); } catch (e) { }
        var pend = function () { if (orb && speakId === id) { orb.speak(false); if (orb.get() === 'speak') orb.state(listening ? 'listen' : 'idle'); setState(listening ? 'J\'écoute' : 'En ligne'); } if (B && B.hold) try { B.hold(false); } catch (e) { } done(); };
        if (B && B.hold) try { B.hold(true); } catch (e) { }
        piperSay(speechText(text), orb, id, pend).then(function (ok) { if (!ok) system(); });
        return;
      }
      system();
      function system() {
      if (!S.voiceOn || !root.speechSynthesis || !root.SpeechSynthesisUtterance) { if (orb) { orb.pulse(); } return done(); }
      try { speechSynthesis.cancel(); } catch (e) { }
      var t = speechText(text), u = new SpeechSynthesisUtterance(t), v = frVoice(), fin = false;
      u.lang = v ? v.lang : 'fr-FR'; if (v) u.voice = v; u.rate = Math.max(0.5, Math.min(2, +S.rate || 1));
      var end = function () { if (fin) return; fin = true; if (orb && speakId === id) { orb.speak(false); if (orb.get() === 'speak') orb.state(listening ? 'listen' : 'idle'); setState(listening ? 'J\'écoute' : 'En ligne'); } if (B && B.hold) try { B.hold(false); } catch (e) { } done(); };
      u.onend = end; u.onerror = end;
      u.onboundary = function (e) { if (orb && e && e.name !== 'sentence' && e.charIndex != null) orb.word(null, e.charIndex, e.charLength ? e.charIndex + e.charLength : undefined); else if (orb) orb.pulse(); };
      if (orb) orb.speak(true, t, u.rate);
      setState('Réponse');
      if (B && B.hold) try { B.hold(true); } catch (e) { }
      speechSynthesis.speak(u);
      setTimeout(end, Math.min(60000, 1500 + t.length * 95 / u.rate));   // filet : certaines voix n'envoient jamais « fin »
      }
    });
  }
  function preview(id) { if (!VX) return; shush(); var orb = FJ.orb, sid = ++speakId; VX.preview(id, { rate: S.rate, fx: S.vfx, fxo: S.vfxo }, { onLevel: function (v) { if (orb && speakId === sid) orb.voice(v); } }).then(function () { if (orb) { orb.speak(false); orb.state('idle'); } }, function () { if (orb) orb.speak(false); }); }
  if (root.speechSynthesis && speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', function () { });
  function shush() { try { if (VX) VX.stop(); if (root.speechSynthesis) speechSynthesis.cancel(); } catch (e) { } if (FJ.orb) { FJ.orb.speak(false); FJ.orb.state('idle'); } }

  /* ---------------- Panneau de dialogue ---------------- */
  var say = $('say'), hideT = 0, wait = null;
  function setState(t) { $('aiState').textContent = t; }
  function showSay() { say.hidden = false; doc.getElementById('hud').classList.add('talk'); clearTimeout(hideT); FJ.relayout(); }
  function autoHide() { clearTimeout(hideT); hideT = setTimeout(function () { if (say.matches(':hover') || wait || say.contains(doc.activeElement)) return autoHide(); dismiss(); }, 45000); }
  function dismiss() { if (wait) wait.resolve(null); say.hidden = true; say.innerHTML = ''; doc.getElementById('hud').classList.remove('talk'); FJ.relayout(); }
  function youLine(t) { showSay(); while (say.children.length > 6) say.removeChild(say.firstChild); var p = doc.createElement('div'); p.className = 'you'; p.textContent = t; say.appendChild(p); }
  /** Réponse : o = texte, ou {say, show, html, cls, k} ; renvoie l'élément, avec .done (fin de la parole) */
  function answer(o) {
    if (typeof o === 'string') o = { say: o };
    showSay();
    var d = doc.createElement('div'); d.className = 'ai' + (o.cls ? ' ' + o.cls : '');
    d.innerHTML = (o.k ? '<div class="k">' + esc(o.k) + '</div>' : '') + (o.html || '<p style="margin:0">' + esc(o.show || o.say || '') + '</p>');
    say.appendChild(d); say.scrollTop = say.scrollHeight;
    if (o.cls === 'err' && FJ.orb) { FJ.orb.state('error'); setTimeout(function () { if (FJ.orb.get() === 'error') FJ.orb.state('idle'); }, 1400); }
    d.done = o.say ? speak(o.say) : Promise.resolve();
    autoHide();
    FJ.last = { say: o.say || o.show || '', html: d.innerHTML };
    return d;
  }
  function ask(q, slot, opt) {
    opt = opt || {};
    if (wait) wait.resolve(null);
    return new Promise(function (resolve) {
      var w = { slot: slot, resolve: null }, timer = 0;
      w.resolve = function (v) { if (wait !== w) return; wait = null; clearTimeout(timer); if (w.card) w.card.querySelectorAll('button').forEach(function (b) { b.disabled = true; }); resolve(v); };
      wait = w;
      var btns = slot === 'yesno' ? '<div class="row"><button type="button" class="btn ' + (opt.danger ? 'bad' : 'pri') + '" data-y>' + esc(opt.yes || 'Confirmer') + '</button><button type="button" class="btn" data-n>Annuler</button></div>'
        : '<div class="row"><button type="button" class="btn" data-n>Annuler</button></div>';
      w.card = answer({ say: q, html: '<p style="margin:0">' + esc(q) + '</p>' + btns, cls: opt.danger ? 'warn' : '', k: slot === 'yesno' ? 'Confirmation' : 'Précision' });
      w.card.addEventListener('click', function (e) { if (e.target.closest('[data-y]')) w.resolve(true); else if (e.target.closest('[data-n]')) w.resolve(slot === 'yesno' ? false : null); });
      timer = setTimeout(function () { w.resolve(slot === 'yesno' ? false : null); }, 40000);
      $('q').focus();
    });
  }
  /** Lien à ouvrir : tout de suite si l'action vient d'un clic ou du clavier, sinon bouton (navigateur et Lively exigent un geste) */
  function openLink(url, label, sayIt) {
    if (FJ.userActive()) { FJ.open(url); return answer(sayIt || ack('J\'ouvre ' + label + '.')).done; }
    var c = answer({ say: 'Voici ' + label + '. Cliquez pour l\'ouvrir.', html: '<p style="margin:0">' + esc(cap(label)) + '</p><div class="row"><button type="button" class="btn pri" data-go>Ouvrir ' + esc(label) + '</button></div>' });
    c.querySelector('[data-go]').onclick = function () { FJ.open(url); };
    return c.done;
  }

  /* ---------------- Contexte de l'analyseur ---------------- */
  function names() { var n = deacc(FJ.aiName()), l = [n]; ['majordome', 'jarvis'].forEach(function (x) { if (l.indexOf(x) < 0) l.push(x); }); return l; }
  function ctx() { var c = { now: now(), names: names(), routines: [] }; if (wait) c.expect = { slot: wait.slot }; return c; }

  /* ---------------- Commandes propres au fond (avant l'analyseur) ---------------- */
  var THEME_W = { cyan: 'cyan', bleu: 'bleu', vert: 'vert', ambre: 'ambre', orange: 'ambre', rouge: 'rouge' };
  function local(t) {
    var m;
    if (/^(?:ouvre|lance|affiche)(?: moi)? (?:les |tes )?(?:reglages|parametres|options) (?:du fond|du fond d ecran|de l ecran d accueil)$/.test(t) || /^reglages du fond$/.test(t)) { FJ.settings(); return answer(ack()).done; }
    if ((m = /\b(?:theme|couleur)(?: en)? (cyan|bleu|vert|ambre|orange|rouge)\b/.exec(t)) || (m = /^(?:passe|mets)(?: toi| le fond)? en (cyan|bleu|vert|ambre|orange|rouge)$/.exec(t))) { S.theme = THEME_W[m[1]]; FJ.save(); FJ.apply(); FJ.hud.redrawStatic(); return answer(ack('Thème ' + m[1] + '.')).done; }
    if (/\b(disposition|mode|affichage) (?:complete?|complet)\b/.test(t)) { S.layout = 'complet'; FJ.save(); FJ.apply(); return answer(ack('Disposition complète.')).done; }
    if (/\b(disposition|mode|affichage) epuree?\b/.test(t)) { S.layout = 'epure'; FJ.save(); FJ.apply(); return answer(ack('Disposition épurée.')).done; }
    if (/\b(sphere seule|juste la sphere|seulement la sphere|mode sphere)\b/.test(t)) { S.layout = 'sphere'; FJ.save(); FJ.apply(); return answer(ack('Sphère seule.')).done; }
    if ((m = /^(?:ouvre|lance|demarre|affiche)(?: moi)? (?:l appli |l application )?(majordome|jarvis)$/.exec(t)) || t === deacc('ouvre ' + FJ.aiName())) return openLink(FJ.suiteUrl('majordome'), 'Majordome');
    if (/\b(eteins|eteindre|arrete|arreter|redemarre|redemarrer|verrouille|verrouiller|mets en veille|mettre en veille|veille)\b.*\b(ordinateur|ordi|pc|windows|session|machine)\b/.test(t) || /^(?:mise en veille|arret du pc|eteins tout)$/.test(t)) {
      var c = answer({ say: 'Une page web ne peut pas éteindre, redémarrer ni verrouiller Windows. Utilisez le menu Démarrer, ou Windows plus L pour verrouiller. Je peux ouvrir les réglages d\'alimentation.', html: '<p style="margin:0">Une page web ne peut pas éteindre, redémarrer ni verrouiller Windows : menu Démarrer › Marche/Arrêt, ou <b>Windows + L</b> pour verrouiller.</p><div class="row"><button type="button" class="btn" data-pw>Alimentation et veille</button></div>' });
      c.querySelector('[data-pw]').onclick = function () { FJ.open('ms-settings:powersleep'); };
      return c.done;
    }
    if (/^(?:actualise|rafraichis|mets a jour)(?: la)? meteo$/.test(t)) return FJ.weather(true).then(function () { return answer(ack('Météo actualisée.')).done; }, wxFail);
    return null;
  }

  /* ---------------- Exécution ---------------- */
  var H = {};
  var busy = false;
  function handle(text, via) {
    text = String(text || '').trim(); if (!text) return Promise.resolve();
    via = via || 'text';
    shush();
    youLine(text);
    var t = deacc(text).replace(new RegExp('^(?:' + names().join('|') + ')\\s+'), '');
    var r0 = !wait ? local(t) : null;
    if (r0) return r0;
    var r = NLU.parse(text, ctx());
    FJ.lastIntent = r.intent;
    if (wait && /^(slot|confirm_yes|confirm_no)$/.test(r.intent)) {
      var w = wait;
      if (r.intent === 'confirm_yes') w.resolve(true); else if (r.intent === 'confirm_no') w.resolve(w.slot === 'yesno' ? false : null);
      else w.resolve(r.p.ms != null ? r.p.ms : r.p.when || r.p.text || r.p.choice || null);
      return Promise.resolve();
    }
    if (wait) wait.resolve(null);
    if (FJ.orb) FJ.orb.state('think');
    setState('Analyse');
    var f = H[r.intent] || H.notHere;
    var p;
    try { p = Promise.resolve(f(r.p || {}, r, via)); } catch (e) { console.error(e); p = Promise.resolve(answer({ say: 'Une erreur est survenue.', cls: 'err' }).done); }
    return p.then(function () { if (FJ.orb && FJ.orb.get() === 'think') FJ.orb.state('idle'); if ($('aiState').textContent === 'Analyse') setState('En ligne'); });
  }

  H.empty = function () { };
  H.wake = function () { return answer(withSir('Oui') + ' ?').done; };
  H.stop = function () { shush(); stopRinging(); return answer({ show: 'D\'accord.' }).done; };
  H.thanks = function () { return answer(withSir('À votre service') + '.').done; };
  H.repeat = function () { return answer(lastSaid ? { say: lastSaid } : 'Je n\'ai encore rien dit.').done; };
  H.confirm_yes = H.confirm_no = function () { return answer('Il n\'y a rien à confirmer pour le moment.').done; };
  H.slot = function () { return answer('Je n\'attendais pas de réponse.').done; };
  H.greet = function (p) {
    if (p.kind === 'hello') return answer(withSir('Bonjour') + '. Que puis-je faire pour vous ?').done;
    if (p.kind === 'howareyou') return answer('Tous mes circuits fonctionnent, merci. Et je reste à votre service.').done;
    if (p.kind === 'here') return answer(withSir('Je suis là') + '.').done;
    return answer('Je suis ' + FJ.aiName() + ', l\'assistant de votre bureau : un assistant à commandes, sans intelligence artificielle de conversation. Dites « aide » pour savoir ce que je sais faire ici.').done;
  };
  H.help = function () {
    var l = ['Quelle heure est-il ? · Quel jour sommes-nous ?', 'Combien font 15 % de 240 ? · Convertis 3 pouces en millimètres', 'Minuteur de 10 minutes · Rappelle-moi dans 20 minutes de rappeler Paul', 'Quel temps fait-il ? · Y a-t-il du vent demain ? · À quelle heure se couche le soleil ?', 'Les titres · Mon prochain rendez-vous', 'Ajoute du pain à la liste de courses · Note : commander les vis · Lis mes notes', 'Ouvre le tableur · Ouvre YouTube · Ouvre les paramètres Wi-Fi', 'Thème vert · Disposition épurée · Ouvre les réglages du fond'];
    return answer({ say: 'Voici des exemples de commandes. Ici, je donne l\'heure, la météo, les titres et votre agenda, je calcule, je lance des minuteurs, je tiens vos notes et listes, et j\'ouvre les applis de la Suite, des sites et des réglages de Windows.', html: '<div class="k">Ce que je sais faire ici</div><ul>' + l.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' }).done;
  };
  H.unknown = function (p) {
    var sg = p.suggest;
    if (sg && sg.phrase) {
      var c = answer({ say: 'Je ne sais pas encore faire ça. Vouliez-vous dire : ' + sg.phrase + ' ?', html: '<p style="margin:0">Je ne sais pas encore faire ça.</p><div class="row"><button type="button" class="btn" data-try>« ' + esc(sg.phrase) + ' »</button><button type="button" class="btn" data-help>Aide</button></div>' });
      c.querySelector('[data-try]').onclick = function () { handle(sg.phrase, 'click'); };
      c.querySelector('[data-help]').onclick = function () { handle('aide', 'click'); };
      return c.done;
    }
    var c2 = answer({ say: 'Je ne sais pas encore faire ça. Dites « aide » pour la liste des commandes.', html: '<p style="margin:0">Je ne sais pas encore faire ça.</p><div class="row"><button type="button" class="btn" data-help>Voir ce que je sais faire</button></div>' });
    c2.querySelector('[data-help]').onclick = function () { handle('aide', 'click'); };
    return c2.done;
  };
  /* commande comprise mais impossible dans un fond d'écran */
  H.notHere = function (p, r) {
    var c = answer({ say: 'Je ne peux pas faire cela depuis le fond d\'écran. Majordome, dans la Suite MAG, en fait davantage.', html: '<p style="margin:0">Je ne peux pas faire cela depuis le fond d\'écran.</p><div class="row"><button type="button" class="btn" data-mj>Ouvrir Majordome</button></div>' });
    c.querySelector('[data-mj]').onclick = function () { FJ.open(FJ.suiteUrl('majordome')); };
    return c.done;
  };
  ['call', 'sms', 'torch', 'silent', 'address', 'domo', 'light', 'clim', 'alarm_list', 'alarm_cancel', 'routine_edit', 'budget_add'].forEach(function (k) { H[k] = H.notHere; });
  H.call = H.sms = H.torch = function () { return answer('C\'est une commande du téléphone : je ne peux pas la faire depuis l\'ordinateur.').done; };
  H.budget_balance = function () { return answer('Par discrétion, je ne lis jamais de solde ni de total de comptes. Ouvrez Budget pour les consulter.').done; };
  H.history_clear = function () { say.innerHTML = ''; return answer(ack('Conversation effacée.')).done; };

  /* --- Heure, date --- */
  H.time = function () { var t = now(); return answer({ say: 'Il est ' + hmSay(t) + '.', html: '<div class="k">Heure</div><div class="big">' + hm(t) + '</div>' }).done; };
  H.date = function (p) {
    var t = NLU.addDays(now(), p.offset || 0), d = new Date(t);
    if (p.what === 'year') return answer('Nous sommes en ' + d.getFullYear() + '.').done;
    if (p.what === 'month') return answer('Nous sommes en ' + MOIS[d.getMonth()] + ' ' + d.getFullYear() + '.').done;
    if (p.what === 'week') return answer('Nous sommes en semaine ' + FJ.isoWeek(d) + '.').done;
    var lab = p.offset === 1 ? 'Demain, nous serons ' : p.offset === -1 ? 'Hier, nous étions ' : p.offset === 2 ? 'Après-demain, nous serons ' : 'Nous sommes ';
    var full = JOURS[d.getDay()] + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
    return answer({ say: lab + full + '.', html: '<div class="k">Date</div><div class="big" style="font-size:1.5em">' + esc(cap(full)) + '</div><p style="margin:0">Semaine ' + FJ.isoWeek(d) + '</p>' }).done;
  };
  H.countdown = function (p) {
    if (p.unknown) return answer('Je ne connais pas cette date. Dites par exemple : dans combien de jours est le 14 juillet ?').done;
    var days = Math.round((NLU.startOfDay(p.at) - NLU.startOfDay(now())) / DAY), name = p.name || ('le ' + dayName(p.at, true).replace(/^.*?, /, ''));
    var d = new Date(p.at), when = JOURS[d.getDay()] + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
    if (p.ask === 'day') return answer(cap(name) + ' tombe ' + when + (days > 0 ? ', dans ' + days + ' jour' + (days > 1 ? 's' : '') : days === 0 ? ', c\'est aujourd\'hui' : '') + '.').done;
    if (days === 0) return answer(cap(name) + ', c\'est aujourd\'hui !').done;
    return answer({ say: cap(name) + ' est dans ' + days + ' jour' + (days > 1 ? 's' : '') + ', ' + when + '.', html: '<div class="k">' + esc(cap(name)) + '</div><div class="big">J−' + days + '</div><p style="margin:0">' + esc(cap(when)) + '</p>' }).done;
  };

  /* --- Calculs, conversions --- */
  H.calc = function (p) {
    if (p.value == null) return answer('Je n\'ai pas compris le calcul. Dites par exemple : combien font 15 % de 240 ?').done;
    var v = Math.abs(p.value) < 1e-9 ? 0 : p.value;
    return answer({ say: 'Cela fait ' + num(v, 4) + '.', html: '<div class="k">Calcul</div><div class="big">' + esc(num(v, 4)) + '</div>' }).done;
  };
  var UN = { mm: ['millimètre', 'mm'], cm: ['centimètre', 'cm'], m: ['mètre', 'm'], metre: ['mètre', 'm'], km: ['kilomètre', 'km'], pouce: ['pouce', '″'], pied: ['pied', 'ft'], yard: ['yard', 'yd'], mile: ['mile', 'mi'],
    g: ['gramme', 'g'], kg: ['kilo', 'kg'], kilo: ['kilo', 'kg'], tonne: ['tonne', 't'], livre: ['livre', 'lb'], once: ['once', 'oz'], bar: ['bar', 'bar'], mbar: ['millibar', 'mbar'], psi: ['psi', 'psi'], pa: ['pascal', 'Pa'],
    kpa: ['kilopascal', 'kPa'], mpa: ['mégapascal', 'MPa'], atm: ['atmosphère', 'atm'], litre: ['litre', 'l'], l: ['litre', 'l'], ml: ['millilitre', 'ml'], gallon: ['gallon', 'gal'], m3: ['mètre cube', 'm³'],
    kmh: ['kilomètre-heure', 'km/h'], ms: ['mètre par seconde', 'm/s'], noeud: ['nœud', 'nd'], mph: ['mile par heure', 'mph'], celsius: ['degré Celsius', '°C'], fahrenheit: ['degré Fahrenheit', '°F'], kelvin: ['kelvin', 'K'] };
  function unitWord(u, v) { var w = (UN[u] || [u])[0]; if (Math.abs(v) >= 2 && !/psi|bar$|°/.test(w)) w = w.replace(/^(\S+)/, function (x) { return /s$|x$/.test(x) ? x : x + 's'; }); return w; }
  H.convert = function (p) {
    if (p.error) return answer('Je ne peux pas convertir des ' + unitWord(p.from, 2) + ' en ' + unitWord(p.to, 2) + ' : ce ne sont pas les mêmes grandeurs.').done;
    var dec = p.kind === 't' ? 1 : Math.abs(p.result) >= 100 ? 1 : 3, res = num(p.result, dec), src = num(p.value, 3);
    var s = src + ' ' + unitWord(p.from, p.value) + ' font ' + res + ' ' + unitWord(p.to, p.result) + '.';
    var extra = p.dn ? 'En tuyauterie, ' + src + ' pouce' + (p.value >= 2 ? 's' : '') + ' correspond au DN ' + p.dn.dn + ', soit ' + num(p.dn.od, 1) + ' millimètres de diamètre extérieur.' : p.dnFromOd ? 'Un tube de ' + src + ' mm de diamètre extérieur correspond au DN ' + p.dnFromOd.dn + '.' : '';
    return answer({ say: s + (extra ? ' ' + extra : ''), html: '<div class="k">Conversion</div><div class="big">' + esc(res + ' ' + (UN[p.to] || [, p.to])[1]) + '</div><p style="margin:0">' + esc(src + ' ' + (UN[p.from] || [, p.from])[1]) + '</p>' + (extra ? '<p style="margin:.3em 0 0;opacity:.75">' + esc(extra) + '</p>' : '') }).done;
  };

  /* --- Minuteurs, rappels (tant que le fond tourne) --- */
  var TKEY = 'fond-jarvis:minuteurs', AL = FJ.lsGet(TKEY, []) || [], ringing = {}, tickT = 0;
  function saveAL() { FJ.lsSet(TKEY, AL); renderTimers(); }
  function addAlarm(o) { o.id = uid(); AL.push(o); saveAL(); tick(); }
  function removeAlarm(o) { AL = AL.filter(function (x) { return x.id !== o.id; }); delete ringing[o.id]; saveAL(); }
  var AC = null;
  function beep() {
    try {
      AC = AC || new (root.AudioContext || root.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
      [0, 0.28, 0.56].forEach(function (d) { var o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, AC.currentTime + d); g.gain.exponentialRampToValueAtTime(0.22, AC.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d + 0.2); o.connect(g); g.connect(AC.destination); o.start(AC.currentTime + d); o.stop(AC.currentTime + d + 0.22); });
    } catch (e) { }
  }
  function fire(o) {
    if (ringing[o.id]) return;
    ringing[o.id] = true; renderTimers(); beep();
    var late = now() - o.at > 2 * MIN;
    var txt = o.kind === 'timer' ? 'Le minuteur de ' + dur(o.ms) + (o.label ? ' pour ' + o.label : '') + ' est terminé.' : 'Rappel : ' + (o.text || '') + '.';
    answer({ say: (late ? 'Pendant que le fond était arrêté : ' : '') + txt, k: o.kind === 'timer' ? 'Minuteur' : 'Rappel', cls: 'warn' });
    FJ.toast(txt, 8000);
    setTimeout(function () { if (ringing[o.id]) removeAlarm(o); }, 60000);
  }
  function stopRinging() { Object.keys(ringing).forEach(function (id) { var o = AL.filter(function (x) { return x.id === id; })[0]; if (o) removeAlarm(o); else delete ringing[id]; }); }
  function tick() {
    clearTimeout(tickT);
    var t = now();
    AL.forEach(function (o) { if (o.at <= t) fire(o); });
    renderTimers();
    if (AL.length) tickT = setTimeout(tick, 1000 - (t % 1000) + 5);
  }
  function renderTimers() {
    var box = $('timers'), t = now();
    var h = AL.slice().sort(function (a, b) { return a.at - b.at; }).map(function (o) {
      return '<span class="tm' + (ringing[o.id] ? ' ring' : '') + '" data-id="' + o.id + '">' + FJI.svg(o.kind === 'timer' ? 'horloge' : 'agenda') + '<b>' + (ringing[o.id] ? 'Terminé' : o.kind === 'timer' ? clockTx(o.at - t) : hm(o.at)) + '</b>' + esc(o.kind === 'timer' ? (o.label || '') : (o.text || '').slice(0, 28)) + '<button type="button" aria-label="Arrêter" title="Arrêter">✕</button></span>';
    }).join('');
    if (box.innerHTML !== h) { var had = !!box.innerHTML; box.innerHTML = h; if (had !== !!h) FJ.relayout(); }
  }
  $('timers').addEventListener('click', function (e) { var b = e.target.closest('button'), s = e.target.closest('[data-id]'); if (!b || !s) return; var o = AL.filter(function (x) { return x.id === s.dataset.id; })[0]; if (o) removeAlarm(o); });
  H.timer = function (p) {
    var go = function (ms) {
      if (!ms) return answer('Minuteur annulé.').done;
      if (ms > 24 * HOUR) return answer('Un minuteur dure au plus 24 heures.').done;
      addAlarm({ kind: 'timer', at: now() + ms, ms: ms, label: p.label || '' });
      return answer({ say: ack('Minuteur de ' + dur(ms) + (p.label ? ' pour ' + p.label : '') + ' lancé.'), show: 'Minuteur de ' + dur(ms) + (p.label ? ' (' + p.label + ')' : '') + ' lancé. Il sonne tant que le fond d\'écran tourne.' }).done;
    };
    if (p.ms) return go(p.ms);
    return ask('Pour combien de temps ?', 'duration').then(function (ms) { return go(ms); });
  };
  H.timer_cancel = function (p) {
    var l = AL.filter(function (o) { return o.kind === 'timer'; });
    if (!l.length) return answer('Aucun minuteur en cours.').done;
    l.forEach(removeAlarm);
    return answer(ack(l.length > 1 ? l.length + ' minuteurs arrêtés.' : 'Minuteur arrêté.')).done;
  };
  H.timer_query = function () {
    var l = AL.filter(function (o) { return o.kind === 'timer'; }).sort(function (a, b) { return a.at - b.at; });
    if (!l.length) return answer('Aucun minuteur en cours.').done;
    return answer(l.map(function (o) { return 'Il reste ' + dur(o.at - now()) + (o.label ? ' pour ' + o.label : ''); }).join('. ') + '.').done;
  };
  H.stopwatch = function (p) {
    var sw = FJ.lsGet('fond-jarvis:chrono', null) || { run: false, start: 0, acc: 0 }, t = now();
    if (p.cmd === 'start') { if (sw.run) return answer('Le chronomètre tourne déjà : ' + dur(sw.acc + t - sw.start) + '.').done; sw.run = true; sw.start = t; FJ.lsSet('fond-jarvis:chrono', sw); return answer(ack('Chronomètre lancé.')).done; }
    if (p.cmd === 'stop') { if (!sw.run) return answer('Le chronomètre n\'est pas lancé.').done; sw.acc += t - sw.start; sw.run = false; FJ.lsSet('fond-jarvis:chrono', sw); return answer('Chronomètre arrêté à ' + dur(sw.acc) + '.').done; }
    if (p.cmd === 'reset') { FJ.lsSet('fond-jarvis:chrono', null); return answer(ack('Chronomètre remis à zéro.')).done; }
    return answer(sw.run || sw.acc ? 'Le chronomètre indique ' + dur(sw.acc + (sw.run ? t - sw.start : 0)) + '.' : 'Le chronomètre n\'est pas lancé.').done;
  };
  H.reminder = function (p) {
    var text = p.text, at = p.at, step = Promise.resolve();
    if (!text) step = step.then(function () { return ask('Que dois-je vous rappeler ?', 'text').then(function (x) { text = x; }); });
    if (!at) step = step.then(function () { if (text) return ask('Pour quand ?', 'when').then(function (w) { at = w && w.at; }); });
    return step.then(function () {
      if (!text || !at) return answer('Rappel annulé.').done;
      addAlarm({ kind: 'reminder', at: at, text: text });
      return answer({ say: ack('Je vous rappellerai ' + (at - now() < 2 * HOUR ? 'dans ' + dur(Math.round((at - now()) / MIN) * MIN) : dayName(at) + ' à ' + hmSay(at)) + ' : ' + text + '.'), show: 'Rappel ' + dayName(at) + ' à ' + hm(at) + ' : ' + text + ' (tant que le fond d\'écran tourne).' }).done;
    });
  };
  H.reminder_list = function () {
    var l = AL.filter(function (o) { return o.kind === 'reminder'; }).sort(function (a, b) { return a.at - b.at; });
    if (!l.length) return answer('Aucun rappel programmé.').done;
    return answer({ say: l.length + ' rappel' + (l.length > 1 ? 's' : '') + ' : ' + l.slice(0, 5).map(function (o) { return dayName(o.at) + ' à ' + hmSay(o.at) + ', ' + o.text; }).join(' ; ') + '.', html: '<div class="k">Rappels</div><ul>' + l.map(function (o) { return '<li>' + esc(dayName(o.at) + ' ' + hm(o.at) + ' — ' + o.text) + '</li>'; }).join('') + '</ul>' }).done;
  };
  H.reminder_cancel = function () {
    var l = AL.filter(function (o) { return o.kind === 'reminder'; });
    if (!l.length) return answer('Aucun rappel à supprimer.').done;
    return ask('Supprimer ' + (l.length > 1 ? 'les ' + l.length + ' rappels' : 'le rappel « ' + l[0].text + ' »') + ' ?', 'yesno', { danger: true, yes: 'Supprimer' }).then(function (ok) { if (!ok) return answer('Je les garde.').done; l.forEach(removeAlarm); return answer(ack('Supprimé.')).done; });
  };
  H.alarm = function () {
    var c = answer({ say: 'Un réveil doit sonner même ordinateur en veille : utilisez l\'appli Horloge de Windows. Je peux l\'ouvrir.', html: '<p style="margin:0">Un réveil doit sonner même quand le fond est arrêté : utilisez l\'appli <b>Horloge</b> de Windows. Pour un délai court, dites plutôt « minuteur de 10 minutes ».</p><div class="row"><button type="button" class="btn pri" data-ck>Ouvrir l\'Horloge</button></div>' });
    c.querySelector('[data-ck]').onclick = function () { FJ.open('ms-clock:'); };
    return c.done;
  };

  /* --- Météo, vent, soleil --- */
  function wxFail(e) {
    if (e && e.city) return answer('Je ne trouve pas la ville « ' + e.city + ' ».').done;
    if (/position/.test(e && e.message)) { var c = answer({ say: 'Je ne connais pas votre position : choisissez une ville dans les réglages du fond.', html: '<p style="margin:0">Je ne connais pas votre position.</p><div class="row"><button type="button" class="btn" data-set>Choisir une ville</button></div>' }); c.querySelector('[data-set]').onclick = function () { FJ.settings('meteo'); }; return c.done; }
    return answer({ say: navigator.onLine === false ? 'Je n\'ai pas accès à internet : la météo n\'est pas disponible.' : 'Le service météo ne répond pas pour le moment.', cls: 'err' }).done;
  }
  function wxFor(city) {
    if (!city) return FJ.weather().then(function (w) { return { d: w.data, where: w.where ? 'à ' + w.where : 'chez vous' }; });
    return FJ.geocode(city).then(function (pl) {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pl.lat + '&longitude=' + pl.lon + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,is_day&hourly=precipitation_probability,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset&timezone=auto&forecast_days=7&wind_speed_unit=kmh';
      return FJ.http(url).then(function (t) { var d = FJ.J(t, null); if (!d || !d.daily) throw new Error('météo illisible'); return { d: d, where: 'à ' + pl.name }; });
    });
  }
  function dIdx(p) { return p.when === 'tomorrow' ? 1 : p.when === 'day' ? (p.offset || 0) : 0; }
  H.weather = function (p) {
    setState('Météo');
    return wxFor(p.city).then(function (w) {
      var d = w.d, c = d.current, lim = +S.windLimit || 45;
      if (p.when === 'week') {
        var items = d.daily.time.slice(0, 6).map(function (t, i) { return { day: new Date(t + 'T12:00'), c: FJ.WMO[d.daily.weather_code[i]] || '', mn: d.daily.temperature_2m_min[i], mx: d.daily.temperature_2m_max[i] }; });
        return answer({ say: 'Les prochains jours ' + w.where + ' : ' + items.slice(0, 5).map(function (x) { return JOURS[x.day.getDay()] + ', ' + x.c + ', ' + Math.round(x.mn) + ' à ' + Math.round(x.mx) + ' degrés'; }).join(' ; ') + '.', k: 'Météo ' + w.where }).done;
      }
      if (p.when === 'now' && !p.focus) {
        var s1 = 'Il fait ' + Math.round(c.temperature_2m) + ' degrés ' + w.where + ', ' + (FJ.WMO[c.weather_code] || '') + '. Vent ' + Math.round(c.wind_speed_10m) + ' km/h, rafales ' + Math.round(c.wind_gusts_10m) + ' km/h.' + (c.wind_gusts_10m >= lim ? ' Vent fort, prudence.' : '');
        return answer({ say: s1, html: '<div class="k">Maintenant ' + esc(w.where) + '</div><div class="big">' + Math.round(c.temperature_2m) + ' °C</div><p style="margin:0">' + esc(cap(FJ.WMO[c.weather_code] || '')) + ' · ressenti ' + Math.round(c.apparent_temperature) + ' °C</p><p style="margin:0"' + (c.wind_gusts_10m >= lim ? ' class="warn"' : '') + '>Vent ' + Math.round(c.wind_speed_10m) + ' km/h, rafales ' + Math.round(c.wind_gusts_10m) + ' km/h</p>' }).done;
      }
      var i = Math.min(d.daily.time.length - 1, dIdx(p)), lab = i === 0 ? 'Aujourd\'hui' : i === 1 ? 'Demain' : cap(dayName(new Date(d.daily.time[i] + 'T12:00').getTime()));
      var code = FJ.WMO[d.daily.weather_code[i]] || '', mn = Math.round(d.daily.temperature_2m_min[i]), mx = Math.round(d.daily.temperature_2m_max[i]), pp = d.daily.precipitation_probability_max[i], ps = d.daily.precipitation_sum[i], gm = d.daily.wind_gusts_10m_max[i];
      if (p.focus === 'rain' || p.focus === 'snow') return answer((pp >= 50 || ps >= 1 ? 'Oui, ' + (p.focus === 'snow' && /neige/.test(code) ? 'de la neige' : 'de la pluie') + ' est probable ' + lab.toLowerCase() + ' ' + w.where + ' (' + pp + ' %).' : 'Non, pas de pluie significative prévue ' + lab.toLowerCase() + ' ' + w.where + ' (' + pp + ' % de risque).')).done;
      if (p.focus === 'temp') return answer(lab + ' ' + w.where + ' : de ' + mn + ' à ' + mx + ' degrés' + (i === 0 ? ', ' + Math.round(c.temperature_2m) + ' en ce moment' : '') + '.').done;
      var warn = gm >= lim;
      return answer({ say: lab + ' ' + w.where + ' : ' + code + ', de ' + mn + ' à ' + mx + ' degrés, risque de pluie ' + pp + ' %. ' + (warn ? 'Vent fort, prudence : rafales jusqu\'à ' + Math.round(gm) + ' km/h, au-dessus de votre seuil de ' + lim + '.' : 'Rafales jusqu\'à ' + Math.round(gm) + ' km/h.'), html: '<div class="k">' + esc(lab + ' ' + w.where) + '</div><div class="big">' + mn + '° / ' + mx + '°</div><p style="margin:0">' + esc(cap(code)) + ' · pluie ' + pp + ' % (' + num(ps, 1) + ' mm)</p><p style="margin:0"' + (warn ? ' class="warn"' : '') + '>Rafales jusqu\'à ' + Math.round(gm) + ' km/h (seuil ' + lim + ')</p>', cls: warn ? 'warn' : '' }).done;
    }, wxFail);
  };
  H.wind = function (p) {
    return wxFor(p.city).then(function (w) {
      var d = w.d, i = Math.min(d.daily.time.length - 1, dIdx(p)), day = d.daily.time[i], lim = +S.windLimit || 45;
      var hrs = []; (d.hourly.time || []).forEach(function (t, k) { if (t.slice(0, 10) === day) { var hh = new Date(t).getHours(); if (hh >= 6 && hh <= 20 && (i > 0 || new Date(t).getTime() >= now() - HOUR)) hrs.push(k); } });
      var gmax = 0, gAt = null, smax = 0;
      hrs.forEach(function (k) { var g = d.hourly.wind_gusts_10m[k]; if (g > gmax) { gmax = g; gAt = new Date(d.hourly.time[k]).getTime(); } smax = Math.max(smax, d.hourly.wind_speed_10m[k]); });
      if (!hrs.length) { gmax = d.daily.wind_gusts_10m_max[i]; smax = d.daily.wind_speed_10m_max[i]; }
      var over = hrs.filter(function (k) { return d.hourly.wind_gusts_10m[k] >= lim; }).map(function (k) { return new Date(d.hourly.time[k]).getHours(); });
      var lab = i === 0 ? 'aujourd\'hui' : i === 1 ? 'demain' : dayName(new Date(day + 'T12:00').getTime());
      var s = (i === 0 ? 'En ce moment ' + w.where + ', vent ' + Math.round(d.current.wind_speed_10m) + ' km/h, rafales ' + Math.round(d.current.wind_gusts_10m) + ' km/h. ' : '') + cap(lab) + ' en journée : vent moyen jusqu\'à ' + Math.round(smax) + ' km/h, rafales jusqu\'à ' + Math.round(gmax) + ' km/h' + (gAt ? ' vers ' + hmSay(gAt) : '') + '. ';
      s += over.length ? 'Vent fort, prudence : rafales au-dessus de votre seuil de ' + lim + ' km/h entre ' + over[0] + ' heures et ' + (over[over.length - 1] + 1) + ' heures.' + (p.scaffold ? ' Le montage d\'échafaudage est à éviter sur ce créneau.' : '') : 'Pas d\'alerte vent (seuil ' + lim + ' km/h).';
      return answer({ say: s, k: 'Vent · ' + lab, cls: over.length ? 'warn' : '' }).done;
    }, wxFail);
  };
  H.vigilance = function () { return openLink('https://vigilance.meteofrance.fr/', 'la vigilance de Météo-France', 'J\'ouvre la carte de vigilance de Météo-France.'); };
  H.sun = function (p) {
    return wxFor('').then(function (w) { var t = w.d.daily[p.what === 'rise' ? 'sunrise' : 'sunset'][0]; return answer('Le soleil se ' + (p.what === 'rise' ? 'lève' : 'couche') + ' à ' + hmSay(new Date(t).getTime()) + ' ' + w.where + '.').done; }, wxFail);
  };

  /* --- Titres --- */
  H.news = function (p) {
    var rub = p.rub || 'titres';
    var load = rub === 'titres' ? FJ.loadNews().then(function () { return FJ.news.items; }, function () { if (FJ.news.items.length) return FJ.news.items; throw new Error('titres'); })
      : FJ.http('https://www.franceinfo.fr/' + rub + '.rss').then(function (xml) { var dd = new DOMParser().parseFromString(xml, 'application/xml'), its = dd.getElementsByTagName('item'), out = []; for (var i = 0; i < its.length && out.length < 10; i++) { var t = its[i].getElementsByTagName('title')[0], l = its[i].getElementsByTagName('link')[0]; if (t) out.push({ t: t.textContent.trim(), l: l ? l.textContent.trim() : '' }); } return out; });
    return load.then(function (items) {
      var out = items.slice(0, p.n || 5), ord = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Dix'];
      if (!out.length) throw new Error('vide');
      var c = answer({ say: 'Voici les titres de franceinfo. ' + out.map(function (x, i) { return ord[i] + ' : ' + x.t; }).join('. ') + '.', html: '<div class="k">franceinfo · titres</div><ul>' + out.map(function (x, i) { return '<li><a href="#" data-i="' + i + '" style="color:inherit">' + esc(x.t) + '</a></li>'; }).join('') + '</ul>' });
      c.querySelectorAll('[data-i]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); FJ.open(out[+a.dataset.i].l || 'https://www.franceinfo.fr/'); }; });
      return c.done;
    }).catch(function () { return answer({ say: navigator.onLine === false ? 'Je n\'ai pas accès à internet pour lire les titres.' : 'Les titres ne sont pas disponibles pour le moment.', cls: 'err' }).done; });
  };

  /* --- Agenda --- */
  function evLine(e, sayIt) { return e.all ? (sayIt ? 'toute la journée, ' : 'Journée — ') + (e.t || 'Sans titre') : (sayIt ? 'à ' + hmSay(e.b) + ', ' : hm(e.b) + ' — ') + (e.t || 'Sans titre') + (e.l && !sayIt ? ' (' + e.l + ')' : ''); }
  H.agenda = function (p) {
    if (!FJ.ag.has) {
      var c0 = answer({ say: FJ.mode === 'suite' ? 'L\'agenda de la Suite est vide sur ce navigateur, et aucun fichier n\'est importé.' : 'Je n\'ai pas d\'agenda ici : importez un fichier .ics dans les réglages du fond.', html: '<p style="margin:0">Aucun agenda disponible ici.</p><div class="row"><button type="button" class="btn" data-ag>Importer un .ics</button></div>' });
      c0.querySelector('[data-ag]').onclick = function () { FJ.settings('agenda'); };
      return c0.done;
    }
    if (p.next) {
      var l0 = FJ.agendaBetween(now(), now() + 60 * DAY).filter(function (e) { return e.e > now() && !e.all; });
      if (!l0.length) return answer('Aucun rendez-vous dans les deux prochains mois.').done;
      var e0 = l0[0]; return answer('Votre prochain rendez-vous : ' + dayName(e0.b) + ' à ' + hmSay(e0.b) + ', ' + (e0.t || 'sans titre') + (e0.l ? ', ' + e0.l : '') + '.').done;
    }
    var from = p.from != null ? p.from : NLU.startOfDay(now()), to = p.to != null ? p.to : from + DAY;
    var l = FJ.agendaBetween(from, to).filter(function (e) { return e.e > from || e.all; });
    var span = (to - from) > DAY + HOUR, lab = span ? 'cette période' : dayName(from);
    if (!l.length) return answer(p.free ? 'Oui, rien n\'est prévu ' + lab + '.' : 'Rien de prévu ' + lab + '.').done;
    return answer({ say: (p.free ? 'Non, ' : '') + cap(lab) + ', ' + l.length + ' rendez-vous : ' + l.slice(0, 8).map(function (e) { return (span ? dayName(e.b) + ' ' : '') + evLine(e, true); }).join(' ; ') + '.', html: '<div class="k">Agenda · ' + esc(lab) + '</div><ul>' + l.map(function (e) { return '<li>' + esc((span ? dayName(e.b) + ' · ' : '') + evLine(e)) + '</li>'; }).join('') + '</ul>' }).done;
  };
  H.agenda_add = function () {
    var c = answer({ say: 'Pour ajouter un rendez-vous, ouvrez l\'appli Agenda de la Suite. Le fond d\'écran l\'affichera ensuite.', html: '<p style="margin:0">Pour ajouter un rendez-vous, ouvrez <b>Agenda</b> (ou Majordome). Le fond l\'affichera ensuite' + (FJ.mode === 'suite' ? '' : ' après un export .ics') + '.</p><div class="row"><button type="button" class="btn" data-ag>Ouvrir Agenda</button></div>' });
    c.querySelector('[data-ag]').onclick = function () { FJ.open(FJ.suiteUrl('agenda')); };
    return c.done;
  };

  /* --- Notes et listes : celles de Majordome (même clé ; partagées dans la Suite, même navigateur) --- */
  var LKEY = 'majordome:listes';
  function LS() { var o = FJ.lsGet(LKEY, null) || {}; if (!o.lists) o.lists = {}; if (!o.notes) o.notes = []; return o; }
  function saveLS(o) { FJ.lsSet(LKEY, o); }
  function listKey(n) { return deacc(n || 'courses').replace(/^(de |des |du |d )/, '').replace(/s$/, '') || 'course'; }
  function listName(k) { return k === 'course' ? 'courses' : k; }
  H.note_add = function (p) {
    var go = function (x) { if (!x) return answer('Rien n\'a été noté.').done; var o = LS(); o.notes.unshift({ id: uid(), t: x, at: now() }); saveLS(o); return answer({ say: ack('Noté.'), show: 'Note : ' + x }).done; };
    if (!p.text) return ask('Que dois-je noter ?', 'text').then(go);
    return go(p.text);
  };
  H.notes_read = function () {
    var o = LS(); if (!o.notes.length) return answer('Vous n\'avez aucune note.').done;
    return answer({ say: o.notes.length + ' note' + (o.notes.length > 1 ? 's' : '') + '. ' + o.notes.slice(0, 5).map(function (n) { return n.t; }).join('. ') + '.', html: '<div class="k">Notes</div><ul>' + o.notes.slice(0, 12).map(function (n) { return '<li>' + esc(n.t) + '</li>'; }).join('') + '</ul>' }).done;
  };
  H.list_add = function (p) {
    var o = LS(), k = listKey(p.list), l = o.lists[k] || (o.lists[k] = []), added = [];
    (p.items || []).forEach(function (it) { if (!l.some(function (x) { return deacc(x.t) === deacc(it) && !x.done; })) { l.push({ id: uid(), t: it, done: false, at: now() }); added.push(it); } });
    saveLS(o);
    if (!added.length) return answer('C\'est déjà sur la liste ' + listName(k) + '.').done;
    return answer({ say: ack(added.join(', ') + ' ajouté' + (added.length > 1 ? 's' : '') + ' à la liste ' + listName(k) + '.'), show: 'Liste ' + listName(k) + ' : + ' + added.join(', ') }).done;
  };
  H.list_read = function (p) {
    var k = listKey(p.list), l = (LS().lists[k] || []).filter(function (x) { return !x.done; });
    if (!l.length) return answer('La liste ' + listName(k) + ' est vide.').done;
    return answer({ say: 'Liste ' + listName(k) + ', ' + l.length + ' élément' + (l.length > 1 ? 's' : '') + ' : ' + l.map(function (x) { return x.t; }).join(', ') + '.', html: '<div class="k">Liste ' + esc(listName(k)) + '</div><ul>' + l.map(function (x) { return '<li>' + esc(x.t) + '</li>'; }).join('') + '</ul>' }).done;
  };
  H.list_remove = function (p) {
    var o = LS(), k = listKey(p.list), l = o.lists[k] || [], it = l.filter(function (x) { return deacc(x.t).indexOf(deacc(p.item)) >= 0 || deacc(p.item).indexOf(deacc(x.t)) >= 0; })[0];
    if (!it) return answer('« ' + p.item + ' » n\'est pas sur la liste ' + listName(k) + '.').done;
    return ask('Retirer « ' + it.t + ' » de la liste ' + listName(k) + ' ?', 'yesno', { danger: true, yes: 'Retirer' }).then(function (ok) { if (!ok) return answer('Je le laisse.').done; var o2 = LS(); o2.lists[k] = (o2.lists[k] || []).filter(function (x) { return x.id !== it.id; }); saveLS(o2); return answer(ack('Retiré.')).done; });
  };
  H.list_clear = function (p) {
    var k = listKey(p.list), l = LS().lists[k] || [];
    if (!l.length) return answer('La liste ' + listName(k) + ' est déjà vide.').done;
    return ask('Vider la liste ' + listName(k) + ' (' + l.length + ' élément' + (l.length > 1 ? 's' : '') + ') ?', 'yesno', { danger: true, yes: 'Vider' }).then(function (ok) { if (!ok) return answer('Je garde la liste.').done; var o = LS(); o.lists[k] = []; saveLS(o); return answer(ack('Liste vidée.')).done; });
  };

  /* --- Applis de la Suite, sites, réglages de Windows --- */
  var PHONE_ONLY = { photo: 'l\'appareil photo', reseau: 'Réseau', reveil: 'Aube', urgence: 'Urgence', mesure: 'Mesure', sauvegarde: 'Sauvegarde', accueil: 'Socle', echafaudage: 'Échafaudage' };
  var PCID = { fonds: 'toile' };
  H.open_app = function (p) {
    if (p.choices) return answer('Plusieurs applis correspondent : précisez son nom.').done;
    if (p.unknown) {
      if (p.known && p.known.web) return openLink(p.known.web, p.known.name + ' (site web)', ack(p.known.name + ' est une appli : j\'ouvre son site.'));
      return answer('Je ne connais pas l\'appli « ' + p.unknown + ' ». Une page web ne peut pas lancer un programme de Windows : ajoutez plutôt un raccourci vers son site, ou un protocole, dans les réglages du fond.').done;
    }
    if (p.pkg && !/^fr\.magformation13\./.test(p.pkg)) return answer('« ' + (p.name || p.pkg) + ' » est une appli du téléphone.').done;
    var id = PCID[p.id] || p.id;
    if (PHONE_ONLY[id]) {
      if (id === 'reveil') return H.alarm();
      return answer(cap(PHONE_ONLY[id]) + ' n\'existe que sur le téléphone.').done;
    }
    var nm = FJ.suiteName(id);
    if (!nm) return answer('Cette appli n\'est pas dans la Suite MAG sur PC.').done;
    return openLink(FJ.suiteUrl(id), nm);
  };
  H.website = function (p) {
    if (p.unknown) return answer('Je ne connais pas le site « ' + p.unknown + ' ». Je n\'ouvre que les sites de ma liste, pour votre sécurité ; ajoutez-le aux raccourcis si besoin.').done;
    return openLink(p.url, p.name);
  };
  var SETW = { wifi: 'network-wifi', bluetooth: 'bluetooth', battery: 'batterysaver', display: 'display', sound: 'sound', apps: 'appsfeatures', location: 'privacy-location', storage: 'storagesense', security: 'windowsdefender', a11y: 'easeofaccess', date: 'dateandtime', lang: 'regionlanguage', network: 'network-status', airplane: 'network-airplanemode' };
  H.open_sys = function (p) {
    var w = p.what;
    if (w === 'settings') { var sub = SETW[p.sub] || ''; return openLink('ms-settings:' + sub, p.name || 'les paramètres'); }
    if (w === 'email') return openLink('mailto:', 'la messagerie');
    if (w === 'clock') return openLink('ms-clock:', 'l\'Horloge de Windows');
    if (w === 'calculator') return openLink('calculator:', 'la calculatrice de Windows');
    if (w === 'gallery') return openLink('ms-photos:', 'Photos');
    if (w === 'store') return openLink('ms-windows-store://home', 'le Microsoft Store');
    if (w === 'calendar') return openLink(FJ.suiteUrl('agenda'), 'Agenda');
    if (w === 'contacts') return openLink(FJ.suiteUrl('contacts'), 'Contacts');
    if (w === 'browser') return answer('Le navigateur est déjà là : demandez un site, par exemple « ouvre YouTube ».').done;
    return answer('C\'est une fonction du téléphone.').done;
  };
  H.settings = function (p) { if (p.panel === 'voix') FJ.settings('voix'); else FJ.settings(); return answer(ack()).done; };
  H.voice = function (p) {
    if (p.rate) { S.rate = Math.max(0.6, Math.min(1.6, (+S.rate || 1) + p.rate * 0.15)); FJ.save(); return answer(ack('Comme ceci ?')).done; }
    return answer('Le volume et la hauteur de la voix se règlent dans Windows et dans les réglages du fond.').done;
  };
  H.volume = function () { var c = answer({ say: 'Une page web ne règle pas le volume de Windows. J\'ouvre les paramètres du son si vous voulez.', html: '<p style="margin:0">Une page web ne règle pas le volume de Windows.</p><div class="row"><button type="button" class="btn" data-snd>Paramètres du son</button></div>' }); c.querySelector('[data-snd]').onclick = function () { FJ.open('ms-settings:sound'); }; return c.done; };
  H.wifi = function () { return openLink('ms-settings:network-wifi', 'les paramètres Wi-Fi'); };
  H.bluetooth = function () { return openLink('ms-settings:bluetooth', 'les paramètres Bluetooth'); };
  H.battery = function () {
    var b = FJ.bat;
    if (!b.on) return answer('Je ne vois pas de batterie : cet ordinateur est sans doute branché sur secteur en permanence.').done;
    return answer('Batterie à ' + Math.round(b.level * 100) + ' %' + (b.charging ? ', en charge.' : ', sur batterie.')).done;
  };
  H.fullscreen = function () { return answer('Le fond d\'écran occupe déjà tout l\'écran.').done; };
  var mediaCh = null; try { mediaCh = root.BroadcastChannel ? new BroadcastChannel('mag-media') : null; } catch (e) { }
  H.music = function (p) {
    var cmd = p.cmd === 'start' ? 'play' : p.cmd, lab = { play: 'Lecture.', pause: 'Pause.', next: 'Morceau suivant.', prev: 'Morceau précédent.' }[cmd] || 'Musique.';
    return new Promise(function (res) {
      if (!mediaCh) return res(false);
      var done = false, h = function (e) { if (e.data && e.data.ack === cmd) { done = true; mediaCh.removeEventListener('message', h); res(true); } };
      mediaCh.addEventListener('message', h); mediaCh.postMessage({ cmd: cmd });
      setTimeout(function () { if (!done) { mediaCh.removeEventListener('message', h); res(false); } }, 700);
    }).then(function (ok) {
      if (ok) return answer(lab).done;
      if (p.cmd === 'start') return openLink(FJ.suiteUrl('musique'), 'Mélodie');
      return answer('Je ne pilote que Mélodie, quand elle est ouverte dans le même navigateur. Pour les autres lecteurs, utilisez les touches multimédia du clavier.').done;
    });
  };
  /* Livres audio : la fenêtre Liseuse de la Suite (même navigateur) reçoit la commande par le canal « mag-liseuse » */
  var lisCh = null; try { lisCh = root.BroadcastChannel ? new BroadcastChannel('mag-liseuse') : null; } catch (e) { }
  H.book = function (p) {
    var arg = { audio: p.cmd, title: p.title || '', min: p.ms ? Math.round(p.ms / 60000) : 0, chap: !!p.chap, id: 'fj' + Date.now().toString(36) };
    return new Promise(function (res) {
      if (!lisCh) return res(null);
      var done = false, h = function (e) { if (e.data && e.data.ack === arg.id) { done = true; lisCh.removeEventListener('message', h); res(e.data.ok !== false); } };
      lisCh.addEventListener('message', h); lisCh.postMessage(arg);
      setTimeout(function () { if (!done) { lisCh.removeEventListener('message', h); res(null); } }, 900);
    }).then(function (ok) {
      if (ok) return answer({ pause: 'Lecture en pause.', stop: 'Lecture arrêtée.', nextch: 'Chapitre suivant.', prevch: 'Chapitre précédent.', sleep: 'Minuterie de lecture réglée.' }[p.cmd] || 'Je lis.').done;
      if (ok === false) return answer(p.title ? 'Je ne trouve pas « ' + p.title + ' » dans Liseuse.' : 'Aucune lecture en cours dans Liseuse.').done;
      if (/^(read|resume)$/.test(p.cmd)) return openLink(FJ.suiteUrl('liseuse'), 'Liseuse');
      return answer('Liseuse n\'est pas ouverte dans ce navigateur.').done;
    });
  };
  H.routine = function (p) {
    if (p.id === 'matin') {
      var h = new Date().getHours();
      return answer(withSir(h < 18 ? 'Bonjour' : 'Bonsoir') + '.').done.then(function () { return H.time(); }).then(function () { return H.weather({ when: 'today' }); }).then(function () { return H.news({ n: 3 }); });
    }
    if (p.id === 'nuit') return answer(withSir('Bonne nuit') + '.').done;
    return answer('Les routines se règlent dans Majordome.').done;
  };
  H.listen_on = function () { if (FJ.mode !== 'suite') return answer('Le mot de réveil n\'est pas disponible dans Lively : pas d\'accès au micro.').done; FJ.settings('voix'); return answer('Activez le mot de réveil dans les réglages, onglet Voix. Il est désactivé par défaut, car le micro resterait ouvert en permanence.').done; };
  H.listen_off = function () { if (S.wake) { S.wake = false; FJ.save(); applyWake(); } return answer(ack('Je n\'écoute plus en continu.')).done; };

  /* ---------------- Entrée vocale ---------------- */
  var B = null, listening = false, loadingB = null;
  function bridge() {
    if (B) return Promise.resolve(B);
    if (FJ.mode !== 'suite' || !root.MAGPC) return Promise.resolve(null);
    if (!loadingB) loadingB = root.MAGPC.loadScript('../shared/apps/majordome.js').then(function () { B = root.MAGMajordome || null; return B; }, function () { loadingB = null; return null; });
    return loadingB;
  }
  root.Majordome = { toggle: function () { activate(); } };   // Ctrl+Espace du pont de Majordome PC
  root.majordomeEvent = function (type, json) {
    var d = FJ.J(json, {}) || {};
    switch (type) {
      case 'level': if (listening && FJ.orb) FJ.orb.level(d.v, d.b); break;
      case 'partial': if (listening && d.text) $('q').placeholder = d.text; break;
      case 'result': stopUi(); if (d.text) handle(d.text, 'voice'); else setState('En ligne'); break;
      case 'end': stopUi(); setState('En ligne'); break;
      case 'error': stopUi(); answer({ say: d.msg || 'Erreur de reconnaissance.', cls: 'err' }); break;
      case 'wake': if (!listening) { if (FJ.orb) FJ.orb.pulse(); listen(); } break;
      case 'model': break;
    }
  };
  function stopUi() { listening = false; $('mic').classList.remove('on'); if (FJ.orb) { FJ.orb.level(0); if (FJ.orb.get() === 'listen') FJ.orb.state('idle'); } $('q').placeholder = 'Demandez à ' + FJ.aiName() + '…  (Ctrl+Espace)'; }
  function engineOk(b) { var info = FJ.J(b.sttInfo ? b.sttInfo() : '{}', {}) || {}; var m = FJ.lsGet('majordome:reglages', {}) || {}; return info.model && info.model.state === 'ready' ? 'vosk' : (m.engine === 'web' && m.webOk && info.web) ? 'web' : ''; }
  function listen() {
    return bridge().then(function (b) {
      if (!b) return voiceElsewhere();
      var eng = engineOk(b);
      if (!eng) {
        var c = answer({ say: 'Le modèle vocal n\'est pas installé. Installez-le une fois dans Majordome : il servira aussi ici.', html: '<p style="margin:0">Le modèle vocal hors ligne (41 Mo) n\'est pas encore installé dans ce navigateur. Installez-le une fois dans <b>Majordome › Réglages</b> : il servira aussi ici. En attendant, tapez votre commande.</p><div class="row"><button type="button" class="btn pri" data-mj>Ouvrir Majordome</button></div>' });
        c.querySelector('[data-mj]').onclick = function () { FJ.open(FJ.suiteUrl('majordome')); };
        return;
      }
      shush(); listening = true; $('mic').classList.add('on'); setState('J\'écoute'); if (FJ.orb) FJ.orb.state('listen');
      $('q').placeholder = 'J\'écoute…';
      b.listen(JSON.stringify({ engine: eng, maxMs: 9000 }));
    });
  }
  function voiceElsewhere() {
    var c = answer({ say: 'Dans le fond d\'écran, je vous lis au clavier. Pour me parler, ouvrez Majordome.', html: '<p style="margin:0">Ici, le fond d\'écran n\'a pas accès au micro : tapez votre commande ci-dessous (<b>Ctrl+Espace</b>). Pour parler, ouvrez <b>Majordome</b> : il écoute hors ligne.</p><div class="row"><button type="button" class="btn pri" data-mj>Ouvrir Majordome</button></div>' });
    c.querySelector('[data-mj]').onclick = function () { FJ.open(FJ.suiteUrl('majordome')); };
    $('q').focus();
    return c.done;
  }
  function applyWake() {
    if (FJ.mode !== 'suite') return;
    if (!S.wake) { if (B && B.wake) B.wake(JSON.stringify({ on: false })); return; }
    bridge().then(function (b) { if (b && b.wake && engineOk(b) === 'vosk') b.wake(JSON.stringify({ on: true, words: names() })); else if (b) FJ.toast('Mot de réveil : installez d\'abord le modèle vocal dans Majordome'); });
  }
  /** Clic sur la sphère, Ctrl+Espace : saisie (et écoute dans la Suite si le modèle vocal est installé) */
  function activate(fromMic) {
    if (listening) { if (B) B.stop(); stopUi(); return; }
    $('q').focus(); showSay();
    if (!say.children.length) answer({ show: withSir('Je vous écoute') + '. Tapez votre demande' + (FJ.mode === 'suite' ? ' ou cliquez le micro.' : '.') });
    if (FJ.orb) FJ.orb.pulse();
    if (fromMic) listen();
  }

  /* ---------------- Câblage ---------------- */
  $('mic').innerHTML = FJI.svg('micro'); $('go').innerHTML = FJI.svg('envoyer');
  $('bar').addEventListener('submit', function (e) { e.preventDefault(); var v = $('q').value; $('q').value = ''; handle(v, 'text'); });
  $('mic').onclick = function () { if (listening) { if (B) B.stop(); stopUi(); return; } activate(true); };
  $('orbHit').onclick = function () { activate(FJ.mode === 'suite' && !!B && engineOk(B) === 'vosk'); };
  $('q').addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('q').value = ''; $('q').blur(); dismiss(); } });
  say.addEventListener('mouseenter', function () { clearTimeout(hideT); });
  say.addEventListener('mouseleave', autoHide);
  if (AL.length) setTimeout(tick, 1500);
  if (S.wake && FJ.mode === 'suite') setTimeout(applyWake, 4000);

  FJ.jarvis = { handle: handle, answer: answer, say: function (t) { return answer(t).done; }, preview: preview, activate: activate, dismiss: dismiss, applyWake: applyWake, timers: function () { return AL.slice(); }, H: H };
})(window);
