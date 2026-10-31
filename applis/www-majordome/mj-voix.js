/* =====================================================================
   Majordome : voix neuronales Piper hors ligne et effet de voix « Jarvis ».
   Commun à l'APK (applis/www-majordome), à Majordome sur PC et au Fond Jarvis (page et Lively).

   MJVoix.create(opt) → moteur :
     opt.engine  dossier du moteur sherpa-onnx WASM (piper/…), opt.worker (mj-voix-worker.js), opt.phon (mj-phon.js)
     opt.store   'idb' (navigateur, Lively : IndexedDB « mj-voix ») ou un objet Android (pont MajordomeBridge :
                 piperState, piperDownload, piperPick, piperDelete, piperDir ; fichiers lus par Capacitor.convertFileSrc)
     opt.sink    lecture déléguée (Android : AudioTrack, focus audio, micro coupé) : {play(id, Int16Array, sr, durée) → Promise, stop()} ;
                 sinon Web Audio dans la page.
   moteur.speak(texte, réglages, rappels) → Promise (fin de la parole). Rejet {fallback:true} si Piper n'est pas utilisable :
     l'appelant passe alors, sans message, aux voix du système.
   Découpage par phrases (la première part vite, au besoin coupée à la virgule) ; la phrase suivante est synthétisée
   pendant la lecture de la précédente. Le niveau envoyé à la sphère est le RMS réel de l'audio produit (après effet).

   Effet (Web Audio hors ligne, OfflineAudioContext, même rendu sur Android puisque le son est calculé ici) :
     préréglages Aucun, Discret, Majordome, IA de film, Radio ; réglages fins : réverbération courte, chorus / flanger,
     passe-haut / passe-bande, saturation, grave, hauteur. Sortie normalisée sous −1 dBFS : jamais d'écrêtage.
     Les voix du système (speechSynthesis, TextToSpeech) ne passent pas par Web Audio : effet réservé à Piper.
     Effet générique : il n'imite la voix d'aucune personne réelle.

   Liseuse (lecture continue des livres) charge ce même fichier : moteur.chunk(phrase, réglages) synthétise une phrase
   sans la lire (Liseuse la confie à son lecteur : AudioTrack sur Android, Web Audio sur PC). Sur Android, les voix sont
   celles de Majordome, lues par Liseuse à travers un fournisseur protégé par signature (opt.store = pont de Liseuse).

   Voix (licences vérifiées dans les MODEL_CARD de rhasspy/piper-voices ; fr_FR-tom-medium exclue : AGPL-3.0) :
     Pierre (UPMC, homme, CC BY-SA 4.0), Jessica (UPMC, femme, CC BY-SA 4.0), Gilles (homme, CC0), Siwis (femme, CC BY 4.0).
   Téléchargement unique depuis huggingface.co/rhasspy/piper-voices, somme SHA-256 vérifiée (API de HuggingFace : oid LFS),
   puis gardé sur l'appareil. Repli : « Choisir les fichiers téléchargés » (.onnx et .onnx.json).
   ===================================================================== */
