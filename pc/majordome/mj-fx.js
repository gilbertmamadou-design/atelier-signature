/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-fx.js : ne pas modifier ici. */
/* =====================================================================
   Majordome › effets (comme le Fond Jarvis du PC) et bulles éphémères.
   - Effets autour de la sphère : spectre de la voix, atome (électrons), planètes en orbite, ondes de choc,
     éclats, éclairs quand il parle, saut en hyperespace quand il écoute, comètes, constellations.
     Toile fixe derrière l'interface, 30 images/s au plus, arrêtée quand l'appli est cachée.
   - Bulles éphémères : la réponse s'affiche pendant qu'elle est annoncée puis disparaît
     (une question en attente reste affichée jusqu'à la réponse).
   Réglages : Réglages › Effets (S.fxInt : intensité, S.fxG : gadgets, S.bulles : 'ephemeres' | 'garder').
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, S = X.S, save = X.saveS, esc = X.esc, TAU = Math.PI * 2;
  var $ = function (id) { return document.getElementById(id); };
  if (S.fxInt == null) S.fxInt = 70;
  if (!S.fxG) S.fxG = {};
  if (!S.bulles) S.bulles = 'ephemeres';
  if (!S.cases) S.cases = 'annonce';
  if (S.zen == null) S.zen = false;       // « Sphère seule » : la sphère en grand au milieu, rien d'écrit      // cases Heure / Météo / Rendez-vous / Minuteur : 'annonce' (visibles pendant une réponse) | 'toujours'
  var GAD = { hud: 'Anneaux HUD (graduations tournantes)', radar: 'Radar (balayage lent)', spectre: 'Spectre de la voix', atome: 'Atome (électrons)', planetes: 'Planètes en orbite', ondes: 'Ondes de choc et éclats', eclairs: 'Éclairs quand il parle', hyper: 'Hyperespace quand il écoute', cometes: 'Comètes', etoiles: 'Constellations' };
  if (S.fxG.radar == null) S.fxG.radar = false;   // nouveautés : le radar est à activer, les anneaux sont visibles d'emblée
  if (!S.zenInfo) S.zenInfo = { heure: true, meteo: true, rdv: true, maison: true, batterie: false };
  function gad(k) { return S.fxG[k] !== false; }
  function on() { return (+S.fxInt || 0) > 0 && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches && S.fxG.force !== true); }
  function K() { return Math.max(0, Math.min(1, (+S.fxInt || 0) / 100)); }
  var ACC = '70,217,194';
  function lireAcc() { var v = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim(); var m = /^#([0-9a-f]{6})$/i.exec(v); if (m) { var n = parseInt(m[1], 16); ACC = (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255); } }
  lireAcc();
  function col(a) { return 'rgba(' + ACC + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }

  /* ---------------- toile ---------------- */
  var cv = document.createElement('canvas'); cv.id = 'mjfx'; cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none';
  var bg = $('bgfx'); if (bg && bg.parentNode) bg.parentNode.insertBefore(cv, bg.nextSibling); else document.body.insertBefore(cv, document.body.firstChild);
  var g = cv.getContext('2d'), W = 0, H = 0, DPR = 1;
  function size() { DPR = Math.min(2, window.devicePixelRatio || 1); var w = Math.round(innerWidth * DPR), h = Math.round(innerHeight * DPR); if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; etW = 0; } }
  function centre() { var b = $('orbBox'); if (!b) return null; var r = b.getBoundingClientRect(); if (!r.width) return null; return { x: (r.left + r.width / 2) * DPR, y: (r.top + r.height / 2) * DPR, r: Math.max(16, r.width * .37 * DPR) }; }

  /* ---------------- sphère : niveau et états ---------------- */
  var lvl = 0, cible = 0, wrapped = null;
  function wrap() {
    var o = MJ.orb; if (!o || wrapped === o) return; wrapped = o;
    ['level', 'voice'].forEach(function (m) { var f = o[m]; if (typeof f === 'function') o[m] = function (v) { cible = Math.max(0, Math.min(1, +v || 0)); return f.apply(o, arguments); }; });
    var st = o.state;
    if (typeof st === 'function') o.state = function (s) {
      var prev = o.get ? o.get() : null, r = st.apply(o, arguments);
      if (s && s !== prev) {
        if (s === 'listen') { pulse(1, 1.2); if (gad('hyper')) hyper(); }
        else if (s === 'think') pulse(.6, .8);
        else if (s === 'speak') { pulse(.9, 1); burst(36); }
        else if (s === 'error') pulse(1, 1, '255,92,115');
        if (s === 'idle') cible = 0;
        kick();
      }
      return r;
    };
  }

  var waves = [], parts = [], eclairs = [], streaks = [], comete = null, nextC = performance.now() + 9000, etoiles = [], liens = [], etW = 0;
  function pulse(f, v, rgb) { if (!on() || !gad('ondes')) return; waves.push({ t0: performance.now(), f: f, v: v, rgb: rgb }); if (waves.length > 6) waves.shift(); }
  function burst(n) { if (!on() || !gad('ondes')) return; var c = centre(); if (!c) return; for (var i = 0; i < Math.round(n * K()); i++) { var a = Math.random() * TAU, s = (1 + Math.random() * 2.6) * DPR; parts.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 1, d: .015 + Math.random() * .02 }); } if (parts.length > 200) parts.splice(0, parts.length - 200); }
  function hyper() { if (!on()) return; var t = performance.now(); for (var i = 0; i < 90; i++) streaks.push({ a: Math.random() * TAU, d: Math.random() * .3, v: .6 + Math.random() * 1.4, t0: t }); }
  function constellations() { etoiles = []; liens = []; var s = 777, rnd = function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (var i = 0; i < 55; i++) etoiles.push({ x: rnd() * W, y: rnd() * H, r: (rnd() < .15 ? 1.5 : .8) * DPR, p: rnd() * TAU }); for (var a = 0; a < etoiles.length; a++) for (var b = a + 1; b < etoiles.length; b++) { var dx = etoiles[a].x - etoiles[b].x, dy = etoiles[a].y - etoiles[b].y; if (dx * dx + dy * dy < Math.pow(80 * DPR, 2) && rnd() < .5) liens.push([a, b]); } etW = W; }
  var PL = [{ o: 1.9, t: .3, v: .00022, p: 0, s: 4, c: ['#ffd9a0', '#c8782e'] }, { o: 2.25, t: .28, v: -.00015, p: 2.1, s: 6, c: ['#bfe6ff', '#2b6fd6'], lune: 1 }, { o: 2.65, t: .26, v: .00011, p: 4, s: 7.5, c: ['#fff0c8', '#c9a15a'], anneau: 1 }];

  function draw(now) {
    wrap(); size(); g.clearRect(0, 0, W, H);
    if (!on() || (S.avatar === 'visage' && !S.faceDeco)) return;   // visage seul : pas de décor autour
    var c = centre(); if (!c) return;
    var k = K(); lvl += (cible - lvl) * .25;
    if (gad('etoiles')) {
      if (etW !== W) constellations();
      g.strokeStyle = col(.07 * k); g.lineWidth = DPR * .7; g.beginPath(); liens.forEach(function (l) { g.moveTo(etoiles[l[0]].x, etoiles[l[0]].y); g.lineTo(etoiles[l[1]].x, etoiles[l[1]].y); }); g.stroke();
      etoiles.forEach(function (e) { g.fillStyle = 'rgba(220,240,255,' + ((.35 + .65 * Math.abs(Math.sin(now / 900 + e.p))) * .5 * k).toFixed(3) + ')'; g.beginPath(); g.arc(e.x, e.y, e.r, 0, TAU); g.fill(); });
    }
    if (gad('cometes')) {
      if (!comete && now > nextC) { var gch = Math.random() < .5; comete = { t0: now, x0: gch ? -40 * DPR : W + 40 * DPR, y0: Math.random() * H * .45, vx: (gch ? 1 : -1) * (.35 + Math.random() * .3) * DPR, vy: (.1 + Math.random() * .15) * DPR }; nextC = now + 18000 + Math.random() * 22000; }
      if (comete) { var dt0 = now - comete.t0, cx = comete.x0 + comete.vx * dt0, cy = comete.y0 + comete.vy * dt0; if (cx < -150 * DPR || cx > W + 150 * DPR || cy > H) comete = null; else { var tx = cx - comete.vx * 200, ty = cy - comete.vy * 200, gq = g.createLinearGradient(cx, cy, tx, ty); gq.addColorStop(0, 'rgba(255,255,255,' + (.9 * k).toFixed(3) + ')'); gq.addColorStop(.2, col(.45 * k)); gq.addColorStop(1, col(0)); g.strokeStyle = gq; g.lineWidth = 2.4 * DPR; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 2 * DPR, 0, TAU); g.fill(); } }
    }
    if (gad('hud') || gad('radar')) {
      var RM = Math.min(W, H) / 2 - 10 * DPR, RH = Math.min(c.r * 1.6, RM), sp2 = lvl > .02 ? 1 + lvl * 3 : 1;
      if (gad('radar')) {
        var ang = (now / 4200) % 1 * TAU, rr = Math.min(c.r * 1.45, RM);
        for (var sw = 0; sw < 24; sw++) { var a1 = ang - sw * .035; g.strokeStyle = col((1 - sw / 24) * .22 * k); g.lineWidth = 2 * DPR; g.beginPath(); g.moveTo(c.x + Math.cos(a1) * c.r * 1.02, c.y + Math.sin(a1) * c.r * 1.02); g.lineTo(c.x + Math.cos(a1) * rr, c.y + Math.sin(a1) * rr); g.stroke(); }
        g.strokeStyle = col(.1 * k); g.lineWidth = DPR; [1.15, 1.3].forEach(function (f) { if (c.r * f < RM) { g.beginPath(); g.arc(c.x, c.y, c.r * f, 0, TAU); g.stroke(); } });
      }
      if (gad('hud')) {
        var rot = now / 26000 * sp2;
        g.lineWidth = DPR;
        for (var tk = 0; tk < 120; tk++) { var at = tk / 120 * TAU + rot, lg = tk % 10 === 0 ? 9 : tk % 5 === 0 ? 6 : 3; g.strokeStyle = col((tk % 10 === 0 ? .45 : .22) * k); g.beginPath(); g.moveTo(c.x + Math.cos(at) * RH, c.y + Math.sin(at) * RH); g.lineTo(c.x + Math.cos(at) * (RH - lg * DPR), c.y + Math.sin(at) * (RH - lg * DPR)); g.stroke(); }
        var R2 = RH * .94, rot2 = -now / 15000 * sp2; g.lineWidth = 2.4 * DPR; g.lineCap = 'butt';
        [[0, .9], [1.15, 1.6], [2.2, 3.4], [3.7, 3.85], [4.3, 5.6]].forEach(function (s2) { g.strokeStyle = col(.3 * k); g.beginPath(); g.arc(c.x, c.y, R2, s2[0] + rot2, s2[1] + rot2); g.stroke(); });
        var R3 = RH * 1.035; g.lineWidth = DPR; g.setLineDash([1 * DPR, 5 * DPR]); g.strokeStyle = col(.25 * k); g.beginPath(); g.arc(c.x, c.y, Math.min(R3, RM), 0, TAU); g.stroke(); g.setLineDash([]);
        var am = now / 7000 * sp2; g.fillStyle = col(.8 * k); g.beginPath(); g.arc(c.x + Math.cos(am) * R2, c.y + Math.sin(am) * R2, 2.6 * DPR, 0, TAU); g.fill();
        g.lineCap = 'round';
      }
    }
    if (streaks.length) for (var i = streaks.length - 1; i >= 0; i--) { var q = streaks[i], dt = (now - q.t0) / 1000; if (dt > 1.2) { streaks.splice(i, 1); continue; } var d0 = c.r * (1.1 + (q.d + dt * dt * 3.2 * q.v) * 5), d1 = d0 + c.r * (.2 + dt * 2.2 * q.v); g.strokeStyle = 'rgba(230,250,255,' + ((1 - dt / 1.2) * .8).toFixed(3) + ')'; g.lineWidth = (1 + dt * 1.6) * DPR; g.beginPath(); g.moveTo(c.x + Math.cos(q.a) * d0, c.y + Math.sin(q.a) * d0); g.lineTo(c.x + Math.cos(q.a) * d1, c.y + Math.sin(q.a) * d1); g.stroke(); }
    if (gad('planetes')) {
      g.setLineDash([2 * DPR, 8 * DPR]); g.lineWidth = DPR; PL.forEach(function (p) { g.strokeStyle = col(.12 * k); g.beginPath(); g.ellipse(c.x, c.y, c.r * p.o, c.r * p.o * p.t, 0, 0, TAU); g.stroke(); }); g.setLineDash([]);
      PL.map(function (p) { var a = p.p + now * p.v; return { p: p, x: c.x + Math.cos(a) * c.r * p.o, y: c.y + Math.sin(a) * c.r * p.o * p.t, dv: Math.sin(a) > 0 }; }).sort(function (a, b) { return a.y - b.y; }).forEach(function (o) {
        var s = o.p.s * DPR * (o.dv ? 1.1 : .8), gr = g.createRadialGradient(o.x - s * .35, o.y - s * .35, s * .1, o.x, o.y, s); gr.addColorStop(0, o.p.c[0]); gr.addColorStop(1, o.p.c[1]); g.globalAlpha = o.dv ? 1 : .55;
        if (o.p.anneau) { g.strokeStyle = 'rgba(240,220,170,.75)'; g.lineWidth = 1.3 * DPR; g.beginPath(); g.ellipse(o.x, o.y, s * 2.1, s * .55, -.35, Math.PI, TAU); g.stroke(); }
        g.fillStyle = gr; g.beginPath(); g.arc(o.x, o.y, s, 0, TAU); g.fill();
        if (o.p.anneau) { g.beginPath(); g.ellipse(o.x, o.y, s * 2.1, s * .55, -.35, 0, Math.PI); g.stroke(); }
        if (o.p.lune) { var al = now * .0013; g.fillStyle = '#e8eef5'; g.beginPath(); g.arc(o.x + Math.cos(al) * s * 2.3, o.y + Math.sin(al) * s, 1.6 * DPR, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
      });
    }
    if (gad('spectre')) {
      var N = 64, R0 = c.r * 1.3, act = lvl > .02; g.lineCap = 'round'; g.lineWidth = Math.max(1, 1.6 * DPR * c.r / (110 * DPR));
      for (var j = 0; j < N; j++) { var a = j / N * TAU + (act ? 0 : now / 9000), b = act ? lvl * (.35 + .65 * Math.abs(Math.sin(j * 1.7 + now / 90) * Math.cos(j * .37 - now / 170))) : .04 + .03 * Math.sin(j * .5 + now / 600), L = (3 + b * c.r * .4) * k + 1.5 * DPR; g.strokeStyle = col((act ? .35 + .6 * b : .22) * k); g.beginPath(); g.moveTo(c.x + Math.cos(a) * R0, c.y + Math.sin(a) * R0); g.lineTo(c.x + Math.cos(a) * (R0 + L), c.y + Math.sin(a) * (R0 + L)); g.stroke(); }
    }
    if (gad('atome')) [0, Math.PI / 3, -Math.PI / 3].forEach(function (tilt, n) {
      var R1 = c.r * 1.38, R2 = R1 * .32; g.strokeStyle = col(.2 * k); g.lineWidth = DPR; g.beginPath(); g.ellipse(c.x, c.y, R1, R2, tilt, 0, TAU); g.stroke();
      for (var e = 0; e < 12; e++) { var an = now * .0032 * (n % 2 ? -1 : 1) + n * 2.1 - e * .08, ex = Math.cos(an) * R1, ey = Math.sin(an) * R2, x = c.x + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = c.y + ex * Math.sin(tilt) + ey * Math.cos(tilt);
        if (!e) { var gl = g.createRadialGradient(x, y, 0, x, y, 7 * DPR); gl.addColorStop(0, 'rgba(255,255,255,' + (.95 * k).toFixed(3) + ')'); gl.addColorStop(.35, col(.8 * k)); gl.addColorStop(1, col(0)); g.fillStyle = gl; g.beginPath(); g.arc(x, y, 7 * DPR, 0, TAU); g.fill(); }
        else { g.fillStyle = col(.5 * (1 - e / 12) * k); g.beginPath(); g.arc(x, y, 1.6 * DPR * (1 - e / 14), 0, TAU); g.fill(); } }
    });
    if (gad('eclairs')) {
      if (lvl > .35 && Math.random() < lvl * .3 && eclairs.length < 3) { var a0 = Math.random() * TAU, pts = [], r0 = c.r * 1.02, r1 = c.r * (1.4 + Math.random() * .4); for (var z = 0; z <= 6; z++) { var rr = r0 + (r1 - r0) * z / 6, aa = a0 + (z && z < 6 ? (Math.random() - .5) * .22 : 0); pts.push(c.x + Math.cos(aa) * rr, c.y + Math.sin(aa) * rr); } eclairs.push({ p: pts, t0: now }); }
      for (var y2 = eclairs.length - 1; y2 >= 0; y2--) { var E = eclairs[y2], de = (now - E.t0) / 160; if (de > 1) { eclairs.splice(y2, 1); continue; } g.strokeStyle = 'rgba(235,252,255,' + ((1 - de) * .95).toFixed(3) + ')'; g.lineWidth = 1.4 * DPR; g.shadowColor = col(1); g.shadowBlur = 10 * DPR; g.beginPath(); for (var u = 0; u < E.p.length; u += 2) g[u ? 'lineTo' : 'moveTo'](E.p[u], E.p[u + 1]); g.stroke(); g.shadowBlur = 0; }
    }
    for (var w = waves.length - 1; w >= 0; w--) { var q2 = waves[w], dt2 = (now - q2.t0) / 1000, r2 = c.r * (1.05 + dt2 * 1.7 * q2.v), al2 = (1 - dt2 / 1.3) * .7 * q2.f * k; if (al2 <= 0) { waves.splice(w, 1); continue; } g.strokeStyle = q2.rgb ? 'rgba(' + q2.rgb + ',' + al2.toFixed(3) + ')' : col(al2); g.lineWidth = (2.6 - dt2 * 1.5) * DPR + .5; g.beginPath(); g.arc(c.x, c.y, r2, 0, TAU); g.stroke(); }
    for (var p = parts.length - 1; p >= 0; p--) { var o2 = parts[p]; o2.x += o2.vx; o2.y += o2.vy; o2.vx *= .985; o2.vy *= .985; o2.l -= o2.d; if (o2.l <= 0) { parts.splice(p, 1); continue; } g.fillStyle = col(o2.l * .9 * k); g.fillRect(o2.x - DPR, o2.y - DPR, 2 * DPR, 2 * DPR); }
  }
  /* boucle à 30 images/s au plus, arrêtée quand l'appli est cachée */
  var raf = 0, last = 0;
  function loop(t) { raf = 0; if (document.hidden) return; if (t - last >= 32) { last = t; try { draw(t); } catch (e) { } } if (on()) raf = requestAnimationFrame(loop); else g.clearRect(0, 0, W, H); }
  function kick() { if (!raf && !document.hidden) raf = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lireAcc(); kick(); } });
  window.addEventListener('resize', function () { size(); });
  kick();

  /* ---------------- bulles éphémères ---------------- */
  var cards = $('cards'), suivi = null;
  function interactive(c) { return !!c.querySelector('button,input,select,textarea,a[href]'); }
  function fondre(c) { if (!c || !c.parentNode || c.classList.contains('fx-out')) return; c.classList.add('fx-out'); setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 450); }
  function suivre(groupe) {
    var c = groupe[groupe.length - 1];
    clearInterval(suivi); var t0 = Date.now(), parle = false, fin = 0;
    suivi = setInterval(function () {
      if (!c.parentNode) return clearInterval(suivi);
      var sp = false; try { sp = X.speaking(); } catch (e) { }
      if (sp && Date.now() - t0 < 45000) { parle = true; fin = 0; return; }   // au-delà de 45 s : on efface quand même
      if (!fin) fin = Date.now();
      var d = Date.now() - t0, lu = Math.min(20000, 6000 + groupe.reduce(function (n, x) { return n + (x.textContent || '').length; }, 0) * 60);
      // annoncée : 4 s après la fin de la voix (au moins 6 s) ; sans voix : le temps de lire
      if (d > (parle ? 6000 : lu) && (!parle || Date.now() - fin > 4000)) { clearInterval(suivi); groupe.forEach(fondre); parleOff(); }
    }, 400);
  }
  if (cards) new MutationObserver(function (ml) {
    var neuves = [];
    ml.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1 && n.classList.contains('card')) neuves.push(n); }); });
    if (!neuves.length) return;
    if (S.bulles !== 'ephemeres') { parleOn(); clearTimeout(parleT); parleT = setTimeout(function () { document.documentElement.classList.remove('mj-parle'); }, 15000); return; }
    Array.prototype.forEach.call(cards.children, function (x) { if (neuves.indexOf(x) < 0) fondre(x); });
    parleOn();
    if (!neuves.some(interactive)) suivre(neuves); else clearInterval(suivi);
  }).observe(cards, { childList: true });
  var st = document.createElement('style');
  st.textContent = '#cards .card.fx-out{opacity:0;transform:translateY(-8px) scale(.97);transition:opacity .4s,transform .4s}' +
    'html.mj-ephem #last{display:none!important}' +
    'html.mj-cases #moment{max-height:0;opacity:0;margin-top:0!important;margin-bottom:0!important;overflow:hidden;pointer-events:none;transition:max-height .45s ease,opacity .35s ease,margin .45s}' +
    'html.mj-cases.mj-parle #moment{max-height:320px;opacity:1;pointer-events:auto}' +
    /* sphère seule */
    'html.mj-zen #topbar,html.mj-zen #who,html.mj-zen #status,html.mj-zen #heard,html.mj-zen #rts,html.mj-zen #moment,html.mj-zen footer,html.mj-zen #dock,html.mj-zen #hint,html.mj-zen #last{display:none!important}' +
    'html.mj-zen #orbBox{position:fixed!important;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,82vh,720px)!important;margin:0!important;z-index:1}' +
    'html.mj-zen #orbBox.visage{width:min(100vw,92vh,1000px)!important}' +
    'html.mj-zen #side{position:fixed;left:12px;right:12px;bottom:calc(14px + var(--safe-b,0px));z-index:3;max-height:38vh;overflow:auto;pointer-events:auto}' +
    'html.mj-zen #side .card{backdrop-filter:blur(8px);background:rgb(8 16 24 / .78)}' +
    'html.mj-zen #side .card.q{display:none}' +
    'html.mj-zen #timers{position:fixed;top:calc(10px + var(--safe-t,0px));left:0;right:0;z-index:3}' +
    '#zenUi{position:fixed;top:calc(12px + var(--safe-t,0px));right:12px;z-index:5;display:flex;gap:8px;opacity:0;pointer-events:none;transition:opacity .3s}' +
    '#zenUi.on{opacity:1;pointer-events:auto}#zenUi button{border:1px solid rgb(255 255 255 / .2);background:rgb(8 16 24 / .8);color:#e8f6ff;border-radius:999px;padding:9px 14px;font:600 14px system-ui}' +
    'html:not(.mj-zen) #zenUi{display:none}' +
    '#zenHud{display:none}html.mj-zen #zenHud{display:block;position:fixed;inset:0;z-index:2;pointer-events:none;font-family:var(--mono,monospace)}' +
    '#zenHud .zh{position:absolute;max-width:44vw;color:var(--tx,#e9f4f6);transition:opacity .4s}#zenHud .zh:empty{display:none}' +
    '#zenHud .zh i{display:block;font-style:normal;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc);opacity:.85;margin-bottom:3px}' +
    '#zenHud .zh b{display:block;font-weight:600;font-size:17px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#zenHud .zh span{display:block;font-size:11.5px;color:var(--tx2);margin-top:2px}#zenHud .bl b,#zenHud .br b{font-size:15px;white-space:normal}' +
    '#zenHud .zh::before{content:"";position:absolute;width:14px;height:14px;border-color:var(--acc);opacity:.55;border-style:solid;border-width:0}' +
    '#zenHud .tl{top:calc(16px + var(--safe-t,0px));left:18px;padding:6px 0 0 10px}#zenHud .tl::before{top:0;left:0;border-top-width:1.5px;border-left-width:1.5px}#zenHud .tl b{font-size:30px;letter-spacing:.04em}' +
    '#zenHud .tr{top:calc(16px + var(--safe-t,0px));right:18px;text-align:right;padding:6px 10px 0 0}#zenHud .tr::before{top:0;right:0;border-top-width:1.5px;border-right-width:1.5px}' +
    '#zenHud .bl{bottom:calc(18px + var(--safe-b,0px));left:18px;padding:0 0 6px 10px}#zenHud .bl::before{bottom:0;left:0;border-bottom-width:1.5px;border-left-width:1.5px}' +
    '#zenHud .br{bottom:calc(18px + var(--safe-b,0px));right:18px;text-align:right;padding:0 10px 6px 0}#zenHud .br::before{bottom:0;right:0;border-bottom-width:1.5px;border-right-width:1.5px}' +
    'html.mj-zen.mj-parle #zenHud .bl,html.mj-zen.mj-parle #zenHud .br{opacity:0}html.mj-zen #zenUi.on~#zenHud .tr{opacity:0}';
  /* sphère seule : un toucher hors de la sphère montre 5 s les boutons Réglages et Quitter */
  var zui = document.createElement('div'); zui.id = 'zenUi';
  zui.innerHTML = '<button type="button" data-z="set">Réglages</button><button type="button" data-z="out">Quitter « sphère seule »</button>';
  document.body.appendChild(zui);
  var zT = 0;
  zui.onclick = function (e) { var b = e.target.closest('[data-z]'); if (!b) return; zui.classList.remove('on'); if (b.dataset.z === 'set') { var bs = $('bSet'); if (bs) bs.click(); } else { S.zen = false; save(); applyBulles(); } };
  document.addEventListener('pointerdown', function (e) {
    if (!S.zen || e.target.closest('#orbBox,#zenUi,#side,.sheet,#drawer,#veil')) return;
    zui.classList.add('on'); clearTimeout(zT); zT = setTimeout(function () { zui.classList.remove('on'); }, 5000);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen && !window.MAGPrint) document.documentElement.requestFullscreen().catch(function () { });
  }, true);
  /* sphère seule : infos discrètes dans les coins (heure, météo, rendez-vous, maison, batterie), Réglages › Effets */
  var hud = document.createElement('div'); hud.id = 'zenHud'; hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = '<div class="zh tl" data-zh="heure"></div><div class="zh tr" data-zh="meteo"></div><div class="zh bl" data-zh="rdv"></div><div class="zh br" data-zh="maison"></div>';
  document.body.appendChild(hud);
  var batt = null;
  function battTxt() {
    try { var P = X.P; if (P && P.homeBattery) { var bj = X.J(P.homeBattery(), {}); if (bj && bj.level >= 0) return bj.level + ' %' + (bj.plugged ? ' ⚡' : ''); } } catch (e) { }
    if (batt) return Math.round(batt.level * 100) + ' %' + (batt.charging ? ' ⚡' : '');
    if (navigator.getBattery && batt === null) { batt = false; navigator.getBattery().then(function (b) { batt = b; }).catch(function () { }); }
    return '';
  }
  function zh(k, lab, big, sub) { return '<i>' + esc(lab) + '</i>' + (big ? '<b>' + esc(big) + '</b>' : '') + (sub ? '<span>' + esc(sub) + '</span>' : ''); }
  /* météo de la sphère seule : relue toutes les 30 min (Open-Meteo, comme « quel temps fait-il »), sans attendre qu'on la demande */
  var wxTry = 0;
  function meteoFraiche() {
    var c = X.lsGet(X.KEY.wx, null), age = c && c.at ? Date.now() - c.at : Infinity;
    if (age < 30 * 60000 || Date.now() - wxTry < 10 * 60000 || !X.weatherData) return;
    wxTry = Date.now();
    X.weatherData().then(function () { if (MJ.moment) MJ.moment(); hudPaint(); }, function () { });
  }
  function hudPaint() {
    if (!S.zen) return;
    var I = S.zenInfo || {}, cells = MJ.momentCells ? MJ.momentCells() : [], cell = function (k) { return cells.filter(function (x) { return x.k === k; })[0]; };
    var d = new Date(), box = function (k) { return hud.querySelector('[data-zh="' + k + '"]'); };
    box('heure').innerHTML = I.heure ? zh('heure', d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), '') : '';
    var real = function (x) { return x && !/^Touchez/.test(x.s || ''); };
    if (I.meteo) meteoFraiche();
    var wx = cell('wx'); box('meteo').innerHTML = I.meteo && real(wx) ? zh('meteo', wx.l, wx.b, wx.s) : '';
    var ev = cell('ev'); box('rdv').innerHTML = I.rdv && real(ev) ? zh('rdv', ev.l, ev.b, ev.s) : '';
    var lines = [];
    if (I.maison) {
      var li = MJ.lightsSummary ? MJ.lightsSummary() : null;
      if (li && li.paired && li.total != null) lines.push(li.on ? li.on + ' lumière' + (li.on > 1 ? 's' : '') + ' allumée' + (li.on > 1 ? 's' : '') : 'Lumières éteintes');
      var sm = MJ.somfy && MJ.somfy.model && MJ.somfy.model();
      if (sm && sm.devs && sm.devs.length) { var kn = sm.devs.filter(function (x) { return x.closure != null || x.oc; }), fe = kn.filter(function (x) { return x.closure != null ? x.closure >= 98 : x.oc === 'closed'; }).length; if (kn.length) lines.push(fe === kn.length ? 'Volets fermés' : fe ? fe + ' volet' + (fe > 1 ? 's' : '') + ' fermé' + (fe > 1 ? 's' : '') + ' sur ' + kn.length : 'Volets ouverts'); }
    }
    if (I.batterie) { var bt = battTxt(); if (bt) lines.push('Batterie ' + bt); }
    box('maison').innerHTML = lines.length ? zh('maison', I.maison ? 'Maison' : 'Téléphone', lines[0], lines.slice(1).join(' · ')) : '';
  }
  setInterval(function () { if (S.zen && !document.hidden) hudPaint(); }, 10000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) hudPaint(); });
  var parleT = 0;
  function parleOn() { clearTimeout(parleT); document.documentElement.classList.add('mj-parle'); }
  function parleOff() { clearTimeout(parleT); parleT = setTimeout(function () { if (!cards.querySelector('.card:not(.fx-out)')) document.documentElement.classList.remove('mj-parle'); }, 300); }
  document.head.appendChild(st);
  /** Sphère seule depuis un bouton, le raccourci de l'écran d'accueil ({zen:1}) ou la voix */
  MJ.setZen = function (on) { S.zen = on == null ? !S.zen : !!on; save(); applyBulles(); var x = $('shX'); if (S.zen && x) x.click(); return S.zen; };
  var bZen = $('bZen'); if (bZen) bZen.onclick = function () { MJ.setZen(true); };
  try { if (X.B && X.B.zenShortcut) X.B.zenShortcut(false); } catch (e) { }   // appui long sur l'icône : « Sphère seule »
  function applyBulles() { var r = document.documentElement; r.classList.toggle('mj-ephem', S.bulles === 'ephemeres'); r.classList.toggle('mj-cases', S.cases === 'annonce'); r.classList.toggle('mj-zen', !!S.zen); if (S.zen) setTimeout(hudPaint, 50); setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 60); }
  applyBulles();

  /* ---------------- réglages ---------------- */
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () {
    return (prevExtra ? prevExtra() : '') + '<div class="sect" id="f-effets">Effets et bulles</div>' +
      '<div class="set"><div class="t">Bulles de réponse<small>Éphémères : la réponse s\'affiche pendant qu\'elle est annoncée, puis disparaît</small></div><select class="in" id="sFxB" style="width:auto"><option value="ephemeres"' + (S.bulles === 'ephemeres' ? ' selected' : '') + '>Éphémères</option><option value="garder"' + (S.bulles !== 'ephemeres' ? ' selected' : '') + '>Gardées</option></select></div>' +
      '<div class="set"><div class="t">Sphère seule<small>La sphère en grand au milieu de l\'écran, rien d\'écrit. Touchez la sphère pour parler ; touchez à côté pour Réglages ou Quitter</small></div><label class="sw"><input type="checkbox" id="sFxZ"' + (S.zen ? ' checked' : '') + '><span></span></label></div>' +
      (X.B && X.B.zenShortcut ? '<div class="set"><div class="t">Raccourci « Sphère seule »<small>Une icône sur l\'écran d\'accueil qui ouvre directement la sphère seule (aussi par appui long sur l\'icône)</small></div><button class="btn sm" id="sFxZpin">Ajouter</button></div>' : '') +
      '<div class="set"><div class="t">Infos en « sphère seule »<small>Discrètes, dans les coins de l\'écran</small></div></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
      [['heure', 'Heure et date'], ['meteo', 'Météo'], ['rdv', 'Prochain rendez-vous'], ['maison', 'Lumières et volets'], ['batterie', 'Batterie']].map(function (z) { return '<button class="btn sm' + (S.zenInfo[z[0]] ? ' pri' : '') + '" data-zi="' + z[0] + '">' + z[1] + '</button>'; }).join('') + '</div>' +
      '<div class="set"><div class="t">Cases Heure, Météo, Rendez-vous, Minuteur<small>« Pendant une réponse » : cachées, elles apparaissent quand il vous répond</small></div><select class="in" id="sFxC" style="width:auto"><option value="annonce"' + (S.cases === 'annonce' ? ' selected' : '') + '>Pendant une réponse</option><option value="toujours"' + (S.cases !== 'annonce' ? ' selected' : '') + '>Toujours</option></select></div>' +
      '<div class="set"><div class="t">Intensité des effets<small>0 : aucun effet (économise la batterie)</small></div><input type="range" id="sFxI" min="0" max="100" step="5" value="' + (+S.fxInt || 0) + '"></div>' +
      Object.keys(GAD).map(function (k) { return '<div class="set"><div class="t">' + esc(GAD[k]) + '</div><label class="sw"><input type="checkbox" data-fxg="' + k + '"' + (gad(k) ? ' checked' : '') + '><span></span></label></div>'; }).join('');
  };
  MJ.settingsBind = function (b) {
    if (prevBind) prevBind(b);
    var bb = $('sFxB'); if (bb) bb.onchange = function () { S.bulles = this.value; save(); applyBulles(); };
    var bz = $('sFxZ'); if (bz) bz.onchange = function () { S.zen = this.checked; save(); applyBulles(); if (S.zen) { var x = $('shX'); if (x) x.click(); } };
    var bp = $('sFxZpin'); if (bp) bp.onclick = function () { var B = X.B; if (!(B && B.zenShortcut && B.zenShortcut(true))) X.toast('Votre écran d\'accueil ne permet pas d\'ajouter ce raccourci : faites un appui long sur l\'icône de ' + (S.name || 'Majordome')); };
    document.querySelectorAll('[data-zi]').forEach(function (z) { z.onclick = function () { S.zenInfo[z.dataset.zi] = !S.zenInfo[z.dataset.zi]; z.classList.toggle('pri', !!S.zenInfo[z.dataset.zi]); save(); hudPaint(); }; });
    var bc = $('sFxC'); if (bc) bc.onchange = function () { S.cases = this.value; save(); applyBulles(); };
    var fi = $('sFxI'); if (fi) fi.oninput = function () { S.fxInt = +this.value; save(); kick(); };
    document.querySelectorAll('[data-fxg]').forEach(function (i) { i.onchange = function () { S.fxG[i.dataset.fxg] = i.checked; save(); if (i.dataset.fxg === 'hyper' && i.checked) hyper(); kick(); }; });
  };
  MJ.fx = { pulse: pulse, burst: burst, hyper: hyper };
})();
