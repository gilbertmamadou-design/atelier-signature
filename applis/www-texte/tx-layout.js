/* Texte — mise en page (mode Page) : vraie pagination d'un flux continu.
   Le document reste un seul éditeur ; la mise en page mesure le flux, puis pose des « poussées » (décorations) :
     - un bloc qui ne tient plus (ou qui doit commencer une page) reçoit une marge haute qui l'amène en haut de la page suivante ;
     - un paragraphe coupé reçoit, au début de la ligne qui passe à la page suivante, un bloc invisible de la bonne hauteur ;
     - une ligne de tableau qui ne tient plus est repoussée (en-tête répété) ; une table des matières est coupée entre ses entrées.
   Les pages (feuilles, marges, en-têtes, pieds, notes de bas de page, filigrane, bordures) sont dessinées dans deux calques :
   dessous (les feuilles) et dessus (les marges opaques entre deux pages, qui portent en-têtes, pieds et notes).
   Veuves et orphelines, paragraphes solidaires (« lignes solidaires », « paragraphes solidaires »), saut de page avant,
   sections (orientation, format, marges, numérotation, première page / pages paires différentes), colonnes. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, PM = window.PM;
  const { Decoration, DecorationSet } = PM.view;
  const PX = TX.PX, GAP = 28;
  const r1 = (v) => Math.round(v * 10) / 10;

  /* ---------------- tabulations ---------------- */
  /** Largeur des tabulations d'un conteneur (éditeur ou rendu statique) selon les taquets des paragraphes */
  TX.layoutTabs = function (root, attrs, scale) {
    const tabs = root.querySelectorAll('span.tx-tab'); if (!tabs.length) return;
    scale = scale || 1;
    const styles = (attrs && attrs.styles) || {}, defTab = ((attrs && attrs.settings && attrs.settings.tab) || 35.4) * PX;
    const cache = new Map();
    tabs.forEach((t) => { t.style.width = '0px'; t.removeAttribute('data-lead'); });
    const rng = document.createRange();
    // lectures puis écritures par « tour » (1re tabulation de chaque paragraphe, puis 2e…) : un recalcul de mise en page
    // par tour au lieu d'un par paragraphe (en-têtes et pieds de 150 pages : 1 s → quelques ms)
    const byP = new Map(); tabs.forEach((t) => { const p = t.closest('p'); if (!p) return; let l = byP.get(p); if (!l) byP.set(p, l = []); l.push(t); });
    let maxK = 0; byP.forEach((l) => { if (l.length > maxK) maxK = l.length; });
    const one = (t, p) => {
      let info = cache.get(p);
      if (!info) {
        const box = p.parentElement, br = box.getBoundingClientRect(), bs = getComputedStyle(box);
        const ref = br.left + (parseFloat(bs.paddingLeft) + parseFloat(bs.borderLeftWidth)) * scale;
        let stops = null; try { stops = JSON.parse(p.getAttribute('data-tabs') || 'null'); } catch (e) { }
        if (!stops) { const R = TX.resolveStyle(styles, p.getAttribute('data-s') || 'Normal'); stops = (R.p && R.p.tabs) || []; }
        stops = stops.filter((s) => s.t !== 'clear').map((s) => ({ pos: s.pos * PX, t: s.t || 'left', lead: s.lead || null })).sort((a, b) => a.pos - b.pos);
        const ps = getComputedStyle(p), ti = parseFloat(ps.textIndent) || 0, ml = parseFloat(ps.marginLeft) || 0;
        // taquets centrés / droits au-delà de la marge droite : ramenés au bord du texte (comme les en-têtes d'un traitement de texte)
        const right = (br.width / scale) - (parseFloat(bs.paddingLeft) + parseFloat(bs.borderLeftWidth) + parseFloat(bs.paddingRight) + parseFloat(bs.borderRightWidth)) - (parseFloat(ps.marginRight) || 0);
        stops.forEach((s) => { if ((s.t === 'right' || s.t === 'center') && s.pos > right) s.pos = s.t === 'right' ? right : Math.min(s.pos, right / 2); });
        if (ti < 0) stops.push({ pos: ml, t: 'left', hang: true });
        stops.sort((a, b) => a.pos - b.pos);
        info = { ref, stops }; cache.set(p, info);
      }
      const r = t.getBoundingClientRect(), x = (r.left - info.ref) / scale;
      let stop = info.stops.find((s) => s.pos > x + 0.5);
      if (!stop) stop = { pos: (Math.floor((x + 0.5) / defTab) + 1) * defTab, t: 'left' };
      let w = stop.pos - x;
      if (stop.t === 'right' || stop.t === 'center' || stop.t === 'decimal') {
        // largeur du texte qui suit (jusqu'à la tabulation suivante ou la fin du paragraphe)
        let end = t.nextSibling, txt = 0;
        rng.setStartAfter(t);
        let n = t; const stopAt = (el) => el && el.nodeType === 1 && (el.classList.contains('tx-tab') || el.tagName === 'BR');
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_ALL); walker.currentNode = t; let last = null;
        while ((n = walker.nextNode())) { if (n.nodeType === 1 && t.contains(n)) continue; if (stopAt(n)) { break; } last = n; }
        if (last) { if (last.nodeType === 3) rng.setEnd(last, last.length); else rng.setEndAfter(last); const rr = rng.getBoundingClientRect(); txt = rr.width / scale; if (stop.t === 'decimal') { const s = rng.toString(), k = s.search(/[,.]/); if (k > 0) txt = txt * k / s.length; } }
        void end;
        w = stop.t === 'center' ? w - txt / 2 : w - txt;
        if (w < 1) w = 1;
      }
      return [t, Math.max(1, w), stop.lead && stop.lead !== 'none' ? stop.lead : null];
    };
    for (let k = 0; k < maxK; k++) {
      const writes = []; byP.forEach((list, p) => { if (list[k]) writes.push(one(list[k], p)); });
      writes.forEach(([t, w, lead]) => { t.style.width = w + 'px'; if (lead) t.setAttribute('data-lead', lead); });
    }
  };

  /* ---------------- mise en page ---------------- */
  TX.Layout = function (ed, els, hooks) {
    const L = { ed, els, hooks, mode: 'page', scale: 1, pages: [], cache: new Map(), zoom: 1, fit: null };
    const view = () => (hooks.editor ? hooks.editor() : ed).view;
    const measureBox = O.h('div', { cls: 'tx-measure tx-doc' });
    els.paper.appendChild(measureBox);
    L.measureBox = measureBox;

    /* ---- zoom ---- */
    L.setZoom = function (z) {
      L.zoom = z; L.fit = null; applyScale(); hooks.onZoom && hooks.onZoom(z);
    };
    L.fitWidth = function () { L.fit = 'width'; applyScale(); };
    L.fitPage = function () { L.fit = 'page'; applyScale(); };
    function applyScale() {
      const sc = els.scroll, pw = L.paperW || 816, ph = L.pages[0] ? L.pages[0].H : 1123;
      let z = L.zoom;
      if (L.fit === 'width') z = Math.max(0.2, Math.min(4, (sc.clientWidth - 32) / pw));
      if (L.fit === 'page') z = Math.max(0.15, Math.min(4, Math.min((sc.clientWidth - 32) / pw, (sc.clientHeight - 24) / (ph + 8))));
      if (L.mode !== 'page') z = L.mode === 'web' || L.mode === 'outline' ? L.zoom : z;
      L.scale = z; L.zoom = z; els.paper._scale = z;
      els.paper.style.transform = 'scale(' + z + ')';
      els.sizer.style.width = Math.ceil((L.paperW || 816) * z) + 'px';
      els.sizer.style.height = Math.ceil((L.paperH || 1123) * z) + 'px';
      hooks.onZoom && hooks.onZoom(z);
    }
    L.applyScale = applyScale;

    /* ---- en-têtes, pieds, notes : choix et mesures ---- */
    function partFor(doc, si, kind, which) {
      for (let i = si; i >= 0; i--) {
        const pg = TX.pg(doc.child(i)), set = pg[kind] || {};
        if (which === 'first' && !pg.titlePg) return null;
        if (set[which] !== null && set[which] !== undefined) return set[which] || null;
        if (which === 'first' && i === si) { /* première page différente, sans contenu : rien */ }
      }
      return null;
    }
    L.partFor = partFor;
    function partNode(id) { const p = (hooks.attrs().parts || {})[id]; if (!p) return null; try { return TX.schema.nodeFromJSON(p.doc || p); } catch (e) { return null; } }
    function renderPart(id, width, page) {
      const n = partNode(id); if (!n) return null;
      const d = TX.renderStatic(n.firstChild.content, hooks.ctx, page);
      d.className = 'tx-part-in'; d.style.width = width + 'px';
      return d;
    }
    L.renderPart = renderPart;
    function measure(el, width) { el.style.width = width + 'px'; measureBox.appendChild(el); TX.layoutTabs(el, hooks.attrs(), 1); const h = el.getBoundingClientRect().height / L.scale; el.remove(); return h; }
    function partHeight(id, width) {
      if (!id) return 0;
      const p = (hooks.attrs().parts || {})[id]; if (!p) return 0;
      const key = 'p:' + id + ':' + width + ':' + JSON.stringify(p).length + ':' + hash(JSON.stringify(p));
      if (L.cache.has(key)) return L.cache.get(key);
      const el = renderPart(id, width, { label: '88', total: 88, secPages: 88 }); const h = el ? measure(el, width) : 0;
      L.cache.set(key, h); return h;
    }
    function noteEl(id, n, width, end) {
      const note = (hooks.attrs().notes || {})[id];
      const box = O.h('div', { cls: 'tx-note' + (end ? ' end' : ''), 'data-note': id });
      let node = null; try { node = note ? TX.schema.nodeFromJSON(note.doc || note) : null; } catch (e) { }
      const inner = node ? TX.renderStatic(node.firstChild.content, hooks.ctx, null) : O.h('div', null, '<p data-s="NoteBas"></p>');
      const p = inner.querySelector('p'); if (p) p.insertAdjacentHTML('afterbegin', '<sup class="tx-fnn">' + O.esc(n) + '</sup> ');
      while (inner.firstChild) box.appendChild(inner.firstChild);
      box.style.width = width + 'px';
      return box;
    }
    L.noteEl = noteEl;
    function noteHeight(id, n, width) {
      const note = (hooks.attrs().notes || {})[id];
      const key = 'n:' + id + ':' + width + ':' + hash(JSON.stringify(note || ''));
      if (L.cache.has(key)) return L.cache.get(key);
      const h = measure(noteEl(id, n, width, false), width); L.cache.set(key, h); return h;
    }
    function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
    L.clearCache = () => L.cache.clear();
    const SEP = 14;   // filet des notes + espace (px)

    /* ---- outils de mesure ---- */
    let PR = null;
    const Y = (r) => (r.top - PR.top) / L.scale, YB = (r) => (r.bottom - PR.top) / L.scale, X = (r) => (r.left - PR.left) / L.scale;
    function rectOf(el) { return el.getBoundingClientRect(); }
    const FLOATSEL = '.tx-w-square,.tx-w-tight,.tx-w-through,.tx-w-front,.tx-w-behind,.tx-hdl,.tx-pgw,.tx-tw';
    const INLINESEL = '.tx-img,.tx-drw,.tx-math,.tx-lbl,.tx-field,sup.tx-fn,.tx-tab,a.tx-bk';
    /** Lignes d'un paragraphe : [{top, bottom, items:[{r, node, el, frag}]}] (coordonnées du papier, sans poussée) */
    function linesOf(p) {
      const items = []; const rng = document.createRange();
      const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(n) {
          if (n.nodeType === 1) {
            if (n.matches(FLOATSEL)) return NodeFilter.FILTER_REJECT;
            if (n.matches(INLINESEL)) { const rs = n.getClientRects(); for (let i = 0; i < rs.length; i++) if (rs[i].height > 0) items.push({ r: rs[i], el: n, frag: i }); return NodeFilter.FILTER_REJECT; }
            if (n.tagName === 'BR') { const rs = n.getClientRects(); if (rs[0]) items.push({ r: rs[0], el: n, frag: 0, br: true }); return NodeFilter.FILTER_REJECT; }
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let n;
      while ((n = tw.nextNode())) { if (!n.length) continue; rng.selectNodeContents(n); const rs = rng.getClientRects(); for (let i = 0; i < rs.length; i++) if (rs[i].height > 0) items.push({ r: rs[i], node: n, frag: i }); }
      if (!items.length) return [];
      // ordre du document, regroupé par ligne (centre vertical)
      const lines = [];
      items.forEach((it) => {
        const t = Y(it.r), b = YB(it.r), c = (t + b) / 2;
        let ln = lines.find((l) => c > l.top - 0.5 && c < l.bottom + 0.5 || (t >= l.top - 1 && b <= l.bottom + 1));
        if (!ln) { ln = { top: t, bottom: b, items: [] }; lines.push(ln); }
        ln.top = Math.min(ln.top, t); ln.bottom = Math.max(ln.bottom, b); ln.items.push(it);
      });
      lines.sort((a, b) => a.top - b.top);
      // limites des boîtes de ligne : milieu de l'espace entre deux lignes
      const pr = rectOf(p), ps = getComputedStyle(p);
      const ct = Y(pr) + (parseFloat(ps.borderTopWidth) + parseFloat(ps.paddingTop)), cb = YB(pr) - (parseFloat(ps.borderBottomWidth) + parseFloat(ps.paddingBottom));
      lines.forEach((l, i) => { l.boxTop = i === 0 ? Math.min(l.top, ct) : (lines[i - 1].bottom + l.top) / 2; });
      lines.forEach((l, i) => { l.boxBottom = i === lines.length - 1 ? Math.max(l.bottom, cb) : lines[i + 1].boxTop; });
      return lines;
    }
    L.linesOf = linesOf;
    /** Position (ProseMirror) du début d'une ligne */
    function lineStartPos(line) {
      const v = view();
      // premier élément de la ligne dans l'ordre du document = le plus à gauche (texte de gauche à droite)
      const it = line.items.slice().sort((a, b) => a.r.left - b.r.left)[0];
      try {
        if (it.el) { const el = it.el; const par = el.parentNode; return v.posAtDOM(par, Array.prototype.indexOf.call(par.childNodes, el)); }
        const t = it.node;
        if (it.frag === 0) return v.posAtDOM(t, 0);
        // caractère qui commence la ligne : recherche par dichotomie
        const rng = document.createRange(); let lo = 0, hi = t.length - 1;
        const topOf = (i) => { rng.setStart(t, i); rng.setEnd(t, i + 1); const rs = rng.getClientRects(); const r = rs[rs.length - 1] || rng.getBoundingClientRect(); return Y(r); };
        while (lo < hi) { const mid = (lo + hi) >> 1; if (topOf(mid) >= line.top - 1) hi = mid; else lo = mid + 1; }
        while (lo < t.length && /\s/.test(t.data[lo]) && topOf(lo) < line.top - 1) lo++;
        return v.posAtDOM(t, lo);
      } catch (e) { return null; }
    }

    /* ---- passe de mise en page ---- */
    let applied = DecorationSet.empty, tocTouched = [];
    L.clearPushes = function () {
      const v = view();
      if (TX.layoutKey.getState(v.state) !== DecorationSet.empty) v.dispatch(v.state.tr.setMeta(TX.layoutKey, DecorationSet.empty).setMeta('addToHistory', false).setMeta('tx-layout', 1));
      tocTouched.forEach((e) => { e.style.marginTop = ''; }); tocTouched = [];
      els.paper.querySelectorAll('.tx-tw.tx-cont').forEach((e) => e.classList.remove('tx-cont'));
    };
    L.run = function () {
      if (L.busy) return; L.busy = true;
      try { run(); } catch (e) { console.error('mise en page', e); } finally { L.busy = false; }
    };
    function run() {
      const v = view(), attrs = hooks.attrs(), doc = v.state.doc;
      els.paper.classList.toggle('tx-pagemode', L.mode === 'page');
      L.clearPushes();
      // largeur du papier : la plus grande page
      let maxW = 0; doc.forEach((sec) => { maxW = Math.max(maxW, TX.pg(sec).w * PX); });
      if (L.mode !== 'page') {
        L.paperW = L.mode === 'read' ? maxW : Math.max(320, (els.scroll.clientWidth - 24) / (L.zoom || 1));
        els.paper.style.width = L.paperW + 'px'; els.body.style.paddingTop = '';
        TX.layoutTabs(v.dom, attrs, L.scale);
        L.paperH = els.body.offsetHeight + 40; els.paper.style.height = L.paperH + 'px';
        els.under.innerHTML = ''; els.over.innerHTML = '';
        L.pages = estimatePages(v, attrs);
        applyScale(); hooks.onPages && hooks.onPages(L.pages);
        return;
      }
      L.paperW = maxW; els.paper.style.width = maxW + 'px';
      // en-tête de la 1re page : marge haute du corps
      const pg0 = TX.pg(doc.firstChild), cw0 = (pg0.w - pg0.ml - pg0.mr - (pg0.gut || 0)) * PX;
      const firstH = partHeight(partFor(doc, 0, 'hdr', pg0.titlePg ? 'first' : 'def'), cw0);
      const top0 = Math.max(pg0.mt * PX, (pg0.mh * PX) + firstH + 4);
      els.body.style.paddingTop = top0 + 'px';
      TX.layoutTabs(v.dom, attrs, L.scale);
      PR = els.paper.getBoundingClientRect();
      const res = paginate(v, doc, attrs);
      // poussées
      applied = DecorationSet.create(v.state.doc, res.decos);
      v.dispatch(v.state.tr.setMeta(TX.layoutKey, applied).setMeta('addToHistory', false).setMeta('tx-layout', 1));
      res.toc.forEach((x) => { x.el.style.marginTop = x.mt + 'px'; tocTouched.push(x.el); });
      res.pages.forEach((p) => p.contTables.forEach((el) => el.classList.add('tx-cont')));
      L.pages = res.pages;
      const last = res.pages[res.pages.length - 1];
      L.paperH = last.top + last.H; els.paper.style.height = L.paperH + 'px';
      // correction : les tabulations à droite d'une ligne poussée ont pu changer de place
      TX.layoutTabs(v.dom, attrs, L.scale);
      drawPages(res.pages, attrs);
      applyScale();
      hooks.onPages && hooks.onPages(L.pages);
    }
    /** Estimation des pages hors mode Page (statistiques) */
    function estimatePages(v, attrs) {
      const pg = TX.pg(v.state.doc.firstChild), h = (pg.h - pg.mt - pg.mb) * PX;
      const n = Math.max(1, Math.ceil((els.body.offsetHeight * (pg.w - pg.ml - pg.mr) * PX / Math.max(200, els.body.offsetWidth)) / h));
      return Array.from({ length: n }, (x, i) => ({ i, num: i + 1, label: String(i + 1), startPos: 0, estimate: true }));
    }

    function paginate(v, doc, attrs) {
      const settings = attrs.settings || {};
      const pages = [], decos = [], toc = [];
      let delta = 0, page = null, num = 0;
      const posOf = (si) => { let p = 0; for (let i = 0; i < si; i++) p += doc.child(i).nodeSize; return p; };
      function newPage(si, pg, first) {
        const prev = pages[pages.length - 1];
        const top = prev ? prev.top + prev.H + GAP : 0;
        if (first && pg.numStart != null) num = pg.numStart; else num++;
        const W = pg.w * PX, H = pg.h * PX, cw = (pg.w - pg.ml - pg.mr - (pg.gut || 0)) * PX;
        const which = first && pg.titlePg ? 'first' : (settings.evenOdd && num % 2 === 0 ? 'even' : 'def');
        const hdr = partFor(doc, si, 'hdr', which), ftr = partFor(doc, si, 'ftr', which);
        const hdrH = partHeight(hdr, cw), ftrH = partHeight(ftr, cw);
        const p = {
          i: pages.length, si, pg, W, H, cw, top, left: (L.paperW - W) / 2, first, num, label: TX.fmtNum(num, pg.numFmt || 'decimal'),
          hdr, ftr, hdrH, ftrH, contentTop: top + Math.max(pg.mt * PX, pg.mh * PX + hdrH + 4), contentBottom: top + H - Math.max(pg.mb * PX, pg.mf * PX + ftrH + 4),
          notes: [], notesH: 0, used: null, startPos: null, contTables: [], rowHeads: []
        };
        p.used = p.contentTop;
        pages.push(p); page = p; return p;
      }
      const effBottom = (p, extraNotes) => p.contentBottom - (p.notes.length || extraNotes ? SEP + p.notesH + (extraNotes || 0) : 0);
      // notes de bas de page d'un élément (appels non encore placés)
      const notesIn = (el) => Array.from(el.querySelectorAll('sup.tx-fn:not(.end)')).map((s) => ({ id: s.dataset.id, n: s.textContent, y: YB(s.getBoundingClientRect()) }));
      function addNotes(p, list) { list.forEach((x) => { if (p.notes.some((n) => n.id === x.id)) return; const h = noteHeight(x.id, x.n, p.cw); p.notes.push({ id: x.id, n: x.n, h }); p.notesH += h; }); }
      const notesHeight = (p, list) => list.reduce((a, x) => a + (p.notes.some((n) => n.id === x.id) ? 0 : noteHeight(x.id, x.n, p.cw)), 0);
      /** Pousse un bloc (marge haute) pour qu'il commence à « target » */
      function pushBlock(b, target) {
        const D = target - b.top; if (D <= 0.01) return 0;
        const g0 = Math.max(0, b.top - b.prevBottom);
        decos.push(Decoration.node(b.pos, b.pos + b.node.nodeSize, { style: 'margin-top:' + r1(g0 + D) + 'px !important', class: 'tx-pushed' }));
        delta += D; b.top += D; b.bottom += D; return D;
      }
      function pushLine(pos, top, target) {
        const H = target - top; if (H <= 0.01) return 0;
        decos.push(Decoration.widget(pos, () => { const s = document.createElement('span'); s.className = 'tx-pgw'; s.style.height = r1(H) + 'px'; s.setAttribute('contenteditable', 'false'); return s; }, { side: -1, key: 'pgw' + pos + ':' + r1(H), marks: [], ignoreSelection: true }));
        delta += H; return H;
      }
      // blocs du document, à plat
      const blocks = [];
      doc.forEach((sec, off, si) => {
        const spos = off;
        sec.forEach((node, o) => { const pos = spos + 1 + o; blocks.push({ si, node, pos, dom: v.nodeDOM(pos) }); });
      });
      let prevBottom = null, keepChain = [];
      for (let j = 0; j < blocks.length; j++) {
        const b = blocks[j];
        const pg = TX.pg(doc.child(b.si));
        const firstOfSec = j === 0 || blocks[j - 1].si !== b.si;
        let force = false;
        if (firstOfSec) {
          if (!page) newPage(b.si, pg, true);
          else {
            const prevPg = TX.pg(doc.child(b.si - 1)), same = Math.abs(prevPg.w - pg.w) < 1 && Math.abs(prevPg.h - pg.h) < 1;
            if (pg.type === 'continuous' && same) { /* même page */ }
            else {
              newPage(b.si, pg, true);
              if ((pg.type === 'odd' && page.num % 2 === 0) || (pg.type === 'even' && page.num % 2 === 1)) newPage(b.si, pg, false);
              force = true;
            }
          }
        }
        const dom = b.dom; if (!dom || !dom.getBoundingClientRect) continue;
        const r = rectOf(dom);
        b.top = Y(r) + delta; b.bottom = YB(r) + delta; b.prevBottom = prevBottom == null ? b.top : prevBottom + delta;
        const t = b.node.type.name;
        if (j > 0 && blocks[j - 1].node.type.name === 'page_break') force = true;
        if (t === 'paragraph' && (b.node.attrs.pb || (TX.resolveStyle(attrs.styles || {}, b.node.attrs.s).p || {}).pb) && page.startPos != null) force = true;
        if (force) {
          if (!firstOfSec || page.startPos != null) newPage(b.si, pg, false);
          pushBlock(b, page.contentTop); keepChain = [];
        }
        if (page.startPos == null) page.startPos = b.pos;
        if (t === 'page_break' || t === 'col_break') { prevBottom = YB(r); continue; }
        // alignement vertical (page de titre centrée) : section d'une seule page
        // bloc entier
        const fnl = t === 'paragraph' || t === 'table' ? notesIn(dom) : [];
        const fitsWhole = b.bottom <= effBottom(page, notesHeight(page, fnl)) + 0.5;
        if (fitsWhole) { addNotes(page, fnl); page.used = Math.max(page.used, b.bottom); prevBottom = YB(r); trackKeep(b); continue; }
        // ne tient pas : paragraphe découpé ligne par ligne, tableau ligne de tableau par ligne, table des matières entrée par entrée
        if (t === 'paragraph') placeParagraph(b, r);
        else if (t === 'table') placeTable(b, r);
        else if (t === 'toc') placeToc(b, r);
        else { if (b.top > page.contentTop + 1) { moveToNext(b); } page.used = Math.max(page.used, b.bottom); }
        prevBottom = YB(r);
        trackKeep(b);
      }
      function trackKeep(b) { if (b.node.type.name === 'paragraph' && (b.node.attrs.kn != null ? b.node.attrs.kn : (TX.resolveStyle(attrs.styles || {}, b.node.attrs.s).p || {}).kn) && b.page === undefined) keepChain.push(b); else keepChain = []; b.page = page.i; }
      /** Le bloc passe à la page suivante ; les paragraphes « solidaires » qui le précèdent le suivent */
      function moveToNext(b) {
        const chain = keepChain.filter((x) => x.page === page.i);
        const startTop = chain.length ? chain[0].top : b.top;
        if (chain.length && startTop > page.contentTop + 1) {
          const c0 = chain[0]; const before = page; newPage(b.si, TX.pg(doc.child(b.si)), false);
          const D = page.contentTop - c0.top;
          // la première des solidaires est poussée ; les suivantes et le bloc courant suivent (même décalage)
          const g0 = Math.max(0, c0.top - c0.prevBottom);
          decos.push(Decoration.node(c0.pos, c0.pos + c0.node.nodeSize, { style: 'margin-top:' + r1(g0 + D) + 'px !important', class: 'tx-pushed' }));
          delta += D; chain.forEach((x) => { x.top += D; x.bottom += D; x.page = page.i; }); b.top += D; b.bottom += D;
          before.used = Math.min(before.used, c0.prevBottom); page.startPos = c0.pos; page.used = chain[chain.length - 1].bottom;
          return;
        }
        newPage(b.si, TX.pg(doc.child(b.si)), false); page.startPos = b.pos;
        pushBlock(b, page.contentTop);
      }
      function placeParagraph(b, r) {
        const kl = b.node.attrs.kl != null ? b.node.attrs.kl : (TX.resolveStyle(attrs.styles || {}, b.node.attrs.s).p || {}).kl;
        const wc = b.node.attrs.wc !== false;
        const lines = linesOf(b.dom);
        const fullH = b.bottom - b.top;
        if (!lines.length || (kl && fullH <= page.contentBottom - page.contentTop)) { moveToNext(b); addNotes(page, notesIn(b.dom).map((x) => x)); page.used = Math.max(page.used, b.bottom); return; }
        // flotteurs du paragraphe : une ligne qui ancre une image qui dépasse ne tient pas
        const floats = Array.from(b.dom.querySelectorAll('.tx-w-square,.tx-w-tight,.tx-w-through')).map((f) => ({ top: Y(rectOf(f)), bottom: YB(rectOf(f)) }));
        const fn = notesIn(b.dom);
        let off = delta;   // décalage déjà appliqué à ce paragraphe
        let first = 0;     // première ligne de la page courante
        let i = 0, moved = false;   // déjà passé à la page suivante : ne plus recommencer (sinon pages sans fin)
        while (i < lines.length) {
          const ln = lines[i], top = ln.boxTop + off, bottom = ln.boxBottom + off;
          const lnNotes = fn.filter((x) => x.y + off > top - 0.5 && x.y + off <= bottom + 0.5);
          const fl = floats.filter((f) => f.top + off >= top - 1 && f.top + off < bottom);
          const flBottom = fl.reduce((a, f) => Math.max(a, f.bottom + off), 0);
          const eb = effBottom(page, notesHeight(page, lnNotes));
          if (bottom <= eb + 0.5 && flBottom <= eb + 0.5) { addNotes(page, lnNotes); page.used = Math.max(page.used, bottom, flBottom); i++; continue; }
          // ligne i ne tient pas
          let k = i;
          if (wc && k - first === 1 && first === 0 && lines.length > 1) k = first;          // orpheline : 1 seule ligne en bas de page
          else if (wc && lines.length - k === 1 && k - first >= 2) k--;                       // veuve : 1 seule ligne en haut de la page suivante
          if (k === first && first === 0) {
            if (moved || (top - (lines[0].boxTop + off) < 1 && (b.top <= page.contentTop + 1))) { addNotes(page, lnNotes); page.used = Math.max(page.used, bottom); i++; continue; }   // déjà en haut de page : on laisse
            const before = delta; moveToNext(b); moved = true; off += delta - before; first = 0; i = 0; continue;
          }
          if (k === first) { addNotes(page, lnNotes); page.used = Math.max(page.used, bottom); i++; continue; }   // la ligne est déjà en haut de page
          const pos = lineStartPos(lines[k]);
          if (pos == null) { addNotes(page, lnNotes); page.used = Math.max(page.used, bottom); i++; continue; }
          const ltop = lines[k].boxTop + off;
          page.used = Math.max(page.contentTop, ltop);
          newPage(b.si, TX.pg(doc.child(b.si)), false); if (page.startPos == null) page.startPos = pos;
          const before = delta; pushLine(pos, ltop, page.contentTop); off += delta - before;
          first = k; i = k;
        }
        b.bottom = lines[lines.length - 1].boxBottom + off;
      }
      function placeTable(b, r) {
        const tbl = b.dom.querySelector('table'); if (!tbl) { moveToNext(b); return; }
        const rows = Array.from(tbl.tBodies[0] ? tbl.tBodies[0].rows : []);
        if (!rows.length) { moveToNext(b); return; }
        // lignes d'en-tête répétées
        const node = b.node; const hdrRows = []; node.forEach((row, o, i) => { if (row.attrs.hdr && hdrRows.length === i) hdrRows.push(i); });
        const hdrH = hdrRows.length ? YB(rectOf(rows[hdrRows.length - 1])) - Y(rectOf(rows[0])) : 0;
        let off = delta, rowPos = b.pos + 1;
        const rowPosList = []; node.forEach((row) => { rowPosList.push(rowPos); rowPos += row.nodeSize; });
        for (let i = 0; i < rows.length; i++) {
          const rr = rectOf(rows[i]), top = Y(rr) + off, bottom = YB(rr) + off;
          const fnl = notesIn(rows[i]);
          const eb = effBottom(page, notesHeight(page, fnl));
          if (bottom <= eb + 0.5) { addNotes(page, fnl); page.used = Math.max(page.used, bottom); continue; }
          if (i === 0 || (i <= hdrRows.length && hdrRows.length)) {
            if (b.top <= page.contentTop + 1) { addNotes(page, fnl); page.used = Math.max(page.used, bottom); continue; }
            const before = delta; moveToNext(b); off += delta - before; continue;
          }
          if (top <= page.contentTop + 1) { addNotes(page, fnl); page.used = Math.max(page.used, bottom); continue; }   // ligne plus haute qu'une page
          page.used = Math.max(page.contentTop, top);
          const prevPage = page;
          newPage(b.si, TX.pg(doc.child(b.si)), false); if (page.startPos == null) page.startPos = rowPosList[i];
          const extra = hdrRows.length ? hdrH : 0;
          const H = page.contentTop + extra - top;
          decos.push(Decoration.node(rowPosList[i], rowPosList[i] + node.child(i).nodeSize, { style: '--pg:' + r1(H) + 'px', class: 'tx-pgrow' }));
          page.rowHeads.push({ table: tbl, rows: hdrRows.map((k) => rows[k]), y: page.contentTop, x: X(rectOf(tbl)), w: rectOf(tbl).width / L.scale, cellTop: rows[i] });
          void prevPage;
          delta += H; off += H;
        }
        b.bottom = YB(rectOf(rows[rows.length - 1])) + off;
      }
      function placeToc(b, r) {
        const ents = Array.from(b.dom.querySelectorAll('p'));
        let off = delta;
        for (let i = 0; i < ents.length; i++) {
          const er = rectOf(ents[i]), top = Y(er) + off, bottom = YB(er) + off;
          if (bottom <= effBottom(page) + 0.5) { page.used = Math.max(page.used, bottom); continue; }
          if (i === 0) { if (b.top > page.contentTop + 1) { const before = delta; moveToNext(b); off += delta - before; } page.used = Math.max(page.used, bottom); continue; }
          page.used = top;
          newPage(b.si, TX.pg(doc.child(b.si)), false);
          const mt = parseFloat(getComputedStyle(ents[i]).marginTop) || 0, prevMb = parseFloat(getComputedStyle(ents[i - 1]).marginBottom) || 0;
          const D = page.contentTop - top; const g0 = Math.max(mt, prevMb);
          toc.push({ el: ents[i], mt: g0 + D }); delta += D; off += D;
        }
      }
      if (!pages.length) newPage(0, TX.pg(doc.firstChild), true);
      // pages : positions de début (recherche du numéro de page d'une position)
      pages.forEach((p, i) => { if (p.startPos == null) p.startPos = i ? pages[i - 1].startPos : 0; });
      // nombre de pages par section, total
      const secCount = {}; pages.forEach((p) => { secCount[p.si] = (secCount[p.si] || 0) + 1; });
      pages.forEach((p) => { p.total = pages.length; p.secPages = secCount[p.si]; });
      // notes de fin : pages supplémentaires si elles ne tiennent pas sur la dernière
      endnotes(pages, doc, attrs, newPage);
      return { pages, decos, toc };
    }
    /** Notes de fin : à la suite du texte, sur la dernière page puis sur des pages ajoutées */
    function endnotes(pages, doc, attrs, newPage) {
      const st = TX.numKey.getState(view().state); if (!st) return;
      const ids = Object.keys(st.notes.end).sort((a, b) => st.notes.end[a] - st.notes.end[b]);
      if (!ids.length) return;
      let p = pages[pages.length - 1];
      let y = Math.max(p.used, p.contentTop) + 18;
      p.endnotes = p.endnotes || [];
      ids.forEach((id, k) => {
        const n = TX.fmtNum(st.notes.end[id], (attrs.settings || {}).enFmt || 'lowerRoman');
        const h = noteHeight(id, n, p.cw) + 2;
        if (y + h + (k === 0 ? SEP : 0) > p.contentBottom - (p.notes.length ? SEP + p.notesH : 0)) {
          const si = p.si; const np = newPage(si, p.pg, false); np.startPos = p.startPos; np.total = 0; p = np; y = p.contentTop; p.endnotes = [];
        }
        if (!p.endnotes.length) y += k === 0 ? SEP : 0;
        p.endnotes.push({ id, n, y, h }); y += h; p.used = y;
      });
      pages.forEach((q) => { q.total = pages.length; });
    }

    /* ---- dessin des pages : feuilles (dessous), marges opaques, en-têtes, pieds, notes (dessus) ---- */
    function drawPages(pages, attrs) {
      const settings = attrs.settings || {}, pc = settings.pageColor ? TX.color(settings.pageColor) : '#FFFFFF';
      const under = els.under, over = els.over;
      under.innerHTML = ''; over.innerHTML = '';
      els.paper.style.setProperty('--pagecolor', pc);
      const fu = document.createDocumentFragment(), fo = document.createDocumentFragment();
      pages.forEach((p, i) => {
        const sheet = O.h('div', { cls: 'tx-sheet', style: { left: p.left + 'px', top: p.top + 'px', width: p.W + 'px', height: p.H + 'px', background: pc }, 'data-page': p.label });
        fu.appendChild(sheet);
        // masque du haut de page (au-dessus du corps) et du bas (sous le dernier contenu)
        const topMask = O.h('div', { cls: 'tx-mask', style: { left: p.left + 'px', top: p.top + 'px', width: p.W + 'px', height: Math.max(0, p.contentTop - p.top) + 'px', background: pc } });
        const usedB = Math.min(p.contentBottom + 2, Math.max(p.contentTop, p.used) + 1);
        const botMask = O.h('div', { cls: 'tx-mask', style: { left: p.left + 'px', top: usedB + 'px', width: p.W + 'px', height: Math.max(0, p.top + p.H - usedB) + 'px', background: pc } });
        fo.appendChild(topMask); fo.appendChild(botMask);
        // espace entre deux pages (masque gris, toute la largeur)
        if (i < pages.length - 1) fo.appendChild(O.h('div', { cls: 'tx-gap', style: { top: (p.top + p.H) + 'px', height: GAP + 'px' } }));
        // en-tête et pied de page
        const pageInfo = { label: p.label, total: p.total, secPages: p.secPages, num: p.num };
        const x = p.left + (p.pg.ml + (p.pg.gut || 0)) * PX;
        const hz = O.h('div', { cls: 'tx-hz tx-doc', 'data-kind': 'hdr', 'data-page': i, style: { left: x + 'px', top: (p.top + p.pg.mh * PX) + 'px', width: p.cw + 'px' }, title: 'Double-cliquer pour modifier l\'en-tête' });
        const fz = O.h('div', { cls: 'tx-hz tx-doc', 'data-kind': 'ftr', 'data-page': i, style: { left: x + 'px', bottom: (L.paperH ? 0 : 0) + 'px', top: (p.top + p.H - p.pg.mf * PX - p.ftrH) + 'px', width: p.cw + 'px' }, title: 'Double-cliquer pour modifier le pied de page' });
        hz.style.minHeight = Math.max(12, p.pg.mt * PX - p.pg.mh * PX - 4) + 'px'; fz.style.minHeight = Math.max(12, p.ftrH) + 'px';
        if (p.hdr) { const el = renderPart(p.hdr, p.cw, pageInfo); if (el) hz.appendChild(el); }
        if (p.ftr) { const el = renderPart(p.ftr, p.cw, pageInfo); if (el) fz.appendChild(el); }
        // zones cliquables : toute la marge haute / basse
        hz.style.height = Math.max(p.hdrH, p.contentTop - p.top - p.pg.mh * PX - 2) + 'px';
        fo.appendChild(hz); fo.appendChild(fz);
        // notes de bas de page
        if (p.notes.length) {
          const nb = O.h('div', { cls: 'tx-notes tx-doc', style: { left: x + 'px', top: (p.contentBottom - p.notesH - SEP + 4) + 'px', width: p.cw + 'px' } });
          nb.appendChild(O.h('div', { cls: 'tx-notesep' }));
          p.notes.forEach((n) => nb.appendChild(noteEl(n.id, n.n, p.cw, false)));
          fo.appendChild(nb);
        }
        if (p.endnotes && p.endnotes.length) {
          const eb = O.h('div', { cls: 'tx-notes tx-endnotes tx-doc', style: { left: x + 'px', top: (p.endnotes[0].y - (p.endnotes[0] === (pages.find((q) => q.endnotes && q.endnotes.length) || {}).endnotes[0] ? SEP - 4 : 0)) + 'px', width: p.cw + 'px' } });
          if (p === pages.find((q) => q.endnotes && q.endnotes.length)) eb.appendChild(O.h('div', { cls: 'tx-notesep' }));
          p.endnotes.forEach((n) => eb.appendChild(noteEl(n.id, n.n, p.cw, true)));
          fo.appendChild(eb);
        }
        // en-têtes de tableau répétés
        p.rowHeads.forEach((rh) => {
          const t = O.h('table', { cls: rh.table.className + ' tx-rephead', 'data-ts': rh.table.getAttribute('data-ts'), style: rh.table.getAttribute('style') || '' });
          t.style.position = 'absolute'; t.style.left = rh.x + 'px'; t.style.top = rh.y + 'px'; t.style.width = rh.w + 'px';
          const cg = rh.table.querySelector('colgroup'); if (cg) t.appendChild(cg.cloneNode(true));
          const tb = document.createElement('tbody'); rh.rows.forEach((row) => tb.appendChild(row.cloneNode(true))); t.appendChild(tb);
          t.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
          const wrap = O.h('div', { cls: 'tx-doc tx-rephead-w' }); wrap.appendChild(t); fo.appendChild(wrap);
          if (!rh.rows.length) { t.remove(); const ln = O.h('div', { cls: 'tx-contline', style: { left: rh.x + 'px', top: rh.y + 'px', width: rh.w + 'px', borderTop: getComputedStyle(rh.cellTop.cells[0] || rh.cellTop).borderTop } }); fo.appendChild(ln); }
        });
        // bordures de page
        const bd = p.pg.bd;
        if (bd && bd.s && bd.s !== 'none') {
          const fromText = bd.from !== 'page', sp = (bd.sp == null ? (fromText ? 4 : 24) : bd.sp) * PX;
          const box = fromText ? { l: x - sp, t: p.contentTop - sp, w: p.cw + 2 * sp, h: p.contentBottom - p.contentTop + 2 * sp } : { l: p.left + sp, t: p.top + sp, w: p.W - 2 * sp, h: p.H - 2 * sp };
          if (!(bd.first && i > 0 && !p.first)) fo.appendChild(O.h('div', { cls: 'tx-pgbd', style: { left: box.l + 'px', top: box.t + 'px', width: box.w + 'px', height: box.h + 'px', border: TX.borderCss(bd) } }));
        }
        // filigrane
        const wm = settings.wm;
        if (wm && (wm.text || wm.m)) {
          const w = O.h('div', { cls: 'tx-wm', style: { left: p.left + 'px', top: p.top + 'px', width: p.W + 'px', height: p.H + 'px' } });
          if (wm.m) w.innerHTML = '<img alt="" src="' + TX.media.url(wm.m) + '" style="max-width:' + (wm.scale || 60) + '%;max-height:70%;opacity:' + (wm.washout === false ? 1 : 0.25) + '">';
          else { const fs = wm.size === 'auto' || !wm.size ? Math.min(140, p.W * 1.1 / Math.max(4, String(wm.text).length) * 1.15) : wm.size * PX; w.innerHTML = '<span style="font-family:' + TX.fontCss(wm.font || 'Calibri') + ';font-size:' + fs + 'px;color:' + TX.color(wm.color || '#BFBFBF') + ';opacity:' + (wm.opacity == null ? 0.5 : wm.opacity) + ';transform:rotate(' + (wm.diag === false ? 0 : -45) + 'deg)">' + O.esc(wm.text) + '</span>'; }
          fo.appendChild(w);
        }
      });
      under.appendChild(fu); over.appendChild(fo);
      // zone en cours de modification (en-tête, pied, note) : gardée telle quelle à sa nouvelle place
      if (L.keep && L.keep.el) { const fresh = over.querySelector(L.keep.sel); if (fresh) { ['left', 'top', 'width', 'height', 'minHeight'].forEach((k) => { L.keep.el.style[k] = fresh.style[k]; }); fresh.replaceWith(L.keep.el); } else over.appendChild(L.keep.el); }
      // tabulations des en-têtes / pieds
      TX.layoutTabs(over, attrs, L.scale);
    }
    L.drawPages = () => drawPages(L.pages, hooks.attrs());

    /* ---- recherche de page ---- */
    L.pageIndexOf = function (pos) {
      const ps = L.pages; if (!ps.length) return 0;
      let lo = 0, hi = ps.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ps[mid].startPos != null && ps[mid].startPos <= pos) lo = mid; else hi = mid - 1; }
      // affinage : positions dans un paragraphe coupé (startPos du début de la ligne)
      return lo;
    };
    L.pageLabelAt = (pos) => { const p = L.pages[L.pageIndexOf(pos)]; return p ? p.label : '1'; };
    /** Page affichée (au milieu de la fenêtre) */
    L.visiblePage = function () {
      if (!L.pages.length || L.mode !== 'page') return 0;
      const sc = els.scroll, mid = (sc.scrollTop + sc.clientHeight / 3) / L.scale - (els.sizer.offsetTop / L.scale);
      let k = 0; L.pages.forEach((p, i) => { if (p.top <= mid) k = i; }); return k;
    };
    L.scrollToPage = function (i) { const p = L.pages[i]; if (!p) return; els.scroll.scrollTo({ top: els.sizer.offsetTop + p.top * L.scale - 12, behavior: 'smooth' }); };
    return L;
  };
})();
