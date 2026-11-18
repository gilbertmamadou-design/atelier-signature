/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-visage.js : ne pas modifier ici. */
/* =====================================================================
   Majordome : visage animé (canvas 2D, dessin original propre au projet), à la place de la sphère.
   MJFace.create(canvas, {pad, style, skin, hair, eyes, onLevel}) → même API que MJOrb :
     state(nom), get(), level(0..1, bandes), speak(on, texte, débit), word(texte, début, fin), voice(0..1),
     pulse(), mood(nom, ms), look(opts), metrics(), stop()
   Animations :
     - clignements naturels (parfois doubles), regard qui se déplace par saccades, respiration ;
     - tête qui bouge légèrement (lacet, tangage, roulis) avec effet de profondeur (traits du visage plus mobiles
       que le contour, cheveux en arrière-plan) ;
     - parole : ouverture de la bouche suivant le niveau réel de la voix Piper (ou l'enveloppe des syllabes pour la
       voix du système) ; forme des lèvres selon la voyelle prononcée (a, é, i, o, ou) estimée à partir du texte ;
       petits hochements et haussements de sourcils sur les syllabes accentuées ;
     - écoute : regard vers vous, sourcils levés, tête inclinée, pupilles qui réagissent au son ;
     - réflexion : regard en haut à côté, sourcils froncés ; erreur : moue et petit mouvement de tête ;
       veille : yeux fermés, tête baissée ;
     - humeurs passagères (mood) : joie, clin d'œil, tristesse, surprise.
   Styles : « holo » (hologramme teinté par la couleur de l'état) ou « naturel » (teint, cheveux, yeux au choix,
   lueur de l'état sur les contours et le halo).
   « Réduire les animations » : pas de mouvements de tête ni de saccades ; images seulement pendant le son.
   ===================================================================== */
