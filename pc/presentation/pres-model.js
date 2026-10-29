/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-presentation/pres-model.js : ne pas modifier ici. */
/* Présentation — modèle du document (.magpres) : diapositives, dispositions, masque, médias, décors des thèmes.
   Unités : pixels à 96 ppp (16:9 = 1280 × 720 = 13,33 × 7,5 pouces, comme PowerPoint) ; tailles de police en points. */
(function () {
  'use strict';
  const O = window.Office, T = O.Themes;
  const P = window.Pres = window.Pres || {};
  P.VERSION = 1;
  P.SIZES = [
    { id: '16:9', name: 'Grand écran 16:9', w: 1280, h: 720 },
    { id: '4:3', name: 'Standard 4:3', w: 960, h: 720 },
    { id: '16:10', name: '16:10', w: 1280, h: 800 },
    { id: 'A4', name: 'A4 paysage', w: 1123, h: 794 },
    { id: 'A4p', name: 'A4 portrait', w: 794, h: 1123 },
    { id: '1:1', name: 'Carré 1:1', w: 1080, h: 1080 },
    { id: '9:16', name: 'Vertical 9:16 (téléphone)', w: 720, h: 1280 }
  ];
  P.uid = (p) => O.uid(p || 'e');

  /* ---------------- Médias (images, vidéos, sons) ----------------
     doc.media = {id: {name, mime, w, h}} ; les Blob sont gardés à part (P.blobs) et rangés dans le zip. */
  P.blobs = {}; const urls = {};
  P.addMedia = function (doc, blob, name, extra) {
    const id = 'm' + O.uid();
    P.blobs[id] = blob; doc.media = doc.media || {};
    doc.media[id] = Object.assign({ name: name || blob.name || 'media', mime: blob.type || O.mimeOf(name) }, extra || {});
    return id;
  };
  P.mediaUrl = function (id) { if (!id || !P.blobs[id]) return ''; return urls[id] || (urls[id] = URL.createObjectURL(P.blobs[id])); };
  P.resetMedia = function () { Object.keys(urls).forEach((k) => URL.revokeObjectURL(urls[k])); Object.keys(urls).forEach((k) => delete urls[k]); P.blobs = {}; };
  P.imageSize = (blob) => createImageBitmap(blob).then((b) => { const r = { w: b.width, h: b.height }; b.close && b.close(); return r; }).catch(() => new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 800, h: 600 }); im.src = URL.createObjectURL(blob); }));
  /** Médias réellement utilisés (pour l'enregistrement) */
  P.usedMedia = function (doc) {
    const used = new Set();
    const walk = (els) => (els || []).forEach((e) => { if (e.media) used.add(e.media); if (e.poster) used.add(e.poster); if (e.orig) used.add(e.orig); if (e.fill && e.fill.media) used.add(e.fill.media); if (e.children) walk(e.children); });
    doc.slides.forEach((s) => { walk(s.elements); if (s.bg && s.bg.media) used.add(s.bg.media); });
    walk(doc.master.elements); if (doc.master.bg && doc.master.bg.media) used.add(doc.master.bg.media); if (doc.master.logo && doc.master.logo.media) used.add(doc.master.logo.media);
    return used;
  };

  /* ---------------- Thème effectif ---------------- */
  P.theme = function (doc) {
    const base = T.get(doc.theme.id);
    const t = Object.assign({}, base, { colors: Object.assign({}, base.colors, doc.theme.colors || {}), fonts: Object.assign({}, base.fonts, doc.theme.fonts || {}) });
    if (doc.theme.dark != null) t.dark = doc.theme.dark;
    return t;
  };
  P.color = (ref, doc) => T.resolve(ref, P.theme(doc));

  /* ---------------- Masque ---------------- */
  P.defaultMaster = () => ({
    bg: null, decor: true,
    styles: {
      title: { font: 'major', size: 40, color: 't:tx1', bold: false, italic: false, align: 'left', caps: false },
      ctitle: { font: 'major', size: 54, color: 't:tx1', bold: true, italic: false, align: 'center', caps: false },
      subtitle: { font: 'minor', size: 24, color: 't:tx2', bold: false, italic: false, align: 'center' },
      body: { font: 'minor', size: 24, color: 't:tx1', bold: false, italic: false, align: 'left', bullet: 'disc', lineHeight: 1.15 }
    },
    logo: { media: null, pos: 'tr', w: 110, show: true, onTitle: true },
    footer: { show: false, text: '' }, number: { show: false, start: 1 }, date: { show: false, fixed: '' },
    hideOnTitle: true, elements: []
  });

  /* ---------------- Dispositions ---------------- */
  P.LAYOUTS = [
    { id: 'title', name: 'Diapositive de titre' },
    { id: 'titleContent', name: 'Titre et contenu' },
    { id: 'section', name: 'En-tête de section' },
    { id: 'twoContent', name: 'Deux contenus' },
    { id: 'comparison', name: 'Comparaison' },
    { id: 'titleOnly', name: 'Titre seul' },
    { id: 'blank', name: 'Vide' },
    { id: 'caption', name: 'Contenu avec légende' },
    { id: 'picCaption', name: 'Image avec légende' },
    { id: 'picture', name: 'Image seule' },
    { id: 'quote', name: 'Citation' },
    { id: 'bigNumber', name: 'Chiffre clé' }
  ];
  /** Espaces réservés d'une disposition : [{ph, x, y, w, h}] */
  P.layoutBoxes = function (id, W, H) {
    const M = Math.round(W * 0.06), top = Math.round(H * 0.06), th = Math.round(H * 0.15), by = top + th + Math.round(H * 0.035), bh = H - by - Math.round(H * 0.1), g = Math.round(W * 0.03);
    const half = Math.round((W - 2 * M - g) / 2);
    switch (id) {
      case 'title': return [{ ph: 'ctitle', x: M, y: Math.round(H * 0.27), w: W - 2 * M, h: Math.round(H * 0.25) }, { ph: 'subtitle', x: M + Math.round(W * 0.08), y: Math.round(H * 0.56), w: W - 2 * M - Math.round(W * 0.16), h: Math.round(H * 0.16) }];
      case 'titleContent': return [{ ph: 'title', x: M, y: top, w: W - 2 * M, h: th }, { ph: 'body', x: M, y: by, w: W - 2 * M, h: bh }];
      case 'section': return [{ ph: 'stitle', x: M, y: Math.round(H * 0.34), w: W - 2 * M, h: Math.round(H * 0.22) }, { ph: 'stext', x: M, y: Math.round(H * 0.58), w: W - 2 * M, h: Math.round(H * 0.14) }];
      case 'twoContent': return [{ ph: 'title', x: M, y: top, w: W - 2 * M, h: th }, { ph: 'body', x: M, y: by, w: half, h: bh }, { ph: 'body2', x: M + half + g, y: by, w: half, h: bh }];
      case 'comparison': { const hh = Math.round(H * 0.08); return [{ ph: 'title', x: M, y: top, w: W - 2 * M, h: th }, { ph: 'head1', x: M, y: by, w: half, h: hh }, { ph: 'body', x: M, y: by + hh + 8, w: half, h: bh - hh - 8 }, { ph: 'head2', x: M + half + g, y: by, w: half, h: hh }, { ph: 'body2', x: M + half + g, y: by + hh + 8, w: half, h: bh - hh - 8 }]; }
      case 'titleOnly': return [{ ph: 'title', x: M, y: top, w: W - 2 * M, h: th }];
      case 'blank': return [];
      case 'caption': { const lw = Math.round((W - 2 * M) * 0.36); return [{ ph: 'ctitle2', x: M, y: Math.round(H * 0.1), w: lw, h: Math.round(H * 0.2) }, { ph: 'caption', x: M, y: Math.round(H * 0.32), w: lw, h: Math.round(H * 0.56) }, { ph: 'body', x: M + lw + g, y: Math.round(H * 0.1), w: W - 2 * M - lw - g, h: Math.round(H * 0.78) }]; }
      case 'picCaption': { const lw = Math.round((W - 2 * M) * 0.36); return [{ ph: 'ctitle2', x: M, y: Math.round(H * 0.1), w: lw, h: Math.round(H * 0.2) }, { ph: 'caption', x: M, y: Math.round(H * 0.32), w: lw, h: Math.round(H * 0.56) }, { ph: 'pic', x: M + lw + g, y: Math.round(H * 0.1), w: W - 2 * M - lw - g, h: Math.round(H * 0.78) }]; }
      case 'picture': return [{ ph: 'pic', x: 0, y: 0, w: W, h: H }, { ph: 'caption', x: M, y: Math.round(H * 0.82), w: W - 2 * M, h: Math.round(H * 0.12) }];
      case 'quote': return [{ ph: 'quote', x: M + Math.round(W * 0.06), y: Math.round(H * 0.2), w: W - 2 * M - Math.round(W * 0.12), h: Math.round(H * 0.42) }, { ph: 'author', x: M + Math.round(W * 0.06), y: Math.round(H * 0.66), w: W - 2 * M - Math.round(W * 0.12), h: Math.round(H * 0.1) }];
      case 'bigNumber': return [{ ph: 'number', x: M, y: Math.round(H * 0.2), w: W - 2 * M, h: Math.round(H * 0.38) }, { ph: 'stext', x: M, y: Math.round(H * 0.6), w: W - 2 * M, h: Math.round(H * 0.16) }];
      default: return [];
    }
  };
  P.PH = {
    ctitle: { prompt: 'Cliquez pour ajouter un titre', style: 'ctitle', va: 'bottom' },
    title: { prompt: 'Cliquez pour ajouter un titre', style: 'title', va: 'middle' },
    stitle: { prompt: 'Titre de la section', style: 'ctitle', va: 'bottom', align: 'left' },
    ctitle2: { prompt: 'Cliquez pour ajouter un titre', style: 'title', va: 'bottom', size: 28 },
    subtitle: { prompt: 'Cliquez pour ajouter un sous-titre', style: 'subtitle', va: 'top' },
    stext: { prompt: 'Cliquez pour ajouter du texte', style: 'subtitle', va: 'top', align: 'left' },
    body: { prompt: 'Cliquez pour ajouter du texte', style: 'body', va: 'top', list: true },
    body2: { prompt: 'Cliquez pour ajouter du texte', style: 'body', va: 'top', list: true },
    head1: { prompt: 'Titre de la colonne', style: 'body', va: 'bottom', bold: true },
    head2: { prompt: 'Titre de la colonne', style: 'body', va: 'bottom', bold: true },
    caption: { prompt: 'Cliquez pour ajouter une légende', style: 'body', va: 'top', size: 18 },
    quote: { prompt: '« Cliquez pour ajouter une citation »', style: 'title', va: 'middle', align: 'center', italic: true, size: 36 },
    author: { prompt: '— Auteur', style: 'subtitle', va: 'top', align: 'right' },
    number: { prompt: '100 %', style: 'ctitle', va: 'bottom', align: 'center', size: 120, accent: true },
    pic: { prompt: 'Cliquez pour ajouter une image' }
  };
  P.isTitlePh = (ph) => /^(ctitle|title|stitle|ctitle2)$/.test(ph || '');

  /* ---------------- Fabriques d'éléments ---------------- */
  P.textEl = (x, y, w, h, html, extra) => Object.assign({ id: P.uid(), type: 'text', x, y, w, h, rot: 0, html: html || '', va: 'top', pad: [9.6, 4.8, 9.6, 4.8], autofit: 'grow', wrap: true, fill: null, line: null }, extra || {});
  P.shapeEl = (shape, x, y, w, h, extra) => Object.assign({ id: P.uid(), type: 'shape', shape, x, y, w, h, rot: 0, html: '', va: 'middle', pad: [9.6, 4.8, 9.6, 4.8], autofit: 'none', fill: { type: 'solid', color: 't:accent1' }, line: { color: 't:accent1/-25', w: 1.5, dash: 'solid' }, txColor: 't:lt1' }, extra || {});
  P.lineEl = (shape, x, y, w, h, extra) => Object.assign({ id: P.uid(), type: 'line', shape: shape || 'line', x, y, w, h, rot: 0, line: { color: 't:accent1', w: 2.25, dash: 'solid', head: /Arrow$/.test(shape) || shape === 'lineDouble' ? 'triangle' : 'none', tail: shape === 'lineDouble' ? 'triangle' : 'none' } }, extra || {});
  P.phEl = function (ph, box) {
    const d = P.PH[ph] || {};
    if (ph === 'pic') return { id: P.uid(), type: 'placeholder', ph, x: box.x, y: box.y, w: box.w, h: box.h, rot: 0 };
    return P.textEl(box.x, box.y, box.w, box.h, '', { ph, va: d.va || 'top', autofit: 'shrink', align: d.align, phSize: d.size, phBold: d.bold, phItalic: d.italic, phAccent: d.accent });
  };
  P.newSlide = function (doc, layout) {
    const s = { id: P.uid('s'), layout: layout || 'titleContent', hidden: false, bg: null, hideMaster: false, elements: [], notes: '', transition: { type: 'none', dur: 0.7, dir: 'l' }, advance: { click: true, after: null }, anims: [], comments: [] };
    P.layoutBoxes(s.layout, doc.size.w, doc.size.h).forEach((b) => s.elements.push(P.phEl(b.ph, b)));
    return s;
  };
  P.newDoc = function (opt) {
    opt = opt || {};
    const sz = P.SIZES.find((s) => s.id === (opt.size || '16:9')) || P.SIZES[0];
    const doc = {
      format: 'magpres', version: P.VERSION, title: opt.title || '', author: opt.author || '', created: Date.now(), modified: Date.now(),
      size: { w: sz.w, h: sz.h, name: sz.id }, theme: { id: opt.theme || 'clair' }, master: P.defaultMaster(), sections: [], slides: [], media: {},
      settings: { loop: false, useTimings: true, pen: '#E03131', laser: '#FF1F1F', showType: 'full', firstNumber: 1 }
    };
    if (opt.empty !== true) doc.slides.push(P.newSlide(doc, 'title'));
    return doc;
  };
  /** Change la disposition d'une diapo : le contenu des espaces réservés suit (titre → titre, corps → corps…) */
  P.applyLayout = function (doc, slide, layout) {
    const boxes = P.layoutBoxes(layout, doc.size.w, doc.size.h);
    const old = slide.elements.filter((e) => e.ph);
    const used = new Set();
    const family = (ph) => P.isTitlePh(ph) ? 'title' : /^(body|body2|caption|quote|stext|subtitle|number|head1|head2|author)$/.test(ph) ? 'text' : ph;
    const out = slide.elements.filter((e) => !e.ph);
    boxes.forEach((b) => {
      let src = old.find((e) => !used.has(e) && e.ph === b.ph) || old.find((e) => !used.has(e) && family(e.ph) === family(b.ph) && (e.type !== 'placeholder') === (b.ph !== 'pic'));
      if (src) { used.add(src); const n = P.phEl(b.ph, b); if (src.type === 'text') { n.html = src.html; n.id = src.id; } else if (src.type === 'placeholder') n.id = src.id; out.push(n); }
      else out.push(P.phEl(b.ph, b));
    });
    // contenu non vide sans place dans la nouvelle disposition : gardé comme zone de texte libre
    old.filter((e) => !used.has(e) && e.type === 'text' && !O.RichText.isEmpty(e.html)).forEach((e) => { const c = Object.assign({}, e); delete c.ph; c.autofit = 'none'; out.push(c); });
    slide.layout = layout; slide.elements = out;
    // les animations d'éléments disparus sont retirées
    const ids = new Set(); P.walk(slide.elements, (e) => ids.add(e.id));
    slide.anims = (slide.anims || []).filter((a) => ids.has(a.el));
  };
  P.layoutKind = (slide) => slide.layout === 'title' ? 'title' : slide.layout === 'section' || slide.layout === 'bigNumber' || slide.layout === 'quote' ? 'section' : 'content';

  /* ---------------- Parcours ---------------- */
  P.walk = function (els, fn, parent) { (els || []).forEach((e) => { fn(e, parent); if (e.children) P.walk(e.children, fn, e); }); };
  P.find = function (slide, id) { let r = null; P.walk(slide.elements, (e, p) => { if (e.id === id) r = { el: e, parent: p }; }); return r; };
  P.findEl = (slide, id) => { const r = P.find(slide, id); return r ? r.el : null; };
  P.listOf = (slide, parent) => parent ? parent.children : slide.elements;
  P.slideIndex = (doc, id) => doc.slides.findIndex((s) => s.id === id);
  P.cloneEl = function (e) { const c = O.clone(e); P.walk([c], (x) => { x.id = P.uid(); }); return c; };
  P.cloneSlide = function (s) {
    const c = O.clone(s); const map = {};
    c.id = P.uid('s'); P.walk(c.elements, (x) => { const n = P.uid(); map[x.id] = n; x.id = n; });
    c.anims = (c.anims || []).map((a) => Object.assign({}, a, { id: P.uid('a'), el: map[a.el] || a.el }));
    P.walk(c.elements, (x) => { if (x.conn) { if (x.conn.a && map[x.conn.a.el]) x.conn.a.el = map[x.conn.a.el]; if (x.conn.b && map[x.conn.b.el]) x.conn.b.el = map[x.conn.b.el]; } });
    c.comments = [];
    return c;
  };
  /** Texte brut d'une diapo (recherche, plan, accessibilité) */
  P.slideText = function (s) { const out = []; P.walk(s.elements, (e) => { if (e.html) out.push(O.RichText.textOf(e.html)); if (e.type === 'table') e.rows.forEach((r) => r.cells.forEach((c) => { if (c.html) out.push(O.RichText.textOf(c.html)); })); if (e.type === 'smartart') e.items.forEach((i) => out.push(i.text)); }); return out.join('\n'); };
  P.slideTitle = function (s) { let t = ''; P.walk(s.elements, (e) => { if (!t && P.isTitlePh(e.ph) && e.html) t = O.RichText.textOf(e.html); }); if (!t) P.walk(s.elements, (e) => { if (!t && e.type === 'text' && e.html) t = O.RichText.textOf(e.html).split('\n')[0]; }); return t.trim(); };
  P.sectionOf = function (doc, idx) { let sec = null; (doc.sections || []).forEach((x) => { const i = P.slideIndex(doc, x.at); if (i >= 0 && i <= idx && (!sec || P.slideIndex(doc, sec.at) <= i)) sec = x; }); return sec; };

  /* ---------------- Décors des thèmes (formes du masque, générées) ---------------- */
  P.decor = function (doc, kind, layout) {
    const t = P.theme(doc), W = doc.size.w, H = doc.size.h, out = [];
    const noTitle = layout === 'blank' || layout === 'picture';
    const sh = (shape, x, y, w, h, fill, extra) => out.push(Object.assign({ id: 'decor' + out.length, type: 'shape', shape, x, y, w, h, rot: 0, fill: fill ? { type: 'solid', color: fill } : null, line: null, html: '', decor: true }, extra || {}));
    const M = W * 0.06;
    switch (t.decor) {
      case 'clair': if (noTitle) break; if (kind === 'title') sh('rect', W * 0.4, H * 0.535, W * 0.2, 4, 't:accent1'); else if (kind === 'section') sh('rect', M, H * 0.57, W * 0.12, 5, 't:accent1'); else sh('rect', M, H * 0.06 + H * 0.15, W * 0.08, 4, 't:accent1'); break;
      case 'mag': {
        const s = kind === 'title' ? H * 0.16 : H * 0.065, x = kind === 'title' ? W - s * 2.6 - M * 0.5 : W - s * 2.2 - M * 0.5, y = kind === 'title' ? H * 0.07 : H * 0.045;
        sh('rect', x, y, s, s, 't:accent1', { rot: 45, fill: { type: 'solid', color: 't:accent1', alpha: 0.95 } });
        sh('rect', x + s * 0.7, y, s, s, 't:accent2', { rot: 45, fill: { type: 'solid', color: 't:accent2', alpha: 0.85 } });
        sh('wave', 0, H - H * (kind === 'title' ? 0.12 : 0.05), W, H * (kind === 'title' ? 0.12 : 0.05) + 2, 't:accent1');
        if (kind === 'title') sh('wave', 0, H - H * 0.07, W, H * 0.07 + 2, 't:accent2', { fill: { type: 'solid', color: 't:accent2', alpha: 0.9 } });
        break;
      }
      case 'ardoise': sh('rect', 0, 0, W * 0.018, H, 't:accent1'); if (kind === 'title') sh('rect', 0, H * 0.75, W, 3, 't:accent2'); break;
      case 'vague': sh('wave', -W * 0.05, H * (kind === 'title' ? 0.78 : 0.9), W * 1.1, H * 0.2, 't:accent1/+40', { fill: { type: 'solid', color: 't:accent1', alpha: 0.18 } }); sh('wave', -W * 0.08, H * (kind === 'title' ? 0.84 : 0.94), W * 1.16, H * 0.18, 't:accent2', { fill: { type: 'solid', color: 't:accent2', alpha: 0.25 } }); break;
      case 'bande': sh('rect', 0, 0, W, kind === 'title' ? H * 0.08 : 8, 't:accent1'); if (kind === 'title') sh('rect', 0, H - H * 0.04, W, H * 0.04, 't:accent2'); break;
      case 'coin': sh('rtTriangle', W - H * (kind === 'title' ? 0.4 : 0.18), H - H * (kind === 'title' ? 0.4 : 0.18), H * (kind === 'title' ? 0.4 : 0.18), H * (kind === 'title' ? 0.4 : 0.18), 't:accent1', { flipH: true }); if (kind === 'title') sh('rtTriangle', 0, 0, H * 0.22, H * 0.22, 't:accent2', { flipV: true }); break;
      case 'etoile': for (let i = 0; i < 26; i++) { const r = ((i * 9301 + 49297) % 233280) / 233280, q = ((i * 4271 + 1123) % 997) / 997; const s = 2 + (i % 3); sh('ellipse', r * W, q * H * (kind === 'title' ? 1 : 0.18), s, s, 't:accent1', { fill: { type: 'solid', color: 't:accent1', alpha: 0.5 + (i % 2) * 0.4 } }); } if (kind === 'title') sh('rect', W * 0.35, H * 0.54, W * 0.3, 2, 't:accent1'); break;
      case 'bulles': sh('ellipse', -H * 0.12, -H * 0.12, H * 0.42, H * 0.42, 't:accent1', { fill: { type: 'solid', color: 't:accent1', alpha: 0.18 } }); sh('ellipse', W - H * 0.3, H - H * 0.3, H * 0.5, H * 0.5, 't:accent2', { fill: { type: 'solid', color: 't:accent2', alpha: 0.18 } }); if (kind === 'title') sh('ellipse', W * 0.82, H * 0.08, H * 0.16, H * 0.16, 't:accent3', { fill: { type: 'solid', color: 't:accent3', alpha: 0.3 } }); break;
      case 'trait': if (noTitle) break; sh('rect', M, kind === 'title' ? H * 0.535 : H * 0.215, kind === 'title' ? W - 2 * M : W - 2 * M, 2, 't:accent1'); break;
      case 'soleil': sh('ellipse', W - H * 0.35, -H * 0.35, H * 0.7, H * 0.7, 't:accent1', { fill: { type: 'solid', color: 't:accent1', alpha: 0.85 } }); if (kind === 'title') sh('ellipse', -H * 0.2, H * 0.75, H * 0.45, H * 0.45, 't:accent2', { fill: { type: 'solid', color: 't:accent2', alpha: 0.6 } }); break;
      case 'cadre': sh('rect', 14, 14, W - 28, H - 28, null, { line: { color: 't:tx1', w: 2, dash: 'dash', alpha: 0.5 } }); break;
      case 'balisage': out.push({ id: 'decor-b', type: 'decorBand', x: 0, y: H - (kind === 'title' ? H * 0.07 : 14), w: W, h: kind === 'title' ? H * 0.07 : 14, colors: ['t:accent1', 't:accent2'], decor: true }); if (kind === 'title') out.push({ id: 'decor-b2', type: 'decorBand', x: 0, y: 0, w: W, h: H * 0.035, colors: ['t:accent1', 't:accent2'], decor: true }); break;
      case 'filet': sh('rect', M, H * 0.035, W - 2 * M, 1.5, 't:accent1'); sh('rect', M, H * 0.035 + 4, W - 2 * M, 0.75, 't:accent1'); sh('rect', M, H - H * 0.05, W - 2 * M, 0.75, 't:accent1'); break;
      case 'neon': if (noTitle) break; sh('rect', M, kind === 'title' ? H * 0.53 : H * 0.215, W * 0.25, 3, 't:accent1', { shadow: { color: 't:accent1', blur: 12, x: 0, y: 0, alpha: 0.9 } }); sh('rect', W - M - W * 0.1, H - H * 0.06, W * 0.1, 3, 't:accent2', { shadow: { color: 't:accent2', blur: 12, x: 0, y: 0, alpha: 0.9 } }); break;
      default: break;
    }
    return out;
  };
})();
