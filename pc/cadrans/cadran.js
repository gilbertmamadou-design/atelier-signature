/* COPIE GÉNÉRÉE par pc/build-pc.py depuis zepp/cadrans/cadran.js : ne pas modifier ici. */
/* =====================================================================
   Cadrans pour Amazfit T-Rex 3 (480 × 480 rond, Zepp OS) : réglages, éléments, dessin, en un seul fichier.
   Le même code sert :
     - à l'appli « Atelier de cadrans » (aperçu en direct, glisser-déposer, applis/www-cadrans) ;
     - à la fabrication des images du cadran (outils/fabriquer.mjs, dans Chromium, sur le robot GitHub).
   L'aperçu est composé avec les mêmes images que celles de la montre.

   Un cadran = un fond (couleurs, motif ou photo, anneau) + une liste d'ÉLÉMENTS placés librement (cfg.blocs) :
     heure, aiguilles, date, info (5 styles), meteo, texte, trait.
   Les anciens réglages (heure / infos / police…) sont convertis en éléments (blocsDe), et les MODELES en fabriquent.

   CADRAN.norm(cfg)                  réglages complets (avec cfg.blocs)
   CADRAN.paquet(cfg)                → { spec, images } : widgets de la montre (dans l'ordre) et images à fabriquer
   CADRAN.apercu(canvas, cfg, opt)   dessine le cadran (opt.aod, opt.date, opt.valeurs, opt.sel = index sélectionné)
   CADRAN.boite(bloc, cfg)           rectangle d'un élément (pour le toucher et le glisser)
   CADRAN.modele(id, cfg)            éléments d'un modèle de départ
   ===================================================================== */
