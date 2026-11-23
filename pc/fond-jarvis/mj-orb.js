/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-orb.js : ne pas modifier ici. */
/* =====================================================================
   Majordome : sphère de particules animée (canvas 2D, code propre au projet).
   Autres modèles (opt.forme), mêmes réactions au son et mêmes couleurs d'état :
     « reacteur » (anneaux de réacteur qui tournent, cœur lumineux), « onde » (spectre circulaire de barres),
     « atome » (trois orbites en 3D et leurs électrons), « cristal » (icosaèdre en fil de fer, sommets brillants).
   MJOrb.create(canvas, {pad, forme}) → { state(nom), level(0..1, bandes), speak(on, texte, débit), word(texte, début, fin), voice(0..1),
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
    - parole : voix Piper (mj-voix.js) : niveau réel (RMS de l'audio produit, ≈ 30 valeurs/s, voice(v)) ;
      voix du système : la synthèse ne donne pas son niveau ; enveloppe construite à partir des mots prononcés
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
  // couleurs au choix (Réglages › Apparence › Couleur) : repos, écoute, parole ; réflexion et erreur gardent leur sens
  var DEF = JSON.parse(JSON.stringify(COLORS));
  var PALETTES = {
    cyan: null,
    bleu: { idle: [70, 150, 255], listen: [110, 205, 255], speak: [150, 185, 255] },
    violet: { idle: [160, 120, 255], listen: [205, 150, 255], speak: [190, 170, 255], think: [255, 140, 220] },
    vert: { idle: [80, 230, 120], listen: [160, 255, 150], speak: [120, 230, 200] },
    ambre: { idle: [255, 180, 70], listen: [255, 215, 110], speak: [255, 200, 140] },
    rouge: { idle: [255, 95, 95], listen: [255, 150, 120], speak: [255, 130, 150], error: [255, 225, 120] },
    blanc: { idle: [215, 228, 245], listen: [255, 255, 255], speak: [195, 215, 255] }
  };
  function theme(name) {
    var p = PALETTES[name] || null;
    Object.keys(DEF).forEach(function (k) { COLORS[k] = (p && p[k] ? p[k] : DEF[k]).slice(); });
    return !!PALETTES.hasOwnProperty(name);
  }
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
    var spk = 0, spkT = 0, spkText = '', spkRate = 1, words = 0, sylls = [], quietUntil = 0, sEnv = 0, burst = 0, vReal = 0, vRealAt = -1e9;
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
      if (now - vRealAt < 160) return 0.04 + vReal * 0.96;   // niveau réel de la voix Piper
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
    /* ---------------- Autres modèles ---------------- */
    var FORME = /^(reacteur|onde|atome|cristal)$/.test(opt.forme || '') ? opt.forme : 'sphere';
    var spin2 = 0, spec = [];
    var ICO = (function () {   // icosaèdre : 12 sommets, 30 arêtes
      var f = (1 + Math.sqrt(5)) / 2, v = [[-1, f, 0], [1, f, 0], [-1, -f, 0], [1, -f, 0], [0, -1, f], [0, 1, f], [0, -1, -f], [0, 1, -f], [f, 0, -1], [f, 0, 1], [-f, 0, -1], [-f, 0, 1]];
      var n = Math.sqrt(1 + f * f); v = v.map(function (p) { return [p[0] / n, p[1] / n, p[2] / n]; });
      var e = []; for (var a = 0; a < 12; a++) for (var b = a + 1; b < 12; b++) { var dx = v[a][0] - v[b][0], dy = v[a][1] - v[b][1], dz = v[a][2] - v[b][2]; if (Math.abs(Math.sqrt(dx * dx + dy * dy + dz * dz) - 2 / n) < 0.01) e.push([a, b]); }
      return { v: v, e: e };
    })();
    function stroke(a, w) { ctx.strokeStyle = 'rgba(' + this_rgb + ',' + clamp(a, 0, 1).toFixed(3) + ')'; ctx.lineWidth = w; }
    var this_rgb = '';
    function glowDot(x, y, r, a) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,' + clamp(a, 0, 1).toFixed(3) + ')'); g.addColorStop(0.35, 'rgba(' + this_rgb + ',' + clamp(a * 0.8, 0, 1).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + this_rgb + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    function drawForme(t, dt, cx, cy, base, base0, lv, rgb) {
      this_rgb = rgb;
      var spd = st === 'think' ? 2.2 : st === 'sleep' ? 0.1 : 0.5 + lv * 1.6;
      if (!reduce) spin2 += dt * spd;
      var err = st === 'error' && !reduce ? (Math.random() - 0.5) * base * 0.03 : 0;
      cx += err; cy += err * 0.6;
      if (FORME === 'reacteur') {
        // cœur
        glowDot(cx, cy, base * (0.34 + lv * 0.22), 0.55 + lv * 0.45);
        stroke(0.85, 2 + lv * 2); ctx.beginPath(); ctx.arc(cx, cy, base * 0.30, 0, 6.2832); ctx.stroke();
        // pales trapézoïdales (10), sens inverse
        var nb = 10, r1 = base * 0.42, r2 = base * (0.66 + lv * 0.06);
        for (var i = 0; i < nb; i++) {
          var a0 = -spin2 * 0.6 + i / nb * 6.2832, w1 = 0.20, w2 = 0.24;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a0 - w1) * r1, cy + Math.sin(a0 - w1) * r1); ctx.lineTo(cx + Math.cos(a0 + w1) * r1, cy + Math.sin(a0 + w1) * r1);
          ctx.lineTo(cx + Math.cos(a0 + w2) * r2, cy + Math.sin(a0 + w2) * r2); ctx.lineTo(cx + Math.cos(a0 - w2) * r2, cy + Math.sin(a0 - w2) * r2); ctx.closePath();
          ctx.fillStyle = 'rgba(' + rgb + ',' + (0.10 + lv * 0.25).toFixed(3) + ')'; ctx.fill(); stroke(0.55 + lv * 0.4, 1.2); ctx.stroke();
        }
        // anneau segmenté extérieur (24 segments), qui tourne
        var ns = 24, ro2 = base * (0.80 + lv * 0.08);
        for (var k = 0; k < ns; k++) {
          var s0 = spin2 * 0.35 + k / ns * 6.2832, on2 = (k + Math.floor(t * (1 + lv * 6))) % 6 !== 0;
          stroke(on2 ? 0.75 : 0.25, 3 + lv * 3); ctx.beginPath(); ctx.arc(cx, cy, ro2, s0, s0 + 6.2832 / ns * 0.72); ctx.stroke();
        }
        // fin anneau extérieur gradué
        stroke(0.35, 1); ctx.beginPath(); ctx.arc(cx, cy, base * 0.93, 0, 6.2832); ctx.stroke();
        for (var m = 0; m < 72; m++) { var am = m / 72 * 6.2832 - spin2 * 0.1, l1 = base * 0.93, l2 = l1 + (m % 6 ? 4 : 9) * (1 + lv); stroke(0.4, 1); ctx.beginPath(); ctx.moveTo(cx + Math.cos(am) * l1, cy + Math.sin(am) * l1); ctx.lineTo(cx + Math.cos(am) * l2, cy + Math.sin(am) * l2); ctx.stroke(); }
      } else if (FORME === 'onde') {
        var nbar = small ? 64 : 96, rin = base * 0.55;
        if (spec.length !== nbar) { spec = []; for (var q = 0; q < nbar; q++) spec.push(0); }
        for (var b2 = 0; b2 < nbar; b2++) {
          var ang = b2 / nbar * 6.2832 - 1.5708, sym = Math.abs(Math.sin(ang * 0.5 + 0.785));
          var tgt = reduce ? lv * 0.5 : (0.06 + lv * (0.45 + 0.55 * Math.abs(Math.sin(b2 * 0.37 + t * 6.3) * Math.sin(b2 * 0.11 - t * 2.7))) + lo * 0.25 * sym + hi * 0.3 * Math.abs(Math.sin(b2 * 1.7 + t * 17)));
          if (st === 'idle' || st === 'sleep') tgt = 0.05 + 0.04 * Math.sin(t * 1.3 + b2 * 0.3);
          if (st === 'think') tgt = 0.12 + 0.25 * Math.max(0, Math.sin(b2 / nbar * 6.2832 * 3 - t * 6));
          spec[b2] += (tgt - spec[b2]) * (tgt > spec[b2] ? 0.5 : 0.12);
          var len = base * 0.45 * spec[b2], x1 = cx + Math.cos(ang) * rin, y1 = cy + Math.sin(ang) * rin;
          stroke(0.45 + spec[b2] * 0.55, Math.max(1.5, base * 6.2832 * 0.55 / nbar * 0.55));
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(cx + Math.cos(ang) * (rin + len), cy + Math.sin(ang) * (rin + len)); ctx.stroke();
          var len2 = len * 0.35; stroke(0.25 + spec[b2] * 0.3, 1.2);
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(cx + Math.cos(ang) * (rin - len2), cy + Math.sin(ang) * (rin - len2)); ctx.stroke();
        }
        stroke(0.6, 1.5); ctx.beginPath(); ctx.arc(cx, cy, rin * 0.98, 0, 6.2832); ctx.stroke();
        glowDot(cx, cy, rin * (0.55 + lv * 0.3), 0.18 + lv * 0.5);
      } else if (FORME === 'atome') {
        glowDot(cx, cy, base * (0.22 + lv * 0.18), 0.7 + lv * 0.3);
        var orb3 = [[0.0, 1.15], [1.05, 1.15], [2.1, 1.15]];
        for (var o = 0; o < 3; o++) {
          var rotZ = orb3[o][0] + spin2 * 0.08, R = base * (0.82 + lv * 0.1), tiltK = 0.32 + 0.04 * Math.sin(t * 0.7 + o);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotZ);
          stroke(0.45 + lv * 0.3, 1.4 + lv * 1.5); ctx.beginPath(); ctx.ellipse(0, 0, R, R * tiltK, 0, 0, 6.2832); ctx.stroke();
          for (var el = 0; el < 2; el++) {
            var pa = spin2 * (1.6 + o * 0.35) * orb3[o][1] + el * 3.1416 + o;
            var exx = Math.cos(pa) * R, eyy = Math.sin(pa) * R * tiltK, front = Math.sin(pa) > 0;
            glowDot(exx, eyy, base * (front ? 0.07 : 0.05) * (1 + lv * 0.8), front ? 0.95 : 0.5);
          }
          ctx.restore();
        }
      } else {   // cristal
        var rx = spin2 * 0.55, ry = spin2 * 0.8 + 0.4, R2 = base * 0.78, pts2 = [];
        var cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry);
        for (var vi = 0; vi < 12; vi++) {
          var v = ICO.v[vi], d = 1 + (reduce ? 0 : lv * 0.18 * Math.sin(t * 9 + vi * 1.7)) + (st === 'error' && !reduce ? (Math.random() - 0.5) * 0.06 : 0);
          var x = v[0] * d, y = v[1] * d, z = v[2] * d;
          var y1 = y * cxr - z * sxr, z1 = y * sxr + z * cxr, x2 = x * cyr + z1 * syr, z2 = -x * syr + z1 * cyr;
          var pp = 1.9 / (2.6 - z2); pts2.push([cx + x2 * R2 * pp, cy + y1 * R2 * pp, z2]);
        }
        ICO.e.forEach(function (e) { var A = pts2[e[0]], B2 = pts2[e[1]], dep = clamp(((A[2] + B2[2]) / 2 + 1) / 2, 0, 1); stroke(0.15 + dep * 0.65 + lv * 0.2, 0.8 + dep * 1.6 + lv * 1.2); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B2[0], B2[1]); ctx.stroke(); });
        pts2.forEach(function (P) { var dep = clamp((P[2] + 1) / 2, 0, 1); glowDot(P[0], P[1], base * (0.03 + dep * 0.05) * (1 + lv), 0.35 + dep * 0.65); });
        glowDot(cx, cy, base * (0.25 + lv * 0.25), 0.25 + lv * 0.5);
      }
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
      if (FORME !== 'sphere') { drawForme(t, dt, cx, cy, base, base0, lv, rgb); ctx.globalCompositeOperation = 'source-over'; M.scale = scale; M.glow = a0; M.level = lvlS; M.frames++; if (opt.onLevel) try { opt.onLevel(lv); } catch (e) { } schedule(); return; }
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
      /* niveau réel de la voix (0..1, RMS de l'audio joué) : remplace l'enveloppe estimée tant qu'il arrive */
      voice: function (v) { vReal = clamp(+v || 0, 0, 1); vRealAt = performance.now(); if (!spk) api.speak(true); kick(); },
      metrics: function () { return { scale: M.scale, glow: M.glow, level: M.level, frames: M.frames, state: st, running: !!(raf || tmo) }; },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; if (ro) ro.disconnect(); },
      reduced: reduce, count: N, forme: FORME
    };
    return api;
  }
  root.MJOrb = { create: create, syllables: syllables, theme: theme, palettes: Object.keys(PALETTES) };
})(window);
