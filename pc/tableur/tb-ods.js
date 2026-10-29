/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-tableur/tb-ods.js : ne pas modifier ici. */
/* Tableur — OpenDocument tableur (.ods), lecture et écriture (format ouvert ISO/IEC 26300, celui de LibreOffice).
   Valeurs et types (nombres, dates, heures, pourcentages, monnaies, booléens, textes), formules (OpenFormula ⇄ A1),
   formats de nombre, styles de cellule (police, taille, gras, italique, souligné, barré, couleurs, remplissage,
   bordures, alignements, renvoi, rotation, retrait), largeurs et hauteurs, lignes / colonnes masquées, fusions,
   feuilles masquées, couleur d'onglet, volets figés, noms, notes, liens, validations, mises en forme conditionnelles
   (valeur, formule, nuances, barres de données). */
(function () {
  'use strict';
  const TB = window.Tableur, P = TB.Formula;
  const ODS = TB.Ods = {};
  const NS = { office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0', text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0', number: 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0', xlink: 'http://www.w3.org/1999/xlink', calcext: 'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0', of: 'urn:oasis:names:tc:opendocument:xmlns:of:1.2', svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', dc: 'http://purl.org/dc/elements/1.1/', config: 'urn:oasis:names:tc:opendocument:xmlns:config:1.0', loext: 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0', tableooo: 'http://openoffice.org/2009/table', meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0' };
  const XMLH = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NSDECL = Object.keys(NS).map((k) => 'xmlns:' + k + '="' + NS[k] + '"').join(' ');
  const cm = (px) => (px * 2.54 / 96).toFixed(3) + 'cm';
  const toPx = (len) => { const m = /^([\d.]+)(cm|mm|in|pt|pc|px)?$/.exec(String(len || '').trim()); if (!m) return null; const v = +m[1]; switch (m[2]) { case 'mm': return v * 96 / 25.4; case 'in': return v * 96; case 'pt': return v * 96 / 72; case 'pc': return v * 16; case 'px': return v; default: return v * 96 / 2.54; } };

  /* =====================================================================
     Formules
     ===================================================================== */
  const quoteOds = (n) => /^[A-Za-z_][\w]*$/.test(n) ? n : "'" + String(n).replace(/'/g, "''") + "'";
  /** arbre (canonique) → texte OpenFormula (sans « of:= ») */
  function odsWrite(n, ctx) {
    const W = (x) => odsWrite(x, ctx);
    const pre = (sh, abs) => sh == null ? '.' : (abs !== false ? '$' : '') + quoteOds(sh) + '.';
    const addr = (r, c, ra, ca) => TB.addr(r, c, ra, ca);
    switch (n.t) {
      case 'n': return String(n.v);
      case 's': return '"' + n.v.replace(/"/g, '""') + '"';
      case 'b': return n.v ? 'TRUE()' : 'FALSE()';
      case 'e': return ({ '#N/A': 'NA()', '#DIV/0!': '1/0' })[n.v] || 'NA()';
      case 'ref': return '[' + pre(n.sh) + addr(n.r, n.c, n.ra, n.ca) + ']';
      case 'area': {
        if (n.k === 'col') return '[' + pre(n.sh) + (n.ca1 ? '$' : '') + TB.colName(n.c1) + '$1:' + (n.sh != null ? pre(n.sh) : '.') + (n.ca2 ? '$' : '') + TB.colName(n.c2) + '$1048576]';
        if (n.k === 'row') return '[' + pre(n.sh) + '$A' + (n.ra1 ? '$' : '') + (n.r1 + 1) + ':' + (n.sh != null ? pre(n.sh) : '.') + '$XFD' + (n.ra2 ? '$' : '') + (n.r2 + 1) + ']';
        return '[' + pre(n.sh) + addr(n.r1, n.c1, n.ra1, n.ca1) + ':' + (n.sh != null ? pre(n.sh2 || n.sh) : '.') + addr(n.r2, n.c2, n.ra2, n.ca2) + ']';
      }
      case 'range': {
        if (n.l.t === 'ref' && n.r.t === 'ref') return '[' + pre(n.l.sh) + addr(n.l.r, n.l.c, n.l.ra, n.l.ca) + ':' + (n.l.sh != null ? pre(n.r.sh != null ? n.r.sh : n.l.sh) : '.') + addr(n.r.r, n.r.c, n.r.ra, n.r.ca) + ']';
        return W(n.l) + ':' + W(n.r);
      }
      case 'spill': return W(n.x);
      case 'name': return n.n;
      case 'sref': { const g = ctx.wb.resolveSref(n, ctx.f); if (!g || g instanceof TB.Err) return 'NA()'; const s = g.sh === ctx.sh ? null : g.sh.name; return '[' + pre(s) + TB.addr(g.r1, g.c1, true, true) + ':' + (s ? pre(s) : '.') + TB.addr(g.r2, g.c2, true, true) + ']'; }
      case 'miss': return '';
      case 'fn': { const nm = ODS_FN_OUT[n.n] || n.n; return nm + '(' + n.a.map(W).join(';') + ')'; }
      case 'call': return W(n.f) + '(' + n.a.map(W).join(';') + ')';
      case 'paren': return '(' + W(n.x) + ')';
      case 'union': return n.l.map(W).join('~');
      case 'neg': return '-' + W(n.x);
      case 'pos': return '+' + W(n.x);
      case 'pct': return W(n.x) + '%';
      case 'op': return W(n.l) + (n.o === ' ' ? '!' : n.o) + W(n.r);
      case 'arr': return '{' + n.rows.map((r) => r.map(W).join(';')).join('|') + '}';
    }
    return '';
  }
  // fonctions dont le nom diffère dans LibreOffice / OpenFormula
  const ODS_FN_OUT = { 'CEILING.MATH': 'COM.MICROSOFT.CEILING.MATH', 'FLOOR.MATH': 'COM.MICROSOFT.FLOOR.MATH', XLOOKUP: 'COM.MICROSOFT.XLOOKUP', XMATCH: 'COM.MICROSOFT.XMATCH', FILTER: 'COM.MICROSOFT.FILTER', SORT: 'COM.MICROSOFT.SORT', SORTBY: 'COM.MICROSOFT.SORTBY', UNIQUE: 'COM.MICROSOFT.UNIQUE', SEQUENCE: 'COM.MICROSOFT.SEQUENCE', RANDARRAY: 'COM.MICROSOFT.RANDARRAY', LET: 'COM.MICROSOFT.LET', IFS: 'COM.MICROSOFT.IFS', SWITCH: 'COM.MICROSOFT.SWITCH', MAXIFS: 'COM.MICROSOFT.MAXIFS', MINIFS: 'COM.MICROSOFT.MINIFS', CONCAT: 'COM.MICROSOFT.CONCAT', TEXTJOIN: 'COM.MICROSOFT.TEXTJOIN', 'FORECAST.LINEAR': 'COM.MICROSOFT.FORECAST.LINEAR', 'STDEV.S': 'COM.MICROSOFT.STDEV.S', 'STDEV.P': 'COM.MICROSOFT.STDEV.P', 'VAR.S': 'COM.MICROSOFT.VAR.S', 'VAR.P': 'COM.MICROSOFT.VAR.P', 'MODE.SNGL': 'COM.MICROSOFT.MODE.SNGL', 'PERCENTILE.INC': 'COM.MICROSOFT.PERCENTILE.INC', 'QUARTILE.INC': 'COM.MICROSOFT.QUARTILE.INC', 'RANK.EQ': 'COM.MICROSOFT.RANK.EQ', 'RANK.AVG': 'COM.MICROSOFT.RANK.AVG', 'NORM.DIST': 'COM.MICROSOFT.NORM.DIST', 'NORM.INV': 'COM.MICROSOFT.NORM.INV', 'NORM.S.DIST': 'COM.MICROSOFT.NORM.S.DIST', 'T.TEST': 'COM.MICROSOFT.T.TEST', 'NETWORKDAYS.INTL': 'COM.MICROSOFT.NETWORKDAYS.INTL', 'WORKDAY.INTL': 'COM.MICROSOFT.WORKDAY.INTL', 'ISOWEEKNUM': 'ISOWEEKNUM', 'TEXTBEFORE': 'COM.MICROSOFT.TEXTBEFORE', 'TEXTAFTER': 'COM.MICROSOFT.TEXTAFTER', 'TEXTSPLIT': 'COM.MICROSOFT.TEXTSPLIT', 'VSTACK': 'COM.MICROSOFT.VSTACK', 'HSTACK': 'COM.MICROSOFT.HSTACK', 'TOCOL': 'COM.MICROSOFT.TOCOL', 'TOROW': 'COM.MICROSOFT.TOROW', 'CHOOSECOLS': 'COM.MICROSOFT.CHOOSECOLS', 'CHOOSEROWS': 'COM.MICROSOFT.CHOOSEROWS', 'TAKE': 'COM.MICROSOFT.TAKE', 'DROP': 'COM.MICROSOFT.DROP', 'EXPAND': 'COM.MICROSOFT.EXPAND', 'WRAPROWS': 'COM.MICROSOFT.WRAPROWS', 'WRAPCOLS': 'COM.MICROSOFT.WRAPCOLS', 'LAMBDA': 'COM.MICROSOFT.LAMBDA', 'IFNA': 'IFNA', 'DAYS': 'DAYS' };
  ODS.toOds = function (canon, wb, sh, r, c) { try { return 'of:=' + odsWrite(P.parse(canon, P.CANON), { wb, sh, f: { sh, r, c } }); } catch (e) { return null; } };
  /** OpenFormula (« of:=… ») → formule canonique A1 */
  ODS.fromOds = function (f) {
    let s = String(f || '').replace(/^(?:of|oooc|msoxl):/, '').replace(/^=/, '');
    let out = '', i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"') { let j = i + 1; while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { j += 2; continue; } break; } j++; } out += s.slice(i, j + 1); i = j + 1; continue; }
      if (ch === '[') {
        const j = s.indexOf(']', i); const inner = s.slice(i + 1, j < 0 ? s.length : j); i = j < 0 ? s.length : j + 1;
        const parts = inner.split(':'); let sheet = null;
        const one = (p) => { const m = /^(?:\$?('(?:[^']|'')+'|[^.']*))?\.(\$?[A-Za-z]+\$?\d+|\$?[A-Za-z]+|\$?\d+)$/.exec(p); if (!m) return null; if (m[1]) sheet = m[1].replace(/^'|'$/g, '').replace(/''/g, "'"); return m[2]; };
        const a = one(parts[0]); const sh0 = sheet; const b = parts[1] != null ? one(parts[1]) : null;
        if (a == null) { out += '#REF!'; continue; }
        const pref = sh0 ? TB.quoteSheet(sh0) + '!' : '';
        let ref = a + (b != null ? ':' + b : '');
        // colonnes / lignes entières écrites $A$1:$A$1048576
        ref = ref.replace(/^(\$?[A-Z]+)\$?1:(\$?[A-Z]+)\$?1048576$/, '$1:$2').replace(/^\$?A(\$?\d+):\$?XFD(\$?\d+)$/, '$1:$2');
        out += pref + ref; continue;
      }
      if (ch === ';') { out += ','; i++; continue; }
      if (ch === '~') { out += ','; i++; continue; }
      if (ch === '{') { const j = s.indexOf('}', i); out += s.slice(i, j + 1).replace(/;/g, ',').replace(/\|/g, ';'); i = j + 1; continue; }
      out += ch; i++;
    }
    out = out.replace(/\b(?:COM\.MICROSOFT|ORG\.OPENOFFICE|ORG\.LIBREOFFICE|_xlfn)\./gi, '').replace(/\bTRUE\(\)/gi, 'TRUE').replace(/\bFALSE\(\)/gi, 'FALSE');
    try { return P.write(P.parse(out, P.CANON), P.CANON); } catch (e) { return null; }
  };

  /* =====================================================================
     Formats de nombre : code Excel ⇄ style de données ODF
     ===================================================================== */
  function dataStyleXml(name, code) {
    if (!code || code === 'General') return null;
    const C = TB.Fmt.compile(code); const sec = C.secs[0]; const t = sec.tokens, info = sec.info;
    const txt = (s) => s ? '<number:text>' + esc(s) + '</number:text>' : '';
    const kind = TB.Fmt.kindOf(code);
    const neg = C.secs[1]; const negRed = neg && /red|rouge/i.test(String(neg.info.color || ''));
    let body = '', tag = 'number:number-style', extra = '';
    if (info.text && !t.some((x) => x.t === 'ph')) { tag = 'number:text-style'; body = t.map((x) => x.t === 'at' ? '<number:text-content/>' : x.t === 'lit' ? txt(x.s) : '').join(''); }
    else if (info.date) {
      tag = t.some((x) => x.t === 'd' && /^[dmy]$/.test(x.c) && !(x.c === 'm' && false)) && t.some((x) => x.t === 'd' && (x.c === 'd' || x.c === 'y' || x.c === 'm')) ? 'number:date-style' : 'number:time-style';
      if (info.elapsed) { tag = 'number:time-style'; extra = ' number:truncate-on-overflow="false"'; }
      body = t.map((x) => {
        if (x.t === 'lit') return txt(x.s);
        if (x.t === 'ampm') return '<number:am-pm/>';
        if (x.t === 'el') return x.c === 'h' ? '<number:hours' + (x.n > 1 ? ' number:style="long"' : '') + '/>' : x.c === 'm' ? '<number:minutes' + (x.n > 1 ? ' number:style="long"' : '') + '/>' : '<number:seconds' + (x.n > 1 ? ' number:style="long"' : '') + '/>';
        if (x.t !== 'd') return x.t === 'dot' ? txt('.') : x.t === 'slash' ? txt('/') : x.t === 'comma' ? txt(',') : x.t === 'ph' ? txt(x.c) : '';
        switch (x.c) {
          case 'd': return x.n >= 4 ? '<number:day-of-week number:style="long"/>' : x.n === 3 ? '<number:day-of-week/>' : '<number:day' + (x.n === 2 ? ' number:style="long"' : '') + '/>';
          case 'm': return x.n >= 4 ? '<number:month number:textual="true" number:style="long"/>' : x.n === 3 ? '<number:month number:textual="true"/>' : '<number:month' + (x.n === 2 ? ' number:style="long"' : '') + '/>';
          case 'y': return '<number:year' + (x.n > 2 ? ' number:style="long"' : '') + '/>';
          case 'h': return '<number:hours' + (x.n > 1 ? ' number:style="long"' : '') + '/>';
          case 'mi': return '<number:minutes' + (x.n > 1 ? ' number:style="long"' : '') + '/>';
          case 's': return '<number:seconds' + (x.n > 1 ? ' number:style="long"' : '') + (x.dec ? ' number:decimal-places="' + x.dec + '"' : '') + '/>';
        }
        return '';
      }).join('');
    } else {
      const ph = t.filter((x) => x.t === 'ph'); const dot = t.findIndex((x) => x.t === 'dot'); const exp = t.findIndex((x) => x.t === 'exp');
      const decs = dot < 0 ? 0 : t.slice(dot + 1, exp < 0 ? t.length : exp).filter((x) => x.t === 'ph').length;
      const intPart = t.slice(0, dot < 0 ? (exp < 0 ? t.length : exp) : dot).filter((x) => x.t === 'ph');
      const minInt = intPart.filter((x) => x.c === '0').length;
      const grouping = t.some((x, i) => x.t === 'comma' && t.slice(i + 1).some((y) => y.t === 'ph'));
      const pre = [], post = []; let seenPh = false;
      t.forEach((x) => { if (x.t === 'ph' || x.t === 'dot' || x.t === 'comma' || x.t === 'exp' || x.t === 'slash') { seenPh = true; return; } if (x.t === 'lit') (seenPh ? post : pre).push(x.s); });
      const numEl = (kind === 'scientific' ? '<number:scientific-number number:decimal-places="' + decs + '" number:min-integer-digits="' + Math.max(1, minInt) + '" number:min-exponent-digits="2"/>' : kind === 'fraction' ? '<number:fraction number:min-integer-digits="0" number:min-numerator-digits="1" number:min-denominator-digits="' + Math.max(1, t.filter((x, i) => i > t.findIndex((y) => y.t === 'slash') && (x.t === 'ph' || x.t === 'digit')).length) + '"/>' : '<number:number number:decimal-places="' + decs + '" number:min-decimal-places="' + decs + '" number:min-integer-digits="' + minInt + '"' + (grouping ? ' number:grouping="true"' : '') + '/>');
      const preS = pre.join(''), postS = post.join('');
      if (kind === 'percent') { tag = 'number:percentage-style'; body = txt(preS) + numEl + txt(postS.replace('%', '') + '%'); }
      else if (kind === 'currency' || kind === 'accounting') { tag = 'number:currency-style'; const sym = /€/.test(code) ? '€' : /\$/.test(code) ? '$' : /£/.test(code) ? '£' : /CHF/.test(code) ? 'CHF' : '€'; const after = (postS + preS).indexOf(sym) >= 0 && postS.indexOf(sym) >= 0; const cur = '<number:currency-symbol' + (sym === '€' ? ' number:language="fr" number:country="FR"' : '') + '>' + esc(sym) + '</number:currency-symbol>'; body = after ? numEl + txt(postS.replace(sym, '').replace(/^\s*/, ' ').replace(/\s+$/, ' ').replace(/^ $/, ' ')) + cur : cur + numEl; }
      else body = txt(preS) + numEl + txt(postS);
    }
    let x = '<' + tag + ' style:name="' + name + (negRed ? 'P0' : '') + '"' + extra + (negRed ? ' style:volatile="true"' : '') + '>' + body + '</' + tag + '>';
    if (negRed) x += '<' + tag + ' style:name="' + name + '"' + extra + '><style:text-properties fo:color="#ff0000"/>' + txt('-') + body.replace(/<number:text>-<\/number:text>/, '') + '<style:map style:condition="value()&gt;=0" style:apply-style-name="' + name + 'P0"/></' + tag + '>';
    return { xml: x, tag };
  }
  /** style de données ODF (élément DOM) → code Excel */
  function codeFromDataStyle(el, all) {
    if (!el) return null;
    const ln = el.localName; let code = '';
    const kids = Array.from(el.children);
    const q = (s) => s ? (/^[\s\-/:.,()]+$/.test(s) ? s.replace(/ /g, '\\ ') : '"' + s.replace(/"/g, '') + '"') : '';
    kids.forEach((k) => {
      const long = k.getAttributeNS(NS.number, 'style') === 'long', tx = k.getAttributeNS(NS.number, 'textual') === 'true';
      switch (k.localName) {
        case 'text': code += ln === 'percentage-style' && k.textContent.trim() === '%' ? k.textContent.replace(/ /g, '\\ ') : q(k.textContent); break;
        case 'day': code += long ? 'dd' : 'd'; break;
        case 'day-of-week': code += long ? 'dddd' : 'ddd'; break;
        case 'month': code += tx ? (long ? 'mmmm' : 'mmm') : (long ? 'mm' : 'm'); break;
        case 'year': code += long ? 'yyyy' : 'yy'; break;
        case 'hours': code += ln === 'time-style' && el.getAttributeNS(NS.number, 'truncate-on-overflow') === 'false' ? (long ? '[hh]' : '[h]') : (long ? 'hh' : 'h'); break;
        case 'minutes': code += long ? 'mm' : 'm'; break;
        case 'seconds': { code += long ? 'ss' : 's'; const d = +(k.getAttributeNS(NS.number, 'decimal-places') || 0); if (d) code += '.' + '0'.repeat(d); break; }
        case 'am-pm': code += 'AM/PM'; break;
        case 'text-content': code += '@'; break;
        case 'currency-symbol': code += '"' + k.textContent + '"'; break;
        case 'number': case 'scientific-number': {
          const d = +(k.getAttributeNS(NS.number, 'decimal-places') || 0), mi = +(k.getAttributeNS(NS.number, 'min-integer-digits') || 1), gr = k.getAttributeNS(NS.number, 'grouping') === 'true';
          let n = gr ? '#,##' + '0'.repeat(Math.max(1, mi)) : '0'.repeat(Math.max(1, mi)); if (gr && mi > 1) n = '#,' + '0'.repeat(Math.max(3, mi)); if (!mi && !gr) n = '#'; if (d) n += '.' + '0'.repeat(d);
          if (k.localName === 'scientific-number') n += 'E+' + '0'.repeat(+(k.getAttributeNS(NS.number, 'min-exponent-digits') || 2));
          code += n; break;
        }
        case 'fraction': { const dd = +(k.getAttributeNS(NS.number, 'min-denominator-digits') || 1); code += '# ' + '?'.repeat(Math.max(1, dd)) + '/' + '?'.repeat(Math.max(1, dd)); break; }
      }
    });
    if (ln === 'percentage-style' && !/%/.test(code)) code += '%';
    // style négatif rouge : style:map vers un style positif
    const map = kids.find((k) => k.localName === 'map');
    if (map) { const pos = all[map.getAttributeNS(NS.style, 'apply-style-name')]; const pc = pos ? codeFromDataStyle(pos, all) : null; const red = kids.some((k) => k.localName === 'text-properties' && /#ff0000/i.test(k.getAttributeNS(NS.fo, 'color') || '')); if (pc) code = pc + ';' + (red ? '[Red]' : '') + code.replace(/^\s*"?-"?/, '-'); }
    return code || null;
  }

  /* =====================================================================
     Écriture
     ===================================================================== */
  const BW = { hair: '0.26pt', thin: '0.74pt', medium: '1.76pt', thick: '2.49pt', double: '2.01pt', dashed: '0.74pt', dotted: '0.74pt', mediumDashed: '1.76pt', dashDot: '0.74pt', mediumDashDot: '1.76pt', dashDotDot: '0.74pt', mediumDashDotDot: '1.76pt', slantDashDot: '1.76pt' };
  const BS = (s) => s === 'double' ? 'double' : /dash/i.test(s) ? 'dashed' : s === 'dotted' ? 'dotted' : 'solid';
  const border = (b) => b ? (BW[b.s] || '0.74pt') + ' ' + BS(b.s) + ' ' + (b.c || '#000000') : null;
  function cellStyleXml(name, st, dsName) {
    const cp = [], pp = [], tp = [];
    if (st.bg) cp.push('fo:background-color="' + st.bg + '"');
    const bt = border(st.bt), bb = border(st.bb), bl = border(st.bl), br = border(st.br);
    if (bt) cp.push('fo:border-top="' + bt + '"'); if (bb) cp.push('fo:border-bottom="' + bb + '"'); if (bl) cp.push('fo:border-left="' + bl + '"'); if (br) cp.push('fo:border-right="' + br + '"');
    if (st.bu) cp.push('style:diagonal-tl-br="' + border(st.bu) + '"'); if (st.bd) cp.push('style:diagonal-bl-tr="' + border(st.bd) + '"');
    if (st.wr) cp.push('fo:wrap-option="wrap"'); if (st.shr) cp.push('style:shrink-to-fit="true"');
    if (st.va) cp.push('style:vertical-align="' + (st.va === 'center' ? 'middle' : st.va === 'top' ? 'top' : st.va === 'justify' ? 'middle' : 'bottom') + '"');
    if (st.rot && st.rot !== 255) { cp.push('style:rotation-angle="' + ((st.rot + 360) % 360) + '"'); }
    if (st.rot === 255) cp.push('style:direction="ttb"');
    if (st.lk === false || st.hd) cp.push('style:cell-protect="' + (st.lk === false ? (st.hd ? 'formula-hidden' : 'none') : 'protected formula-hidden') + '"');
    if (st.ha) { cp.push('style:text-align-source="fix"'); pp.push('fo:text-align="' + ({ left: 'start', center: 'center', right: 'end', justify: 'justify', fill: 'start', centerContinuous: 'center', distributed: 'justify' })[st.ha] + '"'); }
    if (st.ind) pp.push('fo:margin-left="' + (st.ind * 0.353).toFixed(3) + 'cm"');
    if (st.fn) tp.push('style:font-name="' + esc(st.fn) + '" fo:font-family="' + esc(st.fn) + '"');
    if (st.fs) tp.push('fo:font-size="' + st.fs + 'pt"');
    if (st.b) tp.push('fo:font-weight="bold"'); if (st.i) tp.push('fo:font-style="italic"');
    if (st.u) tp.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' + (st.u === 'double' ? ' style:text-underline-type="double"' : ''));
    if (st.st) tp.push('style:text-line-through-style="solid"');
    if (st.fc) tp.push('fo:color="' + st.fc + '"');
    if (st.sup) tp.push('style:text-position="super 58%"'); if (st.sub) tp.push('style:text-position="sub 58%"');
    return '<style:style style:name="' + name + '" style:family="table-cell" style:parent-style-name="Default"' + (dsName ? ' style:data-style-name="' + dsName + '"' : '') + '>' + (cp.length ? '<style:table-cell-properties ' + cp.join(' ') + '/>' : '') + (pp.length ? '<style:paragraph-properties ' + pp.join(' ') + '/>' : '') + (tp.length ? '<style:text-properties ' + tp.join(' ') + '/>' : '') + '</style:style>';
  }
  const isoDate = (v) => { const d = TB.ymd(Math.floor(v)); const t = TB.hms(v); const p = (n, k) => String(n).padStart(k || 2, '0'); const frac = v - Math.floor(v); return p(d.y, 4) + '-' + p(d.m) + '-' + p(d.d) + (frac > 1e-9 ? 'T' + p(t.h) + ':' + p(t.mi) + ':' + p(Math.floor(t.s)) : ''); };
  const isoDur = (v) => { const tot = Math.round(v * 86400); const h = Math.floor(tot / 3600), m = Math.floor(tot % 3600 / 60), s = tot % 60; return 'PT' + h + 'H' + m + 'M' + s + 'S'; };
  const textP = (s) => String(s).split('\n').map((l) => '<text:p>' + esc(l).replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>') + '</text:p>').join('');
  ODS.write = async function (wb) {
    const warn = [];
    const z = new JSZip();
    z.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' });
    // styles de cellule (automatiques) et formats de nombre
    const ds = new Map(); const dsXml = []; let dsN = 0;
    const dsOf = (code) => { if (!code || code === 'General') return null; if (ds.has(code)) return ds.get(code); let r = null; try { r = dataStyleXml('N' + (++dsN), code); } catch (e) { r = null; } const v = r ? { name: 'N' + dsN, tag: r.tag } : null; if (r) dsXml.push(r.xml); ds.set(code, v); return v; };
    const cs = new Map(); const csXml = []; const commonXml = [];
    const csOf = (id) => { if (!id) return null; if (cs.has(id)) return cs.get(id); const st = wb.styles.get(id); if (!Object.keys(st).length) { cs.set(id, null); return null; } const d = dsOf(st.nf); const name = 'ce' + (cs.size + 1); csXml.push(cellStyleXml(name, st, d && d.name)); const v = { name, ds: d, nf: st.nf }; cs.set(id, v); return v; };
    const colStyles = new Map(), rowStyles = new Map(); const auxXml = [];
    const coOf = (px) => { const k = Math.round(px); if (!colStyles.has(k)) { const n = 'co' + (colStyles.size + 1); colStyles.set(k, n); auxXml.push('<style:style style:name="' + n + '" style:family="table-column"><style:table-column-properties fo:break-before="auto" style:column-width="' + cm(k) + '"/></style:style>'); } return colStyles.get(k); };
    const roOf = (px, custom) => { const k = Math.round(px) + (custom ? 'c' : ''); if (!rowStyles.has(k)) { const n = 'ro' + (rowStyles.size + 1); rowStyles.set(k, n); auxXml.push('<style:style style:name="' + n + '" style:family="table-row"><style:table-row-properties style:row-height="' + cm(Math.round(px)) + '" fo:break-before="auto" style:use-optimal-row-height="' + (custom ? 'false' : 'true') + '"/></style:style>'); } return rowStyles.get(k); };
    const taOf = (sh, i) => { const n = 'ta' + (i + 1); auxXml.push('<style:style style:name="' + n + '" style:family="table" style:master-page-name="Default"><style:table-properties table:display="' + (sh.hidden ? 'false' : 'true') + '" style:writing-mode="lr-tb"' + (sh.tab ? ' tableooo:tab-color="' + sh.tab + '"' : '') + '/></style:style>'); return n; };
    // validations
    const valXml = []; const valOf = new Map(); // sheet → [[g, name]]
    const tables = [];
    for (let si = 0; si < wb.sheets.length; si++) {
      const sh = wb.sheets[si]; const e = sh.extent(); const out = [];
      const nR = Math.max(e.r, sh.rowH.length - 1, ...Array.from(sh.hidR), ...sh.merges.map((m) => m.r2), 0) + 1;
      const nC = Math.max(e.c, sh.colW.length - 1, ...Array.from(sh.hidC), ...sh.merges.map((m) => m.c2), 0) + 1;
      // validations de cette feuille
      const vlist = [];
      sh.dv.forEach((d) => {
        const name = 'val' + (valXml.length + 1);
        let cond = null;
        const fo = (f) => { const x = ODS.toOds(String(f).replace(/^=/, ''), wb, sh, d.ranges[0].r1, d.ranges[0].c1); return x ? x.replace(/^of:=/, '') : '0'; };
        const opMap = { between: 'cell-content-is-between(A;B)', notBetween: 'cell-content-is-not-between(A;B)', eq: 'cell-content()=A', ne: 'cell-content()!=A', gt: 'cell-content()>A', lt: 'cell-content()<A', ge: 'cell-content()>=A', le: 'cell-content()<=A' };
        const opx = (opMap[d.op || 'between'] || opMap.between).replace('A', () => fo(d.f1)).replace('B', () => fo(d.f2 == null ? d.f1 : d.f2));
        if (d.type === 'list') { const src = String(d.f1 || ''); cond = /^=/.test(src) ? 'of:cell-content-is-in-list(' + fo(src.slice(1)) + ')' : 'of:cell-content-is-in-list(' + src.split(/[;,]/).map((x) => '&quot;' + esc(x.trim()).replace(/"/g, '') + '&quot;').join(';') + ')'; }
        else if (d.type === 'whole') cond = 'of:cell-content-is-whole-number() and ' + opx;
        else if (d.type === 'decimal') cond = 'of:cell-content-is-decimal-number() and ' + opx;
        else if (d.type === 'date') cond = 'of:cell-content-is-date() and ' + opx;
        else if (d.type === 'time') cond = 'of:cell-content-is-time() and ' + opx;
        else if (d.type === 'textLength') cond = 'of:' + opx.replace(/cell-content\(\)/g, 'cell-content-text-length()').replace('cell-content-is-between', 'cell-content-text-length-is-between').replace('cell-content-is-not-between', 'cell-content-text-length-is-not-between');
        else if (d.type === 'custom') cond = 'of:is-true-formula(' + fo(d.f1) + ')';
        if (!cond) return;
        cond = cond.replace(/"/g, '&quot;');
        valXml.push('<table:content-validation table:name="' + name + '" table:condition="' + cond.replace(/&(?!quot;|amp;|lt;|gt;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '" table:allow-empty-cell="' + (d.blank !== false) + '" table:base-cell-address="' + esc(quoteOds(sh.name)) + '.' + TB.addr(d.ranges[0].r1, d.ranges[0].c1) + '"' + (d.type === 'list' ? ' table:display-list="' + (d.noArrow ? 'none' : 'unsorted') + '"' : '') + '>' + (d.msg || d.msgTitle ? '<table:help-message table:title="' + esc(d.msgTitle || '') + '" table:display="true">' + textP(d.msg || '') + '</table:help-message>' : '') + (d.errStyle !== 'none' ? '<table:error-message table:title="' + esc(d.errTitle || '') + '" table:display="true" table:message-type="' + ({ warning: 'warning', information: 'information' })[d.errStyle] + '">'.replace('table:message-type="undefined"', 'table:message-type="stop"') + textP(d.errMsg || '') + '</table:error-message>' : '') + '</table:content-validation>');
        d.ranges.forEach((g) => vlist.push([g, name]));
      });
      valOf.set(sh, vlist);
      const valAt = (r, c) => { for (const [g, n] of vlist) if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return n; return null; };
      out.push('<table:table table:name="' + esc(sh.name) + '" table:style-name="' + taOf(sh, si) + '"' + (sh.protect ? ' table:protected="true"' : '') + '>');
      // colonnes
      let c = 0;
      while (c < nC) { const w = sh.colW[c] != null ? sh.colW[c] : sh.defW, hid = sh.hidC.has(c), cst = sh.colSt[c] || 0; let n = 1; while (c + n < nC && (sh.colW[c + n] != null ? sh.colW[c + n] : sh.defW) === w && sh.hidC.has(c + n) === hid && (sh.colSt[c + n] || 0) === cst) n++; const ds2 = csOf(cst); out.push('<table:table-column table:style-name="' + coOf(w) + '"' + (n > 1 ? ' table:number-columns-repeated="' + n + '"' : '') + (hid ? ' table:visibility="collapse"' : '') + ' table:default-cell-style-name="' + (ds2 ? ds2.name : 'Default') + '"/>'); c += n; }
      // lignes
      const mergeStart = new Map(), covered = new Set();
      sh.merges.forEach((m) => { mergeStart.set(TB.key(m.r1, m.c1), m); for (let r = m.r1; r <= m.r2; r++) for (let cc = m.c1; cc <= m.c2; cc++) if (r !== m.r1 || cc !== m.c1) covered.add(TB.key(r, cc)); });
      let emptyRun = 0; const flushEmpty = () => { if (emptyRun) { out.push('<table:table-row table:style-name="' + roOf(sh.defH * 0.75 * 96 / 72) + '"' + (emptyRun > 1 ? ' table:number-rows-repeated="' + emptyRun + '"' : '') + '><table:table-cell' + (nC > 1 ? ' table:number-columns-repeated="' + nC + '"' : '') + '/></table:table-row>'); emptyRun = 0; } };
      for (let r = 0; r < nR; r++) {
        const cells = []; let any = false;
        for (let cc = 0; cc < nC; cc++) {
          const k = TB.key(r, cc);
          const f = sh.formula(r, cc); let v = sh.get(r, cc); const sid = sh.ownStyle(r, cc); const note = sh.notes.get(k) || (sh.threads.get(k) && { text: sh.threads.get(k).items.map((m) => (m.author ? m.author + ' : ' : '') + m.text).join('\n') });
          const lk = sh.links.get(k); const vn = valAt(r, cc);
          if (covered.has(k)) { cells.push('<table:covered-table-cell' + (sid ? ' table:style-name="' + ((csOf(sid) || {}).name || 'Default') + '"' : '') + '/>'); if (sid) any = true; continue; }
          if (f && f.arrChild) f === null;
          const st = sid !== undefined ? csOf(sid) : null;
          const effSt = wb.styles.get(sh.styleAt(r, cc));
          if (v === null && !f && !st && !note && !vn) { cells.push(null); continue; }
          any = true;
          let a = '';
          if (st) a += ' table:style-name="' + st.name + '"';
          if (vn) a += ' table:content-validation-name="' + vn + '"';
          const m = mergeStart.get(k); if (m) a += ' table:number-columns-spanned="' + (m.c2 - m.c1 + 1) + '" table:number-rows-spanned="' + (m.r2 - m.r1 + 1) + '"';
          if (f && !f.arrChild) { const fx = ODS.toOds(f.src, wb, sh, r, cc); if (fx) a += ' table:formula="' + esc(fx) + '"'; else warn.push('Formule non convertie en ' + sh.name + '!' + TB.addr(r, cc)); if (f.arr) a += ' table:number-matrix-columns-spanned="' + (f.arr.c2 - f.arr.c1 + 1) + '" table:number-matrix-rows-spanned="' + (f.arr.r2 - f.arr.r1 + 1) + '"'; }
          if (v && typeof v === 'object' && !(v instanceof TB.Err)) v = null;
          let inner = '';
          const nf = effSt.nf; const kind = nf ? TB.Fmt.kindOf(nf) : 'general';
          if (typeof v === 'number') {
            if (kind === 'date' && v >= 1) a += ' office:value-type="date" office:date-value="' + isoDate(v) + '"';
            else if (kind === 'time' || (kind === 'date' && v < 1)) a += ' office:value-type="time" office:time-value="' + isoDur(v) + '"';
            else if (kind === 'percent') a += ' office:value-type="percentage" office:value="' + v + '"';
            else if (kind === 'currency' || kind === 'accounting') a += ' office:value-type="currency" office:currency="' + (/\$/.test(nf) ? 'USD' : /£/.test(nf) ? 'GBP' : /CHF/.test(nf) ? 'CHF' : 'EUR') + '" office:value="' + v + '"';
            else a += ' office:value-type="float" office:value="' + v + '"';
            inner = textP(TB.Fmt.format(v, nf).s);
          } else if (typeof v === 'boolean') { a += ' office:value-type="boolean" office:boolean-value="' + v + '"'; inner = textP(v ? 'VRAI' : 'FAUX'); }
          else if (v instanceof TB.Err) { a += ' office:value-type="string" office:string-value=""'; inner = textP(TB.errText(v)); }
          else if (v !== null && v !== '') { a += ' office:value-type="string"'; inner = lk && lk.url ? '<text:p><text:a xlink:href="' + esc(lk.url) + '" xlink:type="simple">' + esc(v) + '</text:a></text:p>' : textP(v); }
          const ann = note ? '<office:annotation' + (note.author ? '><dc:creator>' + esc(note.author) + '</dc:creator' : '') + '>' + textP(note.text || '') + '</office:annotation>' : '';
          if (note && !note.author) inner = ann + inner; else if (note) inner = ann.replace('<office:annotation><dc:creator>', '<office:annotation><dc:creator>') + inner;
          cells.push('<table:table-cell' + a + (inner ? '>' + inner + '</table:table-cell>' : '/>'));
        }
        const hid = sh.hidR.has(r); const h = sh.rowH[r] != null ? sh.rowH[r] : sh.defH;
        if (!any && !hid && sh.rowH[r] == null && !sh.rowSt[r] && !sh.outR[r]) { emptyRun++; continue; }
        flushEmpty();
        // cellules vides consécutives regroupées
        const cx = []; let run = 0; cells.forEach((x) => { if (x === null) { run++; return; } if (run) { cx.push('<table:table-cell' + (run > 1 ? ' table:number-columns-repeated="' + run + '"' : '') + '/>'); run = 0; } cx.push(x); }); if (run) cx.push('<table:table-cell' + (run > 1 ? ' table:number-columns-repeated="' + run + '"' : '') + '/>');
        out.push('<table:table-row table:style-name="' + roOf(h, sh.rowH[r] != null) + '"' + (hid ? ' table:visibility="collapse"' : '') + (sh.rowSt[r] ? ' table:default-cell-style-name="' + ((csOf(sh.rowSt[r]) || {}).name || 'Default') + '"' : '') + '>' + cx.join('') + '</table:table-row>');
      }
      flushEmpty();
      // mises en forme conditionnelles (LibreOffice : calcext)
      const cfx = cfXml(wb, sh, commonXml, dsOf); if (cfx) out.push(cfx);
      out.push('</table:table>');
      tables.push(out.join(''));
      if (sh.objs.length) warn.push('Graphiques, images et formes non enregistrés en .ods (conservés dans le .magcalc)');
      if (sh.tables.length) warn.push('Tableaux enregistrés comme plages (références structurées converties en adresses)');
    }
    // noms
    const names = wb.names.map((n) => {
      const fx = ODS.toOds(n.f, wb, wb.sheets[0], 0, 0); if (!fx) return '';
      const body = fx.replace(/^of:=/, '');
      const m = /^\[(\$?(?:'(?:[^']|'')+'|[^.]+)?\.[^\]]+)\]$/.exec(body);
      return m ? '<table:named-range table:name="' + esc(n.n) + '" table:base-cell-address="' + esc(quoteOds(wb.sheets[0].name)) + '.$A$1" table:cell-range-address="' + esc(m[1]) + '"/>' : '<table:named-expression table:name="' + esc(n.n) + '" table:base-cell-address="' + esc(quoteOds(wb.sheets[0].name)) + '.$A$1" table:expression="' + esc(fx) + '"/>';
    }).join('');
    const content = XMLH + '<office:document-content ' + NSDECL + ' office:version="1.3"><office:font-face-decls/><office:automatic-styles>' + dsXml.join('') + auxXml.join('') + csXml.join('') + '</office:automatic-styles><office:body><office:spreadsheet>' + (valXml.length ? '<table:content-validations>' + valXml.join('') + '</table:content-validations>' : '') + tables.join('') + (names ? '<table:named-expressions>' + names + '</table:named-expressions>' : '') + '</office:spreadsheet></office:body></office:document-content>';
    const styles = XMLH + '<office:document-styles ' + NSDECL + ' office:version="1.3"><office:styles><style:default-style style:family="table-cell"><style:paragraph-properties style:tab-stop-distance="1.25cm"/><style:text-properties style:font-name="Calibri" fo:font-family="Calibri" fo:font-size="11pt" fo:language="fr" fo:country="FR"/></style:default-style><style:style style:name="Default" style:family="table-cell"/>' + commonXml.join('') + '</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties style:writing-mode="lr-tb"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>';
    const meta = XMLH + '<office:document-meta ' + NSDECL + ' office:version="1.3"><office:meta><meta:generator>Tableur (Suite MAG)</meta:generator>' + (wb.props.title ? '<dc:title>' + esc(wb.props.title) + '</dc:title>' : '') + (wb.props.author ? '<meta:initial-creator>' + esc(wb.props.author) + '</meta:initial-creator>' : '') + '<meta:creation-date>' + new Date(wb.props.created || Date.now()).toISOString().slice(0, 19) + '</meta:creation-date></office:meta></office:document-meta>';
    // volets figés, feuille active
    const sv = wb.sheets.map((sh) => { const f = sh.freeze || {}; const it = (n, t, v) => '<config:config-item config:name="' + n + '" config:type="' + t + '">' + v + '</config:config-item>'; return '<config:config-item-map-entry config:name="' + esc(sh.name) + '">' + (f.c ? it('HorizontalSplitMode', 'short', 2) + it('HorizontalSplitPosition', 'int', f.c) + it('PositionRight', 'int', f.c) : '') + (f.r ? it('VerticalSplitMode', 'short', 2) + it('VerticalSplitPosition', 'int', f.r) + it('PositionBottom', 'int', f.r) : '') + it('ActiveSplitRange', 'short', f.r && f.c ? 3 : f.r ? 2 : f.c ? 3 : 2) + it('ShowGrid', 'boolean', sh.grid !== false) + (sh.zoom && sh.zoom !== 1 ? it('ZoomValue', 'int', Math.round(sh.zoom * 100)) : '') + '</config:config-item-map-entry>'; }).join('');
    const settings = XMLH + '<office:document-settings ' + NSDECL + ' office:version="1.3"><office:settings><config:config-item-set config:name="ooo:view-settings"><config:config-item-map-indexed config:name="Views"><config:config-item-map-entry><config:config-item config:name="ViewId" config:type="string">view1</config:config-item><config:config-item-map-named config:name="Tables">' + sv + '</config:config-item-map-named><config:config-item config:name="ActiveTable" config:type="string">' + esc((wb.cur || wb.sheets[0]).name) + '</config:config-item></config:config-item-map-entry></config:config-item-map-indexed></config:config-item-set></office:settings></office:document-settings>';
    z.file('content.xml', content); z.file('styles.xml', styles); z.file('meta.xml', meta); z.file('settings.xml', settings);
    z.file('META-INF/manifest.xml', XMLH + '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>' + ['content.xml', 'styles.xml', 'meta.xml', 'settings.xml'].map((f) => '<manifest:file-entry manifest:full-path="' + f + '" manifest:media-type="text/xml"/>').join('') + '</manifest:manifest>');
    const blob = await z.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { blob, warn: Array.from(new Set(warn)) };
  };
  function cfXml(wb, sh, commonXml, ctxDs) {
    if (!sh.cf.length) return '';
    const parts = [];
    sh.cf.forEach((rule, i) => {
      const ref = rule.ranges.map((g) => quoteOds(sh.name) + '.' + TB.addr(g.r1, g.c1) + (g.r1 !== g.r2 || g.c1 !== g.c2 ? ':' + quoteOds(sh.name) + '.' + TB.addr(g.r2, g.c2) : '')).join(' ');
      const g = rule.ranges[0]; const base = quoteOds(sh.name) + '.' + TB.addr(g.r1, g.c1);
      const fo = (f) => { const x = ODS.toOds(String(f), wb, sh, g.r1, g.c1); return x ? x.replace(/^of:=/, '') : '0'; };
      let inner = '';
      const styleName = 'cf' + (sh.id || '') + '_' + i;
      const dxf = () => { const f = rule.fmt || {}; void ctxDs; commonXml.push(cellStyleXml(styleName, f, null).replace('style:parent-style-name="Default"', 'style:parent-style-name="Default" style:display-name="' + styleName + '"')); return styleName; };
      const ops = { gt: '>', lt: '<', ge: '>=', le: '<=', eq: '=', ne: '!=' };
      if (rule.type === 'cellIs') { const v = rule.op === 'between' ? 'between(' + fo(rule.f1) + ',' + fo(rule.f2) + ')' : rule.op === 'notBetween' ? 'not-between(' + fo(rule.f1) + ',' + fo(rule.f2) + ')' : ops[rule.op] + fo(rule.f1); inner = '<calcext:condition calcext:apply-style-name="' + dxf() + '" calcext:value="' + esc(v) + '" calcext:base-cell-address="' + esc(base) + '"/>'; }
      else if (rule.type === 'colorScale') inner = '<calcext:color-scale>' + rule.pts.map((p) => '<calcext:color-scale-entry calcext:value="' + (p.v != null ? esc(String(p.v)) : '0') + '" calcext:type="' + ({ min: 'minimum', max: 'maximum', num: 'number', percent: 'percent', percentile: 'percentile', formula: 'formula' })[p.t] + '" calcext:color="' + p.c + '"/>').join('') + '</calcext:color-scale>';
      else if (rule.type === 'dataBar') inner = '<calcext:data-bar calcext:max-length="100" calcext:negative-color="#ff0000" calcext:positive-color="' + (rule.color || '#638EC6') + '" calcext:axis-color="#000000" calcext:gradient="' + (rule.grad !== false) + '"' + (rule.showValue === false ? ' calcext:show-value="false"' : '') + '><calcext:formatting-entry calcext:value="0" calcext:type="auto-minimum"/><calcext:formatting-entry calcext:value="0" calcext:type="auto-maximum"/></calcext:data-bar>';
      else if (rule.type === 'iconSet') { const n = (TB.CF.ICONS[rule.set] || [0, 0, 0]).length; inner = '<calcext:icon-set calcext:icon-set-type="' + esc(rule.set) + '"' + (rule.showValue === false ? ' calcext:show-value="false"' : '') + '>' + Array.from({ length: n }, (_, k) => '<calcext:formatting-entry calcext:value="' + Math.round(100 * k / n) + '" calcext:type="percent"/>').join('') + '</calcext:icon-set>'; }
      else {
        // autres règles : formule équivalente
        const x = TB.Xlsx && TB.Xlsx._cfOut ? TB.Xlsx._cfOut(rule, rule.ranges.map((r) => TB.rangeStr(r)).join(' '), 1) : null;
        let f = rule.type === 'expr' ? rule.f : x && x.type === 'expression' ? P.write(P.parse(x.formulae[0], P.CANON), P.CANON) : null;
        if (rule.type === 'top' || rule.type === 'avg' || rule.type === 'date') { const tl = TB.addr(g.r1, g.c1), rg = rule.ranges.map((r) => TB.rangeStr(r, true)).join(','); f = rule.type === 'top' ? (rule.bottom ? tl + '<=SMALL(' + rg + ',' + (rule.pct ? 'MAX(1,INT(COUNT(' + rg + ')*' + (rule.rank || 10) / 100 + '))' : rule.rank || 10) + ')' : tl + '>=LARGE(' + rg + ',' + (rule.pct ? 'MAX(1,INT(COUNT(' + rg + ')*' + (rule.rank || 10) / 100 + '))' : rule.rank || 10) + ')') : rule.type === 'avg' ? tl + (rule.above === false ? '<' : '>') + (rule.equal ? '=' : '') + 'AVERAGE(' + rg + ')' : null; }
        if (!f) return;
        inner = '<calcext:condition calcext:apply-style-name="' + dxf() + '" calcext:value="formula-is(' + esc(fo(f)) + ')" calcext:base-cell-address="' + esc(base) + '"/>';
      }
      parts.push('<calcext:conditional-format calcext:target-range-address="' + esc(ref) + '">' + inner + '</calcext:conditional-format>');
    });
    return parts.length ? '<calcext:conditional-formats>' + parts.join('') + '</calcext:conditional-formats>' : '';
  }

  /* =====================================================================
     Lecture
     ===================================================================== */
  const A_ = (el, ns, n) => el.getAttributeNS(NS[ns], n);
  ODS.read = async function (z) {
    const warnings = [];
    const parse = async (name) => { const f = z.file(name); if (!f) return null; return new DOMParser().parseFromString(await f.async('string'), 'application/xml'); };
    const doc = await parse('content.xml'); if (!doc) throw new Error('content.xml absent');
    const sdoc = await parse('styles.xml'); const setd = await parse('settings.xml');
    // styles
    const dataStyles = {}, cellStyles = {}, colStyles = {}, rowStyles = {}, tblStyles = {};
    const collect = (root) => { if (!root) return; Array.from(root.getElementsByTagNameNS(NS.number, '*')).forEach((el) => { if (/-style$/.test(el.localName) && A_(el, 'style', 'name')) dataStyles[A_(el, 'style', 'name')] = el; }); Array.from(root.getElementsByTagNameNS(NS.style, 'style')).forEach((el) => { const fam = A_(el, 'style', 'family'), n = A_(el, 'style', 'name'); if (fam === 'table-cell') cellStyles[n] = el; else if (fam === 'table-column') colStyles[n] = el; else if (fam === 'table-row') rowStyles[n] = el; else if (fam === 'table') tblStyles[n] = el; }); };
    collect(sdoc); collect(doc);
    const wb = new TB.Workbook();
    const sCache = {};
    const bIn = (s) => { if (!s || s === 'none') return null; const m = /([\d.]+)(pt|cm|mm|in|px)?\s+(solid|double|dashed|dotted|[a-z-]+)\s+(#[0-9a-fA-F]{6})/.exec(s); if (!m) return null; const w = toPx(m[1] + (m[2] || 'pt')) || 1; return { s: m[3] === 'double' ? 'double' : m[3] === 'dashed' ? 'dashed' : m[3] === 'dotted' ? 'dotted' : w > 2.6 ? 'thick' : w > 1.5 ? 'medium' : 'thin', c: m[4].toUpperCase() }; };
    const styleIn = (name) => {
      if (!name) return undefined; if (sCache[name] !== undefined) return sCache[name];
      const chain = []; let el = cellStyles[name]; let guard = 0; while (el && guard++ < 10) { chain.unshift(el); const p = A_(el, 'style', 'parent-style-name'); el = p ? cellStyles[p] : null; }
      const o = {};
      chain.forEach((s) => {
        Array.from(s.children).forEach((k) => {
          const g = (ns, n) => k.getAttributeNS(NS[ns], n);
          if (k.localName === 'table-cell-properties') {
            const bg = g('fo', 'background-color'); if (bg && bg !== 'transparent') o.bg = bg.toUpperCase();
            const all = g('fo', 'border'); ['top', 'bottom', 'left', 'right'].forEach((sd, i) => { const b = bIn(g('fo', 'border-' + sd) || all); if (b) o[['bt', 'bb', 'bl', 'br'][i]] = b; });
            const dd = bIn(g('style', 'diagonal-tl-br')); if (dd) o.bu = dd; const du = bIn(g('style', 'diagonal-bl-tr')); if (du) o.bd = du;
            if (g('fo', 'wrap-option') === 'wrap') o.wr = true; if (g('style', 'shrink-to-fit') === 'true') o.shr = true;
            const va = g('style', 'vertical-align'); if (va && va !== 'automatic') o.va = va === 'middle' ? 'center' : va;
            const ra = +(g('style', 'rotation-angle') || 0); if (ra) o.rot = ra > 180 ? ra - 360 : ra > 90 ? 90 : ra; if (g('style', 'direction') === 'ttb') o.rot = 255;
            const cp = g('style', 'cell-protect'); if (cp) { if (/none|formula-hidden/.test(cp) && !/protected/.test(cp)) o.lk = false; if (/hidden/.test(cp)) o.hd = true; }
          } else if (k.localName === 'paragraph-properties') {
            const ta = g('fo', 'text-align'); if (ta) o.ha = ({ start: 'left', left: 'left', center: 'center', end: 'right', right: 'right', justify: 'justify' })[ta];
            const ml = toPx(g('fo', 'margin-left')); if (ml) o.ind = Math.max(1, Math.round(ml / 13));
          } else if (k.localName === 'text-properties') {
            const fn = g('style', 'font-name') || g('fo', 'font-family'); if (fn) o.fn = fn.replace(/^'|'$/g, '');
            const fs = g('fo', 'font-size'); if (fs && /pt$/.test(fs)) o.fs = parseFloat(fs);
            if (g('fo', 'font-weight') === 'bold' || +g('fo', 'font-weight') >= 600) o.b = true;
            if (g('fo', 'font-style') === 'italic') o.i = true;
            const u = g('style', 'text-underline-style'); if (u && u !== 'none') o.u = g('style', 'text-underline-type') === 'double' ? 'double' : 'single';
            const lt = g('style', 'text-line-through-style'); if (lt && lt !== 'none') o.st = true;
            const fc = g('fo', 'color'); if (fc && !/^#000000$/i.test(fc)) o.fc = fc.toUpperCase();
          }
        });
        const dsn = A_(s, 'style', 'data-style-name'); if (dsn && dataStyles[dsn]) { const code = codeFromDataStyle(dataStyles[dsn], dataStyles); if (code) o.nf = code; }
      });
      if (o.fn === 'Liberation Sans' || o.fn === 'Calibri') delete o.fn;
      return (sCache[name] = Object.keys(o).length ? wb.styles.add(o) : 0);
    };
    const tableEls = Array.from(doc.getElementsByTagNameNS(NS.table, 'table')).filter((t) => t.parentNode && t.parentNode.localName === 'spreadsheet');
    // validations
    const vals = {}; Array.from(doc.getElementsByTagNameNS(NS.table, 'content-validation')).forEach((v) => { vals[A_(v, 'table', 'name')] = v; });
    const valCells = {};
    for (const T of tableEls) {
      const sh = wb.addSheetRaw(String(A_(T, 'table', 'name') || 'Feuil' + (wb.sheets.length + 1)).slice(0, 31));
      const ts = tblStyles[A_(T, 'table', 'style-name')]; if (ts) { const tp = ts.getElementsByTagNameNS(NS.style, 'table-properties')[0]; if (tp) { if (A_(tp, 'table', 'display') === 'false') sh.hidden = 1; const tc = tp.getAttributeNS(NS.tableooo, 'tab-color'); if (tc) sh.tab = tc.toUpperCase(); } }
      if (A_(T, 'table', 'protected') === 'true') sh.protect = { hash: null, file: true, allow: {} };
      // colonnes
      let c = 0;
      const cols = Array.from(T.getElementsByTagNameNS(NS.table, 'table-column'));
      const colDefault = [];
      for (const col of cols) {
        const n = Math.min(+(A_(col, 'table', 'number-columns-repeated') || 1), 16384 - c);
        const cs0 = colStyles[A_(col, 'table', 'style-name')]; const w = cs0 ? toPx(A_(cs0.getElementsByTagNameNS(NS.style, 'table-column-properties')[0] || cs0, 'style', 'column-width')) : null;
        const hid = A_(col, 'table', 'visibility') === 'collapse'; const dcs = A_(col, 'table', 'default-cell-style-name');
        if (n < 1000) for (let k = 0; k < n; k++) { if (w && Math.abs(w - 64) > 1.5 && Math.abs(w - 85) > 1.5) sh.colW[c + k] = Math.round(w); if (hid) sh.hidC.add(c + k); colDefault[c + k] = dcs && dcs !== 'Default' ? dcs : null; }
        c += n; if (c >= 16384) break;
      }
      // LibreOffice : largeur par défaut 2,26 cm (85 px) → largeur standard
      // lignes
      let r = 0; const rowsEls = [];
      const walk = (el) => { for (const k of Array.from(el.children)) { if (k.localName === 'table-row') rowsEls.push(k); else if (/^table-(row-group|header-rows|rows)$/.test(k.localName)) walk(k); } };
      walk(T);
      for (const row of rowsEls) {
        let nr = +(A_(row, 'table', 'number-rows-repeated') || 1);
        const cellsEls = Array.from(row.children).filter((x) => x.localName === 'table-cell' || x.localName === 'covered-table-cell');
        const hasContent = cellsEls.some((x) => x.firstElementChild || A_(x, 'office', 'value-type') || A_(x, 'table', 'formula'));
        if (nr > 1000 && !hasContent) { r += nr; if (r > 1048576) break; continue; }
        nr = Math.min(nr, 1048576 - r);
        const rs = rowStyles[A_(row, 'table', 'style-name')]; const rp = rs && rs.getElementsByTagNameNS(NS.style, 'table-row-properties')[0];
        const h = rp ? toPx(A_(rp, 'style', 'row-height')) : null; const custom = rp && A_(rp, 'style', 'use-optimal-row-height') === 'false';
        const hid = A_(row, 'table', 'visibility') === 'collapse';
        for (let k = 0; k < nr; k++) {
          const rr = r + k;
          if (h && (custom || Math.abs(h - 20) > 3) && Math.abs(h - sh.defH) > 1) sh.rowH[rr] = Math.round(h);
          if (hid) sh.hidR.add(rr);
          let cc = 0;
          for (const cel of cellsEls) {
            let nc = +(A_(cel, 'table', 'number-columns-repeated') || 1);
            const empty = !cel.firstElementChild && !A_(cel, 'office', 'value-type') && !A_(cel, 'table', 'formula');
            const sname = A_(cel, 'table', 'style-name') || colDefault[cc];
            if (empty && nc > 200) { cc += nc; continue; }
            nc = Math.min(nc, 16384 - cc);
            for (let j = 0; j < nc; j++) {
              const col = cc + j;
              const sid = sname ? styleIn(sname) : undefined;
              if (cel.localName === 'covered-table-cell') { if (sid) wb.load(sh, rr, col, null, sid); continue; }
              const spanC = +(A_(cel, 'table', 'number-columns-spanned') || 1), spanR = +(A_(cel, 'table', 'number-rows-spanned') || 1);
              if (spanC > 1 || spanR > 1) sh.merges.push({ r1: rr, c1: col, r2: rr + spanR - 1, c2: col + spanC - 1 });
              const vt = A_(cel, 'office', 'value-type');
              let v = null;
              const texts = Array.from(cel.children).filter((x) => x.localName === 'p').map((p) => textOf(p)).join('\n');
              if (vt === 'float' || vt === 'percentage' || vt === 'currency') v = parseFloat(A_(cel, 'office', 'value'));
              else if (vt === 'date') { const m = /^(-?\d+)-(\d+)-(\d+)(?:T(\d+):(\d+):(\d+(?:\.\d+)?))?/.exec(A_(cel, 'office', 'date-value') || ''); if (m) v = TB.serial(+m[1], +m[2], +m[3]) + (m[4] ? (+m[4] * 3600 + +m[5] * 60 + +m[6]) / 86400 : 0); }
              else if (vt === 'time') { const m = /^-?PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(A_(cel, 'office', 'time-value') || ''); if (m) v = ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) / 86400; }
              else if (vt === 'boolean') v = A_(cel, 'office', 'boolean-value') === 'true';
              else if (vt === 'string') { const sv = A_(cel, 'office', 'string-value'); v = sv != null && sv !== '' ? sv : texts; }
              else if (texts) v = texts;
              const fx = A_(cel, 'table', 'formula');
              let sidEff = sid;
              // type sans style de données : date / pourcentage par défaut
              if (sid === undefined || sid === 0) { if (vt === 'date') sidEff = wb.styles.add({ nf: 'dd/mm/yyyy' }); else if (vt === 'percentage') sidEff = wb.styles.add({ nf: '0%' }); else if (vt === 'time') sidEff = wb.styles.add({ nf: 'hh:mm:ss' }); }
              if (fx) {
                const f = ODS.fromOds(fx);
                const mc = +(A_(cel, 'table', 'number-matrix-columns-spanned') || 0), mr = +(A_(cel, 'table', 'number-matrix-rows-spanned') || 0);
                if (f != null) { wb.loadFormula(sh, rr, col, f, sidEff, mc > 1 || mr > 1 ? { r1: rr, c1: col, r2: rr + Math.max(1, mr) - 1, c2: col + Math.max(1, mc) - 1 } : undefined); if (v !== null && typeof v !== 'string' || (typeof v === 'string' && v)) TB._setVal(sh, rr, col, typeof v === 'string' && /^(#[A-Z/0!?]+|Err:\d+)/.test(v) ? TB.E.VALUE : v); }
                else { warnings.push('Formule non reprise en ' + sh.name + '!' + TB.addr(rr, col)); wb.load(sh, rr, col, v, sidEff); }
              } else if (v !== null && v !== '' || sidEff) wb.load(sh, rr, col, v === '' ? null : v, sidEff);
              // note
              const ann = Array.from(cel.children).find((x) => x.localName === 'annotation'); if (ann) { const au = ann.getElementsByTagNameNS(NS.dc, 'creator')[0]; sh.notes.set(TB.key(rr, col), { text: Array.from(ann.children).filter((x) => x.localName === 'p').map(textOf).join('\n'), author: au ? au.textContent : '' }); }
              // lien
              const a = cel.getElementsByTagNameNS(NS.text, 'a')[0]; if (a) { const href = a.getAttributeNS(NS.xlink, 'href'); if (href) sh.links.set(TB.key(rr, col), /^#/.test(href) ? { ref: href.slice(1).replace(/^([^.]+)\./, '$1!') } : { url: href }); }
              // validation
              const vn = A_(cel, 'table', 'content-validation-name'); if (vn) (valCells[vn] = valCells[vn] || []).push([sh, rr, col]);
            }
            cc += nc; if (cc >= 16384) break;
          }
        }
        r += nr; if (r >= 1048576) break;
      }
      // mises en forme conditionnelles
      try { readCf(T, sh, styleIn, warnings); } catch (e) { warnings.push('Mises en forme conditionnelles : ' + e.message); }
    }
    // validations → plages
    Object.keys(valCells).forEach((vn) => {
      const v = vals[vn]; if (!v) return; const L = valCells[vn]; const sh = L[0][0];
      const cond = String(A_(v, 'table', 'condition') || '').replace(/^(?:of|oooc):/, '');
      const d = { ranges: [] };
      const fo = (t) => ODS.fromOds('of:=' + t);
      let m;
      if ((m = /^cell-content-is-in-list\((.*)\)$/.exec(cond))) { const inner = m[1]; if (/^"/.test(inner)) { d.type = 'list'; d.f1 = inner.split(';').map((x) => x.trim().replace(/^"|"$/g, '')).join(';'); } else { d.type = 'list'; const f = fo(inner); d.f1 = f ? '=' + f : ''; } }
      else {
        const ty = /is-whole-number/.test(cond) ? 'whole' : /is-decimal-number/.test(cond) ? 'decimal' : /is-date/.test(cond) ? 'date' : /is-time/.test(cond) ? 'time' : /text-length/.test(cond) ? 'textLength' : /is-true-formula/.test(cond) ? 'custom' : null;
        if (!ty) return; d.type = ty;
        if (ty === 'custom') { m = /is-true-formula\((.*)\)$/.exec(cond); d.f1 = m ? fo(m[1]) : 'TRUE'; }
        else if ((m = /(?:is|length-is)-(not-)?between\(([^;,]*)[;,]([^)]*)\)/.exec(cond))) { d.op = m[1] ? 'notBetween' : 'between'; d.f1 = fo(m[2]); d.f2 = fo(m[3]); }
        else if ((m = /(?:cell-content|cell-content-text-length)\(\)\s*(>=|<=|!=|=|>|<)\s*(.+)$/.exec(cond))) { d.op = ({ '>=': 'ge', '<=': 'le', '!=': 'ne', '=': 'eq', '>': 'gt', '<': 'lt' })[m[1]]; d.f1 = fo(m[2]); }
        else return;
      }
      if (A_(v, 'table', 'allow-empty-cell') === 'false') d.blank = false;
      if (A_(v, 'table', 'display-list') === 'none') d.noArrow = true;
      const hm = v.getElementsByTagNameNS(NS.table, 'help-message')[0]; if (hm && A_(hm, 'table', 'display') !== 'false') { d.msgTitle = A_(hm, 'table', 'title') || ''; d.msg = Array.from(hm.children).filter((x) => x.localName === 'p').map(textOf).join('\n'); }
      const em = v.getElementsByTagNameNS(NS.table, 'error-message')[0]; if (em && A_(em, 'table', 'display') !== 'false') { d.errTitle = A_(em, 'table', 'title') || ''; d.errMsg = Array.from(em.children).filter((x) => x.localName === 'p').map(textOf).join('\n'); d.errStyle = A_(em, 'table', 'message-type') === 'warning' ? 'warning' : A_(em, 'table', 'message-type') === 'information' ? 'information' : 'stop'; } else d.errStyle = 'none';
      // regrouper les cellules par feuille en rectangles
      const bySheet = new Map(); L.forEach(([s, r0, c0]) => { if (!bySheet.has(s)) bySheet.set(s, []); bySheet.get(s).push([r0, c0]); });
      bySheet.forEach((cells, s) => { const o = Object.assign({}, d, { ranges: rects(cells) }); s.dv.push(o); });
      void sh;
    });
    // noms
    Array.from(doc.getElementsByTagNameNS(NS.table, 'named-range')).forEach((n) => { const f = ODS.fromOds('of:=[' + A_(n, 'table', 'cell-range-address').replace(/:([^.]*\.)?/, (m0, s) => ':' + (s || '.')) + ']'); if (f) wb.names.push({ n: A_(n, 'table', 'name'), f, sh: null, cm: '' }); });
    Array.from(doc.getElementsByTagNameNS(NS.table, 'named-expression')).forEach((n) => { const f = ODS.fromOds(A_(n, 'table', 'expression')); if (f) wb.names.push({ n: A_(n, 'table', 'name'), f, sh: null, cm: '' }); });
    // réglages : volets figés, feuille active, quadrillage
    if (setd) {
      const views = Array.from(setd.getElementsByTagNameNS(NS.config, 'config-item-map-named')).find((x) => A_(x, 'config', 'name') === 'Tables');
      if (views) Array.from(views.children).forEach((ent) => { const sh = wb.sheet(A_(ent, 'config', 'name')); if (!sh) return; const it = {}; Array.from(ent.children).forEach((x) => { it[A_(x, 'config', 'name')] = x.textContent; }); if (it.HorizontalSplitMode === '2' || it.VerticalSplitMode === '2') sh.freeze = { r: it.VerticalSplitMode === '2' ? +it.VerticalSplitPosition || 0 : 0, c: it.HorizontalSplitMode === '2' ? +it.HorizontalSplitPosition || 0 : 0 }; if (it.ShowGrid === 'false') sh.grid = false; if (it.ZoomValue && it.ZoomValue !== '100') sh.zoom = +it.ZoomValue / 100; });
      const act = Array.from(setd.getElementsByTagNameNS(NS.config, 'config-item')).find((x) => A_(x, 'config', 'name') === 'ActiveTable'); if (act) { const i = wb.sheets.findIndex((s) => s.name === act.textContent); if (i >= 0) wb.active = i; }
    }
    if (!wb.sheets.length) wb.addSheetRaw('Feuil1');
    if (z.file('Object 1/content.xml') || Object.keys(z.files).some((n) => /^Object \d+\//.test(n))) warnings.push('Les graphiques du fichier ne sont pas repris : recréez-les avec Insertion › Graphique.');
    wb.finishLoad();
    return { wb, warnings: Array.from(new Set(warnings)) };
  };
  function textOf(p) { let s = ''; p.childNodes.forEach((n) => { if (n.nodeType === 3) s += n.nodeValue; else if (n.localName === 's') s += ' '.repeat(+(n.getAttributeNS(NS.text, 'c') || 1)); else if (n.localName === 'tab') s += '\t'; else if (n.localName === 'line-break') s += '\n'; else if (n.localName !== 'annotation') s += textOf(n); }); return s; }
  function rects(cells) { const byC = new Map(); cells.forEach(([r, c]) => { if (!byC.has(c)) byC.set(c, []); byC.get(c).push(r); }); const runs = []; [...byC.keys()].sort((a, b) => a - b).forEach((c) => { const rs = byC.get(c).sort((a, b) => a - b); let s = rs[0], p = rs[0]; for (let i = 1; i <= rs.length; i++) { if (i < rs.length && rs[i] === p + 1) { p = rs[i]; continue; } runs.push({ r1: s, r2: p, c1: c, c2: c }); if (i < rs.length) s = p = rs[i]; } }); const out = []; runs.forEach((g) => { const l = out.find((x) => x.r1 === g.r1 && x.r2 === g.r2 && x.c2 === g.c1 - 1); if (l) l.c2 = g.c2; else out.push(Object.assign({}, g)); }); return out; }
  function readCf(T, sh, styleIn, warnings) {
    const L = Array.from(T.getElementsByTagNameNS(NS.calcext, 'conditional-format')); if (!L.length) return;
    const ops = { '>': 'gt', '<': 'lt', '>=': 'ge', '<=': 'le', '=': 'eq', '!=': 'ne' };
    L.forEach((cf) => {
      const ranges = String(A_(cf, 'calcext', 'target-range-address') || '').split(/\s+/).map((x) => { const p = x.split(':').map((y) => y.replace(/^.*\./, '').replace(/\$/g, '')); return TB.parseRange(p.join(':')); }).filter(Boolean);
      if (!ranges.length) return;
      Array.from(cf.children).forEach((k) => {
        const g = (n) => k.getAttributeNS(NS.calcext, n);
        let rule = null;
        if (k.localName === 'condition') {
          const v = g('value') || ''; const sid = styleIn(g('apply-style-name')); const fmt = Object.assign({}, sh.wb.styles.get(sid)); let m;
          const fo = (t) => ODS.fromOds('of:=' + t);
          if ((m = /^formula-is\((.*)\)$/.exec(v))) rule = { type: 'expr', f: fo(m[1]) };
          else if ((m = /^(not-)?between\((.*),(.*)\)$/.exec(v))) rule = { type: 'cellIs', op: m[1] ? 'notBetween' : 'between', f1: fo(m[2]), f2: fo(m[3]) };
          else if ((m = /^(>=|<=|!=|=|>|<)(.*)$/.exec(v))) rule = { type: 'cellIs', op: ops[m[1]], f1: fo(m[2]) };
          else if (/^duplicate$/.test(v)) rule = { type: 'dup' }; else if (/^unique$/.test(v)) rule = { type: 'dup', unique: true };
          else if ((m = /^(top|bottom)-elements\((\d+)\)$/.exec(v))) rule = { type: 'top', bottom: m[1] === 'bottom', rank: +m[2] };
          else if ((m = /^(top|bottom)-percent\((\d+)\)$/.exec(v))) rule = { type: 'top', bottom: m[1] === 'bottom', rank: +m[2], pct: true };
          else if (/^(above|below)-(equal-)?average$/.test(v)) rule = { type: 'avg', above: /^above/.test(v), equal: /equal/.test(v) };
          else if ((m = /^contains-text\("(.*)"\)$/.exec(v))) rule = { type: 'text', op: 'contains', text: m[1] };
          else if ((m = /^begins-with\("(.*)"\)$/.exec(v))) rule = { type: 'text', op: 'begins', text: m[1] };
          else if ((m = /^ends-with\("(.*)"\)$/.exec(v))) rule = { type: 'text', op: 'ends', text: m[1] };
          else if (/^is-error$/.test(v)) rule = { type: 'err' }; else if (/^is-no-error$/.test(v)) rule = { type: 'noErr' };
          if (rule && (rule.f === null || rule.f1 === null)) rule = null;
          if (rule) { delete fmt.nf; rule.fmt = fmt; }
        } else if (k.localName === 'color-scale') {
          rule = { type: 'colorScale', pts: Array.from(k.children).map((e) => { const t = e.getAttributeNS(NS.calcext, 'type'); return { t: ({ minimum: 'min', maximum: 'max', number: 'num', percent: 'percent', percentile: 'percentile', formula: 'formula' })[t] || 'min', v: e.getAttributeNS(NS.calcext, 'value') != null && !/imum$/.test(t) ? +e.getAttributeNS(NS.calcext, 'value') : undefined, c: (e.getAttributeNS(NS.calcext, 'color') || '#FFFFFF').toUpperCase() }; }) };
        } else if (k.localName === 'data-bar') rule = { type: 'dataBar', color: (g('positive-color') || '#638EC6').toUpperCase(), grad: g('gradient') !== 'false' };
        else if (k.localName === 'icon-set') rule = { type: 'iconSet', set: g('icon-set-type') || '3TrafficLights1' };
        if (rule) { rule.ranges = ranges; rule.id = TB.uid('cf'); sh.cf.push(rule); } else warnings.push('Mise en forme conditionnelle non reprise');
      });
    });
  }
})();
