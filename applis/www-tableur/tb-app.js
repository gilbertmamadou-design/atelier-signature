/* Tableur — démarrage, classeur courant, enregistrement automatique et récupération, fichiers (ouvrir, enregistrer sur
   place ou sous, exporter, imprimer, partager), récents, coulisses « Fichier », « Ouvrir avec », dépôt, tuile Socle. */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur, F = O.Files;
  const A = window.TableurApp = window.TableurApp || {};
  const C = A.cmd = A.cmd || {};
  const D = A.dialogs = A.dialogs || {};
  const $ = (s) => document.querySelector(s);
  A.VERSION = '1.0';
  A.file = { name: '', ref: null, kind: null, recentId: null };

  /* ---------------- réglages ---------------- */
  const SK = 'tableur:reglages';
  A.settings = (() => { try { return Object.assign({ sep: 'fr', fn: 'fr', ui: '', agg: ['avg', 'count', 'sum'], autoLink: true, autoComplete: true, breaks: false, fbar: true }, JSON.parse(localStorage.getItem(SK) || '{}')); } catch (e) { return { sep: 'fr', fn: 'fr' }; } })();
  A.saveSettings = () => { try { localStorage.setItem(SK, JSON.stringify(A.settings)); } catch (e) { } };
  TB.setLocale({ sep: A.settings.sep, fn: A.settings.fn });

  /* ---------------- formats de fichiers ---------------- */
  const T = (d, mime, ext) => ({ description: d, accept: { [mime]: ext } });
  A.KINDS = {
    magcalc: { ext: '.magcalc', mime: 'application/x-magcalc', type: T('Classeur Tableur', 'application/x-magcalc', ['.magcalc']), write: true },
    xlsx: { ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', type: T('Classeur Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['.xlsx']), write: true },
    ods: { ext: '.ods', mime: 'application/vnd.oasis.opendocument.spreadsheet', type: T('Classeur OpenDocument', 'application/vnd.oasis.opendocument.spreadsheet', ['.ods']), write: true },
    csv: { ext: '.csv', mime: 'text/csv', type: T('Texte CSV (point-virgule)', 'text/csv', ['.csv']), write: true, sheet: true },
    tsv: { ext: '.tsv', mime: 'text/tab-separated-values', type: T('Texte tabulé', 'text/tab-separated-values', ['.tsv', '.txt']), write: true, sheet: true },
    html: { ext: '.html', mime: 'text/html', type: T('Page web', 'text/html', ['.html']), write: false },
    pdf: { ext: '.pdf', mime: 'application/pdf', type: T('Document PDF', 'application/pdf', ['.pdf']), write: false },
    xls: { ext: '.xls', mime: 'application/vnd.ms-excel', type: T('Classeur Excel 97-2003', 'application/vnd.ms-excel', ['.xls']), write: false }
  };
  const OPEN_TYPES = [{ description: 'Classeurs (.xlsx, .magcalc, .ods, .xls, .csv)', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'], 'application/x-magcalc': ['.magcalc'], 'application/vnd.oasis.opendocument.spreadsheet': ['.ods'], 'application/vnd.ms-excel': ['.xls'], 'text/csv': ['.csv'], 'text/tab-separated-values': ['.tsv', '.txt'] } }];
  F.configure({ app: 'tableur', name: 'Tableur', types: OPEN_TYPES });
  A.OPEN_RE = /\.(magcalc|xlsx|xlsm|xltx|ods|ots|xls|csv|tsv|txt|prn)$/i;

  /* ---------------- classeur courant ---------------- */
  A.docName = () => O.baseName(A.file.name) || (A.wb && A.wb.props.title) || 'Classeur sans titre';
  A.setWorkbook = function (wb, file, opt) {
    opt = opt || {};
    if (A.grid && A.grid.edit) A.grid.cancelEdit();
    A.forgetMedia && A.forgetMedia();
    A.wb = wb; A.selObj = null; A.clip = null; A.painter = null;
    wb.on((ev) => { A.dirty = true; A.afterModelChange(ev); });
    A.file = Object.assign({ name: '', ref: null, kind: null, recentId: null }, file || {});
    A.dirty = !!opt.dirty;
    TB.CF && (TB.CF.invalidate && wb.sheets.forEach((s) => TB.CF.invalidate(s)));
    TB.clearFmtCache(); TB.clearWidthCache();
    A.grid.sheetChanged(); A.grid.ver++;
    A.renderTabs(); A.refreshUi(); A.onSelect(); A.renderTitle();
    A.grid.focus();
  };
  /** après toute modification du modèle (transaction, annuler, rétablir) */
  A.afterModelChange = function (ev) {
    const s = A.wb.cur;
    if (A.wb.active >= A.wb.sheets.length) A.wb.active = A.wb.sheets.length - 1;
    if (s.hidden) { const v = A.wb.sheets.find((x) => !x.hidden); if (v) A.wb.active = A.wb.sheets.indexOf(v); }
    if (A.selObj && !A.wb.cur.objs.some((o) => o.id === A.selObj.id)) A.selObj = null;
    else if (A.selObj) A.selObj = A.wb.cur.objs.find((o) => o.id === A.selObj.id);
    // hauteur automatique des lignes qui contiennent du texte renvoyé à la ligne
    if (ev && ev.n < 2000 && A.autoHeightRows) { const g = A.grid.range(); A.autoHeightRows(s, Math.max(0, g.r1 - 1), Math.min(g.r2 + 1, g.r1 + 300)); }
    A.grid.invalidate();
    clearTimeout(A._autoT); A._autoT = setTimeout(A.autosave, 1500);
    A.renderTitle(); A.refreshUi(); A.onSelect(); A.updateStatus();
    if (ev && (ev.kind === 'undo' || ev.kind === 'redo')) A.renderTabs();
    if (A.paneRefresh) A.paneRefresh();
  };
  A.changed = function () { A.grid.invalidate(); A.renderTabs(); A.refreshUi(); A.onSelect(); A.renderTitle(); A.updateStatus(); };

  /* ---------------- enregistrement automatique ---------------- */
  let saving = false;
  A.autosave = async function () {
    if (saving || !A.wb) return;
    if (A._pendingRecovery && !A.dirty) return;
    saving = true;
    try {
      // très gros classeurs : pas de copie automatique (trop lente) au-delà de 3 millions de cellules
      let cells = 0; A.wb.sheets.forEach((s) => { const e = s.extent(); cells += (e.r + 1) * (e.c + 1); });
      if (cells > 3e6) return;
      const json = TB.IOJ.toJson(A.wb); const media = {}; json.media.forEach((id) => { media[id] = A.wb.media[id]; });
      await F.autosave.put('courant', { json, file: { name: A.file.name, kind: A.file.kind, recentId: A.file.recentId }, dirty: A.dirty }, media);
    } catch (e) { console.warn('autosave', e); } finally { saving = false; }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden && A.wb) A.autosave(); });
  window.addEventListener('pagehide', () => { if (A.wb) A.autosave(); });

  /* ---------------- ouvrir ---------------- */
  function progress(label) { let last = 0; return (i, n) => { if (Date.now() - last < 300) return; last = Date.now(); O.toast(label + (n ? ' ' + Math.min(100, Math.round(i / n * 100)) + ' %' : '…'), { ms: 3000 }); }; }
  A.progress = progress;
  async function openBlob(blob, name, ref, opt) {
    opt = opt || {};
    try {
      if (!opt.dirtyOk && A.dirty && !(await askSave())) return false;
      O.toast('Ouverture de « ' + name + ' »…', { ms: 8000 });
      const r = await TB.IO.open(blob, name, { progress: progress('Lecture'), wizard: !opt.noWizard });
      if (!r) return false;
      const writable = /^(magcalc|xlsx|ods|csv|tsv)$/.test(r.kind);
      A.setWorkbook(r.wb, { name: writable ? name : O.baseName(name) + '.xlsx', ref: writable ? ref || null : null, kind: writable ? r.kind : 'xlsx' }, { dirty: !writable });
      await addRecent(blob, name, writable ? ref : null);
      A.closeBackstage();
      const msg = { xlsx: 'Classeur .xlsx ouvert. Ctrl+S réécrit le .xlsx ; « Enregistrer sous » propose aussi .magcalc (format complet).', ods: 'Classeur OpenDocument ouvert. Ctrl+S réécrit le .ods.', xls: 'Ancien format .xls importé (lecture seule) : enregistrez en .xlsx ou .magcalc.', csv: 'Fichier CSV ouvert (une feuille). Ctrl+S réécrit le CSV ; les mises en forme demandent .xlsx ou .magcalc.', tsv: 'Fichier texte ouvert.' }[r.kind];
      O.toast(msg || 'Classeur ouvert', { ms: msg ? 4500 : 1200 });
      if (r.warnings && r.warnings.length) setTimeout(() => O.toast(r.warnings.slice(0, 3).join(' · '), { bad: true, ms: 7000 }), 4600);
      return true;
    } catch (e) { console.error(e); O.alert('Ouverture impossible', '<p>« ' + O.esc(name) + ' » n\'a pas pu être ouvert.</p><p class="o-hint">' + O.esc(e.message || String(e)) + '</p>'); return false; }
  }
  A.openBlob = openBlob;
  C.open = async function () { const l = await F.open({ id: 'tableur' }); if (!l.length) return; await openBlob(l[0].blob, l[0].name, l[0].ref); };
  async function askSave() {
    if (!A.dirty) return true;
    const v = await O.dialog({ title: 'Modifications non enregistrées', body: '<p>Enregistrer les modifications de « ' + O.esc(A.docName()) + ' » ?</p><p class="o-hint">Elles restent dans la récupération automatique tant que vous n\'ouvrez pas un autre classeur.</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Ne pas enregistrer', value: 'no' }, { label: 'Enregistrer', value: 'yes', primary: true }] });
    if (!v) return false; if (v === 'yes') return !!(await C.save()); return true;
  }
  A.askSave = askSave;
  C.newBook = async function (tpl) {
    if (A.dirty && !(await askSave())) return;
    const wb = TB.Templates.build(tpl || 'vide');
    A.setWorkbook(wb, {}); A.closeBackstage(); A.autosave();
  };
  A.importCsv = async function () { const l = await F.pickMedia('.csv,.txt,.tsv,.prn,text/csv,text/plain', false); if (!l.length) return; const r = await TB.IO.csvWizard(l[0], l[0].name, { into: true }); if (r && D.afterCsvInto) D.afterCsvInto(r); };

  /* ---------------- enregistrer, exporter ---------------- */
  async function buildBlob(kind) {
    if (A.grid.edit) A.grid.commitEdit(null);
    const r = await TB.IO.save(kind, A.wb, { name: A.docName(), progress: progress('Création du fichier'), sheet: A.wb.cur, thumb: await thumb() });
    if (r.warn && r.warn.length) O.toast(r.warn.join(' ; '), { bad: true, ms: 6500 });
    return r.blob;
  }
  A.buildBlob = buildBlob;
  C.save = async function () {
    const kind = A.file.kind || 'magcalc';
    if (A.file.ref && F.canWrite(A.file.ref) && A.KINDS[kind] && A.KINDS[kind].write) {
      if ((kind === 'csv' || kind === 'tsv') && A.wb.sheets.length > 1 && !A._csvWarned) { A._csvWarned = true; O.toast('CSV : seule la feuille active est enregistrée', { ms: 3000 }); }
      try { const b = await buildBlob(kind); await F.write(A.file.ref, b, A.file.name); A.dirty = false; A.renderTitle(); O.toast('Enregistré', { ms: 1200 }); await addRecent(b, A.file.name, A.file.ref); A.autosave(); return true; }
      catch (e) { if (e && e.code === 'perm') O.toast('Autorisation refusée : choisissez un emplacement', { bad: true }); else O.toast('Enregistrement impossible : ' + (e.message || e), { bad: true }); }
    }
    return C.saveAs(A.KINDS[kind] && A.KINDS[kind].write ? kind : 'magcalc');
  };
  C.saveAs = async function (kind) {
    kind = kind || 'magcalc'; const K = A.KINDS[kind];
    const name = O.safeName(A.docName(), K.ext);
    try {
      const b = await buildBlob(kind);
      const r = await F.saveAs(b, name, { types: [K.type], mime: K.mime, id: 'tableur' });
      if (!r.ok) { if (r.err) O.toast('Enregistrement impossible : ' + r.err, { bad: true }); return false; }
      A.file = { name: r.name || name, ref: r.ref, kind, recentId: A.file.recentId };
      A.dirty = false; A.renderTitle();
      O.toast(r.downloaded ? '« ' + (r.name || name) + ' » téléchargé' : 'Enregistré : ' + (r.name || name), { ms: 2200 });
      await addRecent(b, A.file.name, r.ref); A.autosave(); A.closeBackstage();
      return true;
    } catch (e) { console.error(e); O.toast('Enregistrement impossible : ' + (e.message || e), { bad: true }); return false; }
  };
  C.exportAs = async function (kind, opt) {
    const K = A.KINDS[kind];
    try {
      let b;
      if (kind === 'pdf') b = await TB.Pdf.export(A.wb, Object.assign({ sheets: 'active' }, opt || {}), progress('Création du PDF'));
      else b = await buildBlob(kind);
      const r = await F.export(b, O.safeName(A.docName(), K.ext), { types: [K.type], mime: K.mime });
      if (r && r.ok && kind === 'pdf') A.lastPdf = { blob: b, name: O.safeName(A.docName(), '.pdf') };
      return b;
    } catch (e) { console.error(e); O.toast('Export impossible : ' + (e.message || e), { bad: true }); return null; }
  };
  C.pdfToAtelier = async function (opt) {
    const M = window.MAGPC; let w = null;
    if (M) { try { w = M.nativeOpen('about:blank'); } catch (e) { } }
    try {
      const b = await TB.Pdf.export(A.wb, Object.assign({ sheets: 'active' }, opt || {}), progress('Création du PDF')); const name = O.safeName(A.docName(), '.pdf');
      if (M) { await M.db.put('inbox', { id: M.uid('i'), to: 'fr.magformation13.pdf', name, blob: b, at: Date.now() }); const u = new URL((M.conf && M.conf.apps && M.conf.apps['fr.magformation13.pdf']) || '../pdf/', location.href).href; if (w) w.location.href = u; else M.nativeOpen(u); O.toast('Ouverture dans l\'Atelier PDF…'); return; }
      if (O.isAndroid) { await F.share(b, name); O.toast('Choisissez « Atelier PDF » dans la liste'); return; }
      await F.export(b, name, { types: [A.KINDS.pdf.type], mime: 'application/pdf' });
    } catch (e) { if (w) w.close(); O.toast('PDF impossible : ' + e.message, { bad: true }); }
  };
  C.print = async function (opt) {
    try {
      const b = await TB.Pdf.export(A.wb, Object.assign({ sheets: 'active' }, opt || {}), progress('Préparation de l\'impression'));
      const r = await F.printPdf(b, O.safeName(A.docName(), '.pdf'));
      if (!r) { const u = URL.createObjectURL(b); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 120000); }
    } catch (e) { console.error(e); O.toast('Impression impossible : ' + e.message, { bad: true }); }
  };
  C.share = async function (kind) {
    try { const b = kind === 'pdf' ? await TB.Pdf.export(A.wb, { sheets: 'active' }) : await buildBlob(kind); await F.share(b, O.safeName(A.docName(), A.KINDS[kind].ext)); }
    catch (e) { O.toast('Partage impossible : ' + e.message, { bad: true }); }
  };

  /* ---------------- vignette et récents ---------------- */
  async function thumb() { try { return TB.thumbnail ? TB.thumbnail(A.wb, 320, 200) : ''; } catch (e) { return ''; } }
  A.thumb = thumb;
  async function addRecent(blob, name, ref) {
    const th = await thumb();
    const n = A.wb.sheets.length;
    A.file.recentId = await F.recents.add({ name: name || A.file.name || A.docName() + '.magcalc', ref: ref || null, thumb: th, info: n + ' feuille' + (n > 1 ? 's' : ''), blob: ref ? null : blob });
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
    if (a.open) openRecent(a.open); else if (a['new']) C.newBook(a.tpl || 'vide'); else if (a.pick) C.open();
  };

  /* ---------------- coulisses « Fichier » ---------------- */
  A.bsTab = 'home';
  A.openBackstage = function (tab) {
    if (A.grid && A.grid.edit) A.grid.commitEdit(null);
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
  // Échap ferme le menu Fichier (retour au classeur)
  O.keys({ 'escape': () => { if (!$('#backstage').classList.contains('on') || O.dialogOpen() || O.menuOpen()) return false; A.closeBackstage(); } }, { typing: true });
  A.closeBackstage = function () { const bs = $('#backstage'); if (!bs.classList.contains('on')) return; bs.classList.remove('on'); bs.innerHTML = ''; setTimeout(() => { A.grid.updateExtent(); A.grid.draw(); A.grid.focus(); }, 0); };
  function tplCard(t) { return '<button type="button" class="tpl" data-a="tpl:' + t.id + '"><div class="pv" data-pv="' + t.id + '"></div><b>' + O.esc(t.name) + '</b><small>' + O.esc(t.desc) + '</small></button>'; }
  async function recentsHtml(max) {
    const l = (await F.recents.list()).slice(0, max || 30);
    if (!l.length) return '<p class="o-hint">Aucun classeur récent.</p>';
    return '<div class="rec-list">' + l.map((r) => '<div class="rec" data-a="rec:' + r.id + '" role="button" tabindex="0">' + (r.thumb ? '<img src="' + r.thumb + '" alt="">' : '<span class="noimg"></span>') + '<span class="t"><b>' + O.esc(r.name) + '</b><small>' + O.esc(r.info || '') + ' · ' + O.ago(r.at) + (r.ref && r.ref.kind === 'blob' ? ' · copie dans l\'appli' : '') + '</small></span><button type="button" class="pin' + (r.pin ? ' on' : '') + '" data-a="pin:' + r.id + '" title="' + (r.pin ? 'Désépingler' : 'Épingler') + '">' + O.icon(r.pin ? 'pin' : 'pin-off') + '</button><button type="button" class="pin" data-a="rm:' + r.id + '" title="Retirer de la liste">' + O.icon('x') + '</button></div>').join('') + '</div>';
  }
  const FMT_CARDS = (pfx) => [['magcalc', 'file-check', 'Classeur Tableur (.magcalc)', 'Format complet de l\'appli : tout est conservé. Recommandé.'], ['xlsx', 'file-spreadsheet', 'Classeur Excel (.xlsx)', 'Pour Excel, LibreOffice, OnlyOffice, Google Sheets.'], ['ods', 'file-type', 'OpenDocument (.ods)', 'Format ouvert de LibreOffice.'], ['csv', 'file-text', 'CSV (point-virgule)', 'Feuille active, valeurs seulement (Excel français).'], ['tsv', 'file', 'Texte tabulé (.tsv)', 'Feuille active, valeurs seulement.'], ['pdf', 'file-badge', 'PDF', 'Pour lire et imprimer partout (mise en page de la feuille).'], ['html', 'globe', 'Page web (.html)', 'Toutes les feuilles, mise en forme comprise.']].filter((x) => pfx !== 'saveas' || (x[0] !== 'pdf' && x[0] !== 'html')).map((x) => '<button type="button" class="bs-card" data-a="' + pfx + ':' + x[0] + '">' + O.icon(x[1]) + '<span><b>' + x[2] + '</b>' + x[3] + '</span></button>').join('');
  async function renderBs(body) {
    const tab = A.bsTab; let h = '';
    if (tab === 'home') {
      const rec = await F.autosave.get('courant').catch(() => null);
      if (rec && rec.data && rec.data.dirty && A._pendingRecovery) h += '<div style="border-radius:10px;margin-bottom:14px;display:flex;gap:10px;align-items:center;padding:8px 14px;background:#FFF3BF;color:#5c4400;font-weight:600;flex-wrap:wrap">' + O.icon('life-buoy') + '<span style="flex:1">Un classeur non enregistré (« ' + O.esc(O.baseName(rec.data.file && rec.data.file.name) || (rec.data.json.props || {}).title || 'sans titre') + ' », ' + O.ago(rec.at) + ') peut être récupéré.</span><button type="button" class="o-btn pri" data-a="recover">Récupérer</button><button type="button" class="o-btn" data-a="norecover">Ignorer</button></div>';
      h += '<h2>Bonjour</h2><h3>Nouveau</h3><div class="tpl-grid">' + TB.Templates.list.slice(0, 8).map(tplCard).join('') + '</div><p style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button type="button" class="mini-btn" data-a="more">' + O.icon('layout-grid') + 'Tous les modèles</button><button type="button" class="mini-btn" data-a="open">' + O.icon('folder-open') + 'Ouvrir un fichier (.xlsx, .magcalc, .ods, .csv…)</button></p><h3>Récents</h3>' + await recentsHtml(12);
    } else if (tab === 'new') h = '<h2>Nouveau</h2><div class="tpl-grid">' + TB.Templates.list.map(tplCard).join('') + '</div>';
    else if (tab === 'open') h = '<h2>Ouvrir</h2><div class="bs-cards"><button type="button" class="bs-card" data-a="open">' + O.icon('folder-open') + '<span><b>Parcourir…</b>Classeurs .xlsx, .magcalc, .ods, .xls (lecture), .csv, .tsv' + (O.isPC ? '. Vous pouvez aussi glisser un fichier sur la fenêtre ou utiliser « Ouvrir avec » dans l\'Explorateur.' : '') + '</span></button><button type="button" class="bs-card" data-a="csvinto">' + O.icon('file-input') + '<span><b>Importer un CSV dans ce classeur</b>Assistant : séparateur, encodage, formats, à l\'emplacement de la cellule active</span></button></div><h3>Récents</h3>' + await recentsHtml();
    else if (tab === 'info') {
      const W = A.wb, p = W.props; let cells = 0, fml = 0; W.sheets.forEach((s) => { const e = s.extent(); cells += Math.max(0, e.r + 1) * Math.max(0, e.c + 1); fml += s.fml.size; });
      h = '<h2>Informations</h2><dl class="bs-props"><dt>Titre</dt><dd><input class="o-in" data-prop="title" value="' + O.esc(p.title || '') + '"></dd><dt>Auteur</dt><dd><input class="o-in" data-prop="author" value="' + O.esc(p.author || '') + '"></dd><dt>Objet</dt><dd><input class="o-in" data-prop="subject" value="' + O.esc(p.subject || '') + '"></dd><dt>Fichier</dt><dd>' + O.esc(A.file.name || 'non enregistré') + (A.file.kind ? ' (' + A.file.kind + ')' : '') + '</dd><dt>Feuilles</dt><dd>' + W.sheets.length + ' (' + W.sheets.filter((s) => s.hidden).length + ' masquée(s))</dd><dt>Zone utilisée</dt><dd>' + cells.toLocaleString('fr-FR') + ' cellules · ' + fml.toLocaleString('fr-FR') + ' formules</dd><dt>Noms définis</dt><dd>' + W.names.length + '</dd><dt>Créé</dt><dd>' + O.fmtDate(p.created, true) + '</dd><dt>Modifié</dt><dd>' + O.fmtDate(p.modified, true) + '</dd></dl>' +
        '<h3>Protection</h3><p>' + (W.sheets.some((s) => s.protect) ? 'Feuille(s) protégée(s) : ' + W.sheets.filter((s) => s.protect).map((s) => O.esc(s.name)).join(', ') + '. ' : 'Aucune feuille protégée. ') + (W.protect && W.protect.structure ? 'Structure du classeur protégée.' : '') + ' <button type="button" class="mini-btn" data-a="protect">' + O.icon('lock') + 'Protéger…</button></p><p class="o-hint">La protection empêche les modifications par erreur dans Tableur et dans les autres tableurs ; elle n\'est pas un chiffrement : le contenu reste lisible par un autre logiciel.</p><h3>Confidentialité</h3><p class="o-hint">Tout reste sur cet appareil : le classeur, ses images et ses données ne sont jamais envoyés sur internet.</p>';
    } else if (tab === 'saveas') h = '<h2>Enregistrer sous</h2><div class="bs-cards">' + FMT_CARDS('saveas') + '</div>';
    else if (tab === 'export') h = '<h2>Exporter</h2><h3>PDF</h3><div class="o-form" style="max-width:640px"><label class="o-field half"><span>Contenu</span><select class="o-in" id="pdfWhat"><option value="active">Feuille active</option><option value="all">Toutes les feuilles</option><option value="selection">Sélection</option></select></label></div><p style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="o-btn pri" data-a="pdf">' + O.icon('file-badge') + 'Exporter en PDF</button><button type="button" class="o-btn" data-a="atelier">' + O.icon('square-arrow-out-up-right') + 'Ouvrir le PDF dans l\'Atelier PDF</button></p><h3>Autres formats</h3><div class="bs-cards">' + FMT_CARDS('exp') + '</div>';
    else if (tab === 'print') { body.innerHTML = '<h2>Imprimer</h2>'; if (D.printPane) D.printPane(body); return; }
    else if (tab === 'share') h = '<h2>Partager</h2><div class="bs-cards"><button type="button" class="bs-card" data-a="share:xlsx">' + O.icon('file-spreadsheet') + '<span><b>Classeur Excel</b>.xlsx</span></button><button type="button" class="bs-card" data-a="share:pdf">' + O.icon('file-badge') + '<span><b>PDF</b>Feuille active</span></button><button type="button" class="bs-card" data-a="share:magcalc">' + O.icon('file-check') + '<span><b>Classeur Tableur</b>.magcalc</span></button><button type="button" class="bs-card" data-a="share:ods">' + O.icon('file-type') + '<span><b>OpenDocument</b>.ods</span></button><button type="button" class="bs-card" data-a="share:csv">' + O.icon('file-text') + '<span><b>CSV</b>Feuille active</span></button></div>';
    else if (tab === 'options') h = '<h2>Options</h2><div class="o-form" style="max-width:600px"><label class="o-field"><span>Votre nom (commentaires, notes, auteur des nouveaux classeurs)</span><input class="o-in" data-opt="auteur" value="' + O.esc(A.userName()) + '"></label><label class="o-field half"><span>Apparence</span><select class="o-in" data-opt="ui"><option value="">Comme le système</option><option value="clair"' + (A.settings.ui === 'clair' ? ' selected' : '') + '>Claire</option><option value="sombre"' + (A.settings.ui === 'sombre' ? ' selected' : '') + '>Sombre</option></select></label><label class="o-field half"><span>Noms des fonctions</span><select class="o-in" data-opt="fn"><option value="fr"' + (TB.loc.fn === 'fr' ? ' selected' : '') + '>Français (SOMME, SI, RECHERCHEV…)</option><option value="en"' + (TB.loc.fn === 'en' ? ' selected' : '') + '>Anglais (SUM, IF, VLOOKUP…)</option></select></label><label class="o-field half"><span>Séparateurs</span><select class="o-in" data-opt="sep"><option value="fr"' + (TB.loc.sep === 'fr' ? ' selected' : '') + '>« ; » entre arguments, virgule décimale (1,5)</option><option value="en"' + (TB.loc.sep === 'en' ? ' selected' : '') + '>« , » entre arguments, point décimal (1.5)</option></select></label><p class="o-hint">Les formules sont toujours acceptées avec les noms français ou anglais. Les fichiers .xlsx et .ods gardent leur écriture standard.</p><label class="o-check"><input type="checkbox" data-opt="autoComplete"' + (A.settings.autoComplete !== false ? ' checked' : '') + '><span>Saisie semi-automatique des valeurs de la colonne</span></label><label class="o-check"><input type="checkbox" data-opt="autoLink"' + (A.settings.autoLink !== false ? ' checked' : '') + '><span>Transformer les adresses web et e-mail en liens</span></label><label class="o-check"><input type="checkbox" data-opt="iter"' + (A.wb.settings.iter ? ' checked' : '') + '><span>Calcul itératif (références circulaires, 100 itérations, écart 0,001)</span></label></div><h3>Listes personnalisées (recopie incrémentée et tri)</h3><textarea class="o-in" rows="5" data-opt="lists" style="max-width:600px" placeholder="Une liste par ligne, éléments séparés par des virgules : Nord, Est, Sud, Ouest">' + O.esc(TB.Data.userLists().map((l) => l.join(', ')).join('\n')) + '</textarea><h3>Récents</h3><p><button type="button" class="mini-btn" data-a="clearrec">' + O.icon('trash-2') + 'Vider la liste des récents</button></p>';
    else if (tab === 'about') h = aboutHtml();
    body.innerHTML = h;
    O.$$('[data-pv]', body).forEach((pv) => TB.Templates.preview(pv, pv.dataset.pv));
    O.$$('[data-prop]', body).forEach((i) => i.addEventListener('change', () => { A.wb.props[i.dataset.prop] = i.value; A.dirty = true; A.renderTitle(); }));
    O.$$('[data-opt]', body).forEach((i) => i.addEventListener('change', () => {
      const k = i.dataset.opt;
      if (k === 'auteur') { try { localStorage.setItem('tableur:auteur', i.value.trim()); } catch (e) { } }
      else if (k === 'ui') { A.settings.ui = i.value; A.saveSettings(); A.applyUi(); }
      else if (k === 'fn' || k === 'sep') A.setLocale({ [k]: i.value });
      else if (k === 'iter') { A.wb.settings.iter = i.checked; C.recalc(); }
      else if (k === 'lists') { const l = i.value.split(/\n/).map((x) => x.split(/[,;]/).map((y) => y.trim()).filter(Boolean)).filter((x) => x.length > 1); try { localStorage.setItem('tableur:listes', JSON.stringify(l)); } catch (e) { } O.toast(l.length + ' liste(s) enregistrée(s)'); }
      else { A.settings[k] = i.checked; A.saveSettings(); }
    }));
    O.$$('.rec', body).forEach((r) => r.addEventListener('keydown', (e) => { if (e.key === 'Enter') r.click(); }));
  }
  async function bsAction(a, el, ev) {
    const [k, v] = a.split(':');
    if (k === 'tpl') { C.newBook(v); return; }
    if (k === 'more') { A.openBackstage('new'); return; }
    if (k === 'open') { C.open(); return; }
    if (k === 'csvinto') { A.closeBackstage(); A.importCsv(); return; }
    if (k === 'rec') { if (ev.target.closest('.pin')) return; openRecent(v); return; }
    if (k === 'pin') { const r = await F.recents.get(v); await F.recents.pin(v, !(r && r.pin)); A.openBackstage(A.bsTab); return; }
    if (k === 'rm') { await F.recents.remove(v); A.openBackstage(A.bsTab); return; }
    if (k === 'saveas') { C.saveAs(v); return; }
    if (k === 'exp') { C.exportAs(v); return; }
    if (k === 'pdf') { C.exportAs('pdf', { sheets: $('#pdfWhat').value }); return; }
    if (k === 'atelier') { C.pdfToAtelier({ sheets: $('#pdfWhat') ? $('#pdfWhat').value : 'active' }); return; }
    if (k === 'share') { C.share(v); return; }
    if (k === 'protect') { A.closeBackstage(); D.protectSheet(); return; }
    if (k === 'clearrec') { await F.recents.clear(); O.toast('Liste vidée (les épinglés restent)'); return; }
    if (k === 'recover') { A._pendingRecovery = false; await recover(); return; }
    if (k === 'norecover') { A._pendingRecovery = false; const r = await F.autosave.get('courant'); if (r) { r.data.dirty = false; await F.autosave.put('courant', r.data, r.media); } A.openBackstage('home'); return; }
    void el;
  }
  async function recover() {
    const r = await F.autosave.get('courant'); if (!r) return;
    const wb = TB.IOJ.fromJson(r.data.json, r.media);
    A.setWorkbook(wb, r.data.file ? { name: r.data.file.name, kind: r.data.file.kind, recentId: r.data.file.recentId, ref: null } : {}, { dirty: true });
    A.closeBackstage(); O.toast('Classeur récupéré. Pensez à l\'enregistrer (Ctrl+S).', { ms: 4000 });
  }
  function aboutHtml() {
    const lic = [['JSZip 3.10.1', 'MIT (ou GPLv3 au choix ; utilisé sous MIT)', 'archives .xlsx, .ods et .magcalc (le XML Office et OpenDocument est écrit et lu par Tableur)', 'jszip-MIT-ou-GPLv3.md'], ['jsPDF 2.5.1', 'MIT', 'export PDF', 'jspdf-MIT.txt'], ['SheetJS Community Edition 0.18.5', 'Apache-2.0', 'lecture des anciens fichiers .xls seulement (chargée à la demande)', 'xlsx-Apache-2.0.txt'], ['Lucide 1.64.0', 'ISC', 'icônes', 'lucide-ISC.txt'], ['Polices Mag Sans, Mag Serif, Mag Mono (Liberation 2.1.5), Mag Sans Douce (Carlito), Caladea', 'SIL OFL 1.1', 'polices équivalentes à Arial, Times New Roman, Courier New, Calibri et Cambria (écran et PDF)', 'fonts-OFL-1.1.txt']];
    return '<h2>À propos</h2><p><b>Tableur</b> · Suite MAG · version ' + A.VERSION + '</p><p class="o-hint" style="max-width:760px">Tableur hors ligne : rien n\'est envoyé sur internet. Le moteur de calcul (' + TB.fnList().length + ' fonctions, noms français et anglais), la grille, les formats .xlsx et .ods sont écrits pour Tableur. Formats : .magcalc (natif, ouvert : zip contenant workbook.json et les images), .xlsx et .ods (ouverture et enregistrement), .xls (ouverture), .csv / .tsv, export PDF et HTML.</p><h3>Bibliothèques libres utilisées</h3><table class="kbd-tbl" style="max-width:760px">' + lic.map((l) => '<tr><td><b>' + l[0] + '</b><br><small class="o-hint">' + l[2] + '</small></td><td>' + l[1] + '</td></tr>').join('') + '</table><p class="o-hint">Les textes complets des licences sont fournis avec l\'appli (dossier <code>LICENSES</code>). Excel, Office et Microsoft sont des marques de leurs propriétaires ; Tableur est une appli indépendante.</p><p><button type="button" class="mini-btn" onclick="TableurApp.cmd.shortcuts()">' + O.icon('keyboard') + 'Raccourcis clavier</button></p>';
  }

  /* ---------------- « Ouvrir avec », dépôt ---------------- */
  function dropInit() {
    if (O.isPC) return;
    const hint = $('#dropHint');
    window.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); hint.classList.add('on'); } });
    window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) hint.classList.remove('on'); });
    window.addEventListener('drop', (e) => { hint.classList.remove('on'); const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []); const f = files.find((x) => A.OPEN_RE.test(x.name)); e.preventDefault(); if (f) { openBlob(f, f.name, null); return; } files.filter((x) => /^image\//.test(x.type)).forEach((x) => A.insertImageFile(x)); });
  }
  function launchFiles(l) {
    const f = l.find((x) => A.OPEN_RE.test(x.name));
    if (f) { openBlob(f.blob, f.name, f.ref); return; }
    l.filter((x) => /^image\//.test(x.blob.type || O.mimeOf(x.name))).forEach((m) => A.insertImageFile(m.blob instanceof File ? m.blob : new File([m.blob], m.name, { type: m.blob.type })));
  }

  /* ---------------- démarrage ---------------- */
  async function boot() {
    A.applyUi && A.applyUi();
    A.wb = TB.newWorkbook(1); A.wb.finishLoad();
    A.grid = TB.Grid($('#gridHost'));
    A.mountUi();
    A.applyUi();
    A.wb.on((ev) => { A.dirty = true; A.afterModelChange(ev); });
    dropInit();
    try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all(["400 15px 'Mag Sans Douce'", "700 15px 'Mag Sans Douce'"].map((f) => document.fonts.load(f))), O.sleep(1500)]); } catch (e) { }
    const rec = await F.autosave.get('courant').catch(() => null);
    if (rec && rec.data && rec.data.json && !rec.data.dirty) {
      try {
        const wb = TB.IOJ.fromJson(rec.data.json, rec.media);
        A.setWorkbook(wb, rec.data.file ? { name: rec.data.file.name, kind: rec.data.file.kind, recentId: rec.data.file.recentId, ref: null } : {});
        if (rec.data.file && rec.data.file.recentId) { const r = await F.recents.get(rec.data.file.recentId); if (r && r.ref && r.ref.kind !== 'blob') A.file.ref = r.ref; }
      } catch (e) { console.warn(e); A.setWorkbook(TB.Templates.build('vide'), {}); }
    } else A.setWorkbook(TB.Templates.build('vide'), {});
    F.onLaunch(launchFiles);
    if (rec && rec.data && rec.data.dirty) { A._pendingRecovery = true; A.openBackstage('home'); }
    else if (!rec) A.openBackstage('home');
    setTimeout(() => { try { const M = window.MAGPrint; if (M && M.takeSocle && !window.MAGPC) { const x = M.takeSocle(); if (x) window.onSocle(x); } } catch (e) { } socle(''); }, 400);
    document.documentElement.classList.add('ready');
    A.booted = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
