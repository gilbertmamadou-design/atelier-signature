/* COPIE GÉNÉRÉE par pc/build-pc.py depuis pc/shared/fond-jarvis/fj-fx2.js : ne pas modifier ici. */
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
  function K() { return Math.max(0, Math.min(1, (S.fx || 0) / 100)); }
  function col(a) { var c = getComputedStyle(doc.documentElement).getPropertyValue('--c').trim().split(/\s+/).map(Number); if (c.length < 3 || isNaN(c[0])) c = [63, 224, 255]; return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }
  var C1 = col(1), cT = 0;
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
        if (s === 'listen') pulse(1, 1.2);
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
    cols.forEach(function (q) {
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
    // satellites avec traînée
    SAT.forEach(function (s) {
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
    setTimeout(function () { if (hud) { hud.classList.remove('booting'); hud.classList.add('boot-in'); } ov.classList.add('fin'); }, 2400);
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
