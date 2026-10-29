/* Texte — boîtes de dialogue : Police, Paragraphe (retraits, espacement, enchaînements), Tabulations, Bordure et trame,
   Mise en page (marges, papier, disposition), Colonnes, Filigrane, Bordures de page, Numéros de page, Tableau,
   Propriétés du tableau, Image / objet (taille, habillage, rognage, texte de remplacement), Symboles, Date, Lien,
   Signet, Renvoi, Légende, Tables des matières, Notes, Statistiques, Atteindre, Zoom, Équation, Graphique, SmartArt,
   Icônes, Listes, Styles, Tri, Formule, Comparer. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, PM = window.PM;
  const A = window.TexteApp = window.TexteApp || {};
  const D = window.TexteDialogs = window.TexteDialogs || {};
  const X = TX.C;
  const V = () => A.view();
  const NT = TX.schema.nodes;
  const cm = (pt) => O.round(TX.pt2cm(pt || 0), 2);
  const fromCm = (v) => Math.round(TX.cm2pt(+v || 0) * 100) / 100;
  const sel = (id, opts, val) => '<select class="o-in" id="' + id + '">' + opts.map((o) => '<option value="' + O.esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + O.esc(o[1]) + '</option>').join('') + '</select>';
  const num = (id, val, step, min, max) => '<input class="o-in" type="number" id="' + id + '" value="' + (val == null ? '' : val) + '" step="' + (step || 0.1) + '"' + (min != null ? ' min="' + min + '"' : '') + (max != null ? ' max="' + max + '"' : '') + '>';
  const fld = (label, inner, half) => '<label class="o-field' + (half ? ' half' : '') + '"><span>' + O.esc(label) + '</span>' + inner + '</label>';
  const chk = (id, label, on) => '<label class="o-check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span>' + O.esc(label) + '</span></label>';
  const tabs = (list) => '<div class="dlg-tabs">' + list.map((t, i) => '<button type="button" data-tab="' + t[0] + '"' + (i === 0 ? ' class="on"' : '') + '>' + O.esc(t[1]) + '</button>').join('') + '</div>';
  function wireTabs(el, start) { const go = (k) => { O.$$('[data-tab]', el).forEach((b) => b.classList.toggle('on', b.dataset.tab === k)); O.$$('.dlg-page', el).forEach((p) => { p.hidden = p.dataset.page !== k; }); }; O.$$('[data-tab]', el).forEach((b) => b.onclick = () => go(b.dataset.tab)); go(start || (el.querySelector('[data-tab]') || {}).dataset.tab); }
  const $in = (el, id) => el.querySelector('#' + id);
  const val = (el, id) => { const e = $in(el, id); return e ? (e.type === 'checkbox' ? e.checked : e.value) : null; };
  const nval = (el, id) => { const v = parseFloat(String(val(el, id) || '').replace(',', '.')); return isNaN(v) ? null : v; };
  function dlg(title, body, onOk, opt) {
    opt = opt || {};
    return O.dialog({ title, wide: opt.wide, body, onOpen: (el, close) => { if (opt.tabs) wireTabs(el, opt.start); if (opt.onOpen) opt.onOpen(el, close); }, buttons: (opt.extra || []).concat([{ label: 'Annuler', value: null }, { label: opt.ok || 'OK', primary: true, value: 'ok', onClick: (c, w) => onOk(w.querySelector('.o-dlg') || w, c) }]) });
  }
  const fontsList = () => { const t = A.theme(); return [['+major', t.fonts.major + ' (titres)'], ['+minor', t.fonts.minor + ' (corps)']].concat(O.FONTS.map((f) => [f[0], f[0]])); };

  /* ---------------- Police ---------------- */
  D.font = function () {
    const st = TX.fmtState(V().state, A.attrs());
    const body = tabs([['f', 'Police'], ['a', 'Paramètres avancés']]) +
      '<div class="dlg-page" data-page="f"><div class="three-col">' + fld('Police', sel('fF', fontsList(), st.font)) + fld('Style', sel('fS', [['n', 'Normal'], ['i', 'Italique'], ['b', 'Gras'], ['bi', 'Gras italique']], (st.bold ? 'b' : '') + (st.italic ? 'i' : '') || 'n')) + fld('Taille', num('fZ', st.size, 0.5, 1, 1638)) + '</div><div class="two-col">' + fld('Couleur de police', '<input class="o-in" type="color" id="fC" value="' + (/^#/.test(st.color || '') ? st.color : '#000000') + '">') + fld('Soulignement', sel('fU', [['', '(aucun)']].concat(TX.UL_STYLES), st.underline ? st.ulStyle || 'single' : '')) + '</div><div class="dlg-sec">Attributs</div><div class="two-col">' + chk('fBs', 'Barré', st.strike && !st.dstrike) + chk('fBd', 'Barré double', st.dstrike) + chk('fSup', 'Exposant', st.sup) + chk('fSub', 'Indice', st.sub) + chk('fSc', 'Petites majuscules', st.smcaps) + chk('fCa', 'Majuscules', st.caps) + chk('fH', 'Masqué', st.hidden) + '</div><div class="font-pv" id="fPv">Aperçu du texte</div></div>' +
      '<div class="dlg-page" data-page="a" hidden><div class="two-col">' + fld('Espacement (pt, négatif = serré)', num('fSp', st.spacing || 0, 0.1, -10, 30)) + fld('Position (pt, décalage vertical)', num('fPo', 0, 0.5, -50, 50)) + '</div><p class="o-hint">Les polices Calibri, Arial, Times New Roman, Courier New et Cambria sont remplacées, quand elles manquent, par des polices libres de mêmes dimensions (la mise en page ne bouge pas).</p></div>';
    const pv = (el) => { const p = $in(el, 'fPv'); const f = val(el, 'fF'); const t = A.theme(); p.style.fontFamily = O.fontStack(f === '+major' ? t.fonts.major : f === '+minor' ? t.fonts.minor : f); const s = val(el, 'fS'); p.style.fontWeight = /b/.test(s) ? 700 : 400; p.style.fontStyle = /i/.test(s) ? 'italic' : 'normal'; p.style.fontSize = Math.min(36, nval(el, 'fZ') || 11) * 1.33 + 'px'; p.style.color = val(el, 'fC'); p.style.textDecoration = (val(el, 'fU') ? 'underline ' : '') + (val(el, 'fBs') || val(el, 'fBd') ? 'line-through' : ''); p.style.textTransform = val(el, 'fCa') ? 'uppercase' : ''; p.style.fontVariant = val(el, 'fSc') ? 'small-caps' : ''; p.textContent = st.par ? (V().state.doc.textBetween(V().state.selection.from, V().state.selection.to).slice(0, 40) || 'Aperçu du texte') : 'Aperçu'; };
    return dlg('Police', body, (el) => {
      const v = V(); const s = val(el, 'fS');
      if (val(el, 'fF') !== st.font) X.font(v, val(el, 'fF'));
      if ((/b/.test(s)) !== !!st.bold) X.toggle(v, 'b'); if ((/i/.test(s)) !== !!st.italic) X.toggle(v, 'i');
      if (nval(el, 'fZ') && nval(el, 'fZ') !== st.size) X.size(v, nval(el, 'fZ'));
      const c = val(el, 'fC').toUpperCase(); if (c !== (st.color || '#000000').toUpperCase()) X.color(v, c === '#000000' && !st.color ? null : c);
      const u = val(el, 'fU'); if ((u || null) !== (st.underline ? st.ulStyle || 'single' : null)) X.underline(v, u || null);
      if (val(el, 'fBd')) { if (!st.dstrike) X.toggle(v, 'ss'); } else if (val(el, 'fBs')) { if (!st.strike || st.dstrike) X.mark(v, 's', { dbl: false }); } else if (st.strike) X.mark(v, 's', null);
      if (val(el, 'fSup') !== !!st.sup) X.toggle(v, 'sup'); if (val(el, 'fSub') !== !!st.sub && !val(el, 'fSup')) X.toggle(v, 'sub');
      if (val(el, 'fSc') !== !!st.smcaps) X.toggle(v, 'smcaps'); if (val(el, 'fCa') !== !!st.caps) X.toggle(v, 'caps'); if (val(el, 'fH') !== !!st.hidden) X.toggle(v, 'hidden');
      if ((nval(el, 'fSp') || 0) !== (st.spacing || 0)) X.spacing(v, nval(el, 'fSp')); if (nval(el, 'fPo')) X.raise(v, nval(el, 'fPo'));
    }, { tabs: true, wide: true, onOpen: (el) => { O.$$('input,select', el).forEach((i) => i.addEventListener('input', () => pv(el))); pv(el); } });
  };

  /* ---------------- Paragraphe ---------------- */
  D.paragraph = function (start) {
    const st = TX.fmtState(V().state, A.attrs()), p = st.p;
    const fi = p.fi || 0, spec = fi > 0 ? 'first' : fi < 0 ? 'hang' : 'none';
    const lr = p.lr || 'auto', ln = p.ln == null ? 1 : p.ln;
    const lnKind = lr === 'auto' ? (Math.abs(ln - 1) < 0.01 ? 'single' : Math.abs(ln - 1.5) < 0.01 ? '1.5' : Math.abs(ln - 2) < 0.01 ? 'double' : 'multiple') : lr;
    const body = tabs([['i', 'Retrait et espacement'], ['e', 'Enchaînements']]) +
      '<div class="dlg-page" data-page="i"><div class="dlg-sec">Général</div><div class="two-col">' + fld('Alignement', sel('pA', [['left', 'Gauche'], ['center', 'Centré'], ['right', 'Droite'], ['justify', 'Justifié'], ['distribute', 'Distribué']], p.al || 'left')) + fld('Niveau hiérarchique', sel('pOl', [['', 'Selon le style'], ['0', 'Corps de texte']].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), 'Niveau ' + n])), st.par && st.par.attrs.ol != null ? String(st.par.attrs.ol) : '')) + '</div><div class="dlg-sec">Retrait</div><div class="two-col">' + fld('À gauche (cm)', num('pIl', cm(p.il))) + fld('À droite (cm)', num('pIr', cm(p.ir))) + fld('De 1re ligne', sel('pSp', [['none', '(aucun)'], ['first', 'Positif (1re ligne)'], ['hang', 'Négatif (suspendu)']], spec)) + fld('De (cm)', num('pFi', cm(Math.abs(fi)), 0.1, 0)) + '</div><div class="dlg-sec">Espacement</div><div class="two-col">' + fld('Avant (pt)', num('pSb', p.sb || 0, 1, 0)) + fld('Après (pt)', num('pSa', p.sa || 0, 1, 0)) + fld('Interligne', sel('pLk', [['single', 'Simple'], ['1.5', '1,5 ligne'], ['double', 'Double'], ['atLeast', 'Au moins'], ['exact', 'Exactement'], ['multiple', 'Multiple']], lnKind)) + fld('De', num('pLn', lr === 'auto' ? ln : ln, 0.01, 0)) + '</div></div>' +
      '<div class="dlg-page" data-page="e" hidden><div class="dlg-sec">Pagination</div>' + chk('pWc', 'Éviter veuves et orphelines', st.par ? st.par.attrs.wc !== false : true) + chk('pKn', 'Paragraphes solidaires (avec le suivant)', !!p.kn) + chk('pKl', 'Lignes solidaires', !!p.kl) + chk('pPb', 'Saut de page avant', !!p.pb) + '</div>';
    return dlg('Paragraphe', body, (el) => {
      const sp = val(el, 'pSp'), f = nval(el, 'pFi') || 0, lk = val(el, 'pLk');
      const patch = { al: val(el, 'pA') === 'left' ? null : val(el, 'pA'), il: fromCm(nval(el, 'pIl')), ir: fromCm(nval(el, 'pIr')), fi: sp === 'none' ? 0 : sp === 'first' ? fromCm(f) : -fromCm(f), sb: nval(el, 'pSb'), sa: nval(el, 'pSa'), wc: val(el, 'pWc') ? null : false, kn: val(el, 'pKn') ? true : null, kl: val(el, 'pKl') ? true : null, pb: val(el, 'pPb') ? true : null };
      const n = nval(el, 'pLn');
      if (lk === 'single') { patch.ln = 1; patch.lr = 'auto'; } else if (lk === '1.5') { patch.ln = 1.5; patch.lr = 'auto'; } else if (lk === 'double') { patch.ln = 2; patch.lr = 'auto'; } else if (lk === 'multiple') { patch.ln = n || 1; patch.lr = 'auto'; } else { patch.ln = n || 12; patch.lr = lk; }
      const ol = val(el, 'pOl'); patch.ol = ol === '' ? null : +ol;
      X.setPara(V(), patch, 'Paragraphe');
    }, { tabs: true, start, extra: [{ label: 'Tabulations…', left: true, value: null, onClick: (c) => { c(null); setTimeout(() => D.tabs(), 0); } }], onOpen: (el) => { $in(el, 'pLk').addEventListener('change', () => { const k = val(el, 'pLk'); $in(el, 'pLn').value = k === 'single' ? 1 : k === '1.5' ? 1.5 : k === 'double' ? 2 : k === 'multiple' ? 1.15 : 12; }); } });
  };
  /* ---------------- Tabulations ---------------- */
  D.tabs = function () {
    const st = TX.fmtState(V().state, A.attrs()); let list = (st.p.tabs || []).slice();
    const render = (el) => { $in(el, 'tbList').innerHTML = list.length ? list.map((t, i) => '<div class="rv-it" style="display:flex;gap:8px;align-items:center;cursor:default"><b style="flex:1">' + String(cm(t.pos)).replace('.', ',') + ' cm</b><span>' + { left: 'Gauche', center: 'Centré', right: 'Droite', decimal: 'Décimal', bar: 'Barre' }[t.t || 'left'] + '</span><span>' + { dot: '.......', hyphen: '-------', underscore: '_______' }[t.lead] || '' + '</span><button type="button" class="mini-btn" data-del="' + i + '">' + O.icon('x') + '</button></div>').join('') : '<p class="o-hint">Aucun taquet (tabulations par défaut).</p>'; };
    const body = '<div class="three-col">' + fld('Position (cm)', num('tbP', '', 0.1, 0)) + fld('Alignement', sel('tbA', [['left', 'Gauche'], ['center', 'Centré'], ['right', 'Droite'], ['decimal', 'Décimal'], ['bar', 'Barre']], 'left')) + fld('Points de suite', sel('tbL', [['', 'Aucun'], ['dot', '.......'], ['hyphen', '-------'], ['underscore', '_______']], '')) + '</div><p style="display:flex;gap:6px"><button type="button" class="mini-btn pri" id="tbAdd">' + O.icon('plus') + 'Définir</button><button type="button" class="mini-btn" id="tbClr">' + O.icon('trash-2') + 'Tout effacer</button></p><div id="tbList"></div>' + fld('Tabulations par défaut (cm)', num('tbDef', cm((A.attrs().settings || {}).tab || 35.4), 0.05, 0.2));
    return dlg('Tabulations', body, (el) => {
      X.setPara(V(), { tabs: list.length ? list.sort((a, b) => a.pos - b.pos) : null }, 'Tabulations');
      const d = fromCm(nval(el, 'tbDef')); if (d && Math.abs(d - ((A.attrs().settings || {}).tab || 35.4)) > 0.1) A.cmd.setSetting('tab', d, 'Tabulations par défaut');
    }, { onOpen: (el) => { render(el); $in(el, 'tbAdd').onclick = () => { const p = nval(el, 'tbP'); if (p == null) return; list = list.filter((t) => Math.abs(t.pos - fromCm(p)) > 0.5); list.push({ pos: fromCm(p), t: val(el, 'tbA'), lead: val(el, 'tbL') || undefined }); render(el); }; $in(el, 'tbClr').onclick = () => { list = []; render(el); }; el.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { list.splice(+b.dataset.del, 1); render(el); } }); } });
  };
  /* ---------------- Bordure et trame (paragraphe ou cellules) ---------------- */
  D.borders = function (target) {
    const cells = target === 'cells' || (TX.C.tableAt(V().state) && V().state.selection instanceof PM.tables.CellSelection);
    const st = TX.fmtState(V().state, A.attrs()); const bd = cells ? ((X.cells(V().state)[0] || {}).node || { attrs: {} }).attrs.bd || {} : st.p.bd || {};
    const first = bd.t || bd.b || bd.l || bd.r || { s: 'single', w: 0.5, c: '#000000' };
    const sides = { t: !!(bd.t && bd.t.s !== 'none'), b: !!(bd.b && bd.b.s !== 'none'), l: !!(bd.l && bd.l.s !== 'none'), r: !!(bd.r && bd.r.s !== 'none') };
    const body = '<div class="two-col"><div>' + fld('Style', sel('bS', [['single', 'Trait plein'], ['double', 'Double'], ['dotted', 'Pointillés'], ['dashed', 'Tirets'], ['thick', 'Épais']], first.s || 'single')) + fld('Épaisseur (pt)', sel('bW', [[0.25, '¼ pt'], [0.5, '½ pt'], [0.75, '¾ pt'], [1, '1 pt'], [1.5, '1 ½ pt'], [2.25, '2 ¼ pt'], [3, '3 pt'], [4.5, '4 ½ pt'], [6, '6 pt']], first.w || 0.5)) + fld('Couleur', '<input class="o-in" type="color" id="bC" value="' + (/^#/.test(first.c || '') ? first.c : '#000000') + '">') + (cells ? '' : fld('Espace avec le texte (pt)', num('bSp', first.sp == null ? 1 : first.sp, 1, 0, 31))) + fld('Trame de fond', '<input class="o-in" type="color" id="bSh" value="' + (/^#/.test(cells ? (((X.cells(V().state)[0] || {}).node || { attrs: {} }).attrs.bg || '') : (st.p.sh || '')) ? (cells ? X.cells(V().state)[0].node.attrs.bg : st.p.sh) : '#FFFFFF') + '">') + chk('bNoSh', 'Aucune trame', !(cells ? ((X.cells(V().state)[0] || {}).node || { attrs: {} }).attrs.bg : st.p.sh)) + '</div><div><div class="dlg-sec">Côtés</div><div class="bd-sides">' + ['t', 'b', 'l', 'r'].map((k) => '<label class="o-check"><input type="checkbox" id="bs' + k + '"' + (sides[k] ? ' checked' : '') + '><span>' + { t: 'Haut', b: 'Bas', l: 'Gauche', r: 'Droite' }[k] + '</span></label>').join('') + '</div><p style="display:flex;gap:4px;flex-wrap:wrap"><button type="button" class="mini-btn" data-pre="none">Aucune</button><button type="button" class="mini-btn" data-pre="box">Encadré</button><button type="button" class="mini-btn" data-pre="bottom">Dessous</button></p><div class="bd-pv" id="bPv"><span></span></div></div></div>';
    const pv = (el) => { const b = { s: val(el, 'bS'), w: +val(el, 'bW'), c: val(el, 'bC') }; const p = $in(el, 'bPv'); ['t', 'b', 'l', 'r'].forEach((k) => { p.style['border' + { t: 'Top', b: 'Bottom', l: 'Left', r: 'Right' }[k]] = val(el, 'bs' + k) ? TX.borderCss(b) : 'none'; }); p.style.background = val(el, 'bNoSh') ? '#fff' : val(el, 'bSh'); };
    return dlg(cells ? 'Bordures des cellules' : 'Bordure et trame du paragraphe', body, (el) => {
      const b = { s: val(el, 'bS'), w: +val(el, 'bW'), c: val(el, 'bC').toUpperCase() };
      const nbd = {}; ['t', 'b', 'l', 'r'].forEach((k) => { if (val(el, 'bs' + k)) nbd[k] = Object.assign({}, b, cells ? {} : { sp: nval(el, 'bSp') == null ? (k === 'l' || k === 'r' ? 4 : 1) : nval(el, 'bSp') }); else if (cells) nbd[k] = { s: 'none' }; });
      const sh = val(el, 'bNoSh') ? null : val(el, 'bSh').toUpperCase();
      if (cells) X.setCells(V(), { bd: nbd, bg: sh }, 'Bordures et trame');
      else X.setPara(V(), { bd: Object.keys(nbd).length ? nbd : null, sh }, 'Bordure et trame');
    }, { wide: true, onOpen: (el) => { O.$$('input,select', el).forEach((i) => i.addEventListener('input', () => pv(el))); el.addEventListener('click', (e) => { const b = e.target.closest('[data-pre]'); if (!b) return; const k = b.dataset.pre; ['t', 'b', 'l', 'r'].forEach((s) => { $in(el, 'bs' + s).checked = k === 'box' || (k === 'bottom' && s === 'b'); }); pv(el); }); pv(el); } });
  };
  /* ---------------- Mise en page ---------------- */
  D.pageSetup = function (start) {
    const pg = A.curPg(), multi = A.multiSection();
    const sizes = TX.PAGE_SIZES.map((s) => [s.id, s.name + ' (' + s.desc + ')']).concat([['custom', 'Personnalisé']]);
    const body = tabs([['margins', 'Marges'], ['paper', 'Papier'], ['layout', 'Disposition']]) +
      '<div class="dlg-page" data-page="margins"><div class="two-col">' + fld('Haut (cm)', num('mT', cm(pg.mt))) + fld('Bas (cm)', num('mB', cm(pg.mb))) + fld('Gauche (cm)', num('mL', cm(pg.ml))) + fld('Droite (cm)', num('mR', cm(pg.mr))) + fld('Reliure (cm)', num('mG', cm(pg.gut || 0))) + fld('Orientation', sel('mO', [['portrait', 'Portrait'], ['landscape', 'Paysage']], pg.orient || 'portrait')) + '</div><div class="pgset-pv" id="mPv"><i></i></div></div>' +
      '<div class="dlg-page" data-page="paper" hidden>' + fld('Format', sel('pS', sizes, TX.PAGE_SIZES.some((s) => s.id === pg.size) ? pg.size : 'custom')) + '<div class="two-col">' + fld('Largeur (cm)', num('pW', cm(pg.w))) + fld('Hauteur (cm)', num('pH', cm(pg.h))) + '</div></div>' +
      '<div class="dlg-page" data-page="layout" hidden><div class="dlg-sec">Section</div>' + fld('Début de la section', sel('lT', [['page', 'Nouvelle page'], ['continuous', 'Continu'], ['even', 'Page paire'], ['odd', 'Page impaire']], pg.type || 'page')) + '<div class="dlg-sec">En-têtes et pieds de page</div>' + chk('lEo', 'Pages paires et impaires différentes', !!(A.attrs().settings || {}).evenOdd) + chk('lFp', 'Première page différente', !!pg.titlePg) + '<div class="two-col">' + fld('En-tête depuis le haut (cm)', num('lMh', cm(pg.mh))) + fld('Pied depuis le bas (cm)', num('lMf', cm(pg.mf))) + '</div>' + fld('Alignement vertical', sel('lVa', [['top', 'Haut'], ['center', 'Centré'], ['bottom', 'Bas']], pg.va || 'top')) + '<div class="two-col">' + fld('Numérotation des pages', sel('lNf', [['decimal', '1, 2, 3'], ['lowerRoman', 'i, ii, iii'], ['upperRoman', 'I, II, III'], ['lowerLetter', 'a, b, c'], ['upperLetter', 'A, B, C']], pg.numFmt || 'decimal')) + fld('Commencer à (vide = continuer)', num('lNs', pg.numStart, 1, 0)) + '</div></div>' +
      fld('Appliquer à', sel('aTo', multi ? [['section', 'Cette section'], ['after', 'À partir de cette section'], ['all', 'Tout le document'], ['here', 'À partir d\'ici (nouvelle section)']] : [['all', 'Tout le document'], ['here', 'À partir d\'ici (nouvelle section)']], multi ? 'section' : 'all'));
    const pv = (el) => { const land = val(el, 'mO') === 'landscape'; const w = nval(el, 'pW'), h = nval(el, 'pH'); const W = land ? Math.max(w, h) : Math.min(w, h), H = land ? Math.min(w, h) : Math.max(w, h); const k = 150 / Math.max(W, H); const p = $in(el, 'mPv'); p.style.width = W * k + 'px'; p.style.height = H * k + 'px'; const i = p.querySelector('i'); i.style.left = (nval(el, 'mL') + nval(el, 'mG')) * k + 'px'; i.style.right = nval(el, 'mR') * k + 'px'; i.style.top = nval(el, 'mT') * k + 'px'; i.style.bottom = nval(el, 'mB') * k + 'px'; };
    return dlg('Mise en page', body, (el) => {
      const land = val(el, 'mO') === 'landscape'; const w = fromCm(nval(el, 'pW')), h = fromCm(nval(el, 'pH'));
      const patch = { mt: fromCm(nval(el, 'mT')), mb: fromCm(nval(el, 'mB')), ml: fromCm(nval(el, 'mL')), mr: fromCm(nval(el, 'mR')), gut: fromCm(nval(el, 'mG')), orient: land ? 'landscape' : 'portrait', w: land ? Math.max(w, h) : Math.min(w, h), h: land ? Math.min(w, h) : Math.max(w, h), size: val(el, 'pS'), type: val(el, 'lT'), titlePg: val(el, 'lFp'), mh: fromCm(nval(el, 'lMh')), mf: fromCm(nval(el, 'lMf')), va: val(el, 'lVa'), numFmt: val(el, 'lNf'), numStart: nval(el, 'lNs') };
      let to = val(el, 'aTo');
      if (to === 'here') { X.sectionBreak(V() === A.ed.view ? V() : A.ed.view, 'page', patch); }
      else X.setPage(A.ed.view, (pg2, i) => (to === 'section' || i === A.ed.view.state.selection.$from.index(0) ? patch : Object.assign({}, patch, { type: pg2.type, titlePg: pg2.titlePg, numStart: pg2.numStart })), to);
      if (val(el, 'lEo') !== !!(A.attrs().settings || {}).evenOdd) A.cmd.setSetting('evenOdd', val(el, 'lEo'), 'Pages paires et impaires');
    }, { tabs: true, start, onOpen: (el) => { O.$$('input,select', el).forEach((i) => i.addEventListener('input', () => pv(el))); $in(el, 'pS').addEventListener('change', () => { const s = TX.PAGE_SIZES.find((x) => x.id === val(el, 'pS')); if (s) { const land = val(el, 'mO') === 'landscape'; $in(el, 'pW').value = cm(land ? s.h : s.w); $in(el, 'pH').value = cm(land ? s.w : s.h); } pv(el); }); $in(el, 'mO').addEventListener('change', () => { const w = $in(el, 'pW').value; $in(el, 'pW').value = $in(el, 'pH').value; $in(el, 'pH').value = w; pv(el); }); pv(el); } });
  };
  D.columns = function () {
    const c = A.curPg().cols || { n: 1, gap: 35.4 };
    return O.form('Colonnes', [{ id: 'n', type: 'number', label: 'Nombre de colonnes', value: c.n || 1, min: 1, max: 6 }, { id: 'gap', type: 'number', label: 'Espacement (cm)', value: cm(c.gap || 35.4), step: 0.1, min: 0 }, { id: 'sep', type: 'check', label: 'Ligne séparatrice', value: !!c.sep }, { id: 'to', type: 'select', label: 'Appliquer à', value: 'section', options: [['section', 'Cette section'], ['all', 'Tout le document'], ['here', 'À partir d\'ici (nouvelle section continue)']] }]).then((r) => {
      if (!r) return;
      const cols = { n: Math.max(1, Math.min(6, r.n | 0)), gap: fromCm(r.gap), sep: r.sep };
      if (r.to === 'here') X.sectionBreak(A.ed.view, 'continuous', { cols }); else X.columns(A.ed.view, cols.n, cols, r.to);
    });
  };
  D.watermark = function () {
    const wm = (A.attrs().settings || {}).wm || {};
    return O.form('Filigrane', [{ id: 'kind', type: 'select', label: 'Type', value: wm.m ? 'img' : 'text', options: [['text', 'Texte'], ['img', 'Image']] }, { id: 'text', type: 'text', label: 'Texte', value: wm.text || 'CONFIDENTIEL' }, { id: 'font', type: 'select', label: 'Police', value: wm.font || 'Calibri', options: O.FONTS.map((f) => [f[0], f[0]]) }, { id: 'color', type: 'color', label: 'Couleur', value: wm.color || '#BFBFBF', half: true }, { id: 'op', type: 'number', label: 'Opacité (%)', value: Math.round((wm.opacity == null ? 0.5 : wm.opacity) * 100), min: 5, max: 100, half: true }, { id: 'diag', type: 'check', label: 'En diagonale', value: wm.diag !== false }], { ok: 'Appliquer' }).then(async (r) => {
      if (!r) return;
      if (r.kind === 'img') { const f = (await O.Files.pickMedia('image/*', false))[0]; if (!f) return; const id = TX.media.add(f, f.name); A.cmd.watermark({ m: id, scale: 60, washout: true }); return; }
      A.cmd.watermark({ text: r.text, font: r.font, color: r.color, opacity: r.op / 100, diag: r.diag, size: 'auto' });
    });
  };
  D.pageBorders = function () {
    const pg = A.curPg(), b = pg.bd || {};
    return O.form('Bordures de page', [{ id: 's', type: 'select', label: 'Style', value: b.s || 'none', options: [['none', 'Aucune'], ['single', 'Trait plein'], ['double', 'Double'], ['dotted', 'Pointillés'], ['dashed', 'Tirets'], ['thick', 'Épais']] }, { id: 'w', type: 'select', label: 'Épaisseur', value: b.w || 1, options: [[0.5, '½ pt'], [1, '1 pt'], [1.5, '1 ½ pt'], [2.25, '2 ¼ pt'], [3, '3 pt'], [4.5, '4 ½ pt'], [6, '6 pt']] }, { id: 'c', type: 'color', label: 'Couleur', value: /^#/.test(b.c || '') ? b.c : '#000000' }, { id: 'from', type: 'select', label: 'Mesurée à partir', value: b.from || 'page', options: [['page', 'du bord de la page'], ['text', 'du texte']] }, { id: 'sp', type: 'number', label: 'Distance (pt)', value: b.sp == null ? 24 : b.sp, min: 0, max: 72 }, { id: 'first', type: 'check', label: 'Première page seulement', value: !!b.first }, { id: 'all', type: 'check', label: 'Tout le document', value: true }]).then((r) => {
      if (!r) return; X.setPage(A.ed.view, { bd: r.s === 'none' ? null : { s: r.s, w: +r.w, c: r.c.toUpperCase(), from: r.from, sp: r.sp, first: r.first } }, r.all ? 'all' : 'section'); A.relayout();
    });
  };
  D.pageNumFormat = function () {
    const pg = A.curPg();
    return O.form('Format des numéros de page', [{ id: 'fmt', type: 'select', label: 'Format', value: pg.numFmt || 'decimal', options: [['decimal', '1, 2, 3…'], ['lowerRoman', 'i, ii, iii…'], ['upperRoman', 'I, II, III…'], ['lowerLetter', 'a, b, c…'], ['upperLetter', 'A, B, C…']] }, { id: 'cont', type: 'check', label: 'Continuer à partir de la section précédente', value: pg.numStart == null }, { id: 'start', type: 'number', label: 'À partir de', value: pg.numStart == null ? 1 : pg.numStart, min: 0 }]).then((r) => { if (r) X.setPage(A.ed.view, { numFmt: r.fmt, numStart: r.cont ? null : r.start }, A.multiSection() ? 'section' : 'all'); });
  };
  /* ---------------- Tableau ---------------- */
  D.tableInsert = function () {
    return O.form('Insérer un tableau', [{ id: 'c', type: 'number', label: 'Nombre de colonnes', value: 3, min: 1, max: 63, half: true }, { id: 'r', type: 'number', label: 'Nombre de lignes', value: 3, min: 1, max: 500, half: true }, { id: 'hdr', type: 'check', label: 'Ligne d\'en-tête (répétée sur chaque page)', value: true }, { id: 'ts', type: 'select', label: 'Style', value: 'Grille', options: TX.TABLE_STYLES.map((s) => [s.id, s.name]) }]).then((r) => { if (r) X.insertTable(V(), Math.max(1, r.r | 0), Math.max(1, Math.min(63, r.c | 0)), { hdr: r.hdr, ts: r.ts }); });
  };
  D.tableProps = function (start) {
    const v = V(), t = X.tableAt(v.state); if (!t) return;
    const a = t.node.attrs, c = (X.cells(v.state)[0] || { node: { attrs: {} } }).node.attrs;
    let row = null; const $f = v.state.selection.$from; for (let d = $f.depth; d > 0; d--) if ($f.node(d).type.name === 'table_row') { row = $f.node(d); break; }
    const cmar = a.cm || { t: 0, b: 0, l: 5.4, r: 5.4 };
    const body = tabs([['t', 'Tableau'], ['r', 'Ligne'], ['cell', 'Cellule'], ['alt', 'Texte de remplacement']]) +
      '<div class="dlg-page" data-page="t"><div class="two-col">' + fld('Alignement', sel('tA', [['', 'Gauche'], ['center', 'Centré'], ['right', 'Droite']], a.al || '')) + fld('Retrait à gauche (cm)', num('tI', cm(a.ind))) + fld('Style', sel('tS', TX.TABLE_STYLES.map((s) => [s.id, s.name]), a.ts || 'Grille')) + fld('Largeur', sel('tL', [['fixed', 'Colonnes fixes'], ['auto', 'Ajustée au contenu']], a.lay || 'fixed')) + '</div><div class="dlg-sec">Marges des cellules (cm)</div><div class="two-col">' + fld('Haut', num('cT', cm(cmar.t))) + fld('Bas', num('cB', cm(cmar.b))) + fld('Gauche', num('cL', cm(cmar.l))) + fld('Droite', num('cR', cm(cmar.r))) + '</div></div>' +
      '<div class="dlg-page" data-page="r" hidden>' + fld('Hauteur (cm, vide = automatique)', num('rH', row && row.attrs.h ? cm(row.attrs.h) : '')) + chk('rHd', 'Répéter en haut de chaque page (ligne d\'en-tête)', row && row.attrs.hdr) + chk('rCs', 'Ne pas couper la ligne entre deux pages', !row || !row.attrs.cs ? true : row.attrs.cs) + '</div>' +
      '<div class="dlg-page" data-page="cell" hidden>' + fld('Alignement vertical', sel('cV', [['', 'Haut'], ['center', 'Centré'], ['bottom', 'Bas']], c.va || '')) + fld('Largeur de colonne (cm)', num('cW', c.colwidth ? cm(c.colwidth[0] * 0.75) : '')) + fld('Trame', '<input class="o-in" type="color" id="cBg" value="' + (/^#/.test(c.bg || '') ? c.bg : '#FFFFFF') + '">') + chk('cNoBg', 'Aucune trame', !c.bg) + '</div>' +
      '<div class="dlg-page" data-page="alt" hidden>' + fld('Titre / description du tableau (lecteurs d\'écran)', '<textarea class="o-in" id="tAlt" rows="3">' + O.esc(a.alt || '') + '</textarea>') + '</div>';
    return dlg('Propriétés du tableau', body, (el) => {
      X.setTable(v, { al: val(el, 'tA') || null, ind: fromCm(nval(el, 'tI')) || null, ts: val(el, 'tS'), lay: val(el, 'tL'), cm: { t: fromCm(nval(el, 'cT')), b: fromCm(nval(el, 'cB')), l: fromCm(nval(el, 'cL')), r: fromCm(nval(el, 'cR')) }, alt: val(el, 'tAlt') || null }, 'Propriétés du tableau');
      const h = nval(el, 'rH'); X.setRows(V(), { h: h ? fromCm(h) : null, hdr: val(el, 'rHd'), cs: val(el, 'rCs') }, 'Ligne');
      X.setCells(V(), { va: val(el, 'cV') || null, bg: val(el, 'cNoBg') ? null : val(el, 'cBg').toUpperCase() }, 'Cellule');
      const w = nval(el, 'cW'); if (w && (!c.colwidth || Math.abs(cm(c.colwidth[0] * 0.75) - w) > 0.01)) A.cmd.setColWidth(w);
    }, { tabs: true, wide: true, start });
  };
  D.sortTable = function () {
    const t = X.tableAt(V().state); if (!t) return;
    const hdr = []; t.node.firstChild.forEach((c) => { hdr.push(c.textContent.trim()); for (let k = 1; k < c.attrs.colspan; k++) hdr.push(''); });
    return O.form('Trier', [{ id: 'col', type: 'select', label: 'Trier par', value: 0, options: hdr.map((h, i) => [i, 'Colonne ' + (i + 1) + (h ? ' (' + h.slice(0, 30) + ')' : '')]) }, { id: 'kind', type: 'select', label: 'Type', value: 'auto', options: [['auto', 'Automatique'], ['text', 'Texte'], ['number', 'Nombre'], ['date', 'Date']] }, { id: 'desc', type: 'select', label: 'Ordre', value: 'asc', options: [['asc', 'Croissant'], ['desc', 'Décroissant']] }, { id: 'hdr', type: 'check', label: 'La première ligne est un en-tête (non triée)', value: !!(t.node.firstChild.attrs.hdr || (t.node.attrs.look || {}).hdr) }]).then((r) => {
      if (!r) return; if (r.hdr && !t.node.firstChild.attrs.hdr) X.setRows(V(), (a) => a); X.sortTable(V(), +r.col, r.desc === 'desc', r.kind === 'auto' ? null : r.kind);
    });
  };
  D.sortParas = function () {
    if (X.tableAt(V().state)) return D.sortTable();
    return O.form('Trier les paragraphes', [{ id: 'desc', type: 'select', label: 'Ordre', value: 'asc', options: [['asc', 'Croissant (A → Z)'], ['desc', 'Décroissant (Z → A)']] }, { id: 'kind', type: 'select', label: 'Type', value: 'text', options: [['text', 'Texte'], ['number', 'Nombre']] }]).then((r) => {
      if (!r) return; const v = V(), ps = X.paras(v.state); if (ps.length < 2) { O.toast('Sélectionnez plusieurs paragraphes'); return; }
      const nodes = ps.map((p) => p.node).sort((a, b) => { const x = a.textContent, y = b.textContent; const c = r.kind === 'number' ? (TX.numOf(x) || 0) - (TX.numOf(y) || 0) : x.localeCompare(y, 'fr', { sensitivity: 'base', numeric: true }); return r.desc === 'desc' ? -c : c; });
      const a0 = ps[0].pos, b0 = ps[ps.length - 1].pos + ps[ps.length - 1].node.nodeSize;
      v.dispatch(v.state.tr.replaceWith(a0, b0, nodes).setMeta('tx-label', 'Trier'));
    });
  };
  D.formula = function () {
    return O.prompt('Formule', 'Formule (ex. =SOMME(AU-DESSUS), =MOYENNE(À GAUCHE), =SOMME(B2:B5), =PRODUIT(B2;C2))', '=SOMME(AU-DESSUS)', { hint: 'Fonctions : SOMME, MOYENNE, MIN, MAX, PRODUIT, NB. Plages : AU-DESSUS, À GAUCHE, À DROITE, EN DESSOUS, ou références A1:B3 (lettre = colonne, chiffre = ligne).' }).then((f) => { if (f) X.formula(V(), f); });
  };
  /* ---------------- Image / objet ---------------- */
  D.objectProps = function (start) {
    const v = V(), s = v.state.selection; if (!(s instanceof PM.state.NodeSelection)) { O.toast('Sélectionnez d\'abord une image ou un objet'); return; }
    const n = s.node, a = n.attrs, isImg = n.type.name === 'image', c = a.crop || { l: 0, t: 0, r: 0, b: 0 };
    const body = tabs([['size', 'Taille'], ['wrap', 'Habillage et position']].concat(isImg ? [['crop', 'Rognage']] : []).concat([['alt', 'Texte de remplacement']])) +
      '<div class="dlg-page" data-page="size"><div class="two-col">' + fld('Hauteur (cm)', num('oH', cm(a.h))) + fld('Largeur (cm)', num('oW', cm(a.w))) + fld('Rotation (°)', num('oR', a.rot || 0, 1, -360, 360)) + '</div>' + chk('oK', 'Conserver les proportions', isImg || a.kind === 'icon') + (isImg ? '<p><button type="button" class="mini-btn" id="oReset">' + O.icon('rotate-ccw') + 'Taille d\'origine</button></p>' : '') + '</div>' +
      '<div class="dlg-page" data-page="wrap" hidden>' + fld('Habillage', sel('wW', [['inline', 'Aligné sur le texte'], ['square', 'Carré'], ['tight', 'Rapproché'], ['topBottom', 'Haut et bas'], ['behind', 'Derrière le texte'], ['front', 'Devant le texte']], a.wrap)) + fld('Alignement horizontal', sel('wA', [['left', 'Gauche'], ['center', 'Centré'], ['right', 'Droite']], a.al || 'left')) + '<div class="two-col">' + fld('Décalage horizontal (cm, devant / derrière)', num('wX', cm(a.x))) + fld('Décalage vertical (cm)', num('wY', cm(a.y))) + '</div><p class="o-hint">« Devant / derrière le texte » : position par rapport au paragraphe d\'ancrage (glisser l\'objet à la souris).</p></div>' +
      (isImg ? '<div class="dlg-page" data-page="crop" hidden><div class="two-col">' + fld('Gauche (%)', num('cL', Math.round(c.l * 100), 1, 0, 95)) + fld('Droite (%)', num('cR', Math.round(c.r * 100), 1, 0, 95)) + fld('Haut (%)', num('cT', Math.round(c.t * 100), 1, 0, 95)) + fld('Bas (%)', num('cB', Math.round(c.b * 100), 1, 0, 95)) + '</div></div>' : '') +
      '<div class="dlg-page" data-page="alt" hidden>' + fld('Texte de remplacement (décrit l\'image pour les lecteurs d\'écran)', '<textarea class="o-in" id="aT" rows="3">' + O.esc(a.alt || '') + '</textarea>') + chk('aDec', 'Décoratif (ignoré par les lecteurs d\'écran)', !!a.dec) + '</div>';
    return dlg(isImg ? 'Image' : 'Objet', body, (el) => {
      const p = { h: fromCm(nval(el, 'oH')), w: fromCm(nval(el, 'oW')), rot: nval(el, 'oR') || 0, wrap: val(el, 'wW'), al: val(el, 'wA'), x: fromCm(nval(el, 'wX')), y: fromCm(nval(el, 'wY')), alt: val(el, 'aT') };
      if (n.type.name === 'image') { p.dec = val(el, 'aDec'); const cl = nval(el, 'cL') / 100, cr = nval(el, 'cR') / 100, ct = nval(el, 'cT') / 100, cb = nval(el, 'cB') / 100; const changed = cl !== c.l || cr !== c.r || ct !== c.t || cb !== c.b; if (changed) { p.crop = cl || cr || ct || cb ? { l: cl, r: cr, t: ct, b: cb } : null; const kw = (1 - cl - cr) / (1 - c.l - c.r), kh = (1 - ct - cb) / (1 - c.t - c.b); p.w = p.w * kw; p.h = p.h * kh; } }
      A.cmd.objAttrs(p);
    }, { tabs: true, wide: true, start, onOpen: (el) => {
      const ratio = a.w / a.h;
      $in(el, 'oH').addEventListener('input', () => { if (val(el, 'oK')) $in(el, 'oW').value = O.round(nval(el, 'oH') * ratio, 2); });
      $in(el, 'oW').addEventListener('input', () => { if (val(el, 'oK')) $in(el, 'oH').value = O.round(nval(el, 'oW') / ratio, 2); });
      const rs = $in(el, 'oReset'); if (rs) rs.onclick = () => { const info = TX.media.info[a.m] || {}; if (info.w) { const k = Math.min(1, TX.contentWidthAt(A.ed.view) / (info.w * 0.75)); $in(el, 'oW').value = cm(info.w * 0.75 * k); $in(el, 'oH').value = cm(info.h * 0.75 * k); } };
    } });
  };
  D.altText = function (after) {
    const v = V(), s = v.state.selection; if (!(s instanceof PM.state.NodeSelection)) { O.toast('Sélectionnez une image'); return; }
    return O.form('Texte de remplacement', [{ id: 'alt', type: 'textarea', label: 'Décrivez l\'image en une ou deux phrases', value: s.node.attrs.alt || '', rows: 3 }, { id: 'dec', type: 'check', label: 'Décorative (pas de description)', value: !!s.node.attrs.dec }]).then((r) => { if (r) { A.cmd.objAttrs({ alt: r.alt.trim(), dec: r.dec }); if (after) after(); } });
  };
  /* ---------------- Symboles ---------------- */
  D.symbols = function () {
    const sets = [['Ponctuation et typographie', '« » ‹ › “ ” „ ‘ ’ ‚ – — … · • ‰ † ‡ § ¶ © ® ™ ° ′ ″ ¡ ¿ ⁂'], ['Monnaies', '€ $ £ ¥ ¢ ₣ ₤ ₽ ₹ ₩ ₺ ₿'], ['Mathématiques', '± × ÷ = ≠ ≈ ≡ ≤ ≥ < > ∞ √ ∛ ∑ ∏ ∫ ∂ ∆ ∇ ∈ ∉ ∩ ∪ ⊂ ⊃ ∀ ∃ ¬ ∧ ∨ ⇒ ⇔ ∝ ∠ ⊥ ∥ ½ ⅓ ⅔ ¼ ¾ ⅛ ² ³ ¹ ⁰ ⁴ ⁵ ⁿ ₀ ₁ ₂ ₃'], ['Grec', 'α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω Α Β Γ Δ Ε Θ Λ Π Σ Φ Ψ Ω'], ['Flèches', '← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔ ↖ ↗ ↘ ↙ ➔ ➜ ➤ ↩ ↪ ⟵ ⟶'], ['Formes et puces', '■ □ ▪ ▫ ● ○ ◆ ◇ ▲ △ ▼ ▽ ► ◄ ★ ☆ ♦ ♣ ♠ ♥ ✓ ✔ ✗ ✘ ☐ ☑ ☒ ⚠ ⚡ ☎ ✉ ✂ ✎ ⌛ ⏰'], ['Lettres accentuées', 'À Â Ä Ç É È Ê Ë Î Ï Ô Ö Ù Û Ü Ÿ Æ Œ à â ä ç é è ê ë î ï ô ö ù û ü ÿ æ œ ß ñ Ñ ø Ø å Å'], ['Unités', 'µ Ω ℃ ℉ ㎜ ㎝ ㎞ ㎡ ㎥ ㎏ ℓ № ℗ ℮']];
    const node = '<input class="o-in" id="syQ" placeholder="Rechercher (ex. : flèche, euro, degré) ou coller un caractère" style="margin-bottom:8px">' + sets.map((s) => '<div class="dlg-sec">' + s[0] + '</div><div class="sym-grid">' + s[1].split(' ').map((c) => '<button type="button" data-s="' + c + '" title="U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + '">' + c + '</button>').join('') + '</div>').join('') + '<div class="dlg-sec">Par code</div><div class="find-row"><input class="o-in" id="syU" placeholder="Code Unicode (ex. 2713)"><button type="button" class="mini-btn" id="syGo">Insérer</button></div>';
    const v = V();
    return O.dialog({ title: 'Symboles', wide: true, body: node, buttons: [{ label: 'Fermer', value: null, primary: true }], onOpen: (el) => {
      el.addEventListener('mousedown', (e) => { if (e.target.closest('[data-s]')) e.preventDefault(); });
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { X.symbol(v, b.dataset.s); O.toast('« ' + b.dataset.s + ' » inséré', { ms: 700 }); } });
      $in(el, 'syGo').onclick = () => { const c = parseInt(val(el, 'syU'), 16); if (c > 0) X.symbol(v, String.fromCodePoint(c)); };
      $in(el, 'syQ').addEventListener('input', () => { const q = val(el, 'syQ').toLowerCase(); const map = { fleche: 'flèches', flèche: 'flèches', euro: 'monnaies', degre: 'unités', degré: 'unités', grec: 'grec', math: 'mathématiques', coche: 'formes', puce: 'formes' }; O.$$('.dlg-sec', el).forEach((s) => { const g = s.nextElementSibling; const hit = !q || s.textContent.toLowerCase().includes(map[q] || q) || (g && g.textContent.includes(q)); s.hidden = !hit; if (g) g.hidden = !hit; }); });
    } });
  };
  D.dateTime = function () {
    const now = Date.now();
    return O.form('Date et heure', [{ id: 'fmt', type: 'select', label: 'Format', value: 'd/MM/yyyy', options: TX.DATE_FMTS.map((f) => [f[0], TX.fmtDate(now, f[0])]) }, { id: 'upd', type: 'check', label: 'Mettre à jour automatiquement (champ)', value: false }]).then((r) => { if (!r) return; if (r.upd) X.insertField(V(), /H/.test(r.fmt) && !/d/.test(r.fmt) ? 'time' : 'date', { fmt: r.fmt }); else X.insertText(V(), TX.fmtDate(now, r.fmt)); });
  };
  /* ---------------- Liens, signets, renvois ---------------- */
  function bookmarks() { const l = []; A.ed.view.state.doc.descendants((n) => { if (n.type.name === 'bookmark') l.push(n.attrs.name); return true; }); return l; }
  D.link = function () {
    const v = V(), st = TX.fmtState(v.state, A.attrs()); const cur = st.link || '';
    const heads = TX.numKey.getState(A.ed.view.state).heads;
    const body = tabs([['web', 'Page web, fichier'], ['doc', 'Emplacement dans ce document'], ['mail', 'Adresse e-mail']]) +
      '<div class="dlg-page" data-page="web">' + fld('Adresse', '<input class="o-in" id="lU" value="' + O.esc(/^https?:/.test(cur) ? cur : '') + '" placeholder="https://…">') + '</div>' +
      '<div class="dlg-page" data-page="doc" hidden>' + fld('Titre ou signet', sel('lD', [['', '(choisir)'], ['#_top', 'Début du document']].concat(heads.map((h) => ['#h:' + h.pos, '  '.repeat(h.level - 1) + (h.text || '(titre)')])).concat(bookmarks().map((b) => ['#bk-' + b, 'Signet : ' + b])), /^#/.test(cur) ? cur : '')) + '</div>' +
      '<div class="dlg-page" data-page="mail" hidden>' + fld('Adresse e-mail', '<input class="o-in" id="lM" value="' + O.esc(/^mailto:/.test(cur) ? cur.slice(7).split('?')[0] : '') + '">') + fld('Objet', '<input class="o-in" id="lS">') + '</div>' +
      (v.state.selection.empty ? fld('Texte à afficher', '<input class="o-in" id="lT">') : '');
    return dlg('Lien hypertexte', body, (el) => {
      const tab = el.querySelector('[data-tab].on').dataset.tab; let href = '';
      if (tab === 'web') { href = val(el, 'lU').trim(); if (href && !/^[a-z]+:/i.test(href)) href = 'https://' + href; }
      if (tab === 'mail') { href = 'mailto:' + val(el, 'lM').trim() + (val(el, 'lS') ? '?subject=' + encodeURIComponent(val(el, 'lS')) : ''); }
      if (tab === 'doc') { const d = val(el, 'lD'); if (/^#h:/.test(d)) { const pos = +d.slice(3); const pid = ensurePid(pos); href = '#' + pid; } else href = d; }
      if (!href) return false;
      X.link(V(), href, $in(el, 'lT') ? val(el, 'lT') || null : null);
    }, { tabs: true, start: /^#/.test(cur) ? 'doc' : /^mailto:/.test(cur) ? 'mail' : 'web', extra: cur ? [{ label: 'Supprimer le lien', left: true, bad: true, value: null, onClick: () => { X.link(V(), null); } }] : [] });
  };
  /** Identifiant stable d'un paragraphe (titres, légendes) pour les liens et renvois */
  function ensurePid(pos) {
    const v = A.ed.view, n = v.state.doc.nodeAt(pos); if (!n) return '';
    if (n.attrs.pid) return n.attrs.pid;
    const pid = '_Ref' + Math.random().toString(36).slice(2, 8);
    v.dispatch(v.state.tr.setNodeMarkup(pos, null, Object.assign({}, n.attrs, { pid })).setMeta('addToHistory', false)); return pid;
  }
  D.bookmark = function () {
    const l = bookmarks();
    const body = fld('Nom du signet (lettres, chiffres, _)', '<input class="o-in" id="bN" value="">') + '<div class="dlg-sec">Signets du document</div>' + (l.length ? '<div>' + l.map((b) => '<div class="rv-it" style="display:flex;gap:8px;align-items:center"><b style="flex:1">' + O.esc(b) + '</b><button type="button" class="mini-btn" data-go="' + O.esc(b) + '">Atteindre</button><button type="button" class="mini-btn" data-del="' + O.esc(b) + '">' + O.icon('trash-2') + '</button></div>').join('') + '</div>' : '<p class="o-hint">Aucun signet.</p>');
    return dlg('Signet', body, (el) => { const nm = String(val(el, 'bN') || '').trim().replace(/[^\p{L}\p{N}_]/gu, '_'); if (!nm) return false; if (l.indexOf(nm) >= 0) { O.toast('Ce nom existe déjà', { bad: true }); return false; } X.bookmark(V(), nm); O.toast('Signet « ' + nm + ' » ajouté'); }, { ok: 'Ajouter', onOpen: (el, close) => el.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'), d = e.target.closest('[data-del]'); if (g) { close(); A.followLink('#' + g.dataset.go); } if (d) { const v = A.ed.view, tr = v.state.tr; v.state.doc.descendants((n, p) => { if (n.type.name === 'bookmark' && n.attrs.name === d.dataset.del) tr.delete(tr.mapping.map(p), tr.mapping.map(p + 1)); return true; }); v.dispatch(tr); close(); D.bookmark(); } }) });
  };
  D.crossRef = function () {
    const st = TX.numKey.getState(A.ed.view.state); const notes = Object.keys(st.notes.foot).concat(Object.keys(st.notes.end));
    const kinds = [['heading', 'Titre'], ['caption', 'Légende (figure, tableau)'], ['bookmark', 'Signet'], ['note', 'Note']];
    const list = (k) => k === 'heading' ? st.heads.map((h) => [h.pos, (h.label ? h.label + ' ' : '') + h.text]) : k === 'caption' ? st.captions.map((c) => [c.pos, c.text]) : k === 'bookmark' ? bookmarks().map((b) => [b, b]) : notes.map((id) => [id, (st.notes.foot[id] ? 'Note ' + st.notes.foot[id] : 'Note de fin ' + st.notes.end[id])]);
    const body = '<div class="two-col">' + fld('Catégorie', sel('rK', kinds, 'heading')) + fld('Insérer', sel('rS', [['text', 'Le texte'], ['page', 'Le numéro de page'], ['number', 'Le numéro (titre, légende, note)'], ['above', 'Ci-dessus / ci-dessous']], 'text')) + '</div>' + fld('Élément', '<select class="o-in" id="rI" size="8"></select>') + chk('rL', 'Insérer comme lien', true);
    return dlg('Renvoi', body, (el) => {
      const k = val(el, 'rK'), it = val(el, 'rI'); if (!it) return false;
      let id = it; if (k === 'heading' || k === 'caption') id = ensurePid(+it);
      X.insertField(V(), 'ref', { ref: { kind: k, id }, show: val(el, 'rS') });
      if (val(el, 'rL')) { const v = V(), p = v.state.selection.from; v.dispatch(v.state.tr.addMark(p - 1, p, TX.schema.marks.link.create({ href: '#' + (k === 'bookmark' ? 'bk-' + id : id) }))); }
    }, { ok: 'Insérer', onOpen: (el) => { const fill = () => { $in(el, 'rI').innerHTML = list(val(el, 'rK')).map((x) => '<option value="' + O.esc(x[0]) + '">' + O.esc(String(x[1]).slice(0, 90)) + '</option>').join(''); }; $in(el, 'rK').addEventListener('change', fill); fill(); } });
  };
  /* ---------------- Légendes, tables ---------------- */
  D.caption = function () {
    const v = V(), s = v.state.selection; const obj = s instanceof PM.state.NodeSelection ? s.node : null; const inTbl = !!X.tableAt(v.state);
    const label = obj ? (obj.type.name === 'image' || obj.type.name === 'drawing' ? 'Figure' : 'Équation') : inTbl ? 'Tableau' : 'Figure';
    return O.form('Insérer une légende', [{ id: 'label', type: 'select', label: 'Étiquette', value: label, options: [['Figure', 'Figure'], ['Tableau', 'Tableau'], ['Équation', 'Équation'], ['Photo', 'Photo'], ['Schéma', 'Schéma']] }, { id: 'text', type: 'text', label: 'Légende', value: '' }, { id: 'pos', type: 'select', label: 'Position', value: inTbl ? 'above' : 'below', options: [['below', 'Sous l\'élément'], ['above', 'Au-dessus de l\'élément']] }]).then((r) => {
      if (!r) return; const v2 = V(), st = v2.state;
      const para = NT.paragraph.create({ s: 'Legende', al: obj && obj.attrs.al === 'center' ? 'center' : null }, [TX.schema.text(r.label + ' '), NT.field.create({ f: 'seq', name: r.label })].concat(r.text ? [TX.schema.text(' : ' + r.text)] : []));
      let at; const $f = st.selection.$from;
      if (inTbl) { const t = X.tableAt(st); at = r.pos === 'above' ? t.pos : t.pos + t.node.nodeSize; }
      else { let d = $f.depth; while (d > 0 && $f.node(d).type !== NT.paragraph) d--; at = d > 0 ? (r.pos === 'above' ? $f.before(d) : $f.after(d)) : $f.pos; }
      v2.dispatch(st.tr.insert(at, para).setMeta('tx-label', 'Légende')); v2.focus();
    });
  };
  D.toc = function (kind) {
    kind = kind || 'toc';
    return O.form(kind === 'tof' ? 'Table des illustrations' : 'Table des matières', (kind === 'tof' ? [{ id: 'label', type: 'select', label: 'Étiquette', value: 'Figure', options: [['Figure', 'Figure'], ['Tableau', 'Tableau'], ['Équation', 'Équation'], ['Photo', 'Photo'], ['Schéma', 'Schéma'], ['', 'Toutes']] }] : [{ id: 'levels', type: 'number', label: 'Afficher les niveaux', value: 3, min: 1, max: 6 }]).concat([{ id: 'title', type: 'text', label: 'Titre (vide : aucun)', value: kind === 'tof' ? '' : 'Table des matières' }, { id: 'nums', type: 'check', label: 'Afficher les numéros de page', value: true }, { id: 'leader', type: 'select', label: 'Points de suite', value: 'dot', options: [['dot', '..........'], ['hyphen', '----------'], ['underscore', '______'], ['none', '(aucun)']] }])).then((r) => { if (r) A.cmd.insertToc({ kind, levels: r.levels || 3, label: r.label, title: r.title || null, nums: r.nums, leader: r.leader }); });
  };
  D.notesOptions = function () {
    const s = A.attrs().settings || {};
    return O.form('Notes de bas de page et de fin', [{ id: 'fn', type: 'select', label: 'Notes de bas de page : format', value: s.fnFmt || 'decimal', options: [['decimal', '1, 2, 3…'], ['lowerLetter', 'a, b, c…'], ['lowerRoman', 'i, ii, iii…'], ['upperRoman', 'I, II, III…'], ['symbol', '*, †, ‡, §…']] }, { id: 'en', type: 'select', label: 'Notes de fin : format', value: s.enFmt || 'lowerRoman', options: [['decimal', '1, 2, 3…'], ['lowerLetter', 'a, b, c…'], ['lowerRoman', 'i, ii, iii…'], ['upperRoman', 'I, II, III…'], ['symbol', '*, †, ‡, §…']] }]).then((r) => { if (r) { const ns = Object.assign({}, s, { fnFmt: r.fn, enFmt: r.en }); A.setAttr('settings', ns, 'Format des notes'); A.layout.clearCache(); A.relayout(); } });
  };
  /* ---------------- Statistiques, atteindre, zoom ---------------- */
  D.stats = function () {
    const doc = A.ed.view.state.doc, s = TX.stats(doc), sel2 = A.ed.view.state.selection, ss = !sel2.empty ? TX.stats(doc, [sel2.from, sel2.to]) : null;
    const pages = A.layout.mode === 'page' ? A.layout.pages.length : A.layout.pages.length + ' (estimation)';
    let notesW = 0; Object.values(A.attrs().notes || {}).forEach((n) => { try { notesW += TX.stats(TX.schema.nodeFromJSON(n.doc || n)).words; } catch (e) { } });
    const lines = Math.round((A.layout.mode === 'page' ? A.ed.view.dom.querySelectorAll('p').length : 0) + 0);
    return O.alert('Statistiques', '<table class="kbd-tbl">' + [['Pages', pages], ['Mots', s.words.toLocaleString('fr-FR')], ['Caractères (espaces non compris)', s.charsNoSpace.toLocaleString('fr-FR')], ['Caractères (espaces compris)', s.chars.toLocaleString('fr-FR')], ['Paragraphes', s.paras], ['Mots des notes', notesW]].concat(ss ? [['Sélection : mots', ss.words], ['Sélection : caractères', ss.chars]] : []).map((r) => '<tr><td>' + r[0] + '</td><td><b>' + r[1] + '</b></td></tr>').join('') + '</table>' + (lines ? '' : ''));
  };
  D.goTo = function () {
    const st = TX.numKey.getState(A.ed.view.state);
    return O.form('Atteindre', [{ id: 'what', type: 'select', label: 'Atteindre', value: 'page', options: [['page', 'Page'], ['head', 'Titre'], ['bookmark', 'Signet'], ['note', 'Note'], ['comment', 'Commentaire'], ['table', 'Tableau'], ['image', 'Image']] }, { id: 'n', type: 'text', label: 'Numéro (page : 3 ; +2 / -1 relatif) ou nom du signet', value: '' }]).then((r) => {
      if (!r) return; const L = A.layout, doc = A.ed.view.state.doc;
      if (r.what === 'page') { let n = parseInt(r.n, 10); if (/^[+-]/.test(r.n)) n = L.pageIndexOf(A.ed.view.state.selection.from) + 1 + n; n = Math.max(1, Math.min(L.pages.length, n || 1)); const p = L.pages[n - 1]; if (p) { A.goTo(p.startPos); L.scrollToPage(n - 1); } return; }
      if (r.what === 'bookmark') { A.followLink('#' + r.n.trim()); return; }
      const idx = Math.max(1, parseInt(r.n, 10) || 1) - 1; const list = [];
      if (r.what === 'head') st.heads.forEach((h) => list.push(h.pos));
      else doc.descendants((n, p) => { if ((r.what === 'note' && n.type.name === 'fnref') || (r.what === 'table' && n.type.name === 'table') || (r.what === 'image' && (n.type.name === 'image' || n.type.name === 'drawing')) || (r.what === 'comment' && n.isInline && n.marks.some((m) => m.type.name === 'cmt'))) list.push(p); return true; });
      if (list[idx] == null) { O.toast('Introuvable', { bad: true }); return; } A.goTo(list[idx]);
    });
  };
  D.zoom = function () {
    return O.form('Zoom', [{ id: 'z', type: 'select', label: 'Zoom', value: A.settings.fit || String(Math.round(A.layout.zoom * 100)), options: [['50', '50 %'], ['75', '75 %'], ['100', '100 %'], ['125', '125 %'], ['150', '150 %'], ['200', '200 %'], ['width', 'Largeur de la page'], ['page', 'Une page entière']] }, { id: 'p', type: 'number', label: 'Pourcentage', value: Math.round(A.layout.zoom * 100), min: 20, max: 300 }]).then((r) => { if (!r) return; if (r.z === 'width' || r.z === 'page') A.zoomTo(r.z); else A.zoomTo((String(r.p) !== String(Math.round(A.layout.zoom * 100)) ? r.p : +r.z) / 100); });
  };
  /* ---------------- Équation ---------------- */
  D.equation = async function (node, pos) {
    await TX.loadKatex();
    const tex0 = node ? node.attrs.tex : '', disp0 = node ? node.attrs.display : true;
    const tpl = [['\\frac{a}{b}', 'a/b'], ['x^{2}', 'x²'], ['x_{i}', 'xᵢ'], ['\\sqrt{x}', '√x'], ['\\sqrt[n]{x}', 'ⁿ√x'], ['\\sum_{i=1}^{n}', 'Σ'], ['\\int_{a}^{b}', '∫'], ['\\lim_{x \\to \\infty}', 'lim'], ['\\left( \\right)', '( )'], ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 'matrice'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\Delta', 'Δ'], ['\\pi', 'π'], ['\\lambda', 'λ'], ['\\theta', 'θ'], ['\\times', '×'], ['\\div', '÷'], ['\\pm', '±'], ['\\leq', '≤'], ['\\geq', '≥'], ['\\neq', '≠'], ['\\approx', '≈'], ['\\infty', '∞'], ['\\rightarrow', '→'], ['^{\\circ}C', '°C'], ['\\text{ m}^{2}', 'm²']];
    const body = fld('Équation (notation LaTeX)', '<textarea class="o-in" id="eqT" rows="3" style="font-family:Consolas,monospace">' + O.esc(tex0) + '</textarea>') + '<div class="eq-tpl">' + tpl.map((t) => '<button type="button" data-t="' + O.esc(t[0]) + '">' + O.esc(t[1]) + '</button>').join('') + '</div><div class="eq-pv" id="eqPv"></div>' + chk('eqD', 'Équation centrée sur sa propre ligne', disp0);
    return dlg(node ? 'Modifier l\'équation' : 'Insérer une équation', body, (el) => {
      const tex = val(el, 'eqT').trim(); if (!tex) return false;
      const v = V();
      if (node && pos != null) { v.dispatch(v.state.tr.setNodeMarkup(pos, null, { tex, display: val(el, 'eqD') }).setMeta('tx-label', 'Équation')); return; }
      X.insertMath(v, tex, val(el, 'eqD'));
    }, { wide: true, onOpen: (el) => {
      const ta = $in(el, 'eqT'); const pv = () => { $in(el, 'eqPv').innerHTML = TX.renderTex(ta.value || '\\square', true); };
      ta.addEventListener('input', pv); el.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; const s = ta.selectionStart, t = b.dataset.t; ta.value = ta.value.slice(0, s) + t + ta.value.slice(ta.selectionEnd); ta.focus(); ta.selectionStart = ta.selectionEnd = s + t.length; pv(); }); pv();
    } });
  };
  /* ---------------- Graphique, SmartArt, icônes ---------------- */
  D.chart = function () {
    const v = V(), s = v.state.selection; if (!(s instanceof PM.state.NodeSelection) || s.node.attrs.kind !== 'chart') return;
    const c = O.clone(s.node.attrs.chart || window.Pres.newChart('bar'));
    const grid = () => '<table class="dg"><tr><th></th>' + c.series.map((se, j) => '<th><input data-sn="' + j + '" value="' + O.esc(se.name) + '"></th>').join('') + '</tr>' + c.cats.map((cat, i) => '<tr><td><input data-cat="' + i + '" value="' + O.esc(cat) + '"></td>' + c.series.map((se, j) => '<td><input data-v="' + i + ':' + j + '" value="' + O.esc(String(se.values[i] == null ? '' : se.values[i]).replace('.', ',')) + '"></td>').join('') + '</tr>').join('') + '</table>';
    const body = '<div class="two-col">' + fld('Type', sel('cK', window.Pres.CHART_KINDS.map((k) => [k[0], k[1]]), c.kind)) + fld('Titre', '<input class="o-in" id="cT" value="' + O.esc(c.title || '') + '">') + fld('Légende', sel('cL', [['bottom', 'En bas'], ['top', 'En haut'], ['right', 'À droite'], ['none', 'Aucune']], c.legend || 'bottom')) + '<div>' + chk('cLb', 'Étiquettes de données', !!c.labels) + '</div></div><div id="cG">' + grid() + '</div><p style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn" data-g="row+">' + O.icon('plus') + 'Catégorie</button><button type="button" class="mini-btn" data-g="col+">' + O.icon('plus') + 'Série</button><button type="button" class="mini-btn" data-g="row-">' + O.icon('minus') + 'Catégorie</button><button type="button" class="mini-btn" data-g="col-">' + O.icon('minus') + 'Série</button></p>';
    const read = (el) => { O.$$('[data-cat]', el).forEach((i) => { c.cats[+i.dataset.cat] = i.value; }); O.$$('[data-sn]', el).forEach((i) => { c.series[+i.dataset.sn].name = i.value; }); O.$$('[data-v]', el).forEach((i) => { const [r, j] = i.dataset.v.split(':').map(Number); const n = TX.numOf(i.value); c.series[j].values[r] = n == null ? 0 : n; }); };
    return dlg('Données du graphique', body, (el) => { read(el); c.kind = val(el, 'cK'); c.title = val(el, 'cT'); c.legend = val(el, 'cL'); c.labels = val(el, 'cLb'); A.cmd.objAttrs({ chart: c, alt: c.title || 'Graphique' }); }, { wide: true, onOpen: (el) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; read(el); const k = b.dataset.g; if (k === 'row+') { c.cats.push('Catégorie ' + (c.cats.length + 1)); c.series.forEach((se) => se.values.push(0)); } if (k === 'row-' && c.cats.length > 1) { c.cats.pop(); c.series.forEach((se) => se.values.pop()); } if (k === 'col+') c.series.push({ name: 'Série ' + (c.series.length + 1), values: c.cats.map(() => 0) }); if (k === 'col-' && c.series.length > 1) c.series.pop(); $in(el, 'cG').innerHTML = grid(); }) });
  };
  D.smart = function () {
    const v = V(), s = v.state.selection; if (!(s instanceof PM.state.NodeSelection) || s.node.attrs.kind !== 'smart') return;
    const sa = O.clone(s.node.attrs.smart);
    return O.form('SmartArt', [{ id: 'kind', type: 'select', label: 'Disposition', value: sa.kind, options: window.Pres.SMART_KINDS.map((k) => [k[0], k[1]]) }, { id: 'text', type: 'textarea', label: 'Texte (une ligne par élément, deux espaces = niveau inférieur)', value: window.Pres.smartToText(sa), rows: 7 }], { wide: true }).then((r) => { if (r) { sa.kind = r.kind; sa.items = window.Pres.smartFromText(r.text); A.cmd.objAttrs({ smart: sa }); } });
  };
  D.icons = function (replace) {
    const body = '<input class="o-in" id="icQ" placeholder="Rechercher (ex. : casque, échelle, danger, flèche)" autofocus><div class="ic-grid" id="icG" style="margin-top:8px"></div>';
    return O.dialog({ title: 'Icônes', wide: true, body, buttons: [{ label: 'Fermer', value: null }], onOpen: (el, close) => {
      const fill = () => { $in(el, 'icG').innerHTML = O.searchIcons(val(el, 'icQ'), 240).map((n) => '<button type="button" data-ic="' + n + '" title="' + n + '">' + O.icon(n) + '</button>').join(''); };
      $in(el, 'icQ').addEventListener('input', O.debounce(fill, 150)); fill();
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-ic]'); if (!b) return; close(); if (replace) A.cmd.objAttrs({ icon: b.dataset.ic }); else X.insertDrawing(V(), { kind: 'icon', icon: b.dataset.ic, w: 48, h: 48, wrap: 'inline', fill: null, color: 't:accent1', line: { w: 2 }, alt: b.dataset.ic }); });
    } });
  };
  /* ---------------- Listes ---------------- */
  D.listDialog = function () {
    const st = TX.fmtState(V().state, A.attrs()); const cur = st.list && (A.attrs().lists || {})[st.list.id];
    const def = O.clone(cur || TX.LIST_KINDS.num()); let lv = st.list ? st.list.l || 0 : 0;
    const fmts = [['decimal', '1, 2, 3'], ['decimalZero', '01, 02, 03'], ['lowerLetter', 'a, b, c'], ['upperLetter', 'A, B, C'], ['lowerRoman', 'i, ii, iii'], ['upperRoman', 'I, II, III'], ['ordinal', '1er, 2e, 3e'], ['bullet', 'Puce'], ['none', '(aucun)']];
    const body = '<div class="two-col"><div>' + fld('Niveau à modifier', sel('lL', Array.from({ length: 9 }, (x, i) => [i, 'Niveau ' + (i + 1)]), lv)) + fld('Style de numérotation', sel('lF', fmts, def.lv[lv].f)) + fld('Mise en forme (%1 = niveau 1, %2 = niveau 2… ; ou caractère de la puce)', '<input class="o-in" id="lT" value="' + O.esc(def.lv[lv].t) + '">') + '<div class="two-col">' + fld('Commencer à', num('lS', def.lv[lv].st || 1, 1, 0)) + fld('Retrait du texte (cm)', num('lI', cm(def.lv[lv].il))) + fld('Retrait négatif (cm)', num('lH', cm(def.lv[lv].hg))) + '</div></div><div><div class="dlg-sec">Aperçu</div><div class="lvl-pv" id="lPv"></div></div></div>';
    const save = (el) => { const L = def.lv[lv]; L.f = val(el, 'lF'); L.t = val(el, 'lT') || (L.f === 'bullet' ? '•' : '%' + (lv + 1) + '.'); L.st = nval(el, 'lS') || 1; L.il = fromCm(nval(el, 'lI')); L.hg = fromCm(nval(el, 'lH')); if (def.lv.some((x) => x.f === 'bullet') && def.lv.some((x) => x.f !== 'bullet')) def.k = 'multi'; else def.k = def.lv[0].f === 'bullet' ? 'bullet' : def.lv.some((x) => /%\d.*%\d/.test(x.t)) ? 'multi' : 'number'; };
    const load = (el) => { const L = def.lv[lv]; $in(el, 'lF').value = L.f; $in(el, 'lT').value = L.t; $in(el, 'lS').value = L.st || 1; $in(el, 'lI').value = cm(L.il); $in(el, 'lH').value = cm(L.hg); };
    const pv = (el) => { save(el); const c = []; let h = ''; [0, 0, 1, 1, 2, 0].forEach((l) => { c[l] = (c[l] || 0) + 1; for (let k = l + 1; k < 9; k++) c[k] = 0; for (let k = 0; k < l; k++) if (!c[k]) c[k] = 1; const lb = TX.listLabel(def, l, c.map((x, i) => x || def.lv[i].st || 1)); h += '<div style="padding-left:' + (def.lv[l].il - def.lv[l].hg) * 1.33 * 0.6 + 'px"><span style="display:inline-block;min-width:' + def.lv[l].hg * 0.8 + 'px">' + O.esc(lb) + '</span> ─────────</div>'; }); $in(el, 'lPv').innerHTML = h; };
    return dlg('Définir une liste', body, (el) => {
      save(el);
      if (st.list) X.defineList(V(), def);
      else { const id = TX.uid('L'); const lists = Object.assign({}, A.attrs().lists, { [id]: def }); const v = V(); const tr = v.state.tr; TX.setDocAttr(tr, v.state, 'lists', lists); X.paras(v.state).forEach(({ node, pos }) => tr.setNodeMarkup(pos, null, Object.assign({}, node.attrs, { li: { id, l: 0 }, il: null, fi: null }))); v.dispatch(TX.refresh(tr)); }
    }, { wide: true, onOpen: (el) => { $in(el, 'lL').addEventListener('change', () => { save(el); lv = +val(el, 'lL'); load(el); pv(el); }); O.$$('input,select', el).forEach((i) => { if (i.id !== 'lL') i.addEventListener('input', () => pv(el)); }); pv(el); } });
  };
  /* ---------------- Styles ---------------- */
  D.newStyle = function () {
    return O.prompt('Créer un style', 'Nom du nouveau style (d\'après la mise en forme actuelle)', 'Style 1').then((name) => {
      if (!name) return; const r = X.styleFromSelection(V(), name); const st = Object.assign({}, A.attrs().styles); if (st[r.id]) r.id += '2'; st[r.id] = r.def;
      A.setAttr('styles', st, 'Nouveau style'); setTimeout(() => X.setStyle(V(), r.id), 0);
    });
  };
  D.editStyle = function (id) {
    const st = A.attrs().styles || {}, s = st[id]; if (!s) return; const R = TX.resolveStyle(st, id);
    const p = Object.assign({}, s.p || {}), r = Object.assign({}, s.r || {});
    const fields = [{ id: 'n', type: 'text', label: 'Nom', value: s.n }, { id: 'b', type: 'select', label: 'Basé sur', value: s.b || '', options: [['', '(aucun)']].concat(Object.keys(st).filter((k) => k !== id && st[k].t === s.t).map((k) => [k, st[k].n])) }]
      .concat(s.t !== 'c' ? [{ id: 'nx', type: 'select', label: 'Style du paragraphe suivant', value: s.nx || id, options: Object.keys(st).filter((k) => st[k].t !== 'c').map((k) => [k, st[k].n]) }, { id: 'lvl', type: 'select', label: 'Niveau hiérarchique (plan, table des matières)', value: R.lvl || 0, options: [[0, 'Corps de texte']].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => [x, 'Niveau ' + x])) }] : [])
      .concat([{ id: 'f', type: 'select', label: 'Police', value: r.f || R.r.f || '+minor', options: fontsList(), half: true }, { id: 'sz', type: 'number', label: 'Taille (pt)', value: r.sz || R.r.sz || 11, min: 1, max: 400, step: 0.5, half: true }, { id: 'c', type: 'color', label: 'Couleur', value: /^#/.test(R.r.c || '') ? R.r.c : (R.r.c ? O.Themes.resolve(R.r.c, A.theme()) : '#000000'), half: true }, { id: 'bold', type: 'check', label: 'Gras', value: !!R.r.b }, { id: 'it', type: 'check', label: 'Italique', value: !!R.r.i }, { id: 'caps', type: 'check', label: 'Majuscules', value: !!R.r.caps }])
      .concat(s.t !== 'c' ? [{ id: 'al', type: 'select', label: 'Alignement', value: R.p.al || 'left', options: [['left', 'Gauche'], ['center', 'Centré'], ['right', 'Droite'], ['justify', 'Justifié']], half: true }, { id: 'sb', type: 'number', label: 'Espace avant (pt)', value: R.p.sb || 0, min: 0, half: true }, { id: 'sa', type: 'number', label: 'Espace après (pt)', value: R.p.sa || 0, min: 0, half: true }, { id: 'ln', type: 'number', label: 'Interligne (multiple)', value: R.p.lr && R.p.lr !== 'auto' ? 1 : (R.p.ln || 1), min: 0.5, max: 5, step: 0.05, half: true }, { id: 'il', type: 'number', label: 'Retrait gauche (cm)', value: cm(R.p.il), step: 0.1, half: true }, { id: 'kn', type: 'check', label: 'Solidaire du suivant', value: !!R.p.kn }, { id: 'q', type: 'check', label: 'Dans la galerie des styles rapides', value: !!s.q }] : [{ id: 'q', type: 'check', label: 'Dans la galerie des styles rapides', value: !!s.q }]);
    return O.form('Modifier le style « ' + s.n + ' »', fields, { wide: true, ok: 'Enregistrer' }).then((res) => {
      if (!res) return;
      const ns = Object.assign({}, s, { n: res.n || s.n, b: res.b || undefined, q: res.q ? 1 : 0 });
      if (s.t !== 'c') { ns.nx = res.nx; if (+res.lvl) ns.lvl = +res.lvl; else if (s.lvl) ns.lvl = 0; }
      ns.r = Object.assign({}, r, { f: res.f, sz: res.sz, c: res.c.toUpperCase() === (O.Themes.resolve(R.r.c, A.theme()) || '#000000').toUpperCase() && R.r.c ? R.r.c : res.c.toUpperCase(), b: res.bold ? 1 : 0, i: res.it ? 1 : 0, caps: res.caps ? 1 : 0 });
      if (s.t !== 'c') ns.p = Object.assign({}, p, { al: res.al === 'left' ? undefined : res.al, sb: res.sb, sa: res.sa, ln: res.ln, lr: 'auto', il: fromCm(res.il) || undefined, kn: res.kn ? 1 : undefined });
      const all = Object.assign({}, st, { [id]: ns }); A.setAttr('styles', all, 'Modifier le style');
    });
  };
  /* ---------------- Comparer ---------------- */
  D.compare = async function () {
    const r = await O.dialog({ title: 'Comparer deux versions', body: '<p>Le document actuel est la <b>version révisée</b>. Choisissez la <b>version d\'origine</b> (.docx, .magdoc, .odt, .txt…). Le résultat s\'ouvre dans un nouveau document : les différences y sont marquées comme des révisions (insertions et suppressions), à accepter ou refuser.</p><p class="o-hint">Comparaison paragraphe par paragraphe puis mot par mot. La mise en forme n\'est pas comparée.</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Choisir l\'original…', primary: true, value: 'ok' }] });
    if (!r) return;
    const l = await O.Files.open({ id: 'texte' }); if (!l.length) return;
    try {
      const old = await TX.IO.open(l[0].blob, l[0].name);
      const res = TX.compareDocs(old.json, A.docJSON(), TX.userName() || 'Comparaison');
      Object.assign(TX.media.blobs, old.media || {});
      if (A.dirty && !(await A.askSave())) return;
      A.setDoc(res, TX.media.blobs, { name: 'Comparaison ' + O.baseName(l[0].name) + '.magdoc', kind: 'magdoc' });
      A.dirty = true; A.openPane('revisions'); O.toast(TX.revisions(A.ed.view.state.doc).length + ' différence(s) marquée(s)');
    } catch (e) { console.error(e); O.toast('Comparaison impossible : ' + e.message, { bad: true }); }
  };
})();
