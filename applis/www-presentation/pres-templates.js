/* Présentation — modèles de départ (construits par programme : aucun fichier ni téléchargement).
   Pres.TEMPLATES : [{id, name, desc, theme, build(doc)}] ; Pres.fromTemplate(id) → doc */
(function () {
  'use strict';
  const O = window.Office, P = window.Pres, RT = O.RichText;
  const esc = O.esc;
  const list = (lines, ordered) => RT.listFromLines(lines, ordered);
  const paras = (lines) => lines.map((l) => '<div>' + esc(l) + '</div>').join('');
  /** Petit constructeur de diapositives */
  function B(doc) {
    const W = doc.size.w, H = doc.size.h;
    const api = {
      W, H,
      slide(layout, o) {
        o = o || {};
        const s = P.newSlide(doc, layout);
        s.elements.forEach((e) => {
          if (P.isTitlePh(e.ph) && o.title != null) e.html = '<div>' + esc(o.title) + '</div>';
          else if ((e.ph === 'subtitle' || e.ph === 'stext' || e.ph === 'author') && o.subtitle != null) e.html = paras([].concat(o.subtitle));
          else if (e.ph === 'body' && o.body) e.html = Array.isArray(o.body) ? list(o.body, o.ordered) : o.body;
          else if (e.ph === 'body2' && o.body2) e.html = Array.isArray(o.body2) ? list(o.body2, o.ordered2) : o.body2;
          else if (e.ph === 'head1' && o.head1) e.html = '<div>' + esc(o.head1) + '</div>';
          else if (e.ph === 'head2' && o.head2) e.html = '<div>' + esc(o.head2) + '</div>';
          else if (e.ph === 'caption' && o.caption) e.html = paras([].concat(o.caption));
          else if (e.ph === 'quote' && o.quote) e.html = '<div>' + esc(o.quote) + '</div>';
          else if (e.ph === 'number' && o.number) e.html = '<div>' + esc(o.number) + '</div>';
        });
        if (o.notes) s.notes = RT.fromText(o.notes);
        if (o.transition) s.transition = Object.assign({ dur: 0.7, dir: 'l' }, { type: o.transition });
        if (o.keep) s.elements = s.elements.filter((e) => o.keep.indexOf(e.ph) >= 0 || !e.ph);
        doc.slides.push(s);
        return s;
      },
      add(s, e) { s.elements.push(e); return e; },
      text(s, x, y, w, h, html, extra) { return api.add(s, P.textEl(x, y, w, h, html, Object.assign({ autofit: 'none' }, extra || {}))); },
      shape(s, shape, x, y, w, h, extra) { return api.add(s, P.shapeEl(shape, x, y, w, h, extra || {})); },
      icon(s, name, x, y, size, color, extra) { return api.add(s, Object.assign({ id: P.uid(), type: 'icon', icon: name, x, y, w: size, h: size, rot: 0, color: color || 't:accent1', sw: 2, alt: extra && extra.alt || name }, extra || {})); },
      anim(s, el, fx, start, extra) { s.anims.push(Object.assign({ id: P.uid('a'), el: el.id, cat: /Out$|disappear/.test(fx) ? 'out' : /pulse|spin|grow|teeter|blink/.test(fx) ? 'em' : 'in', fx, start: start || 'click', delay: 0, dur: 0.5 }, extra || {})); },
      animBody(s, fx) { const b = s.elements.find((e) => e.ph === 'body'); if (b) api.anim(s, b, fx || 'fade'); },
      section(name, s) { doc.sections.push({ id: P.uid('sec'), name, at: s.id }); },
      span(t, st) { return '<span style="' + st + '">' + esc(t) + '</span>'; }
    };
    return api;
  }
  const date = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  P.TEMPLATES = [
    { id: 'vide', name: 'Présentation vierge', desc: 'Une diapositive de titre, thème clair', theme: 'clair', build(doc) { B(doc).slide('title', {}); } },
    { id: 'chantier', name: 'Formation / sécurité chantier', desc: 'Échafaudage et calorifuge : risques, EPI, vérifications, oui / jamais, quiz', theme: 'mag', build(doc) {
      const b = B(doc), W = b.W, H = b.H, M = W * 0.06;
      doc.title = 'Sécurité sur chantier : échafaudage et calorifuge';
      doc.master.footer = { show: true, text: 'Gilbert Mamadou | 07 49 42 63 12 | Formation travaux en hauteur / montage échafaudage / isolation' };
      doc.master.number.show = true;
      let s = b.slide('title', { title: 'Sécurité sur chantier : échafaudage et calorifuge', subtitle: ['MAG Formation 13', date()], transition: 'fade', notes: 'Durée : 3 min.\nAccueil des stagiaires, tour de table (nom, poste, expérience en hauteur).\nRappeler le fil rouge de la journée : ne jamais s\'exposer au vide.' });
      s = b.slide('titleContent', { title: 'À l\'issue de la formation, vous saurez…', body: ['Identifier les risques de chute et de chute d\'objets', 'Vérifier un échafaudage avant chaque utilisation', 'Choisir et porter les EPI adaptés', 'Appliquer les règles de montage (R408, notice du fabricant)', 'Manipuler les isolants et les tôles en sécurité', 'Réagir et alerter en cas d\'incident'], transition: 'push', notes: 'Durée : 4 min.\nLire les 6 objectifs à voix haute. Faire reformuler un objectif par un stagiaire.\n[Péda] Objectifs formulés avec des verbes d\'action.' });
      b.animBody(s, 'float');
      s = b.slide('section', { title: '01 · Les risques', subtitle: 'Repérer avant d\'agir', transition: 'fade', notes: 'Durée : 1 min. Transition vers la partie théorique.' });
      b.section('Les risques', s);
      s = b.slide('titleOnly', { title: 'Les principaux risques sur le chantier', transition: 'push', notes: 'Durée : 8 min.\nPour chaque bloc, demander un exemple vécu sur chantier.\n[CNAM] Recommandation R408 : prévention des risques liés au montage et à l\'utilisation des échafaudages.' });
      const sa = b.add(s, { id: P.uid(), type: 'smartart', kind: 'blocks', palette: 'colorful', x: M, y: H * 0.26, w: W - 2 * M, h: H * 0.6, rot: 0, alt: 'Six risques : chute de hauteur, chute d\'objets, effondrement, coupures, brûlures, troubles musculo-squelettiques', items: [{ text: 'Chute de hauteur', level: 0 }, { text: 'Chute d\'objets', level: 0 }, { text: 'Effondrement de la structure', level: 0 }, { text: 'Coupures (tôles, feuillards)', level: 0 }, { text: 'Brûlures (tuyauteries chaudes)', level: 0 }, { text: 'Gestes et postures (TMS)', level: 0 }] });
      b.anim(s, sa, 'zoom');
      s = b.slide('titleOnly', { title: 'Les EPI obligatoires', transition: 'push', notes: 'Durée : 6 min.\nFaire manipuler chaque EPI. Vérifier l\'état du harnais (sangles, coutures, date de contrôle).' });
      const epi = [['hard-hat', 'Casque avec jugulaire'], ['glasses', 'Lunettes de protection'], ['hand', 'Gants anti-coupure'], ['footprints', 'Chaussures de sécurité'], ['shield-check', 'Harnais (si nécessaire)'], ['wind', 'Masque FFP2 (fibres)']];
      epi.forEach((x, k) => { const col = k % 3, row = Math.floor(k / 3); const cx = M + col * (W - 2 * M) / 3, cy = H * 0.27 + row * H * 0.3; const ic = b.icon(s, x[0], cx + 10, cy, 86, k % 2 ? 't:accent2' : 't:accent1', { alt: x[1] }); b.text(s, cx + 110, cy + 18, (W - 2 * M) / 3 - 120, 60, '<div><span style="font-size:22pt;font-weight:700">' + esc(x[1]) + '</span></div>'); b.anim(s, ic, 'zoom', k ? 'after' : 'click', { dur: 0.35 }); });
      s = b.slide('section', { title: '02 · Vérifier l\'échafaudage', subtitle: 'Du sol vers le haut, avant chaque utilisation', transition: 'fade', notes: 'Durée : 1 min.' });
      b.section('Vérifications', s);
      s = b.slide('titleOnly', { title: 'Vérification journalière : du sol vers le haut', transition: 'push', notes: 'Durée : 12 min.\nSuivre l\'ordre réel de la vérification, du sol vers le haut.\n[Notice] Se référer à la notice du fabricant (Layher Allround, Plettac Metrix).\nSi un point est non conforme : interdire l\'accès (panneau rouge) et prévenir le responsable.' });
      const steps = ['Appuis, socles et calage', 'Stabilité et amarrages', 'Planchers complets et verrouillés', 'Garde-corps : lisse, sous-lisse, plinthe', 'Accès sûrs (échelles, trappes)', 'Panneau de réception visible'];
      b.add(s, { id: P.uid(), type: 'smartart', kind: 'steps', palette: 'accent', x: M, y: H * 0.24, w: W - 2 * M, h: H * 0.64, rot: 0, alt: 'Six étapes de vérification', items: steps.map((t) => ({ text: t, level: 0 })) });
      s = b.slide('comparison', { title: 'Oui / Jamais', head1: 'OUI', head2: 'JAMAIS', body: ['Vérifier avant chaque utilisation', 'Monter et descendre par l\'intérieur', 'Garder les planchers dégagés', 'Signaler toute anomalie'], body2: ['Monter sur les garde-corps', 'Retirer un élément sans autorisation', 'Utiliser un échafaudage non réceptionné', 'Jeter des matériaux depuis la hauteur'], transition: 'push', notes: 'Durée : 6 min.\nColonnes vertes et rouges : réservées au sens conforme / interdit.\nDemander aux stagiaires de compléter chaque colonne avec une situation vécue.' });
      s.elements.forEach((e) => { if (e.ph === 'head1') { e.html = '<div><span style="color:#2E9E4F;font-weight:700">' + esc('OUI') + '</span></div>'; } if (e.ph === 'head2') { e.html = '<div><span style="color:#D7263D;font-weight:700">JAMAIS</span></div>'; } });
      const h1 = s.elements.find((e) => e.ph === 'body'), h2 = s.elements.find((e) => e.ph === 'body2');
      if (h1) { h1.fill = { type: 'solid', color: '#E2F3E7' }; h1.line = { color: '#2E9E4F', w: 1.5 }; }
      if (h2) { h2.fill = { type: 'solid', color: '#FBE3E6' }; h2.line = { color: '#D7263D', w: 1.5 }; }
      s = b.slide('section', { title: '03 · Calorifuge', subtitle: 'Isolation des tuyauteries et équipements', transition: 'fade', notes: 'Durée : 1 min.' });
      b.section('Calorifuge', s);
      s = b.slide('titleOnly', { title: 'Calorifuge : risques et prévention', transition: 'push', notes: 'Durée : 10 min.\nMontrer des chutes de tôle et un échantillon de laine minérale (avec EPI).\n[Loi] Code du travail : évaluation des risques et équipements de protection.' });
      const rows = [['Tâche', 'Risque', 'Prévention'], ['Découpe et pose des tôles', 'Coupures', 'Gants anti-coupure, ébavurer les bords'], ['Pose de laine minérale', 'Irritation (peau, yeux, voies respiratoires)', 'Manches longues, lunettes, masque FFP2'], ['Travail sur tuyauterie chaude', 'Brûlures', 'Consignation, contrôle de la température'], ['Travail en hauteur', 'Chute', 'Échafaudage réceptionné, garde-corps complets']];
      const tw = W - 2 * M;
      b.add(s, { id: P.uid(), type: 'table', x: M, y: H * 0.25, w: tw, h: rows.length * 62, rot: 0, cols: [tw * 0.3, tw * 0.3, tw * 0.4], rows: rows.map((r) => ({ h: 62, cells: r.map((c) => ({ html: '<div>' + esc(c) + '</div>' })) })), tstyle: { id: 'medium', accent: 1, header: true, banded: true }, fontSize: 16 });
      s = b.slide('titleOnly', { title: 'Relevé des presque-accidents du site', transition: 'push', notes: 'Durée : 5 min.\nDONNÉES D\'EXEMPLE à remplacer par le relevé réel du site (onglet Graphique › Modifier les données).\nObjectif : montrer que la majorité des presque-accidents concernent la hauteur.' });
      const ch = P.newChart('bar'); ch.title = 'Exemple : presque-accidents par type (à compléter)'; ch.cats = ['Chute de hauteur', 'Chute d\'objets', 'Coupures', 'Brûlures']; ch.series = [{ name: 'Année N-1', values: [6, 4, 3, 1] }, { name: 'Année N', values: [3, 3, 2, 1] }];
      const che = b.add(s, { id: P.uid(), type: 'chart', x: M, y: H * 0.24, w: W - 2 * M, h: H * 0.64, rot: 0, chart: ch, alt: 'Graphique d\'exemple : presque-accidents par type, deux années' });
      b.anim(s, che, 'wipe', 'click', { dir: 'b', dur: 0.8 });
      s = b.slide('titleContent', { title: 'Quiz : vrai ou faux ?', body: ['On peut monter sur le garde-corps pour atteindre un point haut.', 'Un échafaudage sans panneau vert ne doit pas être utilisé.', 'La laine minérale se manipule sans gants.', 'On vérifie l\'échafaudage du sol vers le haut.'], ordered: true, transition: 'push', notes: 'Durée : 8 min.\nRéponses : 1 FAUX (jamais) · 2 VRAI · 3 FAUX (gants, manches longues, FFP2) · 4 VRAI.\nSeuil de réussite du QCM final : 75 %.' });
      b.animBody(s, 'fade');
      s = b.slide('quote', { quote: 'Ne jamais s\'exposer au vide.', subtitle: '— Fil rouge de la formation', transition: 'zoom', notes: 'Durée : 2 min.\nConclure, recueillir les questions, distribuer l\'évaluation à chaud.' });
      s.elements.forEach((e) => { if (e.ph === 'author') e.html = '<div>— Fil rouge de la formation</div>'; });
    } },
    { id: 'formation', name: 'Formation', desc: 'Objectifs, programme, contenu, exercice, évaluation', theme: 'ocean', build(doc) {
      const b = B(doc);
      b.slide('title', { title: 'Titre de la formation', subtitle: ['Formateur · ' + date()], transition: 'fade', notes: 'Accueil et présentation du formateur.' });
      let s = b.slide('titleContent', { title: 'Objectifs', body: ['Comprendre…', 'Savoir faire…', 'Être capable de…'], transition: 'push' }); b.animBody(s, 'fade');
      s = b.slide('titleOnly', { title: 'Programme de la journée' });
      b.add(s, { id: P.uid(), type: 'smartart', kind: 'timeline', palette: 'colorful', x: b.W * 0.06, y: b.H * 0.25, w: b.W * 0.88, h: b.H * 0.6, rot: 0, alt: 'Programme', items: [{ text: '9 h · Accueil', level: 0 }, { text: '9 h 30 · Théorie', level: 0 }, { text: '11 h · Pratique', level: 0 }, { text: '14 h · Mise en situation', level: 0 }, { text: '16 h 30 · Évaluation', level: 0 }] });
      b.slide('twoContent', { title: 'Notions clés', body: ['Définition', 'Exemple'], body2: ['À retenir', 'Point de vigilance'] });
      b.slide('titleContent', { title: 'Exercice pratique', body: ['Consigne', 'Durée : 20 minutes', 'Matériel nécessaire'], ordered: true });
      b.slide('titleContent', { title: 'Évaluation', body: ['QCM de fin de formation', 'Évaluation à chaud', 'Questions / réponses'] });
      b.slide('section', { title: 'Merci de votre attention', subtitle: 'Contact : …' });
    } },
    { id: 'rapport', name: 'Rapport', desc: 'Synthèse, chiffres, tableau, graphique, recommandations', theme: 'papier', build(doc) {
      const b = B(doc), M = b.W * 0.06;
      b.slide('title', { title: 'Rapport d\'activité', subtitle: ['Période · ' + date()] });
      b.slide('titleContent', { title: 'Synthèse', body: ['Fait marquant 1', 'Fait marquant 2', 'Fait marquant 3'] });
      let s = b.slide('titleOnly', { title: 'Indicateurs' });
      const ch = P.newChart('line'); ch.title = 'Évolution mensuelle'; ch.cats = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin']; ch.series = [{ name: 'Réalisé', values: [12, 15, 14, 18, 21, 24] }, { name: 'Objectif', values: [14, 15, 16, 17, 18, 19] }];
      b.add(s, { id: P.uid(), type: 'chart', x: M, y: b.H * 0.24, w: b.W - 2 * M, h: b.H * 0.64, rot: 0, chart: ch, alt: 'Évolution mensuelle du réalisé et de l\'objectif' });
      s = b.slide('titleOnly', { title: 'Détail par poste' });
      const rows = [['Poste', 'Budget', 'Réalisé', 'Écart'], ['Personnel', '120 k€', '118 k€', '−2 %'], ['Matériel', '45 k€', '51 k€', '+13 %'], ['Formation', '12 k€', '10 k€', '−17 %']];
      const tw = b.W - 2 * M;
      b.add(s, { id: P.uid(), type: 'table', x: M, y: b.H * 0.26, w: tw, h: rows.length * 54, rot: 0, cols: [tw * 0.4, tw * 0.2, tw * 0.2, tw * 0.2], rows: rows.map((r) => ({ h: 54, cells: r.map((c) => ({ html: '<div>' + esc(c) + '</div>' })) })), tstyle: { id: 'light', accent: 1, header: true, banded: true } });
      b.slide('titleContent', { title: 'Recommandations', body: ['Action prioritaire', 'Action à moyen terme', 'Point de suivi'], ordered: true });
    } },
    { id: 'projet', name: 'Projet', desc: 'Contexte, objectifs, planning, risques, prochaines étapes', theme: 'clair', build(doc) {
      const b = B(doc), M = b.W * 0.06;
      b.slide('title', { title: 'Nom du projet', subtitle: ['Point d\'avancement · ' + date()] });
      b.slide('twoContent', { title: 'Contexte et objectifs', body: ['Besoin', 'Périmètre', 'Contraintes'], body2: ['Objectif 1', 'Objectif 2', 'Indicateur de réussite'] });
      let s = b.slide('titleOnly', { title: 'Planning' });
      b.add(s, { id: P.uid(), type: 'smartart', kind: 'chevron', palette: 'gradient', x: M, y: b.H * 0.35, w: b.W - 2 * M, h: b.H * 0.3, rot: 0, alt: 'Phases du projet', items: ['Cadrage', 'Conception', 'Réalisation', 'Recette', 'Déploiement'].map((t) => ({ text: t, level: 0 })) });
      s = b.slide('titleOnly', { title: 'Risques' });
      const rows = [['Risque', 'Probabilité', 'Impact', 'Parade'], ['Retard fournisseur', 'Moyenne', 'Fort', 'Second fournisseur'], ['Budget dépassé', 'Faible', 'Fort', 'Suivi mensuel'], ['Disponibilité équipe', 'Moyenne', 'Moyen', 'Planning partagé']];
      const tw = b.W - 2 * M;
      b.add(s, { id: P.uid(), type: 'table', x: M, y: b.H * 0.26, w: tw, h: rows.length * 54, rot: 0, cols: [tw * 0.34, tw * 0.18, tw * 0.18, tw * 0.3], rows: rows.map((r) => ({ h: 54, cells: r.map((c) => ({ html: '<div>' + esc(c) + '</div>' })) })), tstyle: { id: 'medium', accent: 2, header: true, banded: true } });
      b.slide('titleContent', { title: 'Prochaines étapes', body: ['Valider…', 'Lancer…', 'Prochain point le…'], ordered: true });
    } },
    { id: 'portfolio', name: 'Portfolio', desc: 'Réalisations en images avec légendes', theme: 'minuit', build(doc) {
      const b = B(doc);
      b.slide('title', { title: 'Portfolio', subtitle: ['Réalisations'] });
      b.slide('picCaption', { title: 'Réalisation 1', caption: ['Lieu, date', 'Description courte du chantier ou du projet.'] });
      b.slide('picCaption', { title: 'Réalisation 2', caption: ['Lieu, date', 'Description courte.'] });
      b.slide('picture', { caption: 'Légende de la photo' });
      b.slide('section', { title: 'Contact', subtitle: 'Nom · téléphone · courriel' });
    } },
    { id: 'reunion', name: 'Réunion', desc: 'Ordre du jour, points, décisions, plan d\'action', theme: 'foret', build(doc) {
      const b = B(doc), M = b.W * 0.06;
      b.slide('title', { title: 'Réunion d\'équipe', subtitle: [date()] });
      b.slide('titleContent', { title: 'Ordre du jour', body: ['Tour de table', 'Point 1', 'Point 2', 'Décisions', 'Questions diverses'], ordered: true });
      b.slide('comparison', { title: 'Point 1', head1: 'Constats', head2: 'Propositions', body: ['…'], body2: ['…'] });
      const s = b.slide('titleOnly', { title: 'Plan d\'action' });
      const rows = [['Action', 'Responsable', 'Échéance', 'État'], ['', '', '', 'À faire'], ['', '', '', 'En cours'], ['', '', '', 'Fait']];
      const tw = b.W - 2 * M;
      b.add(s, { id: P.uid(), type: 'table', x: M, y: b.H * 0.26, w: tw, h: rows.length * 54, rot: 0, cols: [tw * 0.4, tw * 0.22, tw * 0.18, tw * 0.2], rows: rows.map((r) => ({ h: 54, cells: r.map((c) => ({ html: c ? '<div>' + esc(c) + '</div>' : '' })) })), tstyle: { id: 'grid', accent: 1, header: true } });
    } },
    { id: 'chiffres', name: 'Bilan en chiffres', desc: 'Chiffres clés, graphiques en secteurs et barres', theme: 'soleil', build(doc) {
      const b = B(doc), M = b.W * 0.06;
      b.slide('title', { title: 'Bilan de l\'année', subtitle: ['En quelques chiffres'] });
      b.slide('bigNumber', { number: '98 %', subtitle: 'de stagiaires satisfaits' });
      b.slide('bigNumber', { number: '1 250', subtitle: 'heures de formation dispensées' });
      const s = b.slide('titleOnly', { title: 'Répartition' });
      const c1 = P.newChart('doughnut'); c1.title = 'Par type'; c1.cats = ['Théorie', 'Pratique', 'Évaluation']; c1.series = [{ name: 'Heures', values: [30, 55, 15] }];
      b.add(s, { id: P.uid(), type: 'chart', x: M, y: b.H * 0.24, w: (b.W - 2 * M) / 2 - 10, h: b.H * 0.64, rot: 0, chart: c1, alt: 'Répartition des heures par type' });
      const c2 = P.newChart('barH'); c2.title = 'Par trimestre'; c2.cats = ['T1', 'T2', 'T3', 'T4']; c2.series = [{ name: 'Sessions', values: [8, 12, 9, 14] }]; c2.legend = 'none'; c2.labels = true;
      b.add(s, { id: P.uid(), type: 'chart', x: b.W / 2 + 10, y: b.H * 0.24, w: (b.W - 2 * M) / 2 - 10, h: b.H * 0.64, rot: 0, chart: c2, alt: 'Sessions par trimestre' });
    } },
    { id: 'pitch', name: 'Présentation produit', desc: 'Problème, solution, avantages, offre, contact', theme: 'ardoise', build(doc) {
      const b = B(doc);
      b.slide('title', { title: 'Nom du produit', subtitle: ['La promesse en une phrase'] });
      b.slide('titleContent', { title: 'Le problème', body: ['Ce qui coûte du temps', 'Ce qui coûte de l\'argent', 'Ce qui fait prendre des risques'] });
      b.slide('titleContent', { title: 'Notre solution', body: ['Simple', 'Fiable', 'Abordable'] });
      const s = b.slide('titleOnly', { title: 'Avantages' });
      b.add(s, { id: P.uid(), type: 'smartart', kind: 'radial', palette: 'colorful', x: b.W * 0.2, y: b.H * 0.22, w: b.W * 0.6, h: b.H * 0.7, rot: 0, alt: 'Avantages', items: ['Client', 'Rapidité', 'Sécurité', 'Économie', 'Qualité'].map((t) => ({ text: t, level: 0 })) });
      b.slide('quote', { quote: '« Témoignage d\'un client satisfait. »', subtitle: '— Prénom Nom, entreprise' });
      b.slide('section', { title: 'Parlons-en', subtitle: 'contact@exemple.fr' });
    } },
    { id: 'cours', name: 'Cours et quiz', desc: 'Leçon, schéma, exercice et quiz (tableau à craie)', theme: 'craie', build(doc) {
      const b = B(doc), M = b.W * 0.06;
      b.slide('title', { title: 'Chapitre 1', subtitle: ['Titre de la leçon'] });
      b.slide('titleContent', { title: 'Ce que nous allons voir', body: ['Notion 1', 'Notion 2', 'Exercices'] });
      const s = b.slide('titleOnly', { title: 'Une formule à retenir' });
      b.add(s, { id: P.uid(), type: 'equation', tex: 'P = \\rho \\cdot g \\cdot h', size: 54, color: 't:accent1', x: b.W * 0.25, y: b.H * 0.35, w: b.W * 0.5, h: b.H * 0.25, rot: 0, alt: 'P égale rho fois g fois h' });
      b.text(s, M, b.H * 0.68, b.W - 2 * M, 80, '<div style="text-align:center">Pression = masse volumique × pesanteur × hauteur</div>');
      b.slide('titleContent', { title: 'Quiz', body: ['Question 1 ?', 'Question 2 ?', 'Question 3 ?'], ordered: true, notes: 'Réponses : …' });
    } },
    { id: 'album', name: 'Album photo', desc: 'Pages d\'images pleine page et légendes', theme: 'sobre', build(doc) {
      const b = B(doc);
      doc.theme = { id: 'minuit' };
      b.slide('title', { title: 'Album photo', subtitle: [date()] });
      b.slide('picture', { caption: 'Légende' });
      b.slide('picCaption', { title: 'Titre', caption: ['Légende'] });
      b.slide('picture', { caption: 'Légende' });
    } },
    { id: 'atelier', name: 'Atelier participatif', desc: 'Brainstorming, cycle, priorités, synthèse', theme: 'pastel', build(doc) {
      const b = B(doc), M = b.W * 0.06;
      b.slide('title', { title: 'Atelier', subtitle: ['Construire ensemble'] });
      let s = b.slide('titleOnly', { title: 'Notre démarche' });
      b.add(s, { id: P.uid(), type: 'smartart', kind: 'cycle', palette: 'colorful', x: b.W * 0.22, y: b.H * 0.22, w: b.W * 0.56, h: b.H * 0.72, rot: 0, alt: 'Cycle : observer, proposer, tester, améliorer', items: ['Observer', 'Proposer', 'Tester', 'Améliorer'].map((t) => ({ text: t, level: 0 })) });
      s = b.slide('titleOnly', { title: 'Idées' });
      ['Idée 1', 'Idée 2', 'Idée 3', 'Idée 4'].forEach((t, k) => { b.shape(s, 'wedgeRoundRectCallout', M + k * (b.W - 2 * M) / 4 + 10, b.H * 0.32 + (k % 2) * 60, (b.W - 2 * M) / 4 - 30, b.H * 0.3, { fill: { type: 'solid', color: 't:accent' + (k + 1) + '/+60' }, line: { color: 't:accent' + (k + 1), w: 1.5 }, txColor: 't:dk1', html: '<div style="text-align:center"><span style="font-size:24pt">' + esc(t) + '</span></div>' }); });
      b.slide('titleContent', { title: 'Priorités retenues', body: ['…', '…', '…'], ordered: true });
    } }
  ];
  P.fromTemplate = function (id) {
    const t = P.TEMPLATES.find((x) => x.id === id) || P.TEMPLATES[0];
    const doc = P.newDoc({ empty: true, theme: t.theme });
    t.build(doc);
    if (!doc.slides.length) doc.slides.push(P.newSlide(doc, 'title'));
    if (!doc.title && id !== 'vide') doc.title = '';
    return doc;
  };
})();
