/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-tableur/tb-commands.js : ne pas modifier ici. */
/* Tableur — commandes : saisie (validation des données, liens automatiques, tableaux qui s'agrandissent), mise en forme
   (polices, couleurs, bordures, alignements, formats de nombre, fusion, styles), presse-papiers (avec Excel, LibreOffice
   et le web : texte tabulé et tableau HTML ; collage spécial), recopie, insertion / suppression, déplacement, lignes et
   colonnes (tailles, masquer, ajustement), feuilles, noms, liens, notes, commentaires, protection, somme automatique. */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur, P = TB.Formula;
  const A = window.TableurApp = window.TableurApp || {};
  const C = A.cmd = A.cmd || {};
  const KEY = TB.key, MAXR = TB.MAX_ROWS, MAXC = TB.MAX_COLS;
  const wb = () => A.wb, sh = () => A.wb.cur, G = () => A.grid;
  const fullCol = (g) => g.r1 === 0 && g.r2 >= MAXR - 1, fullRow = (g) => g.c1 === 0 && g.c2 >= MAXC - 1;
  A.selRanges = () => G().sel.ranges.map((g) => Object.assign({}, g));
  /** plage limitée à la zone utile (lignes / colonnes entières) */
  A.bounded = function (g, s) { s = s || sh(); const e = s.extent(); return { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(g.r1, e.r)), c2: Math.min(g.c2, Math.max(g.c1, e.c)) }; };
  /** transaction : fn() puis recalcul et rafraîchissement */
  A.tx = function (label, fn, opt) {
    const W = wb(); W.begin(label);
    let r; try { r = fn(); } catch (e) { console.error(e); O.toast(e.message || String(e), { bad: true }); }
    finally { if (W.tx) W.tx.sel = { sh: sh(), sel: JSON.parse(JSON.stringify(G().sel)) }; W.commit(); }
    void opt;
    return r;
  };

  /* ---------------- protection ---------------- */
  A.locked = (s, r, c) => !!(s.protect && wb().styles.get(s.styleAt(r, c)).lk !== false);
  A.canEdit = function (s, r, c) { if (A.locked(s, r, c)) { protectedMsg(); return false; } return true; };
  function protectedMsg() { O.toast('Cette cellule est protégée. Révision › Ôter la protection de la feuille pour la modifier.', { bad: true, ms: 4500 }); }
  A.guard = function (what) {
    const s = sh(); if (!s.protect) return true;
    const allow = s.protect.allow || {};
    if (what && allow[what]) return true;
    if (what === 'cells') { for (const g of G().sel.ranges) { const b = A.bounded(g); for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) if (A.locked(s, r, c)) { protectedMsg(); return false; } } return true; }
    O.toast('La feuille est protégée : cette action n\'est pas autorisée.', { bad: true }); return false;
  };
  A.guardBook = function () { if (wb().protect && wb().protect.structure) { O.toast('La structure du classeur est protégée (Révision › Protéger le classeur).', { bad: true }); return false; } return true; };

  /* ---------------- validation des données ---------------- */
  A.dvAt = function (s, r, c) { for (const d of s.dv) for (const g of d.ranges) if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return Object.assign({ _g: g }, d); return null; };
  A.dvList = function (s, d, r, c) {
    const src = String(d.f1 || '');
    if (/^=/.test(src) || /^[A-Za-z$'].*[!:]|^\$?[A-Z]{1,3}\$?\d+/.test(src) && !/[;,]/.test(src)) {
      const v = TB.CF.evalF({ wb: wb(), sh: s }, src.replace(/^=/, ''), r, c, d._g || null);
      if (v instanceof TB.Ref || v instanceof TB.Arr) return TB.grid(v).reduce((a, row) => a.concat(row), []).filter((x) => x !== null && x !== '').map((x) => TB.Fmt.text(x, 'General'));
      try { const ast = P.parse(src.replace(/^=/, '')); const x = TB.ev(ast, { wb: wb(), sh: s, r, c, env: null, depth: 0 }); if (x instanceof TB.Ref || x instanceof TB.Arr) return TB.grid(x).reduce((a, row) => a.concat(row), []).filter((v) => v !== null && v !== '').map((v) => typeof v === 'number' ? TB.numText(v) : String(v)); } catch (e) { }
    }
    return src.replace(/^"|"$/g, '').split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  };
  A.dvCheck = function (s, d, r, c, v) {
    if (v === null || v === '') return d.blank !== false;
    const num = typeof v === 'number' ? v : null;
    const lim = (f) => { const x = TB.CF.evalF({ wb: wb(), sh: s }, String(f), r, c, d._g); return typeof x === 'number' ? x : TB.toNum(x); };
    const op = (x) => { const a = lim(d.f1), b = d.f2 != null ? lim(d.f2) : null; switch (d.op || 'between') { case 'between': return x >= a && x <= b; case 'notBetween': return x < a || x > b; case 'eq': return x === a; case 'ne': return x !== a; case 'gt': return x > a; case 'lt': return x < a; case 'ge': return x >= a; case 'le': return x <= a; } return true; };
    switch (d.type) {
      case 'whole': return num != null && Number.isInteger(num) && op(num);
      case 'decimal': return num != null && op(num);
      case 'date': return num != null && op(Math.floor(num));
      case 'time': return num != null && op(num - Math.floor(num));
      case 'textLength': return op(String(typeof v === 'number' ? TB.numText(v) : v).length);
      case 'list': { const l = A.dvList(s, d, r, c).map((x) => x.toLowerCase()); const t = (typeof v === 'number' ? TB.numText(v) : String(v)).toLowerCase(); return l.indexOf(t) >= 0; }
      case 'custom': { const x = TB.CF.evalF({ wb: wb(), sh: s }, String(d.f1), r, c, d._g); return x === true || (typeof x === 'number' && x !== 0); }
    }
    return true;
  };
  async function dvRefuse(d) {
    const title = d.errTitle || 'Tableur', msg = d.errMsg || 'Cette valeur ne correspond pas aux restrictions de validation définies pour cette cellule.';
    if (d.errStyle === 'warning') return (await O.dialog({ title, body: '<p>' + O.esc(msg) + '</p><p>Continuer ?</p>', buttons: [{ label: 'Non', value: 'no' }, { label: 'Annuler', value: null }, { label: 'Oui', value: 'yes', primary: true }] })) === 'yes' ? 'ok' : 'retry';
    if (d.errStyle === 'information') return (await O.dialog({ title, body: '<p>' + O.esc(msg) + '</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'OK', value: 'ok', primary: true }] })) === 'ok' ? 'ok' : 'cancel';
    const v = await O.dialog({ title, body: '<p>' + O.esc(msg) + '</p>', buttons: [{ label: 'Annuler', value: 'cancel' }, { label: 'Réessayer', value: 'retry', primary: true }] });
    return v === 'cancel' ? 'cancel' : 'retry';
  }

  /* ---------------- saisie ---------------- */
  const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i, MAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  A.commitInput = function (s, r, c, text, opt) {
    opt = opt || {};
    const W = wb();
    if (opt.array) return arrayFormula(s, text);
    const cell = W.inputToCell(s, r, c, text);
    if (cell.error) { formulaError(text, cell); return false; }
    // validation
    const d = A.dvAt(s, r, c);
    if (d && d.type !== 'any' && !cell.f && d.showErr !== false && !A._dvBypass) {
      if (!A.dvCheck(s, d, r, c, cell.v)) {
        dvRefuse(d).then((res) => { if (res === 'ok') { A._dvBypass = true; A.commitInput(s, r, c, text, opt); A._dvBypass = false; G().advance('down'); } else if (res === 'retry') { G().select(r, c); G().beginEdit({ text, mode: 'edit' }); } });
        return true;
      }
    }
    // liste : casse de la liste
    if (d && d.type === 'list' && typeof cell.v === 'string') { const l = A.dvList(s, d, r, c); const m = l.find((x) => x.toLowerCase() === cell.v.toLowerCase()); if (m) cell.v = m; }
    A.tx('Saisie', () => {
      if (opt.all) {
        // Ctrl+Entrée : toute la sélection
        for (const g0 of G().sel.ranges) { const g = A.bounded(g0); for (let rr = g.r1; rr <= g.r2; rr++) for (let cc = g.c1; cc <= g.c2; cc++) { if (A.locked(s, rr, cc)) continue; const o = Object.assign({}, cell); if (o.f) o.f = P.write(P.shift(P.parse(o.f), rr - r, cc - c)); const own = s.ownStyle(rr, cc); if (own !== undefined && o.s === undefined) o.s = own; W.setCell(s, rr, cc, o); } }
        return;
      }
      if (cell.v === null && !cell.f && W.snap(s, r, c) == null) return;
      // texte qui ressemble à un lien
      if (typeof cell.v === 'string' && (URL_RE.test(cell.v) || MAIL_RE.test(cell.v)) && !s.links.has(KEY(r, c)) && A.settings.autoLink !== false) {
        const url = MAIL_RE.test(cell.v) ? 'mailto:' + cell.v : (/^www\./i.test(cell.v) ? 'https://' + cell.v : cell.v);
        W.setProp(s.links, KEY(r, c), { url }); cell.s = W.styles.with(cell.s || 0, { fc: '#0563C1', u: 'single' });
      }
      W.setCell(s, r, c, cell);
      // tableau : agrandir si on écrit juste sous / à droite
      growTable(s, r, c);
    });
    autoWiden(s, r, c);
    return true;
  };
  /** comme les tableurs courants : une date ou un nombre formaté trop large pour une colonne de largeur standard l'élargit */
  function autoWiden(s, r, c) {
    if (s.colW[c] != null || s.mergeAt(r, c)) return;
    const v = s.get(r, c); if (typeof v !== 'number') return;
    const Gr = G(); const st = Gr.styleAt(r, c); if (!st.nf || /^General$/i.test(st.nf) || st.wr) return;
    const t = TB.Fmt.format(v, st.nf).s; const w = Gr.textWidth(Gr.fontOf(st, 1), String(t)) + 8;
    if (w > s.colWidth(c) && w < 400) { s.colW[c] = Math.ceil(w); Gr.updateExtent && Gr.updateExtent(); Gr.invalidate(); }
  }
  function growTable(s, r, c) {
    const W = wb();
    for (const t of s.tables) {
      if (r === t.r2 + 1 && c >= t.c1 && c <= t.c2 && !t.totals) { const nt = Object.assign({}, t, { r2: r }); replaceTable(s, t, nt); A.copyTableFormulasDown(s, nt, r); return; }
      if (c === t.c2 + 1 && r >= t.r1 && r <= t.r2 && r === t.r1 && t.header !== false) { const v = s.get(r, c); const nt = Object.assign({}, t, { c2: c, cols: t.cols.concat([{ name: typeof v === 'string' && v ? v : 'Colonne' + (t.cols.length + 1) }]) }); replaceTable(s, t, nt); return; }
    }
    void W;
  }
  function replaceTable(s, t, nt) { const l = s.tables.slice(); l[l.indexOf(t)] = nt; wb().setProp(s, 'tables', l, true); }
  A.replaceTable = replaceTable;
  /** colonnes calculées d'un tableau : recopier la formule de la ligne au-dessus */
  A.copyTableFormulasDown = function (s, t, r) {
    const W = wb();
    for (let c = t.c1; c <= t.c2; c++) { const f = s.fml.get(KEY(r - 1, c)); if (f && s.get(r, c) === null && !s.fml.has(KEY(r, c)) && r - 1 > t.r1) W.setCell(s, r, c, { f: P.write(P.shift(f.ast, 1, 0)), s: s.ownStyle(r - 1, c) }); }
  };
  function formulaError(text, cell) {
    const pos = cell.pos != null ? cell.pos + 1 : null;
    O.dialog({ title: 'Formule incorrecte', body: '<p>' + O.esc(cell.error) + '</p>' + (pos != null ? '<p class="o-hint" style="font-family:Consolas,monospace;white-space:pre-wrap">' + O.esc(text) + '\n' + ' '.repeat(Math.max(0, pos)) + '^</p>' : '') + '<p class="o-hint">Rappel : les arguments sont séparés par « ' + O.esc(TB.loc.arg) + ' » et la virgule décimale est « ' + O.esc(TB.loc.dec) + ' » (réglage : Formules › Séparateurs). Pour écrire du texte qui commence par « = », tapez d\'abord une apostrophe.</p>', buttons: [{ label: 'OK', value: 1, primary: true }] }).then(() => { const g = G(); if (g.edit) { const el = g.editEl(); el.focus(); if (pos != null) try { el.setSelectionRange(pos, pos); } catch (e) { } } });
  }
  function arrayFormula(s, text) {
    const W = wb(); const g = G().range();
    const body = text.replace(/^[{=]+/, '').replace(/}$/, '');
    let canon; try { canon = P.write(P.parse(body, P.userLoc())); } catch (e) { formulaError(text, { error: e.message, pos: e.pos }); return false; }
    A.tx('Formule matricielle', () => { for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if (r !== g.r1 || c !== g.c1) W.setCell(s, r, c, null); W.setCell(s, g.r1, g.c1, { f: canon, a: { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c2 } }); });
    return true;
  }
  /** effacer : 'all' | 'contents' | 'formats' | 'notes' | 'links' */
  C.clear = function (what) {
    what = what || 'contents'; if (!A.guard('cells')) return;
    const s = sh(), W = wb();
    A.tx(what === 'contents' ? 'Effacer' : 'Effacer (' + what + ')', () => {
      for (const g0 of G().sel.ranges) {
        const g = A.bounded(g0);
        if (what === 'formats' || what === 'all') {
          if (fullCol(g0)) for (let c = g0.c1; c <= Math.min(g0.c2, MAXC - 1); c++) if (s.colSt[c]) W.setProp(s.colSt, c, undefined);
          if (fullRow(g0)) for (let r = g0.r1; r <= g0.r2; r++) if (s.rowSt[r]) W.setProp(s.rowSt, r, undefined);
        }
        const list = [];
        for (let c = g.c1; c <= g.c2; c++) {
          const col = s.vals[c], stc = s.sty[c]; const n = Math.max(col ? col.length : 0, stc ? stc.length : 0);
          for (let r = g.r1; r <= Math.min(g.r2, n - 1); r++) {
            const o = W.snap(s, r, c); if (!o) continue;
            let x = null;
            if (what === 'contents') { if (o.s === undefined) x = null; else x = { s: o.s }; if (o.v == null && !o.f) continue; }
            else if (what === 'formats') { if (o.s === undefined) continue; x = Object.assign({}, o); delete x.s; }
            else if (what === 'notes' || what === 'links') continue;
            list.push([r, c, x]);
          }
          if (what === 'contents' || what === 'all') { /* cellules propagées : rien */ }
        }
        // formules dont la cellule n'a pas de valeur stockée
        s.fml.forEach((f) => { if (TB.inRange(g, f.r, f.c) && (what === 'contents' || what === 'all') && !list.some((x) => x[0] === f.r && x[1] === f.c)) list.push([f.r, f.c, what === 'contents' && s.ownStyle(f.r, f.c) !== undefined ? { s: s.ownStyle(f.r, f.c) } : null]); });
        W.setCells(s, list);
        if (what === 'all' || what === 'notes') [s.notes, s.threads].forEach((m) => Array.from(m.keys()).forEach((k) => { const p = TB.unkey(k); if (TB.inRange(g, p.r, p.c)) W.setProp(m, k, undefined); }));
        if (what === 'all' || what === 'links' || what === 'formats') Array.from(s.links.keys()).forEach((k) => { const p = TB.unkey(k); if (TB.inRange(g, p.r, p.c) && what !== 'formats') W.setProp(s.links, k, undefined); });
        if (what === 'all' || what === 'formats') { const m2 = s.merges.filter((m) => !(m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2)); if (m2.length !== s.merges.length) W.setProp(s, 'merges', m2); const cf2 = s.cf.map((x) => Object.assign({}, x, { ranges: x.ranges.filter((rg) => !(rg.r1 >= g.r1 && rg.r2 <= g.r2 && rg.c1 >= g.c1 && rg.c2 <= g.c2)) })).filter((x) => x.ranges.length); if (cf2.length !== s.cf.length || JSON.stringify(cf2) !== JSON.stringify(s.cf)) W.setProp(s, 'cf', cf2, true); }
      }
    });
  };

  /* ---------------- styles ---------------- */
  /** appliquer une modification de style à la sélection : patch (objet) ou fn(style) → patch */
  A.applyStyle = function (patch, label, ranges) {
    if (!A.guard('format')) return;
    const s = sh(), W = wb(), Pool = W.styles;
    const fn = typeof patch === 'function' ? patch : () => patch;
    const memo = new Map();
    const conv = (id) => { let v = memo.get(id); if (v === undefined) { v = Pool.with(id || 0, fn(Pool.get(id || 0))); memo.set(id, v); } return v; };
    A.tx(label || 'Mise en forme', () => {
      for (const g0 of (ranges || G().sel.ranges)) {
        if (fullCol(g0) || fullRow(g0)) {
          if (fullCol(g0) && !fullRow(g0)) for (let c = g0.c1; c <= g0.c2; c++) W.setProp(s.colSt, c, conv(s.colSt[c] || 0) || undefined);
          if (fullRow(g0) && !fullCol(g0)) for (let r = g0.r1; r <= Math.min(g0.r2, MAXR - 1); r++) W.setProp(s.rowSt, r, conv(s.rowSt[r] || 0) || undefined);
          if (fullRow(g0) && fullCol(g0)) { const e = s.extent(); for (let c = 0; c <= Math.max(e.c, 30); c++) W.setProp(s.colSt, c, conv(s.colSt[c] || 0) || undefined); }
          // cellules déjà mises en forme ou remplies
          const g = A.bounded(g0); const list = [];
          for (let c = g.c1; c <= g.c2; c++) { const col = s.vals[c] || [], stc = s.sty[c] || []; const n = Math.max(col.length, stc.length); for (let r = g.r1; r <= Math.min(g.r2, n - 1); r++) { if (stc[r] === undefined && (col[r] === undefined || col[r] === null)) continue; const o = W.snap(s, r, c) || {}; o.s = conv(o.s !== undefined ? o.s : s.styleAt(r, c)); list.push([r, c, o]); } }
          W.setCells(s, list);
          continue;
        }
        const g = TB.rangeSize(g0) > 4e6 ? A.bounded(g0) : g0; const list = [];
        for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const o = W.snap(s, r, c) || {}; const cur = o.s !== undefined ? o.s : s.styleAt(r, c); const nid = conv(cur); if (nid === cur && o.s !== undefined) continue; o.s = nid; list.push([r, c, o]); }
        W.setCells(s, list);
      }
    });
    A.lastAction = { label, run: () => A.applyStyle(patch, label) };
  };
  A.curStyle = () => G().styleAt(G().sel.r, G().sel.c);
  C.toggle = (k) => { const on = !A.curStyle()[k]; A.applyStyle({ [k]: on || null }, { b: 'Gras', i: 'Italique', st: 'Barré', wr: 'Renvoyer à la ligne' }[k] || k); };
  C.underline = (kind) => { const cur = A.curStyle().u; const v = kind === undefined ? (cur ? null : 'single') : (cur === kind ? null : kind); A.applyStyle({ u: v }, 'Souligné'); };
  C.font = (name) => A.applyStyle({ fn: name }, 'Police');
  C.fontSize = (n) => { n = Math.max(1, Math.min(409, +n || 11)); A.applyStyle({ fs: n }, 'Taille'); autoHeightSel(); };
  C.growFont = (d) => { const SZ = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]; A.applyStyle((st) => { const f = st.fs || 11; let n = d > 0 ? SZ.find((x) => x > f) || f + 10 : SZ.slice().reverse().find((x) => x < f) || Math.max(1, f - 1); return { fs: n }; }, 'Taille'); autoHeightSel(); };
  C.color = (c) => A.applyStyle({ fc: c && c !== 'auto' ? c : null }, 'Couleur de police');
  C.fill = (c) => A.applyStyle({ bg: c && c !== 'none' ? c : null, pat: null }, 'Remplissage');
  C.align = (h) => A.applyStyle({ ha: h === 'general' ? null : h }, 'Alignement');
  C.valign = (v) => A.applyStyle({ va: v === 'bottom' ? null : v }, 'Alignement vertical');
  C.indent = (d) => A.applyStyle((st) => { const n = Math.max(0, Math.min(15, (st.ind || 0) + d)); return { ind: n || null, ha: n && (!st.ha || st.ha === 'general' || st.ha === 'center') ? (d > 0 ? 'left' : st.ha) : st.ha }; }, 'Retrait');
  C.rotate = (deg) => A.applyStyle({ rot: deg || null }, 'Orientation');
  C.numFmt = (code) => { A.applyStyle({ nf: code === 'General' ? null : code }, 'Format de nombre'); };
  C.addDec = (d) => { const s = sh(); const v = s.get(G().sel.r, G().sel.c); A.applyStyle((st) => ({ nf: TB.Fmt.addDecimal(st.nf, d, v) }), d > 0 ? 'Ajouter une décimale' : 'Réduire les décimales'); };
  C.clearFormats = () => C.clear('formats');
  const BORDER = { s: 'thin', c: '#000000' };
  /** bordures : 'all' | 'outer' | 'inner' | 'top' | 'bottom' | 'left' | 'right' | 'none' | 'thickOuter' | 'thickBottom' | 'doubleBottom' | 'topBottom' | 'topThickBottom' | 'topDoubleBottom' | 'diagDown' | 'diagUp' */
  C.borders = function (kind, spec) {
    if (!A.guard('format')) return;
    spec = spec || A.borderSpec || BORDER;
    const s = sh(), W = wb(), Pool = W.styles;
    A.tx('Bordures', () => {
      for (const g0 of G().sel.ranges) {
        const g = A.bounded(g0); if (fullCol(g0)) g.r2 = Math.min(g.r2, s.extent().r + 50); if (fullRow(g0)) g.c2 = Math.min(g.c2, s.extent().c + 10);
        const list = [];
        for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) {
          const o = W.snap(s, r, c) || {}; const st = Object.assign({}, Pool.get(o.s !== undefined ? o.s : s.styleAt(r, c)));
          const top = r === g.r1, bot = r === g.r2, lef = c === g.c1, rig = c === g.c2;
          const thick = { s: 'medium', c: spec.c }, dbl = { s: 'double', c: spec.c };
          switch (kind) {
            case 'none': delete st.bt; delete st.bb; delete st.bl; delete st.br; delete st.bd; delete st.bu; break;
            case 'all': st.bt = st.bb = st.bl = st.br = spec; break;
            case 'outer': if (top) st.bt = spec; if (bot) st.bb = spec; if (lef) st.bl = spec; if (rig) st.br = spec; break;
            case 'thickOuter': if (top) st.bt = thick; if (bot) st.bb = thick; if (lef) st.bl = thick; if (rig) st.br = thick; break;
            case 'inner': if (!top) st.bt = spec; if (!bot) st.bb = spec; if (!lef) st.bl = spec; if (!rig) st.br = spec; break;
            case 'top': if (top) st.bt = spec; break;
            case 'bottom': if (bot) st.bb = spec; break;
            case 'left': if (lef) st.bl = spec; break;
            case 'right': if (rig) st.br = spec; break;
            case 'thickBottom': if (bot) st.bb = thick; break;
            case 'doubleBottom': if (bot) st.bb = dbl; break;
            case 'topBottom': if (top) st.bt = spec; if (bot) st.bb = spec; break;
            case 'topThickBottom': if (top) st.bt = spec; if (bot) st.bb = thick; break;
            case 'topDoubleBottom': if (top) st.bt = spec; if (bot) st.bb = dbl; break;
            case 'diagDown': st.bu = spec; break;
            case 'diagUp': st.bd = spec; break;
          }
          o.s = Pool.add(st); list.push([r, c, o]);
        }
        W.setCells(s, list);
        // voisins : côtés communs effacés (aucune bordure)
        if (kind === 'none') {
          const fix = (r, c, k) => { if (r < 0 || c < 0) return; const o = W.snap(s, r, c); if (!o || o.s === undefined) return; const st = Pool.get(o.s); if (!st[k]) return; const x = Object.assign({}, st); delete x[k]; o.s = Pool.add(x); W.setCell(s, r, c, o); };
          for (let c = g.c1; c <= g.c2; c++) { fix(g.r1 - 1, c, 'bb'); fix(g.r2 + 1, c, 'bt'); }
          for (let r = g.r1; r <= g.r2; r++) { fix(r, g.c1 - 1, 'br'); fix(r, g.c2 + 1, 'bl'); }
        }
      }
    });
  };
  /** fusionner : 'center' | 'merge' | 'across' | 'unmerge' */
  C.merge = async function (kind) {
    if (!A.guard('format')) return;
    const s = sh(), W = wb();
    const ranges = G().sel.ranges.map((g) => A.bounded(g));
    if (kind === 'unmerge' || (kind === 'center' && ranges.every((g) => s.merges.some((m) => TB.sameRange(m, g))))) {
      A.tx('Annuler la fusion', () => { const l = s.merges.filter((m) => !ranges.some((g) => TB.intersect(m, g))); W.setProp(s, 'merges', l); }); return;
    }
    // données perdues ?
    let lost = 0; for (const g of ranges) for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if ((r !== g.r1 || c !== g.c1) && s.get(r, c) !== null && kind !== 'across') lost++;
    if (lost && !(await O.confirm('Fusionner les cellules', 'La fusion ne garde que la valeur en haut à gauche ; les autres valeurs (' + lost + ') seront supprimées.', 'Fusionner'))) return;
    A.tx('Fusionner', () => {
      let l = s.merges.filter((m) => !ranges.some((g) => TB.intersect(m, g)));
      for (const g of ranges) {
        if (g.r1 === g.r2 && g.c1 === g.c2) continue;
        if (kind === 'across') { for (let r = g.r1; r <= g.r2; r++) if (g.c1 !== g.c2) l.push({ r1: r, c1: g.c1, r2: r, c2: g.c2 }); }
        else { for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if ((r !== g.r1 || c !== g.c1) && (s.get(r, c) !== null || s.fml.has(KEY(r, c)))) { const o = W.snap(s, r, c) || {}; W.setCell(s, r, c, o.s !== undefined ? { s: o.s } : null); } l.push(Object.assign({}, g)); }
      }
      W.setProp(s, 'merges', l);
    });
    if (kind === 'center') A.applyStyle({ ha: 'center' }, 'Fusionner et centrer', ranges.map((g) => ({ r1: g.r1, c1: g.c1, r2: g.r1, c2: g.c1 })));
    G().select(ranges[0].r1, ranges[0].c1, { noScroll: true });
  };
  C.cellStyle = function (st) { A.applyStyle(() => { const o = {}; ['fn', 'fs', 'b', 'i', 'u', 'st', 'fc', 'bg', 'bt', 'bb', 'bl', 'br', 'ha', 'va', 'wr', 'nf'].forEach((k) => { o[k] = st[k] != null ? st[k] : null; }); return o; }, 'Style de cellule'); };

  /* ---------------- reproduire la mise en forme ---------------- */
  C.painter = function (keep) {
    if (A.painter) { A.painter = null; O.toast('Reproduction de la mise en forme annulée', { ms: 1200 }); A.refreshUi(); return; }
    const s = sh(), g = A.bounded(G().range());
    const H = Math.min(g.r2 - g.r1 + 1, 200), Wd = Math.min(g.c2 - g.c1 + 1, 100); const st = [];
    for (let i = 0; i < H; i++) { const row = []; for (let j = 0; j < Wd; j++) row.push(s.styleAt(g.r1 + i, g.c1 + j)); st.push(row); }
    A.painter = { st, keep: !!keep, merges: s.merges.filter((m) => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2).map((m) => ({ r1: m.r1 - g.r1, c1: m.c1 - g.c1, r2: m.r2 - g.r1, c2: m.c2 - g.c1 })), cw: Array.from({ length: Wd }, (_, j) => s.colW[g.c1 + j]) };
    O.toast('Sélectionnez les cellules qui recevront la mise en forme' + (keep ? ' (Échap pour arrêter)' : ''), { ms: 2500 }); A.refreshUi();
  };
  A.painterApply = function () {
    const p = A.painter; if (!p) return; const s = sh(), W = wb(), g = A.bounded(G().range());
    A.tx('Reproduire la mise en forme', () => {
      const list = [];
      for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const o = W.snap(s, r, c) || {}; o.s = p.st[(r - g.r1) % p.st.length][(c - g.c1) % p.st[0].length]; list.push([r, c, o]); }
      W.setCells(s, list);
      if (p.merges.length) { const l = s.merges.slice(); p.merges.forEach((m) => l.push({ r1: m.r1 + g.r1, c1: m.c1 + g.c1, r2: m.r2 + g.r1, c2: m.c2 + g.c1 })); W.setProp(s, 'merges', l); }
    });
    if (!p.keep) A.painter = null; A.refreshUi();
  };

  /* ---------------- presse-papiers ---------------- */
  A.clip = null;
  function clipData(s, g, cut) {
    const W = wb(); const H = g.r2 - g.r1 + 1, Wd = g.c2 - g.c1 + 1;
    const cells = []; const rows = [];
    for (let i = 0; i < H; i++) { const row = []; const trow = []; for (let j = 0; j < Wd; j++) { const r = g.r1 + i, c = g.c1 + j; const o = W.snap(s, r, c); const own = s.ownStyle(r, c); const sp = s.spillOwner.has(KEY(r, c)); const x = o ? Object.assign({}, o) : {}; if (sp) x.v = s.get(r, c); if (own === undefined) x.s = s.styleAt(r, c) || undefined; x.val = s.get(r, c); row.push(x); trow.push(s.hidR.has(r) || s.hidC.has(c) ? null : W.displayText(s, r, c)); } cells.push(row); rows.push(trow); }
    const text = rows.filter((r) => r.some((x) => x !== null)).map((r) => r.filter((x) => x !== null).map((x) => /[\t\n"]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x).join('\t')).join('\r\n') + (H === 1 && Wd === 1 ? '' : '\r\n');
    const notes = []; s.notes.forEach((v, k) => { const p = TB.unkey(k); if (TB.inRange(g, p.r, p.c)) notes.push([p.r - g.r1, p.c - g.c1, v]); });
    const merges = s.merges.filter((m) => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2).map((m) => ({ r1: m.r1 - g.r1, c1: m.c1 - g.c1, r2: m.r2 - g.r1, c2: m.c2 - g.c1 }));
    const cw = Array.from({ length: Wd }, (_, j) => s.colW[g.c1 + j]);
    const dv = s.dv.map((d) => Object.assign({}, d, { ranges: d.ranges.map((x) => TB.intersect(x, g)).filter(Boolean).map((x) => ({ r1: x.r1 - g.r1, c1: x.c1 - g.c1, r2: x.r2 - g.r1, c2: x.c2 - g.c1 })) })).filter((d) => d.ranges.length);
    return { sh: s, g: Object.assign({}, g), cells, text, html: TB.Clip.toHtml(W, s, g), cut: !!cut, notes, merges, cw, dv, marquee: true, styles: W.styles };
  }
  C.copy = function (cut, viaEvent) {
    if (G().sel.ranges.length > 1) { O.toast('Impossible de copier plusieurs plages à la fois', { bad: true }); return null; }
    if (cut && !A.guard('cells')) return null;
    const s = sh(); let g = A.bounded(G().range());
    if (TB.rangeSize(g) > 3e6) { O.toast('Sélection trop grande pour le presse-papiers', { bad: true }); return null; }
    A.clip = clipData(s, g, cut);
    A.startMarquee && A.startMarquee();
    if (!viaEvent) { const C2 = A.clip; TB.Clip.writeSystem(C2.text, C2.html).then((ok) => { if (!ok) O.toast(cut ? 'Coupé (dans Tableur)' : 'Copié (dans Tableur)', { ms: 1200 }); }); }
    return A.clip;
  };
  /** coller depuis le presse-papiers de Tableur (formules décalées) ; opt : {what:'all'|'values'|'formulas'|'formats'|'notes'|'validation'|'noBorders'|'widths'|'valuesFormats'|'formulasFormats', op:'add'|'sub'|'mul'|'div', skipBlanks, transpose, link} */
  C.pasteClip = function (opt) {
    const K = A.clip; if (!K) return false; opt = opt || {};
    if (!A.guard('cells')) return true;
    const s = sh(), W = wb(), dst0 = G().range();
    const H0 = K.cells.length, W0 = K.cells[0].length;
    const tr = !!opt.transpose; const H = tr ? W0 : H0, Wd = tr ? H0 : W0;
    // répétition si la destination est un multiple de la source
    const dg = A.bounded(dst0);
    const rep = (dg.r2 - dg.r1 + 1) % H === 0 && (dg.c2 - dg.c1 + 1) % Wd === 0 && (dg.r2 - dg.r1 + 1 > H || dg.c2 - dg.c1 + 1 > Wd) ? { nr: (dg.r2 - dg.r1 + 1) / H, nc: (dg.c2 - dg.c1 + 1) / Wd } : { nr: 1, nc: 1 };
    const r0 = dst0.r1, c0 = dst0.c1;
    if (r0 + H * rep.nr > MAXR || c0 + Wd * rep.nc > MAXC) { O.toast('La zone de collage dépasse la feuille', { bad: true }); return true; }
    const what = opt.what || 'all';
    const dstSheetName = s.name;
    A.tx(K.cut ? 'Couper-coller' : (what === 'all' ? 'Coller' : 'Collage spécial'), () => {
      if (K.cut && what === 'all') { moveBlock(K.sh, K.g, s, { r1: r0, c1: c0, r2: r0 + H0 - 1, c2: c0 + W0 - 1 }, K); return; }
      const list = [];
      for (let a = 0; a < rep.nr; a++) for (let b = 0; b < rep.nc; b++) for (let i = 0; i < H; i++) for (let j = 0; j < Wd; j++) {
        const x = tr ? K.cells[j][i] : K.cells[i][j];
        const r = r0 + a * H + i, c = c0 + b * Wd + j;
        const si = tr ? j : i, sj = tr ? i : j;
        const sr = K.g.r1 + si, scc = K.g.c1 + sj;
        if (opt.skipBlanks && x.val === null && !x.f) continue;
        const cur = W.snap(s, r, c) || {};
        let o = {};
        const styleSrc = x.s !== undefined ? (K.styles === W.styles ? x.s : W.styles.add(K.styles.get(x.s))) : undefined;
        const formula = () => { if (opt.link) return TB.quoteSheet(K.sh.name) === TB.quoteSheet(dstSheetName) && K.sh === s ? TB.addr(sr, scc) : TB.quoteSheet(K.sh.name) + '!' + TB.addr(sr, scc); if (!x.f) return null; let ast = P.parse(x.f); ast = P.shift(ast, r - sr, c - scc); return P.write(ast); };
        if (what === 'formats') { o = Object.assign({}, cur); if (styleSrc !== undefined) o.s = styleSrc; else delete o.s; }
        else {
          let f = what === 'values' || what === 'valuesFormats' ? null : formula();
          let v = f ? undefined : (x.f || x.v === undefined ? x.val : x.v);
          if (opt.op && !f) { const old = s.get(r, c); const a1 = typeof old === 'number' ? old : old === null ? 0 : null, b1 = typeof v === 'number' ? v : v === null ? 0 : null; if (a1 != null && b1 != null) v = opt.op === 'add' ? a1 + b1 : opt.op === 'sub' ? a1 - b1 : opt.op === 'mul' ? a1 * b1 : b1 === 0 ? TB.E.DIV0 : a1 / b1; else if (v === null) v = old; }
          if (opt.op && f) { const old = W.snap(s, r, c); const base = old && old.f ? '(' + old.f + ')' : TB.typeOf(s.get(r, c)) === 'num' ? String(s.get(r, c)) : '0'; f = base + { add: '+', sub: '-', mul: '*', div: '/' }[opt.op] + '(' + f + ')'; }
          if (f) o.f = f; else if (v !== null && v !== undefined) o.v = v instanceof TB.Err ? v : v;
          const keepFmt = what === 'values' || what === 'formulas' || what === 'link';
          if (keepFmt) { if (cur.s !== undefined) o.s = cur.s; }
          else if (what === 'noBorders' && styleSrc !== undefined) { const st = Object.assign({}, W.styles.get(styleSrc)); delete st.bt; delete st.bb; delete st.bl; delete st.br; o.s = W.styles.add(st); }
          else if (styleSrc !== undefined) o.s = styleSrc;
          else if (what === 'formulasFormats' || what === 'valuesFormats' || what === 'all') delete o.s;
          if (what === 'formulas' && x.f && cur.s !== undefined) o.s = cur.s;
        }
        if (what === 'notes' || what === 'validation' || what === 'widths') continue;
        list.push([r, c, Object.keys(o).length ? o : null]);
      }
      W.setCells(s, list);
      const dg2 = { r1: r0, c1: c0, r2: r0 + H * rep.nr - 1, c2: c0 + Wd * rep.nc - 1 };
      if (what === 'all' || what === 'formats' || what === 'notes') K.notes.forEach(([i, j, n]) => { const r = r0 + (tr ? j : i), c = c0 + (tr ? i : j); W.setProp(s.notes, KEY(r, c), Object.assign({}, n)); });
      if (what === 'all' || what === 'formats') { if (K.merges.length && !tr) { const l = s.merges.filter((m) => !TB.intersect(m, dg2)); K.merges.forEach((m) => l.push({ r1: m.r1 + r0, c1: m.c1 + c0, r2: m.r2 + r0, c2: m.c2 + c0 })); W.setProp(s, 'merges', l); } }
      if (what === 'widths' || (what === 'all' && fullCol(K.g))) K.cw.forEach((w, j) => { if (w != null) W.setProp(s.colW, c0 + j, w); });
      if ((what === 'all' || what === 'validation') && K.dv.length && !tr) { const l = s.dv.slice(); K.dv.forEach((d) => l.push(Object.assign({}, d, { ranges: d.ranges.map((x) => ({ r1: x.r1 + r0, c1: x.c1 + c0, r2: x.r2 + r0, c2: x.c2 + c0 })) }))); W.setProp(s, 'dv', l); }
      G().setRange(dg2, { noScroll: true });
    });
    if (K.cut) { A.clip = null; A.stopMarquee && A.stopMarquee(); }
    return true;
  };
  /** déplacer un bloc (couper-coller, glisser la sélection) : les références suivent */
  function moveBlock(ss, g, ds, dg, K) {
    const W = wb();
    const H = g.r2 - g.r1 + 1, Wd = g.c2 - g.c1 + 1, dr = dg.r1 - g.r1, dc = dg.c1 - g.c1;
    const cells = K ? K.cells : null;
    const src = [];
    for (let i = 0; i < H; i++) for (let j = 0; j < Wd; j++) { const o = cells ? Object.assign({}, cells[i][j]) : W.snap(ss, g.r1 + i, g.c1 + j); if (o) { delete o.val; if (o.f && o.v !== undefined) delete o.v; } src.push([i, j, o && (o.v !== undefined || o.f || o.s !== undefined) ? o : null]); }
    // formules déplacées : leurs références vers le bloc suivent (vers la feuille de destination)
    const mvd = src.map(([i, j, o]) => { if (!o || !o.f) return [i, j, o]; let ast = P.parse(o.f); ast = P.moveRefs(ast, Object.assign({ sheet: ss.name }, g), dr, dc, ss.name, ds !== ss ? ds.name : null); if (ds !== ss) ast = P.map(ast, (n) => (n.t === 'ref' || n.t === 'area') && n.sh == null ? Object.assign({}, n, { sh: ss.name }) : undefined); return [i, j, Object.assign({}, o, { f: P.write(ast) })]; });
    // effacer la source, puis écrire la destination
    const clear = []; for (let i = 0; i < H; i++) for (let j = 0; j < Wd; j++) clear.push([g.r1 + i, g.c1 + j, null]);
    W.setCells(ss, clear);
    W.setCells(ds, mvd.map(([i, j, o]) => [dg.r1 + i, dg.c1 + j, o]));
    // autres formules du classeur qui pointent vers le bloc
    W.sheets.forEach((s2) => {
      const ch = [];
      s2.fml.forEach((f) => { if (s2 === ds && TB.inRange(dg, f.r, f.c)) return; const a = P.moveRefs(f.ast, Object.assign({ sheet: ss.name }, g), dr, dc, s2.name, ds !== ss ? ds.name : null); if (a !== f.ast) ch.push([f.r, f.c, Object.assign({}, W.snap(s2, f.r, f.c), { f: P.write(a) })]); });
      ch.forEach(([r, c, o]) => W.setCell(s2, r, c, o));
    });
    // notes, liens, fusions
    [['notes'], ['links'], ['threads']].forEach(([k]) => { const m = ss[k]; Array.from(m.entries()).forEach(([key, v]) => { const p = TB.unkey(key); if (TB.inRange(g, p.r, p.c)) { W.setProp(m, key, undefined); W.setProp(ds[k], KEY(p.r + dr, p.c + dc), v); } }); });
    const mm = ss.merges.filter((m) => m.r1 >= g.r1 && m.r2 <= g.r2 && m.c1 >= g.c1 && m.c2 <= g.c2);
    if (mm.length) { W.setProp(ss, 'merges', ss.merges.filter((m) => mm.indexOf(m) < 0)); W.setProp(ds, 'merges', ds.merges.filter((m) => !TB.intersect(m, dg)).concat(mm.map((m) => ({ r1: m.r1 + dr, c1: m.c1 + dc, r2: m.r2 + dr, c2: m.c2 + dc })))); }
  }
  A.moveRange = function (g, t, opt) {
    if (!A.guard('cells')) return;
    const s = sh();
    if (opt && opt.copy) { const K = clipData(s, g, false); const save = A.clip; A.clip = K; G().setRange(t, { noScroll: true }); C.pasteClip(); A.clip = save; return; }
    // contenu écrasé ?
    let over = 0; for (let r = t.r1; r <= t.r2; r++) for (let c = t.c1; c <= t.c2; c++) if (!TB.inRange(g, r, c) && s.get(r, c) !== null) over++;
    const go = () => { A.tx('Déplacer', () => moveBlock(s, g, s, t, null)); G().setRange(t, { noScroll: true }); };
    if (over) O.confirm('Déplacer', 'Il y a déjà des données à cet endroit. Les remplacer ?', 'Remplacer').then((ok) => { if (ok) go(); }); else go();
  };
  /** coller depuis l'extérieur : texte tabulé ou tableau HTML (Excel, LibreOffice, pages web) */
  C.pasteExternal = function (text, html, opt) {
    opt = opt || {};
    if (!A.guard('cells')) return;
    const s = sh(), W = wb();
    let data = null;
    if (html && /<table/i.test(html) && !opt.textOnly) data = TB.Clip.fromHtml(html, W);
    if (!data && text != null) data = TB.Clip.fromText(text);
    if (!data || !data.rows.length) return;
    const r0 = G().sel.r, c0 = G().sel.c;
    const H = data.rows.length, Wd = Math.max(...data.rows.map((r) => r.length));
    A.tx('Coller', () => {
      const list = [];
      data.rows.forEach((row, i) => row.forEach((cell, j) => {
        if (!cell) { list.push([r0 + i, c0 + j, null]); return; }
        const cur = W.snap(s, r0 + i, c0 + j) || {};
        let o;
        if (cell.f && opt.values !== true) { o = { f: cell.f }; }
        else if (typeof cell.v === 'string' && !cell.raw) { o = W.inputToCell(s, r0 + i, c0 + j, cell.v); if (o.error) o = { v: cell.v }; }
        else o = { v: cell.v };
        if (cell.st && !opt.values) o.s = W.styles.add(Object.assign({}, cell.st, o.s !== undefined ? W.styles.get(o.s).nf ? { nf: cell.st.nf || W.styles.get(o.s).nf } : {} : {}));
        else if (o.s === undefined && cur.s !== undefined) o.s = cur.s;
        if (o.v === null && !o.f && o.s === undefined) o = null;
        list.push([r0 + i, c0 + j, o]);
        if (cell.link) W.setProp(s.links, KEY(r0 + i, c0 + j), { url: cell.link });
      }));
      W.setCells(s, list);
      if (data.merges && data.merges.length) { const l = s.merges.slice(); data.merges.forEach((m) => l.push({ r1: m.r1 + r0, c1: m.c1 + c0, r2: m.r2 + r0, c2: m.c2 + c0 })); W.setProp(s, 'merges', l); }
      if (data.cw) data.cw.forEach((w, j) => { if (w && (s.colW[c0 + j] == null) && !opt.values) W.setProp(s.colW, c0 + j, w); });
      G().setRange({ r1: r0, c1: c0, r2: r0 + H - 1, c2: c0 + Wd - 1 }, { noScroll: true });
    });
  };
  C.paste = async function (opt) {
    // depuis le ruban : lire le presse-papiers du système si possible
    let text = null, html = null;
    try {
      if (navigator.clipboard && navigator.clipboard.read) { const items = await navigator.clipboard.read(); for (const it of items) { if (it.types.indexOf('text/html') >= 0) html = await (await it.getType('text/html')).text(); if (it.types.indexOf('text/plain') >= 0) text = await (await it.getType('text/plain')).text(); } }
      else if (navigator.clipboard && navigator.clipboard.readText) text = await navigator.clipboard.readText();
    } catch (e) { }
    if (A.clip && (text == null || TB.Clip.same(text, A.clip.text))) { C.pasteClip(opt); return; }
    if (text != null || html != null) { C.pasteExternal(text, html, opt); return; }
    if (A.clip) { C.pasteClip(opt); return; }
    O.toast('Presse-papiers vide ou inaccessible : utilisez Ctrl+V', { bad: true });
  };

  /* ---------------- recopie ---------------- */
  A.fillTo = function (g, t, opt) {
    if (!A.guard('cells')) return;
    if (t.shrink) { // tirer vers l'intérieur : effacer
      const z = { r1: t.r2 + 1, c1: g.c1, r2: g.r2, c2: g.c2 }; G().setRange(z, { noScroll: true }); C.clear('contents'); G().setRange({ r1: g.r1, c1: g.c1, r2: t.r2, c2: g.c2 }, { noScroll: true }); return;
    }
    A.tx('Recopie', () => TB.Data.fill(wb(), sh(), g, t, { ctrl: opt && opt.ctrl }));
    G().setRange(t, { noScroll: true });
  };
  A.fillPreviewTip = function (g, t, ev) {
    const s = sh(); const v = TB.Data.fillPreview(wb(), s, g, t);
    if (v == null) { G().hideTip(); return; }
    const b = A.grid.host.getBoundingClientRect(); const tip = G().tipEl; tip.className = 'on dv'; tip.textContent = v; tip.style.left = (ev.clientX - b.left + 14) + 'px'; tip.style.top = (ev.clientY - b.top + 14) + 'px';
  };
  C.fillDir = function (dir) {
    if (!A.guard('cells')) return;
    const g = A.bounded(G().range()), s = sh();
    A.tx(dir === 'down' ? 'Recopier vers le bas' : dir === 'right' ? 'Recopier vers la droite' : 'Recopier', () => {
      if (dir === 'down') { if (g.r1 === g.r2) { if (g.r1 === 0) return; TB.Data.fill(wb(), s, { r1: g.r1 - 1, c1: g.c1, r2: g.r1 - 1, c2: g.c2 }, { r1: g.r1 - 1, c1: g.c1, r2: g.r2, c2: g.c2 }, { copy: true }); } else TB.Data.fill(wb(), s, { r1: g.r1, c1: g.c1, r2: g.r1, c2: g.c2 }, g, { copy: true }); }
      else if (dir === 'right') { if (g.c1 === g.c2) { if (g.c1 === 0) return; TB.Data.fill(wb(), s, { r1: g.r1, c1: g.c1 - 1, r2: g.r2, c2: g.c1 - 1 }, { r1: g.r1, c1: g.c1 - 1, r2: g.r2, c2: g.c2 }, { copy: true }); } else TB.Data.fill(wb(), s, { r1: g.r1, c1: g.c1, r2: g.r2, c2: g.c1 }, g, { copy: true }); }
      else if (dir === 'up') TB.Data.fill(wb(), s, { r1: g.r2, c1: g.c1, r2: g.r2, c2: g.c2 }, g, { copy: true, back: true });
      else if (dir === 'left') TB.Data.fill(wb(), s, { r1: g.r1, c1: g.c2, r2: g.r2, c2: g.c2 }, g, { copy: true, back: true });
    });
  };
  /** double-clic sur la poignée : jusqu'au bas des données voisines */
  A.fillDownAuto = function () {
    const s = sh(), g = G().range(); const cnext = g.c1 > 0 && s.get(g.r2 + 1, g.c1 - 1) !== null ? g.c1 - 1 : (s.get(g.r2 + 1, g.c2 + 1) !== null ? g.c2 + 1 : -1);
    if (cnext < 0) return; let r = g.r2 + 1; while (s.get(r + 1, cnext) !== null) r++;
    A.fillTo(g, { r1: g.r1, c1: g.c1, r2: r, c2: g.c2 }, {});
  };

  /* ---------------- insérer / supprimer ---------------- */
  C.insert = function (kind) {
    if (!A.guard(kind === 'rows' || kind === 'cellsDown' ? 'insertRows' : 'insertCols')) return;
    const s = sh(), g = G().range();
    if (kind === 'rows' || (kind === 'auto' && fullRow(g))) { const n = g.r2 - g.r1 + 1; A.tx('Insérer des lignes', () => wb().shiftCells(s, 'r', g.r1, n)); return; }
    if (kind === 'cols' || (kind === 'auto' && fullCol(g))) { const n = g.c2 - g.c1 + 1; A.tx('Insérer des colonnes', () => wb().shiftCells(s, 'c', g.c1, n)); return; }
    if (kind === 'cellsDown' || kind === 'cellsRight') {
      const e = s.extent(); const n = kind === 'cellsDown' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
      const blk = kind === 'cellsDown' ? { r1: g.r1, c1: g.c1, r2: Math.max(g.r1, e.r), c2: g.c2 } : { r1: g.r1, c1: g.c1, r2: g.r2, c2: Math.max(g.c1, e.c) };
      const dst = kind === 'cellsDown' ? { r1: blk.r1 + n, c1: blk.c1, r2: blk.r2 + n, c2: blk.c2 } : { r1: blk.r1, c1: blk.c1 + n, r2: blk.r2, c2: blk.c2 + n };
      A.tx('Insérer des cellules', () => moveBlock(s, blk, s, dst, null));
      return;
    }
    A.dialogs.insertCells();
  };
  C.remove = function (kind) {
    if (!A.guard(kind === 'rows' || kind === 'cellsUp' ? 'deleteRows' : 'deleteCols')) return;
    const s = sh(), g = G().range();
    if (kind === 'rows' || (kind === 'auto' && fullRow(g))) { const n = g.r2 - g.r1 + 1; A.tx('Supprimer des lignes', () => wb().shiftCells(s, 'r', g.r1, -n)); G().select(g.r1, G().sel.c, { noScroll: true }); return; }
    if (kind === 'cols' || (kind === 'auto' && fullCol(g))) { const n = g.c2 - g.c1 + 1; A.tx('Supprimer des colonnes', () => wb().shiftCells(s, 'c', g.c1, -n)); G().select(G().sel.r, g.c1, { noScroll: true }); return; }
    if (kind === 'cellsUp' || kind === 'cellsLeft') {
      const e = s.extent(); const n = kind === 'cellsUp' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
      A.tx('Supprimer des cellules', () => {
        // contenu supprimé, références vers lui → #REF!
        const del = Object.assign({}, g);
        wb().sheets.forEach((s2) => { const ch = []; s2.fml.forEach((f) => { if (s2 === s && TB.inRange(del, f.r, f.c)) return; let hitDel = false; const a = P.map(f.ast, (x) => { if ((x.t === 'ref') && (x.sh || s2.name) === s.name && TB.inRange(del, x.r, x.c)) { hitDel = true; return { t: 'e', v: '#REF!' }; } }); if (hitDel) ch.push([f.r, f.c, Object.assign({}, wb().snap(s2, f.r, f.c), { f: P.write(a) })]); }); ch.forEach(([r, c, o]) => wb().setCell(s2, r, c, o)); });
        const clr = []; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) clr.push([r, c, null]); wb().setCells(s, clr);
        const blk = kind === 'cellsUp' ? { r1: g.r2 + 1, c1: g.c1, r2: Math.max(g.r2 + 1, e.r), c2: g.c2 } : { r1: g.r1, c1: g.c2 + 1, r2: g.r2, c2: Math.max(g.c2 + 1, e.c) };
        const dst = kind === 'cellsUp' ? { r1: blk.r1 - n, c1: blk.c1, r2: blk.r2 - n, c2: blk.c2 } : { r1: blk.r1, c1: blk.c1 - n, r2: blk.r2, c2: blk.c2 - n };
        moveBlock(s, blk, s, dst, null);
      });
      return;
    }
    A.dialogs.deleteCells();
  };

  /* ---------------- lignes et colonnes ---------------- */
  A.setSize = function (axis, i, px) {
    if (!A.guard(axis === 'c' ? 'formatCols' : 'formatRows')) return;
    const s = sh(); const sel = G().sel.ranges.filter((g) => axis === 'c' ? fullCol(g) && i >= g.c1 && i <= g.c2 : fullRow(g) && i >= g.r1 && i <= g.r2);
    const idx = sel.length ? [].concat(...sel.map((g) => { const l = []; for (let k = axis === 'c' ? g.c1 : g.r1; k <= (axis === 'c' ? g.c2 : Math.min(g.r2, g.r1 + 100000)); k++) l.push(k); return l; })) : [i];
    A.tx(axis === 'c' ? 'Largeur de colonne' : 'Hauteur de ligne', () => idx.forEach((k) => { if (px <= 0) wb().setProp(axis === 'c' ? s.hidC : s.hidR, k, true); else { wb().setProp(axis === 'c' ? s.colW : s.rowH, k, px); if ((axis === 'c' ? s.hidC : s.hidR).has(k)) wb().setProp(axis === 'c' ? s.hidC : s.hidR, k, false); } }));
  };
  A.askSize = async function (axis, i) {
    const s = sh(); const cur = axis === 'c' ? s.colWidth(i) : s.rowHeight(i);
    const v = await O.prompt(axis === 'c' ? 'Largeur de colonne' : 'Hauteur de ligne', axis === 'c' ? 'Largeur (en caractères)' : 'Hauteur (en points)', axis === 'c' ? String(Math.max(0, (cur - 5) / 7).toFixed(2)).replace('.', ',') : String(cur * 0.75).replace('.', ','));
    if (v == null) return; const n = parseFloat(v.replace(',', '.')); if (isNaN(n) || n < 0) return;
    A.setSize(axis, i, axis === 'c' ? (n ? Math.round(n * 7 + 5) : 0) : Math.round(n / 0.75));
  };
  /** ajuster automatiquement la largeur (contenu) ou la hauteur (police, renvoi à la ligne) */
  A.autofit = function (axis, i, quiet) {
    const s = sh(), Gr = G(), z = 1;
    const sel = Gr.sel.ranges.filter((g) => axis === 'c' ? fullCol(g) && i >= g.c1 && i <= g.c2 : fullRow(g) && i >= g.r1 && i <= g.r2);
    const idx = sel.length ? [].concat(...sel.map((g) => { const l = []; const e = s.extent(); for (let k = axis === 'c' ? g.c1 : g.r1; k <= (axis === 'c' ? Math.min(g.c2, e.c + 1) : Math.min(g.r2, e.r + 1)); k++) l.push(k); return l; })) : [i];
    const sizes = idx.map((k) => [k, axis === 'c' ? fitWidth(s, k) : fitHeight(s, k)]);
    void z;
    const go = () => sizes.forEach(([k, px]) => { if (px == null) return; wb().setProp(axis === 'c' ? s.colW : s.rowH, k, px); if ((axis === 'c' ? s.hidC : s.hidR).has(k)) wb().setProp(axis === 'c' ? s.hidC : s.hidR, k, false); });
    if (quiet) go(); else A.tx('Ajustement automatique', go);
  };
  function fitWidth(s, c) {
    const W = wb(), Gr = G(); let max = 0; const e = s.extent();
    const col = s.vals[c]; if (!col) return s.defW;
    const n = Math.min(col.length - 1, e.r);
    const step = n > 20000 ? Math.ceil(n / 20000) : 1;
    for (let r = 0; r <= n; r += step) {
      const v = col[r]; if (v === undefined || v === null) continue; if (s.mergeAt(r, c)) continue;
      const st = Gr.styleAt(r, c); if (st.wr) continue;
      const t = TB.Fmt.format(v, st.nf).s; const font = Gr.fontOf(st, 1);
      max = Math.max(max, Gr.textWidth(font, String(t).split('\n')[0]) + (st.ind || 0) * 9);
    }
    return max ? Math.min(1800, Math.ceil(max + 10)) : s.defW;
  }
  function fitHeight(s, r) {
    const Gr = G(); let max = 0; const e = s.extent();
    for (let c = 0; c <= Math.min(e.c, 300); c++) {
      const st = Gr.styleAt(r, c); const v = s.get(r, c);
      const px = TB.fontPx(st.fs || 11); let h = px * 1.2 + 5;
      if (v !== null && st.wr) { const t = TB.Fmt.format(v, st.nf).s; const lines = Gr.wrapLines(Gr.fontOf(st, 1), t, s.colWidth(c) - 6).length; h = lines * px * 1.2 + 5; }
      else if (v !== null && typeof v === 'string' && v.indexOf('\n') >= 0 && st.wr) h = v.split('\n').length * px * 1.2 + 5;
      if (st.rot && st.rot !== 0 && v !== null) { const t = TB.Fmt.format(v, st.nf).s; const w = Gr.textWidth(Gr.fontOf(st, 1), t); h = Math.max(h, st.rot === 255 ? t.length * px * 1.2 + 6 : Math.abs(Math.sin(st.rot * Math.PI / 180)) * w + px + 6); }
      if (v !== null || st.fs) max = Math.max(max, h);
    }
    return max ? Math.max(s.defH, Math.ceil(max)) : s.defH;
  }
  function autoHeightSel() { const s = sh(); const g = A.bounded(G().range()); if (g.r2 - g.r1 > 500) return; for (let r = g.r1; r <= g.r2; r++) if (s.rowH[r] == null || s._autoH && s._autoH[r]) { const h = fitHeight(s, r); if (h > s.defH) { s.rowH[r] = h; (s._autoH || (s._autoH = {}))[r] = 1; } } G().invalidate(); }
  A.autoHeightRows = function (s, r1, r2) { for (let r = r1; r <= Math.min(r2, r1 + 2000); r++) { if (s.rowH[r] != null && !(s._autoH && s._autoH[r])) continue; const h = fitHeight(s, r); if (h > s.defH + 1) { s.rowH[r] = h; (s._autoH || (s._autoH = {}))[r] = 1; } else if (s._autoH && s._autoH[r]) { delete s.rowH[r]; delete s._autoH[r]; } } };
  C.hide = function (axis, show) {
    if (!A.guard(axis === 'c' ? 'formatCols' : 'formatRows')) return;
    const s = sh(); const set = axis === 'c' ? s.hidC : s.hidR;
    A.tx(show ? 'Afficher' : 'Masquer', () => {
      for (const g0 of G().sel.ranges) {
        const a = axis === 'c' ? g0.c1 : g0.r1, b = axis === 'c' ? g0.c2 : Math.min(g0.r2, a + 1048575);
        if (show) { Array.from(set).forEach((k) => { if (k >= a - (a === b ? 1 : 0) && k <= b + (a === b ? 1 : 0)) wb().setProp(set, k, false); }); }
        else for (let k = a; k <= Math.min(b, a + 200000); k++) wb().setProp(set, k, true);
      }
    });
  };
  C.defaultSize = async function (axis) {
    const s = sh(); const v = await O.prompt(axis === 'c' ? 'Largeur standard' : 'Hauteur standard', axis === 'c' ? 'Largeur (caractères)' : 'Hauteur (points)', axis === 'c' ? String(((s.defW - 5) / 7).toFixed(2)).replace('.', ',') : String(s.defH * 0.75).replace('.', ','));
    if (v == null) return; const n = parseFloat(v.replace(',', '.')); if (!(n > 0)) return;
    A.tx('Taille standard', () => wb().setProp(s, axis === 'c' ? 'defW' : 'defH', axis === 'c' ? Math.round(n * 7 + 5) : Math.round(n / 0.75)));
  };

  /* ---------------- volets ---------------- */
  C.freeze = function (kind) {
    const s = sh(), g = G();
    let fz;
    if (kind === 'none' || (kind === 'toggle' && (s.freeze.r || s.freeze.c))) fz = { r: 0, c: 0 };
    else if (kind === 'row') fz = { r: g.visible.r1 + 1, c: 0 };
    else if (kind === 'col') fz = { r: 0, c: g.visible.c1 + 1 };
    else { const r = g.sel.r, c = g.sel.c; fz = { r: r === 0 && c === 0 ? Math.floor((g.visible.r1 + g.visible.r2) / 2) : r, c }; }
    if (kind === 'row' || kind === 'col') { g.scroll.scrollTop = 0; if (kind === 'col') g.scroll.scrollLeft = 0; }
    if (kind !== 'none' && kind !== 'toggle' && kind !== 'row' && kind !== 'col') { g.scroll.scrollTop = 0; g.scroll.scrollLeft = 0; }
    A.tx('Figer les volets', () => wb().setProp(s, 'freeze', fz));
  };

  /* ---------------- feuilles ---------------- */
  A.showSheet = function (s) { const W = wb(); const i = W.sheets.indexOf(s); if (i < 0) return; if (A.grid) A.grid.rememberScroll(); W.active = i; if (A.grid) A.grid.sheetChanged(); A.renderTabs && A.renderTabs(); A.refreshUi && A.refreshUi(); A.onSelect && A.onSelect(); };
  C.addSheet = function (at) { if (!A.guardBook()) return; let s; A.tx('Nouvelle feuille', () => { s = wb().addSheet(null, at == null ? wb().active + 1 : at); }); A.showSheet(s); };
  C.renameSheet = async function (s) {
    if (!A.guardBook()) return; s = s || sh();
    const v = await O.prompt('Renommer la feuille', 'Nom (31 caractères au plus, sans \\ / ? * [ ] :)', s.name); if (v == null) return;
    let ok; A.tx('Renommer la feuille', () => { ok = wb().renameSheet(s, v.trim()); }); if (!ok) O.toast('Nom refusé : vide, déjà utilisé ou caractère interdit', { bad: true }); A.renderTabs();
  };
  C.deleteSheet = async function (s) {
    if (!A.guardBook()) return; s = s || sh();
    if (wb().sheets.filter((x) => !x.hidden).length <= 1) { O.toast('Un classeur doit garder au moins une feuille visible', { bad: true }); return; }
    const has = s.extent().r >= 0 || s.objs.length; if (has && !(await O.confirm('Supprimer la feuille', 'Supprimer « ' + s.name + ' » et tout son contenu ? (Ctrl+Z pour annuler)', 'Supprimer', true))) return;
    A.tx('Supprimer la feuille', () => wb().deleteSheet(s)); A.showSheet(wb().cur);
  };
  C.moveSheet = function (s, to) { if (!A.guardBook()) return; A.tx('Déplacer la feuille', () => wb().moveSheet(s, to)); wb().active = wb().sheets.indexOf(s); A.renderTabs(); };
  C.copySheet = function (s, at) { if (!A.guardBook()) return; let n; A.tx('Copier la feuille', () => { n = wb().copySheet(s || sh(), at); }); A.showSheet(n); };
  C.tabColor = function (s, col) { A.tx('Couleur d\'onglet', () => wb().setProp(s, 'tab', col || null)); A.renderTabs(); };
  C.hideSheet = function (s, hide) {
    if (!A.guardBook()) return; s = s || sh();
    if (hide && wb().sheets.filter((x) => !x.hidden).length <= 1) { O.toast('Impossible de masquer la seule feuille visible', { bad: true }); return; }
    A.tx(hide ? 'Masquer la feuille' : 'Afficher la feuille', () => wb().setProp(s, 'hidden', hide ? 1 : 0));
    if (hide && s === sh()) { const n = wb().sheets.find((x) => !x.hidden); A.showSheet(n); } else if (!hide) A.showSheet(s); else A.renderTabs();
  };
  C.unhideSheet = async function () {
    const hid = wb().sheets.filter((s) => s.hidden); if (!hid.length) { O.toast('Aucune feuille masquée'); return; }
    const v = await O.dialog({ title: 'Afficher une feuille', body: '<div class="o-form">' + hid.map((s, i) => '<label class="o-check"><input type="radio" name="uh" value="' + i + '"' + (i ? '' : ' checked') + '><span>' + O.esc(s.name) + '</span></label>').join('') + '</div>', buttons: [{ label: 'Annuler', value: null }, { label: 'Afficher', primary: true, value: 1, onClick: (c, w) => { c(+w.querySelector('input:checked').value + 1); return false; } }] });
    if (v) C.hideSheet(hid[v - 1], false);
  };

  /* ---------------- noms, liens, notes, commentaires ---------------- */
  C.defineName = async function (opt) {
    opt = opt || {}; const s = sh(), g = G().range();
    const ref = TB.quoteSheet(s.name) + '!' + TB.rangeStr(g, true);
    let guess = ''; const v = s.get(g.r1 > 0 && g.r1 === g.r2 ? g.r1 : Math.max(0, g.r1 - 1), g.c1); if (typeof v === 'string') guess = v.replace(/[^\wÀ-ÿ.]/g, '_').replace(/^(\d)/, '_$1');
    const r = await O.form('Définir un nom', [{ id: 'n', label: 'Nom', value: opt.name || guess }, { id: 'sc', label: 'Portée', type: 'select', value: '', options: [['', 'Classeur']].concat(wb().sheets.map((x) => [x.name, x.name])) }, { id: 'cm', label: 'Commentaire', value: '' }, { id: 'f', label: 'Fait référence à', value: '=' + P.toUser(opt.ref || ref) }], { validate: (x) => !/^[A-Za-z_\\À-ɏ][\w.À-ɏ]*$/.test(x.n) || /^[A-Za-z]{1,3}\d+$/.test(x.n) || /^(R|C)$/i.test(x.n) ? 'Nom non valide (lettre au début, sans espace, pas une adresse comme A1)' : wb().names.some((n) => n.n.toLowerCase() === x.n.toLowerCase() && (n.sh || '') === x.sc) ? 'Ce nom existe déjà' : null });
    if (!r) return;
    let canon; try { canon = P.fromUser(r.f.replace(/^=/, '')); } catch (e) { O.toast('Référence non valide : ' + e.message, { bad: true }); return; }
    A.tx('Définir un nom', () => { const l = wb().names.slice(); l.push({ n: r.n, f: canon, sh: r.sc || null, cm: r.cm || '' }); wb().setProp(wb(), 'names', l, true); wb()._nameAst = null; });
    O.toast('Nom « ' + r.n + ' » défini');
  };
  C.link = async function () {
    const s = sh(), r = G().sel.r, c = G().sel.c, cur = s.links.get(KEY(r, c)) || {};
    const v = s.get(r, c);
    const res = await O.form('Lien hypertexte', [{ id: 't', label: 'Texte à afficher', value: v == null ? '' : TB.Fmt.text(v, 'General') }, { id: 'kind', label: 'Lien vers', type: 'select', value: cur.ref ? 'ref' : /^mailto:/.test(cur.url || '') ? 'mail' : 'url', options: [['url', 'Page web ou fichier (adresse)'], ['ref', 'Emplacement dans ce classeur'], ['mail', 'Adresse e-mail']] }, { id: 'u', label: 'Adresse / emplacement (ex. Feuil2!A1) / e-mail', value: cur.ref || (cur.url || '').replace(/^mailto:/, '') }, { id: 'tip', label: 'Info-bulle', value: cur.tip || '' }]);
    if (!res) return;
    A.tx('Lien hypertexte', () => {
      const W = wb();
      if (!res.u.trim()) { W.setProp(s.links, KEY(r, c), undefined); return; }
      const lk = res.kind === 'ref' ? { ref: res.u.trim() } : { url: res.kind === 'mail' ? 'mailto:' + res.u.trim().replace(/^mailto:/, '') : (/^[a-z]+:/i.test(res.u.trim()) ? res.u.trim() : 'https://' + res.u.trim()) };
      if (res.tip) lk.tip = res.tip;
      W.setProp(s.links, KEY(r, c), lk);
      const o = W.snap(s, r, c) || {}; if (!o.f) o.v = res.t || res.u; o.s = W.styles.with(o.s !== undefined ? o.s : s.styleAt(r, c), { fc: '#0563C1', u: 'single' }); W.setCell(s, r, c, o);
    });
  };
  C.removeLink = function () { const s = sh(); A.tx('Supprimer le lien', () => { for (const g of G().sel.ranges) Array.from(s.links.keys()).forEach((k) => { const p = TB.unkey(k); if (TB.inRange(g, p.r, p.c)) { wb().setProp(s.links, k, undefined); const o = wb().snap(s, p.r, p.c); if (o && o.s !== undefined) { o.s = wb().styles.with(o.s, { fc: null, u: null }); wb().setCell(s, p.r, p.c, o); } } }); }); };
  A.followLink = function (lk) {
    if (lk.ref) { const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(lk.ref); const s = m ? wb().sheet((m[1] || m[2]).replace(/''/g, "'")) : sh(); const g = TB.parseRange(m ? m[3] : lk.ref) || (wb().findName(lk.ref) ? null : null); if (s && g) { A.showSheet(s); G().setRange(g); } else if (A.goToName) A.goToName(lk.ref); return; }
    const u = lk.url || ''; if (!/^(https?:|mailto:|tel:)/i.test(u)) { O.toast('Lien non pris en charge : ' + u, { bad: true }); return; }
    if (window.MAGPC && window.MAGPC.nativeOpen) window.MAGPC.nativeOpen(u); else window.open(u, '_blank', 'noopener');
  };
  A.linkTap = function (lk) { O.toast('Lien : ' + (lk.url || lk.ref), { action: { label: 'Ouvrir', fn: () => A.followLink(lk) }, ms: 4000 }); };
  C.note = async function () {
    const s = sh(), r = G().sel.r, c = G().sel.c, cur = s.notes.get(KEY(r, c));
    const v = await O.prompt(cur ? 'Modifier la note' : 'Nouvelle note', 'Note (' + TB.addr(r, c) + ')', cur ? cur.text : '', { multiline: true, rows: 5, ok: 'Enregistrer' });
    if (v == null) return;
    A.tx('Note', () => wb().setProp(s.notes, KEY(r, c), v.trim() ? { text: v, author: A.userName() } : undefined));
  };
  C.deleteNotes = () => C.clear('notes');
  A.userName = () => { try { return localStorage.getItem('tableur:auteur') || ''; } catch (e) { return ''; } };
  C.comment = function () { if (A.openPane) A.openPane('comments', { add: true }); };

  /* ---------------- somme automatique, dates ---------------- */
  C.autoSum = function (fn) {
    fn = fn || 'SUM'; const s = sh(), Gr = G(), g = Gr.range();
    const fnUser = P.displayFn(fn, TB.loc.fn);
    // plusieurs cellules sélectionnées avec des nombres : total en dessous / à droite
    if (g.r1 !== g.r2 || g.c1 !== g.c2) {
      const b = A.bounded(g);
      A.tx('Somme automatique', () => {
        for (let c = b.c1; c <= b.c2; c++) { let r2 = b.r2; const hasEmptyLast = s.get(b.r2, c) === null; const tgt = hasEmptyLast ? b.r2 : b.r2 + 1; if (hasEmptyLast) r2 = b.r2 - 1; if (r2 < b.r1) continue; wb().setCell(s, tgt, c, Object.assign({}, wb().snap(s, tgt, c) || {}, { f: fn + '(' + TB.rangeStr({ r1: b.r1, c1: c, r2, c2: c }) + ')' })); }
      });
      return;
    }
    const r = g.r1, c = g.c1;
    const isNum = (rr, cc) => typeof s.get(rr, cc) === 'number';
    let rg = null;
    if (r > 0 && isNum(r - 1, c)) { let a = r - 1; while (a > 0 && (isNum(a - 1, c) || (s.get(a - 1, c) === null && false))) a--; rg = { r1: a, c1: c, r2: r - 1, c2: c }; }
    else if (c > 0 && isNum(r, c - 1)) { let a = c - 1; while (a > 0 && isNum(r, a - 1)) a--; rg = { r1: r, c1: a, r2: r, c2: c - 1 }; }
    const text = '=' + fnUser + '(' + (rg ? TB.rangeStr(rg) : '') + ')';
    Gr.beginEdit({ text, mode: 'enter' });
    const el = Gr.editEl(); const st = text.indexOf('(') + 1, en = text.length - 1; try { el.setSelectionRange(st, en); } catch (e) { }
    if (rg) Gr.point = { start: st, end: en, g: rg, sheet: s, keep: false };
  };
  C.insertDate = function (time) { const Gr = G(); const now = new Date(); const t = time ? TB.Fmt.text(TB.now(), 'hh:mm') : TB.Fmt.text(TB.today(), 'dd/mm/yyyy'); void now; if (Gr.edit) { const el = Gr.editEl(); const p = el.selectionStart; Gr.setEditText(el.value.slice(0, p) + t + el.value.slice(el.selectionEnd), p + t.length); return; } Gr.beginEdit({ text: t, mode: 'enter' }); };
  C.copyAbove = function (value) { const Gr = G(), s = sh(); if (Gr.sel.r === 0) return; const r = Gr.sel.r - 1, c = Gr.sel.c; const f = s.fml.get(KEY(r, c)); const t = value || !f ? wb().editText(s, r, c).replace(/^=.*/, () => TB.Fmt.text(s.get(r, c), wb().styles.get(s.styleAt(r, c)).nf)) : '=' + P.toUser(f.src); Gr.beginEdit({ text: t, mode: 'edit' }); };

  /* ---------------- affichage ---------------- */
  C.toggleFormulas = function () { const s = sh(); s.showF = !s.showF; G().invalidate(); A.refreshUi(); };
  C.toggleGrid = function () { const s = sh(); A.tx('Quadrillage', () => wb().setProp(s, 'grid', s.grid === false)); };
  C.toggleHeads = function () { const s = sh(); A.tx('En-têtes', () => wb().setProp(s, 'heads', s.heads === false)); };
  C.recalc = function () { const W = wb(); W.rebuild(); W.recalcAll(); W.pendingManual = false; A.changed(); O.toast('Calcul terminé', { ms: 900 }); };
  C.calcMode = function (m) { wb().settings.calc = m; if (m === 'auto' && wb().pendingManual) C.recalc(); A.refreshUi(); O.toast(m === 'manual' ? 'Calcul manuel : F9 pour calculer' : 'Calcul automatique', { ms: 1600 }); };
})();
