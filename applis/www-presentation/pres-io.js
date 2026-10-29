/* Présentation — fichiers : format natif .magpres (zip : presentation.json + médias), rendu pour l'export,
   PDF (diapos, documents à distribuer, pages de commentaires), images PNG/JPG, impression. */
(function () {
  'use strict';
  const O = window.Office, P = window.Pres;
  const IO = P.io = {};
  IO.MAGPRES = { description: 'Présentation MAG', accept: { 'application/x-magpres': ['.magpres'] } };
  IO.PPTX = { description: 'Présentation PowerPoint', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] } };

  /* ---------------- .magpres ---------------- */
  IO.toZip = async function (doc, opt) {
    opt = opt || {};
    const zip = new window.JSZip();
    zip.file('mimetype', 'application/x-magpres', { compression: 'STORE' });
    const used = P.usedMedia(doc);
    const d = O.clone(doc); d.format = 'magpres'; d.version = P.VERSION; d.media = {};
    for (const id of used) {
      const m = doc.media[id], b = P.blobs[id]; if (!m || !b) continue;
      const ext = O.extOf(m.name) || (b.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      const path = 'media/' + id + '.' + ext;
      d.media[id] = Object.assign({}, m, { path });
      zip.file(path, b, { compression: /^(image\/(png|jpe?g|gif|webp)|video|audio)/.test(b.type) ? 'STORE' : 'DEFLATE' });
    }
    zip.file('presentation.json', JSON.stringify(d));
    if (opt.thumb) zip.file('thumbnail.jpg', opt.thumb.split(',')[1], { base64: true, compression: 'STORE' });
    zip.file('LISEZ-MOI.txt', 'Présentation enregistrée par Présentation (Suite MAG). Format ouvert : presentation.json (texte JSON) et dossier media/.\n');
    return zip.generateAsync({ type: 'blob', mimeType: 'application/x-magpres', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  };
  IO.fromZip = async function (blob) {
    const zip = await window.JSZip.loadAsync(blob);
    const f = zip.file('presentation.json'); if (!f) throw new Error('Ce fichier n\'est pas une présentation MAG (presentation.json absent)');
    const doc = JSON.parse(await f.async('string'));
    if (doc.format !== 'magpres') throw new Error('Format inconnu');
    const blobs = {};
    for (const id of Object.keys(doc.media || {})) {
      const m = doc.media[id]; const zf = m.path && zip.file(m.path);
      if (zf) { const ab = await zf.async('arraybuffer'); blobs[id] = new Blob([ab], { type: m.mime || O.mimeOf(m.path) }); }
      delete m.path;
    }
    return { doc: IO.upgrade(doc), blobs };
  };
  /** Mise à niveau des anciens fichiers et valeurs par défaut manquantes */
  IO.upgrade = function (doc) {
    const def = P.defaultMaster();
    doc.master = Object.assign({}, def, doc.master || {});
    doc.master.styles = Object.assign({}, def.styles, doc.master.styles || {});
    Object.keys(def.styles).forEach((k) => { doc.master.styles[k] = Object.assign({}, def.styles[k], doc.master.styles[k] || {}); });
    doc.settings = Object.assign({ loop: false, useTimings: true, pen: '#E03131', laser: '#FF1F1F', firstNumber: 1 }, doc.settings || {});
    doc.sections = doc.sections || []; doc.media = doc.media || {}; doc.theme = doc.theme || { id: 'clair' };
    doc.slides.forEach((s) => { s.anims = s.anims || []; s.comments = s.comments || []; s.transition = s.transition || { type: 'none', dur: 0.7 }; s.advance = s.advance || { click: true, after: null }; s.elements = s.elements || []; P.syncMedia(s); });
    return doc;
  };
  IO.isMagpres = (name) => /\.magpres$/i.test(name || '');
  IO.isPptx = (name) => /\.(pptx|ppsx|potx)$/i.test(name || '');

  /* ---------------- Rendu hors écran pour l'export ---------------- */
  let box = null;
  function exportBox() { if (!box) { box = O.h('div', { id: 'exportBox', 'aria-hidden': 'true', style: { position: 'fixed', left: '-30000px', top: '0', pointerEvents: 'none' } }); document.body.appendChild(box); } return box; }
  IO.renderNode = async function (doc, i, opt) {
    opt = opt || {};
    const s = opt.slide || doc.slides[i];
    if (s && JSON.stringify(s).indexOf('"equation"') >= 0 && window.PresApp) await window.PresApp.loadKatex();
    const n = P.renderSlide(doc, s, { mode: 'export', index: i });
    if (opt.only === 'background') { n.querySelector('.sl-els').innerHTML = ''; }
    if (opt.only === 'nobg') { n.querySelector('.sl-bg').style.background = 'transparent'; n.querySelector('.sl-master').innerHTML = ''; }
    const b = exportBox(); b.innerHTML = ''; b.appendChild(n);
    P.fitAll(n, doc, s);
    await Promise.all(O.$$('img', n).map((im) => im.decode ? im.decode().catch(() => { }) : null));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return n;
  };
  /** Image d'une diapo → canvas */
  IO.slideCanvas = async function (doc, i, scale, opt) {
    const n = await IO.renderNode(doc, i, opt);
    try { return await O.Raster.canvas(n, { width: doc.size.w, height: doc.size.h, scale: scale || 1, bg: opt && opt.transparent ? null : '#ffffff' }); }
    finally { n.remove(); }
  };
  IO.slideImage = async function (doc, i, opt) {
    opt = opt || {};
    const c = await IO.slideCanvas(doc, i, opt.scale || 1.5, opt);
    return { src: c.toDataURL(opt.type || 'image/jpeg', opt.quality || 0.9), w: c.width, h: c.height, canvas: c };
  };
  IO.thumb = async function (doc) { try { const c = await IO.slideCanvas(doc, 0, 0.3); return c.toDataURL('image/jpeg', 0.7); } catch (e) { return ''; } };

  /* ---------------- PDF ---------------- */
  IO.pdf = async function (doc, opt, progress) {
    opt = opt || {};
    const idx = doc.slides.map((s, i) => i).filter((i) => opt.hidden || !doc.slides[i].hidden).filter((i) => !opt.range || opt.range.indexOf(i) >= 0);
    const imgs = [];
    for (let k = 0; k < idx.length; k++) { progress && progress(k, idx.length); imgs.push(await IO.slideImage(doc, idx[k], { scale: opt.quality === 'high' ? 2 : 1.5, quality: 0.9 })); }
    const notes = idx.map((i) => O.RichText.textOf(doc.slides[i].notes || ''));
    const meta = { title: doc.title || '', author: doc.author || '', w: doc.size.w, h: doc.size.h };
    if (!opt.layout || opt.layout === 'slides') return O.Pdf.pages(imgs, meta);
    return O.Pdf.handouts(imgs, Object.assign(meta, { perPage: opt.layout === 'notes' ? 'notes' : +opt.layout, notes, notesUnder: opt.notesUnder, header: opt.header != null ? opt.header : (doc.title || ''), footer: opt.footer || '', date: opt.date === false ? '' : new Date().toLocaleDateString('fr-FR'), numbers: true }));
  };
  /* ---------------- images ---------------- */
  IO.images = async function (doc, opt, progress) {
    opt = opt || {};
    const type = opt.format === 'jpg' ? 'image/jpeg' : 'image/png';
    const idx = opt.only != null ? [opt.only] : doc.slides.map((s, i) => i).filter((i) => !doc.slides[i].hidden || opt.hidden);
    const out = [];
    for (let k = 0; k < idx.length; k++) {
      progress && progress(k, idx.length);
      const c = await IO.slideCanvas(doc, idx[k], (opt.width || 1920) / doc.size.w);
      const b = await new Promise((res) => c.toBlob(res, type, 0.92));
      out.push({ name: 'Diapositive' + String(idx[k] + 1).padStart(2, '0') + (opt.format === 'jpg' ? '.jpg' : '.png'), blob: b });
    }
    return out;
  };
  /* ---------------- impression ---------------- */
  IO.print = async function (doc, opt, progress) {
    opt = opt || {};
    if (O.isAndroid && window.MAGPrint && window.MAGPrint.printPdf) {
      const pdf = await IO.pdf(doc, opt, progress);
      window.MAGPrint.printPdf(O.bytesToB64(new Uint8Array(await pdf.arrayBuffer())), O.safeName(doc.title || 'Présentation', '.pdf'));
      return;
    }
    const idx = doc.slides.map((s, i) => i).filter((i) => opt.hidden || !doc.slides[i].hidden);
    let pb = document.getElementById('printBox'); if (!pb) { pb = O.h('div', { id: 'printBox' }); document.body.appendChild(pb); }
    const urls = [];
    if (!opt.layout || opt.layout === 'slides') {
      let h = '<style>@page{size:' + (doc.size.w >= doc.size.h ? 'landscape' : 'portrait') + ';margin:0}</style>';
      for (let k = 0; k < idx.length; k++) { progress && progress(k, idx.length); const im = await IO.slideImage(doc, idx[k], { scale: 1.5 }); h += '<div class="pg"><img src="' + im.src + '"></div>'; }
      pb.innerHTML = h;
    } else {
      // documents : on passe par le PDF (mise en page identique), affiché page par page
      const pdf = await IO.pdf(doc, opt, progress);
      const u = URL.createObjectURL(pdf); urls.push(u);
      const w = (window.MAGPC && window.MAGPC.nativeOpen) || window.open; w.call(window, u, '_blank');
      setTimeout(() => urls.forEach((x) => URL.revokeObjectURL(x)), 120000);
      return;
    }
    await Promise.all(O.$$('img', pb).map((im) => im.decode().catch(() => { })));
    const done = () => { pb.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60000);
  };
})();
