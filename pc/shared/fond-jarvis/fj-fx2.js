/* =====================================================================
   Fond Jarvis : effets en plus et « mode Bureau ».
   - Démarrage : séquence d'initialisation (anneaux qui s'ouvrent, lignes tapées, panneaux qui arrivent un à un).
   - Autour de la sphère : spectre circulaire qui suit la voix (micro ou réponse), satellites en orbite avec traînée,
     ondes de choc (écoute, réflexion, réponse), éclats de particules quand l'assistant répond.
   - Bords de l'écran : flux de données qui défilent ; de temps en temps un court « glitch » du HUD.
   - Mode Bureau (Suite MAG) : plein écran au premier clic ou à la première touche, bouton ⛶ dans la barre.
   Intensité : S.fx (comme les autres effets) ; coupés par S.reduce ou S.fx2 === false. Même boucle plafonnée (FJ.loop).
   ===================================================================== */
(function (root) {
  'use strict';
  var FJ = root.FJ, doc = document, TAU = Math.PI * 2;
  if (!FJ || !FJ.loop) return;
  var S = FJ.S;
  function on() { return S.fx2 !== false && !S.reduce && S.fx > 0; }
  var GAD = FJ.GADGETS = { planetes: 'Planètes en orbite', atome: 'Atome (électrons autour de la sphère)', eclairs: 'Éclairs quand il parle', hyper: 'Saut en hyperespace au réveil', cometes: 'Comètes', constellations: 'Constellations', globe: 'Globe holographique' };
  function gad(k) { var o = S.gadgets || {}; return o[k] !== false; }
  function K() { return Math.max(0, Math.min(1, (S.fx || 0) / 100)); }
  function col(a) { var c = getComputedStyle(doc.documentElement).getPropertyValue('--c').trim().split(/\s+/).map(Number); if (c.length < 3 || isNaN(c[0])) c = [63, 224, 255]; return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }
  var C1 = col(1), cT = 0;
  // colA garde l'opacité pleine (aspect d'origine des gadgets) ; colB applique vraiment l'opacité demandée (globe)
  function colB(a) { colA(1); return C1.replace(/,[0-9.]+\)$/, ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'); }
  function colA(a) { var n = Date.now(); if (n - cT > 2000) { C1 = col(1); cT = n; } return C1.replace(/,1\)$/, ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'); }

  /* ---------------- toile ---------------- */
  var cv = doc.createElement('canvas'); cv.id = 'fx2'; cv.setAttribute('aria-hidden', 'true');
  var fxEl = doc.getElementById('fx'); if (fxEl && fxEl.parentNode) fxEl.parentNode.insertBefore(cv, fxEl.nextSibling); else doc.body.appendChild(cv);
  var g = cv.getContext('2d'), W = 0, H = 0, DPR = 1;
  function size() { DPR = Math.min(1.5, root.devicePixelRatio || 1); var w = root.innerWidth, h = root.innerHeight; if (w * DPR !== W || h * DPR !== H) { W = cv.width = Math.round(w * DPR); H = cv.height = Math.round(h * DPR); } }
  root.addEventListener('resize', size); size();

  function centre() {
    var b = doc.getElementById('orbBox'); if (!b) return { x: W / 2, y: H / 2, r: Math.min(W, H) * .12 };
    var r = b.getBoundingClientRect(); return { x: (r.left + r.width / 2) * DPR, y: (r.top + r.height / 2) * DPR, r: Math.max(20, Math.min(r.width, r.height) * .36 * DPR) };
  }

  /* ---------------- niveau de la voix et états de la sphère ---------------- */
  var lvl = 0, cible = 0, wrapped = null;
  function wrap() {
    var o = FJ.orb; if (!o || wrapped === o) return; wrapped = o;
    ['level', 'voice'].forEach(function (m) { var f = o[m]; if (typeof f === 'function') o[m] = function (v) { cible = Math.max(0, Math.min(1, +v || 0)); return f.apply(o, arguments); }; });
    var st = o.state;
    if (typeof st === 'function') o.state = function (s) {
      var prev = o.get ? o.get() : null, r = st.apply(o, arguments);
      if (s && s !== prev) {
        if (s === 'listen') { pulse(1, 1.2); if (gad('hyper')) hyper(); }
        else if (s === 'think') pulse(.6, .8);
        else if (s === 'speak') { pulse(.9, 1); burst(46); }
        else if (s === 'error') pulse(1, 1, 'rgba(255,77,94,');
        if (s === 'idle') cible = 0;
      }
      return r;
    };
  }

  /* ---------------- ondes et éclats ---------------- */
  var waves = [], parts = [];
  function pulse(force, vit, rgb) { if (!on()) return; waves.push({ t0: performance.now(), f: force || 1, v: vit || 1, rgb: rgb || null }); if (waves.length > 8) waves.shift(); FJ.loop.kick(); }
  function burst(n) {
    if (!on()) return; var c = centre(), k = K();
    for (var i = 0; i < Math.round(n * k); i++) { var a = Math.random() * TAU, s = (1.2 + Math.random() * 3.2) * DPR; parts.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, d: .012 + Math.random() * .02 }); }
    if (parts.length > 300) parts.splice(0, parts.length - 300);
  }

  /* ---------------- flux de données (bords) ---------------- */
  var HEXA = '0123456789ABCDEF', cols = [];
  function flux() {
    var n = Math.max(2, Math.round(W / DPR / 160)); cols = [];
    for (var i = 0; i < n; i++) {
      var gauche = i % 2 === 0, x = gauche ? (8 + (i >> 1) * 14) * DPR : W - (16 + (i >> 1) * 14) * DPR, s = '';
      for (var j = 0; j < 60; j++) s += HEXA[Math.floor(Math.random() * 16)];
      cols.push({ x: x, s: s, v: (14 + Math.random() * 26) * DPR, o: Math.random() * H });
    }
  }
  var fluxW = 0;

  /* ---------------- satellites ---------------- */
  var SAT = [{ r: 1.55, e: .42, t: .5, v: .00042, p: 0 }, { r: 1.85, e: .3, t: -.7, v: -.00031, p: 2 }, { r: 2.2, e: .55, t: 1.2, v: .00022, p: 4 }];

  var t0 = performance.now();
  function draw(now) {
    wrap(); size();
    g.clearRect(0, 0, W, H);
    if (!on()) { waves.length = 0; parts.length = 0; return; }
    var k = K(), c = centre(); lvl += (cible - lvl) * .25;
    // flux de données
    if (fluxW !== W) { flux(); fluxW = W; }
    g.font = (11 * DPR) + 'px ui-monospace, Consolas, monospace'; g.textAlign = 'center';
    // téléphone et tablette en hauteur : les panneaux vont jusqu'aux bords, pas de flux par-dessus
    if (!(FJ.ecranScroll && FJ.ecranScroll())) cols.forEach(function (q) {
      var y0 = (q.o + now / 1000 * q.v) % (H + 400 * DPR) - 200 * DPR;
      for (var j = 0; j < 24; j++) { var y = y0 - j * 13 * DPR; if (y < -10 || y > H + 10) continue; g.fillStyle = colA((j === 0 ? .55 : .22 * (1 - j / 24)) * k); g.fillText(q.s[(j + Math.floor(now / 140)) % q.s.length], q.x, y); }
    });
    // spectre circulaire
    var N = 84, R0 = c.r * 1.12, act = lvl > .02;
    g.lineCap = 'round';
    for (var i = 0; i < N; i++) {
      var a = i / N * TAU + (act ? 0 : now / 9000), b = act ? lvl * (.35 + .65 * Math.abs(Math.sin(i * 1.7 + now / 90) * Math.cos(i * .37 - now / 170))) : .04 + .03 * Math.sin(i * .5 + now / 600);
      var L = (3 + b * c.r * .42) * k + 2 * DPR;
      g.strokeStyle = colA((act ? .35 + .6 * b : .25) * k); g.lineWidth = Math.max(1, 1.7 * DPR * (c.r / (120 * DPR)));
      g.beginPath(); g.moveTo(c.x + Math.cos(a) * R0, c.y + Math.sin(a) * R0); g.lineTo(c.x + Math.cos(a) * (R0 + L), c.y + Math.sin(a) * (R0 + L)); g.stroke();
    }
    gadgets(now, c, k);
    // satellites avec traînée (remplacés par l'atome)
    if (!gad('atome')) SAT.forEach(function (s) {
      for (var j = 0; j < 14; j++) {
        var an = s.p + (now - j * 28) * s.v, ex = Math.cos(an) * c.r * s.r, ey = Math.sin(an) * c.r * s.r * s.e;
        var x = c.x + ex * Math.cos(s.t) - ey * Math.sin(s.t), y = c.y + ex * Math.sin(s.t) + ey * Math.cos(s.t);
        g.fillStyle = colA((j ? .5 * (1 - j / 14) : .95) * k); g.beginPath(); g.arc(x, y, (j ? 1.6 : 2.6) * DPR * (1 - j / 20), 0, TAU); g.fill();
      }
    });
    // ondes de choc
    for (var w = waves.length - 1; w >= 0; w--) {
      var q = waves[w], dt = (now - q.t0) / 1000, rr = c.r * (1.05 + dt * 1.9 * q.v), al = (1 - dt / 1.4) * .7 * q.f * k;
      if (al <= 0) { waves.splice(w, 1); continue; }
      g.strokeStyle = q.rgb ? q.rgb + al.toFixed(3) + ')' : colA(al); g.lineWidth = (3 - dt * 1.6) * DPR + .5;
      g.beginPath(); g.arc(c.x, c.y, rr, 0, TAU); g.stroke();
      g.setLineDash([4 * DPR, 10 * DPR]); g.lineWidth = 1 * DPR; g.beginPath(); g.arc(c.x, c.y, rr * 1.12, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    // éclats
    for (var p = parts.length - 1; p >= 0; p--) {
      var o = parts[p]; o.x += o.vx; o.y += o.vy; o.vx *= .985; o.vy *= .985; o.l -= o.d;
      if (o.l <= 0) { parts.splice(p, 1); continue; }
      g.fillStyle = colA(o.l * .9 * k); g.fillRect(o.x - DPR, o.y - DPR, 2.2 * DPR, 2.2 * DPR);
    }
    // anneaux du démarrage
    var db = (now - t0) / 1000;
    if (boot && db < 3.2) for (var r = 0; r < 4; r++) { var e = Math.max(0, Math.min(1, (db - r * .25) / 1.4)); if (e <= 0) continue; g.strokeStyle = colA((1 - e) * .8); g.lineWidth = 2 * DPR; g.beginPath(); g.arc(c.x, c.y, c.r * (.2 + e * (3 + r)), 0, TAU); g.stroke(); }
  }
  FJ.loop.add(draw, function () { return on() || waves.length || parts.length; });

  /* ---------------- gadgets ---------------- */
  var etoiles = null, liens = null, etW = 0, eclairs = [], streaks = [], comete = null, prochaineComete = performance.now() + 8000;
  function hyper() { if (!on()) return; var t = performance.now(); for (var i = 0; i < 140; i++) streaks.push({ a: Math.random() * TAU, d: Math.random() * .3, v: .6 + Math.random() * 1.4, t0: t }); FJ.loop.kick(); }
  FJ.hyper = hyper;
  function constellations() {
    etoiles = []; liens = [];
    var rnd = (function (s) { return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(4242);
    // autant d'étoiles au cm² que sur un écran de PC (90 en 1920 × 1080) : un téléphone n'est pas couvert de traits
    var n = Math.round(90 * Math.min(1, (W * H) / (1920 * 1080 * DPR * DPR)));
    n = Math.max(24, n);
    for (var i = 0; i < n; i++) etoiles.push({ x: rnd() * W, y: rnd() * H, r: (rnd() < .15 ? 1.6 : .9) * DPR, p: rnd() * TAU });
    for (var a = 0; a < etoiles.length; a++) for (var b = a + 1; b < etoiles.length; b++) { var dx = etoiles[a].x - etoiles[b].x, dy = etoiles[a].y - etoiles[b].y; if (dx * dx + dy * dy < Math.pow(95 * DPR, 2) && rnd() < .55) liens.push([a, b]); }
  }
  var PLANETES = [
    { o: 3.0, t: .32, v: .00016, p: 0, s: 6, c: ['#ffd9a0', '#c8782e'] },
    { o: 3.6, t: .3, v: -.00011, p: 2.1, s: 9, c: ['#bfe6ff', '#2b6fd6'], lune: 1 },
    { o: 4.3, t: .28, v: .00008, p: 4, s: 12, c: ['#fff0c8', '#c9a15a'], anneau: 1 },
    { o: 5.1, t: .26, v: -.00006, p: 1, s: 8, c: ['#c9fff0', '#1f9e8a'] }];
  function planete(q, x, y, s, devant) {
    var gr = g.createRadialGradient(x - s * .35, y - s * .35, s * .1, x, y, s); gr.addColorStop(0, q.c[0]); gr.addColorStop(1, q.c[1]);
    g.globalAlpha = devant ? 1 : .55;
    if (q.anneau) { g.strokeStyle = 'rgba(240,220,170,.75)'; g.lineWidth = 1.6 * DPR; g.beginPath(); g.ellipse(x, y, s * 2.1, s * .55, -.35, Math.PI, TAU); g.stroke(); }
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    if (q.anneau) { g.beginPath(); g.ellipse(x, y, s * 2.1, s * .55, -.35, 0, Math.PI); g.stroke(); }
    g.globalAlpha = 1;
  }
  function gadgets(now, c, k) {
    // constellations (fond)
    if (gad('constellations')) {
      if (etW !== W + 'x' + H) { constellations(); etW = W + 'x' + H; }
      g.strokeStyle = colA(.08 * k); g.lineWidth = DPR * .8; g.beginPath();
      if (!(FJ.ecranScroll && FJ.ecranScroll())) liens.forEach(function (l) { g.moveTo(etoiles[l[0]].x, etoiles[l[0]].y); g.lineTo(etoiles[l[1]].x, etoiles[l[1]].y); }); g.stroke();
      etoiles.forEach(function (e) { var tw = .35 + .65 * Math.abs(Math.sin(now / 900 + e.p)); g.fillStyle = 'rgba(220,240,255,' + (tw * .55 * k).toFixed(3) + ')'; g.beginPath(); g.arc(e.x, e.y, e.r, 0, TAU); g.fill(); });
    }
    // hyperespace
    if (streaks.length) {
      g.lineCap = 'round';
      for (var i = streaks.length - 1; i >= 0; i--) {
        var q = streaks[i], dt = (now - q.t0) / 1000; if (dt > 1.3) { streaks.splice(i, 1); continue; }
        var d0 = c.r * (1.1 + (q.d + dt * dt * 3.2 * q.v) * 6), d1 = d0 + c.r * (.2 + dt * 2.5 * q.v);
        g.strokeStyle = 'rgba(230,250,255,' + ((1 - dt / 1.3) * .8).toFixed(3) + ')'; g.lineWidth = (1 + dt * 2) * DPR;
        g.beginPath(); g.moveTo(c.x + Math.cos(q.a) * d0, c.y + Math.sin(q.a) * d0); g.lineTo(c.x + Math.cos(q.a) * d1, c.y + Math.sin(q.a) * d1); g.stroke();
      }
    }
    // comète
    if (gad('cometes')) {
      if (!comete && now > prochaineComete) { var gch = Math.random() < .5; comete = { t0: now, x0: gch ? -60 * DPR : W + 60 * DPR, y0: Math.random() * H * .5, vx: (gch ? 1 : -1) * (.5 + Math.random() * .4) * DPR, vy: (.12 + Math.random() * .2) * DPR }; prochaineComete = now + 20000 + Math.random() * 25000; }
      if (comete) {
        var dtc = now - comete.t0, cx = comete.x0 + comete.vx * dtc, cy = comete.y0 + comete.vy * dtc;
        if (cx < -200 * DPR || cx > W + 200 * DPR || cy > H + 100) comete = null;
        else {
          var tx = cx - comete.vx * 220, ty = cy - comete.vy * 220, gq = g.createLinearGradient(cx, cy, tx, ty);
          gq.addColorStop(0, 'rgba(255,255,255,' + (.9 * k).toFixed(3) + ')'); gq.addColorStop(.15, colA(.5 * k)); gq.addColorStop(1, colA(0));
          g.strokeStyle = gq; g.lineWidth = 3 * DPR; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.stroke();
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, 2.6 * DPR, 0, TAU); g.fill();
        }
      }
    }
    // planètes (derrière d'abord, devant ensuite)
    if (gad('planetes')) {
      var pos = PLANETES.map(function (q) { var a = q.p + now * q.v; return { q: q, x: c.x + Math.cos(a) * c.r * q.o, y: c.y + Math.sin(a) * c.r * q.o * q.t, devant: Math.sin(a) > 0 }; });
      g.setLineDash([2 * DPR, 9 * DPR]); g.lineWidth = DPR;
      PLANETES.forEach(function (q) { g.strokeStyle = colA(.12 * k); g.beginPath(); g.ellipse(c.x, c.y, c.r * q.o, c.r * q.o * q.t, 0, 0, TAU); g.stroke(); });
      g.setLineDash([]);
      pos.sort(function (a, b) { return a.y - b.y; }).forEach(function (o) { planete(o.q, o.x, o.y, o.q.s * DPR * (o.devant ? 1.1 : .8) * Math.max(.7, c.r / (120 * DPR)), o.devant);
        if (o.q.lune) { var al = now * .0012; disque2(o.x + Math.cos(al) * o.q.s * 2.4 * DPR, o.y + Math.sin(al) * o.q.s * DPR, 2.2 * DPR, '#e8eef5'); } });
    }
    // atome : électrons sur trois orbites inclinées
    if (gad('atome')) {
      [0, Math.PI / 3, -Math.PI / 3].forEach(function (tilt, n) {
        var R1 = c.r * 1.42, R2 = R1 * .32;
        g.strokeStyle = colA(.22 * k); g.lineWidth = 1.1 * DPR; g.beginPath(); g.ellipse(c.x, c.y, R1, R2, tilt, 0, TAU); g.stroke();
        for (var j = 0; j < 16; j++) {
          var an = now * .0034 * (n % 2 ? -1 : 1) + n * 2.1 - j * .07, ex = Math.cos(an) * R1, ey = Math.sin(an) * R2;
          var x = c.x + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = c.y + ex * Math.sin(tilt) + ey * Math.cos(tilt);
          if (!j) { var gl = g.createRadialGradient(x, y, 0, x, y, 9 * DPR); gl.addColorStop(0, 'rgba(255,255,255,' + (.95 * k).toFixed(3) + ')'); gl.addColorStop(.35, colA(.8 * k)); gl.addColorStop(1, colA(0)); g.fillStyle = gl; g.beginPath(); g.arc(x, y, 9 * DPR, 0, TAU); g.fill(); }
          else { g.fillStyle = colA(.55 * (1 - j / 16) * k); g.beginPath(); g.arc(x, y, 2 * DPR * (1 - j / 18), 0, TAU); g.fill(); }
        }
      });
    }
    // éclairs quand il parle ou écoute fort
    if (gad('eclairs')) {
      if (lvl > .35 && Math.random() < lvl * .35 && eclairs.length < 4) {
        var a0 = Math.random() * TAU, pts = [], seg = 7, r0 = c.r * 1.02, r1 = c.r * (1.45 + Math.random() * .5);
        for (var e = 0; e <= seg; e++) { var rr = r0 + (r1 - r0) * e / seg, aa = a0 + (e && e < seg ? (Math.random() - .5) * .22 : 0); pts.push(c.x + Math.cos(aa) * rr, c.y + Math.sin(aa) * rr); }
        eclairs.push({ p: pts, t0: now });
      }
      for (var z = eclairs.length - 1; z >= 0; z--) {
        var E = eclairs[z], de = (now - E.t0) / 160; if (de > 1) { eclairs.splice(z, 1); continue; }
        g.strokeStyle = 'rgba(235,252,255,' + ((1 - de) * .95).toFixed(3) + ')'; g.lineWidth = 1.6 * DPR; g.shadowColor = C1; g.shadowBlur = 12 * DPR;
        g.beginPath(); for (var u = 0; u < E.p.length; u += 2) g[u ? 'lineTo' : 'moveTo'](E.p[u], E.p[u + 1]); g.stroke(); g.shadowBlur = 0;
      }
    }
    // globe holographique
    if (gad('globe')) {
      // coin libre de la scène, en bas à gauche (hors des anneaux, à l'écart du QR code du mode Formation, en bas à droite)
      var stg = doc.getElementById('stage'), sr = stg ? stg.getBoundingClientRect() : null;
      var gr2 = Math.max(30 * DPR, Math.min(c.r * .22, 72 * DPR)), rot = now / 4000;
      var gx = sr ? (sr.left * DPR + gr2 + 18 * DPR) : c.x - c.r * 2.2, gy = sr ? (sr.bottom * DPR - gr2 - 30 * DPR) : c.y + c.r * 1.1;
      var dd = Math.hypot(gx - c.x, gy - c.y);
      if (sr && dd < c.r * 1.42 + gr2) { var ang = Math.atan2(gy - c.y, gx - c.x), need = c.r * 1.42 + gr2; gx = c.x + Math.cos(ang) * need; gy = c.y + Math.sin(ang) * need; }
      var cl = doc.getElementById('colL');
      if (cl && cl.offsetParent) {   // sous le dernier panneau de gauche s'il déborde au-dessus du globe
        var cr = cl.getBoundingClientRect(), lb = 0;
        cl.querySelectorAll('.pan').forEach(function (p) { if (p.offsetParent) { var r = p.getBoundingClientRect(); if (r.height) lb = Math.max(lb, r.bottom); } });
        if ((gx - gr2 * 1.4) < cr.right * DPR && (gy - gr2 - 10 * DPR) < lb * DPR) gy = lb * DPR + gr2 + 16 * DPR;
      }
      if (gx - gr2 > 0 && gx + gr2 < W && gy - gr2 > 0 && gy + gr2 + 20 * DPR < H) {
        var hal = g.createRadialGradient(gx, gy, gr2 * .2, gx, gy, gr2 * 1.5); hal.addColorStop(0, colB(.16 * k)); hal.addColorStop(1, colB(0));
        g.fillStyle = hal; g.beginPath(); g.arc(gx, gy, gr2 * 1.5, 0, TAU); g.fill();
        g.save(); g.shadowColor = C1; g.shadowBlur = 8 * DPR;
        g.strokeStyle = colB(.55 * k); g.lineWidth = DPR;
        g.beginPath(); g.arc(gx, gy, gr2, 0, TAU); g.stroke();
        for (var m = 0; m < 8; m++) { var lo = rot + m * Math.PI / 8, rx = Math.abs(Math.cos(lo)) * gr2; g.strokeStyle = colB((Math.sin(lo) > 0 ? .5 : .18) * k); g.beginPath(); g.ellipse(gx, gy, Math.max(.5, rx), gr2, 0, 0, TAU); g.stroke(); }
        for (var la = -2; la <= 2; la++) { var yy = gy + gr2 * la / 3, rl = Math.sqrt(Math.max(0, gr2 * gr2 - Math.pow(gr2 * la / 3, 2))); g.strokeStyle = colB(.35 * k); g.beginPath(); g.ellipse(gx, yy, rl, rl * .18, 0, 0, TAU); g.stroke(); }
        var bl = (now / 1800) % 1; g.fillStyle = colB((1 - bl) * k); g.beginPath(); g.arc(gx + Math.cos(rot * 3) * gr2 * .5, gy - gr2 * .2, 2.5 * DPR + bl * 6 * DPR, 0, TAU); g.fill();
        g.restore();
        // anneau en orbite incliné et point qui le parcourt
        g.strokeStyle = colB(.45 * k); g.lineWidth = DPR; g.setLineDash([3 * DPR, 4 * DPR]); g.beginPath(); g.ellipse(gx, gy, gr2 * 1.32, gr2 * .38, -.35, 0, TAU); g.stroke(); g.setLineDash([]);
        var oa = now / 1500, ox = gx + Math.cos(oa) * gr2 * 1.32 * Math.cos(-.35) - Math.sin(oa) * gr2 * .38 * Math.sin(-.35), oy = gy + Math.cos(oa) * gr2 * 1.32 * Math.sin(-.35) + Math.sin(oa) * gr2 * .38 * Math.cos(-.35);
        g.fillStyle = colB(.95 * k); g.shadowColor = C1; g.shadowBlur = 10 * DPR; g.beginPath(); g.arc(ox, oy, 2.6 * DPR, 0, TAU); g.fill(); g.shadowBlur = 0;
        g.font = (10 * DPR) + 'px ui-monospace, Consolas, monospace'; g.fillStyle = colB(.7 * k); g.textAlign = 'center'; g.fillText('GÉO · ' + (FJ.S.city || 'LOCAL').toUpperCase().slice(0, 14), gx, gy + gr2 + 16 * DPR);
      }
    }
  }
  function disque2(x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

  /* ---------------- glitch occasionnel ---------------- */
  function glitch() {
    setTimeout(function () {
      var hud = doc.getElementById('hud');
      if (hud && on() && !doc.hidden && !FJ.loop.paused) { hud.classList.add('glitch'); setTimeout(function () { hud.classList.remove('glitch'); }, 280); }
      glitch();
    }, 25000 + Math.random() * 30000);
  }
  glitch();

  /* ---------------- démarrage ---------------- */
  var boot = S.boot !== false && !S.reduce;
  if (boot) {
    var hud = doc.getElementById('hud'), ov = doc.createElement('div');
    ov.id = 'boot'; ov.setAttribute('aria-hidden', 'true');
    var nom = (FJ.aiName ? FJ.aiName() : 'Majordome').toUpperCase();
    var L = ['INITIALISATION DE ' + nom + '…', 'NOYAU VOCAL ............ EN LIGNE', 'CAPTEURS ................ OK', 'MÉTÉO ................... SYNCHRONISATION', 'ACTUALITÉS .............. SYNCHRONISATION', 'INTERFACE ............... PRÊTE'];
    ov.innerHTML = '<div class="bt"></div><div class="bbar"><i></i></div>';
    doc.body.appendChild(ov); if (hud) hud.classList.add('booting');
    var bt = ov.firstChild, li = 0;
    (function ligne() {
      if (li >= L.length) return;
      var p = doc.createElement('p'), s = L[li++], i = 0; bt.appendChild(p);
      (function car() { p.textContent = s.slice(0, ++i); if (i < s.length) setTimeout(car, 12); else setTimeout(ligne, 120); })();
    })();
    setTimeout(function () { if (hud) { hud.classList.remove('booting'); hud.classList.add('boot-in'); } ov.classList.add('fin'); if (gad('hyper')) hyper(); }, 2400);
    setTimeout(function () { ov.remove(); if (hud) hud.classList.remove('boot-in'); boot = false; }, 3600);
  }

  /* ---------------- mode Bureau : plein écran ---------------- */
  function plein() { var d = doc.documentElement; if (!doc.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).catch(function () { }); }
  function sortir() { if (doc.fullscreenElement && doc.exitFullscreen) doc.exitFullscreen().catch(function () { }); }
  FJ.pleinEcran = function () { if (doc.fullscreenElement) sortir(); else plein(); };
  if (FJ.mode !== 'lively') {
    var bar = doc.getElementById('bar'), gear = doc.getElementById('gear');
    if (bar && gear) {
      var bt2 = doc.createElement('button'); bt2.type = 'button'; bt2.id = 'fsBtn'; bt2.className = 'ib'; bt2.title = 'Plein écran (mode Bureau)'; bt2.setAttribute('aria-label', 'Plein écran');
      bt2.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
      bt2.onclick = function () { FJ.pleinEcran(); };
      bar.insertBefore(bt2, gear);
    }
    var premier = function () { doc.removeEventListener('pointerdown', premier, true); doc.removeEventListener('keydown', premier, true); if (S.bureau) plein(); };
    doc.addEventListener('pointerdown', premier, true); doc.addEventListener('keydown', premier, true);
  }

  FJ.fx2 = { pulse: pulse, burst: burst };
})(typeof window !== 'undefined' ? window : globalThis);
