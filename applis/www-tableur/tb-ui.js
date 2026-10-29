/* Tableur — interface : barre de titre, ruban (Accueil, Insertion, Mise en page, Formules, Données, Révision, Affichage,
   + onglets contextuels Création de tableau, Graphique, Image / Forme), barre de formule (aide et autocomplétion),
   onglets des feuilles, barre d'état (somme, moyenne, nombre…), raccourcis clavier, menus contextuels, listes
   déroulantes (filtre automatique, validation). */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur, P = TB.Formula;
  const A = window.TableurApp = window.TableurApp || {};
  const C = A.cmd = A.cmd || {};
  const D = A.dialogs = A.dialogs || {};
  const KEY = TB.key, MAXR = TB.MAX_ROWS, MAXC = TB.MAX_COLS;
  const $ = (s) => document.querySelector(s);
  const wb = () => A.wb, sh = () => A.wb.cur, G = () => A.grid;
  const st = () => A.curStyle ? A.curStyle() : {};
  const pick = (anchor, apply, opt) => O.colorPicker(anchor, Object.assign({ theme: TB.themePalette(wb()), onPick: (c) => apply(TB.resolveColor(wb(), c)) }, opt || {}));
  A.themeRefs = () => TB.themePalette(wb()); A.resolveColor = (c) => TB.resolveColor(wb(), c);
  const fullCol = (g) => g.r1 === 0 && g.r2 >= MAXR - 1, fullRow = (g) => g.c1 === 0 && g.c2 >= MAXC - 1;

  /* ---------------- listes du ruban ---------------- */
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
  const fontOptions = () => { const l = []; const t = TB.themeOf(wb()); l.push([t.minor, t.minor + ' (corps)', 'font-family:' + TB.fontCss(t.minor)]); l.push([t.major, t.major + ' (titres)', 'font-family:' + TB.fontCss(t.major)]); ['Calibri', 'Aptos', 'Arial', 'Times New Roman', 'Courier New', 'Cambria', 'Verdana', 'Tahoma', 'Segoe UI', 'Georgia', 'Consolas', 'Trebuchet MS', 'Century Gothic', 'Bahnschrift', 'Arial Narrow', 'Garamond', 'Comic Sans MS', 'Impact'].forEach((f) => { if (!l.some((x) => x[0] === f)) l.push([f, f, 'font-family:' + TB.fontCss(f), /^(Calibri|Arial|Times New Roman|Courier New|Cambria)$/.test(f) || O.fontAvailable(f) ? '' : 'remplacée sur cet appareil']); }); return l; };
  const NUMFMTS = [['General', 'Standard', 'General'], ['number', 'Nombre', '0.00'], ['currency', 'Monétaire', '#,##0.00\\ "€"'], ['accounting', 'Comptabilité', TB.Fmt.build('accounting')], ['dshort', 'Date courte', 'dd/mm/yyyy'], ['dlong', 'Date longue', 'dddd d mmmm yyyy'], ['time', 'Heure', 'hh:mm:ss'], ['percent', 'Pourcentage', '0.00%'], ['fraction', 'Fraction', '# ?/?'], ['sci', 'Scientifique', '0.00E+00'], ['text', 'Texte', '@']];
  const nfCurrent = () => { const nf = st().nf || 'General'; const f = NUMFMTS.find((x) => x[2] === nf); return f ? f[0] : ''; };
  const numFmtItems = () => {
    const v = sh().get(G().sel.r, G().sel.c); const sample = typeof v === 'number' ? v : 1234.5;
    return NUMFMTS.map((f) => ({ label: f[1], html: '<span style="display:flex;justify-content:space-between;gap:16px;width:100%"><span>' + O.esc(f[1]) + '</span><small class="o-mi-note">' + O.esc(TB.Fmt.format(f[0] === 'text' ? String(sample) : sample, f[2]).s) + '</small></span>', on: () => C.numFmt(f[2]) })).concat(['-', { label: 'Autres formats numériques…', icon: 'hash', on: () => D.formatCells('number') }]);
  };
  const borderItems = () => [['bottom', 'Bordure inférieure', 'panel-bottom'], ['top', 'Bordure supérieure', 'panel-top'], ['left', 'Bordure gauche', 'panel-left'], ['right', 'Bordure droite', 'panel-right'], '-', ['none', 'Aucune bordure', 'square-dashed'], ['all', 'Toutes les bordures', 'grid-3x3'], ['outer', 'Bordures extérieures', 'square'], ['thickOuter', 'Bordure épaisse en encadré', 'square'], ['inner', 'Bordures intérieures', 'grid-2x2'], '-', ['doubleBottom', 'Bordure double en bas', 'panel-bottom'], ['thickBottom', 'Bordure épaisse en bas', 'panel-bottom'], ['topBottom', 'Bordures en haut et en bas', 'rows-2'], ['topThickBottom', 'Haut et bas épais', 'rows-2'], ['topDoubleBottom', 'Haut et bas double', 'rows-2'], ['diagDown', 'Diagonale descendante', 'slash'], ['diagUp', 'Diagonale montante', 'slash']].map((x) => x === '-' ? '-' : { label: x[1], icon: x[2], on: () => { A.lastBorder = x[0]; C.borders(x[0]); } }).concat(['-', { label: 'Couleur du trait…', icon: 'palette', on: () => pick(G().host, (c) => { A.borderSpec = Object.assign({}, A.borderSpec || { s: 'thin' }, { c: c || '#000000' }); O.toast('Couleur de bordure choisie : appliquez une bordure'); }) }, { label: 'Style du trait', icon: 'minus', sub: [['thin', 'Fin'], ['medium', 'Moyen'], ['thick', 'Épais'], ['dashed', 'Tirets'], ['dotted', 'Pointillés'], ['double', 'Double'], ['hair', 'Très fin']].map((s) => ({ label: s[1], checked: (A.borderSpec || { s: 'thin' }).s === s[0], on: () => { A.borderSpec = Object.assign({}, A.borderSpec || { c: '#000000' }, { s: s[0] }); } })) }, { label: 'Autres bordures…', icon: 'grid-3x3', on: () => D.formatCells('border') }]);
  const mergeItems = () => [{ label: 'Fusionner et centrer', icon: 'table-cells-merge', on: () => C.merge('center') }, { label: 'Fusionner sur la ligne', icon: 'rows-3', on: () => C.merge('across') }, { label: 'Fusionner', icon: 'merge', on: () => C.merge('merge') }, { label: 'Annuler la fusion', icon: 'table-cells-split', on: () => C.merge('unmerge') }];
  const rotItems = () => [[45, 'Rotation dans le sens antihoraire'], [-45, 'Rotation dans le sens horaire'], [255, 'Texte vertical'], [90, 'Rotation vers le haut'], [-90, 'Rotation vers le bas'], [0, 'Horizontal']].map((x) => ({ label: x[1], checked: (st().rot || 0) === x[0], on: () => C.rotate(x[0]) })).concat(['-', { label: 'Format de l\'alignement…', on: () => D.formatCells('align') }]);
  const condItems = () => [
    { label: 'Règles de mise en surbrillance des cellules', icon: 'highlighter', sub: [['gt', 'Supérieur à…'], ['lt', 'Inférieur à…'], ['between', 'Entre…'], ['eq', 'Égal à…'], ['text', 'Texte qui contient…'], ['date', 'Une date se produisant…'], ['dup', 'Valeurs en double…']].map((x) => ({ label: x[1], on: () => D.cfQuick(x[0]) })).concat(['-', { label: 'Autres règles…', on: () => D.cfRule() }]) },
    { label: 'Règles des valeurs plus / moins élevées', icon: 'list-ordered', sub: [['top', '10 valeurs les plus élevées…'], ['topPct', '10 % les plus élevés…'], ['bottom', '10 valeurs les moins élevées…'], ['bottomPct', '10 % les moins élevés…'], ['above', 'Valeurs supérieures à la moyenne…'], ['below', 'Valeurs inférieures à la moyenne…']].map((x) => ({ label: x[1], on: () => D.cfQuick(x[0]) })) },
    { label: 'Barres de données', icon: 'chart-bar', sub: [['#638EC6', 'Bleu'], ['#63BE7B', 'Vert'], ['#FF555A', 'Rouge'], ['#FFB628', 'Orange'], ['#008AEF', 'Bleu clair'], ['#D6007B', 'Violet']].map((x) => ({ label: x[1] + ' (dégradé)', html: '<span style="display:inline-block;width:46px;height:12px;background:linear-gradient(90deg,' + x[0] + ',#fff);margin-right:8px;border:1px solid ' + x[0] + '"></span>' + x[1], on: () => D.cfAdd({ type: 'dataBar', color: x[0], grad: true }) })).concat([{ label: 'Bleu (plein)', html: '<span style="display:inline-block;width:46px;height:12px;background:#638EC6;margin-right:8px"></span>Bleu (plein)', on: () => D.cfAdd({ type: 'dataBar', color: '#638EC6', grad: false }) }]) },
    { label: 'Nuances de couleurs', icon: 'palette', sub: [[['#F8696B', '#FFEB84', '#63BE7B'], 'Rouge – jaune – vert'], [['#63BE7B', '#FFEB84', '#F8696B'], 'Vert – jaune – rouge'], [['#F8696B', '#FFFFFF', '#63BE7B'], 'Rouge – blanc – vert'], [['#5A8AC6', '#FFFFFF', '#F8696B'], 'Bleu – blanc – rouge'], [['#FFFFFF', '#63BE7B'], 'Blanc – vert'], [['#FFFFFF', '#F8696B'], 'Blanc – rouge'], [['#FCFCFF', '#5A8AC6'], 'Blanc – bleu']].map((x) => ({ label: x[1], html: '<span style="display:inline-block;width:46px;height:12px;background:linear-gradient(90deg,' + x[0].join(',') + ');margin-right:8px;border:1px solid #ccc"></span>' + x[1], on: () => D.cfAdd({ type: 'colorScale', pts: x[0].length === 3 ? [{ t: 'min', c: x[0][0] }, { t: 'percentile', v: 50, c: x[0][1] }, { t: 'max', c: x[0][2] }] : [{ t: 'min', c: x[0][0] }, { t: 'max', c: x[0][1] }] }) })) },
    { label: 'Jeux d\'icônes', icon: 'circle-dot', sub: Object.keys(TB.CF.ICONS).map((k) => ({ label: TB.CF.ICON_NAMES[k] || k, html: iconPreview(k) + O.esc(TB.CF.ICON_NAMES[k] || k), on: () => D.cfAdd({ type: 'iconSet', set: k }) })) },
    '-', { label: 'Nouvelle règle…', icon: 'plus', on: () => D.cfRule() }, { label: 'Effacer les règles', icon: 'eraser', sub: [{ label: 'Des cellules sélectionnées', on: () => D.cfClear('sel') }, { label: 'De la feuille entière', on: () => D.cfClear('sheet') }] }, { label: 'Gérer les règles…', icon: 'list-checks', on: () => D.cfManage() }
  ];
  function iconPreview(k) { const c = document.createElement('canvas'); c.width = 60; c.height = 16; const x = c.getContext('2d'); TB.CF.ICONS[k].forEach((spec, i) => TB.CF.drawIcon(x, { spec }, 2 + i * 12, 8, 11)); return '<img src="' + c.toDataURL() + '" width="60" height="16" style="margin-right:8px;vertical-align:middle" alt="">'; }
  const CELL_STYLES = [
    ['Normal', {}], ['Satisfaisant', { bg: '#C6EFCE', fc: '#006100' }], ['Insatisfaisant', { bg: '#FFC7CE', fc: '#9C0006' }], ['Neutre', { bg: '#FFEB9C', fc: '#9C5700' }],
    ['Calcul', { bg: '#F2F2F2', fc: '#FA7D00', b: true, bt: { s: 'thin', c: '#7F7F7F' }, bb: { s: 'thin', c: '#7F7F7F' }, bl: { s: 'thin', c: '#7F7F7F' }, br: { s: 'thin', c: '#7F7F7F' } }], ['Entrée', { bg: '#FFCC99', fc: '#3F3F76', bt: { s: 'thin', c: '#7F7F7F' }, bb: { s: 'thin', c: '#7F7F7F' }, bl: { s: 'thin', c: '#7F7F7F' }, br: { s: 'thin', c: '#7F7F7F' } }], ['Sortie', { bg: '#F2F2F2', fc: '#3F3F3F', b: true, bt: { s: 'thin', c: '#3F3F3F' }, bb: { s: 'thin', c: '#3F3F3F' }, bl: { s: 'thin', c: '#3F3F3F' }, br: { s: 'thin', c: '#3F3F3F' } }],
    ['Vérification', { bg: '#A5A5A5', fc: '#FFFFFF', b: true, bt: { s: 'double', c: '#3F3F3F' }, bb: { s: 'double', c: '#3F3F3F' }, bl: { s: 'double', c: '#3F3F3F' }, br: { s: 'double', c: '#3F3F3F' } }], ['Avertissement', { fc: '#FF0000' }], ['Remarque', { bg: '#FFFFCC', bt: { s: 'thin', c: '#B2B2B2' }, bb: { s: 'thin', c: '#B2B2B2' }, bl: { s: 'thin', c: '#B2B2B2' }, br: { s: 'thin', c: '#B2B2B2' } }],
    ['Titre', { fs: 18, fc: '#44546A', fn: 'Calibri Light' }], ['Titre 1', { fs: 15, b: true, fc: '#44546A', bb: { s: 'thick', c: '#4472C4' } }], ['Titre 2', { fs: 13, b: true, fc: '#44546A', bb: { s: 'thick', c: '#A2B8E1' } }], ['Titre 3', { fs: 11, b: true, fc: '#44546A', bb: { s: 'medium', c: '#8EA9DB' } }], ['Total', { b: true, bt: { s: 'thin', c: '#4472C4' }, bb: { s: 'double', c: '#4472C4' } }],
    ['MAG – titre', { fs: 14, b: true, fc: '#FFFFFF', bg: '#EC7913' }], ['MAG – en-tête', { b: true, fc: '#16212B', bg: '#FDEBD9', bb: { s: 'medium', c: '#EC7913' } }], ['Monétaire', { nf: '#,##0.00\\ "€"' }], ['Pourcentage', { nf: '0%' }], ['Milliers', { nf: '#,##0' }]
  ];
  A.CELL_STYLES = CELL_STYLES;
  const cellStyleHtml = (s) => '<span class="cst" style="background:' + (s[1].bg || '#fff') + ';color:' + (s[1].fc || '#000') + ';font-weight:' + (s[1].b ? 700 : 400) + ';' + (s[1].bb ? 'border-bottom:2px solid ' + s[1].bb.c : '') + '">' + O.esc(s[0]) + '</span>';
  const tableStyles = () => TB.TableStyle.list().map((s) => ({ id: s.id, html: TB.TableStyle.previewHtml(wb(), s.id), title: s.name, sig: wb().settings.theme }));
  const insertItems = () => [{ label: 'Insérer des cellules…', icon: 'between-horizontal-start', on: () => D.insertCells() }, { label: 'Insérer des lignes', icon: 'between-horizontal-start', on: () => C.insert('rows') }, { label: 'Insérer des colonnes', icon: 'between-vertical-start', on: () => C.insert('cols') }, { label: 'Insérer une feuille', icon: 'file-plus', on: () => C.addSheet() }];
  const deleteItems = () => [{ label: 'Supprimer des cellules…', icon: 'between-horizontal-end', on: () => D.deleteCells() }, { label: 'Supprimer des lignes', icon: 'between-horizontal-end', on: () => C.remove('rows') }, { label: 'Supprimer des colonnes', icon: 'between-vertical-end', on: () => C.remove('cols') }, { label: 'Supprimer la feuille', icon: 'trash-2', on: () => C.deleteSheet() }];
  const formatItems = () => [{ head: 'Taille de la cellule' }, { label: 'Hauteur de ligne…', icon: 'move-vertical', on: () => A.askSize('r', G().sel.r) }, { label: 'Ajuster la hauteur de ligne', on: () => A.autofit('r', G().sel.r) }, { label: 'Largeur de colonne…', icon: 'move-horizontal', on: () => A.askSize('c', G().sel.c) }, { label: 'Ajuster la largeur de colonne', on: () => A.autofit('c', G().sel.c) }, { label: 'Largeur par défaut…', on: () => C.defaultSize('c') }, { head: 'Visibilité' }, { label: 'Masquer et afficher', icon: 'eye-off', sub: [{ label: 'Masquer les lignes', on: () => C.hide('r') }, { label: 'Masquer les colonnes', on: () => C.hide('c') }, { label: 'Masquer la feuille', on: () => C.hideSheet(sh(), true) }, '-', { label: 'Afficher les lignes', on: () => C.hide('r', true) }, { label: 'Afficher les colonnes', on: () => C.hide('c', true) }, { label: 'Afficher la feuille…', on: () => C.unhideSheet() }] }, { head: 'Organiser les feuilles' }, { label: 'Renommer la feuille', icon: 'pencil', on: () => C.renameSheet() }, { label: 'Déplacer ou copier…', icon: 'copy', on: () => D.moveCopySheet() }, { label: 'Couleur d\'onglet', icon: 'palette', on: () => pick(G().host, (c) => C.tabColor(sh(), c), { none: 'Aucune couleur' }) }, { head: 'Protection' }, { label: sh().protect ? 'Ôter la protection de la feuille…' : 'Protéger la feuille…', icon: 'lock', on: () => D.protectSheet() }, { label: 'Verrouiller la cellule', icon: 'lock', checked: st().lk !== false, on: () => A.applyStyle({ lk: st().lk === false ? null : false }, 'Verrouiller') }, { label: 'Format de cellule…', icon: 'settings-2', kbd: 'Ctrl+1', on: () => D.formatCells() }];
  const clearItems = () => [{ label: 'Effacer tout', icon: 'eraser', on: () => C.clear('all') }, { label: 'Effacer les formats', on: () => C.clear('formats') }, { label: 'Effacer le contenu', kbd: 'Suppr', on: () => C.clear('contents') }, { label: 'Effacer les notes et commentaires', on: () => C.clear('notes') }, { label: 'Supprimer les liens', on: () => C.removeLink() }];
  const sortFilterItems = () => [{ label: 'Trier de A à Z', icon: 'arrow-down-a-z', on: () => C.quickSort(false) }, { label: 'Trier de Z à A', icon: 'arrow-up-z-a', on: () => C.quickSort(true) }, { label: 'Tri personnalisé…', icon: 'list-sort-ascending', on: () => D.sort() }, '-', { label: 'Filtrer', icon: 'funnel', kbd: 'Ctrl+Maj+L', checked: !!sh().af, on: () => C.toggleFilter() }, { label: 'Effacer les filtres', icon: 'funnel-x', disabled: !sh().af, on: () => C.clearFilters() }, { label: 'Réappliquer', icon: 'refresh-cw', disabled: !sh().af, on: () => C.reapplyFilter() }];
  const findItems = () => [{ label: 'Rechercher…', icon: 'search', kbd: 'Ctrl+F', on: () => A.openPane('find') }, { label: 'Remplacer…', icon: 'replace', kbd: 'Ctrl+H', on: () => A.openPane('find', { replace: true }) }, { label: 'Atteindre…', icon: 'arrow-right-to-line', kbd: 'Ctrl+G', on: () => D.goTo() }, { label: 'Sélectionner les cellules…', icon: 'mouse-pointer-click', on: () => D.goToSpecial() }, '-', ['Formules', 'formulas'], ['Commentaires et notes', 'notes'], ['Mise en forme conditionnelle', 'cf'], ['Constantes', 'constants'], ['Validation des données', 'dv'], ['Cellules vides', 'blanks']].map((x) => Array.isArray(x) ? { label: x[0], on: () => A.selectSpecial(x[1]) } : x);
  const fnCat = (cat) => () => TB.fnList().filter((n) => (TB.FN[n].cat || 'math') === cat).map((n) => ({ label: P.displayFn(n, TB.loc.fn), html: '<b style="font-family:Consolas,monospace;font-weight:600">' + O.esc(P.displayFn(n, TB.loc.fn)) + '</b>' + ((TB.FN_INFO[n] || {}).desc ? '<small class="o-mi-note">' + O.esc(TB.FN_INFO[n].desc) + '</small>' : ''), on: () => A.insertFunction(n) }));
  const chartMenu = (kind) => () => { const map = { col: [['bar', 'Histogramme groupé'], ['stacked', 'Histogramme empilé'], ['stacked100', 'Histogramme empilé 100 %']], bar: [['barH', 'Barres groupées'], ['stackedH', 'Barres empilées'], ['stackedH100', 'Barres empilées 100 %']], line: [['line', 'Courbes'], ['lineMarkers', 'Courbes avec marqueurs'], ['stackedLine', 'Courbes empilées']], area: [['area', 'Aires'], ['stackedArea', 'Aires empilées']], pie: [['pie', 'Secteurs'], ['doughnut', 'Anneau']], scatter: [['scatter', 'Nuage de points'], ['scatterLines', 'Nuage avec courbes']], combo: [['combo', 'Histogramme et courbe'], ['comboAxis', 'Histogramme et courbe (axe secondaire)']] }; return map[kind].map((x) => ({ label: x[1], on: () => A.insertChart(x[0]) })); };

  /* ---------------- ruban ---------------- */
  const b = (id, icon, label, on, extra) => Object.assign({ type: 'btn', id, icon, label, on: () => on() }, extra || {});
  const TABS = [
    { id: 'home', label: 'Accueil', groups: [
      { label: 'Presse-papiers', items: [{ type: 'split', id: 'paste', icon: 'clipboard-paste', label: 'Coller', size: 'lg', kbd: 'mod+v', on: () => C.paste(), menu: () => [{ label: 'Coller', icon: 'clipboard-paste', on: () => C.paste() }, { label: 'Formules', on: () => C.paste({ what: 'formulas' }) }, { label: 'Valeurs', icon: 'hash', on: () => C.paste({ what: 'values' }) }, { label: 'Valeurs et formats', on: () => C.paste({ what: 'valuesFormats' }) }, { label: 'Mise en forme', icon: 'paintbrush', on: () => C.paste({ what: 'formats' }) }, { label: 'Transposer', icon: 'arrow-down-up', on: () => C.paste({ transpose: true }) }, { label: 'Lien vers la source', icon: 'link', on: () => C.paste({ link: true, what: 'link' }) }, { label: 'Sans bordures', on: () => C.paste({ what: 'noBorders' }) }, { label: 'Largeurs de colonnes', on: () => C.paste({ what: 'widths' }) }, '-', { label: 'Collage spécial…', kbd: 'Ctrl+Alt+V', on: () => D.pasteSpecial() }] },
        { type: 'col', items: [b('cut', 'scissors', 'Couper', () => C.copy(true), { kbd: 'mod+x' }), b('copy', 'copy', 'Copier', () => C.copy(false), { kbd: 'mod+c' }), b('painter', 'paintbrush', 'Reproduire la mise en forme', () => C.painter(false), { active: () => !!A.painter })] }] },
      { label: 'Police', launcher: () => D.formatCells('font'), items: [{ type: 'col', items: [{ type: 'row', items: [{ type: 'select', id: 'font', edit: true, width: 150, title: 'Police', options: fontOptions, value: () => st().fn || TB.DEFAULT_FONT, on: (c, v) => C.font(v) }, { type: 'select', id: 'size', edit: true, width: 54, title: 'Taille de police', options: () => SIZES.map((s) => [s, String(s)]), value: () => st().fs || TB.DEFAULT_SIZE, on: (c, v) => C.fontSize(parseFloat(String(v).replace(',', '.'))) }, b('grow', 'a-arrow-up', 'Augmenter la taille', () => C.growFont(1), { showLabel: false }), b('shrink', 'a-arrow-down', 'Réduire la taille', () => C.growFont(-1), { showLabel: false })] },
        { type: 'row', items: [b('bold', 'bold', 'Gras', () => C.toggle('b'), { kbd: 'mod+b', showLabel: false, active: () => !!st().b }), b('italic', 'italic', 'Italique', () => C.toggle('i'), { kbd: 'mod+i', showLabel: false, active: () => !!st().i }), { type: 'split', id: 'under', icon: 'underline', label: 'Souligné', showLabel: false, kbd: 'mod+u', active: () => !!st().u, on: () => C.underline(), menu: () => [{ label: 'Souligné', checked: st().u === 'single', on: () => C.underline('single') }, { label: 'Double souligné', checked: st().u === 'double', on: () => C.underline('double') }] }, b('strike', 'strikethrough', 'Barré', () => C.toggle('st'), { kbd: 'mod+5', showLabel: false, active: () => !!st().st }), { type: 'split', id: 'borders', icon: 'grid-3x3', label: 'Bordures', on: () => C.borders(A.lastBorder || 'bottom'), menu: borderItems }, { type: 'color', id: 'fill', icon: 'paint-bucket', label: 'Couleur de remplissage', def: '#FFFF00', on: (c, v) => C.fill(v), picker: (c, a, apply) => pick(a, apply, { none: 'Aucun remplissage' }) }, { type: 'color', id: 'fcolor', icon: 'baseline', label: 'Couleur de police', def: '#C00000', on: (c, v) => C.color(v), picker: (c, a, apply) => pick(a, apply, { auto: 'Automatique' }) }] }] }] },
      { label: 'Alignement', launcher: () => D.formatCells('align'), items: [{ type: 'col', items: [{ type: 'row', items: [b('vtop', 'align-start-vertical', 'Aligner en haut', () => C.valign('top'), { showLabel: false, active: () => st().va === 'top' }), b('vmid', 'align-center-vertical', 'Aligner au centre', () => C.valign('center'), { showLabel: false, active: () => st().va === 'center' }), b('vbot', 'align-end-vertical', 'Aligner en bas', () => C.valign('bottom'), { showLabel: false, active: () => !st().va || st().va === 'bottom' }), { type: 'menu', id: 'orient', icon: 'rotate-ccw', label: 'Orientation', showLabel: false, items: rotItems }, b('wrap', 'text-wrap', 'Renvoyer à la ligne automatiquement', () => C.toggle('wr'), { active: () => !!st().wr })] },
        { type: 'row', items: [b('aleft', 'align-left', 'Aligner à gauche', () => C.align(st().ha === 'left' ? 'general' : 'left'), { showLabel: false, active: () => st().ha === 'left' }), b('acenter', 'align-center', 'Centrer', () => C.align(st().ha === 'center' ? 'general' : 'center'), { showLabel: false, active: () => st().ha === 'center' }), b('aright', 'align-right', 'Aligner à droite', () => C.align(st().ha === 'right' ? 'general' : 'right'), { showLabel: false, active: () => st().ha === 'right' }), b('indm', 'indent-decrease', 'Diminuer le retrait', () => C.indent(-1), { showLabel: false }), b('indp', 'indent-increase', 'Augmenter le retrait', () => C.indent(1), { showLabel: false }), { type: 'split', id: 'merge', icon: 'table-cells-merge', label: 'Fusionner et centrer', on: () => C.merge('center'), menu: mergeItems, active: () => !!sh().mergeAt(G().sel.r, G().sel.c) }] }] }] },
      { label: 'Nombre', launcher: () => D.formatCells('number'), items: [{ type: 'col', items: [{ type: 'menu', id: 'nf', icon: 'hash', label: 'Format de nombre', items: numFmtItems }, { type: 'row', items: [{ type: 'split', id: 'cur', icon: 'euro', label: 'Monétaire', showLabel: false, on: () => C.numFmt(TB.Fmt.build('accounting')), menu: () => [['€', 'Euro (€)'], ['$', 'Dollar ($)'], ['£', 'Livre (£)'], ['CHF', 'Franc suisse (CHF)']].map((x) => ({ label: x[1], on: () => C.numFmt(TB.Fmt.build('accounting', { sym: x[0] })) })).concat(['-', { label: 'Monétaire (sans comptabilité)', on: () => C.numFmt(TB.Fmt.build('currency')) }, { label: 'Autres formats…', on: () => D.formatCells('number') }]) }, b('pct', 'percent', 'Pourcentage', () => C.numFmt('0%'), { showLabel: false, kbd: 'mod+shift+%' }), b('thou', 'hash', 'Séparateur de milliers', () => C.numFmt('#,##0.00'), { showLabel: false }), b('decp', 'decimals-arrow-right', 'Ajouter une décimale', () => C.addDec(1), { showLabel: false }), b('decm', 'decimals-arrow-left', 'Réduire les décimales', () => C.addDec(-1), { showLabel: false })] }] }] },
      { label: 'Styles', items: [{ type: 'menu', id: 'cfm', icon: 'highlighter', label: 'Mise en forme conditionnelle', size: 'lg', items: condItems }, { type: 'menu', id: 'astable', icon: 'table', label: 'Mettre sous forme de tableau', size: 'lg', items: () => [{ node: tableGalleryNode() }] }, { type: 'menu', id: 'cstyles', icon: 'paint-roller', label: 'Styles de cellules', size: 'lg', items: () => [{ node: cellStylesNode() }] }] },
      { label: 'Cellules', items: [{ type: 'split', id: 'ins', icon: 'between-horizontal-start', label: 'Insérer', size: 'lg', on: () => C.insert('auto'), menu: insertItems }, { type: 'split', id: 'del', icon: 'between-horizontal-end', label: 'Supprimer', size: 'lg', on: () => C.remove('auto'), menu: deleteItems }, { type: 'menu', id: 'fmtm', icon: 'settings-2', label: 'Format', size: 'lg', items: formatItems }] },
      { label: 'Édition', items: [{ type: 'col', items: [{ type: 'split', id: 'asum', icon: 'sigma', label: 'Somme automatique', kbd: 'alt+=', on: () => C.autoSum('SUM'), menu: () => [['SUM', 'Somme'], ['AVERAGE', 'Moyenne'], ['COUNT', 'Nombre'], ['MAX', 'Max'], ['MIN', 'Min']].map((x) => ({ label: x[1], on: () => C.autoSum(x[0]) })).concat(['-', { label: 'Autres fonctions…', on: () => D.insertFunction() }]) }, { type: 'menu', id: 'fillm', icon: 'arrow-down-to-line', label: 'Remplissage', items: () => [{ label: 'En bas', kbd: 'Ctrl+D', icon: 'arrow-down', on: () => C.fillDir('down') }, { label: 'À droite', kbd: 'Ctrl+R', icon: 'arrow-right', on: () => C.fillDir('right') }, { label: 'En haut', icon: 'arrow-up', on: () => C.fillDir('up') }, { label: 'À gauche', icon: 'arrow-left', on: () => C.fillDir('left') }, '-', { label: 'Série…', icon: 'list-ordered', on: () => D.series() }, { label: 'Remplissage instantané', icon: 'wand-sparkles', kbd: 'Ctrl+E', on: () => C.flashFill() }] }, { type: 'menu', id: 'clearm', icon: 'eraser', label: 'Effacer', items: clearItems }] },
        { type: 'menu', id: 'sortm', icon: 'arrow-down-wide-narrow', label: 'Trier et filtrer', size: 'lg', items: sortFilterItems }, { type: 'menu', id: 'findm', icon: 'search', label: 'Rechercher et sélectionner', size: 'lg', items: findItems }] }
    ] },
    { id: 'insert', label: 'Insertion', groups: [
      { label: 'Tableaux', items: [b('pivot', 'table-properties', 'Tableau croisé dynamique', () => D.pivot(), { size: 'lg' }), b('table', 'table', 'Tableau', () => D.makeTable(), { size: 'lg', kbd: 'mod+t' })] },
      { label: 'Illustrations', items: [b('img', 'image', 'Images', () => A.insertImage(), { size: 'lg' }), { type: 'menu', id: 'shp', icon: 'shapes', label: 'Formes', size: 'lg', items: () => [{ node: shapesNode() }] }, b('icons', 'star', 'Icônes', () => D.icons(), { size: 'lg' }), b('tbox', 'type', 'Zone de texte', () => A.insertShape('rect', { text: true, textbox: true }), { size: 'lg' })] },
      { label: 'Graphiques', launcher: () => D.chartPicker(), items: [{ type: 'col', items: [{ type: 'row', items: [{ type: 'menu', id: 'chcol', icon: 'chart-column', label: 'Histogramme', showLabel: false, items: chartMenu('col') }, { type: 'menu', id: 'chbar', icon: 'chart-bar', label: 'Barres', showLabel: false, items: chartMenu('bar') }, { type: 'menu', id: 'chline', icon: 'chart-line', label: 'Courbes', showLabel: false, items: chartMenu('line') }, { type: 'menu', id: 'charea', icon: 'chart-area', label: 'Aires', showLabel: false, items: chartMenu('area') }] }, { type: 'row', items: [{ type: 'menu', id: 'chpie', icon: 'chart-pie', label: 'Secteurs et anneau', showLabel: false, items: chartMenu('pie') }, { type: 'menu', id: 'chsc', icon: 'chart-scatter', label: 'Nuage de points', showLabel: false, items: chartMenu('scatter') }, { type: 'menu', id: 'chcombo', icon: 'chart-no-axes-combined', label: 'Graphique combiné', showLabel: false, items: chartMenu('combo') }] }] }, b('chrec', 'chart-column-big', 'Graphiques recommandés', () => D.chartPicker(), { size: 'lg' })] },
      { label: 'Graphiques sparkline', items: [{ type: 'col', items: [b('spl', 'chart-spline', 'Courbe', () => D.sparkline('line')), b('spc', 'chart-column', 'Histogramme', () => D.sparkline('column')), b('spw', 'chart-no-axes-column', 'Positif/Négatif', () => D.sparkline('winloss'))] }] },
      { label: 'Liens', items: [b('link', 'link', 'Lien', () => C.link(), { size: 'lg', kbd: 'mod+k' })] },
      { label: 'Commentaires', items: [b('cmt', 'message-square-plus', 'Commentaire', () => C.comment(), { size: 'lg' }), b('note', 'sticky-note', 'Note', () => C.note(), { size: 'lg', kbd: 'shift+f2' })] },
      { label: 'Texte', items: [{ type: 'col', items: [b('hf', 'panel-top', 'En-tête et pied de page', () => D.pageSetup('hf')), b('sym', 'omega', 'Symbole', () => D.symbol()), b('fx2', 'square-function', 'Fonction', () => D.insertFunction())] }] }
    ] },
    { id: 'layout', label: 'Mise en page', groups: [
      { label: 'Thèmes', items: [{ type: 'menu', id: 'theme', icon: 'palette', label: 'Couleurs du classeur', size: 'lg', items: () => Object.keys(TB.THEMES).map((k) => ({ label: TB.THEMES[k].name, checked: wb().settings.theme === k && !wb().themeColors, html: '<span style="display:inline-flex;margin-right:8px">' + TB.THEMES[k].c.slice(4, 10).map((c) => '<i style="width:12px;height:14px;background:' + c + '"></i>').join('') + '</span>' + O.esc(TB.THEMES[k].name), on: () => C.setTheme(k) })) }] },
      { label: 'Mise en page', launcher: () => D.pageSetup('page'), items: [{ type: 'menu', id: 'marg', icon: 'square-dashed', label: 'Marges', size: 'lg', items: () => [['normal', 'Normales (1,9 / 1,8 cm)'], ['wide', 'Larges (2,5 cm)'], ['narrow', 'Étroites (1,3 / 0,6 cm)']].map((x) => ({ label: x[1], on: () => C.margins(x[0]) })).concat(['-', { label: 'Marges personnalisées…', on: () => D.pageSetup('margins') }]) }, { type: 'menu', id: 'orient2', icon: 'rectangle-horizontal', label: 'Orientation', size: 'lg', items: () => [{ label: 'Portrait', checked: (sh().print.orient || 'portrait') === 'portrait', on: () => C.printSet({ orient: 'portrait' }) }, { label: 'Paysage', checked: sh().print.orient === 'landscape', on: () => C.printSet({ orient: 'landscape' }) }] }, { type: 'menu', id: 'psize', icon: 'file', label: 'Taille', size: 'lg', items: () => [['a4', 'A4 (21 × 29,7 cm)'], ['a3', 'A3 (29,7 × 42 cm)'], ['a5', 'A5 (14,8 × 21 cm)'], ['letter', 'Lettre US'], ['legal', 'Légal US']].map((x) => ({ label: x[1], checked: (sh().print.paper || 'a4') === x[0], on: () => C.printSet({ paper: x[0] }) })) }, { type: 'menu', id: 'parea', icon: 'scan', label: 'Zone d\'impression', size: 'lg', items: () => [{ label: 'Définir', on: () => C.printSet({ area: TB.rangeStr(A.bounded(G().range())) }) }, { label: 'Annuler', disabled: !sh().print.area, on: () => C.printSet({ area: null }) }] }, b('ptitles', 'rows-2', 'Imprimer les titres', () => D.pageSetup('sheet'), { size: 'lg' })] },
      { label: 'Mise à l\'échelle', launcher: () => D.pageSetup('page'), items: [{ type: 'col', items: [{ type: 'select', id: 'fitw', width: 110, title: 'Largeur', options: () => [['', 'Largeur : auto'], ['1', '1 page'], ['2', '2 pages'], ['3', '3 pages']], value: () => sh().print.fitW ? String(sh().print.fitW) : '', on: (c, v) => C.printSet({ fitW: v ? +v : null, scale: v ? null : sh().print.scale }) }, { type: 'select', id: 'fith', width: 110, title: 'Hauteur', options: () => [['', 'Hauteur : auto'], ['1', '1 page'], ['2', '2 pages'], ['3', '3 pages']], value: () => sh().print.fitH ? String(sh().print.fitH) : '', on: (c, v) => C.printSet({ fitH: v ? +v : null }) }, { type: 'num', id: 'scale', label: 'Échelle', unit: '%', min: 10, max: 400, step: 5, value: () => sh().print.scale || 100, on: (c, v) => C.printSet({ scale: v, fitW: null, fitH: null }) }] }] },
      { label: 'Options de la feuille', items: [{ type: 'col', items: [b('gridv', 'grid-3x3', 'Quadrillage : afficher', () => C.toggleGrid(), { active: () => sh().grid !== false }), b('gridp', 'printer', 'Quadrillage : imprimer', () => C.printSet({ grid: !sh().print.grid }), { active: () => !!sh().print.grid })] }, { type: 'col', items: [b('headv', 'panel-top', 'En-têtes : afficher', () => C.toggleHeads(), { active: () => sh().heads !== false }), b('headp', 'printer', 'En-têtes : imprimer', () => C.printSet({ heads: !sh().print.heads }), { active: () => !!sh().print.heads })] }] },
      { label: 'Aperçu', items: [b('prev', 'eye', 'Aperçu et impression', () => A.openBackstage('print'), { size: 'lg' }), b('breaks', 'square-split-vertical', 'Sauts de page', () => { A.settings.breaks = !A.settings.breaks; A.saveSettings(); G().draw(); A.refreshUi(); }, { size: 'lg', active: () => !!A.settings.breaks })] }
    ] },
    { id: 'formulas', label: 'Formules', groups: [
      { label: 'Bibliothèque de fonctions', items: [b('ifn', 'square-function', 'Insérer une fonction', () => D.insertFunction(), { size: 'lg', kbd: 'shift+f3' }), { type: 'split', id: 'asum2', icon: 'sigma', label: 'Somme automatique', size: 'lg', on: () => C.autoSum('SUM'), menu: () => [['SUM', 'Somme'], ['AVERAGE', 'Moyenne'], ['COUNT', 'Nombre'], ['MAX', 'Max'], ['MIN', 'Min']].map((x) => ({ label: x[1], on: () => C.autoSum(x[0]) })) },
        { type: 'col', items: [{ type: 'menu', id: 'fnfin', icon: 'banknote', label: 'Financières', items: fnCat('fin') }, { type: 'menu', id: 'fnlog', icon: 'git-branch', label: 'Logiques', items: fnCat('logic') }, { type: 'menu', id: 'fntxt', icon: 'type', label: 'Texte', items: fnCat('text') }] }, { type: 'col', items: [{ type: 'menu', id: 'fndate', icon: 'calendar', label: 'Date et heure', items: fnCat('date') }, { type: 'menu', id: 'fnlook', icon: 'search', label: 'Recherche et référence', items: fnCat('lookup') }, { type: 'menu', id: 'fnmath', icon: 'calculator', label: 'Maths et trigo', items: fnCat('math') }] }, { type: 'menu', id: 'fnmore', icon: 'ellipsis', label: 'Plus de fonctions', size: 'lg', items: () => [['stat', 'Statistiques'], ['info', 'Information'], ['eng', 'Ingénierie'], ['db', 'Base de données']].map((x) => ({ label: x[1], sub: fnCat(x[0]) })) }] },
      { label: 'Noms définis', items: [b('names', 'tag', 'Gestionnaire de noms', () => D.names(), { size: 'lg', kbd: 'mod+f3' }), { type: 'col', items: [b('defname', 'tag', 'Définir un nom', () => C.defineName()), { type: 'menu', id: 'usename', icon: 'text-cursor-input', label: 'Utiliser dans la formule', items: () => wb().names.length ? wb().names.map((n) => ({ label: n.n, on: () => A.insertText(n.n) })) : [{ label: 'Aucun nom défini', disabled: true }] }, b('fromsel', 'table-2', 'Créer depuis la sélection', () => D.namesFromSel())] }] },
      { label: 'Vérification des formules', items: [{ type: 'col', items: [b('prec', 'arrow-right-from-line', 'Repérer les antécédents', () => C.trace('prec')), b('deps', 'arrow-right-to-line', 'Repérer les dépendants', () => C.trace('deps')), b('noarrows', 'eraser', 'Supprimer les flèches', () => C.trace('none'))] }, { type: 'col', items: [b('showf', 'square-function', 'Afficher les formules', () => C.toggleFormulas(), { kbd: 'mod+`', active: () => !!sh().showF }), b('errchk', 'triangle-alert', 'Vérification des erreurs', () => D.errorCheck()), b('evalf', 'list-checks', 'Évaluer la formule', () => D.evalFormula())] }] },
      { label: 'Calcul', items: [{ type: 'menu', id: 'calcopt', icon: 'calculator', label: 'Options de calcul', size: 'lg', items: () => [{ label: 'Automatique', checked: wb().settings.calc !== 'manual', on: () => C.calcMode('auto') }, { label: 'Manuel', checked: wb().settings.calc === 'manual', on: () => C.calcMode('manual') }, '-', { label: 'Calcul itératif (références circulaires)', checked: !!wb().settings.iter, on: () => { wb().settings.iter = !wb().settings.iter; C.recalc(); } }] }, { type: 'col', items: [b('calcnow', 'refresh-cw', 'Calculer maintenant', () => C.recalc(), { kbd: 'f9' }), b('calcsheet', 'refresh-cw', 'Calculer la feuille', () => C.recalc(), { kbd: 'shift+f9' })] }] },
      { label: 'Langue des formules', items: [{ type: 'col', items: [{ type: 'select', id: 'fnlang', width: 150, title: 'Noms des fonctions', options: () => [['fr', 'Fonctions : français'], ['en', 'Fonctions : anglais']], value: () => TB.loc.fn, on: (c, v) => A.setLocale({ fn: v }) }, { type: 'select', id: 'seps', width: 150, title: 'Séparateurs', options: () => [['fr', 'Séparateur « ; » et 1,5'], ['en', 'Séparateur « , » et 1.5']], value: () => TB.loc.sep, on: (c, v) => A.setLocale({ sep: v }) }] }] }
    ] },
    { id: 'data', label: 'Données', groups: [
      { label: 'Récupérer des données', items: [b('csvimp', 'file-input', 'À partir d\'un fichier texte / CSV', () => A.importCsv(), { size: 'lg' }), b('refreshall', 'refresh-cw', 'Actualiser tout', () => C.refreshPivots(), { size: 'lg' })] },
      { label: 'Trier et filtrer', items: [{ type: 'col', items: [b('az', 'arrow-down-a-z', 'Trier de A à Z', () => C.quickSort(false), { showLabel: false }), b('za', 'arrow-up-z-a', 'Trier de Z à A', () => C.quickSort(true), { showLabel: false })] }, b('sortdlg', 'list-sort-ascending', 'Trier', () => D.sort(), { size: 'lg' }), b('filter', 'funnel', 'Filtrer', () => C.toggleFilter(), { size: 'lg', kbd: 'mod+shift+l', active: () => !!sh().af }), { type: 'col', items: [b('fclear', 'funnel-x', 'Effacer', () => C.clearFilters(), { disabled: () => !sh().af && !sh().tables.some((t) => t.af && Object.keys(t.af).length) }), b('freapply', 'refresh-cw', 'Réappliquer', () => C.reapplyFilter()), b('fadv', 'list-filter-plus', 'Avancé', () => D.advancedFilter())] }] },
      { label: 'Outils de données', items: [b('t2c', 'columns-3', 'Convertir', () => D.textToColumns(), { size: 'lg' }), { type: 'col', items: [b('flash', 'wand-sparkles', 'Remplissage instantané', () => C.flashFill(), { kbd: 'mod+e' }), b('dups', 'list-x', 'Supprimer les doublons', () => D.removeDuplicates()), { type: 'split', id: 'dv', icon: 'shield-check', label: 'Validation des données', on: () => D.validation(), menu: () => [{ label: 'Validation des données…', on: () => D.validation() }, { label: 'Entourer les données non valides', on: () => C.circleInvalid() }, { label: 'Effacer les cercles', on: () => { G().arrows = []; G().draw(); } }] }] }] },
      { label: 'Prévision', items: [{ type: 'menu', id: 'whatif', icon: 'target', label: 'Analyse de scénarios', size: 'lg', items: () => [{ label: 'Valeur cible…', icon: 'target', on: () => D.goalSeek() }] }] },
      { label: 'Plan', items: [{ type: 'split', id: 'grp', icon: 'group', label: 'Grouper', size: 'lg', on: () => C.group(1), menu: () => [{ label: 'Grouper', on: () => C.group(1) }, { label: 'Plan automatique (sous-totaux)', on: () => D.subtotals() }] }, { type: 'split', id: 'ungrp', icon: 'ungroup', label: 'Dissocier', size: 'lg', on: () => C.group(-1), menu: () => [{ label: 'Dissocier', on: () => C.group(-1) }, { label: 'Effacer le plan', on: () => C.clearOutline() }] }, b('subt', 'sigma-square', 'Sous-total', () => D.subtotals(), { size: 'lg' })] }
    ] },
    { id: 'review', label: 'Révision', groups: [
      { label: 'Vérification', items: [b('stats', 'chart-no-axes-column', 'Statistiques du classeur', () => D.stats(), { size: 'lg' }), b('findp', 'search', 'Rechercher', () => A.openPane('find'), { size: 'lg', kbd: 'mod+f' })] },
      { label: 'Commentaires', items: [b('ncmt', 'message-square-plus', 'Nouveau commentaire', () => C.comment(), { size: 'lg' }), { type: 'col', items: [b('pcmt', 'messages-square', 'Afficher les commentaires', () => A.openPane(A.pane === 'comments' ? null : 'comments'), { active: () => A.pane === 'comments' }), b('dcmt', 'trash-2', 'Supprimer', () => C.clear('notes'))] }] },
      { label: 'Notes', items: [{ type: 'col', items: [b('nnote', 'sticky-note', 'Nouvelle note / modifier', () => C.note()), b('allnotes', 'eye', 'Afficher toutes les notes', () => A.openPane('comments', { notes: true }))] }] },
      { label: 'Protéger', items: [b('psheet', 'lock', 'Protéger la feuille', () => D.protectSheet(), { size: 'lg', active: () => !!sh().protect }), b('pbook', 'book-lock', 'Protéger le classeur', () => D.protectBook(), { size: 'lg', active: () => !!(wb().protect && wb().protect.structure) })] }
    ] },
    { id: 'view', label: 'Affichage', groups: [
      { label: 'Affichages', items: [b('vnormal', 'table', 'Normal', () => { A.settings.breaks = false; A.saveSettings(); G().draw(); A.refreshUi(); }, { size: 'lg', active: () => !A.settings.breaks }), b('vbreak', 'square-split-vertical', 'Aperçu des sauts de page', () => { A.settings.breaks = true; A.saveSettings(); G().draw(); A.refreshUi(); }, { size: 'lg', active: () => !!A.settings.breaks })] },
      { label: 'Afficher', items: [{ type: 'col', items: [b('vgrid', 'grid-3x3', 'Quadrillage', () => C.toggleGrid(), { active: () => sh().grid !== false }), b('vfbar', 'square-function', 'Barre de formule', () => { A.settings.fbar = A.settings.fbar === false; A.saveSettings(); A.applyUi(); }, { active: () => A.settings.fbar !== false }), b('vheads', 'panel-top', 'En-têtes', () => C.toggleHeads(), { active: () => sh().heads !== false })] }] },
      { label: 'Zoom', items: [b('zoomd', 'zoom-in', 'Zoom', () => D.zoom(), { size: 'lg' }), b('z100', 'scan', '100 %', () => A.setZoom(1), { size: 'lg' }), b('zsel', 'scan-search', 'Zoom sur la sélection', () => A.zoomToSel(), { size: 'lg' })] },
      { label: 'Fenêtre', items: [{ type: 'menu', id: 'freeze', icon: 'snowflake', label: 'Figer les volets', size: 'lg', items: () => [{ label: sh().freeze.r || sh().freeze.c ? 'Libérer les volets' : 'Figer les volets', on: () => C.freeze(sh().freeze.r || sh().freeze.c ? 'none' : 'sel') }, { label: 'Figer la ligne supérieure', on: () => C.freeze('row') }, { label: 'Figer la première colonne', on: () => C.freeze('col') }] }] },
      { label: 'Apparence', items: [{ type: 'menu', id: 'uimode', icon: 'sun-moon', label: 'Thème de l\'appli', size: 'lg', items: () => [['', 'Comme le système'], ['clair', 'Clair'], ['sombre', 'Sombre']].map((x) => ({ label: x[1], checked: (A.settings.ui || '') === x[0], on: () => { A.settings.ui = x[0]; A.saveSettings(); A.applyUi(); } })) }] }
    ] },
    { id: 'tdesign', label: 'Création de tableau', contextual: () => !!A.curTable(), accent: true, groups: [
      { label: 'Propriétés', items: [{ type: 'col', items: [{ type: 'html', id: 'tname', html: () => '<label class="o-rb-num"><span>Nom</span><input id="tblName" style="width:120px"></label>', mount: (el) => { const i = el.querySelector('input'); const T = A.curTable(); i.value = T ? T.name : ''; i.onchange = () => C.renameTable(i.value); } }, b('tresize', 'scaling', 'Redimensionner le tableau', () => D.resizeTable())] }] },
      { label: 'Outils', items: [{ type: 'col', items: [b('tpivot', 'table-properties', 'Synthétiser avec un TCD', () => D.pivot()), b('tdups', 'list-x', 'Supprimer les doublons', () => D.removeDuplicates()), b('tconv', 'table-2', 'Convertir en plage', () => C.tableToRange())] }] },
      { label: 'Options de style de tableau', items: [{ type: 'col', items: [tcheck('header', 'Ligne d\'en-tête', true), tcheck('totals', 'Ligne Total', false), tcheck('bandRows', 'Lignes à bandes', true)] }, { type: 'col', items: [tcheck('firstCol', 'Première colonne', false), tcheck('lastCol', 'Dernière colonne', false), tcheck('bandCols', 'Colonnes à bandes', false)] }, { type: 'col', items: [tcheck('filter', 'Bouton de filtre', true)] }] },
      { label: 'Styles de tableaux', items: [{ type: 'gallery', id: 'tstyles', w: 64, h: 48, items: tableStyles, current: () => (A.curTable() || {}).style || 'TableStyleMedium2', on: (c, it) => C.tableSet({ style: it.id }), groups: () => [{ label: 'Clair', items: tableStyles().filter((x) => /Light/.test(x.id)) }, { label: 'Moyen', items: tableStyles().filter((x) => /Medium/.test(x.id)) }, { label: 'Foncé', items: tableStyles().filter((x) => /Dark/.test(x.id)) }] }] }
    ] },
    { id: 'chart', label: 'Graphique', contextual: () => !!A.selObj && A.selObj.type === 'chart', accent: true, groups: [
      { label: 'Type', items: [b('chtype', 'chart-column', 'Modifier le type', () => D.chartType(), { size: 'lg' }), b('chdata', 'table-2', 'Sélectionner les données', () => D.chartData(), { size: 'lg' }), b('chswap', 'arrow-left-right', 'Intervertir lignes / colonnes', () => A.chartSet((c) => ({ byRow: !c.byRow })), { size: 'lg' })] },
      { label: 'Éléments', items: [{ type: 'col', items: [b('chtitle', 'heading-1', 'Titre…', () => D.chartTitles()), { type: 'menu', id: 'chleg', icon: 'list', label: 'Légende', items: () => [['none', 'Aucune'], ['right', 'À droite'], ['top', 'En haut'], ['bottom', 'En bas'], ['left', 'À gauche']].map((x) => ({ label: x[1], checked: (A.selObj.chart.legend || 'bottom') === x[0], on: () => A.chartSet({ legend: x[0] }) })) }, b('chlabels', 'tag', 'Étiquettes de données', () => A.chartSet((c) => ({ labels: !c.labels })), { active: () => !!(A.selObj && A.selObj.chart && A.selObj.chart.labels) })] }, { type: 'col', items: [b('chgrid', 'grid-3x3', 'Quadrillage', () => A.chartSet((c) => ({ grid: c.grid === false }))), b('chaxes', 'move-diagonal', 'Axes…', () => D.chartAxes()), b('chstyle', 'palette', 'Couleurs…', () => D.chartColors())] }] },
      { label: 'Disposition', items: [b('chedit', 'settings-2', 'Mettre en forme', () => D.chartEdit(), { size: 'lg' }), b('chdel', 'trash-2', 'Supprimer', () => A.deleteObj(), { size: 'lg' })] }
    ] },
    { id: 'objfmt', label: 'Format de l\'objet', contextual: () => !!A.selObj && A.selObj.type !== 'chart', accent: true, groups: [
      { label: 'Forme', items: [{ type: 'color', id: 'ofill', icon: 'paint-bucket', label: 'Remplissage', def: '#4472C4', on: (c, v) => A.objSet({ fill: v || 'none' }), picker: (c, a, apply) => pick(a, apply, { none: 'Aucun remplissage' }) }, { type: 'color', id: 'oline', icon: 'pen-line', label: 'Contour', def: '#1F3864', on: (c, v) => A.objSet({ line: v || 'none' }), picker: (c, a, apply) => pick(a, apply, { none: 'Aucun contour' }) }, { type: 'color', id: 'otext', icon: 'baseline', label: 'Couleur du texte', def: '#FFFFFF', on: (c, v) => A.objSet({ color: v || '#000000' }), picker: (c, a, apply) => pick(a, apply) }] },
      { label: 'Organiser', items: [{ type: 'col', items: [b('ofront', 'bring-to-front', 'Premier plan', () => A.objOrder(1)), b('oback', 'send-to-back', 'Arrière-plan', () => A.objOrder(-1)), b('odel', 'trash-2', 'Supprimer', () => A.deleteObj())] }] },
      { label: 'Taille', items: [{ type: 'col', items: [{ type: 'num', id: 'ow', label: 'Largeur', unit: 'cm', step: 0.1, min: 0.1, value: () => A.selObj ? Math.round(A.selObj.w / 37.8 * 100) / 100 : '', on: (c, v) => A.objSet({ w: Math.round(v * 37.8) }) }, { type: 'num', id: 'oh', label: 'Hauteur', unit: 'cm', step: 0.1, min: 0.1, value: () => A.selObj ? Math.round(A.selObj.h / 37.8 * 100) / 100 : '', on: (c, v) => A.objSet({ h: Math.round(v * 37.8) }) }] }] }
    ] }
  ];
  function tcheck(k, label, def) { return { type: 'btn', id: 'tc_' + k, icon: 'square-check', label, active: () => { const t = A.curTable(); if (!t) return false; const v = t[k]; return v === undefined ? def : (k === 'header' || k === 'filter' || k === 'bandRows' ? v !== false : !!v); }, on: () => { const t = A.curTable(); if (!t) return; const cur = t[k] === undefined ? def : (k === 'header' || k === 'filter' || k === 'bandRows' ? t[k] !== false : !!t[k]); C.tableSet({ [k]: !cur }); } }; }
  function tableGalleryNode() {
    const node = O.h('div', { cls: 'o-gal-pop', style: { '--gw': '64px', '--gh': '48px' } });
    node.innerHTML = [['Clair', /Light/], ['Moyen', /Medium/], ['Foncé', /Dark/]].map(([l, re]) => '<div class="o-cp-lbl">' + l + '</div><div class="o-gal-grid">' + tableStyles().filter((x) => re.test(x.id)).map((it) => '<button type="button" class="o-gal-it" data-g="' + it.id + '" title="' + O.esc(it.title) + '">' + it.html + '</button>').join('') + '</div>').join('');
    node.addEventListener('click', (e) => { const x = e.target.closest('[data-g]'); if (x) { O.closeMenu(); D.makeTable(x.dataset.g); } });
    return node;
  }
  function cellStylesNode() {
    const node = O.h('div', { cls: 'o-gal-pop', style: { '--gw': '104px', '--gh': '30px' } });
    node.innerHTML = '<div class="o-gal-grid">' + CELL_STYLES.map((s, i) => '<button type="button" class="o-gal-it" data-cs="' + i + '" title="' + O.esc(s[0]) + '">' + cellStyleHtml(s) + '</button>').join('') + '</div>';
    node.addEventListener('click', (e) => { const x = e.target.closest('[data-cs]'); if (x) { O.closeMenu(); C.cellStyle(CELL_STYLES[+x.dataset.cs][1]); } });
    return node;
  }
  function shapesNode() {
    const node = O.h('div', { cls: 'o-gal-pop' }); const Pr = window.Pres || {};
    const ids = (Pr.SHAPES ? Pr.SHAPES.map((s) => s.id || s[0]) : ['rect', 'roundRect', 'ellipse', 'triangle', 'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'star5', 'line', 'arrow']).slice(0, 48);
    node.innerHTML = '<div class="sh-grid">' + ids.map((id) => '<button type="button" data-sh="' + id + '" title="' + O.esc(id) + '">' + shapeIcon(id) + '</button>').join('') + '</div>';
    node.addEventListener('click', (e) => { const x = e.target.closest('[data-sh]'); if (x) { O.closeMenu(); A.insertShape(x.dataset.sh); } });
    return node;
  }
  function shapeIcon(id) { const Pr = window.Pres; if (!Pr || !Pr.shapeParts) return O.icon('square'); if (Pr.isLineShape && Pr.isLineShape(id)) return '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M3,21 L21,3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'; try { return '<svg viewBox="-1 -1 26 26" width="20" height="20">' + Pr.shapeParts(id, 24, 24, (Pr.DEFAULT_ADJ || {})[id] || {}).map((p) => '<path d="' + p.d + '" fill="' + (p.fill === 'none' ? 'none' : 'currentColor') + '" fill-opacity=".3" stroke="currentColor" stroke-width="1.2"/>').join('') + '</svg>'; } catch (e) { return O.icon('square'); } }

  /* ---------------- montage ---------------- */
  A.mountUi = function () {
    titlebar(); formulaBar(); sheetBar(); statusBar();
    A.ribbon = O.Ribbon($('#ribbonHost'), { tabs: TABS, ctx: {}, file: { label: 'Fichier', on: () => A.openBackstage('home') }, onLayout: () => { G().updateExtent(); G().draw(); }, extraCommands: [{ label: 'Enregistrer', icon: 'save', tab: 'Fichier', c: { on: () => C.save() } }, { label: 'Exporter en PDF', icon: 'file-badge', tab: 'Fichier', c: { on: () => C.exportAs('pdf') } }, { label: 'Enregistrer en .xlsx', icon: 'file-spreadsheet', tab: 'Fichier', c: { on: () => C.saveAs('xlsx') } }, { label: 'Imprimer', icon: 'printer', tab: 'Fichier', c: { on: () => A.openBackstage('print') } }, { label: 'Raccourcis clavier', icon: 'keyboard', tab: 'Aide', c: { on: () => C.shortcuts() } }, { label: 'Format de cellule', icon: 'settings-2', tab: 'Accueil', c: { on: () => D.formatCells() } }, { label: 'Valeur cible', icon: 'target', tab: 'Données', c: { on: () => D.goalSeek() } }] });
    keys();
    clipboardEvents();
    A.panesInit && A.panesInit();
  };
  let refreshT = null;
  A.refreshUi = function () {
    clearTimeout(refreshT);
    refreshT = setTimeout(() => {
      try { A.ribbon.refresh(); } catch (e) { console.warn(e); }
      const t = A.curTable(); if (t && A._lastTable !== t.name && !O.narrow()) { A._lastTable = t.name; } else if (!t) A._lastTable = null;
      if (A.selObj && A._lastObjSel !== A.selObj && !O.narrow()) { A._lastObjSel = A.selObj; A.ribbon.select(A.selObj.type === 'chart' ? 'chart' : 'objfmt'); } else if (!A.selObj) A._lastObjSel = null;
      renderTitle();
    }, 40);
  };
  A.curTable = () => { const s = sh(), g = G(); return s.tableAt(g.sel.r, g.sel.c); };

  /* ---------------- barre de titre ---------------- */
  function titlebar() {
    const tb = $('#titlebar');
    tb.innerHTML = '<img class="logo" src="icon-512.png" alt=""><input id="docname" aria-label="Nom du classeur" spellcheck="false"><span id="savestate"></span><button type="button" class="tbb" id="tbSave" title="Enregistrer (Ctrl+S)" aria-label="Enregistrer">' + O.icon('save') + '</button><button type="button" class="tbb" id="tbUndo" title="Annuler (Ctrl+Z)" aria-label="Annuler">' + O.icon('undo-2') + '</button><button type="button" class="tbb" id="tbRedo" title="Rétablir (Ctrl+Y)" aria-label="Rétablir">' + O.icon('redo-2') + '</button><span class="tb-sp"></span>' +
      '<button type="button" class="tbb" id="tbFind" title="Rechercher (Ctrl+F)" aria-label="Rechercher">' + O.icon('search') + '</button><button type="button" class="tbb" id="tbCmts" title="Commentaires" aria-label="Commentaires">' + O.icon('messages-square') + '</button><button type="button" class="tbb hide-m" id="tbShare" title="Partager">' + O.icon('share-2') + '<span>Partager</span></button><button type="button" class="tbb pri" id="tbPdf" title="Exporter en PDF">' + O.icon('file-badge') + '<span class="hide-m">PDF</span></button>';
    tb.addEventListener('click', (e) => {
      const x = e.target.closest('button'); if (!x) return;
      if (x.id === 'tbSave') C.save(); if (x.id === 'tbUndo') A.undo(); if (x.id === 'tbRedo') A.redo();
      if (x.id === 'tbFind') A.openPane(A.pane === 'find' ? null : 'find'); if (x.id === 'tbCmts') A.openPane(A.pane === 'comments' ? null : 'comments');
      if (x.id === 'tbShare') A.openBackstage('share'); if (x.id === 'tbPdf') C.exportAs('pdf');
    });
    const dn = $('#docname');
    dn.addEventListener('change', () => { const v = dn.value.trim(); if (!v) { renderTitle(); return; } wb().props.title = v; if (A.file.name && !A.file.ref) A.file.name = O.safeName(v, (A.KINDS[A.file.kind || 'magcalc'] || {}).ext || '.magcalc'); A.dirty = true; renderTitle(); });
    dn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { dn.blur(); G().focus(); } });
  }
  function renderTitle() {
    const n = $('#docname'); if (n && document.activeElement !== n) n.value = A.docName();
    const s = $('#savestate'); if (s) s.innerHTML = A.dirty ? O.icon('circle-dot') + '<span class="hide-m">Modifié</span>' : A.file && A.file.name ? O.icon('circle-check') + '<span class="hide-m">Enregistré</span>' : '';
    document.title = A.docName() + ' · Tableur';
    const u = $('#tbUndo'), r = $('#tbRedo'); if (u) { u.disabled = !wb().canUndo(); u.title = 'Annuler ' + (wb().undoLabel() ? '« ' + wb().undoLabel() + ' » ' : '') + '(Ctrl+Z)'; } if (r) { r.disabled = !wb().canRedo(); r.title = 'Rétablir ' + (wb().redoLabel() ? '« ' + wb().redoLabel() + ' » ' : '') + '(Ctrl+Y)'; }
  }
  A.renderTitle = renderTitle;
  A.undo = function () { const Gr = G(); if (Gr.edit) { Gr.cancelEdit(); return; } const t = wb().undo(); if (!t) return; if (t.sel && t.sel.sh && wb().sheets.indexOf(t.sel.sh) >= 0) { if (t.sel.sh !== sh()) A.showSheet(t.sel.sh); } A.afterUndo(); O.toast('Annulé : ' + (t.label || ''), { ms: 1100 }); };
  A.redo = function () { const t = wb().redo(); if (!t) { if (A.lastAction) A.lastAction.run(); return; } A.afterUndo(); O.toast('Rétabli : ' + (t.label || ''), { ms: 1100 }); };
  A.afterUndo = function () { const s = sh(); if (wb().active >= wb().sheets.length) wb().active = 0; G().sheetChanged && null; A.changed(); A.renderTabs(); void s; };

  /* ---------------- barre de formule ---------------- */
  function formulaBar() {
    const fb = $('#fbar');
    fb.innerHTML = '<input id="namebox" aria-label="Zone Nom" spellcheck="false" autocomplete="off"><button type="button" class="nbdd" id="nbdd" aria-label="Noms">' + O.icon('chevron-down') + '</button><span class="fb-btns"><button type="button" id="fbX" title="Annuler la saisie (Échap)" aria-label="Annuler" disabled>' + O.icon('x') + '</button><button type="button" id="fbOk" title="Valider (Entrée)" aria-label="Valider" disabled>' + O.icon('check') + '</button><button type="button" class="fx" id="fbFx" title="Insérer une fonction (Maj+F3)" aria-label="Insérer une fonction">fx</button></span><textarea id="fx" rows="1" spellcheck="false" autocomplete="off" aria-label="Barre de formule"></textarea><button type="button" class="fb-exp" id="fbExp" title="Développer la barre de formule (Ctrl+Maj+U)" aria-label="Développer">' + O.icon('chevrons-up-down') + '</button><div id="acList" role="listbox"></div><div id="fnHelp"></div>';
    const fx = A.fx = $('#fx'), nb = $('#namebox');
    fx.addEventListener('focus', () => { const Gr = G(); if (!Gr.edit) { if (!Gr.beginEdit({ src: 'bar', mode: 'edit' })) { fx.blur(); return; } } else if (Gr.edit.src !== 'bar') { Gr.edit.src = 'bar'; } setTimeout(() => { if (document.activeElement === fx && Gr.edit) { const p = fx.selectionStart; void p; } }, 0); });
    fx.addEventListener('input', () => { const Gr = G(); if (!Gr.edit) return; if (Gr.point && !Gr.point.keep) Gr.point = null; if (Gr.point) Gr.point.keep = false; Gr.onEditInput(); });
    fx.addEventListener('keydown', (e) => editKey(e, fx));
    fx.addEventListener('click', () => { G().point = null; A.onEditInput(fx.value); });
    ['keyup', 'click'].forEach((ev) => G().editor.addEventListener(ev, () => { if (G().edit) A.onEditInput(G().editor.value); }));
    G().editor.addEventListener('keydown', (e) => editKey(e, G().editor));
    G().editor.addEventListener('blur', () => { setTimeout(hideAc, 150); });
    $('#fbX').onclick = () => G().cancelEdit();
    $('#fbOk').onclick = () => G().commitEdit(null);
    $('#fbFx').onclick = () => D.insertFunction();
    $('#fbExp').onclick = () => { fb.classList.toggle('tall'); G().updateExtent(); G().draw(); };
    nb.addEventListener('focus', () => nb.select());
    nb.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); A.goToName(nb.value.trim()); G().focus(); } else if (e.key === 'Escape') { A.onSelect(); G().focus(); } });
    $('#nbdd').onclick = () => O.menu($('#nbdd'), wb().names.length ? wb().names.map((n) => ({ label: n.n, html: O.esc(n.n) + '<small class="o-mi-note">' + O.esc(P.toUser(n.f)) + '</small>', on: () => A.goToName(n.n) })).concat(sh().tables.map((t) => ({ label: t.name, icon: 'table', on: () => A.goToName(t.name) }))) : [{ label: 'Aucun nom défini', disabled: true }, { label: 'Définir un nom…', on: () => C.defineName() }]);
  }
  A.applyUi = function () {
    if (A.settings.ui) document.documentElement.setAttribute('data-ui', A.settings.ui); else document.documentElement.removeAttribute('data-ui');
    const fb = $('#fbar'); if (fb) fb.hidden = A.settings.fbar === false;
    if (A.grid) { A.grid.updateExtent(); A.grid.draw(); }
  };
  A.goToName = function (t) {
    if (!t) return;
    const nm = wb().findName(t, sh());
    let target = null, s = sh();
    if (nm) { try { const v = TB.ev(P.parse(String(nm.f).replace(/^=/, '')), { wb: wb(), sh: s, r: 0, c: 0, env: null, depth: 0 }); if (v instanceof TB.Ref) { target = v; s = v.sh; } } catch (e) { } }
    if (!target) { const T = wb().table(t); if (T) { s = T.sh; target = { r1: T.t.r1, c1: T.t.c1, r2: T.t.r2, c2: T.t.c2 }; } }
    if (!target) { const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(t); if (m) { const s2 = wb().sheet((m[1] || m[2]).replace(/''/g, "'")); if (s2) { s = s2; t = m[3]; } } const g = TB.parseRange(t); if (g) target = g; }
    if (!target) { O.toast('Référence ou nom introuvable : ' + t, { bad: true }); return; }
    if (s !== sh()) A.showSheet(s);
    G().setRange({ r1: target.r1, c1: target.c1, r2: target.r2, c2: target.c2 });
  };
  /** touches pendant la saisie (cellule ou barre de formule) */
  function editKey(e, el) {
    const Gr = G(); if (!Gr.edit) return;
    if (acKey(e)) return;
    const k = e.key, mod = O.modKey(e);
    if (k === 'Enter') {
      if (e.altKey) { e.preventDefault(); const p = el.selectionStart; el.value = el.value.slice(0, p) + '\n' + el.value.slice(el.selectionEnd); el.setSelectionRange(p + 1, p + 1); Gr.onEditInput(); return; }
      e.preventDefault(); hideAc();
      if (mod && e.shiftKey) { Gr.commitEdit(null, { array: true }); return; }
      if (mod) { Gr.commitEdit(null, { all: true }); return; }
      Gr.commitEdit(e.shiftKey ? 'up' : 'down'); return;
    }
    if (k === 'Tab') { e.preventDefault(); hideAc(); Gr.commitEdit(e.shiftKey ? 'left' : 'right'); return; }
    if (k === 'Escape') { e.preventDefault(); hideAc(); Gr.cancelEdit(); return; }
    if (k === 'F4') { e.preventDefault(); const r = P.cycleAbs(el.value, el.selectionStart); if (r) Gr.setEditText(r.text, r.caret); return; }
    if (k === 'F2' && el === Gr.editor) { e.preventDefault(); Gr.edit.mode = Gr.edit.mode === 'enter' ? 'edit' : 'enter'; A.updateStatus(); return; }
    if (k === 'F9' && Gr.edit) { // évaluer la sélection de la formule
      if (el.selectionEnd > el.selectionStart && /^=/.test(el.value)) { e.preventDefault(); const part = el.value.slice(el.selectionStart, el.selectionEnd); try { const v = TB.ev(P.parse(part, P.userLoc()), { wb: wb(), sh: Gr.edit.sh, r: Gr.edit.r, c: Gr.edit.c, env: null, depth: 0 }); const sv = TB.scalar(v); const t = sv instanceof TB.Err ? TB.errText(sv) : typeof sv === 'string' ? '"' + sv + '"' : typeof sv === 'number' ? TB.numText(sv) : TB.boolText(!!sv); const p = el.selectionStart; Gr.setEditText(el.value.slice(0, p) + t + el.value.slice(el.selectionEnd), p + t.length); } catch (x) { O.toast(x.message, { bad: true }); } }
      return;
    }
    // pointage au clavier (mode Entrer)
    if (/^Arrow/.test(k) && Gr.edit.mode === 'enter' && el === Gr.editor) {
      if (Gr.pointable()) {
        e.preventDefault();
        const dr = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0, dc = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
        const p = Gr.point && el.selectionStart === Gr.point.end ? Gr.point : null;
        const base = p ? (p.cur || { r: p.g.r2, c: p.g.c2 }) : { r: Gr.edit.r, c: Gr.edit.c };
        const anchor = p ? (p.anchor || { r: p.g.r1, c: p.g.c1 }) : null;
        let nr = base.r, nc = base.c;
        if (mod) { const j = Gr.jump(base.r, base.c, dr, dc); nr = j.r; nc = j.c; } else { nr = Math.max(0, Math.min(MAXR - 1, base.r + dr)); nc = Math.max(0, Math.min(MAXC - 1, base.c + dc)); }
        const g = e.shiftKey && anchor ? { r1: Math.min(anchor.r, nr), c1: Math.min(anchor.c, nc), r2: Math.max(anchor.r, nr), c2: Math.max(anchor.c, nc) } : { r1: nr, c1: nc, r2: nr, c2: nc };
        Gr.pointTo(g, sh());
        Gr.point.cur = { r: nr, c: nc }; Gr.point.anchor = e.shiftKey && anchor ? anchor : { r: nr, c: nc };
        Gr.scrollTo(nr, nc); return;
      }
      // texte saisi : les flèches valident
      e.preventDefault(); hideAc();
      const dir = k === 'ArrowDown' ? 'down' : k === 'ArrowUp' ? 'up' : k === 'ArrowRight' ? 'right' : 'left';
      Gr.commitEdit(null); if (dir === 'down') Gr.move(1, 0); else if (dir === 'up') Gr.move(-1, 0); else if (dir === 'right') Gr.move(0, 1); else Gr.move(0, -1);
      return;
    }
    if (mod && (k === 'z' || k === 'Z') && !e.shiftKey) { /* annuler la frappe : comportement du champ */ return; }
    if (mod && k === ';') { e.preventDefault(); C.insertDate(false); return; }
    if (mod && (k === ':' || (e.shiftKey && k === ';'))) { e.preventDefault(); C.insertDate(true); return; }
    if (mod && k.toLowerCase() === 'a' && e.shiftKey && /^=/.test(el.value)) { e.preventDefault(); D.insertFunction(); return; }
    if (k === 'F3' && e.shiftKey) { e.preventDefault(); D.insertFunction(); return; }
  }
  /* ---- autocomplétion des fonctions et aide ---- */
  let ac = { list: [], i: 0, on: false, start: 0, end: 0 };
  function hideAc() { const l = $('#acList'); if (l) l.classList.remove('on'); ac.on = false; }
  function caretRect(el) {
    const r = el.getBoundingClientRect();
    if (el === G().editor) { const lines = el.value.slice(0, el.selectionStart).split('\n'); const line = lines[lines.length - 1]; const w = G().textWidth(el.style.font || '15px sans-serif', line); return { left: Math.min(r.left + 4 + w, innerWidth - 260), top: r.top + lines.length * parseFloat(el.style.lineHeight || 18) + 4, bottom: r.bottom }; }
    return { left: r.left + 8, top: r.bottom + 2, bottom: r.bottom };
  }
  A.onEditInput = function (text) {
    const Gr = G(); if (!Gr.edit) { hideAc(); fnHelp(null); return; }
    const el = Gr.editEl(); const caret = el.selectionStart;
    $('#fbX').disabled = $('#fbOk').disabled = false;
    if (!/^[=+-]/.test(text)) { hideAc(); fnHelp(null); autoCompleteText(text, el); return; }
    const before = text.slice(0, caret);
    const m = /([A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*)$/.exec(before);
    const inStr = (before.match(/"/g) || []).length % 2 === 1;
    if (m && !inStr && m[1].length >= 1 && !/[A-Za-z]{1,3}\d+$/.test(m[1]) && /[=+\-*/^&(;,<>: ]$|^$/.test(before.slice(0, before.length - m[1].length).slice(-1) || '=')) {
      const q = TB.norm(m[1]);
      const lang = TB.loc.fn;
      const names = TB.fnList().map((n) => ({ canon: n, shown: P.displayFn(n, lang) })).filter((x) => TB.norm(x.shown).startsWith(q) || (lang === 'fr' && TB.norm(x.canon).startsWith(q)));
      const nameHits = wb().names.filter((n) => TB.norm(n.n).startsWith(q)).map((n) => ({ name: n.n }));
      const tblHits = []; wb().sheets.forEach((s) => s.tables.forEach((t) => { if (TB.norm(t.name).startsWith(q)) tblHits.push({ name: t.name, tbl: true }); }));
      const list = names.slice(0, 40).concat(nameHits, tblHits);
      if (list.length) { ac = { list, i: 0, on: true, start: caret - m[1].length, end: caret, el }; renderAc(); }
      else hideAc();
    } else hideAc();
    fnHelp(text, caret);
  };
  function renderAc() {
    const l = $('#acList'); const r = caretRect(ac.el);
    l.innerHTML = ac.list.map((x, i) => '<div class="it' + (i === ac.i ? ' on' : '') + '" data-i="' + i + '">' + (x.canon ? '<span class="k">fx</span><b>' + O.esc(x.shown) + '</b><small>' + O.esc((TB.FN_INFO[x.canon] || {}).desc || TB.FN_CATS[(TB.FN[x.canon] || {}).cat] || '') + '</small>' : '<span class="k">' + (x.tbl ? 'tab' : 'nom') + '</span><b>' + O.esc(x.name) + '</b>') + '</div>').join('');
    l.classList.add('on'); l.style.left = Math.max(4, r.left) + 'px'; l.style.top = r.top + 'px';
    const h = l.offsetHeight; if (r.top + h > innerHeight - 8) l.style.top = Math.max(4, (ac.el === G().editor ? ac.el.getBoundingClientRect().top : r.bottom) - h - 4) + 'px';
    l.onmousedown = (e) => { e.preventDefault(); const it = e.target.closest('.it'); if (it) { ac.i = +it.dataset.i; acceptAc(); } };
    const on = l.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function acceptAc() {
    const x = ac.list[ac.i]; if (!x) return; const el = ac.el, Gr = G();
    const ins = x.canon ? x.shown + '(' : x.name + (x.tbl ? '[' : '');
    let after = el.value.slice(ac.end); if (x.canon && after[0] === '(') after = after.slice(1);
    const t = el.value.slice(0, ac.start) + ins + after;
    hideAc(); Gr.setEditText(t, ac.start + ins.length); el.focus();
  }
  function acKey(e) {
    if (!ac.on) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ac.i = (ac.i + (e.key === 'ArrowDown' ? 1 : -1) + ac.list.length) % ac.list.length; renderAc(); return true; }
    if (e.key === 'Tab' || (e.key === 'Enter' && ac.list.length && false)) { e.preventDefault(); acceptAc(); return true; }
    if (e.key === 'Escape') { e.preventDefault(); hideAc(); return true; }
    return false;
  }
  /** info-bulle de syntaxe : fonction englobante et argument courant */
  function fnHelp(text, caret) {
    const h = $('#fnHelp'); if (!h) return;
    if (!text) { h.classList.remove('on'); return; }
    const before = text.slice(0, caret);
    // remonter jusqu'à la parenthèse ouvrante de la fonction courante
    let depth = 0, argi = 0, inStr = false, fnName = null;
    for (let i = before.length - 1; i >= 0; i--) {
      const ch = before[i];
      if (ch === '"') { inStr = !inStr; continue; } if (inStr) continue;
      if (ch === ')') depth++;
      else if (ch === '(') { if (depth === 0) { const m = /([A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*)$/.exec(before.slice(0, i)); fnName = m ? m[1] : null; break; } depth--; }
      else if (ch === TB.loc.arg && depth === 0) argi++;
    }
    const canon = fnName && TB.fnCanon(fnName);
    if (!canon) { h.classList.remove('on'); return; }
    const args = TB.fnArgs(canon).split(TB.loc.arg).map((x) => x.trim()).filter((x) => x !== '');
    const shown = P.displayFn(canon, TB.loc.fn);
    let cur = argi; if (args.length && cur >= args.length) { const last = args.findIndex((a) => /…|\.\.\./.test(a)); cur = last > 0 ? last - 1 : args.length - 1; }
    h.innerHTML = '<b>' + O.esc(shown) + '</b>(' + (args.length ? args.map((a, i) => i === cur ? '<b class="cur">' + O.esc(a) + '</b>' : O.esc(a)).join(TB.loc.arg + ' ') : '<i>arguments</i>') + ')' + ((TB.FN_INFO[canon] || {}).desc ? '<br><small>' + O.esc(TB.FN_INFO[canon].desc) + '</small>' : '') + '<a data-fn="' + canon + '">Aide</a>';
    const el = G().editEl(); const r = el === A.fx ? A.fx.getBoundingClientRect() : G().editor.getBoundingClientRect();
    h.classList.add('on'); h.style.left = Math.max(4, Math.min(r.left, innerWidth - h.offsetWidth - 8)) + 'px'; h.style.top = (el === A.fx ? r.bottom + 2 : Math.max(4, r.top - h.offsetHeight - 4)) + 'px';
    if (ac.on && el === A.fx) h.style.top = (r.top - h.offsetHeight - 4) + 'px';
    h.onmousedown = (e) => { const a = e.target.closest('[data-fn]'); if (a) { e.preventDefault(); D.insertFunction(a.dataset.fn, true); } };
  }
  /** saisie semi-automatique du texte (valeurs déjà présentes dans la colonne) */
  function autoCompleteText(text, el) {
    if (A.settings.autoComplete === false || !text || el.selectionStart !== text.length || A._acSkip) { A._acSkip = false; return; }
    const Gr = G(), s = Gr.edit.sh, c = Gr.edit.c, r0 = Gr.edit.r;
    if (/^\d/.test(text)) return;
    const low = text.toLowerCase(); const found = new Set(); let cand = null;
    for (const d of [-1, 1]) { let r = r0 + d; let n = 0; while (r >= 0 && n < 2000) { const v = s.get(r, c); if (v === null) break; if (typeof v === 'string' && v.length > text.length && v.toLowerCase().startsWith(low)) { found.add(v.toLowerCase()); cand = v; } r += d; n++; } }
    if (found.size === 1 && cand) { const p = text.length; el.value = text + cand.slice(p); try { el.setSelectionRange(p, el.value.length); } catch (e) { } if (el === Gr.editor && A.fx) A.fx.value = el.value; else Gr.editor.value = el.value; }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Backspace' || e.key === 'Delete') A._acSkip = true; }, true);
  A.insertText = function (t) { const Gr = G(); if (!Gr.edit) { Gr.beginEdit({ text: '=' + t, mode: 'edit' }); return; } const el = Gr.editEl(); const p = el.selectionStart; Gr.setEditText(el.value.slice(0, p) + t + el.value.slice(el.selectionEnd), p + t.length); el.focus(); };
  A.insertFunction = function (canon) { const n = P.displayFn(canon, TB.loc.fn); const Gr = G(); if (!Gr.edit) { Gr.beginEdit({ text: '=' + n + '()', mode: 'enter', caret: n.length + 2 }); return; } A.insertText(n + '()'); const el = Gr.editEl(); try { el.setSelectionRange(el.selectionStart - 1, el.selectionStart - 1); } catch (e) { } };
  A.onEditState = function (on) {
    $('#fbX').disabled = $('#fbOk').disabled = !on;
    if (!on) { hideAc(); fnHelp(null); A.onSelect(); }
    A.updateStatus();
  };

  /* ---------------- sélection : zone Nom, barre de formule, barre d'état ---------------- */
  let selT = null;
  A.onSelect = function () {
    const Gr = G(); if (!Gr) return;
    if (!Gr.edit) {
      const s = sh(), g = Gr.range();
      const nb = $('#namebox');
      if (nb && document.activeElement !== nb) {
        if (Gr._drag && (g.r1 !== g.r2 || g.c1 !== g.c2)) nb.value = (g.r2 - g.r1 + 1) + 'L × ' + (g.c2 - g.c1 + 1) + 'C';
        else { const nm = wb().names.find((n) => { try { const a = P.parse(n.f); return a.t === 'area' || a.t === 'ref' ? (a.sh || s.name).toLowerCase() === s.name.toLowerCase() && TB.sameRange(a.t === 'ref' ? { r1: a.r, c1: a.c, r2: a.r, c2: a.c } : a, g) : false; } catch (e) { return false; } }); nb.value = nm ? nm.n : TB.addr(Gr.sel.r, Gr.sel.c); }
      }
      if (A.fx && document.activeElement !== A.fx) A.fx.value = wb().editText(s, Gr.sel.r, Gr.sel.c);
      // message de saisie (validation)
      const d = A.dvAt(s, Gr.sel.r, Gr.sel.c);
      if (d && d.showMsg !== false && (d.msgTitle || d.msg)) Gr.showTip(Gr.sel.r, Gr.sel.c, (d.msgTitle ? '<b>' + O.esc(d.msgTitle) + '</b>' : '') + O.esc(d.msg || ''), 'dv'); else if (!Gr._drag) Gr.hideTip();
    }
    clearTimeout(selT); selT = setTimeout(() => { A.updateStatus(); A.refreshUi(); if (A.paneOnSelect) A.paneOnSelect(); }, 60);
  };
  A.onSelectEnd = () => A.onSelect();

  /* ---------------- onglets des feuilles ---------------- */
  function sheetBar() {
    const sb = $('#sheetbar');
    sb.innerHTML = '<span class="nav"><button type="button" data-nav="first" title="Première feuille" aria-label="Première feuille">' + O.icon('chevrons-left') + '</button><button type="button" data-nav="prev" title="Feuille précédente (Ctrl+Pg préc.)" aria-label="Feuille précédente">' + O.icon('chevron-left') + '</button><button type="button" data-nav="next" title="Feuille suivante (Ctrl+Pg suiv.)" aria-label="Feuille suivante">' + O.icon('chevron-right') + '</button></span><div id="tabs" role="tablist"></div><button type="button" class="add" title="Nouvelle feuille (Maj+F11)" aria-label="Nouvelle feuille">' + O.icon('plus') + '</button><span class="sp"></span>';
    sb.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]'); if (n) { const vis = wb().sheets.filter((s) => !s.hidden); const i = vis.indexOf(sh()); const t = n.dataset.nav === 'first' ? vis[0] : n.dataset.nav === 'prev' ? vis[Math.max(0, i - 1)] : vis[Math.min(vis.length - 1, i + 1)]; tabClick(t); return; }
      if (e.target.closest('.add')) { C.addSheet(wb().sheets.length); return; }
      const t = e.target.closest('.stab'); if (t && !e.target.closest('input')) tabClick(wb().sheets[+t.dataset.i]);
    });
    sb.addEventListener('dblclick', (e) => { const t = e.target.closest('.stab'); if (t) renameInline(t); });
    sb.addEventListener('contextmenu', (e) => { const t = e.target.closest('.stab'); if (!t) return; e.preventDefault(); const s = wb().sheets[+t.dataset.i]; if (s !== sh()) tabClick(s); tabMenu(e, s); });
    // glisser les onglets (déplacer ; Ctrl : copier)
    sb.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('.stab'); if (!t || e.button !== 0 || e.target.closest('input')) return;
      const from = +t.dataset.i; let over = null; const x0 = e.clientX; let moved = false;
      let longT = e.pointerType === 'touch' ? setTimeout(() => { if (!moved) { tabMenu({ clientX: e.clientX, clientY: e.clientY }, wb().sheets[from]); moved = true; } }, 550) : null;
      const mv = (ev) => { if (Math.abs(ev.clientX - x0) < 8) return; moved = true; clearTimeout(longT); const el = document.elementFromPoint(ev.clientX, ev.clientY); const tt = el && el.closest && el.closest('.stab'); O.$$('.stab').forEach((x) => x.classList.remove('drop')); if (tt) { tt.classList.add('drop'); over = +tt.dataset.i; } };
      const up = (ev) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); clearTimeout(longT); O.$$('.stab').forEach((x) => x.classList.remove('drop')); if (moved && over != null && over !== from) { if (O.modKey(ev)) C.copySheet(wb().sheets[from], over); else C.moveSheet(wb().sheets[from], over); } };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }
  function tabClick(s) {
    const Gr = G();
    if (Gr.edit && Gr.pointable()) { if (A.grid) A.grid.rememberScroll(); wb().active = wb().sheets.indexOf(s); Gr.sheetChanged(); A.renderTabs(); return; }
    if (Gr.edit) Gr.commitEdit(null);
    A.showSheet(s);
  }
  function renameInline(t) {
    const s = wb().sheets[+t.dataset.i]; if (!A.guardBook()) return;
    t.innerHTML = '<input value="' + O.esc(s.name) + '" maxlength="31">'; const i = t.querySelector('input'); i.focus(); i.select();
    const done = (ok) => { if (ok && i.value.trim() && i.value.trim() !== s.name) { let r; A.tx('Renommer la feuille', () => { r = wb().renameSheet(s, i.value.trim()); }); if (!r) O.toast('Nom refusé (déjà utilisé, trop long ou caractère interdit : \\ / ? * [ ] :)', { bad: true }); } A.renderTabs(); G().focus(); };
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); });
    i.addEventListener('blur', () => done(true));
  }
  function tabMenu(e, s) {
    O.menu({ x: e.clientX, y: e.clientY }, [{ label: 'Insérer une feuille', icon: 'file-plus', on: () => C.addSheet(wb().sheets.indexOf(s) + 1) }, { label: 'Supprimer', icon: 'trash-2', on: () => C.deleteSheet(s) }, { label: 'Renommer', icon: 'pencil', on: () => { const t = O.$$('.stab').find((x) => wb().sheets[+x.dataset.i] === s); if (t && !O.touch()) renameInline(t); else C.renameSheet(s); } }, { label: 'Déplacer ou copier…', icon: 'copy', on: () => D.moveCopySheet(s) }, { label: 'Dupliquer', icon: 'copy-plus', on: () => C.copySheet(s) }, { label: 'Couleur d\'onglet', icon: 'palette', on: () => pick({ x: e.clientX, y: e.clientY }, (c) => C.tabColor(s, c), { none: 'Aucune couleur' }) }, '-', { label: s.protect ? 'Ôter la protection…' : 'Protéger la feuille…', icon: 'lock', on: () => D.protectSheet() }, { label: 'Masquer', icon: 'eye-off', on: () => C.hideSheet(s, true) }, { label: 'Afficher…', icon: 'eye', disabled: !wb().sheets.some((x) => x.hidden), on: () => C.unhideSheet() }, '-', { label: 'Sélectionner toutes les feuilles', disabled: true }], { title: s.name });
  }
  A.renderTabs = function () {
    const T = $('#tabs'); if (!T) return;
    T.innerHTML = wb().sheets.map((s, i) => s.hidden ? '' : '<button type="button" role="tab" class="stab' + (s === sh() ? ' on' : '') + '" data-i="' + i + '" aria-selected="' + (s === sh()) + '">' + (s.protect ? O.icon('lock', 'lock') : '') + '<span>' + O.esc(s.name) + '</span>' + (s.tab ? '<i style="background:' + s.tab + '"></i>' : '') + '</button>').join('');
    const on = T.querySelector('.on'); if (on) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };

  /* ---------------- barre d'état ---------------- */
  function statusBar() {
    const s = $('#status');
    s.innerHTML = '<span class="st-mode" id="stMode">Prêt</span><span class="st-b st-circ" id="stCirc" hidden></span><span class="tb-sp"></span><span id="stAgg"></span><button type="button" class="st-b hide-m" id="stView" title="Aperçu des sauts de page">' + O.icon('square-split-vertical') + '</button><button type="button" class="st-b" id="stZm" aria-label="Zoom arrière">' + O.icon('minus') + '</button><input type="range" id="zoomRange" min="10" max="400" step="5" value="100" aria-label="Zoom" class="hide-m"><button type="button" class="st-b" id="stZp" aria-label="Zoom avant">' + O.icon('plus') + '</button><button type="button" class="st-b" id="zoomVal" title="Zoom">100 %</button>';
    s.addEventListener('click', (e) => {
      const x = e.target.closest('button'); if (!x) return;
      if (x.id === 'stZm') A.setZoom(Math.max(0.1, Math.round((G().zoom - 0.1) * 10) / 10)); if (x.id === 'stZp') A.setZoom(Math.min(4, Math.round((G().zoom + 0.1) * 10) / 10)); if (x.id === 'zoomVal') D.zoom();
      if (x.id === 'stView') { A.settings.breaks = !A.settings.breaks; A.saveSettings(); G().draw(); A.refreshUi(); }
      if (x.id === 'stCirc') { const f = wb().circ[0]; if (f) { A.showSheet(f.sh); G().select(f.r, f.c); } }
      if (x.dataset.agg) { O.menu(x, [['sum', 'Somme'], ['avg', 'Moyenne'], ['count', 'Nb (non vides)'], ['countNum', 'Nb (nombres)'], ['min', 'Min'], ['max', 'Max']].map((a) => ({ label: a[1], checked: (A.settings.agg || ['avg', 'count', 'sum']).indexOf(a[0]) >= 0, on: () => { const l = (A.settings.agg || ['avg', 'count', 'sum']).slice(); const i = l.indexOf(a[0]); if (i >= 0) l.splice(i, 1); else l.push(a[0]); A.settings.agg = l; A.saveSettings(); A.updateStatus(); } })), { title: 'Barre d\'état' }); }
    });
    $('#zoomRange').addEventListener('input', (e) => A.setZoom(+e.target.value / 100));
  }
  let statT = null;
  A.updateStatus = function () {
    clearTimeout(statT);
    statT = setTimeout(() => {
      const Gr = G(); if (!Gr) return;
      const m = $('#stMode'); if (m) m.textContent = Gr.edit ? (Gr.point ? 'Pointer' : Gr.edit.mode === 'edit' ? 'Modifier' : 'Entrer') : (wb().settings.calc === 'manual' && wb().pendingManual ? 'Calculer' : A.painter ? 'Reproduire' : 'Prêt');
      const ci = $('#stCirc'); const circ = wb().circ || []; if (ci) { ci.hidden = !circ.length; if (circ.length) ci.textContent = 'Références circulaires : ' + circ[0].sh.name + '!' + TB.addr(circ[0].r, circ[0].c); }
      // agrégats de la sélection
      const ag = $('#stAgg'); if (!ag) return;
      const s = sh(); let n = 0, cnt = 0, sum = 0, mn = Infinity, mx = -Infinity, cells = 0;
      let heavy = false;
      for (const g0 of Gr.sel.ranges) {
        const g = A.bounded(g0); if (TB.rangeSize(g) > 3e6) { heavy = true; }
        const R = new TB.Ref(s, g.r1, g.c1, g.r2, g.c2);
        R.each((v, r, c) => { if (s.hidR.has(r) || s.hidC.has(c)) return; cnt++; if (typeof v === 'number') { n++; sum += v; if (v < mn) mn = v; if (v > mx) mx = v; } });
        cells += TB.rangeSize(g);
      }
      void heavy;
      if (cells <= 1 || cnt < 2 && n < 2) { ag.innerHTML = ''; return; }
      const nf = wb().styles.get(s.styleAt(Gr.sel.r, Gr.sel.c)).nf;
      const fmt = (v) => TB.Fmt.format(TB.round15(v), nf && !TB.Fmt.isText(nf) ? nf : 'General').s;
      const want = A.settings.agg || ['avg', 'count', 'sum'];
      const parts = [];
      if (want.indexOf('avg') >= 0 && n) parts.push(['Moyenne', fmt(sum / n)]);
      if (want.indexOf('count') >= 0) parts.push(['Nb', cnt.toLocaleString('fr-FR')]);
      if (want.indexOf('countNum') >= 0) parts.push(['Nb (nombres)', n.toLocaleString('fr-FR')]);
      if (want.indexOf('min') >= 0 && n) parts.push(['Min', fmt(mn)]);
      if (want.indexOf('max') >= 0 && n) parts.push(['Max', fmt(mx)]);
      if (want.indexOf('sum') >= 0 && n) parts.push(['Somme', fmt(sum)]);
      ag.innerHTML = '<button type="button" class="st-b st-agg" data-agg="1" title="Choisir les calculs affichés">' + parts.map((p, i) => '<span class="' + (i < parts.length - 1 ? 'hide-m' : '') + '">' + p[0] + ' : ' + O.esc(p[1]) + '</span>').join('&emsp;') + '</button>';
    }, 80);
  };
  A.setZoom = function (z) {
    z = TB.clamp(Math.round(z * 100) / 100, 0.1, 4); const Gr = G(); if (Gr.edit && z !== Gr.zoom) Gr.commitEdit(null);
    sh().zoom = z; Gr.zoom = z; TB.clearWidthCache(); Gr.invalidate(); Gr.scrollTo(Gr.sel.r, Gr.sel.c);
    const r = $('#zoomRange'); if (r && document.activeElement !== r) r.value = Math.round(z * 100); const v = $('#zoomVal'); if (v) v.textContent = Math.round(z * 100) + ' %';
  };
  A.zoomToSel = function () { const Gr = G(), g = A.bounded(Gr.range()), s = sh(); const m = Gr.metrics(); let w = 0, h = 0; for (let c = g.c1; c <= g.c2; c++) w += s.colWidth(c); for (let r = g.r1; r <= g.r2; r++) h += s.rowHeight(r); const z = Math.min((m.W - m.hw - 20) / Math.max(1, w), (m.H - m.hh - 20) / Math.max(1, h)); A.setZoom(TB.clamp(z, 0.1, 4)); Gr.scrollTo(g.r1, g.c1, { top: true }); };

  /* ---------------- raccourcis clavier ---------------- */
  function gridFocused() { const a = document.activeElement; return !a || a === document.body || a === G().scroll || a.id === 'gridScroll' || a.closest && a.closest('#gridHost') && a.id !== 'cellEd'; }
  function keys() {
    const Gr = G();
    const when = () => !O.dialogOpen() && !O.menuOpen() && !$('#backstage').classList.contains('on');
    const grid = () => when() && !Gr.edit && gridFocused();
    const anyEdit = () => when();
    O.keys({
      'mod+s': () => { C.save(); }, 'f12': () => { A.openBackstage('saveas'); }, 'mod+o': () => { C.open(); }, 'mod+n': () => { C.newBook('vide'); }, 'mod+p': () => { A.openBackstage('print'); },
      'mod+z': () => { if (Gr.edit) return false; A.undo(); }, 'mod+y': () => { if (Gr.edit) return false; A.redo(); }, 'mod+shift+z': () => { if (Gr.edit) return false; A.redo(); },
      'mod+f': () => { A.openPane('find'); }, 'mod+h': () => { A.openPane('find', { replace: true }); }, 'mod+g': () => { D.goTo(); }, 'f5': () => { D.goTo(); },
      'mod+1': () => { if (Gr.edit) return false; D.formatCells(); }, 'mod+k': () => { C.link(); }, 'mod+t': () => { if (Gr.edit) return false; D.makeTable(); }, 'mod+l': () => { if (Gr.edit) return false; D.makeTable(); },
      'mod+shift+l': () => { if (Gr.edit) return false; C.toggleFilter(); }, 'mod+e': () => { if (Gr.edit) return false; C.flashFill(); },
      'mod+f1': () => { A.ribbon.setCollapsed(!A.ribbon.collapsed); }, 'alt+q': () => { A.ribbon.focusSearch(); }, 'mod+shift+u': () => { $('#fbar').classList.toggle('tall'); Gr.updateExtent(); Gr.draw(); },
      'mod+pagedown': () => { sheetStep(1); }, 'mod+pageup': () => { sheetStep(-1); }, 'shift+f11': () => { C.addSheet(); }, 'f11': () => { if (Gr.edit) return false; A.insertChart('bar'); }, 'alt+f1': () => { if (Gr.edit) return false; A.insertChart('bar'); },
      'f9': () => { if (Gr.edit) return false; C.recalc(); }, 'shift+f9': () => { if (Gr.edit) return false; C.recalc(); }, 'shift+f3': () => { D.insertFunction(); }, 'mod+f3': () => { D.names(); }, 'shift+f2': () => { if (Gr.edit) return false; C.note(); },
      'mod+`': () => { C.toggleFormulas(); }, 'mod+alt+v': () => { if (Gr.edit) return false; D.pasteSpecial(); }
    }, { when: anyEdit });
    O.keys({
      'arrowup': (e) => nav(e, -1, 0), 'arrowdown': (e) => nav(e, 1, 0), 'arrowleft': (e) => nav(e, 0, -1), 'arrowright': (e) => nav(e, 0, 1),
      'shift+arrowup': (e) => nav(e, -1, 0), 'shift+arrowdown': (e) => nav(e, 1, 0), 'shift+arrowleft': (e) => nav(e, 0, -1), 'shift+arrowright': (e) => nav(e, 0, 1),
      'mod+arrowup': (e) => nav(e, -1, 0), 'mod+arrowdown': (e) => nav(e, 1, 0), 'mod+arrowleft': (e) => nav(e, 0, -1), 'mod+arrowright': (e) => nav(e, 0, 1),
      'mod+shift+arrowup': (e) => nav(e, -1, 0), 'mod+shift+arrowdown': (e) => nav(e, 1, 0), 'mod+shift+arrowleft': (e) => nav(e, 0, -1), 'mod+shift+arrowright': (e) => nav(e, 0, 1),
      'enter': () => { if (A.selObj) return false; Gr.advance('down'); }, 'shift+enter': () => Gr.advance('up'), 'tab': () => Gr.advance('right'), 'shift+tab': () => Gr.advance('left'),
      'home': () => Gr.select(Gr.sel.r, sh().freeze.c || 0), 'shift+home': () => Gr.select(Gr.sel.r, 0, { extend: true }), 'mod+home': () => Gr.select(sh().freeze.r || 0, sh().freeze.c || 0), 'mod+end': () => { const e = sh().extent(); Gr.select(Math.max(0, e.r), Math.max(0, e.c)); }, 'mod+shift+home': () => Gr.select(0, 0, { extend: true }), 'mod+shift+end': () => { const e = sh().extent(); Gr.select(Math.max(0, e.r), Math.max(0, e.c), { extend: true }); },
      'pagedown': () => page(1), 'pageup': () => page(-1), 'shift+pagedown': () => page(1, true), 'shift+pageup': () => page(-1, true), 'alt+pagedown': () => pageH(1), 'alt+pageup': () => pageH(-1),
      'f2': () => { Gr.beginEdit({ mode: 'edit' }); }, 'delete': () => { if (A.selObj) { A.deleteObj(); return; } C.clear('contents'); }, 'backspace': () => { if (A.selObj) { A.deleteObj(); return; } if (!A.canEdit(sh(), Gr.sel.r, Gr.sel.c)) return; Gr.beginEdit({ text: '', mode: 'enter' }); },
      'mod+space': () => { const g = Gr.range(); Gr.setRange({ r1: 0, c1: g.c1, r2: MAXR - 1, c2: g.c2 }, { r: Gr.sel.r, c: Gr.sel.c, noScroll: true }); }, 'shift+space': () => { const g = Gr.range(); Gr.setRange({ r1: g.r1, c1: 0, r2: g.r2, c2: MAXC - 1 }, { r: Gr.sel.r, c: Gr.sel.c, noScroll: true }); }, 'mod+a': () => Gr.selectAll(), 'mod+shift+space': () => Gr.selectAll(),
      'mod+b': () => C.toggle('b'), 'mod+i': () => C.toggle('i'), 'mod+u': () => C.underline(), 'mod+5': () => C.toggle('st'), 'mod+2': () => C.toggle('b'), 'mod+3': () => C.toggle('i'), 'mod+4': () => C.underline(),
      'mod+d': () => C.fillDir('down'), 'mod+r': () => C.fillDir('right'), 'mod+;': () => C.insertDate(false), 'mod+:': () => C.insertDate(true), 'mod+shift+;': () => C.insertDate(true), 'mod+shift+.': () => C.insertDate(true),
      "mod+'": () => C.copyAbove(false), 'mod+shift+"': () => C.copyAbove(true), 'mod+"': () => C.copyAbove(true),
      'alt+=': () => C.autoSum('SUM'), 'alt+shift+=': () => C.autoSum('SUM'), 'alt+arrowdown': () => { if (A.dvAt(sh(), Gr.sel.r, Gr.sel.c)) A.openDvList(); else if (afBtnHere()) A.openFilter(afBtnHere(), Gr.cellRect(Gr.sel.r, Gr.sel.c)); else A.openPickList(); },
      'mod+shift+$': () => C.numFmt(TB.Fmt.build('currency')), 'mod+shift+4': () => C.numFmt(TB.Fmt.build('currency')), 'mod+shift+%': () => C.numFmt('0%'), 'mod+shift+5': () => C.numFmt('0%'), 'mod+shift+!': () => C.numFmt('#,##0.00'), 'mod+shift+1': () => C.numFmt('#,##0.00'), 'mod+shift+#': () => C.numFmt('dd/mm/yyyy'), 'mod+shift+3': () => C.numFmt('dd/mm/yyyy'), 'mod+shift+@': () => C.numFmt('hh:mm'), 'mod+shift+2': () => C.numFmt('hh:mm'), 'mod+shift+~': () => C.numFmt('General'), 'mod+shift+^': () => C.numFmt('0.00E+00'), 'mod+shift+6': () => C.numFmt('0.00E+00'),
      'mod+shift+&': () => C.borders('outer'), 'mod+shift+7': () => C.borders('outer'), 'mod+shift+_': () => C.borders('none'), 'mod+shift+-': () => C.borders('none'),
      'mod++': () => C.insert('auto'), 'mod+shift+=': () => C.insert('auto'), 'mod+shift++': () => C.insert('auto'), 'mod+-': () => C.remove('auto'), 'mod+9': () => C.hide('r'), 'mod+0': () => C.hide('c'), 'mod+shift+9': () => C.hide('r', true), 'mod+shift+0': () => C.hide('c', true), 'mod+shift+(': () => C.hide('r', true), 'mod+shift+)': () => C.hide('c', true),
      'alt+shift+arrowright': () => C.group(1), 'alt+shift+arrowleft': () => C.group(-1), 'mod+8': () => { O.toast('Plan : utilisez les boutons 1, 2, 3 à gauche des numéros de ligne'); },
      'f4': () => { if (A.lastAction) A.lastAction.run(); }, 'mod+[': () => C.goPrecedent(), 'escape': () => { if (A.painter) { A.painter = null; A.refreshUi(); return; } if (A.clip && A.clip.marquee) { A.clip.marquee = false; A.stopMarquee && A.stopMarquee(); Gr.draw(); return; } if (A.selObj) { A.objectsDeselect(); return; } return false; },
      'mod+shift+o': () => A.selectSpecial('notes'), 'mod+/': () => { const sp = sh().spills; const k = sh().spillOwner.get(KEY(Gr.sel.r, Gr.sel.c)); const g = sp.get(k != null ? k : KEY(Gr.sel.r, Gr.sel.c)); if (g) Gr.setRange(g); }
    }, { when: grid });
    // frappe directe : commencer la saisie
    G().scroll.addEventListener('keydown', (e) => {
      if (Gr.edit || e.defaultPrevented || O.dialogOpen() || O.menuOpen()) return;
      if (e.ctrlKey || e.metaKey || (e.altKey && !e.getModifierState('AltGraph'))) return;
      if (A.selObj) return;
      if (e.key.length === 1 || e.key === 'Dead' || e.key === 'Process') {
        if (!A.canEdit(sh(), Gr.sel.r, Gr.sel.c)) { e.preventDefault(); return; }
        Gr.beginEdit({ text: '', mode: 'enter' });
      }
    });
    function sheetStep(d) { const vis = wb().sheets.filter((s) => !s.hidden); const i = vis.indexOf(sh()); const t = vis[i + d]; if (t) tabClick(t); }
    function nav(e, dr, dc) { if (A.selObj) { A.nudgeObj(dr, dc, e.shiftKey); return; } G().move(dr, dc, { extend: e.shiftKey, jump: O.modKey(e) }); }
    function page(d, ext) { const g = G(), n = Math.max(1, g.visible.r2 - g.visible.r1); const r = TB.clamp((ext ? (g.sel.ext || g.sel.anchor).r : g.sel.r) + d * n, 0, MAXR - 1); g.scroll.scrollTop += d * g.scroll.clientHeight * 0.9; g.select(r, ext ? (g.sel.ext || g.sel.anchor).c : g.sel.c, { extend: ext, noScroll: true }); }
    function pageH(d) { const g = G(), n = Math.max(1, g.visible.c2 - g.visible.c1); g.scroll.scrollLeft += d * g.scroll.clientWidth * 0.9; g.select(g.sel.r, TB.clamp(g.sel.c + d * n, 0, MAXC - 1), { noScroll: true }); }
    function afBtnHere() { const s = sh(), r = G().sel.r, c = G().sel.c; if (s.af && r === s.af.r1 && c >= s.af.c1 && c <= s.af.c2) return { kind: 'af', c }; const t = s.tables.find((x) => x.header !== false && r === x.r1 && c >= x.c1 && c <= x.c2); return t ? { kind: 'table', t, c } : null; }
  }
  /** presse-papiers : événements natifs (Ctrl+C / X / V fonctionnent avec les autres logiciels) */
  function clipboardEvents() {
    const ok = () => !O.dialogOpen() && !G().edit && gridFocused() && !$('#backstage').classList.contains('on');
    document.addEventListener('copy', (e) => { if (!ok()) return; if (A.selObj) { A.copyObj && A.copyObj(); e.preventDefault(); return; } const K = C.copy(false, true); if (!K) return; e.clipboardData.setData('text/plain', K.text); if (K.html) e.clipboardData.setData('text/html', K.html); e.preventDefault(); });
    document.addEventListener('cut', (e) => { if (!ok()) return; const K = C.copy(true, true); if (!K) return; e.clipboardData.setData('text/plain', K.text); if (K.html) e.clipboardData.setData('text/html', K.html); e.preventDefault(); });
    document.addEventListener('paste', (e) => {
      if (!ok()) return;
      const dt = e.clipboardData; const text = dt.getData('text/plain'), html = dt.getData('text/html');
      const files = Array.from(dt.files || []).filter((f) => /^image\//.test(f.type));
      e.preventDefault();
      if (files.length && !text) { files.forEach((f) => A.insertImageFile(f)); return; }
      if (A.objClip && !text && !html) { A.pasteObj && A.pasteObj(); return; }
      if (A.clip && TB.Clip.same(text, A.clip.text)) { C.pasteClip(); return; }
      if (text || html) C.pasteExternal(text, html);
      else if (files.length) files.forEach((f) => A.insertImageFile(f));
    });
  }
  let marqueeT = null;
  A.startMarquee = function () { clearInterval(marqueeT); marqueeT = setInterval(() => { if (!A.clip || !A.clip.marquee) { clearInterval(marqueeT); return; } G().draw(); }, 120); };
  A.stopMarquee = function () { clearInterval(marqueeT); if (A.clip) A.clip.marquee = false; G().draw(); };

  /* ---------------- menu contextuel ---------------- */
  A.contextMenu = function (e, h) {
    const at = { x: e.clientX, y: e.clientY };
    const s = sh(), r = G().sel.r, c = G().sel.c;
    if (h && (h.area === 'col' || h.area === 'row')) {
      const col = h.area === 'col';
      O.menu(at, [{ label: 'Couper', icon: 'scissors', on: () => C.copy(true) }, { label: 'Copier', icon: 'copy', on: () => C.copy(false) }, { label: 'Coller', icon: 'clipboard-paste', on: () => C.paste() }, { label: 'Collage spécial…', on: () => D.pasteSpecial() }, '-', { label: col ? 'Insérer des colonnes' : 'Insérer des lignes', icon: col ? 'between-vertical-start' : 'between-horizontal-start', on: () => C.insert(col ? 'cols' : 'rows') }, { label: col ? 'Supprimer les colonnes' : 'Supprimer les lignes', icon: 'trash-2', on: () => C.remove(col ? 'cols' : 'rows') }, { label: 'Effacer le contenu', icon: 'eraser', on: () => C.clear('contents') }, '-', { label: 'Format de cellule…', icon: 'settings-2', on: () => D.formatCells() }, { label: col ? 'Largeur de colonne…' : 'Hauteur de ligne…', icon: col ? 'move-horizontal' : 'move-vertical', on: () => A.askSize(col ? 'c' : 'r', col ? h.c : h.r) }, { label: 'Ajuster automatiquement', on: () => A.autofit(col ? 'c' : 'r', col ? h.c : h.r) }, { label: 'Masquer', icon: 'eye-off', on: () => C.hide(col ? 'c' : 'r') }, { label: 'Afficher', icon: 'eye', on: () => C.hide(col ? 'c' : 'r', true) }, '-', { label: 'Grouper', icon: 'group', on: () => C.group(1) }, { label: 'Dissocier', icon: 'ungroup', on: () => C.group(-1) }], { title: col ? 'Colonnes' : 'Lignes' });
      return;
    }
    const note = s.notes.get(KEY(r, c)), lk = s.links.get(KEY(r, c)), t = s.tableAt(r, c);
    const items = [
      { label: 'Couper', icon: 'scissors', kbd: 'Ctrl+X', on: () => C.copy(true) }, { label: 'Copier', icon: 'copy', kbd: 'Ctrl+C', on: () => C.copy(false) }, { label: 'Coller', icon: 'clipboard-paste', kbd: 'Ctrl+V', on: () => C.paste() },
      { label: 'Options de collage', icon: 'clipboard-list', sub: [{ label: 'Valeurs', on: () => C.paste({ what: 'values' }) }, { label: 'Formules', on: () => C.paste({ what: 'formulas' }) }, { label: 'Mise en forme', on: () => C.paste({ what: 'formats' }) }, { label: 'Transposer', on: () => C.paste({ transpose: true }) }, { label: 'Lien', on: () => C.paste({ link: true, what: 'link' }) }, { label: 'Collage spécial…', on: () => D.pasteSpecial() }] }, '-',
      { label: 'Insérer…', icon: 'between-horizontal-start', on: () => D.insertCells() }, { label: 'Supprimer…', icon: 'between-horizontal-end', on: () => D.deleteCells() }, { label: 'Effacer le contenu', icon: 'eraser', kbd: 'Suppr', on: () => C.clear('contents') }, '-',
      { label: 'Filtrer', icon: 'funnel', sub: [{ label: 'Filtrer par la valeur de la cellule', on: () => C.filterBy('value') }, { label: 'Filtrer par la couleur de la cellule', on: () => C.filterBy('bg') }, { label: 'Effacer les filtres', on: () => C.clearFilters() }] },
      { label: 'Trier', icon: 'arrow-down-wide-narrow', sub: [{ label: 'Trier de A à Z', on: () => C.quickSort(false) }, { label: 'Trier de Z à A', on: () => C.quickSort(true) }, { label: 'Mettre la couleur de la cellule en premier', on: () => C.sortByColor() }, { label: 'Tri personnalisé…', on: () => D.sort() }] },
      t ? { label: 'Tableau', icon: 'table', sub: [{ label: 'Ligne Total', checked: !!t.totals, on: () => C.tableSet({ totals: !t.totals }) }, { label: 'Insérer une ligne au-dessus', on: () => C.insert('rows') }, { label: 'Convertir en plage', on: () => C.tableToRange() }] } : null,
      '-', { label: 'Nouveau commentaire', icon: 'message-square-plus', on: () => C.comment() }, { label: note ? 'Modifier la note' : 'Nouvelle note', icon: 'sticky-note', on: () => C.note() }, note ? { label: 'Supprimer la note', on: () => A.tx('Supprimer la note', () => wb().setProp(s.notes, KEY(r, c), undefined)) } : null,
      '-', { label: 'Format de cellule…', icon: 'settings-2', kbd: 'Ctrl+1', on: () => D.formatCells() }, { label: 'Choisir dans la liste déroulante…', icon: 'list', on: () => A.openPickList() }, { label: 'Définir un nom…', icon: 'tag', on: () => C.defineName() }, { label: lk ? 'Modifier le lien…' : 'Lien…', icon: 'link', on: () => C.link() }, lk ? { label: 'Ouvrir le lien', icon: 'external-link', on: () => A.followLink(lk) } : null, lk ? { label: 'Supprimer le lien', on: () => C.removeLink() } : null
    ];
    O.menu(at, items, { title: TB.rangeStr(G().range()) });
  };

  /* ---------------- filtre automatique : liste déroulante ---------------- */
  A.closeCellPop = function () { if (O.menuOpen()) O.closeMenu(); };
  A.openFilter = function (fb, rect) {
    const s = sh(), W = wb();
    const isT = fb.kind === 'table', t = fb.t;
    const area = isT ? { r1: t.r1, c1: t.c1, r2: t.r2 - (t.totals ? 1 : 0), c2: t.c2 } : Object.assign({}, s.af, { r2: TB.Data.dataEnd(s, s.af) });
    const c = fb.c;
    const cur = isT ? (t.af || {})[c - t.c1] : (s.af.cols || {})[c];
    const dist = TB.Data.distinct(W, s, area.r1 + 1, area.r2, c);
    const sel = cur && cur.type === 'values' ? new Set(cur.vals) : null;
    const selBlank = cur && cur.type === 'values' ? !!cur.blank : true;
    const colors = new Set(); for (let r = area.r1 + 1; r <= Math.min(area.r2, area.r1 + 5000); r++) { const bg = W.styles.get(s.styleAt(r, c)).bg; if (bg) colors.add(bg); }
    const isNum = (() => { let n = 0, t2 = 0; for (let r = area.r1 + 1; r <= Math.min(area.r2, area.r1 + 300); r++) { const v = s.get(r, c); if (typeof v === 'number') n++; else if (typeof v === 'string') t2++; } return n >= t2; })();
    const isDate = isNum && TB.Fmt.isDate(W.styles.get(s.styleAt(area.r1 + 1, c)).nf || '');
    const node = O.h('div', { cls: 'af-pop' });
    node.innerHTML = '<div class="o-menu" style="position:static;box-shadow:none;border:0;padding:0;min-width:0">' +
      '<button type="button" class="o-mi" data-a="asc">' + O.icon('arrow-down-a-z') + '<span class="o-mi-l">Trier ' + (isNum ? 'du plus petit au plus grand' : 'de A à Z') + '</span></button><button type="button" class="o-mi" data-a="desc">' + O.icon('arrow-up-z-a') + '<span class="o-mi-l">Trier ' + (isNum ? 'du plus grand au plus petit' : 'de Z à A') + '</span></button>' +
      (colors.size ? '<div class="o-menu-head">Filtrer par couleur</div><div class="af-cols">' + Array.from(colors).slice(0, 12).map((x) => '<button type="button" data-bg="' + x + '" style="background:' + x + '" title="' + x + '"></button>').join('') + '<button type="button" data-bg="" title="Sans remplissage" style="background:#fff"></button></div>' : '') +
      '<button type="button" class="o-mi" data-a="clear"' + (cur ? '' : ' disabled') + '>' + O.icon('funnel-x') + '<span class="o-mi-l">Effacer le filtre</span></button>' +
      '<button type="button" class="o-mi" data-a="custom">' + O.icon('list-filter') + '<span class="o-mi-l">' + (isDate ? 'Filtres chronologiques' : isNum ? 'Filtres numériques' : 'Filtres textuels') + '…</span></button>' +
      (isNum && !isDate ? '<button type="button" class="o-mi" data-a="top10">' + O.icon('list-ordered') + '<span class="o-mi-l">10 premiers…</span></button><button type="button" class="o-mi" data-a="above">' + O.icon('trending-up') + '<span class="o-mi-l">Supérieur à la moyenne</span></button>' : '') +
      '</div><input type="search" placeholder="Rechercher" aria-label="Rechercher une valeur"><div class="af-list"></div><div class="af-btns"><button type="button" class="o-btn" data-a="cancel">Annuler</button><button type="button" class="o-btn pri" data-a="ok">OK</button></div>';
    const list = node.querySelector('.af-list'), q = node.querySelector('input[type=search]');
    const checked = new Map(dist.list.map((v) => [v, sel ? sel.has(v) : true])); let blankOn = selBlank;
    const render = () => {
      const f = TB.norm(q.value); const vis = dist.list.filter((v) => !f || TB.norm(v).indexOf(f) >= 0).slice(0, 2000);
      const all = vis.every((v) => checked.get(v)) && (f || !dist.blank || blankOn);
      list.innerHTML = '<label><input type="checkbox" data-all="1"' + (all ? ' checked' : '') + '><b>(Sélectionner tout' + (f ? ' : résultats' : '') + ')</b></label>' + vis.map((v, i) => '<label><input type="checkbox" data-v="' + i + '"' + (checked.get(v) ? ' checked' : '') + '><span>' + O.esc(v) + '</span></label>').join('') + (dist.blank && !f ? '<label><input type="checkbox" data-blank="1"' + (blankOn ? ' checked' : '') + '><span>(Vides)</span></label>' : '') + (dist.list.length > vis.length && !f ? '<small class="o-hint">Liste limitée : utilisez la recherche</small>' : '');
      list._vis = vis;
    };
    render();
    q.addEventListener('input', render);
    list.addEventListener('change', (e) => { const x = e.target; if (x.dataset.all) { (list._vis || []).forEach((v) => checked.set(v, x.checked)); if (!q.value) blankOn = x.checked; render(); } else if (x.dataset.blank) blankOn = x.checked; else checked.set(list._vis[+x.dataset.v], x.checked); });
    const apply = (crit) => { O.closeMenu(); C.setColumnFilter(fb, crit); };
    node.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'), bg = e.target.closest('[data-bg]');
      if (bg) { apply({ type: 'color', bg: bg.dataset.bg || null }); return; }
      if (!a) return; const k = a.dataset.a;
      if (k === 'cancel') O.closeMenu();
      if (k === 'ok') { const f = TB.norm(q.value); const vals = dist.list.filter((v) => checked.get(v) && (!f || TB.norm(v).indexOf(f) >= 0)); const allOn = vals.length === dist.list.length && (blankOn || !dist.blank); apply(allOn ? null : { type: 'values', vals, blank: blankOn && !f }); }
      if (k === 'clear') apply(null);
      if (k === 'asc' || k === 'desc') { O.closeMenu(); C.sortColumn(fb, k === 'desc'); }
      if (k === 'custom') { O.closeMenu(); D.customFilter(fb, isDate ? 'date' : isNum ? 'num' : 'text'); }
      if (k === 'top10') { O.closeMenu(); D.top10Filter(fb); }
      if (k === 'above') apply({ type: 'avg', above: true });
    });
    const b = G().host.getBoundingClientRect();
    O.menu({ x: b.left + rect.x + rect.w - 220, y: b.top + rect.y + rect.h }, [{ node }], { cls: 'g-fmenu', title: 'Filtre', onClose: () => G().focus() });
    if (!O.touch()) setTimeout(() => q.focus(), 30);
  };
  /** liste déroulante de validation */
  A.openDvList = function () {
    const s = sh(), r = G().sel.r, c = G().sel.c; const d = A.dvAt(s, r, c); if (!d || d.type !== 'list') return;
    const l = A.dvList(s, d, r, c); const cur = TB.Fmt.text(s.get(r, c), 'General');
    const node = O.h('div', { cls: 'dv-pop' }); node.innerHTML = l.map((x, i) => '<button type="button" data-i="' + i + '" class="' + (x === cur ? 'on' : '') + '">' + O.esc(x) + '</button>').join('') || '<p class="o-hint">Liste vide</p>';
    node.addEventListener('click', (e) => { const x = e.target.closest('[data-i]'); if (!x) return; O.closeMenu(); A.commitInput(s, r, c, l[+x.dataset.i], {}); G().focus(); });
    const rect = G().cellRect(r, c), b = G().host.getBoundingClientRect();
    O.menu({ x: b.left + rect.x, y: b.top + rect.y + rect.h }, [{ node }], { title: 'Choisir une valeur', onClose: () => G().focus() });
  };
  /** Alt+↓ : valeurs déjà saisies dans la colonne */
  A.openPickList = function () {
    const s = sh(), r0 = G().sel.r, c = G().sel.c; const set = new Set();
    for (const d of [-1, 1]) { let r = r0 + d, n = 0; while (r >= 0 && n < 3000) { const v = s.get(r, c); if (v === null) break; if (typeof v === 'string') set.add(v); r += d; n++; } }
    const l = Array.from(set).sort(TB.strCmp); if (!l.length) { O.toast('Aucune valeur texte au-dessus ou au-dessous'); return; }
    const node = O.h('div', { cls: 'dv-pop' }); node.innerHTML = l.map((x, i) => '<button type="button" data-i="' + i + '">' + O.esc(x) + '</button>').join('');
    node.addEventListener('click', (e) => { const x = e.target.closest('[data-i]'); if (!x) return; O.closeMenu(); A.commitInput(s, r0, c, l[+x.dataset.i], {}); });
    const rect = G().cellRect(r0, c), b = G().host.getBoundingClientRect();
    O.menu({ x: b.left + rect.x, y: b.top + rect.y + rect.h }, [{ node }], { title: 'Liste de choix' });
  };

  /* ---------------- raccourcis : aide ---------------- */
  C.shortcuts = function () {
    const rows = [['Fichier', ''], ['Nouveau / Ouvrir / Enregistrer', 'Ctrl+N / Ctrl+O / Ctrl+S'], ['Enregistrer sous / Imprimer', 'F12 / Ctrl+P'], ['Déplacement', ''], ['Cellule suivante', 'Flèches, Entrée, Tab, Maj+Entrée, Maj+Tab'], ['Bord des données', 'Ctrl+flèche'], ['Étendre la sélection', 'Maj+flèche, Ctrl+Maj+flèche'], ['Colonne / ligne entière', 'Ctrl+Espace / Maj+Espace'], ['Tout sélectionner', 'Ctrl+A'], ['Début / fin des données', 'Ctrl+Début / Ctrl+Fin'], ['Page / feuille suivante', 'Pg suiv. / Ctrl+Pg suiv.'], ['Atteindre', 'Ctrl+G ou F5'], ['Saisie', ''], ['Modifier la cellule', 'F2'], ['Nouvelle ligne dans la cellule', 'Alt+Entrée'], ['Remplir la sélection', 'Ctrl+Entrée'], ['Formule matricielle (ancienne)', 'Ctrl+Maj+Entrée'], ['Références absolues ($)', 'F4 (pendant la saisie)'], ['Date / heure du jour', 'Ctrl+; / Ctrl+:'], ['Somme automatique', 'Alt+='], ['Recopier vers le bas / la droite', 'Ctrl+D / Ctrl+R'], ['Remplissage instantané', 'Ctrl+E'], ['Copier la cellule du dessus', "Ctrl+' (formule), Ctrl+Maj+\" (valeur)"], ['Liste de choix', 'Alt+↓'], ['Insérer une fonction', 'Maj+F3'], ['Édition', ''], ['Annuler / Rétablir', 'Ctrl+Z / Ctrl+Y'], ['Répéter la dernière action', 'F4'], ['Couper / Copier / Coller', 'Ctrl+X / Ctrl+C / Ctrl+V'], ['Collage spécial', 'Ctrl+Alt+V'], ['Effacer', 'Suppr'], ['Insérer / supprimer', 'Ctrl++ / Ctrl+-'], ['Masquer lignes / colonnes', 'Ctrl+9 / Ctrl+0'], ['Rechercher / Remplacer', 'Ctrl+F / Ctrl+H'], ['Mise en forme', ''], ['Format de cellule', 'Ctrl+1'], ['Gras, italique, souligné, barré', 'Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+5'], ['Formats rapides', 'Ctrl+Maj+$ (€), Ctrl+Maj+% , Ctrl+Maj+! , Ctrl+Maj+# (date)'], ['Bordure / sans bordure', 'Ctrl+Maj+& / Ctrl+Maj+_'], ['Données', ''], ['Filtre automatique', 'Ctrl+Maj+L'], ['Tableau', 'Ctrl+T'], ['Lien', 'Ctrl+K'], ['Note', 'Maj+F2'], ['Grouper / dissocier', 'Alt+Maj+→ / Alt+Maj+←'], ['Graphique', 'F11 ou Alt+F1'], ['Calcul', ''], ['Calculer', 'F9'], ['Afficher les formules', 'Ctrl+`'], ['Gestionnaire de noms', 'Ctrl+F3'], ['Affichage', ''], ['Zoom', 'Ctrl+molette'], ['Nouvelle feuille', 'Maj+F11'], ['Rechercher une commande', 'Alt+Q'], ['Réduire le ruban', 'Ctrl+F1'], ['Agrandir la barre de formule', 'Ctrl+Maj+U']];
    O.dialog({ title: 'Raccourcis clavier', wide: true, body: '<table class="kbd-tbl">' + rows.map((r) => r[1] ? '<tr><td>' + O.esc(r[0]) + '</td><td>' + r[1].split(/(, | \/ )/).map((x) => /^(, | \/ )$/.test(x) ? x : '<kbd>' + O.esc(x) + '</kbd>').join('') + '</td></tr>' : '<tr><td colspan="2"><b>' + O.esc(r[0]) + '</b></td></tr>').join('') + '</table>' });
  };
})();
