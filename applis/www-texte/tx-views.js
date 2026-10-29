/* Texte — vues des nœuds : images (habillage, recadrage, rotation, poignées), formes / zones de texte / icônes /
   graphiques / SmartArt, équations (KaTeX), champs, appels de note, table des matières, tableaux, tabulations, signets. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, PMs = window.PM.state;
  const PX = TX.PX;
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------------- médias (images du document) ---------------- */
  const M = TX.media = { blobs: {}, urls: {}, info: {} };
  M.url = (id) => { if (!id) return ''; if (M.urls[id]) return M.urls[id]; const b = M.blobs[id]; if (!b) return ''; return (M.urls[id] = URL.createObjectURL(b)); };
  M.add = function (blob, name, info) {
    for (const k in M.blobs) if (M.blobs[k] === blob) return k;
    const id = TX.uid('m'); M.blobs[id] = blob; M.info[id] = Object.assign({ name: name || 'image', type: blob.type }, info || {}); return id;
  };
  M.reset = function (blobs, info) { Object.values(M.urls).forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { } }); M.blobs = blobs || {}; M.urls = {}; M.info = info || {}; };
  M.dataUrl = async (id) => M.blobs[id] ? O.blobToDataURL(M.blobs[id]) : '';
  /** Médias utilisés par un JSON de document (corps, en-têtes, notes) */
  M.used = function (json) { const s = new Set(); JSON.stringify(json, (k, v) => { if ((k === 'm' || k === 'media') && typeof v === 'string' && M.blobs[v]) s.add(v); return v; }); return s; };

  /* ---------------- outils ---------------- */
  function imgCss(a) {
    let s = '';
    const w = r2(a.w), h = r2(a.h);
    s += 'width:' + w + 'pt;height:' + h + 'pt;';
    const tf = []; if (a.rot) tf.push('rotate(' + a.rot + 'deg)'); if (a.fh) tf.push('scaleX(-1)'); if (a.fv) tf.push('scaleY(-1)');
    if (tf.length) s += 'transform:' + tf.join(' ') + ';';
    if (a.wrap === 'front' || a.wrap === 'behind') s += 'left:' + r2(a.x || 0) + 'pt;top:' + r2(a.y || 0) + 'pt;';
    else if (a.wrap !== 'inline' && a.y) s += 'margin-top:' + r2(a.y) + 'pt;';
    return s;
  }
  TX.wrapClass = (a) => 'tx-w-' + (a.wrap || 'inline') + (a.wrap === 'square' || a.wrap === 'tight' || a.wrap === 'through' || a.wrap === 'topBottom' ? ' tx-al-' + (a.al || 'left') : '');
  /** Poignées de redimensionnement / rotation d'un objet sélectionné */
  function handles(view, getPos, el, opt) {
    const box = O.h('span', { cls: 'tx-hdl', contenteditable: 'false' });
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach((k) => box.appendChild(O.h('i', { 'data-h': k })));
    if (opt.rotate !== false) box.appendChild(O.h('i', { 'data-h': 'rot', title: 'Faire pivoter' }));
    box.addEventListener('pointerdown', (e) => {
      const h = e.target.dataset && e.target.dataset.h; if (!h) return;
      e.preventDefault(); e.stopPropagation();
      const pos = getPos(), node = view.state.doc.nodeAt(pos); if (!node) return;
      const a0 = node.attrs, scale = TX.scaleOf(el) || 1, ratio = a0.w / a0.h;
      if (h === 'rot') {
        const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        O.drag(e, { threshold: 0, move: (dx, dy, ev) => { let ang = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90; if (!ev.shiftKey) ang = Math.round(ang / 15) * 15; ang = ((Math.round(ang) % 360) + 360) % 360; el.style.transform = 'rotate(' + ang + 'deg)'; el._ang = ang; }, end: (dx, dy, ev, moved) => { if (moved && el._ang != null) setAttrs(view, getPos(), { rot: el._ang }); } });
        return;
      }
      O.drag(e, { threshold: 0, move: (dx, dy, ev) => {
        dx /= scale * PX; dy /= scale * PX;
        let w = a0.w + (/e/.test(h) ? dx : /w/.test(h) ? -dx : 0), hh = a0.h + (/s/.test(h) ? dy : /n/.test(h) ? -dy : 0);
        if (h.length === 2 && !ev.shiftKey && opt.keepRatio !== false) { if (Math.abs(dx) > Math.abs(dy)) hh = w / ratio; else w = hh * ratio; }
        w = Math.max(8, w); hh = Math.max(8, hh);
        el.style.width = r2(w) + 'pt'; el.style.height = r2(hh) + 'pt'; el._wh = [r2(w), r2(hh)];
        if (opt.onSize) opt.onSize(w, hh);
      }, end: (dx, dy, ev, moved) => { if (moved && el._wh) setAttrs(view, getPos(), { w: el._wh[0], h: el._wh[1] }); el._wh = null; } });
    });
    return box;
  }
  function setAttrs(view, pos, patch) {
    const node = view.state.doc.nodeAt(pos); if (!node) return;
    const tr = view.state.tr.setNodeMarkup(pos, null, Object.assign({}, node.attrs, patch));
    tr.setSelection(PMs.NodeSelection.create(tr.doc, pos));
    view.dispatch(tr.setMeta('tx-label', 'Taille et position'));
  }
  TX.setNodeAttrs = setAttrs;
  /** Déplacement à la souris d'un objet « devant / derrière le texte » (décalage par rapport au paragraphe) */
  function freeMove(view, getPos, el, e) {
    const pos = getPos(), node = view.state.doc.nodeAt(pos); if (!node) return;
    const scale = TX.scaleOf(el) || 1, x0 = node.attrs.x || 0, y0 = node.attrs.y || 0;
    O.drag(e, { threshold: 3, move: (dx, dy) => { el.style.left = r2(x0 + dx / scale / PX) + 'pt'; el.style.top = r2(y0 + dy / scale / PX) + 'pt'; el._xy = [r2(x0 + dx / scale / PX), r2(y0 + dy / scale / PX)]; }, end: (dx, dy, ev, moved) => { if (moved && el._xy) setAttrs(view, getPos(), { x: el._xy[0], y: el._xy[1] }); else view.dispatch(view.state.tr.setSelection(PMs.NodeSelection.create(view.state.doc, getPos()))); el._xy = null; } });
  }
  TX.scaleOf = function (el) { const p = el.closest && el.closest('.tx-paper'); return p ? (p._scale || 1) : 1; };

  /* ---------------- image ---------------- */
  class ImageView {
    constructor(node, view, getPos) { this.view = view; this.getPos = getPos; this.dom = O.h('span', { contenteditable: 'false' }); this.render(node); }
    render(node) {
      this.node = node; const a = node.attrs;
      this.dom.className = 'tx-img ' + TX.wrapClass(a) + (a.dec ? ' tx-dec' : '');
      this.dom.setAttribute('style', imgCss(a) + (a.bd && a.bd.w ? 'outline:' + r2(a.bd.w) + 'pt ' + (a.bd.s === 'dashed' ? 'dashed' : 'solid') + ' ' + TX.color(a.bd.c || '#000') + ';outline-offset:-' + r2(a.bd.w / 2) + 'pt;' : '') + (a.sha ? 'filter:drop-shadow(3pt 3pt 4pt rgba(0,0,0,.35));' : ''));
      const src = a.m ? TX.media.url(a.m) : a.src || '';
      const c = a.crop || { l: 0, t: 0, r: 0, b: 0 };
      const kw = 1 / Math.max(0.05, 1 - (c.l || 0) - (c.r || 0)), kh = 1 / Math.max(0.05, 1 - (c.t || 0) - (c.b || 0));
      const cropped = c.l || c.t || c.r || c.b;
      this.dom.innerHTML = '<span class="tx-img-in"><img draggable="false" alt="' + O.esc(a.alt || '') + '" src="' + O.esc(src) + '" style="' + (cropped ? 'position:absolute;width:' + r2(kw * 100) + '%;height:' + r2(kh * 100) + '%;left:' + r2(-(c.l || 0) * kw * 100) + '%;top:' + r2(-(c.t || 0) * kh * 100) + '%' : 'width:100%;height:100%') + '"></span>';
      this.dom.setAttribute('role', 'img'); this.dom.setAttribute('aria-label', a.alt || 'Image');
      if (this.sel) this.dom.appendChild(handles(this.view, this.getPos, this.dom, { rotate: true }));
      this.dom.onpointerdown = (e) => { if (e.button !== 0 || e.target.closest('.tx-hdl')) return; if (/front|behind/.test(this.node.attrs.wrap) && this.view.editable) { e.preventDefault(); freeMove(this.view, this.getPos, this.dom, e); } };
    }
    update(node) { if (node.type !== this.node.type) return false; this.render(node); return true; }
    selectNode() { this.sel = true; this.dom.classList.add('sel'); this.render(this.node); }
    deselectNode() { this.sel = false; this.dom.classList.remove('sel'); this.render(this.node); }
    stopEvent(e) { return !!(e.target.closest && e.target.closest('.tx-hdl')) || (e.type === 'pointerdown' && /front|behind/.test(this.node.attrs.wrap)); }
    ignoreMutation() { return true; }
  }

  /* ---------------- formes, zones de texte, icônes, graphiques ---------------- */
  TX.drawingSvg = function (a, doc) {
    const W = a.w * PX, H = a.h * PX, P = window.Pres;
    const fill = a.fill ? TX.color(a.fill) : 'none', line = a.line ? TX.color(a.line.c || '#000') : 'none', lw = a.line ? (a.line.w || 1) * PX : 0;
    if (a.kind === 'icon') return '<svg viewBox="0 0 24 24" width="100%" height="100%" style="fill:' + (a.fill ? fill : 'none') + ';stroke:' + TX.color(a.color || 't:accent1') + ';stroke-width:' + (a.line && a.line.w ? a.line.w : 2) + ';stroke-linecap:round;stroke-linejoin:round" aria-hidden="true">' + O.iconSvg(a.icon || 'star') + '</svg>';
    if (a.kind === 'chart' && P && P.chartSvg) return P.chartSvg(a.chart || P.newChart('bar'), W, H, doc);
    if (a.kind === 'smart' && P && P.smartHtml) return P.smartHtml(a.smart || P.newSmart('process'), W, H, doc);
    if (!P || !P.shapeParts) return '<svg width="100%" height="100%"><rect width="100%" height="100%" fill="' + fill + '"/></svg>';
    const isLine = P.isLineShape && P.isLineShape(a.shape);
    const parts = P.shapeParts(a.shape, W, H, a.adj || (P.DEFAULT_ADJ || {})[a.shape] || {});
    let s = '<svg viewBox="0 0 ' + r2(W) + ' ' + r2(H) + '" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible" aria-hidden="true">';
    if (isLine) s += '<defs><marker id="txah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10Z" fill="' + line + '"/></marker></defs>';
    parts.forEach((p) => {
      const f = p.fill === 'none' || isLine ? 'none' : p.fill === 'darken' ? 'color-mix(in srgb,' + fill + ' 70%, #000)' : p.fill === 'lighten' ? 'color-mix(in srgb,' + fill + ' 70%, #fff)' : fill;
      s += '<path d="' + p.d + '" fill="' + f + '" stroke="' + (p.stroke === false ? 'none' : line) + '" stroke-width="' + r2(lw) + '"' + (a.line && a.line.dash === 'dash' ? ' stroke-dasharray="' + r2(lw * 4) + ' ' + r2(lw * 3) + '"' : '') + (isLine && /Arrow/.test(a.shape) ? ' marker-end="url(#txah)"' : '') + (isLine && /Double/.test(a.shape) ? ' marker-start="url(#txah)" marker-end="url(#txah)"' : '') + '/>';
    });
    return s + '</svg>';
  };
  class DrawingView {
    constructor(node, view, getPos) { this.view = view; this.getPos = getPos; this.dom = O.h('span', { contenteditable: 'false' }); this.render(node); }
    render(node) {
      this.node = node; const a = node.attrs;
      this.dom.className = 'tx-drw ' + TX.wrapClass(a);
      this.dom.setAttribute('style', imgCss(a));
      this.dom.setAttribute('role', 'img'); this.dom.setAttribute('aria-label', a.alt || ({ shape: 'Forme', textbox: 'Zone de texte', icon: 'Icône', chart: 'Graphique', smart: 'SmartArt' }[a.kind] || 'Objet'));
      const ctx = this.view._tx && this.view._tx.ctx;
      let h = '<span class="tx-drw-g">' + TX.drawingSvg(a, ctx ? ctx.chartDoc() : null) + '</span>';
      if (a.kind === 'shape' || a.kind === 'textbox') h += '<span class="tx-drw-t" style="padding:' + r2(a.pad == null ? 7.2 : a.pad) + 'pt;justify-content:' + ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' }[a.va] || 'center') + ';' + (a.kind === 'shape' ? 'text-align:center;' : '') + '"><span class="tx-drw-ti">' + (a.html || '') + '</span></span>';
      this.dom.innerHTML = h;
      if (this.sel) this.dom.appendChild(handles(this.view, this.getPos, this.dom, { keepRatio: a.kind === 'icon', rotate: true }));
      this.dom.onpointerdown = (e) => { if (e.button !== 0 || e.target.closest('.tx-hdl') || e.target.closest('[contenteditable=true]')) return; if (/front|behind/.test(this.node.attrs.wrap) && this.view.editable) { e.preventDefault(); freeMove(this.view, this.getPos, this.dom, e); } };
      this.dom.ondblclick = (e) => { if ((this.node.attrs.kind === 'shape' || this.node.attrs.kind === 'textbox') && this.view.editable) { e.preventDefault(); this.editText(); } else if (this.view._tx && this.view._tx.onObjectDblClick) this.view._tx.onObjectDblClick(this.node, this.getPos()); };
    }
    editText() {
      const ti = this.dom.querySelector('.tx-drw-ti'); if (!ti) return;
      this.editing = true; this.dom.classList.add('editing');
      O.RichText.attach(ti, { tabIndent: false });
      ti.focus(); O.RichText.placeCaretEnd(ti);
      const done = () => {
        ti.removeEventListener('blur', done); O.RichText.detach(ti); this.editing = false; this.dom.classList.remove('editing');
        const html = O.RichText.isEmpty(ti.innerHTML) ? '' : O.RichText.sanitize(ti.innerHTML);
        if (html !== (this.node.attrs.html || '')) setAttrs(this.view, this.getPos(), { html });
      };
      ti.addEventListener('blur', done);
      ti.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); ti.blur(); } });
      TX.activeTextBox = ti;
    }
    update(node) { if (node.type !== this.node.type) return false; if (this.editing) { this.node = node; return true; } this.render(node); return true; }
    selectNode() { this.sel = true; this.dom.classList.add('sel'); if (!this.editing) this.render(this.node); }
    deselectNode() { this.sel = false; this.dom.classList.remove('sel'); if (!this.editing) this.render(this.node); }
    stopEvent(e) { return !!(e.target.closest && (e.target.closest('.tx-hdl') || e.target.closest('[contenteditable=true]'))) || (e.type === 'pointerdown' && /front|behind/.test(this.node.attrs.wrap)); }
    ignoreMutation() { return true; }
  }

  /* ---------------- équations ---------------- */
  TX.katexReady = () => !!window.katex;
  TX.loadKatex = function () { if (window.katex) return Promise.resolve(); return Promise.all([O.loadCss(O.vendor + 'katex/katex.min.css'), O.loadScript(O.vendor + 'katex/katex.min.js')]).then(() => { TX.refreshAll && TX.refreshAll(); }); };
  TX.renderTex = function (tex, display) {
    if (!window.katex) return '<span class="tx-math-src">' + O.esc(tex) + '</span>';
    try { return window.katex.renderToString(tex || '', { displayMode: !!display, throwOnError: false, output: 'html', strict: 'ignore' }); } catch (e) { return '<span class="tx-math-src">' + O.esc(tex) + '</span>'; }
  };
  class MathView {
    constructor(node, view, getPos) { this.view = view; this.getPos = getPos; this.dom = O.h('span', { cls: 'tx-math', contenteditable: 'false' }); this.render(node); if (!window.katex) TX.loadKatex(); }
    render(node) { this.node = node; this.dom.classList.toggle('disp', !!node.attrs.display); this.dom.innerHTML = TX.renderTex(node.attrs.tex, node.attrs.display); this.dom.setAttribute('role', 'math'); this.dom.setAttribute('aria-label', node.attrs.tex); this.dom.ondblclick = () => { if (this.view._tx && this.view._tx.onObjectDblClick) this.view._tx.onObjectDblClick(this.node, this.getPos()); }; }
    update(node, decos) { if (node.type !== this.node.type) return false; this.render(node); return true; }
    ignoreMutation() { return true; }
  }

  /* ---------------- champs ---------------- */
  const DATE_FMTS = [['d/MM/yyyy', '29/10/2026'], ['dddd d MMMM yyyy', 'jeudi 29 octobre 2026'], ['d MMMM yyyy', '29 octobre 2026'], ['dd/MM/yy', '29/10/26'], ['yyyy-MM-dd', '2026-10-29'], ['MMMM yyyy', 'octobre 2026'], ['HH:mm', '14:30'], ['HH:mm:ss', '14:30:05'], ['d/MM/yyyy HH:mm', '29/10/2026 14:30']];
  TX.DATE_FMTS = DATE_FMTS;
  TX.fmtDate = function (t, f) {
    const d = new Date(t || Date.now()); f = f || 'd/MM/yyyy';
    const p = (n) => String(n).padStart(2, '0');
    const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return f.replace(/dddd|dd|d|MMMM|MM|M|yyyy|yy|HH|H|mm|ss/g, (k) => ({ dddd: days[d.getDay()], dd: p(d.getDate()), d: d.getDate(), MMMM: months[d.getMonth()], MM: p(d.getMonth() + 1), M: d.getMonth() + 1, yyyy: d.getFullYear(), yy: String(d.getFullYear()).slice(2), HH: p(d.getHours()), H: d.getHours(), mm: p(d.getMinutes()), ss: p(d.getSeconds()) }[k]));
  };
  TX.FIELD_KINDS = [['page', 'Numéro de page'], ['pages', 'Nombre de pages'], ['sectionpages', 'Pages de la section'], ['date', 'Date (mise à jour)'], ['time', 'Heure'], ['savedate', 'Date d\'enregistrement'], ['created', 'Date de création'], ['title', 'Titre du document'], ['author', 'Auteur'], ['subject', 'Objet'], ['file', 'Nom du fichier'], ['words', 'Nombre de mots'], ['seq', 'Numéro de légende (SEQ)'], ['ref', 'Renvoi'], ['merge', 'Champ de fusion']];
  /** Texte d'un champ dans un contexte (ctx : celui de l'éditeur ; page : {n, total, secPages} pour en-têtes/pieds) */
  TX.fieldText = function (a, ctx, pos, page) {
    const pr = ctx ? ctx.props() : {};
    switch (a.f) {
      case 'page': return page ? page.label : (ctx && ctx.pageLabel ? ctx.pageLabel(pos) : '1');
      case 'pages': return String(page ? page.total : ctx && ctx.pageCount ? ctx.pageCount() : 1);
      case 'sectionpages': return String(page ? page.secPages : 1);
      case 'date': return TX.fmtDate(Date.now(), a.fmt || 'd/MM/yyyy');
      case 'time': return TX.fmtDate(Date.now(), a.fmt || 'HH:mm');
      case 'savedate': return TX.fmtDate(pr.modified || Date.now(), a.fmt || 'd/MM/yyyy');
      case 'created': return TX.fmtDate(pr.created || Date.now(), a.fmt || 'd/MM/yyyy');
      case 'title': return pr.title || (ctx && ctx.fileName ? ctx.fileName() : '') || '';
      case 'author': return pr.author || '';
      case 'subject': return pr.subject || '';
      case 'file': return ctx && ctx.fileName ? ctx.fileName() : 'Document';
      case 'words': return String(ctx && ctx.wordCount ? ctx.wordCount() : 0);
      case 'seq': return ctx && ctx.seqAt ? String(ctx.seqAt(pos, a.name)) : '1';
      case 'ref': return ctx && ctx.refText ? ctx.refText(a) : (a.cache || '?');
      case 'merge': { const rec = ctx && ctx.mergeRecord && ctx.mergeRecord(); if (rec) { const k = Object.keys(rec).find((x) => x.toLowerCase() === String(a.name || '').toLowerCase()); return k != null ? String(rec[k] == null ? '' : rec[k]) : ''; } return '«' + (a.name || 'champ') + '»'; }
      default: return a.cache || '';
    }
  };
  class FieldView {
    constructor(node, view, getPos) { this.view = view; this.getPos = getPos; this.dom = O.h('span', { cls: 'tx-field', contenteditable: 'false' }); this.render(node); }
    render(node) {
      this.node = node; const a = node.attrs, ctx = this.view._tx && this.view._tx.ctx;
      let pos = 0; try { pos = this.getPos(); } catch (e) { }
      const t = TX.fieldText(a, ctx, pos, null);
      this.dom.dataset.k = a.f; this.dom.dataset.f = JSON.stringify(a);
      this.dom.classList.toggle('merge', a.f === 'merge' && !(ctx && ctx.mergeRecord && ctx.mergeRecord()));
      if (this.dom.textContent !== t) this.dom.textContent = t;
      this.dom.title = (TX.FIELD_KINDS.find((k) => k[0] === a.f) || [0, 'Champ'])[1] + (a.name ? ' : ' + a.name : '');
    }
    update(node) { if (node.type !== this.node.type) return false; this.render(node); return true; }
    ignoreMutation() { return true; }
  }

  /* ---------------- appels de note ---------------- */
  class FnView {
    constructor(node, view, getPos) { this.view = view; this.getPos = getPos; this.dom = O.h('sup', { cls: 'tx-fn', contenteditable: 'false' }); this.render(node); }
    render(node) {
      this.node = node; const ctx = this.view._tx && this.view._tx.ctx;
      const n = ctx && ctx.noteLabel ? ctx.noteLabel(node.attrs.id, node.attrs.end) : '1';
      this.dom.textContent = node.attrs.mark || n; this.dom.dataset.id = node.attrs.id; this.dom.classList.toggle('end', !!node.attrs.end);
      this.dom.title = (node.attrs.end ? 'Note de fin ' : 'Note de bas de page ') + n;
      this.dom.onclick = () => { if (this.view._tx && this.view._tx.onNoteClick) this.view._tx.onNoteClick(node.attrs.id, node.attrs.end); };
    }
    update(node) { if (node.type !== this.node.type) return false; this.render(node); return true; }
    ignoreMutation() { return true; }
  }

  /* ---------------- table des matières / des illustrations ---------------- */
  class TocView {
    constructor(node, view, getPos) { this.view = view; this.getPos = getPos; this.dom = O.h('div', { cls: 'tx-toc', contenteditable: 'false' }); this.render(node); }
    render(node) {
      this.node = node; const a = node.attrs, ctx = this.view._tx && this.view._tx.ctx;
      const entries = ctx && ctx.tocEntries ? ctx.tocEntries(a) : (a.entries || []);
      let h = '';
      if (a.title) h += '<p data-s="TitreTM" class="tx-toc-title">' + O.esc(a.title) + '</p>';
      if (!entries.length) h += '<p class="tx-toc-empty">' + (a.kind === 'tof' ? 'Aucune légende « ' + O.esc(a.label) + ' » trouvée.' : 'Aucun titre trouvé : appliquez les styles Titre 1, Titre 2… à vos titres.') + '</p>';
      entries.forEach((e, i) => {
        const st = a.kind === 'tof' ? 'TableIllustrations' : 'TM' + Math.min(6, e.level || 1);
        h += '<p data-s="' + st + '" class="tx-toc-e" data-i="' + i + '"><span class="tx-toc-t">' + O.esc(e.text || '') + '</span>' + (a.nums !== false ? '<span class="tx-toc-l ' + (a.leader || 'dot') + '"></span><span class="tx-toc-n">' + O.esc(e.page || '') + '</span>' : '') + '</p>';
      });
      this.dom.innerHTML = h;
      this.dom.onclick = (ev) => { const p = ev.target.closest('.tx-toc-e'); if (p && this.view._tx && this.view._tx.onTocClick && (ev.ctrlKey || ev.metaKey || !this.view.editable || this.view._tx.tocClick)) this.view._tx.onTocClick(entries[+p.dataset.i]); };
      this.dom.setAttribute('role', 'navigation'); this.dom.setAttribute('aria-label', a.kind === 'tof' ? 'Table des illustrations' : 'Table des matières');
    }
    update(node) { if (node.type !== this.node.type) return false; this.render(node); return true; }
    ignoreMutation() { return true; }
  }

  /* ---------------- tableaux ---------------- */
  class TableView {
    constructor(node, view) {
      this.view = view; this.node = node;
      this.dom = O.h('div', { cls: 'tx-tw' });
      this.table = this.dom.appendChild(document.createElement('table'));
      this.colgroup = this.table.appendChild(document.createElement('colgroup'));
      this.contentDOM = this.table.appendChild(document.createElement('tbody'));
      this.apply(node);
    }
    apply(node) {
      this.node = node; const a = node.attrs, look = a.look || { hdr: true, band: true };
      this.table.setAttribute('data-ts', a.ts || 'Grille');
      this.table.className = (look.hdr ? 'hdr ' : '') + (look.band ? 'band ' : '') + (look.fc ? 'fc ' : '') + (look.lr ? 'lr ' : '') + (look.lc ? 'lc' : '');
      this.dom.style.textAlign = ''; this.dom.className = 'tx-tw' + (a.al ? ' tx-tal-' + a.al : '');
      let st = '';
      if (a.ind) st += 'margin-left:' + r2(a.ind) + 'pt;';
      if (a.cm) st += '--cpt:' + r2(a.cm.t || 0) + 'pt;--cpb:' + r2(a.cm.b || 0) + 'pt;--cpl:' + r2(a.cm.l == null ? 5.4 : a.cm.l) + 'pt;--cpr:' + r2(a.cm.r == null ? 5.4 : a.cm.r) + 'pt;';
      if (a.bd) ['t', 'b', 'l', 'r'].forEach((k) => { if (a.bd[k]) st += '--tb' + k + ':' + TX.borderCss(a.bd[k]) + ';'; });
      if (a.bd && (a.bd.h || a.bd.v)) { if (a.bd.h) st += '--tbh:' + TX.borderCss(a.bd.h) + ';'; if (a.bd.v) st += '--tbv:' + TX.borderCss(a.bd.v) + ';'; }
      this.table.setAttribute('style', st);
      if (a.bd) this.table.classList.add('tx-tbd');
      // colonnes
      const row = node.firstChild; let total = 0, fixed = true; const widths = [];
      if (row) row.forEach((c) => { for (let j = 0; j < c.attrs.colspan; j++) { const w = c.attrs.colwidth && c.attrs.colwidth[j]; widths.push(w || 0); if (!w) fixed = false; total += w || 80; } });
      let col = this.colgroup.firstChild;
      widths.forEach((w) => { if (!col) { col = this.colgroup.appendChild(document.createElement('col')); } col.style.width = w ? w + 'px' : ''; col = col.nextSibling; });
      while (col) { const n = col.nextSibling; col.remove(); col = n; }
      if (fixed && a.lay !== 'auto') { this.table.style.width = total + 'px'; this.table.style.tableLayout = 'fixed'; } else { this.table.style.width = a.w ? r2(a.w) + 'pt' : '100%'; this.table.style.tableLayout = a.lay === 'auto' ? 'auto' : 'fixed'; }
      this.table.setAttribute('aria-label', a.alt || 'Tableau');
    }
    update(node) { if (node.type !== this.node.type) return false; this.apply(node); return true; }
    ignoreMutation(m) { return m.type === 'attributes' && (m.target === this.table || m.target === this.dom || this.colgroup.contains(m.target)); }
  }

  /* ---------------- tabulation (largeur calculée par la mise en page) ---------------- */
  class TabView {
    constructor() { this.dom = O.h('span', { cls: 'tx-tab', contenteditable: 'false' }); this.dom.textContent = '\t'; }
    update(node) { return node.type.name === 'tab'; }
    ignoreMutation() { return true; }
  }
  class BookmarkView {
    constructor(node) { this.dom = O.h('a', { cls: 'tx-bk', contenteditable: 'false', 'data-bk': node.attrs.name, id: 'bk-' + node.attrs.name, title: 'Signet : ' + node.attrs.name }); }
    ignoreMutation() { return true; }
  }

  TX.nodeViews = function () {
    return {
      image: (n, v, g) => new ImageView(n, v, g), drawing: (n, v, g) => new DrawingView(n, v, g), math: (n, v, g) => new MathView(n, v, g),
      field: (n, v, g) => new FieldView(n, v, g), fnref: (n, v, g) => new FnView(n, v, g), toc: (n, v, g) => new TocView(n, v, g),
      table: (n, v) => new TableView(n, v), tab: () => new TabView(), bookmark: (n) => new BookmarkView(n)
    };
  };

  /** Rendu statique (en-têtes, pieds, notes, aperçus) : HTML d'un fragment ProseMirror avec les champs remplis */
  TX.renderStatic = function (frag, ctx, page) {
    const div = document.createElement('div');
    div.appendChild(TX.DOMSerializer.serializeFragment(frag));
    TX.fillStatic(div, ctx, page);
    return div;
  };
  TX.fillStatic = function (root, ctx, page) {
    root.querySelectorAll('.tx-field').forEach((el) => { let a = {}; try { a = JSON.parse(el.getAttribute('data-f') || '{}'); } catch (e) { } el.textContent = TX.fieldText(a, ctx, 0, page); el.setAttribute('contenteditable', 'false'); });
    root.querySelectorAll('img[data-a]').forEach((im) => {
      let a = {}; try { a = JSON.parse(im.getAttribute('data-a')); } catch (e) { }
      const iv = { view: { editable: false, _tx: { ctx } }, getPos: () => 0, dom: O.h('span') };
      ImageView.prototype.render.call(iv, { attrs: a, type: null });
      iv.dom.onpointerdown = null; im.replaceWith(iv.dom);
    });
    root.querySelectorAll('.tx-math').forEach((el) => { el.innerHTML = TX.renderTex(el.getAttribute('data-tex'), el.getAttribute('data-display') === '1'); });
    root.querySelectorAll('.tx-draw').forEach((el) => { let a = {}; try { a = JSON.parse(el.getAttribute('data-d') || '{}'); } catch (e) { } const d = O.h('span', { cls: 'tx-drw ' + TX.wrapClass(a), style: imgCss(a) }); d.innerHTML = '<span class="tx-drw-g">' + TX.drawingSvg(a, ctx ? ctx.chartDoc() : null) + '</span>' + (a.html ? '<span class="tx-drw-t" style="padding:' + r2(a.pad == null ? 7.2 : a.pad) + 'pt"><span class="tx-drw-ti">' + a.html + '</span></span>' : ''); el.replaceWith(d); });
    root.querySelectorAll('sup.tx-fn').forEach((el) => { el.textContent = ctx && ctx.noteLabel ? ctx.noteLabel(el.getAttribute('data-id'), el.getAttribute('data-end') === '1') : '*'; });
    return root;
  };
  TX.imgCss = imgCss;
})();
