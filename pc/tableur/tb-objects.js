/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-tableur/tb-objects.js : ne pas modifier ici. */
/* Tableur — objets posés sur la feuille : graphiques (mis à jour en direct), images, formes (mêmes formes que
   Présentation : pres-shapes.js), zones de texte, icônes (Lucide). Ancrage à une cellule, déplacement, redimensionnement
   (souris et doigt), ordre, copier-coller, suppression ; sparklines (insertion). */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur;
  const A = window.TableurApp = window.TableurApp || {};
  const C = A.cmd = A.cmd || {};
  const wb = () => A.wb, sh = () => A.wb.cur, G = () => A.grid;
  A.selObj = null;
  const urls = new Map();
  A.mediaUrl = function (id) { if (urls.has(id)) return urls.get(id); const b = wb().media[id]; if (!b) return ''; const u = URL.createObjectURL(b); urls.set(id, u); return u; };
  A.forgetMedia = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };

  /* ---------------- rendu ---------------- */
  const els = new Map();
  A.renderObjects = function (s) {
    const host = G().objsIn, z = G().zoom, live = new Set();
    G().axes();
    (s.objs || []).forEach((o, i) => {
      live.add(o.id);
      let el = els.get(o.id);
      if (!el || el._sheet !== s.id) { if (el) el.remove(); el = O.h('div', { cls: 'g-obj g-' + o.type, 'data-id': o.id }); el._sheet = s.id; host.appendChild(el); els.set(o.id, el); bind(el); }
      const p = G().objPos(o);
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.width = p.w + 'px'; el.style.height = p.h + 'px'; el.style.zIndex = 10 + i;
      el.style.transform = o.rot ? 'rotate(' + o.rot + 'deg)' : '';
      const key = JSON.stringify([o.type === 'chart' ? G().ver : 0, o.chart, o.shape, o.fill, o.line, o.lw, o.text, o.color, o.fs, o.media, o.icon, o.w, o.h, z, o.b, o.align]);
      if (el._key !== key) {
        el._key = key;
        if (o.type === 'chart') el.innerHTML = TB.Chart.svg(wb(), o.chart, o.w, o.h, s);
        else if (o.type === 'image') el.innerHTML = '<img src="' + (o.media ? A.mediaUrl(o.media) : o.src || '') + '" alt="' + O.esc(o.alt || '') + '" draggable="false">';
        else if (o.type === 'icon') el.innerHTML = '<svg viewBox="0 0 24 24" style="width:100%;height:100%;fill:none;stroke:' + (o.color || '#1E7B45') + ';stroke-width:' + (o.lw || 1.8) + ';stroke-linecap:round;stroke-linejoin:round">' + O.iconSvg(o.icon || 'star') + '</svg>';
        else el.innerHTML = shapeSvg(o) + '<div class="tx" style="color:' + (o.color || (o.textbox ? '#000' : '#fff')) + ';font-size:' + ((o.fs || 11) * 4 / 3) + 'px;font-weight:' + (o.b ? 700 : 400) + ';justify-content:' + (o.align === 'left' ? 'flex-start' : o.align === 'right' ? 'flex-end' : 'center') + ';text-align:' + (o.align || 'center') + '">' + O.esc(o.text || '') + '</div>';
        if (el.querySelector('svg') && o.type !== 'chart') el.querySelector('svg').style.overflow = 'visible';
      }
      if (o.type !== 'chart' && o.type !== 'image' && o.type !== 'icon') { const tx = el.querySelector('.tx'); if (tx) tx.style.fontSize = ((o.fs || 11) * 4 / 3 * z) + 'px'; }
      el.classList.toggle('sel', A.selObj && A.selObj.id === o.id);
      let hs = el.querySelector('.hdls');
      if (A.selObj && A.selObj.id === o.id) { if (!hs) { hs = O.h('div', { cls: 'hdls' }); hs.innerHTML = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((k) => '<i class="hdl ' + k + '" data-h="' + k + '"></i>').join(''); el.appendChild(hs); } }
      else if (hs) hs.remove();
    });
    els.forEach((el, id) => { if (!live.has(id) || el._sheet !== s.id) { el.remove(); els.delete(id); } });
  };
  function shapeSvg(o) {
    const Pr = window.Pres; const w = o.w, h = o.h;
    const fill = o.fill === 'none' ? 'none' : (o.fill || (o.textbox ? '#FFFFFF' : '#4472C4')), line = o.line === 'none' ? 'none' : (o.line || (o.textbox ? '#7F7F7F' : '#2F528F')), lw = o.lw || (o.textbox ? 0.75 : 1);
    let paths;
    try { paths = Pr && Pr.shapeParts ? Pr.shapeParts(o.shape || 'rect', w, h, (Pr.DEFAULT_ADJ || {})[o.shape] || {}) : null; } catch (e) { paths = null; }
    if (!paths) paths = [{ d: 'M0,0 H' + w + ' V' + h + ' H0 Z' }];
    const isLine = Pr && Pr.isLineShape && Pr.isLineShape(o.shape);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + (isLine ? '<defs><marker id="ah' + o.id + '" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="' + line + '"/></marker></defs>' : '') + paths.map((p) => '<path d="' + p.d + '" fill="' + (isLine || p.fill === 'none' ? 'none' : fill) + '" stroke="' + line + '" stroke-width="' + lw * 1.33 + '" vector-effect="non-scaling-stroke"' + (isLine && /arrow/i.test(o.shape || '') ? ' marker-end="url(#ah' + o.id + ')"' : '') + '/>').join('') + '</svg>';
  }
  A.shapeSvg = shapeSvg;

  /* ---------------- sélection, déplacement, redimensionnement ---------------- */
  function bind(el) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      const id = el.dataset.id, s = sh(); const o = s.objs.find((x) => x.id === id); if (!o) return;
      if (e.target.closest('.tx[contenteditable="true"]')) return;
      e.preventDefault(); e.stopPropagation();
      if (G().edit) G().commitEdit(null);
      if (s.protect && !(s.protect.allow || {}).objects) { selectObj(o); return; }
      selectObj(o);
      const hdl = e.target.closest('[data-h]');
      const z = G().zoom, x0 = e.clientX, y0 = e.clientY;
      const P0 = { x: G().ax().pos(o.from.c) + (o.from.dx || 0), y: G().ay().pos(o.from.r) + (o.from.dy || 0), w: o.w, h: o.h };
      let cur = Object.assign({}, P0), moved = false;
      const mv = (ev) => {
        const dx = (ev.clientX - x0) / z, dy = (ev.clientY - y0) / z; if (!moved && Math.hypot(dx, dy) < 3) return; moved = true;
        if (hdl) { const k = hdl.dataset.h; cur = Object.assign({}, P0); if (/e/.test(k)) cur.w = Math.max(10, P0.w + dx); if (/s/.test(k)) cur.h = Math.max(10, P0.h + dy); if (/w/.test(k)) { cur.w = Math.max(10, P0.w - dx); cur.x = P0.x + P0.w - cur.w; } if (/n/.test(k)) { cur.h = Math.max(10, P0.h - dy); cur.y = P0.y + P0.h - cur.h; } if (ev.shiftKey && o.type !== 'shape') { const r = P0.w / P0.h; if (/[ew]/.test(k) && !/[ns]/.test(k)) cur.h = cur.w / r; else cur.w = cur.h * r; } }
        else { cur.x = Math.max(0, P0.x + dx); cur.y = Math.max(0, P0.y + dy); }
        el.style.left = cur.x * z + 'px'; el.style.top = cur.y * z + 'px'; el.style.width = cur.w * z + 'px'; el.style.height = cur.h * z + 'px';
      };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (moved) A.objSet(Object.assign({}, anchorOf(cur.x, cur.y), { w: Math.round(cur.w), h: Math.round(cur.h) }), o); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', (e) => {
      const o = sh().objs.find((x) => x.id === el.dataset.id); if (!o) return; e.stopPropagation();
      if (o.type === 'chart') A.dialogs.chartEdit();
      else if (o.type === 'shape') { const tx = el.querySelector('.tx'); tx.setAttribute('contenteditable', 'true'); tx.focus(); const r = document.createRange(); r.selectNodeContents(tx); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); tx.onblur = () => { tx.removeAttribute('contenteditable'); A.objSet({ text: tx.innerText }, o); }; tx.onkeydown = (ev) => { if (ev.key === 'Escape') tx.blur(); ev.stopPropagation(); }; }
      else if (o.type === 'image') A.dialogs.imageAlt && A.dialogs.imageAlt(o);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation(); const o = sh().objs.find((x) => x.id === el.dataset.id); if (!o) return; selectObj(o);
      O.menu({ x: e.clientX, y: e.clientY }, [o.type === 'chart' ? { label: 'Modifier le graphique…', icon: 'settings-2', on: () => A.dialogs.chartEdit() } : null, o.type === 'chart' ? { label: 'Sélectionner les données…', icon: 'table-2', on: () => A.dialogs.chartData() } : null, { label: 'Couper', icon: 'scissors', on: () => { A.copyObj(); A.deleteObj(); } }, { label: 'Copier', icon: 'copy', on: () => A.copyObj() }, { label: 'Dupliquer', icon: 'copy-plus', on: () => { A.copyObj(); A.pasteObj(); } }, '-', { label: 'Premier plan', on: () => A.objOrder(1) }, { label: 'Arrière-plan', on: () => A.objOrder(-1) }, o.type !== 'chart' ? { label: 'Texte de remplacement…', on: () => A.dialogs.imageAlt && A.dialogs.imageAlt(o) } : null, o.type === 'chart' ? { label: 'Enregistrer comme image (PNG)', icon: 'image', on: () => A.chartPng(o) } : null, '-', { label: 'Supprimer', icon: 'trash-2', danger: true, on: () => A.deleteObj() }], { title: o.type === 'chart' ? 'Graphique' : 'Objet' });
    });
  }
  function anchorOf(x, y) { const ax = G().ax(), ay = G().ay(); const c = ax.index(x), r = ay.index(y); return { from: { r, c, dx: Math.round(x - ax.pos(c)), dy: Math.round(y - ay.pos(r)) } }; }
  A.anchorOf = anchorOf;
  function selectObj(o) { A.selObj = o; G().draw(); A.refreshUi(); try { G().scroll.focus({ preventScroll: true }); } catch (e) { } }
  A.selectObj = selectObj;
  A.objectsDeselect = function () { if (!A.selObj) return; A.selObj = null; G().draw(); A.refreshUi(); };
  /** modifier l'objet sélectionné (ou o) : patch ou fn(o) → patch */
  A.objSet = function (patch, o) {
    o = o || A.selObj; if (!o) return; const s = sh();
    const i = s.objs.findIndex((x) => x.id === o.id); if (i < 0) return;
    const p = typeof patch === 'function' ? patch(s.objs[i]) : patch;
    const n = Object.assign({}, s.objs[i], p);
    const l = s.objs.slice(); l[i] = n;
    A.tx('Objet', () => wb().setProp(s, 'objs', l));
    if (A.selObj && A.selObj.id === n.id) A.selObj = n;
  };
  A.chartSet = function (patch) { if (!A.selObj || A.selObj.type !== 'chart') return; A.objSet((o) => ({ chart: Object.assign({}, o.chart, typeof patch === 'function' ? patch(o.chart) : patch) })); };
  A.deleteObj = function () { const o = A.selObj; if (!o) return; const s = sh(); A.tx('Supprimer l\'objet', () => wb().setProp(s, 'objs', s.objs.filter((x) => x.id !== o.id))); A.selObj = null; A.refreshUi(); };
  A.objOrder = function (d) { const o = A.selObj; if (!o) return; const s = sh(); const l = s.objs.filter((x) => x.id !== o.id); const cur = s.objs.find((x) => x.id === o.id); if (d > 0) l.push(cur); else l.unshift(cur); A.tx('Ordre', () => wb().setProp(s, 'objs', l)); };
  A.nudgeObj = function (dr, dc, big) { const o = A.selObj; if (!o) return; const k = big ? 10 : 1; const x = G().ax().pos(o.from.c) + (o.from.dx || 0) + dc * k, y = G().ay().pos(o.from.r) + (o.from.dy || 0) + dr * k; A.objSet(anchorOf(Math.max(0, x), Math.max(0, y))); };
  A.copyObj = function () { if (!A.selObj) return; A.objClip = JSON.parse(JSON.stringify(A.selObj)); O.toast('Objet copié', { ms: 1000 }); };
  A.pasteObj = function () { if (!A.objClip) return; const n = JSON.parse(JSON.stringify(A.objClip)); n.id = TB.uid('o'); n.from = Object.assign({}, n.from, { dx: (n.from.dx || 0) + 16, dy: (n.from.dy || 0) + 16 }); add(n); };
  function add(o) { const s = sh(); A.tx('Insérer', () => wb().setProp(s, 'objs', s.objs.concat([o]))); A.selObj = o; A.refreshUi(); G().draw(); }
  A.addObject = add;
  /** position par défaut : à droite de la sélection, dans la partie visible */
  function placeNear(w, h) { const Gr = G(), g = A.bounded(Gr.range()); const c = Math.min(g.c2 + 1, Gr.visible.c2 - 2 > Gr.visible.c1 ? Math.max(Gr.visible.c1, Math.min(g.c2 + 1, Gr.visible.c2 - 3)) : g.c2 + 1); const r = Math.max(Gr.visible.r1, Math.min(g.r1, Gr.visible.r2)); void w; void h; return { from: { r, c, dx: 8, dy: 4 } }; }

  /* ---------------- insertions ---------------- */
  A.insertChart = function (kind) {
    const s = sh(), Gr = G();
    let g = Gr.range();
    if (g.r1 === g.r2 && g.c1 === g.c2) { const reg = Gr.region(g.r1, g.c1); if (!reg) { O.toast('Sélectionnez d\'abord les données (avec leurs titres) du graphique', { bad: true }); return; } g = reg; }
    g = A.bounded(g);
    const src = TB.quoteSheet(s.name) + '!' + TB.rangeStr(g, true);
    const t0 = s.get(g.r1, g.c1);
    const ch = { kind: kind || 'bar', src, title: typeof t0 === 'string' && g.c1 === g.c2 ? t0 : '', legend: undefined };
    const D = TB.Chart.data(wb(), ch, s);
    if (!D.series.length) { O.toast('Aucune donnée numérique dans la sélection', { bad: true }); return; }
    if (!ch.title && D.series.length === 1) ch.title = D.series[0].name;
    const o = Object.assign({ id: TB.uid('o'), type: 'chart', w: 480, h: 288, chart: ch }, placeNear(480, 288));
    add(o);
    O.toast('Graphique inséré : il suit les données en direct (onglet Graphique pour le modifier)', { ms: 2500 });
  };
  A.insertShape = function (shape, opt) {
    opt = opt || {};
    const o = Object.assign({ id: TB.uid('o'), type: 'shape', shape: shape || 'rect', w: opt.textbox ? 220 : 140, h: opt.textbox ? 70 : 90, text: opt.textbox ? 'Zone de texte' : '', textbox: !!opt.textbox, fs: 11, align: opt.textbox ? 'left' : 'center' }, placeNear(140, 90));
    add(o);
    if (opt.textbox) setTimeout(() => { const el = els.get(o.id); if (el) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }, 50);
  };
  A.insertIcon = function (name) { add(Object.assign({ id: TB.uid('o'), type: 'icon', icon: name, w: 64, h: 64, color: '#1E7B45' }, placeNear(64, 64))); };
  A.insertImage = async function () { const l = await O.Files.pickMedia('image/*', true); for (const f of l) await A.insertImageFile(f); };
  A.insertImageFile = async function (file) {
    if (!/^image\//.test(file.type || '')) { O.toast('Ce fichier n\'est pas une image', { bad: true }); return; }
    const id = TB.uid('m'); wb().media[id] = file;
    const dims = await new Promise((res) => { const im = new Image(); const u = URL.createObjectURL(file); im.onload = () => { res([im.naturalWidth, im.naturalHeight]); URL.revokeObjectURL(u); }; im.onerror = () => { res([320, 240]); URL.revokeObjectURL(u); }; im.src = u; });
    let w = dims[0], h = dims[1]; const k = Math.min(1, 420 / w, 320 / h); w = Math.round(w * k); h = Math.round(h * k);
    add(Object.assign({ id: TB.uid('o'), type: 'image', media: id, w, h, alt: file.name || '' }, placeNear(w, h)));
  };
  A.chartPng = async function (o) {
    const svg = TB.Chart.svg(wb(), o.chart, o.w, o.h, sh());
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    const c = document.createElement('canvas'); c.width = o.w * 2; c.height = o.h * 2; const x = c.getContext('2d'); x.scale(2, 2); x.drawImage(img, 0, 0);
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    O.Files.export(b, O.safeName((o.chart.title || 'Graphique'), '.png'), { types: [{ description: 'Image PNG', accept: { 'image/png': ['.png'] } }] });
  };
})();
