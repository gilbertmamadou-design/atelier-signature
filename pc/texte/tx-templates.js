/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-texte/tx-templates.js : ne pas modifier ici. */
/* Texte — modèles : document vierge, lettre, CV, rapport, compte rendu de réunion, devis / facture, attestation de
   formation, convocation, procédure / mode opératoire, fiche de sécurité (charte MAG Formation 13 pour les documents
   de formation) ; pages de garde ; en-têtes et pieds prédéfinis ; aperçus. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, B = TX.B;
  const MAG = { name: 'MAG Formation 13', who: 'Gilbert Mamadou', tel: '07 49 42 63 12', mail: 'contact@magformation13.fr', web: 'magformation13.fr', addr: '4 rue des Lavandes, 13113 Lamanon', siret: '943 863 068 00012', nda: '93132386813', orange: '#EC7913', orangeTx: '#B65A05', orangeL: '#FDEBD9', blue: '#4BB3EF', blueD: '#2C97D3', blueL: '#E3F3FD', green: '#2E9E4F', greenL: '#E2F3E7', red: '#D7263D', redL: '#FBE3E6', grey: '#C9D1D9' };
  TX.MAG = MAG;
  const cm = TX.cm2pt;
  const t = B.t, p = B.p;
  const today = () => TX.fmtDate(Date.now(), 'd MMMM yyyy');
  const magSettings = { theme: { id: 'mag', fonts: { major: 'Exo', minor: 'Exo' } }, styleSet: 'mag' };
  const footerMag = () => B.part([p('PiedPage', [t(MAG.who + ' | ' + MAG.tel + ' | Formation travaux en hauteur / montage échafaudage / isolation', { sz: 8, c: '#5B6576' }), B.tab(), t('Page ', { sz: 8, c: '#5B6576' }), Object.assign(B.field('page'), {}), t(' / ', { sz: 8, c: '#5B6576' }), B.field('pages')], { tabs: [{ pos: 453, t: 'right' }], bd: { t: { s: 'single', w: 1.5, c: MAG.orange, sp: 4 } } })]);
  const headerMag = (right) => B.part([p('EnTete', [t('MAG', { b: 1, sz: 13 }), t(' Formation 13', { b: 1, sz: 13, c: MAG.orange }), B.tab(), t(right || '', { sz: 9, c: '#5B6576' })], { tabs: [{ pos: 453, t: 'right' }], bd: { b: { s: 'single', w: 0.75, c: MAG.grey, sp: 4 } } })]);
  const legalMag = () => [p('Normal', t('Organisme de formation ' + MAG.name + ' — ' + MAG.addr + ' — SIRET ' + MAG.siret, { sz: 7.5, c: '#5B6576' }), { al: 'center', sa: 0, sb: 0 }), p('Normal', t('Déclaration d\'activité enregistrée sous le n° ' + MAG.nda + ' auprès du préfet de région Provence-Alpes-Côte d\'Azur. Cet enregistrement ne vaut pas agrément de l\'État.', { sz: 7.5, c: '#5B6576' }), { al: 'center', sa: 0 })];
  function doc(content, opt) { opt = opt || {}; return TX.emptyDoc(Object.assign({ content }, opt)); }
  function section0(json, pg) { Object.assign(json.content[0].attrs.pg, pg); return json; }

  const T = TX.Templates = {};
  T.list = [
    { id: 'vide', name: 'Document vierge', desc: 'Page blanche, styles par défaut' },
    { id: 'lettre', name: 'Lettre', desc: 'Courrier avec expéditeur, destinataire, objet' },
    { id: 'attestation', name: 'Attestation de formation', desc: 'MAG Formation 13, champs de publipostage' },
    { id: 'convocation', name: 'Convocation à une formation', desc: 'Dates, lieu, horaires, EPI à prévoir' },
    { id: 'rapport', name: 'Rapport', desc: 'Page de garde, sommaire, titres numérotés' },
    { id: 'reunion', name: 'Compte rendu de réunion', desc: 'Participants, décisions, actions' },
    { id: 'devis', name: 'Devis / facture', desc: 'Lignes, totaux HT, TVA, TTC (formules)' },
    { id: 'procedure', name: 'Procédure / mode opératoire', desc: 'Cartouche, étapes, points de contrôle' },
    { id: 'securite', name: 'Fiche de sécurité', desc: 'Risques, EPI, Oui / Jamais, urgence' },
    { id: 'cv', name: 'Curriculum vitæ', desc: 'Profil, expériences, compétences' },
    { id: 'mag', name: 'Document MAG Formation 13', desc: 'Charte : Exo, orange et bleu' }
  ];
  const BUILD = {};
  BUILD.vide = () => doc([p('Normal', '')]);
  BUILD.mag = () => withDocMag((lists) => [p('Titre', 'Titre du document'), p('SousTitre', 'Sous-titre'), p('Titre1', 'Première partie'), p('Normal', 'Texte courant en Exo. Les titres reprennent le noir et l\'orange MAG, les sous-titres le bleu.'), p('Titre2', 'Points clés')].concat(B.list(lists, 'losanges', ['Ne jamais s\'exposer au vide', 'Vérifier avant d\'utiliser', 'Signaler toute anomalie'])), 'Document de formation');
  // B.list attend l'objet des listes du document : petit utilitaire pour les modèles
  function withLists(build) { const lists = {}; const content = build(lists); return { content, lists }; }
  function listsFix(j) { return j; }
  BUILD.lettre = (o) => {
    const me = o.author || 'Prénom Nom';
    return doc([
      p('SansInterligne', t(me, { b: 1 })), p('SansInterligne', 'Adresse'), p('SansInterligne', 'Code postal Ville'), p('SansInterligne', 'Téléphone · e-mail'),
      p('SansInterligne', '', { sb: 18 }), p('SansInterligne', t('Destinataire', { b: 1 }), { il: cm(9) }), p('SansInterligne', 'Service', { il: cm(9) }), p('SansInterligne', 'Adresse', { il: cm(9) }), p('SansInterligne', 'Code postal Ville', { il: cm(9) }),
      p('Normal', ['Lamanon, le ', B.field('date', { fmt: 'd MMMM yyyy' })], { il: cm(9), sb: 24, sa: 24 }),
      p('Normal', [t('Objet : ', { b: 1 }), 'objet de la lettre']), p('Normal', [t('Pièces jointes : ', { b: 1 }), '—'], { sa: 18 }),
      p('Normal', 'Madame, Monsieur,'), p('Normal', 'Corps de la lettre. Présentez en quelques phrases la raison de votre courrier, puis les détails utiles.', { al: 'justify' }), p('Normal', 'Second paragraphe : ce que vous attendez du destinataire, les dates ou délais à retenir.', { al: 'justify' }), p('Normal', 'Je vous prie d\'agréer, Madame, Monsieur, l\'expression de mes salutations distinguées.', { al: 'justify', sa: 30 }),
      p('Normal', me, { il: cm(9) }), p('Normal', t('Signature', { i: 1, c: '#7F7F7F' }), { il: cm(9) })
    ]);
  };
  BUILD.cv = (o) => withDoc((lists) => [
    p('Titre', o.author || 'Prénom NOM', { sa: 2 }), p('SousTitre', 'Intitulé du poste recherché'),
    p('Normal', ['📞 06 00 00 00 00   ·   ✉ adresse@exemple.fr   ·   Ville (13)'], { bd: { b: { s: 'single', w: 1.5, c: 't:accent1', sp: 4 } }, sa: 14 }),
    p('Titre1', 'Profil'), p('Normal', 'Trois ou quatre lignes qui résument votre parcours, vos points forts et ce que vous recherchez.', { al: 'justify' }),
    p('Titre1', 'Expérience professionnelle'),
    B.table([[[p('Normal', t('2021 – aujourd\'hui', { b: 1 }), { sa: 0 })], [p('Normal', t('Monteur d\'échafaudage — Entreprise', { b: 1 }), { sa: 0 }), p('Normal', 'Montage, démontage et vérification d\'échafaudages fixes et roulants (Layher, Plettac).', { sa: 6 })]], [[p('Normal', t('2016 – 2021', { b: 1 }), { sa: 0 })], [p('Normal', t('Calorifugeur — Entreprise', { b: 1 }), { sa: 0 }), p('Normal', 'Isolation thermique de réseaux et d\'équipements industriels.', { sa: 6 })]]], { ts: 'Aucun', widths: [110, 343] }),
    p('Titre1', 'Formation'), ...B.list(lists, 'puces', ['2024 — Formation monteur d\'échafaudage (R408)', '2015 — CAP / titre professionnel']),
    p('Titre1', 'Compétences'), ...B.list(lists, 'losanges', ['Lecture de plans et notices', 'Travail en hauteur, harnais', 'Gestes et postures', 'Permis B']),
    p('Titre1', 'Langues et centres d\'intérêt'), p('Normal', 'Anglais (notions) · Randonnée · Bricolage')
  ], { page: { mt: cm(1.8), mb: cm(1.8), ml: cm(2), mr: cm(2) } });
  function withDoc(build, opt) { const lists = {}; const content = build(lists); const j = doc(content, Object.assign({ lists }, opt || {})); return j; }
  BUILD.rapport = (o) => {
    const j = withDoc((lists) => {
      const L = TX.uid('L'); lists[L] = TX.LIST_KINDS.titres();
      const H = (lvl, txt) => p('Titre' + lvl, txt, { li: { id: L, l: lvl - 1 } });
      return T.COVERS[0].build({ title: o.title || 'Titre du rapport', subtitle: 'Sous-titre ou objet', author: o.author || 'Auteur', date: today() }).map((b) => Object.assign(b, { attrs: Object.assign({}, b.attrs, { ctx: 'cover' }) })).concat([B.pageBreak(), B.toc({ title: 'Sommaire', levels: 3 }), B.pageBreak(),
        H(1, 'Introduction'), p('Normal', 'Présentez le contexte, l\'objet du rapport et la démarche suivie.', { al: 'justify' }),
        H(1, 'Constats'), H(2, 'Premier constat'), p('Normal', 'Décrivez les faits observés. Les titres numérotés alimentent le sommaire et les signets du PDF.', { al: 'justify' }),
        H(2, 'Second constat'), p('Normal', 'Ajoutez tableaux, figures et notes de bas de page (Références).', { al: 'justify' }),
        H(1, 'Recommandations'), ...B.list(lists, 'num', ['Première recommandation', 'Deuxième recommandation', 'Troisième recommandation']),
        H(1, 'Conclusion'), p('Normal', 'Synthèse et suites à donner.', { al: 'justify' })]);
    });
    j.attrs.parts = { H: { doc: B.part([p('EnTete', [B.field('title'), B.tab(), B.tab(), B.field('date', { fmt: 'MMMM yyyy' })], { bd: { b: { s: 'single', w: 0.5, c: '#A6A6A6', sp: 3 } } })]) }, F: { doc: B.part([p('PiedPage', [B.tab(), 'Page ', B.field('page'), ' sur ', B.field('pages')])]) } };
    Object.assign(j.content[0].attrs.pg, { titlePg: true, hdr: { def: 'H', first: null, even: null }, ftr: { def: 'F', first: null, even: null } });
    j.attrs.props.title = o.title || 'Titre du rapport';
    return j;
  };
  BUILD.reunion = () => withDoc((lists) => [
    p('Titre', 'Compte rendu de réunion'),
    B.table([[[p('Normal', t('Date', { b: 1 }), { sa: 0 })], [p('Normal', [B.field('date', { fmt: 'dddd d MMMM yyyy' })], { sa: 0 })]], [[p('Normal', t('Lieu', { b: 1 }), { sa: 0 })], [p('Normal', '', { sa: 0 })]], [[p('Normal', t('Rédacteur', { b: 1 }), { sa: 0 })], [p('Normal', '', { sa: 0 })]], [[p('Normal', t('Objet', { b: 1 }), { sa: 0 })], [p('Normal', '', { sa: 0 })]]], { ts: 'GrilleClaire', widths: [110, 343] }),
    p('Titre1', 'Participants'), B.table([['Nom', 'Fonction / entreprise', 'Présent'], ['', '', '☐'], ['', '', '☐'], ['', '', '☐']], { ts: 'clair1', hdr: true, widths: [160, 213, 80] }),
    p('Titre1', 'Ordre du jour'), ...B.list(lists, 'num', ['Point 1', 'Point 2', 'Questions diverses']),
    p('Titre1', 'Échanges et décisions'), p('Normal', t('Point 1 — ', { b: 1 })), p('Normal', 'Résumé des échanges. Décision : …'),
    p('Titre1', 'Actions'), B.table([['Action', 'Responsable', 'Échéance', 'État'], ['', '', '', 'À faire'], ['', '', '', 'À faire']], { ts: 'moyen1', hdr: true, band: true, widths: [200, 100, 80, 73] }),
    p('Normal', [t('Prochaine réunion : ', { b: 1 }), '…'], { sb: 12 })
  ]);
  BUILD.devis = () => {
    const money = (s) => p('Normal', s, { al: 'right', sa: 0 });
    const j = withDoc(() => [
      B.table([[[p('Normal', t('VOTRE ENTREPRISE', { b: 1, sz: 14 }), { sa: 0 }), p('SansInterligne', 'Adresse'), p('SansInterligne', 'Code postal Ville'), p('SansInterligne', 'SIRET · TVA intracommunautaire')], [p('Normal', t('DEVIS', { b: 1, sz: 22, c: 't:accent1' }), { al: 'right', sa: 0 }), p('SansInterligne', 'N° D-2026-001', { al: 'right' }), p('SansInterligne', ['Date : ', B.field('date')], { al: 'right' }), p('SansInterligne', 'Validité : 30 jours', { al: 'right' })]]], { ts: 'Aucun', widths: [260, 193] }),
      p('Normal', '', { sa: 6 }),
      B.table([[[p('Normal', t('Client', { b: 1, c: 't:accent1' }), { sa: 0 }), p('SansInterligne', 'Nom du client'), p('SansInterligne', 'Adresse'), p('SansInterligne', 'Code postal Ville')]]], { ts: 'Aucun', widths: [453], al: 'right' }),
      p('Normal', [t('Objet : ', { b: 1 }), 'Formation montage d\'échafaudage'], { sb: 12 }),
      B.table([['Désignation', 'Qté', 'Prix unitaire HT', 'Total HT'], ['Formation monteur (5 jours, groupe de 8)', '1', '0,00', '0,00'], ['Frais de déplacement', '1', '0,00', '0,00'], ['', '', '', ''], [[p('Normal', '', { sa: 0 })], '', [p('Normal', t('Total HT', { b: 1 }), { al: 'right', sa: 0 })], [money('0,00')]], ['', '', [p('Normal', 'TVA (20 %)', { al: 'right', sa: 0 })], [money('0,00')]], ['', '', [p('Normal', t('Total TTC', { b: 1 }), { al: 'right', sa: 0 })], [money('0,00')]]], { ts: 'clair1', hdr: true, widths: [230, 45, 95, 83] }),
      p('Normal', t('Astuce : dans le tableau, placez le curseur dans une case « Total » puis Disposition › Formule (=SOMME(AU-DESSUS), =PRODUIT(B2;C2)…).', { i: 1, sz: 9, c: '#7F7F7F' }), { sb: 6 }),
      p('Titre2', 'Conditions'), p('Normal', 'Conditions de paiement : 30 % à la commande, solde à réception de la facture. Pénalités de retard : taux légal ; indemnité forfaitaire pour frais de recouvrement : 40 €.', { al: 'justify' }),
      p('Normal', 'Bon pour accord (date, signature et cachet) :', { sb: 18 }),
      B.table([[[p('Normal', '', { sa: 40 })]]], { ts: 'Grille', widths: [220] })
    ]);
    return j;
  };
  BUILD.attestation = () => {
    const j = doc([
      p('Titre', 'ATTESTATION DE FIN DE FORMATION', { al: 'center', sb: 18, sa: 4 }),
      p('SousTitre', 'Article L.6353-1 du Code du travail', { al: 'center', sa: 24 }),
      p('Normal', ['Je soussigné, ', t(MAG.who, { b: 1 }), ', responsable de l\'organisme de formation ', t(MAG.name, { b: 1 }), ', atteste que :'], { al: 'justify', sa: 14 }),
      p('Normal', [t('', {}), B.merge('Civilité'), ' ', B.merge('Prénom'), ' ', B.merge('Nom')], { al: 'center', sa: 2 }),
      p('Normal', ['salarié(e) de l\'entreprise ', B.merge('Entreprise')], { al: 'center', sa: 16 }),
      p('Normal', 'a suivi la formation :', { sa: 4 }),
      p('Titre2', [B.merge('Formation')], { al: 'center', sb: 4, sa: 12 }),
      B.table([[[p('Normal', t('Dates', { b: 1 }), { sa: 0 })], [p('Normal', ['du ', B.merge('Début'), ' au ', B.merge('Fin')], { sa: 0 })]], [[p('Normal', t('Durée', { b: 1 }), { sa: 0 })], [p('Normal', [B.merge('Durée'), ' heures'], { sa: 0 })]], [[p('Normal', t('Lieu', { b: 1 }), { sa: 0 })], [p('Normal', [B.merge('Lieu')], { sa: 0 })]], [[p('Normal', t('Nature de l\'action', { b: 1 }), { sa: 0 })], [p('Normal', 'Action d\'adaptation et de développement des compétences', { sa: 0 })]], [[p('Normal', t('Objectifs', { b: 1 }), { sa: 0 })], [p('Normal', 'Monter, démonter et vérifier un échafaudage en sécurité, conformément à la notice du fabricant et à la recommandation R408.', { sa: 0 })]], [[p('Normal', t('Évaluation', { b: 1 }), { sa: 0 })], [p('Normal', ['QCM final : ', B.merge('Résultat'), ' — mise en situation pratique : ', B.merge('Pratique')], { sa: 0 })]]], { ts: 'GrilleClaire', widths: [130, 323], cm: { t: 3, b: 3, l: 6, r: 6 } }),
      p('Normal', 'Résultat de l\'évaluation des acquis : ', { sb: 14, sa: 4 }),
      p('Normal', [t('☐ Objectifs atteints     ☐ Objectifs partiellement atteints     ☐ Objectifs non atteints', {})], { al: 'center', sa: 18 }),
      p('Normal', ['Fait à Lamanon, le ', B.field('date', { fmt: 'd MMMM yyyy' })], { il: cm(9), sa: 4 }),
      p('Normal', t('Pour ' + MAG.name + ', ' + MAG.who, { b: 1 }), { il: cm(9), sa: 4 }),
      p('Normal', t('Signature et cachet', { i: 1, c: '#7F7F7F' }), { il: cm(9), sa: 50 })
    ].concat(legalMag()), { settings: magSettings });
    j.attrs.parts = { H: { doc: headerMag('Attestation de formation') }, F: { doc: B.part([p('PiedPage', t(MAG.who + ' | ' + MAG.tel + ' | ' + MAG.mail + ' | ' + MAG.web, { sz: 8, c: '#5B6576' }), { al: 'center', bd: { t: { s: 'single', w: 1.5, c: MAG.orange, sp: 4 } } })]) } };
    Object.assign(j.content[0].attrs.pg, { hdr: { def: 'H', first: null, even: null }, ftr: { def: 'F', first: null, even: null } });
    j.attrs.settings.merge = T.sampleMerge();
    j.attrs.props.title = 'Attestation de formation';
    return j;
  };
  BUILD.convocation = () => withDocMag((lists) => [
    p('Normal', [B.merge('Entreprise')], { il: cm(9), sb: 6, sa: 0 }), p('Normal', ['À l\'attention de ', B.merge('Civilité'), ' ', B.merge('Prénom'), ' ', B.merge('Nom')], { il: cm(9), sa: 18 }),
    p('Normal', ['Lamanon, le ', B.field('date', { fmt: 'd MMMM yyyy' })], { il: cm(9), sa: 18 }),
    p('Titre1', 'Convocation à la formation'),
    p('Normal', [B.merge('Civilité'), ' ', B.merge('Nom'), ','], { sa: 8 }),
    p('Normal', ['Vous êtes inscrit(e) à la formation « ', t('', {}), B.merge('Formation'), ' » organisée par ' + MAG.name + '. Merci de vous présenter aux dates et lieu suivants :'], { al: 'justify' }),
    B.table([[[p('Normal', t('Dates', { b: 1 }), { sa: 0 })], [p('Normal', ['du ', B.merge('Début'), ' au ', B.merge('Fin')], { sa: 0 })]], [[p('Normal', t('Horaires', { b: 1 }), { sa: 0 })], [p('Normal', '8 h 30 – 12 h 00 / 13 h 00 – 16 h 30 (accueil à 8 h 15)', { sa: 0 })]], [[p('Normal', t('Lieu', { b: 1 }), { sa: 0 })], [p('Normal', [B.merge('Lieu')], { sa: 0 })]], [[p('Normal', t('Durée', { b: 1 }), { sa: 0 })], [p('Normal', [B.merge('Durée'), ' heures'], { sa: 0 })]], [[p('Normal', t('Formateur', { b: 1 }), { sa: 0 })], [p('Normal', MAG.who, { sa: 0 })]]], { ts: 'GrilleClaire', widths: [110, 343], cm: { t: 3, b: 3, l: 6, r: 6 } }),
    p('Titre2', 'À prévoir (équipements de protection individuelle)'),
    ...B.list(lists, 'losanges', ['Casque de chantier avec jugulaire', 'Chaussures de sécurité', 'Gants de manutention', 'Vêtements de travail adaptés à la météo', 'Harnais (fourni si besoin)', 'Pièce d\'identité']),
    p('Titre2', 'Programme'), p('Normal', 'Le programme détaillé est joint à cette convocation. Théorie le matin, pratique sur échafaudage Layher Allround / Plettac Metrix l\'après-midi.', { al: 'justify' }),
    p('Normal', ['Pour toute question ou empêchement, contactez ', t(MAG.who, { b: 1 }), ' au ', t(MAG.tel, { b: 1 }), ' ou par e-mail à ', t(MAG.mail, { link: 'mailto:' + MAG.mail }), '.'], { sb: 8, al: 'justify' }),
    p('Normal', 'Nous vous prions d\'agréer l\'expression de nos salutations distinguées.', { sb: 8, sa: 20 }),
    p('Normal', t(MAG.who, { b: 1 }), { il: cm(9) })
  ].concat([p('Normal', '', { sb: 30 })]).concat(legalMag()), 'Convocation', true);
  function withDocMag(build, right, merge) {
    const lists = {}; const content = build(lists);
    const j = doc(content, { lists, settings: magSettings });
    j.attrs.parts = { H: { doc: headerMag(right) }, F: { doc: footerMag() } };
    Object.assign(j.content[0].attrs.pg, { hdr: { def: 'H', first: null, even: null }, ftr: { def: 'F', first: null, even: null } });
    if (merge) j.attrs.settings.merge = T.sampleMerge();
    j.attrs.props.title = right;
    return j;
  }
  BUILD.procedure = () => withDocMag((lists) => {
    const L = TX.uid('L'); lists[L] = TX.LIST_KINDS.multi();
    const step = (txt, l) => p('ParagrapheListe', txt, { li: { id: L, l: l || 0 } });
    return [
      p('Titre', 'Mode opératoire', { sa: 2 }), p('SousTitre', 'Montage d\'un échafaudage de pied — Layher Allround'),
      B.table([[[p('Normal', t('Référence', { b: 1 }), { sa: 0 })], [p('Normal', 'MO-ECH-01', { sa: 0 })], [p('Normal', t('Version', { b: 1 }), { sa: 0 })], [p('Normal', '1.0', { sa: 0 })]], [[p('Normal', t('Rédigé par', { b: 1 }), { sa: 0 })], [p('Normal', MAG.who, { sa: 0 })], [p('Normal', t('Date', { b: 1 }), { sa: 0 })], [p('Normal', [B.field('date')], { sa: 0 })]], [[p('Normal', t('Vérifié par', { b: 1 }), { sa: 0 })], [p('Normal', '', { sa: 0 })], [p('Normal', t('Pages', { b: 1 }), { sa: 0 })], [p('Normal', [B.field('pages')], { sa: 0 })]]], { ts: 'GrilleClaire', widths: [80, 170, 70, 133] }),
      p('Titre1', 'Objet et domaine d\'application'), p('Normal', 'Décrire les opérations de montage, dans l\'ordre réel, du sol vers le haut. S\'applique à tout monteur formé (R408).', { al: 'justify' }),
      p('Titre1', 'Références'), ...B.list(lists, 'puces', [[t('[Notice]', { b: 1 }), ' Notice de montage et d\'utilisation du fabricant'], [t('[CNAM]', { b: 1 }), ' Recommandation R408'], [t('[Loi]', { b: 1 }), ' Code du travail, articles R4323-69 et suivants']]),
      p('Titre1', 'Équipements de protection'), ...B.list(lists, 'losanges', ['Casque à jugulaire', 'Harnais et longe double', 'Gants, chaussures de sécurité']),
      p('Titre1', 'Déroulement'), step('Préparer la zone : balisage, sol, réception des éléments'), step('Vérifier l\'état du matériel (pas de pièce déformée)', 1), step('Implanter les socles et les madriers de répartition'), step('Monter le premier niveau et le mettre de niveau'), step('Contrôler l\'aplomb et l\'équerrage', 1), step('Poser les planchers, garde-corps (lisse, sous-lisse, plinthe)'), step('Amarrer selon la notice'), step('Réceptionner et afficher le panneau de réception'),
      p('Titre1', 'Points de contrôle'), B.table([['Contrôle', 'Conforme', 'Remarque'], ['Appuis et calage', '☐ Oui  ☐ Non', ''], ['Planchers complets et verrouillés', '☐ Oui  ☐ Non', ''], ['Garde-corps en place', '☐ Oui  ☐ Non', ''], ['Amarrages', '☐ Oui  ☐ Non', '']], { ts: 'moyen1', hdr: true, band: true, widths: [200, 100, 153] }),
      p('Titre1', 'Historique des versions'), B.table([['Version', 'Date', 'Modification'], ['1.0', TX.fmtDate(Date.now()), 'Création']], { ts: 'clair6', hdr: true, widths: [60, 90, 303] })
    ];
  }, 'Procédure');
  BUILD.securite = () => withDocMag((lists) => [
    p('Titre', 'Fiche de sécurité', { sa: 2 }), p('SousTitre', 'Travaux en hauteur sur échafaudage'),
    p('Normal', [t('Fil rouge : ', { b: 1, c: MAG.orangeTx }), t('ne jamais s\'exposer au vide.', { b: 1 })], { sh: MAG.orangeL, bd: { l: { s: 'single', w: 3, c: MAG.orange, sp: 8 } }, sb: 6, sa: 12 }),
    p('Titre1', 'Risques et mesures de prévention'),
    B.table([['Risque', 'Mesure de prévention'], ['Chute de hauteur', 'Garde-corps complets ; harnais pendant le montage ; accès par l\'intérieur'], ['Chute d\'objets', 'Plinthes ; balisage au sol ; casque à jugulaire'], ['Effondrement', 'Appuis contrôlés ; amarrages selon la notice ; charge admissible respectée'], ['Électrique', 'Distance aux lignes ; consignation si nécessaire'], ['Météo', 'Arrêt si vent fort, orage, verglas']], { ts: 'moyen1', hdr: true, band: true, widths: [130, 323] }),
    p('Titre1', 'Équipements de protection obligatoires'), ...B.list(lists, 'coches', ['Casque avec jugulaire', 'Chaussures de sécurité', 'Gants', 'Harnais avec longe double (montage, démontage)']),
    p('Titre1', 'Bonnes et mauvaises pratiques'),
    B.table([[[p('Normal', t('OUI', { b: 1, c: MAG.green }), { al: 'center', sa: 0 })], [p('Normal', t('JAMAIS', { b: 1, c: MAG.red }), { al: 'center', sa: 0 })]], [[p('Normal', '✔ Vérifier l\'échafaudage avant chaque utilisation', { sa: 2 }), p('Normal', '✔ Fermer les trappes d\'accès', { sa: 2 }), p('Normal', '✔ Signaler toute anomalie', { sa: 0 })], [p('Normal', '✘ Retirer un garde-corps', { sa: 2 }), p('Normal', '✘ Monter sur les lisses', { sa: 2 }), p('Normal', '✘ Utiliser un échafaudage non réceptionné', { sa: 0 })]]].map((r, i) => r.map((c, k) => B.cell(c, { bg: i === 0 ? (k ? MAG.redL : MAG.greenL) : null }))), { ts: 'GrilleClaire', widths: [226, 227] }),
    p('Titre1', 'En cas d\'accident'), ...B.list(lists, 'num', ['Protéger : faire cesser le danger, baliser', 'Alerter : 15 (SAMU), 18 (pompiers), 112 (urgence européenne)', 'Secourir : sauveteur secouriste du travail ; ne pas déplacer la victime']),
    p('Normal', [t('Numéros d\'urgence : ', { b: 1 }), '15 · 18 · 112 · 114 (par SMS)'], { sh: MAG.redL, al: 'center', sb: 10 })
  ], 'Fiche de sécurité');
  /** Liste d'exemple pour le publipostage (stagiaires) */
  T.sampleMerge = () => ({ name: 'stagiaires (exemple)', cols: ['Civilité', 'Prénom', 'Nom', 'Entreprise', 'Formation', 'Début', 'Fin', 'Durée', 'Lieu', 'Résultat', 'Pratique'], rows: [
    { 'Civilité': 'Monsieur', 'Prénom': 'Karim', 'Nom': 'BENALI', 'Entreprise': 'Échafaudages du Sud', 'Formation': 'F4 — Monteur d\'échafaudage', 'Début': '3 novembre 2026', 'Fin': '7 novembre 2026', 'Durée': '35', 'Lieu': 'Lamanon (13)', 'Résultat': '85 %', 'Pratique': 'réussie' },
    { 'Civilité': 'Madame', 'Prénom': 'Julie', 'Nom': 'MARTIN', 'Entreprise': 'Isolation Provence', 'Formation': 'F4 — Monteur d\'échafaudage', 'Début': '3 novembre 2026', 'Fin': '7 novembre 2026', 'Durée': '35', 'Lieu': 'Lamanon (13)', 'Résultat': '92 %', 'Pratique': 'réussie' },
    { 'Civilité': 'Monsieur', 'Prénom': 'Lucas', 'Nom': 'ROUX', 'Entreprise': 'Calorifuge Méditerranée', 'Formation': 'F4 — Monteur d\'échafaudage', 'Début': '3 novembre 2026', 'Fin': '7 novembre 2026', 'Durée': '35', 'Lieu': 'Lamanon (13)', 'Résultat': '78 %', 'Pratique': 'réussie' }
  ] });
  T.build = function (id, o) {
    o = o || {};
    o.author = o.author || TX.userName();
    const f = BUILD[id] || BUILD.vide;
    const json = IOup(f(o));
    if (o.author) json.attrs.props.author = o.author;
    json.attrs.props.created = Date.now();
    return { json, media: {}, info: {} };
  };
  const IOup = (j) => TX.IO.upgrade(j);

  /* ---------------- pages de garde ---------------- */
  T.COVERS = [
    { id: 'sobre', name: 'Sobre', build: (o) => [p('Normal', '', { sb: 160 }), p('Titre', o.title, { al: 'left', sa: 8, bd: { b: { s: 'single', w: 2.25, c: 't:accent1', sp: 6 } } }), p('SousTitre', o.subtitle || 'Sous-titre', { sa: 120 }), p('Normal', t(o.author || 'Auteur', { b: 1 }), { sa: 0 }), p('Normal', o.date, { sa: 0 })] },
    { id: 'bandeau', name: 'Bandeau de couleur', build: (o) => [p('Normal', '', { sb: 120 }), B.table([[B.cell([p('Titre', t(o.title, { c: 't:bg1' }), { al: 'center', sb: 30, sa: 6 }), p('SousTitre', t(o.subtitle || 'Sous-titre', { c: 't:bg1' }), { al: 'center', sa: 30 })], { bg: 't:accent1' })]], { ts: 'Aucun', widths: [453] }), p('Normal', '', { sb: 160 }), p('Normal', t(o.author || 'Auteur', { b: 1 }), { al: 'center', sa: 0 }), p('Normal', o.date, { al: 'center' })] },
    { id: 'moderne', name: 'Moderne', build: (o) => [p('Normal', t(o.date, { c: 't:accent1', b: 1 }), { sb: 40, al: 'right' }), p('Normal', '', { sb: 200 }), p('Titre', t(o.title, { sz: 40, b: 1 }), { sa: 6 }), p('SousTitre', t(o.subtitle || 'Sous-titre', { c: 't:accent1' }), { sa: 40, bd: { l: { s: 'single', w: 6, c: 't:accent1', sp: 10 } } }), p('Normal', '', { sb: 120 }), p('Normal', t(o.author || 'Auteur', { b: 1, caps: 1, sp: 1 }), { al: 'right' })] },
    { id: 'mag', name: 'MAG Formation 13', build: (o) => [p('Normal', [t('MAG', { b: 1, sz: 30, f: 'Exo' }), t(' Formation 13', { b: 1, sz: 30, f: 'Exo', c: MAG.orange })], { sb: 30, sa: 0 }), p('Normal', t('Formation travaux en hauteur · montage échafaudage · isolation', { f: 'Exo', c: '#5B6576' }), { sa: 0 }), p('Normal', '', { sb: 160 }), p('Normal', t('◆ ', { c: MAG.orange, sz: 20 }), { sa: 0 }), p('Titre', t(o.title, { f: 'Exo', b: 1 }), { sa: 6, bd: { b: { s: 'single', w: 3, c: MAG.orange, sp: 6 } } }), p('SousTitre', t(o.subtitle || 'Dossier pédagogique', { f: 'Exo', c: MAG.blueD }), { sa: 140 }), p('Normal', t(MAG.who + ' · ' + MAG.tel, { f: 'Exo', b: 1 }), { sa: 0 }), p('Normal', t(MAG.mail + ' · ' + MAG.web, { f: 'Exo', c: '#5B6576' }), { sa: 0 }), p('Normal', t(o.date, { f: 'Exo' }))] }
  ];
  /* ---------------- en-têtes / pieds prédéfinis ---------------- */
  const tabs3 = [{ pos: 226.8, t: 'center' }, { pos: 453.5, t: 'right' }];
  T.PARTS = [
    { id: 'h-vide', kind: 'hdr', name: 'Vide', build: () => [p('EnTete', '')] },
    { id: 'h-3', kind: 'hdr', name: 'Trois colonnes (titre, date)', build: (o) => [p('EnTete', [o.title || 'Titre', B.tab(), '', B.tab(), B.field('date')], { tabs: tabs3 })] },
    { id: 'h-titre', kind: 'hdr', name: 'Titre du document, filet', build: () => [p('EnTete', [B.field('title')], { al: 'right', bd: { b: { s: 'single', w: 0.75, c: 't:accent1', sp: 3 } } })] },
    { id: 'h-mag', kind: 'hdr', name: 'MAG Formation 13', build: (o) => headerMag(o.title || '').content[0].content },
    { id: 'f-num', kind: 'ftr', name: 'Numéro de page centré', build: () => [p('PiedPage', [B.field('page')], { al: 'center' })] },
    { id: 'f-xy', kind: 'ftr', name: 'Page X sur Y à droite', build: () => [p('PiedPage', ['Page ', B.field('page'), ' sur ', B.field('pages')], { al: 'right' })] },
    { id: 'f-3', kind: 'ftr', name: 'Trois colonnes (auteur, page, date)', build: (o) => [p('PiedPage', [o.author || '', B.tab(), B.field('page'), B.tab(), B.field('date')], { tabs: tabs3, bd: { t: { s: 'single', w: 0.5, c: '#A6A6A6', sp: 3 } } })] },
    { id: 'f-mag', kind: 'ftr', name: 'MAG Formation 13 (coordonnées, pages)', build: () => footerMag().content[0].content }
  ];

  /* ---------------- aperçus (coulisses) ---------------- */
  const cache = {};
  /** Rendu statique d'un document (première page) : styles propres, étiquettes de listes */
  TX.renderDocStatic = function (json, scope, opt) {
    opt = opt || {};
    const node = TX.schema.nodeFromJSON(json), num = TX.computeNumbers(node, json.attrs), theme = TX.themeOf(json.attrs.settings);
    let st = document.getElementById('st-' + scope); if (!st) { st = document.createElement('style'); st.id = 'st-' + scope; document.head.appendChild(st); }
    st.textContent = TX.styleSheet(json.attrs, '.' + scope);
    const ctx = { props: () => json.attrs.props || {}, attrs: () => json.attrs, chartDoc: () => ({ theme }), noteLabel: () => '1', fileName: () => '', seqAt: (pos) => num.seqPos[pos] || 1, mergeRecord: () => opt.record || null, pageLabel: () => '1', pageCount: () => 1, tocEntries: () => [] };
    const pg = TX.pg(node.firstChild);
    const page = O.h('div', { cls: 'tx-doc tx-pagemode tx-print ' + scope, style: { width: pg.w * TX.PX + 'px', minHeight: pg.h * TX.PX + 'px', background: '#fff', position: 'relative', boxSizing: 'border-box', padding: pg.mt * TX.PX + 'px ' + pg.mr * TX.PX + 'px 0 ' + pg.ml * TX.PX + 'px' } });
    page.setAttribute('style', page.getAttribute('style') + ';' + O.Themes.varsCss(theme));
    const body = document.createElement('div'); body.appendChild(TX.DOMSerializer.serializeFragment(node.firstChild.content)); TX.fillStatic(body, ctx, { label: '1', total: 1, secPages: 1 });
    const ps = body.querySelectorAll('p'); let k = 0;
    node.firstChild.descendants((n, pos) => { if (n.type.name === 'paragraph') { const pEl = ps[k++]; const l = num.labels.find((x) => x.pos === pos + 1); if (pEl && l) { pEl.insertAdjacentHTML('afterbegin', '<span class="tx-lbl' + (l.tab ? ' tab' : '') + '" style="--hang:' + l.hg + 'pt">' + O.esc(l.label) + '</span>'); pEl.style.marginLeft = (n.attrs.il != null ? n.attrs.il : l.il) + 'pt'; pEl.style.textIndent = (n.attrs.fi != null ? n.attrs.fi : -l.hg) + 'pt'; } } return true; });
    body.querySelectorAll('.tx-toc').forEach((tc) => { tc.innerHTML = '<p data-s="TitreTM">Sommaire</p>' + num.heads.slice(0, 8).map((h) => '<p data-s="TM' + h.level + '" class="tx-toc-e"><span class="tx-toc-t">' + O.esc((h.label ? h.label + ' ' : '') + h.text) + '</span><span class="tx-toc-l dot"></span><span class="tx-toc-n">2</span></p>').join(''); });
    page.appendChild(body);
    return page;
  };
  T.preview = function (host, id) {
    try {
      const j = cache[id] || (cache[id] = T.build(id, { author: '' }).json);
      const scope = 'tp-' + id;
      const page = TX.renderDocStatic(j, scope, { record: j.attrs.settings && j.attrs.settings.merge ? j.attrs.settings.merge.rows[0] : null });
      const wrap = O.h('div', { cls: 'tp' }); wrap.appendChild(page);
      host.appendChild(wrap);
      requestAnimationFrame(() => { const k = host.clientWidth / (page.offsetWidth || 794); wrap.style.transform = 'scale(' + k + ')'; TX.layoutTabs(page, j.attrs, k); });
    } catch (e) { console.warn('aperçu', id, e); }
  };
})();
