/* =====================================================================
   Majordome : worker de synthèse vocale Piper (hors ligne), utilisé par mj-voix.js.
   Moteur : sherpa-onnx 2.0.1 en WebAssembly (Apache-2.0 ; onnxruntime MIT), SANS espeak-ng :
   le texte est phonétisé par mj-phon.js (code du projet) et passé en phonèmes au moteur
   (GenerationConfig.phonemeCodepoints). Dossier du moteur : paramètre ?e= (piper/ dans l'APK,
   ../../applis/www-majordome/piper/ sur PC), phonétiseur : ?p=.
   Modèles : fichiers d'origine de rhasspy/piper-voices (.onnx + .onnx.json). sherpa-onnx lit
   ses réglages dans les métadonnées ONNX : on les ajoute en fin de fichier (champ 14 du
   protobuf ModelProto, répétable, donc valable en fin de message), et tokens.txt est tiré de
   phoneme_id_map. Le fichier .onnx est lu dans IndexedDB (« mj-voix ») ou à une adresse
   (Android : stockage privé servi par Capacitor), écrit dans le système de fichiers
   d'emscripten le temps du chargement, puis effacé (onnxruntime en garde sa copie).
   Messages : {t:'load', id, voice:{key, sid, file?|url?, cfg}} → {t:'loaded'} ;
              {t:'gen', id, text, sid, speed, noise} → {t:'audio', samples (Float32Array), sr, ms, ipa} ;
              {t:'unload'}. Erreurs : {t:'error', id, msg}.
   ===================================================================== */
