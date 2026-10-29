/* Tableur — modèles : classeur vide, budget mensuel, suivi de dépenses, facture / devis avec TVA, planning mensuel,
   feuille d'émargement de formation, suivi des stagiaires et des évaluations, inventaire du matériel, métré de
   calorifuge, nomenclature et poids d'échafaudage, suivi des vérifications d'équipements (échéances colorées).
   Les valeurs d'exemple des modèles métier sont marquées « à vérifier » : aucune donnée réglementaire n'est fournie. */
(function () {
  'use strict';
  const TB = window.Tableur, O = window.Office;
  const T = TB.Templates = {};
  /** hauteur des lignes sans hauteur fixée selon la plus grande police (titres) */
  TB.autoRowHeights = function (wb) {
    wb.sheets.forEach((sh) => {
      const big = new Map();
      sh.sty.forEach((col) => { if (!col) return; col.forEach((id, r) => { const st = wb.styles.get(id); if (st.fs && st.fs > 12 && !st.wr) big.set(r, Math.max(big.get(r) || 0, st.fs)); }); });
      big.forEach((fs, r) => { if (sh.rowH[r] == null) sh.rowH[r] = Math.ceil(fs * 96 / 72 * 1.25 + 5); });
    });
  };
  const ORANGE = '#EC7913', DARK = '#16212B', GREEN = '#1E7B45', LIGHT = '#F3F5F7';
  T.list = [
    { id: 'vide', name: 'Classeur vide', desc: 'Une feuille, prête à remplir' },
    { id: 'budget', name: 'Budget mensuel', desc: 'Revenus, dépenses prévues et réelles, écarts, graphique' },
    { id: 'depenses', name: 'Suivi des dépenses', desc: 'Tableau filtrable, catégories en liste, totaux par catégorie' },
    { id: 'facture', name: 'Facture / devis', desc: 'Lignes HT, TVA par taux, total TTC, mentions' },
    { id: 'planning', name: 'Planning du mois', desc: 'Calendrier automatique, week-ends et jours fériés colorés' },
    { id: 'presence', name: 'Émargement de formation', desc: 'Stagiaires × demi-journées, heures, signatures' },
    { id: 'stagiaires', name: 'Suivi des stagiaires', desc: 'Notes par module, moyennes, réussite, statistiques' },
    { id: 'inventaire', name: 'Inventaire du matériel', desc: 'Références, états, valeurs, totaux par état' },
    { id: 'calorifuge', name: 'Métré de calorifuge', desc: 'Tuyauteries : diamètres, épaisseurs, surfaces, tôle' },
    { id: 'echafaudage', name: 'Nomenclature d\'échafaudage', desc: 'Éléments, quantités, poids unitaires et total' },
    { id: 'verifications', name: 'Vérifications d\'équipements', desc: 'Dates d\'échéance, jours restants, alertes en couleur' }
  ];
  /* ---------------- outils de construction ---------------- */
  function mk() {
    const wb = new TB.Workbook(); wb.props.author = (A() && A().userName && A().userName()) || ''; wb.props.created = Date.now();
    const S = (o) => wb.styles.add(o);
    const put = (sh, a, v, st) => {
      const p = TB.parseAddr(a);
      if (v && typeof v === 'object' && v.f) wb.loadFormula(sh, p.r, p.c, v.f, st ? S(st) : undefined);
      else wb.load(sh, p.r, p.c, v === undefined || v === '' ? null : v, st ? S(st) : undefined);
    };
    const row = (sh, a, vals, st) => { const p = TB.parseAddr(a); vals.forEach((v, j) => { if (v === undefined) return; put(sh, TB.addr(p.r, p.c + j), v, Array.isArray(st) ? st[j] : st); }); };
    const widths = (sh, l) => l.forEach((w, i) => { if (w) sh.colW[i] = Math.round(w * 7 + 5); });
    const merge = (sh, a) => sh.merges.push(TB.parseRange(a));
    return { wb, S, put, row, widths, merge };
  }
  const A = () => window.TableurApp;
  const H = { b: true, fc: '#FFFFFF', bg: DARK, ha: 'center', va: 'center', wr: true };
  const TITLE = { b: true, fs: 16, fc: DARK };
  const SUB = { i: true, fc: '#5B6773', fs: 10 };
  const EUR = '#,##0.00\\ "€"', EUR0 = '#,##0\\ "€"';
  const thin = { s: 'thin', c: '#BFC5CC' };
  const BOX = { bt: thin, bb: thin, bl: thin, br: thin };
  const WARN = { i: true, fc: '#B65A05', fs: 10, wr: true };
  const today = () => TB.today();

  T.build = function (id) {
    const f = BUILD[id] || BUILD.vide; const wb = f();
    TB.autoRowHeights(wb);
    wb.finishLoad(); wb.props.title = id === 'vide' ? '' : (T.list.find((x) => x.id === id) || {}).name || '';
    return wb;
  };
  const BUILD = {};
  BUILD.vide = () => { const { wb } = mk(); wb.addSheetRaw('Feuil1'); return wb; };

  /* ---------------- budget mensuel ---------------- */
  BUILD.budget = () => {
    const { wb, put, row, widths, merge } = mk(); const s = wb.addSheetRaw('Budget');
    put(s, 'A1', 'Budget mensuel', TITLE); put(s, 'A2', 'Saisissez vos montants dans les cellules blanches ; les totaux et écarts se calculent seuls.', SUB); merge(s, 'A2:F2');
    put(s, 'A3', 'Mois :', { b: true }); put(s, 'B3', TB.serial(new Date().getFullYear(), new Date().getMonth() + 1, 1), { nf: 'mmmm yyyy', ha: 'left', b: true, fc: GREEN });
    row(s, 'A5', ['Revenus', 'Prévu', 'Réel', 'Écart'], H);
    const rev = [['Salaire', 2200, 2200], ['Autres revenus', 150, 120], ['Remboursements', 0, 35]];
    rev.forEach((x, i) => { const r = 6 + i; row(s, 'A' + r, [x[0], x[1], x[2]], [BOX, Object.assign({ nf: EUR }, BOX), Object.assign({ nf: EUR }, BOX)]); put(s, 'D' + r, { f: 'C' + r + '-B' + r }, Object.assign({ nf: EUR + ';[Red]-' + EUR }, BOX)); });
    row(s, 'A9', ['Total des revenus', { f: 'SUM(B6:B8)' }, { f: 'SUM(C6:C8)' }, { f: 'C9-B9' }], [{ b: true, bt: { s: 'thin', c: DARK } }, { b: true, nf: EUR, bt: { s: 'thin', c: DARK } }, { b: true, nf: EUR, bt: { s: 'thin', c: DARK } }, { b: true, nf: EUR + ';[Red]-' + EUR, bt: { s: 'thin', c: DARK } }]);
    row(s, 'A11', ['Dépenses', 'Prévu', 'Réel', 'Écart', 'Part du réel'], H);
    const dep = [['Logement', 750, 750], ['Énergie et eau', 120, 134], ['Alimentation', 400, 432], ['Transport, carburant', 180, 166], ['Assurances', 90, 90], ['Téléphone, internet', 45, 45], ['Santé', 40, 18], ['Loisirs', 100, 140], ['Épargne', 200, 200], ['Divers', 60, 37]];
    dep.forEach((x, i) => { const r = 12 + i; row(s, 'A' + r, [x[0], x[1], x[2]], [BOX, Object.assign({ nf: EUR }, BOX), Object.assign({ nf: EUR }, BOX)]); put(s, 'D' + r, { f: 'B' + r + '-C' + r }, Object.assign({ nf: EUR + ';[Red]-' + EUR }, BOX)); put(s, 'E' + r, { f: 'IFERROR(C' + r + '/$C$22,0)' }, Object.assign({ nf: '0.0%' }, BOX)); });
    row(s, 'A22', ['Total des dépenses', { f: 'SUM(B12:B21)' }, { f: 'SUM(C12:C21)' }, { f: 'B22-C22' }, { f: 'SUM(E12:E21)' }], [{ b: true, bt: { s: 'thin', c: DARK } }, { b: true, nf: EUR, bt: { s: 'thin', c: DARK } }, { b: true, nf: EUR, bt: { s: 'thin', c: DARK } }, { b: true, nf: EUR + ';[Red]-' + EUR, bt: { s: 'thin', c: DARK } }, { b: true, nf: '0%', bt: { s: 'thin', c: DARK } }]);
    row(s, 'A24', ['Solde du mois', { f: 'B9-B22' }, { f: 'C9-C22' }], [{ b: true, fs: 13, bg: LIGHT }, { b: true, fs: 13, nf: EUR + ';[Red]-' + EUR, bg: LIGHT }, { b: true, fs: 13, nf: EUR + ';[Red]-' + EUR, bg: LIGHT }]);
    widths(s, [26, 13, 13, 13, 13]);
    s.cf.push({ id: 'b1', type: 'dataBar', ranges: [TB.parseRange('E12:E21')], color: ORANGE, grad: true });
    s.cf.push({ id: 'b2', type: 'cellIs', op: 'lt', f1: '0', ranges: [TB.parseRange('D12:D21')], fmt: { bg: '#FFC7CE', fc: '#9C0006' } });
    s.objs.push({ id: 'o1', type: 'chart', from: { r: 3, c: 6, dx: 10, dy: 0 }, w: 420, h: 300, chart: { kind: 'doughnut', src: "Budget!$A$11:$A$21,Budget!$C$11:$C$21", explicit: true, series: [{ name: 'Réel', values: 'Budget!$C$12:$C$21', cats: 'Budget!$A$12:$A$21' }], title: 'Répartition des dépenses réelles', legend: 'right' } });
    s.objs.push({ id: 'o2', type: 'chart', from: { r: 19, c: 6, dx: 10, dy: 0 }, w: 420, h: 260, chart: { kind: 'barH', src: 'Budget!$A$11:$C$21', title: 'Prévu et réel', legend: 'bottom' } });
    s.print = { orient: 'portrait', fitW: 1, fitH: 1 };
    return wb;
  };

  /* ---------------- suivi des dépenses ---------------- */
  BUILD.depenses = () => {
    const { wb, put, row, widths } = mk(); const s = wb.addSheetRaw('Dépenses'), c = wb.addSheetRaw('Catégories');
    put(s, 'A1', 'Suivi des dépenses', TITLE);
    row(s, 'A3', ['Date', 'Catégorie', 'Description', 'Mode de paiement', 'Montant'], null);
    const cats = ['Alimentation', 'Carburant', 'Fournitures', 'Matériel', 'Repas', 'Hébergement', 'Abonnements', 'Divers'];
    const data = [[-28, 'Carburant', 'Plein véhicule de service', 'Carte', 72.4], [-26, 'Fournitures', 'Ramettes de papier, classeurs', 'Carte', 38.9], [-21, 'Repas', 'Repas formation chantier', 'Espèces', 46], [-17, 'Matériel', 'Gants anti-coupure (lot)', 'Virement', 124.5], [-12, 'Hébergement', 'Hôtel 1 nuit', 'Carte', 89], [-9, 'Carburant', 'Plein véhicule de service', 'Carte', 68.2], [-5, 'Abonnements', 'Logiciel (mois)', 'Prélèvement', 12.99], [-2, 'Divers', 'Timbres', 'Espèces', 9.6]];
    data.forEach((x, i) => { const r = 4 + i; put(s, 'A' + r, today() + x[0], { nf: 'dd/mm/yyyy' }); put(s, 'B' + r, x[1]); put(s, 'C' + r, x[2]); put(s, 'D' + r, x[3]); put(s, 'E' + r, x[4], { nf: EUR }); });
    s.tables.push({ name: 'Depenses', r1: 2, c1: 0, r2: 3 + data.length, c2: 4, header: true, totals: false, style: 'TableStyleMedium7', bandRows: true, cols: [{ name: 'Date' }, { name: 'Catégorie' }, { name: 'Description' }, { name: 'Mode de paiement' }, { name: 'Montant' }], af: {} });
    s.dv.push({ type: 'list', f1: '=Catégories!$A$2:$A$9', ranges: [TB.parseRange('B4:B500')], msgTitle: 'Catégorie', msg: 'Choisissez dans la liste (Alt+↓)', errStyle: 'warning', errMsg: 'Catégorie absente de la liste (feuille Catégories).' });
    s.dv.push({ type: 'list', f1: 'Carte;Espèces;Virement;Prélèvement;Chèque', ranges: [TB.parseRange('D4:D500')] });
    s.dv.push({ type: 'decimal', op: 'ge', f1: '0', ranges: [TB.parseRange('E4:E500')], errMsg: 'Le montant doit être un nombre positif.' });
    put(s, 'G3', 'Catégorie', H); put(s, 'H3', 'Total', H); put(s, 'I3', 'Nb', H);
    cats.forEach((x, i) => { const r = 4 + i; put(s, 'G' + r, x, BOX); put(s, 'H' + r, { f: 'SUMIFS(Depenses[Montant],Depenses[Catégorie],G' + r + ')' }, Object.assign({ nf: EUR }, BOX)); put(s, 'I' + r, { f: 'COUNTIF(Depenses[Catégorie],G' + r + ')' }, Object.assign({ ha: 'center' }, BOX)); });
    put(s, 'G12', 'Total', { b: true }); put(s, 'H12', { f: 'SUM(H4:H11)' }, { b: true, nf: EUR, bt: { s: 'thin', c: DARK } });
    put(s, 'G14', 'Ce mois-ci', { b: true }); put(s, 'H14', { f: 'SUMIFS(Depenses[Montant],Depenses[Date],">="&EOMONTH(TODAY(),-1)+1,Depenses[Date],"<="&EOMONTH(TODAY(),0))' }, { b: true, nf: EUR });
    widths(s, [12, 15, 32, 16, 12, 2, 15, 12, 6]);
    s.freeze = { r: 3, c: 0 };
    s.cf.push({ id: 'c1', type: 'dataBar', ranges: [TB.parseRange('H4:H11')], color: '#63BE7B', grad: true });
    put(c, 'A1', 'Catégories', H); cats.forEach((x, i) => put(c, 'A' + (2 + i), x)); widths(c, [20]);
    return wb;
  };

  /* ---------------- facture / devis ---------------- */
  BUILD.facture = () => {
    const { wb, put, row, widths, merge } = mk(); const s = wb.addSheetRaw('Facture');
    put(s, 'A1', 'VOTRE ENTREPRISE', { b: true, fs: 14, fc: ORANGE }); put(s, 'A2', 'Adresse · Code postal Ville'); put(s, 'A3', 'SIRET : ……… · TVA intracommunautaire : ………', SUB); put(s, 'A4', 'Téléphone · e-mail', SUB);
    put(s, 'E1', 'FACTURE', { b: true, fs: 20, ha: 'right', fc: DARK }); merge(s, 'E1:F1');
    row(s, 'E2', ['N° :', 'F-' + new Date().getFullYear() + '-001'], [{ ha: 'right', b: true }, { ha: 'right' }]);
    row(s, 'E3', ['Date :', today()], [{ ha: 'right', b: true }, { nf: 'dd/mm/yyyy', ha: 'right' }]);
    row(s, 'E4', ['Échéance :', { f: 'F3+30' }], [{ ha: 'right', b: true }, { nf: 'dd/mm/yyyy', ha: 'right' }]);
    put(s, 'A6', 'Client', { b: true, fc: '#5B6773' }); put(s, 'A7', 'Nom du client', { b: true }); put(s, 'A8', 'Adresse'); put(s, 'A9', 'Code postal Ville');
    row(s, 'A11', ['Désignation', 'Quantité', 'Unité', 'Prix unitaire HT', 'TVA', 'Montant HT'], H);
    const L = [['Formation montage d\'échafaudage (journée)', 2, 'j', 650, 0.2], ['Support de cours (stagiaire)', 8, 'u', 15, 0.2], ['Déplacement', 120, 'km', 0.6, 0.2], ['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']];
    L.forEach((x, i) => { const r = 12 + i; row(s, 'A' + r, [x[0] || null, x[1] === '' ? null : x[1], x[2] || null, x[3] === '' ? null : x[3], x[4] === '' ? null : x[4]], [BOX, Object.assign({ ha: 'center' }, BOX), Object.assign({ ha: 'center' }, BOX), Object.assign({ nf: EUR }, BOX), Object.assign({ nf: '0%', ha: 'center' }, BOX)]); put(s, 'F' + r, { f: 'IF(B' + r + '="","",B' + r + '*D' + r + ')' }, Object.assign({ nf: EUR }, BOX)); });
    s.dv.push({ type: 'list', f1: '20 %;10 %;5,5 %;2,1 %;0 %'.replace(/ %/g, '%'), ranges: [TB.parseRange('E12:E17')], msg: 'Taux de TVA', msgTitle: 'TVA', errStyle: 'warning' });
    row(s, 'D19', ['Total HT', null, { f: 'SUM(F12:F17)' }], [{ b: true, ha: 'right' }, null, { b: true, nf: EUR }]); merge(s, 'D19:E19');
    row(s, 'D20', ['TVA 20 %', null, { f: 'SUMIFS(F12:F17,E12:E17,0.2)*0.2' }], [{ ha: 'right' }, null, { nf: EUR }]); merge(s, 'D20:E20');
    row(s, 'D21', ['TVA 10 %', null, { f: 'SUMIFS(F12:F17,E12:E17,0.1)*0.1' }], [{ ha: 'right' }, null, { nf: EUR }]); merge(s, 'D21:E21');
    row(s, 'D22', ['TVA 5,5 %', null, { f: 'SUMIFS(F12:F17,E12:E17,0.055)*0.055' }], [{ ha: 'right' }, null, { nf: EUR }]); merge(s, 'D22:E22');
    row(s, 'D23', ['Total TTC', null, { f: 'ROUND(F19+SUM(F20:F22),2)' }], [{ b: true, ha: 'right', bg: DARK, fc: '#FFFFFF' }, { bg: DARK }, { b: true, nf: EUR, bg: DARK, fc: '#FFFFFF', fs: 12 }]); merge(s, 'D23:E23');
    put(s, 'A19', 'Conditions de paiement : 30 jours à réception.', SUB);
    put(s, 'A20', 'Pénalités de retard et indemnité forfaitaire : à compléter selon vos conditions générales (à vérifier).', WARN); merge(s, 'A20:C21');
    put(s, 'A25', 'Arrêtée la présente facture à la somme de :', { i: true }); put(s, 'C25', { f: 'F23' }, { b: true, nf: EUR });
    widths(s, [40, 10, 8, 16, 8, 16]);
    s.print = { orient: 'portrait', fitW: 1, fitH: 1, margins: { t: 1.5, b: 1.5, l: 1.5, r: 1.5, h: 0.8, f: 0.8 }, footer: { c: 'Page &P sur &N' } };
    s.grid = false;
    const d = wb.addSheetRaw('Devis');
    put(d, 'A1', 'DEVIS', { b: true, fs: 20, fc: DARK }); put(d, 'A3', 'Pour transformer la facture en devis : copiez la feuille « Facture » (clic droit sur l\'onglet › Dupliquer), changez le titre en « DEVIS » et ajoutez la durée de validité de l\'offre.', { wr: true }); merge(d, 'A3:F5'); widths(d, [40, 10, 8, 16, 8, 16]);
    return wb;
  };

  /* ---------------- planning du mois ---------------- */
  BUILD.planning = () => {
    const { wb, put, row, widths, merge } = mk(); const s = wb.addSheetRaw('Planning');
    const y = new Date().getFullYear(), m = new Date().getMonth() + 1;
    put(s, 'A1', 'Planning du mois', TITLE); put(s, 'D1', TB.serial(y, m, 1), { nf: 'mmmm yyyy', b: true, fs: 16, fc: GREEN, ha: 'left' }); merge(s, 'D1:F1');
    put(s, 'A2', 'Changez le mois en D1 : les dates se recalculent ; week-ends en gris, jours fériés (feuille Fériés) en orange.', SUB);
    row(s, 'A4', ['Date', 'Jour', 'Matin', 'Après-midi', 'Lieu', 'Remarques'], H);
    for (let i = 0; i < 31; i++) {
      const r = 5 + i;
      put(s, 'A' + r, { f: i === 0 ? '$D$1' : 'IF(A' + (r - 1) + '="","",IF(MONTH(A' + (r - 1) + '+1)=MONTH($D$1),A' + (r - 1) + '+1,""))' }, Object.assign({ nf: 'dd/mm' }, BOX));
      put(s, 'B' + r, { f: 'IF(A' + r + '="","",TEXT(A' + r + ',"dddd"))' }, BOX);
      ['C', 'D', 'E', 'F'].forEach((k) => put(s, k + r, null, BOX));
    }
    put(s, 'C5', 'Formation échafaudage', BOX); put(s, 'D5', 'Formation échafaudage', BOX); put(s, 'E5', 'Centre de formation', BOX);
    s.cf.push({ id: 'p1', type: 'expr', f: 'AND($A5<>"",COUNTIF(Fériés!$A$2:$A$20,$A5)>0)', ranges: [TB.parseRange('A5:F35')], fmt: { bg: '#FDEBD9', fc: '#B65A05' }, stop: true });
    s.cf.push({ id: 'p2', type: 'expr', f: 'AND($A5<>"",WEEKDAY($A5,2)>5)', ranges: [TB.parseRange('A5:F35')], fmt: { bg: '#E7E9EC', fc: '#5B6773' } });
    s.cf.push({ id: 'p3', type: 'expr', f: '$A5=TODAY()', ranges: [TB.parseRange('A5:B35')], fmt: { b: true, fc: GREEN } });
    widths(s, [10, 12, 26, 26, 20, 30]); s.freeze = { r: 4, c: 0 };
    s.print = { orient: 'landscape', fitW: 1, fitH: 1, titles: { rows: '4:4' } };
    const f = wb.addSheetRaw('Fériés');
    put(f, 'A1', 'Jours fériés (à compléter)', H); put(f, 'B1', 'Libellé', H);
    [[1, 1, 'Jour de l\'an'], [5, 1, 'Fête du travail'], [5, 8, 'Victoire 1945'], [7, 14, 'Fête nationale'], [8, 15, 'Assomption'], [11, 1, 'Toussaint'], [11, 11, 'Armistice 1918'], [12, 25, 'Noël']].forEach((x, i) => { put(f, 'A' + (2 + i), TB.serial(y, x[0], x[1]), { nf: 'dd/mm/yyyy' }); put(f, 'B' + (2 + i), x[2]); });
    put(f, 'A11', 'Ajoutez les fêtes mobiles (lundi de Pâques, Ascension, lundi de Pentecôte) et les jours propres à votre région.', SUB);
    widths(f, [14, 24]);
    return wb;
  };

  /* ---------------- émargement ---------------- */
  BUILD.presence = () => {
    const { wb, put, row, widths, merge } = mk(); const s = wb.addSheetRaw('Émargement');
    put(s, 'A1', 'Feuille d\'émargement', TITLE); put(s, 'A2', 'MAG Formation 13', { b: true, fc: ORANGE });
    row(s, 'A3', ['Formation :', 'Montage et démontage d\'échafaudages fixes'], [{ b: true }, null]); merge(s, 'B3:F3');
    row(s, 'A4', ['Lieu :', 'Centre de formation'], [{ b: true }, null]); row(s, 'A5', ['Formateur :', ''], [{ b: true }, null]);
    row(s, 'G4', ['Heures par demi-journée :', null, 3.5], [{ b: true, ha: 'right' }, null, { b: true, nf: '0.0', bg: '#FFF3BF' }]); merge(s, 'G4:H4');
    const d0 = today();
    const days = []; let d = d0; while (days.length < 3) { if (TB.weekday(d) !== 0 && TB.weekday(d) !== 6) days.push(d); d++; }
    put(s, 'A7', 'Stagiaire', Object.assign({}, H, { ha: 'left' })); merge(s, 'A7:A8'); put(s, 'B7', 'Entreprise', H); merge(s, 'B7:B8');
    days.forEach((dd, i) => { const c = 2 + i * 2; put(s, TB.addr(6, c), dd, Object.assign({}, H, { nf: 'ddd dd/mm' })); merge(s, TB.addr(6, c) + ':' + TB.addr(6, c + 1)); put(s, TB.addr(7, c), 'Matin', H); put(s, TB.addr(7, c + 1), 'Après-midi', H); });
    put(s, 'I7', 'Présences', H); merge(s, 'I7:I8'); put(s, 'J7', 'Heures', H); merge(s, 'J7:J8');
    const names = ['DUPONT Jean', 'MARTIN Sophie', 'BERNARD Karim', 'PETIT Lucas', 'ROBERT Inès', 'RICHARD Hugo', 'DURAND Léa', 'MOREAU Yanis'];
    names.forEach((n, i) => {
      const r = 9 + i; put(s, 'A' + r, n, BOX); put(s, 'B' + r, 'Entreprise ' + String.fromCharCode(65 + (i % 3)), BOX);
      for (let k = 0; k < 6; k++) put(s, TB.addr(r - 1, 2 + k), i === 3 && k === 2 ? 'Absent' : i < 6 ? 'P' : null, Object.assign({ ha: 'center' }, BOX));
      put(s, 'I' + r, { f: 'COUNTIF(C' + r + ':H' + r + ',"P")' }, Object.assign({ ha: 'center' }, BOX)); put(s, 'J' + r, { f: 'I' + r + '*$I$4' }, Object.assign({ nf: '0.0" h"' }, BOX));
    });
    const last = 8 + names.length;
    put(s, 'A' + (last + 1), 'Total', { b: true }); for (let k = 0; k < 6; k++) put(s, TB.addr(last, 2 + k), { f: 'COUNTIF(' + TB.addr(8, 2 + k) + ':' + TB.addr(last - 1, 2 + k) + ',"P")' }, { b: true, ha: 'center' });
    put(s, 'J' + (last + 1), { f: 'SUM(J9:J' + last + ')' }, { b: true, nf: '0.0" h"' });
    s.dv.push({ type: 'list', f1: 'P;Absent;Excusé;Retard', ranges: [TB.parseRange('C9:H' + last)], msg: '« P » : présent (le stagiaire signe dans la case imprimée).', msgTitle: 'Émargement', errStyle: 'warning' });
    s.cf.push({ id: 'e1', type: 'text', op: 'contains', text: 'Absent', ranges: [TB.parseRange('C9:H' + last)], fmt: { bg: '#FFC7CE', fc: '#9C0006' } });
    s.cf.push({ id: 'e2', type: 'text', op: 'contains', text: 'Excus', ranges: [TB.parseRange('C9:H' + last)], fmt: { bg: '#FFEB9C', fc: '#9C5700' } });
    put(s, 'A' + (last + 3), 'Signature du formateur :', { b: true }); put(s, 'A' + (last + 6), 'Modèle à adapter : vérifiez les mentions exigées par votre financeur ou votre certification qualité.', WARN); merge(s, 'A' + (last + 6) + ':J' + (last + 6));
    widths(s, [22, 16, 9, 9, 9, 9, 9, 9, 10, 9]);
    for (let r = 8; r < last; r++) s.rowH[r] = 30;
    s.print = { orient: 'landscape', fitW: 1, fitH: 1, grid: false, header: { c: 'Feuille d\'émargement' }, footer: { l: '&F', r: 'Page &P / &N' } };
    return wb;
  };

  /* ---------------- suivi des stagiaires ---------------- */
  BUILD.stagiaires = () => {
    const { wb, put, row, widths } = mk(); const s = wb.addSheetRaw('Évaluations');
    put(s, 'A1', 'Suivi des stagiaires et des évaluations', TITLE);
    row(s, 'A2', ['Note minimale de réussite :', null, 12], [{ b: true }, null, { b: true, bg: '#FFF3BF', nf: '0.0' }]);
    const mods = ['Théorie', 'Sécurité', 'Montage', 'Démontage', 'Réception'];
    row(s, 'A4', ['Stagiaire', 'Entreprise'].concat(mods).concat(['Moyenne', 'Résultat', 'Rang']), H);
    const names = [['DUPONT Jean', 'Entreprise A', [14, 15, 12, 13, 16]], ['MARTIN Sophie', 'Entreprise B', [17, 16, 15, 16, 18]], ['BERNARD Karim', 'Entreprise A', [9, 11, 10, 12, 10]], ['PETIT Lucas', 'Entreprise C', [12, 13, 14, 11, 12]], ['ROBERT Inès', 'Entreprise B', [15, 14, 16, 17, 15]], ['RICHARD Hugo', 'Entreprise C', [8, 10, 11, 9, 7]], ['DURAND Léa', 'Entreprise A', [13, 12, 15, 14, 13]], ['MOREAU Yanis', 'Entreprise B', [16, 18, 14, 15, 17]]];
    names.forEach((x, i) => { const r = 5 + i; put(s, 'A' + r, x[0]); put(s, 'B' + r, x[1]); x[2].forEach((n, j) => put(s, TB.addr(r - 1, 2 + j), n, { nf: '0.0', ha: 'center' })); put(s, 'H' + r, { f: 'IFERROR(AVERAGE(C' + r + ':G' + r + '),"")' }, { nf: '0.00', ha: 'center', b: true }); put(s, 'I' + r, { f: 'IF(H' + r + '="","",IF(AND(H' + r + '>=$C$2,MIN(C' + r + ':G' + r + ')>=8),"Réussi","À revoir"))' }, { ha: 'center' }); put(s, 'J' + r, { f: 'RANK.EQ(H' + r + ',$H$5:$H$' + (4 + names.length) + ')' }, { ha: 'center' }); });
    const last = 4 + names.length;
    s.tables.push({ name: 'Stagiaires', r1: 3, c1: 0, r2: last, c2: 9, header: true, totals: false, style: 'TableStyleLight9', bandRows: true, cols: ['Stagiaire', 'Entreprise'].concat(mods).concat(['Moyenne', 'Résultat', 'Rang']).map((n) => ({ name: n })), af: {} });
    row(s, 'A' + (last + 2), ['Moyenne du groupe', null].concat(mods.map((_, j) => ({ f: 'AVERAGE(' + TB.addr(4, 2 + j) + ':' + TB.addr(last - 1, 2 + j) + ')' }))).concat([{ f: 'AVERAGE(H5:H' + last + ')' }]), { b: true, nf: '0.00', ha: 'center', bt: { s: 'thin', c: DARK } });
    row(s, 'A' + (last + 3), ['Note la plus haute', null].concat(mods.map((_, j) => ({ f: 'MAX(' + TB.addr(4, 2 + j) + ':' + TB.addr(last - 1, 2 + j) + ')' }))), { nf: '0.0', ha: 'center' });
    row(s, 'A' + (last + 4), ['Note la plus basse', null].concat(mods.map((_, j) => ({ f: 'MIN(' + TB.addr(4, 2 + j) + ':' + TB.addr(last - 1, 2 + j) + ')' }))), { nf: '0.0', ha: 'center' });
    row(s, 'A' + (last + 6), ['Réussis :', { f: 'COUNTIF(I5:I' + last + ',"Réussi")' }, 'sur', { f: 'COUNTA(A5:A' + last + ')' }, 'Taux de réussite :', { f: 'IFERROR(B' + (last + 6) + '/D' + (last + 6) + ',0)' }], [{ b: true }, { b: true, ha: 'center' }, { ha: 'center' }, { b: true, ha: 'center' }, { b: true, ha: 'right' }, { b: true, nf: '0%', fc: GREEN }]);
    s.cf.push({ id: 's1', type: 'colorScale', ranges: [TB.parseRange('C5:G' + last)], pts: [{ t: 'min', c: '#F8696B' }, { t: 'percentile', v: 50, c: '#FFEB84' }, { t: 'max', c: '#63BE7B' }] });
    s.cf.push({ id: 's2', type: 'cellIs', op: 'eq', f1: '"Réussi"', ranges: [TB.parseRange('I5:I' + last)], fmt: { bg: '#C6EFCE', fc: '#006100', b: true } });
    s.cf.push({ id: 's3', type: 'cellIs', op: 'eq', f1: '"À revoir"', ranges: [TB.parseRange('I5:I' + last)], fmt: { bg: '#FFC7CE', fc: '#9C0006', b: true } });
    s.cf.push({ id: 's4', type: 'iconSet', set: '3Arrows', ranges: [TB.parseRange('H5:H' + last)] });
    s.dv.push({ type: 'decimal', op: 'between', f1: '0', f2: '20', ranges: [TB.parseRange('C5:G200')], errMsg: 'Note sur 20 (entre 0 et 20).', msg: 'Note sur 20', msgTitle: 'Évaluation' });
    widths(s, [20, 14, 10, 10, 10, 11, 10, 10, 11, 7]); s.freeze = { r: 4, c: 1 };
    s.objs.push({ id: 'g1', type: 'chart', from: { r: 3, c: 11, dx: 6, dy: 0 }, w: 440, h: 280, chart: { kind: 'bar', explicit: true, series: [{ name: 'Moyenne', values: "'Évaluations'!$H$5:$H$" + last, cats: "'Évaluations'!$A$5:$A$" + last }], title: 'Moyennes des stagiaires', legend: 'none', labels: true } });
    s.print = { orient: 'landscape', fitW: 1, fitH: 1 };
    return wb;
  };

  /* ---------------- inventaire ---------------- */
  BUILD.inventaire = () => {
    const { wb, put, row, widths } = mk(); const s = wb.addSheetRaw('Inventaire');
    put(s, 'A1', 'Inventaire du matériel', TITLE); put(s, 'A2', { f: '"Au "&TEXT(TODAY(),"dd/mm/yyyy")' }, SUB);
    row(s, 'A4', ['Référence', 'Désignation', 'Catégorie', 'Emplacement', 'Quantité', 'État', 'Valeur unitaire', 'Valeur totale', 'Date d\'achat'], null);
    const L = [['EQ-001', 'Harnais antichute', 'EPI', 'Armoire 1', 12, 'Bon', 85, -900], ['EQ-002', 'Longe double avec absorbeur', 'EPI', 'Armoire 1', 12, 'Bon', 70, -900], ['EQ-003', 'Casque de chantier', 'EPI', 'Armoire 2', 20, 'Usé', 18, -1500], ['EQ-004', 'Visseuse sans fil', 'Outillage', 'Atelier', 4, 'Bon', 160, -600], ['EQ-005', 'Cisaille à tôle', 'Outillage', 'Atelier', 6, 'À réparer', 45, -2000], ['EQ-006', 'Rouleuse manuelle', 'Machines', 'Atelier', 1, 'Bon', 1200, -1200], ['EQ-007', 'Niveau à bulle 1 m', 'Outillage', 'Atelier', 8, 'Bon', 25, -400], ['EQ-008', 'Clé à cliquet 19/22', 'Outillage', 'Caisse échafaudage', 10, 'Hors service', 32, -2500]];
    L.forEach((x, i) => { const r = 5 + i; row(s, 'A' + r, [x[0], x[1], x[2], x[3], x[4], x[5], x[6]], [null, null, null, null, { ha: 'center' }, null, { nf: EUR }]); put(s, 'H' + r, { f: '[@Quantité]*[@[Valeur unitaire]]' }, { nf: EUR }); put(s, 'I' + r, today() + x[7], { nf: 'dd/mm/yyyy' }); });
    const last = 4 + L.length;
    s.tables.push({ name: 'Inventaire', r1: 3, c1: 0, r2: last + 1, c2: 8, header: true, totals: true, style: 'TableStyleMedium2', bandRows: true, cols: ['Référence', 'Désignation', 'Catégorie', 'Emplacement', 'Quantité', 'État', 'Valeur unitaire', 'Valeur totale', 'Date d\'achat'].map((n) => ({ name: n })), af: {} });
    put(s, 'A' + (last + 2), 'Total'); put(s, 'E' + (last + 2), { f: 'SUBTOTAL(109,Inventaire[Quantité])' }, { ha: 'center' }); put(s, 'H' + (last + 2), { f: 'SUBTOTAL(109,Inventaire[Valeur totale])' }, { nf: EUR });
    s.dv.push({ type: 'list', f1: 'Bon;Usé;À réparer;Hors service', ranges: [TB.parseRange('F5:F500')] });
    s.cf.push({ id: 'i1', type: 'text', op: 'contains', text: 'Hors service', ranges: [TB.parseRange('F5:F500')], fmt: { bg: '#FFC7CE', fc: '#9C0006' } });
    s.cf.push({ id: 'i2', type: 'text', op: 'contains', text: 'réparer', ranges: [TB.parseRange('F5:F500')], fmt: { bg: '#FFEB9C', fc: '#9C5700' } });
    put(s, 'K4', 'État', H); put(s, 'L4', 'Quantité', H); put(s, 'M4', 'Valeur', H);
    ['Bon', 'Usé', 'À réparer', 'Hors service'].forEach((x, i) => { const r = 5 + i; put(s, 'K' + r, x, BOX); put(s, 'L' + r, { f: 'SUMIFS(Inventaire[Quantité],Inventaire[État],K' + r + ')' }, Object.assign({ ha: 'center' }, BOX)); put(s, 'M' + r, { f: 'SUMIFS(Inventaire[Valeur totale],Inventaire[État],K' + r + ')' }, Object.assign({ nf: EUR }, BOX)); });
    widths(s, [10, 28, 12, 18, 9, 13, 14, 14, 12, 2, 14, 10, 12]); s.freeze = { r: 4, c: 0 };
    return wb;
  };

  /* ---------------- métré de calorifuge ---------------- */
  BUILD.calorifuge = () => {
    const { wb, put, row, widths, merge } = mk(); const s = wb.addSheetRaw('Métré');
    put(s, 'A1', 'Métré de calorifuge – tuyauteries', TITLE); put(s, 'A2', 'MAG Formation 13 · exercice de métré', { b: true, fc: ORANGE });
    put(s, 'A3', 'Toutes les valeurs (diamètres, épaisseurs, recouvrement, chutes, équivalences d\'accessoires) sont des EXEMPLES À VÉRIFIER : reprenez celles du cahier des charges, des plans et des fiches techniques du fabricant.', WARN); merge(s, 'A3:L4'); s.rowH[2] = 22; s.rowH[3] = 22;
    put(s, 'A6', 'Hypothèses (à vérifier)', { b: true, bg: '#FFF3BF' }); merge(s, 'A6:C6');
    row(s, 'A7', ['Recouvrement de la tôle (mm)', null, 50], [null, null, { bg: '#FFF3BF', nf: '0', ha: 'center' }]);
    row(s, 'A8', ['Majoration chutes tôle (%)', null, 0.1], [null, null, { bg: '#FFF3BF', nf: '0%', ha: 'center' }]);
    row(s, 'A9', ['Longueur équivalente d\'un coude (× Ø fini)', null, 1.5], [null, null, { bg: '#FFF3BF', nf: '0.0', ha: 'center' }]);
    row(s, 'A10', ['Longueur équivalente d\'une vanne (m)', null, 0.5], [null, null, { bg: '#FFF3BF', nf: '0.00', ha: 'center' }]);
    row(s, 'A12', ['Repère', 'Désignation', 'Ø ext. tube (mm)', 'Épaisseur isolant (mm)', 'Longueur droite (m)', 'Coudes', 'Vannes', 'Ø fini (mm)', 'Longueur totale (m)', 'Surface isolant (m²)', 'Développé tôle (m)', 'Tôle (m²)'], H);
    s.rowH[11] = 46;
    const L = [['T1', 'Eau chaude aller', 60.3, 40, 24.5, 4, 1], ['T2', 'Eau chaude retour', 48.3, 40, 24.5, 4, 1], ['T3', 'Vapeur BP', 88.9, 60, 12, 3, 2], ['T4', 'Condensats', 33.7, 30, 12, 3, 0], ['T5', 'Collecteur', 114.3, 80, 4.2, 2, 2]];
    L.forEach((x, i) => {
      const r = 13 + i;
      row(s, 'A' + r, x, [BOX, BOX, Object.assign({ nf: '0.0', ha: 'center' }, BOX), Object.assign({ nf: '0', ha: 'center' }, BOX), Object.assign({ nf: '0.00', ha: 'center' }, BOX), Object.assign({ ha: 'center' }, BOX), Object.assign({ ha: 'center' }, BOX)]);
      put(s, 'H' + r, { f: 'C' + r + '+2*D' + r }, Object.assign({ nf: '0.0', ha: 'center', bg: LIGHT }, BOX));
      put(s, 'I' + r, { f: 'E' + r + '+F' + r + '*$C$9*H' + r + '/1000+G' + r + '*$C$10' }, Object.assign({ nf: '0.00', ha: 'center', bg: LIGHT }, BOX));
      put(s, 'J' + r, { f: 'PI()*(C' + r + '+D' + r + ')/1000*I' + r }, Object.assign({ nf: '0.00', ha: 'center', bg: LIGHT }, BOX));
      put(s, 'K' + r, { f: '(PI()*H' + r + '+$C$7)/1000' }, Object.assign({ nf: '0.000', ha: 'center', bg: LIGHT }, BOX));
      put(s, 'L' + r, { f: 'K' + r + '*I' + r + '*(1+$C$8)' }, Object.assign({ nf: '0.00', ha: 'center', bg: LIGHT, b: true }, BOX));
    });
    const last = 12 + L.length;
    row(s, 'A' + (last + 1), ['Totaux', null, null, null, { f: 'SUM(E13:E' + last + ')' }, { f: 'SUM(F13:F' + last + ')' }, { f: 'SUM(G13:G' + last + ')' }, null, { f: 'SUM(I13:I' + last + ')' }, { f: 'SUM(J13:J' + last + ')' }, null, { f: 'SUM(L13:L' + last + ')' }], { b: true, nf: '0.00', ha: 'center', bt: { s: 'medium', c: DARK } });
    put(s, 'A' + (last + 3), 'Formules utilisées', { b: true });
    [['Ø fini', 'Ø ext. tube + 2 × épaisseur'], ['Longueur totale', 'longueur droite + coudes × coefficient × Ø fini + vannes × longueur équivalente (hypothèses ci-dessus)'], ['Surface isolant', 'π × (Ø tube + épaisseur) × longueur (surface moyenne de l\'isolant)'], ['Développé tôle', 'π × Ø fini + recouvrement'], ['Tôle', 'développé × longueur totale × (1 + chutes)']].forEach((x, i) => { put(s, 'A' + (last + 4 + i), x[0], { i: true }); put(s, 'C' + (last + 4 + i), x[1], { fc: '#5B6773' }); });
    s.dv.push({ type: 'decimal', op: 'gt', f1: '0', ranges: [TB.parseRange('C13:E200')], errMsg: 'Valeur positive attendue.' });
    s.cf.push({ id: 'k1', type: 'dataBar', ranges: [TB.parseRange('L13:L' + last)], color: ORANGE, grad: true });
    widths(s, [8, 22, 11, 12, 12, 8, 8, 10, 12, 12, 11, 10]); s.freeze = { r: 12, c: 2 };
    s.print = { orient: 'landscape', fitW: 1, fitH: 1, titles: { rows: '12:12' }, footer: { l: 'Métré de calorifuge – valeurs à vérifier', r: 'Page &P / &N' } };
    // feuille de diamètres usuels (exemples)
    const d = wb.addSheetRaw('Diamètres');
    put(d, 'A1', 'Diamètres extérieurs usuels (exemples à vérifier)', { b: true }); merge(d, 'A1:C1');
    row(d, 'A2', ['DN', 'Ø ext. (mm)', 'Remarque'], H);
    [[15, 21.3], [20, 26.9], [25, 33.7], [32, 42.4], [40, 48.3], [50, 60.3], [65, 76.1], [80, 88.9], [100, 114.3], [125, 139.7], [150, 168.3]].forEach((x, i) => { row(d, 'A' + (3 + i), [x[0], x[1], 'à vérifier selon la série du tube'], [{ ha: 'center' }, { nf: '0.0', ha: 'center' }, SUB]); });
    put(d, 'A15', 'Utilisation : =RECHERCHEV(DN;Diamètres!$A$3:$B$13;2;FAUX) dans la colonne Ø du métré.', SUB); merge(d, 'A15:C15');
    widths(d, [8, 12, 34]);
    return wb;
  };

  /* ---------------- nomenclature d'échafaudage ---------------- */
  BUILD.echafaudage = () => {
    const { wb, put, row, widths, merge } = mk(); const s = wb.addSheetRaw('Nomenclature');
    put(s, 'A1', 'Nomenclature et poids d\'échafaudage', TITLE); put(s, 'A2', 'MAG Formation 13 · exercice de préparation', { b: true, fc: ORANGE });
    put(s, 'A3', 'Poids unitaires, références et quantités : EXEMPLES À VÉRIFIER dans la notice et le catalogue du fabricant du matériel utilisé. Ce modèle ne remplace ni la notice de montage ni la note de calcul.', WARN); merge(s, 'A3:H4'); s.rowH[2] = 22; s.rowH[3] = 22;
    row(s, 'A6', ['Chantier :', '', 'Hauteur (m) :', 8, 'Longueur (m) :', 12.5], [{ b: true }, null, { b: true, ha: 'right' }, { bg: '#FFF3BF', nf: '0.0', ha: 'center' }, { b: true, ha: 'right' }, { bg: '#FFF3BF', nf: '0.0', ha: 'center' }]);
    row(s, 'A8', ['Famille', 'Élément', 'Dimension', 'Quantité', 'Poids unitaire (kg)', 'Poids total (kg)', 'Remarque'], H);
    const L = [['Pieds', 'Socle réglable', '0,60 m', 12, 3.5], ['Pieds', 'Montant / poteau', '2,00 m', 48, 9.5], ['Horizontaux', 'Lisse / moise', '2,50 m', 70, 8.4], ['Horizontaux', 'Traverse', '0,73 m', 40, 3.6], ['Planchers', 'Plancher acier', '2,50 × 0,32 m', 60, 17.5], ['Planchers', 'Plancher à trappe', '2,50 × 0,61 m', 5, 21], ['Protections', 'Garde-corps', '2,50 m', 40, 5], ['Protections', 'Plinthe', '2,50 m', 20, 4.8], ['Stabilité', 'Diagonale', '2,50 × 2,00 m', 12, 9], ['Ancrages', 'Tube d\'ancrage', '0,95 m', 10, 3.2], ['Accès', 'Échelle intérieure', '2,15 m', 4, 9.5]];
    L.forEach((x, i) => { const r = 9 + i; row(s, 'A' + r, [x[0], x[1], x[2], x[3], x[4]], [BOX, BOX, BOX, Object.assign({ ha: 'center' }, BOX), Object.assign({ nf: '0.0', ha: 'center', bg: '#FFF3BF' }, BOX)]); put(s, 'F' + r, { f: 'D' + r + '*E' + r }, Object.assign({ nf: '#,##0.0', ha: 'center' }, BOX)); put(s, 'G' + r, 'à vérifier', Object.assign({}, SUB, BOX)); });
    const last = 8 + L.length;
    row(s, 'A' + (last + 1), ['Total', null, null, { f: 'SUM(D9:D' + last + ')' }, null, { f: 'SUM(F9:F' + last + ')' }], { b: true, ha: 'center', nf: '#,##0.0', bt: { s: 'medium', c: DARK } });
    put(s, 'A' + (last + 3), 'Poids par famille', { b: true });
    ['Pieds', 'Horizontaux', 'Planchers', 'Protections', 'Stabilité', 'Ancrages', 'Accès'].forEach((fam, i) => { const r = last + 4 + i; put(s, 'A' + r, fam, BOX); put(s, 'B' + r, { f: 'SUMIFS($F$9:$F$' + last + ',$A$9:$A$' + last + ',A' + r + ')' }, Object.assign({ nf: '#,##0.0" kg"' }, BOX)); put(s, 'C' + r, { f: 'IFERROR(B' + r + '/$F$' + (last + 1) + ',0)' }, Object.assign({ nf: '0%' }, BOX)); });
    const fr = last + 4, lr = last + 10;
    put(s, 'E' + (last + 3), 'Ratios indicatifs', { b: true });
    row(s, 'E' + (last + 4), ['Surface de façade (m²)', { f: 'D6*F6' }], [null, { nf: '0.0' }]);
    row(s, 'E' + (last + 5), ['Poids par m² de façade (kg/m²)', { f: 'IFERROR(F' + (last + 1) + '/F' + (last + 4) + ',0)' }], [null, { nf: '0.0', b: true }]);
    row(s, 'E' + (last + 6), ['Poids total (t)', { f: 'F' + (last + 1) + '/1000' }], [null, { nf: '0.00', b: true }]);
    s.cf.push({ id: 'n1', type: 'dataBar', ranges: [TB.parseRange('F9:F' + last)], color: '#2C97D3', grad: true });
    s.objs.push({ id: 'n2', type: 'chart', from: { r: last + 2, c: 7, dx: 0, dy: 0 }, w: 380, h: 250, chart: { kind: 'pie', explicit: true, series: [{ name: 'Poids', values: 'Nomenclature!$B$' + fr + ':$B$' + lr, cats: 'Nomenclature!$A$' + fr + ':$A$' + lr }], title: 'Poids par famille', legend: 'right' } });
    widths(s, [14, 22, 15, 10, 14, 14, 12, 4]); s.freeze = { r: 8, c: 0 };
    s.print = { orient: 'portrait', fitW: 1, fitH: 1, titles: { rows: '8:8' } };
    return wb;
  };

  /* ---------------- vérifications d'équipements ---------------- */
  BUILD.verifications = () => {
    const { wb, put, row, widths, merge } = mk(); const s = wb.addSheetRaw('Vérifications');
    put(s, 'A1', 'Suivi des vérifications d\'équipements', TITLE);
    put(s, 'A2', 'Les périodicités sont des EXEMPLES À VÉRIFIER : appliquez celles de la réglementation en vigueur, des notices fabricants et de votre organisme de contrôle.', WARN); merge(s, 'A2:I3');
    row(s, 'A5', ['Équipement', 'N° de série', 'Type', 'Dernière vérification', 'Périodicité (mois)', 'Prochaine échéance', 'Jours restants', 'Statut', 'Vérificateur'], null);
    const L = [['Harnais n° 1', 'H-2023-014', 'EPI antichute', -350, 12], ['Harnais n° 2', 'H-2023-015', 'EPI antichute', -390, 12], ['Échafaudage roulant', 'ER-118', 'Échafaudage', -80, 3], ['Nacelle', 'N-45A', 'Engin de levage', -170, 6], ['Extincteur atelier', 'EX-07', 'Sécurité incendie', -300, 12], ['Palan électrique', 'P-12', 'Appareil de levage', -40, 12], ['Échelle 3 plans', 'E-3P-02', 'Accès', -200, 6]];
    L.forEach((x, i) => {
      const r = 6 + i;
      row(s, 'A' + r, [x[0], x[1], x[2], today() + x[3], x[4]], [null, null, null, { nf: 'dd/mm/yyyy' }, { ha: 'center' }]);
      put(s, 'F' + r, { f: 'EDATE([@[Dernière vérification]],[@[Périodicité (mois)]])' }, { nf: 'dd/mm/yyyy', b: true });
      put(s, 'G' + r, { f: '[@[Prochaine échéance]]-TODAY()' }, { nf: '0;[Red]-0', ha: 'center' });
      put(s, 'H' + r, { f: 'IF([@[Jours restants]]<0,"En retard",IF([@[Jours restants]]<=30,"À prévoir","À jour"))' }, { ha: 'center' });
      put(s, 'I' + r, 'Organisme ' + String.fromCharCode(65 + (i % 2)));
    });
    const last = 5 + L.length;
    s.tables.push({ name: 'Verifications', r1: 4, c1: 0, r2: last, c2: 8, header: true, totals: false, style: 'TableStyleLight8', bandRows: true, cols: ['Équipement', 'N° de série', 'Type', 'Dernière vérification', 'Périodicité (mois)', 'Prochaine échéance', 'Jours restants', 'Statut', 'Vérificateur'].map((n) => ({ name: n })), af: {} });
    s.cf.push({ id: 'v1', type: 'expr', f: '$G6<0', ranges: [TB.parseRange('A6:I' + last)], fmt: { bg: '#FFC7CE', fc: '#9C0006' }, stop: true });
    s.cf.push({ id: 'v2', type: 'expr', f: 'AND($G6>=0,$G6<=30)', ranges: [TB.parseRange('A6:I' + last)], fmt: { bg: '#FFEB9C', fc: '#9C5700' }, stop: true });
    s.cf.push({ id: 'v3', type: 'cellIs', op: 'eq', f1: '"À jour"', ranges: [TB.parseRange('H6:H' + last)], fmt: { bg: '#C6EFCE', fc: '#006100' } });
    s.dv.push({ type: 'whole', op: 'between', f1: '1', f2: '120', ranges: [TB.parseRange('E6:E500')], errMsg: 'Périodicité en mois (1 à 120).', msg: 'Nombre de mois entre deux vérifications (à vérifier).', msgTitle: 'Périodicité' });
    s.dv.push({ type: 'date', op: 'le', f1: 'TODAY()', ranges: [TB.parseRange('D6:D500')], errMsg: 'La date de vérification ne peut pas être dans le futur.', errStyle: 'warning' });
    row(s, 'K5', ['Statut', 'Nombre'], H);
    ['En retard', 'À prévoir', 'À jour'].forEach((x, i) => { const r = 6 + i; put(s, 'K' + r, x, BOX); put(s, 'L' + r, { f: 'COUNTIF(Verifications[Statut],K' + r + ')' }, Object.assign({ ha: 'center', b: true }, BOX)); });
    s.cf.push({ id: 'v4', type: 'cellIs', op: 'gt', f1: '0', ranges: [TB.parseRange('L6:L6')], fmt: { bg: '#FFC7CE', fc: '#9C0006' } });
    widths(s, [22, 14, 18, 14, 11, 14, 10, 12, 14, 2, 12, 9]); s.freeze = { r: 5, c: 1 };
    s.print = { orient: 'landscape', fitW: 1, fitH: 1 };
    return wb;
  };

  /* ---------------- aperçus ---------------- */
  const cache = {};
  T.preview = function (el, id) {
    try {
      if (!cache[id]) { const wb = T.build(id); cache[id] = TB.thumbnail(wb, 320, 240); }
      el.innerHTML = '<img src="' + cache[id] + '" alt="">';
    } catch (e) { console.warn(e); el.textContent = ''; }
  };
  void O;
})();
