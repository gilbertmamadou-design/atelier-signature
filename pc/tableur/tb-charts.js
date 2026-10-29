/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-tableur/tb-charts.js : ne pas modifier ici. */
/* Tableur — graphiques : données lues en direct dans les cellules (plage source, séries en colonnes ou en lignes),
   rendu SVG (histogrammes, barres, empilés et 100 %, courbes, aires, secteurs, anneau, nuage de points, combiné avec
   axe secondaire), titres, titres d'axes, légende, étiquettes, quadrillage, couleurs. Même esprit que les graphiques
   de Présentation (pres-charts.js), avec les axes et formats propres à un tableur. */
(function (G) {
  'use strict';
  const TB = G.Tableur, P = TB.Formula;
  const CH = TB.Chart = {};
  const esc = TB.esc, f2 = (n) => Math.round(n * 100) / 100;
  CH.KINDS = [['bar', 'Histogramme groupé'], ['stacked', 'Histogramme empilé'], ['stacked100', 'Histogramme empilé 100 %'], ['barH', 'Barres groupées'], ['stackedH', 'Barres empilées'], ['stackedH100', 'Barres empilées 100 %'], ['line', 'Courbes'], ['lineMarkers', 'Courbes avec marqueurs'], ['stackedLine', 'Courbes empilées'], ['area', 'Aires'], ['stackedArea', 'Aires empilées'], ['pie', 'Secteurs'], ['doughnut', 'Anneau'], ['scatter', 'Nuage de points'], ['scatterLines', 'Nuage avec courbes'], ['combo', 'Histogramme et courbe'], ['comboAxis', 'Combiné, axe secondaire']];
  CH.ICON = { bar: 'chart-column', stacked: 'chart-column-stacked', stacked100: 'chart-column-stacked', barH: 'chart-bar', stackedH: 'chart-bar-stacked', stackedH100: 'chart-bar-stacked', line: 'chart-line', lineMarkers: 'chart-line', stackedLine: 'chart-line', area: 'chart-area', stackedArea: 'chart-area', pie: 'chart-pie', doughnut: 'circle-dashed', scatter: 'chart-scatter', scatterLines: 'chart-spline', combo: 'chart-no-axes-combined', comboAxis: 'chart-no-axes-combined' };

  function refOf(wb, txt, home) {
    if (!txt) return null;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(String(txt).replace(/^=/, ''));
    const sh = m ? wb.sheet((m[1] || m[2]).replace(/''/g, "'")) : home;
    const g = TB.parseRange(m ? m[3] : String(txt).replace(/^=/, ''));
    if (!sh || !g) return null;
    return { sh, g };
  }
  CH.refOf = refOf;
  const txt = (wb, sh, r, c) => { const v = sh.get(r, c); return v === null ? '' : TB.Fmt.format(v, wb.styles.get(sh.styleAt(r, c)).nf).s; };
  /** données du graphique : {cats, series:[{name, values, xs, kind, axis, color}], fmt} */
  CH.data = function (wb, ch, home) {
    const out = { cats: [], series: [], fmt: 'General', catDates: false };
    if (ch.series && ch.series.length && ch.explicit) {
      ch.series.forEach((s, i) => {
        const vr = refOf(wb, s.values, home); const vals = []; if (vr) { const g = vr.g; for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 4000); r++) for (let c = g.c1; c <= g.c2; c++) { const v = vr.sh.get(r, c); vals.push(typeof v === 'number' ? v : null); } if (i === 0) out.fmt = wb.styles.get(vr.sh.styleAt(g.r1, g.c1)).nf || 'General'; }
        let name = s.name || 'Série ' + (i + 1); const nr = refOf(wb, s.name, home); if (nr && /!/.test(s.name || '')) name = txt(wb, nr.sh, nr.g.r1, nr.g.c1);
        const xr = refOf(wb, s.cats, home); let xs = null;
        if (xr) { const g = xr.g; const cats = []; xs = []; for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 4000); r++) for (let c = g.c1; c <= g.c2; c++) { cats.push(txt(wb, xr.sh, r, c)); const v = xr.sh.get(r, c); xs.push(typeof v === 'number' ? v : null); } if (!out.cats.length) out.cats = cats; }
        out.series.push({ name, values: vals, xs, kind: s.kind, axis: s.axis, color: s.color });
      });
      if (!out.cats.length && out.series[0]) out.cats = out.series[0].values.map((_, i) => String(i + 1));
      return out;
    }
    const R = refOf(wb, ch.src, home); if (!R) return out;
    const sh = R.sh, e = sh.extent();
    const g = { r1: R.g.r1, c1: R.g.c1, r2: Math.min(R.g.r2, Math.max(R.g.r1, e.r)), c2: Math.min(R.g.c2, Math.max(R.g.c1, e.c)) };
    const isLab = (r, c) => { const v = sh.get(r, c); return v === null || typeof v === 'string' || (typeof v === 'number' && TB.Fmt.isDate(wb.styles.get(sh.styleAt(r, c)).nf || '')); };
    const byRow = !!ch.byRow;
    // première ligne / colonne : étiquettes ?
    let hdr = ch.header != null ? ch.header : true, lab = ch.labelsCol != null ? ch.labelsCol : true;
    if (ch.header == null) { let t = 0, n = 0; for (let c = g.c1 + 1; c <= g.c2; c++) { n++; if (typeof sh.get(g.r1, c) === 'string') t++; } hdr = n ? t / n >= 0.5 : typeof sh.get(g.r1, g.c1) === 'string'; if (g.r1 === g.r2) hdr = false; }
    if (ch.labelsCol == null) { let t = 0, n = 0; for (let r = g.r1 + (hdr ? 1 : 0); r <= g.r2; r++) { n++; if (isLab(r, g.c1) && sh.get(r, g.c1) !== null) t++; } lab = n ? t / n >= 0.5 : false; if (g.c1 === g.c2) lab = false; }
    const r0 = g.r1 + (hdr ? 1 : 0), c0 = g.c1 + (lab ? 1 : 0);
    const scatter = /scatter/.test(ch.kind);
    if (!byRow) {
      for (let r = r0; r <= g.r2; r++) out.cats.push(lab ? txt(wb, sh, r, g.c1) : String(r - r0 + 1));
      let xs = null;
      if (scatter) { const xc = lab ? g.c1 : c0; xs = []; for (let r = r0; r <= g.r2; r++) { const v = sh.get(r, xc); xs.push(typeof v === 'number' ? v : null); } }
      for (let c = scatter && !lab ? c0 + 1 : c0; c <= g.c2; c++) {
        if (sh.hidC.has(c) && !ch.showHidden) continue;
        const vals = []; for (let r = r0; r <= g.r2; r++) { if (sh.hidR.has(r) && !ch.showHidden) { vals.push(undefined); continue; } const v = sh.get(r, c); vals.push(typeof v === 'number' ? v : null); }
        out.series.push({ name: hdr ? txt(wb, sh, g.r1, c) : 'Série ' + (out.series.length + 1), values: vals, xs });
      }
      if (out.series.length) out.fmt = wb.styles.get(sh.styleAt(r0, c0)).nf || 'General';
      out.catDates = lab && TB.Fmt.isDate(wb.styles.get(sh.styleAt(r0, g.c1)).nf || '');
      // lignes masquées : retirées
      const keep = out.series.length ? out.series[0].values.map((v) => v !== undefined) : [];
      if (keep.some((k) => !k)) { out.cats = out.cats.filter((_, i) => keep[i]); out.series.forEach((s) => { s.values = s.values.filter((_, i) => keep[i]); if (s.xs) s.xs = s.xs.filter((_, i) => keep[i]); }); }
    } else {
      for (let c = c0; c <= g.c2; c++) out.cats.push(hdr ? txt(wb, sh, g.r1, c) : String(c - c0 + 1));
      for (let r = r0; r <= g.r2; r++) { if (sh.hidR.has(r) && !ch.showHidden) continue; const vals = []; for (let c = c0; c <= g.c2; c++) { const v = sh.get(r, c); vals.push(typeof v === 'number' ? v : null); } out.series.push({ name: lab ? txt(wb, sh, r, g.c1) : 'Série ' + (out.series.length + 1), values: vals }); }
      if (out.series.length) out.fmt = wb.styles.get(sh.styleAt(r0, c0)).nf || 'General';
    }
    // colonnes de texte (aucun nombre) : pas de série vide quand d'autres séries ont des nombres
    if (out.series.some((x) => x.values.some((v) => typeof v === 'number'))) out.series = out.series.filter((x) => x.values.some((v) => typeof v === 'number'));
    (ch.seriesOpt || []).forEach((o, i) => { if (out.series[i] && o) Object.assign(out.series[i], o); });
    if (/^combo/.test(ch.kind)) out.series.forEach((s, i) => { if (i > 0 && !s.kind) { s.kind = 'line'; if (ch.kind === 'comboAxis') s.axis = 2; } });
    return out;
  };
  /** couleurs : thème du classeur */
  CH.color = function (wb, ch, i) { if (ch.colors && ch.colors[i]) return ch.colors[i]; const t = TB.themeOf(wb).c; const base = t[4 + (i % 6)]; const k = Math.floor(i / 6); return k ? TB.tint(base, k % 2 ? -0.35 : 0.4) : base; };
  function nice(min, max, n) { if (min === max) { max = min + 1; if (min > 0) min = 0; } const span = max - min, step0 = span / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(step0))), r = step0 / mag; const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag; return { min: Math.floor(min / step + 1e-9) * step, max: Math.ceil(max / step - 1e-9) * step, step }; }
  const readable = (hex) => { const c = String(hex || '#000').replace('#', ''); const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16); const L = (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; return L > 0.6 ? '#1b1b1b' : '#ffffff'; };
  /** rendu SVG */
  CH.svg = function (wb, ch, W, H, home, opt) {
    opt = opt || {};
    const D = CH.data(wb, ch, home);
    const font = TB.fontCss ? TB.fontCss(ch.font || 'Calibri') : 'Calibri, sans-serif';
    const fs = ch.fontSize || Math.max(9, Math.min(13, Math.min(W, H) / 26));
    const tx = '#404040', grid = '#D9D9D9', axisC = '#A6A6A6';
    const fmtV = (v, pct) => pct ? TB.Fmt.format(v, '0%').s : TB.Fmt.format(v, D.fmt && D.fmt !== 'General' && !TB.Fmt.isDate(D.fmt) ? D.fmt : (Math.abs(v) >= 1e5 ? '#,##0' : 'General'), { width: 9 }).s;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f2(W) + ' ' + f2(H) + '" width="' + f2(W) + '" height="' + f2(H) + '" font-family="' + esc(font) + '" role="img" aria-label="' + esc(ch.title || 'Graphique') + '"><rect width="100%" height="100%" fill="' + (ch.bg || '#FFFFFF') + '"/>';
    let top = 8, bottom = H - 8, left = 8, right = W - 8;
    if (ch.title) { s += '<text x="' + f2(W / 2) + '" y="' + f2(8 + fs * 1.3) + '" text-anchor="middle" font-size="' + f2(fs * 1.4) + '" fill="' + tx + '">' + esc(ch.title) + '</text>'; top += fs * 2.1; }
    const series = D.series;
    if (!series.length) return s + '<text x="' + f2(W / 2) + '" y="' + f2(H / 2) + '" text-anchor="middle" font-size="' + f2(fs) + '" fill="#888">Aucune donnée</text></svg>';
    const pie = ch.kind === 'pie' || ch.kind === 'doughnut';
    const legItems = pie ? D.cats.map((n, i) => [n, CH.color(wb, ch, i)]) : series.map((x, i) => [x.name, x.color || CH.color(wb, ch, i), x.kind]);
    const leg = ch.legend || (series.length > 1 || pie ? 'bottom' : 'none');
    if (leg !== 'none' && legItems.length) {
      if (leg === 'right' || leg === 'left') {
        const lw = Math.min(W * 0.35, 22 + Math.max(...legItems.map((l) => String(l[0]).length)) * fs * 0.55);
        const x0 = leg === 'right' ? right - lw : left; let y = top + Math.max(0, (bottom - top - legItems.length * fs * 1.5) / 2);
        legItems.forEach((l) => { s += legendMark(x0, y, l, fs) + '<text x="' + f2(x0 + fs * 1.3) + '" y="' + f2(y + fs * 0.8) + '" font-size="' + f2(fs) + '" fill="' + tx + '">' + esc(trunc(l[0], 28)) + '</text>'; y += fs * 1.5; });
        if (leg === 'right') right -= lw + 6; else left += lw + 6;
      } else {
        const items = legItems.map((l) => [l, fs * 2 + Math.min(28, String(l[0]).length) * fs * 0.55]);
        const rows = []; let row = [], wsum = 0; items.forEach((it) => { if (wsum + it[1] > right - left && row.length) { rows.push([row, wsum]); row = []; wsum = 0; } row.push(it); wsum += it[1]; }); if (row.length) rows.push([row, wsum]);
        let y = leg === 'top' ? top : bottom - rows.length * fs * 1.5;
        rows.forEach(([rw, tot]) => { let x = left + Math.max(0, (right - left - tot) / 2); rw.forEach((it) => { s += legendMark(x, y, it[0], fs) + '<text x="' + f2(x + fs * 1.2) + '" y="' + f2(y + fs * 0.85) + '" font-size="' + f2(fs) + '" fill="' + tx + '">' + esc(trunc(it[0][0], 28)) + '</text>'; x += it[1]; }); y += fs * 1.5; });
        if (leg === 'top') top += rows.length * fs * 1.5 + 4; else bottom -= rows.length * fs * 1.5 + 4;
      }
    }
    if (pie) return s + pieSvg(wb, ch, D, left, top, right, bottom, fs, fmtV) + '</svg>';
    const horiz = /^stackedH|^barH/.test(ch.kind);
    const stacked = /stacked/.test(ch.kind), pct100 = /100/.test(ch.kind);
    const scatter = /scatter/.test(ch.kind);
    const kindOf = (sr) => sr.kind || (/line/i.test(ch.kind) ? 'line' : /area/i.test(ch.kind) ? 'area' : scatter ? 'scatter' : 'bar');
    // échelles (axe principal et secondaire)
    const n = D.cats.length;
    const totals = []; for (let i = 0; i < n; i++) { let p = 0, q = 0; series.forEach((sr) => { if ((sr.axis || 1) !== 1 || kindOf(sr) !== kindOf(series[0])) return; const v = sr.values[i] || 0; if (v >= 0) p += v; else q += v; }); totals.push([p, q]); }
    const range = (ax) => { let lo = Infinity, hi = -Infinity; series.forEach((sr, si) => { if ((sr.axis || 1) !== ax) return; sr.values.forEach((v, i) => { if (v == null) return; let x = v; if (stacked && ax === 1 && kindOf(sr) === kindOf(series[0])) { x = pct100 ? (v >= 0 ? 1 : -1) : null; if (!pct100) { lo = Math.min(lo, totals[i][1]); hi = Math.max(hi, totals[i][0]); return; } } lo = Math.min(lo, x); hi = Math.max(hi, x); }); void si; }); if (lo === Infinity) { lo = 0; hi = 1; } if (!scatter || ax) { lo = Math.min(lo, 0); } return [lo, hi]; };
    const [l1, h1] = range(1); const sc1 = nice(ch.yMin != null ? ch.yMin : l1, ch.yMax != null ? ch.yMax : h1, Math.max(3, Math.round((horiz ? W : H) / 70)));
    if (ch.yMin != null) sc1.min = ch.yMin; if (ch.yMax != null) sc1.max = ch.yMax;
    if (pct100) { sc1.min = Math.min(0, sc1.min) < 0 ? -1 : 0; sc1.max = 1; sc1.step = 0.2; }
    const has2 = series.some((sr) => sr.axis === 2);
    const [l2, h2] = has2 ? range(2) : [0, 1]; const sc2 = nice(l2, h2, Math.max(3, Math.round(H / 70)));
    // scatter : axe X numérique
    let xsc = null; if (scatter) { let lo = Infinity, hi = -Infinity; series.forEach((sr) => (sr.xs || sr.values.map((_, i) => i + 1)).forEach((x) => { if (x != null) { lo = Math.min(lo, x); hi = Math.max(hi, x); } })); if (lo === Infinity) { lo = 0; hi = 1; } xsc = nice(lo, hi, Math.max(3, Math.round(W / 80))); }
    // marges des axes
    const yLabW = Math.max(...[sc1.min, sc1.max, sc1.min + sc1.step].map((v) => fmtV(v, pct100).length)) * fs * 0.58 + 8;
    const y2LabW = has2 ? Math.max(...[sc2.min, sc2.max].map((v) => fmtV(v).length)) * fs * 0.58 + 8 : 0;
    if (ch.yTitle) left += fs * 1.6; if (ch.y2Title && has2) right -= fs * 1.6; if (ch.xTitle) bottom -= fs * 1.6;
    const catLabH = fs * 1.6;
    // étiquettes de catégories longues : rotation
    const maxCat = Math.max(1, ...D.cats.map((x) => String(x).length));
    let px0, px1, py0, py1, rotate = false;
    if (horiz) { const cw = Math.min((right - left) * 0.35, maxCat * fs * 0.55 + 10); px0 = left + cw; px1 = right - 6; py0 = top + 4; py1 = bottom - catLabH; }
    else { px0 = left + yLabW; px1 = right - 6 - y2LabW; py0 = top + 6; rotate = !scatter && n > 0 && maxCat * fs * 0.55 > (px1 - px0) / n; py1 = bottom - (rotate ? Math.min(H * 0.3, maxCat * fs * 0.45 + fs) : catLabH); }
    const val2 = (v, sc) => horiz ? px0 + (v - sc.min) / (sc.max - sc.min) * (px1 - px0) : py1 - (v - sc.min) / (sc.max - sc.min) * (py1 - py0);
    // quadrillage et graduations
    for (let v = sc1.min, k = 0; v <= sc1.max + sc1.step / 2 && k < 60; v += sc1.step, k++) {
      const q = val2(v, sc1);
      if (horiz) { if (ch.grid !== false) s += '<line x1="' + f2(q) + '" y1="' + f2(py0) + '" x2="' + f2(q) + '" y2="' + f2(py1) + '" stroke="' + grid + '"/>'; s += '<text x="' + f2(q) + '" y="' + f2(py1 + fs * 1.2) + '" text-anchor="middle" font-size="' + f2(fs * 0.9) + '" fill="' + tx + '">' + esc(fmtV(TB.round15(v), pct100)) + '</text>'; }
      else { if (ch.grid !== false) s += '<line x1="' + f2(px0) + '" y1="' + f2(q) + '" x2="' + f2(px1) + '" y2="' + f2(q) + '" stroke="' + grid + '"/>'; s += '<text x="' + f2(px0 - 6) + '" y="' + f2(q + fs * 0.32) + '" text-anchor="end" font-size="' + f2(fs * 0.9) + '" fill="' + tx + '">' + esc(fmtV(TB.round15(v), pct100)) + '</text>'; }
    }
    if (has2) for (let v = sc2.min, k = 0; v <= sc2.max + sc2.step / 2 && k < 60; v += sc2.step, k++) { const q = val2(v, sc2); s += '<text x="' + f2(px1 + 6) + '" y="' + f2(q + fs * 0.32) + '" text-anchor="start" font-size="' + f2(fs * 0.9) + '" fill="' + tx + '">' + esc(fmtV(TB.round15(v))) + '</text>'; }
    const zero = val2(Math.max(sc1.min, Math.min(sc1.max, 0)), sc1);
    s += horiz ? '<line x1="' + f2(zero) + '" y1="' + f2(py0) + '" x2="' + f2(zero) + '" y2="' + f2(py1) + '" stroke="' + axisC + '"/>' : '<line x1="' + f2(px0) + '" y1="' + f2(zero) + '" x2="' + f2(px1) + '" y2="' + f2(zero) + '" stroke="' + axisC + '"/>';
    if (ch.yTitle) s += '<text transform="translate(' + f2(8 + fs) + ' ' + f2((py0 + py1) / 2) + ') rotate(-90)" text-anchor="middle" font-size="' + f2(fs) + '" fill="' + tx + '">' + esc(ch.yTitle) + '</text>';
    if (ch.y2Title && has2) s += '<text transform="translate(' + f2(W - 8 - fs * 0.4) + ' ' + f2((py0 + py1) / 2) + ') rotate(-90)" text-anchor="middle" font-size="' + f2(fs) + '" fill="' + tx + '">' + esc(ch.y2Title) + '</text>';
    if (ch.xTitle) s += '<text x="' + f2((px0 + px1) / 2) + '" y="' + f2(H - 8 - fs * 0.3) + '" text-anchor="middle" font-size="' + f2(fs) + '" fill="' + tx + '">' + esc(ch.xTitle) + '</text>';
    const band = (horiz ? py1 - py0 : px1 - px0) / Math.max(1, n);
    // étiquettes de catégories
    if (scatter) { for (let v = xsc.min, k = 0; v <= xsc.max + xsc.step / 2 && k < 60; v += xsc.step, k++) { const x = px0 + (v - xsc.min) / (xsc.max - xsc.min) * (px1 - px0); if (ch.grid !== false && ch.xGrid) s += '<line x1="' + f2(x) + '" y1="' + f2(py0) + '" x2="' + f2(x) + '" y2="' + f2(py1) + '" stroke="' + grid + '"/>'; s += '<text x="' + f2(x) + '" y="' + f2(py1 + fs * 1.2) + '" text-anchor="middle" font-size="' + f2(fs * 0.9) + '" fill="' + tx + '">' + esc(fmtV(TB.round15(v))) + '</text>'; } }
    else {
      const every = Math.max(1, Math.ceil(n / Math.max(1, (horiz ? (py1 - py0) / (fs * 1.3) : (rotate ? (px1 - px0) / (fs * 1.2) : (px1 - px0) / (maxCat * fs * 0.55 + 6))))));
      D.cats.forEach((cat, i) => {
        if (i % every) return; const m = (horiz ? py0 : px0) + band * (i + 0.5);
        if (horiz) s += '<text x="' + f2(px0 - 6) + '" y="' + f2(m + fs * 0.32) + '" text-anchor="end" font-size="' + f2(fs * 0.9) + '" fill="' + tx + '">' + esc(trunc(cat, 30)) + '</text>';
        else if (rotate) s += '<text transform="translate(' + f2(m + fs * 0.3) + ' ' + f2(py1 + 6) + ') rotate(-45)" text-anchor="end" font-size="' + f2(fs * 0.85) + '" fill="' + tx + '">' + esc(trunc(cat, 24)) + '</text>';
        else s += '<text x="' + f2(m) + '" y="' + f2(py1 + fs * 1.2) + '" text-anchor="middle" font-size="' + f2(fs * 0.9) + '" fill="' + tx + '">' + esc(cat) + '</text>';
      });
    }
    // séries : barres d'abord, puis aires, puis courbes
    const bars = series.map((sr, i) => [sr, i]).filter(([sr]) => kindOf(sr) === 'bar');
    const nb = Math.max(1, bars.length), inner = band * (ch.gap != null ? 1 - ch.gap : 0.7), bw = stacked ? inner : inner / nb;
    const pos = new Array(n).fill(0), neg = new Array(n).fill(0);
    bars.forEach(([sr, si], bi) => {
      const col = sr.color || CH.color(wb, ch, si); const sc = sr.axis === 2 ? sc2 : sc1;
      sr.values.forEach((v0, i) => {
        if (v0 == null) return; let v = v0;
        if (pct100) { const t = v >= 0 ? totals[i][0] : -totals[i][1]; v = t ? v / t : 0; }
        let a, b2; if (stacked) { if (v >= 0) { a = pos[i]; b2 = pos[i] + v; pos[i] += v; } else { a = neg[i] + v; b2 = neg[i]; neg[i] += v; } } else { a = Math.min(0, v); b2 = Math.max(0, v); }
        const q0 = val2(Math.max(sc.min, Math.min(sc.max, a)), sc), q1 = val2(Math.max(sc.min, Math.min(sc.max, b2)), sc);
        const off = (horiz ? py0 : px0) + band * i + (band - inner) / 2 + (stacked ? 0 : bw * bi);
        if (horiz) s += '<rect x="' + f2(Math.min(q0, q1)) + '" y="' + f2(off) + '" width="' + f2(Math.abs(q1 - q0)) + '" height="' + f2(bw * 0.9) + '" fill="' + col + '"><title>' + esc(sr.name + ' – ' + D.cats[i] + ' : ' + fmtV(v0)) + '</title></rect>';
        else s += '<rect x="' + f2(off) + '" y="' + f2(Math.min(q0, q1)) + '" width="' + f2(bw * 0.9) + '" height="' + f2(Math.abs(q1 - q0)) + '" fill="' + col + '"><title>' + esc(sr.name + ' – ' + D.cats[i] + ' : ' + fmtV(v0)) + '</title></rect>';
        if (ch.labels) { const lab = esc(fmtV(pct100 ? v : v0, pct100)); if (horiz) s += '<text x="' + f2(stacked ? (q0 + q1) / 2 : Math.max(q0, q1) + 4) + '" y="' + f2(off + bw * 0.45 + fs * 0.32) + '" text-anchor="' + (stacked ? 'middle' : 'start') + '" font-size="' + f2(fs * 0.8) + '" fill="' + (stacked ? readable(col) : tx) + '">' + lab + '</text>'; else s += '<text x="' + f2(off + bw * 0.45) + '" y="' + f2(stacked ? (q0 + q1) / 2 + fs * 0.3 : Math.min(q0, q1) - 4) + '" text-anchor="middle" font-size="' + f2(fs * 0.8) + '" fill="' + (stacked ? readable(col) : tx) + '">' + lab + '</text>'; }
      });
    });
    const accum = new Array(n).fill(0);
    series.forEach((sr, si) => {
      const k = kindOf(sr); if (k === 'bar') return;
      const col = sr.color || CH.color(wb, ch, si); const sc = sr.axis === 2 ? sc2 : sc1;
      const pts = [];
      sr.values.forEach((v0, i) => {
        if (v0 == null) { pts.push(null); return; }
        let v = v0; if ((stacked || /stackedLine|stackedArea/.test(ch.kind)) && k !== 'scatter') { accum[i] += v; v = accum[i]; }
        const x = scatter ? px0 + ((sr.xs && sr.xs[i] != null ? sr.xs[i] : i + 1) - xsc.min) / (xsc.max - xsc.min) * (px1 - px0) : px0 + band * (i + 0.5);
        pts.push([x, val2(Math.max(sc.min, Math.min(sc.max, v)), sc), v0, i]);
      });
      const segs = []; let cur = []; pts.forEach((p) => { if (!p) { if (cur.length) segs.push(cur); cur = []; } else cur.push(p); }); if (cur.length) segs.push(cur);
      const path = (l) => { if (ch.smooth && l.length > 2) { let d = 'M' + f2(l[0][0]) + ',' + f2(l[0][1]); for (let i = 1; i < l.length; i++) { const p0 = l[i - 2] || l[i - 1], p1 = l[i - 1], p2 = l[i], p3 = l[i + 1] || p2; d += ' C' + f2(p1[0] + (p2[0] - p0[0]) / 6) + ',' + f2(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f2(p2[0] - (p3[0] - p1[0]) / 6) + ',' + f2(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f2(p2[0]) + ',' + f2(p2[1]); } return d; } return 'M' + l.map((p) => f2(p[0]) + ',' + f2(p[1])).join(' L'); };
      segs.forEach((l) => {
        if (k === 'area') s += '<path d="' + path(l) + ' L' + f2(l[l.length - 1][0]) + ',' + f2(zero) + ' L' + f2(l[0][0]) + ',' + f2(zero) + ' Z" fill="' + col + '" fill-opacity="' + (/stacked/.test(ch.kind) ? '.85' : '.55') + '"/>';
        if (k === 'line' || k === 'area' || (k === 'scatter' && ch.kind === 'scatterLines')) s += '<path d="' + path(l) + '" fill="none" stroke="' + col + '" stroke-width="' + f2(Math.max(1.5, fs / 5.5)) + '" stroke-linejoin="round" stroke-linecap="round"/>';
      });
      const markers = k === 'scatter' || ch.kind === 'lineMarkers' || (k === 'line' && n <= 24 && ch.markers !== false && /combo/.test(ch.kind));
      pts.forEach((p) => { if (!p) return; if (markers) s += '<circle cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="' + f2(Math.max(2.5, fs / 4)) + '" fill="' + (k === 'scatter' ? col : '#fff') + '" stroke="' + col + '" stroke-width="2"><title>' + esc(sr.name + ' : ' + fmtV(p[2])) + '</title></circle>'; if (ch.labels) s += '<text x="' + f2(p[0]) + '" y="' + f2(p[1] - 7) + '" text-anchor="middle" font-size="' + f2(fs * 0.8) + '" fill="' + tx + '">' + esc(fmtV(p[2])) + '</text>'; });
    });
    return s + '</svg>';
  };
  function legendMark(x, y, l, fs) { return l[2] === 'line' ? '<line x1="' + f2(x) + '" y1="' + f2(y + fs * 0.45) + '" x2="' + f2(x + fs * 0.9) + '" y2="' + f2(y + fs * 0.45) + '" stroke="' + l[1] + '" stroke-width="2.5"/>' : '<rect x="' + f2(x) + '" y="' + f2(y + fs * 0.05) + '" width="' + f2(fs * 0.8) + '" height="' + f2(fs * 0.8) + '" fill="' + l[1] + '"/>'; }
  const trunc = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  function pieSvg(wb, ch, D, left, top, right, bottom, fs, fmtV) {
    let s = ''; const vals = (D.series[0] ? D.series[0].values : []).map((v) => Math.max(0, v || 0)); const sum = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = (left + right) / 2, cy = (top + bottom) / 2, r = Math.max(10, Math.min(right - left, bottom - top) / 2 - 6), hole = ch.kind === 'doughnut' ? r * (ch.hole || 0.55) : 0;
    let a0 = -Math.PI / 2 + (ch.angle || 0) * Math.PI / 180;
    vals.forEach((v, i) => {
      const a1 = a0 + v / sum * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, col = CH.color(wb, ch, i);
      const p = (a, rr) => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
      if (v / sum >= 0.9999) s += '<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + f2(r) + '" fill="' + col + '"/>' + (hole ? '<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + f2(hole) + '" fill="#fff"/>' : '');
      else if (v > 0) { const o1 = p(a0, r), o2 = p(a1, r); if (hole) { const i1 = p(a1, hole), i2 = p(a0, hole); s += '<path d="M' + f2(o1[0]) + ',' + f2(o1[1]) + ' A' + f2(r) + ',' + f2(r) + ' 0 ' + big + ',1 ' + f2(o2[0]) + ',' + f2(o2[1]) + ' L' + f2(i1[0]) + ',' + f2(i1[1]) + ' A' + f2(hole) + ',' + f2(hole) + ' 0 ' + big + ',0 ' + f2(i2[0]) + ',' + f2(i2[1]) + ' Z" fill="' + col + '" stroke="#fff" stroke-width="1.5"><title>' + esc(D.cats[i] + ' : ' + fmtV(v)) + '</title></path>'; } else s += '<path d="M' + f2(cx) + ',' + f2(cy) + ' L' + f2(o1[0]) + ',' + f2(o1[1]) + ' A' + f2(r) + ',' + f2(r) + ' 0 ' + big + ',1 ' + f2(o2[0]) + ',' + f2(o2[1]) + ' Z" fill="' + col + '" stroke="#fff" stroke-width="1.5"><title>' + esc(D.cats[i] + ' : ' + fmtV(v)) + '</title></path>'; }
      if (ch.labels !== false && v > 0 && v / sum > 0.03) { const m = (a0 + a1) / 2, lr = hole ? (r + hole) / 2 : r * 0.65, lp = p(m, lr); s += '<text x="' + f2(lp[0]) + '" y="' + f2(lp[1] + fs * 0.35) + '" text-anchor="middle" font-size="' + f2(fs * 0.9) + '" font-weight="700" fill="' + readable(col) + '">' + (ch.labelsValue ? esc(fmtV(v)) : Math.round(v / sum * 100) + ' %') + '</text>'; }
      a0 = a1;
    });
    return s;
  }
  /* ---------------- références des graphiques et structure ---------------- */
  const mapRef = (txt, fn) => { if (!txt) return txt; try { const a = P.parse(String(txt).replace(/^=/, '')); const b = fn(a); return b === a ? txt : P.write(b); } catch (e) { return txt; } };
  TB.chartRestructure = function (ch, op, home) { const o = Object.assign({}, ch); o.src = mapRef(ch.src, (a) => P.restructure(a, op, home)); if (ch.series) o.series = ch.series.map((s) => Object.assign({}, s, { values: mapRef(s.values, (a) => P.restructure(a, op, home)), cats: mapRef(s.cats, (a) => P.restructure(a, op, home)), name: /!/.test(s.name || '') ? mapRef(s.name, (a) => P.restructure(a, op, home)) : s.name })); return o; };
  TB.chartRenameSheet = function (ch, a, b) { const o = Object.assign({}, ch); o.src = mapRef(ch.src, (x) => P.renameSheet(x, a, b)); if (ch.series) o.series = ch.series.map((s) => Object.assign({}, s, { values: mapRef(s.values, (x) => P.renameSheet(x, a, b)), cats: mapRef(s.cats, (x) => P.renameSheet(x, a, b)) })); return o; };
})(typeof window !== 'undefined' ? window : globalThis);
