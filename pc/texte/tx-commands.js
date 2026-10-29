/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-texte/tx-commands.js : ne pas modifier ici. */
/* Texte — commandes : mise en forme des caractères et des paragraphes, styles, listes, bordures et trames,
   insertions (images, formes, champs, notes, signets, liens, sauts, sections, table des matières, tableaux),
   tableaux (lignes, colonnes, fusion, tri, formules), reproduire la mise en forme, casse, révisions.
   Toutes les commandes prennent la vue active (document, en-tête ou note) : TX.C.nom(view, …). */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, PM = window.PM;
  const { TextSelection, NodeSelection, AllSelection } = PM.state;
  const { Fragment } = PM.model;
  const TB = PM.tables;
  const S = TX.schema, NT = S.nodes, MK = S.marks;
  const C = TX.C = {};
  const attrsOf = (view) => TX.attrsOf(view.state);
  const run = (view, tr, label) => { if (tr && tr.docChanged || tr && tr.selectionSet || tr && tr.storedMarksSet) { if (label) tr.setMeta('tx-label', label); view.dispatch(tr.scrollIntoView()); } view.focus(); return true; };

  /* ---------------- paragraphes de la sélection ---------------- */
  function paras(state, cb) {
    const { from, to } = state.selection; const out = [];
    state.doc.nodesBetween(from, Math.max(to, from + (state.selection.empty ? 0 : 0)), (n, pos) => { if (n.type === NT.paragraph) { out.push({ node: n, pos }); return false; } return true; });
    if (!out.length) { const $f = state.selection.$from; for (let d = $f.depth; d > 0; d--) if ($f.node(d).type === NT.paragraph) { out.push({ node: $f.node(d), pos: $f.before(d) }); break; } }
    if (cb) out.forEach(cb);
    return out;
  }
  C.paras = paras;
  /** Attributs de paragraphe (null = valeur du style) sur les paragraphes de la sélection */
  C.setPara = function (view, patch, label) {
    const tr = view.state.tr;
    paras(view.state).forEach(({ node, pos }) => { const a = Object.assign({}, node.attrs, typeof patch === 'function' ? patch(node.attrs, node) : patch); tr.setNodeMarkup(pos, null, a); });
    return run(view, tr, label || 'Paragraphe');
  };
  C.align = (view, al) => C.setPara(view, { al: al === 'left' ? null : al }, 'Alignement');
  C.lineSpacing = (view, ln, lr) => C.setPara(view, { ln, lr: lr || 'auto' }, 'Interligne');
  C.spaceBefore = (view, v) => C.setPara(view, { sb: v }, 'Espacement avant');
  C.spaceAfter = (view, v) => C.setPara(view, { sa: v }, 'Espacement après');
  C.indent = function (view, dir) {
    const ps = paras(view.state);
    if (ps.length && ps.every((p) => p.node.attrs.li)) return C.setPara(view, (a) => ({ li: Object.assign({}, a.li, { l: Math.max(0, Math.min(8, (a.li.l || 0) + dir)) }), il: null, fi: null }), 'Retrait');
    const styles = attrsOf(view).styles || {};
    return C.setPara(view, (a) => { const base = a.il != null ? a.il : (TX.resolveStyle(styles, a.s).p.il || 0); const tab = 35.4; const v = dir > 0 ? (Math.floor(base / tab + 0.01) + 1) * tab : Math.max(0, (Math.ceil(base / tab - 0.01) - 1) * tab); return { il: Math.round(v * 10) / 10 }; }, 'Retrait');
  };

  /* ---------------- marques ---------------- */
  function markRange(state) {
    const sel = state.selection;
    if (sel instanceof NodeSelection || sel instanceof TB.CellSelection) { const r = []; if (sel instanceof TB.CellSelection) sel.forEachCell((c, pos) => r.push([pos + 1, pos + c.nodeSize - 1])); else r.push([sel.from, sel.to]); return r; }
    return sel.ranges.map((r) => [r.$from.pos, r.$to.pos]);
  }
  /** Pose (ou retire si attrs === null) une marque sur la sélection ; curseur : marque « stockée » pour la frappe */
  C.mark = function (view, name, attrs, label) {
    const state = view.state, type = MK[name], tr = state.tr;
    if (state.selection.empty && !(state.selection instanceof NodeSelection)) {
      let marks = state.storedMarks || state.selection.$from.marks();
      marks = type.removeFromSet(marks);
      if (attrs !== null) marks = type.create(attrs || null).addToSet(marks);
      tr.setStoredMarks(marks); view.dispatch(tr); view.focus(); return true;
    }
    markRange(state).forEach(([a, b]) => { tr.removeMark(a, b, type); if (attrs !== null) tr.addMark(a, b, type.create(attrs || null)); });
    return run(view, tr, label || 'Mise en forme');
  };
  /** Gras / italique : bascule en tenant compte du style (un titre gras peut être « dégraissé ») */
  C.toggle = function (view, what) {
    const st = TX.fmtState(view.state, attrsOf(view));
    if (what === 'b' || what === 'i') {
      const on = what === 'b' ? st.bold : st.italic, neg = what === 'b' ? 'nob' : 'noi';
      const styleOn = (() => { const p = st.par ? TX.resolveStyle(attrsOf(view).styles || {}, st.par.attrs.s).r : {}; return what === 'b' ? !!p.b : !!p.i; })();
      if (on) { C.mark(view, what, null); if (styleOn) C.mark(view, neg, {}); }
      else { C.mark(view, neg, null); if (!styleOn) C.mark(view, what, {}); }
      return true;
    }
    if (what === 'u') return C.mark(view, 'u', st.underline ? null : { s: 'single' }, 'Souligné');
    if (what === 's') return C.mark(view, 's', st.strike && !st.dstrike ? null : { dbl: false }, 'Barré');
    if (what === 'ss') return C.mark(view, 's', st.dstrike ? null : { dbl: true }, 'Barré double');
    if (what === 'sup') return C.mark(view, 'va', st.sup ? null : { v: 'sup' }, 'Exposant');
    if (what === 'sub') return C.mark(view, 'va', st.sub ? null : { v: 'sub' }, 'Indice');
    if (what === 'caps') return C.mark(view, 'caps', st.caps ? null : {}, 'Majuscules');
    if (what === 'smcaps') return C.mark(view, 'smcaps', st.smcaps ? null : {}, 'Petites majuscules');
    if (what === 'hidden') return C.mark(view, 'hidden', st.hidden ? null : {}, 'Masqué');
    return false;
  };
  C.font = (view, f) => C.mark(view, 'font', f ? { f } : null, 'Police');
  C.size = (view, pt) => C.mark(view, 'size', pt ? { pt: Math.max(1, Math.min(1638, Math.round(pt * 2) / 2)) } : null, 'Taille');
  C.color = (view, c) => C.mark(view, 'color', c && c !== 'auto' ? { c } : null, 'Couleur');
  C.highlight = (view, c) => C.mark(view, 'hl', c ? { c } : null, 'Surlignage');
  C.shade = (view, c) => C.mark(view, 'shd', c ? { c } : null, 'Trame du texte');
  C.spacing = (view, pt) => C.mark(view, 'sp', pt ? { pt } : null, 'Espacement');
  C.raise = (view, pt) => C.mark(view, 'pos', pt ? { pt } : null, 'Position');
  C.underline = (view, s, c) => C.mark(view, 'u', s ? { s, c: c || null } : null, 'Souligné');
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
  C.SIZES = SIZES;
  C.grow = function (view, dir) {
    const sz = TX.fmtState(view.state, attrsOf(view)).size || 11;
    const n = dir > 0 ? (SIZES.find((x) => x > sz + 0.01) || sz + 10) : (SIZES.slice().reverse().find((x) => x < sz - 0.01) || Math.max(1, sz - 1));
    return C.size(view, n);
  };
  /** Effacer la mise en forme : caractères (marques sauf liens, commentaires, révisions) et paragraphe (retour au style) */
  C.clearChar = function (view) {
    const tr = view.state.tr; const keep = new Set(['link', 'cmt', 'ins', 'del']);
    markRange(view.state).forEach(([a, b]) => Object.values(MK).forEach((m) => { if (!keep.has(m.name)) tr.removeMark(a, b, m); }));
    if (view.state.selection.empty) tr.setStoredMarks([]);
    return run(view, tr, 'Effacer la mise en forme');
  };
  C.clearPara = (view) => C.setPara(view, (a) => { const o = {}; Object.keys(TX.P_ATTRS).forEach((k) => { if (!/^(s|li|ls|pid|ctx)$/.test(k)) o[k] = null; }); return o; }, 'Mise en forme du paragraphe');
  C.clearAll = function (view) { C.clearChar(view); C.setPara(view, (a) => { const o = { s: 'Normal', li: null, ls: null }; Object.keys(TX.P_ATTRS).forEach((k) => { if (!/^(s|li|ls|pid|ctx)$/.test(k)) o[k] = null; }); return o; }, 'Effacer toute la mise en forme'); return true; };
  /** Casse : phrase, minuscules, MAJUSCULES, Chaque Mot, iNVERSER */
  C.changeCase = function (view, mode) {
    const state = view.state; if (state.selection.empty) return false;
    const tr = state.tr; let first = true;
    state.doc.nodesBetween(state.selection.from, state.selection.to, (n, pos) => {
      if (!n.isText) return true;
      const a = Math.max(pos, state.selection.from), b = Math.min(pos + n.nodeSize, state.selection.to);
      const t = n.text.slice(a - pos, b - pos);
      let o = t;
      if (mode === 'upper') o = t.toLocaleUpperCase('fr'); else if (mode === 'lower') o = t.toLocaleLowerCase('fr');
      else if (mode === 'title') o = t.toLocaleLowerCase('fr').replace(/(^|[\s'’(«-])(\p{L})/gu, (m, p, c) => p + c.toLocaleUpperCase('fr'));
      else if (mode === 'sentence') { o = t.toLocaleLowerCase('fr'); if (first) o = o.replace(/\p{L}/u, (c) => c.toLocaleUpperCase('fr')); o = o.replace(/([.!?]\s+)(\p{L})/gu, (m, p, c) => p + c.toLocaleUpperCase('fr')); }
      else if (mode === 'toggle') o = Array.from(t).map((c) => c === c.toLocaleUpperCase('fr') ? c.toLocaleLowerCase('fr') : c.toLocaleUpperCase('fr')).join('');
      first = false;
      if (o !== t) tr.replaceWith(tr.mapping.map(a), tr.mapping.map(b), S.text(o, n.marks));
      return false;
    });
    return run(view, tr, 'Casse');
  };

  /* ---------------- styles ---------------- */
  C.setStyle = function (view, id) {
    const styles = attrsOf(view).styles || {}, st = styles[id];
    if (!st) return false;
    if (st.t === 'c') {
      if (view.state.selection.empty) { const $f = view.state.selection.$from, w = wordAt($f); if (w) { const tr = view.state.tr.addMark(w[0], w[1], MK.cs.create({ id })); return run(view, tr, 'Style'); } }
      return C.mark(view, 'cs', { id }, 'Style');
    }
    // style de paragraphe : la mise en forme directe des paragraphes est retirée (comme « appliquer le style »)
    return C.setPara(view, (a) => { const o = { s: id }; if (st.lvl) { o.al = null; o.sb = null; o.sa = null; o.il = a.li ? null : a.il; } if (/^(Titre\d|Titre|SousTitre)$/.test(id) && a.li && !(st.p && st.p.li)) { o.li = a.li; } return o; }, 'Style');
  };
  function wordAt($p) {
    const t = $p.parent.textContent, o = $p.parentOffset; if (!t) return null;
    let a = o, b = o; while (a > 0 && /[\p{L}\p{N}_’'-]/u.test(t[a - 1])) a--; while (b < t.length && /[\p{L}\p{N}_’'-]/u.test(t[b])) b++;
    if (a === b) return null; const base = $p.start(); return [base + a, base + b];
  }
  C.wordAt = wordAt;
  /** Style à partir de la sélection (« Créer un style ») */
  C.styleFromSelection = function (view, name) {
    const A = attrsOf(view), st = TX.fmtState(view.state, A);
    const id = name.replace(/[^\p{L}\p{N}]/gu, '') || TX.uid('S');
    const r = {}; if (st.font) r.f = st.font; if (st.size) r.sz = st.size; if (st.bold) r.b = 1; if (st.italic) r.i = 1; if (st.color) r.c = st.color; if (st.underline) r.u = 'single';
    const p = {}; ['al', 'il', 'ir', 'fi', 'sb', 'sa', 'ln', 'lr', 'bd', 'sh'].forEach((k) => { if (st.par && st.par.attrs[k] != null) p[k] = st.par.attrs[k]; });
    return { id, def: { n: name, t: 'p', b: st.style || 'Normal', nx: id, q: 1, p, r } };
  };

  /* ---------------- listes ---------------- */
  /** Applique une liste (puces, numéros…) à la transaction ; réutilise la liste du paragraphe précédent si même genre */
  TX.cmdListTr = function (state, kind, tr) {
    tr = tr || state.tr;
    const A = TX.attrsOf(state), lists = Object.assign({}, A.lists || {});
    const tmpl = TX.LIST_KINDS[kind] ? TX.LIST_KINDS[kind]() : TX.LIST_KINDS.puces();
    const ps = paras(tr.doc ? { doc: tr.doc, selection: tr.selection } : state);
    if (!ps.length) return null;
    // liste voisine de même genre et même aspect
    const $first = tr.doc.resolve(ps[0].pos); const idx = $first.index($first.depth); const parent = $first.parent;
    let reuse = null;
    for (let k = idx - 1; k >= 0 && k >= idx - 1; k--) { const prev = parent.child(k); if (prev.type === NT.paragraph && prev.attrs.li && lists[prev.attrs.li.id]) { const d = lists[prev.attrs.li.id]; if (d.k === tmpl.k && JSON.stringify(d.lv[0].t) === JSON.stringify(tmpl.lv[0].t) && d.lv[0].f === tmpl.lv[0].f) reuse = prev.attrs.li.id; } }
    let id = reuse;
    if (!id) { id = TX.uid('L'); lists[id] = tmpl; tr.setDocAttribute ? null : null; }
    ps.forEach(({ node, pos }) => tr.setNodeMarkup(pos, null, Object.assign({}, node.attrs, { li: { id, l: node.attrs.li ? node.attrs.li.l || 0 : 0 }, il: null, fi: null, s: node.attrs.s === 'Normal' ? 'ParagrapheListe' : node.attrs.s })));
    if (!reuse) TX.setDocAttr(tr, state, 'lists', lists);
    return tr;
  };
  /** Attribut du document principal (styles, listes, réglages…) : dans le document lui-même (annuler / rétablir) */
  TX.setDocAttr = function (tr, state, key, value) {
    if (state.doc.attrs && state.doc.attrs.styles) { tr.setDocAttribute(key, value); return tr; }
    if (TX._setMainAttr) TX._setMainAttr(key, value);   // éditeur d'en-tête / note : sur le document principal
    return tr;
  };
  C.list = function (view, kind) {
    const state = view.state, ps = paras(state), A = attrsOf(view);
    const tmpl = TX.LIST_KINDS[kind] ? TX.LIST_KINDS[kind]() : null;
    const cur = ps.length && ps.every((p) => p.node.attrs.li && A.lists && A.lists[p.node.attrs.li.id]) ? A.lists[ps[0].node.attrs.li.id] : null;
    // même genre déjà appliqué : on retire la liste
    if (cur && (!tmpl || (cur.k === tmpl.k && cur.lv[0].t === tmpl.lv[0].t && cur.lv[0].f === tmpl.lv[0].f))) {
      const tr = state.tr; ps.forEach(({ node, pos }) => tr.setNodeMarkup(pos, null, Object.assign({}, node.attrs, { li: null, ls: null, s: node.attrs.s === 'ParagrapheListe' ? 'Normal' : node.attrs.s })));
      return run(view, tr, 'Liste');
    }
    // changement d'aspect d'une liste existante (même liste : tous ses paragraphes)
    if (cur && tmpl) {
      const lists = Object.assign({}, A.lists); const id = ps[0].node.attrs.li.id; lists[id] = Object.assign({}, tmpl);
      const tr = state.tr; TX.setDocAttr(tr, state, 'lists', lists); TX.refresh(tr); return run(view, tr, 'Liste');
    }
    const tr = TX.cmdListTr(state, kind || 'puces'); return tr ? run(view, TX.refresh(tr), 'Liste') : false;
  };
  C.listRestart = (view, n) => C.setPara(view, { ls: n == null ? 1 : n }, 'Numérotation');
  C.listContinue = (view) => C.setPara(view, { ls: null }, 'Numérotation');
  C.listLevel = (view, l) => C.setPara(view, (a) => (a.li ? { li: Object.assign({}, a.li, { l }), il: null, fi: null } : {}), 'Niveau de liste');
  /** Modifie la définition de la liste du paragraphe courant (niveau : format, texte, retraits, début) */
  C.defineList = function (view, def) {
    const ps = paras(view.state); if (!ps.length || !ps[0].node.attrs.li) return false;
    const A = attrsOf(view), lists = Object.assign({}, A.lists); lists[ps[0].node.attrs.li.id] = def;
    const tr = view.state.tr; TX.setDocAttr(tr, view.state, 'lists', lists); TX.refresh(tr); return run(view, tr, 'Définir la liste');
  };
  TX.refresh = (tr) => tr.setMeta('tx-refresh', true);

  /* ---------------- bordures, trame de paragraphe ---------------- */
  C.paraBorder = function (view, which, b) {
    // which : 'bottom'|'top'|'left'|'right'|'all'|'outside'|'none'|'inside'
    const map = { bottom: ['b'], top: ['t'], left: ['l'], right: ['r'], outside: ['t', 'b', 'l', 'r'], all: ['t', 'b', 'l', 'r'], inside: [] };
    return C.setPara(view, (a) => {
      if (which === 'none') return { bd: null };
      const bd = Object.assign({}, a.bd || {}); const set = !(map[which] || []).every((k) => bd[k] && bd[k].s && bd[k].s !== 'none');
      (map[which] || []).forEach((k) => { if (set) bd[k] = Object.assign({ s: 'single', w: 0.5, c: '#000000', sp: k === 'l' || k === 'r' ? 4 : 1 }, b || {}); else delete bd[k]; });
      return { bd: Object.keys(bd).length ? bd : null };
    }, 'Bordure');
  };
  C.paraShade = (view, c) => C.setPara(view, { sh: c || null }, 'Trame de fond');
  C.dropCap = (view, mode, n) => C.setPara(view, { dc: mode === 'none' ? null : { n: n || 3, mode } }, 'Lettrine');

  /* ---------------- insertions ---------------- */
  C.insertNode = function (view, node, label) { const tr = view.state.tr.replaceSelectionWith(node, false); return run(view, tr, label); };
  C.insertText = (view, t) => run(view, view.state.tr.insertText(t), 'Insertion');
  C.insertField = (view, f, extra) => C.insertNode(view, NT.field.create(Object.assign({ f }, extra || {})), 'Champ');
  C.insertImage = function (view, mediaId, w, h, extra) {
    const maxW = TX.contentWidthAt ? TX.contentWidthAt(view) : 450;
    if (w > maxW) { h = h * maxW / w; w = maxW; }
    return C.insertNode(view, NT.image.create(Object.assign({ m: mediaId, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10, alt: '' }, extra || {})), 'Image');
  };
  C.insertDrawing = (view, attrs) => C.insertNode(view, NT.drawing.create(attrs), attrs.kind === 'textbox' ? 'Zone de texte' : 'Objet');
  C.insertMath = (view, tex, display) => {
    if (display) { const tr = view.state.tr; const $f = view.state.selection.$from; const node = NT.paragraph.create({ s: 'Normal', al: 'center' }, NT.math.create({ tex, display: true })); if ($f.parent.type === NT.paragraph && !$f.parent.content.size) tr.replaceWith($f.before(), $f.after(), node); else tr.insert($f.after(), node); return run(view, tr, 'Équation'); }
    return C.insertNode(view, NT.math.create({ tex, display: false }), 'Équation');
  };
  C.link = function (view, href, text) {
    const state = view.state;
    if (!href) { const tr = state.tr; let { from, to } = state.selection; if (state.selection.empty) { const $f = state.selection.$from; const m = $f.marks().find((x) => x.type === MK.link); if (m) { let a = $f.pos, b = $f.pos; while (a > $f.start() && state.doc.rangeHasMark(a - 1, a, MK.link)) a--; while (b < $f.end() && state.doc.rangeHasMark(b, b + 1, MK.link)) b++; from = a; to = b; } } tr.removeMark(from, to, MK.link); return run(view, tr, 'Supprimer le lien'); }
    const mark = MK.link.create({ href });
    if (state.selection.empty) { const t = text || href.replace(/^#bk-/, ''); const tr = state.tr.insertText(t); const from = state.selection.from; tr.addMark(from, from + t.length, mark); return run(view, tr, 'Lien'); }
    return run(view, state.tr.addMark(state.selection.from, state.selection.to, mark), 'Lien');
  };
  C.bookmark = (view, name) => C.insertNode(view, NT.bookmark.create({ name }), 'Signet');
  C.symbol = (view, ch) => C.insertText(view, ch);
  C.pageBreak = (view) => { TX.cmdPageBreak(view.state, view.dispatch); view.focus(); return true; };
  C.colBreak = (view) => { TX.cmdColBreak(view.state, view.dispatch); view.focus(); return true; };
  /** Saut de section (« page suivante », « continu », « page paire », « page impaire ») à la position du curseur */
  C.sectionBreak = function (view, type, pgPatch) {
    const state = view.state, $f = state.selection.$from;
    if ($f.depth < 2 || $f.node(1).type !== NT.section || $f.node(2).type !== NT.paragraph || $f.depth !== 2) { O.toast('Placez le curseur dans un paragraphe du texte (hors tableau)', { bad: true }); return false; }
    const tr = state.tr; if (!state.selection.empty) tr.deleteSelection();
    const pos = tr.selection.from, $p = tr.doc.resolve(pos);
    const old = $p.node(1);
    tr.split(pos, 2);
    const $n = tr.doc.resolve(tr.mapping.map(pos, 1));
    const secPos = $n.before(1), sec = tr.doc.nodeAt(secPos);
    tr.setNodeMarkup(secPos, null, { pg: Object.assign({}, TX.pg(old), { type: type || 'page', numStart: null, hdr: { def: null, first: null, even: null }, ftr: { def: null, first: null, even: null } }, pgPatch || {}) });
    void sec;
    return run(view, tr, 'Saut de section');
  };
  /** Mise en page d'une ou de toutes les sections */
  C.setPage = function (view, patch, scope) {
    const state = view.state, tr = state.tr;
    const cur = state.selection.$from.index(0);
    state.doc.forEach((sec, off, i) => {
      if (scope === 'section' && i !== cur) return; if (scope === 'after' && i < cur) return;
      const pg = Object.assign({}, TX.pg(sec), typeof patch === 'function' ? patch(TX.pg(sec), i) : patch);
      tr.setNodeMarkup(off, null, { pg });
    });
    return run(view, tr, 'Mise en page');
  };
  C.orient = (view, o, scope) => C.setPage(view, (pg) => { if (pg.orient === o) return {}; return { orient: o, w: pg.h, h: pg.w }; }, scope || 'all');
  C.pageSize = (view, sz, scope) => C.setPage(view, (pg) => { const s = TX.PAGE_SIZES.find((x) => x.id === sz); if (!s) return {}; const land = pg.orient === 'landscape'; return { size: s.id, w: land ? s.h : s.w, h: land ? s.w : s.h }; }, scope || 'all');
  C.margins = (view, m, scope) => C.setPage(view, { mt: m.t, mb: m.b, ml: m.l, mr: m.r }, scope || 'all');
  C.columns = (view, n, extra, scope) => C.setPage(view, (pg) => ({ cols: Object.assign({}, pg.cols, { n }, extra || {}) }), scope || 'section');

  /* ---------------- notes, commentaires ---------------- */
  C.footnote = function (view, end, text) {
    const id = TX.uid('n');
    const notes = Object.assign({}, attrsOf(view).notes || {});
    notes[id] = { doc: TX.B.part([TX.B.p(end ? 'NoteFin' : 'NoteBas', text || '')]) };
    const tr = view.state.tr; TX.setDocAttr(tr, view.state, 'notes', notes);
    tr.replaceSelectionWith(NT.fnref.create({ id, end: !!end }), false);
    run(view, tr, end ? 'Note de fin' : 'Note de bas de page');
    return id;
  };
  C.comment = function (view, text, author) {
    const state = view.state; let { from, to } = state.selection;
    if (from === to) { const w = wordAt(state.selection.$from); if (w) { from = w[0]; to = w[1]; } }
    if (from === to) { O.toast('Sélectionnez le texte à commenter', { bad: true }); return null; }
    const id = TX.uid('k'), comments = Object.assign({}, attrsOf(view).comments || {});
    comments[id] = { a: author || TX.userName() || 'Auteur', d: new Date().toISOString(), t: text || '', done: false };
    const tr = state.tr; TX.setDocAttr(tr, state, 'comments', comments); tr.addMark(from, to, MK.cmt.create({ id }));
    run(view, tr, 'Commentaire'); return id;
  };

  /* ---------------- tableaux ---------------- */
  C.insertTable = function (view, rows, cols, opt) {
    opt = opt || {};
    const cw = TX.contentWidthAt ? TX.contentWidthAt(view) : 450, w = Math.floor(cw * TX.PX / cols);
    const mk = (r) => NT.table_row.create({ hdr: !!(opt.hdr && r === 0) }, Array.from({ length: cols }, () => NT.table_cell.create({ colwidth: [w] }, NT.paragraph.create({ s: 'Normal', sa: 0, ln: 1 }))));
    const table = NT.table.create({ ts: opt.ts || 'Grille', look: { hdr: opt.hdr !== false, band: true, fc: false } }, Array.from({ length: rows }, (x, r) => mk(r)));
    const state = view.state, tr = state.tr, $f = state.selection.$from;
    // le tableau est inséré après le paragraphe courant (ou à sa place s'il est vide), suivi d'un paragraphe
    let at;
    if ($f.parent.type === NT.paragraph && !$f.parent.content.size) { at = $f.before(); tr.replaceWith(at, $f.after(), [table, NT.paragraph.create({ s: $f.parent.attrs.s })]); }
    else { at = $f.after(); tr.insert(at, table); }
    tr.setSelection(TextSelection.create(tr.doc, at + 4));
    return run(view, tr, 'Tableau');
  };
  const tcmd = (fn, label) => (view) => { fn(view.state, (tr) => view.dispatch(tr.setMeta('tx-label', label))); view.focus(); return true; };
  C.rowBefore = tcmd(TB.addRowBefore, 'Insérer une ligne'); C.rowAfter = tcmd(TB.addRowAfter, 'Insérer une ligne');
  C.colBefore = tcmd(TB.addColumnBefore, 'Insérer une colonne'); C.colAfter = tcmd(TB.addColumnAfter, 'Insérer une colonne');
  C.delRow = tcmd(TB.deleteRow, 'Supprimer la ligne'); C.delCol = tcmd(TB.deleteColumn, 'Supprimer la colonne'); C.delTable = tcmd(TB.deleteTable, 'Supprimer le tableau');
  C.merge = tcmd(TB.mergeCells, 'Fusionner'); C.split = tcmd(TB.splitCell, 'Fractionner');
  TX.addRowAtEnd = function (state, dispatch) { TB.addRowAfter(state, (tr) => { dispatch(tr); }); return true; };
  /** Table englobant la sélection : {node, pos, map} */
  C.tableAt = function (state) {
    const $f = state.selection.$from;
    for (let d = $f.depth; d > 0; d--) if ($f.node(d).type === NT.table) return { node: $f.node(d), pos: $f.before(d), start: $f.start(d), map: TB.TableMap.get($f.node(d)) };
    return null;
  };
  C.setTable = function (view, patch, label) { const t = C.tableAt(view.state); if (!t) return false; return run(view, view.state.tr.setNodeMarkup(t.pos, null, Object.assign({}, t.node.attrs, typeof patch === 'function' ? patch(t.node.attrs) : patch)), label || 'Tableau'); };
  /** Cellules sélectionnées (ou cellule du curseur) : [{node, pos}] */
  C.cells = function (state) {
    const out = [];
    if (state.selection instanceof TB.CellSelection) state.selection.forEachCell((n, pos) => out.push({ node: n, pos }));
    else { const $f = state.selection.$from; for (let d = $f.depth; d > 0; d--) { const n = $f.node(d); if (n.type === NT.table_cell || n.type === NT.table_header) { out.push({ node: n, pos: $f.before(d) }); break; } } }
    return out;
  };
  C.setCells = function (view, patch, label) {
    const tr = view.state.tr; C.cells(view.state).forEach(({ node, pos }) => tr.setNodeMarkup(pos, null, Object.assign({}, node.attrs, typeof patch === 'function' ? patch(node.attrs) : patch)));
    return run(view, tr, label || 'Cellules');
  };
  C.setRows = function (view, patch, label) {
    const state = view.state, tr = state.tr, seen = new Set();
    C.cells(state).forEach(({ pos }) => { const $p = state.doc.resolve(pos); const rp = $p.before($p.depth); if (seen.has(rp)) return; seen.add(rp); const row = state.doc.nodeAt(rp); tr.setNodeMarkup(rp, null, Object.assign({}, row.attrs, typeof patch === 'function' ? patch(row.attrs) : patch)); });
    return run(view, tr, label || 'Lignes');
  };
  /** Bordures des cellules sélectionnées : 'all'|'outside'|'inside'|'none'|'top'|'bottom'|'left'|'right' */
  C.cellBorders = function (view, which, b) {
    const state = view.state, t = C.tableAt(state); if (!t) return false;
    const cells = C.cells(state); if (!cells.length) return false;
    const rects = cells.map((c) => ({ c, r: t.map.findCell(c.pos - t.start) }));
    const minL = Math.min(...rects.map((x) => x.r.left)), maxR = Math.max(...rects.map((x) => x.r.right)), minT = Math.min(...rects.map((x) => x.r.top)), maxB = Math.max(...rects.map((x) => x.r.bottom));
    const line = Object.assign({ s: 'single', w: 0.5, c: '#000000' }, b || {}), none = { s: 'none' };
    const tr = state.tr;
    rects.forEach(({ c, r }) => {
      const bd = Object.assign({}, c.node.attrs.bd || {});
      const outer = { t: r.top === minT, b: r.bottom === maxB, l: r.left === minL, r: r.right === maxR };
      ['t', 'b', 'l', 'r'].forEach((k) => {
        if (which === 'all') bd[k] = line; else if (which === 'none') bd[k] = none;
        else if (which === 'outside') { if (outer[k]) bd[k] = line; }
        else if (which === 'inside') { if (!outer[k]) bd[k] = line; }
        else if ({ top: 't', bottom: 'b', left: 'l', right: 'r' }[which] === k && outer[k]) bd[k] = line;
      });
      tr.setNodeMarkup(c.pos, null, Object.assign({}, c.node.attrs, { bd }));
    });
    return run(view, tr, 'Bordures');
  };
  /** Largeurs de colonnes égales (sur la largeur actuelle du tableau) */
  C.distributeCols = function (view) {
    const t = C.tableAt(view.state); if (!t) return false;
    const total = (t.node.firstChild ? (() => { let s = 0; t.node.firstChild.forEach((c) => { (c.attrs.colwidth || [100]).forEach((w) => { s += w || 100; }); }); return s; })() : 600);
    const w = Math.floor(total / t.map.width), tr = view.state.tr;
    t.node.descendants((n, p) => { if (n.type === NT.table_cell || n.type === NT.table_header) { tr.setNodeMarkup(t.start + p, null, Object.assign({}, n.attrs, { colwidth: Array.from({ length: n.attrs.colspan }, () => w) })); return false; } return true; });
    return run(view, tr, 'Colonnes égales');
  };
  C.autofit = function (view, mode) {
    const t = C.tableAt(view.state); if (!t) return false;
    const cw = Math.floor((TX.contentWidthAt ? TX.contentWidthAt(view) : 450) * TX.PX);
    if (mode === 'window') { const w = Math.floor(cw / t.map.width), tr = view.state.tr; t.node.descendants((n, p) => { if (n.type === NT.table_cell || n.type === NT.table_header) { tr.setNodeMarkup(t.start + p, null, Object.assign({}, n.attrs, { colwidth: Array.from({ length: n.attrs.colspan }, () => w) })); return false; } return true; }); tr.setNodeMarkup(t.pos, null, Object.assign({}, t.node.attrs, { lay: 'fixed' })); return run(view, tr, 'Ajuster à la fenêtre'); }
    if (mode === 'content') { const tr = view.state.tr; t.node.descendants((n, p) => { if (n.type === NT.table_cell || n.type === NT.table_header) { tr.setNodeMarkup(t.start + p, null, Object.assign({}, n.attrs, { colwidth: null })); return false; } return true; }); tr.setNodeMarkup(t.pos, null, Object.assign({}, t.node.attrs, { lay: 'auto', w: null })); return run(view, tr, 'Ajuster au contenu'); }
    return C.setTable(view, { lay: 'fixed' });
  };
  /** Valeur numérique d'un texte (« 1 234,50 € » → 1234.5) */
  const numOf = (s) => { const t = String(s).replace(/[\s  €$%]/g, '').replace(/,(\d+)$/, '.$1'); const n = parseFloat(t); return isNaN(n) ? null : n; };
  TX.numOf = numOf;
  /** Trier les lignes du tableau (sans la ligne d'en-tête) selon une colonne */
  C.sortTable = function (view, col, desc, kind) {
    const t = C.tableAt(view.state); if (!t) return false;
    const rows = []; t.node.forEach((r) => rows.push(r));
    const head = rows.filter((r, i) => r.attrs.hdr && rows.slice(0, i).every((x) => x.attrs.hdr));
    const body = rows.slice(head.length);
    if (body.some((r) => { let bad = false; r.forEach((c) => { if (c.attrs.rowspan > 1) bad = true; }); return bad; })) { O.toast('Tri impossible : le tableau contient des cellules fusionnées verticalement', { bad: true }); return false; }
    const key = (r) => { let k = 0, txt = ''; r.forEach((c) => { if (k <= col && col < k + c.attrs.colspan) txt = c.textContent; k += c.attrs.colspan; }); return txt.trim(); };
    const cmp = (a, b) => { const x = key(a), y = key(b); if (kind === 'number' || (kind !== 'text' && numOf(x) != null && numOf(y) != null)) return (numOf(x) || 0) - (numOf(y) || 0); if (kind === 'date') return dateOf(x) - dateOf(y); return x.localeCompare(y, 'fr', { sensitivity: 'base', numeric: true }); };
    body.sort((a, b) => desc ? -cmp(a, b) : cmp(a, b));
    const tr = view.state.tr.replaceWith(t.pos + 1, t.pos + t.node.nodeSize - 1, Fragment.fromArray(head.concat(body)));
    return run(view, tr, 'Trier');
  };
  const dateOf = (s) => { const m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s); if (!m) return 0; return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]).getTime(); };
  /** Formule simple dans la cellule : =SOMME(AU-DESSUS|À GAUCHE|A1:B3), MOYENNE, MIN, MAX, PRODUIT, NB → texte du résultat */
  C.formula = function (view, expr) {
    const t = C.tableAt(view.state); if (!t) return false;
    const cells = C.cells(view.state); if (!cells.length) return false;
    const cur = t.map.findCell(cells[0].pos - t.start);
    const grid = []; for (let r = 0; r < t.map.height; r++) { grid.push([]); for (let c = 0; c < t.map.width; c++) { const off = t.map.map[r * t.map.width + c]; const n = t.node.nodeAt(off); grid[r].push(n ? n.textContent : ''); } }
    const val = TX.evalFormula(expr, grid, cur.top, cur.left);
    if (val == null) { O.toast('Formule non reconnue', { bad: true }); return false; }
    const txt = TX.fmtNumber(val);
    const cell = cells[0], tr = view.state.tr;
    tr.replaceWith(cell.pos + 1, cell.pos + cell.node.nodeSize - 1, NT.paragraph.create({ s: 'Normal', sa: 0, ln: 1, al: 'right' }, S.text(txt)));
    return run(view, tr, 'Formule');
  };
  TX.fmtNumber = (v) => (Math.round(v * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  TX.evalFormula = function (expr, grid, row, col) {
    expr = String(expr || '').trim().replace(/^=/, '').toUpperCase().replace(/\s+/g, ' ');
    const m = /^(SOMME|SUM|MOYENNE|AVERAGE|MIN|MAX|PRODUIT|PRODUCT|NB|COUNT)\((.*)\)$/.exec(expr);
    let vals = [];
    const range = (s) => {
      s = s.trim();
      if (/^(AU-DESSUS|ABOVE)$/.test(s)) { for (let r = row - 1; r >= 0; r--) { const v = numOf(grid[r][col]); if (v == null && vals.length) break; if (v != null) vals.push(v); } return true; }
      if (/^(EN DESSOUS|EN-DESSOUS|BELOW)$/.test(s)) { for (let r = row + 1; r < grid.length; r++) { const v = numOf(grid[r][col]); if (v != null) vals.push(v); } return true; }
      if (/^(À GAUCHE|A GAUCHE|LEFT)$/.test(s)) { for (let c = col - 1; c >= 0; c--) { const v = numOf(grid[row][c]); if (v == null && vals.length) break; if (v != null) vals.push(v); } return true; }
      if (/^(À DROITE|A DROITE|RIGHT)$/.test(s)) { for (let c = col + 1; c < grid[row].length; c++) { const v = numOf(grid[row][c]); if (v != null) vals.push(v); } return true; }
      const ref = (x) => { const k = /^([A-Z])(\d+)$/.exec(x); return k ? [+k[2] - 1, k[1].charCodeAt(0) - 65] : null; };
      const rr = /^([A-Z]\d+):([A-Z]\d+)$/.exec(s);
      if (rr) { const a = ref(rr[1]), b = ref(rr[2]); for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++) for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) { const v = numOf((grid[r] || [])[c]); if (v != null) vals.push(v); } return true; }
      const one = ref(s); if (one) { const v = numOf((grid[one[0]] || [])[one[1]]); if (v != null) vals.push(v); return true; }
      const n = numOf(s); if (n != null) { vals.push(n); return true; }
      return false;
    };
    if (!m) { const n = numOf(expr); return n; }
    if (!m[2].split(/[;,]/).every(range)) return null;
    const f = m[1];
    if (/SOMME|SUM/.test(f)) return vals.reduce((a, b) => a + b, 0);
    if (/MOYENNE|AVERAGE/.test(f)) return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    if (f === 'MIN') return vals.length ? Math.min(...vals) : 0;
    if (f === 'MAX') return vals.length ? Math.max(...vals) : 0;
    if (/PRODUIT|PRODUCT/.test(f)) return vals.reduce((a, b) => a * b, 1);
    return vals.length;
  };
  /** Convertir le tableau en texte (séparé par des tabulations) */
  C.tableToText = function (view) {
    const t = C.tableAt(view.state); if (!t) return false;
    const ps = []; t.node.forEach((row) => { const parts = []; row.forEach((c) => parts.push(c.textContent)); ps.push(NT.paragraph.create({ s: 'Normal' }, TX.B.inl(parts.join('\t')).map((x) => S.nodeFromJSON(x)))); });
    return run(view, view.state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, ps), 'Convertir en texte');
  };
  /** Convertir les paragraphes sélectionnés en tableau (séparateur : tabulation, point-virgule…) */
  C.textToTable = function (view, sep) {
    const ps = paras(view.state); if (!ps.length) return false;
    const rows = ps.map((p) => TX.textOf(p.node).split(sep || '\t'));
    const cols = Math.max(...rows.map((r) => r.length));
    const cw = Math.floor((TX.contentWidthAt ? TX.contentWidthAt(view) : 450) * TX.PX / cols);
    const table = NT.table.create({ ts: 'Grille', look: { hdr: true, band: true } }, rows.map((r, i) => NT.table_row.create({ hdr: i === 0 }, Array.from({ length: cols }, (x, k) => NT.table_cell.create({ colwidth: [cw] }, NT.paragraph.create({ s: 'Normal', sa: 0, ln: 1 }, r[k] ? S.text(r[k]) : null))))));
    const a = ps[0].pos, b = ps[ps.length - 1].pos + ps[ps.length - 1].node.nodeSize;
    return run(view, view.state.tr.replaceWith(a, b, table), 'Convertir en tableau');
  };

  /* ---------------- reproduire la mise en forme ---------------- */
  C.captureFormat = function (view) {
    const st = TX.fmtState(view.state, attrsOf(view));
    return { marks: st.marks.filter((m) => !/^(link|cmt|ins|del)$/.test(m.type.name)).map((m) => m.toJSON()), para: st.par ? { s: st.par.attrs.s, al: st.par.attrs.al, il: st.par.attrs.il, ir: st.par.attrs.ir, fi: st.par.attrs.fi, sb: st.par.attrs.sb, sa: st.par.attrs.sa, ln: st.par.attrs.ln, lr: st.par.attrs.lr, bd: st.par.attrs.bd, sh: st.par.attrs.sh, li: st.par.attrs.li } : null };
  };
  C.pasteFormat = function (view, f) {
    const state = view.state, tr = state.tr; const keep = new Set(['link', 'cmt', 'ins', 'del']);
    let { from, to } = state.selection;
    if (from === to) { const w = wordAt(state.selection.$from); if (w) { from = w[0]; to = w[1]; } }
    if (from < to) { Object.values(MK).forEach((m) => { if (!keep.has(m.name)) tr.removeMark(from, to, m); }); f.marks.forEach((j) => tr.addMark(from, to, S.markFromJSON(j))); }
    // une sélection de paragraphe(s) entier(s) ou un simple clic dans un paragraphe reçoit aussi la mise en forme du paragraphe
    if (f.para && (state.selection.empty || state.selection.$from.parentOffset === 0)) paras(state).forEach(({ node, pos }) => tr.setNodeMarkup(pos, null, Object.assign({}, node.attrs, f.para)));
    return run(view, tr, 'Reproduire la mise en forme');
  };

  /* ---------------- divers ---------------- */
  /** Statistiques : mots, caractères (avec / sans espaces), paragraphes, lignes (approximatives) */
  TX.stats = function (doc, range) {
    let text = '', paras = 0;
    const from = range ? range[0] : 0, to = range ? range[1] : doc.content.size;
    doc.nodesBetween(from, to, (n, pos) => {
      if (n.type === NT.paragraph) { const t = TX.textOf(n); if (t.trim()) paras++; text += (range ? doc.textBetween(Math.max(from, pos), Math.min(to, pos + n.nodeSize), '\n', ' ') : t) + '\n'; return false; }
      return true;
    });
    // le texte supprimé (suivi des modifications) ne compte pas
    let del = ''; doc.nodesBetween(from, to, (n) => { if (n.isText && n.marks.some((m) => m.type === MK.del)) del += n.text + ' '; return true; });
    const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}’'\-.,]*/gu) || []).length - (del.match(/[\p{L}\p{N}][\p{L}\p{N}’'\-.,]*/gu) || []).length;
    const chars = text.replace(/\n/g, '').length - del.trim().length;
    return { words: Math.max(0, words), chars, charsNoSpace: text.replace(/\s/g, '').length - del.replace(/\s/g, '').length, paras };
  };
  /** Parcourt toutes les vues (document, en-têtes, notes) pour remplacer… (réservé au document principal) */
  TX.replaceAll = function (view, q, repl) {
    const matches = TX.search(view.state.doc, q); if (!matches.length) return 0;
    const tr = view.state.tr;
    matches.slice().reverse().forEach((m) => {
      let r = repl; if (q.regex) r = repl.replace(/\$(\d)/g, (x, d) => m.groups[+d - 1] || '');
      const $a = view.state.doc.resolve(m.from), marks = $a.marksAcross(view.state.doc.resolve(m.to)) || $a.marks();
      if (r) tr.replaceWith(m.from, m.to, S.text(r, q.replFmt ? marksWith(marks, q.replFmt) : marks)); else tr.delete(m.from, m.to);
    });
    run(view, tr, 'Remplacer tout');
    return matches.length;
  };
  function marksWith(marks, f) {
    let ms = marks.slice();
    const set = (name, attrs) => { ms = MK[name].removeFromSet(ms); if (attrs) ms = MK[name].create(attrs).addToSet(ms); };
    if (f.b) set('b', {}); if (f.i) set('i', {}); if (f.u) set('u', { s: 'single' }); if (f.hl) set('hl', { c: f.hl }); if (f.color) set('color', { c: f.color });
    return ms;
  }
  TX.marksWith = marksWith;
})();
