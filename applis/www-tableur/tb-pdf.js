/* Tableur — export PDF vectoriel (jsPDF) avec polices libres incluses (Mag Sans, Mag Sans Douce, Mag Serif,
   Mag Mono, Caladea) : zone d'impression, orientation, format, marges, échelle ou ajustement à N pages, titres répétés,
   quadrillage et en-têtes de lignes / colonnes facultatifs, en-têtes et pieds de page (&P, &N, &D, &T, &F, &A),
   fusions, remplissages, bordures, alignements, renvoi à la ligne, débordement du texte, mises en forme
   conditionnelles (couleurs, barres), graphiques et images.
   TB.Pdf.export(wb, {sheets:'active'|'all'|'selection', range}) → Blob ; TB.Pdf.layout(wb, sh) → pages (sauts). */
(function () {
  'use strict';
  const TB = window.Tableur, O = window.Office;
  const PDF = TB.Pdf = {};
  const App = window.TableurApp = window.TableurApp || {};
  const PT = 0.75; // 1 px écran = 0,75 pt
  const PAPERS = { A4: [595.28, 841.89], A3: [841.89, 1190.55], A5: [419.53, 595.28], Letter: [612, 792], Legal: [612, 1008] };
  const CM = 28.3465;
  const DEF_M = { t: 1.9, b: 1.9, l: 1.8, r: 1.8, h: 0.8, f: 0.8 };

  /* ---------------- polices ---------------- */
  const FILES = { 'Mag Sans': 'MagSans', 'Mag Serif': 'MagSerif', 'Mag Mono': 'MagMono', 'Mag Sans Douce': 'MagSansDouce', 'Caladea': 'Caladea' };
  const FACE = (b, i) => b && i ? 'BoldItalic' : b ? 'Bold' : i ? 'Italic' : 'Regular';
  PDF.family = function (name) {
    const n = String(name || TB.DEFAULT_FONT).toLowerCase();
    if (/mono|courier|consolas|menlo|lucida console/.test(n)) return 'Mag Mono';
    if (/cambria|caladea/.test(n)) return 'Caladea';
    if (/times|serif|georgia|garamond|book|palatino|constantia|mag serif|liberation serif/.test(n) && !/sans/.test(n)) return 'Mag Serif';
    if (/arial|helvetica|liberation sans|mag sans$|arimo|dejavu sans/.test(n)) return 'Mag Sans';
    return 'Mag Sans Douce';
  };
  const B64 = {};
  async function fontB64(file) {
    if (B64[file]) return B64[file];
    const buf = new Uint8Array(await (await fetch(O.vendor + 'fonts/' + file)).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return (B64[file] = btoa(bin));
  }
  const SUBST = { ' ': ' ', ' ': ' ', ' ': ' ', '−': '-', '‑': '-' };

  /* ---------------- pagination ---------------- */
  function areaOf(wb, sh, opt) {
    if (opt && opt.range) return opt.range;
    const pz = sh.print || {};
    if (pz.area) { const g = TB.parseRange(String(pz.area).replace(/\$/g, '').replace(/^.*!/, '')); if (g) return g; }
    const e = sh.extent(); let r2 = Math.max(0, e.r), c2 = Math.max(0, e.c);
    // objets : étendre la zone
    sh.objs.forEach((o) => { if (!o.from) return; let x = 0, c = o.from.c; const w = (o.from.dx || 0) + o.w; while (x < w && c < 16383) { x += sh.colWidth(c) || 0; if (x < w) c++; if (c - o.from.c > 400) break; } let y = 0, r = o.from.r; const h = (o.from.dy || 0) + o.h; while (y < h && r < 1048575) { y += sh.rowHeight(r) || 0; if (y < h) r++; if (r - o.from.r > 2000) break; } r2 = Math.max(r2, r); c2 = Math.max(c2, c); });
    return { r1: 0, c1: 0, r2, c2 };
  }
  const span = (s) => { const m = /^\$?([A-Z]+)?\$?(\d+)?:\$?([A-Z]+)?\$?(\d+)?$/i.exec(String(s || '').replace(/\$/g, '').trim()); if (!m) return null; if (m[2] && m[4]) return { a: +m[2] - 1, b: +m[4] - 1 }; if (m[1] && m[3]) return { a: TB.colIndex(m[1]), b: TB.colIndex(m[3]) }; return null; };
  /** calcule la mise en page d'une feuille : échelle, groupes de lignes et de colonnes, dimensions */
  PDF.layout = function (wb, sh, opt) {
    opt = opt || {};
    const pz = Object.assign({}, sh.print || {}, opt.print || {});
    let [PW, PH] = PAPERS[pz.paper || 'A4'] || PAPERS.A4; if (pz.orient === 'landscape') [PW, PH] = [PH, PW];
    const m = Object.assign({}, DEF_M, pz.margins || {});
    const g = areaOf(wb, sh, opt);
    const heads = !!pz.heads, hw = heads ? 30 : 0, hh = heads ? 14 : 0;
    const tr = pz.titles && pz.titles.rows ? span(pz.titles.rows) : null, tc = pz.titles && pz.titles.cols ? span(pz.titles.cols) : null;
    const cols = [], rows = [];
    for (let c = g.c1; c <= g.c2; c++) { const w = sh.colWidth(c); if (w > 0) cols.push([c, w * PT]); }
    for (let r = g.r1; r <= g.r2; r++) { const h = sh.rowHeight(r); if (h > 0) rows.push([r, h * PT]); }
    const tW = tc ? cols.filter(([c]) => c >= tc.a && c <= tc.b).reduce((s, x) => s + x[1], 0) : 0;
    const tH = tr ? rows.filter(([r]) => r >= tr.a && r <= tr.b).reduce((s, x) => s + x[1], 0) : 0;
    const availW = PW - (m.l + m.r) * CM, availH = PH - (m.t + m.b) * CM;
    const totW = cols.reduce((s, x) => s + x[1], 0) + hw, totH = rows.reduce((s, x) => s + x[1], 0) + hh;
    let k = (pz.scale || 100) / 100;
    if (pz.fitW != null || pz.fitH != null) {
      k = 1;
      if (pz.fitW) k = Math.min(k, (availW * pz.fitW) / Math.max(1, totW + tW * (pz.fitW - 1)));
      if (pz.fitH) k = Math.min(k, (availH * pz.fitH) / Math.max(1, totH + tH * (pz.fitH - 1)));
      k = Math.max(0.1, k);
      if (pz.fitW && pz.fitH) { // affiner : éviter qu'une page de trop apparaisse à cause des arrondis
        for (let it = 0; it < 8; it++) { const L = groups(); if (L.cg.length <= pz.fitW && L.rg.length <= pz.fitH) break; k *= 0.97; }
      } else if (pz.fitW) { for (let it = 0; it < 8; it++) { const L = groups(); if (L.cg.length <= pz.fitW) break; k *= 0.97; } }
    }
    function groups() {
      const brR = new Set(sh.brR || []), brC = new Set(sh.brC || []);
      const split = (list, avail, tSize, br, inT) => {
        const out = []; let cur = [], used = 0;
        list.forEach(([i, s]) => { const sz = s * k; const lim = avail - (out.length || cur.length ? tSize * k : 0); if (cur.length && (used + sz > lim + 0.01 || br.has(i))) { out.push(cur); cur = []; used = inT ? 0 : 0; } cur.push(i); used += sz; });
        if (cur.length) out.push(cur); return out;
      };
      return { cg: split(cols, availW - hw * k, tW, brC), rg: split(rows, availH - hh * k, tH, brR) };
    }
    const L = groups();
    const W = new Map(cols), H = new Map(rows);
    const pages = [];
    if (pz.order === 'over') L.rg.forEach((rr, ri) => L.cg.forEach((cc, ci) => pages.push({ rows: rr, cols: cc, ri, ci })));
    else L.cg.forEach((cc, ci) => L.rg.forEach((rr, ri) => pages.push({ rows: rr, cols: cc, ri, ci })));
    const tRows = tr ? rows.filter(([r]) => r >= tr.a && r <= tr.b).map((x) => x[0]) : [];
    const tCols = tc ? cols.filter(([c]) => c >= tc.a && c <= tc.b).map((x) => x[0]) : [];
    pages.forEach((p) => { p.trows = p.ri > 0 ? tRows.filter((r) => r < p.rows[0]) : []; p.tcols = p.ci > 0 ? tCols.filter((c) => c < p.cols[0]) : []; });
    return { PW, PH, m, k, g, pages, W, H, heads, hw, hh, pz, rowBreaks: L.rg.slice(1).map((x) => x[0]), colBreaks: L.cg.slice(1).map((x) => x[0]) };
  };
  /** sauts de page automatiques (affichage dans la grille) */
  App.pageBreaks = function (sh) { try { const wb = sh.wb; const L = PDF.layout(wb, sh); if (L.pages.length <= 1) return { rows: [], cols: [] }; return { rows: L.rowBreaks, cols: L.colBreaks }; } catch (e) { return null; } };

  /* ---------------- dessin ---------------- */
  const hexRgb = (h) => { const n = parseInt(String(h || '#000').replace('#', '').slice(0, 6).padEnd(6, '0'), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const BW = { hair: 0.25, thin: 0.5, medium: 1.25, thick: 2, double: 0.4, dashed: 0.5, dotted: 0.5, mediumDashed: 1.25, dashDot: 0.5, mediumDashDot: 1.25, dashDotDot: 0.5, mediumDashDotDot: 1.25, slantDashDot: 1.25 };
  const DASH = { dashed: [3, 2], mediumDashed: [4, 2], dotted: [0.6, 1.4], dashDot: [3, 1.5, 0.6, 1.5], mediumDashDot: [4, 2, 1, 2], dashDotDot: [3, 1.5, 0.6, 1.5, 0.6, 1.5], mediumDashDotDot: [4, 2, 1, 2, 1, 2], slantDashDot: [4, 2, 1, 2] };
  function hfText(s, ctx) {
    return String(s || '').replace(/&([PNDTFA])/g, (_, k) => ({ P: String(ctx.page), N: String(ctx.pages), D: new Date().toLocaleDateString('fr-FR'), T: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), F: ctx.file || '', A: ctx.sheet || '' })[k]).replace(/&&/g, '&');
  }
  async function svgPng(svg, w, h) {
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * 2)); c.height = Math.max(1, Math.round(h * 2)); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.scale(2, 2); try { x.drawImage(img, 0, 0, w, h); } catch (e) { /* image vide */ }
    return c.toDataURL('image/png');
  }
  function blobUrl(b) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(b); }); }

  PDF.export = async function (wb, opt) {
    opt = opt || {};
    const J = await O.Pdf.load();
    const list = opt.sheets === 'all' ? wb.sheets.filter((s) => !s.hidden) : [opt.sheet || wb.cur];
    let doc = null; const fonts = new Set(); const cmaps = {};
    const ensureFont = async (fam, face) => { const key = fam + '|' + face; if (fonts.has(key)) return; fonts.add(key); const file = FILES[fam] + '-' + face + '.ttf'; doc.addFileToVFS(file, await fontB64(file)); doc.addFont(file, fam, face); };
    const setFont = async (fam, b, i) => { const face = FACE(b, i); await ensureFont(fam, face); doc.setFont(fam, face); const k = fam + '|' + face; if (!(k in cmaps)) { try { const f = doc.getFont(); cmaps[k] = f.metadata && f.metadata.cmap && f.metadata.cmap.unicode && f.metadata.cmap.unicode.codeMap; } catch (e) { cmaps[k] = null; } } return cmaps[k]; };
    const clean = (str, cmap) => Array.from(String(str)).map((ch) => SUBST[ch] != null ? SUBST[ch] : cmap && cmap[ch.codePointAt(0)] == null ? (ch.codePointAt(0) > 255 ? '?' : ch) : ch).join('');
    const layouts = list.map((sh) => ({ sh, L: PDF.layout(wb, sh, opt.sheets === 'selection' ? { range: opt.range } : null) }));
    const total = layouts.reduce((s, x) => s + x.L.pages.length, 0); let pageNo = 0;
    for (const { sh, L } of layouts) {
      const { PW, PH, m, k, W, H, pz } = L;
      const cf = TB.CF.prepare(wb, sh, (wb.ver || 0) + 0.5);
      const ox = m.l * CM, oy = m.t * CM;
      let pageOfSheet = 0;
      for (const p of L.pages) {
        pageNo++; pageOfSheet++;
        if (opt.progress) opt.progress(pageNo, total);
        if (!doc) doc = new J({ unit: 'pt', format: [PW, PH].sort((a, b) => a - b), orientation: PW > PH ? 'landscape' : 'portrait', compress: true });
        else doc.addPage([PW, PH].sort((a, b) => a - b), PW > PH ? 'landscape' : 'portrait');
        const rowsAll = p.trows.concat(p.rows), colsAll = p.tcols.concat(p.cols);
        const X0 = new Map(), Y0 = new Map();
        const hw = L.hw * k, hh = L.hh * k;
        let x = ox + hw; colsAll.forEach((c) => { X0.set(c, x); x += W.get(c) * k; }); const xEnd = x;
        let y = oy + hh; rowsAll.forEach((r) => { Y0.set(r, y); y += H.get(r) * k; }); const yEnd = y;
        let tw = xEnd - ox, th = yEnd - oy;
        let dx = 0, dy = 0; if (pz.center && pz.center.h) dx = (PW - (m.l + m.r) * CM - tw) / 2; if (pz.center && pz.center.v) dy = (PH - (m.t + m.b) * CM - th) / 2;
        const X = (c) => X0.get(c) + dx, Y = (r) => Y0.get(r) + dy;
        const inPage = (r, c) => Y0.has(r) && X0.has(c);
        const colSet = new Set(colsAll), rowSet = new Set(rowsAll);
        // fusions visibles
        const merges = sh.merges.filter((g) => rowsAll.some((r) => r >= g.r1 && r <= g.r2) && colsAll.some((c) => c >= g.c1 && c <= g.c2));
        const mergeAt = (r, c) => merges.find((g) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2);
        const boxOf = (r, c) => {
          const g = mergeAt(r, c);
          if (!g) return { x: X(c), y: Y(r), w: W.get(c) * k, h: H.get(r) * k, r, c };
          let x1 = null, x2 = 0, y1 = null, y2 = 0;
          colsAll.forEach((cc) => { if (cc >= g.c1 && cc <= g.c2) { if (x1 === null) x1 = X(cc); x2 = X(cc) + W.get(cc) * k; } });
          rowsAll.forEach((rr) => { if (rr >= g.r1 && rr <= g.r2) { if (y1 === null) y1 = Y(rr); y2 = Y(rr) + H.get(rr) * k; } });
          return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, r: g.r1, c: g.c1, m: g };
        };
        const styleOf = (r, c) => { let st = wb.styles.get(sh.styleAt(r, c)); if (cf.any) { const z = TB.CF.cell(cf, r, c); if (z && z.st) st = Object.assign({}, st, z.st); if (z) st = Object.assign({}, st, { _bar: z.bar, _icon: z.icon }); } return st; };
        // 1. remplissages
        for (const r of rowsAll) for (const c of colsAll) {
          const g = mergeAt(r, c); if (g && (r !== Math.max(g.r1, rowsAll.find((x) => x >= g.r1)) || c !== Math.max(g.c1, colsAll.find((x) => x >= g.c1)))) continue;
          const st = g ? styleOf(g.r1, g.c1) : styleOf(r, c); const b = boxOf(r, c);
          if (st.bg) { doc.setFillColor(...hexRgb(st.bg)); doc.rect(b.x, b.y, b.w, b.h, 'F'); }
          if (st._bar) { const br = st._bar; const bw = Math.max(0, (b.w - 4) * br.pct); doc.setFillColor(...hexRgb(br.color)); const bx = b.x + 2 + (b.w - 4) * (br.axis || 0) - (br.pct < 0 ? bw : 0); doc.rect(bx, b.y + 2, Math.abs(bw), b.h - 4, 'F'); }
        }
        // 2. quadrillage
        if (pz.grid) {
          doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.setLineDashPattern([], 0);
          for (const r of rowsAll) for (const c of colsAll) { if (mergeAt(r, c)) continue; doc.rect(X(c), Y(r), W.get(c) * k, H.get(r) * k, 'S'); }
          merges.forEach((g) => { const r = rowsAll.find((x) => x >= g.r1 && x <= g.r2), c = colsAll.find((x) => x >= g.c1 && x <= g.c2); if (r == null || c == null) return; const b = boxOf(r, c); doc.rect(b.x, b.y, b.w, b.h, 'S'); });
        }
        // 3. en-têtes de lignes et colonnes
        if (L.heads) {
          await setFont('Mag Sans Douce', false, false); doc.setFontSize(8 * k); doc.setTextColor(80, 80, 80); doc.setDrawColor(170, 170, 170); doc.setLineWidth(0.4);
          colsAll.forEach((c) => { doc.setFillColor(235, 237, 240); doc.rect(X(c), oy + dy, W.get(c) * k, hh, 'FD'); const t = TB.colName(c); doc.text(t, X(c) + W.get(c) * k / 2, oy + dy + hh / 2, { align: 'center', baseline: 'middle' }); });
          rowsAll.forEach((r) => { doc.setFillColor(235, 237, 240); doc.rect(ox + dx, Y(r), hw, H.get(r) * k, 'FD'); doc.text(String(r + 1), ox + dx + hw / 2, Y(r) + H.get(r) * k / 2, { align: 'center', baseline: 'middle' }); });
        }
        // 4. bordures
        const line = (x1, y1, x2, y2, b) => { if (!b) return; const w = (BW[b.s] || 0.5) * Math.max(0.5, k); doc.setDrawColor(...hexRgb(b.c || '#000')); doc.setLineWidth(w); doc.setLineDashPattern(DASH[b.s] ? DASH[b.s].map((v) => v * Math.max(0.6, k)) : [], 0); if (b.s === 'double') { const o = 0.9; if (y1 === y2) { doc.line(x1, y1 - o, x2, y2 - o); doc.line(x1, y1 + o, x2, y2 + o); } else { doc.line(x1 - o, y1, x2 - o, y2); doc.line(x1 + o, y1, x2 + o, y2); } } else doc.line(x1, y1, x2, y2); };
        for (const r of rowsAll) for (const c of colsAll) {
          const g = mergeAt(r, c);
          const st = g ? styleOf(g.r1, g.c1) : wb.styles.get(sh.styleAt(r, c));
          const x1 = X(c), y1 = Y(r), x2 = x1 + W.get(c) * k, y2 = y1 + H.get(r) * k;
          if (g) {
            // bordures d'une fusion : côtés extérieurs seulement (style de la cellule d'ancrage ou des cellules du bord)
            const sb = (rr, cc) => wb.styles.get(sh.styleAt(rr, cc));
            if (r === g.r1 || r === rowsAll.find((x) => x >= g.r1)) line(x1, y1, x2, y1, sb(g.r1, c).bt || st.bt);
            if (r === g.r2) line(x1, y2, x2, y2, sb(g.r2, c).bb || st.bb);
            if (c === g.c1 || c === colsAll.find((x) => x >= g.c1)) line(x1, y1, x1, y2, sb(r, g.c1).bl || st.bl);
            if (c === g.c2) line(x2, y1, x2, y2, sb(r, g.c2).br || st.br);
            continue;
          }
          if (st.bt) line(x1, y1, x2, y1, st.bt); if (st.bb) line(x1, y2, x2, y2, st.bb); if (st.bl) line(x1, y1, x1, y2, st.bl); if (st.br) line(x2, y1, x2, y2, st.br);
          if (st.bu) line(x1, y1, x2, y2, st.bu); if (st.bd) line(x1, y2, x2, y1, st.bd);
          // bordure de la cellule voisine (droite / bas) dessinée par elle-même : rien à faire
        }
        doc.setLineDashPattern([], 0);
        // 5. textes
        const occupied = (r, c) => { const v = sh.get(r, c); return v !== null && v !== '' || !!mergeAt(r, c); };
        for (const r of rowsAll) {
          for (const c of colsAll) {
            const g = mergeAt(r, c);
            if (g) { const fr = rowsAll.find((x) => x >= g.r1 && x <= g.r2), fc = colsAll.find((x) => x >= g.c1 && x <= g.c2); if (r !== fr || c !== fc) continue; }
            const rr = g ? g.r1 : r, cc = g ? g.c1 : c;
            const v = sh.get(rr, cc); if (v === null || v === '') continue;
            const st = styleOf(rr, cc); const b = boxOf(r, c);
            if (st._icon && st._icon.only) continue;
            const fam = PDF.family(st.fn); const cmap = await setFont(fam, !!st.b, !!st.i);
            const size = (st.fs || TB.DEFAULT_SIZE) * k; doc.setFontSize(size);
            const isNum = typeof v === 'number';
            const fmtW = Math.max(1, Math.round((b.w / k / PT - 6) / ((st.fs || 11) * 0.62)));
            const fm = TB.Fmt.format(v, st.nf, isNum && (!st.nf || /General/.test(st.nf)) ? { width: fmtW } : undefined);
            let s = clean(fm.s, cmap);
            const color = fm.c ? (TB.Fmt.colorHex ? TB.Fmt.colorHex(fm.c) : fm.c) : st.fc || '#000000';
            doc.setTextColor(...hexRgb(/^#/.test(color) ? color : ({ red: '#FF0000', blue: '#0000FF', green: '#00B050', yellow: '#FFFF00', magenta: '#FF00FF', cyan: '#00FFFF', white: '#FFFFFF', black: '#000000' })[String(color).toLowerCase()] || '#000000'));
            const pad = 2 * k + (st.ind || 0) * 9 * k;
            let ha = st.ha || (isNum ? 'right' : typeof v === 'boolean' || fm.err ? 'center' : 'left');
            if (ha === 'fill' || ha === 'justify' || ha === 'distributed') ha = 'left'; if (ha === 'centerContinuous') ha = 'center';
            const va = st.va || 'bottom';
            const lh = size * 1.18;
            let lines;
            if (st.wr) { lines = []; String(s).split('\n').forEach((para) => { const ws = para.split(/(\s+)/); let cur = ''; ws.forEach((w) => { const t = cur + w; if (cur && doc.getTextWidth(t.trimEnd()) > b.w - 2 * pad) { lines.push(cur.trimEnd()); cur = w.trimStart(); } else cur = t; }); lines.push(cur); }); }
            else lines = [String(s).replace(/\n/g, ' ')];
            let tw = Math.max(...lines.map((l) => doc.getTextWidth(l)));
            if (isNum && !st.wr && tw > b.w - 2 * pad && !g) { s = '#'.repeat(Math.max(1, Math.floor((b.w - 2 * pad) / Math.max(1, doc.getTextWidth('#'))))); lines = [s]; tw = doc.getTextWidth(s); }
            // débordement à droite (texte aligné à gauche) : cellules vides suivantes
            let clipW = b.w;
            if (!st.wr && !isNum && ha === 'left' && tw > b.w - 2 * pad && !g) { let ci = colsAll.indexOf(c) + 1; while (ci < colsAll.length && clipW < tw + 2 * pad && !occupied(r, colsAll[ci])) { clipW += W.get(colsAll[ci]) * k; ci++; } }
            const totalH = lines.length * lh;
            let ty = va === 'top' ? b.y + 1.5 * k + size * 0.85 : va === 'center' ? b.y + (b.h - totalH) / 2 + size * 0.85 : b.y + b.h - 2 * k - totalH + size * 0.85;
            const tx = ha === 'right' ? b.x + b.w - pad : ha === 'center' ? b.x + b.w / 2 : b.x + pad;
            doc.saveGraphicsState();
            doc.rect(b.x, b.y - 0.5, Math.max(clipW, ha === 'center' ? b.w : 0), b.h + 1, null); doc.clip(); doc.discardPath();
            const rot = st.rot && st.rot !== 255 ? st.rot : 0;
            if (rot) { doc.text(lines.join(' '), b.x + b.w / 2, b.y + b.h - 3 * k, { angle: rot, baseline: 'alphabetic' }); }
            else if (st.rot === 255) { const ch = Array.from(lines.join('')); let yy = b.y + size; ch.forEach((t) => { doc.text(t, b.x + b.w / 2, yy, { align: 'center', baseline: 'alphabetic' }); yy += lh; }); }
            else lines.forEach((l) => { doc.text(l, tx, ty, { align: ha === 'right' ? 'right' : ha === 'center' ? 'center' : 'left', baseline: 'alphabetic' }); if (st.u) { const w = doc.getTextWidth(l); const lx = ha === 'right' ? tx - w : ha === 'center' ? tx - w / 2 : tx; doc.setDrawColor(...hexRgb(color && /^#/.test(color) ? color : '#000000')); doc.setLineWidth(Math.max(0.4, size / 18)); doc.line(lx, ty + size * 0.12, lx + w, ty + size * 0.12); if (st.u === 'double') doc.line(lx, ty + size * 0.22, lx + w, ty + size * 0.22); } if (st.st) { const w = doc.getTextWidth(l); const lx = ha === 'right' ? tx - w : ha === 'center' ? tx - w / 2 : tx; doc.setLineWidth(Math.max(0.4, size / 18)); doc.line(lx, ty - size * 0.3, lx + w, ty - size * 0.3); } ty += lh; });
            doc.restoreGraphicsState();
            const lk = sh.links.get(TB.key(rr, cc)); if (lk && lk.url && /^(https?:|mailto:)/.test(lk.url)) doc.link(b.x, b.y, b.w, b.h, { url: lk.url });
          }
        }
        // 6. objets (graphiques, images, formes)
        for (const o of sh.objs) {
          if (!o.from) continue;
          if (!rowSet.has(o.from.r) && !rowsAll.some((r) => r > o.from.r) ) continue;
          if (!X0.has(o.from.c) || !Y0.has(o.from.r)) continue;
          const x0 = X(o.from.c) + (o.from.dx || 0) * PT * k, y0 = Y(o.from.r) + (o.from.dy || 0) * PT * k, w = o.w * PT * k, h = o.h * PT * k;
          try {
            if (o.type === 'chart') { const url = await svgPng(TB.Chart.svg(wb, o.chart, o.w, o.h, sh), o.w, o.h); doc.addImage(url, 'PNG', x0, y0, w, h, undefined, 'FAST'); }
            else if (o.type === 'image' && o.media && wb.media[o.media]) { const url = await blobUrl(wb.media[o.media]); if (url) { const fmt = /png/.test(url.slice(0, 30)) ? 'PNG' : /jpe?g/.test(url.slice(0, 30)) ? 'JPEG' : null; if (fmt) doc.addImage(url, fmt, x0, y0, w, h, undefined, 'FAST'); else { const png = await rasterImg(url, o.w, o.h); doc.addImage(png, 'PNG', x0, y0, w, h, undefined, 'FAST'); } } }
            else { const el = document.querySelector('[data-obj="' + o.id + '"]'); if (el && O.Raster) { const c = await O.Raster.canvas(el, { scale: 2 }); doc.addImage(c.toDataURL('image/png'), 'PNG', x0, y0, w, h, undefined, 'FAST'); } }
          } catch (e) { console.warn('objet PDF', e); }
        }
        void colSet;
        // 7. en-têtes et pieds de page
        const ctx = { page: pageNo, pages: total, file: (wb.fileName || wb.props.title || '').replace(/\.[^.]+$/, ''), sheet: sh.name };
        await setFont('Mag Sans Douce', false, false); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
        const hdr = pz.header || {}, ftr = pz.footer || {};
        const hy = (m.h != null ? m.h : 0.8) * CM + 8, fy = PH - (m.f != null ? m.f : 0.8) * CM;
        [['l', 'left', m.l * CM], ['c', 'center', PW / 2], ['r', 'right', PW - m.r * CM]].forEach(([key, al, xx]) => {
          if (hdr[key]) doc.text(clean(hfText(hdr[key], ctx), null), xx, hy, { align: al, baseline: 'alphabetic' });
          if (ftr[key]) doc.text(clean(hfText(ftr[key], ctx), null), xx, fy, { align: al, baseline: 'alphabetic' });
        });
        void pageOfSheet;
      }
    }
    if (!doc) { doc = new J({ unit: 'pt', format: 'a4', compress: true }); }
    doc.setProperties({ title: wb.props.title || (wb.fileName || '').replace(/\.[^.]+$/, '') || 'Classeur', author: wb.props.author || '', creator: 'Tableur (Suite MAG)' });
    return doc.output('blob');
  };
  async function rasterImg(url, w, h) { const img = new Image(); img.src = url; await new Promise((r) => { img.onload = r; img.onerror = r; }); const c = document.createElement('canvas'); c.width = Math.round(w * 2); c.height = Math.round(h * 2); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/png'); }
})();
