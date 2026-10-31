/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-app.js : ne pas modifier ici. */
/* =====================================================================
   Majordome : assistant vocal à commandes (sans IA de conversation).
   Même page pour l'APK (applis/www-majordome) et le PC (pc/majordome, copie).
   Ponts :
     window.MAGMajordome  Android : applis/scripts/MajordomeBridge.java (Vosk, voix,
                          alarmes, téléphone…) ; PC : pc/shared/apps/majordome.js
                          (vosk-browser, Web Speech facultatif, agenda local).
     window.MAGPrint      commun (applis, tuiles Socle, batterie, lampe, contacts…)
     window.MAGAgenda     agenda (AgendaBridge.java / pc/shared/apps/agenda.js)
     window.MAGActualites flux en liste blanche sur Android (ActualitesBridge.java)
   Voix : système (TextToSpeech sur Android, speechSynthesis sur PC) ou Piper hors ligne (mj-voix.js, worker
   mj-voix-worker.js, moteur sherpa-onnx WASM dans piper/, phonétiseur mj-phon.js) avec effet « Jarvis » ;
   repli automatique et silencieux sur la voix du système si Piper ne se charge pas.
   Événements du pont : window.majordomeEvent(type, json).
   Réseau : seulement Open-Meteo (météo, recherche de ville), franceinfo (titres),
   MeteoAlarm (vigilance) et le téléchargement du modèle vocal (et des voix Piper, huggingface.co).
   ===================================================================== */
