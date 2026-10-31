/* =====================================================================
   Carnet de voyage — exports (PDF A4 / A5 haute qualité, PNG / JPG, .magcarnet), partage Android,
   impression, diaporama plein écran, réglages, licences et raccourcis clavier.
   ===================================================================== */
(function () {
  'use strict';
  const CV = window.CV = window.CV || {};
  const O = window.Office, A = CV.Art, R = CV.R, M = CV.M, E = CV.E, W = A.W, H = A.H;
  const X = CV.X = {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = A.esc, ic = (n) => O.icon(n);
  const U = () => CV.U;

  /* ---------------- Rendu d'une page en image (photos pleine définition, polices intégrées) ---------------- */
  X.pageCanvas = async function (c, pi, wpx) {
    const p = pi === -1 ? { id: 'cover', items: c.coverItems || [] } : c.pages[pi];
    const ids = new Set((p.items || []).filter((x) => x.media).map((x) => x.media));
    if (pi === -1 && c.cover && c.cover.photo) ids.add(c.cover.photo);
    if ((p.items || []).some((x) => x.type === 'map') && !window.CV_CARTE) { try { await O.loadScript('cv-carte-data.js'); } catch (e) { } }
    const map = {};
    for (const id of ids) map[id] = await M.dataUrl(id, wpx <= 1000 ? 'mid' : 'full');
    const o = { pfx: 'x' + pi + '-', href: (id) => map[id] || '', media: M.info, cover: pi === -1 };
    let svg = R.pageSvg(c, p, o);
    o.fonts = await R.fontsCss(svg);
    svg = R.pageSvg(c, p, o);
    return R.raster(svg, wpx);
  };
  X.pagesOf = function (what) {
    const c = E.c;
    if (what === 'page') return [E.pi];
    if (what === 'spread') return E.visible();
    return [-1].concat(c.pages.map((p, i) => i));
  };
  const SIZES = { a4: [210, 297], a5: [148, 210] };
  /** PDF : une page du carnet par feuille (A4 ou A5), ou deux par feuille A4 paysage (« planches ») */
  X.buildPdf = async function (opt) {
    const c = E.c, list = X.pagesOf(opt.what || 'all');
    const J = await O.Pdf.load();
    const planche = opt.layout === 'planche';
    const fmt = planche ? [148.5, 210] : SIZES[opt.size || 'a4'];
    const dpi = opt.dpi || 200, wpx = Math.round(fmt[0] / 25.4 * dpi);
    const doc = planche ? new J({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true }) : new J({ orientation: 'portrait', unit: 'mm', format: [fmt[0], fmt[1]], compress: true });
    const pr = U().progress('Préparation du PDF…', list.length);
    let first = true;
    try {
      for (let i = 0; i < list.length; i++) {
        pr(i);
        const cv = await X.pageCanvas(c, list[i], wpx);
        const data = cv.toDataURL('image/jpeg', 0.9);
        cv.width = cv.height = 1;
        if (planche) {
          const slot = i % 2;
          if (slot === 0 && !first) doc.addPage('a4', 'landscape');
          doc.addImage(data, 'JPEG', slot * 148.5, 0, 148.5, 210, undefined, 'FAST');
        } else {
          if (!first) doc.addPage([fmt[0], fmt[1]], 'portrait');
          doc.addImage(data, 'JPEG', 0, 0, fmt[0], fmt[1], undefined, 'FAST');
        }
        first = false;
        await new Promise((r) => setTimeout(r, 0));
      }
      doc.setProperties({ title: O.Pdf.safe(c.title), subject: O.Pdf.safe(c.dates || ''), creator: 'Carnet de voyage (Suite MAG)' });
      return doc.output('blob');
    } finally { pr(-1); M.forgetData(); }
  };
  X.buildImage = async function (opt) {
    const c = E.c, list = X.pagesOf(opt.what || 'page');
    const type = opt.format === 'jpg' ? 'image/jpeg' : 'image/png', ext = opt.format === 'jpg' ? '.jpg' : '.png';
    const wpx = Math.round((opt.size === 'a5' ? 148 : 210) / 25.4 * (opt.dpi || 200));
    const pr = U().progress('Préparation des images…', list.length);
    try {
      if (opt.what === 'spread' && list.length === 2) {
        pr(0);
        const a = await X.pageCanvas(c, list[0], wpx), b = await X.pageCanvas(c, list[1], wpx);
        const cv = document.createElement('canvas'); cv.width = a.width * 2; cv.height = a.height;
        const x = cv.getContext('2d'); x.drawImage(a, 0, 0); x.drawImage(b, a.width, 0);
        x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(a.width - 2, 0, 4, a.height);
        return { blob: await R.toBlob(cv, type, 0.92), name: O.safeName(c.title + ' - pages ' + (list[0] + 1) + '-' + (list[1] + 1), ext) };
      }
      if (list.length === 1) { pr(0); const cv = await X.pageCanvas(c, list[0], wpx); return { blob: await R.toBlob(cv, type, 0.92), name: O.safeName(c.title + ' - ' + (list[0] === -1 ? 'couverture' : 'page ' + (list[0] + 1)), ext) }; }
      const z = new window.JSZip();
      for (let i = 0; i < list.length; i++) { pr(i); const cv = await X.pageCanvas(c, list[i], wpx); z.file(String(i).padStart(2, '0') + '-' + (list[i] === -1 ? 'couverture' : 'page-' + (list[i] + 1)) + ext, await R.toBlob(cv, type, 0.92)); }
      return { blob: await z.generateAsync({ type: 'blob', mimeType: 'application/zip' }), name: O.safeName(c.title + ' - images', '.zip') };
    } finally { pr(-1); M.forgetData(); }
  };
  X.deliver = async function (blob, name, action) {
    const F = O.Files;
    if (action === 'share') { const r = await F.share(blob, name); if (r && r.ok === false && !r.cancel) O.toast('Partage impossible', { bad: true }); return r; }
    if (action === 'print') { const r = await F.printPdf(blob, name); if (!r) { const u = URL.createObjectURL(blob); const w = window.open(u, '_blank'); if (!w) F.download(blob, name); setTimeout(() => URL.revokeObjectURL(u), 120000); } return r; }
    if (action === 'download') return F.download(blob, name);
    const r = await F.export(blob, name, { types: [{ description: name.split('.').pop().toUpperCase(), accept: { [blob.type || 'application/octet-stream']: ['.' + name.split('.').pop()] } }], mime: blob.type });
    if (r && r.ok) O.toast('« ' + (r.name || name) + ' » enregistré');
    return r;
  };
  X.saveFile = async function (c, action) {
    c = c || E.c; if (!c) return;
    if (E.c && c.id === E.c.id) await E.saveNow();
    const pr = U().progress('Préparation de la sauvegarde…', 1); pr(0);
    let blob; try { blob = await M.exportFile(c); } finally { pr(-1); }
    const name = O.safeName(c.title, '.magcarnet');
    if (action) return X.deliver(blob, name, action);
    const v = await O.dialog({ title: 'Sauvegarde du carnet', body: '<p>Un seul fichier <b>.magcarnet</b> (' + O.kb(blob.size) + ') contient le carnet et ses photos. Ouvre-le dans Carnet de voyage sur le téléphone ou sur le PC pour le retrouver tel quel.</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Partager', value: 'share' }, { label: 'Enregistrer', value: 'save', primary: true }] });
    if (v) return X.deliver(blob, name, v);
  };

  /* ---------------- Dialogue d'export ---------------- */
  X.exportDialog = async function () {
    if (!E.c) return;
    await E.saveNow();
    const st = Object.assign({ format: 'pdf', what: 'all', size: 'a4', dpi: 200, layout: 'page' }, X._last || {});
    const body = O.h('div', { cls: 'exp' });
    const chips = (k, l) => '<div class="chips">' + l.map((x) => '<button class="chip' + (String(st[k]) === String(x[0]) ? ' on' : '') + '" data-k="' + k + '" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
    const draw = () => {
      const img = st.format === 'png' || st.format === 'jpg';
      body.innerHTML = '<h5>Format</h5>' + chips('format', [['pdf', 'PDF'], ['png', 'PNG'], ['jpg', 'JPG'], ['magcarnet', 'Sauvegarde .magcarnet']]) +
        (st.format === 'magcarnet' ? '<p class="hint">Le carnet entier et ses photos, dans un seul fichier, pour passer du téléphone au PC (ou l\'inverse).</p>' :
          '<h5>Contenu</h5>' + chips('what', [['page', 'Page affichée'], ['spread', 'Double page'], ['all', 'Tout le carnet']]) +
          '<h5>Papier</h5>' + chips('size', [['a4', 'A4'], ['a5', 'A5']]) +
          (st.format === 'pdf' ? '<h5>Mise en page</h5>' + chips('layout', [['page', 'Une page par feuille'], ['planche', 'Deux pages par feuille A4 paysage']]) : '') +
          '<h5>Qualité</h5>' + chips('dpi', [[150, 'Standard (150 ppp)'], [200, 'Bonne (200 ppp)'], [300, 'Impression (300 ppp)']]) +
          (img && st.what === 'all' ? '<p class="hint">Toutes les pages : un fichier .zip d\'images.</p>' : ''));
    };
    draw();
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; st[b.dataset.k] = b.dataset.k === 'dpi' ? +b.dataset.v : b.dataset.v; draw(); });
    const btns = [{ label: 'Annuler', value: null }, { label: 'Partager', value: 'share' }];
    if (window.MAGOffice || window.MAGPC || window.MAGPrint) btns.push({ label: 'Imprimer', value: 'print' });
    btns.push({ label: 'Enregistrer', value: 'save', primary: true });
    const v = await O.dialog({ title: 'Exporter et partager', body, cls: 'cv-dlg', buttons: btns });
    if (!v) return;
    X._last = st;
    try {
      if (st.format === 'magcarnet') return X.saveFile(E.c, v === 'print' ? 'save' : v);
      if (st.format === 'pdf' || v === 'print') {
        const blob = await X.buildPdf(st);
        return X.deliver(blob, O.safeName(E.c.title + (st.what === 'page' ? ' - page ' + (E.pi + 1) : ''), '.pdf'), v);
      }
      const r = await X.buildImage(st);
      return X.deliver(r.blob, r.name, v);
    } catch (e) { console.error(e); O.alert('Export impossible', '<p>' + esc(e.message || String(e)) + '</p>'); }
  };

  /* ---------------- Diaporama ---------------- */
  X.show = function (from) {
    if (!E.c) return;
    const c = E.c, sh = $('#show');
    const wide = () => innerWidth > innerHeight * 1.15;
    const slides = () => { const l = [[-1]]; if (wide()) { for (let i = 0; i < c.pages.length; i += 2) l.push(c.pages[i + 1] ? [i, i + 1] : [i]); } else c.pages.forEach((p, i) => l.push([i])); return l; };
    let L = slides(), k = Math.max(0, L.findIndex((s) => s.includes(from == null ? -1 : from))), timer = null, playing = false;
    sh.hidden = false; document.body.classList.add('showing');
    sh.innerHTML = '<div class="shStage"></div><div class="shBar"><button class="ibtn" data-s="prev" aria-label="Précédente">' + ic('chevron-left') + '</button><button class="ibtn" data-s="play" aria-label="Lecture automatique">' + ic('play') + '</button><span class="shNo"></span><button class="ibtn" data-s="next" aria-label="Suivante">' + ic('chevron-right') + '</button><button class="ibtn" data-s="close" aria-label="Fermer">' + ic('x') + '</button></div>';
    const stage = $('.shStage', sh);
    const render = (dir) => {
      const s = L[k];
      const html = '<div class="shSpread n' + s.length + '">' + s.map((pi) => '<div class="shPage">' + R.pageSvg(c, E.page(pi), { pfx: 's' + pi + '-', href: M.url, media: M.info, cover: pi === -1 }) + '</div>').join('') + '</div>';
      const old = stage.firstChild;
      stage.insertAdjacentHTML('beforeend', html);
      const nu = stage.lastChild;
      if (old && dir && CV.motionOk()) { old.classList.add('out', dir > 0 ? 'fwd' : 'back'); nu.classList.add('in', dir > 0 ? 'fwd' : 'back'); setTimeout(() => old.remove(), 700); }
      else if (old) old.remove();
      $('.shNo', sh).textContent = (s[0] === -1 ? 'Couverture' : 'Page ' + s.map((x) => x + 1).join('-')) + ' · ' + (k + 1) + '/' + L.length;
    };
    const go = (d) => { const n = k + d; if (n < 0 || n >= L.length) { if (playing && n >= L.length) { k = -1; go(1); } return; } k = n; render(d); };
    const play = (on) => { playing = on; clearInterval(timer); if (on) timer = setInterval(() => go(1), 5000); $('[data-s="play"]', sh).innerHTML = ic(on ? 'pause' : 'play'); };
    const close = (fromBack) => { play(false); sh.hidden = true; sh.innerHTML = ''; document.body.classList.remove('showing'); document.removeEventListener('keydown', key, true); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { } if (!fromBack) U().pop(); };
    const key = (e) => { if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); } else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1); } else if (e.key === 'Escape') { e.preventDefault(); close(); } };
    sh.onclick = (e) => { const b = e.target.closest('[data-s]'); if (!b) { if (e.clientX > innerWidth / 2) go(1); else go(-1); return; } const a = b.dataset.s; if (a === 'prev') go(-1); else if (a === 'next') go(1); else if (a === 'play') play(!playing); else if (a === 'close') close(); };
    let sx = null; sh.onpointerdown = (e) => { sx = e.clientX; }; sh.onpointerup = (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50) { go(e.clientX < sx ? 1 : -1); e.stopPropagation(); } sx = null; };
    document.addEventListener('keydown', key, true);
    U().push(() => close(true));
    try { if (sh.requestFullscreen && !window.__noFs) sh.requestFullscreen().catch(() => { }); } catch (e) { }
    render(0);
    X._show = { go, close, play, state: () => ({ k, n: L.length, playing }) };
  };

  /* ---------------- Réglages et licences ---------------- */
  X.settings = async function () {
    const s = CV.settings;
    const body = O.h('div', { cls: 'sett' });
    body.innerHTML = '<h5>Animations</h5><div class="chips">' + [['auto', 'Comme le système'], ['on', 'Toujours'], ['off', 'Réduites']].map((x) => '<button class="chip' + (s.motion === x[0] ? ' on' : '') + '" data-mo="' + x[0] + '">' + x[1] + '</button>').join('') + '</div><p class="hint">« Réduire les animations » du téléphone ou de Windows est respecté : la page tourne sans mouvement.</p>' +
      '<label class="o-check"><input type="checkbox" id="stSnap"' + (s.snap !== false ? ' checked' : '') + '><span>Magnétisme (alignement sur la page et les autres éléments)</span></label>' +
      '<label class="o-check"><input type="checkbox" id="stGeo"' + (s.geo ? ' checked' : '') + '><span>Lieu en clair des photos (Internet)</span></label><p class="hint">Transforme la position GPS des photos en nom de ville. Service BigDataCloud, gratuit et sans clé : la position est envoyée à ce service. Désactivé, rien ne sort de l\'appareil (seules les coordonnées s\'affichent).</p>' +
      '<h5>À propos</h5><p><b>Carnet de voyage</b> — Suite MAG. Tout reste sur ' + (window.MAGPC ? 'cet ordinateur' : 'ce téléphone') + ' (stockage de l\'appli) ; la sauvegarde .magcarnet sert à passer d\'un appareil à l\'autre.</p>' +
      '<h5>Licences</h5><ul class="lic">' +
      '<li><b>Polices</b> (copies locales, sous-ensemble latin) : Caveat (Caveat Project Authors), Kalam (Indian Type Foundry), Amatic SC (Amatic SC Project Authors) — SIL Open Font License 1.1 ; Special Elite (Astigmatic) — Apache 2.0 ; Caladea (Carlo de Fabritiis, Huerta Tipográfica) — SIL OFL 1.1.</li>' +
      '<li><b>Cadres, papiers, couvertures, autocollants et tampons</b> : dessins originaux de l\'appli, générés en SVG.</li>' +
      '<li><b>Icônes</b> : Lucide — licence ISC.</li>' +
      '<li><b>Fond de carte</b> : Natural Earth (naturalearthdata.com) — domaine public.</li>' +
      '<li><b>PDF</b> : jsPDF — MIT. <b>Fichiers .magcarnet</b> : JSZip — MIT.</li>' +
      '<li><b>Services facultatifs</b> : météo Open-Meteo.com (données CC BY 4.0), lieux BigDataCloud (sans clé).</li></ul><p class="hint">Textes complets des licences : dossier LICENSES de l\'appli.</p>';
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-mo]'); if (b) { s.motion = b.dataset.mo; $$('[data-mo]', body).forEach((x) => x.classList.toggle('on', x === b)); CV.saveSettings(); CV.applyMotion(); } });
    body.addEventListener('change', (e) => { if (e.target.id === 'stSnap') s.snap = e.target.checked; if (e.target.id === 'stGeo') s.geo = e.target.checked; CV.saveSettings(); });
    await O.dialog({ title: 'Réglages', body, cls: 'cv-dlg', buttons: [{ label: 'Fermer', value: null, primary: true }] });
  };

  /* ---------------- Clavier (PC) ---------------- */
  let clip = null;
  CV.keys = function () {
    const ed = () => document.body.dataset.screen === 'ed' && E.c && !(O.dialogOpen && O.dialogOpen()) && $('#show').hidden;
    O.keys({
      'mod+z': () => { if (E.drawing) E.endDraw(); E.hist.undo(); },
      'mod+y': () => E.hist.redo(), 'mod+shift+z': () => E.hist.redo(),
      'delete': () => { if (!E.sel.length) return false; E.remove(); }, 'backspace': () => { if (!E.sel.length) return false; E.remove(); },
      'mod+d': () => { if (E.sel.length) E.duplicate(); },
      'mod+g': () => E.group(true), 'mod+shift+g': () => E.group(false),
      'mod+c': () => { const l = E.selItems(); if (!l.length) return false; clip = JSON.parse(JSON.stringify(l)); O.toast(l.length + ' élément(s) copié(s)'); },
      'mod+v': () => { if (!clip) return false; const ids = []; clip.forEach((it) => { const n = JSON.parse(JSON.stringify(it)); n.id = M.uid('i'); n.x += 20; n.y += 20; E.page(E.pi).items.push(n); ids.push(n.id); }); E.renderItems(E.pi); E.select(ids); E.commit('Coller'); },
      'mod+a': () => { E.select(E.page(E.pi).items.map((x) => x.id)); },
      'escape': () => { if (E.drawing) { U().endDraw(); return; } if (!E.sel.length) return false; E.select([]); },
      'arrowleft': () => E.nudge(-2, 0) || (E.go(E.pi - (E.view === 'double' && E.pi > 0 ? 2 : 1)), true), 'arrowright': () => E.nudge(2, 0) || (E.go(E.pi + (E.view === 'double' && E.pi >= 0 ? 2 : 1)), true),
      'arrowup': () => E.nudge(0, -2), 'arrowdown': () => E.nudge(0, 2),
      'shift+arrowleft': () => E.nudge(-20, 0), 'shift+arrowright': () => E.nudge(20, 0), 'shift+arrowup': () => E.nudge(0, -20), 'shift+arrowdown': () => E.nudge(0, 20),
      'pagedown': () => E.go(E.pi + (E.view === 'double' && E.pi >= 0 ? 2 : 1)), 'pageup': () => E.go(E.pi - (E.view === 'double' && E.pi > 0 ? 2 : 1)),
      'f5': () => X.show(E.pi), 'mod+p': () => X.exportDialog(), 'mod+e': () => X.exportDialog(),
      'mod+s': () => { E.saveNow(); O.toast('Enregistré (le carnet s\'enregistre aussi tout seul)'); }
    }, { when: ed });
  };
})();
