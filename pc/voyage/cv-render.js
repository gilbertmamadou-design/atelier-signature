/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-voyage/cv-render.js : ne pas modifier ici. */
/* =====================================================================
   Carnet de voyage — rendu d'une page en SVG (éditeur, vignettes, export) et en image (canvas, PNG, JPG, PDF).
   Élément : {id, type: photo|text|draw|sticker|icon|map, x, y, w, h, rot, …} (x, y : coin haut gauche avant rotation).
   CV.R.pageSvg(carnet, page, {pfx, href(id) → URL, media(id) → {w,h}, cover, sel}) → chaîne SVG complète
   CV.R.raster(svg, largeurPx) → canvas      CV.R.textLayout(it) → {lines, lh, h}
   ===================================================================== */
(function () {
  'use strict';
  const CV = window.CV = window.CV || {};
  const A = CV.Art, esc = A.esc, f = A.n, W = A.W, H = A.H;
  const R = CV.R = {};

  /* ---------------- Texte : coupure en lignes (mêmes mesures à l'écran et à l'export) ---------------- */
  let mctx = null;
  function measure(font, size, weight, txt) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = weight + ' ' + size + 'px "' + font + '"';
    return mctx.measureText(txt).width;
  }
  R.measure = measure;
  R.TEXT_STYLES = [['aucun', 'Simple'], ['etiquette', 'Étiquette kraft'], ['banniere', 'Bannière'], ['ruban', 'Ruban adhésif'], ['papier', 'Morceau de papier'], ['tampon', 'Tampon encreur']];
  R.textPad = (it) => { const st = it.style || 'aucun', s = it.size || 40; return st === 'aucun' ? [0, 0] : st === 'banniere' ? [s * 1.3, s * 0.35] : st === 'etiquette' ? [s * 1.1, s * 0.45] : [s * 0.55, s * 0.4]; };
  R.textLayout = function (it) {
    const F = A.font(it.font), size = it.size || 40, wt = it.bold ? 700 : F[3], lh = size * F[4];
    const pad = R.textPad(it), maxW = Math.max(size, (it.w || 300) - 2 * pad[0]);
    const lines = [];
    String(it.text || '').split('\n').forEach((para) => {
      if (!para) { lines.push(''); return; }
      const words = para.split(/(\s+)/); let cur = '';
      words.forEach((w) => {
        if (!w) return;
        const t = cur + w;
        if (cur && /\S/.test(w) && measure(F[2], size, wt, t.trimEnd()) > maxW) { lines.push(cur.trimEnd()); cur = w.trimStart(); }
        else cur = t;
        // mot plus long que la ligne : coupé
        while (measure(F[2], size, wt, cur) > maxW && cur.length > 1) {
          let k = cur.length - 1; while (k > 1 && measure(F[2], size, wt, cur.slice(0, k)) > maxW) k--;
          lines.push(cur.slice(0, k)); cur = cur.slice(k);
        }
      });
      lines.push(cur.trimEnd());
    });
    return { lines, lh, h: Math.max(lh, lines.length * lh) + 2 * pad[1], pad, wt, F };
  };
  function textItem(it, pfx) {
    const L = R.textLayout(it), w = it.w, h = it.h, x = -w / 2, y = -h / 2, st = it.style || 'aucun';
    const col = it.color || '#2E2620', size = it.size || 40, al = it.align || 'left';
    let s = '';
    const bg = it.bg || ({ etiquette: '#C9A06A', banniere: '#B5532F', ruban: '#E6A1A0', papier: '#FFFDF5', tampon: 'none' }[st]);
    if (st === 'etiquette') {
      const c = Math.min(h * 0.3, size * 0.8);
      const d = 'M' + f(x + c) + ' ' + f(y) + 'H' + f(x + w) + 'V' + f(y + h) + 'H' + f(x + c) + 'L' + f(x) + ' ' + f(y + h / 2) + 'Z';
      s += '<path d="' + d + '" fill="#000" opacity=".22" transform="translate(4 6)"/><path d="' + d + '" fill="' + esc(bg) + '"/><circle cx="' + f(x + c * 0.8) + '" cy="0" r="' + f(Math.min(h * 0.09, 9)) + '" fill="#F3EBDD" stroke="#7a5a35" stroke-width="2"/>';
    } else if (st === 'banniere') {
      const e = size * 0.9, dd = h * 0.25;
      const tail = (sx) => 'M' + f(sx * (w / 2 - e * 0.2)) + ' ' + f(y + dd) + 'H' + f(sx * (w / 2 + e * 0.6)) + 'L' + f(sx * (w / 2 + e * 0.15)) + ' ' + f(y + dd + h / 2) + 'L' + f(sx * (w / 2 + e * 0.6)) + ' ' + f(y + h + dd) + 'H' + f(sx * (w / 2 - e * 0.2)) + 'Z';
      s += '<path d="' + tail(-1) + tail(1) + '" fill="' + A.shade(bg, -0.3) + '"/>';
      s += '<path d="M' + f(x + e * 0.4) + ' ' + f(y + h) + 'L' + f(x + e * 0.4) + ' ' + f(y + h + dd) + 'L' + f(x + e * 0.15) + ' ' + f(y + h) + 'Z M' + f(-x - e * 0.4) + ' ' + f(y + h) + 'L' + f(-x - e * 0.4) + ' ' + f(y + h + dd) + 'L' + f(-x - e * 0.15) + ' ' + f(y + h) + 'Z" fill="' + A.shade(bg, -0.5) + '"/>';
      s += '<rect x="' + f(x + e * 0.15) + '" y="' + f(y) + '" width="' + f(w - e * 0.3) + '" height="' + f(h) + '" fill="' + esc(bg) + '"/>';
    } else if (st === 'ruban') {
      s += A.tape(pfx + 'tt', 0, 0, w, h, 0, it.tape || 'uni', bg);
    } else if (st === 'papier') {
      const Rr = A.rng(it.id + 'pp'); const pts = [];
      const n = 14; for (let i = 0; i <= n; i++) pts.push([x + w * i / n, y + (Rr() - 0.5) * 6]);
      for (let i = n; i >= 0; i--) pts.push([x + w * i / n, y + h + (Rr() - 0.5) * 10]);
      const d = 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
      s += '<path d="' + d + '" fill="#000" opacity=".18" transform="translate(3 6)"/><path d="' + d + '" fill="' + esc(bg) + '"/>';
      if (it.lines !== false) { let dl = ''; for (let yy = y + L.pad[1] + L.lh * 0.95; yy < y + h - 4; yy += L.lh) dl += 'M' + f(x + 6) + ' ' + f(yy) + 'H' + f(-x - 6); s += '<path d="' + dl + '" stroke="#88A8C8" stroke-width="1.2" opacity=".55"/>'; }
    } else if (st === 'tampon') {
      s += '<rect x="' + f(x + 3) + '" y="' + f(y + 3) + '" width="' + f(w - 6) + '" height="' + f(h - 6) + '" rx="' + f(size * 0.25) + '" fill="none" stroke="' + esc(col) + '" stroke-width="' + f(Math.max(3, size * 0.08)) + '"/>';
    }
    const tx = al === 'center' ? 0 : al === 'right' ? w / 2 - L.pad[0] : x + L.pad[0];
    const anchor = al === 'center' ? 'middle' : al === 'right' ? 'end' : 'start';
    const tcol = (st === 'banniere' && !it.colorSet) ? '#FFF8EE' : col;
    const top = y + L.pad[1] + (h - 2 * L.pad[1] - L.lines.length * L.lh) / 2;
    let t = '<text font-family="' + esc(L.F[2]) + '" font-weight="' + L.wt + '" font-size="' + f(size) + '" fill="' + esc(tcol) + '" text-anchor="' + anchor + '"' + (it.italic ? ' font-style="italic"' : '') + (it.spacing ? ' letter-spacing="' + f(it.spacing) + '"' : '') + (st === 'tampon' ? ' opacity=".85"' : '') + '>';
    L.lines.forEach((l, i) => { t += '<tspan x="' + f(tx) + '" y="' + f(top + L.lh * i + size * 0.8 + (L.lh - size) / 2) + '">' + esc(l || '​') + '</tspan>'; });
    t += '</text>';
    if (st === 'tampon') {
      const id = pfx + 'ts';
      return '<defs><filter id="' + id + '" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 0 0 0 1.7"/><feComposite in="SourceGraphic" operator="in"/></filter></defs><g filter="url(#' + id + ')">' + s + t + '</g>';
    }
    return s + t;
  }

  /* ---------------- Dessin à main levée (lissage par milieux) ---------------- */
  R.strokeD = function (pts) {
    if (!pts.length) return '';
    if (pts.length < 3) return 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]) + 'L' + f(pts[pts.length - 1][0] + 0.01) + ' ' + f(pts[pts.length - 1][1]);
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += 'Q' + f(pts[i][0]) + ' ' + f(pts[i][1]) + ' ' + f(mx) + ' ' + f(my); }
    const l = pts[pts.length - 1]; return d + 'L' + f(l[0]) + ' ' + f(l[1]);
  };
  R.PENS = [['stylo', 'Stylo', 1, 1], ['feutre', 'Feutre', 2.2, 0.92], ['surligneur', 'Surligneur', 6, 0.38]];
  function drawItem(it) {
    const vb = it.vb || [0, 0, it.w, it.h];
    const sx = it.w / (vb[2] || 1), sy = it.h / (vb[3] || 1);
    let s = '<g transform="translate(' + f(-it.w / 2) + ' ' + f(-it.h / 2) + ') scale(' + f(sx) + ' ' + f(sy) + ') translate(' + f(-vb[0]) + ' ' + f(-vb[1]) + ')" fill="none" stroke-linecap="round" stroke-linejoin="round">';
    (it.paths || []).forEach((p) => {
      const pen = R.PENS.find((x) => x[0] === p.pen) || R.PENS[0];
      s += '<path d="' + R.strokeD(p.pts) + '" stroke="' + esc(p.color || '#1d2a5c') + '" stroke-width="' + f((p.width || 4) * pen[2]) + '" opacity="' + pen[3] + '"' + (p.pen === 'surligneur' ? ' stroke-linecap="square"' : '') + '/>';
    });
    // zone de prise (invisible) pour sélectionner facilement le dessin
    return '<rect x="' + f(-it.w / 2) + '" y="' + f(-it.h / 2) + '" width="' + f(it.w) + '" height="' + f(it.h) + '" fill="#fff" fill-opacity="0.001"/>' + s + '</g>';
  }

  /* ---------------- Icônes Lucide ---------------- */
  function iconItem(it) {
    const L = window.LUCIDE, body = (L && L.icons[it.name]) || '<circle cx="12" cy="12" r="9"/>';
    const k = Math.min(it.w, it.h) / 24;
    return '<rect x="' + f(-it.w / 2) + '" y="' + f(-it.h / 2) + '" width="' + f(it.w) + '" height="' + f(it.h) + '" fill="#fff" fill-opacity="0.001"/><g transform="scale(' + f(k) + ') translate(-12 -12)" fill="' + (it.fill ? esc(it.fill) : 'none') + '" stroke="' + esc(it.color || '#2E2620') + '" stroke-width="' + (it.stroke || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + body + '</g>';
  }

  /* ---------------- Carte de l'itinéraire (Natural Earth, domaine public) ---------------- */
  R.REGIONS = [['auto', 'Autour des étapes'], ['monde', 'Monde', [-170, -58, 190, 84]], ['europe', 'Europe', [-25, 33, 45, 71]], ['france', 'France', [-5.6, 41.2, 10, 51.3]], ['mediterranee', 'Méditerranée', [-7, 29, 37, 47]], ['ameriques', 'Amériques', [-170, -57, -30, 72]], ['asie', 'Asie', [25, -11, 150, 58]], ['afrique', 'Afrique', [-20, -36, 53, 38]]];
  R.MAP_STYLES = [['ancienne', 'Carte ancienne'], ['aquarelle', 'Aquarelle'], ['simple', 'Simple']];
  let rings = null;
  function decode() {
    if (rings || !window.CV_CARTE) return rings;
    const q = window.CV_CARTE.q; rings = [];
    window.CV_CARTE.pays.forEach((p) => p[2].forEach((r) => {
      const a = r.split(',').map(Number); let x = a[0], y = a[1]; const pts = [[x / q, y / q]];
      let x0 = x, x1 = x, y0 = y, y1 = y;
      for (let i = 2; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; pts.push([x / q, y / q]); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      rings.push({ pts, b: [x0 / q, y0 / q, x1 / q, y1 / q], n: p[0] });
    }));
    return rings;
  }
  R.mapBox = function (it) {
    const reg = R.REGIONS.find((r) => r[0] === it.region);
    let b = reg && reg[2] ? reg[2].slice() : null;
    const pts = it.points || [];
    if (!b) {
      if (!pts.length) b = [-5.6, 41.2, 10, 51.3];
      else {
        let x0 = 180, x1 = -180, y0 = 90, y1 = -90; pts.forEach((p) => { x0 = Math.min(x0, p.lon); x1 = Math.max(x1, p.lon); y0 = Math.min(y0, p.lat); y1 = Math.max(y1, p.lat); });
        const sx = Math.max(1.1, (x1 - x0) * 1.6), sy = Math.max(0.8, (y1 - y0) * 1.6), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        b = [cx - sx / 2, cy - sy / 2, cx + sx / 2, cy + sy / 2];
      }
    }
    // proportions de la zone : celles du cadre (projection équirectangulaire corrigée de la latitude)
    const k = Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180);
    const bw = (b[2] - b[0]) * k, bh = b[3] - b[1], ar = it.w / it.h;
    if (bw / bh > ar) { const nh = bw / ar, c = (b[1] + b[3]) / 2; b[1] = c - nh / 2; b[3] = c + nh / 2; }
    else { const nw = bh * ar / k, c = (b[0] + b[2]) / 2; b[0] = c - nw / 2; b[2] = c + nw / 2; }
    return b;
  };
  function mapItem(it, pfx) {
    const w = it.w, h = it.h, x = -w / 2, y = -h / 2, b0 = 0.035 * Math.min(w, h);
    const st = { ancienne: { sea: '#E6D6B4', land: '#D4B98A', line: '#7E5E34', route: '#9E2F25', txt: '#4A3320' }, aquarelle: { sea: '#CFE3EA', land: '#F4ECDA', line: '#8AA9B4', route: '#C0392B', txt: '#23435A' }, simple: { sea: '#E3ECF2', land: '#FFFFFF', line: '#AFBCC6', route: '#B5532F', txt: '#2E2620' } }[it.style || 'ancienne'];
    const ax = x + b0, ay = y + b0, aw = w - 2 * b0, ah = h - 2 * b0;
    const b = R.mapBox({ region: it.region, points: it.points, w: aw, h: ah });
    const px = (lon) => ax + (lon - b[0]) / (b[2] - b[0]) * aw, py = (lat) => ay + (b[3] - lat) / (b[3] - b[1]) * ah;
    let s = '<rect x="' + f(x + 4) + '" y="' + f(y + 7) + '" width="' + f(w) + '" height="' + f(h) + '" fill="#000" opacity=".22"/><rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="#FCFAF3"/>';
    const cid = pfx + 'mc';
    s += '<defs><clipPath id="' + cid + '"><rect x="' + f(ax) + '" y="' + f(ay) + '" width="' + f(aw) + '" height="' + f(ah) + '"/></clipPath></defs><g clip-path="url(#' + cid + ')"><rect x="' + f(ax) + '" y="' + f(ay) + '" width="' + f(aw) + '" height="' + f(ah) + '" fill="' + st.sea + '"/>';
    const rr = decode();
    if (rr) {
      const tol = (b[2] - b[0]) / aw * 1.2; let d = '';
      rr.forEach((r) => {
        if (r.b[2] < b[0] || r.b[0] > b[2] || r.b[3] < b[1] || r.b[1] > b[3]) return;
        let lx = 1e9, ly = 1e9, seg = '';
        r.pts.forEach((p, i) => { if (i && Math.abs(p[0] - lx) < tol && Math.abs(p[1] - ly) < tol && i < r.pts.length - 1) return; seg += (seg ? 'L' : 'M') + f(px(p[0])) + ' ' + f(py(p[1])); lx = p[0]; ly = p[1]; });
        d += seg + 'Z';
      });
      s += '<path d="' + d + '" fill="' + st.land + '" stroke="' + st.line + '" stroke-width="' + f(Math.max(0.8, w / 600)) + '" stroke-linejoin="round"/>';
    } else s += '<text x="0" y="0" text-anchor="middle" font-family="Caveat" font-size="30" fill="' + st.txt + '">Carte en cours de chargement…</text>';
    if (it.style === 'ancienne') s += '<rect x="' + f(ax) + '" y="' + f(ay) + '" width="' + f(aw) + '" height="' + f(ah) + '" fill="url(#' + pfx + 'mv)"/><defs><radialGradient id="' + pfx + 'mv" r="75%"><stop offset=".55" stop-color="#6b4517" stop-opacity="0"/><stop offset="1" stop-color="#6b4517" stop-opacity=".35"/></radialGradient></defs>';
    const pts = it.points || [];
    if (pts.length > 1 && it.route !== false) {
      let d = 'M' + f(px(pts[0].lon)) + ' ' + f(py(pts[0].lat));
      for (let i = 1; i < pts.length; i++) {
        const x1 = px(pts[i - 1].lon), y1 = py(pts[i - 1].lat), x2 = px(pts[i].lon), y2 = py(pts[i].lat);
        const mx = (x1 + x2) / 2 - (y2 - y1) * 0.18, my = (y1 + y2) / 2 + (x2 - x1) * 0.18;
        d += 'Q' + f(mx) + ' ' + f(my) + ' ' + f(x2) + ' ' + f(y2);
      }
      s += '<path d="' + d + '" fill="none" stroke="' + st.route + '" stroke-width="' + f(Math.max(2, w / 160)) + '" stroke-dasharray="' + f(w / 60) + ' ' + f(w / 90) + '" stroke-linecap="round"/>';
    }
    const fs = Math.max(16, Math.min(w, h) / 10);
    pts.forEach((p, i) => {
      const X = px(p.lon), Y = py(p.lat), r = Math.max(5, Math.min(w, h) / 55);
      s += '<circle cx="' + f(X) + '" cy="' + f(Y) + '" r="' + f(r) + '" fill="' + st.route + '" stroke="#fff" stroke-width="' + f(r * 0.4) + '"/>';
      if (p.name) s += '<text x="' + f(X + r * 1.6) + '" y="' + f(Y - r * 0.6) + '" font-family="Caveat" font-weight="700" font-size="' + f(fs) + '" fill="' + st.txt + '" stroke="' + st.sea + '" stroke-width="' + f(fs * 0.18) + '" paint-order="stroke">' + (it.numbers ? (i + 1) + '. ' : '') + esc(p.name) + '</text>';
    });
    s += '</g><rect x="' + f(ax) + '" y="' + f(ay) + '" width="' + f(aw) + '" height="' + f(ah) + '" fill="none" stroke="' + st.line + '" stroke-width="1.5"/>';
    if (it.title) s += '<text x="' + f(ax + aw * 0.04) + '" y="' + f(ay + fs * 1.3) + '" font-family="Amatic SC" font-weight="700" font-size="' + f(fs * 1.4) + '" fill="' + st.txt + '">' + esc(it.title) + '</text>';
    return s;
  }

  /* ---------------- Page ---------------- */
  R.itemSvg = function (it, o) {
    const pfx = o.pfx + it.id;
    let body = '';
    if (it.type === 'photo') body = A.photo(it, o.href(it.media), o.media(it.media) || {}, o.pfx);
    else if (it.type === 'text') body = textItem(it, pfx);
    else if (it.type === 'draw') body = drawItem(it);
    else if (it.type === 'sticker') body = A.sticker(it.name, it.w, it.h, it.color, pfx);
    else if (it.type === 'icon') body = iconItem(it);
    else if (it.type === 'map') body = mapItem(it, pfx);
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    return '<g data-id="' + esc(it.id) + '" transform="translate(' + f(cx) + ' ' + f(cy) + ')' + (it.rot ? ' rotate(' + f(it.rot) + ')' : '') + '"' + (it.opacity != null && it.opacity < 1 ? ' opacity="' + it.opacity + '"' : '') + '>' + body + '</g>';
  };
  R.itemsSvg = function (page, o) { return (page.items || []).map((it) => R.itemSvg(it, o)).join(''); };
  R.bgSvg = function (carnet, page, o) {
    if (o.cover) return A.cover(carnet, o.pfx, carnet.cover && carnet.cover.photo ? o.href(carnet.cover.photo) : '', carnet.cover && carnet.cover.photo ? o.media(carnet.cover.photo) : null);
    return A.bg(page.bg || 'creme', o.pfx, page.id);
  };
  /** SVG complet d'une page. o.fonts : <style> @font-face à intégrer (export) */
  R.pageSvg = function (carnet, page, o) {
    const attrs = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + W + ' ' + H + '"' + (o.width ? ' width="' + o.width + '" height="' + Math.round(o.width * H / W) + '"' : '');
    return '<svg ' + attrs + '>' + (o.fonts ? '<style>' + o.fonts + '</style>' : '') + '<g class="cv-bg">' + R.bgSvg(carnet, page, o) + '</g><g class="cv-items">' + R.itemsSvg(page, o) + '</g></svg>';
  };

  /* ---------------- Polices intégrées (export) ---------------- */
  const fontData = {};
  R.FONT_FILES = { 'Caveat': ['Caveat.woff', '500 700'], 'Kalam': ['Kalam-Regular.woff', '400', 'Kalam-Bold.woff', '700'], 'Amatic SC': ['AmaticSC-Regular.woff', '400', 'AmaticSC-Bold.woff', '700'], 'Special Elite': ['SpecialElite-Regular.woff', '400'], 'Caladea': ['../fonts/Caladea-Regular.ttf', '400', '../fonts/Caladea-Bold.ttf', '700'] };
  function fontsBase() {
    const l = document.querySelector('link[href*="fonts-carnet/"]');
    return l ? new URL('.', l.href).href : new URL('fonts-carnet/', location.href).href;
  }
  async function dataOf(url) {
    if (fontData[url]) return fontData[url];
    fontData[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then((b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })).catch(() => '');
    return fontData[url];
  }
  R.fontsCss = async function (svgText) {
    const base = fontsBase(); let css = '';
    for (const fam in R.FONT_FILES) {
      if (svgText && svgText.indexOf(fam) < 0) continue;
      const l = R.FONT_FILES[fam];
      for (let i = 0; i < l.length; i += 2) {
        const d = await dataOf(new URL(l[i], base).href); if (!d) continue;
        css += '@font-face{font-family:"' + fam + '";src:url(' + d.replace(/^data:[^;]*;/, 'data:' + (l[i].endsWith('.ttf') ? 'font/ttf' : 'font/woff') + ';') + ');font-weight:' + l[i + 1] + '}';
      }
    }
    return css;
  };

  /* ---------------- Image (canvas) ---------------- */
  R.raster = async function (svg, wpx, bg) {
    const hpx = Math.round(wpx * H / W);
    const s = svg.replace(/^<svg /, '<svg width="' + wpx + '" height="' + hpx + '" ');
    const img = new Image();
    img.decoding = 'sync';
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Rendu de la page impossible')); img.src = url; });
    // laisser le temps aux images intégrées d'être décodées (Chromium)
    try { await img.decode(); } catch (e) { }
    const c = document.createElement('canvas'); c.width = wpx; c.height = hpx;
    const x = c.getContext('2d');
    x.fillStyle = bg || '#ffffff'; x.fillRect(0, 0, wpx, hpx);
    x.drawImage(img, 0, 0, wpx, hpx);
    img.src = '';
    return c;
  };
  R.toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type || 'image/png', q || 0.92));
})();
