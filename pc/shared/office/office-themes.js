/* =====================================================================
   Suite MAG — thèmes (jeux de couleurs + polices) communs aux applis bureautiques.
   Office.Themes.list : [{id, name, dark, colors:{dk1, lt1, dk2, lt2, accent1..6, hlink}, fonts:{major, minor}, bg, decor}]
   Rôles : bg1/tx1 (fond/texte principaux), bg2/tx2, accent1…accent6, hlink. Thème sombre : bg1 = dk1, tx1 = lt1.
   Références de couleur : « t:accent1 », « t:accent1/+40 » (éclairci 40 %), « t:tx1/-25 » (assombri), ou « #RRGGBB ».
   Office.Themes.vars(thème) → variables CSS (--t-bg1, --t-tx1, --t-accent1…, --t-major, --t-minor) ; resolve(ref, thème) → #hex
   check(thème) → contrôles de contraste (WCAG 2.1 : 4,5 pour le texte, 3 pour les grands titres).
   ===================================================================== */
(function () {
  'use strict';
  const O = window.Office;
  const T = O.Themes = {};
  const th = (id, name, dark, c, major, minor, bg, decor, extra) => Object.assign({ id, name, dark, colors: { dk1: c[0], lt1: c[1], dk2: c[2], lt2: c[3], accent1: c[4], accent2: c[5], accent3: c[6], accent4: c[7], accent5: c[8], accent6: c[9], hlink: c[10] || c[4] }, fonts: { major, minor }, bg: bg || { type: 'solid', color: 't:bg1' }, decor: decor || 'none' }, extra || {});
  T.list = [
    th('clair', 'Clair', false, ['#1F2937', '#FFFFFF', '#334155', '#EEF2F7', '#2563EB', '#F97316', '#16A34A', '#9333EA', '#0891B2', '#DC2626', '#1D4ED8'], 'Segoe UI', 'Segoe UI', null, 'clair'),
    th('mag', 'MAG Formation 13', false, ['#000000', '#FFFEF9', '#16212B', '#F3F5F7', '#EC7913', '#4BB3EF', '#2C97D3', '#B65A05', '#8C99A4', '#2E9E4F', '#2C97D3'], 'Exo', 'Exo', { type: 'solid', color: '#F3F5F7' }, 'mag'),
    th('ardoise', 'Ardoise', true, ['#1B222C', '#F1F4F8', '#2A3441', '#C9D3DF', '#36C5B0', '#F59E42', '#7AA7FF', '#F472B6', '#FACC15', '#A3E635', '#7AA7FF'], 'Bahnschrift', 'Segoe UI', { type: 'gradient', kind: 'linear', angle: 135, stops: [{ c: '#1B222C', p: 0 }, { c: '#26303D', p: 100 }] }, 'ardoise'),
    th('ocean', 'Océan', false, ['#0B2545', '#FFFFFF', '#13315C', '#E8F1FA', '#1B6CA8', '#14A3A3', '#F2A541', '#6A4C93', '#3FA34D', '#E4572E', '#1B6CA8'], 'Corbel', 'Corbel', { type: 'gradient', kind: 'linear', angle: 180, stops: [{ c: '#FFFFFF', p: 0 }, { c: '#E3EEF9', p: 100 }] }, 'vague'),
    th('foret', 'Forêt', false, ['#1E2B1F', '#FBFAF5', '#2F4A32', '#E9EFE3', '#2F7D4A', '#A3B18A', '#D98E04', '#8C5E3C', '#4F7CAC', '#B23A48', '#2F7D4A'], 'Georgia', 'Verdana', null, 'bande'),
    th('terracotta', 'Terracotta', false, ['#3B2A23', '#FBF4EC', '#5C4033', '#F0E2D2', '#C4572F', '#E0A458', '#6B8F71', '#3E7CB1', '#9C6644', '#A23B72', '#A3432A'], 'Palatino', 'Gill Sans', { type: 'solid', color: '#FBF4EC' }, 'coin'),
    th('minuit', 'Minuit', true, ['#0D1B2A', '#F5F3EE', '#1B263B', '#D8D3C8', '#E0B04B', '#5FA8D3', '#E76F51', '#8AB17D', '#B79CED', '#F4A261', '#E0B04B'], 'Century Gothic', 'Century Gothic', { type: 'gradient', kind: 'radial', angle: 0, stops: [{ c: '#1D3150', p: 0 }, { c: '#0D1B2A', p: 100 }] }, 'etoile'),
    th('pastel', 'Pastel', false, ['#3A3550', '#FFFDFB', '#5B5675', '#F6F0FA', '#8E7DBE', '#F29E9E', '#7CC6B4', '#F6C667', '#79A7D3', '#E58FB3', '#6E5BAA'], 'Trebuchet MS', 'Trebuchet MS', { type: 'solid', color: '#FFFDFB' }, 'bulles'),
    th('graphite', 'Graphite', false, ['#111111', '#FFFFFF', '#3A3A3A', '#EDEDED', '#D7263D', '#3A3A3A', '#8C8C8C', '#1B998B', '#F46036', '#2E294E', '#B81D30'], 'Franklin Gothic', 'Arial', null, 'trait'),
    th('soleil', 'Soleil', false, ['#2B2118', '#FFFBF0', '#4A3B2A', '#FFF1CC', '#F59E0B', '#EF4444', '#0EA5E9', '#22C55E', '#A855F7', '#EC4899', '#B45309'], 'Bahnschrift', 'Segoe UI', { type: 'gradient', kind: 'linear', angle: 160, stops: [{ c: '#FFFBF0', p: 0 }, { c: '#FFEFC2', p: 100 }] }, 'soleil'),
    th('lavande', 'Lavande', false, ['#2E2A3D', '#FFFFFF', '#4B4466', '#F2EFF8', '#7C5CBF', '#D9A5B3', '#4FA3A5', '#E3B23C', '#5C80BC', '#C05746', '#6A4BAE'], 'Constantia', 'Corbel', null, 'coin'),
    th('craie', 'Tableau à craie', true, ['#1F3A2E', '#F4F1E8', '#2C4C3B', '#D6D2C4', '#F7E07E', '#9AD1F5', '#F6A6B2', '#B8E3A1', '#FFFFFF', '#F4B183', '#F7E07E'], 'Segoe Print', 'Segoe Print', { type: 'solid', color: '#1F3A2E' }, 'cadre'),
    th('chantier', 'Chantier', false, ['#111111', '#FFFFFF', '#2B2B2B', '#F4F4F2', '#F2B705', '#111111', '#E4572E', '#2E86AB', '#3BB273', '#7A7A7A', '#B07D00'], 'Arial Black', 'Arial', null, 'balisage'),
    th('papier', 'Papier', false, ['#2B2B2B', '#FDFBF6', '#4A4A4A', '#F2EEE3', '#8B3A3A', '#3B6E8F', '#7A8B3A', '#B8860B', '#5D4E8C', '#2F6F5E', '#8B3A3A'], 'Garamond', 'Georgia', { type: 'solid', color: '#FDFBF6' }, 'filet'),
    th('neon', 'Néon', true, ['#0A0A12', '#F5F5FA', '#161625', '#C5C5D8', '#00E5FF', '#FF2E88', '#B6FF00', '#FFB800', '#8B5CF6', '#FF5C33', '#00E5FF'], 'Consolas', 'Segoe UI', { type: 'solid', color: '#0A0A12' }, 'neon'),
    th('sobre', 'Sobre (noir et blanc)', false, ['#000000', '#FFFFFF', '#333333', '#F2F2F2', '#000000', '#555555', '#888888', '#AAAAAA', '#333333', '#666666', '#000000'], 'Arial', 'Arial', null, 'none')
  ];
  T.get = (id) => T.list.find((t) => t.id === id) || T.list[0];
  /** Couleurs effectives par rôle */
  T.roles = function (t) {
    const c = t.colors, d = !!t.dark;
    return { bg1: d ? c.dk1 : c.lt1, tx1: d ? c.lt1 : c.dk1, bg2: d ? c.dk2 : c.lt2, tx2: d ? c.lt2 : c.dk2, dk1: c.dk1, lt1: c.lt1, dk2: c.dk2, lt2: c.lt2, accent1: c.accent1, accent2: c.accent2, accent3: c.accent3, accent4: c.accent4, accent5: c.accent5, accent6: c.accent6, hlink: c.hlink };
  };
  T.ROLE_NAMES = { bg1: 'Fond 1', tx1: 'Texte 1', bg2: 'Fond 2', tx2: 'Texte 2', accent1: 'Accent 1', accent2: 'Accent 2', accent3: 'Accent 3', accent4: 'Accent 4', accent5: 'Accent 5', accent6: 'Accent 6' };
  /** Palette pour le sélecteur de couleur */
  T.palette = (t) => { const r = T.roles(t); return ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((k) => ({ ref: k, hex: r[k], name: T.ROLE_NAMES[k] })); };
  /** Référence → couleur hexadécimale (null si « aucune ») */
  T.resolve = function (ref, t) {
    if (ref == null || ref === '' || ref === 'none') return null;
    ref = String(ref);
    let m = /^var\(--t-([a-z0-9]+)\)$/.exec(ref); if (m) ref = 't:' + m[1];
    m = /^var\(--tc-([a-z0-9]+)-(p|m)(\d+)\)$/.exec(ref); if (m) ref = 't:' + m[1] + '/' + (m[2] === 'p' ? '+' : '-') + m[3];
    m = /^t:([a-z0-9]+)(?:\/([+-]?\d+))?$/.exec(ref);
    if (m) { const base = T.roles(t)[m[1]] || '#000000'; return m[2] ? O.tint(base, parseInt(m[2], 10) / 100) : base; }
    return O.cssToHex(ref);
  };
  /** Référence → valeur CSS (les couleurs de thème restent des variables : elles suivent un changement de thème) */
  T.css = function (ref) {
    if (ref == null || ref === '' || ref === 'none') return 'transparent';
    const m = /^t:([a-z0-9]+)(?:\/([+-]?\d+))?$/.exec(String(ref));
    if (!m) return ref;
    if (!m[2]) return 'var(--t-' + m[1] + ')';
    const k = parseInt(m[2], 10); return 'var(--tc-' + m[1] + '-' + (k >= 0 ? 'p' : 'm') + Math.abs(k) + ')';
  };
  const STEPS = [80, 60, 40, 25, 50, 15];
  /** Variables CSS du thème (et des variantes éclaircies / assombries proposées par le sélecteur) */
  T.vars = function (t) {
    const r = T.roles(t), v = {};
    Object.keys(r).forEach((k) => {
      v['--t-' + k] = r[k];
      STEPS.forEach((s) => { v['--tc-' + k + '-p' + s] = O.tint(r[k], s / 100); v['--tc-' + k + '-m' + s] = O.tint(r[k], -s / 100); });
    });
    v['--t-major'] = O.fontStack(t.fonts.major); v['--t-minor'] = O.fontStack(t.fonts.minor);
    return v;
  };
  T.varsCss = (t) => { const v = T.vars(t); return Object.keys(v).map((k) => k + ':' + v[k]).join(';'); };
  /** Remplace les variables de thème d'un style CSS par leurs valeurs (exports) */
  T.flatten = function (css, t) {
    const v = T.vars(t);
    return String(css || '').replace(/var\((--t[c]?-[a-z0-9-]+)\)/g, (m, k) => v[k] || m);
  };
  /** Contrôle de contraste (accessibilité) */
  T.check = function (t) {
    const r = T.roles(t), out = [];
    const ck = (a, b, min, label) => { const c = O.contrast(r[a], r[b]); out.push({ label, ratio: O.round(c, 2), ok: c >= min, min }); };
    ck('tx1', 'bg1', 4.5, 'Texte principal sur fond principal');
    ck('tx2', 'bg2', 4.5, 'Texte 2 sur fond 2');
    ck('accent1', 'bg1', 3, 'Accent 1 (titres, formes) sur le fond');
    return out;
  };
  /** Paire de polices proposées seules (menu Polices du thème) */
  T.fontPairs = [
    ['Segoe UI', 'Segoe UI'], ['Bahnschrift', 'Segoe UI'], ['Georgia', 'Verdana'], ['Cambria', 'Calibri'], ['Calibri', 'Calibri'], ['Century Gothic', 'Century Gothic'],
    ['Palatino', 'Gill Sans'], ['Franklin Gothic', 'Arial'], ['Trebuchet MS', 'Trebuchet MS'], ['Constantia', 'Corbel'], ['Garamond', 'Georgia'], ['Exo', 'Exo'],
    ['Arial Black', 'Arial'], ['Rockwell', 'Segoe UI'], ['Times New Roman', 'Arial'], ['Consolas', 'Segoe UI']
  ];
})();