(function (root) {
  'use strict';
  var COLORS = {
    idle: [70, 217, 194], listen: [96, 255, 160], think: [150, 128, 255],
    speak: [125, 200, 255], error: [255, 92, 115], sleep: [90, 110, 130]
  };
  var SKINS = { claire: [246, 214, 194], rosee: [240, 200, 180], medium: [222, 178, 142], mate: [190, 142, 104], foncee: [132, 90, 62] };
  var HAIRS = { brun: [72, 46, 30], chatain: [118, 78, 48], blond: [214, 176, 112], roux: [168, 72, 34], noir: [30, 26, 30], argent: [196, 200, 210] };
  var EYES = { marron: [112, 70, 38], noisette: [140, 104, 52], vert: [72, 128, 84], bleu: [70, 122, 178], gris: [120, 132, 140] };
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : +a.toFixed(3)) + ')'; }
  var WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  function syllables(w) { return root.MJOrb && root.MJOrb.syllables ? root.MJOrb.syllables(w) : Math.max(1, (String(w).match(/[aeiouyàâäéèêëîïôöùûü]+/gi) || [1]).length); }
  /* Voyelles d'un texte (une par syllabe) : A, E, I, O, U (ou arrondi) */
  function vowels(t) {
    var s = String(t || '').toLowerCase(), out = [], re = /(eau|ou|où|oû|oi|au|ai|ei|an|am|en|em|on|om|in|im|un|[aàâ]|[éèêë]|[iîïy]|[oôö]|[uûü]|e)/g, m;
    while ((m = re.exec(s))) {
      var v = m[1];
      out.push(/^(ou|où|oû|u|û|ü)$/.test(v) ? 'U' : /^(eau|au|o|ô|ö|on|om)$/.test(v) ? 'O' : /^(oi|a|à|â|an|am|en|em)$/.test(v) ? 'A' : /^(i|î|ï|y)$/.test(v) ? 'I' : 'E');
    }
    return out;
  }
  var SHAPES = { A: { w: 1.0, o: 1.0 }, E: { w: 1.1, o: 0.68 }, I: { w: 1.18, o: 0.42 }, O: { w: 0.8, o: 0.86 }, U: { w: 0.66, o: 0.5 } };

  /* Courbe lisse (Catmull-Rom → Bézier) passant par des points [[x,y],…] */
  function curve(ctx, p, closed) {
    var n = p.length; if (n < 2) return;
    ctx.moveTo(p[0][0], p[0][1]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) ctx.closePath();
  }

  function create(cv, opt) {
    opt = opt || {};
    var ctx = cv.getContext('2d'), dpr = Math.min(2, root.devicePixelRatio || 1);
    var reduce = false;
    try { reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    var PAD = opt.pad || 1;
    var look = { style: opt.style || 'naturel', skin: opt.skin || 'claire', hair: opt.hair || 'brun', eyes: opt.eyes || 'noisette' };
    var st = 'idle', col = COLORS.idle.slice(), t0 = performance.now(), raf = 0, tmo = 0, running = true, W = 0, H = 0, last = 0;
    var mic = 0, micAt = 0, env = 0, envSlow = 0;
    var spk = 0, spkT = 0, spkText = '', spkRate = 1, words = 0, sylls = [], quietUntil = 0, sEnv = 0, burst = 0, vReal = 0, vRealAt = -1e9;
    var lvlS = 0, M = { level: 0, frames: 0, mouth: 0 };
    // visèmes : voyelles de la phrase, index courant, détection des attaques de syllabe
    var vseq = [], vIdx = -1, vCur = 'A', armed = true;
    // animation (valeurs lissées)
    var A = { yaw: 0, pitch: 0, roll: 0, gx: 0, gy: 0, open: 1, brow: 0, worry: 0, furrow: 0, smile: 0.3, mouth: 0, mw: 1, pupil: 1, blush: 0.3, wink: 0 };
    var blinkAt = 0, blinkDur = 150, nextBlink = performance.now() + 1500, gazeT = { x: 0, y: 0 }, nextGaze = 0, shakeAt = -1e9, nodK = 0;
    var moodN = '', moodUntil = 0;
    function size() {
      var b = cv.getBoundingClientRect(); W = Math.max(10, b.width); H = Math.max(10, b.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    size();
    var ro = root.ResizeObserver ? new ResizeObserver(function () { size(); frame(performance.now()); }) : null;
    if (ro) ro.observe(cv); else root.addEventListener('resize', size);

    function voiceTarget(now) {
      if (!spk) return 0;
      if (now - vRealAt < 160) return vReal;
      var v = 0, any = false, cls = null;
      for (var k = 0; k < sylls.length; k++) {
        var s = sylls[k], ph = (now - s.at) / s.dur;
        if (ph < 0) { any = true; continue; }
        if (ph > 1) continue;
        any = true;
        var a = s.amp * Math.pow(Math.sin(Math.PI * ph), 0.6);
        if (a > v) { v = a; cls = s.v; }
      }
      while (sylls.length && now - sylls[0].at > sylls[0].dur) sylls.shift();
      if (cls) vCur = cls;
      if (any) return v * 0.9;
      if (now < quietUntil) return 0;
      if (!words && now - spkT > 350) { var s2 = now - spkT; return 0.25 + 0.45 * Math.pow(Math.abs(Math.sin(s2 / 105)), 0.8); }
      return 0.05;
    }
    function palette() {
      var c = col;
      if (look.style === 'holo') {
        return {
          holo: true, skin: mix(c, [8, 16, 28], 0.72), skinA: 0.78, skinHi: mix(c, WHITE, 0.35), skinLo: [4, 8, 16], hair: mix(c, [6, 10, 20], 0.62), hairHi: mix(c, WHITE, 0.25),
          lip: mix(c, [255, 130, 170], 0.45), lipA: 0.75, iris: mix(c, WHITE, 0.1), sclera: mix(c, WHITE, 0.82), line: mix(c, WHITE, 0.25), brow: mix(c, [10, 20, 30], 0.35), mouthIn: [6, 10, 18], glow: c
        };
      }
      var sk = SKINS[look.skin] || SKINS.claire, hr = HAIRS[look.hair] || HAIRS.brun, ir = EYES[look.eyes] || EYES.noisette;
      return {
        holo: false, skin: sk, skinA: 1, skinHi: mix(sk, WHITE, 0.35), skinLo: mix(sk, [70, 30, 30], 0.45), hair: hr, hairHi: mix(hr, WHITE, 0.3),
        lip: mix(mix(sk, [200, 80, 96], 0.62), BLACK, look.skin === 'foncee' ? 0.25 : 0), lipA: 1, iris: ir, sclera: [250, 248, 246], line: mix(sk, [40, 20, 20], 0.72),
        brow: mix(hr, BLACK, look.hair === 'blond' || look.hair === 'argent' ? 0.35 : 0.15), mouthIn: [70, 22, 30], glow: c
      };
    }

    function frame(now) {
      raf = 0; tmo = 0;
      var t = (now - t0) / 1000, dt = last ? clamp((now - last) / 1000, 0.001, 0.1) : 0.016; last = now;
      // --- niveaux (comme la sphère) ---
      if (now - micAt > 260) mic *= Math.pow(0.02, dt);
      var aA = 1 - Math.exp(-dt / 0.035), aR = 1 - Math.exp(-dt / 0.22);
      env += (mic - env) * (mic > env ? aA : aR);
      envSlow += (env - envSlow) * (1 - Math.exp(-dt / 0.5));
      var vt = voiceTarget(now);
      sEnv += (vt - sEnv) * (vt > sEnv ? 1 - Math.exp(-dt / 0.03) : 1 - Math.exp(-dt / 0.07));
      burst *= Math.pow(0.02, dt);
      lvlS = clamp((st === 'listen' ? env : spk ? sEnv : 0) + burst, 0, 1.2);
      // attaque de syllabe (voix Piper) : voyelle suivante, petit hochement
      if (spk && now - vRealAt < 160) {
        if (armed && sEnv > 0.3) { armed = false; vIdx++; if (vseq.length) vCur = vseq[Math.min(vIdx, vseq.length - 1)]; nodK = Math.min(1, nodK + 0.5 * sEnv); }
        else if (!armed && sEnv < 0.16) armed = true;
      } else if (spk && sEnv > 0.5 && armed) { armed = false; nodK = Math.min(1, nodK + 0.3); } else if (sEnv < 0.2) armed = true;
      nodK *= Math.pow(0.05, dt);
      var c = COLORS[st] || COLORS.idle;
      for (var k = 0; k < 3; k++) col[k] = lerp(col[k], c[k], 1 - Math.exp(-dt / 0.25));
      var mood = now < moodUntil ? moodN : '';

      // --- cibles d'expression selon l'état ---
      var T = { yaw: 0, pitch: 0, roll: 0, open: 1, brow: 0, worry: 0, furrow: 0, smile: 0.32, pupil: 1, blush: 0.3 };
      var mv = reduce ? 0 : 1;
      if (st === 'idle') { T.yaw = mv * (0.07 * Math.sin(t * 0.31) + 0.03 * Math.sin(t * 0.83)); T.pitch = mv * 0.03 * Math.sin(t * 0.47); T.roll = mv * 0.025 * Math.sin(t * 0.23); }
      else if (st === 'listen') { T.roll = mv * 0.07; T.pitch = mv * -0.02; T.yaw = mv * 0.02 * Math.sin(t * 0.6); T.open = 1.12; T.brow = 0.55 + env * 0.4; T.smile = 0.42; T.pupil = 1.15 + env * 0.25; }
      else if (st === 'think') { T.yaw = mv * (0.12 + 0.03 * Math.sin(t * 0.9)); T.roll = mv * -0.05; T.pitch = mv * -0.05; T.furrow = 0.7; T.smile = 0.05; T.open = 0.92; }
      else if (st === 'speak') { T.yaw = mv * (0.05 * Math.sin(t * 0.7) + 0.02 * Math.sin(t * 1.9)); T.pitch = mv * (0.02 * Math.sin(t * 1.3) + nodK * 0.05); T.roll = mv * 0.03 * Math.sin(t * 0.5); T.brow = 0.15 + nodK * 0.5; T.smile = 0.3; }
      else if (st === 'error') { var ea = (now - shakeAt) / 1000; T.yaw = mv * (ea < 0.9 ? 0.09 * Math.sin(ea * 22) * (1 - ea / 0.9) : 0); T.worry = 0.9; T.smile = -0.45; T.pitch = mv * 0.04; T.blush = 0.15; }
      else if (st === 'sleep') { T.pitch = mv * 0.1; T.roll = mv * 0.07; T.open = 0; T.smile = 0.2; }
      if (mood === 'joie') { T.smile = 1; T.brow = Math.max(T.brow, 0.45); T.blush = 0.65; T.open = Math.min(T.open, 0.82); }
      else if (mood === 'clin') { T.smile = 0.85; T.blush = 0.6; }
      else if (mood === 'triste') { T.smile = -0.5; T.worry = 1; T.pitch += mv * 0.05; T.blush = 0.15; }
      else if (mood === 'surprise') { T.brow = 1; T.open = 1.22; T.smile = 0.1; }
      // --- regard : saccades ---
      if (now > nextGaze) {
        if (st === 'think') { gazeT = { x: 0.55 + Math.random() * 0.35, y: -0.65 - Math.random() * 0.25 }; nextGaze = now + 900 + Math.random() * 1400; }
        else if (st === 'listen') { gazeT = { x: (Math.random() - 0.5) * 0.12, y: (Math.random() - 0.5) * 0.08 }; nextGaze = now + 700 + Math.random() * 900; }
        else if (st === 'speak') { gazeT = Math.random() < 0.7 ? { x: (Math.random() - 0.5) * 0.15, y: 0 } : { x: (Math.random() - 0.5) * 0.9, y: (Math.random() - 0.6) * 0.5 }; nextGaze = now + 900 + Math.random() * 1800; }
        else if (st === 'error' || mood === 'triste') { gazeT = { x: -0.2, y: 0.55 }; nextGaze = now + 1500; }
        else if (st === 'sleep') { gazeT = { x: 0, y: 0.4 }; nextGaze = now + 3000; }
        else { gazeT = Math.random() < 0.55 ? { x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.1 } : { x: (Math.random() - 0.5) * 1.3, y: (Math.random() - 0.5) * 0.7 }; nextGaze = now + 1300 + Math.random() * 2800; }
        if (reduce) gazeT = { x: 0, y: 0 };
      }
      var gk = 1 - Math.exp(-dt / 0.045);
      A.gx += (gazeT.x - A.gx) * gk; A.gy += (gazeT.y - A.gy) * gk;
      // --- clignements ---
      if (now > nextBlink && st !== 'sleep') {
        blinkAt = now; blinkDur = 130 + Math.random() * 60;
        nextBlink = now + (Math.random() < 0.15 ? 260 : (st === 'think' ? 1800 : 2400) + Math.random() * 3800);
      }
      var bp = (now - blinkAt) / blinkDur, blink = bp >= 0 && bp < 1 ? Math.sin(Math.PI * bp) : 0;
      // --- lissage ---
      var sk = 1 - Math.exp(-dt / 0.35), fk = 1 - Math.exp(-dt / 0.12);
      A.yaw += (T.yaw - A.yaw) * (st === 'error' ? 1 - Math.exp(-dt / 0.04) : sk); A.pitch += (T.pitch - A.pitch) * (1 - Math.exp(-dt / 0.15)); A.roll += (T.roll - A.roll) * sk;
      A.open += (T.open - A.open) * fk; A.brow += (T.brow - A.brow) * fk; A.worry += (T.worry - A.worry) * fk; A.furrow += (T.furrow - A.furrow) * fk;
      A.smile += (T.smile - A.smile) * (1 - Math.exp(-dt / 0.2)); A.pupil += (T.pupil - A.pupil) * fk; A.blush += (T.blush - A.blush) * sk;
      A.wink += ((mood === 'clin' ? 1 : 0) - A.wink) * (1 - Math.exp(-dt / 0.06));
      // bouche : ouverture et forme (voyelle)
      var shp = SHAPES[vCur] || SHAPES.A, mo = spk ? clamp(sEnv * 1.25, 0, 1) * shp.o : (st === 'listen' ? 0.04 + env * 0.05 : 0);
      if (mood === 'joie' && !spk) mo = Math.max(mo, 0.18);
      if (mood === 'surprise' && !spk) mo = 0.4;
      A.mouth += (mo - A.mouth) * (1 - Math.exp(-dt / (mo > A.mouth ? 0.025 : 0.06)));
      var mwT = spk && sEnv > 0.08 ? shp.w : (mood === 'surprise' ? 0.7 : 1);
      A.mw += (mwT - A.mw) * (1 - Math.exp(-dt / 0.06));
      var eyeOpen = clamp(A.open * (1 - blink), 0, 1.3);
      var breathe = reduce ? 0 : (st === 'sleep' ? 0.012 : 0.006) * Math.sin(t * (st === 'sleep' ? 0.9 : 1.6));
      draw(t, now, eyeOpen, breathe, palette());
      M.level = lvlS; M.mouth = A.mouth; M.frames++;
      if (opt.onLevel) try { opt.onLevel(lvlS * (reduce ? 0.35 : 1)); } catch (e) { }
      schedule();
    }

    function draw(t, now, eyeOpen, breathe, P) {
      var box = Math.min(W, H) / PAD, s = box * 0.33, cx = W / 2, cy = H / 2 - box * 0.08;
      var yaw = A.yaw, pitch = A.pitch;
      // projection : x, y en unités du visage ; d = profondeur (0 contour, 0.3 nez…) ; les traits proches bougent plus
      function X(x, d) { return cx + (x * (1 - Math.abs(yaw) * 0.12) + yaw * (d || 0) * 1.1) * s; }
      function Y(y, d) { return cy + (y * (1 + breathe) + pitch * (d || 0) * 0.9 + pitch * 0.15) * s; }
      function pt(x, y, d) { return [X(x, d), Y(y, d)]; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var g0 = P.glow, lv = lvlS;
      // halo
      var a0 = st === 'sleep' ? 0.06 : 0.14 + lv * 0.25;
      var hg = ctx.createRadialGradient(cx, cy, s * 0.4, cx, cy, Math.min(Math.min(W, H) / 2, s * 2.3));
      hg.addColorStop(0, rgba(g0, a0)); hg.addColorStop(0.6, rgba(g0, a0 * 0.35)); hg.addColorStop(1, rgba(g0, 0));
      ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
      // rotation de la tête (roulis) autour du cou
      ctx.save();
      var pvx = cx, pvy = cy + s * 1.0;
      ctx.translate(pvx, pvy); ctx.rotate(A.roll); ctx.translate(-pvx, -pvy);
      var sway = reduce ? 0 : Math.sin(t * 0.9) * 0.02 + yaw * -0.15;

      // ---- cheveux, arrière ----
      ctx.beginPath();
      curve(ctx, [pt(0, -1.3, -0.2), pt(0.72, -1.17, -0.25), pt(1.06, -0.62, -0.3), pt(1.12, 0.15, -0.3), pt(1.1 + sway, 0.95, -0.35), pt(1.22 + sway, 1.55, -0.4), pt(1.08 + sway, 1.78, -0.4), pt(0.9 + sway, 1.6, -0.4), pt(0.72 + sway, 1.74, -0.4), pt(0.5, 1.45, -0.3), pt(0, 1.15, -0.3),
        pt(-0.5, 1.45, -0.3), pt(-0.72 + sway, 1.74, -0.4), pt(-0.9 + sway, 1.6, -0.4), pt(-1.08 + sway, 1.78, -0.4), pt(-1.22 + sway, 1.55, -0.4), pt(-1.1 + sway, 0.95, -0.35), pt(-1.12, 0.15, -0.3), pt(-1.06, -0.62, -0.3), pt(-0.72, -1.17, -0.25)], true);
      var hgB = ctx.createLinearGradient(0, Y(-1.3), 0, Y(1.7));
      hgB.addColorStop(0, rgba(mix(P.hair, P.hairHi, 0.25), P.holo ? 0.75 : 1)); hgB.addColorStop(0.5, rgba(P.hair, P.holo ? 0.7 : 1)); hgB.addColorStop(1, rgba(mix(P.hair, BLACK, 0.35), P.holo ? 0.0 : 0.9));
      ctx.fillStyle = hgB; ctx.fill();
      // ---- cou et épaules ----
      ctx.beginPath();
      curve(ctx, [pt(-0.26, 0.7), pt(-0.27, 1.22), pt(-0.62, 1.45), pt(-1.35, 1.7), pt(-1.6, 2.4), pt(1.6, 2.4), pt(1.35, 1.7), pt(0.62, 1.45), pt(0.27, 1.22), pt(0.26, 0.7)], false);
      ctx.closePath();
      var ng = ctx.createLinearGradient(0, Y(0.7), 0, Y(2.2));
      ng.addColorStop(0, rgba(mix(P.skin, P.skinLo, 0.45), P.skinA)); ng.addColorStop(0.35, rgba(P.skin, P.skinA)); ng.addColorStop(1, rgba(P.skin, 0));
      ctx.fillStyle = ng; ctx.fill();
      // vêtement : encolure simple
      ctx.beginPath(); curve(ctx, [pt(-1.6, 1.85), pt(-0.95, 1.58), pt(-0.5, 1.62), pt(0, 1.88), pt(0.5, 1.62), pt(0.95, 1.58), pt(1.6, 1.85)], false);
      ctx.lineTo(X(1.6), Y(2.6)); ctx.lineTo(X(-1.6), Y(2.6)); ctx.closePath();
      var cg = ctx.createLinearGradient(0, Y(1.6), 0, Y(2.4)); var cloth = P.holo ? mix(P.glow, [10, 20, 30], 0.6) : [58, 72, 104];
      cg.addColorStop(0, rgba(cloth, P.holo ? 0.6 : 1)); cg.addColorStop(0.6, rgba(cloth, P.holo ? 0.3 : 0.9)); cg.addColorStop(1, rgba(cloth, 0));
      ctx.fillStyle = cg; ctx.fill();
      // ombre sous le menton
      var chinDrop = A.mouth * 0.06;
      var sg = ctx.createRadialGradient(X(0), Y(0.95 + chinDrop), s * 0.05, X(0), Y(0.95 + chinDrop), s * 0.45);
      sg.addColorStop(0, rgba(P.skinLo, P.holo ? 0.5 : 0.45)); sg.addColorStop(1, rgba(P.skinLo, 0));
      ctx.fillStyle = sg; ctx.fillRect(X(-0.5), Y(0.8), s, s * 0.6);

      // ---- visage ----
      var face = [pt(0, -1.02), pt(0.5, -0.92), pt(0.72, -0.55), pt(0.76, -0.1), pt(0.68, 0.32), pt(0.5, 0.68 + chinDrop * 0.5), pt(0.24, 0.95 + chinDrop), pt(0, 1.02 + chinDrop),
        pt(-0.24, 0.95 + chinDrop), pt(-0.5, 0.68 + chinDrop * 0.5), pt(-0.68, 0.32), pt(-0.76, -0.1), pt(-0.72, -0.55), pt(-0.5, -0.92)];
      ctx.beginPath(); curve(ctx, face, true);
      var fg = ctx.createRadialGradient(X(0, 0.2) - yaw * s * 0.3, Y(-0.1), s * 0.1, X(0), Y(0.05), s * 1.05);
      fg.addColorStop(0, rgba(mix(P.skin, P.skinHi, 0.45), P.skinA)); fg.addColorStop(0.6, rgba(P.skin, P.skinA)); fg.addColorStop(1, rgba(mix(P.skin, P.skinLo, 0.55), P.skinA));
      ctx.fillStyle = fg; ctx.fill();
      ctx.save(); ctx.clip();
      // ombre latérale (côté opposé au regard)
      var sideX = X(-yaw * 6 > 0 ? 0.8 : -0.8);
      var lg = ctx.createRadialGradient(sideX, Y(0), s * 0.2, sideX, Y(0), s * 0.9);
      lg.addColorStop(0, rgba(P.skinLo, 0.22 * Math.min(1, Math.abs(yaw) * 8))); lg.addColorStop(1, rgba(P.skinLo, 0));
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      // joues
      [-1, 1].forEach(function (sd) {
        var bx = X(sd * 0.44, 0.12), by = Y(0.22, 0.12), bg = ctx.createRadialGradient(bx, by, 0, bx, by, s * 0.24);
        var bc = P.holo ? mix(P.glow, [255, 120, 170], 0.5) : [235, 110, 120];
        bg.addColorStop(0, rgba(bc, (P.holo ? 0.18 : 0.2) * A.blush * 1.6)); bg.addColorStop(1, rgba(bc, 0));
        ctx.fillStyle = bg; ctx.fillRect(bx - s * 0.3, by - s * 0.3, s * 0.6, s * 0.6);
      });
      ctx.restore();
      // contour lumineux (lueur de l'état)
      ctx.beginPath(); curve(ctx, face, true);
      ctx.lineWidth = s * (P.holo ? 0.05 : 0.035); ctx.strokeStyle = rgba(P.glow, P.holo ? 0.18 + lv * 0.2 : 0.1 + lv * 0.15); ctx.stroke();
      ctx.lineWidth = Math.max(1, s * 0.01); ctx.strokeStyle = rgba(P.holo ? P.line : mix(P.skinLo, P.glow, 0.25), P.holo ? 0.85 : 0.35); ctx.stroke();

      // ---- sourcils ----
      [-1, 1].forEach(function (sd) {
        var r = A.brow * 0.05, w = A.worry, f = A.furrow;
        var inY = -0.33 - r - w * 0.06 + f * 0.04, pkY = -0.41 - r - w * 0.0 + f * 0.01, outY = -0.36 - r * 0.6 + w * 0.03;
        if (A.wink > 0.05 && sd === 1) { inY += 0.02 * A.wink; pkY += 0.03 * A.wink; }
        ctx.beginPath(); curve(ctx, [pt(sd * 0.13, inY, 0.18), pt(sd * 0.3, pkY, 0.17), pt(sd * 0.5, outY, 0.13)], false);
        ctx.lineCap = 'round'; ctx.strokeStyle = rgba(P.brow, P.holo ? 0.9 : 0.92); ctx.lineWidth = s * 0.042; ctx.stroke();
        ctx.beginPath(); curve(ctx, [pt(sd * 0.3, pkY, 0.17), pt(sd * 0.5, outY, 0.13)], false); ctx.lineWidth = s * 0.026; ctx.stroke();
      });

      // ---- yeux ----
      [-1, 1].forEach(function (sd) {
        var ex = sd * 0.31, ey = -0.13, hw = 0.165, d = 0.16;
        var op = eyeOpen; if (sd === 1) op *= (1 - A.wink * 0.95);
        var smileSquint = Math.max(0, A.smile - 0.5) * 0.25;
        op = clamp(op - smileSquint, 0, 1.3);
        var up = 0.085 * op, lo = 0.05 * Math.max(0.25, op) - smileSquint * 0.06;
        var inC = pt(ex - sd * hw, ey + 0.01, d), outC = pt(ex + sd * hw, ey - 0.025, d);
        var top = [inC, pt(ex - sd * hw * 0.35, ey - up * 1.05, d), pt(ex + sd * hw * 0.35, ey - up * 0.95, d), outC];
        var bot = [outC, pt(ex + sd * hw * 0.4, ey + lo, d), pt(ex - sd * hw * 0.35, ey + lo * 1.05, d), inC];
        function eyePath() { ctx.beginPath(); curve(ctx, top, false); ctx.bezierCurveTo(bot[1][0], bot[1][1] + s * lo * 0.4, bot[2][0], bot[2][1] + s * lo * 0.4, inC[0], inC[1]); ctx.closePath(); }
        // ombre de paupière
        var shg = ctx.createRadialGradient(X(ex, d), Y(ey - 0.05, d), s * 0.02, X(ex, d), Y(ey - 0.05, d), s * 0.22);
        var shc = P.holo ? P.glow : mix(P.skinLo, [120, 80, 110], 0.4);
        shg.addColorStop(0, rgba(shc, P.holo ? 0.18 : 0.22)); shg.addColorStop(1, rgba(shc, 0));
        ctx.fillStyle = shg; ctx.fillRect(X(ex, d) - s * 0.25, Y(ey, d) - s * 0.3, s * 0.5, s * 0.45);
        if (op > 0.04) {
          eyePath(); ctx.save(); ctx.clip();
          ctx.fillStyle = rgba(P.sclera, P.holo ? 0.55 : 1); ctx.fillRect(X(ex - 0.2, d), Y(ey - 0.15, d), s * 0.4, s * 0.3);
          var ix = X(ex + A.gx * 0.07, d + 0.02), iy = Y(ey + A.gy * 0.04 + 0.005, d + 0.02), ir = s * 0.068;
          var ig = ctx.createRadialGradient(ix, iy, ir * 0.15, ix, iy, ir);
          ig.addColorStop(0, rgba(mix(P.iris, WHITE, 0.35), 1)); ig.addColorStop(0.7, rgba(P.iris, 1)); ig.addColorStop(1, rgba(mix(P.iris, BLACK, 0.55), 1));
          ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, 6.2832); ctx.fill();
          ctx.fillStyle = P.holo ? rgba(mix(P.glow, BLACK, 0.7), 1) : 'rgba(12,8,8,1)'; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.42 * clamp(A.pupil, 0.7, 1.5), 0, 6.2832); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ix + ir * 0.35, iy - ir * 0.38, ir * 0.2, 0, 6.2832); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(ix - ir * 0.3, iy + ir * 0.35, ir * 0.09, 0, 6.2832); ctx.fill();
          // ombre de la paupière supérieure sur l'œil
          var ug = ctx.createLinearGradient(0, Y(ey - up, d), 0, Y(ey + 0.02, d));
          ug.addColorStop(0, 'rgba(0,0,0,0.28)'); ug.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = ug; ctx.fillRect(X(ex - 0.2, d), Y(ey - 0.15, d), s * 0.4, s * 0.2);
          ctx.restore();
        }
        // trait de cils (paupière supérieure), plus épais vers l'extérieur
        ctx.beginPath(); curve(ctx, top, false);
        ctx.strokeStyle = P.holo ? rgba(P.line, 0.95) : 'rgba(28,18,18,0.95)'; ctx.lineWidth = s * (op > 0.1 ? 0.022 : 0.016); ctx.lineCap = 'round'; ctx.stroke();
        // cils extérieurs
        var oc = outC;
        for (var l = 0; l < 3; l++) {
          var bx = lerp(top[2][0], oc[0], 0.35 + l * 0.3), by = lerp(top[2][1], oc[1], 0.35 + l * 0.3);
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + sd * s * 0.03, by - s * 0.01, bx + sd * s * (0.045 + l * 0.01), by - s * (0.03 - l * 0.004) * (op > 0.1 ? 1 : -0.6));
          ctx.lineWidth = s * 0.009; ctx.stroke();
        }
        // pli de la paupière
        if (op > 0.2) { ctx.beginPath(); curve(ctx, [pt(ex - sd * hw * 0.7, ey - up - 0.025, d), pt(ex + sd * hw * 0.1, ey - up - 0.05, d), pt(ex + sd * hw * 0.85, ey - up * 0.4 - 0.045, d)], false); ctx.strokeStyle = rgba(P.holo ? P.line : P.skinLo, P.holo ? 0.35 : 0.3); ctx.lineWidth = s * 0.008; ctx.stroke(); }
        // paupière inférieure
        if (op > 0.1) { ctx.beginPath(); ctx.moveTo(outC[0], outC[1]); ctx.bezierCurveTo(bot[1][0], bot[1][1] + s * lo * 0.4, bot[2][0], bot[2][1] + s * lo * 0.4, inC[0], inC[1]); ctx.strokeStyle = rgba(P.holo ? P.line : P.skinLo, P.holo ? 0.45 : 0.35); ctx.lineWidth = s * 0.007; ctx.stroke(); }
      });

      // ---- nez ----
      var nd = 0.32;
      ctx.beginPath(); curve(ctx, [pt(0.07, -0.12, 0.22), pt(0.075, 0.08, 0.28), pt(0.085, 0.22, nd)], false);
      ctx.strokeStyle = rgba(P.holo ? P.line : P.skinLo, P.holo ? 0.3 : 0.22); ctx.lineWidth = s * 0.012; ctx.stroke();
      ctx.beginPath(); curve(ctx, [pt(-0.1, 0.27, nd * 0.8), pt(-0.06, 0.315, nd), pt(0, 0.325, nd), pt(0.06, 0.315, nd), pt(0.1, 0.27, nd * 0.8)], false);
      ctx.strokeStyle = rgba(P.holo ? P.line : P.skinLo, P.holo ? 0.6 : 0.55); ctx.lineWidth = s * 0.014; ctx.stroke();
      ctx.fillStyle = rgba(P.holo ? P.skinLo : mix(P.skinLo, BLACK, 0.3), 0.45);
      [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.ellipse(X(sd * 0.045, nd), Y(0.3, nd), s * 0.022, s * 0.011, sd * 0.4, 0, 6.2832); ctx.fill(); });
      var nh = ctx.createRadialGradient(X(0.01, nd), Y(0.22, nd), 0, X(0.01, nd), Y(0.22, nd), s * 0.06);
      nh.addColorStop(0, rgba(P.skinHi, P.holo ? 0.35 : 0.5)); nh.addColorStop(1, rgba(P.skinHi, 0));
      ctx.fillStyle = nh; ctx.fillRect(X(-0.07, nd), Y(0.15, nd), s * 0.14, s * 0.14);

      // ---- bouche ----
      var md = 0.22, my = 0.58, o = clamp(A.mouth, 0, 1.1), w = 0.215 * A.mw * (1 + Math.max(0, A.smile) * 0.12), sm = A.smile * 0.045;
      var cL = pt(-w, my - sm + o * 0.01, md * 0.8), cR = pt(w, my - sm + o * 0.01, md * 0.8);
      var upTop = [cL, pt(-w * 0.45, my - 0.06 - o * 0.01, md), pt(0, my - 0.042 - o * 0.01, md), pt(w * 0.45, my - 0.06 - o * 0.01, md), cR];
      var upIn = [cR, pt(w * 0.45, my - 0.004 - o * 0.015, md), pt(-w * 0.45, my - 0.004 - o * 0.015, md), cL];
      var loIn = [cL, pt(-w * 0.45, my + 0.004 + o * 0.12, md), pt(w * 0.45, my + 0.004 + o * 0.12, md), cR];
      var loBot = [cR, pt(w * 0.42, my + 0.075 + o * 0.13, md), pt(-w * 0.42, my + 0.075 + o * 0.13, md), cL];
      function line(p, first) { if (first) ctx.moveTo(p[0][0], p[0][1]); ctx.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]); }
      function upperOuter() { ctx.moveTo(cL[0], cL[1]); ctx.quadraticCurveTo(upTop[1][0], upTop[1][1], (upTop[1][0] + upTop[2][0]) / 2, upTop[1][1]); ctx.quadraticCurveTo(upTop[2][0], upTop[2][1] + s * 0.012, (upTop[2][0] + upTop[3][0]) / 2, upTop[3][1]); ctx.quadraticCurveTo(upTop[3][0], upTop[3][1], cR[0], cR[1]); }
      // intérieur
      if (o > 0.02) {
        ctx.beginPath(); line(upIn, true); line(loIn, false); ctx.closePath();
        ctx.fillStyle = rgba(P.mouthIn, P.holo ? 0.8 : 1); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = P.holo ? rgba(mix(P.glow, WHITE, 0.7), 0.8) : 'rgba(246,244,240,0.97)';
        ctx.beginPath(); ctx.ellipse(X(0, md), Y(my - 0.01 - o * 0.012, md), s * w * 0.78, s * 0.03, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = P.holo ? rgba(mix(P.glow, [255, 120, 160], 0.5), 0.5) : 'rgba(190,80,90,0.85)';
        ctx.beginPath(); ctx.ellipse(X(0, md), Y(my + o * 0.12, md), s * w * 0.6, s * 0.045, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      // lèvre supérieure
      ctx.beginPath(); upperOuter(); line(upIn, false); ctx.closePath();
      ctx.fillStyle = rgba(mix(P.lip, BLACK, 0.12), P.lipA); ctx.fill();
      // lèvre inférieure
      ctx.beginPath(); line(loIn, true); line(loBot, false); ctx.closePath();
      var lg2 = ctx.createLinearGradient(0, Y(my, md), 0, Y(my + 0.08 + o * 0.13, md));
      lg2.addColorStop(0, rgba(P.lip, P.lipA)); lg2.addColorStop(1, rgba(mix(P.lip, BLACK, 0.18), P.lipA));
      ctx.fillStyle = lg2; ctx.fill();
      // reflet de la lèvre inférieure
      var lh = ctx.createRadialGradient(X(0.02, md), Y(my + 0.035 + o * 0.12, md), 0, X(0.02, md), Y(my + 0.035 + o * 0.12, md), s * 0.07);
      lh.addColorStop(0, 'rgba(255,255,255,' + (P.holo ? 0.35 : 0.3) + ')'); lh.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lh; ctx.fillRect(X(-0.1, md), Y(my, md), s * 0.24, s * 0.15);
      // commissures (sourire ou moue)
      ctx.strokeStyle = rgba(P.holo ? P.line : mix(P.lip, BLACK, 0.45), 0.6); ctx.lineWidth = s * 0.01; ctx.lineCap = 'round';
      [[cL, -1], [cR, 1]].forEach(function (cc) { ctx.beginPath(); ctx.moveTo(cc[0][0], cc[0][1]); ctx.quadraticCurveTo(cc[0][0] + cc[1] * s * 0.02, cc[0][1] - s * A.smile * 0.012, cc[0][0] + cc[1] * s * 0.03, cc[0][1] - s * A.smile * 0.03); ctx.stroke(); });
      if (P.holo) { ctx.beginPath(); upperOuter(); line(loBot, false); ctx.strokeStyle = rgba(P.line, 0.55); ctx.lineWidth = s * 0.008; ctx.stroke(); }

      // ---- cheveux, devant : frange balayée et mèches ----
      var hf = P.holo ? 0.82 : 1;
      ctx.beginPath();
      curve(ctx, [pt(-0.2, -1.2, -0.05), pt(0.35, -1.18, 0), pt(0.8, -0.95, 0), pt(0.9, -0.45, 0), pt(0.82, 0.1, 0), pt(0.76 + sway * 0.5, 0.65, 0), pt(0.62 + sway * 0.5, 0.95, 0), pt(0.7, 0.4, 0), pt(0.7, -0.25, 0.02),
        pt(0.55, -0.6, 0.05), pt(0.2, -0.72, 0.08), pt(-0.15, -0.8, 0.08), pt(-0.45, -0.86, 0.05), pt(-0.7, -0.62, 0.02), pt(-0.74, -0.1, 0), pt(-0.7 + sway * 0.5, 0.45, 0), pt(-0.66 + sway * 0.5, 0.92, 0),
        pt(-0.86 + sway * 0.5, 0.5, 0), pt(-0.9, -0.3, 0), pt(-0.82, -0.85, 0)], true);
      var hg2 = ctx.createLinearGradient(X(-0.8), Y(-1.2), X(0.8), Y(0.6));
      hg2.addColorStop(0, rgba(mix(P.hair, P.hairHi, 0.55), hf)); hg2.addColorStop(0.45, rgba(P.hair, hf)); hg2.addColorStop(1, rgba(mix(P.hair, BLACK, 0.25), hf));
      ctx.fillStyle = hg2; ctx.fill();
      // reflets et mèches
      ctx.save(); ctx.clip();
      ctx.lineCap = 'round';
      for (var q = 0; q < 9; q++) {
        var k0 = q / 8, wv = reduce ? 0 : Math.sin(t * 0.8 + q) * 0.015;
        ctx.beginPath(); curve(ctx, [pt(-0.15 + k0 * 0.2, -1.15), pt(-0.5 + k0 * 1.0 + wv, -0.85 + k0 * 0.1), pt(-0.6 + k0 * 1.4 + wv, -0.6 + k0 * 0.2), pt(-0.7 + k0 * 1.55 + wv * 2, 0.2 + k0 * 0.1)], false);
        ctx.strokeStyle = rgba(P.hairHi, (P.holo ? 0.35 : 0.22) * (0.5 + 0.5 * Math.sin(q * 1.7))); ctx.lineWidth = s * (0.01 + (q % 3) * 0.005); ctx.stroke();
      }
      ctx.restore();
      if (P.holo) {
        // fines lignes de balayage de l'hologramme
        ctx.save(); ctx.globalCompositeOperation = 'source-atop';
        var off = (t * 18) % 4;
        ctx.fillStyle = rgba(P.glow, 0.07);
        for (var yy = Y(-1.4) + off; yy < Y(2.2); yy += 4) ctx.fillRect(X(-1.7), yy, s * 3.4, 1.2);
        ctx.restore();
      }
      ctx.restore();
      // fondu du bas (épaules) : aucun bord net dans le canvas
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      var fo = ctx.createLinearGradient(0, Y(1.4), 0, Math.min(H, Y(1.98)));
      fo.addColorStop(0, 'rgba(0,0,0,0)'); fo.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = fo; ctx.fillRect(0, Y(1.4), W, H);
      ctx.restore();
    }

    function active() { return st === 'listen' || spk || burst > 0.01 || lvlS > 0.01 || A.mouth > 0.01; }
    function schedule() {
      if (raf || tmo || !running || document.hidden) return;
      if (!reduce) { raf = requestAnimationFrame(frame); return; }
      tmo = setTimeout(function () { frame(performance.now()); }, active() ? 120 : 600);
    }
    function kick() { schedule(); }
    function onVis() { if (!document.hidden) { last = 0; kick(); } else { if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; } }
    document.addEventListener('visibilitychange', onVis);
    frame(performance.now());
    var api = {
      state: function (s) { if (!COLORS[s]) s = 'idle'; if (s === 'error' && st !== 'error') shakeAt = performance.now(); if (s !== st) nextGaze = 0; st = s; if (s !== 'listen') mic = 0; kick(); },
      get: function () { return st; },
      level: function (v) { v = clamp(+v || 0, 0, 1); mic = Math.pow(v, 0.75); micAt = performance.now(); kick(); },
      speak: function (on, text, rate) {
        if (on && !spk) { spkT = performance.now(); words = 0; sylls = []; quietUntil = 0; vIdx = -1; armed = true; }
        if (on && text != null) { spkText = String(text); spkRate = clamp(+rate || 1, 0.4, 3); vseq = vowels(spkText); vIdx = -1; }
        spk = on ? 1 : 0; if (on) api.state('speak'); else { sylls = []; }
        kick();
      },
      word: function (text, s, e) {
        if (text != null) spkText = String(text);
        var tx = spkText, now = performance.now();
        s = Math.max(0, +s || 0);
        if (!(e > s)) { var m = /^[^\s.,;:!?…]+/.exec(tx.slice(s)); e = s + (m ? m[0].length : 1); }
        var w = tx.slice(s, e), vs = vowels(w), n = Math.max(1, Math.min(vs.length || 1, syllables(w) || 1)), per = clamp(175 / spkRate, 90, 360);
        if (sylls.length) { var lastS = sylls[sylls.length - 1]; now = Math.max(now, lastS.at + lastS.dur * 0.8); }
        for (var k = 0; k < n; k++) sylls.push({ at: now + k * per, dur: per * 0.95, amp: k === 0 ? 1 : 0.8, v: vs[k] || 'E' });
        var after = tx.slice(e, e + 3);
        if (/^\s*[.!?…]/.test(after)) quietUntil = now + n * per + 320; else if (/^\s*[,;:]/.test(after)) quietUntil = now + n * per + 170;
        words++; kick();
      },
      pulse: function () { burst = Math.min(0.45, burst + 0.24); kick(); },
      voice: function (v) { vReal = clamp(+v || 0, 0, 1); vRealAt = performance.now(); if (!spk) api.speak(true); kick(); },
      /* humeur passagère : 'joie', 'clin', 'triste', 'surprise' */
      mood: function (n, ms) { moodN = n || ''; moodUntil = performance.now() + (ms || 2600); kick(); },
      look: function (o) { if (o) Object.keys(o).forEach(function (k) { if (o[k]) look[k] = o[k]; }); kick(); },
      metrics: function () { return { level: M.level, mouth: M.mouth, frames: M.frames, state: st, running: !!(raf || tmo) }; },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); },
      reduced: reduce, kind: 'visage'
    };
    return api;
  }
  root.MJFace = { create: create, vowels: vowels, SKINS: SKINS, HAIRS: HAIRS, EYES: EYES };
})(window);
