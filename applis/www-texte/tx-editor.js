/* Texte — éditeur : greffons ProseMirror (numérotation des listes, légendes et notes, suivi des modifications,
   recherche, marques de mise en forme ¶, décorations de pagination), raccourcis clavier, correction automatique,
   et la classe TX.Editor (document principal, en-têtes / pieds, notes). */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, PM = window.PM;
  const { Plugin, PluginKey, TextSelection, NodeSelection, Selection } = PM.state;
  const { Decoration, DecorationSet, EditorView } = PM.view;
  const { Fragment, Slice } = PM.model;
  const { ReplaceStep, Mapping } = PM.transform;
  const schema = TX.schema, NT = schema.nodes, MK = schema.marks;

  /* ================= numérotation : listes, notes, légendes, titres ================= */
  const numKey = new PluginKey('tx-num');
  TX.numKey = numKey;
  /** Calcul en un parcours : étiquettes de liste, numéros de notes et de légendes, titres (plan, sommaire) */
  function computeNumbers(doc, attrs) {
    const lists = attrs.lists || {}, styles = attrs.styles || {};
    const counters = {}, labels = [], notes = { foot: {}, end: {} }, seq = {}, seqPos = {}, heads = [], specials = [];
    let fnN = 0, enN = 0;
    const resolved = {};
    const styleList = (s) => { if (!(s in resolved)) resolved[s] = (TX.resolveStyle(styles, s).p || {}).li || null; return resolved[s]; };
    doc.descendants((node, pos) => {
      const t = node.type.name;
      if (t === 'paragraph') {
        const li = node.attrs.li || styleList(node.attrs.s);
        if (li && li.id && lists[li.id]) {
          const def = lists[li.id], l = Math.max(0, Math.min(8, li.l || 0));
          const c = counters[li.id] || (counters[li.id] = []);
          if (node.attrs.ls != null) { c[l] = node.attrs.ls; } else c[l] = (c[l] == null ? ((def.lv[l] || {}).st || 1) : c[l] + 1);
          for (let k = l + 1; k < 9; k++) c[k] = null;
          for (let k = 0; k < l; k++) if (c[k] == null) c[k] = (def.lv[k] || {}).st || 1;
          const L = def.lv[l] || def.lv[0];
          labels.push({ pos, label: TX.listLabel(def, l, c), il: L.il, hg: L.hg, bullet: L.f === 'bullet', font: L.font || null, color: L.c || null, l, tab: L.tab });
        }
        const lvl = TX.outlineLevel(styles, node);
        if (lvl > 0 && lvl < 10) heads.push({ pos, level: lvl, text: TX.textOf(node).replace(/\s+/g, ' ').trim(), pid: node.attrs.pid, label: labels.length && labels[labels.length - 1].pos === pos ? labels[labels.length - 1].label : '' });
        if (node.attrs.s === 'Legende') specials.push({ pos, node });
        return true;
      }
      if (t === 'fnref') { if (node.attrs.end) notes.end[node.attrs.id] = ++enN; else notes.foot[node.attrs.id] = ++fnN; return false; }
      if (t === 'field' && node.attrs.f === 'seq') { const nm = node.attrs.name || 'Figure'; seq[nm] = (seq[nm] || 0) + 1; seqPos[pos] = seq[nm]; return false; }
      return true;
    });
    // légendes : texte complet et numéro (table des illustrations, renvois)
    const captions = specials.map((sp) => { let label = '', n = 0, text = ''; sp.node.descendants((c, p) => { if (c.type.name === 'field' && c.attrs.f === 'seq') { label = c.attrs.name || 'Figure'; n = seqPos[sp.pos + 1 + p] || 0; text += String(n); } else if (c.isText) text += c.text; else if (c.type.name === 'tab' || c.type.name === 'hard_break') text += ' '; return true; }); return { pos: sp.pos, label, n, text: text.replace(/\s+/g, ' ').trim(), pid: sp.node.attrs.pid }; });
    return { labels, notes, seqPos, heads, captions, sig: JSON.stringify([labels.map((l) => l.label), notes, seqPos]) };
  }
  TX.computeNumbers = computeNumbers;
  function numPlugin(getAttrs) {
    return new Plugin({
      key: numKey,
      state: {
        init: (cfg, state) => { const n = computeNumbers(state.doc, getAttrs(state)); n.v = 0; n.deco = numDecos(state.doc, n, getAttrs(state)); return n; },
        apply: (tr, prev, old, state) => {
          const refresh = tr.getMeta('tx-refresh');
          if (!tr.docChanged && !refresh) return prev;
          const n = computeNumbers(state.doc, getAttrs(state));
          n.v = prev.v + ((n.sig !== prev.sig || refresh || tr.docChanged) ? 1 : 0);
          n.deco = numDecos(state.doc, n, getAttrs(state));
          return n;
        }
      },
      props: { decorations: (state) => numKey.getState(state).deco }
    });
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  function numDecos(doc, n, attrs) {
    const d = [];
    n.labels.forEach((l) => {
      const node = doc.nodeAt(l.pos); if (!node) return;
      const il = node.attrs.il != null ? node.attrs.il : l.il, fi = node.attrs.fi != null ? node.attrs.fi : -l.hg;
      d.push(Decoration.node(l.pos, l.pos + node.nodeSize, { class: 'tx-li', style: 'margin-left:' + r2(il) + 'pt;text-indent:' + r2(fi) + 'pt;--hang:' + r2(Math.max(0, -fi)) + 'pt' }));
      d.push(Decoration.widget(l.pos + 1, () => { const s = document.createElement('span'); s.className = 'tx-lbl' + (l.bullet ? ' bul' : '') + (l.tab || fi >= 0 ? ' tab' : ''); s.textContent = l.label; s.setAttribute('contenteditable', 'false'); s.setAttribute('aria-hidden', 'true'); if (l.font) s.style.fontFamily = TX.fontCss(l.font); if (l.color) s.style.color = TX.color(l.color); return s; }, { side: -1, key: 'lbl' + l.label + '|' + l.bullet + '|' + (l.tab ? 1 : 0) + '|' + fi, ignoreSelection: true, marks: [] }));
    });
    n.heads.forEach((h) => { const node = doc.nodeAt(h.pos); if (node) d.push(Decoration.node(h.pos, h.pos + node.nodeSize, { 'data-lvl': String(h.level) })); });
    // champs, notes, tables des matières : redessinés quand une numérotation ou un réglage change
    doc.descendants((node, pos) => {
      const t = node.type.name;
      if (t === 'field' || t === 'fnref' || t === 'toc' || t === 'math' || (t === 'drawing' && node.attrs.kind !== 'shape')) d.push(Decoration.node(pos, pos + node.nodeSize, { 'data-v': String(n.v) }));
      return t !== 'paragraph' || node.childCount > 0;
    });
    // paragraphes à bordures voisins identiques : une seule boîte
    let prev = null;
    doc.descendants((node, pos) => {
      if (node.type.name === 'section' || node.type.name === 'table' || node.type.name === 'table_row' || /table_(cell|header)/.test(node.type.name)) { prev = null; return true; }
      if (node.type.name !== 'paragraph') { prev = null; return false; }
      const key = node.attrs.bd || node.attrs.sh ? JSON.stringify([node.attrs.bd, node.attrs.sh, node.attrs.il, node.attrs.ir]) : null;
      if (key && prev && prev.key === key && prev.end === pos) { prev.mid = true; d.push(Decoration.node(prev.pos, prev.end, { class: 'tx-bdn' })); d.push(Decoration.node(pos, pos + node.nodeSize, { class: 'tx-bdp' })); }
      prev = key ? { key, pos, end: pos + node.nodeSize } : null;
      return false;
    });
    // espacement contextuel : pas d'espace entre deux paragraphes du même style
    const styles = (attrs && attrs.styles) || {}, ctxOf = {};
    let pc = null;
    doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') { pc = null; return node.type.name !== 'table' || true; }
      const s = node.attrs.s; if (!(s in ctxOf)) ctxOf[s] = !!(TX.resolveStyle(styles, s).p || {}).ctx;
      const c = node.attrs.ctx != null ? !!node.attrs.ctx : ctxOf[s];
      if (c && pc && pc.s === s && pc.end === pos) { d.push(Decoration.node(pc.pos, pc.end, { class: 'tx-ctxa' })); d.push(Decoration.node(pos, pos + node.nodeSize, { class: 'tx-ctxb' })); }
      pc = c ? { s, pos, end: pos + node.nodeSize } : null;
      return false;
    });
    return DecorationSet.create(doc, d);
  }

  /* ================= suivi des modifications ================= */
  const trackKey = new PluginKey('tx-track');
  TX.trackKey = trackKey;
  TX.userName = () => { try { return localStorage.getItem('texte:auteur') || ''; } catch (e) { return ''; } };
  function trackPlugin(getOn) {
    return new Plugin({
      key: trackKey,
      appendTransaction(trs, oldState, newState) {
        if (!getOn(newState)) return null;
        const user = TX.userName() || 'Auteur', date = new Date().toISOString().slice(0, 19) + 'Z';
        const out = newState.tr; let touched = false, backspace = null;
        trs.forEach((t, k) => {
          if (!t.docChanged || t.getMeta('notrack') || t.getMeta('history$') || t.getMeta('tx-layout') || t.getMeta('appendedTransaction') && t.getMeta('notrack')) return;
          const after = new Mapping(); for (let j = k + 1; j < trs.length; j++) after.appendMapping(trs[j].mapping);
          for (let i = t.steps.length - 1; i >= 0; i--) {
            const step = t.steps[i];
            if (!(step instanceof ReplaceStep)) continue;
            const before = t.docs[i], from = step.from, to = step.to, slice = step.slice;
            const m = t.mapping.slice(i + 1);
            const fin = (p, a) => out.mapping.map(after.map(m.map(p, a), a), a);
            const a0 = fin(from, -1), a1 = fin(from + slice.size, 1);
            if (slice.size && a1 > a0) {
              const near = neighborMark(out.doc, a0, MK.ins, user);
              const mark = MK.ins.create(near || { id: TX.uid('c'), a: user, d: date });
              out.removeMark(a0, a1, MK.del); out.addMark(a0, a1, mark); touched = true;
            }
            if (to > from) {
              const near = neighborMark(before, from, MK.del, user) || neighborMark(before, to, MK.del, user, true);
              const dm = MK.del.create(near || { id: TX.uid('c'), a: user, d: date });
              const kept = keepDeleted(before.slice(from, to), dm, user);
              if (kept && kept.content.size) {
                const at = fin(from, -1);
                out.replace(at, at, kept); touched = true;
                if (trs.length === 1 && t.steps.length === 1 && !slice.size && oldState.selection.empty) backspace = oldState.selection.head === to ? { at, size: kept.size } : { at: at + kept.size, size: 0 };
              }
            }
          }
        });
        if (!touched) return null;
        try {
          if (backspace) out.setSelection(TextSelection.create(out.doc, Math.min(out.doc.content.size, backspace.at)));
        } catch (e) { }
        return out.setMeta('notrack', true).setMeta('addToHistory', true);
      }
    });
  }
  function neighborMark(doc, pos, type, user, after) {
    try {
      const $p = doc.resolve(pos); const n = after ? $p.nodeAfter : $p.nodeBefore;
      const mk = n && n.marks.find((x) => x.type === type && x.attrs.a === user);
      return mk ? mk.attrs : null;
    } catch (e) { return null; }
  }
  /** Contenu supprimé gardé (marqué « supprimé ») ; les insertions de l'auteur lui-même sont vraiment supprimées */
  function keepDeleted(slice, dm, user) {
    function walk(frag) {
      const out = [];
      frag.forEach((n) => {
        if (n.isInline) {
          if (n.marks.some((x) => x.type === MK.ins && x.attrs.a === user)) return;
          if (n.marks.some((x) => x.type === MK.del)) { out.push(n); return; }
          out.push(n.mark(dm.addToSet(n.marks.filter((x) => x.type !== MK.ins))));
        } else out.push(n.copy(walk(n.content)));
      });
      return Fragment.fromArray(out);
    }
    try { return new Slice(walk(slice.content), slice.openStart, slice.openEnd); } catch (e) { return null; }
  }
  /** Révisions du document : [{id, kind:'ins'|'del', a, d, from, to, text}] (plages contiguës regroupées) */
  TX.revisions = function (doc) {
    const out = []; let cur = null;
    doc.descendants((n, pos) => {
      if (!n.isInline) { cur = null; return true; }
      const mk = n.marks.find((x) => x.type === MK.ins || x.type === MK.del);
      if (!mk) { cur = null; return false; }
      const kind = mk.type === MK.ins ? 'ins' : 'del';
      if (cur && cur.id === mk.attrs.id && cur.kind === kind && cur.to === pos) { cur.to = pos + n.nodeSize; cur.text += n.isText ? n.text : '◻'; }
      else { cur = { id: mk.attrs.id, kind, a: mk.attrs.a, d: mk.attrs.d, from: pos, to: pos + n.nodeSize, text: n.isText ? n.text : '◻' }; out.push(cur); }
      return false;
    });
    return out;
  };
  /** Accepter / refuser : liste de révisions → transaction */
  TX.resolveRevisions = function (state, revs, accept) {
    const tr = state.tr;
    revs.slice().sort((a, b) => b.from - a.from).forEach((r) => {
      const from = tr.mapping.map(r.from), to = tr.mapping.map(r.to);
      const remove = (r.kind === 'ins') !== accept;
      if (remove) tr.delete(from, to);
      else tr.removeMark(from, to, r.kind === 'ins' ? MK.ins : MK.del);
    });
    return tr.setMeta('notrack', true);
  };

  /* ================= recherche ================= */
  const findKey = new PluginKey('tx-find');
  TX.findKey = findKey;
  function findPlugin() {
    return new Plugin({
      key: findKey,
      state: {
        init: () => ({ q: null, matches: [], cur: -1, deco: DecorationSet.empty }),
        apply(tr, prev, old, state) {
          const m = tr.getMeta(findKey);
          if (m) {
            if (m.clear) return { q: null, matches: [], cur: -1, deco: DecorationSet.empty };
            const q = m.q || prev.q; const matches = q ? TX.search(state.doc, q) : [];
            let cur = m.cur != null ? m.cur : Math.min(prev.cur, matches.length - 1);
            if (m.near != null) { cur = matches.findIndex((x) => x.from >= m.near); if (cur < 0) cur = matches.length ? 0 : -1; }
            return { q, matches, cur, deco: findDeco(state.doc, matches, cur) };
          }
          if (tr.docChanged && prev.q) { const matches = TX.search(state.doc, prev.q); const cur = Math.min(prev.cur, matches.length - 1); return { q: prev.q, matches, cur, deco: findDeco(state.doc, matches, cur) }; }
          return prev;
        }
      },
      props: { decorations: (s) => findKey.getState(s).deco }
    });
  }
  function findDeco(doc, matches, cur) { return DecorationSet.create(doc, matches.slice(0, 5000).map((x, i) => Decoration.inline(x.from, x.to, { class: i === cur ? 'tx-find cur' : 'tx-find' }))); }
  /** Recherche : q = {text, regex, cs (casse), whole (mot entier), fmt:{b,i,u,s:style,hl}} → [{from, to, text}] */
  TX.search = function (doc, q) {
    if (!q || (!q.text && !q.fmt)) return [];
    let re;
    try {
      const src = q.regex ? q.text : String(q.text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pat = q.whole ? '(?<![\\p{L}\\p{N}_])(?:' + (src || '.+?') + ')(?![\\p{L}\\p{N}_])' : (src || '[^\\uFFFC]+');
      re = new RegExp(pat, 'gu' + (q.cs ? '' : 'i'));
    } catch (e) { return []; }
    const out = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      if (q.fmt && q.fmt.style && node.attrs.s !== q.fmt.style) return false;
      let text = ''; const map = [];
      node.forEach((ch, off) => { const s = ch.isText ? ch.text : ch.type.name === 'tab' ? '\t' : ch.type.name === 'hard_break' ? '\n' : '￼'; for (let i = 0; i < s.length; i++) map.push(pos + 1 + off + (ch.isText ? i : 0)); text += s; });
      map.push(pos + 1 + node.content.size);
      re.lastIndex = 0; let m;
      while ((m = re.exec(text))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        const from = map[m.index], to = m.index + m[0].length < map.length ? map[m.index + m[0].length - 1] + 1 : map[map.length - 1];
        if (q.fmt && !fmtOk(doc, from, to, q.fmt)) continue;
        out.push({ from, to, text: m[0], groups: m.slice(1) });
      }
      return false;
    });
    return out;
  };
  function fmtOk(doc, from, to, f) {
    let ok = true;
    doc.nodesBetween(from, to, (n) => {
      if (!n.isText) return true;
      const has = (t) => n.marks.some((x) => x.type.name === t);
      if (f.b && !has('b')) ok = false; if (f.i && !has('i')) ok = false; if (f.u && !has('u')) ok = false; if (f.hl && !has('hl')) ok = false; if (f.s && !has('s')) ok = false;
      if (f.color && !n.marks.some((x) => x.type.name === 'color' && String(x.attrs.c).toUpperCase() === f.color.toUpperCase())) ok = false;
      return false;
    });
    return ok;
  }

  /* ================= marques ¶, espaces, texte masqué ================= */
  const marksKey = new PluginKey('tx-marks');
  TX.marksKey = marksKey;
  function marksPlugin() {
    return new Plugin({
      key: marksKey,
      state: { init: () => ({ on: false }), apply: (tr, v) => { const m = tr.getMeta(marksKey); return m ? Object.assign({}, v, m) : v; } },
      props: {
        decorations(state) {
          const on = marksKey.getState(state).on;
          const d = [];
          const doc = state.doc;
          // document vide : texte d'invite
          if (doc.childCount === 1 && doc.firstChild.childCount === 1 && doc.firstChild.firstChild.type === NT.paragraph && !doc.firstChild.firstChild.content.size && this._ph !== false) d.push(Decoration.node(1, 1 + doc.firstChild.firstChild.nodeSize, { class: 'tx-empty', 'data-ph': TX.placeholder || '' }));
          if (!on) return d.length ? DecorationSet.create(doc, d) : null;
          doc.descendants((node, pos) => {
            if (node.type === NT.paragraph) { d.push(Decoration.widget(pos + node.nodeSize - 1, () => O.h('span', { cls: 'tx-pil', contenteditable: 'false', 'aria-hidden': 'true' }, '¶'), { side: 1, marks: [], ignoreSelection: true, key: 'pil' })); return true; }
            if (node.isText) { const t = node.text; for (let i = 0; i < t.length; i++) { if (t[i] === ' ') d.push(Decoration.inline(pos + i, pos + i + 1, { class: 'tx-spc' })); else if (t[i] === ' ' || t[i] === ' ') d.push(Decoration.inline(pos + i, pos + i + 1, { class: 'tx-nbsp' })); } return false; }
            if (node.type === NT.section && pos + node.nodeSize < doc.content.size) d.push(Decoration.widget(pos + node.nodeSize - 1, () => O.h('div', { cls: 'tx-sbrk', contenteditable: 'false' }, 'Saut de section'), { side: 1, key: 'sbrk' }));
            return true;
          });
          return DecorationSet.create(doc, d);
        },
        attributes: (state) => (marksKey.getState(state).on ? { class: 'tx-marks' } : {})
      }
    });
  }

  /* ================= décorations de pagination (posées par la mise en page) ================= */
  const layoutKey = new PluginKey('tx-layout');
  TX.layoutKey = layoutKey;
  function layoutPlugin() {
    return new Plugin({
      key: layoutKey,
      state: { init: () => DecorationSet.empty, apply: (tr, set) => { const m = tr.getMeta(layoutKey); if (m) return m; return tr.docChanged ? set.map(tr.mapping, tr.doc) : set; } },
      props: { decorations: (s) => layoutKey.getState(s) }
    });
  }

  /* ================= commentaires : commentaire actif ================= */
  const cmtKey = new PluginKey('tx-cmt');
  TX.cmtKey = cmtKey;
  function cmtPlugin() {
    return new Plugin({
      key: cmtKey,
      state: { init: () => ({ active: null }), apply: (tr, v) => { const m = tr.getMeta(cmtKey); return m ? Object.assign({}, v, m) : v; } },
      props: {
        decorations(state) {
          const a = cmtKey.getState(state).active; if (!a) return null;
          const d = []; state.doc.descendants((n, pos) => { if (n.isInline && n.marks.some((m) => m.type === MK.cmt && m.attrs.id === a)) d.push(Decoration.inline(pos, pos + n.nodeSize, { class: 'tx-cmt-on' })); return true; });
          return DecorationSet.create(state.doc, d);
        }
      }
    });
  }

  /* ================= correction automatique (comme un traitement de texte français) ================= */
  const IR = PM.inputrules;
  function autoRules(getAuto) {
    const NB = ' ';
    const when = (fn) => (state, match, start, end) => (getAuto() ? fn(state, match, start, end) : null);
    const rules = [
      new IR.InputRule(/(^|[\s(\[{«])"$/, when((s, m, a, b) => s.tr.insertText(m[1] + '« ', a, b))),
      new IR.InputRule(/"$/, when((s, m, a, b) => { const prev = s.doc.textBetween(Math.max(0, a - 1), a); return s.tr.insertText((prev === ' ' || prev === ' ' ? '' : ' ') + '»', a, b); })),
      new IR.InputRule(/(\w)'$/u, when((s, m, a, b) => s.tr.insertText(m[1] + '’', a, b))),
      new IR.InputRule(/--$/, when((s, m, a, b) => s.tr.insertText('–', a, b))),
      new IR.InputRule(/–-$/, when((s, m, a, b) => s.tr.insertText('—', a, b))),
      new IR.InputRule(/\.\.\.$/, when((s, m, a, b) => s.tr.insertText('…', a, b))),
      new IR.InputRule(/\(c\)$/i, when((s, m, a, b) => s.tr.insertText('©', a, b))),
      new IR.InputRule(/\(r\)$/i, when((s, m, a, b) => s.tr.insertText('®', a, b))),
      new IR.InputRule(/\(tm\)$/i, when((s, m, a, b) => s.tr.insertText('™', a, b))),
      new IR.InputRule(/->$/, when((s, m, a, b) => s.tr.insertText('→', a, b))),
      new IR.InputRule(/<-$/, when((s, m, a, b) => s.tr.insertText('←', a, b))),
      new IR.InputRule(/=>$/, when((s, m, a, b) => s.tr.insertText('⇒', a, b))),
      new IR.InputRule(/(\d)\s?(e|er|ère)\s$/, when(() => null)),
      // ponctuation double : espace fine insécable avant ; ! ? et insécable avant :
      new IR.InputRule(/([\p{L}\p{N}»)])\s?([;!?])$/u, when((s, m, a, b) => s.tr.insertText(m[1] + NB + m[2], a, b))),
      new IR.InputRule(/([\p{L}»)])\s?(:)$/u, when((s, m, a, b) => { const tx = s.doc.textBetween(Math.max(0, a - 7), a); if (/(https?|ftp|mailto|\d)$/i.test(tx + m[1])) return null; return s.tr.insertText(m[1] + ' :', a, b); })),
      // listes automatiques : « - » ou « * » puis espace → puces ; « 1. » ou « 1) » → numéros
      new IR.InputRule(/^[-*•]\s$/, when((s, m, a, b) => { const $a = s.doc.resolve(a); if ($a.parent.type !== NT.paragraph || $a.parent.attrs.li) return null; return TX.cmdListTr && TX.cmdListTr(s, 'puces', s.tr.delete(a, b)); })),
      new IR.InputRule(/^(1|a|A|i|I)[.)]\s$/, when((s, m, a, b) => { const $a = s.doc.resolve(a); if ($a.parent.type !== NT.paragraph || $a.parent.attrs.li) return null; const k = { 1: m[0][1] === ')' ? 'numPar' : 'num', a: 'alphaMin', A: 'alpha', i: 'num', I: 'romain' }[m[1]]; return TX.cmdListTr && TX.cmdListTr(s, k, s.tr.delete(a, b)); }))
    ];
    return IR.inputRules({ rules });
  }

  /* ================= clavier ================= */
  const C = PM.commands, H = PM.history, TB = PM.tables;
  /** Entrée : nouveau paragraphe avec le style « suivant », liste poursuivie ou terminée (paragraphe vide) */
  function splitPara(state, dispatch) {
    const { $from, $to } = state.selection;
    if (state.selection instanceof NodeSelection) return false;
    const par = $from.parent; if (par.type !== NT.paragraph) return false;
    if (par.attrs.li && !par.content.size && $from.sameParent($to)) { if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), null, Object.assign({}, par.attrs, { li: null, ls: null, il: null, fi: null }))); return true; }
    const atEnd = $to.parentOffset === par.content.size;
    const styles = (TX.attrsOf(state) || {}).styles || {};
    const nx = atEnd ? ((styles[par.attrs.s] || {}).nx || par.attrs.s) : par.attrs.s;
    const keepList = !!par.attrs.li && (atEnd ? nx === par.attrs.s || !styles[nx] || !(styles[nx].lvl) : true);
    const na = Object.assign({}, par.attrs, { s: nx, pid: null, dc: null, pb: null, ls: null, li: keepList ? par.attrs.li : null });
    if (atEnd && nx !== par.attrs.s) { ['al', 'il', 'ir', 'fi', 'sb', 'sa', 'ln', 'lr', 'kn', 'kl', 'bd', 'sh', 'ol', 'tabs'].forEach((k) => { na[k] = null; }); }
    if (dispatch) {
      const tr = state.tr; if (!state.selection.empty) tr.deleteSelection();
      const pos = tr.selection.from;
      tr.split(pos, 1, [{ type: NT.paragraph, attrs: na }]);
      // marques stockées : on continue avec la mise en forme du texte qui précède
      const marks = state.storedMarks || ($from.parentOffset ? $from.marks() : null);
      if (marks) tr.ensureMarks(marks.filter((m) => m.type !== MK.link && m.type !== MK.cmt));
      dispatch(tr.scrollIntoView());
    }
    return true;
  }
  function listIndent(dir) {
    return (state, dispatch) => {
      const { $from, $to } = state.selection;
      const pars = []; state.doc.nodesBetween($from.pos, $to.pos, (n, pos) => { if (n.type === NT.paragraph) { pars.push([n, pos]); return false; } return true; });
      if (!pars.length || !pars.every((p) => p[0].attrs.li)) return false;
      // Tab au milieu d'un paragraphe de liste (pas au début) : simple tabulation
      if (dir > 0 && state.selection.empty && $from.parentOffset > 0) return false;
      if (dispatch) { const tr = state.tr; pars.forEach(([n, pos]) => { const l = Math.max(0, Math.min(8, (n.attrs.li.l || 0) + dir)); tr.setNodeMarkup(pos, null, Object.assign({}, n.attrs, { li: Object.assign({}, n.attrs.li, { l }), il: null, fi: null })); }); dispatch(tr); }
      return true;
    };
  }
  function backspaceList(state, dispatch) {
    const { $from, empty } = state.selection;
    if (!empty || $from.parentOffset !== 0 || $from.parent.type !== NT.paragraph) return false;
    const p = $from.parent;
    if (p.attrs.li) { if (dispatch) dispatch(state.tr.setNodeMarkup($from.before(), null, Object.assign({}, p.attrs, { li: null, ls: null, il: p.attrs.il, fi: null }))); return true; }
    // au début d'une section (sauf la première) : la section rejoint la précédente (suppression du saut de section)
    const sec = $from.node(1), idx = $from.index(0);
    if (idx > 0 && $from.index(1) === 0 && sec.type === NT.section) {
      if (dispatch) { const before = $from.before(1); dispatch(state.tr.join(before)); }
      return true;
    }
    return false;
  }
  function insertNode(type, attrs) { return (state, dispatch) => { if (dispatch) dispatch(state.tr.replaceSelectionWith(type.create(attrs || null)).scrollIntoView()); return true; }; }
  function insertBlockAfterPara(type) {
    return (state, dispatch) => {
      if (!dispatch) return true;
      const tr = state.tr; if (!state.selection.empty) tr.deleteSelection();
      const $p = tr.selection.$from; if ($p.parent.type !== NT.paragraph) return false;
      // coupe le paragraphe et place le saut entre les deux moitiés
      const pos = $p.pos; tr.split(pos);
      const at = tr.mapping.map(pos, -1) + 1; tr.insert(at, type.create());
      tr.setSelection(TextSelection.create(tr.doc, Math.min(tr.doc.content.size, at + 2)));
      dispatch(tr.scrollIntoView()); return true;
    };
  }
  TX.cmdPageBreak = insertBlockAfterPara(NT.page_break);
  TX.cmdColBreak = insertBlockAfterPara(NT.col_break);
  function tabCmd(state, dispatch) {
    if (TB.isInTable(state)) return TB.goToNextCell(1)(state, dispatch) || (dispatch && TX.addRowAtEnd && TX.addRowAtEnd(state, dispatch));
    if (listIndent(1)(state, dispatch)) return true;
    return insertNode(NT.tab)(state, dispatch);
  }
  function shiftTabCmd(state, dispatch) { if (TB.isInTable(state)) return TB.goToNextCell(-1)(state, dispatch); return listIndent(-1)(state, dispatch); }
  /** Sélection d'un mot entier, d'une phrase… (Ctrl+clic) laissée au navigateur ; Ctrl+A : tout le document */
  function keymapFor(ed) {
    const undo = (s, d) => H.undo(s, d && ((tr) => d(tr.setMeta('notrack', true))));
    const redo = (s, d) => H.redo(s, d && ((tr) => d(tr.setMeta('notrack', true))));
    const k = {
      Enter: C.chainCommands(splitPara, C.newlineInCode, C.createParagraphNear, C.liftEmptyBlock, C.splitBlock),
      'Shift-Enter': insertNode(NT.hard_break),
      'Mod-Enter': (s, d) => ed.kind === 'main' ? TX.cmdPageBreak(s, d) : false,
      'Mod-Shift-Enter': (s, d) => ed.kind === 'main' ? TX.cmdColBreak(s, d) : false,
      Backspace: C.chainCommands(backspaceList, C.deleteSelection, C.joinBackward, C.selectNodeBackward),
      'Mod-Backspace': C.chainCommands(C.deleteSelection, C.joinBackward, C.selectNodeBackward),
      Delete: C.chainCommands(C.deleteSelection, C.joinForward, C.selectNodeForward),
      Tab: tabCmd, 'Shift-Tab': shiftTabCmd,
      'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo,
      'Mod-a': C.selectAll,
      'Ctrl-Shift-Space': insertText(' '), 'Mod-Shift-Space': insertText(' '), 'Mod-Shift--': insertText('‑'), 'Mod--': insertText('­')
    };
    return PM.keymap.keymap(k);
  }
  function insertText(t) { return (s, d) => { if (d) d(s.tr.insertText(t).scrollIntoView()); return true; }; }
  TX.attrsOf = (state) => state.doc.attrs && state.doc.attrs.styles ? state.doc.attrs : (TX._mainAttrs ? TX._mainAttrs() : state.doc.attrs);

  /* ================= éditeur ================= */
  /**
   * new TX.Editor({host, doc (JSON|Node), kind:'main'|'part'|'note', editable, ctx, onChange(tr, view), onSelection(view),
   *                attrs() (attributs du document principal pour les sous-éditeurs), track() → bool, auto() → bool})
   */
  TX.Editor = function (opt) {
    const ed = this; ed.kind = opt.kind || 'main'; ed.ctx = opt.ctx || {};
    const getAttrs = (state) => ed.kind === 'main' ? state.doc.attrs : (opt.attrs ? opt.attrs() : state.doc.attrs);
    const doc = opt.doc && opt.doc.type && opt.doc.nodeSize ? opt.doc : schema.nodeFromJSON(opt.doc || TX.emptyDoc());
    const plugins = [
      autoRules(opt.auto || (() => true)),
      keymapFor(ed),
      PM.keymap.keymap(C.baseKeymap),
      H.history({ depth: 2000, newGroupDelay: 600 }),
      PM.dropcursor.dropCursor({ color: '#2563EB', width: 2 }), PM.gapcursor.gapCursor(),
      TB.tableEditing({ allowTableNodeSelection: true }),
      numPlugin(getAttrs), trackPlugin(opt.track || (() => false)), findPlugin(), marksPlugin(), layoutPlugin(), cmtPlugin()
    ].concat(opt.plugins || []);
    const state = PM.state.EditorState.create({ doc, plugins });
    ed.view = new EditorView(opt.host, {
      state, nodeViews: TX.nodeViews(),
      editable: () => opt.editable !== false && !ed.readOnly,
      attributes: { class: 'tx-doc tx-pm' + (opt.cls ? ' ' + opt.cls : ''), spellcheck: 'true', lang: 'fr', 'aria-label': opt.label || 'Document', role: 'textbox', 'aria-multiline': 'true' },
      dispatchTransaction(tr) {
        const v = ed.view;
        const ns = v.state.apply(tr);
        v.updateState(ns);
        if (opt.onChange) opt.onChange(tr, v);
      },
      handleDOMEvents: opt.domEvents || {},
      handleClickOn: opt.handleClickOn,
      handleDoubleClickOn: opt.handleDoubleClickOn,
      transformPastedHTML: (html) => TX.cleanPastedHtml ? TX.cleanPastedHtml(html) : html,
      transformPasted: (slice) => TX.fixPastedSlice ? TX.fixPastedSlice(slice, ed) : slice,
      handlePaste: opt.handlePaste,
      handleDrop: opt.handleDrop,
      clipboardTextParser: (text, $ctx) => TX.textToSlice(text, $ctx)
    });
    ed.view._tx = ed;
    ed.state = () => ed.view.state;
    ed.destroy = () => ed.view.destroy();
    return ed;
  };
  /** Texte brut collé : un paragraphe par ligne, tabulations gardées */
  TX.textToSlice = function (text, $ctx) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    const style = $ctx && $ctx.parent && $ctx.parent.type === NT.paragraph ? $ctx.parent.attrs.s : 'Normal';
    const paras = lines.map((l) => NT.paragraph.create({ s: style }, l ? TX.B.inl(l).map((x) => schema.nodeFromJSON(x)) : null));
    return new Slice(Fragment.fromArray(paras), 1, 1);
  };
  /** État de la mise en forme à la sélection (ruban) : style, marques, paragraphe effectif */
  TX.fmtState = function (state, attrs) {
    const { $from, from, to, empty } = state.selection;
    const styles = (attrs && attrs.styles) || {};
    let par = $from.parent; if (par.type !== NT.paragraph) { const n = state.selection.node; par = n && n.type === NT.paragraph ? n : null; }
    const R = par ? TX.resolveStyle(styles, par.attrs.s) : { p: {}, r: {} };
    const marks = empty ? (state.storedMarks || $from.marks()) : (() => { let ms = null; state.doc.nodesBetween(from, to, (n) => { if (n.isText) { ms = ms ? ms.filter((m) => m.isInSet(n.marks)) : n.marks.slice(); } return true; }); return ms || $from.marks(); })();
    const get = (name) => marks.find((m) => m.type.name === name);
    const cs = get('cs'), csr = cs && styles[cs.attrs.id] ? TX.resolveStyle(styles, cs.attrs.id).r : {};
    const r = Object.assign({}, R.r, csr);
    const P = Object.assign({}, R.p); if (par) Object.keys(par.attrs).forEach((k) => { if (par.attrs[k] != null && k !== 's') P[k] = par.attrs[k]; });
    const theme = TX.themeOf(attrs && attrs.settings);
    const font = get('font') ? get('font').attrs.f : r.f === '+major' ? theme.fonts.major : r.f === '+minor' ? theme.fonts.minor : (r.f || theme.fonts.minor);
    return {
      style: par ? par.attrs.s : null, cstyle: cs ? cs.attrs.id : null, par, p: P,
      bold: get('b') ? true : get('nob') ? false : !!r.b, italic: get('i') ? true : get('noi') ? false : !!r.i,
      underline: !!(get('u') || r.u), ulStyle: get('u') ? get('u').attrs.s : r.u || null, strike: !!(get('s') || r.s), dstrike: !!(get('s') && get('s').attrs.dbl),
      sup: (get('va') && get('va').attrs.v === 'sup') || r.va === 'sup', sub: (get('va') && get('va').attrs.v === 'sub') || r.va === 'sub',
      font, size: get('size') ? get('size').attrs.pt : (r.sz || 11), color: get('color') ? get('color').attrs.c : (r.c || null), highlight: get('hl') ? get('hl').attrs.c : null, shade: get('shd') ? get('shd').attrs.c : null,
      caps: !!(get('caps') || r.caps), smcaps: !!(get('smcaps') || r.smcaps), spacing: get('sp') ? get('sp').attrs.pt : (r.sp || 0), link: get('link') ? get('link').attrs.href : null, hidden: !!get('hidden'),
      align: P.al || 'left', list: P.li || null, inTable: TB.isInTable(state), marks
    };
  };
})();