'use strict';
var Q = new URLSearchParams(self.location.search);
var ENGINE = Q.get('e') || 'piper/', PHON = Q.get('p') || 'mj-phon.js';
var ready = null, tts = null, cur = null, tokens = null;
self.Module = {
  locateFile: function (p) { return ENGINE + p; },
  print: function () { }, printErr: function (t) { if (/error|erreur/i.test(String(t))) console.warn('[piper] ' + t); },
  onRuntimeInitialized: function () { if (ready) ready.ok(); }
};
function boot() {
  if (ready) return ready.p;
  ready = {}; ready.p = new Promise(function (ok, ko) { ready.ok = ok; ready.ko = ko; });
  try { importScripts(ENGINE + 'sherpa-onnx-wasm-main-tts.js', ENGINE + 'sherpa-onnx-tts.js', PHON); }
  catch (e) { ready.ko(e); }
  self.Module.onAbort = function (w) { ready.ko(new Error('moteur interrompu : ' + w)); };
  return ready.p;
}
/* ---------- métadonnées ONNX ajoutées en fin de fichier ---------- */
function vint(n) { var o = []; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; }
function fld(f, b) { return vint(f << 3 | 2).concat(vint(b.length), Array.prototype.slice.call(b)); }
function meta(kv) {
  var te = new TextEncoder(), out = [];
  Object.keys(kv).forEach(function (k) { out = out.concat(fld(14, fld(1, te.encode(k)).concat(fld(2, te.encode(String(kv[k])))))); });
  return new Uint8Array(out);
}
function idbGet(key) {
  return new Promise(function (ok, ko) {
    var rq = indexedDB.open('mj-voix', 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore('f'); };
    rq.onerror = function () { ko(rq.error); };
    rq.onsuccess = function () {
      var db = rq.result, g = db.transaction('f', 'readonly').objectStore('f').get(key);
      g.onsuccess = function () { db.close(); g.result ? ok(g.result) : ko(new Error('fichier absent : ' + key)); };
      g.onerror = function () { db.close(); ko(g.error); };
    };
  });
}
function bytesOf(v) {
  if (v.file) return (v.file.arrayBuffer ? v.file.arrayBuffer() : Promise.resolve(v.file));
  if (v.url) return fetch(v.url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); });
  return idbGet(v.key).then(function (b) { return b.arrayBuffer ? b.arrayBuffer() : b; });
}
function load(v) {
  if (tts && cur === v.key) return Promise.resolve({ sr: tts.sampleRate, ns: tts.numSpeakers, cached: true });
  var t0 = performance.now();
  return boot().then(function () { return bytesOf(v); }).then(function (ab) {
    var cfg = v.cfg, map = cfg.phoneme_id_map || {};
    var m = meta({ model_type: 'vits', comment: 'piper', language: (cfg.language && cfg.language.name_english) || 'French', voice: (cfg.espeak && cfg.espeak.voice) || 'fr',
      n_speakers: cfg.num_speakers || 1, sample_rate: cfg.audio.sample_rate, add_blank: 0 });
    var buf = new Uint8Array(ab.byteLength + m.length); buf.set(new Uint8Array(ab), 0); buf.set(m, ab.byteLength); ab = null;
    tokens = {};
    var tok = Object.keys(map).map(function (k) { tokens[k] = 1; return k + ' ' + map[k][0]; }).join('\n') + '\n';
    if (tts) { tts.free(); tts = null; cur = null; }
    try { FS.unlink('/voix.onnx'); } catch (e) { }
    FS.writeFile('/voix.onnx', buf); buf = null;
    FS.writeFile('/tokens.txt', tok);
    var inf = cfg.inference || {};
    try {
      tts = new OfflineTts({ offlineTtsModelConfig: { offlineTtsVitsModelConfig: { model: '/voix.onnx', tokens: '/tokens.txt', lexicon: '', dataDir: '', noiseScale: inf.noise_scale || 0.667, noiseScaleW: inf.noise_w || 0.8, lengthScale: inf.length_scale || 1 },
        numThreads: 1, debug: 0, provider: 'cpu' }, ruleFsts: '', ruleFars: '', maxNumSentences: 1, silenceScale: 0.2 }, Module);
    } finally { try { FS.unlink('/voix.onnx'); } catch (e) { } }
    if (!tts.handle) { tts = null; throw new Error('modèle illisible'); }
    cur = v.key;
    return { sr: tts.sampleRate, ns: tts.numSpeakers, ms: Math.round(performance.now() - t0) };
  });
}
/* phonèmes : codes Unicode connus du modèle seulement */
function codepoints(text) {
  var ph = self.MJPhon.phonemize(text), out = [], ipa = [];
  ph.forEach(function (s) {
    var cps = [];
    for (var ch of s) if (tokens[ch]) cps.push(ch.codePointAt(0));
    if (cps.length) { out.push(cps); ipa.push(s); }
  });
  return { cps: out, ipa: ipa };
}
self.onmessage = function (e) {
  var d = e.data || {};
  if (d.t === 'load') {
    load(d.voice).then(function (r) { r.t = 'loaded'; r.id = d.id; self.postMessage(r); }, function (err) { self.postMessage({ t: 'error', id: d.id, msg: String(err && err.message || err) }); });
  } else if (d.t === 'gen') {
    try {
      if (!tts) throw new Error('aucune voix chargée');
      var t0 = performance.now(), p = codepoints(d.text);
      if (!p.cps.length) { self.postMessage({ t: 'audio', id: d.id, samples: new Float32Array(0), sr: tts.sampleRate, ms: 0, ipa: [] }); return; }
      var a = tts.generateWithConfig('', { sid: d.sid || 0, speed: d.speed || 1, silenceScale: 0.2, phonemeCodepoints: p.cps });
      self.postMessage({ t: 'audio', id: d.id, samples: a.samples, sr: a.sampleRate || tts.sampleRate, ms: Math.round(performance.now() - t0), ipa: p.ipa }, [a.samples.buffer]);
    } catch (err) { self.postMessage({ t: 'error', id: d.id, msg: String(err && err.message || err) }); }
  } else if (d.t === 'unload') {
    if (tts) { tts.free(); tts = null; cur = null; }
  } else if (d.t === 'ping') {
    boot().then(function () { self.postMessage({ t: 'pong', id: d.id }); }, function (err) { self.postMessage({ t: 'error', id: d.id, msg: String(err && err.message || err) }); });
  }
};
