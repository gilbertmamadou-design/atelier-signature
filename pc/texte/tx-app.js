/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-texte/tx-app.js : ne pas modifier ici. */
/* Texte — démarrage, document courant, enregistrement automatique et récupération, fichiers (ouvrir, enregistrer,
   exporter, imprimer, partager), documents récents, coulisses « Fichier », « Ouvrir avec », dépôt, tuile Socle. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, F = O.Files, PM = window.PM;
  const A = window.TexteApp = window.TexteApp || {};
  A.cmd = A.cmd || {};
  const C = A.cmd;
  const $ = (s) => document.querySelector(s);
  A.VERSION = '1.0';
  F.configure({ app: 'texte', name: 'Texte', types: TX.IO.OPEN_TYPES });
  A.file = { name: '', ref: null, kind: null, recentId: null };

  /* ---------------- réglages de l'interface ---------------- */
  const SK = 'texte:reglages';
  A.settings = (() => { try { return Object.assign({ ruler: true, nav: false, marks: false, spell: true, auto: true, zoom: 1, fit: null, view: 'page', rev: 'all', cmts: true }, JSON.parse(localStorage.getItem(SK) || '{}')); } catch (e) { return { ruler: true, view: 'page', zoom: 1, spell: true, auto: true, rev: 'all', cmts: true }; } })();
  A.saveSettings = () => { try { localStorage.setItem(SK, JSON.stringify(A.settings)); } catch (e) { } };
  A.applyUi = () => {
    if (A.settings.ui) document.documentElement.setAttribute('data-ui', A.settings.ui); else document.documentElement.removeAttribute('data-ui');
    document.documentElement.classList.toggle('norulers', !A.settings.ruler || A.settings.view !== 'page');
    if (A.ed) A.ed.view.dom.setAttribute('spellcheck', A.settings.spell !== false ? 'true' : 'false');
  };
  TX.userName = () => { try { return localStorage.getItem('texte:auteur') || ''; } catch (e) { return ''; } };
  TX.placeholder = 'Commencez à écrire…';

  /* ---------------- document : attributs, styles CSS, thème ---------------- */
  A.view = () => (A.partEd && A.partEd.view) || A.ed.view;          // vue active (document, en-tête / pied, note)
  A.state = () => A.ed.view.state;
  A.attrs = () => {
    const a = A.ed.view.state.doc.attrs;
    if (!A.partDraft) return a;
    // brouillon d'un en-tête / pied ou d'une note en cours de modification
    const o = Object.assign({}, a);
    if (A.partDraft.kind === 'part') o.parts = Object.assign({}, a.parts, { [A.partDraft.id]: { doc: A.partDraft.json } });
    else o.notes = Object.assign({}, a.notes, { [A.partDraft.id]: { doc: A.partDraft.json } });
    return o;
  };
  TX._mainAttrs = () => A.attrs();
  /** Modifier un attribut du document principal (styles, listes, réglages, notes…) : annulable */
  A.setAttr = function (key, value, label) {
    const tr = A.ed.view.state.tr.setDocAttribute(key, value);
    if (label) tr.setMeta('tx-label', label);
    A.ed.view.dispatch(TX.refresh(tr));
  };
  TX._setMainAttr = (k, v) => { setTimeout(() => A.setAttr(k, v), 0); };
  A.theme = () => TX.themeOf(A.attrs().settings);
  window.Pres = window.Pres || {};
  window.Pres.theme = () => A.theme();
  let lastStyles = null, lastSettings = null;
  A.applyDocStyles = function (force) {
    const at = A.attrs();
    if (!force && at.styles === lastStyles && at.settings === lastSettings) return false;
    lastStyles = at.styles; lastSettings = at.settings;
    let el = $('#txDocStyles'); if (!el) { el = document.createElement('style'); el.id = 'txDocStyles'; document.head.appendChild(el); }
    el.textContent = TX.styleSheet(at, '.tx-doc') + TX.TABLE_STYLES.map((s) => TX.tableStyleCss(s.id, '.tx-doc')).join('');
    const th = A.theme();
    const vars = O.Themes.vars(th); const paper = $('#paper');
    Object.keys(vars).forEach((k) => paper.style.setProperty(k, vars[k]));
    document.documentElement.style.setProperty('--t-hlink', th.colors.hlink);
    ['--t-major', '--t-minor'].forEach((k) => document.documentElement.style.setProperty(k, vars[k]));
    const s = at.settings || {};
    A.ed.view.dom.classList.toggle('tx-hyph', !!s.hyphen);
    A.ed.view.dom.style.hyphens = s.hyphen ? 'auto' : '';
    if (A.layout) A.layout.clearCache();
    return true;
  };

  /* ---------------- contexte des champs (numéros de page, notes, renvois…) ---------------- */
  const numSt = () => TX.numKey.getState(A.ed.view.state);
  A.ctx = {
    props: () => A.attrs().props || {}, attrs: () => A.attrs(),
    chartDoc: () => ({ theme: A.theme() }),
    noteLabel: (id, end) => { const st = numSt(); const n = st ? (end ? st.notes.end : st.notes.foot)[id] : 0; const fmt = (A.attrs().settings || {})[end ? 'enFmt' : 'fnFmt'] || (end ? 'lowerRoman' : 'decimal'); if (!n) return '?'; if (fmt === 'symbol') return ['*', '†', '‡', '§', '¶', '#'][(n - 1) % 6].repeat(Math.ceil(n / 6)); return TX.fmtNum(n, fmt); },
    pageLabel: (pos) => A.layout ? A.layout.pageLabelAt(pos) : '1',
    pageCount: () => A.layout && A.layout.pages.length ? A.layout.pages.length : 1,
    fileName: () => A.file.name || (A.docName() + '.magdoc'),
    wordCount: () => TX.stats(A.ed.view.state.doc).words,
    seqAt: (pos, name) => { const st = numSt(); return st && st.seqPos[pos] || 1; },
    mergeRecord: () => A.merge && A.merge.preview != null && A.merge.data ? A.merge.data.rows[A.merge.preview] : null,
    refText: (a) => A.refText(a),
    tocEntries: (a) => A.tocEntries(a)
  };
  /** Entrées d'une table des matières ou des illustrations */
  A.tocEntries = function (a) {
    const st = numSt(); if (!st) return [];
    if (a.kind === 'tof') return st.captions.filter((c) => !a.label || c.label === a.label).map((c) => ({ text: c.text, level: 1, pos: c.pos, page: A.ctx.pageLabel(c.pos) }));
    return st.heads.filter((h) => h.level <= (a.levels || 3) && h.text).map((h) => ({ text: (h.label ? h.label + ' ' : '') + h.text, level: h.level, pos: h.pos, page: A.ctx.pageLabel(h.pos) }));
  };
  /** Texte d'un renvoi : {ref:{kind, id}, show:'text'|'page'|'number'|'above'} */
  A.refText = function (a) {
    const r = a.ref || {}, st = numSt(), doc = A.ed.view.state.doc;
    let pos = null, text = '', number = '';
    if (r.kind === 'bookmark') { doc.descendants((n, p) => { if (pos == null && n.type.name === 'bookmark' && n.attrs.name === r.id) pos = p; return pos == null; }); if (pos != null) { const $p = doc.resolve(pos); text = TX.textOf($p.parent).trim(); } }
    else if (r.kind === 'heading' || r.kind === 'caption') { doc.descendants((n, p) => { if (pos == null && n.type.name === 'paragraph' && n.attrs.pid === r.id) { pos = p; text = TX.textOf(n).trim(); } return pos == null; }); if (pos != null && st) { const h = st.heads.find((x) => x.pos === pos); if (h) number = h.label; const c = st.captions.find((x) => x.pos === pos); if (c) number = c.label + ' ' + c.n; } }
    else if (r.kind === 'note') { const n = st && (st.notes.foot[r.id] || st.notes.end[r.id]); number = n ? String(n) : '?'; doc.descendants((nd, p) => { if (pos == null && nd.type.name === 'fnref' && nd.attrs.id === r.id) pos = p; return pos == null; }); }
    if (pos == null) return 'Erreur ! Source du renvoi introuvable.';
    const sel = A.ed.view.state.selection.from;
    switch (a.show) {
      case 'page': return A.ctx.pageLabel(pos);
      case 'number': return number || text;
      case 'above': return pos < sel ? 'ci-dessus' : 'ci-dessous';
      case 'label': return number;
      default: return text || number;
    }
  };

  /* ---------------- document courant ---------------- */
  A.newEditor = function (json) {
    const host = $('#docBody'); host.innerHTML = '';
    if (A.ed) A.ed.destroy();
    A.ed = new TX.Editor({
      host, doc: json, kind: 'main', ctx: A.ctx, label: 'Document',
      track: (state) => !!((state.doc.attrs.settings || {}).track),
      auto: () => A.settings.auto !== false,
      onChange: A.onChange,
      handleClickOn: (view, pos, node, nodePos, ev) => { if (node.type.name === 'fnref' && ev.detail === 1) { return false; } return false; },
      domEvents: { contextmenu: (view, e) => { if (A.contextMenu) { A.contextMenu(e); return true; } return false; }, focus: () => { A.lastFocus = 'main'; }, keydown: (view, e) => A.onEditorKey && A.onEditorKey(e) },
      handleDrop: (view, e) => A.onDropFiles ? A.onDropFiles(e) : false,
      handlePaste: (view, e) => A.onPasteFiles ? A.onPasteFiles(e) : false
    });
    A.ed.onNoteClick = (id) => A.editNote && A.editNote(id);
    A.ed.onTocClick = (e) => { if (e && e.pos != null) A.goTo(e.pos); };
    A.ed.tocClick = true;
    A.ed.onObjectDblClick = (node, pos) => A.objectDblClick && A.objectDblClick(node, pos);
  };
  A.setDoc = function (json, media, file, opt) {
    opt = opt || {};
    if (A.partEd) A.closePart && A.closePart(false);
    TX.media.reset(media || {}, opt.info || {});
    lastStyles = null;
    A.newEditor(json);
    A.file = Object.assign({ name: '', ref: null, kind: null, recentId: null }, file || {});
    A.dirty = false;
    A.merge = opt.merge || (json.attrs && json.attrs.settings && json.attrs.settings.merge ? { data: json.attrs.settings.merge, preview: null } : null);
    A.applyDocStyles(true);
    A.ed.view.dispatch(A.ed.view.state.tr.setMeta(TX.marksKey, { on: !!A.settings.marks }).setMeta('addToHistory', false).setMeta('tx-layout', 1));
    A.setView(A.settings.view || 'page', true);
    A.renderTitle(); A.refreshUi && A.refreshUi();
    if (JSON.stringify(json).indexOf('"math"') >= 0) TX.loadKatex();
    A.relayout(true);
    A.ed.view.focus();
    const t = A.ed.view.state.doc; A.ed.view.dispatch(A.ed.view.state.tr.setSelection(PM.state.TextSelection.atStart(t)).setMeta('tx-layout', 1).setMeta('addToHistory', false));
    A.paneRefresh && A.paneRefresh();
  };
  A.docName = () => O.baseName(A.file.name) || (A.attrs().props || {}).title || 'Document sans titre';
  A.renderTitle = function () {
    const n = $('#docname'); if (n && document.activeElement !== n) n.value = A.docName();
    const st = $('#savestate'); if (st) st.innerHTML = A.dirty ? O.icon('circle-dot') + '<span class="hide-m">Modifié</span>' : A.file.name ? O.icon('circle-check') + '<span class="hide-m">Enregistré</span>' : '';
    document.title = A.docName() + ' · Texte';
    const H = PM.history, s = A.view().state;
    const u = $('#tbUndo'), r = $('#tbRedo'); if (u) u.disabled = !H.undoDepth(s); if (r) r.disabled = !H.redoDepth(s);
  };

  /* ---------------- modifications : mise en page, enregistrement automatique ---------------- */
  let layoutT = null, autoT = null, uiT = null;
  A.relayout = function (now) {
    clearTimeout(layoutT);
    const go = () => { A.layout.run(); A.afterLayout && A.afterLayout(); };
    if (now) { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(go)); return; }
    const n = A.ed.view.state.doc.content.size;
    layoutT = setTimeout(() => requestAnimationFrame(go), n > 60000 ? 450 : n > 15000 ? 220 : 90);
  };
  A.onChange = function (tr, view) {
    if (tr.getMeta('tx-layout')) return;
    if (tr.docChanged) {
      A.dirty = true;
      if (tr.before.attrs.styles !== tr.doc.attrs.styles || tr.before.attrs.settings !== tr.doc.attrs.settings) A.applyDocStyles();
      if (tr.before.attrs.parts !== tr.doc.attrs.parts || tr.before.attrs.notes !== tr.doc.attrs.notes) A.layout.clearCache();
      if (view.composing) { A._pendingLayout = true; } else A.relayout();
      clearTimeout(autoT); autoT = setTimeout(A.autosave, 1500);
      if (!tr.getMeta('tx-refresh-done') && fieldsNeedRefresh(tr)) setTimeout(() => A.refreshFields(), 0);
    } else if (tr.getMeta('tx-refresh')) A.relayout();
    clearTimeout(uiT); uiT = setTimeout(() => { A.renderTitle(); A.refreshUi && A.refreshUi(); A.updateStatus && A.updateStatus(); }, 60);
    if (tr.selectionSet || tr.docChanged) A.onSelection && A.onSelection();
  };
  function fieldsNeedRefresh() { return false; }
  /** Redessine les champs (numéros de page, renvois, tables des matières) */
  TX.refreshAll = function () { if (A.ed) { A.refreshFields(); A.relayout(true); } };
  A.refreshFields = function () { const v = A.ed.view; v.dispatch(v.state.tr.setMeta('tx-refresh', true).setMeta('addToHistory', false).setMeta('tx-layout', 1)); };
  // après une mise en page : les numéros de page affichés dans le texte (sommaire, renvois) ont pu changer
  let lastPagesSig = '';
  A.afterLayout = function () {
    const sig = A.layout.pages.map((p) => p.startPos + ':' + p.label).join(',');
    if (sig !== lastPagesSig) {
      lastPagesSig = sig;
      const doc = A.ed.view.state.doc; let need = false;
      doc.descendants((n) => { if (need) return false; if (n.type.name === 'toc' || (n.type.name === 'field' && /^(page|pages|ref|pageref|sectionpages)$/.test(n.attrs.f))) need = true; return !need; });
      // second passage dans une tâche à part : l'interface reste réactive avec un gros document
      if (need && !A._refreshing) { A._refreshing = true; setTimeout(() => { try { A.refreshFields(); A.layout.run(); } finally { A._refreshing = false; } A.updateStatus && A.updateStatus(); A.navRefresh && A.navRefresh(); }, 0); }
    }
    A.updateStatus && A.updateStatus(); A.renderComments && A.renderComments(); A.renderRuler && A.renderRuler(); A.navRefresh && A.navRefresh();
  };
  let saving = false;
  A.autosave = async function () {
    if (saving || !A.ed) return;
    if (A._pendingRecovery && !A.dirty) return;
    A._pendingRecovery = false; saving = true;
    try {
      const json = A.docJSON(), used = TX.media.used(json), media = {}; used.forEach((id) => { media[id] = TX.media.blobs[id]; });
      await F.autosave.put('courant', { json, info: TX.media.info, file: { name: A.file.name, kind: A.file.kind, recentId: A.file.recentId }, dirty: A.dirty, merge: A.merge && A.merge.data ? A.merge.data : null }, media);
    } catch (e) { console.warn('autosave', e); } finally { saving = false; }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && A.ed) A.autosave(); });
  window.addEventListener('pagehide', () => { if (A.ed) A.autosave(); });
  /** JSON complet du document (en-têtes / notes en cours de modification compris) */
  A.docJSON = function () {
    if (A.partEd && A.commitPart) A.commitPart(true);
    const j = A.ed.view.state.doc.toJSON();
    j.attrs = Object.assign({}, j.attrs, { props: Object.assign({}, j.attrs.props || {}, { modified: Date.now() }) });
    return j;
  };

  /* ---------------- ouvrir ---------------- */
  function progressToast(label) { let last = 0; return (i, n, done) => { if (done) { O.toast('Terminé', { ms: 600 }); return; } if (Date.now() - last < 300 && i < n) return; last = Date.now(); O.toast(label + (n ? ' ' + Math.min(n, i + 1) + '/' + n : ''), { ms: 4000 }); }; }
  A.progress = progressToast;
  async function openBlob(blob, name, ref, opt) {
    opt = opt || {};
    // barre de progression au-delà de 300 ms ; la lecture rend la main à l'interface régulièrement (O.yieldUi)
    const prog = O.progress('Ouverture de « ' + name + ' »', { doneToast: false });
    try {
      const r = await TX.IO.open(blob, name, prog);
      if (!opt.dirtyOk && A.dirty && !(await askSave())) { prog.end(); return false; }
      const writable = /^(magdoc|docx|odt|txt|md|html)$/.test(r.kind);
      prog.text('Mise en page de « ' + name + ' »…'); prog(0, 0); await new Promise((ok) => setTimeout(ok, 30));
      A.setDoc(r.json, r.media, { name: writable ? name : O.baseName(name) + '.magdoc', ref: writable ? ref || null : null, kind: writable ? r.kind : 'magdoc' }, { info: r.info });
      prog.end();
      if (!writable) A.dirty = true;
      await addRecent(blob, name, writable ? ref : null);
      A.closeBackstage();
      const msg = { docx: 'Document .docx ouvert. Ctrl+S réécrit le .docx ; « Enregistrer sous » propose aussi .magdoc (format complet).', odt: 'Document OpenDocument ouvert. Ctrl+S réécrit le .odt.', rtf: 'Document RTF importé : enregistrez-le en .magdoc ou .docx.', txt: 'Texte brut ouvert.', md: 'Markdown ouvert.', html: 'Page HTML ouverte.' }[r.kind];
      O.toast(msg || 'Document ouvert', { ms: msg ? 4500 : 1200 });
      if (r.warnings && r.warnings.length) setTimeout(() => O.toast(r.warnings.slice(0, 3).join(' · '), { bad: true, ms: 7000 }), 4600);
      return true;
    } catch (e) { prog.end(); (e && e.user ? console.warn : console.error)(e); O.alert('Ouverture impossible', '<p>« ' + O.esc(name) + ' » n\'a pas pu être ouvert.</p><p class="o-hint">' + O.esc(e.message || String(e)) + '</p>'); return false; }
  }
  A.openBlob = openBlob;
  C.open = async function () { const l = await F.open({ id: 'texte' }); if (!l.length) return; await openBlob(l[0].blob, l[0].name, l[0].ref); };
  async function askSave() {
    if (!A.dirty) return true;
    const v = await O.dialog({ title: 'Modifications non enregistrées', body: '<p>Enregistrer les modifications de « ' + O.esc(A.docName()) + ' » ?</p><p class="o-hint">Elles restent dans la récupération automatique tant que vous n\'ouvrez pas un autre document.</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Ne pas enregistrer', value: 'no' }, { label: 'Enregistrer', value: 'yes', primary: true }] });
    if (!v) return false; if (v === 'yes') return !!(await C.save()); return true;
  }
  A.askSave = askSave;
  C.newDoc = async function (tpl, opt) {
    if (A.dirty && !(await askSave())) return;
    const r = TX.Templates.build(tpl || 'vide', opt || {});
    A.setDoc(r.json, r.media || {}, {}, { info: r.info });
    A.closeBackstage(); A.autosave();
  };

  /* ---------------- enregistrer, exporter ---------------- */
  const KIND = TX.IO.KINDS;
  async function buildBlob(kind) {
    const json = A.docJSON();
    const r = await TX.IO.save(kind, json, { media: TX.media, layout: A.layout, name: A.docName(), progress: progressToast('Création du fichier…'), app: A });
    if (r.warn && r.warn.length) O.toast(r.warn.join(' ; '), { bad: true, ms: 6500 });
    return r.blob;
  }
  A.buildBlob = buildBlob;
  C.save = async function () {
    const kind = A.file.kind || 'magdoc';
    if (A.file.ref && F.canWrite(A.file.ref) && KIND[kind] && KIND[kind].write) {
      try { const b = await buildBlob(kind); await F.write(A.file.ref, b, A.file.name); A.dirty = false; A.renderTitle(); O.toast('Enregistré', { ms: 1200 }); await addRecent(b, A.file.name, A.file.ref); A.autosave(); return true; }
      catch (e) { if (e && e.code === 'perm') O.toast('Autorisation refusée : choisissez un emplacement', { bad: true }); else O.toast('Enregistrement impossible : ' + (e.message || e), { bad: true }); }
    }
    return C.saveAs(KIND[kind] && KIND[kind].write ? kind : 'magdoc');
  };
  C.saveAs = async function (kind) {
    kind = kind || 'magdoc'; const K = KIND[kind];
    const name = O.safeName(A.docName(), K.ext);
    try {
      const b = await buildBlob(kind);
      const r = await F.saveAs(b, name, { types: [K.type], mime: K.mime, id: 'texte' });
      if (!r.ok) { if (r.err) O.toast('Enregistrement impossible : ' + r.err, { bad: true }); return false; }
      A.file = { name: r.name || name, ref: r.ref, kind, recentId: A.file.recentId };
      A.dirty = false; A.renderTitle();
      O.toast(r.downloaded ? '« ' + (r.name || name) + ' » téléchargé' : 'Enregistré : ' + (r.name || name), { ms: 2200 });
      await addRecent(b, A.file.name, r.ref); A.autosave(); A.closeBackstage();
      return true;
    } catch (e) { console.error(e); O.toast('Enregistrement impossible : ' + (e.message || e), { bad: true }); return false; }
  };
  C.exportAs = async function (kind, opt) {
    const K = KIND[kind];
    try {
      let b;
      if (kind === 'pdf') b = await TX.Pdf.export(A, opt || {}, progressToast('Création du PDF…'));
      else b = await buildBlob(kind);
      const r = await F.export(b, O.safeName(A.docName(), K.ext), { types: [K.type], mime: K.mime });
      if (r && r.ok && kind === 'pdf') A.lastPdf = { blob: b, name: O.safeName(A.docName(), '.pdf') };
      return b;
    } catch (e) { console.error(e); O.toast('Export impossible : ' + (e.message || e), { bad: true }); return null; }
  };
  /** Ouvrir le PDF dans l'Atelier PDF (PC : boîte « inbox » partagée ; Android : appli Atelier PDF) */
  C.pdfToAtelier = async function () {
    const M = window.MAGPC; let w = null;
    if (M) { try { w = M.nativeOpen('about:blank'); } catch (e) { } }       // pendant le clic : sinon la fenêtre serait bloquée
    try {
      const b = await TX.Pdf.export(A, { outline: true }, progressToast('Création du PDF…')); const name = O.safeName(A.docName(), '.pdf');
      if (M) {
        await M.db.put('inbox', { id: M.uid('i'), to: 'fr.magformation13.pdf', name, blob: b, at: Date.now() });
        const u = new URL((M.conf && M.conf.apps && M.conf.apps['fr.magformation13.pdf']) || '../pdf/', location.href).href;
        if (w) w.location.href = u; else M.nativeOpen(u);
        O.toast('Ouverture dans l\'Atelier PDF…'); return;
      }
      if (O.isAndroid) { await F.share(b, name); O.toast('Choisissez « Atelier PDF » dans la liste'); return; }
      await F.export(b, name, { types: [KIND.pdf.type], mime: 'application/pdf' });
    } catch (e) { if (w) w.close(); O.toast('PDF impossible : ' + e.message, { bad: true }); }
  };
  C.print = async function (opt) {
    try {
      const b = await TX.Pdf.export(A, Object.assign({ print: true }, opt || {}), progressToast('Préparation de l\'impression…'));
      const name = O.safeName(A.docName(), '.pdf');
      const r = await F.printPdf(b, name);
      if (!r) { // navigateur simple : PDF dans un nouvel onglet
        const u = URL.createObjectURL(b); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 120000);
      }
    } catch (e) { console.error(e); O.toast('Impression impossible : ' + e.message, { bad: true }); }
  };
  C.share = async function (kind) {
    try {
      const b = kind === 'pdf' ? await TX.Pdf.export(A, {}, progressToast('Création du PDF…')) : await buildBlob(kind);
      await F.share(b, O.safeName(A.docName(), KIND[kind].ext));
    } catch (e) { O.toast('Partage impossible : ' + e.message, { bad: true }); }
  };

  /* ---------------- récents ---------------- */
  async function thumb() {
    try { return await TX.Pdf.thumb(A); } catch (e) { return ''; }
  }
  A.thumb = thumb;
  async function addRecent(blob, name, ref) {
    const th = await thumb();
    const pages = A.layout && A.layout.pages.length || 1;
    A.file.recentId = await F.recents.add({ name: name || A.file.name || A.docName() + '.magdoc', ref: ref || null, thumb: th, info: pages + ' page' + (pages > 1 ? 's' : '') + ' · ' + TX.stats(A.ed.view.state.doc).words + ' mots', blob: ref ? null : blob });
    await F.dedupeRecents(ref, name, A.file.recentId);
    socle(th);
  }
  async function openRecent(id) {
    const r = await F.recents.get(id); if (!r) return;
    try { const b = await F.read(r.ref, r.name); await openBlob(b, r.name, r.ref && r.ref.kind !== 'blob' ? r.ref : null); }
    catch (e) { O.dialog({ title: 'Fichier introuvable', body: '<p>« ' + O.esc(r.name) + ' » n\'est plus accessible (' + O.esc(e.message || '') + ').</p>', buttons: [{ label: 'Retirer de la liste', value: 'rm', bad: true }, { label: 'OK', value: null, primary: true }] }).then((v) => { if (v === 'rm') F.recents.remove(id).then(() => A.openBackstage(A.bsTab)); }); }
  }
  A.openRecent = openRecent;
  /* ---------------- tuile Socle (Android) ---------------- */
  function socle(th) {
    const M = window.MAGPrint; if (!M || !M.widgetPut || window.MAGPC) return;
    F.recents.list().then((l) => { try { M.widgetPut(JSON.stringify({ last: l[0] ? { id: l[0].id, title: O.baseName(l[0].name), info: l[0].info, thumb: ((t) => t.length < 60000 ? t : '')(th || l[0].thumb || ''), at: l[0].at } : null, count: l.length })); } catch (e) { } });
  }
  window.onSocle = function (json) {
    let a = {}; try { a = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { }
    if (a.open) openRecent(a.open); else if (a['new']) C.newDoc(a.tpl || 'vide'); else if (a.pick) C.open();
  };

  /* ---------------- coulisses « Fichier » ---------------- */
  A.bsTab = 'home';
  A.openBackstage = function (tab) {
    if (A.partEd) A.closePart(true);
    A.bsTab = tab || 'home';
    const bs = $('#backstage'); bs.classList.add('on');
    const tabs = [['back', 'arrow-left', 'Retour'], ['home', 'house', 'Accueil'], ['new', 'file-plus', 'Nouveau'], ['open', 'folder-open', 'Ouvrir'], ['-'], ['info', 'info', 'Informations'], ['save', 'save', 'Enregistrer'], ['saveas', 'save-all', 'Enregistrer sous'], ['export', 'file-output', 'Exporter'], ['print', 'printer', 'Imprimer'], ['share', 'share-2', 'Partager'], ['-'], ['options', 'settings', 'Options'], ['about', 'circle-help', 'À propos']];
    bs.innerHTML = '<nav class="bs-nav">' + tabs.map((t) => t[0] === '-' ? '<hr>' : '<button type="button" data-bs="' + t[0] + '" class="' + (t[0] === 'back' ? 'back' : '') + (t[0] === A.bsTab ? ' on' : '') + '">' + O.icon(t[1]) + t[2] + '</button>').join('') + '</nav><div style="flex:1;display:flex;flex-direction:column;min-width:0"><div class="bs-mtop"><button type="button" class="tbb" data-bs="menu" aria-label="Menu">' + O.icon('menu') + '</button><b style="flex:1">' + O.esc((tabs.find((t) => t[0] === A.bsTab) || [])[2] || '') + '</b><button type="button" class="tbb" data-bs="back" aria-label="Fermer">' + O.icon('x') + '</button></div><div class="bs-body"></div></div>';
    bs.onclick = (e) => {
      const b = e.target.closest('[data-bs]'); if (b) { const k = b.dataset.bs; if (k === 'back') { A.closeBackstage(); return; } if (k === 'menu') { bs.querySelector('.bs-nav').classList.toggle('open'); return; } if (k === 'save') { C.save(); return; } A.openBackstage(k); return; }
      const a = e.target.closest('[data-a]'); if (a) bsAction(a.dataset.a, a, e);
    };
    renderBs(bs.querySelector('.bs-body'));
  };
  A.closeBackstage = function () { const bs = $('#backstage'); if (!bs.classList.contains('on')) return; bs.classList.remove('on'); bs.innerHTML = ''; setTimeout(() => { A.layout.applyScale(); A.ed.view.focus(); }, 0); };
  function tplCard(t) { return '<button type="button" class="tpl" data-a="tpl:' + t.id + '"><div class="pv" data-pv="' + t.id + '"></div><b>' + O.esc(t.name) + '</b><small>' + O.esc(t.desc) + '</small></button>'; }
  async function recentsHtml(max) {
    const l = (await F.recents.list()).slice(0, max || 30);
    if (!l.length) return '<p class="o-hint">Aucun document récent.</p>';
    return '<div class="rec-list">' + l.map((r) => '<div class="rec" data-a="rec:' + r.id + '" role="button" tabindex="0">' + (r.thumb ? '<img src="' + r.thumb + '" alt="">' : '<span class="noimg"></span>') + '<span class="t"><b>' + O.esc(r.name) + '</b><small>' + O.esc(r.info || '') + ' · ' + O.ago(r.at) + (r.ref && r.ref.kind === 'blob' ? ' · copie dans l\'appli' : '') + '</small></span><button type="button" class="pin' + (r.pin ? ' on' : '') + '" data-a="pin:' + r.id + '" title="' + (r.pin ? 'Désépingler' : 'Épingler') + '">' + O.icon(r.pin ? 'pin' : 'pin-off') + '</button><button type="button" class="pin" data-a="rm:' + r.id + '" title="Retirer de la liste">' + O.icon('x') + '</button></div>').join('') + '</div>';
  }
  const FMT_CARDS = (pfx) => [['magdoc', 'file-check', 'Document Texte (.magdoc)', 'Format complet de l\'appli : tout est conservé. Recommandé.'], ['docx', 'file-text', 'Document Word (.docx)', 'Pour LibreOffice, Word, Google Docs, OnlyOffice.'], ['odt', 'file-type', 'OpenDocument (.odt)', 'Format ouvert de LibreOffice.'], ['pdf', 'file-badge', 'PDF', 'Pour lire et imprimer partout (signets des titres).'], ['html', 'globe', 'Page web (.html)', 'Une seule page, images comprises.'], ['md', 'hash', 'Markdown (.md)', 'Texte structuré (titres, listes, tableaux).'], ['txt', 'file', 'Texte brut (.txt)', 'Sans mise en forme.']].filter((x) => pfx !== 'saveas' || x[0] !== 'pdf').map((x) => '<button type="button" class="bs-card" data-a="' + pfx + ':' + x[0] + '">' + O.icon(x[1]) + '<span><b>' + x[2] + '</b>' + x[3] + '</span></button>').join('');
  async function renderBs(body) {
    const tab = A.bsTab; let h = '';
    if (tab === 'home') {
      const rec = await F.autosave.get('courant').catch(() => null);
      if (rec && rec.data && rec.data.dirty && A._pendingRecovery) h += '<div class="recov" style="border-radius:10px;margin-bottom:14px;display:flex;gap:10px;align-items:center;padding:8px 14px;background:#FFF3BF;color:#5c4400;font-weight:600">' + O.icon('life-buoy') + '<span style="flex:1">Un document non enregistré (« ' + O.esc(((rec.data.json.attrs || {}).props || {}).title || O.baseName(rec.data.file && rec.data.file.name) || 'sans titre') + ' », ' + O.ago(rec.at) + ') peut être récupéré.</span><button type="button" class="o-btn pri" data-a="recover">Récupérer</button><button type="button" class="o-btn" data-a="norecover">Ignorer</button></div>';
      h += '<h2>Bonjour</h2><h3>Nouveau</h3><div class="tpl-grid">' + TX.Templates.list.slice(0, 7).map(tplCard).join('') + '</div><p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button type="button" class="mini-btn" data-a="more">' + O.icon('layout-grid') + 'Plus de modèles</button><button type="button" class="mini-btn" data-a="open">' + O.icon('folder-open') + 'Ouvrir un fichier (.docx, .magdoc, .odt…)</button></p><h3>Récents</h3>' + await recentsHtml(12);
    } else if (tab === 'new') h = '<h2>Nouveau</h2><div class="tpl-grid">' + TX.Templates.list.map(tplCard).join('') + '</div>';
    else if (tab === 'open') h = '<h2>Ouvrir</h2><div class="bs-cards"><button type="button" class="bs-card" data-a="open">' + O.icon('folder-open') + '<span><b>Parcourir…</b>Documents .docx, .magdoc, .odt, .rtf, .txt, .md, .html' + (O.isPC ? '. Vous pouvez aussi glisser un fichier sur la fenêtre ou utiliser « Ouvrir avec » dans l\'Explorateur.' : '') + '</span></button><button type="button" class="bs-card" data-a="insertfile">' + O.icon('file-input') + '<span><b>Insérer le texte d\'un fichier</b>À l\'emplacement du curseur</span></button></div><h3>Récents</h3>' + await recentsHtml();
    else if (tab === 'info') {
      const d = A.attrs(), p = d.props || {}, s = TX.stats(A.ed.view.state.doc), a11y = A.a11yIssues ? A.a11yIssues() : [];
      const revs = TX.revisions(A.ed.view.state.doc).length, cms = Object.keys(d.comments || {}).length;
      h = '<h2>Informations</h2><dl class="bs-props"><dt>Titre</dt><dd><input class="o-in" data-prop="title" value="' + O.esc(p.title || '') + '" placeholder="Titre du document"></dd><dt>Auteur</dt><dd><input class="o-in" data-prop="author" value="' + O.esc(p.author || '') + '"></dd><dt>Objet</dt><dd><input class="o-in" data-prop="subject" value="' + O.esc(p.subject || '') + '"></dd><dt>Mots-clés</dt><dd><input class="o-in" data-prop="keywords" value="' + O.esc(p.keywords || '') + '"></dd><dt>Fichier</dt><dd>' + O.esc(A.file.name || 'non enregistré') + (A.file.kind ? ' (' + A.file.kind + ')' : '') + '</dd><dt>Pages</dt><dd>' + (A.layout.pages.length || 1) + '</dd><dt>Mots</dt><dd>' + s.words.toLocaleString('fr-FR') + '</dd><dt>Caractères</dt><dd>' + s.chars.toLocaleString('fr-FR') + ' (' + s.charsNoSpace.toLocaleString('fr-FR') + ' sans espaces)</dd><dt>Paragraphes</dt><dd>' + s.paras + '</dd><dt>Créé</dt><dd>' + O.fmtDate(p.created, true) + '</dd><dt>Modifié</dt><dd>' + O.fmtDate(p.modified, true) + '</dd></dl>' +
        '<h3>Inspecter le document</h3><p>' + (revs ? revs + ' révision(s) non acceptée(s). ' : 'Aucune révision. ') + (cms ? cms + ' commentaire(s). ' : 'Aucun commentaire. ') + '<button type="button" class="mini-btn" data-a="inspect">' + O.icon('scan-search') + 'Supprimer commentaires et révisions…</button></p>' +
        '<h3>Accessibilité</h3><p>' + (a11y.length ? a11y.length + ' point(s) à vérifier. <button type="button" class="mini-btn" data-a="a11y">' + O.icon('accessibility') + 'Vérifier</button>' : O.icon('circle-check') + ' Aucun problème détecté.') + '</p><h3>Confidentialité</h3><p class="o-hint">Tout reste sur cet appareil : le document et ses images ne sont jamais envoyés sur internet.</p>';
    } else if (tab === 'saveas') h = '<h2>Enregistrer sous</h2><div class="bs-cards">' + FMT_CARDS('saveas') + '</div>';
    else if (tab === 'export') h = '<h2>Exporter</h2><h3>PDF</h3><div class="o-form" style="max-width:640px"><label class="o-check"><input type="checkbox" id="pdfMarks" checked><span>Signets à partir des titres</span></label><label class="o-check"><input type="checkbox" id="pdfCmts"><span>Inclure les commentaires (page finale)</span></label><label class="o-check"><input type="checkbox" id="pdfMarkup"><span>Montrer les révisions (sinon : version finale)</span></label></div><p style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="o-btn pri" data-a="pdf">' + O.icon('file-badge') + 'Exporter en PDF</button><button type="button" class="o-btn" data-a="atelier">' + O.icon('square-arrow-out-up-right') + 'Ouvrir le PDF dans l\'Atelier PDF</button></p><h3>Autres formats</h3><div class="bs-cards">' + FMT_CARDS('exp') + '</div>';
    else if (tab === 'print') h = '<h2>Imprimer</h2><div class="o-form" style="max-width:640px"><label class="o-field half"><span>Pages</span><input class="o-in" id="prPages" placeholder="Toutes (ou 1-3, 5)"></label><label class="o-check"><input type="checkbox" id="prMarkup"><span>Imprimer les révisions et commentaires</span></label></div><p><button type="button" class="o-btn pri" data-a="print">' + O.icon('printer') + 'Imprimer</button></p><p class="o-hint">Le document est d\'abord converti en PDF (mise en page identique à l\'écran). Astuce : choisissez « Enregistrer au format PDF » comme imprimante pour obtenir un fichier.</p>';
    else if (tab === 'share') h = '<h2>Partager</h2><div class="bs-cards"><button type="button" class="bs-card" data-a="share:docx">' + O.icon('file-text') + '<span><b>Document Word</b>.docx</span></button><button type="button" class="bs-card" data-a="share:pdf">' + O.icon('file-badge') + '<span><b>PDF</b>Pour lecture et impression</span></button><button type="button" class="bs-card" data-a="share:magdoc">' + O.icon('file-check') + '<span><b>Document Texte</b>.magdoc, pour une autre appli Texte</span></button><button type="button" class="bs-card" data-a="share:odt">' + O.icon('file-type') + '<span><b>OpenDocument</b>.odt</span></button></div>';
    else if (tab === 'options') h = '<h2>Options</h2><div class="o-form" style="max-width:560px"><label class="o-field"><span>Votre nom (commentaires, révisions, auteur des nouveaux documents)</span><input class="o-in" data-opt="auteur" value="' + O.esc(TX.userName()) + '"></label><label class="o-field half"><span>Apparence</span><select class="o-in" data-opt="ui"><option value="">Comme le système</option><option value="clair"' + (A.settings.ui === 'clair' ? ' selected' : '') + '>Claire</option><option value="sombre"' + (A.settings.ui === 'sombre' ? ' selected' : '') + '>Sombre</option></select></label><label class="o-check"><input type="checkbox" data-opt="spell"' + (A.settings.spell !== false ? ' checked' : '') + '><span>Vérifier l\'orthographe pendant la saisie (correcteur du navigateur, français)</span></label><label class="o-check"><input type="checkbox" data-opt="auto"' + (A.settings.auto !== false ? ' checked' : '') + '><span>Correction automatique (guillemets « », espaces insécables, listes, tirets…)</span></label></div><h3>Récupération</h3><p><button type="button" class="mini-btn" data-a="clearrec">' + O.icon('trash-2') + 'Vider la liste des récents</button></p>';
    else if (tab === 'about') h = aboutHtml();
    body.innerHTML = h;
    // Suite MAG sur PC : version (jour de publication) et « Rechercher une mise à jour »
    if (tab === 'about' && window.MAGPC && window.MAGPC.aboutBlock) { const h2 = body.querySelector('h2'); if (h2) h2.insertAdjacentElement('afterend', window.MAGPC.aboutBlock()); }
    fillPreviews(body);
    O.$$('[data-prop]', body).forEach((i) => i.addEventListener('change', () => { const p = Object.assign({}, A.attrs().props, { [i.dataset.prop]: i.value }); A.setAttr('props', p, 'Propriétés'); A.renderTitle(); }));
    O.$$('[data-opt]', body).forEach((i) => i.addEventListener('change', () => {
      const k = i.dataset.opt;
      if (k === 'auteur') { try { localStorage.setItem('texte:auteur', i.value.trim()); } catch (e) { } }
      else if (k === 'ui') { A.settings.ui = i.value; A.saveSettings(); A.applyUi(); }
      else { A.settings[k] = i.checked; A.saveSettings(); A.applyUi(); }
    }));
    O.$$('.rec', body).forEach((r) => r.addEventListener('keydown', (e) => { if (e.key === 'Enter') r.click(); }));
  }
  function fillPreviews(root) { O.$$('[data-pv]', root).forEach((pv) => TX.Templates.preview(pv, pv.dataset.pv)); }
  async function bsAction(a, el, ev) {
    const [k, v] = a.split(':');
    if (k === 'tpl') { C.newDoc(v); return; }
    if (k === 'more') { A.openBackstage('new'); return; }
    if (k === 'open') { C.open(); return; }
    if (k === 'insertfile') { A.closeBackstage(); C.insertFile(); return; }
    if (k === 'rec') { if (ev.target.closest('.pin')) return; openRecent(v); return; }
    if (k === 'pin') { const r = await F.recents.get(v); await F.recents.pin(v, !(r && r.pin)); A.openBackstage(A.bsTab); return; }
    if (k === 'rm') { await F.recents.remove(v); A.openBackstage(A.bsTab); return; }
    if (k === 'saveas') { C.saveAs(v); return; }
    if (k === 'exp') { if (v === 'pdf') C.exportAs('pdf', { outline: true }); else C.exportAs(v); return; }
    if (k === 'pdf') { C.exportAs('pdf', { outline: $('#pdfMarks').checked, comments: $('#pdfCmts').checked, markup: $('#pdfMarkup').checked }); return; }
    if (k === 'atelier') { C.pdfToAtelier(); return; }
    if (k === 'print') { C.print({ pages: $('#prPages').value, markup: $('#prMarkup').checked }); return; }
    if (k === 'share') { C.share(v); return; }
    if (k === 'a11y') { A.closeBackstage(); A.openPane('a11y'); return; }
    if (k === 'inspect') { A.closeBackstage(); C.inspect && C.inspect(); return; }
    if (k === 'clearrec') { await F.recents.clear(); O.toast('Liste vidée (les épinglés restent)'); return; }
    if (k === 'recover') { A._pendingRecovery = false; await recover(); return; }
    if (k === 'norecover') { A._pendingRecovery = false; const r = await F.autosave.get('courant'); if (r) { r.data.dirty = false; await F.autosave.put('courant', r.data, r.media); } A.openBackstage('home'); return; }
  }
  async function recover() {
    const r = await F.autosave.get('courant'); if (!r) return;
    A.setDoc(TX.IO.upgrade(r.data.json), r.media, r.data.file ? { name: r.data.file.name, kind: r.data.file.kind, recentId: r.data.file.recentId, ref: null } : {}, { info: r.data.info, merge: r.data.merge ? { data: r.data.merge, preview: null } : null });
    A.dirty = true; A.renderTitle();
    A.closeBackstage(); O.toast('Document récupéré. Pensez à l\'enregistrer (Ctrl+S).', { ms: 4000 });
  }
  function aboutHtml() {
    const lic = [['ProseMirror 1.x', 'MIT', 'Marijn Haverbeke — moteur d\'édition (modèle, vue, tableaux, historique)', 'prosemirror-MIT.txt'], ['JSZip 3.10.1', 'MIT (ou GPLv3, au choix ; utilisé sous MIT)', 'archives .docx, .odt et .magdoc (le XML Office et OpenDocument est écrit et lu par Texte)', 'jszip-MIT-ou-GPLv3.md'], ['jsPDF 2.5.1', 'MIT', 'export PDF', 'jspdf-MIT.txt'], ['KaTeX 0.16.47', 'MIT', 'Khan Academy — équations', 'katex-MIT.txt'], ['Lucide 1.64.0', 'ISC', 'icônes', 'lucide-ISC.txt'], ['Polices Mag Sans, Mag Serif, Mag Mono (Liberation 2.1.5), Mag Sans Douce (Carlito), Caladea', 'SIL OFL 1.1', 'polices équivalentes à Arial, Times New Roman, Courier New, Calibri et Cambria (versions réduites et renommées)', 'fonts-OFL-1.1.txt']];
    return '<h2>À propos</h2><p><b>Texte</b> · Suite MAG · version ' + A.VERSION + '</p><p class="o-hint" style="max-width:720px">Traitement de texte hors ligne : rien n\'est envoyé sur internet. Formats : .magdoc (natif, ouvert : zip contenant document.json et les images), .docx et .odt (ouverture et enregistrement), .rtf (ouverture), .txt, .md, .html, export PDF.</p><h3>Bibliothèques libres utilisées</h3><table class="kbd-tbl" style="max-width:760px">' + lic.map((l) => '<tr><td><b>' + l[0] + '</b><br><small class="o-hint">' + l[2] + '</small></td><td>' + l[1] + '</td></tr>').join('') + '</table><p class="o-hint">Les textes complets des licences sont fournis avec l\'appli (dossier <code>LICENSES</code>). Word, Office et Microsoft sont des marques de leurs propriétaires ; Texte est une appli indépendante.</p><p><button type="button" class="mini-btn" onclick="TexteApp.cmd.shortcuts()">' + O.icon('keyboard') + 'Raccourcis clavier</button></p>';
  }
  /** Insérer le contenu d'un autre fichier à la position du curseur */
  C.insertFile = async function () {
    const l = await F.open({ id: 'texte' }); if (!l.length) return;
    try {
      const r = await TX.IO.open(l[0].blob, l[0].name);
      Object.assign(TX.media.blobs, r.media || {}); Object.assign(TX.media.info, r.info || {});
      const doc = TX.schema.nodeFromJSON(r.json); const frag = []; doc.forEach((sec) => sec.forEach((b) => frag.push(b)));
      const v = A.ed.view; v.dispatch(v.state.tr.replaceSelection(new PM.model.Slice(PM.model.Fragment.fromArray(frag), 0, 0)).setMeta('tx-label', 'Insérer un fichier'));
      O.toast('Contenu de « ' + l[0].name + ' » inséré');
    } catch (e) { O.toast('Insertion impossible : ' + e.message, { bad: true }); }
  };

  /* ---------------- raccourcis clavier (aide) ---------------- */
  C.shortcuts = function () {
    const rows = [['Fichier', ''], ['Nouveau / Ouvrir', 'Ctrl+N / Ctrl+O'], ['Enregistrer / Enregistrer sous', 'Ctrl+S / F12'], ['Imprimer', 'Ctrl+P'], ['Édition', ''], ['Annuler / Rétablir', 'Ctrl+Z / Ctrl+Y'], ['Couper, copier, coller', 'Ctrl+X, Ctrl+C, Ctrl+V'], ['Coller le texte seul', 'Ctrl+Maj+V'], ['Tout sélectionner', 'Ctrl+A'], ['Rechercher / Remplacer / Atteindre', 'Ctrl+F / Ctrl+H / Ctrl+G'], ['Reproduire la mise en forme', 'Ctrl+Maj+C puis Ctrl+Maj+V'], ['Caractères', ''], ['Gras, italique, souligné', 'Ctrl+B, Ctrl+I, Ctrl+U'], ['Indice / exposant', 'Ctrl+= / Ctrl+Maj++'], ['Agrandir / réduire la police', 'Ctrl+Maj+> / Ctrl+Maj+<'], ['Effacer la mise en forme des caractères', 'Ctrl+Espace'], ['Casse (cycle)', 'Maj+F3'], ['Espace insécable / tiret insécable', 'Ctrl+Maj+Espace / Ctrl+Maj+-'], ['Paragraphes', ''], ['Aligner à gauche, centrer, à droite, justifier', 'Ctrl+L, Ctrl+E, Ctrl+R, Ctrl+J'], ['Interligne 1 / 1,5 / 2', 'Ctrl+1 / Ctrl+5 / Ctrl+2'], ['Titre 1 / 2 / 3, Normal', 'Ctrl+Alt+1 / 2 / 3, Ctrl+Maj+N'], ['Puces', 'Ctrl+Maj+L'], ['Retrait / niveau de liste', 'Tab / Maj+Tab, Ctrl+M / Ctrl+Maj+M'], ['Effacer la mise en forme du paragraphe', 'Ctrl+Q'], ['Saut de ligne / de page / de colonne', 'Maj+Entrée / Ctrl+Entrée / Ctrl+Maj+Entrée'], ['Insertion', ''], ['Lien hypertexte', 'Ctrl+K'], ['Note de bas de page / de fin', 'Ctrl+Alt+F / Ctrl+Alt+D'], ['Commentaire', 'Ctrl+Alt+M'], ['Date / numéro de page', 'Alt+Maj+D / Alt+Maj+P'], ['Équation', 'Alt+='], ['Révision', ''], ['Suivi des modifications', 'Ctrl+Maj+E'], ['Statistiques', 'Ctrl+Maj+G'], ['Lecture à voix haute', 'Ctrl+Alt+Espace'], ['Affichage', ''], ['Zoom', 'Ctrl+molette, Ctrl+plus / moins, Ctrl+0'], ['Marques de mise en forme ¶', 'Ctrl+*'], ['Rechercher une commande', 'Alt+Q'], ['Réduire le ruban', 'Ctrl+F1']];
    O.dialog({ title: 'Raccourcis clavier', wide: true, body: '<table class="kbd-tbl">' + rows.map((r) => r[1] ? '<tr><td>' + O.esc(r[0]) + '</td><td>' + r[1].split(/(, | \/ )/).map((x) => /^(, | \/ )$/.test(x) ? x : '<kbd>' + O.esc(x) + '</kbd>').join('') + '</td></tr>' : '<tr><td colspan="2"><b>' + O.esc(r[0]) + '</b></td></tr>').join('') + '</table>' });
  };

  /* ---------------- « Ouvrir avec », dépôt ---------------- */
  const OPEN_RE = /\.(magdoc|docx|docm|dotx|odt|ott|rtf|txt|text|md|markdown|html?|xhtml)$/i;
  function dropInit() {
    if (O.isPC) return;
    const hint = $('#dropHint');
    window.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0 && !e.target.closest('.tx-pm')) { e.preventDefault(); hint.classList.add('on'); } });
    window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) hint.classList.remove('on'); });
    window.addEventListener('drop', (e) => { hint.classList.remove('on'); const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find((x) => OPEN_RE.test(x.name)); if (!f) return; e.preventDefault(); openBlob(f, f.name, null); });
  }
  function launchFiles(l) {
    const f = l.find((x) => OPEN_RE.test(x.name));
    const imgs = l.filter((x) => /^image\//.test(x.blob.type || O.mimeOf(x.name)));
    if (f) { openBlob(f.blob, f.name, f.ref); return; }
    if (imgs.length && A.ed) { A.closeBackstage(); imgs.forEach((m) => C.insertImageFile && C.insertImageFile(m.blob instanceof File ? m.blob : new File([m.blob], m.name, { type: m.blob.type }))); }
  }

  /* ---------------- démarrage ---------------- */
  async function boot() {
    A.applyUi();
    A.newEditor(TX.emptyDoc());
    A.layout = TX.Layout(A.ed, { scroll: $('#docScroll'), sizer: $('#sizer'), paper: $('#paper'), under: $('#paper .tx-under'), over: $('#paper .tx-over'), body: $('#docBody') }, { editor: () => A.ed, attrs: () => A.attrs(), ctx: A.ctx, onZoom: (z) => A.onZoom && A.onZoom(z), onPages: () => { } });
    A.mountUi();
    dropInit();
    const rec = await F.autosave.get('courant').catch(() => null);
    if (rec && rec.data && rec.data.json && !rec.data.dirty) {
      // reprise silencieuse du dernier document (enregistré) : comme une appli qu'on rouvre
      try {
        A.setDoc(TX.IO.upgrade(rec.data.json), rec.media, rec.data.file ? { name: rec.data.file.name, kind: rec.data.file.kind, recentId: rec.data.file.recentId, ref: null } : {}, { info: rec.data.info, merge: rec.data.merge ? { data: rec.data.merge, preview: null } : null });
        if (rec.data.file && rec.data.file.recentId) { const r = await F.recents.get(rec.data.file.recentId); if (r && r.ref && r.ref.kind !== 'blob') A.file.ref = r.ref; }
      } catch (e) { console.warn(e); A.setDoc(TX.emptyDoc(), {}, {}); }
    } else A.setDoc(TX.emptyDoc(), {}, {});
    F.onLaunch(launchFiles);
    if (rec && rec.data && rec.data.dirty) { A._pendingRecovery = true; A.openBackstage('home'); }
    else if (!rec) A.openBackstage('home');
    setTimeout(() => { try { const M = window.MAGPrint; if (M && M.takeSocle && !window.MAGPC) { const x = M.takeSocle(); if (x) window.onSocle(x); } } catch (e) { } socle(''); }, 400);
    window.addEventListener('resize', O.debounce(() => { if (A.layout.fit || A.settings.view !== 'page') A.relayout(); else A.layout.applyScale(); A.renderRuler && A.renderRuler(); }, 150));
    document.documentElement.classList.add('ready');
    A.booted = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
