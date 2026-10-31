/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-liseuse/lis-audio.js : ne pas modifier ici. */
/* =====================================================================
   Liseuse : lecture continue à voix haute (livre audio).
   Commun à l'APK (applis/www-liseuse) et à Liseuse sur PC (copie générée par pc/build-pc.py).

   LisAudio.split(texte, coupures) → [{o, n, p}]
     phrases du texte d'un chapitre (o = décalage, n = longueur, p = dernière phrase d'un paragraphe) ;
     coupures = débuts de blocs (paragraphes, titres) quand le texte vient d'une page HTML.
   LisAudio.speakable(texte) → texte à dire (tirets de dialogue, appels de note, chiffres romains des titres).
   LisAudio.create(opt) → lecteur :
     opt.source   {count, text(s) → Promise<{text, breaks}>, label(s)} : chapitres d'un EPUB, pages d'un PDF
     opt.vx       moteur Piper (MJVoix.create, mj-voix.js) ou null
     opt.android  pont MAGLiseuse avec audioOpen… (lecture native : AudioTrack ou TextToSpeech, service au premier plan,
                  MediaSession) ; sinon lecture dans la page (Web Audio, ou speechSynthesis pour la voix du système)
     opt.settings() → {voice: 'system' | id Piper, rate, fx, fxo}
     opt.meta()   → {book, title, author, cover} (notification, écran verrouillé, touches multimédia)
     opt.on       {sentence(it), state(st), finish(), fallback(msg), sleep(), error(msg)}
   Méthodes : play({s, o}), pause(), resume(), toggle(), next(), prev(), nextCh(), prevCh(), reconfigure(),
              sleep({min} | {chap:true} | null), stop(), status(), native(événement du pont).

   Production : chaque phrase est synthétisée (Piper, dans le worker de mj-voix.js) puis confiée au lecteur, avec
   2 phrases d'avance au moins et une réserve de son (25 s écran allumé ; 5 min sur Android quand la page est cachée,
   écran éteint compris) : si la WebView est ralentie ou suspendue, le lecteur natif a de quoi continuer.
   La lecture native signale chaque phrase commencée (surlignage, position mémorisée) et chaque phrase finie (suite).
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------------- Découpage en phrases ---------------- */
  var ABBR = {};
  ('m mm mme mmes mlle mlles dr drs pr me mes mgr st ste sts stes cf p pp vol vols chap art no fig ed éd av apr ex env t op cit ibid id tél tel ' +
    'bd boul ch col dép dep dir gal gén gen hab sq sqq suiv tr trad vs vve cie ets jr sr mr mrs ms ms mm ann anc env éts lt cdt cne col gal adj sgt').split(' ').forEach(function (w) { ABBR[w] = 1; });
  var LETTER = /[\p{L}\p{N}]/u, UPPERISH = /[\p{Lu}\p{N}«"“„(\[—–\-‘'¿¡]/u;
  function isAbbr(text, dot) {
    var j = dot;
    while (j > 0 && /[\p{L}’'\-]/u.test(text[j - 1])) j--;
    var w = text.slice(j, dot);
    if (!w) return false;
    if (w.length === 1 && /\p{Lu}/u.test(w)) return true;            // initiale : « J. Verne »
    if (/^(?:\p{Lu}\.){1,3}\p{Lu}?$/u.test(text.slice(Math.max(0, j - 4), dot))) return true;   // sigles « S.N.C.F. »
    return !!ABBR[w.toLowerCase()];
  }
  /** Bornes de blocs : coupures données + retours à la ligne */
  function blocks(text, breaks) {
    var cuts = {}, out = [], i;
    (breaks || []).forEach(function (b) { if (b > 0 && b < text.length) cuts[b] = 1; });
    for (i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) { cuts[i] = 1; cuts[i + 1] = 1; }
    var keys = Object.keys(cuts).map(Number).sort(function (a, b) { return a - b; }), a = 0;
    keys.forEach(function (k) { if (k > a) out.push([a, k]); a = Math.max(a, k); });
    if (a < text.length) out.push([a, text.length]);
    return out;
  }
  var MAXLEN = 300;
  function split(text, breaks) {
    text = String(text || '');
    var out = [];
    function push(o, e, last) {
      while (o < e && /\s/.test(text[o])) o++;
      while (e > o && /\s/.test(text[e - 1])) e--;
      if (e <= o || !LETTER.test(text.slice(o, e))) return;
      while (e - o > MAXLEN) {            // phrase très longue : coupée à un point-virgule, deux-points, tiret ou virgule
        var seg = text.slice(o, o + MAXLEN), cut = -1, m, re = /[;:]\s|\s[—–]\s|,\s/g;
        while ((m = re.exec(seg))) if (m.index >= 100) cut = m.index + 1;
        if (cut < 0) { cut = seg.lastIndexOf(' '); if (cut < 60) cut = MAXLEN; }
        out.push({ o: o, n: cut, p: false }); o += cut;
        while (o < e && /\s/.test(text[o])) o++;
      }
      out.push({ o: o, n: e - o, p: !!last });
    }
    blocks(text, breaks).forEach(function (b) {
      var a = b[0], end = b[1], re = /[.!?…]+[»”"’)\]]*(?=\s|$)/g, m, start = a, seg = text.slice(a, end), found = [];
      while ((m = re.exec(seg))) {
        var e = a + m.index + m[0].length, k = e;
        while (k < end && /\s/.test(text[k])) k++;
        if (k >= end) continue;                                          // fin du bloc : coupe naturelle
        if (!UPPERISH.test(text[k])) continue;                          // « Viens ! dit-il » : même phrase
        if (m[0] === '.' && isAbbr(text, a + m.index)) continue;        // « M. Dupont », « p. 12 »
        found.push(e);
      }
      found.forEach(function (e) { push(start, e, false); start = e; });
      push(start, end, true);
    });
    return out;
  }
  /* Chiffres romains des titres (« CHAPITRE IV » → « Chapitre 4 ») */
  function roman(s) {
    var v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }, n = 0, u = s.toUpperCase();
    for (var i = 0; i < u.length; i++) { var a = v[u[i]], b = v[u[i + 1]] || 0; if (!a) return null; n += a < b ? -a : a; }
    return n > 0 && n < 4000 ? n : null;
  }
  function speakable(t) {
    t = String(t || '').replace(/\[(?:\d{1,3}|[a-z*])\]/gi, ' ').replace(/[*_#|~^]+/g, ' ');
    t = t.replace(/\bMM\.\s/g, 'Messieurs ').replace(/\bpp?\.\s?(?=\d)/g, 'page ').replace(/\bt\.\s?(?=\d)/g, 'tome ').replace(/\bvol\.\s?(?=\d)/gi, 'volume ').replace(/\bchap\.\s?(?=\d)/gi, 'chapitre ');
    t = t.replace(/^\s*[—–\-]\s*/, '').replace(/\s[—–]\s/g, ', ').replace(/[—–]/g, ', ');
    t = t.replace(/\b(chapitre|livre|tome|partie|acte|sc[eè]ne|section|volume|chant|lettre)\s+([IVXLCDM]{1,7})\b\.?/gi, function (all, w, r) { var n = roman(r); return n ? w + ' ' + n + '.' : all; });
    var only = /^\s*([IVXLCDM]{1,7})\s*[.\-–—]?\s*$/.exec(t);
    if (only && roman(only[1])) t = String(roman(only[1])) + '.';
    if (/^[\p{Lu}\s\d'’,.\-]{4,}$/u.test(t) && /\p{Lu}{3}/u.test(t)) t = t.charAt(0) + t.slice(1).toLowerCase();   // titres en capitales
    return t.replace(/\s+/g, ' ').replace(/\s+([,.;:!?…])/g, '$1').trim();
  }

  /* ---------------- Lecteur dans la page (PC, navigateur) ---------------- */
  // Joue les phrases l'une après l'autre : son Piper (Web Audio) ou voix du système (speechSynthesis).
  // Garde les 3 dernières phrases pour « phrase précédente ». Les touches multimédia passent par la Media Session.
  function webSink(on) {
    var ctx = null, q = [], cur = null, hist = [], paused = true, src = null, sleepT = null, sleepChap = -1, keepAlive = null;
    function ac() { if (!ctx) { var C = root.AudioContext || root.webkitAudioContext; ctx = new C(); } return ctx; }
    function alive(on2) {   // un élément <audio> silencieux en boucle : rend la Media Session active (touches du clavier)
      try {
        if (!keepAlive) { keepAlive = document.createElement('audio'); keepAlive.loop = true; keepAlive.src = silentWav(); keepAlive.setAttribute('aria-hidden', 'true'); }
        if (on2) { var p = keepAlive.play(); if (p && p.catch) p.catch(function () { }); } else keepAlive.pause();
      } catch (e) { }
    }
    function finish(it) {
      if (cur !== it) return;
      src = null; hist.push(it); if (hist.length > 3) hist.shift(); cur = null;
      on.end(it.id); next();
    }
    function next() {
      if (paused || cur) return;
      var it = q.shift();
      if (!it) { on.empty(); return; }
      if (sleepChap >= 0 && it.meta && it.meta.s !== sleepChap) { q.unshift(it); sleepChap = -1; pause(); on.sleep(); return; }
      cur = it; it.t0 = Date.now();
      on.start(it.id);
      if (it.pcm) {
        var c = ac(); if (c.state === 'suspended') c.resume().catch(function () { });
        var b = c.createBuffer(1, it.pcm.length, it.sr); b.getChannelData(0).set(it.pcm);
        var s = c.createBufferSource(); s.buffer = b; s.connect(c.destination);
        s.onended = function () { if (src === s) finish(it); };
        src = s; s.start();
      } else {
        var ss = root.speechSynthesis;
        if (!ss || !root.SpeechSynthesisUtterance) { setTimeout(function () { finish(it); }, 50); return; }
        var u = new SpeechSynthesisUtterance(it.text); u.lang = 'fr-FR'; u.rate = it.rate || 1;
        var vs = ss.getVoices().filter(function (v) { return /^fr/i.test(v.lang); }); if (vs.length) u.voice = vs[0];
        u.onend = function () { if (src === u) finish(it); };
        u.onerror = function (ev) { if (ev && (ev.error === 'interrupted' || ev.error === 'canceled')) return; if (src === u) finish(it); };
        src = u; ss.speak(u);
        it.timer = setTimeout(function () { if (src === u && !ss.speaking && !paused) finish(it); }, 4000 + it.text.length * 140 / (it.rate || 1));   // filet si la voix ne répond pas
      }
    }
    function halt() {
      var s = src; src = null;
      if (s && s.stop) try { s.onended = null; s.stop(); } catch (e) { }
      if (s && !s.stop) try { root.speechSynthesis.cancel(); } catch (e) { }
      if (cur && cur.timer) clearTimeout(cur.timer);
    }
    function pause() {
      if (paused) return; paused = true;
      if (cur && cur.pcm && ctx) { ctx.suspend().catch(function () { }); }
      else if (cur) { halt(); q.unshift(cur); cur = null; }     // voix du système : reprend au début de la phrase
      alive(false);
    }
    function play() {
      if (!paused) return; paused = false; alive(true);
      if (cur && cur.pcm && ctx) { ctx.resume().catch(function () { }); return; }
      next();
    }
    return {
      kind: 'web',
      open: function () { alive(true); },
      pushPcm: function (id, pcm, sr, meta) { q.push({ id: id, pcm: pcm, sr: sr, meta: meta }); if (!paused && !cur) next(); },
      pushText: function (id, text, rate, meta) { q.push({ id: id, text: text, rate: rate, meta: meta }); if (!paused && !cur) next(); },
      play: play, pause: pause,
      skip: function (d) {
        if (d > 0) { if (!cur) return; var it = cur; halt(); cur = null; if (ctx && ctx.state === 'suspended' && !paused) ctx.resume(); hist.push(it); if (hist.length > 3) hist.shift(); on.end(it.id); if (!paused) next(); return; }
        var back = cur && Date.now() - cur.t0 < 2500 && hist.length ? hist.pop() : null;
        if (cur) { halt(); q.unshift(cur); cur = null; }
        if (back) q.unshift(back);
        if (!paused) next();
      },
      clear: function (keep) { q = []; if (!keep) { halt(); cur = null; hist = []; } },
      stop: function () { q = []; halt(); cur = null; hist = []; paused = true; alive(false); clearTimeout(sleepT); sleepChap = -1; if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () { }); },
      sleep: function (ms, chap) {
        clearTimeout(sleepT); sleepChap = -1;
        if (ms > 0) sleepT = setTimeout(function () { pause(); on.sleep(); }, ms);
        if (chap >= 0) sleepChap = chap;
      },
      paused: function () { return paused; }
    };
  }
  var SILENT = null;
  function silentWav() {
    if (SILENT) return SILENT;
    var sr = 8000, n = sr * 2, b = new ArrayBuffer(44 + n * 2), d = new DataView(b), w = function (o, s) { for (var i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
    d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
    var u = new Uint8Array(b), s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return (SILENT = 'data:audio/wav;base64,' + btoa(s));
  }

  /* ---------------- Lecteur natif d'Android (pont MAGLiseuse, LiseuseBridge.java) ---------------- */
  function androidSink(A) {
    function b64(i16) { var u8 = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength), s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
    function i16(x) { var o = new Int16Array(x.length); for (var i = 0; i < x.length; i++) { var v = x[i] > 1 ? 1 : x[i] < -1 ? -1 : x[i]; o[i] = v < 0 ? v * 32768 : v * 32767; } return o; }
    return {
      kind: 'android',
      open: function (meta) { var r = ''; try { r = A.audioOpen(JSON.stringify(meta || {})); } catch (e) { r = 'err:' + e.message; } return r; },
      pushPcm: function (id, pcm, sr, meta) { A.audioPush(id, b64(i16(pcm)), sr, JSON.stringify(meta || {})); },
      pushText: function (id, text, rate, meta) { A.audioPushText(id, text, rate || 1, JSON.stringify(meta || {})); },
      play: function () { A.audioPlay(); }, pause: function () { A.audioPause(); },
      skip: function (d) { A.audioSkip(d); }, clear: function (keep) { A.audioClear(!!keep); },
      stop: function () { A.audioStop(); }, sleep: function (ms, chap) { A.audioSleep(ms || 0, chap == null ? -1 : chap); },
      meta: function (m) { try { A.audioMeta(JSON.stringify(m || {})); } catch (e) { } }
    };
  }

  /* ---------------- Lecteur (production des phrases) ---------------- */
  function create(opt) {
    var on = opt.on || {}, A = opt.android && opt.android.audioPush ? opt.android : null;
    var L = { state: 'stop', cur: null, voice: '', fallbackMsg: '', sleepAt: 0, sleepChap: false, stats: { first: 0, gen: [] } };
    var tok = 0, secs = {}, q = [], np = null, busy = false, endReached = false, curQ = null, t0 = 0, sysForced = false, opened = false;
    function emit(k, x) { if (on[k]) try { on[k](x); } catch (e) { console.error(e); } }
    function setState(s) { if (L.state !== s) { L.state = s; emit('state', s); } }
    var sinkOn = {
      start: function (id) {
        var it = byId(id); if (!it) return;
        curQ = it; it.t0 = Date.now(); it.ended = false;   // une phrase rejouée (« phrase précédente ») redevient en cours
        if (!L.stats.first && t0) L.stats.first = Date.now() - t0;
        L.cur = { s: it.s, i: it.i, o: it.o, n: it.n, p: it.p, id: id };
        if (L.state === 'wait') setState('play');
        emit('sentence', L.cur);
        if (L.sleepChap === true) L.sleepChap = it.s;
        pump();
      },
      end: function (id) {
        var it = byId(id); if (it) it.ended = true;
        var done = q.filter(function (x) { return x.ended; });   // on garde les 4 dernières phrases lues (retour en arrière)
        if (done.length > 4) { var drop = done.slice(0, done.length - 4); q = q.filter(function (x) { return drop.indexOf(x) < 0; }); }
        if (endReached && !q.some(function (x) { return !x.ended; })) { finish(); return; }
        pump();
      },
      empty: function () {
        if (endReached && !q.some(function (x) { return !x.ended; })) { finish(); return; }
        if (L.state === 'play') { setState('wait'); pump(); }
      },
      sleep: function () { L.sleepAt = 0; L.sleepChap = false; setState('pause'); emit('sleep'); }
    };
    var sink = A ? androidSink(A) : webSink(sinkOn);
    function byId(id) { for (var i = 0; i < q.length; i++) if (q[i].id === id) return q[i]; return null; }
    function finish() { setState('stop'); emit('finish'); try { sink.stop(); } catch (e) { } opened = false; }

    /* --- textes des chapitres, phrases --- */
    function sec(s) {
      if (secs[s]) return secs[s];
      var p = Promise.resolve(opt.source.text(s)).then(function (r) { r = r || { text: '' }; var o = { text: r.text || '', items: split(r.text || '', r.breaks) }; secs[s] = o; return o; });
      secs[s] = p; return p;
    }
    function load(s) { return Promise.resolve(sec(s)); }
    /** Prochaine phrase à produire (passe aux chapitres suivants ; null à la fin du livre) */
    function nextItem(my) {
      if (!np) return Promise.resolve(null);
      var s = np.s, i = np.i;
      return (function step() {
        if (my !== tok) return Promise.resolve(null);
        if (s >= opt.source.count) return Promise.resolve(null);
        return load(s).then(function (S) {
          if (my !== tok) return null;
          if (i < S.items.length) { var x = S.items[i]; np = { s: s, i: i + 1 }; return { s: s, i: i, o: x.o, n: x.n, p: x.p, text: S.text.slice(x.o, x.o + x.n) }; }
          s++; i = 0; return step();
        });
      })();
    }
    function settings() { var st = opt.settings ? opt.settings() : {}; if (sysForced || !opt.vx) st.voice = 'system'; return st; }
    function usePiper(st) { return st.voice && st.voice !== 'system' && opt.vx && opt.vx.usable(st.voice); }
    function ahead() {
      var t = 0, now = Date.now();
      q.forEach(function (x) { if (x.ended) return; t += x === curQ && x.t0 ? Math.max(0, x.dur - (now - x.t0) / 1000) : x.dur; });
      return t;
    }
    function target() { var hidden = typeof document !== 'undefined' && document.hidden; return A ? (hidden ? (opt.aheadBg || 300) : (opt.aheadFg || 45)) : (opt.aheadWeb || 25); }
    function pump() {
      if (busy || (L.state !== 'play' && L.state !== 'wait')) return;
      busy = true; var my = tok;
      (function loop() {
        if (my !== tok || (L.state !== 'play' && L.state !== 'wait')) return Promise.resolve();
        var waiting = q.filter(function (x) { return !x.ended && x !== curQ; }).length;
        if (waiting >= 2 && ahead() >= target()) return Promise.resolve();
        return nextItem(my).then(function (it) {
          if (my !== tok) return;
          if (!it) { endReached = true; if (!q.some(function (x) { return !x.ended; })) finish(); return; }
          return produce(it, my).then(loop);
        });
      })().catch(function (e) { console.warn('Lecture : ', e); emit('error', String(e && e.message || e)); })
        .then(function () { busy = false; if (my !== tok) pump(); });
    }
    function produce(it, my) {
      var st = settings(), text = speakable(it.text), id = 'p' + my + '-' + it.s + '-' + it.i;
      var meta = { s: it.s, i: it.i, o: it.o, n: it.n, label: opt.source.label ? opt.source.label(it.s) : '' };
      if (!text) { return Promise.resolve(); }
      if (!usePiper(st)) {
        var rate = +st.rate || 1, d = Math.max(0.6, text.length / (14.5 * rate));
        it.id = id; it.dur = d; q.push(it); L.voice = 'system';
        sink.pushText(id, text, rate, meta);
        return Promise.resolve();
      }
      var g0 = Date.now();
      return opt.vx.chunk(text, { voice: st.voice, rate: st.rate, fx: st.fx || 'aucun', fxo: st.fxo || null, volume: 1 }).then(function (o) {
        if (my !== tok) return;
        L.voice = st.voice;
        var gap = Math.round(o.sr * (it.p ? 0.55 : 0.18) / Math.max(0.75, +st.rate || 1)), pcm = new Float32Array(o.samples.length + gap);
        pcm.set(o.samples, 0);
        it.id = id; it.dur = pcm.length / o.sr; q.push(it);
        L.stats.gen.push({ dur: o.dur, ms: Date.now() - g0, genMs: o.genMs, chars: text.length });
        if (L.stats.gen.length > 400) L.stats.gen.shift();
        sink.pushPcm(id, pcm, o.sr, meta);
      }, function (e) {
        if (my !== tok) return;
        // Piper indisponible (moteur, voix) : voix du système pour la suite, sans arrêter la lecture
        sysForced = true; L.fallbackMsg = String(e && (e.message || e.msg) || 'Piper indisponible');
        emit('fallback', L.fallbackMsg);
        return produce(it, my);
      });
    }

    /* --- commandes --- */
    function openSink() {
      if (opened) return '';
      var m = opt.meta ? opt.meta() : {}, st = settings();
      m.mode = usePiper(st) ? 'pcm' : 'tts';
      var r = sink.open(m) || '';
      if (!/^err/.test(r)) opened = true;
      return r;
    }
    L.play = function (from) {
      from = from || L.cur || { s: 0, o: 0 };
      tok++; t0 = Date.now(); L.stats.first = 0;
      var my = tok;
      try { sink.clear(false); } catch (e) { }
      q = []; curQ = null; endReached = false;
      var r = openSink();
      if (/^err/.test(r)) { emit('error', r.replace(/^err:?/, '')); }
      setState('wait');
      return load(from.s).then(function (S) {
        if (my !== tok) return;
        var i = 0;
        while (i < S.items.length - 1 && S.items[i].o + S.items[i].n <= (from.o || 0)) i++;
        np = { s: from.s, i: S.items.length ? i : 0 };
        L.cur = S.items.length ? { s: from.s, i: i, o: S.items[i].o, n: S.items[i].n } : { s: from.s, i: 0, o: 0, n: 0 };
        sink.play(); pump();
      });
    };
    L.pause = function () { if (L.state === 'play' || L.state === 'wait') { sink.pause(); setState('pause'); } };
    L.resume = function () {
      if (L.state === 'pause') {
        if (!q.some(function (x) { return !x.ended; })) return L.play(L.cur);
        openSink(); sink.play(); setState('play'); pump(); return Promise.resolve();
      }
      if (L.state === 'stop') return L.play(L.cur);
      return Promise.resolve();
    };
    L.toggle = function () { if (L.state === 'play' || L.state === 'wait') L.pause(); else L.resume(); };
    L.next = function () { if (L.state === 'stop') return; sink.skip(1); };
    L.prev = function () { if (L.state === 'stop') return; sink.skip(-1); };
    L.nextCh = function () {
      var s = (L.cur ? L.cur.s : 0) + 1;
      if (s >= opt.source.count) return false;
      L.play({ s: s, o: 0 }); return true;
    };
    L.prevCh = function () {
      var c = L.cur || { s: 0, i: 0 }, s = c.i > 2 ? c.s : Math.max(0, c.s - 1);
      L.play({ s: s, o: 0 }); return true;
    };
    /** Vitesse, voix ou effet changés : la phrase en cours finit, la suite est refaite avec les nouveaux réglages */
    L.reconfigure = function (restart) {
      if (L.state === 'stop') return;
      sysForced = false;
      if (restart || !usePiper(settings()) || L.state === 'pause') { var c = L.cur; var was = L.state; return L.play(c).then(function () { if (was === 'pause') L.pause(); }); }
      tok++; var keep = curQ && !curQ.ended ? curQ : null;
      try { sink.clear(true); } catch (e) { }
      q = keep ? [keep] : []; endReached = false;
      if (keep) np = { s: keep.s, i: keep.i + 1 }; else if (L.cur) np = { s: L.cur.s, i: L.cur.i };
      pump();
    };
    L.sleep = function (spec) {
      L.sleepAt = 0; L.sleepChap = false;
      if (spec && spec.min > 0) { L.sleepAt = Date.now() + spec.min * 60000; sink.sleep(spec.min * 60000, -1); }
      else if (spec && spec.chap) { L.sleepChap = L.cur ? L.cur.s : true; sink.sleep(0, L.cur ? L.cur.s : -1); }
      else sink.sleep(0, -1);
      emit('state', L.state);
    };
    L.stop = function () { tok++; try { sink.stop(); } catch (e) { } q = []; curQ = null; opened = false; L.sleepAt = 0; L.sleepChap = false; setState('stop'); };
    L.meta = function () { if (sink.meta && opt.meta) sink.meta(opt.meta()); };
    L.status = function () { return { state: L.state, cur: L.cur, ahead: ahead(), queued: q.filter(function (x) { return !x.ended; }).length, voice: L.voice, sleepAt: L.sleepAt, sleepChap: L.sleepChap, fallback: sysForced }; };
    L.sections = function () { return secs; };
    L.items = function (s) { return load(s).then(function (S) { return S.items; }); };
    /** Événements du lecteur natif : {ev: start|end|empty|sleep|cmd|state, id, cmd} */
    L.native = function (o) {
      if (!o) return;
      if (o.ev === 'start') sinkOn.start(o.id);
      else if (o.ev === 'end') sinkOn.end(o.id);
      else if (o.ev === 'empty') sinkOn.empty();
      else if (o.ev === 'sleep') sinkOn.sleep();
      else if (o.ev === 'paused') { if (L.state === 'play' || L.state === 'wait') setState('pause'); }
      else if (o.ev === 'playing') { if (L.state === 'pause') { setState('play'); if (!q.some(function (x) { return !x.ended; })) L.play(L.cur); else pump(); } }
      else if (o.ev === 'stopped') { tok++; q = []; curQ = null; opened = false; setState('stop'); }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { pump(); });
    return L;
  }

  root.LisAudio = { split: split, speakable: speakable, create: create, roman: roman, silentWav: silentWav };
})(typeof window !== 'undefined' ? window : this);
