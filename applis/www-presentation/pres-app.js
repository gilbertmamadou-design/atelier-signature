/* Présentation — démarrage, fichiers (ouvrir, enregistrer, exporter, imprimer, partager), enregistrement automatique
   et récupération, documents récents, onglet Fichier (coulisses), « Ouvrir avec », tuile Socle (Android), fenêtre publique. */
(function () {
  'use strict';
  const O = window.Office, P = window.Pres, A = window.PresApp, C = A.cmd, F = O.Files, RT = O.RichText;
  const $ = (s) => document.querySelector(s);
  const IO = P.io;
  F.configure({ app: 'presentation', name: 'Présentation', types: [IO.MAGPRES, IO.PPTX, { description: 'Toutes les présentations', accept: { 'application/x-magpres': ['.magpres'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx', '.ppsx'] } }] });
  A.file = { name: '', ref: null, kind: null, recentId: null };
  A.VERSION = '1.0';

  /* ---------------- interface (clair / sombre) ---------------- */
  A.applyUi = () => { if (A.settings.ui) document.documentElement.setAttribute('data-ui', A.settings.ui); else document.documentElement.removeAttribute('data-ui'); document.documentElement.spellcheck = A.settings.spell !== false; };

  /* ---------------- document courant ---------------- */
  A.setDoc = function (doc, blobs, file) {
    if (A.showing) A.endShow();
    if (A.editing) A.stopEdit();
    P.resetMedia(); P.blobs = blobs || {};
    A.doc = doc; A.cur = 0; A.sel = []; A.selSlides = [doc.slides[0].id]; A.groupIn = null; A.cropping = null; A.tableSel = null; A.animSel = null;
    A.file = Object.assign({ name: '', ref: null, kind: null, recentId: null }, file || {});
    A.dirty = false;
    if (A.view !== 'normal') A.setView('normal');
    A.history.reset();
    O.Raster && O.Raster.resetCss();
    A.renderAll(); A.setZoom('fit');
    A.renderTitle();
    if (JSON.stringify(doc).indexOf('"equation"') >= 0) A.loadKatex().then(() => A.renderAll());
  };
  A.docName = () => O.baseName(A.file.name) || A.doc.title || 'Présentation sans titre';
  A.renderTitle = function () {
    const n = $('#docname'); if (n && document.activeElement !== n) n.value = A.docName();
    const st = $('#savestate'); if (st) st.innerHTML = A.dirty ? O.icon('circle-dot') + '<span class="hide-m">Modifiée</span>' : A.file.name ? O.icon('circle-check') + '<span class="hide-m">Enregistrée</span>' : '';
    document.title = A.docName() + ' · Présentation';
    const u = $('#tbUndo'), r = $('#tbRedo'); if (u) { u.disabled = !A.history.canUndo(); u.title = 'Annuler ' + (A.history.undoLabel() || '') + ' (Ctrl+Z)'; } if (r) { r.disabled = !A.history.canRedo(); r.title = 'Rétablir ' + (A.history.redoLabel() || '') + ' (Ctrl+Y)'; }
  };
  /* ---------------- enregistrement automatique ---------------- */
  // Une seule écriture à la fois ; une demande faite pendant une écriture est refaite juste après (sinon l'état
  // enregistré pouvait rester celui d'avant les dernières modifications, et être rouvert tel quel au lancement suivant).
  let saving = null, again = false, warned = false;
  A.autosave = function () {
    if (!A.doc) return Promise.resolve();
    // une récupération est proposée : ne pas l'écraser tant qu'aucun travail n'a été fait
    if (A._pendingRecovery && !A.dirty) return Promise.resolve();
    A._pendingRecovery = false;
    if (saving) { again = true; return saving; }
    saving = (async () => {
      do {
        again = false;
        try {
          const used = P.usedMedia(A.doc), media = {}; used.forEach((id) => { if (P.blobs[id]) media[id] = P.blobs[id]; });
          await F.autosave.put('courant', { doc: A.doc, file: { name: A.file.name, kind: A.file.kind, recentId: A.file.recentId }, dirty: A.dirty }, media);
        } catch (e) {
          console.warn('autosave', e);
          // copie incomplète (espace plein, vidéo trop lourde…) : l'ancienne copie ne doit pas être rouverte à la place du travail actuel
          try { await F.autosave.drop('courant'); } catch (x) { }
          if (!warned) { warned = true; O.toast('Copie de sécurité impossible (espace insuffisant ?) : pensez à enregistrer (Ctrl+S)', { bad: true, ms: 6000 }); }
        }
      } while (again);
      saving = null;
    })();
    return saving;
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && A.doc) A.autosave(); });
  window.addEventListener('pagehide', () => { if (A.doc) A.autosave(); });

  /* ---------------- ouvrir ---------------- */
  async function openBlob(blob, name, ref, opt) {
    opt = opt || {};
    const prog = progressToast('Ouverture de « ' + name + ' »…');
    try {
      let r;
      if (IO.isPptx(name) || (!IO.isMagpres(name) && await isPptxZip(blob))) { r = await IO.fromPptx(blob, (i, n) => prog(i, n)); r.kind = 'pptx'; }
      else { r = await IO.fromZip(blob); r.kind = 'magpres'; }
      prog(1, 1, true);
      if (!opt.dirtyOk && A.dirty && !(await askSave())) return false;
      A.setDoc(r.doc, r.blobs, { name, ref: ref || null, kind: r.kind });
      if (!r.doc.title) r.doc.title = O.baseName(name);
      await addRecent(blob);
      A.closeBackstage();
      if (r.kind === 'pptx' && !opt.quiet) O.toast('Présentation PowerPoint importée. Enregistrer (Ctrl+S) réécrit le .pptx ; « Enregistrer sous » propose aussi le format .magpres, plus complet.', { ms: 5000 });
      // animations qui visent un paragraphe disparu (texte raccourci après la pose des animations) : clics sans effet
      const bad = (r.notes || []).find((x) => x.kind === 'badPara');
      if (bad && !opt.quiet) setTimeout(() => O.toast(bad.count + ' animation' + (bad.count > 1 ? 's visent' : ' vise') + ' un paragraphe qui n\'existe plus (diapositive' + (bad.slides.length > 1 ? 's ' : ' ') + bad.slides.join(', ') + ') : texte modifié après la pose des animations. Ces clics n\'affichent rien.', { bad: true, ms: 15000, action: { label: 'Retirer ces étapes', fn: () => C.cleanAnims() } }), 5200);
      return true;
    } catch (e) { prog(1, 1, true); console.error(e); O.alert('Ouverture impossible', '<p>« ' + O.esc(name) + ' » n\'a pas pu être ouvert.</p><p class="o-hint">' + O.esc(e.message || String(e)) + '</p>'); return false; }
  }
  async function isPptxZip(blob) { try { const z = await window.JSZip.loadAsync(blob.slice ? blob : blob); return !!z.file('ppt/presentation.xml'); } catch (e) { return false; } }
  A.openBlob = openBlob;
  C.open = async function () {
    if (A.showing) return;
    const l = await F.open({ id: 'presentation' }); if (!l.length) return;
    await openBlob(l[0].blob, l[0].name, l[0].ref);
  };
  async function askSave() {
    if (!A.dirty) return true;
    const v = await O.dialog({ title: 'Modifications non enregistrées', body: '<p>Enregistrer les modifications de « ' + O.esc(A.docName()) + ' » ?</p><p class="o-hint">Elles restent aussi dans la récupération automatique tant que vous n\'ouvrez pas une autre présentation.</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Ne pas enregistrer', value: 'no' }, { label: 'Enregistrer', value: 'yes', primary: true }] });
    if (!v) return false;
    if (v === 'yes') return !!(await C.save());
    return true;
  }
  C.newDoc = async function (tpl) {
    if (A.dirty && !(await askSave())) return;
    const doc = P.fromTemplate(tpl || 'vide');
    A.setDoc(doc, {}, {});
    A.closeBackstage();
    A.autosave();
  };
  /** Diapositives d'une autre présentation (.magpres ou .pptx) insérées après la diapo courante */
  A.importSlides = async function () {
    const l = await F.open({ id: 'presentation' }); if (!l.length) return;
    try {
      const r = IO.isPptx(l[0].name) ? await IO.fromPptx(l[0].blob) : await IO.fromZip(l[0].blob);
      Object.assign(P.blobs, r.blobs); Object.assign(A.doc.media, r.doc.media);
      const news = r.doc.slides.map((s) => P.cloneSlide(s));
      A.doc.slides.splice(A.cur + 1, 0, ...news); A.cur += 1; A.selSlides = news.map((s) => s.id);
      A.change('Importer des diapositives'); O.toast(news.length + ' diapositive(s) importée(s) (le thème de cette présentation s\'applique)');
    } catch (e) { O.toast('Import impossible : ' + e.message, { bad: true }); }
  };
  /* ---------------- enregistrer ---------------- */
  async function buildBlob(kind) {
    if (A.editing) A.stopEdit();
    if (kind === 'pptx') { const r = await IO.toPptx(A.doc, progressToast('Création du .pptx…')); if (r.warn.length) O.toast(r.warn.join(' ; '), { bad: true, ms: 6000 }); return r.blob; }
    const thumb = await IO.thumb(A.doc);
    return IO.toZip(A.doc, { thumb });
  }
  C.save = async function () {
    if (A.showing) return false;
    const kind = A.file.kind || 'magpres';
    if (A.file.ref && F.canWrite(A.file.ref)) {
      try {
        const b = await buildBlob(kind);
        await F.write(A.file.ref, b, A.file.name);
        A.dirty = false; A.renderTitle(); O.toast('Enregistré', { ms: 1200 }); await A.autosave(); await addRecent(b); A.autosave(); return true;
      } catch (e) { if (e && e.code === 'perm') { O.toast('Autorisation refusée : choisissez un emplacement', { bad: true }); } else O.toast('Enregistrement impossible : ' + (e.message || e), { bad: true }); }
    }
    return C.saveAs(kind);
  };
  C.saveAs = async function (kind) {
    if (A.showing) return false;
    kind = kind || 'magpres';
    const name = O.safeName(A.docName(), kind === 'pptx' ? '.pptx' : '.magpres');
    try {
      const b = await buildBlob(kind);
      const r = await F.saveAs(b, name, { types: [kind === 'pptx' ? IO.PPTX : IO.MAGPRES], mime: kind === 'pptx' ? O.MIME.pptx : 'application/x-magpres', id: 'presentation' });
      if (!r.ok) { if (r.err) O.toast('Enregistrement impossible : ' + r.err, { bad: true }); return false; }
      A.file = { name: r.name || name, ref: r.ref, kind, recentId: A.file.recentId };
      A.dirty = false; A.renderTitle(); await A.autosave();
      O.toast(r.downloaded ? '« ' + (r.name || name) + ' » téléchargé' : 'Enregistré : ' + (r.name || name), { ms: 2200 });
      await addRecent(b); A.autosave(); A.closeBackstage();
      return true;
    } catch (e) { console.error(e); O.toast('Enregistrement impossible : ' + (e.message || e), { bad: true }); return false; }
  };
  C.exportPptx = async function () {
    try { const r = await IO.toPptx(A.doc, progressToast('Création du .pptx…')); await F.export(r.blob, O.safeName(A.docName(), '.pptx'), { types: [IO.PPTX], mime: O.MIME.pptx }); if (r.warn.length) O.toast(r.warn.join(' ; '), { bad: true }); }
    catch (e) { console.error(e); O.toast('Export .pptx impossible : ' + e.message, { bad: true }); }
  };
  C.exportPdf = async function (opt) {
    try { const b = await IO.pdf(A.doc, opt || {}, progressToast('Création du PDF…')); await F.export(b, O.safeName(A.docName() + ((opt || {}).layout && opt.layout !== 'slides' ? ' (documents)' : ''), '.pdf'), { types: [O.Pdf ? { description: 'Document PDF', accept: { 'application/pdf': ['.pdf'] } } : null].filter(Boolean), mime: 'application/pdf' }); }
    catch (e) { console.error(e); O.toast('Export PDF impossible : ' + e.message, { bad: true }); }
  };
  C.exportImages = async function (opt) {
    opt = opt || {};
    try {
      const imgs = await IO.images(A.doc, opt, progressToast('Création des images…'));
      if (imgs.length === 1) { await F.export(imgs[0].blob, O.safeName(A.docName() + ' - ' + imgs[0].name), { types: [{ description: 'Image', accept: { [imgs[0].blob.type]: ['.' + O.extOf(imgs[0].name)] } }] }); return; }
      const z = new window.JSZip(); imgs.forEach((x) => z.file(x.name, x.blob));
      const zb = await z.generateAsync({ type: 'blob' });
      await F.export(zb, O.safeName(A.docName() + ' (images)', '.zip'), { types: [{ description: 'Archive ZIP', accept: { 'application/zip': ['.zip'] } }] });
    } catch (e) { console.error(e); O.toast('Export d\'images impossible : ' + e.message, { bad: true }); }
  };
  C.print = function (opt) { if (A.editing) A.stopEdit(); IO.print(A.doc, opt || {}, progressToast('Préparation de l\'impression…')).catch((e) => O.toast('Impression impossible : ' + e.message, { bad: true })); };
  C.share = async function (kind) {
    try {
      let b, name;
      if (kind === 'pdf') { b = await IO.pdf(A.doc, {}, progressToast('Création du PDF…')); name = O.safeName(A.docName(), '.pdf'); }
      else if (kind === 'pptx') { b = (await IO.toPptx(A.doc, progressToast('Création du .pptx…'))).blob; name = O.safeName(A.docName(), '.pptx'); }
      else { b = await buildBlob('magpres'); name = O.safeName(A.docName(), '.magpres'); }
      await F.share(b, name);
    } catch (e) { O.toast('Partage impossible : ' + e.message, { bad: true }); }
  };
  /** Avancement d'une opération longue : barre de progression (après 300 ms, donc toujours visible au-delà de 2 s) */
  function progressToast(label) {
    let last = 0, bar = null;
    const t0 = Date.now();
    const show = () => {
      if (!bar) { bar = O.h('div', { cls: 'pres-prog', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100' }); bar.innerHTML = '<span></span><b><i></i></b>'; document.body.appendChild(bar); }
      return bar;
    };
    return (i, n, done) => {
      if (done) { if (bar) { bar.remove(); bar = null; } O.toast('Terminé', { ms: 600 }); return; }
      if (Date.now() - last < 120 && i < n) return; last = Date.now();
      if (Date.now() - t0 < 300 && !bar) return;
      const b = show(), pc = n ? Math.round(Math.min(n, i + 1) / n * 100) : 0;
      b.querySelector('span').textContent = label + (n ? ' ' + Math.min(n, i + 1) + '/' + n : '');
      b.querySelector('i').style.width = pc + '%'; b.setAttribute('aria-valuenow', pc);
    };
  }
  /* ---------------- récents ---------------- */
  async function addRecent(blob) {
    let thumb = ''; try { thumb = await IO.thumb(A.doc); } catch (e) { }
    A.file.recentId = await F.recents.add({ name: A.file.name || A.docName(), ref: A.file.ref, thumb, info: A.doc.slides.length + ' diapositive' + (A.doc.slides.length > 1 ? 's' : ''), blob: A.file.ref ? null : blob });
    await F.dedupeRecents(A.file.ref, A.file.name, A.file.recentId);
    socle(thumb);
  }
  async function openRecent(id) {
    const r = await F.recents.get(id); if (!r) return;
    try { const b = await F.read(r.ref, r.name); await openBlob(b, r.name, r.ref && r.ref.kind !== 'blob' ? r.ref : null); }
    catch (e) { O.dialog({ title: 'Fichier introuvable', body: '<p>« ' + O.esc(r.name) + ' » n\'est plus accessible (' + O.esc(e.message || '') + ').</p>', buttons: [{ label: 'Retirer de la liste', value: 'rm', bad: true }, { label: 'OK', value: null, primary: true }] }).then((v) => { if (v === 'rm') F.recents.remove(id).then(() => A.openBackstage(A.bsTab)); }); }
  }
  /* ---------------- tuile Socle (Android) ---------------- */
  function socle(thumb) {
    const M = window.MAGPrint; if (!M || !M.widgetPut || window.MAGPC) return;
    F.recents.list().then((l) => { try { M.widgetPut(JSON.stringify({ last: l[0] ? { id: l[0].id, title: O.baseName(l[0].name), info: l[0].info, thumb: ((t) => t.length < 60000 ? t : '')(thumb || l[0].thumb || ''), at: l[0].at } : null, count: l.length })); } catch (e) { } });
  }
  window.onSocle = function (json) {
    let a = {}; try { a = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { }
    if (a.open) openRecent(a.open); else if (a['new']) C.newDoc(); else if (a.pick) C.open(); else if (a.show) C.showFrom(0);
  };

  /* ---------------- coulisses « Fichier » ---------------- */
  A.bsTab = 'home';
  A.openBackstage = function (tab) {
    if (A.editing) A.stopEdit();
    A.bsTab = tab || 'home';
    const bs = $('#backstage'); bs.classList.add('on');
    const tabs = [['back', 'arrow-left', 'Retour'], ['home', 'house', 'Accueil'], ['new', 'file-plus', 'Nouveau'], ['open', 'folder-open', 'Ouvrir'], ['-'], ['info', 'info', 'Informations'], ['save', 'save', 'Enregistrer'], ['saveas', 'save-all', 'Enregistrer sous'], ['export', 'file-output', 'Exporter'], ['print', 'printer', 'Imprimer'], ['share', 'share-2', 'Partager'], ['-'], ['options', 'settings', 'Options'], ['about', 'circle-help', 'À propos']];
    bs.innerHTML = '<nav class="bs-nav">' + tabs.map((t) => t[0] === '-' ? '<hr>' : '<button type="button" data-bs="' + t[0] + '" class="' + (t[0] === 'back' ? 'back' : '') + (t[0] === A.bsTab ? ' on' : '') + '">' + O.icon(t[1]) + t[2] + '</button>').join('') + '</nav><div style="flex:1;display:flex;flex-direction:column;min-width:0"><div class="bs-mtop"><button type="button" class="tbb" data-bs="menu">' + O.icon('menu') + '</button><b style="flex:1">' + O.esc((tabs.find((t) => t[0] === A.bsTab) || [])[2] || '') + '</b><button type="button" class="tbb" data-bs="back">' + O.icon('x') + '</button></div><div class="bs-body"></div></div>';
    bs.onclick = (e) => {
      const b = e.target.closest('[data-bs]'); if (b) { const k = b.dataset.bs; if (k === 'back') { if (A.doc) A.closeBackstage(); return; } if (k === 'menu') { bs.querySelector('.bs-nav').classList.toggle('open'); return; } if (k === 'save') { C.save(); return; } A.openBackstage(k); return; }
      const a = e.target.closest('[data-a]'); if (a) bsAction(a.dataset.a, a);
    };
    renderBs(bs.querySelector('.bs-body'));
  };
  A.closeBackstage = function () { const bs = $('#backstage'); bs.classList.remove('on'); bs.innerHTML = ''; setTimeout(() => { A.layoutStage(); A.renderThumbs(true); }, 0); };
  function tplCard(t) { return '<button type="button" class="tpl" data-a="tpl:' + t.id + '"><div class="pv" data-pv="' + t.id + '"></div><b>' + O.esc(t.name) + '</b><small>' + O.esc(t.desc) + '</small></button>'; }
  function fillPreviews(root) {
    O.$$('[data-pv]', root).forEach((pv) => {
      const doc = P.fromTemplate(pv.dataset.pv); const n = P.renderSlide(doc, doc.slides[pv.dataset.pv === 'chantier' ? 0 : 0], { mode: 'thumb', index: 0 });
      const saved = P.blobs; void saved;
      requestAnimationFrame(() => { n.style.transform = 'scale(' + (pv.clientWidth / doc.size.w) + ')'; pv.appendChild(n); P.fitAll(n, doc, doc.slides[0]); });
    });
  }
  async function recentsHtml(max) {
    const l = (await F.recents.list()).slice(0, max || 30);
    if (!l.length) return '<p class="o-hint">Aucun document récent.</p>';
    return '<div class="rec-list">' + l.map((r) => '<div class="rec" data-a="rec:' + r.id + '" role="button" tabindex="0">' + (r.thumb ? '<img src="' + r.thumb + '" alt="">' : '<span class="noimg"></span>') + '<span class="t"><b>' + O.esc(r.name) + '</b><small>' + O.esc(r.info || '') + ' · ' + O.ago(r.at) + (r.ref && r.ref.kind === 'blob' ? ' · copie dans l\'appli' : '') + '</small></span><button type="button" class="pin' + (r.pin ? ' on' : '') + '" data-a="pin:' + r.id + '" title="' + (r.pin ? 'Désépingler' : 'Épingler') + '">' + O.icon(r.pin ? 'pin' : 'pin-off') + '</button><button type="button" class="pin" data-a="rm:' + r.id + '" title="Retirer de la liste">' + O.icon('x') + '</button></div>').join('') + '</div>';
  }
  async function renderBs(body) {
    const tab = A.bsTab; let h = '';
    if (tab === 'home') {
      const rec = await F.autosave.get('courant').catch(() => null);
      if (rec && rec.data && rec.data.dirty && A._pendingRecovery) h += '<div class="recov" style="border-radius:10px;margin-bottom:14px">' + O.icon('life-buoy') + '<span style="flex:1">Une présentation non enregistrée (« ' + O.esc(rec.data.doc.title || O.baseName(rec.data.file && rec.data.file.name) || 'sans titre') + ' », ' + O.ago(rec.at) + ') peut être récupérée.</span><button type="button" data-a="recover">Récupérer</button><button type="button" class="sec2" data-a="norecover">Ignorer</button></div>';
      h += '<h2>Bonjour</h2><h3>Nouveau</h3><div class="tpl-grid">' + P.TEMPLATES.slice(0, 6).map(tplCard).join('') + '</div><p><button type="button" class="mini-btn" data-a="more">' + O.icon('layout-grid') + 'Plus de modèles</button> <button type="button" class="mini-btn" data-a="open">' + O.icon('folder-open') + 'Ouvrir un fichier (.magpres, .pptx)</button></p><h3>Récents</h3>' + await recentsHtml(12);
    } else if (tab === 'new') h = '<h2>Nouveau</h2><div class="tpl-grid">' + P.TEMPLATES.map(tplCard).join('') + '</div>';
    else if (tab === 'open') h = '<h2>Ouvrir</h2><div class="bs-cards"><button type="button" class="bs-card" data-a="open">' + O.icon('folder-open') + '<span><b>Parcourir…</b>Présentation MAG (.magpres) ou PowerPoint (.pptx)' + (O.isPC ? '. Vous pouvez aussi glisser un fichier sur la fenêtre ou utiliser « Ouvrir avec » dans l\'Explorateur.' : '') + '</span></button><button type="button" class="bs-card" data-a="importslides">' + O.icon('file-input') + '<span><b>Importer des diapositives</b>Ajouter les diapositives d\'une autre présentation à celle-ci</span></button></div><h3>Récents</h3>' + await recentsHtml();
    else if (tab === 'info') {
      const d = A.doc, words = d.slides.reduce((a, s) => a + (P.slideText(s).match(/[\p{L}\p{N}’'-]+/gu) || []).length, 0);
      const a11y = A.a11yIssues();
      h = '<h2>Informations</h2><dl class="bs-props"><dt>Titre</dt><dd><input class="o-in" data-prop="title" value="' + O.esc(d.title || '') + '" placeholder="Titre de la présentation"></dd><dt>Auteur</dt><dd><input class="o-in" data-prop="author" value="' + O.esc(d.author || '') + '"></dd><dt>Fichier</dt><dd>' + O.esc(A.file.name || 'non enregistré') + (A.file.kind ? ' (' + A.file.kind + ')' : '') + '</dd><dt>Diapositives</dt><dd>' + d.slides.length + '</dd><dt>Mots</dt><dd>' + words + '</dd><dt>Médias</dt><dd>' + P.usedMedia(d).size + ' (' + O.kb(Array.from(P.usedMedia(d)).reduce((a, id) => a + ((P.blobs[id] || {}).size || 0), 0)) + ')</dd><dt>Format</dt><dd>' + O.esc((P.SIZES.find((s) => s.id === d.size.name) || { name: 'Personnalisé' }).name) + ' · ' + O.round(d.size.w / 96 * 2.54, 2).toString().replace('.', ',') + ' × ' + O.round(d.size.h / 96 * 2.54, 2).toString().replace('.', ',') + ' cm</dd><dt>Créée</dt><dd>' + O.fmtDate(d.created, true) + '</dd><dt>Modifiée</dt><dd>' + O.fmtDate(d.modified, true) + '</dd></dl>' +
        '<h3>Accessibilité</h3><p>' + (a11y.length ? a11y.length + ' point(s) à vérifier. <button type="button" class="mini-btn" data-a="a11y">' + O.icon('accessibility') + 'Vérifier</button>' : O.icon('circle-check') + ' Aucun problème détecté.') + '</p><h3>Confidentialité</h3><p class="o-hint">Tout reste sur cet appareil : la présentation, ses images et vidéos ne sont jamais envoyées sur internet. Seules les vidéos YouTube insérées par lien sont lues depuis YouTube pendant le diaporama.</p>';
    } else if (tab === 'saveas') h = '<h2>Enregistrer sous</h2><div class="bs-cards"><button type="button" class="bs-card" data-a="saveas:magpres">' + O.icon('file-check') + '<span><b>Présentation MAG (.magpres)</b>Format complet de l\'appli : tout est conservé (animations, SmartArt, équations, commentaires…). Recommandé.</span></button><button type="button" class="bs-card" data-a="saveas:pptx">' + O.icon('file-down') + '<span><b>PowerPoint (.pptx)</b>Pour partager avec PowerPoint, LibreOffice Impress, Keynote ou Google Slides.</span></button></div>';
    else if (tab === 'export') h = '<h2>Exporter</h2><h3>PDF</h3><div class="o-form" style="max-width:640px"><label class="o-field half"><span>Mise en page</span><select class="o-in" id="pdfLay"><option value="slides">Une diapositive par page</option><option value="1">Documents : 1 par page</option><option value="2">Documents : 2 par page</option><option value="3">Documents : 3 par page (lignes pour notes)</option><option value="4">Documents : 4 par page</option><option value="6">Documents : 6 par page</option><option value="9">Documents : 9 par page</option><option value="notes">Pages de commentaires (diapo + notes)</option></select></label><label class="o-field half"><span>Qualité</span><select class="o-in" id="pdfQ"><option value="std">Standard</option><option value="high">Haute (impression)</option></select></label><label class="o-check"><input type="checkbox" id="pdfHid"><span>Inclure les diapositives masquées</span></label></div><p><button type="button" class="o-btn pri" data-a="pdf">' + O.icon('file-text') + 'Exporter en PDF</button></p>' +
      '<h3>PowerPoint</h3><p><button type="button" class="o-btn" data-a="pptx">' + O.icon('file-down') + 'Exporter en .pptx</button></p><h3>Images</h3><div class="o-form" style="max-width:640px"><label class="o-field half"><span>Format</span><select class="o-in" id="imgF"><option value="png">PNG</option><option value="jpg">JPG</option></select></label><label class="o-field half"><span>Largeur</span><select class="o-in" id="imgW"><option value="1280">1280 px</option><option value="1920" selected>1920 px (Full HD)</option><option value="3840">3840 px (4K)</option></select></label></div><p style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="o-btn" data-a="img:cur">' + O.icon('image') + 'Diapositive actuelle</button><button type="button" class="o-btn" data-a="img:all">' + O.icon('images') + 'Toutes les diapositives (zip)</button></p><h3>Plan</h3><p><button type="button" class="o-btn" data-a="outline">' + O.icon('list-tree') + 'Exporter le plan et les notes (.txt)</button></p>';
    else if (tab === 'print') h = '<h2>Imprimer</h2><div class="o-form" style="max-width:640px"><label class="o-field half"><span>Mise en page</span><select class="o-in" id="prLay"><option value="slides">Diapositives pleine page</option><option value="2">Documents : 2 par page</option><option value="3">Documents : 3 par page</option><option value="6">Documents : 6 par page</option><option value="notes">Pages de commentaires</option></select></label><label class="o-check"><input type="checkbox" id="prHid"><span>Imprimer les diapositives masquées</span></label></div><p><button type="button" class="o-btn pri" data-a="print">' + O.icon('printer') + 'Imprimer</button></p><p class="o-hint">Astuce : choisissez « Enregistrer au format PDF » comme imprimante pour obtenir un PDF.</p>';
    else if (tab === 'share') h = '<h2>Partager</h2><div class="bs-cards"><button type="button" class="bs-card" data-a="share:magpres">' + O.icon('file-check') + '<span><b>Présentation MAG</b>.magpres, pour une autre appli Présentation</span></button><button type="button" class="bs-card" data-a="share:pptx">' + O.icon('file-down') + '<span><b>PowerPoint</b>.pptx</span></button><button type="button" class="bs-card" data-a="share:pdf">' + O.icon('file-text') + '<span><b>PDF</b>Pour lecture et impression</span></button></div>';
    else if (tab === 'options') h = '<h2>Options</h2><div class="o-form" style="max-width:560px"><label class="o-field"><span>Votre nom (commentaires, auteur des nouvelles présentations)</span><input class="o-in" data-opt="auteur" value="' + O.esc(localStorage.getItem('presentation:auteur') || '') + '"></label><label class="o-field half"><span>Apparence</span><select class="o-in" data-opt="ui"><option value="">Comme le système</option><option value="clair"' + (A.settings.ui === 'clair' ? ' selected' : '') + '>Claire</option><option value="sombre"' + (A.settings.ui === 'sombre' ? ' selected' : '') + '>Sombre</option></select></label><label class="o-check"><input type="checkbox" data-opt="spell"' + (A.settings.spell !== false ? ' checked' : '') + '><span>Vérifier l\'orthographe pendant la saisie</span></label><label class="o-check"><input type="checkbox" data-opt="snap"' + (A.settings.snap !== false ? ' checked' : '') + '><span>Magnétisme des objets</span></label></div><h3>Récupération</h3><p><button type="button" class="mini-btn" data-a="clearrec">' + O.icon('trash-2') + 'Vider la liste des récents</button></p>';
    else if (tab === 'about') h = aboutHtml();
    body.innerHTML = h;
    fillPreviews(body);
    O.$$('[data-prop]', body).forEach((i) => i.addEventListener('change', () => { A.doc[i.dataset.prop] = i.value; A.change('Propriétés', { noThumbs: true }); A.renderTitle(); }));
    O.$$('[data-opt]', body).forEach((i) => i.addEventListener('change', () => {
      const k = i.dataset.opt;
      if (k === 'auteur') { try { localStorage.setItem('presentation:auteur', i.value.trim()); } catch (e) { } }
      else if (k === 'ui') { A.settings.ui = i.value; A.saveSettings(); A.applyUi(); }
      else { A.settings[k] = i.checked; A.saveSettings(); A.applyUi(); }
    }));
    O.$$('.rec', body).forEach((r) => r.addEventListener('keydown', (e) => { if (e.key === 'Enter') r.click(); }));
  }
  async function bsAction(a, el) {
    const [k, v] = a.split(':');
    if (k === 'tpl') { C.newDoc(v); return; }
    if (k === 'more') { A.openBackstage('new'); return; }
    if (k === 'open') { C.open(); return; }
    if (k === 'importslides') { A.closeBackstage(); A.importSlides(); return; }
    if (k === 'rec') { if (el.closest('.pin')) return; openRecent(v); return; }
    if (k === 'pin') { const r = await F.recents.get(v); await F.recents.pin(v, !(r && r.pin)); A.openBackstage(A.bsTab); return; }
    if (k === 'rm') { await F.recents.remove(v); A.openBackstage(A.bsTab); return; }
    if (k === 'saveas') { C.saveAs(v); return; }
    if (k === 'pdf') { C.exportPdf({ layout: $('#pdfLay').value, quality: $('#pdfQ').value, hidden: $('#pdfHid').checked }); return; }
    if (k === 'pptx') { C.exportPptx(); return; }
    if (k === 'img') { C.exportImages({ format: $('#imgF').value, width: +$('#imgW').value, only: v === 'cur' ? A.cur : null }); return; }
    if (k === 'outline') { const t = A.doc.slides.map((s, i) => (i + 1) + '. ' + (P.slideTitle(s) || '(sans titre)') + '\n' + P.slideText(s).split('\n').filter((l) => l && l !== P.slideTitle(s)).map((l) => '   ' + l).join('\n') + (s.notes ? '\n   [Notes] ' + RT.textOf(s.notes).replace(/\n/g, '\n           ') : '')).join('\n\n'); F.export(new Blob(['﻿' + t], { type: 'text/plain;charset=utf-8' }), O.safeName(A.docName() + ' (plan)', '.txt'), { types: [{ description: 'Texte', accept: { 'text/plain': ['.txt'] } }] }); return; }
    if (k === 'print') { C.print({ layout: $('#prLay').value, hidden: $('#prHid').checked }); return; }
    if (k === 'share') { C.share(v); return; }
    if (k === 'a11y') { A.closeBackstage(); A.openPane('a11y'); return; }
    if (k === 'clearrec') { await F.recents.clear(); O.toast('Liste vidée (les épinglés restent)'); return; }
    if (k === 'recover') { A._pendingRecovery = false; await recover(); return; }
    if (k === 'norecover') { A._pendingRecovery = false; const r = await F.autosave.get('courant'); if (r) { r.data.dirty = false; await F.autosave.put('courant', r.data, r.media); } A.openBackstage('home'); return; }
  }
  async function recover() {
    const r = await F.autosave.get('courant'); if (!r) return;
    const doc = IO.upgrade(r.data.doc);
    A.setDoc(doc, r.media, r.data.file ? { name: r.data.file.name, kind: r.data.file.kind, recentId: r.data.file.recentId, ref: null } : {});
    A.dirty = true; A.renderTitle(); A._recoveryOffered = r.at;
    A.closeBackstage(); O.toast('Présentation récupérée. Pensez à l\'enregistrer (Ctrl+S).', { ms: 4000 });
  }
  function aboutHtml() {
    const lic = [['PptxGenJS 4.0.1', 'MIT', 'Brent Ely — export .pptx', 'pptxgenjs-MIT.txt'], ['JSZip 3.10.1', 'MIT (ou GPLv3, au choix ; utilisé sous MIT)', 'fichiers .magpres et .pptx', 'jszip-MIT-ou-GPLv3.md'], ['jsPDF 2.5.1', 'MIT', 'export PDF', 'jspdf-MIT.txt'], ['KaTeX 0.16.47', 'MIT', 'Khan Academy — équations', 'katex-MIT.txt'], ['Lucide 1.64.0', 'ISC', 'icônes de l\'interface et jeu d\'icônes', 'lucide-ISC.txt']];
    return '<h2>À propos</h2><p><b>Présentation</b> · Suite MAG · version ' + A.VERSION + '</p><p class="o-hint" style="max-width:720px">Diaporamas hors ligne : rien n\'est envoyé sur internet. Formats : .magpres (natif, ouvert : zip contenant presentation.json et les médias), import et export .pptx, export PDF et images.</p><h3>Bibliothèques libres utilisées</h3><table class="kbd-tbl" style="max-width:760px">' + lic.map((l) => '<tr><td><b>' + l[0] + '</b><br><small class="o-hint">' + l[2] + '</small></td><td>' + l[1] + '</td></tr>').join('') + '</table><p class="lic o-hint">Les textes complets des licences sont fournis avec l\'appli (dossier <code>LICENSES</code>). Polices : celles du système (aucune police téléchargée). Les noms PowerPoint, Office et Microsoft appartiennent à leurs propriétaires ; Présentation est une appli indépendante.</p><p><button type="button" class="mini-btn" data-a="noop" onclick="PresApp.cmd.shortcuts()">' + O.icon('keyboard') + 'Raccourcis clavier</button></p>';
  }
  /* ---------------- raccourcis ---------------- */
  C.shortcuts = function (inShow) {
    const rows = [['Fichier', ''], ['Nouvelle présentation', 'Ctrl+N'], ['Ouvrir', 'Ctrl+O'], ['Enregistrer / Enregistrer sous', 'Ctrl+S / Ctrl+Maj+S'], ['Imprimer', 'Ctrl+P'], ['Édition', ''], ['Annuler / Rétablir', 'Ctrl+Z / Ctrl+Y'], ['Couper, copier, coller', 'Ctrl+X, Ctrl+C, Ctrl+V'], ['Dupliquer', 'Ctrl+D'], ['Tout sélectionner', 'Ctrl+A'], ['Grouper / Dissocier', 'Ctrl+G / Ctrl+Maj+G'], ['Copier / coller la mise en forme', 'Ctrl+Maj+C / Ctrl+Maj+V'], ['Rechercher / Remplacer', 'Ctrl+F / Ctrl+H'], ['Lien hypertexte', 'Ctrl+K'], ['Déplacer (fin / large)', '↑ ↓ ← → / Maj+flèches'], ['Modifier le texte de l\'objet', 'Entrée ou F2 ; Échap pour sortir'], ['Objet suivant / précédent', 'Tab / Maj+Tab'], ['Nouvelle diapositive', 'Ctrl+M'], ['Diapositive précédente / suivante', 'Pg préc. / Pg suiv.'], ['Texte', ''], ['Gras, italique, souligné', 'Ctrl+B, Ctrl+I, Ctrl+U'], ['Aligner gauche, centre, droite, justifier', 'Ctrl+L, Ctrl+E, Ctrl+R, Ctrl+J'], ['Agrandir / réduire la police', 'Ctrl+] / Ctrl+['], ['Niveau de liste', 'Tab / Maj+Tab'], ['Affichage', ''], ['Zoom', 'Ctrl+molette, Ctrl+plus / moins, Ctrl+0'], ['Rechercher une commande', 'Alt+Q'], ['Réduire le ruban', 'Ctrl+F1'], ['Diaporama', ''], ['Depuis le début / la diapo actuelle', 'F5 / Maj+F5'], ['Mode présentateur', 'Alt+F5'], ['Suivant / précédent', 'Espace, →, Pg suiv., clic / ←, Pg préc.'], ['Aller à la diapositive n', 'n puis Entrée'], ['Écran noir / blanc', 'B / W'], ['Stylo, surligneur, laser, flèche', 'Ctrl+P, Ctrl+I, Ctrl+L, Ctrl+A'], ['Effacer les annotations', 'E'], ['Toutes les diapositives', 'G'], ['Terminer', 'Échap']];
    O.dialog({ title: 'Raccourcis clavier', wide: true, body: '<table class="kbd-tbl">' + rows.map((r) => r[1] ? '<tr><td>' + O.esc(r[0]) + '</td><td>' + r[1].split(/(, | \/ )/).map((x) => /^(, | \/ )$/.test(x) ? x : '<kbd>' + O.esc(x) + '</kbd>').join('') + '</td></tr>' : '<tr><td colspan="2"><b>' + O.esc(r[0]) + '</b></td></tr>').join('') + '</table>' });
    void inShow;
  };

  /* ---------------- barre de titre ---------------- */
  function titlebar() {
    const tb = $('#titlebar');
    tb.innerHTML = '<img class="logo" src="icon-512.png" alt=""><input id="docname" aria-label="Nom de la présentation" spellcheck="false"><span id="savestate"></span><button type="button" class="tbb" id="tbSave" title="Enregistrer (Ctrl+S)">' + O.icon('save') + '</button><button type="button" class="tbb" id="tbUndo" title="Annuler (Ctrl+Z)">' + O.icon('undo-2') + '</button><button type="button" class="tbb" id="tbRedo" title="Rétablir (Ctrl+Y)">' + O.icon('redo-2') + '</button><span class="tb-sp"></span>' +
      '<button type="button" class="tbb hide-m" id="tbComments" title="Commentaires">' + O.icon('messages-square') + '</button><button type="button" class="tbb hide-m" id="tbShare" title="Partager">' + O.icon('share-2') + '<span>Partager</span></button><button type="button" class="tbb pri" id="tbShow" title="Diaporama depuis la diapositive actuelle (Maj+F5)">' + O.icon('play') + '<span class="hide-m">Diaporama</span></button><button type="button" class="tbb" id="tbShowMenu" aria-label="Options du diaporama">' + O.icon('chevron-down') + '</button>';
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'tbSave') C.save(); if (b.id === 'tbUndo') A.undo(); if (b.id === 'tbRedo') A.redo();
      if (b.id === 'tbShow') C.showFrom(A.cur); if (b.id === 'tbShare') A.openBackstage('share'); if (b.id === 'tbComments') A.openPane(A.pane === 'comments' ? null : 'comments');
      if (b.id === 'tbShowMenu') O.menu(b, [{ label: 'À partir du début', icon: 'play', kbd: 'F5', on: () => C.showFrom(0) }, { label: 'À partir de la diapositive actuelle', icon: 'square-play', kbd: 'Maj+F5', on: () => C.showFrom(A.cur) }, { label: 'Mode présentateur', icon: 'presentation', kbd: 'Alt+F5', on: () => C.presenter() }, { label: 'Vérifier le minutage', icon: 'timer-reset', on: () => C.rehearse() }]);
    });
    const dn = $('#docname');
    dn.addEventListener('change', () => { const v = dn.value.trim(); if (!v) { A.renderTitle(); return; } A.doc.title = v; if (A.file.name && !A.file.ref) A.file.name = O.safeName(v, A.file.kind === 'pptx' ? '.pptx' : '.magpres'); A.change('Titre', { noThumbs: true }); });
    dn.addEventListener('keydown', (e) => { if (e.key === 'Enter') dn.blur(); });
  }
  /* ---------------- notes ---------------- */
  function notesInit() {
    const n = $('#notesEd'), box = $('#notes');
    n.setAttribute('spellcheck', 'true'); n.setAttribute('lang', 'fr'); n.setAttribute('role', 'textbox'); n.setAttribute('aria-label', 'Notes du présentateur');
    // les notes vont toujours à la diapo affichée quand elles ont été saisies (n._slide)
    const commit = O.debounce(() => { A.history.commit('Notes'); A.renderTitle(); A.autosave(); }, 800);
    const store = () => { const s = A.doc.slides.find((x) => x.id === n._slide); if (!s) return; const v = RT.isEmpty(n.innerHTML) ? '' : RT.sanitize(n.innerHTML); if (v !== (s.notes || '')) { s.notes = v; A.dirty = true; commit(); } };
    A.storeNotes = store;
    RT.attach(n, { tabIndent: false, onInput: store });
    n.addEventListener('blur', store);
    box.classList.toggle('closed', A.settings.notes === false);
    const grip = $('#notesGrip');
    grip.addEventListener('pointerdown', (e) => { const h0 = box.offsetHeight; O.drag(e, { move: (dx, dy) => { box.style.height = O.clamp(h0 - dy, 50, innerHeight * 0.6) + 'px'; }, end: () => A.layoutStage() }); });
  }
  /* ---------------- dépôt de fichiers sur la fenêtre (hors PC : le shim PC le gère) ---------------- */
  function dropInit() {
    if (O.isPC) return;
    const hint = $('#dropHint');
    window.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0 && !e.target.closest('#stage')) { e.preventDefault(); hint.classList.add('on'); } });
    window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) hint.classList.remove('on'); });
    window.addEventListener('drop', (e) => { hint.classList.remove('on'); const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find((x) => /\.(magpres|pptx|ppsx)$/i.test(x.name)); if (!f) return; e.preventDefault(); openBlob(f, f.name, null); });
  }
  function launchFiles(l) {
    const f = l.find((x) => /\.(magpres|pptx|ppsx)$/i.test(x.name));
    const media = l.filter((x) => /^(image|video|audio)\//.test(x.blob.type || O.mimeOf(x.name)));
    if (f) { openBlob(f.blob, f.name, f.ref); return; }
    if (media.length && A.doc) { A.closeBackstage(); media.forEach((m) => { const fl = m.blob instanceof File ? m.blob : new File([m.blob], m.name, { type: m.blob.type }); if (/^video/.test(fl.type)) C.addVideoFile(fl); else if (/^audio/.test(fl.type)) C.addAudioFile(fl); else C.addImage(fl); }); }
  }

  /* ---------------- démarrage ---------------- */
  async function boot() {
    if (/[?&]public=1/.test(location.search)) { A.startAudience(); return; }
    A.applyUi();
    A.doc = P.newDoc(); A.selSlides = [A.doc.slides[0].id];
    titlebar();
    A.mountRibbon();
    A.mountEditor();
    A.thumbsInit(); A.sorterInit();
    notesInit(); dropInit();
    const rec = await F.autosave.get('courant').catch(() => null);
    if (rec && rec.data && rec.data.doc && !rec.data.dirty) {
      // reprise silencieuse de la dernière présentation (enregistrée) : comme une appli qu'on rouvre
      try { const doc = IO.upgrade(rec.data.doc); A.setDoc(doc, rec.media, rec.data.file ? { name: rec.data.file.name, kind: rec.data.file.kind, recentId: rec.data.file.recentId, ref: null } : {}); if (rec.data.file && rec.data.file.recentId) { const r = await F.recents.get(rec.data.file.recentId); if (r && r.ref && r.ref.kind !== 'blob') A.file.ref = r.ref; } }
      catch (e) { A.setDoc(P.fromTemplate('vide'), {}, {}); }
      // le fichier sur le disque est plus récent que la copie de sécurité (fermeture juste après Ctrl+S, par exemple) : c'est lui qui fait foi
      try {
        const ref = A.file.ref, h = ref && ref.kind === 'handle' && ref.handle;
        if (h && h.queryPermission && (await h.queryPermission({ mode: 'read' })) === 'granted') {
          const f = await h.getFile();
          if (f.lastModified > rec.at + 1500) await openBlob(f, A.file.name || f.name, ref, { dirtyOk: true, quiet: true });
        }
      } catch (e) { console.warn('reprise', e); }
    } else A.setDoc(P.fromTemplate('vide'), {}, {});
    A.renderStatus();
    F.onLaunch(launchFiles);
    if (rec && rec.data && rec.data.dirty) { A._pendingRecovery = true; A.openBackstage('home'); }
    else if (!rec) A.openBackstage('home');
    // Socle (Android) : action demandée au lancement
    setTimeout(() => { try { const M = window.MAGPrint; if (M && M.takeSocle && !window.MAGPC) { const x = M.takeSocle(); if (x) window.onSocle(x); } } catch (e) { } socle(''); }, 400);
    window.addEventListener('beforeunload', (e) => { if (A.dirty && !A.file.ref && !O.isAndroid) { A.autosave(); } });
    // retour Android : fermer menu / volet / coulisses / diaporama
    window.addEventListener('popstate', () => { });
    document.documentElement.classList.add('ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
