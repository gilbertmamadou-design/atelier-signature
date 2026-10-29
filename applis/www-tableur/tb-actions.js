/* Tableur — actions sur les données : tri rapide, filtres automatiques, tableaux (mise sous forme de tableau, options,
   ligne Total, conversion), plan (grouper), audit (antécédents, dépendants), sélection spéciale, paramètres régionaux,
   thème, mise en page, TCD, remplissage instantané, données non valides. */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur, P = TB.Formula;
  const A = window.TableurApp = window.TableurApp || {};
  const C = A.cmd = A.cmd || {};
  const KEY = TB.key, MAXR = TB.MAX_ROWS, MAXC = TB.MAX_COLS;
  const wb = () => A.wb, sh = () => A.wb.cur, G = () => A.grid;

  /* ---------------- tri et filtres ---------------- */
  /** zone de données autour de la sélection (avec détection de la ligne d'en-tête) */
  A.dataArea = function () {
    const s = sh(), Gr = G(), g = Gr.range();
    if (g.r1 !== g.r2 || g.c1 !== g.c2) { const b = A.bounded(g); return { g: b, header: guessHeader(s, b) }; }
    const t = s.tableAt(g.r1, g.c1); if (t) return { g: { r1: t.r1, c1: t.c1, r2: t.r2 - (t.totals ? 1 : 0), c2: t.c2 }, header: t.header !== false, table: t };
    if (s.af && TB.inRange(Object.assign({}, s.af, { r2: TB.Data.dataEnd(s, s.af) }), g.r1, g.c1)) return { g: Object.assign({}, s.af, { r2: TB.Data.dataEnd(s, s.af) }), header: true, af: true };
    const reg = Gr.region(g.r1, g.c1); if (!reg) return null;
    return { g: reg, header: guessHeader(s, reg) };
  };
  function guessHeader(s, g) {
    if (g.r2 <= g.r1) return false;
    let txt = 0, numBelow = 0, n = 0;
    for (let c = g.c1; c <= g.c2; c++) { const a = s.get(g.r1, c), b = s.get(g.r1 + 1, c); n++; if (typeof a === 'string') txt++; if (typeof b === 'number' || (typeof a === 'string' && typeof b === 'string' && wb().styles.get(s.styleAt(g.r1, c)).b && !wb().styles.get(s.styleAt(g.r1 + 1, c)).b)) numBelow++; }
    return txt === n && (numBelow > 0 || n === 1 || g.r2 - g.r1 > 1);
  }
  A.guessHeader = guessHeader;
  C.quickSort = function (desc) {
    if (!A.guard('sort')) return;
    const da = A.dataArea(); if (!da) { O.toast('Sélectionnez une cellule dans les données à trier', { bad: true }); return; }
    const c = G().sel.c;
    A.tx(desc ? 'Trier de Z à A' : 'Trier de A à Z', () => TB.Data.sort(wb(), sh(), da.g, [{ c: Math.max(da.g.c1, Math.min(da.g.c2, c)), desc }], { header: da.header }));
    if (sh().af && da.af) A.tx('Tri', () => wb().setProp(sh(), 'af', Object.assign({}, sh().af, { sort: { c, o: desc ? -1 : 1 } })));
  };
  C.sortByColor = function () {
    const da = A.dataArea(); if (!da) return; const c = G().sel.c; const bg = wb().styles.get(sh().styleAt(G().sel.r, c)).bg || null;
    A.tx('Trier par couleur', () => TB.Data.sort(wb(), sh(), da.g, [{ c, by: 'bg', color: bg }], { header: da.header }));
  };
  C.toggleFilter = function () {
    const s = sh();
    if (s.tables.length) { const t = s.tableAt(G().sel.r, G().sel.c); if (t) { C.tableSet({ filter: t.filter === false }); return; } }
    if (s.af) { A.tx('Supprimer le filtre', () => { (s.afHid || new Set()).forEach((r) => { if (s.hidR.has(r)) wb().setProp(s.hidR, r, false); }); wb().setProp(s, 'afHid', new Set()); wb().setProp(s, 'af', null); }); return; }
    const da = A.dataArea(); if (!da) { O.toast('Sélectionnez une cellule dans un tableau de données', { bad: true }); return; }
    A.tx('Filtrer', () => wb().setProp(s, 'af', { r1: da.g.r1, c1: da.g.c1, r2: da.g.r2, c2: da.g.c2, cols: {} }));
    O.toast('Filtre activé : cliquez sur les flèches des en-têtes', { ms: 2000 });
  };
  C.setColumnFilter = function (fb, crit) {
    const s = sh();
    A.tx('Filtrer', () => {
      if (fb.kind === 'table') { const t = fb.t; const af = Object.assign({}, t.af || {}); if (crit) af[fb.c - t.c1] = crit; else delete af[fb.c - t.c1]; const nt = Object.assign({}, t, { af }); A.replaceTable(s, t, nt); const cols = {}; Object.keys(af).forEach((k) => { cols[t.c1 + +k] = af[k]; }); TB.Data.applyFilter(wb(), s, { r1: t.r1, c1: t.c1, r2: t.r2 - (t.totals ? 1 : 0), c2: t.c2 }, cols); return; }
      const cols = Object.assign({}, s.af.cols || {}); if (crit) cols[fb.c] = crit; else delete cols[fb.c];
      const area = Object.assign({}, s.af, { r2: TB.Data.dataEnd(s, s.af) });
      wb().setProp(s, 'af', Object.assign({}, area, { cols }));
      const n = TB.Data.applyFilter(wb(), s, area, cols);
      setTimeout(() => O.toast((area.r2 - area.r1 - n) + ' enregistrement(s) sur ' + (area.r2 - area.r1) + ' affiché(s)', { ms: 2200 }), 50);
    });
  };
  C.sortColumn = function (fb, desc) {
    const s = sh();
    const area = fb.kind === 'table' ? { r1: fb.t.r1, c1: fb.t.c1, r2: fb.t.r2 - (fb.t.totals ? 1 : 0), c2: fb.t.c2 } : Object.assign({}, s.af, { r2: TB.Data.dataEnd(s, s.af) });
    A.tx('Trier', () => { TB.Data.sort(wb(), s, area, [{ c: fb.c, desc }], { header: true }); if (fb.kind === 'table') A.replaceTable(s, fb.t, Object.assign({}, fb.t, { sort: { c: fb.c, o: desc ? -1 : 1 } })); else wb().setProp(s, 'af', Object.assign({}, s.af, { sort: { c: fb.c, o: desc ? -1 : 1 } })); });
  };
  C.clearFilters = function () {
    const s = sh();
    A.tx('Effacer les filtres', () => {
      (s.afHid || new Set()).forEach((r) => { if (s.hidR.has(r)) wb().setProp(s.hidR, r, false); }); wb().setProp(s, 'afHid', new Set());
      if (s.af) wb().setProp(s, 'af', Object.assign({}, s.af, { cols: {} }));
      s.tables.forEach((t) => { if (t.af && Object.keys(t.af).length) A.replaceTable(s, t, Object.assign({}, t, { af: {} })); });
    });
  };
  C.reapplyFilter = function () {
    const s = sh();
    A.tx('Réappliquer', () => {
      if (s.af) { const area = Object.assign({}, s.af, { r2: TB.Data.dataEnd(s, s.af) }); wb().setProp(s, 'af', Object.assign({}, area, { cols: s.af.cols })); TB.Data.applyFilter(wb(), s, area, s.af.cols || {}); }
      s.tables.forEach((t) => { if (t.af) { const cols = {}; Object.keys(t.af).forEach((k) => { cols[t.c1 + +k] = t.af[k]; }); TB.Data.applyFilter(wb(), s, { r1: t.r1, c1: t.c1, r2: t.r2 - (t.totals ? 1 : 0), c2: t.c2 }, cols); } });
    });
  };
  C.filterBy = function (by) {
    const s = sh(), r = G().sel.r, c = G().sel.c;
    if (!s.af && !s.tableAt(r, c)) C.toggleFilter();
    const t = s.tableAt(r, c); const fb = t ? { kind: 'table', t, c } : { kind: 'af', c };
    if (by === 'bg') C.setColumnFilter(fb, { type: 'color', bg: wb().styles.get(s.styleAt(r, c)).bg || null });
    else C.setColumnFilter(fb, { type: 'values', vals: [wb().displayText(s, r, c)], blank: s.get(r, c) === null });
  };

  /* ---------------- tableaux ---------------- */
  A.tableName = function () { let i = 1; while (wb().table('Tableau' + i)) i++; return 'Tableau' + i; };
  C.makeTable = function (g, header, style) {
    const s = sh();
    if (s.tables.some((t) => TB.intersect(t, g))) { O.toast('Un tableau ne peut pas en chevaucher un autre', { bad: true }); return; }
    if (s.merges.some((m) => TB.intersect(m, g))) { O.toast('Les cellules fusionnées ne sont pas permises dans un tableau', { bad: true }); return; }
    A.tx('Mettre sous forme de tableau', () => {
      let gg = Object.assign({}, g);
      if (!header) { wb().shiftCells(s, 'r', g.r1, 1); gg.r2++; }
      const cols = []; const seen = {};
      for (let c = gg.c1; c <= gg.c2; c++) { let n = header ? s.get(gg.r1, c) : null; n = n == null || n === '' ? 'Colonne' + (c - gg.c1 + 1) : TB.Fmt.text(n, 'General'); let k = n, i = 2; while (seen[k.toLowerCase()]) k = n + (i++); seen[k.toLowerCase()] = 1; cols.push({ name: k }); if (!header || s.get(gg.r1, c) !== k) wb().setCell(s, gg.r1, c, Object.assign({}, wb().snap(s, gg.r1, c) || {}, { v: k })); }
      const t = { name: A.tableName(), r1: gg.r1, c1: gg.c1, r2: gg.r2, c2: gg.c2, header: true, totals: false, style: style || 'TableStyleMedium2', bandRows: true, cols, af: {} };
      wb().setProp(s, 'tables', s.tables.concat([t]), true);
      if (s.af && TB.intersect(s.af, gg)) wb().setProp(s, 'af', null);
    });
    O.toast('Tableau créé : onglet « Création de tableau »', { ms: 2000 });
  };
  C.tableSet = function (patch) {
    const s = sh(), t = A.curTable(); if (!t) return;
    A.tx('Tableau', () => {
      const nt = Object.assign({}, t, patch);
      if (patch.totals !== undefined && patch.totals !== !!t.totals) {
        if (patch.totals) {
          // ligne Total : une ligne de plus sous le tableau
          if (s.get(t.r2 + 1, t.c1) !== null || s.fml.has(KEY(t.r2 + 1, t.c1))) wb().shiftCells(s, 'r', t.r2 + 1, 1);
          nt.r2 = t.r2 + 1;
          const lastNum = (() => { for (let c = t.c2; c >= t.c1; c--) { const v = s.get(t.r2, c); if (typeof v === 'number') return c; } return t.c2; })();
          for (let c = t.c1; c <= t.c2; c++) {
            const col = t.cols[c - t.c1];
            if (c === t.c1) wb().setCell(s, nt.r2, c, { v: 'Total' });
            else if (c === lastNum) { wb().setCell(s, nt.r2, c, { f: 'SUBTOTAL(109,' + t.name + '[' + col.name.replace(/([\[\]'#@])/g, "'$1") + '])', s: s.styleAt(t.r2, c) || undefined }); nt.cols = nt.cols.map((x, i) => i === c - t.c1 ? Object.assign({}, x, { fn: 'sum' }) : x); }
          }
        } else { for (let c = t.c1; c <= t.c2; c++) wb().setCell(s, t.r2, c, null); nt.r2 = t.r2 - 1; }
      }
      if (patch.header === false && t.header !== false) { /* en-tête masqué : les noms restent dans les colonnes */ }
      if (patch.filter === false) { const af = {}; nt.af = af; (s.afHid || new Set()).forEach((r) => { if (r > t.r1 && r <= t.r2 && s.hidR.has(r)) wb().setProp(s.hidR, r, false); }); }
      A.replaceTable(s, t, nt);
    });
  };
  C.renameTable = function (name) {
    const s = sh(), t = A.curTable(); if (!t || !name || name === t.name) return;
    if (!/^[A-Za-z_\\À-ɏ][\w.À-ɏ]*$/.test(name) || /^[A-Za-z]{1,3}\d+$/.test(name) || (wb().table(name) && wb().table(name).t !== t) || wb().findName(name)) { O.toast('Nom de tableau non valide ou déjà utilisé', { bad: true }); A.refreshUi(); return; }
    A.tx('Nom du tableau', () => {
      const old = t.name; A.replaceTable(s, t, Object.assign({}, t, { name }));
      wb().sheets.forEach((s2) => { const ch = []; s2.fml.forEach((f) => { const a = P.renameTable(f.ast, old, name); if (a !== f.ast) ch.push([f.r, f.c, Object.assign({}, wb().snap(s2, f.r, f.c), { f: P.write(a) })]); }); ch.forEach(([r, c, o]) => wb().setCell(s2, r, c, o)); });
    });
  };
  C.tableToRange = async function () {
    const s = sh(), t = A.curTable(); if (!t) return;
    if (!(await O.confirm('Convertir en plage', 'Le tableau devient une plage normale : les références structurées des formules sont remplacées par des adresses ; la mise en forme est conservée.', 'Convertir'))) return;
    A.tx('Convertir en plage', () => {
      // appliquer la mise en forme du style aux cellules
      const list = [];
      for (let r = t.r1; r <= t.r2; r++) for (let c = t.c1; c <= t.c2; c++) { const ts = TB.TableStyle.cell(wb(), s, t, r, c) || {}; const o = wb().snap(s, r, c) || {}; const base = wb().styles.get(o.s !== undefined ? o.s : s.styleAt(r, c)); o.s = wb().styles.add(Object.assign({}, ts, base)); list.push([r, c, o]); }
      wb().setCells(s, list);
      // références structurées → adresses
      wb().sheets.forEach((s2) => { const ch = []; s2.fml.forEach((f) => { let hitT = false; const a = P.map(f.ast, (n) => { if (n.t === 'sref' && (n.tbl ? n.tbl.toLowerCase() === t.name.toLowerCase() : s2 === s && TB.inRange(t, f.r, f.c))) { const g = wb().resolveSref(n, f); if (g && !(g instanceof TB.Err)) { hitT = true; const o = { t: g.r1 === g.r2 && g.c1 === g.c2 ? 'ref' : 'area' }; if (o.t === 'ref') Object.assign(o, { r: g.r1, c: g.c1, ra: true, ca: true }); else Object.assign(o, { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2, ra1: true, ca1: true, ra2: true, ca2: true }); if (g.sh !== s2) o.sh = g.sh.name; if (n.spec.items.indexOf('#This Row') >= 0 && o.t === 'ref') { o.ra = false; o.ca = false; } return o; } } }); if (hitT) ch.push([f.r, f.c, Object.assign({}, wb().snap(s2, f.r, f.c), { f: P.write(a) })]); }); ch.forEach(([r, c, o]) => wb().setCell(s2, r, c, o)); });
      wb().setProp(s, 'tables', s.tables.filter((x) => x !== t), true);
    });
  };

  /* ---------------- plan ---------------- */
  C.group = function (d) {
    const s = sh(), g = G().range();
    const rows = g.c1 === 0 && g.c2 >= MAXC - 1 || (!(g.r1 === 0 && g.r2 >= MAXR - 1) && g.r2 > g.r1) || (g.r1 === g.r2 && g.c1 === g.c2);
    A.tx(d > 0 ? 'Grouper' : 'Dissocier', () => { if (rows) TB.Data.group(wb(), s, 'r', g.r1, Math.min(g.r2, g.r1 + 100000), d); else TB.Data.group(wb(), s, 'c', g.c1, g.c2, d); });
  };
  C.clearOutline = function () { const s = sh(); A.tx('Effacer le plan', () => { s.outR.forEach((v, i) => wb().setProp(s.outR, i, undefined)); s.outC.forEach((v, i) => wb().setProp(s.outC, i, undefined)); wb().setProp(s, 'collapsedR', null); }); };
  A.outlineClick = function (o) {
    const s = sh();
    if (o.kind === 'levelR') A.tx('Plan', () => TB.Data.showLevel(wb(), s, 'r', o.lv));
    else if (o.kind === 'levelC') A.tx('Plan', () => TB.Data.showLevel(wb(), s, 'c', o.lv));
    else if (o.kind === 'toggleR') A.tx('Plan', () => TB.Data.toggleGroup(wb(), s, 'r', o.r, o.coll || o.L));
    else if (o.kind === 'toggleC') A.tx('Plan', () => TB.Data.toggleGroup(wb(), s, 'c', o.c, o.L));
  };

  /* ---------------- audit ---------------- */
  C.trace = function (kind) {
    const Gr = G(), s = sh();
    if (kind === 'none') { Gr.arrows = []; Gr.draw(); return; }
    const r = Gr.sel.r, c = Gr.sel.c;
    if (kind === 'prec') {
      const f = s.fml.get(KEY(r, c)); if (!f) { O.toast('La cellule active ne contient pas de formule', { bad: true }); return; }
      let n = 0; (f.deps || []).forEach((g) => { if (g.sh === s) { Gr.arrows.push({ sh: s, from: { r: g.r1, c: g.c1 }, to: { r, c }, range: g.r1 !== g.r2 || g.c1 !== g.c2 ? g : null }); n++; } else { Gr.arrows.push({ sh: s, from: { r, c: Math.max(0, c - 2) }, to: { r, c }, ext: g.sh.name }); n++; } });
      O.toast(n ? n + ' antécédent(s)' + ((f.deps || []).some((g) => g.sh !== s) ? ' (dont dans d\'autres feuilles)' : '') : 'Aucun antécédent', { ms: 1800 });
    } else {
      const set = wb().dependents(s, r, c); let n = 0; set.forEach((f) => { if (f.sh === s) { Gr.arrows.push({ sh: s, from: { r, c }, to: { r: f.r, c: f.c } }); n++; } });
      O.toast(set.size ? set.size + ' dépendant(s)' + (n < set.size ? ' (dont dans d\'autres feuilles)' : '') : 'Aucune formule ne dépend de cette cellule', { ms: 1800 });
    }
    Gr.draw();
  };
  C.goPrecedent = function () { const s = sh(), f = s.fml.get(KEY(G().sel.r, G().sel.c)); if (!f || !f.deps || !f.deps.length) return; const g = f.deps[0]; if (g.sh !== s) A.showSheet(g.sh); G().setRange({ r1: g.r1, c1: g.c1, r2: Math.min(g.r2, g.r1 + 100000), c2: g.c2 }); };
  C.circleInvalid = function () {
    const s = sh(), Gr = G(); Gr.arrows = Gr.arrows.filter((a) => !a.err); let n = 0;
    for (const d of s.dv) for (const g0 of d.ranges) { const g = A.bounded(g0, s); for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const v = s.get(r, c); if (v !== null && !A.dvCheck(s, Object.assign({ _g: g0 }, d), r, c, v)) { Gr.arrows.push({ sh: s, from: { r, c }, to: { r, c }, err: true, range: { r1: r, c1: c, r2: r, c2: c } }); n++; } } }
    Gr.draw(); O.toast(n ? n + ' cellule(s) non valide(s) entourée(s)' : 'Aucune donnée non valide', { ms: 2200 });
  };
  /** sélection spéciale : formules, notes, MFC, constantes, validation, vides, erreurs */
  A.selectSpecial = function (kind, opt) {
    const s = sh(), Gr = G(); const out = [];
    const base = Gr.sel.ranges.length === 1 && TB.rangeSize(Gr.range()) > 1 ? A.bounded(Gr.range()) : s.used();
    const add = (r, c) => out.push({ r1: r, c1: c, r2: r, c2: c });
    if (kind === 'formulas') s.fml.forEach((f) => { if (TB.inRange(base, f.r, f.c)) { const v = s.get(f.r, f.c); if (!opt || (opt.num && typeof v === 'number') || (opt.text && typeof v === 'string') || (opt.bool && typeof v === 'boolean') || (opt.err && v instanceof TB.Err)) add(f.r, f.c); } });
    else if (kind === 'notes') { [s.notes, s.threads].forEach((m) => m.forEach((v, k) => { const p = TB.unkey(k); add(p.r, p.c); })); }
    else if (kind === 'cf') s.cf.forEach((x) => x.ranges.forEach((g) => out.push(Object.assign({}, g))));
    else if (kind === 'dv') s.dv.forEach((x) => x.ranges.forEach((g) => out.push(Object.assign({}, g))));
    else if (kind === 'constants' || kind === 'blanks' || kind === 'errors') { for (let r = base.r1; r <= base.r2 && out.length < 20000; r++) for (let c = base.c1; c <= base.c2; c++) { const v = s.get(r, c), f = s.fml.has(KEY(r, c)); if (kind === 'constants' && v !== null && !f && !s.spillOwner.has(KEY(r, c))) add(r, c); if (kind === 'blanks' && v === null && !f) add(r, c); if (kind === 'errors' && v instanceof TB.Err) add(r, c); } }
    if (!out.length) { O.toast('Aucune cellule trouvée', { ms: 1600 }); return; }
    const merged = out.slice(0, 5000);
    Gr.sel = { r: merged[0].r1, c: merged[0].c1, ranges: merged, anchor: { r: merged[0].r1, c: merged[0].c1 }, ext: null };
    Gr.scrollTo(merged[0].r1, merged[0].c1); Gr.draw(); A.onSelect();
    O.toast(out.length + ' cellule(s) ou plage(s) sélectionnée(s)', { ms: 1600 });
  };

  /* ---------------- paramètres régionaux, thème ---------------- */
  A.setLocale = function (o) {
    TB.setLocale(o); A.settings.sep = TB.loc.sep; A.settings.fn = TB.loc.fn; A.saveSettings();
    TB.clearFmtCache(); TB.clearWidthCache();
    // recalcul : TEXTE(), concaténations dépendent des séparateurs
    wb().recalcAll(); A.changed();
    O.toast(o.fn ? (TB.loc.fn === 'fr' ? 'Noms des fonctions en français (SOMME, SI…)' : 'Noms des fonctions en anglais (SUM, IF…)') : (TB.loc.sep === 'fr' ? 'Séparateur « ; » et virgule décimale' : 'Séparateur « , » et point décimal'), { ms: 2000 });
  };
  C.setTheme = function (k) { A.tx('Couleurs du classeur', () => { wb().setProp(wb().settings, 'theme', k); if (wb().themeColors) wb().setProp(wb(), 'themeColors', null); }); };

  /* ---------------- mise en page ---------------- */
  C.printSet = function (patch) { const s = sh(); A.tx('Mise en page', () => wb().setProp(s, 'print', Object.assign({}, s.print, patch))); };
  C.margins = function (k) { const M = { normal: { t: 1.9, b: 1.9, l: 1.8, r: 1.8, h: 0.8, f: 0.8 }, wide: { t: 2.5, b: 2.5, l: 2.5, r: 2.5, h: 1.3, f: 1.3 }, narrow: { t: 1.9, b: 1.9, l: 0.6, r: 0.6, h: 0.8, f: 0.8 } }; C.printSet({ margins: M[k] }); };

  /* ---------------- TCD, remplissage instantané ---------------- */
  C.refreshPivots = function () { let n = 0; A.tx('Actualiser', () => { n = TB.Pivot.refresh(wb()); }); O.toast(n ? n + ' tableau(x) croisé(s) dynamique(s) actualisé(s)' : 'Aucun tableau croisé dynamique à actualiser', { ms: 1800 }); };
  C.flashFill = function () {
    const s = sh(), Gr = G(); const c = Gr.sel.c;
    // exemples : cellules déjà remplies de la colonne, au-dessus ; sources : colonnes voisines remplies
    const reg = Gr.region(Gr.sel.r, c > 0 ? c - 1 : c) || Gr.region(Gr.sel.r, c);
    if (!reg) { O.toast('Remplissage instantané : tapez un ou deux exemples à côté des données', { bad: true }); return; }
    const srcCols = []; for (let cc = reg.c1; cc <= reg.c2; cc++) if (cc !== c) srcCols.push(cc);
    let r0 = reg.r1; if (A.guessHeader(s, reg)) r0++;
    const ex = [], todo = [];
    for (let r = r0; r <= reg.r2; r++) { const v = s.get(r, c); const src = srcCols.map((cc) => { const x = s.get(r, cc); return x === null ? null : TB.Fmt.text(x, wb().styles.get(s.styleAt(r, cc)).nf); }); if (v !== null && v !== '') ex.push({ src, out: String(v) }); else if (src.some((x) => x !== null)) todo.push([r, src]); }
    if (!ex.length) { O.toast('Tapez d\'abord un exemple dans la colonne', { bad: true }); return; }
    const res = TB.Data.flashFill(ex, todo.map((x) => x[1]));
    if (!res) { O.toast('Remplissage instantané : aucun modèle reconnu. Ajoutez un autre exemple.', { bad: true }); return; }
    A.tx('Remplissage instantané', () => wb().setCells(s, todo.map(([r], i) => [r, c, res[i] == null ? null : { v: res[i] }])));
    O.toast('Remplissage instantané : ' + todo.length + ' cellule(s) remplie(s)', { ms: 2000 });
  };
})();
