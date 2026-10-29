/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-tableur/tb-grid.js : ne pas modifier ici. */
/* Tableur — grille : rendu sur canevas (seules les cellules visibles sont dessinées : fluide à 100 000 lignes et plus),
   défilement natif, volets figés, zoom, en-têtes, plan (grouper), sélection multiple, poignée de recopie, édition dans
   la cellule (mode « Entrer » / « Modifier », pointage des références à la souris et aux flèches), redimensionnement
   des lignes et colonnes, objets (graphiques, images, formes), souris, doigt (appui long, poignées, pincer). */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur, P = TB.Formula;
  const A = window.TableurApp = window.TableurApp || {};
  const KEY = TB.key;
  const MAXR = TB.MAX_ROWS, MAXC = TB.MAX_COLS;
  const REF_COLORS = ['#2F6FDE', '#D9363E', '#7B3FC2', '#1E8E3E', '#C26A00', '#0B8C9C', '#C2185B', '#5D6B00'];

  /* ---------------- axes (positions des lignes et colonnes, tailles variables et masquées) ---------------- */
  class Axis {
    constructor(def, sizes, hidden, max) { this.def = def; this.max = max; this.idx = []; this.cum = []; const m = new Map(); sizes.forEach((v, i) => { if (v != null && v !== def) m.set(i, v); }); hidden.forEach((i) => m.set(i, 0)); const keys = Array.from(m.keys()).sort((a, b) => a - b); let s = 0; this.cum.push(0); for (const k of keys) { this.idx.push(k); s += m.get(k) - def; this.cum.push(s); } this.sz = m; }
    count(i) { let lo = 0, hi = this.idx.length; while (lo < hi) { const m = (lo + hi) >> 1; if (this.idx[m] < i) lo = m + 1; else hi = m; } return lo; }
    pos(i) { return i * this.def + this.cum[this.count(i)]; }
    size(i) { const v = this.sz.get(i); return v === undefined ? this.def : v; }
    index(px) { if (px <= 0) return 0; let lo = 0, hi = this.max - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.pos(m) <= px) lo = m; else hi = m - 1; } while (lo > 0 && this.size(lo) === 0 && this.pos(lo) >= px) lo--; return lo; }
    next(i, d) { let j = i + d; while (j >= 0 && j < this.max && this.size(j) === 0) j += d; return j < 0 ? -1 : j >= this.max ? this.max : j; }
  }
  TB.Axis = Axis;

  /* ---------------- polices du canevas ---------------- */
  const FONT_MAP = { calibri: "Calibri, 'Mag Sans Douce', Carlito", aptos: "Aptos, 'Mag Sans Douce'", 'calibri light': "'Calibri Light', 'Mag Sans Douce'", arial: "Arial, 'Mag Sans', 'Liberation Sans'", helvetica: "Helvetica, Arial, 'Mag Sans'", 'times new roman': "'Times New Roman', 'Mag Serif'", 'courier new': "'Courier New', 'Mag Mono'", cambria: "Cambria, Caladea", consolas: "Consolas, 'Mag Mono'", 'segoe ui': "'Segoe UI', 'Mag Sans Douce'", verdana: "Verdana, 'Mag Sans'", tahoma: "Tahoma, 'Mag Sans'", georgia: "Georgia, 'Mag Serif'", 'liberation sans': "'Liberation Sans', 'Mag Sans'", carlito: "Carlito, 'Mag Sans Douce'" };
  TB.fontCss = (n) => { n = n || TB.DEFAULT_FONT; const k = String(n).toLowerCase(); return (FONT_MAP[k] || ("'" + String(n).replace(/'/g, '') + "', 'Mag Sans Douce'")) + ', sans-serif'; };
  TB.fontPx = (pt) => pt * 96 / 72;

  /* ---------------- caches ---------------- */
  const fmtCache = new Map(); let fmtN = 0;
  function fmtText(v, nf, width) {
    if (width != null && (!nf || nf === 'General' || /General/.test(nf)) && typeof v === 'number') return TB.Fmt.format(v, nf, { width });
    const k = (nf || '') + '\u0001' + (typeof v === 'number' ? 'n' + v : typeof v === 'string' ? 's' + v : String(v));
    let r = fmtCache.get(k); if (r) return r;
    r = TB.Fmt.format(v, nf); if (++fmtN > 60000) { fmtCache.clear(); fmtN = 0; } fmtCache.set(k, r); return r;
  }
  TB.clearFmtCache = () => { fmtCache.clear(); fmtN = 0; };
  const widthCache = new Map(); let wN = 0;
  function textW(ctx, font, s) { const k = font + '\u0001' + s; let w = widthCache.get(k); if (w === undefined) { ctx.font = font; w = ctx.measureText(s).width; if (++wN > 80000) { widthCache.clear(); wN = 0; } widthCache.set(k, w); } return w; }
  TB.clearWidthCache = () => { widthCache.clear(); wN = 0; };

  /* =====================================================================
     Grille
     ===================================================================== */
  TB.Grid = function (host) {
    const G = { host, sel: { r: 0, c: 0, ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], anchor: { r: 0, c: 0 } }, edit: null, point: null, zoom: 1, dpr: 1, ver: 0, arrows: [], refHi: [] };
    host.innerHTML = '<div id="gridScroll" tabindex="0" aria-label="Feuille de calcul" role="grid"><div id="gridSpacer"></div></div><canvas id="gridCanvas" aria-hidden="true"></canvas><div id="gridObjs"><div id="gridObjsIn"></div></div><textarea id="cellEd" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Contenu de la cellule"></textarea><div id="gridTip"></div><div id="selH1" class="selh"></div><div id="selH2" class="selh"></div>';
    const sc = host.querySelector('#gridScroll'), spacer = host.querySelector('#gridSpacer'), cv = host.querySelector('#gridCanvas'), objs = host.querySelector('#gridObjs'), objsIn = host.querySelector('#gridObjsIn'), ed = host.querySelector('#cellEd'), tip = host.querySelector('#gridTip');
    const h1 = host.querySelector('#selH1'), h2 = host.querySelector('#selH2');
    G.scroll = sc; G.canvas = cv; G.editor = ed; G.tipEl = tip; G.objsIn = objsIn;
    const ctx = cv.getContext('2d');
    const wb = () => A.wb, sh = () => A.wb.cur;
    let ax = null, ay = null, axSig = '';

    /* ---------------- géométrie ---------------- */
    G.axes = function (force) {
      const s = sh(); const sig = s.id + ':' + G.ver + ':' + s.defW + ':' + s.defH;
      if (!force && ax && axSig === sig) return;
      axSig = sig;
      ax = new Axis(s.defW, s.colW, s.hidC, MAXC); ay = new Axis(s.defH, s.rowH, s.hidR, MAXR);
    };
    G.ax = () => { G.axes(); return ax; }; G.ay = () => { G.axes(); return ay; };
    function outlineBand() { const s = sh(); let lr = 0, lc = 0; s.outR.forEach((v) => { if (v > lr) lr = v; }); s.outC.forEach((v) => { if (v > lc) lc = v; }); return { r: lr ? (lr + 1) * 14 + 4 : 0, c: lc ? (lc + 1) * 14 + 4 : 0, lr, lc }; }
    G.metrics = function () {
      G.axes(); const s = sh(), z = G.zoom, ob = outlineBand();
      const hd = s.heads !== false;
      const last = Math.max(1000, ay ? Math.min(MAXR, ay.index(sc.scrollTop / z) + 200) : 1000);
      const digits = String(Math.min(MAXR, last)).length;
      const hw = hd ? Math.max(32, 9 * digits + 14) * Math.min(1.4, Math.max(0.75, z)) : 0, hh = hd ? 22 * Math.min(1.4, Math.max(0.75, z)) : 0;
      const fr = s.freeze ? s.freeze.r || 0 : 0, fc = s.freeze ? s.freeze.c || 0 : 0;
      return { z, hw: hw + ob.r, hh: hh + ob.c, hw0: hw, hh0: hh, ob, fr, fc, fW: ax.pos(fc) * z, fH: ay.pos(fr) * z, W: sc.clientWidth, H: sc.clientHeight };
    };
    /** ligne / colonne visible en haut à gauche de la zone qui défile */
    function scrollOrigin(m) { return { sx: ax.pos(m.fc) + sc.scrollLeft / m.z, sy: ay.pos(m.fr) + sc.scrollTop / m.z }; }
    /** position à l'écran (px, relatif à l'hôte) d'une cellule */
    G.cellRect = function (r, c, m) {
      m = m || G.metrics(); const o = scrollOrigin(m), z = m.z;
      const x = c < m.fc ? m.hw + ax.pos(c) * z : m.hw + m.fW + (ax.pos(c) - o.sx) * z;
      const y = r < m.fr ? m.hh + ay.pos(r) * z : m.hh + m.fH + (ay.pos(r) - o.sy) * z;
      return { x, y, w: ax.size(c) * z, h: ay.size(r) * z };
    };
    G.rangeRect = function (g, m) {
      m = m || G.metrics();
      const a = G.cellRect(g.r1, g.c1, m), b = G.cellRect(Math.min(g.r2, MAXR - 1), Math.min(g.c2, MAXC - 1), m);
      return { x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y };
    };
    /** point écran → zone et cellule */
    G.hit = function (x, y) {
      const m = G.metrics(), z = m.z, o = scrollOrigin(m);
      const out = { x, y };
      const sx = x < m.hw ? -1 : (x - m.hw < m.fW ? (x - m.hw) / z : o.sx + (x - m.hw - m.fW) / z);
      const sy = y < m.hh ? -1 : (y - m.hh < m.fH ? (y - m.hh) / z : o.sy + (y - m.hh - m.fH) / z);
      out.c = sx < 0 ? -1 : Math.min(MAXC - 1, ax.index(sx)); out.r = sy < 0 ? -1 : Math.min(MAXR - 1, ay.index(sy));
      out.sx = sx; out.sy = sy;
      if (x < m.hw - m.ob.r && y < m.hh - m.ob.c && x >= m.ob.r && y >= m.ob.c) out.area = 'corner';
      else if (x < m.ob.r || y < m.ob.c) out.area = 'outline';
      else if (y < m.hh) out.area = x < m.hw ? 'corner' : 'col';
      else if (x < m.hw) out.area = 'row';
      else out.area = 'cell';
      // bord de redimensionnement des en-têtes
      if (out.area === 'col' && out.c >= 0) { const L = ax.pos(out.c), R = L + ax.size(out.c); const dx = (sx - L) * z, dr = (R - sx) * z; if (dr <= 4) out.resize = { axis: 'c', i: out.c }; else if (dx <= 3 && out.c > 0) { const p = ax.next(out.c, -1); if (p >= 0) out.resize = { axis: 'c', i: p }; } }
      if (out.area === 'row' && out.r >= 0) { const T = ay.pos(out.r), B = T + ay.size(out.r); const dy = (sy - T) * z, db = (B - sy) * z; if (db <= 3) out.resize = { axis: 'r', i: out.r }; else if (dy <= 2 && out.r > 0) { const p = ay.next(out.r, -1); if (p >= 0) out.resize = { axis: 'r', i: p }; } }
      return out;
    };

    /* ---------------- taille du contenu (défilement « infini ») ---------------- */
    let extR = 200, extC = 40;
    G.updateExtent = function () {
      const s = sh(), e = s.extent(), m = G.metrics(), z = m.z;
      const visR = ay.index(ay.pos(m.fr) + sc.scrollTop / z + m.H / z) + 1, visC = ax.index(ax.pos(m.fc) + sc.scrollLeft / z + m.W / z) + 1;
      extR = Math.min(MAXR, Math.max(e.r + 60, visR + 40, G.sel.r + 40, 200)); extC = Math.min(MAXC, Math.max(e.c + 12, visC + 8, G.sel.c + 8, 40));
      const w = m.hw + ax.pos(extC) * z, h = m.hh + ay.pos(extR) * z;
      spacer.style.width = Math.ceil(w) + 'px'; spacer.style.height = Math.ceil(h) + 'px';
    };

    /* ---------------- dessin ---------------- */
    let drawQ = false;
    G.draw = function () { if (drawQ) return; drawQ = true; requestAnimationFrame(() => { drawQ = false; try { paint(); } catch (e) { console.error(e); } }); };
    G.drawNow = () => { drawQ = false; paint(); };
    function resize() {
      const W = sc.clientWidth, H = sc.clientHeight, d = window.devicePixelRatio || 1;
      if (cv._w !== W || cv._h !== H || cv._d !== d) { cv._w = W; cv._h = H; cv._d = d; cv.width = Math.round(W * d); cv.height = Math.round(H * d); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
      G.dpr = d;
    }
    const BSTY = { thin: [1, []], hair: [1, [1, 1]], dotted: [1, [1, 2]], dashed: [1, [3, 2]], dashDot: [1, [4, 2, 1, 2]], dashDotDot: [1, [4, 2, 1, 2, 1, 2]], medium: [2, []], mediumDashed: [2, [5, 2]], mediumDashDot: [2, [6, 2, 2, 2]], mediumDashDotDot: [2, [6, 2, 2, 2, 2, 2]], slantDashDot: [2, [6, 2, 2, 2]], thick: [3, []], double: [3, []] };
    function paint() {
      if (!A.wb) return;
      resize(); G.axes();
      const s = sh(), W = cv._w, H = cv._h, d = G.dpr, m = G.metrics(), z = m.z, o = scrollOrigin(m);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
      const ver = G.ver;
      const Cf = TB.CF ? TB.CF.prepare(A.wb, s, ver) : null;
      // quadrants
      const qs = [];
      const visRows = (from, y0, y1) => { const out = []; let r = from, y = y0; while (r < MAXR && y < y1) { const h = ay.size(r) * z; if (h > 0) out.push([r, y, h]); y += h; r++; } return out; };
      const visCols = (from, x0, x1) => { const out = []; let c = from, x = x0; while (c < MAXC && x < x1) { const w = ax.size(c) * z; if (w > 0) out.push([c, x, w]); x += w; c++; } return out; };
      const r0 = ay.index(o.sy), c0 = ax.index(o.sx);
      const yOff = m.hh + m.fH - (o.sy - ay.pos(r0)) * z, xOff = m.hw + m.fW - (o.sx - ax.pos(c0)) * z;
      const rowsMain = visRows(r0, yOff, H), colsMain = visCols(c0, xOff, W);
      const rowsFz = m.fr ? visRows(0, m.hh, m.hh + m.fH) : [], colsFz = m.fc ? visCols(0, m.hw, m.hw + m.fW) : [];
      qs.push({ rows: rowsMain, cols: colsMain, clip: [m.hw + m.fW, m.hh + m.fH, W, H] });
      if (m.fr) qs.push({ rows: rowsFz, cols: colsMain, clip: [m.hw + m.fW, m.hh, W, m.hh + m.fH] });
      if (m.fc) qs.push({ rows: rowsMain, cols: colsFz, clip: [m.hw, m.hh + m.fH, m.hw + m.fW, H] });
      if (m.fr && m.fc) qs.push({ rows: rowsFz, cols: colsFz, clip: [m.hw, m.hh, m.hw + m.fW, m.hh + m.fH] });
      G.visible = { r1: r0, r2: rowsMain.length ? rowsMain[rowsMain.length - 1][0] : r0, c1: c0, c2: colsMain.length ? colsMain[colsMain.length - 1][0] : c0 };
      for (const q of qs) { ctx.save(); ctx.beginPath(); ctx.rect(q.clip[0], q.clip[1], q.clip[2] - q.clip[0], q.clip[3] - q.clip[1]); ctx.clip(); drawCells(s, q, m, Cf); ctx.restore(); }
      // traits des volets figés
      ctx.fillStyle = '#9AA3AE';
      if (m.fr) ctx.fillRect(m.hw, m.hh + m.fH - 1, W - m.hw, 1.5);
      if (m.fc) ctx.fillRect(m.hw + m.fW - 1, m.hh, 1.5, H - m.hh);
      // sélection, références, flèches d'audit
      for (const q of qs) { ctx.save(); ctx.beginPath(); ctx.rect(q.clip[0], q.clip[1], q.clip[2] - q.clip[0], q.clip[3] - q.clip[1]); ctx.clip(); drawOverlays(s, m); ctx.restore(); }
      drawHeaders(s, m, rowsMain, colsMain, rowsFz, colsFz);
      placeObjects(m, o);
      placeEditor(m);
      placeHandles(m);
      if (A.onPaint) A.onPaint();
    }
    G.paint = paint;

    function cellStyleOf(s, r, c, Cf) {
      const P = A.wb.styles;
      let st = P.get(s.styleAt(r, c));
      if (s.tables.length && TB.TableStyle) { const t = s.tableAt(r, c); if (t) { const ts = TB.TableStyle.cell(A.wb, s, t, r, c); if (ts) st = Object.assign({}, ts, st, ts.force || {}); } }
      let cf = null;
      if (Cf && Cf.any) { cf = TB.CF.cell(Cf, r, c); if (cf && cf.st) st = Object.assign({}, st, cf.st); }
      return { st, cf };
    }
    G.styleAt = (r, c) => cellStyleOf(sh(), r, c, TB.CF ? TB.CF.prepare(A.wb, sh(), G.ver) : null).st;

    function drawCells(s, q, m, Cf) {
      const z = m.z, rows = q.rows, cols = q.cols; if (!rows.length || !cols.length) return;
      const x0 = cols[0][1], x1 = cols[cols.length - 1][1] + cols[cols.length - 1][2], y0 = rows[0][1], y1 = rows[rows.length - 1][1] + rows[rows.length - 1][2];
      const rA = rows[0][0], rB = rows[rows.length - 1][0], cA = cols[0][0], cB = cols[cols.length - 1][0];
      // fusions visibles
      const merges = s.merges.filter((g) => g.r2 >= rA && g.r1 <= rB && g.c2 >= cA && g.c1 <= cB);
      const inMerge = merges.length ? (r, c) => { for (const g of merges) if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return g; return null; } : () => null;
      // quadrillage
      if (s.grid !== false && !s.hideGrid) {
        ctx.fillStyle = '#E1E4E8';
        for (const [, x, w] of cols) ctx.fillRect(Math.round(x + w) - 1, y0, 1, y1 - y0);
        for (const [, y, h] of rows) ctx.fillRect(x0, Math.round(y + h) - 1, x1 - x0, 1);
      }
      const later = []; // textes (après les fonds)
      const colX = new Map(); cols.forEach((c) => colX.set(c[0], c));
      // fonds et textes cellule par cellule
      for (const [r, y, h] of rows) {
        for (let k = 0; k < cols.length; k++) {
          const [c, x, w] = cols[k];
          if (merges.length && inMerge(r, c)) continue;
          const v = s.get(r, c);
          const { st, cf } = cellStyleOf(s, r, c, Cf);
          if (st.bg) { ctx.fillStyle = st.bg; ctx.fillRect(x - 1, y - 1, w + 1, h + 1); }
          else if (st.pat && st.pfg) { ctx.fillStyle = st.pfg; ctx.globalAlpha = 0.35; ctx.fillRect(x - 1, y - 1, w + 1, h + 1); ctx.globalAlpha = 1; }
          if (cf && cf.bar) drawBar(cf.bar, x, y, w, h, z);
          if (cf && cf.icon) drawIcon(cf.icon, x + 3 * z, y, h, z);
          if (v !== null && v !== '') later.push([r, c, x, y, w, h, v, st, cf, k]);
          else if (s.sparks && s.sparks.length) { const sp = s.sparks.find((p) => p.at.r1 === r && p.at.c1 === c); if (sp && TB.Spark) TB.Spark.draw(ctx, A.wb, s, sp, x, y, w, h, z); }
          if (st.bt || st.bb || st.bl || st.br || st.bd || st.bu) drawBorders(st, x, y, w, h);
        }
      }
      // fusions : fond + texte au centre de la zone
      for (const g of merges) {
        const a = G.cellRect(g.r1, g.c1, m), b = G.cellRect(g.r2, g.c2, m);
        const x = a.x, y = a.y, w = b.x + b.w - a.x, h = b.y + b.h - a.y;
        const { st, cf } = cellStyleOf(s, g.r1, g.c1, Cf);
        ctx.fillStyle = st.bg || '#FFFFFF'; ctx.fillRect(x, y, w - 1, h - 1);
        const v = s.get(g.r1, g.c1);
        if (v !== null && v !== '') later.push([g.r1, g.c1, x, y, w, h, v, st, cf, -1, true]);
        const bst = Object.assign({}, st); const st2 = cellStyleOf(s, g.r2, g.c2, Cf).st; if (st2.bb) bst.bb = st2.bb; if (st2.br) bst.br = st2.br;
        if (bst.bt || bst.bb || bst.bl || bst.br) drawBorders(bst, x, y, w, h);
      }
      // textes (débordement sur les cellules vides voisines)
      for (const t of later) drawText(s, t, cols, m, inMerge);
      // indicateurs : notes, commentaires, listes, filtres, propagation
      if (s.notes.size || s.threads.size) {
        for (const [r, y] of rows) for (const [c, x, w] of cols) {
          const k = KEY(r, c);
          if (s.notes.has(k)) { ctx.fillStyle = '#D9363E'; tri(x + w - 1, y, 6 * Math.max(0.8, z)); }
          else if (s.threads.has(k)) { ctx.fillStyle = '#7048E8'; tri(x + w - 1, y, 7 * Math.max(0.8, z)); }
        }
      }
      drawFilterButtons(s, q, m);
    }
    function tri(x, y, k) { ctx.beginPath(); ctx.moveTo(x - k, y); ctx.lineTo(x, y); ctx.lineTo(x, y + k); ctx.closePath(); ctx.fill(); }
    function drawBar(b, x, y, w, h, z) {
      const pad = 2 * z, H2 = h - 2 * pad; if (H2 <= 0) return;
      const W2 = w - 2 * pad, ax0 = x + pad + W2 * (b.axis || 0);
      const bw = W2 * Math.abs(b.pct) * (b.axis ? (b.pct < 0 ? b.axis : 1 - b.axis) : 1);
      const bx = b.pct < 0 ? ax0 - bw : ax0;
      if (b.grad !== false) { const g = ctx.createLinearGradient(bx, 0, bx + Math.max(1, bw), 0); g.addColorStop(0, b.color); g.addColorStop(1, '#FFFFFF'); ctx.fillStyle = g; } else ctx.fillStyle = b.color;
      ctx.fillRect(bx, y + pad, bw, H2);
      if (b.border) { ctx.strokeStyle = b.color; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, y + pad + 0.5, Math.max(0, bw - 1), H2 - 1); }
      if (b.axis) { ctx.fillStyle = '#555'; for (let k = y + pad; k < y + pad + H2; k += 3) ctx.fillRect(ax0, k, 1, 1.5); }
    }
    function drawIcon(ic, x, y, h, z) { if (TB.CF && TB.CF.drawIcon) TB.CF.drawIcon(ctx, ic, x, y + h / 2, Math.min(h - 4, 14 * z)); }
    function drawBorders(st, x, y, w, h) {
      const side = (spec, x1, y1, x2, y2) => {
        if (!spec) return; const b = BSTY[spec.s] || BSTY.thin; ctx.strokeStyle = spec.c || '#000000'; ctx.lineWidth = b[0]; ctx.setLineDash(b[1]);
        if (spec.s === 'double') { ctx.lineWidth = 1; const dx = y1 === y2 ? 0 : 1.5, dy = y1 === y2 ? 1.5 : 0; ctx.beginPath(); ctx.moveTo(x1 - dx, y1 - dy); ctx.lineTo(x2 - dx, y2 - dy); ctx.moveTo(x1 + dx, y1 + dy); ctx.lineTo(x2 + dx, y2 + dy); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
        ctx.setLineDash([]);
      };
      const X = Math.round(x) - 0.5, Y = Math.round(y) - 0.5, X2 = Math.round(x + w) - 0.5, Y2 = Math.round(y + h) - 0.5;
      side(st.bt, X, Y, X2, Y); side(st.bb, X, Y2, X2, Y2); side(st.bl, X, Y, X, Y2); side(st.br, X2, Y, X2, Y2);
      side(st.bd, X, Y2, X2, Y); side(st.bu, X, Y, X2, Y2);
    }
    function fontOf(st, z, scale) { const px = TB.fontPx(st.fs || TB.DEFAULT_SIZE) * z * (scale || 1); return (st.i ? 'italic ' : '') + (st.b ? '700 ' : '400 ') + px.toFixed(2) + 'px ' + TB.fontCss(st.fn); }
    G.fontOf = fontOf;
    function drawText(s, t, cols, m, inMerge) {
      const [r, c, x, y, w, h, v, st0, cf, k, merged] = t;
      const z = m.z; let st = st0;
      const showF = s.showF && s.fml.has(KEY(r, c));
      let font = fontOf(st, z);
      let isNum = typeof v === 'number' && !showF, f, s0;
      const pad = 3 * z, ind = (st.ind || 0) * 9 * z;
      if (showF) { s0 = '=' + P.toUser(s.fml.get(KEY(r, c)).src); f = { s: s0 }; }
      else if (isNum && (!st.nf || /General/.test(st.nf))) { const cw = Math.max(1, Math.floor((w - 2 * pad) / (textW(ctx, font, '0') || 7))); f = fmtText(v, st.nf, cw); }
      else f = fmtText(v, st.nf);
      let s1 = f.s; if (s1 === '' || s1 == null) return;
      const color = (cf && cf.st && cf.st.fc) || f.c || st.fc || '#000000';
      let ha = st.ha || 'general';
      if (ha === 'general') ha = showF ? 'left' : (isNum ? 'right' : (typeof v === 'boolean' || f.err) ? 'center' : 'left');
      if (ha === 'fill') { const tw = textW(ctx, font, s1); if (tw > 0) s1 = s1.repeat(Math.max(1, Math.floor((w - 2 * pad) / tw))); ha = 'left'; }
      const wrap = st.wr || ha === 'justify' || st.va === 'justify';
      const rot = st.rot || 0;
      ctx.font = font; ctx.fillStyle = color;
      let tw = textW(ctx, font, s1);
      // réduire pour ajuster
      if (st.shr && !wrap && tw > w - 2 * pad && tw > 0) { const k2 = Math.max(0.3, (w - 2 * pad) / tw); font = fontOf(st, z, k2); ctx.font = font; tw = textW(ctx, font, s1); }
      // nombres trop larges : ####
      if (isNum && !rot && tw > w - 2 * pad + 0.5 && !merged) { const hw2 = textW(ctx, font, '#') || 6; s1 = '#'.repeat(Math.max(1, Math.floor((w - 2 * pad) / hw2))); tw = textW(ctx, font, s1); }
      // icônes de MFC : décalage
      const iconW = cf && cf.icon ? (cf.icon.only ? w : 18 * z) : 0;
      if (cf && cf.icon && cf.icon.only) return;
      if (cf && cf.bar && cf.bar.only) return;
      const px = TB.fontPx(st.fs || TB.DEFAULT_SIZE) * z;
      // zone de dessin (débordement)
      let L = x, R = x + w;
      if (!wrap && !rot && !isNum && !merged && tw > w - 2 * pad - ind) {
        const s = sh();
        const free = (cc) => cc >= 0 && cc < MAXC && s.get(r, cc) === null && !inMerge(r, cc);
        if (ha === 'left' || ha === 'center') { let cc = c + 1; while (R - x < tw + 2 * pad + ind && free(cc)) { R += ax.size(cc) * z; cc++; } }
        if (ha === 'right' || ha === 'center') { let cc = c - 1; while (x + w - L < tw + 2 * pad && free(cc)) { L -= ax.size(cc) * z; cc--; } }
        if (ha === 'center') { const need = tw + 2 * pad, have = R - L; if (have > need) { const cxm = x + w / 2; L = Math.max(L, cxm - need / 2); R = Math.min(R, cxm + need / 2); } }
      }
      ctx.save(); ctx.beginPath(); ctx.rect(L, y, R - L - 1, h - 1); ctx.clip();
      const asc = px * 0.78, desc = px * 0.22, lineH = px * 1.2;
      if (rot) {
        ctx.translate(x + w / 2, y + h / 2);
        if (rot === 255) { const chars = Array.from(s1); const tot = chars.length * lineH; let yy = -tot / 2 + asc; ctx.textAlign = 'center'; chars.forEach((ch) => { ctx.fillText(ch, 0, yy); yy += lineH; }); ctx.restore(); return; }
        ctx.rotate(-rot * Math.PI / 180); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s1, 0, 0); ctx.restore(); return;
      }
      let lines = [s1];
      if (wrap) lines = wrapText(ctx, font, s1, w - 2 * pad - ind);
      else if (s1.indexOf('\n') >= 0) lines = [s1.replace(/\n/g, ' ')];
      const total = lines.length * lineH;
      const va = st.va || 'bottom';
      let ty = va === 'top' ? y + 2 * z + asc : va === 'center' || va === 'justify' ? y + (h - total) / 2 + asc + (lineH - px) / 2 : y + h - total - 2 * z + asc + (lineH - px) / 2 + desc * 0.2;
      for (const ln of lines) {
        const lw = textW(ctx, font, ln);
        let tx;
        if (ha === 'right') tx = R - pad - lw - (merged ? 0 : ind);
        else if (ha === 'center' || ha === 'centerContinuous' || ha === 'distributed') tx = L + (R - L - lw) / 2;
        else tx = L + pad + ind + iconW;
        if (f.fill && !merged && ha !== 'center') { /* comptabilité : symbole à droite, nombre aligné à droite */ }
        ctx.fillText(ln, tx, ty);
        if (st.u || st.st) { ctx.fillRect(tx, st.u ? ty + Math.max(1, px * 0.1) : ty - px * 0.3, lw, Math.max(1, px * 0.06)); if (st.u === 'double') ctx.fillRect(tx, ty + px * 0.2, lw, Math.max(1, px * 0.06)); }
        ty += lineH;
      }
      ctx.restore();
    }
    function wrapText(c, font, s, maxW) {
      const out = []; if (maxW <= 4) return [s];
      for (const para of String(s).split('\n')) {
        const words = para.split(/(\s+)/); let line = '';
        for (const wd of words) {
          const test = line + wd;
          if (textW(c, font, test) <= maxW || !line) { if (textW(c, font, test) > maxW && !line) { let cur = ''; for (const ch of wd) { if (textW(c, font, cur + ch) > maxW && cur) { out.push(cur); cur = ch; } else cur += ch; } line = cur; } else line = test; }
          else { out.push(line.replace(/\s+$/, '')); line = wd.replace(/^\s+/, ''); }
        }
        out.push(line);
      }
      return out;
    }
    G.wrapLines = (font, s, maxW) => wrapText(ctx, font, s, maxW);
    G.textWidth = (font, s) => textW(ctx, font, s);
    function drawFilterButtons(s, q, m) {
      const btns = [];
      if (s.af) for (let c = s.af.c1; c <= s.af.c2; c++) btns.push([s.af.r1, c, s.af.cols && s.af.cols[c], s.af.sort && s.af.sort.c === c ? s.af.sort.o : 0]);
      s.tables.forEach((t) => { if (t.header !== false && t.filter !== false) for (let c = t.c1; c <= t.c2; c++) btns.push([t.r1, c, t.af && t.af[c - t.c1], t.sort && t.sort.c === c ? t.sort.o : 0]); });
      if (!btns.length) return;
      const rset = new Set(q.rows.map((x) => x[0])), cset = new Set(q.cols.map((x) => x[0]));
      for (const [r, c, flt, srt] of btns) {
        if (!rset.has(r) || !cset.has(c)) continue;
        const b = G.cellRect(r, c, m), sz = Math.min(b.h - 3, 16 * Math.max(0.8, m.z)), bx = b.x + b.w - sz - 2, by = b.y + b.h - sz - 2;
        ctx.fillStyle = flt ? '#E3F1E7' : '#F7F8FA'; ctx.strokeStyle = '#9AA3AE'; ctx.lineWidth = 1; ctx.fillRect(bx, by, sz, sz); ctx.strokeRect(bx + 0.5, by + 0.5, sz - 1, sz - 1);
        ctx.fillStyle = '#3B434D';
        if (flt) { ctx.beginPath(); ctx.moveTo(bx + sz * 0.22, by + sz * 0.25); ctx.lineTo(bx + sz * 0.78, by + sz * 0.25); ctx.lineTo(bx + sz * 0.56, by + sz * 0.52); ctx.lineTo(bx + sz * 0.56, by + sz * 0.8); ctx.lineTo(bx + sz * 0.44, by + sz * 0.72); ctx.lineTo(bx + sz * 0.44, by + sz * 0.52); ctx.closePath(); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(bx + sz * 0.28, by + sz * 0.4); ctx.lineTo(bx + sz * 0.72, by + sz * 0.4); ctx.lineTo(bx + sz * 0.5, by + sz * 0.66); ctx.closePath(); ctx.fill(); }
        if (srt) { ctx.fillStyle = '#1E7B45'; ctx.fillRect(bx - 4, by + (srt > 0 ? sz * 0.2 : sz * 0.2), 2, sz * 0.6); }
      }
    }
    G.filterButtonAt = function (h) {
      const s = sh(); if (h.area !== 'cell') return null;
      const m = G.metrics();
      const test = (r, c, info) => { if (h.r !== r || h.c !== c) return null; const b = G.cellRect(r, c, m), sz = Math.min(b.h - 3, 16 * Math.max(0.8, m.z)); return h.x >= b.x + b.w - sz - 3 && h.y >= b.y + b.h - sz - 3 ? info : null; };
      if (s.af && h.r === s.af.r1 && h.c >= s.af.c1 && h.c <= s.af.c2) { const x = test(h.r, h.c, { kind: 'af', c: h.c }); if (x) return x; }
      for (const t of s.tables) if (t.header !== false && t.filter !== false && h.r === t.r1 && h.c >= t.c1 && h.c <= t.c2) { const x = test(h.r, h.c, { kind: 'table', t, c: h.c }); if (x) return x; }
      return null;
    };
    G.dvButtonAt = function (h) {
      if (h.area !== 'cell' || h.r !== G.sel.r || h.c !== G.sel.c) return false;
      const dv = A.dvAt && A.dvAt(sh(), h.r, h.c); if (!dv || dv.type !== 'list' || dv.drop === false) return false;
      const m = G.metrics(), b = G.cellRect(h.r, h.c, m); return h.x >= b.x + b.w && h.x <= b.x + b.w + 18 * Math.max(0.9, m.z) && h.y >= b.y && h.y <= b.y + b.h;
    };
    function drawOverlays(s, m) {
      const z = m.z;
      // flèches d'audit
      // plage propagée de la cellule active
      const k0 = KEY(G.sel.r, G.sel.c), own = s.spillOwner.get(k0); const anc = own != null ? own : (s.spills.has(k0) ? k0 : null);
      if (anc != null) { const g = s.spills.get(anc); if (g) { const rr = G.rangeRect(g, m); ctx.strokeStyle = '#2F6FDE'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeRect(rr.x + 0.5, rr.y + 0.5, rr.w - 2, rr.h - 2); ctx.setLineDash([]); } }
      // références de la formule en cours d'édition
      if (G.edit && G.refHi.length) {
        G.refHi.forEach((rf, i) => { if (rf.sh && rf.sh.toLowerCase() !== s.name.toLowerCase()) return; if (!rf.sh && G.edit.sh !== s) return; const rr = G.rangeRect(clampG(rf.g), m); const col = REF_COLORS[rf.ci % REF_COLORS.length]; ctx.fillStyle = col + '1F'; ctx.fillRect(rr.x, rr.y, rr.w, rr.h); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(rf.point ? [4, 3] : []); ctx.strokeRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2); ctx.setLineDash([]); [[rr.x, rr.y], [rr.x + rr.w, rr.y], [rr.x, rr.y + rr.h], [rr.x + rr.w, rr.y + rr.h]].forEach(([px, py]) => { ctx.fillRect(px - 2.5, py - 2.5, 5, 5); }); void i; });
      }
      // presse-papiers (tirets)
      if (A.clip && A.clip.sh === s && A.clip.marquee) { const rr = G.rangeRect(A.clip.g, m); ctx.strokeStyle = '#1E7B45'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -(Date.now() / 60 % 9); ctx.strokeRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2); ctx.setLineDash([]); ctx.lineDashOffset = 0; }
      // sélection
      if (!(G.edit && G.point && G.edit.sh !== s)) {
        const sel = G.sel;
        sel.ranges.forEach((g) => {
          const rr = G.rangeRect(clampG(g), m);
          ctx.fillStyle = 'rgba(30,123,69,0.10)'; ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
        });
        // cellule active : non teintée
        const act = s.mergeAt(sel.r, sel.c) || { r1: sel.r, c1: sel.c, r2: sel.r, c2: sel.c };
        const ar = G.rangeRect(act, m);
        if (sel.ranges.length > 1 || !TB.sameRange(sel.ranges[0], act)) { ctx.save(); ctx.beginPath(); ctx.rect(ar.x, ar.y, ar.w - 1, ar.h - 1); ctx.clip(); redrawCellArea(s, act, m); ctx.restore(); }
        const last = sel.ranges[sel.ranges.length - 1];
        const lr = G.rangeRect(clampG(last), m);
        ctx.strokeStyle = '#1E7B45'; ctx.lineWidth = 2;
        if (sel.ranges.length === 1) ctx.strokeRect(lr.x - 0.5, lr.y - 0.5, lr.w, lr.h);
        else { ctx.lineWidth = 1; sel.ranges.forEach((g) => { const rr = G.rangeRect(clampG(g), m); ctx.strokeRect(rr.x + 0.5, rr.y + 0.5, rr.w - 1, rr.h - 1); }); ctx.lineWidth = 2; ctx.strokeRect(ar.x - 0.5, ar.y - 0.5, ar.w, ar.h); }
        // poignée de recopie
        if (!G.edit && sel.ranges.length === 1 && !O.touch()) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(lr.x + lr.w - 4.5, lr.y + lr.h - 4.5, 8, 8); ctx.fillStyle = '#1E7B45'; ctx.fillRect(lr.x + lr.w - 3.5, lr.y + lr.h - 3.5, 6, 6); }
        // flèche de liste déroulante
        const dv = A.dvAt && A.dvAt(s, sel.r, sel.c);
        if (dv && dv.type === 'list' && dv.drop !== false && !G.edit) { const b = G.rangeRect(act, m), bw = 17 * Math.max(0.9, z); ctx.fillStyle = '#F3F4F6'; ctx.fillRect(b.x + b.w, b.y, bw, b.h); ctx.strokeStyle = '#9AA3AE'; ctx.lineWidth = 1; ctx.strokeRect(b.x + b.w + 0.5, b.y + 0.5, bw - 1, b.h - 1); ctx.fillStyle = '#333'; const cx2 = b.x + b.w + bw / 2, cy2 = b.y + b.h / 2; ctx.beginPath(); ctx.moveTo(cx2 - 4, cy2 - 2); ctx.lineTo(cx2 + 4, cy2 - 2); ctx.lineTo(cx2, cy2 + 3); ctx.closePath(); ctx.fill(); }
      }
      // remplissage en cours (poignée tirée)
      if (G.fillPrev) { const rr = G.rangeRect(G.fillPrev, m); ctx.strokeStyle = '#555'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeRect(rr.x + 0.5, rr.y + 0.5, rr.w - 1, rr.h - 1); ctx.setLineDash([]); }
      if (G.movePrev) { const rr = G.rangeRect(G.movePrev, m); ctx.strokeStyle = '#555'; ctx.setLineDash([3, 3]); ctx.lineWidth = 2; ctx.strokeRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2); ctx.setLineDash([]); }
      // flèches d'audit (antécédents / dépendants)
      G.arrows.forEach((a) => { if (a.sh !== s) return; const p = G.cellRect(a.from.r, a.from.c, m), q = G.cellRect(a.to.r, a.to.c, m); const x1 = p.x + Math.min(12, p.w / 2), y1 = p.y + p.h / 2, x2 = q.x + Math.min(12, q.w / 2), y2 = q.y + q.h / 2; ctx.strokeStyle = a.err ? '#D9363E' : '#2F6FDE'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5; if (a.range) { const rr = G.rangeRect(a.range, m); ctx.strokeRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2); } ctx.beginPath(); ctx.arc(x1, y1, 2.5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); const an = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 9 * Math.cos(an - 0.4), y2 - 9 * Math.sin(an - 0.4)); ctx.lineTo(x2 - 9 * Math.cos(an + 0.4), y2 - 9 * Math.sin(an + 0.4)); ctx.closePath(); ctx.fill(); });
      // sauts de page
      if (A.pageBreaks && A.settings && A.settings.breaks) { const br = A.pageBreaks(s); if (br) { ctx.strokeStyle = '#2F6FDE'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; br.rows.forEach((r) => { const y = G.cellRect(r, 0, m).y; ctx.beginPath(); ctx.moveTo(m.hw, y); ctx.lineTo(cv._w, y); ctx.stroke(); }); br.cols.forEach((c) => { const x = G.cellRect(0, c, m).x; ctx.beginPath(); ctx.moveTo(x, m.hh); ctx.lineTo(x, cv._h); ctx.stroke(); }); ctx.setLineDash([]); } }
    }
    function redrawCellArea(s, g, m) {
      const rr = G.rangeRect(g, m);
      const { st } = cellStyleOf(s, g.r1, g.c1, TB.CF ? TB.CF.prepare(A.wb, s, G.ver) : null);
      ctx.fillStyle = st.bg || '#FFFFFF'; ctx.fillRect(rr.x, rr.y, rr.w - 1, rr.h - 1);
      const v = s.get(g.r1, g.c1);
      if (v !== null && v !== '') drawText(s, [g.r1, g.c1, rr.x, rr.y, rr.w, rr.h, v, st, null, -1, g.r1 !== g.r2 || g.c1 !== g.c2], [], m, () => null);
    }
    const clampG = (g) => ({ r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(g.r1, extR + 50)), c2: Math.min(g.c2, Math.max(g.c1, extC + 20)) });
    function drawHeaders(s, m, rowsMain, colsMain, rowsFz, colsFz) {
      if (s.heads === false && !m.ob.r && !m.ob.c) return;
      const z = m.z, W = cv._w, H = cv._h;
      const sel = G.sel;
      const selC = (c) => sel.ranges.some((g) => c >= g.c1 && c <= g.c2), selR = (r) => sel.ranges.some((g) => r >= g.r1 && r <= g.r2);
      const fullC = (c) => sel.ranges.some((g) => g.r1 === 0 && g.r2 >= MAXR - 1 && c >= g.c1 && c <= g.c2), fullR = (r) => sel.ranges.some((g) => g.c1 === 0 && g.c2 >= MAXC - 1 && r >= g.r1 && r <= g.r2);
      const hf = Math.max(9, Math.min(15, 12 * z));
      ctx.font = '400 ' + hf + 'px ' + "system-ui, 'Segoe UI', sans-serif";
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      if (s.heads !== false) {
        // colonnes
        ctx.save(); ctx.beginPath(); ctx.rect(m.hw, m.ob.c, W - m.hw, m.hh0); ctx.clip();
        ctx.fillStyle = '#F3F4F6'; ctx.fillRect(m.hw, m.ob.c, W - m.hw, m.hh0);
        const drawCol = ([c, x, w]) => { const on = selC(c); if (on) { ctx.fillStyle = fullC(c) ? '#1E7B45' : '#D9EFDF'; ctx.fillRect(x, m.ob.c, w, m.hh0); } ctx.fillStyle = '#D5D9DF'; ctx.fillRect(Math.round(x + w) - 1, m.ob.c, 1, m.hh0); ctx.fillStyle = on ? (fullC(c) ? '#FFFFFF' : '#145A31') : '#4B5560'; if (w > 8) ctx.fillText(TB.colName(c), x + w / 2, m.ob.c + m.hh0 / 2 + 0.5); if (on) { ctx.fillStyle = '#1E7B45'; ctx.fillRect(x, m.ob.c + m.hh0 - 2, w, 2); } };
        colsFz.forEach(drawCol); ctx.save(); ctx.beginPath(); ctx.rect(m.hw + m.fW, m.ob.c, W, m.hh0); ctx.clip(); colsMain.forEach(drawCol); ctx.restore();
        ctx.fillStyle = '#C9CED5'; ctx.fillRect(m.hw, m.hh - 1, W - m.hw, 1);
        ctx.restore();
        // lignes
        ctx.save(); ctx.beginPath(); ctx.rect(m.ob.r, m.hh, m.hw0, H - m.hh); ctx.clip();
        ctx.fillStyle = '#F3F4F6'; ctx.fillRect(m.ob.r, m.hh, m.hw0, H - m.hh);
        const drawRow = ([r, y, h]) => { const on = selR(r); if (on) { ctx.fillStyle = fullR(r) ? '#1E7B45' : '#D9EFDF'; ctx.fillRect(m.ob.r, y, m.hw0, h); } ctx.fillStyle = '#D5D9DF'; ctx.fillRect(m.ob.r, Math.round(y + h) - 1, m.hw0, 1); ctx.fillStyle = on ? (fullR(r) ? '#FFFFFF' : '#145A31') : '#4B5560'; if (h > 7) ctx.fillText(String(r + 1), m.ob.r + m.hw0 / 2, y + h / 2 + 0.5); if (on) { ctx.fillStyle = '#1E7B45'; ctx.fillRect(m.hw - 2, y, 2, h); } };
        rowsFz.forEach(drawRow); ctx.save(); ctx.beginPath(); ctx.rect(m.ob.r, m.hh + m.fH, m.hw0, H); ctx.clip(); rowsMain.forEach(drawRow); ctx.restore();
        ctx.fillStyle = '#C9CED5'; ctx.fillRect(m.hw - 1, m.hh, 1, H - m.hh);
        ctx.restore();
        // coin
        ctx.fillStyle = '#ECEEF1'; ctx.fillRect(m.ob.r, m.ob.c, m.hw0, m.hh0); ctx.fillStyle = '#B7BEC7'; ctx.beginPath(); ctx.moveTo(m.hw - 4, m.hh - 12 * Math.min(1, z)); ctx.lineTo(m.hw - 4, m.hh - 4); ctx.lineTo(m.hw - 12 * Math.min(1, z), m.hh - 4); ctx.closePath(); ctx.fill();
      }
      // plan (grouper)
      if (m.ob.r || m.ob.c) drawOutline(s, m, rowsMain, colsMain, rowsFz, colsFz);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    function drawOutline(s, m, rowsMain, colsMain, rowsFz, colsFz) {
      const W = cv._w, H = cv._h;
      ctx.fillStyle = '#F7F8FA';
      if (m.ob.r) ctx.fillRect(0, 0, m.ob.r, H);
      if (m.ob.c) ctx.fillRect(0, 0, W, m.ob.c);
      ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // boutons de niveau
      const lv = (n, x, y) => { ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#9AA3AE'; ctx.lineWidth = 1; ctx.fillRect(x, y, 12, 12); ctx.strokeRect(x + 0.5, y + 0.5, 11, 11); ctx.fillStyle = '#333'; ctx.fillText(String(n), x + 6, y + 6.5); };
      if (m.ob.r) for (let i = 1; i <= m.ob.lr + 1; i++) lv(i, 2 + (i - 1) * 14, m.hh - 15);
      if (m.ob.c) for (let i = 1; i <= m.ob.lc + 1; i++) lv(i, m.hw - 15, 2 + (i - 1) * 14);
      ctx.strokeStyle = '#6B7480'; ctx.lineWidth = 1;
      if (m.ob.r) {
        const rows = rowsFz.concat(rowsMain);
        for (let L = 1; L <= m.ob.lr; L++) {
          const x = 2 + (L - 1) * 14 + 6;
          let start = null;
          const flush = (endY, endR) => { if (start == null) return; ctx.beginPath(); ctx.moveTo(x + 0.5, start); ctx.lineTo(x + 0.5, endY); ctx.lineTo(x + 5, endY); ctx.stroke(); start = null; void endR; };
          let prevY = null, prevR = -2;
          for (const [r, y, h] of rows) { const v = s.outR[r] || 0; if (v >= L) { if (start == null || r !== prevR + 1) { flush(prevY, prevR); start = y + 2; } prevY = y + h - 3; prevR = r; } else { if (start != null) { flush(prevY, prevR); btn(x - 6, y + h / 2 - 6, false); } } }
          flush(prevY, prevR);
        }
        // boutons + des groupes repliés
        const coll = s.collapsedR || {};
        rows.forEach(([r, y, h]) => { if (coll[r]) btn(2 + (coll[r] - 1) * 14, y + h / 2 - 6, true); });
      }
      if (m.ob.c) {
        const cols = colsFz.concat(colsMain);
        for (let L = 1; L <= m.ob.lc; L++) {
          const y = 2 + (L - 1) * 14 + 6; let start = null, prevX = null, prevC = -2;
          const flush = () => { if (start == null) return; ctx.beginPath(); ctx.moveTo(start, y + 0.5); ctx.lineTo(prevX, y + 0.5); ctx.lineTo(prevX, y + 5); ctx.stroke(); start = null; };
          for (const [c, x, w] of cols) { const v = s.outC[c] || 0; if (v >= L) { if (start == null || c !== prevC + 1) { flush(); start = x + 2; } prevX = x + w - 3; prevC = c; } else if (start != null) { flush(); btn(x + w / 2 - 6, y - 6, false); } }
          flush();
        }
      }
      function btn(x, y, plus) { ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#6B7480'; ctx.fillRect(x, y, 12, 12); ctx.strokeRect(x + 0.5, y + 0.5, 11, 11); ctx.fillStyle = '#333'; ctx.fillRect(x + 3, y + 5.5, 6, 1.2); if (plus) ctx.fillRect(x + 5.4, y + 3, 1.2, 6); ctx.strokeStyle = '#6B7480'; }
    }
    G.outlineHit = function (h) {
      const m = G.metrics(), s = sh();
      if (m.ob.r && h.y < m.hh && h.y >= m.hh - 16 && h.x < m.ob.r) { const lv = Math.floor((h.x - 2) / 14) + 1; if (lv >= 1 && lv <= m.ob.lr + 1) return { kind: 'levelR', lv }; }
      if (m.ob.c && h.x < m.hw && h.x >= m.hw - 16 && h.y < m.ob.c) { const lv = Math.floor((h.y - 2) / 14) + 1; if (lv >= 1 && lv <= m.ob.lc + 1) return { kind: 'levelC', lv }; }
      if (m.ob.r && h.x < m.ob.r && h.y > m.hh && h.r >= 0) { const L = Math.floor((h.x - 2) / 14) + 1; return { kind: 'toggleR', r: h.r, L, coll: (s.collapsedR || {})[h.r] }; }
      if (m.ob.c && h.y < m.ob.c && h.x > m.hw && h.c >= 0) { const L = Math.floor((h.y - 2) / 14) + 1; return { kind: 'toggleC', c: h.c, L }; }
      return null;
    };

    /* ---------------- objets (graphiques, images, formes) ---------------- */
    G.objPos = function (o) {
      const z = G.zoom;
      const x = ax.pos(o.from.c) + (o.from.dx || 0), y = ay.pos(o.from.r) + (o.from.dy || 0);
      return { x: x * z, y: y * z, w: o.w * z, h: o.h * z };
    };
    function placeObjects(m, o) {
      const s = sh();
      objs.style.left = m.hw + 'px'; objs.style.top = m.hh + 'px'; objs.style.width = Math.max(0, cv._w - m.hw) + 'px'; objs.style.height = Math.max(0, cv._h - m.hh) + 'px';
      objsIn.style.transform = 'translate(' + (-(o.sx * m.z) + m.fW - (m.fc ? 0 : 0) - (m.fW ? ax.pos(m.fc) * m.z - m.fW : 0)) + 'px,' + (-(o.sy * m.z) + m.fH - (m.fH ? ay.pos(m.fr) * m.z - m.fH : 0)) + 'px)';
      objsIn.style.transform = 'translate(' + (-(sc.scrollLeft)) + 'px,' + (-(sc.scrollTop)) + 'px)';
      if (A.renderObjects) A.renderObjects(s, m);
    }
    G.placeObjects = () => { const m = G.metrics(); placeObjects(m, scrollOrigin(m)); };

    /* ---------------- défilement ---------------- */
    sc.addEventListener('scroll', () => { G.hideTip(); if (A.closeCellPop) A.closeCellPop(); G.updateExtent(); paint(); }, { passive: true });
    window.addEventListener('resize', O.debounce(() => { G.updateExtent(); G.draw(); }, 60));
    if (window.ResizeObserver) new ResizeObserver(() => { G.updateExtent(); G.draw(); }).observe(host);
    /** rendre une cellule visible */
    G.scrollTo = function (r, c, opt) {
      const m = G.metrics(), z = m.z; const s = sh();
      const W = m.W - m.hw - m.fW, H = m.H - m.hh - m.fH;
      if (r >= m.fr) { const top = (ay.pos(r) - ay.pos(m.fr)) * z, bot = top + ay.size(r) * z; if (opt && opt.top) sc.scrollTop = top; else if (top < sc.scrollTop) sc.scrollTop = top; else if (bot > sc.scrollTop + H) sc.scrollTop = bot - H + 2; }
      if (c >= m.fc) { const left = (ax.pos(c) - ax.pos(m.fc)) * z, right = left + ax.size(c) * z; if (opt && opt.top) sc.scrollLeft = left; else if (left < sc.scrollLeft) sc.scrollLeft = left; else if (right > sc.scrollLeft + W) sc.scrollLeft = Math.min(left, right - W + 2); }
      void s; G.updateExtent();
      if (opt && opt.top) { if (r >= m.fr) sc.scrollTop = (ay.pos(r) - ay.pos(m.fr)) * z; if (c >= m.fc) sc.scrollLeft = (ax.pos(c) - ax.pos(m.fc)) * z; }
    };

    /* ---------------- sélection ---------------- */
    const norm = (g) => ({ r1: Math.min(g.r1, g.r2), c1: Math.min(g.c1, g.c2), r2: Math.max(g.r1, g.r2), c2: Math.max(g.c1, g.c2) });
    /** agrandir une plage pour couvrir entièrement les fusions qu'elle touche */
    G.expandMerges = function (g) {
      const s = sh(); if (!s.merges.length) return g; g = Object.assign({}, g); let ch = true;
      while (ch) { ch = false; for (const m of s.merges) if (m.r1 <= g.r2 && m.r2 >= g.r1 && m.c1 <= g.c2 && m.c2 >= g.c1 && (m.r1 < g.r1 || m.r2 > g.r2 || m.c1 < g.c1 || m.c2 > g.c2)) { g.r1 = Math.min(g.r1, m.r1); g.r2 = Math.max(g.r2, m.r2); g.c1 = Math.min(g.c1, m.c1); g.c2 = Math.max(g.c2, m.c2); ch = true; } }
      return g;
    };
    G.select = function (r, c, opt) {
      opt = opt || {};
      r = TB.clamp(r, 0, MAXR - 1); c = TB.clamp(c, 0, MAXC - 1);
      const s = sh();
      if (opt.extend) {
        const a = G.sel.anchor; const g = G.expandMerges(norm({ r1: a.r, c1: a.c, r2: r, c2: c }));
        G.sel.ranges[G.sel.ranges.length - 1] = g; G.sel.ext = { r, c };
      } else if (opt.add) {
        const m = s.mergeAt(r, c); G.sel.ranges.push(m ? Object.assign({}, m) : { r1: r, c1: c, r2: r, c2: c }); G.sel.r = r; G.sel.c = c; G.sel.anchor = { r, c }; G.sel.ext = null;
      } else {
        const m = s.mergeAt(r, c);
        G.sel = { r: m ? m.r1 : r, c: m ? m.c1 : c, ranges: [m ? Object.assign({}, m) : { r1: r, c1: c, r2: r, c2: c }], anchor: { r, c }, ext: null };
      }
      if (!opt.noScroll) G.scrollTo(opt.extend ? r : G.sel.r, opt.extend ? c : G.sel.c);
      s.sel = { r: G.sel.r, c: G.sel.c, ranges: G.sel.ranges.map((g) => Object.assign({}, g)) };
      G.draw(); if (A.onSelect) A.onSelect();
    };
    G.setRange = function (g, opt) {
      opt = opt || {}; g = norm(g);
      G.sel = { r: opt.r != null ? opt.r : g.r1, c: opt.c != null ? opt.c : g.c1, ranges: [g], anchor: { r: g.r1, c: g.c1 }, ext: { r: g.r2, c: g.c2 } };
      if (!opt.noScroll) G.scrollTo(G.sel.r, G.sel.c);
      sh().sel = { r: G.sel.r, c: G.sel.c, ranges: [Object.assign({}, g)] };
      G.draw(); if (A.onSelect) A.onSelect();
    };
    G.range = () => G.sel.ranges[G.sel.ranges.length - 1];
    G.restoreSel = function () {
      const s = sh(), x = s.sel;
      if (x && x.ranges && x.ranges.length) G.sel = { r: x.r, c: x.c, ranges: x.ranges.map((g) => Object.assign({}, g)), anchor: { r: x.ranges[x.ranges.length - 1].r1, c: x.ranges[x.ranges.length - 1].c1 }, ext: null };
      else G.sel = { r: 0, c: 0, ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], anchor: { r: 0, c: 0 }, ext: null };
    };
    /** déplacement clavier (Ctrl : jusqu'au bord des données ; extend : Maj) */
    G.move = function (dr, dc, opt) {
      opt = opt || {}; const s = sh();
      const from = opt.extend ? (G.sel.ext || { r: G.sel.anchor.r, c: G.sel.anchor.c }) : { r: G.sel.r, c: G.sel.c };
      let r = from.r, c = from.c;
      if (opt.jump) { const p = G.jump(r, c, dr, dc); r = p.r; c = p.c; }
      else {
        if (!opt.extend) { const m = s.mergeAt(r, c); if (m) { if (dr > 0) r = m.r2; if (dc > 0) c = m.c2; if (dr < 0) r = m.r1; if (dc < 0) c = m.c1; } }
        if (dr) r = ay.next(r, dr > 0 ? 1 : -1); if (dc) c = ax.next(c, dc > 0 ? 1 : -1);
        if (Math.abs(dr) > 1) { for (let i = 1; i < Math.abs(dr); i++) r = ay.next(r, dr > 0 ? 1 : -1); }
      }
      r = TB.clamp(r, 0, MAXR - 1); c = TB.clamp(c, 0, MAXC - 1);
      G.select(r, c, { extend: opt.extend });
    };
    G.jump = function (r, c, dr, dc) {
      const s = sh(), e = s.extent();
      const filled = (rr, cc) => s.get(rr, cc) !== null;
      const lim = dr ? (dr > 0 ? MAXR - 1 : 0) : (dc > 0 ? MAXC - 1 : 0);
      const step = (p) => dr ? { r: p.r + dr, c: p.c } : { r: p.r, c: p.c + dc };
      const out = (p) => p.r < 0 || p.c < 0 || p.r >= MAXR || p.c >= MAXC;
      let p = { r, c }; let n = step(p);
      if (out(n)) return p;
      // au-delà des données : bord de la feuille
      if ((dr > 0 && r >= e.r) || (dc > 0 && c >= e.c)) return dr ? { r: lim, c } : { r, c: lim };
      if (filled(r, c) && filled(n.r, n.c)) { while (!out(step(n)) && filled(step(n).r, step(n).c)) n = step(n); return n; }
      while (!out(n) && !filled(n.r, n.c)) { if ((dr > 0 && n.r > e.r) || (dc > 0 && n.c > e.c)) return dr ? { r: lim, c } : { r, c: lim }; n = step(n); }
      return out(n) ? (dr ? { r: lim, c } : { r, c: lim }) : n;
    };
    G.selectAll = function () { const s = sh(), cur = G.range(); const reg = G.region(G.sel.r, G.sel.c); if (reg && !TB.sameRange(reg, cur) && !(reg.r1 === reg.r2 && reg.c1 === reg.c2)) { G.setRange(reg, { r: G.sel.r, c: G.sel.c, noScroll: true }); return; } void s; G.setRange({ r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }, { r: G.sel.r, c: G.sel.c, noScroll: true }); };
    /** zone de données contiguë autour d'une cellule (Ctrl+A, tri, filtre, TCD…) */
    G.region = function (r, c) {
      const s = sh(); const f = (rr, cc) => rr >= 0 && cc >= 0 && s.get(rr, cc) !== null;
      if (!f(r, c) && !f(r - 1, c) && !f(r + 1, c) && !f(r, c - 1) && !f(r, c + 1)) return null;
      let g = { r1: r, c1: c, r2: r, c2: c }, ch = true, guard = 0;
      while (ch && guard++ < 10000) {
        ch = false;
        const rowHas = (rr) => { for (let cc = g.c1 - 1; cc <= g.c2 + 1; cc++) if (f(rr, cc)) return true; return false; };
        const colHas = (cc) => { for (let rr = g.r1 - 1; rr <= g.r2 + 1; rr++) if (f(rr, cc)) return true; return false; };
        if (g.r1 > 0 && rowHas(g.r1 - 1)) { g.r1--; ch = true; }
        if (rowHas(g.r2 + 1)) { g.r2++; ch = true; if (g.r2 - g.r1 > 2000) { const e = s.extent(); let rr = g.r2; while (rr < e.r && rowHas(rr + 1)) rr++; g.r2 = rr; } }
        if (g.c1 > 0 && colHas(g.c1 - 1)) { g.c1--; ch = true; }
        if (colHas(g.c2 + 1)) { g.c2++; ch = true; }
      }
      return g;
    };

    /* ---------------- édition ---------------- */
    G.isEditing = () => !!G.edit;
    G.beginEdit = function (opt) {
      opt = opt || {}; const s = sh();
      if (A.canEdit && !A.canEdit(s, G.sel.r, G.sel.c)) return false;
      const m0 = s.mergeAt(G.sel.r, G.sel.c);
      const text = opt.text != null ? opt.text : A.wb.editText(s, G.sel.r, G.sel.c);
      G.edit = { sh: s, r: m0 ? m0.r1 : G.sel.r, c: m0 ? m0.c1 : G.sel.c, mode: opt.mode || 'enter', orig: A.wb.editText(s, G.sel.r, G.sel.c), src: opt.src || 'cell' };
      G.point = null;
      ed.value = text; ed.classList.add('on');
      const st = G.styleAt(G.edit.r, G.edit.c);
      ed.style.font = fontOf(st, G.zoom).replace(/^italic\s+/, st.i ? 'italic ' : '');
      ed.style.color = st.fc || '#000'; ed.style.background = st.bg || '#fff';
      ed.style.textAlign = st.ha === 'center' ? 'center' : st.ha === 'right' ? 'right' : 'left';
      placeEditor(G.metrics());
      if (opt.src !== 'bar') { ed.focus({ preventScroll: true }); const p = opt.caret != null ? opt.caret : ed.value.length; try { ed.setSelectionRange(p, p); } catch (e) { } }
      G.onEditInput(true);
      if (A.onEditState) A.onEditState(true);
      G.draw();
      return true;
    };
    function placeEditor(m) {
      if (!G.edit) { ed.classList.remove('on'); return; }
      if (G.edit.sh !== sh()) { ed.style.left = '-9999px'; return; }
      const g = sh().mergeAt(G.edit.r, G.edit.c) || { r1: G.edit.r, c1: G.edit.c, r2: G.edit.r, c2: G.edit.c };
      const rr = G.rangeRect(g, m);
      const maxW = Math.max(rr.w, cv._w - rr.x - 4);
      ed.style.left = (rr.x - 1) + 'px'; ed.style.top = (rr.y - 1) + 'px';
      ed.style.minWidth = (rr.w + 2) + 'px'; ed.style.minHeight = (rr.h + 2) + 'px';
      ed.style.width = 'auto'; ed.style.height = 'auto';
      // largeur au contenu
      const lines = ed.value.split('\n'); const font = ed.style.font;
      let w = 0; lines.forEach((l) => { w = Math.max(w, textW(ctx, font, l || ' ')); });
      const st = G.styleAt(G.edit.r, G.edit.c);
      const wrap = st.wr;
      const W2 = wrap ? rr.w + 2 : Math.min(maxW, Math.max(rr.w + 2, w + 14));
      ed.style.width = W2 + 'px';
      ed.style.height = '0px'; ed.style.height = Math.max(rr.h + 2, ed.scrollHeight + 2) + 'px';
    }
    G.placeEditor = () => placeEditor(G.metrics());
    G.editText = () => G.edit ? (G.edit.src === 'bar' && A.fx ? A.fx.value : ed.value) : '';
    G.setEditText = function (t, caret) {
      ed.value = t; if (A.fx) A.fx.value = t;
      const el = G.edit && G.edit.src === 'bar' && A.fx ? A.fx : ed;
      if (caret != null) { try { el.setSelectionRange(caret, caret); } catch (e) { } }
      G.onEditInput();
    };
    G.editEl = () => G.edit && G.edit.src === 'bar' && A.fx ? A.fx : ed;
    G.onEditInput = function (first) {
      if (!G.edit) return;
      const t = G.editEl().value;
      if (G.edit.src === 'bar') ed.value = t; else if (A.fx && A.fx.value !== t) A.fx.value = t;
      // références colorées
      G.refHi = [];
      if (/^[=+-]/.test(t) && t.length > 1) {
        const refs = P.refsIn(t.replace(/^[=+]/, ' ').replace(/^-/, ' '));
        const seen = new Map(); let ci = 0;
        refs.forEach((rf) => { const k = (rf.sh || '') + rf.text.replace(/\$/g, '').toUpperCase(); let c = seen.get(k); if (c == null) { c = ci++; seen.set(k, c); } G.refHi.push({ g: rf.g, sh: rf.sh, ci: c, start: rf.start, end: rf.end, point: G.point && rf.start === G.point.start }); });
      }
      if (!first) placeEditor(G.metrics());
      if (A.onEditInput) A.onEditInput(t, first);
      G.draw();
    };
    ed.addEventListener('input', () => { if (G.point && !G.point.keep) G.point = null; if (G.point) G.point.keep = false; G.onEditInput(); });
    G.cancelEdit = function () {
      if (!G.edit) return; const back = G.edit.sh;
      G.edit = null; G.point = null; G.refHi = []; ed.classList.remove('on'); ed.value = '';
      if (back !== sh() && A.showSheet) A.showSheet(back);
      if (A.onEditState) A.onEditState(false);
      G.focus(); G.draw();
    };
    /** valider la saisie ; dir : 'down' | 'up' | 'right' | 'left' | null ; opt : {all (Ctrl+Entrée), array (Ctrl+Maj+Entrée)} */
    G.commitEdit = function (dir, opt) {
      if (!G.edit) return true;
      opt = opt || {};
      const e = G.edit, text = G.editEl().value;
      if (A.commitInput) { const ok = A.commitInput(e.sh, e.r, e.c, text, opt, e); if (ok === false) return false; }
      G.edit = null; G.point = null; G.refHi = []; ed.classList.remove('on'); ed.value = '';
      if (e.sh !== sh() && A.showSheet) A.showSheet(e.sh);
      if (A.onEditState) A.onEditState(false);
      if (dir) G.advance(dir);
      G.focus(); G.draw();
      return true;
    };
    /** Entrée / Tab : cellule suivante (dans la sélection si elle compte plusieurs cellules) */
    G.advance = function (dir) {
      const g = G.range(), multi = G.sel.ranges.length > 1 || g.r1 !== g.r2 || g.c1 !== g.c2;
      if (multi && G.sel.ranges.length === 1 && TB.rangeSize(g) < 1e7) {
        let { r, c } = G.sel;
        const s = sh();
        const nextIn = () => {
          if (dir === 'down') { r++; if (r > g.r2) { r = g.r1; c++; if (c > g.c2) c = g.c1; } }
          else if (dir === 'up') { r--; if (r < g.r1) { r = g.r2; c--; if (c < g.c1) c = g.c2; } }
          else if (dir === 'right') { c++; if (c > g.c2) { c = g.c1; r++; if (r > g.r2) r = g.r1; } }
          else { c--; if (c < g.c1) { c = g.c2; r--; if (r < g.r1) r = g.r2; } }
        };
        let guard = 0; do { nextIn(); } while (guard++ < 1000 && (s.hidR.has(r) || s.hidC.has(c)));
        G.sel.r = r; G.sel.c = c; G.scrollTo(r, c); G.draw(); if (A.onSelect) A.onSelect(); return;
      }
      if (dir === 'down') { const t = G.sel.tabStart; if (t != null && t !== G.sel.c) G.select(G.sel.r + 1, t); else G.move(1, 0); } else if (dir === 'up') G.move(-1, 0); else if (dir === 'right') { if (!G.sel.tabStart) G.sel.tabStart = G.sel.c; const t = G.sel.tabStart; G.move(0, 1); G.sel.tabStart = t; } else G.move(0, -1);
    };
    G.focus = function () { if (!G.edit) { try { sc.focus({ preventScroll: true }); } catch (e) { } } };
    /** pointage d'une référence pendant la saisie d'une formule */
    G.pointable = function () {
      if (!G.edit) return false; const el = G.editEl(), t = el.value; if (!/^[=+-]/.test(t)) return false;
      const caret = el.selectionStart;
      if (G.point && caret === G.point.end) return true;
      return P.canPoint(t, caret);
    };
    G.pointTo = function (g, sheet) {
      const el = G.editEl(); let t = el.value, caret = el.selectionStart;
      const pfx = sheet && sheet !== G.edit.sh ? TB.quoteSheet(sheet.name) + '!' : '';
      const ref = pfx + (g.r1 === g.r2 && g.c1 === g.c2 ? TB.addr(g.r1, g.c1) : (g.r1 === 0 && g.r2 >= MAXR - 1 ? TB.colName(g.c1) + ':' + TB.colName(g.c2) : g.c1 === 0 && g.c2 >= MAXC - 1 ? (g.r1 + 1) + ':' + (g.r2 + 1) : TB.addr(g.r1, g.c1) + ':' + TB.addr(g.r2, g.c2)));
      let start = caret;
      if (G.point && caret === G.point.end) { start = G.point.start; t = t.slice(0, G.point.start) + t.slice(G.point.end); }
      t = t.slice(0, start) + ref + t.slice(start);
      G.point = Object.assign({}, G.point || {}, { start, end: start + ref.length, keep: true, g, sheet: sheet || G.edit.sh });
      el.value = t; try { el.setSelectionRange(start + ref.length, start + ref.length); } catch (e) { }
      if (el === ed && A.fx) A.fx.value = t; else ed.value = t;
      G.onEditInput();
    };

    /* ---------------- poignées tactiles ---------------- */
    function placeHandles(m) {
      const touch = O.touch();
      if (!touch || G.edit) { h1.style.display = h2.style.display = 'none'; return; }
      const g = G.range(); const rr = G.rangeRect(clampG(g), m);
      h1.style.display = h2.style.display = 'block';
      h1.style.left = (rr.x - 11) + 'px'; h1.style.top = (rr.y - 11) + 'px';
      h2.style.left = (rr.x + rr.w - 11) + 'px'; h2.style.top = (rr.y + rr.h - 11) + 'px';
    }
    [h1, h2].forEach((h, i) => h.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const g = G.range(); const anchor = i === 0 ? { r: g.r2, c: g.c2 } : { r: g.r1, c: g.c1 };
      h.setPointerCapture(e.pointerId);
      const mv = (ev) => { const b = host.getBoundingClientRect(); const ht = G.hit(ev.clientX - b.left, ev.clientY - b.top); if (ht.r < 0 || ht.c < 0) return; G.sel.anchor = anchor; G.select(ht.r, ht.c, { extend: true, noScroll: true }); autoScroll(ev); };
      const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); stopAuto(); };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    }));

    /* ---------------- souris et doigt ---------------- */
    let autoT = null, lastEv = null;
    function autoScroll(e) {
      lastEv = e; if (autoT) return;
      autoT = setInterval(() => {
        const b = host.getBoundingClientRect(), m = G.metrics(); const x = lastEv.clientX - b.left, y = lastEv.clientY - b.top;
        let dx = 0, dy = 0;
        if (x > b.width - 20) dx = Math.min(80, (x - b.width + 20) * 2); else if (x < m.hw + m.fW + 4 && sc.scrollLeft > 0) dx = -Math.min(80, (m.hw + m.fW + 4 - x) * 2);
        if (y > b.height - 20) dy = Math.min(120, (y - b.height + 20) * 3); else if (y < m.hh + m.fH + 4 && sc.scrollTop > 0) dy = -Math.min(120, (m.hh + m.fH + 4 - y) * 3);
        if (dx || dy) { sc.scrollLeft += dx; sc.scrollTop += dy; if (G._dragMove) G._dragMove(lastEv); }
      }, 40);
    }
    function stopAuto() { clearInterval(autoT); autoT = null; }
    const pos = (e) => { const b = host.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    let lastTap = 0, lastTapCell = null, longT = null, pinch = null;
    const pointers = new Map();
    sc.addEventListener('pointerdown', (e) => {
      if (e.target !== sc && e.target !== spacer) return;
      const p = pos(e);
      // barres de défilement
      if (p.x > sc.clientWidth || p.y > sc.clientHeight) return;
      pointers.set(e.pointerId, p);
      if (pointers.size === 2 && e.pointerType === 'touch') { const [a, b] = Array.from(pointers.values()); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: G.zoom }; clearTimeout(longT); return; }
      const h = G.hit(p.x, p.y);
      if (e.button === 2) { onContext(e, h); return; }
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.pointerType === 'touch') { touchStart(e, h, p); return; }
      e.preventDefault();
      mouseDown(e, h, p);
    });
    sc.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pos(e));
      if (pinch && pointers.size === 2) { const [a, b] = Array.from(pointers.values()); const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch.d > 10) { const z = TB.clamp(Math.round(pinch.z * d / pinch.d * 20) / 20, 0.3, 3); if (z !== G.zoom && A.setZoom) A.setZoom(z); } return; }
      if (G._drag) return;
      if (e.pointerType !== 'mouse') return;
      const p = pos(e), h = G.hit(p.x, p.y);
      sc.style.cursor = cursorFor(h, p);
      hover(h, p);
    });
    const endPointer = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
    sc.addEventListener('pointerup', endPointer); sc.addEventListener('pointercancel', (e) => { endPointer(e); clearTimeout(longT); });
    sc.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    sc.addEventListener('pointerleave', () => { if (!G._drag) G.hideTip(); });
    function cursorFor(h, p) {
      if (h.resize) return h.resize.axis === 'c' ? 'col-resize' : 'row-resize';
      if (h.area === 'col') return 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\'%3E%3Cpath d=\'M8 15 L3 8 H6 V1 H10 V8 H13 Z\' fill=\'%23222\' stroke=\'%23fff\'/%3E%3C/svg%3E") 8 15, s-resize';
      if (h.area === 'row') return 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\'%3E%3Cpath d=\'M15 8 L8 3 V6 H1 V10 H8 V13 Z\' fill=\'%23222\' stroke=\'%23fff\'/%3E%3C/svg%3E") 15 8, e-resize';
      if (h.area === 'cell') {
        if (onFillHandle(p)) return 'crosshair';
        if (G.filterButtonAt(h) || G.dvButtonAt(h)) return 'default';
        if (onSelBorder(p)) return 'move';
        const lk = sh().links.get(KEY(h.r, h.c)); if (lk) return 'pointer';
        return 'cell';
      }
      if (h.area === 'outline') return 'pointer';
      return 'default';
    }
    function onFillHandle(p) { if (G.edit || G.sel.ranges.length !== 1) return false; const rr = G.rangeRect(clampG(G.range())); return Math.abs(p.x - (rr.x + rr.w)) <= 5 && Math.abs(p.y - (rr.y + rr.h)) <= 5; }
    function onSelBorder(p) {
      if (G.edit || G.sel.ranges.length !== 1) return false; const g = G.range(); if (g.r2 - g.r1 > 100000 || g.c2 - g.c1 > 1000) return false;
      const rr = G.rangeRect(clampG(g)); const near = (a, b) => Math.abs(a - b) <= 3;
      const inX = p.x >= rr.x - 3 && p.x <= rr.x + rr.w + 3, inY = p.y >= rr.y - 3 && p.y <= rr.y + rr.h + 3;
      return (inY && (near(p.x, rr.x) || near(p.x, rr.x + rr.w))) || (inX && (near(p.y, rr.y) || near(p.y, rr.y + rr.h)));
    }
    let tipFor = null;
    function hover(h, p) {
      if (h.area !== 'cell' || G.edit) { G.hideTip(); return; }
      const s = sh(), k = KEY(h.r, h.c);
      const key = s.id + ':' + k;
      if (tipFor === key) return; tipFor = key;
      const note = s.notes.get(k), th = s.threads.get(k), lk = s.links.get(k);
      if (note) { G.showTip(h.r, h.c, '<b>' + O.esc(note.author || '') + (note.author ? ' :' : '') + '</b>' + O.esc(note.text || ''), 'note'); return; }
      if (th && th.items && th.items.length) { G.showTip(h.r, h.c, th.items.slice(0, 3).map((x) => '<div class="who">' + O.esc(x.author || 'Commentaire') + '</div>' + O.esc(x.text)).join('<hr style="border:0;border-top:1px solid #eee;margin:4px 0">') + (th.done ? '<div style="color:#2b8a3e;font-size:11px">Résolu</div>' : ''), 'cm'); return; }
      if (lk) { G.showTip(h.r, h.c, O.esc(lk.tip || lk.url || lk.ref || '') + '\nCtrl+clic pour suivre le lien.', 'dv'); return; }
      G.hideTip(); void p;
    }
    G.showTip = function (r, c, html, kind) {
      const m = G.metrics(), rr = G.cellRect(r, c, m);
      tip.innerHTML = html; tip.className = 'on ' + (kind || '');
      let x = rr.x + rr.w + 6, y = rr.y;
      tip.style.left = '0px'; tip.style.top = '0px';
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      if (x + tw > cv._w - 4) x = Math.max(4, rr.x - tw - 6);
      if (y + th > cv._h - 4) y = Math.max(4, cv._h - th - 4);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    };
    G.hideTip = function () { tip.className = ''; tipFor = null; };

    function mouseDown(e, h, p) {
      G.hideTip();
      const s = sh();
      if (h.area === 'outline' || (h.area === 'corner' && G.outlineHit(h))) { const o = G.outlineHit(h); if (o && A.outlineClick) A.outlineClick(o); return; }
      // édition en cours : pointage ou validation
      if (G.edit) {
        if ((h.area === 'cell' || h.area === 'col' || h.area === 'row') && G.pointable()) { pointDrag(e, h); return; }
        if (h.area === 'cell' && G.edit.sh === s && h.r === G.edit.r && h.c === G.edit.c) return;
        if (!G.commitEdit(null)) return;
      }
      if (h.resize) { resizeDrag(e, h); return; }
      if (h.area === 'corner') { G.setRange({ r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }, { noScroll: true }); G.focus(); return; }
      if (h.area === 'col' || h.area === 'row') { headerDrag(e, h); return; }
      if (h.area !== 'cell') return;
      const fb = G.filterButtonAt(h); if (fb) { if (A.openFilter) A.openFilter(fb, G.cellRect(h.r, h.c)); return; }
      if (G.dvButtonAt(h)) { if (A.openDvList) A.openDvList(); return; }
      if (onFillHandle(p)) { fillDrag(e); return; }
      if (onSelBorder(p)) { moveDrag(e, h); return; }
      // lien : Ctrl+clic
      const lk = s.links.get(KEY(h.r, h.c)); if (lk && O.modKey(e)) { if (A.followLink) A.followLink(lk); return; }
      if (A.objectsDeselect) A.objectsDeselect();
      if (e.detail === 2 && !e.shiftKey && !O.modKey(e)) { G.select(h.r, h.c, { noScroll: true }); G.beginEdit({ mode: 'edit' }); return; }
      if (e.shiftKey) G.select(h.r, h.c, { extend: true, noScroll: true });
      else G.select(h.r, h.c, { add: O.modKey(e), noScroll: true });
      if (A.painterApply && A.painter) { /* reproduire la mise en forme : au relâchement */ }
      G.focus();
      selDrag(e);
    }
    function dragLoop(e, onMove, onEnd) {
      G._drag = true;
      const mv = (ev) => { onMove(ev); autoScroll(ev); };
      G._dragMove = onMove;
      const up = (ev) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); stopAuto(); G._drag = false; G._dragMove = null; onEnd && onEnd(ev); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      void e;
    }
    function selDrag(e) {
      dragLoop(e, (ev) => { const p = pos(ev), h = G.hit(p.x, p.y); const r = Math.max(0, h.r < 0 ? 0 : h.r), c = Math.max(0, h.c < 0 ? 0 : h.c); const ext = G.sel.ext || G.sel.anchor; if (ext.r !== r || ext.c !== c) G.select(r, c, { extend: true, noScroll: true }); }, () => { if (A.painter && A.painterApply) A.painterApply(); if (A.onSelectEnd) A.onSelectEnd(); });
    }
    function headerDrag(e, h) {
      const col = h.area === 'col';
      const full = (i, j) => col ? { r1: 0, c1: Math.min(i, j), r2: MAXR - 1, c2: Math.max(i, j) } : { r1: Math.min(i, j), c1: 0, r2: Math.max(i, j), c2: MAXC - 1 };
      const i0 = col ? h.c : h.r;
      if (e.shiftKey) { const a = col ? G.sel.anchor.c : G.sel.anchor.r; const g = full(a, i0); G.sel.ranges[G.sel.ranges.length - 1] = g; G.draw(); if (A.onSelect) A.onSelect(); }
      else if (O.modKey(e)) { G.sel.ranges.push(full(i0, i0)); G.sel.r = col ? G.visible.r1 : i0; G.sel.c = col ? i0 : G.visible.c1; G.sel.anchor = { r: G.sel.r, c: G.sel.c }; G.draw(); if (A.onSelect) A.onSelect(); }
      else { G.setRange(full(i0, i0), { r: col ? Math.max(G.visible.r1, (sh().freeze || {}).r ? 0 : G.visible.r1) : i0, c: col ? i0 : G.visible.c1, noScroll: true }); G.sel.anchor = { r: col ? 0 : i0, c: col ? i0 : 0 }; }
      G.focus();
      dragLoop(e, (ev) => { const p = pos(ev), hh = G.hit(p.x, p.y); const j = col ? hh.c : hh.r; if (j < 0) return; G.sel.ranges[G.sel.ranges.length - 1] = full(i0, j); G.draw(); if (A.onSelect) A.onSelect(); });
    }
    function resizeDrag(e, h) {
      const { axis, i } = h.resize; const s = sh(), z = G.zoom;
      // double-clic : ajustement automatique
      if (e.detail === 2) { if (A.autofit) A.autofit(axis, i); return; }
      const start = axis === 'c' ? (s.colWidth(i)) : (s.rowHeight(i)), p0 = pos(e);
      let cur = start;
      const tipShow = () => { const b = G.cellRect(axis === 'r' ? i : 0, axis === 'c' ? i : 0); tip.className = 'on dv'; tip.textContent = axis === 'c' ? 'Largeur : ' + (Math.max(0, (cur - 5) / 7)).toFixed(2).replace('.', ',') + ' (' + Math.round(cur) + ' pixels)' : 'Hauteur : ' + (cur * 0.75).toFixed(2).replace('.', ',') + ' (' + Math.round(cur) + ' pixels)'; tip.style.left = Math.max(4, (axis === 'c' ? b.x + b.w : 40)) + 'px'; tip.style.top = Math.max(4, axis === 'r' ? b.y + b.h : 26) + 'px'; };
      tipShow();
      dragLoop(e, (ev) => {
        const p = pos(ev); cur = Math.max(0, Math.round(start + (axis === 'c' ? p.x - p0.x : p.y - p0.y) / z));
        // aperçu immédiat
        if (axis === 'c') s.colW[i] = cur; else s.rowH[i] = cur;
        if (!cur) { if (axis === 'c') s.colW[i] = start; else s.rowH[i] = start; }
        G.ver++; G.updateExtent(); paint(); tipShow();
      }, () => {
        G.hideTip();
        if (axis === 'c') s.colW[i] = start; else s.rowH[i] = start;
        if (cur !== start && A.setSize) A.setSize(axis, i, cur);
      });
    }
    function fillDrag(e) {
      const g = Object.assign({}, G.range());
      dragLoop(e, (ev) => {
        const p = pos(ev), h = G.hit(p.x, p.y); if (h.r < 0 || h.c < 0) return;
        const dr = h.r > g.r2 ? h.r - g.r2 : h.r < g.r1 ? h.r - g.r1 : 0, dc = h.c > g.c2 ? h.c - g.c2 : h.c < g.c1 ? h.c - g.c1 : 0;
        let t;
        if (Math.abs(dr) >= Math.abs(dc) && dr) t = dr > 0 ? { r1: g.r1, c1: g.c1, r2: h.r, c2: g.c2 } : { r1: h.r, c1: g.c1, r2: g.r2, c2: g.c2 };
        else if (dc) t = dc > 0 ? { r1: g.r1, c1: g.c1, r2: g.r2, c2: h.c } : { r1: g.r1, c1: h.c, r2: g.r2, c2: g.c2 };
        else if (h.r >= g.r1 && h.r < g.r2 && h.c >= g.c1 && h.c <= g.c2) t = { r1: g.r1, c1: g.c1, r2: h.r, c2: g.c2, shrink: true };
        else t = null;
        G.fillPrev = t; G.draw();
        if (t && !t.shrink) { const n = t.r2 - t.r1 + 1 > g.r2 - g.r1 + 1 ? t.r2 : t.c2; void n; if (A.fillPreviewTip) A.fillPreviewTip(g, t, ev); }
      }, (ev) => {
        const t = G.fillPrev; G.fillPrev = null; G.hideTip();
        if (t && A.fillTo) A.fillTo(g, t, { ctrl: O.modKey(ev) });
        G.draw();
      });
    }
    function moveDrag(e) {
      const g = Object.assign({}, G.range()); const p0 = pos(e); const h0 = G.hit(p0.x, p0.y);
      dragLoop(e, (ev) => { const p = pos(ev), h = G.hit(p.x, p.y); if (h.r < 0 || h.c < 0) return; const dr = h.r - h0.r, dc = h.c - h0.c; const t = { r1: g.r1 + dr, c1: g.c1 + dc, r2: g.r2 + dr, c2: g.c2 + dc }; if (t.r1 < 0 || t.c1 < 0) return; G.movePrev = t; G.draw(); }, (ev) => {
        const t = G.movePrev; G.movePrev = null; G.draw();
        if (t && (t.r1 !== g.r1 || t.c1 !== g.c1) && A.moveRange) A.moveRange(g, t, { copy: O.modKey(ev) });
      });
    }
    function pointDrag(e, h) {
      const s = sh();
      let a = { r: Math.max(0, h.r), c: Math.max(0, h.c) };
      const toG = (b) => h.area === 'col' ? { r1: 0, c1: Math.min(a.c, b.c), r2: MAXR - 1, c2: Math.max(a.c, b.c) } : h.area === 'row' ? { r1: Math.min(a.r, b.r), c1: 0, r2: Math.max(a.r, b.r), c2: MAXC - 1 } : norm({ r1: a.r, c1: a.c, r2: b.r, c2: b.c });
      if (e.shiftKey && G.point) a = { r: G.point.g.r1, c: G.point.g.c1 };
      G.pointTo(toG(a), s);
      dragLoop(e, (ev) => { const p = pos(ev), hh = G.hit(p.x, p.y); if (hh.r < 0 && h.area !== 'col' || hh.c < 0 && h.area !== 'row') return; const b = { r: Math.max(0, hh.r), c: Math.max(0, hh.c) }; G.pointTo(toG(b), s); }, () => { try { G.editEl().focus({ preventScroll: true }); } catch (x) { } });
    }
    function onContext(e, h) {
      e.preventDefault();
      if (h.area === 'cell') { const inSel = G.sel.ranges.some((g) => TB.inRange(g, h.r, h.c)); if (!inSel) { if (G.edit) G.commitEdit(null); G.select(h.r, h.c, { noScroll: true }); } }
      else if (h.area === 'col' || h.area === 'row') { const col = h.area === 'col'; const inSel = G.sel.ranges.some((g) => col ? (g.r1 === 0 && g.r2 >= MAXR - 1 && h.c >= g.c1 && h.c <= g.c2) : (g.c1 === 0 && g.c2 >= MAXC - 1 && h.r >= g.r1 && h.r <= g.r2)); if (!inSel) G.setRange(col ? { r1: 0, c1: h.c, r2: MAXR - 1, c2: h.c } : { r1: h.r, c1: 0, r2: h.r, c2: MAXC - 1 }, { r: col ? G.visible.r1 : h.r, c: col ? h.c : G.visible.c1, noScroll: true }); }
      if (A.contextMenu) A.contextMenu(e, h);
    }
    function touchStart(e, h, p) {
      clearTimeout(longT);
      const t0 = Date.now(), p0 = p; let moved = false;
      longT = setTimeout(() => { if (!moved && pointers.size === 1) { if (h.area === 'cell' && !G.sel.ranges.some((g) => TB.inRange(g, h.r, h.c))) G.select(h.r, h.c, { noScroll: true }); if (A.contextMenu) A.contextMenu({ clientX: e.clientX, clientY: e.clientY, touch: true }, h); moved = true; } }, 520);
      const mv = (ev) => { const q = pos(ev); if (Math.hypot(q.x - p0.x, q.y - p0.y) > 8) { moved = true; clearTimeout(longT); } };
      const up = (ev) => {
        sc.removeEventListener('pointermove', mv); sc.removeEventListener('pointerup', up); sc.removeEventListener('pointercancel', cancel); clearTimeout(longT);
        if (moved || Date.now() - t0 > 500 || pinch) return;
        // appui simple
        if (h.resize && (h.area === 'col' || h.area === 'row')) { if (A.askSize) A.askSize(h.resize.axis, h.resize.i); return; }
        if (G.edit) { if (G.pointable() && h.area === 'cell') { G.pointTo({ r1: h.r, c1: h.c, r2: h.r, c2: h.c }, sh()); return; } if (!G.commitEdit(null)) return; }
        if (h.area === 'corner') { G.setRange({ r1: 0, c1: 0, r2: MAXR - 1, c2: MAXC - 1 }, { noScroll: true }); return; }
        if (h.area === 'col') { G.setRange({ r1: 0, c1: h.c, r2: MAXR - 1, c2: h.c }, { r: G.visible.r1, c: h.c, noScroll: true }); return; }
        if (h.area === 'row') { G.setRange({ r1: h.r, c1: 0, r2: h.r, c2: MAXC - 1 }, { r: h.r, c: G.visible.c1, noScroll: true }); return; }
        if (h.area === 'outline') { const o = G.outlineHit(h); if (o && A.outlineClick) A.outlineClick(o); return; }
        if (h.area !== 'cell') return;
        const fb = G.filterButtonAt(h); if (fb) { if (A.openFilter) A.openFilter(fb, G.cellRect(h.r, h.c)); return; }
        if (G.dvButtonAt(h)) { if (A.openDvList) A.openDvList(); return; }
        const now = Date.now(), same = lastTapCell && lastTapCell.r === h.r && lastTapCell.c === h.c;
        if (same && now - lastTap < 380) { G.select(h.r, h.c, { noScroll: true }); G.beginEdit({ mode: 'edit' }); lastTap = 0; return; }
        lastTap = now; lastTapCell = { r: h.r, c: h.c };
        const lk = sh().links.get(KEY(h.r, h.c));
        G.select(h.r, h.c, { noScroll: true });
        if (lk && A.linkTap) A.linkTap(lk, h);
        const note = sh().notes.get(KEY(h.r, h.c)) || sh().threads.get(KEY(h.r, h.c)); if (note) hover(h, p0);
        void ev;
      };
      const cancel = () => { clearTimeout(longT); sc.removeEventListener('pointermove', mv); sc.removeEventListener('pointerup', up); sc.removeEventListener('pointercancel', cancel); };
      sc.addEventListener('pointermove', mv); sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', cancel);
    }
    // molette + Ctrl : zoom
    sc.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (A.setZoom) A.setZoom(TB.clamp(Math.round((G.zoom * (e.deltaY < 0 ? 1.1 : 0.9)) * 20) / 20, 0.1, 4)); } }, { passive: false });

    G.invalidate = function () { G.ver++; G.axes(true); G.updateExtent(); G.draw(); };
    G.sheetChanged = function () { G.zoom = sh().zoom || 1; G.restoreSel(); G.axes(true); const x = sh().scroll || { l: 0, t: 0 }; G.updateExtent(); sc.scrollLeft = x.l || 0; sc.scrollTop = x.t || 0; G.draw(); };
    G.rememberScroll = function () { sh().scroll = { l: sc.scrollLeft, t: sc.scrollTop }; };
    return G;
  };
})();
