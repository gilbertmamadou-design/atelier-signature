/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-texte/tx-ui.js : ne pas modifier ici. */
/* Texte — interface : barre de titre, ruban (Accueil, Insertion, Création, Mise en page, Références, Publipostage,
   Révision, Affichage + onglets contextuels Tableau, Disposition, Image, Objet, En-tête et pied de page),
   barre d'état, modes d'affichage, zoom, raccourcis clavier, menu contextuel. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, PM = window.PM, T = O.Themes;
  const A = window.TexteApp = window.TexteApp || {};
  const C = A.cmd = A.cmd || {};
  const X = TX.C, D = window.TexteDialogs = window.TexteDialogs || {};
  const $ = (s) => document.querySelector(s);
  const V = () => A.view();
  const ex = (fn) => () => fn(V());
  let FS = null;
  const fs = () => FS || (FS = TX.fmtState(V().state, A.attrs()));
  const sel = () => V().state.selection;
  const nodeSel = (type) => { const s = sel(); return s instanceof PM.state.NodeSelection && (!type || s.node.type.name === type) ? s.node : null; };
  const inTable = () => !!X.tableAt(V().state);
  const palette = () => T.palette(A.theme());
  const pick = (ctx, anchor, apply, opt) => O.colorPicker(anchor, Object.assign({ theme: palette(), onPick: apply }, opt || {}));
  const colorCss = (ref) => ref && TX.HL[ref] ? TX.HL[ref] : (T.resolve(ref, A.theme()) || ref);
  const editingPart = () => !!A.partEd;

  /* ---------------- polices ---------------- */
  const fontOptions = () => {
    const t = A.theme(); const l = [['+major', t.fonts.major + ' (titres)', 'font-family:' + O.fontStack(t.fonts.major), 'Police du thème'], ['+minor', t.fonts.minor + ' (corps)', 'font-family:' + O.fontStack(t.fonts.minor), 'Police du thème']];
    O.FONTS.forEach((f) => l.push([f[0], f[0], 'font-family:' + f[1], O.fontAvailable(f[0]) ? '' : (/^(Calibri|Arial|Times New Roman|Courier New|Cambria)$/.test(f[0]) ? 'équivalente incluse' : 'remplacée sur cet appareil')]));
    return l;
  };
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

  /* ---------------- galerie des styles ---------------- */
  function styleItems() {
    const st = A.attrs().styles || {}; const theme = A.theme();
    return Object.keys(st).filter((id) => st[id].q).map((id) => {
      const R = TX.resolveStyle(st, id), r = R.r;
      const css = 'font-family:' + O.fontStack(r.f === '+major' ? theme.fonts.major : r.f === '+minor' ? theme.fonts.minor : (r.f || theme.fonts.minor)) + ';font-size:' + Math.min(15, Math.max(10, (r.sz || 11) * 0.95)) + 'px;' + (r.b ? 'font-weight:700;' : '') + (r.i ? 'font-style:italic;' : '') + (r.c ? 'color:' + colorCss(r.c) + ';' : '') + (r.caps ? 'text-transform:uppercase;' : '') + (r.smcaps ? 'font-variant:small-caps;' : '');
      return { id, title: st[id].n, sig: JSON.stringify(st[id]).length, html: '<div class="gal-st"><b style="' + css + '">AaBbCc</b><small>' + O.esc(st[id].n) + '</small></div>' };
    });
  }
  function tableStyleItems() {
    return TX.TABLE_STYLES.map((s) => {
      let h = '<div class="gal-tb"><table data-ts="' + s.id + '" class="hdr band"><tbody>';
      for (let r = 0; r < 4; r++) h += '<tr>' + '<td></td><td></td><td></td>' + '</tr>';
      return { id: s.id, title: s.name, html: h + '</tbody></table></div>' };
    });
  }
  /* ---------------- listes : galeries ---------------- */
  function listMenu(kinds) {
    const node = O.h('div', { cls: 'gal-list' });
    node.innerHTML = kinds.map((k) => { const d = TX.LIST_KINDS[k](); const c = [1, 1, 1]; return '<button type="button" data-k="' + k + '" title="' + k + '">' + [0, 1, 2].map((l) => ' '.repeat(l * 2) + TX.listLabel(d, l, l === 0 ? [1] : l === 1 ? [1, 1] : [1, 1, 1]) + ' ───').join('\n') + '</button>'; void c; }).join('');
    node.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; O.closeMenu(); X.list(V(), b.dataset.k); });
    return [{ node }, '-', { label: 'Définir une nouvelle liste…', icon: 'list-plus', on: () => D.listDialog() }, { label: 'Recommencer à 1', icon: 'rotate-ccw', disabled: !fs().list, on: () => X.listRestart(V(), 1) }, { label: 'Continuer la numérotation', icon: 'arrow-down', disabled: !fs().list, on: () => X.listContinue(V()) }, { label: 'Définir la valeur de départ…', icon: 'hash', disabled: !fs().list, on: () => O.prompt('Valeur de départ', 'Commencer à', '1', { type: 'number' }).then((v) => { if (v) X.listRestart(V(), parseInt(v, 10) || 1); }) }, { label: 'Niveau de liste', icon: 'list-tree', disabled: !fs().list, sub: Array.from({ length: 9 }, (x, i) => ({ label: 'Niveau ' + (i + 1), checked: fs().list && fs().list.l === i, on: () => X.listLevel(V(), i) })) }];
  }
  /* ---------------- tableau : grille d'insertion ---------------- */
  function tableGrid() {
    const node = O.h('div'); node.innerHTML = '<div class="tgrid-lbl">Insérer un tableau</div><div class="tgrid">' + Array.from({ length: 80 }, (x, i) => '<button type="button" data-r="' + (Math.floor(i / 10) + 1) + '" data-c="' + (i % 10 + 1) + '" aria-label="' + (Math.floor(i / 10) + 1) + ' × ' + (i % 10 + 1) + '"></button>').join('') + '</div>';
    const lbl = node.querySelector('.tgrid-lbl');
    node.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; const r = +b.dataset.r, c = +b.dataset.c; lbl.textContent = 'Tableau ' + c + ' × ' + r; O.$$('[data-r]', node).forEach((x) => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c)); });
    node.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; O.closeMenu(); X.insertTable(V(), +b.dataset.r, +b.dataset.c, { hdr: false }); });
    return [{ node }, '-', { label: 'Insérer un tableau…', icon: 'table', on: () => D.tableInsert() }, { label: 'Convertir le texte en tableau…', icon: 'table-2', on: () => O.form('Convertir en tableau', [{ id: 'sep', type: 'select', label: 'Séparer le texte au niveau des', value: '\t', options: [['\t', 'Tabulations'], [';', 'Points-virgules'], [',', 'Virgules'], [' ', 'Espaces']] }]).then((r) => { if (r) X.textToTable(V(), r.sep); }) }, { label: 'Tableau rapide : planning de formation', icon: 'calendar-clock', on: () => A.insertQuickTable('planning') }, { label: 'Tableau rapide : feuille d\'émargement', icon: 'signature', on: () => A.insertQuickTable('emargement') }, { label: 'Tableau rapide : devis', icon: 'receipt-text', on: () => A.insertQuickTable('devis') }];
  }
  function shapesMenu(onPick) {
    const P = window.Pres; const node = O.h('div', { cls: 'o-gal-pop' });
    node.innerHTML = P.SHAPE_CATS.map((c) => '<div class="o-cp-lbl">' + c[1] + '</div><div class="sh-grid">' + P.SHAPES.filter((s) => s.cat === c[0]).map((s) => '<button type="button" data-s="' + s.id + '" title="' + O.esc(s.name) + '">' + shapeIcon(s.id) + '</button>').join('') + '</div>').join('');
    node.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { O.closeMenu(); onPick(b.dataset.s); } });
    return [{ node }];
  }
  function shapeIcon(id) { const P = window.Pres; if (P.isLineShape(id)) return '<svg viewBox="0 0 24 24" width="20" height="20"><path d="' + (/^elbow/.test(id) ? 'M3,5 H12 V19 H21' : /^curve/.test(id) ? 'M3,5 C12,5 12,19 21,19' : 'M3,21 L21,3') + '" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'; return '<svg viewBox="-1 -1 26 26" width="20" height="20">' + P.shapeParts(id, 24, 24, (P.DEFAULT_ADJ || {})[id] || {}).map((p) => '<path d="' + p.d + '" fill="' + (p.fill === 'none' ? 'none' : 'currentColor') + '" fill-opacity=".3" stroke="currentColor" stroke-width="1.2"/>').join('') + '</svg>'; }
  function symbolMenu() {
    const sy = '€ £ $ ¥ © ® ™ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ π Ω µ α β γ Δ θ λ σ φ → ← ↑ ↓ ↔ ⇒ ⇔ • · … « » ‰ § ¶ ✓ ✔ ✗ ★ ☆ ♥ ◆ ■ □ ● ○ ▲ ▼ ► ◄ ☎ ✉ ⚠ ☐ ☑ ☒ ½ ¼ ¾ ² ³ ¹ œ Œ æ Æ ç Ç É È Ê À Â Ô Û Ù Î Ï – — ‘ ’ “ ”'.split(' ');
    const node = O.h('div', { cls: 'o-gal-pop' }); node.innerHTML = '<div class="sym-grid">' + sy.map((s) => '<button type="button" data-s="' + s + '">' + s + '</button>').join('') + '</div>';
    node.addEventListener('mousedown', (e) => e.preventDefault());
    node.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; O.closeMenu(); X.symbol(V(), b.dataset.s); });
    return [{ node }, '-', { label: 'Autres symboles…', icon: 'omega', on: () => D.symbols() }, { label: 'Espace insécable', kbd: 'Ctrl+Maj+Espace', on: () => X.insertText(V(), '\u00a0') }, { label: 'Espace fine insécable', on: () => X.insertText(V(), '\u202f') }, { label: 'Tiret insécable', on: () => X.insertText(V(), '\u2011') }, { label: 'Trait d\'union conditionnel', on: () => X.insertText(V(), '\u00ad') }];
  }

  /* ---------------- ruban ---------------- */
  const TABS = [];
  const textOk = () => !nodeSel() || !!nodeSel('paragraph');
  TABS.push({ id: 'home', label: 'Accueil', groups: [
    { label: 'Presse-papiers', items: [
      { type: 'split', id: 'paste', icon: 'clipboard-paste', label: 'Coller', size: 'lg', on: () => C.paste(), menu: () => [{ label: 'Coller', icon: 'clipboard-paste', kbd: 'Ctrl+V', on: () => C.paste() }, { label: 'Coller le texte seul', icon: 'type', kbd: 'Ctrl+Maj+V', on: () => C.paste(true) }] },
      { type: 'col', items: [{ id: 'cut', icon: 'scissors', label: 'Couper', kbd: 'mod+x', on: () => { V().focus(); document.execCommand('cut'); } }, { id: 'copy', icon: 'copy', label: 'Copier', kbd: 'mod+c', on: () => { V().focus(); document.execCommand('copy'); } }, { id: 'painter', icon: 'paintbrush', label: 'Reproduire la mise en forme', title: 'Reproduire la mise en forme (double-clic : plusieurs fois)', active: () => !!A.painter, on: () => C.painter() }] }
    ] },
    { label: 'Police', launcher: () => D.font(), items: [
      { type: 'col', items: [
        { type: 'row', items: [
          { type: 'select', id: 'font', edit: true, width: 150, title: 'Police', options: fontOptions, value: () => fs().font || '', on: (c, v) => X.font(V(), v) },
          { type: 'select', id: 'size', edit: true, width: 56, title: 'Taille de police', options: () => SIZES.map((s) => [s, String(s).replace('.', ',')]), value: () => { const s = fs().size; return s ? String(O.round(s, 1)).replace('.', ',') : ''; }, on: (c, v) => { const n = parseFloat(String(v).replace(',', '.')); if (n > 0 && n < 1639) X.size(V(), n); } },
          { id: 'grow', icon: 'a-arrow-up', label: 'Agrandir la police', showLabel: false, kbd: 'mod+shift+>', on: () => X.grow(V(), 1) },
          { id: 'shrink', icon: 'a-arrow-down', label: 'Réduire la police', showLabel: false, kbd: 'mod+shift+<', on: () => X.grow(V(), -1) },
          { type: 'menu', icon: 'case-sensitive', label: 'Majuscules/minuscules', showLabel: false, items: () => [['sentence', 'Majuscule en début de phrase.'], ['lower', 'minuscules'], ['upper', 'MAJUSCULES'], ['title', 'Chaque Mot En Majuscule'], ['toggle', 'iNVERSER lA cASSE']].map((x) => ({ label: x[1], on: () => X.changeCase(V(), x[0]) })) },
          { id: 'clearf', icon: 'remove-formatting', label: 'Effacer toute la mise en forme', showLabel: false, on: () => X.clearAll(V()) }
        ] },
        { type: 'row', items: [
          { id: 'b', icon: 'bold', label: 'Gras', showLabel: false, kbd: 'mod+b', active: () => fs().bold, on: () => X.toggle(V(), 'b') },
          { id: 'i', icon: 'italic', label: 'Italique', showLabel: false, kbd: 'mod+i', active: () => fs().italic, on: () => X.toggle(V(), 'i') },
          { type: 'split', id: 'u', icon: 'underline', label: 'Souligné', kbd: 'mod+u', active: () => fs().underline, on: () => X.toggle(V(), 'u'), menu: () => TX.UL_STYLES.map((x) => ({ label: x[1], checked: fs().ulStyle === x[0], on: () => X.underline(V(), x[0]) })).concat(['-', { label: 'Couleur du soulignement…', icon: 'palette', on: () => pick(null, A.ribbon.el, (c) => X.underline(V(), fs().ulStyle || 'single', c), { auto: 'Automatique', title: 'Couleur du soulignement' }) }]) },
          { id: 's', icon: 'strikethrough', label: 'Barré', showLabel: false, active: () => fs().strike, on: () => X.toggle(V(), 's') },
          { id: 'sub', icon: 'subscript', label: 'Indice', showLabel: false, kbd: 'mod+=', active: () => fs().sub, on: () => X.toggle(V(), 'sub') },
          { id: 'sup', icon: 'superscript', label: 'Exposant', showLabel: false, kbd: 'mod+shift++', active: () => fs().sup, on: () => X.toggle(V(), 'sup') },
          { type: 'menu', icon: 'wand-sparkles', label: 'Effets de texte', showLabel: false, items: () => [{ label: 'Barré double', checked: fs().dstrike, on: () => X.toggle(V(), 'ss') }, { label: 'Petites majuscules', checked: fs().smcaps, on: () => X.toggle(V(), 'smcaps') }, { label: 'Majuscules', checked: fs().caps, on: () => X.toggle(V(), 'caps') }, { label: 'Masqué', checked: fs().hidden, on: () => X.toggle(V(), 'hidden') }, '-', { label: 'Espacement des caractères', sub: [[-1, 'Serré'], [0, 'Normal'], [1, 'Étendu'], [2, 'Très étendu']].map((x) => ({ label: x[1], checked: (fs().spacing || 0) === x[0], on: () => X.spacing(V(), x[0]) })) }, { label: 'Trame du texte', icon: 'paint-bucket', on: () => pick(null, A.ribbon.el, (c) => X.shade(V(), c), { none: 'Aucune', title: 'Trame du texte' }) }] },
          { type: 'color', id: 'hcolor', icon: 'highlighter', label: 'Couleur de surbrillance', def: 'yellow', css: colorCss, value: () => fs().highlight, on: (c, v) => X.highlight(V(), v), picker: (c, a, ap) => hlPicker(a, ap) },
          { type: 'color', id: 'fcolor', icon: 'baseline', label: 'Couleur de police', def: '#C00000', css: colorCss, value: () => fs().color, on: (c, v) => X.color(V(), v === 'auto' ? null : v), picker: (c, a, ap) => pick(c, a, ap, { auto: 'Automatique', title: 'Couleur de police' }) }
        ] }
      ] }
    ] },
    { label: 'Paragraphe', launcher: () => D.paragraph(), items: [
      { type: 'col', items: [
        { type: 'row', items: [
          { type: 'split', id: 'ul', icon: 'list', label: 'Puces', kbd: 'mod+shift+l', active: () => fs().list && (A.attrs().lists[fs().list.id] || {}).k === 'bullet', on: () => X.list(V(), 'puces'), menu: () => listMenu(TX.LIST_GALLERY.bullet) },
          { type: 'split', id: 'ol', icon: 'list-ordered', label: 'Numérotation', active: () => fs().list && (A.attrs().lists[fs().list.id] || {}).k === 'number', on: () => X.list(V(), 'num'), menu: () => listMenu(TX.LIST_GALLERY.number) },
          { type: 'menu', id: 'ml', icon: 'list-tree', label: 'Liste à plusieurs niveaux', showLabel: false, items: () => listMenu(TX.LIST_GALLERY.multi) },
          { id: 'outd', icon: 'indent-decrease', label: 'Diminuer le retrait', showLabel: false, kbd: 'mod+shift+m', on: () => X.indent(V(), -1) },
          { id: 'ind', icon: 'indent-increase', label: 'Augmenter le retrait', showLabel: false, kbd: 'mod+m', on: () => X.indent(V(), 1) },
          { id: 'sortp', icon: 'arrow-down-a-z', label: 'Trier', showLabel: false, on: () => D.sortParas() },
          { id: 'marks', icon: 'pilcrow', label: 'Afficher tout (¶)', showLabel: false, kbd: 'mod+*', active: () => !!A.settings.marks, on: () => C.toggleMarks() }
        ] },
        { type: 'row', items: [
          { id: 'al', icon: 'align-left', label: 'Aligner à gauche', showLabel: false, kbd: 'mod+l', active: () => fs().align === 'left', on: () => X.align(V(), 'left') },
          { id: 'ac', icon: 'align-center', label: 'Centrer', showLabel: false, kbd: 'mod+e', active: () => fs().align === 'center', on: () => X.align(V(), 'center') },
          { id: 'ar', icon: 'align-right', label: 'Aligner à droite', showLabel: false, kbd: 'mod+r', active: () => fs().align === 'right', on: () => X.align(V(), 'right') },
          { id: 'aj', icon: 'align-justify', label: 'Justifier', showLabel: false, kbd: 'mod+j', active: () => fs().align === 'justify', on: () => X.align(V(), 'justify') },
          { type: 'menu', icon: 'list-collapse', label: 'Interligne et espacement', showLabel: false, items: () => [1, 1.08, 1.15, 1.5, 2, 2.5, 3].map((v) => ({ label: String(v).replace('.', ','), checked: Math.abs((fs().p.ln || 1) - v) < 0.01 && (!fs().p.lr || fs().p.lr === 'auto'), on: () => X.lineSpacing(V(), v) })).concat(['-', { label: 'Options d\'interligne…', icon: 'sliders-horizontal', on: () => D.paragraph() }, { label: fs().p.sb ? 'Supprimer l\'espace avant le paragraphe' : 'Ajouter un espace avant le paragraphe', on: () => X.spaceBefore(V(), fs().p.sb ? 0 : 12) }, { label: fs().p.sa ? 'Supprimer l\'espace après le paragraphe' : 'Ajouter un espace après le paragraphe', on: () => X.spaceAfter(V(), fs().p.sa ? 0 : 8) }]) },
          { type: 'color', id: 'pshade', icon: 'paint-bucket', label: 'Trame de fond', def: '#D9E2F3', css: colorCss, value: () => fs().p.sh || null, on: (c, v) => X.paraShade(V(), v), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucune couleur', title: 'Trame de fond' }) },
          { type: 'split', id: 'pborder', icon: 'square-dashed', label: 'Bordures', on: () => X.paraBorder(V(), 'bottom'), menu: () => [['bottom', 'Bordure inférieure', 'panel-bottom'], ['top', 'Bordure supérieure', 'panel-top'], ['left', 'Bordure gauche', 'panel-left'], ['right', 'Bordure droite', 'panel-right'], ['outside', 'Bordures extérieures', 'square'], ['none', 'Aucune bordure', 'square-dashed']].map((x) => ({ label: x[1], icon: x[2], on: () => X.paraBorder(V(), x[0]) })).concat(['-', { label: 'Ligne horizontale', icon: 'minus', on: () => C.hRule() }, { label: 'Bordure et trame…', icon: 'frame', on: () => D.borders() }]) }
        ] }
      ] }
    ] },
    { label: 'Styles', launcher: () => A.openPane('styles'), items: [
      { type: 'gallery', id: 'styles', title: 'Styles', w: 84, h: 52, items: () => styleItems(), current: () => fs().cstyle || fs().style, on: (c, it) => X.setStyle(V(), it.id), footer: () => '<div style="display:flex;gap:6px;padding:8px 2px 2px;flex-wrap:wrap"><button type="button" class="mini-btn" data-gact="new">' + O.icon('plus') + 'Créer un style</button><button type="button" class="mini-btn" data-gact="clear">' + O.icon('remove-formatting') + 'Effacer la mise en forme</button><button type="button" class="mini-btn" data-gact="pane">' + O.icon('panel-right') + 'Volet Styles</button></div>', footerAct: (c, a) => { if (a === 'new') D.newStyle(); else if (a === 'clear') X.clearAll(V()); else A.openPane('styles'); } }
    ] },
    { label: 'Modification', items: [{ type: 'col', items: [
      { type: 'split', icon: 'search', label: 'Rechercher', kbd: 'mod+f', on: () => A.openNav('results'), menu: () => [{ label: 'Rechercher', icon: 'search', kbd: 'Ctrl+F', on: () => A.openNav('results') }, { label: 'Recherche avancée…', icon: 'text-search', on: () => A.openPane('find') }, { label: 'Atteindre…', icon: 'arrow-down-to-line', kbd: 'Ctrl+G', on: () => D.goTo() }] },
      { icon: 'replace', label: 'Remplacer', kbd: 'mod+h', on: () => A.openPane('find', { replace: true }) },
      { type: 'menu', icon: 'mouse-pointer-2', label: 'Sélectionner', items: () => [{ label: 'Tout sélectionner', kbd: 'Ctrl+A', on: () => { const v = V(); v.dispatch(v.state.tr.setSelection(new PM.state.AllSelection(v.state.doc))); v.focus(); } }, { label: 'Sélectionner le texte de même style', on: () => C.selectSameStyle() }, { label: 'Volet de navigation', icon: 'panel-left', on: () => A.openNav('heads') }] }
    ] }] }
  ] });
  function hlPicker(anchor, apply) {
    const node = O.h('div', { cls: 'o-cpick' });
    node.innerHTML = '<div class="o-cp-lbl">Surlignage</div><div class="o-cp-grid" style="grid-template-columns:repeat(5,1fr)">' + Object.keys(TX.HL).map((k) => '<button type="button" class="o-sw" style="background:' + TX.HL[k] + '" data-c="' + k + '" title="' + k + '"></button>').join('') + '</div><div class="o-cp-row"><button type="button" class="o-cp-wide" data-c="none">' + O.icon('ban') + 'Aucune couleur</button></div>';
    node.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; O.closeMenu(); apply(b.dataset.c === 'none' ? null : b.dataset.c); });
    return O.menu(anchor, [{ node }], { title: 'Surlignage' });
  }
  TABS.push({ id: 'insert', label: 'Insertion', groups: [
    { label: 'Pages', items: [{ type: 'col', items: [
      { type: 'menu', icon: 'book-open-text', label: 'Page de garde', items: () => TX.Templates.COVERS.map((c) => ({ label: c.name, icon: 'file-text', on: () => A.insertCover(c.id) })).concat(['-', { label: 'Supprimer la page de garde', icon: 'trash-2', on: () => A.removeCover() }]) },
      { icon: 'file-plus', label: 'Page vierge', on: () => { X.pageBreak(V()); X.pageBreak(V()); } },
      { icon: 'separator-horizontal', label: 'Saut de page', kbd: 'mod+enter', on: () => X.pageBreak(V()) }
    ] }] },
    { label: 'Tableaux', items: [{ type: 'menu', icon: 'table', label: 'Tableau', size: 'lg', items: () => tableGrid() }] },
    { label: 'Illustrations', items: [
      { icon: 'image', label: 'Images', size: 'lg', on: () => C.insertImage(), title: 'Images de cet appareil' },
      { type: 'menu', icon: 'shapes', label: 'Formes', size: 'lg', items: () => shapesMenu((s) => C.addShape(s)) },
      { type: 'col', items: [{ icon: 'smile-plus', label: 'Icônes', on: () => D.icons() }, { type: 'menu', icon: 'chart-column', label: 'Graphique', items: () => window.Pres.CHART_KINDS.map((k) => ({ label: k[1], icon: k[2], on: () => C.addChart(k[0]) })) }, { type: 'menu', icon: 'network', label: 'SmartArt', items: () => window.Pres.SMART_KINDS.map((k) => ({ label: k[1], icon: k[2], on: () => C.addSmart(k[0]) })) }] }
    ] },
    { label: 'Liens', items: [{ type: 'col', items: [{ icon: 'link', label: 'Lien', kbd: 'mod+k', on: () => D.link() }, { icon: 'bookmark', label: 'Signet', on: () => D.bookmark() }, { icon: 'file-symlink', label: 'Renvoi', on: () => D.crossRef() }] }] },
    { label: 'Commentaires', items: [{ icon: 'message-square-plus', label: 'Commentaire', size: 'lg', kbd: 'mod+alt+m', on: () => C.addComment() }] },
    { label: 'En-tête et pied de page', items: [{ type: 'col', items: [
      { type: 'menu', icon: 'panel-top', label: 'En-tête', items: () => partMenu('hdr') },
      { type: 'menu', icon: 'panel-bottom', label: 'Pied de page', items: () => partMenu('ftr') },
      { type: 'menu', icon: 'hash', label: 'Numéro de page', items: () => pageNumMenu() }
    ] }] },
    { label: 'Texte', items: [
      { icon: 'square-dashed-text', label: 'Zone de texte', size: 'lg', on: () => C.addTextBox() },
      { type: 'col', items: [
        { type: 'menu', icon: 'case-upper', label: 'Lettrine', items: () => [{ label: 'Aucune', on: () => X.dropCap(V(), 'none') }, { label: 'Dans le texte (3 lignes)', on: () => X.dropCap(V(), 'drop', 3) }, { label: 'Dans la marge (3 lignes)', on: () => X.dropCap(V(), 'margin', 3) }, { label: 'Options de lettrine…', on: () => O.form('Lettrine', [{ id: 'mode', type: 'select', label: 'Position', value: 'drop', options: [['drop', 'Dans le texte'], ['margin', 'Dans la marge'], ['none', 'Aucune']] }, { id: 'n', type: 'number', label: 'Hauteur (lignes)', value: 3, min: 2, max: 10 }]).then((r) => { if (r) X.dropCap(V(), r.mode, r.n); }) }] },
        { icon: 'calendar-clock', label: 'Date et heure', kbd: 'alt+shift+d', on: () => D.dateTime() },
        { type: 'menu', icon: 'braces', label: 'Champ', items: () => TX.FIELD_KINDS.filter((k) => !/^(seq|ref|merge)$/.test(k[0])).map((k) => ({ label: k[1], on: () => X.insertField(V(), k[0]) })).concat(['-', { label: 'Champ de fusion…', on: () => A.openPane('merge') }, { label: 'Mettre à jour les champs', icon: 'refresh-cw', kbd: 'F9', on: () => A.refreshFields() }]) }
      ] }
    ] },
    { label: 'Symboles', items: [{ type: 'split', icon: 'sigma', label: 'Équation', size: 'lg', kbd: 'alt+=', on: () => D.equation(), menu: () => [['x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', 'Formule quadratique'], ['a^2 + b^2 = c^2', 'Théorème de Pythagore'], ['F = m \\cdot a', 'Deuxième loi de Newton'], ['P = \\frac{F}{S}', 'Pression'], ['\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}', 'Somme'], ['Q = \\frac{\\lambda \\cdot S \\cdot \\Delta T}{e}', 'Flux thermique (calorifuge)']].map((x) => ({ label: x[1], on: () => X.insertMath(V(), x[0], true) })).concat(['-', { label: 'Insérer une nouvelle équation…', icon: 'sigma', on: () => D.equation() }]) }, { type: 'menu', icon: 'omega', label: 'Symbole', size: 'lg', items: () => symbolMenu() }] }
  ] });
  function partMenu(kind) {
    const L = kind === 'hdr' ? 'En-tête' : 'Pied de page';
    return [{ label: 'Modifier l\'' + (kind === 'hdr' ? 'en-tête' : 'en-tête').replace('en-tête', kind === 'hdr' ? 'en-tête' : 'pied de page'), icon: 'square-pen', on: () => A.editPart(A.layout.visiblePage(), kind) }, '-'].concat(TX.Templates.PARTS.filter((p) => p.kind === kind).map((p) => ({ label: p.name, icon: kind === 'hdr' ? 'panel-top' : 'panel-bottom', on: () => A.applyPartTemplate(kind, p.id) }))).concat(['-', { label: 'Supprimer l\'' + L.toLowerCase().replace('pied de page', 'pied de page'), icon: 'trash-2', on: () => A.removePart(kind) }]);
  }
  function pageNumMenu() {
    return [{ head: 'Haut de page' }, { label: 'À gauche', on: () => A.pageNumber('hdr', 'left') }, { label: 'Au centre', on: () => A.pageNumber('hdr', 'center') }, { label: 'À droite', on: () => A.pageNumber('hdr', 'right') }, { head: 'Bas de page' }, { label: 'À gauche', on: () => A.pageNumber('ftr', 'left') }, { label: 'Au centre', on: () => A.pageNumber('ftr', 'center') }, { label: 'À droite', on: () => A.pageNumber('ftr', 'right') }, { label: '« Page X sur Y » au centre', on: () => A.pageNumber('ftr', 'center', true) }, { label: '« Page X sur Y » à droite', on: () => A.pageNumber('ftr', 'right', true) }, '-', { label: 'Position actuelle', on: () => X.insertField(V(), 'page') }, { label: 'Format des numéros de page…', icon: 'hash', on: () => D.pageNumFormat() }, { label: 'Supprimer les numéros de page', icon: 'trash-2', on: () => A.removePageNumbers() }];
  }
  TABS.push({ id: 'design', label: 'Création', groups: [
    { label: 'Mise en forme du document', items: [
      { type: 'gallery', id: 'themes', title: 'Thèmes', w: 70, h: 52, items: () => T.list.map((t) => ({ id: t.id, title: t.name, html: '<div style="width:100%;height:100%;background:' + (t.dark ? t.colors.dk1 : '#fff') + ';display:flex;flex-direction:column;padding:4px;gap:2px"><b style="font:700 11px ' + O.fontStack(t.fonts.major).replace(/"/g, "'") + ';color:' + t.colors.accent1 + '">Aa</b><span style="display:flex;gap:2px">' + [1, 2, 3, 4].map((k) => '<i style="flex:1;height:7px;background:' + t.colors['accent' + k] + '"></i>').join('') + '</span><small style="font:9px var(--o-font);color:' + (t.dark ? '#fff' : '#555') + ';white-space:nowrap;overflow:hidden">' + O.esc(t.name) + '</small></div>' })), current: () => ((A.attrs().settings || {}).theme || {}).id, on: (c, it) => C.setTheme(it.id) },
      { type: 'gallery', id: 'stylesets', title: 'Jeux de styles', w: 78, h: 52, items: () => TX.STYLE_SETS.map((s) => ({ id: s.id, title: s.name, html: '<div class="gal-st" style="padding:4px"><b style="font-size:11px;' + ((s.mod.Titre1 && s.mod.Titre1.r && s.mod.Titre1.r.c && !/^t:/.test(s.mod.Titre1.r.c)) ? 'color:' + s.mod.Titre1.r.c : 'color:var(--o-acc)') + '">Titre 1</b><small style="font-size:9px">' + O.esc(s.name) + '</small></div>' })), current: () => (A.attrs().settings || {}).styleSet || 'defaut', on: (c, it) => C.setStyleSet(it.id) },
      { type: 'col', items: [
        { type: 'menu', icon: 'palette', label: 'Couleurs', items: () => T.list.map((t) => ({ label: t.name, html: '<span style="display:inline-flex;gap:2px;margin-right:8px">' + ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((k) => '<i style="width:11px;height:11px;display:inline-block;background:' + t.colors[k] + '"></i>').join('') + '</span>' + O.esc(t.name), on: () => C.setThemeColors(t.id) })) },
        { type: 'menu', icon: 'type', label: 'Polices', items: () => T.fontPairs.map((p) => ({ label: p[0] + ' / ' + p[1], html: '<span style="font-family:' + O.fontStack(p[0]).replace(/"/g, "'") + '">' + O.esc(p[0]) + '</span> <small class="o-mi-note">' + O.esc(p[1]) + '</small>', on: () => C.setThemeFonts(p) })) },
        { type: 'menu', icon: 'list-collapse', label: 'Espacement de paragraphe', items: () => [['defaut', 'Par défaut (style)', null], ['aucun', 'Aucun espacement', { sa: 0, ln: 1 }], ['compact', 'Compact', { sa: 4, ln: 1 }], ['serre', 'Serré', { sa: 6, ln: 1.15 }], ['ouvert', 'Ouvert', { sa: 10, ln: 1.15 }], ['detendu', 'Détendu', { sa: 6, ln: 1.5 }], ['double', 'Double', { sa: 8, ln: 2 }]].map((x) => ({ label: x[1], on: () => C.paraSpacingSet(x[2]) })) }
      ] }
    ] },
    { label: 'Arrière-plan de page', items: [
      { type: 'menu', icon: 'stamp', label: 'Filigrane', size: 'lg', items: () => ['CONFIDENTIEL', 'BROUILLON', 'EXEMPLE', 'URGENT', 'NE PAS COPIER', 'COPIE'].map((t) => ({ label: t, on: () => C.watermark({ text: t }) })).concat(['-', { label: 'Filigrane personnalisé…', icon: 'stamp', on: () => D.watermark() }, { label: 'Supprimer le filigrane', icon: 'trash-2', on: () => C.watermark(null) }]) },
      { type: 'color', id: 'pagecolor', icon: 'paint-bucket', label: 'Couleur de page', showLabel: true, def: '#FFF8E1', css: colorCss, value: () => (A.attrs().settings || {}).pageColor, on: (c, v) => C.pageColor(v), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucune couleur', title: 'Couleur de page' }) },
      { icon: 'frame', label: 'Bordures de page', size: 'lg', on: () => D.pageBorders() }
    ] }
  ] });
  TABS.push({ id: 'layout', label: 'Mise en page', groups: [
    { label: 'Mise en page', launcher: () => D.pageSetup(), items: [
      { type: 'menu', icon: 'ruler-dimension-line', label: 'Marges', size: 'lg', items: () => TX.MARGINS.map((m) => ({ label: m.name, html: '<b>' + O.esc(m.name) + '</b> <small class="o-mi-note">H ' + cmTxt(m.t) + ' · B ' + cmTxt(m.b) + ' · G ' + cmTxt(m.l) + ' · D ' + cmTxt(m.r) + '</small>', on: () => X.margins(V(), m, 'all') })).concat(['-', { label: 'Marges personnalisées…', icon: 'sliders-horizontal', on: () => D.pageSetup('margins') }]) },
      { type: 'menu', icon: 'rectangle-vertical', label: 'Orientation', size: 'lg', items: () => [{ label: 'Portrait', icon: 'rectangle-vertical', checked: curPg().orient !== 'landscape', on: () => X.orient(V(), 'portrait', A.multiSection() ? 'section' : 'all') }, { label: 'Paysage', icon: 'rectangle-horizontal', checked: curPg().orient === 'landscape', on: () => X.orient(V(), 'landscape', A.multiSection() ? 'section' : 'all') }, '-', { label: 'Cette page seulement en paysage (sauts de section)', icon: 'file-stack', on: () => C.landscapeHere() }] },
      { type: 'menu', icon: 'file', label: 'Taille', size: 'lg', items: () => TX.PAGE_SIZES.map((s) => ({ label: s.name, html: '<b>' + s.name + '</b> <small class="o-mi-note">' + s.desc + '</small>', checked: curPg().size === s.id, on: () => X.pageSize(V(), s.id, A.multiSection() ? 'section' : 'all') })).concat(['-', { label: 'Autres tailles…', on: () => D.pageSetup('paper') }]) },
      { type: 'menu', icon: 'columns-2', label: 'Colonnes', size: 'lg', items: () => [[1, 'Une'], [2, 'Deux'], [3, 'Trois']].map((x) => ({ label: x[1], checked: (curPg().cols || {}).n === x[0], on: () => X.columns(V(), x[0], {}, 'section') })).concat(['-', { label: 'Autres colonnes…', on: () => D.columns() }]) },
      { type: 'col', items: [
        { type: 'menu', icon: 'separator-horizontal', label: 'Sauts', items: () => [{ head: 'Sauts de page' }, { label: 'Page', kbd: 'Ctrl+Entrée', on: () => X.pageBreak(V()) }, { label: 'Colonne', kbd: 'Ctrl+Maj+Entrée', on: () => X.colBreak(V()) }, { label: 'Ligne (habillage)', kbd: 'Maj+Entrée', on: () => X.insertNode(V(), TX.schema.nodes.hard_break.create()) }, { head: 'Sauts de section' }, { label: 'Page suivante', on: () => X.sectionBreak(V(), 'page') }, { label: 'Continu', on: () => X.sectionBreak(V(), 'continuous') }, { label: 'Page paire', on: () => X.sectionBreak(V(), 'even') }, { label: 'Page impaire', on: () => X.sectionBreak(V(), 'odd') }] },
        { icon: 'ligature', label: 'Coupure de mots', active: () => !!(A.attrs().settings || {}).hyphen, on: () => C.setSetting('hyphen', !(A.attrs().settings || {}).hyphen, 'Coupure de mots') },
        { type: 'menu', icon: 'panel-top', label: 'En-tête / pied', items: () => [{ label: 'Première page différente', checked: !!curPg().titlePg, on: () => X.setPage(V(), { titlePg: !curPg().titlePg }, 'section') }, { label: 'Pages paires et impaires différentes', checked: !!(A.attrs().settings || {}).evenOdd, on: () => C.setSetting('evenOdd', !(A.attrs().settings || {}).evenOdd, 'Paires et impaires') }, '-', { label: 'Modifier l\'en-tête', on: () => A.editPart(A.layout.visiblePage(), 'hdr') }, { label: 'Modifier le pied de page', on: () => A.editPart(A.layout.visiblePage(), 'ftr') }] }
      ] }
    ] },
    { label: 'Paragraphe', launcher: () => D.paragraph(), items: [
      { type: 'col', items: [{ type: 'num', id: 'il', label: 'Retrait gauche', icon: 'indent-increase', unit: 'cm', step: 0.1, width: 54, value: () => O.round(TX.pt2cm(fs().p.il || 0), 2), on: (c, v) => X.setPara(V(), { il: TX.cm2pt(v) }, 'Retrait') }, { type: 'num', id: 'ir', label: 'Retrait droit', icon: 'indent-decrease', unit: 'cm', step: 0.1, width: 54, value: () => O.round(TX.pt2cm(fs().p.ir || 0), 2), on: (c, v) => X.setPara(V(), { ir: TX.cm2pt(v) }, 'Retrait') }] },
      { type: 'col', items: [{ type: 'num', id: 'sb', label: 'Avant', icon: 'arrow-up-from-line', unit: 'pt', step: 6, width: 50, value: () => fs().p.sb || 0, on: (c, v) => X.spaceBefore(V(), v) }, { type: 'num', id: 'sa', label: 'Après', icon: 'arrow-down-to-line', unit: 'pt', step: 6, width: 50, value: () => fs().p.sa || 0, on: (c, v) => X.spaceAfter(V(), v) }] }
    ] },
    { label: 'Organiser', items: [
      { type: 'menu', icon: 'move', label: 'Position', size: 'lg', disabled: () => !objSel(), items: () => positionMenu() },
      { type: 'menu', icon: 'text-wrap', label: 'Habiller le texte', size: 'lg', disabled: () => !objSel(), items: () => wrapMenu() },
      { type: 'col', items: [{ icon: 'bring-to-front', label: 'Devant le texte', disabled: () => !objSel(), on: () => C.objAttrs({ wrap: 'front' }) }, { icon: 'send-to-back', label: 'Derrière le texte', disabled: () => !objSel(), on: () => C.objAttrs({ wrap: 'behind' }) }, { type: 'menu', icon: 'rotate-cw', label: 'Faire pivoter', disabled: () => !objSel(), items: () => rotateMenu() }] }
    ] }
  ] });
  const cmTxt = (pt) => String(O.round(TX.pt2cm(pt), 2)).replace('.', ',') + ' cm';
  const curPg = () => { const s = A.ed.view.state; const i = s.selection.$from.index(0); return TX.pg(s.doc.child(Math.min(i, s.doc.childCount - 1))); };
  A.curPg = curPg;
  A.multiSection = () => A.ed.view.state.doc.childCount > 1;
  const objSel = () => { const n = nodeSel(); return n && (n.type.name === 'image' || n.type.name === 'drawing') ? n : null; };
  A.objSel = objSel;
  function wrapMenu() {
    const n = objSel(), w = n ? n.attrs.wrap : 'inline';
    return [['inline', 'Aligné sur le texte', 'text-cursor'], ['square', 'Carré', 'square'], ['tight', 'Rapproché', 'square-dashed'], ['topBottom', 'Haut et bas', 'rows-3'], ['behind', 'Derrière le texte', 'send-to-back'], ['front', 'Devant le texte', 'bring-to-front']].map((x) => ({ label: x[1], icon: x[2], checked: w === x[0], on: () => C.objAttrs({ wrap: x[0] }) })).concat(['-', { label: 'Aligner à gauche', checked: n && n.attrs.al === 'left', on: () => C.objAttrs({ al: 'left' }) }, { label: 'Centrer', checked: n && n.attrs.al === 'center', on: () => C.objAttrs({ al: 'center', wrap: n && /square|tight/.test(n.attrs.wrap) ? 'topBottom' : n && n.attrs.wrap }) }, { label: 'Aligner à droite', checked: n && n.attrs.al === 'right', on: () => C.objAttrs({ al: 'right' }) }, '-', { label: 'Autres options…', icon: 'sliders-horizontal', on: () => D.objectProps('wrap') }]);
  }
  function positionMenu() {
    return [{ label: 'Aligné sur le texte', on: () => C.objAttrs({ wrap: 'inline' }) }, { head: 'Avec habillage carré' }].concat([['left', 'En haut à gauche'], ['center', 'Centré (haut et bas)'], ['right', 'En haut à droite']].map((x) => ({ label: x[1], on: () => C.objAttrs({ wrap: x[0] === 'center' ? 'topBottom' : 'square', al: x[0] }) }))).concat(['-', { label: 'Plus d\'options de disposition…', icon: 'sliders-horizontal', on: () => D.objectProps('wrap') }]);
  }
  function rotateMenu() { return [{ label: 'Rotation de 90° à droite', on: () => C.objAttrs((a) => ({ rot: ((a.rot || 0) + 90) % 360 })) }, { label: 'Rotation de 90° à gauche', on: () => C.objAttrs((a) => ({ rot: ((a.rot || 0) + 270) % 360 })) }, { label: 'Retourner horizontalement', on: () => C.objAttrs((a) => ({ fh: !a.fh })) }, { label: 'Retourner verticalement', on: () => C.objAttrs((a) => ({ fv: !a.fv })) }, { label: 'Rétablir (0°)', on: () => C.objAttrs({ rot: 0, fh: false, fv: false }) }]; }
  TABS.push({ id: 'refs', label: 'Références', groups: [
    { label: 'Table des matières', items: [
      { type: 'menu', icon: 'table-of-contents', label: 'Table des matières', size: 'lg', items: () => [{ label: 'Automatique (3 niveaux, avec titre)', icon: 'list-tree', on: () => C.insertToc({ levels: 3, title: 'Table des matières' }) }, { label: 'Automatique (2 niveaux)', icon: 'list-tree', on: () => C.insertToc({ levels: 2, title: 'Sommaire' }) }, { label: 'Automatique (4 niveaux, sans titre)', icon: 'list-tree', on: () => C.insertToc({ levels: 4 }) }, { label: 'Table des matières personnalisée…', icon: 'sliders-horizontal', on: () => D.toc() }, '-', { label: 'Supprimer la table des matières', icon: 'trash-2', on: () => C.removeToc() }] },
      { type: 'col', items: [{ icon: 'refresh-cw', label: 'Mettre à jour la table', on: () => { A.refreshFields(); O.toast('Tables et champs mis à jour', { ms: 1200 }); } }, { icon: 'list-plus', label: 'Ajouter le texte', title: 'Niveau du paragraphe dans la table des matières', on: () => O.menu(A.ribbon.el, [{ label: 'Ne pas afficher dans la table', on: () => X.setPara(V(), { ol: 0 }) }].concat([1, 2, 3, 4].map((l) => ({ label: 'Niveau ' + l, on: () => X.setStyle(V(), 'Titre' + l) })))) }] }
    ] },
    { label: 'Notes de bas de page', launcher: () => D.notesOptions(), items: [
      { icon: 'footprints', label: 'Insérer une note de bas de page', size: 'lg', kbd: 'mod+alt+f', on: () => C.footnote(false) },
      { type: 'col', items: [{ icon: 'notebook-pen', label: 'Insérer une note de fin', kbd: 'mod+alt+d', on: () => C.footnote(true) }, { icon: 'arrow-down', label: 'Note suivante', on: () => C.nextNote() }, { icon: 'sticky-note', label: 'Afficher les notes', on: () => C.showNotes() }] }
    ] },
    { label: 'Légendes', items: [
      { icon: 'captions', label: 'Insérer une légende', size: 'lg', on: () => D.caption() },
      { type: 'col', items: [{ icon: 'images', label: 'Table des illustrations', on: () => D.toc('tof') }, { icon: 'refresh-cw', label: 'Mettre à jour', on: () => A.refreshFields() }, { icon: 'file-symlink', label: 'Renvoi', on: () => D.crossRef() }] }
    ] }
  ] });
  TABS.push({ id: 'mail', label: 'Publipostage', groups: [
    { label: 'Démarrer', items: [{ type: 'menu', icon: 'users', label: 'Destinataires', size: 'lg', items: () => [{ label: 'Utiliser un fichier CSV…', icon: 'file-input', on: () => C.mergeImport() }, { label: 'Saisir une nouvelle liste…', icon: 'user-round-plus', on: () => C.mergeNewList() }, { label: 'Modifier la liste…', icon: 'square-pen', disabled: !(A.merge && A.merge.data), on: () => C.mergeEdit() }, '-', { label: 'Exemple : stagiaires d\'une formation', icon: 'graduation-cap', on: () => C.mergeSample() }] }, { icon: 'panel-right', label: 'Volet Publipostage', size: 'lg', on: () => A.openPane('merge') }] },
    { label: 'Champs', items: [{ type: 'menu', icon: 'braces', label: 'Insérer un champ', size: 'lg', disabled: () => !(A.merge && A.merge.data), items: () => (A.merge && A.merge.data ? A.merge.data.cols : []).map((c) => ({ label: c, on: () => X.insertNode(V(), TX.schema.nodes.field.create({ f: 'merge', name: c })) })) }, { icon: 'highlighter', label: 'Surligner les champs', active: () => !!A.settings.mergeHl, on: () => { A.settings.mergeHl = !A.settings.mergeHl; A.saveSettings(); document.documentElement.classList.toggle('tx-mergehl', !!A.settings.mergeHl); } }] },
    { label: 'Aperçu des résultats', items: [
      { icon: 'eye', label: 'Aperçu des résultats', size: 'lg', disabled: () => !(A.merge && A.merge.data), active: () => !!(A.merge && A.merge.preview != null), on: () => C.mergePreview(A.merge.preview == null ? 0 : null) },
      { type: 'col', items: [{ icon: 'chevron-left', label: 'Précédent', disabled: () => !(A.merge && A.merge.preview > 0), on: () => C.mergePreview(A.merge.preview - 1) }, { icon: 'chevron-right', label: 'Suivant', disabled: () => !(A.merge && A.merge.preview != null && A.merge.preview < A.merge.data.rows.length - 1), on: () => C.mergePreview(A.merge.preview + 1) }, { type: 'html', html: () => '<span style="font-size:12px;color:var(--o-tx2);padding:4px">' + (A.merge && A.merge.preview != null ? 'Destinataire ' + (A.merge.preview + 1) + ' / ' + A.merge.data.rows.length : (A.merge && A.merge.data ? A.merge.data.rows.length + ' destinataire(s)' : 'Aucune liste')) + '</span>' }] }
    ] },
    { label: 'Terminer', items: [{ type: 'menu', icon: 'file-stack', label: 'Terminer et fusionner', size: 'lg', disabled: () => !(A.merge && A.merge.data), items: () => [{ label: 'Un seul document (tous les destinataires)', icon: 'file-text', on: () => C.mergeRun('doc') }, { label: 'Un seul PDF (à imprimer)', icon: 'file-badge', on: () => C.mergeRun('pdf') }, { label: 'Un PDF par destinataire (zip)', icon: 'files', on: () => C.mergeRun('pdfs') }, { label: 'Un .docx par destinataire (zip)', icon: 'files', on: () => C.mergeRun('docxs') }] }] }
  ] });
  TABS.push({ id: 'review', label: 'Révision', groups: [
    { label: 'Vérification', items: [{ icon: 'spell-check', label: 'Orthographe', size: 'lg', title: 'Correcteur orthographique du navigateur (français)', active: () => A.settings.spell !== false, on: () => { A.settings.spell = A.settings.spell === false; A.saveSettings(); A.applyUi(); O.toast(A.settings.spell ? 'Vérification de l\'orthographe activée (mots soulignés en rouge ; clic droit pour les suggestions)' : 'Vérification de l\'orthographe désactivée'); } }, { type: 'col', items: [{ icon: 'hash', label: 'Statistiques', kbd: 'mod+shift+g', on: () => D.stats() }, { icon: 'volume-2', label: 'Lecture à voix haute', kbd: 'mod+alt+space', active: () => !!A.speaking, on: () => C.readAloud() }, { icon: 'accessibility', label: 'Accessibilité', on: () => A.openPane('a11y') }] }] },
    { label: 'Commentaires', items: [{ icon: 'message-square-plus', label: 'Nouveau commentaire', size: 'lg', on: () => C.addComment() }, { type: 'col', items: [{ type: 'menu', icon: 'message-square-x', label: 'Supprimer', items: () => [{ label: 'Supprimer ce commentaire', on: () => C.deleteComment(A.activeComment) }, { label: 'Supprimer tous les commentaires', on: () => C.deleteAllComments() }] }, { icon: 'chevron-left', label: 'Précédent', on: () => C.nextComment(-1) }, { icon: 'chevron-right', label: 'Suivant', on: () => C.nextComment(1) }] }, { type: 'col', items: [{ icon: 'messages-square', label: 'Afficher les commentaires', active: () => A.settings.cmts !== false, on: () => { A.settings.cmts = A.settings.cmts === false; A.saveSettings(); A.renderComments(); } }, { icon: 'panel-right', label: 'Volet Commentaires', on: () => A.openPane('comments') }] }] },
    { label: 'Suivi', items: [{ icon: 'file-pen-line', label: 'Suivi des modifications', size: 'lg', kbd: 'mod+shift+e', active: () => !!(A.attrs().settings || {}).track, on: () => C.toggleTrack() }, { type: 'col', items: [{ type: 'menu', icon: 'eye', label: 'Affichage pour révision', items: () => [['all', 'Toutes les marques'], ['simple', 'Marques simples'], ['final', 'Aucune marque'], ['orig', 'Original']].map((x) => ({ label: x[1], checked: (A.settings.rev || 'all') === x[0], on: () => C.revView(x[0]) })) }, { icon: 'panel-right', label: 'Volet Révisions', on: () => A.openPane('revisions') }] }] },
    { label: 'Modifications', items: [{ type: 'split', icon: 'check', label: 'Accepter', size: 'lg', on: () => C.revAccept(true, false), menu: () => [{ label: 'Accepter et passer à la suivante', on: () => C.revAccept(true, false) }, { label: 'Accepter cette modification', on: () => C.revAccept(true, false, true) }, { label: 'Accepter toutes les modifications', on: () => C.revAccept(true, true) }, { label: 'Accepter tout et arrêter le suivi', on: () => { C.revAccept(true, true); if ((A.attrs().settings || {}).track) C.toggleTrack(); } }] }, { type: 'split', icon: 'x', label: 'Refuser', size: 'lg', on: () => C.revAccept(false, false), menu: () => [{ label: 'Refuser et passer à la suivante', on: () => C.revAccept(false, false) }, { label: 'Refuser toutes les modifications', on: () => C.revAccept(false, true) }] }, { type: 'col', items: [{ icon: 'chevron-left', label: 'Précédente', on: () => C.nextRev(-1) }, { icon: 'chevron-right', label: 'Suivante', on: () => C.nextRev(1) }] }] },
    { label: 'Comparer', items: [{ icon: 'git-compare', label: 'Comparer', size: 'lg', title: 'Comparer deux versions d\'un document (révisions marquées)', on: () => D.compare() }] }
  ] });
  TABS.push({ id: 'view', label: 'Affichage', groups: [
    { label: 'Affichages', items: [{ icon: 'book-open', label: 'Mode lecture', size: 'lg', active: () => A.settings.view === 'read', on: () => A.setView('read') }, { icon: 'file-text', label: 'Page', size: 'lg', active: () => A.settings.view === 'page', on: () => A.setView('page') }, { icon: 'globe', label: 'Web', size: 'lg', active: () => A.settings.view === 'web', on: () => A.setView('web') }, { icon: 'list-tree', label: 'Plan', size: 'lg', active: () => A.settings.view === 'outline', on: () => A.setView('outline') }] },
    { label: 'Afficher', items: [{ type: 'col', items: [{ icon: 'ruler', label: 'Règle', active: () => A.settings.ruler !== false, on: () => { A.settings.ruler = A.settings.ruler === false; A.saveSettings(); A.applyUi(); A.renderRuler(); } }, { icon: 'panel-left', label: 'Volet de navigation', active: () => !$('#nav').hidden, on: () => A.toggleNav() }, { icon: 'pilcrow', label: 'Marques de mise en forme', active: () => !!A.settings.marks, on: () => C.toggleMarks() }] }] },
    { label: 'Zoom', items: [{ icon: 'zoom-in', label: 'Zoom', size: 'lg', on: () => D.zoom() }, { type: 'col', items: [{ icon: 'scan', label: '100 %', on: () => A.zoomTo(1) }, { icon: 'file', label: 'Une page', on: () => A.zoomTo('page') }, { icon: 'file-stack', label: 'Plusieurs pages', active: () => A.settings.view === 'read', on: () => A.setView('read') }] }, { icon: 'move-horizontal', label: 'Largeur de la page', size: 'lg', on: () => A.zoomTo('width') }] },
    { label: 'Fenêtre', items: [{ icon: 'maximize', label: 'Mode concentration', size: 'lg', active: () => document.documentElement.classList.contains('focus'), on: () => C.focusMode() }] }
  ] });
  /* ---- onglets contextuels ---- */
  TABS.push({ id: 'tdesign', label: 'Création de tableau', contextual: () => inTable() && !editingPart(), accent: true, groups: [
    { label: 'Options de style', items: [{ type: 'col', items: [lookCheck('hdr', 'Ligne d\'en-tête'), lookCheck('lr', 'Ligne Total'), lookCheck('band', 'Lignes à bandes')] }, { type: 'col', items: [lookCheck('fc', 'Première colonne'), lookCheck('lc', 'Dernière colonne')] }] },
    { label: 'Styles de tableau', items: [{ type: 'gallery', id: 'tstyles', title: 'Styles de tableau', w: 58, h: 44, items: () => tableStyleItems(), current: () => { const t = X.tableAt(V().state); return t && t.node.attrs.ts; }, on: (c, it) => X.setTable(V(), { ts: it.id }, 'Style de tableau') }, { type: 'color', id: 'cellbg', icon: 'paint-bucket', label: 'Trame', showLabel: true, def: '#D9E2F3', css: colorCss, value: () => { const c = X.cells(V().state)[0]; return c && c.node.attrs.bg; }, on: (c, v) => X.setCells(V(), { bg: v || null }, 'Trame'), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucune couleur', title: 'Trame des cellules' }) }] },
    { label: 'Bordures', launcher: () => D.borders('cells'), items: [{ type: 'menu', icon: 'grid-2x2', label: 'Bordures', size: 'lg', items: () => [['all', 'Toutes les bordures', 'grid-2x2'], ['outside', 'Bordures extérieures', 'square'], ['inside', 'Bordures intérieures', 'plus'], ['top', 'Bordure supérieure', 'panel-top'], ['bottom', 'Bordure inférieure', 'panel-bottom'], ['left', 'Bordure gauche', 'panel-left'], ['right', 'Bordure droite', 'panel-right'], ['none', 'Aucune bordure', 'square-dashed']].map((x) => ({ label: x[1], icon: x[2], on: () => X.cellBorders(V(), x[0], A.penBorder) })).concat(['-', { label: 'Bordure et trame…', icon: 'frame', on: () => D.borders('cells') }]) }, { type: 'col', items: [{ type: 'menu', icon: 'minus', label: 'Style de bordure', items: () => [['single', 0.5, 'Simple 0,5 pt'], ['single', 1, 'Simple 1 pt'], ['single', 1.5, 'Simple 1,5 pt'], ['single', 2.25, 'Simple 2,25 pt'], ['double', 0.5, 'Double'], ['dotted', 0.5, 'Pointillés'], ['dashed', 0.5, 'Tirets']].map((x) => ({ label: x[2], checked: A.penBorder && A.penBorder.s === x[0] && A.penBorder.w === x[1], on: () => { A.penBorder = Object.assign({}, A.penBorder || { c: '#000000' }, { s: x[0], w: x[1] }); } })) }, { type: 'color', id: 'pencolor', icon: 'pen-tool', label: 'Couleur du stylo', showLabel: true, def: '#000000', css: colorCss, value: () => (A.penBorder || {}).c || '#000000', on: (c, v) => { A.penBorder = Object.assign({ s: 'single', w: 0.5 }, A.penBorder || {}, { c: v || '#000000' }); }, picker: (c, a, ap) => pick(c, a, ap, { title: 'Couleur des bordures' }) }] }] }
  ] });
  function lookCheck(k, label) { return { icon: 'square-check', label, active: () => { const t = X.tableAt(V().state); return !!(t && (t.node.attrs.look || { hdr: true, band: true })[k]); }, on: () => X.setTable(V(), (a) => ({ look: Object.assign({ hdr: true, band: true }, a.look || {}, { [k]: !(a.look || { hdr: true, band: true })[k] }) }), 'Options de style') }; }
  TABS.push({ id: 'tlayout', label: 'Disposition', contextual: () => inTable() && !editingPart(), accent: true, groups: [
    { label: 'Tableau', items: [{ type: 'col', items: [{ type: 'menu', icon: 'square-mouse-pointer', label: 'Sélectionner', items: () => [{ label: 'Cellule', on: () => C.selectTable('cell') }, { label: 'Colonne', on: () => C.selectTable('col') }, { label: 'Ligne', on: () => C.selectTable('row') }, { label: 'Tableau', on: () => C.selectTable('table') }] }, { icon: 'table-properties', label: 'Propriétés', on: () => D.tableProps() }] }] },
    { label: 'Lignes et colonnes', items: [{ type: 'menu', icon: 'trash-2', label: 'Supprimer', size: 'lg', items: () => [{ label: 'Supprimer les cellules (ligne)', on: () => X.delRow(V()) }, { label: 'Supprimer les colonnes', on: () => X.delCol(V()) }, { label: 'Supprimer les lignes', on: () => X.delRow(V()) }, { label: 'Supprimer le tableau', on: () => X.delTable(V()) }] }, { icon: 'between-horizontal-start', label: 'Insérer au-dessus', size: 'lg', on: () => X.rowBefore(V()) }, { type: 'col', items: [{ icon: 'arrow-down-from-line', label: 'Insérer en dessous', on: () => X.rowAfter(V()) }, { icon: 'arrow-left-from-line', label: 'Insérer à gauche', on: () => X.colBefore(V()) }, { icon: 'arrow-right-from-line', label: 'Insérer à droite', on: () => X.colAfter(V()) }] }] },
    { label: 'Fusionner', items: [{ type: 'col', items: [{ icon: 'table-cells-merge', label: 'Fusionner les cellules', disabled: () => !(V().state.selection instanceof PM.tables.CellSelection), on: () => X.merge(V()) }, { icon: 'table-cells-split', label: 'Fractionner les cellules', on: () => X.split(V()) }, { icon: 'square-split-vertical', label: 'Fractionner le tableau', on: () => C.splitTable() }] }] },
    { label: 'Taille de la cellule', items: [{ type: 'col', items: [{ type: 'num', id: 'rowh', label: 'Hauteur', icon: 'move-vertical', unit: 'cm', step: 0.1, width: 54, value: () => { const s = V().state.selection.$from; for (let d = s.depth; d > 0; d--) if (s.node(d).type.name === 'table_row') return s.node(d).attrs.h ? O.round(TX.pt2cm(s.node(d).attrs.h), 2) : ''; return ''; }, on: (c, v) => X.setRows(V(), { h: v > 0 ? TX.cm2pt(v) : null }, 'Hauteur de ligne') }, { type: 'num', id: 'colw', label: 'Largeur', icon: 'move-horizontal', unit: 'cm', step: 0.1, width: 54, value: () => { const c = X.cells(V().state)[0]; return c && c.node.attrs.colwidth ? O.round(TX.pt2cm(c.node.attrs.colwidth[0] * 0.75), 2) : ''; }, on: (c, v) => C.setColWidth(v) }] }, { type: 'col', items: [{ type: 'menu', icon: 'expand', label: 'Ajustement automatique', items: () => [{ label: 'Ajuster au contenu', on: () => X.autofit(V(), 'content') }, { label: 'Ajuster à la fenêtre', on: () => X.autofit(V(), 'window') }, { label: 'Largeur de colonne fixe', on: () => X.autofit(V(), 'fixed') }] }, { icon: 'columns-3', label: 'Distribuer les colonnes', on: () => X.distributeCols(V()) }] }] },
    { label: 'Alignement', items: [{ type: 'col', items: [{ type: 'row', items: [['top', 'align-vertical-justify-start', 'Aligner en haut'], ['center', 'align-vertical-justify-center', 'Centrer verticalement'], ['bottom', 'align-vertical-justify-end', 'Aligner en bas']].map((x) => ({ icon: x[1], label: x[2], showLabel: false, active: () => { const c = X.cells(V().state)[0]; return c && (c.node.attrs.va || 'top') === x[0]; }, on: () => X.setCells(V(), { va: x[0] === 'top' ? null : x[0] }, 'Alignement') })) }, { type: 'row', items: [{ icon: 'align-left', label: 'Texte à gauche', showLabel: false, on: () => C.cellAlign('left') }, { icon: 'align-center', label: 'Texte centré', showLabel: false, on: () => C.cellAlign('center') }, { icon: 'align-right', label: 'Texte à droite', showLabel: false, on: () => C.cellAlign('right') }] }] }, { type: 'col', items: [{ type: 'menu', icon: 'arrow-down-up', label: 'Orientation du texte', items: () => [[null, 'Horizontal'], ['btLr', 'Vertical (bas vers haut)'], ['tbRl', 'Vertical (haut vers bas)']].map((x) => ({ label: x[1], on: () => X.setCells(V(), { dir: x[0] }, 'Orientation du texte') })) }, { icon: 'frame', label: 'Marges des cellules', on: () => D.tableProps('cell') }] }] },
    { label: 'Données', items: [{ type: 'col', items: [{ icon: 'arrow-down-a-z', label: 'Trier', on: () => D.sortTable() }, { icon: 'repeat', label: 'Répéter les lignes d\'en-tête', active: () => C.rowIsHeader(), on: () => X.setRows(V(), (a) => ({ hdr: !a.hdr }), 'En-tête répété') }, { icon: 'calculator', label: 'Formule', on: () => D.formula() }] }, { icon: 'type', label: 'Convertir en texte', size: 'lg', on: () => X.tableToText(V()) }] }
  ] });
  TABS.push({ id: 'pic', label: 'Format de l\'image', contextual: () => !!objSel(), accent: true, groups: [
    { label: 'Ajuster', items: [{ icon: 'crop', label: 'Rogner', size: 'lg', disabled: () => !nodeSel('image'), on: () => D.objectProps('crop') }, { icon: 'rotate-ccw', label: 'Rétablir', size: 'lg', on: () => C.objAttrs({ rot: 0, fh: false, fv: false, crop: null, bd: null, sha: null }) }] },
    { label: 'Styles', items: [{ type: 'gallery', id: 'picst', title: 'Styles d\'image', w: 52, h: 40, items: () => [['none', 'Aucun', null, null], ['thin', 'Bordure fine', { w: 0.75, c: '#000000' }, null], ['white', 'Cadre blanc', { w: 6, c: '#FFFFFF' }, 1], ['shadow', 'Ombre portée', null, 1], ['accent', 'Bordure accent', { w: 3, c: 't:accent1' }, null], ['gray', 'Cadre gris', { w: 4, c: '#BFBFBF' }, null]].map((x) => ({ id: x[0], title: x[1], data: x, html: '<div style="width:100%;height:100%;padding:6px;background:#fff"><div style="width:100%;height:100%;background:linear-gradient(135deg,#8fb3d9,#e3a36b);' + (x[2] ? 'outline:' + Math.max(1, x[2].w / 2) + 'px solid ' + colorCss(x[2].c) + ';outline-offset:-' + Math.max(1, x[2].w / 2) + 'px;' : '') + (x[3] ? 'box-shadow:2px 3px 5px #0006;' : '') + '"></div></div>' })), on: (c, it) => C.objAttrs({ bd: it.data[2], sha: it.data[3] }) }, { type: 'col', items: [{ type: 'color', id: 'imgbd', icon: 'square', label: 'Bordure', showLabel: true, def: '#000000', css: colorCss, value: () => (objSel() && objSel().attrs.bd || {}).c || null, on: (c, v) => C.objAttrs((a) => ({ bd: v ? Object.assign({ w: 1 }, a.bd || {}, { c: v }) : null })), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucune bordure', title: 'Bordure de l\'image' }) }, { icon: 'layers', label: 'Ombre', active: () => !!(objSel() && objSel().attrs.sha), on: () => C.objAttrs((a) => ({ sha: a.sha ? null : 1 })) }, { icon: 'text-cursor-input', label: 'Texte de remplacement', on: () => D.altText() }] }] },
    { label: 'Organiser', items: [{ type: 'menu', icon: 'text-wrap', label: 'Habiller le texte', size: 'lg', items: () => wrapMenu() }, { type: 'col', items: [{ icon: 'bring-to-front', label: 'Devant le texte', on: () => C.objAttrs({ wrap: 'front' }) }, { icon: 'send-to-back', label: 'Derrière le texte', on: () => C.objAttrs({ wrap: 'behind' }) }, { type: 'menu', icon: 'rotate-cw', label: 'Faire pivoter', items: () => rotateMenu() }] }] },
    { label: 'Taille', launcher: () => D.objectProps('size'), items: [{ type: 'col', items: [{ type: 'num', id: 'oh', label: 'Hauteur', icon: 'move-vertical', unit: 'cm', step: 0.1, width: 56, value: () => objSel() ? O.round(TX.pt2cm(objSel().attrs.h), 2) : '', on: (c, v) => C.objSize(null, TX.cm2pt(v)) }, { type: 'num', id: 'ow', label: 'Largeur', icon: 'move-horizontal', unit: 'cm', step: 0.1, width: 56, value: () => objSel() ? O.round(TX.pt2cm(objSel().attrs.w), 2) : '', on: (c, v) => C.objSize(TX.cm2pt(v), null) }] }] },
    { label: 'Objet', hidden: () => !nodeSel('drawing'), items: [{ type: 'color', id: 'dfill', icon: 'paint-bucket', label: 'Remplissage', showLabel: true, def: 't:accent1', css: colorCss, value: () => objSel() && objSel().attrs.fill, on: (c, v) => C.objAttrs({ fill: v || null }), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucun remplissage', title: 'Remplissage' }) }, { type: 'color', id: 'dline', icon: 'pen-tool', label: 'Contour', showLabel: true, def: 't:tx1', css: colorCss, value: () => objSel() && objSel().attrs.line && objSel().attrs.line.c, on: (c, v) => C.objAttrs((a) => ({ line: v ? Object.assign({ w: 1 }, a.line || {}, { c: v }) : null })), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucun contour', title: 'Contour' }) }, { icon: 'square-pen', label: 'Modifier', size: 'lg', on: () => { const n = objSel(); if (n) A.objectDblClick(n, sel().from); } }] }
  ] });
  TABS.push({ id: 'hf', label: 'En-tête et pied de page', contextual: () => editingPart() && A.partEd.kind === 'part', accent: true, groups: [
    { label: 'Insérer', items: [{ type: 'menu', icon: 'hash', label: 'Numéro de page', size: 'lg', items: () => [{ label: 'Numéro de page', on: () => X.insertField(V(), 'page') }, { label: 'Nombre de pages', on: () => X.insertField(V(), 'pages') }, { label: '« Page X sur Y »', on: () => { const v = V(); v.dispatch(v.state.tr.insertText('Page ')); X.insertField(v, 'page'); v.dispatch(v.state.tr.insertText(' sur ')); X.insertField(v, 'pages'); } }, { label: 'Format des numéros…', on: () => D.pageNumFormat() }] }, { icon: 'calendar-clock', label: 'Date et heure', size: 'lg', on: () => D.dateTime() }, { type: 'col', items: [{ type: 'menu', icon: 'braces', label: 'Champ', items: () => TX.FIELD_KINDS.filter((k) => !/^(seq|ref|merge)$/.test(k[0])).map((k) => ({ label: k[1], on: () => X.insertField(V(), k[0]) })) }, { icon: 'image', label: 'Image', on: () => C.insertImage() }, { icon: 'table', label: 'Tableau', on: () => X.insertTable(V(), 1, 3, { ts: 'Aucun' }) }] }] },
    { label: 'Options', items: [{ type: 'col', items: [{ icon: 'square-check', label: 'Première page différente', active: () => !!curPgOf(A.partEd.si).titlePg, on: () => A.partOption('titlePg') }, { icon: 'square-check', label: 'Pages paires et impaires différentes', active: () => !!(A.attrs().settings || {}).evenOdd, on: () => A.partOption('evenOdd') }, { icon: 'link-2', label: 'Lier au précédent', disabled: () => !A.partEd || A.partEd.si === 0, active: () => A.partEd && A.partEd.linked, on: () => A.partOption('link') }] }] },
    { label: 'Position', items: [{ type: 'col', items: [{ type: 'num', id: 'mh', label: 'En-tête depuis le haut', icon: 'arrow-up-from-line', unit: 'cm', step: 0.1, width: 54, value: () => O.round(TX.pt2cm(curPgOf(A.partEd ? A.partEd.si : 0).mh), 2), on: (c, v) => X.setPage(A.ed.view, { mh: TX.cm2pt(v) }, 'all') }, { type: 'num', id: 'mf', label: 'Pied depuis le bas', icon: 'arrow-down-to-line', unit: 'cm', step: 0.1, width: 54, value: () => O.round(TX.pt2cm(curPgOf(A.partEd ? A.partEd.si : 0).mf), 2), on: (c, v) => X.setPage(A.ed.view, { mf: TX.cm2pt(v) }, 'all') }] }] },
    { label: 'Fermer', items: [{ icon: 'x', label: 'Fermer l\'en-tête et le pied de page', size: 'lg', on: () => A.closePart(true) }] }
  ] });
  const curPgOf = (si) => TX.pg(A.ed.view.state.doc.child(Math.min(si || 0, A.ed.view.state.doc.childCount - 1)));

  /* ---------------- montage ---------------- */
  A.mountUi = function () {
    titlebar();
    A.ribbon = O.Ribbon($('#ribbonHost'), { tabs: TABS, ctx: {}, file: { label: 'Fichier', on: () => A.openBackstage('home') }, onLayout: () => A.layout && A.layout.applyScale(), extraCommands: [{ label: 'Enregistrer', icon: 'save', tab: 'Fichier', c: { on: () => C.save() } }, { label: 'Exporter en PDF', icon: 'file-badge', tab: 'Fichier', c: { on: () => C.exportAs('pdf', { outline: true }) } }, { label: 'Enregistrer en .docx', icon: 'file-text', tab: 'Fichier', c: { on: () => C.saveAs('docx') } }, { label: 'Imprimer', icon: 'printer', tab: 'Fichier', c: { on: () => C.print() } }, { label: 'Raccourcis clavier', icon: 'keyboard', tab: 'Aide', c: { on: () => C.shortcuts() } }] });
    statusbar();
    keys();
    A.panesInit && A.panesInit();
    document.documentElement.classList.toggle('tx-mergehl', !!A.settings.mergeHl);
  };
  let refreshT = null;
  A.refreshUi = function () {
    clearTimeout(refreshT);
    refreshT = setTimeout(() => {
      FS = null;
      try { A.ribbon.refresh(); } catch (e) { console.warn(e); }
      const tr = $('#tbTrack'); if (tr) tr.classList.toggle('on', !!(A.attrs().settings || {}).track);
      // un onglet contextuel vient d'apparaître (image, tableau) : on y passe quand il s'agit d'un objet
      const o = objSel(); if (o && A._lastObj !== o) { A._lastObj = o; if (A.ribbon.tab !== 'pic' && !O.narrow()) A.ribbon.select('pic'); } else if (!o) A._lastObj = null;
    }, 30);
  };
  A.onSelection = function () {
    FS = null; A.refreshUi();
    A.renderRuler && A.renderRuler();
    A.syncComment && A.syncComment();
    A.updateStatus && A.updateStatus();
    if (A.painter && A.painter.armed) { /* appliqué au relâchement de la souris */ }
  };
  function titlebar() {
    const tb = $('#titlebar');
    tb.innerHTML = '<img class="logo" src="icon-512.png" alt=""><input id="docname" aria-label="Nom du document" spellcheck="false"><span id="savestate"></span><button type="button" class="tbb" id="tbSave" title="Enregistrer (Ctrl+S)" aria-label="Enregistrer">' + O.icon('save') + '</button><button type="button" class="tbb" id="tbUndo" title="Annuler (Ctrl+Z)" aria-label="Annuler">' + O.icon('undo-2') + '</button><button type="button" class="tbb" id="tbRedo" title="Rétablir (Ctrl+Y)" aria-label="Rétablir">' + O.icon('redo-2') + '</button><span class="tb-sp"></span>' +
      '<button type="button" class="tbb hide-m" id="tbTrack" title="Suivi des modifications (Ctrl+Maj+E)">' + O.icon('file-pen-line') + '<span>Suivi</span></button><button type="button" class="tbb" id="tbCmts" title="Commentaires" aria-label="Commentaires">' + O.icon('messages-square') + '</button><button type="button" class="tbb" id="tbNav" title="Volet de navigation" aria-label="Volet de navigation">' + O.icon('panel-left') + '</button><button type="button" class="tbb hide-m" id="tbShare" title="Partager">' + O.icon('share-2') + '<span>Partager</span></button><button type="button" class="tbb pri" id="tbPdf" title="Exporter en PDF">' + O.icon('file-badge') + '<span class="hide-m">PDF</span></button>';
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'tbSave') C.save(); if (b.id === 'tbUndo') A.undo(); if (b.id === 'tbRedo') A.redo();
      if (b.id === 'tbTrack') C.toggleTrack(); if (b.id === 'tbCmts') A.openPane(A.pane === 'comments' ? null : 'comments'); if (b.id === 'tbNav') A.toggleNav();
      if (b.id === 'tbShare') A.openBackstage('share'); if (b.id === 'tbPdf') C.exportAs('pdf', { outline: true });
    });
    const dn = $('#docname');
    dn.addEventListener('change', () => { const v = dn.value.trim(); if (!v) { A.renderTitle(); return; } A.setAttr('props', Object.assign({}, A.attrs().props, { title: v }), 'Titre'); if (A.file.name && !A.file.ref) A.file.name = O.safeName(v, (TX.IO.KINDS[A.file.kind || 'magdoc'] || {}).ext || '.magdoc'); A.renderTitle(); });
    dn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { dn.blur(); A.ed.view.focus(); } });
  }
  A.undo = () => { const v = V(); PM.history.undo(v.state, (tr) => v.dispatch(tr.setMeta('notrack', true))); v.focus(); };
  A.redo = () => { const v = V(); PM.history.redo(v.state, (tr) => v.dispatch(tr.setMeta('notrack', true))); v.focus(); };

  /* ---------------- barre d'état ---------------- */
  function statusbar() {
    const st = $('#status');
    st.innerHTML = '<button type="button" class="st-b" id="stPage" title="Atteindre une page">Page 1 sur 1</button><button type="button" class="st-b" id="stWords" title="Statistiques">0 mot</button><span class="st-b hide-m" id="stLang" title="Langue">' + O.icon('spell-check') + 'Français (France)</span><button type="button" class="st-b hide-m st-trk" id="stTrack" hidden title="Suivi des modifications activé">Suivi : activé</button><span class="tb-sp"></span>' +
      '<button type="button" class="st-b" data-view="read" title="Mode lecture">' + O.icon('book-open') + '</button><button type="button" class="st-b" data-view="page" title="Page">' + O.icon('file-text') + '</button><button type="button" class="st-b" data-view="web" title="Web">' + O.icon('globe') + '</button>' +
      '<button type="button" class="st-b" id="stZm" aria-label="Zoom arrière">' + O.icon('minus') + '</button><input type="range" id="zoomRange" min="20" max="300" step="5" value="100" aria-label="Zoom" class="hide-m"><button type="button" class="st-b" id="stZp" aria-label="Zoom avant">' + O.icon('plus') + '</button><button type="button" class="st-b" id="zoomVal" title="Zoom">100 %</button>';
    st.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.view) A.setView(b.dataset.view);
      if (b.id === 'stPage') D.goTo(); if (b.id === 'stWords') D.stats(); if (b.id === 'stTrack') C.toggleTrack();
      if (b.id === 'stZm') A.zoomTo(Math.max(0.2, Math.round((A.layout.zoom - 0.1) * 10) / 10)); if (b.id === 'stZp') A.zoomTo(Math.min(3, Math.round((A.layout.zoom + 0.1) * 10) / 10)); if (b.id === 'zoomVal') D.zoom();
    });
    $('#zoomRange').addEventListener('input', (e) => A.zoomTo(+e.target.value / 100));
  }
  let statT = null;
  A.updateStatus = function () {
    clearTimeout(statT);
    statT = setTimeout(() => {
      const L = A.layout; if (!L || !A.ed) return;
      const pos = A.ed.view.state.selection.from;
      const pi = L.mode === 'page' ? L.pageIndexOf(pos) : 0, n = L.pages.length || 1;
      const p = $('#stPage'); if (p) p.textContent = (L.mode === 'page' ? 'Page ' + (pi + 1) + ' sur ' + n : n + ' page' + (n > 1 ? 's' : '') + ' (estimation)');
      const s = A.ed.view.state.selection, stx = TX.stats(A.ed.view.state.doc);
      const w = $('#stWords'); if (w) w.textContent = (!s.empty ? TX.stats(A.ed.view.state.doc, [s.from, s.to]).words + ' sur ' : '') + stx.words.toLocaleString('fr-FR') + ' mot' + (stx.words > 1 ? 's' : '');
      const t = $('#stTrack'); if (t) t.hidden = !(A.attrs().settings || {}).track;
      O.$$('#status [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === A.settings.view));
    }, 120);
  };
  A.onZoom = function (z) { const r = $('#zoomRange'); if (r && document.activeElement !== r) r.value = Math.round(z * 100); const v = $('#zoomVal'); if (v) v.textContent = Math.round(z * 100) + ' %'; A.renderRuler && A.renderRuler(); A.renderComments && A.renderComments(true); };
  A.zoomTo = function (z) {
    if (z === 'page') { A.settings.fit = 'page'; A.layout.fitPage(); }
    else if (z === 'width') { A.settings.fit = 'width'; A.layout.fitWidth(); }
    else { A.settings.fit = null; A.settings.zoom = z; A.layout.setZoom(z); if (A.settings.view !== 'page') A.relayout(); }
    A.saveSettings();
  };

  /* ---------------- modes d'affichage ---------------- */
  A.setView = function (v, quiet) {
    if (A.partEd && v !== 'page') A.closePart(true);
    A.settings.view = v; A.saveSettings();
    const root = document.documentElement;
    ['page', 'web', 'read', 'outline'].forEach((k) => root.classList.toggle('view-' + k, k === v));
    const L = A.layout; L.mode = v === 'read' ? 'page' : v === 'outline' ? 'outline' : v;
    A.ed.view.dom.classList.toggle('tx-outline', v === 'outline');
    $('#paper').classList.toggle('tx-web', v === 'web' || v === 'outline');
    A.applyUi();
    if (v === 'read') { A.showSpread(); } else { A.hideSpread && A.hideSpread(); }
    if (O.narrow() && v === 'page' && !A.settings.fit && quiet) { A.layout.fit = 'width'; }
    else if (A.settings.fit === 'width') L.fit = 'width'; else if (A.settings.fit === 'page') L.fit = 'page'; else { L.fit = null; L.zoom = A.settings.zoom || 1; }
    if (!quiet) A.relayout(true);
    A.refreshUi(); A.updateStatus();
  };

  /* ---------------- commandes de l'interface ---------------- */
  C.toggleMarks = function () { A.settings.marks = !A.settings.marks; A.saveSettings(); const v = A.ed.view; v.dispatch(v.state.tr.setMeta(TX.marksKey, { on: A.settings.marks }).setMeta('addToHistory', false)); A.relayout(); A.refreshUi(); };
  C.toggleTrack = function () { const s = Object.assign({}, A.attrs().settings || {}); s.track = !s.track; A.setAttr('settings', s, 'Suivi des modifications'); O.toast(s.track ? 'Suivi des modifications activé : vos modifications sont marquées (' + (TX.userName() || 'auteur sans nom : voir Fichier › Options') + ')' : 'Suivi des modifications désactivé', { ms: 3000 }); A.refreshUi(); A.updateStatus(); };
  C.revView = function (k) { A.settings.rev = k; A.saveSettings(); const d = A.ed.view.dom; d.classList.remove('tx-rev-final', 'tx-rev-orig', 'tx-rev-simple'); if (k !== 'all') d.classList.add('tx-rev-' + k); A.relayout(); A.refreshUi(); };
  C.setSetting = function (k, v, label) { const s = Object.assign({}, A.attrs().settings || {}); s[k] = v; A.setAttr('settings', s, label); A.relayout(); };
  C.setTheme = function (id) { const s = Object.assign({}, A.attrs().settings || {}); const t = T.get(id); s.theme = { id, fonts: { major: t.fonts.major, minor: t.fonts.minor } }; if (id === 'clair') s.theme.fonts = { major: 'Calibri', minor: 'Calibri' }; A.setAttr('settings', s, 'Thème'); };
  C.setThemeColors = function (id) { const s = Object.assign({}, A.attrs().settings || {}); s.theme = Object.assign({}, s.theme, { colors: Object.assign({}, T.get(id).colors) }); A.setAttr('settings', s, 'Couleurs du thème'); };
  C.setThemeFonts = function (p) { const s = Object.assign({}, A.attrs().settings || {}); s.theme = Object.assign({}, s.theme, { fonts: { major: p[0], minor: p[1] } }); A.setAttr('settings', s, 'Polices du thème'); };
  C.setStyleSet = function (id) {
    const at = A.attrs(); const styles = TX.applyStyleSet(at.styles || TX.defaultStyles(), id);
    const s = Object.assign({}, at.settings || {}, { styleSet: id });
    if (id === 'mag') s.theme = { id: 'mag', fonts: { major: 'Exo', minor: 'Exo' } };
    const tr = A.ed.view.state.tr.setDocAttribute('styles', styles).setDocAttribute('settings', s).setMeta('tx-label', 'Jeu de styles');
    A.ed.view.dispatch(TX.refresh(tr));
  };
  C.paraSpacingSet = function (p) {
    const st = Object.assign({}, A.attrs().styles); const base = TX.defaultStyles().Normal.p;
    st.Normal = Object.assign({}, st.Normal, { p: Object.assign({}, st.Normal.p, p || { sa: base.sa, ln: base.ln }) });
    A.setAttr('styles', st, 'Espacement de paragraphe');
  };
  C.watermark = function (wm) { const s = Object.assign({}, A.attrs().settings || {}); s.wm = wm ? Object.assign({ color: '#BFBFBF', size: 'auto', diag: true, opacity: 0.5, font: 'Calibri' }, wm) : null; A.setAttr('settings', s, 'Filigrane'); A.relayout(); };
  C.pageColor = function (c) { const s = Object.assign({}, A.attrs().settings || {}); s.pageColor = c || null; A.setAttr('settings', s, 'Couleur de page'); A.relayout(); };
  C.paste = async function (plain) {
    const v = V(); v.focus();
    try {
      if (plain) { const t = await navigator.clipboard.readText(); if (t) v.dispatch(v.state.tr.replaceSelection(TX.textToSlice(t, v.state.selection.$from))); return; }
      const items = await navigator.clipboard.read();
      for (const it of items) { const im = it.types.find((x) => /^image\//.test(x)); if (im) { C.insertImageFile(new File([await it.getType(im)], 'image.' + im.split('/')[1], { type: im })); return; } }
      for (const it of items) { if (it.types.includes('text/html')) { const h = await (await it.getType('text/html')).text(); const div = document.createElement('div'); div.innerHTML = TX.cleanPastedHtml ? TX.cleanPastedHtml(h) : h; const slice = PM.model.DOMParser.fromSchema(TX.schema).parseSlice(div); v.dispatch(v.state.tr.replaceSelection(slice)); return; } }
      const t = await navigator.clipboard.readText(); if (t) v.dispatch(v.state.tr.replaceSelection(TX.textToSlice(t, v.state.selection.$from)));
    } catch (e) { O.toast('Utilisez Ctrl+V (le navigateur protège le presse-papiers)'); }
  };
  /** Reproduire la mise en forme : un clic = une fois, double-clic = plusieurs fois (Échap pour arrêter) */
  C.painter = function () {
    const now = Date.now();
    if (A.painter && now - (A.painter.t || 0) > 400) { A.painter = null; document.body.classList.remove('painting'); A.refreshUi(); return; }
    const many = A.painter && now - A.painter.t < 400;
    A.painter = { fmt: X.captureFormat(V()), many: !!many, t: now };
    document.body.classList.add('painting'); A.refreshUi();
    O.toast(many ? 'Reproduire la mise en forme : sélectionnez le texte (plusieurs fois ; Échap pour terminer)' : 'Sélectionnez le texte qui reçoit la mise en forme', { ms: 2500 });
  };
  document.addEventListener('mouseup', () => {
    if (!A.painter) return;
    setTimeout(() => { const v = V(); if (!v.hasFocus()) return; if (Date.now() - A.painter.t < 300) return; X.pasteFormat(v, A.painter.fmt); if (!A.painter.many) { A.painter = null; document.body.classList.remove('painting'); A.refreshUi(); } }, 10);
  });
  C.hRule = function () { const v = V(); X.setPara(v, { bd: { b: { s: 'single', w: 0.75, c: '#808080', sp: 1 } } }, 'Ligne horizontale'); };
  C.selectSameStyle = function () {
    const v = V(), s = TX.fmtState(v.state, A.attrs()).style; if (!s) return;
    const ranges = []; v.state.doc.descendants((n, p) => { if (n.type.name === 'paragraph' && n.attrs.s === s) ranges.push(p); return n.type.name !== 'paragraph'; });
    if (!ranges.length) return;
    const first = ranges[0], last = ranges[ranges.length - 1], lastNode = v.state.doc.nodeAt(last);
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, first + 1, last + lastNode.nodeSize - 1))); v.focus();
    O.toast(ranges.length + ' paragraphe(s) « ' + ((A.attrs().styles[s] || {}).n || s) + ' » (de la première à la dernière occurrence)');
  };
  C.focusMode = function () { const r = document.documentElement; r.classList.toggle('focus'); A.ribbon.setCollapsed(r.classList.contains('focus')); };
  C.objAttrs = function (patch) {
    const v = V(), s = v.state.selection; if (!(s instanceof PM.state.NodeSelection)) return;
    const n = s.node, a = Object.assign({}, n.attrs, typeof patch === 'function' ? patch(n.attrs) : patch);
    if ((a.wrap === 'front' || a.wrap === 'behind') && !(n.attrs.wrap === 'front' || n.attrs.wrap === 'behind')) { a.x = a.x || 0; a.y = a.y || 0; }
    const tr = v.state.tr.setNodeMarkup(s.from, null, a); tr.setSelection(PM.state.NodeSelection.create(tr.doc, s.from)); v.dispatch(tr.setMeta('tx-label', 'Objet')); v.focus();
  };
  C.objSize = function (w, h) { C.objAttrs((a) => { const r = a.w / a.h; if (w && !h) return { w, h: a.kind === 'shape' || a.kind === 'textbox' ? a.h : w / r }; if (h && !w) return { h, w: a.kind === 'shape' || a.kind === 'textbox' ? a.w : h * r }; return {}; }); };
  C.cellAlign = function (al) { const v = V(); const tr = v.state.tr; X.cells(v.state).forEach(({ node, pos }) => node.descendants((n, p) => { if (n.type.name === 'paragraph') tr.setNodeMarkup(pos + 1 + p, null, Object.assign({}, n.attrs, { al: al === 'left' ? null : al })); return n.type.name !== 'paragraph'; })); if (!X.cells(v.state).length) X.align(v, al); else v.dispatch(tr); v.focus(); };
  C.rowIsHeader = () => { const s = V().state.selection.$from; for (let d = s.depth; d > 0; d--) if (s.node(d).type.name === 'table_row') return !!s.node(d).attrs.hdr; return false; };
  C.setColWidth = function (cm) {
    const v = V(), t = X.tableAt(v.state); if (!t || !(cm > 0)) return;
    const cells = X.cells(v.state); const cols = new Set(); cells.forEach((c) => { const r = t.map.findCell(c.pos - t.start); for (let k = r.left; k < r.right; k++) cols.add(k); });
    const px = Math.round(TX.cm2pt(cm) * TX.PX), tr = v.state.tr;
    t.node.descendants((n, p) => { if (/table_(cell|header)/.test(n.type.name)) { const r = t.map.findCell(p); const cw = (n.attrs.colwidth || Array.from({ length: n.attrs.colspan }, () => 100)).slice(); let ch = false; for (let k = r.left; k < r.right; k++) if (cols.has(k)) { cw[k - r.left] = px; ch = true; } if (ch) tr.setNodeMarkup(t.start + p, null, Object.assign({}, n.attrs, { colwidth: cw })); return false; } return true; });
    v.dispatch(tr.setMeta('tx-label', 'Largeur de colonne'));
  };
  C.selectTable = function (what) {
    const v = V(), t = X.tableAt(v.state); if (!t) return;
    const TB = PM.tables, $c = TB.cellAround(v.state.selection.$from); if (!$c) return;
    let sel;
    if (what === 'table') { const m = t.map; sel = TB.CellSelection.create(v.state.doc, t.start + m.map[0], t.start + m.map[m.map.length - 1]); }
    else if (what === 'row') sel = TB.CellSelection.rowSelection($c);
    else if (what === 'col') sel = TB.CellSelection.colSelection($c);
    else sel = TB.CellSelection.create(v.state.doc, $c.pos);
    v.dispatch(v.state.tr.setSelection(sel)); v.focus();
  };
  C.splitTable = function () {
    const v = V(), t = X.tableAt(v.state); if (!t) return;
    const $f = v.state.selection.$from; let rowIdx = -1; for (let d = $f.depth; d > 0; d--) if ($f.node(d).type.name === 'table_row') { rowIdx = $f.index(d - 1); break; }
    if (rowIdx <= 0) { O.toast('Placez le curseur dans la ligne qui commencera le second tableau'); return; }
    const rows = []; t.node.forEach((r) => rows.push(r));
    const S = TX.schema.nodes;
    const t1 = S.table.create(t.node.attrs, rows.slice(0, rowIdx)), t2 = S.table.create(t.node.attrs, rows.slice(rowIdx));
    v.dispatch(v.state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, [t1, S.paragraph.create({ s: 'Normal' }), t2]).setMeta('tx-label', 'Fractionner le tableau')); v.focus();
  };
  C.landscapeHere = function () {
    const v = V(); X.sectionBreak(v, 'page');
    setTimeout(() => { X.orient(A.ed.view, 'landscape', 'section'); O.toast('Section en paysage créée. Insérez un autre saut de section (Mise en page › Sauts) là où le portrait doit reprendre.', { ms: 5000 }); }, 0);
  };

  /* ---------------- clavier ---------------- */
  function keys() {
    const notBs = () => !document.querySelector('#backstage.on');
    O.keys({
      'mod+s': () => { C.save(); }, 'f12': () => { C.saveAs('magdoc'); }, 'mod+o': () => { C.open(); }, 'mod+n': () => { C.newDoc('vide'); }, 'mod+p': () => { C.print(); },
      'mod+f': () => { A.openNav('results'); }, 'mod+h': () => { A.openPane('find', { replace: true }); }, 'mod+g': () => { D.goTo(); }, 'f5': () => { D.goTo(); },
      'mod+k': () => { D.link(); }, 'mod+alt+f': () => { C.footnote(false); }, 'mod+alt+d': () => { C.footnote(true); }, 'mod+alt+m': () => { C.addComment(); }, 'alt+=': () => { D.equation(); },
      'alt+shift+d': () => { X.insertField(V(), 'date'); }, 'alt+shift+p': () => { X.insertField(V(), 'page'); }, 'alt+shift+t': () => { X.insertField(V(), 'time'); },
      'mod+shift+e': () => { C.toggleTrack(); }, 'mod+shift+g': () => { D.stats(); }, 'mod+alt+space': () => { C.readAloud(); }, 'mod+*': () => { C.toggleMarks(); }, 'mod+shift+*': () => { C.toggleMarks(); }, 'mod+shift+8': () => { C.toggleMarks(); },
      'alt+q': () => { A.ribbon.focusSearch(); }, 'mod+f1': () => { A.ribbon.setCollapsed(!A.ribbon.collapsed); },
      'mod+0': () => { A.zoomTo(1); }, 'mod+=': (e) => { if (O.typing() && A.view().hasFocus()) { X.toggle(V(), 'sub'); return; } A.zoomTo(Math.min(3, A.layout.zoom + 0.1)); }, 'mod+-': () => { A.zoomTo(Math.max(0.2, A.layout.zoom - 0.1)); },
      'f9': () => { A.refreshFields(); }, 'shift+f3': () => { C.cycleCase(); }, 'f7': () => { A.settings.spell = true; A.saveSettings(); A.applyUi(); O.toast('Correcteur actif : les fautes sont soulignées en rouge ; clic droit pour les suggestions'); },
      'escape': () => { if (A.painter) { A.painter = null; document.body.classList.remove('painting'); A.refreshUi(); return; } if (A.partEd) { A.closePart(true); return; } if (document.querySelector('#backstage.on') && A.ed) { A.closeBackstage(); return; } if (A.speaking) { C.readAloud(); return; } return false; }
    }, { when: notBs });
    // raccourcis de mise en forme : seulement dans le texte (document, en-tête, note)
    const inText = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('.tx-pm')); };
    O.keys({
      'mod+b': () => { X.toggle(V(), 'b'); }, 'mod+i': () => { X.toggle(V(), 'i'); }, 'mod+u': () => { X.toggle(V(), 'u'); },
      'mod+shift++': () => { X.toggle(V(), 'sup'); }, 'mod+shift+=': () => { X.toggle(V(), 'sup'); },
      'mod+shift+>': () => { X.grow(V(), 1); }, 'mod+shift+<': () => { X.grow(V(), -1); }, 'mod+]': () => { X.grow(V(), 1); }, 'mod+[': () => { X.grow(V(), -1); },
      'mod+space': () => { X.clearChar(V()); }, 'mod+q': () => { X.clearPara(V()); },
      'mod+l': () => { X.align(V(), 'left'); }, 'mod+e': () => { X.align(V(), 'center'); }, 'mod+r': () => { X.align(V(), 'right'); }, 'mod+j': () => { X.align(V(), 'justify'); },
      'mod+1': () => { X.lineSpacing(V(), 1); }, 'mod+2': () => { X.lineSpacing(V(), 2); }, 'mod+5': () => { X.lineSpacing(V(), 1.5); },
      'mod+alt+1': () => { X.setStyle(V(), 'Titre1'); }, 'mod+alt+2': () => { X.setStyle(V(), 'Titre2'); }, 'mod+alt+3': () => { X.setStyle(V(), 'Titre3'); }, 'mod+shift+n': () => { X.setStyle(V(), 'Normal'); },
      'mod+shift+l': () => { X.list(V(), 'puces'); }, 'mod+m': () => { X.indent(V(), 1); }, 'mod+shift+m': () => { X.indent(V(), -1); },
      'mod+shift+c': () => { A.painter = null; A.copiedFmt = X.captureFormat(V()); O.toast('Mise en forme copiée', { ms: 1000 }); }, 'mod+shift+v': () => { if (A.copiedFmt) X.pasteFormat(V(), A.copiedFmt); else C.paste(true); }
    }, { when: inText, typing: true });
  }
  let caseStep = 0;
  C.cycleCase = function () { X.changeCase(V(), ['upper', 'lower', 'sentence', 'title'][caseStep++ % 4]); };
  /* ---------------- menu contextuel ---------------- */
  A.contextMenu = function (e) {
    const v = A.ed.view;
    const n = objSel(), link0 = fs().link;
    // le correcteur du navigateur : sur du texte simple (sans sélection), menu natif avec les suggestions d'orthographe ;
    // Maj+clic droit (ou sélection, tableau, image, lien) : menu de Texte
    if (A.settings.spell !== false && !e.shiftKey && !n && !inTable() && !link0 && v.state.selection.empty) return false;
    e.preventDefault();
    const items = [];
    items.push({ label: 'Couper', icon: 'scissors', kbd: 'Ctrl+X', on: () => { v.focus(); document.execCommand('cut'); } }, { label: 'Copier', icon: 'copy', kbd: 'Ctrl+C', on: () => { v.focus(); document.execCommand('copy'); } }, { label: 'Coller', icon: 'clipboard-paste', kbd: 'Ctrl+V', on: () => C.paste() }, { label: 'Coller le texte seul', icon: 'type', on: () => C.paste(true) }, '-');
    if (n) items.push({ label: 'Texte de remplacement…', icon: 'text-cursor-input', on: () => D.altText() }, { label: 'Habiller le texte', icon: 'text-wrap', sub: wrapMenu() }, { label: 'Taille et position…', icon: 'sliders-horizontal', on: () => D.objectProps('size') }, { label: 'Insérer une légende…', icon: 'captions', on: () => D.caption() }, '-');
    if (inTable()) items.push({ label: 'Insérer', icon: 'plus', sub: [{ label: 'Ligne au-dessus', on: () => X.rowBefore(v) }, { label: 'Ligne en dessous', on: () => X.rowAfter(v) }, { label: 'Colonne à gauche', on: () => X.colBefore(v) }, { label: 'Colonne à droite', on: () => X.colAfter(v) }] }, { label: 'Supprimer', icon: 'trash-2', sub: [{ label: 'Ligne', on: () => X.delRow(v) }, { label: 'Colonne', on: () => X.delCol(v) }, { label: 'Tableau', on: () => X.delTable(v) }] }, { label: 'Fusionner les cellules', icon: 'table-cells-merge', disabled: !(v.state.selection instanceof PM.tables.CellSelection), on: () => X.merge(v) }, { label: 'Propriétés du tableau…', icon: 'table-properties', on: () => D.tableProps() }, '-');
    const link = fs().link;
    if (link) items.push({ label: 'Ouvrir le lien', icon: 'square-arrow-out-up-right', on: () => A.followLink(link) }, { label: 'Modifier le lien…', icon: 'link', on: () => D.link() }, { label: 'Supprimer le lien', icon: 'unlink', on: () => X.link(v, null) }, '-');
    items.push({ label: 'Police…', icon: 'type', on: () => D.font() }, { label: 'Paragraphe…', icon: 'pilcrow', on: () => D.paragraph() }, { label: 'Lien…', icon: 'link', on: () => D.link() }, { label: 'Nouveau commentaire', icon: 'message-square-plus', on: () => C.addComment() });
    const revs = TX.revisions(v.state.doc).filter((r) => r.from <= v.state.selection.to && r.to >= v.state.selection.from);
    if (revs.length) items.push('-', { label: 'Accepter la modification', icon: 'check', on: () => v.dispatch(TX.resolveRevisions(v.state, revs, true)) }, { label: 'Refuser la modification', icon: 'x', on: () => v.dispatch(TX.resolveRevisions(v.state, revs, false)) });
    O.menu({ x: e.clientX, y: e.clientY }, items, { title: 'Texte' });
    return true;
  };
})();
