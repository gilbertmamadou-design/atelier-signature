/* Texte — format OpenDocument texte (.odt), écrit et lu directement (JSZip) : styles nommés et automatiques, listes
   imbriquées, tableaux (fusions), images, notes, commentaires, révisions, champs, liens, signets, table des matières,
   sections (pages maîtresses : format, orientation, marges, en-têtes et pieds, colonnes).
   TX.Odt.write(json, opt) → {blob, warn} ; TX.Odt.read(zip) → {json, media, info, warnings}. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte;
  const B = TX.B;
  const D = TX.Odt = {};
  const r2 = (v) => Math.round(v * 100) / 100;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  const XML = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0" office:version="1.3"';
  const ODF_NAMES = { Normal: 'Standard', Titre1: 'Heading 1', Titre2: 'Heading 2', Titre3: 'Heading 3', Titre4: 'Heading 4', Titre5: 'Heading 5', Titre6: 'Heading 6', Titre: 'Title', SousTitre: 'Subtitle', Citation: 'Quotations', Legende: 'Caption', NoteBas: 'Footnote', NoteFin: 'Endnote', EnTete: 'Header', PiedPage: 'Footer', TitreTM: 'Contents Heading', TM1: 'Contents 1', TM2: 'Contents 2', TM3: 'Contents 3', TM4: 'Contents 4', TM5: 'Contents 5', TM6: 'Contents 6', Code: 'Preformatted Text', TableIllustrations: 'Figure Index 1', Forte: 'Strong Emphasis', Accentuation: 'Emphasis', LienHypertexte: 'Internet link', ParagrapheListe: 'List Paragraph', SansInterligne: 'No Spacing' };
  const FROM_ODF = {}; Object.keys(ODF_NAMES).forEach((k) => { FROM_ODF[ODF_NAMES[k].toLowerCase()] = k; FROM_ODF[ODF_NAMES[k].replace(/ /g, '_20_').toLowerCase()] = k; });
  Object.assign(FROM_ODF, { 'text body': 'Normal', text_20_body: 'Normal', default: 'Normal', 'default paragraph style': 'Normal', heading: 'Titre1', quotations: 'Citation', quote: 'Citation', illustration: 'Legende', figure: 'Legende', table: 'Legende', drawing: 'Legende', 'list contents': 'ParagrapheListe', list: 'ParagrapheListe', 'source text': 'CodeCar', source_20_text: 'CodeCar', 'strong emphasis': 'Forte', strong_20_emphasis: 'Forte', 'internet link': 'LienHypertexte', internet_20_link: 'LienHypertexte', 'heading 7': 'Titre6', 'heading 8': 'Titre6', 'heading 9': 'Titre6', 'heading 10': 'Titre6' });
  const sname = (id) => (ODF_NAMES[id] || id).replace(/ /g, '_20_');
  const pt = (v) => r2(v || 0) + 'pt';
  const cm = (v) => r2(TX.pt2cm(v || 0)) + 'cm';
  const BST = { single: 'solid', thick: 'solid', double: 'double', dotted: 'dotted', dashed: 'dashed' };
  const bcss = (b, theme) => !b || !b.s || b.s === 'none' ? 'none' : r2(b.s === 'double' ? Math.max(2.25, b.w || 0.5) : (b.w || 0.5)) + 'pt ' + (BST[b.s] || 'solid') + ' ' + hex(b.c || '#000000', theme);
  const hex = (c, theme) => (O.Themes.resolve(c || '#000000', theme) || '#000000').toUpperCase();
  const FMT = { decimal: '1', lowerLetter: 'a', upperLetter: 'A', lowerRoman: 'i', upperRoman: 'I', decimalZero: '1', ordinal: '1', none: '' };

  /* ---------------- propriétés → styles ODF ---------------- */
  function textProps(r, theme) {
    let s = '';
    const f = r.f === '+major' ? theme.fonts.major : r.f === '+minor' ? theme.fonts.minor : r.f;
    if (f) s += ' style:font-name="' + esc(f) + '" fo:font-family="\'' + esc(f) + '\'"';
    if (r.sz) s += ' fo:font-size="' + pt(r.sz) + '" style:font-size-asian="' + pt(r.sz) + '" style:font-size-complex="' + pt(r.sz) + '"';
    if (r.b != null) s += ' fo:font-weight="' + (r.b ? 'bold' : 'normal') + '" style:font-weight-asian="' + (r.b ? 'bold' : 'normal') + '" style:font-weight-complex="' + (r.b ? 'bold' : 'normal') + '"';
    if (r.i != null) s += ' fo:font-style="' + (r.i ? 'italic' : 'normal') + '" style:font-style-asian="' + (r.i ? 'italic' : 'normal') + '"';
    if (r.c) s += ' fo:color="' + hex(r.c, theme) + '"';
    if (r.u) s += ' style:text-underline-style="' + ({ dotted: 'dotted', dash: 'dash', dotDash: 'dot-dash', wave: 'wave' }[r.u] || 'solid') + '" style:text-underline-width="' + (r.u === 'thick' ? 'bold' : 'auto') + '" style:text-underline-color="' + (r.uc ? hex(r.uc, theme) : 'font-color') + '"' + (r.u === 'double' ? ' style:text-underline-type="double"' : '') + (r.u === 'words' ? ' style:text-underline-mode="skip-white-space"' : '');
    if (r.s) s += ' style:text-line-through-style="solid"' + (r.dbl ? ' style:text-line-through-type="double"' : '');
    if (r.va) s += ' style:text-position="' + (r.va === 'sub' ? 'sub' : 'super') + ' 58%"';
    else if (r.pos) s += ' style:text-position="' + Math.round(r.pos / (r.sz || 11) * 100) + '% 100%"';
    if (r.caps) s += ' fo:text-transform="uppercase"'; if (r.smcaps) s += ' fo:font-variant="small-caps"';
    if (r.sp) s += ' fo:letter-spacing="' + pt(r.sp) + '"';
    const bg = r.sh || (r.hl ? (TX.HL[r.hl] || r.hl) : null); if (bg) s += ' fo:background-color="' + hex(bg, theme) + '"';
    if (r.hidden) s += ' text:display="none"';
    return s ? '<style:text-properties' + s + '/>' : '';
  }
  function paraProps(p, theme, extra) {
    let s = '', inner = '';
    if (p.al) s += ' fo:text-align="' + ({ left: 'start', center: 'center', right: 'end', justify: 'justify', distribute: 'justify' }[p.al] || 'start') + '"';
    if (p.il != null) s += ' fo:margin-left="' + pt(p.il) + '"';
    if (p.ir != null) s += ' fo:margin-right="' + pt(p.ir) + '"';
    if (p.fi != null) s += ' fo:text-indent="' + pt(p.fi) + '"';
    if (p.sb != null) s += ' fo:margin-top="' + pt(p.sb) + '"';
    if (p.sa != null) s += ' fo:margin-bottom="' + pt(p.sa) + '"';
    if (p.ln != null) { const lr = p.lr || 'auto'; s += lr === 'auto' ? ' fo:line-height="' + Math.round(p.ln * 100) + '%"' : lr === 'exact' ? ' fo:line-height="' + pt(p.ln) + '"' : ' style:line-height-at-least="' + pt(p.ln) + '"'; }
    if (p.kn) s += ' fo:keep-with-next="always"'; if (p.kl) s += ' fo:keep-together="always"';
    if (p.pb) s += ' fo:break-before="page"';
    if (p.ctx) s += ' style:contextual-spacing="true"';
    if (p.wc === false || p.wc === 0) s += ' fo:widows="0" fo:orphans="0"'; else if (p.wc) s += ' fo:widows="2" fo:orphans="2"';
    if (p.sh) s += ' fo:background-color="' + hex(p.sh, theme) + '"';
    if (p.bd) ['t', 'b', 'l', 'r'].forEach((k) => { const b = p.bd[k]; if (!b) return; const side = { t: 'top', b: 'bottom', l: 'left', r: 'right' }[k]; s += ' fo:border-' + side + '="' + bcss(b, theme) + '" fo:padding-' + side + '="' + pt(b.sp == null ? (k === 'l' || k === 'r' ? 4 : 1) : b.sp) + '"'; });
    if (p.ol != null) s += '';
    if (extra) s += extra;
    if (p.tabs && p.tabs.length) inner = '<style:tab-stops>' + p.tabs.filter((t) => t.t !== 'clear').map((t) => '<style:tab-stop style:position="' + pt(t.pos) + '"' + (t.t && t.t !== 'left' ? ' style:type="' + ({ center: 'center', right: 'right', decimal: 'char' }[t.t] || 'left') + '"' + (t.t === 'decimal' ? ' style:char=","' : '') : '') + (t.lead && t.lead !== 'none' ? ' style:leader-style="' + ({ dot: 'dotted', hyphen: 'dash', underscore: 'solid' }[t.lead] || 'dotted') + '" style:leader-text="' + ({ dot: '.', hyphen: '-', underscore: '_' }[t.lead] || '.') + '"' : '') + '/>').join('') + '</style:tab-stops>';
    return (s || inner) ? '<style:paragraph-properties' + s + (inner ? '>' + inner + '</style:paragraph-properties>' : '/>') : '';
  }
  function marksR(marks) {
    const r = {}; const o = { r, link: null, ins: null, del: null, cmts: [] };
    (marks || []).forEach((m) => {
      const a = m.attrs || {}, t = m.type.name || m.type;
      switch (t) {
        case 'font': r.f = a.f; break; case 'size': r.sz = a.pt; break; case 'color': r.c = a.c; break; case 'hl': r.hl = a.c; break; case 'shd': r.sh = a.c; break;
        case 'b': r.b = 1; break; case 'nob': r.b = 0; break; case 'i': r.i = 1; break; case 'noi': r.i = 0; break;
        case 'u': r.u = a.s || 'single'; r.uc = a.c; break; case 's': r.s = 1; r.dbl = a.dbl; break; case 'va': r.va = a.v; break;
        case 'caps': r.caps = 1; break; case 'smcaps': r.smcaps = 1; break; case 'sp': r.sp = a.pt; break; case 'pos': r.pos = a.pt; break; case 'hidden': r.hidden = 1; break;
        case 'cs': r.cs = a.id; break; case 'link': o.link = a.href; break; case 'ins': o.ins = a; break; case 'del': o.del = a; break; case 'cmt': o.cmts.push(a.id); break;
      }
    });
    return o;
  }
  /** Bordures / fonds / gras d'une cellule selon le style de tableau (les styles de tableau n'existent pas en ODF) */
  function cellLook(ts, ri, ci, nr, nc, look, theme) {
    look = look || { hdr: true, band: true };
    const st = TX.TABLE_STYLES.find((x) => x.id === ts) || { id: ts };
    const A = 't:accent' + (st.accent || 1), out = { bd: null, bg: null, b: false, c: null };
    const all = (c, w) => { const b = { s: 'single', w: w || 0.5, c }; out.bd = { t: b, b, l: b, r: b }; };
    const hdr = look.hdr && ri === 0, last = look.lr && ri === nr - 1, first = look.fc && ci === 0;
    if (ts === 'Grille' || (!st.kind && !/^(Aucun|GrilleClaire|Simple)$/.test(ts))) all('#000000');
    else if (ts === 'Aucun') out.bd = null;
    else if (ts === 'GrilleClaire') all('#BFBFBF');
    else if (ts === 'Simple') { out.bd = { b: { s: 'single', w: 0.5, c: '#7F7F7F' } }; if (ri === 0) { out.bd.t = { s: 'single', w: 1, c: '#7F7F7F' }; out.b = true; } }
    else if (st.kind === 'clair') { out.bd = { b: { s: 'single', w: hdr ? 1.5 : 0.5, c: A } }; if (ri === 0) out.bd.t = { s: 'single', w: 0.5, c: A }; if (hdr) { out.b = true; out.c = A + '/-25'; } else if (look.band && ri % 2 === (look.hdr ? 0 : 1)) out.bg = A + '/+80'; }
    else if (st.kind === 'moyen') { all(A + '/+60'); if (hdr) { out.bg = A; out.c = 't:bg1'; out.b = true; } else if (look.band && ri % 2 === (look.hdr ? 1 : 0) - 0) out.bg = A + '/+80'; }
    else if (st.kind === 'grille') { all(A); if (hdr) { out.bg = A + '/+80'; out.b = true; } }
    else if (st.kind === 'fonce') { all('t:bg1'); out.bg = A; out.c = 't:bg1'; if (hdr) { out.bg = A + '/-25'; out.b = true; } else if (look.band && ri % 2 === (look.hdr ? 0 : 1)) { out.bg = A + '/+60'; out.c = 't:tx1'; } }
    if (last || first) out.b = true;
    void nc; void theme;
    return out;
  }

  /* ---------------- écriture ---------------- */
  D.write = async function (json, opt) {
    opt = opt || {};
    const warn = new Set();
    const attrs = json.attrs || {};
    const styles = attrs.styles || TX.defaultStyles(), lists = attrs.lists || {}, settings = Object.assign(TX.defaultSettings(), attrs.settings || {});
    const theme = TX.themeOf(settings), props = Object.assign(TX.defaultProps(), attrs.props || {});
    const docNode = TX.schema.nodeFromJSON(json);
    const nums = TX.computeNumbers(docNode, attrs);
    const app = opt.app; const isCurrent = app && app.ed && app.ed.view.state.doc.eq(docNode);
    const ctx = isCurrent ? app.ctx : { props: () => props, attrs: () => attrs, chartDoc: () => ({ theme }), noteLabel: () => '', fileName: () => opt.name || 'document', seqAt: (pos) => nums.seqPos[pos] || 1, mergeRecord: () => opt.record || null, pageLabel: () => '', pageCount: () => 1, wordCount: () => 0, refText: (a) => a.cache || '', tocEntries: (a) => nums.heads.filter((h) => h.level <= (a.levels || 3)).map((h) => ({ text: (h.label ? h.label + ' ' : '') + h.text, level: h.level, page: '' })) };
    const z = new window.JSZip();
    z.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
    const manifest = ['<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>'];
    const fonts = new Set([theme.fonts.major, theme.fonts.minor]);
    /* styles automatiques */
    const auto = { P: new Map(), T: new Map(), other: [] }; let tableN = 0, frN = 0, imgN = 0, chN = 0, sectN = 0;
    const autoStyle = (map, prefix, family, xml, parent) => { const key = (parent || '') + '|' + xml; if (map.has(key)) return map.get(key).name; const name = prefix + (map.size + 1); map.set(key, { name, xml: '<style:style style:name="' + name + '" style:family="' + family + '"' + (parent ? ' style:parent-style-name="' + esc(parent) + '"' : '') + '>' + xml + '</style:style>' }); return name; };
    const changes = [];
    const media = new Map();
    async function picture(key, getBlob) {
      if (media.has(key)) return media.get(key);
      let blob = await getBlob(); if (!blob) return null;
      let ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'png', 'image/bmp': 'bmp' }[blob.type] || 'png';
      if (blob.type === 'image/webp') { try { const u = URL.createObjectURL(blob); const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); blob = await new Promise((ok) => c.toBlob(ok, 'image/png')); URL.revokeObjectURL(u); } catch (e) { return null; } }
      const path = 'Pictures/image' + (++imgN) + '.' + ext; z.file(path, blob); manifest.push('<manifest:file-entry manifest:full-path="' + path + '" manifest:media-type="' + (ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/' + ext) + '"/>');
      media.set(key, path); return path;
    }
    const comments = attrs.comments || {};
    const spaces = (t) => esc(t).replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>').replace(/^ /, '<text:s/>');
    function frameXml(a, path, w, h, name) {
      const wrapFloat = a.wrap && a.wrap !== 'inline';
      const fs = autoStyle(auto.T.fr || (auto.T.fr = new Map()), 'fr', 'graphic', '<style:graphic-properties' + (wrapFloat ? ' style:wrap="' + ({ square: 'parallel', tight: 'parallel', topBottom: 'none', behind: 'run-through', front: 'run-through' }[a.wrap] || 'parallel') + '"' + (a.wrap === 'behind' ? ' style:run-through="background"' : '') + ' style:horizontal-pos="' + (a.al === 'center' ? 'center' : a.al === 'right' ? 'right' : a.x ? 'from-left' : 'left') + '" style:horizontal-rel="paragraph" style:vertical-pos="from-top" style:vertical-rel="paragraph" fo:margin-left="0.2cm" fo:margin-right="0.2cm"' : ' style:vertical-pos="top" style:vertical-rel="baseline"') + (a.bd && a.bd.s && a.bd.s !== 'none' ? ' fo:border="' + bcss(a.bd, theme) + '"' : ' fo:border="none"') + (a.fh || a.fv ? ' style:mirror="' + (a.fh && a.fv ? 'horizontal vertical' : a.fh ? 'horizontal' : 'vertical') + '"' : '') + (a.crop && (a.crop.l || a.crop.t || a.crop.r || a.crop.b) ? ' fo:clip="rect(' + ['t', 'r', 'b', 'l'].map((k) => r2((a.crop[k] || 0) * ((k === 't' || k === 'b') ? h / (1 - (a.crop.t || 0) - (a.crop.b || 0)) : w / (1 - (a.crop.l || 0) - (a.crop.r || 0))) / 72 * 2.54) + 'cm').join(', ') + ')"' : '') + '/>', 'Graphics');
      const id = ++frN;
      return '<draw:frame draw:style-name="' + fs + '" draw:name="' + esc(name || 'Image') + ' ' + id + '" text:anchor-type="' + (wrapFloat ? 'paragraph' : 'as-char') + '"' + (wrapFloat ? ' svg:x="' + pt(a.x || 0) + '" svg:y="' + pt(a.y || 0) + '"' : '') + ' svg:width="' + pt(w) + '" svg:height="' + pt(h) + '" draw:z-index="' + (a.wrap === 'behind' ? 0 : id) + '"' + (a.rot ? ' draw:transform="rotate(' + r2(-a.rot * Math.PI / 180) + ')"' : '') + '><draw:image xlink:href="' + path + '" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>' + (a.alt ? '<svg:title>' + esc(a.alt) + '</svg:title><svg:desc>' + esc(a.alt) + '</svg:desc>' : '') + '</draw:frame>';
    }
    async function inl(par, state) {
      let out = ''; const children = []; par.forEach((c, off) => children.push({ c, off }));
      let linkOpen = null;
      for (const { c: n, off } of children) {
        const mk = marksR(n.marks);
        // commentaires
        const now = new Set(mk.cmts);
        state.open.forEach((id) => { if (!now.has(id)) { if (linkOpen) { out += '</text:a>'; linkOpen = null; } out += '<office:annotation-end office:name="' + id + '"/>'; state.open.delete(id); } });
        mk.cmts.forEach((id) => { if (!state.open.has(id) && comments[id]) { if (linkOpen) { out += '</text:a>'; linkOpen = null; } out += annot(id, true); state.open.add(id); } });
        if (linkOpen !== mk.link) { if (linkOpen) out += '</text:a>'; linkOpen = null; if (mk.link) { out += '<text:a xlink:type="simple" xlink:href="' + esc(mk.link) + '">'; linkOpen = mk.link; } }
        const tprops = textProps(Object.assign({}, mk.r, { cs: undefined }), theme);
        const span = (x) => { if (!x) return ''; const nm = tprops || mk.r.cs ? autoStyle(auto.T, 'T', 'text', tprops, mk.r.cs ? sname(mk.r.cs) : null) : null; return nm ? '<text:span text:style-name="' + nm + '">' + x + '</text:span>' : x; };
        let x = '';
        const t = n.type.name;
        if (n.isText) x = span(spaces(n.text));
        else if (t === 'tab') x = '<text:tab/>';
        else if (t === 'hard_break') x = '<text:line-break/>';
        else if (t === 'bookmark') x = '<text:bookmark text:name="' + esc(n.attrs.name) + '"/>';
        else if (t === 'field') x = span(fieldXml(n.attrs, state, off));
        else if (t === 'fnref') {
          const a = n.attrs, end = !!a.end; const nd = (attrs.notes || {})[a.id]; let body = '<text:p/>';
          try { const nn = TX.schema.nodeFromJSON((nd && nd.doc) || B.part([B.p('NoteBas', '')])); body = await blocks(nn.firstChild, Object.assign({}, state, { open: new Set(), note: true })); } catch (e) { }
          const num = (end ? nums.notes.end : nums.notes.foot)[a.id] || '';
          x = '<text:note text:id="ftn' + esc(a.id) + '" text:note-class="' + (end ? 'endnote' : 'footnote') + '"><text:note-citation' + (a.mark ? ' text:label="' + esc(a.mark) + '"' : '') + '>' + esc(a.mark || num) + '</text:note-citation><text:note-body>' + body + '</text:note-body></text:note>';
        }
        else if (t === 'image') { const a = n.attrs; const path = await picture('m:' + (a.m || a.src), async () => { if (a.m && TX.media.blobs[a.m]) return TX.media.blobs[a.m]; if (a.src) { try { return await (await fetch(a.src)).blob(); } catch (e) { } } return null; }); if (path) x = frameXml(a, path, a.w, a.h, 'Image'); }
        else if (t === 'drawing' || t === 'math') {
          const a = n.attrs; let blob = null, w = a.w, h = a.h;
          if (t === 'math') { const r = await TX.Docx._mathPng(a.tex, a.display, theme); if (r) { blob = r.blob; w = r.w; h = r.h; } warn.add('Les équations sont enregistrées en images.'); }
          else { blob = await TX.Docx._renderPng('<div style="width:100%;height:100%;position:relative">' + TX.drawingSvg(a, { theme }) + (a.html ? '<div style="position:absolute;inset:0;padding:' + (a.pad == null ? 7.2 : a.pad) + 'pt;display:flex;flex-direction:column;justify-content:' + ({ top: 'flex-start', bottom: 'flex-end' }[a.va] || 'center') + ';font:11pt sans-serif">' + a.html + '</div>' : '') + '</div>', a.w, a.h, theme, 2); warn.add('Les formes, zones de texte et graphiques sont enregistrés en images.'); }
          const path = blob && await picture('d' + (++chN), async () => blob);
          if (path) x = frameXml(t === 'math' ? { wrap: 'inline', alt: a.tex } : a, path, w, h, t === 'math' ? 'Équation' : 'Objet');
        }
        if (!x) continue;
        if (mk.del) { const cid = 'ct' + changes.length; changes.push('<text:changed-region xml:id="' + cid + '" text:id="' + cid + '"><text:deletion><office:change-info><dc:creator>' + esc(mk.del.a || 'Auteur') + '</dc:creator><dc:date>' + esc(isoD(mk.del.d)) + '</dc:date></office:change-info><text:p>' + x + '</text:p></text:deletion></text:changed-region>'); x = '<text:change text:change-id="' + cid + '"/>'; }
        else if (mk.ins) { const cid = 'ct' + changes.length; changes.push('<text:changed-region xml:id="' + cid + '" text:id="' + cid + '"><text:insertion><office:change-info><dc:creator>' + esc(mk.ins.a || 'Auteur') + '</dc:creator><dc:date>' + esc(isoD(mk.ins.d)) + '</dc:date></office:change-info></text:insertion></text:changed-region>'); x = '<text:change-start text:change-id="' + cid + '"/>' + x + '<text:change-end text:change-id="' + cid + '"/>'; }
        out += x;
      }
      if (linkOpen) out += '</text:a>';
      return out;
    }
    const isoD = (d) => { try { return new Date(d || Date.now()).toISOString().replace(/\.\d+Z$/, ''); } catch (e) { return new Date().toISOString().replace(/\.\d+Z$/, ''); } };
    function annot(id, withName) {
      const c = comments[id]; const rep = Object.keys(comments).filter((k) => comments[k].p === id).map((k) => comments[k]);
      const body = [c].concat(rep).map((x, i) => (i ? '<text:p>— ' + esc(x.a || '') + ' : ' + esc(x.t) + '</text:p>' : String(x.t || '').split('\n').map((l) => '<text:p>' + esc(l) + '</text:p>').join(''))).join('');
      return '<office:annotation' + (withName ? ' office:name="' + id + '"' : '') + '><dc:creator>' + esc(c.a || 'Auteur') + '</dc:creator><dc:date>' + esc(isoD(c.d)) + '</dc:date>' + body + '</office:annotation>';
    }
    function fieldXml(a, state, off) {
      let res = ''; try { res = TX.fieldText(a, ctx, state.pos != null ? state.pos + 1 + off : 0, null); } catch (e) { res = a.cache || ''; }
      switch (a.f) {
        case 'page': return '<text:page-number text:select-page="current">1</text:page-number>';
        case 'pages': case 'sectionpages': return '<text:page-count>1</text:page-count>';
        case 'date': case 'savedate': case 'created': return '<text:date' + (a.f === 'date' ? '' : ' text:fixed="true"') + '>' + esc(res) + '</text:date>';
        case 'time': return '<text:time>' + esc(res) + '</text:time>';
        case 'title': return '<text:title>' + esc(res) + '</text:title>';
        case 'author': return '<text:initial-creator>' + esc(res) + '</text:initial-creator>';
        case 'subject': return '<text:subject>' + esc(res) + '</text:subject>';
        case 'file': return '<text:file-name text:display="name">' + esc(res) + '</text:file-name>';
        case 'words': return '<text:word-count>' + esc(res) + '</text:word-count>';
        case 'seq': { const nm = a.name || 'Figure'; return '<text:sequence text:name="' + esc(nm) + '" text:formula="ooow:' + esc(nm) + '+1" style:num-format="1">' + esc(res) + '</text:sequence>'; }
        case 'ref': { const r = a.ref || {}; return '<text:bookmark-ref text:reference-format="' + (a.show === 'page' ? 'page' : a.show === 'number' ? 'number' : 'text') + '" text:ref-name="' + esc(r.id || '') + '">' + esc(res) + '</text:bookmark-ref>'; }
        case 'merge': return esc(opt.record ? res : '«' + (a.name || 'champ') + '»');
        default: return esc(res);
      }
    }
    /* listes : style de liste par définition */
    const listStyles = Object.keys(lists).map((id, k) => {
      const def = lists[id];
      return '<text:list-style style:name="L' + (k + 1) + '">' + Array.from({ length: 10 }, (x, i) => {
        const L = def.lv[Math.min(i, 8)] || def.lv[0];
        const pos = '<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="' + pt(L.il) + '" fo:text-indent="' + pt(-(L.hg || 0)) + '" fo:margin-left="' + pt(L.il) + '"/></style:list-level-properties>';
        if (L.f === 'bullet') return '<text:list-level-style-bullet text:level="' + (i + 1) + '" text:bullet-char="' + esc((L.t || '•').slice(0, 1)) + '">' + pos + (L.c ? '<style:text-properties fo:color="' + hex(L.c, theme) + '"/>' : '') + '</text:list-level-style-bullet>';
        const m = /^(.*?)%(\d)(.*)$/.exec(L.t || '%1.'); const prefix = m ? m[1].replace(/%\d[.)]?/g, '') : ''; const suffix = m ? (L.t.replace(/^.*%\d/, '')) : '.';
        const disp = ((L.t || '').match(/%\d/g) || []).length || 1;
        return '<text:list-level-style-number text:level="' + (i + 1) + '" style:num-format="' + (FMT[L.f] != null ? FMT[L.f] : '1') + '"' + (prefix ? ' style:num-prefix="' + esc(prefix) + '"' : '') + ' style:num-suffix="' + esc(suffix) + '"' + (disp > 1 ? ' text:display-levels="' + disp + '"' : '') + (L.st && L.st !== 1 ? ' text:start-value="' + L.st + '"' : '') + '>' + pos + '</text:list-level-style-number>';
      }).join('') + '</text:list-style>';
    });
    const listName = {}; Object.keys(lists).forEach((id, k) => { listName[id] = 'L' + (k + 1); });
    /* blocs */
    async function paraXml(n, state, extra) {
      const a = n.attrs, st = styles[a.s] ? a.s : 'Normal';
      const p = {}; ['al', 'il', 'ir', 'fi', 'sb', 'sa', 'ln', 'lr', 'kn', 'kl', 'pb', 'wc', 'tabs', 'bd', 'sh', 'ctx'].forEach((k) => { if (a[k] != null) p[k] = a[k]; });
      if (a.li) { delete p.il; delete p.fi; }
      if (extra && extra.pb) p.pb = 1;
      let pprops = paraProps(p, theme, extra && extra.cb ? ' fo:break-before="column"' : '');
      if (a.rpr && Object.keys(a.rpr).length) pprops += textProps(a.rpr, theme);
      const master = extra && extra.master;
      const nm = pprops || master || (extra && extra.pnum != null) ? autoStyle(auto.P, 'P', 'paragraph', (extra && extra.pnum != null ? pprops.replace('<style:paragraph-properties', '<style:paragraph-properties style:page-number="' + extra.pnum + '"').replace(/^$/, '<style:paragraph-properties style:page-number="' + extra.pnum + '"/>') : pprops), sname(st)) : sname(st);
      let styleAttr = nm;
      if (master) { const key = 'M|' + master + '|' + nm; if (!auto.P.has(key)) { const name = 'P' + (auto.P.size + 1); const base = auto.P.get(Array.from(auto.P.keys()).find((k) => auto.P.get(k).name === nm)); auto.P.set(key, { name, xml: '<style:style style:name="' + name + '" style:family="paragraph" style:parent-style-name="' + esc(sname(st)) + '" style:master-page-name="' + master + '">' + (base ? base.xml.replace(/^<style:style[^>]*>|<\/style:style>$/g, '') : pprops) + '</style:style>' }); } styleAttr = auto.P.get(key).name; }
      let body = await inl(n, state);
      if (a.pid) body = '<text:bookmark text:name="' + esc(a.pid) + '"/>' + body;
      const lvl = TX.outlineLevel(styles, n);
      const tag = lvl > 0 && !a.li ? 'text:h' : 'text:p';
      return '<' + tag + ' text:style-name="' + esc(styleAttr) + '"' + (tag === 'text:h' ? ' text:outline-level="' + lvl + '"' : '') + '>' + body + '</' + tag + '>';
    }
    async function tableXml(n, state) {
      const a = n.attrs, look = a.look || { hdr: true, band: true };
      const name = 'Tableau' + (++tableN);
      // grille
      const grid = []; const occ = []; const rows = [];
      n.forEach((row, ro, ri) => { let c = 0; occ[ri] = occ[ri] || []; const cells = []; row.forEach((cell) => { while (occ[ri][c]) { cells.push({ cov: true }); c++; } const cs = cell.attrs.colspan || 1, rs = cell.attrs.rowspan || 1; for (let j = 0; j < cs; j++) { const w = cell.attrs.colwidth && cell.attrs.colwidth[j]; if (w && !grid[c + j]) grid[c + j] = w; } cells.push({ cell }); for (let j = 1; j < cs; j++) cells.push({ cov: true }); for (let k = 1; k < rs; k++) { occ[ri + k] = occ[ri + k] || []; for (let j = 0; j < cs; j++) occ[ri + k][c + j] = 1; } c += cs; }); while (occ[ri][c]) { cells.push({ cov: true }); c++; } rows.push({ row, cells }); });
      const ncol = Math.max(1, ...rows.map((r) => r.cells.length));
      const avail = (state.pg.w - state.pg.ml - state.pg.mr) * TX.PX;
      for (let j = 0; j < ncol; j++) if (!grid[j]) grid[j] = avail / ncol;
      const total = grid.slice(0, ncol).reduce((s, w) => s + w, 0) / TX.PX;
      auto.other.push('<style:style style:name="' + name + '" style:family="table"><style:table-properties style:width="' + pt(total) + '" table:align="' + ({ center: 'center', right: 'right' }[a.al] || (a.ind ? 'margins' : 'left')) + '"' + (a.ind ? ' fo:margin-left="' + pt(a.ind) + '"' : '') + '/></style:style>');
      let x = '<table:table table:name="' + name + '" table:style-name="' + name + '">';
      for (let j = 0; j < ncol; j++) { const cn = name + '.C' + j; auto.other.push('<style:style style:name="' + cn + '" style:family="table-column"><style:table-column-properties style:column-width="' + pt(grid[j] / TX.PX) + '"/></style:style>'); x += '<table:table-column table:style-name="' + cn + '"/>'; }
      const cmL = a.cm && a.cm.l != null ? a.cm.l : 5.4, cmR = a.cm && a.cm.r != null ? a.cm.r : 5.4, cmT = (a.cm && a.cm.t) || 0, cmB = (a.cm && a.cm.b) || 0;
      let inHead = false;
      for (let ri = 0; ri < rows.length; ri++) {
        const r = rows[ri], ra = r.row.attrs;
        if (ra.hdr && !inHead && ri === 0) { x += '<table:table-header-rows>'; inHead = true; }
        if (inHead && !ra.hdr) { x += '</table:table-header-rows>'; inHead = false; }
        const rn = ra.h ? autoStyle(auto.T.rows || (auto.T.rows = new Map()), name + 'R', 'table-row', '<style:table-row-properties ' + (ra.hr === 'exact' ? 'style:row-height' : 'style:min-row-height') + '="' + pt(ra.h) + '"' + (ra.cs ? ' fo:keep-together="always"' : '') + '/>') : null;
        x += '<table:table-row' + (rn ? ' table:style-name="' + rn + '"' : '') + '>';
        let ci = 0;
        for (const c of r.cells) {
          if (c.cov) { x += '<table:covered-table-cell/>'; ci++; continue; }
          const ca = c.cell.attrs; const lk = cellLook(a.ts || 'Grille', ri, ci, rows.length, ncol, look, theme);
          const bd = Object.assign({}, lk.bd || {}, ca.bd || {}); if (a.bd) { if (ri === 0 && a.bd.t) bd.t = a.bd.t; if (ri === rows.length - 1 && a.bd.b) bd.b = a.bd.b; if (ci === 0 && a.bd.l) bd.l = a.bd.l; if (ci + (ca.colspan || 1) >= ncol && a.bd.r) bd.r = a.bd.r; if (a.bd.h) { if (ri > 0 && !bd.t) bd.t = a.bd.h; if (ri < rows.length - 1 && !bd.b) bd.b = a.bd.h; } if (a.bd.v) { if (ci > 0 && !bd.l) bd.l = a.bd.v; if (ci + 1 < ncol && !bd.r) bd.r = a.bd.v; } }
          const bg = ca.bg || lk.bg;
          let cp = ' fo:padding-left="' + pt(cmL) + '" fo:padding-right="' + pt(cmR) + '" fo:padding-top="' + pt(cmT) + '" fo:padding-bottom="' + pt(cmB) + '"';
          ['t', 'b', 'l', 'r'].forEach((k) => { cp += ' fo:border-' + { t: 'top', b: 'bottom', l: 'left', r: 'right' }[k] + '="' + (bd[k] ? bcss(bd[k], theme) : 'none') + '"'; });
          if (bg) cp += ' fo:background-color="' + hex(bg, theme) + '"';
          if (ca.va) cp += ' style:vertical-align="' + ({ center: 'middle', bottom: 'bottom' }[ca.va] || 'top') + '"';
          if (ca.dir) cp += ' style:writing-mode="tb-rl"';
          const cn = autoStyle(auto.T.cells || (auto.T.cells = new Map()), name + 'X', 'table-cell', '<style:table-cell-properties' + cp + '/>');
          let inner = await blocks(c.cell, Object.assign({}, state, { cellLook: lk }));
          x += '<table:table-cell table:style-name="' + cn + '" office:value-type="string"' + ((ca.colspan || 1) > 1 ? ' table:number-columns-spanned="' + ca.colspan + '"' : '') + ((ca.rowspan || 1) > 1 ? ' table:number-rows-spanned="' + ca.rowspan + '"' : '') + '>' + inner + '</table:table-cell>';
          ci++;
        }
        x += '</table:table-row>';
      }
      if (inHead) x += '</table:table-header-rows>';
      return x + '</table:table>';
    }
    function tocXml(n, state) {
      const a = n.attrs, entries = (ctx.tocEntries ? ctx.tocEntries(a) : []) || [];
      const tof = a.kind === 'tof', tag = tof ? 'text:illustration-index' : 'text:table-of-content';
      const cw = state.pg.w - state.pg.ml - state.pg.mr;
      const ps = autoStyle(auto.P, 'P', 'paragraph', '<style:paragraph-properties><style:tab-stops><style:tab-stop style:position="' + pt(cw - 1) + '" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties>', sname(tof ? 'TableIllustrations' : 'TM1'));
      let x = '<' + tag + ' text:name="' + (tof ? 'Illustrations' : 'Table des matières') + (++sectN) + '"><' + tag + '-source' + (tof ? ' text:caption-sequence-name="' + esc(a.label || 'Figure') + '"' : ' text:outline-level="' + (a.levels || 3) + '"') + '>' + (a.title ? '<text:index-title-template text:style-name="' + sname('TitreTM') + '">' + esc(a.title) + '</text:index-title-template>' : '') + '</' + tag + '-source><text:index-body>';
      if (a.title) x += '<text:index-title text:name="t' + sectN + '"><text:p text:style-name="' + sname('TitreTM') + '">' + esc(a.title) + '</text:p></text:index-title>';
      entries.forEach((e) => { x += '<text:p text:style-name="' + (tof ? ps : autoStyle(auto.P, 'P', 'paragraph', '<style:paragraph-properties><style:tab-stops><style:tab-stop style:position="' + pt(cw - 1) + '" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties>', sname('TM' + Math.min(6, e.level || 1)))) + '">' + esc(e.text || '') + (a.nums !== false ? '<text:tab/>' + esc(e.page || '') : '') + '</text:p>'; });
      return x + '</text:index-body></' + tag + '>';
    }
    async function blocks(container, state, first) {
      let out = ''; const list = []; container.forEach((n, off) => list.push({ n, off }));
      let pb = false, cb = false; let openList = null; // {id, depth, xmlId}
      const closeList = () => { if (openList) { out += '</text:list-item></text:list>'.repeat(openList.depth + 1); openList = null; } };
      for (let k = 0; k < list.length; k++) {
        const n = list[k].n, t = n.type.name; state.pos = state.base != null ? state.base + list[k].off : null;
        if (t === 'paragraph' && n.attrs.li && listName[n.attrs.li.id] && !state.note) {
          const li = n.attrs.li, l = Math.max(0, Math.min(8, li.l || 0));
          const extra = Object.assign({ pb, cb }, first && k === 0 ? first : {}); pb = cb = false;
          const px = await paraXml(n, state, extra);
          if (openList && openList.id !== li.id) closeList();
          if (!openList) {
            const xid = 'list' + (++chN); const prev = state.lastList[li.id];
            out += '<text:list xml:id="' + xid + '" text:style-name="' + listName[li.id] + '"' + (prev && n.attrs.ls == null ? ' text:continue-list="' + prev + '"' : '') + '><text:list-item' + (n.attrs.ls != null ? ' text:start-value="' + n.attrs.ls + '"' : '') + '>';
            for (let d = 0; d < l; d++) out += '<text:list><text:list-item>';
            openList = { id: li.id, depth: l }; state.lastList[li.id] = xid;
            out += px;
          } else {
            if (l > openList.depth) { for (let d = openList.depth; d < l; d++) out += '<text:list><text:list-item>'; }
            else if (l < openList.depth) { for (let d = openList.depth; d > l; d--) out += '</text:list-item></text:list>'; out += '</text:list-item><text:list-item' + (n.attrs.ls != null ? ' text:start-value="' + n.attrs.ls + '"' : '') + '>'; }
            else out += '</text:list-item><text:list-item' + (n.attrs.ls != null ? ' text:start-value="' + n.attrs.ls + '"' : '') + '>';
            openList.depth = l; out += px;
          }
          continue;
        }
        closeList();
        const extra = Object.assign({ pb, cb }, first && k === 0 ? first : {});
        if (t === 'paragraph') { out += await paraXml(n, state, extra); pb = cb = false; }
        else if (t === 'table') { if (first && k === 0 && first.master) out += await paraXml(TX.schema.nodes.paragraph.create({ s: 'Normal', sa: 0, ln: 0.1, lr: 'exact' }), state, extra); else if (pb) out += '<text:p text:style-name="' + autoStyle(auto.P, 'P', 'paragraph', '<style:paragraph-properties fo:break-before="page"/>', 'Standard') + '"/>'; pb = false; out += await tableXml(n, state); }
        else if (t === 'page_break') pb = true;
        else if (t === 'col_break') cb = true;
        else if (t === 'toc') out += tocXml(n, state);
      }
      closeList();
      if (pb) out += '<text:p text:style-name="' + autoStyle(auto.P, 'P', 'paragraph', '<style:paragraph-properties fo:break-before="page"/>', 'Standard') + '"/>';
      return out;
    }
    /* sections → pages maîtresses */
    const parts = attrs.parts || {};
    const masters = [], layouts = [];
    async function partBody(id, pg, kind) {
      if (!id || !parts[id]) return null;
      try { const nd = TX.schema.nodeFromJSON(parts[id].doc || parts[id]); return await blocks(nd.firstChild, { open: new Set(), pg, lastList: {}, part: true }); } catch (e) { return null; }
    }
    if (settings.wm) warn.add('Le filigrane n\'est pas enregistré dans le .odt.');
    let body = '';
    const secs = []; docNode.forEach((s, off) => secs.push({ s, off }));
    const state = { open: new Set(), lastList: {} };
    let prevPg = null;
    for (let i = 0; i < secs.length; i++) {
      const pg = TX.pg(secs[i].s); state.pg = pg; state.base = secs[i].off + 1;
      const samePage = prevPg && pg.w === prevPg.w && pg.h === prevPg.h && pg.mt === prevPg.mt && pg.ml === prevPg.ml && pg.mr === prevPg.mr && pg.mb === prevPg.mb && JSON.stringify(pg.hdr) === JSON.stringify(prevPg.hdr) && JSON.stringify(pg.ftr) === JSON.stringify(prevPg.ftr);
      let first = null;
      if (!(pg.type === 'continuous' && samePage)) {
        const mi = masters.length + 1, pl = 'pm' + mi, mp = 'MP' + mi;
        const hf = async (kind) => {
          const h = pg[kind] || {}; const tag = kind === 'hdr' ? 'header' : 'footer';
          let x = '';
          const def = await partBody(h.def || (prevPg && prevPg[kind] && prevPg[kind].def), pg, kind); if (def) x += '<style:' + tag + '>' + def + '</style:' + tag + '>';
          if (settings.evenOdd) { const ev = await partBody(h.even, pg, kind); if (ev) x += '<style:' + tag + '-left>' + ev + '</style:' + tag + '-left>'; }
          if (pg.titlePg) { const fi = await partBody(h.first, pg, kind); x += '<style:' + tag + '-first>' + (fi || '<text:p/>') + '</style:' + tag + '-first>'; }
          return x;
        };
        const c = pg.cols || { n: 1 };
        const cols = c.n > 1 ? '<style:columns fo:column-count="' + c.n + '" fo:column-gap="' + pt(c.gap || 35.4) + '">' + (c.sep ? '<style:column-sep style:width="0.75pt" style:color="#000000" style:height="100%"/>' : '') + '</style:columns>' : '';
        const bd = pg.bd && pg.bd.s && pg.bd.s !== 'none' ? ' fo:border="' + bcss(pg.bd, theme) + '" fo:padding="' + pt(pg.bd.from === 'text' ? (pg.bd.sp == null ? 4 : pg.bd.sp) : 4) + '"' : '';
        const hasH = !!((pg.hdr && (pg.hdr.def || pg.hdr.first || pg.hdr.even))), hasF = !!((pg.ftr && (pg.ftr.def || pg.ftr.first || pg.ftr.even)));
        layouts.push('<style:page-layout style:name="' + pl + '"' + (settings.evenOdd ? ' style:page-usage="mirrored"' : '') + '><style:page-layout-properties fo:page-width="' + pt(pg.w) + '" fo:page-height="' + pt(pg.h) + '" style:print-orientation="' + (pg.w > pg.h ? 'landscape' : 'portrait') + '" fo:margin-top="' + pt(hasH ? pg.mh : pg.mt) + '" fo:margin-bottom="' + pt(hasF ? pg.mf : pg.mb) + '" fo:margin-left="' + pt(pg.ml + (pg.gut || 0)) + '" fo:margin-right="' + pt(pg.mr) + '"' + bd + (settings.pageColor ? ' fo:background-color="' + hex(settings.pageColor, theme) + '"' : '') + (pg.numFmt && pg.numFmt !== 'decimal' ? ' style:num-format="' + FMT[pg.numFmt] + '"' : ' style:num-format="1"') + '>' + cols + '</style:page-layout-properties><style:header-style>' + (hasH ? '<style:header-footer-properties fo:min-height="0cm" fo:margin-bottom="' + pt(Math.max(0, pg.mt - pg.mh - 14)) + '"/>' : '') + '</style:header-style><style:footer-style>' + (hasF ? '<style:header-footer-properties fo:min-height="0cm" fo:margin-top="' + pt(Math.max(0, pg.mb - pg.mf - 14)) + '"/>' : '') + '</style:footer-style></style:page-layout>');
        masters.push('<style:master-page style:name="' + mp + '" style:display-name="' + (i ? 'Section ' + (i + 1) : 'Standard') + '" style:page-layout-name="' + pl + '">' + await hf('hdr') + await hf('ftr') + '</style:master-page>');
        first = { master: mp, pnum: pg.numStart != null ? pg.numStart : null };
        body += await blocks(secs[i].s, state, first);
      } else {
        // section continue (colonnes) : text:section
        const c = pg.cols || { n: 1 }; const sn = 'Sect' + (++sectN);
        auto.other.push('<style:style style:name="' + sn + '" style:family="section"><style:section-properties>' + (c.n > 1 ? '<style:columns fo:column-count="' + c.n + '" fo:column-gap="' + pt(c.gap || 35.4) + '">' + (c.sep ? '<style:column-sep style:width="0.75pt" style:color="#000000" style:height="100%"/>' : '') + '</style:columns>' : '<style:columns fo:column-count="1" fo:column-gap="0cm"/>') + '</style:section-properties></style:style>');
        body += '<text:section text:style-name="' + sn + '" text:name="Section' + sectN + '">' + await blocks(secs[i].s, state) + '</text:section>';
      }
      prevPg = pg;
    }
    state.open.forEach((id) => { body = body.replace(/(<\/text:(p|h)>)(?![\s\S]*<\/text:(p|h)>)/, '<office:annotation-end office:name="' + id + '"/>$1'); });
    /* styles nommés */
    let named = '<style:default-style style:family="paragraph"><style:paragraph-properties style:tab-stop-distance="' + pt(settings.tab || 35.4) + '"/><style:text-properties style:font-name="' + esc(theme.fonts.minor) + '" fo:font-size="11pt" fo:language="' + (settings.lang || 'fr-FR').split('-')[0] + '" fo:country="' + ((settings.lang || 'fr-FR').split('-')[1] || 'FR') + '"/></style:default-style>';
    Object.keys(styles).forEach((id) => {
      const st = styles[id], c = st.t === 'c';
      const r = st.r || {}; if (r.f && r.f[0] !== '+') fonts.add(r.f);
      const pp = Object.assign({}, st.p || {}); delete pp.li;
      named += '<style:style style:name="' + esc(sname(id)) + '" style:display-name="' + esc(ODF_NAMES[id] || st.n || id) + '" style:family="' + (c ? 'text' : 'paragraph') + '"' + (st.b && styles[st.b] ? ' style:parent-style-name="' + esc(sname(st.b)) + '"' : '') + (!c && st.nx && styles[st.nx] ? ' style:next-style-name="' + esc(sname(st.nx)) + '"' : '') + (!c && st.lvl ? ' style:default-outline-level="' + st.lvl + '"' : '') + (!c && st.p && st.p.li && listName[st.p.li.id] ? ' style:list-style-name="' + listName[st.p.li.id] + '"' : '') + '>' + (c ? '' : paraProps(pp, theme)) + textProps(r, theme) + '</style:style>';
    });
    named += '<style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="paragraph" svg:x="0cm" svg:y="0cm" style:wrap="dynamic" style:number-wrapped-paragraphs="no-limit" style:wrap-contour="false" style:vertical-pos="top" style:vertical-rel="paragraph" style:horizontal-pos="center" style:horizontal-rel="paragraph"/></style:style>';
    named += listStyles.join('');
    named += '<text:notes-configuration text:note-class="footnote" style:num-format="' + (FMT[settings.fnFmt] || '1') + '" text:start-value="0" text:footnotes-position="page" text:start-numbering-at="document"/><text:notes-configuration text:note-class="endnote" style:num-format="' + (FMT[settings.enFmt] || 'i') + '" text:start-value="0"/>';
    const fontDecls = '<office:font-face-decls>' + Array.from(fonts).filter(Boolean).map((f) => '<style:font-face style:name="' + esc(f) + '" svg:font-family="\'' + esc(f) + '\'"/>').join('') + '</office:font-face-decls>';
    Array.from(auto.P.values()).forEach(() => { });
    // polices citées dans les styles automatiques
    const autoXml = Array.from(auto.P.values()).map((x) => x.xml).join('') + Array.from(auto.T.values()).filter((x) => x && x.xml).map((x) => x.xml).join('') + ['fr', 'rows', 'cells'].map((k) => auto.T[k] ? Array.from(auto.T[k].values()).map((x) => x.xml).join('') : '').join('') + auto.other.join('');
    const fontsInAuto = new Set(); autoXml.replace(/style:font-name="([^"]+)"/g, (m, f) => { fontsInAuto.add(f); return m; });
    const fontDecls2 = '<office:font-face-decls>' + Array.from(new Set([...fonts, ...fontsInAuto])).filter(Boolean).map((f) => '<style:font-face style:name="' + f + '" svg:font-family="\'' + f + '\'"/>').join('') + '</office:font-face-decls>';
    void fontDecls;
    const tracked = changes.length ? '<text:tracked-changes text:track-changes="' + (settings.track ? 'true' : 'false') + '">' + changes.join('') + '</text:tracked-changes>' : (settings.track ? '<text:tracked-changes text:track-changes="true"/>' : '');
    z.file('content.xml', XML + '<office:document-content ' + NS + '>' + fontDecls2 + '<office:automatic-styles>' + autoXml + '</office:automatic-styles><office:body><office:text>' + tracked + '<text:sequence-decls><text:sequence-decl text:display-outline-level="0" text:name="Illustration"/><text:sequence-decl text:display-outline-level="0" text:name="Table"/><text:sequence-decl text:display-outline-level="0" text:name="Figure"/><text:sequence-decl text:display-outline-level="0" text:name="Tableau"/></text:sequence-decls>' + body + '</office:text></office:body></office:document-content>');
    z.file('styles.xml', XML + '<office:document-styles ' + NS + '>' + fontDecls2 + '<office:styles>' + named + '</office:styles><office:automatic-styles>' + layouts.join('') + '</office:automatic-styles><office:master-styles>' + masters.join('') + '</office:master-styles></office:document-styles>');
    const iso = (t) => new Date(t || Date.now()).toISOString().replace(/\.\d+Z$/, '');
    z.file('meta.xml', XML + '<office:document-meta ' + NS + '><office:meta><meta:generator>Texte (Suite MAG)</meta:generator><dc:title>' + esc(props.title) + '</dc:title><dc:subject>' + esc(props.subject) + '</dc:subject><meta:initial-creator>' + esc(props.author) + '</meta:initial-creator><dc:creator>' + esc(props.author) + '</dc:creator><meta:keyword>' + esc(props.keywords) + '</meta:keyword><dc:language>' + esc(settings.lang || 'fr-FR') + '</dc:language><meta:creation-date>' + iso(props.created) + '</meta:creation-date><dc:date>' + iso(Date.now()) + '</dc:date></office:meta></office:document-meta>');
    z.file('settings.xml', XML + '<office:document-settings ' + NS + ' xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><office:settings/></office:document-settings>');
    ['content.xml', 'styles.xml', 'meta.xml', 'settings.xml'].forEach((f) => manifest.push('<manifest:file-entry manifest:full-path="' + f + '" manifest:media-type="text/xml"/>'));
    z.file('META-INF/manifest.xml', XML + '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' + manifest.join('') + '</manifest:manifest>');
    const blob = await z.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text', compression: 'DEFLATE' });
    return { blob, warn: Array.from(warn) };
  };

  /* ---------------- lecture ---------------- */
  const NSU = { text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0', fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0', table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', xlink: 'http://www.w3.org/1999/xlink', svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', dc: 'http://purl.org/dc/elements/1.1/', meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0' };
  const A = (n, q) => { if (!n || !n.getAttributeNS) return null; const [p, l] = q.split(':'); const v = n.getAttributeNS(NSU[p], l); return v === '' ? (n.hasAttributeNS(NSU[p], l) ? '' : null) : v; };
  const kids = (n) => n ? Array.from(n.children) : [];
  const kidQ = (n, q) => kids(n).find((c) => c.prefix + ':' + c.localName === q || (c.namespaceURI === NSU[q.split(':')[0]] && c.localName === q.split(':')[1])) || null;
  const isQ = (c, q) => c.namespaceURI === NSU[q.split(':')[0]] && c.localName === q.split(':')[1];
  const len = (v) => { if (v == null) return null; const m = /^(-?[\d.]+)(pt|cm|mm|in|px|pc)?$/.exec(String(v).trim()); if (!m) return null; const n = +m[1]; return r2({ pt: n, cm: TX.cm2pt(n), mm: TX.mm2pt(n), in: n * 72, px: n * 0.75, pc: n * 12 }[m[2] || 'pt']); };
  const BS_IN = (v) => { if (!v || v === 'none') return null; const m = /([\d.]+(?:pt|cm|mm|in|px))\s+(solid|double|dotted|dashed|groove|ridge|inset|outset)\s+(#[0-9a-fA-F]{6})/.exec(v); if (!m) return null; return { s: { solid: 'single', double: 'double', dotted: 'dotted', dashed: 'dashed' }[m[2]] || 'single', w: len(m[1]), c: m[3].toUpperCase() }; };

  D.read = async function (z) {
    const warnings = new Set();
    const rd = async (p) => { const f = z.file(p); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
    const content = await rd('content.xml'), stylesX = await rd('styles.xml'), metaX = await rd('meta.xml');
    if (!content) throw new Error('content.xml introuvable');
    const settings = TX.defaultSettings(); settings.styleSet = 'import';
    /* propriétés de style */
    const tp = (el) => { const r = {}; if (!el) return r; const g = (q) => A(el, q);
      const fn = g('style:font-name') || g('fo:font-family'); if (fn) r.f = fn.replace(/['"]/g, '');
      const fs = g('fo:font-size'); if (fs && /pt|cm|mm|in/.test(fs)) r.sz = len(fs);
      const fw = g('fo:font-weight'); if (fw) r.b = /bold|[6-9]00/.test(fw) ? 1 : 0;
      const fst = g('fo:font-style'); if (fst) r.i = fst === 'italic' || fst === 'oblique' ? 1 : 0;
      const c = g('fo:color'); if (c && /^#/.test(c)) r.c = c.toUpperCase();
      const us = g('style:text-underline-style'); if (us && us !== 'none') { r.u = g('style:text-underline-type') === 'double' ? 'double' : { dotted: 'dotted', dash: 'dash', 'dot-dash': 'dotDash', wave: 'wave' }[us] || 'single'; const uc = g('style:text-underline-color'); if (uc && /^#/.test(uc)) r.uc = uc; } else if (us === 'none') r.u = 0;
      const lt = g('style:text-line-through-style'); if (lt && lt !== 'none') { r.s = 1; if (g('style:text-line-through-type') === 'double') r.dbl = 1; }
      const pos = g('style:text-position'); if (pos) { if (/^super|^\d+%/.test(pos) && !/^0%/.test(pos)) r.va = 'sup'; if (/^sub|^-\d+%/.test(pos)) r.va = 'sub'; }
      const tt = g('fo:text-transform'); if (tt === 'uppercase') r.caps = 1; if (g('fo:font-variant') === 'small-caps') r.smcaps = 1;
      const ls = g('fo:letter-spacing'); if (ls && ls !== 'normal') r.sp = len(ls);
      const bg = g('fo:background-color'); if (bg && /^#/.test(bg)) { const hl = Object.keys(TX.HL).find((k) => TX.HL[k] === bg.toUpperCase()); if (hl) r.hl = hl; else r.sh = bg.toUpperCase(); }
      if (g('text:display') === 'none') r.hidden = 1;
      return r; };
    const pp = (el) => { const p = {}; if (!el) return p; const g = (q) => A(el, q);
      const al = g('fo:text-align'); if (al) p.al = { start: 'left', left: 'left', center: 'center', end: 'right', right: 'right', justify: 'justify' }[al] || null;
      const ml = len(g('fo:margin-left')); if (ml != null) p.il = ml; const mr = len(g('fo:margin-right')); if (mr != null) p.ir = mr;
      const ti = len(g('fo:text-indent')); if (ti != null) p.fi = ti; const mt = len(g('fo:margin-top')); if (mt != null) p.sb = mt; const mb = len(g('fo:margin-bottom')); if (mb != null) p.sa = mb;
      const lh = g('fo:line-height'); if (lh) { if (/%$/.test(lh)) { p.ln = r2(parseFloat(lh) / 100); p.lr = 'auto'; } else if (len(lh) != null) { p.ln = len(lh); p.lr = 'exact'; } }
      const la = g('style:line-height-at-least'); if (la) { p.ln = len(la); p.lr = 'atLeast'; }
      if (g('fo:keep-with-next') === 'always') p.kn = 1; if (g('fo:keep-together') === 'always') p.kl = 1;
      if (g('style:contextual-spacing') === 'true') p.ctx = 1;
      if (g('fo:break-before') === 'page') p.pb = 1; if (g('fo:break-before') === 'column') p._cb = 1;
      const bg = g('fo:background-color'); if (bg && /^#/.test(bg)) p.sh = bg.toUpperCase();
      const bd = {}; const all = BS_IN(g('fo:border')); ['top', 'bottom', 'left', 'right'].forEach((s) => { const b = BS_IN(g('fo:border-' + s)) || all; if (b) { const pad = len(g('fo:padding-' + s) || g('fo:padding')); if (pad != null) b.sp = pad; bd[s[0]] = b; } }); if (Object.keys(bd).length) p.bd = bd;
      const tabs = kidQ(el, 'style:tab-stops'); if (tabs) { const t = kids(tabs).map((x) => ({ pos: len(A(x, 'style:position')), t: { center: 'center', right: 'right', char: 'decimal' }[A(x, 'style:type')] || 'left', lead: A(x, 'style:leader-text') ? ({ '.': 'dot', '-': 'hyphen', '_': 'underscore' }[A(x, 'style:leader-text')] || null) : (A(x, 'style:leader-style') && A(x, 'style:leader-style') !== 'none' ? 'dot' : null) })).filter((x) => x.pos != null); if (t.length) p.tabs = t; }
      const pn = g('style:page-number'); if (pn && pn !== 'auto') p._pnum = +pn;
      return p; };
    /* styles nommés */
    const styles = {}; const nameMap = {}; const textStyleMap = {};
    const defs = TX.defaultStyles();
    const named = [];
    [stylesX, content].forEach((x) => { if (!x) return; Array.from(x.getElementsByTagNameNS(NSU.office, 'styles')).forEach((s) => kids(s).forEach((c) => named.push(c))); });
    named.forEach((s) => {
      if (!isQ(s, 'style:style') && !isQ(s, 'style:default-style')) return;
      const fam = A(s, 'style:family'); if (fam !== 'paragraph' && fam !== 'text') return;
      if (isQ(s, 'style:default-style')) { if (fam === 'paragraph') { styles.__def = { p: pp(kidQ(s, 'style:paragraph-properties')), r: tp(kidQ(s, 'style:text-properties')) }; const td = A(kidQ(s, 'style:paragraph-properties'), 'style:tab-stop-distance'); if (td) settings.tab = len(td) || 35.4; } return; }
      const nm = A(s, 'style:name'), dn = A(s, 'style:display-name') || nm.replace(/_20_/g, ' ');
      let id = FROM_ODF[nm.toLowerCase()] || FROM_ODF[dn.toLowerCase()];
      if (id && fam === 'text' && defs[id] && defs[id].t !== 'c') id = null;
      if (id && fam === 'paragraph' && defs[id] && defs[id].t === 'c') id = null;
      if (!id) id = nm.replace(/_20_/g, '').replace(/[^A-Za-z0-9_-]/g, '') || 'S' + named.length;
      if (styles[id] && nameMap[nm] == null) { if (nm.toLowerCase() === 'text_20_body' || nm.toLowerCase() === 'text body') { nameMap[nm] = 'Normal'; styles.Normal._tb = { p: pp(kidQ(s, 'style:paragraph-properties')), r: tp(kidQ(s, 'style:text-properties')) }; return; } id = id + '_' + named.indexOf(s); }
      nameMap[nm] = id; if (fam === 'text') textStyleMap[nm] = id;
      const st = { n: defs[id] ? defs[id].n : dn, t: fam === 'text' ? 'c' : 'p', _par: A(s, 'style:parent-style-name'), _next: A(s, 'style:next-style-name'), p: pp(kidQ(s, 'style:paragraph-properties')), r: tp(kidQ(s, 'style:text-properties')) };
      const ol = A(s, 'style:default-outline-level'); if (ol) st.lvl = +ol; else if (/^Titre(\d)$/.test(id)) st.lvl = +/^Titre(\d)$/.exec(id)[1];
      if (A(s, 'style:list-style-name')) st._list = A(s, 'style:list-style-name');
      if (/^Titre\d$|^Titre$|^Normal$|^Citation$|^SousTitre$/.test(id)) st.q = 1;
      styles[id] = st;
    });
    Object.keys(styles).forEach((id) => { const st = styles[id]; if (id === '__def') return; if (st._par && nameMap[st._par] && nameMap[st._par] !== id) st.b = nameMap[st._par]; if (st._next && nameMap[st._next]) st.nx = nameMap[st._next]; delete st._par; delete st._next; delete st.p._pnum; delete st.p._cb; });
    // Standard + Corps de texte (le « Normal » de Texte)
    const def = styles.__def || { p: {}, r: {} }; delete styles.__def;
    if (!styles.Normal) styles.Normal = { n: 'Normal', t: 'p', q: 1, p: {}, r: {} };
    const tb = styles.Normal._tb; delete styles.Normal._tb;
    styles.Normal.p = Object.assign({ sa: 0, ln: 1, lr: 'auto' }, def.p, styles.Normal.p, tb ? tb.p : {}); styles.Normal.r = Object.assign({ f: 'Liberation Serif', sz: 12 }, def.r, styles.Normal.r, tb ? tb.r : {});
    delete styles.Normal.b;
    Object.keys(defs).forEach((k) => { if (!styles[k]) styles[k] = O.clone(defs[k]); });
    /* styles automatiques */
    const autoP = {}, autoT = {}, autoCell = {}, autoCol = {}, autoTable = {}, autoGraphic = {}, autoSection = {};
    const listStyles = {};
    const collectAuto = (x) => { if (!x) return; Array.from(x.getElementsByTagNameNS(NSU.office, 'automatic-styles')).forEach((a) => kids(a).forEach((s) => {
      if (isQ(s, 'text:list-style')) { listStyles[A(s, 'style:name')] = s; return; }
      if (!isQ(s, 'style:style')) return; const nm = A(s, 'style:name'), fam = A(s, 'style:family');
      const rec = { parent: A(s, 'style:parent-style-name'), master: A(s, 'style:master-page-name'), list: A(s, 'style:list-style-name'), p: pp(kidQ(s, 'style:paragraph-properties')), r: tp(kidQ(s, 'style:text-properties')), el: s };
      if (fam === 'paragraph') autoP[nm] = rec; else if (fam === 'text') autoT[nm] = rec; else if (fam === 'table-cell') autoCell[nm] = kidQ(s, 'style:table-cell-properties'); else if (fam === 'table-column') autoCol[nm] = kidQ(s, 'style:table-column-properties'); else if (fam === 'table') autoTable[nm] = kidQ(s, 'style:table-properties'); else if (fam === 'graphic') autoGraphic[nm] = kidQ(s, 'style:graphic-properties'); else if (fam === 'section') autoSection[nm] = kidQ(s, 'style:section-properties');
    })); };
    collectAuto(stylesX); collectAuto(content);
    named.forEach((s) => { if (isQ(s, 'text:list-style')) listStyles[A(s, 'style:name')] = s; });
    /* listes */
    const lists = {}, listIdOf = {};
    const NF = { '1': 'decimal', a: 'lowerLetter', A: 'upperLetter', i: 'lowerRoman', I: 'upperRoman', '': 'none' };
    const listFor = (name) => {
      if (!name || !listStyles[name]) return null;
      if (listIdOf[name]) return listIdOf[name];
      const lv = [];
      kids(listStyles[name]).forEach((l) => {
        const i = +A(l, 'text:level') - 1; if (i > 8 || i < 0) return;
        const pr = kidQ(l, 'style:list-level-properties'), la = pr && kidQ(pr, 'style:list-level-label-alignment');
        const il = la ? len(A(la, 'fo:margin-left')) || 0 : (len(A(pr, 'text:space-before')) || 0) + (len(A(pr, 'text:min-label-width')) || 18);
        const hg = la ? -(len(A(la, 'fo:text-indent')) || 0) : (len(A(pr, 'text:min-label-width')) || 18);
        if (isQ(l, 'text:list-level-style-bullet')) lv[i] = { f: 'bullet', t: A(l, 'text:bullet-char') || '•', st: 1, il, hg };
        else if (isQ(l, 'text:list-level-style-number')) { const disp = +(A(l, 'text:display-levels') || 1); let t = ''; for (let k = i - disp + 1; k <= i; k++) t += '%' + (k + 1) + (k < i ? '.' : ''); lv[i] = { f: NF[A(l, 'style:num-format') || '1'] || 'decimal', t: (A(l, 'style:num-prefix') || '') + t + (A(l, 'style:num-suffix') || ''), st: +(A(l, 'text:start-value') || 1), il, hg }; }
        else lv[i] = { f: 'bullet', t: '•', st: 1, il, hg };
      });
      for (let i = 0; i < 9; i++) if (!lv[i]) lv[i] = lv[i - 1] ? Object.assign({}, lv[i - 1], { il: (lv[i - 1].il || 0) + 36 }) : { f: 'bullet', t: '•', st: 1, il: 36, hg: 18 };
      const id = TX.uid('L'); lists[id] = { k: lv[0].f === 'bullet' ? 'bullet' : /%2/.test(lv[1].t) ? 'multi' : 'number', lv }; listIdOf[name] = id; return id;
    };
    Object.keys(styles).forEach((k) => { const st = styles[k]; if (st._list) { const L = listFor(st._list); if (L) st.p.li = { id: L, l: 0 }; delete st._list; } });
    /* médias */
    const media = {};
    const mediaOf = async (href) => { if (!href) return null; href = href.replace(/^\.\//, ''); if (media['p:' + href]) return media['p:' + href].id; const f = z.file(href); if (!f) return null; const blob = new Blob([await f.async('blob')], { type: O.mimeOf(href, 'image/png') }); const id = TX.uid('m'); media['p:' + href] = { id, blob }; if (/\.(svm|wmf|emf)$/i.test(href)) warnings.add('Certaines images (SVM/WMF/EMF) ne peuvent pas être affichées.'); return id; };
    /* révisions */
    const changes = {};
    const tc = content.getElementsByTagNameNS(NSU.text, 'tracked-changes')[0];
    if (tc) kids(tc).forEach((r) => { const id = A(r, 'text:id') || r.getAttribute('xml:id'); const k = kids(r)[0]; if (!k) return; const info = kidQ(k, 'office:change-info'); const who = info ? (Array.from(info.getElementsByTagNameNS(NSU.dc, 'creator'))[0] || {}).textContent || '' : ''; const when = info ? (Array.from(info.getElementsByTagNameNS(NSU.dc, 'date'))[0] || {}).textContent || '' : ''; changes[id] = { kind: k.localName, a: who, d: when, el: k }; });
    /* commentaires et notes */
    const comments = {}, notes = {};
    /* corps */
    const sections = [];
    const resolveP = (sn) => { const a = autoP[sn]; if (a) { return { s: nameMap[a.parent] || 'Normal', p: a.p, r: a.r, master: a.master, list: a.list }; } return { s: nameMap[sn] || 'Normal', p: {}, r: {} }; };
    const ctxR = { link: null, ins: null, open: new Set(), restarted: {} };
    async function inline(el, marks, out) {
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType === 3) { if (n.data) out.push({ type: 'text', text: n.data.replace(/[\n\r\t]+/g, ' ').replace(/ {2,}/g, ' '), marks: marks.slice() }); continue; }
        if (n.nodeType !== 1) continue;
        const ln = n.localName, ns = n.namespaceURI;
        if (ns === NSU.text) {
          switch (ln) {
            case 's': out.push({ type: 'text', text: ' '.repeat(+(A(n, 'text:c') || 1)), marks: marks.slice() }); break;
            case 'tab': out.push({ type: 'tab' }); break;
            case 'line-break': out.push({ type: 'hard_break' }); break;
            case 'soft-page-break': break;
            case 'span': { const sn = A(n, 'text:style-name'); const a = autoT[sn]; let r = {}, cs = null; if (a) { r = a.r; if (a.parent && textStyleMap[a.parent]) cs = textStyleMap[a.parent]; } else if (textStyleMap[sn]) cs = textStyleMap[sn]; const mk = marks.slice().concat(rMarks(r)); if (cs) mk.unshift({ type: 'cs', attrs: { id: cs } }); await inline(n, mk, out); break; }
            case 'a': { const href = A(n, 'xlink:href'); await inline(n, marks.concat(href ? [{ type: 'link', attrs: { href } }] : []), out); break; }
            case 'bookmark': case 'bookmark-start': { const nm = A(n, 'text:name'); if (nm) out.push({ type: 'bookmark', attrs: { name: nm } }); break; }
            case 'page-number': out.push(F('page', n, marks)); break;
            case 'page-count': out.push(F('pages', n, marks)); break;
            case 'date': out.push(F(A(n, 'text:fixed') === 'true' ? 'savedate' : 'date', n, marks)); break;
            case 'time': out.push(F('time', n, marks)); break;
            case 'title': out.push(F('title', n, marks)); break;
            case 'subject': out.push(F('subject', n, marks)); break;
            case 'initial-creator': case 'author-name': case 'creator': out.push(F('author', n, marks)); break;
            case 'file-name': out.push(F('file', n, marks)); break;
            case 'word-count': out.push(F('words', n, marks)); break;
            case 'sequence': out.push(F('seq', n, marks, { name: A(n, 'text:name') || 'Figure' })); break;
            case 'bookmark-ref': case 'reference-ref': case 'sequence-ref': out.push(F('ref', n, marks, { ref: { kind: 'bookmark', id: A(n, 'text:ref-name') }, show: A(n, 'text:reference-format') === 'page' ? 'page' : A(n, 'text:reference-format') === 'number' ? 'number' : 'text' })); break;
            case 'note': {
              const end = A(n, 'text:note-class') === 'endnote'; const id = TX.uid('n'); const cit = kidQ(n, 'text:note-citation'); const body = kidQ(n, 'text:note-body');
              const blocks = body ? await readBlocks(body, true) : [];
              notes[id] = { doc: B.part(blocks.length ? blocks : [B.p(end ? 'NoteFin' : 'NoteBas', '')]) };
              out.push({ type: 'fnref', attrs: { id, end, mark: cit && A(cit, 'text:label') ? A(cit, 'text:label') : null } }); break;
            }
            case 'change-start': { const c = changes[A(n, 'text:change-id')]; if (c && c.kind === 'insertion') { ctxR.ins = { id: TX.uid('r'), a: c.a, d: c.d }; marks.push({ type: 'ins', attrs: ctxR.ins }); } break; }
            case 'change-end': { const k = marks.findIndex((m) => m.type === 'ins'); if (k >= 0) marks.splice(k, 1); ctxR.ins = null; break; }
            case 'change': { const c = changes[A(n, 'text:change-id')]; if (c && c.kind === 'deletion') { const tmp = []; for (const p of kids(c.el).filter((x) => x.namespaceURI === NSU.text && (x.localName === 'p' || x.localName === 'h'))) await inline(p, [], tmp); const dm = { type: 'del', attrs: { id: TX.uid('r'), a: c.a, d: c.d } }; tmp.forEach((t) => { if (t.type === 'text') { t.marks = (t.marks || []).concat([dm]); out.push(t); } }); } break; }
            case 'table-of-content': case 'illustration-index': break;
            default: await inline(n, marks, out);
          }
        } else if (ns === NSU.office && ln === 'annotation') {
          const id = TX.uid('k'); const ps = kids(n).filter((x) => x.namespaceURI === NSU.text && x.localName === 'p');
          comments[id] = { a: (n.getElementsByTagNameNS(NSU.dc, 'creator')[0] || {}).textContent || 'Auteur', d: (n.getElementsByTagNameNS(NSU.dc, 'date')[0] || {}).textContent || new Date().toISOString(), t: ps.map((p) => p.textContent).join('\n'), done: false };
          const nm = A(n, 'office:name'); if (nm) { ctxR.cname = ctxR.cname || {}; ctxR.cname[nm] = id; marks.push({ type: 'cmt', attrs: { id } }); }
          else { // commentaire ponctuel : sur le mot suivant
            ctxR.pendingCmt = id;
          }
        } else if (ns === NSU.office && ln === 'annotation-end') { const nm = A(n, 'office:name'); const id = ctxR.cname && ctxR.cname[nm]; const k = marks.findIndex((m) => m.type === 'cmt' && m.attrs.id === id); if (k >= 0) marks.splice(k, 1); }
        else if (ns === NSU.draw && ln === 'frame') { const x = await frame(n); if (x) out.push(x); }
        else if (ns === NSU.draw && /^(custom-shape|rect|ellipse)$/.test(ln)) { const w = len(A(n, 'svg:width')) || 100, h = len(A(n, 'svg:height')) || 60; out.push({ type: 'drawing', attrs: { kind: 'shape', shape: ln === 'ellipse' ? 'ellipse' : 'rect', w, h, wrap: 'square', html: Array.from(n.getElementsByTagNameNS(NSU.text, 'p')).map((p) => '<p>' + O.esc(p.textContent) + '</p>').join('') } }); }
        else if (ns === NSU.draw && ln === 'a') await inline(n, marks, out);
      }
      if (ctxR.pendingCmt) { const id = ctxR.pendingCmt; const t = out.find((x) => x.type === 'text'); if (t) t.marks = (t.marks || []).concat([{ type: 'cmt', attrs: { id } }]); ctxR.pendingCmt = null; }
    }
    function F(f, n, marks, extra) { return { type: 'field', attrs: Object.assign({ f, cache: n.textContent || '' }, extra || {}), marks: marks.filter((m) => !/^(link|cmt|ins|del)$/.test(m.type)) }; }
    function rMarks(r) {
      const m = [];
      if (r.f) m.push({ type: 'font', attrs: { f: r.f } }); if (r.sz) m.push({ type: 'size', attrs: { pt: r.sz } }); if (r.c) m.push({ type: 'color', attrs: { c: r.c } });
      if (r.hl) m.push({ type: 'hl', attrs: { c: r.hl } }); if (r.sh) m.push({ type: 'shd', attrs: { c: r.sh } });
      if (r.b === 1) m.push({ type: 'b' }); else if (r.b === 0) m.push({ type: 'nob' }); if (r.i === 1) m.push({ type: 'i' }); else if (r.i === 0) m.push({ type: 'noi' });
      if (r.u) m.push({ type: 'u', attrs: { s: r.u, c: r.uc || null } }); if (r.s) m.push({ type: 's', attrs: { dbl: !!r.dbl } }); if (r.va) m.push({ type: 'va', attrs: { v: r.va } });
      if (r.caps) m.push({ type: 'caps' }); if (r.smcaps) m.push({ type: 'smcaps' }); if (r.sp) m.push({ type: 'sp', attrs: { pt: r.sp } }); if (r.hidden) m.push({ type: 'hidden' });
      return m;
    }
    async function frame(n) {
      const w = len(A(n, 'svg:width')) || 100, h = len(A(n, 'svg:height')) || 100;
      const img = kidQ(n, 'draw:image'), tb = kidQ(n, 'draw:text-box');
      const anchor = A(n, 'text:anchor-type'); const gp = autoGraphic[A(n, 'draw:style-name')];
      const wrapA = gp ? A(gp, 'style:wrap') : null; const hp = gp ? A(gp, 'style:horizontal-pos') : null;
      const a = { w, h, wrap: anchor === 'as-char' ? 'inline' : ({ parallel: 'square', dynamic: 'square', left: 'square', right: 'square', none: 'topBottom', 'run-through': (gp && A(gp, 'style:run-through') === 'background') ? 'behind' : 'front' }[wrapA] || 'square'), al: hp === 'center' ? 'center' : hp === 'right' ? 'right' : 'left', x: anchor === 'as-char' ? 0 : (hp === 'from-left' ? len(A(n, 'svg:x')) || 0 : 0), y: anchor === 'as-char' ? 0 : Math.max(0, len(A(n, 'svg:y')) || 0) };
      const title = kidQ(n, 'svg:title') || kidQ(n, 'svg:desc'); a.alt = title ? title.textContent : '';
      if (img) {
        const m = await mediaOf(A(img, 'xlink:href'));
        if (!m) { const bin = kidQ(img, 'office:binary-data'); if (bin) { const id = TX.uid('m'); media['b:' + id] = { id, blob: O.dataURLToBlob('data:image/png;base64,' + bin.textContent.replace(/\s+/g, '')) }; return { type: 'image', attrs: Object.assign({ m: id }, a) }; } return null; }
        const tr = A(n, 'draw:transform'); if (tr) { const mm = /rotate\s*\(([-\d.]+)\)/.exec(tr); if (mm) a.rot = Math.round(-(+mm[1]) * 180 / Math.PI); }
        return { type: 'image', attrs: Object.assign({ m }, a) };
      }
      if (tb) { const html = (await readBlocks(tb, true)).map((b) => '<p>' + O.esc(b.content ? b.content.map((c) => c.text || '').join('') : '') + '</p>').join(''); return { type: 'drawing', attrs: Object.assign({ kind: 'textbox', shape: 'rect', fill: null, line: { w: 0.75, c: '#000000' }, html }, a) }; }
      return null;
    }
    async function para(el, isH) {
      const sn = A(el, 'text:style-name'); const R = resolveP(sn);
      const attrs = { s: styles[R.s] ? R.s : 'Normal' };
      if (isH && attrs.s === 'Normal') { const lvl = Math.min(6, +(A(el, 'text:outline-level') || 1)); attrs.s = 'Titre' + lvl; }
      Object.keys(R.p).forEach((k) => { if (!/^_/.test(k)) attrs[k] = R.p[k]; });
      const out = []; const baseMarks = rMarks(R.r);
      await inline(el, baseMarks, out);
      const merged = []; out.forEach((x) => { if (x.marks && !x.marks.length) delete x.marks; const l = merged[merged.length - 1]; if (l && x.type === 'text' && l.type === 'text' && JSON.stringify(l.marks || []) === JSON.stringify(x.marks || [])) l.text += x.text; else merged.push(x); });
      // champs de fusion écrits « «nom» »
      const fin = []; merged.forEach((x) => { if (x.type === 'text' && /«[^«»]{1,40}»/.test(x.text)) { x.text.split(/(«[^«»]{1,40}»)/).forEach((s) => { if (!s) return; const m = /^«([^«»]+)»$/.exec(s); if (m) fin.push({ type: 'field', attrs: { f: 'merge', name: m[1] } }); else fin.push(Object.assign({}, x, { text: s })); }); } else fin.push(x); });
      return { node: { type: 'paragraph', attrs, content: fin.length ? fin : undefined }, master: R.master, pnum: R.p._pnum, cb: R.p._cb };
    }
    async function readBlocks(container, inNote, listCtx) {
      const out = [];
      for (const el of kids(container)) {
        if (el.namespaceURI === NSU.text && (el.localName === 'p' || el.localName === 'h')) {
          const r = await para(el, el.localName === 'h');
          if (listCtx) { r.node.attrs.li = { id: listCtx.id, l: listCtx.l }; delete r.node.attrs.il; delete r.node.attrs.fi; if (listCtx.start != null) { r.node.attrs.ls = listCtx.start; listCtx.start = null; } }
          if (!inNote && r.master) { r.node._master = r.master; if (r.pnum != null) r.node._pnum = r.pnum; }
          if (r.cb) out.push({ type: 'col_break' });
          if (r.node.attrs.pb && !inNote) { out.push({ type: 'page_break' }); delete r.node.attrs.pb; }
          out.push(r.node);
        } else if (el.namespaceURI === NSU.text && el.localName === 'list') {
          const sn = A(el, 'text:style-name') || (listCtx && listCtx.style);
          const id = listCtx && !A(el, 'text:style-name') ? listCtx.id : (listFor(sn) || (listCtx && listCtx.id) || listFor(Object.keys(listStyles)[0]));
          const lvl = listCtx ? listCtx.l + 1 : 0;
          for (const it of kids(el)) {
            if (!(it.namespaceURI === NSU.text && (it.localName === 'list-item' || it.localName === 'list-header'))) continue;
            const sv = A(it, 'text:start-value');
            if (it.localName === 'list-header') { out.push(...await readBlocks(it, inNote, null)); continue; }
            out.push(...await readBlocks(it, inNote, id ? { id, l: Math.min(8, lvl), style: sn, start: sv != null ? +sv : null } : null));
          }
        } else if (el.namespaceURI === NSU.table && el.localName === 'table') out.push(await table(el, inNote));
        else if (el.namespaceURI === NSU.text && el.localName === 'section') out.push(...await readBlocks(el, inNote, listCtx));
        else if (el.namespaceURI === NSU.text && (el.localName === 'table-of-content' || el.localName === 'illustration-index')) {
          const src = kids(el)[0]; const tof = el.localName === 'illustration-index';
          const ti = el.getElementsByTagNameNS(NSU.text, 'index-title')[0];
          out.push({ type: 'toc', attrs: { kind: tof ? 'tof' : 'toc', levels: src ? +(A(src, 'text:outline-level') || 3) : 3, label: tof && src ? A(src, 'text:caption-sequence-name') || 'Figure' : 'Figure', title: ti ? ti.textContent.trim() || null : null } });
        }
        else if (el.namespaceURI === NSU.text && /^(sequence-decls|tracked-changes|variable-decls|user-field-decls)$/.test(el.localName)) { }
        else if (el.namespaceURI === NSU.draw && el.localName === 'frame') { const f = await frame(el); if (f) out.push({ type: 'paragraph', attrs: { s: 'Normal' }, content: [f] }); }
      }
      return out;
    }
    async function table(el, inNote) {
      const cols = []; const tAttr = { ts: 'Aucun', look: { hdr: false, band: false } };
      const walkCols = (x) => kids(x).forEach((c) => { if (isQ(c, 'table:table-column')) { const st = autoCol[A(c, 'table:style-name')]; const w = st ? len(A(st, 'style:column-width')) : null; const rep = +(A(c, 'table:number-columns-repeated') || 1); for (let k = 0; k < Math.min(rep, 64); k++) cols.push(w); } else if (isQ(c, 'table:table-columns') || isQ(c, 'table:table-column-group') || isQ(c, 'table:table-header-columns')) walkCols(c); });
      walkCols(el);
      const tps = autoTable[A(el, 'table:style-name')]; if (tps) { const al = A(tps, 'table:align'); if (al === 'center' || al === 'right') tAttr.al = al; const ml = len(A(tps, 'fo:margin-left')); if (ml && al === 'margins') tAttr.ind = ml; }
      const rows = [];
      const walkRows = async (x, hdr) => { for (const r of kids(x)) { if (isQ(r, 'table:table-row')) { const cells = []; let ci = 0; for (const c of kids(r)) { if (isQ(c, 'table:covered-table-cell')) { ci += +(A(c, 'table:number-columns-repeated') || 1); continue; } if (!isQ(c, 'table:table-cell')) continue; const rep = Math.min(+(A(c, 'table:number-columns-repeated') || 1), 64); for (let k = 0; k < rep; k++) { const cs = +(A(c, 'table:number-columns-spanned') || 1), rs = +(A(c, 'table:number-rows-spanned') || 1); const ca = { colspan: cs, rowspan: rs, colwidth: null }; const ws = cols.slice(ci, ci + cs); if (ws.length === cs && ws.every((w) => w)) ca.colwidth = ws.map((w) => Math.round(w * TX.PX)); const cp = autoCell[A(c, 'table:style-name')]; if (cp) { const bg = A(cp, 'fo:background-color'); if (bg && /^#/.test(bg)) ca.bg = bg.toUpperCase(); const bd = {}; const all = BS_IN(A(cp, 'fo:border')); ['top', 'bottom', 'left', 'right'].forEach((s) => { const b = BS_IN(A(cp, 'fo:border-' + s)) || all; if (b) bd[s[0]] = b; else if (A(cp, 'fo:border-' + s) === 'none' || A(cp, 'fo:border') === 'none') bd[s[0]] = { s: 'none' }; }); if (Object.keys(bd).length) ca.bd = bd; const va = A(cp, 'style:vertical-align'); if (va === 'middle') ca.va = 'center'; else if (va === 'bottom') ca.va = 'bottom'; } const content = await readBlocks(c, inNote); cells.push({ type: 'table_cell', attrs: ca, content: content.filter((b) => b.type === 'paragraph' || b.type === 'table').length ? content.filter((b) => b.type === 'paragraph' || b.type === 'table') : [B.p('Normal', '')] }); ci += cs; } } if (cells.length) rows.push({ type: 'table_row', attrs: { hdr: !!hdr, h: null, hr: null, cs: false }, content: cells }); } else if (isQ(r, 'table:table-header-rows')) await walkRows(r, true); else if (isQ(r, 'table:table-rows') || isQ(r, 'table:table-row-group')) await walkRows(r, false); } };
      await walkRows(el, false);
      if (!rows.length) return B.p('Normal', '');
      if (rows[0].attrs.hdr) tAttr.look.hdr = true;
      return { type: 'table', attrs: tAttr, content: rows };
    }
    const textEl = content.getElementsByTagNameNS(NSU.office, 'text')[0];
    const blocks = await readBlocks(textEl, false);
    {
      let si = { master: null, blocks: [] }; sections.push(si);
      for (const b of blocks) {
        const m = b._master; delete b._master; const pn = b._pnum; delete b._pnum;
        if (m && m !== si.master) { if (si.blocks.length) { si = { master: m, blocks: [] }; sections.push(si); } else si.master = m; }
        if (pn != null) si.pnum = pn;
        if (b.type === 'page_break' && si.blocks.length === 0) continue;
        si.blocks.push(b);
      }
      sections.forEach((x) => { while (x.blocks.length > 1 && x.blocks[x.blocks.length - 1].type === 'page_break') x.blocks.pop(); });
    }
    /* pages maîtresses → mise en page */
    const layouts = {}, mastersEl = {};
    if (stylesX) {
      Array.from(stylesX.getElementsByTagNameNS(NSU.style, 'page-layout')).forEach((l) => { layouts[A(l, 'style:name')] = l; });
      Array.from(stylesX.getElementsByTagNameNS(NSU.style, 'master-page')).forEach((m) => { mastersEl[A(m, 'style:name')] = m; });
    }
    const parts = {};
    const partOf = async (el, kind) => { if (!el) return null; const bl = await readBlocks(el, true); if (!bl.length) return null; const id = TX.uid('P'); parts[id] = { doc: B.part(bl.map((b) => (b.type === 'paragraph' && b.attrs.s === 'Normal') ? Object.assign(b, { attrs: Object.assign({}, b.attrs, { s: kind === 'hdr' ? 'EnTete' : 'PiedPage' }) }) : b)) }; return id; };
    const pgCache = {};
    async function pgOf(master) {
      const mname = master || Object.keys(mastersEl).find((k) => /^(Standard|Default)$/i.test(k)) || Object.keys(mastersEl)[0];
      if (pgCache[mname]) return O.clone(pgCache[mname]);
      const pg = TX.defaultPage(); const m = mastersEl[mname];
      if (m) {
        const l = layouts[A(m, 'style:page-layout-name')]; const lp = l && kidQ(l, 'style:page-layout-properties');
        if (lp) {
          pg.w = len(A(lp, 'fo:page-width')) || pg.w; pg.h = len(A(lp, 'fo:page-height')) || pg.h; pg.orient = pg.w > pg.h ? 'landscape' : 'portrait';
          const f = TX.PAGE_SIZES.find((s) => (Math.abs(s.w - pg.w) < 3 && Math.abs(s.h - pg.h) < 3) || (Math.abs(s.h - pg.w) < 3 && Math.abs(s.w - pg.h) < 3)); pg.size = f ? f.id : 'custom';
          pg.mt = len(A(lp, 'fo:margin-top')) || 0; pg.mb = len(A(lp, 'fo:margin-bottom')) || 0; pg.ml = len(A(lp, 'fo:margin-left')) || 0; pg.mr = len(A(lp, 'fo:margin-right')) || 0;
          const nf = A(lp, 'style:num-format'); if (nf && NF[nf] && NF[nf] !== 'decimal') pg.numFmt = NF[nf];
          const cols = kidQ(lp, 'style:columns'); if (cols && +(A(cols, 'fo:column-count') || 1) > 1) pg.cols = { n: +A(cols, 'fo:column-count'), gap: len(A(cols, 'fo:column-gap')) || 35.4, sep: !!kidQ(cols, 'style:column-sep') };
          const b = BS_IN(A(lp, 'fo:border') || A(lp, 'fo:border-top')); if (b) pg.bd = { s: b.s, w: b.w, c: b.c, from: 'text', sp: len(A(lp, 'fo:padding') || A(lp, 'fo:padding-top')) || 4 };
          const bg = A(lp, 'fo:background-color'); if (bg && /^#/.test(bg) && bg.toUpperCase() !== '#FFFFFF') settings.pageColor = bg.toUpperCase();
        }
        // en-tête et pied : la marge de la page ODF va jusqu'à l'en-tête ; Texte mesure la marge jusqu'au corps
        const hs = l && kidQ(kidQ(l, 'style:header-style'), 'style:header-footer-properties'), fs = l && kidQ(kidQ(l, 'style:footer-style'), 'style:header-footer-properties');
        const hdr = kidQ(m, 'style:header'), ftr = kidQ(m, 'style:footer');
        if (hdr) { pg.mh = pg.mt; pg.mt = pg.mt + (len(A(hs, 'fo:min-height')) || 14) + (len(A(hs, 'fo:margin-bottom')) || 7); pg.hdr.def = await partOf(hdr, 'hdr'); }
        if (ftr) { pg.mf = pg.mb; pg.mb = pg.mb + (len(A(fs, 'fo:min-height')) || 14) + (len(A(fs, 'fo:margin-top')) || 7); pg.ftr.def = await partOf(ftr, 'ftr'); }
        const hl = kidQ(m, 'style:header-left'), fl = kidQ(m, 'style:footer-left'); if (hl || fl) { settings.evenOdd = true; if (hl) pg.hdr.even = await partOf(hl, 'hdr'); if (fl) pg.ftr.even = await partOf(fl, 'ftr'); }
        const hf = kidQ(m, 'style:header-first') || kidQ(m, 'loext:header-first'), ff = kidQ(m, 'style:footer-first') || kidQ(m, 'loext:footer-first'); if (hf || ff) { pg.titlePg = true; if (hf) pg.hdr.first = await partOf(hf, 'hdr'); if (ff) pg.ftr.first = await partOf(ff, 'ftr'); }
      }
      pgCache[mname] = O.clone(pg); return pg;
    }
    const secOut = [];
    for (const s of sections) { const pg = await pgOf(s.master); if (s.pnum != null) pg.numStart = s.pnum; secOut.push({ type: 'section', attrs: { pg }, content: s.blocks.length ? s.blocks : [B.p('Normal', '')] }); }
    // notes : configuration
    if (stylesX) Array.from(stylesX.getElementsByTagNameNS(NSU.text, 'notes-configuration')).forEach((n) => { const f = NF[A(n, 'style:num-format') || '1']; if (A(n, 'text:note-class') === 'endnote') settings.enFmt = f || 'lowerRoman'; else settings.fnFmt = f || 'decimal'; });
    if (tc && A(tc, 'text:track-changes') === 'true') settings.track = true;
    // thème : polices du style Normal
    settings.theme = { id: 'clair', fonts: { major: styles.Titre1 && styles.Titre1.r && styles.Titre1.r.f && styles.Titre1.r.f[0] !== '+' ? styles.Titre1.r.f : (styles.Normal.r.f || 'Liberation Sans'), minor: styles.Normal.r.f && styles.Normal.r.f[0] !== '+' ? styles.Normal.r.f : 'Liberation Serif' } };
    const props = TX.defaultProps();
    if (metaX) { const g = (ns, n) => { const e = metaX.getElementsByTagNameNS(NSU[ns], n)[0]; return e ? e.textContent : ''; }; props.title = g('dc', 'title'); props.subject = g('dc', 'subject'); props.author = g('meta', 'initial-creator') || g('dc', 'creator'); props.keywords = g('meta', 'keyword'); const c = Date.parse(g('meta', 'creation-date')); if (c) props.created = c; }
    const json = TX.emptyDoc({ sections: secOut, styles, lists, parts, notes, comments, props, settings });
    const mediaOut = {}; Object.values(media).forEach((m) => { mediaOut[m.id] = m.blob; });
    return { json: TX.IO.upgrade(json), media: mediaOut, info: { title: props.title }, warnings: Array.from(warnings) };
  };
})();
