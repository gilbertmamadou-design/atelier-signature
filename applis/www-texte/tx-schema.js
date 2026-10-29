/* Texte — schéma du document (ProseMirror) : sections, paragraphes à styles (modèle « traitement de texte » :
   tout est paragraphe + style, listes par attributs), tableaux, sauts, table des matières, images, formes, équations,
   champs, notes, signets ; marques de caractère, liens, commentaires, révisions (insertion / suppression).
   Unités : points (pt) partout. Texte.schema, Texte.pt2px, Texte.css… */
(function () {
  'use strict';
  const O = window.Office, PMm = window.PM.model;
  const TX = window.Texte = window.Texte || {};
  const PX = 4 / 3;                                   // 1 pt = 4/3 px (96 ppp)
  TX.PX = PX;
  TX.pt2px = (v) => v * PX;
  TX.px2pt = (v) => v / PX;
  TX.cm2pt = (v) => v / 2.54 * 72;
  TX.pt2cm = (v) => v / 72 * 2.54;
  TX.mm2pt = (v) => v / 25.4 * 72;
  const num = (v) => (v == null || v === '' || isNaN(v)) ? null : +v;
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------------- bordures, trames ---------------- */
  // bordure : {s:'single'|'double'|'dotted'|'dashed'|'thick'|'none', w (pt), c (couleur), sp (espace pt)}
  const BSTYLE = { single: 'solid', thick: 'solid', double: 'double', dotted: 'dotted', dashed: 'dashed', dotDash: 'dashed', wave: 'solid', triple: 'double', inset: 'inset', outset: 'outset', threeDEmboss: 'ridge', threeDEngrave: 'groove' };
  TX.borderCss = function (b) {
    if (!b || !b.s || b.s === 'none' || b.s === 'nil') return 'none';
    const w = Math.max(b.s === 'double' ? 2.25 : 0.25, b.w || 0.5);
    return r2(w) + 'pt ' + (BSTYLE[b.s] || 'solid') + ' ' + TX.color(b.c || '#000000');
  };
  /** Couleur : '#RRGGBB', 't:accent1/+40' (thème) ou 'auto' */
  TX.color = function (c) {
    if (!c || c === 'auto') return 'currentColor';
    if (/^t:/.test(c)) return O.Themes.css(c);
    return c;
  };
  TX.HL = { yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF', blue: '#0000FF', red: '#FF0000', darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#C0C0C0', black: '#000000', white: '#FFFFFF' };

  /* ---------------- paragraphe : attributs → CSS ---------------- */
  // Attributs nuls = valeur du style. ln : interligne (multiple si lr 'auto', sinon pt), lr : 'auto'|'exact'|'atLeast'
  const P_ATTRS = { s: 'Normal', al: null, il: null, ir: null, fi: null, sb: null, sa: null, ln: null, lr: null, kn: null, kl: null, pb: null, wc: null, tabs: null, bd: null, sh: null, li: null, ls: null, ol: null, dc: null, pid: null, rpr: null, ctx: null };
  TX.P_ATTRS = P_ATTRS;
  /** Interligne « simple » propre à chaque police (ascendante + descendante + interligne de la police, en em) :
      un interligne « multiple » est multiplié par cette valeur, comme dans un traitement de texte. */
  TX.FONT_LF = { calibri: 1.22, carlito: 1.22, 'mag sans douce': 1.22, arial: 1.15, 'liberation sans': 1.15, 'mag sans': 1.15, helvetica: 1.15, 'times new roman': 1.15, 'liberation serif': 1.15, 'mag serif': 1.15, cambria: 1.172, caladea: 1.172, 'courier new': 1.133, 'liberation mono': 1.133, 'mag mono': 1.133, consolas: 1.17, georgia: 1.136, verdana: 1.215, tahoma: 1.207, 'segoe ui': 1.33, 'trebuchet ms': 1.16, garamond: 1.12, exo: 1.33, 'century gothic': 1.225, aptos: 1.2, roboto: 1.172, 'comic sans ms': 1.394, impact: 1.22, 'arial black': 1.41, 'franklin gothic': 1.135, bahnschrift: 1.2, candara: 1.22, corbel: 1.22, constantia: 1.22, 'palatino': 1.17, rockwell: 1.17 };
  TX.fontLf = (name) => TX.FONT_LF[String(name || '').toLowerCase()] || 1.17;
  TX.lineCss = function (ln, lr) {
    if (ln == null) return '';
    if (!lr || lr === 'auto') return 'line-height:calc(var(--lf,1.17)*' + r2(ln) + ');';
    if (lr === 'exact') return 'line-height:' + r2(ln) + 'pt;';
    return 'line-height:max(' + r2(ln) + 'pt, 1.17em);';
  };
  TX.paraCss = function (a) {
    let s = '';
    if (a.al) s += 'text-align:' + ({ left: 'left', center: 'center', right: 'right', justify: 'justify', both: 'justify', distribute: 'justify' }[a.al] || 'left') + ';';
    if (a.al === 'distribute') s += 'text-align-last:justify;';
    if (a.il != null) s += 'margin-left:' + r2(a.il) + 'pt;';
    if (a.ir != null) s += 'margin-right:' + r2(a.ir) + 'pt;';
    if (a.fi != null) s += 'text-indent:' + r2(a.fi) + 'pt;';
    if (a.sb != null) s += 'margin-top:' + r2(a.sb) + 'pt;';
    if (a.sa != null) s += 'margin-bottom:' + r2(a.sa) + 'pt;';
    s += TX.lineCss(a.ln, a.lr);
    if (a.sh) s += 'background-color:' + TX.color(a.sh) + ';';
    if (a.bd) {
      // la bordure est dessinée autour du texte, dans l'espace des retraits (comme un traitement de texte)
      ['t', 'b', 'l', 'r'].forEach((k) => {
        const b = a.bd[k], side = { t: 'top', b: 'bottom', l: 'left', r: 'right' }[k];
        if (!b || b.s === 'none') return;
        const sp = b.sp == null ? (k === 'l' || k === 'r' ? 4 : 1) : b.sp, w = b.w || 0.5;
        s += 'border-' + side + ':' + TX.borderCss(b) + ';padding-' + side + ':' + r2(sp) + 'pt;';
        if (k === 'l') s += 'margin-left:' + r2((a.il || 0) - sp - w) + 'pt;';
        if (k === 'r') s += 'margin-right:' + r2((a.ir || 0) - sp - w) + 'pt;';
      });
    }
    return s;
  };

  /* ---------------- marques : CSS ---------------- */
  const UL = { single: 'solid', words: 'solid', double: 'double', thick: 'solid', dotted: 'dotted', dottedHeavy: 'dotted', dash: 'dashed', dashedHeavy: 'dashed', dashLong: 'dashed', dotDash: 'dashed', dotDotDash: 'dotted', wave: 'wavy', wavyHeavy: 'wavy', wavyDouble: 'wavy' };
  TX.UL_STYLES = [['single', 'Simple'], ['double', 'Double'], ['thick', 'Épais'], ['dotted', 'Pointillé'], ['dash', 'Tirets'], ['dotDash', 'Trait-point'], ['wave', 'Ondulé'], ['words', 'Mots seulement']];

  /* ---------------- schéma ---------------- */
  const pAttrs = {}; Object.keys(P_ATTRS).forEach((k) => { pAttrs[k] = { default: P_ATTRS[k] }; });
  function paraDom(node) {
    const a = node.attrs, at = { 'data-s': a.s || 'Normal' };
    const st = TX.paraCss(a); if (st) at.style = st;
    if (a.pid) at['data-pid'] = a.pid;
    if (a.tabs && a.tabs.length) at['data-tabs'] = JSON.stringify(a.tabs);
    if (a.dc && a.dc.n) { at.class = 'tx-dc' + (a.dc.mode === 'margin' ? ' tx-dcm' : ''); at.style = (at.style || '') + '--dc:' + a.dc.n + ';'; }
    if (a.ol != null) at['data-ol'] = a.ol;
    return ['p', at, 0];
  }
  const headingRule = (lvl) => ({ tag: 'h' + lvl, getAttrs: (d) => Object.assign(paraFromDom(d), { s: 'Titre' + lvl }) });
  function paraFromDom(d) {
    const st = d.style || {}, a = {};
    const s = d.getAttribute && d.getAttribute('data-s'); if (s) a.s = s;
    const al = d.getAttribute && (d.getAttribute('align') || st.textAlign);
    if (al) a.al = { start: 'left', end: 'right', left: 'left', right: 'right', center: 'center', justify: 'justify' }[al] || null;
    const pt = (v) => { if (!v) return null; const m = /^(-?[\d.]+)(pt|px|cm|mm|in|em)?$/.exec(String(v).trim()); if (!m) return null; const n = +m[1]; return r2({ pt: n, px: n * 0.75, cm: TX.cm2pt(n), mm: TX.mm2pt(n), in: n * 72, em: n * 11 }[m[2] || 'px']); };
    if (st.marginLeft) a.il = pt(st.marginLeft); if (st.textIndent) a.fi = pt(st.textIndent);
    if (st.marginTop) a.sb = pt(st.marginTop); if (st.marginBottom) a.sa = pt(st.marginBottom);
    if (st.backgroundColor && st.backgroundColor !== 'transparent') a.sh = O.cssToHex(st.backgroundColor);
    const pid = d.getAttribute && d.getAttribute('data-pid'); if (pid) a.pid = pid;
    const li = d.getAttribute && d.getAttribute('data-li'); if (li) { try { a.li = JSON.parse(li); } catch (e) { } }
    if (d.getAttribute && d.getAttribute('data-hr')) a.bd = { b: { s: 'single', w: 0.75, c: '#808080', sp: 1 } };
    const tabs = d.getAttribute && d.getAttribute('data-tabs'); if (tabs) { try { a.tabs = JSON.parse(tabs); } catch (e) { } }
    return a;
  }
  TX.paraFromDom = paraFromDom;
  const cellExtra = { bg: null, bd: null, va: null, w: null, nw: null, dir: null };
  const cellAttrs = { colspan: { default: 1 }, rowspan: { default: 1 }, colwidth: { default: null } };
  Object.keys(cellExtra).forEach((k) => { cellAttrs[k] = { default: cellExtra[k] }; });
  function cellDom(tag) {
    return (node) => {
      const a = node.attrs, at = {};
      if (a.colspan !== 1) at.colspan = a.colspan; if (a.rowspan !== 1) at.rowspan = a.rowspan;
      if (a.colwidth) at['data-colwidth'] = a.colwidth.join(',');
      let s = '';
      if (a.bg) s += 'background-color:' + TX.color(a.bg) + ';';
      if (a.va) s += 'vertical-align:' + ({ top: 'top', center: 'middle', bottom: 'bottom' }[a.va] || 'top') + ';';
      if (a.bd) ['t', 'b', 'l', 'r'].forEach((k) => { if (a.bd[k]) s += 'border-' + { t: 'top', b: 'bottom', l: 'left', r: 'right' }[k] + ':' + TX.borderCss(a.bd[k]) + ';'; });
      if (a.dir === 'btLr') at.class = 'tx-vert'; else if (a.dir === 'tbRl') at.class = 'tx-vert2';
      if (s) at.style = s;
      return [tag, at, 0];
    };
  }
  function cellFromDom(d) {
    const w = d.getAttribute('data-colwidth');
    const a = { colspan: +(d.getAttribute('colspan') || 1), rowspan: +(d.getAttribute('rowspan') || 1), colwidth: w && /^\d+(,\d+)*$/.test(w) ? w.split(',').map(Number) : null };
    const bg = d.style.backgroundColor || d.getAttribute('bgcolor'); if (bg && bg !== 'transparent') a.bg = O.cssToHex(bg);
    if (!a.colwidth && d.getAttribute('width') && /^\d+$/.test(d.getAttribute('width')) && a.colspan === 1) a.colwidth = [+d.getAttribute('width')];
    return a;
  }

  const nodes = {
    doc: { content: 'section+', attrs: { styles: { default: null }, lists: { default: null }, settings: { default: null }, parts: { default: null }, notes: { default: null }, comments: { default: null }, props: { default: null } } },
    section: {
      content: 'block+', attrs: { pg: { default: null } }, defining: false,
      parseDOM: [{ tag: 'div.tx-sect', getAttrs: (d) => { try { return { pg: JSON.parse(d.getAttribute('data-pg') || 'null') }; } catch (e) { return {}; } } }],
      toDOM: (node) => {
        const g = Object.assign({ w: 595.3, h: 841.9, ml: 70.9, mr: 70.9, gut: 0, cols: { n: 1, gap: 35.4 } }, node.attrs.pg || {});
        const c = g.cols || { n: 1 };
        return ['div', { class: 'tx-sect' + (c.n > 1 ? ' tx-cols' : ''), 'data-pg': node.attrs.pg ? JSON.stringify(node.attrs.pg) : null,
          style: '--pw:' + r2(g.w) + 'pt;--ml:' + r2(g.ml + (g.gut || 0)) + 'pt;--mr:' + r2(g.mr) + 'pt;--cols:' + (c.n || 1) + ';--colgap:' + r2(c.gap || 35.4) + 'pt;--colrule:' + (c.sep ? '0.75pt solid #000' : 'none') }, 0];
      }
    },
    paragraph: {
      content: 'inline*', group: 'block', attrs: pAttrs,
      parseDOM: [{ tag: 'p', getAttrs: paraFromDom }, { tag: 'div:not(.tx-sect):not(.tx-tw):not(.tx-toc):not(.tx-pbrk):not(.tx-cbrk)', getAttrs: paraFromDom, priority: 20 }, { tag: 'div.tx-tw', ignore: false, skip: true },
        headingRule(1), headingRule(2), headingRule(3), headingRule(4), headingRule(5), headingRule(6),
        { tag: 'blockquote', getAttrs: (d) => Object.assign(paraFromDom(d), { s: 'Citation' }) },
        { tag: 'pre', preserveWhitespace: 'full', getAttrs: (d) => Object.assign(paraFromDom(d), { s: 'Code' }) }],
      toDOM: paraDom
    },
    table: {
      content: 'table_row+', group: 'block', tableRole: 'table', isolating: true,
      attrs: { ts: { default: 'Grille' }, al: { default: null }, ind: { default: null }, w: { default: null }, lay: { default: 'fixed' }, bd: { default: null }, cm: { default: null }, look: { default: null }, alt: { default: null }, cap: { default: null } },
      parseDOM: [{ tag: 'table', getAttrs: (d) => { let a = null; try { a = JSON.parse(d.getAttribute('data-ta') || 'null'); } catch (e) { } return a || { ts: d.getAttribute('data-ts') || (d.getAttribute('border') === '0' ? 'Aucun' : 'Grille'), al: d.getAttribute('data-al') || null }; } }],
      toDOM: (node) => {
        // rendu statique (en-têtes, pieds, exports HTML) : mêmes classes et largeurs que la vue d'édition
        const a = node.attrs, look = a.look || { hdr: true, band: true }, cols = [];
        let total = 0, fixed = true;
        if (node.firstChild) node.firstChild.forEach((c) => { for (let j = 0; j < c.attrs.colspan; j++) { const w = c.attrs.colwidth && c.attrs.colwidth[j]; cols.push(['col', { style: w ? 'width:' + w + 'px' : null }]); if (!w) fixed = false; total += w || 80; } });
        const cls = (look.hdr ? 'hdr ' : '') + (look.band ? 'band ' : '') + (look.fc ? 'fc ' : '') + (look.lr ? 'lr ' : '') + (a.bd ? 'tx-tbd' : '');
        let st = fixed ? 'width:' + total + 'px;table-layout:fixed;' : 'width:100%;';
        if (a.ind) st += 'margin-left:' + r2(a.ind) + 'pt;';
        if (a.cm) st += '--cpt:' + r2(a.cm.t || 0) + 'pt;--cpb:' + r2(a.cm.b || 0) + 'pt;--cpl:' + r2(a.cm.l == null ? 5.4 : a.cm.l) + 'pt;--cpr:' + r2(a.cm.r == null ? 5.4 : a.cm.r) + 'pt;';
        if (a.bd) ['t', 'b', 'l', 'r', 'h', 'v'].forEach((k) => { if (a.bd[k]) st += '--tb' + k + ':' + TX.borderCss(a.bd[k]) + ';'; });
        return ['div', { class: 'tx-tw' + (a.al ? ' tx-tal-' + a.al : '') }, ['table', { 'data-ts': a.ts || 'Grille', 'data-ta': JSON.stringify(a), class: cls.trim() || null, style: st }, ['colgroup'].concat(cols), ['tbody', 0]]];
      }
    },
    table_row: {
      content: '(table_cell | table_header)*', tableRole: 'row', attrs: { hdr: { default: false }, h: { default: null }, hr: { default: null }, cs: { default: false } },
      parseDOM: [{ tag: 'tr', getAttrs: (d) => ({ hdr: d.parentNode && d.parentNode.tagName === 'THEAD' }) }],
      toDOM: (node) => ['tr', { class: node.attrs.hdr ? 'tx-hdr' : null, style: node.attrs.h ? 'height:' + node.attrs.h + 'pt' : null }, 0]
    },
    table_cell: { content: 'block+', attrs: cellAttrs, tableRole: 'cell', isolating: true, parseDOM: [{ tag: 'td', getAttrs: cellFromDom }], toDOM: cellDom('td') },
    table_header: { content: 'block+', attrs: cellAttrs, tableRole: 'header_cell', isolating: true, parseDOM: [{ tag: 'th', getAttrs: cellFromDom }], toDOM: cellDom('th') },
    page_break: { group: 'block', atom: true, selectable: true, parseDOM: [{ tag: 'div.tx-pbrk' }, { tag: 'hr.tx-pbrk' }], toDOM: () => ['div', { class: 'tx-pbrk', contenteditable: 'false' }] },
    col_break: { group: 'block', atom: true, selectable: true, parseDOM: [{ tag: 'div.tx-cbrk' }], toDOM: () => ['div', { class: 'tx-cbrk', contenteditable: 'false' }] },
    toc: {
      group: 'block', atom: true, selectable: true, draggable: false,
      attrs: { kind: { default: 'toc' }, levels: { default: 3 }, label: { default: 'Figure' }, links: { default: true }, leader: { default: 'dot' }, nums: { default: true }, title: { default: null }, entries: { default: null } },
      parseDOM: [{ tag: 'div.tx-toc', getAttrs: (d) => { try { return JSON.parse(d.getAttribute('data-toc') || '{}'); } catch (e) { return {}; } } }],
      toDOM: (node) => ['div', { class: 'tx-toc', 'data-toc': JSON.stringify(node.attrs) }]
    },
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    tab: { inline: true, group: 'inline', atom: true, selectable: false, parseDOM: [{ tag: 'span.tx-tab' }], toDOM: () => ['span', { class: 'tx-tab' }, '\t'] },
    image: {
      inline: true, group: 'inline', atom: true, draggable: true,
      attrs: { m: { default: null }, src: { default: null }, w: { default: 100 }, h: { default: 100 }, alt: { default: '' }, title: { default: null }, wrap: { default: 'inline' }, al: { default: 'left' }, x: { default: 0 }, y: { default: 0 }, crop: { default: null }, rot: { default: 0 }, fh: { default: false }, fv: { default: false }, bd: { default: null }, sha: { default: null }, dec: { default: false }, link: { default: null } },
      parseDOM: [{ tag: 'img', getAttrs: (d) => { try { const a = JSON.parse(d.getAttribute('data-a') || 'null'); if (a) return a; } catch (e) { } return { src: d.getAttribute('src'), m: d.getAttribute('data-m') || null, alt: d.getAttribute('alt') || '', w: r2((+d.getAttribute('width') || d.width || 160) * 0.75), h: r2((+d.getAttribute('height') || d.height || 120) * 0.75) }; } }],
      toDOM: (node) => ['img', { 'data-m': node.attrs.m, 'data-a': JSON.stringify(node.attrs), src: node.attrs.src || '', alt: node.attrs.alt || '', width: Math.round(node.attrs.w * PX), height: Math.round(node.attrs.h * PX) }]
    },
    // objets dessinés : forme, zone de texte, icône, graphique, SmartArt
    drawing: {
      inline: true, group: 'inline', atom: true, draggable: true,
      attrs: { kind: { default: 'shape' }, shape: { default: 'rect' }, adj: { default: null }, w: { default: 144 }, h: { default: 96 }, wrap: { default: 'square' }, al: { default: 'left' }, x: { default: 0 }, y: { default: 0 }, rot: { default: 0 }, fill: { default: 't:accent1' }, line: { default: null }, html: { default: '' }, va: { default: 'middle' }, pad: { default: 7.2 }, icon: { default: null }, chart: { default: null }, smart: { default: null }, alt: { default: '' }, color: { default: null } },
      parseDOM: [{ tag: 'span.tx-draw', getAttrs: (d) => { try { return JSON.parse(d.getAttribute('data-d') || '{}'); } catch (e) { return {}; } } }],
      toDOM: (node) => ['span', { class: 'tx-draw', 'data-d': JSON.stringify(node.attrs) }]
    },
    math: {
      inline: true, group: 'inline', atom: true,
      attrs: { tex: { default: 'x' }, display: { default: false } },
      parseDOM: [{ tag: 'span.tx-math', getAttrs: (d) => ({ tex: d.getAttribute('data-tex') || '', display: d.getAttribute('data-display') === '1' }) }],
      toDOM: (node) => ['span', { class: 'tx-math', 'data-tex': node.attrs.tex, 'data-display': node.attrs.display ? '1' : '0' }, node.attrs.tex]
    },
    // champs : page, pages, sectionpages, date, time, title, author, subject, file, words, seq, ref, pageref, merge, noteref
    field: {
      inline: true, group: 'inline', atom: true,
      attrs: { f: { default: 'page' }, fmt: { default: null }, name: { default: null }, ref: { default: null }, show: { default: null }, cache: { default: '' } },
      parseDOM: [{ tag: 'span.tx-field', getAttrs: (d) => { try { return JSON.parse(d.getAttribute('data-f') || '{}'); } catch (e) { return {}; } } }],
      toDOM: (node) => ['span', { class: 'tx-field', 'data-f': JSON.stringify(node.attrs), 'data-k': node.attrs.f }, node.attrs.cache || '']
    },
    fnref: {
      inline: true, group: 'inline', atom: true, selectable: true,
      attrs: { id: { default: null }, end: { default: false }, mark: { default: null } },
      parseDOM: [{ tag: 'sup.tx-fn', getAttrs: (d) => ({ id: d.getAttribute('data-id'), end: d.getAttribute('data-end') === '1' }) }],
      toDOM: (node) => ['sup', { class: 'tx-fn', 'data-id': node.attrs.id, 'data-end': node.attrs.end ? '1' : '0' }]
    },
    bookmark: {
      inline: true, group: 'inline', atom: true, selectable: false,
      attrs: { name: { default: '' } },
      parseDOM: [{ tag: 'a[data-bk]', getAttrs: (d) => ({ name: d.getAttribute('data-bk') }) }],
      toDOM: (node) => ['a', { 'data-bk': node.attrs.name, class: 'tx-bk', id: 'bk-' + node.attrs.name }]
    }
  };

  const sp = (style) => ['span', { style }, 0];
  const marks = {
    link: { attrs: { href: { default: '' }, title: { default: null } }, inclusive: false, parseDOM: [{ tag: 'a[href]', getAttrs: (d) => ({ href: d.getAttribute('href'), title: d.getAttribute('title') }) }], toDOM: (m) => ['a', { href: m.attrs.href, title: m.attrs.title || m.attrs.href, class: 'tx-link', rel: 'noopener' }, 0] },
    cmt: { attrs: { id: { default: '' } }, inclusive: false, excludes: '', parseDOM: [{ tag: 'span.tx-cmt', getAttrs: (d) => ({ id: d.getAttribute('data-c') }) }], toDOM: (m) => ['span', { class: 'tx-cmt', 'data-c': m.attrs.id }, 0] },
    ins: { attrs: { id: { default: '' }, a: { default: '' }, d: { default: '' } }, inclusive: true, excludes: 'del', parseDOM: [{ tag: 'ins', getAttrs: (d) => ({ id: d.getAttribute('data-id') || '', a: d.getAttribute('data-a') || '', d: d.getAttribute('datetime') || '' }) }], toDOM: (m) => ['ins', { class: 'tx-ins', 'data-id': m.attrs.id, 'data-a': m.attrs.a, datetime: m.attrs.d, title: 'Insertion : ' + (m.attrs.a || '') }, 0] },
    del: { attrs: { id: { default: '' }, a: { default: '' }, d: { default: '' } }, inclusive: false, excludes: 'ins', parseDOM: [{ tag: 'del', getAttrs: (d) => ({ id: d.getAttribute('data-id') || '', a: d.getAttribute('data-a') || '', d: d.getAttribute('datetime') || '' }) }], toDOM: (m) => ['del', { class: 'tx-del', 'data-id': m.attrs.id, 'data-a': m.attrs.a, datetime: m.attrs.d, title: 'Suppression : ' + (m.attrs.a || '') }, 0] },
    cs: { attrs: { id: { default: '' } }, parseDOM: [{ tag: 'span[data-cs]', getAttrs: (d) => ({ id: d.getAttribute('data-cs') }) }], toDOM: (m) => ['span', { 'data-cs': m.attrs.id }, 0] },
    font: { attrs: { f: { default: '' } }, parseDOM: [{ style: 'font-family', getAttrs: (v) => { const f = O.fontName(v); return f && !/^(inherit|initial)$/.test(f) ? { f } : false; } }], toDOM: (m) => sp('font-family:' + TX.fontCss(m.attrs.f)) },
    size: { attrs: { pt: { default: 11 } }, parseDOM: [{ style: 'font-size', getAttrs: (v) => { const m = /^([\d.]+)(pt|px)$/.exec(v); return m ? { pt: r2(m[2] === 'px' ? +m[1] * 0.75 : +m[1]) } : false; } }], toDOM: (m) => sp('font-size:' + m.attrs.pt + 'pt') },
    color: { attrs: { c: { default: '#000000' } }, parseDOM: [{ style: 'color', getAttrs: (v) => { const c = O.cssToHex(v); return c ? { c } : false; } }], toDOM: (m) => sp('color:' + TX.color(m.attrs.c)) },
    hl: { attrs: { c: { default: 'yellow' } }, parseDOM: [{ tag: 'mark', getAttrs: () => ({ c: 'yellow' }) }, { style: 'background-color', getAttrs: (v) => { const c = O.cssToHex(v); return c && c !== '#FFFFFF' ? { c } : false; } }], toDOM: (m) => ['span', { class: 'tx-hl', style: 'background-color:' + (TX.HL[m.attrs.c] || TX.color(m.attrs.c)) }, 0] },
    shd: { attrs: { c: { default: '#D9D9D9' } }, parseDOM: [], toDOM: (m) => sp('background-color:' + TX.color(m.attrs.c)) },
    b: { parseDOM: [{ tag: 'b' }, { tag: 'strong' }, { style: 'font-weight', getAttrs: (v) => /^(bold|[6-9]\d\d)$/.test(v) && null }], toDOM: () => sp('font-weight:700') },
    nob: { parseDOM: [], toDOM: () => sp('font-weight:400') },
    i: { parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }], toDOM: () => sp('font-style:italic') },
    noi: { parseDOM: [], toDOM: () => sp('font-style:normal') },
    u: { attrs: { s: { default: 'single' }, c: { default: null } }, parseDOM: [{ tag: 'u' }, { style: 'text-decoration-line', getAttrs: (v) => /underline/.test(v) && {} }, { style: 'text-decoration', getAttrs: (v) => /underline/.test(v) && {} }], toDOM: (m) => ['span', { class: 'tx-u', style: 'text-decoration-line:underline;text-decoration-style:' + (UL[m.attrs.s] || 'solid') + ';' + (m.attrs.s === 'thick' || /Heavy/.test(m.attrs.s) ? 'text-decoration-thickness:2px;' : '') + (m.attrs.c ? 'text-decoration-color:' + TX.color(m.attrs.c) + ';' : '') + (m.attrs.s === 'words' ? 'text-decoration-skip-ink:auto;' : '') }, 0] },
    s: { attrs: { dbl: { default: false } }, parseDOM: [{ tag: 's' }, { tag: 'strike' }, { style: 'text-decoration-line', getAttrs: (v) => /line-through/.test(v) && {} }, { style: 'text-decoration', getAttrs: (v) => /line-through/.test(v) && {} }], toDOM: (m) => ['span', { class: 'tx-s', style: 'text-decoration-line:line-through;' + (m.attrs.dbl ? 'text-decoration-style:double;' : '') }, 0] },
    va: { attrs: { v: { default: 'sup' } }, excludes: 'va', parseDOM: [{ tag: 'sup', getAttrs: (d) => d.classList.contains('tx-fn') ? false : { v: 'sup' } }, { tag: 'sub', getAttrs: () => ({ v: 'sub' }) }], toDOM: (m) => [m.attrs.v === 'sub' ? 'sub' : 'sup', 0] },
    caps: { parseDOM: [{ style: 'text-transform=uppercase' }], toDOM: () => sp('text-transform:uppercase') },
    smcaps: { parseDOM: [{ style: 'font-variant=small-caps' }], toDOM: () => sp('font-variant:small-caps') },
    sp: { attrs: { pt: { default: 0 } }, parseDOM: [{ style: 'letter-spacing', getAttrs: (v) => { const m = /^(-?[\d.]+)pt$/.exec(v); return m ? { pt: +m[1] } : false; } }], toDOM: (m) => sp('letter-spacing:' + m.attrs.pt + 'pt') },
    pos: { attrs: { pt: { default: 0 } }, parseDOM: [], toDOM: (m) => sp('position:relative;top:' + (-m.attrs.pt) + 'pt') },
    hidden: { parseDOM: [{ tag: 'span.tx-hidden' }], toDOM: () => ['span', { class: 'tx-hidden' }, 0] }
  };
  TX.schema = new PMm.Schema({ nodes, marks });
  TX.DOMSerializer = PMm.DOMSerializer.fromSchema(TX.schema);
  TX.DOMParser = PMm.DOMParser.fromSchema(TX.schema);

  /** Pile CSS d'une police (polices équivalentes incluses : voir pc/shared/vendor/fonts) ; '+major' / '+minor' = thème */
  TX.fontCss = function (f) {
    if (!f) return 'inherit';
    if (f === '+major') return 'var(--t-major)'; if (f === '+minor') return 'var(--t-minor)';
    return O.fontStack(f);
  };
  /** Le texte d'un nœud (blocs séparés par \n) */
  TX.textOf = (node) => { let s = ''; node.descendants((n) => { if (n.isText) s += n.text; else if (n.type.name === 'tab') s += '\t'; else if (n.type.name === 'hard_break') s += '\n'; else if (n.isBlock && s && !/\n$/.test(s)) s += '\n'; return true; }); return s; };
  TX.uid = (p) => (p || '') + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
})();
