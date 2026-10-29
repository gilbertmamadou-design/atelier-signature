/* =====================================================================
   Majordome sur PC : pont simulé window.MAGMajordome (même nom de méthodes
   que applis/scripts/MajordomeBridge.java pour ce qui existe sur PC).
   - Reconnaissance hors ligne : Vosk en WebAssembly (vosk-browser, worker
     ../shared/vendor/vosk/vosk-worker.js), modèle vosk-model-small-fr-0.22
     téléchargé une fois (alphacephei.com) ou choisi comme fichier .zip, gardé
     par le worker dans IndexedDB (« /vosk »).
   - Repli facultatif : Web Speech d'Edge / Chrome (l'audio part chez Microsoft
     ou Google : la page demande l'accord explicite).
   - Écoute continue (mot de réveil) tant que la fenêtre est ouverte.
   - Agenda : charge ../shared/apps/agenda.js (même agenda local que l'appli
     Agenda sur PC, localStorage « agenda-pc.v1 »).
   - Ctrl+Espace : parler.
   Absent sur PC (la page s'adapte) : voix et alarmes natives, appels, SMS,
   lampe, volume du système, modes, panneaux Wi-Fi / Bluetooth.
   Événements vers la page : window.majordomeEvent(type, json).
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip';
  var MODEL_KEY = 'vosk-model-small-fr-0.22';
  var FLAG = 'majordome:modele';
  var WORKER = (M.conf.vendor || '../shared/vendor/') + 'vosk/vosk-worker.js';
  function emit(t, o) { try { if (window.majordomeEvent) window.majordomeEvent(t, JSON.stringify(o || {})); } catch (e) { console.warn(e); } }
  function deacc(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function uuid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------------- Modèle et worker Vosk ---------------- */
  var model = { state: M.store.get(FLAG, null) ? 'ready' : 'none', progress: 0, msg: '', size: (M.store.get(FLAG, {}) || {}).size || 0 };
  var worker = null, loaded = null, recs = {};
  function setModel(o) { Object.keys(o).forEach(function (k) { model[k] = o[k]; }); emit('model', model); }
  function startWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER);
    worker.onmessage = function (e) {
      var d = e.data || {};
      if (d.event === 'load' || (d.error && loaded && loaded.pending)) { var l = loaded; if (l && l.pending) { l.pending = false; if (d.event === 'load' && d.result) l.ok(); else l.ko(new Error(d.error || 'modèle illisible')); } return; }
      if (d.recognizerId && recs[d.recognizerId]) recs[d.recognizerId](d);
    };
    worker.onerror = function (e) { var l = loaded; if (l && l.pending) { l.pending = false; l.ko(new Error(e.message || 'moteur Vosk indisponible')); } };
    return worker;
  }
  /** Charge le modèle (depuis IndexedDB s'il est déjà installé, sinon depuis url) */
  function loadModel(url) {
    if (loaded && (loaded.done || loaded.pending)) return loaded.p;
    var o = { pending: true };
    o.p = new Promise(function (ok, ko) { o.ok = function () { o.done = true; ok(); }; o.ko = function (e) { loaded = null; try { worker.terminate(); } catch (x) { } worker = null; ko(e); }; });
    loaded = o;
    startWorker().postMessage({ action: 'load', modelUrl: url || MODEL_URL, key: MODEL_KEY });
    return o.p;
  }
  function installFrom(blob, size) {
    setModel({ state: 'extracting', progress: 0.99, msg: '' });
    var u = URL.createObjectURL(blob);
    loaded = null; if (worker) { try { worker.terminate(); } catch (e) { } worker = null; }
    return loadModel(u).then(function () {
      URL.revokeObjectURL(u);
      M.store.set(FLAG, { key: MODEL_KEY, size: size || blob.size, at: Date.now() });
      setModel({ state: 'ready', progress: 1, size: size || blob.size, fresh: true });
    }, function (e) {
      URL.revokeObjectURL(u);
      try { indexedDB.deleteDatabase('/vosk'); } catch (x) { }   // l'essai raté ne doit pas rester « installé » dans le cache du worker
      setModel({ state: 'error', progress: 0, msg: 'Ce fichier n\'est pas un modèle Vosk utilisable (' + (e && e.message || e) + '). Attendu : vosk-model-small-fr-0.22.zip.' });
    });
  }
  function download() {
    if (model.state === 'downloading') return;
    setModel({ state: 'downloading', progress: 0, msg: '' });
    fetch(MODEL_URL, { credentials: 'omit', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var total = +r.headers.get('content-length') || 41 * 1048576, got = 0, parts = [], rd = r.body.getReader(), last = 0;
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) return new Blob(parts, { type: 'application/zip' });
          parts.push(x.value); got += x.value.length;
          if (Date.now() - last > 300) { last = Date.now(); setModel({ state: 'downloading', progress: Math.min(0.98, got / total) }); }
          return pump();
        });
      }
      return pump();
    }).then(function (b) { return installFrom(b, b.size); }).catch(function (e) {
      var cors = e && e.name === 'TypeError';
      setModel({ state: 'error', progress: 0, msg: cors ? 'Le téléchargement direct a été refusé (pas de connexion, ou le site du modèle ne permet pas la lecture depuis une page web). Téléchargez le fichier avec le navigateur puis choisissez-le.' : 'Téléchargement impossible : ' + (e && e.message || e) + '.' });
    });
  }
  function pick() {
    M.fs.open({ types: [{ description: 'Modèle Vosk (.zip)', accept: { 'application/zip': ['.zip'] } }], accept: '.zip,application/zip', id: 'majordome-modele' }).then(function (l) {
      if (!l.length) return;
      installFrom(l[0].file, l[0].file.size);
    }).catch(function (e) { M.toast('Lecture du fichier impossible : ' + (e && e.message || e), { bad: true }); });
  }
  function removeModel() {
    stopAll();
    if (worker) { try { worker.terminate(); } catch (e) { } worker = null; }
    loaded = null; M.store.del(FLAG);
    try { indexedDB.deleteDatabase('/vosk'); } catch (e) { }
    setModel({ state: 'none', progress: 0, size: 0, msg: '' });
  }

  /* ---------------- Micro ---------------- */
  var mic = null;   // {stream, ctx, node}
  var mode = null, cmdId = null, wakeId = null, hold = false, holdUntil = 0, wakeCfg = { on: false, words: ['majordome'] }, cmdTimer = 0, cmdGot = false;
  function openMic() {
    if (mic) return Promise.resolve(mic);
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false }).then(function (stream) {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = function (ev) { onAudio(ev.inputBuffer.getChannelData(0), ctx.sampleRate); };
      src.connect(node); node.connect(ctx.destination);   // sortie muette : le nœud doit être relié pour tourner
      mic = { stream: stream, ctx: ctx, node: node, src: src };
      return mic;
    });
  }
  function closeMic() {
    if (!mic) return;
    try { mic.node.disconnect(); mic.src.disconnect(); } catch (e) { }
    mic.stream.getTracks().forEach(function (t) { t.stop(); });
    try { mic.ctx.close(); } catch (e) { }
    mic = null;
  }
  var lvlT = 0;
  function onAudio(data, rate) {
    var s = 0; for (var i = 0; i < data.length; i += 4) s += data[i] * data[i];
    var rms = Math.sqrt(s / (data.length / 4)), v = Math.min(1, rms * 9);
    var id = mode === 'cmd' ? cmdId : mode === 'wake' ? wakeId : null;
    if (mode === 'cmd' && Date.now() - lvlT > 60) { lvlT = Date.now(); emit('level', { v: v }); }
    if (!id || !worker) return;
    if (mode === 'wake' && (hold || Date.now() < holdUntil)) return;
    var f = new Float32Array(data.length); for (var j = 0; j < data.length; j++) f[j] = data[j] * 32768;
    worker.postMessage({ action: 'audioChunk', data: f, recognizerId: id, sampleRate: rate }, [f.buffer]);
  }
  function newRec(kind, rate) {
    var id = uuid();
    recs[id] = kind === 'cmd' ? onCmd : onWake;
    worker.postMessage({ action: 'create', recognizerId: id, sampleRate: rate });
    return id;
  }
  function dropRec(id) { if (!id || !worker) return; worker.postMessage({ action: 'remove', recognizerId: id }); }

  /* commande : premier résultat non vide, ou fin du délai */
  function onCmd(d) {
    if (d.recognizerId !== cmdId) { if (d.event === 'result') delete recs[d.recognizerId]; return; }
    var r = d.result || {};
    if (d.event === 'partialresult' && r.partial) emit('partial', { text: r.partial });
    if (d.event === 'result' && r.text && r.text.trim()) { cmdGot = true; finishCmd(r.text); }
  }
  function finishCmd(text) {
    clearTimeout(cmdTimer);
    var id = cmdId; cmdId = null; mode = null;
    if (id) { recs[id] = function () { delete recs[id]; }; dropRec(id); }
    emit('result', { text: text || '' });
    resumeWake();
  }
  /* mot de réveil : recherché dans les résultats partiels (mots hors vocabulaire tolérés : « jar vis ») */
  function wakeHit(text) {
    var t = ' ' + deacc(text) + ' ', compact = t.replace(/ /g, '');
    for (var i = 0; i < wakeCfg.words.length; i++) {
      var w = deacc(wakeCfg.words[i]); if (!w) continue;
      if (t.indexOf(' ' + w + ' ') >= 0 || compact.indexOf(w.replace(/ /g, '')) >= 0) return w;
      if (w === 'majordome' && /\bmajor ?dome?s?\b|\bmajordom\b/.test(t)) return w;
      if (w === 'jarvis' && /\bjar ?vi[sc]e?\b|\bjarvi\b|\bdjarvis\b/.test(t)) return w;
    }
    return '';
  }
  function onWake(d) {
    if (d.recognizerId !== wakeId) { if (d.event === 'result') delete recs[d.recognizerId]; return; }
    var r = d.result || {}, txt = d.event === 'result' ? r.text : r.partial;
    if (!txt) return;
    var w = wakeHit(txt);
    if (!w) return;
    if (d.event === 'result') {
      // « Majordome, quelle heure est-il » d'une traite : la commande suit le mot
      var t = deacc(txt), k = t.indexOf(w), rest = k >= 0 ? t.slice(k + w.length).trim() : '';
      resetWake();
      if (rest.split(' ').length >= 2) emit('result', { text: txt, wake: true }); else emit('wake', { word: w });
    } else if (deacc(txt).split(' ').length <= 2) {
      // mot seul : on passe tout de suite à l'écoute de la commande
      resetWake(); emit('wake', { word: w });
    }
  }
  function resetWake() { var id = wakeId; wakeId = null; if (id) { recs[id] = function () { delete recs[id]; }; dropRec(id); } if (mode === 'wake') mode = null; }
  function resumeWake() {
    if (!wakeCfg.on || model.state !== 'ready') { if (!mode) closeMic(); return; }
    loadModel().then(openMic).then(function (m) { if (mode) return; wakeId = newRec('wake', m.ctx.sampleRate); mode = 'wake'; }).catch(function (e) { emit('error', { msg: 'Écoute continue impossible : ' + micMsg(e) }); });
  }
  function micMsg(e) { return e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'le micro est refusé. Autorisez-le pour ce site (icône à gauche de l\'adresse) et dans Windows › Paramètres › Confidentialité › Microphone.' : e && e.name === 'NotFoundError' ? 'aucun micro trouvé sur cet ordinateur.' : (e && e.message || String(e)); }
  function stopAll() { clearTimeout(cmdTimer); if (cmdId) { var id = cmdId; cmdId = null; recs[id] = function () { delete recs[id]; }; dropRec(id); } resetWake(); mode = null; if (web) { try { web.abort(); } catch (e) { } web = null; } }

  /* ---------------- Web Speech (en ligne, facultatif) ---------------- */
  var WSR = window.SpeechRecognition || window.webkitSpeechRecognition, web = null;
  function webListen(o) {
    if (!WSR) { emit('error', { msg: 'Ce navigateur n\'a pas de reconnaissance Web Speech.' }); return; }
    var r = new WSR(), got = false; web = r;
    r.lang = 'fr-FR'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onresult = function (e) {
      var fin = '', part = '';
      for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript; else part += e.results[i][0].transcript; }
      if (part) emit('partial', { text: part });
      if (fin) { got = true; emit('result', { text: fin }); }
    };
    r.onaudiostart = function () { emit('level', { v: 0.3 }); };
    r.onerror = function (e) { if (e.error === 'no-speech' || e.error === 'aborted') return; got = true; emit('error', { msg: e.error === 'not-allowed' ? 'Micro refusé.' : e.error === 'network' ? 'La Web Speech API demande internet.' : 'Reconnaissance : ' + e.error }); };
    r.onend = function () { web = null; if (!got) emit('end', {}); resumeWake(); };
    try { r.start(); } catch (e) { emit('error', { msg: e.message }); }
  }

  /* ---------------- Pont ---------------- */
  var B = {
    version: function () { return '1-pc'; },
    sttInfo: function () { return JSON.stringify({ model: model, web: !!WSR, android: false, wake: { on: wakeCfg.on, running: mode === 'wake' } }); },
    modelDownload: download, modelPick: pick, modelDelete: removeModel,
    listen: function (json) {
      var o = {}; try { o = JSON.parse(json || '{}'); } catch (e) { }
      stopAll();
      if (o.engine === 'web') { webListen(o); return; }
      if (model.state !== 'ready') { emit('error', { msg: 'Le modèle vocal n\'est pas installé.' }); return; }
      var slow = setTimeout(function () { emit('partial', { text: 'Chargement du modèle vocal…' }); }, 600);
      loadModel().then(openMic).then(function (m) {
        clearTimeout(slow);
        if (mic && mic.ctx.state === 'suspended') mic.ctx.resume();
        cmdGot = false; cmdId = newRec('cmd', m.ctx.sampleRate); mode = 'cmd';
        var id = cmdId;
        cmdTimer = setTimeout(function () {
          if (cmdId !== id) return;
          // délai écoulé : le résultat final du worker (texte en cours) sert de réponse
          cmdId = null; mode = null;
          recs[id] = function (d) { delete recs[id]; emit('result', { text: (d.result && d.result.text) || '' }); resumeWake(); };
          dropRec(id);
        }, Math.max(3000, +o.maxMs || 9000));
      }).catch(function (e) {
        clearTimeout(slow);
        if (/modèle|model/i.test(e && e.message || '')) { M.store.del(FLAG); setModel({ state: 'error', msg: 'Le modèle vocal enregistré est illisible : réinstallez-le.' }); }
        emit('error', { msg: 'Écoute impossible : ' + micMsg(e) });
      });
    },
    stop: function () { var was = mode === 'cmd' || web; stopAll(); if (was) emit('end', {}); resumeWake(); },
    wake: function (json) {
      var o = {}; try { o = JSON.parse(json || '{}'); } catch (e) { }
      wakeCfg = { on: !!o.on, words: (o.words && o.words.length ? o.words : ['majordome']) };
      if (!wakeCfg.on) { if (mode === 'wake') resetWake(); if (!mode) closeMic(); return; }
      if (mode !== 'cmd') { resetWake(); resumeWake(); }
    },
    hold: function (on) { hold = !!on; if (!on) holdUntil = Date.now() + 700; },
    loadAgenda: function () {
      if (window.MAGAgenda) return Promise.resolve(window.MAGAgenda);
      return M.loadScript('../shared/apps/agenda.js').then(function () { return window.MAGAgenda; });
    },
    openUrl: function (u) { if (/^https:\/\//.test(u)) M.nativeOpen(u, '_blank'); }
  };
  delete B.openUrl;   // sur PC, la page ouvre les liens elle-même (geste de l'utilisateur requis)
  window.MAGMajordome = B;

  M.keys({ 'mod+space': function () { if (window.Majordome) window.Majordome.toggle(); } });
  window.addEventListener('pagehide', function () { stopAll(); closeMic(); });
  // modèle déjà installé : chargé en avance (quelques secondes) pour que la première écoute soit immédiate
  if (model.state === 'ready') setTimeout(function () { loadModel().catch(function (e) { M.store.del(FLAG); setModel({ state: 'error', msg: 'Le modèle vocal enregistré est illisible (' + (e && e.message || e) + ') : réinstallez-le.' }); }); }, 1200);
})();
