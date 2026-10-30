/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-texte/tx-docx.js : ne pas modifier ici. */
/* Texte — format .docx (Office Open XML), écrit et lu directement (JSZip) :
   styles (avec correspondance des styles intégrés : Titre 1 ↔ Heading1…), thème (couleurs et polices), listes
   (numbering.xml), sections (formats, orientation, marges, colonnes, en-têtes et pieds première page / pages paires),
   tableaux (fusions, bordures, trames, ligne d'en-tête répétée, styles), images (aligné / flottant, rognage, rotation),
   formes et zones de texte, notes de bas de page et de fin, commentaires (réponses), révisions (insertion / suppression),
   champs (PAGE, NUMPAGES, DATE, SEQ, REF, MERGEFIELD, TOC…), liens, signets, filigrane, couleur et bordures de page.
   TX.Docx.write(json, opt) → {blob, warn} ; TX.Docx.read(zip) → {json, media, info, warnings}. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte;
  const D = TX.Docx = {};
  const B = TX.B;
  const r2 = (v) => Math.round(v * 100) / 100;
  const tw = (pt) => Math.round((pt || 0) * 20);            // twips
  const emu = (pt) => Math.round((pt || 0) * 12700);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
  const NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14 w15 wp14"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

  /* ---------------- correspondance des styles intégrés ---------------- */
  const BUILTIN = { Normal: ['Normal', 'Normal'], SansInterligne: ['NoSpacing', 'No Spacing'], Titre1: ['Heading1', 'heading 1'], Titre2: ['Heading2', 'heading 2'], Titre3: ['Heading3', 'heading 3'], Titre4: ['Heading4', 'heading 4'], Titre5: ['Heading5', 'heading 5'], Titre6: ['Heading6', 'heading 6'], Titre: ['Title', 'Title'], SousTitre: ['Subtitle', 'Subtitle'], Citation: ['Quote', 'Quote'], CitationIntense: ['IntenseQuote', 'Intense Quote'], Legende: ['Caption', 'caption'], ParagrapheListe: ['ListParagraph', 'List Paragraph'], NoteBas: ['FootnoteText', 'footnote text'], NoteFin: ['EndnoteText', 'endnote text'], EnTete: ['Header', 'header'], PiedPage: ['Footer', 'footer'], TitreTM: ['TOCHeading', 'TOC Heading'], TM1: ['TOC1', 'toc 1'], TM2: ['TOC2', 'toc 2'], TM3: ['TOC3', 'toc 3'], TM4: ['TOC4', 'toc 4'], TM5: ['TOC5', 'toc 5'], TM6: ['TOC6', 'toc 6'], TableIllustrations: ['TableofFigures', 'table of figures'], Forte: ['Strong', 'Strong'], Accentuation: ['Emphasis', 'Emphasis'], AccentuationIntense: ['IntenseEmphasis', 'Intense Emphasis'], LienHypertexte: ['Hyperlink', 'Hyperlink'], AppelNote: ['FootnoteReference', 'footnote reference'], Code: ['Code', 'Code'], CodeCar: ['CodeCar', 'Code Char'] };
  const BY_WID = {}, BY_WNAME = {};
  Object.keys(BUILTIN).forEach((k) => { BY_WID[BUILTIN[k][0].toLowerCase()] = k; BY_WNAME[BUILTIN[k][1].toLowerCase()] = k; });
  // noms français que Word écrit parfois comme identifiants
  Object.assign(BY_WID, { titre1: 'Titre1', titre2: 'Titre2', titre3: 'Titre3', titre4: 'Titre4', titre5: 'Titre5', titre6: 'Titre6', titre: 'Titre', soustitre: 'SousTitre', citation: 'Citation', citationintense: 'CitationIntense', lgende: 'Legende', paragraphedeliste: 'ParagrapheListe', notedebasdepage: 'NoteBas', notedefin: 'NoteFin', entete: 'EnTete', 'en-tte': 'EnTete', pieddepage: 'PiedPage', sansinterligne: 'SansInterligne', tm1: 'TM1', tm2: 'TM2', tm3: 'TM3', tm4: 'TM4', tm5: 'TM5', tm6: 'TM6', lev: 'Forte', accentuation: 'Accentuation', lienhypertexte: 'LienHypertexte', appelnotedebasdep: 'AppelNote', footnotereference: 'AppelNote', endnotereference: 'AppelNote', endnotetext: 'NoteFin', heading7: 'Titre6', heading8: 'Titre6', heading9: 'Titre6', bodytext: 'Normal' });
  Object.assign(BY_WNAME, { 'titre 1': 'Titre1', 'titre 2': 'Titre2', 'titre 3': 'Titre3', 'titre 4': 'Titre4', 'titre 5': 'Titre5', 'titre 6': 'Titre6', titre: 'Titre', 'sous-titre': 'SousTitre', citation: 'Citation', 'citation intense': 'CitationIntense', 'légende': 'Legende', 'paragraphe de liste': 'ParagrapheListe', 'note de bas de page': 'NoteBas', 'en-tête': 'EnTete', 'pied de page': 'PiedPage', 'sans interligne': 'SansInterligne', 'strong': 'Forte', 'élevé': 'Forte', 'emphasis': 'Accentuation', 'heading 7': 'Titre6', 'heading 8': 'Titre6', 'heading 9': 'Titre6', 'endnote reference': 'AppelNote' });
  const wid = (id) => (BUILTIN[id] ? BUILTIN[id][0] : String(id).replace(/[^A-Za-z0-9_-]/g, '') || 'Style');

  /* ---------------- couleurs ---------------- */
  const ROLE_W = { bg1: 'background1', tx1: 'text1', bg2: 'background2', tx2: 'text2', dk1: 'dark1', lt1: 'light1', dk2: 'dark2', lt2: 'light2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hyperlink' };
  const W_ROLE = {}; Object.keys(ROLE_W).forEach((k) => { W_ROLE[ROLE_W[k]] = k; }); W_ROLE.followedHyperlink = 'hlink';
  const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, '0');
  /** {val, themeColor, themeTint|themeShade} pour une couleur du document */
  function wcolor(c, theme) {
    if (!c || c === 'auto') return { val: 'auto' };
    const m = /^t:([a-z0-9]+)(?:\/([+-]?\d+))?$/.exec(c);
    const hex = (O.Themes.resolve(c, theme) || '#000000').replace('#', '').toUpperCase();
    if (!m || !ROLE_W[m[1]]) return { val: hex };
    const o = { val: hex, themeColor: ROLE_W[m[1]] };
    if (m[2]) { const k = parseInt(m[2], 10) / 100; if (k > 0) o.themeTint = hex2(255 * (1 - k)); else o.themeShade = hex2(255 * (1 + k)); }
    return o;
  }
  const colorAttrs = (o, pre) => ' w:' + (pre || '') + 'color="' + o.val + '"' + (o.themeColor ? ' w:themeColor="' + o.themeColor + '"' + (o.themeTint ? ' w:themeTint="' + o.themeTint + '"' : '') + (o.themeShade ? ' w:themeShade="' + o.themeShade + '"' : '') : '');
  const fillHex = (c, theme) => (c ? (O.Themes.resolve(c, theme) || '#FFFFFF') : '#FFFFFF').replace('#', '').toUpperCase();
  const HL_W = { yellow: 'yellow', green: 'green', cyan: 'cyan', magenta: 'magenta', blue: 'blue', red: 'red', darkBlue: 'darkBlue', darkCyan: 'darkCyan', darkGreen: 'darkGreen', darkMagenta: 'darkMagenta', darkRed: 'darkRed', darkYellow: 'darkYellow', darkGray: 'darkGray', lightGray: 'lightGray', black: 'black', white: 'white' };
  const BDR = { single: 'single', thick: 'thick', double: 'double', dotted: 'dotted', dashed: 'dashed', dotDash: 'dotDash', wave: 'wave', triple: 'triple', inset: 'inset', outset: 'outset', threeDEmboss: 'threeDEmboss', threeDEngrave: 'threeDEngrave' };
  function border(tag, b, theme, space) {
    if (!b || !b.s || b.s === 'none') return '<w:' + tag + ' w:val="nil"/>';
    const c = wcolor(b.c || '#000000', theme);
    return '<w:' + tag + ' w:val="' + (BDR[b.s] || 'single') + '" w:sz="' + Math.max(2, Math.min(96, Math.round((b.w || 0.5) * 8))) + '" w:space="' + Math.round(space != null ? space : (b.sp || 0)) + '"' + colorAttrs(c) + '/>';
  }

  /* ---------------- propriétés de caractère et de paragraphe ---------------- */
  function fontsXml(f) {
    if (!f) return '';
    if (f === '+major') return '<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:cstheme="majorBidi"/>';
    if (f === '+minor') return '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:cstheme="minorBidi"/>';
    return '<w:rFonts w:ascii="' + esc(f) + '" w:hAnsi="' + esc(f) + '" w:eastAsia="' + esc(f) + '" w:cs="' + esc(f) + '"/>';
  }
  /** r : {cs, f, sz, b, i, c, u, uc, s, dbl, caps, smcaps, sp, pos, hl, sh, va, hidden} */
  function rPr(r, theme, extra) {
    let s = '';
    if (r.cs) s += '<w:rStyle w:val="' + esc(wid(r.cs)) + '"/>';
    s += fontsXml(r.f);
    if (r.b != null) s += r.b ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>';
    if (r.i != null) s += r.i ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>';
    if (r.caps) s += '<w:caps/>'; if (r.smcaps) s += '<w:smallCaps/>';
    if (r.s) s += r.dbl ? '<w:dstrike/>' : '<w:strike/>';
    if (r.hidden) s += '<w:vanish/>';
    if (r.c) { const c = wcolor(r.c, theme); s += '<w:color w:val="' + c.val + '"' + (c.themeColor ? ' w:themeColor="' + c.themeColor + '"' + (c.themeTint ? ' w:themeTint="' + c.themeTint + '"' : '') + (c.themeShade ? ' w:themeShade="' + c.themeShade + '"' : '') : '') + '/>'; }
    if (r.sp) s += '<w:spacing w:val="' + tw(r.sp) + '"/>';
    if (r.pos) s += '<w:position w:val="' + Math.round(r.pos * 2) + '"/>';
    if (r.sz) s += '<w:sz w:val="' + Math.round(r.sz * 2) + '"/><w:szCs w:val="' + Math.round(r.sz * 2) + '"/>';
    if (r.hl && HL_W[r.hl]) s += '<w:highlight w:val="' + HL_W[r.hl] + '"/>';
    if (r.u) s += '<w:u w:val="' + (r.u === true || r.u === 1 ? 'single' : r.u === 'dash' ? 'dash' : r.u === 'wave' ? 'wave' : r.u) + '"' + (r.uc ? ' w:color="' + fillHex(r.uc, theme) + '"' : '') + '/>';
    const shade = r.sh || (r.hl && !HL_W[r.hl] ? r.hl : null);
    if (shade) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + fillHex(shade, theme) + '"/>';
    if (r.va) s += '<w:vertAlign w:val="' + (r.va === 'sub' ? 'subscript' : 'superscript') + '"/>';
    if (extra) s += extra;
    return s ? '<w:rPr>' + s + '</w:rPr>' : '';
  }
  const JC = { left: 'left', center: 'center', right: 'right', justify: 'both', both: 'both', distribute: 'distribute' };
  /** p : attributs de paragraphe (sans s) ; ctx : {theme, num(li, ls)} */
  function pPr(p, theme, ctx, opt) {
    opt = opt || {};
    let s = '';
    if (opt.style) s += '<w:pStyle w:val="' + esc(wid(opt.style)) + '"/>';
    if (p.kn != null) s += p.kn ? '<w:keepNext/>' : '<w:keepNext w:val="0"/>';
    if (p.kl != null) s += p.kl ? '<w:keepLines/>' : '<w:keepLines w:val="0"/>';
    if (p.pb || opt.pb) s += '<w:pageBreakBefore/>';
    if (p.wc === false || p.wc === 0) s += '<w:widowControl w:val="0"/>';
    if (p.li && ctx && ctx.num) { const n = ctx.num(p.li, opt.ls); if (n) s += '<w:numPr><w:ilvl w:val="' + Math.max(0, Math.min(8, p.li.l || 0)) + '"/><w:numId w:val="' + n + '"/></w:numPr>'; }
    else if (p.li === false || opt.noNum) s += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>';
    if (p.bd) s += '<w:pBdr>' + (p.bd.t ? border('top', p.bd.t, theme) : '') + (p.bd.l ? border('left', p.bd.l, theme, p.bd.l.sp == null ? 4 : p.bd.l.sp) : '') + (p.bd.b ? border('bottom', p.bd.b, theme) : '') + (p.bd.r ? border('right', p.bd.r, theme, p.bd.r.sp == null ? 4 : p.bd.r.sp) : '') + '</w:pBdr>';
    if (p.sh) s += '<w:shd w:val="clear" w:color="auto" w:fill="' + fillHex(p.sh, theme) + '"/>';
    const tabs = (p.tabs || []).concat(opt.tabs || []);
    if (tabs.length) s += '<w:tabs>' + tabs.slice().sort((a, b) => a.pos - b.pos).map((t) => '<w:tab w:val="' + (t.t === 'clear' ? 'clear' : { center: 'center', right: 'right', decimal: 'decimal', bar: 'bar' }[t.t] || 'left') + '"' + (t.lead && t.lead !== 'none' ? ' w:leader="' + ({ dot: 'dot', hyphen: 'hyphen', underscore: 'underscore', middleDot: 'middleDot' }[t.lead] || 'dot') + '"' : '') + ' w:pos="' + tw(t.pos) + '"/>').join('') + '</w:tabs>';
    let sp = '';
    if (p.sb != null) sp += ' w:before="' + tw(p.sb) + '"';
    if (p.sa != null) sp += ' w:after="' + tw(p.sa) + '"';
    if (p.ln != null) { const lr = p.lr || 'auto'; sp += lr === 'auto' ? ' w:line="' + Math.round(p.ln * 240) + '" w:lineRule="auto"' : ' w:line="' + tw(p.ln) + '" w:lineRule="' + (lr === 'exact' ? 'exact' : 'atLeast') + '"'; }
    if (sp) s += '<w:spacing' + sp + '/>';
    let ind = '';
    if (p.il != null) ind += ' w:left="' + tw(p.il) + '"';
    if (p.ir != null) ind += ' w:right="' + tw(p.ir) + '"';
    if (p.fi != null) ind += p.fi < 0 ? ' w:hanging="' + tw(-p.fi) + '"' : ' w:firstLine="' + tw(p.fi) + '"';
    if (ind) s += '<w:ind' + ind + '/>';
    if (p.ctx) s += '<w:contextualSpacing/>';
    if (p.al) s += '<w:jc w:val="' + (JC[p.al] || 'left') + '"/>';
    if (opt.lvl != null && opt.lvl > 0) s += '<w:outlineLvl w:val="' + (opt.lvl - 1) + '"/>';
    else if (p.ol != null && p.ol > 0) s += '<w:outlineLvl w:val="' + (p.ol - 1) + '"/>';
    if (opt.rpr) s += opt.rpr;
    if (opt.sect) s += opt.sect;
    return s ? '<w:pPr>' + s + '</w:pPr>' : '';
  }
  /** marques ProseMirror → propriétés r */
  function marksToR(marks) {
    const r = {}; let link = null, ins = null, del = null; const cmts = [];
    (marks || []).forEach((m) => {
      const a = m.attrs || {};
      switch (m.type) {
        case 'font': r.f = a.f; break; case 'size': r.sz = a.pt; break; case 'color': r.c = a.c; break;
        case 'hl': r.hl = a.c; break; case 'shd': r.sh = a.c; break; case 'b': r.b = 1; break; case 'nob': r.b = 0; break;
        case 'i': r.i = 1; break; case 'noi': r.i = 0; break; case 'u': r.u = a.s || 'single'; r.uc = a.c; break;
        case 's': r.s = 1; r.dbl = !!a.dbl; break; case 'va': r.va = a.v; break; case 'caps': r.caps = 1; break; case 'smcaps': r.smcaps = 1; break;
        case 'sp': r.sp = a.pt; break; case 'pos': r.pos = a.pt; break; case 'hidden': r.hidden = 1; break; case 'cs': r.cs = a.id; break;
        case 'link': link = a; break; case 'ins': ins = a; break; case 'del': del = a; break; case 'cmt': cmts.push(a.id); break;
      }
    });
    return { r, link, ins, del, cmts };
  }

  /* ---------------- rendu d'objets en images (formes complexes, graphiques, équations) ---------------- */
  async function renderToPng(html, w, h, theme, scale) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + r2(w * TX.PX) + 'px;height:' + r2(h * TX.PX) + 'px;background:transparent;' + (O.Themes.vars ? O.Themes.vars(theme) : '');
    host.innerHTML = html; document.body.appendChild(host);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const c = await O.Raster.canvas(host, { scale: scale || 2, fonts: true, width: Math.ceil(w * TX.PX), height: Math.ceil(h * TX.PX) });
      return await new Promise((ok) => c.toBlob(ok, 'image/png'));
    } catch (e) { return null; } finally { host.remove(); }
  }
  async function mathPng(tex, display, theme) {
    await TX.loadKatex();
    const host = document.createElement('span'); host.style.cssText = 'position:fixed;left:-10000px;top:0;font-size:14.67px;color:#000;display:inline-block;padding:1px;white-space:nowrap';
    try { window.katex.render(tex, host, { throwOnError: false, displayMode: !!display }); } catch (e) { host.textContent = tex; }
    document.body.appendChild(host);
    try { const w = host.offsetWidth + 2, h = host.offsetHeight + 2; const c = await O.Raster.canvas(host, { scale: 3, fonts: true, width: Math.ceil(w * 1.4) + 8, height: h, css: '.katex,.katex *{white-space:nowrap!important}' }); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let right = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) { const col = ((i - 3) / 4) % c.width; if (col > right) right = col; } const cw = Math.max(3, right + 3), o2 = document.createElement('canvas'); o2.width = cw; o2.height = c.height; o2.getContext('2d').drawImage(c, 0, 0); const blob = await new Promise((ok) => o2.toBlob(ok, 'image/png')); return { blob, w: cw / 3 / TX.PX, h: h / TX.PX }; }
    catch (e) { return null; } finally { host.remove(); }
  }
  D._renderPng = renderToPng; D._mathPng = mathPng;
  /** PNG de repli d'un SVG, à 2× la taille affichée */
  async function svgPng(blob, wPt, hPt) {
    const url = URL.createObjectURL(blob);
    try { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = Math.max(2, Math.round((wPt || 100) * 8 / 3)); c.height = Math.max(2, Math.round((hPt || 100) * 8 / 3)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return await new Promise((ok) => c.toBlob(ok, 'image/png')); }
    catch (e) { return null; } finally { URL.revokeObjectURL(url); }
  }
  async function toPngBlob(blob) {
    const url = URL.createObjectURL(blob);
    try { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth || 300; c.height = im.naturalHeight || 150; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return await new Promise((ok) => c.toBlob(ok, 'image/png')); }
    catch (e) { return null; } finally { URL.revokeObjectURL(url); }
  }
  /** Texte d'une zone de texte (HTML de l'éditeur riche) → paragraphes OOXML */
  function htmlToWParas(html, theme) {
    const box = document.createElement('div'); box.innerHTML = html || '';
    const paras = []; let cur = null;
    const flush = () => { if (cur) paras.push(cur); cur = null; };
    const walk = (n, r) => {
      if (n.nodeType === 3) { if (!cur) cur = { al: null, runs: [] }; if (n.data) cur.runs.push({ t: n.data, r: Object.assign({}, r) }); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase(), st = n.style || {}, rr = Object.assign({}, r);
      if (/^(b|strong)$/.test(tag) || /^(bold|[6-9]00)$/.test(st.fontWeight)) rr.b = 1;
      if (/^(i|em)$/.test(tag) || st.fontStyle === 'italic') rr.i = 1;
      if (tag === 'u' || /underline/.test(st.textDecoration || '')) rr.u = 'single';
      if (st.color) { const c = O.cssToHex(st.color); if (c) rr.c = c; }
      if (st.fontSize) { const m = /([\d.]+)(px|pt)/.exec(st.fontSize); if (m) rr.sz = m[2] === 'px' ? +m[1] * 0.75 : +m[1]; }
      if (tag === 'br') { if (!cur) cur = { runs: [] }; cur.runs.push({ br: 1 }); return; }
      const block = /^(p|div|li|h[1-6])$/.test(tag);
      if (block) { flush(); cur = { al: st.textAlign || null, runs: [] }; if (tag === 'li') cur.runs.push({ t: '• ', r: rr }); }
      n.childNodes.forEach((c) => walk(c, rr));
      if (block) flush();
    };
    box.childNodes.forEach((c) => walk(c, {}));
    flush();
    if (!paras.length) paras.push({ runs: [] });
    return paras.map((p) => '<w:p>' + (p.al ? '<w:pPr><w:jc w:val="' + (JC[p.al] || (p.al === 'start' ? 'left' : 'center')) + '"/></w:pPr>' : '') + p.runs.map((x) => x.br ? '<w:r><w:br/></w:r>' : '<w:r>' + rPr(x.r, theme) + '<w:t xml:space="preserve">' + esc(x.t) + '</w:t></w:r>').join('') + '</w:p>').join('');
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
    const z = new window.JSZip();
    const app = opt.app || null;
    const isCurrent = app && app.ed && app.ed.view.state.doc.eq(docNode);
    const ctx = isCurrent ? app.ctx : { props: () => props, attrs: () => attrs, chartDoc: () => ({ theme }), noteLabel: (id, end) => String((end ? nums.notes.end : nums.notes.foot)[id] || ''), fileName: () => opt.name || 'document', seqAt: (pos) => nums.seqPos[pos] || 1, mergeRecord: () => (opt.record || null), pageLabel: () => '', pageCount: () => 1, wordCount: () => 0, refText: (a) => a.cache || '', tocEntries: (a) => (a.kind === 'tof' ? nums.captions.filter((c) => !a.label || c.label === a.label).map((c) => ({ text: c.text, level: 1, pos: c.pos, page: '' })) : nums.heads.filter((h) => h.level <= (a.levels || 3) && h.text).map((h) => ({ text: (h.label ? h.label + ' ' : '') + h.text, level: h.level, pos: h.pos, page: '' }))) };
    /* relations et médias */
    const rels = { document: [], header: {}, footer: {} };
    let relN = 0, mediaN = 0, drawN = 0, bmN = 0;
    const mediaDone = new Map();
    const addRel = (bucket, type, target, ext) => { const id = 'rId' + (++relN + 20); bucket.push('<Relationship Id="' + id + '" Type="' + REL + type + '" Target="' + esc(target) + '"' + (ext ? ' TargetMode="External"' : '') + '/>'); return id; };
    const ctypes = new Set();
    async function mediaRel(bucket, key, getBlob) {
      let file = mediaDone.get(key);
      if (!file) {
        let blob = await getBlob(); if (!blob) return null;
        // formats que Word lit tels quels (EMF / WMF / TIFF venus d'un .docx) : jamais convertis, jamais perdus
        let ext = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/x-emf': 'emf', 'image/emf': 'emf', 'image/x-wmf': 'wmf', 'image/wmf': 'wmf', 'image/tiff': 'tiff', 'image/svg+xml': 'svg' }[blob.type];
        if (blob.type === 'image/x-svm') { // format propre à LibreOffice, illisible par Word : cadre à la place
          try { blob = await toPngBlob(await (await fetch(O.placeholderImage('Image SVM', 'format LibreOffice', 400, 220))).blob()); ext = 'png'; warn.add('Les images au format SVM (LibreOffice) sont remplacées par un cadre dans le .docx.'); } catch (e) { return null; }
        }
        if (!ext && O.unviewableImage(blob.type)) ext = O.imageKind(blob.type).toLowerCase();
        if (!ext) { blob = await toPngBlob(blob); ext = 'png'; if (!blob) return null; }
        file = 'media/image' + (++mediaN) + '.' + ext; ctypes.add(ext);
        z.file('word/' + file, blob); mediaDone.set(key, file);
      }
      return addRel(bucket, 'image', file);
    }
    /* objets gardés tels quels à l'import (graphiques, SmartArt, groupes, objets OLE…) : parties recopiées sous un
       nouveau nom, relations renumérotées ; null si une pièce manque ou si l'objet a été modifié dans Texte */
    const overrides = []; let keepN = 0;
    const relPath = (fromDir, to) => { const a = fromDir.split('/').filter(Boolean), b = to.split('/'); let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++; return '../'.repeat(a.length - i) + b.slice(i).join('/'); };
    const sigOf = (a) => a.kind === 'chart' ? JSON.stringify(a.chart) : a.kind === 'smart' ? JSON.stringify(a.smart) : a.kind === 'textbox' || a.kind === 'shape' ? a.html : 'ole';
    async function keepXml(k, bucket, a) {
      if (!k || !k.xml || (k.sig && a && sigOf(a) !== k.sig && !(k.sig === 'ole' && !a.kind))) return null;
      const done = new Map();
      async function part(path) {
        const e = k.parts[path]; if (!e) return null; if (done.has(path)) return done.get(path);
        const blob = TX.media.blobs[e.m]; if (!blob) return null;
        const dir = path.replace(/[^/]+$/, ''), np = dir + path.slice(dir.length).replace(/(\.[^.]+)?$/, (x) => '_k' + (++keepN) + (x || ''));
        done.set(path, np);
        const rl = [];
        for (const r of e.rels) { let t = r.t; if (!r.ext) { const n2 = await part(r.t); if (!n2) continue; t = relPath(dir, n2); } rl.push('<Relationship Id="' + esc(r.id) + '" Type="' + esc(r.type) + '" Target="' + esc(t) + '"' + (r.ext ? ' TargetMode="External"' : '') + '/>'); }
        z.file(np, blob);
        if (rl.length) z.file(dir + '_rels/' + np.slice(dir.length) + '.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rl.join('') + '</Relationships>');
        overrides.push(['/' + np, e.ct || 'application/octet-stream']);
        return np;
      }
      const map = {};
      for (const rid of Object.keys(k.rels || {})) {
        const r = k.rels[rid]; let target;
        if (r.ext) target = r.t; else { const np = await part(r.t); if (!np) return null; target = relPath('word/', np); }
        const id = 'rId' + (++relN + 20); bucket.push('<Relationship Id="' + id + '" Type="' + esc(r.type) + '" Target="' + esc(target) + '"' + (r.ext ? ' TargetMode="External"' : '') + '/>'); map[rid] = id;
      }
      let x = k.xml.replace(/(\sr:[A-Za-z]+=")([^"]*)(")/g, (m0, p1, id, p3) => (map[id] ? p1 + map[id] + p3 : m0));
      x = x.replace(/(<wp:docPr\b[^>]*?\sid=")(\d+)(")/g, (m0, p1, id, p3) => p1 + (++drawN + 1000) + p3);
      if (a && k.w && a.w && (Math.abs(a.w - k.w) > 0.5 || Math.abs(a.h - k.h) > 0.5)) x = x.replace(/(<wp:extent\s+cx=")\d+("\s+cy=")\d+/, (m0, p1, p2) => p1 + emu(a.w) + p2 + emu(a.h));
      return '<w:r>' + x + '</w:r>';
    }
    /* listes : abstractNum + num */
    const absXml = [], numXml = []; const absOf = {}, cur = {}; let numN = 0;
    const lvlXml = (L, i) => {
      const bullet = L.f === 'bullet';
      const font = L.font || (bullet ? (/[•◦▪–\-·o]/.test(L.t || '•') ? 'Arial' : 'Segoe UI Symbol') : null);
      return '<w:lvl w:ilvl="' + i + '"><w:start w:val="' + (L.st == null ? 1 : L.st) + '"/><w:numFmt w:val="' + (bullet ? 'bullet' : ({ decimal: 'decimal', lowerLetter: 'lowerLetter', upperLetter: 'upperLetter', lowerRoman: 'lowerRoman', upperRoman: 'upperRoman', decimalZero: 'decimalZero', ordinal: 'ordinal', none: 'none', cardinalText: 'cardinalText' }[L.f] || 'decimal')) + '"/><w:lvlText w:val="' + esc(bullet ? (L.t || '•') : (L.t || '%' + (i + 1) + '.')) + '"/><w:lvlJc w:val="left"/><w:pPr>' + (L.tab ? '<w:tabs><w:tab w:val="num" w:pos="' + tw((L.il || 0) + 36) + '"/></w:tabs>' : '') + '<w:ind w:left="' + tw(L.il || 0) + '" w:hanging="' + tw(L.hg || 0) + '"/></w:pPr>' + ((font || L.c) ? '<w:rPr>' + (font ? '<w:rFonts w:ascii="' + esc(font) + '" w:hAnsi="' + esc(font) + '" w:hint="default"/>' : '') + (L.c ? '<w:color w:val="' + fillHex(L.c, theme) + '"/>' : '') + '</w:rPr>' : '') + '</w:lvl>';
    };
    Object.keys(lists).forEach((id, k) => {
      const def = lists[id]; absOf[id] = k;
      absXml.push('<w:abstractNum w:abstractNumId="' + k + '"><w:multiLevelType w:val="' + (def.k === 'multi' ? 'multilevel' : 'hybridMultilevel') + '"/>' + Array.from({ length: 9 }, (x, i) => lvlXml(def.lv[i] || def.lv[def.lv.length - 1] || { f: 'bullet', t: '•', il: 36 * (i + 1), hg: 18 }, i)).join('') + '</w:abstractNum>');
    });
    const num = (li, ls) => {
      if (!li || !li.id || absOf[li.id] == null) return 0;
      if (cur[li.id] == null || ls != null) {
        const n = ++numN; cur[li.id] = n;
        numXml.push('<w:num w:numId="' + n + '"><w:abstractNumId w:val="' + absOf[li.id] + '"/>' + (ls != null ? '<w:lvlOverride w:ilvl="' + (li.l || 0) + '"><w:startOverride w:val="' + ls + '"/></w:lvlOverride>' : '') + '</w:num>');
      }
      return cur[li.id];
    };
    // les styles de paragraphe associés à une liste (titres numérotés) : numéros propres
    const styleNum = {};
    Object.keys(styles).forEach((id) => { const p = styles[id].p || {}; if (p.li && p.li.id && absOf[p.li.id] != null) { const n = ++numN; styleNum[id] = n; numXml.push('<w:num w:numId="' + n + '"><w:abstractNumId w:val="' + absOf[p.li.id] + '"/></w:num>'); } });
    // les paragraphes d'une liste « style » partagent le numéro du style
    Object.keys(styleNum).forEach((sid) => { const p = styles[sid].p; cur[p.li.id] = styleNum[sid]; });
    const pctx = { num };

    /* commentaires, notes */
    const comments = attrs.comments || {}, cmtIds = {}; let cmtN = 0;
    const cmtId = (id) => { if (cmtIds[id] == null) cmtIds[id] = cmtN++; return cmtIds[id]; };
    const notesXml = { foot: [], end: [] }; const noteIds = {}; let fnN = 0, enN = 0;
    let revN = 1000;
    const contentWidth = (pg) => pg.w - pg.ml - pg.mr - (pg.gut || 0);

    /* inline → runs */
    async function inlineXml(par, bucket, state) {
      const items = [];
      const children = []; par.forEach((c, off) => children.push({ c, off }));
      for (let k = 0; k < children.length; k++) {
        const node = children[k].c; const mk = marksToR(node.marks.map((m) => ({ type: m.type.name, attrs: m.attrs })));
        // commentaires : ouverture / fermeture
        const now = new Set(mk.cmts);
        state.open.forEach((id) => { if (!now.has(id)) { items.push({ x: '<w:commentRangeEnd w:id="' + cmtId(id) + '"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="' + cmtId(id) + '"/></w:r>' + replies(id) }); state.open.delete(id); } });
        mk.cmts.forEach((id) => { if (!state.open.has(id) && comments[id]) { items.push({ x: '<w:commentRangeStart w:id="' + cmtId(id) + '"/>' + replyStarts(id) }); state.open.add(id); } });
        let x = '';
        const t = node.type.name, rp = rPr(mk.r, theme);
        if (node.isText) {
          const parts = node.text.split(/(­)/);
          x = parts.map((s) => s === '­' ? '<w:r>' + rp + '<w:softHyphen/></w:r>' : s ? '<w:r>' + rp + (mk.del ? '<w:delText xml:space="preserve">' : '<w:t xml:space="preserve">') + esc(s) + (mk.del ? '</w:delText>' : '</w:t>') + '</w:r>' : '').join('');
        } else if (t === 'hard_break') x = '<w:r>' + rp + '<w:br/></w:r>';
        else if (t === 'tab') x = '<w:r>' + rp + '<w:tab/></w:r>';
        else if (t === 'bookmark') { const id = ++bmN; x = '<w:bookmarkStart w:id="' + id + '" w:name="' + esc(bkName(node.attrs.name)) + '"/><w:bookmarkEnd w:id="' + id + '"/>'; }
        else if (t === 'fnref') {
          const a = node.attrs, end = !!a.end; let nid = noteIds[a.id];
          if (nid == null) {
            nid = noteIds[a.id] = end ? ++enN : ++fnN;
            const nd = (attrs.notes || {})[a.id]; let blocks = '';
            try { const nn = TX.schema.nodeFromJSON((nd && nd.doc) || B.part([B.p(end ? 'NoteFin' : 'NoteBas', '')])); blocks = await blocksXml(nn.firstChild, bucket, { note: end ? 'end' : 'foot', open: new Set() }); } catch (e) { blocks = '<w:p/>'; }
            const ref = '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/>' + (end ? '' : '') + '</w:rPr>' + (a.mark ? '<w:t>' + esc(a.mark) + '</w:t>' : end ? '<w:endnoteRef/>' : '<w:footnoteRef/>') + '</w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>';
            blocks = blocks.replace(/^<w:p>(<w:pPr>.*?<\/w:pPr>)?/, (m0, pp) => '<w:p>' + (pp || '<w:pPr><w:pStyle w:val="' + (end ? 'EndnoteText' : 'FootnoteText') + '"/></w:pPr>') + ref);
            notesXml[end ? 'end' : 'foot'].push('<w:' + (end ? 'endnote' : 'footnote') + ' w:id="' + nid + '">' + blocks + '</w:' + (end ? 'endnote' : 'footnote') + '>');
          }
          x = '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr>' + (a.mark ? '<w:' + (end ? 'endnote' : 'footnote') + 'Reference w:customMarkFollows="1" w:id="' + nid + '"/><w:t>' + esc(a.mark) + '</w:t>' : '<w:' + (end ? 'endnote' : 'footnote') + 'Reference w:id="' + nid + '"/>') + '</w:r>';
        } else if (t === 'field') x = fieldXml(node.attrs, rp, state, children[k].off);
        else if (t === 'image') x = await imageXml(node.attrs, bucket);
        else if (t === 'drawing') x = await drawingXml(node.attrs, bucket);
        else if (t === 'math') { const r = await mathPng(node.attrs.tex, node.attrs.display, theme); if (r && r.blob) { const rid = await mediaRel(bucket, 'math:' + node.attrs.tex, async () => r.blob); x = rid ? '<w:r>' + drawingInline(rid, r.w, r.h, node.attrs.tex, {}) + '</w:r>' : ''; warn.add('Les équations sont enregistrées en images (texte LaTeX dans le texte de remplacement).'); } }
        if (!x) continue;
        if (mk.ins) x = '<w:ins w:id="' + (++revN) + '" w:author="' + esc(mk.ins.a || 'Auteur') + '" w:date="' + esc(isoDate(mk.ins.d)) + '">' + x + '</w:ins>';
        if (mk.del) x = '<w:del w:id="' + (++revN) + '" w:author="' + esc(mk.del.a || 'Auteur') + '" w:date="' + esc(isoDate(mk.del.d)) + '">' + x + '</w:del>';
        items.push({ x, link: mk.link });
      }
      // liens : regroupement des runs consécutifs
      let out = '', i = 0;
      while (i < items.length) {
        const it = items[i];
        if (!it.link) { out += it.x; i++; continue; }
        const href = it.link.href; let g = '';
        while (i < items.length && items[i].link && items[i].link.href === href) { g += items[i].x; i++; }
        if (/^#/.test(href)) out += '<w:hyperlink w:anchor="' + esc(bkName(href.slice(1).replace(/^bk-/, ''))) + '" w:history="1">' + g + '</w:hyperlink>';
        else out += '<w:hyperlink r:id="' + addRel(bucket, 'hyperlink', href, true) + '" w:history="1">' + g + '</w:hyperlink>';
      }
      return out;
    }
    const replies = (id) => Object.keys(comments).filter((k) => comments[k].p === id).map((k) => '<w:commentRangeEnd w:id="' + cmtId(k) + '"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="' + cmtId(k) + '"/></w:r>').join('');
    const replyStarts = (id) => Object.keys(comments).filter((k) => comments[k].p === id).map((k) => '<w:commentRangeStart w:id="' + cmtId(k) + '"/>').join('');
    const isoDate = (d) => { try { return new Date(d || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z'); } catch (e) { return new Date().toISOString().replace(/\.\d+Z$/, 'Z'); } };
    const bkName = (n) => { let s = String(n || 'signet').replace(/[^A-Za-z0-9_À-ÿ]/g, '_'); if (!/^[A-Za-zÀ-ÿ_]/.test(s)) s = 'S' + s; return s.slice(0, 40); };
    const DATE_W = (f) => String(f || 'd/MM/yyyy').replace(/yyyy/g, 'yyyy');
    function fieldXml(a, rp, state, off) {
      let instr = '', res = '';
      try { res = TX.fieldText(a, ctx, state.pos != null ? state.pos + 1 + off : 0, null); } catch (e) { res = a.cache || ''; }
      switch (a.f) {
        case 'page': instr = 'PAGE' + fmtSw(state.pg && state.pg.numFmt); res = state.note ? res : '1'; break;
        case 'pages': instr = 'NUMPAGES'; break;
        case 'sectionpages': instr = 'SECTIONPAGES'; break;
        case 'date': instr = 'DATE \\@ "' + DATE_W(a.fmt || 'd/MM/yyyy') + '"'; break;
        case 'time': instr = 'TIME \\@ "' + (a.fmt || 'HH:mm') + '"'; break;
        case 'savedate': instr = 'SAVEDATE \\@ "' + DATE_W(a.fmt || 'd/MM/yyyy') + '"'; break;
        case 'created': instr = 'CREATEDATE \\@ "' + DATE_W(a.fmt || 'd/MM/yyyy') + '"'; break;
        case 'title': instr = 'TITLE'; break; case 'author': instr = 'AUTHOR'; break; case 'subject': instr = 'SUBJECT'; break;
        case 'file': instr = 'FILENAME'; break; case 'words': instr = 'NUMWORDS'; break;
        case 'seq': instr = 'SEQ ' + (String(a.name || 'Figure').replace(/\s+/g, '_')) + ' \\* ARABIC'; break;
        case 'merge': instr = 'MERGEFIELD ' + (/\s/.test(a.name || '') ? '"' + a.name + '"' : (a.name || 'champ')); if (!opt.record) res = '«' + (a.name || 'champ') + '»'; break;
        case 'ref': {
          const r = a.ref || {}; const target = r.kind === 'note' ? '_Ref' + bkName(r.id) : bkName(r.id);
          instr = (a.show === 'page' ? 'PAGEREF ' : r.kind === 'note' ? 'NOTEREF ' : 'REF ') + target + (a.show === 'number' && r.kind !== 'note' ? ' \\r' : '') + (a.show === 'above' ? ' \\p' : '') + ' \\h';
          state.refs.add(target); break;
        }
        default: instr = String(a.f || '').toUpperCase();
      }
      if (opt.record && a.f === 'merge') return '<w:r>' + rp + '<w:t xml:space="preserve">' + esc(res) + '</w:t></w:r>';
      return '<w:r>' + rp + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + rp + '<w:instrText xml:space="preserve"> ' + esc(instr) + ' </w:instrText></w:r><w:r>' + rp + '<w:fldChar w:fldCharType="separate"/></w:r><w:r>' + rp + '<w:t xml:space="preserve">' + esc(res) + '</w:t></w:r><w:r>' + rp + '<w:fldChar w:fldCharType="end"/></w:r>';
    }
    const fmtSw = (f) => (f && f !== 'decimal' ? ' \\* ' + ({ lowerRoman: 'roman', upperRoman: 'ROMAN', lowerLetter: 'alphabetic', upperLetter: 'ALPHABETIC' }[f] || 'ARABIC') : '');
    /* images */
    function anchorPos(a) {
      const behind = a.wrap === 'behind', front = a.wrap === 'front';
      let h = '';
      if (a.al === 'center' || a.al === 'right' || (a.al === 'left' && !a.x)) h = '<wp:positionH relativeFrom="column"><wp:align>' + a.al + '</wp:align></wp:positionH>';
      else h = '<wp:positionH relativeFrom="column"><wp:posOffset>' + emu(a.x || 0) + '</wp:posOffset></wp:positionH>';
      const v = '<wp:positionV relativeFrom="paragraph"><wp:posOffset>' + emu(a.y || 0) + '</wp:posOffset></wp:positionV>';
      const wrap = a.wrap === 'square' ? '<wp:wrapSquare wrapText="bothSides"/>' : a.wrap === 'tight' ? '<wp:wrapTight wrapText="bothSides"><wp:wrapPolygon edited="0"><wp:start x="0" y="0"/><wp:lineTo x="0" y="21600"/><wp:lineTo x="21600" y="21600"/><wp:lineTo x="21600" y="0"/><wp:lineTo x="0" y="0"/></wp:wrapPolygon></wp:wrapTight>' : a.wrap === 'topBottom' ? '<wp:wrapTopAndBottom/>' : '<wp:wrapNone/>';
      return { open: '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="' + (behind ? 251658240 : 251659264 + (++drawN)) + '" behindDoc="' + (behind ? 1 : 0) + '" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' + h + v, wrap, front };
    }
    function graphicPic(rid, w, h, a) {
      const crop = a.crop && (a.crop.l || a.crop.t || a.crop.r || a.crop.b) ? '<a:srcRect l="' + Math.round((a.crop.l || 0) * 100000) + '" t="' + Math.round((a.crop.t || 0) * 100000) + '" r="' + Math.round((a.crop.r || 0) * 100000) + '" b="' + Math.round((a.crop.b || 0) * 100000) + '"/>' : '';
      const ln = a.bd && a.bd.s && a.bd.s !== 'none' ? '<a:ln w="' + emu(a.bd.w || 1) + '"><a:solidFill><a:srgbClr val="' + fillHex(a.bd.c || '#000000', theme) + '"/></a:solidFill>' + (a.bd.s === 'dashed' ? '<a:prstDash val="dash"/>' : a.bd.s === 'dotted' ? '<a:prstDash val="sysDot"/>' : '') + '</a:ln>' : '';
      const id = ++drawN;
      return '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + id + '" name="Image ' + id + '" descr="' + esc(a.alt || '') + '"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"' + (a.svgRid ? '><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="' + a.svgRid + '"/></a:ext></a:extLst></a:blip>' : '/>') + crop + '<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm' + (a.rot ? ' rot="' + Math.round(a.rot * 60000) + '"' : '') + (a.fh ? ' flipH="1"' : '') + (a.fv ? ' flipV="1"' : '') + '><a:off x="0" y="0"/><a:ext cx="' + emu(w) + '" cy="' + emu(h) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' + ln + '</pic:spPr></pic:pic></a:graphicData></a:graphic>';
    }
    function docPr(a, name) { const id = ++drawN; return '<wp:docPr id="' + id + '" name="' + esc(name + ' ' + id) + '" descr="' + esc(a.alt || '') + '"' + (a.dec ? '' : '') + '>' + (a.link ? '' : '') + '</wp:docPr><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'; }
    function drawingInline(rid, w, h, alt, a) { return '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + emu(w) + '" cy="' + emu(h) + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' + docPr({ alt }, 'Image') + graphicPic(rid, w, h, Object.assign({ alt }, a || {})) + '</wp:inline></w:drawing>'; }
    async function imageXml(a, bucket) {
      if (a.keep && a.keep.xml) { const k = await keepXml(a.keep, bucket, a); if (k) return k; }
      const getB = async () => { if (a.m && TX.media.blobs[a.m]) return TX.media.blobs[a.m]; if (a.src) { try { return await (await fetch(a.src)).blob(); } catch (e) { return null; } } return null; };
      const b0 = await getB();
      let rid, svgRid = null;
      if (b0 && b0.type === 'image/svg+xml') {
        // SVG : Word attend une image PNG de repli dans a:blip et le SVG dans l'extension svgBlip
        svgRid = await mediaRel(bucket, 'm:' + (a.m || a.src), async () => b0);
        rid = await mediaRel(bucket, 'svgpng:' + (a.m || a.src), async () => svgPng(b0, a.w, a.h));
        if (!rid) { rid = svgRid; svgRid = null; }
      } else rid = await mediaRel(bucket, 'm:' + (a.m || a.src), async () => b0);
      if (!rid) { warn.add('Une image introuvable n\'a pas été enregistrée.'); return ''; }
      if (svgRid) a = Object.assign({}, a, { svgRid });
      if (!a.wrap || a.wrap === 'inline') return '<w:r>' + drawingInline(rid, a.w, a.h, a.alt, a) + '</w:r>';
      const p = anchorPos(a);
      return '<w:r><w:drawing>' + p.open + '<wp:extent cx="' + emu(a.w) + '" cy="' + emu(a.h) + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' + p.wrap + docPr(a, 'Image') + graphicPic(rid, a.w, a.h, a) + '</wp:anchor></w:drawing></w:r>';
    }
    async function drawingXml(a, bucket) {
      if (a.keep && a.keep.xml) { const k = await keepXml(a.keep, bucket, a); if (k) return k; }
      const P = window.Pres;
      const isGeom = (a.kind === 'shape' || a.kind === 'textbox') && (!P || !P.SHAPES || P.SHAPES.some((s) => s.id === a.shape) || a.kind === 'textbox');
      if (!isGeom) {
        const html = '<div style="width:100%;height:100%">' + TX.drawingSvg(a, { theme }) + '</div>';
        const blob = await renderToPng(html, a.w, a.h, theme, 2);
        const rid = blob && await mediaRel(bucket, 'd:' + (++drawN), async () => blob);
        if (!rid) return '';
        warn.add('Les icônes, graphiques et SmartArt sont enregistrés en images.');
        const ia = Object.assign({}, a, { crop: null, bd: null, fh: false, fv: false });
        if (!a.wrap || a.wrap === 'inline') return '<w:r>' + drawingInline(rid, a.w, a.h, a.alt, ia) + '</w:r>';
        const p = anchorPos(a); return '<w:r><w:drawing>' + p.open + '<wp:extent cx="' + emu(a.w) + '" cy="' + emu(a.h) + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' + p.wrap + docPr(a, 'Objet') + graphicPic(rid, a.w, a.h, ia) + '</wp:anchor></w:drawing></w:r>';
      }
      const prst = a.kind === 'textbox' ? 'rect' : a.shape || 'rect';
      const fill = a.fill ? '<a:solidFill>' + drawClr(a.fill) + '</a:solidFill>' : '<a:noFill/>';
      const line = a.line ? '<a:ln w="' + emu(a.line.w || 1) + '"><a:solidFill>' + drawClr(a.line.c || '#000000') + '</a:solidFill>' + (a.line.dash === 'dash' ? '<a:prstDash val="dash"/>' : '') + '</a:ln>' : '<a:ln><a:noFill/></a:ln>';
      const pad = emu(a.pad == null ? 7.2 : a.pad);
      const txt = a.html ? '<wps:txbx><w:txbxContent>' + htmlToWParas(a.html, theme) + '</w:txbxContent></wps:txbx>' : '';
      const id = ++drawN;
      const g = '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr' + (a.kind === 'textbox' ? ' txBox="1"' : '') + '/><wps:spPr><a:xfrm' + (a.rot ? ' rot="' + Math.round(a.rot * 60000) + '"' : '') + '><a:off x="0" y="0"/><a:ext cx="' + emu(a.w) + '" cy="' + emu(a.h) + '"/></a:xfrm><a:prstGeom prst="' + esc(prst) + '"><a:avLst/></a:prstGeom>' + fill + line + '</wps:spPr>' + txt + '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="' + pad + '" tIns="' + pad + '" rIns="' + pad + '" bIns="' + pad + '" anchor="' + ({ top: 't', middle: 'ctr', bottom: 'b' }[a.va] || 'ctr') + '" anchorCtr="0"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic>';
      const dp = '<wp:docPr id="' + id + '" name="' + (a.kind === 'textbox' ? 'Zone de texte ' : 'Forme ') + id + '" descr="' + esc(a.alt || '') + '"/><wp:cNvGraphicFramePr/>';
      if (!a.wrap || a.wrap === 'inline') return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + emu(a.w) + '" cy="' + emu(a.h) + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' + dp + g + '</wp:inline></w:drawing></w:r>';
      const p = anchorPos(a);
      return '<w:r><w:drawing>' + p.open + '<wp:extent cx="' + emu(a.w) + '" cy="' + emu(a.h) + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' + p.wrap + dp + g + '</wp:anchor></w:drawing></w:r>';
    }
    function drawClr(c) {
      const m = /^t:([a-z0-9]+)(?:\/([+-]?\d+))?$/.exec(c || '');
      if (m && /^(accent[1-6]|tx1|tx2|bg1|bg2|hlink|dk1|dk2|lt1|lt2)$/.test(m[1])) { const k = m[2] ? parseInt(m[2], 10) : 0; return '<a:schemeClr val="' + m[1] + '">' + (k > 0 ? '<a:lumMod val="' + (100 - k) * 1000 + '"/><a:lumOff val="' + k * 1000 + '"/>' : k < 0 ? '<a:lumMod val="' + (100 + k) * 1000 + '"/>' : '') + '</a:schemeClr>'; }
      return '<a:srgbClr val="' + fillHex(c, theme) + '"/>';
    }

    /* blocs */
    async function paraXml(node, bucket, state, extra) {
      const a = node.attrs, st = styles[a.s] ? a.s : 'Normal';
      const p = {}; Object.keys(TX.P_ATTRS).forEach((k) => { if (k !== 's' && a[k] != null) p[k] = a[k]; });
      if (a.dc && a.dc.n) warn.add('Les lettrines sont enregistrées comme texte normal.');
      let inner = await inlineXml(node, bucket, state);
      const pid = a.pid && state.refs !== undefined ? a.pid : null;
      if (pid) { const id = ++bmN; inner = '<w:bookmarkStart w:id="' + id + '" w:name="' + esc(bkName(pid)) + '"/>' + inner + '<w:bookmarkEnd w:id="' + id + '"/>'; }
      const ppr = pPr(p, theme, pctx, Object.assign({ style: st === 'Normal' && !extra ? null : st, ls: a.ls }, extra || {}));
      return '<w:p>' + ppr + inner + '</w:p>';
    }
    async function tableXml(node, bucket, state) {
      const a = node.attrs, look = a.look || { hdr: true, band: true };
      // grille : largeurs des colonnes
      const grid = [];
      let total = 0;
      const rowsInfo = []; const occ = [];
      node.forEach((row, ro, ri) => {
        const cells = []; let c = 0;
        occ[ri] = occ[ri] || [];
        row.forEach((cell) => {
          while (occ[ri][c]) { cells.push({ cont: occ[ri][c] }); c += occ[ri][c].colspan; }
          const cs = cell.attrs.colspan || 1, rs = cell.attrs.rowspan || 1;
          for (let j = 0; j < cs; j++) { const w = cell.attrs.colwidth && cell.attrs.colwidth[j]; if (w && !grid[c + j]) grid[c + j] = w; }
          cells.push({ cell, colspan: cs });
          for (let k = 1; k < rs; k++) { occ[ri + k] = occ[ri + k] || []; occ[ri + k][c] = { colspan: cs, cell }; }
          c += cs;
        });
        while (occ[ri][c]) { cells.push({ cont: occ[ri][c] }); c += occ[ri][c].colspan; }
        rowsInfo.push({ row, cells, n: c });
      });
      const ncol = Math.max(...rowsInfo.map((r) => r.n), 1);
      const avail = contentWidth(state.pg) * TX.PX;
      for (let j = 0; j < ncol; j++) if (!grid[j]) grid[j] = avail / ncol;
      total = grid.reduce((s, w) => s + w, 0);
      const twOf = (px) => Math.round(px * 15);
      const tsId = a.ts && a.ts !== 'Grille' ? 'TS' + a.ts : 'TableGrid';
      state.tstyles.add(a.ts || 'Grille');
      let x = '<w:tbl><w:tblPr><w:tblStyle w:val="' + tsId + '"/><w:tblW w:w="' + twOf(total) + '" w:type="dxa"/>' + (a.al ? '<w:jc w:val="' + ({ center: 'center', right: 'right' }[a.al] || 'left') + '"/>' : '') + (a.ind ? '<w:tblInd w:w="' + tw(a.ind) + '" w:type="dxa"/>' : '');
      if (a.bd) x += '<w:tblBorders>' + ['t', 'l', 'b', 'r', 'h', 'v'].map((k) => a.bd[k] ? border({ t: 'top', l: 'left', b: 'bottom', r: 'right', h: 'insideH', v: 'insideV' }[k], a.bd[k], theme) : '').join('') + '</w:tblBorders>';
      x += '<w:tblLayout w:type="' + (a.lay === 'auto' ? 'autofit' : 'fixed') + '"/>';
      if (a.cm) x += '<w:tblCellMar><w:top w:w="' + tw(a.cm.t || 0) + '" w:type="dxa"/><w:left w:w="' + tw(a.cm.l == null ? 5.4 : a.cm.l) + '" w:type="dxa"/><w:bottom w:w="' + tw(a.cm.b || 0) + '" w:type="dxa"/><w:right w:w="' + tw(a.cm.r == null ? 5.4 : a.cm.r) + '" w:type="dxa"/></w:tblCellMar>';
      x += '<w:tblLook w:val="04A0" w:firstRow="' + (look.hdr ? 1 : 0) + '" w:lastRow="' + (look.lr ? 1 : 0) + '" w:firstColumn="' + (look.fc ? 1 : 0) + '" w:lastColumn="0" w:noHBand="' + (look.band ? 0 : 1) + '" w:noVBand="1"/>';
      if (a.alt || a.cap) x += '';
      x += '</w:tblPr><w:tblGrid>' + grid.slice(0, ncol).map((w) => '<w:gridCol w:w="' + twOf(w) + '"/>').join('') + '</w:tblGrid>';
      for (const ri of rowsInfo) {
        const ra = ri.row.attrs;
        x += '<w:tr>' + ((ra.hdr || ra.h || ra.cs) ? '<w:trPr>' + (ra.cs ? '<w:cantSplit/>' : '') + (ra.h ? '<w:trHeight w:val="' + tw(ra.h) + '" w:hRule="' + (ra.hr === 'exact' ? 'exact' : 'atLeast') + '"/>' : '') + (ra.hdr ? '<w:tblHeader/>' : '') + '</w:trPr>' : '');
        let col = 0;
        for (const c of ri.cells) {
          const cell = c.cell || c.cont.cell, ca = cell.attrs, cs = c.colspan || c.cont.colspan;
          const w = grid.slice(col, col + cs).reduce((s, v) => s + v, 0); col += cs;
          let tc = '<w:tcPr><w:tcW w:w="' + twOf(w) + '" w:type="dxa"/>' + (cs > 1 ? '<w:gridSpan w:val="' + cs + '"/>' : '') + (c.cont ? '<w:vMerge/>' : (ca.rowspan > 1 ? '<w:vMerge w:val="restart"/>' : ''));
          if (ca.bd) tc += '<w:tcBorders>' + ['t', 'l', 'b', 'r'].map((k) => ca.bd[k] ? border({ t: 'top', l: 'left', b: 'bottom', r: 'right' }[k], ca.bd[k], theme) : '').join('') + '</w:tcBorders>';
          if (ca.bg) tc += '<w:shd w:val="clear" w:color="auto" w:fill="' + fillHex(ca.bg, theme) + '"/>';
          if (ca.nw) tc += '<w:noWrap/>';
          if (ca.dir) tc += '<w:textDirection w:val="' + (ca.dir === 'btLr' ? 'btLr' : 'tbRl') + '"/>';
          if (ca.va && ca.va !== 'top') tc += '<w:vAlign w:val="' + (ca.va === 'center' ? 'center' : 'bottom') + '"/>';
          tc += '</w:tcPr>';
          if (c.cont) { x += '<w:tc>' + tc + '<w:p/></w:tc>'; continue; }
          let inner = await blocksXml(cell, bucket, state, true);
          if (!/(<\/w:p>|<w:p\/>)\s*$/.test(inner)) inner += '<w:p/>';   // une cellule finit par un paragraphe (sinon : un de plus à chaque aller-retour)
          x += '<w:tc>' + tc + inner + '</w:tc>';
        }
        x += '</w:tr>';
      }
      x += '</w:tbl>';
      if (a.cap) x += '';
      return x;
    }
    async function tocXml(node, state) {
      const a = node.attrs, entries = (ctx.tocEntries ? ctx.tocEntries(a) : []) || [];
      const cw = contentWidth(state.pg);
      const instr = a.kind === 'tof' ? 'TOC \\h \\z \\c "' + (a.label || 'Figure') + '"' : 'TOC \\o "1-' + (a.levels || 3) + '" \\h \\z \\u';
      state.hasToc = true;
      let x = '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="' + (a.kind === 'tof' ? 'Table of Figures' : 'Table of Contents') + '"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>';
      if (a.title) x += '<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t xml:space="preserve">' + esc(a.title) + '</w:t></w:r></w:p>';
      const lead = { dot: 'dot', hyphen: 'hyphen', underscore: 'underscore', none: 'none' }[a.leader || 'dot'] || 'dot';
      const begin = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' + esc(instr) + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
      const endF = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      if (!entries.length) x += '<w:p>' + begin + '<w:r><w:t>Mettez à jour la table (F9).</w:t></w:r>' + endF + '</w:p>';
      entries.forEach((e, i) => {
        const st = a.kind === 'tof' ? 'TableofFigures' : 'TOC' + Math.min(6, e.level || 1);
        x += '<w:p><w:pPr><w:pStyle w:val="' + st + '"/><w:tabs><w:tab w:val="right" w:leader="' + lead + '" w:pos="' + tw(cw - 0.5) + '"/></w:tabs></w:pPr>' + (i === 0 ? begin : '') + '<w:r><w:t xml:space="preserve">' + esc(e.text || '') + '</w:t></w:r>' + (a.nums !== false ? '<w:r><w:tab/></w:r><w:r><w:t>' + esc(e.page || '') + '</w:t></w:r>' : '') + (i === entries.length - 1 ? endF : '') + '</w:p>';
      });
      return x + '</w:sdtContent></w:sdt>';
    }
    async function blocksXml(container, bucket, state, inCell) {
      let out = ''; let pendingPb = false, pendingCb = false;
      const list = []; container.forEach((n, off) => list.push({ n, off }));
      for (let k = 0; k < list.length; k++) {
        const n = list[k].n, t = n.type.name;
        state.pos = state.base != null ? state.base + list[k].off : null;
        if (t === 'paragraph') {
          let x = await paraXml(n, bucket, state, pendingPb ? { pb: true, style: styles[n.attrs.s] ? n.attrs.s : 'Normal' } : null);
          if (pendingCb) { x = x.replace(/^<w:p>(<w:pPr>.*?<\/w:pPr>)?/, (m0, pp) => '<w:p>' + (pp || '') + '<w:r><w:br w:type="column"/></w:r>'); pendingCb = false; }
          pendingPb = false; out += x;
        } else if (t === 'table') { if (pendingPb) { out += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; pendingPb = false; } out += await tableXml(n, bucket, state); }
        else if (t === 'page_break') { const nx = list[k + 1] && list[k + 1].n; if (nx && nx.type.name === 'paragraph' && !inCell) pendingPb = true; else out += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; }
        else if (t === 'col_break') { const nx = list[k + 1] && list[k + 1].n; if (nx && nx.type.name === 'paragraph') pendingCb = true; else out += '<w:p><w:r><w:br w:type="column"/></w:r></w:p>'; }
        else if (t === 'toc') out += await tocXml(n, state);
      }
      if (pendingPb) out += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      return out;
    }

    /* en-têtes et pieds */
    const parts = attrs.parts || {}, partFile = {};
    let hdrN = 0, ftrN = 0;
    const wm = settings.wm && settings.wm.text ? settings.wm : null;
    if (settings.wm && settings.wm.m && !settings.wm.text) warn.add('Le filigrane image n\'est pas enregistré dans le .docx.');
    const wmXml = () => !wm ? '' : '<w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:pict><v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype><v:shape id="FiligraneTexte" o:spid="_x0000_s2049" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:' + Math.round(Math.min(480, 40 * String(wm.text).length)) + 'pt;height:' + Math.round(Math.min(480, 40 * String(wm.text).length) / Math.max(3, String(wm.text).length) * 1.6) + 'pt;rotation:' + (wm.diag === false ? 0 : 315) + ';z-index:-251657216;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="#' + fillHex(wm.color || '#BFBFBF', theme) + '" stroked="f"><v:fill opacity="' + (wm.opacity == null ? 0.5 : wm.opacity) + '"/><v:textpath style="font-family:&quot;' + esc(wm.font || 'Calibri') + '&quot;;font-size:1pt" string="' + esc(wm.text) + '"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r></w:p>';
    async function partXml(id, kind, pg) {
      const key = kind + ':' + (id || '-wm');
      if (partFile[key]) return partFile[key];
      const n = kind === 'hdr' ? ++hdrN : ++ftrN, file = (kind === 'hdr' ? 'header' : 'footer') + n + '.xml', bucket = [];
      let body = '';
      if (id && parts[id]) { try { const nd = TX.schema.nodeFromJSON(parts[id].doc || parts[id]); body = await blocksXml(nd.firstChild, bucket, { open: new Set(), pg, refs: new Set(), tstyles: tstyles, part: true }); } catch (e) { body = ''; } }
      if (kind === 'hdr' && wm) body = wmXml() + body;
      if (!body) body = '<w:p/>';
      const tag = kind === 'hdr' ? 'hdr' : 'ftr';
      z.file('word/' + file, XML + '<w:' + tag + ' ' + NS + '>' + body + '</w:' + tag + '>');
      if (bucket.length) z.file('word/_rels/' + file + '.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + bucket.join('') + '</Relationships>');
      const rid = addRel(rels.document, kind === 'hdr' ? 'header' : 'footer', file);
      partFile[key] = { rid, file, kind };
      return partFile[key];
    }
    const tstyles = new Set();
    async function sectPr(pg, isFirst) {
      let s = '';
      const refs = async (kind) => {
        const tag = kind === 'hdr' ? 'headerReference' : 'footerReference';
        const h = pg[kind] || {};
        for (const which of ['def', 'first', 'even']) {
          let id = h[which];
          if (!id && kind === 'hdr' && wm && which === 'def' && isFirst) id = null;
          if (id || (kind === 'hdr' && wm && which === 'def' && isFirst) || (kind === 'hdr' && wm && id)) {
            if (which === 'first' && !pg.titlePg) continue;
            if (which === 'even' && !settings.evenOdd) continue;
            const f = await partXml(id, kind, pg);
            s += '<w:' + tag + ' w:type="' + ({ def: 'default', first: 'first', even: 'even' }[which]) + '" r:id="' + f.rid + '"/>';
          }
        }
      };
      await refs('hdr'); await refs('ftr');
      if (settings.fnFmt && settings.fnFmt !== 'decimal') s += '<w:footnotePr><w:numFmt w:val="' + settings.fnFmt + '"/></w:footnotePr>';
      s += '<w:type w:val="' + ({ page: 'nextPage', continuous: 'continuous', even: 'evenPage', odd: 'oddPage', column: 'nextColumn' }[pg.type] || 'nextPage') + '"/>';
      s += '<w:pgSz w:w="' + tw(pg.w) + '" w:h="' + tw(pg.h) + '"' + (pg.w > pg.h ? ' w:orient="landscape"' : '') + '/>';
      s += '<w:pgMar w:top="' + tw(pg.mt) + '" w:right="' + tw(pg.mr) + '" w:bottom="' + tw(pg.mb) + '" w:left="' + tw(pg.ml) + '" w:header="' + tw(pg.mh) + '" w:footer="' + tw(pg.mf) + '" w:gutter="' + tw(pg.gut || 0) + '"/>';
      if (pg.bd && pg.bd.s && pg.bd.s !== 'none') { const fromText = pg.bd.from === 'text'; const sp = Math.min(31, Math.round(pg.bd.sp == null ? (fromText ? 4 : 24) : pg.bd.sp)); s += '<w:pgBorders w:offsetFrom="' + (fromText ? 'text' : 'page') + '"' + (pg.bd.first ? ' w:display="firstPage"' : '') + '>' + ['top', 'left', 'bottom', 'right'].map((k) => border(k, pg.bd, theme, sp)).join('') + '</w:pgBorders>'; }
      if (pg.lnum) s += '<w:lnNumType w:countBy="' + (pg.lnum.by || 1) + '" w:distance="' + tw(pg.lnum.dist || 18) + '" w:restart="' + ({ page: 'newPage', section: 'newSection', cont: 'continuous' }[pg.lnum.restart] || 'newPage') + '"/>';
      if ((pg.numFmt && pg.numFmt !== 'decimal') || pg.numStart != null) s += '<w:pgNumType' + (pg.numFmt && pg.numFmt !== 'decimal' ? ' w:fmt="' + pg.numFmt + '"' : '') + (pg.numStart != null ? ' w:start="' + pg.numStart + '"' : '') + '/>';
      const c = pg.cols || { n: 1 };
      s += '<w:cols w:space="' + tw(c.gap || 35.4) + '"' + (c.n > 1 ? ' w:num="' + c.n + '"' : '') + (c.sep ? ' w:sep="1"' : '') + '/>';
      if (pg.va && pg.va !== 'top') s += '<w:vAlign w:val="' + ({ center: 'center', both: 'both', bottom: 'bottom' }[pg.va] || 'top') + '"/>';
      if (pg.titlePg) s += '<w:titlePg/>';
      s += '<w:docGrid w:linePitch="360"/>';
      return '<w:sectPr>' + s + '</w:sectPr>';
    }

    /* corps */
    let body = '';
    const state = { open: new Set(), refs: new Set(), tstyles };
    const secs = []; docNode.forEach((s, off) => secs.push({ s, off }));
    for (let i = 0; i < secs.length; i++) {
      const sec = secs[i].s, pg = TX.pg(sec);
      state.pg = pg; state.base = secs[i].off + 1;
      let x = await blocksXml(sec, rels.document, state);
      const sp = await sectPr(pg, i === 0);
      if (i < secs.length - 1) {
        // la propriété de section se place dans le dernier paragraphe de la section
        if (/<\/w:p>$/.test(x) && !/<\/w:sdtContent><\/w:sdt>$/.test(x)) { const k = x.lastIndexOf('<w:p>'); const k2 = x.lastIndexOf('<w:p/>'); if (k2 > k) x = x.slice(0, k2) + '<w:p><w:pPr>' + sp + '</w:pPr></w:p>' + x.slice(k2 + 6); else { const para = x.slice(k); if (/^<w:p><w:pPr>/.test(para)) x = x.slice(0, k) + para.replace(/<\/w:pPr>/, sp + '</w:pPr>'); else x = x.slice(0, k) + '<w:p><w:pPr>' + sp + '</w:pPr>' + para.slice(5); } }
        else x += '<w:p><w:pPr>' + sp + '</w:pPr></w:p>';
        body += x;
      } else body += x + sp;
    }
    // commentaires restés ouverts
    state.open.forEach((id) => { body = body.replace(/(<w:sectPr>(?:(?!<w:sectPr>).)*<\/w:sectPr>)$/, '<w:p><w:commentRangeEnd w:id="' + cmtId(id) + '"/><w:r><w:commentReference w:id="' + cmtId(id) + '"/></w:r></w:p>$1'); });
    const bg = settings.pageColor ? '<w:background w:color="' + fillHex(settings.pageColor, theme) + '"/>' : '';
    z.file('word/document.xml', XML + '<w:document ' + NS + '>' + bg + '<w:body>' + body + '</w:body></w:document>');

    /* commentaires */
    const ckeys = Object.keys(cmtIds);
    if (ckeys.length) {
      const ex = [];
      const cx = ckeys.map((id) => { const c = comments[id] || {}; const pid = (0x10000000 + cmtIds[id] * 7919).toString(16).toUpperCase().slice(-8); c._pid = pid; return '<w:comment w:id="' + cmtIds[id] + '" w:author="' + esc(c.a || 'Auteur') + '" w:date="' + esc(isoDate(c.d)) + '" w:initials="' + esc(initials(c.a)) + '">' + String(c.t || '').split('\n').map((l, k, arr) => '<w:p' + (k === arr.length - 1 ? ' w14:paraId="' + pid + '"' : '') + '><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>' + (k === 0 ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' : '') + '<w:r><w:t xml:space="preserve">' + esc(l) + '</w:t></w:r></w:p>').join('') + '</w:comment>'; });
      ckeys.forEach((id) => { const c = comments[id] || {}; const par = c.p && comments[c.p]; ex.push('<w15:commentEx w15:paraId="' + c._pid + '"' + (par && par._pid ? ' w15:paraIdParent="' + par._pid + '"' : '') + ' w15:done="' + (c.done ? 1 : 0) + '"/>'); delete c._pid; });
      z.file('word/comments.xml', XML + '<w:comments ' + NS + '>' + cx.join('') + '</w:comments>');
      z.file('word/commentsExtended.xml', XML + '<w15:commentsEx ' + NS + '>' + ex.join('') + '</w15:commentsEx>');
      addRel(rels.document, 'comments', 'comments.xml');
      rels.document.push('<Relationship Id="rIdCx" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/>');
    }
    /* notes */
    const sepNotes = (tag) => '<w:' + tag + ' w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:' + tag + '><w:' + tag + ' w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:' + tag + '>';
    z.file('word/footnotes.xml', XML + '<w:footnotes ' + NS + '>' + sepNotes('footnote') + notesXml.foot.join('') + '</w:footnotes>');
    z.file('word/endnotes.xml', XML + '<w:endnotes ' + NS + '>' + sepNotes('endnote') + notesXml.end.join('') + '</w:endnotes>');
    addRel(rels.document, 'footnotes', 'footnotes.xml'); addRel(rels.document, 'endnotes', 'endnotes.xml');
    /* numérotation */
    z.file('word/numbering.xml', XML + '<w:numbering ' + NS + '>' + absXml.join('') + numXml.join('') + '</w:numbering>');
    addRel(rels.document, 'numbering', 'numbering.xml');
    /* styles */
    z.file('word/styles.xml', stylesXml(styles, theme, tstyles, settings, pctx, styleNum));
    addRel(rels.document, 'styles', 'styles.xml');
    /* réglages */
    const fmtN = (f) => f && f !== 'decimal' ? '<w:numFmt w:val="' + f + '"/>' : '';
    z.file('word/settings.xml', XML + '<w:settings ' + NS + '><w:zoom w:percent="100"/>' + (settings.pageColor ? '<w:displayBackgroundShape/>' : '') + (settings.track ? '<w:trackRevisions/>' : '') + '<w:defaultTabStop w:val="' + tw(settings.tab || 35.4) + '"/>' + (settings.hyphen ? '<w:autoHyphenation/>' : '') + (settings.evenOdd ? '<w:evenAndOddHeaders/>' : '') + '<w:characterSpacingControl w:val="doNotCompress"/>' + (state.hasToc ? '<w:updateFields w:val="true"/>' : '') + '<w:footnotePr>' + fmtN(settings.fnFmt) + '<w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:endnotePr>' + fmtN(settings.enFmt || 'lowerRoman') + '<w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="' + esc(settings.lang || 'fr-FR') + '"/><w:clrSchemeMapping w:bg1="light1" w:t1="dark1" w:bg2="light2" w:t2="dark2" w:accent1="accent1" w:accent2="accent2" w:accent3="accent3" w:accent4="accent4" w:accent5="accent5" w:accent6="accent6" w:hyperlink="hyperlink" w:followedHyperlink="followedHyperlink"/><w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/></w:settings>');
    addRel(rels.document, 'settings', 'settings.xml');
    z.file('word/theme/theme1.xml', themeXml(theme));
    addRel(rels.document, 'theme', 'theme/theme1.xml');
    z.file('word/fontTable.xml', XML + '<w:fonts ' + NS + '/>');
    addRel(rels.document, 'fontTable', 'fontTable.xml');
    z.file('word/_rels/document.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.document.join('') + '</Relationships>');
    /* propriétés */
    const iso = (t) => new Date(t || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
    z.file('docProps/core.xml', XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(props.title) + '</dc:title><dc:subject>' + esc(props.subject) + '</dc:subject><dc:creator>' + esc(props.author) + '</dc:creator><cp:keywords>' + esc(props.keywords) + '</cp:keywords><dc:language>' + esc(settings.lang || 'fr-FR') + '</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">' + iso(props.created) + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso(Date.now()) + '</dcterms:modified></cp:coreProperties>');
    z.file('docProps/app.xml', XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Texte (Suite MAG)</Application></Properties>');
    z.file('_rels/.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="' + REL + 'extended-properties" Target="docProps/app.xml"/></Relationships>');
    const WM = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';
    let ct = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
    ctypes.forEach((e) => { ct += '<Default Extension="' + e + '" ContentType="' + ({ emf: 'image/x-emf', wmf: 'image/x-wmf', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff' }[e] || 'image/' + e) + '"/>'; });
    ct += '<Override PartName="/word/document.xml" ContentType="' + WM + 'document.main+xml"/><Override PartName="/word/styles.xml" ContentType="' + WM + 'styles+xml"/><Override PartName="/word/settings.xml" ContentType="' + WM + 'settings+xml"/><Override PartName="/word/numbering.xml" ContentType="' + WM + 'numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="' + WM + 'footnotes+xml"/><Override PartName="/word/endnotes.xml" ContentType="' + WM + 'endnotes+xml"/><Override PartName="/word/fontTable.xml" ContentType="' + WM + 'fontTable+xml"/><Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
    if (ckeys.length) ct += '<Override PartName="/word/comments.xml" ContentType="' + WM + 'comments+xml"/><Override PartName="/word/commentsExtended.xml" ContentType="' + WM + 'commentsExtended+xml"/>';
    Object.values(partFile).forEach((f) => { ct += '<Override PartName="/word/' + f.file + '" ContentType="' + WM + (f.kind === 'hdr' ? 'header' : 'footer') + '+xml"/>'; });
    overrides.forEach(([pn, c]) => { ct += '<Override PartName="' + esc(pn) + '" ContentType="' + esc(c) + '"/>'; });
    z.file('[Content_Types].xml', XML + ct + '</Types>');
    const blob = await z.generateAsync({ type: 'blob', mimeType: O.MIME.docx, compression: 'DEFLATE' });
    return { blob, warn: Array.from(warn) };
  };
  const initials = (n) => String(n || 'A').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  function stylesXml(styles, theme, tstyles, settings, pctx, styleNum) {
    let s = XML + '<w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:cstheme="minorBidi"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="' + esc(settings.lang || 'fr-FR') + '" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>';
    Object.keys(styles).forEach((id) => {
      const st = styles[id], c = st.t === 'c';
      const name = BUILTIN[id] ? BUILTIN[id][1] : (st.n || id);
      const p = Object.assign({}, st.p || {}); const li = p.li; delete p.li;
      let x = '<w:style w:type="' + (c ? 'character' : 'paragraph') + '"' + (id === 'Normal' ? ' w:default="1"' : '') + (BUILTIN[id] ? '' : ' w:customStyle="1"') + ' w:styleId="' + esc(wid(id)) + '"><w:name w:val="' + esc(name) + '"/>';
      if (st.b && styles[st.b]) x += '<w:basedOn w:val="' + esc(wid(st.b)) + '"/>';
      if (!c && st.nx && styles[st.nx]) x += '<w:next w:val="' + esc(wid(st.nx)) + '"/>';
      x += '<w:uiPriority w:val="' + (st.q ? 9 : 39) + '"/>' + (st.q ? '<w:qFormat/>' : '');
      if (!c) x += pPr(p, theme, null, { lvl: st.lvl }).replace('</w:pPr>', (li && styleNum[id] ? '' : '') + '</w:pPr>').replace(/^<w:pPr>/, '<w:pPr>' + (li && styleNum[id] ? '<w:numPr><w:ilvl w:val="' + (li.l || 0) + '"/><w:numId w:val="' + styleNum[id] + '"/></w:numPr>' : ''));
      if (!c && /^<w:style[^>]*>.*<w:qFormat\/>$/.test(x) && !st.p) x += '';
      x += rPr(st.r || {}, theme);
      s += x + '</w:style>';
    });
    // styles techniques
    s += '<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:semiHidden/><w:rPr><w:sz w:val="16"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>';
    if (!styles.EndnoteText) s += '<w:style w:type="paragraph" w:styleId="EndnoteText"><w:name w:val="endnote text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style>';
    tstyles.add('Grille');
    tstyles.forEach((id) => { s += tableStyleXml(id, theme); });
    return s + '</w:styles>';
  }
  function tableStyleXml(id, theme) {
    const sid = id === 'Grille' ? 'TableGrid' : 'TS' + id;
    const st = TX.TABLE_STYLES.find((x) => x.id === id) || { id, name: id };
    const bd = (c, w) => ({ s: 'single', w: w || 0.5, c });
    const all = (b) => '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => border(k, b, theme)).join('') + '</w:tblBorders>';
    const only = (map) => '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => border(k, map[k] || null, theme)).join('') + '</w:tblBorders>';
    const cond = (type, rpr, tcpr) => '<w:tblStylePr w:type="' + type + '">' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + (tcpr ? '<w:tcPr>' + tcpr + '</w:tcPr>' : '') + '</w:tblStylePr>';
    const shd = (c) => '<w:shd w:val="clear" w:color="auto" w:fill="' + fillHex(c, theme) + '"/>';
    let tbl = '', extra = '';
    const A = 't:accent' + (st.accent || 1);
    if (id === 'Grille') tbl = all(bd('#000000'));
    else if (id === 'Aucun') tbl = only({});
    else if (id === 'GrilleClaire') tbl = all(bd('#BFBFBF'));
    else if (id === 'Simple') { tbl = only({ insideH: bd('#7F7F7F'), bottom: bd('#7F7F7F') }); extra = cond('firstRow', '<w:b/>', '<w:tcBorders><w:top w:val="single" w:sz="8" w:color="7F7F7F"/></w:tcBorders>'); }
    else if (st.kind === 'clair') { tbl = only({ insideH: bd(A), bottom: bd(A), top: bd(A) }); extra = cond('firstRow', '<w:b/><w:color w:val="' + fillHex(A + '/-25', theme) + '"/>', '<w:tcBorders><w:bottom w:val="single" w:sz="12"' + colorAttrs(wcolor(A, theme)) + '/></w:tcBorders>') + cond('band2Horz', '', shd(A + '/+80')) + cond('lastRow', '<w:b/>', '') + cond('firstCol', '<w:b/>', ''); }
    else if (st.kind === 'moyen') { tbl = all(bd(A + '/+60')); extra = cond('firstRow', '<w:b/><w:color w:val="' + fillHex('t:bg1', theme) + '"/>', shd(A)) + cond('band1Horz', '', shd(A + '/+80')) + cond('lastRow', '<w:b/>', '') + cond('firstCol', '<w:b/>', ''); }
    else if (st.kind === 'grille') { tbl = all(bd(A)); extra = cond('firstRow', '<w:b/>', shd(A + '/+80')) + cond('firstCol', '<w:b/>', '') + cond('lastRow', '<w:b/>', ''); }
    else if (st.kind === 'fonce') { tbl = all(bd('t:bg1')); extra = cond('wholeTable', '<w:color w:val="' + fillHex('t:bg1', theme) + '"/>', shd(A)) + cond('firstRow', '<w:b/>', shd(A + '/-25')) + cond('band2Horz', '<w:color w:val="' + fillHex('t:tx1', theme) + '"/>', shd(A + '/+60')) + cond('lastRow', '<w:b/>', '') + cond('firstCol', '<w:b/>', ''); }
    else tbl = all(bd('#000000'));
    return '<w:style w:type="table" w:styleId="' + esc(sid) + '"' + (id === 'Grille' ? '' : ' w:customStyle="1"') + '><w:name w:val="' + esc(id === 'Grille' ? 'Table Grid' : st.name || id) + '"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/><w:tblPr><w:tblStyleRowBandSize w:val="1"/>' + tbl + '</w:tblPr>' + extra + '</w:style>';
  }
  function themeXml(theme) {
    const c = theme.colors, h = (x) => String(x || '#000000').replace('#', '').toUpperCase();
    const font = (f) => '<a:latin typeface="' + esc(f) + '"/><a:ea typeface=""/><a:cs typeface=""/>';
    return XML + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="' + esc(theme.name || 'Texte') + '"><a:themeElements><a:clrScheme name="' + esc(theme.name || 'Texte') + '"><a:dk1><a:srgbClr val="' + h(c.dk1) + '"/></a:dk1><a:lt1><a:srgbClr val="' + h(c.lt1) + '"/></a:lt1><a:dk2><a:srgbClr val="' + h(c.dk2) + '"/></a:dk2><a:lt2><a:srgbClr val="' + h(c.lt2) + '"/></a:lt2>' + [1, 2, 3, 4, 5, 6].map((k) => '<a:accent' + k + '><a:srgbClr val="' + h(c['accent' + k]) + '"/></a:accent' + k + '>').join('') + '<a:hlink><a:srgbClr val="' + h(c.hlink || c.accent5) + '"/></a:hlink><a:folHlink><a:srgbClr val="' + h(c.folHlink || '954F72') + '"/></a:folHlink></a:clrScheme><a:fontScheme name="Texte"><a:majorFont>' + font(theme.fonts.major) + '</a:majorFont><a:minorFont>' + font(theme.fonts.minor) + '</a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  }

  /* =====================================================================================
     LECTURE
     ===================================================================================== */
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const kids = (n, name) => n ? Array.from(n.children).filter((c) => !name || c.localName === name) : [];
  const kid = (n, name) => n ? Array.from(n.children).find((c) => c.localName === name) || null : null;
  const att = (n, name) => { if (!n) return null; let v = n.getAttributeNS(W, name); if (v == null || v === '') v = n.getAttribute('w:' + name); if (v == null || v === '') v = n.getAttribute(name); return v === '' ? null : v; };
  const onoff = (n) => { if (!n) return null; const v = att(n, 'val'); return !(v === '0' || v === 'false' || v === 'off' || v === 'none'); };
  const desc = (n, name) => n ? Array.from(n.getElementsByTagNameNS('*', name)) : [];
  const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const twp = (v) => v == null ? null : r2(+v / 20);

  D.read = async function (z, progress) {
    const warnings = new Set();
    // XML abîmé (tronqué, mal fermé) : complété au mieux plutôt qu'abandonné (O.parseXmlLenient)
    const rd = async (p) => { const f = z.file(p); if (!f) return null; let x; try { x = await f.async('string'); } catch (e) { warnings.add('Une partie du document est illisible (' + p + ').'); return null; } const r = O.parseXmlLenient(x); if (r.repaired) warnings.add(r.doc ? 'Une partie du document était abîmée (' + p.replace(/^word\//, '') + ') : ce qui était lisible a été repris.' : 'Une partie du document est illisible (' + p.replace(/^word\//, '') + ').'); return r.doc; };
    const relsOf = async (p) => { const d = await rd(p.replace(/([^/]+)$/, '_rels/$1.rels')); const m = {}; if (d) desc(d, 'Relationship').forEach((r) => { m[r.getAttribute('Id')] = { t: r.getAttribute('Target'), type: r.getAttribute('Type') || '', ext: r.getAttribute('TargetMode') === 'External' }; }); return m; };
    // document principal (rels racine)
    let main = z.file('word/document.xml') ? 'word/document.xml' : (Object.keys(z.files).find((n) => /^word\/document\d*\.xml$/i.test(n)) || 'word/document.xml');
    const root = await rd('_rels/.rels'); if (root) { const r = desc(root, 'Relationship').find((x) => /officeDocument$/.test(x.getAttribute('Type') || '')); if (r && z.file(r.getAttribute('Target').replace(/^\//, ''))) main = r.getAttribute('Target').replace(/^\//, ''); }
    const base = main.replace(/[^/]+$/, '');
    const docX = await rd(main); if (!docX || !kid(docX.documentElement, 'body')) { const e = new Error('Ce document Word est abîmé : son texte principal est illisible. Essayez « Ouvrir et réparer » dans Word, ou une copie plus ancienne.'); e.user = true; throw e; }
    const rels = await relsOf(main);
    const relTarget = (r) => { if (!r) return null; let t = r.t; if (/^\//.test(t)) return t.slice(1); const parts = (base + t).split('/'); const out = []; parts.forEach((p) => { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }); return out.join('/'); };
    const byType = (re) => { const k = Object.keys(rels).find((id) => re.test(rels[id].type)); return k ? relTarget(rels[k]) : null; };
    /* thème */
    const settingsOut = TX.defaultSettings();
    const themeColors = {}; let fonts = { major: 'Calibri Light', minor: 'Calibri' };
    const thX = byType(/\/theme$/) ? await rd(byType(/\/theme$/)) : null;
    if (thX) {
      const cs = desc(thX, 'clrScheme')[0];
      if (cs) kids(cs).forEach((c) => { const v = desc(c, 'srgbClr')[0] || desc(c, 'sysClr')[0]; if (v) themeColors[c.localName] = '#' + (v.getAttribute('val') && v.localName === 'srgbClr' ? v.getAttribute('val') : (v.getAttribute('lastClr') || '000000')).toUpperCase(); });
      const mj = desc(thX, 'majorFont')[0], mn = desc(thX, 'minorFont')[0];
      if (mj && kid(mj, 'latin')) fonts.major = kid(mj, 'latin').getAttribute('typeface') || fonts.major;
      if (mn && kid(mn, 'latin')) fonts.minor = kid(mn, 'latin').getAttribute('typeface') || fonts.minor;
    }
    const tcol = {}; ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].forEach((k) => { if (themeColors[k]) tcol[k] = themeColors[k]; });
    settingsOut.theme = { id: 'clair', colors: tcol, fonts };
    /* couleurs */
    const colorOf = (n) => {
      if (!n) return null;
      const tc = att(n, 'themeColor');
      if (tc && W_ROLE[tc]) {
        let k = 0; const ti = att(n, 'themeTint'), sh = att(n, 'themeShade');
        if (ti) k = Math.round((1 - parseInt(ti, 16) / 255) * 100); else if (sh) k = -Math.round((1 - parseInt(sh, 16) / 255) * 100);
        const role = W_ROLE[tc];
        return 't:' + role + (k ? '/' + (k > 0 ? '+' : '') + k : '');
      }
      const v = att(n, 'val'); if (!v || v === 'auto') return v === 'auto' ? null : null;
      return /^[0-9A-Fa-f]{6}$/.test(v) ? '#' + v.toUpperCase() : null;
    };
    const shdOf = (n) => { if (!n) return null; const f = att(n, 'fill'); if (f && f !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(f)) { const tf = att(n, 'themeFill'); if (tf && W_ROLE[tf]) { let k = 0; const ti = att(n, 'themeFillTint'), sh = att(n, 'themeFillShade'); if (ti) k = Math.round((1 - parseInt(ti, 16) / 255) * 100); else if (sh) k = -Math.round((1 - parseInt(sh, 16) / 255) * 100); return 't:' + W_ROLE[tf] + (k ? '/' + (k > 0 ? '+' : '') + k : ''); } return '#' + f.toUpperCase(); } const v = att(n, 'val'); if (v === 'solid') { const c = att(n, 'color'); if (c && /^[0-9A-Fa-f]{6}$/.test(c)) return '#' + c.toUpperCase(); } if (/^pct(\d+)$/.test(v || '')) { const p = +/^pct(\d+)$/.exec(v)[1]; const g = Math.round(255 * (1 - p / 100)); return '#' + hex2(g) + hex2(g) + hex2(g); } return null; };
    const bdOf = (n) => { if (!n) return null; const v = att(n, 'val'); if (!v || v === 'nil' || v === 'none') return { s: 'none' }; const R = { single: 'single', thick: 'thick', double: 'double', dotted: 'dotted', dashed: 'dashed', dashSmallGap: 'dashed', dotDash: 'dashed', dotDotDash: 'dotted', triple: 'double', thinThickSmallGap: 'double', thickThinSmallGap: 'double', thinThickMediumGap: 'double', wave: 'single', inset: 'inset', outset: 'outset', threeDEmboss: 'threeDEmboss', threeDEngrave: 'threeDEngrave' }; return { s: R[v] || 'single', w: r2((+att(n, 'sz') || 4) / 8), c: colorOf(n) || '#000000', sp: +att(n, 'space') || 0 }; };
    /* propriétés de caractère */
    const rprOf = (rp) => {
      const r = {}; if (!rp) return r;
      kids(rp).forEach((c) => {
        switch (c.localName) {
          case 'rStyle': r.cs = att(c, 'val'); break;
          case 'rFonts': { const at = att(c, 'asciiTheme') || att(c, 'hAnsiTheme'); if (at) r.f = /^major/.test(at) ? '+major' : '+minor'; else { const f = att(c, 'ascii') || att(c, 'hAnsi') || att(c, 'cs') || att(c, 'eastAsia'); if (f) r.f = f; } break; }
          case 'b': r.b = onoff(c) ? 1 : 0; break; case 'i': r.i = onoff(c) ? 1 : 0; break;
          case 'caps': if (onoff(c)) r.caps = 1; break; case 'smallCaps': if (onoff(c)) r.smcaps = 1; break;
          case 'strike': if (onoff(c)) r.s = 1; break; case 'dstrike': if (onoff(c)) { r.s = 1; r.dbl = 1; } break;
          case 'vanish': if (onoff(c)) r.hidden = 1; break;
          case 'color': { const v = colorOf(c); if (v) r.c = v; break; }
          case 'spacing': { const v = +att(c, 'val'); if (v) r.sp = r2(v / 20); break; }
          case 'position': { const v = +att(c, 'val'); if (v) r.pos = v / 2; break; }
          case 'sz': r.sz = +att(c, 'val') / 2; break;
          case 'highlight': { const v = att(c, 'val'); if (v && v !== 'none') r.hl = HL_W[v] ? v : 'yellow'; break; }
          case 'u': { const v = att(c, 'val'); if (v && v !== 'none') { r.u = { single: 'single', words: 'words', double: 'double', thick: 'thick', dotted: 'dotted', dash: 'dash', dotDash: 'dotDash', wave: 'wave' }[v] || 'single'; const uc = att(c, 'color'); if (uc && uc !== 'auto') r.uc = '#' + uc; } else if (v === 'none') r.u = 0; break; }
          case 'shd': { const v = shdOf(c); if (v) r.sh = v; break; }
          case 'vertAlign': { const v = att(c, 'val'); if (v === 'superscript') r.va = 'sup'; else if (v === 'subscript') r.va = 'sub'; break; }
        }
      });
      return r;
    };
    const rToMarks = (r) => {
      const m = [];
      if (r.cs) m.push({ type: 'cs', attrs: { id: r.cs } });
      if (r.f) m.push({ type: 'font', attrs: { f: r.f } });
      if (r.sz) m.push({ type: 'size', attrs: { pt: r.sz } });
      if (r.c) m.push({ type: 'color', attrs: { c: r.c } });
      if (r.hl) m.push({ type: 'hl', attrs: { c: r.hl } });
      if (r.sh) m.push({ type: 'shd', attrs: { c: r.sh } });
      if (r.b === 1) m.push({ type: 'b' }); else if (r.b === 0) m.push({ type: 'nob' });
      if (r.i === 1) m.push({ type: 'i' }); else if (r.i === 0) m.push({ type: 'noi' });
      if (r.u) m.push({ type: 'u', attrs: { s: r.u, c: r.uc || null } });
      if (r.s) m.push({ type: 's', attrs: { dbl: !!r.dbl } });
      if (r.va) m.push({ type: 'va', attrs: { v: r.va } });
      if (r.caps) m.push({ type: 'caps' }); if (r.smcaps) m.push({ type: 'smcaps' });
      if (r.sp) m.push({ type: 'sp', attrs: { pt: r.sp } });
      if (r.pos) m.push({ type: 'pos', attrs: { pt: r.pos } });
      if (r.hidden) m.push({ type: 'hidden' });
      return m;
    };
    /* propriétés de paragraphe */
    const pprOf = (pp) => {
      const p = {}; if (!pp) return p;
      kids(pp).forEach((c) => {
        switch (c.localName) {
          case 'pStyle': p.s = att(c, 'val'); break;
          case 'keepNext': p.kn = onoff(c) ? 1 : 0; break; case 'keepLines': p.kl = onoff(c) ? 1 : 0; break;
          case 'pageBreakBefore': if (onoff(c)) p.pb = 1; break;
          case 'widowControl': if (!onoff(c)) p.wc = 0; break;
          case 'numPr': { const id = att(kid(c, 'numId'), 'val'), l = +(att(kid(c, 'ilvl'), 'val') || 0); if (id != null) p.num = { id, l }; break; }
          case 'pBdr': { const bd = {}; [['top', 't'], ['bottom', 'b'], ['left', 'l'], ['right', 'r'], ['start', 'l'], ['end', 'r']].forEach(([k, s]) => { const b = bdOf(kid(c, k)); if (b && b.s !== 'none') bd[s] = b; }); if (Object.keys(bd).length) p.bd = bd; break; }
          case 'shd': { const v = shdOf(c); if (v) p.sh = v; break; }
          case 'tabs': { const t = kids(c, 'tab').map((x) => ({ pos: twp(att(x, 'pos')), t: { center: 'center', right: 'right', end: 'right', decimal: 'decimal', bar: 'bar', clear: 'clear' }[att(x, 'val')] || 'left', lead: { dot: 'dot', hyphen: 'hyphen', underscore: 'underscore', middleDot: 'dot', heavy: 'underscore' }[att(x, 'leader')] || null })).filter((x) => x.t !== 'bar'); if (t.length) p.tabs = t; break; }
          case 'spacing': { const b = att(c, 'before'), a = att(c, 'after'), l = att(c, 'line'), lr = att(c, 'lineRule'); if (b != null && att(c, 'beforeAutospacing') !== '1') p.sb = twp(b); if (a != null && att(c, 'afterAutospacing') !== '1') p.sa = twp(a); if (att(c, 'beforeAutospacing') === '1') p.sb = 14; if (att(c, 'afterAutospacing') === '1') p.sa = 14; if (l != null) { if (!lr || lr === 'auto') { p.ln = r2(+l / 240); p.lr = 'auto'; } else { p.ln = twp(l); p.lr = lr === 'exact' ? 'exact' : 'atLeast'; } } break; }
          case 'ind': { const l = att(c, 'left') || att(c, 'start'), r = att(c, 'right') || att(c, 'end'), f = att(c, 'firstLine'), h = att(c, 'hanging'); if (l != null) p.il = twp(l); if (r != null) p.ir = twp(r); if (h != null) p.fi = -twp(h); else if (f != null) p.fi = twp(f); break; }
          case 'jc': p.al = { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'distribute', lowKashida: 'justify', mediumKashida: 'justify', highKashida: 'justify' }[att(c, 'val')] || null; break;
          case 'contextualSpacing': p.ctx = onoff(c) ? 1 : 0; break;
          case 'outlineLvl': { const v = +att(c, 'val'); if (v < 9) p.ol = v + 1; break; }
          case 'framePr': if (att(c, 'dropCap') && att(c, 'dropCap') !== 'none') p.dc = { n: +(att(c, 'lines') || 3), mode: att(c, 'dropCap') === 'margin' ? 'margin' : 'drop' }; break;
          case 'rPr': p.rpr = rprOf(c); break;
          case 'sectPr': p.sect = c; break;
        }
      });
      return p;
    };
    /* styles */
    const stylesX = byType(/\/styles$/) ? await rd(byType(/\/styles$/)) : null;
    const styles = {}; const idMap = {}; const charIds = {}; const tableStyles = {};
    let defR = {}, defP = {};
    if (stylesX) {
      const dd = desc(stylesX, 'docDefaults')[0];
      if (dd) { const rpd = desc(dd, 'rPrDefault')[0], ppd = desc(dd, 'pPrDefault')[0]; if (rpd) defR = rprOf(kid(rpd, 'rPr')); if (ppd) defP = pprOf(kid(ppd, 'pPr')); }
      const list = desc(stylesX, 'style');
      // identifiants
      list.forEach((s) => {
        const type = att(s, 'type'), sid = att(s, 'styleId'), name = att(kid(s, 'name'), 'val') || sid;
        if (type === 'table') { tableStyles[sid] = s; return; }
        if (type !== 'paragraph' && type !== 'character') return;
        let id = BY_WID[String(sid).toLowerCase()] || BY_WNAME[String(name).toLowerCase()];
        if (type === 'character' && id && (!styles[id] && TX.defaultStyles()[id] && TX.defaultStyles()[id].t !== 'c')) id = null;
        if (type === 'paragraph' && id && TX.defaultStyles()[id] && TX.defaultStyles()[id].t === 'c') id = null;
        if (att(s, 'default') === '1' && type === 'paragraph') id = 'Normal';
        if (att(s, 'default') === '1' && type === 'character') { idMap[sid] = null; return; }
        if (!id) id = String(sid).replace(/[^A-Za-z0-9_-]/g, '') || 'S' + Object.keys(styles).length;
        if (idMap[sid] === undefined && !Object.values(idMap).includes(id)) idMap[sid] = id; else if (idMap[sid] === undefined) idMap[sid] = id + '_' + Object.keys(idMap).length;
        if (type === 'character') charIds[sid] = idMap[sid];
      });
      list.forEach((s) => {
        const type = att(s, 'type'), sid = att(s, 'styleId'); const id = idMap[sid];
        if (!id || (type !== 'paragraph' && type !== 'character')) return;
        const name = att(kid(s, 'name'), 'val') || sid;
        const st = { n: BUILTIN[id] ? TX.defaultStyles()[id] && TX.defaultStyles()[id].n || name : name, t: type === 'character' ? 'c' : 'p' };
        const bo = att(kid(s, 'basedOn'), 'val'); if (bo && idMap[bo]) st.b = idMap[bo];
        const nx = att(kid(s, 'next'), 'val'); if (nx && idMap[nx]) st.nx = idMap[nx];
        if (kid(s, 'qFormat')) st.q = 1;
        if (kid(s, 'hidden') || kid(s, 'semiHidden')) st.hid = 1;
        const p = pprOf(kid(s, 'pPr')); const r = rprOf(kid(s, 'rPr'));
        if (p.ol) st.lvl = p.ol; delete p.ol; delete p.s; delete p.rpr; delete p.sect;
        const hm = /^Titre(\d)$/.exec(id); if (hm && st.lvl == null) st.lvl = +hm[1];
        if (p.num) { st._num = p.num; delete p.num; }
        delete r.cs;
        if (id === 'Normal') { Object.keys(defP).forEach((k) => { if (p[k] == null && !/^(s|rpr|sect|num)$/.test(k)) p[k] = defP[k]; }); Object.keys(defR).forEach((k) => { if (r[k] == null && k !== 'cs') r[k] = defR[k]; }); if (p.sa == null) p.sa = 0; if (p.ln == null) { p.ln = 1; p.lr = 'auto'; } if (!r.sz) r.sz = 10; if (!r.f) r.f = '+minor'; }
        st.p = p; st.r = r;
        styles[id] = st;
      });
    }
    if (!styles.Normal) { styles.Normal = { n: 'Normal', t: 'p', q: 1, p: Object.assign({ sa: 0, ln: 1, lr: 'auto' }, defP), r: Object.assign({ f: '+minor', sz: 10 }, defR) }; delete styles.Normal.p.s; delete styles.Normal.p.rpr; delete styles.Normal.p.num; }
    // styles intégrés manquants (Note, En-tête…) : valeurs par défaut de Texte
    const defs = TX.defaultStyles();
    Object.keys(defs).forEach((k) => { if (!styles[k]) styles[k] = Object.assign(O.clone(defs[k]), { unused: 1 }); });
    Object.keys(styles).forEach((k) => { if (styles[k].b && !styles[styles[k].b]) delete styles[k].b; delete styles[k].unused; });
    /* numérotation */
    const numX = byType(/\/numbering$/) ? await rd(byType(/\/numbering$/)) : null;
    const abs = {}, numMap = {}, lists = {}, listOfNum = {}, overrides = {};
    if (numX) {
      desc(numX, 'abstractNum').forEach((a) => { abs[att(a, 'abstractNumId')] = a; });
      kids(numX.documentElement, 'num').forEach((n) => { const aid = att(kid(n, 'abstractNumId'), 'val'); numMap[att(n, 'numId')] = aid; const ov = {}; kids(n, 'lvlOverride').forEach((o) => { const so = kid(o, 'startOverride'); if (so) ov[att(o, 'ilvl')] = +att(so, 'val'); }); overrides[att(n, 'numId')] = ov; });
    }
    const FMT = { decimal: 'decimal', lowerLetter: 'lowerLetter', upperLetter: 'upperLetter', lowerRoman: 'lowerRoman', upperRoman: 'upperRoman', decimalZero: 'decimalZero', ordinal: 'ordinal', none: 'none', bullet: 'bullet', cardinalText: 'decimal', ordinalText: 'ordinal' };
    const SYM = { '': '•', '': '▪', '': '➤', '': '◆', '': '✔', '': '□', '': '□', '': '■', '': '■', '': '➤', '': '►', 'o': '◦', '': '–' };
    const listFor = (numId) => {
      if (listOfNum[numId]) return listOfNum[numId];
      const aid = numMap[numId]; let a = abs[aid]; if (!a) return null;
      const link = kid(a, 'numStyleLink'); if (link) { const ls = att(link, 'val'); const st = tableStyles[ls] || null; void st; /* style de numérotation : on garde la définition abstraite telle quelle */ }
      // une même définition abstraite → une même liste (la numérotation continue entre les num)
      const key = 'A' + aid;
      if (!lists[key]) {
        const lv = [];
        kids(a, 'lvl').forEach((l) => {
          const i = +att(l, 'ilvl'); if (i > 8) return;
          const f = FMT[att(kid(l, 'numFmt'), 'val')] || 'decimal';
          let t = att(kid(l, 'lvlText'), 'val') || ''; const pp = pprOf(kid(l, 'pPr')); const rp = rprOf(kid(l, 'rPr'));
          if (f === 'bullet') { t = Array.from(t).map((ch) => SYM[ch] || (ch.charCodeAt(0) >= 0xF000 ? '•' : ch)).join('') || '•'; }
          lv[i] = { f, t, st: +(att(kid(l, 'start'), 'val') || (f === 'bullet' ? 1 : 1)), il: pp.il != null ? pp.il : 36 * (i + 1), hg: pp.fi != null && pp.fi < 0 ? -pp.fi : 0 };
          if (rp.c) lv[i].c = rp.c; if (rp.f && f === 'bullet' && !/symbol|wingdings/i.test(rp.f)) lv[i].font = rp.f;
        });
        for (let i = 0; i < 9; i++) if (!lv[i]) lv[i] = lv[i - 1] ? Object.assign({}, lv[i - 1], { il: (lv[i - 1].il || 0) + 36 }) : { f: 'bullet', t: '•', st: 1, il: 36, hg: 18 };
        const mlt = att(kid(a, 'multiLevelType'), 'val');
        lists[key] = { k: lv[0].f === 'bullet' ? 'bullet' : (mlt === 'multilevel' && /%2/.test(lv[1].t) ? 'multi' : 'number'), lv };
      }
      listOfNum[numId] = key; return key;
    };
    // styles liés à une liste
    Object.keys(styles).forEach((k) => { const st = styles[k]; if (st._num) { const L = listFor(st._num.id); if (L && st._num.id !== '0') st.p.li = { id: L, l: st._num.l || 0 }; delete st._num; } });
    /* médias */
    const media = {};
    const mediaOf = async (relMap, rid, partBase) => {
      const r = relMap[rid]; if (!r || r.ext) return null;
      const path = (function () { if (/^\//.test(r.t)) return r.t.slice(1); const parts = (partBase + r.t).split('/'); const out = []; parts.forEach((p) => { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }); return out.join('/'); })();
      const key = 'p:' + path; if (media[key]) return media[key].id;
      const f = z.file(path); if (!f) return null;
      let blob = await f.async('blob'); const ext = O.extOf(path);
      blob = new Blob([blob], { type: O.mimeOf(path, 'image/png') });
      if (O.unviewableImage(blob.type)) warnings.add('Images ' + O.imageKind(blob.type) + ' : montrées par un cadre ici, gardées telles quelles à l\'enregistrement .docx.');
      const id = TX.uid('m'); media[key] = { id, blob }; return id;
    };
    /* objets non gérés (graphiques, SmartArt, groupes, objets OLE, formes VML…) : XML d'origine et parties liées
       (graphique, classeur incorporé, données du SmartArt…) gardés tels quels, réécrits à l'enregistrement .docx */
    let ctMap = null;
    const ctOf = async (path) => {
      if (!ctMap) { ctMap = { ov: {}, def: {} }; const x = await rd('[Content_Types].xml'); if (x) { desc(x, 'Override').forEach((o) => { ctMap.ov[String(o.getAttribute('PartName') || '').replace(/^\//, '')] = o.getAttribute('ContentType'); }); desc(x, 'Default').forEach((d) => { ctMap.def[String(d.getAttribute('Extension') || '').toLowerCase()] = d.getAttribute('ContentType'); }); } }
      return ctMap.ov[path] || ctMap.def[O.extOf(path)] || O.mimeOf(path, 'application/octet-stream');
    };
    const resolveIn = (dir, t) => { if (/^\//.test(t)) return t.slice(1); const out = []; (dir + t).split('/').forEach((p) => { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }); return out.join('/'); };
    const keptPart = {};
    async function keepPart(path, out, depth) {
      if (out.parts[path] || depth > 6) return; const f = z.file(path); if (!f) return;
      let id = keptPart[path];
      if (!id) { const blob = new Blob([await f.async('uint8array')], { type: await ctOf(path) }); id = keptPart[path] = TX.uid('m'); media['k:' + path] = { id, blob }; }
      const e = out.parts[path] = { m: id, ct: media['k:' + path].blob.type, rels: [] };
      const rx = await rd(path.replace(/([^/]+)$/, '_rels/$1.rels'));
      if (rx) for (const r of desc(rx, 'Relationship')) { const ext = r.getAttribute('TargetMode') === 'External'; const t = r.getAttribute('Target') || ''; const tgt = ext ? t : resolveIn(path.replace(/[^/]+$/, ''), t); e.rels.push({ id: r.getAttribute('Id'), type: r.getAttribute('Type') || '', t: tgt, ext }); if (!ext) await keepPart(tgt, out, (depth || 0) + 1); }
    }
    const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    async function keepOf(el, rc, w, h) {
      const out = { xml: new XMLSerializer().serializeToString(el), rels: {}, parts: {}, w, h };
      const ids = new Set(); [el].concat(Array.from(el.getElementsByTagName('*'))).forEach((n) => { Array.from(n.attributes || []).forEach((at) => { if (at.namespaceURI === RNS) ids.add(at.value); }); });
      for (const rid of ids) { const r = rc.rels[rid]; if (!r) continue; if (r.ext) out.rels[rid] = { type: r.type, t: r.t, ext: true }; else { const path = resolveIn(rc.base, r.t); out.rels[rid] = { type: r.type, t: path }; await keepPart(path, out, 0); } }
      return out;
    }
    const partXml = async (keep, rid) => { const r = keep.rels[rid]; if (!r || r.ext) return null; return rd(r.t); };
    /* commentaires */
    const comments = {}, cmtMap = {};
    const cmX = byType(/\/comments$/) ? await rd(byType(/\/comments$/)) : null;
    const cxX = byType(/commentsExtended$/) ? await rd(byType(/commentsExtended$/)) : null;
    if (cmX) {
      const paraParent = {}, paraDone = {}, paraOf = {};
      if (cxX) desc(cxX, 'commentEx').forEach((e) => { const pid = e.getAttribute('w15:paraId') || e.getAttributeNS('http://schemas.microsoft.com/office/word/2012/wordml', 'paraId'); const par = e.getAttribute('w15:paraIdParent') || e.getAttributeNS('http://schemas.microsoft.com/office/word/2012/wordml', 'paraIdParent'); paraParent[pid] = par; paraDone[pid] = (e.getAttribute('w15:done') || '') === '1'; });
      desc(cmX, 'comment').forEach((c) => {
        const id = TX.uid('k'); cmtMap[att(c, 'id')] = id;
        const ps = kids(c, 'p'); const last = ps[ps.length - 1];
        const pid = last && (last.getAttribute('w14:paraId') || last.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', 'paraId'));
        if (pid) paraOf[pid] = id;
        comments[id] = { a: att(c, 'author') || 'Auteur', d: att(c, 'date') || new Date().toISOString(), t: ps.map((p) => desc(p, 't').map((t) => t.textContent).join('')).join('\n').trim(), done: !!(pid && paraDone[pid]), _pid: pid };
      });
      Object.keys(comments).forEach((id) => { const c = comments[id]; const par = c._pid && paraParent[c._pid]; if (par && paraOf[par]) { c.p = paraOf[par]; } delete c._pid; });
    }
    /* contenu : blocs et lignes */
    const notes = {}; const noteMap = { foot: {}, end: {} };
    const ctx0 = { open: new Set() };
    const footX = byType(/\/footnotes$/) ? await rd(byType(/\/footnotes$/)) : null;
    const endX = byType(/\/endnotes$/) ? await rd(byType(/\/endnotes$/)) : null;
    const footRels = byType(/\/footnotes$/) ? await relsOf(byType(/\/footnotes$/)) : {};
    const endRels = byType(/\/endnotes$/) ? await relsOf(byType(/\/endnotes$/)) : {};
    const styleId = (sid) => (sid && idMap[sid]) || (sid && BY_WID[String(sid).toLowerCase()]) || null;

    async function readBlocks(container, rc) {
      const out = [];
      const sects = rc.sects;
      const list = kids(container);
      for (let i = 0; i < list.length; i++) {
        const el = list[i], ln = el.localName;
        // gros documents : avancement et main rendue à l'interface (au plus toutes les 40 ms)
        if (rc.top && progress) progress(i, list.length);
        await O.yieldUi();
        if (ln === 'p') { const r = await readPara(el, rc); out.push(...r.blocks); if (r.sect && sects) { sects.push({ blocks: out.splice(0), sect: r.sect }); } }
        else if (ln === 'tbl') out.push(await readTable(el, rc));
        else if (ln === 'sdt') {
          const sc = kid(el, 'sdtContent'); const gal = desc(el, 'docPartGallery')[0]; const isToc = gal && /Table of (Contents|Figures)/i.test(att(gal, 'val') || '') && /TOC/.test(desc(sc, 'instrText').map((x) => x.textContent).join(''));
          if (isToc) {
            const instr = desc(sc, 'instrText').map((x) => x.textContent).join(''); const t = tocFromInstr(instr, sc);
            // paragraphes du bloc qui ne sont pas des entrées de la table (titre « Sommaire » d'un autre style…) : gardés
            for (const p of kids(sc, 'p')) { const ps = desc(p, 'pStyle')[0], sv = ps ? att(ps, 'val') || '' : ''; if (/^(TOC|TM)\d|^(TableofFigures|Tabledesillustrations)$/i.test(sv) || desc(p, 'fldChar').length || desc(p, 'instrText').length) continue; const txt = desc(p, 't').map((x) => x.textContent).join(''); if (!txt.trim() || txt === t.attrs.title) continue; out.push(...(await readPara(p, rc)).blocks); }
            out.push(t);
          } else if (sc) { const sub = await readBlocks(sc, Object.assign({}, rc, { sects: sects, top: false })); out.push(...sub); }
        }
        else if (ln === 'altChunk') out.push(...await readAltChunk(el, rc));
        else if (ln === 'customXml' || ln === 'smartTag') out.push(...await readBlocks(el, Object.assign({}, rc, { top: false })));
        else if (ln === 'sectPr' && sects) { sects.push({ blocks: out.splice(0), sect: el }); }
        else if (ln === 'bookmarkStart' || ln === 'bookmarkEnd') { /* ignoré hors paragraphe */ }
      }
      return out;
    }
    /** Contenu importé tel quel par Word (altChunk) : HTML, RTF ou texte → blocs */
    async function readAltChunk(el, rc) {
      const rid = el.getAttributeNS(RNS, 'id') || el.getAttribute('r:id'); const r = rc.rels[rid]; if (!r || r.ext) return [];
      const path = resolveIn(rc.base, r.t), f = z.file(path); if (!f) return [];
      try {
        const buf = await f.async('uint8array'); const blob = new Blob([buf]); const ext = O.extOf(path);
        let res = null;
        if (/^(html?|xhtml|mht|mhtml)$/.test(ext)) res = TX.IO.fromHtml(await TX.IO.textOf(blob));
        else if (ext === 'rtf') res = TX.IO.fromRtf(await TX.IO.textOf(blob, true));
        else if (ext === 'txt') res = TX.IO.fromText(await TX.IO.textOf(blob));
        if (!res) { warnings.add('Un contenu incorporé (' + ext + ') n\'a pas pu être repris.'); return []; }
        Object.keys(res.media || {}).forEach((id) => { media['a:' + id] = { id, blob: res.media[id] }; });
        const blocks = []; (res.json.content || []).forEach((sec) => (sec.content || []).forEach((b) => blocks.push(b)));
        warnings.add('Un contenu incorporé (altChunk) a été repris dans le document.');
        return blocks;
      } catch (e) { warnings.add('Un contenu incorporé n\'a pas pu être repris.'); return []; }
    }
    function tocFromInstr(instr, sc) {
      const m = /TOC\s+(.*)/i.exec(instr || ''); const sw = m ? m[1] : '';
      const lv = /\\o\s+"(\d)-(\d)"/.exec(sw); const c = /\\c\s+"([^"]+)"/.exec(sw);
      const title = sc ? (kids(sc, 'p').map((p) => { const ps = desc(p, 'pStyle')[0]; return ps && /TOC ?Heading|En-?t[eê]tedetabledesmati[eè]res/i.test(att(ps, 'val') || '') ? desc(p, 't').map((t) => t.textContent).join('') : null; }).find(Boolean) || null) : null;
      return { type: 'toc', attrs: { kind: c ? 'tof' : 'toc', levels: lv ? +lv[2] : 3, label: c ? c[1] : 'Figure', title } };
    }
    /* paragraphe : runs, champs, liens, révisions, commentaires */
    async function readPara(el, rc) {
      const pp = pprOf(kid(el, 'pPr'));
      const attrs = { s: styleId(pp.s) || 'Normal' };
      if (!styles[attrs.s]) attrs.s = 'Normal';
      ['al', 'il', 'ir', 'fi', 'sb', 'sa', 'ln', 'lr', 'kn', 'kl', 'pb', 'wc', 'tabs', 'bd', 'sh', 'ol', 'dc', 'ctx'].forEach((k) => { if (pp[k] != null) attrs[k] = pp[k]; });
      if (pp.num) {
        if (pp.num.id === '0') attrs.li = null;
        else { const L = listFor(pp.num.id); if (L) { attrs.li = { id: L, l: pp.num.l || 0 }; const ov = overrides[pp.num.id] || {}; if (ov[pp.num.l || 0] != null && !rc.restarted[pp.num.id]) { rc.restarted[pp.num.id] = 1; attrs.ls = ov[pp.num.l || 0]; } }
          // retraits de la liste : ceux du niveau, sauf retrait explicite différent
          if (attrs.li && attrs.il != null) { const L2 = lists[attrs.li.id].lv[attrs.li.l]; if (Math.abs(attrs.il - L2.il) < 1) { delete attrs.il; if (attrs.fi != null && Math.abs(-attrs.fi - L2.hg) < 1) delete attrs.fi; } else { L2.il = attrs.il; if (attrs.fi != null && attrs.fi < 0) L2.hg = -attrs.fi; delete attrs.il; delete attrs.fi; } }
        }
      }
      const inl = []; let blocksAfter = []; const blocks = [];
      const st = { field: null, fstack: [], link: null, ins: null, del: null };
      const pushText = (text, marks) => { if (!text) return; inl.push({ type: 'text', text, marks: marks.length ? marks : undefined }); };
      const baseMarks = (r) => {
        const m = rToMarks(r);
        if (r.cs && charIds[r.cs]) { m.shift(); m.unshift({ type: 'cs', attrs: { id: charIds[r.cs] } }); } else if (r.cs) m.shift();
        if (rc.link) m.push({ type: 'link', attrs: { href: rc.link } });
        if (rc.del) m.push({ type: 'del', attrs: rc.del }); else if (rc.ins) m.push({ type: 'ins', attrs: rc.ins });   // inséré puis supprimé = supprimé
        rc.open.forEach((id) => m.push({ type: 'cmt', attrs: { id } }));
        return m;
      };
      const splitBlock = (node) => { // saut de page dans un paragraphe → nouveau bloc
        const cur = { type: 'paragraph', attrs: Object.assign({}, attrs), content: inl.splice(0) };
        blocks.push(cur, node);
        delete attrs.pb;
      };
      async function runs(parent) {
        for (const c of kids(parent)) {
          const ln = c.localName;
          if (ln === 'r') await run(c);
          else if (ln === 'hyperlink') {
            const rid = c.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || c.getAttribute('r:id');
            const anchor = att(c, 'anchor');
            const prev = rc.link; rc.link = anchor ? '#' + anchor : (rid && rc.rels[rid] ? rc.rels[rid].t : null);
            await runs(c); rc.link = prev;
          }
          else if (ln === 'ins' || ln === 'moveTo') { const prev = rc.ins; rc.ins = { id: TX.uid('r'), a: att(c, 'author') || '', d: att(c, 'date') || '' }; await runs(c); rc.ins = prev; }
          else if (ln === 'del' || ln === 'moveFrom') { const prev = rc.del; rc.del = { id: TX.uid('r'), a: att(c, 'author') || '', d: att(c, 'date') || '' }; await runs(c); rc.del = prev; }
          else if (ln === 'smartTag' || ln === 'customXml' || ln === 'sdt' || ln === 'sdtContent' || ln === 'fldSimple' && false) await runs(ln === 'sdt' ? kid(c, 'sdtContent') || c : c);
          else if (ln === 'fldSimple') { const instr = att(c, 'instr') || ''; const res = desc(c, 't').map((t) => t.textContent).join(''); const f = fieldFrom(instr, res); if (f) inl.push(f); else await runs(c); }
          else if (ln === 'bookmarkStart') { const nm = att(c, 'name'); if (nm && !/^_(GoBack|Hlk)/.test(nm)) { if (/^_Toc/.test(nm)) { attrs.pid = attrs.pid || nm; } else if (/^_Ref/.test(nm)) attrs.pid = attrs.pid || nm; else inl.push({ type: 'bookmark', attrs: { name: nm } }); } }
          else if (ln === 'commentRangeStart') { const id = cmtMap[att(c, 'id')]; if (id && !comments[id].p) rc.open.add(id); }
          else if (ln === 'commentRangeEnd') { const id = cmtMap[att(c, 'id')]; if (id) rc.open.delete(id); }
          else if (ln === 'oMath' || ln === 'oMathPara') { const tex = ommlToTex(ln === 'oMathPara' ? kid(c, 'oMath') || c : c); inl.push({ type: 'math', attrs: { tex, display: ln === 'oMathPara' } }); }
        }
      }
      async function run(r) {
        const rp = rprOf(kid(r, 'rPr'));
        for (const c of kids(r)) {
          const ln = c.localName;
          if (ln === 'fldChar') {
            const t = att(c, 'fldCharType');
            if (t === 'begin') st.fstack.push({ instr: '', res: [], sep: false, start: inl.length, ff: kid(c, 'ffData') });
            else if (t === 'separate') { const f = st.fstack[st.fstack.length - 1]; if (f) f.sep = true; }
            else if (t === 'end') {
              const f = st.fstack.pop();
              if (f) {
                const resText = inl.slice(f.start).map((x) => x.text || '').join('');
                const node = fieldFrom(f.instr, resText, rp);
                if (/^\s*FORMCHECKBOX/i.test(f.instr)) { // case à cocher d'un formulaire Word : ☒ / ☐
                  const cb = f.ff && desc(f.ff, 'checkBox')[0]; const ck = cb ? (kid(cb, 'checked') ? onoff(kid(cb, 'checked')) : kid(cb, 'default') ? onoff(kid(cb, 'default')) : false) : false;
                  inl.splice(f.start); pushText(ck ? '☒' : '☐', baseMarks(rp)); warnings.add('Champs de formulaire Word (cases à cocher, zones de texte, listes) : repris comme texte.');
                } else if (node && node.type === 'hlink') { // champ HYPERLINK : lien sur le texte affiché
                  inl.slice(f.start).forEach((x) => { if (x.type === 'text' || x.type === 'image') x.marks = (x.marks || []).filter((m) => m.type !== 'link').concat({ type: 'link', attrs: { href: node.href } }); });
                } else if (node && node.type !== 'keep') { inl.splice(f.start); if (node.type === 'toc') { splitBlock(node); } else inl.push(node); }
                else if (/^\s*FORM(TEXT|DROPDOWN)/i.test(f.instr)) warnings.add('Champs de formulaire Word (cases à cocher, zones de texte, listes) : repris comme texte.');
              }
            }
            continue;
          }
          const fld = st.fstack[st.fstack.length - 1];
          if (ln === 'instrText') { if (fld) fld.instr += c.textContent; continue; }
          if (fld && !fld.sep) continue;
          if (ln === 't' || ln === 'delText') pushText(c.textContent, baseMarks(rp));
          else if (ln === 'tab') inl.push({ type: 'tab', marks: undefined });
          else if (ln === 'br' || ln === 'cr') { const bt = att(c, 'type'); if (bt === 'page') splitBlock({ type: 'page_break' }); else if (bt === 'column') splitBlock({ type: 'col_break' }); else inl.push({ type: 'hard_break' }); }
          else if (ln === 'noBreakHyphen') pushText('‑', baseMarks(rp));
          else if (ln === 'softHyphen') pushText('­', baseMarks(rp));
          else if (ln === 'sym') { const ch = att(c, 'char'); const code = ch ? parseInt(ch, 16) : 0; const s = SYM[String.fromCharCode(code)] || (code >= 0xF000 ? String.fromCharCode(code - 0xF000) : String.fromCharCode(code)); pushText(s, baseMarks(rp)); }
          else if (ln === 'footnoteReference' || ln === 'endnoteReference') {
            const end = ln === 'endnoteReference', wid2 = att(c, 'id'); const id = TX.uid('n');
            noteMap[end ? 'end' : 'foot'][wid2] = id;
            const custom = att(c, 'customMarkFollows') === '1' || att(c, 'customMarkFollows') === 'true';
            inl.push({ type: 'fnref', attrs: { id, end, mark: null } });
            if (custom) st.customMark = inl.length - 1;
          }
          else if (ln === 'drawing') { const n = await readDrawing(c, rc); if (n) inl.push(n); }
          else if (ln === 'pict' || ln === 'object') {
            const wm0 = rc.wm; let n = await readVml(c, rc);
            if (ln === 'object' || (!n && rc.wm === wm0 && !desc(c, 'textpath').length && (desc(c, 'shape').length || desc(c, 'group').length || desc(c, 'rect').length || desc(c, 'line').length || desc(c, 'oval').length || desc(c, 'roundrect').length))) {
              // objet incorporé (OLE : feuille Excel, Visio…) ou dessin VML : gardé tel quel, aperçu si possible
              const st = (desc(c, 'shape')[0] || desc(c, 'rect')[0] || desc(c, 'group')[0] || c).getAttribute('style') || '';
              const g = (k) => { const mm = new RegExp(k + ':\\s*([\\d.]+)(pt|in|px|cm|mm)?').exec(st); return mm ? +mm[1] * ({ in: 72, px: 0.75, cm: 28.35, mm: 2.835 }[mm[2]] || 1) : null; };
              const keep = await keepOf(c, rc, g('width') || 100, g('height') || 60);
              if (n && n.type === 'image') { n.attrs.keep = keep; keep.sig = 'ole'; }
              else { const html = '<p><b>' + (ln === 'object' ? 'Objet incorporé' : 'Dessin') + '</b> (conservé tel quel)</p>'; keep.sig = html; n = { type: 'drawing', attrs: { kind: 'textbox', shape: 'rect', w: keep.w, h: keep.h, wrap: 'inline', fill: '#F1F3F5', line: { w: 0.75, c: '#868E96' }, html, va: 'middle', keep } }; }
              warnings.add('Objets incorporés et dessins anciens (VML) : montrés par un cadre ou leur aperçu, gardés tels quels dans le .docx.');
            }
            if (n) inl.push(n);
          }
          else if (ln === 'AlternateContent') {
            const ch = kid(c, 'Choice'); const fb = kid(c, 'Fallback'); const src = ch && desc(ch, 'drawing')[0] ? ch : fb;
            if (src) {
              const d = desc(src, 'drawing')[0];
              if (d) {
                let n = await readDrawing(d, rc);
                // objet récent (graphique 2016 « chartex », groupe…) avec une image de repli : l'image est montrée, et le bloc
                // entier (choix + repli) est gardé pour l'enregistrement, comme Word l'a écrit
                if (n && n.attrs && n.attrs.keep && src === ch && fb) {
                  const fd = desc(fb, 'drawing')[0], fp = desc(fb, 'pict')[0];
                  let alt = null; if (fd) alt = await readDrawing(fd, rc); else if (fp) alt = await readVml(fp, rc);
                  const k2 = await keepOf(c, rc, n.attrs.keep.w, n.attrs.keep.h);
                  if (alt && alt.type === 'image' && n.attrs.kind === 'textbox') { k2.sig = 'ole'; ['w', 'h', 'wrap', 'al', 'x', 'y'].forEach((k) => { if (n.attrs[k] != null) alt.attrs[k] = n.attrs[k]; }); alt.attrs.keep = k2; n = alt; }   // taille et place : celles du choix (le repli VML d'un groupe est en unités du groupe)
                  else { k2.sig = n.attrs.keep.sig; n.attrs.keep = k2; }
                }
                if (n) inl.push(n);
              } else { const pc = desc(src, 'pict')[0]; if (pc) { const n = await readVml(pc, rc); if (n) inl.push(n); } }
            }
          }
          else if (ln === 'annotationRef' || ln === 'footnoteRef' || ln === 'endnoteRef' || ln === 'separator' || ln === 'continuationSeparator' || ln === 'commentReference' || ln === 'lastRenderedPageBreak') { /* rien */ }
        }
        // marque personnalisée d'une note : le texte qui suit l'appel
        if (st.customMark != null && inl.length > st.customMark + 1) { const t = inl[st.customMark + 1]; if (t.type === 'text') { inl[st.customMark].attrs.mark = t.text; inl.splice(st.customMark + 1, 1); } st.customMark = null; }
      }
      await runs(el);
      // fusion des textes de même marque
      const merged = [];
      inl.forEach((x) => { const last = merged[merged.length - 1]; if (last && x.type === 'text' && last.type === 'text' && JSON.stringify(last.marks || []) === JSON.stringify(x.marks || [])) last.text += x.text; else merged.push(x); });
      if (pp.rpr && Object.keys(pp.rpr).length && !merged.length) attrs.rpr = pp.rpr;
      blocks.push({ type: 'paragraph', attrs, content: merged.length ? merged : undefined });
      // un paragraphe vide qui ne portait que le saut de page : on le retire
      const cleaned = blocks.filter((b, i) => !(b.type === 'paragraph' && !b.content && i === 0 && blocks[1] && blocks[1].type === 'page_break' && !pp.sect && false));
      blocksAfter = cleaned;
      return { blocks: blocksAfter, sect: pp.sect || null };
    }
    function fieldFrom(instr, res, rp) {
      const s = String(instr || '').trim(); const m = /^(\w+)\s*(.*)$/.exec(s); if (!m) return null;
      const k = m[1].toUpperCase(), rest = m[2];
      const fmt = (/\\@\s+"([^"]+)"/.exec(rest) || [])[1];
      const marks = rp ? rToMarks(rp).filter((x) => x.type !== 'cs') : [];
      const F = (f, extra) => ({ type: 'field', attrs: Object.assign({ f, cache: res || '' }, extra || {}), marks: marks.length ? marks : undefined });
      switch (k) {
        case 'PAGE': return F('page'); case 'NUMPAGES': return F('pages'); case 'SECTIONPAGES': return F('sectionpages');
        case 'DATE': return F('date', { fmt: fmt ? fmt.replace(/jj/g, 'dd').replace(/aaaa/g, 'yyyy').replace(/aa/g, 'yy') : null });
        case 'TIME': return F('time', { fmt: fmt || null }); case 'SAVEDATE': return F('savedate', { fmt: fmt || null }); case 'CREATEDATE': return F('created', { fmt: fmt || null }); case 'PRINTDATE': return F('date', { fmt: fmt || null });
        case 'TITLE': return F('title'); case 'AUTHOR': return F('author'); case 'SUBJECT': return F('subject'); case 'FILENAME': return F('file'); case 'NUMWORDS': return F('words');
        case 'SEQ': return F('seq', { name: (/^(\S+)/.exec(rest) || [0, 'Figure'])[1].replace(/_/g, ' ') });
        case 'MERGEFIELD': { const nm = (/^"([^"]+)"|^(\S+)/.exec(rest) || []); return F('merge', { name: nm[1] || nm[2] || 'champ' }); }
        case 'REF': case 'PAGEREF': case 'NOTEREF': { const t = (/^(\S+)/.exec(rest) || [0, ''])[1]; const kind = k === 'NOTEREF' ? 'note' : /^_Toc|^_Ref/.test(t) ? 'heading' : 'bookmark'; return F('ref', { ref: { kind: kind === 'note' ? 'bookmark' : kind, id: t, word: 1 }, show: k === 'PAGEREF' ? 'page' : /\\r/.test(rest) ? 'number' : /\\p/.test(rest) ? 'above' : 'text' }); }
        case 'TOC': return tocFromInstr(s, null);
        case 'HYPERLINK': { const u = /^"([^"]*)"/.exec(rest) || /^(\S+)/.exec(rest); const an = /\\l\s+"([^"]+)"/.exec(rest); const href = an ? (u && u[1] && !/^\\/.test(u[1]) ? u[1] + '#' + an[1] : '#' + an[1]) : (u && !/^\\/.test(u[1]) ? u[1] : null); return href ? { type: 'hlink', href } : { type: 'keep' }; }
        default: return { type: 'keep' };
      }
    }
    /** Paragraphes d'une zone de texte, y compris dans des contrôles de contenu (pages de garde de Word) */
    const parasOf = (n) => { const out = []; kids(n).forEach((c) => { if (c.localName === 'p') out.push(c); else if (c.localName === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) out.push(...parasOf(sc)); } else if (c.localName === 'customXml' || c.localName === 'smartTag') out.push(...parasOf(c)); }); return out; };
    /* images DrawingML */
    async function readDrawing(dr, rc) {
      const inline = kid(dr, 'inline'), anchor = kid(dr, 'anchor'), box = inline || anchor; if (!box) return null;
      const gd = desc(box, 'graphicData')[0], uri = gd ? gd.getAttribute('uri') || '' : '';
      const ext = kid(box, 'extent'); const w = r2((+ext.getAttribute('cx') || 0) / 12700), h = r2((+ext.getAttribute('cy') || 0) / 12700);
      const dp = kid(box, 'docPr'); const alt = dp ? (dp.getAttribute('descr') || dp.getAttribute('title') || '') : '';
      const a = { w: w || 100, h: h || 100, alt, wrap: 'inline', al: 'left', x: 0, y: 0 };
      if (anchor) {
        a.wrap = kid(anchor, 'wrapSquare') ? 'square' : kid(anchor, 'wrapTight') || kid(anchor, 'wrapThrough') ? 'tight' : kid(anchor, 'wrapTopAndBottom') ? 'topBottom' : anchor.getAttribute('behindDoc') === '1' ? 'behind' : 'front';
        const ph = kid(anchor, 'positionH'), pv = kid(anchor, 'positionV');
        if (ph) { const al = kid(ph, 'align'), off = kid(ph, 'posOffset'); if (al) a.al = { left: 'left', center: 'center', right: 'right', inside: 'left', outside: 'right' }[al.textContent] || 'left'; else if (off) { a.x = r2(+off.textContent / 12700); a.al = 'left'; if (ph.getAttribute('relativeFrom') === 'page') a.x = r2(a.x - (rc.pgMl || 70.9)); } }
        if (pv) { const off = kid(pv, 'posOffset'); if (off) a.y = r2(+off.textContent / 12700); if (pv.getAttribute('relativeFrom') !== 'paragraph' && pv.getAttribute('relativeFrom') !== 'line') a.y = Math.max(0, Math.min(a.y, 40)); }
      }
      const pic = /\/picture$/.test(uri) || !uri ? desc(box, 'pic')[0] : null;
      if (pic) {
        const blip = desc(pic, 'blip')[0]; const rid = blip && (blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || blip.getAttribute('r:embed'));
        const ext2 = blip && desc(blip, 'svgBlip')[0]; const rid2 = ext2 && (ext2.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));
        const m = await mediaOf(rc.rels, rid2 || rid, rc.base); if (!m) return null;
        const src = desc(pic, 'srcRect')[0]; if (src) { const g = (k) => (+src.getAttribute(k) || 0) / 100000; const c = { l: g('l'), t: g('t'), r: g('r'), b: g('b') }; if (c.l || c.t || c.r || c.b) a.crop = c; }
        const xf = desc(pic, 'xfrm')[0]; if (xf) { if (xf.getAttribute('rot')) a.rot = Math.round(+xf.getAttribute('rot') / 60000); if (xf.getAttribute('flipH') === '1') a.fh = true; if (xf.getAttribute('flipV') === '1') a.fv = true; }
        const ln = desc(pic, 'ln')[0]; if (ln && !kid(ln, 'noFill')) { const c = desc(ln, 'srgbClr')[0]; a.bd = { s: 'single', w: r2((+ln.getAttribute('w') || 9525) / 12700), c: c ? '#' + c.getAttribute('val') : '#000000' }; }
        const hl = dp && kid(dp, 'hlinkClick'); if (hl) { const r = rc.rels[hl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')]; if (r) a.link = r.t; }
        return { type: 'image', attrs: Object.assign({ m }, a) };
      }
      const wsp = /wordprocessingShape$/.test(uri) || !uri ? desc(box, 'wsp')[0] : null;
      if (wsp) {
        const sp = kid(wsp, 'spPr'), prst = sp && desc(sp, 'prstGeom')[0];
        const fillN = sp && kid(sp, 'solidFill'), lnN = sp && kid(sp, 'ln');
        const clr = (n) => { if (!n) return null; const s = desc(n, 'srgbClr')[0]; if (s) return '#' + s.getAttribute('val').toUpperCase(); const sc = desc(n, 'schemeClr')[0]; if (sc) { const v = sc.getAttribute('val'); const role = { tx1: 'tx1', bg1: 'bg1', tx2: 'tx2', bg2: 'bg2', dk1: 'tx1', lt1: 'bg1', dk2: 'tx2', lt2: 'bg2' }[v] || v; return 't:' + role; } return null; };
        const txbx = desc(wsp, 'txbxContent')[0];
        const html = txbx ? parasOf(txbx).map((p) => { const jc = desc(p, 'jc')[0]; const al = jc ? { center: 'center', right: 'right', both: 'justify' }[att(jc, 'val')] : null; return '<p' + (al ? ' style="text-align:' + al + '"' : '') + '>' + kids(p).filter((r) => r.localName === 'r').map((r) => { const rp = rprOf(kid(r, 'rPr')); const t = O.esc(desc(r, 't').map((x) => x.textContent).join('')); if (!t) return ''; let s = ''; if (rp.c && /^#/.test(rp.c)) s += 'color:' + rp.c + ';'; if (rp.sz) s += 'font-size:' + rp.sz + 'pt;'; let h = s ? '<span style="' + s + '">' + t + '</span>' : t; if (rp.b) h = '<b>' + h + '</b>'; if (rp.i) h = '<i>' + h + '</i>'; if (rp.u) h = '<u>' + h + '</u>'; return h; }).join('') + '</p>'; }).join('') : '';
        const isTb = kid(wsp, 'cNvSpPr') && kid(wsp, 'cNvSpPr').getAttribute('txBox') === '1';
        const xf = sp && desc(sp, 'xfrm')[0];
        // zone de texte qui contient plus que du texte (graphique, image, tableau) : affichée simplifiée, gardée telle quelle
        const rich = txbx && (desc(txbx, 'drawing').length || desc(txbx, 'tbl').length || desc(txbx, 'pict').length || desc(txbx, 'object').length);
        let keepTb = null; if (rich) { keepTb = await keepOf(dr, rc, a.w, a.h); keepTb.sig = html; warnings.add('Zones de texte avec images, graphiques ou tableaux : montrées simplifiées, gardées telles quelles dans le .docx.'); }
        return { type: 'drawing', attrs: Object.assign({}, a, keepTb ? { keep: keepTb } : {}, { kind: isTb || (txbx && (!prst || prst.getAttribute('prst') === 'rect') && !fillN) ? 'textbox' : 'shape', shape: prst ? prst.getAttribute('prst') : 'rect', fill: sp && kid(sp, 'noFill') ? null : (clr(fillN) || (isTb ? null : 't:accent1')), line: lnN && !kid(lnN, 'noFill') ? { w: r2((+lnN.getAttribute('w') || 12700) / 12700), c: clr(kid(lnN, 'solidFill')) || '#000000' } : null, html, rot: xf && xf.getAttribute('rot') ? Math.round(+xf.getAttribute('rot') / 60000) : 0, va: (() => { const bp = kid(wsp, 'bodyPr'); const an = bp && bp.getAttribute('anchor'); return an === 't' ? 'top' : an === 'b' ? 'bottom' : 'middle'; })() }) };
      }
      // graphique, SmartArt, groupe, zone de dessin… : affiché au mieux, gardé tel quel pour l'enregistrement .docx
      const keep = await keepOf(dr, rc, a.w, a.h);
      const P = window.Pres;
      if (/\/chart$/.test(uri) && P && P.chartFromXml) {
        const cn = desc(gd, 'chart')[0]; const rid = cn && cn.getAttributeNS(RNS, 'id');
        let chart = null; try { const cx = rid && await partXml(keep, rid); chart = cx ? P.chartFromXml(cx) : null; } catch (e) { chart = null; }
        if (chart) { keep.sig = JSON.stringify(chart); warnings.add('Graphiques : affichés d\'après leurs données, gardés tels quels dans le .docx (une modification du graphique le remplace par une image).'); return { type: 'drawing', attrs: Object.assign({}, a, { kind: 'chart', chart, fill: null, keep }) }; }
      }
      if (/\/diagram$/.test(uri) && P && P.smartFromXml) {
        const ri = desc(gd, 'relIds')[0]; let smart = null;
        try { const dm = ri && await partXml(keep, ri.getAttributeNS(RNS, 'dm')); const lo = ri && await partXml(keep, ri.getAttributeNS(RNS, 'lo')); smart = dm ? P.smartFromXml(dm, lo && lo.documentElement ? lo.documentElement.getAttribute('uniqueId') : '') : null; } catch (e) { smart = null; }
        if (smart) { keep.sig = JSON.stringify(smart); warnings.add('SmartArt : affichés d\'après leur texte, gardés tels quels dans le .docx.'); return { type: 'drawing', attrs: Object.assign({}, a, { kind: 'smart', smart, fill: null, keep }) }; }
      }
      const label = /\/chart$|chartex/.test(uri) ? 'Graphique' : /diagram$/.test(uri) ? 'SmartArt' : /Group$/.test(uri) ? 'Groupe d\'objets' : /Canvas$/.test(uri) ? 'Zone de dessin' : /ink/i.test(uri) ? 'Dessin à main levée' : 'Objet';
      const texts = desc(box, 'txbxContent').map((t) => parasOf(t).map((p) => desc(p, 't').map((x) => x.textContent).join('')).filter(Boolean).join(' / ')).filter(Boolean);
      const html = '<p><b>' + O.esc(label) + '</b> (conservé tel quel)</p>' + texts.map((t) => '<p>' + O.esc(t) + '</p>').join('') + (alt ? '<p>' + O.esc(alt) + '</p>' : '');
      keep.sig = html;
      warnings.add('Certains objets (' + label.toLowerCase() + '…) sont montrés par un cadre et gardés tels quels dans le .docx.');
      return { type: 'drawing', attrs: Object.assign({}, a, { kind: 'textbox', shape: 'rect', fill: '#F1F3F5', line: { w: 0.75, c: '#868E96' }, html, va: 'middle', keep }) };
    }
    async function readVml(el, rc) {
      const im = desc(el, 'imagedata')[0];
      const shape = desc(el, 'shape')[0];
      const tp = desc(el, 'textpath')[0];
      if (tp) { // filigrane texte
        if (rc.part) { rc.wm = { text: tp.getAttribute('string') || '', color: shape && shape.getAttribute('fillcolor') && /^#/.test(shape.getAttribute('fillcolor')) ? shape.getAttribute('fillcolor').toUpperCase() : '#BFBFBF', opacity: 0.5, diag: !/rotation:0/.test((shape && shape.getAttribute('style')) || '') }; }
        return null;
      }
      if (im) {
        const rid = im.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || im.getAttribute('r:id');
        const m = await mediaOf(rc.rels, rid, rc.base); if (!m) return null;
        // image dans un groupe VML : la taille de la forme est en unités du groupe (coordsize) ; celle du groupe est en points
        const grp = desc(el, 'group')[0];
        const style = ((grp && shape && grp.contains(shape) ? grp : shape) || { getAttribute: () => '' }).getAttribute('style') || '';
        const g = (k) => { const mm = new RegExp('(?:^|;)\\s*' + k + ':\\s*([\\d.]+)(pt|in|px|cm|mm)?').exec(style); if (!mm) return null; return +mm[1] * ({ in: 72, px: 0.75, cm: 28.35, mm: 2.835 }[mm[2]] || 1); };
        if (rc.part && /WordPictureWatermark|watermark/i.test((shape && shape.getAttribute('id')) || '')) { rc.wm = { m, scale: 60 }; return null; }
        return { type: 'image', attrs: { m, w: g('width') || 100, h: g('height') || 100, alt: (shape && shape.getAttribute('alt')) || '' } };
      }
      const txb = desc(el, 'txbxContent')[0];
      if (txb) { return { type: 'drawing', attrs: { kind: 'textbox', shape: 'rect', w: 144, h: 72, wrap: 'square', fill: null, line: { w: 0.75, c: '#000000' }, html: parasOf(txb).map((p) => '<p>' + O.esc(desc(p, 't').map((t) => t.textContent).join('')) + '</p>').join('') } }; }
      return null;
    }
    /* tableaux */
    async function readTable(el, rc) {
      const tp = kid(el, 'tblPr');
      const a = { ts: 'Grille', look: { hdr: true, band: true } };
      const tsx = tp && kid(tp, 'tblStyle');
      const tsv = tsx ? att(tsx, 'val') : null;
      let tsFound = null;
      if (tsv) { const m = /^TS(.+)$/.exec(tsv); if (m && TX.TABLE_STYLES.some((x) => x.id === m[1])) tsFound = m[1]; else if (/TableGrid|Grilledutableau/i.test(tsv)) tsFound = 'Grille'; else if (/TableNormal|Tableaunormal/i.test(tsv)) tsFound = 'Aucun'; else { const sx = tableStyles[tsv]; const name = sx ? (att(kid(sx, 'name'), 'val') || '') : ''; const mm = /(Grid|List) Table (\d)(?: Light)?(?: - Accent (\d))?/i.exec(name); if (mm) tsFound = (mm[1].toLowerCase() === 'list' ? 'clair' : +mm[2] >= 5 ? 'fonce' : +mm[2] >= 4 ? 'moyen' : 'grille') + (mm[3] || 1); else if (sx) { const hasB = desc(sx, 'tblBorders')[0]; tsFound = hasB && desc(hasB, 'insideH').length && att(desc(hasB, 'insideH')[0], 'val') !== 'nil' ? 'Grille' : 'Aucun'; } } }
      a.ts = tsFound || (tsv ? 'Grille' : 'Aucun');
      if (tp) {
        const jc = kid(tp, 'jc'); if (jc) a.al = { center: 'center', right: 'right', end: 'right' }[att(jc, 'val')] || null;
        const ind = kid(tp, 'tblInd'); if (ind && att(ind, 'type') !== 'pct' && +att(ind, 'w')) a.ind = twp(att(ind, 'w'));
        const lay = kid(tp, 'tblLayout'); a.lay = lay && att(lay, 'type') === 'fixed' ? 'fixed' : 'fixed';
        const tb = kid(tp, 'tblBorders'); if (tb) { const bd = {}; [['top', 't'], ['left', 'l'], ['start', 'l'], ['bottom', 'b'], ['right', 'r'], ['end', 'r'], ['insideH', 'h'], ['insideV', 'v']].forEach(([k, s]) => { const b = bdOf(kid(tb, k)); if (b) bd[s] = b; }); if (Object.keys(bd).length) a.bd = bd; }
        const cm = kid(tp, 'tblCellMar'); if (cm) { const g = (k) => { const n = kid(cm, k) || kid(cm, k === 'left' ? 'start' : k === 'right' ? 'end' : k); return n ? twp(att(n, 'w')) : null; }; a.cm = { t: g('top') || 0, b: g('bottom') || 0, l: g('left') == null ? 5.4 : g('left'), r: g('right') == null ? 5.4 : g('right') }; }
        const lk = kid(tp, 'tblLook'); if (lk) { const v = parseInt(att(lk, 'val') || '0', 16); const g = (k, bit) => { const x = att(lk, k); return x != null ? x === '1' || x === 'true' : !!(v & bit); }; a.look = { hdr: g('firstRow', 0x20), lr: g('lastRow', 0x40), fc: g('firstColumn', 0x80), band: !g('noHBand', 0x200) }; }
        const cap = kid(tp, 'tblCaption'); if (cap) a.cap = att(cap, 'val'); const dsc = kid(tp, 'tblDescription'); if (dsc) a.alt = att(dsc, 'val');
      }
      const grid = kids(kid(el, 'tblGrid'), 'gridCol').map((g) => Math.round(twp(att(g, 'w')) * TX.PX));
      const rows = []; const vm = {}; // vMerge : colonne → cellule ouverte
      // lignes et cellules dans des contrôles de contenu (section répétée de Word) ou du customXml : aplaties
      const flat = (n, name) => { const out = []; kids(n).forEach((c) => { if (c.localName === name) out.push(c); else if (c.localName === 'sdt') { const sc = kid(c, 'sdtContent'); if (sc) out.push(...flat(sc, name)); } else if (c.localName === 'customXml' || c.localName === 'smartTag') out.push(...flat(c, name)); }); return out; };
      flat(el, 'tr').forEach((tr) => {
        const trp = kid(tr, 'trPr');
        const ra = { hdr: !!(trp && kid(trp, 'tblHeader') && onoff(kid(trp, 'tblHeader'))), h: null, hr: null, cs: !!(trp && kid(trp, 'cantSplit') && onoff(kid(trp, 'cantSplit'))) };
        const th = trp && kid(trp, 'trHeight'); if (th) { ra.h = twp(att(th, 'val')); ra.hr = att(th, 'hRule') === 'exact' ? 'exact' : null; }
        const gb = trp && kid(trp, 'gridBefore'); let col = gb ? +att(gb, 'val') : 0;
        const cells = [];
        rows.push({ attrs: ra, cells, tcs: flat(tr, 'tc'), col0: col });
      });
      for (const row of rows) {
        let col = row.col0;
        for (const tc of row.tcs) {
          const tcp = kid(tc, 'tcPr');
          const span = tcp && kid(tcp, 'gridSpan') ? +att(kid(tcp, 'gridSpan'), 'val') : 1;
          const vmN = tcp && kid(tcp, 'vMerge'); const vmv = vmN ? (att(vmN, 'val') || 'continue') : null;
          if (vmv === 'continue' && vm[col]) { vm[col].attrs.rowspan++; col += span; continue; }
          const ca = { colspan: span, rowspan: 1, colwidth: null };
          const ws = grid.slice(col, col + span); if (ws.length === span && ws.every((x) => x > 0)) ca.colwidth = ws;
          if (tcp) {
            const sh = shdOf(kid(tcp, 'shd')); if (sh) ca.bg = sh;
            const tb = kid(tcp, 'tcBorders'); if (tb) { const bd = {}; [['top', 't'], ['left', 'l'], ['start', 'l'], ['bottom', 'b'], ['right', 'r'], ['end', 'r']].forEach(([k, s]) => { const b = bdOf(kid(tb, k)); if (b) bd[s] = b; }); if (Object.keys(bd).length) ca.bd = bd; }
            const va = kid(tcp, 'vAlign'); if (va) ca.va = { center: 'center', bottom: 'bottom' }[att(va, 'val')] || null;
            const td = kid(tcp, 'textDirection'); if (td) ca.dir = /btLr/.test(att(td, 'val')) ? 'btLr' : /tbRl/.test(att(td, 'val')) ? 'tbRl' : null;
            if (kid(tcp, 'noWrap')) ca.nw = true;
          }
          const content = await readBlocks(tc, Object.assign({}, rc, { sects: null, top: false }));
          const cell = { type: 'table_cell', attrs: ca, content: content.filter((b) => b.type !== 'page_break' && b.type !== 'col_break').length ? content.filter((b) => b.type !== 'page_break' && b.type !== 'col_break') : [B.p('Normal', '')] };
          if (vmv === 'restart') vm[col] = cell; else for (let j = 0; j < span; j++) delete vm[col + j];
          row.cells.push(cell); col += span;
        }
      }
      const out = rows.filter((r) => r.cells.length).map((r) => ({ type: 'table_row', attrs: r.attrs, content: r.cells }));
      if (!out.length) return B.p('Normal', '');
      // largeurs absentes : on répartit la largeur disponible
      if (!grid.length) out.forEach((r) => r.content.forEach((c) => { c.attrs.colwidth = null; }));
      return { type: 'table', attrs: a, content: out };
    }
    /* section */
    const hfParts = {}; const partIds = {};
    async function readPart(rid, kind) {
      if (partIds[rid]) return partIds[rid];
      const r = rels[rid]; if (!r) return null; const path = relTarget(r);
      const x = await rd(path); if (!x) return null;
      const prels = await relsOf(path);
      const rc = { rels: prels, base: path.replace(/[^/]+$/, ''), open: new Set(), restarted: {}, part: true, sects: null };
      let blocks = await readBlocks(x.documentElement, rc);
      if (rc.wm && !settingsOut.wm) settingsOut.wm = rc.wm;
      blocks = blocks.filter((b) => b.type !== 'page_break' && b.type !== 'col_break');
      // un en-tête ne contenant que le filigrane est vide
      if (!blocks.length) blocks = [B.p(kind === 'hdr' ? 'EnTete' : 'PiedPage', '')];
      const id = TX.uid('P'); hfParts[id] = { doc: B.part(blocks) }; partIds[rid] = id;
      return id;
    }
    async function pgOf(sp, prev) {
      const pg = TX.defaultPage(); pg.hdr = { def: null, first: null, even: null }; pg.ftr = { def: null, first: null, even: null };
      if (!sp) return pg;
      const sz = kid(sp, 'pgSz'); if (sz) { pg.w = twp(att(sz, 'w')) || pg.w; pg.h = twp(att(sz, 'h')) || pg.h; pg.orient = pg.w > pg.h ? 'landscape' : 'portrait'; const f = TX.PAGE_SIZES.find((s) => (Math.abs(s.w - pg.w) < 3 && Math.abs(s.h - pg.h) < 3) || (Math.abs(s.h - pg.w) < 3 && Math.abs(s.w - pg.h) < 3)); pg.size = f ? f.id : 'custom'; }
      const mg = kid(sp, 'pgMar'); if (mg) { pg.mt = Math.abs(twp(att(mg, 'top')) || 0); pg.mb = Math.abs(twp(att(mg, 'bottom')) || 0); pg.ml = twp(att(mg, 'left') || att(mg, 'start')) || 0; pg.mr = twp(att(mg, 'right') || att(mg, 'end')) || 0; pg.mh = twp(att(mg, 'header')) || pg.mh; pg.mf = twp(att(mg, 'footer')) || pg.mf; pg.gut = twp(att(mg, 'gutter')) || 0; }
      const cols = kid(sp, 'cols'); if (cols) pg.cols = { n: +(att(cols, 'num') || 1), gap: twp(att(cols, 'space') || 720), sep: att(cols, 'sep') === '1' || att(cols, 'sep') === 'true' };
      const ty = kid(sp, 'type'); pg.type = ty ? ({ nextPage: 'page', continuous: 'continuous', evenPage: 'even', oddPage: 'odd', nextColumn: 'continuous' }[att(ty, 'val')] || 'page') : 'page';
      pg.titlePg = !!(kid(sp, 'titlePg') && onoff(kid(sp, 'titlePg')));
      const pn = kid(sp, 'pgNumType'); if (pn) { if (att(pn, 'fmt')) pg.numFmt = { decimal: 'decimal', lowerRoman: 'lowerRoman', upperRoman: 'upperRoman', lowerLetter: 'lowerLetter', upperLetter: 'upperLetter' }[att(pn, 'fmt')] || 'decimal'; if (att(pn, 'start') != null) pg.numStart = +att(pn, 'start'); }
      const va = kid(sp, 'vAlign'); if (va) pg.va = att(va, 'val');
      const pb = kid(sp, 'pgBorders'); if (pb) { const t = bdOf(kid(pb, 'top')); if (t && t.s !== 'none') pg.bd = { s: t.s, w: t.w, c: /^#/.test(t.c) ? t.c : '#000000', from: att(pb, 'offsetFrom') === 'text' ? 'text' : 'page', sp: t.sp, first: att(pb, 'display') === 'firstPage' }; }
      const ln = kid(sp, 'lnNumType'); if (ln) pg.lnum = { by: +(att(ln, 'countBy') || 1), dist: twp(att(ln, 'distance')) || 18, restart: { newPage: 'page', newSection: 'section', continuous: 'cont' }[att(ln, 'restart')] || 'page' };
      for (const ref of kids(sp)) {
        if (ref.localName !== 'headerReference' && ref.localName !== 'footerReference') continue;
        const kind = ref.localName === 'headerReference' ? 'hdr' : 'ftr', which = { default: 'def', first: 'first', even: 'even' }[att(ref, 'type')] || 'def';
        const rid = ref.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ref.getAttribute('r:id');
        pg[kind][which] = await readPart(rid, kind);
      }
      void prev; return pg;
    }
    const sects = [];
    const bodyEl = kid(docX.documentElement, 'body');
    // marge gauche de la dernière section (positions d'images relatives à la page)
    const lastSp = kid(bodyEl, 'sectPr'); const lm = lastSp && kid(lastSp, 'pgMar');
    const rcMain = { rels, base, open: new Set(), restarted: {}, sects, pgMl: lm ? twp(att(lm, 'left')) : 70.9, top: true };
    const rest = await readBlocks(bodyEl, rcMain);
    if (rest.length) sects.push({ blocks: rest, sect: null });
    const sections = [];
    for (const s of sects) {
      const pg = await pgOf(s.sect);
      if (!s.blocks.length) s.blocks.push(B.p('Normal', ''));
      sections.push({ type: 'section', attrs: { pg }, content: s.blocks });
    }
    // sections sans propriétés propres (dernière sans sectPr) : on reprend la précédente
    if (!sections.length) sections.push(B.section([B.p('Normal', '')]));
    /* notes */
    async function readNotes(x, tag, map, nrels, path) {
      if (!x) return;
      for (const n of desc(x, tag)) {
        const wid2 = att(n, 'id'); const id = map[wid2]; if (!id) continue;
        const rc = { rels: nrels, base: (path || 'word/').replace(/[^/]+$/, ''), open: new Set(), restarted: {}, sects: null };
        let blocks = await readBlocks(n, rc);
        blocks = blocks.filter((b) => b.type === 'paragraph' || b.type === 'table');
        // espace après l'appel de note
        if (blocks[0] && blocks[0].content && blocks[0].content[0] && blocks[0].content[0].type === 'text') blocks[0].content[0].text = blocks[0].content[0].text.replace(/^\s+/, '');
        if (blocks[0] && blocks[0].content && blocks[0].content[0] && blocks[0].content[0].type === 'text' && !blocks[0].content[0].text) blocks[0].content.shift();
        notes[id] = { doc: B.part(blocks.length ? blocks : [B.p(tag === 'endnote' ? 'NoteFin' : 'NoteBas', '')]) };
      }
    }
    await readNotes(footX, 'footnote', noteMap.foot, footRels, byType(/\/footnotes$/));
    await readNotes(endX, 'endnote', noteMap.end, endRels, byType(/\/endnotes$/));
    /* réglages */
    const setX = byType(/\/settings$/) ? await rd(byType(/\/settings$/)) : null;
    if (setX) {
      const r = setX.documentElement;
      const dt = kid(r, 'defaultTabStop'); if (dt) settingsOut.tab = twp(att(dt, 'val')) || 35.4;
      if (kid(r, 'evenAndOddHeaders') && onoff(kid(r, 'evenAndOddHeaders'))) settingsOut.evenOdd = true;
      if (kid(r, 'trackRevisions') && onoff(kid(r, 'trackRevisions'))) settingsOut.track = true;
      if (kid(r, 'autoHyphenation') && onoff(kid(r, 'autoHyphenation'))) settingsOut.hyphen = true;
      const fp = kid(r, 'footnotePr'); if (fp && kid(fp, 'numFmt')) settingsOut.fnFmt = att(kid(fp, 'numFmt'), 'val');
      const ep = kid(r, 'endnotePr'); if (ep && kid(ep, 'numFmt')) settingsOut.enFmt = att(kid(ep, 'numFmt'), 'val');
    }
    const bgN = kid(docX.documentElement, 'background'); if (bgN && att(bgN, 'color') && att(bgN, 'color') !== 'auto') settingsOut.pageColor = '#' + att(bgN, 'color').toUpperCase();
    settingsOut.styleSet = 'import';
    /* propriétés */
    const props = TX.defaultProps();
    const core = await rd('docProps/core.xml');
    if (core) { const g = (n) => { const e = desc(core, n)[0]; return e ? e.textContent : ''; }; props.title = g('title'); props.subject = g('subject'); props.author = g('creator'); props.keywords = g('keywords'); const c = Date.parse(g('created')); if (c) props.created = c; const m = Date.parse(g('modified')); if (m) props.modified = m; }
    // styles de caractère et de liste inutilisés : conservés tels quels
    const json = TX.emptyDoc({ sections, styles, lists, parts: hfParts, notes, comments, props, settings: settingsOut });
    const mediaOut = {}; Object.values(media).forEach((m) => { mediaOut[m.id] = m.blob; });
    if (desc(docX, 'oMath').length) warnings.add('Les équations Word sont converties en LaTeX (approximatif).');
    if (desc(docX, 'txbxContent').length) warnings.add('Le contenu des zones de texte est simplifié.');
    return { json: TX.IO.upgrade(json), media: mediaOut, info: { title: props.title }, warnings: Array.from(warnings) };
  };

  /* ---------------- OMML → LaTeX (approximatif) ---------------- */
  function ommlToTex(n) {
    const k = (x, name) => x ? Array.from(x.children).find((c) => c.localName === name) : null;
    const go = (x) => { if (!x) return ''; return Array.from(x.children).map(one).join(''); };
    const SYMS = { '∑': '\\sum', '∫': '\\int', '∏': '\\prod', 'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'π': '\\pi', 'θ': '\\theta', 'λ': '\\lambda', 'μ': '\\mu', 'σ': '\\sigma', 'φ': '\\varphi', 'ω': '\\omega', 'Δ': '\\Delta', 'Ω': '\\Omega', '∞': '\\infty', '≤': '\\le', '≥': '\\ge', '≠': '\\neq', '±': '\\pm', '×': '\\times', '÷': '\\div', '→': '\\to', '≈': '\\approx', '·': '\\cdot', '√': '\\sqrt{}' };
    function one(c) {
      switch (c.localName) {
        case 'r': return Array.from(c.getElementsByTagNameNS('*', 't')).map((t) => Array.from(t.textContent).map((ch) => SYMS[ch] ? SYMS[ch] + ' ' : ch).join('')).join('');
        case 'f': return '\\frac{' + go(k(c, 'num')) + '}{' + go(k(c, 'den')) + '}';
        case 'sSup': return '{' + go(k(c, 'e')) + '}^{' + go(k(c, 'sup')) + '}';
        case 'sSub': return '{' + go(k(c, 'e')) + '}_{' + go(k(c, 'sub')) + '}';
        case 'sSubSup': return '{' + go(k(c, 'e')) + '}_{' + go(k(c, 'sub')) + '}^{' + go(k(c, 'sup')) + '}';
        case 'rad': { const deg = go(k(c, 'deg')); return '\\sqrt' + (deg ? '[' + deg + ']' : '') + '{' + go(k(c, 'e')) + '}'; }
        case 'd': { const pr = k(c, 'dPr'); const b = pr && k(pr, 'begChr'), e = pr && k(pr, 'endChr'); const bc = b ? b.getAttribute('m:val') || '(' : '(', ec = e ? e.getAttribute('m:val') || ')' : ')'; return '\\left' + (bc === '{' ? '\\{' : bc || '.') + Array.from(c.children).filter((x) => x.localName === 'e').map(go).join(',') + '\\right' + (ec === '}' ? '\\}' : ec || '.'); }
        case 'nary': { const pr = k(c, 'naryPr'); const ch = pr && k(pr, 'chr'); const op = ch ? (SYMS[ch.getAttribute('m:val')] || '\\int') : '\\int'; return op + '_{' + go(k(c, 'sub')) + '}^{' + go(k(c, 'sup')) + '}' + go(k(c, 'e')); }
        case 'func': return '\\' + go(k(c, 'fName')).replace(/\\/g, '') + ' ' + go(k(c, 'e'));
        case 'acc': return '\\hat{' + go(k(c, 'e')) + '}';
        case 'bar': return '\\overline{' + go(k(c, 'e')) + '}';
        case 'm': return '\\begin{matrix}' + Array.from(c.children).filter((x) => x.localName === 'mr').map((r) => Array.from(r.children).filter((x) => x.localName === 'e').map(go).join(' & ')).join(' \\\\ ') + '\\end{matrix}';
        case 'e': case 'oMath': case 'box': case 'borderBox': case 'groupChr': case 'limLow': case 'limUpp': return go(c);
        default: return go(c);
      }
    }
    return go(n).trim() || 'x';
  }
  D.ommlToTex = ommlToTex;
})();