(function (root) {
  'use strict';
  var HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/', HFAPI = 'https://huggingface.co/api/models/rhasspy/piper-voices/tree/main/';
  var MODELS = {
    // sha256 / size : fichiers .onnx de huggingface.co/rhasspy/piper-voices (révision b4e358f, vérifiés le 31/10/2026) ;
    // une somme différente est aussi acceptée si l'API de HuggingFace l'annonce (voix mise à jour en amont)
    'fr_FR-upmc-medium': { dir: 'fr/fr_FR/upmc/medium/', size: 76733615, sha256: '9abb3800c199148897a9ed64e100d224f3de83579f100044174ad19418f1786f', sr: 22050, lic: 'CC BY-SA 4.0', src: 'UPMC (Pierre et Jessica), github.com/marytts/upmc-pierre-data' },
    'fr_FR-gilles-low': { dir: 'fr/fr_FR/gilles/low/', size: 63104526, sha256: '5cd711846720e261c2a176f6924c198a7424d0a75dd4b0a5357a5fb9cb739285', sr: 16000, lic: 'CC0', src: 'French Single Speaker Speech Dataset (Kaggle)' },
    'fr_FR-siwis-medium': { dir: 'fr/fr_FR/siwis/medium/', size: 63201294, sha256: '641d1ab097da2b81128c076810edb052b385decc8be3381814802a64a73baf99', sr: 22050, lic: 'CC BY 4.0', src: 'SIWIS, université d\'Édimbourg' }
  };
  var VOICES = [
    { id: 'pierre', name: 'Pierre', desc: 'Homme, voix posée', model: 'fr_FR-upmc-medium', sid: 1 },
    { id: 'gilles', name: 'Gilles', desc: 'Homme, timbre grave (qualité « basse », 16 kHz)', model: 'fr_FR-gilles-low', sid: 0 },
    { id: 'siwis', name: 'Siwis', desc: 'Femme, voix claire', model: 'fr_FR-siwis-medium', sid: 0 },
    { id: 'jessica', name: 'Jessica', desc: 'Femme, voix douce', model: 'fr_FR-upmc-medium', sid: 0 }
  ];
  function voice(id) { return VOICES.filter(function (v) { return v.id === id; })[0] || VOICES[0]; }
  function mo(n) { return Math.round(n / 1048576) + ' Mo'; }

  /* ---------------- Effets ---------------- */
  // pitch : facteur de hauteur (rééchantillonnage, la durée est compensée à la synthèse) ; hp / lp : coupures (Hz) ;
  // bass : plateau grave (dB, 180 Hz) ; presence : bosse à 3 kHz (dB) ; drive : saturation 0..1 ;
  // chorus : 0..1 ; flanger : vrai = retard court et réinjecté ; reverb : 0..1 (envoi) ; room : durée de la queue (s) ; metal : résonance de la queue
  var FX = {
    aucun: { name: 'Aucun', pitch: 1, hp: 0, lp: 0, bass: 0, presence: 0, drive: 0, chorus: 0, flanger: false, reverb: 0, room: 0.3, metal: 0 },
    discret: { name: 'Discret', pitch: 1, hp: 70, lp: 0, bass: 1, presence: 1.5, drive: 0, chorus: 0, flanger: false, reverb: 0.10, room: 0.28, metal: 0 },
    majordome: { name: 'Majordome', pitch: 0.97, hp: 60, lp: 0, bass: 2.5, presence: 2, drive: 0.06, chorus: 0.12, flanger: false, reverb: 0.16, room: 0.42, metal: 0.1 },
    ia: { name: 'IA de film', pitch: 0.95, hp: 120, lp: 9500, bass: 1.5, presence: 3, drive: 0.14, chorus: 0.35, flanger: true, reverb: 0.24, room: 0.55, metal: 0.55 },
    radio: { name: 'Radio', pitch: 1, hp: 320, lp: 3400, bass: -4, presence: 4, drive: 0.32, chorus: 0, flanger: false, reverb: 0.04, room: 0.18, metal: 0 }
  };
  var FX_KEYS = ['pitch', 'hp', 'lp', 'bass', 'presence', 'drive', 'chorus', 'flanger', 'reverb', 'room', 'metal'];
  function fxParams(name, over) {
    var b = FX[name] || FX.aucun, o = {};
    FX_KEYS.forEach(function (k) { o[k] = over && over[k] != null ? over[k] : b[k]; });
    o.pitch = Math.max(0.8, Math.min(1.25, +o.pitch || 1));
    o.drive = Math.max(0, Math.min(1, +o.drive || 0)); o.chorus = Math.max(0, Math.min(1, +o.chorus || 0)); o.reverb = Math.max(0, Math.min(0.6, +o.reverb || 0));
    o.bass = Math.max(-12, Math.min(9, +o.bass || 0)); o.presence = Math.max(-6, Math.min(9, +o.presence || 0));
    return o;
  }
  function isFlat(p) { return p.pitch === 1 && !p.hp && !p.lp && !p.bass && !p.presence && !p.drive && !p.chorus && !p.reverb; }
  /* réponse impulsionnelle : bruit à décroissance exponentielle, plus quelques échos réguliers (« metal ») pour une pièce métallique */
  function impulse(ctx, sr, room, metal) {
    var n = Math.max(64, Math.round(sr * room)), b = ctx.createBuffer(2, n, sr), seed = 12345;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; }
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), per = Math.round(sr * (0.0071 + c * 0.0013));
      for (var i = 0; i < n; i++) {
        var env = Math.pow(1 - i / n, 2.2) * Math.exp(-i / (sr * room * 0.35));
        d[i] = rnd() * env * (1 - metal * 0.6) + (metal && i % per === 0 ? (0.9 * metal * env) : 0);
      }
      d[0] = 0;
    }
    return b;
  }
  function shaperCurve(drive) {
    var k = 1 + drive * 12, n = 2048, c = new Float32Array(n), norm = Math.tanh(k);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
    return c;
  }
  var PEAK = 0.891;   // −1 dBFS
  var RMS_MAX = 0.2;   // plafond du niveau moyen : même volume perçu d'un effet à l'autre (la saturation ne fait pas « plus fort »)
  function normalize(x, gainMax) {
    var pk = 0, ss = 0, i;
    for (i = 0; i < x.length; i++) { var a = x[i] < 0 ? -x[i] : x[i]; if (a > pk) pk = a; ss += a * a; }
    if (!pk) return x;
    var rms = Math.sqrt(ss / x.length);
    var g = Math.min(gainMax || 1.6, PEAK / pk, rms > 0 ? RMS_MAX / rms : 1e9);
    if (g !== 1) for (i = 0; i < x.length; i++) x[i] *= g;
    return x;
  }
  /** Applique l'effet (OfflineAudioContext) : renvoie Promise<{samples, sr}> ; samples jamais au-delà de −1 dBFS */
  function render(samples, sr, name, over) {
    var p = fxParams(name, over);
    var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (isFlat(p) || !OAC || !samples.length) return Promise.resolve({ samples: normalize(new Float32Array(samples), 1.4), sr: sr, fx: p, tail: 0 });
    var outSr = sr < 22050 ? 22050 : sr;
    var tail = p.reverb ? p.room + 0.05 : 0.03;
    var len = Math.ceil((samples.length / sr / p.pitch + tail) * outSr);
    var ctx = new OAC(1, len, outSr);
    var buf = ctx.createBuffer(1, samples.length, sr); buf.getChannelData(0).set(samples);
    var src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = p.pitch;
    var node = src;
    function chain(n) { node.connect(n); node = n; return n; }
    if (p.hp) { var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.hp; hp.Q.value = 0.707; chain(hp); if (p.hp > 200) { var hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = p.hp; hp2.Q.value = 0.707; chain(hp2); } }
    if (p.lp && p.lp < outSr / 2) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.lp; lp.Q.value = 0.707; chain(lp); if (p.lp < 5000) { var lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = p.lp; lp2.Q.value = 0.707; chain(lp2); } }
    if (p.bass) { var ls = ctx.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 180; ls.gain.value = p.bass; chain(ls); }
    if (p.presence) { var pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 3000; pk.Q.value = 0.9; pk.gain.value = p.presence; chain(pk); }
    if (p.drive) {
      var pre = ctx.createGain(); pre.gain.value = 1 + p.drive * 2; chain(pre);
      var sh = ctx.createWaveShaper(); sh.curve = shaperCurve(p.drive); sh.oversample = '2x';
      var dry0 = ctx.createGain(), wet0 = ctx.createGain(), mix0 = ctx.createGain();
      dry0.gain.value = 1 - Math.min(0.85, p.drive * 1.6); wet0.gain.value = Math.min(0.85, p.drive * 1.6) / (1 + p.drive * 2);
      node.connect(sh); sh.connect(wet0); node.connect(dry0); dry0.gain.value /= (1 + p.drive * 2);
      wet0.connect(mix0); dry0.connect(mix0); node = mix0;
    }
    var sum = ctx.createGain();
    node.connect(sum);
    if (p.chorus) {   // chorus (retard ≈ 14 ms modulé) ou flanger (≈ 2,5 ms, réinjecté)
      var dl = ctx.createDelay(0.05), lfo = ctx.createOscillator(), depth = ctx.createGain(), wet = ctx.createGain();
      dl.delayTime.value = p.flanger ? 0.0025 : 0.014; lfo.frequency.value = p.flanger ? 0.22 : 0.9; depth.gain.value = p.flanger ? 0.0016 : 0.0035;
      lfo.connect(depth); depth.connect(dl.delayTime);
      if (p.flanger) { var fb = ctx.createGain(); fb.gain.value = 0.45; dl.connect(fb); fb.connect(dl); }
      wet.gain.value = p.chorus * 0.55;
      node.connect(dl); dl.connect(wet); wet.connect(sum); lfo.start(0);
    }
    var out = ctx.createGain(); out.gain.value = 1;
    sum.connect(out);
    if (p.reverb) {
      var cv = ctx.createConvolver(); cv.normalize = true; cv.buffer = impulse(ctx, outSr, p.room, p.metal);
      var rv = ctx.createGain(); rv.gain.value = p.reverb;
      var rhp = ctx.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 250;   // queue sans grave : reste intelligible
      sum.connect(rhp); rhp.connect(cv); cv.connect(rv); rv.connect(out);
    }
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.18;
    out.connect(comp); comp.connect(ctx.destination);
    src.start(0);
    return ctx.startRendering().then(function (ab) { return { samples: normalize(ab.getChannelData(0).slice(0), 2), sr: outSr, fx: p, tail: tail }; });
  }
  /** Niveau de la sphère : RMS par tranches de 20 ms, ramené à 0..1 */
  function envelope(x, sr, step) {
    step = step || 0.02;
    var n = Math.max(1, Math.round(sr * step)), out = [];
    for (var i = 0; i < x.length; i += n) {
      var s = 0, e = Math.min(x.length, i + n);
      for (var j = i; j < e; j++) s += x[j] * x[j];
      var rms = Math.sqrt(s / (e - i));
      out.push(Math.min(1, Math.pow(rms * 4.5, 0.8)));
    }
    return out;
  }
  function stats(x, sr) {
    var pk = 0, s = 0, clip = 0;
    for (var i = 0; i < x.length; i++) { var a = x[i] < 0 ? -x[i] : x[i]; if (a > pk) pk = a; s += a * a; if (a >= 0.999) clip++; }
    return { dur: x.length / sr, rms: Math.sqrt(s / Math.max(1, x.length)), peak: pk, clip: clip };
  }

  /* ---------------- Découpage ---------------- */
  /** Phrases à dire l'une après l'autre ; une phrase longue est coupée à une virgule, un point-virgule ou deux-points
      (la première tranche reste courte pour que le son parte vite). */
  function split(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return [];
    var sents = t.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý0-9«"(])|\n+/), out = [];
    sents.forEach(function (s, k) {
      s = s.trim(); if (!s) return;
      var max = out.length === 0 ? 70 : 180;
      while (s.length > max) {
        var cut = -1, re = /[,;:]\s/g, m;
        while ((m = re.exec(s))) { if (m.index >= 18 && m.index <= max) cut = m.index + 1; if (m.index > max) break; }
        if (cut < 0) { var sp = s.lastIndexOf(' ', max); cut = sp > 30 && s.length > max * 1.6 ? sp : -1; }
        if (cut < 0) break;
        out.push(s.slice(0, cut).trim()); s = s.slice(cut).trim(); max = 180;
      }
      if (s) out.push(s);
    });
    return out;
  }

  /* ---------------- Stockage : IndexedDB (navigateur, Lively) ---------------- */
  function idb() {
    return new Promise(function (ok, ko) {
      var rq = indexedDB.open('mj-voix', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('f'); };
      rq.onsuccess = function () { ok(rq.result); }; rq.onerror = function () { ko(rq.error); };
    });
  }
  function idbOp(mode, fn) { return idb().then(function (db) { return new Promise(function (ok, ko) { var tx = db.transaction('f', mode), st = tx.objectStore('f'), r = fn(st); tx.oncomplete = function () { db.close(); ok(r && r.result); }; tx.onerror = tx.onabort = function () { db.close(); ko(tx.error); }; }); }); }
  var IDB = {
    get: function (k) { return idbOp('readonly', function (st) { return st.get(k); }); },
    put: function (k, v) { return idbOp('readwrite', function (st) { st.put(v, k); }); },
    del: function (k) { return idbOp('readwrite', function (st) { st.delete(k); }); }
  };
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function sha(algo, data) { return root.crypto && crypto.subtle ? crypto.subtle.digest(algo, data).then(hex) : Promise.resolve(''); }
  function gitBlobSha1(ab) {   // somme git d'un petit fichier (le .json n'est pas en LFS) : sha1("blob <taille>\0" + contenu)
    var head = new TextEncoder().encode('blob ' + ab.byteLength + '\0'), all = new Uint8Array(head.length + ab.byteLength);
    all.set(head, 0); all.set(new Uint8Array(ab), head.length);
    return sha('SHA-1', all);
  }
  /** Sommes attendues : API de HuggingFace (oid LFS = SHA-256 du .onnx, oid git du .json) */
  function expected(model) {
    return fetch(HFAPI + MODELS[model].dir.replace(/\/$/, ''), { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (list) {
      var o = {};
      list.forEach(function (f) { var n = f.path.split('/').pop(); o[n] = { sha256: f.lfs && f.lfs.oid, size: f.lfs ? f.lfs.size : f.size, oid: f.oid }; });
      return o;
    });
  }
  function fetchProgress(url, onp, total) {
    return fetch(url, { credentials: 'omit', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (!r.body || !r.body.getReader) return r.arrayBuffer();
      var tot = +r.headers.get('content-length') || total || 0, got = 0, parts = [], rd = r.body.getReader();
      function pump() { return rd.read().then(function (x) { if (x.done) return new Blob(parts).arrayBuffer(); parts.push(x.value); got += x.value.length; if (onp) onp(tot ? Math.min(0.99, got / tot) : 0, got); return pump(); }); }
      return pump();
    });
  }
  function checkCfg(cfg) {
    if (!cfg || !cfg.phoneme_id_map || !cfg.audio || !cfg.audio.sample_rate) throw new Error('fichier .onnx.json invalide');
    if ((cfg.phoneme_type || 'espeak') !== 'espeak' || !/^fr/i.test((cfg.espeak && cfg.espeak.voice) || (cfg.language && cfg.language.code) || '')) throw new Error('ce n\'est pas une voix Piper française');
  }

  /* ---------------- Moteur ---------------- */
  function create(opt) {
    opt = opt || {};
    var abs = function (u) { try { return new URL(u, root.location.href).href; } catch (e) { return u; } };
    var ENGINE = abs(opt.engine || 'piper/'), WORKER = opt.worker || 'mj-voix-worker.js', PHON = abs(opt.phon || 'mj-phon.js');
    var ANDROID = opt.store && typeof opt.store === 'object' ? opt.store : null;
    var KEY = opt.key || 'mj-voix:installees';
    var E = { state: 'off', err: '', voices: VOICES, models: MODELS, FX: FX, dl: {} };
    var w = null, wid = 0, pend = {}, loaded = null, failCount = 0;
    function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
    function lsSet(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { } }
    var listeners = [];
    function emit(ev) { ev = ev || {}; if (opt.onChange) try { opt.onChange(ev); } catch (e) { } listeners.slice().forEach(function (f) { try { f(ev); } catch (e) { } }); }
    E.on = function (f) { listeners.push(f); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; };

    /* --- modèles installés --- */
    function installed() {
      if (ANDROID) { var st = {}; try { st = JSON.parse(ANDROID.piperState() || '{}') || {}; } catch (e) { } return st.models || {}; }
      return lsGet();
    }
    function hasModel(m) { return !!installed()[m]; }
    E.installed = installed;
    E.hasVoice = function (id) { return hasModel(voice(id).model); };
    E.cfgOf = function (model) {
      if (ANDROID) return fetch(fileUrl(model, model + '.onnx.json')).then(function (r) { return r.json(); });
      return IDB.get(model + '.onnx.json').then(function (t) { if (!t) throw new Error('voix absente'); return typeof t === 'string' ? JSON.parse(t) : t; });
    };
    function fileUrl(model, name) {
      var dir = ANDROID.piperDir() + '/' + model + '/' + name;
      return root.Capacitor && Capacitor.convertFileSrc ? Capacitor.convertFileSrc(dir) : 'file://' + dir;
    }
    /** Téléchargement depuis HuggingFace + vérification ; onp(fraction) */
    E.download = function (id, onp) {
      var v = voice(id), m = v.model, info = MODELS[m];
      if (E.dl[m]) return E.dl[m].p;
      if (ANDROID) {   // Java : téléchargement dans le stockage privé, SHA-256 vérifiée ; avancement par événements « piper »
        var x = E.dl[m] = { f: 0, onp: onp };
        x.p = new Promise(function (ok, ko) { x.ok = ok; x.ko = ko; });
        ANDROID.piperDownload(m, HF + info.dir, HFAPI + info.dir.replace(/\/$/, ''), info.sha256 || '');
        return x.p;
      }
      var exp = {}, cfgAb;
      E.dl[m] = { p: null, f: 0 };
      var p = expected(m).catch(function () { return {}; }).then(function (x) {
        exp = x;
        return fetchProgress(HF + info.dir + m + '.onnx.json', null);
      }).then(function (ab) {
        cfgAb = ab; checkCfg(JSON.parse(new TextDecoder().decode(ab)));
        return exp[m + '.onnx.json'] && exp[m + '.onnx.json'].oid ? gitBlobSha1(ab).then(function (h) { if (h && h !== exp[m + '.onnx.json'].oid) throw new Error('somme du .onnx.json incorrecte'); }) : null;
      }).then(function () {
        return fetchProgress(HF + info.dir + m + '.onnx', function (f) { if (E.dl[m]) E.dl[m].f = f; if (onp) onp(f); emit({ t: 'progress', model: m, f: f }); }, (exp[m + '.onnx'] && exp[m + '.onnx'].size) || info.size);
      }).then(function (ab) { return save(m, ab, cfgAb, [info.sha256, exp[m + '.onnx'] && exp[m + '.onnx'].sha256]); })
        .then(function (r) { delete E.dl[m]; return r; }, function (e) { delete E.dl[m]; throw e; });
      E.dl[m].p = p;
      return p;
    };
    /** want : sommes acceptées (figée dans MODELS, annoncée par HuggingFace) */
    function save(m, ab, cfgAb, want) {
      want = (want || []).filter(Boolean);
      return sha('SHA-256', ab).then(function (h) {
        var good = !!h && want.indexOf(h) >= 0;
        if (want.length && h && !good) throw new Error('somme SHA-256 incorrecte : fichier abîmé ou différent de celui de HuggingFace');
        var cfg = JSON.parse(new TextDecoder().decode(cfgAb)); checkCfg(cfg);
        return IDB.put(m + '.onnx', new Blob([ab])).then(function () { return IDB.put(m + '.onnx.json', cfg); }).then(function () {
          var l = lsGet(); l[m] = { size: ab.byteLength, sha256: h, verified: good, at: Date.now() }; lsSet(l);
          emit({ t: 'installed', model: m }); return l[m];
        });
      });
    }
    /** « Choisir les fichiers téléchargés » : .onnx + .onnx.json d'une des voix (navigateur, Lively) */
    E.pickFiles = function (files) {
      files = Array.prototype.slice.call(files || []);
      var onnx = files.filter(function (f) { return /\.onnx$/i.test(f.name); })[0], json = files.filter(function (f) { return /\.onnx\.json$/i.test(f.name); })[0];
      if (!onnx || !json) return Promise.reject(new Error('choisissez les deux fichiers : la voix (.onnx) et sa description (.onnx.json)'));
      var m = onnx.name.replace(/\.onnx$/i, '');
      if (!MODELS[m]) return Promise.reject(new Error('voix inconnue : ' + m + ' (attendu : ' + Object.keys(MODELS).join(', ') + ')'));
      return Promise.all([onnx.arrayBuffer(), json.arrayBuffer(), expected(m).catch(function () { return {}; })]).then(function (r) {
        return save(m, r[0], r[1], [MODELS[m].sha256, r[2][m + '.onnx'] && r[2][m + '.onnx'].sha256]);
      });
    };
    E.pickAndroid = function () { if (ANDROID && ANDROID.piperPick) ANDROID.piperPick(); };
    E.remove = function (id) {
      var m = voice(id).model;
      if (loaded && loaded.model === m) unloadW();
      if (ANDROID) { ANDROID.piperDelete(m); emit({ t: 'removed', model: m }); return Promise.resolve(); }
      return IDB.del(m + '.onnx').then(function () { return IDB.del(m + '.onnx.json'); }).then(function () { var l = lsGet(); delete l[m]; lsSet(l); emit({ t: 'removed', model: m }); });
    };
    /** Événements du pont Android (« piper ») : avancement, fin, erreur */
    E.androidEvent = function (d) {
      var x = E.dl[d.model];
      if (d.state === 'downloading' && x) { x.f = d.progress || 0; if (x.onp) x.onp(x.f); emit({ t: 'progress', model: d.model, f: x.f }); }
      if (d.state === 'ready' && x) { delete E.dl[d.model]; x.ok(d); }
      if (d.state === 'error' && x) { delete E.dl[d.model]; x.ko(new Error(d.msg || 'téléchargement impossible')); }
      emit({ t: 'android', d: d });
    };

    /* --- worker --- */
    function worker() {
      if (w) return w;
      var u = WORKER + (WORKER.indexOf('?') < 0 ? '?' : '&') + 'e=' + encodeURIComponent(ENGINE) + '&p=' + encodeURIComponent(PHON);
      w = new Worker(u);
      w.postMessage({ t: 'cfg', e: ENGINE, p: PHON });   // le service worker de la Suite sur PC sert le worker sans sa requête
      w.onmessage = function (e) { var d = e.data || {}, p = pend[d.id]; if (!p) return; delete pend[d.id]; if (d.t === 'error') p.ko(new Error(d.msg)); else p.ok(d); };
      w.onerror = function (e) { e.preventDefault && e.preventDefault(); var msg = e.message || 'moteur Piper indisponible'; Object.keys(pend).forEach(function (k) { pend[k].ko(new Error(msg)); delete pend[k]; }); try { w.terminate(); } catch (x) { } w = null; loaded = null; E.state = 'error'; E.err = msg; emit({ t: 'state' }); };
      return w;
    }
    function call(msg, transfer) {
      return new Promise(function (ok, ko) { msg.id = ++wid; pend[msg.id] = { ok: ok, ko: ko }; worker().postMessage(msg, transfer || []); });
    }
    function unloadW() { if (w) try { w.postMessage({ t: 'unload' }); } catch (e) { } loaded = null; }
    /** Charge le moteur et la voix (au démarrage si Piper est choisi : la première phrase part ensuite vite) */
    E.warm = function (id) {
      var v = voice(id), m = v.model;
      if (!hasModel(m)) return Promise.reject(Object.assign(new Error('voix non installée'), { fallback: true }));
      if (loaded && loaded.model === m) return loaded.p;
      E.state = 'loading'; emit({ t: 'state' });
      var t0 = Date.now();
      var lp = E.cfgOf(m).then(function (cfg) {
        var vv = { key: m + '.onnx', cfg: cfg };
        if (ANDROID) vv.url = fileUrl(m, m + '.onnx');
        return call({ t: 'load', voice: vv }).then(function (r) { r.cfg = cfg; return r; });
      }).then(function (r) { E.state = 'ready'; E.err = ''; E.loadMs = Date.now() - t0; failCount = 0; emit({ t: 'state' }); return r; },
        function (e) { loaded = null; failCount++; E.state = 'error'; E.err = String(e && e.message || e); emit({ t: 'state' }); throw Object.assign(e instanceof Error ? e : new Error(String(e)), { fallback: true }); });
      loaded = { model: m, p: lp };
      return lp;
    };
    E.usable = function (id) { return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && hasModel(voice(id).model) && failCount < 3; };

    /* --- lecture --- */
    var AC = null, token = 0, playing = [], levelT = 0;
    function ac() { if (!AC) { var C = root.AudioContext || root.webkitAudioContext; AC = new C(); } if (AC.state === 'suspended') AC.resume().catch(function () { }); return AC; }
    E.stop = function () {
      token++;
      playing.forEach(function (s) { try { s.stop(); } catch (e) { } }); playing = [];
      if (opt.sink) try { opt.sink.stop(); } catch (e) { }
      clearInterval(levelT); levelT = 0;
      if (E._fin) { var f = E._fin; E._fin = null; f(); }
    };
    function toInt16(x) { var o = new Int16Array(x.length); for (var i = 0; i < x.length; i++) { var v = Math.max(-1, Math.min(1, x[i])); o[i] = v < 0 ? v * 32768 : v * 32767; } return o; }
    E.toInt16 = toInt16;
    /** Réglages de synthèse communs à speak() et chunk() : voix, effet, hauteur, vitesse (durée compensée), volume */
    function plan(s) {
      var v = voice(s.voice), fxName = s.fx || 'aucun', fxo = s.fxo || null;
      var p = fxParams(fxName, fxo), pitch = Math.max(0.8, Math.min(1.25, (+s.pitch || 1) * p.pitch));
      return { v: v, fxName: fxName, fxo: fxo, pitch: pitch, speed: Math.max(0.5, Math.min(2, +s.rate || 1)) / pitch, vol: Math.max(0, Math.min(1.5, s.volume == null ? 1 : +s.volume)) };
    }
    /** Une phrase : synthèse (worker), effet, volume ; o = {samples, sr, tail, genMs, fxMs, ipa, env} */
    function synthOne(text, q) {
      return call({ t: 'gen', text: text, sid: q.v.sid, speed: q.speed }).then(function (r) {
        var g = (root.performance || Date).now();
        return render(r.samples, r.sr, q.fxName, Object.assign({}, q.fxo || {}, { pitch: q.pitch })).then(function (o) {
          o.genMs = r.ms; o.fxMs = (root.performance || Date).now() - g; o.ipa = r.ipa; o.text = text;
          if (q.vol !== 1) { var gv = Math.min(q.vol, PEAK / Math.max(1e-6, stats(o.samples, o.sr).peak)); for (var k = 0; k < o.samples.length; k++) o.samples[k] *= gv; }   // volume, sans dépasser −1 dBFS
          o.env = envelope(o.samples, o.sr); return o;
        });
      });
    }
    /** Synthèse d'une phrase sans la lire (lecture continue de Liseuse : la lecture est faite par l'appelant).
        s = {voice, rate, pitch, volume, fx, fxo} → Promise<{samples (Float32Array), sr, dur, tail, genMs, fxMs}> ; rejet {fallback:true} si Piper est inutilisable */
    E.chunk = function (text, s) {
      s = s || {};
      var q = plan(s);
      if (!E.usable(q.v.id)) return Promise.reject({ fallback: true, msg: 'Piper indisponible' });
      return E.warm(q.v.id).then(function () { return synthOne(String(text || ''), q); }).then(function (o) { o.dur = o.samples.length / o.sr; return o; });
    };
    /** Dit le texte. s = {voice, rate, pitch, volume, fx, fxo} ; cb = {onStart, onLevel, onChunk} → Promise */
    E.speak = function (text, s, cb) {
      s = s || {}; cb = cb || {};
      var q = plan(s), v = q.v, parts = split(text), my = ++token;
      if (!parts.length) return Promise.resolve({ chunks: 0 });
      if (!E.usable(v.id)) return Promise.reject({ fallback: true, msg: 'Piper indisponible' });
      var t0 = (root.performance || Date).now(), stats0 = { first: 0, chunks: [], ok: true };
      return E.warm(v.id).then(function () {
        if (my !== token) return stats0;
        var startAt = 0, carry = null, ctx = opt.sink ? null : ac(), ended = false;
        function gen(i) { return synthOne(parts[i], q); }
        return new Promise(function (done, fail) {
          E._fin = function () { if (!ended) { ended = true; done(stats0); } };
          var pending = gen(0);
          function step(i) {
            if (my !== token) return;
            pending.then(function (o) {
              if (my !== token) return;
              if (i + 1 < parts.length) pending = gen(i + 1);   // la suivante pendant la lecture de celle-ci
              stats0.chunks.push({ text: o.text, dur: o.samples.length / o.sr, genMs: o.genMs, fxMs: Math.round(o.fxMs), ipa: o.ipa, st: stats(o.samples, o.sr) });
              if (cb.onChunk) try { cb.onChunk(o); } catch (e) { }
              play(o, i).then(function () { if (i + 1 < parts.length) step(i + 1); else { E._fin = null; if (!ended) { ended = true; done(stats0); } } });
            }).catch(function (e) { if (my !== token) return; E._fin = null; ended = true; fail(Object.assign(e instanceof Error ? e : new Error(String(e)), { fallback: true, played: i })); });
          }
          function levels(o, startPerf) {
            clearInterval(levelT);
            levelT = setInterval(function () {
              if (my !== token) { clearInterval(levelT); return; }
              var t = ((root.performance || Date).now() - startPerf) / 1000, k = Math.floor(t / 0.02);
              if (k >= o.env.length) { clearInterval(levelT); if (cb.onLevel) cb.onLevel(0); return; }
              if (k >= 0 && cb.onLevel) cb.onLevel(o.env[k]);
            }, 33);
          }
          function play(o, i) {
            if (!stats0.first) { stats0.first = Math.round((root.performance || Date).now() - t0); if (cb.onStart) try { cb.onStart(stats0.first); } catch (e) { } }
            if (opt.sink) {   // lecture séquentielle (AudioTrack) : la queue de réverbération est mêlée au début de la phrase suivante
              var x = o.samples;
              if (carry) { var m2 = new Float32Array(Math.max(x.length, carry.length)); m2.set(x); for (var c = 0; c < carry.length; c++) m2[c] += carry[c]; x = normalize(m2, 1); carry = null; }
              if (o.tail && i < parts.length - 1) { var cut = Math.max(1, x.length - Math.round(o.tail * 0.85 * o.sr)); carry = x.slice(cut); x = x.slice(0, cut); }
              o.samples = x;
              return opt.sink.play(String(my) + '-' + i, toInt16(o.samples), o.sr, o.samples.length / o.sr, function () { levels(o, (root.performance || Date).now()); });
            }
            return new Promise(function (ok) {
              var b = ctx.createBuffer(1, o.samples.length, o.sr); b.getChannelData(0).set(o.samples);
              var src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination);
              var when = Math.max(ctx.currentTime + 0.02, startAt), last = i === parts.length - 1;
              startAt = when + Math.max(0.05, b.duration - (o.tail || 0) * 0.85);   // la suivante démarre pendant la queue de réverbération
              src.onended = function () { playing = playing.filter(function (x) { return x !== src; }); if (last) ok(); };
              playing.push(src); src.start(when);
              var delay = Math.max(0, (when - ctx.currentTime) * 1000);
              setTimeout(function () { levels(o, (root.performance || Date).now()); }, delay);
              if (!last) setTimeout(ok, Math.max(0, (startAt - ctx.currentTime) * 1000 - 60));
            });
          }
          step(0);
        });
      });
    };
    /** Synthèse sans lecture (essais, échantillons) : Promise<{samples, sr, chunks}> */
    E.synth = function (text, s) {
      s = s || {};
      var v = voice(s.voice), parts = split(text), fxName = s.fx || 'aucun', p = fxParams(fxName, s.fxo), pitch = Math.max(0.8, Math.min(1.25, (+s.pitch || 1) * p.pitch));
      var speed = Math.max(0.5, Math.min(2, +s.rate || 1)) / pitch, outs = [];
      return E.warm(v.id).then(function () {
        return parts.reduce(function (pr, t) {
          return pr.then(function () { return call({ t: 'gen', text: t, sid: v.sid, speed: speed }); }).then(function (r) {
            return render(r.samples, r.sr, fxName, Object.assign({}, s.fxo || {}, { pitch: pitch })).then(function (o) { o.genMs = r.ms; o.ipa = r.ipa; outs.push(o); });
          });
        }, Promise.resolve());
      }).then(function () {
        var sr = outs.length ? outs[0].sr : 22050, gap = Math.round(sr * 0.12), n = 0;
        outs.forEach(function (o) { n += o.samples.length + gap; });
        var all = new Float32Array(n), k = 0;
        outs.forEach(function (o) { all.set(o.samples, k); k += o.samples.length + gap; });
        return { samples: all, sr: sr, chunks: outs.map(function (o) { return { genMs: o.genMs, dur: o.samples.length / o.sr, ipa: o.ipa }; }) };
      });
    };
    /** Aperçu d'une voix (réglages : effet, vitesse, hauteur) */
    E.preview = function (id, s, cb) { E.stop(); return E.speak('Bonjour. Je suis ' + voice(id).name + ', votre majordome. Tous les systèmes sont opérationnels.', Object.assign({}, s || {}, { voice: id }), cb); };
    E.voice = voice; E.size = function (id) { return MODELS[voice(id).model].size; }; E.mo = mo;
    return E;
  }

  /* ---------------- Réglages › Voix (HTML commun) ----------------
     MJVoix.panel(E, S, opt) → {html, bind(boite)} ; S = réglages de l'appli (tts, piperVoice, fx, fxo, rate, pitch, volume),
     opt = {save(), say(texte), btn: classe des boutons, systemHtml: partie « voix du système » de l'appli, note} */
  var CSS = '.mjv{margin:.2em 0}.mjv .mjv-v{display:flex;align-items:center;gap:.6em;padding:.5em 0;border-top:1px solid rgba(127,160,200,.18)}' +
    '.mjv .mjv-v:first-child{border-top:0}.mjv .mjv-n{flex:1;min-width:0}.mjv .mjv-n b{display:block}.mjv .mjv-n small{display:block;opacity:.72;font-size:.82em;line-height:1.35}' +
    '.mjv .mjv-b{display:flex;gap:.35em;flex-wrap:wrap;justify-content:flex-end}.mjv progress{width:100%;height:6px}.mjv .mjv-r{display:flex;align-items:center;gap:.6em;margin:.35em 0}' +
    '.mjv .mjv-r label{flex:0 0 9.5em;font-size:.9em}.mjv .mjv-r input[type=range]{flex:1}.mjv .mjv-r output{flex:0 0 3.4em;text-align:right;font-variant-numeric:tabular-nums;font-size:.85em;opacity:.8}' +
    '.mjv details{margin:.4em 0}.mjv summary{cursor:pointer;opacity:.85}.mjv .mjv-on{outline:2px solid currentColor;outline-offset:2px;border-radius:6px}.mjv .mjv-msg{font-size:.85em;opacity:.85;min-height:1.2em}';
  function css() { if (root.document && !document.getElementById('mjv-css')) { var st = document.createElement('style'); st.id = 'mjv-css'; st.textContent = CSS; document.head.appendChild(st); } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var FINE = [['reverb', 'Réverbération', 0, 0.6, 0.02], ['room', 'Taille de la pièce', 0.15, 0.9, 0.05], ['chorus', 'Chorus / flanger', 0, 1, 0.05], ['hp', 'Passe-haut (Hz)', 0, 400, 10],
    ['lp', 'Passe-bas (Hz, 0 = aucun)', 0, 9500, 100], ['drive', 'Saturation', 0, 0.6, 0.02], ['bass', 'Grave (dB)', -9, 9, 0.5], ['presence', 'Présence (dB)', -4, 6, 0.5], ['pitch', 'Hauteur de l\'effet', 0.85, 1.15, 0.01]];
  function panel(E, S, o) {
    css(); o = o || {};
    var btn = o.btn || 'btn sm', inst = E.installed(), piper = S.tts === 'piper';
    var h = '<div class="mjv">';
    h += '<div class="mjv-r"><label for="mjvEng">Moteur</label><select class="in" id="mjvEng" style="flex:1"><option value="system"' + (piper ? '' : ' selected') + '>Voix du système</option><option value="piper"' + (piper ? ' selected' : '') + '>Voix Piper (hors ligne)</option></select></div>';
    h += '<p class="note mjv-msg" id="mjvMsg">' + (E._msg ? esc(E._msg) : piper ? (E.state === 'error' ? 'Le moteur Piper n\'a pas pu se charger : les voix du système prennent le relais.' : '') : 'Voix neuronales françaises, sans internet après un téléchargement unique (60 à 73 Mo par voix).') + '</p>';
    h += '<div id="mjvPiper"' + (piper ? '' : ' hidden') + '>';
    E.voices.forEach(function (v) {
      var m = E.models[v.model], has = !!inst[v.model], on = S.piperVoice === v.id || (!S.piperVoice && v === E.voices[0]), dl = E.dl[v.model];
      var shared = E.voices.filter(function (x) { return x.model === v.model && x !== v; }).map(function (x) { return x.name; });
      h += '<div class="mjv-v' + (on ? ' mjv-on' : '') + '" data-v="' + v.id + '"><div class="mjv-n"><b>' + esc(v.name) + (on && has ? ' ✓' : '') + '</b><small>' + esc(v.desc) + ' · ' + mo(m.size) + (shared.length ? ' (fichier partagé avec ' + esc(shared.join(', ')) + ')' : '') + ' · licence ' + esc(m.lic) + '</small>' +
        '<progress' + (dl ? '' : ' hidden') + ' max="1" value="' + (dl ? dl.f || 0 : 0) + '"></progress></div><div class="mjv-b">' +
        (has ? '<button type="button" class="' + btn + '" data-a="use">' + (on ? 'Choisie' : 'Choisir') + '</button><button type="button" class="' + btn + '" data-a="hear">Aperçu</button><button type="button" class="' + btn + '" data-a="del">Supprimer</button>'
          : '<button type="button" class="' + btn + '" data-a="get"' + (dl ? ' disabled>Téléchargement…' : '>Télécharger') + '</button>') + '</div></div>';
    });
    h += '<p class="note">Si le téléchargement direct est refusé (pare-feu, réseau), téléchargez les deux fichiers de la voix sur <a href="https://huggingface.co/rhasspy/piper-voices/tree/main/fr/fr_FR" target="_blank" rel="noopener">huggingface.co/rhasspy/piper-voices</a> (fr_FR-…-medium.onnx et .onnx.json), puis : ' +
      (o.android ? '<button type="button" class="' + btn + '" id="mjvPick">Choisir les fichiers téléchargés</button>' : '<label class="' + btn + '" style="cursor:pointer">Choisir les fichiers téléchargés<input type="file" id="mjvFiles" multiple accept=".onnx,.json" hidden></label>') + '</p>';
    h += '<div class="mjv-r"><label for="mjvFx">Effet</label><select class="in" id="mjvFx" style="flex:1">' + Object.keys(FX).map(function (k) { return '<option value="' + k + '"' + ((S.fx || 'aucun') === k ? ' selected' : '') + '>' + FX[k].name + '</option>'; }).join('') + '</select></div>';
    h += '<details id="mjvFine"' + (S.fxo ? ' open' : '') + '><summary>Réglages fins de l\'effet</summary>';
    var cur = fxParams(S.fx || 'aucun', S.fxo);
    FINE.forEach(function (f) { h += '<div class="mjv-r"><label for="mjvF_' + f[0] + '">' + f[1] + '</label><input type="range" id="mjvF_' + f[0] + '" data-k="' + f[0] + '" min="' + f[2] + '" max="' + f[3] + '" step="' + f[4] + '" value="' + (+cur[f[0]] || 0) + '"><output>' + (+cur[f[0]] || 0) + '</output></div>'; });
    h += '<div class="mjv-r"><label for="mjvF_flanger">Flanger (au lieu du chorus)</label><input type="checkbox" id="mjvF_flanger"' + (cur.flanger ? ' checked' : '') + '></div>';
    h += '<button type="button" class="' + btn + '" id="mjvFxReset">Revenir au préréglage</button></details>';
    h += '<p class="note">L\'effet ne s\'applique qu\'aux voix Piper : les voix du système ne passent pas par le traitement audio de la page. Effet générique : il n\'imite la voix de personne.</p>';
    h += '</div>';
    h += '<div id="mjvSys"' + (piper ? ' hidden' : '') + '>' + (o.systemHtml || '') + '</div>';
    h += '</div>';
    function bind(box) {
      var $ = function (id) { return box.querySelector('#' + id); };
      function msg(t) { E._msg = t || ''; var e = root.document.getElementById('mjvMsg'); if (e) e.textContent = t || ''; }   // élément du dernier affichage ; gardé pour le suivant
      var off = E.on(function (ev) {   // avancement des téléchargements (y compris après un nouvel affichage du panneau)
        if (!root.document.contains(box)) { off(); return; }
        if (ev.t === 'progress') box.querySelectorAll('[data-v]').forEach(function (row) { if (E.voice(row.getAttribute('data-v')).model === ev.model) { var pr = row.querySelector('progress'); pr.hidden = false; pr.value = ev.f; } });
      });
      $('mjvEng').onchange = function () { S.tts = this.value; if (S.tts === 'piper' && !S.piperVoice) S.piperVoice = E.voices[0].id; o.save(); $('mjvPiper').hidden = S.tts !== 'piper'; $('mjvSys').hidden = S.tts === 'piper'; msg(''); if (S.tts === 'piper' && E.hasVoice(S.piperVoice)) E.warm(S.piperVoice).catch(function () { msg('Le moteur Piper n\'a pas pu se charger : les voix du système prennent le relais.'); }); };
      box.querySelectorAll('[data-v] [data-a]').forEach(function (b) {
        b.onclick = function () {
          var row = b.closest('[data-v]'), id = row.getAttribute('data-v'), a = b.getAttribute('data-a'), v = E.voice(id);
          if (a === 'use') { S.piperVoice = id; o.save(); E.warm(id).catch(function () { }); if (o.refresh) o.refresh(); }
          else if (a === 'hear') { S.piperVoice = S.piperVoice || id; if (o.preview) o.preview(id); }
          else if (a === 'del') { if (root.confirm('Supprimer la voix ' + v.name + ' de cet appareil ?')) E.remove(id).then(function () { if (o.refresh) o.refresh(); }); }
          else if (a === 'get') {
            var pr = row.querySelector('progress'); pr.hidden = false; b.disabled = true; b.textContent = 'Téléchargement…'; msg('Téléchargement de ' + v.name + ' (' + mo(E.size(id)) + ')…');
            E.download(id).then(function (r) {
              S.piperVoice = id; if (S.tts !== 'piper') S.tts = 'piper'; o.save(); msg(v.name + ' est installée' + (r && r.verified === false ? ' (somme non vérifiée : HuggingFace injoignable)' : ', somme SHA-256 vérifiée') + '.');
              E.warm(id).catch(function () { }); if (o.refresh && root.document.contains(box)) o.refresh();
            }, function (e) {
              b.disabled = false; b.textContent = 'Télécharger'; pr.hidden = true;
              msg((e && e.name === 'TypeError' ? 'Le téléchargement direct a été refusé (réseau, pare-feu, ou page sans accès à HuggingFace).' : 'Téléchargement impossible : ' + (e && e.message || e) + '.') + ' Vous pouvez choisir les fichiers téléchargés avec le navigateur.');
            });
          }
        };
      });
      var fl = $('mjvFiles');
      if (fl) fl.onchange = function () { msg('Vérification des fichiers…'); E.pickFiles(this.files).then(function (r) { msg('Voix installée' + (r.verified ? ' (somme SHA-256 vérifiée)' : '') + '.'); S.tts = 'piper'; o.save(); if (o.refresh) o.refresh(); }, function (e) { msg('Fichiers refusés : ' + (e && e.message || e) + '.'); }); };
      var pk = $('mjvPick'); if (pk) pk.onclick = function () { E.pickAndroid(); msg('Choisissez le fichier .onnx et le fichier .onnx.json de la voix.'); };
      $('mjvFx').onchange = function () { S.fx = this.value; S.fxo = null; o.save(); if (o.refresh) o.refresh(); else if (o.preview) o.preview(S.piperVoice); };
      box.querySelectorAll('#mjvFine input[type=range]').forEach(function (r) {
        r.oninput = function () { r.nextElementSibling.textContent = r.value; };
        r.onchange = function () { S.fxo = Object.assign({}, fxParams(S.fx || 'aucun', S.fxo)); S.fxo[r.getAttribute('data-k')] = +r.value; o.save(); if (o.preview) o.preview(S.piperVoice); };
      });
      $('mjvF_flanger').onchange = function () { S.fxo = Object.assign({}, fxParams(S.fx || 'aucun', S.fxo), { flanger: this.checked }); o.save(); };
      $('mjvFxReset').onclick = function () { S.fxo = null; o.save(); if (o.refresh) o.refresh(); };
    }
    return { html: h, bind: bind };
  }

  root.MJVoix = { create: create, render: render, envelope: envelope, stats: stats, split: split, fxParams: fxParams, FX: FX, VOICES: VOICES, MODELS: MODELS, panel: panel, HF: HF, HFAPI: HFAPI };
})(typeof self !== 'undefined' ? self : this);
