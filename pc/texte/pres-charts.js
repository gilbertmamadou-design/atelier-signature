/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-presentation/pres-charts.js : ne pas modifier ici. */
/* Présentation — graphiques (SVG à partir d'une grille de données) et SmartArt simples (processus, cycle, hiérarchie…).
   Pres.chartSvg(chart, w, h, doc) → '<svg…>' ; Pres.smartLayout(sa, w, h, doc) → {nodes, links} ; Pres.smartHtml(sa, w, h, doc) */
(function () {
  'use strict';
  const O = window.Office, T = O.Themes;
  const P = window.Pres = window.Pres || {};
  const esc = O.esc, f = (n) => Math.round(n * 100) / 100;
  P.CHART_KINDS = [['bar', 'Histogramme groupé', 'chart-column'], ['stacked', 'Histogramme empilé', 'chart-column-stacked'], ['barH', 'Barres groupées', 'chart-bar'], ['stackedH', 'Barres empilées', 'chart-bar-stacked'], ['line', 'Courbes', 'chart-line'], ['area', 'Aires', 'chart-area'], ['pie', 'Secteurs', 'chart-pie'], ['doughnut', 'Anneau', 'circle-dashed'], ['scatter', 'Nuage de points', 'chart-scatter']];
  P.newChart = (kind) => ({ kind: kind || 'bar', title: '', cats: ['Catégorie 1', 'Catégorie 2', 'Catégorie 3', 'Catégorie 4'], series: [{ name: 'Série 1', values: [4.3, 2.5, 3.5, 4.5] }, { name: 'Série 2', values: [2.4, 4.4, 1.8, 2.8] }, { name: 'Série 3', values: [2, 2, 3, 5] }], legend: 'bottom', labels: false, grid: true, fontSize: 14, smooth: false, markers: true, hole: 0.55, xTitle: '', yTitle: '' });
  const ACC = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  P.seriesColor = function (i, doc, own) {
    if (own) return T.resolve(own, P.theme(doc));
    const t = P.theme(doc), base = T.resolve('t:' + ACC[i % 6], t);
    const round = Math.floor(i / 6); return round ? O.tint(base, round % 2 ? -0.3 : 0.4) : base;
  };
  function nice(min, max, n) {
    if (min === max) { max = min + 1; }
    const span = max - min, step0 = span / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(step0))), r = step0 / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
  }
  const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/\s/g, '')); return isNaN(n) ? 0 : n; };
  const fmt = (v) => { const a = Math.abs(v); return (a >= 1e6 ? O.round(v / 1e6, 1) + ' M' : a >= 1e4 ? O.round(v / 1e3, 1) + ' k' : String(O.round(v, 2))).replace('.', ','); };
  P.chartSvg = function (c, W, H, doc) {
    const t = P.theme(doc), tx = T.resolve('t:tx1', t), grid = O.mix(tx, T.resolve('t:bg1', t), 0.82), fs = c.fontSize || 14, font = 'var(--t-minor)';
    const series = c.series || [], cats = c.cats || [];
    let s = '<svg xmlns="http://www.w3.org/2000/svg" class="chart" viewBox="0 0 ' + f(W) + ' ' + f(H) + '" width="' + f(W) + '" height="' + f(H) + '" style="font-family:' + font + ';overflow:visible" role="img" aria-label="' + esc(c.title || 'Graphique') + '">';
    let top = 6, bottom = H - 6, left = 6, right = W - 6;
    if (c.title) { s += '<text x="' + f(W / 2) + '" y="' + f(fs * 1.4) + '" text-anchor="middle" font-size="' + f(fs * 1.35) + '" font-weight="700" fill="' + tx + '">' + esc(c.title) + '</text>'; top += fs * 1.9; }
    const pie = c.kind === 'pie' || c.kind === 'doughnut';
    const legendItems = pie ? cats.map((n, i) => [n, P.seriesColor(i, doc, (c.catColors || [])[i])]) : series.map((x, i) => [x.name, P.seriesColor(i, doc, x.color)]);
    if (c.legend && c.legend !== 'none' && legendItems.length) {
      if (c.legend === 'right') {
        const lw = Math.min(W * 0.32, 24 + Math.max.apply(null, legendItems.map((l) => String(l[0]).length)) * fs * 0.55);
        legendItems.forEach((l, i) => { const y = top + 10 + i * fs * 1.5; s += '<rect x="' + f(right - lw) + '" y="' + f(y) + '" width="' + f(fs * 0.8) + '" height="' + f(fs * 0.8) + '" fill="' + l[1] + '"/><text x="' + f(right - lw + fs * 1.2) + '" y="' + f(y + fs * 0.75) + '" font-size="' + fs + '" fill="' + tx + '">' + esc(l[0]) + '</text>'; });
        right -= lw + 8;
      } else {
        const items = legendItems.map((l) => [l, fs * 2 + String(l[0]).length * fs * 0.55]);
        const total = items.reduce((a, b) => a + b[1], 0); let x = Math.max(left, (W - total) / 2);
        const y = c.legend === 'top' ? top + fs * 0.4 : bottom - fs * 0.9;
        items.forEach((it) => { s += '<rect x="' + f(x) + '" y="' + f(y - fs * 0.05) + '" width="' + f(fs * 0.8) + '" height="' + f(fs * 0.8) + '" fill="' + it[0][1] + '"/><text x="' + f(x + fs * 1.1) + '" y="' + f(y + fs * 0.7) + '" font-size="' + fs + '" fill="' + tx + '">' + esc(it[0][0]) + '</text>'; x += it[1]; });
        if (c.legend === 'top') top += fs * 1.8; else bottom -= fs * 1.8;
      }
    }
    if (pie) {
      const vals = (series[0] ? series[0].values : []).map((v) => Math.max(0, num(v))), sum = vals.reduce((a, b) => a + b, 0) || 1;
      const cx = (left + right) / 2, cy = (top + bottom) / 2, r = Math.max(10, Math.min(right - left, bottom - top) / 2 - 4), hole = c.kind === 'doughnut' ? r * (c.hole || 0.55) : 0;
      let a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        const a1 = a0 + v / sum * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, col = P.seriesColor(i, doc, (c.catColors || [])[i]);
        const p = (a, rr) => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
        if (v / sum >= 0.9999) s += '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' + col + '"/>' + (hole ? '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(hole) + '" fill="var(--t-bg1)"/>' : '');
        else if (v > 0) { const o1 = p(a0, r), o2 = p(a1, r); if (hole) { const i1 = p(a1, hole), i2 = p(a0, hole); s += '<path d="M' + f(o1[0]) + ',' + f(o1[1]) + ' A' + f(r) + ',' + f(r) + ' 0 ' + big + ',1 ' + f(o2[0]) + ',' + f(o2[1]) + ' L' + f(i1[0]) + ',' + f(i1[1]) + ' A' + f(hole) + ',' + f(hole) + ' 0 ' + big + ',0 ' + f(i2[0]) + ',' + f(i2[1]) + ' Z" fill="' + col + '" stroke="var(--t-bg1)" stroke-width="2"/>'; } else s += '<path d="M' + f(cx) + ',' + f(cy) + ' L' + f(o1[0]) + ',' + f(o1[1]) + ' A' + f(r) + ',' + f(r) + ' 0 ' + big + ',1 ' + f(o2[0]) + ',' + f(o2[1]) + ' Z" fill="' + col + '" stroke="var(--t-bg1)" stroke-width="2"/>'; }
        if (c.labels !== false && v > 0) { const m = (a0 + a1) / 2, lr = hole ? (r + hole) / 2 : r * 0.62, lp = p(m, lr); s += '<text x="' + f(lp[0]) + '" y="' + f(lp[1] + fs * 0.35) + '" text-anchor="middle" font-size="' + f(fs) + '" font-weight="700" fill="' + O.readable(col) + '">' + Math.round(v / sum * 100) + ' %</text>'; }
        a0 = a1;
      });
      return s + '</svg>';
    }
    const horiz = c.kind === 'barH' || c.kind === 'stackedH', stacked = c.kind === 'stacked' || c.kind === 'stackedH';
    // échelle
    let lo = 0, hi = 0;
    if (c.kind === 'scatter') { series.forEach((x) => x.values.forEach((v) => { hi = Math.max(hi, num(v)); lo = Math.min(lo, num(v)); })); }
    else if (stacked) cats.forEach((_, i) => { let pos = 0, neg = 0; series.forEach((x) => { const v = num(x.values[i]); if (v >= 0) pos += v; else neg += v; }); hi = Math.max(hi, pos); lo = Math.min(lo, neg); });
    else series.forEach((x) => x.values.forEach((v) => { hi = Math.max(hi, num(v)); lo = Math.min(lo, num(v)); }));
    const sc = nice(lo, hi, 5);
    // axes
    const yLabW = Math.max.apply(null, [fmt(sc.max), fmt(sc.min)].map((x) => x.length)) * fs * 0.6 + 8;
    if (c.yTitle) left += fs * 1.6;
    if (c.xTitle) bottom -= fs * 1.6;
    const catLabH = fs * 1.6;
    let px0, px1, py0, py1;
    if (horiz) { const cw = Math.max.apply(null, cats.map((x) => String(x).length).concat([1])) * fs * 0.55 + 10; px0 = left + Math.min(cw, (right - left) * 0.35); px1 = right - 6; py0 = top + 4; py1 = bottom - catLabH; }
    else { px0 = left + yLabW; px1 = right - 6; py0 = top + 6; py1 = bottom - catLabH; }
    const val2 = (v) => horiz ? px0 + (v - sc.min) / (sc.max - sc.min) * (px1 - px0) : py1 - (v - sc.min) / (sc.max - sc.min) * (py1 - py0);
    for (let v = sc.min; v <= sc.max + sc.step / 2; v += sc.step) {
      const q = val2(v);
      if (horiz) { if (c.grid !== false) s += '<line x1="' + f(q) + '" y1="' + f(py0) + '" x2="' + f(q) + '" y2="' + f(py1) + '" stroke="' + grid + '" stroke-width="1"/>'; s += '<text x="' + f(q) + '" y="' + f(py1 + fs * 1.2) + '" text-anchor="middle" font-size="' + f(fs * 0.9) + '" fill="' + tx + '" opacity=".8">' + fmt(v) + '</text>'; }
      else { if (c.grid !== false) s += '<line x1="' + f(px0) + '" y1="' + f(q) + '" x2="' + f(px1) + '" y2="' + f(q) + '" stroke="' + grid + '" stroke-width="1"/>'; s += '<text x="' + f(px0 - 6) + '" y="' + f(q + fs * 0.32) + '" text-anchor="end" font-size="' + f(fs * 0.9) + '" fill="' + tx + '" opacity=".8">' + fmt(v) + '</text>'; }
    }
    const zero = val2(Math.max(sc.min, Math.min(sc.max, 0)));
    if (horiz) s += '<line x1="' + f(zero) + '" y1="' + f(py0) + '" x2="' + f(zero) + '" y2="' + f(py1) + '" stroke="' + tx + '" stroke-opacity=".5"/>';
    else s += '<line x1="' + f(px0) + '" y1="' + f(zero) + '" x2="' + f(px1) + '" y2="' + f(zero) + '" stroke="' + tx + '" stroke-opacity=".5"/>';
    if (c.yTitle) s += '<text transform="translate(' + f(6 + fs) + ' ' + f((py0 + py1) / 2) + ') rotate(-90)" text-anchor="middle" font-size="' + fs + '" fill="' + tx + '">' + esc(c.yTitle) + '</text>';
    if (c.xTitle) s += '<text x="' + f((px0 + px1) / 2) + '" y="' + f(bottom + fs * 1.3) + '" text-anchor="middle" font-size="' + fs + '" fill="' + tx + '">' + esc(c.xTitle) + '</text>';
    const n = Math.max(1, cats.length), band = (horiz ? py1 - py0 : px1 - px0) / n;
    // libellés de catégories
    cats.forEach((cat, i) => {
      const m = (horiz ? py0 : px0) + band * (i + 0.5);
      if (horiz) s += '<text x="' + f(px0 - 6) + '" y="' + f(m + fs * 0.32) + '" text-anchor="end" font-size="' + f(fs * 0.9) + '" fill="' + tx + '">' + esc(cat) + '</text>';
      else if (c.kind !== 'scatter') s += '<text x="' + f(m) + '" y="' + f(py1 + fs * 1.2) + '" text-anchor="middle" font-size="' + f(fs * 0.9) + '" fill="' + tx + '">' + esc(cat) + '</text>';
    });
    if (c.kind === 'line' || c.kind === 'area' || c.kind === 'scatter') {
      series.forEach((x, si) => {
        const col = P.seriesColor(si, doc, x.color);
        const ptsA = cats.map((_, i) => [px0 + band * (i + 0.5), val2(num(x.values[i]))]);
        let d = '';
        if (c.smooth && ptsA.length > 2) { d = 'M' + f(ptsA[0][0]) + ',' + f(ptsA[0][1]); for (let i = 1; i < ptsA.length; i++) { const p0 = ptsA[i - 2] || ptsA[i - 1], p1 = ptsA[i - 1], p2 = ptsA[i], p3 = ptsA[i + 1] || p2; d += ' C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ',' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f(p2[0] - (p3[0] - p1[0]) / 6) + ',' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ',' + f(p2[1]); } }
        else d = 'M' + ptsA.map((p) => f(p[0]) + ',' + f(p[1])).join(' L');
        if (c.kind === 'area' && ptsA.length) s += '<path d="' + d + ' L' + f(ptsA[ptsA.length - 1][0]) + ',' + f(zero) + ' L' + f(ptsA[0][0]) + ',' + f(zero) + ' Z" fill="' + col + '" fill-opacity=".35"/>';
        if (c.kind !== 'scatter') s += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
        if (c.markers !== false || c.kind === 'scatter') ptsA.forEach((p) => { s += '<circle cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="' + (c.kind === 'scatter' ? 6 : 4.5) + '" fill="' + (c.kind === 'scatter' ? col : 'var(--t-bg1)') + '" stroke="' + col + '" stroke-width="2.5"/>'; });
        if (c.labels) ptsA.forEach((p, i) => { s += '<text x="' + f(p[0]) + '" y="' + f(p[1] - 9) + '" text-anchor="middle" font-size="' + f(fs * 0.85) + '" fill="' + tx + '">' + fmt(num(x.values[i])) + '</text>'; });
      });
    } else {
      const ns = Math.max(1, series.length), inner = band * 0.72, bw = stacked ? inner : inner / ns;
      cats.forEach((_, i) => {
        let pos = 0, neg = 0;
        series.forEach((x, si) => {
          const v = num(x.values[i]), col = P.seriesColor(si, doc, x.color);
          let a, b;
          if (stacked) { if (v >= 0) { a = pos; b = pos + v; pos += v; } else { a = neg + v; b = neg; neg += v; } } else { a = Math.min(0, v); b = Math.max(0, v); }
          const q0 = val2(Math.max(sc.min, a)), q1 = val2(Math.min(sc.max, b));
          const off = (horiz ? py0 : px0) + band * i + (band - inner) / 2 + (stacked ? 0 : bw * si);
          if (horiz) s += '<rect x="' + f(Math.min(q0, q1)) + '" y="' + f(off) + '" width="' + f(Math.abs(q1 - q0)) + '" height="' + f(bw * 0.92) + '" fill="' + col + '"/>';
          else s += '<rect x="' + f(off) + '" y="' + f(Math.min(q0, q1)) + '" width="' + f(bw * 0.92) + '" height="' + f(Math.abs(q1 - q0)) + '" fill="' + col + '"/>';
          if (c.labels && v) { if (horiz) s += '<text x="' + f(Math.max(q0, q1) + (stacked ? -4 : 4)) + '" y="' + f(off + bw * 0.46 + fs * 0.32) + '" text-anchor="' + (stacked ? 'end' : 'start') + '" font-size="' + f(fs * 0.8) + '" fill="' + (stacked ? O.readable(col) : tx) + '">' + fmt(v) + '</text>'; else s += '<text x="' + f(off + bw * 0.46) + '" y="' + f(stacked ? (q0 + q1) / 2 + fs * 0.3 : Math.min(q0, q1) - 5) + '" text-anchor="middle" font-size="' + f(fs * 0.8) + '" fill="' + (stacked ? O.readable(col) : tx) + '">' + fmt(v) + '</text>'; }
        });
      });
    }
    return s + '</svg>';
  };

  /* ---------------- SmartArt ---------------- */
  P.SMART_KINDS = [['process', 'Processus', 'arrow-right-left'], ['chevron', 'Chevrons', 'chevrons-right'], ['cycle', 'Cycle', 'refresh-cw'], ['hierarchy', 'Hiérarchie', 'network'], ['list', 'Liste verticale', 'list'], ['blocks', 'Liste en blocs', 'layout-grid'], ['pyramid', 'Pyramide', 'triangle'], ['venn', 'Venn', 'circles-intersect'], ['radial', 'Radial', 'circle-dot'], ['timeline', 'Chronologie', 'milestone'], ['steps', 'Étapes numérotées', 'list-ordered']];
  P.newSmart = (kind) => ({ kind: kind || 'process', palette: 'accent', items: [{ text: 'Préparer', level: 0 }, { text: 'Réaliser', level: 0 }, { text: 'Vérifier', level: 0 }, { text: 'Améliorer', level: 0 }] });
  P.smartFromText = (txt) => String(txt || '').split(/\r?\n/).filter((l) => l.trim()).map((l) => { const m = /^(\s*)(.*)$/.exec(l.replace(/\t/g, '  ')); return { text: m[2].replace(/^[-•*]\s*/, ''), level: Math.min(3, Math.floor(m[1].length / 2)) }; });
  P.smartToText = (sa) => sa.items.map((i) => '  '.repeat(i.level) + i.text).join('\n');
  function colorFor(sa, i, n, t) {
    if (sa.palette === 'colorful') return T.resolve('t:' + ACC[i % 6], t);
    if (sa.palette === 'mono') return O.tint(T.resolve('t:accent1', t), -0.25 + 0.65 * (n > 1 ? i / (n - 1) : 0));
    if (sa.palette === 'gradient') return O.mix(T.resolve('t:accent1', t), T.resolve('t:accent2', t), n > 1 ? i / (n - 1) : 0);
    return T.resolve('t:accent1', t);
  }
  /** Nœuds (formes avec texte) et liens d'un SmartArt dans un cadre w × h */
  P.smartLayout = function (sa, W, H, doc) {
    const t = P.theme(doc), nodes = [], links = [];
    const top = []; sa.items.forEach((it) => { if (it.level === 0 || !top.length) top.push({ text: it.text, subs: [], kids: [] }); else { const p = top[top.length - 1]; p.subs.push(it.text); p.kids.push(it); } });
    const n = top.length || 1;
    const add = (shape, x, y, w, h, i, text, extra) => { const col = colorFor(sa, i, n, t); nodes.push(Object.assign({ shape, x, y, w, h, fill: col, line: O.tint(col, -0.2), text, tx: O.readable(col) }, extra || {})); };
    const label = (it) => it.subs.length ? [it.text].concat(it.subs.map((s) => '• ' + s)).join('\n') : it.text;
    switch (sa.kind) {
      case 'process': {
        const g = W * 0.04, aw = Math.min(W * 0.05, 40), bw = (W - (n - 1) * (g * 2 + aw)) / n, bh = Math.min(H, Math.max(bw * 0.7, H * 0.5));
        top.forEach((it, i) => { const x = i * (bw + g * 2 + aw); add('roundRect', x, (H - bh) / 2, bw, bh, i, label(it)); if (i < n - 1) nodes.push({ shape: 'rightArrow', x: x + bw + g, y: H / 2 - aw * 0.6, w: aw, h: aw * 1.2, fill: O.tint(colorFor(sa, i, n, t), 0.45), line: null, text: '' }); });
        break;
      }
      case 'chevron': { const ov = W * 0.02, bw = (W + ov * (n - 1)) / n, bh = Math.min(H, bw * 0.45); top.forEach((it, i) => add(i === 0 ? 'homePlate' : 'chevron', i * (bw - ov), (H - bh) / 2, bw, bh, i, label(it), { adj: { a: 0.4 } })); break; }
      case 'cycle': {
        const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.36, s = Math.min(W, H) * (n > 6 ? 0.2 : 0.26);
        top.forEach((it, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; add('ellipse', cx + Math.cos(a) * R - s * 0.7, cy + Math.sin(a) * R - s / 2, s * 1.4, s, i, label(it)); const b = a + Math.PI / n; const aw = s * 0.32; nodes.push({ shape: 'rightArrow', x: cx + Math.cos(b) * R - aw / 2, y: cy + Math.sin(b) * R - aw * 0.4, w: aw, h: aw * 0.8, rot: (b * 180 / Math.PI) + 90, fill: O.tint(colorFor(sa, i, n, t), 0.45), line: null, text: '' }); });
        break;
      }
      case 'hierarchy': {
        // niveau 0 = racine(s), niveau 1 = enfants, niveau 2 = petits-enfants
        const roots = []; sa.items.forEach((it) => { if (it.level === 0 || !roots.length) roots.push({ t: it.text, k: [] }); else if (it.level === 1 || !roots[roots.length - 1].k.length) roots[roots.length - 1].k.push({ t: it.text, k: [] }); else { const r = roots[roots.length - 1]; r.k[r.k.length - 1].k.push({ t: it.text }); } });
        const leaves = roots.reduce((a, r) => a + Math.max(1, r.k.length), 0);
        const deep = roots.some((r) => r.k.some((k) => k.k.length)) ? 3 : roots.some((r) => r.k.length) ? 2 : 1;
        const rowH = H / deep, bh = rowH * 0.6, colW = W / leaves, bw = Math.min(colW * 0.86, W * 0.4);
        let col = 0;
        roots.forEach((r, ri) => {
          const span = Math.max(1, r.k.length), rx = (col + span / 2) * colW;
          add('roundRect', rx - Math.min(bw * 1.2, W * 0.5) / 2, (rowH - bh) / 2, Math.min(bw * 1.2, W * 0.5), bh, 0, r.t);
          r.k.forEach((k, ki) => {
            const kx = (col + ki + 0.5) * colW;
            add('roundRect', kx - bw / 2, rowH + (rowH - bh) / 2, bw, bh, 1 + ki, k.t);
            links.push({ pts: [[rx, (rowH + bh) / 2], [rx, rowH], [kx, rowH], [kx, rowH + (rowH - bh) / 2]] });
            (k.k || []).forEach((g, gi) => { const gh = (rowH - 10) / Math.max(1, k.k.length), gy = rowH * 2 + 6 + gi * gh; add('rect', kx - bw * 0.42, gy, bw * 0.84, gh * 0.82, 1 + ki, g.t, { light: true }); links.push({ pts: [[kx - bw * 0.48, rowH + (rowH + bh) / 2], [kx - bw * 0.48, gy + gh * 0.41], [kx - bw * 0.42, gy + gh * 0.41]] }); });
          });
          col += span; void ri;
        });
        nodes.forEach((nd) => { if (nd.light) { nd.fill = O.tint(nd.fill, 0.75); nd.tx = O.readable(nd.fill); } });
        break;
      }
      case 'list': { const g = H * 0.03, bh = (H - g * (n - 1)) / n; top.forEach((it, i) => { add('rect', 0, i * (bh + g), W * 0.28, bh, i, it.text); nodes.push({ shape: 'rect', x: W * 0.28, y: i * (bh + g), w: W * 0.72, h: bh, fill: O.tint(colorFor(sa, i, n, t), 0.82), line: null, text: it.subs.map((s) => '• ' + s).join('\n'), tx: T.resolve('t:dk1', t), align: 'left' }); }); break; }
      case 'blocks': { const cols = Math.ceil(Math.sqrt(n * W / H / 1.6)), rows = Math.ceil(n / cols), g = W * 0.025, bw = (W - g * (cols - 1)) / cols, bh = (H - g * (rows - 1)) / rows; top.forEach((it, i) => add('rect', (i % cols) * (bw + g), Math.floor(i / cols) * (bh + g), bw, bh, i, label(it))); break; }
      case 'steps': { const g = H * 0.03, bh = (H - g * (n - 1)) / n, cs = Math.min(bh, W * 0.12); top.forEach((it, i) => { add('ellipse', 0, i * (bh + g) + (bh - cs) / 2, cs, cs, i, String(i + 1), { bold: true }); nodes.push({ shape: 'roundRect', x: cs + W * 0.02, y: i * (bh + g), w: W - cs - W * 0.02, h: bh, fill: O.tint(colorFor(sa, i, n, t), 0.85), line: null, text: label(it), tx: T.resolve('t:dk1', t), align: 'left' }); }); break; }
      case 'pyramid': { const lh = H / n; top.forEach((it, i) => { const w0 = W * (i / n), w1 = W * ((i + 1) / n); add(i === 0 ? 'triangle' : 'trapezoid', (W - w1) / 2, i * lh, w1, lh - 2, i, label(it), i === 0 ? {} : { adj: { a: (w1 - w0) / 2 / Math.min(w1, lh) } }); }); break; }
      case 'venn': { const r = Math.min(H * 0.42, W / (n + 1) * 0.9), cy = H / 2, step = n > 1 ? (W - 2 * r) / (n - 1) : 0; top.forEach((it, i) => add('ellipse', (n > 1 ? i * step : W / 2 - r), cy - r, 2 * r, 2 * r, i, label(it), { alpha: 0.6 })); break; }
      case 'radial': { const cx = W / 2, cy = H / 2, c = Math.min(W, H) * 0.3, others = top.slice(1), m = others.length || 1, R = Math.min(W, H) * 0.38, s = Math.min(W, H) * 0.2; others.forEach((it, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / m; links.push({ pts: [[cx, cy], [cx + Math.cos(a) * R, cy + Math.sin(a) * R]] }); add('ellipse', cx + Math.cos(a) * R - s * 0.75, cy + Math.sin(a) * R - s / 2, s * 1.5, s, i + 1, label(it)); }); if (top[0]) add('ellipse', cx - c / 2, cy - c / 2, c, c, 0, label(top[0])); break; }
      case 'timeline': { const y = H / 2; links.push({ pts: [[0, y], [W, y]], w: 4 }); const st = W / n, dot = Math.min(H * 0.1, st * 0.25); top.forEach((it, i) => { const x = st * (i + 0.5); add('ellipse', x - dot / 2, y - dot / 2, dot, dot, i, ''); const up = i % 2 === 0; nodes.push({ shape: 'rect', x: x - st * 0.48, y: up ? 0 : y + dot, w: st * 0.96, h: y - dot, fill: null, line: null, text: label(it), tx: T.resolve('t:tx1', t), va: up ? 'bottom' : 'top' }); }); break; }
      default: break;
    }
    // taille de texte commune, selon la plus petite case
    let fsz = 40;
    nodes.forEach((nd) => { if (!nd.text) return; const lines = String(nd.text).split('\n'); const longest = Math.max.apply(null, lines.map((l) => l.length)); const tb = P.shapeTextBox(nd.shape, nd.w, nd.h); const k = Math.min((tb[2] - 12) / Math.max(4, longest) / 0.56, (tb[3] - 8) / lines.length / 1.25); fsz = Math.min(fsz, k); });
    fsz = Math.max(9, Math.min(fsz, 32));
    nodes.forEach((nd) => { nd.fs = nd.fs || fsz; });
    return { nodes, links, line: T.resolve('t:tx2', t) };
  };
  P.smartHtml = function (sa, W, H, doc) {
    const L = P.smartLayout(sa, W, H, doc);
    let svg = '<svg class="sa-svg" viewBox="0 0 ' + f(W) + ' ' + f(H) + '" width="' + f(W) + '" height="' + f(H) + '" style="position:absolute;left:0;top:0;overflow:visible">';
    L.links.forEach((l) => { svg += '<path d="M' + l.pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' L') + '" fill="none" stroke="' + L.line + '" stroke-width="' + (l.w || 2) + '" stroke-opacity=".7"/>'; });
    let txt = '';
    L.nodes.forEach((nd) => {
      const parts = P.shapeParts(nd.shape, nd.w, nd.h, nd.adj);
      svg += '<g transform="translate(' + f(nd.x) + ' ' + f(nd.y) + ')' + (nd.rot ? ' rotate(' + f(nd.rot) + ' ' + f(nd.w / 2) + ' ' + f(nd.h / 2) + ')' : '') + '">' + parts.map((p) => '<path d="' + p.d + '" fill="' + (p.fill === 'none' || !nd.fill ? 'none' : nd.fill) + '"' + (nd.alpha ? ' fill-opacity="' + nd.alpha + '"' : '') + ' stroke="' + (nd.line || 'none') + '" stroke-width="1.5" fill-rule="evenodd"/>').join('') + '</g>';
      if (nd.text) { const tb = P.shapeTextBox(nd.shape, nd.w, nd.h); txt += '<div class="sa-t" style="left:' + f(nd.x + tb[0]) + 'px;top:' + f(nd.y + tb[1]) + 'px;width:' + f(tb[2]) + 'px;height:' + f(tb[3]) + 'px;color:' + nd.tx + ';font-size:' + f(nd.fs) + 'px;text-align:' + (nd.align || 'center') + ';justify-content:' + (nd.va === 'top' ? 'flex-start' : nd.va === 'bottom' ? 'flex-end' : 'center') + (nd.bold ? ';font-weight:700' : '') + '">' + String(nd.text).split('\n').map((l) => '<div>' + esc(l) + '</div>').join('') + '</div>'; }
    });
    return svg + '</svg>' + txt;
  };
})();
