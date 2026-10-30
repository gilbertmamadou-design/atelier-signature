/* Présentation — éditeur : état, rendu de la diapo courante et des miniatures, sélection, poignées
   (déplacement, redimensionnement, rotation, réglages, extrémités de lignes, rognage), magnétisme et repères,
   saisie du texte, presse-papier, clavier, zoom, règles et grille. window.PresApp (A). */
(function () {
  'use strict';
  const O = window.Office, RT = O.RichText, P = window.Pres;
  const A = window.PresApp = { doc: null, cur: 0, sel: [], editing: null, zoom: 1, fit: true, view: 'normal', groupIn: null, drawMode: null, painter: null, cropping: null, tableSel: null, masterKind: 'content', selSlides: [], dirty: false,
    settings: { grid: false, guides: true, snap: true, rulers: false, gridSize: 24, notes: true } };
  const $ = (s) => document.querySelector(s);
  let stage, stageIn, canvas, overlay, thumbsEl;
  try { Object.assign(A.settings, JSON.parse(localStorage.getItem('presentation:affichage') || '{}')); } catch (e) { }
  A.saveSettings = () => { try { localStorage.setItem('presentation:affichage', JSON.stringify(A.settings)); } catch (e) { } };

  /* ---------------- Accès ---------------- */
  A.slide = () => A.view === 'master' ? A.masterSlide() : A.doc.slides[A.cur];
  A.masterSlide = function () {
    if (!A._ms) A._ms = { id: 'master', layout: 'titleContent', elements: null, anims: [], comments: [], hideMaster: true };
    A._ms.elements = A.doc.master.elements; A._ms.layout = A.masterKind === 'title' ? 'title' : A.masterKind === 'section' ? 'section' : 'titleContent';
    return A._ms;
  };
  A.els = () => { const s = A.slide(); if (A.groupIn) { const g = P.findEl(s, A.groupIn); if (g) return g.children; } return s.elements; };
  A.get = (id) => P.findEl(A.slide(), id);
  A.selEls = () => A.sel.map(A.get).filter(Boolean);
  A.one = () => A.sel.length === 1 ? A.get(A.sel[0]) : null;
  A.theme = () => P.theme(A.doc);
  /** Position absolue d'un élément (les enfants d'un groupe ont des coordonnées relatives au groupe) */
  A.abs = function (e) {
    const r = P.find(A.slide(), e.id); let x = e.x, y = e.y;
    let p = r && r.parent; while (p) { x += p.x; y += p.y; const pp = P.find(A.slide(), p.id); p = pp && pp.parent; }
    return { x, y, w: e.w, h: e.h, rot: e.rot || 0 };
  };
  A.offset = function (e) { const a = A.abs(e); return { dx: a.x - e.x, dy: a.y - e.y }; };

  /* ---------------- Modifications ---------------- */
  let autosaveT = null;
  A.change = function (label, opt) {
    opt = opt || {};
    A.dirty = true; A.doc.modified = Date.now();
    if (A.view === 'master') A.doc.master.elements = A._ms.elements;
    if (!opt.noHistory) A.history.commit(label);
    clearTimeout(autosaveT); autosaveT = setTimeout(() => A.autosave && A.autosave(), 1500);
    if (opt.only === 'overlay') { A.renderOverlay(); }
    else if (opt.only === 'none') { }
    else { if (!opt.keepCanvas) A.renderCanvas(); A.renderOverlay(); if (!opt.noThumbs) A.renderThumbs(); }
    A.refreshUi();
  };
  A.refreshUi = O.raf(() => { if (A.ribbon) A.ribbon.refresh(); A.renderStatus && A.renderStatus(); A.paneRefresh && A.paneRefresh(); A.renderTitle && A.renderTitle(); });
  A.historyParts = () => { const meta = Object.assign({}, A.doc, { slides: null }); return [JSON.stringify(meta)].concat(A.doc.slides.map((s) => JSON.stringify(s))); };
  A.history = O.History({
    parts: () => A.historyParts(),
    restore: (parts) => {
      const meta = JSON.parse(parts[0]); const curId = A.doc.slides[A.cur] && A.doc.slides[A.cur].id;
      meta.slides = parts.slice(1).map((s) => JSON.parse(s));
      A.doc = meta;
      const i = A.doc.slides.findIndex((s) => s.id === curId); A.cur = O.clamp(i >= 0 ? i : A.cur, 0, A.doc.slides.length - 1);
      A.sel = A.sel.filter((id) => A.get(id)); A.editing = null; A.groupIn = null; A.cropping = null; A.dirty = true;
      A.renderAll();
      clearTimeout(autosaveT); autosaveT = setTimeout(() => A.autosave && A.autosave(), 1500);
    },
    onChange: () => A.refreshUi()
  });
  A.undo = () => { if (A.editing) A.stopEdit(); if (A.history.undo()) O.toast('Annulé : ' + (A.history.redoLabel() || 'modification'), { ms: 1400 }); };
  A.redo = () => { if (A.editing) A.stopEdit(); if (A.history.redo()) O.toast('Rétabli : ' + (A.history.undoLabel() || 'modification'), { ms: 1400 }); };

  /* ---------------- Rendu ---------------- */
  A.renderAll = function () { A.renderCanvas(); A.renderOverlay(); A.renderThumbs(true); if (A.view === 'sorter') A.renderSorter(); A.renderNotes(); A.refreshUi(); };
  A.slideW = () => A.doc.size.w; A.slideH = () => A.doc.size.h;
  A.layoutStage = function () {
    if (!stage || !A.doc) return;
    const W = A.slideW(), H = A.slideH(), sw = stage.clientWidth, sh = stage.clientHeight;
    const pad = O.narrow() ? 10 : 30;
    if (A.fit) A.zoom = Math.max(0.05, Math.min((sw - pad * 2) / W, (sh - pad * 2) / H));
    const cw = W * A.zoom, ch = H * A.zoom;
    const mx = Math.max(pad, (sw - cw) / 2), my = Math.max(pad, (sh - ch) / 2);
    stageIn.style.width = (cw + mx * 2) + 'px'; stageIn.style.height = (ch + my * 2) + 'px';
    for (const n of [canvas, overlay]) { n.style.left = mx + 'px'; n.style.top = my + 'px'; n.style.width = cw + 'px'; n.style.height = ch + 'px'; }
    const sl = canvas.firstElementChild; if (sl) sl.style.transform = 'scale(' + A.zoom + ')';
    A.drawRulers(); A.drawGrid();
  };
  A.renderCanvas = function () {
    if (!canvas || !A.doc) return;
    if (A.editing) return; // pas de re-rendu pendant la saisie (le texte édité est déjà à jour)
    const s = A.slide(); if (!s) return;
    const node = A.view === 'master' ? renderMaster() : P.renderSlide(A.doc, s, { mode: 'edit', index: A.cur });
    canvas.innerHTML = ''; canvas.appendChild(node);
    if (A.groupIn) { const g = node.querySelector('.el[data-id="' + A.groupIn + '"]'); if (g) g.classList.add('group-open'); }
    A.layoutStage();
    P.fitAll(node, A.doc, s);
    O.$$('.el-text', node).forEach((n) => { const e = A.get(n.dataset.id); if (e && e.ph && RT.isEmpty(e.html)) n.classList.add('is-empty-ph'); });
    if (window.katex === undefined && node.querySelector('.eq-raw')) A.loadKatex().then(() => A.renderCanvas());
    A.renderComments && A.renderComments();
  };
  function renderMaster() {
    const s = A.masterSlide();
    const node = P.renderSlide(A.doc, Object.assign({}, s, { hideMaster: true, elements: [] }), { mode: 'edit', index: 0 });
    // décor et éléments du masque en premier plan éditable ; espaces réservés indicatifs
    const els = node.querySelector('.sl-els');
    const kind = A.masterKind;
    let h = '';
    if (A.doc.master.decor) P.decor(A.doc, kind).forEach((e) => { h += P.elementHtml(e, A.doc, { mode: 'export' }).replace('class="el ', 'class="el decor '); });
    const phs = P.layoutBoxes(kind === 'title' ? 'title' : kind === 'section' ? 'section' : 'titleContent', A.slideW(), A.slideH()).map((b) => { const e = P.phEl(b.ph, b); e.html = b.ph === 'body' ? '<ul><li>Premier niveau</li><ul><li>Deuxième niveau</li><ul><li>Troisième niveau</li></ul></ul></ul>' : b.ph === 'subtitle' || b.ph === 'stext' ? 'Style du sous-titre' : 'Style du titre'; e.id = 'mph-' + b.ph; e.locked = true; return e; });
    node.querySelector('.sl-master').innerHTML = h + phs.map((e) => P.elementHtml(e, A.doc, { mode: 'export' })).join('') + node.querySelector('.sl-master').innerHTML;
    els.innerHTML = (A.doc.master.elements || []).map((e) => P.elementHtml(e, A.doc, { mode: 'edit' })).join('');
    return node;
  }
  A.loadKatex = function () { if (!A._katex) A._katex = Promise.all([O.loadScript(O.vendor + 'katex/katex.min.js'), O.loadCss(O.vendor + 'katex/katex.min.css')]).then(() => { O.Raster && O.Raster.resetCss(); }).catch(() => O.toast('Moteur d\'équations indisponible', { bad: true })); return A._katex; };

  /* ---------------- Miniatures ---------------- */
  const thumbCache = new Map();
  A.thumbNode = function (s, i, opt) {
    const node = P.renderSlide(A.doc, s, { mode: 'thumb', index: i });
    return node;
  };
  let thumbGen = 0;
  A.renderThumbs = function (force) {
    if (!thumbsEl || !A.doc) return;
    if (force) thumbCache.clear();
    const W = A.slideW(), H = A.slideH();
    thumbsEl.style.setProperty('--ar', W + '/' + H);
    const secs = A.doc.sections || [];
    const items = [];
    A.doc.slides.forEach((s, i) => {
      const sec = secs.find((x) => x.at === s.id);
      if (sec) items.push({ sec, i });
      items.push({ s, i });
    });
    if (secs.length && !secs.some((x) => x.at === (A.doc.slides[0] || {}).id)) items.unshift({ sec: { id: 'def', name: 'Section par défaut', at: null }, i: 0 });
    const want = items.map((it) => it.sec ? 'sec:' + it.sec.id + ':' + it.sec.name + (it.sec.closed ? 1 : 0) : 'sl:' + it.s.id).join('|');
    const tmeta = JSON.stringify([A.doc.theme, A.doc.master, A.doc.size]);
    if (thumbsEl._want !== want || thumbsEl._meta !== tmeta) {
      if (thumbsEl._meta !== tmeta) thumbCache.clear();
      thumbsEl._want = want; thumbsEl._meta = tmeta;
      let h = '', open = true;
      items.forEach((it) => {
        if (it.sec) { if (h && h.endsWith('<div class="sec-body">')) h += ''; h += (h ? '</div>' : '') + '<div class="sec' + (it.sec.closed ? ' closed' : '') + '" data-sec="' + it.sec.id + '">' + O.icon(it.sec.closed ? 'chevron-right' : 'chevron-down') + O.esc(it.sec.name) + ' <small>(' + countSec(it.sec) + ')</small></div><div class="sec-body">'; open = true; return; }
        if (!h) { h = '<div class="sec-body">'; }
        h += '<div class="th" data-i="' + it.i + '" data-sid="' + it.s.id + '" draggable="false"><div class="th-n"><span>' + (it.i + 1) + '</span></div><div class="th-box"></div></div>';
      });
      if (open) h += '</div>';
      thumbsEl.innerHTML = h;
    }
    const bw = (O.$('.th-box', thumbsEl) || { clientWidth: 170 }).clientWidth || 170;
    const k = bw / W, todo = [];
    O.$$('.th', thumbsEl).forEach((t) => {
      const i = +t.dataset.i, s = A.doc.slides[i]; if (!s) return;
      t.classList.toggle('on', i === A.cur);
      t.classList.toggle('sel', A.selSlides.length > 1 && A.selSlides.indexOf(s.id) >= 0);
      t.classList.toggle('hid', !!s.hidden);
      const n = t.querySelector('.th-n');
      const marks = (s.hidden ? O.icon('eye-off') : '') + ((s.anims || []).length || (s.transition && s.transition.type !== 'none') ? O.icon('sparkles') : '') + ((s.comments || []).some((c) => !c.done) ? O.icon('message-square') : '');
      const nh = '<span>' + (i + 1) + '</span>' + marks; if (n._h !== nh) { n.innerHTML = nh; n._h = nh; }
      const sig = JSON.stringify(s) + '#' + i;
      const box = t.querySelector('.th-box');
      if (thumbCache.get(s.id) === sig && box.firstChild && box._k === k) return;
      todo.push({ t, s, i, sig, box });
    });
    // gros fichier : les miniatures proches de la diapositive courante d'abord, les autres par petits lots (l'interface reste fluide)
    const draw = (it) => {
      thumbCache.set(it.s.id, it.sig);
      const node = A.thumbNode(it.s, it.i);
      node.style.transform = 'scale(' + k + ')'; it.box._k = k;
      it.box.innerHTML = ''; it.box.appendChild(node);
      P.fitAll(node, A.doc, O.clone(it.s));
    };
    const gen = ++thumbGen;
    todo.sort((a, b) => Math.abs(a.i - A.cur) - Math.abs(b.i - A.cur));
    const later = todo.length > 14 ? todo.splice(10) : [];
    todo.forEach(draw);
    if (later.length) {
      const step = () => {
        if (gen !== thumbGen) return;
        const t0 = performance.now();
        while (later.length && performance.now() - t0 < 24) { const it = later.shift(); if (it.t.isConnected && A.doc.slides[it.i] === it.s) draw(it); }
        if (later.length) setTimeout(step, 0);
      };
      setTimeout(step, 0);
    }
    const on = thumbsEl.querySelector('.th.on'); if (on && !thumbsEl._noScroll) { const r = on.getBoundingClientRect(), pr = thumbsEl.getBoundingClientRect(); if (r.top < pr.top || r.bottom > pr.bottom || r.left < pr.left || r.right > pr.right) on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  };
  function countSec(sec) { const secs = A.doc.sections || []; const i0 = sec.at ? P.slideIndex(A.doc, sec.at) : 0; let i1 = A.doc.slides.length; secs.forEach((x) => { const j = P.slideIndex(A.doc, x.at); if (j > i0 && j < i1) i1 = j; }); return Math.max(0, i1 - i0); }
  A.countSec = countSec;
  A.goto = function (i, opt) {
    opt = opt || {};
    if (A.editing) A.stopEdit();
    if (A.view === 'master') A.setView('normal');
    i = O.clamp(i, 0, A.doc.slides.length - 1);
    if (i !== A.cur) { A.cur = i; A.sel = []; A.groupIn = null; A.cropping = null; A.tableSel = null; }
    if (!opt.keepSlides) A.selSlides = [A.doc.slides[i].id];
    A.renderCanvas(); A.renderOverlay(); A.renderThumbs(); A.renderNotes(); A.refreshUi();
    if (A.view === 'sorter') A.renderSorter();
  };

  /* ---------------- Notes ---------------- */
  A.renderNotes = function () {
    const n = $('#notesEd'); if (!n) return;
    const s = A.doc.slides[A.cur];
    if (document.activeElement === n && n._slide === (s && s.id)) return;
    if (A.storeNotes && n._slide && n._slide !== (s && s.id)) A.storeNotes();
    n._slide = s ? s.id : null;
    n.innerHTML = s ? (s.notes || '') : '';
    n.contentEditable = A.view === 'master' ? 'false' : 'true';
  };

  /* ---------------- Calque de sélection ---------------- */
  A.renderOverlay = function () {
    if (!overlay || !A.doc) return;
    const z = A.zoom; let h = '';
    const els = A.selEls();
    if (A.groupIn) { const g = A.get(A.groupIn); if (g) { const a = A.abs(g); h += '<div class="sel-box group-in" style="left:' + a.x * z + 'px;top:' + a.y * z + 'px;width:' + a.w * z + 'px;height:' + a.h * z + 'px;transform:rotate(' + (g.rot || 0) + 'deg);transform-origin:50% 50%"></div>'; } }
    if (A.cropping) { h += cropOverlay(); overlay.innerHTML = h; return; }
    const multi = els.length > 1;
    els.forEach((e) => {
      const a = A.abs(e);
      if (e.type === 'line') {
        const [p0, p1] = P.lineEnds(e);
        h += '<div class="sel-box" style="left:' + a.x * z + 'px;top:' + a.y * z + 'px;width:' + Math.max(1, a.w * z) + 'px;height:' + Math.max(1, a.h * z) + 'px;border-color:transparent;transform:rotate(' + a.rot + 'deg);transform-origin:50% 50%">' +
          (multi || e.locked ? '' : '<i class="hd lend" data-h="la" style="left:' + p0[0] * z + 'px;top:' + p0[1] * z + 'px"></i><i class="hd lend" data-h="lb" style="left:' + p1[0] * z + 'px;top:' + p1[1] * z + 'px"></i>') + '</div>';
        if (multi || e.locked) h += '<div class="sel-box multi" style="left:' + a.x * z + 'px;top:' + a.y * z + 'px;width:' + Math.max(2, a.w * z) + 'px;height:' + Math.max(2, a.h * z) + 'px"></div>';
        return;
      }
      h += '<div class="sel-box' + (multi ? ' multi' : '') + (e.locked ? ' lockd' : '') + '" data-for="' + e.id + '" style="left:' + a.x * z + 'px;top:' + a.y * z + 'px;width:' + a.w * z + 'px;height:' + a.h * z + 'px;transform:rotate(' + a.rot + 'deg);transform-origin:50% 50%">';
      if (!multi && !e.locked) {
        const W = a.w * z, H = a.h * z;
        const hs = [['nw', 0, 0], ['n', W / 2, 0], ['ne', W, 0], ['e', W, H / 2], ['se', W, H], ['s', W / 2, H], ['sw', 0, H], ['w', 0, H / 2]];
        const small = W < 30 || H < 30;
        hs.forEach((p) => { if (small && p[0].length === 1 && (W < 14 || H < 14)) return; h += '<i class="hd" data-h="' + p[0] + '" style="left:' + p[1] + 'px;top:' + p[2] + 'px;cursor:' + cursorFor(p[0], a.rot) + '"></i>'; });
        if (e.type !== 'table') h += '<span class="rot-line" style="left:' + W / 2 + 'px;top:-22px;height:22px"></span><i class="hd rot" data-h="rot" style="left:' + W / 2 + 'px;top:-24px" title="Rotation (Maj : par pas de 15°)"></i>';
        if (e.type === 'shape' || (e.type === 'image' && e.mask)) P.shapeHandles(e.type === 'image' ? e.mask : e.shape, a.w, a.h, e.adj).forEach((ad, k) => { h += '<i class="hd adj" data-h="adj' + k + '" style="left:' + ad.x * z + 'px;top:' + ad.y * z + 'px" title="Réglage de la forme"></i>'; });
      }
      h += '</div>';
    });
    if (multi) { const b = A.bbox(els); h += '<div class="sel-box" style="left:' + b.x * z + 'px;top:' + b.y * z + 'px;width:' + b.w * z + 'px;height:' + b.h * z + 'px">' + (els.some((e) => e.locked) ? '' : ['nw', 'ne', 'se', 'sw'].map((k) => '<i class="hd" data-h="' + k + '" style="left:' + (/w/.test(k) ? 0 : b.w * z) + 'px;top:' + (/n/.test(k) ? 0 : b.h * z) + 'px;cursor:' + cursorFor(k, 0) + '"></i>').join('')) + '</div>'; }
    overlay.innerHTML = h;
    A.markTableSel();
  };
  function cursorFor(h, rot) { const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']; const i = dirs.indexOf(h); const j = (i + Math.round(((rot % 360) + 360) % 360 / 45)) % 8; return ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'][j]; }
  /** Boîte englobante (coordonnées absolues, rotation comprise) */
  A.bbox = function (els) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    els.forEach((e) => { const a = A.abs(e); A.corners(a).forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  A.corners = function (a) {
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2, t = (a.rot || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map((k) => { const dx = k[0] * a.w / 2, dy = k[1] * a.h / 2; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; });
  };
  A.markTableSel = function () {
    O.$$('td.csel', canvas).forEach((t) => t.classList.remove('csel'));
    const ts = A.tableSel; if (!ts) return;
    const n = canvas.querySelector('.el[data-id="' + ts.id + '"]'); if (!n) return;
    const r0 = Math.min(ts.r0, ts.r1), r1 = Math.max(ts.r0, ts.r1), c0 = Math.min(ts.c0, ts.c1), c1 = Math.max(ts.c0, ts.c1);
    if (r0 === r1 && c0 === c1 && A.editing) return;
    O.$$('td', n).forEach((td) => { const r = +td.dataset.r, c = +td.dataset.c; if (r >= r0 && r <= r1 && c >= c0 && c <= c1) td.classList.add('csel'); });
  };

  /* ---------------- Coordonnées ---------------- */
  A.toSlide = function (cx, cy) { const r = canvas.getBoundingClientRect(); return [(cx - r.left) / A.zoom, (cy - r.top) / A.zoom]; };
  function hitEl(target) {
    const n = target.closest && target.closest('.sl-els .el'); if (!n) return null;
    let id = n.dataset.id;
    // en dehors d'un groupe ouvert : on sélectionne le groupe de premier niveau
    let top = n; while (top.parentElement && top.parentElement.closest('.sl-els .el')) top = top.parentElement.closest('.sl-els .el');
    if (A.groupIn) { const gn = canvas.querySelector('.el[data-id="' + A.groupIn + '"]'); if (gn && gn.contains(n) && gn !== n) { let c = n; while (c.parentElement !== gn) c = c.parentElement.closest('.el'); return c.dataset.id; } }
    id = top.dataset.id;
    return id;
  }

  /* ---------------- Sélection ---------------- */
  A.select = function (ids, add) {
    if (A.editing) A.stopEdit();
    ids = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (add) { ids.forEach((id) => { const i = A.sel.indexOf(id); if (i >= 0) A.sel.splice(i, 1); else A.sel.push(id); }); }
    else A.sel = ids;
    if (A.tableSel && A.sel.indexOf(A.tableSel.id) < 0) A.tableSel = null;
    A.cropping = null;
    A.renderOverlay(); A.refreshUi();
  };
  A.clearSel = () => { if (A.editing) A.stopEdit(); A.sel = []; A.tableSel = null; A.cropping = null; if (A.groupIn) { A.groupIn = null; A.renderCanvas(); } A.renderOverlay(); A.refreshUi(); };

  /* ---------------- Saisie du texte ---------------- */
  let typingCommit = null;
  A.startEdit = function (id, opt) {
    opt = opt || {};
    const e = A.get(id); if (!e || e.locked) return false;
    const node = canvas.querySelector('.el[data-id="' + id + '"]'); if (!node) return false;
    let target;
    if (e.type === 'table') {
      const cell = opt.cell || [0, 0];
      target = node.querySelector('td[data-r="' + cell[0] + '"][data-c="' + cell[1] + '"] .cell-in'); if (!target) return false;
      A.tableSel = { id, r0: cell[0], c0: cell[1], r1: cell[0], c1: cell[1] };
    } else if (e.type === 'text' || e.type === 'shape') {
      let tx = node.querySelector('.el-tx');
      if (!tx) { // forme sans zone de texte : on la crée
        A.renderCanvas(); return A.startEdit(id, opt);
      }
      target = tx.querySelector('.el-tx-in');
      node.classList.add('editing');
      const pr = tx.querySelector('.ph-prompt'); if (pr) pr.remove();
      if (e.ph && /^(body|body2)$/.test(e.ph) && RT.isEmpty(e.html)) target.innerHTML = '<ul><li><br></li></ul>';
    } else return false;
    if (A.editing) A.stopEdit();
    A.sel = [id]; A.editing = { id, el: target, cell: e.type === 'table' ? (opt.cell || [0, 0]) : null, start: target.innerHTML };
    RT.attach(target, {
      onInput: () => onTyping(),
      onKey: (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); A.stopEdit(); A.renderOverlay(); return false; }
        if (e.type === 'table' && ev.key === 'Tab') { ev.preventDefault(); A.tableMove(ev.shiftKey ? -1 : 1); return false; }
      },
      onPaste: (ev) => { const f = Array.from((ev.clipboardData && ev.clipboardData.files) || []).filter((x) => /^image\//.test(x.type)); if (f.length) { ev.preventDefault(); A.stopEdit(); A.insertImages(f); return false; } }
    });
    target.focus({ preventScroll: true });
    if (opt.at) { const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(opt.at[0], opt.at[1]) : null; if (r && target.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); } else RT.placeCaretEnd(target); }
    else if (opt.selectAll) RT.selectAll(target);
    else RT.placeCaretEnd(target);
    if (opt.text) document.execCommand('insertText', false, opt.text);
    A.renderOverlay(); A.refreshUi();
    return true;
  };
  function onTyping() {
    const ed = A.editing; if (!ed) return;
    const e = A.get(ed.id); if (!e) return;
    const html = ed.el.innerHTML;
    if (ed.cell) { e.rows[ed.cell[0]].cells[ed.cell[1]].html = html; growTableRow(e, ed); }
    else { e.html = html; autoGrow(e); }
    A.dirty = true;
    clearTimeout(typingCommit); typingCommit = setTimeout(() => { if (A.editing) { A.history.commit('Saisie'); A.renderThumbs(); A.autosave && A.autosave(); } }, 900);
    A.renderOverlay(); A.refreshUi();
  }
  A.onTyping = onTyping;
  function autoGrow(e) {
    const node = canvas.querySelector('.el[data-id="' + e.id + '"]'); if (!node) return;
    const tx = node.querySelector('.el-tx'), inn = node.querySelector('.el-tx-in'); if (!tx || !inn) return;
    if (e.autofit === 'grow' && e.type === 'text' && !e.vert) {
      const cs = getComputedStyle(tx);
      const need = Math.ceil(inn.getBoundingClientRect().height / A.zoom + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
      if (Math.abs(need - e.h) > 1) { if (e.va === 'bottom') e.y -= need - e.h; else if (e.va === 'middle') e.y -= (need - e.h) / 2; e.h = need; node.style.height = need + 'px'; node.style.top = e.y + 'px'; tx.style.height = need + 'px'; const geo = node.querySelector('.el-geo'); if (geo) { const d = document.createElement('div'); d.innerHTML = P.elementHtml(e, A.doc, { mode: 'edit' }); const g2 = d.querySelector('.el-geo'); if (g2) geo.replaceWith(g2); } }
    } else if (e.autofit === 'shrink') { /* recalculé à la sortie de la saisie */ }
  }
  function growTableRow(e, ed) {
    const node = canvas.querySelector('.el[data-id="' + e.id + '"]'); if (!node) return;
    const tb = node.querySelector('table'); const need = tb.getBoundingClientRect().height / A.zoom;
    if (need > e.h + 1) { e.h = Math.ceil(need); node.style.height = e.h + 'px'; }
    void ed;
  }
  A.stopEdit = function () {
    const ed = A.editing; if (!ed) return;
    A.editing = null; clearTimeout(typingCommit);
    RT.detach(ed.el);
    const e = A.get(ed.id);
    if (e) {
      const clean = RT.sanitize(ed.el.innerHTML);
      const html = RT.isEmpty(clean) ? '' : clean;
      if (ed.cell) { const c = e.rows[ed.cell[0]] && e.rows[ed.cell[0]].cells[ed.cell[1]]; if (c) c.html = html; }
      else e.html = html;
    }
    const node = ed.el.closest('.el'); if (node) node.classList.remove('editing');
    getSelection().removeAllRanges();
    A.change('Saisie', { noThumbs: false });
  };
  A.textTarget = function () {
    // élément dont on met en forme tout le texte (sans édition en cours)
    if (A.editing) return null;
    const ids = A.sel.filter((id) => { const e = A.get(id); return e && (e.type === 'text' || e.type === 'shape'); });
    if (!ids.length) return null;
    return ids.map((id) => canvas.querySelector('.el[data-id="' + id + '"] .el-tx-in')).filter(Boolean);
  };
  /** Mise en forme du texte : pendant la saisie (sélection) ou sur tout le texte des éléments sélectionnés */
  A.fmt = function (cmd, val) {
    if (A.editing) {
      const ed = A.editing.el;
      if (document.activeElement !== ed) { ed.focus({ preventScroll: true }); if (A._lastRange && ed.contains(A._lastRange.startContainer)) RT.restoreSel(A._lastRange); }
      RT.apply(cmd, val); onTyping(); A.refreshUi(); return;
    }
    const ts = A.textTarget();
    if (ts && ts.length) {
      ts.forEach((t) => { RT.apply(cmd, val, t); const e = A.get(t.closest('.el').dataset.id); e.html = RT.sanitize(t.innerHTML); });
      A.change('Mise en forme du texte'); return;
    }
    // cellules de tableau sélectionnées
    const ts2 = A.tableSel && A.get(A.tableSel.id);
    if (ts2) { A.tableCells().forEach((c) => { const d = document.createElement('div'); d.innerHTML = c.html || ''; document.body.appendChild(d); RT.apply(cmd, val, d); c.html = RT.sanitize(d.innerHTML); d.remove(); }); A.change('Mise en forme du tableau'); }
  };
  A.textState = function () {
    if (A.editing) return RT.state();
    const ts = A.textTarget(); if (ts && ts.length) return RT.state(ts[0]);
    return {};
  };

  /* ---------------- Interactions au pointeur ---------------- */
  const pointers = new Map(); let pinch = null; let longT = null; let lastTap = { t: 0, id: null };
  function onDown(ev) {
    if (ev.button === 2) return; // menu contextuel géré à part
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 2) { const v = Array.from(pointers.values()); pinch = { d: Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), z: A.zoom }; clearTimeout(longT); return; }
    if (pointers.size > 2) return;
    const t = ev.target;
    // texte en cours de saisie : laisser le navigateur placer le curseur
    if (A.editing && A.editing.el.contains(t)) return;
    // le clavier revient à la diapositive (sinon il resterait sur le volet des miniatures ou les notes)
    if (document.activeElement && document.activeElement !== stage && !(A.editing && A.editing.el === document.activeElement)) { try { stage.focus({ preventScroll: true }); } catch (e) { } }
    if (A.editing && A.editing.cell) { const td = t.closest && t.closest('td'); const n = t.closest && t.closest('.el'); if (td && n && n.dataset.id === A.editing.id) { if (ev.shiftKey) { ev.preventDefault(); A.tableSel.r1 = +td.dataset.r; A.tableSel.c1 = +td.dataset.c; A.markTableSel(); A.refreshUi(); return; } A.stopEdit(); A.startEdit(n.dataset.id, { cell: [+td.dataset.r, +td.dataset.c], at: [ev.clientX, ev.clientY] }); tableDrag(ev, n.dataset.id, +td.dataset.r, +td.dataset.c); return; } }
    const hd = t.closest && t.closest('.hd');
    if (hd) { ev.preventDefault(); ev.stopPropagation(); return handleDrag(ev, hd.dataset.h); }
    if (A.drawMode) { ev.preventDefault(); return drawStart(ev); }
    const id = hitEl(t);
    const touch = ev.pointerType === 'touch';
    if (touch) { clearTimeout(longT); longT = setTimeout(() => { pointers.clear(); A.contextMenu(ev.clientX, ev.clientY, id); }, 560); }
    if (!id) {
      if (A.painter) { A.painter = null; A.refreshUi(); }
      if (A.cropping) { A.cropping = null; A.renderOverlay(); A.refreshUi(); }
      if (A.editing) A.stopEdit();
      if (t.closest && t.closest('.ph-pic')) return;
      // vide : rectangle de sélection
      if (!ev.shiftKey && !O.modKey(ev)) { A.sel = []; A.tableSel = null; if (A.groupIn) { A.groupIn = null; A.renderCanvas(); } }
      A.renderOverlay(); A.refreshUi();
      if (touch) return;
      marquee(ev); return;
    }
    const e = A.get(id);
    // double-clic / double-toucher
    const now = Date.now();
    const dbl = lastTap.id === id && now - lastTap.t < 380; lastTap = { t: now, id };
    if (A.painter) { ev.preventDefault(); A.applyPainter(id); return; }
    if (dbl) { ev.preventDefault(); clearTimeout(longT); A.activate(id, ev); return; }
    if (e && e.type === 'placeholder' && !O.modKey(ev)) { A.select([id]); return; }
    if (ev.shiftKey || O.modKey(ev)) { ev.preventDefault(); A.select([id], true); return; }
    if (A.sel.indexOf(id) < 0) A.select([id]);
    else if (A.editing) A.stopEdit();
    // clic dans le texte d'une zone déjà sélectionnée : saisie directe (comme dans les logiciels de présentation)
    if (A.sel.length === 1 && e && (e.type === 'text' || e.type === 'shape') && !e.locked && wasSelected(id) && t.closest('.el-tx') && !touch) {
      ev.preventDefault(); A.startEdit(id, { at: [ev.clientX, ev.clientY] }); return;
    }
    if (e && e.type === 'table' && wasSelected(id) && t.closest('td') && !touch) { ev.preventDefault(); const td = t.closest('td'); A.startEdit(id, { cell: [+td.dataset.r, +td.dataset.c], at: [ev.clientX, ev.clientY] }); tableDrag(ev, id, +td.dataset.r, +td.dataset.c); return; }
    markSelected(id);
    // clic sans glisser dans le texte d'une zone de texte (ou dans un espace réservé vide) : saisie directe
    const clickEdit = e && e.type === 'text' && !e.locked && A.sel.length === 1 && !touch && (RT.isEmpty(e.html) || t.closest('.el-tx-in'));
    if (A.selEls().some((x) => x.locked)) return;
    ev.preventDefault();
    moveDrag(ev, clickEdit ? () => A.startEdit(id, { at: [ev.clientX, ev.clientY] }) : null);
  }
  let selTime = {};
  function markSelected(id) { selTime[id] = Date.now(); }
  function wasSelected(id) { return selTime[id] && Date.now() - selTime[id] > 350; }
  function tableDrag(ev, id, r, c) {
    O.drag(ev, { threshold: 6, move: (dx, dy, e2) => { const el = document.elementFromPoint(e2.clientX, e2.clientY); const td = el && el.closest('td'); if (td && td.closest('.el') && td.closest('.el').dataset.id === id) { if (A.editing) { A.stopEdit(); A.sel = [id]; } A.tableSel = { id, r0: r, c0: c, r1: +td.dataset.r, c1: +td.dataset.c }; A.markTableSel(); A.refreshUi(); } } });
  }
  /** Double-clic : texte → saisie ; tableau → cellule ; groupe → ouvrir ; graphique, SmartArt, équation → éditeur */
  A.activate = function (id, ev) {
    const e = A.get(id); if (!e) return;
    if (e.locked) { O.toast('Élément verrouillé (Organiser › Déverrouiller)'); return; }
    if (e.type === 'group') { A.groupIn = id; A.sel = []; A.renderCanvas(); const inner = hitEl(ev.target); A.sel = inner && inner !== id ? [inner] : []; A.renderOverlay(); A.refreshUi(); return; }
    if (e.type === 'text' || e.type === 'shape') { A.startEdit(id, { at: ev ? [ev.clientX, ev.clientY] : null }); return; }
    if (e.type === 'table') { const td = ev && ev.target.closest && ev.target.closest('td'); A.startEdit(id, { cell: td ? [+td.dataset.r, +td.dataset.c] : [0, 0], at: ev ? [ev.clientX, ev.clientY] : null }); return; }
    if (e.type === 'chart') { A.cmd.chartData(); return; }
    if (e.type === 'smartart') { A.cmd.smartText(); return; }
    if (e.type === 'equation') { A.cmd.equation(e); return; }
    if (e.type === 'image') { A.cmd.crop(); return; }
    if (e.type === 'placeholder') { A.cmd.insertImage(e); return; }
    if (e.type === 'icon') { A.cmd.changeIcon(); return; }
    if (e.type === 'video' || e.type === 'audio') { A.cmd.mediaOptions(); return; }
  };
  function marquee(ev) {
    const p0 = A.toSlide(ev.clientX, ev.clientY);
    const base = (ev.shiftKey || O.modKey(ev)) ? A.sel.slice() : [];
    let box = null;
    O.drag(ev, {
      move: (dx, dy, e2) => {
        const p1 = A.toSlide(e2.clientX, e2.clientY);
        const r = { x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), w: Math.abs(p1[0] - p0[0]), h: Math.abs(p1[1] - p0[1]) };
        if (!box) { box = O.h('div', { cls: 'marquee' }); overlay.appendChild(box); }
        Object.assign(box.style, { left: r.x * A.zoom + 'px', top: r.y * A.zoom + 'px', width: r.w * A.zoom + 'px', height: r.h * A.zoom + 'px' });
        const inside = A.els().filter((e) => { if (A.view !== 'master' && e.decor) return false; const b = A.bbox([e]); return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h; }).map((e) => e.id);
        A.sel = base.concat(inside.filter((id) => base.indexOf(id) < 0));
        A.renderOverlay(); overlay.appendChild(box);
      },
      end: () => { if (box) box.remove(); A.renderOverlay(); A.refreshUi(); }
    });
  }

  /* ----- magnétisme : repères intelligents, grille ----- */
  function snapTargets(exclude) {
    const W = A.slideW(), H = A.slideH(), xs = [[0, 'b'], [W / 2, 'c'], [W, 'b']], ys = [[0, 'b'], [H / 2, 'c'], [H, 'b']];
    if (A.settings.guides !== false) A.els().forEach((e) => { if (exclude.indexOf(e.id) >= 0) return; const b = A.bbox([e]); xs.push([b.x, 'e'], [b.x + b.w / 2, 'e'], [b.x + b.w, 'e']); ys.push([b.y, 'e'], [b.y + b.h / 2, 'e'], [b.y + b.h, 'e']); });
    return { xs, ys };
  }
  function snapBox(b, tg, noSnap, edges) {
    let dx = 0, dy = 0; const th = 7 / A.zoom, guides = [];
    if (noSnap || !A.settings.snap) return { dx, dy, guides };
    const ex = edges ? edges.x : [b.x, b.x + b.w / 2, b.x + b.w], ey = edges ? edges.y : [b.y, b.y + b.h / 2, b.y + b.h];
    let best = th, bx = null;
    ex.forEach((v) => tg.xs.forEach((t) => { const d = t[0] - v; if (Math.abs(d) < best) { best = Math.abs(d); bx = [d, t[0]]; } }));
    best = th; let by = null;
    ey.forEach((v) => tg.ys.forEach((t) => { const d = t[0] - v; if (Math.abs(d) < best) { best = Math.abs(d); by = [d, t[0]]; } }));
    if (bx) { dx = bx[0]; guides.push(['v', bx[1]]); }
    else if (A.settings.grid && A.settings.gridSize) { const g = A.settings.gridSize; dx = Math.round(ex[0] / g) * g - ex[0]; }
    if (by) { dy = by[0]; guides.push(['h', by[1]]); }
    else if (A.settings.grid && A.settings.gridSize) { const g = A.settings.gridSize; dy = Math.round(ey[0] / g) * g - ey[0]; }
    return { dx, dy, guides };
  }
  function drawGuides(gs) {
    O.$$('.guide', overlay).forEach((g) => g.remove());
    gs.forEach((g) => { const d = O.h('div', { cls: 'guide ' + g[0] }); if (g[0] === 'v') Object.assign(d.style, { left: g[1] * A.zoom + 'px', top: '-2000px', height: '6000px' }); else Object.assign(d.style, { top: g[1] * A.zoom + 'px', left: '-2000px', width: '6000px' }); overlay.appendChild(d); });
  }
  function tip(text, cx, cy) { let t = overlay.querySelector('.size-tip'); if (!t) { t = O.h('div', { cls: 'size-tip' }); overlay.appendChild(t); } const r = overlay.getBoundingClientRect(); t.textContent = text; t.style.left = (cx - r.left + 14) + 'px'; t.style.top = (cy - r.top + 14) + 'px'; }
  const cm = (px) => O.round(px / 96 * 2.54, 2).toString().replace('.', ',');

  function moveDrag(ev, onClick) {
    const els = A.selEls(); if (!els.length) return;
    const start = els.map((e) => ({ e, x: e.x, y: e.y }));
    const b0 = A.bbox(els), tg = snapTargets(A.sel);
    const nodes = els.map((e) => canvas.querySelector('.el[data-id="' + e.id + '"]'));
    let dup = false;
    O.drag(ev, {
      threshold: ev.pointerType === 'touch' ? 6 : 3,
      move: (dx, dy, e2) => {
        clearTimeout(longT);
        let mx = dx / A.zoom, my = dy / A.zoom;
        if (e2.shiftKey) { if (Math.abs(mx) > Math.abs(my)) my = 0; else mx = 0; }
        const sn = snapBox({ x: b0.x + mx, y: b0.y + my, w: b0.w, h: b0.h }, tg, e2.altKey);
        mx += sn.dx; my += sn.dy;
        dup = O.modKey(e2) && !e2.shiftKey;
        start.forEach((s, i) => { s.e.x = s.x + mx; s.e.y = s.y + my; if (nodes[i]) { nodes[i].style.left = s.e.x + 'px'; nodes[i].style.top = s.e.y + 'px'; } });
        A.updateConnectors(true);
        A.renderOverlay(); drawGuides(sn.guides);
        tip(cm(b0.x + mx) + ' cm ; ' + cm(b0.y + my) + ' cm', e2.clientX, e2.clientY);
      },
      end: (dx, dy, e2, moved) => {
        drawGuides([]); const t = overlay.querySelector('.size-tip'); if (t) t.remove();
        if (!moved) { if (onClick) onClick(); return; }
        if (dup) { // Ctrl + glisser : copie
          const map = {}; const copies = start.map((s) => { const c = P.cloneEl(s.e, map); s.e.x = s.x; s.e.y = s.y; return c; });
          const list = A.els(); copies.forEach((c) => list.push(c)); A.sel = copies.map((c) => c.id);
          if (A.view !== 'master') { const sl = A.slide(); sl.anims = (sl.anims || []).concat(P.animsFor(sl.anims, map).filter((a) => P.findEl(sl, a.el))); }
          A.change('Copie par glisser'); return;
        }
        A.updateConnectors();
        A.change('Déplacement');
      }
    });
  }
  function handleDrag(ev, h) {
    const e = A.one();
    if (h === 'la' || h === 'lb') return lineEndDrag(ev, e, h);
    if (/^adj/.test(h)) return adjDrag(ev, e, +h.slice(3));
    if (/^crop/.test(h)) return cropDrag(ev, h.slice(4));
    if (h === 'rot') return rotDrag(ev);
    if (A.sel.length > 1) return multiResize(ev, h);
    if (!e) return;
    const off = A.offset(e);
    const a0 = { x: e.x + off.dx, y: e.y + off.dy, w: e.w, h: e.h, rot: e.rot || 0 };
    const hx = /e/.test(h) ? 1 : /w/.test(h) ? -1 : 0, hy = /s/.test(h) ? 1 : /n/.test(h) ? -1 : 0;
    const t = a0.rot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    const cx0 = a0.x + a0.w / 2, cy0 = a0.y + a0.h / 2;
    const ratio = a0.w / Math.max(1, a0.h);
    const keep = (e.type === 'image' || e.type === 'icon' || e.type === 'video' || e.type === 'audio' || e.type === 'equation' || e.lockRatio) && hx && hy;
    const tg = snapTargets([e.id]);
    const startEl = O.clone(e);
    O.drag(ev, {
      threshold: 1,
      move: (dx, dy, e2) => {
        const p = A.toSlide(e2.clientX, e2.clientY);
        const fromCenter = e2.altKey;
        const ax = fromCenter ? 0 : -hx * a0.w / 2, ay = fromCenter ? 0 : -hy * a0.h / 2;
        const AX = cx0 + ax * c - ay * s, AY = cy0 + ax * s + ay * c;
        const vx = (p[0] - AX) * c + (p[1] - AY) * s, vy = -(p[0] - AX) * s + (p[1] - AY) * c;
        let w = hx ? Math.max(4, (fromCenter ? 2 : 1) * hx * vx) : a0.w, hh = hy ? Math.max(4, (fromCenter ? 2 : 1) * hy * vy) : a0.h;
        if ((keep && !e2.shiftKey) || (!keep && e2.shiftKey && hx && hy)) { const k = Math.max(w / a0.w, hh / a0.h); w = a0.w * k; hh = a0.h * k; }
        else if (e2.shiftKey && (!hx || !hy) && (e.type === 'image' || e.lockRatio)) { if (hx) hh = w / ratio; else w = hh * ratio; }
        let lx = fromCenter ? 0 : hx * w / 2, ly = fromCenter ? 0 : hy * hh / 2;
        let ncx = AX + lx * c - ly * s, ncy = AY + lx * s + ly * c;
        let nx = ncx - w / 2, ny = ncy - hh / 2;
        // magnétisme des bords déplacés (sans rotation)
        if (!a0.rot && !e2.altKey && A.settings.snap) {
          const ex = hx > 0 ? [nx + w] : hx < 0 ? [nx] : [], ey = hy > 0 ? [ny + hh] : hy < 0 ? [ny] : [];
          const sn = snapBox({ x: nx, y: ny, w, h: hh }, tg, false, { x: ex, y: ey });
          if (hx > 0) w += sn.dx; else if (hx < 0) { nx += sn.dx; w -= sn.dx; }
          if (hy > 0) hh += sn.dy; else if (hy < 0) { ny += sn.dy; hh -= sn.dy; }
          drawGuides(sn.guides);
        }
        A.setGeom(e, { x: nx - off.dx, y: ny - off.dy, w, h: hh }, startEl);
        const node = canvas.querySelector('.el[data-id="' + e.id + '"]');
        if (node) { const fresh = document.createElement('div'); fresh.innerHTML = P.elementHtml(e, A.doc, { mode: 'edit' }); node.replaceWith(fresh.firstChild); }
        A.updateConnectors(true);
        A.renderOverlay();
        tip(cm(w) + ' × ' + cm(hh) + ' cm', e2.clientX, e2.clientY);
      },
      end: (dx, dy, e2, moved) => { drawGuides([]); const tp = overlay.querySelector('.size-tip'); if (tp) tp.remove(); if (moved) { A.updateConnectors(); if (e.autofit === 'shrink') delete e.fit; A.change('Redimensionnement'); } }
    });
  }
  /** Nouvelle géométrie d'un élément ; un groupe met ses enfants à l'échelle */
  A.setGeom = function (e, g, startEl) {
    const s0 = startEl || O.clone(e);
    if (e.type === 'group' && s0.children) {
      const kx = g.w / Math.max(1, s0.w), ky = g.h / Math.max(1, s0.h);
      const scaleKids = (kids, src) => kids.forEach((k, i) => { const o = src[i]; k.x = o.x * kx; k.y = o.y * ky; k.w = o.w * kx; k.h = o.h * ky; if (k.children && o.children) scaleKids(k.children, o.children); });
      scaleKids(e.children, s0.children);
    }
    if (e.type === 'table' && s0.cols) { const kx = g.w / Math.max(1, s0.w), ky = g.h / Math.max(1, s0.h); e.cols = s0.cols.map((w) => w * kx); e.rows.forEach((r, i) => { r.h = (s0.rows[i].h || 40) * ky; }); }
    e.x = g.x; e.y = g.y; e.w = g.w; e.h = g.h;
  };
  function multiResize(ev, h) {
    const els = A.selEls(), b0 = A.bbox(els), st = els.map((e) => O.clone(e));
    const fx = /w/.test(h) ? b0.x + b0.w : b0.x, fy = /n/.test(h) ? b0.y + b0.h : b0.y;
    O.drag(ev, {
      move: (dx, dy, e2) => {
        const p = A.toSlide(e2.clientX, e2.clientY);
        let kx = Math.max(0.05, Math.abs(p[0] - fx) / b0.w), ky = Math.max(0.05, Math.abs(p[1] - fy) / b0.h);
        if (!e2.shiftKey) kx = ky = Math.max(kx, ky);
        els.forEach((e, i) => { const s = st[i]; A.setGeom(e, { x: fx + (s.x - fx) * kx * (/w/.test(h) ? 1 : 1), y: fy + (s.y - fy) * ky, w: s.w * kx, h: s.h * ky }, s); });
        A.renderCanvas(); A.renderOverlay();
      },
      end: (a, b, c, moved) => { if (moved) A.change('Redimensionnement'); }
    });
  }
  function rotDrag(ev) {
    const els = A.selEls(); if (!els.length) return;
    const b = A.bbox(els), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const st = els.map((e) => ({ e, rot: e.rot || 0, x: e.x, y: e.y }));
    const p0 = A.toSlide(ev.clientX, ev.clientY), a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
    O.drag(ev, {
      threshold: 1,
      move: (dx, dy, e2) => {
        const p = A.toSlide(e2.clientX, e2.clientY);
        let da = (Math.atan2(p[1] - cy, p[0] - cx) - a0) * 180 / Math.PI;
        st.forEach((s) => {
          let r = s.rot + da; if (e2.shiftKey) r = Math.round(r / 15) * 15; else { const m = ((r % 90) + 90) % 90; if (m < 3 || m > 87) r = Math.round(r / 90) * 90; }
          r = ((r % 360) + 360) % 360; s.e.rot = O.round(r, 1);
          if (els.length > 1) { const real = s.e.rot - s.rot, t = real * Math.PI / 180; const ex = s.x + s.e.w / 2 - cx, ey = s.y + s.e.h / 2 - cy; s.e.x = cx + ex * Math.cos(t) - ey * Math.sin(t) - s.e.w / 2; s.e.y = cy + ex * Math.sin(t) + ey * Math.cos(t) - s.e.h / 2; }
        });
        A.renderCanvas(); A.renderOverlay(); tip(Math.round(els[0].rot) + '°', e2.clientX, e2.clientY);
      },
      end: (a, b2, c, moved) => { const tp = overlay.querySelector('.size-tip'); if (tp) tp.remove(); if (moved) A.change('Rotation'); }
    });
  }
  function adjDrag(ev, e, k) {
    const off = A.offset(e), a = A.abs(e);
    const kind = e.type === 'image' ? e.mask : e.shape;
    O.drag(ev, {
      threshold: 1,
      move: (dx, dy, e2) => {
        const p = A.toSlide(e2.clientX, e2.clientY);
        // coordonnées locales (rotation)
        const cx = a.x + a.w / 2, cy = a.y + a.h / 2, t = -(a.rot || 0) * Math.PI / 180;
        const lx = (p[0] - cx) * Math.cos(t) - (p[1] - cy) * Math.sin(t) + a.w / 2, ly = (p[0] - cx) * Math.sin(t) + (p[1] - cy) * Math.cos(t) + a.h / 2;
        const hs = P.shapeHandles(kind, e.w, e.h, e.adj); if (!hs[k]) return;
        e.adj = Object.assign({}, P.DEFAULT_ADJ[kind] || {}, e.adj || {}, hs[k].set(e.flipH ? e.w - lx : lx, e.flipV ? e.h - ly : ly));
        A.renderCanvas(); A.renderOverlay();
      },
      end: (a1, b, c, moved) => { void off; if (moved) A.change('Réglage de la forme'); }
    });
  }
  function lineEndDrag(ev, e, which) {
    const off = A.offset(e);
    const [p0, p1] = P.lineEnds(e);
    let A0 = [e.x + off.dx + p0[0], e.y + off.dy + p0[1]], B0 = [e.x + off.dx + p1[0], e.y + off.dy + p1[1]];
    if (e.rot) { const cx = e.x + off.dx + e.w / 2, cy = e.y + off.dy + e.h / 2, t = e.rot * Math.PI / 180; const r = (p) => [cx + (p[0] - cx) * Math.cos(t) - (p[1] - cy) * Math.sin(t), cy + (p[0] - cx) * Math.sin(t) + (p[1] - cy) * Math.cos(t)]; A0 = r(A0); B0 = r(B0); e.rot = 0; }
    const tg = snapTargets([e.id]);
    O.drag(ev, {
      threshold: 1,
      move: (dx, dy, e2) => {
        let p = A.toSlide(e2.clientX, e2.clientY);
        const other = which === 'la' ? B0 : A0;
        if (e2.shiftKey) { const ang = Math.atan2(p[1] - other[1], p[0] - other[0]), q = Math.round(ang / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(p[0] - other[0], p[1] - other[1]); p = [other[0] + Math.cos(q) * d, other[1] + Math.sin(q) * d]; }
        // accroche aux points de connexion des formes
        let site = null; O.$$('.conn-site', overlay).forEach((n) => n.remove());
        if (!e2.altKey) {
          A.els().forEach((o) => {
            if (o.id === e.id || o.type === 'line' || o.decor) return;
            const ss = A.sites(o); const near = ss.some((s) => Math.hypot(s[0] - p[0], s[1] - p[1]) < 60 / A.zoom);
            if (near) ss.forEach((s, k) => { const d = O.h('i', { cls: 'conn-site' }); d.style.left = s[0] * A.zoom + 'px'; d.style.top = s[1] * A.zoom + 'px'; overlay.appendChild(d); if (Math.hypot(s[0] - p[0], s[1] - p[1]) < 10 / A.zoom) site = { el: o.id, site: k, p: s }; });
          });
        }
        if (site) p = site.p;
        else if (!e2.shiftKey) { const sn = snapBox({ x: p[0], y: p[1], w: 0, h: 0 }, tg, e2.altKey, { x: [p[0]], y: [p[1]] }); p = [p[0] + sn.dx, p[1] + sn.dy]; drawGuides(sn.guides); }
        const a = which === 'la' ? p : A0, b = which === 'la' ? B0 : p;
        A.setLine(e, a, b, off);
        e.conn = e.conn || {}; e.conn[which === 'la' ? 'a' : 'b'] = site ? { el: site.el, site: site.site } : null;
        A.renderCanvas(); A.renderOverlay();
      },
      end: (a, b, c, moved) => { drawGuides([]); O.$$('.conn-site', overlay).forEach((n) => n.remove()); if (moved) A.change('Ligne modifiée'); }
    });
  }
  A.setLine = function (e, a, b, off) {
    off = off || { dx: 0, dy: 0 };
    e.x = Math.min(a[0], b[0]) - off.dx; e.y = Math.min(a[1], b[1]) - off.dy; e.w = Math.abs(b[0] - a[0]); e.h = Math.abs(b[1] - a[1]);
    e.flipH = a[0] > b[0]; e.flipV = a[1] > b[1];
  };
  /** Points de connexion (milieux des côtés, rotation comprise) */
  A.sites = function (o) {
    const a = A.abs(o), cx = a.x + a.w / 2, cy = a.y + a.h / 2, t = (a.rot || 0) * Math.PI / 180;
    return [[0, -a.h / 2], [a.w / 2, 0], [0, a.h / 2], [-a.w / 2, 0]].map((v) => [cx + v[0] * Math.cos(t) - v[1] * Math.sin(t), cy + v[0] * Math.sin(t) + v[1] * Math.cos(t)]);
  };
  /** Les connecteurs suivent les formes qu'ils relient */
  A.updateConnectors = function (live) {
    const s = A.slide(); let any = false;
    P.walk(s.elements, (e) => {
      if (e.type !== 'line' || !e.conn) return;
      const [p0, p1] = P.lineEnds(e); const off = A.offset(e);
      let a = [e.x + off.dx + p0[0], e.y + off.dy + p0[1]], b = [e.x + off.dx + p1[0], e.y + off.dy + p1[1]];
      if (e.conn.a) { const o = A.get(e.conn.a.el); if (o) a = A.sites(o)[e.conn.a.site]; else e.conn.a = null; }
      if (e.conn.b) { const o = A.get(e.conn.b.el); if (o) b = A.sites(o)[e.conn.b.site]; else e.conn.b = null; }
      A.setLine(e, a, b, off); any = true;
      if (live) { const n = canvas.querySelector('.el[data-id="' + e.id + '"]'); if (n) { const d = document.createElement('div'); d.innerHTML = P.elementHtml(e, A.doc, { mode: 'edit' }); n.replaceWith(d.firstChild); } }
    });
    return any;
  };

  /* ----- rognage ----- */
  function cropOverlay() {
    const e = A.get(A.cropping); if (!e) return '';
    const z = A.zoom, a = A.abs(e), c = e.crop || { l: 0, t: 0, r: 0, b: 0 };
    const iw = e.w / (1 - c.l - c.r), ih = e.h / (1 - c.t - c.b);
    let h = '<div class="sel-box" style="left:' + a.x * z + 'px;top:' + a.y * z + 'px;width:' + a.w * z + 'px;height:' + a.h * z + 'px;transform:rotate(' + a.rot + 'deg);transform-origin:50% 50%;border-color:#111">';
    h += '<img class="crop-ghost" src="' + P.mediaUrl(e.media) + '" style="left:' + (-c.l * iw * z) + 'px;top:' + (-c.t * ih * z) + 'px;width:' + iw * z + 'px;height:' + ih * z + 'px">';
    const W = a.w * z, H = a.h * z;
    [['nw', 0, 0], ['n', W / 2, 0], ['ne', W, 0], ['e', W, H / 2], ['se', W, H], ['s', W / 2, H], ['sw', 0, H], ['w', 0, H / 2]].forEach((p) => { h += '<i class="hd crop" data-h="crop' + p[0] + '" style="left:' + p[1] + 'px;top:' + p[2] + 'px;cursor:' + cursorFor(p[0], a.rot) + '"></i>'; });
    return h + '</div>';
  }
  function cropDrag(ev, h) {
    const e = A.get(A.cropping); if (!e) return;
    const c0 = Object.assign({ l: 0, t: 0, r: 0, b: 0 }, e.crop), g0 = { x: e.x, y: e.y, w: e.w, h: e.h };
    const iw = g0.w / (1 - c0.l - c0.r), ih = g0.h / (1 - c0.t - c0.b);
    O.drag(ev, {
      threshold: 1,
      move: (dx, dy) => {
        const mx = dx / A.zoom, my = dy / A.zoom; const c = Object.assign({}, c0); let { x, y, w, h: hh } = g0;
        if (/w/.test(h)) { const d = O.clamp(mx, -c0.l * iw, g0.w - 10); c.l = c0.l + d / iw; x = g0.x + d; w = g0.w - d; }
        if (/e/.test(h)) { const d = O.clamp(mx, -g0.w + 10, c0.r * iw); c.r = c0.r - d / iw; w = g0.w + d; }
        if (/n/.test(h)) { const d = O.clamp(my, -c0.t * ih, g0.h - 10); c.t = c0.t + d / ih; y = g0.y + d; hh = g0.h - d; }
        if (/s/.test(h)) { const d = O.clamp(my, -g0.h + 10, c0.b * ih); c.b = c0.b - d / ih; hh = g0.h + d; }
        e.crop = c; e.x = x; e.y = y; e.w = w; e.h = hh;
        A.renderCanvas(); A.renderOverlay();
      },
      end: (a, b, c2, moved) => { if (moved) A.change('Rognage', { keepCanvas: false }); }
    });
  }

  /* ----- dessin (zone de texte, forme, ligne, forme libre) ----- */
  function drawStart(ev) {
    const dm = A.drawMode, p0 = A.toSlide(ev.clientX, ev.clientY);
    if (dm.kind === 'freeform') {
      const ptsL = [p0]; let path = null;
      O.drag(ev, {
        threshold: 0,
        move: (dx, dy, e2) => { ptsL.push(A.toSlide(e2.clientX, e2.clientY)); if (!path) { path = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); path.setAttribute('style', 'position:absolute;left:0;top:0;overflow:visible'); path.innerHTML = '<path fill="none" stroke="#E8590C" stroke-width="2"/>'; overlay.appendChild(path); } path.firstChild.setAttribute('d', 'M' + ptsL.map((p) => p[0] * A.zoom + ',' + p[1] * A.zoom).join(' L')); },
        end: () => { if (path) path.remove(); A.drawMode = null; if (ptsL.length > 2) A.cmd.addFreeform(ptsL, dm); A.refreshUi(); }
      });
      return;
    }
    let ghost = null;
    O.drag(ev, {
      threshold: 0,
      move: (dx, dy, e2) => {
        let p = A.toSlide(e2.clientX, e2.clientY);
        if (e2.shiftKey && dm.kind !== 'line') { const s = Math.max(Math.abs(p[0] - p0[0]), Math.abs(p[1] - p0[1])); p = [p0[0] + Math.sign(p[0] - p0[0] || 1) * s, p0[1] + Math.sign(p[1] - p0[1] || 1) * s]; }
        if (!ghost) { ghost = O.h('div', { cls: 'marquee' }); overlay.appendChild(ghost); }
        Object.assign(ghost.style, { left: Math.min(p0[0], p[0]) * A.zoom + 'px', top: Math.min(p0[1], p[1]) * A.zoom + 'px', width: Math.abs(p[0] - p0[0]) * A.zoom + 'px', height: Math.abs(p[1] - p0[1]) * A.zoom + 'px' });
        ghost._p = p;
      },
      end: (dx, dy, e2, moved) => {
        if (ghost) ghost.remove();
        const p = ghost && ghost._p || p0;
        A.drawMode = null;
        A.cmd.addDrawn(dm, p0, p, moved && Math.hypot(p[0] - p0[0], p[1] - p0[1]) > 4);
      }
    });
  }

  /* ---------------- Règles et grille ---------------- */
  A.drawRulers = function () {
    const wa = $('#workarea'); if (!wa) return;
    wa.classList.toggle('norulers', !A.settings.rulers);
    if (!A.settings.rulers) return;
    const dpr = devicePixelRatio || 1;
    const draw = (host, horiz) => {
      let c = host.querySelector('canvas'); if (!c) { c = document.createElement('canvas'); host.appendChild(c); }
      const L = horiz ? host.clientWidth : host.clientHeight, S = 20; c.width = (horiz ? L : S) * dpr; c.height = (horiz ? S : L) * dpr; c.style.width = (horiz ? L : S) + 'px'; c.style.height = (horiz ? S : L) + 'px';
      const x = c.getContext('2d'); x.scale(dpr, dpr);
      const cs = getComputedStyle(document.documentElement); x.fillStyle = cs.getPropertyValue('--o-tx3') || '#888'; x.strokeStyle = x.fillStyle; x.font = '9px system-ui';
      const sr = stage.getBoundingClientRect(), cr = canvas.getBoundingClientRect(), hr = host.getBoundingClientRect();
      const origin = horiz ? cr.left - hr.left : cr.top - hr.top;
      const unit = 96 / 2.54 * A.zoom; // 1 cm à l'écran
      const step = unit < 14 ? 2 : 1;
      const len = (horiz ? A.slideW() : A.slideH()) / (96 / 2.54);
      // centre = 0 (comme les règles des logiciels de présentation)
      const mid = len / 2;
      for (let k = -Math.ceil(mid); k <= Math.ceil(mid); k++) {
        const pos = origin + (k + mid) * unit; if (pos < 0 || pos > L) continue;
        const big = k % step === 0;
        x.beginPath(); if (horiz) { x.moveTo(pos + 0.5, S); x.lineTo(pos + 0.5, big ? 8 : 14); } else { x.moveTo(S, pos + 0.5); x.lineTo(big ? 8 : 14, pos + 0.5); } x.stroke();
        if (big) { if (horiz) x.fillText(String(Math.abs(k)), pos + 2, 8); else { x.save(); x.translate(8, pos - 2); x.rotate(-Math.PI / 2); x.fillText(String(Math.abs(k)), 0, 0); x.restore(); } }
        if (unit > 30) for (let q = 1; q < 4; q++) { const pp = pos + q * unit / 4; if (pp > L) break; x.beginPath(); if (horiz) { x.moveTo(pp + 0.5, S); x.lineTo(pp + 0.5, S - 3); } else { x.moveTo(S, pp + 0.5); x.lineTo(S - 3, pp + 0.5); } x.stroke(); }
      }
      void sr;
    };
    draw($('#rulerH'), true); draw($('#rulerV'), false);
  };
  A.drawGrid = function () {
    let g = $('#gridLayer'); if (!g) return;
    if (!A.settings.grid) { g.style.display = 'none'; return; }
    const s = A.settings.gridSize * A.zoom;
    Object.assign(g.style, { display: 'block', left: canvas.style.left, top: canvas.style.top, width: canvas.style.width, height: canvas.style.height, backgroundImage: 'radial-gradient(circle,#0006 1px,transparent 1.2px)', backgroundSize: s + 'px ' + s + 'px', backgroundPosition: '-' + (s / 2) + 'px -' + (s / 2) + 'px', zIndex: 2 });
  };

  /* ---------------- Zoom ---------------- */
  A.setZoom = function (z, at) {
    const old = A.zoom; A.fit = z === 'fit';
    if (z !== 'fit') A.zoom = O.clamp(z, 0.1, 4);
    const sx = stage.scrollLeft, sy = stage.scrollTop;
    A.layoutStage();
    if (at && z !== 'fit') { const r = stage.getBoundingClientRect(); const px = at[0] - r.left, py = at[1] - r.top; stage.scrollLeft = (sx + px) * A.zoom / old - px; stage.scrollTop = (sy + py) * A.zoom / old - py; }
    A.renderOverlay(); A.refreshUi();
  };

  /* ---------------- Clavier ---------------- */
  function nudge(dx, dy) {
    const els = A.selEls().filter((e) => !e.locked); if (!els.length) return;
    els.forEach((e) => { e.x += dx; e.y += dy; }); A.updateConnectors();
    A.renderCanvas(); A.renderOverlay();
    clearTimeout(nudge.t); nudge.t = setTimeout(() => A.change('Déplacement', { keepCanvas: true }), 400);
  }
  A.keysInit = function () {
    const inEditor = () => !O.dialogOpen() && !O.menuOpen() && A.view !== 'sorter' && !$('#backstage').classList.contains('on') && !A.showing && document.activeElement !== $('#notesEd') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#thumbs, #pane, .o-ribbon, #titlebar'));
    const canEd = () => !O.dialogOpen() && !$('#backstage').classList.contains('on') && !A.showing;
    O.keys({
      'delete': () => { if (!inEditor() || A.editing) return false; if (!A.sel.length) return false; A.cmd.del(); },
      'backspace': () => { if (!inEditor() || A.editing) return false; if (!A.sel.length) return false; A.cmd.del(); },
      'arrowleft': (e) => { if (!inEditor() || A.editing || !A.sel.length) return false; nudge(e.shiftKey ? -10 : -1, 0); },
      'arrowright': () => { if (!inEditor() || A.editing || !A.sel.length) return false; nudge(1, 0); },
      'arrowup': () => { if (!inEditor() || A.editing || !A.sel.length) return false; nudge(0, -1); },
      'arrowdown': () => { if (!inEditor() || A.editing || !A.sel.length) return false; nudge(0, 1); },
      'shift+arrowleft': () => { if (!inEditor() || A.editing || !A.sel.length) return false; nudge(-10, 0); },
      'shift+arrowright': () => { if (!inEditor() || A.editing || !A.sel.length) return false; nudge(10, 0); },
      'shift+arrowup': () => { if (!inEditor() || A.editing || !A.sel.length) return false; nudge(0, -10); },
      'shift+arrowdown': () => { if (!inEditor() || A.editing || !A.sel.length) return false; nudge(0, 10); },
      'pageup': () => { if (!inEditor() || A.editing) return false; A.goto(A.cur - 1); },
      'pagedown': () => { if (!inEditor() || A.editing) return false; A.goto(A.cur + 1); },
      'tab': () => { if (!inEditor() || A.editing) return false; const l = A.els().filter((e) => !e.decor); if (!l.length) return false; const i = A.sel.length ? l.findIndex((e) => e.id === A.sel[0]) : -1; A.select([l[(i + 1) % l.length].id]); },
      'shift+tab': () => { if (!inEditor() || A.editing) return false; const l = A.els().filter((e) => !e.decor); if (!l.length) return false; const i = A.sel.length ? l.findIndex((e) => e.id === A.sel[0]) : 0; A.select([l[(i - 1 + l.length) % l.length].id]); },
      'enter': () => { if (!inEditor() || A.editing || A.sel.length !== 1) return false; const e = A.one(); if (!e) return false; if (A.cropping) { A.cropping = null; A.renderOverlay(); A.refreshUi(); return; } if (e.type === 'text' || e.type === 'shape') A.startEdit(e.id, { selectAll: false }); else if (e.type === 'group') { A.groupIn = e.id; A.sel = []; A.renderCanvas(); A.renderOverlay(); } else A.activate(e.id); },
      'f2': () => { if (!inEditor() || A.editing || A.sel.length !== 1) return false; A.startEdit(A.sel[0], { selectAll: true }); },
      'escape': () => {
        if (O.dialogOpen() || O.menuOpen() || A.showing) return false;
        if ($('#backstage').classList.contains('on')) { A.closeBackstage(); return; }
        if (A.drawMode) { A.drawMode = null; stage.style.cursor = ''; A.refreshUi(); return; }
        if (A.painter) { A.painter = null; A.refreshUi(); return; }
        if (A.cropping) { A.cropping = null; A.renderOverlay(); A.refreshUi(); return; }
        if (A.editing) { const id = A.editing.id; A.stopEdit(); A.sel = [id]; A.renderOverlay(); return; }
        if (A.groupIn) { const g = A.groupIn; A.groupIn = null; A.sel = [g]; A.renderCanvas(); A.renderOverlay(); A.refreshUi(); return; }
        if (A.sel.length) { A.clearSel(); return; }
        return false;
      },
      'mod+z': () => { if (!canEd()) return false; A.undo(); },
      'mod+y': () => { if (!canEd()) return false; A.redo(); },
      'mod+shift+z': () => { if (!canEd()) return false; A.redo(); },
      'mod+a': () => { if (!inEditor() || A.editing) return false; A.sel = A.els().filter((e) => !e.decor).map((e) => e.id); A.renderOverlay(); A.refreshUi(); },
      'mod+d': () => { if (!canEd() || A.editing) return false; if (A.sel.length) A.cmd.duplicate(); else A.cmd.dupSlide(); },
      'mod+g': () => { if (!inEditor() || A.editing) return false; A.cmd.group(); },
      'mod+shift+g': () => { if (!inEditor() || A.editing) return false; A.cmd.ungroup(); },
      'mod+m': () => { if (!canEd()) return false; A.cmd.newSlide(); },
      'mod+b': () => { if (!canEd()) return false; A.fmt('bold'); },
      'mod+i': () => { if (!canEd()) return false; A.fmt('italic'); },
      'mod+u': () => { if (!canEd()) return false; A.fmt('underline'); },
      'mod+e': () => { if (!canEd()) return false; A.fmt('align', 'center'); },
      'mod+l': () => { if (!canEd()) return false; A.fmt('align', 'left'); },
      'mod+r': () => { if (!canEd()) return false; A.fmt('align', 'right'); },
      'mod+j': () => { if (!canEd()) return false; A.fmt('align', 'justify'); },
      'mod+]': () => { if (!canEd()) return false; A.fmt('grow'); },
      'mod+[': () => { if (!canEd()) return false; A.fmt('shrink'); },
      'mod+shift+>': () => { if (!canEd()) return false; A.fmt('grow'); },
      'mod+shift+<': () => { if (!canEd()) return false; A.fmt('shrink'); },
      'mod+shift+c': () => { if (!canEd()) return false; A.cmd.painter(false, true); },
      'mod+shift+v': () => { if (!canEd() || A.editing) return false; A.cmd.pastePainter(); },
      'mod+k': () => { if (!canEd()) return false; A.cmd.link(); },
      'mod+f': () => { if (!canEd()) return false; A.cmd.find(); },
      'mod+h': () => { if (!canEd()) return false; A.cmd.find(true); },
      'mod+s': () => { A.cmd.save(); },
      'mod+shift+s': () => { A.cmd.saveAs(); },
      'mod+o': () => { A.cmd.open(); },
      'mod+n': () => { A.cmd.newDoc(); },
      'mod+p': () => { A.cmd.print(); },
      'mod+0': () => { if (!canEd()) return false; A.setZoom('fit'); },
      'mod+=': () => { if (!canEd()) return false; A.setZoom(A.zoom * 1.15); },
      'mod++': () => { if (!canEd()) return false; A.setZoom(A.zoom * 1.15); },
      'mod+-': () => { if (!canEd()) return false; A.setZoom(A.zoom / 1.15); },
      'mod+f1': () => { A.ribbon.setCollapsed(!A.ribbon.collapsed); },
      'alt+q': () => { A.ribbon.focusSearch(); },
      'f5': () => { if (!canEd()) return false; A.cmd.showFrom(0); },
      'shift+f5': () => { if (!canEd()) return false; A.cmd.showFrom(A.cur); },
      'alt+f5': () => { if (!canEd()) return false; A.cmd.presenter(); },
      'f1': () => { A.cmd.shortcuts(); },
      'mod+alt+n': () => { if (!canEd()) return false; A.cmd.comment(); },
      'shift+f10': () => { if (!inEditor()) return false; const b = A.sel.length ? A.bbox(A.selEls()) : { x: 100, y: 100, w: 0, h: 0 }; const r = canvas.getBoundingClientRect(); A.contextMenu(r.left + (b.x + b.w / 2) * A.zoom, r.top + (b.y + b.h / 2) * A.zoom, A.sel[0]); }
    });
    // saisie directe sur une zone de texte sélectionnée
    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || !inEditor() || A.editing || e.ctrlKey || e.metaKey || e.altKey || A.sel.length !== 1) return;
      if (e.key.length !== 1) return;
      const el = A.one(); if (!el || (el.type !== 'text' && el.type !== 'shape') || el.locked) return;
      e.preventDefault(); A.startEdit(el.id, { selectAll: false, text: e.key });
    });
  };

  /* ---------------- Presse-papier ---------------- */
  const MARK = 'magpres-clip:';
  A.copySel = function (cut) {
    const els = A.selEls(); if (!els.length) return null;
    const ids = new Set(); P.walk(els, (x) => ids.add(x.id));
    const data = { kind: 'elements', from: A.slide().id, els: O.clone(els), media: {}, anims: O.clone((A.view === 'master' ? [] : A.slide().anims || []).filter((a) => ids.has(a.el))) };
    els.forEach((e) => P.walk([e], (x) => { [x.media, x.poster, x.orig, x.fill && x.fill.media].forEach((m) => { if (m && A.doc.media[m]) data.media[m] = A.doc.media[m]; }); }));
    A.clip = { data, blobs: Object.assign({}, P.blobs) };
    if (cut) A.cmd.del('Couper');
    return data;
  };
  function onCopy(ev, cut) {
    const ae = document.activeElement;
    if (A.editing || A.showing || O.dialogOpen() || (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA)$/.test(ae.tagName)))) return;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#thumbs, #sorter')) { ev.preventDefault(); A.cmd.copySlides(cut); return; }
    if (!A.sel.length) return;
    ev.preventDefault();
    const d = A.copySel(cut);
    const text = d.els.map((e) => e.html ? RT.textOf(e.html) : '').filter(Boolean).join('\n\n');
    ev.clipboardData.setData('text/plain', text);
    ev.clipboardData.setData('text/html', '<!--' + MARK + Date.now() + '-->' + d.els.map((e) => e.html || '').join(''));
    O.toast(cut ? 'Coupé' : 'Copié', { ms: 900 });
  }
  async function onPaste(ev) {
    const ae = document.activeElement;
    if (A.editing || A.showing || O.dialogOpen() || (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)))) return;
    if ($('#backstage').classList.contains('on')) return;
    const dt = ev.clipboardData; if (!dt) return;
    ev.preventDefault();
    const html = dt.getData('text/html'), text = dt.getData('text/plain');
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#thumbs, #sorter') && A.slideClip) { A.cmd.pasteSlides(); return; }
    if (html && html.indexOf(MARK) >= 0 && A.clip) { A.pasteClip(); return; }
    if (html && html.indexOf('magpres-slides:') >= 0 && A.slideClip) { A.cmd.pasteSlides(); return; }
    const files = Array.from(dt.files || []).filter((f) => /^image\//.test(f.type));
    if (files.length) { A.insertImages(files); return; }
    if (html && !/^\s*<img[^>]*>\s*$/i.test(html.replace(/<!--.*?-->/g, '').replace(/<\/?(html|body|meta)[^>]*>/gi, ''))) { const clean = RT.sanitize(html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '')); if (!RT.isEmpty(clean)) { A.cmd.addTextBox(clean); return; } }
    if (text && text.trim()) {
      const u = text.trim();
      if (/^https?:\/\/\S+$/.test(u) && P.ytId(u)) { A.cmd.addVideoLink(u); return; }
      A.cmd.addTextBox(RT.fromText(text)); return;
    }
  }
  A.pasteClip = function () {
    const c = A.clip; if (!c) return;
    Object.keys(c.data.media).forEach((m) => { if (!A.doc.media[m]) { A.doc.media[m] = c.data.media[m]; if (c.blobs[m]) P.blobs[m] = c.blobs[m]; } });
    const same = c.data.from === A.slide().id;
    const map = {};
    const copies = c.data.els.map((e) => { const x = P.cloneEl(e, map); delete x.ph; if (same) { x.x += 20; x.y += 20; } if (x.type === 'placeholder') return null; if (x.autofit === 'shrink') x.autofit = 'none'; return x; }).filter(Boolean);
    if (!same && copies.length) { // la même chose placée au même endroit sur une autre diapo
    }
    const list = A.els(); copies.forEach((x) => list.push(x));
    A.sel = copies.map((x) => x.id);
    if (A.view !== 'master' && c.data.anims && c.data.anims.length) { const sl = A.slide(); sl.anims = (sl.anims || []).concat(P.animsFor(c.data.anims, map).filter((a) => P.findEl(sl, a.el))); } // les animations suivent l'objet collé
    if (same) c.data.els = c.data.els.map((e) => Object.assign({}, e, { x: e.x + 20, y: e.y + 20 }));
    A.change('Coller');
  };
  A.insertImages = async function (files, at) {
    for (const f of files) await A.cmd.addImage(f, at);
  };

  /* ---------------- Menu contextuel ---------------- */
  A.contextMenu = function (x, y, id) {
    if (id && A.sel.indexOf(id) < 0) A.select([id]);
    const e = A.one(), any = A.sel.length > 0, C = A.cmd;
    const items = [];
    if (any) items.push({ label: 'Couper', icon: 'scissors', kbd: 'Ctrl+X', on: () => { A.copySel(true); } }, { label: 'Copier', icon: 'copy', kbd: 'Ctrl+C', on: () => { A.copySel(false); O.toast('Copié', { ms: 900 }); } });
    items.push({ label: 'Coller', icon: 'clipboard-paste', kbd: 'Ctrl+V', disabled: !A.clip, on: () => A.pasteClip() });
    if (any) items.push({ label: 'Dupliquer', icon: 'copy-plus', kbd: 'Ctrl+D', on: () => C.duplicate() }, { label: 'Supprimer', icon: 'trash-2', kbd: 'Suppr', on: () => C.del() }, '-');
    if (e && (e.type === 'text' || e.type === 'shape')) items.push({ label: 'Modifier le texte', icon: 'type', on: () => A.startEdit(e.id) });
    if (e && e.type === 'image') items.push({ label: 'Rogner', icon: 'crop', on: () => C.crop() }, { label: 'Changer l\'image…', icon: 'image', on: () => C.replaceImage() }, { label: 'Enregistrer l\'image…', icon: 'download', on: () => C.saveImage() });
    if (e && e.type === 'table') items.push({ label: 'Insérer une ligne dessous', icon: 'between-horizontal-start', on: () => C.tableRow(1) }, { label: 'Insérer une colonne à droite', icon: 'between-vertical-start', on: () => C.tableCol(1) }, { label: 'Fusionner les cellules', icon: 'merge', disabled: !A.tableSel, on: () => C.tableMerge() });
    if (e && e.type === 'chart') items.push({ label: 'Modifier les données…', icon: 'table', on: () => C.chartData() });
    if (e && e.type === 'smartart') items.push({ label: 'Modifier le texte…', icon: 'list', on: () => C.smartText() }, { label: 'Convertir en formes', icon: 'shapes', on: () => C.smartToShapes() });
    if (e && e.type === 'group') items.push({ label: 'Dissocier', icon: 'ungroup', kbd: 'Ctrl+Maj+G', on: () => C.ungroup() });
    if (A.sel.length > 1) items.push({ label: 'Grouper', icon: 'group', kbd: 'Ctrl+G', on: () => C.group() });
    if (any) items.push({ label: 'Premier plan', icon: 'bring-to-front', sub: [{ label: 'Mettre au premier plan', on: () => C.order('front') }, { label: 'Avancer', on: () => C.order('up') }] }, { label: 'Arrière-plan', icon: 'send-to-back', sub: [{ label: 'Mettre à l\'arrière-plan', on: () => C.order('back') }, { label: 'Reculer', on: () => C.order('down') }] });
    if (any) items.push('-', { label: 'Lien…', icon: 'link', kbd: 'Ctrl+K', on: () => C.link() }, { label: 'Texte de remplacement…', icon: 'scan-text', on: () => C.altText() }, { label: e && e.locked ? 'Déverrouiller' : 'Verrouiller', icon: e && e.locked ? 'lock-open' : 'lock', on: () => C.lock() }, { label: 'Reproduire la mise en forme', icon: 'paintbrush', on: () => C.painter() }, { label: 'Ajouter une animation', icon: 'sparkles', on: () => { A.ribbon.select('animations'); } }, { label: 'Format…', icon: 'sliders-horizontal', on: () => A.openPane('format') });
    if (!any) items.push('-', { label: 'Disposition', icon: 'layout-template', sub: P.LAYOUTS.map((l) => ({ label: l.name, checked: A.slide().layout === l.id, on: () => C.layout(l.id) })) }, { label: 'Format de l\'arrière-plan…', icon: 'paint-bucket', on: () => A.openPane('bg') }, { label: 'Nouveau commentaire', icon: 'message-square-plus', on: () => C.comment() }, { label: 'Grille et repères', icon: 'grid-3x3', sub: [{ label: 'Grille', checked: A.settings.grid, on: () => C.toggle('grid') }, { label: 'Repères intelligents', checked: A.settings.guides, on: () => C.toggle('guides') }, { label: 'Règles', checked: A.settings.rulers, on: () => C.toggle('rulers') }] });
    O.menu({ x, y }, items, { title: e ? 'Objet' : 'Diapositive' });
  };

  /* ---------------- Montage ---------------- */
  A.mountEditor = function () {
    stage = $('#stage'); stageIn = $('#stageIn'); canvas = $('#canvas'); overlay = $('#overlay'); thumbsEl = $('#thumbs');
    A.canvasEl = canvas; A.overlayEl = overlay; A.stageEl = stage;
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', (ev) => {
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
      if (pinch && pointers.size === 2) { const v = Array.from(pointers.values()); const d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); A.setZoom(pinch.z * d / pinch.d, [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2]); }
      else if (Math.abs(ev.movementX) + Math.abs(ev.movementY) > 2) clearTimeout(longT);
      // survol
      if (ev.pointerType === 'mouse' && !ev.buttons) { const id = hitEl(ev.target); let hb = overlay.querySelector('.hover-box'); if (id && A.sel.indexOf(id) < 0 && !A.drawMode) { const el = A.get(id); if (el) { const a = A.abs(el); if (!hb) { hb = O.h('div', { cls: 'hover-box' }); overlay.appendChild(hb); } Object.assign(hb.style, { left: a.x * A.zoom + 'px', top: a.y * A.zoom + 'px', width: a.w * A.zoom + 'px', height: a.h * A.zoom + 'px', transform: 'rotate(' + (a.rot || 0) + 'deg)' }); } } else if (hb) hb.remove(); }
    });
    const up = (ev) => { pointers.delete(ev.pointerId); if (pointers.size < 2) pinch = null; clearTimeout(longT); };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('contextmenu', (ev) => { if (A.editing && A.editing.el.contains(ev.target)) return; ev.preventDefault(); const id = hitEl(ev.target); A.contextMenu(ev.clientX, ev.clientY, id); });
    stage.addEventListener('dblclick', (ev) => { if (A.editing && A.editing.el.contains(ev.target)) return; const id = hitEl(ev.target); if (id) { ev.preventDefault(); A.activate(id, ev); } else if (ev.target.closest('.ph-pic')) A.cmd.insertImage(A.get(ev.target.closest('.el').dataset.id)); });
    stage.addEventListener('click', (ev) => { const pp = ev.target.closest('.ph-pic'); if (pp && !A.drawMode) { const n = pp.closest('.el'); A.select([n.dataset.id]); A.cmd.insertImage(A.get(n.dataset.id)); } const a = ev.target.closest('.el-tx-in a'); if (a && !A.editing && O.modKey(ev)) { ev.preventDefault(); A.followLink(a.getAttribute('href')); } });
    stage.addEventListener('wheel', (ev) => { if (!O.modKey(ev)) return; ev.preventDefault(); A.setZoom(A.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1), [ev.clientX, ev.clientY]); }, { passive: false });
    stage.addEventListener('scroll', () => { A.drawRulers(); });
    document.addEventListener('copy', (e) => onCopy(e, false));
    document.addEventListener('cut', (e) => onCopy(e, true));
    document.addEventListener('paste', onPaste);
    document.addEventListener('selectionchange', () => { if (!A.editing) return; const s = getSelection(); if (s.rangeCount && A.editing.el.contains(s.getRangeAt(0).startContainer)) { A._lastRange = s.getRangeAt(0).cloneRange(); A.refreshUi(); } });
    new ResizeObserver(() => { A.layoutStage(); A.renderOverlay(); A.renderThumbs(); }).observe(stage);
    // dépôt de fichiers sur la diapo
    stage.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    stage.addEventListener('drop', (e) => {
      const fl = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (!fl.length) return;
      const media = fl.filter((f) => /^(image|video|audio)\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|bmp|mp4|webm|mov|m4v|ogv|mp3|wav|ogg|m4a)$/i.test(f.name));
      if (!media.length) return; e.preventDefault(); e.stopPropagation();
      const p = A.toSlide(e.clientX, e.clientY);
      media.forEach((f) => { if (/^video\//.test(f.type) || /\.(mp4|webm|mov|m4v|ogv)$/i.test(f.name)) A.cmd.addVideoFile(f); else if (/^audio\//.test(f.type) || /\.(mp3|wav|ogg|m4a)$/i.test(f.name)) A.cmd.addAudioFile(f); else A.cmd.addImage(f, p); });
    }, true);
    A.keysInit();
  };
  A.followLink = function (href) {
    if (!href) return;
    if (/^#slide:/.test(href)) { const i = P.slideIndex(A.doc, href.slice(7)); if (i >= 0) A.goto(i); return; }
    if (/^https?:|^mailto:/.test(href)) { const w = (window.MAGPC && window.MAGPC.nativeOpen) || window.open; w.call(window, href, '_blank', 'noopener'); }
  };
})();
