/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-presentation/pres-shapes.js : ne pas modifier ici. */
/* Présentation — géométrie des formes (noms OOXML pour l'échange .pptx).
   Pres.SHAPES : catalogue [{id, name, cat}] ; Pres.shapeParts(id, w, h, adj) → [{d, fill:'normal'|'darken'|'lighten'|'none', stroke:true|false}]
   adj : réglages de la forme (0…1), poignées jaunes : Pres.shapeHandles(id, w, h, adj) → [{x, y, set(px, py) → adj}] */
(function () {
  'use strict';
  const P = window.Pres = window.Pres || {};
  const C = (id, name, cat) => ({ id, name, cat });
  P.SHAPE_CATS = [['lines', 'Lignes'], ['rect', 'Rectangles'], ['basic', 'Formes de base'], ['arrows', 'Flèches pleines'], ['flow', 'Organigramme'], ['stars', 'Étoiles et bannières'], ['callouts', 'Bulles et légendes'], ['math', 'Équation']];
  P.SHAPES = [
    C('line', 'Ligne', 'lines'), C('lineArrow', 'Flèche', 'lines'), C('lineDouble', 'Double flèche', 'lines'), C('elbow', 'Connecteur en angle', 'lines'), C('elbowArrow', 'Connecteur en angle fléché', 'lines'), C('curve', 'Connecteur courbe', 'lines'), C('curveArrow', 'Connecteur courbe fléché', 'lines'), C('freeform', 'Forme libre (dessin)', 'lines'),
    C('rect', 'Rectangle', 'rect'), C('roundRect', 'Rectangle à coins arrondis', 'rect'), C('snip1Rect', 'Rectangle à coin rogné', 'rect'), C('snip2SameRect', 'Rectangle à coins rognés', 'rect'), C('round1Rect', 'Rectangle à coin arrondi', 'rect'), C('round2SameRect', 'Rectangle à coins arrondis du même côté', 'rect'),
    C('ellipse', 'Ellipse', 'basic'), C('triangle', 'Triangle isocèle', 'basic'), C('rtTriangle', 'Triangle rectangle', 'basic'), C('parallelogram', 'Parallélogramme', 'basic'), C('trapezoid', 'Trapèze', 'basic'), C('diamond', 'Losange', 'basic'), C('pentagon', 'Pentagone', 'basic'), C('hexagon', 'Hexagone', 'basic'), C('heptagon', 'Heptagone', 'basic'), C('octagon', 'Octogone', 'basic'), C('decagon', 'Décagone', 'basic'), C('dodecagon', 'Dodécagone', 'basic'), C('pie', 'Secteur', 'basic'), C('chord', 'Corde', 'basic'), C('teardrop', 'Larme', 'basic'), C('frame', 'Cadre', 'basic'), C('halfFrame', 'Demi-cadre', 'basic'), C('corner', 'Forme en L', 'basic'), C('plus', 'Croix', 'basic'), C('donut', 'Anneau', 'basic'), C('noSmoking', 'Interdiction', 'basic'), C('blockArc', 'Arc plein', 'basic'), C('can', 'Cylindre', 'basic'), C('cube', 'Cube', 'basic'), C('bevel', 'Biseau', 'basic'), C('foldedCorner', 'Coin plié', 'basic'), C('smileyFace', 'Visage souriant', 'basic'), C('heart', 'Cœur', 'basic'), C('lightningBolt', 'Éclair', 'basic'), C('sun', 'Soleil', 'basic'), C('moon', 'Lune', 'basic'), C('cloud', 'Nuage', 'basic'), C('arc', 'Arc', 'basic'),
    C('rightArrow', 'Flèche droite', 'arrows'), C('leftArrow', 'Flèche gauche', 'arrows'), C('upArrow', 'Flèche haut', 'arrows'), C('downArrow', 'Flèche bas', 'arrows'), C('leftRightArrow', 'Flèche gauche-droite', 'arrows'), C('upDownArrow', 'Flèche haut-bas', 'arrows'), C('quadArrow', 'Flèche à quatre pointes', 'arrows'), C('notchedRightArrow', 'Flèche à encoche', 'arrows'), C('stripedRightArrow', 'Flèche rayée', 'arrows'), C('chevron', 'Chevron', 'arrows'), C('homePlate', 'Pentagone (flèche)', 'arrows'), C('uturnArrow', 'Flèche en U', 'arrows'), C('circularArrow', 'Flèche circulaire', 'arrows'),
    C('flowChartProcess', 'Processus', 'flow'), C('flowChartAlternateProcess', 'Autre processus', 'flow'), C('flowChartDecision', 'Décision', 'flow'), C('flowChartInputOutput', 'Données', 'flow'), C('flowChartPredefinedProcess', 'Processus prédéfini', 'flow'), C('flowChartDocument', 'Document', 'flow'), C('flowChartTerminator', 'Terminaison', 'flow'), C('flowChartManualInput', 'Saisie manuelle', 'flow'), C('flowChartConnector', 'Connecteur', 'flow'), C('flowChartMagneticDisk', 'Disque magnétique', 'flow'), C('flowChartPreparation', 'Préparation', 'flow'), C('flowChartMerge', 'Fusion', 'flow'),
    C('star4', 'Étoile à 4 branches', 'stars'), C('star5', 'Étoile à 5 branches', 'stars'), C('star6', 'Étoile à 6 branches', 'stars'), C('star8', 'Étoile à 8 branches', 'stars'), C('star10', 'Étoile à 10 branches', 'stars'), C('star12', 'Étoile à 12 branches', 'stars'), C('star16', 'Étoile à 16 branches', 'stars'), C('star24', 'Étoile à 24 branches', 'stars'), C('irregularSeal1', 'Explosion 1', 'stars'), C('irregularSeal2', 'Explosion 2', 'stars'), C('ribbon2', 'Bannière', 'stars'), C('wave', 'Vague', 'stars'),
    C('wedgeRectCallout', 'Bulle rectangulaire', 'callouts'), C('wedgeRoundRectCallout', 'Bulle arrondie', 'callouts'), C('wedgeEllipseCallout', 'Bulle ovale', 'callouts'), C('cloudCallout', 'Bulle de pensée', 'callouts'),
    C('mathPlus', 'Plus', 'math'), C('mathMinus', 'Moins', 'math'), C('mathMultiply', 'Multiplier', 'math'), C('mathDivide', 'Diviser', 'math'), C('mathEqual', 'Égal', 'math'), C('mathNotEqual', 'Différent', 'math')
  ];
  P.isLineShape = (id) => /^(line|lineArrow|lineDouble|elbow|elbowArrow|curve|curveArrow)$/.test(id);
  P.DEFAULT_ADJ = { roundRect: { r: 0.16 }, snip1Rect: { r: 0.16 }, snip2SameRect: { r: 0.16 }, round1Rect: { r: 0.16 }, round2SameRect: { r: 0.16 }, triangle: { a: 0.5 }, parallelogram: { a: 0.25 }, trapezoid: { a: 0.25 }, star4: { a: 0.25 }, star5: { a: 0.382 }, star6: { a: 0.5 }, star8: { a: 0.75 }, star10: { a: 0.8 }, star12: { a: 0.75 }, star16: { a: 0.8 }, star24: { a: 0.8 }, rightArrow: { a: 0.5, b: 0.5 }, leftArrow: { a: 0.5, b: 0.5 }, upArrow: { a: 0.5, b: 0.5 }, downArrow: { a: 0.5, b: 0.5 }, leftRightArrow: { a: 0.5, b: 0.5 }, upDownArrow: { a: 0.5, b: 0.5 }, notchedRightArrow: { a: 0.5, b: 0.5 }, stripedRightArrow: { a: 0.5, b: 0.5 }, chevron: { a: 0.5 }, homePlate: { a: 0.5 }, wedgeRectCallout: { x: -0.21, y: 0.62 }, wedgeRoundRectCallout: { x: -0.21, y: 0.62 }, wedgeEllipseCallout: { x: -0.21, y: 0.62 }, cloudCallout: { x: -0.21, y: 0.62 }, pie: { s: 0, e: 0.75 }, chord: { s: 0.125, e: 0.625 }, blockArc: { s: 0.5, e: 0, t: 0.25 }, arc: { s: 0.75, e: 0 }, donut: { t: 0.25 }, frame: { t: 0.12 }, plus: { t: 0.25 }, can: { t: 0.25 }, flowChartMagneticDisk: { t: 0.25 }, cube: { t: 0.25 }, bevel: { t: 0.125 }, foldedCorner: { t: 0.16 }, octagon: { a: 0.29 }, halfFrame: { t: 0.33 }, corner: { t: 0.5 }, teardrop: { a: 1 }, moon: { a: 0.5 } };
  const f = (n) => Math.round(n * 100) / 100;
  const pts = (l) => 'M' + l.map((p) => f(p[0]) + ',' + f(p[1])).join(' L') + ' Z';
  function ell(cx, cy, rx, ry) { return 'M' + f(cx - rx) + ',' + f(cy) + ' A' + f(rx) + ',' + f(ry) + ' 0 1,0 ' + f(cx + rx) + ',' + f(cy) + ' A' + f(rx) + ',' + f(ry) + ' 0 1,0 ' + f(cx - rx) + ',' + f(cy) + ' Z'; }
  function poly(n, w, h, rot) { const l = []; for (let i = 0; i < n; i++) { const a = (rot == null ? -Math.PI / 2 : rot) + i * 2 * Math.PI / n; l.push([w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2]); } return pts(l); }
  function star(n, w, h, k) { const l = []; for (let i = 0; i < 2 * n; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? k : 1; l.push([w / 2 + Math.cos(a) * w / 2 * r, h / 2 + Math.sin(a) * h / 2 * r]); } return pts(l); }
  function rr(x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); return 'M' + f(x + r) + ',' + f(y) + ' H' + f(x + w - r) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(x + w) + ',' + f(y + r) + ' V' + f(y + h - r) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(x + w - r) + ',' + f(y + h) + ' H' + f(x + r) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(x) + ',' + f(y + h - r) + ' V' + f(y + r) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(x + r) + ',' + f(y) + ' Z'; }
  function arcPt(cx, cy, rx, ry, t) { const a = t * 2 * Math.PI; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; }
  /** Bulles : contour avec une pointe vers (tx, ty) */
  function callout(base, w, h, adj) {
    const tx = w / 2 + adj.x * w, ty = h / 2 + adj.y * h;
    const inside = tx >= 0 && tx <= w && ty >= 0 && ty <= h;
    if (base === 'ellipse') {
      if (inside) return ell(w / 2, h / 2, w / 2, h / 2);
      const ang = Math.atan2((ty - h / 2) / h, (tx - w / 2) / w), d = 0.2;
      const p1 = [w / 2 + Math.cos(ang - d) * w / 2, h / 2 + Math.sin(ang - d) * h / 2], p2 = [w / 2 + Math.cos(ang + d) * w / 2, h / 2 + Math.sin(ang + d) * h / 2];
      return 'M' + f(p2[0]) + ',' + f(p2[1]) + ' A' + f(w / 2) + ',' + f(h / 2) + ' 0 1,1 ' + f(p1[0]) + ',' + f(p1[1]) + ' L' + f(tx) + ',' + f(ty) + ' Z';
    }
    const r = base === 'round' ? Math.min(w, h) * 0.16 : 0;
    if (inside) return r ? rr(0, 0, w, h, r) : pts([[0, 0], [w, 0], [w, h], [0, h]]);
    // côté de la pointe
    const dx = (tx - w / 2) / w, dy = (ty - h / 2) / h;
    let side = Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 'b' : 't') : (dx > 0 ? 'r' : 'l');
    const a1 = 0.2, a2 = 0.35; // largeur de la base de la pointe (fractions du côté)
    const bx = (k) => O(dx < 0 ? k : 1 - k), O = (v) => v;
    void bx;
    let l;
    if (side === 'b') { const s = dx < 0 ? [w * a1, w * a2] : [w * (1 - a2), w * (1 - a1)]; l = [[0, 0], [w, 0], [w, h], [s[1], h], [tx, ty], [s[0], h], [0, h]]; }
    else if (side === 't') { const s = dx < 0 ? [w * a1, w * a2] : [w * (1 - a2), w * (1 - a1)]; l = [[0, 0], [s[0], 0], [tx, ty], [s[1], 0], [w, 0], [w, h], [0, h]]; }
    else if (side === 'r') { const s = dy < 0 ? [h * a1, h * a2] : [h * (1 - a2), h * (1 - a1)]; l = [[0, 0], [w, 0], [w, s[0]], [tx, ty], [w, s[1]], [w, h], [0, h]]; }
    else { const s = dy < 0 ? [h * a1, h * a2] : [h * (1 - a2), h * (1 - a1)]; l = [[0, 0], [w, 0], [w, h], [0, h], [0, s[1]], [tx, ty], [0, s[0]]]; }
    if (!r) return pts(l);
    // coins arrondis : approximation (coins du rectangle arrondis, pointe droite)
    let d = '';
    const corner = (p) => (p[0] === 0 || p[0] === w) && (p[1] === 0 || p[1] === h);
    const n = l.length;
    for (let i = 0; i < n; i++) {
      const p = l[i], prev = l[(i - 1 + n) % n], next = l[(i + 1) % n];
      if (corner(p)) {
        const v1 = [prev[0] - p[0], prev[1] - p[1]], v2 = [next[0] - p[0], next[1] - p[1]];
        const n1 = Math.hypot(v1[0], v1[1]) || 1, n2 = Math.hypot(v2[0], v2[1]) || 1;
        const q1 = [p[0] + v1[0] / n1 * r, p[1] + v1[1] / n1 * r], q2 = [p[0] + v2[0] / n2 * r, p[1] + v2[1] / n2 * r];
        d += (d ? ' L' : 'M') + f(q1[0]) + ',' + f(q1[1]) + ' Q' + f(p[0]) + ',' + f(p[1]) + ' ' + f(q2[0]) + ',' + f(q2[1]);
      } else d += (d ? ' L' : 'M') + f(p[0]) + ',' + f(p[1]);
    }
    return d + ' Z';
  }
  function cloudPath(w, h) {
    // nuage : 9 bosses autour d'une ellipse
    const cx = w / 2, cy = h / 2, n = 9; let d = '';
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n, a0 = a - Math.PI / n;
      const p = [cx + Math.cos(a) * w * 0.4, cy + Math.sin(a) * h * 0.38];
      if (i === 0) { d = 'M' + f(p[0]) + ',' + f(p[1]); continue; }
      const c = [cx + Math.cos(a0) * w * 0.62, cy + Math.sin(a0) * h * 0.6];
      d += ' Q' + f(c[0]) + ',' + f(c[1]) + ' ' + f(p[0]) + ',' + f(p[1]);
    }
    return d + ' Z';
  }
  P.shapeParts = function (id, w, h, adj) {
    adj = Object.assign({}, P.DEFAULT_ADJ[id] || {}, adj || {});
    w = Math.max(w, 0.01); h = Math.max(h, 0.01);
    const ss = Math.min(w, h);
    const one = (d) => [{ d, fill: 'normal', stroke: true }];
    switch (id) {
      case 'rect': case 'flowChartProcess': return one(pts([[0, 0], [w, 0], [w, h], [0, h]]));
      case 'roundRect': return one(rr(0, 0, w, h, adj.r * ss));
      case 'flowChartAlternateProcess': return one(rr(0, 0, w, h, 0.16 * ss));
      case 'flowChartTerminator': return one(rr(0, 0, w, h, h / 2));
      case 'snip1Rect': { const r = adj.r * ss; return one(pts([[0, 0], [w - r, 0], [w, r], [w, h], [0, h]])); }
      case 'snip2SameRect': { const r = adj.r * ss; return one(pts([[r, 0], [w - r, 0], [w, r], [w, h], [0, h], [0, r]])); }
      case 'round1Rect': { const r = adj.r * ss; return one('M0,0 H' + f(w - r) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(w) + ',' + f(r) + ' V' + f(h) + ' H0 Z'); }
      case 'round2SameRect': { const r = adj.r * ss; return one('M' + f(r) + ',0 H' + f(w - r) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(w) + ',' + f(r) + ' V' + f(h) + ' H0 V' + f(r) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(r) + ',0 Z'); }
      case 'ellipse': case 'flowChartConnector': return one(ell(w / 2, h / 2, w / 2, h / 2));
      case 'triangle': return one(pts([[w * adj.a, 0], [w, h], [0, h]]));
      case 'rtTriangle': return one(pts([[0, 0], [w, h], [0, h]]));
      case 'parallelogram': case 'flowChartInputOutput': { const a = id === 'parallelogram' ? adj.a * ss : w * 0.2; return one(pts([[a, 0], [w, 0], [w - a, h], [0, h]])); }
      case 'trapezoid': { const a = adj.a * ss; return one(pts([[a, 0], [w - a, 0], [w, h], [0, h]])); }
      case 'diamond': case 'flowChartDecision': return one(pts([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]));
      case 'pentagon': return one(poly(5, w, h));
      case 'hexagon': return one(pts([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]));
      case 'flowChartPreparation': return one(pts([[w * 0.2, 0], [w * 0.8, 0], [w, h / 2], [w * 0.8, h], [w * 0.2, h], [0, h / 2]]));
      case 'heptagon': return one(poly(7, w, h));
      case 'octagon': { const a = adj.a * ss; return one(pts([[a, 0], [w - a, 0], [w, a], [w, h - a], [w - a, h], [a, h], [0, h - a], [0, a]])); }
      case 'decagon': return one(poly(10, w, h, 0));
      case 'dodecagon': return one(poly(12, w, h, Math.PI / 12));
      case 'pie': { const p1 = arcPt(w / 2, h / 2, w / 2, h / 2, adj.s), p2 = arcPt(w / 2, h / 2, w / 2, h / 2, adj.e); const span = ((adj.e - adj.s) % 1 + 1) % 1; return one('M' + f(w / 2) + ',' + f(h / 2) + ' L' + f(p1[0]) + ',' + f(p1[1]) + ' A' + f(w / 2) + ',' + f(h / 2) + ' 0 ' + (span > 0.5 ? 1 : 0) + ',1 ' + f(p2[0]) + ',' + f(p2[1]) + ' Z'); }
      case 'chord': { const p1 = arcPt(w / 2, h / 2, w / 2, h / 2, adj.s), p2 = arcPt(w / 2, h / 2, w / 2, h / 2, adj.e); const span = ((adj.e - adj.s) % 1 + 1) % 1; return one('M' + f(p1[0]) + ',' + f(p1[1]) + ' A' + f(w / 2) + ',' + f(h / 2) + ' 0 ' + (span > 0.5 ? 1 : 0) + ',1 ' + f(p2[0]) + ',' + f(p2[1]) + ' Z'); }
      case 'arc': { const p1 = arcPt(w / 2, h / 2, w / 2, h / 2, adj.s), p2 = arcPt(w / 2, h / 2, w / 2, h / 2, adj.e); const span = ((adj.e - adj.s) % 1 + 1) % 1; return [{ d: 'M' + f(p1[0]) + ',' + f(p1[1]) + ' A' + f(w / 2) + ',' + f(h / 2) + ' 0 ' + (span > 0.5 ? 1 : 0) + ',1 ' + f(p2[0]) + ',' + f(p2[1]), fill: 'none', stroke: true }]; }
      case 'blockArc': { const t = adj.t * ss / 2, rx = w / 2, ry = h / 2, ix = Math.max(0.1, rx - t), iy = Math.max(0.1, ry - t); const o1 = arcPt(w / 2, h / 2, rx, ry, adj.s), o2 = arcPt(w / 2, h / 2, rx, ry, adj.e), i1 = arcPt(w / 2, h / 2, ix, iy, adj.e), i2 = arcPt(w / 2, h / 2, ix, iy, adj.s); const span = ((adj.e - adj.s) % 1 + 1) % 1, big = span > 0.5 ? 1 : 0; return one('M' + f(o1[0]) + ',' + f(o1[1]) + ' A' + f(rx) + ',' + f(ry) + ' 0 ' + big + ',1 ' + f(o2[0]) + ',' + f(o2[1]) + ' L' + f(i1[0]) + ',' + f(i1[1]) + ' A' + f(ix) + ',' + f(iy) + ' 0 ' + big + ',0 ' + f(i2[0]) + ',' + f(i2[1]) + ' Z'); }
      case 'teardrop': return one('M0,' + f(h / 2) + ' A' + f(w / 2) + ',' + f(h / 2) + ' 0 0,1 ' + f(w / 2) + ',0 H' + f(w) + ' V' + f(h / 2) + ' A' + f(w / 2) + ',' + f(h / 2) + ' 0 0,1 ' + f(w / 2) + ',' + f(h) + ' A' + f(w / 2) + ',' + f(h / 2) + ' 0 0,1 0,' + f(h / 2) + ' Z');
      case 'frame': { const t = adj.t * ss; return one(pts([[0, 0], [w, 0], [w, h], [0, h]]) + ' ' + pts([[t, t], [t, h - t], [w - t, h - t], [w - t, t]])); }
      case 'halfFrame': { const t = adj.t * ss / 2; return one(pts([[0, 0], [w, 0], [w - t * w / h, t], [t, t], [t, h - t * h / w], [0, h]])); }
      case 'corner': { const t = adj.t * ss; return one(pts([[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]])); }
      case 'plus': { const t = adj.t * ss; return one(pts([[t, 0], [w - t, 0], [w - t, t], [w, t], [w, h - t], [w - t, h - t], [w - t, h], [t, h], [t, h - t], [0, h - t], [0, t], [t, t]])); }
      case 'donut': { const t = adj.t * ss; return one(ell(w / 2, h / 2, w / 2, h / 2) + ' ' + ell(w / 2, h / 2, Math.max(0.1, w / 2 - t), Math.max(0.1, h / 2 - t))); }
      case 'noSmoking': { const t = 0.18 * ss, rx = w / 2 - t, ry = h / 2 - t; const a = Math.PI / 4, k = 0.17; const bar = pts([[w / 2 + Math.cos(-a - Math.PI + k) * rx, h / 2 + Math.sin(-a - Math.PI + k) * ry], [w / 2 + Math.cos(-a - k) * rx, h / 2 + Math.sin(-a - k) * ry], [w / 2 + Math.cos(-a + Math.PI + 0 - k + Math.PI) * 0 + Math.cos(Math.PI * 0.75 - k + Math.PI) * rx, h / 2 + Math.sin(Math.PI * 0.75 - k + Math.PI) * ry]]); void bar; return one(ell(w / 2, h / 2, w / 2, h / 2) + ' ' + ell(w / 2, h / 2, rx, ry) + ' ' + pts([[w / 2 + Math.cos(-0.785 - 0.25) * rx, h / 2 + Math.sin(-0.785 - 0.25) * ry], [w / 2 + Math.cos(-0.785 + 0.25) * rx, h / 2 + Math.sin(-0.785 + 0.25) * ry], [w / 2 + Math.cos(2.356 - 0.25) * rx, h / 2 + Math.sin(2.356 - 0.25) * ry], [w / 2 + Math.cos(2.356 + 0.25) * rx, h / 2 + Math.sin(2.356 + 0.25) * ry]])); }
      case 'can': case 'flowChartMagneticDisk': { const t = adj.t * ss / 2; return [{ d: 'M0,' + f(t) + ' A' + f(w / 2) + ',' + f(t) + ' 0 0,1 ' + f(w) + ',' + f(t) + ' V' + f(h - t) + ' A' + f(w / 2) + ',' + f(t) + ' 0 0,1 0,' + f(h - t) + ' Z', fill: 'normal', stroke: true }, { d: ell(w / 2, t, w / 2, t), fill: 'lighten', stroke: true }]; }
      case 'cube': { const t = adj.t * ss; return [{ d: pts([[0, t], [w - t, t], [w - t, h], [0, h]]), fill: 'normal', stroke: true }, { d: pts([[0, t], [t, 0], [w, 0], [w - t, t]]), fill: 'lighten', stroke: true }, { d: pts([[w - t, t], [w, 0], [w, h - t], [w - t, h]]), fill: 'darken', stroke: true }]; }
      case 'bevel': { const t = adj.t * ss; return [{ d: pts([[t, t], [w - t, t], [w - t, h - t], [t, h - t]]), fill: 'normal', stroke: true }, { d: pts([[0, 0], [w, 0], [w - t, t], [t, t]]), fill: 'lighten', stroke: true }, { d: pts([[w, 0], [w, h], [w - t, h - t], [w - t, t]]), fill: 'darken', stroke: true }, { d: pts([[0, h], [t, h - t], [w - t, h - t], [w, h]]), fill: 'darken', stroke: true }, { d: pts([[0, 0], [t, t], [t, h - t], [0, h]]), fill: 'lighten', stroke: true }]; }
      case 'foldedCorner': { const t = adj.t * ss; return [{ d: pts([[0, 0], [w, 0], [w, h - t], [w - t, h], [0, h]]), fill: 'normal', stroke: true }, { d: pts([[w - t, h], [w - t * 0.8, h - t * 0.8], [w, h - t]]), fill: 'darken', stroke: true }]; }
      case 'smileyFace': return [{ d: ell(w / 2, h / 2, w / 2, h / 2), fill: 'normal', stroke: true }, { d: ell(w * 0.35, h * 0.38, w * 0.06, h * 0.06) + ' ' + ell(w * 0.65, h * 0.38, w * 0.06, h * 0.06), fill: 'darken', stroke: true }, { d: 'M' + f(w * 0.28) + ',' + f(h * 0.64) + ' Q' + f(w / 2) + ',' + f(h * 0.84) + ' ' + f(w * 0.72) + ',' + f(h * 0.64), fill: 'none', stroke: true }];
      case 'heart': return one('M' + f(w / 2) + ',' + f(h * 0.25) + ' C' + f(w * 0.5) + ',' + f(-h * 0.05) + ' ' + f(-w * 0.05) + ',' + f(h * 0.05) + ' ' + f(w * 0.05) + ',' + f(h * 0.4) + ' C' + f(w * 0.12) + ',' + f(h * 0.62) + ' ' + f(w * 0.4) + ',' + f(h * 0.8) + ' ' + f(w / 2) + ',' + f(h) + ' C' + f(w * 0.6) + ',' + f(h * 0.8) + ' ' + f(w * 0.88) + ',' + f(h * 0.62) + ' ' + f(w * 0.95) + ',' + f(h * 0.4) + ' C' + f(w * 1.05) + ',' + f(h * 0.05) + ' ' + f(w * 0.5) + ',' + f(-h * 0.05) + ' ' + f(w / 2) + ',' + f(h * 0.25) + ' Z');
      case 'lightningBolt': return one(pts([[0.39, 0], [0.62, 0.32], [0.53, 0.35], [0.79, 0.6], [0.7, 0.64], [1, 1], [0.44, 0.69], [0.55, 0.65], [0.24, 0.45], [0.36, 0.4], [0, 0.18]].map((p) => [p[0] * w, p[1] * h])));
      case 'sun': { let d = ell(w / 2, h / 2, w * 0.25, h * 0.25); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, b = 0.12; d += ' ' + pts([[w / 2 + Math.cos(a - b) * w * 0.33, h / 2 + Math.sin(a - b) * h * 0.33], [w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2], [w / 2 + Math.cos(a + b) * w * 0.33, h / 2 + Math.sin(a + b) * h * 0.33]]); } return one(d); }
      case 'moon': { const k = adj.a; return one('M' + f(w) + ',0 A' + f(w) + ',' + f(h / 2) + ' 0 0,0 ' + f(w) + ',' + f(h) + ' A' + f(w * k) + ',' + f(h / 2) + ' 0 0,1 ' + f(w) + ',0 Z'); }
      case 'cloud': return one(cloudPath(w, h));
      case 'cloudCallout': { const tx = w / 2 + adj.x * w, ty = h / 2 + adj.y * h; const cx = w / 2, cy = h / 2; let d = cloudPath(w, h); [0.62, 0.78, 0.92].forEach((k, i) => { const r = ss * (0.07 - i * 0.02); d += ' ' + ell(cx + (tx - cx) * k, cy + (ty - cy) * k, r, r); }); return one(d); }
      case 'wedgeRectCallout': return one(callout('rect', w, h, adj));
      case 'wedgeRoundRectCallout': return one(callout('round', w, h, adj));
      case 'wedgeEllipseCallout': return one(callout('ellipse', w, h, adj));
      case 'rightArrow': case 'leftArrow': case 'upArrow': case 'downArrow': {
        const vert = id === 'upArrow' || id === 'downArrow';
        const L = vert ? h : w, T = vert ? w : h; const a = adj.a * T, hl = Math.min(L, adj.b * Math.min(L, T));
        let l = [[0, (T - a) / 2], [L - hl, (T - a) / 2], [L - hl, 0], [L, T / 2], [L - hl, T], [L - hl, (T + a) / 2], [0, (T + a) / 2]];
        if (id === 'leftArrow') l = l.map((p) => [L - p[0], p[1]]);
        if (id === 'downArrow') l = l.map((p) => [p[1], p[0]]);
        if (id === 'upArrow') l = l.map((p) => [p[1], L - p[0]]);
        return one(pts(l));
      }
      case 'leftRightArrow': case 'upDownArrow': {
        const vert = id === 'upDownArrow', L = vert ? h : w, T = vert ? w : h, a = adj.a * T, hl = Math.min(L / 2, adj.b * Math.min(L, T));
        let l = [[0, T / 2], [hl, 0], [hl, (T - a) / 2], [L - hl, (T - a) / 2], [L - hl, 0], [L, T / 2], [L - hl, T], [L - hl, (T + a) / 2], [hl, (T + a) / 2], [hl, T]];
        if (vert) l = l.map((p) => [p[1], p[0]]);
        return one(pts(l));
      }
      case 'quadArrow': { const a = ss * 0.12, hl = ss * 0.2, hw = ss * 0.22, cx = w / 2, cy = h / 2; return one(pts([[cx, 0], [cx + hw, hl], [cx + a, hl], [cx + a, cy - a], [w - hl, cy - a], [w - hl, cy - hw], [w, cy], [w - hl, cy + hw], [w - hl, cy + a], [cx + a, cy + a], [cx + a, h - hl], [cx + hw, h - hl], [cx, h], [cx - hw, h - hl], [cx - a, h - hl], [cx - a, cy + a], [hl, cy + a], [hl, cy + hw], [0, cy], [hl, cy - hw], [hl, cy - a], [cx - a, cy - a], [cx - a, hl], [cx - hw, hl]])); }
      case 'notchedRightArrow': { const a = adj.a * h, hl = Math.min(w, adj.b * ss), n = a / 2 * 0.6; return one(pts([[0, (h - a) / 2], [w - hl, (h - a) / 2], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, (h + a) / 2], [0, (h + a) / 2], [n, h / 2]])); }
      case 'stripedRightArrow': { const a = adj.a * h, hl = Math.min(w, adj.b * ss), s = ss * 0.06; return one(pts([[0, (h - a) / 2], [s, (h - a) / 2], [s, (h + a) / 2], [0, (h + a) / 2]]) + ' ' + pts([[s * 2, (h - a) / 2], [s * 3, (h - a) / 2], [s * 3, (h + a) / 2], [s * 2, (h + a) / 2]]) + ' ' + pts([[s * 4, (h - a) / 2], [w - hl, (h - a) / 2], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, (h + a) / 2], [s * 4, (h + a) / 2]])); }
      case 'chevron': { const a = Math.min(w, adj.a * ss); return one(pts([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h], [a, h / 2]])); }
      case 'homePlate': { const a = Math.min(w, adj.a * ss); return one(pts([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h]])); }
      case 'uturnArrow': { const t = ss * 0.25, hw = ss * 0.25, hl = ss * 0.25, r = Math.min(w / 2 - 0.01, h * 0.45); return one('M0,' + f(h) + ' V' + f(r) + ' A' + f(r) + ',' + f(r) + ' 0 0,1 ' + f(2 * r) + ',' + f(r) + ' V' + f(h - hl) + ' H' + f(2 * r + hw / 2) + ' L' + f(2 * r - t / 2) + ',' + f(h) + ' L' + f(2 * r - t - hw / 2) + ',' + f(h - hl) + ' H' + f(2 * r - t) + ' V' + f(r) + ' A' + f(r - t) + ',' + f(r - t) + ' 0 0,0 ' + f(t) + ',' + f(r) + ' V' + f(h) + ' Z'); }
      case 'circularArrow': { const rx = w / 2, ry = h / 2, t = ss * 0.14, s = 0.55, e = 0.02; const o1 = arcPt(rx, ry, rx - t * 0.6, ry - t * 0.6, s), o2 = arcPt(rx, ry, rx, ry, e), i2 = arcPt(rx, ry, rx - t, ry - t, e), o1b = arcPt(rx, ry, rx - t, ry - t, s); const tip = arcPt(rx, ry, rx - t / 2, ry - t / 2, e + 0.09), oo = arcPt(rx, ry, rx + t * 0.45, ry + t * 0.45, e), ii = arcPt(rx, ry, rx - t * 1.45, ry - t * 1.45, e); void o1; return one('M' + f(arcPt(rx, ry, rx, ry, s)[0]) + ',' + f(arcPt(rx, ry, rx, ry, s)[1]) + ' A' + f(rx) + ',' + f(ry) + ' 0 1,1 ' + f(o2[0]) + ',' + f(o2[1]) + ' L' + f(oo[0]) + ',' + f(oo[1]) + ' L' + f(tip[0]) + ',' + f(tip[1]) + ' L' + f(ii[0]) + ',' + f(ii[1]) + ' L' + f(i2[0]) + ',' + f(i2[1]) + ' A' + f(rx - t) + ',' + f(ry - t) + ' 0 1,0 ' + f(o1b[0]) + ',' + f(o1b[1]) + ' Z'); }
      case 'flowChartPredefinedProcess': return [{ d: pts([[0, 0], [w, 0], [w, h], [0, h]]), fill: 'normal', stroke: true }, { d: 'M' + f(w * 0.12) + ',0 V' + f(h) + ' M' + f(w * 0.88) + ',0 V' + f(h), fill: 'none', stroke: true }];
      case 'flowChartDocument': return one('M0,0 H' + f(w) + ' V' + f(h * 0.83) + ' C' + f(w * 0.7) + ',' + f(h * 0.7) + ' ' + f(w * 0.35) + ',' + f(h * 1.08) + ' 0,' + f(h * 0.9) + ' Z');
      case 'flowChartManualInput': return one(pts([[0, h * 0.2], [w, 0], [w, h], [0, h]]));
      case 'flowChartMerge': return one(pts([[0, 0], [w, 0], [w / 2, h]]));
      case 'star4': case 'star5': case 'star6': case 'star8': case 'star10': case 'star12': case 'star16': case 'star24': return one(star(parseInt(id.slice(4), 10), w, h, adj.a));
      case 'irregularSeal1': return one(pts([[0.43, 0.23], [0.55, 0], [0.62, 0.22], [0.82, 0.13], [0.74, 0.32], [1, 0.37], [0.79, 0.5], [0.96, 0.68], [0.71, 0.63], [0.71, 0.88], [0.56, 0.71], [0.45, 1], [0.38, 0.73], [0.17, 0.85], [0.24, 0.62], [0, 0.58], [0.19, 0.45], [0.02, 0.27], [0.26, 0.32], [0.24, 0.07]].map((p) => [p[0] * w, p[1] * h])));
      case 'irregularSeal2': return one(pts([[0.33, 0.18], [0.5, 0.05], [0.56, 0.2], [0.75, 0.08], [0.71, 0.27], [0.94, 0.25], [0.8, 0.4], [1, 0.52], [0.8, 0.6], [0.88, 0.8], [0.66, 0.73], [0.62, 0.95], [0.48, 0.79], [0.3, 1], [0.29, 0.79], [0.07, 0.83], [0.17, 0.64], [0, 0.5], [0.18, 0.42], [0.06, 0.2], [0.27, 0.3]].map((p) => [p[0] * w, p[1] * h])));
      case 'ribbon2': return [{ d: pts([[0, h * 0.25], [w * 0.18, h * 0.25], [w * 0.18, h * 0.85], [0, h * 0.85], [w * 0.07, h * 0.55]]) + ' ' + pts([[w, h * 0.25], [w * 0.82, h * 0.25], [w * 0.82, h * 0.85], [w, h * 0.85], [w * 0.93, h * 0.55]]), fill: 'darken', stroke: true }, { d: pts([[w * 0.12, 0], [w * 0.88, 0], [w * 0.88, h * 0.7], [w * 0.12, h * 0.7]]), fill: 'normal', stroke: true }];
      case 'wave': return one('M0,' + f(h * 0.15) + ' C' + f(w * 0.33) + ',' + f(-h * 0.15) + ' ' + f(w * 0.66) + ',' + f(h * 0.45) + ' ' + f(w) + ',' + f(h * 0.15) + ' V' + f(h * 0.85) + ' C' + f(w * 0.66) + ',' + f(h * 1.15) + ' ' + f(w * 0.33) + ',' + f(h * 0.55) + ' 0,' + f(h * 0.85) + ' Z');
      case 'mathPlus': { const t = ss * 0.22, m = ss * 0.1; return one(pts([[w / 2 - t / 2, m], [w / 2 + t / 2, m], [w / 2 + t / 2, h / 2 - t / 2], [w - m, h / 2 - t / 2], [w - m, h / 2 + t / 2], [w / 2 + t / 2, h / 2 + t / 2], [w / 2 + t / 2, h - m], [w / 2 - t / 2, h - m], [w / 2 - t / 2, h / 2 + t / 2], [m, h / 2 + t / 2], [m, h / 2 - t / 2], [w / 2 - t / 2, h / 2 - t / 2]])); }
      case 'mathMinus': { const t = ss * 0.22, m = ss * 0.1; return one(pts([[m, h / 2 - t / 2], [w - m, h / 2 - t / 2], [w - m, h / 2 + t / 2], [m, h / 2 + t / 2]])); }
      case 'mathMultiply': { const t = ss * 0.16, cx = w / 2, cy = h / 2, L = ss * 0.42, a = Math.PI / 4; const arm = (ang) => { const c = Math.cos(ang), s = Math.sin(ang), n = [-s, c]; return [[cx + n[0] * t / 2, cy + n[1] * t / 2], [cx + c * L + n[0] * t / 2, cy + s * L + n[1] * t / 2], [cx + c * L - n[0] * t / 2, cy + s * L - n[1] * t / 2], [cx - n[0] * t / 2, cy - n[1] * t / 2]]; }; return one([a, a + Math.PI / 2, a + Math.PI, a + 3 * Math.PI / 2].map((x) => pts(arm(x))).join(' ')); }
      case 'mathDivide': { const t = ss * 0.18, m = ss * 0.1, r = ss * 0.1; return one(pts([[m, h / 2 - t / 2], [w - m, h / 2 - t / 2], [w - m, h / 2 + t / 2], [m, h / 2 + t / 2]]) + ' ' + ell(w / 2, h * 0.22, r, r) + ' ' + ell(w / 2, h * 0.78, r, r)); }
      case 'mathEqual': { const t = ss * 0.18, m = ss * 0.1, g = ss * 0.12; return one(pts([[m, h / 2 - g - t], [w - m, h / 2 - g - t], [w - m, h / 2 - g], [m, h / 2 - g]]) + ' ' + pts([[m, h / 2 + g], [w - m, h / 2 + g], [w - m, h / 2 + g + t], [m, h / 2 + g + t]])); }
      case 'mathNotEqual': { const t = ss * 0.16, m = ss * 0.1, g = ss * 0.11; return one(pts([[m, h / 2 - g - t], [w - m, h / 2 - g - t], [w - m, h / 2 - g], [m, h / 2 - g]]) + ' ' + pts([[m, h / 2 + g], [w - m, h / 2 + g], [w - m, h / 2 + g + t], [m, h / 2 + g + t]]) + ' ' + pts([[w * 0.62, h * 0.08], [w * 0.7, h * 0.12], [w * 0.38, h * 0.92], [w * 0.3, h * 0.88]])); }
      default: return one(pts([[0, 0], [w, 0], [w, h], [0, h]]));
    }
  };
  /** Zone de texte dans la forme (marges internes supplémentaires) : [x, y, w, h] */
  P.shapeTextBox = function (id, w, h) {
    const r = { ellipse: [0.146, 0.146, 0.708, 0.708], flowChartConnector: [0.146, 0.146, 0.708, 0.708], triangle: [0.25, 0.5, 0.5, 0.5], diamond: [0.25, 0.25, 0.5, 0.5], flowChartDecision: [0.25, 0.25, 0.5, 0.5], star5: [0.25, 0.3, 0.5, 0.45], star6: [0.2, 0.25, 0.6, 0.5], star4: [0.3, 0.3, 0.4, 0.4], cloud: [0.15, 0.2, 0.7, 0.6], cloudCallout: [0.15, 0.2, 0.7, 0.6], wedgeEllipseCallout: [0.146, 0.146, 0.708, 0.708], heart: [0.2, 0.2, 0.6, 0.5], hexagon: [0.15, 0, 0.7, 1], octagon: [0.1, 0.1, 0.8, 0.8], pentagon: [0.2, 0.25, 0.6, 0.6], chevron: [0.2, 0, 0.6, 1], homePlate: [0, 0, 0.8, 1], rightArrow: [0, 0.25, 0.75, 0.5], leftArrow: [0.25, 0.25, 0.75, 0.5], can: [0, 0.25, 1, 0.75], cube: [0, 0.25, 0.75, 0.75], ribbon2: [0.15, 0, 0.7, 0.7], donut: [0.25, 0.25, 0.5, 0.5], rtTriangle: [0.08, 0.5, 0.5, 0.45], parallelogram: [0.15, 0, 0.7, 1], trapezoid: [0.15, 0, 0.7, 1], sun: [0.25, 0.25, 0.5, 0.5] }[id];
    return r ? [r[0] * w, r[1] * h, r[2] * w, r[3] * h] : [0, 0, w, h];
  };
  /** Poignées jaunes de réglage */
  P.shapeHandles = function (id, w, h, adj) {
    adj = Object.assign({}, P.DEFAULT_ADJ[id] || {}, adj || {});
    const ss = Math.min(w, h), cl = (v) => Math.max(0, Math.min(1, v));
    switch (id) {
      case 'roundRect': case 'snip1Rect': case 'snip2SameRect': case 'round1Rect': case 'round2SameRect': return [{ x: id === 'roundRect' || id === 'round2SameRect' ? adj.r * ss : w - adj.r * ss, y: 0, set: (x) => ({ r: cl((id === 'roundRect' || id === 'round2SameRect' ? x : w - x) / ss) * (0.5) / 0.5 }) }];
      case 'triangle': return [{ x: adj.a * w, y: 0, set: (x) => ({ a: cl(x / w) }) }];
      case 'parallelogram': case 'trapezoid': return [{ x: adj.a * ss, y: 0, set: (x) => ({ a: cl(x / ss) }) }];
      case 'octagon': return [{ x: adj.a * ss, y: 0, set: (x) => ({ a: Math.min(0.5, cl(x / ss)) }) }];
      case 'chevron': case 'homePlate': return [{ x: w - adj.a * ss, y: 0, set: (x) => ({ a: cl((w - x) / ss) }) }];
      case 'rightArrow': case 'notchedRightArrow': case 'stripedRightArrow': return [{ x: w - Math.min(w, adj.b * ss), y: (h - adj.a * h) / 2, set: (x, y) => ({ b: cl((w - x) / ss), a: cl(1 - 2 * y / h) }) }];
      case 'leftArrow': return [{ x: Math.min(w, adj.b * ss), y: (h - adj.a * h) / 2, set: (x, y) => ({ b: cl(x / ss), a: cl(1 - 2 * y / h) }) }];
      case 'wedgeRectCallout': case 'wedgeRoundRectCallout': case 'wedgeEllipseCallout': case 'cloudCallout': return [{ x: w / 2 + adj.x * w, y: h / 2 + adj.y * h, set: (x, y) => ({ x: (x - w / 2) / w, y: (y - h / 2) / h }) }];
      case 'star4': case 'star5': case 'star6': case 'star8': case 'star10': case 'star12': case 'star16': case 'star24': return [{ x: w / 2, y: h / 2 - adj.a * h / 2, set: (x, y) => ({ a: Math.max(0.05, cl((h / 2 - y) / (h / 2))) }) }];
      case 'donut': case 'frame': case 'plus': case 'can': case 'cube': case 'bevel': case 'foldedCorner': return [{ x: adj.t * ss, y: id === 'can' ? adj.t * ss / 2 : 0, set: (x) => ({ t: Math.min(0.5, cl(x / ss)) }) }];
      case 'moon': return [{ x: w - w * adj.a, y: h / 2, set: (x) => ({ a: Math.max(0.05, Math.min(0.95, (w - x) / w)) }) }];
      default: return [];
    }
  };
})();
