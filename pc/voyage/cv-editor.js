/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-voyage/cv-editor.js : ne pas modifier ici. */
/* =====================================================================
   Carnet de voyage — éditeur : affichage des pages (simple ou double page), sélection, poignées
   (déplacer, redimensionner, pivoter), magnétisme, groupes, ordre, alignement, dessin au doigt ou au stylet,
   annuler / rétablir (Office.History), enregistrement automatique.
   ===================================================================== */
(function () {
  'use strict';
  const CV = window.CV = window.CV || {};
  const O = window.Office, A = CV.Art, R = CV.R, M = CV.M, W = A.W, H = A.H;
  const E = CV.E = { c: null, pi: 0, view: 'simple', sel: [], drawing: null, pen: { pen: 'stylo', color: '#1D2A5C', width: 5 }, multi: false };
  const $ = (s, r) => (r || document).querySelector(s);
  const f = A.n;

  /* ---------------- Accès aux pages ---------------- */
  E.page = function (pi) {
    const c = E.c; if (!c) return null;
    if (pi === -1) { if (!c.coverItems) c.coverItems = []; return { id: 'cover', cover: true, items: c.coverItems }; }
    return c.pages[pi] || null;
  };
  E.visible = function () {
    if (E.view !== 'double') return [E.pi];
    if (E.pi === -1) return [-1];
    const a = E.pi - (E.pi % 2);
    return E.c.pages[a + 1] ? [a, a + 1] : [a];
  };
  E.find = function (id) {
    const c = E.c; if (!c) return null;
    const lists = [[-1, c.coverItems || []]].concat(c.pages.map((p, i) => [i, p.items]));
    for (const l of lists) { const k = l[1].findIndex((x) => x.id === id); if (k >= 0) return { pi: l[0], list: l[1], idx: k, it: l[1][k] }; }
    return null;
  };
  E.selItems = () => E.sel.map((id) => E.find(id)).filter(Boolean).map((r) => r.it);

  /* ---------------- Historique et enregistrement ---------------- */
  E.hist = O.History({
    parts: () => { const c = E.c; if (!c) return []; return [JSON.stringify({ title: c.title, dates: c.dates, cover: c.cover }), JSON.stringify(c.coverItems || [])].concat(c.pages.map((p) => JSON.stringify(p))); },
    restore: (parts) => {
      const c = E.c, m = JSON.parse(parts[0]);
      c.title = m.title; c.dates = m.dates; c.cover = m.cover; c.coverItems = JSON.parse(parts[1]); c.pages = parts.slice(2).map((s) => JSON.parse(s));
      E.sel = E.sel.filter((id) => E.find(id));
      if (E.pi >= c.pages.length) E.pi = c.pages.length - 1;
      M.ensureUrls(Array.from(M.mediaIds(c))).then(() => { E.render(); E.save(); E.onChange('history'); });
    },
    onChange: () => E.onHist && E.onHist()
  });
  E.commit = function (label) { if (E.hist.commit(label)) { E.save(); E.onChange('edit'); } };
  let saveT = null;
  E.save = function () {
    clearTimeout(saveT);
    saveT = setTimeout(E.saveNow, 450);
  };
  E.saveNow = async function () {
    clearTimeout(saveT); saveT = null;
    const c = E.c; if (!c) return;
    c.updated = Date.now();
    try { await M.putCarnet(JSON.parse(JSON.stringify(c))); E.onSaved && E.onSaved(); }
    catch (e) { O.toast('Enregistrement impossible : ' + (e.message || e), { bad: true }); }
  };
  E.onChange = function () { };

  /* ---------------- Rendu ---------------- */
  const opts = (pi) => ({ pfx: 'e' + (pi < 0 ? 'c' : pi) + '-', href: M.url, media: M.info, cover: pi === -1 });
  E.render = function () {
    const sp = $('#spread'); if (!sp || !E.c) return;
    const vis = E.visible();
    // fond de carte chargé à la demande (180 Ko), puis la page est redessinée
    if (!window.CV_CARTE && vis.some((pi) => (E.page(pi).items || []).some((x) => x.type === 'map'))) O.loadScript('cv-carte-data.js').then(() => { E.render(); if (CV.U) CV.U.pagesBar(); }, () => { });
    sp.className = 'spread n' + vis.length + (E.pi === -1 ? ' cover' : '');
    sp.innerHTML = vis.map((pi) => {
      const p = E.page(pi);
      return '<div class="sheet' + (pi === -1 ? ' cov' : '') + (vis.length === 2 ? (pi % 2 ? ' right' : ' left') : '') + '" data-pi="' + pi + '">' + R.pageSvg(E.c, p, opts(pi)).replace('<svg ', '<svg class="pg" ') + '<span class="pno">' + (pi === -1 ? 'Couverture' : (pi + 1)) + '</span></div>';
    }).join('');
    E.layout();
    E.drawSel();
  };
  E.renderItems = function (pi) {
    const el = $('#spread .sheet[data-pi="' + pi + '"] .cv-items'); if (!el) { E.render(); return; }
    el.innerHTML = R.itemsSvg(E.page(pi), opts(pi));
    E.drawSel();
  };
  E.renderBg = function (pi) {
    const el = $('#spread .sheet[data-pi="' + pi + '"] .cv-bg'); if (!el) { E.render(); return; }
    el.innerHTML = R.bgSvg(E.c, E.page(pi), opts(pi));
  };
  /** Redessine un seul élément (déplacement : seulement sa transformation) */
  E.updateItem = function (it, full) {
    const r = E.find(it.id); if (!r) return;
    const g = $('#spread .sheet[data-pi="' + r.pi + '"] g[data-id="' + it.id + '"]');
    if (!g) return;
    if (full) { const t = document.createElement('div'); t.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + R.itemSvg(it, opts(r.pi)) + '</svg>'; g.replaceWith(t.firstChild.firstChild); }
    else g.setAttribute('transform', 'translate(' + f(it.x + it.w / 2) + ' ' + f(it.y + it.h / 2) + ')' + (it.rot ? ' rotate(' + f(it.rot) + ')' : ''));
  };
  /** Taille des feuilles : la page tient dans la scène */
  E.layout = function () {
    const st = $('#stage'), sp = $('#spread'); if (!st || !sp) return;
    const n = sp.classList.contains('n2') ? 2 : 1;
    const pad = innerWidth < 600 ? 10 : 28;
    const aw = st.clientWidth - 2 * pad, ah = st.clientHeight - 2 * pad - 14;
    let pw = Math.min(aw / n, ah * W / H);
    pw = Math.max(80, Math.floor(pw * (E.zoom || 1)));
    sp.style.setProperty('--pw', pw + 'px');
    E.drawSel();
  };

  /* ---------------- Coordonnées ---------------- */
  function sheetOf(pi) { return $('#spread .sheet[data-pi="' + pi + '"] svg.pg'); }
  E.scale = function (pi) { const s = sheetOf(pi); return s ? s.getBoundingClientRect().width / W : 1; };
  E.toPage = function (pi, cx, cy) { const s = sheetOf(pi); const r = s.getBoundingClientRect(); return [(cx - r.left) * W / r.width, (cy - r.top) * H / r.height]; };
  function rotPt(x, y, deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
  /** Boîte englobante (non tournée) d'un élément tourné */
  E.aabb = function (it) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((k) => { const p = rotPt(k[0] * it.w / 2, k[1] * it.h / 2, it.rot || 0); x0 = Math.min(x0, cx + p[0]); x1 = Math.max(x1, cx + p[0]); y0 = Math.min(y0, cy + p[1]); y1 = Math.max(y1, cy + p[1]); });
    return [x0, y0, x1, y1];
  };

  /* ---------------- Sélection (calque HTML au-dessus des pages) ---------------- */
  E.select = function (ids, add) {
    ids = (ids || []).filter(Boolean);
    // un élément groupé sélectionne tout son groupe
    const out = new Set(add ? E.sel : []);
    ids.forEach((id) => { const r = E.find(id); if (!r) return; if (r.it.group) r.list.filter((x) => x.group === r.it.group).forEach((x) => out.add(x.id)); else out.add(id); });
    if (add && ids.length === 1 && E.sel.includes(ids[0])) { const r = E.find(ids[0]); const g = r && r.it.group; Array.from(out).forEach((id) => { const q = E.find(id); if (id === ids[0] || (g && q && q.it.group === g)) out.delete(id); }); }
    E.sel = Array.from(out);
    E.drawSel();
    E.onSelect && E.onSelect();
  };
  E.drawSel = function () {
    const ov = $('#selov'); if (!ov) return;
    ov.innerHTML = '';
    if (!E.c || E.drawing) return;
    const stR = $('#stage').getBoundingClientRect();
    const items = E.sel.map((id) => E.find(id)).filter((r) => r && E.visible().includes(r.pi));
    const single = items.length === 1;
    items.forEach((r) => {
      const svg = sheetOf(r.pi); if (!svg) return;
      const sr = svg.getBoundingClientRect(), k = sr.width / W, it = r.it;
      const cx = sr.left - stR.left + (it.x + it.w / 2) * k + $('#stage').scrollLeft, cy = sr.top - stR.top + (it.y + it.h / 2) * k + $('#stage').scrollTop;
      const b = document.createElement('div');
      b.className = 'selbox' + (single ? ' one' : '') + (it.type === 'text' ? ' txt' : '');
      b.style.cssText = 'left:' + (cx - it.w * k / 2) + 'px;top:' + (cy - it.h * k / 2) + 'px;width:' + (it.w * k) + 'px;height:' + (it.h * k) + 'px;transform:rotate(' + (it.rot || 0) + 'deg)';
      b.dataset.id = it.id;
      if (single) {
        const hs = ['nw', 'ne', 'sw', 'se'].concat(it.type === 'text' || it.type === 'photo' || it.type === 'map' ? ['e', 'w'] : []).concat(it.type === 'photo' || it.type === 'map' ? ['n', 's'] : []);
        b.innerHTML = hs.map((h) => '<i class="hd h-' + h + '" data-h="' + h + '"></i>').join('') + '<i class="hd rot" data-h="rot" title="Faire pivoter"></i>';
      }
      ov.appendChild(b);
    });
  };
  function guides(lines) {
    const ov = $('#selov'); if (!ov) return;
    ov.querySelectorAll('.guide').forEach((g) => g.remove());
    const stR = $('#stage').getBoundingClientRect();
    (lines || []).forEach((l) => {
      const svg = sheetOf(l.pi); if (!svg) return;
      const sr = svg.getBoundingClientRect(), k = sr.width / W, g = document.createElement('div');
      g.className = 'guide ' + l.a;
      const ox = sr.left - stR.left + $('#stage').scrollLeft, oy = sr.top - stR.top + $('#stage').scrollTop;
      if (l.a === 'v') g.style.cssText = 'left:' + (ox + l.v * k) + 'px;top:' + oy + 'px;height:' + sr.height + 'px';
      else g.style.cssText = 'top:' + (oy + l.v * k) + 'px;left:' + ox + 'px;width:' + sr.width + 'px';
      ov.appendChild(g);
    });
  }

  /* ---------------- Magnétisme ---------------- */
  E.snapOn = () => (CV.settings && CV.settings.snap !== false);
  function snapMove(r, dx, dy, k, moving) {
    if (!E.snapOn()) return [dx, dy, []];
    const th = 7 / k;
    const others = r.list.filter((x) => !moving.has(x.id));
    let bb = null; moving.forEach((id) => { const q = E.find(id); if (!q) return; const b = E.aabb(q.it); bb = bb ? [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])] : b; });
    if (!bb) return [dx, dy, []];
    const xs = [40, W / 2, W - 40, 0, W], ys = [40, H / 2, H - 40, 0, H];
    others.forEach((o) => { const b = E.aabb(o); xs.push(b[0], (b[0] + b[2]) / 2, b[2]); ys.push(b[1], (b[1] + b[3]) / 2, b[3]); });
    const mx = [bb[0] + dx, (bb[0] + bb[2]) / 2 + dx, bb[2] + dx], my = [bb[1] + dy, (bb[1] + bb[3]) / 2 + dy, bb[3] + dy];
    let best = [th, 0, null], bestY = [th, 0, null];
    xs.forEach((x) => mx.forEach((m) => { const d = Math.abs(x - m); if (d < best[0]) best = [d, x - m, x]; }));
    ys.forEach((y) => my.forEach((m) => { const d = Math.abs(y - m); if (d < bestY[0]) bestY = [d, y - m, y]; }));
    const g = [];
    if (best[2] != null) { dx += best[1]; g.push({ pi: r.pi, a: 'v', v: best[2] }); }
    if (bestY[2] != null) { dy += bestY[1]; g.push({ pi: r.pi, a: 'h', v: bestY[2] }); }
    return [dx, dy, g];
  }

  /* ---------------- Gestes sur la scène ---------------- */
  let lastTap = { t: 0, id: null };
  E.pointerDown = function (e) {
    if (!E.c || e.button > 0) return;
    const hd = e.target.closest('.hd');
    if (hd) { e.preventDefault(); handleDrag(e, hd.closest('.selbox').dataset.id, hd.dataset.h); return; }
    const sheet = e.target.closest('.sheet');
    if (E.drawing) { if (sheet) { e.preventDefault(); drawStroke(e, +sheet.dataset.pi); } return; }
    const box = e.target.closest('.selbox');
    let id = null, pi = null;
    if (box) { id = box.dataset.id; }
    else if (sheet) {
      pi = +sheet.dataset.pi;
      const g = e.target.closest('g[data-id]'); if (g) id = g.getAttribute('data-id');
      if (pi !== E.pi && !id) { E.go(pi, true); }
    }
    if (!id) { if (E.sel.length) E.select([]); return; }
    e.preventDefault();
    const r = E.find(id); if (!r) return;
    if (r.pi !== E.pi) { E.pi = r.pi; E.onPage && E.onPage(); }
    const add = e.shiftKey || e.ctrlKey || e.metaKey || E.multi;
    if (!E.sel.includes(id) || add) E.select([id], add);
    // double appui : modifier le texte / options
    const now = Date.now();
    if (lastTap.id === id && now - lastTap.t < 380) { lastTap = { t: 0, id: null }; E.onDouble && E.onDouble(r.it); return; }
    lastTap = { t: now, id };
    if (!E.sel.includes(id)) return;
    moveDrag(e, r, add);
  };
  function moveDrag(e, r, add) {
    const k = E.scale(r.pi), moving = new Set(E.sel.filter((s) => { const q = E.find(s); return q && q.pi === r.pi; }));
    const start = {}; moving.forEach((id) => { const q = E.find(id); start[id] = [q.it.x, q.it.y]; });
    let moved = false;
    O.drag(e, {
      threshold: O.touch() ? 6 : 3,
      move(dx, dy) {
        moved = true;
        let ux = dx / k, uy = dy / k, g = [];
        moving.forEach((id) => { const q = E.find(id); q.it.x = start[id][0]; q.it.y = start[id][1]; });
        [ux, uy, g] = snapMove(r, ux, uy, k, new Set(Array.from(moving)));
        // la sélection part de sa position de départ : on remet puis on applique
        moving.forEach((id) => { const q = E.find(id); q.it.x = start[id][0] + ux; q.it.y = start[id][1] + uy; E.updateItem(q.it); });
        E.drawSel(); guides(g);
      },
      end() {
        guides([]);
        if (moved) { E.commit('Déplacer'); E.onSelect && E.onSelect(); }
        // simple clic dans une sélection multiple : on ne garde que cet élément (et son groupe)
        else if (!add && E.sel.length > 1) { const g = r.it.group; if (!g || E.sel.some((id) => { const q = E.find(id); return !q || q.it.group !== g; })) E.select([r.it.id]); }
      }
    });
  }
  function handleDrag(e, id, h) {
    const r = E.find(id); if (!r) return;
    const it = r.it, k = E.scale(r.pi);
    const c0 = [it.x + it.w / 2, it.y + it.h / 2], w0 = it.w, h0 = it.h, rot = it.rot || 0, size0 = it.size || 40;
    const keep = !(it.type === 'text') && h.length === 2;
    O.drag(e, {
      threshold: 1,
      move(dx, dy, ev) {
        const p = E.toPage(r.pi, ev.clientX, ev.clientY);
        if (h === 'rot') {
          let a = Math.atan2(p[1] - c0[1], p[0] - c0[0]) * 180 / Math.PI + 90;
          if (a > 180) a -= 360;
          if (E.snapOn()) { for (const s of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) if (Math.abs(a - s) < 4) a = s; }
          it.rot = Math.round(a * 10) / 10; E.updateItem(it); E.drawSel(); E.onLive && E.onLive(it); return;
        }
        const q = rotPt(p[0] - c0[0], p[1] - c0[1], -rot);
        const sx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, sy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
        const ax = -sx * w0 / 2, ay = -sy * h0 / 2;
        let nw = sx ? Math.max(24, (q[0] - ax) * sx) : w0, nh = sy ? Math.max(24, (q[1] - ay) * sy) : h0;
        if (keep) { const kk = Math.max(nw / w0, nh / h0); nw = Math.max(24, w0 * kk); nh = Math.max(24, h0 * kk); }
        if (it.type === 'text') {
          if (h.length === 2) { const kk = nw / w0; it.size = Math.max(8, Math.round(size0 * kk * 10) / 10); }
          it.w = nw; it.h = R.textLayout(it).h; nh = it.h;
        } else { it.w = nw; it.h = nh; }
        const lc = [ax + sx * nw / 2, ay + sy * nh / 2];
        if (!sx) lc[0] = 0; if (!sy) lc[1] = 0;
        if (it.type === 'text' && !sy) lc[1] = ay + (nh - h0) / 2 * 0;
        const pc = rotPt(lc[0], lc[1], rot);
        it.x = c0[0] + pc[0] - it.w / 2; it.y = c0[1] + pc[1] - it.h / 2;
        E.updateItem(it, true); E.drawSel(); E.onLive && E.onLive(it);
      },
      end(dx, dy, ev, moved) { if (moved) { E.commit(h === 'rot' ? 'Faire pivoter' : 'Redimensionner'); E.onSelect && E.onSelect(); } }
    });
    void k;
  }

  /* ---------------- Dessin libre ---------------- */
  E.startDraw = function () { E.drawing = { item: null, pi: E.pi }; E.select([]); document.body.classList.add('drawing'); E.drawSel(); };
  E.endDraw = function () {
    const d = E.drawing; E.drawing = null; document.body.classList.remove('drawing');
    if (d && d.item) { normalize(d.item); E.renderItems(d.pi); E.select([d.item.id]); E.commit('Dessin'); }
  };
  function normalize(it) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    it.paths.forEach((p) => p.pts.forEach((q) => { const m = (p.width || 4) * (R.PENS.find((x) => x[0] === p.pen) || R.PENS[0])[2] / 2; x0 = Math.min(x0, q[0] - m); y0 = Math.min(y0, q[1] - m); x1 = Math.max(x1, q[0] + m); y1 = Math.max(y1, q[1] + m); }));
    if (x1 <= x0) { x1 = x0 + 1; } if (y1 <= y0) { y1 = y0 + 1; }
    it.vb = [x0, y0, x1 - x0, y1 - y0]; it.x = x0; it.y = y0; it.w = x1 - x0; it.h = y1 - y0; it.rot = 0;
  }
  function drawStroke(e, pi) {
    const d = E.drawing; if (!d) return;
    if (d.pi !== pi) { if (d.item) { normalize(d.item); E.commit('Dessin'); } d.pi = pi; d.item = null; E.pi = pi; E.onPage && E.onPage(); }
    const page = E.page(pi);
    const pen = E.pen, path = { pen: pen.pen, color: pen.color, width: pen.width, pts: [E.toPage(pi, e.clientX, e.clientY)] };
    const live = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const P = R.PENS.find((x) => x[0] === pen.pen) || R.PENS[0];
    live.setAttribute('fill', 'none'); live.setAttribute('stroke', pen.color); live.setAttribute('stroke-width', pen.width * P[2]); live.setAttribute('opacity', P[3]); live.setAttribute('stroke-linecap', 'round'); live.setAttribute('stroke-linejoin', 'round');
    const layer = $('#spread .sheet[data-pi="' + pi + '"] .cv-items'); layer.appendChild(live);
    const id = e.pointerId;
    try { e.target.setPointerCapture(id); } catch (x) { }
    const mv = (ev) => {
      if (ev.pointerId !== id) return;
      const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      evs.forEach((q) => { const p = E.toPage(pi, q.clientX, q.clientY), l = path.pts[path.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 1.2) path.pts.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]); });
      live.setAttribute('d', R.strokeD(path.pts));
    };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      live.remove();
      if (path.pts.length === 1) path.pts.push([path.pts[0][0] + 0.5, path.pts[0][1] + 0.5]);
      // lissage léger (moyenne glissante) : un tracé au doigt reste naturel
      const sm = path.pts.map((p, i, a) => i === 0 || i === a.length - 1 ? p : [Math.round((a[i - 1][0] + p[0] * 2 + a[i + 1][0]) / 4 * 10) / 10, Math.round((a[i - 1][1] + p[1] * 2 + a[i + 1][1]) / 4 * 10) / 10]);
      path.pts = sm;
      if (!d.item) { d.item = { id: M.uid('i'), type: 'draw', paths: [], x: 0, y: 0, w: W, h: H, vb: [0, 0, W, H], rot: 0 }; page.items.push(d.item); }
      d.item.paths.push(path);
      d.item.vb = [0, 0, W, H]; d.item.x = 0; d.item.y = 0; d.item.w = W; d.item.h = H;
      E.renderItems(pi);
      E.hist.commit('Trait'); E.save();
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  E.undoStroke = function () {
    const d = E.drawing; if (!d || !d.item) return;
    d.item.paths.pop();
    if (!d.item.paths.length) { const pg = E.page(d.pi); const k = pg.items.indexOf(d.item); if (k >= 0) pg.items.splice(k, 1); d.item = null; }
    E.renderItems(d.pi); E.hist.commit('Trait effacé'); E.save();
  };

  /* ---------------- Opérations sur la sélection ---------------- */
  E.addItem = function (it, pi) {
    pi = pi == null ? E.pi : pi;
    const p = E.page(pi); p.items.push(it);
    E.renderItems(pi); E.select([it.id]); E.commit('Ajouter');
    return it;
  };
  E.remove = function () {
    if (!E.sel.length) return;
    const pis = new Set();
    E.sel.slice().forEach((id) => { const r = E.find(id); if (r) { r.list.splice(r.idx, 1); pis.add(r.pi); } });
    E.sel = []; pis.forEach((pi) => E.renderItems(pi)); E.commit('Supprimer'); E.onSelect && E.onSelect();
  };
  E.duplicate = function () {
    const ids = [], gmap = {};
    E.sel.slice().forEach((id) => {
      const r = E.find(id); if (!r) return;
      const n = JSON.parse(JSON.stringify(r.it)); n.id = M.uid('i'); n.x += 24; n.y += 24;
      if (n.group) { gmap[n.group] = gmap[n.group] || M.uid('g'); n.group = gmap[n.group]; }
      r.list.push(n); ids.push(n.id); E.renderItems(r.pi);
    });
    E.select(ids); E.commit('Dupliquer');
  };
  E.order = function (how) {
    const done = new Set();
    E.sel.forEach((id) => {
      const r = E.find(id); if (!r) return; const l = r.list, it = r.it;
      l.splice(r.idx, 1);
      let k = how === 'front' ? l.length : how === 'back' ? 0 : how === 'up' ? Math.min(l.length, r.idx + 1) : Math.max(0, r.idx - 1);
      l.splice(k, 0, it); done.add(r.pi);
    });
    done.forEach((pi) => E.renderItems(pi)); E.commit('Ordre');
  };
  E.align = function (how) {
    const its = E.selItems(); if (!its.length) return;
    let ref;
    if (its.length === 1) ref = [40, 40, W - 40, H - 40];
    else { ref = [1e9, 1e9, -1e9, -1e9]; its.forEach((it) => { const b = E.aabb(it); ref = [Math.min(ref[0], b[0]), Math.min(ref[1], b[1]), Math.max(ref[2], b[2]), Math.max(ref[3], b[3])]; }); }
    its.forEach((it) => {
      const b = E.aabb(it);
      if (how === 'left') it.x += ref[0] - b[0]; else if (how === 'right') it.x += ref[2] - b[2]; else if (how === 'hcenter') it.x += (ref[0] + ref[2]) / 2 - (b[0] + b[2]) / 2;
      else if (how === 'top') it.y += ref[1] - b[1]; else if (how === 'bottom') it.y += ref[3] - b[3]; else if (how === 'vcenter') it.y += (ref[1] + ref[3]) / 2 - (b[1] + b[3]) / 2;
      E.updateItem(it);
    });
    E.drawSel(); E.commit('Aligner');
  };
  E.group = function (on) {
    const its = E.selItems();
    if (on) { if (its.length < 2) return; const g = M.uid('g'); its.forEach((it) => { it.group = g; }); E.commit('Grouper'); O.toast('Éléments groupés : ils se déplacent ensemble'); }
    else { its.forEach((it) => { delete it.group; }); E.commit('Dégrouper'); O.toast('Groupe défait'); }
    E.onSelect && E.onSelect();
  };
  E.nudge = function (dx, dy) { const its = E.selItems(); if (!its.length) return false; its.forEach((it) => { it.x += dx; it.y += dy; E.updateItem(it); }); E.drawSel(); E.commitSoon(); return true; };
  let cT = null; E.commitSoon = () => { clearTimeout(cT); cT = setTimeout(() => E.commit('Déplacer'), 400); };
  /** Modifier un élément (propriétés) : rendu immédiat, étape d'historique groupée */
  E.change = function (it, patch, label, now) {
    Object.assign(it, patch);
    if (it.type === 'text') it.h = R.textLayout(it).h;
    E.updateItem(it, true); E.drawSel();
    if (now) E.commit(label || 'Modifier'); else { clearTimeout(cT); cT = setTimeout(() => E.commit(label || 'Modifier'), 350); }
  };

  /* ---------------- Navigation ---------------- */
  E.go = function (pi, quiet) {
    const n = E.c.pages.length;
    pi = Math.max(-1, Math.min(n - 1, pi));
    const before = E.visible().join(',');
    const dir = pi > E.pi ? 1 : -1;
    E.pi = pi;
    if (E.visible().join(',') !== before) {
      if (!quiet && CV.motionOk && CV.motionOk()) flip(dir); else E.render();
    } else E.drawSel();
    E.onPage && E.onPage();
  };
  /** Effet de page qui tourne (léger) : l'ancienne page se replie sur la nouvelle */
  function flip(dir) {
    const sp = $('#spread');
    const old = sp.querySelector(dir > 0 ? '.sheet:last-child' : '.sheet:first-child');
    const r0 = old ? old.getBoundingClientRect() : null, stR = $('#stage').getBoundingClientRect();
    const ghost = old ? old.cloneNode(true) : null;
    E.render();
    if (!ghost || !r0) return;
    ghost.classList.add('flipping', dir > 0 ? 'fwd' : 'back');
    ghost.style.cssText = 'position:absolute;left:' + (r0.left - stR.left + $('#stage').scrollLeft) + 'px;top:' + (r0.top - stR.top + $('#stage').scrollTop) + 'px;width:' + r0.width + 'px;height:' + r0.height + 'px;margin:0';
    $('#stage').appendChild(ghost);
    ghost.addEventListener('animationend', () => ghost.remove());
    setTimeout(() => ghost.remove(), 900);
  }
})();
