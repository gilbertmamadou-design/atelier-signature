/* Tableur — boîtes de dialogue : Format de cellule (nombre, alignement, police, bordure, remplissage, protection),
   mises en forme conditionnelles (règles rapides, nouvelle règle, gestionnaire), validation des données, tri,
   filtres personnalisés / 10 premiers / avancé, tableau croisé dynamique, valeur cible, convertir, doublons,
   sous-totaux, noms, mise en page, impression, insérer une fonction, collage spécial, insérer / supprimer des cellules,
   série, atteindre, sélection spéciale, zoom, déplacer / copier une feuille, protection, tableaux, graphiques,
   graphiques sparkline, icônes, symboles, statistiques, vérification des erreurs, évaluation de formule. */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur, P = TB.Formula;
  const A = window.TableurApp = window.TableurApp || {};
  const C = A.cmd = A.cmd || {};
  const D = A.dialogs = A.dialogs || {};
  const wb = () => A.wb, sh = () => A.wb.cur, G = () => A.grid;
  const KEY = TB.key;
  const esc = O.esc;
  /* ---------------- outils ---------------- */
  const sel = (id, opts, val) => '<select class="o-in" id="' + id + '">' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  const inp = (id, val, attrs) => '<input class="o-in" id="' + id + '" value="' + esc(val == null ? '' : val) + '"' + (attrs || '') + '>';
  const num = (id, val, step, min, max) => '<input class="o-in" type="text" inputmode="decimal" id="' + id + '" value="' + esc(val == null ? '' : String(val).replace('.', TB.loc.dec)) + '" data-step="' + (step || 1) + '"' + (min != null ? ' data-min="' + min + '"' : '') + (max != null ? ' data-max="' + max + '"' : '') + '>';
  const fld = (label, inner, half) => '<label class="o-field' + (half ? ' half' : '') + '"><span>' + esc(label) + '</span>' + inner + '</label>';
  const chk = (id, label, on) => '<label class="o-check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  const tabs = (list) => '<div class="dlg-tabs" role="tablist">' + list.map((t, i) => '<button type="button" role="tab" data-tab="' + t[0] + '"' + (i === 0 ? ' class="on"' : '') + '>' + esc(t[1]) + '</button>').join('') + '</div>';
  function wireTabs(el, start) { const go = (k) => { O.$$('[data-tab]', el).forEach((b) => b.classList.toggle('on', b.dataset.tab === k)); O.$$('.dlg-page', el).forEach((p) => { p.hidden = p.dataset.page !== k; }); }; O.$$('[data-tab]', el).forEach((b) => b.onclick = () => go(b.dataset.tab)); go(start || (el.querySelector('[data-tab]') || {}).dataset.tab); }
  const $in = (el, id) => el.querySelector('#' + id);
  const val = (el, id) => { const e = $in(el, id); return e ? (e.type === 'checkbox' ? e.checked : e.value) : null; };
  const nval = (el, id) => { const v = TB.parseNum(String(val(el, id) || '').trim()); return v == null ? (isNaN(parseFloat(String(val(el, id)).replace(',', '.'))) ? null : parseFloat(String(val(el, id)).replace(',', '.'))) : v; };
  function dlg(title, body, onOk, opt) {
    opt = opt || {};
    return O.dialog({ title, wide: opt.wide, body, onOpen: (el, close) => { if (opt.tabs) wireTabs(el, opt.start); if (opt.onOpen) opt.onOpen(el, close); }, buttons: (opt.extra || []).concat([{ label: 'Annuler', value: null }, { label: opt.ok || 'OK', primary: true, value: 'ok', onClick: (c, w) => onOk(w.querySelector('.o-dlg') || w, c) }]) });
  }
  /** texte d'une référence saisie (« Feuil1!A1:B5 », « A1 », nom) → {sh, g} */
  function refIn(txt, base) {
    txt = String(txt || '').trim().replace(/^=/, ''); if (!txt) return null;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(txt);
    const s = m ? wb().sheet((m[1] || m[2]).replace(/''/g, "'")) : (base || sh());
    const g = TB.parseRange((m ? m[3] : txt).replace(/\$/g, ''));
    if (s && g) return { sh: s, g };
    const n = wb().findName ? wb().findName(txt, sh()) : null;
    if (n && n.f) { const r = refIn(n.f); if (r) return r; }
    const t = wb().table(txt); if (t) return { sh: t.sh, g: { r1: t.t.r1, c1: t.t.c1, r2: t.t.r2, c2: t.t.c2 } };
    return null;
  }
  const refOut = (s, g, abs) => (s !== sh() ? TB.quoteSheet(s.name) + '!' : '') + TB.rangeStr(g, abs);
  const selRef = (abs) => { const g = A.bounded(G().range()); return TB.rangeStr(g, abs); };
  /** saisie d'une formule (affichage local) → texte canonique ; null si invalide */
  const fIn = (t) => { t = String(t == null ? '' : t).trim(); if (t === '') return null; t = t.replace(/^=/, ''); try { return P.fromUser(t); } catch (e) { const n = TB.parseNum(t); return n != null ? String(n) : '"' + t.replace(/"/g, '""') + '"'; } };
  const fOut = (canon) => canon == null ? '' : P.toUser(String(canon));
  const colLabel = (s, c, hdr, r) => { if (hdr) { const v = s.get(r, c); if (v !== null && v !== '') return 'Colonne ' + TB.colName(c) + ' – ' + TB.Fmt.text(v, 'General'); } return 'Colonne ' + TB.colName(c); };
  const color = (id, v, none) => '<button type="button" class="o-btn dlg-col" id="' + id + '" data-v="' + esc(v || '') + '"' + (none ? ' data-none="' + esc(none) + '"' : '') + '><i style="display:inline-block;width:18px;height:14px;border:1px solid #999;vertical-align:middle;margin-right:6px;background:' + (v || 'transparent') + '"></i>' + esc(v ? v : none || 'Automatique') + '</button>';
  function wireColors(el, onChange) {
    O.$$('.dlg-col', el).forEach((b) => b.addEventListener('click', () => {
      O.colorPicker(b, { theme: A.themeRefs ? A.themeRefs() : null, none: b.dataset.none || null, auto: b.dataset.none ? null : 'Automatique', onPick: (c) => { const v = c && c !== 'auto' ? (A.resolveColor ? A.resolveColor(c) : c) : ''; b.dataset.v = v; b.dataset.dirty = '1'; b.innerHTML = '<i style="display:inline-block;width:18px;height:14px;border:1px solid #999;vertical-align:middle;margin-right:6px;background:' + (v || 'transparent') + '"></i>' + esc(v || b.dataset.none || 'Automatique'); if (onChange) onChange(); } });
    }));
  }
  const dirty = (el) => O.$$('input,select,textarea', el).forEach((i) => { const f = () => { i.dataset.dirty = '1'; }; i.addEventListener('input', f); i.addEventListener('change', f); });
  const isDirty = (el, id) => { const e = $in(el, id); return !!(e && e.dataset.dirty); };

  /* =====================================================================
     Format de cellule
     ===================================================================== */
  const CATS = [['general', 'Standard'], ['number', 'Nombre'], ['currency', 'Monétaire'], ['accounting', 'Comptabilité'], ['date', 'Date'], ['time', 'Heure'], ['percent', 'Pourcentage'], ['fraction', 'Fraction'], ['scientific', 'Scientifique'], ['text', 'Texte'], ['special', 'Spécial'], ['custom', 'Personnalisé']];
  const CUSTOM = ['General', '0', '0.00', '#,##0', '#,##0.00', '#,##0.00\\ "€"', '#,##0\\ "€";[Red]-#,##0\\ "€"', '0%', '0.00%', '0.00E+00', '# ?/?', '# ??/??', 'dd/mm/yyyy', 'dd-mmm-yy', 'dddd d mmmm yyyy', 'mmmm yyyy', 'hh:mm', 'hh:mm:ss', '[h]:mm', 'dd/mm/yyyy hh:mm', '@', '0" h"', '0.0" kg"', '0.00" m²"', '0" mm"', '00000', '0# ## ## ## ##', '_-* #,##0.00\\ "€"_-;-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-'];
  D.formatCells = function (start) {
    if (!A.guard('format')) return;
    const s = sh(), Gr = G(); const r = Gr.sel.r, c = Gr.sel.c;
    const st = wb().styles.get(s.styleAt(r, c)); const v = s.get(r, c);
    const nf0 = st.nf || 'General'; let kind = TB.Fmt.kindOf(nf0); if (TB.Fmt.SPECIAL.some((x) => x[0] === nf0)) kind = 'special';
    const dec0 = TB.Fmt.decimals(nf0); const sample = typeof v === 'number' ? v : kind === 'date' || kind === 'time' ? TB.now() : 1234.5678;
    const fonts = O.FONTS.map((f) => [f[0], f[0]]); if (st.fn && !fonts.some((f) => f[0] === st.fn)) fonts.unshift([st.fn, st.fn]);
    const BSTY = [['thin', 'Fin'], ['hair', 'Très fin'], ['dotted', 'Pointillé'], ['dashed', 'Tirets'], ['dashDot', 'Tiret-point'], ['medium', 'Moyen'], ['mediumDashed', 'Tirets moyens'], ['thick', 'Épais'], ['double', 'Double']];
    const body = tabs([['number', 'Nombre'], ['align', 'Alignement'], ['font', 'Police'], ['border', 'Bordure'], ['fill', 'Remplissage'], ['prot', 'Protection']]) +
      // nombre
      '<div class="dlg-page" data-page="number"><div class="two-col" style="grid-template-columns:150px 1fr"><div class="fmt-cats" id="fcCats">' + CATS.map((k) => '<button type="button" data-k="' + k[0] + '"' + (k[0] === kind ? ' class="on"' : '') + '>' + esc(k[1]) + '</button>').join('') + '</div>' +
      '<div><div class="o-field"><span>Exemple</span><div class="fmt-pv" id="fcPv"></div></div><div id="fcOpts"></div></div></div></div>' +
      // alignement
      '<div class="dlg-page" data-page="align" hidden><div class="two-col">' + fld('Horizontal', sel('faH', [['', 'Standard'], ['left', 'Gauche (retrait)'], ['center', 'Centré'], ['right', 'Droite (retrait)'], ['fill', 'Recopié'], ['justify', 'Justifié'], ['centerContinuous', 'Centré sur plusieurs colonnes'], ['distributed', 'Distribué']], st.ha || '')) +
      fld('Vertical', sel('faV', [['bottom', 'Bas'], ['center', 'Centré'], ['top', 'Haut'], ['justify', 'Justifié']], st.va || 'bottom')) + fld('Retrait', num('faI', st.ind || 0, 1, 0, 15)) + fld('Orientation (degrés, −90 à 90)', num('faR', st.rot === 255 ? 0 : st.rot || 0, 5, -90, 90)) + '</div>' +
      chk('faVert', 'Texte vertical (lettres empilées)', st.rot === 255) + chk('faW', 'Renvoyer à la ligne automatiquement', !!st.wr) + chk('faS', 'Ajuster (réduire la taille du texte)', !!st.shr) + chk('faM', 'Fusionner les cellules', !!s.mergeAt(r, c)) + '</div>' +
      // police
      '<div class="dlg-page" data-page="font" hidden><div class="two-col">' + fld('Police', sel('ffN', fonts, st.fn || TB.DEFAULT_FONT)) + fld('Taille', num('ffS', st.fs || TB.DEFAULT_SIZE, 1, 1, 409)) +
      fld('Style', sel('ffSt', [['n', 'Normal'], ['i', 'Italique'], ['b', 'Gras'], ['bi', 'Gras italique']], (st.b ? 'b' : '') + (st.i ? 'i' : '') || 'n')) + fld('Soulignement', sel('ffU', [['', 'Aucun'], ['single', 'Simple'], ['double', 'Double']], st.u || '')) +
      fld('Couleur', color('ffC', st.fc || '')) + '<div>' + chk('ffX', 'Barré', !!st.st) + chk('ffSup', 'Exposant', !!st.sup) + chk('ffSub', 'Indice', !!st.sub) + '</div></div><div class="fmt-pv" id="ffPv">AaBbCcYyZz 123</div></div>' +
      // bordure
      '<div class="dlg-page" data-page="border" hidden><div class="two-col" style="grid-template-columns:150px 1fr"><div>' + fld('Style', '<div class="bd-styles" id="fbS">' + BSTY.map((b, i) => '<button type="button" data-s="' + b[0] + '"' + (i === 0 ? ' class="on"' : '') + ' title="' + esc(b[1]) + '"><svg width="100%" height="8" preserveAspectRatio="none" viewBox="0 0 60 8"><line x1="0" x2="60" y1="4" y2="4" stroke="#000" stroke-width="' + (({ hair: 0.5, thin: 1, medium: 2, thick: 3, double: 1, mediumDashed: 2 })[b[0]] || 1) + '"' + (b[0] === 'dotted' ? ' stroke-dasharray="1 2"' : /ashed/.test(b[0]) ? ' stroke-dasharray="5 3"' : /Dot/.test(b[0]) ? ' stroke-dasharray="6 2 1 2"' : '') + '/>' + (b[0] === 'double' ? '<line x1="0" x2="60" y1="7" y2="7" stroke="#000"/>' : '') + '</svg></button>').join('') + '</div>') + fld('Couleur', color('fbC', '#000000')) + '</div>' +
      '<div><div class="bd-grid">' + [['none', 'square-dashed', 'Aucune'], ['outer', 'square', 'Contour'], ['inner', 'grid-3x3', 'Intérieur'], ['all', 'table', 'Toutes']].map((x) => '<button type="button" class="o-btn" data-b="' + x[0] + '">' + O.icon(x[1]) + ' ' + esc(x[2]) + '</button>').join('') + '</div>' +
      '<div class="bd-grid">' + [['top', 'panel-top', 'Haut'], ['bottom', 'panel-bottom', 'Bas'], ['left', 'panel-left', 'Gauche'], ['right', 'panel-right', 'Droite'], ['diagDown', 'slash', 'Diagonale ↘'], ['diagUp', 'slash', 'Diagonale ↗']].map((x) => '<button type="button" class="o-btn" data-b="' + x[0] + '">' + esc(x[2]) + '</button>').join('') + '</div><p class="o-hint" id="fbLog">Choisissez un style et une couleur, puis les bordures à appliquer.</p></div></div></div>' +
      // remplissage
      '<div class="dlg-page" data-page="fill" hidden>' + fld('Couleur d\'arrière-plan', color('fiC', st.bg || '', 'Aucune couleur')) + fld('Motif', sel('fiP', [['solid', 'Uni'], ['gray125', 'Gris 12,5 %'], ['gray0625', 'Gris 6,25 %'], ['lightGray', 'Gris 25 %'], ['mediumGray', 'Gris 50 %'], ['darkGray', 'Gris 75 %'], ['lightHorizontal', 'Rayures horizontales'], ['lightVertical', 'Rayures verticales'], ['lightDown', 'Diagonales ↘'], ['lightUp', 'Diagonales ↗'], ['lightGrid', 'Quadrillage']], st.pat || 'solid')) + '</div>' +
      // protection
      '<div class="dlg-page" data-page="prot" hidden>' + chk('fpL', 'Verrouillée', st.lk !== false) + chk('fpH', 'Masquée (la formule n\'apparaît pas dans la barre de formule)', !!st.hd) + '<p class="o-hint">Ces options n\'agissent que lorsque la feuille est protégée (Révision › Protéger la feuille).</p></div>';
    const borderOps = [];
    let nfCur = nf0;
    const renderNum = (el, k) => {
      const box = $in(el, 'fcOpts'); kind = k;
      O.$$('#fcCats button', el).forEach((b) => b.classList.toggle('on', b.dataset.k === k));
      const d = dec0 == null ? 2 : dec0;
      const negs = (cur) => sel('fcNeg', [['minus', '-1234,10'], ['red', '1234,10 (rouge)'], ['redminus', '-1234,10 (rouge)'], ['paren', '(1234,10)'], ['redparen', '(1234,10) (rouge)']], /\[Red\]-/.test(cur) ? 'redminus' : /\[Red\]\(/.test(cur) ? 'redparen' : /\[Red\]/.test(cur) ? 'red' : /\(/.test(cur) ? 'paren' : 'minus');
      const syms = [['€', '€ Euro'], ['', 'Aucun'], ['$', '$ Dollar'], ['£', '£ Livre'], ['CHF', 'CHF Franc suisse']];
      let h = '';
      if (k === 'general') h = '<p class="o-hint">Les cellules au format Standard n\'ont pas de format de nombre particulier.</p>';
      else if (k === 'number') h = fld('Nombre de décimales', num('fcDec', d, 1, 0, 30)) + chk('fcSep', 'Séparateur de milliers ( )', /#,##/.test(nf0)) + fld('Nombres négatifs', negs(nf0));
      else if (k === 'currency' || k === 'accounting') h = fld('Nombre de décimales', num('fcDec', d, 1, 0, 30)) + fld('Symbole', sel('fcSym', syms, /€/.test(nf0) || kind !== TB.Fmt.kindOf(nf0) ? '€' : /\$/.test(nf0) ? '$' : /£/.test(nf0) ? '£' : /CHF/.test(nf0) ? 'CHF' : '')) + (k === 'currency' ? fld('Nombres négatifs', negs(nf0)) : '');
      else if (k === 'percent' || k === 'scientific') h = fld('Nombre de décimales', num('fcDec', d, 1, 0, 30));
      else if (k === 'date' || k === 'time') { const L = k === 'date' ? TB.Fmt.DATES : TB.Fmt.TIMES; h = fld('Type', '<div class="fmt-list" id="fcList">' + L.map((x) => '<button type="button" data-f="' + esc(x) + '"' + (x === nf0 ? ' class="on"' : '') + '>' + esc(TB.Fmt.text(k === 'date' ? Math.floor(sample) || TB.today() : sample % 1 || 0.6354, x)) + '</button>').join('') + '</div>'); }
      else if (k === 'fraction') h = fld('Type', sel('fcFr', [['# ?/?', 'Un chiffre (1/4)'], ['# ??/??', 'Deux chiffres (21/25)'], ['# ???/???', 'Trois chiffres (312/943)'], ['# ?/2', 'Demis (1/2)'], ['# ?/4', 'Quarts (2/4)'], ['# ?/8', 'Huitièmes (4/8)'], ['# ??/16', 'Seizièmes (8/16)'], ['# ?/10', 'Dixièmes (3/10)'], ['# ??/100', 'Centièmes (30/100)']], nf0));
      else if (k === 'text') h = '<p class="o-hint">Le contenu est traité comme du texte, même s\'il ressemble à un nombre.</p>';
      else if (k === 'special') h = fld('Type', sel('fcSp', TB.Fmt.SPECIAL, nf0));
      else if (k === 'custom') h = fld('Code de format', inp('fcCode', TB.Fmt.toLocal(nf0 === 'General' ? 'Standard' : nf0))) + '<div class="fmt-list" id="fcList">' + CUSTOM.map((x) => '<button type="button" data-f="' + esc(x) + '"' + (x === nf0 ? ' class="on"' : '') + '>' + esc(TB.Fmt.toLocal(x === 'General' ? 'Standard' : x)) + '</button>').join('') + '</div><p class="o-hint">0 chiffre · # chiffre facultatif · espace : milliers · , décimales · % · "texte" · jj mm aaaa hh mm ss · [Rouge] · sections : positif;négatif;zéro;texte</p>';
      box.innerHTML = h;
      O.$$('input,select', box).forEach((i) => { i.addEventListener('input', () => upd(el)); i.addEventListener('change', () => upd(el)); });
      O.$$('#fcList button', box).forEach((b) => b.addEventListener('click', () => { O.$$('#fcList button', box).forEach((x) => x.classList.toggle('on', x === b)); if ($in(el, 'fcCode')) $in(el, 'fcCode').value = TB.Fmt.toLocal(b.dataset.f === 'General' ? 'Standard' : b.dataset.f); upd(el); }));
      upd(el);
    };
    const curCode = (el) => {
      const d = $in(el, 'fcDec') ? Math.max(0, Math.min(30, Math.round(nval(el, 'fcDec') || 0))) : 2;
      switch (kind) {
        case 'general': return 'General';
        case 'number': return TB.Fmt.build('number', { dec: d, sep: val(el, 'fcSep'), neg: val(el, 'fcNeg') });
        case 'currency': return TB.Fmt.build('currency', { dec: d, sym: val(el, 'fcSym'), neg: val(el, 'fcNeg') });
        case 'accounting': return TB.Fmt.build('accounting', { dec: d, sym: val(el, 'fcSym') });
        case 'percent': return TB.Fmt.build('percent', { dec: d });
        case 'scientific': return TB.Fmt.build('scientific', { dec: d });
        case 'date': case 'time': { const b = el.querySelector('#fcList button.on') || el.querySelector('#fcList button'); return b ? b.dataset.f : 'dd/mm/yyyy'; }
        case 'fraction': return val(el, 'fcFr') || '# ?/?';
        case 'text': return '@';
        case 'special': return val(el, 'fcSp');
        case 'custom': { const t = String(val(el, 'fcCode') || '').trim(); return !t || /^standard$/i.test(t) ? 'General' : TB.Fmt.fromLocal(t); }
      }
      return 'General';
    };
    const upd = (el) => { nfCur = curCode(el); let t; try { const f = TB.Fmt.format(kind === 'text' && typeof v !== 'string' ? (v == null ? 'Texte' : String(v)) : sample, nfCur); t = '<span style="color:' + (f.c ? ({ red: '#E00', blue: '#00F', green: '#080' })[String(f.c).toLowerCase()] || f.c : '#000') + '">' + esc(f.s) + '</span>'; } catch (e) { t = '<span style="color:#c00">Format incorrect</span>'; } $in(el, 'fcPv').innerHTML = t; };
    const fontPv = (el) => { const e = $in(el, 'ffPv'); const sv = val(el, 'ffSt'); e.style.fontFamily = TB.fontCss(val(el, 'ffN')); e.style.fontSize = Math.min(28, (nval(el, 'ffS') || 11) * 1.33) + 'px'; e.style.fontWeight = /b/.test(sv) ? 700 : 400; e.style.fontStyle = /i/.test(sv) ? 'italic' : 'normal'; e.style.textDecoration = (val(el, 'ffU') ? 'underline ' : '') + (val(el, 'ffX') ? 'line-through' : ''); e.style.color = $in(el, 'ffC').dataset.v || '#000'; };
    return dlg('Format de cellule', body, (el, close) => {
      // nombre (si la catégorie a été touchée ou le format changé)
      const patch = {};
      if (nfCur !== nf0) { try { TB.Fmt.compile(nfCur); patch.nf = nfCur === 'General' ? null : nfCur; } catch (e) { O.toast('Code de format incorrect', { bad: true }); return false; } }
      if (isDirty(el, 'faH')) patch.ha = val(el, 'faH') || null; if (isDirty(el, 'faV')) patch.va = val(el, 'faV') === 'bottom' ? null : val(el, 'faV');
      if (isDirty(el, 'faI')) patch.ind = Math.round(nval(el, 'faI') || 0) || null;
      if (isDirty(el, 'faR') || isDirty(el, 'faVert')) patch.rot = val(el, 'faVert') ? 255 : (Math.max(-90, Math.min(90, Math.round(nval(el, 'faR') || 0))) || null);
      if (isDirty(el, 'faW')) patch.wr = val(el, 'faW') || null; if (isDirty(el, 'faS')) patch.shr = val(el, 'faS') || null;
      if (isDirty(el, 'ffN')) patch.fn = val(el, 'ffN'); if (isDirty(el, 'ffS')) patch.fs = Math.max(1, Math.min(409, nval(el, 'ffS') || 11));
      if (isDirty(el, 'ffSt')) { const sv = val(el, 'ffSt'); patch.b = /b/.test(sv) || null; patch.i = /i/.test(sv) || null; }
      if (isDirty(el, 'ffU')) patch.u = val(el, 'ffU') || null; if (isDirty(el, 'ffX')) patch.st = val(el, 'ffX') || null;
      if (isDirty(el, 'ffSup')) { patch.sup = val(el, 'ffSup') || null; if (patch.sup) patch.sub = null; } if (isDirty(el, 'ffSub')) { patch.sub = val(el, 'ffSub') || null; if (patch.sub) patch.sup = null; }
      if ($in(el, 'ffC').dataset.dirty) patch.fc = $in(el, 'ffC').dataset.v || null;
      if ($in(el, 'fiC').dataset.dirty) patch.bg = $in(el, 'fiC').dataset.v || null; if (isDirty(el, 'fiP')) patch.pat = val(el, 'fiP') === 'solid' ? null : val(el, 'fiP');
      if (isDirty(el, 'fpL')) patch.lk = val(el, 'fpL') ? null : false; if (isDirty(el, 'fpH')) patch.hd = val(el, 'fpH') || null;
      close('ok');
      if (Object.keys(patch).length) A.applyStyle(patch, 'Format de cellule');
      borderOps.forEach(([k, spec]) => C.borders(k, spec));
      if (isDirty(el, 'faM')) C.merge(val(el, 'faM') ? 'merge' : 'unmerge');
      return false;
    }, {
      tabs: true, start: start || 'number', wide: true,
      onOpen: (el) => {
        dirty(el); wireColors(el, () => fontPv(el));
        O.$$('#fcCats button', el).forEach((b) => b.addEventListener('click', () => renderNum(el, b.dataset.k)));
        renderNum(el, kind);
        ['ffN', 'ffS', 'ffSt', 'ffU', 'ffX'].forEach((id) => { $in(el, id).addEventListener('input', () => fontPv(el)); $in(el, id).addEventListener('change', () => fontPv(el)); }); fontPv(el);
        O.$$('#fbS button', el).forEach((b) => b.addEventListener('click', () => O.$$('#fbS button', el).forEach((x) => x.classList.toggle('on', x === b))));
        O.$$('[data-b]', el).forEach((b) => b.addEventListener('click', () => { const s0 = (el.querySelector('#fbS button.on') || {}).dataset.s || 'thin'; const c0 = $in(el, 'fbC').dataset.v || '#000000'; borderOps.push([b.dataset.b, { s: s0, c: c0 }]); $in(el, 'fbLog').textContent = 'À appliquer : ' + borderOps.map(([k]) => O.$('[data-b="' + k + '"]', el).textContent.trim()).join(', '); }));
      }
    });
  };

  /* =====================================================================
     Mises en forme conditionnelles
     ===================================================================== */
  const CF_FMTS = [['red', 'Remplissage rouge clair avec texte rouge foncé', { bg: '#FFC7CE', fc: '#9C0006' }], ['yellow', 'Remplissage jaune avec texte jaune foncé', { bg: '#FFEB9C', fc: '#9C5700' }], ['green', 'Remplissage vert avec texte vert foncé', { bg: '#C6EFCE', fc: '#006100' }], ['lred', 'Remplissage rouge clair', { bg: '#FFC7CE' }], ['rtext', 'Texte rouge', { fc: '#FF0000' }], ['rborder', 'Bordure rouge', { bt: { s: 'thin', c: '#FF0000' }, bb: { s: 'thin', c: '#FF0000' }, bl: { s: 'thin', c: '#FF0000' }, br: { s: 'thin', c: '#FF0000' } }], ['bold', 'Gras', { b: true }], ['custom', 'Format personnalisé…', null]];
  const cfRanges = () => G().sel.ranges.map((g) => A.bounded(g));
  function addRule(rule, label) {
    const s = sh(); rule.id = rule.id || TB.uid('cf'); rule.ranges = rule.ranges || cfRanges();
    A.tx(label || 'Mise en forme conditionnelle', () => wb().setProp(s, 'cf', s.cf.concat([rule])));
    if (TB.CF.invalidate) TB.CF.invalidate(s); G().invalidate();
  }
  D.cfAdd = (rule) => { if (!A.guard('format')) return; addRule(Object.assign({}, rule)); };
  async function pickFmt(el) { const k = val(el, 'cfF'); const f = CF_FMTS.find((x) => x[0] === k); if (f && f[2]) return f[2]; return await fmtDialog({}); }
  /** petit éditeur de format (police, remplissage, bordure, format de nombre) */
  function fmtDialog(cur) {
    cur = cur || {};
    const body = '<div class="two-col">' + fld('Style', sel('xS', [['', 'Inchangé'], ['b', 'Gras'], ['i', 'Italique'], ['bi', 'Gras italique']], (cur.b ? 'b' : '') + (cur.i ? 'i' : ''))) + fld('Couleur du texte', color('xC', cur.fc || '')) + fld('Remplissage', color('xB', cur.bg || '', 'Aucun')) + fld('Bordure', color('xR', cur.bt ? cur.bt.c : '', 'Aucune')) + fld('Format de nombre', inp('xN', cur.nf ? TB.Fmt.toLocal(cur.nf) : '')) + '<div>' + chk('xU', 'Souligné', !!cur.u) + chk('xX', 'Barré', !!cur.st) + '</div></div>';
    return O.dialog({ title: 'Format', body, onOpen: (el) => wireColors(el), buttons: [{ label: 'Annuler', value: null }, { label: 'OK', primary: true, value: 'ok', onClick: (c, w) => { const o = {}; const sv = val(w, 'xS'); if (/b/.test(sv)) o.b = true; if (/i/.test(sv)) o.i = true; if (val(w, 'xU')) o.u = 'single'; if (val(w, 'xX')) o.st = true; const fc = $in(w, 'xC').dataset.v, bg = $in(w, 'xB').dataset.v, bc = $in(w, 'xR').dataset.v; if (fc) o.fc = fc; if (bg) o.bg = bg; if (bc) { const b = { s: 'thin', c: bc }; o.bt = o.bb = o.bl = o.br = b; } const nf = String(val(w, 'xN') || '').trim(); if (nf) o.nf = TB.Fmt.fromLocal(nf); c(o); return false; } }] }).then((v) => v && typeof v === 'object' ? v : null);
  }
  /** règles rapides : gt, lt, between, eq, text, date, dup, top10, bottom10, top10p, bottom10p, above, below */
  D.cfQuick = async function (k) {
    if (!A.guard('format')) return;
    const fmtSel = fld('avec', sel('cfF', CF_FMTS.map((x) => [x[0], x[1]]), 'red'));
    const g = cfRanges()[0]; const s = sh();
    const nums = []; for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 5000); r++) for (let c = g.c1; c <= g.c2; c++) { const v = s.get(r, c); if (typeof v === 'number') nums.push(v); }
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const def = (x) => TB.numText(Math.round(x * 100) / 100).replace('.', TB.loc.dec);
    const T = { gt: ['Supérieur à', 'Mettre en forme les cellules SUPÉRIEURES à :'], lt: ['Inférieur à', 'Mettre en forme les cellules INFÉRIEURES à :'], between: ['Entre', 'Mettre en forme les cellules comprises ENTRE :'], eq: ['Égal à', 'Mettre en forme les cellules ÉGALES à :'], text: ['Le texte qui contient', 'Mettre en forme les cellules contenant le texte :'], date: ['Une date se produisant', 'Mettre en forme les cellules contenant une date :'], dup: ['Valeurs en double', 'Mettre en forme les cellules contenant :'], top10: ['10 valeurs les plus élevées', 'Mettre en forme les cellules qui se classent parmi les PREMIÈRES :'], bottom10: ['10 valeurs les moins élevées', 'Mettre en forme les cellules qui se classent parmi les DERNIÈRES :'], top10p: ['10 % les plus élevés', 'PREMIERS (%) :'], bottom10p: ['10 % les moins élevés', 'DERNIERS (%) :'], above: ['Au-dessus de la moyenne', 'Cellules AU-DESSUS de la moyenne'], below: ['En dessous de la moyenne', 'Cellules EN DESSOUS de la moyenne'] }[k];
    if (!T) return;
    let body = '<p>' + esc(T[1]) + '</p>';
    if (k === 'gt' || k === 'lt' || k === 'eq') body += fld('Valeur', inp('cv1', k === 'gt' ? def(avg) : k === 'lt' ? def(avg) : ''));
    else if (k === 'between') body += '<div class="two-col">' + fld('Valeur 1', inp('cv1', nums.length ? def(Math.min(...nums)) : '')) + fld('et', inp('cv2', nums.length ? def(Math.max(...nums)) : '')) + '</div>';
    else if (k === 'text') body += fld('Texte', inp('cv1', ''));
    else if (k === 'date') body += fld('Période', sel('cv1', [['yesterday', 'Hier'], ['today', 'Aujourd\'hui'], ['tomorrow', 'Demain'], ['last7', 'Dans les 7 derniers jours'], ['lastWeek', 'Semaine dernière'], ['thisWeek', 'Cette semaine'], ['nextWeek', 'Semaine prochaine'], ['lastMonth', 'Mois dernier'], ['thisMonth', 'Ce mois-ci'], ['nextMonth', 'Mois prochain'], ['past', 'Date passée'], ['future', 'Date à venir']], 'last7'));
    else if (k === 'dup') body += fld('Valeurs', sel('cv1', [['dup', 'en double'], ['unique', 'uniques']], 'dup'));
    else if (/^(top|bottom)10/.test(k)) body += fld(/p$/.test(k) ? 'Pourcentage' : 'Nombre', num('cv1', 10, 1, 1, 1000));
    body += fmtSel;
    return dlg(T[0], body, async (el, close) => {
      const fmt = await pickFmt(el); if (!fmt) return false;
      let rule;
      const v1 = fIn(val(el, 'cv1')), v2 = fIn(val(el, 'cv2'));
      switch (k) {
        case 'gt': case 'lt': case 'eq': if (v1 == null) { O.toast('Indiquez une valeur', { bad: true }); return false; } rule = { type: 'cellIs', op: k, f1: v1 }; break;
        case 'between': if (v1 == null || v2 == null) { O.toast('Indiquez deux valeurs', { bad: true }); return false; } rule = { type: 'cellIs', op: 'between', f1: v1, f2: v2 }; break;
        case 'text': rule = { type: 'text', op: 'contains', text: val(el, 'cv1') }; break;
        case 'date': rule = { type: 'date', period: val(el, 'cv1') }; break;
        case 'dup': rule = { type: 'dup', unique: val(el, 'cv1') === 'unique' }; break;
        case 'above': rule = { type: 'avg', above: true }; break; case 'below': rule = { type: 'avg', above: false }; break;
        default: rule = { type: 'top', rank: Math.max(1, Math.round(nval(el, 'cv1') || 10)), pct: /p$/.test(k), bottom: /^bottom/.test(k) };
      }
      rule.fmt = fmt; close('ok'); addRule(rule); return false;
    });
  };
  /** nouvelle règle / modifier une règle */
  D.cfRule = function (edit, onDone) {
    if (!A.guard('format')) return;
    const r0 = edit || { type: 'cellIs', op: 'gt' };
    const TYPES = [['cellIs', 'Valeur de la cellule'], ['text', 'Texte spécifique'], ['date', 'Dates'], ['blank', 'Cellules vides'], ['noBlank', 'Cellules non vides'], ['err', 'Erreurs'], ['noErr', 'Sans erreur'], ['top', 'Valeurs les plus élevées / faibles'], ['avg', 'Au-dessus / en dessous de la moyenne'], ['dup', 'Valeurs en double ou uniques'], ['expr', 'Utiliser une formule'], ['colorScale', 'Nuances de couleurs'], ['dataBar', 'Barre de données'], ['iconSet', 'Jeu d\'icônes']];
    let fmt = Object.assign({}, r0.fmt || { bg: '#FFC7CE', fc: '#9C0006' });
    const body = fld('Type de règle', sel('crT', TYPES, r0.type)) + '<div id="crBox"></div>' + fld('S\'applique à', inp('crRg', (r0.ranges || cfRanges()).map((g) => TB.rangeStr(g, true)).join(' '))) + chk('crStop', 'Interrompre si vrai', !!r0.stop);
    const pvHtml = () => '<div class="o-field"><span>Aperçu du format</span><div style="display:flex;gap:8px;align-items:center"><div class="fmt-pv" id="crPv" style="flex:1;margin:0"></div><button type="button" class="o-btn" id="crFmt">Format…</button></div></div>';
    const paintPv = (el) => { const e = $in(el, 'crPv'); if (!e) return; e.textContent = 'AaBbCc 123'; e.style.background = fmt.bg || '#fff'; e.style.color = fmt.fc || '#000'; e.style.fontWeight = fmt.b ? 700 : 400; e.style.fontStyle = fmt.i ? 'italic' : 'normal'; e.style.textDecoration = (fmt.u ? 'underline ' : '') + (fmt.st ? 'line-through' : ''); e.style.border = fmt.bt ? '1px solid ' + fmt.bt.c : '1px solid var(--o-line)'; };
    const cfvoSel = (id, cur, deflt) => sel(id + 't', [['min', 'Valeur la plus faible'], ['max', 'Valeur la plus élevée'], ['num', 'Nombre'], ['percent', 'Pourcentage'], ['percentile', 'Centile'], ['formula', 'Formule']], (cur && cur.t) || deflt) + inp(id + 'v', cur && cur.v != null ? (cur.t === 'formula' ? fOut(cur.v) : String(cur.v).replace('.', TB.loc.dec)) : '', ' placeholder="valeur"');
    const render = (el) => {
      const t = val(el, 'crT'); const b = $in(el, 'crBox'); let h = '';
      const same = t === r0.type;
      if (t === 'cellIs') h = '<div class="three-col">' + fld('Condition', sel('crOp', [['between', 'comprise entre'], ['notBetween', 'non comprise entre'], ['eq', 'égale à'], ['ne', 'différente de'], ['gt', 'supérieure à'], ['lt', 'inférieure à'], ['ge', 'supérieure ou égale à'], ['le', 'inférieure ou égale à']], same ? r0.op : 'gt')) + fld('Valeur', inp('crV1', same ? fOut(r0.f1) : '')) + fld('et', inp('crV2', same ? fOut(r0.f2) : '')) + '</div>' + pvHtml();
      else if (t === 'text') h = '<div class="two-col">' + fld('Condition', sel('crOp', [['contains', 'contenant'], ['notContains', 'ne contenant pas'], ['begins', 'commençant par'], ['ends', 'se terminant par']], same ? r0.op : 'contains')) + fld('Texte', inp('crV1', same ? r0.text : '')) + '</div>' + pvHtml();
      else if (t === 'date') h = fld('Période', sel('crOp', [['yesterday', 'Hier'], ['today', 'Aujourd\'hui'], ['tomorrow', 'Demain'], ['last7', '7 derniers jours'], ['lastWeek', 'Semaine dernière'], ['thisWeek', 'Cette semaine'], ['nextWeek', 'Semaine prochaine'], ['lastMonth', 'Mois dernier'], ['thisMonth', 'Ce mois-ci'], ['nextMonth', 'Mois prochain'], ['past', 'Passée'], ['future', 'À venir']], same ? r0.period : 'today')) + pvHtml();
      else if (t === 'top') h = '<div class="three-col">' + fld('Valeurs', sel('crOp', [['top', 'les plus élevées'], ['bottom', 'les plus faibles']], same && r0.bottom ? 'bottom' : 'top')) + fld('Rang', num('crV1', same ? r0.rank : 10, 1, 1, 1000)) + '<div>' + chk('crPct', '% de la plage', same && r0.pct) + '</div></div>' + pvHtml();
      else if (t === 'avg') h = fld('Valeurs', sel('crOp', [['above', 'au-dessus de la moyenne'], ['below', 'en dessous de la moyenne'], ['ae', 'égales ou au-dessus'], ['be', 'égales ou en dessous']], same ? (r0.above === false ? (r0.equal ? 'be' : 'below') : (r0.equal ? 'ae' : 'above')) : 'above')) + pvHtml();
      else if (t === 'dup') h = fld('Valeurs', sel('crOp', [['dup', 'en double'], ['unique', 'uniques']], same && r0.unique ? 'unique' : 'dup')) + pvHtml();
      else if (t === 'expr') h = fld('Mettre en forme les valeurs pour lesquelles cette formule est vraie', inp('crV1', same ? '=' + fOut(r0.f) : '=')) + '<p class="o-hint">La formule est écrite pour la cellule en haut à gauche de la plage (ex. =$B2>100).</p>' + pvHtml();
      else if (t === 'colorScale') { const p = same ? r0.pts : [{ t: 'min', c: '#F8696B' }, { t: 'percentile', v: 50, c: '#FFEB84' }, { t: 'max', c: '#63BE7B' }]; h = fld('Style', sel('crN', [['2', 'Échelle à deux couleurs'], ['3', 'Échelle à trois couleurs']], String(p.length))) + '<div class="three-col"><div>' + fld('Minimum', cfvoSel('crA', p[0], 'min')) + color('crAc', p[0].c) + '</div><div id="crMid">' + fld('Point milieu', cfvoSel('crB', p.length === 3 ? p[1] : { t: 'percentile', v: 50 }, 'percentile')) + color('crBc', p.length === 3 ? p[1].c : '#FFEB84') + '</div><div>' + fld('Maximum', cfvoSel('crC', p[p.length - 1], 'max')) + color('crCc', p[p.length - 1].c) + '</div></div>'; }
      else if (t === 'dataBar') h = '<div class="two-col">' + fld('Minimum', cfvoSel('crA', same ? r0.min : null, 'min')) + fld('Maximum', cfvoSel('crC', same ? r0.max : null, 'max')) + fld('Couleur', color('crAc', same ? r0.color : '#638EC6')) + fld('Remplissage', sel('crG', [['1', 'Dégradé'], ['0', 'Uni']], same && r0.grad === false ? '0' : '1')) + '</div>' + chk('crOnly', 'Afficher la barre uniquement', same && r0.showValue === false);
      else if (t === 'iconSet') h = fld('Style d\'icône', sel('crIs', Object.keys(TB.CF.ICONS).map((k) => [k, TB.CF.ICON_NAMES[k] || k]), same ? r0.set : '3TrafficLights1')) + chk('crRev', 'Inverser l\'ordre des icônes', same && r0.rev) + chk('crOnly', 'Afficher l\'icône uniquement', same && r0.showValue === false) + '<p class="o-hint">Seuils : répartition égale en pourcentage de la plage.</p>';
      else h = pvHtml();
      b.innerHTML = h; wireColors(b);
      const fb = $in(el, 'crFmt'); if (fb) fb.onclick = async () => { const f = await fmtDialog(fmt); if (f) { fmt = f; paintPv(el); } };
      const n = $in(el, 'crN'); if (n) { const f = () => { $in(el, 'crMid').style.visibility = val(el, 'crN') === '3' ? 'visible' : 'hidden'; }; n.onchange = f; f(); }
      paintPv(el);
    };
    const cfvoOf = (el, id) => { const t = val(el, id + 't'); const o = { t }; const v = String(val(el, id + 'v') || '').trim(); if (t === 'formula') o.v = fIn(v); else if (t !== 'min' && t !== 'max') o.v = nval(el, id + 'v') || 0; return o; };
    return dlg(edit ? 'Modifier la règle de mise en forme' : 'Nouvelle règle de mise en forme', body, (el, close) => {
      const t = val(el, 'crT'); const rule = { type: t, id: r0.id };
      const rr = String(val(el, 'crRg') || '').split(/[\s;]+/).map((x) => TB.parseRange(x.replace(/\$/g, ''))).filter(Boolean); if (!rr.length) { O.toast('Plage incorrecte', { bad: true }); return false; }
      rule.ranges = rr; if (val(el, 'crStop')) rule.stop = true;
      const needFmt = !/^(colorScale|dataBar|iconSet)$/.test(t); if (needFmt) rule.fmt = fmt;
      switch (t) {
        case 'cellIs': rule.op = val(el, 'crOp'); rule.f1 = fIn(val(el, 'crV1')); if (/etween/.test(rule.op)) rule.f2 = fIn(val(el, 'crV2')); if (rule.f1 == null) { O.toast('Indiquez une valeur', { bad: true }); return false; } break;
        case 'text': rule.op = val(el, 'crOp'); rule.text = val(el, 'crV1'); break;
        case 'date': rule.period = val(el, 'crOp'); break;
        case 'top': rule.bottom = val(el, 'crOp') === 'bottom'; rule.rank = Math.max(1, Math.round(nval(el, 'crV1') || 10)); rule.pct = val(el, 'crPct'); break;
        case 'avg': { const o = val(el, 'crOp'); rule.above = o === 'above' || o === 'ae'; rule.equal = o === 'ae' || o === 'be'; break; }
        case 'dup': rule.unique = val(el, 'crOp') === 'unique'; break;
        case 'expr': { const f = String(val(el, 'crV1') || '').replace(/^=/, ''); try { rule.f = P.fromUser(f); } catch (e) { O.toast('Formule incorrecte : ' + e.message, { bad: true }); return false; } break; }
        case 'colorScale': { const n3 = val(el, 'crN') === '3'; rule.pts = [Object.assign(cfvoOf(el, 'crA'), { c: $in(el, 'crAc').dataset.v || '#F8696B' })].concat(n3 ? [Object.assign(cfvoOf(el, 'crB'), { c: $in(el, 'crBc').dataset.v || '#FFEB84' })] : []).concat([Object.assign(cfvoOf(el, 'crC'), { c: $in(el, 'crCc').dataset.v || '#63BE7B' })]); break; }
        case 'dataBar': rule.min = cfvoOf(el, 'crA'); rule.max = cfvoOf(el, 'crC'); rule.color = $in(el, 'crAc').dataset.v || '#638EC6'; rule.grad = val(el, 'crG') === '1'; if (val(el, 'crOnly')) rule.showValue = false; break;
        case 'iconSet': rule.set = val(el, 'crIs'); if (val(el, 'crRev')) rule.rev = true; if (val(el, 'crOnly')) rule.showValue = false; break;
      }
      close('ok');
      if (onDone) onDone(rule); else addRule(rule);
      return false;
    }, { wide: true, onOpen: (el) => { $in(el, 'crT').addEventListener('change', () => render(el)); render(el); } });
  };
  D.cfClear = function (where) {
    if (!A.guard('format')) return;
    const s = sh();
    A.tx('Effacer les règles', () => {
      if (where === 'sheet') { wb().setProp(s, 'cf', []); return; }
      const sel0 = cfRanges(); const out = [];
      s.cf.forEach((rule) => { const rr = []; rule.ranges.forEach((g) => { let parts = [g]; sel0.forEach((x) => { parts = parts.flatMap((p) => TB.subtract ? TB.subtract(p, x) : (TB.intersect(p, x) ? [] : [p])); }); rr.push(...parts); }); if (rr.length) out.push(Object.assign({}, rule, { ranges: rr })); });
      wb().setProp(s, 'cf', out);
    });
    if (TB.CF.invalidate) TB.CF.invalidate(s); G().invalidate();
  };
  D.cfManage = function () {
    const s = sh(); let list = s.cf.map((r) => Object.assign({}, r)); let cur = list.length ? 0 : -1; let scope = 'sel';
    const selG = cfRanges();
    const shown = () => list.map((r, i) => [r, i]).filter(([r]) => scope === 'sheet' || r.ranges.some((g) => selG.some((x) => TB.intersect(g, x))));
    const pv = (r) => { const f = r.fmt || {}; if (r.type === 'colorScale') return '<span style="display:flex;width:100%;height:100%;background:linear-gradient(90deg,' + r.pts.map((p) => p.c).join(',') + ')"></span>'; if (r.type === 'dataBar') return '<span style="display:block;width:70%;height:60%;background:' + r.color + '"></span>'; if (r.type === 'iconSet') return esc((TB.CF.ICON_NAMES[r.set] || r.set).slice(0, 14)); return '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:' + (f.bg || '#fff') + ';color:' + (f.fc || '#000') + ';font-weight:' + (f.b ? 700 : 400) + '">AaBbCc</span>'; };
    const draw = (el) => { const L = shown(); $in(el, 'cmL').innerHTML = L.length ? L.map(([r, i]) => '<div class="cf-it' + (i === cur ? ' on' : '') + '" data-i="' + i + '"><span>' + esc(TB.CF.describe(r)) + '<br><small style="color:var(--o-tx2)">' + esc(r.ranges.map((g) => TB.rangeStr(g, true)).join(' ')) + '</small></span><span class="pv">' + pv(r) + '</span><span>' + (r.stop ? '⏹' : '') + '</span></div>').join('') : '<p class="o-hint">Aucune règle.</p>'; O.$$('.cf-it', el).forEach((x) => x.onclick = () => { cur = +x.dataset.i; draw(el); }); O.$$('.cf-it', el).forEach((x) => x.ondblclick = () => edit(el)); };
    const edit = (el) => { if (cur < 0 || !list[cur]) return; D.cfRule(list[cur], (rule) => { list[cur] = rule; draw(el); }); };
    const body = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + fld('Afficher les règles pour', sel('cmS', [['sel', 'La sélection actuelle'], ['sheet', 'Cette feuille']], 'sel')) + '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="o-btn" id="cmN">' + O.icon('plus') + ' Nouvelle règle</button><button type="button" class="o-btn" id="cmE">' + O.icon('pencil') + ' Modifier</button><button type="button" class="o-btn" id="cmD">' + O.icon('trash-2') + ' Supprimer</button><button type="button" class="o-btn" id="cmU" title="Monter">' + O.icon('arrow-up') + '</button><button type="button" class="o-btn" id="cmW" title="Descendre">' + O.icon('arrow-down') + '</button></div></div><div class="cf-list" id="cmL"></div><p class="o-hint">Les règles s\'appliquent dans l\'ordre de la liste (la première l\'emporte).</p>';
    return dlg('Gestionnaire des règles de mise en forme conditionnelle', body, (el, close) => { close('ok'); A.tx('Règles de mise en forme', () => wb().setProp(s, 'cf', list)); if (TB.CF.invalidate) TB.CF.invalidate(s); G().invalidate(); return false; }, {
      wide: true, onOpen: (el) => {
        $in(el, 'cmS').onchange = () => { scope = val(el, 'cmS'); draw(el); };
        $in(el, 'cmN').onclick = () => D.cfRule(null, (rule) => { rule.id = TB.uid('cf'); list.unshift(rule); cur = 0; draw(el); });
        $in(el, 'cmE').onclick = () => edit(el);
        $in(el, 'cmD').onclick = () => { if (cur >= 0) { list.splice(cur, 1); cur = Math.min(cur, list.length - 1); draw(el); } };
        $in(el, 'cmU').onclick = () => { if (cur > 0) { [list[cur - 1], list[cur]] = [list[cur], list[cur - 1]]; cur--; draw(el); } };
        $in(el, 'cmW').onclick = () => { if (cur >= 0 && cur < list.length - 1) { [list[cur + 1], list[cur]] = [list[cur], list[cur + 1]]; cur++; draw(el); } };
        draw(el);
      }
    });
  };

  /* =====================================================================
     Validation des données
     ===================================================================== */
  D.validation = function () {
    if (!A.guard('format')) return;
    const s = sh(), r = G().sel.r, c = G().sel.c; const d0 = A.dvAt(s, r, c) || { type: 'any', op: 'between' };
    const listTxt = d0.type === 'list' ? (/^=/.test(String(d0.f1)) ? '=' + fOut(String(d0.f1).slice(1)) : String(d0.f1 || '').split(/[;,]/).join(TB.loc.arg === ';' ? ';' : ',')) : '';
    const body = tabs([['opt', 'Options'], ['msg', 'Message de saisie'], ['err', 'Alerte d\'erreur']]) +
      '<div class="dlg-page" data-page="opt"><div class="two-col">' + fld('Autoriser', sel('dvT', [['any', 'Tout'], ['whole', 'Nombre entier'], ['decimal', 'Décimal'], ['list', 'Liste'], ['date', 'Date'], ['time', 'Heure'], ['textLength', 'Longueur du texte'], ['custom', 'Personnalisé']], d0.type)) +
      fld('Données', sel('dvOp', [['between', 'comprise entre'], ['notBetween', 'non comprise entre'], ['eq', 'égale à'], ['ne', 'différente de'], ['gt', 'supérieure à'], ['lt', 'inférieure à'], ['ge', 'supérieure ou égale à'], ['le', 'inférieure ou égale à']], d0.op || 'between')) + '</div>' +
      '<div id="dvL">' + fld('Source (valeurs séparées par « ' + (TB.loc.arg === ';' ? ';' : ',') + ' » ou plage, ex. =$A$1:$A$10)', inp('dvSrc', listTxt)) + chk('dvArrow', 'Liste déroulante dans la cellule', !d0.noArrow) + '</div>' +
      '<div id="dvMM" class="two-col">' + fld('Minimum', inp('dvA', d0.type !== 'list' && d0.f1 != null ? fOut(d0.f1) : '')) + fld('Maximum', inp('dvB', d0.f2 != null ? fOut(d0.f2) : '')) + '</div>' +
      '<div id="dvF">' + fld('Formule', inp('dvFx', d0.type === 'custom' ? '=' + fOut(d0.f1) : '=')) + '</div>' + chk('dvBlank', 'Ignorer si vide', d0.blank !== false) + '</div>' +
      '<div class="dlg-page" data-page="msg" hidden>' + fld('Titre', inp('dvMt', d0.msgTitle || '')) + fld('Message de saisie', '<textarea class="o-in" id="dvM" rows="4">' + esc(d0.msg || '') + '</textarea>') + '</div>' +
      '<div class="dlg-page" data-page="err" hidden>' + fld('Style', sel('dvEs', [['stop', 'Arrêt (refuser la saisie)'], ['warning', 'Avertissement'], ['information', 'Information'], ['none', 'Aucune alerte']], d0.errStyle || 'stop')) + fld('Titre', inp('dvEt', d0.errTitle || '')) + fld('Message d\'erreur', '<textarea class="o-in" id="dvE" rows="4">' + esc(d0.errMsg || '') + '</textarea>') + '</div>';
    const upd = (el) => { const t = val(el, 'dvT'); $in(el, 'dvL').hidden = t !== 'list'; $in(el, 'dvF').hidden = t !== 'custom'; const op = val(el, 'dvOp'); const showOp = !/^(any|list|custom)$/.test(t); $in(el, 'dvOp').closest('.o-field').style.visibility = showOp ? 'visible' : 'hidden'; $in(el, 'dvMM').hidden = !showOp; $in(el, 'dvB').closest('.o-field').hidden = !/etween/.test(op); $in(el, 'dvA').closest('.o-field').querySelector('span').textContent = /etween/.test(op) ? 'Minimum' : 'Valeur'; };
    return dlg('Validation des données', body, (el, close) => {
      const t = val(el, 'dvT'); const ranges = G().sel.ranges.map((g) => A.bounded(g));
      let d = null;
      if (t !== 'any') {
        d = { type: t, ranges };
        if (t === 'list') { const src = String(val(el, 'dvSrc') || '').trim(); if (!src) { O.toast('Indiquez la source de la liste', { bad: true }); return false; } d.f1 = /^=/.test(src) ? '=' + fIn(src) : src.split(TB.loc.arg === ';' ? /;/ : /,/).map((x) => x.trim()).filter(Boolean).join(';'); if (!val(el, 'dvArrow')) d.noArrow = true; }
        else if (t === 'custom') { try { d.f1 = P.fromUser(String(val(el, 'dvFx')).replace(/^=/, '')); } catch (e) { O.toast('Formule incorrecte', { bad: true }); return false; } }
        else { d.op = val(el, 'dvOp'); const cv = (x) => { if (t === 'date') { const p = TB.parseDate(String(x).trim()); if (p) return String(p.v); } if (t === 'time') { const p = TB.parseInput ? TB.parseInput(String(x).trim()) : null; if (p && typeof p.v === 'number') return String(p.v); } return fIn(x); }; d.f1 = cv(val(el, 'dvA')); if (/etween/.test(d.op)) d.f2 = cv(val(el, 'dvB')); if (d.f1 == null || (/etween/.test(d.op) && d.f2 == null)) { O.toast('Indiquez les valeurs limites', { bad: true }); return false; } }
        if (!val(el, 'dvBlank')) d.blank = false;
        if (val(el, 'dvM') || val(el, 'dvMt')) { d.msg = val(el, 'dvM'); d.msgTitle = val(el, 'dvMt'); }
        d.errStyle = val(el, 'dvEs'); if (val(el, 'dvE')) d.errMsg = val(el, 'dvE'); if (val(el, 'dvEt')) d.errTitle = val(el, 'dvEt');
      }
      close('ok');
      A.tx('Validation des données', () => {
        const out = [];
        s.dv.forEach((x) => { const rr = []; x.ranges.forEach((g) => { let parts = [g]; ranges.forEach((y) => { parts = parts.flatMap((p) => TB.subtract ? TB.subtract(p, y) : (TB.intersect(p, y) ? [] : [p])); }); rr.push(...parts); }); if (rr.length) out.push(Object.assign({}, x, { ranges: rr })); });
        if (d) out.push(d);
        wb().setProp(s, 'dv', out);
      });
      G().invalidate();
      return false;
    }, { tabs: true, wide: true, extra: [{ label: 'Tout effacer', left: true, value: null, onClick: (cl) => { cl(null); A.tx('Effacer la validation', () => { const ranges = G().sel.ranges.map((g) => A.bounded(g)); wb().setProp(s, 'dv', s.dv.map((x) => Object.assign({}, x, { ranges: x.ranges.flatMap((g) => { let parts = [g]; ranges.forEach((y) => { parts = parts.flatMap((p) => TB.subtract ? TB.subtract(p, y) : (TB.intersect(p, y) ? [] : [p])); }); return parts; }) })).filter((x) => x.ranges.length)); }); G().invalidate(); } }], onOpen: (el) => { ['dvT', 'dvOp'].forEach((id) => $in(el, id).addEventListener('change', () => upd(el))); upd(el); } });
  };

  /* =====================================================================
     Tri, filtres
     ===================================================================== */
  D.sort = function () {
    if (!A.guard('sort')) return;
    const da = A.dataArea(); if (!da) { O.toast('Sélectionnez une cellule dans les données à trier', { bad: true }); return; }
    const s = sh(); let g = da.g; let header = da.header; let byCols = false;
    let levels = [{ c: Math.max(g.c1, Math.min(g.c2, G().sel.c)), desc: false, by: 'value' }];
    const cols = () => { const L = []; if (byCols) for (let r = g.r1; r <= g.r2; r++) L.push([r, 'Ligne ' + (r + 1) + (header && s.get(r, g.c1) != null ? ' – ' + TB.Fmt.text(s.get(r, g.c1), 'General') : '')]); else for (let c = g.c1; c <= g.c2; c++) L.push([c, colLabel(s, c, header, g.r1)]); return L; };
    const lists = TB.Data.allLists(wb());
    const draw = (el) => {
      $in(el, 'soL').innerHTML = levels.map((l, i) => '<div class="sort-lv" data-i="' + i + '"><b>' + (i ? 'Puis par' : 'Trier par') + '</b>' + sel('soC' + i, cols(), l.c) + sel('soB' + i, [['value', 'Valeurs'], ['bg', 'Couleur de cellule'], ['fc', 'Couleur de police']], l.by || 'value') + sel('soO' + i, [['asc', l.by === 'value' ? 'Croissant (A → Z)' : 'En haut'], ['desc', l.by === 'value' ? 'Décroissant (Z → A)' : 'En bas']].concat(lists.map((x, j) => ['list' + j, x.slice(0, 4).join(', ') + '…'])), l.list != null ? 'list' + l.list : l.desc ? 'desc' : 'asc') + '<button type="button" class="o-btn" data-del="' + i + '" title="Supprimer le niveau">' + O.icon('x') + '</button></div>' + (l.by !== 'value' ? '<div style="margin:-2px 0 6px 40px">Couleur : ' + color('soK' + i, l.color || '#FFFF00', 'Aucune') + '</div>' : '')).join('');
      wireColors(el);
      levels.forEach((l, i) => { ['soC', 'soB', 'soO'].forEach((p) => $in(el, p + i).addEventListener('change', () => { read(el); draw(el); })); });
      O.$$('[data-del]', el).forEach((b) => b.onclick = () => { read(el); levels.splice(+b.dataset.del, 1); if (!levels.length) levels.push({ c: g.c1, desc: false, by: 'value' }); draw(el); });
    };
    const read = (el) => { levels = levels.map((l, i) => { const o = val(el, 'soO' + i); const k = $in(el, 'soK' + i); return { c: +val(el, 'soC' + i), by: val(el, 'soB' + i), desc: o === 'desc', list: /^list/.test(o) ? +o.slice(4) : null, color: k ? (k.dataset.v || null) : l.color }; }); };
    const body = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px"><button type="button" class="o-btn" id="soAdd">' + O.icon('plus') + ' Ajouter un niveau</button>' + chk('soH', 'Mes données ont des en-têtes', header) + chk('soR', 'Trier de gauche à droite', false) + chk('soCase', 'Respecter la casse', false) + '</div><div id="soL"></div><p class="o-hint">Plage : ' + esc(TB.rangeStr(g)) + '</p>';
    return dlg('Trier', body, (el, close) => {
      read(el);
      const keys = levels.map((l) => ({ c: l.c, desc: l.desc, by: l.by, color: l.by === 'value' ? undefined : (l.color || null), list: l.list != null ? lists[l.list] : undefined }));
      close('ok');
      A.tx('Trier', () => TB.Data.sort(wb(), s, g, keys, { header: val(el, 'soH'), byCols, caseSens: val(el, 'soCase') }));
      return false;
    }, { wide: true, onOpen: (el) => { draw(el); $in(el, 'soAdd').onclick = () => { read(el); const used = new Set(levels.map((l) => l.c)); const n = cols().find((x) => !used.has(x[0])); levels.push({ c: n ? n[0] : g.c1, desc: false, by: 'value' }); draw(el); }; $in(el, 'soH').onchange = () => { header = val(el, 'soH'); read(el); draw(el); }; $in(el, 'soR').onchange = () => { byCols = val(el, 'soR'); levels = [{ c: byCols ? g.r1 : g.c1, desc: false, by: 'value' }]; draw(el); }; } });
  };
  const FOPS = [['eq', 'est égal à'], ['ne', 'est différent de'], ['gt', 'est supérieur à'], ['ge', 'est supérieur ou égal à'], ['lt', 'est inférieur à'], ['le', 'est inférieur ou égal à'], ['begins', 'commence par'], ['nbegins', 'ne commence pas par'], ['ends', 'se termine par'], ['nends', 'ne se termine pas par'], ['contains', 'contient'], ['ncontains', 'ne contient pas']];
  D.customFilter = function (fb, kind) {
    const cur = (fb.crit && fb.crit.type === 'custom') ? fb.crit : { op1: kind === 'text' ? 'contains' : 'gt', v1: '', and: true };
    const body = '<p>Afficher les lignes dans lesquelles :</p><div class="two-col">' + fld('', sel('cfo1', FOPS, cur.op1)) + fld('', inp('cfv1', cur.v1)) + '</div><div style="display:flex;gap:14px"><label class="o-check"><input type="radio" name="cfAnd" value="and"' + (cur.and !== false ? ' checked' : '') + '><span>Et</span></label><label class="o-check"><input type="radio" name="cfAnd" value="or"' + (cur.and === false ? ' checked' : '') + '><span>Ou</span></label></div><div class="two-col">' + fld('', sel('cfo2', [['', '(aucune)']].concat(FOPS), cur.op2 || '')) + fld('', inp('cfv2', cur.v2 || '')) + '</div><p class="o-hint">? remplace un caractère, * une suite de caractères.' + (kind === 'date' ? ' Dates au format jj/mm/aaaa.' : '') + '</p>';
    return dlg('Filtre personnalisé', body, (el, close) => { const crit = { type: 'custom', op1: val(el, 'cfo1'), v1: val(el, 'cfv1'), and: (el.querySelector('input[name=cfAnd]:checked') || {}).value !== 'or' }; if (val(el, 'cfo2')) { crit.op2 = val(el, 'cfo2'); crit.v2 = val(el, 'cfv2'); } close('ok'); C.setColumnFilter(fb, crit); return false; });
  };
  D.top10Filter = function (fb) {
    const body = '<div class="three-col">' + fld('Afficher', sel('t1', [['top', 'Les plus grands'], ['bottom', 'Les plus petits']], 'top')) + fld('', num('t2', 10, 1, 1, 500)) + fld('', sel('t3', [['n', 'Éléments'], ['pct', 'Pourcentage']], 'n')) + '</div>';
    return dlg('Les 10 premiers', body, (el, close) => { close('ok'); C.setColumnFilter(fb, { type: 'top', n: Math.max(1, Math.round(nval(el, 't2') || 10)), bottom: val(el, 't1') === 'bottom', pct: val(el, 't3') === 'pct' }); return false; });
  };
  D.advancedFilter = function () {
    const da = A.dataArea(); const g = da ? da.g : A.bounded(G().range());
    const body = chk('afCopy', 'Copier vers un autre emplacement', false) + fld('Plages', inp('afL', TB.rangeStr(g, true))) + fld('Zone de critères (avec la ligne d\'en-têtes)', inp('afC', '')) + fld('Copier dans', inp('afD', '')) + chk('afU', 'Extraction sans doublon', false) + '<p class="o-hint">Critères : une ligne d\'en-têtes identiques à ceux de la liste, puis les conditions (même ligne = ET, lignes différentes = OU), par ex. « >100 », « Dupont », « <>vide ».</p>';
    return dlg('Filtre avancé', body, (el, close) => {
      const L = refIn(val(el, 'afL')), Cr = refIn(val(el, 'afC')); if (!L || !Cr) { O.toast('Indiquez la plage et la zone de critères', { bad: true }); return false; }
      const dest = val(el, 'afCopy') ? refIn(val(el, 'afD')) : null; if (val(el, 'afCopy') && !dest) { O.toast('Indiquez où copier', { bad: true }); return false; }
      close('ok'); let n = 0;
      A.tx('Filtre avancé', () => { n = TB.Data.advancedFilter(wb(), L.sh, L.g, Cr.g, dest ? { r: dest.g.r1, c: dest.g.c1 } : null, val(el, 'afU')); });
      O.toast(n + ' ligne(s) trouvée(s)', { ms: 2000 });
      return false;
    });
  };

  /* =====================================================================
     Outils de données
     ===================================================================== */
  D.removeDuplicates = function () {
    const da = A.dataArea(); if (!da) { O.toast('Sélectionnez les données', { bad: true }); return; }
    const s = sh(), g = da.g; let hdr = da.header;
    const lst = (el) => { $in(el, 'rdL').innerHTML = Array.from({ length: g.c2 - g.c1 + 1 }, (_, i) => chk('rdC' + i, colLabel(s, g.c1 + i, hdr, g.r1), true)).join(''); };
    return dlg('Supprimer les doublons', chk('rdH', 'Mes données ont des en-têtes', hdr) + '<div style="display:flex;gap:6px;margin:4px 0"><button type="button" class="o-btn" id="rdA">Tout sélectionner</button><button type="button" class="o-btn" id="rdN">Tout désélectionner</button></div><div id="rdL" style="max-height:260px;overflow:auto"></div>', (el, close) => {
      const cols = []; for (let i = 0; i <= g.c2 - g.c1; i++) if (val(el, 'rdC' + i)) cols.push(g.c1 + i); if (!cols.length) { O.toast('Choisissez au moins une colonne', { bad: true }); return false; }
      close('ok'); let n = 0; A.tx('Supprimer les doublons', () => { n = TB.Data.removeDuplicates(wb(), s, g, cols, val(el, 'rdH')); });
      O.alert('Supprimer les doublons', '<p>' + (n ? n + ' doublon(s) supprimé(s) ; ' + (g.r2 - g.r1 + 1 - (val(el, 'rdH') ? 1 : 0) - n) + ' valeur(s) unique(s) conservée(s).' : 'Aucun doublon trouvé.') + '</p>');
      return false;
    }, { onOpen: (el) => { lst(el); $in(el, 'rdH').onchange = () => { hdr = val(el, 'rdH'); lst(el); }; $in(el, 'rdA').onclick = () => O.$$('#rdL input', el).forEach((x) => { x.checked = true; }); $in(el, 'rdN').onclick = () => O.$$('#rdL input', el).forEach((x) => { x.checked = false; }); } });
  };
  D.textToColumns = function () {
    const s = sh(), g0 = A.bounded(G().range()); const g = { r1: g0.r1, c1: g0.c1, r2: g0.r2, c2: g0.c1 };
    const sample = []; for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 7); r++) { const v = s.get(r, g.c1); sample.push(v == null ? '' : typeof v === 'string' ? v : wb().displayText(s, r, g.c1)); }
    const body = fld('Type', sel('ttM', [['delim', 'Délimité (caractères séparateurs)'], ['fixed', 'Largeur fixe']], 'delim')) + '<div id="ttDel"><div style="display:flex;gap:10px;flex-wrap:wrap">' + chk('ttTab', 'Tabulation', true) + chk('ttSc', 'Point-virgule', true) + chk('ttCo', 'Virgule', false) + chk('ttSp', 'Espace', false) + '</div><div class="two-col">' + fld('Autre', inp('ttO', '', ' maxlength="3"')) + fld('Identificateur de texte', sel('ttQ', [['"', '"'], ["'", "'"], ['', '(aucun)']], '"')) + '</div>' + chk('ttCons', 'Interpréter des séparateurs identiques consécutifs comme uniques', false) + '</div><div id="ttFix" hidden>' + fld('Positions de coupure (nombre de caractères, séparées par des espaces)', inp('ttW', '10 20')) + '</div><div class="two-col">' + fld('Séparateur décimal', sel('ttDec', [[',', 'Virgule'], ['.', 'Point']], TB.loc.dec)) + fld('Destination', inp('ttD', TB.addr(g.r1, g.c1, true))) + '</div><div class="csv-prev" id="ttPv"></div>';
    const opts = (el) => { const seps = []; if (val(el, 'ttTab')) seps.push('\t'); if (val(el, 'ttSc')) seps.push(';'); if (val(el, 'ttCo')) seps.push(','); if (val(el, 'ttSp')) seps.push(' '); return { mode: val(el, 'ttM'), seps, other: val(el, 'ttO') || '', consecutive: val(el, 'ttCons'), quote: val(el, 'ttQ'), widths: String(val(el, 'ttW') || '').split(/\s+/).map(Number).filter((x) => x > 0).sort((a, b) => a - b), dec: val(el, 'ttDec') }; };
    const pv = (el) => { const o = opts(el); $in(el, 'ttDel').hidden = o.mode !== 'delim'; $in(el, 'ttFix').hidden = o.mode !== 'fixed'; const rows = sample.map((t) => TB.Data.splitText(t, o)); const W = Math.max(1, ...rows.map((r) => r.length)); $in(el, 'ttPv').innerHTML = '<table class="pv-table">' + rows.map((r) => '<tr>' + Array.from({ length: W }, (_, j) => '<td>' + esc(r[j] == null ? '' : r[j]) + '</td>').join('') + '</tr>').join('') + '</table>'; };
    return dlg('Convertir le texte en colonnes', body, (el, close) => { const o = opts(el); const d = refIn(val(el, 'ttD')); o.dest = d ? { r: d.g.r1, c: d.g.c1 } : null; close('ok'); A.tx('Convertir', () => TB.Data.textToColumns(wb(), s, g, o)); return false; }, { wide: true, onOpen: (el) => { O.$$('input,select', el).forEach((i) => { i.addEventListener('input', () => pv(el)); i.addEventListener('change', () => pv(el)); }); pv(el); } });
  };
  D.subtotals = function () {
    const da = A.dataArea(); if (!da) { O.toast('Sélectionnez les données (avec une ligne d\'en-têtes)', { bad: true }); return; }
    const s = sh(), g = da.g;
    const cols = []; for (let c = g.c1; c <= g.c2; c++) cols.push([c, colLabel(s, c, true, g.r1)]);
    const lastNum = (() => { for (let c = g.c2; c >= g.c1; c--) if (typeof s.get(g.r1 + 1, c) === 'number') return c; return g.c2; })();
    const body = fld('À chaque changement de', sel('stB', cols, g.c1)) + fld('Utiliser la fonction', sel('stF', [['9', 'Somme'], ['2', 'Nombre (nombres)'], ['3', 'Nombre'], ['1', 'Moyenne'], ['4', 'Max'], ['5', 'Min'], ['6', 'Produit'], ['7', 'Écart type'], ['10', 'Variance']], '9')) + '<div class="o-field"><span>Ajouter un sous-total à</span><div style="max-height:180px;overflow:auto;border:1px solid var(--o-line);border-radius:6px;padding:4px 8px">' + cols.map(([c, l]) => chk('stC' + c, l, c === lastNum)).join('') + '</div></div>' + chk('stR', 'Remplacer les sous-totaux existants', true) + '<p class="o-hint">Triez d\'abord les données sur la colonne choisie. Un plan est créé : utilisez les boutons 1, 2, 3 à gauche des lignes.</p>';
    return dlg('Sous-total', body, (el, close) => {
      const sel0 = cols.filter(([c]) => val(el, 'stC' + c)).map(([c]) => c); if (!sel0.length) { O.toast('Choisissez au moins une colonne', { bad: true }); return false; }
      close('ok'); A.tx('Sous-totaux', () => { let gg = g; if (val(el, 'stR')) gg = TB.Data.removeSubtotals(wb(), s, g) || g; TB.Data.subtotals(wb(), s, gg, { by: +val(el, 'stB'), fn: +val(el, 'stF'), cols: sel0 }); });
      return false;
    }, { extra: [{ label: 'Supprimer tout', left: true, value: null, onClick: (cl) => { cl(null); A.tx('Supprimer les sous-totaux', () => TB.Data.removeSubtotals(wb(), s, g)); } }] });
  };
  D.goalSeek = function () {
    const r = G().sel.r, c = G().sel.c;
    const body = fld('Cellule à définir', inp('gsA', TB.addr(r, c, true))) + fld('Valeur à atteindre', inp('gsV', '')) + fld('Cellule à modifier', inp('gsB', ''));
    return dlg('Valeur cible', body, async (el, close) => {
      const a = refIn(val(el, 'gsA')), b = refIn(val(el, 'gsB')); const t = TB.parseNum(String(val(el, 'gsV')).trim());
      if (!a || !b || t == null) { O.toast('Indiquez les deux cellules et une valeur numérique', { bad: true }); return false; }
      const res = TB.Data.goalSeek(wb(), a.sh, { r: a.g.r1, c: a.g.c1 }, t, b.sh, { r: b.g.r1, c: b.g.c1 });
      if (res.err && !res.ok && res.x == null) { O.toast(res.err, { bad: true }); return false; }
      close('ok');
      const keep = await O.dialog({ title: 'État de la recherche', body: '<p>' + (res.ok ? 'Une solution a été trouvée' : esc(res.err || 'Pas de solution exacte')) + '.</p><p>Valeur trouvée pour ' + esc(TB.addr(b.g.r1, b.g.c1)) + ' : <b>' + esc(TB.numText(res.x).replace('.', TB.loc.dec)) + '</b></p>', buttons: [{ label: 'Annuler', value: false }, { label: 'OK (garder)', value: true, primary: true }] });
      if (keep) A.tx('Valeur cible', () => wb().setCell(b.sh, b.g.r1, b.g.c1, Object.assign({}, wb().snap(b.sh, b.g.r1, b.g.c1) || {}, { v: res.x, f: undefined })));
      return false;
    });
  };
  D.series = function () {
    const g = A.bounded(G().range());
    const body = '<div class="two-col">' + fld('Série en', sel('seD', [['col', 'Colonnes'], ['row', 'Lignes']], g.r2 - g.r1 >= g.c2 - g.c1 ? 'col' : 'row')) + fld('Type', sel('seT', [['linear', 'Linéaire'], ['growth', 'Géométrique'], ['date', 'Chronologique']], 'linear')) + fld('Unité de temps', sel('seU', [['day', 'Jour'], ['weekday', 'Jour ouvré'], ['month', 'Mois'], ['year', 'Année']], 'day')) + fld('Valeur du pas', num('seS', 1, 1)) + fld('Dernière valeur', inp('seE', '')) + '</div>';
    return dlg('Série de données', body, (el, close) => { close('ok'); const e = String(val(el, 'seE') || '').trim(); A.tx('Série', () => TB.Data.series(wb(), sh(), g, { dir: val(el, 'seD'), type: val(el, 'seT'), unit: val(el, 'seU'), step: nval(el, 'seS') || 1, stop: e ? (TB.parseNum(e) != null ? TB.parseNum(e) : (TB.parseDate(e) || {}).v) : null })); return false; });
  };
  D.afterCsvInto = function (res) {
    if (!res || !res.text) return;
    const tmp = TB.IO.csvBuild(res.text, Object.assign({}, res.o, { header: false }));
    const src = tmp.wb.sheets[0], e = src.extent(); const s = sh(); const r0 = G().sel.r, c0 = G().sel.c;
    const list = []; for (let r = 0; r <= e.r; r++) for (let c = 0; c <= e.c; c++) { const v = src.get(r, c); if (v === null) continue; const st = tmp.wb.styles.get(src.styleAt(r, c)); const o = { v }; if (st.nf) o.s = wb().styles.with(s.styleAt(r0 + r, c0 + c), { nf: st.nf }); list.push([r0 + r, c0 + c, o]); }
    A.tx('Importer un fichier texte', () => wb().setCells(s, list));
    G().setRange({ r1: r0, c1: c0, r2: r0 + Math.max(0, e.r), c2: c0 + Math.max(0, e.c) });
    O.toast((e.r + 1) + ' ligne(s) importée(s)', { ms: 2000 });
  };

  /* =====================================================================
     Tableau croisé dynamique
     ===================================================================== */
  D.pivot = function (existing) {
    const s = sh();
    let p = existing || (s.pivots || []).find((x) => x.range && TB.inRange(x.range, G().sel.r, G().sel.c));
    let srcRef = p ? p.src : null;
    if (!srcRef) { const da = A.dataArea(); if (!da) { O.toast('Sélectionnez une cellule dans les données (avec en-têtes)', { bad: true }); return; } srcRef = TB.quoteSheet(s.name) + '!' + TB.rangeStr(da.g, true); }
    let cfg = p ? TB.deepClone(p.cfg) : { rows: [], cols: [], vals: [], filters: [], groups: {} };
    const body = '<div class="two-col">' + fld('Source', inp('pvS', srcRef)) + fld('Emplacement', sel('pvW', [['new', 'Nouvelle feuille'], ['here', 'Feuille existante (cellule ci-dessous)']], p ? 'here' : 'new')) + '</div>' + fld('Cellule de destination', inp('pvA', p ? TB.quoteSheet(s.name) + '!' + TB.addr(p.anchor.r, p.anchor.c, true) : '')) +
      '<div class="two-col" style="grid-template-columns:1fr 2fr;gap:12px"><div class="o-field"><span>Champs</span><div id="pvF" class="fmt-cats" style="max-height:330px"></div></div><div><div class="two-col"><div class="o-field"><span>Filtres</span><div class="cf-list" id="pvZf" style="min-height:60px"></div></div><div class="o-field"><span>Colonnes</span><div class="cf-list" id="pvZc" style="min-height:60px"></div></div><div class="o-field"><span>Lignes</span><div class="cf-list" id="pvZr" style="min-height:60px"></div></div><div class="o-field"><span>Valeurs</span><div class="cf-list" id="pvZv" style="min-height:60px"></div></div></div></div></div><div class="csv-prev" id="pvPv" style="max-height:200px"></div>';
    let src = null;
    const loadSrc = (el) => { src = TB.Pivot.source(wb(), String(val(el, 'pvS')).replace(/^=/, '')); if (!src) { $in(el, 'pvF').innerHTML = '<p class="o-hint">Source incorrecte.</p>'; return; } $in(el, 'pvF').innerHTML = src.fields.map((f, i) => '<button type="button" data-f="' + i + '">' + esc(f) + '</button>').join(''); O.$$('#pvF button', el).forEach((b) => b.onclick = () => fieldMenu(el, +b.dataset.f, b)); draw(el); };
    const fieldMenu = (el, f, at) => {
      const isNum = src.rows.some((r) => typeof r[f] === 'number');
      O.menu(at, [{ label: 'Ajouter aux lignes', icon: 'rows-3', on: () => { cfg.rows.push(f); draw(el); } }, { label: 'Ajouter aux colonnes', icon: 'columns-3', on: () => { cfg.cols.push(f); draw(el); } }, { label: 'Ajouter aux valeurs', icon: 'sigma', on: () => { cfg.vals.push({ f, agg: isNum ? 'sum' : 'count' }); draw(el); } }, { label: 'Ajouter aux filtres', icon: 'filter', on: () => { cfg.filters.push({ f, vals: [] }); draw(el); } }]);
    };
    const chip = (zone, i, label, extra) => '<div class="cf-it" data-z="' + zone + '" data-i="' + i + '"><span>' + esc(label) + '</span><span>' + (extra || '') + '</span><button type="button" class="o-btn" data-x="1" title="Retirer">' + O.icon('x') + '</button></div>';
    const draw = (el) => {
      if (!src) return; const F = src.fields;
      $in(el, 'pvZr').innerHTML = cfg.rows.map((f, i) => chip('rows', i, F[f], src.rows.some((r) => typeof r[f] === 'number' && r[f] > 20000 && r[f] < 80000) ? sel('pvG' + f, [['', 'Dates'], ['year', 'Années'], ['quarter', 'Trimestres'], ['month', 'Mois']], cfg.groups[f] || '') : '')).join('');
      $in(el, 'pvZc').innerHTML = cfg.cols.map((f, i) => chip('cols', i, F[f])).join('');
      $in(el, 'pvZv').innerHTML = cfg.vals.map((v, i) => chip('vals', i, F[v.f], sel('pvA' + i, TB.Pivot.AGGS, v.agg) + sel('pvS' + i, TB.Pivot.SHOWS, v.show || 'normal'))).join('');
      $in(el, 'pvZf').innerHTML = cfg.filters.map((x, i) => chip('filters', i, F[x.f], '<button type="button" class="o-btn" data-fv="' + i + '">' + O.icon('filter') + (x.vals.length ? ' (' + x.vals.length + ')' : '') + '</button>')).join('');
      O.$$('[data-x]', el).forEach((b) => b.onclick = () => { const it = b.closest('.cf-it'); cfg[it.dataset.z].splice(+it.dataset.i, 1); draw(el); });
      O.$$('[id^=pvA],[id^=pvS]', el).forEach((x) => { if (x.id === 'pvA' || x.id === 'pvS') return; x.onchange = () => { const i = +x.id.slice(3); if (x.id.startsWith('pvA')) cfg.vals[i].agg = x.value; else cfg.vals[i].show = x.value; preview(el); }; });
      O.$$('[id^=pvG]', el).forEach((x) => x.onchange = () => { const f = +x.id.slice(3); if (x.value) cfg.groups[f] = x.value; else delete cfg.groups[f]; preview(el); });
      O.$$('[data-fv]', el).forEach((b) => b.onclick = () => filterVals(el, +b.dataset.fv, b));
      preview(el);
    };
    const filterVals = (el, i, at) => {
      const x = cfg.filters[i]; const seen = new Map(); src.rows.forEach((r) => { const v = r[x.f]; const k = v === null || v === '' ? '\u0000(vide)' : typeof v === 'string' ? 's' + v.toLowerCase() : (typeof v === 'number' ? 'n' : typeof v) + String(v); if (!seen.has(k)) seen.set(k, v === null || v === '' ? '(vide)' : TB.Fmt.text(v, src.fmts[x.f])); });
      const node = O.h('div', { cls: 'af-pop' }); node.innerHTML = '<div style="max-height:260px;overflow:auto;padding:6px">' + Array.from(seen).map(([k, l], j) => '<label class="o-check"><input type="checkbox" data-k="' + j + '"' + (x.vals.includes(k) ? '' : ' checked') + '><span>' + esc(l) + '</span></label>').join('') + '</div><div style="display:flex;justify-content:flex-end;padding:6px"><button type="button" class="o-btn pri">OK</button></div>';
      const keys = Array.from(seen.keys());
      O.menu(at, [{ html: '', node }], { keep: true });
      node.querySelector('.pri').onclick = () => { x.vals = keys.filter((k, j) => !node.querySelector('[data-k="' + j + '"]').checked); O.closeMenu(); draw(el); };
    };
    const preview = (el) => { if (!src) return; try { const res = TB.Pivot.compute(src, cfg); $in(el, 'pvPv').innerHTML = '<table class="pv-table">' + res.grid.slice(0, 30).map((row) => '<tr>' + row.map((c) => '<td' + (c && (c.k === 'h' || c.k === 'ch' || c.k === 'gt' || c.b) ? ' style="font-weight:700"' : '') + '>' + esc(c && c.v != null ? (typeof c.v === 'number' ? TB.Fmt.text(c.v, c.pct ? '0.00%' : '#,##0.##') : String(c.v)) : '') + '</td>').join('') + '</tr>').join('') + '</table>'; } catch (e) { $in(el, 'pvPv').textContent = e.message; } };
    return dlg(p ? 'Modifier le tableau croisé dynamique' : 'Tableau croisé dynamique', body, (el, close) => {
      if (!src) return false; if (!cfg.rows.length && !cfg.cols.length && !cfg.vals.length) { O.toast('Ajoutez au moins un champ (cliquez sur un nom de champ)', { bad: true }); return false; }
      const srcTxt = String(val(el, 'pvS')).replace(/^=/, '');
      let target, anchor;
      if (val(el, 'pvW') === 'here') { const a = refIn(val(el, 'pvA')); if (!a) { O.toast('Indiquez la cellule de destination', { bad: true }); return false; } target = a.sh; anchor = { r: a.g.r1, c: a.g.c1 }; }
      close('ok');
      A.tx('Tableau croisé dynamique', () => {
        if (!target) { target = wb().addSheet(wb().copyName ? wb().copyName('TCD').replace(' (2)', '') : 'TCD', wb().sheets.indexOf(s)); anchor = { r: 2, c: 0 }; }
        const res = TB.Pivot.compute(TB.Pivot.source(wb(), srcTxt), cfg);
        const old = p && p.anchor && target === s ? p.range : null;
        const range = TB.Pivot.write(wb(), target, anchor, res, old);
        const list = (target.pivots || []).filter((x) => x !== p).concat([{ src: srcTxt, cfg, anchor, range }]);
        wb().setProp(target, 'pivots', list);
      });
      A.showSheet(target); G().select(anchor.r, anchor.c);
      O.toast('Tableau croisé créé. Données › Actualiser tout le met à jour.', { ms: 2600 });
      return false;
    }, { wide: true, onOpen: (el) => { loadSrc(el); $in(el, 'pvS').addEventListener('change', () => { loadSrc(el); }); const w = () => { $in(el, 'pvA').closest('.o-field').hidden = val(el, 'pvW') !== 'here'; }; $in(el, 'pvW').onchange = w; w(); } });
  };

  /* =====================================================================
     Noms
     ===================================================================== */
  D.names = function () {
    let list = wb().names.map((n) => Object.assign({}, n)); let cur = list.length ? 0 : -1;
    const tbls = []; wb().sheets.forEach((s) => s.tables.forEach((t) => tbls.push({ n: t.name, ref: TB.quoteSheet(s.name) + '!' + TB.rangeStr(t, true), table: true })));
    const draw = (el) => { $in(el, 'nmL').innerHTML = '<table class="pv-table"><tr><th>Nom</th><th>Valeur</th><th>Fait référence à</th><th>Étendue</th><th>Commentaire</th></tr>' + list.map((n, i) => { let v = ''; try { const x = TB.CF.evalF({ wb: wb(), sh: sh() }, n.f, 0, 0, null); v = x instanceof TB.Ref ? (x.single && x.single() ? TB.Fmt.text(x.value ? x.value() : '', 'General') : '{…}') : x instanceof TB.Err ? TB.errText(x) : TB.Fmt.text(x, 'General'); } catch (e) { v = ''; } return '<tr data-i="' + i + '" style="cursor:pointer' + (i === cur ? ';background:var(--o-acc-soft)' : '') + '"><td>' + esc(n.n) + '</td><td>' + esc(v) + '</td><td>=' + esc(fOut(n.f)) + '</td><td>' + esc(n.sh || 'Classeur') + '</td><td>' + esc(n.cm || '') + '</td></tr>'; }).join('') + tbls.map((t) => '<tr style="color:var(--o-tx2)"><td>' + esc(t.n) + '</td><td></td><td>=' + esc(t.ref) + '</td><td>Tableau</td><td></td></tr>').join('') + '</table>'; O.$$('#nmL tr[data-i]', el).forEach((tr) => tr.onclick = () => { cur = +tr.dataset.i; draw(el); }); };
    const edit = async (el, n) => {
      const r = await O.form(n ? 'Modifier le nom' : 'Nouveau nom', [{ id: 'n', label: 'Nom', value: n ? n.n : '' }, { id: 'sc', label: 'Étendue', type: 'select', value: n && n.sh ? n.sh : '', options: [['', 'Classeur']].concat(wb().sheets.map((s) => [s.name, s.name])) }, { id: 'cm', label: 'Commentaire', value: n ? n.cm || '' : '' }, { id: 'f', label: 'Fait référence à', value: n ? '=' + fOut(n.f) : '=' + TB.quoteSheet(sh().name) + '!' + selRef(true) }], { validate: (x) => !/^[A-Za-zÀ-ÿ_\\][\w.À-ÿ]*$/.test(x.n) || TB.parseAddr(x.n) || /^[rRcC]$/.test(x.n) ? 'Nom incorrect (lettre ou _ au début, pas d\'espace, pas une adresse de cellule)' : list.some((y) => y !== n && y.n.toLowerCase() === x.n.toLowerCase() && (y.sh || '') === x.sc) ? 'Ce nom existe déjà' : null });
      if (!r) return; let f; try { f = P.fromUser(String(r.f).replace(/^=/, '')); } catch (e) { O.toast('Référence incorrecte', { bad: true }); return; }
      const o = { n: r.n, f, sh: r.sc || null, cm: r.cm || '' }; if (n) list[list.indexOf(n)] = o; else { list.push(o); cur = list.length - 1; } draw(el);
    };
    return dlg('Gestionnaire de noms', '<div style="display:flex;gap:6px;margin-bottom:6px"><button type="button" class="o-btn" id="nmN">' + O.icon('plus') + ' Nouveau…</button><button type="button" class="o-btn" id="nmE">' + O.icon('pencil') + ' Modifier…</button><button type="button" class="o-btn" id="nmD">' + O.icon('trash-2') + ' Supprimer</button></div><div id="nmL" class="csv-prev" style="max-height:320px"></div>', (el, close) => { close('ok'); A.tx('Noms', () => wb().setProp(wb(), 'names', list)); wb()._nameAst = null; C.recalc && wb().recalcAll(); A.changed(); return false; }, { wide: true, ok: 'Fermer', onOpen: (el) => { draw(el); $in(el, 'nmN').onclick = () => edit(el, null); $in(el, 'nmE').onclick = () => { if (list[cur]) edit(el, list[cur]); }; $in(el, 'nmD').onclick = () => { if (list[cur]) { list.splice(cur, 1); cur = Math.min(cur, list.length - 1); draw(el); } }; } });
  };
  D.namesFromSel = function () {
    const g = A.bounded(G().range()); const s = sh();
    const body = '<p>Créer des noms à partir des valeurs de :</p>' + chk('nsT', 'Ligne du haut', true) + chk('nsL', 'Colonne de gauche', g.c2 > g.c1 && g.r2 === g.r1) + chk('nsB', 'Ligne du bas', false) + chk('nsR', 'Colonne de droite', false);
    return dlg('Créer des noms à partir de la sélection', body, (el, close) => {
      const out = []; const clean = (v) => String(v).trim().replace(/\s+/g, '_').replace(/[^\wÀ-ÿ.]/g, '').replace(/^(\d)/, '_$1');
      const add = (name, g2) => { if (!name || TB.parseAddr(name)) return; out.push({ n: name, f: TB.quoteSheet(s.name) + '!' + TB.rangeStr(g2, true), sh: null, cm: '' }); };
      const T = val(el, 'nsT'), L = val(el, 'nsL'), B = val(el, 'nsB'), R = val(el, 'nsR');
      const r1 = g.r1 + (T ? 1 : 0), r2 = g.r2 - (B ? 1 : 0), c1 = g.c1 + (L ? 1 : 0), c2 = g.c2 - (R ? 1 : 0);
      if (T) for (let c = c1; c <= c2; c++) add(clean(s.get(g.r1, c) || ''), { r1, c1: c, r2, c2: c });
      if (B) for (let c = c1; c <= c2; c++) add(clean(s.get(g.r2, c) || ''), { r1, c1: c, r2, c2: c });
      if (L) for (let r = r1; r <= r2; r++) add(clean(s.get(r, g.c1) || ''), { r1: r, c1, r2: r, c2 });
      if (R) for (let r = r1; r <= r2; r++) add(clean(s.get(r, g.c2) || ''), { r1: r, c1, r2: r, c2 });
      close('ok'); const ex = new Set(wb().names.map((n) => n.n.toLowerCase())); const nw = out.filter((n) => !ex.has(n.n.toLowerCase()));
      A.tx('Créer des noms', () => wb().setProp(wb(), 'names', wb().names.concat(nw))); wb()._nameAst = null; O.toast(nw.length + ' nom(s) créé(s)', { ms: 1800 });
      return false;
    });
  };

  /* =====================================================================
     Mise en page, impression
     ===================================================================== */
  D.pageSetup = function (start) {
    const s = sh(); const pz = Object.assign({}, s.print || {}); const m = Object.assign({ t: 1.9, b: 1.9, l: 1.8, r: 1.8, h: 0.8, f: 0.8 }, pz.margins || {});
    const hf = (o) => Object.assign({ l: '', c: '', r: '' }, o || {});
    const H = hf(pz.header), F = hf(pz.footer);
    const presets = [['', '(aucun)'], ['Page &P', 'Page 1'], ['Page &P sur &N', 'Page 1 sur ?'], ['&A', 'Nom de la feuille'], ['&F', 'Nom du fichier'], ['&D', 'Date'], ['&F – &A', 'Fichier – feuille']];
    const body = tabs([['page', 'Page'], ['margins', 'Marges'], ['hf', 'En-tête / Pied de page'], ['sheet', 'Feuille']]) +
      '<div class="dlg-page" data-page="page"><div class="two-col">' + fld('Orientation', sel('psO', [['portrait', 'Portrait'], ['landscape', 'Paysage']], pz.orient || 'portrait')) + fld('Format du papier', sel('psP', [['A4', 'A4 (21 × 29,7 cm)'], ['A3', 'A3'], ['A5', 'A5'], ['Letter', 'Lettre US'], ['Legal', 'Légal US']], pz.paper || 'A4')) + '</div>' +
      '<div class="o-field"><span>Échelle</span><label class="o-check"><input type="radio" name="psK" value="scale"' + (pz.fitW == null && pz.fitH == null ? ' checked' : '') + '><span>Réduire / agrandir à</span>' + num('psS', pz.scale || 100, 5, 10, 400) + '<span>% de la taille normale</span></label><label class="o-check"><input type="radio" name="psK" value="fit"' + (pz.fitW != null || pz.fitH != null ? ' checked' : '') + '><span>Ajuster à</span>' + num('psW', pz.fitW == null ? 1 : pz.fitW, 1, 0, 50) + '<span>page(s) en largeur sur</span>' + num('psH', pz.fitH == null ? (pz.fitW != null ? 0 : 1) : pz.fitH, 1, 0, 50) + '<span>en hauteur (0 = automatique)</span></label></div></div>' +
      '<div class="dlg-page" data-page="margins" hidden><div class="three-col">' + fld('Haut (cm)', num('pmT', m.t, 0.1, 0)) + fld('En-tête (cm)', num('pmH', m.h, 0.1, 0)) + fld('Bas (cm)', num('pmB', m.b, 0.1, 0)) + fld('Gauche (cm)', num('pmL', m.l, 0.1, 0)) + fld('Pied de page (cm)', num('pmF', m.f, 0.1, 0)) + fld('Droite (cm)', num('pmR', m.r, 0.1, 0)) + '</div>' + chk('pmCH', 'Centrer horizontalement', pz.center && pz.center.h) + chk('pmCV', 'Centrer verticalement', pz.center && pz.center.v) + '</div>' +
      '<div class="dlg-page" data-page="hf" hidden><div class="dlg-sec">En-tête</div><div class="three-col">' + fld('Gauche', inp('phL', H.l)) + fld('Centre', inp('phC', H.c)) + fld('Droite', inp('phR', H.r)) + '</div>' + fld('Modèle', sel('phP', presets, '')) + '<div class="dlg-sec">Pied de page</div><div class="three-col">' + fld('Gauche', inp('pfL', F.l)) + fld('Centre', inp('pfC', F.c)) + fld('Droite', inp('pfR', F.r)) + '</div>' + fld('Modèle', sel('pfP', presets, '')) + '<p class="o-hint">Codes : &amp;P page · &amp;N nombre de pages · &amp;D date · &amp;T heure · &amp;F fichier · &amp;A feuille</p></div>' +
      '<div class="dlg-page" data-page="sheet" hidden>' + fld('Zone d\'impression', inp('pzA', pz.area || '', ' placeholder="ex. A1:H40 (vide : toute la feuille)"')) + '<div class="two-col">' + fld('Lignes à répéter en haut', inp('pzR', pz.titles && pz.titles.rows || '', ' placeholder="ex. 1:2"')) + fld('Colonnes à répéter à gauche', inp('pzC', pz.titles && pz.titles.cols || '', ' placeholder="ex. A:B"')) + '</div>' + chk('pzG', 'Quadrillage', !!pz.grid) + chk('pzE', 'En-têtes de lignes et de colonnes', !!pz.heads) + fld('Ordre des pages', sel('pzO', [['down', 'Vers le bas, puis à droite'], ['over', 'À droite, puis vers le bas']], pz.order || 'down')) + '</div>';
    return dlg('Mise en page', body, (el, close) => {
      const o = { orient: val(el, 'psO'), paper: val(el, 'psP') };
      if ((el.querySelector('input[name=psK]:checked') || {}).value === 'fit') { o.fitW = Math.max(0, Math.round(nval(el, 'psW') || 0)); o.fitH = Math.max(0, Math.round(nval(el, 'psH') || 0)); if (!o.fitW) o.fitW = 0; o.scale = null; } else { o.scale = Math.max(10, Math.min(400, Math.round(nval(el, 'psS') || 100))); o.fitW = null; o.fitH = null; }
      o.margins = { t: nval(el, 'pmT') || 0, b: nval(el, 'pmB') || 0, l: nval(el, 'pmL') || 0, r: nval(el, 'pmR') || 0, h: nval(el, 'pmH') || 0, f: nval(el, 'pmF') || 0 };
      o.center = val(el, 'pmCH') || val(el, 'pmCV') ? { h: val(el, 'pmCH'), v: val(el, 'pmCV') } : null;
      o.header = { l: val(el, 'phL'), c: val(el, 'phC'), r: val(el, 'phR') }; o.footer = { l: val(el, 'pfL'), c: val(el, 'pfC'), r: val(el, 'pfR') };
      const area = String(val(el, 'pzA') || '').trim().replace(/\$/g, ''); if (area && !TB.parseRange(area)) { O.toast('Zone d\'impression incorrecte', { bad: true }); return false; }
      o.area = area || null; const tr = String(val(el, 'pzR') || '').trim(), tc = String(val(el, 'pzC') || '').trim(); o.titles = tr || tc ? { rows: tr.replace(/\$/g, ''), cols: tc.replace(/\$/g, '') } : null;
      o.grid = val(el, 'pzG') || null; o.heads = val(el, 'pzE') || null; o.order = val(el, 'pzO') === 'over' ? 'over' : null;
      close('ok'); C.printSet(o); G().invalidate(); return false;
    }, { tabs: true, start: start || 'page', wide: true, extra: [{ label: 'Aperçu…', left: true, value: null, onClick: (cl, w) => { cl(null); A.openBackstage('print'); } }], onOpen: (el) => { [['phP', 'phC'], ['pfP', 'pfC']].forEach(([a, b]) => { $in(el, a).onchange = () => { if ($in(el, a).value) $in(el, b).value = $in(el, a).value; }; }); } });
  };
  /** volet « Imprimer » du menu Fichier : réglages + aperçu des pages */
  D.printPane = function (body) {
    const s = sh(); const pz = s.print || {};
    const box = O.h('div', { cls: 'pr-pane' });
    box.innerHTML = '<div class="pr-set" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:10px">' +
      '<button type="button" class="o-btn pri" id="prGo">' + O.icon('printer') + ' Imprimer</button><button type="button" class="o-btn" id="prPdf">' + O.icon('file-down') + ' Enregistrer en PDF</button>' +
      fld('Quoi', sel('prW', [['active', 'Feuille active'], ['all', 'Tout le classeur'], ['selection', 'Sélection']], 'active'), true) + fld('Orientation', sel('prO', [['portrait', 'Portrait'], ['landscape', 'Paysage']], pz.orient || 'portrait'), true) +
      fld('Échelle', sel('prK', [['none', 'Taille réelle'], ['sheet', 'Ajuster la feuille sur une page'], ['cols', 'Ajuster toutes les colonnes sur une page'], ['rows', 'Ajuster toutes les lignes sur une page']], pz.fitW === 1 && pz.fitH === 1 ? 'sheet' : pz.fitW === 1 ? 'cols' : pz.fitH === 1 ? 'rows' : 'none'), true) +
      '<button type="button" class="o-btn" id="prSet">' + O.icon('settings-2') + ' Mise en page…</button></div><div class="pr-nav"><button type="button" class="o-btn" id="prPrev">' + O.icon('chevron-left') + '</button><span id="prN"></span><button type="button" class="o-btn" id="prNext">' + O.icon('chevron-right') + '</button></div><div id="prView" style="display:flex;justify-content:center;padding:10px;background:var(--o-bg3);border-radius:8px;min-height:300px;overflow:auto"></div>';
    body.appendChild(box);
    let page = 0, doc = null, task = 0;
    const opts = () => ({ sheets: val(box, 'prW'), range: val(box, 'prW') === 'selection' ? A.bounded(G().range()) : null });
    const applyQuick = () => { const k = val(box, 'prK'); const patch = { orient: val(box, 'prO') }; if (k === 'sheet') Object.assign(patch, { fitW: 1, fitH: 1, scale: null }); else if (k === 'cols') Object.assign(patch, { fitW: 1, fitH: 0, scale: null }); else if (k === 'rows') Object.assign(patch, { fitW: 0, fitH: 1, scale: null }); else Object.assign(patch, { fitW: null, fitH: null }); C.printSet(patch); render(); };
    const render = async () => {
      const my = ++task; $in(box, 'prView').innerHTML = '<p class="o-hint">Préparation de l\'aperçu…</p>';
      try {
        const blob = await TB.Pdf.export(wb(), opts()); if (my !== task) return;
        if (!window.pdfjsLib) { try { await O.loadScript(O.vendor + 'pdf.min.js'); window.pdfjsLib.GlobalWorkerOptions.workerSrc = O.vendor + 'pdf.worker.min.js'; } catch (e) { /* aperçu sans pdf.js */ } }
        if (window.pdfjsLib) { doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; page = Math.min(page, doc.numPages - 1); show(); }
        else { const u = URL.createObjectURL(blob); $in(box, 'prView').innerHTML = '<iframe src="' + u + '" style="width:100%;height:70vh;border:0"></iframe>'; $in(box, 'prN').textContent = ''; }
      } catch (e) { console.error(e); $in(box, 'prView').innerHTML = '<p class="o-hint">Aperçu impossible : ' + esc(e.message) + '</p>'; }
    };
    const show = async () => { if (!doc) return; const pg = await doc.getPage(page + 1); const vp = pg.getViewport({ scale: 1 }); const k = Math.min(1.4, Math.max(0.4, (box.clientWidth - 40) / vp.width)); const v2 = pg.getViewport({ scale: k * (window.devicePixelRatio || 1) }); const c = document.createElement('canvas'); c.width = v2.width; c.height = v2.height; c.style.width = (vp.width * k) + 'px'; c.style.boxShadow = '0 2px 10px rgba(0,0,0,.25)'; c.style.background = '#fff'; await pg.render({ canvasContext: c.getContext('2d'), viewport: v2 }).promise; const v = $in(box, 'prView'); v.innerHTML = ''; v.appendChild(c); $in(box, 'prN').textContent = 'Page ' + (page + 1) + ' sur ' + doc.numPages; };
    $in(box, 'prPrev').onclick = () => { if (page > 0) { page--; show(); } };
    $in(box, 'prNext').onclick = () => { if (doc && page < doc.numPages - 1) { page++; show(); } };
    $in(box, 'prGo').onclick = () => { A.closeBackstage && A.closeBackstage(); C.print(opts()); };
    $in(box, 'prPdf').onclick = () => C.exportAs('pdf', opts());
    $in(box, 'prSet').onclick = () => { A.closeBackstage && A.closeBackstage(); D.pageSetup(); };
    ['prO', 'prK'].forEach((id) => $in(box, id).onchange = applyQuick);
    $in(box, 'prW').onchange = () => { page = 0; render(); };
    render();
  };

  /* =====================================================================
     Fonctions
     ===================================================================== */
  D.insertFunction = function (canon, help) {
    const cats = [['all', 'Toutes'], ['recent', 'Récemment utilisées']].concat(TB.FN_CATS || []);
    let recent = []; try { recent = JSON.parse(localStorage.getItem('tableur:fnRecentes') || '[]'); } catch (e) { }
    if (canon && !help) return argsDialog(canon);
    const body = '<div class="two-col">' + fld('Rechercher une fonction', inp('ifQ', '', ' placeholder="ex. somme, recherche, date…" autofocus')) + fld('Catégorie', sel('ifC', cats, recent.length ? 'recent' : 'all')) + '</div><div class="fmt-list" id="ifL" style="max-height:220px;font-family:inherit"></div><div id="ifH" class="o-hint" style="min-height:60px;margin-top:8px"></div>';
    let cur = canon || null;
    const list = (el) => {
      const q = TB.norm(val(el, 'ifQ')); const c = val(el, 'ifC');
      let L = c === 'recent' && !q ? recent.filter((n) => TB.FN[n]) : TB.fnList().filter((n) => c === 'all' || c === 'recent' || (TB.FN[n].cat || 'math') === c);
      if (q) L = L.filter((n) => TB.norm(P.displayFn(n, TB.loc.fn)).includes(q) || TB.norm(n).includes(q) || TB.norm((TB.FN_INFO[n] || {}).desc || '').includes(q));
      $in(el, 'ifL').innerHTML = L.slice(0, 400).map((n) => '<button type="button" data-n="' + n + '"' + (n === cur ? ' class="on"' : '') + '><b>' + esc(P.displayFn(n, TB.loc.fn)) + '</b></button>').join('') || '<p class="o-hint" style="padding:6px">Aucune fonction.</p>';
      O.$$('#ifL button', el).forEach((b) => { b.onclick = () => { cur = b.dataset.n; O.$$('#ifL button', el).forEach((x) => x.classList.toggle('on', x === b)); info(el); }; b.ondblclick = () => { cur = b.dataset.n; el.querySelector('.o-dlg-ft .pri').click(); }; });
      if (!cur && L.length) cur = L[0]; info(el);
    };
    const info = (el) => { if (!cur) { $in(el, 'ifH').innerHTML = ''; return; } const I = TB.FN_INFO[cur] || {}; const args = TB.fnArgs ? TB.fnArgs(cur) : (I.args || []); $in(el, 'ifH').innerHTML = '<b style="font-family:Consolas,monospace">' + esc(P.displayFn(cur, TB.loc.fn)) + '(' + esc((args || []).join(TB.loc.arg + ' ')) + ')</b><br>' + esc(I.desc || 'Fonction compatible avec les tableurs courants.') + (TB.FN[cur] && TB.FN[cur].fr ? '<br><small>Nom anglais : ' + esc(cur) + '</small>' : ''); };
    return dlg('Insérer une fonction', body, (el, close) => { if (!cur) return false; close('ok'); try { recent = [cur].concat(recent.filter((x) => x !== cur)).slice(0, 12); localStorage.setItem('tableur:fnRecentes', JSON.stringify(recent)); } catch (e) { } setTimeout(() => argsDialog(cur), 0); return false; }, { wide: true, onOpen: (el) => { $in(el, 'ifQ').addEventListener('input', () => list(el)); $in(el, 'ifC').addEventListener('change', () => list(el)); list(el); } });
  };
  /** arguments d'une fonction, avec résultat en direct */
  function argsDialog(canon) {
    const I = TB.FN_INFO[canon] || {}; const def = TB.FN[canon] || {};
    const names = (TB.fnArgs ? TB.fnArgs(canon) : I.args) || [];
    const n = Math.max(names.length, def.min || 1, 1);
    const Gr = G(); const r = Gr.sel.r, c = Gr.sel.c;
    const fname = P.displayFn(canon, TB.loc.fn);
    let rows = Math.min(n, 12);
    const field = (i) => fld((names[i] || ('Argument ' + (i + 1))).replace(/^\[|\]$/g, '') + (/^\[/.test(names[i] || '') || i >= (def.min || 0) ? ' (facultatif)' : ''), '<div style="display:flex;gap:6px;align-items:center">' + inp('ia' + i, '') + '<span class="o-hint" id="iv' + i + '" style="min-width:90px;margin:0"></span></div>');
    const body = '<p><b style="font-family:Consolas,monospace">' + esc(fname) + '</b> — ' + esc(I.desc || '') + '</p><div id="iaL">' + Array.from({ length: rows }, (_, i) => field(i)).join('') + '</div>' + (def.max == null || def.max > rows ? '<button type="button" class="o-btn" id="iaMore">' + O.icon('plus') + ' Argument</button>' : '') + '<p>Résultat : <b id="iaR"></b></p><p class="o-hint">Astuce : cliquez dans un champ puis tapez une plage (ex. A1:A10), un nombre ou un texte entre guillemets.</p>';
    const text = (el) => { const a = []; for (let i = 0; i < rows; i++) a.push(String(val(el, 'ia' + i) || '').trim()); while (a.length && !a[a.length - 1]) a.pop(); return fname + '(' + a.join(TB.loc.arg) + ')'; };
    const evalTxt = (t) => { try { const x = TB.CF.evalF({ wb: wb(), sh: sh() }, P.fromUser(t), r, c, null); const v = x instanceof TB.Ref ? (x.single && x.single() ? x.value() : '{…}') : x instanceof TB.Arr ? '{…}' : x; return v instanceof TB.Err ? TB.errText(v) : typeof v === 'number' ? TB.Fmt.text(v, 'General') : typeof v === 'boolean' ? TB.boolText(v) : String(v == null ? '' : v); } catch (e) { return ''; } };
    const live = (el) => { for (let i = 0; i < rows; i++) { const t = String(val(el, 'ia' + i) || '').trim(); $in(el, 'iv' + i).textContent = t ? '= ' + evalTxt(t) : ''; } $in(el, 'iaR').textContent = evalTxt(text(el)); };
    return dlg('Arguments de la fonction', body, (el, close) => { const t = '=' + text(el); close('ok'); const s = sh(); if (Gr.edit) { const e = Gr.editEl(); const cur = e.value; if (/\(\)$/.test(cur)) Gr.setEditText(cur.replace(new RegExp(fname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\(\\)$'), text(el))); else A.insertText(text(el)); return false; } A.commitInput(s, r, c, t); G().invalidate(); return false; }, { onOpen: (el) => { O.$$('input', el).forEach((i) => i.addEventListener('input', () => live(el))); const m = $in(el, 'iaMore'); if (m) m.onclick = () => { if (def.max != null && rows >= def.max) return; const d = O.h('div'); d.innerHTML = field(rows); $in(el, 'iaL').appendChild(d.firstChild); rows++; O.$$('input', el).forEach((i) => { i.oninput = () => live(el); }); }; const first = $in(el, 'ia0'); if (first && !first.value) { const g = A.bounded(G().range()); if (g.r1 !== g.r2 || g.c1 !== g.c2) first.value = TB.rangeStr(g); } live(el); } });
  }
  D.evalFormula = function () {
    const s = sh(), r = G().sel.r, c = G().sel.c; const f = s.formula(r, c);
    if (!f) { O.toast('La cellule active ne contient pas de formule', { bad: true }); return; }
    // évaluation pas à pas : chaque sous-expression la plus profonde est remplacée par sa valeur
    const steps = []; let ast = TB.deepClone(f.ast);
    const show = (x) => '=' + P.write(x, P.userLoc());
    const valNode = (v) => v instanceof TB.Err ? { t: 'e', v: TB.errText(v) } : typeof v === 'number' ? { t: 'n', v } : typeof v === 'boolean' ? { t: 'b', v } : v == null ? { t: 'n', v: 0 } : { t: 's', v: String(v) };
    const evalNode = (n) => { const x = TB.ev(n, { wb: wb(), sh: s, r, c, env: null, depth: 0 }); if (x instanceof TB.Ref) return x.single && x.single() ? x.value() : null; if (x instanceof TB.Arr) return null; return x; };
    steps.push(show(ast));
    for (let k = 0; k < 40; k++) {
      let done = false;
      const step = (n) => { if (done || !n || typeof n !== 'object') return n; const kids = n.t === 'fn' ? n.a : n.t === 'op' || n.t === 'range' ? [n.l, n.r] : n.t === 'paren' || n.t === 'neg' || n.t === 'pct' ? [n.x] : []; if (n.t === 'range') { const v = evalNode(n); if (v === null) return n; } for (const ch of kids) if (ch && !/^(n|s|b|e|miss)$/.test(ch.t) && !(n.t === 'fn' && /^(ref|area|range)$/.test(ch.t))) { const nn = step(ch); if (done) { if (n.t === 'fn') n.a[n.a.indexOf(ch)] = nn; else if (n.t === 'op') { if (n.l === ch) n.l = nn; else n.r = nn; } else n.x = nn; return n; } } if (/^(n|s|b|e|miss)$/.test(n.t)) return n; const v = evalNode(n); if (v === null && n.t !== 'ref') return n; done = true; return valNode(v); };
      const nx = step(ast); if (!done) break; ast = nx; steps.push(show(ast)); if (/^(n|s|b|e)$/.test(ast.t)) break;
    }
    O.alert('Évaluation de la formule — ' + TB.addr(r, c), '<ol style="font-family:Consolas,\'Mag Mono\',monospace;font-size:13px;line-height:1.6">' + steps.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>');
  };
  D.errorCheck = function () {
    const s = sh(); const errs = [];
    s.fml.forEach((f) => { const v = s.get(f.r, f.c); if (v instanceof TB.Err) errs.push([f.r, f.c, TB.errText(v)]); });
    errs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const why = { '#DIV/0!': 'Division par zéro (ou par une cellule vide).', '#N/A': 'Valeur non disponible (recherche sans résultat).', '#NAME?': 'Nom de fonction ou de plage inconnu.', '#REF!': 'Référence à une cellule supprimée.', '#VALUE!': 'Type de valeur incorrect (texte au lieu d\'un nombre…).', '#NUM!': 'Nombre incorrect ou calcul impossible.', '#NULL!': 'Intersection vide.', '#SPILL!': 'Le résultat déborde sur des cellules non vides.', '#CALC!': 'Calcul impossible (résultat vide).' };
    if (!errs.length) { O.alert('Vérification des erreurs', '<p>Aucune erreur dans les formules de cette feuille.</p>' + (wb().circ && wb().circ.size ? '<p>Attention : référence circulaire détectée.</p>' : '')); return; }
    O.dialog({ title: 'Vérification des erreurs (' + errs.length + ')', body: '<div class="csv-prev" style="max-height:340px"><table class="pv-table"><tr><th>Cellule</th><th>Erreur</th><th>Cause probable</th></tr>' + errs.slice(0, 300).map((e, i) => '<tr data-i="' + i + '" style="cursor:pointer"><td>' + TB.addr(e[0], e[1]) + '</td><td>' + esc(TB.loc.fn === 'fr' ? (TB.ERR_FR[e[2]] || e[2]) : e[2]) + '</td><td>' + esc(why[e[2]] || '') + '</td></tr>').join('') + '</table></div>', onOpen: (el, close) => O.$$('tr[data-i]', el).forEach((tr) => tr.onclick = () => { const e = errs[+tr.dataset.i]; close(); G().select(e[0], e[1]); }) });
  };

  /* =====================================================================
     Édition : collage spécial, cellules, atteindre, zoom
     ===================================================================== */
  D.pasteSpecial = function () {
    if (!A.clip) { O.toast('Copiez d\'abord des cellules (Ctrl+C) dans Tableur', { bad: true }); return; }
    const W = [['all', 'Tout'], ['formulas', 'Formules'], ['values', 'Valeurs'], ['formats', 'Formats'], ['notes', 'Notes et commentaires'], ['validation', 'Validation'], ['noBorders', 'Tout sauf la bordure'], ['widths', 'Largeurs de colonnes'], ['formulasFormats', 'Formules et formats des nombres'], ['valuesFormats', 'Valeurs et formats des nombres']];
    const OP = [['', 'Aucune'], ['add', 'Addition'], ['sub', 'Soustraction'], ['mul', 'Multiplication'], ['div', 'Division']];
    const radio = (name, l, v) => '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">' + l.map((x) => '<label class="o-check"><input type="radio" name="' + name + '" value="' + x[0] + '"' + (x[0] === v ? ' checked' : '') + '><span>' + esc(x[1]) + '</span></label>').join('') + '</div>';
    const body = '<div class="dlg-sec">Coller</div>' + radio('psW', W, 'all') + '<div class="dlg-sec">Opération</div>' + radio('psO', OP, '') + '<div style="display:flex;gap:16px;flex-wrap:wrap">' + chk('psB', 'Blancs non compris', false) + chk('psT', 'Transposé', false) + '</div>';
    return dlg('Collage spécial', body, (el, close) => { const what = (el.querySelector('input[name=psW]:checked') || {}).value || 'all'; const op = (el.querySelector('input[name=psO]:checked') || {}).value || ''; close('ok'); C.pasteClip({ what, op: op || null, skipBlanks: val(el, 'psB'), transpose: val(el, 'psT') }); return false; }, { wide: true, extra: [{ label: 'Coller avec liaison', left: true, value: null, onClick: (cl) => { cl(null); C.pasteClip({ what: 'link', link: true }); } }] });
  };
  D.insertCells = function () {
    const body = ['cellsRight:Décaler les cellules vers la droite', 'cellsDown:Décaler les cellules vers le bas', 'rows:Ligne entière', 'cols:Colonne entière'].map((x, i) => { const [k, l] = x.split(':'); return '<label class="o-check"><input type="radio" name="ic" value="' + k + '"' + (i === 1 ? ' checked' : '') + '><span>' + esc(l) + '</span></label>'; }).join('');
    return dlg('Insérer', body, (el, close) => { const k = (el.querySelector('input[name=ic]:checked') || {}).value; close('ok'); C.insert(k); return false; });
  };
  D.deleteCells = function () {
    const body = ['cellsLeft:Décaler les cellules vers la gauche', 'cellsUp:Décaler les cellules vers le haut', 'rows:Ligne entière', 'cols:Colonne entière'].map((x, i) => { const [k, l] = x.split(':'); return '<label class="o-check"><input type="radio" name="dc" value="' + k + '"' + (i === 1 ? ' checked' : '') + '><span>' + esc(l) + '</span></label>'; }).join('');
    return dlg('Supprimer', body, (el, close) => { const k = (el.querySelector('input[name=dc]:checked') || {}).value; close('ok'); C.remove(k); return false; });
  };
  D.goTo = function () {
    const names = wb().names.filter((n) => !n.sh || n.sh === sh().name).map((n) => n.n).concat(wb().sheets.flatMap((s) => s.tables.map((t) => t.name)));
    const body = (names.length ? '<div class="fmt-list" id="gtL" style="font-family:inherit;max-height:180px">' + names.map((n) => '<button type="button" data-n="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>' : '') + fld('Référence', inp('gtR', '', ' placeholder="ex. B12, Feuil2!A1, NomDéfini" autofocus'));
    return dlg('Atteindre', body, (el, close) => { const t = String(val(el, 'gtR') || '').trim(); if (!t) return false; close('ok'); if (A.goToName) A.goToName(t); return false; }, { extra: [{ label: 'Cellules…', left: true, value: null, onClick: (cl) => { cl(null); setTimeout(() => D.goToSpecial(), 0); } }], onOpen: (el) => O.$$('#gtL button', el).forEach((b) => { b.onclick = () => { $in(el, 'gtR').value = b.dataset.n; }; b.ondblclick = () => { $in(el, 'gtR').value = b.dataset.n; el.querySelector('.o-dlg-ft .pri').click(); }; }) });
  };
  D.goToSpecial = function () {
    const K = [['notes', 'Notes et commentaires'], ['constants', 'Constantes'], ['formulas', 'Formules'], ['blanks', 'Cellules vides'], ['errors', 'Erreurs'], ['region', 'Zone en cours'], ['last', 'Dernière cellule'], ['cf', 'Formats conditionnels'], ['dv', 'Validation des données'], ['visible', 'Cellules visibles seulement']];
    const body = K.map((k, i) => '<label class="o-check"><input type="radio" name="gs" value="' + k[0] + '"' + (i === 2 ? ' checked' : '') + '><span>' + esc(k[1]) + '</span></label>').join('');
    return dlg('Sélectionner les cellules', '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">' + body + '</div>', (el, close) => {
      const k = (el.querySelector('input[name=gs]:checked') || {}).value; close('ok');
      const s = sh(), Gr = G();
      if (k === 'region') { const g = Gr.region(Gr.sel.r, Gr.sel.c); if (g) Gr.setRange(g); return false; }
      if (k === 'last') { const e = s.extent(); Gr.select(Math.max(0, e.r), Math.max(0, e.c)); return false; }
      if (k === 'visible') { const g = A.bounded(Gr.range()); const out = []; let start = null; for (let r = g.r1; r <= g.r2 + 1; r++) { const vis = r <= g.r2 && !s.hidR.has(r); if (vis && start == null) start = r; if (!vis && start != null) { out.push({ r1: start, c1: g.c1, r2: r - 1, c2: g.c2 }); start = null; } } if (out.length) { Gr.sel = { r: out[0].r1, c: out[0].c1, ranges: out, anchor: { r: out[0].r1, c: out[0].c1 }, ext: null }; Gr.draw(); A.onSelect(); } return false; }
      A.selectSpecial(k); return false;
    });
  };
  D.zoom = function () {
    const s = sh(); const z = Math.round((s.zoom || 1) * 100);
    const body = [200, 150, 100, 85, 75, 50, 25].map((v) => '<label class="o-check"><input type="radio" name="zm" value="' + v + '"' + (v === z ? ' checked' : '') + '><span>' + v + ' %</span></label>').join('') + '<label class="o-check"><input type="radio" name="zm" value="fit"><span>Ajusté à la sélection</span></label><label class="o-check"><input type="radio" name="zm" value="custom"' + ([200, 150, 100, 85, 75, 50, 25].includes(z) ? '' : ' checked') + '><span>Personnalisé :</span>' + num('zmV', z, 5, 10, 400) + '<span>%</span></label>';
    return dlg('Zoom', body, (el, close) => { const k = (el.querySelector('input[name=zm]:checked') || {}).value; close('ok'); if (k === 'fit') { if (A.zoomToSel) A.zoomToSel(); return false; } const v = k === 'custom' ? nval(el, 'zmV') : +k; A.setZoom(Math.max(10, Math.min(400, v || 100)) / 100); return false; });
  };
  D.moveCopySheet = function (s0) {
    const s = s0 || sh(); const L = wb().sheets;
    const body = '<p>Déplacer la feuille « ' + esc(s.name) + ' » avant :</p><div class="fmt-list" id="mcL" style="font-family:inherit">' + L.map((x, i) => '<button type="button" data-i="' + i + '"' + (x === s ? ' class="on"' : '') + '>' + esc(x.name) + '</button>').join('') + '<button type="button" data-i="' + L.length + '">(en dernier)</button></div>' + chk('mcC', 'Créer une copie', false);
    let to = L.indexOf(s);
    return dlg('Déplacer ou copier', body, (el, close) => { close('ok'); if (val(el, 'mcC')) C.copySheet(s, to); else C.moveSheet(s, to > L.indexOf(s) ? to - 1 : to); return false; }, { onOpen: (el) => O.$$('#mcL button', el).forEach((b) => b.onclick = () => { to = +b.dataset.i; O.$$('#mcL button', el).forEach((x) => x.classList.toggle('on', x === b)); }) });
  };

  /* =====================================================================
     Protection (locale ; pas un chiffrement)
     ===================================================================== */
  async function hash(pw, salt) { const d = new TextEncoder().encode(salt + '\u0000' + pw); const h = await crypto.subtle.digest('SHA-256', d); return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
  const HONEST = '<p class="o-hint" style="border-left:3px solid var(--o-acc);padding-left:8px">Cette protection évite les modifications involontaires. Ce n\'est <b>pas un chiffrement</b> : les données restent lisibles dans le fichier, et un logiciel peut ignorer la protection. Le mot de passe (facultatif) est conservé sous forme d\'empreinte et n\'est pas exporté dans les fichiers .xlsx.</p>';
  D.protectSheet = async function () {
    const s = sh();
    if (s.protect) {
      if (s.protect.hash) { const pw = await O.prompt('Ôter la protection de la feuille', 'Mot de passe', '', { type: 'password' }); if (pw == null) return; if (await hash(pw, s.protect.salt || '') !== s.protect.hash) { O.toast('Mot de passe incorrect', { bad: true }); return; } }
      A.tx('Ôter la protection', () => wb().setProp(s, 'protect', null)); A.refreshUi(); O.toast('Feuille déprotégée', { ms: 1500 }); return;
    }
    const AL = [['selectLocked', 'Sélectionner les cellules verrouillées', true], ['selectUnlocked', 'Sélectionner les cellules déverrouillées', true], ['formatCells', 'Format de cellule', false], ['formatColumns', 'Format de colonne', false], ['formatRows', 'Format de ligne', false], ['insertRows', 'Insérer des lignes', false], ['insertCols', 'Insérer des colonnes', false], ['deleteRows', 'Supprimer des lignes', false], ['deleteCols', 'Supprimer des colonnes', false], ['sort', 'Trier', false], ['autoFilter', 'Utiliser le filtre automatique', false], ['objects', 'Modifier les objets', false]];
    const body = fld('Mot de passe (facultatif)', '<input class="o-in" type="password" id="ppW" autocomplete="new-password">') + fld('Confirmer', '<input class="o-in" type="password" id="ppC" autocomplete="new-password">') + '<div class="dlg-sec">Autoriser tous les utilisateurs à</div><div style="max-height:200px;overflow:auto">' + AL.map((x) => chk('pa_' + x[0], x[1], x[2])).join('') + '</div>' + HONEST + '<p class="o-hint">Pour laisser des cellules modifiables, déverrouillez-les d\'abord (Format de cellule › Protection).</p>';
    return dlg('Protéger la feuille', body, async (el, close) => {
      const pw = val(el, 'ppW'); if (pw !== val(el, 'ppC')) { O.toast('Les deux mots de passe sont différents', { bad: true }); return false; }
      const allow = {}; AL.forEach((x) => { allow[x[0]] = val(el, 'pa_' + x[0]); });
      const salt = pw ? TB.uid('s') : ''; const p = { allow, hash: pw ? await hash(pw, salt) : null, salt };
      close('ok'); A.tx('Protéger la feuille', () => wb().setProp(s, 'protect', p)); A.refreshUi(); O.toast('Feuille protégée', { ms: 1500 }); return false;
    });
  };
  D.protectBook = async function () {
    const W = wb();
    if (W.protect && W.protect.structure) {
      if (W.protect.hash) { const pw = await O.prompt('Ôter la protection du classeur', 'Mot de passe', '', { type: 'password' }); if (pw == null) return; if (await hash(pw, W.protect.salt || '') !== W.protect.hash) { O.toast('Mot de passe incorrect', { bad: true }); return; } }
      A.tx('Ôter la protection du classeur', () => W.setProp(W, 'protect', null)); A.refreshUi(); return;
    }
    const body = '<p>Protéger la structure : empêche d\'ajouter, supprimer, renommer, déplacer ou masquer des feuilles.</p>' + fld('Mot de passe (facultatif)', '<input class="o-in" type="password" id="pbW" autocomplete="new-password">') + fld('Confirmer', '<input class="o-in" type="password" id="pbC" autocomplete="new-password">') + HONEST;
    return dlg('Protéger la structure du classeur', body, async (el, close) => { const pw = val(el, 'pbW'); if (pw !== val(el, 'pbC')) { O.toast('Les deux mots de passe sont différents', { bad: true }); return false; } const salt = pw ? TB.uid('s') : ''; const p = { structure: true, hash: pw ? await hash(pw, salt) : null, salt }; close('ok'); A.tx('Protéger le classeur', () => W.setProp(W, 'protect', p)); A.refreshUi(); return false; });
  };

  /* =====================================================================
     Tableaux
     ===================================================================== */
  D.makeTable = function (style) {
    const da = A.dataArea(); const g = da ? da.g : A.bounded(G().range());
    const body = fld('Où se trouvent les données de votre tableau ?', inp('mtR', TB.rangeStr(g, true))) + chk('mtH', 'Mon tableau comporte des en-têtes', da ? da.header : true) + (style ? '' : fld('Style', '<div id="mtS" style="display:flex;flex-wrap:wrap;gap:4px;max-height:200px;overflow:auto">' + TB.TableStyle.list().slice(0, 49).map((x, i) => '<button type="button" class="o-gal-it' + (i === 8 ? ' on' : '') + '" data-s="' + x + '" title="' + esc(x) + '">' + TB.TableStyle.previewHtml(wb(), x) + '</button>').join('') + '</div>'));
    let st = style || 'TableStyleMedium2';
    return dlg('Créer un tableau', body, (el, close) => { const r = refIn(val(el, 'mtR')); if (!r) { O.toast('Plage incorrecte', { bad: true }); return false; } close('ok'); if (r.sh !== sh()) A.showSheet(r.sh); G().setRange(r.g); C.makeTable(r.g, val(el, 'mtH'), st); return false; }, { wide: !style, onOpen: (el) => { O.$$('#mtS [data-s]', el).forEach((b) => b.onclick = () => { st = b.dataset.s; O.$$('#mtS [data-s]', el).forEach((x) => x.classList.toggle('on', x === b)); }); const on = el.querySelector('#mtS .on'); if (on) st = on.dataset.s; } });
  };
  D.resizeTable = function () {
    const t = A.curTable(); if (!t) return;
    return dlg('Redimensionner le tableau', fld('Nouvelle plage (même ligne d\'en-têtes)', inp('rtR', TB.rangeStr(t, true))), (el, close) => { const g = TB.parseRange(String(val(el, 'rtR')).replace(/\$/g, '')); if (!g || g.r1 !== t.r1 || g.c1 !== t.c1) { O.toast('La plage doit commencer à la même cellule', { bad: true }); return false; } close('ok'); const s = sh(); A.tx('Redimensionner le tableau', () => { const cols = []; for (let c = g.c1; c <= g.c2; c++) { const old = t.cols[c - t.c1]; const v = s.get(g.r1, c); cols.push(old && c <= t.c2 ? old : { name: v == null || v === '' ? 'Colonne' + (c - g.c1 + 1) : TB.Fmt.text(v, 'General') }); } A.replaceTable(s, t, Object.assign({}, t, { r2: g.r2, c2: g.c2, cols })); }); return false; });
  };

  /* =====================================================================
     Graphiques
     ===================================================================== */
  const CHART_ICON = (k) => O.icon(TB.Chart.ICON[k] || 'chart-column');
  D.chartPicker = function () {
    const body = '<div class="o-gal-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">' + TB.Chart.KINDS.map((k) => '<button type="button" class="o-gal-it" data-k="' + k[0] + '" style="height:auto;padding:8px;flex-direction:column;gap:4px">' + CHART_ICON(k[0]) + '<small>' + esc(k[1]) + '</small></button>').join('') + '</div>';
    return O.dialog({ title: 'Insérer un graphique', wide: true, body, onOpen: (el, close) => O.$$('[data-k]', el).forEach((b) => b.onclick = () => { close(); A.insertChart(b.dataset.k); }) });
  };
  const curChart = () => A.selObj && A.selObj.type === 'chart' ? A.selObj : null;
  D.chartType = function () {
    const o = curChart(); if (!o) return;
    const body = '<div class="o-gal-grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">' + TB.Chart.KINDS.map((k) => '<button type="button" class="o-gal-it' + (k[0] === o.chart.kind ? ' on' : '') + '" data-k="' + k[0] + '" style="height:auto;padding:8px;flex-direction:column;gap:4px">' + CHART_ICON(k[0]) + '<small>' + esc(k[1]) + '</small></button>').join('') + '</div>';
    return O.dialog({ title: 'Modifier le type de graphique', wide: true, body, onOpen: (el, close) => O.$$('[data-k]', el).forEach((b) => b.onclick = () => { close(); A.chartSet({ kind: b.dataset.k }); }) });
  };
  D.chartData = function () {
    const o = curChart(); if (!o) return; const ch = o.chart;
    const ser = (ch.series || []).map((x) => Object.assign({}, x));
    const body = fld('Plage de données du graphique', inp('cdR', ch.src ? fOut(ch.src).replace(/^=/, '') : '')) + '<div class="two-col">' + fld('Séries en', sel('cdB', [['col', 'Colonnes'], ['row', 'Lignes']], ch.byRow ? 'row' : 'col')) + '<div>' + chk('cdH', 'Première ligne / colonne = noms', ch.header !== false) + '</div></div>' + chk('cdX', 'Définir les séries une à une (avancé)', !!ch.explicit) + '<div id="cdS"></div>';
    const draw = (el) => { const on = val(el, 'cdX'); $in(el, 'cdS').hidden = !on; $in(el, 'cdR').closest('.o-field').style.opacity = on ? 0.5 : 1; if (!on) return; $in(el, 'cdS').innerHTML = ser.map((x, i) => '<div class="three-col" data-i="' + i + '">' + fld('Nom', inp('csN' + i, x.name || '')) + fld('Valeurs', inp('csV' + i, x.values ? fOut(x.values) : '')) + fld('Étiquettes (abscisses)', inp('csC' + i, x.cats ? fOut(x.cats) : '')) + '</div>').join('') + '<button type="button" class="o-btn" id="csAdd">' + O.icon('plus') + ' Ajouter une série</button>'; $in(el, 'csAdd').onclick = () => { readS(el); ser.push({ name: 'Série ' + (ser.length + 1), values: '', cats: ser[0] ? ser[0].cats : '' }); draw(el); }; };
    const readS = (el) => ser.forEach((x, i) => { if (!$in(el, 'csN' + i)) return; x.name = val(el, 'csN' + i); const v = String(val(el, 'csV' + i) || '').trim(), c = String(val(el, 'csC' + i) || '').trim(); try { x.values = v ? P.fromUser(v.replace(/^=/, '')) : ''; x.cats = c ? P.fromUser(c.replace(/^=/, '')) : ''; } catch (e) { /* laissé tel quel */ } });
    return dlg('Sélectionner les données', body, (el, close) => {
      const patch = { byRow: val(el, 'cdB') === 'row', header: val(el, 'cdH'), explicit: val(el, 'cdX') };
      if (patch.explicit) { readS(el); patch.series = ser.filter((x) => x.values); }
      else { const t = String(val(el, 'cdR') || '').trim().replace(/^=/, ''); if (t) { let src; try { src = P.fromUser(t); } catch (e) { O.toast('Plage incorrecte', { bad: true }); return false; } if (!/!/.test(src)) src = TB.quoteSheet(sh().name) + '!' + src; patch.src = src; } }
      close('ok'); A.chartSet(patch); return false;
    }, { wide: true, onOpen: (el) => { $in(el, 'cdX').onchange = () => { if (val(el, 'cdX') && !ser.length) { try { const d = TB.Chart.data(wb(), ch, sh()); (d.series || []).forEach((x) => ser.push({ name: x.name, values: x.ref || '', cats: d.catRef || '' })); } catch (e) { } if (!ser.length) ser.push({ name: 'Série 1', values: '', cats: '' }); } draw(el); }; draw(el); } });
  };
  D.chartTitles = function () {
    const o = curChart(); if (!o) return; const ch = o.chart;
    return O.form('Titres du graphique', [{ id: 'title', label: 'Titre du graphique', value: ch.title || '' }, { id: 'xTitle', label: 'Titre de l\'axe horizontal', value: ch.xTitle || '' }, { id: 'yTitle', label: 'Titre de l\'axe vertical', value: ch.yTitle || '' }, { id: 'y2Title', label: 'Titre de l\'axe secondaire', value: ch.y2Title || '' }, { id: 'legend', label: 'Légende', type: 'select', value: ch.legend || 'bottom', options: [['none', 'Aucune'], ['bottom', 'En bas'], ['top', 'En haut'], ['right', 'À droite'], ['left', 'À gauche']] }, { id: 'labels', label: 'Étiquettes de données', type: 'check', value: !!ch.labels }]).then((r) => { if (r) A.chartSet(r); });
  };
  D.chartAxes = function () {
    const o = curChart(); if (!o) return; const ch = o.chart;
    const n = (x) => x == null ? '' : String(x).replace('.', TB.loc.dec);
    return O.form('Axes et quadrillage', [{ id: 'yMin', label: 'Minimum de l\'axe vertical (vide : automatique)', value: n(ch.yMin), half: true }, { id: 'yMax', label: 'Maximum (vide : automatique)', value: n(ch.yMax), half: true }, { id: 'grid', label: 'Quadrillage horizontal', type: 'check', value: ch.grid !== false }, { id: 'smooth', label: 'Courbes lissées', type: 'check', value: !!ch.smooth }, { id: 'nf', label: 'Format des nombres de l\'axe (code, vide : comme les données)', value: ch.nf ? TB.Fmt.toLocal(ch.nf) : '' }]).then((r) => { if (!r) return; const p = (x) => { const t = String(x || '').trim(); return t ? TB.parseNum(t) : null; }; A.chartSet({ yMin: p(r.yMin), yMax: p(r.yMax), grid: r.grid, smooth: r.smooth, nf: r.nf ? TB.Fmt.fromLocal(r.nf) : null }); });
  };
  D.chartColors = function () {
    const o = curChart(); if (!o) return; const ch = o.chart; let d; try { d = TB.Chart.data(wb(), ch, sh()); } catch (e) { d = { series: [] }; }
    const pie = /pie|doughnut/.test(ch.kind); const items = pie ? (d.cats || []).map((c, i) => [i, String(c)]) : (d.series || []).map((x, i) => [i, x.name || 'Série ' + (i + 1)]);
    const body = items.length ? items.slice(0, 24).map(([i, l]) => fld(l, color('ccC' + i, TB.Chart.color(wb(), ch, i)))).join('') + (pie ? '' : fld('Série sur l\'axe secondaire / en courbe (graphique combiné)', '<div>' + items.map(([i, l]) => chk('ccY' + i, l, ch.seriesOpt && ch.seriesOpt[i] && ch.seriesOpt[i].y2)).join('') + '</div>')) : '<p class="o-hint">Aucune série.</p>';
    return dlg('Couleurs du graphique', body, (el, close) => { const colors = items.map(([i]) => { const b = $in(el, 'ccC' + i); return b ? b.dataset.v || null : null; }); const seriesOpt = pie ? ch.seriesOpt : items.map(([i]) => ({ y2: !!val(el, 'ccY' + i) })); close('ok'); A.chartSet({ colors, seriesOpt }); return false; }, { onOpen: (el) => wireColors(el), extra: [{ label: 'Couleurs du thème', left: true, value: null, onClick: (cl) => { cl(null); A.chartSet({ colors: null }); } }] });
  };
  D.chartEdit = function () {
    const o = curChart(); if (!o) return;
    O.menu({ x: innerWidth / 2 - 120, y: innerHeight / 3 }, [{ label: 'Type de graphique…', icon: 'chart-column', on: () => D.chartType() }, { label: 'Sélectionner les données…', icon: 'table-2', on: () => D.chartData() }, { label: 'Titres et légende…', icon: 'heading', on: () => D.chartTitles() }, { label: 'Axes et quadrillage…', icon: 'ruler', on: () => D.chartAxes() }, { label: 'Couleurs et axe secondaire…', icon: 'palette', on: () => D.chartColors() }]);
  };
  D.sparkline = function (type) {
    const g = A.bounded(G().range());
    const body = fld('Plage de données', inp('spD', '')) + fld('Emplacement (cellule ou plage d\'une ligne / colonne)', inp('spL', TB.rangeStr(g, true))) + '<div class="two-col">' + fld('Couleur', color('spC', '#2F6FDE')) + fld('Points négatifs', color('spN', '#D9363E')) + '</div><p class="o-hint">Un graphique sparkline est dessiné dans chaque cellule de l\'emplacement, à partir de la ligne (ou colonne) correspondante des données.</p>';
    return dlg('Créer des graphiques sparkline', body, (el, close) => {
      const d = refIn(val(el, 'spD')), L = refIn(val(el, 'spL')); if (!d || !L) { O.toast('Indiquez la plage de données et l\'emplacement', { bad: true }); return false; }
      const vert = L.g.c1 === L.g.c2 && L.g.r2 > L.g.r1; const n = vert ? L.g.r2 - L.g.r1 + 1 : L.g.c2 - L.g.c1 + 1; const list = [];
      for (let i = 0; i < n; i++) { const at = vert ? { r1: L.g.r1 + i, c1: L.g.c1, r2: L.g.r1 + i, c2: L.g.c1 } : { r1: L.g.r1, c1: L.g.c1 + i, r2: L.g.r1, c2: L.g.c1 + i }; const src = vert ? { r1: d.g.r1 + i, c1: d.g.c1, r2: d.g.r1 + i, c2: d.g.c2 } : (n === 1 ? d.g : { r1: d.g.r1, c1: d.g.c1 + i, r2: d.g.r2, c2: d.g.c1 + i }); if (n > 1 && !vert && d.g.r1 === d.g.r2) Object.assign(src, { r1: d.g.r1, r2: d.g.r2, c1: d.g.c1, c2: d.g.c2 }); list.push({ at, src: TB.quoteSheet(d.sh.name) + '!' + TB.rangeStr(src, true), type, color: $in(el, 'spC').dataset.v || '#2F6FDE', neg: $in(el, 'spN').dataset.v || '#D9363E' }); }
      close('ok'); const s = L.sh; A.tx('Sparkline', () => wb().setProp(s, 'sparks', (s.sparks || []).filter((x) => !list.some((y) => TB.sameRange(x.at, y.at))).concat(list))); G().invalidate(); return false;
    }, { onOpen: (el) => wireColors(el), extra: [{ label: 'Supprimer', left: true, value: null, onClick: (cl) => { cl(null); const s = sh(); A.tx('Supprimer les sparklines', () => wb().setProp(s, 'sparks', (s.sparks || []).filter((x) => !G().sel.ranges.some((r) => TB.intersect(r, x.at))))); G().invalidate(); } }] });
  };

  /* =====================================================================
     Insertion : icônes, symboles ; statistiques ; texte de remplacement
     ===================================================================== */
  D.icons = function () {
    const all = (O.iconNames ? O.iconNames() : Object.keys(window.LUCIDE || {})).slice(0);
    const body = inp('icQ', '', ' placeholder="Rechercher (anglais : arrow, user, home, truck…)" autofocus') + '<div id="icL" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:4px;max-height:340px;overflow:auto;margin-top:8px"></div>';
    const draw = (el) => { const q = String(val(el, 'icQ') || '').toLowerCase().trim(); const L = (q ? all.filter((n) => n.includes(q)) : all).slice(0, 300); $in(el, 'icL').innerHTML = L.map((n) => '<button type="button" class="o-btn" data-n="' + n + '" title="' + n + '" style="height:40px;padding:0;justify-content:center">' + O.icon(n) + '</button>').join(''); };
    return O.dialog({ title: 'Icônes', wide: true, body, onOpen: (el, close) => { draw(el); $in(el, 'icQ').addEventListener('input', () => draw(el)); $in(el, 'icL').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) { close(); A.insertIcon(b.dataset.n); } }); } });
  };
  D.symbol = function () {
    const SETS = [['Courants', '€ £ $ ¥ ¢ © ® ™ § ¶ † ‡ • … ‰ ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ ∑ ∏ ∫ ∆ µ Ω π ½ ¼ ¾ ² ³ ¹ ‰ № ← → ↑ ↓ ↔ ⇒ ⇔ ✓ ✗ ★ ☆ ● ○ ■ □ ▲ △ ▼ ▽ ◆ ◇ « » “ ” ‘ ’ – — ¿ ¡'], ['Lettres', 'À Â Ä Ç É È Ê Ë Î Ï Ô Ö Ù Û Ü Ÿ Æ Œ à â ä ç é è ê ë î ï ô ö ù û ü ÿ æ œ ß ñ Ñ ø Ø å Å'], ['Grec', 'α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω Α Β Γ Δ Ε Ζ Η Θ Λ Ξ Π Σ Φ Ψ Ω'], ['Mesures', 'm² m³ cm² mm² °C ‰ Ø ⌀ ∅ ± ≈ µm kg/m² kg/m³ N·m']];
    const body = SETS.map((s) => '<div class="dlg-sec">' + esc(s[0]) + '</div><div style="display:flex;flex-wrap:wrap;gap:3px">' + s[1].split(' ').map((c) => '<button type="button" class="o-btn" data-c="' + esc(c) + '" style="min-width:34px;height:34px;padding:0 6px;justify-content:center;font-size:16px">' + esc(c) + '</button>').join('') + '</div>').join('');
    return O.dialog({ title: 'Symboles', wide: true, body, onOpen: (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; close(); const Gr = G(); if (Gr.edit) A.insertText(b.dataset.c); else { const s = sh(); const v = s.get(Gr.sel.r, Gr.sel.c); A.commitInput(s, Gr.sel.r, Gr.sel.c, (v == null || s.formula(Gr.sel.r, Gr.sel.c) ? '' : wb().editText ? wb().editText(s, Gr.sel.r, Gr.sel.c) : String(v)) + b.dataset.c); G().invalidate(); } }) });
  };
  D.stats = function () {
    const W = wb(); let cells = 0, fml = 0, notes = 0, objs = 0, charts = 0;
    W.sheets.forEach((s) => { const e = s.extent(); for (let c = 0; c <= e.c; c++) { const col = s.vals[c]; if (col) for (let r = 0; r < col.length; r++) if (col[r] !== undefined && col[r] !== null) cells++; } fml += s.fml.size; notes += s.notes.size + s.threads.size; objs += s.objs.length; charts += s.objs.filter((o) => o.type === 'chart').length; });
    const s = sh(), e = s.extent();
    O.alert('Statistiques du classeur', '<table class="kbd-tbl"><tr><td>Feuilles</td><td>' + W.sheets.length + '</td></tr><tr><td>Cellules non vides</td><td>' + cells.toLocaleString('fr-FR') + '</td></tr><tr><td>Formules</td><td>' + fml.toLocaleString('fr-FR') + '</td></tr><tr><td>Notes et commentaires</td><td>' + notes + '</td></tr><tr><td>Graphiques</td><td>' + charts + '</td></tr><tr><td>Autres objets</td><td>' + (objs - charts) + '</td></tr><tr><td>Noms définis</td><td>' + W.names.length + '</td></tr><tr><td>Feuille active : dernière cellule</td><td>' + (e.r >= 0 ? TB.addr(e.r, Math.max(0, e.c)) : '—') + '</td></tr></table>');
  };
  D.imageAlt = function () {
    const o = A.selObj; if (!o) return;
    return O.prompt('Texte de remplacement', 'Description de l\'objet (lecteurs d\'écran, export)', o.alt || '', { multiline: true, rows: 3 }).then((v) => { if (v != null) A.objSet({ alt: v }); });
  };
})();
