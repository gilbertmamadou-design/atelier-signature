/* Tableur — formules : analyse (texte → arbre), écriture (arbre → texte, en anglais « canonique » pour le stockage et
   les fichiers, ou dans la langue et les séparateurs de l'utilisateur), décalage des références (copier, recopier),
   adaptation aux insertions / suppressions de lignes et colonnes, aux déplacements et aux feuilles renommées.
   Références : A1, $A$1, A1:B5, A:C, 3:7, Feuil1!A1, 'Ma feuille'!A1:B2, Feuil1:Feuil3!A1 (3D), A1# (plage propagée),
   noms définis, références structurées Tableau1[Col], Tableau1[[#En-têtes],[Col]], [@Col]. */
(function (G) {
  'use strict';
  const TB = G.Tableur;
  const P = TB.Formula = {};
  const CANON = P.CANON = { fn: 'en', arg: ',', dec: '.', arrCol: ',', arrRow: ';' };
  P.userLoc = () => ({ fn: TB.loc.fn, arg: TB.loc.arg, dec: TB.loc.dec, arrCol: TB.loc.arrCol, arrRow: TB.loc.arrRow });
  // noms de fonctions : fournis par tb-functions.js
  P.canonFn = (n) => (TB.fnCanon ? TB.fnCanon(n) : null) || n.toUpperCase();
  P.displayFn = (n, lang) => (TB.fnName ? TB.fnName(n, lang) : n);
  const ERRS = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#SPILL!', '#CALC!', '#GETTING_DATA', '#NUL!', '#VALEUR!', '#NOM?', '#NOMBRE!', '#PROPAGATION!', '#CHARGEMENT_DONNEES'];
  const SITEMS = { '#all': '#All', '#tout': '#All', '#data': '#Data', '#données': '#Data', '#donnees': '#Data', '#headers': '#Headers', '#en-têtes': '#Headers', '#en-tetes': '#Headers', '#totals': '#Totals', '#totaux': '#Totals', '#this row': '#This Row', '#cette ligne': '#This Row' };
  const SITEMS_FR = { '#All': '#Tout', '#Data': '#Données', '#Headers': '#En-têtes', '#Totals': '#Totaux', '#This Row': '#Cette ligne' };

  class PErr extends Error { constructor(m, pos) { super(m); this.pos = pos; } }
  P.Error = PErr;

  /* ---------------- lexique ---------------- */
  const ID0 = /[A-Za-z_\\À-ɏ]/, IDC = /[A-Za-z0-9_.À-ɏ\\?]/;
  function tokenize(src, loc) {
    const T = []; let i = 0; const n = src.length;
    const push = (t, v, extra) => { const o = Object.assign({ t, v, p: i }, extra || {}); T.push(o); return o; };
    while (i < n) {
      const ch = src[i];
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === ' ') { i++; continue; }
      const start = i;
      // texte
      if (ch === '"') { let s = '', j = i + 1; for (; j < n; j++) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j++; } else break; } else s += src[j]; } if (j >= n) throw new PErr('Guillemet fermant manquant', i); T.push({ t: 'str', v: s, p: start }); i = j + 1; continue; }
      // erreurs
      if (ch === '#') {
        const up = src.slice(i, i + 20).toUpperCase(); const e = ERRS.find((x) => up.startsWith(x));
        if (e) { T.push({ t: 'err', v: TB.ERR_EN[e] || e, p: start }); i += e.length; continue; }
        // A1# : propagation
        const last = T[T.length - 1]; if (last && (last.t === 'ref' || last.t === 'name')) { T.push({ t: 'spill', p: start }); i++; continue; }
        throw new PErr('Caractère « # » inattendu', i);
      }
      // nombres
      if (/[0-9]/.test(ch) || (ch === loc.dec && /[0-9]/.test(src[i + 1] || ''))) {
        // 3:7 (lignes entières) ?
        const mr = /^\$?(\d+):\$?(\d+)(?![0-9A-Za-z(])/.exec(src.slice(i));
        if (mr && !(T.length && T[T.length - 1].t === 'num')) { T.push({ t: 'ref', p: start, ref: { k: 'row', r1: +mr[1] - 1, r2: +mr[2] - 1, ra1: src[i] === '$', ra2: /:\$/.test(mr[0]) } }); i += mr[0].length; continue; }
        let j = i; while (j < n && /[0-9]/.test(src[j])) j++;
        if (src[j] === loc.dec && !(loc.dec === ',' && loc.arg === ',')) { j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        if ((src[j] === 'e' || src[j] === 'E') && /[+-]?[0-9]/.test(src.slice(j + 1, j + 3))) { j++; if (src[j] === '+' || src[j] === '-') j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        const txt = src.slice(i, j).replace(loc.dec, '.');
        T.push({ t: 'num', v: parseFloat(txt), p: start, raw: src.slice(i, j) }); i = j; continue;
      }
      // feuille entre apostrophes
      if (ch === "'") {
        let s = '', j = i + 1; for (; j < n; j++) { if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j++; } else break; } else s += src[j]; }
        if (src[j + 1] !== '!') throw new PErr('Nom de feuille sans « ! »', i);
        let sh2 = null; const m3 = /^(.*):(.*)$/.exec(s); if (m3 && m3[1] && m3[2] && !/^\d/.test(m3[2])) { /* 'A:B'!x : feuilles 3D */ }
        i = j + 2; const r = readRefAfterSheet(src, i, s, sh2); if (!r) throw new PErr('Référence attendue après « ' + s + '! »', i);
        T.push(Object.assign({ t: r.t, p: start }, r.o)); i = r.end; continue;
      }
      // identifiants : fonction, nom, référence, VRAI/FAUX, feuille!
      if (ID0.test(ch) || ch === '$') {
        // référence de cellule / colonnes (avec $)
        const mref = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?(?![A-Za-z0-9_.(À-ɏ!\[])/.exec(src.slice(i));
        if (mref && validCell(mref[2], mref[4]) && (!mref[6] || validCell(mref[6], mref[8]))) {
          const r = { k: 'cell', c1: TB.colIndex(mref[2]), r1: +mref[4] - 1, ca1: !!mref[1], ra1: !!mref[3] };
          if (mref[6]) Object.assign(r, { c2: TB.colIndex(mref[6]), r2: +mref[8] - 1, ca2: !!mref[5], ra2: !!mref[7], area: true });
          T.push({ t: 'ref', p: start, ref: r }); i += mref[0].length; continue;
        }
        const mcol = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_.(À-ɏ])/.exec(src.slice(i));
        if (mcol && TB.colIndex(mcol[2]) < TB.MAX_COLS && TB.colIndex(mcol[4]) < TB.MAX_COLS) { T.push({ t: 'ref', p: start, ref: { k: 'col', c1: TB.colIndex(mcol[2]), c2: TB.colIndex(mcol[4]), ca1: !!mcol[1], ca2: !!mcol[3] } }); i += mcol[0].length; continue; }
        if (ch === '$') throw new PErr('Référence non valide', i);
        let j = i + 1; while (j < n && IDC.test(src[j])) j++;
        let id = src.slice(i, j);
        // Feuil1!A1 ou Feuil1:Feuil3!A1
        if (src[j] === '!' || (src[j] === ':' && /^[A-Za-z_À-ɏ][\w.À-ɏ]*!/.test(src.slice(j + 1)))) {
          let sh2 = null;
          if (src[j] === ':') { const k = src.indexOf('!', j); sh2 = src.slice(j + 1, k); j = k; }
          const r = readRefAfterSheet(src, j + 1, id, sh2); if (!r) throw new PErr('Référence attendue après « ' + id + '! »', j);
          T.push(Object.assign({ t: r.t, p: start }, r.o)); i = r.end; continue;
        }
        // fonction
        let k = j; while (src[k] === ' ') k++;
        if (src[k] === '(') { T.push({ t: 'fn', v: id.replace(/^_xlfn\.(_xlws\.)?/i, '').replace(/^_xlws\./i, ''), p: start }); i = j; continue; }
        // référence structurée
        if (src[j] === '[') { const r = readStruct(src, j); T.push({ t: 'sref', p: start, tbl: id, spec: r.spec }); i = r.end; continue; }
        if (/^(TRUE|FALSE|VRAI|FAUX)$/i.test(id)) { T.push({ t: 'bool', v: /^(TRUE|VRAI)$/i.test(id), p: start }); i = j; continue; }
        T.push({ t: 'name', v: id, p: start }); i = j; continue;
      }
      if (ch === '[') { const r = readStruct(src, i); T.push({ t: 'sref', p: start, tbl: '', spec: r.spec }); i = r.end; continue; }
      // opérateurs
      const two = src.slice(i, i + 2);
      if (two === '<=' || two === '>=' || two === '<>') { T.push({ t: 'op', v: two, p: start }); i += 2; continue; }
      if ('+-*/^&=<>%:'.indexOf(ch) >= 0) { T.push({ t: 'op', v: ch, p: start }); i++; continue; }
      if (ch === '(' || ch === ')' || ch === '{' || ch === '}') { T.push({ t: ch, p: start }); i++; continue; }
      if (ch === loc.arg) { T.push({ t: 'sep', p: start }); i++; continue; }
      if (ch === loc.arrRow) { T.push({ t: 'rowsep', p: start }); i++; continue; }
      if (ch === loc.arrCol) { T.push({ t: 'colsep', p: start }); i++; continue; }
      if (ch === '@') { i++; continue; } // opérateur d'intersection implicite : ignoré
      throw new PErr('Caractère inattendu « ' + ch + ' »', i);
    }
    return T;
  }
  function validCell(col, row) { const c = TB.colIndex(col), r = +row - 1; return c < TB.MAX_COLS && r >= 0 && r < TB.MAX_ROWS; }
  function readRefAfterSheet(src, i, sh, sh2) {
    const s = src.slice(i);
    let m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?(?![A-Za-z0-9_(])/.exec(s);
    if (m && validCell(m[2], m[4])) { const r = { k: 'cell', sh, sh2, c1: TB.colIndex(m[2]), r1: +m[4] - 1, ca1: !!m[1], ra1: !!m[3] }; if (m[6]) Object.assign(r, { c2: TB.colIndex(m[6]), r2: +m[8] - 1, ca2: !!m[5], ra2: !!m[7], area: true }); return { t: 'ref', o: { ref: r }, end: i + m[0].length }; }
    m = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(])/.exec(s);
    if (m) return { t: 'ref', o: { ref: { k: 'col', sh, sh2, c1: TB.colIndex(m[2]), c2: TB.colIndex(m[4]), ca1: !!m[1], ca2: !!m[3] } }, end: i + m[0].length };
    m = /^(\$?)(\d+):(\$?)(\d+)/.exec(s);
    if (m) return { t: 'ref', o: { ref: { k: 'row', sh, sh2, r1: +m[2] - 1, r2: +m[4] - 1, ra1: !!m[1], ra2: !!m[3] } }, end: i + m[0].length };
    m = /^#(REF!)/i.exec(s); if (m) return { t: 'err', o: { v: '#REF!', sh }, end: i + m[0].length };
    m = /^([A-Za-z_À-ɏ][\w.À-ɏ]*)/.exec(s); if (m) return { t: 'name', o: { v: m[1], sh }, end: i + m[0].length };
    return null;
  }
  function readStruct(src, i) {
    // src[i] === '['
    let depth = 0, j = i, s = '';
    for (; j < src.length; j++) { const ch = src[j]; if (ch === "'" && j + 1 < src.length) { s += src[++j]; continue; } if (ch === '[') { depth++; if (depth > 1 || true) s += ch; continue; } if (ch === ']') { depth--; s += ch; if (depth === 0) break; continue; } s += ch; }
    if (depth !== 0) throw new PErr('Crochet fermant manquant', i);
    const inner = s.slice(1, -1).trim();
    const spec = { items: [], c1: null, c2: null };
    const parts = [];
    if (!/^\[/.test(inner) && !/\],\s*\[/.test(inner)) parts.push(inner);
    else { const re = /\[((?:[^\]'])*)\]/g; let m, last = 0; const rest = inner; while ((m = re.exec(rest))) { parts.push(m[1]); last = re.lastIndex; } if (/:\s*$/.test(rest.slice(last)) || !parts.length) parts.push(rest); }
    // gestion « [Col1]:[Col2] »
    const range = /^\[([^\]]*)\]\s*:\s*\[([^\]]*)\]$/.exec(inner) || /\],\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\]$/.exec(inner);
    for (let p of parts) {
      p = p.trim(); if (!p) continue;
      if (p[0] === '@') { spec.items.push('#This Row'); p = p.slice(1).replace(/^\[|\]$/g, '').trim(); if (!p) continue; }
      const it = SITEMS[p.toLowerCase()]; if (it) { if (spec.items.indexOf(it) < 0) spec.items.push(it); continue; }
      if (/^\[?[^\]]*\]?\s*:\s*\[?/.test(p) && range) continue;
      if (spec.c1 == null) spec.c1 = p.replace(/^\[|\]$/g, ''); else spec.c2 = p.replace(/^\[|\]$/g, '');
    }
    if (range) { spec.c1 = range[1]; spec.c2 = range[2]; }
    return { spec, end: j + 1 };
  }

  /* ---------------- analyse (Pratt) ---------------- */
  const BIN = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5, ':': 8 };
  /** texte (sans « = ») → arbre ; loc : paramètres d'écriture (CANON par défaut) */
  P.parse = function (src, loc) {
    loc = loc || CANON;
    const T = tokenize(String(src), loc); let i = 0;
    const peek = () => T[i], next = () => T[i++];
    const expect = (t) => { const x = next(); if (!x || x.t !== t) throw new PErr(t === ')' ? 'Parenthèse fermante manquante' : '« ' + t + ' » attendu', x ? x.p : src.length); return x; };
    function primary() {
      const x = next(); if (!x) throw new PErr('Formule incomplète', src.length);
      switch (x.t) {
        case 'num': return { t: 'n', v: x.v };
        case 'str': return { t: 's', v: x.v };
        case 'bool': return { t: 'b', v: x.v };
        case 'err': return x.sh ? { t: 'e', v: x.v, sh: x.sh } : { t: 'e', v: x.v };
        case 'ref': { let node = refNode(x.ref); if (peek() && peek().t === 'spill') { next(); node = { t: 'spill', x: node }; } return node; }
        case 'sref': return { t: 'sref', tbl: x.tbl, spec: x.spec };
        case 'name': { let node = { t: 'name', n: x.v }; if (x.sh) node.sh = x.sh; if (peek() && peek().t === 'spill') { next(); node = { t: 'spill', x: node }; } if (peek() && peek().t === '(') { /* appel d'un nom (LAMBDA nommée) */ } return node; }
        case 'fn': {
          expect('('); const args = [];
          if (peek() && peek().t === ')') { next(); }
          else {
            for (;;) {
              if (peek() && (peek().t === 'sep' || peek().t === ')')) args.push({ t: 'miss' });
              else args.push(expr(0));
              const s = next(); if (!s) throw new PErr('Parenthèse fermante manquante', src.length);
              if (s.t === ')') break; if (s.t !== 'sep') throw new PErr('« ' + loc.arg + ' » ou « ) » attendu', s.p);
              if (peek() && peek().t === ')') { args.push({ t: 'miss' }); next(); break; }
            }
          }
          let node = { t: 'fn', n: P.canonFn(x.v), a: args };
          if (node.n === 'ANCHORARRAY' && args.length === 1) node = { t: 'spill', x: args[0] };
          while (peek() && peek().t === '(') { node = { t: 'call', f: node, a: callArgs() }; }
          return node;
        }
        case '(': {
          let e = expr(0);
          if (peek() && peek().t === 'sep') { const l = [e]; while (peek() && peek().t === 'sep') { next(); l.push(expr(0)); } e = { t: 'union', l }; }
          expect(')'); let node = { t: 'paren', x: e };
          while (peek() && peek().t === '(') node = { t: 'call', f: node, a: callArgs() };
          return node;
        }
        case '{': {
          const rows = [[]];
          for (;;) {
            let neg = false; let y = next(); if (!y) throw new PErr('Accolade fermante manquante', src.length);
            if (y.t === 'op' && (y.v === '-' || y.v === '+')) { neg = y.v === '-'; y = next(); }
            let v;
            if (y.t === 'num') v = { t: 'n', v: neg ? -y.v : y.v }; else if (y.t === 'str') v = { t: 's', v: y.v }; else if (y.t === 'bool') v = { t: 'b', v: y.v }; else if (y.t === 'err') v = { t: 'e', v: y.v }; else throw new PErr('Constante attendue dans la matrice', y.p);
            rows[rows.length - 1].push(v);
            const s = next(); if (!s) throw new PErr('Accolade fermante manquante', src.length);
            if (s.t === '}') break;
            if (s.t === 'colsep' || (s.t === 'sep' && loc.arg === loc.arrCol)) continue;
            if (s.t === 'rowsep' || (s.t === 'sep' && loc.arg === loc.arrRow)) { rows.push([]); continue; }
            throw new PErr('Séparateur de matrice attendu', s.p);
          }
          const w = rows[0].length; if (rows.some((r) => r.length !== w)) throw new PErr('Lignes de longueurs différentes dans la matrice', x.p);
          return { t: 'arr', rows };
        }
        case 'op': if (x.v === '-' || x.v === '+') { const e = expr(6); return x.v === '-' ? { t: 'neg', x: e } : { t: 'pos', x: e }; } break;
      }
      throw new PErr('Élément inattendu', x.p);
    }
    function callArgs() { expect('('); const a = []; if (peek() && peek().t === ')') { next(); return a; } for (;;) { a.push(peek() && (peek().t === 'sep' || peek().t === ')') ? { t: 'miss' } : expr(0)); const s = next(); if (!s) throw new PErr('Parenthèse fermante manquante', src.length); if (s.t === ')') return a; if (s.t !== 'sep') throw new PErr('« ' + loc.arg + ' » attendu', s.p); } }
    function expr(minP) {
      let left = primary();
      for (;;) {
        const o = peek(); if (!o) break;
        if (o.t === 'op' && o.v === '%') { next(); left = { t: 'pct', x: left }; continue; }
        if (o.t !== 'op' || BIN[o.v] == null) break;
        const p = BIN[o.v]; if (p <= minP && !(o.v === '^' && false)) break;
        next();
        const right = expr(p);
        left = o.v === ':' ? { t: 'range', l: left, r: right } : { t: 'op', o: o.v, l: left, r: right };
      }
      return left;
    }
    if (!T.length) throw new PErr('Formule vide', 0);
    const ast = expr(0);
    if (i < T.length) { const x = T[i]; throw new PErr(x.t === ')' ? 'Parenthèse fermante en trop' : x.t === 'sep' ? '« ' + loc.arg + ' » inattendu (hors d\'une fonction)' : 'Élément inattendu', x.p); }
    return ast;
  };
  function refNode(r) {
    const sh = r.sh != null ? r.sh : undefined, sh2 = r.sh2 || undefined;
    if (r.k === 'cell' && !r.area) return clean({ t: 'ref', sh, sh2, r: r.r1, c: r.c1, ra: r.ra1, ca: r.ca1 });
    if (r.k === 'cell') return clean({ t: 'area', sh, sh2, r1: r.r1, c1: r.c1, r2: r.r2, c2: r.c2, ra1: r.ra1, ca1: r.ca1, ra2: r.ra2, ca2: r.ca2 });
    if (r.k === 'col') return clean({ t: 'area', k: 'col', sh, sh2, r1: 0, r2: TB.MAX_ROWS - 1, c1: r.c1, c2: r.c2, ca1: r.ca1, ca2: r.ca2, ra1: true, ra2: true });
    return clean({ t: 'area', k: 'row', sh, sh2, c1: 0, c2: TB.MAX_COLS - 1, r1: r.r1, r2: r.r2, ra1: r.ra1, ra2: r.ra2, ca1: true, ca2: true });
  }
  function clean(o) { Object.keys(o).forEach((k) => { if (o[k] === undefined || o[k] === false) delete o[k]; }); return o; }

  /* ---------------- écriture ---------------- */
  function numStr(v, loc) {
    let s;
    if (Number.isInteger(v) && Math.abs(v) < 1e21) s = String(v);
    else { s = String(v); if (/e/.test(s)) s = s.replace('e', 'E'); }
    return loc.dec === ',' ? s.replace('.', ',') : s;
  }
  const sheetPfx = (n) => n.sh != null ? TB.quoteSheet(n.sh2 ? n.sh + ':' + n.sh2 : n.sh).replace(/^'(.*)'$/, (m) => m) + '!' : '';
  function sheetPrefix(n) { if (n.sh == null) return ''; if (n.sh2) { const a = n.sh + ':' + n.sh2; return (/^[A-Za-z_À-ɏ][\w.À-ɏ]*$/.test(n.sh) && /^[A-Za-z_À-ɏ][\w.À-ɏ]*$/.test(n.sh2) ? a : "'" + a.replace(/'/g, "''") + "'") + '!'; } return TB.quoteSheet(n.sh) + '!'; }
  void sheetPfx;
  P.refText = function (n) {
    if (n.t === 'ref') return sheetPrefix(n) + TB.addr(n.r, n.c, n.ra, n.ca);
    if (n.k === 'col') return sheetPrefix(n) + (n.ca1 ? '$' : '') + TB.colName(n.c1) + ':' + (n.ca2 ? '$' : '') + TB.colName(n.c2);
    if (n.k === 'row') return sheetPrefix(n) + (n.ra1 ? '$' : '') + (n.r1 + 1) + ':' + (n.ra2 ? '$' : '') + (n.r2 + 1);
    return sheetPrefix(n) + TB.addr(n.r1, n.c1, n.ra1, n.ca1) + ':' + TB.addr(n.r2, n.c2, n.ra2, n.ca2);
  };
  function srefText(n, lang, xl) {
    const s = n.spec, it = (x) => '[' + (lang === 'fr' ? SITEMS_FR[x] || x : x) + ']';
    const col = (c) => '[' + String(c).replace(/([\[\]'#@])/g, "'$1") + ']';
    const items = s.items.filter((x) => x !== '#This Row');
    const thisRow = s.items.indexOf('#This Row') >= 0;
    let inner;
    if (xl && thisRow) { const parts = ['[#This Row]'].concat(items.map(it)); if (s.c1 != null) parts.push(s.c2 ? col(s.c1) + ':' + col(s.c2) : col(s.c1)); inner = parts.join(','); }
    else if (thisRow && !items.length) inner = '@' + (s.c2 ? col(s.c1) + ':' + col(s.c2) : /[^\wÀ-ɏ]/.test(s.c1 || '') ? col(s.c1) : (s.c1 || ''));
    else {
      const parts = items.map(it); if (s.c1 != null) parts.push(s.c2 ? col(s.c1) + ':' + col(s.c2) : col(s.c1));
      inner = parts.length === 1 && s.c1 != null && !s.c2 && !items.length ? String(s.c1).replace(/([\[\]'#@])/g, "'$1") : parts.length === 1 && items.length === 1 && s.c1 == null ? (lang === 'fr' ? SITEMS_FR[items[0]] || items[0] : items[0]) : parts.join(',');
    }
    return (n.tbl || '') + '[' + inner + ']';
  }
  /** arbre → texte ; loc : CANON (stockage) ou P.userLoc() (affichage) */
  P.write = function (n, loc) {
    loc = loc || CANON;
    const W = (x) => P.write(x, loc);
    switch (n.t) {
      case 'n': return numStr(n.v, loc);
      case 's': return '"' + n.v.replace(/"/g, '""') + '"';
      case 'b': return loc.fn === 'fr' ? (n.v ? 'VRAI' : 'FAUX') : (n.v ? 'TRUE' : 'FALSE');
      case 'e': return (n.sh != null ? TB.quoteSheet(n.sh) + '!' : '') + (loc.fn === 'fr' ? TB.ERR_FR[n.v] || n.v : n.v);
      case 'ref': case 'area': return P.refText(n);
      case 'spill': return loc.xl ? '_xlfn.ANCHORARRAY(' + W(n.x) + ')' : W(n.x) + '#';
      case 'name': return (n.sh ? TB.quoteSheet(n.sh) + '!' : '') + n.n;
      case 'sref': return srefText(n, loc.fn, loc.xl);
      case 'miss': return '';
      case 'fn': return (loc.xl ? P.fileFn(n.n) : P.displayFn(n.n, loc.fn)) + '(' + n.a.map(W).join(loc.arg) + ')';
      case 'call': return W(n.f) + '(' + n.a.map(W).join(loc.arg) + ')';
      case 'paren': return '(' + W(n.x) + ')';
      case 'union': return n.l.map(W).join(loc.arg);
      case 'neg': return '-' + W(n.x);
      case 'pos': return '+' + W(n.x);
      case 'pct': return W(n.x) + '%';
      case 'range': return W(n.l) + ':' + W(n.r);
      case 'op': return W(n.l) + n.o + W(n.r);
      case 'arr': return '{' + n.rows.map((r) => r.map(W).join(loc.arrCol)).join(loc.arrRow) + '}';
    }
    return '';
  };
  /** écriture des fichiers .xlsx : préfixes _xlfn. / _xlfn._xlws. des fonctions récentes, ANCHORARRAY pour A1# */
  P.XL = Object.assign({}, CANON, { xl: true });
  P.fileFn = function (name) { const d = TB.FN && TB.FN[name]; return d && d.x === 2 ? '_xlfn._xlws.' + name : d && d.x ? '_xlfn.' + name : name; };
  /** texte pour un fichier .xlsx ; sh, r, c : position (nom du tableau des références « cette ligne ») */
  P.toFile = (canon, sh, r, c) => { try { let ast = P.parse(canon, CANON); if (sh && /\[/.test(canon)) { const t = sh.tableAt(r, c); ast = P.map(ast, (x) => x.t === 'sref' && !x.tbl ? Object.assign({}, x, { tbl: t ? t.name : '' }) : undefined); } return P.write(ast, P.XL); } catch (e) { return canon; } };
  /** Conversion directe d'un texte de formule entre deux écritures (null si invalide) */
  P.convert = function (src, from, to) { try { return P.write(P.parse(src, from), to); } catch (e) { return null; } };
  P.toUser = (canon) => { try { return P.write(P.parse(canon, CANON), P.userLoc()); } catch (e) { return canon; } };
  P.fromUser = (txt) => P.write(P.parse(txt, P.userLoc()), CANON);

  /* ---------------- parcours ---------------- */
  P.walk = function (n, fn) {
    if (!n || typeof n !== 'object') return;
    if (fn(n) === false) return;
    switch (n.t) {
      case 'fn': case 'call': if (n.f) P.walk(n.f, fn); n.a.forEach((x) => P.walk(x, fn)); break;
      case 'paren': case 'neg': case 'pos': case 'pct': case 'spill': P.walk(n.x, fn); break;
      case 'op': case 'range': P.walk(n.l, fn); P.walk(n.r, fn); break;
      case 'union': n.l.forEach((x) => P.walk(x, fn)); break;
      case 'arr': n.rows.forEach((r) => r.forEach((x) => P.walk(x, fn))); break;
    }
  };
  /** Copie de l'arbre avec transformation des nœuds (fn renvoie un nœud de remplacement ou undefined) */
  P.map = function (n, fn) {
    const r = fn(n); if (r !== undefined) return r;
    switch (n.t) {
      case 'fn': return Object.assign({}, n, { a: n.a.map((x) => P.map(x, fn)) });
      case 'call': return Object.assign({}, n, { f: P.map(n.f, fn), a: n.a.map((x) => P.map(x, fn)) });
      case 'paren': case 'neg': case 'pos': case 'pct': case 'spill': return Object.assign({}, n, { x: P.map(n.x, fn) });
      case 'op': case 'range': return Object.assign({}, n, { l: P.map(n.l, fn), r: P.map(n.r, fn) });
      case 'union': return Object.assign({}, n, { l: n.l.map((x) => P.map(x, fn)) });
      default: return n;
    }
  };
  const REFERR = (n) => n.sh != null ? { t: 'e', v: '#REF!', sh: n.sh } : { t: 'e', v: '#REF!' };

  /** Recopie : décale les références relatives de (dr, dc) ; hors de la feuille → #REF! */
  P.shift = function (ast, dr, dc) {
    if (!dr && !dc) return ast;
    return P.map(ast, (n) => {
      if (n.t === 'ref') { const r = n.ra ? n.r : n.r + dr, c = n.ca ? n.c : n.c + dc; if (r < 0 || c < 0 || r >= TB.MAX_ROWS || c >= TB.MAX_COLS) return REFERR(n); return Object.assign({}, n, { r, c }); }
      if (n.t === 'area') {
        const o = Object.assign({}, n);
        if (n.k !== 'col') { if (!n.ra1) o.r1 += dr; if (!n.ra2) o.r2 += dr; }
        if (n.k !== 'row') { if (!n.ca1) o.c1 += dc; if (!n.ca2) o.c2 += dc; }
        if (o.r1 < 0 || o.c1 < 0 || o.r2 >= TB.MAX_ROWS || o.c2 >= TB.MAX_COLS || o.r2 < 0 || o.c2 < 0) return REFERR(n);
        if (o.r1 > o.r2) { const t = o.r1; o.r1 = o.r2; o.r2 = t; } if (o.c1 > o.c2) { const t = o.c1; o.c1 = o.c2; o.c2 = t; }
        return o;
      }
    });
  };
  /**
   * Adaptation à une modification de structure. op : {sheet (nom), axis:'r'|'c', at, n (insertion > 0, suppression < 0)}
   * home : nom de la feuille de la formule (références sans feuille).
   */
  P.restructure = function (ast, op, home) {
    const on = (n) => (n.sh != null ? n.sh : home) === op.sheet && !n.sh2;
    const R = op.axis === 'r';
    const ins = op.n > 0, at = op.at, cnt = Math.abs(op.n);
    const mv = (v) => ins ? (v >= at ? v + cnt : v) : (v >= at + cnt ? v - cnt : v);
    let changed = false;
    const out = P.map(ast, (n) => {
      if (n.t === 'ref' && on(n)) {
        const v = R ? n.r : n.c;
        if (!ins && v >= at && v < at + cnt) { changed = true; return REFERR(n); }
        const w = mv(v); if (w === v) return n; changed = true;
        if (w >= (R ? TB.MAX_ROWS : TB.MAX_COLS)) return REFERR(n);
        return Object.assign({}, n, R ? { r: w } : { c: w });
      }
      if (n.t === 'area' && on(n)) {
        if ((R && n.k === 'col') || (!R && n.k === 'row')) return n;
        const a = R ? n.r1 : n.c1, b = R ? n.r2 : n.c2;
        let a2, b2;
        if (ins) { a2 = a >= at ? a + cnt : a; b2 = b >= at ? b + cnt : b; const lim = (R ? TB.MAX_ROWS : TB.MAX_COLS) - 1; if (b2 > lim) b2 = lim; if (a2 > lim) return REFERR(n); }
        else {
          const e = at + cnt - 1;
          if (a >= at && b <= e) { changed = true; return REFERR(n); }
          a2 = a < at ? a : a > e ? a - cnt : at;
          b2 = b < at ? b : b > e ? b - cnt : at - 1;
          if (b2 < a2) { changed = true; return REFERR(n); }
        }
        if (a2 === a && b2 === b) return n; changed = true;
        return Object.assign({}, n, R ? { r1: a2, r2: b2 } : { c1: a2, c2: b2 });
      }
    });
    return changed ? out : ast;
  };
  /** Déplacement d'une plage (couper-coller) : les références qui pointent dans src suivent vers (dr, dc) */
  P.moveRefs = function (ast, src, dr, dc, home, destSheet) {
    const on = (n) => (n.sh != null ? n.sh : home) === src.sheet && !n.sh2;
    let changed = false;
    const ds = destSheet && destSheet !== src.sheet ? destSheet : null;
    const out = P.map(ast, (n) => {
      if (n.t === 'ref' && on(n) && TB.inRange(src, n.r, n.c)) { changed = true; const o = Object.assign({}, n, { r: n.r + dr, c: n.c + dc }); if (ds) o.sh = ds; return o; }
      if (n.t === 'area' && on(n) && !n.k && n.r1 >= src.r1 && n.r2 <= src.r2 && n.c1 >= src.c1 && n.c2 <= src.c2) { changed = true; const o = Object.assign({}, n, { r1: n.r1 + dr, r2: n.r2 + dr, c1: n.c1 + dc, c2: n.c2 + dc }); if (ds) o.sh = ds; return o; }
    });
    return changed ? out : ast;
  };
  /** Feuille renommée (ou supprimée si newName === null → #REF!) */
  P.renameSheet = function (ast, oldName, newName) {
    let changed = false;
    const low = String(oldName).toLowerCase();
    const out = P.map(ast, (n) => {
      if ((n.t === 'ref' || n.t === 'area' || n.t === 'name' || n.t === 'e') && n.sh != null && (String(n.sh).toLowerCase() === low || (n.sh2 && String(n.sh2).toLowerCase() === low))) {
        changed = true;
        if (newName == null) { if (n.sh2) { return n; } return n.t === 'name' ? n : { t: 'e', v: '#REF!' }; }
        const o = Object.assign({}, n); if (String(n.sh).toLowerCase() === low) o.sh = newName; if (n.sh2 && String(n.sh2).toLowerCase() === low) o.sh2 = newName; return o;
      }
    });
    return changed ? out : ast;
  };
  /** Changer de nom un tableau ou une colonne de tableau dans les références structurées */
  P.renameTable = function (ast, oldName, newName, colOld, colNew) {
    let changed = false; const low = String(oldName).toLowerCase();
    const out = P.map(ast, (n) => {
      if (n.t === 'sref' && String(n.tbl).toLowerCase() === low) {
        changed = true; const o = Object.assign({}, n, { tbl: newName != null ? newName : n.tbl, spec: Object.assign({}, n.spec) });
        if (colOld != null) { if (String(o.spec.c1).toLowerCase() === String(colOld).toLowerCase()) o.spec.c1 = colNew; if (o.spec.c2 && String(o.spec.c2).toLowerCase() === String(colOld).toLowerCase()) o.spec.c2 = colNew; }
        return o;
      }
    });
    return changed ? out : ast;
  };
  /** Bascule $ (F4) sur la référence sous le curseur : A1 → $A$1 → A$1 → $A1 → A1 */
  P.cycleAbs = function (text, caret) {
    const re = /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?/g; let m;
    while ((m = re.exec(text))) {
      const s = m.index, e = s + m[0].length;
      if (caret < s || caret > e) continue;
      if (s > 0 && /[A-Za-z0-9_.À-ɏ"]/.test(text[s - 1])) continue;
      const cyc = (dc, dr) => !dc && !dr ? ['$', '$'] : dc && dr ? ['', '$'] : !dc && dr ? ['$', ''] : ['', ''];
      const [a, b] = cyc(!!m[1], !!m[3]);
      let rep = a + m[2] + b + m[4];
      if (m[6]) { const [c, d] = cyc(!!m[5], !!m[7]); rep += ':' + c + m[6] + d + m[8]; }
      return { text: text.slice(0, s) + rep + text.slice(e), caret: s + rep.length };
    }
    return null;
  };
  /** Références d'une formule (pour les couleurs pendant la saisie) : [{start, end, text, sh, g}] */
  P.refsIn = function (src, loc) {
    let T; try { T = tokenize(src, loc || P.userLoc()); } catch (e) { return []; }
    const out = [];
    T.forEach((x, k) => {
      if (x.t !== 'ref') return;
      const r = x.ref; const end = (T[k + 1] ? T[k + 1].p : src.length);
      let g;
      if (r.k === 'cell') g = { r1: r.r1, c1: r.c1, r2: r.area ? r.r2 : r.r1, c2: r.area ? r.c2 : r.c1 };
      else if (r.k === 'col') g = { r1: 0, r2: TB.MAX_ROWS - 1, c1: Math.min(r.c1, r.c2), c2: Math.max(r.c1, r.c2) };
      else g = { r1: Math.min(r.r1, r.r2), r2: Math.max(r.r1, r.r2), c1: 0, c2: TB.MAX_COLS - 1 };
      if (g.r1 > g.r2) { const t = g.r1; g.r1 = g.r2; g.r2 = t; } if (g.c1 > g.c2) { const t = g.c1; g.c1 = g.c2; g.c2 = t; }
      let e = end; while (e > x.p && /\s/.test(src[e - 1])) e--;
      out.push({ start: x.p, end: e, text: src.slice(x.p, e), sh: r.sh, g });
    });
    return out;
  };
  P.tokenize = tokenize;
  /** Le curseur est-il à un endroit où l'on peut insérer une référence (après un opérateur, « ( », « ; ») ? */
  P.canPoint = function (text, caret) {
    const before = text.slice(0, caret).replace(/\s+$/, '');
    if (!before.length) return false;
    if (before === '=') return true;
    const ch = before[before.length - 1];
    return /[=+\-*/^&<>(;,:%{]/.test(ch) && !(ch === ',' && TB.loc.arg !== ',' && /\d,$/.test(before)) && !(/"[^"]*$/.test(before.replace(/"[^"]*"/g, '')));
  };
})(typeof window !== 'undefined' ? window : globalThis);
