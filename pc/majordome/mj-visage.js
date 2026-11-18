/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-visage.js : ne pas modifier ici. */
/* =====================================================================
   Majordome : visage animé (canvas 2D, dessin original propre au projet), à la place de la sphère.
   MJFace.create(canvas, {pad, onLevel, preview, …apparence}) → même API que MJOrb :
     state(nom), get(), level(0..1), speak(on, texte, débit), word(texte, début, fin), voice(0..1),
     pulse(), mood(nom, ms), look(apparence), metrics(), stop()
   Apparence (look) : style (naturel | holo), coiffure (long, frange, ondules, carre, court, chignon, boucles),
     hair (couleur), skin (teint), eyes, lips (couleur des lèvres), makeup (0..3), freckles, mole, jewels,
     glasses (aucune | fines | rondes), cloth (couleur du haut), frame (buste | proche), expr (calme | normal | expressif).
   Animations : clignements naturels, saccades du regard, respiration, mouvements de tête avec profondeur
     (les traits proches bougent plus que le contour, les cheveux suivent avec un peu de retard) ;
     parole : ouverture de la bouche au niveau réel de la voix Piper (ou enveloppe des syllabes pour la voix du
     système), forme des lèvres selon la voyelle (a, é, i, o, ou), hochements et sourcils sur les syllabes appuyées ;
     écoute (regard vers vous, sourcils levés, tête penchée), réflexion (regard en haut, sourcils froncés),
     erreur (moue), veille (yeux fermés) ; humeurs passagères : joie, clin d'œil, tristesse, surprise.
   « Réduire les animations » : pas de mouvements de tête ni de saccades ; images seulement pendant le son.
   ===================================================================== */
