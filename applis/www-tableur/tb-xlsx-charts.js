/* Tableur — graphiques dans les .xlsx (DrawingML, norme ECMA-376) : écriture et lecture des graphiques simples
   (histogrammes, barres, courbes, aires, secteurs, anneau, nuage de points, combinés), avec titres, légende,
   étiquettes, couleurs, bornes de l'axe et axe secondaire. Les séries pointent vers les cellules : le graphique
   suit les données dans Excel et LibreOffice. */
(function () {
  'use strict';
  const TB = window.Tableur, P = TB.Formula;
  const XC = TB.XlsxCharts = {};
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart', NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const EMU = 9525;
  const hex = (c) => String(c || '#4472C4').replace('#', '').toUpperCase().slice(0, 6);
  const absRef = (sh, g) => TB.quoteSheet(sh.name) + '!' + TB.rangeStr(g, true);

  /* ---------------- références des séries ---------------- */
  /** → {series:[{name:{ref}|{lit}, cat:ref|null, val:ref, xs:ref|null, values, cats, xsv}], scatter} */
  XC.refs = function (wb, ch, home) {
    const D = TB.Chart.data(wb, ch, home);
    const out = [];
    const toAbs = (t) => { const r = TB.Chart.refOf(wb, t, home); return r ? absRef(r.sh, r.g) : null; };
    if (ch.explicit && ch.series && ch.series.length) {
      ch.series.forEach((s, i) => {
        const d = D.series[i] || { values: [] };
        const nr = s.name && /!/.test(s.name) ? toAbs(s.name) : null;
        out.push({ name: nr ? { ref: nr } : { lit: s.name || 'Série ' + (i + 1) }, cat: toAbs(s.cats), val: toAbs(s.values), xs: /scatter/.test(ch.kind) ? toAbs(s.cats) : null, values: d.values, cats: D.cats, xsv: d.xs });
      });
      return { series: out.filter((x) => x.val), D };
    }
    const R = TB.Chart.refOf(wb, ch.src, home); if (!R) return { series: [], D };
    const sh = R.sh, e = sh.extent();
    const g = { r1: R.g.r1, c1: R.g.c1, r2: Math.min(R.g.r2, Math.max(R.g.r1, e.r)), c2: Math.min(R.g.c2, Math.max(R.g.c1, e.c)) };
    // mêmes règles que TB.Chart.data
    const isLab = (r, c) => { const v = sh.get(r, c); return v === null || typeof v === 'string' || (typeof v === 'number' && TB.Fmt.isDate(wb.styles.get(sh.styleAt(r, c)).nf || '')); };
    let hdr = ch.header != null ? ch.header : true, lab = ch.labelsCol != null ? ch.labelsCol : true;
    if (ch.header == null) { let t = 0, n = 0; for (let c = g.c1 + 1; c <= g.c2; c++) { n++; if (typeof sh.get(g.r1, c) === 'string') t++; } hdr = n ? t / n >= 0.5 : typeof sh.get(g.r1, g.c1) === 'string'; if (g.r1 === g.r2) hdr = false; }
    if (ch.labelsCol == null) { let t = 0, n = 0; for (let r = g.r1 + (hdr ? 1 : 0); r <= g.r2; r++) { n++; if (isLab(r, g.c1) && sh.get(r, g.c1) !== null) t++; } lab = n ? t / n >= 0.5 : false; if (g.c1 === g.c2) lab = false; }
    const r0 = g.r1 + (hdr ? 1 : 0), c0 = g.c1 + (lab ? 1 : 0);
    const scatter = /scatter/.test(ch.kind);
    const numeric = (cells) => cells.some(([r, c]) => typeof sh.get(r, c) === 'number');
    if (!ch.byRow) {
      const cat = lab ? absRef(sh, { r1: r0, c1: g.c1, r2: g.r2, c2: g.c1 }) : null;
      const xcol = scatter ? (lab ? g.c1 : c0) : null;
      for (let c = scatter && !lab ? c0 + 1 : c0; c <= g.c2; c++) {
        if (sh.hidC.has(c) && !ch.showHidden) continue;
        const cells = []; for (let r = r0; r <= g.r2; r++) cells.push([r, c]); if (!numeric(cells)) continue;
        out.push({ name: hdr ? { ref: absRef(sh, { r1: g.r1, c1: c, r2: g.r1, c2: c }) } : { lit: 'Série ' + (out.length + 1) }, cat, val: absRef(sh, { r1: r0, c1: c, r2: g.r2, c2: c }), xs: scatter ? absRef(sh, { r1: r0, c1: xcol, r2: g.r2, c2: xcol }) : null });
      }
    } else {
      const cat = hdr ? absRef(sh, { r1: g.r1, c1: c0, r2: g.r1, c2: g.c2 }) : null;
      for (let r = r0; r <= g.r2; r++) {
        if (sh.hidR.has(r) && !ch.showHidden) continue;
        const cells = []; for (let c = c0; c <= g.c2; c++) cells.push([r, c]); if (!numeric(cells)) continue;
        out.push({ name: lab ? { ref: absRef(sh, { r1: r, c1: g.c1, r2: r, c2: g.c1 }) } : { lit: 'Série ' + (out.length + 1) }, cat, val: absRef(sh, { r1: r, c1: c0, r2: r, c2: g.c2 }), xs: null });
      }
    }
    out.forEach((s, i) => { const d = D.series[i] || { values: [] }; s.values = d.values; s.cats = D.cats; s.xsv = d.xs; });
    return { series: out, D };
  };

  /* ---------------- écriture ---------------- */
  const txPr = (sz) => '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + (sz || 900) + '"/></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>';
  const titleXml = (t, sz) => t ? '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + (sz || 1400) + '" b="0"/></a:pPr><a:r><a:rPr lang="fr-FR" sz="' + (sz || 1400) + '" b="0"/><a:t>' + esc(t) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>' : '';
  const numCache = (vals) => '<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' + vals.length + '"/>' + vals.map((v, i) => typeof v === 'number' && isFinite(v) ? '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>' : '').join('') + '</c:numCache>';
  const strCache = (vals) => '<c:strCache><c:ptCount val="' + vals.length + '"/>' + vals.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + esc(v) + '</c:v></c:pt>').join('') + '</c:strCache>';
  function serXml(s, i, ch, wb, kind, pie) {
    const col = TB.Chart.color(wb, ch, i);
    const tx = s.name.ref ? '<c:tx><c:strRef><c:f>' + esc(s.name.ref) + '</c:f></c:strRef></c:tx>' : '<c:tx><c:v>' + esc(s.name.lit) + '</c:v></c:tx>';
    const line = kind === 'line' || kind === 'scatterLines';
    const sp = kind === 'scatter' ? '<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>' : line ? '<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="' + hex(col) + '"/></a:solidFill><a:round/></a:ln></c:spPr>' : pie ? '' : '<c:spPr><a:solidFill><a:srgbClr val="' + hex(col) + '"/></a:solidFill></c:spPr>';
    let dpts = '';
    if (pie) dpts = (s.values || []).map((_, k) => '<c:dPt><c:idx val="' + k + '"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="' + hex(TB.Chart.color(wb, ch, k)) + '"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>').join('');
    const marker = line ? (ch.kind === 'lineMarkers' || kind === 'scatterLines' ? '<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>' : '<c:marker><c:symbol val="none"/></c:marker>') : kind === 'scatter' ? '<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="' + hex(col) + '"/></a:solidFill></c:spPr></c:marker>' : '';
    const lbl = ch.labels ? '<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' + txPr(800) + '<c:showLegendKey val="0"/><c:showVal val="' + (pie ? 0 : 1) + '"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="' + (pie ? 1 : 0) + '"/><c:showBubbleSize val="0"/></c:dLbls>' : '';
    const cats = s.cats || [];
    const catXml = s.cat ? '<c:cat><c:strRef><c:f>' + esc(s.cat) + '</c:f>' + strCache(cats) + '</c:strRef></c:cat>' : '';
    const valXml = '<c:val><c:numRef><c:f>' + esc(s.val) + '</c:f>' + numCache(s.values || []) + '</c:numRef></c:val>';
    if (kind === 'scatter' || kind === 'scatterLines') {
      const xv = s.xs ? '<c:xVal><c:numRef><c:f>' + esc(s.xs) + '</c:f>' + numCache(s.xsv || []) + '</c:numRef></c:xVal>' : '';
      return '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/>' + tx + sp + marker + lbl + xv + '<c:yVal><c:numRef><c:f>' + esc(s.val) + '</c:f>' + numCache(s.values || []) + '</c:numRef></c:yVal><c:smooth val="' + (ch.smooth ? 1 : 0) + '"/></c:ser>';
    }
    return '<c:ser><c:idx val="' + i + '"/><c:order val="' + i + '"/>' + tx + sp + (line ? marker : (pie ? '' : '<c:invertIfNegative val="0"/>')) + dpts + lbl + catXml + valXml + (line ? '<c:smooth val="' + (ch.smooth ? 1 : 0) + '"/>' : '') + '</c:ser>';
  }
  function axes(ch, ids, opt) {
    const [a1, a2] = ids; const horiz = opt.horiz;
    const cat = opt.valX ? '<c:valAx><c:axId val="' + a1 + '"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>' + titleXml(ch.xTitle, 1000) + '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' + txPr() + '<c:crossAx val="' + a2 + '"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>'
      : '<c:catAx><c:axId val="' + a1 + '"/><c:scaling><c:orientation val="' + (horiz ? 'maxMin' : 'minMax') + '"/></c:scaling><c:delete val="' + (opt.hideCat ? 1 : 0) + '"/><c:axPos val="' + (horiz ? 'l' : 'b') + '"/>' + (opt.hideCat ? '' : titleXml(ch.xTitle, 1000)) + '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' + txPr() + '<c:crossAx val="' + a2 + '"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>';
    const mm = (opt.secondary ? '' : (ch.yMax != null ? '<c:max val="' + ch.yMax + '"/>' : '') + (ch.yMin != null ? '<c:min val="' + ch.yMin + '"/>' : ''));
    const val = '<c:valAx><c:axId val="' + a2 + '"/><c:scaling><c:orientation val="minMax"/>' + mm + '</c:scaling><c:delete val="0"/><c:axPos val="' + (opt.secondary ? 'r' : horiz ? 'b' : 'l') + '"/>' + (ch.grid !== false && !opt.secondary ? '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' : '') + titleXml(opt.secondary ? ch.y2Title : ch.yTitle, 1000) + '<c:numFmt formatCode="' + esc(ch.nf || (opt.pct ? '0%' : 'General')) + '" sourceLinked="' + (ch.nf || opt.pct ? 0 : 1) + '"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' + txPr() + '<c:crossAx val="' + a1 + '"/><c:crosses val="' + (opt.secondary ? 'max' : 'autoZero') + '"/><c:crossBetween val="' + (opt.valX ? 'midCat' : 'between') + '"/></c:valAx>';
    return cat + val;
  }
  XC.chartXml = function (wb, ch, home) {
    const { series } = XC.refs(wb, ch, home);
    if (!series.length) return null;
    const k = ch.kind || 'bar';
    let groups = '', ax = '';
    const ser = (list, kind, pie, off) => list.map((s, i) => serXml(s, i + (off || 0), ch, wb, kind, pie)).join('');
    const bar = (dir, grouping, list, ids, off) => '<c:barChart><c:barDir val="' + dir + '"/><c:grouping val="' + grouping + '"/><c:varyColors val="0"/>' + ser(list, 'bar', false, off) + '<c:gapWidth val="' + (grouping === 'clustered' ? 150 : 80) + '"/>' + (grouping !== 'clustered' ? '<c:overlap val="100"/>' : '') + '<c:axId val="' + ids[0] + '"/><c:axId val="' + ids[1] + '"/></c:barChart>';
    const line = (grouping, list, ids, off) => '<c:lineChart><c:grouping val="' + grouping + '"/><c:varyColors val="0"/>' + ser(list, 'line', false, off) + '<c:marker val="1"/><c:axId val="' + ids[0] + '"/><c:axId val="' + ids[1] + '"/></c:lineChart>';
    const area = (grouping, list, ids) => '<c:areaChart><c:grouping val="' + grouping + '"/><c:varyColors val="0"/>' + ser(list, 'area') + '<c:axId val="' + ids[0] + '"/><c:axId val="' + ids[1] + '"/></c:areaChart>';
    const P1 = [500100, 500200], P2 = [500300, 500400];
    switch (k) {
      case 'bar': groups = bar('col', 'clustered', series, P1); ax = axes(ch, P1, {}); break;
      case 'stacked': groups = bar('col', 'stacked', series, P1); ax = axes(ch, P1, {}); break;
      case 'stacked100': groups = bar('col', 'percentStacked', series, P1); ax = axes(ch, P1, { pct: true }); break;
      case 'barH': groups = bar('bar', 'clustered', series, P1); ax = axes(ch, P1, { horiz: true }); break;
      case 'stackedH': groups = bar('bar', 'stacked', series, P1); ax = axes(ch, P1, { horiz: true }); break;
      case 'stackedH100': groups = bar('bar', 'percentStacked', series, P1); ax = axes(ch, P1, { horiz: true, pct: true }); break;
      case 'line': case 'lineMarkers': groups = line('standard', series, P1); ax = axes(ch, P1, {}); break;
      case 'stackedLine': groups = line('stacked', series, P1); ax = axes(ch, P1, {}); break;
      case 'area': groups = area('standard', series, P1); ax = axes(ch, P1, {}); break;
      case 'stackedArea': groups = area('stacked', series, P1); ax = axes(ch, P1, {}); break;
      case 'pie': groups = '<c:pieChart><c:varyColors val="1"/>' + ser(series.slice(0, 1), 'pie', true) + '<c:firstSliceAng val="0"/></c:pieChart>'; break;
      case 'doughnut': groups = '<c:doughnutChart><c:varyColors val="1"/>' + ser(series.slice(0, 1), 'pie', true) + '<c:firstSliceAng val="0"/><c:holeSize val="' + Math.round((ch.hole || 0.5) * 100) + '"/></c:doughnutChart>'; break;
      case 'scatter': case 'scatterLines': groups = '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>' + ser(series, k) + '<c:axId val="' + P1[0] + '"/><c:axId val="' + P1[1] + '"/></c:scatterChart>'; ax = axes(ch, P1, { valX: true }); break;
      case 'combo': groups = bar('col', 'clustered', series.slice(0, 1), P1) + line('standard', series.slice(1), P1, 1); ax = axes(ch, P1, {}); break;
      case 'comboAxis': groups = bar('col', 'clustered', series.slice(0, 1), P1) + line('standard', series.slice(1), P2, 1); ax = axes(ch, P1, {}) + axes(ch, P2, { secondary: true, hideCat: true }); break;
      default: groups = bar('col', 'clustered', series, P1); ax = axes(ch, P1, {});
    }
    const leg = ch.legend === 'none' ? '' : '<c:legend><c:legendPos val="' + ({ bottom: 'b', top: 't', right: 'r', left: 'l' })[ch.legend || (/pie|doughnut/.test(k) ? 'right' : 'bottom')] + '"/><c:overlay val="0"/>' + txPr() + '</c:legend>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="' + NS_C + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '"><c:date1904 val="0"/><c:lang val="fr-FR"/><c:roundedCorners val="0"/><c:chart>' + titleXml(ch.title) + '<c:autoTitleDeleted val="' + (ch.title ? 0 : 1) + '"/><c:plotArea><c:layout/>' + groups + ax + '</c:plotArea>' + leg + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>';
  };
  /** ancrage : de / à (colonnes, lignes, décalages en EMU) */
  function anchorXml(sh, o, n, rid) {
    const f = o.from || { r: 0, c: 0, dx: 0, dy: 0 };
    let c = f.c, x = (f.dx || 0) + o.w; while (x > sh.colWidth(c) && c < 16383) { x -= sh.colWidth(c) || 0; c++; if (c - f.c > 500) break; }
    let r = f.r, y = (f.dy || 0) + o.h; while (y > sh.rowHeight(r) && r < 1048575) { y -= sh.rowHeight(r) || 0; r++; if (r - f.r > 5000) break; }
    return '<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>' + f.c + '</xdr:col><xdr:colOff>' + Math.round((f.dx || 0) * EMU) + '</xdr:colOff><xdr:row>' + f.r + '</xdr:row><xdr:rowOff>' + Math.round((f.dy || 0) * EMU) + '</xdr:rowOff></xdr:from><xdr:to><xdr:col>' + c + '</xdr:col><xdr:colOff>' + Math.round(x * EMU) + '</xdr:colOff><xdr:row>' + r + '</xdr:row><xdr:rowOff>' + Math.round(y * EMU) + '</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (1000 + n) + '" name="Graphique ' + n + '"' + (o.alt ? ' descr="' + esc(o.alt) + '"' : '') + '/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="' + NS_C + '"><c:chart xmlns:c="' + NS_C + '" xmlns:r="' + NS_R + '" r:id="' + rid + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
  }
  const resolve = (base, t) => { if (t[0] === '/') return t.slice(1); const o = []; (base + t).split('/').forEach((s) => { if (s === '..') o.pop(); else if (s && s !== '.') o.push(s); }); return o.join('/'); };
  /** ajoute les graphiques des feuilles au paquet .xlsx (zip JSZip déjà écrit par ExcelJS) ; renvoie le nombre de graphiques */
  XC.write = async function (z, wb) {
    let ct = await z.file('[Content_Types].xml').async('string');
    let nChart = 0, nDraw = Object.keys(z.files).filter((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n)).length;
    const skipped = [];
    for (let si = 0; si < wb.sheets.length; si++) {
      const sh = wb.sheets[si]; const charts = sh.objs.filter((o) => o.type === 'chart'); if (!charts.length) continue;
      const sp = 'xl/worksheets/sheet' + (si + 1) + '.xml'; if (!z.file(sp)) continue;
      const rp = 'xl/worksheets/_rels/sheet' + (si + 1) + '.xml.rels';
      let rels = z.file(rp) ? await z.file(rp).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      // dessin existant (images d'ExcelJS) ou nouveau
      const dm = /<Relationship\b[^>]*Type="[^"]*\/drawing"[^>]*>/.exec(rels); let dPath, dXml, dRels, newDrawing = false;
      if (dm) { dPath = resolve('xl/worksheets/', /Target="([^"]+)"/.exec(dm[0])[1]); dXml = await z.file(dPath).async('string'); }
      else { newDrawing = true; nDraw++; dPath = 'xl/drawings/drawing' + nDraw + '.xml'; while (z.file(dPath)) { nDraw++; dPath = 'xl/drawings/drawing' + nDraw + '.xml'; } dXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="' + NS_A + '"></xdr:wsDr>'; }
      const drp = dPath.replace(/([^/]+)$/, '_rels/$1.rels');
      dRels = z.file(drp) ? await z.file(drp).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      let anchors = '';
      for (const o of charts) {
        let xml = null; try { xml = XC.chartXml(wb, o.chart, sh); } catch (e) { console.warn('graphique', e); }
        if (!xml) { skipped.push(o); continue; }
        nChart++; let cp = 'xl/charts/chart' + nChart + '.xml'; while (z.file(cp)) { nChart++; cp = 'xl/charts/chart' + nChart + '.xml'; }
        z.file(cp, xml);
        ct = ct.replace('</Types>', () => '<Override PartName="/' + cp + '" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>');
        const rid = 'rIdCh' + nChart;
        dRels = dRels.replace('</Relationships>', () => '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + nChart + '.xml"/></Relationships>');
        anchors += anchorXml(sh, o, nChart, rid);
      }
      if (!anchors) continue;
      dXml = dXml.replace('</xdr:wsDr>', () => anchors + '</xdr:wsDr>');
      z.file(dPath, dXml); z.file(drp, dRels);
      if (newDrawing) {
        ct = ct.replace('</Types>', () => '<Override PartName="/' + dPath + '" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
        rels = rels.replace('</Relationships>', () => '<Relationship Id="rIdDrw1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/' + dPath.split('/').pop() + '"/></Relationships>');
        z.file(rp, rels);
        let sx = await z.file(sp).async('string');
        if (!/xmlns:r=/.test(sx.slice(0, 600))) sx = sx.replace('<worksheet ', () => '<worksheet xmlns:r="' + NS_R + '" ');
        const tag = '<drawing r:id="rIdDrw1"/>';
        const m = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(sx);
        sx = m ? sx.slice(0, m.index) + tag + sx.slice(m.index) : sx.replace('</worksheet>', () => tag + '</worksheet>');
        z.file(sp, sx);
      }
    }
    z.file('[Content_Types].xml', ct);
    return { n: nChart, skipped: skipped.length };
  };

  /* ---------------- lecture ---------------- */
  const KIND_IN = (grp, el, q) => {
    const g = (n) => { const x = q(el, n)[0]; return x ? x.getAttribute('val') : null; };
    switch (grp) {
      case 'barChart': { const dir = g('barDir'), gr = g('grouping'); return dir === 'bar' ? (gr === 'stacked' ? 'stackedH' : gr === 'percentStacked' ? 'stackedH100' : 'barH') : (gr === 'stacked' ? 'stacked' : gr === 'percentStacked' ? 'stacked100' : 'bar'); }
      case 'bar3DChart': return g('barDir') === 'bar' ? 'barH' : 'bar';
      case 'lineChart': case 'line3DChart': return g('grouping') === 'stacked' || g('grouping') === 'percentStacked' ? 'stackedLine' : 'line';
      case 'areaChart': case 'area3DChart': return g('grouping') === 'stacked' || g('grouping') === 'percentStacked' ? 'stackedArea' : 'area';
      case 'pieChart': case 'pie3DChart': case 'ofPieChart': return 'pie';
      case 'doughnutChart': return 'doughnut';
      case 'scatterChart': case 'bubbleChart': return 'scatter';
      case 'radarChart': return 'line';
    }
    return null;
  };
  XC.read = async function (z, wb) {
    const warn = [];
    const dp = new DOMParser();
    const parse = async (p) => z.file(p) ? dp.parseFromString(await z.file(p).async('string'), 'application/xml') : null;
    const relMap = async (p) => { const d = await parse(p.replace(/([^/]+)$/, '_rels/$1.rels')); const m = {}; if (d) Array.from(d.getElementsByTagName('Relationship')).forEach((r) => { m[r.getAttribute('Id')] = { t: r.getAttribute('Target'), type: r.getAttribute('Type') }; }); return m; };
    const wbx = await parse('xl/workbook.xml'); if (!wbx) return warn;
    const wrels = await relMap('xl/workbook.xml');
    const sheetsX = Array.from(wbx.getElementsByTagName('sheet'));
    const local = (el, n) => Array.from(el.getElementsByTagName('*')).filter((x) => x.localName === n);
    const kids = (el, n) => Array.from(el.children).filter((x) => x.localName === n);
    const one = (el, n) => kids(el, n)[0] || null;
    for (let si = 0; si < sheetsX.length; si++) {
      const sh = wb.sheets[si]; if (!sh) continue;
      const rid = sheetsX[si].getAttributeNS(NS_R, 'id') || sheetsX[si].getAttribute('r:id'); const rel = wrels[rid]; if (!rel) continue;
      const sp = resolve('xl/', rel.t); const srels = await relMap(sp);
      for (const id of Object.keys(srels)) {
        if (!/\/drawing$/.test(srels[id].type)) continue;
        const dPath = resolve(sp.replace(/[^/]+$/, ''), srels[id].t); const dd = await parse(dPath); if (!dd) continue;
        const drels = await relMap(dPath);
        const anchors = Array.from(dd.documentElement.children).filter((x) => /Anchor$/.test(x.localName));
        for (const an of anchors) {
          const chartEl = local(an, 'chart')[0]; if (!chartEl) continue;
          const crid = chartEl.getAttributeNS(NS_R, 'id') || chartEl.getAttribute('r:id'); const cr = drels[crid]; if (!cr) continue;
          const cPath = resolve(dPath.replace(/[^/]+$/, ''), cr.t); const cd = await parse(cPath); if (!cd) continue;
          try {
            const ch = chartFromXml(cd, local, kids, one); if (!ch) { warn.push('Graphique d\'un type non pris en charge (non repris)'); continue; }
            // position et taille
            const pos = (el) => { if (!el) return null; const v = (n) => +((one(el, n) || {}).textContent || 0); return { c: v('col'), dx: Math.round(v('colOff') / EMU), r: v('row'), dy: Math.round(v('rowOff') / EMU) }; };
            const from = pos(one(an, 'from')) || { r: 0, c: 0, dx: 0, dy: 0 }; const to = pos(one(an, 'to')); const ext = one(an, 'ext');
            let w = 480, h = 288;
            if (to) { w = -from.dx; for (let c = from.c; c < to.c; c++) w += sh.colWidth(c); w += to.dx; h = -from.dy; for (let r = from.r; r < to.r; r++) h += sh.rowHeight(r); h += to.dy; }
            else if (ext) { w = Math.round(+ext.getAttribute('cx') / EMU); h = Math.round(+ext.getAttribute('cy') / EMU); }
            sh.objs.push({ id: TB.uid('o'), type: 'chart', from, w: Math.max(80, w), h: Math.max(60, h), chart: ch });
          } catch (e) { warn.push('Graphique non repris : ' + e.message); }
        }
      }
    }
    return warn;
  };
  function chartFromXml(cd, local, kids, one) {
    const plot = local(cd.documentElement, 'plotArea')[0]; if (!plot) return null;
    const groups = Array.from(plot.children).filter((x) => /Chart$/.test(x.localName));
    if (!groups.length) return null;
    const q = (el, n) => kids(el, n);
    const kinds = groups.map((g) => KIND_IN(g.localName, g, q)).filter(Boolean); if (!kinds.length) return null;
    let kind = kinds[0];
    if (groups.length > 1 && /^bar/.test(kind) && kinds.includes('line')) { const ax = groups.map((g) => kids(g, 'axId').map((x) => x.getAttribute('val')).join(',')); kind = ax[0] !== ax[1] ? 'comboAxis' : 'combo'; }
    if (kind === 'line' && kids(groups[0], 'ser').some((x) => { const m = kids(x, 'marker')[0]; const sy = m && kids(m, 'symbol')[0]; return m && (!sy || sy.getAttribute('val') !== 'none'); })) kind = 'lineMarkers';
    if (kind === 'scatter' && kids(groups[0], 'ser').some((x) => { const sp = kids(x, 'spPr')[0]; const ln = sp && kids(sp, 'ln')[0]; return !(ln && kids(ln, 'noFill').length); })) kind = 'scatterLines';
    const ref = (el) => { if (!el) return null; const f = local(el, 'f')[0]; if (!f) return null; try { return P.write(P.parse(f.textContent.replace(/^\(|\)$/g, ''), P.CANON), P.CANON); } catch (e) { return null; } };
    const series = [];
    groups.forEach((g) => kids(g, 'ser').forEach((s) => {
      const tx = one(s, 'tx'); let name = 'Série ' + (series.length + 1);
      if (tx) { const r = ref(tx); if (r) name = r; else { const v = local(tx, 'v')[0]; if (v) name = v.textContent; } }
      const val = ref(one(s, 'val') || one(s, 'yVal')); const cats = ref(one(s, 'cat') || one(s, 'xVal'));
      if (val) series.push({ name, values: val, cats: cats || '' });
    }));
    if (!series.length) return null;
    const title = (() => { const t = kids(local(cd.documentElement, 'chart')[0] || cd.documentElement, 'title')[0]; if (!t) return ''; return local(t, 't').map((x) => x.textContent).join('') || (ref(t) ? '' : ''); })();
    const legend = (() => { const l = local(cd.documentElement, 'legend')[0]; if (!l) return 'none'; const p = local(l, 'legendPos')[0]; return ({ b: 'bottom', t: 'top', r: 'right', l: 'left', tr: 'right' })[p ? p.getAttribute('val') : 'r'] || 'right'; })();
    const ch = { kind, explicit: true, series, title, legend };
    const lbl = local(plot, 'dLbls').some((d) => { const v = kids(d, 'showVal')[0], p = kids(d, 'showPercent')[0]; return (v && v.getAttribute('val') === '1') || (p && p.getAttribute('val') === '1'); }); if (lbl) ch.labels = true;
    const valAx = kids(plot, 'valAx')[0]; if (valAx) { const sc = kids(valAx, 'scaling')[0]; if (sc) { const mx = kids(sc, 'max')[0], mn = kids(sc, 'min')[0]; if (mx) ch.yMax = +mx.getAttribute('val'); if (mn) ch.yMin = +mn.getAttribute('val'); } const t = kids(valAx, 'title')[0]; if (t) ch.yTitle = local(t, 't').map((x) => x.textContent).join(''); if (!kids(valAx, 'majorGridlines').length) ch.grid = false; }
    const catAx = kids(plot, 'catAx')[0]; if (catAx) { const t = kids(catAx, 'title')[0]; if (t) ch.xTitle = local(t, 't').map((x) => x.textContent).join(''); }
    // couleurs des séries (ou des points d'un secteur)
    const cols = [];
    groups.forEach((g) => kids(g, 'ser').forEach((s) => { const sp = kids(s, 'spPr')[0]; const c = sp && local(sp, 'srgbClr')[0]; cols.push(c ? '#' + c.getAttribute('val').toUpperCase() : null); }));
    if (/pie|doughnut/.test(kind)) { const s0 = kids(groups[0], 'ser')[0]; const pts = s0 ? kids(s0, 'dPt') : []; const pc = pts.map((d) => { const c = local(d, 'srgbClr')[0]; return c ? '#' + c.getAttribute('val').toUpperCase() : null; }); if (pc.some(Boolean)) ch.colors = pc; const hs = local(groups[0], 'holeSize')[0]; if (hs) ch.hole = +hs.getAttribute('val') / 100; }
    else if (cols.some(Boolean)) ch.colors = cols;
    if (local(plot, 'smooth').some((x) => x.getAttribute('val') === '1')) ch.smooth = true;
    return ch;
  }
})();
