/* =====================================================================
   Fond Jarvis : animation du HUD.
   - FJ.loop : une seule boucle d'images pour toute la page, plafonnée (30 images/s
     par défaut, moins sur batterie), arrêtée quand la page est cachée ou que Lively
     met le fond en pause. requestAnimationFrame est redirigé vers cette boucle :
     la sphère de Majordome (mj-orb.js, inchangée) suit donc le même plafond.
   - FJ.hud : fond fixe (grille, vignettage, lignes de circuits vers les panneaux,
     redessiné seulement quand la mise en page change) et calque animé (anneaux
     gradués qui tournent, balayage, impulsions qui courent sur les circuits,
     poussières). Anneaux pré-dessinés une fois (images), seulement tournés ensuite.
   ===================================================================== */
(function (root) {
  'use strict';
  var FJ = root.FJ = root.FJ || {};
  var doc = document;
  var TAU = Math.PI * 2;

  /* ---------------- Boucle d'images plafonnée ---------------- */
  var nRAF = root.requestAnimationFrame.bind(root), nCAF = root.cancelAnimationFrame.bind(root);
  var queue = new Map(), qid = 0, rafId = 0, waitT = 0, lastT = 0;
  var L = FJ.loop = {
    fps: 30, paused: false, frames: 0, draws: [],
    setFps: function (f) { L.fps = Math.max(1, Math.min(60, f | 0)); },
    setPaused: function (p) {
      p = !!p; if (p === L.paused) return;
      L.paused = p; doc.documentElement.classList.toggle('fj-paused', p);
      if (p) stop(); else { lastT = 0; kick(); }
      L.onPause && L.onPause(p);
    },
    add: function (fn, cond) { L.draws.push({ fn: fn, cond: cond }); kick(); },
    kick: function () { kick(); },
    running: function () { return !!(rafId || waitT); }
  };
  root.requestAnimationFrame = function (cb) { var id = ++qid; queue.set(id, cb); kick(); return id; };
  root.cancelAnimationFrame = function (id) { queue.delete(id); };
  function blocked() { return L.paused || doc.hidden; }
  function stop() { if (rafId) nCAF(rafId); if (waitT) clearTimeout(waitT); rafId = waitT = 0; }
  function want() { if (queue.size) return true; for (var i = 0; i < L.draws.length; i++) if (!L.draws[i].cond || L.draws[i].cond()) return true; return false; }
  function kick() { if (rafId || waitT || blocked() || !want()) return; rafId = nRAF(tick); }
  function tick(now) {
    rafId = 0;
    if (blocked()) return;
    var min = 1000 / L.fps, el = now - lastT;
    if (lastT && el < min - 1.5) {           // trop tôt : on attend sans réveiller le compositeur à chaque image
      waitT = setTimeout(function () { waitT = 0; if (!blocked()) rafId = nRAF(tick); }, Math.max(0, min - el - 4));
      return;
    }
    lastT = now; L.frames++;
    var cbs = Array.from(queue.values()); queue.clear();
    for (var i = 0; i < cbs.length; i++) { try { cbs[i](now); } catch (e) { console.error(e); } }
    for (var j = 0; j < L.draws.length; j++) { var dr = L.draws[j]; if (dr.cond && !dr.cond()) continue; try { dr.fn(now); } catch (e2) { console.error(e2); } }
    kick();
  }
  doc.addEventListener('visibilitychange', function () { if (doc.hidden) stop(); else { lastT = 0; kick(); } });

  /* ---------------- Couleurs du thème ---------------- */
  function rgbVar(name, d) {
    var v = getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
    var m = v.split(/[\s,]+/).map(Number);
    return m.length >= 3 && m.every(isFinite) ? m.slice(0, 3) : d;
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }

  /* ---------------- HUD ---------------- */
  var H = FJ.hud = { intensity: 0.7, reduce: false, rings: true, circuits: true, dust: true };
  // trois calques : fond fixe (bg, plein écran, redessiné à la mise en page), anneaux tournants (rg, limité à la scène),
  // impulsions (fx, plein écran mais effacé seulement là où une impulsion est passée)
  var bg = doc.getElementById('bg'), fx = doc.getElementById('fx');
  var rg = doc.createElement('canvas'); rg.id = 'rg'; rg.setAttribute('aria-hidden', 'true'); fx.parentNode.insertBefore(rg, fx);
  var bctx = bg.getContext('2d'), fctx = fx.getContext('2d'), rctx = rg.getContext('2d'), RB = { x: 0, y: 0, s: 1 }, dirty = [];
  var W = 0, Hh = 0, dpr = 1, C = [63, 224, 255], C2 = [120, 160, 255], stage = null, paths = [], pulses = [], dust = [], sprites = [], t0 = performance.now(), lastDraw = 0;

  function size() {
    dpr = Math.min(root.devicePixelRatio || 1, 2);
    W = Math.max(1, root.innerWidth); Hh = Math.max(1, root.innerHeight);
    [bg, fx].forEach(function (c) { c.width = Math.round(W * dpr); c.height = Math.round(Hh * dpr); c.style.width = W + 'px'; c.style.height = Hh + 'px'; });
  }

  /* anneaux pré-dessinés (rayon relatif au demi-côté de la scène) */
  function makeSprites(R) {
    sprites = [];
    var defs = [
      { r: 0.985, kind: 'ticks', n: 120, big: 10, fixed: true, a: 0.55 },
      { r: 0.90, kind: 'arcs', segs: [[0.02, 0.21], [0.27, 0.46], [0.52, 0.71], [0.77, 0.96]], w: 0.022, speed: -0.045, a: 0.35 },
      { r: 0.835, kind: 'dash', on: 1.6, off: 3.4, w: 0.012, speed: 0.07, a: 0.5 },
      { r: 0.78, kind: 'thin', bright: [[0.05, 0.13], [0.38, 0.46], [0.71, 0.79]], speed: -0.11, a: 0.7 },
      { r: 0.715, kind: 'blocks', n: 72, w: 0.035, fixed: true, a: 0.28 }
    ];
    defs.forEach(function (d) {
      if (!d.fixed) { sprites.push({ d: d, R: R, speed: d.speed, fixed: false, rot: Math.random() * TAU }); return; }   // anneaux tournants : tracés à chaque image (vectoriel)
      var rad = d.r * R, pad = Math.ceil(R * 0.06) + 4, s = Math.ceil((rad + pad) * 2 * dpr);
      var cv = doc.createElement('canvas'); cv.width = cv.height = s;
      var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var c = s / dpr / 2; g.translate(c, c);
      g.strokeStyle = rgba(C, d.a); g.fillStyle = rgba(C, d.a); g.lineCap = 'butt';
      if (d.kind === 'ticks') {
        g.lineWidth = 1; g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.stroke();
        for (var i = 0; i < d.n; i++) {
          var an = i / d.n * TAU, big = i % d.big === 0, l = big ? R * 0.045 : R * 0.018;
          g.lineWidth = big ? 2 : 1;
          g.beginPath(); g.moveTo(Math.cos(an) * rad, Math.sin(an) * rad); g.lineTo(Math.cos(an) * (rad - l), Math.sin(an) * (rad - l)); g.stroke();
        }
        g.font = Math.max(8, R * 0.032) + 'px Bahnschrift, "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (var k = 0; k < 12; k++) { var a2 = k / 12 * TAU - Math.PI / 2; g.fillText(String(k * 30).padStart(3, '0'), Math.cos(a2) * (rad - R * 0.085), Math.sin(a2) * (rad - R * 0.085)); }
      } else if (d.kind === 'arcs') {
        g.lineWidth = d.w * R;
        d.segs.forEach(function (sg) { g.beginPath(); g.arc(0, 0, rad, sg[0] * TAU, sg[1] * TAU); g.stroke(); });
        g.lineWidth = 1; g.strokeStyle = rgba(C, d.a * 1.6);
        d.segs.forEach(function (sg) { [sg[0], sg[1]].forEach(function (e) { var an = e * TAU; g.beginPath(); g.moveTo(Math.cos(an) * (rad - d.w * R), Math.sin(an) * (rad - d.w * R)); g.lineTo(Math.cos(an) * (rad + d.w * R), Math.sin(an) * (rad + d.w * R)); g.stroke(); }); });
      } else if (d.kind === 'dash') {
        g.lineWidth = d.w * R; var per = (d.on + d.off) / 360 * TAU, on = d.on / 360 * TAU;
        for (var a = 0; a < TAU - 1e-6; a += per) { g.beginPath(); g.arc(0, 0, rad, a, a + on); g.stroke(); }
      } else if (d.kind === 'thin') {
        g.lineWidth = 1; g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.stroke();
        g.lineWidth = 3; g.strokeStyle = rgba(C, 0.95); g.shadowColor = rgba(C, 0.9); g.shadowBlur = 8;
        d.bright.forEach(function (sg) { g.beginPath(); g.arc(0, 0, rad, sg[0] * TAU, sg[1] * TAU); g.stroke(); });
      } else if (d.kind === 'blocks') {
        var bw = d.w * R;
        for (var b = 0; b < d.n; b++) {
          var a0 = b / d.n * TAU, a1 = a0 + TAU / d.n * 0.62;
          g.globalAlpha = b % 9 === 0 ? 1 : b % 3 === 0 ? 0.65 : 0.4;
          g.lineWidth = bw; g.beginPath(); g.arc(0, 0, rad, a0, a1); g.stroke();
        }
        g.globalAlpha = 1;
      }
      sprites.push({ cv: cv, half: s / dpr / 2, speed: d.speed || 0, fixed: !!d.fixed, rot: d.fixed ? 0 : Math.random() * TAU });
    });
  }

  /* fond fixe : vignettage, trame, circuits */
  function drawStatic() {
    var g = bctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
    var cx = stage ? stage.cx : W / 2, cy = stage ? stage.cy : Hh / 2;
    var vg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, Hh) * 0.75);
    vg.addColorStop(0, rgba(C, 0.10 * (0.5 + H.intensity))); vg.addColorStop(0.45, rgba(C, 0.025)); vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
    // trame de points (hexagonale)
    var step = Math.max(22, Math.round(Math.min(W, Hh) / 34)), x0 = FJ.freeX || 0;
    g.fillStyle = rgba(C, 0.07 + 0.05 * H.intensity);
    for (var y = step / 2, row = 0; y < Hh; y += step * 0.866, row++) {
      for (var x = x0 + (row % 2 ? step / 2 : 0) + step / 2; x < W; x += step) g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
    // anneaux lents (graduations, blocs) : fixes, dessinés une fois ici
    if (stage && H.rings) sprites.forEach(function (sp) { if (!sp.fixed) return; g.globalAlpha = 0.55 + 0.45 * H.intensity; g.drawImage(sp.cv, stage.cx - sp.half, stage.cy - sp.half, sp.half * 2, sp.half * 2); g.globalAlpha = 1; });
    if (!H.circuits) return;
    // circuits : tracés fins, nœuds aux extrémités
    g.lineJoin = 'round'; g.lineCap = 'round';
    paths.forEach(function (p) {
      g.strokeStyle = rgba(C, p.deco ? 0.10 + 0.08 * H.intensity : 0.18 + 0.14 * H.intensity); g.lineWidth = p.deco ? 1 : 1.3;
      g.beginPath(); g.moveTo(p.pts[0][0], p.pts[0][1]); for (var i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i][0], p.pts[i][1]); g.stroke();
      var e = p.pts[p.pts.length - 1], s = p.pts[0];
      g.fillStyle = rgba(C, 0.55); g.beginPath(); g.arc(e[0], e[1], p.deco ? 2 : 3, 0, TAU); g.fill();
      g.strokeStyle = rgba(C, 0.5); g.lineWidth = 1; g.beginPath(); g.arc(s[0], s[1], p.deco ? 2.5 : 3.5, 0, TAU); g.stroke();
    });
  }

  /* tracé « circuit imprimé » entre deux points : horizontal, diagonale à 45°, horizontal */
  function route(a, b, out) {
    var dir = b[0] > a[0] ? 1 : -1, p1 = [a[0] + dir * out, a[1]], dy = b[1] - p1[1], adx = Math.abs(b[0] - p1[0]);
    var pts = [a, p1];
    if (Math.abs(dy) <= adx * 0.8) {
      var mid = [p1[0] + dir * Math.abs(dy), b[1]];
      pts.push(mid);
    } else {
      var d1 = adx * 0.5, q = [p1[0] + dir * d1, p1[1] + Math.sign(dy) * d1];
      pts.push(q, [q[0], b[1] - Math.sign(dy) * Math.min(adx * 0.3, Math.abs(b[1] - q[1]))]);
      pts.push([pts[pts.length - 1][0] + dir * Math.abs(b[1] - pts[pts.length - 1][1]), b[1]]);
    }
    pts.push(b);
    return pts;
  }
  function measure(p) {
    var segs = [], tot = 0;
    for (var i = 1; i < p.pts.length; i++) { var dx = p.pts[i][0] - p.pts[i - 1][0], dy = p.pts[i][1] - p.pts[i - 1][1], l = Math.hypot(dx, dy); segs.push(l); tot += l; }
    p.segs = segs; p.len = tot; return p;
  }
  function at(p, d) {
    for (var i = 0; i < p.segs.length; i++) {
      if (d <= p.segs[i] || i === p.segs.length - 1) { var k = p.segs[i] ? Math.min(1, d / p.segs[i]) : 0, a = p.pts[i], b = p.pts[i + 1]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
      d -= p.segs[i];
    }
    return p.pts[p.pts.length - 1];
  }

  /** Mise en page : centre de la scène et rectangles des panneaux visibles */
  H.layout = function (info) {
    size();
    C = rgbVar('--c', C); C2 = rgbVar('--c2', C2);
    stage = info && info.stage ? info.stage : null;
    paths = [];
    if (stage) {
      makeSprites(stage.r);
      var R = stage.r * 0.99;
      (info.anchors || []).forEach(function (an) {
        if (an.vert) {                         // panneau au-dessus ou au-dessous de la sphère : piste verticale
          var sg = an.y < stage.cy ? -1 : 1, y0 = stage.cy + sg * R;
          if ((an.y - y0) * sg > 6) paths.push(measure({ pts: [[stage.cx, y0], [stage.cx, an.y]] }));
          return;
        }
        var side = an.x < stage.cx ? -1 : 1, dy = an.y - stage.cy;
        var ang = Math.atan2(Math.max(-R * 0.8, Math.min(R * 0.8, dy)), side * R);
        var a = [stage.cx + Math.cos(ang) * R, stage.cy + Math.sin(ang) * R];
        if (Math.abs(an.x - a[0]) < 24) return;
        paths.push(measure({ pts: route(a, [an.x, an.y], Math.min(40, Math.abs(an.x - a[0]) * 0.15)) }));
      });
      // pistes décoratives : quelques traces courtes autour de la sphère
      if (H.intensity > 0.15) {
        var n = Math.round(4 + 6 * H.intensity), x0 = (FJ.freeX || 0) + 8;
        for (var i = 0; i < n; i++) {
          var an2 = (i / n) * TAU + 0.35, s = [stage.cx + Math.cos(an2) * R * 1.02, stage.cy + Math.sin(an2) * R * 1.02];
          var len = stage.r * (0.14 + 0.2 * ((i * 37) % 10) / 10), ex = s[0] + Math.sign(Math.cos(an2) || 1) * len;
          var ey = s[1] + Math.sign(Math.sin(an2) || 1) * len * 0.35;
          ex = Math.max(x0, Math.min(W - 8, ex)); ey = Math.max(stage.cy - stage.r * 1.12, Math.min(stage.cy + stage.r * 1.12, Math.max(8, Math.min(Hh - 8, ey))));
          if (info.avoid && info.avoid.some(function (r) { return ex > r.l - 6 && ex < r.r + 6 && ey > r.t - 6 && ey < r.b + 6; })) continue;
          paths.push(measure({ pts: route(s, [ex, ey], 10), deco: true }));
        }
      }
    }
    pulses = []; dust = []; dirty = [];
    fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fx.width, fx.height);
    // calque des anneaux : carré autour de la sphère (repères triangulaires compris)
    if (stage) {
      RB.s = Math.ceil(stage.r * 2.3); RB.x = Math.round(stage.cx - RB.s / 2); RB.y = Math.round(stage.cy - RB.s / 2);
      rg.width = rg.height = Math.round(RB.s * dpr); rg.style.cssText = 'position:fixed;z-index:1;pointer-events:none;left:' + RB.x + 'px;top:' + RB.y + 'px;width:' + RB.s + 'px;height:' + RB.s + 'px';
    } else rg.width = rg.height = 1;
    var nd = H.dust && !H.reduce && stage ? Math.round(10 + 26 * H.intensity) : 0;     // poussières : autour de la sphère
    for (var k = 0; k < nd; k++) dust.push({ x: Math.random() * RB.s, y: Math.random() * RB.s, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 6, r: 0.6 + Math.random() * 1.4, a: 0.15 + Math.random() * 0.35 });
    drawStatic();
    drawFx(performance.now());
  };
  H.redrawStatic = function () { C = rgbVar('--c', C); C2 = rgbVar('--c2', C2); if (stage) makeSprites(stage.r); drawStatic(); drawFx(performance.now()); };

  /* anneau tournant tracé directement (quelques arcs : bien moins coûteux qu'une image pivotée en rendu logiciel) */
  function ring(g, cx, cy, sp) {
    var d = sp.d, R = sp.R, rad = d.r * R, o = sp.rot;
    g.lineCap = 'butt'; g.strokeStyle = rgba(C, d.a);
    if (d.kind === 'arcs') {
      g.lineWidth = d.w * R;
      g.beginPath(); d.segs.forEach(function (sg) { g.moveTo(cx + Math.cos(o + sg[0] * TAU) * rad, cy + Math.sin(o + sg[0] * TAU) * rad); g.arc(cx, cy, rad, o + sg[0] * TAU, o + sg[1] * TAU); }); g.stroke();
      g.lineWidth = 1; g.strokeStyle = rgba(C, Math.min(1, d.a * 1.6)); g.beginPath();
      d.segs.forEach(function (sg) { [sg[0], sg[1]].forEach(function (e) { var an = o + e * TAU, c = Math.cos(an), sn = Math.sin(an); g.moveTo(cx + c * (rad - d.w * R), cy + sn * (rad - d.w * R)); g.lineTo(cx + c * (rad + d.w * R), cy + sn * (rad + d.w * R)); }); });
      g.stroke();
    } else if (d.kind === 'dash') {
      var per = (d.on + d.off) / 360 * TAU * rad, on = d.on / 360 * TAU * rad;
      g.lineWidth = d.w * R; g.setLineDash([on, per - on]); g.lineDashOffset = -o * rad;
      g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
    } else if (d.kind === 'thin') {
      g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke();
      g.lineCap = 'round';
      g.lineWidth = 7; g.strokeStyle = rgba(C, 0.16); g.beginPath(); d.bright.forEach(function (sg) { g.moveTo(cx + Math.cos(o + sg[0] * TAU) * rad, cy + Math.sin(o + sg[0] * TAU) * rad); g.arc(cx, cy, rad, o + sg[0] * TAU, o + sg[1] * TAU); }); g.stroke();
      g.lineWidth = 2.5; g.strokeStyle = rgba(C, 0.95); g.stroke();
    }
  }

  /* calques animés */
  function drawFx(now) {
    var dt = lastDraw ? Math.min(0.1, (now - lastDraw) / 1000) : 0.016; lastDraw = now;
    var t = (now - t0) / 1000, I = H.intensity, moving = !H.reduce, g = rctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, RB.s, RB.s);
    // poussières (coordonnées du calque des anneaux)
    for (var d = 0; d < dust.length; d++) {
      var p = dust[d]; if (moving) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.y < -4) { p.y = RB.s + 4; p.x = Math.random() * RB.s; } }
      g.fillStyle = rgba(C, p.a * (0.6 + 0.4 * Math.sin(t * 0.8 + d))); g.fillRect(p.x, p.y, p.r, p.r);
    }
    if (stage && H.rings) {
      var cx = stage.cx - RB.x, cy = stage.cy - RB.y;
      g.globalAlpha = 0.55 + 0.45 * I;
      for (var s = 0; s < sprites.length; s++) {
        var sp = sprites[s]; if (sp.fixed) continue; if (moving) sp.rot += sp.speed * dt * (0.5 + I);
        ring(g, cx, cy, sp);
      }
      g.globalAlpha = 1; g.translate(cx, cy);
      // balayage lumineux et repères
      var R = stage.r, sw = moving ? t * 0.9 : 0.6;
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = rgba(C, 0.75 * I); g.lineWidth = Math.max(2, R * 0.012); g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, R * 0.865, sw, sw + 0.5); g.stroke();
      g.strokeStyle = rgba(C2, 0.6 * I); g.beginPath(); g.arc(0, 0, R * 0.865, sw + Math.PI, sw + Math.PI + 0.22); g.stroke();
      var tri = moving ? -t * 0.25 : 0;
      g.fillStyle = rgba(C, 0.85);
      for (var k = 0; k < 3; k++) { var a = tri + k * TAU / 3, rr = R * 1.035, ca = Math.cos(a), sa = Math.sin(a); g.beginPath(); g.moveTo(ca * rr, sa * rr); g.lineTo(ca * (rr + R * 0.035) + sa * R * 0.018, sa * (rr + R * 0.035) - ca * R * 0.018); g.lineTo(ca * (rr + R * 0.035) - sa * R * 0.018, sa * (rr + R * 0.035) + ca * R * 0.018); g.closePath(); g.fill(); }
      g.globalCompositeOperation = 'source-over';
    }
    // impulsions : on efface seulement les zones dessinées à l'image précédente
    var f = fctx; f.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var z0 = 0; z0 < dirty.length; z0++) { var r0 = dirty[z0]; f.clearRect(r0[0], r0[1], r0[2], r0[3]); }
    dirty = [];
    if (paths.length && moving && H.circuits) {
      var want = Math.round(2 + 9 * I);
      if (pulses.length < want && Math.random() < dt * (0.8 + 2.5 * I)) {
        var pth = paths[(Math.random() * paths.length) | 0], out = Math.random() < 0.6;
        pulses.push({ p: pth, d: out ? 0 : pth.len, v: (out ? 1 : -1) * (140 + Math.random() * 220), tail: 30 + Math.random() * 50 });
      }
      f.globalCompositeOperation = 'lighter'; f.lineCap = 'round'; f.lineWidth = 2;
      for (var q = pulses.length - 1; q >= 0; q--) {
        var pu = pulses[q]; pu.d += pu.v * dt;
        if (pu.d < -pu.tail || pu.d > pu.p.len + pu.tail) { pulses.splice(q, 1); continue; }
        var head = at(pu.p, Math.max(0, Math.min(pu.p.len, pu.d))), tl = at(pu.p, Math.max(0, Math.min(pu.p.len, pu.d - Math.sign(pu.v) * pu.tail)));
        var gr = f.createLinearGradient(tl[0], tl[1], head[0], head[1]); gr.addColorStop(0, rgba(C, 0)); gr.addColorStop(1, rgba(C, 0.9));
        f.strokeStyle = gr; f.beginPath();
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, steps = 6;
        for (var z = 0; z <= steps; z++) {
          var dd = pu.d - Math.sign(pu.v) * pu.tail * (1 - z / steps), pt = at(pu.p, Math.max(0, Math.min(pu.p.len, dd)));
          if (z) f.lineTo(pt[0], pt[1]); else f.moveTo(pt[0], pt[1]);
          x0 = Math.min(x0, pt[0]); y0 = Math.min(y0, pt[1]); x1 = Math.max(x1, pt[0]); y1 = Math.max(y1, pt[1]);
        }
        f.stroke();
        f.fillStyle = rgba(C, 0.95); f.beginPath(); f.arc(head[0], head[1], 2.2, 0, TAU); f.fill();
        dirty.push([Math.floor(x0 - 5), Math.floor(y0 - 5), Math.ceil(x1 - x0 + 10), Math.ceil(y1 - y0 + 10)]);
      }
      f.globalCompositeOperation = 'source-over';
    }
  }
  L.add(function (now) { drawFx(now); }, function () { return !H.reduce && H.on !== false; });

  var rt = 0;
  root.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (FJ.relayout) FJ.relayout(); }, 150); });
})(window);