(function (root) {
  'use strict';
  var COLORS = {
    idle: [70, 217, 194], listen: [96, 255, 160], think: [150, 128, 255],
    speak: [125, 200, 255], error: [255, 92, 115], sleep: [90, 110, 130]
  };
  var SKINS = { claire: [248, 220, 202], rosee: [242, 204, 186], medium: [226, 184, 150], mate: [196, 148, 110], foncee: [138, 94, 66], ebene: [96, 62, 44] };
  var HAIRS = { brun: [70, 44, 30], chatain: [122, 82, 50], blond: [222, 186, 122], platine: [236, 226, 206], roux: [170, 74, 36], auburn: [120, 46, 36], noir: [28, 24, 28], argent: [198, 202, 212], rose: [222, 128, 168], bleu: [70, 110, 190] };
  var EYES = { marron: [104, 64, 34], noisette: [142, 106, 54], vert: [68, 130, 86], bleu: [70, 126, 186], gris: [118, 132, 142], ambre: [190, 128, 40], violet: [128, 92, 168] };
  var LIPS = { rose: [214, 112, 138], corail: [230, 112, 98], rouge: [184, 28, 46], framboise: [176, 40, 92], prune: [116, 40, 68], nude: [198, 134, 122] };
  var CLOTHES = { nuit: [42, 56, 92], bordeaux: [112, 30, 50], blanc: [236, 236, 240], emeraude: [22, 108, 90], noir: [26, 26, 30], moutarde: [196, 148, 42], lavande: [150, 132, 196] };
  var STYLES_HAIR = ['long', 'frange', 'ondules', 'carre', 'court', 'chignon', 'boucles'];
  var DEFLOOK = { style: 'naturel', coiffure: 'long', hair: 'brun', skin: 'claire', eyes: 'noisette', lips: 'naturel', makeup: 1, freckles: false, mole: false, jewels: true, glasses: 'aucune', cloth: 'nuit', frame: 'buste', expr: 'normal' };
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mix(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : +clamp(a, 0, 1).toFixed(3)) + ')'; }
  function bz(a, b, c, d, u) { var v = 1 - u; return [v * v * v * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u * u * u * d[0], v * v * v * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u * u * u * d[1]]; }
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
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

  /* Courbe lisse (Catmull-Rom → Bézier) passant par des points [[x,y],…] ; move=false : continue le chemin */
  function curve(ctx, p, closed, move) {
    var n = p.length; if (n < 2) return;
    if (move !== false) ctx.moveTo(p[0][0], p[0][1]); else ctx.lineTo(p[0][0], p[0][1]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    if (closed) ctx.closePath();
  }
  function mirror(list) { var out = list.slice(); for (var i = list.length - 1; i >= 0; i--) if (list[i][0] !== 0) out.push([-list[i][0], list[i][1], list[i][2], -(list[i][3] || 0)]); return out; }

  /* ---------------- Coiffures (unités du visage : largeur ≈ 1,5, front -1, menton +1) ----------------
     Chaque point : [x, y, profondeur, part du balancement]. back : derrière la tête ; front : devant le visage. */
  var HAIR = {
    long: {
      back: mirror([[0, -1.3], [0.72, -1.17, 0, 0], [1.06, -0.62], [1.12, 0.15], [1.1, 0.95, 0, 1], [1.2, 1.55, 0, 1], [1.08, 1.8, 0, 1], [0.9, 1.62, 0, 1], [0.72, 1.76, 0, 1], [0.5, 1.45], [0, 1.15]]),
      front: [[-0.2, -1.2], [0.35, -1.18], [0.8, -0.95], [0.9, -0.45], [0.82, 0.1], [0.76, 0.65, 0, 0.5], [0.62, 0.95, 0, 0.5], [0.7, 0.4], [0.7, -0.25], [0.55, -0.6], [0.2, -0.72], [-0.15, -0.8], [-0.45, -0.86], [-0.7, -0.62], [-0.74, -0.1], [-0.7, 0.45, 0, 0.5], [-0.66, 0.92, 0, 0.5], [-0.86, 0.5, 0, 0.5], [-0.9, -0.3], [-0.82, -0.85]],
      part: [-0.22, -1.15], end: 1.72, flow: 'fall'
    },
    frange: {
      back: null, // = long
      front: [[-0.9, -0.75], [-0.55, -1.12], [0, -1.24], [0.55, -1.12], [0.9, -0.75], [0.92, -0.2], [0.84, 0.4], [0.78, 0.95, 0, 0.6], [0.66, 0.98, 0, 0.6], [0.7, 0.4], [0.72, -0.2], [0.68, -0.46],
        [0.52, -0.5], [0.4, -0.44], [0.26, -0.51], [0.13, -0.45], [0, -0.52], [-0.13, -0.45], [-0.26, -0.51], [-0.4, -0.44], [-0.52, -0.5], [-0.68, -0.46], [-0.72, -0.2], [-0.7, 0.4], [-0.66, 0.98, 0, 0.6], [-0.78, 0.95, 0, 0.6], [-0.84, 0.4], [-0.92, -0.2]],
      part: [0, -1.2], end: 1.72, flow: 'fringe'
    },
    ondules: {
      back: mirror([[0, -1.32], [0.74, -1.2], [1.08, -0.64], [1.18, -0.12], [1.1, 0.3, 0, 0.4], [1.2, 0.72, 0, 0.8], [1.13, 1.12, 0, 1], [1.26, 1.52, 0, 1], [1.16, 1.86, 0, 1], [0.95, 1.7, 0, 1], [0.8, 1.9, 0, 1], [0.55, 1.5], [0, 1.2]]),
      front: [[-0.2, -1.22], [0.35, -1.2], [0.82, -0.96], [0.92, -0.45], [0.88, 0.0], [0.93, 0.42, 0, 0.5], [0.86, 0.82, 0, 0.6], [0.9, 1.12, 0, 0.7], [0.74, 1.16, 0, 0.7], [0.74, 0.8, 0, 0.5], [0.68, 0.42], [0.72, 0.0], [0.7, -0.28], [0.55, -0.6], [0.2, -0.72], [-0.15, -0.8], [-0.45, -0.86], [-0.7, -0.62], [-0.74, -0.12], [-0.68, 0.36], [-0.74, 0.76, 0, 0.5], [-0.72, 1.1, 0, 0.7], [-0.88, 1.08, 0, 0.7], [-0.84, 0.76, 0, 0.6], [-0.92, 0.36, 0, 0.5], [-0.9, -0.3], [-0.84, -0.86]],
      part: [-0.22, -1.17], end: 1.8, flow: 'wave'
    },
    carre: {
      back: mirror([[0, -1.28], [0.72, -1.15], [1.02, -0.6], [1.06, 0.1], [1.0, 0.6, 0, 0.4], [0.9, 0.86, 0, 0.5], [0.72, 0.82], [0.52, 0.62], [0, 0.55]]),
      front: [[-0.2, -1.2], [0.35, -1.18], [0.8, -0.95], [0.92, -0.45], [0.88, 0.1], [0.9, 0.56, 0, 0.3], [0.84, 0.84, 0, 0.4], [0.68, 0.8, 0, 0.3], [0.7, 0.4], [0.71, -0.25], [0.55, -0.6], [0.2, -0.72], [-0.15, -0.8], [-0.45, -0.86], [-0.7, -0.62], [-0.74, -0.1], [-0.72, 0.4], [-0.7, 0.8, 0, 0.3], [-0.86, 0.84, 0, 0.4], [-0.92, 0.56, 0, 0.3], [-0.9, -0.3], [-0.82, -0.85]],
      part: [-0.22, -1.15], end: 0.85, flow: 'fall'
    },
    court: {
      back: mirror([[0, -1.24], [0.62, -1.14], [0.9, -0.75], [0.88, -0.3], [0.8, 0.0], [0.7, 0.28], [0.5, 0.42], [0, 0.4]]),
      front: [[-0.86, -0.3], [-0.84, -0.7], [-0.6, -1.08], [-0.2, -1.24], [0.3, -1.22], [0.72, -1.02], [0.9, -0.62], [0.86, -0.3], [0.78, -0.08], [0.73, -0.32], [0.64, -0.46], [0.52, -0.5], [0.38, -0.6], [0.2, -0.62], [0.02, -0.7], [-0.18, -0.74], [-0.38, -0.8], [-0.58, -0.72], [-0.72, -0.42], [-0.77, -0.1]],
      part: [-0.35, -1.15], end: -0.5, flow: 'sweep', ears: true
    },
    chignon: {
      back: mirror([[0, -1.2], [0.66, -1.08], [0.9, -0.7], [0.86, -0.25], [0.76, 0.05], [0.6, 0.3], [0, 0.3]]),
      front: [[-0.76, -0.2], [-0.84, -0.62], [-0.6, -1.04], [0, -1.2], [0.6, -1.04], [0.84, -0.62], [0.76, -0.2], [0.7, -0.4], [0.56, -0.68], [0.3, -0.81], [0, -0.85], [-0.3, -0.81], [-0.56, -0.68], [-0.7, -0.4]],
      bun: [0, -1.36, 0.34], part: [0, -1.3], end: 0, flow: 'up', ears: true, wisps: true
    },
    boucles: {
      back: mirror([[0, -1.42], [0.85, -1.26], [1.25, -0.62], [1.32, 0.2], [1.28, 0.9, 0, 0.6], [1.1, 1.32, 0, 0.8], [0.6, 1.12], [0, 0.9]]),
      front: [[-0.78, -0.2], [-0.86, -0.64], [-0.62, -1.06], [0, -1.24], [0.62, -1.06], [0.86, -0.64], [0.78, -0.2], [0.72, -0.4], [0.58, -0.66], [0.3, -0.78], [0, -0.82], [-0.3, -0.78], [-0.58, -0.66], [-0.72, -0.4]],
      part: [0, -1.2], end: 1.2, flow: 'curls'
    }
  };
  HAIR.frange.back = HAIR.long.back;

  function create(cv, opt) {
    opt = opt || {};
    var ctx = cv.getContext('2d'), dpr = Math.min(2, root.devicePixelRatio || 1);
    var reduce = false;
    try { reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    var small = Math.min(root.innerWidth || 800, root.innerHeight || 800) < 600 || /Android|Mobile/i.test(navigator.userAgent || '');
    var PAD = opt.pad || 1;
    var look = {}; Object.keys(DEFLOOK).forEach(function (k) { look[k] = opt[k] != null ? opt[k] : DEFLOOK[k]; });
    var st = 'idle', col = COLORS.idle.slice(), t0 = performance.now(), raf = 0, tmo = 0, running = true, W = 0, H = 0, last = 0;
    var mic = 0, micAt = 0, env = 0, envSlow = 0;
    var spk = 0, spkT = 0, spkText = '', spkRate = 1, words = 0, sylls = [], quietUntil = 0, sEnv = 0, burst = 0, vReal = 0, vRealAt = -1e9;
    var lvlS = 0, M = { level: 0, frames: 0, mouth: 0 };
    var vseq = [], vIdx = -1, vCur = 'A', armed = true;
    var A = { yaw: 0, pitch: 0, roll: 0, gx: 0, gy: 0, open: 1, brow: 0, worry: 0, furrow: 0, smile: 0.3, mouth: 0, mw: 1, pupil: 1, blush: 0.3, wink: 0, hairLag: 0 };
    var blinkAt = 0, blinkDur = 150, nextBlink = performance.now() + 1500, gazeT = { x: 0, y: 0 }, nextGaze = 0, shakeAt = -1e9, nodK = 0;
    var moodN = '', moodUntil = 0;
    // détails fixes (graine) : taches de rousseur, boucles
    var R0 = rng(7), FRECK = [], CURLS = [], CURLF = [];
    for (var i = 0; i < 46; i++) { var fx = (R0() - 0.5) * 1.0, fy = 0.02 + R0() * 0.3 - Math.abs(fx) * 0.12; if (Math.abs(fx) < 0.06 && fy > 0.2) continue; FRECK.push([fx, fy, 0.005 + R0() * 0.008, 0.25 + R0() * 0.3]); }
    for (i = 0; i < 150; i++) { var a = -Math.PI * R0(), rr = 0.95 + R0() * 0.4; CURLS.push([Math.cos(a) * rr * 1.08, -0.22 + Math.sin(a) * rr * 1.02, 0.08 + R0() * 0.05, R0()]); }
    for (i = 0; i < 90; i++) { var sd = i % 2 ? 1 : -1, yy = -0.3 + R0() * 1.55; CURLS.push([sd * (0.88 + R0() * 0.42 - Math.max(0, yy - 0.9) * 0.5), yy, 0.08 + R0() * 0.05, R0()]); }
    for (i = 0; i < 24; i++) { var u = i / 23, ang = Math.PI * (1.06 + u * 0.88); CURLF.push([Math.cos(ang) * 0.78, -0.3 + Math.sin(ang) * 0.56 + (R0() - 0.5) * 0.05, 0.065 + R0() * 0.035, R0()]); }
    for (i = 0; i < 10; i++) { var sd2 = i % 2 ? 1 : -1; CURLF.push([sd2 * (0.8 + R0() * 0.06), -0.15 + Math.floor(i / 2) * 0.2, 0.07 + R0() * 0.03, R0()]); }
    function size() {
      var b = cv.getBoundingClientRect(); W = Math.max(10, b.width); H = Math.max(10, b.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    }
    size();
    var ro = root.ResizeObserver ? new ResizeObserver(function () { size(); if (running) frame(performance.now()); }) : null;
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
      var c = col, mk = clamp(+look.makeup || 0, 0, 3);
      if (look.style === 'androide') {
        // androïde en hologramme (personnage original) : peau lisse « porcelaine » teintée par l'état, plaques sculptées
        return {
          holo: true, andro: true, skin: mix(c, [190, 205, 222], 0.55), skinA: 0.96, skinHi: mix(c, WHITE, 0.55), skinLo: mix(c, [6, 12, 22], 0.7), hair: mix(c, [20, 30, 46], 0.55), hairHi: mix(c, WHITE, 0.45), hairLo: [6, 10, 18], hairA: 0.85,
          lip: mix(c, [235, 225, 240], 0.35), lipA: 0.7, iris: mix(c, WHITE, 0.25), sclera: [8, 14, 24], scleraA: 0.92, line: mix(c, WHITE, 0.45), brow: mix(c, WHITE, 0.5), lash: mix(c, WHITE, 0.4),
          mouthIn: mix(c, [4, 8, 16], 0.6), glow: c, cloth: mix(c, [14, 22, 34], 0.62), metal: mix(c, WHITE, 0.6), blush: mix(c, WHITE, 0.3), shadow: c, mk: 0
        };
      }
      if (look.style === 'holo') {
        return {
          holo: true, skin: mix(c, [8, 16, 28], 0.72), skinA: 0.8, skinHi: mix(c, WHITE, 0.35), skinLo: [4, 8, 16], hair: mix(c, [6, 10, 20], 0.62), hairHi: mix(c, WHITE, 0.25), hairLo: [4, 8, 14], hairA: 0.82,
          lip: mix(c, [255, 130, 170], 0.45), lipA: 0.8, iris: mix(c, WHITE, 0.1), sclera: mix(c, WHITE, 0.82), scleraA: 0.6, line: mix(c, WHITE, 0.25), brow: mix(c, [10, 20, 30], 0.3), lash: mix(c, WHITE, 0.3),
          mouthIn: [6, 10, 18], glow: c, cloth: mix(c, [10, 20, 30], 0.6), metal: mix(c, WHITE, 0.5), blush: mix(c, [255, 120, 170], 0.5), shadow: c, mk: mk
        };
      }
      var sk = SKINS[look.skin] || SKINS.claire, hr = HAIRS[look.hair] || HAIRS.brun, ir = EYES[look.eyes] || EYES.noisette, dark = look.skin === 'foncee' || look.skin === 'ebene';
      var lipNat = mix(mix(sk, [196, 84, 96], 0.6), BLACK, dark ? 0.22 : 0), lip = LIPS[look.lips] ? mix(lipNat, LIPS[look.lips], 0.45 + mk * 0.15) : lipNat;
      var light = (hr[0] + hr[1] + hr[2]) / 3 > 150;
      return {
        holo: false, skin: sk, skinA: 1, skinHi: mix(sk, WHITE, 0.4), skinLo: mix(sk, dark ? [30, 12, 10] : [120, 50, 50], dark ? 0.5 : 0.42), hair: hr, hairHi: mix(hr, WHITE, light ? 0.45 : 0.28), hairLo: mix(hr, BLACK, light ? 0.35 : 0.5), hairA: 1,
        lip: lip, lipA: 1, iris: ir, sclera: [252, 249, 246], scleraA: 1, line: mix(sk, [40, 20, 20], 0.72), brow: mix(hr, [40, 26, 20], light ? 0.45 : 0.2), lash: [26, 16, 16],
        mouthIn: [74, 24, 32], glow: c, cloth: CLOTHES[look.cloth] || CLOTHES.nuit, metal: [222, 186, 110], blush: dark ? [190, 70, 80] : [238, 112, 122], shadow: mix(sk, [110, 70, 110], 0.5), mk: mk
      };
    }
    function exprK() { return look.expr === 'calme' ? 0.55 : look.expr === 'expressif' ? 1.45 : 1; }

    function frame(now) {
      raf = 0; tmo = 0;
      if (opt.preview && !cv.isConnected) { api.stop(); return; }
      var t = (now - t0) / 1000, dt = last ? clamp((now - last) / 1000, 0.001, 0.1) : 0.016; last = now;
      if (now - micAt > 260) mic *= Math.pow(0.02, dt);
      var aA = 1 - Math.exp(-dt / 0.035), aR = 1 - Math.exp(-dt / 0.22);
      env += (mic - env) * (mic > env ? aA : aR);
      envSlow += (env - envSlow) * (1 - Math.exp(-dt / 0.5));
      var vt = voiceTarget(now);
      sEnv += (vt - sEnv) * (vt > sEnv ? 1 - Math.exp(-dt / 0.03) : 1 - Math.exp(-dt / 0.07));
      burst *= Math.pow(0.02, dt);
      lvlS = clamp((st === 'listen' ? env : spk ? sEnv : 0) + burst, 0, 1.2);
      if (spk && now - vRealAt < 160) {
        if (armed && sEnv > 0.3) { armed = false; vIdx++; if (vseq.length) vCur = vseq[Math.min(vIdx, vseq.length - 1)]; nodK = Math.min(1, nodK + 0.5 * sEnv); }
        else if (!armed && sEnv < 0.16) armed = true;
      } else if (spk && sEnv > 0.5 && armed) { armed = false; nodK = Math.min(1, nodK + 0.3); } else if (sEnv < 0.2) armed = true;
      nodK *= Math.pow(0.05, dt);
      var c = COLORS[st] || COLORS.idle;
      for (var k = 0; k < 3; k++) col[k] = lerp(col[k], c[k], 1 - Math.exp(-dt / 0.25));
      var mood = now < moodUntil ? moodN : '', ek = exprK();

      var T = { yaw: 0, pitch: 0, roll: 0, open: 1, brow: 0, worry: 0, furrow: 0, smile: 0.32, pupil: 1, blush: 0.3 };
      var mv = reduce ? 0 : ek;
      if (st === 'idle') { T.yaw = mv * (0.07 * Math.sin(t * 0.31) + 0.03 * Math.sin(t * 0.83)); T.pitch = mv * 0.03 * Math.sin(t * 0.47); T.roll = mv * 0.025 * Math.sin(t * 0.23); }
      else if (st === 'listen') { T.roll = mv * 0.07; T.pitch = mv * -0.02; T.yaw = mv * 0.02 * Math.sin(t * 0.6); T.open = 1.1; T.brow = (0.5 + env * 0.4) * ek; T.smile = 0.42; T.pupil = 1.15 + env * 0.25; }
      else if (st === 'think') { T.yaw = mv * (0.12 + 0.03 * Math.sin(t * 0.9)); T.roll = mv * -0.05; T.pitch = mv * -0.05; T.furrow = 0.7 * ek; T.smile = 0.05; T.open = 0.92; }
      else if (st === 'speak') { T.yaw = mv * (0.05 * Math.sin(t * 0.7) + 0.02 * Math.sin(t * 1.9)); T.pitch = mv * (0.02 * Math.sin(t * 1.3) + nodK * 0.05); T.roll = mv * 0.03 * Math.sin(t * 0.5); T.brow = (0.15 + nodK * 0.5) * ek; T.smile = 0.3; }
      else if (st === 'error') { var ea = (now - shakeAt) / 1000; T.yaw = mv * (ea < 0.9 ? 0.09 * Math.sin(ea * 22) * (1 - ea / 0.9) : 0); T.worry = 0.9; T.smile = -0.45; T.pitch = mv * 0.04; T.blush = 0.15; }
      else if (st === 'sleep') { T.pitch = (reduce ? 0 : 1) * 0.1; T.roll = (reduce ? 0 : 1) * 0.07; T.open = 0; T.smile = 0.2; }
      if (mood === 'joie') { T.smile = 1; T.brow = Math.max(T.brow, 0.45); T.blush = 0.65; T.open = Math.min(T.open, 0.85); }
      else if (mood === 'clin') { T.smile = 0.85; T.blush = 0.6; }
      else if (mood === 'triste') { T.smile = -0.5; T.worry = 1; T.pitch += mv * 0.05; T.blush = 0.15; }
      else if (mood === 'surprise') { T.brow = 1; T.open = 1.2; T.smile = 0.1; }
      if (now > nextGaze) {
        var gr = Math.min(1.3, ek);
        if (st === 'think') { gazeT = { x: 0.55 + Math.random() * 0.35, y: -0.65 - Math.random() * 0.25 }; nextGaze = now + 900 + Math.random() * 1400; }
        else if (st === 'listen') { gazeT = { x: (Math.random() - 0.5) * 0.12, y: (Math.random() - 0.5) * 0.08 }; nextGaze = now + 700 + Math.random() * 900; }
        else if (st === 'speak') { gazeT = Math.random() < 0.7 ? { x: (Math.random() - 0.5) * 0.15, y: 0 } : { x: (Math.random() - 0.5) * 0.9 * gr, y: (Math.random() - 0.6) * 0.5 * gr }; nextGaze = now + 900 + Math.random() * 1800; }
        else if (st === 'error' || mood === 'triste') { gazeT = { x: -0.2, y: 0.55 }; nextGaze = now + 1500; }
        else if (st === 'sleep') { gazeT = { x: 0, y: 0.4 }; nextGaze = now + 3000; }
        else { gazeT = Math.random() < 0.55 ? { x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.1 } : { x: (Math.random() - 0.5) * 1.2 * gr, y: (Math.random() - 0.5) * 0.65 * gr }; nextGaze = now + 1300 + Math.random() * 2800; }
        if (reduce) gazeT = { x: 0, y: 0 };
      }
      var gk = 1 - Math.exp(-dt / 0.045);
      A.gx += (gazeT.x - A.gx) * gk; A.gy += (gazeT.y - A.gy) * gk;
      if (now > nextBlink && st !== 'sleep') {
        blinkAt = now; blinkDur = 130 + Math.random() * 60;
        nextBlink = now + (Math.random() < 0.15 ? 260 : (st === 'think' ? 1800 : 2400) + Math.random() * 3800);
      }
      var bp = (now - blinkAt) / blinkDur, blink = bp >= 0 && bp < 1 ? Math.sin(Math.PI * bp) : 0;
      var sk = 1 - Math.exp(-dt / 0.35), fk = 1 - Math.exp(-dt / 0.12);
      A.yaw += (T.yaw - A.yaw) * (st === 'error' ? 1 - Math.exp(-dt / 0.04) : sk); A.pitch += (T.pitch - A.pitch) * (1 - Math.exp(-dt / 0.15)); A.roll += (T.roll - A.roll) * sk;
      A.hairLag += (A.yaw - A.hairLag) * (1 - Math.exp(-dt / 0.45));
      A.open += (T.open - A.open) * fk; A.brow += (T.brow - A.brow) * fk; A.worry += (T.worry - A.worry) * fk; A.furrow += (T.furrow - A.furrow) * fk;
      A.smile += (T.smile - A.smile) * (1 - Math.exp(-dt / 0.2)); A.pupil += (T.pupil - A.pupil) * fk; A.blush += (T.blush - A.blush) * sk;
      A.wink += ((mood === 'clin' ? 1 : 0) - A.wink) * (1 - Math.exp(-dt / 0.06));
      var shp = SHAPES[vCur] || SHAPES.A, mo = spk ? clamp(sEnv * 1.25, 0, 1) * shp.o : (st === 'listen' ? 0.04 + env * 0.05 : 0);
      if (mood === 'joie' && !spk) mo = Math.max(mo, 0.2);
      if (mood === 'surprise' && !spk) mo = 0.4;
      A.mouth += (mo - A.mouth) * (1 - Math.exp(-dt / (mo > A.mouth ? 0.025 : 0.06)));
      var mwT = spk && sEnv > 0.08 ? shp.w : (mood === 'surprise' ? 0.7 : 1);
      A.mw += (mwT - A.mw) * (1 - Math.exp(-dt / 0.06));
      var eyeOpen = clamp(A.open * (1 - blink), 0, 1.3);
      var breathe = reduce ? 0 : (st === 'sleep' ? 0.012 : 0.006) * Math.sin(t * (st === 'sleep' ? 0.9 : 1.6));
      draw(t, eyeOpen, breathe, palette());
      M.level = lvlS; M.mouth = A.mouth; M.frames++;
      if (opt.onLevel) try { opt.onLevel(lvlS * (reduce ? 0.35 : 1)); } catch (e) { }
      schedule();
    }

    function draw(t, eyeOpen, breathe, P) {
      var close = look.frame === 'proche', CORPS = look.frame === 'corps' && P.andro;
      var box = Math.min(W, H) / PAD, s = box * (close ? 0.42 : 0.33), cx = W / 2, cy = H / 2 - box * (close ? 0.02 : 0.08);
      if (CORPS) { var hb = H / PAD; s = Math.min(hb / 18.6, (W / PAD) / 4.6); cx = W / 2; cy = (H - hb) / 2 + 1.55 * s; }   // silhouette entière : la hauteur commande
      var yaw = A.yaw, pitch = A.pitch, HS = HAIR[look.coiffure] || HAIR.long;
      function X(x, d) { return cx + (x * (1 - Math.abs(yaw) * 0.12) + yaw * (d || 0) * 1.1) * s; }
      function Y(y, d) { return cy + (y * (1 + breathe) + pitch * (d || 0) * 0.9 + pitch * 0.15) * s; }
      function pt(x, y, d) { return [X(x, d), Y(y, d)]; }
      function ell(x, y, rx, ry, c, a, d) { var px = X(x, d), py = Y(y, d), g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry) * s); g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); ctx.save(); ctx.translate(px, py); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); ctx.translate(-px, -py); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, Math.max(rx, ry) * s, 0, 6.2832); ctx.fill(); ctx.restore(); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var g0 = P.glow, lv = lvlS;
      var a0 = st === 'sleep' ? 0.06 : 0.14 + lv * 0.25;
      var hg = ctx.createRadialGradient(cx, cy, s * 0.4, cx, cy, Math.min(Math.min(W, H) / 2, s * 2.3));
      hg.addColorStop(0, rgba(g0, a0)); hg.addColorStop(0.6, rgba(g0, a0 * 0.35)); hg.addColorStop(1, rgba(g0, 0));
      ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
      ctx.save();
      var pvx = cx, pvy = cy + s * 1.0;
      ctx.translate(pvx, pvy); ctx.rotate(A.roll); ctx.translate(-pvx, -pvy);
      var sway = reduce ? 0 : Math.sin(t * 0.9) * 0.02 + (A.hairLag - yaw) * 0.6 - yaw * 0.1;
      function hp(list, d) { return list.map(function (q) { return pt(q[0] + (q[3] || 0) * sway, q[1], q[2] != null ? q[2] : d); }); }

      /* ---------- cheveux : remplissage, mèches, reflet ---------- */
      function hairFill(path, y0, y1) {
        var g = ctx.createLinearGradient(0, Y(y0), 0, Y(y1));
        g.addColorStop(0, rgba(mix(P.hair, P.hairHi, 0.3), P.hairA)); g.addColorStop(0.45, rgba(P.hair, P.hairA)); g.addColorStop(1, rgba(mix(P.hair, P.hairLo, 0.55), P.holo ? 0 : P.hairA));
        ctx.beginPath(); path(); ctx.fillStyle = g; ctx.fill();
      }
      function strand(p0, p1, p2, p3, c, a, w) { ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]); ctx.strokeStyle = rgba(c, a); ctx.lineWidth = w; ctx.stroke(); }
      function strands(kind, d, front) {
        var n = small ? 16 : 28, part = HS.part, end = HS.end, k, u, xs, wv;
        ctx.lineCap = 'round';
        for (k = 0; k < n; k++) {
          u = k / (n - 1); var c = k % 3 === 0 ? P.hairHi : k % 3 === 1 ? P.hairLo : mix(P.hair, P.hairHi, 0.5), a = (P.holo ? 0.3 : 0.22) * (0.6 + 0.4 * Math.sin(k * 2.3)), w = s * (0.006 + (k % 4) * 0.003);
          if (kind === 'fall' || kind === 'wave' || kind === 'fringe') {
            xs = lerp(-1.12, 1.12, u); wv = kind === 'wave' ? 0.08 : 0.02;
            var e = Math.min(end, front ? 1.0 : end);
            strand(pt(part[0] + (xs - part[0]) * 0.08, part[1] + 0.02, d), pt(xs * 0.85 + sway * 0.2, -1.1, d), pt(xs * 1.08 + Math.sin(k + t * 0.6) * wv, kind === 'wave' ? 0.2 : -0.3, d), pt(xs * 1.02 + sway * u + Math.sin(k * 1.7) * wv, e - Math.abs(xs) * 0.1, d), c, a, w);
            if (kind === 'fringe' && front && Math.abs(xs) < 0.75) strand(pt(xs * 0.5, -1.18, d), pt(xs * 0.75, -1.0, d), pt(xs * 0.95, -0.7, d), pt(xs, -0.48, d), c, a * 1.2, w);
          } else if (kind === 'sweep') {
            xs = lerp(-0.75, 0.8, u);
            strand(pt(part[0], part[1], d), pt(part[0] + 0.3 + u * 0.5, -1.2, d), pt(xs + 0.15, -0.9, d), pt(xs, -0.62 + Math.abs(xs - 0.1) * 0.12 + (xs > 0.6 ? 0.4 : 0), d), c, a * 1.2, w);
          } else if (kind === 'up') {
            var an = Math.PI * (1.05 + u * 0.9), hx = Math.cos(an) * 0.76, hy = -0.32 + Math.sin(an) * 0.55;
            strand(pt(hx, hy, d), pt(hx * 0.9, hy - 0.2, d), pt(hx * 0.3, -1.15, d), pt(0, -1.26, d), c, a * 1.2, w);
          }
        }
        // reflet (bande brillante autour du sommet)
        if (kind !== 'curls') {
          [[0.2, 0.06], [0.12, 0.09], [0.06, 0.12]].forEach(function (b) {
            ctx.beginPath(); ctx.ellipse(X(0.04, d), Y(-0.52, d), s * 0.86, s * 0.62, 0, Math.PI * 1.12, Math.PI * 1.9);
            ctx.strokeStyle = rgba(P.hairHi, b[1] * (P.holo ? 1.1 : 0.9)); ctx.lineWidth = s * b[0]; ctx.stroke();
          });
        }
      }
      function curl(c, d, dark) {
        var x = X(c[0] + sway * clamp(c[1], 0, 1) * 0.6, d), y = Y(c[1], d), r = c[2] * s;
        var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        g.addColorStop(0, rgba(mix(P.hair, P.hairHi, dark ? 0.12 : 0.3), P.hairA)); g.addColorStop(0.75, rgba(P.hair, P.hairA)); g.addColorStop(1, rgba(mix(P.hair, P.hairLo, 0.45), P.hairA * 0.9));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y, r * 0.62, Math.PI * (0.9 + c[3] * 0.6), Math.PI * (2.1 + c[3] * 0.6));
        ctx.strokeStyle = rgba(P.hairHi, dark ? 0.16 : 0.26); ctx.lineWidth = r * 0.12; ctx.stroke();
        ctx.beginPath(); ctx.arc(x + r * 0.1, y + r * 0.08, r * 0.3, Math.PI * (1.4 + c[3]), Math.PI * (2.6 + c[3]));
        ctx.strokeStyle = rgba(P.hairLo, 0.3); ctx.lineWidth = r * 0.1; ctx.stroke();
      }
      function hairBack() {
        if (HS.bun) {
          var b = HS.bun, bx = X(b[0], -0.3), by = Y(b[1], -0.3), br = b[2] * s;
          var g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, br * 0.1, bx, by, br);
          g.addColorStop(0, rgba(mix(P.hair, P.hairHi, 0.45), P.hairA)); g.addColorStop(1, rgba(mix(P.hair, P.hairLo, 0.5), P.hairA));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fill();
          ctx.lineCap = 'round';
          for (var q = 0; q < 6; q++) { ctx.beginPath(); ctx.arc(bx, by, br * (0.25 + q * 0.12), q * 1.1, q * 1.1 + 2.6); ctx.strokeStyle = rgba(q % 2 ? P.hairHi : P.hairLo, 0.35); ctx.lineWidth = s * 0.012; ctx.stroke(); }
        }
        var bp = hp(HS.back, -0.3);
        hairFill(function () { curve(ctx, bp, true); }, -1.4, Math.max(0.6, HS.end + 0.1));
        ctx.save(); ctx.beginPath(); curve(ctx, bp, true); ctx.clip();
        if (HS.flow === 'curls') { for (var k = 0; k < CURLS.length; k++) curl(CURLS[k], -0.3, true); }
        else strands(HS.flow, -0.3, false);
        ctx.restore();
      }
      function hairFront() {
        var fp = hp(HS.front, 0.02);
        hairFill(function () { curve(ctx, fp, true); }, -1.4, Math.max(0.6, HS.end + 0.1));
        ctx.save(); ctx.beginPath(); curve(ctx, fp, true); ctx.clip();
        if (HS.flow === 'curls') { for (var k = 0; k < CURLS.length; k += 3) curl([CURLS[k][0] * 0.7, CURLS[k][1] * 0.75 - 0.2, CURLS[k][2] * 0.8, CURLS[k][3]], 0.02, false); }
        else strands(HS.flow, 0.02, true);
        ctx.restore();
        if (HS.flow === 'curls') for (var j = 0; j < CURLF.length; j++) curl(CURLF[j], 0.04, false);
        if (HS.wisps) {
          ctx.lineCap = 'round';
          [-1, 1].forEach(function (sd) {
            for (var w = 0; w < 3; w++) {
              var x0 = sd * (0.64 + w * 0.03), y1 = 0.2 - w * 0.12, q1 = pt(x0 - sd * 0.03, -0.38, 0.03), q2 = pt(x0 + sd * 0.05 + sway, -0.08, 0.03), q3 = pt(x0 + sd * 0.1 + sway * 1.4, y1, 0.03);
              strand(pt(x0, -0.66, 0.02), q1, q2, q3, P.hair, 0.75, s * (0.009 - w * 0.002));
              strand(pt(x0, -0.66, 0.02), q1, q2, q3, P.hairHi, 0.25, s * 0.003);
            }
          });
        }
      }


      /* ---------- androïde : coque sculptée, plaques, modules d'oreille, anneau lumineux ---------- */
      function glowLine(pts, a, w) { ctx.beginPath(); curve(ctx, pts, false); ctx.lineCap = 'round'; ctx.strokeStyle = rgba(P.glow, a * 0.35); ctx.lineWidth = s * w * 3.2; ctx.stroke(); ctx.strokeStyle = rgba(P.line, a); ctx.lineWidth = s * w; ctx.stroke(); }
      function node(x, y, r, a, d) { var px = X(x, d), py = Y(y, d), g = ctx.createRadialGradient(px, py, 0, px, py, s * r * 3); g.addColorStop(0, rgba(WHITE, a)); g.addColorStop(0.25, rgba(P.glow, a * 0.8)); g.addColorStop(1, rgba(P.glow, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, s * r * 3, 0, 6.2832); ctx.fill(); }
      function plate(list, d, a) {
        var pp = list.map(function (q) { return pt(q[0] + (q[2] || 0) * sway, q[1], d); });
        ctx.beginPath(); curve(ctx, pp, true);
        var g = ctx.createLinearGradient(0, Y(-1.3), 0, Y(0.9));
        g.addColorStop(0, rgba(mix(P.hair, P.hairHi, 0.45), P.hairA * a)); g.addColorStop(0.6, rgba(P.hair, P.hairA * a)); g.addColorStop(1, rgba(P.hairLo, P.hairA * a * 0.6));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = rgba(P.line, 0.55); ctx.lineWidth = s * 0.008; ctx.stroke();
      }
      function androBack() {
        // crâne lisse et plaques balayées vers l'arrière (volume d'une coiffure, en éléments rigides)
        plate([[0, -1.24], [0.62, -1.12], [0.92, -0.7], [0.98, -0.1], [0.9, 0.42, 0.4], [0.7, 0.62, 0.4], [0.5, 0.3], [0, 0.2], [-0.5, 0.3], [-0.7, 0.62, 0.4], [-0.9, 0.42, 0.4], [-0.98, -0.1], [-0.92, -0.7], [-0.62, -1.12]], -0.3, 1);
        [-1, 1].forEach(function (sd) {
          plate([[sd * 0.55, -1.08], [sd * 1.0, -0.78], [sd * 1.12, -0.25], [sd * 1.08, 0.38, 0.6], [sd * 0.98, 0.7, 0.8], [sd * 0.92, 0.3], [sd * 0.88, -0.3], [sd * 0.7, -0.82]], -0.32, 0.95);
          plate([[sd * 0.72, -0.62], [sd * 1.16, -0.1], [sd * 1.2, 0.5, 0.7], [sd * 1.08, 0.95, 1], [sd * 1.0, 0.6, 0.8], [sd * 0.96, 0.1]], -0.34, 0.85);
        });
      }
      function androFront() {
        // calotte avant : bord net au-dessus du front, rainures
        var cap = [[-0.74, -0.32], [-0.82, -0.7], [-0.58, -1.06], [0, -1.2], [0.58, -1.06], [0.82, -0.7], [0.74, -0.32], [0.68, -0.52], [0.5, -0.74], [0.24, -0.84], [0, -0.87], [-0.24, -0.84], [-0.5, -0.74], [-0.68, -0.52]];
        plate(cap, 0.02, 1);
        glowLine([pt(-0.66, -0.56, 0.02), pt(-0.4, -0.86, 0.02), pt(0, -0.98, 0.02), pt(0.4, -0.86, 0.02), pt(0.66, -0.56, 0.02)], 0.55, 0.006);
        glowLine([pt(0, -1.18, 0.02), pt(0, -0.88, 0.02)], 0.45, 0.005);
        // modules d'oreille : anneaux concentriques qui s'allument avec la voix
        [-1, 1].forEach(function (sd) {
          var ex = X(sd * 0.78, -0.02), ey = Y(-0.02, -0.02);
          ctx.fillStyle = rgba(mix(P.hair, P.hairHi, 0.3), 0.95); ctx.beginPath(); ctx.ellipse(ex, ey, s * 0.085, s * 0.13, 0, 0, 6.2832); ctx.fill();
          for (var r = 0; r < 3; r++) { ctx.beginPath(); ctx.ellipse(ex, ey, s * (0.07 - r * 0.02), s * (0.11 - r * 0.03), 0, 0, 6.2832); ctx.strokeStyle = rgba(P.line, 0.35 + r * 0.15 + lvlS * 0.3); ctx.lineWidth = s * 0.006; ctx.stroke(); }
          node(sd * 0.78, -0.02, 0.012, 0.6 + lvlS * 0.4, -0.02);
        });
        // anneau lumineux au-dessus de la tête (tourne lentement, s'intensifie avec le son)
        var rx = s * 0.62, ry = s * 0.12, hx = X(0, -0.1), hy = Y(-1.42, -0.1), rot = t * 0.6;
        ctx.save(); ctx.lineCap = 'round';
        for (var k = 0; k < 24; k++) {
          var a0 = rot + k / 24 * 6.2832, a1 = a0 + 0.17, front = Math.sin(a0 + 0.08) > 0;
          ctx.beginPath(); ctx.ellipse(hx, hy, rx, ry, 0, a0, a1);
          ctx.strokeStyle = rgba(front ? P.line : P.glow, (front ? 0.75 : 0.25) * (0.6 + lvlS * 0.6)); ctx.lineWidth = s * (front ? 0.014 : 0.008); ctx.stroke();
        }
        ctx.restore();
      }
      function androFace() {
        // jointures du visage (fines lignes lumineuses) et points de lumière
        [-1, 1].forEach(function (sd) {
          glowLine([pt(sd * 0.5, -0.86, 0.05), pt(sd * 0.64, -0.5, 0.05), pt(sd * 0.68, -0.05, 0.05), pt(sd * 0.6, 0.38, 0.05), pt(sd * 0.42, 0.66, 0.05)], 0.4, 0.005);
          glowLine([pt(sd * 0.2, 0.06, 0.14), pt(sd * 0.32, 0.1, 0.14), pt(sd * 0.46, 0.08, 0.14)], 0.3, 0.004);
          node(sd * 0.68, -0.05, 0.008, 0.5 + lvlS * 0.5, 0.05);
          node(sd * 0.42, 0.66, 0.006, 0.4 + lvlS * 0.4, 0.05);
        });
        glowLine([pt(0, 0.8, 0.12), pt(0, 0.95, 0.12)], 0.35, 0.004);
        node(0, -0.72, 0.008, 0.45 + lvlS * 0.5, 0.1);
      }

      /* ---------- androïde : silhouette entière (personnage original, élégant, sans détail anatomique) ---------- */
      function BX(x) { return cx + x * s; }
      function BY(y) { return cy + y * s; }
      function bp(x, y) { return [BX(x), BY(y)]; }
      function limb(c, w) {   // contour lisse autour d'une ligne médiane (largeurs aux points)
        var L = [], R = [], n = c.length;
        for (var i = 0; i < n; i++) {
          var a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
          L.push(bp(c[i][0] + nx * w[i] / 2, c[i][1] + ny * w[i] / 2)); R.push(bp(c[i][0] - nx * w[i] / 2, c[i][1] - ny * w[i] / 2));
        }
        return L.concat(R.reverse());
      }
      function shell(pts, a) {
        ctx.beginPath(); curve(ctx, pts, true);
        var g = ctx.createLinearGradient(BX(-1.4), 0, BX(1.4), 0);
        g.addColorStop(0, rgba(mix(P.skin, P.skinLo, 0.35), P.skinA * a)); g.addColorStop(0.42, rgba(mix(P.skin, P.skinHi, 0.3), P.skinA * a)); g.addColorStop(1, rgba(mix(P.skin, P.skinLo, 0.5), P.skinA * a));
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = rgba(P.glow, 0.25); ctx.lineWidth = s * 0.05; ctx.stroke();
        ctx.strokeStyle = rgba(P.line, 0.75); ctx.lineWidth = Math.max(1, s * 0.016); ctx.stroke();
      }
      function seam(list, a) { ctx.beginPath(); curve(ctx, list.map(function (q) { return bp(q[0], q[1]); }), false); ctx.lineCap = 'round'; ctx.strokeStyle = rgba(P.glow, a * 0.3); ctx.lineWidth = s * 0.07; ctx.stroke(); ctx.strokeStyle = rgba(P.line, a); ctx.lineWidth = Math.max(0.8, s * 0.018); ctx.stroke(); }
      function joint(x, y, r) { var px = BX(x), py = BY(y), g = ctx.createRadialGradient(px, py, 0, px, py, s * r * 3); g.addColorStop(0, rgba(WHITE, 0.6 + lvlS * 0.3)); g.addColorStop(0.3, rgba(P.glow, 0.55)); g.addColorStop(1, rgba(P.glow, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, s * r * 3, 0, 6.2832); ctx.fill(); }
      function drawBody() {
        var hx = reduce ? 0 : Math.sin(t * 0.45) * 0.07, ar = reduce ? 0 : Math.sin(t * 0.7) * 0.04;
        var hipY = function (sd) { return 6.05 + sd * 0.1; }, shY = function (sd) { return 1.8 - sd * 0.05; };   // déhanché : poids sur la jambe gauche
        // bas du corps d'un seul tenant (hanches, cuisses, genoux, mollets) : silhouette en sablier, jambe gauche d'appui
        var kn = 0.1, kr = function (sd) { return sd > 0 ? -0.12 : 0; }, an = function (sd) { return sd > 0 ? 0.1 : 0; };
        var side = function (sd) { var k = kr(sd), a = an(sd); return [[sd * 0.74 + hx * 0.5, 4.6], [sd * 0.98 + hx, 5.3], [sd * 1.32 + hx, 6.1 + sd * 0.08], [sd * 1.2 + hx * 0.7, 7.5], [sd * 0.98 + k * 0.5, 8.9], [sd * 0.74 + k, 10.15], [sd * 0.8 + k, 11.1], [sd * 0.62 + a * 0.6, 12.9], [sd * 0.46 + a, 14.4]]; };
        var inner = function (sd) { var k = kr(sd), a = an(sd); return [[sd * 0.24 + a, 14.4], [sd * 0.26 + a * 0.6, 12.4], [sd * 0.3 + k, 10.9], [sd * 0.3 + k, 10.15], [sd * 0.2 + k * 0.5, 8.6], [sd * 0.07 + hx, 7.25]]; };
        var low = side(1).concat(inner(1), inner(-1).reverse(), side(-1).reverse());
        shell(low.map(function (q) { return bp(q[0], q[1]); }), 0.97);
        [-1, 1].forEach(function (sd) {
          var k = kr(sd), a = an(sd), kx = sd * 0.52 + k, ax = sd * 0.35 + a, ay = 14.42;
          seam([[kx - 0.2, 10.15], [kx, 10.22], [kx + 0.2, 10.15]], 0.45);                                   // genou
          seam([[sd * 1.05 + hx, 6.6], [sd * 0.95, 8.0], [sd * 0.72 + k, 9.6]], 0.3);                       // ligne de cuisse
          // pied fin sur talon
          shell([bp(ax - 0.12, ay - 0.08), bp(ax + 0.12, ay - 0.08), bp(ax + 0.13, ay + 0.55), bp(ax + 0.07, ay + 1.45), bp(ax, ay + 1.75), bp(ax - 0.07, ay + 1.45), bp(ax - 0.13, ay + 0.55)], 1);
          seam([[ax - 0.11, ay + 0.5], [ax - 0.1, ay + 0.95], [ax - 0.11, ay + 1.55]], 0.4);
          joint(kx, 10.15, 0.05); joint(ax, ay + 0.02, 0.04);
        });
        // buste : épaules, poitrine, taille fine
        var R = function (sd) { return [[sd * 0.3, 1.4], [sd * 0.95, 1.62 - sd * 0.03], [sd * 1.3, shY(sd)], [sd * 1.12, 2.55], [sd * 1.2, 3.05], [sd * 1.02, 3.62], [sd * 0.74 + hx * 0.5, 4.62], [sd * 0.78 + hx * 0.6, 4.95]]; };
        var rt = R(1), lt = R(-1).reverse();
        shell(rt.concat([[hx * 0.6, 5.0]], lt).map(function (q) { return bp(q[0], q[1]); }), 1);
        ell(-0.42, 3.1, 0.5, 0.42, P.skinHi, 0.16, 0); ell(0.42, 3.1, 0.5, 0.42, P.skinHi, 0.12, 0);
        seam([[-1.02, 3.62], [-0.5, 3.8], [0, 3.62], [0.5, 3.8], [1.02, 3.62]], 0.45);          // sous la poitrine
        seam([[0, 1.62], [0, 2.5], [0, 3.6]], 0.3);
        seam([[0, 3.7], [0, 4.7]], 0.55);                                                       // ligne centrale lumineuse
        seam([[-0.78 + hx * 0.6, 4.95], [0, 5.08], [0.78 + hx * 0.6, 4.95]], 0.6);              // taille
        seam([[-1.15 + hx, 5.6], [-1.25 + hx, 6.3]], 0.35); seam([[1.15 + hx, 5.6], [1.25 + hx, 6.3]], 0.35);   // flancs
        seam([[-0.95, 1.62], [-0.7, 2.1], [-0.3, 2.3]], 0.35); seam([[0.95, 1.62], [0.7, 2.1], [0.3, 2.3]], 0.35);   // épaules
        // cou
        shell([bp(-0.27, 0.75), bp(0.27, 0.75), bp(0.3, 1.5), bp(-0.3, 1.5)], 1);
        for (var nr = 0; nr < 6; nr++) seam([[-0.26, 0.86 + nr * 0.1], [0, 0.9 + nr * 0.1], [0.26, 0.86 + nr * 0.1]], 0.28);
        // bras : l'un le long du corps, l'autre la main posée sur la hanche
        var A1 = [[-1.22, shY(-1) + 0.15], [-1.44 - ar, 3.0], [-1.55 - ar, 4.3], [-1.6 - ar * 1.5, 5.35], [-1.6 - ar * 2, 6.25]];
        var A2 = [[1.22, shY(1) + 0.15], [1.62, 2.9], [2.0, 4.0], [1.72 + hx * 0.5, 4.85], [1.38 + hx, 5.45]];
        shell(limb(A1, [0.6, 0.5, 0.34, 0.36, 0.22]), 1);
        shell([bp(-1.72 - ar * 2, 6.2), bp(-1.48 - ar * 2, 6.2), bp(-1.46 - ar * 2, 6.8), bp(-1.55 - ar * 2, 7.3), bp(-1.66 - ar * 2, 6.85)], 1);   // main détendue
        shell(limb(A2, [0.6, 0.5, 0.34, 0.36, 0.22]), 1);
        shell([bp(1.46 + hx, 5.3), bp(1.36 + hx, 5.62), bp(1.08 + hx, 5.82), bp(1.0 + hx, 5.62), bp(1.2 + hx, 5.38)], 1);   // main sur la hanche
        [[A1, -1], [A2, 1]].forEach(function (aa) { var a = aa[0]; joint(a[0][0], a[0][1], 0.06); joint(a[2][0], a[2][1], 0.045); joint(a[4][0], a[4][1], 0.035); });
        
        // reflet de sol
        var fg = ctx.createRadialGradient(BX(0), BY(16.25), 0, BX(0), BY(16.25), s * 1.6);
        fg.addColorStop(0, rgba(P.glow, 0.35 + lvlS * 0.2)); fg.addColorStop(1, rgba(P.glow, 0));
        ctx.save(); ctx.translate(BX(0), BY(16.25)); ctx.scale(1, 0.18); ctx.translate(-BX(0), -BY(16.25)); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(BX(0), BY(16.25), s * 1.6, 0, 6.2832); ctx.fill(); ctx.restore();
      }
      if (P.andro) androBack(); else hairBack();
      if (CORPS) { ctx.save(); ctx.translate(pvx, pvy); ctx.rotate(-A.roll); ctx.translate(-pvx, -pvy); drawBody(); ctx.restore(); }

      /* ---------- cou, épaules, vêtement, collier ---------- */
      var chinDrop = A.mouth * 0.06;
      if (!CORPS) {
      ctx.beginPath();
      curve(ctx, [pt(-0.27, 0.7), pt(-0.27, 1.2), pt(-0.6, 1.42), pt(-1.32, 1.66), pt(-1.6, 2.4), pt(1.6, 2.4), pt(1.32, 1.66), pt(0.6, 1.42), pt(0.27, 1.2), pt(0.27, 0.7)], false);
      ctx.closePath();
      var ng = ctx.createLinearGradient(0, Y(0.75), 0, Y(1.6));
      ng.addColorStop(0, rgba(mix(P.skin, P.skinLo, 0.55), P.skinA)); ng.addColorStop(0.45, rgba(mix(P.skin, P.skinLo, 0.15), P.skinA)); ng.addColorStop(1, rgba(P.skin, P.skinA));
      ctx.fillStyle = ng; ctx.fill();
      // androïde : cou segmenté (anneaux) et câbles ; sinon muscles du cou, creux et clavicules
      if (P.andro) {
        for (var nr = 0; nr < 6; nr++) { var ny = 0.86 + nr * 0.085; ctx.beginPath(); ctx.ellipse(X(0), Y(ny), s * 0.255, s * 0.035, 0, 0.1, Math.PI - 0.1); ctx.strokeStyle = rgba(P.line, 0.4); ctx.lineWidth = s * 0.006; ctx.stroke(); }
        [-1, 1].forEach(function (sd) { glowLine([pt(sd * 0.2, 0.85), pt(sd * 0.24, 1.1), pt(sd * 0.34, 1.32), pt(sd * 0.6, 1.46)], 0.35, 0.005); });
      }
      ctx.lineCap = 'round';
      if (!P.andro) [-1, 1].forEach(function (sd) {
        strand(pt(sd * 0.22, 0.92), pt(sd * 0.17, 1.1), pt(sd * 0.1, 1.28), pt(sd * 0.05, 1.38), P.skinLo, 0.08, s * 0.02);
        strand(pt(sd * 0.1, 1.44), pt(sd * 0.3, 1.38), pt(sd * 0.55, 1.4), pt(sd * 0.82, 1.45), P.skinLo, 0.22, s * 0.014);
        strand(pt(sd * 0.12, 1.41), pt(sd * 0.3, 1.35), pt(sd * 0.55, 1.37), pt(sd * 0.8, 1.42), P.skinHi, 0.25, s * 0.01);
      });
      ell(0, 1.38, 0.07, 0.05, P.skinLo, 0.25);
      // haut (encolure arrondie, plis)
      ctx.beginPath(); curve(ctx, [pt(-1.7, 1.78), pt(-1.0, 1.55), pt(-0.62, 1.56), pt(-0.32, 1.72), pt(0, 1.8), pt(0.32, 1.72), pt(0.62, 1.56), pt(1.0, 1.55), pt(1.7, 1.78)], false);
      ctx.lineTo(X(1.7), Y(2.6)); ctx.lineTo(X(-1.7), Y(2.6)); ctx.closePath();
      var cg = ctx.createLinearGradient(X(-1.2), Y(1.5), X(1.2), Y(2.2));
      cg.addColorStop(0, rgba(mix(P.cloth, WHITE, 0.12), P.holo ? 0.6 : 1)); cg.addColorStop(1, rgba(mix(P.cloth, BLACK, 0.35), P.holo ? 0.4 : 1));
      ctx.fillStyle = cg; ctx.fill();
      strand(pt(-0.62, 1.56), pt(-0.4, 1.66), pt(-0.2, 1.76), pt(0, 1.8), mix(P.cloth, WHITE, 0.35), 0.5, s * 0.015);
      strand(pt(0.62, 1.56), pt(0.4, 1.66), pt(0.2, 1.76), pt(0, 1.8), mix(P.cloth, WHITE, 0.35), 0.5, s * 0.015);
      if (look.jewels && !P.andro) {
        strand(pt(-0.27, 1.12), pt(-0.22, 1.42), pt(0.22, 1.42), pt(0.27, 1.12), P.metal, 0.85, s * 0.008);
        var pX = X(0), pY = Y(1.47);
        ctx.fillStyle = rgba(P.metal, 0.95); ctx.beginPath(); ctx.moveTo(pX, pY - s * 0.035); ctx.lineTo(pX + s * 0.022, pY); ctx.lineTo(pX, pY + s * 0.04); ctx.lineTo(pX - s * 0.022, pY); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(pX - s * 0.006, pY - s * 0.01, s * 0.007, 0, 6.2832); ctx.fill();
      }
      // ombre portée de la tête sur le cou
      ell(0, 0.98 + chinDrop, 0.42, 0.22, P.skinLo, P.holo ? 0.45 : 0.4);
      }

      /* ---------- oreilles (coiffures courtes ou relevées) ---------- */
      if (HS.ears && !P.andro) {
        [-1, 1].forEach(function (sd) {
          var ep = [pt(sd * 0.71, -0.2, -0.05), pt(sd * 0.82, -0.24, -0.05), pt(sd * 0.87, -0.08, -0.05), pt(sd * 0.84, 0.1, -0.05), pt(sd * 0.78, 0.24, -0.05), pt(sd * 0.71, 0.24, -0.05)];
          ctx.beginPath(); curve(ctx, ep, true);
          ctx.fillStyle = rgba(mix(P.skin, P.skinLo, 0.25), P.skinA); ctx.fill();
          ctx.beginPath(); curve(ctx, [pt(sd * 0.76, -0.14, -0.05), pt(sd * 0.82, -0.12, -0.05), pt(sd * 0.81, 0.04, -0.05), pt(sd * 0.76, 0.14, -0.05)], false);
          ctx.strokeStyle = rgba(P.skinLo, 0.5); ctx.lineWidth = s * 0.016; ctx.stroke();
          if (look.jewels) {
            var ex = X(sd * 0.78, -0.05), ey = Y(0.31, -0.05);
            ctx.beginPath(); ctx.arc(ex, ey, s * 0.06, Math.PI * 1.35, Math.PI * 1.35 + 5.6); ctx.strokeStyle = rgba(P.metal, 0.95); ctx.lineWidth = s * 0.012; ctx.stroke();
            ctx.beginPath(); ctx.arc(ex, ey, s * 0.06, Math.PI * 1.6, Math.PI * 1.9); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = s * 0.006; ctx.stroke();
          }
        });
      }

      /* ---------- visage : forme, modelé ---------- */
      var face = [pt(0, -1.02), pt(0.48, -0.94), pt(0.7, -0.62), pt(0.75, -0.2), pt(0.72, 0.12), pt(0.6, 0.44), pt(0.42, 0.72 + chinDrop * 0.5), pt(0.2, 0.92 + chinDrop), pt(0, 0.97 + chinDrop),
        pt(-0.2, 0.92 + chinDrop), pt(-0.42, 0.72 + chinDrop * 0.5), pt(-0.6, 0.44), pt(-0.72, 0.12), pt(-0.75, -0.2), pt(-0.7, -0.62), pt(-0.48, -0.94)];
      ctx.beginPath(); curve(ctx, face, true);
      var fg = ctx.createRadialGradient(X(-0.08, 0.2), Y(-0.15), s * 0.1, X(0), Y(0.05), s * 1.05);
      fg.addColorStop(0, rgba(mix(P.skin, P.skinHi, 0.35), P.skinA)); fg.addColorStop(0.62, rgba(P.skin, P.skinA)); fg.addColorStop(1, rgba(mix(P.skin, P.skinLo, 0.5), P.skinA));
      ctx.fillStyle = fg; ctx.fill();
      ctx.save(); ctx.clip();
      // lumière venant d'en haut à gauche : ombres à droite, sous les pommettes, aux tempes, à la mâchoire
      var sideK = 0.16 + clamp(yaw * 2, -0.1, 0.1);
      ell(0.82, 0.05, 0.38, 0.9, P.skinLo, sideK + 0.06);
      ell(-0.86, 0.05, 0.3, 0.9, P.skinLo, 0.12 - clamp(yaw * 2, -0.08, 0.08));
      [-1, 1].forEach(function (sd) {
        ell(sd * 0.58, 0.3, 0.2, 0.12, P.skinLo, 0.14, 0.05);       // creux sous la pommette
        ell(sd * 0.68, -0.55, 0.16, 0.24, P.skinLo, 0.1);            // tempe
        ell(sd * 0.4, -0.02 - Math.max(0, A.smile) * 0.04, 0.17, 0.1, P.skinHi, 0.3, 0.1);   // pommette (monte avec le sourire)
        ell(sd * 0.16, -0.22, 0.09, 0.07, P.skinLo, 0.12, 0.12);     // creux intérieur de l'orbite
        ell(sd * 0.3, -0.02, 0.17, 0.05, P.skinLo, 0.08, 0.14);      // sous l'œil
        ell(sd * 0.44, 0.2 - Math.max(0, A.smile) * 0.03, 0.18, 0.13, P.blush, (P.holo ? 0.12 : 0.16) * A.blush * 1.6 + P.mk * 0.04, 0.12);
      });
      ell(-0.12, -0.62, 0.32, 0.2, P.skinHi, 0.3);                    // front
      ell(0, 0.86 + chinDrop, 0.14, 0.08, P.skinHi, 0.3);              // menton
      ell(0, 0.92 + chinDrop, 0.5, 0.1, P.skinLo, 0.16);
      ell(0, 0.71 + A.mouth * 0.13, 0.13, 0.04, P.skinLo, 0.22, 0.2);  // sous la lèvre
      // taches de rousseur, grain de beauté
      if (look.freckles && !P.holo) FRECK.forEach(function (f) { ctx.fillStyle = rgba(mix(P.skinLo, [130, 70, 40], 0.4), f[3]); ctx.beginPath(); ctx.arc(X(f[0], 0.12), Y(f[1], 0.12), f[2] * s, 0, 6.2832); ctx.fill(); });
      if (look.mole && !P.andro) { ctx.fillStyle = P.holo ? rgba(P.line, 0.8) : 'rgba(70,40,30,0.85)'; ctx.beginPath(); ctx.arc(X(0.3, 0.18), Y(0.5, 0.18), s * 0.011, 0, 6.2832); ctx.fill(); }
      ctx.restore();
      // contour : lueur de l'état
      ctx.beginPath(); curve(ctx, face, true);
      ctx.lineWidth = s * (P.holo ? 0.05 : 0.03); ctx.strokeStyle = rgba(P.glow, P.holo ? 0.18 + lv * 0.2 : 0.08 + lv * 0.14); ctx.stroke();
      ctx.lineWidth = Math.max(1, s * 0.008); ctx.strokeStyle = rgba(P.holo ? P.line : mix(P.skinLo, P.glow, 0.2), P.holo ? 0.85 : 0.3); ctx.stroke();

      if (P.andro) androFace();
      /* ---------- sourcils : forme effilée et poils ---------- */
      [-1, 1].forEach(function (sd) {
        var r = A.brow * 0.05, w = A.worry, f = A.furrow;
        var inY = -0.33 - r - w * 0.06 + f * 0.04, pkY = -0.43 - r + f * 0.01, outY = -0.37 - r * 0.6 + w * 0.03;
        if (A.wink > 0.05 && sd === 1) { inY += 0.02 * A.wink; pkY += 0.03 * A.wink; }
        var b0 = [sd * 0.11, inY], b1 = [sd * 0.24, pkY - 0.02], b2 = [sd * 0.4, pkY - 0.01], b3 = [sd * 0.53, outY], top = [], bot = [];
        for (var k = 0; k <= 12; k++) {
          var u = k / 12, p = bz(b0, b1, b2, b3, u), q = bz(b0, b1, b2, b3, Math.min(1, u + 0.01)), dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
          var th = 0.042 * (u < 0.12 ? 0.8 + u * 1.6 : 1 - (u - 0.12) * 0.95) * (1 + P.mk * 0.04);
          top.push(pt(p[0] + dy / l * th * 0.5 * sd, p[1] - Math.abs(dx / l) * th * 0.55, 0.16)); bot.push(pt(p[0] - dy / l * th * 0.5 * sd, p[1] + Math.abs(dx / l) * th * 0.45, 0.16));
        }
        ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]); for (k = 1; k < top.length; k++) ctx.lineTo(top[k][0], top[k][1]); for (k = bot.length - 1; k >= 0; k--) ctx.lineTo(bot[k][0], bot[k][1]); ctx.closePath();
        var bg = ctx.createLinearGradient(X(sd * 0.11), 0, X(sd * 0.53), 0);
        bg.addColorStop(0, rgba(P.brow, P.holo ? 0.55 : 0.6)); bg.addColorStop(0.35, rgba(P.brow, P.holo ? 0.9 : 0.92)); bg.addColorStop(1, rgba(P.brow, P.holo ? 0.75 : 0.8));
        ctx.fillStyle = bg; ctx.fill();
        ctx.lineCap = 'round';
        for (k = 0; k < (P.andro ? 0 : 9); k++) {
          var u2 = k / 9, pp = bz(b0, b1, b2, b3, u2 * 0.9);
          strand(pt(pp[0], pp[1] + 0.012, 0.16), pt(pp[0] + sd * 0.01, pp[1], 0.16), pt(pp[0] + sd * 0.02, pp[1] - 0.012, 0.16), pt(pp[0] + sd * (0.025 + u2 * 0.02), pp[1] - 0.018 + u2 * 0.012, 0.16), mix(P.brow, BLACK, 0.3), 0.45, s * 0.005);
        }
      });

      /* ---------- yeux ---------- */
      [-1, 1].forEach(function (sd) {
        var ex = sd * 0.305, ey = -0.13, hw = 0.185, d = 0.16;
        var op = eyeOpen; if (sd === 1) op *= (1 - A.wink * 0.95);
        var squint = Math.max(0, A.smile - 0.5) * 0.3;
        op = clamp(op - squint, 0, 1.3);
        var up = lerp(-0.03, 0.112, Math.min(1, op)) + Math.max(0, op - 1) * 0.08, lo = 0.05 - squint * 0.05;
        var inC = [ex - sd * hw, ey + 0.012], outC = [ex + sd * hw, ey - 0.022];
        var U1 = [ex - sd * hw * 0.5, ey - up * 1.28], U2 = [ex + sd * hw * 0.5, ey - up * 1.18];
        var L1 = [ex + sd * hw * 0.5, ey + lo * 1.15], L2 = [ex - sd * hw * 0.5, ey + lo * 1.25];
        var P_ = function (q) { return pt(q[0], q[1], d); };
        var iC = P_(inC), oC = P_(outC), u1 = P_(U1), u2 = P_(U2), l1 = P_(L1), l2 = P_(L2);
        function eyePath() { ctx.beginPath(); ctx.moveTo(iC[0], iC[1]); ctx.bezierCurveTo(u1[0], u1[1], u2[0], u2[1], oC[0], oC[1]); ctx.bezierCurveTo(l1[0], l1[1], l2[0], l2[1], iC[0], iC[1]); ctx.closePath(); }
        // paupière mobile (entre le pli et le bord) : ombre à paupières
        var crease = [P_([ex - sd * hw * 0.85, ey - 0.05]), P_([ex - sd * hw * 0.35, ey - Math.max(up, 0.05) - 0.075]), P_([ex + sd * hw * 0.45, ey - Math.max(up, 0.05) - 0.07]), P_([ex + sd * hw * 1.05, ey - 0.045])];
        ctx.beginPath(); ctx.moveTo(crease[0][0], crease[0][1]); ctx.bezierCurveTo(crease[1][0], crease[1][1], crease[2][0], crease[2][1], crease[3][0], crease[3][1]);
        ctx.lineTo(oC[0], oC[1]); ctx.bezierCurveTo(u2[0], u2[1], u1[0], u1[1], iC[0], iC[1]); ctx.closePath();
        var lidC = P.holo ? P.glow : mix(P.shadow, look.lips && LIPS[look.lips] ? LIPS[look.lips] : P.shadow, 0.25);
        var lg = ctx.createLinearGradient(0, crease[1][1], 0, u1[1]);
        lg.addColorStop(0, rgba(lidC, 0.08 + P.mk * 0.08)); lg.addColorStop(1, rgba(lidC, 0.16 + P.mk * 0.12));
        ctx.fillStyle = lg; ctx.fill();
        ell(ex + sd * 0.06, ey - 0.07, 0.15, 0.07, lidC, 0.06 + P.mk * 0.07, d);
        if (op > 0.06) {
          eyePath(); ctx.save(); ctx.clip();
          ctx.fillStyle = rgba(P.sclera, P.scleraA); ctx.fillRect(X(ex - 0.22, d), Y(ey - 0.2, d), s * 0.44, s * 0.36);
          var sg = ctx.createRadialGradient(X(ex, d), Y(ey, d), s * hw * 0.35, X(ex, d), Y(ey, d), s * hw * 1.05);
          sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, rgba(P.holo ? BLACK : [150, 110, 110], 0.4));
          ctx.fillStyle = sg; ctx.fillRect(X(ex - 0.22, d), Y(ey - 0.2, d), s * 0.44, s * 0.36);
          var ix = X(ex + A.gx * 0.065, d + 0.02), iy = Y(ey + A.gy * 0.035 + 0.008, d + 0.02), ir = s * 0.08;
          if (P.andro) {
            var gl2 = ctx.createRadialGradient(ix, iy, 0, ix, iy, ir * 1.6); gl2.addColorStop(0, rgba(P.glow, 0.5 + lvlS * 0.3)); gl2.addColorStop(1, rgba(P.glow, 0)); ctx.fillStyle = gl2; ctx.fillRect(ix - ir * 2, iy - ir * 2, ir * 4, ir * 4);
          }
          var ig = ctx.createRadialGradient(ix, iy, ir * 0.2, ix, iy, ir);
          ig.addColorStop(0, rgba(mix(P.iris, [240, 200, 120], 0.35), 1)); ig.addColorStop(0.45, rgba(mix(P.iris, WHITE, 0.12), 1)); ig.addColorStop(0.85, rgba(P.iris, 1)); ig.addColorStop(1, rgba(mix(P.iris, BLACK, 0.6), 1));
          ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, 6.2832); ctx.fill();
          if (P.andro) { [0.55, 0.78].forEach(function (k2, q) { ctx.beginPath(); ctx.arc(ix, iy, ir * k2, t * (q ? -0.8 : 1.2), t * (q ? -0.8 : 1.2) + 4.7); ctx.strokeStyle = rgba(WHITE, 0.55); ctx.lineWidth = Math.max(0.7, ir * 0.06); ctx.stroke(); }); }
          ctx.lineWidth = Math.max(0.6, ir * 0.04);
          for (var f = 0; f < (small ? 18 : 28); f++) {
            var an = f / (small ? 18 : 28) * 6.2832, r1 = ir * 0.42, r2 = ir * (0.82 + (f % 3) * 0.05);
            ctx.strokeStyle = rgba(f % 2 ? mix(P.iris, WHITE, 0.45) : mix(P.iris, BLACK, 0.45), 0.35);
            ctx.beginPath(); ctx.moveTo(ix + Math.cos(an) * r1, iy + Math.sin(an) * r1); ctx.lineTo(ix + Math.cos(an + 0.08) * r2, iy + Math.sin(an + 0.08) * r2); ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(ix, iy, ir * 0.95, 0, 6.2832); ctx.strokeStyle = rgba(mix(P.iris, BLACK, 0.7), 0.7); ctx.lineWidth = ir * 0.12; ctx.stroke();
          ctx.fillStyle = P.holo ? rgba(mix(P.glow, BLACK, 0.75), 1) : 'rgba(10,6,6,1)'; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.38 * clamp(A.pupil, 0.7, 1.5), 0, 6.2832); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.ellipse(ix + ir * 0.34, iy - ir * 0.36, ir * 0.22, ir * 0.18, -0.5, 0, 6.2832); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(ix - ir * 0.32, iy + ir * 0.34, ir * 0.08, 0, 6.2832); ctx.fill();
          var ug = ctx.createLinearGradient(0, Math.min(u1[1], u2[1]), 0, Y(ey + 0.03, d));
          ug.addColorStop(0, 'rgba(0,0,0,0.38)'); ug.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = ug; ctx.fillRect(X(ex - 0.22, d), Y(ey - 0.2, d), s * 0.44, s * 0.25);
          ctx.restore();
          // caroncule (coin intérieur)
          ctx.fillStyle = P.holo ? rgba(P.glow, 0.4) : 'rgba(222,140,140,0.75)'; ctx.beginPath(); ctx.ellipse(iC[0] + sd * s * 0.014, iC[1], s * 0.013, s * 0.01 * Math.min(1, op), 0, 0, 6.2832); ctx.fill();
        }
        // pli de paupière
        ctx.beginPath(); ctx.moveTo(crease[0][0], crease[0][1]); ctx.bezierCurveTo(crease[1][0], crease[1][1], crease[2][0], crease[2][1], crease[3][0], crease[3][1]);
        ctx.strokeStyle = rgba(P.holo ? P.line : P.skinLo, P.holo ? 0.35 : 0.32); ctx.lineWidth = s * 0.008; ctx.stroke();
        // bord de paupière inférieure : ligne d'eau claire et ombre
        if (op > 0.06) {
          ctx.beginPath(); ctx.moveTo(oC[0], oC[1]); ctx.bezierCurveTo(l1[0], l1[1], l2[0], l2[1], iC[0], iC[1]);
          ctx.strokeStyle = rgba(P.holo ? P.line : [255, 230, 225], P.holo ? 0.4 : 0.5); ctx.lineWidth = s * 0.008; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(oC[0], oC[1] + s * 0.01); ctx.bezierCurveTo(l1[0], l1[1] + s * 0.012, l2[0], l2[1] + s * 0.012, iC[0], iC[1] + s * 0.006);
          ctx.strokeStyle = rgba(P.holo ? P.line : P.skinLo, P.holo ? 0.25 : 0.3 + P.mk * 0.05); ctx.lineWidth = s * 0.006; ctx.stroke();
        }
        // ligne de cils : plus épaisse vers l'extérieur, trait d'eye-liner si maquillage
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(iC[0], iC[1]); ctx.bezierCurveTo(u1[0], u1[1], u2[0], u2[1], oC[0], oC[1]);
        ctx.strokeStyle = rgba(P.holo ? P.line : P.lash, 0.95); ctx.lineWidth = s * 0.014; ctx.stroke();
        var mid = bz(iC, u1, u2, oC, 0.5), m2 = bz(iC, u1, u2, oC, 0.75);
        ctx.beginPath(); ctx.moveTo(mid[0], mid[1]); ctx.quadraticCurveTo(m2[0], m2[1] - s * 0.004, oC[0], oC[1]);
        ctx.lineWidth = s * (0.02 + P.mk * 0.006); ctx.stroke();
        if (P.mk >= 2 && op > 0.1) {
          ctx.beginPath(); ctx.moveTo(m2[0], m2[1]); ctx.quadraticCurveTo(oC[0], oC[1] - s * 0.004, oC[0] + sd * s * (0.05 + P.mk * 0.01), oC[1] - s * (0.03 + P.mk * 0.006));
          ctx.lineWidth = s * 0.012; ctx.stroke();
        }
        // cils (vers le haut ; vers le bas quand l'œil est fermé)
        var nL = P.andro ? 0 : small ? 8 : 11, dn = op < 0.25;
        for (var l = 0; l < nL; l++) {
          var u = 0.22 + 0.78 * l / (nL - 1), b = bz(iC, u1, u2, oC, u), len = s * (0.02 + u * 0.034) * (1 + P.mk * 0.12) * (0.85 + 0.3 * ((l * 7) % 5) / 4);
          var dx = sd * (0.25 + u * 0.95), dy = dn ? 0.75 : -1, nn = Math.hypot(dx, dy);
          dx /= nn; dy /= nn;
          ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.quadraticCurveTo(b[0] + dx * len * 0.5, b[1] + dy * len * 0.6, b[0] + dx * len + sd * len * 0.25, b[1] + dy * len * 0.75 + (dn ? 0 : len * 0.12));
          ctx.lineWidth = s * (0.0045 + P.mk * 0.0008); ctx.strokeStyle = rgba(P.holo ? P.line : P.lash, 0.82); ctx.stroke();
        }
        if (!dn) for (l = 0; l < 4; l++) {
          var b2 = bz(oC, l1, l2, iC, 0.06 + l * 0.12);
          ctx.beginPath(); ctx.moveTo(b2[0], b2[1] + s * 0.006); ctx.lineTo(b2[0] + sd * s * 0.008, b2[1] + s * 0.022);
          ctx.lineWidth = s * 0.004; ctx.strokeStyle = rgba(P.holo ? P.line : P.lash, 0.55); ctx.stroke();
        }
      });

      /* ---------- nez : arête, pointe, ailes, narines ---------- */
      var nd = 0.32;
      ell(-0.02, 0.0, 0.035, 0.2, P.skinHi, P.holo ? 0.3 : 0.38, 0.26);
      ell(0.075, 0.02, 0.05, 0.22, P.skinLo, 0.16, 0.26);
      ell(-0.1, -0.12, 0.04, 0.1, P.skinLo, 0.08, 0.2);
      ell(0, 0.215, 0.07, 0.05, P.skinHi, P.holo ? 0.32 : 0.42, nd);
      ell(0, 0.31, 0.11, 0.04, P.skinLo, 0.26, nd);
      ctx.lineCap = 'round';
      [-1, 1].forEach(function (sd) {
        ctx.beginPath(); curve(ctx, [pt(sd * 0.075, 0.17, nd * 0.85), pt(sd * 0.105, 0.24, nd * 0.85), pt(sd * 0.085, 0.3, nd * 0.9), pt(sd * 0.045, 0.31, nd)], false);
        ctx.strokeStyle = rgba(P.holo ? P.line : P.skinLo, P.holo ? 0.5 : 0.5); ctx.lineWidth = s * 0.012; ctx.stroke();
        ctx.fillStyle = rgba(P.holo ? P.skinLo : mix(P.skinLo, BLACK, 0.4), 0.55);
        ctx.beginPath(); ctx.ellipse(X(sd * 0.043, nd), Y(0.302, nd), s * 0.022, s * 0.01, sd * 0.35, 0, 6.2832); ctx.fill();
      });
      strand(pt(0.055, -0.1, 0.24), pt(0.06, 0.02, 0.27), pt(0.07, 0.1, 0.3), pt(0.075, 0.17, nd), P.holo ? P.line : P.skinLo, P.holo ? 0.25 : 0.12, s * 0.01);

      /* ---------- bouche ---------- */
      var md = 0.22, my = 0.56, o = clamp(A.mouth, 0, 1.1), w = 0.245 * A.mw * (1 + Math.max(0, A.smile) * 0.12), sm = A.smile * 0.045;
      // philtrum
      ell(0, 0.44, 0.03, 0.06, P.skinHi, 0.22, md);
      [-1, 1].forEach(function (sd) { strand(pt(sd * 0.026, 0.37, md), pt(sd * 0.03, 0.42, md), pt(sd * 0.036, 0.47, md), pt(sd * 0.05, my - 0.075, md), P.skinLo, 0.12, s * 0.008); });
      var cL = pt(-w, my - sm + o * 0.01, md * 0.8), cR = pt(w, my - sm + o * 0.01, md * 0.8);
      var pkL = pt(-0.06, my - 0.078 - o * 0.01, md), pkR = pt(0.06, my - 0.078 - o * 0.01, md), dip = pt(0, my - 0.058 - o * 0.01, md);
      var upIn = [cR, pt(w * 0.45, my - 0.004 - o * 0.015, md), pt(-w * 0.45, my - 0.004 - o * 0.015, md), cL];
      var loIn = [cL, pt(-w * 0.45, my + 0.006 + o * 0.12, md), pt(w * 0.45, my + 0.006 + o * 0.12, md), cR];
      var loBot = [cR, pt(w * 0.5, my + 0.105 + o * 0.13, md), pt(-w * 0.5, my + 0.105 + o * 0.13, md), cL];
      function line(p, first) { if (first) ctx.moveTo(p[0][0], p[0][1]); ctx.bezierCurveTo(p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]); }
      function upperOuter() {
        ctx.moveTo(cL[0], cL[1]);
        ctx.bezierCurveTo(X(-w * 0.75, md), Y(my - 0.03 - sm * 0.5, md), X(-0.1, md), pkL[1], pkL[0], pkL[1]);
        ctx.quadraticCurveTo(X(-0.025, md), pkL[1], dip[0], dip[1]);
        ctx.quadraticCurveTo(X(0.025, md), pkR[1], pkR[0], pkR[1]);
        ctx.bezierCurveTo(X(0.1, md), pkR[1], X(w * 0.75, md), Y(my - 0.03 - sm * 0.5, md), cR[0], cR[1]);
      }
      if (o > 0.02) {
        ctx.beginPath(); line(upIn, true); line(loIn, false); ctx.closePath();
        ctx.fillStyle = rgba(P.mouthIn, P.holo ? 0.8 : 1); ctx.fill();
        ctx.save(); ctx.clip();
        if (P.andro) { var mg = ctx.createRadialGradient(X(0, md), Y(my + o * 0.05, md), 0, X(0, md), Y(my + o * 0.05, md), s * w); mg.addColorStop(0, rgba(WHITE, 0.4 + lvlS * 0.5)); mg.addColorStop(0.4, rgba(P.glow, 0.7)); mg.addColorStop(1, rgba(P.glow, 0.1)); ctx.fillStyle = mg; ctx.fillRect(X(-0.3, md), Y(my - 0.1, md), s * 0.6, s * 0.35); ctx.restore(); }
        else {
        ctx.fillStyle = P.holo ? rgba(mix(P.glow, WHITE, 0.7), 0.8) : 'rgba(246,244,238,0.97)';
        ctx.beginPath(); ctx.ellipse(X(0, md), Y(my - 0.012 - o * 0.012, md), s * w * 0.8, s * 0.032, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (var tq = -2; tq <= 2; tq++) ctx.fillRect(X(tq * 0.045 + 0.022, md), Y(my - 0.04, md), Math.max(0.6, s * 0.004), s * 0.05);
        ctx.fillStyle = P.holo ? rgba(mix(P.glow, [255, 120, 160], 0.5), 0.5) : 'rgba(196,84,96,0.9)';
        ctx.beginPath(); ctx.ellipse(X(0, md), Y(my + o * 0.12, md), s * w * 0.62, s * 0.05, 0, 0, 6.2832); ctx.fill();
        ctx.restore();
        }
      }
      ctx.beginPath(); upperOuter(); line(upIn, false); ctx.closePath();
      var ug2 = ctx.createLinearGradient(0, pkL[1], 0, Y(my, md));
      ug2.addColorStop(0, rgba(mix(P.lip, BLACK, 0.05), P.lipA)); ug2.addColorStop(1, rgba(mix(P.lip, BLACK, 0.25), P.lipA));
      ctx.fillStyle = ug2; ctx.fill();
      ctx.beginPath(); line(loIn, true); line(loBot, false); ctx.closePath();
      var lg2 = ctx.createLinearGradient(0, Y(my, md), 0, Y(my + 0.105 + o * 0.13, md));
      lg2.addColorStop(0, rgba(mix(P.lip, BLACK, 0.1), P.lipA)); lg2.addColorStop(0.5, rgba(P.lip, P.lipA)); lg2.addColorStop(1, rgba(mix(P.lip, BLACK, 0.15), P.lipA));
      ctx.fillStyle = lg2; ctx.fill();
      // reflets (brillant léger, plus marqué avec le maquillage)
      ell(0.02, my + 0.048 + o * 0.12, 0.08, 0.024, WHITE, (P.holo ? 0.3 : 0.28) + P.mk * 0.06, md);
      ell(-0.06, my - 0.04, 0.03, 0.01, WHITE, 0.18 + P.mk * 0.04, md);
      // ligne entre les lèvres et commissures
      ctx.beginPath(); line(upIn, true); ctx.strokeStyle = rgba(P.holo ? P.line : mix(P.lip, BLACK, 0.55), o > 0.02 ? 0.2 : 0.55); ctx.lineWidth = s * 0.008; ctx.stroke();
      ctx.strokeStyle = rgba(P.holo ? P.line : mix(P.lip, BLACK, 0.4), 0.45); ctx.lineWidth = s * 0.009; ctx.lineCap = 'round';
      [[cL, -1], [cR, 1]].forEach(function (cc) { ctx.beginPath(); ctx.moveTo(cc[0][0], cc[0][1]); ctx.quadraticCurveTo(cc[0][0] + cc[1] * s * 0.018, cc[0][1] - s * A.smile * 0.012, cc[0][0] + cc[1] * s * 0.028, cc[0][1] - s * A.smile * 0.028); ctx.stroke(); });
      if (P.holo) { ctx.beginPath(); upperOuter(); line(loBot, false); ctx.strokeStyle = rgba(P.line, 0.5); ctx.lineWidth = s * 0.007; ctx.stroke(); }

      if (P.andro) androFront(); else hairFront();

      /* ---------- lunettes ---------- */
      if (look.glasses === 'fines' || look.glasses === 'rondes') {
        var round = look.glasses === 'rondes', fc = P.holo ? P.line : round ? [150, 110, 60] : [40, 34, 38];
        [-1, 1].forEach(function (sd) {
          var lx = X(sd * 0.3, 0.24), ly = Y(-0.12, 0.24);
          ctx.beginPath();
          if (round) ctx.arc(lx, ly, s * 0.18, 0, 6.2832);
          else { var rw = s * 0.21, rh = s * 0.14, rr = s * 0.06; ctx.moveTo(lx - rw + rr, ly - rh); ctx.lineTo(lx + rw - rr, ly - rh); ctx.quadraticCurveTo(lx + rw, ly - rh, lx + rw, ly - rh + rr); ctx.lineTo(lx + rw, ly + rh - rr); ctx.quadraticCurveTo(lx + rw, ly + rh, lx + rw - rr * 1.6, ly + rh); ctx.lineTo(lx - rw + rr * 1.6, ly + rh); ctx.quadraticCurveTo(lx - rw, ly + rh, lx - rw, ly + rh - rr); ctx.lineTo(lx - rw, ly - rh + rr); ctx.quadraticCurveTo(lx - rw, ly - rh, lx - rw + rr, ly - rh); ctx.closePath(); }
          ctx.fillStyle = 'rgba(200,225,255,0.07)'; ctx.fill();
          ctx.strokeStyle = rgba(fc, 0.95); ctx.lineWidth = s * (round ? 0.014 : 0.018); ctx.stroke();
          ctx.save(); ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = s * 0.05;
          ctx.beginPath(); ctx.moveTo(lx - s * 0.2, ly + s * 0.05); ctx.lineTo(lx - s * 0.02, ly - s * 0.2); ctx.stroke();
          ctx.lineWidth = s * 0.015; ctx.beginPath(); ctx.moveTo(lx - s * 0.08, ly + s * 0.12); ctx.lineTo(lx + s * 0.06, ly - s * 0.08); ctx.stroke();
          ctx.restore();
          ctx.beginPath(); ctx.moveTo(X(sd * (round ? 0.48 : 0.51), 0.24), Y(-0.16, 0.24)); ctx.lineTo(X(sd * 0.74, 0.05), Y(-0.18, 0.05)); ctx.strokeStyle = rgba(fc, 0.8); ctx.lineWidth = s * 0.014; ctx.stroke();
        });
        ctx.beginPath(); ctx.moveTo(X(-0.12, 0.26), Y(-0.15, 0.26)); ctx.quadraticCurveTo(X(0, 0.3), Y(-0.21, 0.3), X(0.12, 0.26), Y(-0.15, 0.26));
        ctx.strokeStyle = rgba(fc, 0.95); ctx.lineWidth = s * 0.014; ctx.stroke();
      }

      if (P.holo) {
        ctx.save(); ctx.globalCompositeOperation = 'source-atop';
        var off = (t * 18) % 4;
        ctx.fillStyle = rgba(P.glow, 0.07);
        for (var yy = Y(-1.5) + off; yy < (CORPS ? H : Y(2.2)); yy += 4) ctx.fillRect(CORPS ? 0 : X(-1.8), yy, CORPS ? W : s * 3.6, 1.2);
        ctx.restore();
      }
      ctx.restore();
      // fondu du bas (épaules) : aucun bord net dans le canvas
      if (CORPS) return;
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      var fa = close ? 1.15 : 1.42, fb = close ? 1.6 : 1.98;
      var fo = ctx.createLinearGradient(0, Y(fa), 0, Math.min(H, Y(fb)));
      fo.addColorStop(0, 'rgba(0,0,0,0)'); fo.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = fo; ctx.fillRect(0, Y(fa), W, H);
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
      mood: function (n, ms) { moodN = n || ''; moodUntil = performance.now() + (ms || 2600); kick(); },
      look: function (o) { if (o) Object.keys(o).forEach(function (k) { if (o[k] != null && k in DEFLOOK) look[k] = o[k]; }); if (reduce) frame(performance.now()); else kick(); },
      metrics: function () { return { level: M.level, mouth: M.mouth, frames: M.frames, state: st, running: !!(raf || tmo) }; },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); },
      reduced: reduce, kind: 'visage'
    };
    frame(performance.now());
    return api;
  }
  root.MJFace = { create: create, vowels: vowels, SKINS: SKINS, HAIRS: HAIRS, EYES: EYES, LIPS: LIPS, CLOTHES: CLOTHES, COIFFURES: STYLES_HAIR, DEFLOOK: DEFLOOK };
})(window);
