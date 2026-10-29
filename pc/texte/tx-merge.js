/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-texte/tx-merge.js : ne pas modifier ici. */
/* Texte — publipostage : liste de destinataires (CSV ; , ou tabulation, UTF-8 ou Windows-1252, ou saisie),
   champs «Nom», aperçu des résultats, fusion en un seul document modifiable, un seul PDF (impression),
   un PDF ou un .docx par destinataire (zip). La liste est enregistrée dans le document (réglage « merge »). */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, F = O.Files;
  const A = window.TexteApp = window.TexteApp || {};
  const C = A.cmd = A.cmd || {};

  /* ---------------- CSV ---------------- */
  TX.parseCsv = function (text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
    const cnt = (ch) => first.split(ch).length - 1;
    const sep = [';', ',', '\t', '|'].sort((a, b) => cnt(b) - cnt(a))[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"' && cell === '') { q = true; continue; }
      if (c === sep) { row.push(cell); cell = ''; continue; }
      if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; continue; }
      cell += c;
    }
    row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
    if (!rows.length) return { cols: [], rows: [] };
    const seen = {};
    const cols = rows[0].map((c, i) => { let n = c.trim() || 'Colonne ' + (i + 1); if (seen[n]) n += ' ' + (++seen[n]); else seen[n] = 1; return n; });
    return { cols, rows: rows.slice(1).map((r) => { const o = {}; cols.forEach((c, i) => { o[c] = (r[i] || '').trim(); }); return o; }) };
  };
  TX.toCsv = (data) => [data.cols].concat(data.rows.map((r) => data.cols.map((c) => r[c] == null ? '' : r[c]))).map((r) => r.map((x) => /[;"\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x).join(';')).join('\r\n');

  function setData(data) {
    const settings = Object.assign({}, A.attrs().settings || {}, { merge: data });
    A.setAttr('settings', settings, 'Liste de destinataires');
    A.merge = { data, preview: A.merge && A.merge.preview != null && data && A.merge.preview < data.rows.length ? A.merge.preview : null, nameTpl: A.merge && A.merge.nameTpl };
    if (A.merge.preview != null) applyPreview();
    A.paneRefresh && A.paneRefresh(); A.refreshUi && A.refreshUi();
  }
  C.mergeImport = async function () {
    const l = await F.pickMedia('.csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values', false); if (!l.length) return;
    const f = l[0], blob = f.blob || f, name = f.name || 'liste.csv';
    try {
      const text = await TX.IO.textOf(blob);
      const d = TX.parseCsv(text);
      if (!d.cols.length || !d.rows.length) { O.alert('Liste vide', '<p>Le fichier ne contient pas de destinataires.</p><p class="o-hint">La première ligne doit contenir les noms des colonnes (Nom, Prénom…), puis une ligne par destinataire.</p>'); return; }
      setData({ name, cols: d.cols, rows: d.rows });
      A.openPane && A.openPane('merge');
      O.toast(d.rows.length + ' destinataire' + (d.rows.length > 1 ? 's' : '') + ' · ' + d.cols.length + ' colonnes');
    } catch (e) { O.toast('Lecture impossible : ' + (e.message || e), { bad: true }); }
  };
  C.mergeSample = function () { setData(TX.Templates.sampleMerge()); A.openPane && A.openPane('merge'); };
  C.mergeNewList = function () { listEditor({ name: 'Liste', cols: ['Civilité', 'Prénom', 'Nom', 'Entreprise'], rows: [{}, {}] }); };
  C.mergeEdit = function () { listEditor(O.clone(A.merge.data)); };
  /** Éditeur de liste : tableau modifiable, ajout de colonnes et de lignes, export CSV */
  function listEditor(data) {
    const render = (el) => {
      const t = el.querySelector('.mg-ed');
      t.innerHTML = '<table class="mg-tbl mg-edt"><tr><th></th>' + data.cols.map((c, i) => '<th><input class="o-in" data-col="' + i + '" value="' + O.esc(c) + '" aria-label="Nom de la colonne ' + (i + 1) + '"></th>').join('') + '<th><button type="button" class="mini-btn" data-a="addcol" title="Ajouter une colonne">+</button></th></tr>' + data.rows.map((r, ri) => '<tr><td><button type="button" class="mini-btn" data-a="delrow" data-r="' + ri + '" title="Supprimer la ligne" aria-label="Supprimer la ligne ' + (ri + 1) + '">×</button></td>' + data.cols.map((c, ci) => '<td><input class="o-in" data-r="' + ri + '" data-c="' + ci + '" value="' + O.esc(r[c] == null ? '' : r[c]) + '"></td>').join('') + '<td></td></tr>').join('') + '</table>';
    };
    const sync = (el) => {
      const cols = Array.from(el.querySelectorAll('[data-col]')).map((x, i) => x.value.trim() || 'Colonne ' + (i + 1));
      const rows = data.rows.map((r, ri) => { const o = {}; cols.forEach((c, ci) => { const inp = el.querySelector('[data-r="' + ri + '"][data-c="' + ci + '"]'); o[c] = inp ? inp.value : ''; }); return o; });
      data.cols = cols; data.rows = rows;
    };
    O.dialog({
      title: 'Liste de destinataires', wide: true,
      body: '<div class="mg-ed" style="max-height:52vh;overflow:auto"></div><p style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button type="button" class="mini-btn" data-a="addrow">' + O.icon('plus') + 'Ajouter une ligne</button><button type="button" class="mini-btn" data-a="csv">' + O.icon('download') + 'Enregistrer en CSV</button></p>',
      onOpen: (el) => {
        render(el);
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-a]'); if (!b) return; sync(el);
          if (b.dataset.a === 'addrow') { data.rows.push({}); render(el); const ins = el.querySelectorAll('[data-r="' + (data.rows.length - 1) + '"][data-c="0"]'); if (ins[0]) ins[0].focus(); }
          if (b.dataset.a === 'addcol') { data.cols.push('Colonne ' + (data.cols.length + 1)); render(el); }
          if (b.dataset.a === 'delrow') { data.rows.splice(+b.dataset.r, 1); render(el); }
          if (b.dataset.a === 'csv') F.export(new Blob(['﻿' + TX.toCsv(data)], { type: 'text/csv;charset=utf-8' }), O.safeName(data.name || 'destinataires', '.csv'), { types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
        });
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Utiliser cette liste', primary: true, value: 'ok', onClick: (c, w) => { sync(w); } }]
    }).then((v) => { if (v !== 'ok') return; data.rows = data.rows.filter((r) => data.cols.some((c) => String(r[c] || '').trim())); setData(data); A.openPane && A.openPane('merge'); });
  }

  /* ---------------- aperçu ---------------- */
  function applyPreview() {
    A.refreshFields(); A.relayout && A.relayout(true);
    const m = A.merge;
    if (m && m.preview != null) {
      const r = m.data.rows[m.preview] || {};
      const who = m.data.cols.slice(0, 3).map((c) => r[c]).filter(Boolean).join(' ');
      A.ctxbar('<span>' + O.icon('eye') + ' Aperçu du publipostage : <b>' + (m.preview + 1) + ' / ' + m.data.rows.length + '</b> ' + O.esc(who) + '</span><button type="button" class="mini-btn" data-cb="mprev" aria-label="Précédent">' + O.icon('chevron-left') + '</button><button type="button" class="mini-btn" data-cb="mnext" aria-label="Suivant">' + O.icon('chevron-right') + '</button><button type="button" class="mini-btn" data-cb="mergeoff">Fermer l\'aperçu</button>', 'cb-merge');
    } else if (!A.partEd) A.ctxbar(null);
  }
  C.mergePreview = function (i) {
    if (!A.merge || !A.merge.data) return;
    A.merge.preview = i == null ? null : Math.max(0, Math.min(A.merge.data.rows.length - 1, i));
    applyPreview(); A.paneRefresh && A.paneRefresh(); A.refreshUi && A.refreshUi();
  };

  /* ---------------- fusion ---------------- */
  /** Remplace les champs de fusion par leur valeur (texte gardant la mise en forme du champ) */
  function fill(node, rec) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.reduce((a, n) => { const x = fill(n, rec); if (x !== null) a.push(x); return a; }, []);
    if (node.type === 'field' && node.attrs && node.attrs.f === 'merge') {
      const k = Object.keys(rec).find((x) => x.toLowerCase() === String(node.attrs.name || '').toLowerCase());
      const v = k != null && rec[k] != null ? String(rec[k]) : '';
      return v ? { type: 'text', text: v, marks: node.marks } : null;
    }
    const out = Object.assign({}, node);
    if (node.content) { out.content = fill(node.content, rec); if (!out.content.length) delete out.content; }
    return out;
  }
  TX.mergeFill = function (json, rec) {
    const j = O.clone(json);
    j.content = fill(j.content, rec);
    const a = j.attrs;
    if (a.parts) Object.keys(a.parts).forEach((k) => { a.parts[k] = { doc: fill(a.parts[k].doc || a.parts[k], rec) }; });
    if (a.notes) Object.keys(a.notes).forEach((k) => { a.notes[k] = { doc: fill(a.notes[k].doc, rec) }; });
    if (a.settings) delete a.settings.merge;
    return j;
  };
  /** Un seul document : les sections de chaque destinataire à la suite (nouvelle page à chaque fois) */
  TX.mergeDoc = function (json, rows) {
    const out = O.clone(json); out.content = []; out.attrs.notes = {}; out.attrs.comments = {};
    if (out.attrs.settings) delete out.attrs.settings.merge;
    rows.forEach((rec, k) => {
      const j = TX.mergeFill(json, rec);
      const sfx = '_' + (k + 1);
      const ren = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(ren); return; } if (n.type === 'fnref' && n.attrs) n.attrs = Object.assign({}, n.attrs, { id: n.attrs.id + sfx }); if (n.type === 'paragraph' && n.attrs && n.attrs.pid) n.attrs = Object.assign({}, n.attrs, { pid: n.attrs.pid + sfx }); if (n.marks) n.marks = n.marks.map((m) => m.type === 'cmt' ? { type: 'cmt', attrs: { id: m.attrs.id + sfx } } : m); if (n.content) ren(n.content); };
      ren(j.content);
      Object.keys(j.attrs.notes || {}).forEach((id) => { out.attrs.notes[id + sfx] = j.attrs.notes[id]; });
      Object.keys(j.attrs.comments || {}).forEach((id) => { const c = Object.assign({}, j.attrs.comments[id]); if (c.p) c.p = c.p + sfx; out.attrs.comments[id + sfx] = c; });
      j.content.forEach((sec, si) => { const s = O.clone(sec); if (si === 0 && k > 0) { s.attrs = Object.assign({}, s.attrs); s.attrs.pg = Object.assign({}, s.attrs.pg, { type: 'page', numStart: 1 }); } out.content.push(s); });
    });
    return out;
  };
  const fileName = (tpl, rec, i) => O.safeName(String(tpl || '{Nom}').replace(/\{([^}]+)\}/g, (m, k) => { const key = Object.keys(rec).find((x) => x.toLowerCase() === k.trim().toLowerCase()); return key != null ? rec[key] : ''; }).trim() || 'document-' + (i + 1));
  C.mergeRun = async function (kind) {
    const m = A.merge; if (!m || !m.data || !m.data.rows.length) { O.toast('Choisissez d\'abord une liste de destinataires', { bad: true }); return; }
    const rows = m.data.rows, base = A.docName().replace(/\.[^.]+$/, '');
    const hasFields = JSON.stringify(A.docJSON ? A.docJSON() : A.ed.view.state.doc.toJSON()).indexOf('"f":"merge"') >= 0;
    if (!hasFields && !(await O.confirm('Aucun champ de fusion', 'Le document ne contient aucun champ «…». Fusionner quand même (documents identiques) ?'))) return;
    const prog = A.progress('Fusion…');
    const saved = m.preview;
    try {
      if (kind === 'doc') {
        if (A.dirty && !(await A.askSave())) return;
        const json = A.docJSON(); const media = Object.assign({}, TX.media.blobs);
        const out = TX.mergeDoc(json, rows);
        A.setDoc(TX.IO.upgrade(out), media, { name: base + ' - fusion.magdoc', ref: null, kind: 'magdoc' }, { info: TX.media.info });
        A.dirty = true; A.renderTitle(); O.toast(rows.length + ' documents fusionnés dans un seul document', { ms: 3000 });
        return;
      }
      if (kind === 'pdf') {
        const S = await TX.Pdf.session(A, { outline: true });
        try {
          for (let i = 0; i < rows.length; i++) {
            m.preview = i; A.refreshFields(); A.layout.run(); await O.raf(); await O.raf();
            await TX.Pdf.addPages(S, null, fileName(m.nameTpl || '{Prénom} {Nom}', rows[i], i));
            prog(i, rows.length);
          }
          const blob = TX.Pdf.finish(S);
          await F.export(blob, O.safeName(base + ' - fusion', '.pdf'), { types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }], mime: 'application/pdf' });
          A.lastPdf = { blob, name: O.safeName(base + ' - fusion', '.pdf') };
        } finally { S.restore(); }
      }
      if (kind === 'pdfs' || kind === 'docxs') {
        const z = new window.JSZip(); const used = {};
        const uniq = (n) => { if (!used[n]) { used[n] = 1; return n; } used[n]++; return n.replace(/(\.[^.]+)$/, ' (' + used[n] + ')$1'); };
        if (kind === 'pdfs') {
          for (let i = 0; i < rows.length; i++) {
            m.preview = i; A.refreshFields(); A.layout.run(); await O.raf(); await O.raf();
            const S = await TX.Pdf.session(A, { outline: true });
            try { await TX.Pdf.addPages(S, null); z.file(uniq(fileName(m.nameTpl, rows[i], i) + '.pdf'), TX.Pdf.finish(S)); } finally { S.restore(); }
            prog(i, rows.length);
          }
        } else {
          const json = A.docJSON();
          for (let i = 0; i < rows.length; i++) {
            const r = await TX.Docx.write(TX.mergeFill(json, rows[i]), { record: rows[i], name: base });
            z.file(uniq(fileName(m.nameTpl, rows[i], i) + '.docx'), r.blob); prog(i, rows.length);
          }
        }
        const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        await F.export(blob, O.safeName(base + ' - ' + (kind === 'pdfs' ? 'PDF' : 'docx'), '.zip'), { types: [{ description: 'Archive zip', accept: { 'application/zip': ['.zip'] } }], mime: 'application/zip' });
      }
      prog(1, 1, true);
    } catch (e) { console.error(e); O.toast('Fusion impossible : ' + (e.message || e), { bad: true }); }
    finally { if (kind !== 'doc' && A.merge) { A.merge.preview = saved; A.refreshFields(); A.layout.run(); applyPreview(); } }
  };
})();
