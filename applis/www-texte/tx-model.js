/* Texte — modèle : styles par défaut (Normal, Titre 1 à 6, Titre, Sous-titre, Citation, Code…), jeux de styles,
   listes (puces, numéros, plusieurs niveaux), réglages, mise en page des sections (formats, marges),
   feuilles de style CSS générées, petit constructeur de documents (modèles, imports). */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, T = O.Themes;
  const cm = TX.cm2pt;
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ---------------- pages ---------------- */
  TX.PAGE_SIZES = [
    { id: 'A4', name: 'A4', w: 595.3, h: 841.9, desc: '21 × 29,7 cm' },
    { id: 'A5', name: 'A5', w: 419.5, h: 595.3, desc: '14,8 × 21 cm' },
    { id: 'A3', name: 'A3', w: 841.9, h: 1190.6, desc: '29,7 × 42 cm' },
    { id: 'Letter', name: 'Lettre US', w: 612, h: 792, desc: '21,59 × 27,94 cm' },
    { id: 'Legal', name: 'Légal US', w: 612, h: 1008, desc: '21,59 × 35,56 cm' },
    { id: 'B5', name: 'B5', w: 498.9, h: 708.7, desc: '17,6 × 25 cm' }
  ];
  TX.MARGINS = [
    { id: 'normal', name: 'Normales', t: cm(2.5), b: cm(2.5), l: cm(2.5), r: cm(2.5) },
    { id: 'etroites', name: 'Étroites', t: cm(1.27), b: cm(1.27), l: cm(1.27), r: cm(1.27) },
    { id: 'moyennes', name: 'Moyennes', t: cm(2.54), b: cm(2.54), l: cm(1.91), r: cm(1.91) },
    { id: 'larges', name: 'Larges', t: cm(2.54), b: cm(2.54), l: cm(5.08), r: cm(5.08) },
    { id: 'reliure', name: 'Reliure (2 cm de plus à gauche)', t: cm(2.5), b: cm(2.5), l: cm(4.5), r: cm(2.5) }
  ];
  TX.defaultPage = () => ({ size: 'A4', w: 595.3, h: 841.9, orient: 'portrait', mt: cm(2.5), mb: cm(2.5), ml: cm(2.5), mr: cm(2.5), mh: cm(1.25), mf: cm(1.25), gut: 0, cols: { n: 1, gap: cm(1.25), sep: false }, type: 'page', titlePg: false, hdr: { def: null, first: null, even: null }, ftr: { def: null, first: null, even: null }, numFmt: 'decimal', numStart: null, va: 'top', bd: null, lnum: null });
  TX.pg = (sec) => Object.assign(TX.defaultPage(), (sec && sec.attrs ? sec.attrs.pg : sec) || {});

  /* ---------------- styles ---------------- */
  // {n nom, t 'p'|'c', b style de base, nx style suivant, lvl niveau hiérarchique, q galerie rapide, p para, r caractère}
  TX.defaultStyles = function () {
    const H = (n, sz, c, extra) => Object.assign({ n: 'Titre ' + n, t: 'p', b: 'Normal', nx: 'Normal', lvl: n, q: n <= 4 ? 1 : 0, p: { sb: n === 1 ? 12 : 2, sa: 0, kn: 1, kl: 1 }, r: { f: '+major', sz, c } }, extra || {});
    return {
      Normal: { n: 'Normal', t: 'p', q: 1, p: { sa: 8, ln: 1.08, lr: 'auto' }, r: { f: '+minor', sz: 11 } },
      SansInterligne: { n: 'Sans interligne', t: 'p', b: 'Normal', q: 1, p: { sa: 0, ln: 1 } },
      Titre1: H(1, 16, 't:accent1/-25'),
      Titre2: H(2, 13, 't:accent1/-25'),
      Titre3: H(3, 12, 't:accent1/-50'),
      Titre4: H(4, 11, 't:accent1/-25', { r: { f: '+major', sz: 11, i: 1, c: 't:accent1/-25' } }),
      Titre5: H(5, 11, 't:accent1/-25'),
      Titre6: H(6, 11, 't:accent1/-50'),
      Titre: { n: 'Titre', t: 'p', b: 'Normal', nx: 'Normal', q: 1, p: { sa: 0, ln: 1 }, r: { f: '+major', sz: 28, sp: -0.5 } },
      SousTitre: { n: 'Sous-titre', t: 'p', b: 'Normal', nx: 'Normal', q: 1, p: {}, r: { c: 't:tx1/+35', sp: 0.75 } },
      Citation: { n: 'Citation', t: 'p', b: 'Normal', nx: 'Normal', q: 1, p: { sb: 10, sa: 8, il: 43.2, ir: 43.2, al: 'center' }, r: { i: 1, c: 't:tx1/+25' } },
      CitationIntense: { n: 'Citation intense', t: 'p', b: 'Normal', nx: 'Normal', q: 1, p: { sb: 18, sa: 18, il: 57.6, ir: 57.6, al: 'center', bd: { t: { s: 'single', w: 0.5, c: 't:accent1', sp: 10 }, b: { s: 'single', w: 0.5, c: 't:accent1', sp: 10 } } }, r: { i: 1, c: 't:accent1' } },
      Code: { n: 'Code', t: 'p', b: 'Normal', q: 1, p: { sa: 0, ln: 1, sh: '#F2F2F2' }, r: { f: 'Consolas', sz: 10 } },
      Legende: { n: 'Légende', t: 'p', b: 'Normal', nx: 'Normal', p: { sa: 10, ln: 1 }, r: { i: 1, sz: 9, c: 't:tx2' } },
      ParagrapheListe: { n: 'Paragraphe de liste', t: 'p', b: 'Normal', q: 0, p: { il: 36, ctx: 1 } },
      NoteBas: { n: 'Note de bas de page', t: 'p', b: 'Normal', p: { sa: 0, ln: 1 }, r: { sz: 10 } },
      NoteFin: { n: 'Note de fin', t: 'p', b: 'Normal', p: { sa: 0, ln: 1 }, r: { sz: 10 } },
      EnTete: { n: 'En-tête', t: 'p', b: 'Normal', p: { sa: 0, ln: 1, tabs: [{ pos: 226.8, t: 'center' }, { pos: 453.6, t: 'right' }] } },
      PiedPage: { n: 'Pied de page', t: 'p', b: 'Normal', p: { sa: 0, ln: 1, tabs: [{ pos: 226.8, t: 'center' }, { pos: 453.6, t: 'right' }] } },
      TitreTM: { n: 'En-tête de table des matières', t: 'p', b: 'Titre1', nx: 'Normal', lvl: 0, p: { sb: 12, sa: 6 } },
      TM1: { n: 'TM 1', t: 'p', b: 'Normal', nx: 'Normal', p: { sa: 5 } },
      TM2: { n: 'TM 2', t: 'p', b: 'Normal', nx: 'Normal', p: { sa: 5, il: 11 } },
      TM3: { n: 'TM 3', t: 'p', b: 'Normal', nx: 'Normal', p: { sa: 5, il: 22 } },
      TM4: { n: 'TM 4', t: 'p', b: 'Normal', nx: 'Normal', p: { sa: 5, il: 33 } },
      TM5: { n: 'TM 5', t: 'p', b: 'Normal', nx: 'Normal', p: { sa: 5, il: 44 } },
      TM6: { n: 'TM 6', t: 'p', b: 'Normal', nx: 'Normal', p: { sa: 5, il: 55 } },
      TableIllustrations: { n: 'Table des illustrations', t: 'p', b: 'Normal', nx: 'Normal', p: { sa: 0 } },
      Forte: { n: 'Élevé', t: 'c', q: 1, r: { b: 1 } },
      Accentuation: { n: 'Accentuation', t: 'c', q: 1, r: { i: 1 } },
      AccentuationIntense: { n: 'Accentuation intense', t: 'c', q: 1, r: { i: 1, c: 't:accent1' } },
      LienHypertexte: { n: 'Lien hypertexte', t: 'c', r: { c: 't:hlink', u: 'single' } },
      AppelNote: { n: 'Appel de note de bas de p.', t: 'c', r: { va: 'sup' } },
      CodeCar: { n: 'Code (caractères)', t: 'c', r: { f: 'Consolas', sz: 10, sh: '#F2F2F2' } }
    };
  };
  TX.HEADING_IDS = ['Titre1', 'Titre2', 'Titre3', 'Titre4', 'Titre5', 'Titre6'];
  /** Jeux de styles (onglet Création) : modifications appliquées aux styles par défaut */
  TX.STYLE_SETS = [
    { id: 'defaut', name: 'Par défaut', mod: {} },
    { id: 'classique', name: 'Classique', mod: { Normal: { p: { sa: 6, ln: 1.15, al: 'justify' } }, Titre1: { p: { sb: 18, sa: 6 }, r: { sz: 16, b: 1, c: 't:tx1', caps: 1 } }, Titre2: { p: { sb: 12, sa: 4 }, r: { sz: 13, b: 1, c: 't:tx1' } }, Titre3: { r: { sz: 12, b: 1, i: 1, c: 't:tx1' } }, Titre: { p: { al: 'center', sa: 12 }, r: { sz: 26, b: 1, c: 't:tx1' } } } },
    { id: 'moderne', name: 'Moderne', mod: { Normal: { p: { sa: 10, ln: 1.2 } }, Titre1: { p: { sb: 24, sa: 8, bd: { b: { s: 'single', w: 1.5, c: 't:accent1', sp: 4 } } }, r: { sz: 18, b: 1, c: 't:accent1' } }, Titre2: { p: { sb: 16, sa: 4 }, r: { sz: 14, b: 1, c: 't:accent1/-25' } }, Titre: { r: { sz: 32, b: 1, c: 't:accent1' } } } },
    { id: 'encadre', name: 'Encadré', mod: { Titre1: { p: { sb: 18, sa: 8, sh: 't:accent1', bd: { l: { s: 'single', w: 0.5, c: 't:accent1', sp: 6 }, r: { s: 'single', w: 0.5, c: 't:accent1', sp: 6 }, t: { s: 'single', w: 0.5, c: 't:accent1', sp: 3 }, b: { s: 'single', w: 0.5, c: 't:accent1', sp: 3 } } }, r: { sz: 14, b: 1, c: 't:bg1', caps: 1 } }, Titre2: { p: { sb: 12, sa: 4, bd: { b: { s: 'single', w: 1, c: 't:accent1', sp: 2 } } }, r: { sz: 13, b: 1, c: 't:accent1/-25' } } } },
    { id: 'elegant', name: 'Élégant', mod: { Normal: { p: { sa: 8, ln: 1.25 }, r: { f: 'Georgia' } }, Titre1: { p: { sb: 20, sa: 10, al: 'center' }, r: { f: 'Georgia', sz: 18, c: 't:tx1', sp: 1.5, smcaps: 1 } }, Titre2: { r: { f: 'Georgia', sz: 14, i: 1, c: 't:accent1/-25' } }, Titre: { p: { al: 'center' }, r: { f: 'Georgia', sz: 30, sp: 2, smcaps: 1 } } } },
    { id: 'compact', name: 'Compact', mod: { Normal: { p: { sa: 3, ln: 1 }, r: { sz: 10 } }, Titre1: { p: { sb: 8, sa: 2 }, r: { sz: 13, b: 1 } }, Titre2: { p: { sb: 6, sa: 2 }, r: { sz: 11.5, b: 1 } }, Titre3: { r: { sz: 10.5, b: 1 } } } },
    { id: 'mag', name: 'MAG Formation 13', mod: { Normal: { p: { sa: 6, ln: 1.15 }, r: { f: 'Exo', sz: 10.5, c: '#16212B' } }, Titre1: { p: { sb: 18, sa: 6, bd: { b: { s: 'single', w: 2.25, c: '#EC7913', sp: 3 } } }, r: { f: 'Exo', sz: 16, b: 1, c: '#000000' } }, Titre2: { p: { sb: 12, sa: 4 }, r: { f: 'Exo', sz: 13, b: 1, c: '#B65A05' } }, Titre3: { r: { f: 'Exo', sz: 11.5, b: 1, c: '#2C97D3' } }, Titre: { p: { sa: 6 }, r: { f: 'Exo', sz: 26, b: 1, c: '#000000' } }, SousTitre: { r: { f: 'Exo', c: '#B65A05', sp: 0.5 } }, Citation: { p: { sh: '#FDEBD9', bd: { l: { s: 'single', w: 3, c: '#EC7913', sp: 8 } }, al: 'left' }, r: { i: 0, c: '#16212B' } } } }
  ];
  TX.applyStyleSet = function (styles, setId) {
    const base = TX.defaultStyles(), set = TX.STYLE_SETS.find((s) => s.id === setId) || TX.STYLE_SETS[0];
    const out = Object.assign({}, styles);
    Object.keys(base).forEach((k) => { out[k] = O.clone(base[k]); const m = set.mod[k]; if (m) { out[k].p = Object.assign({}, out[k].p, m.p || {}); out[k].r = Object.assign({}, out[k].r, m.r || {}); } });
    return out;
  };
  /** Propriétés effectives d'un style (chaîne « basé sur ») → {p, r, lvl} */
  TX.resolveStyle = function (styles, id, seen) {
    const st = styles[id] || (id !== 'Normal' && styles.Normal) || { p: {}, r: {} };
    seen = seen || {}; if (seen[id]) return { p: {}, r: {} }; seen[id] = 1;
    const base = st.b && styles[st.b] ? TX.resolveStyle(styles, st.b, seen) : { p: {}, r: {} };
    return { p: Object.assign({}, base.p, st.p || {}), r: Object.assign({}, base.r, st.r || {}), lvl: st.lvl != null ? st.lvl : (st.b ? base.lvl : null), t: st.t || 'p' };
  };
  /** Niveau hiérarchique d'un paragraphe (1 à 9) ou 0 */
  TX.outlineLevel = function (styles, node) {
    if (node.attrs.ol != null) return node.attrs.ol;
    const st = styles[node.attrs.s]; if (!st) return 0;
    return TX.resolveStyle(styles, node.attrs.s).lvl || 0;
  };
  TX.runCss = function (r, theme) {
    let s = '';
    if (r.f) { s += 'font-family:' + TX.fontCss(r.f) + ';'; const real = r.f === '+major' ? theme && theme.fonts.major : r.f === '+minor' ? theme && theme.fonts.minor : r.f; if (real) s += '--lf:' + TX.fontLf(real) + ';'; }
    if (r.sz) s += 'font-size:' + r.sz + 'pt;';
    if (r.b != null) s += 'font-weight:' + (r.b ? 700 : 400) + ';';
    if (r.i != null) s += 'font-style:' + (r.i ? 'italic' : 'normal') + ';';
    if (r.c) s += 'color:' + TX.color(r.c) + ';';
    const deco = []; if (r.u) deco.push('underline'); if (r.s) deco.push('line-through');
    if (deco.length) s += 'text-decoration-line:' + deco.join(' ') + ';';
    if (r.caps) s += 'text-transform:uppercase;'; if (r.smcaps) s += 'font-variant:small-caps;';
    if (r.sp) s += 'letter-spacing:' + r.sp + 'pt;';
    if (r.sh) s += 'background-color:' + TX.color(r.sh) + ';';
    if (r.va === 'sup') s += 'vertical-align:super;font-size:smaller;';
    if (r.va === 'sub') s += 'vertical-align:sub;font-size:smaller;';
    return s;
  };
  /** Feuille de style du document : styles de paragraphe et de caractère, tableaux */
  TX.styleSheet = function (attrs, scope) {
    scope = scope || '.tx-doc';
    const styles = attrs.styles || TX.defaultStyles(), theme = TX.themeOf(attrs.settings);
    let css = '';
    Object.keys(styles).forEach((id) => {
      const st = styles[id], R = TX.resolveStyle(styles, id);
      const sel = st.t === 'c' ? scope + ' [data-cs="' + id + '"]' : scope + ' p[data-s="' + id + '"]';
      let s = TX.runCss(R.r, theme);
      if (st.t !== 'c') { s += TX.paraCss(R.p); }
      if (id === 'Normal') css += scope + ' p{' + s + '}';
      css += sel + '{' + s + '}';
      if (st.t !== 'c' && R.p.pb) css += sel + '{break-before:page}';
    });
    // paragraphe sans style connu : Normal
    return css;
  };

  /* ---------------- styles de tableau ---------------- */
  TX.TABLE_STYLES = (function () {
    const l = [{ id: 'Grille', name: 'Grille du tableau' }, { id: 'Aucun', name: 'Tableau normal (sans bordure)' }, { id: 'GrilleClaire', name: 'Grille claire' }, { id: 'Simple', name: 'Tableau simple (lignes)' }];
    ['clair', 'moyen', 'grille', 'fonce'].forEach((k) => { for (let a = 1; a <= 6; a++) l.push({ id: k + a, kind: k, accent: a, name: { clair: 'Liste claire', moyen: 'Tableau moyen', grille: 'Tableau grille', fonce: 'Tableau foncé' }[k] + ' – accent ' + a }); });
    return l;
  })();
  /** CSS d'un style de tableau (avec les options : ligne d'en-tête, lignes à bandes, première colonne, ligne de total) */
  TX.tableStyleCss = function (id, scope) {
    const S = scope + ' table[data-ts="' + id + '"]';
    const B = (c, w) => (w || 0.5) + 'pt solid ' + c;
    let h = '';
    const st = TX.TABLE_STYLES.find((x) => x.id === id) || { id };
    if (id === 'Grille' || !st.kind && !/^(Aucun|GrilleClaire|Simple)$/.test(id)) h += S + '>tbody>tr>*{border:' + B('#000') + '}';
    else if (id === 'Aucun') h += S + '>tbody>tr>*{border:0}';
    else if (id === 'GrilleClaire') h += S + '>tbody>tr>*{border:' + B('#BFBFBF') + '}';
    else if (id === 'Simple') h += S + '>tbody>tr>*{border:0;border-bottom:' + B('#7F7F7F') + '}' + S + '>tbody>tr:first-child>*{border-top:' + B('#7F7F7F', 1) + ';font-weight:700}';
    else {
      const a = 'var(--t-accent' + st.accent + ')', light = 'var(--tc-accent' + st.accent + '-p80)', mid = 'var(--tc-accent' + st.accent + '-p60)', dark = 'var(--tc-accent' + st.accent + '-m25)';
      if (st.kind === 'clair') h += S + '>tbody>tr>*{border:0;border-bottom:' + B(a) + '}' + S + '.hdr>tbody>tr:first-child>*{border-bottom:' + B(a, 1.5) + ';font-weight:700;color:' + dark + '}' + S + '.band>tbody>tr:nth-child(even)>*{background:' + light + '}';
      if (st.kind === 'moyen') h += S + '>tbody>tr>*{border:' + B(mid) + '}' + S + '.hdr>tbody>tr:first-child>*{background:' + a + ';color:var(--t-bg1);font-weight:700;border-color:' + a + '}' + S + '.band>tbody>tr:nth-child(odd)>*{background:' + light + '}' + S + '.band.hdr>tbody>tr:first-child>*{background:' + a + '}';
      if (st.kind === 'grille') h += S + '>tbody>tr>*{border:' + B(a) + '}' + S + '.hdr>tbody>tr:first-child>*{background:' + light + ';font-weight:700}' + S + '.fc>tbody>tr>*:first-child{font-weight:700}';
      if (st.kind === 'fonce') h += S + '>tbody>tr>*{border:' + B('var(--t-bg1)') + ';background:' + a + ';color:var(--t-bg1)}' + S + '.hdr>tbody>tr:first-child>*{background:' + dark + ';font-weight:700}' + S + '.band>tbody>tr:nth-child(even)>*{background:' + mid + ';color:var(--t-tx1)}';
      h += S + '.fc>tbody>tr>*:first-child{font-weight:700}' + S + '.lr>tbody>tr:last-child>*{font-weight:700;border-top:' + B(a, 1.5) + '}';
    }
    return h;
  };

  /* ---------------- listes ---------------- */
  const BUL = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'];
  const lvl = (i, f, t, extra) => Object.assign({ f, t, st: 1, il: 36 * (i + 1), hg: 18 }, extra || {});
  TX.LIST_KINDS = {
    puces: () => ({ k: 'bullet', lv: BUL.map((b, i) => lvl(i, 'bullet', b)) }),
    tirets: () => ({ k: 'bullet', lv: BUL.map((b, i) => lvl(i, 'bullet', i % 2 ? '◦' : '–')) }),
    fleches: () => ({ k: 'bullet', lv: BUL.map((b, i) => lvl(i, 'bullet', i % 2 ? '–' : '➤')) }),
    coches: () => ({ k: 'bullet', lv: BUL.map((b, i) => lvl(i, 'bullet', i % 2 ? '–' : '✔')) }),
    carres: () => ({ k: 'bullet', lv: BUL.map((b, i) => lvl(i, 'bullet', i % 2 ? '□' : '■')) }),
    losanges: () => ({ k: 'bullet', lv: BUL.map((b, i) => lvl(i, 'bullet', i % 2 ? '◇' : '◆')) }),
    cases: () => ({ k: 'bullet', lv: BUL.map((b, i) => lvl(i, 'bullet', '☐')) }),
    num: () => ({ k: 'number', lv: ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'].map((f, i) => lvl(i, f, '%' + (i + 1) + '.')) }),
    numPar: () => ({ k: 'number', lv: ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'].map((f, i) => lvl(i, f, '%' + (i + 1) + ')')) }),
    alpha: () => ({ k: 'number', lv: ['upperLetter', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter'].map((f, i) => lvl(i, f, '%' + (i + 1) + '.')) }),
    alphaMin: () => ({ k: 'number', lv: ['lowerLetter', 'decimal', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'].map((f, i) => lvl(i, f, '%' + (i + 1) + ')')) }),
    romain: () => ({ k: 'number', lv: ['upperRoman', 'upperLetter', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal'].map((f, i) => lvl(i, f, '%' + (i + 1) + '.')) }),
    multi: () => ({ k: 'multi', lv: Array.from({ length: 9 }, (x, i) => lvl(i, 'decimal', Array.from({ length: i + 1 }, (y, j) => '%' + (j + 1)).join('.') + '.', { il: 18 + i * 25, hg: 18 + i * 7 })) }),
    articles: () => ({ k: 'multi', lv: Array.from({ length: 9 }, (x, i) => lvl(i, i === 0 ? 'decimal' : i === 1 ? 'decimal' : 'lowerLetter', i === 0 ? 'Article %1.' : i === 1 ? '%1.%2.' : '%' + (i + 1) + ')', { il: i === 0 ? 0 : 18 + i * 25, hg: i === 0 ? 0 : 25 })) }),
    titres: () => ({ k: 'multi', head: 1, lv: Array.from({ length: 9 }, (x, i) => lvl(i, 'decimal', Array.from({ length: i + 1 }, (y, j) => '%' + (j + 1)).join('.') + (i === 0 ? '.' : ''), { il: 0, hg: 0, tab: 1 })) })
  };
  TX.LIST_GALLERY = { bullet: ['puces', 'tirets', 'fleches', 'coches', 'carres', 'losanges', 'cases'], number: ['num', 'numPar', 'alpha', 'alphaMin', 'romain'], multi: ['multi', 'articles', 'titres'] };
  /** Formatage d'un compteur */
  TX.fmtNum = function (n, f) {
    switch (f) {
      case 'lowerLetter': return letters(n).toLowerCase();
      case 'upperLetter': return letters(n);
      case 'lowerRoman': return roman(n).toLowerCase();
      case 'upperRoman': return roman(n);
      case 'decimalZero': return (n < 10 ? '0' : '') + n;
      case 'ordinal': return n + (n === 1 ? 'er' : 'e');
      case 'none': return '';
      case 'cardinalText': return String(n);
      default: return String(n);
    }
  };
  function letters(n) { let s = ''; while (n > 0) { n--; s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26); } return s || 'A'; }
  function roman(n) { if (n <= 0) return String(n); const v = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; v.forEach((x) => { while (n >= x[0]) { s += x[1]; n -= x[0]; } }); return s; }
  TX.roman = roman;
  TX.listLabel = function (def, l, counters) {
    const L = def.lv[l] || def.lv[0];
    if (L.f === 'bullet') return L.t;
    return String(L.t || '').replace(/%(\d)/g, (m, d) => { const k = +d - 1; const lv = def.lv[k] || L; return TX.fmtNum(counters[k] || lv.st || 1, k === l ? L.f : (lv.f === 'bullet' ? 'decimal' : lv.f)); });
  };

  /* ---------------- réglages, document neuf ---------------- */
  TX.defaultSettings = () => ({ theme: { id: 'clair', fonts: { major: 'Calibri', minor: 'Calibri' } }, tab: 35.4, evenOdd: false, track: false, pageColor: null, wm: null, fnFmt: 'decimal', enFmt: 'lowerRoman', styleSet: 'defaut', lang: 'fr-FR', hyphen: false });
  TX.defaultProps = () => ({ title: '', author: '', subject: '', keywords: '', created: Date.now(), modified: Date.now() });
  /** Document vide (JSON ProseMirror) */
  TX.emptyDoc = function (opt) {
    opt = opt || {};
    const settings = Object.assign(TX.defaultSettings(), opt.settings || {});
    let styles = opt.styles || TX.defaultStyles();
    if (settings.styleSet && settings.styleSet !== 'defaut' && !opt.styles) styles = TX.applyStyleSet(styles, settings.styleSet);
    return {
      type: 'doc',
      attrs: { styles, lists: opt.lists || {}, settings, parts: opt.parts || {}, notes: opt.notes || {}, comments: opt.comments || {}, props: Object.assign(TX.defaultProps(), opt.props || {}) },
      content: opt.sections || [{ type: 'section', attrs: { pg: Object.assign(TX.defaultPage(), opt.page || {}) }, content: opt.content || [{ type: 'paragraph', attrs: { s: 'Normal' } }] }]
    };
  };
  TX.themeOf = function (settings) {
    const t = (settings && settings.theme) || { id: 'clair' };
    const base = T.get(t.id);
    return Object.assign({}, base, { colors: Object.assign({}, base.colors, t.colors || {}), fonts: Object.assign({}, base.fonts, t.fonts || {}), dark: false });
  };

  /* ---------------- petit constructeur (modèles, imports) ----------------
     B.p('Titre1', 'texte', {al:'center'}) ; B.p('Normal', [B.t('gras', {b:1}), ' suite', B.field('page')]) ;
     B.table([[cellule, …], …], {ts, hdr:true, widths:[pt]}) ; B.section([...], pg) ; B.doc([sections], opt) */
  const B = TX.B = {};
  B.t = function (text, f) {
    f = f || {}; const marks = [];
    if (f.link) marks.push({ type: 'link', attrs: { href: f.link } });
    if (f.cs) marks.push({ type: 'cs', attrs: { id: f.cs } });
    if (f.f) marks.push({ type: 'font', attrs: { f: f.f } });
    if (f.sz) marks.push({ type: 'size', attrs: { pt: f.sz } });
    if (f.c) marks.push({ type: 'color', attrs: { c: f.c } });
    if (f.hl) marks.push({ type: 'hl', attrs: { c: f.hl } });
    if (f.sh) marks.push({ type: 'shd', attrs: { c: f.sh } });
    if (f.b) marks.push({ type: 'b' }); if (f.i) marks.push({ type: 'i' });
    if (f.u) marks.push({ type: 'u', attrs: { s: f.u === true || f.u === 1 ? 'single' : f.u } });
    if (f.s) marks.push({ type: 's' });
    if (f.va) marks.push({ type: 'va', attrs: { v: f.va } });
    if (f.caps) marks.push({ type: 'caps' }); if (f.smcaps) marks.push({ type: 'smcaps' });
    if (f.sp) marks.push({ type: 'sp', attrs: { pt: f.sp } });
    return { type: 'text', text: String(text), marks: marks.length ? marks : undefined };
  };
  B.inl = function (c) {
    if (c == null || c === '') return [];
    if (typeof c === 'string') { const out = []; c.split(/(\t|\n)/).forEach((x) => { if (x === '\t') out.push({ type: 'tab' }); else if (x === '\n') out.push({ type: 'hard_break' }); else if (x) out.push({ type: 'text', text: x }); }); return out; }
    if (Array.isArray(c)) return c.reduce((a, x) => a.concat(B.inl(x)), []);
    if (c.type === 'text' && !c.text) return [];
    if (c.type === 'text' && c.text && /[\t\n]/.test(c.text)) { return c.text.split(/(\t|\n)/).filter(Boolean).map((x) => x === '\t' ? { type: 'tab' } : x === '\n' ? { type: 'hard_break' } : Object.assign({}, c, { text: x })); }
    return [c];
  };
  B.p = function (s, content, attrs) { const c = B.inl(content); return { type: 'paragraph', attrs: Object.assign({ s: s || 'Normal' }, attrs || {}), content: c.length ? c : undefined }; };
  B.tab = () => ({ type: 'tab' });
  B.br = () => ({ type: 'hard_break' });
  B.field = (f, extra) => ({ type: 'field', attrs: Object.assign({ f }, extra || {}) });
  B.merge = (name) => ({ type: 'field', attrs: { f: 'merge', name } });
  B.pageBreak = () => ({ type: 'page_break' });
  B.toc = (attrs) => ({ type: 'toc', attrs: Object.assign({ kind: 'toc', levels: 3 }, attrs || {}) });
  B.cell = function (content, attrs, header) {
    const blocks = (Array.isArray(content) && content.length && content[0] && content[0].type === 'paragraph') ? content : [content && content.type === 'paragraph' ? content : B.p('Normal', content)];
    return { type: header ? 'table_header' : 'table_cell', attrs: Object.assign({ colspan: 1, rowspan: 1, colwidth: null }, attrs || {}), content: blocks };
  };
  B.table = function (rows, opt) {
    opt = opt || {};
    const widths = opt.widths;
    return {
      type: 'table', attrs: { ts: opt.ts || 'Grille', al: opt.al || null, look: Object.assign({ hdr: !!opt.hdr, band: !!opt.band, fc: !!opt.fc }, opt.look || {}), cm: opt.cm || null },
      content: rows.map((r, ri) => ({
        type: 'table_row', attrs: { hdr: !!(opt.hdr && ri === 0 && opt.repeat !== false), h: (opt.heights || [])[ri] || null },
        content: r.filter((c) => c !== null).map((c, ci) => {
          const cc = c && c.type && /^table_(cell|header)$/.test(c.type) ? c : B.cell(c);
          let col = 0; for (let k = 0; k < ci; k++) col += (r[k] && r[k].attrs && r[k].attrs.colspan) || 1;
          if (widths && !cc.attrs.colwidth) { const span = cc.attrs.colspan || 1; cc.attrs.colwidth = widths.slice(col, col + span).map((w) => Math.round(w * TX.PX)); }
          return cc;
        })
      }))
    };
  };
  B.section = (content, pg) => ({ type: 'section', attrs: { pg: Object.assign(TX.defaultPage(), pg || {}) }, content });
  B.image = (m, w, h, extra) => ({ type: 'image', attrs: Object.assign({ m, w, h }, extra || {}) });
  B.list = function (lists, kind, items, s) {
    const id = TX.uid('L'); lists[id] = TX.LIST_KINDS[kind || 'puces']();
    return items.map((it) => { const lv = Array.isArray(it) ? it[1] : 0; const c = Array.isArray(it) ? it[0] : it; return B.p(s || 'ParagrapheListe', c, { li: { id, l: lv } }); });
  };
  B.part = (blocks) => ({ type: 'doc', content: [{ type: 'section', attrs: { pg: null }, content: blocks }] });
})();
