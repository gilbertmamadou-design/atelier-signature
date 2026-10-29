/* =====================================================================
   Majordome : sphère de particules animée (canvas 2D, code propre au projet).
   MJOrb.create(canvas) → { state(nom), level(0..1), speak(on), pulse(), stop() }
   États : idle (respire), listen (réagit au micro), think (tourne, violet),
   speak (pulse au rythme de la voix), error (rouge, frissonne), sleep (veille).
   Points répartis sur une sphère (spirale de Fibonacci), projetés en perspective,
   déformés par un bruit lisse ; nombre de points adapté à l'écran ; boucle
   arrêtée quand la page est cachée ; « réduire les animations » respecté
   (image fixe redessinée seulement quand l'état change).
   ===================================================================== */
(function (root) {
  'use strict';
  var COLORS = {
    idle: [70, 217, 194], listen: [96, 255, 160], think: [150, 128, 255],
    speak: [125, 200, 255], error: [255, 92, 115], sleep: [90, 110, 130]
  };
  function lerp(a, b, k) { return a + (b - a) * k; }
  function create(cv, opt) {
    opt = opt || {};
    var ctx = cv.getContext('2d'), dpr = Math.min(2, root.devicePixelRatio || 1);
    var reduce = false;
    try { reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    var small = Math.min(root.innerWidth || 800, root.innerHeight || 800) < 600 || /Android|Mobile/i.test(navigator.userAgent || '');
    var N = opt.count || (small ? 420 : 900);
    var pts = [], i;
    var GA = Math.PI * (3 - Math.sqrt(5));
    for (i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = GA * i;
      pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, ph: Math.random() * 6.283, sp: 0.6 + Math.random() * 0.8 });
    }
    var st = 'idle', lvl = 0, lvlS = 0, spk = 0, spkT = 0, col = COLORS.idle.slice(), rot = 0, tilt = 0.35, t0 = performance.now(), raf = 0, burst = 0, running = true, W = 0, H = 0;
    function size() {
      var b = cv.getBoundingClientRect(); W = Math.max(10, b.width); H = Math.max(10, b.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    size();
    var ro = root.ResizeObserver ? new ResizeObserver(function () { size(); if (reduce) frame(performance.now()); }) : null;
    if (ro) ro.observe(cv); else root.addEventListener('resize', size);
    function frame(now) {
      var t = (now - t0) / 1000;
      // enveloppe de la voix : oscillations quasi syllabiques tant que la synthèse parle
      var target = 0;
      if (spk) { var s = now - spkT; target = 0.35 + 0.35 * Math.abs(Math.sin(s / 95)) * (0.6 + 0.4 * Math.sin(s / 410)) + burst; burst *= 0.88; }
      lvlS = lerp(lvlS, st === 'listen' ? lvl : target, 0.25);
      var c = COLORS[st] || COLORS.idle;
      for (var k = 0; k < 3; k++) col[k] = lerp(col[k], c[k], 0.08);
      var speed = st === 'think' ? 1.6 : st === 'sleep' ? 0.08 : st === 'listen' ? 0.45 : 0.25;
      if (!reduce) rot += 0.016 * speed;
      var breathe = reduce ? 0 : (st === 'sleep' ? 0.01 : 0.025) * Math.sin(t * (st === 'think' ? 3.2 : 1.1));
      var base = Math.min(W, H) * 0.36 * (1 + breathe + lvlS * 0.22);
      var cx = W / 2, cy = H / 2, cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), stl = Math.sin(tilt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // halo
      var g = ctx.createRadialGradient(cx, cy, base * 0.2, cx, cy, base * 1.6);
      var a0 = st === 'sleep' ? 0.05 : 0.10 + lvlS * 0.25;
      g.addColorStop(0, 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',' + a0 + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      var jitter = st === 'error' ? 0.06 : 0, amp = 0.05 + lvlS * 0.28;
      for (var j = 0; j < N; j++) {
        var p = pts[j];
        var n = reduce ? 0 : Math.sin(t * p.sp * 2.1 + p.ph) * Math.sin(p.y * 4 + t * 1.3) * amp + (jitter ? (Math.random() - 0.5) * jitter : 0);
        var x = p.x * (1 + n), y = p.y * (1 + n), z = p.z * (1 + n);
        var x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
        var y1 = y * ct - z1 * stl, z2 = y * stl + z1 * ct;
        var persp = 1.9 / (2.6 - z2);
        var px = cx + x1 * base * persp, py = cy + y1 * base * persp;
        var depth = (z2 + 1) / 2;
        var al = 0.18 + depth * 0.72, sz = (0.7 + depth * 1.5) * (small ? 1.1 : 1);
        ctx.fillStyle = 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',' + al.toFixed(3) + ')';
        ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (!reduce && running && !document.hidden) raf = requestAnimationFrame(frame); else raf = 0;
    }
    function kick() { if (!raf && running && !document.hidden) raf = requestAnimationFrame(frame); }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
    if (reduce) frame(performance.now()); else kick();
    var api = {
      state: function (s) { if (!COLORS[s]) s = 'idle'; st = s; if (reduce) { for (var k = 0; k < 3; k++) col[k] = COLORS[s][k]; frame(performance.now()); } else kick(); },
      get: function () { return st; },
      level: function (v) { lvl = Math.max(0, Math.min(1, +v || 0)); },
      speak: function (on) { if (on && !spk) spkT = performance.now(); spk = on ? 1 : 0; if (on) api.state('speak'); kick(); },
      pulse: function () { burst = Math.min(0.4, burst + 0.22); },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; if (ro) ro.disconnect(); },
      reduced: reduce, count: N
    };
    return api;
  }
  root.MJOrb = { create: create };
})(window);
