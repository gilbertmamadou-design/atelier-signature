/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-tableur/tb-cf.js : ne pas modifier ici. */
/* Tableur — mise en forme conditionnelle (règles de valeur, texte, dates, premiers / derniers, moyenne, doublons, formule,
   barres de données, nuances de couleurs, jeux d'icônes), styles de tableau (bandes, en-têtes, totaux), sparklines.
   TB.CF.prepare(wb, feuille, version) → contexte ; TB.CF.cell(ctx, r, c) → {st, bar, icon}. */
(function (G) {
  'use strict';
  const TB = G.Tableur, P = TB.Formula, E = TB.E;
  const CF = TB.CF = {};

  /* ---------------- thème des couleurs du classeur ---------------- */
  TB.THEMES = {
    classique: { name: 'Classique', c: ['#000000', '#FFFFFF', '#44546A', '#E7E6E6', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#0563C1', '#954F72'], major: 'Calibri Light', minor: 'Calibri' },
    mag: { name: 'MAG Formation 13', c: ['#000000', '#FFFFFF', '#16212B', '#F3F5F7', '#EC7913', '#2C97D3', '#4BB3EF', '#B65A05', '#8C99A4', '#2E9E4F', '#2C97D3', '#B65A05'], major: 'Exo', minor: 'Calibri' },
    vert: { name: 'Sapin', c: ['#000000', '#FFFFFF', '#1E3A2B', '#E8F3EC', '#1E7B45', '#E0A030', '#4C8DB8', '#8A5A9E', '#5BA87A', '#C8553D', '#1E7B45', '#8A5A9E'], major: 'Calibri', minor: 'Calibri' },
    ocean: { name: 'Océan', c: ['#000000', '#FFFFFF', '#0B2545', '#E8F1FA', '#1B6CA8', '#14A3A3', '#F2A541', '#6A4C93', '#3FA34D', '#E4572E', '#1B6CA8', '#6A4C93'], major: 'Corbel', minor: 'Corbel' },
    terre: { name: 'Terracotta', c: ['#000000', '#FFFFFF', '#3B2A23', '#F0E2D2', '#C4572F', '#E0A458', '#6B8F71', '#3E7CB1', '#9C6644', '#A23B72', '#A3432A', '#3E7CB1'], major: 'Georgia', minor: 'Calibri' },
    gris: { name: 'Niveaux de gris', c: ['#000000', '#FFFFFF', '#000000', '#F8F8F8', '#DDDDDD', '#B2B2B2', '#969696', '#808080', '#5F5F5F', '#4D4D4D', '#5F5F5F', '#919191'], major: 'Arial', minor: 'Arial' },
    vif: { name: 'Vif', c: ['#000000', '#FFFFFF', '#1F2937', '#EEF2F7', '#2563EB', '#F97316', '#16A34A', '#9333EA', '#0891B2', '#DC2626', '#1D4ED8', '#9333EA'], major: 'Segoe UI', minor: 'Segoe UI' }
  };
  TB.themeOf = (wb) => (wb.themeColors ? { name: 'Thème du fichier', c: wb.themeColors, major: 'Calibri Light', minor: 'Calibri' } : null) || TB.THEMES[wb.settings.theme] || TB.THEMES.classique;
  TB.themeColor = function (wb, idx, tint) {
    const t = TB.themeOf(wb).c; let hex = t[idx] || '#000000';
    if (tint) hex = TB.tint(hex, tint); return hex;
  };
  const h2r = (h) => { h = String(h || '#000000').replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const r2h = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  TB.tint = (hex, t) => { const c = h2r(hex); return r2h.apply(null, c.map((v) => t >= 0 ? v + (255 - v) * t : v * (1 + t))); };
  TB.mixColor = (a, b, k) => { const x = h2r(a), y = h2r(b); return r2h(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k); };
  /** palette pour le sélecteur de couleur (Office.colorPicker) */
  /** couleur choisie dans le sélecteur (« t:th4/+40 ») → #RRGGBB */
  TB.resolveColor = (wb, c) => { const m = /^t:th(\d+)(?:\/([+-]?\d+))?$/.exec(String(c || '')); if (!m) return c; const hex = TB.themeOf(wb).c[+m[1]] || '#000000'; return m[2] ? (window.Office && window.Office.tint ? window.Office.tint(hex, +m[2] / 100) : TB.tint(hex, +m[2] / 100)).toUpperCase() : hex; };
  TB.themePalette = (wb) => { const t = TB.themeOf(wb).c; const names = ['Texte 1', 'Arrière-plan 1', 'Texte 2', 'Arrière-plan 2', 'Accentuation 1', 'Accentuation 2', 'Accentuation 3', 'Accentuation 4', 'Accentuation 5', 'Accentuation 6']; return [1, 0, 3, 2, 4, 5, 6, 7, 8, 9].map((i) => ({ ref: 'th' + i, hex: t[i], name: names[i] })); };

  /* =====================================================================
     Mise en forme conditionnelle
     ===================================================================== */
  const cache = new WeakMap();
  CF.prepare = function (wb, sh, ver) {
    let c = cache.get(sh);
    if (c && c.ver === ver && c.n === sh.cf.length) return c;
    c = { wb, sh, ver, n: sh.cf.length, rules: sh.cf, any: sh.cf.length > 0, stats: new Map(), res: new Map() };
    cache.set(sh, c);
    return c;
  };
  CF.invalidate = (sh) => cache.delete(sh);
  function inR(rule, r, c) { for (const g of rule.ranges) if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) return g; return null; }
  function valuesOf(ctx, rule) {
    let s = ctx.stats.get(rule); if (s) return s;
    const nums = [], all = [];
    const sh = ctx.sh, ext = sh.extent();
    for (const g of rule.ranges) {
      const R = new TB.Ref(sh, g.r1, g.c1, Math.min(g.r2, ext.r), Math.min(g.c2, ext.c));
      R.each((v) => { all.push(v); if (typeof v === 'number') nums.push(v); });
    }
    const sorted = nums.slice().sort((a, b) => a - b);
    const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const sd = nums.length > 1 ? Math.sqrt(nums.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (nums.length - 1)) : 0;
    let counts = null;
    if (rule.type === 'dup') { counts = new Map(); all.forEach((v) => { const k = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + String(v); counts.set(k, (counts.get(k) || 0) + 1); }); }
    s = { nums: sorted, min: sorted[0], max: sorted[sorted.length - 1], mean, sd, counts };
    ctx.stats.set(rule, s); return s;
  }
  const pctl = (sorted, p) => { if (!sorted.length) return 0; const h = (sorted.length - 1) * p, lo = Math.floor(h); return lo + 1 < sorted.length ? sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]) : sorted[lo]; };
  /** valeur d'un seuil {t:'min'|'max'|'num'|'percent'|'percentile'|'formula', v} */
  function thr(ctx, rule, p, g) {
    const s = valuesOf(ctx, rule);
    switch (p.t) {
      case 'min': return s.min; case 'max': return s.max;
      case 'percent': return s.min + (s.max - s.min) * (+p.v || 0) / 100;
      case 'percentile': return pctl(s.nums, (+p.v || 0) / 100);
      case 'formula': { const v = evalF(ctx, p.v, g.r1, g.c1, g); return typeof v === 'number' ? v : 0; }
      default: return +p.v || 0;
    }
  }
  const astCache = new Map();
  function evalF(ctx, src, r, c, g) {
    let ast = astCache.get(src);
    if (ast === undefined) { try { ast = P.parse(String(src).replace(/^=/, '')); } catch (e) { ast = null; } if (astCache.size > 2000) astCache.clear(); astCache.set(src, ast); }
    if (!ast) return E.VALUE;
    const a = g && (r !== g.r1 || c !== g.c1) ? P.shift(ast, r - g.r1, c - g.c1) : ast;
    try { let v = TB.ev(a, { wb: ctx.wb, sh: ctx.sh, r, c, f: null, env: null, depth: 0 }); if (v instanceof TB.Ref) v = v.single() ? v.v(0, 0) : v.v(0, 0); if (v instanceof TB.Arr) v = v.v(0, 0); return v; } catch (e) { return E.VALUE; }
  }
  CF.evalF = evalF;
  const cmpNum = (v, x) => TB.compare(v, x);
  function test(ctx, rule, g, r, c, v) {
    switch (rule.type) {
      case 'cellIs': {
        if (v === null && !/^(eq|ne)$/.test(rule.op)) v = 0;
        const a = evalF(ctx, rule.f1, r, c, g); if (a instanceof TB.Err) return false;
        const b = rule.f2 != null ? evalF(ctx, rule.f2, r, c, g) : null;
        if (v instanceof TB.Err) return false;
        const k = cmpNum(v, a);
        switch (rule.op) { case 'gt': return k > 0; case 'lt': return k < 0; case 'ge': return k >= 0; case 'le': return k <= 0; case 'eq': return k === 0; case 'ne': return k !== 0; case 'between': return k >= 0 && cmpNum(v, b) <= 0 || (cmpNum(v, b) >= 0 && k <= 0); case 'notBetween': return !((k >= 0 && cmpNum(v, b) <= 0) || (cmpNum(v, b) >= 0 && k <= 0)); }
        return false;
      }
      case 'text': { if (v === null) return rule.op === 'notContains'; const t = String(v instanceof TB.Err ? TB.errText(v) : typeof v === 'number' ? TB.numText(v) : v).toLowerCase(), x = String(rule.text || '').toLowerCase(); return rule.op === 'contains' ? t.indexOf(x) >= 0 : rule.op === 'notContains' ? t.indexOf(x) < 0 : rule.op === 'begins' ? t.startsWith(x) : t.endsWith(x); }
      case 'date': {
        if (typeof v !== 'number') return false; const d = Math.floor(v), t = TB.today(), wd = TB.weekday(t);
        const y = TB.ymd(t), dd = TB.ymd(d);
        switch (rule.period) {
          case 'yesterday': return d === t - 1; case 'today': return d === t; case 'tomorrow': return d === t + 1;
          case 'last7': return d > t - 7 && d <= t;
          case 'thisWeek': return d >= t - wd && d < t - wd + 7; case 'lastWeek': return d >= t - wd - 7 && d < t - wd; case 'nextWeek': return d >= t - wd + 7 && d < t - wd + 14;
          case 'thisMonth': return dd.y === y.y && dd.m === y.m;
          case 'lastMonth': { const pm = y.m === 1 ? 12 : y.m - 1, py = y.m === 1 ? y.y - 1 : y.y; return dd.y === py && dd.m === pm; }
          case 'nextMonth': { const nm = y.m === 12 ? 1 : y.m + 1, ny = y.m === 12 ? y.y + 1 : y.y; return dd.y === ny && dd.m === nm; }
          case 'past': return d < t; case 'future': return d > t;
        }
        return false;
      }
      case 'top': {
        if (typeof v !== 'number') return false; const s = valuesOf(ctx, rule); const n = s.nums.length; if (!n) return false;
        let k = rule.pct ? Math.max(1, Math.floor(n * (rule.rank || 10) / 100)) : Math.min(n, rule.rank || 10);
        return rule.bottom ? v <= s.nums[k - 1] : v >= s.nums[n - k];
      }
      case 'avg': { if (typeof v !== 'number') return false; const s = valuesOf(ctx, rule); const lim = s.mean + (rule.std || 0) * s.sd * (rule.above === false ? -1 : 1); return rule.above === false ? (rule.equal ? v <= lim : v < lim) : (rule.equal ? v >= lim : v > lim); }
      case 'dup': { if (v === null) return false; const s = valuesOf(ctx, rule); const k = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + String(v); const n = s.counts.get(k) || 0; return rule.unique ? n === 1 : n > 1; }
      case 'blank': return v === null || (typeof v === 'string' && !v.trim());
      case 'noBlank': return !(v === null || (typeof v === 'string' && !v.trim()));
      case 'err': return v instanceof TB.Err;
      case 'noErr': return !(v instanceof TB.Err);
      case 'expr': { const x = evalF(ctx, rule.f, r, c, g); if (x instanceof TB.Err) return false; const b = TB.toBool(x); return b === true; }
    }
    return false;
  }
  CF.cell = function (ctx, r, c) {
    const k = TB.key(r, c); let res = ctx.res.get(k); if (res !== undefined) return res;
    res = null;
    const v = ctx.sh.get(r, c);
    let st = null, stopped = false;
    for (const rule of ctx.rules) {
      const g = inR(rule, r, c); if (!g) continue;
      if (rule.type === 'colorScale') { if (stopped) continue; if (typeof v !== 'number') continue; const col = scaleColor(ctx, rule, g, v); if (col) { st = Object.assign(st || {}, st && st.bg ? {} : { bg: col }); } continue; }
      if (rule.type === 'dataBar') { if (stopped || typeof v !== 'number') continue; const b = barOf(ctx, rule, g, v); if (b) { res = res || {}; if (!res.bar) res.bar = b; } continue; }
      if (rule.type === 'iconSet') { if (stopped || typeof v !== 'number') continue; const ic = iconOf(ctx, rule, g, v); if (ic) { res = res || {}; if (!res.icon) res.icon = ic; } continue; }
      if (stopped) continue;
      if (test(ctx, rule, g, r, c, v)) {
        const f = rule.fmt || {}; st = st || {};
        for (const key in f) if (st[key] === undefined) st[key] = f[key];
        if (rule.stop) stopped = true;
      }
    }
    if (st) { res = res || {}; res.st = st; }
    ctx.res.set(k, res);
    if (ctx.res.size > 200000) ctx.res.clear();
    return res;
  };
  function scaleColor(ctx, rule, g, v) {
    const pts = rule.pts || []; if (pts.length < 2) return null;
    const vals = pts.map((p) => thr(ctx, rule, p, g));
    if (v <= vals[0]) return pts[0].c;
    if (v >= vals[vals.length - 1]) return pts[pts.length - 1].c;
    for (let i = 0; i < vals.length - 1; i++) if (v <= vals[i + 1]) { const k = vals[i + 1] === vals[i] ? 0 : (v - vals[i]) / (vals[i + 1] - vals[i]); return TB.mixColor(pts[i].c, pts[i + 1].c, k); }
    return null;
  }
  function barOf(ctx, rule, g, v) {
    let lo = thr(ctx, rule, rule.min || { t: 'min' }, g), hi = thr(ctx, rule, rule.max || { t: 'max' }, g);
    if (rule.min && rule.min.t === 'min' && lo > 0) lo = 0;
    if (hi === lo) hi = lo + 1;
    const neg = lo < 0;
    if (neg) { const span = hi - lo, axis = -lo / span; const pct = v >= 0 ? Math.min(1, v / Math.max(hi, 1e-12)) : -Math.min(1, v / lo); return { pct, axis, color: v < 0 ? (rule.negColor || '#FF0000') : (rule.color || '#638EC6'), grad: rule.grad !== false, border: rule.border, only: rule.showValue === false }; }
    const pct = Math.max(0.0, Math.min(1, (v - lo) / (hi - lo)));
    return { pct: Math.max(pct, 0.02), axis: 0, color: rule.color || '#638EC6', grad: rule.grad !== false, border: rule.border, only: rule.showValue === false };
  }
  CF.ICONS = {
    '3Arrows': ['arrowD:#C0504D', 'arrowR:#E5B92D', 'arrowU:#4E9A55'], '3ArrowsGray': ['arrowD:#808080', 'arrowR:#808080', 'arrowU:#808080'], '3Flags': ['flag:#D9363E', 'flag:#E5B92D', 'flag:#4E9A55'],
    '3TrafficLights1': ['dot:#D9363E', 'dot:#E5B92D', 'dot:#4E9A55'], '3TrafficLights2': ['light:#D9363E', 'light:#E5B92D', 'light:#4E9A55'], '3Signs': ['diamond:#D9363E', 'triangle:#E5B92D', 'dot:#4E9A55'],
    '3Symbols': ['xc:#D9363E', 'exc:#E5B92D', 'okc:#4E9A55'], '3Symbols2': ['x:#D9363E', 'exc2:#E5B92D', 'ok:#4E9A55'], '3Stars': ['star0:#E5B92D', 'star1:#E5B92D', 'star2:#E5B92D'], '3Triangles': ['triD:#D9363E', 'dash:#E5B92D', 'triU:#4E9A55'],
    '4Arrows': ['arrowD:#C0504D', 'arrowDR:#E5B92D', 'arrowUR:#E5B92D', 'arrowU:#4E9A55'], '4ArrowsGray': ['arrowD:#808080', 'arrowDR:#808080', 'arrowUR:#808080', 'arrowU:#808080'], '4RedToBlack': ['dot:#333333', 'dot:#808080', 'dot:#E8A0A0', 'dot:#D9363E'], '4Rating': ['bars1:#3D7BD9', 'bars2:#3D7BD9', 'bars3:#3D7BD9', 'bars4:#3D7BD9'], '4TrafficLights': ['dot:#333333', 'dot:#D9363E', 'dot:#E5B92D', 'dot:#4E9A55'],
    '5Arrows': ['arrowD:#C0504D', 'arrowDR:#E5B92D', 'arrowR:#E5B92D', 'arrowUR:#E5B92D', 'arrowU:#4E9A55'], '5ArrowsGray': ['arrowD:#808080', 'arrowDR:#808080', 'arrowR:#808080', 'arrowUR:#808080', 'arrowU:#808080'], '5Rating': ['bars0:#3D7BD9', 'bars1:#3D7BD9', 'bars2:#3D7BD9', 'bars3:#3D7BD9', 'bars4:#3D7BD9'], '5Quarters': ['q0:#333333', 'q1:#333333', 'q2:#333333', 'q3:#333333', 'q4:#333333'], '5Boxes': ['box0:#3D7BD9', 'box1:#3D7BD9', 'box2:#3D7BD9', 'box3:#3D7BD9', 'box4:#3D7BD9']
  };
  CF.ICON_NAMES = { '3Arrows': '3 flèches (couleur)', '3ArrowsGray': '3 flèches (gris)', '3Triangles': '3 triangles', '3Flags': '3 drapeaux', '3TrafficLights1': '3 feux', '3TrafficLights2': '3 feux (cerclés)', '3Signs': '3 panneaux', '3Symbols': '3 symboles (cerclés)', '3Symbols2': '3 symboles', '3Stars': '3 étoiles', '4Arrows': '4 flèches', '4ArrowsGray': '4 flèches (gris)', '4RedToBlack': 'Rouge à noir', '4Rating': '4 évaluations', '4TrafficLights': '4 feux', '5Arrows': '5 flèches', '5ArrowsGray': '5 flèches (gris)', '5Rating': '5 évaluations', '5Quarters': '5 quarts', '5Boxes': '5 cases' };
  function iconOf(ctx, rule, g, v) {
    const set = CF.ICONS[rule.set] || CF.ICONS['3TrafficLights1']; const n = set.length;
    const pts = rule.pts && rule.pts.length === n - 1 ? rule.pts : Array.from({ length: n - 1 }, (_, i) => ({ t: 'percent', v: Math.round(100 * (i + 1) / n) }));
    let k = 0; for (let i = 0; i < pts.length; i++) { const t = thr(ctx, rule, pts[i], g); if (pts[i].gt ? v > t : v >= t) k = i + 1; }
    if (rule.rev) k = n - 1 - k;
    return { set: rule.set, i: k, spec: set[k], only: rule.showValue === false };
  }
  /** dessin d'une icône (canevas) */
  CF.drawIcon = function (c, ic, x, cy, s) {
    const [kind, col] = ic.spec.split(':'); const h = s / 2;
    c.save(); c.translate(x + h, cy); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = Math.max(1.2, s / 9); c.lineJoin = 'round';
    const arrow = (ang) => { c.rotate(ang); c.beginPath(); c.moveTo(0, -h); c.lineTo(h * 0.85, 0); c.lineTo(h * 0.35, 0); c.lineTo(h * 0.35, h); c.lineTo(-h * 0.35, h); c.lineTo(-h * 0.35, 0); c.lineTo(-h * 0.85, 0); c.closePath(); c.fill(); };
    switch (kind) {
      case 'arrowU': arrow(0); break; case 'arrowD': arrow(Math.PI); break; case 'arrowR': arrow(Math.PI / 2); break; case 'arrowUR': arrow(Math.PI / 4); break; case 'arrowDR': arrow(3 * Math.PI / 4); break;
      case 'dot': c.beginPath(); c.arc(0, 0, h * 0.85, 0, 7); c.fill(); break;
      case 'light': c.fillStyle = '#333'; c.beginPath(); c.arc(0, 0, h, 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(0, 0, h * 0.7, 0, 7); c.fill(); break;
      case 'diamond': c.beginPath(); c.moveTo(0, -h); c.lineTo(h, 0); c.lineTo(0, h); c.lineTo(-h, 0); c.closePath(); c.fill(); break;
      case 'triangle': case 'triU': c.beginPath(); c.moveTo(0, -h * 0.9); c.lineTo(h, h * 0.8); c.lineTo(-h, h * 0.8); c.closePath(); c.fill(); break;
      case 'triD': c.beginPath(); c.moveTo(0, h * 0.9); c.lineTo(h, -h * 0.8); c.lineTo(-h, -h * 0.8); c.closePath(); c.fill(); break;
      case 'dash': c.fillRect(-h * 0.8, -h * 0.2, h * 1.6, h * 0.4); break;
      case 'flag': c.fillRect(-h * 0.6, -h, h * 0.15, h * 2); c.beginPath(); c.moveTo(-h * 0.45, -h); c.lineTo(h * 0.8, -h * 0.55); c.lineTo(-h * 0.45, -h * 0.1); c.closePath(); c.fill(); break;
      case 'okc': case 'xc': case 'exc': c.beginPath(); c.arc(0, 0, h, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = Math.max(1.4, s / 7); c.beginPath(); if (kind === 'okc') { c.moveTo(-h * 0.45, 0); c.lineTo(-h * 0.1, h * 0.4); c.lineTo(h * 0.5, -h * 0.35); } else if (kind === 'xc') { c.moveTo(-h * 0.4, -h * 0.4); c.lineTo(h * 0.4, h * 0.4); c.moveTo(h * 0.4, -h * 0.4); c.lineTo(-h * 0.4, h * 0.4); } else { c.moveTo(0, -h * 0.5); c.lineTo(0, h * 0.15); c.moveTo(0, h * 0.4); c.lineTo(0, h * 0.5); } c.stroke(); break;
      case 'ok': c.lineWidth = Math.max(1.6, s / 6); c.beginPath(); c.moveTo(-h * 0.7, 0); c.lineTo(-h * 0.15, h * 0.55); c.lineTo(h * 0.75, -h * 0.55); c.stroke(); break;
      case 'x': c.lineWidth = Math.max(1.6, s / 6); c.beginPath(); c.moveTo(-h * 0.6, -h * 0.6); c.lineTo(h * 0.6, h * 0.6); c.moveTo(h * 0.6, -h * 0.6); c.lineTo(-h * 0.6, h * 0.6); c.stroke(); break;
      case 'exc2': c.fillRect(-h * 0.15, -h * 0.85, h * 0.3, h * 1.1); c.fillRect(-h * 0.15, h * 0.5, h * 0.3, h * 0.3); break;
      case 'star0': case 'star1': case 'star2': { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? h * 0.42 : h; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.lineWidth = 1; c.stroke(); if (kind !== 'star0') { c.save(); if (kind === 'star1') { c.beginPath(); c.rect(-h, -h, h, 2 * h); c.clip(); } c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); c.restore(); } break; }
      default: {
        if (/^bars/.test(kind)) { const n = +kind.slice(4); for (let i = 0; i < 4; i++) { c.globalAlpha = i < n ? 1 : 0.25; const bh = h * 0.45 * (i + 1); c.fillRect(-h + i * h * 0.52, h - bh, h * 0.38, bh); } c.globalAlpha = 1; }
        else if (/^q/.test(kind)) { const n = +kind.slice(1); c.lineWidth = 1; c.beginPath(); c.arc(0, 0, h * 0.9, 0, 7); c.stroke(); if (n) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, h * 0.9, -Math.PI / 2, -Math.PI / 2 + n * Math.PI / 2); c.closePath(); c.fill(); } }
        else if (/^box/.test(kind)) { const n = +kind.slice(3); const q = h * 0.9; [[-q, -q], [0.1, -q], [-q, 0.1], [0.1, 0.1]].forEach((p, i) => { c.globalAlpha = i < n ? 1 : 0.2; c.fillRect(p[0], p[1], q * 0.9, q * 0.9); }); c.globalAlpha = 1; }
      }
    }
    c.restore();
  };
  /** liste lisible d'une règle (gestionnaire de règles) */
  CF.describe = function (rule) {
    const ops = { gt: 'supérieure à', lt: 'inférieure à', ge: 'supérieure ou égale à', le: 'inférieure ou égale à', eq: 'égale à', ne: 'différente de', between: 'comprise entre', notBetween: 'non comprise entre' };
    const f = (x) => x == null ? '' : '=' + P.toUser(String(x));
    switch (rule.type) {
      case 'cellIs': return 'Valeur de la cellule ' + ops[rule.op] + ' ' + f(rule.f1) + (rule.f2 != null ? ' et ' + f(rule.f2) : '');
      case 'text': return ({ contains: 'Contient', notContains: 'Ne contient pas', begins: 'Commence par', ends: 'Se termine par' })[rule.op] + ' « ' + rule.text + ' »';
      case 'date': return 'Date : ' + ({ yesterday: 'hier', today: 'aujourd\'hui', tomorrow: 'demain', last7: '7 derniers jours', lastWeek: 'semaine dernière', thisWeek: 'cette semaine', nextWeek: 'semaine prochaine', lastMonth: 'mois dernier', thisMonth: 'ce mois-ci', nextMonth: 'mois prochain', past: 'passée', future: 'à venir' })[rule.period];
      case 'top': return (rule.bottom ? 'Les ' : 'Les ') + (rule.rank || 10) + (rule.pct ? ' % ' : ' ') + (rule.bottom ? 'derniers' : 'premiers');
      case 'avg': return 'Valeurs ' + (rule.above === false ? 'inférieures' : 'supérieures') + (rule.equal ? ' ou égales' : '') + ' à la moyenne';
      case 'dup': return rule.unique ? 'Valeurs uniques' : 'Valeurs en double';
      case 'blank': return 'Cellules vides'; case 'noBlank': return 'Cellules non vides'; case 'err': return 'Erreurs'; case 'noErr': return 'Sans erreur';
      case 'expr': return 'Formule : ' + f(rule.f);
      case 'colorScale': return 'Nuances de ' + rule.pts.length + ' couleurs';
      case 'dataBar': return 'Barre de données';
      case 'iconSet': return 'Jeu d\'icônes : ' + (CF.ICON_NAMES[rule.set] || rule.set);
    }
    return rule.type;
  };

  /* =====================================================================
     Styles de tableau (familles Clair, Moyen, Foncé ; 7 couleurs par famille)
     ===================================================================== */
  const TS = TB.TableStyle = {};
  TS.list = function () {
    const out = [];
    for (let i = 1; i <= 21; i++) out.push({ id: 'TableStyleLight' + i, name: 'Clair ' + i, fam: 'light', k: (i - 1) % 7, v: Math.floor((i - 1) / 7) });
    for (let i = 1; i <= 28; i++) out.push({ id: 'TableStyleMedium' + i, name: 'Moyen ' + i, fam: 'medium', k: (i - 1) % 7, v: Math.floor((i - 1) / 7) });
    for (let i = 1; i <= 11; i++) out.push({ id: 'TableStyleDark' + i, name: 'Foncé ' + i, fam: 'dark', k: i <= 7 ? i - 1 : (i - 8) * 2 + 1, v: i <= 7 ? 0 : 1 });
    return out;
  };
  const ALL = TS.list(); const BY = {}; ALL.forEach((s) => { BY[s.id] = s; });
  TS.colorsOf = function (wb, id) {
    const s = BY[id] || BY.TableStyleMedium2; const t = TB.themeOf(wb).c;
    const acc = s.k === 0 ? (s.fam === 'dark' ? '#404040' : '#000000') : t[3 + s.k];
    return { s, acc, dark: TB.tint(acc, -0.5), mid: TB.tint(acc, 0.4), light: TB.tint(acc, 0.8), light2: TB.tint(acc, s.k === 0 ? 0.85 : 0.6) };
  };
  const B = (c, s) => ({ s: s || 'thin', c });
  TS.cell = function (wb, sh, t, r, c) {
    const id = t.style || 'TableStyleMedium2'; if (id === 'none') return null;
    const C = TS.colorsOf(wb, id), s = C.s;
    const hdr = t.header !== false && r === t.r1, tot = t.totals && r === t.r2;
    const dataR = r - t.r1 - (t.header !== false ? 1 : 0);
    const band = t.bandRows !== false && !hdr && !tot && dataR % 2 === 0;
    const bandC = t.bandCols && !hdr && !tot && (c - t.c1) % 2 === 0;
    const first = t.firstCol && c === t.c1, last = t.lastCol && c === t.c2;
    const o = {};
    if (s.fam === 'light') {
      if (s.v === 0) { if (hdr) { o.b = true; o.bb = B(C.acc); o.bt = B(C.acc); } if (band || bandC) o.bg = C.light; if (tot) { o.b = true; o.bt = B(C.acc, 'double'); } if (r === t.r2) o.bb = B(C.acc); }
      else if (s.v === 1) { if (hdr) { o.bg = C.acc; o.fc = '#FFFFFF'; o.b = true; } else { o.bt = B(C.acc); o.bb = B(C.acc); if (band) o.bg = C.light; } if (c === t.c1) o.bl = B(C.acc); if (c === t.c2) o.br = B(C.acc); if (tot) { o.b = true; o.bt = B(C.acc, 'double'); } }
      else { o.bt = B(C.acc); o.bb = B(C.acc); o.bl = B(C.acc); o.br = B(C.acc); if (hdr) o.b = true; if (band || bandC) o.bg = C.light; if (tot) { o.b = true; o.bt = B(C.acc, 'double'); } }
    } else if (s.fam === 'medium') {
      if (s.v === 0) { if (hdr) { o.bg = C.acc; o.fc = '#FFFFFF'; o.b = true; } else if (band || bandC) o.bg = C.light; if (!hdr) { o.bt = B(C.mid); o.bb = B(C.mid); } if (c === t.c1) o.bl = B(C.mid); if (c === t.c2) o.br = B(C.mid); if (tot) { o.b = true; o.bt = B(C.acc, 'double'); } }
      else if (s.v === 1) { if (hdr) { o.bg = C.acc; o.fc = '#FFFFFF'; o.b = true; } else o.bg = band || bandC ? C.light2 : C.light; o.bt = B('#FFFFFF'); o.bb = B('#FFFFFF'); o.bl = B('#FFFFFF'); o.br = B('#FFFFFF'); if (tot) { o.b = true; o.bg = C.acc; o.fc = '#FFFFFF'; } }
      else if (s.v === 2) { if (hdr) { o.bg = '#000000'; o.fc = '#FFFFFF'; o.b = true; } else o.bg = band || bandC ? C.light2 : C.light; if (tot) { o.b = true; o.bt = B('#000000', 'double'); } }
      else { if (hdr) { o.bg = C.acc; o.fc = '#FFFFFF'; o.b = true; o.bb = B('#000000', 'medium'); } else if (band || bandC) o.bg = C.light; if (tot) { o.b = true; o.bt = B('#000000', 'double'); } }
    } else {
      if (hdr) { o.bg = '#000000'; o.fc = '#FFFFFF'; o.b = true; o.bb = B('#FFFFFF', 'medium'); }
      else if (tot) { o.bg = C.dark; o.fc = '#FFFFFF'; o.b = true; o.bt = B('#FFFFFF', 'double'); }
      else { o.bg = band || bandC ? C.acc : C.dark; o.fc = '#FFFFFF'; }
      if (s.v === 1) { if (!hdr && !tot) { o.bg = band ? C.light2 : C.light; delete o.fc; } }
    }
    if ((first || last) && !hdr) o.b = true;
    return o;
  };
  /** aperçu d'un style de tableau (galerie) */
  TS.previewHtml = function (wb, id) {
    const t = { r1: 0, c1: 0, r2: 4, c2: 4, header: true, bandRows: true, style: id };
    let h = '<span class="tsty">';
    for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) { const o = TS.cell(wb, null, t, r, c) || {}; h += '<i style="background:' + (o.bg || '#fff') + ';border-bottom-color:' + (o.bb ? o.bb.c : o.bt ? o.bt.c : 'transparent') + '"></i>'; }
    return h + '</span>';
  };

  /* =====================================================================
     Sparklines
     ===================================================================== */
  const SP = TB.Spark = {};
  SP.values = function (wb, sh, sp) {
    const g = TB.parseRange(String(sp.src || '').replace(/^.*!/, '')); if (!g) return [];
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!/.exec(sp.src || ''); const s = m ? wb.sheet((m[1] || m[2]).replace(/''/g, "'")) : sh; if (!s) return [];
    const out = []; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const v = s.get(r, c); out.push(typeof v === 'number' ? v : null); }
    return out;
  };
  SP.draw = function (ctx, wb, sh, sp, x, y, w, h, z) {
    const vals = SP.values(wb, sh, sp); const nums = vals.filter((v) => v != null); if (!nums.length) return;
    const pad = 3 * z, X0 = x + pad, Y0 = y + pad, W = w - 2 * pad, H = h - 2 * pad; if (W < 4 || H < 4) return;
    let lo = Math.min(...nums), hi = Math.max(...nums); if (sp.type !== 'line') { lo = Math.min(0, lo); hi = Math.max(0, hi); } if (hi === lo) { hi += 1; lo -= 1; }
    const yOf = (v) => Y0 + H - (v - lo) / (hi - lo) * H;
    const col = sp.color || '#376092', neg = sp.neg || '#D00000';
    const n = vals.length;
    ctx.save();
    if (sp.type === 'line') {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 1.5 * z); ctx.lineJoin = 'round'; ctx.beginPath(); let started = false;
      vals.forEach((v, i) => { if (v == null) { started = false; return; } const px = X0 + (n > 1 ? i / (n - 1) : 0.5) * W, py = yOf(v); if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py); });
      ctx.stroke();
      const mk = (i, c2) => { const v = vals[i]; if (v == null) return; ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(X0 + (n > 1 ? i / (n - 1) : 0.5) * W, yOf(v), 2.2 * z, 0, 7); ctx.fill(); };
      const mx = vals.indexOf(Math.max(...nums)), mn = vals.indexOf(Math.min(...nums));
      if (sp.high) mk(mx, '#2E9E4F'); if (sp.low) mk(mn, neg); if (sp.first) mk(vals.findIndex((v) => v != null), col); if (sp.last) { let k = n - 1; while (k >= 0 && vals[k] == null) k--; mk(k, col); }
    } else {
      const bw = W / n * 0.75, zero = sp.type === 'winloss' ? Y0 + H / 2 : yOf(0);
      vals.forEach((v, i) => { if (v == null) return; const px = X0 + i * W / n + (W / n - bw) / 2; ctx.fillStyle = v < 0 ? neg : col; if (sp.type === 'winloss') { const hh = H / 2 - 1; ctx.fillRect(px, v >= 0 ? zero - hh : zero + 1, bw, v === 0 ? 0 : hh); } else { const py = yOf(v); ctx.fillRect(px, Math.min(py, zero), bw, Math.max(1, Math.abs(zero - py))); } });
    }
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
