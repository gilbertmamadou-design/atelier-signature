/* Tableur — moteur : classeur, feuilles (stockage par colonnes, adapté aux grandes feuilles), évaluation des formules,
   graphe de dépendances (cellules, plages, colonnes entières), recalcul ordonné sans récursion profonde, références
   circulaires (calcul itératif facultatif), formules matricielles dynamiques (propagation #SPILL!), noms définis,
   tableaux (références structurées), journal d'annulation (annuler / rétablir illimité, par différences). */
(function (G) {
  'use strict';
  const TB = G.Tableur, P = TB.Formula, E = TB.E;
  const KEY = TB.key;

  /* ---------------- valeurs de calcul ---------------- */
  const MISSING = TB.MISSING = { missing: true, toString: () => '' };
  class Ref {
    constructor(sh, r1, c1, r2, c2) { this.sh = sh; this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2; }
    get h() { return this.r2 - this.r1 + 1; }
    get w() { return this.c2 - this.c1 + 1; }
    single() { return this.r1 === this.r2 && this.c1 === this.c2; }
    v(i, j) { const col = this.sh.vals[this.c1 + j]; const x = col ? col[this.r1 + i] : undefined; return x === undefined ? null : x; }
    /** cellules non vides : fn(valeur, r, c) ; renvoie false pour arrêter */
    each(fn) {
      const sh = this.sh;
      for (let c = this.c1; c <= this.c2; c++) {
        const col = sh.vals[c]; if (!col) continue;
        const end = Math.min(this.r2, col.length - 1);
        for (let r = this.r1; r <= end; r++) { const x = col[r]; if (x !== undefined && x !== null) { if (fn(x, r, c) === false) return; } }
      }
    }
    /** bornes utiles (une colonne entière s'arrête à la dernière cellule remplie) */
    trimmed() { const ext = this.sh.extent(); return new Ref(this.sh, this.r1, this.c1, Math.max(this.r1, Math.min(this.r2, ext.r)), Math.max(this.c1, Math.min(this.c2, ext.c))); }
    toArr(blankZero) { const R = this.trimmedFull(), out = []; for (let i = 0; i < R.h; i++) { const row = []; for (let j = 0; j < R.w; j++) { const x = R.v(i, j); row.push(x == null && blankZero ? 0 : x); } out.push(row); } return new Arr(out); }
    trimmedFull() { return (this.h > 100000 || this.w > 2000) ? this.trimmed() : this; }
    get key() { return this.sh.id + '!' + this.r1 + ',' + this.c1 + ':' + this.r2 + ',' + this.c2; }
  }
  class Ref3 { constructor(list) { this.list = list; } each(fn) { for (const r of this.list) { let stop = false; r.each((x, a, b) => { if (fn(x, a, b) === false) { stop = true; return false; } }); if (stop) return; } } }
  class Arr {
    constructor(d) { this.d = d; this.h = d.length; this.w = d.length ? d[0].length : 0; }
    v(i, j) { const r = this.d[i]; const x = r ? r[j] : undefined; return x === undefined ? null : x; }
    each(fn) { for (let i = 0; i < this.h; i++) for (let j = 0; j < this.w; j++) { const x = this.d[i][j]; if (x !== undefined && x !== null && fn(x, i, j) === false) return; } }
    single() { return this.h === 1 && this.w === 1; }
  }
  class Lambda { constructor(p, body, env) { this.p = p; this.body = body; this.env = env; } }
  TB.Ref = Ref; TB.Ref3 = Ref3; TB.Arr = Arr; TB.Lambda = Lambda;
  TB.isRef = (v) => v instanceof Ref; TB.isArr = (v) => v instanceof Arr; TB.isMulti = (v) => (v instanceof Ref && !v.single()) || (v instanceof Arr && !v.single()) || v instanceof Ref3;

  /* ---------------- feuille ---------------- */
  let SID = 1;
  class Sheet {
    constructor(wb, name, id) {
      this.wb = wb; this.id = id || 's' + (SID++); this.name = name;
      this.vals = []; this.sty = []; this.fml = new Map(); this.fcols = new Map();
      this.colW = []; this.rowH = []; this.hidC = new Set(); this.hidR = new Set(); this.colSt = []; this.rowSt = [];
      this.merges = []; this.freeze = { r: 0, c: 0 }; this.cf = []; this.dv = []; this.af = null; this.tables = []; this.objs = [];
      this.notes = new Map(); this.links = new Map(); this.threads = new Map();
      this.protect = null; this.print = {}; this.outR = []; this.outC = []; this.tab = null; this.hidden = 0; this.zoom = 1; this.grid = true; this.heads = true;
      this.spills = new Map(); this.spillOwner = new Map(); this.defW = 64; this.defH = 20; this.showF = false; this.sel = null; this.sparks = [];
      this._ext = null;
    }
    get(r, c) { const col = this.vals[c]; const x = col ? col[r] : undefined; return x === undefined ? null : x; }
    styleAt(r, c) { const col = this.sty[c]; const s = col ? col[r] : undefined; return s !== undefined ? s : (this.rowSt[r] !== undefined ? this.rowSt[r] : (this.colSt[c] || 0)); }
    ownStyle(r, c) { const col = this.sty[c]; return col ? col[r] : undefined; }
    formula(r, c) { return this.fml.get(KEY(r, c)) || null; }
    extent() {
      if (this._ext) return this._ext;
      let r = -1, c = -1;
      for (let j = 0; j < this.vals.length; j++) { const col = this.vals[j]; if (!col || !col.length) continue; let k = col.length - 1; while (k >= 0 && (col[k] === undefined || col[k] === null)) k--; if (k >= 0) { if (k > r) r = k; c = j; } }
      for (let j = 0; j < this.sty.length; j++) { const col = this.sty[j]; if (!col || !col.length) continue; let k = col.length - 1; while (k >= 0 && !col[k]) k--; if (k >= 0) { if (k > r) r = k; if (j > c) c = j; } }
      this.fml.forEach((f) => { if (f.r > r) r = f.r; if (f.c > c) c = f.c; });
      this.merges.forEach((m) => { if (m.r2 > r) r = m.r2; if (m.c2 > c) c = m.c2; });
      return (this._ext = { r, c });
    }
    /** zone remplie (valeurs seulement) */
    used() { const e = this.extent(); return { r1: 0, c1: 0, r2: Math.max(0, e.r), c2: Math.max(0, e.c) }; }
    isEmpty(r, c) { const v = this.get(r, c); return v === null || v === ''; }
    mergeAt(r, c) { for (const m of this.merges) if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m; return null; }
    colWidth(c) { return this.hidC.has(c) ? 0 : (this.colW[c] != null ? this.colW[c] : this.defW); }
    rowHeight(r) { return this.hidR.has(r) ? 0 : (this.rowH[r] != null ? this.rowH[r] : this.defH); }
    tableAt(r, c) { for (const t of this.tables) if (r >= t.r1 && r <= t.r2 && c >= t.c1 && c <= t.c2) return t; return null; }
  }
  TB.Sheet = Sheet;

  /* ---------------- classeur ---------------- */
  class Workbook {
    constructor() {
      this.sheets = []; this.styles = TB.StylePool(); this.names = []; this.props = { title: '', author: '', created: Date.now(), modified: Date.now() };
      this.settings = { iter: false, iterMax: 100, iterEps: 0.001, calc: 'auto', date1904: false, theme: 'clair' };
      this.protect = null; this.active = 0; this.media = {}; this.lists = [];
      this.undoStack = []; this.redoStack = []; this.tx = null; this.txDepth = 0; this.listeners = [];
      this.single = new Map(); this.bucket = new Map(); this.colDeps = new Map(); this.rowDeps = new Map(); this.volatile = new Set();
      this.circ = []; this.calcCount = 0; this.dirtyAll = false; this.suspend = 0;
    }
    /* ----- feuilles ----- */
    sheet(x) { if (x instanceof Sheet) return x; if (typeof x === 'number') return this.sheets[x] || null; const l = String(x).toLowerCase(); return this.sheets.find((s) => s.name.toLowerCase() === l || s.id === x) || null; }
    get cur() { return this.sheets[this.active] || this.sheets[0]; }
    uniqueSheetName(base) { base = base || 'Feuil'; let i = 1; let n = /\d$/.test(base) ? base : base + i; while (this.sheet(n)) { i++; n = base.replace(/\s*\(?\d+\)?$/, '') + (/[ (]$/.test(base) ? '' : '') + i; } return n; }
    addSheetRaw(name, at, id) { const s = new Sheet(this, name, id); if (at == null || at >= this.sheets.length) this.sheets.push(s); else this.sheets.splice(at, 0, s); return s; }
    /* ----- écoute ----- */
    on(fn) { this.listeners.push(fn); }
    emit(ev) { this.listeners.forEach((f) => { try { f(ev); } catch (e) { console.error(e); } }); }
  }
  TB.Workbook = Workbook;
  const WP = Workbook.prototype;

  /* =====================================================================
     Écriture des cellules (toutes journalisées pour annuler)
     ===================================================================== */
  /** instantané d'une cellule : {v, f, s, a (plage matricielle)} ou null */
  WP.snap = function (sh, r, c) {
    const f = sh.fml.get(KEY(r, c)), s = sh.ownStyle(r, c), v = sh.get(r, c);
    if (!f && s === undefined && (v === null || sh.spillOwner.has(KEY(r, c)))) return null;
    const o = {}; if (f) { o.f = f.src; if (f.arr) o.a = Object.assign({}, f.arr); if (f.arrChild) return s !== undefined ? { s } : null; } else if (v !== null && !sh.spillOwner.has(KEY(r, c))) o.v = v; if (s !== undefined) o.s = s; return o;
  };
  function log(wb, e) { if (wb.tx) wb.tx.list.push(e); }
  WP.begin = function (label) { if (!this.tx) this.tx = { label: label || '', list: [], cells: [], full: false, sheets: new Set() }; this.txDepth++; return this.tx; };
  WP.commit = function () {
    if (--this.txDepth > 0) return; const tx = this.tx; this.tx = null; this.txDepth = 0;
    if (!tx) return;
    if (tx.list.length) { this.undoStack.push(tx); if (this.undoStack.length > 10000) this.undoStack.shift(); this.redoStack = []; this.props.modified = Date.now(); }
    this.afterChange(tx, 'edit');
  };
  WP.afterChange = function (tx, kind) {
    tx.sheets.forEach((s) => { s._ext = null; });
    if (tx.full || this.dirtyAll) { this.dirtyAll = false; this.rebuild(); this.recalcAll(); }
    else if (tx.cells.length) this.recalcFrom(tx.cells);
    this.emit({ kind, label: tx.label, full: tx.full, n: tx.list.length });
  };
  WP.canUndo = function () { return this.undoStack.length > 0; };
  WP.canRedo = function () { return this.redoStack.length > 0; };
  WP.undoLabel = function () { const t = this.undoStack[this.undoStack.length - 1]; return t ? t.label : ''; };
  WP.redoLabel = function () { const t = this.redoStack[this.redoStack.length - 1]; return t ? t.label : ''; };
  WP.undo = function () {
    const tx = this.undoStack.pop(); if (!tx) return null;
    const re = { label: tx.label, list: tx.list, cells: [], full: false, sheets: new Set(), sel: tx.sel, sel2: tx.sel2 };
    for (let i = tx.list.length - 1; i >= 0; i--) applyEntry(this, tx.list[i], true, re);
    this.redoStack.push(tx); this.afterChange(re, 'undo'); return tx;
  };
  WP.redo = function () {
    const tx = this.redoStack.pop(); if (!tx) return null;
    const re = { label: tx.label, list: tx.list, cells: [], full: false, sheets: new Set() };
    for (let i = 0; i < tx.list.length; i++) applyEntry(this, tx.list[i], false, re);
    this.undoStack.push(tx); this.afterChange(re, 'redo'); return tx;
  };
  function applyEntry(wb, e, back, re) {
    switch (e.k) {
      case 'cell': putCell(wb, e.sh, e.r, e.c, back ? e.b : e.a); re.cells.push([e.sh, e.r, e.c]); re.sheets.add(e.sh); if ((back ? e.b : e.a) && (back ? e.b : e.a).a || (back ? e.a : e.b) && (back ? e.a : e.b).a) re.full = true; break;
      case 'cells': { const L = back ? e.b : e.a; for (let i = 0; i < e.pos.length; i += 2) { putCell(wb, e.sh, e.pos[i], e.pos[i + 1], L[i / 2]); } re.cellsArea = true; re.full = re.full || e.pos.length > 4000; if (e.pos.length <= 4000) for (let i = 0; i < e.pos.length; i += 2) re.cells.push([e.sh, e.pos[i], e.pos[i + 1]]); re.sheets.add(e.sh); break; }
      case 'prop': setOwn(e.o, e.key, back ? e.b : e.a); re.full = re.full || !!e.full; if (e.o instanceof Sheet) re.sheets.add(e.o); if (e.sh) re.sheets.add(e.sh); break;
      case 'fn': (back ? e.undo : e.redo)(); re.full = true; wb.sheets.forEach((s) => re.sheets.add(s)); break;
    }
  }
  function setOwn(o, k, v) { if (o instanceof Map) { if (v === undefined) o.delete(k); else o.set(k, v); } else if (o instanceof Set) { if (v) o.add(k); else o.delete(k); } else if (Array.isArray(o)) { if (v === undefined) delete o[k]; else o[k] = v; } else { if (v === undefined) delete o[k]; else o[k] = v; } }
  /** Modifier une propriété (objet, Map, tableau creux, Set) avec journal */
  WP.setProp = function (o, key, value, full) {
    let old; if (o instanceof Map) old = o.get(key); else if (o instanceof Set) old = o.has(key); else old = o[key];
    if (old === value) return;
    log(this, { k: 'prop', o, key, b: old, a: value, full: !!full });
    setOwn(o, key, value);
    if (this.tx) { if (full) this.tx.full = true; if (o instanceof Sheet) this.tx.sheets.add(o); }
  };
  /** Écriture brute (sans journal) d'une cellule selon un instantané */
  function putCell(wb, sh, r, c, o) {
    const k = KEY(r, c);
    const old = sh.fml.get(k);
    if (old) { removeFormula(wb, sh, old); }
    if (sh.spillOwner.has(k) && !(o && (o.v != null || o.f))) { /* valeur propagée : garder */ }
    else { if (sh.spillOwner.has(k)) { const ow = sh.spillOwner.get(k); sh.spillOwner.delete(k); const a = sh.fml.get(ow); if (a) { a.st = 1; (wb._spillHit || (wb._spillHit = [])).push(a); } } setVal(sh, r, c, o && o.v !== undefined ? o.v : null); }
    if (o && o.s !== undefined) setSty(sh, r, c, o.s); else delSty(sh, r, c);
    if (o && o.f) addFormula(wb, sh, r, c, o.f, o.a);
    sh._ext = null;
  }
  function setVal(sh, r, c, v) {
    let col = sh.vals[c];
    if (v === null || v === undefined) { if (col && r < col.length) { col[r] = undefined; } return; }
    if (!col) col = sh.vals[c] = [];
    col[r] = v;
  }
  function setSty(sh, r, c, s) { let col = sh.sty[c]; if (!col) col = sh.sty[c] = []; col[r] = s; }
  function delSty(sh, r, c) { const col = sh.sty[c]; if (col && r < col.length) col[r] = undefined; }
  TB._setVal = setVal;

  /** Écrire une cellule (instantané {v, f, s}) avec journal */
  WP.setCell = function (sh, r, c, o) {
    sh = this.sheet(sh);
    const b = this.snap(sh, r, c);
    log(this, { k: 'cell', sh, r, c, b, a: o ? Object.assign({}, o) : null });
    putCell(this, sh, r, c, o);
    if (this.tx) { this.tx.cells.push([sh, r, c]); this.tx.sheets.add(sh); if (o && o.a || b && b.a) this.tx.full = true; }
  };
  /** Écriture groupée (beaucoup de cellules) : un seul enregistrement */
  WP.setCells = function (sh, list) {
    // list : [[r, c, o], …]
    sh = this.sheet(sh);
    if (list.length < 64) { list.forEach((x) => this.setCell(sh, x[0], x[1], x[2])); return; }
    const pos = new Array(list.length * 2), b = new Array(list.length), a = new Array(list.length);
    for (let i = 0; i < list.length; i++) { const [r, c, o] = list[i]; pos[2 * i] = r; pos[2 * i + 1] = c; b[i] = this.snap(sh, r, c); a[i] = o; putCell(this, sh, r, c, o); }
    log(this, { k: 'cells', sh, pos, b, a });
    if (this.tx) { this.tx.sheets.add(sh); if (list.length > 4000) this.tx.full = true; else list.forEach((x) => this.tx.cells.push([sh, x[0], x[1]])); }
  };
  WP.setStyleAt = function (sh, r, c, sid) { sh = this.sheet(sh); const o = this.snap(sh, r, c) || {}; if ((o.s || 0) === sid && sh.ownStyle(r, c) !== undefined) return; o.s = sid; this.setCell(sh, r, c, o); };
  WP.fnEntry = function (redo, undo) { log(this, { k: 'fn', redo, undo }); if (this.tx) this.tx.full = true; };

  /* =====================================================================
     Formules : enregistrement, dépendances
     ===================================================================== */
  class Fc { constructor(sh, r, c, src) { this.sh = sh; this.r = r; this.c = c; this.src = src; this.ast = null; this.deps = null; this.vol = false; this.st = 0; this.arr = null; this.spill = null; this.err = null; } }
  TB.Fc = Fc;
  function addFormula(wb, sh, r, c, src, arr) {
    const f = new Fc(sh, r, c, src);
    try { f.ast = P.parse(src); } catch (e) { f.ast = { t: 'e', v: '#NAME?' }; f.err = e.message; }
    if (arr) { f.arr = { r1: arr.r1, c1: arr.c1, r2: arr.r2, c2: arr.c2 }; }
    sh.fml.set(KEY(r, c), f); sh.fcols.set(c, (sh.fcols.get(c) || 0) + 1);
    if (!wb.suspend) register(wb, f);
    f.st = 1;
    return f;
  }
  function removeFormula(wb, sh, f) {
    unregister(wb, f);
    sh.fml.delete(KEY(f.r, f.c)); const n = (sh.fcols.get(f.c) || 1) - 1; if (n) sh.fcols.set(f.c, n); else sh.fcols.delete(f.c);
    clearSpill(wb, f);
    wb.volatile.delete(f);
  }
  TB._addFormula = addFormula;
  const VOL = new Set(['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'RANDARRAY', 'OFFSET', 'INDIRECT', 'CELL', 'INFO']);
  /** Plages lues par une formule (analyse statique) */
  function depsOf(wb, f) {
    const out = []; let vol = false;
    const home = f.sh;
    const add = (n) => {
      const shs = sheetsOf(wb, n, home); if (!shs) return;
      for (const s of shs) { if (n.t === 'ref') out.push({ sh: s, r1: n.r, c1: n.c, r2: n.r, c2: n.c }); else out.push({ sh: s, r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c2 }); }
    };
    const seenNames = new Set();
    const walk = (ast, homeSh) => P.walk(ast, (n) => {
      if (n.t === 'ref' || n.t === 'area') { add(n); return; }
      if (n.t === 'fn' && VOL.has(n.n)) vol = true;
      if (n.t === 'fn' && !TB.FN[n.n]) vol = true; // LAMBDA nommée ou fonction inconnue
      if (n.t === 'name') {
        const nm = wb.findName(n.n, n.sh ? wb.sheet(n.sh) : homeSh);
        if (nm && !seenNames.has(nm)) { seenNames.add(nm); const a = wb.nameAst(nm); if (a) walk(a, nm.sh ? wb.sheet(nm.sh) : homeSh); }
        else if (!nm) vol = true;
      }
      if (n.t === 'sref') { const g = wb.resolveSref(n, f); if (g && !(g instanceof TB.Err)) out.push({ sh: g.sh, r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 }); }
      if (n.t === 'spill') vol = true;
    });
    walk(f.ast, home);
    return { deps: out, vol };
  }
  function sheetsOf(wb, n, home) {
    if (n.sh == null) return [home];
    const a = wb.sheet(n.sh); if (!a) return null;
    if (!n.sh2) return [a];
    const b = wb.sheet(n.sh2); if (!b) return null;
    const i = wb.sheets.indexOf(a), j = wb.sheets.indexOf(b);
    return wb.sheets.slice(Math.min(i, j), Math.max(i, j) + 1);
  }
  const BR = 8, BC = 4; // seaux : 256 lignes × 16 colonnes
  function register(wb, f) {
    const d = depsOf(wb, f); f.deps = d.deps; f.vol = d.vol;
    f.self = f.deps.some((g) => g.sh === f.sh && f.r >= g.r1 && f.r <= g.r2 && f.c >= g.c1 && f.c <= g.c2);
    if (f.vol) wb.volatile.add(f);
    for (const g of f.deps) {
      if (g.r1 === g.r2 && g.c1 === g.c2) { const k = g.sh.id + ':' + KEY(g.r1, g.c1); let s = wb.single.get(k); if (!s) wb.single.set(k, s = new Set()); s.add(f); continue; }
      const rows = g.r2 - g.r1 + 1, cols = g.c2 - g.c1 + 1;
      if (rows > 2048) { for (let c = g.c1; c <= g.c2; c++) { const k = g.sh.id + ':' + c; let s = wb.colDeps.get(k); if (!s) wb.colDeps.set(k, s = new Set()); s.add(f); } }
      else if (cols > 64) { for (let r = g.r1; r <= g.r2; r++) { const k = g.sh.id + ':' + r; let s = wb.rowDeps.get(k); if (!s) wb.rowDeps.set(k, s = new Set()); s.add(f); } }
      else { for (let br = g.r1 >> BR; br <= g.r2 >> BR; br++) for (let bc = g.c1 >> BC; bc <= g.c2 >> BC; bc++) { const k = g.sh.id + ':' + br + ':' + bc; let s = wb.bucket.get(k); if (!s) wb.bucket.set(k, s = new Set()); s.add(f); } }
    }
  }
  function unregister(wb, f) {
    if (!f.deps) return;
    for (const g of f.deps) {
      if (g.r1 === g.r2 && g.c1 === g.c2) { const s = wb.single.get(g.sh.id + ':' + KEY(g.r1, g.c1)); if (s) s.delete(f); continue; }
      const rows = g.r2 - g.r1 + 1, cols = g.c2 - g.c1 + 1;
      if (rows > 2048) { for (let c = g.c1; c <= g.c2; c++) { const s = wb.colDeps.get(g.sh.id + ':' + c); if (s) s.delete(f); } }
      else if (cols > 64) { for (let r = g.r1; r <= g.r2; r++) { const s = wb.rowDeps.get(g.sh.id + ':' + r); if (s) s.delete(f); } }
      else { for (let br = g.r1 >> BR; br <= g.r2 >> BR; br++) for (let bc = g.c1 >> BC; bc <= g.c2 >> BC; bc++) { const s = wb.bucket.get(g.sh.id + ':' + br + ':' + bc); if (s) s.delete(f); } }
    }
    f.deps = null; wb.volatile.delete(f);
  }
  const hit = (f, sh, r, c) => { for (const g of f.deps) if (g.sh === sh && r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return true; return false; };
  /** Formules qui lisent la cellule (sh, r, c) */
  WP.dependents = function (sh, r, c, out) {
    out = out || new Set();
    const s1 = this.single.get(sh.id + ':' + KEY(r, c)); if (s1) s1.forEach((f) => out.add(f));
    const b = this.bucket.get(sh.id + ':' + (r >> BR) + ':' + (c >> BC)); if (b) b.forEach((f) => { if (hit(f, sh, r, c)) out.add(f); });
    const cd = this.colDeps.get(sh.id + ':' + c); if (cd) cd.forEach((f) => { if (hit(f, sh, r, c)) out.add(f); });
    const rd = this.rowDeps.get(sh.id + ':' + r); if (rd) rd.forEach((f) => { if (hit(f, sh, r, c)) out.add(f); });
    return out;
  };
  /** Reconstruit l'index des dépendances (après une modification de structure, des noms…) */
  WP.rebuild = function () {
    this.single.clear(); this.bucket.clear(); this.colDeps.clear(); this.rowDeps.clear(); this.volatile.clear();
    this._nameAst = new Map();
    for (const sh of this.sheets) { sh._ext = null; sh.fml.forEach((f) => { f.deps = null; register(this, f); }); }
  };

  /* =====================================================================
     Recalcul
     ===================================================================== */
  const CLEAN = 0, DIRTY = 1, VISIT = 2;
  WP.allFormulas = function () { const l = []; this.sheets.forEach((s) => s.fml.forEach((f) => l.push(f))); return l; };
  WP.recalcAll = function () {
    const all = this.allFormulas();
    all.forEach((f) => { f.st = DIRTY; });
    this.runCalc(all);
  };
  /** Recalcul à partir de cellules modifiées : [[sh, r, c], …] */
  WP.recalcFrom = function (cells) {
    if (this.settings.calc === 'manual') { this.pendingManual = true; cells.forEach(([sh, r, c]) => { const f = sh.fml.get(KEY(r, c)); if (f) f.st = DIRTY; }); return; }
    const dirty = new Set(), q = [];
    const push = (f) => { if (!dirty.has(f)) { dirty.add(f); q.push(f); } };
    for (const [sh, r, c] of cells) { const f = sh.fml.get(KEY(r, c)); if (f) push(f); this.dependents(sh, r, c).forEach(push); const ow = sh.spillOwner.get(KEY(r, c)); if (ow != null) { const a = sh.fml.get(ow); if (a) push(a); } }
    // formules en #SPILL! : peut-être débloquées ; propagations recouvertes par une saisie
    this.sheets.forEach((s) => s.fml.forEach((f) => { if (f.blocked) push(f); }));
    if (this._spillHit) { this._spillHit.forEach(push); this._spillHit = null; }
    this.volatile.forEach(push);
    for (let i = 0; i < q.length; i++) {
      const f = q[i];
      this.dependents(f.sh, f.r, f.c).forEach(push);
      if (f.spill) { for (let r = f.spill.r1; r <= f.spill.r2; r++) for (let c = f.spill.c1; c <= f.spill.c2; c++) if (r !== f.r || c !== f.c) this.dependents(f.sh, r, c).forEach(push); }
    }
    dirty.forEach((f) => { f.st = DIRTY; });
    this.runCalc(q);
  };
  /** Précédents encore à calculer d'une formule */
  function pendingDeps(wb, f, out) {
    if (!f.deps) return;
    for (const g of f.deps) {
      const sh = g.sh;
      if (g.r1 === g.r2 && g.c1 === g.c2) {
        const x = sh.fml.get(KEY(g.r1, g.c1)); if (x && x !== f && x.st) out.push(x);
        const ow = sh.spillOwner.get(KEY(g.r1, g.c1)); if (ow != null) { const a = sh.fml.get(ow); if (a && a !== f && a.st) out.push(a); }
        continue;
      }
      // seulement les colonnes qui contiennent des formules
      const area = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1);
      if (sh.fml.size <= area / 4 || g.r2 - g.r1 > 4096) {
        sh.fml.forEach((x) => { if (x !== f && x.st && x.r >= g.r1 && x.r <= g.r2 && x.c >= g.c1 && x.c <= g.c2) out.push(x); });
      } else {
        for (let c = g.c1; c <= g.c2; c++) { if (!sh.fcols.has(c)) continue; for (let r = g.r1; r <= g.r2; r++) { const x = sh.fml.get(KEY(r, c)); if (x && x !== f && x.st) out.push(x); } }
      }
      if (sh.spills.size) sh.spills.forEach((rg, k) => { const a = sh.fml.get(k); if (a && a !== f && a.st && TB.intersect(rg, g)) out.push(a); });
    }
  }
  WP.runCalc = function (list) {
    this.calcCount++;
    if (!this.circAll) this.circAll = new Set();
    const circ = new Set();
    let guard = 0;
    for (const root of list) {
      if (root.st !== DIRTY) continue;
      const stack = [root];
      while (stack.length) {
        if (++guard > 50000000) break;
        const f = stack[stack.length - 1];
        if (f.st === CLEAN) { stack.pop(); continue; }
        if (f.st === DIRTY) {
          f.st = VISIT; const deps = []; pendingDeps(this, f, deps); if (f.self) circ.add(f);
          for (const d of deps) { if (d.st === DIRTY) stack.push(d); else if (d.st === VISIT) { circ.add(f); circ.add(d); } }
          continue;
        }
        // VISIT : précédents traités
        stack.pop(); if (f.st !== VISIT) continue;
        if (circ.has(f)) { f.st = CLEAN; continue; }
        this.evalCell(f); f.st = CLEAN;
      }
    }
    if (circ.size) this.solveCircular(circ);
    // propagation : des plages propagées ont changé de forme
    if (this._spillChanged && this._spillChanged.length && (this._spillDepth = (this._spillDepth || 0) + 1) < 8) {
      const cells = []; this._spillChanged.forEach(([sh, g]) => { for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 5000); r++) for (let c = g.c1; c <= g.c2; c++) cells.push([sh, r, c]); }); this._spillChanged = [];
      const dirty = new Set(); cells.forEach(([sh, r, c]) => this.dependents(sh, r, c).forEach((f) => dirty.add(f)));
      if (dirty.size) { dirty.forEach((f) => { f.st = DIRTY; }); this.runCalc(Array.from(dirty)); }
    }
    this._spillDepth = 0; this._spillChanged = [];
    this.circ = Array.from(this.circAll).filter((f) => f.circ && f.sh.fml.get(KEY(f.r, f.c)) === f && this.sheets.indexOf(f.sh) >= 0);
  };
  WP.solveCircular = function (set) {
    const list = Array.from(set);
    if (!this.settings.iter) {
      list.forEach((f) => { f.circ = true; this.circAll.add(f); setVal(f.sh, f.r, f.c, 0); });
      // les dépendants des cellules circulaires sont recalculés avec la valeur 0
      const dep = new Set(); list.forEach((f) => this.dependents(f.sh, f.r, f.c).forEach((x) => { if (!set.has(x)) dep.add(x); }));
      dep.forEach((x) => { x.st = DIRTY; }); if (dep.size) this.runCalc(Array.from(dep));
      return;
    }
    // calcul itératif (Fichier › Options) : jusqu'à iterMax passes ou variation < iterEps
    for (let it = 0; it < (this.settings.iterMax || 100); it++) {
      let delta = 0;
      for (const f of list) { const before = f.sh.get(f.r, f.c); this.evalCell(f, true); const after = f.sh.get(f.r, f.c); if (typeof before === 'number' && typeof after === 'number') delta = Math.max(delta, Math.abs(after - before)); else if (before !== after) delta = Infinity; }
      if (delta < (this.settings.iterEps || 0.001)) break;
    }
    list.forEach((f) => { f.circ = false; this.circAll.delete(f); });
  };
  /** Évalue une formule et range le résultat (propagation d'une matrice) */
  WP.evalCell = function (f, iter) {
    const cx = { wb: this, sh: f.sh, r: f.r, c: f.c, f, env: null, depth: 0 };
    let v;
    if (!iter && f.circ) { f.circ = false; if (this.circAll) this.circAll.delete(f); }
    try { v = ev(f.ast, cx); } catch (e) { if (e && e.circ) { v = 0; f.circ = true; } else { console.warn('Calcul', f.sh.name + '!' + TB.addr(f.r, f.c), e); v = E.VALUE; } }
    if (v instanceof Lambda) v = E.CALC;
    if (v === MISSING) v = 0;
    if (f.arr) { writeArray(this, f, v); return; }
    if (v instanceof Ref3) v = E.VALUE;
    if (v instanceof Ref) { if (v.single()) { v = v.v(0, 0); if (v === null) v = 0; } else v = v.toArr(true); }
    if (v instanceof Arr && v.single()) { v = v.v(0, 0); if (v === null) v = 0; }
    if (v instanceof Arr) { spill(this, f, v); return; }
    if (f.spill) clearSpill(this, f);
    f.blocked = false;
    if (typeof v === 'number' && !isFinite(v)) v = E.NUM;
    setVal(f.sh, f.r, f.c, v);
  };
  function clearSpill(wb, f) {
    if (!f.spill) return;
    const sh = f.sh, g = f.spill; const k0 = KEY(f.r, f.c);
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const k = KEY(r, c); if (k === k0) continue; if (sh.spillOwner.get(k) === k0) { sh.spillOwner.delete(k); setVal(sh, r, c, null); } }
    sh.spills.delete(k0); f.spill = null; sh._ext = null;
    (wb._spillChanged || (wb._spillChanged = [])).push([sh, g]);
  }
  function spill(wb, f, a) {
    const sh = f.sh, k0 = KEY(f.r, f.c);
    const g = { r1: f.r, c1: f.c, r2: f.r + a.h - 1, c2: f.c + a.w - 1 };
    if (g.r2 >= TB.MAX_ROWS || g.c2 >= TB.MAX_COLS) { clearSpill(wb, f); setVal(sh, f.r, f.c, E.SPILL); f.blocked = true; return; }
    // bloqué ?
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      if (r === f.r && c === f.c) continue; const k = KEY(r, c);
      const own = sh.spillOwner.get(k);
      if ((own != null && own !== k0) || ((own == null) && (sh.get(r, c) !== null || sh.fml.has(k))) || sh.mergeAt(r, c)) { clearSpill(wb, f); setVal(sh, f.r, f.c, E.SPILL); f.blocked = true; return; }
    }
    const old = f.spill;
    if (old && !TB.sameRange(old, g)) { const tmp = f.spill; clearSpill(wb, f); f.spill = null; void tmp; }
    for (let i = 0; i < a.h; i++) for (let j = 0; j < a.w; j++) {
      let x = a.v(i, j); if (x === null) x = 0; if (x instanceof Ref || x instanceof Arr) x = E.VALUE; if (typeof x === 'number' && !isFinite(x)) x = E.NUM;
      const r = g.r1 + i, c = g.c1 + j; setVal(sh, r, c, x); if (i || j) sh.spillOwner.set(KEY(r, c), k0);
    }
    if (!old || !TB.sameRange(old, g)) (wb._spillChanged || (wb._spillChanged = [])).push([sh, g]);
    f.spill = g; sh.spills.set(k0, g); f.blocked = false; sh._ext = null;
  }
  function writeArray(wb, f, v) {
    // ancienne formule matricielle (Ctrl+Maj+Entrée) : remplit sa plage fixe
    const g = f.arr, sh = f.sh;
    let a = v instanceof Ref ? v.toArr(true) : v instanceof Arr ? v : new Arr([[v]]);
    for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
      const i = r - g.r1, j = c - g.c1;
      let x = a.h === 1 && a.w === 1 ? a.v(0, 0) : (i < a.h || a.h === 1) && (j < a.w || a.w === 1) ? a.v(a.h === 1 ? 0 : i, a.w === 1 ? 0 : j) : E.NA;
      if (x === null) x = 0;
      setVal(sh, r, c, x);
    }
  }

  /* =====================================================================
     Évaluation
     ===================================================================== */
  class CircErr extends Error { constructor() { super('circ'); this.circ = true; } }
  /** valeur d'une cellule pendant un calcul (calcule une formule « sale » à la demande : INDIRECT, DECALER…) */
  function cellValue(cx, sh, r, c) {
    const f = sh.fml.size ? sh.fml.get(KEY(r, c)) : null;
    if (f && f.st) {
      if (f.st === VISIT || cx.depth > 400) { if (f.st === VISIT && f !== cx.f) { cx.wb._circHit = true; } }
      else { f.st = VISIT; const save = cx.depth; cx.depth++; try { cx.wb.evalCell(f); } finally { cx.depth = save; } f.st = CLEAN; }
    }
    return sh.get(r, c);
  }
  TB.cellValue = cellValue;
  function resolveSheet(cx, n) { if (n.sh == null) return cx.sh; return cx.wb.sheet(n.sh); }
  function ensureDeps(cx, ref) {
    // références dynamiques : s'assurer que les formules « sales » de la plage sont calculées
    const sh = ref.sh; if (!sh.fml.size) return ref;
    const area = ref.h * ref.w;
    if (sh.fml.size < area) { sh.fml.forEach((f) => { if (f.st && f.r >= ref.r1 && f.r <= ref.r2 && f.c >= ref.c1 && f.c <= ref.c2) cellValue(cx, sh, f.r, f.c); }); }
    else for (let c = ref.c1; c <= ref.c2; c++) { if (!sh.fcols.has(c)) continue; for (let r = ref.r1; r <= Math.min(ref.r2, (sh.vals[c] || []).length + 1); r++) { const f = sh.fml.get(KEY(r, c)); if (f && f.st) cellValue(cx, sh, r, c); } }
    return ref;
  }
  TB.ensureDeps = ensureDeps;
  function ev(n, cx) {
    switch (n.t) {
      case 'n': return n.v;
      case 's': return n.v;
      case 'b': return n.v;
      case 'e': return TB.errOf(n.v) || E.REF;
      case 'miss': return MISSING;
      case 'ref': {
        if (n.sh2) return ref3(cx, n);
        const sh = resolveSheet(cx, n); if (!sh) return E.REF;
        const R = new Ref(sh, n.r, n.c, n.r, n.c);
        if (cx.dyn) ensureDeps(cx, R);
        return R;
      }
      case 'area': {
        if (n.sh2) return ref3(cx, n);
        const sh = resolveSheet(cx, n); if (!sh) return E.REF;
        const R = new Ref(sh, n.r1, n.c1, n.r2, n.c2);
        if (cx.dyn) ensureDeps(cx, R);
        return R;
      }
      case 'spill': {
        const x = ev(n.x, cx); if (!(x instanceof Ref)) return E.REF;
        const f = x.sh.fml.get(KEY(x.r1, x.c1)); if (f && f.st) cellValue(cx, x.sh, x.r1, x.c1);
        const g = x.sh.spills.get(KEY(x.r1, x.c1)); if (!g) return f ? new Ref(x.sh, x.r1, x.c1, x.r1, x.c1) : E.REF;
        return new Ref(x.sh, g.r1, g.c1, g.r2, g.c2);
      }
      case 'name': {
        if (cx.env) { let e = cx.env; const k = n.n.toUpperCase(); while (e) { if (e.vars.has(k)) return e.vars.get(k); e = e.up; } }
        const nm = cx.wb.findName(n.n, n.sh ? cx.wb.sheet(n.sh) : cx.sh);
        if (!nm) return E.NAME;
        const ast = cx.wb.nameAst(nm); if (!ast) return E.NAME;
        if (cx.nameDepth > 50) return E.REF;
        const sub = Object.assign({}, cx, { sh: nm.sh ? cx.wb.sheet(nm.sh) || cx.sh : cx.sh, nameDepth: (cx.nameDepth || 0) + 1, dyn: true });
        return ev(ast, sub);
      }
      case 'sref': { const g = cx.wb.resolveSref(n, cx.f || { sh: cx.sh, r: cx.r, c: cx.c }); if (!g || g instanceof TB.Err) return g || E.REF; return ensureDeps(cx, new Ref(g.sh, g.r1, g.c1, g.r2, g.c2)); }
      case 'paren': return ev(n.x, cx);
      case 'union': { const l = n.l.map((x) => ev(x, cx)); if (l.some((x) => !(x instanceof Ref))) return E.VALUE; return new Ref3(l); }
      case 'neg': return lift1(ev(n.x, cx), cx, (x) => { const v = TB.toNum(x); return v instanceof TB.Err ? v : -v; });
      case 'pos': return ev(n.x, cx);
      case 'pct': return lift1(ev(n.x, cx), cx, (x) => { const v = TB.toNum(x); return v instanceof TB.Err ? v : v / 100; });
      case 'range': {
        const a = ev(n.l, cx), b = ev(n.r, cx);
        if (a instanceof TB.Err) return a; if (b instanceof TB.Err) return b;
        if (!(a instanceof Ref) || !(b instanceof Ref) || a.sh !== b.sh) return E.VALUE;
        return ensureDeps(cx, new Ref(a.sh, Math.min(a.r1, b.r1), Math.min(a.c1, b.c1), Math.max(a.r2, b.r2), Math.max(a.c2, b.c2)));
      }
      case 'op': return binop(n.o, ev(n.l, cx), ev(n.r, cx), cx);
      case 'arr': return new Arr(n.rows.map((r) => r.map((x) => ev(x, cx))));
      case 'fn': return callFn(n, cx);
      case 'call': {
        const f = ev(n.f, cx);
        if (!(f instanceof Lambda)) return f instanceof TB.Err ? f : E.VALUE;
        return TB.applyLambda(f, n.a.map((a) => ev(a, cx)), cx);
      }
    }
    return E.VALUE;
  }
  TB.ev = ev;
  function ref3(cx, n) {
    const a = cx.wb.sheet(n.sh), b = cx.wb.sheet(n.sh2); if (!a || !b) return E.REF;
    const i = cx.wb.sheets.indexOf(a), j = cx.wb.sheets.indexOf(b);
    const l = cx.wb.sheets.slice(Math.min(i, j), Math.max(i, j) + 1).map((s) => n.t === 'ref' ? new Ref(s, n.r, n.c, n.r, n.c) : new Ref(s, n.r1, n.c1, n.r2, n.c2));
    return new Ref3(l);
  }
  TB.applyLambda = function (lam, args, cx) {
    if (args.length > lam.p.length) return E.VALUE;
    const vars = new Map(); lam.p.forEach((p, i) => vars.set(p, i < args.length ? args[i] : MISSING));
    const sub = Object.assign({}, cx, { env: { vars, up: lam.env }, depth: (cx.depth || 0) + 1 });
    if (sub.depth > 1000) return E.NUM;
    return ev(lam.body, sub);
  };
  function callFn(n, cx) {
    const def = TB.FN[n.n];
    if (!def) {
      // fonction LAMBDA nommée
      const nm = cx.wb.findName(n.n, cx.sh);
      if (nm) { const lam = ev({ t: 'name', n: n.n }, cx); if (lam instanceof Lambda) return TB.applyLambda(lam, n.a.map((a) => ev(a, cx)), cx); }
      if (cx.env) { let e = cx.env; const k = n.n.toUpperCase(); while (e) { if (e.vars.has(k)) { const lam = e.vars.get(k); if (lam instanceof Lambda) return TB.applyLambda(lam, n.a.map((a) => ev(a, cx)), cx); } e = e.up; } }
      return E.NAME;
    }
    const na = n.a.length;
    if (na < (def.min || 0) || (def.max != null && na > def.max)) return E.VALUE;
    if (def.lazy) return def.f(n.a, cx, ev);
    const dyn = def.dyn; const save = cx.dyn; if (dyn) cx.dyn = true;
    const args = new Array(na);
    for (let i = 0; i < na; i++) args[i] = ev(n.a[i], cx);
    cx.dyn = save;
    if (def.lift) return liftCall(def, args, cx);
    return def.f(args, cx);
  }
  TB.callFn = callFn;

  /* ---------------- conversions ---------------- */
  TB.toNum = function (v) {
    if (v === null || v === MISSING || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof TB.Err) return v;
    if (typeof v === 'string') {
      if (v === '') return E.VALUE;
      let x = TB.parseNum(v); if (x != null) return x;
      x = TB.parseNum(v, TB.loc.dec === ',' ? '.' : ','); if (x != null && TB.loc.dec === ',' && /\./.test(v) && !/,/.test(v)) return x;
      const p = TB.parseInput(v); if (typeof p.v === 'number') return p.v;
      return E.VALUE;
    }
    if (v instanceof Ref) return v.single() ? TB.toNum(v.v(0, 0)) : E.VALUE;
    if (v instanceof Arr) return v.single() ? TB.toNum(v.v(0, 0)) : E.VALUE;
    return E.VALUE;
  };
  TB.toStr = function (v) {
    if (v === null || v === MISSING || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return TB.numText(v);
    if (typeof v === 'boolean') return TB.boolText(v);
    if (v instanceof TB.Err) return v;
    if (v instanceof Ref || v instanceof Arr) return v.single() ? TB.toStr(v.v(0, 0)) : E.VALUE;
    return E.VALUE;
  };
  TB.toBool = function (v) {
    if (v === null || v === MISSING || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v instanceof TB.Err) return v;
    if (typeof v === 'string') { if (/^(true|vrai)$/i.test(v)) return true; if (/^(false|faux)$/i.test(v)) return false; return E.VALUE; }
    if (v instanceof Ref || v instanceof Arr) return v.single() ? TB.toBool(v.v(0, 0)) : E.VALUE;
    return E.VALUE;
  };
  /** valeur simple (référence d'une cellule → sa valeur) */
  TB.scalar = function (v) { if (v instanceof Ref) { if (v.single()) return v.v(0, 0); return E.VALUE; } if (v instanceof Arr) return v.single() ? v.v(0, 0) : v.v(0, 0); if (v instanceof Ref3) return E.VALUE; return v; };

  /* ---------------- opérateurs et diffusion des matrices ---------------- */
  function dims(v) { return v instanceof Ref || v instanceof Arr ? [v.h, v.w] : [1, 1]; }
  function at(v, i, j) {
    if (v instanceof Ref) { const R = v; const ii = R.h === 1 ? 0 : i, jj = R.w === 1 ? 0 : j; if (ii >= R.h || jj >= R.w) return E.NA; return R.v(ii, jj); }
    if (v instanceof Arr) { const ii = v.h === 1 ? 0 : i, jj = v.w === 1 ? 0 : j; if (ii >= v.h || jj >= v.w) return E.NA; return v.v(ii, jj); }
    return v;
  }
  TB.at = at;
  function lift1(v, cx, fn) {
    if (v instanceof Ref3) return E.VALUE;
    if ((v instanceof Ref || v instanceof Arr) && !(v.h === 1 && v.w === 1)) {
      const R = v instanceof Ref ? v.trimmedFull() : v; const out = [];
      for (let i = 0; i < R.h; i++) { const row = []; for (let j = 0; j < R.w; j++) row.push(fn(R.v(i, j))); out.push(row); }
      return new Arr(out);
    }
    return fn(v instanceof Ref || v instanceof Arr ? v.v(0, 0) : v);
  }
  TB.lift1 = lift1;
  function compare(a, b) {
    if (a === null || a === MISSING) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b === null || b === MISSING) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    const ta = typeof a === 'number' ? 1 : typeof a === 'string' ? 2 : 3, tb = typeof b === 'number' ? 1 : typeof b === 'string' ? 2 : 3;
    if (ta !== tb) return ta - tb;
    if (ta === 1) { const d = TB.round15(a - b); return d === 0 || Math.abs(a - b) < 1e-15 * Math.max(Math.abs(a), Math.abs(b)) ? 0 : a - b; }
    if (ta === 2) { const x = a.toLowerCase(), y = b.toLowerCase(); return x === y ? 0 : TB.strCmp(a, b) || (x < y ? -1 : 1); }
    return (a ? 1 : 0) - (b ? 1 : 0);
  }
  TB.compare = compare;
  function op1(o, a, b) {
    if (a instanceof TB.Err) return a; if (b instanceof TB.Err) return b;
    switch (o) {
      case '&': { const x = TB.toStr(a), y = TB.toStr(b); if (x instanceof TB.Err) return x; if (y instanceof TB.Err) return y; return x + y; }
      case '=': return compare(a, b) === 0;
      case '<>': return compare(a, b) !== 0;
      case '<': return compare(a, b) < 0;
      case '>': return compare(a, b) > 0;
      case '<=': return compare(a, b) <= 0;
      case '>=': return compare(a, b) >= 0;
    }
    const x = TB.toNum(a); if (x instanceof TB.Err) return x; const y = TB.toNum(b); if (y instanceof TB.Err) return y;
    switch (o) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/': return y === 0 ? E.DIV0 : x / y;
      case '^': { if (x === 0 && y === 0) return E.NUM; if (x === 0 && y < 0) return E.DIV0; const r = Math.pow(x, y); return isFinite(r) && !isNaN(r) ? r : E.NUM; }
    }
    return E.VALUE;
  }
  function binop(o, a, b, cx) {
    if (a instanceof Ref3 || b instanceof Ref3) return E.VALUE;
    const ma = (a instanceof Ref || a instanceof Arr) && !(a.h === 1 && a.w === 1), mb = (b instanceof Ref || b instanceof Arr) && !(b.h === 1 && b.w === 1);
    if (!ma && !mb) return op1(o, TB.scalar(a), TB.scalar(b));
    if (a instanceof Ref) a = a.trimmedFull(); if (b instanceof Ref) b = b.trimmedFull();
    const [ha, wa] = dims(a), [hb, wb] = dims(b);
    const H = Math.max(ha, hb), W = Math.max(wa, wb), out = [];
    for (let i = 0; i < H; i++) { const row = []; for (let j = 0; j < W; j++) row.push(op1(o, at(a, i, j), at(b, i, j))); out.push(row); }
    void cx; return new Arr(out);
  }
  TB.binop = binop;
  /** Appel d'une fonction « scalaire » : diffusion sur les matrices passées aux arguments simples */
  function liftCall(def, args, cx) {
    const L = def.lift; let H = 1, W = 1, multi = false;
    for (let i = 0; i < args.length; i++) {
      const t = L[Math.min(i, L.length - 1)]; if (t === 'r' || t === 'a') continue;
      let v = args[i];
      if (v instanceof Ref3) return E.VALUE;
      if ((v instanceof Ref || v instanceof Arr) && !(v.h === 1 && v.w === 1)) { if (v instanceof Ref) args[i] = v = v.trimmedFull(); multi = true; H = Math.max(H, v.h); W = Math.max(W, v.w); }
    }
    const conv = (v, t) => {
      if (t === 'r' || t === 'a') return v;
      if (v instanceof Ref || v instanceof Arr) v = v.v(0, 0);
      if (t === 'n') return v === MISSING ? MISSING : TB.toNum(v);
      if (t === 's') return v === MISSING ? MISSING : TB.toStr(v);
      if (t === 'b') return v === MISSING ? MISSING : TB.toBool(v);
      return v; // 'v' : valeur brute (erreurs comprises)
    };
    const call = (vals) => {
      for (let i = 0; i < vals.length; i++) { const t = L[Math.min(i, L.length - 1)]; if (t !== 'v' && t !== 'r' && t !== 'a' && vals[i] instanceof TB.Err && !def.errOk) return vals[i]; }
      const r = def.f(vals, cx); return r;
    };
    if (!multi) return call(args.map((v, i) => conv(v, L[Math.min(i, L.length - 1)])));
    const out = [];
    for (let i = 0; i < H; i++) { const row = []; for (let j = 0; j < W; j++) { row.push(call(args.map((v, k) => { const t = L[Math.min(k, L.length - 1)]; if (t === 'r' || t === 'a') return v; return conv(at(v, i, j), t); }))); } out.push(row); }
    return new Arr(out);
  }

  /* =====================================================================
     Noms définis et tableaux
     ===================================================================== */
  WP.findName = function (name, sh) {
    const l = String(name).toLowerCase();
    if (sh) { const x = this.names.find((n) => n.sh && n.sh.toLowerCase() === sh.name.toLowerCase() && n.n.toLowerCase() === l); if (x) return x; }
    return this.names.find((n) => !n.sh && n.n.toLowerCase() === l) || null;
  };
  WP.nameAst = function (nm) {
    if (!this._nameAst) this._nameAst = new Map();
    let a = this._nameAst.get(nm); if (a !== undefined) return a;
    try { a = P.parse(String(nm.f).replace(/^=/, '')); } catch (e) { a = null; }
    this._nameAst.set(nm, a); return a;
  };
  WP.table = function (name) { const l = String(name).toLowerCase(); for (const s of this.sheets) for (const t of s.tables) if (t.name.toLowerCase() === l) return { t, sh: s }; return null; };
  /** Référence structurée → {sh, r1, c1, r2, c2} */
  WP.resolveSref = function (n, f) {
    let T;
    if (n.tbl) T = this.table(n.tbl); else if (f && f.sh) { const t = f.sh.tableAt(f.r, f.c); T = t ? { t, sh: f.sh } : null; }
    if (!T) return E.REF;
    const t = T.t, sp = n.spec;
    const hdr = t.header !== false ? 1 : 0, tot = t.totals ? 1 : 0;
    let r1 = t.r1 + hdr, r2 = t.r2 - tot;
    const items = sp.items || [];
    if (items.indexOf('#All') >= 0) { r1 = t.r1; r2 = t.r2; }
    else if (items.length) {
      const hs = items.indexOf('#Headers') >= 0, ds = items.indexOf('#Data') >= 0, ts = items.indexOf('#Totals') >= 0, tr = items.indexOf('#This Row') >= 0;
      if (tr) { if (!f || f.r < t.r1 + hdr || f.r > t.r2 - tot) return E.VALUE; r1 = r2 = f.r; }
      else {
        r1 = hs ? t.r1 : ds ? t.r1 + hdr : t.r2; r2 = ts ? t.r2 : ds ? t.r2 - tot : t.r1;
        if (hs && !hdr) return E.REF; if (ts && !tot) return E.REF;
      }
    }
    let c1 = t.c1, c2 = t.c2;
    if (sp.c1 != null) {
      const ix = (nm) => t.cols.findIndex((c) => String(c.name).toLowerCase() === String(nm).toLowerCase());
      const a = ix(sp.c1); if (a < 0) return E.REF; c1 = c2 = t.c1 + a;
      if (sp.c2 != null) { const b = ix(sp.c2); if (b < 0) return E.REF; c2 = t.c1 + b; if (c2 < c1) { const x = c1; c1 = c2; c2 = x; } }
    }
    if (r2 < r1) return E.REF;
    return { sh: T.sh, r1, c1, r2, c2 };
  };

  /* =====================================================================
     Saisie d'une cellule (texte tapé) → instantané
     ===================================================================== */
  /** texte saisi → {v | f, s?} (avec format automatique : date, %, €) ; renvoie {error} pour une formule invalide */
  WP.inputToCell = function (sh, r, c, text, opt) {
    opt = opt || {};
    const cur = this.snap(sh, r, c) || {}; const sid = cur.s !== undefined ? cur.s : sh.styleAt(r, c);
    const st = this.styles.get(sid);
    if (typeof text === 'string' && text.length > 1 && (text[0] === '=' || ((text[0] === '+' || text[0] === '-') && /[A-Za-z(]/.test(text.slice(1)))) && !TB.Fmt.isText(st.nf)) {
      const body = text[0] === '=' ? text.slice(1) : text;
      let canon;
      try { canon = P.write(P.parse(body, P.userLoc()), P.CANON); }
      catch (e) { return { error: e.message, pos: e.pos }; }
      const o = { f: canon }; if (cur.s !== undefined || sid) o.s = sid;
      // format automatique selon la fonction (date, monétaire…)
      if (!st.nf || st.nf === 'General') { const auto = autoFormat(this, sh, canon); if (auto) o.s = this.styles.with(sid, { nf: auto }); }
      return o;
    }
    if (TB.Fmt.isText(st.nf)) { const o = { v: text === '' ? null : text }; if (sid) o.s = sid; return o; }
    const p = TB.parseInput(text);
    const o = { v: p.v }; if (sid) o.s = sid;
    if (p.fmt && (!st.nf || st.nf === 'General' || (p.fmt && TB.Fmt.isDate(p.fmt) !== TB.Fmt.isDate(st.nf || 'General') && !st.nf))) o.s = this.styles.with(sid, { nf: p.fmt });
    else if (p.fmt && /%/.test(p.fmt) && !/%/.test(st.nf || '')) o.s = this.styles.with(sid, { nf: p.fmt });
    if (o.s === 0 && cur.s === undefined) delete o.s;
    return o;
  };
  function autoFormat(wb, sh, canon) {
    const m = /^([A-Z][A-Z0-9.]*)\(/.exec(canon);
    if (m) { if (/^(TODAY|DATE|EDATE|EOMONTH|WORKDAY|WORKDAY\.INTL|DATEVALUE)$/.test(m[1])) return 'dd/mm/yyyy'; if (m[1] === 'NOW') return 'dd/mm/yyyy hh:mm'; if (/^(TIME|TIMEVALUE)$/.test(m[1])) return 'hh:mm'; if (/^(PMT|PV|FV|PPMT|IPMT)$/.test(m[1])) return '#,##0.00\\ "€";[Red]-#,##0.00\\ "€"'; }
    // =A1+1 avec A1 date → format de A1
    try {
      const ast = P.parse(canon); let first = null;
      P.walk(ast, (n) => { if (first) return false; if (n.t === 'ref') { first = n; return false; } });
      if (first && (ast.t === 'op' && /[+-]/.test(ast.o) || ast.t === 'ref')) { const s2 = first.sh ? wb.sheet(first.sh) : sh; if (s2) { const nf = wb.styles.get(s2.styleAt(first.r, first.c)).nf; if (nf && (TB.Fmt.isDate(nf) || /€|%/.test(nf))) return nf; } }
    } catch (e) { }
    return null;
  }
  /** Texte d'édition d'une cellule (formule dans la langue de l'utilisateur, nombre selon son format) */
  WP.editText = function (sh, r, c) {
    const f = sh.fml.get(KEY(r, c));
    if (f) { const base = '=' + P.toUser(f.src); return f.arr ? '{' + base + '}' : base; }
    if (sh.spillOwner.has(KEY(r, c))) { const a = sh.fml.get(sh.spillOwner.get(KEY(r, c))); return a ? '=' + P.toUser(a.src) : ''; }
    const v = sh.get(r, c);
    if (v === null) return '';
    if (typeof v === 'number') {
      const nf = this.styles.get(sh.styleAt(r, c)).nf;
      if (nf && TB.Fmt.isDate(nf)) { const hasT = v % 1 !== 0, hasD = v >= 1; const d = hasD ? TB.Fmt.text(v, 'dd/mm/yyyy') : ''; const t = hasT ? TB.Fmt.text(v, TB.hms(v).s % 1 > 0.001 ? 'hh:mm:ss' : (Math.round((v % 1) * 86400) % 60 ? 'hh:mm:ss' : 'hh:mm')) : ''; return (d + (d && t ? ' ' : '') + t) || '0'; }
      if (nf && /%/.test(nf.split(';')[0].replace(/"[^"]*"/g, ''))) return TB.numText(TB.round15(v * 100)) + '%';
      return TB.numText(v);
    }
    if (typeof v === 'boolean') return TB.boolText(v);
    if (v instanceof TB.Err) return TB.errText(v);
    const s = String(v);
    const nf = this.styles.get(sh.styleAt(r, c)).nf;
    if (!TB.Fmt.isText(nf) && (TB.parseInput(s).v !== s || /^[=+-]/.test(s) && s.length > 1)) return "'" + s;
    return s;
  };
  /** Texte affiché d'une cellule (format appliqué) */
  WP.displayText = function (sh, r, c, width) {
    const v = sh.get(r, c); if (v === null) return '';
    const st = this.styles.get(sh.styleAt(r, c));
    return TB.Fmt.format(v, st.nf, { width }).s;
  };

  /* =====================================================================
     Structure : insérer / supprimer des lignes ou colonnes
     ===================================================================== */
  function shiftArr(a, at, n) { // n > 0 : insérer n cases vides ; n < 0 : supprimer
    if (!a || a.length <= at) return;
    if (n > 0) { const len = a.length; a.length = len + n; for (let i = len - 1; i >= at; i--) { const x = a[i]; if (x === undefined) delete a[i + n]; else a[i + n] = x; } for (let i = at; i < at + n; i++) delete a[i]; }
    else { const m = -n, len = a.length; for (let i = at; i + m < len; i++) { const x = a[i + m]; if (x === undefined) delete a[i]; else a[i] = x; } a.length = Math.max(at, len - m); }
  }
  TB.shiftArr = shiftArr;
  function shiftSet(set, at, n) { const l = Array.from(set); set.clear(); l.forEach((i) => { if (n < 0 && i >= at && i < at - n) return; set.add(i >= at ? i + n : i); }); }
  function shiftMap(map, at, n, axis) {
    const l = Array.from(map.entries()); map.clear();
    l.forEach(([k, v]) => { let r = Math.floor(k / 16384), c = k % 16384; let x = axis === 'r' ? r : c; if (n < 0 && x >= at && x < at - n) return; if (x >= at) x += n; if (axis === 'r') r = x; else c = x; map.set(KEY(r, c), v); });
  }
  /** Décale une plage {r1,c1,r2,c2} ; null si elle disparaît */
  TB.shiftRange = function (g, axis, at, n) {
    if (!g) return g;
    const a = axis === 'r' ? 'r1' : 'c1', b = axis === 'r' ? 'r2' : 'c2', MAX = axis === 'r' ? TB.MAX_ROWS - 1 : TB.MAX_COLS - 1;
    const o = Object.assign({}, g);
    if (g[a] === 0 && g[b] >= MAX) return o;
    if (n > 0) { if (g[a] >= at) o[a] += n; if (g[b] >= at) o[b] = Math.min(MAX, g[b] + n); return o; }
    const m = -n, e = at + m - 1;
    if (g[a] >= at && g[b] <= e) return null;
    o[a] = g[a] < at ? g[a] : g[a] > e ? g[a] - m : at;
    o[b] = g[b] < at ? g[b] : g[b] > e ? g[b] - m : at - 1;
    return o[b] < o[a] ? null : o;
  };
  /** Insertion (n > 0) ou suppression (n < 0) brute, sans journal */
  WP.rawShift = function (sh, axis, at, n) {
    const R = axis === 'r';
    if (R) { sh.vals.forEach((col) => shiftArr(col, at, n)); sh.sty.forEach((col) => shiftArr(col, at, n)); shiftArr(sh.rowH, at, n); shiftArr(sh.rowSt, at, n); shiftArr(sh.outR, at, n); shiftSet(sh.hidR, at, n); }
    else { if (n > 0) { shiftArr(sh.vals, at, n); shiftArr(sh.sty, at, n); } else { shiftArr(sh.vals, at, n); shiftArr(sh.sty, at, n); } shiftArr(sh.colW, at, n); shiftArr(sh.colSt, at, n); shiftArr(sh.outC, at, n); shiftSet(sh.hidC, at, n); }
    // formules de la feuille : nouvelles positions
    const fl = Array.from(sh.fml.values()); sh.fml.clear(); sh.fcols.clear();
    fl.forEach((f) => { let x = R ? f.r : f.c; if (n < 0 && x >= at && x < at - n) return; if (x >= at) x += n; if (R) f.r = x; else f.c = x; if (f.arr) f.arr = TB.shiftRange(f.arr, axis, at, n) || f.arr; sh.fml.set(KEY(f.r, f.c), f); sh.fcols.set(f.c, (sh.fcols.get(f.c) || 0) + 1); f.spill = null; });
    sh.spills.clear(); sh.spillOwner.clear();
    shiftMap(sh.notes, at, n, axis); shiftMap(sh.links, at, n, axis); shiftMap(sh.threads, at, n, axis);
    // formules de tout le classeur : références
    const op = { sheet: sh.name, axis, at, n };
    this.sheets.forEach((s) => s.fml.forEach((f) => { const a = P.restructure(f.ast, op, s.name); if (a !== f.ast) { f.ast = a; f.src = P.write(a); } }));
    this.names.forEach((nm) => { try { const a0 = P.parse(String(nm.f).replace(/^=/, '')); const a = P.restructure(a0, op, nm.sh || sh.name); if (a !== a0) nm.f = P.write(a); } catch (e) { } });
    // plages des objets de la feuille
    const sr = (g) => TB.shiftRange(g, axis, at, n);
    sh.merges = sh.merges.map(sr).filter((g) => g && (g.r1 !== g.r2 || g.c1 !== g.c2));
    sh.cf = sh.cf.map((x) => Object.assign({}, x, { ranges: x.ranges.map(sr).filter(Boolean) })).filter((x) => x.ranges.length);
    sh.dv = sh.dv.map((x) => Object.assign({}, x, { ranges: x.ranges.map(sr).filter(Boolean) })).filter((x) => x.ranges.length);
    if (sh.af) { const g = sr(sh.af); if (!g) sh.af = null; else { const cols = {}; Object.keys(sh.af.cols || {}).forEach((k) => { let c = +k; if (!R) { if (n < 0 && c >= at && c < at - n) return; if (c >= at) c += n; } cols[c] = sh.af.cols[k]; }); sh.af = Object.assign({}, g, { cols, sort: sh.af.sort }); } }
    sh.tables = sh.tables.map((t) => { const g = sr(t); if (!g) return null; const o = Object.assign({}, t, g); if (!R && g.c2 - g.c1 !== t.c2 - t.c1) { o.cols = t.cols.slice(); if (n > 0 && at > t.c1 && at <= t.c2) { const add = []; for (let i = 0; i < n; i++) add.push({ name: uniqueCol(t.cols, 'Colonne') }); o.cols.splice(at - t.c1, 0, ...add); } else if (n < 0) { const a2 = Math.max(at, t.c1), b2 = Math.min(at - n - 1, t.c2); if (b2 >= a2) o.cols.splice(a2 - t.c1, b2 - a2 + 1); } } return o; }).filter(Boolean);
    sh.objs.forEach((o) => { if (o.from) { const x = R ? 'r' : 'c'; if (o.from[x] >= at) o.from = Object.assign({}, o.from, { [x]: Math.max(at, o.from[x] + n) }); } if (o.ranges) { /* graphiques : leurs plages sont des formules */ } });
    if (sh.print && sh.print.area) { const g = TB.parseRange(sh.print.area); const g2 = g && sr(g); sh.print = Object.assign({}, sh.print, { area: g2 ? TB.rangeStr(g2) : null }); }
    sh.sparks = (sh.sparks || []).map((s) => { const g = sr(s.at); return g ? Object.assign({}, s, { at: g }) : null; }).filter(Boolean);
    this.sheets.forEach((s) => s.objs.forEach((o) => { if (o.type === 'chart' && o.chart) o.chart = TB.chartRestructure ? TB.chartRestructure(o.chart, op, s.name) : o.chart; }));
    sh._ext = null;
  };
  function uniqueCol(cols, base) { let i = cols.length + 1, n = base + i; const has = (x) => cols.some((c) => c.name.toLowerCase() === x.toLowerCase()); while (has(n)) n = base + (++i); return n; }
  /** propriétés de plages de toutes les feuilles (pour annuler une suppression) */
  function rangeProps(wb) { return { names: TB.deepClone(wb.names), sheets: wb.sheets.map((s) => ({ s, merges: s.merges, cf: s.cf, dv: s.dv, af: s.af, tables: s.tables, print: s.print, sparks: s.sparks, objs: s.objs.map((o) => Object.assign({}, o, { from: o.from && Object.assign({}, o.from), chart: o.chart && TB.deepClone(o.chart) })) })) }; }
  function restoreProps(wb, p) { wb.names = TB.deepClone(p.names); wb._nameAst = null; p.sheets.forEach((x) => { const s = x.s; s.merges = x.merges; s.cf = x.cf; s.dv = x.dv; s.af = x.af; s.tables = x.tables; s.print = x.print; s.sparks = x.sparks; s.objs = x.objs.map((o) => Object.assign({}, o, { from: o.from && Object.assign({}, o.from), chart: o.chart && TB.deepClone(o.chart) })); }); }
  function formulaSrcs(wb) { const m = new Map(); wb.sheets.forEach((s) => { const l = []; s.fml.forEach((f) => l.push([f.r, f.c, f.src])); m.set(s, l); }); return m; }
  function restoreSrcs(wb, m) { m.forEach((l, s) => { l.forEach(([r, c, src]) => { const f = s.fml.get(KEY(r, c)); if (f && f.src !== src) { f.src = src; try { f.ast = P.parse(src); } catch (e) { } } }); }); }
  /** Insérer (n > 0) ou supprimer (n < 0) des lignes (axis 'r') ou colonnes ('c'), avec annulation */
  WP.shiftCells = function (sh, axis, at, n) {
    sh = this.sheet(sh);
    const wb = this;
    let saved = null;
    if (n < 0) {
      // contenu supprimé + formules et plages avant modification
      const cells = []; const R = axis === 'r', m = -n;
      const ext = sh.extent();
      for (let c = R ? 0 : at; c <= (R ? Math.max(ext.c, sh.sty.length - 1) : at + m - 1); c++) for (let r = R ? at : 0; r <= (R ? at + m - 1 : Math.max(ext.r, 0)); r++) { const o = this.snap(sh, r, c); if (o) cells.push([r, c, o]); }
      const sizes = R ? { h: sh.rowH.slice(at, at + m), hid: Array.from(sh.hidR).filter((x) => x >= at && x < at + m), st: sh.rowSt.slice(at, at + m), out: sh.outR.slice(at, at + m) } : { w: sh.colW.slice(at, at + m), hid: Array.from(sh.hidC).filter((x) => x >= at && x < at + m), st: sh.colSt.slice(at, at + m), out: sh.outC.slice(at, at + m) };
      const notes = []; [sh.notes, sh.links, sh.threads].forEach((map, i) => map.forEach((v, k) => { const p = TB.unkey(k), x = R ? p.r : p.c; if (x >= at && x < at + m) notes.push([i, k, v]); }));
      saved = { cells, sizes, notes, srcs: formulaSrcs(this), props: rangeProps(this) };
    }
    const before = n > 0 ? { srcs: formulaSrcs(this), props: rangeProps(this) } : null;
    const redo = () => { wb.rawShift(sh, axis, at, n); };
    const undo = () => {
      wb.rawShift(sh, axis, at, -n);
      if (n > 0) { restoreSrcs(wb, before.srcs); restoreProps(wb, before.props); return; }
      const R = axis === 'r';
      saved.cells.forEach(([r, c, o]) => putCell(wb, sh, r, c, o));
      const s = saved.sizes; s[R ? 'h' : 'w'].forEach((v, i) => { if (v != null) (R ? sh.rowH : sh.colW)[at + i] = v; }); s.hid.forEach((x) => (R ? sh.hidR : sh.hidC).add(x)); s.st.forEach((v, i) => { if (v != null) (R ? sh.rowSt : sh.colSt)[at + i] = v; }); s.out.forEach((v, i) => { if (v != null) (R ? sh.outR : sh.outC)[at + i] = v; });
      saved.notes.forEach(([i, k, v]) => [sh.notes, sh.links, sh.threads][i].set(k, v));
      restoreSrcs(wb, saved.srcs); restoreProps(wb, saved.props);
    };
    this.suspend++; try { redo(); } finally { this.suspend--; }
    this.fnEntry(() => { wb.suspend++; try { redo(); } finally { wb.suspend--; } }, () => { wb.suspend++; try { undo(); } finally { wb.suspend--; } });
    if (this.tx) this.tx.sheets.add(sh);
  };

  /* =====================================================================
     Feuilles : ajouter, supprimer, renommer, déplacer, copier
     ===================================================================== */
  WP.addSheet = function (name, at) {
    const wb = this; name = name || this.uniqueSheetName('Feuil');
    let sh = null; const pos = at == null ? this.sheets.length : at; let id = null;
    const redo = () => { sh = wb.addSheetRaw(name, pos, id); id = sh.id; };
    const undo = () => { const i = wb.sheets.indexOf(sh); if (i >= 0) wb.sheets.splice(i, 1); if (wb.active >= wb.sheets.length) wb.active = wb.sheets.length - 1; };
    redo(); this.fnEntry(redo, undo); return sh;
  };
  WP.renameSheet = function (sh, name) {
    sh = this.sheet(sh); const old = sh.name; if (old === name) return true;
    if (!name || /[\\/?*[\]:]/.test(name) || name.length > 31 || /^'|'$/.test(name)) return false;
    const other = this.sheet(name); if (other && other !== sh) return false;
    const wb = this;
    const apply = (a, b) => { sh.name = b; wb.sheets.forEach((s) => s.fml.forEach((f) => { const x = P.renameSheet(f.ast, a, b); if (x !== f.ast) { f.ast = x; f.src = P.write(x); } })); wb.names.forEach((nm) => { if (nm.sh === a) nm.sh = b; try { const x0 = P.parse(String(nm.f).replace(/^=/, '')); const x = P.renameSheet(x0, a, b); if (x !== x0) nm.f = P.write(x); } catch (e) { } }); wb.sheets.forEach((s) => s.objs.forEach((o) => { if (o.type === 'chart' && o.chart && TB.chartRenameSheet) o.chart = TB.chartRenameSheet(o.chart, a, b); })); wb._nameAst = null; };
    apply(old, name); this.fnEntry(() => apply(old, name), () => apply(name, old)); return true;
  };
  WP.deleteSheet = function (sh) {
    sh = this.sheet(sh); if (this.sheets.filter((s) => !s.hidden).length <= 1 && !sh.hidden) return false;
    const wb = this, i = this.sheets.indexOf(sh); const srcs = formulaSrcs(this), props = rangeProps(this);
    const redo = () => { wb.sheets.splice(wb.sheets.indexOf(sh), 1); wb.sheets.forEach((s) => s.fml.forEach((f) => { const x = P.renameSheet(f.ast, sh.name, null); if (x !== f.ast) { f.ast = x; f.src = P.write(x); } })); wb.names = wb.names.filter((n) => n.sh !== sh.name); wb._nameAst = null; if (wb.active >= wb.sheets.length) wb.active = wb.sheets.length - 1; };
    const undo = () => { wb.sheets.splice(i, 0, sh); restoreSrcs(wb, srcs); restoreProps(wb, props); };
    redo(); this.fnEntry(redo, undo); return true;
  };
  WP.moveSheet = function (sh, to) {
    sh = this.sheet(sh); const wb = this, from = this.sheets.indexOf(sh);
    const mv = (a, b) => { wb.sheets.splice(a, 1); wb.sheets.splice(b, 0, sh); };
    mv(from, to); this.fnEntry(() => mv(from, to), () => mv(to, from));
  };
  WP.copySheet = function (sh, at, name) {
    sh = this.sheet(sh); const json = TB.IOJ.sheetToJson(this, sh);
    name = name || this.copyName(sh.name);
    json.name = name; delete json.id;
    const wb = this; let ns = null; const pos = at == null ? this.sheets.indexOf(sh) + 1 : at;
    // tableaux : noms uniques
    (json.tables || []).forEach((t) => { let k = 2; const b = t.name.replace(/\d+$/, ''); while (wb.table(t.name)) t.name = b + (k++); });
    const redo = () => { wb.suspend++; ns = TB.IOJ.sheetFromJson(wb, json, pos); wb.suspend--; };
    const undo = () => { const i = wb.sheets.indexOf(ns); if (i >= 0) wb.sheets.splice(i, 1); if (wb.active >= wb.sheets.length) wb.active = wb.sheets.length - 1; };
    redo(); this.fnEntry(redo, undo); return ns;
  };
  WP.copyName = function (base) { let i = 2, n = base + ' (2)'; while (this.sheet(n)) n = base + ' (' + (++i) + ')'; return n.length > 31 ? n.slice(-31) : n; };

  /* =====================================================================
     Création
     ===================================================================== */
  TB.newWorkbook = function (nSheets) { const wb = new Workbook(); for (let i = 0; i < (nSheets == null ? 1 : nSheets); i++) wb.addSheetRaw('Feuil' + (i + 1)); return wb; };
  /** Remplissage direct (modèles, import, essais) : pas de journal ; recalcul à la fin avec wb.finishLoad() */
  WP.load = function (sh, r, c, x, sid) {
    sh = this.sheet(sh);
    if (typeof x === 'string' && x[0] === '=' && x.length > 1) { this.suspend++; addFormula(this, sh, r, c, P.fromUser ? (function (t) { try { return P.write(P.parse(t.slice(1), P.CANON), P.CANON); } catch (e) { return t.slice(1); } })(x) : x.slice(1)); this.suspend--; }
    else setVal(sh, r, c, x);
    if (sid != null) setSty(sh, r, c, sid);
    sh._ext = null;
  };
  WP.loadFormula = function (sh, r, c, canon, sid, arr) { sh = this.sheet(sh); this.suspend++; addFormula(this, sh, r, c, canon, arr); this.suspend--; if (sid != null) setSty(sh, r, c, sid); sh._ext = null; };
  WP.finishLoad = function () { this.rebuild(); this.recalcAll(); this.undoStack = []; this.redoStack = []; };
})(typeof window !== 'undefined' ? window : globalThis);
