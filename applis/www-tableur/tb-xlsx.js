/* Tableur — .xlsx avec ExcelJS (MIT, pc/shared/vendor/exceljs.min.js, chargé à la demande).
   Lecture : valeurs, formules (y compris _xlfn.), formats de nombre, polices, remplissages, bordures, alignements,
   fusions, largeurs / hauteurs, lignes et colonnes masquées, plan, volets figés, quadrillage, zoom, couleur d'onglet,
   feuilles masquées, filtres automatiques (plage), mises en forme conditionnelles, validations, notes, liens,
   noms définis, tableaux, images, mise en page (zone d'impression, titres, orientation, ajustement, marges, en-têtes).
   Écriture : la même chose ; les tableaux et les noms sont ajoutés au paquet après ExcelJS (XML Office standard).
   Les graphiques ne sont pas écrits dans le .xlsx (ils restent dans le .magcalc) : un avertissement le signale. */
(function () {
  'use strict';
  const TB = window.Tableur, O = window.Office, P = TB.Formula;
  const X = TB.Xlsx = {};
  const lib = async () => { if (!window.ExcelJS) await O.loadScript(O.vendor + 'exceljs.min.js'); return window.ExcelJS; };
  X.lib = lib;

  /* ---------------- couleurs ---------------- */
  const hex6 = (argb) => '#' + String(argb).slice(-6).toUpperCase();
  function rgb2hls(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, l, s]; }
  function hls2rgb(h, l, s) { if (!s) return [l, l, l].map((x) => Math.round(x * 255)); const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255)); }
  function tint(hex, t) { if (!t) return hex; const n = parseInt(hex.slice(1), 16); const [h, l, s] = rgb2hls(n >> 16 & 255, n >> 8 & 255, n & 255); const L = t < 0 ? l * (1 + t) : l * (1 - t) + t; return '#' + hls2rgb(h, Math.max(0, Math.min(1, L)), s).map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(); }
  /** palette de thème du fichier dans l'ordre des index Office (0 lt1, 1 dk1, 2 lt2, 3 dk2, 4…9 accents, 10 lien, 11 lien visité) */
  let THEME = null;
  function colorIn(c) {
    if (!c) return null;
    if (c.argb) return tint(hex6(c.argb), c.tint);
    if (c.theme != null) { const t = THEME || themeIdx(TB.THEMES.classique.c); const base = t[c.theme]; return base ? tint(base, c.tint) : null; }
    if (c.indexed != null) { if (c.indexed === 64) return null; const v = TB.INDEXED && TB.INDEXED[c.indexed]; return v ? tint(v.length === 7 ? v.toUpperCase() : '#' + String(v).slice(-6).toUpperCase(), c.tint) : null; }
    return null;
  }
  const themeIdx = (c) => [c[1], c[0], c[3], c[2], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11]];
  const argb = (hex) => ({ argb: 'FF' + String(hex || '#000000').replace('#', '').toUpperCase().slice(0, 6) });
  function readTheme(xml) {
    if (!xml) return null;
    const m = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(xml); if (!m) return null;
    const get = (tag) => { const r = new RegExp('<a:' + tag + '>[\\s\\S]*?(?:val="([0-9A-Fa-f]{6})"[\\s\\S]*?lastClr="([0-9A-Fa-f]{6})"|lastClr="([0-9A-Fa-f]{6})"|val="([0-9A-Fa-f]{6})")[\\s\\S]*?</a:' + tag + '>').exec(m[0]); if (!r) return null; return '#' + (r[2] || r[3] || r[4] || r[1]).toUpperCase(); };
    const order = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    const c = order.map(get); if (c.some((x) => !x)) return null; return c;
  }

  /* ---------------- styles ---------------- */
  const BORDER_IN = { thin: 'thin', medium: 'medium', thick: 'thick', dashed: 'dashed', dotted: 'dotted', double: 'double', hair: 'hair', mediumDashed: 'mediumDashed', dashDot: 'dashDot', mediumDashDot: 'mediumDashDot', dashDotDot: 'dashDotDot', mediumDashDotDot: 'mediumDashDotDot', slantDashDot: 'slantDashDot' };
  const NF_IN = { 'mm-dd-yy': 'dd/mm/yyyy', 'm/d/yy': 'dd/mm/yyyy', 'd-mmm-yy': 'dd-mmm-yy', 'm/d/yy h:mm': 'dd/mm/yyyy hh:mm', 'm/d/yy "h":mm': 'dd/mm/yyyy hh:mm' };
  function styleIn(s) {
    const o = {}; if (!s) return o;
    const f = s.font;
    if (f) { if (f.name) o.fn = f.name; if (f.size) o.fs = f.size; if (f.bold) o.b = true; if (f.italic) o.i = true; if (f.underline) o.u = f.underline === 'double' || f.underline === 'doubleAccounting' ? 'double' : 'single'; if (f.strike) o.st = true; const fc = colorIn(f.color); if (fc && fc !== '#000000') o.fc = fc; if (f.vertAlign === 'superscript') o.sup = true; else if (f.vertAlign === 'subscript') o.sub = true; }
    const fl = s.fill;
    if (fl) { if (fl.type === 'pattern' && fl.pattern && fl.pattern !== 'none') { const bg = colorIn(fl.fgColor) || (fl.pattern === 'solid' ? colorIn(fl.bgColor) : null); if (bg) { o.bg = bg; if (fl.pattern !== 'solid') o.pat = fl.pattern; } } else if (fl.type === 'gradient' && fl.stops && fl.stops.length) { const bg = colorIn(fl.stops[0].color); if (bg) o.bg = bg; } }
    const b = s.border;
    if (b) {
      const side = (x) => x && x.style && BORDER_IN[x.style] ? { s: BORDER_IN[x.style], c: colorIn(x.color) || '#000000' } : null;
      const t = side(b.top), bb = side(b.bottom), l = side(b.left), r = side(b.right);
      if (t) o.bt = t; if (bb) o.bb = bb; if (l) o.bl = l; if (r) o.br = r;
      if (b.diagonal && (b.diagonal.up || b.diagonal.down)) { const d = side(b.diagonal); if (d) { if (b.diagonal.down) o.bu = d; if (b.diagonal.up) o.bd = d; } }
    }
    const a = s.alignment;
    if (a) { if (a.horizontal && a.horizontal !== 'general') o.ha = a.horizontal; if (a.vertical) o.va = a.vertical === 'middle' ? 'center' : a.vertical === 'distributed' ? 'center' : a.vertical; if (a.wrapText) o.wr = true; if (a.textRotation) o.rot = a.textRotation === 'vertical' ? 255 : a.textRotation > 90 && a.textRotation <= 180 ? 90 - a.textRotation : a.textRotation; if (a.indent) o.ind = a.indent; if (a.shrinkToFit) o.shr = true; }
    if (s.numFmt && s.numFmt !== 'General') o.nf = NF_IN[s.numFmt] || s.numFmt;
    if (s.protection) { if (s.protection.locked === false) o.lk = false; if (s.protection.hidden) o.hd = true; }
    if (o.va === 'bottom') delete o.va;
    return o;
  }
  function styleOut(st) {
    const o = {};
    const font = { name: st.fn || TB.DEFAULT_FONT, size: st.fs || TB.DEFAULT_SIZE };
    if (st.b) font.bold = true; if (st.i) font.italic = true; if (st.u) font.underline = st.u === 'double' ? 'double' : true; if (st.st) font.strike = true; if (st.fc) font.color = argb(st.fc); if (st.sup) font.vertAlign = 'superscript'; else if (st.sub) font.vertAlign = 'subscript';
    o.font = font;
    if (st.bg) o.fill = { type: 'pattern', pattern: st.pat || 'solid', fgColor: argb(st.bg), bgColor: argb(st.bg) };
    const side = (x) => x ? { style: x.s || 'thin', color: argb(x.c || '#000000') } : undefined;
    if (st.bt || st.bb || st.bl || st.br || st.bd || st.bu) { o.border = {}; if (st.bt) o.border.top = side(st.bt); if (st.bb) o.border.bottom = side(st.bb); if (st.bl) o.border.left = side(st.bl); if (st.br) o.border.right = side(st.br); if (st.bd || st.bu) o.border.diagonal = Object.assign(side(st.bd || st.bu), { up: !!st.bd, down: !!st.bu }); }
    if (st.ha || st.va || st.wr || st.rot || st.ind || st.shr) { o.alignment = {}; if (st.ha) o.alignment.horizontal = st.ha; if (st.va) o.alignment.vertical = st.va === 'center' ? 'middle' : st.va; if (st.wr) o.alignment.wrapText = true; if (st.rot) o.alignment.textRotation = st.rot === 255 ? 'vertical' : st.rot < 0 ? 90 - st.rot : st.rot; if (st.ind) o.alignment.indent = st.ind; if (st.shr) o.alignment.shrinkToFit = true; }
    if (st.nf) o.numFmt = st.nf;
    if (st.lk === false || st.hd) o.protection = { locked: st.lk !== false, hidden: !!st.hd };
    return o;
  }
  /** style de mise en forme conditionnelle (dxf) */
  function dxfIn(s) {
    const o = {}; if (!s) return o;
    const f = s.font; if (f) { if (f.bold) o.b = true; if (f.italic) o.i = true; if (f.underline) o.u = 'single'; if (f.strike) o.st = true; const c = colorIn(f.color); if (c) o.fc = c; }
    const fl = s.fill; if (fl && fl.type === 'pattern') { const c = colorIn(fl.bgColor) || colorIn(fl.fgColor); if (c) o.bg = c; }
    if (s.numFmt) o.nf = typeof s.numFmt === 'string' ? s.numFmt : s.numFmt.formatCode;
    const b = s.border; if (b) { const side = (x) => x && x.style ? { s: x.style, c: colorIn(x.color) || '#000000' } : null; ['top', 'bottom', 'left', 'right'].forEach((k, i) => { const v = side(b[k]); if (v) o[['bt', 'bb', 'bl', 'br'][i]] = v; }); }
    return o;
  }
  function dxfOut(f) {
    const o = {}; f = f || {};
    if (f.b || f.i || f.u || f.st || f.fc) { o.font = {}; if (f.b) o.font.bold = true; if (f.i) o.font.italic = true; if (f.u) o.font.underline = true; if (f.st) o.font.strike = true; if (f.fc) o.font.color = argb(f.fc); }
    if (f.bg) o.fill = { type: 'pattern', pattern: 'solid', fgColor: argb(f.bg), bgColor: argb(f.bg) };
    if (f.nf) o.numFmt = f.nf;
    const side = (x) => x ? { style: x.s || 'thin', color: argb(x.c) } : undefined;
    if (f.bt || f.bb || f.bl || f.br) o.border = { top: side(f.bt), bottom: side(f.bb), left: side(f.bl), right: side(f.br) };
    return o;
  }

  /* ---------------- outils ---------------- */
  const pxOfWidth = (w) => Math.round(w * 7);
  const widthOfPx = (px) => Math.round(px / 7 * 256) / 256;
  const pxOfPt = (pt) => Math.round(pt / 0.75);
  const dateToSerial = (d) => { let s = d.getTime() / 86400000 + 25569; if (s < 61) s -= 1; return Math.round(s * 86400000) / 86400000; };
  const canon = (f) => { try { return P.write(P.parse(String(f).replace(/^=/, ''), P.CANON), P.CANON); } catch (e) { return null; } };
  const fileF = (f, sh, r, c) => P.toFile(String(f).replace(/^=/, ''), sh, r, c);
  function errIn(e) { const t = String(e && e.error || e); return TB.errOf ? TB.errOf(t) || TB.E.VALUE : TB.E.VALUE; }
  function scalarIn(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return v;
    if (v instanceof Date) return dateToSerial(v);
    if (v.error) return errIn(v);
    if (v.richText) return v.richText.map((x) => x.text).join('');
    if (v.text !== undefined) return typeof v.text === 'object' && v.text.richText ? v.text.richText.map((x) => x.text).join('') : v.text;
    return null;
  }
  /** listes de cellules → rectangles (validations lues cellule par cellule) */
  function compress(cells) {
    const byC = new Map(); cells.forEach(([r, c]) => { if (!byC.has(c)) byC.set(c, []); byC.get(c).push(r); });
    const runs = [];
    [...byC.keys()].sort((a, b) => a - b).forEach((c) => { const rs = byC.get(c).sort((a, b) => a - b); let s = rs[0], p = rs[0]; for (let i = 1; i <= rs.length; i++) { if (i < rs.length && rs[i] === p + 1) { p = rs[i]; continue; } runs.push({ r1: s, r2: p, c1: c, c2: c }); if (i < rs.length) { s = p = rs[i]; } } });
    const out = [];
    runs.forEach((g) => { const last = out.find((x) => x.r1 === g.r1 && x.r2 === g.r2 && x.c2 === g.c1 - 1); if (last) last.c2 = g.c2; else out.push(Object.assign({}, g)); });
    return out;
  }
  const refList = (ranges) => ranges.map((g) => TB.rangeStr(g)).join(' ');
  const parseRefList = (s) => String(s || '').trim().split(/\s+/).map((x) => TB.parseRange(x.replace(/\$/g, ''))).filter(Boolean);

  /* ---------------- normalisation du paquet (fichiers d'autres logiciels) ----------------
     ExcelJS attend des cibles relatives et des noms de parties « à la Excel » (xl/commentsN.xml, vmlDrawingN.vml). */
  async function normalize(z) {
    const ren = {}; let nv = 0;
    Object.keys(z.files).forEach((n) => {
      let m;
      if ((m = /^xl\/comments\/comments?(\d+)\.xml$/i.exec(n))) ren[n] = 'xl/comments' + (500 + (+m[1])) + '.xml';
      else if (/^xl\/drawings\/[^/]+\.vml$/i.test(n) && !/^xl\/drawings\/vmlDrawing\d+\.vml$/i.test(n)) ren[n] = 'xl/drawings/vmlDrawing' + (900 + (++nv)) + '.vml';
    });
    for (const [a, b] of Object.entries(ren)) { const d = await z.file(a).async('uint8array'); z.remove(a); z.file(b, d); }
    // règles de mise en forme qui pointent vers un style différentiel absent (fichiers de LibreOffice) : styles vides ajoutés
    try {
      let maxDxf = -1;
      for (const n of Object.keys(z.files)) if (/^xl\/worksheets\/[^/]+\.xml$/i.test(n)) { const x = await z.file(n).async('string'); x.replace(/dxfId="(\d+)"/g, (m0, d) => { maxDxf = Math.max(maxDxf, +d); return m0; }); }
      const sf = z.file('xl/styles.xml');
      if (maxDxf >= 0 && sf) {
        let st = await sf.async('string'); const m = /<dxfs[^>]*?(?:\/>|>([\s\S]*?)<\/dxfs>)/.exec(st); const have = m ? (m[1] || '').split('<dxf>').length - 1 + (m[1] || '').split('<dxf/>').length - 1 : 0;
        if (have <= maxDxf) {
          const add = '<dxf/>'.repeat(maxDxf + 1 - have);
          if (m) st = st.replace(m[0], () => '<dxfs count="' + (maxDxf + 1) + '">' + (m[1] || '') + add + '</dxfs>');
          else st = st.replace(/(<tableStyles\b|<colors\b|<extLst>|<\/styleSheet>)/, (x) => '<dxfs count="' + (maxDxf + 1) + '">' + add + '</dxfs>' + x);
          z.file('xl/styles.xml', st);
        }
      }
    } catch (e) { /* fichier laissé tel quel */ }
    const resolve = (base, t) => { const o = []; (base + t).split('/').forEach((s) => { if (s === '..') o.pop(); else if (s && s !== '.') o.push(s); }); return o.join('/'); };
    const rel = (base, abs) => { if (!base) return abs; const b = base.replace(/\/$/, '').split('/'), a = abs.split('/'); let i = 0; while (i < b.length && i < a.length - 1 && b[i] === a[i]) i++; return '../'.repeat(b.length - i) + a.slice(i).join('/'); };
    for (const n of Object.keys(z.files)) {
      if (!/\.rels$/i.test(n)) continue;
      const x = await z.file(n).async('string'); const base = n.replace(/_rels\/[^/]+\.rels$/, '');
      const y = x.replace(/Target="([^"]+)"/g, (all, t) => {
        if (/^[a-z]+:/i.test(t) || /TargetMode="External"/.test(all)) return all;
        let abs = t[0] === '/' ? t.slice(1) : resolve(base, t); const renamed = ren[abs]; if (renamed) abs = renamed;
        if (t[0] !== '/' && !renamed) return all;
        return 'Target="' + (n === '_rels/.rels' ? abs : rel(base, abs)) + '"';
      });
      if (y !== x) z.file(n, y);
    }
    return ren;
  }
  /** notes lues directement (ExcelJS perd le texte des notes sans mise en forme) */
  async function readComments(z) {
    const out = {}; // index de feuille → [[addr, texte, auteur]]
    const wbx = await (z.file('xl/workbook.xml') ? z.file('xl/workbook.xml').async('string') : '');
    const wrels = z.file('xl/_rels/workbook.xml.rels') ? await z.file('xl/_rels/workbook.xml.rels').async('string') : '';
    const relT = {}; wrels.replace(/<Relationship\b[^>]*>/g, (t) => { const id = /Id="([^"]+)"/.exec(t), tg = /Target="([^"]+)"/.exec(t); if (id && tg) relT[id[1]] = tg[1]; });
    const sheets = []; wbx.replace(/<sheet\b[^>]*>/g, (t) => { const id = /r:id="([^"]+)"/.exec(t) || /\bid="([^"]+)"/.exec(t); sheets.push(id ? relT[id[1]] : null); });
    const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
    for (let i = 0; i < sheets.length; i++) {
      let p = sheets[i]; if (!p) continue; p = p[0] === '/' ? p.slice(1) : 'xl/' + p.replace(/^\.\//, '');
      const rp = p.replace(/([^/]+)$/, '_rels/$1.rels'); if (!z.file(rp)) continue;
      const rels = await z.file(rp).async('string');
      const m = /<Relationship\b[^>]*relationships\/comments"[^>]*>|<Relationship\b[^>]*Target="([^"]+)"[^>]*relationships\/comments"/.exec(rels) ; if (!m) continue;
      const tg = /Target="([^"]+)"/.exec(m[0]); if (!tg) continue;
      let cp = tg[1]; cp = cp[0] === '/' ? cp.slice(1) : (() => { const o = []; (p.replace(/[^/]+$/, '') + cp).split('/').forEach((s) => { if (s === '..') o.pop(); else if (s && s !== '.') o.push(s); }); return o.join('/'); })();
      if (!z.file(cp)) continue;
      const xml = await z.file(cp).async('string');
      const authors = []; xml.replace(/<author>([\s\S]*?)<\/author>/g, (_, a) => { authors.push(dec(a)); });
      const L = [];
      xml.replace(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g, (_, at, body) => { const ref = /ref="([^"]+)"/.exec(at), au = /authorId="(\d+)"/.exec(at); let t = ''; body.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (__, x) => { t += dec(x); }); if (ref) L.push([ref[1], t, au ? authors[+au[1]] || '' : '']); });
      out[i] = L;
    }
    return out;
  }
  async function readNames(z) {
    const xml = z.file('xl/workbook.xml') ? await z.file('xl/workbook.xml').async('string') : ''; const L = [];
    const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    xml.replace(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g, (_, at, body) => { const n = /name="([^"]+)"/.exec(at), ls = /localSheetId="(\d+)"/.exec(at), hid = /hidden="(1|true)"/.exec(at); if (n) L.push({ n: dec(n[1]), f: dec(body), local: ls ? +ls[1] : null, hidden: !!hid }); });
    return L;
  }

  /* =====================================================================
     Lecture
     ===================================================================== */
  X.read = async function (input, opt) {
    opt = opt || {};
    const E = await lib();
    const z = input instanceof JSZip ? input : await JSZip.loadAsync(input);
    await normalize(z);
    const comments = await readComments(z).catch(() => ({}));
    const rawNames = await readNames(z).catch(() => []);
    const buf = await z.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
    const book = new E.Workbook();
    await book.xlsx.load(buf);
    const warnings = [];
    const wb = new TB.Workbook();
    const tc = readTheme(book._themes && (book._themes.theme1 || Object.values(book._themes)[0]));
    THEME = tc ? themeIdx(tc) : null;
    if (tc && tc.join() !== TB.THEMES.classique.c.join()) wb.themeColors = tc;
    const sCache = new Map();
    const sid = (style) => { if (!style || !Object.keys(style).length) return undefined; const k = JSON.stringify(style); let id = sCache.get(k); if (id === undefined) { id = wb.styles.add(styleIn(style)); sCache.set(k, id); } return id || undefined; };
    const media = {};
    let nCells = 0;
    book.worksheets.forEach((ws, si) => {
      const sh = wb.addSheetRaw(String(ws.name || ('Feuil' + (si + 1))).slice(0, 31));
      if (ws.state === 'hidden') sh.hidden = 1; else if (ws.state === 'veryHidden') sh.hidden = 2;
      const pr = ws.properties || {};
      if (pr.tabColor) sh.tab = colorIn(pr.tabColor);
      if (pr.defaultRowHeight && Math.abs(pr.defaultRowHeight - 15) > 0.01) sh.defH = pxOfPt(pr.defaultRowHeight);
      if (pr.defaultColWidth) sh.defW = pxOfWidth(pr.defaultColWidth);
      const v0 = (ws.views || [])[0] || {};
      if (v0.state === 'frozen') sh.freeze = { r: v0.ySplit || 0, c: v0.xSplit || 0 };
      if (v0.showGridLines === false) sh.grid = false;
      if (v0.showRowColHeaders === false) sh.heads = false;
      if (v0.zoomScale && v0.zoomScale !== 100) sh.zoom = v0.zoomScale / 100;
      if (v0.activeCell) { const a = TB.parseAddr(v0.activeCell); if (a) sh.sel = { r: a.r, c: a.c }; }
      // colonnes
      (ws.columns || []).forEach((col, i) => {
        if (!col) return;
        if (col.width != null && (!pr.defaultColWidth || Math.abs(col.width - pr.defaultColWidth) > 0.01)) sh.colW[i] = pxOfWidth(col.width);
        if (col.hidden) sh.hidC.add(i);
        if (col.outlineLevel) sh.outC[i] = col.outlineLevel;
        const st = col.style && Object.keys(col.style).length ? sid(col.style) : undefined; if (st) sh.colSt[i] = st;
      });
      // cellules
      const arrays = [];
      const inArr = (r, c) => arrays.some((g) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2 && !(r === g.r1 && c === g.c1));
      ws.eachRow({ includeEmpty: true }, (row, rn) => {
        const r = rn - 1;
        if (row.height != null && Math.abs(row.height - (pr.defaultRowHeight || 15)) > 0.01 && row.customHeight !== false) sh.rowH[r] = pxOfPt(row.height);
        if (row.hidden) sh.hidR.add(r);
        if (row.outlineLevel) sh.outR[r] = row.outlineLevel;
        row.eachCell({ includeEmpty: true }, (cell, cn) => {
          const c = cn - 1; const s = sid(cell.style);
          const T = cell.type;
          if (T === 1) { if (s !== undefined) wb.load(sh, r, c, null, s); return; } // fusion (cellule masquée)
          nCells++;
          let v = cell.value;
          if (T === 6 || (v && typeof v === 'object' && (v.formula || v.sharedFormula))) {
            const fv = v || {}; const src = cell.formula || fv.formula;
            const res = scalarIn(fv.result);
            if (fv.shareType === 'array' && fv.ref) { const g = TB.parseRange(String(fv.ref).replace(/\$/g, '')); if (g) arrays.push(g); }
            const cf = src ? canon(src) : null;
            if (cf != null) {
              const g = fv.shareType === 'array' && fv.ref ? TB.parseRange(String(fv.ref).replace(/\$/g, '')) : null;
              wb.loadFormula(sh, r, c, cf, s, g && (g.r1 !== g.r2 || g.c1 !== g.c2) ? g : undefined);
              if (res !== null) TB._setVal(sh, r, c, res);
            } else wb.load(sh, r, c, res, s);
            return;
          }
          if (inArr(r, c)) { if (s !== undefined) wb.load(sh, r, c, null, s); return; }
          if (T === 5 && v && v.hyperlink) { const h = String(v.hyperlink); sh.links.set(TB.key(r, c), /^#/.test(h) ? { ref: h.slice(1) } : Object.assign({ url: h }, v.tooltip ? { tip: v.tooltip } : {})); }
          v = scalarIn(v);
          if (typeof v === 'string' && v.length > 32767) v = v.slice(0, 32767);
          wb.load(sh, r, c, v, s);
          if (cell.note && typeof cell.note === 'string') sh.notes.set(TB.key(r, c), { text: cell.note, author: '' });
        });
      });
      (comments[si] || []).forEach(([a, t, au]) => { const p = TB.parseAddr(a); if (p) sh.notes.set(TB.key(p.r, p.c), { text: t.replace(new RegExp('^' + (au || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*'), ''), author: au || '' }); });
      // fusions
      ((ws.model && ws.model.merges) || []).forEach((m) => { const g = TB.parseRange(m); if (g) sh.merges.push(g); });
      // filtre automatique
      if (ws.autoFilter) { const ref = typeof ws.autoFilter === 'string' ? ws.autoFilter : ws.autoFilter.from ? (typeof ws.autoFilter.from === 'string' ? ws.autoFilter.from + ':' + ws.autoFilter.to : TB.addr(ws.autoFilter.from.row - 1, ws.autoFilter.from.column - 1) + ':' + TB.addr(ws.autoFilter.to.row - 1, ws.autoFilter.to.column - 1)) : null; const g = ref && TB.parseRange(ref.replace(/\$/g, '')); if (g) sh.af = Object.assign({}, g, { cols: {} }); }
      // validations
      try {
        const dvm = (ws.dataValidations && ws.dataValidations.model) || {}; const groups = new Map();
        Object.keys(dvm).forEach((k) => {
          const d = dvm[k]; if (!d || !d.type || d.type === 'any') return; const sig = JSON.stringify(d);
          if (!groups.has(sig)) groups.set(sig, { d, cells: [], ranges: [] });
          const key = k.replace(/^range:/, '');
          key.split(/\s+/).forEach((x) => { const g = TB.parseRange(x.replace(/\$/g, '')); if (!g) return; if (g.r1 === g.r2 && g.c1 === g.c2) groups.get(sig).cells.push([g.r1, g.c1]); else groups.get(sig).ranges.push(g); });
        });
        groups.forEach(({ d, cells, ranges }) => {
          const rr = ranges.concat(compress(cells)); if (!rr.length) return;
          const ops = { between: 'between', notBetween: 'notBetween', equal: 'eq', notEqual: 'ne', greaterThan: 'gt', lessThan: 'lt', greaterThanOrEqual: 'ge', lessThanOrEqual: 'le' };
          const o = { type: d.type, ranges: rr };
          if (d.operator) o.op = ops[d.operator] || 'between'; else if (d.type !== 'list' && d.type !== 'custom') o.op = 'between';
          const fs = d.formulae || [];
          if (d.type === 'list') { const f = String(fs[0] || ''); o.f1 = /^"/.test(f) ? f.replace(/^"|"$/g, '').split(',').map((x) => x.trim()).join(';') : '=' + (canon(f) || f); }
          else { if (fs[0] != null) o.f1 = fs[0] instanceof Date ? String(dateToSerial(fs[0])) : canon(fs[0]) || String(fs[0]); if (fs[1] != null) o.f2 = fs[1] instanceof Date ? String(dateToSerial(fs[1])) : canon(fs[1]) || String(fs[1]); }
          if (d.allowBlank === false) o.blank = false;
          if (d.showDropDown) o.noArrow = true;
          if (d.showInputMessage !== false && (d.prompt || d.promptTitle)) { o.msg = d.prompt || ''; o.msgTitle = d.promptTitle || ''; }
          if (d.showErrorMessage !== false) { if (d.error) o.errMsg = d.error; if (d.errorTitle) o.errTitle = d.errorTitle; o.errStyle = d.errorStyle || 'stop'; } else o.errStyle = 'none';
          sh.dv.push(o);
        });
      } catch (e) { warnings.push('Validations : ' + e.message); }
      // mises en forme conditionnelles
      try {
        const all = [];
        (ws.conditionalFormattings || []).forEach((cfm) => {
          const ranges = parseRefList(cfm.ref); if (!ranges.length) return;
          (cfm.rules || []).forEach((r) => { const o = cfIn(r); if (o) { o.ranges = ranges; o.id = TB.uid('cf'); o._p = r.priority || 0; all.push(o); } else warnings.push('Mise en forme conditionnelle non reprise : ' + r.type); });
        });
        all.sort((a, b) => a._p - b._p).forEach((o) => { delete o._p; sh.cf.push(o); });
      } catch (e) { warnings.push('Mises en forme conditionnelles : ' + e.message); }
      // tableaux
      try {
        Object.values(ws.tables || {}).forEach((t) => {
          const m = t.table || t.model || t; const g = TB.parseRange(String(m.tableRef || m.ref || '').replace(/\$/g, '')); if (!g) return;
          const st = m.style || {};
          sh.tables.push({ name: m.name || m.displayName, r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2, header: m.headerRow !== false, totals: !!m.totalsRow, style: st.theme || 'TableStyleMedium2', bandRows: st.showRowStripes !== false, bandCols: !!st.showColumnStripes, firstCol: !!st.showFirstColumn, lastCol: !!st.showLastColumn, cols: (m.columns || []).map((c) => ({ name: c.name })), af: {} });
        });
      } catch (e) { warnings.push('Tableaux : ' + e.message); }
      // images
      try {
        ws.getImages().forEach((im) => {
          const img = book.getImage(+im.imageId); if (!img) return;
          const ext = (img.extension || 'png').toLowerCase(); const data = img.buffer || (img.base64 ? Uint8Array.from(atob(img.base64.replace(/^data:[^,]+,/, '')), (ch) => ch.charCodeAt(0)) : null); if (!data) return;
          const id = TB.uid('m'); media[id] = new Blob([data], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) });
          const tl = im.range.tl || {}, br = im.range.br; const c0 = Math.floor(tl.nativeCol != null ? tl.nativeCol : tl.col || 0), r0 = Math.floor(tl.nativeRow != null ? tl.nativeRow : tl.row || 0);
          const o = { id: TB.uid('o'), type: 'image', media: id, from: { r: r0, c: c0, dx: Math.round((tl.nativeColOff || 0) / 9525), dy: Math.round((tl.nativeRowOff || 0) / 9525) }, w: 200, h: 150, alt: '' };
          if (im.range.ext) { o.w = Math.round(im.range.ext.width || 200); o.h = Math.round(im.range.ext.height || 150); }
          else if (br) { o._br = { r: Math.floor(br.nativeRow != null ? br.nativeRow : br.row), c: Math.floor(br.nativeCol != null ? br.nativeCol : br.col), dx: Math.round((br.nativeColOff || 0) / 9525), dy: Math.round((br.nativeRowOff || 0) / 9525) }; }
          sh.objs.push(o);
        });
        sh.objs.forEach((o) => { if (!o._br) return; let w = -o.from.dx, h = -o.from.dy; for (let c = o.from.c; c < o._br.c; c++) w += sh.colWidth(c); for (let r = o.from.r; r < o._br.r; r++) h += sh.rowHeight(r); o.w = Math.max(8, w + o._br.dx); o.h = Math.max(8, h + o._br.dy); delete o._br; });
      } catch (e) { warnings.push('Images : ' + e.message); }
      // mise en page
      const ps = ws.pageSetup || {}; const pz = {};
      if (ps.orientation === 'landscape') pz.orient = 'landscape';
      if (ps.paperSize === 8) pz.paper = 'A3'; else if (ps.paperSize === 1) pz.paper = 'Letter'; else if (ps.paperSize === 11) pz.paper = 'A5';
      if (ps.fitToPage) { pz.fitW = ps.fitToWidth != null ? ps.fitToWidth : 1; pz.fitH = ps.fitToHeight != null ? ps.fitToHeight : 1; } else if (ps.scale && ps.scale !== 100) pz.scale = ps.scale;
      if (ps.margins) { const m = ps.margins, k = 2.54; pz.margins = { t: +(m.top * k).toFixed(2), b: +(m.bottom * k).toFixed(2), l: +(m.left * k).toFixed(2), r: +(m.right * k).toFixed(2), h: +(m.header * k).toFixed(2), f: +(m.footer * k).toFixed(2) }; }
      if (ps.horizontalCentered || ps.verticalCentered) pz.center = { h: !!ps.horizontalCentered, v: !!ps.verticalCentered };
      if (ps.showGridLines) pz.grid = true;
      if (ps.printArea) pz.area = String(ps.printArea).replace(/\$/g, '').split(/[,&]/)[0];
      if (ps.printTitlesRow || ps.printTitlesColumn) pz.titles = { rows: ps.printTitlesRow ? String(ps.printTitlesRow).replace(/\$/g, '') : '', cols: ps.printTitlesColumn ? String(ps.printTitlesColumn).replace(/\$/g, '') : '' };
      const hf = ws.headerFooter || {}; const hfIn = (s) => { if (!s) return null; const o = {}; let cur = 'c'; String(s).replace(/&([LCR])|([^&]+|&(?![LCR]).?)/g, (all, sec, txt) => { if (sec) cur = sec.toLowerCase(); else o[cur] = (o[cur] || '') + txt; }); Object.keys(o).forEach((k) => { o[k] = o[k].replace(/&"[^"]*"/g, '').replace(/&\d+/g, ''); }); return o; };
      if (hf.oddHeader) pz.header = hfIn(hf.oddHeader); if (hf.oddFooter) pz.footer = hfIn(hf.oddFooter);
      sh.print = pz;
      // protection
      const sp = ws.sheetProtection; if (sp && sp.sheet) sh.protect = { hash: null, file: true, allow: { formatCells: sp.formatCells === false, formatColumns: sp.formatColumns === false, formatRows: sp.formatRows === false, insertRows: sp.insertRows === false, deleteRows: sp.deleteRows === false, sort: sp.sort === false, autoFilter: sp.autoFilter === false } };
    });
    // noms
    rawNames.forEach((n) => {
      if (/^_xlnm\./i.test(n.n)) return; if (n.hidden && /^_/.test(n.n)) return;
      const f = canon(n.f); if (f == null) { warnings.push('Nom « ' + n.n + ' » non repris'); return; }
      wb.names.push({ n: n.n, f, sh: n.local != null && wb.sheets[n.local] ? wb.sheets[n.local].name : null, cm: '' });
    });
    // classeur
    if (book.calcProperties && book.calcProperties.fullCalcOnLoad === false) void 0;
    const v = (book.views || [])[0]; if (v && v.activeTab != null && wb.sheets[v.activeTab]) wb.active = v.activeTab;
    if (book.creator) wb.props.author = book.creator; if (book.title) wb.props.title = book.title;
    wb.media = media;
    if (!wb.sheets.length) wb.addSheetRaw('Feuil1');
    THEME = null;
    if (await hasCharts(z)) warnings.push('Les graphiques du fichier ne sont pas repris : recréez-les avec Insertion › Graphique.');
    if (z.file('xl/pivotCache/pivotCacheDefinition1.xml')) warnings.push('Tableaux croisés dynamiques repris comme valeurs (recréez-les avec Données › Tableau croisé).');
    if (Object.keys(z.files).some((n) => /^xl\/vbaProject\.bin$/i.test(n))) warnings.push('Les macros (VBA) ne sont pas prises en charge et ne seront pas enregistrées.');
    wb.finishLoad();
    return { wb, warnings: Array.from(new Set(warnings)) };
  };
  async function hasCharts(z) { return Object.keys(z.files).some((n) => /^xl\/charts\/chart\d+\.xml$/i.test(n)); }

  const CF_OPS_IN = { greaterThan: 'gt', lessThan: 'lt', greaterThanOrEqual: 'ge', lessThanOrEqual: 'le', equal: 'eq', notEqual: 'ne', between: 'between', notBetween: 'notBetween' };
  const CF_OPS_OUT = Object.fromEntries(Object.entries(CF_OPS_IN).map(([a, b]) => [b, a]));
  const PERIOD_IN = { last7Days: 'last7' }; const PERIOD_OUT = { last7: 'last7Days' };
  function cfvoIn(v, c) { const o = { t: v.type === 'num' || v.type === 'number' ? 'num' : v.type }; if (v.value != null) o.v = typeof v.value === 'number' ? v.value : (isNaN(+v.value) ? v.value : +v.value); if (c) o.c = c; if (v.gte === false) o.gt = true; return o; }
  function cfIn(r) {
    const fmt = dxfIn(r.style); const base = { fmt }; if (r.stopIfTrue) base.stop = true;
    const f0 = r.formulae && r.formulae[0] != null ? canon(r.formulae[0]) || String(r.formulae[0]) : null;
    switch (r.type) {
      case 'cellIs': { const o = Object.assign(base, { type: 'cellIs', op: CF_OPS_IN[r.operator] || 'eq', f1: f0 }); if (r.formulae && r.formulae[1] != null) o.f2 = canon(r.formulae[1]) || String(r.formulae[1]); return o; }
      case 'expression': return Object.assign(base, { type: 'expr', f: f0 });
      case 'containsText': {
        const op = r.operator || 'containsText';
        if (op === 'containsBlanks') return Object.assign(base, { type: 'blank' }); if (op === 'notContainsBlanks') return Object.assign(base, { type: 'noBlank' });
        if (op === 'containsErrors') return Object.assign(base, { type: 'err' }); if (op === 'notContainsErrors') return Object.assign(base, { type: 'noErr' });
        return Object.assign(base, { type: 'text', op: { containsText: 'contains', notContainsText: 'notContains', beginsWith: 'begins', endsWith: 'ends' }[op] || 'contains', text: r.text || '' });
      }
      case 'containsBlanks': return Object.assign(base, { type: 'blank' }); case 'notContainsBlanks': return Object.assign(base, { type: 'noBlank' });
      case 'containsErrors': return Object.assign(base, { type: 'err' }); case 'notContainsErrors': return Object.assign(base, { type: 'noErr' });
      case 'beginsWith': case 'endsWith': case 'notContainsText': return Object.assign(base, { type: 'text', op: { beginsWith: 'begins', endsWith: 'ends', notContainsText: 'notContains' }[r.type], text: r.text || '' });
      case 'timePeriod': return Object.assign(base, { type: 'date', period: PERIOD_IN[r.timePeriod] || r.timePeriod });
      case 'top10': return Object.assign(base, { type: 'top', rank: r.rank || 10, pct: !!r.percent, bottom: !!r.bottom });
      case 'aboveAverage': return Object.assign(base, { type: 'avg', above: r.aboveAverage !== false, equal: !!r.equalAverage, std: r.stdDev || 0 });
      case 'duplicateValues': return Object.assign(base, { type: 'dup' }); case 'uniqueValues': return Object.assign(base, { type: 'dup', unique: true });
      case 'colorScale': return { type: 'colorScale', pts: (r.cfvo || []).map((v, i) => cfvoIn(v, colorIn((r.color || [])[i]) || '#FFFFFF')) };
      case 'dataBar': { const cf = r.cfvo || []; const o = { type: 'dataBar', color: colorIn(r.color) || '#638EC6', grad: r.gradient !== false }; if (cf[0]) o.min = cfvoIn(cf[0]); if (cf[1]) o.max = cfvoIn(cf[1]); if (r.showValue === false) o.showValue = false; if (r.border) o.border = true; return o; }
      case 'iconSet': { const cf = r.cfvo || []; const o = { type: 'iconSet', set: r.iconSet || '3TrafficLights1', pts: cf.slice(1).map((v) => cfvoIn(v)) }; if (r.reverse) o.rev = true; if (r.showValue === false) o.showValue = false; return o; }
    }
    return null;
  }
  function cfvoOut(p) { const o = { type: p.t === 'num' ? 'num' : p.t }; if (p.v != null && p.t !== 'min' && p.t !== 'max') o.value = p.v; return o; }
  function cfOut(rule, ref, prio) {
    const g = rule.ranges[0]; const tl = TB.addr(g.r1, g.c1);
    const F = (x) => fileF(x);
    const b = { priority: prio }; if (rule.stop) b.stopIfTrue = true;
    const style = dxfOut(rule.fmt);
    switch (rule.type) {
      case 'cellIs': return Object.assign(b, { type: 'cellIs', operator: CF_OPS_OUT[rule.op] || 'equal', formulae: [F(rule.f1)].concat(rule.f2 != null ? [F(rule.f2)] : []), style });
      case 'expr': return Object.assign(b, { type: 'expression', formulae: [F(rule.f)], style });
      case 'text': { const t = String(rule.text || '').replace(/"/g, '""'); const f = { contains: 'NOT(ISERROR(SEARCH("' + t + '",' + tl + ')))', notContains: 'ISERROR(SEARCH("' + t + '",' + tl + '))', begins: 'LEFT(' + tl + ',LEN("' + t + '"))="' + t + '"', ends: 'RIGHT(' + tl + ',LEN("' + t + '"))="' + t + '"' }[rule.op || 'contains']; return Object.assign(b, { type: 'expression', formulae: [f], style }); }
      case 'blank': return Object.assign(b, { type: 'expression', formulae: ['LEN(TRIM(' + tl + '))=0'], style });
      case 'noBlank': return Object.assign(b, { type: 'expression', formulae: ['LEN(TRIM(' + tl + '))>0'], style });
      case 'err': return Object.assign(b, { type: 'expression', formulae: ['ISERROR(' + tl + ')'], style });
      case 'noErr': return Object.assign(b, { type: 'expression', formulae: ['NOT(ISERROR(' + tl + '))'], style });
      case 'date': return Object.assign(b, { type: 'timePeriod', timePeriod: PERIOD_OUT[rule.period] || rule.period, style, formulae: [] });
      case 'top': return Object.assign(b, { type: 'top10', rank: rule.rank || 10, percent: !!rule.pct, bottom: !!rule.bottom, style });
      case 'avg': return Object.assign(b, { type: 'aboveAverage', aboveAverage: rule.above !== false, style });
      case 'dup': { const abs = ref.split(' ').map((x) => x.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')).join(','); return Object.assign(b, { type: 'expression', formulae: ['COUNTIF(' + abs + ',' + tl + ')' + (rule.unique ? '=1' : '>1')], style }); }
      case 'colorScale': return Object.assign(b, { type: 'colorScale', cfvo: rule.pts.map(cfvoOut), color: rule.pts.map((p) => argb(p.c)) });
      case 'dataBar': return Object.assign(b, { type: 'dataBar', gradient: rule.grad !== false, cfvo: [cfvoOut(rule.min || { t: 'min' }), cfvoOut(rule.max || { t: 'max' })], color: argb(rule.color || '#638EC6'), showValue: rule.showValue !== false });
      case 'iconSet': { const n = (TB.CF && TB.CF.ICONS[rule.set] || [0, 0, 0]).length; const pts = rule.pts && rule.pts.length === n - 1 ? rule.pts : Array.from({ length: n - 1 }, (_, i) => ({ t: 'percent', v: Math.round(100 * (i + 1) / n) })); return Object.assign(b, { type: 'iconSet', iconSet: rule.set, reverse: !!rule.rev, showValue: rule.showValue !== false, cfvo: [{ type: 'percent', value: 0 }].concat(pts.map(cfvoOut)) }); }
    }
    return null;
  }

  /* =====================================================================
     Écriture
     ===================================================================== */
  const PAPER = { A4: 9, A3: 8, A5: 11, Letter: 1, Legal: 5 };
  X.write = async function (wb, opt) {
    opt = opt || {};
    const E = await lib();
    const warn = [];
    const book = new E.Workbook();
    book.creator = wb.props.author || ''; book.lastModifiedBy = wb.props.author || ''; book.created = new Date(wb.props.created || Date.now()); book.modified = new Date();
    if (wb.props.title) book.title = wb.props.title;
    book.calcProperties = { fullCalcOnLoad: true };
    book.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: Math.max(0, wb.sheets.indexOf(wb.cur)), visibility: 'visible' }];
    const sCache = new Map(); const styleOf = (id) => { let s = sCache.get(id); if (!s) { s = styleOut(wb.styles.get(id)); sCache.set(id, s); } return s; };
    const extra = []; // tableaux, par feuille
    let charts = 0;
    for (let si = 0; si < wb.sheets.length; si++) {
      const sh = wb.sheets[si];
      const ws = book.addWorksheet(sh.name, {
        state: sh.hidden === 2 ? 'veryHidden' : sh.hidden ? 'hidden' : 'visible',
        properties: Object.assign({ defaultRowHeight: Math.round(sh.defH * 0.75 * 100) / 100 }, sh.tab ? { tabColor: argb(sh.tab) } : {}, sh.defW !== 64 ? { defaultColWidth: widthOfPx(sh.defW) } : {}),
        views: [Object.assign({ state: sh.freeze && (sh.freeze.r || sh.freeze.c) ? 'frozen' : 'normal', showGridLines: sh.grid !== false, showRowColHeaders: sh.heads !== false, zoomScale: Math.round((sh.zoom || 1) * 100) },
          sh.freeze && (sh.freeze.r || sh.freeze.c) ? { xSplit: sh.freeze.c || 0, ySplit: sh.freeze.r || 0, topLeftCell: TB.addr(sh.freeze.r || 0, sh.freeze.c || 0) } : {},
          sh.sel ? { activeCell: TB.addr(sh.sel.r || 0, sh.sel.c || 0) } : {}, si === wb.sheets.indexOf(wb.cur) ? { tabSelected: true } : {})]
      });
      // colonnes
      const nC = Math.max(sh.colW.length, sh.colSt.length, sh.outC.length, ...Array.from(sh.hidC).map((x) => x + 1), 0);
      for (let c = 0; c < nC; c++) {
        const has = sh.colW[c] != null || sh.hidC.has(c) || sh.colSt[c] || sh.outC[c]; if (!has) continue;
        const col = ws.getColumn(c + 1);
        col.width = widthOfPx(sh.colW[c] != null ? sh.colW[c] : sh.defW);
        if (sh.hidC.has(c)) col.hidden = true; if (sh.outC[c]) col.outlineLevel = sh.outC[c];
        if (sh.colSt[c]) col.style = styleOf(sh.colSt[c]);
      }
      // lignes
      const nR = Math.max(sh.rowH.length, sh.rowSt.length, sh.outR.length, ...Array.from(sh.hidR).map((x) => x + 1), 0);
      for (let r = 0; r < nR; r++) {
        const has = sh.rowH[r] != null || sh.hidR.has(r) || sh.rowSt[r] || sh.outR[r]; if (!has) continue;
        const row = ws.getRow(r + 1);
        if (sh.rowH[r] != null) row.height = Math.round(sh.rowH[r] * 0.75 * 100) / 100;
        if (sh.hidR.has(r)) row.hidden = true; if (sh.outR[r]) row.outlineLevel = sh.outR[r];
        if (sh.rowSt[r]) row.style = styleOf(sh.rowSt[r]);
      }
      // cellules
      const ext = sh.extent();
      const arrSkip = new Set();
      const outCell = (r, c) => {
        const k = TB.key(r, c);
        const f = sh.formula(r, c); let v = sh.get(r, c); const s = sh.ownStyle(r, c);
        if (f && f.arrChild) { if (s !== undefined) ws.getCell(r + 1, c + 1).style = styleOf(s); return; }
        if (!f && v === null && s === undefined && !sh.notes.has(k) && !sh.links.has(k)) return;
        const cell = ws.getCell(r + 1, c + 1);
        if (s !== undefined) cell.style = styleOf(s);
        const res = (x) => x instanceof TB.Err ? { error: TB.errText(x) } : x;
        if (f) {
          const src = fileF(f.src, sh, r, c);
          const g = f.arr || (sh.spills && sh.spills.get(k));
          let rv = v; if (rv && typeof rv === 'object' && !(rv instanceof TB.Err)) rv = null;
          if (g && (g.r1 !== g.r2 || g.c1 !== g.c2)) { cell.value = { formula: src, result: res(rv), shareType: 'array', ref: TB.rangeStr(g) }; }
          else cell.value = { formula: src, result: res(rv) };
        } else if (v !== null) {
          if (sh.spillOwner && sh.spillOwner.has(k)) { cell.value = res(v); }
          else {
            const lk = sh.links.get(k);
            if (lk && typeof v === 'string') cell.value = { text: v, hyperlink: lk.ref ? '#' + lk.ref : lk.url, tooltip: lk.tip || undefined };
            else cell.value = res(v);
          }
        }
        const n = sh.notes.get(k); if (n) cell.note = { texts: [{ font: { bold: true, size: 9, name: 'Tahoma' }, text: (n.author ? n.author + ':\n' : '') }, { font: { size: 9, name: 'Tahoma' }, text: n.text || '' }].filter((x) => x.text), margins: { insetmode: 'auto' } };
        const th = sh.threads && sh.threads.get(k); if (!n && th && th.items && th.items.length) cell.note = th.items.map((m) => (m.author ? m.author + ' : ' : '') + m.text).join('\n');
      };
      for (let r = 0; r <= ext.r; r++) for (let c = 0; c <= ext.c; c++) outCell(r, c);
      void arrSkip;
      // fusions
      sh.merges.forEach((m) => { try { ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1); } catch (e) { warn.push('Fusion ' + TB.rangeStr(m) + ' : ' + e.message); } });
      // filtre automatique (hors tableaux)
      if (sh.af && sh.af.r2 != null) ws.autoFilter = TB.rangeStr(sh.af);
      // validations
      sh.dv.forEach((d) => {
        const ops = { between: 'between', notBetween: 'notBetween', eq: 'equal', ne: 'notEqual', gt: 'greaterThan', lt: 'lessThan', ge: 'greaterThanOrEqual', le: 'lessThanOrEqual' };
        const m = { type: d.type, allowBlank: d.blank !== false, showInputMessage: !!(d.msg || d.msgTitle), showErrorMessage: d.errStyle !== 'none' };
        if (d.type === 'list') { const src = String(d.f1 || ''); m.formulae = [/^=/.test(src) ? fileF(src.slice(1)) : '"' + src.replace(/^"|"$/g, '').split(/[;,]/).map((x) => x.trim()).filter(Boolean).join(',') + '"']; if (d.noArrow) m.showDropDown = true; }
        else { m.operator = ops[d.op || 'between'] || 'between'; m.formulae = [fileF(d.f1 == null ? '0' : d.f1)].concat(d.f2 != null && /between/i.test(d.op || 'between') ? [fileF(d.f2)] : []); if (d.type === 'custom') delete m.operator; }
        if (d.msg) m.prompt = d.msg; if (d.msgTitle) m.promptTitle = d.msgTitle;
        if (d.errMsg) m.error = d.errMsg; if (d.errTitle) m.errorTitle = d.errTitle;
        if (d.errStyle && d.errStyle !== 'stop' && d.errStyle !== 'none') m.errorStyle = d.errStyle;
        (d.ranges || []).forEach((g) => { const gg = { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, 1048575), c2: Math.min(g.c2, 16383) }; ws.dataValidations.add(TB.rangeStr(gg), m); });
      });
      // mises en forme conditionnelles
      let prio = 1;
      sh.cf.forEach((rule) => { const ref = refList(rule.ranges || []); if (!ref) return; const o = cfOut(rule, ref, prio++); if (o) ws.addConditionalFormatting({ ref, rules: [o] }); else warn.push('Règle de mise en forme non exportée : ' + rule.type); });
      // images
      for (const o of sh.objs) {
        if (o.type === 'image' && o.media && wb.media[o.media]) {
          const blob = wb.media[o.media]; const t = (blob.type || 'image/png').split('/')[1].replace('jpeg', 'jpeg').replace('svg+xml', 'png');
          if (!/^(png|jpeg|gif)$/.test(t)) { warn.push('Image ' + t + ' non exportée'); continue; }
          const id = book.addImage({ buffer: new Uint8Array(await blob.arrayBuffer()), extension: t });
          ws.addImage(id, { tl: { col: o.from.c + (o.from.dx || 0) / Math.max(1, sh.colWidth(o.from.c)), row: o.from.r + (o.from.dy || 0) / Math.max(1, sh.rowHeight(o.from.r)) }, ext: { width: o.w, height: o.h }, editAs: 'oneCell' });
        } else if (o.type === 'chart') charts++;
        else if (o.type === 'shape' || o.type === 'icon') warn.push('Formes, zones de texte et icônes non exportées en .xlsx');
      }
      // mise en page
      const pz = sh.print || {}; const ps = { paperSize: PAPER[pz.paper || 'A4'] || 9, orientation: pz.orient === 'landscape' ? 'landscape' : 'portrait' };
      if (pz.fitW != null || pz.fitH != null) { ps.fitToPage = true; ps.fitToWidth = pz.fitW == null ? 0 : pz.fitW; ps.fitToHeight = pz.fitH == null ? 0 : pz.fitH; } else if (pz.scale) ps.scale = pz.scale;
      const mg = pz.margins || { t: 1.9, b: 1.9, l: 1.8, r: 1.8, h: 0.8, f: 0.8 }; const k = 1 / 2.54;
      ps.margins = { top: mg.t * k, bottom: mg.b * k, left: mg.l * k, right: mg.r * k, header: (mg.h != null ? mg.h : 0.8) * k, footer: (mg.f != null ? mg.f : 0.8) * k };
      if (pz.center) { ps.horizontalCentered = !!pz.center.h; ps.verticalCentered = !!pz.center.v; }
      if (pz.grid) ps.showGridLines = true;
      if (pz.area) ps.printArea = String(pz.area).replace(/\$/g, '');
      if (pz.titles && pz.titles.rows) ps.printTitlesRow = String(pz.titles.rows).replace(/\$/g, '').replace(/^(\d+)$/, '$1:$1');
      if (pz.titles && pz.titles.cols) ps.printTitlesColumn = String(pz.titles.cols).replace(/\$/g, '');
      ws.pageSetup = Object.assign(ws.pageSetup || {}, ps);
      const hfOut = (o) => o ? ['l', 'c', 'r'].map((x) => o[x] ? '&' + x.toUpperCase() + o[x] : '').join('') : '';
      if (pz.header || pz.footer) ws.headerFooter = { oddHeader: hfOut(pz.header) || undefined, oddFooter: hfOut(pz.footer) || undefined };
      // protection (sans mot de passe : le mot de passe local n'est pas transposable)
      if (sh.protect) { const al = sh.protect.allow || {}; await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatCells: !!al.formatCells, formatColumns: !!al.formatColumns, formatRows: !!al.formatRows, insertRows: !!al.insertRows, deleteRows: !!al.deleteRows, sort: !!al.sort, autoFilter: !!al.autoFilter, spinCount: 1 }); if (sh.protect.hash) warn.push('Protection de « ' + sh.name + ' » exportée sans mot de passe'); }
      if (sh.tables.length) extra.push({ si, tables: sh.tables });
    }
    if (charts) warn.push(charts + ' graphique(s) non exporté(s) en .xlsx (conservés dans le .magcalc)');
    let out = await book.xlsx.writeBuffer();
    // ajouts au paquet : tableaux, noms
    out = await patchPackage(out, wb, extra);
    return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), warn: Array.from(new Set(warn)) };
  };

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /** extLst de niveau feuille (après le dernier </conditionalFormatting>) déplacée en fin de feuille, précédée de « before » */
  function moveExt(sx, before) {
    const from = Math.max(0, sx.lastIndexOf('</conditionalFormatting>'));
    const i = sx.indexOf('<extLst>', from); let ext = '';
    if (i >= 0) { const j = sx.indexOf('</extLst>', i); if (j > i) { ext = sx.slice(i, j + 9); sx = sx.slice(0, i) + sx.slice(j + 9); } }
    if (!ext && !before) return sx;
    return sx.replace('</worksheet>', () => before + ext + '</worksheet>');
  }
  async function patchPackage(buf, wb, extra) {
    const z = await JSZip.loadAsync(buf);
    let ct = await z.file('[Content_Types].xml').async('string');
    let tid = 0;
    // ExcelJS place l'extLst de la feuille (barres de données) avant dataValidations : on la remet à la fin (ordre du schéma)
    for (let si = 0; si < wb.sheets.length; si++) {
      const sp = 'xl/worksheets/sheet' + (si + 1) + '.xml'; if (!z.file(sp)) continue;
      const sx = await z.file(sp).async('string'); const fixed = moveExt(sx, '');
      if (fixed !== sx) z.file(sp, fixed);
    }
    for (const { si, tables } of extra) {
      const sp = 'xl/worksheets/sheet' + (si + 1) + '.xml'; if (!z.file(sp)) continue;
      let sx = await z.file(sp).async('string');
      const rp = 'xl/worksheets/_rels/sheet' + (si + 1) + '.xml.rels';
      let rels = z.file(rp) ? await z.file(rp).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      const parts = [];
      tables.forEach((t) => {
        tid++; const rid = 'rIdTb' + tid; const path = 'xl/tables/table' + tid + '.xml';
        const ref = TB.rangeStr({ r1: t.r1, c1: t.c1, r2: t.r2, c2: t.c2 });
        const afRef = TB.rangeStr({ r1: t.r1, c1: t.c1, r2: t.totals ? t.r2 - 1 : t.r2, c2: t.c2 });
        const sh = wb.sheets[si]; const names = new Set();
        const cols = t.cols.map((c, i) => { let n = t.header !== false ? sh.get(t.r1, t.c1 + i) : c.name; n = n == null || n === '' ? 'Colonne' + (i + 1) : String(typeof n === 'number' ? TB.numText(n) : n); let k = n, j = 2; while (names.has(k.toLowerCase())) k = n + j++; names.add(k.toLowerCase()); return k; });
        const tot = (i) => { if (!t.totals) return ''; const v = sh.get(t.r2, t.c1 + i), f = sh.formula(t.r2, t.c1 + i); if (f) { const m = /^SUBTOTAL\((10[1-9]|11[01]|[1-9]|1[01]),/.exec(f.src); const fn = m ? { 1: 'average', 2: 'countNums', 3: 'count', 4: 'max', 5: 'min', 7: 'stdDev', 9: 'sum', 10: 'var' }[(+m[1]) % 100] : null; return fn ? ' totalsRowFunction="' + fn + '"' : ' totalsRowFunction="custom"'; } if (typeof v === 'string' && v) return ' totalsRowLabel="' + esc(v) + '"'; return ''; };
        const totF = (i) => { if (!t.totals) return ''; const f = sh.formula(t.r2, t.c1 + i); if (!f) return ''; const m = /^SUBTOTAL\((10[1-9]|11[01]|[1-9]|1[01]),/.exec(f.src); return m && { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 7: 1, 9: 1, 10: 1 }[(+m[1]) % 100] ? '' : '<totalsRowFormula>' + esc(fileF(f.src)) + '</totalsRowFormula>'; };
        const x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="' + tid + '" name="' + esc(t.name) + '" displayName="' + esc(t.name) + '" ref="' + ref + '"' + (t.header === false ? ' headerRowCount="0"' : '') + (t.totals ? ' totalsRowCount="1"' : ' totalsRowShown="0"') + '>' +
          (t.header !== false && t.filter !== false ? '<autoFilter ref="' + afRef + '"/>' : '') +
          '<tableColumns count="' + cols.length + '">' + cols.map((n, i) => { const tf = totF(i); return '<tableColumn id="' + (i + 1) + '" name="' + esc(n) + '"' + tot(i) + (tf ? '>' + tf + '</tableColumn>' : '/>'); }).join('') + '</tableColumns>' +
          '<tableStyleInfo name="' + esc(t.style || 'TableStyleMedium2') + '" showFirstColumn="' + (t.firstCol ? 1 : 0) + '" showLastColumn="' + (t.lastCol ? 1 : 0) + '" showRowStripes="' + (t.bandRows !== false ? 1 : 0) + '" showColumnStripes="' + (t.bandCols ? 1 : 0) + '"/></table>';
        z.file(path, x);
        rels = rels.replace('</Relationships>', () => '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table' + tid + '.xml"/></Relationships>');
        ct = ct.replace('</Types>', () => '<Override PartName="/' + path + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/></Types>');
        parts.push(rid);
      });
      if (!/xmlns:r=/.test(sx.slice(0, 600))) sx = sx.replace('<worksheet ', () => '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
      const tp = '<tableParts count="' + parts.length + '">' + parts.map((id) => '<tablePart r:id="' + id + '"/>').join('') + '</tableParts>';
      sx = moveExt(sx, tp);
      z.file(sp, sx); z.file(rp, rels);
    }
    z.file('[Content_Types].xml', ct);
    if (wb.names.length) {
      let x = await z.file('xl/workbook.xml').async('string');
      const defs = wb.names.map((n) => { const ls = n.sh ? wb.sheets.findIndex((s) => s.name === n.sh) : -1; return '<definedName name="' + esc(n.n) + '"' + (ls >= 0 ? ' localSheetId="' + ls + '"' : '') + (n.cm ? ' comment="' + esc(n.cm) + '"' : '') + '>' + esc(fileF(n.f)) + '</definedName>'; }).join('');
      if (/<definedNames>/.test(x)) x = x.replace('<definedNames>', () => '<definedNames>' + defs);
      else if (/<definedNames\/>/.test(x)) x = x.replace('<definedNames/>', () => '<definedNames>' + defs + '</definedNames>');
      else x = x.replace(/(<calcPr\b|<\/workbook>)/, (m) => '<definedNames>' + defs + '</definedNames>' + m);
      z.file('xl/workbook.xml', x);
    }
    return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  X._styleIn = styleIn; X._styleOut = styleOut; X._cfIn = cfIn; X._cfOut = cfOut;
})();
