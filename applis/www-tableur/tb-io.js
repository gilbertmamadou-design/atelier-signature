/* Tableur — fichiers : .magcalc (zip : workbook.json, media/, thumb.jpg), CSV / TSV (assistant : séparateur, encodage,
   séparateur décimal, ordre des dates, types de colonnes), page web HTML, anciens .xls (lecture avec SheetJS CE,
   Apache-2.0, chargé à la demande), aiguillage vers .xlsx (tb-xlsx.js) et .ods (tb-ods.js), vignettes. */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur;
  const IO = TB.IO = {};
  const A = window.TableurApp = window.TableurApp || {};

  const kindOf = (name) => { const e = O.extOf(name); return e === 'xlsm' || e === 'xltx' ? 'xlsx' : e === 'ots' ? 'ods' : e === 'txt' || e === 'prn' ? 'tsv' : e; };
  /** ouvrir un fichier → {wb, kind, warnings} (null si annulé) */
  IO.open = async function (blob, name, opt) {
    opt = opt || {};
    const buf = new Uint8Array(await blob.arrayBuffer());
    let kind = kindOf(name);
    // contenu réel (un .xls peut être un .xlsx renommé, un CSV peut s'appeler .xls…)
    const zip = buf[0] === 0x50 && buf[1] === 0x4B, ole = buf[0] === 0xD0 && buf[1] === 0xCF;
    if (zip) { const z = await JSZip.loadAsync(buf); if (z.file('workbook.json')) kind = 'magcalc'; else if (z.file('xl/workbook.xml')) kind = 'xlsx'; else if (z.file('content.xml')) kind = 'ods'; IO._zip = z; }
    else if (ole) kind = 'xls';
    else if (/^(xlsx|ods|magcalc)$/.test(kind)) { const t = TB.Data.decode(buf).text; kind = /<table/i.test(t.slice(0, 4000)) ? 'html' : 'csv'; }
    if (kind === 'xls' && !ole && !zip) { const t = TB.Data.decode(buf).text; kind = /<table/i.test(t.slice(0, 4000)) ? 'html' : 'csv'; }
    let r;
    switch (kind) {
      case 'magcalc': r = await IO.readMagcalc(IO._zip || await JSZip.loadAsync(buf)); break;
      case 'xlsx': r = await TB.Xlsx.read(IO._zip || await JSZip.loadAsync(buf), opt); break;
      case 'ods': r = await TB.Ods.read(IO._zip || await JSZip.loadAsync(buf)); break;
      case 'xls': r = await IO.readSheetJS(buf, 'xls'); break;
      case 'html': r = IO.readHtml(TB.Data.decode(buf).text); kind = 'html'; break;
      default: {
        const res = opt.wizard === false ? IO.csvAuto(buf, name) : await IO.csvWizard(buf, name, {});
        if (!res) return null; r = res; kind = /\.tsv$|\.txt$/i.test(name) && res.sep === '\t' ? 'tsv' : 'csv';
      }
    }
    IO._zip = null;
    r.kind = kind;
    if (r.wb) { r.wb.fileName = name; }
    return r;
  };
  /** enregistrer → {blob, warn} */
  IO.save = async function (kind, wb, opt) {
    opt = opt || {};
    switch (kind) {
      case 'magcalc': return { blob: await IO.writeMagcalc(wb, opt) };
      case 'xlsx': return TB.Xlsx.write(wb, opt);
      case 'ods': return TB.Ods.write(wb, opt);
      case 'csv': return { blob: IO.writeCsv(wb, opt.sheet || wb.cur, { sep: TB.loc.sep === 'fr' ? ';' : ',', bom: true }) };
      case 'tsv': return { blob: IO.writeCsv(wb, opt.sheet || wb.cur, { sep: '\t', bom: true }) };
      case 'html': return { blob: new Blob([IO.writeHtml(wb)], { type: 'text/html' }) };
    }
    throw new Error('Format non pris en charge : ' + kind);
  };

  /* ---------------- .magcalc ---------------- */
  IO.writeMagcalc = async function (wb, opt) {
    const z = new JSZip();
    const json = TB.IOJ.toJson(wb);
    z.file('mimetype', 'application/x-magcalc', { compression: 'STORE' });
    z.file('workbook.json', JSON.stringify(json));
    for (const id of json.media) { const b = wb.media[id]; if (b) z.file('media/' + id, b, { binary: true }); }
    if (opt && opt.thumb) { const b = O.dataURLToBlob(opt.thumb); if (b) z.file('thumb.jpg', b, { binary: true }); }
    z.file('LISEZMOI.txt', 'Classeur Tableur (Suite MAG). Le contenu est dans workbook.json (JSON lisible) ; les images dans media/.\r\nOuvrez-le avec Tableur, ou enregistrez-le en .xlsx / .ods depuis Tableur pour les autres logiciels.\r\n');
    return z.generateAsync({ type: 'blob', mimeType: 'application/x-magcalc', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  };
  IO.readMagcalc = async function (z) {
    const f = z.file('workbook.json'); if (!f) throw new Error('workbook.json absent : fichier .magcalc endommagé');
    const json = JSON.parse(await f.async('string'));
    const media = {};
    for (const id of json.media || []) { const m = z.file('media/' + id); if (m) { const b = await m.async('blob'); media[id] = new Blob([b], { type: guessMime(await m.async('uint8array')) }); } }
    return { wb: TB.IOJ.fromJson(json, media), warnings: [] };
  };
  function guessMime(u) { if (u[0] === 0x89 && u[1] === 0x50) return 'image/png'; if (u[0] === 0xFF && u[1] === 0xD8) return 'image/jpeg'; if (u[0] === 0x47 && u[1] === 0x49) return 'image/gif'; if (u[0] === 0x52 && u[1] === 0x49 && u[8] === 0x57) return 'image/webp'; if (u[0] === 0x3C) return 'image/svg+xml'; return 'application/octet-stream'; }
  IO.guessMime = guessMime;

  /* ---------------- CSV ---------------- */
  /** lecture automatique (sans assistant) */
  IO.csvAuto = function (buf, name) {
    const d = TB.Data.decode(buf, 'auto'); const sep = /\.tsv$/i.test(name) ? '\t' : TB.Data.guessSep(d.text);
    const dec = guessDec(d.text, sep);
    return IO.csvBuild(d.text, { sep, dec, enc: d.enc, dateOrder: 'DMY', name });
  };
  function guessDec(text, sep) { const sample = text.slice(0, 20000); const comma = (sample.match(/\d,\d/g) || []).length, dot = (sample.match(/\d\.\d/g) || []).length; return sep === ',' ? '.' : comma >= dot ? ',' : '.'; }
  IO.csvBuild = function (text, o) {
    const rows = TB.Data.splitCsv(text, o.sep, o.quote === '' ? '\u0000' : (o.quote || '"'));
    const skip = o.skip || 0;
    const wb = TB.newWorkbook(0); const sh = wb.addSheetRaw(o.sheetName || (O.baseName(o.name || '') || 'Feuil1').slice(0, 31).replace(/[\\/?*[\]:]/g, '_') || 'Feuil1');
    const types = o.types || []; const styles = {};
    const sid = (fmt) => { if (!fmt) return undefined; if (styles[fmt] == null) styles[fmt] = wb.styles.add({ nf: fmt }); return styles[fmt]; };
    for (let i = skip; i < rows.length; i++) {
      const row = rows[i];
      for (let j = 0, k = 0; j < row.length; j++) {
        const ty = types[j] || 'general'; if (ty === 'skip') continue;
        const x = TB.Data.csvValue(row[j], { dec: o.dec, thou: o.thou, dateOrder: o.dateOrder, type: ty });
        if (x.v !== null) wb.load(sh, i - skip, k, typeof x.v === 'string' && x.v[0] === '=' && !o.formulas ? x.v : x.v, sid(x.fmt));
        k++;
      }
    }
    // largeurs de colonnes approximatives
    const e = sh.extent(); for (let c = 0; c <= Math.min(e.c, 60); c++) { let w = 0; for (let r = 0; r <= Math.min(e.r, 200); r++) { const v = sh.get(r, c); if (v !== null) w = Math.max(w, String(typeof v === 'number' ? TB.Fmt.text(v, wb.styles.get(sh.styleAt(r, c)).nf) : v).length); } if (w > 8) sh.colW[c] = Math.min(400, Math.round(w * 7 + 10)); }
    if (o.header && e.r > 0) { const b = wb.styles.add({ b: true }); for (let c = 0; c <= e.c; c++) { const col = sh.sty[c] || (sh.sty[c] = []); col[0] = b; } sh.freeze = { r: 1, c: 0 }; }
    wb.finishLoad();
    return { wb, warnings: [], sep: o.sep, enc: o.enc, rows: rows.length };
  };
  /** assistant d'importation CSV ; opt.into : renvoie {rows, opts} pour insérer dans le classeur courant */
  IO.csvWizard = async function (src, name, opt) {
    opt = opt || {};
    const buf = src instanceof Uint8Array ? src : new Uint8Array(await src.arrayBuffer());
    let dec0 = TB.Data.decode(buf, 'auto');
    const o = { enc: dec0.enc, sep: /\.tsv$/i.test(name) ? '\t' : TB.Data.guessSep(dec0.text), quote: '"', skip: 0, header: true, dateOrder: 'DMY', name };
    o.dec = guessDec(dec0.text, o.sep); o.thou = o.dec === ',' ? ' ' : '';
    let text = dec0.text;
    const body = O.h('div');
    const SEPS = [[';', 'Point-virgule ;'], [',', 'Virgule ,'], ['\t', 'Tabulation'], ['|', 'Barre |'], [' ', 'Espace']];
    body.innerHTML = '<div class="o-form"><label class="o-field half"><span>Encodage</span><select class="o-in" id="cwEnc"><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252 (Excel ancien, accents)</option><option value="iso-8859-1">ISO-8859-1 (Latin-1)</option><option value="utf-16le">UTF-16</option></select></label><label class="o-field half"><span>Séparateur</span><select class="o-in" id="cwSep">' + SEPS.map((s) => '<option value="' + (s[0] === '\t' ? 'tab' : s[0]) + '">' + s[1] + '</option>').join('') + '<option value="other">Autre…</option></select></label><label class="o-field half"><span>Séparateur décimal</span><select class="o-in" id="cwDec"><option value=",">Virgule (1,5)</option><option value=".">Point (1.5)</option></select></label><label class="o-field half"><span>Ordre des dates</span><select class="o-in" id="cwDate"><option value="DMY">Jour/Mois/Année (France)</option><option value="MDY">Mois/Jour/Année (États-Unis)</option><option value="YMD">Année-Mois-Jour</option></select></label><label class="o-field half"><span>Ignorer les premières lignes</span><input class="o-in" id="cwSkip" type="number" min="0" value="0"></label><label class="o-field half"><span>Autre séparateur</span><input class="o-in" id="cwOther" maxlength="3"></label><label class="o-check"><input type="checkbox" id="cwHead" checked><span>La première ligne contient les titres (en gras, ligne figée)</span></label><label class="o-check"><input type="checkbox" id="cwText"><span>Tout importer comme du texte (garder les zéros en tête : codes postaux, références…)</span></label></div><div class="dlg-sec">Aperçu</div><div class="csv-prev"></div>';
    const prev = body.querySelector('.csv-prev');
    const read = () => { const x = (id) => body.querySelector('#' + id); o.enc = x('cwEnc').value; const sv = x('cwSep').value; o.sep = sv === 'tab' ? '\t' : sv === 'other' ? (x('cwOther').value || ';') : sv; o.dec = x('cwDec').value; o.thou = o.dec === ',' ? ' ' : ','; o.dateOrder = x('cwDate').value; o.skip = Math.max(0, +x('cwSkip').value || 0); o.header = x('cwHead').checked; o.allText = x('cwText').checked; };
    const render = () => {
      read(); text = TB.Data.decode(buf, o.enc).text;
      const rows = TB.Data.splitCsv(text.split(/\r?\n/).slice(0, 40 + o.skip).join('\n'), o.sep, '"').slice(o.skip, o.skip + 20);
      const W = Math.min(30, Math.max(0, ...rows.map((r) => r.length)));
      prev.innerHTML = '<table class="pv-table"><tr>' + Array.from({ length: W }, (_, j) => '<th>' + TB.colName(j) + '</th>').join('') + '</tr>' + rows.map((r, i) => '<tr>' + Array.from({ length: W }, (_, j) => { const v = r[j] == null ? '' : r[j]; const x = o.allText ? { v } : TB.Data.csvValue(v, { dec: o.dec, thou: o.thou, dateOrder: o.dateOrder }); const shown = x.v === null ? '' : typeof x.v === 'number' ? TB.Fmt.text(x.v, x.fmt || 'General') : String(x.v); return '<td' + (i === 0 && o.header ? ' style="font-weight:700"' : typeof x.v === 'number' ? ' style="text-align:right"' : '') + '>' + O.esc(shown) + '</td>'; }).join('') + '</tr>').join('') + '</table>';
    };
    const res = await O.dialog({ title: 'Importer « ' + name + ' »', wide: true, body, onOpen: (el) => { el.querySelector('#cwEnc').value = o.enc === 'utf-16be' ? 'utf-16le' : o.enc; el.querySelector('#cwSep').value = o.sep === '\t' ? 'tab' : SEPS.some((s) => s[0] === o.sep) ? o.sep : 'other'; el.querySelector('#cwDec').value = o.dec; el.querySelectorAll('select,input').forEach((x) => x.addEventListener('change', render)); el.querySelector('#cwOther').addEventListener('input', render); render(); }, buttons: [{ label: 'Annuler', value: null }, { label: opt.into ? 'Importer ici' : 'Ouvrir', value: 'ok', primary: true, onClick: () => { read(); } }] });
    if (res !== 'ok') return null;
    const types = []; if (o.allText) { const n = TB.Data.splitCsv(text.split(/\r?\n/)[o.skip] || '', o.sep, '"')[0] || []; n.forEach(() => types.push('text')); for (let i = 0; i < 200; i++) types.push('text'); }
    o.types = types;
    if (opt.into) return { text, o };
    return IO.csvBuild(text, o);
  };
  IO.writeCsv = function (wb, sh, o) {
    const e = sh.extent(); const lines = [];
    const sep = o.sep || ';';
    const loc = TB.loc.dec;
    for (let r = 0; r <= e.r; r++) {
      const row = [];
      for (let c = 0; c <= e.c; c++) {
        const v = sh.get(r, c); let t;
        if (v === null) t = '';
        else if (typeof v === 'number') { const nf = wb.styles.get(sh.styleAt(r, c)).nf; t = nf && TB.Fmt.isDate(nf) ? TB.Fmt.text(v, nf) : TB.numText(v, sep === ';' ? ',' : loc === ',' && sep !== ',' ? ',' : '.'); }
        else if (typeof v === 'boolean') t = TB.boolText(v);
        else if (v instanceof TB.Err) t = TB.errText(v);
        else t = String(v);
        if (t.indexOf(sep) >= 0 || /["\r\n]/.test(t) || /^\s|\s$/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
        row.push(t);
      }
      lines.push(row.join(sep));
    }
    return new Blob([(o.bom ? '﻿' : '') + lines.join('\r\n') + '\r\n'], { type: sep === '\t' ? 'text/tab-separated-values;charset=utf-8' : 'text/csv;charset=utf-8' });
  };

  /* ---------------- HTML ---------------- */
  IO.writeHtml = function (wb) {
    let h = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + O.esc(wb.props.title || 'Classeur') + '</title><style>body{font:14px Calibri,Carlito,Arial,sans-serif;margin:24px;color:#000}table{border-collapse:collapse;margin:8px 0 28px}td{border:1px solid #e1e4e8;padding:2px 6px;white-space:nowrap;vertical-align:bottom}h2{font:600 18px Calibri,Arial,sans-serif;margin:18px 0 6px}</style></head><body>';
    wb.sheets.forEach((sh) => {
      if (sh.hidden) return;
      const e = sh.extent(); if (e.r < 0) return;
      h += '<h2>' + O.esc(sh.name) + '</h2>' + TB.Clip.toHtml(wb, sh, { r1: 0, c1: 0, r2: e.r, c2: e.c }).replace(/^<html>.*?<body>/, '').replace(/<\/body><\/html>$/, '');
      sh.objs.filter((o) => o.type === 'chart').forEach((o) => { h += '<div style="margin:10px 0">' + TB.Chart.svg(wb, o.chart, o.w, o.h, sh) + '</div>'; });
    });
    return h + '<p style="color:#888;font-size:11px">Exporté par Tableur (Suite MAG)</p></body></html>';
  };
  IO.readHtml = function (html) {
    const d = TB.Clip.fromHtml(html); if (!d) throw new Error('Aucun tableau dans cette page');
    const wb = TB.newWorkbook(1), sh = wb.sheets[0];
    d.rows.forEach((row, i) => row.forEach((cell, j) => { if (!cell) return; let v = cell.v; if (typeof v === 'string' && !cell.raw) { const p = TB.parseInput(v); v = p.v; if (p.fmt) cell.st = Object.assign({}, cell.st || {}, { nf: p.fmt }); } wb.load(sh, i, j, v, cell.st ? wb.styles.add(cell.st) : undefined); }));
    sh.merges = d.merges || [];
    wb.finishLoad();
    return { wb, warnings: [] };
  };

  /* ---------------- .xls et .ods (SheetJS CE, Apache-2.0) ---------------- */
  IO.readSheetJS = async function (buf, kind) {
    if (!window.XLSX) await O.loadScript(O.vendor + 'xlsx.full.min.js');
    const X = window.XLSX;
    const book = X.read(buf, { type: 'array', cellFormula: true, cellStyles: true, cellNF: true, cellDates: false, sheetStubs: false });
    const wb = new TB.Workbook(); const warnings = [];
    book.SheetNames.forEach((n, si) => {
      const ws = book.Sheets[n]; const sh = wb.addSheetRaw(n.slice(0, 31));
      if (book.Workbook && book.Workbook.Sheets && book.Workbook.Sheets[si] && book.Workbook.Sheets[si].Hidden) sh.hidden = book.Workbook.Sheets[si].Hidden;
      Object.keys(ws).forEach((k) => {
        if (k[0] === '!') return; const a = TB.parseAddr(k); if (!a) return; const c = ws[k];
        let v = c.t === 'n' ? c.v : c.t === 'b' ? !!c.v : c.t === 'e' ? (TB.errOf(c.w || '') || TB.E.VALUE) : c.t === 'd' ? TB.fromJsDate(c.v) : c.v == null ? null : String(c.v);
        const st = {}; if (c.z && c.z !== 'General') st.nf = String(c.z);
        if (c.s) { const f = c.s.font || {}; if (f.bold) st.b = true; if (f.italic) st.i = true; const fill = c.s.fgColor || (c.s.fill && c.s.fill.fgColor); if (fill && fill.rgb && c.s.patternType === 'solid') st.bg = '#' + String(fill.rgb).slice(-6).toUpperCase(); }
        const sid = Object.keys(st).length ? wb.styles.add(st) : undefined;
        if (c.f) { let f = String(c.f); try { f = TB.Formula.write(TB.Formula.parse(f)); wb.loadFormula(sh, a.r, a.c, f, sid); if (v !== null && v !== undefined) TB._setVal(sh, a.r, a.c, v); } catch (e) { wb.load(sh, a.r, a.c, v, sid); } }
        else wb.load(sh, a.r, a.c, v, sid);
      });
      (ws['!merges'] || []).forEach((m) => sh.merges.push({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }));
      (ws['!cols'] || []).forEach((col, i) => { if (col && col.wpx) sh.colW[i] = Math.round(col.wpx); else if (col && col.wch) sh.colW[i] = Math.round(col.wch * 7 + 5); if (col && col.hidden) sh.hidC.add(i); });
      (ws['!rows'] || []).forEach((row, i) => { if (row && row.hpx) sh.rowH[i] = Math.round(row.hpx); else if (row && row.hpt) sh.rowH[i] = Math.round(row.hpt / 0.75); if (row && row.hidden) sh.hidR.add(i); });
    });
    if (book.Workbook && book.Workbook.Names) book.Workbook.Names.forEach((n) => { if (n.Name && n.Ref && !/^_xlnm/.test(n.Name)) wb.names.push({ n: n.Name, f: n.Ref.replace(/^=/, ''), sh: n.Sheet != null ? book.SheetNames[n.Sheet] : null }); });
    if (!wb.sheets.length) wb.addSheetRaw('Feuil1');
    warnings.push(kind === 'ods' ? 'Fichier OpenDocument : valeurs, formules, fusions et tailles reprises ; les mises en forme ne le sont qu\'en partie' : 'Ancien format .xls : mises en forme partiellement reprises (polices, couleurs de base)');
    wb.finishLoad();
    return { wb, warnings };
  };

  /** .ods : valeurs, formules (syntaxe OpenFormula produite par SheetJS), fusions, largeurs */
  IO.writeSheetJS = async function (wb, kind) {
    if (!window.XLSX) await O.loadScript(O.vendor + 'xlsx.full.min.js');
    const X = window.XLSX; const book = X.utils.book_new(); const warn = [];
    wb.sheets.forEach((sh) => {
      const ws = {}; const e = sh.extent();
      for (let r = 0; r <= e.r; r++) for (let c = 0; c <= e.c; c++) {
        const f = sh.formula(r, c); let v = sh.get(r, c);
        if (f && f.arrChild) continue;
        if (!f && (v === null || v === undefined)) continue;
        if (v && typeof v === 'object' && !(v instanceof TB.Err)) v = null;
        const st = wb.styles.get(sh.styleAt(r, c));
        const cell = v instanceof TB.Err ? { t: 'e', v: ({ '#NULL!': 0, '#DIV/0!': 7, '#VALUE!': 15, '#REF!': 23, '#NAME?': 29, '#NUM!': 36, '#N/A': 42 })[TB.errText(v)] || 42, w: TB.errText(v) } : typeof v === 'number' ? { t: 'n', v } : typeof v === 'boolean' ? { t: 'b', v } : v === null ? { t: 'z' } : { t: 's', v: String(v) };
        if (f) cell.f = TB.Formula.toFile(f.src).replace(/_xlfn\.(_xlws\.)?/g, '');
        if (st.nf) cell.z = st.nf;
        ws[TB.addr(r, c)] = cell;
      }
      ws['!ref'] = TB.rangeStr({ r1: 0, c1: 0, r2: Math.max(0, e.r), c2: Math.max(0, e.c) });
      if (sh.merges.length) ws['!merges'] = sh.merges.map((m) => ({ s: { r: m.r1, c: m.c1 }, e: { r: m.r2, c: m.c2 } }));
      const cols = []; for (let c = 0; c <= e.c; c++) cols.push(sh.colW[c] != null || sh.hidC.has(c) ? { wpx: sh.colW[c] != null ? sh.colW[c] : sh.defW, hidden: sh.hidC.has(c) } : {}); ws['!cols'] = cols;
      X.utils.book_append_sheet(book, ws, sh.name);
    });
    const out = X.write(book, { bookType: kind, type: 'array', compression: true });
    warn.push('OpenDocument : valeurs, formules, fusions et largeurs enregistrées ; pour garder toute la mise en forme, enregistrez aussi en .xlsx ou .magcalc');
    return { blob: new Blob([out], { type: 'application/vnd.oasis.opendocument.spreadsheet' }), warn };
  };

  /* ---------------- vignette ---------------- */
  TB.thumbnail = function (wb, W, H) {
    const sh = wb.cur; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    const k = 0.5; let yy = 0;
    x.font = '400 ' + (14.67 * k) + 'px ' + TB.fontCss('Calibri'); x.textBaseline = 'middle';
    for (let r = 0; yy < H; r++) {
      const h = sh.rowHeight(r) * k; if (!h) continue; let xx = 0;
      for (let cc = 0; xx < W; cc++) {
        const w = sh.colWidth(cc) * k; if (!w) continue;
        const st = wb.styles.get(sh.styleAt(r, cc));
        if (st.bg) { x.fillStyle = st.bg; x.fillRect(xx, yy, w, h); }
        x.strokeStyle = '#E6E8EB'; x.lineWidth = 0.5; x.strokeRect(xx + 0.25, yy + 0.25, w, h);
        const v = sh.get(r, cc);
        if (v !== null) { const t = TB.Fmt.format(v, st.nf).s; x.fillStyle = st.fc || '#000'; x.font = (st.b ? '700 ' : '400 ') + ((st.fs || 11) * 1.333 * k) + 'px ' + TB.fontCss(st.fn); x.save(); x.beginPath(); x.rect(xx, yy, w * 4, h); x.clip(); x.fillText(String(t), typeof v === 'number' ? xx + w - 2 - x.measureText(t).width : xx + 2, yy + h / 2); x.restore(); }
        xx += w;
        if (cc > 60) break;
      }
      yy += h; if (r > 200) break;
    }
    return c.toDataURL('image/jpeg', 0.7);
  };
})();
