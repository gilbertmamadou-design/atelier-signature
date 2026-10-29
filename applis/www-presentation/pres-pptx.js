/* Présentation — échange avec PowerPoint (.pptx, Office Open XML).
   Export : PptxGenJS 4.0.1 (MIT) puis compléments XML (transitions, animations, minutage, diapos masquées).
   Import : lecture directe du zip (JSZip) : thème, masques et dispositions (héritage des espaces réservés), textes riches,
   formes, images (rognage), groupes, connecteurs, tableaux (fusions), graphiques, vidéos/sons, notes, sections,
   transitions et animations courantes. */
(function () {
  'use strict';
  const O = window.Office, P = window.Pres, T = O.Themes, RT = O.RichText;
  const IO = P.io = P.io || {};
  const EMU_PX = 9525, PX_IN = 96;
  const hex = (c) => (c || '#000000').replace('#', '').toUpperCase();

  /* =====================================================================
     EXPORT
     ===================================================================== */
  function famOf(v, t) {
    if (!v) return null; v = String(v);
    if (/--t-major/.test(v)) return t.fonts.major; if (/--t-minor/.test(v)) return t.fonts.minor;
    return O.fontName(v) || null;
  }
  function ptOf(v, base) {
    if (!v) return null; v = String(v).trim();
    let m = /^([\d.]+)pt$/.exec(v); if (m) return +m[1];
    m = /^([\d.]+)px$/.exec(v); if (m) return +m[1] * 0.75;
    m = /^([\d.]+)em$/.exec(v); if (m) return +m[1] * (base || 18);
    m = /^([\d.]+)%$/.exec(v); if (m) return +m[1] / 100 * (base || 18);
    return null;
  }
  /** Texte riche (HTML) → paragraphes de runs PptxGenJS */
  function htmlRuns(html, base, t, scale) {
    scale = scale || 1;
    const d = document.createElement('div'); d.innerHTML = html || '';
    const paras = [];
    function inlineRuns(node, ctx, out) {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) { const tx = n.textContent.replace(/​/g, ''); if (tx) out.push({ text: tx, ctx: Object.assign({}, ctx) }); return; }
        if (n.nodeType !== 1) return;
        const tg = n.tagName;
        if (tg === 'BR') { out.push({ br: true }); return; }
        if (tg === 'UL' || tg === 'OL') return;
        const c = Object.assign({}, ctx), s = n.style;
        if (tg === 'B' || tg === 'STRONG' || (s.fontWeight && (parseInt(s.fontWeight, 10) >= 600 || s.fontWeight === 'bold'))) c.bold = true;
        if (s.fontWeight && (parseInt(s.fontWeight, 10) < 600 || s.fontWeight === 'normal')) c.bold = false;
        if (tg === 'I' || tg === 'EM' || s.fontStyle === 'italic') c.italic = true;
        if (tg === 'U' || /underline/.test(s.textDecoration || s.textDecorationLine || '')) c.underline = true;
        if (tg === 'S' || tg === 'STRIKE' || tg === 'DEL' || /line-through/.test(s.textDecoration || s.textDecorationLine || '')) c.strike = true;
        if (tg === 'SUP' || s.verticalAlign === 'super') c.sup = true;
        if (tg === 'SUB' || s.verticalAlign === 'sub') c.sub = true;
        if (s.color) c.color = T.resolve(s.color, t) || c.color;
        if (s.backgroundColor) c.highlight = T.resolve(s.backgroundColor, t);
        if (s.fontFamily) c.font = famOf(s.fontFamily, t) || c.font;
        if (s.fontSize) c.size = ptOf(s.fontSize, c.size) || c.size;
        if (s.letterSpacing && s.letterSpacing !== 'normal') c.spacing = ptOf(s.letterSpacing, c.size);
        if (s.textTransform === 'uppercase') c.upper = true;
        if (tg === 'A' && n.getAttribute('href')) c.href = n.getAttribute('href');
        inlineRuns(n, c, out);
      });
    }
    function para(node, ctx, list) {
      const c = Object.assign({}, ctx), s = node.style || {};
      if (s.textAlign) c.align = s.textAlign;
      if (s.lineHeight && !/px|pt/.test(s.lineHeight)) c.lh = parseFloat(s.lineHeight);
      if (s.marginTop) c.before = ptOf(s.marginTop, c.size);
      if (s.marginBottom) c.after = ptOf(s.marginBottom, c.size);
      if (s.marginLeft) c.indent = ptOf(s.marginLeft, c.size);
      if (s.fontSize) c.size = ptOf(s.fontSize, c.size) || c.size;
      if (s.color) c.color = T.resolve(s.color, t) || c.color;
      const runs = []; inlineRuns(node, c, runs);
      // découpe aux <br>
      let cur = [];
      const push = () => { paras.push({ runs: cur, ctx: c, list }); cur = []; };
      runs.forEach((r) => { if (r.br) push(); else cur.push(r); });
      push();
    }
    function walk(node, ctx, level, listType) {
      let inline = [];
      const flush = () => { if (!inline.length) return; const w = document.createElement('div'); inline.forEach((x) => w.appendChild(x.cloneNode(true))); para(w, ctx, listType ? { type: listType, level } : null); inline = []; };
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 1 && /^(DIV|P|H\d|BLOCKQUOTE)$/.test(n.tagName)) { flush(); if (n.querySelector('div,p,ul,ol')) walk(n, Object.assign({}, ctx, n.style.textAlign ? { align: n.style.textAlign } : {}), level, listType); else para(n, ctx, null); }
        else if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) {
          flush();
          const type = n.tagName === 'OL' ? 'ol' : 'ul', st = n.style.listStyleType || '';
          Array.from(n.childNodes).forEach((li) => {
            if (li.nodeType === 1 && li.tagName === 'LI') {
              const lc = Object.assign({}, ctx); if (li.style.fontSize) lc.size = ptOf(li.style.fontSize, ctx.size); if (li.style.color) lc.color = T.resolve(li.style.color, t);
              if (level > 0) lc.size = (lc.size || 18) * 0.88;
              const clone = li.cloneNode(true); O.$$('ul,ol', clone).forEach((x) => x.remove());
              para(clone, lc, { type, level, style: st });
              O.$$(':scope > ul, :scope > ol', li).forEach((sub) => { const w = document.createElement('div'); w.appendChild(sub.cloneNode(true)); walk(w, lc, level + 1, type); });
            } else if (li.nodeType === 1 && (li.tagName === 'UL' || li.tagName === 'OL')) { const w = document.createElement('div'); w.appendChild(li.cloneNode(true)); walk(w, ctx, level + 1, type); }
          });
        } else inline.push(n);
      });
      flush();
    }
    walk(d, base, 0, null);
    // vers PptxGenJS
    const out = [];
    paras.forEach((p, pi) => {
      const po = {};
      if (p.ctx.align) po.align = p.ctx.align === 'justify' ? 'justify' : p.ctx.align;
      if (p.ctx.lh) po.lineSpacingMultiple = O.round(p.ctx.lh, 2);
      if (p.ctx.before) po.paraSpaceBefore = O.round(p.ctx.before * scale, 1);
      if (p.ctx.after) po.paraSpaceAfter = O.round(p.ctx.after * scale, 1);
      if (p.list) {
        const st = p.list.style || '';
        if (p.list.type === 'ol') po.bullet = { type: 'number', style: /alpha/.test(st) ? (/upper/.test(st) ? 'alphaUcPeriod' : 'alphaLcPeriod') : /roman/.test(st) ? (/upper/.test(st) ? 'romanUcPeriod' : 'romanLcPeriod') : 'arabicPeriod', indent: 20 };
        else { const ch = /–/.test(st) ? '2013' : /➤/.test(st) ? '27A4' : /✔/.test(st) ? '2714' : /◆/.test(st) ? '25C6' : /circle/.test(st) || p.list.level === 1 ? '25E6' : /square/.test(st) || p.list.level >= 2 ? '25AA' : null; po.bullet = ch ? { characterCode: ch, indent: 20 } : { indent: 20 }; }
        if (p.list.level) po.indentLevel = p.list.level;
      } else if (p.ctx.indent) { po.indentLevel = Math.min(8, Math.round(p.ctx.indent / 36)); }
      const runs = p.runs.length ? p.runs : [{ text: '', ctx: p.ctx }];
      runs.forEach((r, ri) => {
        const c = r.ctx, o = Object.assign({}, po);
        if (c.size) o.fontSize = O.round(c.size * scale, 1);
        if (c.font) o.fontFace = c.font;
        if (c.color) o.color = hex(c.color);
        if (c.bold) o.bold = true; else if (c.bold === false) o.bold = false;
        if (c.italic) o.italic = true;
        if (c.underline) o.underline = { style: 'sng' };
        if (c.strike) o.strike = 'sngStrike';
        if (c.sup) o.superscript = true; if (c.sub) o.subscript = true;
        if (c.highlight) o.highlight = hex(c.highlight);
        if (c.spacing) o.charSpacing = c.spacing;
        if (c.href) { if (/^#slide:/.test(c.href)) { const i = IO._slideIdx(c.href.slice(7)); if (i >= 0) o.hyperlink = { slide: i + 1 }; } else if (/^(https?:|mailto:)/.test(c.href)) o.hyperlink = { url: c.href }; }
        if (ri === runs.length - 1 && pi < paras.length - 1) o.breakLine = true;
        out.push({ text: c.upper ? r.text.toLocaleUpperCase('fr') : r.text, options: o });
      });
    });
    return out;
  }
  IO.htmlRuns = htmlRuns;
  function baseText(e, doc, t) {
    const m = doc.master.styles;
    const ctx = { size: 18, font: t.fonts.minor, color: T.resolve('t:tx1', t) };
    if (e.ph) {
      const k = /^(ctitle|stitle|number)$/.test(e.ph) ? 'ctitle' : /^(title|ctitle2|quote)$/.test(e.ph) ? 'title' : /^(subtitle|stext|author)$/.test(e.ph) ? 'subtitle' : 'body';
      const s = m[k];
      ctx.size = s.size; ctx.font = s.font === 'major' ? t.fonts.major : s.font === 'minor' ? t.fonts.minor : s.font; ctx.color = T.resolve(s.color, t); if (s.bold) ctx.bold = true; if (s.italic) ctx.italic = true; ctx.align = s.align; if (s.caps) ctx.upper = true;
      if (k === 'body') ctx.lh = s.lineHeight;
    }
    if (e.type === 'shape') { ctx.color = T.resolve(e.txColor || 't:lt1', t); ctx.align = 'center'; }
    else if (e.txColor) ctx.color = T.resolve(e.txColor, t);
    if (e.font) ctx.font = e.font === 'major' ? t.fonts.major : e.font === 'minor' ? t.fonts.minor : e.font;
    if (e.size) ctx.size = e.size; else if (e.phSize) ctx.size = e.phSize;
    if (e.phBold) ctx.bold = true; if (e.phItalic) ctx.italic = true; if (e.phAccent) ctx.color = T.resolve('t:accent1', t);
    if (e.align) ctx.align = e.align;
    if (e.lh) ctx.lh = e.lh;
    return ctx;
  }
  const DASHX = { solid: 'solid', dash: 'dash', dot: 'sysDot', dashDot: 'dashDot', longDash: 'lgDash', longDashDot: 'lgDashDot', sysDot: 'sysDot', sysDash: 'sysDash' };
  const inch = (px) => O.round(px / PX_IN, 4);
  function lineOpt(l, t) { if (!l || !l.w || l.color == null) return null; const o = { color: hex(T.resolve(l.color, t)), width: O.round(l.w, 2), dashType: DASHX[l.dash || 'solid'] || 'solid' }; if (l.alpha != null && l.alpha < 1) o.transparency = Math.round((1 - l.alpha) * 100); return o; }
  function fillOpt(f, t) { if (!f || f.type === 'none') return null; if (f.type === 'solid') { const o = { color: hex(T.resolve(f.color, t)) }; if (f.alpha != null && f.alpha < 1) o.transparency = Math.round((1 - f.alpha) * 100); return o; } if (f.type === 'gradient') { const s = f.stops || []; return { color: hex(T.resolve((s[0] || {}).c || '#888888', t)) }; } return null; }
  function shadowOpt(sh, t) { if (!sh) return null; const x = sh.x == null ? 3 : sh.x, y = sh.y == null ? 3 : sh.y; return { type: 'outer', color: hex(T.resolve(sh.color || '#000000', t)), blur: O.round((sh.blur == null ? 6 : sh.blur) * 0.75, 1), offset: O.round(Math.hypot(x, y) * 0.75, 1), angle: Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360), opacity: sh.alpha == null ? 0.4 : sh.alpha }; }
  function linkOpt(l) { if (!l) return null; if (l.type === 'url' && l.url) return { url: l.url }; if (l.type === 'slide') { const i = IO._slideIdx(l.slide); return i >= 0 ? { slide: i + 1 } : null; } return null; }
  /** Chemin SVG (M L Q C Z, coordonnées absolues) → points PptxGenJS (pouces) */
  function pathPoints(path, w, h) {
    const sx = w / (path.vw || 1) / PX_IN, sy = h / (path.vh || 1) / PX_IN;
    const tok = String(path.d).match(/[MLQCZHVmlqczhv]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    const pts = []; let i = 0, cmd = '', cx = 0, cy = 0;
    const n = () => parseFloat(tok[i++]);
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      switch (cmd.toUpperCase()) {
        case 'M': cx = n(); cy = n(); pts.push({ x: cx * sx, y: cy * sy, moveTo: true }); cmd = 'L'; break;
        case 'L': cx = n(); cy = n(); pts.push({ x: cx * sx, y: cy * sy }); break;
        case 'H': cx = n(); pts.push({ x: cx * sx, y: cy * sy }); break;
        case 'V': cy = n(); pts.push({ x: cx * sx, y: cy * sy }); break;
        case 'Q': { const x1 = n(), y1 = n(); cx = n(); cy = n(); pts.push({ x: cx * sx, y: cy * sy, curve: { type: 'quadratic', x1: x1 * sx, y1: y1 * sy } }); break; }
        case 'C': { const x1 = n(), y1 = n(), x2 = n(), y2 = n(); cx = n(); cy = n(); pts.push({ x: cx * sx, y: cy * sy, curve: { type: 'cubic', x1: x1 * sx, y1: y1 * sy, x2: x2 * sx, y2: y2 * sy } }); break; }
        case 'Z': pts.push({ close: true }); cmd = ''; break;
        default: i++;
      }
    }
    return pts;
  }
  /** Image rognée / filtrée / détourée, prête pour le .pptx */
  async function bakeImage(e, doc) {
    const blob = P.blobs[e.media]; if (!blob) return null;
    const c0 = e.crop || { l: 0, t: 0, r: 0, b: 0 }, fx = e.fx || {};
    const plain = !e.mask && !fx.bright && !fx.contrast && (fx.sat == null || fx.sat === 100) && !fx.gray && !fx.sepia && !fx.blur && (fx.alpha == null || fx.alpha >= 1) && !c0.l && !c0.t && !c0.r && !c0.b && !e.flipH && !e.flipV;
    if (plain && /^image\/(png|jpe?g|gif)$/.test(blob.type)) return { data: await O.blobToDataURL(blob), transparent: blob.type !== 'image/jpeg' };
    const bm = await createImageBitmap(blob);
    const sw = bm.width * (1 - c0.l - c0.r), sh = bm.height * (1 - c0.t - c0.b);
    const k = Math.min(1, 2400 / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    const filt = []; if (fx.bright) filt.push('brightness(' + (1 + fx.bright / 100) + ')'); if (fx.contrast) filt.push('contrast(' + (1 + fx.contrast / 100) + ')'); if (fx.sat != null && fx.sat !== 100) filt.push('saturate(' + fx.sat / 100 + ')'); if (fx.gray) filt.push('grayscale(1)'); if (fx.sepia) filt.push('sepia(.8)'); if (fx.blur) filt.push('blur(' + fx.blur * cw / e.w + 'px)');
    if (filt.length) x.filter = filt.join(' ');
    if (fx.alpha != null && fx.alpha < 1) x.globalAlpha = fx.alpha;
    if (e.mask) { const parts = P.shapeParts(e.mask, cw, ch, e.adj); x.save(); x.clip(new Path2D(parts.map((p) => p.d).join(' ')), 'evenodd'); }
    if (e.flipH || e.flipV) { x.translate(e.flipH ? cw : 0, e.flipV ? ch : 0); x.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1); }
    x.drawImage(bm, bm.width * c0.l, bm.height * c0.t, sw, sh, 0, 0, cw, ch);
    const transparent = !!e.mask || blob.type !== 'image/jpeg' || (fx.alpha != null && fx.alpha < 1);
    return { data: c.toDataURL(transparent ? 'image/png' : 'image/jpeg', 0.92), transparent };
  }
  async function rasterEl(e, doc, scale) {
    const n = O.h('div', { style: { position: 'fixed', left: '-30000px', top: '0' } });
    n.innerHTML = '<div class="sl mode-export" style="width:' + e.w + 'px;height:' + e.h + 'px;' + P.slideVars(doc) + ';background:transparent">' + P.elementHtml(Object.assign({}, e, { x: 0, y: 0, rot: 0, shadow: null }), doc, { mode: 'export' }) + '</div>';
    document.body.appendChild(n);
    try { const c = await O.Raster.canvas(n.firstChild, { width: Math.max(1, e.w), height: Math.max(1, e.h), scale: scale || 3 }); return c.toDataURL('image/png'); }
    finally { n.remove(); }
  }
  async function iconPng(e, doc) {
    const t = P.theme(doc), col = T.resolve(e.color || 't:accent1', t), fill = e.iconFill ? T.resolve(e.iconFill, t) : 'none';
    const s = Math.round(Math.max(e.w, e.h) * 3);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="' + fill + '" stroke="' + col + '" stroke-width="' + (e.sw || 2) + '" stroke-linecap="round" stroke-linejoin="round">' + O.iconSvg(e.icon) + '</svg>';
    const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await im.decode();
    const c = document.createElement('canvas'); c.width = Math.round(s * e.w / Math.max(e.w, e.h)); c.height = Math.round(s * e.h / Math.max(e.w, e.h));
    const k = Math.min(c.width, c.height); c.getContext('2d').drawImage(im, (c.width - k) / 2, (c.height - k) / 2, k, k);
    return c.toDataURL('image/png');
  }
  const PPT_SHAPES = new Set(P.SHAPES.map((s) => s.id).filter((id) => !P.isLineShape(id) && id !== 'freeform'));
  async function addEl(pptx, sl, e, doc, off, ctx) {
    const t = P.theme(doc);
    const x = e.x + off.dx, y = e.y + off.dy;
    const box = { x: inch(x), y: inch(y), w: inch(Math.max(e.w, 0.5)), h: inch(Math.max(e.h, 0.5)) };
    const name = 'mag-' + e.id;
    const common = { objectName: name };
    if (e.rot) common.rotate = O.round(e.rot, 2);
    switch (e.type) {
      case 'group': {
        // groupes : objets exportés un à un (positions absolues ; la rotation du groupe est reportée sur chaque objet)
        for (const k of e.children || []) {
          let kk = k;
          if (e.rot) { const cx = e.w / 2, cy = e.h / 2, tt = e.rot * Math.PI / 180; const kx = k.x + k.w / 2 - cx, ky = k.y + k.h / 2 - cy; kk = Object.assign({}, k, { x: cx + kx * Math.cos(tt) - ky * Math.sin(tt) - k.w / 2, y: cy + kx * Math.sin(tt) + ky * Math.cos(tt) - k.h / 2, rot: ((k.rot || 0) + e.rot) % 360 }); }
          await addEl(pptx, sl, kk, doc, { dx: x, dy: y }, ctx);
        }
        return;
      }
      case 'text': case 'shape': {
        const scale = e.fit && e.fit < 1 ? e.fit : 1;
        const runs = e.html && !RT.isEmpty(e.html) ? htmlRuns(e.html, baseText(e, doc, t), t, scale) : [];
        const o = Object.assign({}, box, common);
        if (e.type === 'shape' && e.shape === 'custom' && e.path) { o.points = pathPoints(e.path, e.w, e.h); }
        const shape = e.type === 'text' ? 'rect' : e.shape === 'custom' ? 'custGeom' : PPT_SHAPES.has(e.shape) ? e.shape : 'rect';
        o.shape = shape;
        if (shape === 'roundRect') o.rectRadius = inch((e.adj && e.adj.r != null ? e.adj.r : 0.16) * Math.min(e.w, e.h));
        const fl = fillOpt(e.fill, t); if (fl) o.fill = fl;
        const ln = lineOpt(e.line, t); if (ln) o.line = ln;
        const shd = shadowOpt(e.shadow, t); if (shd) o.shadow = shd;
        if (e.flipH) o.flipH = true; if (e.flipV) o.flipV = true;
        const pad = e.pad || [9.6, 4.8, 9.6, 4.8];
        o.margin = [O.round(pad[0] * 0.75, 1), O.round(pad[2] * 0.75, 1), O.round(pad[3] * 0.75, 1), O.round(pad[1] * 0.75, 1)];
        o.valign = e.va === 'middle' ? 'middle' : e.va === 'bottom' ? 'bottom' : 'top';
        if (e.type === 'text') o.isTextBox = true;
        if (e.autofit === 'shrink') o.fit = 'shrink';
        if (e.wrap === false) o.wrap = false;
        if (e.vert === 'vert') o.vert = 'vert'; else if (e.vert === 'vert270') o.vert = 'vert270';
        if (e.opacity != null && e.opacity < 1 && o.fill) o.fill.transparency = Math.round((1 - e.opacity * (1 - (o.fill.transparency || 0) / 100)) * 100);
        const lk = linkOpt(e.link); if (lk) o.hyperlink = lk;
        if (!runs.length) { sl.addText('', o); return; }
        sl.addText(runs, o); return;
      }
      case 'line': {
        const ln = lineOpt(e.line || { color: 't:tx1', w: 1.5 }, t) || { color: '000000', width: 1 };
        const map = { triangle: 'triangle', arrow: 'arrow', stealth: 'stealth', oval: 'oval', diamond: 'diamond' };
        if (e.line && e.line.head && e.line.head !== 'none') ln.endArrowType = map[e.line.head] || 'triangle';
        if (e.line && e.line.tail && e.line.tail !== 'none') ln.beginArrowType = map[e.line.tail] || 'triangle';
        const o = Object.assign({}, box, common, { line: ln, w: inch(Math.max(e.w, 0)), h: inch(Math.max(e.h, 0)) });
        if (e.flipH) o.flipH = true; if (e.flipV) o.flipV = true;
        sl.addShape(/^elbow/.test(e.shape) ? 'bentConnector3' : /^curve/.test(e.shape) ? 'curvedConnector3' : 'line', o); return;
      }
      case 'image': {
        const b = await bakeImage(e, doc); if (!b) return;
        const o = Object.assign({}, box, common, { data: b.data, altText: e.alt || '' });
        const lk = linkOpt(e.link); if (lk) o.hyperlink = lk;
        if (e.fx && e.fx.alpha != null && e.fx.alpha < 1) o.transparency = Math.round((1 - e.fx.alpha) * 100);
        sl.addImage(o);
        if (e.line && e.line.w) sl.addShape(e.mask && PPT_SHAPES.has(e.mask) ? e.mask : 'rect', Object.assign({}, box, { rotate: common.rotate, line: lineOpt(e.line, t), objectName: name + '-bord' }));
        return;
      }
      case 'placeholder': return;
      case 'table': {
        const rows = e.rows.map((r, ri) => r.cells.map((c, ci) => {
          if (c.hidden) return null;
          const cs = P.tableCellStyle(e, ri, ci, doc);
          const base = { size: e.fontSize || 16, font: t.fonts.minor, color: cs.tx, bold: cs.bold, align: c.align };
          const runs = c.html && !RT.isEmpty(c.html) ? htmlRuns(c.html, base, t) : '';
          const opt = { color: hex(cs.tx), bold: cs.bold, fontFace: t.fonts.minor, fontSize: e.fontSize || 16, valign: c.va || 'middle' };
          if (c.align) opt.align = c.align;
          if (cs.bg) opt.fill = { color: hex(cs.bg) };
          if (cs.border) opt.border = [1, 1, 1, 1].map(() => ({ type: 'solid', pt: 1, color: hex(cs.border) }));
          else opt.border = [1, 1, 1, 1].map(() => ({ type: 'none' }));
          if (c.cs > 1) opt.colspan = c.cs; if (c.rs > 1) opt.rowspan = c.rs;
          return { text: runs || '', options: opt };
        }).filter(Boolean));
        sl.addTable(rows, Object.assign({}, box, common, { colW: e.cols.map(inch), rowH: e.rows.map((r) => inch(r.h || 40)), fontFace: t.fonts.minor, margin: [4, 5, 4, 5].map((v) => v * 0.75) }));
        return;
      }
      case 'chart': {
        const c = e.chart, Ct = pptx.ChartType;
        const kind = { bar: Ct.bar, stacked: Ct.bar, barH: Ct.bar, stackedH: Ct.bar, line: Ct.line, area: Ct.area, pie: Ct.pie, doughnut: Ct.doughnut, scatter: Ct.scatter }[c.kind] || Ct.bar;
        let data;
        if (c.kind === 'scatter') data = [{ name: 'X', values: c.cats.map((v, i) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? i + 1 : n; }) }].concat(c.series.map((s) => ({ name: s.name, values: s.values.map(Number) })));
        else if (c.kind === 'pie' || c.kind === 'doughnut') data = [{ name: (c.series[0] || {}).name || 'Série 1', labels: c.cats.slice(), values: ((c.series[0] || {}).values || []).map(Number) }];
        else data = c.series.map((s) => ({ name: s.name, labels: c.cats.slice(), values: s.values.map((v) => Number(v) || 0) }));
        const colors = (c.kind === 'pie' || c.kind === 'doughnut' ? c.cats : c.series).map((s, i) => hex(P.seriesColor(i, doc, c.kind === 'pie' || c.kind === 'doughnut' ? (c.catColors || [])[i] : s.color)));
        const tx = hex(T.resolve('t:tx1', t)), fs = Math.round((c.fontSize || 14) * 0.75);
        const o = Object.assign({}, box, common, {
          chartColors: colors, showLegend: c.legend !== 'none', legendPos: { bottom: 'b', top: 't', right: 'r' }[c.legend] || 'b', legendFontSize: fs, legendColor: tx, legendFontFace: t.fonts.minor,
          showTitle: !!c.title, title: c.title || '', titleFontSize: Math.round(fs * 1.35), titleColor: tx, titleFontFace: t.fonts.minor,
          showValue: !!c.labels && c.kind !== 'pie' && c.kind !== 'doughnut', showPercent: (c.kind === 'pie' || c.kind === 'doughnut') && c.labels !== false, dataLabelFontSize: fs, dataLabelColor: tx,
          catAxisLabelColor: tx, valAxisLabelColor: tx, catAxisLabelFontSize: fs, valAxisLabelFontSize: fs, catAxisLabelFontFace: t.fonts.minor, valAxisLabelFontFace: t.fonts.minor
        });
        if (c.kind === 'barH' || c.kind === 'stackedH') o.barDir = 'bar'; else if (kind === Ct.bar) o.barDir = 'col';
        if (c.kind === 'stacked' || c.kind === 'stackedH') o.barGrouping = 'stacked';
        if (c.grid === false) o.valGridLine = { style: 'none' };
        if (c.kind === 'line') { o.lineSmooth = !!c.smooth; o.lineDataSymbol = c.markers === false ? 'none' : 'circle'; o.lineSize = 2; }
        if (c.kind === 'scatter') { o.lineSize = 0; o.lineDataSymbol = 'circle'; }
        if (c.kind === 'doughnut') o.holeSize = Math.round((c.hole || 0.55) * 100);
        if (c.xTitle) { o.showCatAxisTitle = true; o.catAxisTitle = c.xTitle; o.catAxisTitleColor = tx; }
        if (c.yTitle) { o.showValAxisTitle = true; o.valAxisTitle = c.yTitle; o.valAxisTitleColor = tx; }
        sl.addChart(kind, data, o);
        return;
      }
      case 'smartart': {
        const L = P.smartLayout(e, e.w, e.h, doc);
        for (const l of L.links) for (let k = 0; k < l.pts.length - 1; k++) {
          const a = l.pts[k], b = l.pts[k + 1];
          sl.addShape('line', { x: inch(x + Math.min(a[0], b[0])), y: inch(y + Math.min(a[1], b[1])), w: inch(Math.abs(b[0] - a[0])), h: inch(Math.abs(b[1] - a[1])), flipH: a[0] > b[0], flipV: a[1] > b[1], line: { color: hex(L.line), width: (l.w || 2) * 0.75 } });
        }
        for (const n of L.nodes) {
          const o = { x: inch(x + n.x), y: inch(y + n.y), w: inch(n.w), h: inch(n.h), shape: PPT_SHAPES.has(n.shape) ? n.shape : 'rect', valign: n.va === 'top' ? 'top' : n.va === 'bottom' ? 'bottom' : 'middle', align: n.align || 'center', fontFace: t.fonts.minor, fontSize: O.round(n.fs * 0.75, 1), color: hex(n.tx || '#000000'), margin: [3, 3, 3, 3] };
          if (n.rot) o.rotate = n.rot; if (n.bold) o.bold = true;
          if (n.fill) o.fill = { color: hex(n.fill), transparency: n.alpha ? Math.round((1 - n.alpha) * 100) : 0 };
          if (n.line) o.line = { color: hex(n.line), width: 1 };
          if (o.shape === 'roundRect') o.rectRadius = inch(0.16 * Math.min(n.w, n.h));
          const lines = String(n.text || '').split('\n');
          sl.addText(n.text ? lines.map((l, i) => ({ text: l, options: { breakLine: i < lines.length - 1 } })) : '', o);
        }
        return;
      }
      case 'icon': sl.addImage(Object.assign({}, box, common, { data: await iconPng(e, doc), altText: e.alt || e.icon })); return;
      case 'equation': case 'decorBand': sl.addImage(Object.assign({}, box, common, { data: await rasterEl(e, doc, 3), altText: e.alt || e.tex || '' })); return;
      case 'video': case 'audio': {
        if (e.url && P.ytId(e.url)) { sl.addMedia(Object.assign({}, box, common, { type: 'online', link: 'https://www.youtube.com/embed/' + P.ytId(e.url) })); return; }
        const b = P.blobs[e.media]; if (!b) return;
        if (b.size > 150 * 1024 * 1024) { ctx.warn.push('Vidéo trop lourde non exportée : ' + (e.name || '')); return; }
        const du = await O.blobToDataURL(b);
        const ext = (O.extOf(doc.media[e.media] && doc.media[e.media].name) || (b.type.split('/')[1] || 'mp4')).replace('quicktime', 'mov').replace('mpeg', 'mp3');
        const o = Object.assign({}, box, common, { type: e.type, data: du.replace(/^data:/, ''), extn: ext });
        if (e.poster && P.blobs[e.poster]) o.cover = await O.blobToDataURL(P.blobs[e.poster]);
        sl.addMedia(o);
        return;
      }
      default: return;
    }
  }
  function trXml(tr, adv) {
    const type = tr && tr.type || 'none'; const dur = (tr && tr.dur) || 0.7;
    const attrs = (type !== 'none' ? ' spd="' + (dur < 0.6 ? 'fast' : dur < 1.1 ? 'med' : 'slow') + '"' : '') + (adv && adv.click === false ? ' advClick="0"' : '') + (adv && adv.after != null && adv.after !== '' ? ' advTm="' + Math.round(adv.after * 1000) + '"' : '');
    if (type === 'none' && !attrs) return '';
    const d = { l: 'l', r: 'r', u: 'u', d: 'd' }[tr && tr.dir || 'l'] || 'l';
    // sens OOXML : « dir » est le sens du mouvement
    const inv = { l: 'l', r: 'r', u: 'u', d: 'd' };
    const el = { none: '', fade: '<p:fade/>', fadeBlack: '<p:fade thruBlk="1"/>', push: '<p:push dir="' + inv[d] + '"/>', cover: '<p:cover dir="' + inv[d] + '"/>', uncover: '<p:pull dir="' + inv[d] + '"/>', wipe: '<p:wipe dir="' + ({ l: 'l', r: 'r', u: 'u', d: 'd' }[d]) + '"/>', split: '<p:split orient="vert" dir="out"/>', zoom: '<p:zoom/>', circle: '<p:circle/>', flip: '<p:zoom dir="in"/>', blinds: '<p:blinds dir="horz"/>' }[type] || '<p:fade/>';
    return '<p:transition' + attrs + '>' + el + '</p:transition>';
  }
  /* ----- animations → <p:timing> ----- */
  const PRESET = { appear: 1, fade: 10, fly: 2, float: 42, zoom: 53, wipe: 22, split: 16, bounce: 26, growTurn: 31, swivel: 10, disappear: 1, fadeOut: 10, flyOut: 2, floatOut: 42, zoomOut: 53, wipeOut: 22, shrinkTurn: 31, pulse: 26, spin: 8, grow: 6, teeter: 32, blink: 35, colorPulse: 27 };
  const SUB = { b: 4, l: 8, r: 2, t: 1 };
  function animXml(list, spidOf) {
    let id = 3; const nid = () => ++id;
    const tgt = (sp) => '<p:tgtEl><p:spTgt spid="' + sp + '"/></p:tgtEl>';
    const setVis = (sp, val, delay) => '<p:set><p:cBhvr><p:cTn id="' + nid() + '" dur="1" fill="hold"><p:stCondLst><p:cond delay="' + (delay || 0) + '"/></p:stCondLst></p:cTn>' + tgt(sp) + '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="' + val + '"/></p:to></p:set>';
    const effect = (sp, tr, filter, dur) => '<p:animEffect transition="' + tr + '" filter="' + filter + '"><p:cBhvr><p:cTn id="' + nid() + '" dur="' + dur + '"/>' + tgt(sp) + '</p:cBhvr></p:animEffect>';
    const anim = (sp, attr, from, to, dur) => '<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="' + nid() + '" dur="' + dur + '" fill="hold"/>' + tgt(sp) + '<p:attrNameLst><p:attrName>' + attr + '</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="' + from + '"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="' + to + '"/></p:val></p:tav></p:tavLst></p:anim>';
    function behaviors(a, sp) {
      const dur = Math.round((a.dur || 0.5) * 1000), dir = a.dir || 'b';
      const wd = { l: 'left', r: 'right', t: 'up', b: 'down' }[dir];
      const offX = dir === 'l' ? '0-#ppt_w/2' : dir === 'r' ? '1+#ppt_w/2' : '#ppt_x', offY = dir === 't' ? '0-#ppt_h/2' : dir === 'b' ? '1+#ppt_h/2' : '#ppt_y';
      switch (a.fx) {
        case 'appear': return setVis(sp, 'visible');
        case 'fly': return setVis(sp, 'visible') + anim(sp, 'ppt_x', offX, '#ppt_x', dur) + anim(sp, 'ppt_y', offY, '#ppt_y', dur);
        case 'float': return setVis(sp, 'visible') + effect(sp, 'in', 'fade', dur) + anim(sp, 'ppt_y', '#ppt_y+.1', '#ppt_y', dur);
        case 'zoom': case 'growTurn': return setVis(sp, 'visible') + anim(sp, 'ppt_w', '0', '#ppt_w', dur) + anim(sp, 'ppt_h', '0', '#ppt_h', dur) + effect(sp, 'in', 'fade', dur);
        case 'wipe': return setVis(sp, 'visible') + effect(sp, 'in', 'wipe(' + ({ l: 'right', r: 'left', t: 'down', b: 'up' }[dir]) + ')', dur);
        case 'split': return setVis(sp, 'visible') + effect(sp, 'in', 'barn(inVertical)', dur);
        case 'disappear': return setVis(sp, 'hidden');
        case 'flyOut': return anim(sp, 'ppt_x', '#ppt_x', offX, dur) + anim(sp, 'ppt_y', '#ppt_y', offY, dur) + setVis(sp, 'hidden', dur - 1);
        case 'wipeOut': return effect(sp, 'out', 'wipe(' + wd + ')', dur) + setVis(sp, 'hidden', dur - 1);
        case 'zoomOut': case 'shrinkTurn': return anim(sp, 'ppt_w', '#ppt_w', '0', dur) + anim(sp, 'ppt_h', '#ppt_h', '0', dur) + effect(sp, 'out', 'fade', dur) + setVis(sp, 'hidden', dur - 1);
        case 'fadeOut': case 'floatOut': return effect(sp, 'out', 'fade', dur) + setVis(sp, 'hidden', dur - 1);
        case 'spin': return '<p:animRot by="21600000"><p:cBhvr><p:cTn id="' + nid() + '" dur="' + dur + '" fill="hold"/>' + tgt(sp) + '<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>';
        case 'grow': return '<p:animScale><p:cBhvr><p:cTn id="' + nid() + '" dur="' + dur + '" fill="hold"/>' + tgt(sp) + '</p:cBhvr><p:by x="150000" y="150000"/></p:animScale>';
        case 'teeter': return '<p:animRot by="300000"><p:cBhvr><p:cTn id="' + nid() + '" dur="' + Math.round(dur / 4) + '" autoRev="1" repeatCount="2000" fill="hold"/>' + tgt(sp) + '<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>';
        default:
          if (a.cat === 'em') return '<p:animScale><p:cBhvr><p:cTn id="' + nid() + '" dur="' + Math.round(dur / 2) + '" autoRev="1" fill="hold"/>' + tgt(sp) + '</p:cBhvr><p:by x="110000" y="110000"/></p:animScale>';
          if (a.cat === 'out') return effect(sp, 'out', 'fade', dur) + setVis(sp, 'hidden', dur - 1);
          return setVis(sp, 'visible') + effect(sp, 'in', 'fade', dur);
      }
    }
    const items = list.filter((a) => spidOf(a.el));
    if (!items.length) return '';
    // groupes « au clic », sous-groupes « après »
    const clicks = [];
    items.forEach((a, i) => { if (a.start === 'click' || !clicks.length) clicks.push({ auto: a.start !== 'click', subs: [] }); const c = clicks[clicks.length - 1]; if (a.start === 'after' || !c.subs.length) c.subs.push({ items: [] }); c.subs[c.subs.length - 1].items.push(a); void i; });
    let body = '';
    clicks.forEach((c) => {
      let t0 = 0, inner = '';
      c.subs.forEach((s) => {
        let subEnd = 0, sx = '';
        s.items.forEach((a, k) => {
          const sp = spidOf(a.el), dur = Math.round((a.dur || 0.5) * 1000), dl = Math.round((a.delay || 0) * 1000);
          const cls = a.cat === 'in' ? 'entr' : a.cat === 'out' ? 'exit' : 'emph';
          const nt = k === 0 && s === c.subs[0] ? (c.auto ? (a.start === 'after' ? 'afterEffect' : 'withEffect') : 'clickEffect') : (a.start === 'after' ? 'afterEffect' : 'withEffect');
          const cid = nid();
          sx += '<p:par><p:cTn id="' + cid + '" presetID="' + (PRESET[a.fx] || 10) + '" presetClass="' + cls + '" presetSubtype="' + (P.ANIM_DIRS[a.fx] ? SUB[a.dir || 'b'] || 0 : 0) + '" fill="hold" nodeType="' + nt + '"><p:stCondLst><p:cond delay="' + dl + '"/></p:stCondLst><p:childTnLst>' + behaviors(a, sp) + '</p:childTnLst></p:cTn></p:par>';
          subEnd = Math.max(subEnd, dl + dur);
        });
        inner += '<p:par><p:cTn id="' + nid() + '" fill="hold"><p:stCondLst><p:cond delay="' + t0 + '"/></p:stCondLst><p:childTnLst>' + sx + '</p:childTnLst></p:cTn></p:par>';
        t0 += subEnd;
      });
      body += '<p:par><p:cTn id="' + nid() + '" fill="hold"><p:stCondLst><p:cond delay="indefinite"/>' + (c.auto ? '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '') + '</p:stCondLst><p:childTnLst>' + inner + '</p:childTnLst></p:cTn></p:par>';
    });
    return '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>' + body + '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
  }
  IO.toPptx = async function (doc, progress) {
    if (!window.PptxGenJS) await O.loadScript(O.vendor + 'pptxgen.min.js');
    const t = P.theme(doc);
    const pptx = new window.PptxGenJS();
    pptx.defineLayout({ name: 'MAG', width: doc.size.w / PX_IN, height: doc.size.h / PX_IN }); pptx.layout = 'MAG';
    pptx.title = doc.title || ''; pptx.author = doc.author || ''; pptx.company = 'Suite MAG'; pptx.subject = 'Présentation';
    pptx.theme = { headFontFace: t.fonts.major, bodyFontFace: t.fonts.minor };
    IO._slideIdx = (id) => P.slideIndex(doc, id);
    const ctx = { warn: [] };
    const secs = (doc.sections || []).slice();
    let curSec = null;
    for (let i = 0; i < doc.slides.length; i++) {
      progress && progress(i, doc.slides.length);
      const s = doc.slides[i];
      const sec = secs.find((x) => x.at === s.id);
      if (sec) { pptx.addSection({ title: sec.name }); curSec = sec.name; }
      else if (!curSec && secs.length) { pptx.addSection({ title: 'Section par défaut' }); curSec = 'Section par défaut'; }
      const sl = pptx.addSlide(curSec ? { sectionTitle: curSec } : undefined);
      if (s.hidden) sl.hidden = true;
      // arrière-plan
      const bg = P.effectiveBg(doc, s);
      if (bg && bg.type === 'solid') sl.background = { color: hex(T.resolve(bg.color, t)) };
      else if (bg && bg.type === 'image' && P.blobs[bg.media] && (bg.fit || 'cover') === 'stretch') sl.background = { data: await O.blobToDataURL(P.blobs[bg.media]) };
      else if (bg) { const n = await IO.renderNode(doc, i, { only: 'background' }); n.querySelector('.sl-master').innerHTML = ''; const c = await O.Raster.canvas(n, { width: doc.size.w, height: doc.size.h, scale: 1.5 }); n.remove(); sl.background = { data: c.toDataURL('image/jpeg', 0.92) }; }
      else sl.background = { color: hex(T.resolve('t:bg1', t)) };
      // masque : décor du thème et objets du masque (objets natifs)
      if (!s.hideMaster) {
        const kind = P.layoutKind(s);
        const decor = doc.master.decor ? P.decor(doc, kind, s.layout) : [];
        for (const e of decor.concat(doc.master.elements || [])) await addEl(pptx, sl, Object.assign({}, e, { id: 'm' + i + '-' + e.id }), doc, { dx: 0, dy: 0 }, ctx);
      }
      const m = doc.master, W = doc.size.w, H = doc.size.h, onTitle = s.layout === 'title';
      if (m.logo && m.logo.media && m.logo.show && P.blobs[m.logo.media] && (!onTitle || m.logo.onTitle !== false)) {
        const md = doc.media[m.logo.media] || {}, lw = m.logo.w || 110, lh = lw * (md.h || 1) / (md.w || 1), pad = W * 0.025, pos = m.logo.pos || 'tr';
        sl.addImage({ data: await O.blobToDataURL(P.blobs[m.logo.media]), x: inch(/r$/.test(pos) ? W - pad - lw : /l$/.test(pos) ? pad : (W - lw) / 2), y: inch(/^t/.test(pos) ? pad : H - pad - lh), w: inch(lw), h: inch(lh), altText: 'Logo' });
      }
      if (!(m.hideOnTitle && onTitle)) {
        const fy = inch(H - H * 0.075), fh = inch(H * 0.05), M = W * 0.06, col = hex(T.resolve('t:tx2', t));
        if (m.date && m.date.show) sl.addText(m.date.fixed || new Date().toLocaleDateString('fr-FR'), { x: inch(M), y: fy, w: inch(W * 0.16), h: fh, fontSize: 12, color: col, fontFace: t.fonts.minor, valign: 'middle' });
        if (m.footer && m.footer.show && m.footer.text) sl.addText(m.footer.text, { x: inch(W * 0.22), y: fy, w: inch(W * 0.56), h: fh, fontSize: 12, color: col, fontFace: t.fonts.minor, align: 'center', valign: 'middle' });
        if (m.number && m.number.show) sl.slideNumber = { x: inch(W - M - W * 0.12), y: fy, w: inch(W * 0.12), h: fh, fontSize: 12, color: col, fontFace: t.fonts.minor, align: 'right' };
      }
      for (const e of s.elements) await addEl(pptx, sl, e, doc, { dx: 0, dy: 0 }, ctx);
      const notes = RT.textOf(s.notes || ''); if (notes) sl.addNotes(notes);
    }
    progress && progress(doc.slides.length, doc.slides.length);
    const ab = await pptx.write({ outputType: 'arraybuffer', compression: true });
    // compléments XML : transitions, minutage, animations
    const zip = await window.JSZip.loadAsync(ab);
    for (let i = 0; i < doc.slides.length; i++) {
      const s = doc.slides[i], f = 'ppt/slides/slide' + (i + 1) + '.xml', zf = zip.file(f); if (!zf) continue;
      let xml = await zf.async('string');
      // identifiants de forme uniques (PptxGenJS en répète parfois : PowerPoint proposerait alors une « réparation »)
      let nid = 1; xml = xml.replace(/<p:cNvPr id="\d+"/g, () => '<p:cNvPr id="' + (nid++) + '"');
      // sons : <a:audioFile> (PptxGenJS écrit <a:videoFile> pour tous les médias)
      const rz = zip.file('ppt/slides/_rels/slide' + (i + 1) + '.xml.rels');
      if (rz) { const rels = await rz.async('string'); rels.replace(/<Relationship Id="(rId\d+)" Type="[^"]*\/relationships\/audio"/g, (mm, rid) => { xml = xml.split('<a:videoFile r:link="' + rid + '"/>').join('<a:audioFile r:link="' + rid + '"/>'); return mm; }); }
      const spid = {}; xml.replace(/<p:cNvPr id="(\d+)" name="mag-([^"]+)"/g, (mm, id, nm) => { spid[nm] = id; return mm; });
      const tr = trXml(s.transition, s.advance);
      const tm = animXml(s.anims || [], (id) => spid[id]);
      if (tr || tm) {
        const at = xml.indexOf('</p:clrMapOvr>');
        const ins = tr + tm;
        if (at >= 0) xml = xml.slice(0, at + 14) + ins + xml.slice(at + 14); else xml = xml.replace('</p:sld>', ins + '</p:sld>');
      }
      if (s.hidden && !/<p:sld[^>]* show="0"/.test(xml)) xml = xml.replace(/<p:sld\b/, '<p:sld show="0"');
      zip.file(f, xml);
    }
    // propriétés du diaporama : boucle
    if (doc.settings.loop) { const pp = zip.file('ppt/presProps.xml'); if (pp) { let x = await pp.async('string'); if (/<p:showPr/.test(x)) x = x.replace(/<p:showPr\b/, '<p:showPr loop="1"'); else x = x.replace(/<p:presentationPr([^>]*)>/, '<p:presentationPr$1><p:showPr loop="1" showNarration="1"><p:present/><p:sldAll/></p:showPr>'); zip.file('ppt/presProps.xml', x); } }
    const out = await zip.generateAsync({ type: 'blob', mimeType: O.MIME.pptx, compression: 'DEFLATE' });
    return { blob: out, warn: ctx.warn };
  };

  /* =====================================================================
     IMPORT
     ===================================================================== */
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (n, name) => n ? Array.from(n.children).filter((c) => c.localName === name) : [];
  const kid = (n, name) => n ? Array.from(n.children).find((c) => c.localName === name) || null : null;
  const path = (n, p) => { for (const k of p.split('/')) { n = kid(n, k); if (!n) return null; } return n; };
  const desc = (n, name) => n ? Array.from(n.getElementsByTagNameNS('*', name)) : [];
  const attr = (n, a) => n ? n.getAttribute(a) : null;
  const rattr = (n, a) => n ? (n.getAttributeNS(NS_R, a) || n.getAttribute('r:' + a)) : null;
  const num = (v, d) => { const x = parseFloat(v); return isNaN(x) ? d : x; };
  function resolvePath(base, target) { if (/^\//.test(target)) return target.slice(1); const parts = base.split('/'); parts.pop(); target.split('/').forEach((p) => { if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); }); return parts.join('/'); }
  async function readRels(zip, file) {
    const rp = file.replace(/([^/]+)$/, '_rels/$1.rels'); const f = zip.file(rp); const out = {};
    if (!f) return out;
    const x = parseXml(await f.async('string'));
    desc(x, 'Relationship').forEach((r) => { out[r.getAttribute('Id')] = { type: (r.getAttribute('Type') || '').split('/').pop(), target: r.getAttribute('TargetMode') === 'External' ? r.getAttribute('Target') : resolvePath(file, r.getAttribute('Target')), external: r.getAttribute('TargetMode') === 'External' }; });
    return out;
  }
  /* ----- couleurs ----- */
  function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
  function hslToRgb(h, s, l) { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
  const PRST = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', orange: 'FFA500', purple: '800080', navy: '000080', silver: 'C0C0C0', darkGray: 'A9A9A9', lightGray: 'D3D3D3' };
  function colorOf(n, X, ph) {
    // n : élément qui CONTIENT la couleur (solidFill, fgClr…) ou la couleur elle-même
    if (!n) return null;
    let c = ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr'].indexOf(n.localName) >= 0 ? n : Array.from(n.children).find((k) => /Clr$/.test(k.localName));
    if (!c) return null;
    let h = '000000', alpha = 1;
    if (c.localName === 'srgbClr') h = c.getAttribute('val');
    else if (c.localName === 'sysClr') h = c.getAttribute('lastClr') || (c.getAttribute('val') === 'window' ? 'FFFFFF' : '000000');
    else if (c.localName === 'prstClr') h = PRST[c.getAttribute('val')] || '000000';
    else if (c.localName === 'scrgbClr') h = O.rgbToHex(num(c.getAttribute('r'), 0) / 1000 * 2.55, num(c.getAttribute('g'), 0) / 1000 * 2.55, num(c.getAttribute('b'), 0) / 1000 * 2.55).slice(1);
    else if (c.localName === 'schemeClr') {
      let v = c.getAttribute('val');
      if (v === 'phClr' && ph) return applyMods(ph.replace('#', ''), c, 1);
      v = (X.clrMap && X.clrMap[v]) || v;
      h = (X.scheme[v] || '000000').replace('#', '');
    }
    return applyMods(h, c, alpha);
  }
  function applyMods(h, c, alpha) {
    let rgb = O.hexToRgb('#' + h) || [0, 0, 0];
    Array.from(c.children).forEach((m) => {
      const v = num(m.getAttribute('val'), 100000) / 100000;
      if (m.localName === 'alpha') alpha = v;
      else if (m.localName === 'lumMod' || m.localName === 'lumOff') { const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]); hsl[2] = m.localName === 'lumMod' ? hsl[2] * v : hsl[2] + v; hsl[2] = O.clamp(hsl[2], 0, 1); rgb = hslToRgb(hsl[0], hsl[1], hsl[2]); }
      else if (m.localName === 'tint') rgb = rgb.map((x) => x * v + 255 * (1 - v));
      else if (m.localName === 'shade') rgb = rgb.map((x) => x * v);
      else if (m.localName === 'satMod') { const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]); hsl[1] = O.clamp(hsl[1] * v, 0, 1); rgb = hslToRgb(hsl[0], hsl[1], hsl[2]); }
    });
    return { hex: O.rgbToHex(rgb[0], rgb[1], rgb[2]), alpha };
  }
  function fillOf(spPr, X, styleFill, ctx) {
    if (!spPr) return styleFill || undefined;
    if (kid(spPr, 'noFill')) return null;
    const sf = kid(spPr, 'solidFill'); if (sf) { const c = colorOf(sf, X); return c ? { type: 'solid', color: c.hex, alpha: c.alpha < 1 ? O.round(c.alpha, 2) : undefined } : null; }
    const gf = kid(spPr, 'gradFill');
    if (gf) { const stops = desc(gf, 'gs').map((g) => { const c = colorOf(g, X); return { c: c ? c.hex : '#888888', p: Math.round(num(g.getAttribute('pos'), 0) / 1000) }; }); const lin = desc(gf, 'lin')[0]; return { type: 'gradient', kind: desc(gf, 'path')[0] ? 'radial' : 'linear', angle: lin ? Math.round(num(lin.getAttribute('ang'), 0) / 60000 + 90) % 360 : 90, stops }; }
    const bf = kid(spPr, 'blipFill'); if (bf && ctx) { const b = desc(bf, 'blip')[0]; const rid = rattr(b, 'embed'); if (rid && ctx.media[rid]) return { type: 'image', media: ctx.media[rid] }; }
    if (kid(spPr, 'grpFill')) return undefined;
    return styleFill || undefined;
  }
  const DASHI = { solid: 'solid', dash: 'dash', sysDash: 'sysDash', dot: 'dot', sysDot: 'sysDot', dashDot: 'dashDot', lgDash: 'longDash', lgDashDot: 'longDashDot', sysDashDot: 'dashDot' };
  function lineOf(spPr, X, styleLine) {
    const ln = spPr && kid(spPr, 'ln');
    if (!ln) return styleLine || null;
    if (kid(ln, 'noFill')) return null;
    const sf = kid(ln, 'solidFill'); const c = sf ? colorOf(sf, X) : null;
    const base = styleLine || {};
    const out = { color: c ? c.hex : base.color || '#000000', w: ln.getAttribute('w') ? O.round(num(ln.getAttribute('w'), 12700) / 12700, 2) : (base.w || 0.75) };
    if (c && c.alpha < 1) out.alpha = O.round(c.alpha, 2);
    const pd = kid(ln, 'prstDash'); if (pd) out.dash = DASHI[pd.getAttribute('val')] || 'solid';
    const he = kid(ln, 'headEnd'), te = kid(ln, 'tailEnd');
    const ar = (n) => { const v = n && n.getAttribute('type'); return !v || v === 'none' ? 'none' : ({ triangle: 'triangle', arrow: 'arrow', stealth: 'stealth', oval: 'oval', diamond: 'diamond' }[v] || 'triangle'); };
    if (te) out.head = ar(te); if (he) out.tail = ar(he);
    if (!sf && !c && !styleLine && !kid(ln, 'gradFill')) { if (!ln.getAttribute('w') && !pd) return null; }
    return out;
  }
  function xfrmOf(n) {
    const x = n && (kid(n, 'xfrm') || path(n, 'spPr/xfrm') || path(n, 'grpSpPr/xfrm')); if (!x) return null;
    const off = kid(x, 'off'), ext = kid(x, 'ext');
    const r = { x: num(attr(off, 'x'), 0) / EMU_PX, y: num(attr(off, 'y'), 0) / EMU_PX, w: num(attr(ext, 'cx'), 0) / EMU_PX, h: num(attr(ext, 'cy'), 0) / EMU_PX, rot: num(x.getAttribute('rot'), 0) / 60000, flipH: x.getAttribute('flipH') === '1', flipV: x.getAttribute('flipV') === '1' };
    const co = kid(x, 'chOff'), ce = kid(x, 'chExt');
    if (co && ce) { r.chx = num(attr(co, 'x'), 0) / EMU_PX; r.chy = num(attr(co, 'y'), 0) / EMU_PX; r.chw = num(attr(ce, 'cx'), 0) / EMU_PX; r.chh = num(attr(ce, 'cy'), 0) / EMU_PX; }
    return r;
  }
  /* ----- texte ----- */
  function levelProps(lst, lvl) { if (!lst) return null; return kid(lst, 'lvl' + (lvl + 1) + 'pPr'); }
  function mergedPPr(chain, lvl) {
    // chain : [pPr explicite, lstStyle forme, lstStyle disposition, lstStyle masque, txStyle masque, défaut présentation]
    const props = {}; const rp = {};
    for (let i = chain.length - 1; i >= 0; i--) {
      const p = i === 0 ? chain[0] : levelProps(chain[i], lvl); if (!p) continue;
      ['algn', 'marL', 'indent'].forEach((a) => { if (p.getAttribute(a) != null) props[a] = p.getAttribute(a); });
      const ls = kid(p, 'lnSpc'); if (ls) { const pct = desc(ls, 'spcPct')[0]; props.lnSpc = pct ? num(pct.getAttribute('val'), 100000) / 100000 : null; }
      const sb = kid(p, 'spcBef'); if (sb) { const pts = desc(sb, 'spcPts')[0]; props.spcBef = pts ? num(pts.getAttribute('val'), 0) / 100 : null; }
      const sa = kid(p, 'spcAft'); if (sa) { const pts = desc(sa, 'spcPts')[0]; props.spcAft = pts ? num(pts.getAttribute('val'), 0) / 100 : null; }
      if (kid(p, 'buNone')) props.bu = 'none';
      if (kid(p, 'buChar')) props.bu = 'char:' + kid(p, 'buChar').getAttribute('char');
      if (kid(p, 'buAutoNum')) props.bu = 'num:' + kid(p, 'buAutoNum').getAttribute('type');
      const d = kid(p, 'defRPr'); if (d) Object.assign(rp, runProps(d));
      if (kid(p, 'buClr')) props.buClr = kid(p, 'buClr');
    }
    return { props, rp };
  }
  let XG = null; // contexte de couleur courant (thème + correspondance)
  function runProps(r) {
    if (!r) return {};
    const o = {};
    if (r.getAttribute('sz')) o.size = num(r.getAttribute('sz'), 1800) / 100;
    if (r.getAttribute('b') != null) o.bold = r.getAttribute('b') === '1' || r.getAttribute('b') === 'true';
    if (r.getAttribute('i') != null) o.italic = r.getAttribute('i') === '1' || r.getAttribute('i') === 'true';
    if (r.getAttribute('u') != null) o.underline = r.getAttribute('u') !== 'none';
    if (r.getAttribute('strike') != null) o.strike = r.getAttribute('strike') !== 'noStrike';
    if (r.getAttribute('baseline')) o.baseline = num(r.getAttribute('baseline'), 0);
    if (r.getAttribute('cap') === 'all') o.upper = true;
    if (r.getAttribute('spc')) o.spc = num(r.getAttribute('spc'), 0) / 100;
    const sf = kid(r, 'solidFill'); if (sf && XG) { const c = colorOf(sf, XG); if (c) o.color = c.hex; }
    const hl = kid(r, 'highlight'); if (hl && XG) { const c = colorOf(hl, XG); if (c) o.hl = c.hex; }
    const lat = kid(r, 'latin'); if (lat) { let tf = lat.getAttribute('typeface'); if (tf === '+mj-lt') tf = XG.fonts.major; else if (tf === '+mn-lt') tf = XG.fonts.minor; if (tf) o.font = tf; }
    const hc = kid(r, 'hlinkClick'); if (hc) o.link = { rid: rattr(hc, 'id'), action: hc.getAttribute('action') };
    return o;
  }
  function txBodyHtml(txBody, chain, X, ctx, defColor) {
    if (!txBody) return '';
    XG = X;
    const lst = kid(txBody, 'lstStyle');
    const chainFull = [null, lst].concat(chain);
    const paras = kids(txBody, 'p').map((p) => {
      const pPr = kid(p, 'pPr'); const lvl = pPr ? num(pPr.getAttribute('lvl'), 0) : 0;
      chainFull[0] = pPr;
      const m = mergedPPr(chainFull, lvl);
      const runs = [];
      Array.from(p.children).forEach((r) => {
        if (r.localName === 'r' || r.localName === 'fld') {
          const t = kid(r, 't'), own = runProps(kid(r, 'rPr'));
          // couleur du style de la forme (fontRef) : passe avant les styles de liste hérités, après la couleur propre du texte
          const rp = Object.assign({}, m.rp, defColor && !own.color ? { color: defColor } : null, own);
          runs.push({ text: t ? t.textContent : '', rp, fld: r.localName === 'fld' ? r.getAttribute('type') : null });
        }
        else if (r.localName === 'br') runs.push({ br: true, rp: Object.assign({}, m.rp, runProps(kid(r, 'rPr'))) });
      });
      const endRp = Object.assign({}, m.rp, runProps(kid(p, 'endParaRPr')));
      return { lvl, props: m.props, runs, endRp };
    });
    const spanOf = (rp, text) => {
      const st = [];
      if (rp.size) st.push('font-size:' + O.round(rp.size, 1) + 'pt');
      if (rp.font) st.push('font-family:' + (rp.font === X.fonts.major ? 'var(--t-major)' : rp.font === X.fonts.minor ? 'var(--t-minor)' : O.fontStack(rp.font)));
      if (rp.color || defColor) st.push('color:' + (rp.color || defColor));
      if (rp.bold) st.push('font-weight:700'); else if (rp.bold === false) st.push('font-weight:400');
      if (rp.italic) st.push('font-style:italic');
      const dec = []; if (rp.underline) dec.push('underline'); if (rp.strike) dec.push('line-through'); if (dec.length) st.push('text-decoration:' + dec.join(' '));
      if (rp.hl) st.push('background-color:' + rp.hl);
      if (rp.upper) st.push('text-transform:uppercase');
      if (rp.spc) st.push('letter-spacing:' + rp.spc + 'pt');
      let h = O.esc(text);
      if (rp.baseline > 0) h = '<sup>' + h + '</sup>'; else if (rp.baseline < 0) h = '<sub>' + h + '</sub>';
      if (rp.link && ctx) { const rel = ctx.rels[rp.link.rid]; let href = null; if (rp.link.action && /hlinksldjump/.test(rp.link.action) && rel) href = '#slide:' + (ctx.slideIdByFile[rel.target] || ''); else if (rel && rel.external) href = rel.target; if (href) h = '<a href="' + O.esc(href) + '">' + h + '</a>'; }
      return st.length ? '<span style="' + st.join(';') + '">' + h + '</span>' : h;
    };
    let html = '', open = [];
    const closeTo = (lv) => { while (open.length > lv) html += '</' + open.pop() + '>'; };
    paras.forEach((p) => {
      const bu = p.props.bu || 'none';
      const content = p.runs.map((r) => r.br ? '<br>' : spanOf(r.rp, r.fld === 'slidenum' ? (ctx ? String(ctx.index + 1) : r.text) : r.text)).join('') || '<span style="font-size:' + O.round(p.endRp.size || 18, 1) + 'pt"><br></span>';
      const pst = [];
      const al = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[p.props.algn]; if (al) pst.push('text-align:' + al);
      if (p.props.lnSpc) pst.push('line-height:' + O.round(p.props.lnSpc * 1.2, 2));
      if (p.props.spcBef) pst.push('margin-top:' + O.round(p.props.spcBef, 1) + 'pt');
      if (p.props.spcAft) pst.push('margin-bottom:' + O.round(p.props.spcAft, 1) + 'pt');
      if (bu !== 'none') {
        const tag = /^num/.test(bu) ? 'ol' : 'ul';
        const want = p.lvl + 1;
        if (open.length > want) closeTo(want);
        while (open.length < want) { let ls = ''; if (tag === 'ol') { const ty = bu.slice(4); ls = /alphaLc/.test(ty) ? 'lower-alpha' : /alphaUc/.test(ty) ? 'upper-alpha' : /romanLc/.test(ty) ? 'lower-roman' : /romanUc/.test(ty) ? 'upper-roman' : ''; } else { const ch = bu.slice(5); ls = /[–-]/.test(ch) ? '"– "' : /[➢➤►▶Ø]/.test(ch) ? '"➤ "' : /[✓✔ü]/.test(ch) ? '"✔ "' : /[◆♦v]/.test(ch) ? '"◆ "' : /[○o]/.test(ch) ? 'circle' : /[▪■§]/.test(ch) ? 'square' : ''; } html += '<' + tag + (ls ? ' style="list-style-type:' + ls.replace(/"/g, '&quot;') + '"' : '') + '>'; open.push(tag); }
        if (open[open.length - 1] !== tag) { closeTo(open.length - 1); html += '<' + tag + '>'; open.push(tag); }
        html += '<li' + (pst.length ? ' style="' + pst.join(';') + '"' : '') + '>' + content + '</li>';
      } else {
        closeTo(0);
        const ind = p.lvl > 0 ? 'margin-left:' + (p.lvl * 36) + 'pt' : '';
        if (ind) pst.push(ind);
        html += '<div' + (pst.length ? ' style="' + pst.join(';') + '"' : '') + '>' + content + '</div>';
      }
    });
    closeTo(0);
    return RT.isEmpty(html) ? '' : html;
  }
  /* ----- lecture ----- */
  const LAYOUT_MAP = { title: 'title', obj: 'titleContent', tx: 'titleContent', secHead: 'section', twoObj: 'twoContent', twoTxTwoObj: 'comparison', titleOnly: 'titleOnly', blank: 'blank', objTx: 'caption', picTx: 'picCaption', vertTx: 'titleContent', cust: 'titleContent' };
  const TR_MAP = { fade: 'fade', push: 'push', cover: 'cover', pull: 'uncover', wipe: 'wipe', split: 'split', zoom: 'zoom', circle: 'circle', blinds: 'blinds', dissolve: 'fade', randomBar: 'blinds', cut: 'none', wedge: 'circle', wheel: 'circle', strips: 'wipe', checker: 'blinds', comb: 'blinds', diamond: 'zoom', plus: 'zoom', newsflash: 'zoom', morph: 'fade', vortex: 'zoom', flip: 'flip', ferris: 'push', gallery: 'push', conveyor: 'push', pan: 'push', reveal: 'fadeBlack', flash: 'fade', shred: 'split', switch: 'flip', doors: 'split', window: 'split', prism: 'flip', honeycomb: 'zoom', glitter: 'fade', ripple: 'circle', curtains: 'split', airplane: 'push', origami: 'flip', fracture: 'split', crush: 'zoom', peelOff: 'uncover', pageCurlDouble: 'uncover', pageCurlSingle: 'uncover', wind: 'push', vortex2: 'zoom' };
  IO.fromPptx = async function (blob, progress) {
    const zip = await window.JSZip.loadAsync(blob);
    const presF = 'ppt/presentation.xml';
    if (!zip.file(presF)) throw new Error('Ce fichier n\'est pas une présentation PowerPoint');
    const pres = parseXml(await zip.file(presF).async('string'));
    const presRels = await readRels(zip, presF);
    const sz = desc(pres, 'sldSz')[0];
    const W = Math.round(num(attr(sz, 'cx'), 12192000) / EMU_PX), H = Math.round(num(attr(sz, 'cy'), 6858000) / EMU_PX);
    const doc = P.newDoc({ empty: true }); doc.size = { w: W, h: H, name: (P.SIZES.find((s) => s.w === W && s.h === H) || { id: 'custom' }).id };
    const blobs = {};
    const mediaCache = {};
    async function media(target, name) {
      if (mediaCache[target]) return mediaCache[target];
      const f = zip.file(target); if (!f) return null;
      const ab = await f.async('arraybuffer'); const b = new Blob([ab], { type: O.mimeOf(target) });
      const id = 'm' + O.uid(); blobs[id] = b; doc.media[id] = { name: name || target.split('/').pop(), mime: b.type };
      if (/^image\//.test(b.type) && !/emf|wmf|tif/.test(b.type)) { try { const d = await P.imageSize(b); doc.media[id].w = d.w; doc.media[id].h = d.h; } catch (e) { } }
      return (mediaCache[target] = id);
    }
    // thème
    const sldIds = desc(pres, 'sldId').filter((n) => n.parentNode.localName === 'sldIdLst');
    const masterRel = Object.values(presRels).find((r) => r.type === 'slideMaster');
    const masterF = masterRel ? masterRel.target : 'ppt/slideMasters/slideMaster1.xml';
    const masterX = zip.file(masterF) ? parseXml(await zip.file(masterF).async('string')) : null;
    const masterRels = masterX ? await readRels(zip, masterF) : {};
    const themeRel = Object.values(masterRels).find((r) => r.type === 'theme') || Object.values(presRels).find((r) => r.type === 'theme');
    const scheme = {}; const fonts = { major: 'Calibri', minor: 'Calibri' };
    if (themeRel && zip.file(themeRel.target)) {
      const th = parseXml(await zip.file(themeRel.target).async('string'));
      const cs = desc(th, 'clrScheme')[0];
      if (cs) Array.from(cs.children).forEach((c) => { const v = colorOf(c, { scheme: {} }); if (v) scheme[c.localName] = v.hex; });
      const mj = desc(th, 'majorFont')[0], mn = desc(th, 'minorFont')[0];
      if (mj && kid(mj, 'latin')) fonts.major = kid(mj, 'latin').getAttribute('typeface') || fonts.major;
      if (mn && kid(mn, 'latin')) fonts.minor = kid(mn, 'latin').getAttribute('typeface') || fonts.minor;
    }
    const clrMapN = masterX && desc(masterX, 'clrMap')[0];
    const clrMap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    if (clrMapN) Array.from(clrMapN.attributes).forEach((a) => { clrMap[a.name] = a.value; });
    const X = { scheme, clrMap, fonts };
    doc.theme = { id: 'clair', colors: { dk1: scheme.dk1 || '#000000', lt1: scheme.lt1 || '#FFFFFF', dk2: scheme.dk2 || '#44546A', lt2: scheme.lt2 || '#E7E6E6', accent1: scheme.accent1 || '#4472C4', accent2: scheme.accent2 || '#ED7D31', accent3: scheme.accent3 || '#A5A5A5', accent4: scheme.accent4 || '#FFC000', accent5: scheme.accent5 || '#5B9BD5', accent6: scheme.accent6 || '#70AD47', hlink: scheme.hlink || '#0563C1' }, fonts: { major: fonts.major, minor: fonts.minor }, dark: clrMap.bg1 === 'dk1' };
    const t = P.theme(doc);
    // styles du masque
    const txStyles = masterX && desc(masterX, 'txStyles')[0];
    const titleStyle = txStyles && kid(txStyles, 'titleStyle'), bodyStyle = txStyles && kid(txStyles, 'bodyStyle'), otherStyle = txStyles && kid(txStyles, 'otherStyle');
    const defStyle = desc(pres, 'defaultTextStyle')[0];
    XG = X;
    const mt = titleStyle && runProps(desc(titleStyle, 'defRPr')[0]), mb = bodyStyle && runProps(desc(bodyStyle, 'defRPr')[0]);
    if (mt && mt.size) { doc.master.styles.title.size = mt.size; doc.master.styles.ctitle.size = Math.round(mt.size * 1.3); }
    if (mb && mb.size) { doc.master.styles.body.size = mb.size; doc.master.styles.subtitle.size = Math.round(mb.size * 0.85); }
    if (mt && mt.color) { doc.master.styles.title.color = mt.color; doc.master.styles.ctitle.color = mt.color; }
    if (mb && mb.color) doc.master.styles.body.color = mb.color;
    doc.master.styles.ctitle.bold = !!(mt && mt.bold); doc.master.styles.ctitle.align = 'center';
    doc.master.decor = false;
    // placeholders d'un fichier (disposition / masque)
    const phCache = {};
    async function loadPart(file) {
      if (phCache[file]) return phCache[file];
      const f = zip.file(file); if (!f) return null;
      const x = parseXml(await f.async('string')); const rels = await readRels(zip, file);
      const phs = [];
      const tree = desc(x, 'spTree')[0];
      if (tree) Array.from(tree.children).forEach((n) => { const ph = desc(n, 'ph')[0]; if (ph && (n.localName === 'sp' || n.localName === 'pic')) phs.push({ type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx'), node: n }); });
      const part = { x, rels, phs, file };
      return (phCache[file] = part);
    }
    const findPh = (part, type, idx) => { if (!part) return null; return part.phs.find((p) => idx != null && p.idx === idx && (p.type === type || !type)) || part.phs.find((p) => p.type === type) || (/(title|ctrTitle)/.test(type) ? part.phs.find((p) => /title|ctrTitle/i.test(p.type)) : null) || ((type === 'body' || type === 'obj' || type === 'subTitle') ? part.phs.find((p) => p.type === 'body') : null); };
    function styleColor(n, ref) { const r = n && desc(n, ref)[0]; if (!r || r.getAttribute('idx') === '0') return null; const c = colorOf(r, X); return c ? c.hex : null; }
    /* ----- conversion d'un arbre de formes ----- */
    async function convertTree(tree, ctx, chainFor, parentXfrm) {
      const out = [];
      for (const n0 of Array.from(tree.children)) {
        let n = n0;
        if (n.localName === 'AlternateContent') { const ch = kid(n, 'Choice'), fb = kid(n, 'Fallback'); const pick = (ch && ch.firstElementChild && desc(ch, 'media').length) ? ch : (fb || ch); n = pick && pick.firstElementChild; if (!n) continue; }
        const e = await convertShape(n, ctx, chainFor);
        if (!e) continue;
        if (parentXfrm && parentXfrm.chw) {
          const k = parentXfrm.w / (parentXfrm.chw || 1), q = parentXfrm.h / (parentXfrm.chh || 1);
          e.x = (e.x - parentXfrm.chx) * k; e.y = (e.y - parentXfrm.chy) * q; e.w *= k; e.h *= q;
          if (e.type === 'group' && e.children) { /* déjà relatifs */ }
        }
        out.push(e);
      }
      return out;
    }
    async function convertShape(n, ctx, chainFor) {
      const nv = kid(n, 'nvSpPr') || kid(n, 'nvPicPr') || kid(n, 'nvGrpSpPr') || kid(n, 'nvGraphicFramePr') || kid(n, 'nvCxnSpPr');
      const cNvPr = nv && kid(nv, 'cNvPr');
      if (cNvPr && cNvPr.getAttribute('hidden') === '1') return null;
      const phN = nv && desc(nv, 'ph')[0];
      const phType = phN ? (phN.getAttribute('type') || 'body') : null, phIdx = phN ? phN.getAttribute('idx') : null;
      if (phType && /^(dt|ftr|sldNum)$/.test(phType)) {
        if (ctx.kind === 'slide') { if (phType === 'sldNum') doc.master.number.show = true; if (phType === 'ftr') { const tx = desc(n, 't').map((x) => x.textContent).join(''); if (tx) { doc.master.footer.show = true; doc.master.footer.text = tx; } } if (phType === 'dt') { doc.master.date.show = true; const tx = desc(n, 't').map((x) => x.textContent).join(''); if (tx) doc.master.date.fixed = tx; } }
        return null;
      }
      if (ctx.kind !== 'slide' && phType) return null; // espaces réservés des masques et dispositions : seulement pour l'héritage
      const lph = phType ? findPh(ctx.layout, phType, phIdx) : null, mph = phType ? findPh(ctx.master, phType, phIdx) : null;
      let xf = xfrmOf(kid(n, 'spPr') || kid(n, 'grpSpPr')) || (n.localName === 'graphicFrame' ? xfrmOf(n) : null);
      if (!xf && lph) xf = xfrmOf(kid(lph.node, 'spPr'));
      if (!xf && mph) xf = xfrmOf(kid(mph.node, 'spPr'));
      if (!xf) xf = { x: 0, y: 0, w: W, h: H, rot: 0 };
      const id = P.uid();
      if (cNvPr) ctx.spid[cNvPr.getAttribute('id')] = id;
      const base = { id, x: O.round(xf.x, 2), y: O.round(xf.y, 2), w: O.round(xf.w, 2), h: O.round(xf.h, 2), rot: O.round(xf.rot || 0, 2) };
      if (xf.flipH) base.flipH = true; if (xf.flipV) base.flipV = true;
      if (cNvPr && cNvPr.getAttribute('descr')) base.alt = cNvPr.getAttribute('descr');
      if (cNvPr && cNvPr.getAttribute('name')) base.name = cNvPr.getAttribute('name');
      const hc = cNvPr && kid(cNvPr, 'hlinkClick');
      if (hc) { const rel = ctx.rels[rattr(hc, 'id')]; const act = hc.getAttribute('action') || ''; if (/hlinksldjump/.test(act) && rel) base.link = { type: 'slide', slide: ctx.slideIdByFile[rel.target] }; else if (/nextslide/.test(act)) base.link = { type: 'next' }; else if (/previousslide/.test(act)) base.link = { type: 'prev' }; else if (/firstslide/.test(act)) base.link = { type: 'first' }; else if (/lastslide/.test(act)) base.link = { type: 'last' }; else if (/endshow/.test(act)) base.link = { type: 'end' }; else if (rel && rel.external) base.link = { type: 'url', url: rel.target }; }
      switch (n.localName) {
        case 'grpSp': {
          const gx = xfrmOf(kid(n, 'grpSpPr')) || xf;
          const children = await convertTree(n, ctx, chainFor, gx.chw ? gx : Object.assign({}, gx, { chx: gx.x, chy: gx.y, chw: gx.w, chh: gx.h }));
          if (!children.length) return null;
          return Object.assign(base, { type: 'group', children });
        }
        case 'sp': case 'cxnSp': {
          const spPr = kid(n, 'spPr'), style = kid(n, 'style');
          const prst = spPr && desc(spPr, 'prstGeom')[0], cust = spPr && desc(spPr, 'custGeom')[0];
          let shape = prst ? prst.getAttribute('prst') : cust ? 'custom' : 'rect';
          const txBody = kid(n, 'txBody');
          const sFill = styleColor(style, 'fillRef'), sLine = styleColor(style, 'lnRef'), sFont = styleColor(style, 'fontRef');
          let fill = fillOf(spPr, X, sFill ? { type: 'solid', color: sFill } : undefined, ctx);
          let line = lineOf(spPr, X, sLine ? { color: sLine, w: 1 } : null);
          if (fill === undefined && lph) fill = fillOf(kid(lph.node, 'spPr'), X, undefined, ctx);
          if (fill === undefined) fill = null;
          // lignes et connecteurs
          if (n.localName === 'cxnSp' || /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(shape)) {
            const lt = /bent/.test(shape) ? 'elbow' : /curved/.test(shape) ? 'curve' : 'line';
            return Object.assign(base, { type: 'line', shape: lt, line: line || { color: sLine || '#000000', w: 1 } });
          }
          const isText = (kid(nv, 'cNvSpPr') && kid(nv, 'cNvSpPr').getAttribute('txBox') === '1') || (!!phType) || (shape === 'rect' && !fill && !line);
          const bodyPr = txBody && kid(txBody, 'bodyPr');
          const lbp = lph && desc(lph.node, 'bodyPr')[0], mbp = mph && desc(mph.node, 'bodyPr')[0];
          const bp = (k) => { for (const b of [bodyPr, lbp, mbp]) if (b && b.getAttribute(k) != null) return b.getAttribute(k); return null; };
          const anchor = bp('anchor');
          const pad = [num(bp('lIns'), 91440) / EMU_PX, num(bp('tIns'), 45720) / EMU_PX, num(bp('rIns'), 91440) / EMU_PX, num(bp('bIns'), 45720) / EMU_PX].map((v) => O.round(v, 1));
          const styleChain = /title|ctrTitle/i.test(phType || '') ? titleStyle : phType ? bodyStyle : otherStyle;
          const chain = [lph ? desc(lph.node, 'lstStyle')[0] : null, mph ? desc(mph.node, 'lstStyle')[0] : null, styleChain, defStyle];
          const defColor = !phType && !isText ? (sFont || null) : null;
          let html = txBodyHtml(txBody, chain, X, ctx, defColor);
          const e = Object.assign(base, { type: isText ? 'text' : 'shape', shape: isText ? undefined : (P.SHAPES.some((s) => s.id === shape) ? shape : shape === 'custom' ? 'custom' : 'rect'), html, va: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top', pad, fill, line, autofit: bodyPr && kid(bodyPr, 'normAutofit') ? 'shrink' : bodyPr && kid(bodyPr, 'spAutoFit') ? 'grow' : 'none', wrap: bp('wrap') !== 'none' });
          if (!isText && !e.html) delete e.va;
          if (!isText && sFont) e.txColor = sFont;
          if (bp('vert') === 'vert' || bp('vert') === 'eaVert') e.vert = 'vert'; else if (bp('vert') === 'vert270') e.vert = 'vert270';
          const numCol = bp('numCol'); if (numCol && +numCol > 1) e.cols = +numCol;
          if (shape === 'custom' && cust) { const pth = customPath(cust); if (pth) e.path = pth; else e.shape = 'rect'; }
          if (prst) { const av = desc(prst, 'gd'); if (av.length && /Rect$/.test(shape)) { const v = num((av[0].getAttribute('fmla') || '').replace('val ', ''), 16667); e.adj = { r: v / 100000 }; } }
          if (phType) {
            const map = { title: 'title', ctrTitle: 'ctitle', subTitle: 'subtitle', body: 'body', obj: 'body', pic: 'pic' };
            const role = map[phType] || 'body';
            if (role === 'pic' && !e.html) return Object.assign(base, { type: 'placeholder', ph: 'pic' });
            e.ph = role === 'body' && ctx.bodies++ > 0 ? 'body2' : role;
            if (e.ph !== 'body' && e.ph !== 'body2') delete e.phSize;
            if (!e.html && e.autofit === 'none') e.autofit = 'shrink';
          }
          const sh = spPr && desc(spPr, 'outerShdw')[0];
          if (sh) { const c = colorOf(sh, X); const dist = num(sh.getAttribute('dist'), 38100) / EMU_PX, dir = num(sh.getAttribute('dir'), 2700000) / 60000 * Math.PI / 180; e.shadow = { color: c ? c.hex : '#000000', alpha: c ? O.round(c.alpha, 2) : 0.4, blur: O.round(num(sh.getAttribute('blurRad'), 50800) / EMU_PX, 1), x: O.round(Math.cos(dir) * dist, 1), y: O.round(Math.sin(dir) * dist, 1) }; }
          return e;
        }
        case 'pic': {
          const bf = kid(n, 'blipFill'), blip = bf && kid(bf, 'blip');
          const nvPr = nv && kid(nv, 'nvPr');
          const vid = nvPr && (kid(nvPr, 'videoFile') || desc(nvPr, 'videoFile')[0]), aud = nvPr && (kid(nvPr, 'audioFile') || desc(nvPr, 'audioFile')[0]);
          const p14 = nvPr && desc(nvPr, 'media')[0];
          if (vid || aud || p14) {
            const rid = (p14 && rattr(p14, 'embed')) || rattr(vid || aud, 'link');
            const rel = ctx.rels[rid];
            const isAud = aud || (rel && /\.(mp3|wav|m4a|aac|ogg|oga|wma|flac)$/i.test(rel.target));
            const el = Object.assign(base, { type: isAud ? 'audio' : 'video' });
            if (rel && rel.external) { if (P.ytId(rel.target)) el.url = 'https://www.youtube.com/watch?v=' + P.ytId(rel.target); else el.url = rel.target; }
            else if (rel) el.media = await media(rel.target);
            if (blip && rattr(blip, 'embed') && ctx.rels[rattr(blip, 'embed')]) el.poster = await media(ctx.rels[rattr(blip, 'embed')].target);
            if (el.type === 'audio') { el.w = Math.max(48, Math.min(el.w, 80)); el.h = el.w; el.color = 't:accent1'; }
            return el;
          }
          const rid = rattr(blip, 'embed'), rel = ctx.rels[rid];
          if (!rel) return null;
          const mid = await media(rel.target);
          const sr = bf && kid(bf, 'srcRect');
          const e = Object.assign(base, { type: 'image', media: mid, alt: base.alt || '' });
          if (sr) e.crop = { l: num(sr.getAttribute('l'), 0) / 100000, t: num(sr.getAttribute('t'), 0) / 100000, r: num(sr.getAttribute('r'), 0) / 100000, b: num(sr.getAttribute('b'), 0) / 100000 };
          const lum = blip && kid(blip, 'lum'); if (lum) e.fx = { bright: num(lum.getAttribute('bright'), 0) / 1000, contrast: num(lum.getAttribute('contrast'), 0) / 1000 };
          const am = blip && kid(blip, 'alphaModFix'); if (am) e.fx = Object.assign(e.fx || {}, { alpha: num(am.getAttribute('amt'), 100000) / 100000 });
          if (blip && kid(blip, 'grayscl')) e.fx = Object.assign(e.fx || {}, { gray: true });
          const spPr = kid(n, 'spPr'), prst = spPr && desc(spPr, 'prstGeom')[0]; if (prst && prst.getAttribute('prst') !== 'rect' && P.SHAPES.some((s) => s.id === prst.getAttribute('prst'))) e.mask = prst.getAttribute('prst');
          const ln = lineOf(spPr, X, null); if (ln) e.line = ln;
          if (/emf|wmf/.test(rel.target)) e.alt = (e.alt || '') + ' (image EMF/WMF non affichable)';
          return e;
        }
        case 'graphicFrame': {
          const gd = desc(n, 'graphicData')[0]; if (!gd) return null;
          const uri = gd.getAttribute('uri') || '';
          if (/table/.test(uri)) return Object.assign(base, tableOf(desc(gd, 'tbl')[0], ctx));
          if (/chart/.test(uri)) { const c = desc(gd, 'chart')[0]; const rel = c && ctx.rels[rattr(c, 'id')]; if (rel && zip.file(rel.target)) { const ch = chartOf(parseXml(await zip.file(rel.target).async('string'))); if (ch) return Object.assign(base, { type: 'chart', chart: ch }); } return null; }
          if (/diagram/.test(uri)) {
            // SmartArt : on reprend le texte du dessin (drawing) s'il existe, sinon les données
            const rel = Object.values(ctx.rels).find((r) => r.type === 'diagramData');
            const dm = desc(gd, 'relIds')[0]; const dRel = dm ? ctx.rels[rattr(dm, 'dm')] : rel;
            if (dRel && zip.file(dRel.target)) {
              const dx = parseXml(await zip.file(dRel.target).async('string'));
              const items = desc(dx, 'pt').filter((p) => !p.getAttribute('type') || p.getAttribute('type') === 'node').map((p) => desc(p, 't').map((x) => x.textContent).join('')).filter((s) => s.trim()).map((s) => ({ text: s, level: 0 }));
              if (items.length) return Object.assign(base, { type: 'smartart', kind: 'process', palette: 'accent', items });
            }
            return null;
          }
          return null;
        }
        default: return null;
      }
    }
    function customPath(cust) {
      const p = desc(cust, 'path')[0]; if (!p) return null;
      const pw = num(p.getAttribute('w'), 0), ph = num(p.getAttribute('h'), 0);
      let d = '', cx = 0, cy = 0;
      const pt = (n) => [num(n.getAttribute('x'), 0), num(n.getAttribute('y'), 0)];
      Array.from(p.children).forEach((c) => {
        const ps = kids(c, 'pt').map(pt);
        if (c.localName === 'moveTo') { d += 'M' + ps[0].join(','); [cx, cy] = ps[0]; }
        else if (c.localName === 'lnTo') { d += ' L' + ps[0].join(','); [cx, cy] = ps[0]; }
        else if (c.localName === 'cubicBezTo') { d += ' C' + ps.map((q) => q.join(',')).join(' '); [cx, cy] = ps[2]; }
        else if (c.localName === 'quadBezTo') { d += ' Q' + ps.map((q) => q.join(',')).join(' '); [cx, cy] = ps[1]; }
        else if (c.localName === 'arcTo') {
          const wR = num(c.getAttribute('wR'), 0), hR = num(c.getAttribute('hR'), 0), st = num(c.getAttribute('stAng'), 0) / 60000 * Math.PI / 180, sw = num(c.getAttribute('swAng'), 0) / 60000 * Math.PI / 180;
          const ox = cx - wR * Math.cos(st), oy = cy - hR * Math.sin(st), ex = ox + wR * Math.cos(st + sw), ey = oy + hR * Math.sin(st + sw);
          d += ' A' + wR + ',' + hR + ' 0 ' + (Math.abs(sw) > Math.PI ? 1 : 0) + ',' + (sw > 0 ? 1 : 0) + ' ' + O.round(ex, 1) + ',' + O.round(ey, 1); cx = ex; cy = ey;
        }
        else if (c.localName === 'close') d += ' Z';
      });
      if (!d) return null;
      return { d: d.trim(), vw: pw || 1, vh: ph || 1 };
    }
    function tableOf(tbl, ctx) {
      const cols = desc(tbl, 'gridCol').map((g) => num(g.getAttribute('w'), 914400) / EMU_PX);
      const tp = kid(tbl, 'tblPr');
      const rows = kids(tbl, 'tr').map((tr) => ({ h: num(tr.getAttribute('h'), 370840) / EMU_PX, cells: kids(tr, 'tc').map((tc) => {
        const c = { html: txBodyHtml(kid(tc, 'txBody'), [null, null, otherStyle, defStyle], X, ctx, null) };
        if (tc.getAttribute('gridSpan')) c.cs = +tc.getAttribute('gridSpan');
        if (tc.getAttribute('rowSpan')) c.rs = +tc.getAttribute('rowSpan');
        if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') c.hidden = true;
        const pr = kid(tc, 'tcPr');
        if (pr) { const sf = kid(pr, 'solidFill'); if (sf) { const col = colorOf(sf, X); if (col) c.fill = col.hex; } const an = pr.getAttribute('anchor'); if (an) c.va = an === 'ctr' ? 'middle' : an === 'b' ? 'bottom' : 'top'; }
        return c;
      }) }));
      // complète les lignes courtes
      rows.forEach((r) => { while (r.cells.length < cols.length) r.cells.push({ html: '', hidden: true }); });
      return { type: 'table', cols, rows, tstyle: { id: 'medium', accent: 1, header: !tp || tp.getAttribute('firstRow') === '1', banded: !tp || tp.getAttribute('bandRow') === '1', firstCol: tp && tp.getAttribute('firstCol') === '1', lastRow: tp && tp.getAttribute('lastRow') === '1' } };
    }
    function chartOf(cx) {
      const pa = desc(cx, 'plotArea')[0]; if (!pa) return null;
      const types = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'scatterChart'];
      const tn = Array.from(pa.children).find((c) => types.indexOf(c.localName) >= 0); if (!tn) return null;
      const ch = P.newChart('bar');
      const dirN = kid(tn, 'barDir'), grp = kid(tn, 'grouping');
      const stacked = grp && /stacked/i.test(grp.getAttribute('val'));
      if (/bar/i.test(tn.localName)) ch.kind = dirN && dirN.getAttribute('val') === 'bar' ? (stacked ? 'stackedH' : 'barH') : (stacked ? 'stacked' : 'bar');
      else if (/line/i.test(tn.localName)) ch.kind = 'line'; else if (/area/i.test(tn.localName)) ch.kind = 'area'; else if (/doughnut/i.test(tn.localName)) ch.kind = 'doughnut'; else if (/pie/i.test(tn.localName)) ch.kind = 'pie'; else ch.kind = 'scatter';
      const vals = (n) => { const c = n && (desc(n, 'numCache')[0] || desc(n, 'strCache')[0]); if (!c) return []; const out = []; desc(c, 'pt').forEach((p) => { out[+p.getAttribute('idx')] = kid(p, 'v') ? kid(p, 'v').textContent : ''; }); return out; };
      const sers = kids(tn, 'ser');
      ch.series = sers.map((s, i) => { const tx = kid(s, 'tx'); const name = tx ? desc(tx, 'v').map((v) => v.textContent).join('') || desc(tx, 't').map((v) => v.textContent).join('') : 'Série ' + (i + 1); return { name, values: vals(kid(s, 'val') || kid(s, 'yVal')).map((v) => num(v, 0)) }; });
      const cats = vals(sers[0] && (kid(sers[0], 'cat') || kid(sers[0], 'xVal')));
      ch.cats = cats.length ? cats.map(String) : (ch.series[0] ? ch.series[0].values.map((_, i) => String(i + 1)) : []);
      const ti = desc(cx, 'title')[0]; ch.title = ti ? desc(ti, 't').map((x) => x.textContent).join('') : '';
      const lg = desc(cx, 'legend')[0]; const lp = lg && desc(lg, 'legendPos')[0]; ch.legend = !lg ? 'none' : lp ? ({ b: 'bottom', t: 'top', r: 'right', l: 'right', tr: 'right' }[lp.getAttribute('val')] || 'bottom') : 'right';
      ch.labels = desc(tn, 'showVal').some((x) => x.getAttribute('val') === '1') || desc(tn, 'showPercent').some((x) => x.getAttribute('val') === '1');
      if (ch.kind === 'pie' || ch.kind === 'doughnut') ch.labels = desc(tn, 'showPercent').some((x) => x.getAttribute('val') === '1') || ch.labels;
      return ch;
    }
    /* ----- diapositives ----- */
    const slideFiles = sldIds.map((s) => presRels[rattr(s, 'id')]).filter(Boolean).map((r) => r.target);
    const slideIdByFile = {}; const ourIds = slideFiles.map(() => P.uid('s')); slideFiles.forEach((f, i) => { slideIdByFile[f] = ourIds[i]; });
    const sldIdNum = sldIds.map((s) => s.getAttribute('id'));
    const master = masterX ? await loadPart(masterF) : null;
    // objets du masque (logos, bandeaux)
    if (master) {
      const tree = desc(master.x, 'spTree')[0];
      const mctx = { kind: 'master', rels: master.rels, spid: {}, slideIdByFile, media: {}, layout: null, master, index: 0, bodies: 0 };
      for (const r in master.rels) if (master.rels[r].type === 'image') mctx.media[r] = await media(master.rels[r].target);
      doc.master.elements = tree ? await convertTree(tree, mctx, null) : [];
      const mbg = bgOf(master.x, mctx); if (mbg) doc.master.bg = mbg;
    }
    function bgOf(x, ctx) {
      const bg = desc(x, 'bg')[0]; if (!bg) return null;
      const pr = kid(bg, 'bgPr');
      if (pr) { const f = fillOf(pr, X, undefined, ctx); if (f && f.type === 'solid') return { type: 'solid', color: f.color }; if (f && f.type === 'gradient') return f; if (f && f.type === 'image') return { type: 'image', media: f.media, fit: 'stretch' }; return null; }
      const ref = kid(bg, 'bgRef'); if (ref) { const c = colorOf(ref, X); if (c) return { type: 'solid', color: c.hex }; }
      return null;
    }
    for (let i = 0; i < slideFiles.length; i++) {
      progress && progress(i, slideFiles.length);
      const f = slideFiles[i]; const zf = zip.file(f); if (!zf) continue;
      const x = parseXml(await zf.async('string'));
      const rels = await readRels(zip, f);
      const layRel = Object.values(rels).find((r) => r.type === 'slideLayout');
      const layout = layRel ? await loadPart(layRel.target) : null;
      const ctx = { kind: 'slide', rels, spid: {}, slideIdByFile, media: {}, layout, master, index: i, bodies: 0 };
      for (const r in rels) if (rels[r].type === 'image') ctx.media[r] = await media(rels[r].target);
      const sld = x.documentElement;
      const s = { id: ourIds[i], layout: 'titleContent', hidden: sld.getAttribute('show') === '0', bg: null, hideMaster: sld.getAttribute('showMasterSp') === '0', elements: [], notes: '', transition: { type: 'none', dur: 0.7, dir: 'l' }, advance: { click: true, after: null }, anims: [], comments: [] };
      if (layout) { const lt = layout.x.documentElement.getAttribute('type'); s.layout = LAYOUT_MAP[lt] || 'titleContent'; if (layout.x.documentElement.getAttribute('showMasterSp') === '0') s.hideMaster = true; }
      s.bg = bgOf(x, ctx) || (layout && bgOf(layout.x, ctx)) || null;
      // objets de la disposition (hors espaces réservés) sous ceux de la diapo
      if (layout && !s.hideMaster) { const lt = desc(layout.x, 'spTree')[0]; if (lt) { const lctx = Object.assign({}, ctx, { kind: 'layout', rels: layout.rels, media: {} }); for (const r in layout.rels) if (layout.rels[r].type === 'image') lctx.media[r] = await media(layout.rels[r].target); const le = await convertTree(lt, lctx, null); le.forEach((e) => { e.fromLayout = true; }); s.elements.push(...le); } }
      const tree = desc(x, 'spTree')[0];
      if (tree) s.elements.push(...await convertTree(tree, ctx, null));
      // notes
      const nRel = Object.values(rels).find((r) => r.type === 'notesSlide');
      if (nRel && zip.file(nRel.target)) {
        const nx = parseXml(await zip.file(nRel.target).async('string'));
        const body = desc(nx, 'sp').find((sp) => { const ph = desc(sp, 'ph')[0]; return ph && ph.getAttribute('type') === 'body'; });
        if (body) { const paras = desc(body, 'p').map((p) => desc(p, 't').map((t2) => t2.textContent).join('')); const txt = paras.join('\n').trim(); if (txt) s.notes = RT.fromText(txt); }
      }
      // transition et minutage
      let tr = desc(x, 'transition')[0];
      const alt = desc(x, 'AlternateContent').find((a) => desc(a, 'transition').length); if (alt) { const fb = kid(alt, 'Fallback'); tr = (fb && desc(fb, 'transition')[0]) || desc(alt, 'transition')[0]; }
      if (tr) {
        const el = Array.from(tr.children).find((c) => c.localName !== 'sndAc' && c.localName !== 'extLst');
        if (el) { s.transition.type = el.localName === 'fade' && el.getAttribute('thruBlk') === '1' ? 'fadeBlack' : TR_MAP[el.localName] || 'fade'; const d = el.getAttribute('dir'); if (d && /^[lrud]$/.test(d)) s.transition.dir = d; }
        const spd = tr.getAttribute('spd'), dur = tr.getAttributeNS('http://schemas.microsoft.com/office/powerpoint/2010/main', 'dur') || tr.getAttribute('p14:dur');
        s.transition.dur = dur ? num(dur, 700) / 1000 : spd === 'fast' ? 0.5 : spd === 'slow' ? 1.25 : 0.75;
        if (tr.getAttribute('advTm')) s.advance.after = num(tr.getAttribute('advTm'), 0) / 1000;
        if (tr.getAttribute('advClick') === '0') s.advance.click = false;
      }
      // animations
      const timing = desc(x, 'timing')[0];
      if (timing) {
        const PRE_IN = { 1: 'appear', 10: 'fade', 2: 'fly', 42: 'float', 47: 'float', 53: 'zoom', 23: 'zoom', 22: 'wipe', 16: 'split', 26: 'bounce', 31: 'growTurn' };
        const PRE_OUT = { 1: 'disappear', 10: 'fadeOut', 2: 'flyOut', 42: 'floatOut', 53: 'zoomOut', 23: 'zoomOut', 22: 'wipeOut', 31: 'shrinkTurn' };
        const PRE_EM = { 8: 'spin', 6: 'grow', 26: 'pulse', 32: 'teeter', 35: 'blink', 27: 'colorPulse' };
        const DIRS = { 4: 'b', 8: 'l', 2: 'r', 1: 't' };
        desc(timing, 'cTn').filter((c) => c.getAttribute('presetClass')).forEach((c) => {
          const cls = c.getAttribute('presetClass'); if (!/entr|exit|emph/.test(cls)) return;
          const pid = +c.getAttribute('presetID'); const sp = desc(c, 'spTgt')[0]; if (!sp) return;
          const el = ctx.spid[sp.getAttribute('spid')]; if (!el) return;
          const nt = c.getAttribute('nodeType') || 'clickEffect';
          const bh = desc(c, 'cTn').find((k) => k.getAttribute('dur') && k.getAttribute('dur') !== '1' && k.getAttribute('dur') !== 'indefinite');
          const cond = desc(c, 'cond')[0];
          const cat = cls === 'entr' ? 'in' : cls === 'exit' ? 'out' : 'em';
          const fx = cat === 'in' ? PRE_IN[pid] || 'fade' : cat === 'out' ? PRE_OUT[pid] || 'fadeOut' : PRE_EM[pid] || 'pulse';
          const a = { id: P.uid('a'), el, cat, fx, start: nt === 'withEffect' ? 'with' : nt === 'afterEffect' ? 'after' : 'click', delay: cond ? num(cond.getAttribute('delay'), 0) / 1000 || 0 : 0, dur: bh ? num(bh.getAttribute('dur'), 500) / 1000 : 0.5 };
          const sub = DIRS[+c.getAttribute('presetSubtype')]; if (P.ANIM_DIRS[fx] && sub) a.dir = sub;
          s.anims.push(a);
        });
      }
      doc.slides.push(s);
    }
    // sections
    const secLst = desc(pres, 'section');
    if (secLst.length) {
      doc.sections = secLst.map((sec) => { const first = desc(sec, 'sldId')[0]; const k = first ? sldIdNum.indexOf(first.getAttribute('id')) : -1; return k >= 0 ? { id: P.uid('sec'), name: sec.getAttribute('name') || 'Section', at: ourIds[k] } : null; }).filter(Boolean);
    }
    // propriétés
    const core = zip.file('docProps/core.xml');
    if (core) { const cx = parseXml(await core.async('string')); const ti = desc(cx, 'title')[0], cr = desc(cx, 'creator')[0]; if (ti) doc.title = ti.textContent; if (cr) doc.author = cr.textContent; }
    if (!doc.slides.length) doc.slides.push(P.newSlide(doc, 'title'));
    void t;
    return { doc: IO.upgrade(doc), blobs };
  };
})();
