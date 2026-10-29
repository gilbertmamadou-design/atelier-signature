/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-tableur/tb-json.js : ne pas modifier ici. */
/* Tableur — classeur ↔ JSON (contenu de workbook.json dans un fichier .magcalc, enregistrement automatique, copie de
   feuille). Format ouvert et lisible : cellules [ligne, colonne, valeur, formule, style, plage matricielle]. */
(function (G) {
  'use strict';
  const TB = G.Tableur;
  const J = TB.IOJ = {};
  J.VERSION = 1;
  const encV = (v) => v instanceof TB.Err ? { e: v.e } : v;
  const decV = (v) => v && typeof v === 'object' && v.e ? (TB.errOf(v.e) || TB.E.VALUE) : v;
  const pairs = (a) => { const out = []; a.forEach((v, i) => { if (v !== undefined && v !== null) out.push([i, v]); }); return out; };
  const mapList = (m) => Array.from(m.entries()).map(([k, v]) => { const p = TB.unkey(k); return [p.r, p.c, v]; });
  J.sheetToJson = function (wb, sh) {
    const cells = [];
    const ncol = Math.max(sh.vals.length, sh.sty.length);
    for (let c = 0; c < ncol; c++) {
      const vc = sh.vals[c] || [], sc = sh.sty[c] || [];
      const n = Math.max(vc.length, sc.length);
      for (let r = 0; r < n; r++) {
        const k = TB.key(r, c), f = sh.fml.get(k), s = sc[r];
        if (sh.spillOwner.has(k)) { if (s !== undefined) cells.push([r, c, null, 0, s]); continue; }
        const v = vc[r];
        if ((v === undefined || v === null) && !f && s === undefined) continue;
        const row = [r, c, v === undefined ? null : encV(v)];
        if (f || s !== undefined || (f && f.arr)) { row.push(f ? f.src : 0); if (s !== undefined || (f && f.arr)) row.push(s === undefined ? null : s); if (f && f.arr) row.push([f.arr.r1, f.arr.c1, f.arr.r2, f.arr.c2]); }
        cells.push(row);
      }
    }
    // formules sans valeur stockée (colonnes de formules au-delà des valeurs)
    sh.fml.forEach((f) => { if (!(sh.vals[f.c] && f.r < sh.vals[f.c].length) && !(sh.sty[f.c] && f.r < sh.sty[f.c].length)) { const row = [f.r, f.c, null, f.src]; if (f.arr) row.push(null, [f.arr.r1, f.arr.c1, f.arr.r2, f.arr.c2]); cells.push(row); } });
    const o = {
      id: sh.id, name: sh.name, tab: sh.tab || null, hidden: sh.hidden || 0, zoom: sh.zoom || 1, grid: sh.grid !== false, heads: sh.heads !== false, defW: sh.defW, defH: sh.defH,
      colW: pairs(sh.colW), rowH: pairs(sh.rowH), hidC: Array.from(sh.hidC), hidR: Array.from(sh.hidR), colSt: pairs(sh.colSt), rowSt: pairs(sh.rowSt), outR: pairs(sh.outR), outC: pairs(sh.outC),
      cells, merges: sh.merges, freeze: sh.freeze, cf: sh.cf, dv: sh.dv, af: sh.af, tables: sh.tables, objs: sh.objs, sparks: sh.sparks || [],
      notes: mapList(sh.notes), links: mapList(sh.links), threads: mapList(sh.threads), protect: sh.protect, print: sh.print, sel: sh.sel, showF: !!sh.showF, rtl: !!sh.rtl, collapsedR: sh.collapsedR || null, pivots: sh.pivots || []
    };
    return JSON.parse(JSON.stringify(o));
  };
  J.toJson = function (wb) {
    return {
      format: 'magcalc', version: J.VERSION, app: 'Tableur (Suite MAG)',
      props: wb.props, settings: wb.settings, styles: wb.styles.list, names: wb.names, lists: wb.lists || [], protect: wb.protect || null,
      active: wb.active, sheets: wb.sheets.map((s) => J.sheetToJson(wb, s)), media: Object.keys(wb.media || {})
    };
  };
  const unpair = (arr, l) => { (l || []).forEach(([i, v]) => { arr[i] = v; }); };
  J.sheetFromJson = function (wb, o, at) {
    const sh = wb.addSheetRaw(o.name || wb.uniqueSheetName('Feuil'), at, o.id && !wb.sheets.some((s) => s.id === o.id) ? o.id : undefined);
    Object.assign(sh, { tab: o.tab || null, hidden: o.hidden || 0, zoom: o.zoom || 1, grid: o.grid !== false, heads: o.heads !== false, defW: o.defW || 64, defH: o.defH || 20, showF: !!o.showF, rtl: !!o.rtl });
    unpair(sh.colW, o.colW); unpair(sh.rowH, o.rowH); unpair(sh.colSt, o.colSt); unpair(sh.rowSt, o.rowSt); unpair(sh.outR, o.outR); unpair(sh.outC, o.outC);
    (o.hidC || []).forEach((c) => sh.hidC.add(c)); (o.hidR || []).forEach((r) => sh.hidR.add(r));
    const n = wb.styles.list.length;
    wb.suspend++;
    try {
      for (const cell of o.cells || []) {
        const [r, c, v, f, s, a] = cell;
        if (f) TB._addFormula(wb, sh, r, c, f, a ? { r1: a[0], c1: a[1], r2: a[2], c2: a[3] } : null);
        if (v !== null && v !== undefined) TB._setVal(sh, r, c, decV(v));
        if (s !== undefined && s !== null && s < n) { let col = sh.sty[c]; if (!col) col = sh.sty[c] = []; col[r] = s; }
      }
    } finally { wb.suspend--; }
    sh.merges = o.merges || []; sh.freeze = o.freeze || { r: 0, c: 0 }; sh.cf = o.cf || []; sh.dv = o.dv || []; sh.af = o.af || null; sh.tables = o.tables || []; sh.objs = o.objs || []; sh.sparks = o.sparks || [];
    (o.notes || []).forEach(([r, c, v]) => sh.notes.set(TB.key(r, c), v)); (o.links || []).forEach(([r, c, v]) => sh.links.set(TB.key(r, c), v)); (o.threads || []).forEach(([r, c, v]) => sh.threads.set(TB.key(r, c), v));
    sh.protect = o.protect || null; sh.print = o.print || {}; sh.sel = o.sel || null; sh.collapsedR = o.collapsedR || null; sh.pivots = o.pivots || [];
    sh._ext = null;
    return sh;
  };
  J.fromJson = function (o, media) {
    if (!o || o.format !== 'magcalc') throw new Error('Ce fichier n\'est pas un classeur Tableur (.magcalc)');
    const wb = new TB.Workbook();
    wb.props = Object.assign(wb.props, o.props || {}); wb.settings = Object.assign(wb.settings, o.settings || {});
    wb.styles = TB.StylePool(o.styles && o.styles.length ? o.styles : null);
    wb.names = o.names || []; wb.lists = o.lists || []; wb.protect = o.protect || null; wb.media = media || {};
    (o.sheets || []).forEach((s) => J.sheetFromJson(wb, s));
    if (!wb.sheets.length) wb.addSheetRaw('Feuil1');
    wb.active = Math.min(Math.max(0, o.active || 0), wb.sheets.length - 1);
    if (wb.sheets[wb.active].hidden) wb.active = wb.sheets.findIndex((s) => !s.hidden);
    wb.finishLoad();
    return wb;
  };
})(typeof window !== 'undefined' ? window : globalThis);