(function (root) {
  'use strict';
  var W = 480, CX = 240, CY = 240;

  var POLICES = {
    fine: { nom: 'Fine', fam: 'CadFine', fichier: 'Inter-Thin.otf', echelle: 1 },
    legere: { nom: 'Légère', fam: 'CadLegere', fichier: 'Inter-Light.otf', echelle: 1 },
    moderne: { nom: 'Moderne', fam: 'CadModerne', fichier: 'Poppins-Medium.ttf', echelle: .92 },
    grasse: { nom: 'Grasse', fam: 'CadGrasse', fichier: 'Inter-Black.otf', echelle: .95 },
    sport: { nom: 'Sport', fam: 'CadSport', fichier: 'texgyreheroscn-bold.otf', echelle: 1.12 },
    militaire: { nom: 'Militaire', fam: 'CadMili', fichier: 'DejaVuSansMono-Bold.ttf', echelle: .9 },
    classique: { nom: 'Classique', fam: 'CadClassique', fichier: 'Lora-Variable.ttf', echelle: .98 },
    nette: { nom: 'Nette', fam: 'CadPetite', fichier: 'Inter-SemiBold.otf', echelle: 1 },
    // afficheurs à segments (DSEG, OFL) : avec l'effet « Segments LCD », les segments éteints restent visibles en fantôme
    lcd: { nom: 'Écran LCD', fam: 'CadLcd', fichier: 'DSEG7Classic-Bold.ttf', echelle: 1 },
    lcd14: { nom: 'LCD lettres', fam: 'CadLcd14', fichier: 'DSEG14Classic-Bold.ttf', echelle: 1 }
  };
  var PETITE = POLICES.nette;

  /* Données de la montre (data_type), étiquette, unité, exemple pour l'aperçu ; « prog » : barre / jauge possible */
  var INFOS = {
    aucun: { n: 'Rien' },
    pas: { n: 'Pas', type: 'STEP', lab: 'PAS', ic: 'pas', ex: 8432, prog: 1 },
    coeur: { n: 'Cœur', type: 'HEART', lab: 'BPM', ic: 'coeur', ex: 72 },
    batterie: { n: 'Batterie', type: 'BATTERY', lab: 'BATTERIE', unite: 'pct', ic: 'batterie', ex: 86, prog: 1 },
    meteo: { n: 'Météo (température)', type: 'WEATHER_CURRENT', lab: 'MÉTÉO', unite: 'deg', ic: 'meteo', ex: 14 },
    tmin: { n: 'Température mini', type: 'WEATHER_LOW', lab: 'MINI', unite: 'deg', ic: 'thermo', ex: 8 },
    tmax: { n: 'Température maxi', type: 'WEATHER_HIGH', lab: 'MAXI', unite: 'deg', ic: 'thermo', ex: 17 },
    humidite: { n: 'Humidité', type: 'HUMIDITY', lab: 'HUMIDITÉ', unite: 'pct', ic: 'goutte', ex: 64 },
    uv: { n: 'Indice UV', type: 'UVI', lab: 'UV', ic: 'soleil', ex: 3 },
    calories: { n: 'Calories', type: 'CAL', lab: 'KCAL', ic: 'flamme', ex: 412, prog: 1 },
    distance: { n: 'Distance', type: 'DISTANCE', lab: 'KM', ic: 'route', ex: '5.4', point: 'point' },
    spo2: { n: 'Oxygène (SpO2)', type: 'SPO2', lab: 'SPO2', unite: 'pct', ic: 'o2', ex: 97 },
    stress: { n: 'Stress', type: 'STRESS', lab: 'STRESS', ic: 'stress', ex: 28 },
    pai: { n: 'PAI', type: 'PAI_WEEKLY', lab: 'PAI', ic: 'pai', ex: 62 },
    debout: { n: 'Debout (heures)', type: 'STAND', lab: 'DEBOUT', ic: 'debout', ex: 7 },
    lever: { n: 'Lever du soleil', type: 'SUN_RISE', lab: 'LEVER', ic: 'lever', ex: '07:42', point: 'dp' },
    coucher: { n: 'Coucher du soleil', type: 'SUN_SET', lab: 'COUCHER', ic: 'coucher', ex: '17:28', point: 'dp' },
    altitude: { n: 'Altitude', type: 'ALTITUDE', lab: 'ALT. M', ic: 'montagne', ex: 412 },
    pression: { n: 'Pression', type: 'ALTIMETER', lab: 'HPA', ic: 'jauge', ex: 1013 },
    vent: { n: 'Vent', type: 'WIND', lab: 'VENT', ic: 'vent', ex: 3 }
  };
  var FONDS = { uni: 'Uni', degrade: 'Dégradé', radial: 'Halo', carbone: 'Carbone', grille: 'Grille', hud: 'HUD', camo: 'Camouflage', fleurs: 'Fleurs', printemps: 'Printemps', ete: 'Été', automne: 'Automne', hiver: 'Hiver', noel: 'Noël', espace: 'Espace', soleil: 'Soleillé', guilloche: 'Guilloché', damas: 'Damas', nacre: 'Nacre', mouvement: 'Mouvement mécanique', marbre: 'Marbre', bois: 'Bois', cuir: 'Cuir surpiqué', topo: 'Carte topographique', aurore: 'Aurore boréale', hexa: 'Nid d\'abeille', vagues: 'Vagues', photo: 'Ma photo' };
  var MOTIFS = { fleur: 'Fleur', marguerite: 'Marguerite', tulipe: 'Tulipe', feuille: 'Feuille', erable: 'Feuille d\'érable', flocon: 'Flocon', soleil: 'Soleil', lune: 'Lune', sapin: 'Sapin',
    etoile: 'Étoile', coeur: 'Cœur', papillon: 'Papillon', champignon: 'Champignon', citrouille: 'Citrouille', cadeau: 'Cadeau', montagne: 'Montagne',
    planete: 'Planète', saturne: 'Planète à anneau', terre: 'Terre', fusee: 'Fusée', atome: 'Atome', comete: 'Comète', ovni: 'Soucoupe' };
  var ANNEAUX = { graduations: 'Graduations', chiffres: 'Chiffres', romains: 'Chiffres romains', plongee: 'Lunette de plongée', cockpit: 'Compteur (cockpit)', tachy: 'Tachymètre', chemin: 'Chemin de fer', boussole: 'Boussole', h24: '24 heures', batterie: 'Batterie', pas: 'Pas (objectif)', aucun: 'Aucun' };
  var AIGUILLES = { fines: 'Fines', epees: 'Épées', larges: 'Larges', baton: 'Bâtons', dauphine: 'Dauphine', squelette: 'Squelette', fleche: 'Flèches' };
  var TROTS = { fine: 'Fine', contrepoids: 'Contrepoids', fleche: 'Flèche', sucette: 'Sucette', sport: 'Sport', epaisse: 'Épaisse' };
  var CALQUES = { vignette: 'Vignette', halo: 'Halo', lignes: 'Lignes', points: 'Points', rayons: 'Rayons', teinte: 'Teinte', verre: 'Reflet verre', lunette: 'Lunette 3D' };
  var STYLES = { simple: 'Simple', ligne: 'En ligne', case: 'Case colorée', jauge: 'Jauge', cercle: 'Petit cadran', aiguille: 'Cadran à aiguille' };
  var TAILLES = { s: 'Petite', m: 'Moyenne', l: 'Grande' };
  var DATES = { long: 'MERCREDI 30 OCTOBRE', court: 'MER 30 OCT', jourNum: 'MER 30', numMois: '30 OCT', jour: 'MERCREDI', jour3: 'MER', numero: '30', chiffres: '30/10' };
  var EFFETS = { aucun: 'Aucun', ombre: 'Ombre', relief: 'Relief 3D', biseau: 'Biseau', contour: 'Contour', creux: 'Creux', lueur: 'Néon', degrade: 'Dégradé', metal: 'Métal', lcd: 'Segments LCD' };
  var TYPES = { heure: 'Heure', aiguilles: 'Aiguilles', date: 'Date', info: 'Info', meteo: 'Météo', texte: 'Texte', trait: 'Trait', image: 'Image', panneau: 'Écran / cadre', anim: 'Animation' };
  var PANNEAUX = { lcd: 'LCD clair', lcdvert: 'LCD vert', ambre: 'LCD ambre', sombre: 'Sombre', verre: 'Verre', cadre: 'Cadre seul' };
  var JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
  var JOURS3 = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
  var MOIS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
  var MOIS4 = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'];
  var METEO = ['nuages', 'averses', 'neige', 'soleil', 'couvert', 'pluie', 'neige', 'pluie', 'neige', 'neige', 'pluie', 'sable', 'neige', 'brouillard', 'brouillard', 'orage', 'neige', 'sable', 'pluie', 'neige', 'orage', 'pluie', 'sable', 'sable', 'pluie', 'inconnu', 'nuages_nuit', 'averses', 'nuit'];
  var VIFS = ['#ff7a1a', '#ffcc00', '#5fd35f', '#2ec4ff', '#3d7bff', '#b45cff', '#ff4fa3', '#ff3b3b', '#46d9c2', '#ffffff'];

  var DEFAUT = {
    nom: 'Mon cadran', fond: 'radial', c1: '#000000', c2: '#10283a', accent: '#46d9c2', texte: '#f2fbff', doux: '#7e98a6',
    heure: 'numerique', police: 'legere', taille: 'grande', secondes: false, aiguilles: 'epees',
    date: true, anneau: 'graduations', infos: ['meteo', 'coeur', 'pas', 'batterie'], aod: 'heure_date',
    photo: '', voile: .35, calques: [], montre: 'trex3', blocs: null
  };
  /* animations : une image par étape (f_0.png…), jouées par la montre (IMG_ANIM) quand l'écran est allumé */
  var ANIMS = { engrenages: 'Engrenages', balancier: 'Balancier', radar: 'Radar', coeur: 'Cœur qui bat', etoiles: 'Étoiles scintillantes', flamme: 'Flamme', onde: 'Onde lumineuse', cage: 'Cage de tourbillon', pendule: 'Pendule', neige: 'Neige', bulles: 'Bulles', eclair: 'Éclair', sablier: 'Sablier', soleil: 'Soleil qui rayonne', vague: 'Vague', disco: 'Lumières disco' };
  var ANIM_N = { engrenages: 24, balancier: 24, radar: 30, coeur: 20, etoiles: 24, flamme: 16, onde: 24, cage: 24, pendule: 24, neige: 24, bulles: 24, eclair: 20, sablier: 24, soleil: 24, vague: 24, disco: 16 };
  var CHOIX = { ANIMS: ANIMS, PANNEAUX: PANNEAUX, MOTIFS: MOTIFS, TROTS: TROTS, CALQUES: CALQUES, EFFETS: EFFETS, ICONES: { trait: 'Dessin', couleur: 'En couleur' }, POLICES: POLICES, INFOS: INFOS, FONDS: FONDS, ANNEAUX: ANNEAUX, AIGUILLES: AIGUILLES, STYLES: STYLES, TAILLES: TAILLES, DATES: DATES, TYPES: TYPES, VIFS: VIFS,
    HEURE: { numerique: 'Numérique', analogique: 'À aiguilles', mixte: 'Aiguilles + heure' }, TAILLE: { grande: 'Grande', moyenne: 'Moyenne' },
    AOD: { heure_date: 'Heure et date', heure: 'Heure seule' } };

  var HEX = /^#[0-9a-f]{6}$/i;
  function num(v, a, b, d) { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; }
  function normBloc(b) {
    if (!b || !TYPES[b.t]) return null;
    var o = { t: b.t, x: Math.round(num(b.x, 0, W, CX)), y: Math.round(num(b.y, 0, W, CY)) };
    var col = function (c, d) { return c === 'accent' || c === 'texte' || c === 'doux' || HEX.test(c || '') ? c : d; };
    o.couleur = col(b.couleur, b.t === 'info' || b.t === 'meteo' ? 'accent' : 'texte');
    o.police = POLICES[b.police] ? b.police : (b.t === 'heure' ? 'legere' : 'nette');
    if (b.t !== 'aiguilles' && b.t !== 'trait' && b.t !== 'panneau') o.effet = EFFETS[b.effet] ? b.effet : 'aucun';
    if (b.t === 'info' || b.t === 'meteo') o.icone = b.icone === 'couleur' ? 'couleur' : 'trait';
    if (b.t === 'heure') { o.taille = Math.round(num(b.taille, 30, 150, 110)); o.secondes = !!b.secondes; o.dp = col(b.dp, 'accent'); }
    if (b.t === 'aiguilles') { o.style = AIGUILLES[b.style] ? b.style : 'epees'; o.secondes = !!b.secondes; o.echelle = num(b.echelle, .2, 1, 1); o.trot = col(b.trot, 'accent'); o.trotStyle = TROTS[b.trotStyle] ? b.trotStyle : 'fine'; o.ombre = !!b.ombre; o.lume = !!b.lume; }
    if (b.t === 'date') { o.format = DATES[b.format] ? b.format : 'long'; o.taille = Math.round(num(b.taille, 12, 40, 21)); o.jour = col(b.jour, 'accent'); o.cadre = !!b.cadre; }
    if (b.t === 'info') { o.d = INFOS[b.d] && INFOS[b.d].type ? b.d : 'pas'; o.style = STYLES[b.style] ? b.style : 'simple'; o.taille = TAILLES[b.taille] ? b.taille : 'm'; o.barre = !!b.barre && !!INFOS[o.d].prog; o.valeur = col(b.valeur, 'texte'); if (o.style === 'aiguille' && !INFOS[o.d].prog) o.style = 'jauge'; }
    if (b.t === 'meteo') { o.taille = TAILLES[b.taille] ? b.taille : 'm'; o.minmax = b.minmax !== false; o.valeur = col(b.valeur, 'texte'); }
    if (b.t === 'texte') { o.txt = String(b.txt == null ? 'TEXTE' : b.txt).replace(/[\u0000-\u001f]/g, '').slice(0, 24); o.taille = Math.round(num(b.taille, 10, 80, 18)); o.esp = num(b.esp, 0, 10, 2); }
    if (b.t === 'image') { o.motif = MOTIFS[b.motif] ? b.motif : 'fleur'; o.taille = Math.round(num(b.taille, 16, 240, 60)); o.rot = Math.round(num(b.rot, -180, 180, 0)); o.couleur = b.couleur === 'auto' ? 'auto' : col(b.couleur, 'auto'); }
    if (b.t === 'anim') { o.motif = ANIMS[b.motif] ? b.motif : 'engrenages'; o.taille = Math.round(num(b.taille, 40, 240, 110)); o.couleur = col(b.couleur, 'accent'); }
    if (b.t === 'trait') { o.l = Math.round(num(b.l, 10, 440, 200)); o.ep = num(b.ep, 1, 12, 2); o.vertical = !!b.vertical; }
    if (b.t === 'panneau') { o.l = Math.round(num(b.l, 20, 460, 300)); o.h = Math.round(num(b.h, 10, 460, 110)); o.r = Math.round(num(b.r, 0, 80, 14)); o.style = PANNEAUX[b.style] ? b.style : 'lcd'; o.couleur = col(b.couleur, 'accent'); }
    return o;
  }
  function norm(c) {
    var o = {}, k; for (k in DEFAUT) o[k] = DEFAUT[k];
    c = c || {}; for (k in c) if (c[k] != null && k in DEFAUT) o[k] = c[k];
    if (!POLICES[o.police]) o.police = DEFAUT.police;
    if (!FONDS[o.fond] && o.fond !== 'transparent') o.fond = DEFAUT.fond;   // « transparent » : calque de l'éditeur seulement
    if (!ANNEAUX[o.anneau]) o.anneau = DEFAUT.anneau;
    if (!AIGUILLES[o.aiguilles]) o.aiguilles = DEFAUT.aiguilles;
    if (!CHOIX.HEURE[o.heure]) o.heure = 'numerique';
    o.infos = (Array.isArray(o.infos) ? o.infos : DEFAUT.infos).slice(0, 4);
    while (o.infos.length < 4) o.infos.push('aucun');
    o.infos = o.infos.map(function (x) { return INFOS[x] ? x : 'aucun'; });
    ['c1', 'c2', 'accent', 'texte', 'doux'].forEach(function (k) { if (!HEX.test(o[k])) o[k] = DEFAUT[k]; });
    o.nom = String(o.nom || 'Mon cadran').slice(0, 24);
    o.photo = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(o.photo || '') ? o.photo : '';
    if (o.fond === 'photo' && !o.photo) o.fond = 'radial';
    o.voile = num(o.voile, 0, .9, .35);
    if (!MONTRES[o.montre]) o.montre = 'trex3';
    o.calques = (Array.isArray(o.calques) ? o.calques : []).filter(function (k, i, l) { return CALQUES[k] && l.indexOf(k) === i; });
    o.blocs = (Array.isArray(o.blocs) ? o.blocs : blocsDe(o)).map(normBloc).filter(Boolean).slice(0, 40);
    return o;
  }
  function coul(cfg, c) { return c === 'accent' || c === 'texte' || c === 'doux' ? cfg[c] : c; }

  /* ---------------- outils de dessin ---------------- */
  function toile(w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (root.document) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (root.OffscreenCanvas) return new root.OffscreenCanvas(w, h);
    throw new Error('Pas de canvas');
  }
  var MES = null;
  // les chiffres DSEG occupent tout le corps (1 em) contre ~0,74 em pour les autres polices : même hauteur visible
  function tl(fam, taille) { return /^CadLcd/.test(fam) ? Math.round(taille * .74 * 10) / 10 : taille; }
  function mesure(fam, taille, t, esp) { taille = tl(fam, taille);
    if (!MES) MES = toile(8, 8).getContext('2d');
    MES.font = taille + 'px "' + fam + '"';
    return MES.measureText(t).width + (esp || 0) * Math.max(0, t.length - 1);
  }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + (a == null ? 1 : a) + ')'; }
  function mix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), r = function (s) { return Math.round(((x >> s & 255) * (1 - t)) + ((y >> s & 255) * t)); };
    return '#' + [16, 8, 0].map(function (s) { return ('0' + r(s).toString(16)).slice(-2); }).join('');
  }
  /* marge à prévoir autour du texte pour un effet (relief, ombre, lueur…) */
  function padFx(fx, taille) {
    var k = { relief: .08, ombre: .12, lueur: .16, contour: .09, biseau: .03, metal: .03, creux: .04 }[fx] || 0;
    return k ? Math.ceil(taille * k) + 2 : 0;
  }
  function texte(g, t, x, y, fam, taille, coul, align, esp, fx) {
    var taille0 = taille; taille = tl(fam, taille);
    g.font = taille + 'px "' + fam + '"'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    esp = esp || 0; if (!HEX.test(coul || '')) fx = null;
    if (fam === 'CadLcd14') t = String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    var w = mesure(fam, taille0, t, esp), x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    var trace = function (dx, dy, creux) {
      var f = creux ? 'strokeText' : 'fillText';
      if (!esp) { g[f](t, x0 + dx, y + dy); return; }
      var xx = x0 + dx; for (var i = 0; i < t.length; i++) { g[f](t[i], xx, y + dy); xx += mesure(fam, taille0, t[i]) + esp; }
    };
    g.save(); g.fillStyle = coul;
    if (fx === 'lcd') {
      // segments éteints en fantôme : « 8 » (chiffres) ou « ~ » (tous les segments de DSEG14), puis le texte allumé
      var gh = fam === 'CadLcd14' ? t.replace(/[0-9A-Z \-]/g, '~') : t.replace(/[0-9 \-]/g, '8');
      g.globalAlpha = .14;
      if (!esp) g.fillText(gh, x0, y); else { var xg = x0; for (var gi = 0; gi < gh.length; gi++) { g.fillText(gh[gi], xg, y); xg += mesure(fam, taille0, t[gi] || gh[gi]) + esp; } }
      g.globalAlpha = 1; trace(0, 0); fx = null;
    }
    if (fx && fx !== 'aucun') {
      var fonce = mix(coul, '#000000', .62), clair = mix(coul, '#ffffff', .6), k = Math.max(1, Math.round(taille / 45));
      if (fx === 'relief') {
        var n = Math.max(2, Math.round(taille * .07)); x0 -= n / 2; y -= n / 2;
        g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = n; g.shadowOffsetX = g.shadowOffsetY = 1;
        g.fillStyle = mix(fonce, '#000000', .35); trace(n, n);
        g.shadowColor = 'transparent';
        for (var i = n - 1; i >= 1; i--) { g.fillStyle = mix(fonce, coul, .35 * (1 - i / n)); trace(i, i); }
        var gr = g.createLinearGradient(0, y - taille * .75, 0, y); gr.addColorStop(0, mix(coul, '#ffffff', .25)); gr.addColorStop(1, coul);
        g.fillStyle = gr; trace(0, 0);
      } else if (fx === 'ombre') {
        g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = Math.max(2, taille * .07); g.shadowOffsetX = g.shadowOffsetY = Math.max(1, Math.round(taille * .045));
        x0 -= g.shadowOffsetX / 2; y -= g.shadowOffsetY / 2; trace(0, 0);
      } else if (fx === 'biseau') {
        g.fillStyle = clair; trace(-k, -k); g.fillStyle = fonce; trace(k, k); g.fillStyle = coul; trace(0, 0);
      } else if (fx === 'contour') {
        g.lineJoin = 'round'; g.lineWidth = Math.max(2, taille * .1); g.strokeStyle = mix(coul, '#000000', .8); trace(0, 0, 1); trace(0, 0);
      } else if (fx === 'creux') {
        g.lineJoin = 'round'; g.lineWidth = Math.max(1.4, taille * .035); g.strokeStyle = coul; trace(0, 0, 1);
      } else if (fx === 'lueur') {
        g.shadowColor = coul; g.shadowBlur = Math.max(3, taille * .14); trace(0, 0); trace(0, 0);
        g.shadowColor = 'transparent'; g.fillStyle = mix(coul, '#ffffff', .45); trace(0, 0);
      } else if (fx === 'degrade') {
        var gd = g.createLinearGradient(0, y - taille * .75, 0, y); gd.addColorStop(0, clair); gd.addColorStop(.5, coul); gd.addColorStop(1, mix(coul, '#000000', .4));
        g.fillStyle = gd; trace(0, 0);
      } else if (fx === 'metal') {
        var gm = g.createLinearGradient(0, y - taille * .75, 0, y);
        gm.addColorStop(0, mix(coul, '#ffffff', .8)); gm.addColorStop(.42, coul); gm.addColorStop(.5, mix(coul, '#000000', .5)); gm.addColorStop(.75, coul); gm.addColorStop(1, mix(coul, '#ffffff', .45));
        g.fillStyle = gm; trace(0, 0); g.lineWidth = Math.max(1, taille * .02); g.strokeStyle = mix(coul, '#000000', .65); trace(0, 0, 1);
      } else trace(0, 0);
    } else trace(0, 0);
    g.restore();
  }
  function boiteTxt(w, h, t, fam, taille, coul, align, esp, fx) {
    var c = toile(w, h), g = c.getContext('2d'), p = padFx(fx, taille);
    var base = Math.round(h / 2 + taille * .36);
    texte(g, t, align === 'center' ? w / 2 : align === 'right' ? w - 1 - p / 2 : 1 + p / 2, base, fam, taille, coul, align, esp, fx);
    return c;
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function rond(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------------- icônes (traits, 24 × 24) ---------------- */
  function icone(g, nom, cx, cy, s, coul) {
    g.save(); g.translate(cx, cy); g.scale(s / 24, s / 24); g.translate(-12, -12);
    g.strokeStyle = coul; g.fillStyle = coul; g.lineWidth = 1.9; g.lineCap = 'round'; g.lineJoin = 'round';
    var P = function (d) { g.stroke(new Path2D(d)); }, F = function (d) { g.fill(new Path2D(d)); };
    switch (nom) {
      case 'pas': F('M8.5 3.5c1.6 0 2.6 1.9 2.4 4.3-.2 2.2-1 3.4-2.6 3.4-1.4 0-2.3-1.3-2.4-3.2C5.8 5.5 6.9 3.5 8.5 3.5zM6.6 12.6h3.8l-.3 2.3c-.2 1.2-1 1.9-1.9 1.9-1 0-1.7-.8-1.7-2zM15.5 7.5c1.6 0 2.7 2 2.5 4.4-.1 1.9-1 3.2-2.4 3.2-1.6 0-2.4-1.2-2.6-3.4-.2-2.4.9-4.2 2.5-4.2zM13.6 16.6h3.8l.1 1.3c0 1.2-.7 2-1.7 2-.9 0-1.7-.7-1.9-1.9z'); break;
      case 'coeur': F('M12 20.5s-7.5-4.4-8.6-9.6C2.7 7.5 4.8 4.5 7.8 4.5c1.8 0 3.2 1 4.2 2.4 1-1.4 2.4-2.4 4.2-2.4 3 0 5.1 3 4.4 6.4-1.1 5.2-8.6 9.6-8.6 9.6z'); break;
      case 'batterie': P('M3.5 8h15a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 2 14.5v-5A1.5 1.5 0 0 1 3.5 8zM22 10.5v3'); F('M4.5 10h9v4h-9z'); break;
      case 'meteo': P('M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z'); break;
      case 'thermo': P('M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z'); F('M11 12h2v4.5h-2z'); g.beginPath(); g.arc(12, 17.5, 2.1, 0, 7); g.fill(); break;
      case 'goutte': P('M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z'); break;
      case 'soleil': g.beginPath(); g.arc(12, 12, 4, 0, 7); g.fill(); for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; g.beginPath(); g.moveTo(12 + Math.cos(a) * 6.5, 12 + Math.sin(a) * 6.5); g.lineTo(12 + Math.cos(a) * 9.5, 12 + Math.sin(a) * 9.5); g.stroke(); } break;
      case 'flamme': P('M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.8-2.8-5.6-3.8-9.5-1.8 1.9-2.6 3.8-2.6 5.6-1-1-1.8-2-1.8-3.8C7.6 9.6 5.5 12.4 5.5 14.5A6.5 6.5 0 0 0 12 21z'); break;
      case 'route': P('M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10z'); g.beginPath(); g.arc(12, 11, 2.2, 0, 7); g.stroke(); break;
      case 'o2': g.beginPath(); g.arc(9, 12, 5, 0, 7); g.stroke(); g.font = '700 8px sans-serif'; g.textAlign = 'center'; g.fillText('2', 18, 19); break;
      case 'stress': P('M3 13h3l2-5 3 10 3-8 2 3h5'); break;
      case 'pai': P('M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z'); break;
      case 'debout': g.beginPath(); g.arc(12, 4.5, 2.2, 0, 7); g.fill(); P('M12 8v7M8 11l4-2 4 2M9.5 21l2.5-6 2.5 6'); break;
      case 'lever': P('M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 3v5M9.5 5.5 12 3l2.5 2.5M4.2 11.2l1.6 1.2M19.8 11.2l-1.6 1.2'); break;
      case 'coucher': P('M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 3v5M9.5 5.5 12 8l2.5-2.5M4.2 11.2l1.6 1.2M19.8 11.2l-1.6 1.2'); break;
      case 'montagne': P('M2.5 19.5 9 8l3.5 6 2.5-4 6.5 9.5z'); P('M7.3 11 9 12.3 10.5 11'); break;
      case 'jauge': P('M4 17a8.5 8.5 0 1 1 16 0'); P('M12 16.5 15.5 10'); g.beginPath(); g.arc(12, 16.5, 1.4, 0, 7); g.fill(); break;
      case 'vent': P('M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h7'); break;
      case 'haut': P('M12 19V5M6 11l6-6 6 6'); break;
      case 'bas': P('M12 5v14M6 13l6 6 6-6'); break;
    }
    g.restore();
  }
  function meteoCouleur(genre, s) {
    var c = toile(s, s), g = c.getContext('2d');
    g.scale(s / 48, s / 48); g.lineCap = 'round'; g.lineJoin = 'round';
    var ombre = function (on) { g.shadowColor = on ? 'rgba(0,0,0,.5)' : 'transparent'; g.shadowBlur = on ? 3 : 0; g.shadowOffsetY = on ? 1.5 : 0; };
    function soleil(x, y, r, rayons) {
      if (rayons) { g.strokeStyle = '#ffae00'; g.lineWidth = 2.6; for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; g.beginPath(); g.moveTo(x + Math.cos(a) * (r + 3.5), y + Math.sin(a) * (r + 3.5)); g.lineTo(x + Math.cos(a) * (r + 7.5), y + Math.sin(a) * (r + 7.5)); g.stroke(); } }
      var gr = g.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r); gr.addColorStop(0, '#fff7b8'); gr.addColorStop(.5, '#ffd43b'); gr.addColorStop(1, '#ff8f00');
      ombre(1); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); ombre(0);
    }
    function lune(x, y, r) {
      var t = toile(s, s), h = t.getContext('2d'); h.scale(s / 48, s / 48);
      var gr = h.createLinearGradient(x - r, y - r, x + r, y + r); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(1, '#e2bf4f');
      h.fillStyle = gr; h.beginPath(); h.arc(x, y, r, 0, 7); h.fill();
      h.globalCompositeOperation = 'destination-out'; h.beginPath(); h.arc(x + r * .6, y - r * .4, r * .82, 0, 7); h.fill();
      ombre(1); g.drawImage(t, 0, 0, 48, 48); ombre(0);
    }
    function nuage(dy, sombre) {
      var p = new Path2D('M13 ' + (34 + dy) + 'h22a7 7 0 0 0 .8-13.9A10 10 0 0 0 16.6 ' + (22 + dy) + 'a6.2 6.2 0 0 0-3.6 12z');
      var gr = g.createLinearGradient(0, 12 + dy, 0, 34 + dy);
      if (sombre) { gr.addColorStop(0, '#b4bfcf'); gr.addColorStop(1, '#5c687a'); } else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#bcc7d8'); }
      ombre(1); g.fillStyle = gr; g.fill(p); ombre(0);
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.stroke(p);
    }
    function gouttes(n, y0) { g.strokeStyle = '#3aa8ff'; g.lineWidth = 2.8; for (var i = 0; i < n; i++) { var x = 16 + i * 8; g.beginPath(); g.moveTo(x, y0); g.lineTo(x - 3, y0 + 7); g.stroke(); } }
    function flocons(n, y0) { for (var i = 0; i < n; i++) { var x = 16 + i * 8, y = y0 + (i % 2) * 4; g.fillStyle = '#ffffff'; g.strokeStyle = '#7cc4ff'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); g.stroke(); } }
    switch (genre) {
      case 'soleil': soleil(24, 24, 9, true); break;
      case 'nuit': lune(24, 24, 12); break;
      case 'nuages': soleil(17, 17, 6.5, true); nuage(4); break;
      case 'nuages_nuit': lune(17, 16, 8); nuage(4); break;
      case 'couvert': nuage(-6, true); g.save(); g.translate(5, 10); g.scale(.85, .85); nuage(0); g.restore(); break;
      case 'pluie': nuage(-6, true); gouttes(4, 33); break;
      case 'averses': soleil(15, 13, 5.5, false); nuage(-6); gouttes(3, 33); break;
      case 'neige': nuage(-6); flocons(4, 35); break;
      case 'orage':
        nuage(-6, true); ombre(1); g.beginPath(); g.moveTo(27, 27); g.lineTo(19, 39); g.lineTo(24.5, 39); g.lineTo(21, 47); g.lineTo(31, 34); g.lineTo(25.5, 34); g.lineTo(29, 27); g.closePath();
        g.fillStyle = '#ffd21f'; g.fill(); ombre(0); g.strokeStyle = '#ff8f00'; g.lineWidth = 1; g.stroke(); break;
      case 'brouillard': nuage(-8); g.strokeStyle = '#c3cad6'; g.lineWidth = 2.6; [32, 38, 44].forEach(function (y, i) { g.beginPath(); g.moveTo(9 + (i % 2) * 5, y); g.lineTo(39 - (i % 2) * 5, y); g.stroke(); }); break;
      case 'sable': g.strokeStyle = '#e3b462'; g.lineWidth = 2.8; [18, 26, 34].forEach(function (y, i) { g.beginPath(); g.moveTo(8, y); g.bezierCurveTo(18, y - 6, 26, y + 6, 40 - i * 4, y); g.stroke(); }); break;
      default: g.fillStyle = '#c3cad6'; g.font = '700 26px "' + PETITE.fam + '"'; g.textAlign = 'center'; g.fillText('?', 24, 33);
    }
    return c;
  }
  function meteoIcone(genre, s, coul, coul2, mode) {
    if (mode === 'couleur') return meteoCouleur(genre, s);
    var c = toile(s, s), g = c.getContext('2d');
    g.save(); g.scale(s / 48, s / 48); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2.6; g.strokeStyle = coul; g.fillStyle = coul;
    function soleil(x, y, r, rayons) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); if (rayons) for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; g.beginPath(); g.moveTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4)); g.lineTo(x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8)); g.stroke(); } }
    function lune(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x + r * .55, y - r * .35, r * .85, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    function nuage(dy, plein) { var p = new Path2D('M13 ' + (34 + dy) + 'h22a7 7 0 0 0 .8-13.9A10 10 0 0 0 16.6 ' + (22 + dy) + 'a6.2 6.2 0 0 0-3.6 12z'); if (plein) { g.fillStyle = coul2; g.fill(p); g.fillStyle = coul; } g.stroke(p); }
    function traits(n, y0, lg) { for (var i = 0; i < n; i++) { var x = 16 + i * 8; g.beginPath(); g.moveTo(x, y0); g.lineTo(x - 3, y0 + lg); g.stroke(); } }
    function flocons(n, y0) { for (var i = 0; i < n; i++) { g.beginPath(); g.arc(16 + i * 8, y0 + (i % 2) * 4, 2, 0, 7); g.fill(); } }
    switch (genre) {
      case 'soleil': soleil(24, 24, 8, true); break;
      case 'nuit': lune(24, 24, 11); break;
      case 'nuages': soleil(17, 17, 6, true); nuage(4, true); break;
      case 'nuages_nuit': lune(17, 16, 7); nuage(4, true); break;
      case 'couvert': nuage(-2, true); break;
      case 'pluie': nuage(-6, true); traits(4, 33, 7); break;
      case 'averses': soleil(16, 13, 5, false); nuage(-6, true); traits(3, 33, 6); break;
      case 'neige': nuage(-6, true); flocons(4, 35); break;
      case 'orage': nuage(-6, true); g.beginPath(); g.moveTo(25, 30); g.lineTo(20, 38); g.lineTo(26, 38); g.lineTo(21, 46); g.stroke(); break;
      case 'brouillard': [16, 23, 30, 37].forEach(function (y, i) { g.beginPath(); g.moveTo(8 + (i % 2) * 4, y); g.lineTo(40 - (i % 2) * 4, y); g.stroke(); }); break;
      case 'sable': [18, 26, 34].forEach(function (y, i) { g.beginPath(); g.moveTo(8, y); g.bezierCurveTo(18, y - 6, 26, y + 6, 40 - i * 4, y); g.stroke(); }); break;
      default: g.font = '700 26px "' + PETITE.fam + '"'; g.textAlign = 'center'; g.fillText('?', 24, 33);
    }
    g.restore(); return c;
  }

  /* ---------------- anciens réglages → éléments ---------------- */
  var TI = { s: { w: 92, ic: 20, val: 25, lab: 10 }, m: { w: 116, ic: 24, val: 30, lab: 12 }, l: { w: 150, ic: 30, val: 42, lab: 14 } };
  function policeInfos(p) { return p === 'militaire' || p === 'sport' || p === 'classique' ? p : 'nette'; }
  function blocsDe(cfg) {
    var l = [], pi = policeInfos(cfg.police), ana = cfg.heure !== 'numerique';
    var info = function (d, x, top, style, taille) {
      if (!INFOS[d] || !INFOS[d].type) return;
      var T = TI[taille], h = T.ic + 4 + Math.round(T.val * 1.08) + T.lab + 6;
      l.push({ t: 'info', d: d, x: x, y: Math.round(top + h / 2), style: style, taille: taille, police: pi });
    };
    if (cfg.heure === 'numerique') {
      var g = cfg.taille === 'grande', gr = g ? 118 : 92, hT = Math.round(gr * .82), y0 = g ? 150 : 162;
      l.push({ t: 'heure', x: CX, y: Math.round(y0 + hT / 2), taille: gr, police: cfg.police, secondes: false });
      if (cfg.date) l.push({ t: 'date', format: 'long', x: CX, y: y0 + hT + 10 + 15, taille: 21 });
      var tops = g ? [62, 62, 302, 302] : [70, 70, 294, 294];
      cfg.infos.forEach(function (d, i) { info(d, CX + (i % 2 ? 80 : -80), tops[i], 'simple', 'm'); });
    } else {
      var pos = [[CX, 108], [CX - 96, 205], [CX + 96, 205], [CX, 318]];
      cfg.infos.forEach(function (d, i) { if (cfg.heure === 'mixte' && i === 0) return; info(d, pos[i][0], pos[i][1], 'cercle', 's'); });
      if (cfg.heure === 'mixte') l.push({ t: 'heure', x: CX, y: 112 + 19, taille: 46, police: cfg.police });
      if (cfg.date) l.push({ t: 'date', format: 'court', x: CX, y: 268 + 12, taille: 16 });
      l.push({ t: 'aiguilles', x: CX, y: CY, style: cfg.aiguilles, secondes: cfg.secondes, echelle: 1 });
    }
    return l;
  }
  /* modèles de départ (éléments seulement ; le fond et les couleurs restent ceux du cadran) */
  var MODELES = {
    numerique: { n: 'Heure numérique', f: function (c) { return blocsDe(Object.assign({}, c, { heure: 'numerique', taille: 'grande', date: true })); } },
    aiguilles: { n: 'À aiguilles', f: function (c) { return blocsDe(Object.assign({}, c, { heure: 'analogique', date: true })); } },
    mixte: { n: 'Aiguilles + heure', f: function (c) { return blocsDe(Object.assign({}, c, { heure: 'mixte', date: true })); } },
    tableau: { n: 'Tableau de bord', f: function () {
      return [
        { t: 'info', d: 'meteo', x: 168, y: 66, style: 'ligne', taille: 's', couleur: '#ffcc00' }, { t: 'info', d: 'spo2', x: 300, y: 66, style: 'ligne', taille: 's', couleur: '#2ec4ff' },
        { t: 'heure', x: CX, y: 182, taille: 120, police: 'sport' },
        { t: 'date', format: 'court', x: CX, y: 108, taille: 16 },
        { t: 'info', d: 'calories', x: 112, y: 282, style: 'case', taille: 's', couleur: '#ff7a1a', barre: true },
        { t: 'info', d: 'coeur', x: CX, y: 282, style: 'case', taille: 's', couleur: '#ff3b3b' },
        { t: 'info', d: 'pas', x: 368, y: 282, style: 'case', taille: 's', couleur: '#3d7bff', barre: true },
        { t: 'info', d: 'distance', x: 166, y: 368, style: 'case', taille: 's', couleur: '#5fd35f' },
        { t: 'info', d: 'batterie', x: 314, y: 368, style: 'case', taille: 's', couleur: '#46d9c2', barre: true },
        { t: 'info', d: 'pai', x: CX, y: 432, style: 'ligne', taille: 's', couleur: '#b45cff' }
      ];
    } },
    paysage: { n: 'Paysage', f: function () {
      return [
        { t: 'info', d: 'batterie', x: CX, y: 40, style: 'ligne', taille: 's', couleur: 'texte' },
        { t: 'meteo', x: CX, y: 102, taille: 's', icone: 'couleur', effet: 'ombre' },
        { t: 'heure', x: 228, y: 210, taille: 92, police: 'grasse', secondes: true, effet: 'relief' },
        { t: 'date', format: 'court', x: CX, y: 160, taille: 18 },
        { t: 'info', d: 'pas', x: 130, y: 300, style: 'case', taille: 's', couleur: '#5fd35f', barre: true },
        { t: 'info', d: 'calories', x: 240, y: 300, style: 'case', taille: 's', couleur: '#ff7a1a', barre: true },
        { t: 'info', d: 'coeur', x: 350, y: 300, style: 'case', taille: 's', couleur: '#ff3b3b' },
        { t: 'info', d: 'lever', x: 170, y: 384, style: 'ligne', taille: 's', couleur: '#ffcc00' },
        { t: 'info', d: 'coucher', x: 310, y: 384, style: 'ligne', taille: 's', couleur: '#ff7a1a' }
      ];
    } },
    chrono: { n: 'Chrono sport', f: function () {
      return [
        { t: 'meteo', x: CX, y: 92, taille: 's', minmax: true },
        { t: 'date', format: 'long', x: CX, y: 156, taille: 18 },
        { t: 'heure', x: CX, y: 232, taille: 120, police: 'sport', secondes: true },
        { t: 'trait', x: CX, y: 296, l: 260, ep: 1, couleur: 'doux' },
        { t: 'info', d: 'calories', x: 150, y: 330, style: 'simple', taille: 's', couleur: '#ff7a1a' },
        { t: 'info', d: 'pas', x: CX, y: 330, style: 'simple', taille: 's', couleur: '#5fd35f' },
        { t: 'info', d: 'coeur', x: 330, y: 330, style: 'simple', taille: 's', couleur: '#ff3b3b' },
        { t: 'info', d: 'batterie', x: CX, y: 408, style: 'ligne', taille: 's', couleur: '#ffcc00' }
      ];
    } },
    multi: { n: 'Multi-cadrans', f: function () {
      return [
        { t: 'info', d: 'coeur', x: CX, y: 112, style: 'jauge', taille: 's', couleur: '#ff3b3b' },
        { t: 'info', d: 'pas', x: 122, y: 240, style: 'jauge', taille: 's', couleur: '#5fd35f', barre: true },
        { t: 'info', d: 'batterie', x: 358, y: 240, style: 'jauge', taille: 's', couleur: '#46d9c2', barre: true },
        { t: 'info', d: 'meteo', x: CX, y: 362, style: 'cercle', taille: 's', couleur: '#ffcc00' },
        { t: 'date', format: 'court', x: CX, y: 290, taille: 15 },
        { t: 'aiguilles', x: CX, y: CY, style: 'epees', secondes: true, echelle: 1 }
      ];
    } },
    grandemeteo: { n: 'Grande météo', f: function () {
      return [
        { t: 'meteo', x: CX, y: 104, taille: 'l', icone: 'couleur', effet: 'ombre', minmax: true },
        { t: 'heure', x: CX, y: 222, taille: 112, police: 'moderne', effet: 'relief' },
        { t: 'date', format: 'long', x: CX, y: 290, taille: 18, effet: 'ombre' },
        { t: 'info', d: 'humidite', x: 128, y: 352, style: 'case', taille: 's', couleur: '#2ec4ff', effet: 'relief' },
        { t: 'info', d: 'uv', x: CX, y: 352, style: 'case', taille: 's', couleur: '#ffcc00', effet: 'relief' },
        { t: 'info', d: 'vent', x: 352, y: 352, style: 'case', taille: 's', couleur: '#46d9c2', effet: 'relief' },
        { t: 'info', d: 'batterie', x: CX, y: 432, style: 'ligne', taille: 's', couleur: 'doux', effet: 'ombre' }
      ];
    } },
    lcdretro: { n: 'LCD rétro', f: function () {
      var enc = '#1f261b';
      return [
        { t: 'panneau', x: CX, y: 128, l: 250, h: 50, r: 10, style: 'lcd', couleur: 'accent' },
        { t: 'date', format: 'court', x: CX, y: 128, taille: 20, police: 'lcd14', effet: 'lcd', couleur: enc, jour: enc },
        { t: 'panneau', x: CX, y: 228, l: 360, h: 128, r: 16, style: 'lcd', couleur: 'accent' },
        { t: 'heure', x: CX, y: 228, taille: 92, police: 'lcd', effet: 'lcd', couleur: enc, dp: enc, secondes: true },
        { t: 'panneau', x: CX, y: 336, l: 300, h: 60, r: 10, style: 'lcd', couleur: 'accent' },
        { t: 'info', d: 'pas', x: 168, y: 336, style: 'ligne', taille: 's', couleur: enc, valeur: enc, police: 'lcd' },
        { t: 'info', d: 'coeur', x: 312, y: 336, style: 'ligne', taille: 's', couleur: enc, valeur: enc, police: 'lcd' },
        { t: 'info', d: 'batterie', x: CX, y: 410, style: 'ligne', taille: 's', couleur: '#ffcc00', valeur: 'texte', police: 'lcd', effet: 'lcd' },
        { t: 'meteo', x: CX, y: 64, taille: 's', minmax: false }
      ];
    } },
    tactique: { n: 'Tactique', f: function () {
      var amb = '#ffb000';
      return [
        { t: 'texte', txt: 'ALT · PRESS · HUM', x: CX, y: 62, taille: 11, couleur: 'doux', esp: 2 },
        { t: 'info', d: 'calories', x: 150, y: 104, style: 'ligne', taille: 's', couleur: '#ff7a1a', police: 'lcd' },
        { t: 'info', d: 'coeur', x: 330, y: 104, style: 'ligne', taille: 's', couleur: '#ff3b3b', police: 'lcd' },
        { t: 'panneau', x: CX, y: 220, l: 380, h: 120, r: 12, style: 'sombre', couleur: amb },
        { t: 'heure', x: CX, y: 220, taille: 96, police: 'lcd', effet: 'lcd', couleur: amb, dp: amb, secondes: true },
        { t: 'panneau', x: CX, y: 318, l: 260, h: 46, r: 8, style: 'sombre', couleur: amb },
        { t: 'date', format: 'court', x: CX, y: 318, taille: 18, police: 'lcd14', effet: 'lcd', couleur: amb, jour: amb },
        { t: 'info', d: 'pas', x: 130, y: 390, style: 'jauge', taille: 's', couleur: '#5fd35f', barre: true, police: 'lcd' },
        { t: 'info', d: 'batterie', x: 350, y: 390, style: 'jauge', taille: 's', couleur: '#46d9c2', barre: true, police: 'lcd' },
        { t: 'meteo', x: CX, y: 404, taille: 's', minmax: false }
      ];
    } },
    nixie: { n: 'Tubes Nixie', f: function (c) {
      var o = '#ff8a1f', h = normBloc({ t: 'heure', x: CX, y: 232, taille: 96, police: 'legere', effet: 'lueur', couleur: o, dp: o }), G = geo(h, c);
      var cx = [G.x + G.cw / 2, G.x + G.cw * 1.5, G.x + 2 * G.cw + G.dpw + G.cw / 2, G.x + 3 * G.cw + G.dpw + G.cw / 2];
      var l = [{ t: 'date', format: 'court', x: CX, y: 118, taille: 18, couleur: o, jour: o, effet: 'lueur' }];
      cx.forEach(function (x) { l.push({ t: 'panneau', x: Math.round(x), y: 232, l: Math.round(G.cw - 6), h: 138, r: Math.round((G.cw - 6) / 2.3), style: 'verre', couleur: o }); });
      l.push(h,
        { t: 'info', d: 'coeur', x: 156, y: 352, style: 'ligne', taille: 's', couleur: o, valeur: o, effet: 'lueur' },
        { t: 'info', d: 'pas', x: 324, y: 352, style: 'ligne', taille: 's', couleur: o, valeur: o, effet: 'lueur' },
        { t: 'info', d: 'batterie', x: CX, y: 398, style: 'ligne', taille: 's', couleur: o, valeur: o, effet: 'lueur' });
      return l;
    } },
    vide: { n: 'Vide', f: function () { return [{ t: 'heure', x: CX, y: CY, taille: 110, police: 'legere' }]; } }
  };
  function modele(id, cfg) { var m = MODELES[id] || MODELES.numerique; return m.f(norm(cfg)).map(normBloc).filter(Boolean); }

  /* ---------------- géométrie des éléments ---------------- */
  var CACHE_G = {};
  var DPARTS = { long: [['sem', JOURS], ['jour'], ['mois', MOIS]], court: [['sem', JOURS3], ['jour'], ['mois', MOIS4]], jourNum: [['sem', JOURS3], ['jour']], numMois: [['jour'], ['mois', MOIS4]],
    jour: [['sem', JOURS]], jour3: [['sem', JOURS3]], numero: [['jour']] };
  function geo(b, cfg) {
    var P = POLICES[b.police] || PETITE;
    if (b.t === 'heure') {
      var gr = b.taille, ft = Math.round(gr * P.echelle), k = 'h' + b.police + gr;
      var cw = CACHE_G[k] || (CACHE_G[k] = Math.ceil(Math.max.apply(null, '0123456789'.split('').map(function (d) { return mesure(P.fam, ft, d); }))) + 2);
      var pf = padFx(b.effet, ft), hT = Math.round(gr * .82) + pf, dpw = Math.max(10, Math.round(gr * .3)) + pf, s = b.secondes ? Math.round(gr * .4) : 0;
      var ps = s ? padFx(b.effet, Math.round(s * P.echelle)) : 0, scw = s ? Math.ceil(mesure(P.fam, Math.round(s * P.echelle), '0') + 2) + ps : 0;
      cw += pf;
      var w = 4 * cw + dpw + (s ? 2 * scw + 6 : 0);
      return { x: Math.round(b.x - w / 2), y: Math.round(b.y - hT / 2), w: w, h: hT, cw: cw, dpw: dpw, ft: ft, s: s, scw: scw, sh: Math.round(s * .82) + ps };
    }
    if (b.t === 'aiguilles') { var r = Math.round(200 * b.echelle); return { x: b.x - r, y: b.y - r, w: 2 * r, h: 2 * r }; }
    if (b.t === 'date') {
      var fs = b.taille, pd = padFx(b.effet, fs + 2), hD = Math.round(fs * 1.4) + pd, esp = fs > 18 ? 2 : 1, wD = Math.round(fs * 2.4) + pd, gap = Math.round(fs * .3);
      var DF = famDate(b), larg = function (l) { return Math.ceil(Math.max.apply(null, l.map(function (t) { return mesure(DF, fs, DF === PETITE.fam ? t : String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(), esp); }))) + 4 + pd; };
      var f = b.format, P0 = DPARTS[f] || DPARTS.long;
      if (f === 'chiffres') { var wc = wD * 2 + gap * 2 + 8; return { x: Math.round(b.x - wc / 2), y: Math.round(b.y - hD / 2), w: wc, h: hD, wD: wD, gap: gap, fs: fs, esp: esp, parts: [] }; }
      var parts = P0.map(function (q) { return { k: q[0], l: q[1], w: q[0] === 'jour' ? wD : larg(q[1]) }; });
      var wtot = parts.reduce(function (t, q) { return t + q.w; }, 0) + gap * (parts.length - 1), x0;
      if (f === 'long' || f === 'court') x0 = b.x - wD / 2 - gap - parts[0].w; else x0 = b.x - wtot / 2;
      var xx = Math.round(x0); parts.forEach(function (q) { q.x = xx; xx += q.w + gap; });
      return { x: Math.round(x0), y: Math.round(b.y - hD / 2), w: Math.round(wtot), h: hD, wD: wD, gap: gap, fs: fs, esp: esp, parts: parts };
    }
    if (b.t === 'info') {
      var T = TI[b.taille], hv = Math.round(T.val * 1.08) + padFx(b.effet, Math.round(T.val * P.echelle));
      if (b.style === 'ligne') { var wl = Math.round(T.w * 1.15); return { x: b.x - wl / 2, y: b.y - hv / 2, w: wl, h: hv, T: T, hv: hv }; }
      if (b.style === 'case') { var wc = Math.round(T.w * 1.05), hc = T.ic + hv + T.lab + 18 + (b.barre ? 8 : 0); return { x: Math.round(b.x - wc / 2), y: Math.round(b.y - hc / 2), w: wc, h: hc, T: T, hv: hv }; }
      if (b.style === 'jauge' || b.style === 'aiguille') { var dj = Math.round(T.w * (b.style === 'aiguille' ? 1.12 : 1.05)); return { x: Math.round(b.x - dj / 2), y: Math.round(b.y - dj / 2), w: dj, h: dj, T: T, hv: hv }; }
      var hs = T.ic + 4 + hv + T.lab + 6;
      return { x: Math.round(b.x - T.w / 2), y: Math.round(b.y - hs / 2), w: T.w, h: hs, T: T, hv: hv };
    }
    if (b.t === 'meteo') { var T2 = TI[b.taille], ic = T2.ic * 2.2, hv2 = Math.round(T2.val * 1.08) + padFx(b.effet, Math.round(T2.val * P.echelle)), wm = Math.round(ic + 12 + T2.w * .9), hm = Math.round(Math.max(ic, hv2 + (b.minmax ? T2.lab * 1.6 + 4 : 0))); return { x: Math.round(b.x - wm / 2), y: Math.round(b.y - hm / 2), w: wm, h: hm, T: T2, ic: Math.round(ic), hv: hv2 }; }
    if (b.t === 'texte') { var pt = padFx(b.effet, b.taille), wt = Math.ceil(mesure(P.fam, Math.round(b.taille * P.echelle), b.txt, b.esp)) + 4 + pt, ht = Math.round(b.taille * 1.3) + pt; return { x: Math.round(b.x - wt / 2), y: Math.round(b.y - ht / 2), w: wt, h: ht }; }
    if (b.t === 'anim') { var ta = b.taille; return { x: Math.round(b.x - ta / 2), y: Math.round(b.y - ta / 2), w: ta, h: ta }; }
    if (b.t === 'image') { var ti = b.taille; return { x: Math.round(b.x - ti / 2), y: Math.round(b.y - ti / 2), w: ti, h: ti }; }
    if (b.t === 'panneau') return { x: Math.round(b.x - b.l / 2), y: Math.round(b.y - b.h / 2), w: b.l, h: b.h };
    if (b.t === 'trait') { return b.vertical ? { x: b.x - 4, y: b.y - b.l / 2, w: 8, h: b.l } : { x: b.x - b.l / 2, y: b.y - 4, w: b.l, h: 8 }; }
    return { x: b.x - 20, y: b.y - 20, w: 40, h: 40 };
  }

  /* ---------------- paquet : widgets et images ---------------- */
  function paquet(c) {
    var cfg = norm(c), IM = {}, spec = { w: [], nom: cfg.nom };
    var add = function (w) { spec.w.push(w); return w; };
    var put = function (chemin, canvas) { IM[chemin] = canvas; return 'images/' + chemin; };
    var aodDim = mix(cfg.doux, '#000000', .25);
    var ana = cfg.blocs.some(function (b) { return b.t === 'aiguilles' && Math.abs(b.x - CX) < 30 && Math.abs(b.y - CY) < 30; });

    put('fond.png', fond(cfg, false, ana));
    put('fond_aod.png', fond(cfg, true, ana));
    add({ k: 'img', x: 0, y: 0, w: W, h: W, src: 'images/fond.png' });
    add({ k: 'img', x: 0, y: 0, w: W, h: W, src: 'images/fond_aod.png', aod: 1 });
    if (cfg.anneau === 'batterie' || cfg.anneau === 'pas') {
      for (var a = 0; a <= 10; a++) put('anneau/' + a + '.png', anneau(cfg, a / 10));
      add({ k: 'level', type: cfg.anneau === 'batterie' ? 'BATTERY' : 'STEP', x: 0, y: 0, w: W, h: W, dossier: 'anneau', n: 11, g: { kind: 'anneau', c: cfg.accent, r: 228, pw: 9 } });
    }
    /* jeu de chiffres (police, taille, couleur) partagé entre éléments identiques */
    var FX = 'aucun', ICN = 'trait';   // effet et icônes de l'élément en cours
    var chiffres = function (police, val, couleur) {
      var P = POLICES[police] || PETITE, fv = Math.round(val * (P.echelle || 1)), cc = coul(cfg, couleur), fx = FX, dos = 'n' + hash(police + fv + cc + fx), pf = padFx(fx, fv);
      var cw = Math.ceil(Math.max.apply(null, '0123456789'.split('').map(function (d) { return mesure(P.fam, fv, d); }))) + 1 + pf, h = Math.round(val * 1.08) + pf;
      if (!IM[dos + '/0.png']) {
        for (var d = 0; d <= 9; d++) put(dos + '/' + d + '.png', boiteTxt(cw, h, String(d), P.fam, fv, cc, 'center', 0, fx));
        put(dos + '/moins.png', boiteTxt(Math.round(cw * .7), h, '-', P.fam, fv, cc, 'center', 0, fx));
        put(dos + '/invalide.png', boiteTxt(cw * 2, h, '--', P.fam, fv, cfg.doux, 'center'));
        put(dos + '/point.png', boiteTxt(Math.round(cw * .45), h, '.', P.fam, fv, cc, 'center', 0, fx));
        put(dos + '/dp.png', boiteTxt(Math.round(cw * .5), h, ':', P.fam, fv, cc, 'center', 0, fx));
        put(dos + '/pct.png', boiteTxt(Math.round(fv * .9), h, '%', P.fam, Math.round(fv * .7), cfg.doux, 'left', 0, fx));
        put(dos + '/deg.png', boiteTxt(Math.round(fv * .55), h, '°', P.fam, fv, cc, 'left', 0, fx));
      }
      return { dos: dos, cw: cw, h: h, g: { fam: P.fam, px: fv, cw: cw, h: h, c: cc, fx: fx, cu: cfg.doux } };
    };
    var nombre = function (d, x, y, w, h, align, police, val, couleur) {
      var inf = INFOS[d], ch = chiffres(police, val, couleur);
      add({ k: 'num', type: inf.type, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: ch.h, align: align, unite: inf.unite || null, point: inf.point || null, dossier: ch.dos, ex: inf.ex, g: ch.g });
      return ch;
    };
    var meteoNiveau = function (x, y, s, couleur) {
      var cc = coul(cfg, couleur), mode = ICN, dos = 'meteo' + s + hash(cc + mode);
      if (!IM[dos + '/0.png']) for (var m = 0; m < 29; m++) put(dos + '/' + m + '.png', meteoIcone(METEO[m], s, cc, mix(cfg.c1, cc, .12), mode));
      add({ k: 'level', type: 'WEATHER', x: Math.round(x), y: Math.round(y), w: s, h: s, dossier: dos, n: 29, g: { kind: 'meteo', c: cc, mode: mode, c2: mix(cfg.c1, cc, .12) } });
    };
    var barreNiveau = function (d, x, y, w, h, couleur, rayon) {
      var cc = coul(cfg, couleur), dos = 'barre' + hash(d + w + h + cc + (rayon || 0));
      for (var a = 0; a <= 10; a++) put(dos + '/' + a + '.png', rayon ? arc(rayon, w, cc, a / 10) : barre(w, h, cc, a / 10));
      add({ k: 'level', type: INFOS[d].type, x: Math.round(x), y: Math.round(y), w: w, h: h, dossier: dos, n: 11, g: { kind: rayon ? 'arc' : 'barre', c: cc, r: rayon || 0, pw: Math.max(5, w * .07) } });
    };

    /* petit cadran à aiguille : 21 images de l'aiguille (0 à 100 %), affichées par la montre selon la donnée (IMG_LEVEL) */
    var aiguilleNiveau = function (d, x, y, w, couleur) {
      var cc = coul(cfg, couleur), dos = 'aig' + hash(d + w + cc);
      if (!IM[dos + '/0.png']) for (var a = 0; a <= 20; a++) put(dos + '/' + a + '.png', petiteAiguille(w, cc, a / 20, cfg.texte));
      add({ k: 'level', type: INFOS[d].type, x: Math.round(x), y: Math.round(y), w: w, h: w, dossier: dos, n: 21, g: { kind: 'aiguille', c: cc, r: Math.round(w / 2 - 6), pw: Math.max(3, w * .04) } });
    };

    var pointeurs = [];
    cfg.blocs.forEach(function (b, bi) {
      var G = geo(b, cfg), P = POLICES[b.police] || PETITE; FX = b.effet || 'aucun'; ICN = b.icone || 'trait';
      if (b.t === 'heure') {
        ['', '_aod'].forEach(function (suf, k) {
          var dos = 'heure' + bi + suf, col = k ? aodDim : coul(cfg, b.couleur), cdp = k ? aodDim : coul(cfg, b.dp);
          for (var d = 0; d <= 9; d++) put(dos + '/' + d + '.png', boiteTxt(G.cw, G.h, String(d), P.fam, G.ft, col, 'center', 0, k ? null : FX));
          put(dos + '/dp.png', boiteTxt(G.dpw, G.h, ':', P.fam, G.ft, cdp, 'center', 0, k ? null : FX));
          var w = { k: 'time', x: G.x, y: G.y, dossier: dos, cw: G.cw, dpw: G.dpw, h: G.h, aod: k ? 1 : 0, g: { fam: P.fam, px: G.ft, c: col, cdp: cdp, fx: k ? 'aucun' : FX } };
          if (G.s && !k) {
            var sd = 'sec' + bi;
            for (var e = 0; e <= 9; e++) put(sd + '/' + e + '.png', boiteTxt(G.scw, G.sh, String(e), P.fam, Math.round(G.s * P.echelle), coul(cfg, b.dp), 'center', 0, FX));
            w.sec = { x: G.x + 4 * G.cw + G.dpw + 6, y: G.y + G.h - G.sh - Math.round(G.h * .04), dossier: sd, cw: G.scw, h: G.sh, g: { px: Math.round(G.s * P.echelle), c: coul(cfg, b.dp) } };
          }
          add(w);
        });
      }
      else if (b.t === 'date') {
        var f = b.format;
        ['', '_aod'].forEach(function (suf, k) {
          if (k && cfg.aod !== 'heure_date') return;
          var dd = 'date' + bi + suf, col = k ? aodDim : coul(cfg, b.couleur === 'texte' ? 'doux' : b.couleur), colJ = k ? aodDim : coul(cfg, b.jour), fx = k ? null : FX;
          var w = { k: 'date', aod: k ? 1 : 0, dossier: dd, h: G.h, g: { fx: fx || 'aucun', fs: G.fs, esp: G.esp, fam: famDate(b), parts: [] } }, seul = G.parts.length === 1;
          G.parts.forEach(function (q, qi) {
            var nums = []; for (var n0 = 1; n0 <= 31; n0++) nums.push(n0 === 1 && f === 'long' ? '1ER' : String(n0));
            if (q.k === 'sem') { q.l.forEach(function (j, i) { put(dd + '/semaine/' + i + '.png', boiteTxt(q.w, G.h, j, famDate(b), G.fs, col, seul ? 'center' : 'right', G.esp, fx)); }); w.sem = { x: q.x, y: G.y }; w.g.parts.push({ t: 's', x: q.x, w: q.w, al: seul ? 'center' : 'right', px: G.fs, esp: G.esp, c: col, l: q.l }); }
            if (q.k === 'jour') { nums.forEach(function (t, i) { put(dd + '/jour/' + i + '.png', boiteTxt(q.w, G.h, t, famDate(b), G.fs + 1, colJ, 'center', 0, fx)); }); w.jour = { x: q.x, y: G.y }; w.g.parts.push({ t: 'j', x: q.x, w: q.w, al: 'center', px: G.fs + 1, esp: 0, c: colJ, l: nums }); }
            if (q.k === 'mois') { q.l.forEach(function (j, i) { put(dd + '/mois/' + i + '.png', boiteTxt(q.w, G.h, j, famDate(b), G.fs, col, 'left', G.esp, fx)); }); w.mois = { x: q.x, y: G.y }; w.g.parts.push({ t: 'm', x: q.x, w: q.w, al: 'left', px: G.fs, esp: G.esp, c: col, l: q.l }); }
          });
          if (f === 'chiffres') {
            for (var n2 = 1; n2 <= 31; n2++) put(dd + '/jour/' + (n2 - 1) + '.png', boiteTxt(G.wD, G.h, ('0' + n2).slice(-2), famDate(b), G.fs + 2, colJ, 'right', 0, fx));
            for (var m2 = 1; m2 <= 12; m2++) put(dd + '/mois/' + (m2 - 1) + '.png', boiteTxt(G.wD, G.h, ('0' + m2).slice(-2), famDate(b), G.fs + 2, col, 'left', 0, fx));
            w.jour = { x: G.x, y: G.y }; w.mois = { x: G.x + G.wD + 2 * G.gap + 8, y: G.y };
            var d2 = function (n) { var l = []; for (var i = 1; i <= n; i++) l.push(('0' + i).slice(-2)); return l; };
            w.g.parts.push({ t: 'j', x: G.x, w: G.wD, al: 'right', px: G.fs + 2, esp: 0, c: colJ, l: d2(31) }, { t: 'm', x: G.x + G.wD + 2 * G.gap + 8, w: G.wD, al: 'left', px: G.fs + 2, esp: 0, c: col, l: d2(12) });
          }
          add(w);
        });
      }
      else if (b.t === 'info') {
        var T = G.T, inf = INFOS[b.d], cx = b.x;
        if (b.style === 'ligne') {
          if (b.d === 'meteo') meteoNiveau(G.x, b.y - T.ic / 2, T.ic, b.couleur);
          nombre(b.d, G.x + T.ic + 6, G.y, G.w - T.ic - 6, G.hv, 'gauche', b.police, T.val, b.valeur);
        } else if (b.style === 'case') {
          if (b.d === 'meteo') meteoNiveau(G.x + 8, G.y + 6, T.ic, b.couleur);
          nombre(b.d, G.x, G.y + T.ic + 8, G.w, G.hv, 'centre', b.police, T.val, b.valeur);
          if (b.barre) barreNiveau(b.d, G.x + 10, G.y + G.h - 12, G.w - 20, 6, b.couleur);
        } else if (b.style === 'aiguille') {
          nombre(b.d, G.x, Math.round(b.y + G.h * .17), G.w, 0, 'centre', b.police, Math.round(T.val * .6), b.valeur);
          aiguilleNiveau(b.d, G.x, G.y, G.w, b.couleur);
        } else if (b.style === 'jauge') {
          if (b.barre) barreNiveau(b.d, G.x, G.y, G.w, G.h, b.couleur, Math.round(G.w / 2 - 6));
          if (b.d === 'meteo') meteoNiveau(cx - T.ic / 2, G.y + G.h * .2, T.ic, b.couleur);
          nombre(b.d, G.x, b.y - G.hv / 2 + T.ic * .35, G.w, G.hv, 'centre', b.police, T.val, b.valeur);
        } else {
          var top = G.y;
          if (b.d === 'meteo') meteoNiveau(cx - (T.ic + 8) / 2, top - 4, T.ic + 8, b.couleur);
          nombre(b.d, G.x, top + T.ic + 4, G.w, G.hv, 'centre', b.police, T.val, b.valeur);
        }
        add({ k: 'click', type: inf.type, x: G.x, y: G.y, w: G.w, h: G.h });
      }
      else if (b.t === 'meteo') {
        var T3 = G.T;
        meteoNiveau(G.x, b.y - G.ic / 2, G.ic, b.couleur);
        var xt = G.x + G.ic + 10, wt = G.w - G.ic - 10;
        nombre('meteo', xt, b.minmax ? G.y : b.y - G.hv / 2, wt, G.hv, 'gauche', b.police, T3.val, b.valeur);
        if (b.minmax) {
          var ys = G.y + G.hv + 4, ws = Math.round(wt / 2);
          nombre('tmin', xt + 14, ys, ws - 14, 0, 'gauche', b.police, Math.round(T3.lab * 1.4), 'doux');
          nombre('tmax', xt + ws + 14, ys, ws - 14, 0, 'gauche', b.police, Math.round(T3.lab * 1.4), 'doux');
        }
        add({ k: 'click', type: 'WEATHER_CURRENT', x: G.x, y: G.y, w: G.w, h: G.h });
      }
      else if (b.t === 'anim') {
        var na = ANIM_N[b.motif] || 24, da = 'anim' + bi + hash(b.motif + b.taille + coul(cfg, b.couleur));
        for (var fa = 0; fa < na; fa++) put(da + '/f_' + fa + '.png', imageAnim(b, cfg, fa, na));
        add({ k: 'anim', x: G.x, y: G.y, w: G.w, h: G.h, dossier: da, n: na, fps: b.motif === 'flamme' ? 12 : b.motif === 'radar' ? 15 : 12 });
      }
      else if (b.t === 'aiguilles') pointeurs.push(b);
    });
    // aiguilles en dernier : au-dessus de tout
    pointeurs.forEach(function (b, n) {
      var H = aiguille(cfg, b, 'h', false), M = aiguille(cfg, b, 'm', false), S = b.secondes ? aiguille(cfg, b, 's', false) : null;
      var Ha = aiguille(cfg, b, 'h', true), Ma = aiguille(cfg, b, 'm', true), d = 'aiguilles' + n;
      put(d + '/h.png', H.c); put(d + '/m.png', M.c); if (S) put(d + '/s.png', S.c); put(d + '/h_aod.png', Ha.c); put(d + '/m_aod.png', Ma.c);
      var cs = Math.round(24 * Math.max(.6, b.echelle));
      put(d + '/centre.png', centre(cfg, false, cs)); put(d + '/centre_aod.png', centre(cfg, true, cs));
      add({ k: 'pointer', g: { b: b, cs: cs }, cx: b.x, cy: b.y, h: { src: 'images/' + d + '/h.png', px: H.px, py: H.py }, m: { src: 'images/' + d + '/m.png', px: M.px, py: M.py }, s: S ? { src: 'images/' + d + '/s.png', px: S.px, py: S.py } : null });
      add({ k: 'img', x: b.x - cs / 2, y: b.y - cs / 2, w: cs, h: cs, src: 'images/' + d + '/centre.png' });
      add({ k: 'pointer', aod: 1, cx: b.x, cy: b.y, h: { src: 'images/' + d + '/h_aod.png', px: Ha.px, py: Ha.py }, m: { src: 'images/' + d + '/m_aod.png', px: Ma.px, py: Ma.py }, s: null });
      add({ k: 'img', x: b.x - cs / 2, y: b.y - cs / 2, w: cs, h: cs, src: 'images/' + d + '/centre_aod.png', aod: 1 });
    });
    if (cfg.calques.indexOf('verre') >= 0 || cfg.calques.indexOf('lunette') >= 0) {
      put('dessus.png', dessus(cfg));
      add({ k: 'img', x: 0, y: 0, w: W, h: W, src: 'images/dessus.png' });
    }
    put('zone.png', toile(4, 4));
    spec.cfg = cfg;
    return { spec: spec, images: IM };
  }

  /* ---------------- fonds (partie fixe : motif, photo, anneau, icônes, étiquettes, cases) ---------------- */
  var PHOTOS = {};
  function photoImg(src) {
    if (!src || !root.Image) return null;
    var p = PHOTOS[src]; if (p) return p.ok ? p.im : null;
    p = PHOTOS[src] = { im: new root.Image(), ok: false };
    p.im.onload = function () { p.ok = true; if (CADRAN.onphoto) CADRAN.onphoto(); };
    p.im.src = src; if (p.im.complete && p.im.naturalWidth) p.ok = true;
    return p.ok ? p.im : null;
  }
  function chargerPhoto(src) {
    if (!src) return Promise.resolve();
    return new Promise(function (ok) { var i = 0, t = setInterval(function () { if (photoImg(src) || ++i > 100) { clearInterval(t); ok(); } }, 30); photoImg(src); });
  }
  function fond(cfg, aod, ana, kk) {
    kk = kk || 1;
    var c = toile(W * kk, W * kk), g = c.getContext('2d'); g.scale(kk, kk);
    g.save(); g.beginPath(); g.arc(CX, CY, CX, 0, 7); g.clip();
    if (aod) { g.fillStyle = '#000'; g.fillRect(0, 0, W, W); }
    else if (cfg.fond !== 'transparent') {
      var A = cfg.c1, B = cfg.c2, gr;
      if (cfg.fond === 'degrade') { gr = g.createLinearGradient(0, 0, 0, W); gr.addColorStop(0, B); gr.addColorStop(1, A); g.fillStyle = gr; }
      else if (cfg.fond === 'radial' || cfg.fond === 'hud') { gr = g.createRadialGradient(CX, CY * .9, 10, CX, CY, CX); gr.addColorStop(0, B); gr.addColorStop(1, A); g.fillStyle = gr; }
      else g.fillStyle = A;
      g.fillRect(0, 0, W, W);
      if (cfg.fond === 'photo') {
        var im = photoImg(cfg.photo);
        if (im) { var s = Math.max(W / im.width, W / im.height); g.drawImage(im, CX - im.width * s / 2, CY - im.height * s / 2, im.width * s, im.height * s); }
        g.fillStyle = 'rgba(0,0,0,' + cfg.voile + ')'; g.fillRect(0, 0, W, W);
      }
      if (cfg.fond === 'carbone') {
        for (var y = 0; y < W; y += 8) for (var x = 0; x < W; x += 8) {
          var sh = ((x / 8 + y / 8) % 2) ? .07 : .02;
          g.fillStyle = rgba(B, 1); g.globalAlpha = .55; g.fillRect(x, y, 8, 4); g.globalAlpha = 1;
          g.fillStyle = 'rgba(255,255,255,' + sh + ')'; g.fillRect(x + ((y / 8) % 2 ? 0 : 4), y, 4, 8);
        }
      }
      if (cfg.fond === 'grille' || cfg.fond === 'hud') {
        g.strokeStyle = rgba(cfg.accent, cfg.fond === 'hud' ? .06 : .09); g.lineWidth = 1;
        for (var k = 0; k <= W; k += 24) { g.beginPath(); g.moveTo(k + .5, 0); g.lineTo(k + .5, W); g.moveTo(0, k + .5); g.lineTo(W, k + .5); g.stroke(); }
      }
      if (cfg.fond === 'hud') {
        g.strokeStyle = rgba(cfg.accent, .22); g.lineWidth = 1.2;
        [70, 140, 200].forEach(function (r, i) { g.setLineDash(i === 1 ? [2, 6] : []); g.beginPath(); g.arc(CX, CY, r, 0, 7); g.stroke(); });
        g.setLineDash([]);
        for (var q = 0; q < 4; q++) { g.beginPath(); g.arc(CX, CY, 212, q * Math.PI / 2 + .25, q * Math.PI / 2 + 1.3); g.strokeStyle = rgba(cfg.accent, .4); g.lineWidth = 2; g.stroke(); }
      }
      if (SCENES[cfg.fond]) { PLAT = cfg.montre !== 'trex3'; SCENES[cfg.fond](g); PLAT = false; }
      if (cfg.fond === 'camo') {
        var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        var cols = [B, mix(A, B, .5), mix(B, '#000000', .35)];
        for (var t = 0; t < 70; t++) {
          g.fillStyle = cols[t % 3]; g.beginPath();
          var bx = rnd() * W, by = rnd() * W, r0 = 18 + rnd() * 34;
          for (var a2 = 0; a2 <= 12; a2++) { var an = a2 / 12 * Math.PI * 2, rr = r0 * (.6 + rnd() * .6); g[a2 ? 'lineTo' : 'moveTo'](bx + Math.cos(an) * rr * 1.4, by + Math.sin(an) * rr); }
          g.closePath(); g.fill();
        }
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, W, W);
      }
    }
    if (!aod && cfg.fond !== 'transparent') fondLuxe(g, cfg);
    if (!aod && cfg.fond !== 'transparent') calquesFond(g, cfg);
    // anneau fixe
    var acc = aod ? mix(cfg.doux, '#000', .5) : cfg.accent, fin = aod ? mix(cfg.doux, '#000', .65) : rgba(cfg.texte, .5);
    anneauLuxe(g, cfg, aod);
    if (cfg.anneau === 'graduations' || (ana && (cfg.anneau === 'batterie' || cfg.anneau === 'pas'))) {
      for (var i = 0; i < 60; i++) {
        if (aod && i % 5) continue;
        var an2 = i * Math.PI / 30, maj = i % 5 === 0, r1 = 236, r2 = maj ? 220 : 229;
        if (cfg.anneau === 'batterie' || cfg.anneau === 'pas') { r1 = 214; r2 = maj ? 202 : 208; }
        g.strokeStyle = maj ? acc : fin; g.lineWidth = maj ? 3 : 1.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(CX + Math.sin(an2) * r1, CY - Math.cos(an2) * r1); g.lineTo(CX + Math.sin(an2) * r2, CY - Math.cos(an2) * r2); g.stroke();
      }
    }
    if (cfg.anneau === 'chiffres') {
      var PF = POLICES[cfg.police];
      for (var h = 1; h <= 12; h++) {
        if (!ana && h % 3) continue;
        if (aod && h % 3) continue;
        var an3 = h * Math.PI / 6, rr2 = ana ? 205 : 214, ts = ana ? (h % 3 ? 22 : 30) : 24;
        texte(g, String(h), CX + Math.sin(an3) * rr2, CY - Math.cos(an3) * rr2 + ts * .36, PF.fam, Math.round(ts * PF.echelle), h % 3 ? fin : acc, 'center');
      }
      if (!aod) for (var j = 0; j < 60; j++) { if (j % 5 === 0) continue; var an4 = j * Math.PI / 30; g.fillStyle = fin; g.beginPath(); g.arc(CX + Math.sin(an4) * 232, CY - Math.cos(an4) * 232, 1.3, 0, 7); g.fill(); }
    }
    // parties fixes des éléments (écran allumé seulement ; textes et traits aussi en AOD, atténués)
    cfg.blocs.forEach(function (b) {
      var G = geo(b, cfg), cc = coul(cfg, b.couleur);
      if (b.t === 'texte') { var P = POLICES[b.police] || PETITE; texte(g, b.txt, b.x, Math.round(b.y + b.taille * .36), P.fam, Math.round(b.taille * P.echelle), aod ? aodDimDe(cfg) : cc, 'center', b.esp, aod ? null : b.effet); return; }
      if (b.t === 'image') { if (!aod) { g.save(); g.translate(b.x, b.y); g.rotate(b.rot * Math.PI / 180); motif(g, b.motif, 0, 0, b.taille, b.couleur === 'auto' ? null : coul(cfg, b.couleur)); g.restore(); } return; }
      if (b.t === 'panneau') { if (!aod) panneau(g, b, G, cfg); return; }
      if (b.t === 'trait') { g.strokeStyle = aod ? mix(cfg.doux, '#000', .6) : cc; g.lineWidth = b.ep; g.lineCap = 'round'; g.beginPath(); if (b.vertical) { g.moveTo(b.x, G.y); g.lineTo(b.x, G.y + G.h); } else { g.moveTo(G.x, b.y); g.lineTo(G.x + G.w, b.y); } g.stroke(); return; }
      if (aod) return;
      if (b.t === 'date' && b.cadre) {
        g.save(); rond(g, G.x - 7, G.y - 2, G.w + 14, G.h + 4, Math.min(10, G.h / 2)); g.fillStyle = 'rgba(0,0,0,.45)'; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 5; g.fill(); g.restore();
        rond(g, G.x - 7, G.y - 2, G.w + 14, G.h + 4, Math.min(10, G.h / 2)); g.strokeStyle = rgba(cfg.accent, .7); g.lineWidth = 1.5; g.stroke();
      }
      if (b.t === 'date' && b.format === 'chiffres') { texte(g, '/', b.x, Math.round(b.y + b.taille * .4), famDate(b), b.taille + 2, cfg.doux, 'center'); return; }
      if (b.t === 'meteo') {
        if (b.minmax) { var T0 = G.T, xt = G.x + G.ic + 10, ys = G.y + G.hv + 4 + Math.round(T0.lab * 1.4 * 1.08) / 2, ws = Math.round((G.w - G.ic - 10) / 2); icone(g, 'bas', xt + 6, ys, 12, '#5ab0ff'); icone(g, 'haut', xt + ws + 6, ys, 12, '#ff7a5a'); }
        return;
      }
      if (b.t !== 'info') return;
      var inf = INFOS[b.d], T = G.T;
      if (b.style === 'ligne') { if (b.d !== 'meteo') iconeFx(g, b, inf.ic, G.x + T.ic / 2, b.y, T.ic, cc); return; }
      if (b.style === 'case') {
        if (b.effet && b.effet !== 'aucun' && HEX.test(cc)) {
          g.save(); rond(g, G.x, G.y, G.w, G.h, 12); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
          var gc = g.createLinearGradient(0, G.y, 0, G.y + G.h); gc.addColorStop(0, mix(cc, cfg.c1, .55)); gc.addColorStop(1, mix(cc, '#000000', .82)); g.fillStyle = gc; g.fill(); g.restore();
          g.save(); rond(g, G.x + 1, G.y + 1, G.w - 2, G.h - 2, 11); g.clip(); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(G.x, G.y, G.w, G.h * .42); g.restore();
          rond(g, G.x, G.y, G.w, G.h, 12); g.strokeStyle = rgba(cc, .7); g.lineWidth = 1.5; g.stroke();
        } else { rond(g, G.x, G.y, G.w, G.h, 12); g.fillStyle = rgba(cc, .16); g.fill(); g.strokeStyle = rgba(cc, .55); g.lineWidth = 1.5; g.stroke(); }
        if (b.d !== 'meteo') iconeFx(g, b, inf.ic, G.x + 8 + T.ic / 2, G.y + 6 + T.ic / 2, T.ic, cc);
        var dispo = G.w - 22 - T.ic, tl = T.lab; while (tl > 7 && mesure(PETITE.fam, tl, inf.lab, 1) > dispo) tl--;
        texte(g, inf.lab, G.x + G.w - 8, G.y + 6 + T.ic / 2 + tl * .36, PETITE.fam, tl, cc, 'right', 1);
        if (b.barre) { rond(g, G.x + 10, G.y + G.h - 12, G.w - 20, 6, 3); g.fillStyle = rgba(cc, .22); g.fill(); }
        return;
      }
      if (b.style === 'aiguille') {
        var Ra = G.w / 2 - 4, gd = g.createRadialGradient(b.x, b.y - Ra * .3, Ra * .1, b.x, b.y, Ra);
        gd.addColorStop(0, mix(cc, cfg.c2, .82)); gd.addColorStop(1, mix(cc, '#000000', .9));
        g.save(); g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 8; g.shadowOffsetY = 2; g.beginPath(); g.arc(b.x, b.y, Ra, 0, 7); g.fillStyle = gd; g.fill(); g.restore();
        g.lineWidth = 2; g.strokeStyle = rgba(cc, .75); g.beginPath(); g.arc(b.x, b.y, Ra, 0, 7); g.stroke();
        g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(b.x, b.y, Ra - 3, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        for (var t9 = 0; t9 <= 30; t9++) {
          var a9 = (-135 + t9 * 9) * Math.PI / 180, mj = t9 % 5 === 0, r9 = Ra - 6, r8 = r9 - (mj ? Ra * .16 : Ra * .08);
          g.strokeStyle = mj ? cfg.texte : rgba(cfg.texte, .45); g.lineWidth = mj ? 2 : 1; g.lineCap = 'round';
          g.beginPath(); g.moveTo(b.x + Math.sin(a9) * r9, b.y - Math.cos(a9) * r9); g.lineTo(b.x + Math.sin(a9) * r8, b.y - Math.cos(a9) * r8); g.stroke();
        }
        g.lineWidth = 2.5; g.strokeStyle = cc; g.beginPath(); g.arc(b.x, b.y, Ra - 6, Math.PI * 1.95, Math.PI * 2.25); g.stroke();
        if (b.d !== 'meteo') iconeFx(g, b, inf.ic, b.x, b.y - Ra * .38, Math.round(T.ic * .8), cc);
        texte(g, inf.lab, b.x, Math.round(b.y + Ra * .86), PETITE.fam, Math.max(8, T.lab - 1), cfg.doux, 'center', 1);
        return;
      }
      if (b.style === 'jauge') {
        var R = G.w / 2 - 6;
        g.lineCap = 'round'; g.lineWidth = Math.max(5, G.w * .07); g.strokeStyle = rgba(cc, .2);
        g.beginPath(); g.arc(b.x, b.y, R, Math.PI * .75, Math.PI * 2.25); g.stroke();
        if (!b.barre) { g.strokeStyle = cc; g.beginPath(); g.arc(b.x, b.y, R, Math.PI * .75, Math.PI * .75 + .12); g.stroke(); }
        if (b.d !== 'meteo') iconeFx(g, b, inf.ic, b.x, G.y + G.h * .3, T.ic, cc);
        texte(g, inf.lab, b.x, Math.round(b.y + G.hv / 2 + T.ic * .35 + T.lab + 4), PETITE.fam, T.lab, cfg.doux, 'center', 1);
        return;
      }
      // simple et cercle
      if (b.d !== 'meteo') iconeFx(g, b, inf.ic, b.x, G.y + T.ic / 2 - 2, T.ic, cc);
      texte(g, inf.lab, b.x, G.y + T.ic + 4 + G.hv + T.lab + 1, PETITE.fam, T.lab, cfg.doux, 'center', 1.5);
      if (b.style === 'cercle') { g.strokeStyle = rgba(cc, .3); g.lineWidth = 1; g.beginPath(); g.arc(b.x, G.y + G.h / 2 - 4, Math.round(44 * T.w / 92), 0, 7); g.stroke(); }
    });
    g.restore();
    return c;
  }
  function iconeFx(g, b, nom, x, y, t, cc) {
    var fx = b.effet && b.effet !== 'aucun';
    if (fx) { g.save(); g.shadowColor = b.effet === 'lueur' ? cc : 'rgba(0,0,0,.7)'; g.shadowBlur = b.effet === 'lueur' ? t * .4 : 3; g.shadowOffsetY = b.effet === 'lueur' ? 0 : 1.5; }
    icone(g, nom, x, y, t, cc); if (fx) g.restore();
  }
  /* ---------------- images simples (motifs) et fonds illustrés : aplats de couleurs franches (lisibles aussi sur l'écran 64 couleurs des Garmin) ---------------- */
  function ell(g, x, y, rx, ry, a, c) { g.beginPath(); g.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), a || 0, 0, 7); g.fillStyle = c; g.fill(); }
  function disque(g, x, y, r, c) { g.beginPath(); g.arc(x, y, Math.max(.1, r), 0, 7); g.fillStyle = c; g.fill(); }
  function poly(g, pts, c) { g.beginPath(); for (var i = 0; i < pts.length; i += 2) g[i ? 'lineTo' : 'moveTo'](pts[i], pts[i + 1]); g.closePath(); g.fillStyle = c; g.fill(); }
  function etoileP(g, x, y, r, ri, n, c, a0) { var p = []; for (var i = 0; i < n * 2; i++) { var a = (a0 || -Math.PI / 2) + i * Math.PI / n, rr = i % 2 ? ri : r; p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } poly(g, p, c); }
  /* motif centré en (x, y), dans un carré de côté s ; c : couleur imposée (sinon celles du motif) */
  function motif(g, nom, x, y, s, c) {
    var r = s / 2, k = function (d) { return c || d; };
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    switch (nom) {
      case 'fleur': for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3; ell(g, x + Math.cos(a) * r * .48, y + Math.sin(a) * r * .48, r * .42, r * .26, a, k('#ff5fa2')); } disque(g, x, y, r * .3, '#ffd23f'); disque(g, x - r * .08, y - r * .08, r * .1, '#fff3a0'); break;
      case 'marguerite': for (var j = 0; j < 12; j++) { var b = j * Math.PI / 6; ell(g, x + Math.cos(b) * r * .55, y + Math.sin(b) * r * .55, r * .4, r * .13, b, k('#ffffff')); } disque(g, x, y, r * .27, '#ffbf00'); break;
      case 'tulipe':
        g.strokeStyle = '#3f9a3a'; g.lineWidth = Math.max(2, s * .06); g.beginPath(); g.moveTo(x, y + r); g.lineTo(x, y - r * .1); g.stroke();
        ell(g, x - r * .28, y + r * .45, r * .32, r * .1, -.7, '#4caf50'); ell(g, x + r * .28, y + r * .55, r * .32, r * .1, .7, '#4caf50');
        g.beginPath(); g.moveTo(x - r * .45, y - r * .75); g.lineTo(x - r * .15, y - r * .45); g.lineTo(x, y - r * .85); g.lineTo(x + r * .15, y - r * .45); g.lineTo(x + r * .45, y - r * .75);
        g.quadraticCurveTo(x + r * .5, y - r * .05, x, y - r * .05); g.quadraticCurveTo(x - r * .5, y - r * .05, x - r * .45, y - r * .75); g.fillStyle = k('#ff3b3b'); g.fill(); break;
      case 'feuille':
        g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x + r * .8, y - r * .1, x, y + r * .75); g.quadraticCurveTo(x - r * .8, y - r * .1, x, y - r); g.fillStyle = k('#5fbf3a'); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(1, s * .03); g.beginPath(); g.moveTo(x, y - r * .8); g.lineTo(x, y + r); g.stroke(); break;
      case 'erable':
        etoileP(g, x, y - r * .1, r * .85, r * .42, 5, k('#ff6a1a')); etoileP(g, x, y - r * .1, r * .55, r * .3, 5, k('#ff6a1a'), -Math.PI / 2 + Math.PI / 5);
        g.strokeStyle = mix(c || '#ff6a1a', '#000000', .45); g.lineWidth = Math.max(1.5, s * .04); g.beginPath(); g.moveTo(x, y - r * .3); g.lineTo(x, y + r); g.stroke(); break;
      case 'flocon':
        g.strokeStyle = k('#e8f6ff'); g.lineWidth = Math.max(1.5, s * .07);
        for (var f = 0; f < 6; f++) { g.save(); g.translate(x, y); g.rotate(f * Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r); g.moveTo(0, -r * .55); g.lineTo(-r * .25, -r * .8); g.moveTo(0, -r * .55); g.lineTo(r * .25, -r * .8); g.stroke(); g.restore(); } break;
      case 'soleil':
        g.strokeStyle = k('#ffb000'); g.lineWidth = Math.max(2, s * .07);
        for (var q = 0; q < 12; q++) { var t = q * Math.PI / 6; g.beginPath(); g.moveTo(x + Math.cos(t) * r * .62, y + Math.sin(t) * r * .62); g.lineTo(x + Math.cos(t) * r * .95, y + Math.sin(t) * r * .95); g.stroke(); }
        disque(g, x, y, r * .48, k('#ffd23f')); break;
      case 'lune': var tl = toile(Math.ceil(s) + 2, Math.ceil(s) + 2), hl = tl.getContext('2d'); disque(hl, r + 1, r + 1, r * .8, k('#f4ecc0')); hl.globalCompositeOperation = 'destination-out'; disque(hl, r + 1 + r * .45, r + 1 - r * .3, r * .68, '#000'); g.drawImage(tl, x - r - 1, y - r - 1); break;
      case 'sapin':
        g.fillStyle = '#6b3d1e'; g.fillRect(x - r * .1, y + r * .6, r * .2, r * .4);
        poly(g, [x, y - r, x + r * .45, y - r * .3, x - r * .45, y - r * .3], k('#2e8b3a')); poly(g, [x, y - r * .6, x + r * .62, y + .15 * r, x - r * .62, y + .15 * r], k('#2e8b3a')); poly(g, [x, y - r * .2, x + r * .8, y + r * .65, x - r * .8, y + r * .65], k('#2e8b3a'));
        disque(g, x - r * .3, y + r * .45, r * .07, '#ff3b3b'); disque(g, x + r * .25, y + r * .05, r * .07, '#ffd23f'); disque(g, x + r * .05, y - r * .45, r * .06, '#2ec4ff'); etoileP(g, x, y - r, r * .16, r * .07, 5, '#ffd23f'); break;
      case 'etoile': etoileP(g, x, y + r * .06, r * .95, r * .42, 5, k('#ffd23f')); break;
      case 'coeur':
        g.beginPath(); g.moveTo(x, y + r * .85); g.bezierCurveTo(x - r * 1.2, y + r * .05, x - r * .6, y - r * .95, x, y - r * .4); g.bezierCurveTo(x + r * .6, y - r * .95, x + r * 1.2, y + r * .05, x, y + r * .85); g.fillStyle = k('#ff3b5c'); g.fill(); break;
      case 'papillon':
        ell(g, x - r * .45, y - r * .3, r * .45, r * .38, -.4, k('#2ec4ff')); ell(g, x + r * .45, y - r * .3, r * .45, r * .38, .4, k('#2ec4ff'));
        ell(g, x - r * .35, y + r * .35, r * .3, r * .25, .4, k('#b45cff')); ell(g, x + r * .35, y + r * .35, r * .3, r * .25, -.4, k('#b45cff'));
        ell(g, x, y, r * .08, r * .55, 0, '#1a1a1a'); g.strokeStyle = '#1a1a1a'; g.lineWidth = Math.max(1, s * .025); g.beginPath(); g.moveTo(x, y - r * .5); g.lineTo(x - r * .2, y - r * .85); g.moveTo(x, y - r * .5); g.lineTo(x + r * .2, y - r * .85); g.stroke(); break;
      case 'champignon':
        g.fillStyle = '#f2e6cf'; g.beginPath(); g.moveTo(x - r * .22, y + r * .9); g.lineTo(x - r * .16, y); g.lineTo(x + r * .16, y); g.lineTo(x + r * .22, y + r * .9); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(x - r * .9, y + r * .05); g.quadraticCurveTo(x - r * .85, y - r * .85, x, y - r * .85); g.quadraticCurveTo(x + r * .85, y - r * .85, x + r * .9, y + r * .05); g.closePath(); g.fillStyle = k('#e8322a'); g.fill();
        disque(g, x - r * .4, y - r * .3, r * .12, '#ffffff'); disque(g, x + r * .15, y - r * .55, r * .1, '#ffffff'); disque(g, x + r * .5, y - r * .2, r * .09, '#ffffff'); break;
      case 'citrouille':
        g.fillStyle = '#4a7a2a'; g.fillRect(x - r * .07, y - r * .85, r * .14, r * .3);
        ell(g, x - r * .45, y + r * .1, r * .45, r * .65, 0, mix(c || '#ff7a1a', '#000000', .2)); ell(g, x + r * .45, y + r * .1, r * .45, r * .65, 0, mix(c || '#ff7a1a', '#000000', .2)); ell(g, x, y + r * .1, r * .5, r * .7, 0, k('#ff7a1a')); break;
      case 'cadeau':
        g.fillStyle = k('#ff3b3b'); g.fillRect(x - r * .75, y - r * .3, r * 1.5, r * 1.1); g.fillStyle = mix(c || '#ff3b3b', '#000000', .2); g.fillRect(x - r * .85, y - r * .5, r * 1.7, r * .3);
        g.fillStyle = '#ffd23f'; g.fillRect(x - r * .1, y - r * .5, r * .2, r * 1.3); ell(g, x - r * .25, y - r * .65, r * .25, r * .15, .5, '#ffd23f'); ell(g, x + r * .25, y - r * .65, r * .25, r * .15, -.5, '#ffd23f'); break;
      case 'planete': { var gp = g.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r * .8); gp.addColorStop(0, '#ffd9a0'); gp.addColorStop(1, k('#c8562e')); g.fillStyle = gp; g.beginPath(); g.arc(x, y, r * .8, 0, 7); g.fill();
        g.save(); g.beginPath(); g.arc(x, y, r * .8, 0, 7); g.clip(); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x - r, y - r * .25, 2 * r, r * .14); g.fillRect(x - r, y + r * .15, 2 * r, r * .1); g.restore(); break; }
      case 'saturne': { g.strokeStyle = '#f0dca8'; g.lineWidth = Math.max(1.5, s * .05); g.beginPath(); g.ellipse(x, y, r * .95, r * .28, -.35, Math.PI, 7); g.stroke();
        var gs = g.createRadialGradient(x - r * .2, y - r * .2, r * .05, x, y, r * .5); gs.addColorStop(0, '#fff0c8'); gs.addColorStop(1, k('#c9a15a')); g.fillStyle = gs; g.beginPath(); g.arc(x, y, r * .5, 0, 7); g.fill();
        g.beginPath(); g.ellipse(x, y, r * .95, r * .28, -.35, 0, Math.PI); g.stroke(); break; }
      case 'terre': disque(g, x, y, r * .8, k('#2b6fd6'));
        [[-.3, -.25, .28, .22], [.25, .1, .3, .2], [-.1, .4, .2, .12], [.35, -.4, .14, .1]].forEach(function (q) { ell(g, x + q[0] * r, y + q[1] * r, q[2] * r, q[3] * r, .4, '#3fae4a'); });
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = Math.max(1, s * .02); g.beginPath(); g.arc(x, y, r * .8, 0, 7); g.stroke(); break;
      case 'fusee':
        poly(g, [x, y - r, x + r * .3, y - r * .45, x + r * .3, y + r * .45, x - r * .3, y + r * .45, x - r * .3, y - r * .45], k('#e8eef5'));
        poly(g, [x, y - r, x + r * .3, y - r * .45, x - r * .3, y - r * .45], '#ff3b3b'); disque(g, x, y - r * .12, r * .13, '#2ec4ff');
        poly(g, [x - r * .3, y + r * .1, x - r * .55, y + r * .6, x - r * .3, y + r * .45], '#ff3b3b'); poly(g, [x + r * .3, y + r * .1, x + r * .55, y + r * .6, x + r * .3, y + r * .45], '#ff3b3b');
        poly(g, [x - r * .18, y + r * .45, x, y + r, x + r * .18, y + r * .45], '#ffb000'); poly(g, [x - r * .09, y + r * .45, x, y + r * .78, x + r * .09, y + r * .45], '#fff3a0'); break;
      case 'atome':
        g.strokeStyle = k('#2ec4ff'); g.lineWidth = Math.max(1.5, s * .045);
        [0, Math.PI / 3, -Math.PI / 3].forEach(function (t) { g.beginPath(); g.ellipse(x, y, r * .92, r * .32, t, 0, 7); g.stroke(); });
        disque(g, x, y, r * .16, '#ff5fa2'); [[.92, 0, 0], [.92, Math.PI / 3, 2.2], [.92, -Math.PI / 3, 4.1]].forEach(function (q) { var ex = Math.cos(q[2]) * r * q[0], ey = Math.sin(q[2]) * r * .32; disque(g, x + ex * Math.cos(q[1]) - ey * Math.sin(q[1]), y + ex * Math.sin(q[1]) + ey * Math.cos(q[1]), r * .08, '#ffd23f'); }); break;
      case 'comete': { var gc = g.createLinearGradient(x + r * .6, y - r * .6, x - r, y + r); gc.addColorStop(0, k('#bfefff')); gc.addColorStop(1, 'rgba(46,196,255,0)');
        g.fillStyle = gc; g.beginPath(); g.moveTo(x + r * .45, y - r * .75); g.lineTo(x - r, y + r); g.lineTo(x + r * .75, y - r * .45); g.closePath(); g.fill(); disque(g, x + r * .6, y - r * .6, r * .2, '#ffffff'); break; }
      case 'ovni': ell(g, x, y - r * .15, r * .35, r * .3, 0, 'rgba(160,230,255,.85)'); ell(g, x, y + r * .05, r * .9, r * .25, 0, k('#9aa7b8'));
        [-.55, -.2, .2, .55].forEach(function (q, i) { disque(g, x + q * r, y + r * .08, r * .06, ['#ffd23f', '#5fd35f', '#ff3b3b', '#2ec4ff'][i]); });
        g.fillStyle = 'rgba(255,240,150,.25)'; g.beginPath(); g.moveTo(x - r * .3, y + r * .25); g.lineTo(x + r * .3, y + r * .25); g.lineTo(x + r * .6, y + r); g.lineTo(x - r * .6, y + r); g.closePath(); g.fill(); break;
      case 'montagne':
        poly(g, [x - r, y + r * .8, x - r * .2, y - r * .7, x + r * .25, y + r * .1, x + r * .5, y - r * .25, x + r, y + r * .8], k('#4a6fa5'));
        poly(g, [x - r * .2, y - r * .7, x - r * .45, y - r * .25, x - r * .3, y - r * .2, x - r * .15, y - r * .35, x, y - r * .3], '#ffffff'); break;
    }
    g.restore();
  }
  function hasard(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
  var PLAT = false;   // Garmin (64 couleurs) : aplats et bandes au lieu des dégradés, qui seraient tramés
  function degradeV(g, cols, plat) { if (PLAT && plat) { plat.forEach(function (c, i) { g.fillStyle = c; g.fillRect(0, i * W / plat.length, W, W / plat.length + 1); }); return; } var gr = g.createLinearGradient(0, 0, 0, W); cols.forEach(function (c, i) { gr.addColorStop(i / (cols.length - 1), c); }); g.fillStyle = gr; g.fillRect(0, 0, W, W); }
  function halo(g, c0, c1, plat) { if (PLAT && plat) { g.fillStyle = plat; g.fillRect(0, 0, W, W); return; } var gr = g.createRadialGradient(CX, CY * .85, 20, CX, CY, CX); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(0, 0, W, W); }
  var SCENES = {
    espace: function (g) {
      halo(g, '#141a3a', '#02030a', '#000000'); var rnd = hasard(9);
      if (!PLAT) { var nb = g.createRadialGradient(150, 340, 10, 150, 340, 170); nb.addColorStop(0, 'rgba(180,80,255,.35)'); nb.addColorStop(1, 'rgba(180,80,255,0)'); g.fillStyle = nb; g.fillRect(0, 0, W, W);
        var nb2 = g.createRadialGradient(360, 140, 10, 360, 140, 150); nb2.addColorStop(0, 'rgba(46,196,255,.28)'); nb2.addColorStop(1, 'rgba(46,196,255,0)'); g.fillStyle = nb2; g.fillRect(0, 0, W, W); }
      for (var i = 0; i < 110; i++) disque(g, rnd() * W, rnd() * W, rnd() < .1 ? 1.8 : .9, rnd() < .2 ? '#bfe6ff' : '#ffffff');
      motif(g, 'saturne', 372, 372, 92); motif(g, 'planete', 92, 150, 50); motif(g, 'terre', 118, 386, 54); motif(g, 'comete', 300, 74, 60); disque(g, 405, 300, 6, '#e8eef5');
    },
    fleurs: function (g) {
      halo(g, '#123526', '#06120c', '#005500'); var rnd = hasard(11), cols = ['#ff5fa2', '#ffd23f', '#ffffff', '#ff8c42', '#b47cff', '#ff3b5c'];
      for (var i = 0; i < 26; i++) { var a = i / 26 * Math.PI * 2, rr = 214 + (i % 2) * 6; ell(g, CX + Math.cos(a + .12) * (rr - 6), CY + Math.sin(a + .12) * (rr - 6), 14, 6, a + 1.2, i % 2 ? '#3f9a3a' : '#2e7d32'); }
      for (var j = 0; j < 22; j++) { var b = j / 22 * Math.PI * 2 + .07, r0 = 205 + (j % 3) * 7; motif(g, j % 4 === 3 ? 'marguerite' : 'fleur', CX + Math.cos(b) * r0, CY + Math.sin(b) * r0, 30 + rnd() * 16, cols[j % cols.length]); }
    },
    printemps: function (g) {
      degradeV(g, ['#16455a', '#0f2f40', '#0a1f2a'], ['#005555']); var rnd = hasard(5);
      g.strokeStyle = '#5a3a24'; g.lineCap = 'round';
      [[0, 60, 120, 110, 230, 70, 12], [120, 110, 150, 160, 200, 175, 7], [60, 95, 70, 140, 40, 170, 6]].forEach(function (q) { g.lineWidth = q[6]; g.beginPath(); g.moveTo(q[0], q[1]); g.quadraticCurveTo(q[2], q[3], q[4], q[5]); g.stroke(); });
      for (var i = 0; i < 26; i++) { var t = rnd(), x = 10 + t * 220, y = 60 + Math.sin(t * 3) * 30 + (rnd() - .5) * 60; if (Math.hypot(x - CX, y - CY) < 150) continue; motif(g, 'fleur', x, y, 16 + rnd() * 14, rnd() < .5 ? '#ffb7d5' : '#ff85b8'); }
      for (var j = 0; j < 18; j++) { var px = 260 + rnd() * 200, py = 60 + rnd() * 380; if (Math.hypot(px - CX, py - CY) < 160) continue; ell(g, px, py, 5, 3, rnd() * 3, '#ffb7d5'); }
      g.fillStyle = '#2e7d32'; g.beginPath(); g.moveTo(0, W); g.lineTo(0, 430); for (var k2 = 0; k2 <= 24; k2++) g.lineTo(k2 * 20, 420 + (k2 % 2) * 14); g.lineTo(W, W); g.fill();
      for (var m = 0; m < 9; m++) motif(g, m % 3 ? 'marguerite' : 'tulipe', 110 + m * 32, 432 + (m % 2) * 8, 22, m % 3 ? null : '#ff3b3b');
    },
    ete: function (g) {
      degradeV(g, ['#2b1055', '#5a1a6e', '#d53369', '#ff8a3d'], ['#000055', '#550055', '#aa0055', '#aa0055', '#ff0055', '#ff5555']); var hz = 330;
      g.save(); g.beginPath(); g.rect(0, 0, W, hz); g.clip(); disque(g, CX + 40, hz, 78, '#ffd23f'); disque(g, CX + 40, hz, 62, '#ffe680'); g.restore();
      g.fillStyle = '#0b3d66'; g.fillRect(0, hz, W, W - hz); g.fillStyle = '#145a8a'; for (var i = 0; i < 7; i++) g.fillRect(0, hz + 12 + i * 20, W, 4);
      g.fillStyle = '#ffd23f'; for (var j = 0; j < 6; j++) g.fillRect(CX + 40 - 50 + j * 7, hz + 8 + j * 18, 100 - j * 14, 4);
      g.fillStyle = '#e8c27a'; g.beginPath(); g.moveTo(0, W); g.lineTo(0, 420); g.quadraticCurveTo(160, 395, 260, W); g.fill();
      g.strokeStyle = '#170a22'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(70, 440); g.quadraticCurveTo(80, 330, 115, 250); g.stroke();
      [[-2.6, 70], [-2.0, 80], [-1.2, 78], [-.5, 70], [-3.0, 60]].forEach(function (f) { g.save(); g.translate(115, 250); g.rotate(f[0]); ell(g, f[1] / 2, 0, f[1] / 2, 9, 0, '#170a22'); g.restore(); });
    },
    automne: function (g) {
      halo(g, '#33170a', '#120603', '#550000'); var rnd = hasard(23), cols = ['#ff7a1a', '#d93a1a', '#ffcc00', '#b5541e', '#e8a33a'];
      for (var i = 0; i < 34; i++) { var a = rnd() * Math.PI * 2, r0 = 160 + rnd() * 70, x = CX + Math.cos(a) * r0, y = CY + Math.sin(a) * r0;
        g.save(); g.translate(x, y); g.rotate(rnd() * 6.3); motif(g, i % 3 ? 'erable' : 'feuille', 0, 0, 22 + rnd() * 20, cols[i % cols.length]); g.restore(); }
      motif(g, 'champignon', 150, 420, 34); motif(g, 'champignon', 180, 432, 22); motif(g, 'citrouille', 320, 420, 40);
    },
    hiver: function (g) {
      degradeV(g, ['#071530', '#0e2650', '#1a3d72'], ['#000055']); var rnd = hasard(7);
      for (var i = 0; i < 40; i++) { var x = rnd() * W, y = rnd() * 360; disque(g, x, y, rnd() < .2 ? 2.2 : 1.2, '#cfe6ff'); }
      motif(g, 'lune', 360, 95, 60);
      poly(g, [0, W, 0, 360, 90, 290, 170, 360, 260, 270, 360, 350, 430, 300, W, 340, W, W], '#2b4f7e');
      poly(g, [90, 290, 70, 307, 92, 312, 110, 305], '#ffffff'); poly(g, [260, 270, 236, 290, 258, 296, 285, 290], '#ffffff');
      poly(g, [0, W, 0, 410, 120, 370, 240, 420, 360, 380, W, 410, W, W], '#e8f2ff');
      [[70, 160, 26], [400, 210, 22], [130, 70, 18], [300, 40, 16], [430, 140, 14]].forEach(function (f) { motif(g, 'flocon', f[0], f[1], f[2]); });
      motif(g, 'sapin', 110, 400, 46, '#1e5a34'); motif(g, 'sapin', 380, 395, 56, '#1e5a34');
    },
    noel: function (g) {
      halo(g, '#0f3322', '#05140c', '#000000'); var rnd = hasard(3);
      for (var i = 0; i < 30; i++) disque(g, rnd() * W, rnd() * W, 1.6, '#ffffff');
      g.strokeStyle = '#2e5a2e'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 120); g.quadraticCurveTo(CX, 230, 440, 120); g.stroke();
      var bul = ['#ff3b3b', '#ffd23f', '#2ec4ff', '#5fd35f', '#ff5fa2'];
      for (var j = 1; j < 12; j++) { var t = j / 12, x = (1 - t) * (1 - t) * 40 + 2 * (1 - t) * t * CX + t * t * 440, y = (1 - t) * (1 - t) * 120 + 2 * (1 - t) * t * 230 + t * t * 120; disque(g, x, y + 8, 7, bul[j % bul.length]); disque(g, x - 2, y + 6, 2, '#ffffff'); }
      poly(g, [0, W, 0, 420, 120, 400, 240, 425, 360, 400, W, 420, W, W], '#e8f2ff');
      motif(g, 'sapin', 95, 380, 90); motif(g, 'sapin', 385, 385, 80); motif(g, 'cadeau', 170, 425, 34); motif(g, 'cadeau', 310, 428, 30, '#2ec4ff');
      etoileP(g, CX, 40, 16, 7, 5, '#ffd23f');
    }
  };
  function calquesFond(g, cfg) {
    var L = cfg.calques, a = function (k) { return L.indexOf(k) >= 0; }, gr;
    if (a('teinte')) { g.save(); g.globalCompositeOperation = 'overlay'; g.fillStyle = rgba(cfg.accent, .45); g.fillRect(0, 0, W, W); g.restore(); }
    if (a('rayons')) { g.save(); g.translate(CX, CY); for (var i = 0; i < 48; i++) { g.rotate(Math.PI / 24); g.beginPath(); g.moveTo(0, 0); g.lineTo(-W * .04, -W); g.lineTo(W * .04, -W); g.closePath(); g.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fill(); } g.restore(); }
    if (a('lignes')) { g.fillStyle = 'rgba(0,0,0,.22)'; for (var y = 0; y < W; y += 3) g.fillRect(0, y, W, 1); }
    if (a('points')) { g.fillStyle = rgba(cfg.accent, .16); for (var y2 = 6; y2 < W; y2 += 12) for (var x2 = 6; x2 < W; x2 += 12) { g.beginPath(); g.arc(x2, y2, 1.2, 0, 7); g.fill(); } }
    if (a('halo')) { gr = g.createRadialGradient(CX, CY, 0, CX, CY, CX * .75); gr.addColorStop(0, rgba(cfg.accent, .28)); gr.addColorStop(1, rgba(cfg.accent, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, W); }
    if (a('vignette')) { gr = g.createRadialGradient(CX, CY, CX * .45, CX, CY, CX); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.7)'); g.fillStyle = gr; g.fillRect(0, 0, W, W); }
  }
  /* calque transparent posé sur tout le cadran (écran allumé) : reflet de verre, lunette en relief */
  function dessus(cfg, kk) {
    kk = kk || 1;
    var c = toile(W * kk, W * kk), g = c.getContext('2d'), L = cfg.calques; g.scale(kk, kk);
    g.save(); g.beginPath(); g.arc(CX, CY, CX, 0, 7); g.clip();
    if (L.indexOf('verre') >= 0) {
      g.save(); g.beginPath(); g.ellipse(CX - 60, CY - 120, 260, 170, -.45, 0, 7); g.clip();
      var gr = g.createLinearGradient(40, 20, 260, 260); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(.6, 'rgba(255,255,255,.04)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, W); g.restore();
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.beginPath(); g.arc(CX, CY, CX - 10, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
    }
    if (L.indexOf('lunette') >= 0) {
      var gl = g.createLinearGradient(0, 0, W, W); gl.addColorStop(0, '#f2f2f2'); gl.addColorStop(.35, mix(cfg.accent, '#666666', .5)); gl.addColorStop(.55, '#1a1a1a'); gl.addColorStop(.8, mix(cfg.accent, '#888888', .5)); gl.addColorStop(1, '#2a2a2a');
      g.lineWidth = 7; g.strokeStyle = gl; g.beginPath(); g.arc(CX, CY, CX - 3.5, 0, 7); g.stroke();
      g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(CX, CY, CX - 7.5, 0, 7); g.stroke();
    }
    g.restore(); return c;
  }
  /* ---------------- matières de luxe, mouvement mécanique, lunettes, animations ---------------- */
  function alea(seed) { var s = seed || 7; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  /* roue dentée centrée en (x, y) : n dents, rayon r, couleur de base c ; a : angle ; bras : nombre de bras (ajourée) */
  function roue(g, x, y, r, n, c, a, bras) {
    g.save(); g.translate(x, y); g.rotate(a || 0);
    var d = r * .1, p = new Path2D();
    for (var i = 0; i < n; i++) {
      var a0 = i / n * Math.PI * 2, a1 = (i + .3) / n * Math.PI * 2, a2 = (i + .5) / n * Math.PI * 2, a3 = (i + .8) / n * Math.PI * 2;
      p[i ? 'lineTo' : 'moveTo'](Math.cos(a0) * r, Math.sin(a0) * r); p.lineTo(Math.cos(a1) * (r + d), Math.sin(a1) * (r + d));
      p.lineTo(Math.cos(a2) * (r + d), Math.sin(a2) * (r + d)); p.lineTo(Math.cos(a3) * r, Math.sin(a3) * r);
    }
    p.closePath();
    if (bras) {
      var ri = r * .78, rm = r * .2;
      p.moveTo(ri, 0); p.arc(0, 0, ri, 0, Math.PI * 2, true);
      for (var k = 0; k < bras; k++) { var b0 = k / bras * Math.PI * 2, w2 = Math.PI / bras * .78; p.moveTo(Math.cos(b0 + .16) * rm, Math.sin(b0 + .16) * rm); p.arc(0, 0, ri, b0 + .16, b0 + w2 * 2 - .16); p.arc(0, 0, rm, b0 + w2 * 2 - .16, b0 + .16, true); }
    }
    var gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, mix(c, '#ffffff', .55)); gr.addColorStop(.45, c); gr.addColorStop(1, mix(c, '#000000', .45));
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = r * .12; g.shadowOffsetY = r * .04;
    g.fillStyle = gr; g.fill(p, 'evenodd'); g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(.6, r * .015); g.stroke(p);
    // axe et rubis
    disque(g, 0, 0, r * .16, mix(c, '#000000', .3)); rubis(g, 0, 0, r * .09);
    g.restore();
  }
  function rubis(g, x, y, r) {
    var gr = g.createRadialGradient(x - r * .3, y - r * .3, r * .1, x, y, r); gr.addColorStop(0, '#ff9aa8'); gr.addColorStop(.5, '#c4102c'); gr.addColorStop(1, '#5a0010');
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(.5, r * .15); g.stroke();
  }
  function vis(g, x, y, r) {
    var gr = g.createRadialGradient(x - r * .4, y - r * .4, 1, x, y, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#6b6f78');
    disque(g, x, y, r, '#2a2c31'); disque(g, x, y, r * .82, '#c9ccd3'); g.beginPath(); g.arc(x, y, r * .82, 0, 7); g.fillStyle = gr; g.fill();
    g.strokeStyle = '#3a3d44'; g.lineWidth = r * .25; g.beginPath(); g.moveTo(x - r * .6, y - r * .3); g.lineTo(x + r * .6, y + r * .3); g.stroke();
  }
  /* pont (plaque) du mouvement : chemin p, côtes de Genève, biseau poli */
  function pont(g, p, c) {
    g.save(); g.shadowColor = 'rgba(0,0,0,.75)'; g.shadowBlur = 10; g.shadowOffsetY = 4; g.fillStyle = c; g.fill(p); g.restore();
    g.save(); g.clip(p);
    for (var x = -W; x < W * 2; x += 18) { var gr = g.createLinearGradient(x, 0, x + 18, 18); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.14)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, 0); g.lineTo(x + 18 - W, W); g.lineTo(x - W, W); g.closePath(); g.fill(); }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6; g.stroke(p);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = .8; g.stroke(p);
  }
  function fondLuxe(g, cfg) {
    var A = cfg.c1, B = cfg.c2, i, a;
    if (cfg.fond === 'soleil') {   // soleillé : reflets en rayons, comme un cadran brossé
      for (i = 0; i < 720; i++) { a = i / 720 * Math.PI * 2; var k = .5 + .5 * Math.cos(2 * a - .6), k2 = .5 + .5 * Math.cos(6 * a); g.fillStyle = mix(A, B, .25 + .6 * k + .1 * k2);
        g.beginPath(); g.moveTo(CX, CY); g.arc(CX, CY, W, a, a + Math.PI / 340); g.closePath(); g.fill(); }
      var rd = g.createRadialGradient(CX, CY, 20, CX, CY, CX); rd.addColorStop(0, 'rgba(255,255,255,.08)'); rd.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = rd; g.fillRect(0, 0, W, W);
    }
    if (cfg.fond === 'guilloche') {   // clous de Paris : petites pyramides
      var s = 12; for (var y = -s; y < W + s; y += s) for (var x = -s; x < W + s; x += s) {
        var cx = x + s / 2, cy = y + s / 2, rr = Math.hypot(cx - CX, cy - CY) / CX;
        g.fillStyle = mix(A, B, .55 - rr * .25); g.fillRect(x, y, s, s);
        g.fillStyle = mix(B, '#ffffff', .22); g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y); g.lineTo(cx, cy); g.closePath(); g.fill();
        g.fillStyle = mix(A, '#000000', .25); g.beginPath(); g.moveTo(x, y + s); g.lineTo(x + s, y + s); g.lineTo(cx, cy); g.closePath(); g.fill();
        g.fillStyle = mix(A, B, .4); g.beginPath(); g.moveTo(x + s, y); g.lineTo(x + s, y + s); g.lineTo(cx, cy); g.closePath(); g.fill();
      }
      var vg = g.createRadialGradient(CX, CY * .8, 30, CX, CY, CX); vg.addColorStop(0, 'rgba(255,255,255,.1)'); vg.addColorStop(1, 'rgba(0,0,0,.3)'); g.fillStyle = vg; g.fillRect(0, 0, W, W);
    }
    if (cfg.fond === 'damas') {   // acier damassé : veines ondulées
      for (i = 0; i < 70; i++) {
        g.strokeStyle = i % 2 ? mix(A, '#000000', .25) : mix(B, '#ffffff', .12); g.lineWidth = 4 + (i % 3) * 1.5; g.beginPath();
        for (var xx = -20; xx <= W + 20; xx += 6) { var yy = i * 8 - 40 + Math.sin(xx / 37 + i * .35) * 14 + Math.sin(xx / 13 + i) * 4 + Math.sin((xx + i * 20) / 90) * 20; g[xx > -20 ? 'lineTo' : 'moveTo'](xx, yy); }
        g.stroke();
      }
      var sh = g.createLinearGradient(0, 0, W, W); sh.addColorStop(0, 'rgba(255,255,255,.12)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = sh; g.fillRect(0, 0, W, W);
    }
    if (cfg.fond === 'nacre') {   // nacre : reflets irisés
      var rnd = alea(11), cols = ['#ffd6e8', '#cfe8ff', '#d8ffe9', '#fff1cc', '#e6d9ff'];
      g.fillStyle = mix(A, '#ffffff', .3); g.fillRect(0, 0, W, W);
      for (i = 0; i < 60; i++) { var px = rnd() * W, py = rnd() * W, r0 = 40 + rnd() * 120, gr = g.createRadialGradient(px, py, 0, px, py, r0);
        gr.addColorStop(0, rgba(cols[i % cols.length], .45)); gr.addColorStop(1, rgba(cols[i % cols.length], 0)); g.fillStyle = gr; g.fillRect(px - r0, py - r0, r0 * 2, r0 * 2); }
      g.globalAlpha = .18; for (i = 0; i < 40; i++) { g.strokeStyle = i % 2 ? '#ffffff' : B; g.lineWidth = 1 + rnd() * 2; g.beginPath(); var y0 = rnd() * W; for (var x2 = 0; x2 <= W; x2 += 10) g[x2 ? 'lineTo' : 'moveTo'](x2, y0 + Math.sin(x2 / 40 + i) * 12); g.stroke(); } g.globalAlpha = 1;
      var vn = g.createRadialGradient(CX, CY, CX * .5, CX, CY, CX); vn.addColorStop(0, 'rgba(0,0,0,0)'); vn.addColorStop(1, rgba(B, .35)); g.fillStyle = vn; g.fillRect(0, 0, W, W);
    }
    if (cfg.fond === 'marbre') {
      var rm = alea(21); g.fillStyle = A; g.fillRect(0, 0, W, W);
      for (i = 0; i < 26; i++) { g.strokeStyle = rgba(i % 3 ? B : mix(B, '#ffffff', .5), .12 + rm() * .3); g.lineWidth = .6 + rm() * 3; g.beginPath(); var mx = rm() * W, my = -20, ma = .4 + rm() * 1.2;
        g.moveTo(mx, my); for (var st = 0; st < 40; st++) { ma += (rm() - .5) * .5; mx += Math.cos(ma) * 14; my += Math.abs(Math.sin(ma)) * 14 + 4; g.lineTo(mx, my); } g.stroke(); }
      var mg = g.createRadialGradient(CX * .7, CY * .6, 20, CX, CY, CX * 1.1); mg.addColorStop(0, 'rgba(255,255,255,.12)'); mg.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = mg; g.fillRect(0, 0, W, W);
    }
    if (cfg.fond === 'bois') {
      var rb = alea(8); g.fillStyle = A; g.fillRect(0, 0, W, W);
      for (i = 0; i < 90; i++) { var yb = i * 5.6; g.strokeStyle = rgba(i % 4 ? B : mix(A, '#000000', .4), .25 + rb() * .35); g.lineWidth = 1 + rb() * 2.5; g.beginPath();
        for (var xb = 0; xb <= W; xb += 8) { var nd = Math.exp(-Math.pow((xb - 300) / 60, 2) - Math.pow((yb - 180) / 70, 2)) * 26; g[xb ? 'lineTo' : 'moveTo'](xb, yb + Math.sin(xb / 70 + i * .2) * 3 + nd); } g.stroke(); }
      var bg2 = g.createLinearGradient(0, 0, W, 0); bg2.addColorStop(0, 'rgba(0,0,0,.25)'); bg2.addColorStop(.5, 'rgba(255,255,255,.05)'); bg2.addColorStop(1, 'rgba(0,0,0,.3)'); g.fillStyle = bg2; g.fillRect(0, 0, W, W);
    }
    if (cfg.fond === 'cuir') {
      var rc = alea(13); g.fillStyle = A; g.fillRect(0, 0, W, W);
      for (i = 0; i < 2600; i++) { var cx2 = rc() * W, cy2 = rc() * W; g.fillStyle = rc() > .5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.04)'; g.beginPath(); g.arc(cx2, cy2, 1 + rc() * 2.2, 0, 7); g.fill(); }
      g.setLineDash([9, 7]); g.lineWidth = 2.2; g.strokeStyle = B; g.beginPath(); g.arc(CX, CY, 216, 0, 7); g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.beginPath(); g.arc(CX, CY, 222, 0, 7); g.stroke();
    }
    if (cfg.fond === 'topo') {   // courbes de niveau, comme une carte de randonnée
      g.fillStyle = A; g.fillRect(0, 0, W, W);
      var bumps = [[150, 170, 1], [330, 300, 1.2], [360, 120, .8], [120, 360, .9]];
      var hgt = function (x, y) { var h = 0; bumps.forEach(function (b) { h += b[2] * Math.exp(-((x - b[0]) * (x - b[0]) + (y - b[1]) * (y - b[1])) / 9000); }); return h + .15 * Math.sin(x / 50) * Math.cos(y / 60); };
      var step = 6, cols2 = W / step;
      for (var lvl = 1; lvl < 14; lvl++) { var th2 = lvl * .09; g.strokeStyle = rgba(lvl % 5 ? B : mix(B, '#ffffff', .4), lvl % 5 ? .45 : .8); g.lineWidth = lvl % 5 ? 1 : 1.8; g.beginPath();
        for (var gy = 0; gy < cols2; gy++) for (var gx = 0; gx < cols2; gx++) {   // carrés qui avancent (marching squares simplifié)
          var x0 = gx * step, y0 = gy * step, a1 = hgt(x0, y0) > th2, b1 = hgt(x0 + step, y0) > th2, c1 = hgt(x0 + step, y0 + step) > th2, d1 = hgt(x0, y0 + step) > th2;
          var pts = []; if (a1 !== b1) pts.push([x0 + step / 2, y0]); if (b1 !== c1) pts.push([x0 + step, y0 + step / 2]); if (c1 !== d1) pts.push([x0 + step / 2, y0 + step]); if (d1 !== a1) pts.push([x0, y0 + step / 2]);
          if (pts.length >= 2) { g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); if (pts.length === 4) { g.moveTo(pts[2][0], pts[2][1]); g.lineTo(pts[3][0], pts[3][1]); } }
        } g.stroke(); }
    }
    if (cfg.fond === 'aurore') {
      var ga = g.createLinearGradient(0, 0, 0, W); ga.addColorStop(0, mix(A, '#000000', .3)); ga.addColorStop(1, A); g.fillStyle = ga; g.fillRect(0, 0, W, W);
      var ra = alea(31); for (i = 0; i < 160; i++) { g.fillStyle = 'rgba(255,255,255,' + (.2 + ra() * .6) + ')'; g.fillRect(ra() * W, ra() * W * .7, 1.3, 1.3); }
      [[B, 150, 1], [cfg.accent, 210, .7], [mix(B, '#ff4fd8', .5), 120, .5]].forEach(function (L, j) {
        for (var k3 = 0; k3 < 26; k3++) { g.strokeStyle = rgba(L[0], .05 * L[2]); g.lineWidth = 30 - k3; g.beginPath();
          for (var xa = -20; xa <= W + 20; xa += 10) { var ya = L[1] + Math.sin(xa / 80 + j * 2) * 40 + Math.sin(xa / 31 + j) * 12 - k3 * 2.4; g[xa > -20 ? 'lineTo' : 'moveTo'](xa, ya); } g.stroke(); }
      });
      var gm = g.createLinearGradient(0, W * .72, 0, W); gm.addColorStop(0, 'rgba(0,0,0,0)'); gm.addColorStop(1, 'rgba(0,0,0,.9)'); g.fillStyle = gm; g.fillRect(0, 0, W, W);
      g.fillStyle = '#020306'; g.beginPath(); g.moveTo(0, W); g.lineTo(0, 400); g.lineTo(70, 360); g.lineTo(120, 390); g.lineTo(190, 330); g.lineTo(260, 385); g.lineTo(330, 345); g.lineTo(400, 395); g.lineTo(W, 360); g.lineTo(W, W); g.closePath(); g.fill();
    }
    if (cfg.fond === 'hexa') {
      g.fillStyle = A; g.fillRect(0, 0, W, W); var hr = 18, hw = hr * Math.sqrt(3);
      for (var hy = -1; hy < W / (hr * 1.5) + 1; hy++) for (var hx = -1; hx < W / hw + 1; hx++) {
        var hcx = hx * hw + (hy % 2 ? hw / 2 : 0), hcy = hy * hr * 1.5, dd = Math.hypot(hcx - CX, hcy - CY) / CX;
        g.beginPath(); for (var v6 = 0; v6 < 6; v6++) { var av = Math.PI / 6 + v6 * Math.PI / 3; g[v6 ? 'lineTo' : 'moveTo'](hcx + Math.cos(av) * (hr - 2), hcy + Math.sin(av) * (hr - 2)); } g.closePath();
        var hg = g.createLinearGradient(hcx, hcy - hr, hcx, hcy + hr); hg.addColorStop(0, mix(B, '#ffffff', .12)); hg.addColorStop(1, mix(A, '#000000', .2)); g.fillStyle = hg; g.globalAlpha = .9 - dd * .4; g.fill(); g.globalAlpha = 1;
        g.strokeStyle = rgba(cfg.accent, .08 + (1 - Math.min(1, dd)) * .12); g.lineWidth = 1; g.stroke();
      }
    }
    if (cfg.fond === 'vagues') {
      g.fillStyle = A; g.fillRect(0, 0, W, W);
      for (i = 0; i < 28; i++) { var yv = i * 19 - 10; var gv = g.createLinearGradient(0, yv - 20, 0, yv + 20); gv.addColorStop(0, mix(A, B, .3 + .5 * (i / 28))); gv.addColorStop(1, mix(A, '#000000', .3));
        g.fillStyle = gv; g.beginPath(); g.moveTo(0, W); for (var xv = 0; xv <= W; xv += 8) g.lineTo(xv, yv + Math.sin(xv / 40 + i * .7) * 9 + Math.sin(xv / 17 + i) * 3); g.lineTo(W, W); g.closePath(); g.fill();
        g.strokeStyle = rgba(mix(B, '#ffffff', .5), .25); g.lineWidth = 1; g.beginPath(); for (xv = 0; xv <= W; xv += 8) g[xv ? 'lineTo' : 'moveTo'](xv, yv + Math.sin(xv / 40 + i * .7) * 9 + Math.sin(xv / 17 + i) * 3); g.stroke(); }
    }
    if (cfg.fond === 'mouvement') {   // mouvement squelette : platine perlée, ponts, rouages, rubis, vis
      g.fillStyle = mix(A, '#000000', .2); g.fillRect(0, 0, W, W);
      var r2 = alea(5); for (i = 0; i < 900; i++) { var qx = r2() * W, qy = r2() * W; g.strokeStyle = 'rgba(255,255,255,.035)'; g.beginPath(); g.arc(qx, qy, 6 + r2() * 4, 0, 7); g.stroke(); }   // perlage
      var met = B;
      roue(g, 150, 160, 70, 60, met, .2, 5); roue(g, 330, 140, 52, 44, met, .5, 4); roue(g, 120, 330, 46, 40, met, .1, 4);
      roue(g, 345, 315, 34, 30, mix(met, '#d4a24c', .5), .3, 3); roue(g, 240, 250, 26, 18, met, 0, 0); roue(g, 260, 380, 38, 32, met, .8, 4);
      var p1 = new Path2D(); p1.moveTo(40, 230); p1.bezierCurveTo(90, 180, 200, 205, 260, 180); p1.lineTo(300, 205); p1.bezierCurveTo(230, 240, 120, 250, 60, 290); p1.closePath();
      var p2 = new Path2D(); p2.moveTo(250, 420); p2.bezierCurveTo(300, 360, 380, 360, 440, 300); p2.lineTo(455, 330); p2.bezierCurveTo(400, 390, 330, 410, 285, 455); p2.closePath();
      var p3 = new Path2D(); p3.moveTo(300, 60); p3.bezierCurveTo(340, 110, 400, 150, 430, 200); p3.lineTo(405, 215); p3.bezierCurveTo(370, 165, 320, 130, 280, 80); p3.closePath();
      [p1, p2, p3].forEach(function (p) { pont(g, p, mix(met, '#000000', .1)); });
      [[70, 252], [270, 196], [272, 436], [430, 312], [300, 76], [418, 205]].forEach(function (v) { vis(g, v[0], v[1], 7); });
      [[150, 160], [330, 140], [120, 330], [345, 315], [260, 380], [170, 228], [360, 380]].forEach(function (v) { rubis(g, v[0], v[1], 5); });
      var vm = g.createRadialGradient(CX, CY, CX * .45, CX, CY, CX); vm.addColorStop(0, 'rgba(0,0,0,0)'); vm.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vm; g.fillRect(0, 0, W, W);
    }
  }
  var ROMAINS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  function anneauLuxe(g, cfg, aod) {
    var acc = aod ? mix(cfg.doux, '#000', .5) : cfg.accent, tx = aod ? mix(cfg.doux, '#000', .4) : cfg.texte, i, a;
    var LUME = '#d6ffe2';
    if (cfg.anneau === 'plongee') {   // lunette tournante de plongée (0 à 60 min, premier quart marqué)
      if (!aod) {
        var gr = g.createRadialGradient(CX, CY, 196, CX, CY, 240); gr.addColorStop(0, mix(cfg.c1, '#000000', .5)); gr.addColorStop(.5, mix(cfg.c2, '#000000', .3)); gr.addColorStop(1, mix(cfg.c1, '#000000', .6));
        g.beginPath(); g.arc(CX, CY, 240, 0, 7); g.arc(CX, CY, 198, 0, 7, true); g.fillStyle = gr; g.fill();
        g.beginPath(); g.arc(CX, CY, 240, -Math.PI / 2, 0); g.arc(CX, CY, 198, 0, -Math.PI / 2, true); g.closePath(); g.fillStyle = rgba(acc, .22); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(CX, CY, 198, 0, 7); g.stroke();
      }
      for (i = 0; i < 60; i++) {
        a = i * Math.PI / 30; var mj = i % 5 === 0;
        if (aod && !mj) continue;
        if (i === 0) { g.fillStyle = aod ? acc : LUME; if (!aod) { g.shadowColor = '#7dffb0'; g.shadowBlur = 8; } g.beginPath(); g.moveTo(CX, 236); g.moveTo(CX - 13, 203 - 0); g.lineTo(CX + 13, 203); g.lineTo(CX, 226); g.closePath();
          g.beginPath(); g.moveTo(CX - 13, 6); g.lineTo(CX + 13, 6); g.lineTo(CX, 30); g.closePath(); g.fill(); g.shadowColor = 'transparent'; continue; }
        if (mj && i % 10 === 0) { texte(g, String(i), CX + Math.sin(a) * 219, CY - Math.cos(a) * 219 + 7, PETITE.fam, 19, tx, 'center'); continue; }
        var r1 = 236, r2 = mj ? 214 : (i < 15 ? 222 : 230);
        g.strokeStyle = mj ? tx : rgba(tx, .7); g.lineWidth = mj ? 4 : 1.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(CX + Math.sin(a) * r1, CY - Math.cos(a) * r1); g.lineTo(CX + Math.sin(a) * r2, CY - Math.cos(a) * r2); g.stroke();
      }
      // index luminescents sur le cadran
      for (i = 0; i < 12; i++) { a = i * Math.PI / 6; var x0 = CX + Math.sin(a) * 178, y0 = CY - Math.cos(a) * 178;
        g.save(); g.translate(x0, y0); g.rotate(a); if (!aod) { g.shadowColor = '#7dffb0'; g.shadowBlur = 7; }
        g.fillStyle = aod ? acc : LUME; g.strokeStyle = aod ? 'transparent' : mix(acc, '#ffffff', .4); g.lineWidth = 2;
        if (i % 3) { g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill(); g.stroke(); } else { rond(g, -7, -16, 14, i ? 30 : 26, 3); g.fill(); g.stroke(); }
        g.restore(); }
    }
    if (cfg.anneau === 'romains') {
      var PF = POLICES.classique;
      for (i = 0; i < 12; i++) { if (aod && i % 3) continue; a = i * Math.PI / 6;
        g.save(); g.translate(CX + Math.sin(a) * 204, CY - Math.cos(a) * 204);
        if (!aod) { g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5; }
        texte(g, ROMAINS[i], 0, 9, PF.fam, i % 3 ? 22 : 27, i % 3 ? tx : acc, 'center'); g.restore(); }
      if (!aod) for (i = 0; i < 60; i++) { a = i * Math.PI / 30; g.strokeStyle = i % 5 ? rgba(tx, .45) : acc; g.lineWidth = i % 5 ? 1 : 2.4;
        g.beginPath(); g.moveTo(CX + Math.sin(a) * 236, CY - Math.cos(a) * 236); g.lineTo(CX + Math.sin(a) * (i % 5 ? 230 : 226), CY - Math.cos(a) * (i % 5 ? 230 : 226)); g.stroke(); }
      g.strokeStyle = rgba(acc, aod ? .3 : .5); g.lineWidth = 1; g.beginPath(); g.arc(CX, CY, 224, 0, 7); g.stroke();
    }
    if (cfg.anneau === 'tachy' || cfg.anneau === 'chemin' || cfg.anneau === 'boussole' || cfg.anneau === 'h24') {
      var fam = PETITE.fam;
      if (cfg.anneau === 'chemin') {   // chemin de fer : deux cercles et 60 traverses
        g.strokeStyle = rgba(tx, .8); g.lineWidth = 1.2; g.beginPath(); g.arc(CX, CY, 232, 0, 7); g.stroke(); g.beginPath(); g.arc(CX, CY, 220, 0, 7); g.stroke();
        for (i = 0; i < 60; i++) { a = i * Math.PI / 30; g.lineWidth = i % 5 ? 1.2 : 3; g.strokeStyle = i % 5 ? rgba(tx, .8) : acc; g.beginPath(); g.moveTo(CX + Math.sin(a) * 232, CY - Math.cos(a) * 232); g.lineTo(CX + Math.sin(a) * (i % 5 ? 220 : 210), CY - Math.cos(a) * (i % 5 ? 220 : 210)); g.stroke(); }
        if (!aod) for (i = 1; i <= 12; i++) { a = i * Math.PI / 6; texte(g, String(i), CX + Math.sin(a) * 190, CY - Math.cos(a) * 190 + 9, POLICES.classique.fam, 26, tx, 'center'); }
      }
      if (cfg.anneau === 'tachy') {   // tachymètre : vitesse en km/h selon les secondes écoulées sur 1 km
        if (!aod) { g.fillStyle = mix(cfg.c1, '#000000', .45); g.beginPath(); g.arc(CX, CY, 240, 0, 7); g.arc(CX, CY, 204, 0, 7, true); g.fill(); }
        [500, 400, 300, 250, 200, 180, 160, 140, 120, 110, 100, 90, 80, 75, 70, 65, 60].forEach(function (v) { var sec = 3600 / v; if (sec > 60) return; a = sec / 60 * Math.PI * 2;
          g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); g.moveTo(CX + Math.sin(a) * 238, CY - Math.cos(a) * 238); g.lineTo(CX + Math.sin(a) * 228, CY - Math.cos(a) * 228); g.stroke();
          if (!aod) { g.save(); g.translate(CX + Math.sin(a) * 216, CY - Math.cos(a) * 216); g.rotate(a > Math.PI / 2 && a < Math.PI * 1.5 ? a + Math.PI : a); texte(g, String(v), 0, 5, fam, 13, tx, 'center'); g.restore(); } });
        if (!aod) { texte(g, 'TACHYMÈTRE', CX, CY + 150, fam, 11, acc, 'center', 2); }
        for (i = 0; i < 12; i++) { a = i * Math.PI / 6; g.strokeStyle = tx; g.lineWidth = i % 3 ? 3 : 6; g.beginPath(); g.moveTo(CX + Math.sin(a) * 198, CY - Math.cos(a) * 198); g.lineTo(CX + Math.sin(a) * 178, CY - Math.cos(a) * 178); g.stroke(); }
      }
      if (cfg.anneau === 'boussole') {   // rose des vents : N E S O et 360°
        if (!aod) { g.strokeStyle = rgba(tx, .35); g.lineWidth = 1; g.beginPath(); g.arc(CX, CY, 206, 0, 7); g.stroke(); }
        for (i = 0; i < 72; i++) { a = i * Math.PI / 36; if (aod && i % 9) continue; g.strokeStyle = i % 9 ? rgba(tx, .55) : tx; g.lineWidth = i % 9 ? 1 : 2.5;
          g.beginPath(); g.moveTo(CX + Math.sin(a) * 236, CY - Math.cos(a) * 236); g.lineTo(CX + Math.sin(a) * (i % 9 ? 228 : 220), CY - Math.cos(a) * (i % 9 ? 228 : 220)); g.stroke(); }
        [['N', 0, '#ff3b3b'], ['E', 90, tx], ['S', 180, tx], ['O', 270, tx]].forEach(function (c) { a = c[1] * Math.PI / 180; texte(g, c[0], CX + Math.sin(a) * 194, CY - Math.cos(a) * 194 + 10, POLICES.sport.fam, 28, aod ? acc : c[2], 'center'); });
        if (!aod) [45, 135, 225, 315].forEach(function (d) { a = d * Math.PI / 180; texte(g, String(d), CX + Math.sin(a) * 196, CY - Math.cos(a) * 196 + 5, fam, 13, rgba(tx, .7), 'center'); });
      }
      if (cfg.anneau === 'h24') {   // 24 heures, comme une montre de pilote
        for (i = 0; i < 24; i++) { a = i * Math.PI / 12; var lab = String(i === 0 ? 24 : i);
          if (!aod || i % 6 === 0) texte(g, lab, CX + Math.sin(a) * 214, CY - Math.cos(a) * 214 + 7, fam, i % 6 === 0 ? 20 : 15, i % 6 === 0 ? acc : tx, 'center');
          g.strokeStyle = rgba(tx, .6); g.lineWidth = 1.4; var a2 = a + Math.PI / 24; if (!aod) { g.beginPath(); g.moveTo(CX + Math.sin(a2) * 236, CY - Math.cos(a2) * 236); g.lineTo(CX + Math.sin(a2) * 228, CY - Math.cos(a2) * 228); g.stroke(); } }
        if (!aod) { g.strokeStyle = rgba(acc, .5); g.lineWidth = 1; g.beginPath(); g.arc(CX, CY, 196, 0, 7); g.stroke(); }
      }
    }
    if (cfg.anneau === 'cockpit') {   // compteur de voiture de sport : graduations 0 à 12, zone rouge, lueur
      var a0 = Math.PI * .75, span = Math.PI * 1.5;
      if (!aod) { g.lineWidth = 14; g.strokeStyle = rgba(acc, .12); g.beginPath(); g.arc(CX, CY, 222, a0, a0 + span); g.stroke();
        g.shadowColor = '#ff2a2a'; g.shadowBlur = 12; g.strokeStyle = '#ff3b3b'; g.lineWidth = 8; g.beginPath(); g.arc(CX, CY, 222, a0 + span * .82, a0 + span); g.stroke(); g.shadowColor = 'transparent'; }
      for (i = 0; i <= 60; i++) { a = a0 + span * i / 60; var maj2 = i % 5 === 0; if (aod && !maj2) continue;
        var red = i >= 50, c2 = red ? '#ff4d4d' : maj2 ? acc : rgba(tx, .55);
        if (!aod && maj2) { g.shadowColor = red ? '#ff2a2a' : acc; g.shadowBlur = 8; }
        g.strokeStyle = aod ? acc : c2; g.lineWidth = maj2 ? 3.5 : 1.4; g.beginPath(); g.moveTo(CX + Math.cos(a) * 234, CY + Math.sin(a) * 234); g.lineTo(CX + Math.cos(a) * (maj2 ? 210 : 222), CY + Math.sin(a) * (maj2 ? 210 : 222)); g.stroke(); g.shadowColor = 'transparent';
        if (maj2 && !aod) texte(g, String(i / 5), CX + Math.cos(a) * 190, CY + Math.sin(a) * 190 + 7, POLICES.sport.fam, 21, red ? '#ff6b6b' : tx, 'center'); }
    }
  }
  /* animations : une image par étape (f_0.png…), jouées par la montre (IMG_ANIM) quand l'écran est allumé */
  function imageAnim(b, cfg, f, n) {
    var s = b.taille, c = toile(s, s), g = c.getContext('2d'), cc = coul(cfg, b.couleur), t = f / n, R = s / 2, i;
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (b.motif === 'engrenages') {
      var dent = 2 * Math.PI / 24;   // la grande roue (24 dents) avance d'une dent par tour d'animation : boucle sans saut
      roue(g, R * .62, R * .78, R * .48, 24, cc, t * dent, 4);
      roue(g, R * 1.36, R * 1.22, R * .3, 15, mix(cc, '#d4a24c', .4), -t * dent * 24 / 15 + .1, 3);
    }
    if (b.motif === 'balancier') {
      var ang = Math.sin(t * Math.PI * 2) * 2.2;
      g.save(); g.translate(R, R);
      g.strokeStyle = rgba(mix(cc, '#ffffff', .3), .75); g.lineWidth = Math.max(1, s * .008); g.beginPath();   // spiral qui respire
      for (i = 0; i <= 360; i++) { var th = i / 360 * Math.PI * 2 * 5 + ang * .6, rr = R * (.08 + .5 * i / 360) * (1 + .04 * Math.sin(t * Math.PI * 2)); g[i ? 'lineTo' : 'moveTo'](Math.cos(th) * rr, Math.sin(th) * rr); } g.stroke();
      g.rotate(ang);
      var gr = g.createLinearGradient(-R, -R, R, R); gr.addColorStop(0, mix(cc, '#ffffff', .6)); gr.addColorStop(.5, cc); gr.addColorStop(1, mix(cc, '#000000', .4));
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = s * .04;
      g.strokeStyle = gr; g.lineWidth = s * .07; g.beginPath(); g.arc(0, 0, R * .78, 0, 7); g.stroke();
      g.lineWidth = s * .035; for (i = 0; i < 3; i++) { var aa = i * Math.PI * 2 / 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(aa) * R * .78, Math.sin(aa) * R * .78); g.stroke(); }
      for (i = 0; i < 6; i++) { var ab = i * Math.PI / 3 + .5; disque(g, Math.cos(ab) * R * .78, Math.sin(ab) * R * .78, s * .04, mix(cc, '#ffffff', .3)); }
      g.shadowColor = 'transparent'; rubis(g, 0, 0, s * .06); g.restore();
    }
    if (b.motif === 'radar') {
      g.translate(R, R); var a = t * Math.PI * 2 - Math.PI / 2;
      g.strokeStyle = rgba(cc, .35); g.lineWidth = 1; [.33, .66, .97].forEach(function (k) { g.beginPath(); g.arc(0, 0, R * k, 0, 7); g.stroke(); });
      g.beginPath(); g.moveTo(-R, 0); g.lineTo(R, 0); g.moveTo(0, -R); g.lineTo(0, R); g.stroke();
      for (i = 0; i < 40; i++) { g.fillStyle = rgba(cc, .5 * (1 - i / 40)); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * .97, a - (i + 1) * .03, a - i * .03); g.closePath(); g.fill(); }
      g.strokeStyle = mix(cc, '#ffffff', .5); g.lineWidth = 2; g.shadowColor = cc; g.shadowBlur = 8; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * .97, Math.sin(a) * R * .97); g.stroke();
      [[.6, .5], [.35, 2.4], [.8, 4.1]].forEach(function (p) { var d = ((a - p[1]) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), al = Math.max(0, 1 - d / 3); if (al > 0) { g.fillStyle = rgba(mix(cc, '#ffffff', .4), al); g.beginPath(); g.arc(Math.cos(p[1]) * R * p[0], Math.sin(p[1]) * R * p[0], s * .03, 0, 7); g.fill(); } });
      g.shadowColor = 'transparent';
    }
    if (b.motif === 'coeur') {
      var bt = t < .12 ? Math.sin(t / .12 * Math.PI) : t > .2 && t < .34 ? .6 * Math.sin((t - .2) / .14 * Math.PI) : 0, k = .78 + .16 * bt;
      g.translate(R, R * 1.05); g.scale(k * R / 16, k * R / 16);
      g.shadowColor = cc; g.shadowBlur = 6 + 10 * bt;
      g.beginPath(); g.moveTo(0, 12); g.bezierCurveTo(-18, 0, -14, -14, 0, -6); g.bezierCurveTo(14, -14, 18, 0, 0, 12); g.closePath();
      var hg = g.createLinearGradient(0, -12, 0, 12); hg.addColorStop(0, mix(cc, '#ffffff', .35)); hg.addColorStop(1, mix(cc, '#000000', .3)); g.fillStyle = hg; g.fill();
    }
    if (b.motif === 'etoiles') {
      var rs = alea(3);
      for (i = 0; i < 16; i++) { var ex = rs() * s, ey = rs() * s, ph = rs(), sz = (1 + rs() * 2.5) * s / 120, al2 = .25 + .75 * Math.pow(.5 + .5 * Math.sin((t + ph) * Math.PI * 2), 2);
        g.fillStyle = rgba(mix(cc, '#ffffff', .5), al2); g.shadowColor = cc; g.shadowBlur = 6 * al2; etoileP(g, ex, ey, sz * 3, sz, 4, rgba(mix(cc, '#ffffff', .6), al2)); }
    }
    if (b.motif === 'flamme') {
      g.translate(R, s * .95);
      [[1, mix(cc, '#000000', .1)], [.72, mix(cc, '#ffcc00', .5)], [.45, '#fff2b0']].forEach(function (L, j) {
        var h = s * .85 * L[0], w = s * .32 * L[0], q = function (k) { return Math.sin((t + k + j * .13) * Math.PI * 2) * w * .18; };
        g.shadowColor = cc; g.shadowBlur = j ? 0 : s * .08;
        g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-w * 1.2, -h * .1, -w * .7 + q(.1), -h * .6, q(.3), -h); g.bezierCurveTo(w * .7 + q(.6), -h * .6, w * 1.2, -h * .1, 0, 0); g.closePath(); g.fillStyle = L[1]; g.fill();
      });
    }
    if (b.motif === 'cage') {   // cage de tourbillon : le balancier tourne sur lui-même, la cage fait un tour
      g.translate(R, R); g.rotate(t * Math.PI * 2);
      var cg = g.createLinearGradient(-R, -R, R, R); cg.addColorStop(0, mix(cc, '#ffffff', .6)); cg.addColorStop(1, mix(cc, '#000000', .4));
      g.strokeStyle = cg; g.lineWidth = s * .05; g.beginPath(); g.arc(0, 0, R * .86, 0, 7); g.stroke();
      for (i = 0; i < 3; i++) { var a4 = i * Math.PI * 2 / 3; g.lineWidth = s * .04; g.beginPath(); g.moveTo(Math.cos(a4) * R * .86, Math.sin(a4) * R * .86); g.quadraticCurveTo(Math.cos(a4 + .5) * R * .3, Math.sin(a4 + .5) * R * .3, 0, 0); g.stroke(); }
      g.rotate(Math.sin(t * Math.PI * 8) * 1.6);
      g.strokeStyle = mix(cc, '#ffffff', .3); g.lineWidth = s * .03; g.beginPath(); g.arc(0, 0, R * .5, 0, 7); g.stroke();
      for (i = 0; i < 2; i++) { g.beginPath(); g.moveTo(-R * .5, 0); g.lineTo(R * .5, 0); g.stroke(); g.rotate(Math.PI / 2); }
      rubis(g, 0, 0, s * .055);
    }
    if (b.motif === 'pendule') {
      var ap = Math.sin(t * Math.PI * 2) * .45; g.translate(R, s * .06); g.rotate(ap);
      g.strokeStyle = mix(cc, '#ffffff', .2); g.lineWidth = s * .025; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, s * .7); g.stroke();
      var pg = g.createRadialGradient(-s * .04, s * .74, 2, 0, s * .76, s * .16); pg.addColorStop(0, mix(cc, '#ffffff', .7)); pg.addColorStop(1, mix(cc, '#000000', .4));
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = s * .05; g.beginPath(); g.arc(0, s * .76, s * .15, 0, 7); g.fillStyle = pg; g.fill(); g.shadowColor = 'transparent';
      disque(g, 0, 0, s * .03, cc);
    }
    if (b.motif === 'neige' || b.motif === 'bulles') {
      var rn = alea(b.motif === 'neige' ? 9 : 17);
      for (i = 0; i < 22; i++) { var bx = rn() * s, sp = .5 + rn(), sz2 = (b.motif === 'neige' ? 1.5 + rn() * 3 : 3 + rn() * 7) * s / 120, ph2 = rn();
        var yy2 = b.motif === 'neige' ? ((ph2 + t * sp) % 1) * (s + 20) - 10 : s + 10 - ((ph2 + t * sp) % 1) * (s + 20), xx2 = bx + Math.sin((t + ph2) * Math.PI * 2) * s * .04;
        if (b.motif === 'neige') { g.fillStyle = rgba(mix(cc, '#ffffff', .7), .9); g.shadowColor = '#ffffff'; g.shadowBlur = 4; g.beginPath(); g.arc(xx2, yy2, sz2, 0, 7); g.fill(); }
        else { g.strokeStyle = rgba(mix(cc, '#ffffff', .4), .8); g.lineWidth = 1.2; g.beginPath(); g.arc(xx2, yy2, sz2, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(xx2 - sz2 * .35, yy2 - sz2 * .35, sz2 * .22, 0, 7); g.fill(); }
      }
      g.shadowColor = 'transparent';
    }
    if (b.motif === 'eclair') {
      var fl = f === 0 || f === 2 ? 1 : f === 1 || f === 3 ? .45 : f < 7 ? .3 * (1 - (f - 4) / 3) : 0;
      if (fl > 0) { var re = alea(4 + (f < 4 ? 0 : 1)); g.strokeStyle = rgba(mix(cc, '#ffffff', .6), fl); g.shadowColor = cc; g.shadowBlur = 14 * fl; g.lineWidth = s * .035;
        g.beginPath(); var ex2 = R + (re() - .5) * s * .2, ey2 = 0; g.moveTo(ex2, ey2); while (ey2 < s * .95) { ex2 += (re() - .5) * s * .22; ey2 += s * (.08 + re() * .1); g.lineTo(ex2, ey2); } g.stroke();
        g.lineWidth = s * .015; g.beginPath(); g.moveTo(R, s * .35); g.lineTo(R + s * .2, s * .5); g.lineTo(R + s * .15, s * .65); g.stroke(); g.shadowColor = 'transparent'; }
    }
    if (b.motif === 'sablier') {
      var sbr = t < .9 ? t / .9 : 1, rot = t < .9 ? 0 : (t - .9) / .1 * Math.PI;
      g.translate(R, R); g.rotate(rot); var hw2 = s * .3, hh = s * .42;
      g.strokeStyle = mix(cc, '#ffffff', .4); g.lineWidth = s * .025; g.beginPath(); g.moveTo(-hw2, -hh); g.lineTo(hw2, -hh); g.lineTo(s * .03, 0); g.lineTo(hw2, hh); g.lineTo(-hw2, hh); g.lineTo(-s * .03, 0); g.closePath(); g.stroke();
      g.fillStyle = cc; var top = (1 - sbr) * hh * .85;
      if (top > 1) { g.beginPath(); g.moveTo(-hw2 * top / hh, -top); g.lineTo(hw2 * top / hh, -top); g.lineTo(0, 0); g.closePath(); g.fill(); }
      var bot = sbr * hh * .85; g.beginPath(); g.moveTo(-hw2 * .95, hh - 2); g.lineTo(hw2 * .95, hh - 2); g.lineTo(0, hh - bot); g.closePath(); g.fill();
      if (sbr < 1) { g.fillRect(-1, 0, 2, hh - bot); }
      g.fillStyle = mix(cc, '#000000', .4); g.fillRect(-hw2 * 1.2, -hh - s * .05, hw2 * 2.4, s * .05); g.fillRect(-hw2 * 1.2, hh, hw2 * 2.4, s * .05);
    }
    if (b.motif === 'soleil') {
      g.translate(R, R); g.rotate(t * Math.PI / 6);
      for (i = 0; i < 12; i++) { g.rotate(Math.PI / 6); var ln = R * (.75 + .12 * Math.sin((t * 2 + i / 3) * Math.PI * 2)); g.strokeStyle = rgba(mix(cc, '#ffdd55', .5), .9); g.lineWidth = s * .04; g.beginPath(); g.moveTo(R * .45, 0); g.lineTo(ln, 0); g.stroke(); }
      var sg = g.createRadialGradient(0, 0, 2, 0, 0, R * .4); sg.addColorStop(0, '#fff6c9'); sg.addColorStop(1, mix(cc, '#ffaa00', .5)); g.shadowColor = cc; g.shadowBlur = s * .15; g.beginPath(); g.arc(0, 0, R * .38, 0, 7); g.fillStyle = sg; g.fill(); g.shadowColor = 'transparent';
    }
    if (b.motif === 'vague') {
      for (i = 0; i < 3; i++) { g.fillStyle = rgba(mix(cc, '#ffffff', i * .25), .35 + i * .2); g.beginPath(); g.moveTo(0, s);
        for (var xw = 0; xw <= s; xw += 4) g.lineTo(xw, s * (.45 + i * .15) + Math.sin(xw / s * Math.PI * 4 + t * Math.PI * 2 * (i % 2 ? -1 : 1) + i) * s * .06); g.lineTo(s, s); g.closePath(); g.fill(); }
    }
    if (b.motif === 'disco') {
      var dc = ['#ff4fd8', '#46d9ff', '#ffe14a', '#5dff8a', cc];
      g.translate(R, R);
      for (i = 0; i < 8; i++) { var ad = i * Math.PI / 4 + t * Math.PI * 2; g.fillStyle = rgba(dc[(i + f) % dc.length], .35); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, ad - .18, ad + .18); g.closePath(); g.fill(); }
      var bd = g.createRadialGradient(-R * .1, -R * .1, 2, 0, 0, R * .3); bd.addColorStop(0, '#ffffff'); bd.addColorStop(1, '#8a8f99'); g.beginPath(); g.arc(0, 0, R * .28, 0, 7); g.fillStyle = bd; g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; for (i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-R * .28, i * R * .08); g.lineTo(R * .28, i * R * .08); g.stroke(); g.beginPath(); g.moveTo(i * R * .08, -R * .28); g.lineTo(i * R * .08, R * .28); g.stroke(); }
    }
    if (b.motif === 'onde') {
      g.translate(R, R);
      for (i = 0; i < 3; i++) { var u = (t + i / 3) % 1; g.strokeStyle = rgba(cc, (1 - u) * .9); g.lineWidth = s * .03 * (1 - u) + 1; g.shadowColor = cc; g.shadowBlur = 10 * (1 - u); g.beginPath(); g.arc(0, 0, R * (.15 + .8 * u), 0, 7); g.stroke(); }
      g.shadowBlur = 12; disque(g, 0, 0, s * .07, mix(cc, '#ffffff', .4)); g.shadowColor = 'transparent';
    }
    return c;
  }
  function aodDimDe(cfg) { return mix(cfg.doux, '#000000', .25); }
  function anneau(cfg, f) {
    var c = toile(W, W), g = c.getContext('2d');
    g.lineCap = 'round'; g.lineWidth = 9;
    g.strokeStyle = rgba(cfg.accent, .16); g.beginPath(); g.arc(CX, CY, 228, 0, 7); g.stroke();
    if (f > 0) { g.strokeStyle = cfg.accent; g.beginPath(); g.arc(CX, CY, 228, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2 - (f >= 1 ? 0 : .02)); g.stroke(); }
    return c;
  }
  function barre(w, h, cc, f) {
    var c = toile(w, h), g = c.getContext('2d');
    if (f > 0) { rond(g, 0, 0, Math.max(h, w * f), h, h / 2); g.fillStyle = cc; g.fill(); }
    return c;
  }
  function arc(R, d, cc, f) {
    var c = toile(d, d), g = c.getContext('2d');
    if (f > 0) { g.lineCap = 'round'; g.lineWidth = Math.max(5, d * .07); g.strokeStyle = cc; g.beginPath(); g.arc(d / 2, d / 2, R, Math.PI * .75, Math.PI * .75 + f * Math.PI * 1.5); g.stroke(); }
    return c;
  }
  /* aiguille d'un petit cadran : de -135° (0 %) à +135° (100 %), avec son axe */
  function petiteAiguille(d, cc, f, cAxe) {
    var c = toile(d, d), g = c.getContext('2d'), R = d / 2, an = (-135 + 270 * f) * Math.PI / 180, L = R * .74, lw = Math.max(3, d * .035);
    g.translate(R, R); g.rotate(an);
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
    g.beginPath(); g.moveTo(-lw / 2, R * .16); g.lineTo(-lw * .2, -L); g.lineTo(lw * .2, -L); g.lineTo(lw / 2, R * .16); g.closePath(); g.fillStyle = cc; g.fill();
    g.shadowColor = 'transparent';
    g.beginPath(); g.arc(0, 0, lw * 1.5, 0, 7); g.fillStyle = cAxe || '#ffffff'; g.fill();
    g.beginPath(); g.arc(0, 0, lw * .7, 0, 7); g.fillStyle = cc; g.fill();
    return c;
  }
  /* aiguille dessinée vers le haut ; px, py : point de rotation dans l'image */
  function aiguille(cfg, b, quoi, aod) {
    var e = b.echelle, L = Math.round((quoi === 'h' ? 112 : quoi === 's' ? 196 : 178) * e), T = Math.round((quoi === 's' ? 42 : 20) * e), st = b.style, ts = b.trotStyle || 'fine';
    var base = quoi === 's' ? (ts === 'epaisse' || ts === 'sport' ? 6 : 3) : ({ larges: [16, 12], epees: [14, 11], dauphine: [16, 13], squelette: [14, 11], fleche: [8, 6], baton: [10, 8] }[st] || [8, 6])[quoi === 'h' ? 0 : 1];
    var lw = Math.max(2, Math.round(base * Math.max(.5, e)));
    var ww = quoi === 's' ? Math.max(18, Math.round(20 * e) + 6) : st === 'fleche' ? Math.round(lw * 2.6) + 8 : lw + 8;
    var P = b.ombre && !aod ? 6 : 0, w = Math.max(12, ww) + 2 * P, h = L + T + 2 * P, c = toile(w, h), g = c.getContext('2d'), cx = (w - 2 * P) / 2, py = L;
    var col = quoi === 's' ? coul(cfg, b.trot) : aod ? mix(cfg.doux, '#000', .2) : coul(cfg, b.couleur);
    g.translate(P, P); g.lineJoin = 'round'; g.lineCap = 'round';
    if (P) { g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 4; }
    var rondPlein = function (x, y, r, cc) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = cc; g.fill(); };
    if (quoi === 's') {
      var lws = Math.max(1.5, (ts === 'epaisse' ? 4.5 : ts === 'sport' ? 3.2 : 2.2) * e);
      g.strokeStyle = col; g.lineWidth = lws; g.beginPath(); g.moveTo(cx, py + T - 4); g.lineTo(cx, ts === 'fleche' ? 16 * e + 4 : 4); g.stroke();
      if (ts === 'contrepoids') rondPlein(cx, py + T - Math.max(6, 8 * e), Math.max(4, 7 * e), col);
      if (ts === 'fleche') { g.beginPath(); g.moveTo(cx, 2); g.lineTo(cx + 7 * e + 2, 20 * e + 4); g.lineTo(cx - 7 * e - 2, 20 * e + 4); g.closePath(); g.fillStyle = col; g.fill(); }
      if (ts === 'sucette') { var ry = Math.round(L * .16); rondPlein(cx, ry, Math.max(4, 7.5 * e), col); rondPlein(cx, ry, Math.max(1.5, 3 * e), cfg.c1); }
      if (ts === 'sport') { g.strokeStyle = cfg.texte; g.lineWidth = lws + 1.5; g.beginPath(); g.moveTo(cx, py + T - 4); g.lineTo(cx, py + 10 * e); g.stroke(); g.strokeStyle = col; g.lineWidth = lws; g.beginPath(); g.moveTo(cx, 4); g.lineTo(cx, L * .12); g.stroke(); }
      rondPlein(cx, py, Math.max(3, 5 * e), col);
    }
    else if (st === 'fines') { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(cx, py + T - lw); g.lineTo(cx, lw); g.stroke(); }
    else {
      var p = new Path2D(), r = lw / 2;
      if (st === 'epees' || st === 'squelette') { p.moveTo(cx, 2); p.lineTo(cx + lw / 2, L * .2); p.lineTo(cx + lw * .3, py + T - 4); p.lineTo(cx - lw * .3, py + T - 4); p.lineTo(cx - lw / 2, L * .2); p.closePath(); }
      else if (st === 'dauphine') { p.moveTo(cx, 2); p.lineTo(cx + lw / 2, L * .78); p.lineTo(cx, py + T - 2); p.lineTo(cx - lw / 2, L * .78); p.closePath(); }
      else if (st === 'fleche') { var aw = lw * 1.3, ah = lw * 2.2; p.moveTo(cx, 2); p.lineTo(cx + aw, ah + 2); p.lineTo(cx + lw * .35, ah); p.lineTo(cx + lw * .35, py + T - 2); p.lineTo(cx - lw * .35, py + T - 2); p.lineTo(cx - lw * .35, ah); p.lineTo(cx - aw, ah + 2); p.closePath(); }
      else { p.moveTo(cx - r, py + T - 2); p.lineTo(cx - r, 6 + r); p.arcTo(cx - r, 4, cx, 4, r); p.arcTo(cx + r, 4, cx + r, 6 + r, r); p.lineTo(cx + r, py + T - 2); p.closePath(); }
      if (aod) { g.strokeStyle = col; g.lineWidth = 1.6; g.stroke(p); }
      else if (st === 'squelette') {
        g.strokeStyle = col; g.lineWidth = Math.max(1.6, 2.2 * e); g.stroke(p); g.shadowColor = 'transparent';
        g.fillStyle = cfg.accent; g.beginPath(); g.moveTo(cx, 6); g.lineTo(cx + lw * .3, L * .2); g.lineTo(cx - lw * .3, L * .2); g.closePath(); g.fill();
      } else {
        g.fillStyle = col; g.fill(p); g.shadowColor = 'transparent';
        if (st === 'dauphine') { g.save(); g.clip(p); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(cx, 0, lw, h); g.restore(); }
        else if (st === 'baton') { g.save(); g.clip(p); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(cx - r, 0, r * .7, h); g.restore(); }
        else if (st === 'fleche') { g.fillStyle = cfg.accent; g.beginPath(); g.moveTo(cx, 6); g.lineTo(cx + lw * .7, lw * 1.8); g.lineTo(cx - lw * .7, lw * 1.8); g.closePath(); g.fill(); }
        else {
          g.fillStyle = cfg.accent; g.globalAlpha = .9;
          if (st === 'larges') g.fillRect(cx - lw / 2 + 3, 12, lw - 6, L * .45); else { g.beginPath(); g.moveTo(cx, 8); g.lineTo(cx + lw * .22, L * .22); g.lineTo(cx - lw * .22, L * .22); g.closePath(); g.fill(); }
          g.globalAlpha = 1;
        }
      }
      // matière luminescente (Super-LumiNova) : bande claire au centre de l'aiguille, qui brille aussi en AOD
      if (b.lume && st !== 'fines') {
        var lw2 = Math.max(2, lw * (st === 'larges' || st === 'baton' ? .5 : .38)), y1 = st === 'fleche' ? lw * 2.4 : L * .14, y2 = py - Math.max(10, lw * 1.2);
        g.save(); g.shadowColor = '#7dffb0'; g.shadowBlur = aod ? 5 : 7; g.fillStyle = aod ? '#9fe6b4' : '#e2ffe9';
        rond(g, cx - lw2 / 2, y1, lw2, Math.max(4, y2 - y1), lw2 / 2); g.fill(); g.restore();
      }
    }
    return { c: c, px: Math.round(cx + P), py: py + P };
  }
  function centre(cfg, aod, s) {
    s = s || 24; var c = toile(s, s), g = c.getContext('2d');
    g.fillStyle = aod ? mix(cfg.doux, '#000', .3) : cfg.accent; g.beginPath(); g.arc(s / 2, s / 2, s * .375, 0, 7); g.fill();
    g.fillStyle = aod ? '#000' : cfg.c1; g.beginPath(); g.arc(s / 2, s / 2, s * .15, 0, 7); g.fill();
    return c;
  }

  /* ---------------- aperçu : la montre simulée avec les mêmes images ---------------- */
  var CACHE = { cle: '', p: null };
  function apercu(cv, c, opt) {
    opt = opt || {};
    var n0 = norm(c), cle = JSON.stringify(n0) + (photoImg(n0.photo) ? 'p' : '');
    if (CACHE.cle !== cle) { CACHE.cle = cle; CACHE.p = paquet(n0); }
    var pk = CACHE.p, IM = pk.images, sp = pk.spec, cfg = sp.cfg, aod = !!opt.aod;
    var g = cv.getContext('2d'), sc = cv.width / W, d = opt.date || new Date();
    var val = opt.valeurs || {};
    g.save(); g.clearRect(0, 0, cv.width, cv.height); g.scale(sc, sc);
    g.beginPath(); g.arc(CX, CY, CX, 0, 7); if (cfg.fond !== 'transparent' || aod) { g.fillStyle = '#000'; g.fill(); } g.save(); g.clip();
    var im = function (src) { return IM[String(src).replace(/^images\//, '')]; };
    sp.w.forEach(function (w) {
      if (!!w.aod !== aod) return;
      if (w.k === 'img') { var i0 = im(w.src); if (i0) g.drawImage(i0, w.x, w.y); }
      else if (w.k === 'anim') { var fi = opt.frame != null ? opt.frame % w.n : Math.floor(Date.now() / (1000 / w.fps)) % w.n, ia = IM[w.dossier + '/f_' + fi + '.png']; if (ia) g.drawImage(ia, w.x, w.y); }
      else if (w.k === 'level') {
        var v = val[w.type] != null ? val[w.type] : w.type === 'BATTERY' ? 86 : w.type === 'STEP' ? 64 : w.type === 'CAL' ? 45 : 3;
        var idx = w.type === 'WEATHER' ? v : Math.max(0, Math.min(w.n - 1, Math.round(v / 100 * (w.n - 1))));
        var i1 = IM[w.dossier + '/' + idx + '.png']; if (i1) g.drawImage(i1, w.x, w.y);
      }
      else if (w.k === 'num') {
        var tx = String(val[w.type] != null ? val[w.type] : w.ex), parts = [];
        tx.split('').forEach(function (ch) { var n = /\d/.test(ch) ? ch : ch === '-' ? 'moins' : ch === ':' ? 'dp' : ch === '.' ? (w.point || 'point') : null; if (n) parts.push(IM[w.dossier + '/' + n + '.png']); });
        if (w.unite) parts.push(IM[w.dossier + '/' + w.unite + '.png']);
        var tw = parts.reduce(function (s, p) { return s + (p ? p.width : 0); }, 0), x = w.align === 'gauche' ? w.x : w.align === 'droite' ? w.x + w.w - tw : w.x + (w.w - tw) / 2;
        parts.forEach(function (p) { if (p) { g.drawImage(p, x, w.y); x += p.width; } });
      }
      else if (w.k === 'time') {
        var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2), ss = ('0' + d.getSeconds()).slice(-2), x2 = w.x;
        [hh[0], hh[1], 'dp', mm[0], mm[1]].forEach(function (ch) { var i2 = IM[w.dossier + '/' + ch + '.png']; if (i2) g.drawImage(i2, x2, w.y); x2 += ch === 'dp' ? w.dpw : w.cw; });
        if (w.sec) { var x3 = w.sec.x; [ss[0], ss[1]].forEach(function (ch) { var i5 = IM[w.sec.dossier + '/' + ch + '.png']; if (i5) g.drawImage(i5, x3, w.sec.y); x3 += w.sec.cw; }); }
      }
      else if (w.k === 'date') {
        var j = (d.getDay() + 6) % 7;
        if (w.sem) { var a = IM[w.dossier + '/semaine/' + j + '.png']; if (a) g.drawImage(a, w.sem.x, w.sem.y); }
        if (w.jour) { var b2 = IM[w.dossier + '/jour/' + (d.getDate() - 1) + '.png']; if (b2) g.drawImage(b2, w.jour.x, w.jour.y); }
        if (w.mois) { var c2 = IM[w.dossier + '/mois/' + d.getMonth() + '.png']; if (c2) g.drawImage(c2, w.mois.x, w.mois.y); }
      }
      else if (w.k === 'pointer') {
        var hA = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, mA = (d.getMinutes() + d.getSeconds() / 60) / 60 * Math.PI * 2, sA = d.getSeconds() / 60 * Math.PI * 2;
        [[w.h, hA], [w.m, mA], [w.s, sA]].forEach(function (r) {
          if (!r[0]) return; var i4 = im(r[0].src); if (!i4) return;
          g.save(); g.translate(w.cx == null ? CX : w.cx, w.cy == null ? CY : w.cy); g.rotate(r[1]); g.drawImage(i4, -r[0].px, -r[0].py); g.restore();
        });
      }
    });
    g.restore();
    // élément sélectionné (éditeur)
    if (opt.sel != null && cfg.blocs[opt.sel]) {
      var bx = boite(cfg.blocs[opt.sel], cfg);
      g.strokeStyle = '#ffffff'; g.lineWidth = 2 / sc; g.setLineDash([6 / sc, 4 / sc]);
      g.strokeRect(bx.x - 3, bx.y - 3, bx.w + 6, bx.h + 6); g.setLineDash([]);
      g.strokeStyle = 'rgba(79,209,197,.9)'; g.lineWidth = 1 / sc; g.strokeRect(bx.x - 5, bx.y - 5, bx.w + 10, bx.h + 10);
    }
    g.restore();
    return pk;
  }
  /* écran ou cadre fixe (dessiné dans le fond) : afficheur LCD, verre, cadre */
  function panneau(g, b, G, cfg) {
    var x = G.x, y = G.y, w = G.w, h = G.h, r = Math.min(b.r, w / 2, h / 2), bord = coul(cfg, b.couleur), st = b.style;
    var LCD = { lcd: ['#c4cbb0', '#a9b394', '#6d7560'], lcdvert: ['#a8c39a', '#86a77a', '#4f6a47'], ambre: ['#3a2a10', '#24190a', '#5a4214'] };
    g.save();
    if (st !== 'cadre') {
      // ombre portée et boîtier
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
      rond(g, x - 4, y - 4, w + 8, h + 8, r + 4); g.fillStyle = st === 'verre' ? 'rgba(0,0,0,.35)' : mix(bord, '#000000', .78); g.fill();
      g.shadowColor = 'transparent';
      rond(g, x - 4, y - 4, w + 8, h + 8, r + 4); g.lineWidth = 1.5; g.strokeStyle = rgba(bord, .55); g.stroke();
      rond(g, x, y, w, h, r);
      if (LCD[st]) { var gl = g.createLinearGradient(0, y, 0, y + h); gl.addColorStop(0, LCD[st][0]); gl.addColorStop(1, LCD[st][1]); g.fillStyle = gl; }
      else if (st === 'sombre') { var gs = g.createLinearGradient(0, y, 0, y + h); gs.addColorStop(0, '#1b2026'); gs.addColorStop(1, '#0b0e12'); g.fillStyle = gs; }
      else { var gv = g.createLinearGradient(0, y, 0, y + h); gv.addColorStop(0, 'rgba(255,255,255,.14)'); gv.addColorStop(.5, 'rgba(255,255,255,.04)'); gv.addColorStop(1, 'rgba(255,255,255,.08)'); g.fillStyle = gv; }
      g.fill();
      // ombre intérieure en haut (l'écran est en creux) et reflet
      g.save(); rond(g, x, y, w, h, r); g.clip();
      var gi = g.createLinearGradient(0, y, 0, y + Math.min(18, h * .3)); gi.addColorStop(0, 'rgba(0,0,0,' + (LCD[st] ? .28 : .5) + ')'); gi.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gi; g.fillRect(x, y, w, h);
      if (st === 'verre' || LCD[st]) { var gr = g.createLinearGradient(x, y, x + w * .6, y + h); gr.addColorStop(0, 'rgba(255,255,255,' + (st === 'verre' ? .16 : .1) + ')'); gr.addColorStop(.45, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h); }
      g.restore();
      rond(g, x, y, w, h, r); g.lineWidth = 1; g.strokeStyle = LCD[st] ? LCD[st][2] : 'rgba(255,255,255,.12)'; g.stroke();
    } else { rond(g, x, y, w, h, r); g.lineWidth = 2; g.strokeStyle = bord; g.stroke(); }
    g.restore();
  }
  function boite(b, cfg) { var G = geo(normBloc(b), norm(cfg)); return { x: G.x, y: G.y, w: G.w, h: G.h }; }

  /* ---------------- polices ---------------- */
  function famDate(b) { return b && (b.police === 'lcd' || b.police === 'lcd14') ? POLICES.lcd14.fam : PETITE.fam; }
  function polices(base) {
    if (!root.FontFace || !root.document) return Promise.resolve();
    var vu = {}, l = Object.keys(POLICES).map(function (k) { return POLICES[k]; }).filter(function (p) { if (vu[p.fam]) return false; vu[p.fam] = 1; return true; });
    return Promise.all(l.map(function (p) {
      if (p.charge) return p.charge;
      var f = new root.FontFace(p.fam, 'url(' + (base || '') + p.fichier + ')');
      p.charge = f.load().then(function (x) { root.document.fonts.add(x); MES = null; CACHE_G = {}; }).catch(function () { });
      return p.charge;
    }));
  }

  /* ---------------- Garmin (Connect IQ, écran MIP 64 couleurs) ----------------
     garmin(cfg, S) → { S, fond (canvas S×S : partie fixe), ops (à dessiner par la montre), polices, icones }
     Mêmes positions que la T-Rex 3, mises à l'échelle S/480 ; les nombres sont écrits avec des polices
     fabriquées à partir des mêmes fichiers, les aiguilles sont des polygones tournés par la montre. */
  var GENRES = ['soleil', 'nuit', 'nuages', 'nuages_nuit', 'couvert', 'pluie', 'averses', 'neige', 'orage', 'brouillard', 'sable', 'inconnu'];
  // conditions météo Garmin (Weather.CONDITION_*, 0 à 53) → genre
  var GARMIN_METEO = [0, 2, 4, 5, 7, 2, 8, 7, 9, 9, 7, 6, 8, 5, 5, 5, 7, 7, 7, 7, 4, 7, 2, 0, 6, 6, 6, 6, 8, 9, 10, 5, 8, 9, 7, 10, 8, 10, 9, 9, 0, 8, 8, 7, 7, 5, 7, 7, 7, 5, 7, 7, 2, 11];
  function mip(hex) {
    if (!HEX.test(hex || '')) return 0xffffff;
    var n = parseInt(hex.slice(1), 16), q = function (v) { return Math.round(v / 85) * 85; };
    return (q(n >> 16 & 255) << 16) | (q(n >> 8 & 255) << 8) | q(n & 255);
  }
  function fxGarmin(fx, c, px, fondc) {
    var o = { fx: 0, c: mip(c), c2: 0, c3: 0, n: 1 }, fonce = mix(c, '#000000', .62);
    if (fx === 'relief') { o.fx = 1; o.c2 = mip(fonce); o.n = Math.max(1, Math.round(px * .07)); }
    else if (fx === 'ombre') { o.fx = 2; o.c2 = 0; o.n = Math.max(1, Math.round(px * .05)); }
    else if (fx === 'biseau' || fx === 'metal') { o.fx = 3; o.c2 = mip(fonce); o.c3 = mip(mix(c, '#ffffff', .6)); }
    else if (fx === 'contour') { o.fx = 4; o.c2 = mip(mix(c, '#000000', .8)); o.n = px > 30 ? 2 : 1; }
    else if (fx === 'creux') { o.fx = 5; o.c2 = mip(fondc); o.n = px > 30 ? 2 : 1; }
    else if (fx === 'lueur') { o.fx = 4; o.c2 = mip(mix(c, '#000000', .45)); o.n = px > 30 ? 3 : 2; }
    return o;
  }
  function mainsGarmin(cfg, b, cs) {
    var e = b.echelle, ts = b.trotStyle || 'fine', acc = mip(cfg.accent), out = {};
    var rect = function (x0, x1, y0, y1) { return [x0, y0, x1, y0, x1, y1, x0, y1]; };
    ['h', 'm'].forEach(function (q) {
      var L = Math.round((q === 'h' ? 112 : 178) * e), T = Math.round(20 * e), st = b.style, c = mip(coul(cfg, b.couleur));
      var base = ({ larges: [16, 12], epees: [14, 11], dauphine: [16, 13], squelette: [14, 11], fleche: [8, 6], baton: [10, 8] }[st] || [8, 6])[q === 'h' ? 0 : 1];
      var lw = Math.max(2, Math.round(base * Math.max(.5, e))), l = [];
      if (st === 'epees' || st === 'squelette') {
        var pe = [0, -L + 2, lw / 2, -L * .8, lw * .3, T - 4, -lw * .3, T - 4, -lw / 2, -L * .8];
        if (st === 'epees') { l.push({ p: pe, c: c }); l.push({ p: [0, -L + 8, lw * .22, -L * .78, -lw * .22, -L * .78], c: acc }); }
        else { l.push({ p: pe, c: c, l: 1, w: Math.max(2, 2.2 * e) }); l.push({ p: [0, -L + 6, lw * .3, -L * .8, -lw * .3, -L * .8], c: acc }); }
      } else if (st === 'dauphine') {
        l.push({ p: [0, -L + 2, -lw / 2, -L * .22, 0, T - 2], c: c }); l.push({ p: [0, -L + 2, lw / 2, -L * .22, 0, T - 2], c: mip(mix(coul(cfg, b.couleur), '#000000', .3)) });
      } else if (st === 'fleche') {
        var aw = lw * 1.3, ah = lw * 2.2;
        l.push({ p: rect(-lw * .35, lw * .35, T - 2, -L + ah), c: c }); l.push({ p: [0, -L + 2, aw, -L + ah + 2, -aw, -L + ah + 2], c: c });
        l.push({ p: [0, -L + 6, lw * .7, -L + lw * 1.8, -lw * .7, -L + lw * 1.8], c: acc });
      } else if (st === 'larges') {
        l.push({ p: rect(-lw / 2, lw / 2, T - 2, -L + 4), c: c }); l.push({ p: rect(-lw / 2 + 3, lw / 2 - 3, -L + 12, -L + 12 + L * .45), c: acc });
      } else l.push({ p: rect(-lw / 2, lw / 2, T - 2, -L + 4), c: c });
      out[q] = l;
    });
    if (b.secondes) {
      var L = Math.round(196 * e), T = Math.round(42 * e), c = mip(coul(cfg, b.trot)), lws = Math.max(1.5, (ts === 'epaisse' ? 4.5 : ts === 'sport' ? 3.2 : 2.2) * e), l = [];
      l.push({ p: rect(-lws / 2, lws / 2, T - 4, ts === 'fleche' ? -L + 16 * e + 4 : -L + 4), c: c });
      if (ts === 'contrepoids') l.push({ r: [0, T - Math.max(6, 8 * e), Math.max(4, 7 * e)], c: c });
      if (ts === 'fleche') l.push({ p: [0, -L + 2, 7 * e + 2, -L + 20 * e + 4, -7 * e - 2, -L + 20 * e + 4], c: c });
      if (ts === 'sucette') { l.push({ r: [0, -L + L * .16, Math.max(4, 7.5 * e)], c: c }); l.push({ r: [0, -L + L * .16, Math.max(1.5, 3 * e)], c: mip(cfg.c1) }); }
      if (ts === 'sport') l.push({ p: rect(-(lws + 1.5) / 2, (lws + 1.5) / 2, T - 4, 10 * e), c: mip(cfg.texte) });
      l.push({ r: [0, 0, Math.max(3, 5 * e)], c: c });
      out.s = l;
    } else out.s = null;
    out.cap = [{ r: [0, 0, cs * .375], c: acc }, { r: [0, 0, cs * .15], c: mip(cfg.c1) }];
    return out;
  }
  function garmin(c, S) {
    var cfg = norm(c), k = S / 480, pk = paquet(cfg), F = [], Fk = {}, I = [], Ik = {}, ops = [];
    var R = function (v) { return Math.round(v * k); };
    var police = function (fam, px, h, chars, mono, esp) {
      px = Math.max(6, Math.round(px * k)); h = Math.max(px + 2, Math.round(h * k)); mono = mono ? Math.round(mono * k) : 0; esp = Math.round((esp || 0) * k);
      var cle = [fam, px, h, chars, mono, esp].join('|');
      if (Fk[cle] == null) { Fk[cle] = F.length; F.push({ fam: fam, px: px, h: h, chars: chars, mono: mono, esp: esp }); }
      return Fk[cle];
    };
    var lettres = function (l) { var v = {}; l.join('').split('').forEach(function (ch) { v[ch] = 1; }); return Object.keys(v).sort().join(''); };
    var sc = function (l, f) { return l.map(function (p, i) { return Math.round(p * k * 10) / 10; }); };
    var scEl = function (l) { return l.map(function (o) { var r = { c: o.c }; if (o.r) r.r = sc(o.r); else { r.p = sc(o.p); r.l = o.l || 0; r.w = Math.max(1, Math.round((o.w || 1) * k)); } return r; }); };
    pk.spec.w.forEach(function (w) {
      if (w.aod || !w.g) return;
      var g = w.g;
      if (w.k === 'time') {
        var f = police(g.fam, g.px, w.h, '0123456789:', 0, 0), fx = fxGarmin(g.fx, g.c, g.px * k, cfg.c1);
        var xs = [w.x + w.cw / 2, w.x + w.cw * 1.5, w.x + 2 * w.cw + w.dpw / 2, w.x + 2 * w.cw + w.dpw + w.cw / 2, w.x + 3 * w.cw + w.dpw + w.cw / 2].map(R);
        var o = { k: 'h', xs: xs, y: R(w.y), f: f, c: fx.c, cdp: mip(g.cdp), fx: fx.fx, c2: fx.c2, c3: fx.c3, n: fx.n };
        if (w.sec) { o.sxs = [R(w.sec.x + w.sec.cw / 2), R(w.sec.x + w.sec.cw * 1.5)]; o.sy = R(w.sec.y); o.sf = police(g.fam, w.sec.g.px, w.sec.h, '0123456789', 0, 0); o.sc = mip(w.sec.g.c); }
        ops.push(o);
      } else if (w.k === 'num') {
        var fx2 = fxGarmin(g.fx, g.c, g.px * k, cfg.c1);
        var o2 = { k: 'n', t: w.type, x: R(w.x), y: R(w.y), w: R(w.w), al: w.align === 'gauche' ? 0 : w.align === 'droite' ? 2 : 1, f: police(g.fam, g.px, g.h, '0123456789-.:°', g.cw, 0),
          c: fx2.c, fx: fx2.fx, c2: fx2.c2, c3: fx2.c3, n: fx2.n, u: w.unite === 'pct' ? '%' : w.unite === 'deg' ? '°' : '', fu: -1, cu: mip(g.cu) };
        if (w.unite === 'pct') o2.fu = police(g.fam, Math.round(g.px * .7), g.h, '%', 0, 0);
        ops.push(o2);
      } else if (w.k === 'level') {
        if (g.kind === 'meteo') {
          var cle = w.w + g.c + g.mode;
          if (Ik[cle] == null) { Ik[cle] = GENRES.map(function (ge) { I.push(meteoIcone(ge, R(w.w), g.c, g.c2, g.mode)); return I.length - 1; }); }
          ops.push({ k: 'm', x: R(w.x), y: R(w.y), ic: Ik[cle] });
        } else if (g.kind === 'barre') ops.push({ k: 'b', t: w.type, x: R(w.x), y: R(w.y), w: R(w.w), h: Math.max(2, R(w.h)), c: mip(g.c) });
        else if (g.kind === 'aiguille') ops.push({ k: 'a', t: w.type, cx: R(w.x + w.w / 2), cy: R(w.y + w.h / 2), r: R(g.r - 4), pw: Math.max(2, R(g.pw)), c: mip(g.c), s: 225, span: 270 });
        else if (g.kind === 'arc') ops.push({ k: 'a', t: w.type, cx: R(w.x + w.w / 2), cy: R(w.y + w.h / 2), r: R(g.r), pw: Math.max(2, R(g.pw)), c: mip(g.c), s: 225, span: 270 });
        else if (g.kind === 'anneau') ops.push({ k: 'a', t: w.type, cx: S / 2, cy: S / 2, r: R(g.r), pw: Math.max(3, R(g.pw)), c: mip(g.c), cb: mip(mix(g.c, cfg.c1, .8)), s: 90, span: 360 });
      } else if (w.k === 'date') {
        var parts = g.parts.map(function (q) {
          var fx3 = fxGarmin(g.fx, q.c, q.px * k, cfg.c1);
          return { x: R(q.x), w: R(q.w), al: q.al === 'left' ? 0 : q.al === 'right' ? 2 : 1, t: q.t, f: police(g.fam || PETITE.fam, q.px, w.h, lettres(q.l), 0, q.esp), c: fx3.c, fx: fx3.fx, c2: fx3.c2, c3: fx3.c3, n: fx3.n, l: q.l };
        });
        var yy = w.jour ? w.jour.y : w.sem ? w.sem.y : w.mois.y;
        ops.push({ k: 'd', y: R(yy), parts: parts });
      } else if (w.k === 'pointer') {
        var m = mainsGarmin(cfg, g.b, g.cs);
        ops.push({ k: 'p', cx: R(w.cx), cy: R(w.cy), h: scEl(m.h), m: scEl(m.m), s: m.s ? scEl(m.s) : null, cap: scEl(m.cap) });
      }
    });
    var ana = cfg.blocs.some(function (b) { return b.t === 'aiguilles' && Math.abs(b.x - CX) < 30 && Math.abs(b.y - CY) < 30; });
    var fc = toile(S, S), gf = fc.getContext('2d');   // fond opaque (noir autour du cercle)
    gf.fillStyle = '#000'; gf.fillRect(0, 0, S, S); gf.drawImage(fond(cfg, false, ana, k), 0, 0);
    if (cfg.calques.indexOf('verre') >= 0 || cfg.calques.indexOf('lunette') >= 0) gf.drawImage(dessus(cfg, k), 0, 0);
    return { S: S, fond: fc, ops: ops, polices: F, icones: I, meteo: GARMIN_METEO };
  }
  /* police Garmin (format BMFont) : planche PNG blanche + description texte ; chiffres à chasse fixe si mono */
  function policeGarmin(p) {
    var fam = p.fam, ch = p.chars.split(''), base = Math.round(p.h / 2 + p.px * .36);
    var larg = ch.map(function (c) { return Math.max(1, Math.ceil(mesure(fam, p.px, c))); });
    var maxW = 1024, x = 0, y = 0, pos = [];
    ch.forEach(function (c, i) { var cw = Math.max(larg[i], p.mono || 0) + 2; if (x + cw > maxW) { x = 0; y += p.h + 1; } pos.push([x, y, cw]); x += cw; });
    var Wt = 1; while (Wt < Math.min(maxW, Math.max.apply(null, pos.map(function (q) { return q[0] + q[2]; })))) Wt *= 2;
    var Ht = 1; while (Ht < y + p.h) Ht *= 2;
    var cv = toile(Wt, Ht), g = cv.getContext('2d'); g.font = tl(fam, p.px) + 'px "' + fam + '"'; g.fillStyle = '#ffffff'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    var l = ['info face="' + fam + '" size=' + p.px + ' bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0',
      'common lineHeight=' + p.h + ' base=' + base + ' scaleW=' + Wt + ' scaleH=' + Ht + ' pages=1 packed=0', 'page id=0 file="FICHIER"', 'chars count=' + ch.length];
    ch.forEach(function (c, i) {
      var q = pos[i]; g.fillText(c, q[0] + q[2] / 2, q[1] + base);
      var adv = (p.mono && /[0-9]/.test(c) ? p.mono : larg[i] + 1) + (p.esp || 0);
      l.push('char id=' + c.charCodeAt(0) + ' x=' + q[0] + ' y=' + q[1] + ' width=' + q[2] + ' height=' + p.h + ' xoffset=' + Math.round((adv - (p.esp || 0) - q[2]) / 2) + ' yoffset=0 xadvance=' + adv + ' page=0 chnl=15');
    });
    return { png: cv, fnt: l.join('\n') + '\n' };
  }
  /* aperçu Garmin : rendu à la taille de l'écran puis ramené aux 64 couleurs de l'écran MIP */
  function apercuGarmin(cv, c, S, opt) {
    var big = toile(W, W); apercu(big, c, opt ? { aod: opt.aod, date: opt.date, valeurs: opt.valeurs } : {});
    var t = toile(S, S), g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(big, 0, 0, S, S);
    var d = g.getImageData(0, 0, S, S), a = d.data;
    var B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];   // tramage ordonné (comme l'écran, qui tramera le fond)
    for (var i = 0, px = 0; i < a.length; i += 4, px++) {
      var tr = (B[(px % S) % 4 + ((Math.floor(px / S)) % 4) * 4] / 16 - .47) * 85;
      for (var j = 0; j < 3; j++) a[i + j] = Math.max(0, Math.min(255, Math.round((a[i + j] + tr) / 85) * 85));
    }
    g.putImageData(d, 0, 0);
    var o = cv.getContext('2d'); o.save(); o.clearRect(0, 0, cv.width, cv.height); o.imageSmoothingEnabled = false;
    o.beginPath(); o.arc(cv.width / 2, cv.height / 2, cv.width / 2, 0, 7); o.clip(); o.drawImage(t, 0, 0, cv.width, cv.height); o.restore();
    if (opt && opt.sel != null) { var cfg = norm(c), b0 = cfg.blocs[opt.sel]; if (b0) { var bx = boite(b0, cfg), s = cv.width / W; o.strokeStyle = '#fff'; o.setLineDash([6, 4]); o.lineWidth = 2; o.strokeRect((bx.x - 3) * s, (bx.y - 3) * s, (bx.w + 6) * s, (bx.h + 6) * s); o.setLineDash([]); } }
  }
  var MONTRES = { trex3: { n: 'Amazfit T-Rex 3', S: 480 }, fenix6xpro: { n: 'Garmin Fenix 6X Pro', S: 280 }, fenix6s: { n: 'Garmin Fenix 6S', S: 240 } };

  var CADRAN = root.CADRAN = { MONTRES: MONTRES, garmin: garmin, policeGarmin: policeGarmin, apercuGarmin: apercuGarmin, mip: mip, W: W, DEFAUT: DEFAUT, CHOIX: CHOIX, INFOS: INFOS, METEO: METEO, MODELES: MODELES, norm: norm, normBloc: normBloc, paquet: paquet, apercu: apercu, polices: polices,
    boite: boite, modele: modele, chargerPhoto: chargerPhoto, meteoIcone: meteoIcone, geo: function (b, c) { return geo(normBloc(b), norm(c)); }, blocsDe: blocsDe, JOURS: JOURS, MOIS: MOIS, onphoto: null };
})(typeof window !== 'undefined' ? window : globalThis);
