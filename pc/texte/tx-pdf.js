/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-texte/tx-pdf.js : ne pas modifier ici. */
/* Texte — export PDF vectoriel (jsPDF 2.5.1) à partir de la mise en page affichée : chaque mot est placé à sa
   position mesurée, avec les polices libres incluses (Mag Sans, Mag Serif, Mag Mono, Mag Sans Douce, Caladea) ;
   fonds, bordures, images, formes, équations ; liens ; signets issus des titres ; commentaires en notes PDF.
   Le même relevé sert aux vignettes (canevas). TX.Pdf.export(A, opt, progress) → Blob ; TX.Pdf.thumb(A) → data URL. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte;
  const P = TX.Pdf = {};
  const PX = TX.PX;
  /* ---------------- polices ---------------- */
  const FONT_FILES = { 'Mag Sans': 'MagSans', 'Mag Serif': 'MagSerif', 'Mag Mono': 'MagMono', 'Mag Sans Douce': 'MagSansDouce', 'Caladea': 'Caladea' };
  const FACE = (b, i) => b && i ? 'BoldItalic' : b ? 'Bold' : i ? 'Italic' : 'Regular';
  let METRICS = null; const B64 = {};
  async function metrics() { if (METRICS) return METRICS; try { METRICS = await (await fetch(O.vendor + 'fonts/metrics.json')).json(); } catch (e) { METRICS = {}; } return METRICS; }
  /** Famille PDF pour une pile CSS : la première police connue (ou son équivalent libre) */
  const MAP = [[/calibri|carlito|mag sans douce|aptos|candara|corbel|segoe|tahoma|verdana|trebuchet|roboto|noto sans|exo|bahnschrift|gill|century gothic|franklin|helvetica neue|inter|open sans|lato/, 'Mag Sans Douce'], [/cambria|caladea|georgia|constantia|palatino|garamond|book antiqua|rockwell/, 'Caladea'], [/courier|consolas|mono|cascadia|lucida console/, 'Mag Mono'], [/times|liberation serif|mag serif|noto serif|serif/, 'Mag Serif'], [/arial|helvetica|liberation sans|mag sans|sans/, 'Mag Sans']];
  P.familyOf = function (stack) {
    const names = String(stack || '').toLowerCase().split(',').map((x) => x.replace(/['"]/g, '').trim());
    for (const n of names) { if (n === 'mag sans') return 'Mag Sans'; for (const m of MAP) if (m[0].test(n)) return m[1]; }
    return 'Mag Sans Douce';
  };
  async function fontB64(file) {
    if (B64[file]) return B64[file];
    const buf = new Uint8Array(await (await fetch(O.vendor + 'fonts/' + file)).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return (B64[file] = btoa(bin));
  }
  /* ---------------- relevé d'une page ---------------- */
  const SKIP = '.tx-sheet,.tx-gap,.tx-mask,.tx-measure,.tx-cmts,.tx-hdl,.tx-pil,.tx-colhdl,.tx-hz-lbl,.ProseMirror-gapcursor,.ProseMirror-separator,.tx-sbrk';
  const visible = (cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || 1) > 0.01;
  const colorOf = (c) => { const h = O.cssToHex(c); return h || null; };
  const alphaOf = (c) => { const m = /rgba?\([^)]*,\s*([\d.]+)\)$/.exec(c || ''); return m ? +m[1] : 1; };
  /**
   * Relevé de tout le document : pour chaque page, liste d'objets à dessiner (coordonnées en pt, origine en haut à gauche de la page)
   *   {k:'rect', x,y,w,h, fill} | {k:'line', x1,y1,x2,y2, w, c, dash} | {k:'text', s, x,y(ligne de base), w, size, fam, b, i, c}
   *   {k:'img', el, x,y,w,h, rot} | {k:'link', x,y,w,h, url|dest}
   */
  P.collect = async function (A, opt) {
    opt = opt || {};
    const L = A.layout, paper = document.getElementById('paper');
    const PR = paper.getBoundingClientRect(), s = L.scale || 1;
    const pages = L.pages;
    const toP = (r) => ({ x: (r.left - PR.left) / s, y: (r.top - PR.top) / s, w: r.width / s, h: r.height / s });
    const pageAt = (y) => { let k = 0; for (let i = 0; i < pages.length; i++) if (pages[i].top <= y + 0.5) k = i; return k; };
    const out = pages.map(() => []);
    const push = (pi, o) => { if (out[pi]) out[pi].push(o); };
    const loc = (pi, x, y) => ({ x: (x - pages[pi].left) / PX, y: (y - pages[pi].top) / PX });
    const met = await metrics();
    const roots = [paper.querySelector('.tx-body'), paper.querySelector('.tx-over')];
    // 1. fonds et bordures (éléments), images, formes
    const els = [];
    roots.forEach((root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT }); let n; while ((n = w.nextNode())) els.push(n); });
    const clipOf = (y0, y1) => { // pages traversées par un élément (fond d'un paragraphe coupé)
      const list = []; pages.forEach((p, i) => { const top = Math.max(y0, p.top), bot = Math.min(y1, p.top + p.H); if (bot > top + 0.5) list.push({ i, top, bot }); }); return list;
    };
    for (const el of els) {
      const cs = getComputedStyle(el); if (!visible(cs)) continue;
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
      const b = toP(r);
      // images
      if (el.classList.contains('tx-img') && el.querySelector('img')) { push(pageAt(b.y + b.h / 2), { k: 'img', el, kind: 'img', box: b, pi: pageAt(b.y + b.h / 2) }); continue; }
      if (el.classList.contains('tx-drw-g') || (el.classList.contains('tx-math') && el.querySelector('.katex'))) { push(pageAt(b.y + b.h / 2), { k: 'img', el, kind: el.classList.contains('tx-math') ? 'math' : 'svg', box: b, pi: pageAt(b.y + b.h / 2) }); if (el.classList.contains('tx-math')) continue; }
      if (el.closest('.tx-math .katex')) continue;
      if (el.classList.contains('tx-wm')) { const sp = el.querySelector('span'), im = el.querySelector('img'); push(pageAt(b.y + 2), { k: 'wm', el, sp, im, box: b }); continue; }
      // fond
      const bg = cs.backgroundColor;
      if (bg && alphaOf(bg) > 0.02 && !el.classList.contains('tx-field') && !el.classList.contains('tx-cmt') && !el.classList.contains('tx-find') && !el.classList.contains('tx-ins') && !el.closest('.tx-hz.editing') && !el.classList.contains('tx-hz') && !el.classList.contains('tx-note')) {
        const hex = colorOf(bg);
        if (hex && !(hex === '#FFFFFF' && el.closest('.tx-over'))) {
          if (cs.display === 'inline') { for (const rr of el.getClientRects()) { const q = toP(rr); push(pageAt(q.y + q.h / 2), { k: 'rect', ...loc(pageAt(q.y + q.h / 2), q.x, q.y), w: q.w / PX, h: q.h / PX, fill: hex, op: alphaOf(bg) }); } }
          else clipOf(b.y, b.y + b.h).forEach((c) => { const p = pages[c.i]; const t0 = el.closest('.tx-body') ? Math.max(c.top, p.contentTop - 6) : c.top; const t1 = el.closest('.tx-body') ? Math.min(c.bot, Math.max(p.used, p.contentTop) + 2) : c.bot; if (t1 > t0) push(c.i, { k: 'rect', ...loc(c.i, b.x, t0), w: b.w / PX, h: (t1 - t0) / PX, fill: hex, op: alphaOf(bg) }); });
        }
      }
      // bordures
      const sides = [['Top', b.x, b.y, b.x + b.w, b.y], ['Bottom', b.x, b.y + b.h, b.x + b.w, b.y + b.h], ['Left', b.x, b.y, b.x, b.y + b.h], ['Right', b.x + b.w, b.y, b.x + b.w, b.y + b.h]];
      for (const sd of sides) {
        const st = cs['border' + sd[0] + 'Style'], w = parseFloat(cs['border' + sd[0] + 'Width']) / s;
        if (!st || st === 'none' || st === 'hidden' || !(w > 0)) continue;
        const c = colorOf(cs['border' + sd[0] + 'Color']); if (!c) continue;
        const half = w / 2; let [x1, y1, x2, y2] = sd.slice(1);
        if (sd[0] === 'Top') { y1 += half; y2 += half; } else if (sd[0] === 'Bottom') { y1 -= half; y2 -= half; } else if (sd[0] === 'Left') { x1 += half; x2 += half; } else { x1 -= half; x2 -= half; }
        if (sd[0] === 'Left' || sd[0] === 'Right') {
          clipOf(y1, y2).forEach((cc) => { const p = pages[cc.i]; let t0 = cc.top, t1 = cc.bot; if (el.closest('.tx-body')) { t0 = Math.max(t0, p.contentTop - 4); t1 = Math.min(t1, Math.max(p.used, p.contentTop) + 2); } if (t1 > t0) push(cc.i, { k: 'line', ...pair(loc(cc.i, x1, t0), loc(cc.i, x2, t1)), w: w / PX, c, dash: st }); });
        } else {
          const pi = pageAt(y1); const p = pages[pi];
          if (el.closest('.tx-body') && (y1 < p.contentTop - 6 || y1 > Math.max(p.used, p.contentTop) + 4) && !el.classList.contains('tx-toc-l')) continue;
          push(pi, { k: 'line', ...pair(loc(pi, x1, y1), loc(pi, x2, y2)), w: w / PX, c, dash: st });
        }
      }
      // liens
      if (el.tagName === 'A' && el.getAttribute('href')) { const href = el.getAttribute('href'); for (const rr of el.getClientRects()) { const q = toP(rr); const pi = pageAt(q.y + q.h / 2); push(pi, { k: 'link', ...loc(pi, q.x, q.y), w: q.w / PX, h: q.h / PX, href }); } }
      // points de suite des tabulations
      if (el.classList.contains('tx-tab') && el.getAttribute('data-lead')) { const pi = pageAt(b.y + b.h / 2); const lead = el.getAttribute('data-lead'); const y = b.y + b.h * 0.8; push(pi, { k: 'line', ...pair(loc(pi, b.x + 1, y), loc(pi, b.x + b.w - 1, y)), w: lead === 'underscore' ? 0.6 : 0.9, c: colorOf(cs.color) || '#000000', dash: lead === 'dot' ? 'dotted' : lead === 'hyphen' ? 'dashed' : 'solid' }); }
    }
    // 2. texte : mot par mot
    const rng = document.createRange();
    for (const root of roots) {
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => { const p = n.parentElement; if (!p || p.closest(SKIP) || p.closest('.tx-wm') || p.closest('.tx-tab') || p.closest('.katex') || p.closest('.tx-math-src') && false) return NodeFilter.FILTER_REJECT; return /\S/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
      let n;
      while ((n = tw.nextNode())) {
        const pe = n.parentElement, cs = getComputedStyle(pe); if (!visible(cs)) continue;
        let hidden = false; for (let x = pe; x && x !== root; x = x.parentElement) { const c2 = x === pe ? cs : getComputedStyle(x); if (c2.display === 'none' || c2.visibility === 'hidden') { hidden = true; break; } } if (hidden) continue;
        const fam = P.familyOf(cs.fontFamily), size = parseFloat(cs.fontSize), b = parseInt(cs.fontWeight, 10) >= 600, it = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
        const color = colorOf(cs.color) || '#000000', tt = cs.textTransform, sc = cs.fontVariantCaps === 'small-caps' || cs.fontVariant === 'small-caps';
        // décorations héritées (soulignement, barré)
        let under = null, strike = null;
        for (let x = pe; x && !x.classList.contains('tx-pm') && x !== root; x = x.parentElement) { const c2 = x === pe ? cs : getComputedStyle(x); const dl = c2.textDecorationLine || ''; if (!under && /underline/.test(dl)) under = { c: colorOf(c2.textDecorationColor) || color, st: c2.textDecorationStyle }; if (!strike && /line-through/.test(dl)) strike = { c: colorOf(c2.textDecorationColor) || color, st: c2.textDecorationStyle }; if (x.tagName === 'P' || x.tagName === 'TD') break; }
        const m = met[fam + '|' + FACE(b, it)] || { ascent: 0.9, descent: 0.21 };
        const data = n.data, re = /\S+/g; let mm;
        // lettrine : première lettre du paragraphe (pseudo-élément ::first-letter, plus grande)
        const dcP = pe.closest('p.tx-dc');
        let dcSkip = 0;
        if (dcP) {
          const w0 = document.createTreeWalker(dcP, NodeFilter.SHOW_TEXT, { acceptNode: (t) => /\S/.test(t.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }).nextNode();
          const i0 = w0 === n ? data.search(/\S/) : -1;
          if (i0 >= 0) {
            // la lettre occupe n lignes : hauteur de capitale = (n − 1) interlignes + hauteur de capitale du texte
            rng.setStart(n, i0 + 1); rng.setEnd(n, Math.min(data.length, i0 + 2)); const r1 = rng.getClientRects()[0];
            if (r1) {
              const fl = getComputedStyle(dcP, '::first-letter'), pcs = getComputedStyle(dcP);
              const nL = parseInt(pcs.getPropertyValue('--dc'), 10) || 3, lh = (parseFloat(pcs.lineHeight) || size * 1.2) / s;
              const fam0 = P.familyOf(fl.fontFamily || cs.fontFamily), b0 = parseInt(fl.fontWeight, 10) >= 600, i0b = fl.fontStyle === 'italic';
              const fsb = size / s, CAP = 0.66, fs0 = ((nL - 1) * lh + CAP * fsb) / CAP;
              const q1 = toP(r1), base1 = q1.y + (q1.h - (m.ascent + m.descent) * fsb) / 2 + m.ascent * fsb;
              const pr = toP(dcP.getBoundingClientRect()), x0 = pr.x + (parseFloat(pcs.paddingLeft) || 0) / s * 0 + (dcP.classList.contains('tx-dcm') ? -fs0 * 0.75 : 0);
              const pi = pageAt(base1), pt = loc(pi, x0, base1 + (nL - 1) * lh);
              push(pi, { k: 'text', s: data[i0], x: pt.x, y: pt.y, w: 0, size: fs0 / PX, fam: fam0, b: b0, i: i0b, c: colorOf(fl.color) || color });
              dcSkip = i0 + 1;
            }
          }
        }
        while ((mm = re.exec(data))) {
          if (dcSkip && mm.index < dcSkip) { const st2 = dcSkip; mm = { index: st2, 0: data.slice(st2, mm.index + mm[0].length) }; if (!mm[0]) continue; mm[0] = mm[0]; mm.length = 1; }
          rng.setStart(n, mm.index); rng.setEnd(n, mm.index + mm[0].length);
          const rects = Array.from(rng.getClientRects()).filter((r) => r.width > 0.1);
          if (!rects.length) continue;
          const pieces = rects.length === 1 ? [[mm[0], rects[0]]] : splitByRects(n, mm.index, mm[0], rects, rng);
          for (const [str, r] of pieces) {
            const q = toP(r), pi = pageAt(q.y + q.h / 2);
            let txt = str; if (tt === 'uppercase' || sc) txt = txt.toLocaleUpperCase('fr'); else if (tt === 'lowercase') txt = txt.toLocaleLowerCase('fr'); else if (tt === 'capitalize') txt = txt.replace(/^\p{L}/u, (c) => c.toLocaleUpperCase('fr'));
            const fs = size / s * (sc && str !== str.toLocaleUpperCase('fr') ? 0.8 : 1);
            const boxH = q.h, content = (m.ascent + m.descent) * fs;
            const base = q.y + (boxH - content) / 2 + m.ascent * fs;
            const pt = loc(pi, q.x, base);
            const trail = /\s/.test(data[mm.index + mm[0].length] || '') && str === pieces[pieces.length - 1][0];
            push(pi, { k: 'text', s: txt, sp: trail, x: pt.x, y: pt.y, w: q.w / PX, size: fs / PX, fam, b, i: it, c: color });
            if (under) { const uy = base + fs * 0.12; push(pi, { k: 'line', ...pair(loc(pi, q.x, uy), loc(pi, q.x + q.w, uy)), w: Math.max(0.5, fs / 16 / PX), c: under.c, dash: under.st === 'double' ? 'double' : under.st }); }
            if (strike) { const sy = base - fs * 0.3; push(pi, { k: 'line', ...pair(loc(pi, q.x, sy), loc(pi, q.x + q.w, sy)), w: Math.max(0.5, fs / 16 / PX), c: strike.c, dash: strike.st === 'double' ? 'double' : 'solid' }); }
          }
        }
        // soulignement continu sous les espaces entre mots soulignés
        if (under && /\s/.test(data.trim())) { rng.selectNodeContents(n); for (const r of rng.getClientRects()) { const q = toP(r), pi = pageAt(q.y + q.h / 2); const uy = q.y + (q.h - (m.ascent + m.descent) * size / s) / 2 + m.ascent * size / s + size / s * 0.12; push(pi, { k: 'line', ...pair(loc(pi, q.x, uy), loc(pi, q.x + q.w, uy)), w: Math.max(0.5, size / s / 16 / PX), c: under.c, dash: under.st }); } }
      }
    }
    return { pages: out, meta: pages };
  };
  function pair(a, b) { return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }
  /** Mot coupé sur deux lignes (césure, mot très long) : un morceau par rectangle */
  function splitByRects(node, start, word, rects, rng) {
    const out = []; let cur = '', curTop = null, curRect = null;
    for (let k = 0; k < word.length; k++) {
      rng.setStart(node, start + k); rng.setEnd(node, start + k + 1); const r = rng.getClientRects()[0]; if (!r) continue;
      if (curTop == null || Math.abs(r.top - curTop) < 2) { cur += word[k]; if (curTop == null) { curTop = r.top; curRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; } else curRect.right = r.right; }
      else { out.push([cur, { left: curRect.left, top: curRect.top, width: curRect.right - curRect.left, height: curRect.bottom - curRect.top }]); cur = word[k]; curTop = r.top; curRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }
    }
    if (cur) out.push([cur, { left: curRect.left, top: curRect.top, width: curRect.right - curRect.left, height: curRect.bottom - curRect.top }]);
    return out;
  }
  /* ---------------- images (rendu fidèle : rognage, rotation, symétrie) ---------------- */
  async function rasterize(it, scale, A) {
    const el = it.el, b = it.box;
    if (it.kind === 'img') {
      const img = el.querySelector('img'); await (img.decode ? img.decode().catch(() => { }) : null);
      const er = el.getBoundingClientRect(), s = A.layout.scale || 1;
      // dimensions de l'image affichée (sans rotation)
      const cw = el.offsetWidth, ch = el.offsetHeight;
      const k = Math.min(4, Math.max(1, Math.min(img.naturalWidth / cw, 2400 / Math.max(cw, ch)) * scale));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(er.width / s * k)); c.height = Math.max(1, Math.round(er.height / s * k));
      const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2);
      const tf = getComputedStyle(el).transform; if (tf && tf !== 'none') { const m = new DOMMatrix(tf); x.transform(m.a, m.b, m.c, m.d, 0, 0); }
      x.scale(k, k); x.translate(-cw / 2, -ch / 2);
      const inner = el.querySelector('.tx-img-in'); x.beginPath(); x.rect(0, 0, inner.offsetWidth, inner.offsetHeight); x.clip();
      x.drawImage(img, img.offsetLeft, img.offsetTop, img.offsetWidth, img.offsetHeight);
      const ol = parseFloat(getComputedStyle(el).outlineWidth) || 0; if (ol && getComputedStyle(el).outlineStyle !== 'none') { x.strokeStyle = getComputedStyle(el).outlineColor; x.lineWidth = ol; x.strokeRect(ol / 2, ol / 2, cw - ol, ch - ol); }
      const alpha = /png|gif|svg|webp/.test((TX.media.blobs[(img.closest('[data-m]') || {}).dataset && 0] || {}).type || img.src.slice(0, 30)) || /^data:image\/(png|gif|svg)|blob:/.test(img.src) && /png|svg|gif/.test(img.getAttribute('src'));
      return { url: c.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.9), w: b.w, h: b.h, x: b.x, y: b.y, fmt: alpha ? 'PNG' : 'JPEG' };
    }
    if (it.kind === 'svg') {
      const svg = el.querySelector('svg'); if (!svg) return null;
      const theme = A.theme ? A.theme() : TX.themeOf({});
      let src = new XMLSerializer().serializeToString(svg);
      src = O.Themes.flatten(src, theme).replace(/var\(--t-major\)|var\(--t-minor\)/g, 'Arial');
      if (!/xmlns=/.test(src)) src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      src = src.replace(/width="100%"/, 'width="' + b.w + '"').replace(/height="100%"/, 'height="' + b.h + '"');
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
      await new Promise((r) => { img.onload = r; img.onerror = r; });
      const k = 3 * scale, c = document.createElement('canvas'); c.width = Math.max(1, Math.round(b.w * k)); c.height = Math.max(1, Math.round(b.h * k));
      try { c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); } catch (e) { return null; }
      return { url: c.toDataURL('image/png'), w: b.w, h: b.h, x: b.x, y: b.y, fmt: 'PNG' };
    }
    if (it.kind === 'math') {
      try {
        // rendu plus large que la boîte (polices de l'image légèrement différentes), puis rognage du vide à droite
        const k = 3 * scale, c = await O.Raster.canvas(el, { scale: k, fonts: true, width: Math.ceil(el.offsetWidth * 1.4) + 8, height: el.offsetHeight + 2, css: '.katex,.katex *{white-space:nowrap!important}' });
        const x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data; let right = 0;
        for (let i = 3; i < d.length; i += 4) { if (d[i] > 8) { const col = ((i - 3) / 4) % c.width; if (col > right) right = col; } }
        const cw = Math.max(1, right + 2), out = document.createElement('canvas'); out.width = cw; out.height = c.height; out.getContext('2d').drawImage(c, 0, 0);
        const f = Math.min(1, b.w / (cw / k)), hh = c.height / k * f;
        return { url: out.toDataURL('image/png'), w: cw / k * f, h: hh, x: b.x, y: b.y + (b.h - hh) / 2, fmt: 'PNG' };
      } catch (e) { return null; }
    }
    return null;
  }
  /* ---------------- préparation de l'affichage pour l'export ---------------- */
  async function prepare(A, opt) {
    const st = { view: A.settings.view, marks: A.settings.marks, rev: A.settings.rev, merge: null };
    if (A.partEd) A.closePart(true);
    const paper = document.getElementById('paper');
    paper.classList.add('tx-print');
    const v = A.ed.view;
    const fq = TX.findKey.getState(v.state).q;
    if (fq) A.find(null);
    v.dispatch(v.state.tr.setMeta(TX.cmtKey, { active: null }).setMeta(TX.marksKey, { on: false }).setMeta('addToHistory', false).setMeta('tx-layout', 1));
    const d = v.dom; d.classList.remove('tx-rev-final', 'tx-rev-orig', 'tx-rev-simple'); if (!opt.markup) d.classList.add('tx-rev-final');
    if (st.view !== 'page') { A.layout.mode = 'page'; paper.classList.remove('tx-web'); }
    A.layout.run();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return () => {
      paper.classList.remove('tx-print');
      d.classList.remove('tx-rev-final'); if (st.rev && st.rev !== 'all') d.classList.add('tx-rev-' + st.rev);
      v.dispatch(v.state.tr.setMeta(TX.marksKey, { on: !!st.marks }).setMeta('addToHistory', false).setMeta('tx-layout', 1));
      if (fq) A.find(fq);
      if (st.view !== 'page') A.setView(st.view, true);
      A.layout.run();
    };
  }
  /* ---------------- export PDF ---------------- */
  /* Session d'export : plusieurs passages (publipostage : un passage par destinataire) dans un même PDF */
  P.session = async function (A, opt) {
    opt = opt || {};
    const J = await O.Pdf.load();
    const restore = await prepare(A, opt);
    return { A, opt, J, doc: null, fonts: new Set(), cmaps: {}, restore, root: null };
  };
  async function fontsFor(S, list) {
    const need = new Set(['Mag Sans Douce|Regular']); list.forEach((o) => { if (o.k === 'text') need.add(o.fam + '|' + FACE(o.b, o.i)); });
    for (const key of need) { if (S.fonts.has(key)) continue; S.fonts.add(key); const [fam, face] = key.split('|'); const file = FONT_FILES[fam] + '-' + face + '.ttf'; S.doc.addFileToVFS(file, await fontB64(file)); S.doc.addFont(file, fam, face); }
  }
  /** Ajoute au PDF les pages de la mise en page actuelle (label : signet de premier niveau) */
  P.addPages = async function (S, progress, label) {
    const A = S.A, opt = S.opt;
    const col = await P.collect(A, opt);
    const pages = col.meta;
    let doc = S.doc;
    const cmaps = S.cmaps;
    const sel = (o) => { const face = FACE(o.b, o.i); doc.setFont(o.fam, face); const k = o.fam + '|' + face; if (!(k in cmaps)) { try { const f = doc.getFont(); cmaps[k] = f.metadata && f.metadata.cmap && f.metadata.cmap.unicode && f.metadata.cmap.unicode.codeMap; } catch (e) { cmaps[k] = null; } } return cmaps[k]; };
    const pageSel = opt.pages ? pageList(opt.pages, pages.length) : null;
    const pdfIndex = {}; let firstPage = null;
      for (let pi = 0; pi < pages.length; pi++) {
        if (pageSel && !pageSel.has(pi + 1)) continue;
        const p = pages[pi], W = p.W / PX, H = p.H / PX;
        if (!S.doc) S.doc = doc = new S.J({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait', compress: true }); else doc.addPage([W, H], W > H ? 'landscape' : 'portrait');
        await fontsFor(S, col.pages[pi]);
        pdfIndex[pi] = doc.getNumberOfPages(); if (firstPage == null) firstPage = pdfIndex[pi];
        if (progress) progress(pi, pages.length);
        const settings = A.attrs().settings || {};
        if (settings.pageColor) { doc.setFillColor(TX.color(settings.pageColor)); doc.rect(0, 0, W, H, 'F'); }
        const list = col.pages[pi];
        // filigrane (sous le texte)
        for (const o of list.filter((x) => x.k === 'wm')) await drawWm(doc, o, p, W, H);
        for (const o of list) {
          if (o.k === 'rect') { doc.setFillColor(o.fill); if (o.op < 0.99 && doc.GState) { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: o.op })); doc.rect(o.x, o.y, o.w, o.h, 'F'); doc.restoreGraphicsState(); } else doc.rect(o.x, o.y, o.w, o.h, 'F'); }
        }
        for (const o of list) if (o.k === 'img') { const r = await rasterize(o, opt.thumb ? 0.5 : 1, A); if (r) { const pos = { x: (r.x - p.left) / PX, y: (r.y - p.top) / PX }; try { doc.addImage(r.url, r.fmt, pos.x, pos.y, r.w / PX, r.h / PX, undefined, 'FAST'); } catch (e) { console.warn('image', e); } } }
        for (const o of list) if (o.k === 'line') drawLine(doc, o);
        for (const o of list) {
          if (o.k !== 'text') continue;
          const cmap = sel(o); doc.setFontSize(o.size); doc.setTextColor(o.c);
          let str = o.s; if (cmap) str = Array.from(str).map((ch) => (cmap[ch.codePointAt(0)] != null ? ch : SUBST[ch] || (ch.codePointAt(0) > 255 ? '?' : ch))).join('');
          const tw = doc.getTextWidth(str); const hs = tw > 0 ? o.w / tw : 1;
          if (o.sp) str += ' ';
          doc.text(str, o.x, o.y, { baseline: 'alphabetic', horizontalScale: Math.abs(hs - 1) > 0.01 && hs > 0.3 && hs < 3 ? hs : undefined });
        }
        for (const o of list) if (o.k === 'link') {
          if (/^#/.test(o.href)) { const t = A.linkTarget ? A.linkTarget(o.href) : linkTarget(A, o.href); if (t != null && pdfIndex[t] != null || t != null) doc.link(o.x, o.y, o.w, o.h, { pageNumber: (pdfIndex[t] || t + 1) }); }
          else if (/^(https?:|mailto:|tel:)/.test(o.href)) doc.link(o.x, o.y, o.w, o.h, { url: o.href });
        }
      }
      // signets (titres)
      if (opt.outline !== false && doc && doc.outline) {
        if (label) S.root = doc.outline.add(null, O.Pdf.safe(label).slice(0, 120), { pageNumber: firstPage || 1 }); else S.root = null;
        const st = TX.numKey.getState(A.ed.view.state); const stack = [];
        st.heads.forEach((h) => { const pi = A.layout.pageIndexOf(h.pos); const pn = pdfIndex[pi]; if (pn == null) return; while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop(); const parent = stack.length ? stack[stack.length - 1].node : null; const node = doc.outline.add(parent || S.root, O.Pdf.safe((h.label ? h.label + ' ' : '') + h.text).slice(0, 120) || 'Titre', { pageNumber: pn }); stack.push({ level: h.level, node }); });
      }
      // commentaires : notes PDF à l'emplacement du texte commenté
      if (opt.comments && A.commentList) {
        const v = A.ed.view, PR = document.getElementById('paper').getBoundingClientRect(), s = A.layout.scale || 1;
        A.commentList().forEach((x) => { try { const c = v.coordsAtPos(x.pos + 1); const y = (c.top - PR.top) / s, xx = (c.left - PR.left) / s; const pi = A.layout.pageIndexOf(x.pos); const pn = pdfIndex[pi]; if (pn == null) return; doc.setPage(pn); const p = pages[pi]; doc.createAnnotation({ type: 'text', title: x.c.a || 'Auteur', contents: [x.c.t].concat(x.replies.map((r) => (r.c.a || '') + ' : ' + r.c.t)).join('\n'), bounds: { x: (xx - p.left) / PX, y: (y - p.top) / PX - 10, w: 16, h: 16 }, open: false }); } catch (e) { } });
      }
  };
  P.finish = function (S) {
    const A = S.A, doc = S.doc; if (!doc) throw new Error('Document vide');
    const pr = A.attrs().props || {};
    doc.setProperties({ title: pr.title || A.docName(), author: pr.author || '', subject: pr.subject || '', keywords: pr.keywords || '', creator: 'Texte (Suite MAG)' });
    try { doc.setLanguage('fr-FR'); } catch (e) { }
    return doc.output('blob');
  };
  P.export = async function (A, opt, progress) {
    const S = await P.session(A, opt);
    try { await P.addPages(S, progress); if (progress) progress(1, 1, true); return P.finish(S); }
    finally { S.restore(); }
  };
  const SUBST = { '➤': '►', '✔': '✓', '✘': 'x', '☐': '□', '☑': '■', '☒': '■', '◇': '◊', '–': '-', ' ': ' ', '‑': '-' };
  function pageList(s, n) { const set = new Set(); String(s).split(/[,;]/).forEach((part) => { const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part); if (m) { const a = +m[1], b = m[2] ? +m[2] : a; for (let k = Math.max(1, a); k <= Math.min(n, b); k++) set.add(k); } }); return set.size ? set : null; }
  function linkTarget(A, href) {
    const name = href.replace(/^#(bk-)?/, ''); const doc = A.ed.view.state.doc; let pos = null;
    doc.descendants((n, p) => { if (pos == null && ((n.type.name === 'bookmark' && n.attrs.name === name) || (n.type.name === 'paragraph' && n.attrs.pid === name))) pos = p; return pos == null; });
    return pos == null ? null : A.layout.pageIndexOf(pos);
  }
  function drawLine(doc, o) {
    doc.setDrawColor(o.c); doc.setLineWidth(Math.max(0.1, o.w));
    const dash = o.dash === 'dotted' ? [Math.max(0.5, o.w), Math.max(1.5, o.w * 2)] : o.dash === 'dashed' ? [o.w * 4 + 1.5, o.w * 3 + 1] : [];
    doc.setLineDashPattern(dash, 0);
    if (o.dash === 'double' && o.w >= 1.5) { const g = o.w / 3, dx = o.x1 === o.x2 ? g : 0, dy = o.y1 === o.y2 ? g : 0; doc.setLineWidth(g); doc.line(o.x1 - dx, o.y1 - dy, o.x2 - dx, o.y2 - dy); doc.line(o.x1 + dx, o.y1 + dy, o.x2 + dx, o.y2 + dy); }
    else doc.line(o.x1, o.y1, o.x2, o.y2);
    doc.setLineDashPattern([], 0);
  }
  async function drawWm(doc, o, p, W, H) {
    if (o.im) { try { const c = document.createElement('canvas'); const im = o.im; c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.globalAlpha = parseFloat(getComputedStyle(im).opacity) || 1; x.drawImage(im, 0, 0); const r = im.getBoundingClientRect(), s = TexteApp.layout.scale || 1; const w = r.width / s / PX, h = r.height / s / PX; doc.addImage(c.toDataURL('image/png'), 'PNG', (W - w) / 2, (H - h) / 2, w, h); } catch (e) { } return; }
    if (!o.sp) return;
    const cs = getComputedStyle(o.sp); const size = parseFloat(cs.fontSize) / PX; const op = parseFloat(cs.opacity) || 0.5;
    const rot = /rotate\(0/.test(o.sp.style.transform) ? 0 : 45;
    doc.setFont('Mag Sans Douce' in doc.getFontList() ? 'Mag Sans Douce' : 'helvetica', 'normal');
    doc.setFontSize(size); const c = O.cssToHex(cs.color) || '#BFBFBF'; doc.setTextColor(c);
    if (doc.GState) { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: op })); }
    const txt = O.Pdf.safe(o.sp.textContent); const tw = doc.getTextWidth(txt);
    const a = rot * Math.PI / 180; const cx = W / 2 - Math.cos(a) * tw / 2 - Math.sin(a) * size * 0.35, cy = H / 2 + Math.sin(a) * tw / 2 - Math.cos(a) * size * 0.35 + size * 0.7;
    doc.text(txt, cx, cy, { angle: rot });
    if (doc.GState) doc.restoreGraphicsState();
  }

  /* ---------------- vignette (première page, canevas) ---------------- */
  P.thumb = async function (A, width) {
    width = width || 240;
    const L = A.layout; if (!L.pages.length || L.mode !== 'page') return '';
    const col = await P.collect(A, { thumb: true }); const p = L.pages[0], list = col.pages[0];
    const k = width / (p.W / PX), c = document.createElement('canvas'); c.width = width; c.height = Math.round(p.H / PX * k);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.scale(k, k);
    list.forEach((o) => { if (o.k === 'rect') { x.fillStyle = o.fill; x.globalAlpha = o.op || 1; x.fillRect(o.x, o.y, o.w, o.h); x.globalAlpha = 1; } });
    for (const o of list) if (o.k === 'img') { const r = await rasterize(o, 0.3, A); if (r) { const im = new Image(); im.src = r.url; await new Promise((ok) => { im.onload = ok; im.onerror = ok; }); try { x.drawImage(im, (r.x - p.left) / PX, (r.y - p.top) / PX, r.w / PX, r.h / PX); } catch (e) { } } }
    list.forEach((o) => { if (o.k === 'line') { x.strokeStyle = o.c; x.lineWidth = Math.max(0.3, o.w); x.beginPath(); x.moveTo(o.x1, o.y1); x.lineTo(o.x2, o.y2); x.stroke(); } });
    list.forEach((o) => { if (o.k === 'text') { x.fillStyle = o.c; x.font = (o.i ? 'italic ' : '') + (o.b ? '700 ' : '400 ') + o.size + 'px "' + o.fam + '", sans-serif'; x.fillText(o.s, o.x, o.y); } });
    return c.toDataURL('image/jpeg', 0.72);
  };
  /** Rendu des pages en images (export en images, aperçu d'impression) */
  P.pageImages = async function (A, scale) { void A; void scale; return []; };
})();
