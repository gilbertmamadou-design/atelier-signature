/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-orb.js : ne pas modifier ici. */
/* =====================================================================
   Majordome : sphère de particules animée (canvas 2D, code propre au projet).
   MJOrb.create(canvas, {pad}) → { state(nom), level(0..1, bandes), speak(on, texte, débit), word(texte, début, fin),
                                    pulse(), metrics(), stop() }
   États : idle (respire), listen (réagit au micro), think (tourne, violet),
   speak (pulse au rythme de la voix), error (rouge, frissonne), sleep (veille).
   Points répartis sur une sphère (spirale de Fibonacci), projetés en perspective,
   déformés par un bruit lisse ; nombre de points adapté à l'écran ; boucle
   arrêtée quand la page est cachée.
   Réaction au son :
    - écoute : niveau du micro (RMS envoyé par MajordomeBridge, ≈ 20 valeurs/s), suiveur d'enveloppe à attaque
      rapide (≈ 35 ms) et relâche douce (≈ 220 ms) → gonflement, éclat du halo, dispersion des particules ;
      bandes grave / médium / aigu si elles sont fournies → vague lente (grave) et frisson fin (aigu) ;
      attaque brusque → onde circulaire qui s'élargit.
    - parole : la synthèse ne donne pas son niveau ; enveloppe construite à partir des mots prononcés
      (événements de mots), des syllabes estimées (groupes de voyelles) et de la ponctuation (pauses) ;
      sans événements de mots, rythme syllabique régulier.
   « Réduire les animations » : pas de rotation ni de bruit ; pendant l'écoute ou la parole seulement,
   quelques images par seconde avec une réaction réduite (taille et halo), sinon image fixe.
   ===================================================================== */
