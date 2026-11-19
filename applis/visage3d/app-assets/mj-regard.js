/* =====================================================================
   Majordome › Me suivre du regard (option, désactivée par défaut)
   La caméra frontale repère votre visage (pico.js, modèle « facefinder », licence MIT, dossier vision/) ;
   les yeux de l'apparence vous suivent et la tête tourne légèrement vers vous. Sans visage pendant 2 s :
   le regard reprend sa vie normale.
   Images analysées sur l'appareil, en 160 × 120 et en niveaux de gris, environ 8 fois par seconde ; rien n'est
   enregistré ni envoyé. Caméra fermée quand Majordome n'est pas à l'écran.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, S = X.S;
  var on = false, stream = null, video = null, cv = null, g = null, timer = 0, classify = null, memory = null, err = '', loading = null;
  var fx = 0, fy = 0, seen = 0;
  var W = 160, H = 120;

  function want() { return !!S.suivi && !document.hidden && /visage|androide/.test(S.avatar || ''); }
  function loadLib() {
    if (classify) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = 'vision/pico.js';
      s.onload = function () {
        fetch('vision/facefinder.bin').then(function (r) { return r.arrayBuffer(); }).then(function (b) {
          classify = window.pico.unpack_cascade(new Int8Array(b)); memory = window.pico.instantiate_detection_memory(4); ok();
        }).catch(ko);
      };
      s.onerror = function () { loading = null; ko(new Error('pico.js introuvable')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function analyse() {
    if (!video || video.readyState < 2) return;
    g.drawImage(video, 0, 0, W, H);
    var d = g.getImageData(0, 0, W, H).data, gray = new Uint8Array(W * H);
    for (var i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (d[j] * 2 + d[j + 1] * 7 + d[j + 2]) / 10;
    var img = { pixels: gray, nrows: H, ncols: W, ldim: W };
    var dets = window.pico.run_cascade(img, classify, { shiftfactor: 0.1, minsize: 24, maxsize: 1000, scalefactor: 1.1 });
    dets = memory(dets);
    dets = window.pico.cluster_detections(dets, 0.2);
    var best = null; dets.forEach(function (q) { if (q[3] > 30 && (!best || q[2] * q[3] > best[2] * best[3])) best = q; });   // [ligne, colonne, taille, score]
    if (!best) return;
    // caméra frontale : l'image n'est pas en miroir → vous à droite de l'écran = à gauche de l'image
    var nx = -((best[1] / W) * 2 - 1), ny = -((best[0] / H) * 2 - 1) + 0.15;
    fx += (nx - fx) * 0.5; fy += (ny - fy) * 0.5; seen = Date.now();
    var av = MJ.avatar; if (av && av.follow) av.follow(Math.max(-1, Math.min(1, fx)), Math.max(-1, Math.min(1, fy)));
  }
  function start() {
    if (on) return; on = true; err = '';
    loadLib().then(function () {
      if (!on) return;
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } }, audio: false }).then(function (s) {
        if (!on) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        video = document.createElement('video'); video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.srcObject = s;
        video.play().catch(function () { });
        cv = document.createElement('canvas'); cv.width = W; cv.height = H; g = cv.getContext('2d', { willReadFrequently: true });
        timer = setInterval(function () { try { analyse(); } catch (e) { } }, 120);
      });
    }).catch(function (e) { err = e && e.name === 'NotAllowedError' ? 'caméra refusée' : 'caméra indisponible'; stop(); });
  }
  function stop() {
    if (!on) return; on = false;
    if (timer) clearInterval(timer); timer = 0;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null;
    if (video) { video.srcObject = null; video = null; }
  }
  function refresh() { if (want()) start(); else stop(); }
  MJ.suivi = { refresh: refresh, state: function () { return { on: on, err: err, seen: seen ? Date.now() - seen : -1 }; } };
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 1500);
  refresh();
})();
