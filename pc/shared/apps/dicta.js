/* =====================================================================
   Dictaphone sur PC : pont simulé window.MAGDicta (même interface que
   applis/scripts/DictaBridge.java + DictaService).
   - enregistrement : micro du PC (MediaRecorder : Opus 64 ou 128 kb/s ;
     « Brut WAV » : PCM 16 bits), pause, marqueurs, niveau ;
   - notes : gardées dans ce navigateur (sons dans IndexedDB « dicta-pc »,
     infos dans localStorage « dicta.pc ») ; partage = partage de Windows
     ou téléchargement ; « Enregistrer » (menu) pour copier un fichier ;
   - lecture, vitesse, forme d'onde, extrait (découpe en WAV) : dans la page ;
   - dictée : reconnaissance vocale du navigateur (Edge, Chrome), qui passe
     par un service en ligne (pas de dictée hors ligne sur PC) ;
   - l'enregistrement s'arrête si on ferme la fenêtre (pas de service en
     arrière-plan sur PC) ; « Envoyer à Carnet » copie le texte.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var MK = 'dicta.pc', db = M.openDb('dicta-pc', ['sons'], 1);
  var NOTES = M.store.get(MK, []) || [], NEXT = {};
  function saveMeta() { M.store.set(MK, NOTES); }
  function emit(type, o) { if (window.dictaEvent) window.dictaEvent(type, JSON.stringify(o)); }
  function byId(id) { for (var i = 0; i < NOTES.length; i++) if (String(NOTES[i].id) === String(id)) return NOTES[i]; return null; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function noteName(d) { return 'Note ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + 'h' + pad(d.getMinutes()); }
  var micState = 'prompt';
  try { navigator.permissions.query({ name: 'microphone' }).then(function (p) { micState = p.state; p.onchange = function () { micState = p.state; }; }).catch(function () { }); } catch (e) { }
  var free = 0; try { navigator.storage.estimate().then(function (e) { free = Math.max(0, (e.quota || 0) - (e.usage || 0)); }); } catch (e) { }

  /* ---------------- Enregistrement ---------------- */
  var R = null;   // {stream, ctx, an, mr, chunks, pcm, q, name, since, acc, seg, paused, marks, tick}
  function elapsed() { return !R ? 0 : R.acc + (R.paused ? 0 : Date.now() - R.seg); }
  function stateObj() {
    return { rec: !!R, paused: !!(R && R.paused), t: elapsed(), q: R ? R.q : '', name: R ? R.name : '', since: R ? R.since : 0, level: R ? R.level || 0 : 0, markers: R ? R.marks.slice() : [], playing: !!(A && !A.paused), playId: P ? P.id : -1 };
  }
  function wavOf(chunks, rate) {
    var n = 0; chunks.forEach(function (c) { n += c.length; });
    var b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    var o = 44; chunks.forEach(function (c) { for (var i = 0; i < c.length; i++, o += 2) { var s = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); } });
    return new Blob([b], { type: 'audio/wav' });
  }
  async function start(q) {
    var stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: q === 'voice', noiseSuppression: q === 'voice', autoGainControl: q === 'voice' } }); }
    catch (e) { micState = 'denied'; emit('perm', { mic: false }); emit('error', { msg: e && e.name === 'NotFoundError' ? 'Aucun micro trouvé sur ce PC' : 'Micro refusé : autorise-le pour ce site (icône à gauche de l\'adresse) et dans Windows › Confidentialité › Microphone' }); return; }
    micState = 'granted';
    var ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    var d = new Date();
    R = { stream: stream, ctx: ctx, an: an, chunks: [], pcm: null, q: q, name: noteName(d), since: d.getTime(), acc: 0, seg: Date.now(), paused: false, marks: [], level: 0 };
    if (q === 'wav') {
      var sp = ctx.createScriptProcessor(4096, 1, 1); R.pcm = []; R.rate = ctx.sampleRate;
      sp.onaudioprocess = function (e) { if (R && !R.paused) R.pcm.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      src.connect(sp); sp.connect(ctx.destination); R.sp = sp;
    } else {
      var mt = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].filter(function (t) { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); })[0];
      R.mr = new MediaRecorder(stream, { mimeType: mt, audioBitsPerSecond: q === 'hq' ? 128000 : 64000 });
      var me = R; R.mr.ondataavailable = function (e) { if (e.data && e.data.size) me.chunks.push(e.data); };
      R.mr.start(1000);
    }
    var buf = new Float32Array(an.fftSize);
    R.tick = setInterval(function () {
      if (!R) return;
      var peak = 0; if (!R.paused) { an.getFloatTimeDomainData(buf); for (var i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i])); }
      var db = peak > 0 ? 20 * Math.log10(peak) : -90; R.level = Math.max(0, Math.min(1, (db + 60) / 60));
      emit('level', { l: Math.round(R.level * 1000) / 1000, db: Math.round(db), t: elapsed(), p: R.paused });
    }, 66);
    M.keepScreen(true);
    emit('state', stateObj());
  }
  async function finish(reason) {
    if (!R) return;
    var r = R, dur = elapsed(); R = null;
    clearInterval(r.tick); M.keepScreen(false);
    var blob = null;
    if (r.mr) { blob = await new Promise(function (ok) { r.mr.onstop = function () { ok(new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' })); }; try { r.mr.stop(); } catch (e) { ok(null); } }); }
    else if (r.pcm) { try { r.sp.disconnect(); } catch (e) { } blob = wavOf(r.pcm, r.rate); }
    r.stream.getTracks().forEach(function (t) { t.stop(); }); try { r.ctx.close(); } catch (e) { }
    var drop = reason === 'discard' || dur < 400 || !blob || !blob.size;
    if (drop) { emit('end', { discarded: true, reason: reason === 'discard' ? 'discard' : 'error', dur: dur }); emit('state', stateObj()); return; }
    var id = Date.now(), ext = r.pcm ? '.wav' : /ogg/.test(blob.type) ? '.ogg' : '.webm';
    try { await db.put('sons', blob, id); }
    catch (e) { emit('error', { msg: 'Stockage du navigateur plein : note non gardée' }); emit('end', { discarded: true, reason: 'error', dur: dur }); emit('state', stateObj()); return; }
    NOTES.unshift({ id: id, name: r.name, file: r.name + ext, date: r.since, dur: dur, size: blob.size, mime: blob.type, markers: r.marks, tags: NEXT.tags || [], chantier: NEXT.chantier || '', q: r.q });
    saveMeta();
    emit('end', { id: id, uri: '', name: r.name, dur: dur, reason: reason, markers: r.marks, date: r.since, q: r.q });
    emit('state', stateObj());
  }
  window.addEventListener('beforeunload', function (e) { if (R) { e.preventDefault(); e.returnValue = 'Un enregistrement est en cours.'; } });

  /* ---------------- Lecture ---------------- */
  var A = null, P = null, pTick = null;
  function pstate(extra) {
    var o = { id: P ? P.id : -1, name: P ? P.name : '', playing: !!(A && !A.paused && !A.ended), pos: A ? Math.round(A.currentTime * 1000) : 0, dur: A && isFinite(A.duration) ? Math.round(A.duration * 1000) : (P ? P.dur || 0 : 0), speed: P ? P.speed : 1, active: !!A };
    return Object.assign(o, extra || {});
  }
  function stopPlay() { clearInterval(pTick); if (A) { A.pause(); if (A.src) URL.revokeObjectURL(A.src); } A = null; P = null; }
  function blobOf(id) { return db.get('sons', +id); }

  /* ---------------- Dictée (Web Speech API) ---------------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, spOn = false;

  var B = {
    version: function () { return '1-pc'; },
    info: function () { return JSON.stringify({ sdk: 34, mic: micState === 'granted', notif: true, pause: true, svc: true, speech: !!SR, onDevice: false, carnet: false, free: free, folder: 'ce navigateur' }); },
    hasMic: function () { return micState === 'granted'; },
    askPerms: function () { navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); micState = 'granted'; emit('perm', { mic: true }); }, function () { micState = 'denied'; emit('perm', { mic: false }); }); },
    openSettings: function () { M.toast('Micro : icône à gauche de l\'adresse › Autoriser, et Windows › Paramètres › Confidentialité › Microphone', { ms: 7000 }); },
    keepScreen: function (on) { M.keepScreen(on); },
    freeSpace: function () { return free; },
    recStart: function (q) {
      if (R) return JSON.stringify(stateObj());
      if (spOn) return 'busy';
      if (!navigator.mediaDevices || !window.MediaRecorder) return 'nosvc';
      if (micState === 'denied') { emit('error', { msg: 'Micro refusé : autorise-le pour ce site (icône à gauche de l\'adresse)' }); return 'err'; }
      stopPlay(); start(q || 'voice'); return 'ok';
    },
    recPause: function () { if (!R || R.paused) return; R.acc += Date.now() - R.seg; R.paused = true; if (R.mr && R.mr.state === 'recording') R.mr.pause(); emit('state', stateObj()); },
    recResume: function () { if (!R || !R.paused) return; R.seg = Date.now(); R.paused = false; if (R.mr && R.mr.state === 'paused') R.mr.resume(); emit('state', stateObj()); },
    recStop: function () { finish('stop'); },
    recDiscard: function () { finish('discard'); },
    recMark: function (note) { if (!R) return -1; R.marks.push({ t: elapsed(), note: note || '' }); emit('state', stateObj()); return R.marks.length - 1; },
    recNote: function (i, note) { if (R && R.marks[i]) R.marks[i].note = note || ''; },
    recState: function () { return JSON.stringify(stateObj()); },
    recLast: function () { return ''; },
    list: function () { return JSON.stringify(NOTES.map(function (n) { return Object.assign({ uri: '' }, n); })); },
    setNext: function (json) { try { NEXT = JSON.parse(json) || {}; } catch (e) { } },
    setMeta: function (id, json) { var n = byId(id); if (!n) return false; try { Object.assign(n, JSON.parse(json)); saveMeta(); return true; } catch (e) { return false; } },
    rename: function (id, name) {
      var n = byId(id), clean = String(name || '').replace(/[\\/:*?"<>|\n\r]/g, ' ').trim(); if (!n || !clean) return 'err';
      if (NOTES.some(function (x) { return x !== n && x.name === clean; })) return 'exists';
      n.name = clean; n.file = clean + (n.file.match(/\.[a-z0-9]+$/i) || [''])[0]; saveMeta(); return 'ok';
    },
    remove: function (id) { var n = byId(id); if (!n) return 'err'; NOTES = NOTES.filter(function (x) { return x !== n; }); saveMeta(); db.del('sons', +n.id).catch(function () { }); return 'ok'; },
    share: function (ids, text) {
      var l = []; try { l = JSON.parse(ids); } catch (e) { return false; }
      Promise.all(l.map(function (id) { var n = byId(id); return n ? blobOf(id).then(function (b) { return b ? new File([b], n.file, { type: b.type }) : null; }) : null; })).then(function (fs) {
        fs = fs.filter(Boolean); if (!fs.length) return;
        var can = false; try { can = !!(navigator.canShare && navigator.canShare({ files: fs })); } catch (e) { }
        if (can) return M.withGesture(function () { return navigator.share({ files: fs, text: text || undefined }); }, { title: 'Envoyer la note', label: 'Partager…' }).catch(function () { });
        if (fs.length === 1) return M.fs.saveAs(fs[0], fs[0].name).then(function (r) { if (r.ok) M.toast(r.downloaded ? 'Note téléchargée' : 'Note enregistrée : ' + r.name); });
        fs.forEach(function (f) { M.fs.download(f, f.name); }); M.toast(fs.length + ' notes téléchargées');
      });
      return true;
    },
    sendText: function (text, title) {
      M.clip.write((title ? title + '\n\n' : '') + (text || '')).then(function (ok) { M.toast(ok ? 'Texte copié : colle-le dans Carnet ou dans un autre logiciel (Ctrl+V)' : 'Copie impossible', { bad: !ok, ms: 6000 }); });
      return 'share';
    },
    play: function (id, name, pos, speed) {
      if (R) return 'rec';
      stopPlay();
      var n = byId(id); P = { id: n ? n.id : +id, name: name, speed: speed || 1, dur: n ? n.dur : 0 };
      var me = P;
      blobOf(id).then(function (b) {
        if (me !== P) return;
        if (!b) { emit('error', { msg: 'Son introuvable' }); stopPlay(); emit('play', pstate()); return; }
        A = new Audio(URL.createObjectURL(b)); A.playbackRate = Math.max(0.5, Math.min(2, me.speed)); A.preservesPitch = true;
        A.onloadedmetadata = function () { if (pos > 0) A.currentTime = pos / 1000; };
        A.onended = function () { emit('play', pstate({ ended: true })); };
        A.onerror = function () { emit('error', { msg: 'Lecture impossible' }); stopPlay(); emit('play', pstate()); };
        A.play().then(function () { emit('play', pstate()); }, function () { emit('play', pstate()); });
        clearInterval(pTick); pTick = setInterval(function () { if (A && !A.paused) emit('play', pstate()); }, 250);
      });
      return 'ok';
    },
    playCmd: function (action, arg) {
      if (action === 'pstop') { stopPlay(); emit('play', pstate()); return; }
      if (!A) return;
      if (action === 'toggle') { if (A.paused || A.ended) A.play().catch(function () { }); else A.pause(); }
      else if (action === 'seek') A.currentTime = Math.max(0, (+arg || 0) / 1000);
      else if (action === 'skip') A.currentTime = Math.max(0, A.currentTime + (+arg || 0) / 1000);
      else if (action === 'speed') { P.speed = Math.max(0.5, Math.min(2, +arg || 1)); A.playbackRate = P.speed; }
      setTimeout(function () { emit('play', pstate()); }, 30);
    },
    playState: function () { return JSON.stringify(A ? pstate() : {}); },
    wave: function (id, n) {
      blobOf(id).then(function (b) { if (!b) throw new Error('son introuvable'); return b.arrayBuffer(); }).then(function (buf) {
        var ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 44100);
        return ctx.decodeAudioData(buf);
      }).then(function (ab) {
        var d = ab.getChannelData(0), k = Math.max(1, Math.floor(d.length / n)), peaks = [], mx = 0;
        for (var i = 0; i < n; i++) { var p = 0; for (var j = i * k; j < Math.min(d.length, (i + 1) * k); j++) p = Math.max(p, Math.abs(d[j])); peaks.push(p); mx = Math.max(mx, p); }
        emit('wave', { id: id, peaks: peaks.map(function (p) { return mx ? Math.round(p / mx * 1000) / 1000 : 0; }), dur: Math.round(ab.duration * 1000) });
      }).catch(function () { emit('wave', { id: id, error: true }); });
    },
    trim: function (id, s, e) {
      var n = byId(id);
      blobOf(id).then(function (b) { if (!b) throw new Error('son introuvable'); return b.arrayBuffer(); }).then(function (buf) {
        return new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 44100).decodeAudioData(buf);
      }).then(function (ab) {
        var r = ab.sampleRate, a = Math.max(0, Math.floor(s / 1000 * r)), z = Math.min(ab.length, Math.ceil(e / 1000 * r));
        if (z - a < r * 0.3) throw new Error('extrait trop court');
        var blob = wavOf([ab.getChannelData(0).slice(a, z)], r), nid = Date.now(), name = (n ? n.name : 'Note') + ' (extrait)';
        return db.put('sons', blob, nid).then(function () {
          NOTES.unshift({ id: nid, name: name, file: name + '.wav', date: Date.now(), dur: Math.round((z - a) / r * 1000), size: blob.size, mime: 'audio/wav', markers: [], tags: n ? n.tags : [], chantier: n ? n.chantier : '', q: 'wav' });
          saveMeta(); emit('trim', { ok: true, id: nid, name: name });
        });
      }).catch(function (err) { emit('trim', { ok: false, msg: err && err.message || 'erreur' }); });
    },
    speechStart: function () {
      if (!SR) return 'none';
      if (R) return 'busy';
      spOn = true;
      var go = function () {
        rec = new SR(); rec.lang = 'fr-FR'; rec.continuous = true; rec.interimResults = true;
        rec.onstart = function () { emit('speech', { state: 'listen', onDevice: false }); };
        rec.onresult = function (e) {
          for (var i = e.resultIndex; i < e.results.length; i++) { var t = e.results[i][0].transcript; if (e.results[i].isFinal) { if (t.trim()) emit('speech', { 'final': t.trim() }); } else emit('speech', { partial: t }); }
        };
        rec.onerror = function (e) {
          if (e.error === 'no-speech' || e.error === 'aborted') return;
          spOn = false;
          emit('speech', { state: 'error', msg: e.error === 'network' ? 'La dictée du navigateur passe par internet : pas de connexion.' : e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Micro ou dictée refusés pour ce site' : 'Dictée interrompue (' + e.error + ')' });
        };
        rec.onend = function () { if (spOn) { try { rec.start(); } catch (x) { } } else emit('speech', { state: 'stop' }); };
        try { rec.start(); } catch (x) { spOn = false; emit('speech', { state: 'error', msg: 'Dictée impossible' }); }
      };
      go(); return 'ok';
    },
    speechStop: function () { spOn = false; if (rec) { try { rec.stop(); } catch (e) { } } emit('speech', { state: 'stop' }); },
    setupShortcut: function () { return false; },
    pinShortcut: function () { M.unavailable('Le raccourci sur l\'écran d\'accueil', 'épingle plutôt l\'appli à la barre des tâches'); return false; }
  };
  window.MAGDicta = B;

  /* Clavier : R enregistrer / arrêter, Espace pause / lecture, M marqueur, Échap fermer */
  function click(id) { var b = document.getElementById(id); if (!b || !b.getClientRects().length) return false; b.click(); }
  M.keys({
    'r': function () { if (R) return click('bStop'); return click('bigRec'); },
    'm': function () { if (!R) return false; return click('bMark'); },
    'space': function () { if (R) return click('bPause'); if (A) { B.playCmd('toggle'); return; } return false; },
    'escape': function () { if (R) return false; var s = document.querySelector('.scr:not([hidden]), .sheet:not([hidden])'); if (!s) return false; history.back(); }
  });
})();
