/* Présentation — rendu d'une diapositive en DOM/SVG à taille réelle (1280 × 720 px…), mis à l'échelle par CSS.
   Pres.renderSlide(doc, slide, {mode:'edit'|'thumb'|'show'|'export', index}) → <div class="sl">
   Pres.fitAll(nœud) : ajustement automatique du texte (réduction) une fois le nœud dans la page. */
(function () {
  'use strict';
  const O = window.Office, T = O.Themes, RT = O.RichText;
  const P = window.Pres = window.Pres || {};
  const esc = O.esc, f = (n) => Math.round(n * 100) / 100;
  const css = (ref) => T.css(ref);
  const PT = 96 / 72;
  let gid = 0;

  function masterVars(doc) {
    const st = doc.master.styles, out = [];
    const font = (v) => v === 'major' ? 'var(--t-major)' : v === 'minor' ? 'var(--t-minor)' : O.fontStack(v);
    Object.keys(st).forEach((k) => {
      const s = st[k];
      out.push('--m-' + k + '-font:' + font(s.font), '--m-' + k + '-size:' + s.size + 'pt', '--m-' + k + '-color:' + css(s.color), '--m-' + k + '-weight:' + (s.bold ? 700 : 400), '--m-' + k + '-style:' + (s.italic ? 'italic' : 'normal'), '--m-' + k + '-align:' + (s.align || 'left'), '--m-' + k + '-case:' + (s.caps ? 'uppercase' : 'none'));
    });
    out.push('--m-body-lh:' + (st.body.lineHeight || 1.15));
    out.push('--m-body-bullet:' + ({ disc: 'disc', circle: 'circle', square: 'square', dash: '"– "', arrow: '"➤ "', check: '"✔ "', diamond: '"◆ "' }[st.body.bullet] || 'disc'));
    return out.join(';');
  }
  /** Style CSS d'un remplissage (fond de diapo) */
  P.bgCss = function (bg, doc) {
    if (!bg) return 'background:' + css('t:bg1');
    if (bg.type === 'solid') return 'background:' + css(bg.color);
    if (bg.type === 'gradient') {
      const stops = (bg.stops || []).map((s) => css(s.c) + ' ' + s.p + '%').join(',');
      return 'background:' + (bg.kind === 'radial' ? 'radial-gradient(circle at ' + (bg.cx == null ? 50 : bg.cx) + '% ' + (bg.cy == null ? 40 : bg.cy) + '%,' + stops + ')' : 'linear-gradient(' + (bg.angle || 0) + 'deg,' + stops + ')');
    }
    if (bg.type === 'image') {
      const u = P.mediaUrl(bg.media); if (!u) return 'background:' + css('t:bg1');
      const fit = bg.fit || 'cover';
      return 'background-color:' + css(bg.base || 't:bg1') + ';background-image:url("' + u + '");background-position:center;background-repeat:' + (fit === 'tile' ? 'repeat' : 'no-repeat') + ';background-size:' + (fit === 'stretch' ? '100% 100%' : fit === 'tile' ? (bg.tile || 120) + 'px' : fit);
    }
    return 'background:' + css('t:bg1');
  };
  P.effectiveBg = (doc, slide) => slide.bg || doc.master.bg || P.theme(doc).bg;

  /* ---------------- Remplissages et contours SVG ---------------- */
  function paint(fill, defs, w, h) {
    if (!fill || fill.type === 'none') return 'none';
    if (fill.type === 'solid') return css(fill.color);
    const id = 'g' + (++gid);
    if (fill.type === 'gradient') {
      const st = (fill.stops || []).map((s) => '<stop offset="' + s.p + '%" style="stop-color:' + css(s.c) + (s.a != null ? ';stop-opacity:' + s.a : '') + '"/>').join('');
      if (fill.kind === 'radial') defs.push('<radialGradient id="' + id + '" cx="50%" cy="50%" r="70%">' + st + '</radialGradient>');
      else { const a = ((fill.angle || 0) - 90) * Math.PI / 180, x = Math.cos(a) / 2, y = Math.sin(a) / 2; defs.push('<linearGradient id="' + id + '" x1="' + f(0.5 - x) + '" y1="' + f(0.5 - y) + '" x2="' + f(0.5 + x) + '" y2="' + f(0.5 + y) + '">' + st + '</linearGradient>'); }
      return 'url(#' + id + ')';
    }
    if (fill.type === 'image') {
      const u = P.mediaUrl(fill.media); if (!u) return 'none';
      defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + f(w) + '" height="' + f(h) + '"><image href="' + u + '" width="' + f(w) + '" height="' + f(h) + '" preserveAspectRatio="xMidYMid slice"/></pattern>');
      return 'url(#' + id + ')';
    }
    return 'none';
  }
  const DASH = { solid: '', dash: '4 3', dot: '1 2', dashDot: '4 3 1 3', longDash: '8 3', longDashDot: '8 3 1 3', sysDot: '1 1', sysDash: '3 1' };
  function strokeAttrs(line) {
    if (!line || line.w === 0 || line.color == null) return ' stroke="none"';
    const w = (line.w || 1) * PT;
    const d = DASH[line.dash || 'solid'];
    return ' stroke="' + css(line.color) + '" stroke-width="' + f(w) + '"' + (line.alpha != null ? ' stroke-opacity="' + line.alpha + '"' : '') + (d ? ' stroke-dasharray="' + d.split(' ').map((x) => f(x * Math.max(1, w))).join(' ') + '"' : '') + ' stroke-linejoin="' + (line.join || 'round') + '" stroke-linecap="' + (line.cap || (d ? 'butt' : 'round')) + '"';
  }
  function shadowCss(sh) {
    if (!sh) return '';
    const c = O.hexToRgb(T.resolve(sh.color || '#000000', curTheme) || '#000000') || [0, 0, 0];
    return 'drop-shadow(' + f(sh.x == null ? 3 : sh.x) + 'px ' + f(sh.y == null ? 3 : sh.y) + 'px ' + f(sh.blur == null ? 6 : sh.blur) + 'px rgba(' + c.join(',') + ',' + (sh.alpha == null ? 0.4 : sh.alpha) + '))';
  }
  P.shadowCss = shadowCss;
  let curTheme = null, curDoc = null;

  /* ---------------- Texte ---------------- */
  function textBlock(e, ctx, box) {
    const cls = ['el-tx', 'va-' + (e.va || 'top')];
    if (e.ph) cls.push('ph', 'ph-' + phStyle(e));
    if (e.vert && e.vert !== 'horz') cls.push('vt-' + e.vert);
    if (e.wrap === false) cls.push('nowrap');
    const pad = e.pad || [9.6, 4.8, 9.6, 4.8];
    let st = 'left:' + f(box[0]) + 'px;top:' + f(box[1]) + 'px;width:' + f(box[2]) + 'px;height:' + f(box[3]) + 'px;padding:' + f(pad[1]) + 'px ' + f(pad[2]) + 'px ' + f(pad[3]) + 'px ' + f(pad[0]) + 'px;';
    let inSt = '';
    if (e.txColor) inSt += 'color:' + css(e.txColor) + ';';
    if (e.font) inSt += 'font-family:' + (e.font === 'major' ? 'var(--t-major)' : e.font === 'minor' ? 'var(--t-minor)' : O.fontStack(e.font)) + ';';
    if (e.size) inSt += 'font-size:' + e.size + 'pt;';
    if (e.phSize && !e.size) inSt += 'font-size:' + e.phSize + 'pt;';
    if (e.phBold) inSt += 'font-weight:700;';
    if (e.phItalic) inSt += 'font-style:italic;';
    if (e.phAccent) inSt += 'color:' + css('t:accent1') + ';';
    if (e.align) inSt += 'text-align:' + e.align + ';';
    if (e.lh) inSt += 'line-height:' + e.lh + ';';
    if (e.cols > 1) inSt += 'column-count:' + e.cols + ';column-gap:' + (e.colGap || 24) + 'px;';
    if (e.fit && e.fit < 1) inSt += 'zoom:' + e.fit + ';';
    const empty = RT.isEmpty(e.html);
    let prompt = '';
    if (ctx.mode === 'edit' && empty && e.ph) prompt = '<div class="ph-prompt">' + esc((P.PH[e.ph] || {}).prompt || 'Cliquez pour ajouter du texte') + '</div>';
    if (ctx.mode === 'edit' && empty && !e.ph && e.type === 'text') prompt = '<div class="ph-prompt free">Saisissez votre texte</div>';
    return '<div class="' + cls.join(' ') + '" style="' + st + '">' + prompt + '<div class="el-tx-in" style="' + inSt + '">' + (e.html || '') + '</div></div>';
  }
  function phStyle(e) { return /^(ctitle|stitle)$/.test(e.ph) ? 'ctitle' : /^(title|ctitle2|quote)$/.test(e.ph) ? 'title' : /^(subtitle|stext|author)$/.test(e.ph) ? 'subtitle' : e.ph === 'number' ? 'ctitle' : 'body'; }

  /* ---------------- Éléments ---------------- */
  function geoSvg(e, parts, w, h, extraDefs) {
    const defs = extraDefs || [];
    const fill = paint(e.fill, defs, w, h);
    const fa = e.fill && e.fill.alpha != null ? ' fill-opacity="' + e.fill.alpha + '"' : '';
    let body = '';
    parts.forEach((p) => {
      let fl = fill;
      if (p.fill === 'none') fl = 'none';
      body += '<path d="' + p.d + '" fill="' + fl + '"' + fa + ' fill-rule="evenodd"' + (p.stroke === false ? '' : strokeAttrs(e.line)) + (p.fill === 'none' && !e.line ? ' stroke="' + css(e.fill && e.fill.color || 't:tx1') + '" stroke-width="2"' : '') + '/>';
      if (p.fill === 'darken' || p.fill === 'lighten') body += '<path d="' + p.d + '" fill="' + (p.fill === 'darken' ? '#000' : '#fff') + '" fill-opacity="' + (p.fill === 'darken' ? 0.2 : 0.3) + '" stroke="none"/>';
    });
    const flip = (e.flipH || e.flipV) ? ' style="transform:scale(' + (e.flipH ? -1 : 1) + ',' + (e.flipV ? -1 : 1) + ')"' : '';
    return '<svg class="el-geo" width="' + f(w) + '" height="' + f(h) + '" viewBox="0 0 ' + f(w) + ' ' + f(h) + '"' + flip + '>' + (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') + body + '</svg>';
  }
  function marker(id, kind, color, w) {
    if (!kind || kind === 'none') return '';
    const s = Math.max(3, 3 + w * 0.9);
    const shapes = { triangle: '<path d="M0,0 L10,5 L0,10 Z"/>', arrow: '<path d="M0,0 L10,5 L0,10" fill="none" stroke-width="1.6" stroke="' + color + '"/>', stealth: '<path d="M0,0 L10,5 L0,10 L3,5 Z"/>', oval: '<circle cx="5" cy="5" r="4"/>', diamond: '<path d="M5,0 L10,5 L5,10 L0,5 Z"/>' };
    return '<marker id="' + id + '" viewBox="0 0 10 10" refX="' + (kind === 'oval' || kind === 'diamond' ? 5 : 9) + '" refY="5" markerUnits="userSpaceOnUse" markerWidth="' + f(s * 2.2) + '" markerHeight="' + f(s * 2.2) + '" orient="auto-start-reverse" fill="' + color + '">' + (shapes[kind] || shapes.triangle) + '</marker>';
  }
  /** Extrémités d'une ligne dans sa boîte (selon les retournements) */
  P.lineEnds = (e) => { const a = [e.flipH ? e.w : 0, e.flipV ? e.h : 0], b = [e.flipH ? 0 : e.w, e.flipV ? 0 : e.h]; return [a, b]; };
  function lineSvg(e) {
    const [a, b] = P.lineEnds(e), ln = e.line || { color: 't:tx1', w: 1.5 };
    const id = 'mk' + (++gid), color = css(ln.color);
    let d;
    if (/^elbow/.test(e.shape)) { const mx = (a[0] + b[0]) / 2; d = 'M' + f(a[0]) + ',' + f(a[1]) + ' H' + f(mx) + ' V' + f(b[1]) + ' H' + f(b[0]); }
    else if (/^curve/.test(e.shape)) { const mx = (a[0] + b[0]) / 2; d = 'M' + f(a[0]) + ',' + f(a[1]) + ' C' + f(mx) + ',' + f(a[1]) + ' ' + f(mx) + ',' + f(b[1]) + ' ' + f(b[0]) + ',' + f(b[1]); }
    else d = 'M' + f(a[0]) + ',' + f(a[1]) + ' L' + f(b[0]) + ',' + f(b[1]);
    const w = (ln.w || 1) * PT;
    const defs = marker(id + 'h', ln.tail, color, w) + marker(id + 't', ln.head, color, w);
    return '<svg class="el-geo line" width="' + f(Math.max(e.w, 1)) + '" height="' + f(Math.max(e.h, 1)) + '" style="overflow:visible">' + (defs ? '<defs>' + defs + '</defs>' : '') + '<path class="hit" d="' + d + '" fill="none" stroke="transparent" stroke-width="' + f(Math.max(14, w + 10)) + '"/><path d="' + d + '" fill="none"' + strokeAttrs(ln) + (ln.head && ln.head !== 'none' ? ' marker-end="url(#' + id + 't)"' : '') + (ln.tail && ln.tail !== 'none' ? ' marker-start="url(#' + id + 'h)"' : '') + '/></svg>';
  }
  function imgHtml(e, ctx) {
    const u = P.mediaUrl(e.media);
    const c = e.crop || { l: 0, t: 0, r: 0, b: 0 };
    const iw = e.w / Math.max(0.01, 1 - c.l - c.r), ih = e.h / Math.max(0.01, 1 - c.t - c.b);
    const fx = e.fx || {};
    const filt = [];
    if (fx.bright) filt.push('brightness(' + (1 + fx.bright / 100) + ')');
    if (fx.contrast) filt.push('contrast(' + (1 + fx.contrast / 100) + ')');
    if (fx.sat != null && fx.sat !== 100) filt.push('saturate(' + fx.sat / 100 + ')');
    if (fx.gray) filt.push('grayscale(1)');
    if (fx.sepia) filt.push('sepia(.8)');
    if (fx.blur) filt.push('blur(' + fx.blur + 'px)');
    let clip = '';
    let parts = null;
    if (e.mask && e.mask !== 'rect') { parts = P.shapeParts(e.mask, e.w, e.h, e.adj); clip = 'clip-path:path(evenodd,\'' + parts.map((p) => p.d).join(' ') + '\');'; }
    const flip = (e.flipH || e.flipV) ? 'transform:scale(' + (e.flipH ? -1 : 1) + ',' + (e.flipV ? -1 : 1) + ');' : '';
    let h = '<div class="img-clip" style="' + clip + flip + '">' + (u ? '<img alt="' + esc(e.alt || '') + '" src="' + u + '" draggable="false" style="left:' + f(-c.l * iw) + 'px;top:' + f(-c.t * ih) + 'px;width:' + f(iw) + 'px;height:' + f(ih) + 'px;' + (filt.length ? 'filter:' + filt.join(' ') + ';' : '') + (fx.alpha != null && fx.alpha < 1 ? 'opacity:' + fx.alpha + ';' : '') + '">' : '<div class="img-missing">' + O.icon('image-off') + '<span>Image manquante</span></div>') + '</div>';
    if (e.line && e.line.w) {
      const p = parts || [{ d: 'M0,0 H' + f(e.w) + ' V' + f(e.h) + ' H0 Z' }];
      h += '<svg class="el-geo over" width="' + f(e.w) + '" height="' + f(e.h) + '">' + p.map((x) => '<path d="' + x.d + '" fill="none"' + strokeAttrs(e.line) + '/>').join('') + '</svg>';
    }
    void ctx;
    return h;
  }
  /** Couleurs d'une cellule selon le style du tableau : {bg (#hex ou null), tx (#hex), bold, border (#hex), headLine} */
  P.tableCellStyle = function (e, ri, ci, doc) {
    const t = P.theme(doc), st = e.tstyle || {}, accHex = T.resolve('t:accent' + (st.accent || 1), t), nr = e.rows.length, r = e.rows[ri], c = r.cells[ci];
    const head = st.header !== false && ri === 0, last = st.lastRow && ri === nr - 1, first = st.firstCol && ci === 0, lastC = st.lastCol && ci === r.cells.length - 1;
    const tx1 = T.resolve('t:tx1', t);
    let bg, tx; const bold = head || last || first || lastC;
    const kind = st.id || 'medium';
    if (kind === 'none') { bg = null; tx = tx1; }
    else if (kind === 'light') { bg = head ? null : (st.banded !== false && ri % 2 === 1 ? O.tint(accHex, 0.85) : null); tx = tx1; }
    else if (kind === 'dark') { bg = head ? O.tint(accHex, -0.45) : (st.banded !== false && ri % 2 === 0 ? accHex : O.tint(accHex, -0.15)); tx = '#FFFFFF'; }
    else if (kind === 'grid') { bg = head ? accHex : null; tx = head ? O.readable(accHex) : tx1; }
    else { bg = head ? accHex : (st.banded !== false && ri % 2 === 1 ? O.tint(accHex, 0.68) : O.tint(accHex, 0.82)); tx = head ? O.readable(accHex) : '#1A1A1A'; }
    if ((last || first || lastC) && !head && (kind === 'medium' || kind === 'dark')) bg = O.tint(accHex, kind === 'dark' ? -0.35 : 0.5);
    if (c.fill) bg = T.resolve(c.fill, t);
    if (c.color) tx = T.resolve(c.color, t);
    return { bg, tx, bold, border: st.borders === false ? null : (kind === 'light' || kind === 'grid' || kind === 'none' ? accHex : '#FFFFFF'), headLine: kind === 'light' && head ? accHex : null };
  };
  function tableHtml(e, doc) {
    const st = e.tstyle || {}, rows = e.rows || [], cols = e.cols || [];
    const tw = cols.reduce((a, b) => a + b, 0) || 1;
    let h = '<table class="el-tbl' + (st.borders === false ? ' nob' : '') + '"' + (e.fontSize ? ' style="font-size:' + e.fontSize + 'pt"' : '') + '><colgroup>' + cols.map((c) => '<col style="width:' + f(c / tw * 100) + '%">').join('') + '</colgroup>';
    rows.forEach((r, ri) => {
      h += '<tr style="height:' + f(r.h || 40) + 'px">';
      r.cells.forEach((c, ci) => {
        if (c.hidden) return;
        const cs = P.tableCellStyle(e, ri, ci, doc);
        h += '<td' + (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '') + ' data-r="' + ri + '" data-c="' + ci + '" style="background:' + (cs.bg || 'transparent') + ';color:' + cs.tx + ';border-color:' + (cs.border || 'transparent') + ';vertical-align:' + (c.va || 'middle') + ';' + (cs.bold ? 'font-weight:700;' : '') + (cs.headLine ? 'border-bottom:2px solid ' + cs.headLine + ';' : '') + '"><div class="cell-in" style="' + (c.align ? 'text-align:' + c.align + ';' : '') + '">' + (c.html || '') + '</div></td>';
      });
      h += '</tr>';
    });
    return h + '</table>';
  }
  const katexCache = {};
  P.katexHtml = function (tex, display) {
    const k = (display ? 'D' : 'i') + tex;
    if (katexCache[k]) return katexCache[k];
    if (!window.katex) return null;
    try { return (katexCache[k] = window.katex.renderToString(tex || '', { throwOnError: false, displayMode: !!display, output: 'html', strict: 'ignore' })); }
    catch (er) { return '<span class="eq-err">' + esc(tex) + '</span>'; }
  };
  P.ytId = function (url) {
    const m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url || '');
    return m ? m[1] : null;
  };
  P.ytStart = (url) => { const m = /[?&#](?:t|start)=(\d+h)?(\d+m)?(\d+)s?/.exec(url || ''); if (!m) return 0; return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10); };
  function videoHtml(e, ctx) {
    const yt = e.url ? P.ytId(e.url) : null;
    if (ctx.mode === 'show') {
      const play = P.mediaStart(e);
      if (yt) return '<div class="vid-yt" data-play="' + play + '" data-yt="' + yt + '" data-start="' + (e.start || P.ytStart(e.url) || 0) + '"><div class="vid-ph">' + O.icon('youtube') + '<span>Vidéo YouTube : touchez pour lire</span></div></div>';
      // commandes propres à l'appli (les commandes natives seraient réduites avec la diapositive) : leur taille à l'écran
      // reste constante grâce à --k (échelle de la diapositive, posée par le diaporama)
      if (e.media) return '<video src="' + P.mediaUrl(e.media) + '"' + (e.poster ? ' poster="' + P.mediaUrl(e.poster) + '"' : '') + ' playsinline preload="metadata"' + (e.loop ? ' loop' : '') + (e.muted ? ' muted' : '') + ' data-play="' + play + '" data-start="' + (e.start || 0) + '" data-end="' + (e.end || 0) + '" data-rewind="' + (e.rewind ? 1 : 0) + '" data-full="' + (e.full ? 1 : 0) + '"' + (e.hideStopped ? ' data-hide="1"' : '') + '></video>' +
        '<div class="vplay" aria-hidden="true">' + O.icon('play') + '</div>' +
        '<div class="vctl"><button type="button" data-v="play" title="Lecture / pause (Alt+P)" aria-label="Lecture / pause">' + O.icon('play') + '</button><input type="range" data-v="seek" min="0" max="1000" step="1" value="0" aria-label="Position dans la vidéo"><span class="vt">0:00</span><button type="button" data-v="mute" title="Son" aria-label="Couper ou remettre le son">' + O.icon(e.muted ? 'volume-x' : 'volume-2') + '</button><button type="button" data-v="full" title="Plein écran" aria-label="Plein écran">' + O.icon('maximize') + '</button></div>';
    }
    if (e.media && !yt) {
      if (ctx.mode === 'edit') return '<video src="' + P.mediaUrl(e.media) + '#t=' + Math.max(0.1, e.start || 0.1) + '"' + (e.poster ? ' poster="' + P.mediaUrl(e.poster) + '"' : '') + ' preload="metadata" muted playsinline></video><div class="vid-badge">' + O.icon('film') + '</div>';
      if (e.poster) return '<img class="vid-poster" src="' + P.mediaUrl(e.poster) + '" alt="">' + '<div class="vid-badge">' + O.icon('play') + '</div>';
      return '<video src="' + P.mediaUrl(e.media) + '#t=' + Math.max(0.1, e.start || 0.1) + '" preload="metadata" muted playsinline></video>';
    }
    return '<div class="vid-ph' + (yt ? ' yt' : '') + '">' + O.icon(yt ? 'youtube' : 'film') + '<span>' + esc(yt ? 'YouTube' : 'Vidéo') + '</span><small>' + esc(e.url || e.name || '') + '</small></div>';
  }
  function audioHtml(e, ctx) {
    let h = '<div class="aud-ic" style="color:' + css(e.color || 't:accent1') + '">' + O.icon('volume-2') + '</div>';
    if (ctx.mode === 'show' && e.media) h += '<audio src="' + P.mediaUrl(e.media) + '" preload="auto"' + (e.loop ? ' loop' : '') + ' data-play="' + P.mediaStart(e) + '" data-start="' + (e.start || 0) + '" data-end="' + (e.end || 0) + '" data-rewind="' + (e.rewind ? 1 : 0) + '" data-across="' + (e.across ? 1 : 0) + '"></audio>';
    return h;
  }
  function elementHtml(e, doc, ctx) {
    const cls = ['el', 'el-' + e.type];
    if (e.locked) cls.push('locked');
    if (e.decor) cls.push('decor');
    const w = Math.max(e.w, 0), h = Math.max(e.h, 0);
    let st = 'left:' + f(e.x) + 'px;top:' + f(e.y) + 'px;width:' + f(w) + 'px;height:' + f(h) + 'px;';
    if (e.rot) st += 'transform:rotate(' + f(e.rot) + 'deg);';
    if (e.opacity != null && e.opacity < 1) st += 'opacity:' + e.opacity + ';';
    const filt = shadowCss(e.shadow); if (filt && e.type !== 'text') st += 'filter:' + filt + ';';
    if (e.type === 'text' && filt) st += 'filter:' + filt + ';';
    if (ctx.mode === 'show' && e.link) cls.push('has-link');
    let inner = '';
    switch (e.type) {
      case 'text': case 'shape': {
        const parts = e.type === 'shape' && e.shape === 'custom' ? [{ d: e.path ? scalePath(e.path, w, h) : '', fill: e.fill ? 'normal' : 'none', stroke: true }] : P.shapeParts(e.type === 'text' ? 'rect' : e.shape, w, h, e.adj);
        if (e.fill || e.line || e.type === 'shape') inner += geoSvg(e, parts, w, h);
        const tb = e.type === 'shape' ? P.shapeTextBox(e.shape, w, h) : [0, 0, w, h];
        if (e.type === 'text' || e.html || ctx.mode === 'edit') { const x = Object.assign({}, e); if (e.type === 'shape' && !x.txColor) x.txColor = 't:lt1'; if (e.type === 'shape' && !e.align && !RT.isEmpty(e.html)) x.align = 'center'; inner += textBlock(x, ctx, tb); }
        break;
      }
      case 'line': inner = lineSvg(e); break;
      case 'image': inner = imgHtml(e, ctx); break;
      case 'placeholder': if (ctx.mode === 'edit') inner = '<div class="ph-pic">' + O.icon('image-plus') + '<span>' + esc(P.PH.pic.prompt) + '</span></div>'; break;
      case 'table': inner = tableHtml(e, doc); break;
      case 'chart': inner = P.chartSvg(e.chart, w, h, doc); break;
      case 'smartart': inner = '<div class="sa" style="font-family:var(--t-minor)">' + P.smartHtml(e, w, h, doc) + '</div>'; break;
      case 'icon': inner = '<svg class="el-icon" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" style="color:' + css(e.color || 't:accent1') + ';stroke-width:' + (e.sw || 2) + ';fill:' + (e.iconFill ? css(e.iconFill) : 'none') + (e.flipH || e.flipV ? ';transform:scale(' + (e.flipH ? -1 : 1) + ',' + (e.flipV ? -1 : 1) + ')' : '') + '" role="img" aria-label="' + esc(e.alt || e.icon) + '">' + O.iconSvg(e.icon) + '</svg>'; break;
      case 'video': inner = videoHtml(e, ctx); break;
      case 'audio': inner = audioHtml(e, ctx); if (ctx.mode === 'show' && e.hideInShow) st += 'visibility:hidden;'; break;
      case 'equation': {
        const k = P.katexHtml(e.tex, true);
        inner = '<div class="eq" style="font-size:' + (e.size || 28) + 'pt;color:' + css(e.color || 't:tx1') + ';justify-content:' + (e.align === 'left' ? 'flex-start' : e.align === 'right' ? 'flex-end' : 'center') + '">' + (k || '<span class="eq-raw" data-tex="' + esc(e.tex) + '">' + esc(e.tex) + '</span>') + '</div>';
        break;
      }
      case 'group': inner = (e.children || []).map((c) => elementHtml(c, doc, ctx)).join(''); break;
      case 'decorBand': { const a = css(e.colors[0]), b = css(e.colors[1]); inner = '<div style="position:absolute;inset:0;background:repeating-linear-gradient(-45deg,' + a + ' 0 ' + f(e.h * 0.9) + 'px,' + b + ' ' + f(e.h * 0.9) + 'px ' + f(e.h * 1.8) + 'px)"></div>'; break; }
      default: break;
    }
    const aria = (e.type === 'image' || e.type === 'icon' || e.type === 'chart') ? ' role="img" aria-label="' + esc(e.alt || '') + '"' : '';
    return '<div class="' + cls.join(' ') + '" data-id="' + e.id + '" style="' + st + '"' + aria + (e.link ? ' data-link="' + esc(JSON.stringify(e.link)) + '"' : '') + '>' + inner + '</div>';
  }
  P.elementHtml = (e, doc, ctx) => { curTheme = P.theme(doc); curDoc = doc; return elementHtml(e, doc, ctx || { mode: 'edit' }); };
  function scalePath(p, w, h) {
    const sx = w / (p.vw || 1), sy = h / (p.vh || 1);
    return String(p.d).replace(/(-?\d*\.?\d+(?:e-?\d+)?)[ ,](-?\d*\.?\d+(?:e-?\d+)?)/gi, (m, a, b) => f(parseFloat(a) * sx) + ',' + f(parseFloat(b) * sy));
  }
  P.scalePath = scalePath;

  /* ---------------- Diapositive ---------------- */
  P.slideVars = (doc) => T.varsCss(P.theme(doc)) + ';' + masterVars(doc);
  P.renderSlide = function (doc, slide, opt) {
    opt = opt || {}; const ctx = { mode: opt.mode || 'edit', index: opt.index || 0 };
    curTheme = P.theme(doc); curDoc = doc;
    const W = doc.size.w, H = doc.size.h;
    const root = document.createElement('div');
    root.className = 'sl mode-' + ctx.mode + (curTheme.dark ? ' dark' : '');
    root.setAttribute('style', 'width:' + W + 'px;height:' + H + 'px;' + P.slideVars(doc));
    root.dataset.slide = slide.id;
    let h = '<div class="sl-bg" style="' + P.bgCss(P.effectiveBg(doc, slide), doc) + '"></div>';
    const kind = P.layoutKind(slide), m = doc.master;
    let mh = '';
    if (!slide.hideMaster) {
      if (m.decor) P.decor(doc, kind, slide.layout).forEach((e) => { mh += elementHtml(e, doc, Object.assign({}, ctx, { mode: ctx.mode === 'edit' ? 'master' : ctx.mode })); });
      (m.elements || []).forEach((e) => { mh += elementHtml(e, doc, Object.assign({}, ctx, { mode: ctx.mode === 'edit' ? 'master' : ctx.mode })); });
    }
    const onTitle = slide.layout === 'title';
    const showMeta = !(m.hideOnTitle && onTitle);
    if (m.logo && m.logo.media && m.logo.show && (!onTitle || m.logo.onTitle !== false) && !slide.hideLogo) {
      const lw = m.logo.w || 110, pad = Math.round(W * 0.025), pos = m.logo.pos || 'tr';
      const x = /r$/.test(pos) ? W - pad - lw : /l$/.test(pos) ? pad : (W - lw) / 2, y = /^t/.test(pos) ? pad : null;
      mh += '<img class="sl-logo" alt="Logo" src="' + P.mediaUrl(m.logo.media) + '" style="left:' + f(x) + 'px;' + (y != null ? 'top:' + f(y) + 'px;' : 'bottom:' + f(pad) + 'px;') + 'width:' + f(lw) + 'px">';
    }
    if (showMeta) {
      const fy = H - Math.round(H * 0.075), fh = Math.round(H * 0.05), M = Math.round(W * 0.06);
      if (m.date && m.date.show) mh += '<div class="sl-meta" style="left:' + M + 'px;top:' + fy + 'px;width:' + Math.round(W * 0.16) + 'px;height:' + fh + 'px;text-align:left">' + esc(m.date.fixed || new Date().toLocaleDateString('fr-FR')) + '</div>';
      if (m.footer && m.footer.show && m.footer.text) mh += '<div class="sl-meta" style="left:' + Math.round(W * 0.22) + 'px;top:' + fy + 'px;width:' + Math.round(W * 0.56) + 'px;height:' + fh + 'px;text-align:center">' + esc(m.footer.text) + '</div>';
      if (m.number && m.number.show) mh += '<div class="sl-meta sl-num" style="left:' + (W - M - Math.round(W * 0.12)) + 'px;top:' + fy + 'px;width:' + Math.round(W * 0.12) + 'px;height:' + fh + 'px;text-align:right">' + (ctx.index + (doc.settings.firstNumber || 1)) + '</div>';
    }
    h += '<div class="sl-master">' + mh + '</div>';
    h += '<div class="sl-els">' + (slide.elements || []).map((e) => elementHtml(e, doc, ctx)).join('') + '</div>';
    root.innerHTML = h;
    return root;
  };
  /** Rendu du masque lui-même (vue Masque) */
  P.renderMasterView = function (doc, kind, opt) {
    const s = { id: 'master', layout: kind === 'title' ? 'title' : kind === 'section' ? 'section' : 'titleContent', elements: [], hideMaster: false };
    P.layoutBoxes(s.layout, doc.size.w, doc.size.h).forEach((b) => s.elements.push(P.phEl(b.ph, b)));
    const r = P.renderSlide(doc, s, Object.assign({ mode: 'edit' }, opt || {}));
    return r;
  };

  /* ---------------- Ajustement du texte ---------------- */
  /** Réduit le texte des zones « ajustement automatique : réduire » qui débordent (zoom CSS, comme PowerPoint) */
  P.fitAll = function (root, doc, slide) {
    O.$$('.el-text, .el-shape', root).forEach((n) => {
      const id = n.dataset.id; if (!slide) return;
      const e = P.findEl(slide, id); if (!e || e.autofit !== 'shrink') return;
      const tx = n.querySelector('.el-tx'), inn = n.querySelector('.el-tx-in'); if (!tx || !inn) return;
      const cs = getComputedStyle(tx), avail = tx.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const s = tx.getBoundingClientRect().height / (tx.offsetHeight || 1) || 1;
      const fits = (k) => { inn.style.zoom = k === 1 ? '' : k; return inn.getBoundingClientRect().height / s <= avail + 1; };
      let k = 1;
      if (!fits(1)) { let lo = 0.2, hi = 1; for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; } k = Math.floor(lo * 1000) / 1000; fits(k); }
      if (k < 1) e.fit = k; else delete e.fit;
    });
  };
})();