(function (root) {
  'use strict';
  var COLORS = {
    idle: [70, 217, 194], listen: [96, 255, 160], think: [150, 128, 255],
    speak: [125, 200, 255], error: [255, 92, 115], sleep: [90, 110, 130]
  };
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* Syllabes estimées d'un mot français : groupes de voyelles, « e » muet final retiré */
  function syllables(w) {
    w = String(w || '').toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüÿœæ]/g, '');
    if (!w) return 0;
    var g = w.match(/[aeiouyàâäéèêëîïôöùûüÿœæ]+/g), n = g ? g.length : 1;
    if (n > 1 && /[^aeiouy]e(s|nt)?$/.test(w) && !/[éè]$/.test(w)) n--;
    return Math.max(1, n);
  }
  function create(cv, opt) {
    opt = opt || {};
    var ctx = cv.getContext('2d'), dpr = Math.min(2, root.devicePixelRatio || 1);
    var reduce = false;
    try { reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    var small = Math.min(root.innerWidth || 800, root.innerHeight || 800) < 600 || /Android|Mobile/i.test(navigator.userAgent || '');
    var N = opt.count || (small ? 460 : 900);
    var PAD = opt.pad || 1;   // le canvas déborde de la boîte (halo, gonflement) : rayon calculé sur la boîte
    var pts = [], i;
    var GA = Math.PI * (3 - Math.sqrt(5));
    for (i = 0; i < N; i++) {
      var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = GA * i;
      pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, ph: Math.random() * 6.283, sp: 0.6 + Math.random() * 0.8, d: 0.4 + Math.random() * 0.9 });
    }
    var st = 'idle', col = COLORS.idle.slice(), rot = 0, tilt = 0.35, t0 = performance.now(), raf = 0, tmo = 0, running = true, W = 0, H = 0, last = 0;
    // micro : valeur brute, instant de réception, enveloppe, enveloppe lente (détection d'attaque), bandes
    var mic = 0, micAt = 0, env = 0, envSlow = 0, bands = null, lo = 0, hi = 0, ripples = [];
    // parole : impulsions syllabiques planifiées
    var spk = 0, spkT = 0, spkText = '', spkRate = 1, words = 0, sylls = [], quietUntil = 0, sEnv = 0, burst = 0;
    var lvlS = 0, M = { scale: 1, glow: 0, level: 0, frames: 0 };
    function size() {
      var b = cv.getBoundingClientRect(); W = Math.max(10, b.width); H = Math.max(10, b.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    size();
    var ro = root.ResizeObserver ? new ResizeObserver(function () { size(); if (reduce) frame(performance.now()); }) : null;
    if (ro) ro.observe(cv); else root.addEventListener('resize', size);
    function voiceTarget(now) {
      if (!spk) return 0;
      var v = 0, any = false;
      for (var k = 0; k < sylls.length; k++) {
        var s = sylls[k], ph = (now - s.at) / s.dur;
        if (ph < 0) { any = true; continue; }
        if (ph > 1) continue;
        any = true;
        v = Math.max(v, s.amp * Math.pow(Math.sin(Math.PI * ph), 0.6));
      }
      while (sylls.length && now - sylls[0].at > sylls[0].dur) sylls.shift();
      if (any) return 0.16 + v * 0.84;
      if (now < quietUntil) return 0.05;                       // pause de ponctuation
      if (!words && now - spkT > 350) {                        // aucun événement de mot : rythme syllabique régulier
        var s2 = now - spkT; return 0.3 + 0.45 * Math.pow(Math.abs(Math.sin(s2 / 105)), 0.8) * (0.65 + 0.35 * Math.sin(s2 / 430));
      }
      return 0.16;                                             // entre deux mots
    }
    function frame(now) {
      raf = 0; tmo = 0;
      var t = (now - t0) / 1000, dt = last ? clamp((now - last) / 1000, 0.001, 0.1) : 0.016; last = now;
      // --- niveaux ---
      if (now - micAt > 260) mic *= Math.pow(0.02, dt);        // plus de valeur reçue : retombe
      var aA = 1 - Math.exp(-dt / 0.035), aR = 1 - Math.exp(-dt / 0.22);
      env += (mic - env) * (mic > env ? aA : aR);
      envSlow += (env - envSlow) * (1 - Math.exp(-dt / 0.5));
      var bl = bands ? bands[0] : env, bh = bands ? bands[2] : Math.max(0, env - envSlow) * 2.2;
      lo += (bl - lo) * (bl > lo ? aA : aR); hi += (bh - hi) * (bh > hi ? 1 - Math.exp(-dt / 0.02) : 1 - Math.exp(-dt / 0.15));
      var vt = voiceTarget(now);
      sEnv += (vt - sEnv) * (vt > sEnv ? 1 - Math.exp(-dt / 0.03) : 1 - Math.exp(-dt / 0.12));
      var target = st === 'listen' ? env : spk ? sEnv : 0;
      burst *= Math.pow(0.02, dt);
      lvlS = clamp(target + burst, 0, 1.2);
      if (st === 'listen' && env - envSlow > 0.16 && !reduce && (!ripples.length || now - ripples[ripples.length - 1].at > 260)) ripples.push({ at: now, a: clamp(env, 0.3, 1) });
      var c = COLORS[st] || COLORS.idle;
      for (var k = 0; k < 3; k++) col[k] = lerp(col[k], c[k], reduce ? 1 : 1 - Math.exp(-dt / 0.2));
      var speed = st === 'think' ? 1.6 : st === 'sleep' ? 0.08 : st === 'listen' ? 0.45 + lvlS * 0.9 : st === 'speak' ? 0.35 + lvlS * 0.6 : 0.25;
      if (!reduce) rot += dt * 0.96 * speed;
      var kr = reduce ? 0.35 : 1, lv = lvlS * kr;
      var breathe = reduce ? 0 : (st === 'sleep' ? 0.01 : 0.025) * Math.sin(t * (st === 'think' ? 3.2 : 1.1));
      var base0 = Math.min(W, H) / PAD * 0.40, scale = 1 + breathe + lv * 0.28, base = base0 * scale;
      var cx = W / 2, cy = H / 2, cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), stl = Math.sin(tilt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var rgb = (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0);
      // halo : plus large et plus lumineux avec le son
      var a0 = st === 'sleep' ? 0.05 : 0.10 + lv * 0.30;
      var g = ctx.createRadialGradient(cx, cy, base * 0.15, cx, cy, Math.min(Math.min(W, H) / 2, base * (1.5 + lv * 0.3)));   // reste dans le canvas : pas de bord visible
      g.addColorStop(0, 'rgba(' + rgb + ',' + a0.toFixed(3) + ')');
      g.addColorStop(0.55, 'rgba(' + rgb + ',' + (a0 * 0.35).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // ondes circulaires (attaques du micro)
      for (var q = ripples.length - 1; q >= 0; q--) {
        var rp = ripples[q], age = (now - rp.at) / 900;
        if (age >= 1) { ripples.splice(q, 1); continue; }
        ctx.strokeStyle = 'rgba(' + rgb + ',' + ((1 - age) * 0.45 * rp.a).toFixed(3) + ')'; ctx.lineWidth = 1.2 + (1 - age) * 1.6;
        ctx.beginPath(); ctx.arc(cx, cy, base0 * (1.02 + age * 0.55), 0, 6.2832); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      var jitter = st === 'error' ? 0.06 : 0, amp = reduce ? 0 : 0.045 + lv * 0.22, disp = reduce ? 0 : lv * 0.16;
      var wl = reduce ? 0 : lo * 0.10 * kr, wh = reduce ? 0 : hi * 0.06 * kr, szk = (small ? 1.1 : 1) * (1 + lv * 0.35), alk = 0.18 + lv * 0.12;
      for (var j = 0; j < N; j++) {
        var p = pts[j];
        var n = reduce ? 0 : Math.sin(t * p.sp * 2.1 + p.ph) * Math.sin(p.y * 4 + t * 1.3) * amp + (jitter ? (Math.random() - 0.5) * jitter : 0);
        if (wl) n += Math.sin(p.y * 2.6 + t * 3.1) * wl;                       // vague lente (grave)
        if (wh) n += Math.sin(p.x * 9 + p.y * 7 + t * 13 + p.ph) * wh;         // frisson fin (aigu)
        if (disp) n += disp * p.d * (0.6 + 0.4 * Math.sin(t * 5 + p.ph));      // dispersion des particules
        var x = p.x * (1 + n), y = p.y * (1 + n), z = p.z * (1 + n);
        var x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
        var y1 = y * ct - z1 * stl, z2 = y * stl + z1 * ct;
        var persp = 1.9 / (2.6 - z2);
        var px = cx + x1 * base * persp, py = cy + y1 * base * persp;
        var depth = clamp((z2 + 1) / 2, 0, 1);
        var al = Math.min(1, alk + depth * 0.72), sz = (0.7 + depth * 1.5) * szk;
        ctx.fillStyle = 'rgba(' + rgb + ',' + al.toFixed(3) + ')';
        ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      }
      ctx.globalCompositeOperation = 'source-over';
      M.scale = scale; M.glow = a0; M.level = lvlS; M.frames++;
      if (opt.onLevel) try { opt.onLevel(lv); } catch (e) { }
      schedule();
    }
    function active() { return st === 'listen' || spk || burst > 0.01 || lvlS > 0.01; }
    function schedule() {
      if (raf || tmo || !running || document.hidden) return;
      if (!reduce) { raf = requestAnimationFrame(frame); return; }
      if (active()) tmo = setTimeout(function () { frame(performance.now()); }, 160);   // réduit : quelques images par seconde, seulement pendant le son
    }
    function kick() { schedule(); }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = 0; kick(); } else { if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; } });
    frame(performance.now());
    var api = {
      state: function (s) { if (!COLORS[s]) s = 'idle'; st = s; if (s !== 'listen') { mic = 0; bands = null; } if (reduce) { for (var k = 0; k < 3; k++) col[k] = COLORS[s][k]; if (!raf && !tmo) frame(performance.now()); } else kick(); },
      get: function () { return st; },
      /* niveau du micro (0..1) ; b = [grave, médium, aigu] (0..1), facultatif */
      level: function (v, b) {
        v = clamp(+v || 0, 0, 1);
        mic = Math.pow(v, 0.75); micAt = performance.now();   // légère compression : les voix douces se voient aussi
        bands = Array.isArray(b) && b.length >= 3 ? [clamp(+b[0] || 0, 0, 1), clamp(+b[1] || 0, 0, 1), clamp(+b[2] || 0, 0, 1)] : null;
        kick();
      },
      speak: function (on, text, rate) {
        if (on && !spk) { spkT = performance.now(); words = 0; sylls = []; quietUntil = 0; }
        if (on && text != null) { spkText = String(text); spkRate = clamp(+rate || 1, 0.4, 3); }
        spk = on ? 1 : 0; if (on) api.state('speak'); else { sylls = []; }
        kick();
      },
      /* mot prononcé : texte de la phrase (ou null : celle de speak), début et fin du mot dans ce texte */
      word: function (text, s, e) {
        if (text != null) spkText = String(text);
        var tx = spkText, now = performance.now();
        s = Math.max(0, +s || 0);
        if (!(e > s)) { var m = /^[^\s.,;:!?…]+/.exec(tx.slice(s)); e = s + (m ? m[0].length : 1); }
        var w = tx.slice(s, e), n = syllables(w) || 1, per = clamp(175 / spkRate, 90, 360);
        if (sylls.length) { var lastS = sylls[sylls.length - 1]; now = Math.max(now, lastS.at + lastS.dur * 0.8); }
        for (var k = 0; k < n; k++) sylls.push({ at: now + k * per, dur: per * 0.95, amp: (k === 0 ? 1 : 0.78) * (/^[A-ZÀ-Ý0-9]/.test(w) ? 1 : 0.92) });
        var after = tx.slice(e, e + 3);
        if (/^\s*[.!?…]/.test(after)) quietUntil = now + n * per + 320; else if (/^\s*[,;:]/.test(after)) quietUntil = now + n * per + 170;
        words++; kick();
      },
      pulse: function () { burst = Math.min(0.45, burst + 0.24); kick(); },
      metrics: function () { return { scale: M.scale, glow: M.glow, level: M.level, frames: M.frames, state: st, running: !!(raf || tmo) }; },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; if (ro) ro.disconnect(); },
      reduced: reduce, count: N
    };
    return api;
  }
  root.MJOrb = { create: create, syllables: syllables };
})(window);
