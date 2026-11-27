/* =====================================================================
   Majordome › L'œil de Majordome (caméra de l'ordinateur ou du téléphone)
   Tout est analysé sur l'appareil, sans internet ; rien n'est envoyé. Les photos restent dans Majordome
   (base IndexedDB « mj-oeil ») tant que vous ne les enregistrez pas.

   À la voix :
   - « prends une photo », « fais un selfie », « photo dans 10 secondes »
   - « lis-moi ce document », « qu'est-ce qui est écrit ? » : vous montrez une feuille, il la lit à voix haute
     (téléphone : caméra arrière, on vise la feuille ; le reste de l'œil utilise la caméra frontale)
     (PC : moteur de lecture hors ligne de la Suite ; téléphone : ML Kit par MajordomeBridge.oeilOcr)
   - « surveille la pièce » / « arrête la surveillance » / « qu'as-tu vu ? » : mouvement repéré → photo + alerte
   - « est-ce que tu me vois ? », « combien de personnes vois-tu ? »
   - « montre-moi ce que tu vois » : aperçu de la caméra
   - « active / désactive la présence », « active / désactive les gestes »
   Réglages › L'œil de Majordome (tout est coupé par défaut) :
   - Présence : il vous accueille quand vous revenez, assombrit l'écran quand vous partez, propose une pause
     après un long moment devant l'écran ;
   - Gestes : agiter la main devant la caméra = il vous écoute ; cacher la caméra avec la main = silence.
   Visages : pico.js (licence MIT, dossier vision/), images en 160 × 120 niveaux de gris.
   Téléphone : autorisation CAMERA demandée au premier usage ; photos enregistrées dans Images › Majordome
   (MajordomeBridge.oeilSave) ; écran gardé allumé pendant la surveillance (Wake Lock).
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, S = X.S, esc = X.esc;
  var NLU = window.MJNLU;
  var MD = navigator.mediaDevices;
  var ANDROID = !!X.ANDROID;
  var CAN = !!(MD && MD.getUserMedia);
  // appli Android : lecture du texte (ML Kit) et rangement des photos dans la galerie par le pont natif (MajordomeBridge)
  var NB = X.B && typeof X.B.oeilCan === 'function' ? X.B : null;
  var nbWait = {}, nbN = 0;
  function nbCall(fn, args) {
    return new Promise(function (ok, ko) {
      var id = 'oe' + (++nbN); nbWait[id] = { ok: ok, ko: ko };
      setTimeout(function () { if (nbWait[id]) { delete nbWait[id]; ko(new Error('pas de réponse')); } }, 60000);
      try { NB[fn].apply(NB, [id].concat(args)); } catch (e) { delete nbWait[id]; ko(e); }
    });
  }
  var prevEvt = window.majordomeEvent;
  window.majordomeEvent = function (type, data) {
    if (type === 'oeil') {
      var d = {}; try { d = JSON.parse(data) || {}; } catch (e) { }
      var w = nbWait[d.id]; if (w) { delete nbWait[d.id]; if (d.ok) w.ok(d); else w.ko(new Error(d.err || 'échec')); }
      return;
    }
    return prevEvt ? prevEvt.apply(this, arguments) : undefined;
  };
  function b64(blob) { return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = ko; r.readAsDataURL(blob); }); }
  // écran gardé allumé pendant la surveillance (sinon le système coupe la caméra en mettant l'écran en veille)
  var wake = null;
  function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wake = l; l.addEventListener('release', function () { wake = null; }); }).catch(function () { });
      if (!on && wake) { wake.release(); wake = null; }
    } catch (e) { }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && garde && garde.on) keepAwake(true); });
  var PCAPI = window.MAGPC || null;

  var D = { presence: false, gestes: false, pause: 60, absent: 10, veille: true, alarme: true };
  S.oeil = Object.assign({}, D, S.oeil || {});
  function save() { X.saveS(); }

  /* ---------------- Photos (IndexedDB) ---------------- */
  var DBN = 'mj-oeil', MAXP = 60, dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, ko) {
      if (!window.indexedDB) return ko(new Error('stockage indisponible'));
      var rq = indexedDB.open(DBN, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('photos', { keyPath: 'id' }); };
      rq.onsuccess = function () { ok(rq.result); };
      rq.onerror = function () { dbp = null; ko(rq.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, ko) {
        var t = d.transaction('photos', mode), st = t.objectStore('photos'), out = fn(st);
        t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { ko(t.error); };
      });
    });
  }
  function photos() { return tx('readonly', function (st) { return st.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return b.at - a.at; }); }, function () { return []; }); }
  function addPhoto(blob, kind) {
    var p = { id: X.uid ? X.uid() : String(Date.now()), at: Date.now(), kind: kind || 'photo', blob: blob };
    return tx('readwrite', function (st) { st.put(p); }).then(function () {
      return photos().then(function (l) {
        var extra = l.slice(MAXP);
        if (!extra.length) return p;
        return tx('readwrite', function (st) { extra.forEach(function (e) { st.delete(e.id); }); }).then(function () { return p; });
      });
    }).catch(function () { return p; });
  }
  function clearPhotos() { return tx('readwrite', function (st) { st.clear(); }); }
  function stamp(t) { var d = new Date(t), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + 'h' + z(d.getMinutes()) + '-' + z(d.getSeconds()); }
  function when(t) { var d = new Date(t); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  function savePhoto(p) {
    var name = (p.kind === 'alerte' ? 'Majordome alerte ' : 'Majordome photo ') + stamp(p.at) + '.jpg';
    if (NB) return b64(p.blob).then(function (d) { return nbCall('oeilSave', [d, name]); })
      .then(function () { X.toast('Photo rangée dans la galerie (Images › Majordome)'); }, function (e) { X.toast('Enregistrement impossible : ' + (e && e.message || e)); });
    if (PCAPI && PCAPI.fs && PCAPI.fs.saveAs) {
      return PCAPI.fs.saveAs(p.blob, name, { types: [{ description: 'Photo JPEG', accept: { 'image/jpeg': ['.jpg'] } }], startIn: 'pictures' })
        .then(function (r) { if (r && r.ok) X.toast(r.downloaded ? 'Photo téléchargée' : 'Photo enregistrée'); }, function () { X.toast('Enregistrement annulé'); });
    }
    var a = document.createElement('a'), u = URL.createObjectURL(p.blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
    X.toast('Photo téléchargée');
    return Promise.resolve();
  }

  /* ---------------- Caméra partagée ---------------- */
  var W = 160, Hh = 120;
  var cam = { stream: null, video: null, opening: null, err: '', users: {}, facing: 'user' };
  // lecture de documents : caméra arrière du téléphone (on vise la feuille) ; tout le reste (présence, gestes, selfie, surveillance) : caméra frontale
  var DOC = ANDROID ? 'environment' : 'user';
  var small = document.createElement('canvas'); small.width = W; small.height = Hh;
  var sg = small.getContext('2d', { willReadFrequently: true });
  function camOpen(facing) {
    facing = facing || 'user';
    if (cam.opening) return cam.opening.then(function (v) { return cam.facing === facing ? v : camOpen(facing); });
    if (cam.stream && cam.facing === facing) return Promise.resolve(cam.video);
    if (cam.stream) { cam.stream.getTracks().forEach(function (t) { t.stop(); }); cam.stream = null; if (cam.video) cam.video.srcObject = null; cam.video = null; }
    cam.facing = facing;
    if (!CAN) return Promise.reject(new Error('pas de caméra accessible ici'));
    // le suivi du regard (mj-regard.js) garde sa propre caméra : on le met en pause pendant qu'on s'en sert
    cam.opening = MD.getUserMedia({ video: facing === 'environment' ? { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15 } } : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15 } }, audio: false }).then(function (s) {
      cam.stream = s; cam.err = '';
      var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = s;
      cam.video = v;
      return v.play().catch(function () { }).then(function () {
        return new Promise(function (ok) { var t0 = Date.now(); (function w() { if (v.readyState >= 2 && v.videoWidth) return ok(v); if (Date.now() - t0 > 5000) return ok(v); setTimeout(w, 80); })(); });
      });
    }).catch(function (e) {
      cam.err = e && e.name === 'NotAllowedError' ? 'caméra refusée' : (e && e.name === 'NotFoundError' ? 'aucune caméra' : 'caméra indisponible');
      throw new Error(cam.err);
    }).then(function (v) { cam.opening = null; return v; }, function (e) { cam.opening = null; throw e; });
    return cam.opening;
  }
  function camClose() {
    if (cam.stream) cam.stream.getTracks().forEach(function (t) { t.stop(); });
    cam.stream = null; if (cam.video) cam.video.srcObject = null; cam.video = null;
  }
  function use(who, on) {
    if (on) cam.users[who] = 1; else delete cam.users[who];
    if (!Object.keys(cam.users).length) camClose();
    // fin d'une lecture à la caméra arrière : si la présence ou la surveillance tournent encore, on revient à la frontale
    else if (!on && cam.facing !== 'user' && !cam.users.apercu) camOpen('user').catch(function () { });
  }
  function grab(maxW, q) {
    var v = cam.video; if (!v || !v.videoWidth) return Promise.reject(new Error('image indisponible'));
    var w = v.videoWidth, h = v.videoHeight, k = Math.min(1, (maxW || 1600) / w);
    var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return new Promise(function (ok, ko) { c.toBlob(function (b) { if (b) ok(b); else ko(new Error('image indisponible')); }, 'image/jpeg', q || 0.88); });
  }
  function camErr(e) { return (e && e.message) || cam.err || 'caméra indisponible'; }

  /* ---------------- Visages (pico.js) ---------------- */
  var pico = { classify: null, memory: null, loading: null };
  function picoLoad() {
    if (pico.classify) return Promise.resolve();
    if (pico.loading) return pico.loading;
    pico.loading = new Promise(function (ok, ko) {
      var go = function () {
        fetch('vision/facefinder.bin').then(function (r) { if (!r.ok) throw new Error('modèle absent'); return r.arrayBuffer(); }).then(function (b) {
          pico.classify = window.pico.unpack_cascade(new Int8Array(b)); pico.memory = window.pico.instantiate_detection_memory(3); ok();
        }).catch(function (e) { pico.loading = null; ko(e); });
      };
      if (window.pico && window.pico.unpack_cascade) return go();
      var s = document.createElement('script'); s.src = 'vision/pico.js';
      s.onload = go; s.onerror = function () { pico.loading = null; ko(new Error('pico.js introuvable')); };
      document.head.appendChild(s);
    });
    return pico.loading;
  }
  function faces(gray, mem) {
    if (!pico.classify) return [];
    var img = { pixels: gray, nrows: Hh, ncols: W, ldim: W };
    var d = window.pico.run_cascade(img, pico.classify, { shiftfactor: 0.1, minsize: 20, maxsize: 1000, scalefactor: 1.1 });
    if (mem && pico.memory) d = pico.memory(d);
    d = window.pico.cluster_detections(d, 0.2);
    return d.filter(function (q) { return q[3] > 30; });
  }

  /* ---------------- Analyse des images ---------------- */
  var prev = null;
  function frame() {
    var v = cam.video; if (!v || v.readyState < 2) return null;
    sg.drawImage(v, 0, 0, W, Hh);
    var d = sg.getImageData(0, 0, W, Hh).data, n = W * Hh, gray = new Uint8Array(n), sum = 0, sum2 = 0;
    for (var i = 0, j = 0; i < n; i++, j += 4) { var g = (d[j] * 2 + d[j + 1] * 7 + d[j + 2]) / 10; gray[i] = g; sum += g; sum2 += g * g; }
    var mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    var moving = 0, cx = 0;
    if (prev) {
      for (var k = 0; k < n; k += 2) { if (Math.abs(gray[k] - prev[k]) > 28) { moving++; cx += k % W; } }
      moving *= 2;
    }
    prev = gray;
    return { gray: gray, mean: mean, sd: sd, motion: moving / n, cx: moving ? (cx * 2 / moving) / W : 0.5 };
  }

  /* ---------------- Boucle : présence, gestes, surveillance ---------------- */
  var loop = 0, tick = 0;
  var st = { seen: 0, since: 0, gone: 0, greeted: true, paused: false, dark: 0, lit: 0, armed: false, waves: [], lastGesture: 0, veille: false };
  var garde = { on: false, armedAt: 0, last: 0, hits: 0, events: 0, startAt: 0 };
  // batterie basse (mj-jarvis.js, MJ.batterieBasse) : présence et gestes en pause ; la surveillance continue
  function wantLoop() { return garde.on || (!document.hidden && !MJ.batterieBasse && (S.oeil.presence || S.oeil.gestes)); }
  function regardBusy() { try { return MJ.suivi && MJ.suivi.state && MJ.suivi.state().on; } catch (e) { return false; } }
  var failAt = 0;
  function refresh(force) {
    if (force === true) failAt = 0;
    if (wantLoop() && !regardBusy()) {
      if (loop || cam.opening) return;
      if (failAt && Date.now() - failAt < 60000) return;   // caméra refusée ou absente : pas une demande toutes les 2 s
      use('loop', true);
      camOpen().then(function () {
        if (!wantLoop()) { stopLoop(); return; }
        if (S.oeil.presence) picoLoad().catch(function () { });
        prev = null;
        if (!loop) loop = setInterval(step, ANDROID ? 220 : 150);   // téléphone : un peu moins d'images, moins de batterie
      }).catch(function () { failAt = Date.now(); use('loop', false); paintState(); });
    } else stopLoop();
  }
  function stopLoop() { if (loop) clearInterval(loop); loop = 0; prev = null; use('loop', false); veille(false); }
  function step() {
    var f; try { f = frame(); } catch (e) { return; }
    if (!f) return;
    tick++;
    var t = Date.now();
    // --- surveillance : mouvement franc sur deux images de suite ---
    if (garde.on && t > garde.armedAt) {
      if (f.motion > 0.035 && f.mean > 12) garde.hits++; else garde.hits = 0;
      if (garde.hits >= 2 && t - garde.last > 20000) { garde.last = t; garde.hits = 0; alerte(); }
    }
    if (document.hidden) return;
    // --- gestes ---
    if (S.oeil.gestes && t - st.lastGesture > 4000) {
      // main posée sur la caméra : image sombre et uniforme pendant plus d'une seconde, juste après une image éclairée
      // (une main qui arrive). Téléphone posé face contre la table, poche, pièce dans le noir : l'image est sombre
      // depuis longtemps, rien ne se passe ; après un geste, il faut revoir de la lumière pour recommencer.
      var sombre = f.mean < 28 && f.sd < 14;
      if (!sombre && f.mean > 40) { st.lit = t; if (!st.dark) st.armed = true; }
      if (sombre) {
        if (!st.dark) { st.dark = t; st.fromLit = st.armed && t - st.lit < 2500; }
        else if (st.fromLit && t - st.dark > 1100) { st.dark = 0; st.fromLit = false; st.armed = false; st.lastGesture = t; gesteSilence(); }
      } else st.dark = 0;
      // main agitée : beaucoup de mouvement qui va et vient de gauche à droite
      if (f.motion > 0.10) st.waves.push({ t: t, x: f.cx });
      st.waves = st.waves.filter(function (w) { return t - w.t < 1600; });
      if (st.waves.length >= 5) {
        var turns = 0, dir = 0, lo = 1, hi = 0;
        for (var i = 1; i < st.waves.length; i++) {
          var dx = st.waves[i].x - st.waves[i - 1].x; lo = Math.min(lo, st.waves[i].x); hi = Math.max(hi, st.waves[i].x);
          if (Math.abs(dx) < 0.04) continue;
          var s2 = dx > 0 ? 1 : -1; if (dir && s2 !== dir) turns++; dir = s2;
        }
        if (turns >= 2 && hi - lo > 0.18) { st.waves = []; st.lastGesture = t; gesteEcoute(); }
      }
    }
    // --- présence (visages, une image sur trois) ---
    if (S.oeil.presence && pico.classify && tick % 3 === 0) {
      var fc = faces(f.gray, true).length;
      if (fc) {
        if (!st.seen || t - st.seen > 8000) { if (!st.since || t - st.seen > 5 * 60000) { st.since = t; st.paused = false; } }
        if (st.gone && t - st.gone > S.oeil.absent * 60000 && !st.greeted) { st.greeted = true; bonjour(t - st.gone); }
        st.seen = t; st.gone = 0; veille(false);
        if (S.oeil.pause > 0 && !st.paused && t - st.since > S.oeil.pause * 60000) { st.paused = true; pause(t - st.since); }
      } else if (st.seen && t - st.seen > 8000) {
        if (!st.gone) { st.gone = st.seen; st.greeted = false; }
        if (S.oeil.veille && t - st.gone > 3 * 60000) veille(true);
      }
    }
  }
  setInterval(function () { refresh(); }, 2000);
  document.addEventListener('visibilitychange', refresh);

  function busy() { return MJ.listening || (X.speaking && X.speaking()) || MJ.wait; }
  function gesteEcoute() {
    if (busy()) return;
    veille(false);
    MJ.voiceTurn = true;
    try { X.exec({ intent: 'wake', p: {} }); } catch (e) { }
  }
  function gesteSilence() {
    var b = busy();
    try { X.exec({ intent: 'stop', p: {} }); } catch (e) { }
    if (b) X.toast('Main sur la caméra : silence');   // rien à faire taire : pas de message
  }
  function bonjour(ms) {
    if (MJ.onPresence) try { if (MJ.onPresence(ms)) return; } catch (e) { }   // résumé du matin en attente (mj-jarvis.js)
    if (busy() || MJ.nuit) return;   // mode nuit (mj-jarvis.js) : pas d'annonce spontanée
    var h = new Date().getHours(), w = h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
    var min = Math.round(ms / 60000), retour = min >= 120 ? '' : ' Content de vous revoir.';
    X.answer({ say: X.withSir(w) + '.' + retour, k: 'Présence' });
  }
  function pause(ms) {
    if (busy() || MJ.nuit) return;   // mode nuit (mj-jarvis.js) : pas d'annonce spontanée
    var min = Math.round(ms / 60000), dur = min >= 90 ? Math.round(min / 60 * 2) / 2 + ' heures' : min + ' minutes';
    X.answer({ say: 'Cela fait ' + dur.replace('.5', ' et demie') + ' que vous êtes devant l\'écran. Une petite pause, pour les yeux et le dos ?', k: 'Présence' });
  }

  /* ---------------- Veille : écran assombri quand vous êtes parti ---------------- */
  var veilleEl = null, veilleT = 0;
  function veille(on) {
    if (on === st.veille) return; st.veille = on;
    if (on) {
      if (!veilleEl) {
        veilleEl = document.createElement('div'); veilleEl.className = 'oeil-veille';
        veilleEl.innerHTML = '<div class="oeil-h"></div><div class="oeil-s">En veille · je me réveille quand vous revenez</div>';
        veilleEl.onclick = function () { st.seen = Date.now(); st.gone = 0; veille(false); };
      }
      document.body.appendChild(veilleEl);
      var paint = function () { if (veilleEl) veilleEl.querySelector('.oeil-h').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
      paint(); veilleT = setInterval(paint, 15000);
      requestAnimationFrame(function () { if (veilleEl) veilleEl.classList.add('on'); });
    } else if (veilleEl) {
      clearInterval(veilleT); veilleEl.classList.remove('on');
      var el = veilleEl; setTimeout(function () { if (!st.veille && el.parentNode) el.remove(); }, 600);
    }
  }

  /* ---------------- Aperçu et compte à rebours ---------------- */
  var css = document.createElement('style');
  css.textContent =
    '.oeil-ov{position:fixed;inset:0;z-index:60;background:rgba(3,6,12,.86);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px}' +
    '.oeil-ov video{max-width:min(92vw,900px);max-height:68vh;border-radius:16px;transform:scaleX(-1);background:#000;box-shadow:0 0 0 1px rgba(120,200,255,.35),0 0 40px rgba(60,160,255,.25)}' +
    '.oeil-ov .oeil-n{position:absolute;font:700 min(28vw,220px)/1 system-ui,sans-serif;color:#fff;text-shadow:0 0 30px rgba(80,180,255,.9);pointer-events:none}' +
    '.oeil-ov .oeil-t{color:#cfe6ff;font-size:16px;text-align:center;max-width:640px}' +
    '.oeil-ov .oeil-f{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .35s}' +
    '.oeil-veille{position:fixed;inset:0;z-index:55;background:#000;opacity:0;transition:opacity .6s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;cursor:pointer}' +
    '.oeil-veille.on{opacity:.93}.oeil-veille .oeil-h{font:200 min(18vw,140px)/1 system-ui,sans-serif;color:#9fd4ff;letter-spacing:.04em}.oeil-veille .oeil-s{color:#5f7f99;font-size:14px}' +
    '.oeil-ph{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin:8px 0}.oeil-ph figure{margin:0;position:relative}' +
    '.oeil-ph img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block;cursor:pointer}.oeil-ph figcaption{font-size:11.5px;opacity:.75;margin-top:2px}' +
    '.oeil-ph .al{position:absolute;top:4px;left:4px;background:#d7263d;color:#fff;font-size:10.5px;padding:1px 6px;border-radius:6px}' +
    '.oeil-img{max-width:100%;border-radius:12px;display:block;margin:6px 0}.oeil-txt{white-space:pre-wrap;max-height:40vh;overflow:auto;background:rgba(255,255,255,.04);border-radius:10px;padding:8px 10px;font-size:14px}';
  document.head.appendChild(css);
  var ov = null;
  function overlay(text) {
    dropOverlay();
    ov = document.createElement('div'); ov.className = 'oeil-ov';
    ov.innerHTML = '<div class="oeil-t"></div><div class="oeil-n"></div><div class="oeil-f"></div><button class="btn sm" type="button">Fermer</button>';
    ov.querySelector('.oeil-t').textContent = text || '';
    var v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.autoplay = true;
    if (cam.stream) v.srcObject = cam.stream;
    if (cam.facing === 'environment') v.style.transform = 'none';
    ov.insertBefore(v, ov.firstChild);
    v.play().catch(function () { });
    ov.querySelector('button').onclick = function () { closeOverlay(); };
    document.body.appendChild(ov);
    return ov;
  }
  function dropOverlay() { if (ov) { var v = ov.querySelector('video'); if (v) v.srcObject = null; ov.remove(); ov = null; } }
  function closeOverlay() { dropOverlay(); use('apercu', false); }
  function countdown(n, text) {
    var o = overlay(text), el = o.querySelector('.oeil-n');
    return new Promise(function (ok) {
      (function next(i) {
        if (!ov || ov !== o) return ok(false);
        if (i <= 0) { el.textContent = ''; return ok(true); }
        el.textContent = i; if (i <= 3) tone(i === 1 ? 880 : 660, 0.08);
        setTimeout(function () { next(i - 1); }, 1000);
      })(n);
    });
  }
  function flash() { if (!ov) return; var f = ov.querySelector('.oeil-f'); f.style.opacity = '0.9'; setTimeout(function () { f.style.opacity = '0'; }, 120); }
  var AC = null;
  function tone(hz, s) { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); var o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = hz; g.gain.value = 0.08; o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + s); } catch (e) { } }
  function siren() { [0, 0.25, 0.5, 0.75].forEach(function (d, i) { setTimeout(function () { tone(i % 2 ? 660 : 990, 0.2); }, d * 1000); }); }

  /* ---------------- Commandes ---------------- */
  function photoCard(p, title, say) {
    var u = URL.createObjectURL(p.blob);
    var c = X.answer({ say: say, k: title, html: '<p>' + esc(say) + '</p><img class="oeil-img" alt="" src="' + u + '"><div class="row"><button class="btn sm pri" data-oe="save">💾 Enregistrer</button><button class="btn sm" data-oe="all">Toutes les photos</button></div>' });
    c.addEventListener('click', function (e) {
      var b = e.target.closest('[data-oe]'); if (!b) return;
      if (b.dataset.oe === 'save') savePhoto(p);
      else X.settingsSheet('oeil');
    });
    return c;
  }
  function doPhoto(sec) {
    use('apercu', true);
    return camOpen().then(function () {
      var say = sec > 3 ? 'Photo dans ' + sec + ' secondes.' : 'Souriez !';
      X.answer({ say: say, k: 'Photo' });
      return countdown(sec, 'Regardez la caméra');
    }).then(function (go) {
      if (!go) { use('apercu', false); return X.answer('Photo annulée.').done; }
      return grab(1920, 0.9).then(function (b) {
        flash(); tone(1200, 0.05);
        return addPhoto(b, 'photo');
      }).then(function (p) {
        setTimeout(closeOverlay, 700);
        return photoCard(p, 'Photo', 'Voilà, la photo est prise.').done;
      });
    }).catch(function (e) { closeOverlay(); return X.errorReply('Je ne peux pas prendre de photo : ' + camErr(e) + '.').done; });
  }
  /** Montre la caméra, compte à rebours, photo nette puis lecture du texte → Promise<texte> (vide : rien de lisible) */
  function lireTexte(consigne, sec) {
    var ocr = NB || (PCAPI && PCAPI.ocr && PCAPI.ocr.supported && PCAPI.ocr.supported());
    if (!ocr) return Promise.reject(new Error('lecture indisponible ici'));
    use('apercu', true);
    return camOpen(DOC).then(function () { return countdown(sec || 4, consigne || (DOC === 'environment' ? 'Visez le texte avec la caméra arrière' : 'Tenez le texte devant la caméra')); }).then(function (go) {
      if (!go) { use('apercu', false); var e = new Error('annulé'); e.cancel = true; throw e; }
      return grab(2200, 0.95);
    }).then(function (b) {
      flash(); setTimeout(closeOverlay, 500);
      if (NB) return b64(b).then(function (d) { return nbCall('oeilOcr', [d]); });
      return PCAPI.ocr.recognize(b, { lang: 'fra' });
    }).then(function (r) { return String(r && r.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); },
      function (e) { closeOverlay(); throw e; });
  }
  function doLire() {
    var ocr = NB || (PCAPI && PCAPI.ocr && PCAPI.ocr.supported && PCAPI.ocr.supported());
    if (!ocr) return X.answer('La lecture de documents a besoin de l\'appli Majordome à jour sur le téléphone, ou de la version PC avec Edge ou Chrome récents.').done;
    use('apercu', true);
    return camOpen(DOC).then(function () {
      var back = DOC === 'environment';
      X.answer({ say: back ? 'Visez la feuille avec la caméra arrière, bien à plat.' : 'Tenez la feuille bien à plat devant la caméra.', k: 'Lecture' });
      return countdown(4, back ? 'Visez la feuille avec la caméra arrière, bien éclairée et sans bouger' : 'Tenez la feuille devant la caméra, bien éclairée et sans bouger');
    }).then(function (go) {
      if (!go) { use('apercu', false); return X.answer('Lecture annulée.').done; }
      return grab(2200, 0.95).then(function (b) {
        flash(); setTimeout(closeOverlay, 500);
        X.answer({ say: 'Je lis…', k: 'Lecture' });
        if (NB) return b64(b).then(function (d) { return nbCall('oeilOcr', [d]); });
        return PCAPI.ocr.recognize(b, { lang: 'fra' });
      }).then(function (r) {
        var txt = String(r && r.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        if (txt.replace(/\W/g, '').length < 4) return X.answer('Je ne vois pas de texte lisible. Rapprochez la feuille, avec plus de lumière, et redemandez-moi.').done;
        var said = txt.replace(/\s*\n\s*/g, '. ').replace(/\.\s*\./g, '.');
        if (said.length > 900) said = said.slice(0, 900).replace(/\s\S*$/, '') + '… Le reste est affiché à l\'écran.';
        var c = X.answer({ say: said, k: 'Lecture', html: '<div class="oeil-txt"></div><div class="row"><button class="btn sm" data-oe="copy">Copier le texte</button></div>' });
        c.querySelector('.oeil-txt').textContent = txt;
        c.addEventListener('click', function (e) { if (e.target.closest('[data-oe="copy"]') && navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { X.toast('Texte copié'); }); });
        return c.done;
      });
    }).catch(function (e) { closeOverlay(); return X.errorReply('Lecture impossible : ' + camErr(e) + '.').done; });
  }
  function doGarde(on) {
    if (on) {
      if (garde.on) return X.answer('La surveillance est déjà en route.').done;
      return camOpen().then(function () {
        garde.on = true; garde.startAt = Date.now(); garde.armedAt = Date.now() + 15000; garde.last = 0; garde.events = 0; garde.hits = 0;
        try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { }
        refresh(true); paintState(); keepAwake(true);
        return X.answer({ say: 'Surveillance activée dans 15 secondes. Au moindre mouvement, je prends une photo' + (S.oeil.alarme ? ' et je donne l\'alerte' : '') + '. ' + (ANDROID ? 'Laissez Majordome ouvert, téléphone posé face à la pièce et branché.' : 'Laissez cette fenêtre ouverte.'), k: 'Surveillance' }).done;
      }).catch(function (e) { return X.errorReply('Je ne peux pas surveiller : ' + camErr(e) + '.').done; });
    }
    if (!garde.on) return X.answer('La surveillance n\'était pas en route.').done;
    garde.on = false; refresh(); paintState(); keepAwake(false);
    var n = garde.events, d = Math.round((Date.now() - garde.startAt) / 60000);
    return X.answer({ say: 'Surveillance arrêtée' + (d ? ' après ' + X.dur(d * 60000) : '') + '. ' + (n ? n + ' alerte' + (n > 1 ? 's' : '') + ' : dites « qu\'as-tu vu ? » pour les photos.' : 'Rien à signaler.'), k: 'Surveillance' }).done;
  }
  function alerte() {
    grab(1600, 0.85).then(function (b) { return addPhoto(b, 'alerte'); }).then(function (p) {
      garde.events++;
      if (S.oeil.alarme) siren();
      photoCard(p, 'Surveillance', 'Mouvement détecté à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '. J\'ai pris une photo.');
      try { if (window.Notification && Notification.permission === 'granted') new Notification('Majordome : mouvement détecté', { body: 'Photo prise à ' + new Date().toLocaleTimeString('fr-FR'), tag: 'mj-oeil' }); } catch (e) { }
    }).catch(function () { });
  }
  function doVu() {
    return photos().then(function (l) {
      var al = l.filter(function (p) { return p.kind === 'alerte'; });
      var since = garde.startAt || 0, recent = al.filter(function (p) { return p.at >= since; });
      if (!al.length) return X.answer(garde.on ? 'Rien pour le moment, la surveillance continue.' : 'Je n\'ai rien vu : aucune alerte enregistrée.').done;
      var list = (recent.length ? recent : al).slice(0, 6);
      var c = X.answer({ say: (recent.length || al.length) + ' alerte' + ((recent.length || al.length) > 1 ? 's' : '') + '. La dernière ' + when(list[0].at) + '.', k: 'Surveillance', html: '<p>' + list.length + ' dernière(s) alerte(s) :</p>' + gallery(list) });
      bindGallery(c, list);
      return c.done;
    });
  }
  function doVois(count) {
    use('vois', true);
    return Promise.all([camOpen(), picoLoad()]).then(function () {
      return new Promise(function (ok) { setTimeout(ok, 400); });
    }).then(function () {
      var best = 0;
      for (var i = 0; i < 3; i++) { var f = frame(); if (f) best = Math.max(best, faces(f.gray, false).length); }
      use('vois', false);
      var say;
      if (!best) say = count ? 'Je ne vois personne pour le moment.' : 'Non, je ne vous vois pas. Mettez-vous face à la caméra, avec un peu de lumière.';
      else if (best === 1) say = count ? 'Je vois une personne.' : 'Oui, je vous vois.';
      else say = 'Je vois ' + best + ' personnes.';
      return X.answer({ say: say, k: 'Caméra' }).done;
    }).catch(function (e) { use('vois', false); return X.errorReply('Je ne vois rien : ' + camErr(e) + '.').done; });
  }
  function doApercu() {
    use('apercu', true);
    return camOpen().then(function () { overlay('Voici ce que voit ma caméra. Les images ne sont pas enregistrées.'); return X.answer({ say: 'Voici ce que je vois.', k: 'Caméra' }).done; })
      .catch(function (e) { use('apercu', false); return X.errorReply('Caméra indisponible : ' + camErr(e) + '.').done; });
  }
  function doOption(key, on) {
    if (!CAN) return X.answer('Pas de caméra accessible ici.').done;
    S.oeil[key] = on; save(); refresh(true); paintState();
    var lbl = key === 'presence' ? 'Détection de présence' : 'Commande par gestes';
    var more = on ? (key === 'gestes' ? ' Agitez la main devant la caméra pour que je vous écoute, posez la main dessus pour me faire taire.' : ' Je vous accueillerai à votre retour.') : '';
    return X.answer({ say: lbl + (on ? ' activée.' : ' désactivée.') + more, k: 'Caméra' }).done;
  }
  H.oeil = function (p) {
    switch (p.act) {
      case 'photo': return doPhoto(Math.max(3, Math.min(30, p.sec || 3)));
      case 'lire': return doLire();
      case 'garde_on': return doGarde(true);
      case 'garde_off': return doGarde(false);
      case 'vu': return doVu();
      case 'vois': return doVois(false);
      case 'compte': return doVois(true);
      case 'apercu': return doApercu();
      case 'opt': return doOption(p.key, p.on);
    }
    return X.answer('Je n\'ai pas compris.').done;
  };

  /* ---------------- Compréhension des phrases ---------------- */
  var N = { une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, vingt: 20, trente: 30 };
  function oeilParse(t) {
    var m;
    if (/\b(appli|application|appareil photo|galerie|carnet|voyage)\b/.test(t)) return null;   // « ouvre l'appareil photo », carnet de voyage : ailleurs
    if ((m = /^(?:(?:est ce que tu peux|tu peux|peux tu|pourrais tu|tu pourrais) )?(?:prends?|prendre|prenez|fais|faire|faites|tire|tirer)(?: moi| nous)? (?:une |un |la |ma )?(?:photo|selfie|cliche|portrait)(?: de moi| de nous)?(?: dans (\d+|\w+) secondes?)?$/.exec(t))
      || (m = /^(?:photo|selfie|cheese|ouistiti)(?: dans (\d+|\w+) secondes?)?$/.exec(t)))
      return { act: 'photo', sec: m[1] ? (+m[1] || N[m[1]] || 3) : 3 };
    if (/^(?:(?:est ce que tu peux|tu peux|peux tu|pourrais tu) )?(?:lis|lit|lire|lisez|dechiffre)(?: moi| nous)? (?:ce |cette |ca|cela|ceci|le |la |l |mon |ma )?(?:document|feuille|papier|page|lettre|courrier|ticket|etiquette|notice|facture|panneau|affiche|ordonnance|ce que je (?:te )?montre|ca|ceci|cela)?$/.test(t)
      && !/^(?:lis|lit|lire|lisez)$/.test(t)) return { act: 'lire' };
    if (/^(?:qu est ce qui est ecrit|qu est ce qu il y a d ecrit|que dit (?:ce|cette) (?:document|feuille|papier|lettre)|qu est ce que ca dit)(?: (?:la|dessus|ici))?$/.test(t)) return { act: 'lire' };
    if (/^(?:arrete|arreter|arretez|desactive|desactiver|coupe|couper|stoppe|stop|fin de|termine)(?: la| le)? (?:surveillance|garde|mode surveillance|mode garde|mode sentinelle)$/.test(t)) return { act: 'garde_off' };
    if (/^(?:(?:active|activer|lance|lancer|demarre|demarrer|mets|mettre|passe en)(?: la| le)? (?:surveillance|mode surveillance|mode garde|mode sentinelle)|(?:surveille|surveiller|surveillez|garde|monte la garde)(?: (?:la|le|ma|mon|l))? ?(?:piece|maison|bureau|salle|salon|chambre|entree|appartement|atelier|garage|ordinateur|pc)?|mode sentinelle)$/.test(t)
      && !/^garde$/.test(t)) return { act: 'garde_on' };
    if (/^(?:qu as tu vu|qu est ce que tu as vu|tu as vu quelque chose|t as vu quelque chose|quelqu un est (?:il )?(?:venu|passe)|il y a eu du passage|il s est passe quelque chose|des alertes|les alertes(?: de (?:la )?surveillance)?|montre(?: moi)? les alertes|rapport de surveillance)$/.test(t)) return { act: 'vu' };
    if (/^(?:est ce que tu me vois|tu me vois|me vois tu|tu me vois bien|est ce que tu vois quelqu un|tu vois quelqu un|y a t il quelqu un|il y a quelqu un)$/.test(t)) return { act: 'vois' };
    if (/^(?:combien (?:de personnes|de gens|de visages|de monde)(?: (?:vois tu|tu vois|y a t il|il y a|sont la|devant (?:toi|l ecran)))?|on est combien|nous sommes combien|combien sommes nous)$/.test(t)) return { act: 'compte' };
    if (/^(?:montre(?: moi)?|affiche|ouvre|fais (?:moi )?voir)(?: ce que tu vois| ta camera| la webcam| ma webcam| ta webcam| l apercu(?: de la camera)?)$|^(?:qu est ce que tu vois|que vois tu|tu vois quoi)$/.test(t)) return { act: 'apercu' };
    if ((m = /^(active|activer|allume|mets|desactive|desactiver|coupe|eteins|arrete)(?: la| le| les)? (detection de (?:presence|visage)|presence|gestes?|commande par gestes?|commandes? gestuelles?|detection des gestes)$/.exec(t)))
      return { act: 'opt', key: /geste/.test(m[2]) ? 'gestes' : 'presence', on: /^(active|activer|allume|mets)$/.test(m[1]) };
    return null;
  }
  if (NLU && NLU.parse) {
    var orig = NLU.parse;
    NLU.parse = function (raw, ctx) {
      var r = orig.apply(this, arguments);
      try {
        if (!r || (ctx && ctx.expect) || !r.t) return r;
        var t = String(r.t).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').replace(/ (?:s il (?:te|vous) plait|stp|svp)$/, '').trim();
        var p = oeilParse(t);
        if (p) return { intent: 'oeil', p: p, t: r.t, raw: r.raw, wake: r.wake };
      } catch (e) { }
      return r;
    };
  }
  if (X.HELP && X.HELP.push) X.HELP.push(['Caméra (l\'œil de Majordome)', ['Prends une photo', 'Photo dans 10 secondes', 'Lis-moi ce document', 'Surveille la pièce', 'Qu\'as-tu vu ?', 'Arrête la surveillance', 'Est-ce que tu me vois ?', 'Montre-moi ce que tu vois', 'Active les gestes', 'Active la détection de présence']]);

  /* ---------------- Réglages ---------------- */
  function gallery(list) {
    return '<div class="oeil-ph">' + list.map(function (p, i) { return '<figure data-i="' + i + '"><img alt="" data-u="' + i + '">' + (p.kind === 'alerte' ? '<span class="al">alerte</span>' : '') + '<figcaption>' + esc(when(p.at)) + '</figcaption></figure>'; }).join('') + '</div>';
  }
  function bindGallery(root, list) {
    list.forEach(function (p, i) {
      var img = root.querySelector('img[data-u="' + i + '"]'); if (!img) return;
      img.src = URL.createObjectURL(p.blob); img.title = 'Enregistrer cette photo';
      img.onclick = function () { savePhoto(p); };
    });
  }
  function stateTxt() {
    if (!CAN) return 'Pas de caméra accessible dans ce navigateur.';
    if (cam.err) return 'Caméra : ' + cam.err + ' (autorisez la caméra pour Majordome dans le navigateur).';
    if (garde.on) return '🔴 Surveillance en cours.';
    if (loop) return '🟢 Caméra active (' + [S.oeil.presence && 'présence', S.oeil.gestes && 'gestes'].filter(Boolean).join(', ') + ').';
    return 'Caméra éteinte.';
  }
  function paintState() { var e = document.getElementById('oeilEtat'); if (e) e.textContent = stateTxt(); }
  function sw(id, on, t, s) { return '<div class="set"><div class="t">' + t + '<small>' + s + '</small></div><label class="sw"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label></div>'; }
  function html() {
    return '<div class="sect" id="f-oeil">L\'œil de Majordome (caméra)</div>' +
      '<p class="note">Tout est analysé sur cet appareil, sans internet, et rien n\'est envoyé. <b id="oeilEtat">' + esc(stateTxt()) + '</b></p>' +
      sw('oePres', S.oeil.presence, 'Présence', 'Vous accueille quand vous revenez après ' + S.oeil.absent + ' min d\'absence, assombrit l\'écran quand vous partez, propose une pause après un long moment devant l\'écran') +
      sw('oeVeille', S.oeil.veille, 'Écran en veille quand vous partez', 'Avec la présence : écran noir et horloge après 3 min sans vous voir') +
      '<div class="set"><div class="t">Rappel de pause<small>Avec la présence : après ce temps passé devant l\'écran</small></div><select id="oePause" class="btn sm">' + [0, 30, 45, 60, 90, 120].map(function (m) { return '<option value="' + m + '"' + (+S.oeil.pause === m ? ' selected' : '') + '>' + (m ? m + ' min' : 'jamais') + '</option>'; }).join('') + '</select></div>' +
      sw('oeGest', S.oeil.gestes, 'Gestes de la main', 'Agitez la main devant la caméra : je vous écoute. Posez la main sur la caméra une seconde : silence') +
      sw('oeAlarme', S.oeil.alarme, 'Alarme sonore de la surveillance', '« Surveille la pièce » : photo à chaque mouvement, et sirène si activé') +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button class="btn sm" id="oePhoto">📷 Prendre une photo</button><button class="btn sm" id="oeLire">📄 Lire un document</button><button class="btn sm" id="oeGarde">' + (garde.on ? '⏹ Arrêter la surveillance' : '🛡 Surveiller la pièce') + '</button><button class="btn sm" id="oeVoir">👁 Aperçu</button></div>' +
      '<div class="sect" style="font-size:13px">Photos de Majordome</div><div id="oePhotos"><p class="note">Chargement…</p></div>';
  }
  function bind() {
    var g = function (id) { return document.getElementById(id); };
    var on = function (id, key) { var e = g(id); if (e) e.onchange = function () { S.oeil[key] = this.checked; save(); refresh(true); setTimeout(paintState, 800); }; };
    on('oePres', 'presence'); on('oeVeille', 'veille'); on('oeGest', 'gestes'); on('oeAlarme', 'alarme');
    if (g('oePause')) g('oePause').onchange = function () { S.oeil.pause = +this.value; st.paused = false; save(); };
    var run = function (id, act) { var e = g(id); if (e) e.onclick = function () { X.closeSheet(); MJ.voiceTurn = false; H.oeil({ act: act }); }; };
    run('oePhoto', 'photo'); run('oeLire', 'lire'); run('oeVoir', 'apercu');
    if (g('oeGarde')) g('oeGarde').onclick = function () { X.closeSheet(); H.oeil({ act: garde.on ? 'garde_off' : 'garde_on' }); };
    var box = g('oePhotos'); if (!box) return;
    photos().then(function (l) {
      if (!document.body.contains(box)) return;
      if (!l.length) { box.innerHTML = '<p class="note">Aucune photo. Dites « prends une photo » ou « surveille la pièce ».</p>'; return; }
      var list = l.slice(0, 24);
      box.innerHTML = '<p class="note">' + l.length + ' photo(s), gardées dans Majordome (60 au plus). Touchez une photo pour l\'enregistrer.</p>' + gallery(list) + '<div class="row"><button class="btn sm bad" id="oeClear">Effacer toutes les photos</button></div>';
      bindGallery(box, list);
      g('oeClear').onclick = function () { if (!confirm('Effacer toutes les photos de Majordome ?')) return; clearPhotos().then(function () { X.settingsSheet('oeil'); }); };
    });
  }
  if (CAN) {
    var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
    MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + html(); };
    MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };
  }

  MJ.oeil = { lireTexte: lireTexte, parse: oeilParse, state: function () { return { cam: !!cam.stream, loop: !!loop, garde: garde.on, err: cam.err, users: Object.keys(cam.users) }; }, photos: photos, refresh: refresh };
  refresh();
})();