(function () {
  'use strict';
  var NLU = window.MJNLU;
  var B = window.MAGMajordome || null, P = window.MAGPrint || null, PC = !!window.MAGPC;
  var ANDROID = !!(B && !PC);
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function J(s, d) { try { var v = typeof s === 'string' ? JSON.parse(s) : s; return v == null ? d : v; } catch (e) { return d; } }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function now() { return Date.now(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function deacc(s) { return NLU.deacc(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var KEY = { set: 'majordome:reglages', hist: 'majordome:historique', lists: 'majordome:listes', al: 'majordome:alarmes', wx: 'majordome:meteo', actu: 'majordome:actu', sw: 'majordome:chrono' };

  /* ---------------- Réglages (stockés localement seulement) ---------------- */
  var DEF = {
    name: 'Majordome', wake: '', address: 'monsieur', prenom: '', voice: '', rate: 1, pitch: 1, volume: 1, voiceOn: true, beeps: true,
    tts: 'system', piperVoice: 'pierre', fx: 'majordome', fxo: null,
    engine: ANDROID ? 'vosk' : 'vosk', webOk: false, wakeOn: false, wakeCharging: false, autoListen: true,
    place: null, gps: true, windLimit: 45, history: true, newsN: 5,
    routines: [
      { id: 'matin', name: 'Bonjour', phrase: 'bonjour', steps: ['salut', 'heure', 'meteo', 'agenda', 'vent', 'titres'] },
      { id: 'nuit', name: 'Bonne nuit', phrase: 'bonne nuit', steps: ['bonnenuit', 'reveil', 'ecoute_off'] }
    ]
  };
  var S = Object.assign({}, DEF, lsGet(KEY.set, {}));
  if (!Array.isArray(S.routines) || !S.routines.length) S.routines = DEF.routines;
  function saveS() { lsSet(KEY.set, S); if (typeof publish === 'function') publish(); }
  function wakeWords() {
    var w = [deacc(S.name || 'Majordome')];
    String(S.wake || '').split(/[,;]/).forEach(function (x) { x = deacc(x); if (x && w.indexOf(x) < 0) w.push(x); });
    return w.filter(Boolean);
  }
  function sir() { return S.address === 'monsieur' ? 'Monsieur' : S.address === 'madame' ? 'Madame' : S.address === 'prenom' ? (S.prenom || '') : ''; }
  function withSir(s) { var x = sir(); return x ? s.replace(/([.!?])?$/, ', ' + x + '$1') : s; }
  var ACKS = ['Bien', 'Entendu', 'Très bien', 'C\'est noté'];
  function ack(extra) { var a = ACKS[Math.floor(Math.random() * ACKS.length)], x = sir(); return a + (x ? ', ' + x : '') + '.' + (extra ? ' ' + extra : ''); }

  /* ---------------- Interface ---------------- */
  // la sphère déborde de sa boîte (halo, gonflement au son) ; l'anneau gradué suit légèrement le niveau
  var orbBox = $('orbBox'), lvShown = -1;
  var orb = window.MJOrb.create($('orb'), { pad: 1.32, onLevel: function (v) { v = Math.round(v * 50) / 50; if (v !== lvShown) { lvShown = v; orbBox.style.setProperty('--lv', v); } } });
  var ticks = '';
  for (var ti = 0; ti < 60; ti++) { var an = ti / 60 * Math.PI * 2, r1 = ti % 5 ? 47 : 45.5; ticks += '<line class="tick" x1="' + (50 + Math.cos(an) * r1).toFixed(2) + '" y1="' + (50 + Math.sin(an) * r1).toFixed(2) + '" x2="' + (50 + Math.cos(an) * 49).toFixed(2) + '" y2="' + (50 + Math.sin(an) * 49).toFixed(2) + '"/>'; }
  $('ticks').innerHTML = ticks;
  function status(t, st) { $('status').textContent = t || ''; if (st) orb.state(st); }
  var toastT = 0;
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, 3200); }
  function card(html, cls) {
    var c = document.createElement('div'); c.className = 'card ' + (cls || ''); c.innerHTML = html;
    var box = $('cards'); box.appendChild(c);
    while (box.children.length > 24) box.removeChild(box.firstChild);
    setTimeout(function () { c.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, 30);
    return c;
  }
  function greeting() { var h = new Date(now()).getHours(), x = sir(); return (h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour') + (x ? ' ' + x : ''); }
  function applyName() { $('title').textContent = S.name || 'Majordome'; document.title = S.name || 'Majordome'; $('greet').textContent = greeting(); orbBox.setAttribute('aria-label', 'Parler à ' + (S.name || 'Majordome')); }

  /* ---------------- Sons (bips) ---------------- */
  var AC = null;
  function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === 'suspended') AC.resume().catch(function () { }); return AC; }
  function tone(f, d, when, vol, type) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + (when || 0);
    o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((vol || 0.12) * (S.volume || 1), t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function beep(k) {
    if (!S.beeps && k !== 'alarm') return;
    if (k === 'start') { tone(660, 0.09); tone(990, 0.12, 0.08); }
    else if (k === 'end') { tone(880, 0.08); tone(587, 0.12, 0.07); }
    else if (k === 'error') { tone(300, 0.18, 0, 0.1, 'triangle'); }
    else if (k === 'alarm') { for (var i = 0; i < 4; i++) { tone(1046, 0.12, i * 0.25, 0.2, 'square'); } }
    else if (k === 'ok') tone(1175, 0.08);
  }

  /* ---------------- Voix (synthèse) ---------------- */
  // Piper : APK → piper/ (dans l'appli) et voix dans le stockage privé (MajordomeBridge) ; PC → moteur publié dans applis/www-majordome/piper/, voix dans IndexedDB
  var pipeWait = {};
  var VX = window.MJVoix ? window.MJVoix.create({
    engine: PC ? ((window.MAGPC && MAGPC.conf && MAGPC.conf.piper) || '../../applis/www-majordome/piper/') : 'piper/',
    store: ANDROID && B.piperState ? B : 'idb',   // liste des voix installées : clé commune « mj-voix:installees » (Majordome et Fond Jarvis du même site)
    sink: ANDROID && B.piperPlay ? {
      play: function (id, pcm, sr, dur, started) {
        return new Promise(function (ok) {
          var u8 = new Uint8Array(pcm.buffer), bin = '';
          for (var i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          pipeWait[id] = { ok: ok, started: started };
          setTimeout(function () { if (pipeWait[id]) { delete pipeWait[id]; ok(); } }, dur * 1000 + 4000);   // filet
          try { B.piperPlay(id, btoa(bin), sr); } catch (e) { delete pipeWait[id]; ok(); }
        });
      },
      stop: function () { try { B.piperStop(); } catch (e) { } Object.keys(pipeWait).forEach(function (k) { var w = pipeWait[k]; delete pipeWait[k]; w.ok(); }); }
    } : null,
    onChange: function (ev) { if (curSheet === 'settings' && ev.t === 'android' && ev.d && /^(ready|error|removed)$/.test(ev.d.state)) settingsSheet('voix'); }
  }) : null;
  function piperOn() { return S.tts === 'piper' && VX && VX.usable(S.piperVoice); }
  var lastSaid = '', speakWait = {}, speakChain = Promise.resolve();
  function speechText(s) {
    return String(s || '').replace(/<[^>]+>/g, ' ').replace(/[«»"]/g, '').replace(/\b(\d{1,2}) h (\d{2})\b/g, '$1 heures $2').replace(/\b(\d{1,2}) h\b/g, '$1 heures')
      .replace(/ km\/h/g, ' kilomètres-heure').replace(/°C/g, ' degrés').replace(/%/g, ' pour cent').replace(/€/g, ' euros').replace(/\s+/g, ' ').replace(/ ([.,])/g, '$1').trim();
  }
  function frVoices() {
    if (B && B.voices) return J(B.voices(), []);
    if (!window.speechSynthesis) return [];
    return speechSynthesis.getVoices().filter(function (v) { return /^fr/i.test(v.lang); }).map(function (v) { return { id: v.voiceURI || v.name, name: v.name, lang: v.lang, local: v.localService }; });
  }
  function speak(text) {
    var t = speechText(text);
    lastSaid = text;
    if (!S.voiceOn || !t || MJ.quiet) return Promise.resolve();   // quiet : demande venue de la montre (réponse affichée là-bas)
    speakChain = speakChain.then(function () { return speakNow(t); });
    return speakChain;
  }
  var SPEAKING = 'Je vous réponds';
  function speakNow(t) {
    return new Promise(function (resolve) {
      var done = false, id = uid();
      var fin = function () { if (done) return; done = true; delete speakWait[id]; orb.speak(false); if (orb.get() === 'speak') orb.state(MJ.listening ? 'listen' : 'idle'); if ($('status').textContent === SPEAKING) status(MJ.listening ? 'J\'écoute' : 'Prêt'); if (B && B.hold) try { B.hold(false); } catch (e) { } resolve(); };
      setTimeout(fin, (2500 + t.length * 95) / Math.min(1, S.rate || 1) + (S.tts === 'piper' ? 5000 : 0));   // filet de sécurité
      orb.speak(true, t, S.rate || 1);
      if (!MJ.listening) status(SPEAKING);
      if (B && B.hold) try { B.hold(true); } catch (e) { }
      if (piperOn()) {   // voix Piper ; en cas d'échec avant le premier son : voix du système, sans message
        speakWait[id] = fin; var heard = false;
        VX.speak(t, { voice: S.piperVoice, rate: S.rate, pitch: S.pitch, volume: S.volume, fx: S.fx, fxo: S.fxo }, { onStart: function () { heard = true; }, onLevel: function (v) { orb.voice(v); } })
          .then(fin, function (e) { if (heard || done) return fin(); console.warn('Piper indisponible, voix du système', e && (e.message || e.msg)); delete speakWait[id]; system(); });
        return;
      }
      system();
      function system() {
      if (B && B.say) { speakWait[id] = fin; try { B.say(t, JSON.stringify({ voice: S.voice, rate: S.rate, pitch: S.pitch, volume: S.volume, id: id })); } catch (e) { fin(); } return; }
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { fin(); return; }
      var u = new SpeechSynthesisUtterance(t); u.lang = 'fr-FR'; u.rate = S.rate || 1; u.pitch = S.pitch || 1; u.volume = Math.min(1, S.volume || 1);
      var vs = speechSynthesis.getVoices().filter(function (v) { return (v.voiceURI || v.name) === S.voice; });
      if (!vs.length) vs = speechSynthesis.getVoices().filter(function (v) { return /^fr/i.test(v.lang); });
      try { if (vs[0]) u.voice = vs[0]; } catch (e) { }
      u.onboundary = function (e) { if (e && e.name !== 'sentence' && e.charIndex != null) orb.word(null, e.charIndex, e.charLength ? e.charIndex + e.charLength : undefined); else orb.pulse(); };
      u.onend = fin; u.onerror = fin;
      try { speechSynthesis.speak(u); } catch (e) { fin(); }
      }
    }).catch(function () { });
  }
  function shush() { try { if (VX) VX.stop(); if (B && B.shush) B.shush(); if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { } Object.keys(speakWait).forEach(function (k) { speakWait[k](); }); }

  /* ---------------- Réponse : carte + voix ---------------- */
  var MJ = window.Majordome = { listening: false, wait: null, last: null, voiceTurn: false };
  function answer(o) {
    if (typeof o === 'string') o = { say: o };
    var html = o.html != null ? o.html : '<p>' + esc(o.show || o.say) + '</p>';
    var c = card((o.k ? '<div class="k">' + esc(o.k) + '</div>' : '') + html, o.cls);
    MJ.last = { q: MJ.cur && now() - MJ.cur.at < 120000 ? MJ.cur.q : '', a: o.show || o.say || '', at: now() };
    if (MJ.cur) MJ.cur.a = (MJ.cur.a ? MJ.cur.a + ' ' : '') + (o.say || o.show || '');
    publish();
    if (MJ.onAnswer) try { MJ.onAnswer(o); } catch (e) { console.warn(e); }   // montre connectée (mj-montre.js)
    var p = o.say ? speak(o.say) : Promise.resolve();
    c.done = p;
    return c;
  }
  function errorReply(t) { beep('error'); orb.state('error'); setTimeout(function () { if (orb.get() === 'error') orb.state('idle'); }, 1400); return answer({ say: t, cls: 'err' }); }

  /* ---------------- Questions : confirmation, précision ---------------- */
  // ask(question, slot, {buttons}) → Promise : true/false (yesno) ou valeur (when, duration, text, choice), null si annulé ou sans réponse
  function ask(q, slot, opt) {
    opt = opt || {};
    if (MJ.wait) MJ.wait.resolve(null);
    return new Promise(function (resolve) {
      var w = { slot: slot, resolve: null, card: null };
      var timer = 0;
      w.resolve = function (v) {
        if (MJ.wait !== w) return; MJ.wait = null; clearTimeout(timer);
        if (w.card) w.card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        resolve(v);
      };
      MJ.wait = w;
      var btns = '';
      if (slot === 'yesno') btns = '<div class="row"><button class="btn ' + (opt.danger ? 'bad' : 'pri') + '" data-y>' + esc(opt.yes || 'Confirmer') + '</button><button class="btn" data-n>Annuler</button></div>';
      else if (slot === 'choice') btns = '<div class="row">' + opt.choices.map(function (c, i) { return '<button class="btn sm" data-c="' + (i + 1) + '">' + (i + 1) + '. ' + esc(c) + '</button>'; }).join('') + '<button class="btn sm" data-n>Annuler</button></div>';
      else btns = '<div class="row"><button class="btn sm" data-n>Annuler</button></div>';
      w.card = answer({ say: q, html: '<p>' + esc(opt.show || q) + '</p>' + btns, cls: opt.danger ? 'warn' : '', k: opt.k || (slot === 'yesno' ? 'Confirmation' : 'Précision'), ask: slot, choices: opt.choices });
      w.card.addEventListener('click', function (e) {
        if (e.target.closest('[data-y]')) w.resolve(true);
        else if (e.target.closest('[data-n]')) w.resolve(slot === 'yesno' ? false : null);
        else if (e.target.closest('[data-c]')) w.resolve(+e.target.closest('[data-c]').dataset.c);
      });
      timer = setTimeout(function () { w.resolve(slot === 'yesno' ? false : null); }, opt.timeout || 40000);
      // à la voix : on réécoute après la question
      if (MJ.voiceTurn && S.autoListen && engineReady()) w.card.done.then(function () { if (MJ.wait === w) startListen({ follow: true }); });
    });
  }

  /* ---------------- Reconnaissance vocale ---------------- */
  var INFO = { model: { state: 'none' }, engines: [] };
  function refreshInfo() { if (B && B.sttInfo) INFO = J(B.sttInfo(), INFO) || INFO; chips(); return INFO; }
  function engineReady() {
    if (!B || !B.listen) return false;
    if (S.engine === 'vosk') return INFO.model && INFO.model.state === 'ready';
    if (S.engine === 'web') return !!INFO.web && S.webOk;
    if (S.engine === 'android') return !!INFO.android;
    return false;
  }
  function startListen(opt) {
    opt = opt || {};
    if (MJ.listening) return;
    if (!B || !B.listen) { status('Clavier seulement'); $('q').focus(); toast('Reconnaissance vocale indisponible ici : tape ta commande.'); return; }
    refreshInfo();
    if (!engineReady()) {
      if (S.engine === 'vosk') { status('Modèle vocal à installer', 'error'); modelSheet(); }
      else if (S.engine === 'web' && !S.webOk) settingsSheet('moteur');
      else errorReply('La reconnaissance vocale n\'est pas prête.');
      return;
    }
    shush();
    MJ.listening = true; MJ.voiceTurn = true;
    $('mic').classList.add('on'); status(opt.follow ? 'Je vous écoute…' : 'J\'écoute', 'listen'); $('heard').textContent = ''; $('heard').className = 'partial';
    beep('start');
    try { B.listen(JSON.stringify({ engine: S.engine, mode: 'cmd', maxMs: MJ.wait ? 7000 : 9000, words: wakeWords() })); }
    catch (e) { stopUi(); errorReply('Écoute impossible : ' + e.message); }
  }
  function stopListen() { if (B && B.stop) try { B.stop(); } catch (e) { } stopUi(); }
  function stopUi() { MJ.listening = false; $('mic').classList.remove('on'); orb.level(0); if (orb.get() === 'listen') orb.state('idle'); }
  function toggle() { if (MJ.listening) { stopListen(); status('Prêt'); } else startListen(); }
  MJ.toggle = toggle; MJ.listen = startListen; MJ.stop = stopListen;

  window.majordomeEvent = function (type, data) {
    var d = J(data, {}) || {};
    switch (type) {
      case 'level': if (MJ.listening || orb.get() === 'listen') orb.level(d.v, d.b); break;   // niveau du micro (≈ 20 par seconde) et bandes grave / médium / aigu
      case 'partial': if (MJ.listening && d.text) { $('heard').textContent = d.text; $('heard').className = 'partial'; } break;
      case 'result':
        if (!MJ.listening && !d.wake) break;
        stopUi(); beep('end');
        if (d.text && d.text.trim()) handle(d.text, 'voice');
        else { status('Je n\'ai rien entendu', 'idle'); $('heard').textContent = ''; backToSocle(); if (MJ.wait && MJ.wait.slot === 'yesno') { /* on garde la carte : boutons */ } }
        break;
      case 'end': if (MJ.listening) { stopUi(); status('Prêt', 'idle'); } break;
      case 'error': stopUi(); errorReply(d.msg || 'Erreur de reconnaissance.'); break;
      case 'wake': if (!MJ.listening && !speaking()) { orb.pulse(); startListen(); } break;
      case 'command': if (d.text) handle(d.text, 'voice'); break;
      case 'assist': takeAssist(); break;
      case 'toast': if (d.text) toast(d.text); break;
      case 'spoken': if (speakWait[d.id]) speakWait[d.id](); break;
      case 'pchunk': { var pw = pipeWait[d.id]; if (pw) { if (d.phase === 'start' && pw.started) pw.started(); if (d.phase === 'end') { delete pipeWait[d.id]; pw.ok(); } } break; }   // phrase Piper jouée par AudioTrack
      case 'piper': if (VX) VX.androidEvent(d); break;   // téléchargement ou suppression d'une voix Piper
      case 'boundary': if (d.s != null) orb.word(null, d.s, d.e); else orb.pulse(); break;   // mot prononcé par la synthèse (début, fin)
      case 'model': INFO.model = d; chips(); modelUi(); if (d.state === 'ready' && d.fresh) { answer({ say: 'Le modèle vocal français est installé. Je vous écoute quand vous voulez.', k: 'Modèle vocal' }); applyWake(); } break;
      case 'alarm': tick(); break;
      case 'sms': answer(d.ok ? { say: 'Message envoyé.' } : { say: 'Le message n\'a pas pu partir : ' + (d.err || 'erreur') + '.', cls: 'err' }); break;
      case 'wakestate': INFO.wake = d; chips(); break;
      case 'perm': refreshInfo(); if (curSheet === 'perms') permsSheet(); break;
      case 'watch': if (MJ.onWatch) MJ.onWatch(d); break;   // demande de la mini-appli de la montre (MajordomeBridge.Montre)
    }
  };
  function speaking() { return orb.get() === 'speak'; }

  /* ---------------- Traitement d'une commande ---------------- */
  function ctx() { var c = { now: now(), names: wakeWords(), routines: S.routines.filter(function (r) { return r.id !== 'matin' && r.id !== 'nuit'; }).map(function (r) { return { id: r.id, name: r.name, phrase: r.phrase }; }) }; if (MJ.ctxExtra) try { Object.assign(c, MJ.ctxExtra()); } catch (e) { } return c; }
  function handle(text, via) {
    text = String(text || '').trim(); if (!text) return Promise.resolve();
    MJ.voiceTurn = via === 'voice';
    $('heard').textContent = '« ' + text + ' »'; $('heard').className = '';
    if (MJ.wait) {
      var w = MJ.wait, c = ctx(); c.expect = { slot: w.slot };
      var r0 = NLU.parse(text, c);
      card('<p>' + esc(text) + '</p>', 'q');
      if (r0.intent === 'confirm_yes' && w.slot === 'yesno') { w.resolve(true); return Promise.resolve(); }
      if (r0.intent === 'confirm_no' || r0.intent === 'stop') { w.resolve(w.slot === 'yesno' ? false : null); return Promise.resolve(); }
      if (r0.intent === 'slot') { w.resolve(r0.p.when || r0.p.ms || r0.p.choice || r0.p.text || null); return Promise.resolve(); }
      if (w.slot === 'yesno') { w.resolve(false); }
      else { w.resolve(null); }
    } else card('<p>' + esc(text) + '</p>', 'q');
    var r = NLU.parse(text, ctx());
    MJ.cur = { at: now(), q: text, a: '', intent: r.intent };
    if (via !== 'voice' && via !== 'socle') MJ.backAfter = false;
    status('…', 'think');
    var p;
    try { p = Promise.resolve(exec(r)); } catch (e) { p = Promise.reject(e); }
    return p.catch(function (e) { console.warn(e); errorReply('Une erreur est survenue : ' + (e && e.message || e) + '.'); }).then(function () {
      if (orb.get() === 'think') orb.state('idle');
      if (!MJ.listening) status('Prêt');
      logHist(MJ.cur);
      try { moment(); } catch (e) { }
      backToSocle();
    });
  }
  MJ.handle = handle;
  function logHist(h) {
    if (!S.history || !h || !h.q) return;
    var l = lsGet(KEY.hist, []); l.push({ at: h.at, q: h.q, a: h.a.slice(0, 400), i: h.intent }); while (l.length > 300) l.shift(); lsSet(KEY.hist, l);
  }

  /* ---------------- Formats ---------------- */
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function hm(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : ''); }
  function hmSay(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return (h === 0 && !m ? 'minuit' : h === 12 && !m ? 'midi' : h + (h > 1 ? ' heures' : ' heure') + (m ? ' ' + m : '')); }
  function dayName(ms, withDate) {
    var d0 = NLU.startOfDay(now()), d = NLU.startOfDay(ms), diff = Math.round((d - d0) / DAY), x = new Date(ms);
    var rel = diff === 0 ? 'aujourd\'hui' : diff === 1 ? 'demain' : diff === 2 ? 'après-demain' : diff === -1 ? 'hier' : '';
    var full = JOURS[x.getDay()] + ' ' + (x.getDate() === 1 ? '1er' : x.getDate()) + ' ' + MOIS[x.getMonth()] + (x.getFullYear() !== new Date().getFullYear() ? ' ' + x.getFullYear() : '');
    return rel && !withDate ? rel : rel ? rel + ', ' + full : full;
  }
  function dur(ms) {
    var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60, out = [];
    if (h) out.push(h + (h > 1 ? ' heures' : ' heure')); if (m) out.push(m + (m > 1 ? ' minutes' : ' minute')); if (sec && h === 0) out.push(sec + (sec > 1 ? ' secondes' : ' seconde'));
    return out.join(' ') || '0 seconde';
  }
  function clock(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
  function num(v, d) { return NLU.num(v, d); }
  function euros(c) { return num(c / 100, 2).replace(/,00$/, '') + ' €'; }
  function ymd(ms) { var d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* ---------------- Exécution ---------------- */
  var H = {};
  function exec(r) {
    var f = H[r.intent];
    if (!f) return answer('Je ne sais pas encore faire ça.');
    return f(r.p || {}, r);
  }
  MJ.exec = exec;

  H.empty = function () { };
  H.wake = function () { answer({ say: withSir('Oui') + ' ?', show: 'Oui ?' }).done.then(function () { if (MJ.voiceTurn && engineReady()) startListen({ follow: true }); }); };
  H.stop = function () { shush(); stopAlarmsRinging(); status('Prêt', 'idle'); card('<p>D\'accord.</p>'); };
  H.thanks = function () { answer(withSir('À votre service') + '.'); };
  H.repeat = function () { answer(lastSaid ? { say: lastSaid } : 'Je n\'ai encore rien dit.'); };
  H.confirm_yes = H.confirm_no = function () { answer('Il n\'y a rien à confirmer pour le moment.'); };
  H.slot = function () { answer('Je n\'attendais pas de réponse.'); };
  H.greet = function (p) {
    if (p.kind === 'hello') return answer(withSir('Bonjour') + '. Que puis-je faire pour vous ?');
    if (p.kind === 'howareyou') return answer('Tous mes circuits fonctionnent, merci. Et je reste à votre service.');
    if (p.kind === 'here') return answer(withSir('Je suis là') + '.');
    return answer('Je suis ' + (S.name || 'Majordome') + ', un assistant à commandes, sans intelligence artificielle de conversation. Je comprends une liste de commandes en français : dites « qu\'est-ce que tu sais faire ? » pour les connaître.');
  };
  H.unknown = function (p) {
    var sg = p.suggest;
    if (sg && sg.phrase) {
      var c = answer({ say: 'Je ne sais pas encore faire ça. Vouliez-vous dire : ' + sg.phrase + ' ?', html: '<p>Je ne sais pas encore faire ça.</p><p>Vouliez-vous dire : <button class="btn sm" data-try>« ' + esc(sg.phrase) + ' »</button></p>' });
      c.querySelector('[data-try]').onclick = function () { handle(sg.phrase, 'click'); };
      return c.done;
    }
    var c2 = answer({ say: 'Je ne sais pas encore faire ça. Dites « aide » pour la liste des commandes.', html: '<p>Je ne sais pas encore faire ça.</p><div class="row"><button class="btn sm" data-help>Voir ce que je sais faire</button></div>' });
    c2.querySelector('[data-help]').onclick = helpSheet;
    return c2.done;
  };

  /* --- Heure, date --- */
  H.time = function () { var t = now(); return answer({ say: 'Il est ' + hmSay(t) + '.', html: '<div class="k">Heure</div><div class="big">' + hm(t) + '</div>' }).done; };
  H.date = function (p) {
    var t = NLU.addDays(now(), p.offset || 0), d = new Date(t);
    if (p.what === 'year') return answer('Nous sommes en ' + d.getFullYear() + '.').done;
    if (p.what === 'month') return answer('Nous sommes en ' + MOIS[d.getMonth()] + ' ' + d.getFullYear() + '.').done;
    if (p.what === 'week') { var tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var dn = tmp.getUTCDay() || 7; tmp.setUTCDate(tmp.getUTCDate() + 4 - dn); var y0 = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1)); var wk = Math.ceil(((tmp - y0) / DAY + 1) / 7); return answer('Nous sommes en semaine ' + wk + '.').done; }
    var lab = p.offset === 1 ? 'Demain, nous serons ' : p.offset === -1 ? 'Hier, nous étions ' : p.offset === 2 ? 'Après-demain, nous serons ' : 'Nous sommes ';
    var full = JOURS[d.getDay()] + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
    return answer({ say: lab + full + '.', html: '<div class="k">Date</div><div class="big">' + esc(cap(full)) + '</div>' }).done;
  };
  H.countdown = function (p) {
    if (p.unknown) return answer('Je ne connais pas cette date. Dites par exemple : dans combien de jours est le 14 juillet ?').done;
    var days = Math.round((NLU.startOfDay(p.at) - NLU.startOfDay(now())) / DAY), name = p.name || ('le ' + dayName(p.at, true).replace(/^.*?, /, ''));
    var d = new Date(p.at), when = JOURS[d.getDay()] + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + MOIS[d.getMonth()] + (d.getFullYear() !== new Date(now()).getFullYear() ? ' ' + d.getFullYear() : '');
    if (p.ask === 'day') return answer(cap(name) + ' tombe ' + when + (days > 0 ? ', dans ' + days + ' jour' + (days > 1 ? 's' : '') : days === 0 ? ', c\'est aujourd\'hui' : '') + '.').done;
    if (days === 0) return answer(cap(name) + ', c\'est aujourd\'hui !').done;
    return answer({ say: cap(name) + ' est dans ' + days + ' jour' + (days > 1 ? 's' : '') + ', ' + when + '.', html: '<div class="k">' + esc(cap(name)) + '</div><div class="big">J−' + days + '</div><p>' + esc(cap(when)) + '</p>' }).done;
  };
  H.sun = function (p) {
    return weatherData().then(function (w) {
      var t = w.data.daily[p.what === 'rise' ? 'sunrise' : 'sunset'][0];
      return answer('Le soleil se ' + (p.what === 'rise' ? 'lève' : 'couche') + ' à ' + hmSay(new Date(t).getTime()) + ' ' + w.where + '.').done;
    }, wxFail);
  };

  /* --- Calcul, conversions --- */
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
    var dec = p.kind === 't' ? 1 : Math.abs(p.result) >= 100 ? 1 : 3;
    var res = num(p.result, dec), src = num(p.value, 3);
    var say = src + ' ' + unitWord(p.from, p.value) + ' font ' + res + ' ' + unitWord(p.to, p.result) + '.';
    var extra = '';
    if (p.dn) { extra = 'En tuyauterie, ' + src + ' pouce' + (p.value >= 2 ? 's' : '') + ' correspond au DN ' + p.dn.dn + ', soit ' + num(p.dn.od, 1) + ' millimètres de diamètre extérieur.'; }
    if (p.dnFromOd) extra = 'Un tube de ' + src + ' mm de diamètre extérieur correspond au DN ' + p.dnFromOd.dn + ' (' + num(p.dnFromOd.inch, 3) + ' pouce).';
    return answer({ say: say + (extra ? ' ' + extra : ''), html: '<div class="k">Conversion</div><div class="big">' + esc(res + ' ' + (UN[p.to] || [, p.to])[1]) + '</div><p>' + esc(src + ' ' + (UN[p.from] || [, p.from])[1]) + '</p>' + (extra ? '<p class="note">' + esc(extra) + '</p>' : '') }).done;
  };

  /* --- Minuteurs, réveils, rappels --- */
  var AL = lsGet(KEY.al, []);
  function saveAL() { lsSet(KEY.al, AL); publish(); }
  function addAlarm(o) {
    o.id = o.id || uid(); o.created = now(); AL.push(o); saveAL();
    if (B && B.alarmSet) try { B.alarmSet(JSON.stringify({ id: o.id, at: o.at, kind: o.kind, title: alarmTitle(o), text: alarmText(o), reqs: o.reqs || undefined })); } catch (e) { }
    renderTimers(); return o;
  }
  function removeAlarm(o) { AL = AL.filter(function (x) { return x.id !== o.id; }); saveAL(); if (B && B.alarmCancel) try { B.alarmCancel(o.id); } catch (e) { } renderTimers(); }
  function alarmTitle(o) { return o.kind === 'hue' ? 'Lumières' : o.kind === 'timer' ? 'Minuteur' + (o.label ? ' : ' + o.label : '') : o.kind === 'alarm' ? 'Réveil' : 'Rappel'; }
  function alarmText(o) { return o.kind === 'hue' ? (o.label || 'Lumières') : o.kind === 'timer' ? 'Le minuteur de ' + dur(o.ms) + ' est terminé.' : o.kind === 'alarm' ? 'Il est ' + hmSay(o.at) + '.' : (o.text || 'Rappel'); }
  var ringing = {};
  function tick() {
    var t = now();
    AL.slice().forEach(function (o) {
      if (o.kind === 'hue') { if (t - o.at > 2 * MIN) { AL = AL.filter(function (x) { return x.id !== o.id; }); saveAL(); } return; }   // exécutée par MajordomeBridge (AlarmManager)
      if (o.at <= t && !ringing[o.id]) {
        if (t - o.at > 6 * HOUR) { removeAlarm(o); return; }   // passé depuis longtemps (appli fermée) : notification déjà montrée
        fire(o);
      }
    });
    renderTimers();
    var sw = lsGet(KEY.sw, null); if (sw && sw.run) { var el = document.querySelector('.tm[data-sw] b'); if (el) el.textContent = clock(sw.acc + t - sw.start); }
  }
  function fire(o) {
    ringing[o.id] = true;
    var txt = o.kind === 'timer' ? withSir('Le minuteur' + (o.label ? ' pour ' + o.label : '') + ' de ' + dur(o.ms) + ' est terminé') + '.' :
      o.kind === 'alarm' ? withSir('Il est ' + hmSay(o.at)) + '. C\'est l\'heure de votre réveil.' : withSir('Rappel') + ' : ' + (o.text || 'c\'est l\'heure') + '.';
    beep('alarm');
    var rep = setInterval(function () { if (!ringing[o.id]) { clearInterval(rep); return; } beep('alarm'); }, o.kind === 'reminder' ? 20000 : 3000);
    ringing[o.id] = rep;
    if (PC && window.MAGPC) window.MAGPC.notify(alarmTitle(o), alarmText(o), { tag: o.id });
    var c = answer({ say: txt, html: '<div class="k">' + esc(alarmTitle(o)) + '</div><p>' + esc(txt) + '</p><div class="row"><button class="btn pri" data-stop>Arrêter</button>' + (o.kind !== 'timer' ? '<button class="btn" data-snooze>Dans 10 minutes</button>' : '') + '</div>', cls: 'warn' });
    c.querySelector('[data-stop]').onclick = function () { stopRing(o); };
    var sz = c.querySelector('[data-snooze]'); if (sz) sz.onclick = function () { stopRing(o); addAlarm({ kind: o.kind, at: now() + 10 * MIN, text: o.text, label: o.label }); toast('Je vous le redis dans 10 minutes'); };
    setTimeout(function () { if (ringing[o.id]) stopRing(o); }, o.kind === 'reminder' ? 60000 : 5 * MIN);
  }
  function stopRing(o) { var r = ringing[o.id]; if (r && r !== true) clearInterval(r); delete ringing[o.id]; removeAlarm(o); }
  function stopAlarmsRinging() { Object.keys(ringing).forEach(function (id) { var o = AL.filter(function (x) { return x.id === id; })[0]; if (o) stopRing(o); else delete ringing[id]; }); }
  MJ.tick = tick;
  function renderTimers() {
    var t = now(), h = '';
    AL.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (o) {
      var left = o.at - t;
      var dd = Math.round((NLU.startOfDay(o.at) - NLU.startOfDay(t)) / DAY), lab = o.kind === 'timer' || o.kind === 'hue' ? clock(Math.max(0, left)) : hm(o.at) + (dd === 1 ? ' demain' : dd > 1 ? ' ' + JOURS[new Date(o.at).getDay()].slice(0, 3) + '.' : '');
      h += '<div class="tm' + (ringing[o.id] ? ' ring' : '') + '" data-id="' + o.id + '"><b>' + esc(lab) + '</b><small>' + esc(o.kind === 'hue' ? (o.label || 'Lumières') : o.kind === 'timer' ? (o.label || 'Minuteur') : o.kind === 'alarm' ? 'Réveil' : (o.text || 'Rappel')) + '</small><button class="ib" data-del aria-label="Supprimer" style="width:34px;height:34px"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
    });
    var sw = lsGet(KEY.sw, null);
    if (sw && (sw.run || sw.acc)) h += '<div class="tm" data-sw><b>' + clock(sw.acc + (sw.run ? t - sw.start : 0)) + '</b><small>Chrono' + (sw.run ? '' : ' (arrêté)') + '</small><button class="ib" data-swx aria-label="Effacer le chrono" style="width:34px;height:34px"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';
    var box = $('timers'); if (box.innerHTML !== h) box.innerHTML = h;
  }
  $('timers').addEventListener('click', function (e) {
    var d = e.target.closest('[data-del]'); if (d) { var id = d.closest('[data-id]').dataset.id, o = AL.filter(function (x) { return x.id === id; })[0]; if (o) { if (ringing[id]) stopRing(o); else removeAlarm(o); } return; }
    if (e.target.closest('[data-swx]')) { lsSet(KEY.sw, null); renderTimers(); }
  });
  function needWhen(q) { return ask(q, 'when').then(function (w) { return w && w.at != null ? w : null; }); }
  H.timer = function (p) {
    var go = function (ms) {
      if (!ms) { answer('Minuteur annulé.'); return; }
      if (ms > 24 * HOUR) return answer('Un minuteur dure au plus 24 heures. Pour plus long, demandez un rappel.').done;
      addAlarm({ kind: 'timer', at: now() + ms, ms: ms, label: p.label || '' });
      return answer({ say: ack('Minuteur de ' + dur(ms) + (p.label ? ' pour ' + p.label : '') + ' lancé.'), show: 'Minuteur de ' + dur(ms) + (p.label ? ' (' + p.label + ')' : '') + ' lancé.' }).done;
    };
    if (p.ms) return go(p.ms);
    return ask('Pour combien de temps ?', 'duration').then(function (ms) { if (ms) return go(ms); answer('Minuteur annulé.'); });
  };
  H.timer_cancel = function (p) {
    var l = AL.filter(function (o) { return o.kind === 'timer'; });
    if (!l.length) return answer('Aucun minuteur en cours.').done;
    if (p.all || l.length === 1) { l.forEach(function (o) { if (ringing[o.id]) stopRing(o); else removeAlarm(o); }); return answer(l.length > 1 ? ack(l.length + ' minuteurs annulés.') : ack('Minuteur arrêté.')).done; }
    return ask('Lequel ?', 'choice', { choices: l.map(function (o) { return (o.label || 'Minuteur') + ' (' + clock(o.at - now()) + ')'; }) }).then(function (k) { var o = l[(k || 0) - 1]; if (!o) return answer('Rien n\'a été annulé.'); removeAlarm(o); answer(ack('Minuteur annulé.')); });
  };
  H.timer_query = function () {
    var l = AL.filter(function (o) { return o.kind === 'timer'; }).sort(function (a, b) { return a.at - b.at; });
    if (!l.length) return answer('Aucun minuteur en cours.').done;
    return answer(l.map(function (o) { return 'Il reste ' + dur(o.at - now()) + (o.label ? ' pour ' + o.label : ''); }).join('. ') + '.').done;
  };
  H.stopwatch = function (p) {
    var sw = lsGet(KEY.sw, null) || { run: false, start: 0, acc: 0 }, t = now();
    if (p.cmd === 'start') { if (sw.run) return answer('Le chronomètre tourne déjà : ' + dur(sw.acc + t - sw.start) + '.').done; sw.run = true; sw.start = t; lsSet(KEY.sw, sw); renderTimers(); return answer(ack('Chronomètre lancé.')).done; }
    if (p.cmd === 'stop') { if (!sw.run) return answer('Le chronomètre n\'est pas lancé.').done; sw.acc += t - sw.start; sw.run = false; lsSet(KEY.sw, sw); renderTimers(); return answer('Chronomètre arrêté à ' + dur(sw.acc) + '.').done; }
    if (p.cmd === 'reset') { lsSet(KEY.sw, null); renderTimers(); return answer(ack('Chronomètre remis à zéro.')).done; }
    return answer(sw.run || sw.acc ? 'Le chronomètre indique ' + dur(sw.acc + (sw.run ? t - sw.start : 0)) + '.' : 'Le chronomètre n\'est pas lancé.').done;
  };
  H.alarm = function (p) {
    var go = function (at) {
      addAlarm({ kind: 'alarm', at: at });
      return answer({ say: ack('Réveil réglé ' + dayName(at) + ' à ' + hmSay(at) + '.'), show: 'Réveil : ' + dayName(at) + ' à ' + hm(at) }).done;
    };
    if (p.at) return go(p.at);
    return needWhen('À quelle heure voulez-vous être réveillé ?').then(function (w) { if (w) return go(w.at); answer('Réveil annulé.'); });
  };
  H.alarm_list = function () {
    var l = AL.filter(function (o) { return o.kind === 'alarm'; }).sort(function (a, b) { return a.at - b.at; });
    var sys = P && P.homeAlarm ? J(P.homeAlarm(), {}) : {};
    if (!l.length) return answer(sys.at && ANDROID ? 'Je n\'ai pas de réveil, mais le prochain réveil du téléphone sonnera ' + dayName(sys.at) + ' à ' + hmSay(sys.at) + '.' : 'Aucun réveil programmé.').done;
    return answer('Votre prochain réveil sonnera ' + dayName(l[0].at) + ' à ' + hmSay(l[0].at) + (l.length > 1 ? '. ' + (l.length - 1) + ' autre' + (l.length > 2 ? 's' : '') + ' ensuite.' : '.')).done;
  };
  H.alarm_cancel = function (p) {
    if (p.ringing && Object.keys(ringing).length) { stopAlarmsRinging(); return answer(ack()).done; }
    var l = AL.filter(function (o) { return o.kind === 'alarm' && (!p.at || Math.abs(o.at - p.at) < MIN || hm(o.at) === hm(p.at)); });
    if (!l.length) return answer('Je ne trouve pas ce réveil.').done;
    return ask(l.length > 1 ? 'Supprimer ' + l.length + ' réveils ?' : 'Supprimer le réveil de ' + dayName(l[0].at) + ' à ' + hmSay(l[0].at) + ' ?', 'yesno', { danger: true, yes: 'Supprimer' }).then(function (ok) {
      if (!ok) return answer('Je le garde.');
      l.forEach(removeAlarm); answer(ack('Réveil supprimé.'));
    });
  };
  H.reminder = function (p) {
    var text = p.text, at = p.at;
    var step = Promise.resolve();
    if (!text) step = step.then(function () { return ask('Que dois-je vous rappeler ?', 'text').then(function (x) { text = x; }); });
    if (!at) step = step.then(function () { if (text) return needWhen('Pour quand ?').then(function (w) { at = w && w.at; }); });
    return step.then(function () {
      if (!text || !at) return answer('Rappel annulé.');
      addAlarm({ kind: 'reminder', at: at, text: text });
      return answer({ say: ack('Je vous rappellerai ' + (at - now() < 2 * HOUR ? 'dans ' + dur(Math.round((at - now()) / MIN) * MIN) : dayName(at) + ' à ' + hmSay(at)) + ' : ' + text + '.'), show: 'Rappel ' + dayName(at) + ' à ' + hm(at) + ' : ' + text }).done;
    });
  };
  H.reminder_list = function () {
    var l = AL.filter(function (o) { return o.kind === 'reminder'; }).sort(function (a, b) { return a.at - b.at; });
    if (!l.length) return answer('Aucun rappel programmé.').done;
    return answer({ say: l.length + ' rappel' + (l.length > 1 ? 's' : '') + ' : ' + l.slice(0, 5).map(function (o) { return dayName(o.at) + ' à ' + hmSay(o.at) + ', ' + o.text; }).join(' ; ') + '.', html: '<div class="k">Rappels</div><ul>' + l.map(function (o) { return '<li>' + esc(dayName(o.at) + ' ' + hm(o.at) + ' — ' + o.text) + '</li>'; }).join('') + '</ul>' }).done;
  };
  H.reminder_cancel = function (p) {
    var l = AL.filter(function (o) { return o.kind === 'reminder'; }).sort(function (a, b) { return a.at - b.at; });
    if (!l.length) return answer('Aucun rappel à supprimer.').done;
    var pick = p.all || l.length === 1 ? Promise.resolve(l) : ask('Lequel ?', 'choice', { choices: l.map(function (o) { return o.text + ' (' + hm(o.at) + ')'; }) }).then(function (k) { return l[(k || 0) - 1] ? [l[k - 1]] : null; });
    return pick.then(function (sel) {
      if (!sel) return answer('Rien n\'a été supprimé.');
      return ask('Supprimer ' + (sel.length > 1 ? sel.length + ' rappels' : 'le rappel « ' + sel[0].text + ' »') + ' ?', 'yesno', { danger: true, yes: 'Supprimer' }).then(function (ok) {
        if (!ok) return answer('Je les garde.');
        sel.forEach(removeAlarm); answer(ack(sel.length > 1 ? 'Rappels supprimés.' : 'Rappel supprimé.'));
      });
    });
  };

  /* --- Réseau : lecture de texte (Android : liste blanche d'ActualitesBridge ; PC : fetch) --- */
  var httpWait = {};
  var prevActu = window.actuHttp;
  window.actuHttp = function (key, code, body, err) { var w = httpWait[key]; if (w) { delete httpWait[key]; if (code >= 200 && code < 300 && body) w.ok(body); else w.ko(new Error(err || ('HTTP ' + code))); } else if (prevActu) prevActu(key, code, body, err); };
  function httpText(url, viaBridge) {
    var A = window.MAGActualites;
    if (viaBridge && A && A.http && !PC) {
      return new Promise(function (ok, ko) { var k = 'mj' + uid(); httpWait[k] = { ok: ok, ko: ko }; setTimeout(function () { if (httpWait[k]) { delete httpWait[k]; ko(new Error('délai dépassé')); } }, 25000); A.http(k, url); });
    }
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
    return fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined, referrerPolicy: 'no-referrer' }).then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
  }
  function online() { return navigator.onLine !== false; }

  /* --- Météo (Open-Meteo, sans clé) --- */
  var WMO = { 0: 'ciel dégagé', 1: 'plutôt dégagé', 2: 'partiellement nuageux', 3: 'couvert', 45: 'brouillard', 48: 'brouillard givrant', 51: 'bruine légère', 53: 'bruine', 55: 'bruine forte', 56: 'bruine verglaçante', 57: 'bruine verglaçante', 61: 'pluie faible', 63: 'pluie', 65: 'forte pluie', 66: 'pluie verglaçante', 67: 'pluie verglaçante', 71: 'neige faible', 73: 'neige', 75: 'forte neige', 77: 'grains de neige', 80: 'averses', 81: 'averses', 82: 'fortes averses', 85: 'averses de neige', 86: 'fortes averses de neige', 95: 'orages', 96: 'orages avec grêle', 99: 'orages avec grêle' };
  var gpsCache = null;
  function gps() {
    if (gpsCache && now() - gpsCache.t < 30 * MIN) return Promise.resolve(gpsCache.p);
    return new Promise(function (ok, ko) {
      if (!navigator.geolocation) { ko(new Error('pas de position')); return; }
      navigator.geolocation.getCurrentPosition(function (p) { var o = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), name: '' }; gpsCache = { t: now(), p: o }; ok(o); }, function () { ko(new Error('position refusée')); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 15 * MIN });
    });
  }
  function geocode(name) {
    return httpText('https://geocoding-api.open-meteo.com/v1/search?count=5&language=fr&format=json&name=' + encodeURIComponent(name)).then(function (t) {
      var r = (J(t, {}).results || []); r.sort(function (a, b) { return (b.country_code === 'FR') - (a.country_code === 'FR'); });
      if (!r.length) throw Object.assign(new Error('ville inconnue'), { city: name });
      return { lat: r[0].latitude, lon: r[0].longitude, name: r[0].name, admin: r[0].admin1 || '' };
    });
  }
  function placeFor(city) {
    if (city) return geocode(city);
    if (S.place && !S.gps) return Promise.resolve(S.place);
    return gps().catch(function (e) { if (S.place) return S.place; throw e; });
  }
  function weatherData(city) {
    return placeFor(city).then(function (pl) {
      var k = pl.lat.toFixed(2) + ',' + pl.lon.toFixed(2);
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pl.lat + '&longitude=' + pl.lon +
        '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,relative_humidity_2m' +
        '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset' +
        '&timezone=auto&forecast_days=7&wind_speed_unit=kmh';
      var where = pl.name ? 'à ' + pl.name : 'chez vous';
      return httpText(url).then(function (t) {
        var d = J(t, null); if (!d || !d.daily) throw new Error('réponse météo illisible');
        var all = lsGet(KEY.wx, {}); all = { k: k, at: now(), d: d, where: where }; lsSet(KEY.wx, all);
        if (MJ.onWeather) try { MJ.onWeather(d, where); } catch (e) { console.warn(e); }   // alerte vent fort pour la montre
        return { data: d, where: where, place: pl, cached: false };
      }, function (e) {
        var c = lsGet(KEY.wx, null);
        if (c && c.k === k && now() - c.at < 12 * HOUR) return { data: c.d, where: c.where, place: pl, cached: c.at };
        throw e;
      });
    });
  }
  function wxFail(e) {
    if (e && e.city) return answer('Je ne trouve pas la ville « ' + e.city + ' ».').done;
    if (/position/.test(e && e.message)) return answer({ say: 'Je ne connais pas votre position. Autorisez la localisation, ou choisissez une ville dans les réglages.', html: '<p>Je ne connais pas votre position. Autorisez la localisation, ou choisissez une ville.</p><div class="row"><button class="btn sm" data-set>Choisir une ville</button></div>' }).querySelector('[data-set]').onclick = function () { settingsSheet('meteo'); };
    return answer({ say: online() ? 'Le service météo ne répond pas pour le moment.' : 'Je n\'ai pas accès à internet : la météo n\'est pas disponible hors ligne.', cls: 'err' }).done;
  }
  function dayIdx(d, off) { return Math.max(0, Math.min(d.daily.time.length - 1, off)); }
  function hourlyFor(d, dayStr) { var out = []; d.hourly.time.forEach(function (t, i) { if (t.slice(0, 10) === dayStr) out.push(i); }); return out; }
  function windNote(gust, max) {
    var lim = +S.windLimit || 45;
    if (gust >= lim) return { warn: true, txt: 'Vent fort, prudence : rafales jusqu\'à ' + Math.round(gust) + ' km/h, au-dessus de votre seuil de ' + lim + ' km/h pour le montage d\'échafaudage.' };
    if (gust >= lim * 0.8) return { warn: false, txt: 'Rafales jusqu\'à ' + Math.round(gust) + ' km/h, proches de votre seuil de ' + lim + ' km/h : surveillez l\'évolution.' };
    return { warn: false, txt: 'Rafales jusqu\'à ' + Math.round(gust) + ' km/h, sous votre seuil de ' + lim + ' km/h.' };
  }
  H.weather = function (p) {
    status('Météo…', 'think');
    return weatherData(p.city).then(function (w) {
      var d = w.data, cur = d.current, off = p.when === 'tomorrow' ? 1 : p.when === 'day' ? (p.offset || 0) : 0;
      var old = w.cached ? ' (prévision enregistrée à ' + hm(w.cached) + ', sans connexion)' : '';
      if (p.when === 'week') {
        var items = d.daily.time.slice(0, 6).map(function (t, i) { return { day: new Date(t + 'T12:00').getTime(), c: WMO[d.daily.weather_code[i]] || '', mn: d.daily.temperature_2m_min[i], mx: d.daily.temperature_2m_max[i], pp: d.daily.precipitation_probability_max[i], g: d.daily.wind_gusts_10m_max[i] }; });
        var say = 'Les prochains jours ' + w.where + ' : ' + items.slice(0, 5).map(function (x) { return JOURS[new Date(x.day).getDay()] + ', ' + x.c + ', ' + Math.round(x.mn) + ' à ' + Math.round(x.mx) + ' degrés'; }).join(' ; ') + '.';
        return answer({ say: say + old, html: '<div class="k">Météo ' + esc(w.where) + old + '</div><div class="wx">' + items.map(function (x) { return '<div><b>' + esc(cap(JOURS[new Date(x.day).getDay()]).slice(0, 3)) + '. ' + Math.round(x.mn) + '/' + Math.round(x.mx) + '°</b>' + esc(x.c) + '<br>pluie ' + x.pp + ' % · raf. ' + Math.round(x.g) + '</div>'; }).join('') + '</div>' }).done;
      }
      if (p.when === 'now' && !p.focus) {
        var c = WMO[cur.weather_code] || '';
        var s1 = 'Il fait ' + Math.round(cur.temperature_2m) + ' degrés ' + w.where + ', ' + c + '. Vent ' + Math.round(cur.wind_speed_10m) + ' km/h, rafales ' + Math.round(cur.wind_gusts_10m) + ' km/h.';
        var wn = cur.wind_gusts_10m >= (+S.windLimit || 45) ? ' Vent fort, prudence.' : '';
        return answer({ say: s1 + wn + old, html: '<div class="k">Maintenant ' + esc(w.where) + old + '</div><div class="big">' + Math.round(cur.temperature_2m) + ' °C</div><p>' + esc(cap(c)) + ' · ressenti ' + Math.round(cur.apparent_temperature) + ' °C · humidité ' + cur.relative_humidity_2m + ' %</p><p>Vent ' + Math.round(cur.wind_speed_10m) + ' km/h, rafales ' + Math.round(cur.wind_gusts_10m) + ' km/h' + (wn ? ' — <b style="color:var(--warn)">vent fort, prudence</b>' : '') + '</p>', cls: wn ? 'warn' : '' }).done;
      }
      var i = dayIdx(d, off), dayStr = d.daily.time[i], hrs = hourlyFor(d, dayStr), lab = off === 0 ? 'Aujourd\'hui' : off === 1 ? 'Demain' : cap(dayName(new Date(dayStr + 'T12:00').getTime()));
      var code = WMO[d.daily.weather_code[i]] || '', mn = Math.round(d.daily.temperature_2m_min[i]), mx = Math.round(d.daily.temperature_2m_max[i]), pp = d.daily.precipitation_probability_max[i], ps = d.daily.precipitation_sum[i], gm = d.daily.wind_gusts_10m_max[i];
      if (p.focus === 'rain' || p.focus === 'snow') {
        var rainH = hrs.filter(function (k) { return new Date(d.hourly.time[k]).getTime() >= now() - HOUR && d.hourly.precipitation_probability[k] >= 50; });
        var yes = pp >= 50 || ps >= 1;
        var when2 = rainH.length ? ', surtout vers ' + hmSay(new Date(d.hourly.time[rainH[0]]).getTime()) : '';
        var s2 = yes ? 'Oui, ' + (p.focus === 'snow' && /neige/.test(code) ? 'de la neige' : 'de la pluie') + ' est probable ' + lab.toLowerCase() + ' ' + w.where + ' (' + pp + ' %)' + when2 + '.' : 'Non, pas de pluie significative prévue ' + lab.toLowerCase() + ' ' + w.where + ' (' + pp + ' % de risque).';
        return answer({ say: s2 + old, k: 'Pluie · ' + lab }).done;
      }
      if (p.focus === 'temp') return answer(lab + ' ' + w.where + ' : de ' + mn + ' à ' + mx + ' degrés' + (off === 0 ? ', ' + Math.round(cur.temperature_2m) + ' en ce moment' : '') + '.' + old).done;
      var wn2 = windNote(gm);
      var s3 = lab + ' ' + w.where + ' : ' + code + ', de ' + mn + ' à ' + mx + ' degrés, risque de pluie ' + pp + ' %. ' + (wn2.warn ? wn2.txt : 'Rafales jusqu\'à ' + Math.round(gm) + ' km/h.');
      return answer({ say: s3 + old, html: '<div class="k">' + esc(lab + ' ' + w.where) + old + '</div><div class="big">' + mn + '° / ' + mx + '°</div><p>' + esc(cap(code)) + ' · pluie ' + pp + ' % (' + num(ps, 1) + ' mm)</p><p' + (wn2.warn ? ' style="color:var(--warn)"' : '') + '>' + esc(wn2.txt) + '</p>', cls: wn2.warn ? 'warn' : '' }).done;
    }, wxFail);
  };
  H.wind = function (p) {
    status('Vent…', 'think');
    return weatherData(p.city).then(function (w) {
      var d = w.data, off = p.when === 'tomorrow' ? 1 : p.when === 'day' ? (p.offset || 0) : 0, i = dayIdx(d, off), dayStr = d.daily.time[i];
      var hrs = hourlyFor(d, dayStr).filter(function (k) { var h = new Date(d.hourly.time[k]).getHours(); return h >= 6 && h <= 20 && (off > 0 || new Date(d.hourly.time[k]).getTime() >= now() - HOUR); });
      var gmax = 0, gAt = null, smax = 0;
      hrs.forEach(function (k) { var g = d.hourly.wind_gusts_10m[k]; if (g > gmax) { gmax = g; gAt = new Date(d.hourly.time[k]).getTime(); } smax = Math.max(smax, d.hourly.wind_speed_10m[k]); });
      if (!hrs.length) { gmax = d.daily.wind_gusts_10m_max[i]; smax = d.daily.wind_speed_10m_max[i]; }
      var lab = off === 0 ? 'aujourd\'hui' : off === 1 ? 'demain' : dayName(new Date(dayStr + 'T12:00').getTime());
      var lim = +S.windLimit || 45, over = hrs.filter(function (k) { return d.hourly.wind_gusts_10m[k] >= lim; }).map(function (k) { return new Date(d.hourly.time[k]).getHours(); });
      var cur = off === 0 ? 'En ce moment ' + w.where + ', vent ' + Math.round(d.current.wind_speed_10m) + ' km/h, rafales ' + Math.round(d.current.wind_gusts_10m) + ' km/h. ' : '';
      var s = cur + cap(lab) + ' en journée : vent moyen jusqu\'à ' + Math.round(smax) + ' km/h, rafales jusqu\'à ' + Math.round(gmax) + ' km/h' + (gAt ? ' vers ' + hmSay(gAt) : '') + '. ';
      var warn = over.length > 0;
      s += warn ? 'Vent fort, prudence : rafales au-dessus de votre seuil de ' + lim + ' km/h entre ' + over[0] + ' heures et ' + (over[over.length - 1] + 1) + ' heures.' + (p.scaffold ? ' Le montage d\'échafaudage est à éviter sur ce créneau.' : '') : (p.scaffold ? 'Rafales sous votre seuil de ' + lim + ' km/h : pas d\'alerte vent pour le montage, en restant attentif aux consignes du chantier.' : 'Pas d\'alerte vent (seuil ' + lim + ' km/h).');
      return answer({ say: s, k: 'Vent · ' + lab, cls: warn ? 'warn' : '' }).done;
    }, wxFail);
  };
  /* --- Vigilance MeteoAlarm (département le plus proche de la position, calculé ici) --- */
  var DEPTS = null;
  function depts() {
    if (DEPTS) return DEPTS;
    DEPTS = window.MJDepts || [];
    return DEPTS;
  }
  function nearestDept(lat, lon) { var best = null, bd = 1e9; depts().forEach(function (d) { var dx = (d.lon - lon) * Math.cos(lat * Math.PI / 180), dy = d.lat - lat, x = dx * dx + dy * dy; if (x < bd) { bd = x; best = d; } }); return best; }
  /* Lecture seule (sans réponse) : { lv : 0 à 4, dep, list : ['orange vent violent', …] } ; aussi pour l'alerte de la montre */
  function vigilanceData(city) { return placeFor(city).then(vigilanceAt); }
  function vigilanceAt(pl) {
    return Promise.resolve().then(function () {
      var dep = nearestDept(pl.lat, pl.lon); if (!dep) throw new Error('département inconnu');
      return httpText('https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-france', true).then(function (xml) {
        var doc = new DOMParser().parseFromString(xml, 'application/xml'), es = doc.getElementsByTagName('entry'), lv = 0, ph = {};
        var geo = 'FR' + ('000' + dep.code).slice(-3), dn = deacc(dep.name);
        for (var i = 0; i < es.length; i++) {
          var e = es[i], txt = function (tag) { var x = e.getElementsByTagName(tag)[0]; return x ? x.textContent : ''; };
          var area = deacc(txt('cap:areaDesc')), vals = Array.prototype.map.call(e.getElementsByTagName('value'), function (v) { return v.textContent.trim(); });
          if (area !== dn && vals.indexOf(geo) < 0) continue;
          var exp = Date.parse(txt('cap:expires')); if (exp && exp < now()) continue;
          var al = txt('cap:awareness_level') + ' ' + txt('title'), m = /(\d)\s*;\s*(green|yellow|orange|red)/i.exec(al), l = m ? +m[1] : /red/i.test(al) ? 4 : /orange/i.test(al) ? 3 : /yellow/i.test(al) ? 2 : 1;
          if (l < 2) continue;
          var ev = deacc(txt('cap:event') || txt('title')), name = /thunder|orage/.test(ev) ? 'orages' : /wind|vent/.test(ev) ? 'vent violent' : /rain|pluie/.test(ev) ? 'pluie-inondation' : /flood|crue/.test(ev) ? 'crues' : /snow|ice|neige/.test(ev) ? 'neige-verglas' : /coast|wave/.test(ev) ? 'vagues-submersion' : /heat|high temp|canicule/.test(ev) ? 'canicule' : /cold|low temp/.test(ev) ? 'grand froid' : /avalanch/.test(ev) ? 'avalanches' : /fire|feu/.test(ev) ? 'feux de forêt' : /fog/.test(ev) ? 'brouillard' : 'phénomène';
          ph[name] = Math.max(ph[name] || 0, l); lv = Math.max(lv, l);
        }
        var col = { 2: 'jaune', 3: 'orange', 4: 'rouge' };
        var list = Object.keys(ph).sort(function (a, b) { return ph[b] - ph[a]; }).map(function (k) { return col[ph[k]] + ' ' + k; });
        var v = { lv: lv, dep: dep, list: list, col: col[lv] || '' };
        if (MJ.onVigilance) try { MJ.onVigilance(v); } catch (e) { console.warn(e); }   // alerte orange / rouge pour la montre
        return v;
      });
    });
  }
  MJ.vigilanceData = vigilanceData;
  H.vigilance = function (p) {
    status('Vigilance…', 'think');
    return placeFor(p.city).then(function (pl) {
      return vigilanceAt(pl).then(function (v) {
        var lv = v.lv, dep = v.dep, list = v.list;
        if (!lv) return answer('Pas de vigilance météo en cours pour ' + dep.name + '.').done;
        return answer({ say: 'Vigilance ' + v.col + ' en ' + dep.name + ' : ' + list.join(', ') + '.' + (lv >= 3 ? ' Prudence.' : ''), cls: lv >= 3 ? 'warn' : '', k: 'Vigilance · ' + dep.name }).done;
      }, function (e) {
        if (PC && /CORS|relais/.test(e && e.message || '')) return answer('Sur PC, la vigilance MeteoAlarm n\'est lisible qu\'avec le relais réseau (lanceur de la Suite, Relais réseau). Ouvrez le site Vigilance de Météo-France.').done;
        return answer({ say: online() ? 'La vigilance n\'est pas disponible pour le moment.' : 'Je n\'ai pas accès à internet pour lire la vigilance.', cls: 'err' }).done;
      });
    }, wxFail);
  };

  /* --- Actualités : titres franceinfo --- */
  H.news = function (p) {
    status('Titres…', 'think');
    var url = 'https://www.franceinfo.fr/' + (p.rub || 'titres') + '.rss';
    return httpText(url, true).then(function (xml) {
      var doc = new DOMParser().parseFromString(xml, 'application/xml'), its = doc.getElementsByTagName('item'), out = [];
      for (var i = 0; i < its.length && out.length < (p.n || 5); i++) { var t = its[i].getElementsByTagName('title')[0], l = its[i].getElementsByTagName('link')[0]; if (t && t.textContent.trim()) out.push({ t: t.textContent.trim().replace(/\s+/g, ' '), l: l ? l.textContent.trim() : '' }); }
      if (!out.length) throw new Error('flux vide');
      lsSet(KEY.actu, { at: now(), rub: p.rub, items: out });
      return out;
    }).catch(function (e) {
      var c = lsGet(KEY.actu, null);
      if (c && c.rub === p.rub && now() - c.at < 12 * HOUR) { c.items.cached = c.at; return c.items.slice(0, p.n || 5); }
      throw e;
    }).then(function (out) {
      var lab = p.rub === 'titres' ? 'les titres' : 'les titres ' + ({ sports: 'du sport', monde: 'du monde', politique: 'de la politique', economie: 'de l\'économie', sante: 'santé', culture: 'culture', sciences: 'sciences' }[p.rub] || '');
      var ord = ['Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Dix'];
      return answer({ say: 'Voici ' + lab + ' de franceinfo' + (out.cached ? ', enregistrés à ' + hmSay(out.cached) : '') + '. ' + out.map(function (x, i) { return ord[i] + ' : ' + x.t; }).join('. ') + '.', html: '<div class="k">franceinfo · ' + esc(lab) + '</div><ul>' + out.map(function (x) { return '<li>' + esc(x.t) + '</li>'; }).join('') + '</ul>' }).done;
    }, function () { return answer({ say: online() ? 'Les titres ne sont pas disponibles pour le moment.' : 'Je n\'ai pas accès à internet pour lire les titres.', cls: 'err' }).done; });
  };

  /* --- Agenda --- */
  function agendaApi() {
    if (window.MAGAgenda) return Promise.resolve(window.MAGAgenda);
    if (B && B.loadAgenda) return Promise.resolve(B.loadAgenda()).then(function () { return window.MAGAgenda || null; });
    return Promise.resolve(null);
  }
  function agendaReady() {
    return agendaApi().then(function (A) {
      if (!A) { answer('L\'agenda n\'est pas disponible ici.'); return null; }
      if (A.perm && !A.perm()) { if (A.ask) A.ask(); answer('J\'ai besoin d\'accéder à votre agenda : autorisez-le, puis redemandez.'); return null; }
      return A;
    });
  }
  function evLine(e, sayIt) { return e.all ? (sayIt ? 'toute la journée, ' : 'Journée — ') + e.t : (sayIt ? 'à ' + hmSay(e.b) + ', ' : hm(e.b) + ' — ') + (e.t || 'Sans titre') + (e.l && !sayIt ? ' (' + e.l + ')' : ''); }
  H.agenda = function (p) {
    return agendaReady().then(function (A) {
      if (!A) return;
      if (p.next) {
        var l0 = J(A.instances(now(), now() + 60 * DAY), []).filter(function (e) { return e.e > now() && !e.all; });
        if (!l0.length) return answer('Aucun rendez-vous dans les deux prochains mois.').done;
        var e0 = l0[0]; return answer('Votre prochain rendez-vous : ' + dayName(e0.b) + ' à ' + hmSay(e0.b) + ', ' + e0.t + (e0.l ? ', ' + e0.l : '') + '.').done;
      }
      var l = J(A.instances(p.from, p.to), []).filter(function (e) { return e.e > p.from || e.all; });
      var span = (p.to - p.from) > DAY + HOUR, lab = span ? 'cette période' : dayName(p.from);
      if (!l.length) return answer(p.free ? 'Oui, rien n\'est prévu ' + lab + '.' : 'Rien de prévu ' + lab + '.').done;
      var say = (p.free ? 'Non, ' : '') + cap(lab) + ', ' + l.length + ' rendez-vous : ' + l.slice(0, 8).map(function (e) { return (span ? dayName(e.b) + ' ' : '') + evLine(e, true); }).join(' ; ') + '.';
      return answer({ say: say, html: '<div class="k">Agenda · ' + esc(lab) + '</div><ul>' + l.map(function (e) { return '<li>' + esc((span ? dayName(e.b) + ' · ' : '') + evLine(e)) + '</li>'; }).join('') + '</ul>' }).done;
    });
  };
  H.agenda_add = function (p) {
    var at = p.at, all = p.allDay;
    var step = Promise.resolve();
    if (at == null) step = needWhen('Pour quand ?').then(function (w) { if (w) { at = w.at; all = !w.hasTime; } });
    return step.then(function () {
      if (at == null) return answer('Rendez-vous annulé.');
      return agendaReady().then(function (A) {
        if (!A) return;
        var cals = J(A.calendars(), []).filter(function (c) { return c.write !== false && c.visible !== false; });
        if (!cals.length) return answer('Aucun agenda modifiable : ouvrez l\'appli Agenda pour en créer un.');
        var cal = cals.filter(function (c) { return c.primary; })[0] || cals[0];
        var o;
        if (all) { var d = new Date(at), st = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); o = { cal: cal.id, t: p.title, l: '', d: 'Ajouté par ' + S.name, start: st, end: st + DAY, all: true, rrule: '', rem: [], c: '' }; }
        else o = { cal: cal.id, t: p.title, l: '', d: 'Ajouté par ' + S.name, start: at, end: p.end || at + HOUR, all: false, rrule: '', rem: [15], c: '' };
        var res = J(A.save(JSON.stringify(o)), {});
        if (!res.ok) return answer({ say: 'Impossible d\'ajouter le rendez-vous : ' + (res.err || 'erreur') + '.', cls: 'err' });
        var c = answer({ say: ack(p.title + ' ajouté ' + dayName(at) + (all ? '' : ' à ' + hmSay(at)) + '.'), html: '<div class="k">Agenda · ' + esc(cal.name || '') + '</div><p>' + esc(p.title) + '</p><p>' + esc(cap(dayName(at, true)) + (all ? ', toute la journée' : ' · ' + hm(at) + (p.end ? ' – ' + hm(p.end) : ''))) + '</p><div class="row"><button class="btn sm" data-undo>Annuler l\'ajout</button></div>' });
        c.querySelector('[data-undo]').onclick = function (e) { e.target.disabled = true; A.remove(res.id, 'all', 0); toast('Rendez-vous retiré'); };
        return c.done;
      });
    });
  };

  /* --- Notes et listes (gardées dans Majordome) --- */
  var LS = lsGet(KEY.lists, { notes: [], lists: {} });
  if (!LS.lists) LS.lists = {}; if (!LS.notes) LS.notes = [];
  function saveLS() { lsSet(KEY.lists, LS); publish(); }
  function listKey(n) { return deacc(n || 'courses').replace(/^(de |des |du |d )/, '').replace(/s$/, '') || 'course'; }
  function listName(k) { return k === 'course' ? 'courses' : k; }
  H.note_add = function (p) {
    if (!p.text) return ask('Que dois-je noter ?', 'text').then(function (x) { if (x) { LS.notes.unshift({ id: uid(), t: x, at: now() }); saveLS(); answer(ack('Noté.')); } else answer('Rien n\'a été noté.'); });
    LS.notes.unshift({ id: uid(), t: p.text, at: now() }); saveLS();
    return answer({ say: ack('Noté.'), show: 'Note : ' + p.text }).done;
  };
  H.notes_read = function () {
    if (!LS.notes.length) return answer('Vous n\'avez aucune note.').done;
    var l = LS.notes.slice(0, 5);
    return answer({ say: LS.notes.length + ' note' + (LS.notes.length > 1 ? 's' : '') + '. ' + l.map(function (n) { return n.t; }).join('. ') + '.', html: '<div class="k">Notes</div><ul>' + LS.notes.slice(0, 20).map(function (n) { return '<li>' + esc(n.t) + '</li>'; }).join('') + '</ul>' }).done;
  };
  H.list_add = function (p) {
    var k = listKey(p.list), l = LS.lists[k] || (LS.lists[k] = []), added = [];
    (p.items || []).forEach(function (it) { if (!l.some(function (x) { return deacc(x.t) === deacc(it) && !x.done; })) { l.push({ id: uid(), t: it, done: false, at: now() }); added.push(it); } });
    saveLS();
    if (!added.length) return answer('C\'est déjà sur la liste ' + listName(k) + '.').done;
    return answer({ say: ack(added.join(', ') + ' ajouté' + (added.length > 1 ? 's' : '') + ' à la liste ' + listName(k) + '.'), show: 'Liste ' + listName(k) + ' : + ' + added.join(', ') }).done;
  };
  H.list_read = function (p) {
    var k = listKey(p.list), l = (LS.lists[k] || []).filter(function (x) { return !x.done; });
    if (!l.length) return answer('La liste ' + listName(k) + ' est vide.').done;
    return answer({ say: 'Liste ' + listName(k) + ', ' + l.length + ' élément' + (l.length > 1 ? 's' : '') + ' : ' + l.map(function (x) { return x.t; }).join(', ') + '.', html: '<div class="k">Liste ' + esc(listName(k)) + '</div><ul>' + l.map(function (x) { return '<li>' + esc(x.t) + '</li>'; }).join('') + '</ul>' }).done;
  };
  H.list_remove = function (p) {
    var k = listKey(p.list), l = LS.lists[k] || [], it = l.filter(function (x) { return deacc(x.t).indexOf(deacc(p.item)) >= 0 || deacc(p.item).indexOf(deacc(x.t)) >= 0; })[0];
    if (!it) return answer('« ' + p.item + ' » n\'est pas sur la liste ' + listName(k) + '.').done;
    return ask('Retirer « ' + it.t + ' » de la liste ' + listName(k) + ' ?', 'yesno', { danger: true, yes: 'Retirer' }).then(function (ok) { if (!ok) return answer('Je le laisse.'); LS.lists[k] = l.filter(function (x) { return x !== it; }); saveLS(); answer(ack('Retiré.')); });
  };
  H.list_clear = function (p) {
    var k = listKey(p.list), l = LS.lists[k] || [];
    if (!l.length) return answer('La liste ' + listName(k) + ' est déjà vide.').done;
    return ask('Vider la liste ' + listName(k) + ' (' + l.length + ' élément' + (l.length > 1 ? 's' : '') + ') ?', 'yesno', { danger: true, yes: 'Vider' }).then(function (ok) { if (!ok) return answer('Je garde la liste.'); LS.lists[k] = []; saveLS(); answer(ack('Liste vidée.')); });
  };

  /* --- Budget : ajout seulement, jamais de solde --- */
  H.budget_balance = function () { return answer('Par discrétion, je ne lis jamais de solde ni de total de comptes. Ouvrez Budget pour les consulter.').done; };
  H.budget_add = function (p) {
    if (p.missing) return answer('De combien ? Dites par exemple : j\'ai dépensé 45 euros de carburant sur le compte courant.').done;
    var kind = p.type === 'rev' ? 'un revenu' : 'une dépense';
    var q = 'Ajouter ' + kind + ' de ' + euros(p.cents) + ', catégorie ' + p.catName + (p.account ? ', sur ' + p.account : '') + (p.date !== NLU.startOfDay(now()) ? ', ' + dayName(p.date) : '') + ' ?';
    return ask(q, 'yesno', { yes: 'Ajouter', k: 'Budget' }).then(function (ok) {
      if (!ok) return answer('Rien n\'a été ajouté.');
      if (PC) return budgetWritePC(p);
      if (P && P.homeLaunchWith) {
        if (P.homeInstalled && P.homeInstalled('fr.magformation13.budget') !== '1') return answer('L\'appli Budget n\'est pas installée.');
        P.homeLaunchWith('fr.magformation13.budget', JSON.stringify({ add: 1, type: p.type, amount: p.cents, cat: p.cat, acc: p.account || '', note: p.note || '', date: ymd(p.date), pay: p.pay || '', src: 'majordome' }));
        return answer('J\'ouvre Budget avec l\'opération remplie : touchez Ajouter pour l\'enregistrer.');
      }
      return answer('Budget n\'est pas joignable ici.');
    });
  };
  function budgetWritePC(p) {
    var raw = null; try { raw = localStorage.getItem('budget.v1'); } catch (e) { }
    var D = J(raw, null);
    if (!D || !Array.isArray(D.tx) || !Array.isArray(D.accounts)) return answer('Ouvrez Budget une première fois sur cet ordinateur, puis redemandez.');
    var live = D.accounts.filter(function (a) { return !a.archived; });
    var acc = null;
    if (p.account) { var want = deacc(p.account); acc = live.filter(function (a) { return deacc(a.name) === want; })[0] || live.filter(function (a) { return deacc(a.name).indexOf(want) >= 0 || want.indexOf(deacc(a.name)) >= 0; })[0]; }
    var go = function (a) {
      var cats = D.cats || [], cat = cats.filter(function (c) { return c.id === p.cat; })[0] || cats.filter(function (c) { return c.kind === p.type && /divers|autre/i.test(c.name); })[0] || cats.filter(function (c) { return c.kind === p.type; })[0];
      var st = D.set || (D.set = {});
      var tx = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), c: now(), date: ymd(p.date), type: p.type, amount: p.cents, cat: cat ? cat.id : null, acc: a.id, note: p.note || 'Ajouté par ' + S.name, pay: p.pay || st.lastPay || 'carte' };
      D.tx.push(tx); st.lastAcc = a.id;
      if (!lsSet('budget.v1', D)) return answer({ say: 'Impossible d\'écrire dans Budget : stockage plein.', cls: 'err' });
      return answer({ say: ack((p.type === 'rev' ? 'Revenu' : 'Dépense') + ' de ' + euros(p.cents) + ' ajouté' + (p.type === 'rev' ? '' : 'e') + ' dans Budget, compte ' + a.name + '.'), show: (p.type === 'rev' ? 'Revenu' : 'Dépense') + ' ajouté' + (p.type === 'rev' ? '' : 'e') + ' : ' + euros(p.cents) + ' · ' + (cat ? cat.name : '') + ' · ' + a.name });
    };
    if (acc) return go(acc);
    if (p.account && live.length > 1) return ask('Je ne trouve pas le compte « ' + p.account + ' ». Lequel ?', 'choice', { choices: live.map(function (a) { return a.name; }) }).then(function (k) { var a = live[(k || 0) - 1]; return a ? go(a) : answer('Rien n\'a été ajouté.'); });
    var def = live.filter(function (a) { return a.id === (D.set && (D.set.defAcc || D.set.lastAcc)); })[0] || live[0];
    return def ? go(def) : answer('Aucun compte dans Budget.');
  }

  /* --- Applis de la Suite, sites --- */
  function userActive() { try { return !!(navigator.userActivation && navigator.userActivation.isActive); } catch (e) { return false; } }
  function openLink(url, label) {
    if (PC && userActive() && window.MAGPC) { window.MAGPC.nativeOpen(url, '_blank'); return answer(ack('J\'ouvre ' + label + '.')).done; }
    if (B && B.openUrl && !PC) { B.openUrl(url); return answer(ack('J\'ouvre ' + label + '.')).done; }
    var c = answer({ say: 'Voici le lien vers ' + label + '.', html: '<p>' + esc(label) + '</p><div class="row"><a class="btn pri" href="' + esc(url) + '" target="_blank" rel="noopener" style="text-decoration:none">Ouvrir ' + esc(label) + '</a></div>' });
    return c.done;
  }
  // H.open_app, H.open_sys, H.domo : mj-applis.js (Suite, toutes les applis du téléphone, raccourcis du système)
  /* --- Climatisation : Majordome ne pilote pas la clim Panasonic (pas d'API officielle, pas d'infrarouge sur le téléphone).
     Il ouvre l'appli officielle Panasonic Comfort Cloud (com.panasonic.ACCsmart, visible grâce à <queries> du manifeste),
     ou propose le Play Store si elle manque ; pour un réglage, il renvoie honnêtement vers Alexa ou Comfort Cloud. */
  var CLIM_PKG = 'com.panasonic.ACCsmart', CLIM_STORE = 'https://play.google.com/store/apps/details?id=' + CLIM_PKG;
  function climInstalled() { return !!(P && P.homeInstalled && P.homeInstalled(CLIM_PKG) === '1'); }
  function climOpen(prefix) {
    if (PC) return answer({ say: (prefix || '') + 'Sur l\'ordinateur, je ne peux pas ouvrir Comfort Cloud : c\'est une appli du téléphone. Demandez à Alexa, ou utilisez le téléphone.', k: 'Climatisation' }).done;
    if (!(P && P.homeLaunch && P.homeInstalled)) return answer('Je ne peux pas ouvrir Comfort Cloud ici.').done;
    if (!climInstalled()) {
      var c = answer({ say: 'L\'appli Panasonic Comfort Cloud n\'est pas installée sur ce téléphone. Voici le lien du Play Store.', html: '<div class="k">Climatisation</div><p>L\'appli Panasonic Comfort Cloud n\'est pas installée sur ce téléphone.</p><div class="row"><button class="btn pri" data-clstore>Installer depuis le Play Store</button></div>' });
      c.querySelector('[data-clstore]').onclick = function () { if (B && B.openUrl) B.openUrl(CLIM_STORE); };
      return c.done;
    }
    P.homeLaunch(CLIM_PKG, '');
    return answer({ say: (prefix || '') + withSir('J\'ouvre Comfort Cloud') + '.', k: 'Climatisation' }).done;
  }
  H.clim = function (p) {
    if (p.act === 'open') return climOpen();
    var t = withSir('Je ne pilote pas la clim') + ' : demandez à Alexa' + (PC ? '.' : ', ou je peux ouvrir Comfort Cloud.');
    var c = answer({ say: t, html: '<div class="k">Climatisation</div><p>' + esc(t) + '</p>' + (PC ? '' : '<div class="row"><button class="btn pri" data-clopen>Ouvrir Comfort Cloud</button></div>') });
    var b = c.querySelector('[data-clopen]'); if (b) b.onclick = function () { climOpen(); };
    return c.done;
  };
  H.website = function (p) {
    if (p.unknown) return answer('Je ne connais pas le site « ' + p.unknown + ' ». Je n\'ouvre que les sites de ma liste, pour votre sécurité.').done;
    return openLink(p.url, p.name);
  };
  H.fullscreen = function (p) {
    var el = document.documentElement;
    if (!p.on) { if (document.fullscreenElement) document.exitFullscreen().catch(function () { }); return answer(ack()).done; }
    if (!el.requestFullscreen) return answer('Le plein écran n\'est pas disponible ici.').done;
    return el.requestFullscreen().then(function () { return answer(ack()).done; }, function () {
      var c = answer({ say: 'Le navigateur demande un clic pour passer en plein écran.', html: '<p>Le navigateur demande un clic pour passer en plein écran (ou touche F11).</p><div class="row"><button class="btn pri" data-fs>Plein écran</button></div>' });
      c.querySelector('[data-fs]').onclick = function () { el.requestFullscreen().catch(function () { }); };
    });
  };

  /* --- Musique --- */
  var MEL = 'fr.magformation13.musique', mediaCh = null;
  try { mediaCh = window.BroadcastChannel ? new BroadcastChannel('mag-media') : null; } catch (e) { }
  function pcMedia(cmd) {
    return new Promise(function (res) {
      if (!mediaCh) { res(false); return; }
      var done = false, h = function (e) { if (e.data && e.data.ack === cmd) { done = true; mediaCh.removeEventListener('message', h); res(true); } };
      mediaCh.addEventListener('message', h); mediaCh.postMessage({ cmd: cmd });
      setTimeout(function () { if (!done) { mediaCh.removeEventListener('message', h); res(false); } }, 700);
    });
  }
  H.music = function (p) {
    var lab = { start: 'Musique.', play: 'Lecture.', pause: 'Pause.', next: 'Morceau suivant.', prev: 'Morceau précédent.' }[p.cmd];
    if (PC) {
      return pcMedia(p.cmd === 'start' ? 'play' : p.cmd).then(function (ok) {
        if (ok) return answer(lab).done;
        var url = (window.MAGPC.conf.apps || {})[MEL];
        if (p.cmd === 'start' && url) return openLink(url, 'Mélodie');
        return answer('Mélodie n\'est pas ouverte sur cet ordinateur.').done;
      });
    }
    if (p.cmd === 'start' && P && P.homeLaunchWith) {
      if (P.homeInstalled && P.homeInstalled(MEL) !== '1') { if (B && B.media) { B.media('play'); return answer(lab).done; } return answer('Mélodie n\'est pas installée.').done; }
      P.homeLaunchWith(MEL, JSON.stringify({ play: 1, back: 1 })); return answer(ack('Je lance Mélodie.')).done;
    }
    if (B && B.media) { B.media(p.cmd === 'start' ? 'play' : p.cmd); return answer(lab).done; }
    return answer('Je ne peux pas piloter la musique ici.').done;
  };

  /* --- Téléphone --- */
  function phoneOnly() { return answer(PC ? 'Je ne peux pas faire cela depuis l\'ordinateur : c\'est une commande du téléphone.' : 'Cette commande n\'est disponible que sur le téléphone.').done; }
  function findContact(name) {
    if (!P || !P.homeContacts) return Promise.resolve(null);
    var r = P.homeContacts(name);
    if (r === 'null') { if (P.homeAsk) P.homeAsk('contacts'); answer('J\'ai besoin de l\'accès à vos contacts : autorisez-le, puis redemandez.'); return Promise.resolve(false); }
    var l = J(r, []);
    if (!l.length) { answer('Je ne trouve pas « ' + name + ' » dans vos contacts.'); return Promise.resolve(false); }
    if (l.length === 1) return Promise.resolve(l[0]);
    return ask('J\'ai trouvé ' + l.length + ' contacts. Lequel ?', 'choice', { choices: l.map(function (c) { return c.name + ' (' + c.num + ')'; }) }).then(function (k) { return l[(k || 0) - 1] || false; });
  }
  H.call = function (p) {
    if (!ANDROID || !B.call) return phoneOnly();
    var who = p.number ? Promise.resolve({ name: p.number, num: p.number }) : findContact(p.to);
    return who.then(function (c) {
      if (!c) return;
      return ask('Appeler ' + c.name + (c.name !== c.num ? ' au ' + c.num : '') + ' ?', 'yesno', { yes: 'Appeler', k: 'Appel' }).then(function (ok) {
        if (!ok) return answer('Appel annulé.');
        B.call(c.num); return answer('J\'appelle ' + c.name + '.');
      });
    });
  };
  H.sms = function (p) {
    if (!ANDROID || !B.sms) return phoneOnly();
    var c0, text = p.text;
    var who = p.number ? Promise.resolve({ name: p.number, num: p.number }) : findContact(p.to);
    return who.then(function (c) {
      if (!c) return; c0 = c;
      return (text ? Promise.resolve(text) : ask('Que voulez-vous écrire à ' + c.name + ' ?', 'text')).then(function (x) {
        text = x; if (!text) return answer('Message annulé.');
        return ask('J\'envoie à ' + c0.name + ' : « ' + text + ' ». Je confirme ?', 'yesno', { yes: 'Envoyer', k: 'SMS' }).then(function (ok) {
          if (!ok) return answer('Message annulé.');
          B.sms(c0.num, text); return answer('Envoi en cours…');
        });
      });
    });
  };
  H.torch = function (p) {
    if (!P || !P.homeTorch || PC) return phoneOnly();
    var r = P.homeTorch(!!p.on); return answer(r && /err|non/i.test(r) ? 'Lampe indisponible.' : ack(p.on ? 'Lampe allumée.' : 'Lampe éteinte.')).done;
  };
  H.volume = function (p) {
    if (PC) {
      if (p.dir === 'query') return answer('Volume de ma voix : ' + Math.round((S.volume || 1) * 100) + ' %.').done;
      S.volume = p.dir === 'mute' ? 0.05 : p.dir === 'max' ? 1 : p.dir === 'set' ? Math.max(0.05, Math.min(1, p.level / 100)) : Math.max(0.05, Math.min(1, (S.volume || 1) + (p.dir === 'up' ? 0.2 : -0.2)));
      saveS(); return answer('Volume de ma voix et des bips : ' + Math.round(S.volume * 100) + ' %. Le volume de Windows se règle avec les touches du clavier.').done;
    }
    if (!B || !B.volume) return phoneOnly();
    var r = J(B.volume(JSON.stringify(p)), {});
    if (r.err) return answer({ say: r.err, cls: 'err' }).done;
    return answer(p.dir === 'mute' ? ack('Son coupé.') : 'Volume ' + (p.stream === 'ring' ? 'de la sonnerie' : p.stream === 'alarm' ? 'des alarmes' : 'multimédia') + ' : ' + Math.round(100 * r.level / Math.max(1, r.max)) + ' %.').done;
  };
  H.silent = function (p) {
    if (!B || !B.ringer || PC) return phoneOnly();
    if (p.mode === 'avion') { B.panel('airplane'); return answer('Android ne permet pas à une appli de changer le mode avion : j\'ouvre le réglage.').done; }
    var r = J(B.ringer(p.off ? 'normal' : p.mode), {});
    if (r.need === 'dnd') return answer('Autorisez « Ne pas déranger » pour ' + S.name + ' dans le réglage qui s\'ouvre, puis redemandez.').done;
    return answer(r.ok ? ack(p.off || p.mode === 'normal' ? 'Sonnerie rétablie.' : p.mode === 'vibrate' ? 'Mode vibreur.' : p.mode === 'dnd' ? 'Ne pas déranger activé.' : 'Mode silencieux.') : 'Je n\'ai pas pu changer le mode.').done;
  };
  H.wifi = function (p) { if (!B || !B.panel || PC) return phoneOnly(); B.panel('wifi'); return answer('Android impose de passer par le panneau Wi-Fi : je l\'ouvre' + (p.on === false ? ', touchez l\'interrupteur pour le couper.' : '.')).done; };
  H.bluetooth = function (p) { if (!B || !B.panel || PC) return phoneOnly(); B.panel('bluetooth'); return answer('Android impose de passer par le réglage Bluetooth : je l\'ouvre.').done; };
  H.battery = function () {
    if (P && P.homeBattery && !PC) { var b = J(P.homeBattery(), {}); if (b.level >= 0) return answer('Batterie à ' + b.level + ' %' + (b.plugged ? ', en charge' : '') + '.').done; }
    if (navigator.getBattery) return navigator.getBattery().then(function (b) { return answer('Batterie à ' + Math.round(b.level * 100) + ' %' + (b.charging ? ', en charge' : '') + '.').done; });
    return answer('Je ne connais pas le niveau de la batterie ici.').done;
  };

  /* --- Écoute, réglages, historique, aide --- */
  H.listen_off = function () {
    shush(); stopListen();
    if (S.wakeOn) { S.wakeOn = false; saveS(); applyWake(); return answer(withSir('Écoute continue arrêtée') + '. Touchez le micro quand vous aurez besoin de moi.').done; }
    return answer('L\'écoute continue est déjà arrêtée.').done;
  };
  H.listen_on = function () {
    if (!B || !B.wake) return answer('L\'écoute continue n\'est pas disponible ici.').done;
    if (!engineReady() || S.engine !== 'vosk') return answer('L\'écoute continue demande le modèle vocal hors ligne. Installez-le dans les réglages.').done;
    S.wakeOn = true; saveS(); applyWake();
    return answer(ack('Je vous écoute en continu : dites « ' + S.name + ' » pour m\'appeler.')).done;
  };
  H.voice = function (p) {
    if (p.rate) S.rate = Math.max(0.6, Math.min(1.6, (S.rate || 1) + p.rate * 0.12));
    if (p.pitch) S.pitch = Math.max(0.6, Math.min(1.6, (S.pitch || 1) + p.pitch * 0.12));
    if (p.volume) S.volume = Math.max(0.1, Math.min(1, (S.volume || 1) + p.volume * 0.2));
    saveS(); return answer(ack('Comme ceci ?')).done;
  };
  H.settings = function (p) { settingsSheet(p.panel); return answer('Voici les réglages.').done; };
  H.address = function (p) {
    S.address = p.mode === 'madame' ? 'madame' : p.mode === 'monsieur' ? 'monsieur' : p.mode === 'rien' ? 'rien' : 'prenom';
    if (p.name) S.prenom = cap(p.name);
    saveS(); return answer(S.address === 'rien' ? 'Entendu.' : ack()).done;
  };
  H.history_clear = function () {
    return ask('Effacer tout l\'historique des commandes ?', 'yesno', { danger: true, yes: 'Effacer' }).then(function (ok) {
      if (!ok) return answer('Je garde l\'historique.');
      lsSet(KEY.hist, []); MJ.cur = null; answer(ack('Historique effacé.'));
    });
  };
  H.help = function () {
    helpSheet();
    return answer('Je comprends des commandes : l\'heure et la date, les calculs et conversions, les minuteurs, réveils et rappels, la météo et le vent, les titres de l\'actualité, votre agenda, vos notes et listes, les dépenses de Budget, l\'ouverture des applis, la musique' + (ANDROID ? ', les lumières Philips Hue, et sur le téléphone les appels, SMS, lampe, volume et modes' : '') + '. La liste d\'exemples est affichée.').done;
  };

  /* --- Routines --- */
  var STEPS = { salut: 'Salutation', heure: 'Heure', date: 'Date', meteo: 'Météo du jour', vent: 'Vent (échafaudage)', vigilance: 'Vigilance météo', agenda: 'Agenda du jour', titres: '3 titres de l\'actualité', rappels: 'Rappels', liste: 'Liste de courses', musique: 'Lancer la musique', reveil: 'Réveil de demain', bonnenuit: 'Bonne nuit', ecoute_off: 'Couper l\'écoute continue', lampe_off: 'Éteindre la lampe', silencieux: 'Mode silencieux' };
  function stepLabel(s) { return /^lum:/.test(s) ? 'Lumières : ' + s.slice(4) : STEPS[s] || s; }
  function runStep(s) {
    var t0 = NLU.startOfDay(now());
    switch (s) {
      case 'salut': var h = new Date(now()).getHours(); return answer(withSir(h < 18 ? 'Bonjour' : 'Bonsoir') + '.').done;
      case 'bonnenuit': return answer(withSir('Bonne nuit') + '.').done;
      case 'heure': return H.time();
      case 'date': return H.date({ offset: 0 });
      case 'meteo': return H.weather({ when: 'today' });
      case 'vent': return H.wind({ when: 'today', scaffold: true });
      case 'vigilance': return H.vigilance({});
      case 'agenda': return H.agenda({ from: t0, to: t0 + DAY });
      case 'titres': return H.news({ rub: 'titres', n: 3 });
      case 'rappels': return H.reminder_list();
      case 'liste': return H.list_read({ list: 'courses' });
      case 'musique': return H.music({ cmd: 'start' });
      case 'reveil': {
        var tm = t0 + DAY, l = AL.filter(function (o) { return o.kind === 'alarm' && o.at >= tm && o.at < tm + DAY; }).sort(function (a, b) { return a.at - b.at; });
        var sys = P && P.homeAlarm && ANDROID ? J(P.homeAlarm(), {}) : {};
        if (l.length) return answer('Votre réveil sonnera demain à ' + hmSay(l[0].at) + '.').done;
        if (sys.at && sys.at >= tm && sys.at < tm + DAY) return answer('Le réveil du téléphone sonnera demain à ' + hmSay(sys.at) + '.').done;
        return answer('Aucun réveil prévu demain.').done;
      }
      case 'ecoute_off': if (S.wakeOn) { S.wakeOn = false; saveS(); applyWake(); return answer('J\'arrête d\'écouter. Touchez le micro pour me réveiller.').done; } return Promise.resolve();
      case 'lampe_off': return P && P.homeTorch && ANDROID ? (P.homeTorch(false), Promise.resolve()) : Promise.resolve();
      case 'silencieux': return H.silent({ mode: 'silent' });
    }
    if (/^lum:/.test(s) && MJ.lightStep) return MJ.lightStep(s.slice(4));
    return Promise.resolve();
  }
  H.routine = function (p) {
    var r = S.routines.filter(function (x) { return x.id === p.id || (p.name && deacc(x.name) === deacc(p.name)); })[0];
    if (!r) return answer('Je ne connais pas la routine « ' + (p.name || p.id) + ' ». Vous pouvez la créer dans les réglages.').done;
    var chain = Promise.resolve();
    (r.steps || []).forEach(function (s) { chain = chain.then(function () { return Promise.resolve(runStep(s)).catch(function () { }); }); });
    // montre connectée : résumé du matin après « Bonjour » (mj-montre.js)
    return chain.then(function () { if (MJ.onRoutine) return Promise.resolve(MJ.onRoutine(r)).catch(function (e) { console.warn(e); }); });
  };

  /* ---------------- Écoute continue (mot de réveil) ---------------- */
  function applyWake() {
    if (!B || !B.wake) return;
    var on = !!S.wakeOn && S.engine === 'vosk' && INFO.model && INFO.model.state === 'ready';
    try { B.wake(JSON.stringify({ on: on, words: wakeWords(), charging: !!S.wakeCharging, name: S.name })); } catch (e) { }
    chips();
  }

  /* ---------------- Puces d'état ---------------- */
  function chips() {
    var h = '', m = INFO.model || {};
    if (!B || !B.listen) h += '<span class="chip warn"><b></b>Clavier seulement</span>';
    else if (S.engine === 'vosk') h += m.state === 'ready' ? '<button class="chip on" data-chip="model"><b></b>Vosk · hors ligne</button>' : m.state === 'downloading' || m.state === 'extracting' ? '<button class="chip warn" data-chip="model"><b></b>Modèle ' + Math.round((m.progress || 0) * 100) + ' %</button>' : '<button class="chip bad" data-chip="model"><b></b>Modèle vocal à installer</button>';
    else if (S.engine === 'web') h += '<button class="chip warn" data-chip="engine"><b></b>Web Speech · en ligne</button>';
    else if (S.engine === 'android') h += '<button class="chip warn" data-chip="engine"><b></b>Reconnaissance Android</button>';
    if (B && B.wake) h += '<button class="chip ' + (S.wakeOn && m.state === 'ready' ? 'on' : '') + '" data-chip="wake"><b></b>Écoute continue ' + (S.wakeOn && m.state === 'ready' ? '« ' + esc(S.name) + ' »' : 'coupée') + '</button>';
    if (!online()) h += '<span class="chip warn"><b></b>Hors ligne</span>';   // réseau présent : rien à signaler (place gagnée sur les petits écrans)
    $('chips').innerHTML = h;
    $('hint').textContent = !B || !B.listen ? '' : PC ? 'Ctrl+Espace : parler · Entrée : envoyer' : '';
  }
  $('chips').addEventListener('click', function (e) {
    var c = e.target.closest('[data-chip]'); if (!c) return;
    if (c.dataset.chip === 'model') modelSheet(); else if (c.dataset.chip === 'wake') settingsSheet('ecoute'); else settingsSheet('moteur');
  });
  window.addEventListener('online', chips); window.addEventListener('offline', chips);

  /* ---------------- Panneaux ---------------- */
  var curSheet = '';
  function openSheet(title, html, id) {
    curSheet = id || ''; $('shT').textContent = title; $('shB').innerHTML = html; $('sheet').classList.add('on'); $('veil').classList.add('on');
    if (!history.state || !history.state.mjSheet) try { history.pushState({ mjSheet: 1 }, ''); } catch (e) { }
    return $('shB');
  }
  function closeSheet(fromPop) { if (!curSheet && !$('sheet').classList.contains('on')) return; curSheet = ''; $('sheet').classList.remove('on'); $('veil').classList.remove('on'); if (!fromPop && history.state && history.state.mjSheet) try { history.back(); } catch (e) { } }
  window.addEventListener('popstate', function () { if ($('sheet').classList.contains('on')) closeSheet(true); });
  $('shX').onclick = function () { closeSheet(); }; $('veil').onclick = function () { closeSheet(); };
  MJ.closeSheet = closeSheet;

  var HELP = [
    ['Heure et dates', ['Quelle heure est-il ?', 'Quel jour sommes-nous ?', 'Dans combien de jours est Noël ?', 'Quel jour tombe le 14 juillet ?']],
    ['Calculs et conversions', ['Combien font 15 % de 240 ?', 'Combien font 12 fois 8 ?', 'Racine carrée de 144', 'Convertis 2 pouces en millimètres', '1 pouce et demi en mm', '20 degrés Celsius en Fahrenheit', 'Combien de psi font 6 bars ?', '3 tonnes en kilos']],
    ['Minuteurs, réveils, rappels', ['Mets un minuteur de 10 minutes', 'Minuteur de 8 minutes pour les pâtes', 'Combien de temps reste-t-il ?', 'Lance le chronomètre', 'Réveille-moi demain à 6 h 30', 'Rappelle-moi d\'appeler le plombier à 17 h', 'Rappelle-moi dans 20 minutes de sortir le linge', 'Quels sont mes rappels ?']],
    ['Météo et vent', ['Quel temps fait-il ?', 'La météo de demain', 'Est-ce qu\'il va pleuvoir ?', 'Quel temps à Marseille demain ?', 'Y a-t-il du vent pour monter l\'échafaudage ?', 'Y a-t-il une vigilance météo ?', 'La météo de la semaine']],
    ['Actualités', ['Les titres', 'L\'essentiel', 'Les titres du sport']],
    ['Agenda', ['Qu\'est-ce que j\'ai aujourd\'hui ?', 'Qu\'est-ce que j\'ai demain ?', 'Mon prochain rendez-vous', 'Ajoute un rendez-vous chez le dentiste jeudi à 14 h']],
    ['Notes et listes', ['Note : commander les vis de 6', 'Ajoute du pain à la liste de courses', 'Lis ma liste de courses', 'Enlève le pain de la liste', 'Lis mes notes']],
    ['Budget (jamais de solde lu)', ['J\'ai dépensé 45 euros de carburant sur le compte courant', 'J\'ai payé 12,50 € au restaurant par carte']],
    ['Applis et sites', ['Ouvre Présentation', 'Ouvre le tableur', 'Ouvre le lecteur PDF', 'Ouvre Rangement', 'Ouvre YouTube'].concat(ANDROID ? ['Ouvre WhatsApp', 'Lance Waze', 'Ouvre le GPS', 'Ouvre l\'appareil photo', 'Ouvre les paramètres Wi-Fi', 'Ouvre le Play Store'] : []).concat(PC ? ['Plein écran'] : [])],
    ['Climatisation' + (ANDROID ? '' : ' (sur le téléphone seulement)'), ['Ouvre la clim', 'Ouvre Comfort Cloud']],
    ['Musique', ['Mets de la musique', 'Pause', 'Chanson suivante', 'Morceau précédent']],
    ['Téléphone' + (ANDROID ? '' : ' (sur le téléphone seulement)'), ['Appelle Paul', 'Envoie un SMS à Paul : j\'arrive dans 10 minutes', 'Allume la lampe', 'Monte le son', 'Mode silencieux', 'Ne pas déranger', 'Active le Wi-Fi', 'Ouvre le Bluetooth', 'Niveau de batterie']],
    ['Routines et réglages', ['Bonjour ' + (S.name || 'Majordome'), 'Bonne nuit', 'Parle plus lentement', 'Appelle-moi Gilbert', 'Arrête d\'écouter', 'Efface l\'historique', 'Répète', 'Stop']]
  ];
  function helpSheet() {
    var h = '<p class="note">Je ne suis pas une intelligence artificielle : je reconnais une liste de commandes, dites de façon souple (synonymes, ordre libre, nombres en lettres). Touchez un exemple pour l\'essayer. Pour me parler : le micro, ' + (PC ? 'Ctrl+Espace, ' : '') + (B && B.wake ? 'ou « ' + esc(S.name) + ' » si l\'écoute continue est active, ' : '') + 'ou tapez la commande.</p>';
    HELP.forEach(function (g) { h += '<div class="sect">' + esc(g[0]) + '</div><div class="ex">' + g[1].map(function (x) { return '<button data-ex="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>'; });
    h += '<div class="sect">Sécurité</div><p class="note">Appeler, envoyer un SMS, supprimer ou ajouter une dépense demandent toujours une confirmation (à la voix : « oui » / « non », ou en touchant le bouton). Une commande inconnue reçoit une réponse honnête : « Je ne sais pas encore faire ça ».</p>';
    var b = openSheet('Ce que je sais faire', h, 'help');
    b.onclick = function (e) { var x = e.target.closest('[data-ex]'); if (x) { closeSheet(); handle(x.dataset.ex, 'click'); } };
  }
  MJ.helpSheet = helpSheet;
  $('bHelp').onclick = helpSheet;

  function histSheet() {
    var l = lsGet(KEY.hist, []).slice().reverse();
    var h = '<div class="set"><div class="t">Garder l\'historique<small>Seulement sur cet appareil, jamais envoyé.</small></div><label class="sw"><input type="checkbox" id="hOn"' + (S.history ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="row" style="display:flex;gap:8px;margin:12px 0"><button class="btn sm" id="hClr">Effacer l\'historique</button></div>' +
      '<div class="hist">' + (l.length ? l.slice(0, 200).map(function (x) { return '<div><time>' + new Date(x.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</time><b>' + esc(x.q) + '</b><br><span>' + esc(x.a) + '</span></div>'; }).join('') : '<p class="note">Aucune commande enregistrée.</p>') + '</div>';
    openSheet('Historique', h, 'hist');
    $('hOn').onchange = function () { S.history = this.checked; saveS(); };
    $('hClr').onclick = function () { closeSheet(); handle('efface l\'historique', 'click'); };
  }
  $('bHist').onclick = histSheet;

  function listsSheet() {
    var h = '<div class="sect">Notes</div>' + (LS.notes.length ? LS.notes.map(function (n) { return '<div class="li"><span>' + esc(n.t) + '</span><button class="btn sm" data-dn="' + n.id + '">Supprimer</button></div>'; }).join('') : '<p class="note">Aucune note. Dites « note : … ».</p>');
    var keys = Object.keys(LS.lists).filter(function (k) { return LS.lists[k].length; });
    if (!keys.length) h += '<div class="sect">Listes</div><p class="note">Aucune liste. Dites « ajoute du pain à la liste de courses ».</p>';
    keys.forEach(function (k) { h += '<div class="sect">Liste ' + esc(listName(k)) + '</div>' + LS.lists[k].map(function (x) { return '<div class="li' + (x.done ? ' done' : '') + '"><label class="sw"><input type="checkbox" data-tg="' + k + '|' + x.id + '"' + (x.done ? ' checked' : '') + '><span></span></label><span>' + esc(x.t) + '</span><button class="btn sm" data-dl="' + k + '|' + x.id + '">Retirer</button></div>'; }).join(''); });
    h += '<p class="note" style="margin-top:14px">Notes et listes restent dans ' + esc(S.name) + ', sur cet appareil.' + (ANDROID ? ' Elles ne sont pas copiées dans Carnet.' : '') + '</p>';
    var b = openSheet('Notes et listes', h, 'lists');
    b.onclick = function (e) {
      var d = e.target.closest('[data-dn]'); if (d && confirm('Supprimer cette note ?')) { LS.notes = LS.notes.filter(function (n) { return n.id !== d.dataset.dn; }); saveLS(); listsSheet(); return; }
      var r = e.target.closest('[data-dl]'); if (r) { var a = r.dataset.dl.split('|'); LS.lists[a[0]] = LS.lists[a[0]].filter(function (x) { return x.id !== a[1]; }); saveLS(); listsSheet(); }
    };
    b.onchange = function (e) { var t = e.target.closest('[data-tg]'); if (!t) return; var a = t.dataset.tg.split('|'); LS.lists[a[0]].forEach(function (x) { if (x.id === a[1]) x.done = t.checked; }); saveLS(); };
  }
  $('bLists').onclick = listsSheet;

  /* Modèle vocal */
  function modelHtml() {
    var m = INFO.model || {}, h = '';
    h += '<p class="note">La reconnaissance se fait <b>sur cet appareil, sans internet</b>, avec Vosk (Alpha Cephei, licence Apache 2.0) et son petit modèle français <b>vosk-model-small-fr-0.22</b> (environ 41 Mo, licence Apache 2.0). Il se télécharge une seule fois depuis le site officiel alphacephei.com, puis reste en mémoire.</p>';
    if (m.state === 'ready') h += '<p><b style="color:var(--ok)">Modèle installé</b>' + (m.size ? ' · ' + Math.round(m.size / 1048576) + ' Mo' : '') + '</p><div class="row" style="display:flex;gap:8px"><button class="btn sm" id="mDel">Supprimer le modèle</button></div>';
    else if (m.state === 'downloading' || m.state === 'extracting') h += '<p>' + (m.state === 'extracting' ? 'Installation…' : 'Téléchargement…') + ' ' + Math.round((m.progress || 0) * 100) + ' %</p><div class="bar"><i style="width:' + Math.round((m.progress || 0) * 100) + '%"></i></div>';
    else {
      if (m.state === 'error' && m.msg) h += '<p class="note warn">' + esc(m.msg) + '</p>';
      h += '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="mDl">Télécharger le modèle (41 Mo)</button><button class="btn" id="mPick">Choisir le fichier du modèle…</button></div>';
      h += '<p class="note">Si le téléchargement direct est refusé (réseau, pare-feu ou site qui bloque la lecture depuis une page web), téléchargez le fichier <a href="https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip" target="_blank" rel="noopener">vosk-model-small-fr-0.22.zip</a> avec le navigateur, puis « Choisir le fichier du modèle ».</p>';
    }
    return h;
  }
  function modelUi() { if (curSheet === 'model') { $('shB').innerHTML = modelHtml(); bindModel(); } }
  function bindModel() {
    var a = $('mDl'), b = $('mPick'), c = $('mDel');
    if (a) a.onclick = function () { if (B && B.modelDownload) B.modelDownload(); };
    if (b) b.onclick = function () { if (B && B.modelPick) B.modelPick(); };
    if (c) c.onclick = function () { if (confirm('Supprimer le modèle vocal ? Il faudra le retélécharger pour me parler.')) { B.modelDelete(); refreshInfo(); S.wakeOn = false; saveS(); applyWake(); modelUi(); } };
  }
  function modelSheet() { refreshInfo(); openSheet('Modèle vocal', modelHtml(), 'model'); bindModel(); }
  MJ.modelSheet = modelSheet;

  function permsHtml() {
    var p = J(B.perms(), {}), rows = [['mic', 'Micro', 'Pour vous entendre'], ['notif', 'Notifications', 'Minuteurs, réveils et rappels, écoute continue'], ['exact', 'Alarmes exactes', 'Réveils et minuteurs à l\'heure près'], ['contacts', 'Contacts', 'Pour « appelle Paul »'], ['phone', 'Téléphone', 'Passer l\'appel après votre confirmation'], ['sms', 'SMS', 'Envoyer après votre confirmation'], ['calendar', 'Agenda', 'Lire et ajouter des rendez-vous'], ['location', 'Position', 'Météo de l\'endroit où vous êtes'], ['dnd', 'Ne pas déranger', 'Mode silencieux et ne pas déranger'], ['overlay', 'Affichage par-dessus', 'Répondre tout de suite après « ' + S.name + ' », téléphone en veille'], ['battery', 'Sans optimisation de batterie', 'Écoute continue fiable (consomme plus)']];
    if (p.assist !== undefined) rows.push(['assist', 'Assistant du téléphone', 'Appui long sur le bouton d\'accueil (ou geste d\'assistant) : ' + S.name + ' vous écoute. Dans Applis par défaut › Assistant numérique, choisissez « Majordome »', 'Choisir']);
    return '<p class="note">Chaque autorisation est demandée seulement quand elle sert. Rien n\'est envoyé sur internet en dehors de la météo, des titres et du téléchargement du modèle.</p>' + rows.map(function (r) { return '<div class="set"><div class="t">' + esc(r[1]) + '<small>' + esc(r[2]) + '</small></div>' + (p[r[0]] ? '<span class="chip on"><b></b>OK</span>' : '<button class="btn sm" data-fix="' + r[0] + '">' + esc(r[3] || 'Autoriser') + '</button>') + '</div>'; }).join('');
  }
  function assistRow() {
    var p = J(B && B.perms ? B.perms() : '{}', {}) || {};
    if (p.assist === undefined) return '';
    return '<div class="set"><div class="t">Assistant du téléphone<small>' + (p.assist ? 'Actif : un appui long sur le bouton d\'accueil me fait écouter.' : 'Appui long sur le bouton d\'accueil : choisissez « Majordome » comme assistant numérique (Applis par défaut).') + '</small></div>' + (p.assist ? '<span class="chip on"><b></b>OK</span>' : '<button class="btn sm" data-fix="assist">Choisir</button>') + '</div>';
  }
  function permsSheet() { var b = openSheet('Autorisations', permsHtml(), 'perms'); b.onclick = function (e) { var f = e.target.closest('[data-fix]'); if (f) B.fix(f.dataset.fix); }; }

  function settingsSheet(focus) {
    refreshInfo();
    var vs = frVoices(), m = INFO.model || {};
    var voxPanel = VX ? MJVoix.panel(VX, S, { save: saveS, android: ANDROID, refresh: function () { settingsSheet('voix'); }, preview: function (id) { shush(); VX.preview(id, { rate: S.rate, pitch: S.pitch, volume: S.volume, fx: S.fx, fxo: S.fxo }, { onLevel: function (v) { orb.voice(v); } }).then(function () { orb.speak(false); orb.state('idle'); }, function () { orb.speak(false); }); },
      systemHtml: '<div class="set"><div class="t">Voix française<small>' + (vs.length ? vs.length + ' voix du système' : 'Aucune voix française trouvée : installez-en une dans les réglages du système') + '</small></div><select class="in" id="sVoice"><option value="">Par défaut</option>' + vs.map(function (v) { return '<option value="' + esc(v.id) + '"' + (v.id === S.voice ? ' selected' : '') + '>' + esc(v.name + (v.local === false ? ' (en ligne)' : '')) + '</option>'; }).join('') + '</select></div>' }) : { html: '<div class="set"><div class="t">Voix française<small>' + (vs.length ? vs.length + ' voix du système' : 'Aucune voix française trouvée : installez-en une dans les réglages du système') + '</small></div><select class="in" id="sVoice"><option value="">Par défaut</option>' + vs.map(function (v) { return '<option value="' + esc(v.id) + '"' + (v.id === S.voice ? ' selected' : '') + '>' + esc(v.name + (v.local === false ? ' (en ligne)' : '')) + '</option>'; }).join('') + '</select></div>', bind: function () { } };
    var h = '<div class="sect">Assistant</div>' +
      '<div class="set"><div class="t">Nom de l\'assistant<small>Affiché et utilisé comme mot de réveil. Ex. « Jarvis » pour votre usage personnel : gardé sur cet appareil seulement.</small></div></div><input class="in" id="sName" maxlength="24" value="' + esc(S.name) + '">' +
      '<div class="set"><div class="t">Autres mots de réveil<small>Séparés par des virgules (facultatif)</small></div></div><input class="in" id="sWake" maxlength="80" value="' + esc(S.wake) + '" placeholder="ex. jarvis, maestro">' +
      '<div class="set"><div class="t">Je vous appelle</div><select class="in" id="sAddr"><option value="monsieur">Monsieur</option><option value="madame">Madame</option><option value="prenom">Par votre prénom</option><option value="rien">Rien</option></select></div>' +
      '<div id="sPrenomBox"' + (S.address === 'prenom' ? '' : ' hidden') + '><input class="in" id="sPrenom" maxlength="30" placeholder="Votre prénom" value="' + esc(S.prenom) + '"></div>' +
      '<div class="sect" id="f-voix">Voix</div>' +
      '<div class="set"><div class="t">Répondre à voix haute</div><label class="sw"><input type="checkbox" id="sVoiceOn"' + (S.voiceOn ? ' checked' : '') + '><span></span></label></div>' +
      voxPanel.html +
      '<div class="set"><div class="t">Vitesse</div><input type="range" id="sRate" min="0.6" max="1.6" step="0.05" value="' + S.rate + '"></div>' +
      '<div class="set"><div class="t">Hauteur</div><input type="range" id="sPitch" min="0.6" max="1.6" step="0.05" value="' + S.pitch + '"></div>' +
      '<div class="set"><div class="t">Volume (voix et bips)</div><input type="range" id="sVol" min="0.1" max="1" step="0.05" value="' + S.volume + '"></div>' +
      '<div class="set"><div class="t">Bips d\'écoute</div><label class="sw"><input type="checkbox" id="sBeeps"' + (S.beeps ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="row" style="display:flex;gap:8px"><button class="btn sm" id="sTest">Essayer la voix</button></div>' +
      '<div class="sect" id="f-moteur">Reconnaissance vocale</div>';
    var opts = [['vosk', 'Vosk, hors ligne (recommandé)']];
    if (INFO.android) opts.push(['android', 'Reconnaissance d\'Android (hors ligne si possible)']);
    if (INFO.web) opts.push(['web', 'Web Speech d\'Edge / Chrome (en ligne)']);
    h += '<div class="set"><div class="t">Moteur</div><select class="in" id="sEng">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (S.engine === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<p class="note warn" id="sEngWarn"' + (S.engine === 'vosk' ? ' hidden' : '') + '>' + (S.engine === 'web' ? 'Attention : la Web Speech API envoie l\'audio de vos commandes aux serveurs de Microsoft (Edge) ou de Google (Chrome).' : 'La reconnaissance d\'Android peut envoyer l\'audio à Google si le pack hors ligne français n\'est pas installé.') + '</p>' +
      (INFO.web ? '<div class="set" id="sWebBox"' + (S.engine === 'web' ? '' : ' hidden') + '><div class="t">J\'accepte que l\'audio parte chez Microsoft ou Google</div><label class="sw"><input type="checkbox" id="sWebOk"' + (S.webOk ? ' checked' : '') + '><span></span></label></div>' : '') +
      '<div class="set"><div class="t">Modèle vocal Vosk<small>' + (m.state === 'ready' ? 'Installé' : 'Non installé') + '</small></div><button class="btn sm" id="sModel">Gérer</button></div>' +
      '<div class="set"><div class="t">Réécouter après une question<small>Pour répondre « oui » ou « non » à la voix</small></div><label class="sw"><input type="checkbox" id="sAuto"' + (S.autoListen ? ' checked' : '') + '><span></span></label></div>';
    if (B && B.wake) h += '<div class="sect" id="f-ecoute">Écoute continue</div>' +
      '<div class="set"><div class="t">Mot de réveil « ' + esc(S.name) + ' »<small>' + (ANDROID ? 'Service au premier plan avec une notification. Consomme de la batterie.' : 'Tant que la fenêtre est ouverte (même en arrière-plan). Le navigateur affiche que le micro est utilisé.') + '</small></div><label class="sw"><input type="checkbox" id="sWakeOn"' + (S.wakeOn ? ' checked' : '') + '><span></span></label></div>' +
      (ANDROID ? '<div class="set"><div class="t">Seulement en charge<small>Écoute en pause quand le téléphone n\'est pas branché</small></div><label class="sw"><input type="checkbox" id="sWakeChg"' + (S.wakeCharging ? ' checked' : '') + '><span></span></label></div>' : '');
    h += '<div class="sect" id="f-meteo">Météo</div>' +
      '<div class="set"><div class="t">Utiliser ma position<small>Sinon, la ville choisie</small></div><label class="sw"><input type="checkbox" id="sGps"' + (S.gps ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="set"><div class="t">Ville<small>' + esc(S.place ? S.place.name + (S.place.admin ? ', ' + S.place.admin : '') : 'Aucune') + '</small></div></div><div style="display:flex;gap:8px"><input class="in" id="sCity" placeholder="Rechercher une ville"><button class="btn sm" id="sCityGo">Choisir</button></div>' +
      '<div class="set"><div class="t">Seuil de vent (rafales) pour l\'échafaudage<small>Au-dessus : « vent fort, prudence ». À adapter aux consignes du fabricant et du chantier.</small></div><input class="in" id="sWind" type="number" min="20" max="120" step="1" style="width:90px" value="' + (+S.windLimit || 45) + '"> km/h</div>' +
      '<div class="sect">Routines</div>' + S.routines.map(function (r, i) { return '<div class="set"><div class="t">' + esc(r.name) + '<small>« ' + esc(r.phrase) + ' » : ' + esc((r.steps || []).map(stepLabel).join(', ')) + '</small></div><button class="btn sm" data-rt="' + i + '">Modifier</button></div>'; }).join('') +
      '<div class="row" style="display:flex;gap:8px;margin-top:8px"><button class="btn sm" id="sRtNew">Nouvelle routine</button></div>' +
      (ANDROID ? '<div class="sect">Téléphone</div><div class="set"><div class="t">Autorisations</div><button class="btn sm" id="sPerms">Voir</button></div>' + assistRow() : '') +
      (MJ.settingsExtra ? MJ.settingsExtra() : '') + homeHtml() +
      '<div class="sect">Vie privée</div><p class="note">Tout reste sur cet appareil : réglages, historique, notes, listes, minuteurs. Les seules connexions sont la météo (Open-Meteo), les titres (franceinfo), la vigilance (MeteoAlarm) et le téléchargement unique du modèle vocal (alphacephei.com) et des voix Piper choisies (huggingface.co)' + (ANDROID ? ' ; le pont Philips Hue est joint sur le réseau local seulement (et, si vous le demandez, la recherche du pont sur discovery.meethue.com)' : '') + '.</p>' +
      '<div class="set"><div class="t">Historique des commandes</div><button class="btn sm" id="sHist">Voir / effacer</button></div>' +
      '<div class="sect">À propos</div><p class="note">' + esc(S.name) + ' : assistant vocal à commandes de la Suite MAG. Reconnaissance : Vosk (Apache 2.0)' + (PC ? ', vosk-browser de Ciaran O\'Reilly (Apache 2.0 ; Kaldi, OpenFST Apache 2.0 ; CLAPACK, libarchive BSD ; zlib)' : ', vosk-android et JNA (Apache 2.0)') + '. Modèle : vosk-model-small-fr-0.22, Alpha Cephei (Apache 2.0). Voix Piper : moteur sherpa-onnx (k2-fsa, Apache 2.0 ; onnxruntime MIT), phonétiseur français propre à Majordome (sans espeak-ng) ; voix de rhasspy/piper-voices : Pierre et Jessica (UPMC, CC BY-SA 4.0), Gilles (CC0), Siwis (CC BY 4.0). Aucun personnage, logo ni visuel tiers.</p>';
    var b = openSheet('Réglages', h, 'settings');
    $('sAddr').value = S.address;
    var on = function (id, ev, fn) { var e = $(id); if (e) e[ev] = fn; };
    on('sName', 'onchange', function () { S.name = this.value.trim() || 'Majordome'; saveS(); applyName(); applyWake(); chips(); });
    on('sWake', 'onchange', function () { S.wake = this.value; saveS(); applyWake(); });
    on('sAddr', 'onchange', function () { S.address = this.value; saveS(); $('sPrenomBox').hidden = S.address !== 'prenom'; });
    on('sPrenom', 'onchange', function () { S.prenom = this.value.trim(); saveS(); });
    on('sVoiceOn', 'onchange', function () { S.voiceOn = this.checked; saveS(); });
    on('sVoice', 'onchange', function () { S.voice = this.value; saveS(); });
    on('sRate', 'onchange', function () { S.rate = +this.value; saveS(); });
    on('sPitch', 'onchange', function () { S.pitch = +this.value; saveS(); });
    on('sVol', 'onchange', function () { S.volume = +this.value; saveS(); });
    on('sBeeps', 'onchange', function () { S.beeps = this.checked; saveS(); });
    on('sTest', 'onclick', function () { shush(); speak(withSir('Bonjour') + '. Je suis ' + S.name + ', à votre service.'); });
    on('sEng', 'onchange', function () { S.engine = this.value; saveS(); settingsSheet('moteur'); chips(); applyWake(); });
    on('sWebOk', 'onchange', function () { S.webOk = this.checked; saveS(); chips(); });
    on('sModel', 'onclick', modelSheet);
    on('sAuto', 'onchange', function () { S.autoListen = this.checked; saveS(); });
    on('sWakeOn', 'onchange', function () { if (this.checked && !(INFO.model && INFO.model.state === 'ready')) { this.checked = false; toast('Installez d\'abord le modèle vocal'); modelSheet(); return; } S.wakeOn = this.checked; if (S.wakeOn) S.engine = 'vosk'; saveS(); applyWake(); });
    on('sWakeChg', 'onchange', function () { S.wakeCharging = this.checked; saveS(); applyWake(); });
    on('sGps', 'onchange', function () { S.gps = this.checked; saveS(); });
    on('sWind', 'onchange', function () { S.windLimit = Math.max(20, Math.min(120, +this.value || 45)); saveS(); });
    on('sCityGo', 'onclick', function () { var v = $('sCity').value.trim(); if (!v) return; geocode(v).then(function (pl) { S.place = pl; S.gps = false; saveS(); toast('Ville : ' + pl.name); settingsSheet('meteo'); }, function () { toast(online() ? 'Ville introuvable' : 'Recherche impossible sans internet'); }); });
    on('sPerms', 'onclick', permsSheet);
    on('sHist', 'onclick', histSheet);
    on('sRtNew', 'onclick', function () { routineSheet(-1); });
    try { voxPanel.bind(b); } catch (e) { console.warn(e); }
    if (MJ.settingsBind) try { MJ.settingsBind(b); } catch (e) { console.warn(e); }
    homeBind();
    b.addEventListener('click', function (e) { var r = e.target.closest('[data-rt]'); if (r) routineSheet(+r.dataset.rt); var f = e.target.closest('[data-fix]'); if (f && B && B.fix) B.fix(f.dataset.fix); });
    if (focus) { var f = $('f-' + focus); if (f) setTimeout(function () { f.scrollIntoView({ block: 'start' }); }, 50); }
  }
  MJ.settingsSheet = settingsSheet;
  /* Écran d'accueil de n'importe quel lanceur : widget Android (redimensionnable jusqu'au plein écran) et fond d'écran animé */
  function homeHtml() {
    if (!B || !B.wallpaperGet) return '';
    var w = J(B.wallpaperGet(), {}) || {}, sel = function (id, cur, l) { return '<select class="in" id="' + id + '">' + l.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; };
    return '<div class="sect" id="f-accueil">Écran d\'accueil (tous les lanceurs)</div>' +
      '<div class="set"><div class="t">Widget « ' + esc(S.name) + ' »<small>' + (w.widgets ? w.widgets + ' sur l\'écran d\'accueil. ' : '') + 'Sphère, heure, météo et vent, rendez-vous, réveil, lumières ; Parler, Éteindre, Bonjour. Agrandissez-le jusqu\'au plein écran.</small></div><button class="btn sm" id="sWgAdd">Ajouter</button></div>' +
      '<div class="set"><div class="t">Fond d\'écran animé<small>' + (w.active ? 'Actif. ' : '') + 'La sphère derrière les icônes, en pause écran éteint ou appli ouverte.</small></div><button class="btn sm" id="sWpSet">' + (w.active ? 'Revoir' : 'Définir') + '</button></div>' +
      '<div class="set"><div class="t">Couleur</div>' + sel('sWpCol', w.color, [['turquoise', 'Turquoise'], ['bleu', 'Bleu'], ['violet', 'Violet'], ['vert', 'Vert'], ['ambre', 'Ambre'], ['blanc', 'Blanc']]) + '</div>' +
      '<div class="set"><div class="t">Densité</div>' + sel('sWpDen', w.density, [['legere', 'Légère (économe)'], ['normale', 'Normale'], ['dense', 'Dense']]) + '</div>' +
      '<div class="set"><div class="t">Vitesse</div>' + sel('sWpSpd', w.speed, [['lente', 'Lente'], ['normale', 'Normale'], ['rapide', 'Rapide']]) + '</div>' +
      '<div class="set"><div class="t">Pulser quand ' + esc(S.name) + ' parle</div><label class="sw"><input type="checkbox" id="sWpPul"' + (w.pulse !== false ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="set"><div class="t">Fond noir<small>Économise la batterie sur les écrans OLED</small></div><label class="sw"><input type="checkbox" id="sWpBlk"' + (w.black ? ' checked' : '') + '><span></span></label></div>';
  }
  function homeBind() {
    if (!B || !B.wallpaperGet || !$('sWpCol')) return;
    var save = function () { B.wallpaperSet(JSON.stringify({ color: $('sWpCol').value, density: $('sWpDen').value, speed: $('sWpSpd').value, pulse: $('sWpPul').checked, black: $('sWpBlk').checked })); };
    ['sWpCol', 'sWpDen', 'sWpSpd', 'sWpPul', 'sWpBlk'].forEach(function (id) { $(id).onchange = save; });
    $('sWpSet').onclick = function () { save(); B.wallpaperOpen(); };
    $('sWgAdd').onclick = function () { if (!B.widgetPin()) toast('Ajout manuel : appui long sur l\'écran d\'accueil › Widgets › Majordome › « Jarvis (Majordome) »'); };
  }
  $('bSet').onclick = function () { settingsSheet(); };
  function lumRow(v) { return '<div style="display:flex;gap:6px;margin:6px 0"><input class="in" data-lum value="' + esc(v) + '" placeholder="ex. éteins tout"><button class="btn sm" data-lumx aria-label="Retirer">✕</button></div>'; }
  function routineSheet(i) {
    var r = i >= 0 ? S.routines[i] : { id: 'r' + uid(), name: '', phrase: '', steps: ['salut', 'heure'] };
    var h = '<div class="set"><div class="t">Nom</div></div><input class="in" id="rName" value="' + esc(r.name) + '" placeholder="ex. Départ chantier">' +
      '<div class="set"><div class="t">Phrase pour la lancer<small>ex. « départ chantier »</small></div></div><input class="in" id="rPh" value="' + esc(r.phrase) + '">' +
      '<div class="sect">Actions, dans l\'ordre</div>' + Object.keys(STEPS).map(function (k) { return '<div class="set"><div class="t">' + esc(STEPS[k]) + '</div><label class="sw"><input type="checkbox" data-st="' + k + '"' + ((r.steps || []).indexOf(k) >= 0 ? ' checked' : '') + '><span></span></label></div>'; }).join('') +
      '<div class="sect">Lumières (Philips Hue)</div><p class="note">Une commande par ligne, comme on la dit : « éteins tout », « allume la cuisine à 60 % », « active la scène Lecture ».' + (MJ.hueReady && MJ.hueReady() ? '' : ' Sans pont Hue jumelé, ces actions sont ignorées.') + '</p><div id="rLum">' + (r.steps || []).filter(function (s) { return /^lum:/.test(s); }).map(function (s) { return lumRow(s.slice(4)); }).join('') + '</div>' +
      '<div class="row" style="display:flex;gap:8px;margin-top:6px"><button class="btn sm" id="rLumAdd">Ajouter une action lumière</button></div>' +
      '<div class="row" style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="rSave">Enregistrer</button>' + (i >= 0 && r.id !== 'matin' && r.id !== 'nuit' ? '<button class="btn bad" id="rDel">Supprimer</button>' : '') + '<button class="btn" id="rTry">Essayer</button></div>';
    openSheet('Routine', h, 'routine');
    var collect = function () {
      var st = []; document.querySelectorAll('[data-st]').forEach(function (c) { if (c.checked) st.push(c.dataset.st); });
      var lum = []; document.querySelectorAll('[data-lum]').forEach(function (c) { var v = c.value.trim(); if (!v) return; if (MJ.lightCheck && !MJ.lightCheck(v)) { toast('« ' + v + ' » n\'est pas une commande de lumière : ignorée'); return; } lum.push('lum:' + v); });
      r.steps = (r.steps || []).filter(function (s) { return st.indexOf(s) >= 0; }).concat(st.filter(function (s) { return (r.steps || []).indexOf(s) < 0; })).concat(lum);
      r.name = $('rName').value.trim() || 'Routine'; r.phrase = $('rPh').value.trim() || r.name;
    };
    $('rLumAdd').onclick = function () { $('rLum').insertAdjacentHTML('beforeend', lumRow('')); var l = $('rLum').querySelectorAll('[data-lum]'); l[l.length - 1].focus(); };
    $('rLum').onclick = function (e) { var x = e.target.closest('[data-lumx]'); if (x) x.parentNode.remove(); };
    $('rSave').onclick = function () { collect(); if (i < 0) S.routines.push(r); saveS(); settingsSheet(); };
    if ($('rDel')) $('rDel').onclick = function () { if (confirm('Supprimer la routine « ' + r.name + ' » ?')) { S.routines.splice(i, 1); saveS(); settingsSheet(); } };
    $('rTry').onclick = function () { collect(); closeSheet(); var tmp = S.routines.concat(i < 0 ? [r] : []); var save = S.routines; S.routines = tmp; H.routine({ id: r.id }); S.routines = save; };
  }

  /* ---------------- Saisie ---------------- */
  $('ask').addEventListener('submit', function (e) { e.preventDefault(); var v = $('q').value.trim(); if (!v) return; $('q').value = ''; handle(v, 'keyboard'); });
  $('mic').onclick = function () { audio(); toggle(); };
  $('orbBox').onclick = function () { audio(); toggle(); };
  $('orbBox').onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  if (!PC) document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && (e.code === 'Space' || e.key === ' ')) { e.preventDefault(); toggle(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('sheet').classList.contains('on')) closeSheet(); });

  /* ---------------- Socle (tuile, appui long) ---------------- */
  function publish() {
    if (!Array.isArray(AL)) return;
    var srt = AL.slice().sort(function (a, b) { return a.at - b.at; }), next = srt[0];
    var first = function (k) { return srt.filter(function (o) { return o.kind === k; })[0]; }, tm = first('timer'), rm = first('reminder');
    // name, sir (appellation) : panneau « Majordome » de Socle ; timer / rem : prochain minuteur et prochain rappel
    // timers (3 au plus), news (titres déjà en cache, aucune requête), windLimit, wx (dernière météo lue) : page Jarvis de Socle et widget Android
    var tms = srt.filter(function (o) { return o.kind === 'timer'; }).slice(0, 3).map(function (o) { return { at: o.at, label: o.label || '' }; });
    var ac = lsGet(KEY.actu, null), news = ac && Array.isArray(ac.items) && now() - ac.at < 12 * HOUR ? ac.items.slice(0, 3).map(function (x) { return { t: String(x.t || '').slice(0, 160) }; }) : null;
    var wc = lsGet(KEY.wx, null), cu = wc && wc.d && wc.d.current, wx = cu && now() - wc.at < 3 * HOUR ? { t: Math.round(cu.temperature_2m), code: cu.weather_code, wind: Math.round(cu.wind_speed_10m || 0), gust: Math.round(cu.wind_gusts_10m || 0), where: String(wc.where || '').replace(/^à /, ''), at: wc.at } : null;
    try { moment(); } catch (e) { console.warn(e); }
    if (!P || !P.widgetPut) return;
    try { P.widgetPut(JSON.stringify({ name: S.name, sir: sir(), timers: tms, news: news, windLimit: +S.windLimit || 45, wx: wx, last: MJ.last ? { q: String(MJ.last.q || '').slice(0, 120), a: String(MJ.last.a).slice(0, 140), at: MJ.last.at } : null, next: next ? { kind: next.kind, at: next.at, label: next.kind === 'timer' ? (next.label || 'Minuteur') : next.kind === 'alarm' ? 'Réveil' : next.text } : null, timer: tm ? { at: tm.at, label: tm.label || '' } : null, rem: rm ? { at: rm.at, text: String(rm.text || 'Rappel').slice(0, 100) } : null, wake: !!S.wakeOn, at: now() })); } catch (e) { }
  }
  /* ---------------- Informations du moment (sous la sphère) ----------------
     Heure, météo et vent (dernière météo lue, aucune requête), prochain rendez-vous (agenda déjà autorisé),
     lumières Hue (état connu de mj-maison) ou, sans Hue, prochain minuteur / réveil. Toucher une carte : la commande. */
  var JOURS3 = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], MOIS3 = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function hhmm(ms) { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function nextEvent() {
    try {
      var A = window.MAGAgenda; if (!A || !A.instances || (A.perm && !A.perm())) return undefined;
      var t = now(), l = J(A.instances(t, t + 7 * DAY), []) || [];
      var timed = l.filter(function (e) { return !e.all && e.e > t; }).sort(function (a, b) { return a.b - b.b; });
      return timed[0] || l.filter(function (e) { return e.all && e.e > t; })[0] || null;
    } catch (e) { return undefined; }
  }
  function momentCells() {
    var t = now(), d = new Date(t), cells = [];
    cells.push({ k: 'time', l: 'Heure', b: hhmm(t), big: 1, s: cap(JOURS3[d.getDay()]) + ' ' + d.getDate() + ' ' + MOIS3[d.getMonth()] });
    var wc = lsGet(KEY.wx, null), cu = wc && wc.d && wc.d.current && t - wc.at < 3 * HOUR ? wc.d.current : null;
    var SHORT = { 'partiellement nuageux': 'peu nuageux', 'plutôt dégagé': 'dégagé', 'brouillard givrant': 'brouillard', 'bruine verglaçante': 'verglas', 'pluie verglaçante': 'verglas', 'averses de neige': 'neige', 'fortes averses de neige': 'neige', 'orages avec grêle': 'orages' };
    if (cu) {
      var lim = +S.windLimit || 45, g = Math.max(cu.wind_gusts_10m || 0, cu.wind_speed_10m || 0), lv = g >= lim ? 'bad' : g >= lim * 0.75 ? 'warn' : '';
      cells.push({ k: 'wx', l: 'Météo' + (wc.where ? ' ' + String(wc.where).replace(/^à /, '') : ''), b: Math.round(cu.temperature_2m) + '° ' + (SHORT[WMO[cu.weather_code]] || WMO[cu.weather_code] || ''), s: 'Vent ' + Math.round(cu.wind_speed_10m || 0) + ' km/h · raf. ' + Math.round(cu.wind_gusts_10m || 0), cls: lv });
    } else cells.push({ k: 'wx', l: 'Météo', b: 'Météo et vent', s: 'Touchez pour la lire' });
    var ev = nextEvent();
    if (ev) cells.push({ k: 'ev', l: 'Rendez-vous', b: ev.t || 'Sans titre', s: ev.all ? 'Toute la journée' + (ymd(ev.b) === ymd(t) ? '' : ', ' + dayName(ev.b)) : (ymd(ev.b) === ymd(t) ? 'Aujourd\'hui' : cap(dayName(ev.b))) + ' à ' + hhmm(ev.b) });
    else cells.push({ k: 'ev', l: 'Rendez-vous', b: ev === null ? 'Rien de prévu' : 'Agenda', s: ev === null ? 'dans les 7 jours' : 'Touchez pour le voir' });
    var li = MJ.lightsSummary ? MJ.lightsSummary() : null;
    if (li) cells.push({ k: 'hue', l: 'Lumières', b: !li.paired ? 'Philips Hue' : li.total == null ? 'Lumières' : li.on ? li.on + ' allumée' + (li.on > 1 ? 's' : '') : 'Tout est éteint', s: !li.paired ? 'Touchez pour jumeler' : li.total ? 'sur ' + li.total + ' lampe' + (li.total > 1 ? 's' : '') : 'Touchez pour voir' });
    else {
      var nx = (Array.isArray(AL) ? AL : []).filter(function (o) { return o.kind !== 'hue' && o.at > t; }).sort(function (a, b) { return a.at - b.at; })[0];
      cells.push({ k: 'al', l: nx ? alarmTitle(nx).replace(/ :.*$/, '') : 'Minuteur', b: nx ? (nx.kind === 'timer' ? clock(nx.at - t) : hhmm(nx.at)) : 'Aucun', big: nx ? 1 : 0, s: nx ? (nx.kind === 'timer' ? 'fin à ' + hhmm(nx.at) : dayName(nx.at)) : '« Minuteur 10 minutes »' });
    }
    return cells;
  }
  var momentHtml = '';
  function moment() {
    var h = momentCells().map(function (c) { return '<button class="mo" data-mo="' + c.k + '"><i>' + esc(c.l) + '</i><b' + (c.big ? ' class="big"' : '') + '>' + esc(c.b) + '</b><span' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + esc(c.s) + '</span></button>'; }).join('');
    if (h !== momentHtml) { momentHtml = h; $('moment').innerHTML = h; }
  }
  $('moment').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mo]'); if (!b) return; audio();
    var k = b.dataset.mo;
    if (k === 'hue' && MJ.homeSheet) return MJ.homeSheet();
    var q = { time: 'quelle heure est-il', wx: 'quel temps fait-il', ev: 'quels sont mes rendez-vous', al: 'quels minuteurs sont en cours' }[k];
    if (k === 'al' && !(AL || []).some(function (o) { return o.kind !== 'hue' && o.at > now(); })) { $('q').focus(); $('q').value = 'Minuteur 10 minutes'; return; }
    if (q) handle(q, 'click');
  });
  /* Dernier échange (historique local) : affiché jusqu'à la première question de la séance */
  function lastExchange() {
    var el = $('last'), l = lsGet(KEY.hist, []), h = Array.isArray(l) && l.length ? l[l.length - 1] : null;
    if (!S.history || !h || !h.a || now() - h.at > 12 * HOUR || $('cards').children.length) { el.hidden = true; return; }
    el.innerHTML = '<div class="k">Dernier échange · ' + esc(hm(h.at)) + '</div>' + (h.q ? '<q>' + esc(h.q) + '</q>' : '') + '<p>' + esc(h.a) + '</p>';
    el.hidden = false;
  }
  new MutationObserver(function () { if ($('cards').children.length) $('last').hidden = true; }).observe($('cards'), { childList: true });

  /* Page Jarvis de Socle : « back » = après la réponse (voix terminée), retour sur Socle, sauf si une question attend
     une réponse, si l'écoute a repris, si un panneau est ouvert ou si l'on a touché l'écran entre-temps */
  function backToSocle() {
    if (!MJ.backAfter) return;
    setTimeout(function () {
      if (!MJ.backAfter || MJ.wait || MJ.listening || speaking() || curSheet) return;
      MJ.backAfter = false;
      try { if (P && P.appBack) P.appBack(); } catch (e) { }
    }, 1800);
  }
  document.addEventListener('pointerdown', function () { MJ.backAfter = false; }, true);
  window.onSocle = function (a) {
    var o = J(a, {}) || {};
    MJ.backAfter = !!o.back;
    var voice = !!(B && B.listen && engineReady());
    if (o.listen) setTimeout(function () { startListen(); }, 300);
    else if (o.routine) setTimeout(function () { MJ.voiceTurn = false; H.routine({ id: String(o.routine) }); }, 300);
    else if (o.timer) setTimeout(function () { MJ.voiceTurn = voice; H.timer({}); }, 300);
    else if (o.note) setTimeout(function () { MJ.voiceTurn = voice; H.note_add({}); }, 300);
    else if (o.settings) settingsSheet(o.settings === 1 ? '' : String(o.settings));
    else if (o.cmd) handle(String(o.cmd), 'socle');
  };
  /* Assistant du téléphone (appui long sur le bouton d'accueil) : MajordomeBridge garde la demande, la page la prend une fois */
  function takeAssist() { try { if (B && B.takeAssist && B.takeAssist()) { closeSheet(); setTimeout(function () { startListen(); }, 250); return true; } } catch (e) { } return false; }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    refreshInfo(); tick(); applyName(); moment();
    if (B && B.takeCommand) { var c = B.takeCommand(); if (c) handle(c, 'voice'); }
    takeWatch();
    takeAssist();
  });
  /* Demande de la montre arrivée quand Majordome était fermé (MajordomeBridge.Montre l'a gardée et a ouvert l'appli) */
  function takeWatch() { try { if (B && B.takeWatch && MJ.onWatch) { var w = B.takeWatch(); if (w) MJ.onWatch(J(w, {})); } } catch (e) { } }

  /* ---------------- Démarrage ---------------- */
  applyName(); refreshInfo(); renderTimers();
  if (!NLU) { errorReply('Analyseur de commandes introuvable.'); return; }
  setInterval(tick, 500);
  setInterval(function () { if (!document.hidden) { moment(); $('greet').textContent = greeting(); } }, 15000);
  tick(); lastExchange();
  document.addEventListener('DOMContentLoaded', function () { try { moment(); } catch (e) { } });   // après mj-maison (carte Lumières)
  applyWake();
  if (S.tts === 'piper' && VX && VX.hasVoice(S.piperVoice)) setTimeout(function () { VX.warm(S.piperVoice).catch(function () { }); }, 1200);
  if (window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = function () { if (curSheet === 'settings') settingsSheet(); };
  var first = !lsGet('majordome:vu', false);
  if (first) { lsSet('majordome:vu', true); card('<div class="k">Bienvenue</div><p>Je suis ' + esc(S.name) + ', votre assistant à commandes. Touchez la sphère ou le micro pour parler, ou tapez une commande ci-dessous. Dites « qu\'est-ce que tu sais faire ? » pour les exemples.</p>' + (B && B.listen && !(INFO.model && INFO.model.state === 'ready') && S.engine === 'vosk' ? '<div class="row"><button class="btn pri" data-mdl>Installer la reconnaissance hors ligne (41 Mo)</button></div>' : '')); var bm = document.querySelector('[data-mdl]'); if (bm) bm.onclick = modelSheet; }
  setTimeout(function () {
    try { if (P && P.takeSocle) { var x = P.takeSocle(); if (x) window.onSocle(x); } } catch (e) { }
    if (B && B.takeCommand) { var c = B.takeCommand(); if (c) handle(c, 'voice'); }
    takeWatch();
    takeAssist();
  }, 400);
  publish();
  MJ.S = S; MJ.VX = VX; MJ.AL = function () { return AL; };
  MJ._ = { H: H, answer: answer, ask: ask, errorReply: errorReply, openSheet: openSheet, closeSheet: closeSheet, curSheet: function () { return curSheet; }, esc: esc, J: J, lsGet: lsGet, lsSet: lsSet, uid: uid, now: now, cap: cap, deacc: deacc,
    S: S, saveS: saveS, toast: toast, card: card, withSir: withSir, sir: sir, ack: ack, dur: dur, hm: hm, hmSay: hmSay, addAlarm: addAlarm, removeAlarm: removeAlarm, setAL: function (l) { AL = l; saveAL(); renderTimers(); },
    HELP: HELP, openLink: openLink, settingsSheet: settingsSheet, handle: handle, ANDROID: ANDROID, PC: PC, B: B, P: P, KEY: KEY, WMO: WMO, weatherData: weatherData, vigilanceData: vigilanceData, speaking: speaking };
  if (MJ.onReady) try { MJ.onReady(); } catch (e) { console.warn(e); } MJ.LS = function () { return LS; }; MJ.orb = orb; MJ.moment = function () { try { moment(); } catch (e) { } }; MJ.ask = ask; MJ.speakText = speechText; MJ.refresh = refreshInfo;
})();
