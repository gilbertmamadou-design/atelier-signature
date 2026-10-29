/* Présentation — commandes (diapositives, objets, insertion, tableaux, graphiques, SmartArt, icônes, médias,
   équations, liens, commentaires, reproduction de la mise en forme, organisation). PresApp.cmd */
(function () {
  'use strict';
  const O = window.Office, RT = O.RichText, P = window.Pres, A = window.PresApp, T = O.Themes;
  const C = A.cmd = {};
  const W = () => A.slideW(), H = () => A.slideH();
  const author = () => { try { return localStorage.getItem('presentation:auteur') || ''; } catch (e) { return ''; } };

  /* ================= Diapositives ================= */
  C.newSlide = function (layout) {
    if (A.editing) A.stopEdit();
    const cur = A.doc.slides[A.cur];
    const lay = layout || (cur ? (cur.layout === 'title' ? 'titleContent' : cur.layout) : 'titleContent');
    const s = P.newSlide(A.doc, lay);
    if (cur && cur.transition && cur.transition.type !== 'none' && A.doc.slides.every((x) => x.transition && x.transition.type === cur.transition.type)) s.transition = O.clone(cur.transition);
    A.doc.slides.splice(A.cur + 1, 0, s); A.cur++; A.sel = []; A.selSlides = [s.id];
    A.change('Nouvelle diapositive'); A.renderNotes();
  };
  C.dupSlide = function () {
    const ids = A.selSlides.length ? A.selSlides : [A.doc.slides[A.cur].id];
    let last = A.cur;
    ids.map((id) => P.slideIndex(A.doc, id)).sort((a, b) => a - b).reverse().forEach((i) => { const c = P.cloneSlide(A.doc.slides[i]); A.doc.slides.splice(i + 1, 0, c); last = Math.max(last, i + 1); });
    A.cur = Math.min(last, A.doc.slides.length - 1); A.selSlides = [A.doc.slides[A.cur].id];
    A.change('Dupliquer la diapositive'); A.renderNotes();
  };
  C.delSlides = function () {
    const ids = A.selSlides.length ? A.selSlides.slice() : [A.doc.slides[A.cur].id];
    if (ids.length >= A.doc.slides.length) { O.toast('Une présentation garde au moins une diapositive', { bad: true }); return; }
    ids.forEach((id) => { const i = P.slideIndex(A.doc, id); if (i >= 0) A.doc.slides.splice(i, 1); (A.doc.sections || []).forEach((s) => { if (s.at === id) s.at = (A.doc.slides[i] || {}).id || null; }); });
    A.doc.sections = (A.doc.sections || []).filter((s) => s.at);
    // dédoublonner les sections qui pointent sur la même diapo
    const seen = {}; A.doc.sections = A.doc.sections.filter((s) => seen[s.at] ? false : (seen[s.at] = 1));
    A.cur = O.clamp(A.cur, 0, A.doc.slides.length - 1); A.selSlides = [A.doc.slides[A.cur].id]; A.sel = [];
    A.change(ids.length > 1 ? 'Supprimer les diapositives' : 'Supprimer la diapositive'); A.renderNotes();
  };
  C.hideSlide = function () {
    const ids = A.selSlides.length ? A.selSlides : [A.doc.slides[A.cur].id];
    const v = !A.doc.slides[P.slideIndex(A.doc, ids[0])].hidden;
    ids.forEach((id) => { const s = A.doc.slides[P.slideIndex(A.doc, id)]; if (s) s.hidden = v; });
    A.change(v ? 'Masquer la diapositive' : 'Afficher la diapositive');
  };
  /** Déplace des diapositives avant l'index « to » (index dans la liste avant déplacement) */
  C.moveSlides = function (ids, to) {
    const moving = A.doc.slides.filter((s) => ids.indexOf(s.id) >= 0);
    if (!moving.length) return;
    const curId = A.doc.slides[A.cur].id;
    const before = A.doc.slides.slice(0, to).filter((s) => ids.indexOf(s.id) < 0).length;
    const rest = A.doc.slides.filter((s) => ids.indexOf(s.id) < 0);
    rest.splice(before, 0, ...moving);
    if (rest.every((s, i) => s === A.doc.slides[i])) return;
    A.doc.slides = rest; A.cur = P.slideIndex(A.doc, curId);
    A.change('Déplacer les diapositives');
  };
  C.layout = function (id) {
    const ids = A.selSlides.length ? A.selSlides : [A.doc.slides[A.cur].id];
    ids.forEach((sid) => { const s = A.doc.slides[P.slideIndex(A.doc, sid)]; if (s) P.applyLayout(A.doc, s, id); });
    A.sel = []; A.change('Disposition');
  };
  C.resetSlide = function () {
    const s = A.doc.slides[A.cur];
    P.applyLayout(A.doc, s, s.layout);
    s.elements.forEach((e) => { if (e.ph) { const b = P.layoutBoxes(s.layout, W(), H()).find((x) => x.ph === e.ph); if (b) Object.assign(e, { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0 }); } });
    A.change('Rétablir la diapositive');
  };
  C.addSection = async function () {
    const name = await O.prompt('Ajouter une section', 'Nom de la section', 'Nouvelle section'); if (name == null) return;
    const s = A.doc.slides[A.cur];
    A.doc.sections = (A.doc.sections || []).filter((x) => x.at !== s.id);
    A.doc.sections.push({ id: P.uid('sec'), name: name || 'Section', at: s.id });
    A.change('Ajouter une section');
  };
  C.sectionMenu = function (secId, at) {
    const sec = (A.doc.sections || []).find((x) => x.id === secId);
    if (!sec) return;
    O.menu(at, [
      { label: 'Renommer la section…', icon: 'pencil', on: async () => { const n = await O.prompt('Renommer la section', 'Nom', sec.name); if (n) { sec.name = n; A.change('Renommer la section'); } } },
      { label: 'Supprimer la section', icon: 'trash-2', on: () => { A.doc.sections = A.doc.sections.filter((x) => x !== sec); A.change('Supprimer la section'); } },
      { label: 'Supprimer la section et ses diapositives', icon: 'trash', danger: true, on: () => { const i0 = P.slideIndex(A.doc, sec.at), n = A.countSec(sec); if (n >= A.doc.slides.length) { O.toast('Impossible : il ne resterait aucune diapositive', { bad: true }); return; } A.selSlides = A.doc.slides.slice(i0, i0 + n).map((s) => s.id); A.doc.sections = A.doc.sections.filter((x) => x !== sec); C.delSlides(); } },
      '-',
      { label: 'Monter la section', icon: 'arrow-up', on: () => moveSection(sec, -1) }, { label: 'Descendre la section', icon: 'arrow-down', on: () => moveSection(sec, 1) },
      { label: sec.closed ? 'Développer' : 'Réduire', icon: sec.closed ? 'chevrons-down' : 'chevrons-up', on: () => { sec.closed = !sec.closed; A.renderThumbs(true); } }
    ], { title: sec.name });
  };
  function moveSection(sec, dir) {
    const secs = (A.doc.sections || []).slice().sort((a, b) => P.slideIndex(A.doc, a.at) - P.slideIndex(A.doc, b.at));
    const k = secs.indexOf(sec), other = secs[k + dir]; if (!other) return;
    const ids = (s) => { const i0 = P.slideIndex(A.doc, s.at); return A.doc.slides.slice(i0, i0 + A.countSec(s)).map((x) => x.id); };
    const mine = ids(sec);
    if (dir < 0) C.moveSlides(mine, P.slideIndex(A.doc, other.at)); else { const o = ids(other); C.moveSlides(o, P.slideIndex(A.doc, sec.at)); }
  }
  C.copySlides = function (cut) {
    const ids = A.selSlides.length ? A.selSlides : [A.doc.slides[A.cur].id];
    const slides = ids.map((id) => O.clone(A.doc.slides[P.slideIndex(A.doc, id)])).filter(Boolean);
    const media = {}; slides.forEach((s) => P.walk(s.elements, (x) => { [x.media, x.poster, x.orig].forEach((m) => { if (m && A.doc.media[m]) media[m] = A.doc.media[m]; }); }));
    A.slideClip = { slides, media, blobs: Object.assign({}, P.blobs) };
    try { navigator.clipboard.writeText(slides.map(P.slideText).join('\n\n')); } catch (e) { }
    O.toast(slides.length + ' diapositive' + (slides.length > 1 ? 's copiées' : ' copiée'), { ms: 1200 });
    if (cut) C.delSlides();
  };
  C.pasteSlides = function () {
    const c = A.slideClip; if (!c) return;
    Object.keys(c.media).forEach((m) => { if (!A.doc.media[m]) { A.doc.media[m] = c.media[m]; if (c.blobs[m]) P.blobs[m] = c.blobs[m]; } });
    const news = c.slides.map(P.cloneSlide);
    A.doc.slides.splice(A.cur + 1, 0, ...news); A.cur += news.length; A.selSlides = news.map((s) => s.id);
    A.change('Coller les diapositives');
  };

  /* ================= Objets ================= */
  C.del = function (label) {
    if (A.editing) return;
    const s = A.slide(); const ids = A.sel.filter((id) => { const e = A.get(id); return e && !e.locked; });
    if (!ids.length) { if (A.sel.length) O.toast('Élément verrouillé'); return; }
    const rm = (list) => { for (let i = list.length - 1; i >= 0; i--) { if (ids.indexOf(list[i].id) >= 0) { const e = list[i]; if (e.ph && A.view !== 'master' && !(label === 'Couper')) { /* un espace réservé vidé revient à son invite */ if (e.type === 'text' && !RT.isEmpty(e.html)) { e.html = ''; continue; } } list.splice(i, 1); } else if (list[i].children) rm(list[i].children); } };
    rm(s.elements);
    s.anims = (s.anims || []).filter((a) => ids.indexOf(a.el) < 0);
    A.sel = []; A.tableSel = null; A.change(label || 'Supprimer');
  };
  C.duplicate = function () {
    const els = A.selEls(); if (!els.length) return;
    const list = A.els(), map = {}; const copies = els.map((e) => { const c = P.cloneEl(e, map); c.x += 20; c.y += 20; delete c.ph; if (c.type === 'placeholder') return null; return c; }).filter(Boolean);
    copies.forEach((c) => list.push(c)); A.sel = copies.map((c) => c.id);
    if (A.view !== 'master') { const s = A.slide(); s.anims = (s.anims || []).concat(P.animsFor(s.anims, map).filter((a) => P.findEl(s, a.el))); } // les animations suivent, comme dans PowerPoint
    A.change('Dupliquer');
  };
  C.group = function () {
    const els = A.selEls(); if (els.length < 2) return;
    const list = A.els(); const b = A.bbox(els);
    const off = A.groupIn ? A.offset(els[0]) : { dx: 0, dy: 0 };
    const kids = list.filter((e) => A.sel.indexOf(e.id) >= 0);
    const pos = list.indexOf(kids[kids.length - 1]);
    const g = { id: P.uid(), type: 'group', x: b.x - off.dx, y: b.y - off.dy, w: b.w, h: b.h, rot: 0, children: kids.map((k) => Object.assign(k, { x: k.x - (b.x - off.dx), y: k.y - (b.y - off.dy) })) };
    kids.forEach((k) => delete k.ph);
    list.splice(pos + 1, 0, g);
    for (let i = list.length - 1; i >= 0; i--) if (kids.indexOf(list[i]) >= 0) list.splice(i, 1);
    A.sel = [g.id]; A.change('Grouper');
  };
  C.ungroup = function () {
    const list = A.els(); const out = [];
    A.selEls().filter((e) => e.type === 'group').forEach((g) => {
      const i = list.indexOf(g); if (i < 0) return;
      const cx = g.x + g.w / 2, cy = g.y + g.h / 2, t = (g.rot || 0) * Math.PI / 180;
      const kids = g.children.map((k) => {
        let x = k.x + g.x, y = k.y + g.y;
        if (g.rot) { const kx = x + k.w / 2 - cx, ky = y + k.h / 2 - cy; x = cx + kx * Math.cos(t) - ky * Math.sin(t) - k.w / 2; y = cy + kx * Math.sin(t) + ky * Math.cos(t) - k.h / 2; k.rot = ((k.rot || 0) + g.rot) % 360; }
        return Object.assign(k, { x, y });
      });
      list.splice(i, 1, ...kids); out.push(...kids.map((k) => k.id));
    });
    if (!out.length) return; A.sel = out; A.change('Dissocier');
  };
  C.order = function (how) {
    const list = A.els(); const sel = list.filter((e) => A.sel.indexOf(e.id) >= 0); if (!sel.length) return;
    if (how === 'front') { sel.forEach((e) => { list.splice(list.indexOf(e), 1); list.push(e); }); }
    else if (how === 'back') { sel.slice().reverse().forEach((e) => { list.splice(list.indexOf(e), 1); list.unshift(e); }); }
    else if (how === 'up') { for (let i = list.length - 2; i >= 0; i--) if (sel.indexOf(list[i]) >= 0 && sel.indexOf(list[i + 1]) < 0) { const t = list[i]; list[i] = list[i + 1]; list[i + 1] = t; } }
    else if (how === 'down') { for (let i = 1; i < list.length; i++) if (sel.indexOf(list[i]) >= 0 && sel.indexOf(list[i - 1]) < 0) { const t = list[i]; list[i] = list[i - 1]; list[i - 1] = t; } }
    A.change('Ordre des plans');
  };
  /** Aligner : sur la diapositive (un objet ou option « par rapport à la diapositive ») ou sur la sélection */
  C.align = function (how) {
    const els = A.selEls().filter((e) => !e.locked); if (!els.length) return;
    const toSlide = els.length === 1 || A.settings.alignSlide;
    const ref = toSlide ? { x: 0, y: 0, w: W(), h: H() } : A.bbox(els);
    els.forEach((e) => {
      const b = A.bbox([e]); let dx = 0, dy = 0;
      if (how === 'left') dx = ref.x - b.x; if (how === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); if (how === 'right') dx = ref.x + ref.w - (b.x + b.w);
      if (how === 'top') dy = ref.y - b.y; if (how === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); if (how === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      e.x += dx; e.y += dy;
    });
    A.updateConnectors(); A.change('Aligner');
  };
  C.distribute = function (axis) {
    const els = A.selEls().filter((e) => !e.locked); if (els.length < 3 && !(A.settings.alignSlide && els.length >= 2)) { O.toast('Sélectionnez au moins trois objets'); return; }
    const k = axis === 'h' ? 'x' : 'y', d = axis === 'h' ? 'w' : 'h';
    const bs = els.map((e) => ({ e, b: A.bbox([e]) })).sort((a, b) => a.b[k] - b.b[k]);
    const first = A.settings.alignSlide ? 0 : bs[0].b[k], last = A.settings.alignSlide ? (axis === 'h' ? W() : H()) : bs[bs.length - 1].b[k] + bs[bs.length - 1].b[d];
    const total = bs.reduce((a, x) => a + x.b[d], 0), gap = (last - first - total) / (bs.length - 1);
    let pos = first; bs.forEach((x) => { x.e[k] += pos - x.b[k]; pos += x.b[d] + gap; });
    A.updateConnectors(); A.change('Distribuer');
  };
  C.lock = function () { const els = A.selEls(); if (!els.length) return; const v = !els[0].locked; els.forEach((e) => { e.locked = v; }); A.change(v ? 'Verrouiller' : 'Déverrouiller'); O.toast(v ? 'Verrouillé : l\'objet ne bouge plus' : 'Déverrouillé'); };
  C.flip = function (axis) { A.selEls().forEach((e) => { if (axis === 'h') e.flipH = !e.flipH; else e.flipV = !e.flipV; }); A.change('Retourner'); };
  C.rotate = function (deg) { A.selEls().forEach((e) => { e.rot = (((e.rot || 0) + deg) % 360 + 360) % 360; }); A.change('Faire pivoter'); };
  C.setProp = function (fn, label) { const els = A.selEls(); if (!els.length) return; els.forEach((e) => fn(e)); A.change(label || 'Format'); };

  /* ================= Insertion ================= */
  function place(e, at) {
    if (at) { e.x = at[0] - e.w / 2; e.y = at[1] - e.h / 2; }
    else { e.x = (W() - e.w) / 2; e.y = (H() - e.h) / 2; }
    e.x = O.clamp(e.x, -e.w * 0.5, W() - e.w * 0.5); e.y = O.clamp(e.y, -e.h * 0.5, H() - e.h * 0.5);
  }
  C.add = function (e, label, opt) {
    if (A.editing) A.stopEdit();
    A.els().push(e); A.sel = [e.id]; A._fresh = e.id;
    if (P.isMediaEl(e) && A.view !== 'master') P.syncMedia(A.slide()); // « au clic » : étape « Lecture » dans les animations
    A.change(label || 'Insérer');
    if (opt && opt.edit) setTimeout(() => A.startEdit(e.id), 30);
    return e;
  };
  C.addTextBox = function (html, at) {
    const e = P.textEl(0, 0, Math.min(W() * 0.5, 560), 60, html || '', { autofit: 'grow' }); place(e, at);
    C.add(e, 'Zone de texte', { edit: !html });
    if (html) setTimeout(() => { A.renderCanvas(); const n = A.canvasEl.querySelector('.el[data-id="' + e.id + '"] .el-tx-in'); if (n) { e.h = Math.max(40, Math.ceil(n.getBoundingClientRect().height / A.zoom) + 10); A.change('Zone de texte', { noHistory: true }); } }, 0);
  };
  C.startDraw = function (kind, shape) {
    A.drawMode = { kind, shape }; A.sel = []; A.renderOverlay();
    A.stageEl.style.cursor = 'crosshair';
    O.toast(kind === 'freeform' ? 'Dessinez la forme sur la diapositive' : O.touch() ? 'Faites glisser pour dessiner, ou touchez pour placer' : 'Cliquez et faites glisser sur la diapositive (Maj : proportions)', { ms: 2200 });
    A.refreshUi();
  };
  C.addDrawn = function (dm, p0, p, dragged) {
    A.stageEl.style.cursor = '';
    const x = Math.min(p0[0], p[0]), y = Math.min(p0[1], p[1]);
    let w = Math.abs(p[0] - p0[0]), h = Math.abs(p[1] - p0[1]);
    if (dm.kind === 'line') {
      if (!dragged) { p = [p0[0] + 200, p0[1]]; }
      const e = P.lineEl(dm.shape, 0, 0, 0, 0); A.setLine(e, p0, p);
      C.add(e, 'Ligne'); return;
    }
    if (dm.kind === 'text') {
      const e = P.textEl(x, y, dragged ? Math.max(w, 40) : 400, dragged ? Math.max(h, 30) : 50, '', { autofit: dragged ? 'none' : 'grow', wrap: true });
      if (!dragged) { e.x = p0[0]; e.y = p0[1]; }
      C.add(e, 'Zone de texte', { edit: true }); return;
    }
    if (!dragged) { w = 180; h = /^(star|ellipse|flowChartConnector|smileyFace|sun|heart|noSmoking|donut|pie|cube|can)/.test(dm.shape) ? 180 : 120; }
    const e = P.shapeEl(dm.shape, dragged ? x : p0[0] - w / 2, dragged ? y : p0[1] - h / 2, w, h);
    C.add(e, 'Forme');
  };
  C.addShape = function (shape) { if (P.isLineShape(shape)) { C.startDraw('line', shape); return; } if (shape === 'freeform') { C.startDraw('freeform'); return; } C.startDraw('shape', shape); };
  C.addFreeform = function (pts, dm) {
    A.stageEl.style.cursor = '';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    // simplification (distance minimale) puis courbes lissées
    const s = [pts[0]]; pts.forEach((p) => { const q = s[s.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 3) s.push(p); });
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const loc = s.map((p) => [O.round(p[0] - x0, 1), O.round(p[1] - y0, 1)]);
    let d = 'M' + loc[0].join(',');
    for (let i = 1; i < loc.length - 1; i++) { const m = [(loc[i][0] + loc[i + 1][0]) / 2, (loc[i][1] + loc[i + 1][1]) / 2]; d += ' Q' + loc[i].join(',') + ' ' + O.round(m[0], 1) + ',' + O.round(m[1], 1); }
    d += ' L' + loc[loc.length - 1].join(',');
    const closed = Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < 20;
    const e = P.shapeEl('custom', x0, y0, w, h, { path: { d: d + (closed ? ' Z' : ''), vw: w, vh: h }, fill: closed ? { type: 'solid', color: 't:accent1/+60' } : null, line: { color: dm && dm.color || 't:accent1', w: 2.25 } });
    C.add(e, 'Forme libre');
  };
  /* ----- images ----- */
  C.addImage = async function (file, at, opt) {
    opt = opt || {};
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) { O.toast('Image trop lourde (60 Mo au plus)', { bad: true }); return; }
    const dims = await P.imageSize(file);
    const id = P.addMedia(A.doc, file, file.name, { w: dims.w, h: dims.h });
    const ph = opt.placeholder || (A.one() && A.one().type === 'placeholder' ? A.one() : null) || (!at && A.slide().elements.find((e) => e.type === 'placeholder'));
    let e;
    if (ph && !opt.free) {
      // l'image remplit l'espace réservé (rognée au besoin)
      e = { id: P.uid(), type: 'image', media: id, x: ph.x, y: ph.y, w: ph.w, h: ph.h, rot: 0, alt: '', crop: coverCrop(dims.w, dims.h, ph.w, ph.h) };
      const list = A.els(); list.splice(list.indexOf(ph), 1, e);
      A.sel = [e.id]; A._fresh = e.id; A.change('Image'); return e;
    }
    const k = Math.min(1, (W() * 0.7) / dims.w, (H() * 0.7) / dims.h);
    e = { id: P.uid(), type: 'image', media: id, x: 0, y: 0, w: Math.round(dims.w * k), h: Math.round(dims.h * k), rot: 0, alt: '' };
    place(e, at);
    return C.add(e, 'Image');
  };
  function coverCrop(iw, ih, w, h) {
    const ri = iw / ih, rb = w / h;
    if (ri > rb) { const keep = rb / ri; return { l: (1 - keep) / 2, r: (1 - keep) / 2, t: 0, b: 0 }; }
    const keep = ri / rb; return { l: 0, r: 0, t: (1 - keep) / 2, b: (1 - keep) / 2 };
  }
  C.insertImage = async function (ph) {
    const files = await O.Files.pickMedia('image/*', true); if (!files.length) return;
    if (ph && ph.type === 'placeholder') { await C.addImage(files[0], null, { placeholder: ph }); files.shift(); }
    for (const f of files) await C.addImage(f, null, { free: true });
  };
  C.replaceImage = async function () {
    const e = A.one(); if (!e || e.type !== 'image') return;
    const f = (await O.Files.pickMedia('image/*', false))[0]; if (!f) return;
    const dims = await P.imageSize(f);
    e.media = P.addMedia(A.doc, f, f.name, { w: dims.w, h: dims.h }); e.crop = coverCrop(dims.w, dims.h, e.w, e.h); delete e.orig;
    A.change('Changer l\'image');
  };
  C.saveImage = async function () {
    const e = A.one(); if (!e) return;
    if (e.type === 'image') { const b = P.blobs[e.media]; if (b) O.Files.export(b, O.safeName(A.doc.media[e.media].name || 'image.png'), { types: [{ description: 'Image', accept: { [b.type || 'image/png']: ['.' + (O.extOf(A.doc.media[e.media].name) || 'png')] } }] }); return; }
    const n = A.canvasEl.querySelector('.el[data-id="' + e.id + '"]'); if (!n) return;
    const blob = await O.Raster.blob(n, { width: e.w, height: e.h, scale: 2 });
    O.Files.export(blob, 'objet.png', { types: [{ description: 'Image PNG', accept: { 'image/png': ['.png'] } }] });
  };
  C.crop = function () { const e = A.one(); if (!e || e.type !== 'image') { O.toast('Sélectionnez une image'); return; } A.cropping = A.cropping ? null : e.id; A.renderOverlay(); A.refreshUi(); if (A.cropping) O.toast('Faites glisser les poignées noires, puis Entrée', { ms: 2500 }); };
  C.cropAspect = function (r) { const e = A.one(); if (!e || e.type !== 'image') return; const m = A.doc.media[e.media] || {}; const iw = m.w || e.w, ih = m.h || e.h; const nw = Math.min(e.w, e.h * r); e.crop = coverCrop(iw, ih, r, 1); e.h = nw / r; e.w = nw; A.change('Rogner au format'); };
  C.cropShape = function (shape) { C.setProp((e) => { if (e.type === 'image') { e.mask = shape === 'rect' ? null : shape; e.adj = null; } }, 'Rogner à la forme'); };
  C.fitImage = function (mode) { const e = A.one(); if (!e || e.type !== 'image') return; const m = A.doc.media[e.media] || {}; if (mode === 'fill') e.crop = coverCrop(m.w || e.w, m.h || e.h, e.w, e.h); else { e.crop = { l: 0, t: 0, r: 0, b: 0 }; const k = Math.min(e.w / (m.w || e.w), e.h / (m.h || e.h)); const nw = (m.w || e.w) * k, nh = (m.h || e.h) * k; e.x += (e.w - nw) / 2; e.y += (e.h - nh) / 2; e.w = nw; e.h = nh; } A.change('Ajuster l\'image'); };
  C.resetImage = function () { C.setProp((e) => { if (e.type !== 'image') return; if (e.orig) { e.media = e.orig; delete e.orig; } e.fx = {}; e.crop = { l: 0, t: 0, r: 0, b: 0 }; e.mask = null; const m = A.doc.media[e.media] || {}; if (m.w) e.h = e.w * m.h / m.w; }, 'Rétablir l\'image'); };
  /** Suppression d'un fond uni : remplissage par diffusion depuis les bords, tolérance réglable */
  C.removeBg = async function (tol) {
    const e = A.one(); if (!e || e.type !== 'image') { O.toast('Sélectionnez une image'); return; }
    const src = P.blobs[e.orig || e.media]; if (!src) return;
    O.toast('Suppression de l\'arrière-plan…', { ms: 1500 });
    const bm = await createImageBitmap(src);
    const k = Math.min(1, 2400 / Math.max(bm.width, bm.height));
    const w = Math.round(bm.width * k), h = Math.round(bm.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(bm, 0, 0, w, h);
    const im = x.getImageData(0, 0, w, h), d = im.data;
    // couleur de fond = moyenne des bords
    let r = 0, g = 0, b = 0, n = 0; const edge = (i) => { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; };
    for (let i = 0; i < w; i++) { edge(i * 4); edge(((h - 1) * w + i) * 4); } for (let j = 0; j < h; j++) { edge(j * w * 4); edge((j * w + w - 1) * 4); }
    r /= n; g /= n; b /= n;
    const T2 = Math.pow((tol || 40) * 2.2, 2);
    const seen = new Uint8Array(w * h), stack = [];
    const push = (p) => { if (!seen[p]) { seen[p] = 1; stack.push(p); } };
    for (let i = 0; i < w; i++) { push(i); push((h - 1) * w + i); } for (let j = 0; j < h; j++) { push(j * w); push(j * w + w - 1); }
    let removed = 0;
    while (stack.length) {
      const p = stack.pop(), i = p * 4; const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b; const dist = dr * dr + dg * dg + db * db;
      if (dist > T2 || d[i + 3] === 0) { if (d[i + 3] === 0) { const px = p % w, py = (p / w) | 0; if (px > 0) push(p - 1); if (px < w - 1) push(p + 1); if (py > 0) push(p - w); if (py < h - 1) push(p + w); } continue; }
      d[i + 3] = dist > T2 * 0.5 ? Math.round(255 * (dist - T2 * 0.5) / (T2 * 0.5)) : 0; removed++;
      const px = p % w, py = (p / w) | 0; if (px > 0) push(p - 1); if (px < w - 1) push(p + 1); if (py > 0) push(p - w); if (py < h - 1) push(p + w);
    }
    if (removed < w * h * 0.01) { O.toast('Aucun fond uni détecté autour de l\'image', { bad: true }); return; }
    x.putImageData(im, 0, 0);
    const out = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!e.orig) e.orig = e.media;
    e.media = P.addMedia(A.doc, out, O.baseName(A.doc.media[e.orig].name) + '-detoure.png', { w, h });
    A.change('Supprimer l\'arrière-plan');
    O.toast('Arrière-plan supprimé (' + Math.round(removed / (w * h) * 100) + ' % de l\'image). « Rétablir l\'image » revient à l\'original.', { ms: 4000 });
  };
  /* ----- tableaux ----- */
  C.addTable = function (rows, cols) {
    const w = Math.min(W() * 0.84, cols * 200), rh = 44;
    const e = { id: P.uid(), type: 'table', x: 0, y: 0, w, h: rows * rh, rot: 0, cols: Array.from({ length: cols }, () => w / cols), rows: Array.from({ length: rows }, () => ({ h: rh, cells: Array.from({ length: cols }, () => ({ html: '' })) })), tstyle: { id: 'medium', accent: 1, header: true, banded: true } };
    place(e); e.y = Math.max(H() * 0.24, e.y);
    C.add(e, 'Tableau');
  };
  C.tableDialog = function () {
    const node = O.h('div');
    node.innerHTML = '<p class="o-hint" style="margin:0 0 8px">Survolez puis cliquez, ou saisissez le nombre de lignes et de colonnes.</p><div class="tgrid" style="display:grid;grid-template-columns:repeat(10,22px);gap:3px;margin-bottom:10px"></div><div class="o-form"><label class="o-field half"><span>Colonnes</span><input class="o-in" id="tc" type="number" min="1" max="30" value="4"></label><label class="o-field half"><span>Lignes</span><input class="o-in" id="tr" type="number" min="1" max="60" value="3"></label></div>';
    const g = node.querySelector('.tgrid');
    for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) { const b = O.h('button', { type: 'button', 'data-r': r + 1, 'data-c': c + 1, style: { width: '22px', height: '22px', border: '1px solid var(--o-line2)', background: 'var(--o-bg2)', borderRadius: '3px', cursor: 'pointer', padding: 0 } }); g.appendChild(b); }
    g.addEventListener('pointerover', (ev) => { const b = ev.target.closest('button'); if (!b) return; O.$$('button', g).forEach((x) => { x.style.background = (+x.dataset.r <= +b.dataset.r && +x.dataset.c <= +b.dataset.c) ? 'var(--o-acc-soft)' : 'var(--o-bg2)'; }); node.querySelector('#tc').value = b.dataset.c; node.querySelector('#tr').value = b.dataset.r; });
    O.dialog({ title: 'Insérer un tableau', body: node, onOpen: (el, close) => { g.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) { close(null); C.addTable(+b.dataset.r, +b.dataset.c); } }); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Insérer', primary: true, value: 1, onClick: () => { C.addTable(O.clamp(+node.querySelector('#tr').value || 3, 1, 60), O.clamp(+node.querySelector('#tc').value || 4, 1, 30)); } }] });
  };
  const tbl = () => { const e = A.tableSel ? A.get(A.tableSel.id) : A.one(); return e && e.type === 'table' ? e : null; };
  function selRect() { const t = A.tableSel; if (!t) return { r0: 0, r1: 0, c0: 0, c1: 0 }; return { r0: Math.min(t.r0, t.r1), r1: Math.max(t.r0, t.r1), c0: Math.min(t.c0, t.c1), c1: Math.max(t.c0, t.c1) }; }
  A.tableCells = function () { const e = tbl(); if (!e) return []; const r = selRect(), out = []; for (let i = r.r0; i <= r.r1; i++) for (let j = r.c0; j <= r.c1; j++) { const c = e.rows[i] && e.rows[i].cells[j]; if (c && !c.hidden) out.push(c); } return out; };
  function unmergeAll(e) { e.rows.forEach((r) => r.cells.forEach((c) => { c.hidden = false; c.rs = 1; c.cs = 1; })); }
  function hasMerge(e) { return e.rows.some((r) => r.cells.some((c) => c.hidden || c.rs > 1 || c.cs > 1)); }
  function finishTable(e, label) { if (A.editing) A.stopEdit(); e.h = e.rows.reduce((a, r) => a + (r.h || 40), 0); e.w = e.cols.reduce((a, b) => a + b, 0); A.change(label); }
  C.tableRow = function (dir) {
    const e = tbl(); if (!e) return; if (hasMerge(e)) unmergeAll(e);
    const r = selRect(); const at = dir < 0 ? r.r0 : r.r1 + 1;
    e.rows.splice(at, 0, { h: (e.rows[Math.min(at, e.rows.length - 1)] || {}).h || 40, cells: e.cols.map(() => ({ html: '' })) });
    finishTable(e, 'Insérer une ligne');
  };
  C.tableCol = function (dir) {
    const e = tbl(); if (!e) return; if (hasMerge(e)) unmergeAll(e);
    const r = selRect(); const at = dir < 0 ? r.c0 : r.c1 + 1;
    const nw = e.w / (e.cols.length + 1); e.cols = e.cols.map((c) => c * e.cols.length / (e.cols.length + 1)); e.cols.splice(at, 0, nw);
    e.rows.forEach((row) => row.cells.splice(at, 0, { html: '' }));
    finishTable(e, 'Insérer une colonne');
  };
  C.tableDel = function (what) {
    const e = tbl(); if (!e) return; if (hasMerge(e)) unmergeAll(e);
    const r = selRect();
    if (what === 'row') { if (r.r1 - r.r0 + 1 >= e.rows.length) { C.del(); return; } e.rows.splice(r.r0, r.r1 - r.r0 + 1); }
    else if (what === 'col') { if (r.c1 - r.c0 + 1 >= e.cols.length) { C.del(); return; } e.cols.splice(r.c0, r.c1 - r.c0 + 1); e.rows.forEach((row) => row.cells.splice(r.c0, r.c1 - r.c0 + 1)); }
    else { C.del(); return; }
    A.tableSel = null; finishTable(e, 'Supprimer');
  };
  C.tableMerge = function () {
    const e = tbl(); const r = selRect(); if (!e || (r.r0 === r.r1 && r.c0 === r.c1)) { O.toast('Sélectionnez plusieurs cellules (glisser ou Maj+clic)'); return; }
    if (A.editing) A.stopEdit();
    const m = e.rows[r.r0].cells[r.c0]; const extra = [];
    for (let i = r.r0; i <= r.r1; i++) for (let j = r.c0; j <= r.c1; j++) { const c = e.rows[i].cells[j]; if (c === m) continue; if (c.html && !RT.isEmpty(c.html)) extra.push(c.html); c.hidden = true; c.html = ''; c.rs = 1; c.cs = 1; }
    m.rs = r.r1 - r.r0 + 1; m.cs = r.c1 - r.c0 + 1; if (extra.length) m.html = (m.html || '') + extra.map((h) => '<div>' + h + '</div>').join('');
    A.tableSel = { id: e.id, r0: r.r0, c0: r.c0, r1: r.r0, c1: r.c0 };
    A.change('Fusionner les cellules');
  };
  C.tableSplit = function () {
    const e = tbl(); if (!e) return; const r = selRect(); const m = e.rows[r.r0].cells[r.c0];
    if (!(m.rs > 1 || m.cs > 1)) { O.toast('Cette cellule n\'est pas fusionnée'); return; }
    for (let i = r.r0; i < r.r0 + (m.rs || 1); i++) for (let j = r.c0; j < r.c0 + (m.cs || 1); j++) { const c = e.rows[i].cells[j]; c.hidden = false; }
    m.rs = 1; m.cs = 1; A.change('Fractionner la cellule');
  };
  C.tableEven = function (what) { const e = tbl(); if (!e) return; if (what === 'cols') { const w = e.w / e.cols.length; e.cols = e.cols.map(() => w); } else { const h = e.h / e.rows.length; e.rows.forEach((r) => { r.h = h; }); } A.change('Répartir'); };
  C.tableStyle = function (patch) { const e = tbl(); if (!e) return; e.tstyle = Object.assign({}, e.tstyle || {}, patch); A.change('Style du tableau'); };
  C.cellProp = function (fn, label) { const cells = A.tableCells(); if (!cells.length) { const e = tbl(); if (e) e.rows.forEach((r) => r.cells.forEach(fn)); } else cells.forEach(fn); A.change(label || 'Cellules'); };
  A.tableMove = function (dir) {
    const ed = A.editing; if (!ed || !ed.cell) return;
    const e = A.get(ed.id); let [r, c] = ed.cell;
    do { c += dir; if (c >= e.cols.length) { c = 0; r++; } if (c < 0) { c = e.cols.length - 1; r--; } } while (r >= 0 && r < e.rows.length && e.rows[r].cells[c].hidden);
    A.stopEdit();
    if (r >= e.rows.length) { e.rows.push({ h: e.rows[e.rows.length - 1].h || 40, cells: e.cols.map(() => ({ html: '' })) }); e.h += e.rows[e.rows.length - 1].h; A.change('Nouvelle ligne'); }
    if (r < 0) r = 0;
    A.startEdit(e.id, { cell: [r, Math.max(0, c)] });
  };
  /* ----- graphiques ----- */
  C.addChart = function (kind) {
    const e = { id: P.uid(), type: 'chart', x: 0, y: 0, w: Math.min(W() * 0.66, 760), h: Math.min(H() * 0.6, 430), rot: 0, chart: P.newChart(kind), alt: '' };
    place(e); e.y = Math.max(H() * 0.22, e.y);
    C.add(e, 'Graphique');
    setTimeout(() => C.chartData(), 50);
  };
  C.chartData = function () {
    const e = A.one(); if (!e || e.type !== 'chart') return;
    const ch = O.clone(e.chart);
    const node = O.h('div');
    const kinds = P.CHART_KINDS.map((k) => '<option value="' + k[0] + '"' + (k[0] === ch.kind ? ' selected' : '') + '>' + k[1] + '</option>').join('');
    node.innerHTML = '<div class="o-form"><label class="o-field half"><span>Type</span><select class="o-in" id="ck">' + kinds + '</select></label><label class="o-field half"><span>Titre</span><input class="o-in" id="ct" value="' + O.esc(ch.title || '') + '"></label></div>' +
      '<p class="o-hint">Première ligne : noms des séries ; première colonne : catégories. Vous pouvez coller un tableau copié depuis un tableur.</p><div class="grid-wrap"><table class="grid-ed"></table></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn" data-a="row+">' + O.icon('plus') + 'Catégorie</button><button type="button" class="mini-btn" data-a="row-">' + O.icon('minus') + 'Catégorie</button><button type="button" class="mini-btn" data-a="col+">' + O.icon('plus') + 'Série</button><button type="button" class="mini-btn" data-a="col-">' + O.icon('minus') + 'Série</button></div>' +
      '<div class="o-form" style="margin-top:10px"><label class="o-field half"><span>Légende</span><select class="o-in" id="cl"><option value="bottom">En bas</option><option value="top">En haut</option><option value="right">À droite</option><option value="none">Aucune</option></select></label><label class="o-field half"><span>Taille du texte</span><input class="o-in" id="cf" type="number" min="8" max="40" value="' + (ch.fontSize || 14) + '"></label>' +
      '<label class="o-check"><input type="checkbox" id="clab"' + (ch.labels ? ' checked' : '') + '><span>Étiquettes de données</span></label><label class="o-check"><input type="checkbox" id="cgr"' + (ch.grid !== false ? ' checked' : '') + '><span>Quadrillage</span></label><label class="o-check"><input type="checkbox" id="csm"' + (ch.smooth ? ' checked' : '') + '><span>Courbes lissées</span></label>' +
      '<label class="o-field half"><span>Titre de l\'axe horizontal</span><input class="o-in" id="cx" value="' + O.esc(ch.xTitle || '') + '"></label><label class="o-field half"><span>Titre de l\'axe vertical</span><input class="o-in" id="cy" value="' + O.esc(ch.yTitle || '') + '"></label></div><div class="chart-pv"></div>';
    const grid = node.querySelector('.grid-ed'), pv = node.querySelector('.chart-pv');
    node.querySelector('#cl').value = ch.legend || 'bottom';
    function draw() {
      let h = '<tr><th></th>' + ch.series.map((s, j) => '<td><input data-s="' + j + '" value="' + O.esc(s.name) + '" aria-label="Nom de la série ' + (j + 1) + '"></td>').join('') + '</tr>';
      ch.cats.forEach((c, i) => { h += '<tr><td><input data-c="' + i + '" value="' + O.esc(c) + '" aria-label="Catégorie ' + (i + 1) + '"></td>' + ch.series.map((s, j) => '<td><input data-v="' + i + ':' + j + '" inputmode="decimal" value="' + O.esc(s.values[i] == null ? '' : String(s.values[i]).replace('.', ',')) + '"></td>').join('') + '</tr>'; });
      grid.innerHTML = h; preview();
    }
    function read() {
      O.$$('input', grid).forEach((i) => { if (i.dataset.s != null) ch.series[+i.dataset.s].name = i.value; else if (i.dataset.c != null) ch.cats[+i.dataset.c] = i.value; else { const [r, s] = i.dataset.v.split(':').map(Number); const v = parseFloat(i.value.replace(',', '.').replace(/\s/g, '')); ch.series[s].values[r] = isNaN(v) ? 0 : v; } });
      ch.kind = node.querySelector('#ck').value; ch.title = node.querySelector('#ct').value; ch.legend = node.querySelector('#cl').value; ch.fontSize = +node.querySelector('#cf').value || 14;
      ch.labels = node.querySelector('#clab').checked; ch.grid = node.querySelector('#cgr').checked; ch.smooth = node.querySelector('#csm').checked; ch.xTitle = node.querySelector('#cx').value; ch.yTitle = node.querySelector('#cy').value;
    }
    function preview() { read(); const pw = Math.min(560, (pv.clientWidth || 520)); const ph = Math.round(pw * e.h / e.w); pv.style.height = ph + 'px'; pv.innerHTML = '<div style="position:absolute;left:0;top:0;transform-origin:0 0;transform:scale(' + (pw / e.w) + ');' + P.slideVars(A.doc) + ';width:' + e.w + 'px;height:' + e.h + 'px;background:var(--t-bg1);font-family:var(--t-minor)">' + P.chartSvg(ch, e.w, e.h, A.doc) + '</div>'; }
    node.addEventListener('input', O.debounce(preview, 200));
    node.addEventListener('change', preview);
    grid.addEventListener('paste', (ev) => {
      const t = ev.clipboardData.getData('text/plain'); if (!t || t.indexOf('\t') < 0 && t.indexOf('\n') < 0) return;
      ev.preventDefault(); const rows = t.replace(/\r/g, '').split('\n').filter((l) => l.length).map((l) => l.split('\t'));
      if (rows.length < 2) return;
      ch.series = rows[0].slice(1).map((n, j) => ({ name: n || 'Série ' + (j + 1), values: rows.slice(1).map((r) => { const v = parseFloat(String(r[j + 1] || '').replace(',', '.').replace(/\s/g, '')); return isNaN(v) ? 0 : v; }) }));
      ch.cats = rows.slice(1).map((r) => r[0]); draw();
    });
    node.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-a]'); if (!b) return; read();
      const a = b.dataset.a;
      if (a === 'row+') { ch.cats.push('Catégorie ' + (ch.cats.length + 1)); ch.series.forEach((s) => s.values.push(0)); }
      if (a === 'row-' && ch.cats.length > 1) { ch.cats.pop(); ch.series.forEach((s) => s.values.pop()); }
      if (a === 'col+') ch.series.push({ name: 'Série ' + (ch.series.length + 1), values: ch.cats.map(() => 0) });
      if (a === 'col-' && ch.series.length > 1) ch.series.pop();
      draw();
    });
    O.dialog({ title: 'Données du graphique', wide: true, body: node, onOpen: () => setTimeout(draw, 0), buttons: [{ label: 'Annuler', value: null }, { label: 'Appliquer', primary: true, value: 1, onClick: () => { read(); e.chart = ch; A.change('Données du graphique'); } }] });
  };
  /* ----- SmartArt ----- */
  C.addSmart = function (kind) {
    const e = Object.assign({ id: P.uid(), type: 'smartart', x: 0, y: 0, w: Math.min(W() * 0.84, 980), h: Math.min(H() * 0.55, 400), rot: 0, alt: '' }, P.newSmart(kind));
    if (kind === 'hierarchy') e.items = [{ text: 'Direction', level: 0 }, { text: 'Équipe A', level: 1 }, { text: 'Équipe B', level: 1 }, { text: 'Équipe C', level: 1 }];
    if (kind === 'list' || kind === 'steps') e.items = [{ text: 'Étape 1', level: 0 }, { text: 'Détail', level: 1 }, { text: 'Étape 2', level: 0 }, { text: 'Détail', level: 1 }, { text: 'Étape 3', level: 0 }];
    if (kind === 'radial') e.items = [{ text: 'Objectif', level: 0 }, { text: 'Qualité', level: 0 }, { text: 'Sécurité', level: 0 }, { text: 'Délais', level: 0 }, { text: 'Coûts', level: 0 }];
    place(e); e.y = Math.max(H() * 0.24, e.y);
    C.add(e, 'SmartArt'); setTimeout(() => C.smartText(), 50);
  };
  C.smartText = function () {
    const e = A.one(); if (!e || e.type !== 'smartart') return;
    const opts = P.SMART_KINDS.map((k) => '<option value="' + k[0] + '"' + (k[0] === e.kind ? ' selected' : '') + '>' + k[1] + '</option>').join('');
    O.dialog({
      title: 'Texte du SmartArt', body: '<div class="o-form"><label class="o-field half"><span>Disposition</span><select class="o-in" id="sk">' + opts + '</select></label><label class="o-field half"><span>Couleurs</span><select class="o-in" id="sp"><option value="accent">Accent 1</option><option value="colorful">Multicolore</option><option value="gradient">Dégradé accent 1 → 2</option><option value="mono">Nuances</option></select></label></div><label class="o-field"><span>Un élément par ligne ; deux espaces (ou Tab) au début = niveau inférieur</span><textarea class="o-in" id="st" rows="9" spellcheck="true" lang="fr"></textarea></label>',
      onOpen: (el) => { const t = el.querySelector('#st'); t.value = P.smartToText(e); el.querySelector('#sp').value = e.palette || 'accent'; t.addEventListener('keydown', (ev) => { if (ev.key === 'Tab') { ev.preventDefault(); const s = t.selectionStart; const ls = t.value.lastIndexOf('\n', s - 1) + 1; if (ev.shiftKey) { if (t.value.slice(ls, ls + 2) === '  ') { t.value = t.value.slice(0, ls) + t.value.slice(ls + 2); t.selectionStart = t.selectionEnd = s - 2; } } else { t.value = t.value.slice(0, ls) + '  ' + t.value.slice(ls); t.selectionStart = t.selectionEnd = s + 2; } } }); },
      buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: 1, onClick: (c, w) => { const items = P.smartFromText(w.querySelector('#st').value); if (!items.length) { O.toast('Saisissez au moins un élément', { bad: true }); return false; } e.items = items; e.kind = w.querySelector('#sk').value; e.palette = w.querySelector('#sp').value; A.change('SmartArt'); } }]
    });
  };
  C.smartToShapes = function () {
    const e = A.one(); if (!e || e.type !== 'smartart') return;
    const L = P.smartLayout(e, e.w, e.h, A.doc), kids = [];
    L.links.forEach((l) => { for (let i = 0; i < l.pts.length - 1; i++) { const ln = P.lineEl('line', 0, 0, 0, 0, { line: { color: L.line, w: 1.5 } }); A.setLine(ln, l.pts[i], l.pts[i + 1]); kids.push(ln); } });
    L.nodes.forEach((n) => { const s = P.shapeEl(n.shape, n.x, n.y, n.w, n.h, { rot: n.rot || 0, adj: n.adj, fill: n.fill ? { type: 'solid', color: n.fill, alpha: n.alpha } : null, line: n.line ? { color: n.line, w: 1 } : null, txColor: n.tx, html: n.text ? String(n.text).split('\n').map((l) => '<div style="text-align:' + (n.align || 'center') + '"><span style="font-size:' + O.round(n.fs * 0.75, 1) + 'pt">' + O.esc(l) + '</span></div>').join('') : '', va: n.va || 'middle' }); kids.push(s); });
    const g = { id: P.uid(), type: 'group', x: e.x, y: e.y, w: e.w, h: e.h, rot: e.rot || 0, children: kids };
    const list = A.els(); list.splice(list.indexOf(e), 1, g); A.sel = [g.id]; A.change('Convertir en formes');
  };
  /* ----- icônes ----- */
  C.iconDialog = function (cb, cur) {
    const node = O.h('div');
    node.innerHTML = '<input class="o-in" type="search" placeholder="Rechercher (en français ou en anglais) : casque, échelle, sécurité, flèche…" autofocus><p class="o-hint" style="margin:6px 0">Jeu d\'icônes libre Lucide (licence ISC), hors ligne. ' + O.iconNames().length + ' icônes.</p><div class="ic-grid"></div>';
    const grid = node.querySelector('.ic-grid'), q = node.querySelector('input');
    const draw = () => { const l = O.searchIcons(q.value, 360); grid.innerHTML = l.map((n) => '<button type="button" data-n="' + n + '" title="' + n + '"' + (n === cur ? ' class="on"' : '') + '>' + O.icon(n) + '</button>').join('') || '<p class="o-hint">Aucune icône</p>'; };
    q.addEventListener('input', O.debounce(draw, 150)); draw();
    O.dialog({ title: 'Insérer une icône', wide: true, body: node, onOpen: (el, close) => { grid.addEventListener('click', (ev) => { const b = ev.target.closest('[data-n]'); if (b) { close(null); cb(b.dataset.n); } }); }, buttons: [{ label: 'Fermer', value: null }] });
  };
  C.addIcon = function () { C.iconDialog((n) => { const e = { id: P.uid(), type: 'icon', icon: n, x: 0, y: 0, w: 120, h: 120, rot: 0, color: 't:accent1', sw: 2, alt: n }; place(e); C.add(e, 'Icône'); }); };
  C.changeIcon = function () { const e = A.one(); if (!e || e.type !== 'icon') return; C.iconDialog((n) => { e.icon = n; if (!e.alt || e.alt === e.icon) e.alt = n; A.change('Changer l\'icône'); }, e.icon); };
  /* ----- vidéo et audio ----- */
  C.addVideoFile = async function (file) {
    if (!file) { file = (await O.Files.pickMedia('video/*,.mp4,.webm,.mov,.m4v,.ogv', false))[0]; if (!file) return; }
    if (file.size > 400 * 1024 * 1024) { O.toast('Vidéo trop lourde (400 Mo au plus)', { bad: true }); return; }
    const id = P.addMedia(A.doc, file, file.name);
    const e = { id: P.uid(), type: 'video', media: id, x: 0, y: 0, w: 640, h: 360, rot: 0, name: file.name, alt: O.baseName(file.name), play: 'seq' };
    place(e); C.add(e, 'Vidéo');
    // proportions réelles et image d'aperçu
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = P.mediaUrl(id);
    v.addEventListener('loadeddata', () => { if (isFinite(v.duration)) e.mediaDur = O.round(v.duration, 2); if (v.videoWidth) { const k = Math.min(640 / v.videoWidth, 360 / v.videoHeight); e.w = Math.round(v.videoWidth * k); e.h = Math.round(v.videoHeight * k); } v.currentTime = Math.min(1, (v.duration || 2) / 3); }, { once: true });
    v.addEventListener('seeked', () => { try { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); c.toBlob((b) => { if (b) { e.poster = P.addMedia(A.doc, b, 'apercu.jpg'); A.change('Vidéo', { noHistory: true }); } }, 'image/jpeg', 0.85); } catch (er) { } }, { once: true });
    v.addEventListener('error', () => O.toast('Format vidéo non lisible par le navigateur (préférez MP4 H.264 ou WebM)', { bad: true }), { once: true });
  };
  C.addVideoLink = function (url) {
    const go = (u) => { const id = P.ytId(u); if (!id) { O.toast('Lien YouTube non reconnu', { bad: true }); return; } const e = { id: P.uid(), type: 'video', url: 'https://www.youtube.com/watch?v=' + id, start: P.ytStart(u), x: 0, y: 0, w: 640, h: 360, rot: 0, alt: 'Vidéo YouTube', play: 'seq' }; place(e); C.add(e, 'Vidéo en ligne'); };
    if (url) { go(url); return; }
    O.prompt('Vidéo en ligne (YouTube)', 'Adresse de la vidéo', '', { hint: 'La vidéo est lue par le lecteur officiel de YouTube (youtube-nocookie.com), seulement pendant le diaporama et s\'il y a une connexion. Rien n\'est téléchargé.' }).then((u) => { if (u) go(u.trim()); });
  };
  C.addAudioFile = async function (file) {
    if (!file) { file = (await O.Files.pickMedia('audio/*,.mp3,.wav,.ogg,.m4a', false))[0]; if (!file) return; }
    const id = P.addMedia(A.doc, file, file.name);
    const e = { id: P.uid(), type: 'audio', media: id, x: W() - 120, y: H() - 120, w: 64, h: 64, rot: 0, name: file.name, color: 't:accent1', autoplay: false, play: 'seq', alt: O.baseName(file.name) };
    const au = new Audio(); au.preload = 'metadata'; au.src = P.mediaUrl(id); au.addEventListener('loadedmetadata', () => { if (isFinite(au.duration)) e.mediaDur = O.round(au.duration, 2); }, { once: true });
    C.add(e, 'Son');
  };
  P.MEDIA_STARTS = [['seq', 'Au clic'], ['auto', 'Automatiquement'], ['click', 'En cliquant dessus']]; // comme PowerPoint : « au clic » = dans la séquence des clics
  /** Démarrage d'une vidéo ou d'un son (comme PowerPoint) ; la séquence des animations suit */
  C.setMediaStart = function (mode, els) {
    els = els || A.selEls().filter(P.isMediaEl); if (!els.length) return;
    els.forEach((e) => { e.play = mode; e.autoplay = mode === 'auto'; });
    if (A.view !== 'master') P.syncMedia(A.slide());
    A.change('Démarrer la lecture');
  };
  C.mediaOptions = function () {
    const e = A.one(); if (!e || (e.type !== 'video' && e.type !== 'audio')) return;
    const isV = e.type === 'video', yt = isV && e.url;
    O.form(isV ? 'Options de la vidéo' : 'Options du son', [
      { id: 'play', type: 'select', label: 'Démarrer', value: P.mediaStart(e), options: P.MEDIA_STARTS },
      ...(isV && !yt ? [{ id: 'full', type: 'check', label: 'Lire en plein écran', value: !!e.full }] : []),
      { id: 'loop', type: 'check', label: 'En boucle jusqu\'à l\'arrêt', value: !!e.loop },
      ...(!yt ? [{ id: 'rewind', type: 'check', label: 'Rembobiner après la lecture', value: !!e.rewind }] : []),
      ...(isV && !yt ? [{ id: 'muted', type: 'check', label: 'Sans le son', value: !!e.muted }] : []),
      ...(!isV ? [{ id: 'hide', type: 'check', label: 'Masquer l\'icône pendant le diaporama', value: !!e.hideInShow }, { id: 'across', type: 'check', label: 'Continuer sur les diapositives suivantes', value: !!e.across }] : []),
      { id: 'start', type: 'number', label: 'Début (secondes)', value: e.start || 0, min: 0, half: true },
      ...(isV && !yt ? [{ id: 'end', type: 'number', label: 'Fin (secondes, 0 = jusqu\'au bout)', value: e.end || 0, min: 0, half: true }] : []),
      ...(yt ? [{ id: 'url', type: 'text', label: 'Adresse YouTube', value: e.url }] : [])
    ]).then((r) => {
      if (!r) return;
      e.play = r.play; e.autoplay = r.play === 'auto'; e.loop = r.loop;
      if ('full' in r) e.full = r.full; if ('rewind' in r) e.rewind = r.rewind; if ('muted' in r) e.muted = r.muted;
      if ('hide' in r) { e.hideInShow = r.hide; e.across = r.across; } e.start = r.start || 0; if ('end' in r) e.end = r.end || 0; if (r.url && P.ytId(r.url)) e.url = r.url;
      if (A.view !== 'master') P.syncMedia(A.slide());
      A.change('Options du média');
    });
  };
  C.posterFromFrame = function () {
    const e = A.one(); if (!e || e.type !== 'video' || !e.media) return;
    const v = A.canvasEl.querySelector('.el[data-id="' + e.id + '"] video'); if (!v || !v.videoWidth) { O.toast('Image indisponible'); return; }
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((b) => { e.poster = P.addMedia(A.doc, b, 'apercu.jpg'); A.change('Image d\'aperçu'); }, 'image/jpeg', 0.88);
  };
  /* ----- équations (KaTeX) ----- */
  const SYMS = [['\\frac{a}{b}', 'a/b'], ['x^{2}', 'x²'], ['x_{i}', 'xᵢ'], ['\\sqrt{x}', '√'], ['\\sqrt[n]{x}', 'ⁿ√'], ['\\sum_{i=1}^{n}', 'Σ'], ['\\int_{a}^{b}', '∫'], ['\\lim_{x \\to \\infty}', 'lim'], ['\\pi', 'π'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\Delta', 'Δ'], ['\\theta', 'θ'], ['\\lambda', 'λ'], ['\\mu', 'μ'], ['\\sigma', 'σ'], ['\\Omega', 'Ω'], ['\\times', '×'], ['\\div', '÷'], ['\\pm', '±'], ['\\leq', '≤'], ['\\geq', '≥'], ['\\neq', '≠'], ['\\approx', '≈'], ['\\infty', '∞'], ['\\rightarrow', '→'], ['\\Rightarrow', '⇒'], ['\\cdot', '·'], ['^{\\circ}', '°'], ['\\left( x \\right)', '( )'], ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 'matrice'], ['\\vec{F}', 'vecteur'], ['\\overline{x}', 'x̄'], ['\\text{texte}', 'texte']];
  C.equation = async function (existing) {
    await A.loadKatex();
    const e = existing && existing.type === 'equation' ? existing : null;
    const node = O.h('div');
    node.innerHTML = '<div class="eq-sym">' + SYMS.map((s, i) => '<button type="button" data-i="' + i + '" title="' + O.esc(s[0]) + '">' + O.esc(s[1]) + '</button>').join('') + '</div><label class="o-field"><span>Équation (notation LaTeX)</span><textarea class="o-in" id="eqt" rows="3" spellcheck="false" style="font-family:Consolas,monospace"></textarea></label><div class="eq-pv"></div>' +
      '<div class="o-form" style="margin-top:10px"><label class="o-field half"><span>Taille (pt)</span><input class="o-in" id="eqs" type="number" min="8" max="120" value="' + (e ? e.size || 28 : 32) + '"></label><label class="o-field half"><span>Exemples</span><select class="o-in" id="eqx"><option value="">—</option><option>E = mc^{2}</option><option>x = \\frac{-b \\pm \\sqrt{b^{2}-4ac}}{2a}</option><option>a^{2} + b^{2} = c^{2}</option><option>P = \\rho \\cdot g \\cdot h</option><option>F = m \\cdot a</option><option>S = \\pi r^{2}</option><option>\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}</option></select></label></div>';
    const ta = node.querySelector('#eqt'), pv = node.querySelector('.eq-pv');
    ta.value = e ? e.tex : 'a^{2} + b^{2} = c^{2}';
    const draw = () => { pv.innerHTML = P.katexHtml(ta.value, true) || O.esc(ta.value); };
    ta.addEventListener('input', O.debounce(draw, 120)); draw();
    node.querySelector('#eqx').addEventListener('change', (ev) => { if (ev.target.value) { ta.value = ev.target.value; draw(); } });
    node.querySelector('.eq-sym').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; const s = SYMS[+b.dataset.i][0]; const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + s + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = p + s.length; draw(); });
    O.dialog({ title: e ? 'Modifier l\'équation' : 'Insérer une équation', wide: true, body: node, enter: false, buttons: [{ label: 'Annuler', value: null }, { label: e ? 'Appliquer' : 'Insérer', primary: true, value: 1, onClick: () => {
      const tex = ta.value.trim(); if (!tex) return false; const size = +node.querySelector('#eqs').value || 28;
      // taille de la boîte d'après le rendu
      const probe = O.h('div', { style: { position: 'fixed', left: '-9999px', top: '0', fontSize: size + 'pt', whiteSpace: 'nowrap' } }, P.katexHtml(tex, true)); document.body.appendChild(probe);
      const r = probe.getBoundingClientRect(); probe.remove();
      if (e) { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; e.tex = tex; e.size = size; e.w = Math.ceil(r.width + 20); e.h = Math.ceil(r.height + 12); e.x = cx - e.w / 2; e.y = cy - e.h / 2; A.change('Équation'); }
      else { const n = { id: P.uid(), type: 'equation', tex, size, color: 't:tx1', x: 0, y: 0, w: Math.ceil(r.width + 20), h: Math.ceil(r.height + 12), rot: 0, alt: tex }; place(n); C.add(n, 'Équation'); }
    } }] });
  };
  /* ----- liens ----- */
  C.link = function () {
    const ed = A.editing && !A.editing.cell ? A.editing : null;
    const e = A.one();
    if (!ed && !e) { O.toast('Sélectionnez un objet ou du texte'); return; }
    const saved = ed ? RT.saveSel() : null;
    const cur = ed ? (RT.state().link || '') : (e.link ? (e.link.url || (e.link.slide ? '#slide:' + e.link.slide : '#' + e.link.type)) : '');
    const opts = A.doc.slides.map((s, i) => '<option value="' + s.id + '">' + (i + 1) + '. ' + O.esc(P.slideTitle(s) || 'Diapositive ' + (i + 1)) + '</option>').join('');
    O.dialog({
      title: 'Lien hypertexte', body: '<div class="seg2" id="lk" style="margin-bottom:10px"><button type="button" data-k="url" class="on">Page web</button><button type="button" data-k="slide">Diapositive</button><button type="button" data-k="nav">Navigation</button></div>' +
        '<div data-p="url"><label class="o-field"><span>Adresse</span><input class="o-in" id="lu" placeholder="https://…" value="' + O.esc(/^https?:|^mailto:/.test(cur) ? cur : '') + '"></label></div>' +
        '<div data-p="slide" hidden><label class="o-field"><span>Aller à</span><select class="o-in" id="ls">' + opts + '</select></label></div>' +
        '<div data-p="nav" hidden><label class="o-field"><span>Aller à</span><select class="o-in" id="ln"><option value="next">Diapositive suivante</option><option value="prev">Diapositive précédente</option><option value="first">Première diapositive</option><option value="last">Dernière diapositive</option><option value="end">Fin du diaporama</option></select></label></div>' +
        '<p class="o-hint">Pendant le diaporama, un clic sur ' + (ed ? 'le texte' : 'l\'objet') + ' suit le lien. Dans l\'éditeur : Ctrl+clic.</p>',
      onOpen: (el) => {
        let k = /^#slide:/.test(cur) ? 'slide' : /^#(next|prev|first|last|end)$/.test(cur) ? 'nav' : 'url';
        const set = (x) => { k = x; O.$$('#lk button', el).forEach((b) => b.classList.toggle('on', b.dataset.k === x)); O.$$('[data-p]', el).forEach((p) => { p.hidden = p.dataset.p !== x; }); el._k = x; };
        set(k); if (k === 'slide') el.querySelector('#ls').value = cur.slice(7); if (k === 'nav') el.querySelector('#ln').value = cur.slice(1);
        el.querySelector('#lk').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) set(b.dataset.k); });
      },
      buttons: [{ label: 'Supprimer le lien', value: 'del', left: true }, { label: 'Annuler', value: null }, { label: 'OK', primary: true, value: 'ok', onClick: (c, w) => {
        const k = w.querySelector('.o-dlg')._k || w.querySelector('#lk .on').dataset.k;
        let href = k === 'url' ? w.querySelector('#lu').value.trim() : k === 'slide' ? '#slide:' + w.querySelector('#ls').value : '#' + w.querySelector('#ln').value;
        if (k === 'url' && href && !/^(https?:|mailto:|tel:)/i.test(href)) href = (/@/.test(href) && !/\//.test(href) ? 'mailto:' : 'https://') + href;
        c(href ? 'set:' + href : 'del'); return false;
      } }]
    }).then((v) => {
      if (!v) return;
      const href = v.startsWith('set:') ? v.slice(4) : null;
      if (ed) {
        A.startEdit(ed.id); RT.restoreSel(saved);
        if (href) { if (getSelection().isCollapsed) { document.execCommand('insertHTML', false, '<a href="' + O.esc(href) + '">' + O.esc(href.replace(/^#slide:.*/, 'diapositive').replace(/^mailto:/, '')) + '</a>'); } else RT.apply('link', href); }
        else RT.apply('unlink');
        A.onTyping(); return;
      }
      A.selEls().forEach((x) => { if (!href) delete x.link; else if (/^#slide:/.test(href)) x.link = { type: 'slide', slide: href.slice(7) }; else if (/^#/.test(href)) x.link = { type: href.slice(1) }; else x.link = { type: 'url', url: href }; });
      A.change(href ? 'Lien' : 'Supprimer le lien');
    });
  };
  C.altText = function () {
    const e = A.one(); if (!e) { O.toast('Sélectionnez un objet'); return; }
    O.prompt('Texte de remplacement', 'Décrivez l\'objet pour les personnes qui ne le voient pas (lecteurs d\'écran, exports)', e.alt || '', { multiline: true, rows: 3, hint: 'Laissez vide si l\'objet est purement décoratif.' }).then((t) => { if (t == null) return; e.alt = t.trim(); A.change('Texte de remplacement'); });
  };
  /* ----- commentaires ----- */
  C.comment = async function () {
    if (A.view === 'master') return;
    let who = author();
    if (!who) { who = await O.prompt('Votre nom', 'Nom affiché sur vos commentaires', ''); if (who == null) return; who = who.trim() || 'Moi'; try { localStorage.setItem('presentation:auteur', who); } catch (e) { } }
    const text = await O.prompt('Nouveau commentaire', 'Commentaire', '', { multiline: true, rows: 4 }); if (!text || !text.trim()) return;
    const s = A.doc.slides[A.cur]; const e = A.one();
    const b = e ? A.bbox([e]) : null;
    s.comments = s.comments || [];
    s.comments.push({ id: P.uid('c'), author: who, at: Date.now(), text: text.trim(), x: b ? b.x + b.w : 30, y: b ? b.y : 30, el: e ? e.id : null, done: false, replies: [] });
    A.change('Commentaire'); A.openPane('comments');
  };
  A.renderComments = function () {
    O.$$('.cm-pin', A.overlayEl.parentNode).forEach((n) => n.remove());
    const s = A.view === 'master' ? null : A.doc.slides[A.cur]; if (!s || !A.settings.showComments) return;
    (s.comments || []).filter((c) => !c.done).forEach((c, i) => {
      const d = O.h('div', { cls: 'cm-pin', title: c.author + ' : ' + c.text }, String(i + 1));
      d.style.left = (parseFloat(A.canvasEl.style.left) + c.x * A.zoom) + 'px'; d.style.top = (parseFloat(A.canvasEl.style.top) + c.y * A.zoom) + 'px';
      d.addEventListener('click', () => { A.openPane('comments'); });
      A.overlayEl.parentNode.appendChild(d);
    });
  };
  /* ----- reproduire la mise en forme ----- */
  C.painter = function (sticky, silent) {
    const e = A.one(); if (!e && !A.editing) { O.toast('Sélectionnez l\'objet modèle'); return; }
    const src = e || A.get(A.editing.id);
    const fmt = { type: src.type, fill: O.clone(src.fill), line: O.clone(src.line), shadow: O.clone(src.shadow), opacity: src.opacity, txColor: src.txColor, fx: O.clone(src.fx), mask: src.mask, tstyle: O.clone(src.tstyle), color: src.color };
    const n = A.editing ? A.editing.el : A.canvasEl.querySelector('.el[data-id="' + src.id + '"] .el-tx-in');
    if (n && n.textContent.trim()) fmt.text = RT.captureFormat(A.editing ? null : n);
    A.painter = { fmt, sticky: !!sticky };
    if (!silent) O.toast(sticky ? 'Cliquez sur les objets à mettre en forme (Échap pour finir)' : 'Cliquez sur l\'objet à mettre en forme', { ms: 2200 });
    else O.toast('Mise en forme copiée', { ms: 1000 });
    A.refreshUi();
  };
  C.pastePainter = function () { if (!A.painter) { O.toast('Copiez d\'abord une mise en forme (Ctrl+Maj+C)'); return; } A.selEls().forEach((x) => applyFmt(x)); A.change('Coller la mise en forme'); };
  function applyFmt(t) {
    const f = A.painter.fmt;
    if (t.type === 'shape' || t.type === 'text') { if (f.type === 'shape' || f.type === 'text') { t.fill = O.clone(f.fill); t.line = O.clone(f.line); t.txColor = f.txColor; } t.shadow = O.clone(f.shadow); t.opacity = f.opacity; }
    if (t.type === 'image' && f.type === 'image') { t.fx = O.clone(f.fx); t.mask = f.mask; t.line = O.clone(f.line); t.shadow = O.clone(f.shadow); }
    if (t.type === 'image' && f.type !== 'image') { t.line = O.clone(f.line); t.shadow = O.clone(f.shadow); }
    if (t.type === 'table' && f.tstyle) t.tstyle = O.clone(f.tstyle);
    if (t.type === 'icon' && f.color) t.color = f.color;
    if (f.text && (t.type === 'text' || t.type === 'shape') && t.html) {
      A.renderCanvas(); const n = A.canvasEl.querySelector('.el[data-id="' + t.id + '"] .el-tx-in');
      if (n) { RT.pasteFormat(f.text, n); t.html = RT.sanitize(n.innerHTML); }
    }
  }
  A.applyPainter = function (id) {
    const t = A.get(id); if (!t || !A.painter) return;
    applyFmt(t); A.sel = [id];
    if (!A.painter.sticky) A.painter = null;
    A.change('Reproduire la mise en forme');
  };
  /* ----- affichage ----- */
  C.toggle = function (k) { A.settings[k] = !A.settings[k]; A.saveSettings(); if (k === 'notes') document.getElementById('notes').classList.toggle('closed', !A.settings.notes); A.layoutStage(); A.renderOverlay(); A.renderComments(); A.refreshUi(); };
})();
