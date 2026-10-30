/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-texte/tx-io.js : ne pas modifier ici. */
/* Texte — fichiers : format natif .magdoc (zip : document.json + médias + vignette), texte brut, Markdown, HTML
   (ouverture et enregistrement), RTF (ouverture), collage depuis d'autres logiciels, comparaison de deux versions.
   TX.IO.open(blob, nom) → {json, media, info, kind, warnings} ; TX.IO.save(kind, json, opt) → {blob, warn}. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, PM = window.PM;
  const B = TX.B, NT = TX.schema.nodes;
  const IO = TX.IO = {};
  const T = (description, mime, exts) => ({ description, accept: { [mime]: exts } });
  IO.KINDS = {
    magdoc: { ext: '.magdoc', mime: 'application/x-magdoc', type: T('Document Texte', 'application/x-magdoc', ['.magdoc']), write: true },
    docx: { ext: '.docx', mime: O.MIME.docx, type: T('Document Word', O.MIME.docx, ['.docx']), write: true },
    odt: { ext: '.odt', mime: 'application/vnd.oasis.opendocument.text', type: T('Document OpenDocument', 'application/vnd.oasis.opendocument.text', ['.odt']), write: true },
    rtf: { ext: '.rtf', mime: 'application/rtf', type: T('Texte enrichi (RTF)', 'application/rtf', ['.rtf']), write: false },
    txt: { ext: '.txt', mime: 'text/plain', type: T('Texte brut', 'text/plain', ['.txt']), write: true },
    md: { ext: '.md', mime: 'text/markdown', type: T('Markdown', 'text/markdown', ['.md', '.markdown']), write: true },
    html: { ext: '.html', mime: 'text/html', type: T('Page web', 'text/html', ['.html', '.htm']), write: true },
    pdf: { ext: '.pdf', mime: 'application/pdf', type: T('Document PDF', 'application/pdf', ['.pdf']), write: false }
  };
  IO.OPEN_TYPES = [{ description: 'Tous les documents', accept: { 'application/x-magdoc': ['.magdoc'], [O.MIME.docx]: ['.docx', '.docm', '.dotx'], 'application/vnd.oasis.opendocument.text': ['.odt', '.ott'], 'application/rtf': ['.rtf'], 'text/plain': ['.txt', '.text'], 'text/markdown': ['.md', '.markdown'], 'text/html': ['.html', '.htm'] } }, IO.KINDS.docx.type, IO.KINDS.magdoc.type, IO.KINDS.odt.type, IO.KINDS.rtf.type, IO.KINDS.txt.type, IO.KINDS.md.type, IO.KINDS.html.type];
  O.MIME.magdoc = 'application/x-magdoc'; O.MIME.odt = IO.KINDS.odt.mime; O.MIME.rtf = 'application/rtf'; O.MIME.md = 'text/markdown';

  /* ---------------- détection, ouverture ---------------- */
  async function head(blob, n) { const b = new Uint8Array(await blob.slice(0, n || 2048).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
  IO.open = async function (blob, name, progress) {
    const ext = O.extOf(name), h = await head(blob, 4096);
    const user = (m) => { const e = new Error(m); e.user = true; return e; };
    if (h.slice(0, 2) === 'PK') {
      // archive abîmée ou tronquée : on récupère ce qui est lisible (O.openZip), avec un avertissement
      const oz = await O.openZip(blob), z = oz.zip;
      const rep = (r) => { if (oz.repaired) r.warnings = ['Fichier abîmé ou incomplet : ce qui était lisible a été repris' + (oz.lost.length ? ' (' + oz.lost.length + ' partie(s) perdue(s))' : '') + '. Vérifiez le document, puis enregistrez-le sous un autre nom.'].concat(r.warnings || []); return r; };
      if (z.file('document.json')) return rep(Object.assign(await fromMagdoc(z), { kind: 'magdoc' }));
      if (z.file('word/document.xml') || Object.keys(z.files).some((n) => /^word\/document\d*\.xml$/i.test(n))) return rep(Object.assign(await TX.Docx.read(z, progress), { kind: 'docx' }));
      if (z.file('content.xml')) return rep(Object.assign(await TX.Odt.read(z, progress), { kind: 'odt' }));
      if (z.file('word/_rels/document.xml.rels') || z.file('[Content_Types].xml') && /wordprocessingml/.test(await z.file('[Content_Types].xml').async('string'))) throw user('Ce document Word est abîmé : son texte principal (word/document.xml) est absent ou illisible. Essayez « Ouvrir et réparer » dans Word, ou une copie plus ancienne.');
      throw user('Ce fichier n\'est pas un document reconnu (ni .docx, ni .odt, ni .magdoc).');
    }
    if (/^\{\\rtf/.test(h.trimStart())) return Object.assign(IO.fromRtf(await textOf(blob, true)), { kind: 'rtf' });
    if (/^\xD0\xCF\x11\xE0/.test(h)) {
      if (O.isEncryptedOffice(new Uint8Array(await blob.slice(0, 1 << 20).arrayBuffer()))) throw user(O.ENCRYPTED_MSG);
      throw user('Ancien format Word (.doc) : ouvrez-le dans Word ou LibreOffice et enregistrez-le en .docx (ou .odt), puis rouvrez-le ici.');
    }
    if (!blob.size) throw user('Le fichier est vide (0 octet).');
    if (/^(docx|docm|dotx|odt|magdoc)$/.test(ext)) throw user('Ce fichier « .' + ext + ' » est abîmé : ce n\'est pas une archive lisible (téléchargement interrompu, copie incomplète ?).');
    const text = await textOf(blob);
    if (ext === 'md' || ext === 'markdown') return Object.assign(IO.fromMarkdown(text), { kind: 'md' });
    if (ext === 'html' || ext === 'htm' || ext === 'xhtml' || /^\s*(<!doctype html|<html)/i.test(text)) return Object.assign(IO.fromHtml(text), { kind: 'html' });
    return Object.assign(IO.fromText(text), { kind: 'txt' });
  };
  /** Texte d'un fichier : UTF-8 (avec ou sans BOM), sinon Windows-1252 */
  async function textOf(blob, latin) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf);
    if (buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf);
    if (latin) return new TextDecoder('windows-1252').decode(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  IO.textOf = textOf;

  /* ---------------- .magdoc ---------------- */
  IO.upgrade = function (json) {
    if (!json || json.type !== 'doc') throw new Error('Document illisible');
    const a = json.attrs = Object.assign({}, json.attrs || {});
    a.styles = a.styles || TX.defaultStyles();
    // styles ajoutés après coup : complétés
    const def = TX.defaultStyles(); Object.keys(def).forEach((k) => { if (!a.styles[k]) a.styles[k] = def[k]; });
    a.lists = a.lists || {}; a.settings = Object.assign(TX.defaultSettings(), a.settings || {}); a.parts = a.parts || {}; a.notes = a.notes || {}; a.comments = a.comments || {}; a.props = Object.assign(TX.defaultProps(), a.props || {});
    if (!json.content || !json.content.length) json.content = [B.section([B.p('Normal', '')])];
    json.content = json.content.map((s) => s.type === 'section' ? s : B.section([s]));
    json.content.forEach((s) => { s.attrs = s.attrs || {}; s.attrs.pg = Object.assign(TX.defaultPage(), s.attrs.pg || {}); if (!s.content || !s.content.length) s.content = [B.p('Normal', '')]; });
    // nettoyage : textes vides, contenus vides (imports), puis validation par le schéma
    const clean = (n) => { if (!n || !n.content) return; n.content = n.content.filter((c) => c && !(c.type === 'text' && !c.text)); if (!n.content.length && n.type !== 'paragraph') delete n.content; else if (!n.content.length) delete n.content; n.content && n.content.forEach(clean); if (/^table_(cell|header)$/.test(n.type) && !n.content) n.content = [B.p('Normal', '')]; };
    clean(json); [a.parts, a.notes].forEach((o) => Object.keys(o).forEach((k) => clean(o[k].doc || o[k])));
    TX.schema.nodeFromJSON(json).check();
    return json;
  };
  async function fromMagdoc(z) {
    const d = JSON.parse(await z.file('document.json').async('string'));
    if (d.format !== 'magdoc') throw new Error('Fichier .magdoc non reconnu');
    const media = {}, info = {};
    for (const id of Object.keys(d.media || {})) { const m = d.media[id]; const f = z.file(m.path); if (f) { media[id] = new Blob([await f.async('uint8array')], { type: m.type || O.mimeOf(m.path) }); info[id] = { name: m.name, type: m.type, w: m.w, h: m.h }; } }
    return { json: IO.upgrade(d.doc), media, info, warnings: d.version > 1 ? ['Document créé par une version plus récente de Texte'] : [] };
  }
  IO.toMagdoc = async function (json, opt) {
    const z = new window.JSZip(), used = TX.media.used(json), media = {};
    for (const id of used) { const b = TX.media.blobs[id]; const ext = O.extOf((TX.media.info[id] || {}).name) || (b.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('svg+xml', 'svg'); const path = 'media/' + id + '.' + ext; z.file(path, b); media[id] = Object.assign({ path, type: b.type }, TX.media.info[id] || {}); }
    z.file('document.json', JSON.stringify({ format: 'magdoc', version: 1, app: 'Texte (Suite MAG)', saved: new Date().toISOString(), doc: json, media }));
    if (opt && opt.thumb) { const b = O.dataURLToBlob(opt.thumb); if (b) z.file('thumb.jpg', b); }
    z.file('mimetype', 'application/x-magdoc');
    return z.generateAsync({ type: 'blob', mimeType: 'application/x-magdoc', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  };

  /* ---------------- enregistrement ---------------- */
  IO.save = async function (kind, json, opt) {
    opt = opt || {};
    if (kind === 'magdoc') { let thumb = ''; try { thumb = opt.app ? await opt.app.thumb() : ''; } catch (e) { } return { blob: await IO.toMagdoc(json, { thumb }), warn: [] }; }
    if (kind === 'docx') return TX.Docx.write(json, opt);
    if (kind === 'odt') return TX.Odt.write(json, opt);
    if (kind === 'txt') return { blob: new Blob(['﻿' + IO.toText(json).replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }), warn: [] };
    if (kind === 'md') return { blob: new Blob([await IO.toMarkdown(json)], { type: 'text/markdown;charset=utf-8' }), warn: [] };
    if (kind === 'html') return { blob: new Blob([await IO.toHtml(json, opt)], { type: 'text/html;charset=utf-8' }), warn: [] };
    throw new Error('Format non pris en charge : ' + kind);
  };

  /* ---------------- texte brut ---------------- */
  IO.fromText = function (text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const content = lines.map((l) => B.p('Normal', l));
    return { json: IO.upgrade(TX.emptyDoc({ content: content.length ? content : [B.p('Normal', '')], settings: { styleSet: 'defaut' } })), media: {}, info: {}, warnings: [] };
  };
  /** Texte brut d'un document : listes avec leurs étiquettes, tableaux en tabulations, notes à la fin */
  IO.toText = function (json, opt) {
    const doc = TX.schema.nodeFromJSON(json), num = TX.computeNumbers(doc, json.attrs);
    const lbl = {}; num.labels.forEach((l) => { lbl[l.pos] = l; });
    const out = [];
    const inline = (n) => { let s = ''; n.forEach((c) => { if (c.isText) { if (!c.marks.some((m) => m.type.name === 'del')) s += c.text; } else if (c.type.name === 'tab') s += '\t'; else if (c.type.name === 'hard_break') s += '\n'; else if (c.type.name === 'fnref') s += '[' + (c.attrs.end ? num.notes.end[c.attrs.id] : num.notes.foot[c.attrs.id]) + ']'; else if (c.type.name === 'field') s += TX.fieldText(c.attrs, null, 0, null) || c.attrs.cache || ''; else if (c.type.name === 'math') s += c.attrs.tex; else if (c.type.name === 'image') s += c.attrs.alt ? '[' + c.attrs.alt + ']' : ''; }); return s; };
    doc.descendants((n, pos) => {
      if (n.type.name === 'paragraph') { const l = lbl[pos]; out.push((l ? '  '.repeat(l.l) + l.label + (l.bullet ? ' ' : ' ') : '') + inline(n)); return false; }
      if (n.type.name === 'table') { n.forEach((row) => { const cells = []; row.forEach((c) => cells.push(TX.textOf(c).replace(/\n/g, ' ').trim())); out.push(cells.join('\t')); }); out.push(''); return false; }
      if (n.type.name === 'page_break') { out.push('\f'); return false; }
      if (n.type.name === 'toc') return false;
      return true;
    });
    const notes = json.attrs.notes || {};
    const ids = Object.keys(num.notes.foot).sort((a, b) => num.notes.foot[a] - num.notes.foot[b]).concat(Object.keys(num.notes.end).sort((a, b) => num.notes.end[a] - num.notes.end[b]));
    if (ids.length) { out.push('', '———'); ids.forEach((id) => { const n = num.notes.foot[id] || num.notes.end[id]; let t = ''; try { t = TX.textOf(TX.schema.nodeFromJSON((notes[id] || {}).doc || B.part([B.p('NoteBas', '')]))).trim(); } catch (e) { } out.push('[' + n + '] ' + t); }); }
    return out.join('\n') + '\n';
  };

  /* ---------------- HTML ---------------- */
  /** Prépare un HTML étranger (Word, LibreOffice, pages web) : listes à plat (attributs de liste), titres, images data: */
  function prepHtml(root, lists, media, info) {
    // listes imbriquées → paragraphes avec niveau
    const walkList = (list, level, id) => {
      Array.from(list.children).forEach((li) => {
        if (li.tagName !== 'LI') return;
        const nested = Array.from(li.children).filter((c) => /^(UL|OL)$/.test(c.tagName));
        nested.forEach((x) => x.remove());
        const p = document.createElement('p');
        while (li.firstChild) { const c = li.firstChild; if (c.nodeType === 1 && /^(P|DIV)$/.test(c.tagName)) { while (c.firstChild) p.appendChild(c.firstChild); c.remove(); if (li.firstChild) p.appendChild(document.createElement('br')); } else p.appendChild(c); }
        p.setAttribute('data-s', 'ParagrapheListe'); p.setAttribute('data-li', JSON.stringify({ id, l: Math.min(8, level) }));
        if (li.style && li.style.textAlign) p.style.textAlign = li.style.textAlign;
        list.parentNode.insertBefore(p, list);
        nested.forEach((x) => { const nid = x.tagName === 'OL' ? mkList(x, true) : id; walkList(x, level + 1, nid); list.parentNode.insertBefore(x, list); x.remove(); });
      });
      list.remove();
    };
    const mkList = (el, ordered) => { const id = TX.uid('L'); const st = (el.getAttribute('type') || el.style.listStyleType || '').toLowerCase(); lists[id] = TX.LIST_KINDS[ordered ? (st === 'a' || /lower-alpha|lower-latin/.test(st) ? 'alphaMin' : st === 'A' || /upper-alpha/.test(st) ? 'alpha' : /roman/.test(st) ? 'romain' : 'num') : 'puces'](); return id; };
    let l;
    while ((l = root.querySelector('ul,ol'))) { let top = l; while (top.parentNode && top.parentNode !== root && top.parentNode.closest && top.parentNode.closest('ul,ol')) top = top.parentNode.closest('ul,ol'); walkList(top, 0, mkList(top, top.tagName === 'OL')); }
    // Word (HTML collé) : paragraphes « MsoListParagraph » avec puce littérale
    root.querySelectorAll('p[class*=MsoList], p[style*="mso-list"]').forEach((p) => { const m = /level(\d)/.exec(p.getAttribute('style') || ''); const ign = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]'); let ordered = false; if (ign) { ordered = /\d|[a-z][.)]/i.test(ign.textContent.trim()); ign.remove(); } const key = ordered ? '__ol' : '__ul'; if (!lists[key]) { lists[key] = TX.LIST_KINDS[ordered ? 'num' : 'puces'](); } p.setAttribute('data-li', JSON.stringify({ id: key, l: m ? Math.min(8, +m[1] - 1) : 0 })); });
    // images en data: → médias du document
    root.querySelectorAll('img').forEach((im) => {
      const src = im.getAttribute('src') || '';
      if (/^data:image\//.test(src)) { const b = O.dataURLToBlob(src); if (b) { const id = TX.uid('m'); media[id] = b; info[id] = { name: im.getAttribute('alt') || 'image', type: b.type }; im.setAttribute('data-m', id); im.removeAttribute('src'); } }
      if (!im.getAttribute('width') && im.style.width) im.setAttribute('width', parseFloat(im.style.width) * (/pt$/.test(im.style.width) ? 4 / 3 : 1));
      if (!im.getAttribute('height') && im.style.height) im.setAttribute('height', parseFloat(im.style.height) * (/pt$/.test(im.style.height) ? 4 / 3 : 1));
    });
    // classes Word de titres
    root.querySelectorAll('p.MsoTitle').forEach((p) => p.setAttribute('data-s', 'Titre'));
    root.querySelectorAll('p.MsoSubtitle').forEach((p) => p.setAttribute('data-s', 'SousTitre'));
    root.querySelectorAll('p.MsoQuote').forEach((p) => p.setAttribute('data-s', 'Citation'));
    // <hr> : saut de page s'il est marqué comme tel, sinon ligne (bordure basse)
    root.querySelectorAll('hr').forEach((h) => { if (/page-break/.test(h.getAttribute('style') || '') || h.classList.contains('tx-pbrk')) { const d = document.createElement('div'); d.className = 'tx-pbrk'; h.replaceWith(d); } else { const p = document.createElement('p'); p.setAttribute('data-hr', '1'); h.replaceWith(p); } });
    root.querySelectorAll('[style*="page-break-before: always"],[style*="page-break-before:always"],[style*="break-before: page"]').forEach((el) => { const d = document.createElement('div'); d.className = 'tx-pbrk'; el.parentNode.insertBefore(d, el); });
  }
  TX.prepHtml = prepHtml;
  IO.htmlToDoc = function (html, opt) {
    opt = opt || {};
    const parser = new window.DOMParser(); const d = parser.parseFromString(String(html), 'text/html');
    d.querySelectorAll('script,style,meta,link,noscript,template,iframe,object,embed').forEach((e) => e.remove());
    const lists = {}, media = {}, info = {};
    const root = d.body || d.documentElement;
    prepHtml(root, lists, media, info);
    // paragraphes à partir de data-li / data-hr (rendu par les règles du schéma)
    root.querySelectorAll('p[data-li]').forEach((p) => p.setAttribute('data-li', p.getAttribute('data-li')));
    const sec = TX.DOMParser.parse(root, { topNode: NT.section.create({ pg: TX.defaultPage() }), preserveWhitespace: false });
    let secJ = sec.toJSON();
    // attributs de liste et lignes horizontales (non lus par les règles génériques)
    const walk = (nodes, els) => nodes;
    void walk;
    const fixLists = (j) => { (j.content || []).forEach((c) => { fixLists(c); }); };
    fixLists(secJ);
    const title = (d.querySelector('title') || {}).textContent || '';
    return { json: IO.upgrade(TX.emptyDoc({ sections: [secJ], lists, props: { title: title.trim() } })), media, info, warnings: [] };
  };
  IO.fromHtml = function (html) { const r = IO.htmlToDoc(html); return r; };
  /** HTML autonome (styles, images intégrées, notes en fin de page) */
  IO.toHtml = async function (json, opt) {
    const doc = TX.schema.nodeFromJSON(json), num = TX.computeNumbers(doc, json.attrs);
    const theme = TX.themeOf(json.attrs.settings);
    const ctx = { props: () => json.attrs.props || {}, attrs: () => json.attrs, chartDoc: () => ({ theme }), noteLabel: (id, end) => String((end ? num.notes.end : num.notes.foot)[id] || '?'), fileName: () => (opt && opt.name) || 'document', seqAt: (pos) => num.seqPos[pos] || 1, mergeRecord: () => null, pageLabel: () => '' };
    const div = document.createElement('div'); div.className = 'tx-doc';
    doc.forEach((sec) => { const s = document.createElement('section'); s.appendChild(TX.DOMSerializer.serializeFragment(sec.content)); div.appendChild(s); });
    TX.fillStatic(div, ctx, null);
    // listes : étiquettes (les numéros sont calculés par l'éditeur) → texte en tête de paragraphe
    const ps = Array.from(div.querySelectorAll('p')); let pi = 0; const labels = num.labels.slice();
    doc.descendants((n, pos) => { if (n.type.name === 'paragraph') { const p = ps[pi++]; const l = labels.find((x) => x.pos === pos); if (p && l) { p.insertAdjacentHTML('afterbegin', '<span class="tx-lbl" style="display:inline-block;min-width:' + l.hg + 'pt">' + O.esc(l.label) + '</span>'); p.style.marginLeft = (n.attrs.il != null ? n.attrs.il : l.il) + 'pt'; p.style.textIndent = (n.attrs.fi != null ? n.attrs.fi : -l.hg) + 'pt'; } } return true; });
    // images en data:
    for (const im of Array.from(div.querySelectorAll('img'))) { const m = (im.closest('.tx-img') || im).getAttribute('data-m') || (TX.media.urls && Object.keys(TX.media.urls).find((k) => TX.media.urls[k] === im.getAttribute('src'))); if (m && TX.media.blobs[m]) im.src = await O.blobToDataURL(TX.media.blobs[m]); }
    // tables des matières : liens
    div.querySelectorAll('.tx-toc').forEach((t) => { const a = JSON.parse(t.getAttribute('data-toc') || '{}'); const ents = a.kind === 'tof' ? num.captions : num.heads.filter((h) => h.level <= (a.levels || 3)); t.innerHTML = (a.title ? '<h2>' + O.esc(a.title) + '</h2>' : '') + '<ul class="toc">' + ents.map((e) => '<li style="margin-left:' + ((e.level || 1) - 1) * 1.2 + 'em">' + O.esc((e.label ? e.label + ' ' : '') + e.text) + '</li>').join('') + '</ul>'; });
    // notes
    const notes = json.attrs.notes || {}; let foot = '';
    const ids = Object.keys(num.notes.foot).sort((a, b) => num.notes.foot[a] - num.notes.foot[b]).concat(Object.keys(num.notes.end).sort((a, b) => num.notes.end[a] - num.notes.end[b]));
    if (ids.length) { foot = '<hr><ol class="notes">' + ids.map((id) => { let h = ''; try { const nd = TX.schema.nodeFromJSON((notes[id] || {}).doc || B.part([B.p('NoteBas', '')])); const x = document.createElement('div'); x.appendChild(TX.DOMSerializer.serializeFragment(nd.firstChild.content)); TX.fillStatic(x, ctx, null); h = x.innerHTML; } catch (e) { } return '<li id="note-' + id + '">' + h + '</li>'; }).join('') + '</ol>'; }
    div.querySelectorAll('sup.tx-fn').forEach((s) => { s.innerHTML = '<a href="#note-' + s.getAttribute('data-id') + '">' + s.textContent + '</a>'; });
    // suppressions suivies : retirées ; insertions : gardées
    div.querySelectorAll('del.tx-del').forEach((e) => e.remove()); div.querySelectorAll('ins.tx-ins').forEach((e) => e.replaceWith(...Array.from(e.childNodes)));
    div.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
    const vars = O.Themes.varsCss(theme);
    const css = ':root{' + vars + '}body{margin:0;background:#f3f4f6}main{max-width:21cm;margin:24px auto;background:#fff;padding:2.5cm;box-shadow:0 2px 10px #0002}@media (max-width:800px){main{padding:18px;margin:0}}' + TX.styleSheet(json.attrs, '.tx-doc') + TX.TABLE_STYLES.map((s) => TX.tableStyleCss(s.id, '.tx-doc')).join('') + '.tx-doc table{border-collapse:collapse}.tx-doc td,.tx-doc th{padding:0 5.4pt;vertical-align:top}.tx-doc p{margin-top:0}.tx-doc img{max-width:100%}.tx-w-square.tx-al-left{float:left;margin:2pt 9pt 4pt 0}.tx-w-square.tx-al-right{float:right;margin:2pt 0 4pt 9pt}.tx-tab{display:inline-block;min-width:2em}.notes{font-size:10pt}';
    const title = (json.attrs.props || {}).title || (opt && opt.name) || 'Document';
    return '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + O.esc(title) + '</title>\n<meta name="generator" content="Texte (Suite MAG)">\n' + ((json.attrs.props || {}).author ? '<meta name="author" content="' + O.esc(json.attrs.props.author) + '">\n' : '') + '<style>' + css + '</style>\n</head>\n<body>\n<main class="tx-doc">\n' + div.innerHTML + foot + '\n</main>\n</body>\n</html>\n';
  };
  /** HTML collé : on garde la structure (titres, listes, tableaux, images intégrées) */
  TX.cleanPastedHtml = function (html) {
    html = String(html).replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '');
    const d = new window.DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    const lists = TX._pasteLists = {}, media = TX._pasteMedia = {}, info = {};
    prepHtml(d.body, lists, media, info);
    return d.body.innerHTML;
  };
  /** Après collage : listes et images du presse-papiers enregistrées dans le document */
  TX.fixPastedSlice = function (slice, ed) {
    const lists = TX._pasteLists || {}, media = TX._pasteMedia || {};
    TX._pasteLists = null; TX._pasteMedia = null;
    if (Object.keys(media).length) Object.assign(TX.media.blobs, media);
    if (Object.keys(lists).length && ed && ed.kind === 'main') { const A = window.TexteApp; setTimeout(() => { const cur = A.attrs().lists || {}; const add = {}; Object.keys(lists).forEach((k) => { if (!cur[k]) add[k] = lists[k]; }); if (Object.keys(add).length) A.setAttr('lists', Object.assign({}, cur, add)); }, 0); }
    return slice;
  };

  /* ---------------- Markdown ---------------- */
  IO.mdToHtml = function (md) {
    const esc = O.esc, lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    const inline = (s) => {
      const codes = []; s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
      s = esc(s).replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<img alt="$1" src="$2">').replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<a href="$2">$1</a>').replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, '<a href="$1">$1</a>')
        .replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>').replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<b>$2</b>').replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<i>$2</i>').replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<i>$2</i>').replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>').replace(/ {2,}$/, '<br>');
      return s.replace(/\u0000(\d+)\u0000/g, (m, i) => '<span data-cs="CodeCar">' + esc(codes[+i]) + '</span>');
    };
    let out = '', i = 0;
    const listStack = [];
    const closeLists = (lvl) => { while (listStack.length > lvl) out += '</' + listStack.pop().tag + '>'; };
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) { closeLists(0); const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out += buf.map((x) => '<pre>' + (esc(x) || ' ') + '</pre>').join(''); continue; }
      const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(l); if (h) { closeLists(0); out += '<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'; i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { closeLists(0); out += '<hr>'; i++; continue; }
      if (/^\s*>/.test(l)) { closeLists(0); const buf = []; while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, '')); out += '<blockquote>' + inline(buf.join(' ')) + '</blockquote>'; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        closeLists(0); const row = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
        const hd = row(l); i += 2; let t = '<table><thead><tr>' + hd.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        while (i < lines.length && /^\s*\|/.test(lines[i])) { t += '<tr>' + row(lines[i]).map((c) => '<td>' + c + '</td>').join('') + '</tr>'; i++; }
        out += t + '</tbody></table>'; continue;
      }
      const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
      if (li) {
        const lvl = Math.floor(li[1].replace(/\t/g, '    ').length / 2) + 1, tag = /\d/.test(li[2]) ? 'ol' : 'ul';
        while (listStack.length < lvl) { out += '<' + tag + '>'; listStack.push({ tag }); }
        closeLists(lvl);
        if (listStack[lvl - 1].tag !== tag) { out += '</' + listStack.pop().tag + '><' + tag + '>'; listStack.push({ tag }); }
        let txt = li[3]; const task = /^\[( |x|X)\]\s+(.*)$/.exec(txt); if (task) txt = (task[1] === ' ' ? '☐ ' : '☑ ') + task[2];
        out += '<li>' + inline(txt) + '</li>'; i++; continue;
      }
      if (!l.trim()) { closeLists(0); i++; continue; }
      closeLists(0);
      // paragraphe (lignes jointes) ; titre « souligné » (setext)
      const buf = [l]; i++;
      if (i < lines.length && /^=+\s*$/.test(lines[i])) { out += '<h1>' + inline(l) + '</h1>'; i++; continue; }
      if (i < lines.length && /^-+\s*$/.test(lines[i]) && l.trim()) { out += '<h2>' + inline(l) + '</h2>'; i++; continue; }
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+[.)])\s|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
      out += '<p>' + buf.map((x, k) => inline(k < buf.length - 1 && / {2,}$/.test(x) ? x : x.replace(/\s+$/, ''))).join(' ') + '</p>';
    }
    closeLists(0);
    return out;
  };
  IO.fromMarkdown = function (md) { const r = IO.htmlToDoc('<body>' + IO.mdToHtml(md) + '</body>'); return r; };
  IO.toMarkdown = async function (json) {
    const doc = TX.schema.nodeFromJSON(json), num = TX.computeNumbers(doc, json.attrs);
    const lbl = {}; num.labels.forEach((l) => { lbl[l.pos] = l; });
    const styles = json.attrs.styles || {};
    const out = [];
    const mdEsc = (s) => s.replace(/([\\`*_[\]#|])/g, '\\$1');
    const inline = async (n) => {
      let s = '';
      for (let k = 0; k < n.childCount; k++) {
        const c = n.child(k);
        if (c.isText) {
          if (c.marks.some((m) => m.type.name === 'del')) continue;
          let t = mdEsc(c.text); const has = (x) => c.marks.some((m) => m.type.name === x);
          const code = c.marks.some((m) => (m.type.name === 'cs' && /Code/.test(m.attrs.id)) || (m.type.name === 'font' && /Consolas|Courier|Mono/i.test(m.attrs.f)));
          if (code) t = '`' + c.text + '`';
          else { if (has('b')) t = '**' + t + '**'; if (has('i')) t = '*' + t + '*'; if (has('s')) t = '~~' + t + '~~'; }
          const ln = c.marks.find((m) => m.type.name === 'link'); if (ln) t = '[' + t + '](' + ln.attrs.href + ')';
          s += t;
        } else if (c.type.name === 'hard_break') s += '  \n';
        else if (c.type.name === 'tab') s += '\t';
        else if (c.type.name === 'image') { const b = TX.media.blobs[c.attrs.m]; s += '![' + (c.attrs.alt || '') + '](' + (b ? await O.blobToDataURL(b) : (c.attrs.src || '')) + ')'; }
        else if (c.type.name === 'fnref') s += '[^' + (c.attrs.end ? 'e' + num.notes.end[c.attrs.id] : num.notes.foot[c.attrs.id]) + ']';
        else if (c.type.name === 'math') s += '$' + c.attrs.tex + '$';
        else if (c.type.name === 'field') s += mdEsc(TX.fieldText(c.attrs, null, 0, null) || '');
      }
      return s;
    };
    let code = null;
    const flush = () => { if (code) { out.push('```', ...code, '```', ''); code = null; } };
    const blocks = []; doc.forEach((sec, off) => sec.forEach((b, o) => blocks.push([b, off + 1 + o])));
    for (const [b, pos] of blocks) {
      if (b.type.name === 'paragraph') {
        const s = b.attrs.s, lvl = TX.outlineLevel(styles, b);
        if (s === 'Code') { code = code || []; code.push(b.textContent); continue; }
        flush();
        const t = await inline(b), l = lbl[pos];
        if (s === 'Titre') out.push('# ' + t, '');
        else if (lvl > 0 && lvl <= 6) out.push('#'.repeat(lvl) + ' ' + t, '');
        else if (l) { out.push('  '.repeat(l.l) + (l.bullet ? '- ' : (l.label.replace(/[^\dA-Za-z.)]/g, '').replace(/\)$/, '.') || '1.') + ' ') + t); const next = blocks[blocks.indexOf(blocks.find((x) => x[1] === pos)) + 1]; if (!next || !lbl[next[1]]) out.push(''); }
        else if (/Citation/.test(s)) out.push('> ' + t, '');
        else if (b.attrs.bd && b.attrs.bd.b && !b.textContent.trim()) out.push('---', '');
        else out.push(t, '');
      } else if (b.type.name === 'table') {
        flush(); const rows = []; b.forEach((r) => { const cells = []; r.forEach((c) => { cells.push(TX.textOf(c).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()); for (let k = 1; k < c.attrs.colspan; k++) cells.push(''); }); rows.push(cells); });
        const w = Math.max(...rows.map((r) => r.length)); rows.forEach((r) => { while (r.length < w) r.push(''); });
        out.push('| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- |').join(''), ...rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |'), '');
      } else if (b.type.name === 'page_break') { flush(); out.push('---', ''); }
      else if (b.type.name === 'toc') { flush(); out.push(...num.heads.filter((h) => h.level <= (b.attrs.levels || 3)).map((h) => '  '.repeat(h.level - 1) + '- ' + h.text), ''); }
    }
    flush();
    const notes = json.attrs.notes || {};
    Object.keys(num.notes.foot).sort((a, b) => num.notes.foot[a] - num.notes.foot[b]).forEach((id) => { let t = ''; try { t = TX.textOf(TX.schema.nodeFromJSON(notes[id].doc)).trim(); } catch (e) { } out.push('[^' + num.notes.foot[id] + ']: ' + t); });
    Object.keys(num.notes.end).sort((a, b) => num.notes.end[a] - num.notes.end[b]).forEach((id) => { let t = ''; try { t = TX.textOf(TX.schema.nodeFromJSON(notes[id].doc)).trim(); } catch (e) { } out.push('[^e' + num.notes.end[id] + ']: ' + t); });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  };

  /* ---------------- RTF (ouverture) ---------------- */
  IO.fromRtf = function (rtf) {
    const media = {}, info = {}, lists = {}, warnings = [];
    const fonts = {}, colors = [null];
    const blocks = []; let para = null, runs = null;
    let tableRows = null, curRow = null, curCell = null, cellX = [];
    const stack = []; let st = { b: 0, i: 0, u: 0, s: 0, va: null, fs: 24, f: null, cf: 0, hl: 0, dest: 'body', uc: 1, skip: 0, al: null, li: 0, ri: 0, fi: 0, sb: 0, sa: 0, sl: 0, slm: 0, intbl: 0, ls: null, ilvl: 0, keepn: 0, page: 0 };
    let pict = null, fontName = '', colorBuf = { r: 0, g: 0, b: 0, any: false };
    const lsMap = {};
    const newPara = () => { para = { attrs: {}, content: [] }; runs = para.content; };
    newPara();
    const pushText = (t) => {
      if (st.dest !== 'body' && st.dest !== 'footnote' && st.dest !== 'header' && st.dest !== 'footer') { if (st.dest === 'fontname') fontName += t; return; }
      if (!t) return;
      const f = {}; if (st.b) f.b = 1; if (st.i) f.i = 1; if (st.u) f.u = 'single'; if (st.s) f.s = 1; if (st.va) f.va = st.va;
      if (st.fs !== 24) f.sz = st.fs / 2; if (st.f != null && fonts[st.f]) f.f = fonts[st.f]; if (st.cf && colors[st.cf]) f.c = colors[st.cf]; if (st.hl && colors[st.hl]) f.sh = colors[st.hl];
      runs.push(B.t(t, f));
    };
    const endPara = () => {
      const a = para.attrs = { s: 'Normal' };
      if (st.al) a.al = st.al; if (st.li) a.il = st.li / 20; if (st.ri) a.ir = st.ri / 20; if (st.fi) a.fi = st.fi / 20; a.sb = st.sb / 20; a.sa = st.sa / 20;
      if (st.sl) { if (st.slm) { a.ln = Math.abs(st.sl) / 240; a.lr = 'auto'; } else { a.ln = Math.abs(st.sl) / 20; a.lr = st.sl < 0 ? 'exact' : 'atLeast'; } }
      if (st.keepn) a.kn = true;
      if (st.ls != null) { if (!lsMap[st.ls]) { const id = TX.uid('L'); lists[id] = TX.LIST_KINDS[st._lsNum ? 'num' : 'puces'](); lsMap[st.ls] = id; } a.li = { id: lsMap[st.ls], l: st.ilvl || 0 }; a.s = 'ParagrapheListe'; }
      const p = { type: 'paragraph', attrs: a, content: runs.length ? mergeRuns(runs) : undefined };
      if (st.intbl && curCell) curCell.push(p);
      else { if (tableRows) flushTable(); blocks.push(p); }
      newPara();
    };
    const flushTable = () => { if (tableRows && tableRows.length) blocks.push(B.table(tableRows.map((r) => r.cells.map((c, k) => B.cell(c.length ? c : [B.p('Normal', '')], { colwidth: r.widths[k] ? [Math.round(r.widths[k] * TX.PX)] : null }))), { ts: 'Grille' })); tableRows = null; };
    let i = 0; const n = rtf.length;
    while (i < n) {
      const c = rtf[i];
      if (c === '{') { stack.push(Object.assign({}, st)); i++; continue; }
      if (c === '}') { if (st.dest === 'pict' && pict) { finishPict(); } if (st.dest === 'fontname' || st.dest === 'fonttbl') { const m = /^(\d+)/.exec(st._fid || ''); void m; } const prevDest = st.dest; st = stack.pop() || st; if (prevDest === 'fontentry' && st.dest === 'fonttbl') { } i++; continue; }
      if (c === '\\') {
        const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
        if (m) {
          i += m[0].length; const w = m[1], arg = m[2] != null ? +m[2] : null;
          if (st.skip && w !== 'bin') continue;
          if (st.dest === 'pict') { if (w === 'pngblip') pict.type = 'image/png'; else if (w === 'jpegblip') pict.type = 'image/jpeg'; else if (w === 'emfblip') pict.type = 'image/x-emf'; else if (w === 'wmetafile') { pict.type = 'image/x-wmf'; pict.wmf = true; } else if (w === 'picwgoal') pict.w = arg; else if (w === 'pichgoal') pict.h = arg; else if (w === 'picscalex') pict.sx = arg; else if (w === 'picscaley') pict.sy = arg; continue; }
          switch (w) {
            case 'fonttbl': st.dest = 'fonttbl'; break;
            case 'colortbl': st.dest = 'colortbl'; colorBuf = { r: 0, g: 0, b: 0, any: false }; break;
            case 'stylesheet': case 'info': case 'listtable': case 'listoverridetable': case 'generator': case 'xmlnstbl': case 'rsidtbl': case 'themedata': case 'colorschememapping': case 'latentstyles': case 'datastore': case 'mmathPr': case 'pgdsctbl': st.dest = 'skip'; st.skip = 1; break;
            case 'pict': st.dest = 'pict'; pict = { hex: [], type: null, w: 0, h: 0, sx: 100, sy: 100 }; break;
            case 'shppict': break;
            case 'nonshppict': st.skip = 1; break;
            case 'listtext': case 'pntext': st.dest = 'skip'; st.skip = 1; st._lsNumPeek = true; break;
            case 'header': case 'headerl': case 'headerr': case 'headerf': case 'footer': case 'footerl': case 'footerr': case 'footerf': st.skip = 1; warnings.indexOf('En-têtes RTF non importés') < 0 && warnings.push('En-têtes RTF non importés'); break;
            case 'footnote': st.skip = 1; break;
            case 'fldinst': st.skip = 1; break;
            case 'f': if (st.dest === 'fonttbl') { st._fid = arg; fontName = ''; st.dest = 'fontentry'; } else st.f = arg; break;
            case 'red': colorBuf.r = arg; colorBuf.any = true; break; case 'green': colorBuf.g = arg; colorBuf.any = true; break; case 'blue': colorBuf.b = arg; colorBuf.any = true; break;
            case 'par': endPara(); break;
            case 'line': runs.push({ type: 'hard_break' }); break;
            case 'tab': runs.push({ type: 'tab' }); break;
            case 'page': endPara(); blocks.push(B.pageBreak()); break;
            case 'pard': Object.assign(st, { al: null, li: 0, ri: 0, fi: 0, sb: 0, sa: 0, sl: 0, slm: 0, intbl: 0, ls: null, ilvl: 0, keepn: 0 }); break;
            case 'plain': Object.assign(st, { b: 0, i: 0, u: 0, s: 0, va: null, fs: 24, f: null, cf: 0, hl: 0 }); break;
            case 'b': st.b = arg === 0 ? 0 : 1; break; case 'i': st.i = arg === 0 ? 0 : 1; break;
            case 'ul': st.u = arg === 0 ? 0 : 1; break; case 'ulnone': st.u = 0; break; case 'strike': st.s = arg === 0 ? 0 : 1; break;
            case 'super': st.va = 'sup'; break; case 'sub': st.va = 'sub'; break; case 'nosupersub': st.va = null; break;
            case 'fs': st.fs = arg; break; case 'cf': st.cf = arg; break; case 'highlight': case 'cb': case 'chcbpat': st.hl = arg; break;
            case 'ql': st.al = null; break; case 'qc': st.al = 'center'; break; case 'qr': st.al = 'right'; break; case 'qj': st.al = 'justify'; break;
            case 'li': st.li = arg; break; case 'ri': st.ri = arg; break; case 'fi': st.fi = arg; break; case 'sb': st.sb = arg; break; case 'sa': st.sa = arg; break;
            case 'sl': st.sl = arg; break; case 'slmult': st.slm = arg; break; case 'keepn': st.keepn = 1; break;
            case 'ls': st.ls = arg; break; case 'ilvl': st.ilvl = arg; break;
            case 'intbl': st.intbl = 1; if (!tableRows) tableRows = []; if (!curRow) { curRow = { cells: [], widths: [] }; curCell = []; } break;
            case 'trowd': curRow = { cells: [], widths: [] }; curCell = []; cellX = []; if (!tableRows) tableRows = []; break;
            case 'cellx': cellX.push(arg); break;
            case 'cell': if (runs.length || para.content.length) endPara(); if (curRow) { curRow.cells.push(curCell || []); curCell = []; } break;
            case 'row': if (curRow) { curRow.widths = cellX.map((x, k) => (x - (k ? cellX[k - 1] : 0)) / 20); tableRows = tableRows || []; tableRows.push(curRow); } curRow = null; curCell = null; break;
            case 'uc': st.uc = arg; break;
            case 'u': { pushText(String.fromCharCode(arg < 0 ? arg + 65536 : arg)); let sk = st.uc; while (sk > 0 && i < n) { if (rtf[i] === '\\' && rtf[i + 1] === "'") { i += 4; } else if (rtf[i] === '\\' || rtf[i] === '{' || rtf[i] === '}') break; else i++; sk--; } break; }
            case 'emdash': pushText('—'); break; case 'endash': pushText('–'); break; case 'bullet': pushText('•'); break;
            case 'lquote': pushText('‘'); break; case 'rquote': pushText('’'); break; case 'ldblquote': pushText('“'); break; case 'rdblquote': pushText('”'); break;
            case 'bin': i += arg || 0; break;
            default: break;
          }
          continue;
        }
        const nx = rtf[i + 1];
        if (nx === "'") { const hex = rtf.substr(i + 2, 2); i += 4; if (!st.skip) pushText(new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(hex, 16)]))); continue; }
        if (nx === '*') { st.skip = 1; st.dest = 'skip'; i += 2; continue; }
        if (nx === '~') { pushText(' '); i += 2; continue; }
        if (nx === '-') { i += 2; continue; }
        if (nx === '_') { pushText('‑'); i += 2; continue; }
        if (nx === '\\' || nx === '{' || nx === '}') { pushText(nx); i += 2; continue; }
        if (nx === '\n' || nx === '\r') { endPara(); i += 2; continue; }
        i += 2; continue;
      }
      if (c === '\r' || c === '\n') { i++; continue; }
      // texte
      let j = i; while (j < n && !/[\\{}\r\n]/.test(rtf[j])) j++;
      const txt = rtf.slice(i, j); i = j;
      if (st.skip) continue;
      if (st.dest === 'pict') { pict.hex.push(txt); continue; }
      if (st.dest === 'fontentry') { fontName += txt; if (/;/.test(fontName)) { fonts[st._fid] = fontName.replace(/;.*$/, '').trim(); fontName = ''; } continue; }
      if (st.dest === 'colortbl') { for (const ch of txt) if (ch === ';') { colors.push(colorBuf.any ? O.rgbToHex(colorBuf.r, colorBuf.g, colorBuf.b) : null); colorBuf = { r: 0, g: 0, b: 0, any: false }; } continue; }
      if (st.dest === 'fonttbl') continue;
      pushText(txt);
    }
    function finishPict() {
      if (!pict.type) { warnings.indexOf('Certaines images du RTF sont dans un format non pris en charge') < 0 && warnings.push('Certaines images du RTF sont dans un format non pris en charge'); pict = null; return; }
      const hex = pict.hex.join('').replace(/\s+/g, ''); let u = new Uint8Array(hex.length / 2); for (let k = 0; k < u.length; k++) u[k] = parseInt(hex.substr(k * 2, 2), 16);
      // \\wmetafile : WMF sans en-tête « placeable » → en-tête ajouté (taille d'après picwgoal/pichgoal) pour que Word et LibreOffice le relisent
      if (pict.wmf && !(u[0] === 0xD7 && u[1] === 0xCD)) { const W = Math.round((pict.w || 1440) * 1440 / 1440), H = Math.round((pict.h || 1440)); const hd = new Uint8Array(22); const dv = new DataView(hd.buffer); dv.setUint32(0, 0x9AC6CDD7, true); dv.setInt16(10, W, true); dv.setInt16(12, H, true); dv.setUint16(14, 1440, true); let x = 0; for (let k = 0; k < 10; k++) x ^= dv.getUint16(k * 2, true); dv.setUint16(20, x, true); const v = new Uint8Array(22 + u.length); v.set(hd); v.set(u, 22); u = v; }
      if (O.unviewableImage(pict.type) && warnings.indexOf('Images EMF/WMF : montrées par un cadre, gardées telles quelles à l\'enregistrement .docx') < 0) warnings.push('Images EMF/WMF : montrées par un cadre, gardées telles quelles à l\'enregistrement .docx');
      const id = TX.uid('m'); media[id] = new Blob([u], { type: pict.type }); info[id] = { name: 'image', type: pict.type };
      const w = (pict.w || 2880) / 20 * (pict.sx || 100) / 100, h = (pict.h || 2160) / 20 * (pict.sy || 100) / 100;
      runs.push(B.image(id, Math.round(w * 10) / 10, Math.round(h * 10) / 10));
      pict = null;
    }
    if (runs.length) endPara();
    if (tableRows) flushTable();
    return { json: IO.upgrade(TX.emptyDoc({ content: blocks.length ? blocks : [B.p('Normal', '')], lists })), media, info, warnings };
  };
  /** Fusion des passages de texte voisins de même mise en forme */
  function mergeRuns(runs) {
    const out = [];
    runs.forEach((r) => { const p = out[out.length - 1]; if (p && p.type === 'text' && r.type === 'text' && JSON.stringify(p.marks || null) === JSON.stringify(r.marks || null)) p.text += r.text; else out.push(Object.assign({}, r)); });
    return out.filter((r) => r.type !== 'text' || r.text);
  }
  IO.mergeRuns = mergeRuns;

  /* ---------------- comparer deux versions ---------------- */
  /** Document « révisé » : les différences entre ancien et nouveau sont marquées (insertions / suppressions) */
  TX.compareDocs = function (oldJ, newJ, author) {
    const date = new Date().toISOString().slice(0, 19) + 'Z';
    const insM = () => ({ type: 'ins', attrs: { id: TX.uid('c'), a: author, d: date } }), delM = () => ({ type: 'del', attrs: { id: TX.uid('c'), a: author, d: date } });
    const flat = (j) => { const l = []; (j.content || []).forEach((s) => (s.content || []).forEach((b) => l.push(b))); return l; };
    const sig = (b) => JSON.stringify(b.type === 'paragraph' ? [b.attrs.s, (b.content || []).map((c) => c.text || c.type)] : b);
    const textSig = (b) => b.type === 'paragraph' ? (b.content || []).map((c) => c.text || '').join('') : JSON.stringify(b);
    const ob = flat(oldJ), nb = flat(newJ);
    const os = ob.map(sig), ns = nb.map(sig);
    const pairs = lcs(os, ns);
    const out = [];
    const markAll = (b, mk) => { const c = O.clone(b); (function walk(x) { (x.content || []).forEach((y) => { if (y.type === 'text' || /^(image|drawing|field|math|fnref|tab|hard_break|bookmark)$/.test(y.type)) { if (y.type !== 'hard_break' && y.type !== 'bookmark') y.marks = (y.marks || []).filter((m) => m.type !== 'ins' && m.type !== 'del').concat([mk]); } else walk(y); }); })({ content: [c] }); return c; };
    let oi = 0, ni = 0;
    const emitGap = (oEnd, nEnd) => {
      const oldG = ob.slice(oi, oEnd), newG = nb.slice(ni, nEnd);
      const k = Math.min(oldG.length, newG.length);
      for (let x = 0; x < Math.max(oldG.length, newG.length); x++) {
        const a = oldG[x], b = newG[x];
        if (a && b && a.type === 'paragraph' && b.type === 'paragraph' && similar(textSig(a), textSig(b)) > 0.3) out.push(diffPara(a, b, insM, delM));
        else { if (a) out.push(markAll(a, delM())); if (b) out.push(markAll(b, insM())); }
      }
      void k; oi = oEnd; ni = nEnd;
    };
    pairs.forEach(([a, b]) => { emitGap(a, b); out.push(O.clone(nb[b])); oi = a + 1; ni = b + 1; });
    emitGap(ob.length, nb.length);
    const res = O.clone(newJ);
    res.content = [Object.assign({}, newJ.content[0], { content: out.length ? out : [B.p('Normal', '')] })];
    // les sections suivantes : conservées telles quelles dans la première (la mise en page de l'original révisé reste)
    return IO.upgrade(res);
  };
  function similar(a, b) { if (!a && !b) return 1; const wa = new Set(a.toLowerCase().split(/\s+/)), wb = b.toLowerCase().split(/\s+/); let c = 0; wb.forEach((w) => { if (wa.has(w)) c++; }); return c / Math.max(wa.size, wb.length, 1); }
  function lcs(a, b) {
    const n = a.length, m = b.length;
    if (n * m > 4e6) { const out = []; let j = 0; for (let i = 0; i < n && j < m; i++) { const k = b.indexOf(a[i], j); if (k >= 0 && k - j < 50) { out.push([i, k]); j = k + 1; } } return out; }
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0; while (i < n && j < m) { if (a[i] === b[j]) { out.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
    return out;
  }
  /** Différence mot à mot de deux paragraphes */
  function diffPara(a, b, insM, delM) {
    const toks = (p) => { const l = []; (p.content || []).forEach((c) => { if (c.type === 'text') c.text.split(/(\s+|[.,;:!?«»()])/).filter(Boolean).forEach((t) => l.push({ t, n: Object.assign({}, c, { text: t }) })); else l.push({ t: '\u0001' + c.type + JSON.stringify(c.attrs || {}), n: c }); }); return l; };
    const ta = toks(a), tb = toks(b);
    const pairs = lcs(ta.map((x) => x.t), tb.map((x) => x.t));
    const out = []; let i = 0, j = 0;
    const mk = (n, m) => { const c = O.clone(n); if (c.type !== 'hard_break') c.marks = (c.marks || []).filter((x) => x.type !== 'ins' && x.type !== 'del').concat([m]); return c; };
    const gap = (ie, je) => { if (i < ie) { const m = delM(); while (i < ie) out.push(mk(ta[i++].n, m)); } if (j < je) { const m = insM(); while (j < je) out.push(mk(tb[j++].n, m)); } };
    pairs.forEach(([x, y]) => { gap(x, y); out.push(O.clone(tb[y].n)); i = x + 1; j = y + 1; });
    gap(ta.length, tb.length);
    return Object.assign({}, b, { content: mergeRuns(out) });
  }
})();
