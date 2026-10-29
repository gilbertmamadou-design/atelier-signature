/* Tableur — bibliothèque de fonctions (noms anglais canoniques et noms français d'Excel) : mathématiques, statistiques,
   logique, recherche et matrices dynamiques, texte, dates, finances, information, ingénierie, base de données, LAMBDA.
   Écrite pour Tableur d'après le comportement documenté des tableurs (aucune bibliothèque tierce).
   Déclaration : def(EN, FR, options, impl). options.lift = types des arguments pour la diffusion sur matrices
   ('n' nombre, 's' texte, 'b' booléen, 'v' valeur brute, 'r'/'a' plage ou matrice non diffusée). */
(function (G) {
  'use strict';
  const TB = G.Tableur, E = TB.E, Err = TB.Err, Ref = TB.Ref, Ref3 = TB.Ref3, Arr = TB.Arr, MISSING = TB.MISSING;
  const FN = TB.FN = {}, FR = {}, INFO = TB.FN_INFO = {};
  const isE = (v) => v instanceof Err;
  const num = TB.toNum, str = TB.toStr, bool = TB.toBool;
  function def(en, fr, o, f) { o = o || {}; FN[en] = Object.assign({ n: en, fr: fr || null, f }, o); if (fr) FR[fr.toUpperCase()] = en; }
  const alias = (en, base) => { FN[en] = Object.assign({}, FN[base], { n: en, fr: null }); };
  TB.fnCanon = function (name) { const u = String(name).toUpperCase().replace(/^_XLFN\.(_XLWS\.)?/, '').replace(/^_XLWS\./, ''); if (FN[u]) return u; if (FR[u]) return FR[u]; const n = u.normalize('NFD').replace(/[̀-ͯ]/g, ''); if (FR[n]) return FR[n]; return null; };
  TB.fnName = (canon, lang) => lang === 'fr' && FN[canon] && FN[canon].fr ? FN[canon].fr : canon;

  /* ---------------- outils ---------------- */
  /** parcourt toutes les valeurs d'un argument : fn(valeur, depuisPlage) ; renvoie une erreur rencontrée si stopErr */
  function each(v, fn) {
    if (v instanceof Ref) { v.each((x) => fn(x, true)); return; }
    if (v instanceof Ref3) { v.each((x) => fn(x, true)); return; }
    if (v instanceof Arr) { v.each((x) => fn(x, true)); return; }
    if (v === MISSING) return;
    fn(v, false);
  }
  /** nombres d'une liste d'arguments (règles de SOMME) ; mode 'a' : texte = 0, booléens = 1/0 dans les plages */
  function nums(args, mode) {
    const out = []; let err = null;
    for (const a of args) {
      if (err) break;
      each(a, (x, rng) => {
        if (err) return;
        if (typeof x === 'number') out.push(x);
        else if (x instanceof Err) err = x;
        else if (rng) { if (mode === 'a') { if (typeof x === 'boolean') out.push(x ? 1 : 0); else if (typeof x === 'string') out.push(0); } }
        else if (typeof x === 'boolean') out.push(x ? 1 : 0);
        else if (typeof x === 'string') { const n = num(x); if (n instanceof Err) err = n; else out.push(n); }
        else if (x === null) out.push(0);
      });
    }
    return err || out;
  }
  TB.nums = nums;
  const sum = (l) => { let s = 0; for (let i = 0; i < l.length; i++) s += l[i]; return s; };
  const mean = (l) => sum(l) / l.length;
  /** valeurs (2D) d'un argument plage ou matrice */
  function grid(v) {
    if (v instanceof Ref) { const R = v.trimmedFull(); const out = []; for (let i = 0; i < R.h; i++) { const row = new Array(R.w); for (let j = 0; j < R.w; j++) row[j] = R.v(i, j); out.push(row); } return out; }
    if (v instanceof Arr) return v.d;
    if (v instanceof Ref3) return [[E.VALUE]];
    return [[v === MISSING ? null : v]];
  }
  TB.grid = grid;
  /** valeurs à plat (ligne par ligne) */
  function flat(v) { const g = grid(v), out = []; for (const r of g) for (const x of r) out.push(x); return out; }
  const dim = (v) => v instanceof Ref ? [v.trimmedFull().h, v.trimmedFull().w] : v instanceof Arr ? [v.h, v.w] : [1, 1];
  const arr = (d) => new Arr(d.length ? d : [[E.CALC]]);
  const sc = (v) => TB.scalar(v);
  const intN = (v) => { const n = num(v); return isE(n) ? n : Math.trunc(n); };
  const opt = (v, d) => v === undefined || v === MISSING ? d : v;
  const R15 = TB.round15;

  /* ---------------- critères (NB.SI, SOMME.SI…) ---------------- */
  function crit(c) {
    c = sc(c);
    if (c === null || c === MISSING) return (v) => v === null || v === '';
    if (typeof c === 'number') return (v) => typeof v === 'number' ? v === c : typeof v === 'string' && v !== '' && TB.parseNum(v) === c;
    if (typeof c === 'boolean') return (v) => v === c;
    if (c instanceof Err) return (v) => v === c;
    const s = String(c);
    const m = /^(<=|>=|<>|=|<|>)?([\s\S]*)$/.exec(s);
    const op = m[1] || '=', rhs = m[2];
    if (rhs === '') return op === '=' ? (v) => v === null || v === '' : op === '<>' ? (v) => !(v === null || v === '') : () => false;
    let n = TB.parseNum(rhs); if (n == null) { const d = TB.parseDate(rhs); if (d) n = d.v; }
    if (/^(vrai|true|faux|false)$/i.test(rhs)) { const b = /^(vrai|true)$/i.test(rhs); return op === '=' ? (v) => v === b : op === '<>' ? (v) => v !== b : () => false; }
    if (/^#/.test(rhs)) { const e = TB.errOf(TB.ERR_EN[rhs.toUpperCase()] || rhs.toUpperCase()); if (e) return op === '<>' ? (v) => v !== e : (v) => v === e; }
    if (n != null) {
      const t = { '=': (x) => x === n, '<>': (x) => x !== n, '<': (x) => x < n, '>': (x) => x > n, '<=': (x) => x <= n, '>=': (x) => x >= n }[op];
      if (op === '<>') return (v) => typeof v === 'number' ? v !== n : !(typeof v === 'string' && TB.parseNum(v) === n);
      return (v) => typeof v === 'number' ? t(v) : (op === '=' && typeof v === 'string' && TB.parseNum(v) === n);
    }
    if (op === '=' || op === '<>') {
      const wild = TB.hasWild(rhs), re = wild ? TB.wildRe(rhs) : null, low = rhs.toLowerCase();
      const eq = (v) => v !== null && typeof v === 'string' ? (wild ? re.test(v) : v.toLowerCase() === low) : (wild && v === null ? re.test('') : false);
      return op === '=' ? eq : (v) => !eq(v);
    }
    const t = { '<': (x) => x < 0, '>': (x) => x > 0, '<=': (x) => x <= 0, '>=': (x) => x >= 0 }[op];
    return (v) => typeof v === 'string' && t(TB.strCmp(v, rhs));
  }
  TB.crit = crit;
  /** cellules de plages de même taille qui satisfont des paires (plage, critère) → liste des positions [i, j] */
  function ifsMatch(pairs, base) {
    const [H, W] = dim(base);
    const tests = []; for (let k = 0; k < pairs.length; k += 2) { const R = pairs[k]; if (!(R instanceof Ref || R instanceof Arr)) return E.VALUE; const [h, w] = dim(R); if (h !== H && !(R instanceof Ref && R.h === base.h) || w !== W && !(R instanceof Ref && R.w === base.w)) { if (!(R instanceof Ref && base instanceof Ref && R.h === base.h && R.w === base.w)) return E.VALUE; } tests.push([R, crit(pairs[k + 1])]); }
    const out = [];
    for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) { let ok = true; for (const [R, t] of tests) { if (!t(R.v(i, j))) { ok = false; break; } } if (ok) out.push([i, j]); }
    return out;
  }
  function baseOf(v) { return v instanceof Ref ? v.trimmedFull() : v; }

  /* =====================================================================
     Mathématiques
     ===================================================================== */
  def('SUM', 'SOMME', { min: 1, cat: 'math' }, (a) => { const l = nums(a); return isE(l) ? l : sum(l); });
  def('PRODUCT', 'PRODUIT', { min: 1, cat: 'math' }, (a) => { const l = nums(a); return isE(l) ? l : l.reduce((x, y) => x * y, l.length ? 1 : 0); });
  def('SUMSQ', 'SOMME.CARRES', { min: 1, cat: 'math' }, (a) => { const l = nums(a); return isE(l) ? l : l.reduce((x, y) => x + y * y, 0); });
  const R2 = (x, d) => { const k = Math.pow(10, d); return Math.sign(x) * Math.round(R15(Math.abs(x) * k)) / k; };
  def('ROUND', 'ARRONDI', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, d]) => { d = Math.trunc(d); if (d < 0) { const k = Math.pow(10, -d); return Math.sign(x) * Math.round(R15(Math.abs(x) / k)) * k; } return R15(R2(x, d)); });
  def('ROUNDUP', 'ARRONDI.SUP', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, d]) => { d = Math.trunc(d); const k = Math.pow(10, d); return R15(Math.sign(x) * Math.ceil(R15(Math.abs(x) * k)) / k); });
  def('ROUNDDOWN', 'ARRONDI.INF', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, d]) => { d = Math.trunc(d); const k = Math.pow(10, d); return R15(Math.sign(x) * Math.floor(R15(Math.abs(x) * k)) / k); });
  def('MROUND', 'ARRONDI.AU.MULTIPLE', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, m]) => { if (m === 0) return 0; if (x * m < 0) return E.NUM; return R15(Math.round(R15(x / m)) * m); });
  def('CEILING', 'PLAFOND', { min: 1, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, s]) => { s = opt(s, 1); if (s === 0) return 0; if (x > 0 && s < 0) return E.NUM; return R15(Math.ceil(R15(x / s)) * s); });
  def('FLOOR', 'PLANCHER', { min: 1, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, s]) => { s = opt(s, 1); if (s === 0) return x === 0 ? 0 : E.DIV0; if (x > 0 && s < 0) return E.NUM; return R15(Math.floor(R15(x / s)) * s); });
  def('CEILING.MATH', 'PLAFOND.MATH', { min: 1, max: 3, lift: ['n', 'n', 'n'], cat: 'math' }, ([x, s, m]) => { s = Math.abs(opt(s, 1)); if (s === 0) return 0; if (x < 0 && opt(m, 0)) return R15(-Math.ceil(R15(-x / s)) * s); return R15(Math.ceil(R15(x / s)) * s); });
  def('FLOOR.MATH', 'PLANCHER.MATH', { min: 1, max: 3, lift: ['n', 'n', 'n'], cat: 'math' }, ([x, s, m]) => { s = Math.abs(opt(s, 1)); if (s === 0) return 0; if (x < 0 && opt(m, 0)) return R15(-Math.floor(R15(-x / s)) * s); return R15(Math.floor(R15(x / s)) * s); });
  def('CEILING.PRECISE', 'PLAFOND.PRECIS', { min: 1, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, s]) => { s = Math.abs(opt(s, 1)); return s === 0 ? 0 : R15(Math.ceil(R15(x / s)) * s); });
  alias('ISO.CEILING', 'CEILING.PRECISE');
  def('FLOOR.PRECISE', 'PLANCHER.PRECIS', { min: 1, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, s]) => { s = Math.abs(opt(s, 1)); return s === 0 ? 0 : R15(Math.floor(R15(x / s)) * s); });
  def('INT', 'ENT', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => Math.floor(R15(x)));
  def('TRUNC', 'TRONQUE', { min: 1, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, d]) => { d = Math.trunc(opt(d, 0)); const k = Math.pow(10, d); return R15(Math.trunc(R15(x * k)) / k); });
  def('ABS', 'ABS', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => Math.abs(x));
  def('SIGN', 'SIGNE', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => Math.sign(x));
  def('MOD', 'MOD', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([n, d]) => d === 0 ? E.DIV0 : R15(n - d * Math.floor(n / d)));
  def('QUOTIENT', 'QUOTIENT', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([n, d]) => d === 0 ? E.DIV0 : Math.trunc(n / d));
  def('POWER', 'PUISSANCE', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, y]) => { if (x === 0 && y === 0) return E.NUM; if (x === 0 && y < 0) return E.DIV0; const r = Math.pow(x, y); return isFinite(r) && !isNaN(r) ? r : E.NUM; });
  def('SQRT', 'RACINE', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => x < 0 ? E.NUM : Math.sqrt(x));
  def('SQRTPI', 'RACINE.PI', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => x < 0 ? E.NUM : Math.sqrt(x * Math.PI));
  def('EXP', 'EXP', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => { const r = Math.exp(x); return isFinite(r) ? r : E.NUM; });
  def('LN', 'LN', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => x <= 0 ? E.NUM : Math.log(x));
  def('LOG', 'LOG', { min: 1, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, b]) => { b = opt(b, 10); if (x <= 0 || b <= 0) return E.NUM; if (b === 1) return E.DIV0; return R15(Math.log(x) / Math.log(b)); });
  def('LOG10', 'LOG10', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => x <= 0 ? E.NUM : R15(Math.log10(x)));
  def('PI', 'PI', { min: 0, max: 0, cat: 'math' }, () => Math.PI);
  def('EVEN', 'PAIR', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => { const s = Math.sign(x) || 1; let n = Math.ceil(Math.abs(x)); if (n % 2) n++; return s * n; });
  def('ODD', 'IMPAIR', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => { const s = Math.sign(x) || 1; let n = Math.ceil(Math.abs(x)); if (n % 2 === 0) n++; return s * n; });
  const fact = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  def('FACT', 'FACT', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => x < 0 ? E.NUM : fact(Math.floor(x)));
  def('FACTDOUBLE', 'FACTDOUBLE', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => { x = Math.floor(x); if (x < -1) return E.NUM; let r = 1; for (let i = x; i > 1; i -= 2) r *= i; return r; });
  const combin = (n, k) => { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); };
  def('COMBIN', 'COMBIN', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([n, k]) => { n = Math.trunc(n); k = Math.trunc(k); return n < 0 || k < 0 || k > n ? E.NUM : combin(n, k); });
  def('COMBINA', 'COMBINA', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math', x: 1 }, ([n, k]) => { n = Math.trunc(n); k = Math.trunc(k); return n < 0 || k < 0 ? E.NUM : combin(n + k - 1, k); });
  def('PERMUT', 'PERMUTATION', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([n, k]) => { n = Math.trunc(n); k = Math.trunc(k); if (n < 0 || k < 0 || k > n) return E.NUM; let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; });
  def('PERMUTATIONA', 'PERMUTATIONA', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math', x: 1 }, ([n, k]) => Math.pow(Math.trunc(n), Math.trunc(k)));
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a; };
  def('GCD', 'PGCD', { min: 1, cat: 'math' }, (a) => { const l = nums(a); if (isE(l)) return l; if (l.some((x) => x < 0)) return E.NUM; return l.map(Math.trunc).reduce(gcd, 0); });
  def('LCM', 'PPCM', { min: 1, cat: 'math' }, (a) => { const l = nums(a); if (isE(l)) return l; if (l.some((x) => x < 0)) return E.NUM; return l.map(Math.trunc).reduce((x, y) => x && y ? x * y / gcd(x, y) : 0, 1); });
  def('MULTINOMIAL', 'MULTINOMIALE', { min: 1, cat: 'math' }, (a) => { const l = nums(a); if (isE(l)) return l; const s = l.reduce((x, y) => x + Math.trunc(y), 0); return Math.round(fact(s) / l.reduce((x, y) => x * fact(Math.trunc(y)), 1)); });
  def('DEGREES', 'DEGRES', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => x * 180 / Math.PI);
  def('RADIANS', 'RADIANS', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => x * Math.PI / 180);
  [['SIN', 'SIN', Math.sin], ['COS', 'COS', Math.cos], ['TAN', 'TAN', Math.tan], ['ATAN', 'ATAN', Math.atan], ['SINH', 'SINH', Math.sinh], ['COSH', 'COSH', Math.cosh], ['TANH', 'TANH', Math.tanh], ['ASINH', 'ASINH', Math.asinh]].forEach(([en, fr, f]) => def(en, fr, { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => { const r = f(x); return isFinite(r) ? r : E.NUM; }));
  def('ASIN', 'ASIN', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => Math.abs(x) > 1 ? E.NUM : Math.asin(x));
  def('ACOS', 'ACOS', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => Math.abs(x) > 1 ? E.NUM : Math.acos(x));
  def('ACOSH', 'ACOSH', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => x < 1 ? E.NUM : Math.acosh(x));
  def('ATANH', 'ATANH', { min: 1, max: 1, lift: ['n'], cat: 'math' }, ([x]) => Math.abs(x) >= 1 ? E.NUM : Math.atanh(x));
  def('ATAN2', 'ATAN2', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x, y]) => x === 0 && y === 0 ? E.DIV0 : Math.atan2(y, x));
  def('COT', 'COT', { min: 1, max: 1, lift: ['n'], cat: 'math', x: 1 }, ([x]) => x === 0 ? E.DIV0 : 1 / Math.tan(x));
  def('ACOT', 'ACOT', { min: 1, max: 1, lift: ['n'], cat: 'math', x: 1 }, ([x]) => Math.PI / 2 - Math.atan(x));
  def('RAND', 'ALEA', { min: 0, max: 0, cat: 'math' }, () => Math.random());
  def('RANDBETWEEN', 'ALEA.ENTRE.BORNES', { min: 2, max: 2, lift: ['n', 'n'], cat: 'math' }, ([a, b]) => { a = Math.ceil(a); b = Math.floor(b); return a > b ? E.NUM : a + Math.floor(Math.random() * (b - a + 1)); });
  def('RANDARRAY', 'TABLEAU.ALEA', { min: 0, max: 5, cat: 'math', x: 1 }, ([r, c, lo, hi, whole]) => {
    r = intN(opt(sc(r), 1)); c = intN(opt(sc(c), 1)); lo = num(opt(sc(lo), 0)); hi = num(opt(sc(hi), 1)); whole = bool(opt(sc(whole), false));
    for (const x of [r, c, lo, hi, whole]) if (isE(x)) return x; if (r < 1 || c < 1 || hi < lo) return E.VALUE;
    const d = []; for (let i = 0; i < r; i++) { const row = []; for (let j = 0; j < c; j++) row.push(whole ? Math.ceil(lo) + Math.floor(Math.random() * (Math.floor(hi) - Math.ceil(lo) + 1)) : lo + Math.random() * (hi - lo)); d.push(row); } return arr(d);
  });
  def('SEQUENCE', 'SEQUENCE', { min: 1, max: 4, cat: 'lookup', x: 1 }, ([r, c, s, st]) => {
    r = intN(sc(r)); c = intN(opt(sc(c), 1)); s = num(opt(sc(s), 1)); st = num(opt(sc(st), 1));
    for (const x of [r, c, s, st]) if (isE(x)) return x; if (r < 1 || c < 1) return E.CALC; if (r * c > 5e6) return E.NUM;
    const d = []; let v = s; for (let i = 0; i < r; i++) { const row = []; for (let j = 0; j < c; j++) { row.push(R15(v)); v += st; } d.push(row); } return arr(d);
  });
  const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  def('ROMAN', 'ROMAIN', { min: 1, max: 2, lift: ['n', 'n'], cat: 'math' }, ([x]) => { x = Math.trunc(x); if (x < 0 || x > 3999) return E.VALUE; let s = ''; for (const [v, l] of ROMAN) while (x >= v) { s += l; x -= v; } return s; });
  def('ARABIC', 'CHIFFRE.ARABE', { min: 1, max: 1, lift: ['s'], cat: 'math', x: 1 }, ([s]) => { s = s.trim().toUpperCase(); const neg = s[0] === '-'; if (neg) s = s.slice(1); if (!/^[MDCLXVI]*$/.test(s)) return E.VALUE; const V = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 }; let t = 0; for (let i = 0; i < s.length; i++) { const a = V[s[i]], b = V[s[i + 1]] || 0; t += a < b ? -a : a; } return neg ? -t : t; });
  def('BASE', 'BASE', { min: 2, max: 3, lift: ['n', 'n', 'n'], cat: 'math', x: 1 }, ([n, b, l]) => { n = Math.trunc(n); b = Math.trunc(b); if (n < 0 || b < 2 || b > 36) return E.NUM; return n.toString(b).toUpperCase().padStart(Math.trunc(opt(l, 0)), '0'); });
  def('DECIMAL', 'DECIMAL', { min: 2, max: 2, lift: ['s', 'n'], cat: 'math', x: 1 }, ([s, b]) => { b = Math.trunc(b); if (b < 2 || b > 36) return E.NUM; const v = parseInt(s.trim(), b); return isNaN(v) ? E.NUM : v; });
  const SUBF = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP', 12: 'MEDIAN', 13: 'MODE.SNGL', 14: 'LARGE', 15: 'SMALL', 16: 'PERCENTILE.INC', 17: 'QUARTILE.INC', 18: 'PERCENTILE.EXC', 19: 'QUARTILE.EXC' };
  /** plages sans les lignes masquées (et sans les autres SOUS.TOTAL) */
  function visibleOnly(v, hidden, cx, skipErr) {
    if (!(v instanceof Ref)) return v;
    const R = v.trimmedFull(), sh = R.sh, out = [];
    for (let i = 0; i < R.h; i++) {
      const r = R.r1 + i; if (hidden && sh.hidR.has(r)) continue; const row = [];
      for (let j = 0; j < R.w; j++) { const c = R.c1 + j; const f = sh.fml.get(TB.key(r, c)); if (f && /^(SUBTOTAL|AGGREGATE)\(/i.test(f.src)) { row.push(null); continue; } let x = R.v(i, j); if (skipErr && x instanceof Err) x = null; row.push(x); }
      out.push(row);
    }
    // valeurs comme dans une plage (texte ignoré par SOMME)
    const a = new Arr(out.length ? out : [[null]]); return a;
  }
  def('SUBTOTAL', 'SOUS.TOTAL', { min: 2, cat: 'math' }, (a, cx) => {
    let k = intN(sc(a[0])); if (isE(k)) return k; const hid = k > 100; if (hid) k -= 100;
    const f = SUBF[k]; if (!f) return E.VALUE;
    const args = a.slice(1).map((v) => visibleOnly(v, hid, cx));
    return FN[f].f(args, cx);
  });
  def('AGGREGATE', 'AGREGAT', { min: 3, cat: 'math', x: 1 }, (a, cx) => {
    const k = intN(sc(a[0])), o = intN(sc(a[1])); if (isE(k)) return k; if (isE(o)) return o; const f = SUBF[k]; if (!f) return E.VALUE;
    const hid = o === 1 || o === 3 || o === 5 || o === 7, skipErr = o === 2 || o === 3 || o === 6 || o === 7;
    if (k >= 14) { const v = visibleOnly(a[2], hid, cx, skipErr); return FN[f].f([v, a[3]], cx); }
    return FN[f].f(a.slice(2).map((v) => visibleOnly(v, hid, cx, skipErr)), cx);
  });
  def('SUMPRODUCT', 'SOMMEPROD', { min: 1, cat: 'math' }, (a) => {
    const gs = a.map(grid); const H = gs[0].length, W = gs[0][0].length;
    if (gs.some((g) => g.length !== H || g[0].length !== W)) return E.VALUE;
    let s = 0;
    for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) { let p = 1; for (const g of gs) { const x = g[i][j]; if (x instanceof Err) return x; p *= typeof x === 'number' ? x : 0; } s += p; }
    return s;
  });
  const pairs2 = (a, b) => { const x = flat(a), y = flat(b); if (x.length !== y.length) return E.NA; const px = [], py = []; for (let i = 0; i < x.length; i++) { if (x[i] instanceof Err) return x[i]; if (y[i] instanceof Err) return y[i]; if (typeof x[i] === 'number' && typeof y[i] === 'number') { px.push(x[i]); py.push(y[i]); } } return [px, py]; };
  def('SUMX2MY2', 'SOMME.X2MY2', { min: 2, max: 2, cat: 'math' }, ([a, b]) => { const p = pairs2(a, b); if (isE(p)) return p; return p[0].reduce((s, x, i) => s + x * x - p[1][i] * p[1][i], 0); });
  def('SUMX2PY2', 'SOMME.X2PY2', { min: 2, max: 2, cat: 'math' }, ([a, b]) => { const p = pairs2(a, b); if (isE(p)) return p; return p[0].reduce((s, x, i) => s + x * x + p[1][i] * p[1][i], 0); });
  def('SUMXMY2', 'SOMME.XMY2', { min: 2, max: 2, cat: 'math' }, ([a, b]) => { const p = pairs2(a, b); if (isE(p)) return p; return p[0].reduce((s, x, i) => s + (x - p[1][i]) * (x - p[1][i]), 0); });
  // matrices
  const numGrid = (v) => { const g = grid(v); for (const r of g) for (const x of r) { if (x instanceof Err) return x; if (typeof x !== 'number') return E.VALUE; } return g; };
  def('MMULT', 'PRODUITMAT', { min: 2, max: 2, cat: 'math' }, ([a, b]) => { const A = numGrid(a), B = numGrid(b); if (isE(A)) return A; if (isE(B)) return B; if (A[0].length !== B.length) return E.VALUE; const d = A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0))); return arr(d); });
  function det(M) { const n = M.length, A = M.map((r) => r.slice()); let d = 1; for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k; if (A[p][i] === 0) return 0; if (p !== i) { [A[p], A[i]] = [A[i], A[p]]; d = -d; } d *= A[i][i]; for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; } } return d; }
  def('MDETERM', 'DETERMAT', { min: 1, max: 1, cat: 'math' }, ([a]) => { const A = numGrid(a); if (isE(A)) return A; if (A.length !== A[0].length) return E.VALUE; return R15(det(A)); });
  def('MINVERSE', 'INVERSEMAT', { min: 1, max: 1, cat: 'math' }, ([a]) => {
    const A = numGrid(a); if (isE(A)) return A; const n = A.length; if (n !== A[0].length) return E.VALUE;
    const M = A.map((r, i) => r.concat(r.map((_, j) => i === j ? 1 : 0)));
    for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; if (Math.abs(M[p][i]) < 1e-15) return E.NUM; [M[p], M[i]] = [M[i], M[p]]; const d = M[i][i]; for (let j = 0; j < 2 * n; j++) M[i][j] /= d; for (let k = 0; k < n; k++) if (k !== i) { const f = M[k][i]; for (let j = 0; j < 2 * n; j++) M[k][j] -= f * M[i][j]; } }
    return arr(M.map((r) => r.slice(n).map(R15)));
  });
  def('MUNIT', 'MATRICE.UNITAIRE', { min: 1, max: 1, cat: 'math', x: 1 }, ([n]) => { n = intN(sc(n)); if (isE(n)) return n; if (n < 1) return E.VALUE; const d = []; for (let i = 0; i < n; i++) { const r = []; for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0); d.push(r); } return arr(d); });

  /* =====================================================================
     Statistiques
     ===================================================================== */
  def('AVERAGE', 'MOYENNE', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; return l.length ? sum(l) / l.length : E.DIV0; });
  def('AVERAGEA', 'AVERAGEA', { min: 1, cat: 'stat' }, (a) => { const l = nums(a, 'a'); if (isE(l)) return l; return l.length ? sum(l) / l.length : E.DIV0; });
  def('COUNT', 'NB', { min: 1, cat: 'stat' }, (a) => { let n = 0; for (const x of a) each(x, (v, rng) => { if (typeof v === 'number') n++; else if (!rng && (typeof v === 'boolean' || (typeof v === 'string' && TB.parseNum(v) != null))) n++; }); return n; });
  def('COUNTA', 'NBVAL', { min: 1, cat: 'stat' }, (a) => { let n = 0; for (const x of a) { if (x instanceof Ref || x instanceof Ref3 || x instanceof Arr) each(x, (v) => { if (v !== null) n++; }); else if (x !== MISSING) n++; else n++; } return n; });
  def('COUNTBLANK', 'NB.VIDE', { min: 1, max: 1, cat: 'stat' }, ([a]) => { if (!(a instanceof Ref)) return E.VALUE; let n = a.h * a.w; a.each((v) => { if (v !== '') n--; }); return n; });
  def('MAX', 'MAX', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; let m = -Infinity; for (const x of l) if (x > m) m = x; return l.length ? m : 0; });
  def('MIN', 'MIN', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; let m = Infinity; for (const x of l) if (x < m) m = x; return l.length ? m : 0; });
  def('MAXA', 'MAXA', { min: 1, cat: 'stat' }, (a) => { const l = nums(a, 'a'); if (isE(l)) return l; return l.length ? Math.max(...l) : 0; });
  def('MINA', 'MINA', { min: 1, cat: 'stat' }, (a) => { const l = nums(a, 'a'); if (isE(l)) return l; return l.length ? Math.min(...l) : 0; });
  function sumIfLike(range, c, sumRange, kind) {
    const t = crit(c), R = baseOf(range);
    if (!(R instanceof Ref || R instanceof Arr)) return E.VALUE;
    let S = R; if (sumRange && sumRange !== MISSING) { if (sumRange instanceof Ref) S = new Ref(sumRange.sh, sumRange.r1, sumRange.c1, sumRange.r1 + R.h - 1, sumRange.c1 + R.w - 1); else S = sumRange; }
    let s = 0, n = 0; const vals = [];
    for (let i = 0; i < R.h; i++) for (let j = 0; j < R.w; j++) { if (!t(R.v(i, j))) continue; const x = S.v(i, j); if (x instanceof Err) return x; if (typeof x === 'number') { s += x; n++; vals.push(x); } }
    return kind === 'sum' ? s : kind === 'avg' ? (n ? s / n : E.DIV0) : vals;
  }
  def('COUNTIF', 'NB.SI', { min: 2, max: 2, cat: 'stat' }, ([r, c]) => { const R = baseOf(r); if (!(R instanceof Ref || R instanceof Arr)) return E.VALUE; const cv = sc(c); if (cv instanceof Arr || cv instanceof Ref) return E.VALUE; const t = crit(cv); let n = 0; const blankOk = t(null); if (R instanceof Ref && !blankOk) { R.each((v) => { if (t(v)) n++; }); return n; } for (let i = 0; i < R.h; i++) for (let j = 0; j < R.w; j++) if (t(R.v(i, j))) n++; return n; });
  def('SUMIF', 'SOMME.SI', { min: 2, max: 3, cat: 'stat' }, ([r, c, s]) => sumIfLike(r, c, s, 'sum'));
  def('AVERAGEIF', 'MOYENNE.SI', { min: 2, max: 3, cat: 'stat' }, ([r, c, s]) => sumIfLike(r, c, s, 'avg'));
  function ifsAgg(target, pairs, kind) {
    const T = baseOf(target); if (!(T instanceof Ref || T instanceof Arr)) return E.VALUE;
    const P = pairs.map((x, i) => i % 2 === 0 ? (x instanceof Ref ? new Ref(x.sh, x.r1, x.c1, x.r1 + T.h - 1, x.c1 + T.w - 1) : x) : x);
    const m = ifsMatch(P, T); if (isE(m)) return m;
    if (kind === 'count') return m.length;
    const l = []; for (const [i, j] of m) { const x = T.v(i, j); if (x instanceof Err) return x; if (typeof x === 'number') l.push(x); }
    if (kind === 'sum') return sum(l); if (kind === 'avg') return l.length ? sum(l) / l.length : E.DIV0;
    if (kind === 'max') return l.length ? Math.max(...l) : 0; if (kind === 'min') return l.length ? Math.min(...l) : 0;
  }
  def('COUNTIFS', 'NB.SI.ENS', { min: 2, cat: 'stat' }, (a) => a.length % 2 ? E.VALUE : ifsAgg(a[0], a, 'count'));
  def('SUMIFS', 'SOMME.SI.ENS', { min: 3, cat: 'stat' }, (a) => a.length % 2 === 0 ? E.VALUE : ifsAgg(a[0], a.slice(1), 'sum'));
  def('AVERAGEIFS', 'MOYENNE.SI.ENS', { min: 3, cat: 'stat' }, (a) => a.length % 2 === 0 ? E.VALUE : ifsAgg(a[0], a.slice(1), 'avg'));
  def('MAXIFS', 'MAX.SI.ENS', { min: 3, cat: 'stat', x: 1 }, (a) => a.length % 2 === 0 ? E.VALUE : ifsAgg(a[0], a.slice(1), 'max'));
  def('MINIFS', 'MIN.SI.ENS', { min: 3, cat: 'stat', x: 1 }, (a) => a.length % 2 === 0 ? E.VALUE : ifsAgg(a[0], a.slice(1), 'min'));
  const sorted = (a, mode) => { const l = nums(a, mode); if (isE(l)) return l; return l.slice().sort((x, y) => x - y); };
  def('MEDIAN', 'MEDIANE', { min: 1, cat: 'stat' }, (a) => { const l = sorted(a); if (isE(l)) return l; if (!l.length) return E.NUM; const m = l.length >> 1; return l.length % 2 ? l[m] : (l[m - 1] + l[m]) / 2; });
  function modes(a) { const l = nums(a); if (isE(l)) return l; const cnt = new Map(); let best = 1; const order = []; for (const x of l) { const n = (cnt.get(x) || 0) + 1; cnt.set(x, n); if (n === 2) order.push(x); if (n > best) best = n; } if (best < 2) return E.NA; return order.filter((x) => cnt.get(x) === best); }
  def('MODE.SNGL', 'MODE.SIMPLE', { min: 1, cat: 'stat' }, (a) => { const m = modes(a); return isE(m) ? m : m[0]; });
  alias('MODE', 'MODE.SNGL'); FN.MODE.fr = 'MODE'; FR.MODE = 'MODE';
  def('MODE.MULT', 'MODE.MULTIPLE', { min: 1, cat: 'stat' }, (a) => { const m = modes(a); return isE(m) ? m : arr(m.map((x) => [x])); });
  const variance = (l, pop) => { const n = l.length; if (n - (pop ? 0 : 1) <= 0) return E.DIV0; const m = mean(l); let s = 0; for (const x of l) s += (x - m) * (x - m); return s / (n - (pop ? 0 : 1)); };
  [['VAR.S', 'VAR.S', false, null], ['VAR', 'VAR', false, null], ['VAR.P', 'VAR.P.N', true, null], ['VARP', 'VAR.P', true, null], ['VARA', 'VARA', false, 'a'], ['VARPA', 'VARPA', true, 'a']].forEach(([en, fr, pop, mode]) => def(en, fr, { min: 1, cat: 'stat' }, (a) => { const l = nums(a, mode); if (isE(l)) return l; return variance(l, pop); }));
  [['STDEV.S', 'ECARTYPE.STANDARD', false, null], ['STDEV', 'ECARTYPE', false, null], ['STDEV.P', 'ECARTYPE.PEARSON', true, null], ['STDEVP', 'ECARTYPEP', true, null], ['STDEVA', 'STDEVA', false, 'a'], ['STDEVPA', 'STDEVPA', true, 'a']].forEach(([en, fr, pop, mode]) => def(en, fr, { min: 1, cat: 'stat' }, (a) => { const l = nums(a, mode); if (isE(l)) return l; const v = variance(l, pop); return isE(v) ? v : Math.sqrt(v); }));
  def('LARGE', 'GRANDE.VALEUR', { min: 2, max: 2, cat: 'stat' }, ([a, k]) => { const l = sorted([a]); if (isE(l)) return l; return TB.lift1(k, null, (kk) => { kk = num(kk); if (isE(kk)) return kk; kk = Math.ceil(kk); return kk < 1 || kk > l.length ? E.NUM : l[l.length - kk]; }); });
  def('SMALL', 'PETITE.VALEUR', { min: 2, max: 2, cat: 'stat' }, ([a, k]) => { const l = sorted([a]); if (isE(l)) return l; return TB.lift1(k, null, (kk) => { kk = num(kk); if (isE(kk)) return kk; kk = Math.ceil(kk); return kk < 1 || kk > l.length ? E.NUM : l[kk - 1]; }); });
  const rank = (x, ref, order, avg) => { const l = nums([ref]); if (isE(l)) return l; const asc = order && order !== MISSING && num(order) !== 0; let better = 0, eq = 0; for (const v of l) { if (v === x) eq++; else if (asc ? v < x : v > x) better++; } if (!eq) return E.NA; return avg ? better + (eq + 1) / 2 : better + 1; };
  def('RANK.EQ', 'EQUATION.RANG', { min: 2, max: 3, cat: 'stat' }, ([x, r, o]) => TB.lift1(x, null, (v) => { v = num(v); return isE(v) ? v : rank(v, r, sc(opt(o, 0))); }));
  alias('RANK', 'RANK.EQ'); FN.RANK.fr = 'RANG'; FR.RANG = 'RANK';
  def('RANK.AVG', 'MOYENNE.RANG', { min: 2, max: 3, cat: 'stat' }, ([x, r, o]) => TB.lift1(x, null, (v) => { v = num(v); return isE(v) ? v : rank(v, r, sc(opt(o, 0)), true); }));
  const pctInc = (l, p) => { if (!l.length || p < 0 || p > 1) return E.NUM; const h = (l.length - 1) * p, lo = Math.floor(h); return lo + 1 < l.length ? l[lo] + (h - lo) * (l[lo + 1] - l[lo]) : l[lo]; };
  const pctExc = (l, p) => { const n = l.length; if (!n || p <= 0 || p >= 1) return E.NUM; const h = (n + 1) * p - 1; if (h < 0 || h > n - 1) return E.NUM; const lo = Math.floor(h); return lo + 1 < n ? l[lo] + (h - lo) * (l[lo + 1] - l[lo]) : l[lo]; };
  def('PERCENTILE.INC', 'CENTILE.INCLURE', { min: 2, max: 2, cat: 'stat' }, ([a, p]) => { const l = sorted([a]); if (isE(l)) return l; p = num(sc(p)); return isE(p) ? p : pctInc(l, p); });
  alias('PERCENTILE', 'PERCENTILE.INC'); FN.PERCENTILE.fr = 'CENTILE'; FR.CENTILE = 'PERCENTILE';
  def('PERCENTILE.EXC', 'CENTILE.EXCLURE', { min: 2, max: 2, cat: 'stat' }, ([a, p]) => { const l = sorted([a]); if (isE(l)) return l; p = num(sc(p)); return isE(p) ? p : pctExc(l, p); });
  def('QUARTILE.INC', 'QUARTILE.INCLURE', { min: 2, max: 2, cat: 'stat' }, ([a, q]) => { const l = sorted([a]); if (isE(l)) return l; q = intN(sc(q)); if (isE(q)) return q; if (q < 0 || q > 4) return E.NUM; return pctInc(l, q / 4); });
  alias('QUARTILE', 'QUARTILE.INC'); FN.QUARTILE.fr = 'QUARTILE'; FR.QUARTILE = 'QUARTILE';
  def('QUARTILE.EXC', 'QUARTILE.EXCLURE', { min: 2, max: 2, cat: 'stat' }, ([a, q]) => { const l = sorted([a]); if (isE(l)) return l; q = intN(sc(q)); if (isE(q)) return q; if (q <= 0 || q >= 4) return E.NUM; return pctExc(l, q / 4); });
  def('PERCENTRANK.INC', 'RANG.POURCENTAGE.INCLURE', { min: 2, max: 3, cat: 'stat' }, ([a, x, s]) => { const l = sorted([a]); if (isE(l)) return l; x = num(sc(x)); s = intN(opt(sc(s), 3)); if (isE(x)) return x; const n = l.length; if (!n || x < l[0] || x > l[n - 1]) return E.NA; let i = 0; while (i < n - 1 && l[i + 1] <= x) i++; let r; if (l[i] === x) r = l.filter((v) => v < x).length / (n - 1); else r = (i + (x - l[i]) / (l[i + 1] - l[i])) / (n - 1); const k = Math.pow(10, s); return Math.floor(R15(r * k)) / k; });
  alias('PERCENTRANK', 'PERCENTRANK.INC'); FN.PERCENTRANK.fr = 'RANG.POURCENTAGE'; FR['RANG.POURCENTAGE'] = 'PERCENTRANK';
  def('GEOMEAN', 'MOYENNE.GEOMETRIQUE', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; if (!l.length || l.some((x) => x <= 0)) return E.NUM; return Math.exp(l.reduce((s, x) => s + Math.log(x), 0) / l.length); });
  def('HARMEAN', 'MOYENNE.HARMONIQUE', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; if (!l.length || l.some((x) => x <= 0)) return E.NUM; return l.length / l.reduce((s, x) => s + 1 / x, 0); });
  def('TRIMMEAN', 'MOYENNE.REDUITE', { min: 2, max: 2, cat: 'stat' }, ([a, p]) => { const l = sorted([a]); if (isE(l)) return l; p = num(sc(p)); if (isE(p)) return p; if (p < 0 || p >= 1) return E.NUM; const k = Math.floor(l.length * p / 2); const m = l.slice(k, l.length - k); return m.length ? mean(m) : E.NUM; });
  def('DEVSQ', 'SOMME.CARRES.ECARTS', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; const m = mean(l); return l.reduce((s, x) => s + (x - m) * (x - m), 0); });
  def('AVEDEV', 'ECART.MOYEN', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; if (!l.length) return E.NUM; const m = mean(l); return l.reduce((s, x) => s + Math.abs(x - m), 0) / l.length; });
  def('STANDARDIZE', 'CENTREE.REDUITE', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'stat' }, ([x, m, s]) => s <= 0 ? E.NUM : (x - m) / s);
  const xy = (ys, xs) => { const p = pairs2(xs, ys); return p; };
  const linreg = (ys, xs) => { const p = xy(ys, xs); if (isE(p)) return p; const [X, Y] = p; const n = X.length; if (n < 2) return E.DIV0; const mx = mean(X), my = mean(Y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) * (X[i] - mx); syy += (Y[i] - my) * (Y[i] - my); } if (sxx === 0) return E.DIV0; const b = sxy / sxx; return { b, a: my - b * mx, r: syy ? sxy / Math.sqrt(sxx * syy) : E.DIV0, n, sxy, sxx, syy, mx, my }; };
  def('SLOPE', 'PENTE', { min: 2, max: 2, cat: 'stat' }, ([y, x]) => { const L = linreg(y, x); return isE(L) ? L : L.b; });
  def('INTERCEPT', 'ORDONNEE.ORIGINE', { min: 2, max: 2, cat: 'stat' }, ([y, x]) => { const L = linreg(y, x); return isE(L) ? L : L.a; });
  def('CORREL', 'COEFFICIENT.CORRELATION', { min: 2, max: 2, cat: 'stat' }, ([a, b]) => { const L = linreg(a, b); return isE(L) ? L : L.r; });
  alias('PEARSON', 'CORREL'); FN.PEARSON.fr = 'PEARSON'; FR.PEARSON = 'PEARSON';
  def('RSQ', 'COEFFICIENT.DETERMINATION', { min: 2, max: 2, cat: 'stat' }, ([y, x]) => { const L = linreg(y, x); return isE(L) ? L : isE(L.r) ? L.r : L.r * L.r; });
  def('STEYX', 'ERREUR.TYPE.XY', { min: 2, max: 2, cat: 'stat' }, ([y, x]) => { const L = linreg(y, x); if (isE(L)) return L; if (L.n < 3) return E.DIV0; return Math.sqrt((L.syy - L.sxy * L.sxy / L.sxx) / (L.n - 2)); });
  def('FORECAST.LINEAR', 'PREVISION.LINEAIRE', { min: 3, max: 3, cat: 'stat', x: 1 }, ([x, y, xs]) => { const L = linreg(y, xs); if (isE(L)) return L; return TB.lift1(x, null, (v) => { v = num(v); return isE(v) ? v : L.a + L.b * v; }); });
  alias('FORECAST', 'FORECAST.LINEAR'); FN.FORECAST.fr = 'PREVISION'; FN.FORECAST.x = 0; FR.PREVISION = 'FORECAST';
  def('TREND', 'TENDANCE', { min: 1, max: 4, cat: 'stat' }, ([y, x, nx]) => {
    const ys = flat(y).map(num); const xs = x && x !== MISSING ? flat(x).map(num) : ys.map((_, i) => i + 1);
    const L = linreg(new Arr([ys]), new Arr([xs])); if (isE(L)) return L;
    const target = nx && nx !== MISSING ? nx : (x && x !== MISSING ? x : new Arr(xs.map((v) => [v])));
    const [h, w] = dim(target); const g = grid(target); return arr(g.slice(0, h).map((r) => r.slice(0, w).map((v) => { v = num(v); return isE(v) ? v : L.a + L.b * v; })));
  });
  def('GROWTH', 'CROISSANCE', { min: 1, max: 4, cat: 'stat' }, ([y, x, nx]) => {
    const ys = flat(y).map(num); if (ys.some((v) => isE(v) || v <= 0)) return E.NUM; const xs = x && x !== MISSING ? flat(x).map(num) : ys.map((_, i) => i + 1);
    const L = linreg(new Arr([ys.map(Math.log)]), new Arr([xs])); if (isE(L)) return L;
    const target = nx && nx !== MISSING ? nx : (x && x !== MISSING ? x : new Arr(xs.map((v) => [v])));
    return arr(grid(target).map((r) => r.map((v) => { v = num(v); return isE(v) ? v : Math.exp(L.a + L.b * v); })));
  });
  def('LINEST', 'DROITEREG', { min: 1, max: 4, cat: 'stat' }, ([y, x, cst]) => {
    const ys = flat(y).map(num), xs = x && x !== MISSING ? flat(x).map(num) : ys.map((_, i) => i + 1);
    if (cst !== undefined && cst !== MISSING && !bool(sc(cst))) { let sxy = 0, sxx = 0; xs.forEach((v, i) => { sxy += v * ys[i]; sxx += v * v; }); return arr([[sxy / sxx, 0]]); }
    const L = linreg(new Arr([ys]), new Arr([xs])); if (isE(L)) return L; return arr([[L.b, L.a]]);
  });
  def('COVARIANCE.P', 'COVARIANCE.PEARSON', { min: 2, max: 2, cat: 'stat', x: 1 }, ([a, b]) => { const L = linreg(a, b); return isE(L) ? L : L.sxy / L.n; });
  alias('COVAR', 'COVARIANCE.P'); FN.COVAR.fr = 'COVARIANCE'; FN.COVAR.x = 0; FR.COVARIANCE = 'COVAR';
  def('COVARIANCE.S', 'COVARIANCE.STANDARD', { min: 2, max: 2, cat: 'stat', x: 1 }, ([a, b]) => { const L = linreg(a, b); return isE(L) ? L : L.sxy / (L.n - 1); });
  def('FREQUENCY', 'FREQUENCE', { min: 2, max: 2, cat: 'stat' }, ([d, b]) => { const l = nums([d]); if (isE(l)) return l; const bins = nums([b]); if (isE(bins)) return bins; const sb = bins.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const out = new Array(bins.length + 1).fill(0); for (const v of l) { let k = sb.findIndex((x) => v <= x[0]); out[k < 0 ? bins.length : sb[k][1]]++; } return arr(out.map((x) => [x])); });
  def('SKEW', 'COEFFICIENT.ASYMETRIE', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; const n = l.length; if (n < 3) return E.DIV0; const m = mean(l), s = Math.sqrt(variance(l)); if (!s) return E.DIV0; return n / ((n - 1) * (n - 2)) * l.reduce((t, x) => t + Math.pow((x - m) / s, 3), 0); });
  def('KURT', 'KURTOSIS', { min: 1, cat: 'stat' }, (a) => { const l = nums(a); if (isE(l)) return l; const n = l.length; if (n < 4) return E.DIV0; const m = mean(l), s = Math.sqrt(variance(l)); if (!s) return E.DIV0; const k = l.reduce((t, x) => t + Math.pow((x - m) / s, 4), 0); return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * k - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3)); });
  // lois
  const erf = (x) => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.5 * x); const y = 1 - t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return s * y; };
  const ncdf = (z) => { // précision ~1e-15 (Cody / Hart)
    const a = Math.abs(z); let p;
    if (a > 37) p = 0; else { const e = Math.exp(-a * a / 2); if (a < 7.07106781186547) { let n = 0.0352624965998911 * a + 0.700383064443688; n = n * a + 6.37396220353165; n = n * a + 33.912866078383; n = n * a + 112.079291497871; n = n * a + 221.213596169931; n = n * a + 220.206867912376; let d = 0.0883883476483184 * a + 1.75566716318264; d = d * a + 16.064177579207; d = d * a + 86.7807322029461; d = d * a + 296.564248779674; d = d * a + 637.333633378831; d = d * a + 793.826512519948; d = d * a + 440.413735824752; p = e * n / d; } else { let d = a + 0.65; d = a + 4 / d; d = a + 3 / d; d = a + 2 / d; d = a + 1 / d; p = e / d / 2.506628274631; } }
    return z > 0 ? 1 - p : p;
  };
  void erf;
  const npdf = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const ninv = (p) => { // Acklam + une itération de Newton
    if (p <= 0 || p >= 1) return NaN;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00], b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01], c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00], d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    let x; const pl = 0.02425;
    if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const e = ncdf(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); return x - u / (1 + x * u / 2);
  };
  def('NORM.DIST', 'LOI.NORMALE.N', { min: 4, max: 4, lift: ['n', 'n', 'n', 'b'], cat: 'stat', x: 1 }, ([x, m, s, c]) => s <= 0 ? E.NUM : c ? ncdf((x - m) / s) : npdf((x - m) / s) / s);
  alias('NORMDIST', 'NORM.DIST'); FN.NORMDIST.fr = 'LOI.NORMALE'; FN.NORMDIST.x = 0; FR['LOI.NORMALE'] = 'NORMDIST';
  def('NORM.INV', 'LOI.NORMALE.INVERSE.N', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'stat', x: 1 }, ([p, m, s]) => p <= 0 || p >= 1 || s <= 0 ? E.NUM : m + s * ninv(p));
  alias('NORMINV', 'NORM.INV'); FN.NORMINV.fr = 'LOI.NORMALE.INVERSE'; FN.NORMINV.x = 0; FR['LOI.NORMALE.INVERSE'] = 'NORMINV';
  def('NORM.S.DIST', 'LOI.NORMALE.STANDARD.N', { min: 2, max: 2, lift: ['n', 'b'], cat: 'stat', x: 1 }, ([z, c]) => c ? ncdf(z) : npdf(z));
  def('NORMSDIST', 'LOI.NORMALE.STANDARD', { min: 1, max: 1, lift: ['n'], cat: 'stat' }, ([z]) => ncdf(z));
  def('NORM.S.INV', 'LOI.NORMALE.STANDARD.INVERSE.N', { min: 1, max: 1, lift: ['n'], cat: 'stat', x: 1 }, ([p]) => p <= 0 || p >= 1 ? E.NUM : ninv(p));
  alias('NORMSINV', 'NORM.S.INV'); FN.NORMSINV.fr = 'LOI.NORMALE.STANDARD.INVERSE'; FN.NORMSINV.x = 0; FR['LOI.NORMALE.STANDARD.INVERSE'] = 'NORMSINV';
  def('BINOM.DIST', 'LOI.BINOMIALE.N', { min: 4, max: 4, lift: ['n', 'n', 'n', 'b'], cat: 'stat', x: 1 }, ([k, n, p, c]) => { k = Math.trunc(k); n = Math.trunc(n); if (k < 0 || k > n || p < 0 || p > 1) return E.NUM; const pmf = (i) => combin(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i); if (!c) return pmf(k); let s = 0; for (let i = 0; i <= k; i++) s += pmf(i); return s; });
  alias('BINOMDIST', 'BINOM.DIST'); FN.BINOMDIST.fr = 'LOI.BINOMIALE'; FN.BINOMDIST.x = 0; FR['LOI.BINOMIALE'] = 'BINOMDIST';
  def('POISSON.DIST', 'LOI.POISSON.N', { min: 3, max: 3, lift: ['n', 'n', 'b'], cat: 'stat', x: 1 }, ([k, l, c]) => { k = Math.trunc(k); if (k < 0 || l < 0) return E.NUM; const pmf = (i) => Math.exp(-l + i * Math.log(l || 1e-300) - lgamma(i + 1)); if (!c) return l === 0 ? (k === 0 ? 1 : 0) : pmf(k); let s = 0; for (let i = 0; i <= k; i++) s += l === 0 ? (i === 0 ? 1 : 0) : pmf(i); return s; });
  alias('POISSON', 'POISSON.DIST'); FN.POISSON.fr = 'LOI.POISSON'; FN.POISSON.x = 0; FR['LOI.POISSON'] = 'POISSON';
  def('EXPON.DIST', 'LOI.EXPONENTIELLE.N', { min: 3, max: 3, lift: ['n', 'n', 'b'], cat: 'stat', x: 1 }, ([x, l, c]) => x < 0 || l <= 0 ? E.NUM : c ? 1 - Math.exp(-l * x) : l * Math.exp(-l * x));
  function lgamma(x) { const g = 7, C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61503916999185, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x); x -= 1; let a = C[0]; const t = x + g + 0.5; for (let i = 1; i < 9; i++) a += C[i] / (x + i); return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a); }
  def('GAMMALN', 'LNGAMMA', { min: 1, max: 1, lift: ['n'], cat: 'stat' }, ([x]) => x <= 0 ? E.NUM : lgamma(x));
  alias('GAMMALN.PRECISE', 'GAMMALN'); FN['GAMMALN.PRECISE'].fr = 'LNGAMMA.PRECIS'; FN['GAMMALN.PRECISE'].x = 1; FR['LNGAMMA.PRECIS'] = 'GAMMALN.PRECISE';
  def('GAMMA', 'GAMMA', { min: 1, max: 1, lift: ['n'], cat: 'stat', x: 1 }, ([x]) => { if (x <= 0 && Number.isInteger(x)) return E.NUM; const s = x < 0 && Math.floor(-x) % 2 === 0 ? -1 : 1; return s * Math.exp(lgamma(x)); });
  // fonction bêta incomplète régularisée (lois de Student, F) et gamma incomplète (khi-deux)
  function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let h = d; for (let m = 1; m <= 300; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-16) break; } return h; }
  function ibeta(x, a, b) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  function igamma(a, x) { if (x <= 0) return 0; if (x < a + 1) { let ap = a, s = 1 / a, d = s; for (let n = 0; n < 500; n++) { ap++; d *= x / ap; s += d; if (Math.abs(d) < Math.abs(s) * 1e-16) break; } return s * Math.exp(-x + a * Math.log(x) - lgamma(a)); } let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break; } return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h; }
  const tcdf = (t, df) => { const x = df / (df + t * t); const p = 0.5 * ibeta(x, df / 2, 0.5); return t >= 0 ? 1 - p : p; };
  const tpdf = (t, df) => Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2)) / Math.sqrt(df * Math.PI) * Math.pow(1 + t * t / df, -(df + 1) / 2);
  const inv = (cdf, p, lo, hi) => { for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (cdf(m) < p) lo = m; else hi = m; if (hi - lo < 1e-13 * Math.max(1, Math.abs(m))) break; } return (lo + hi) / 2; };
  def('T.DIST', 'LOI.STUDENT.N', { min: 3, max: 3, lift: ['n', 'n', 'b'], cat: 'stat', x: 1 }, ([t, df, c]) => { df = Math.trunc(df); if (df < 1) return E.NUM; return c ? tcdf(t, df) : tpdf(t, df); });
  def('T.DIST.2T', 'LOI.STUDENT.BILATERALE', { min: 2, max: 2, lift: ['n', 'n'], cat: 'stat', x: 1 }, ([t, df]) => { df = Math.trunc(df); if (df < 1 || t < 0) return E.NUM; return 2 * (1 - tcdf(t, df)); });
  def('T.DIST.RT', 'LOI.STUDENT.DROITE', { min: 2, max: 2, lift: ['n', 'n'], cat: 'stat', x: 1 }, ([t, df]) => { df = Math.trunc(df); if (df < 1) return E.NUM; return 1 - tcdf(t, df); });
  def('T.INV', 'LOI.STUDENT.INVERSE.N', { min: 2, max: 2, lift: ['n', 'n'], cat: 'stat', x: 1 }, ([p, df]) => { df = Math.trunc(df); if (p <= 0 || p >= 1 || df < 1) return E.NUM; return inv((t) => tcdf(t, df), p, -1e6, 1e6); });
  def('T.INV.2T', 'LOI.STUDENT.INVERSE.BILATERALE', { min: 2, max: 2, lift: ['n', 'n'], cat: 'stat', x: 1 }, ([p, df]) => { df = Math.trunc(df); if (p <= 0 || p > 1 || df < 1) return E.NUM; return inv((t) => tcdf(t, df), 1 - p / 2, 0, 1e6); });
  alias('TINV', 'T.INV.2T'); FN.TINV.fr = 'LOI.STUDENT.INVERSE'; FN.TINV.x = 0; FR['LOI.STUDENT.INVERSE'] = 'TINV';
  def('CHISQ.DIST', 'LOI.KHIDEUX.N', { min: 3, max: 3, lift: ['n', 'n', 'b'], cat: 'stat', x: 1 }, ([x, df, c]) => { df = Math.trunc(df); if (x < 0 || df < 1) return E.NUM; return c ? igamma(df / 2, x / 2) : Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.log(2) - lgamma(df / 2)); });
  def('CHISQ.DIST.RT', 'LOI.KHIDEUX.DROITE', { min: 2, max: 2, lift: ['n', 'n'], cat: 'stat', x: 1 }, ([x, df]) => { df = Math.trunc(df); if (x < 0 || df < 1) return E.NUM; return 1 - igamma(df / 2, x / 2); });
  def('CHISQ.INV', 'LOI.KHIDEUX.INVERSE', { min: 2, max: 2, lift: ['n', 'n'], cat: 'stat', x: 1 }, ([p, df]) => { df = Math.trunc(df); if (p < 0 || p >= 1 || df < 1) return E.NUM; return inv((x) => igamma(df / 2, x / 2), p, 0, 1e5); });
  def('CHISQ.INV.RT', 'LOI.KHIDEUX.INVERSE.DROITE', { min: 2, max: 2, lift: ['n', 'n'], cat: 'stat', x: 1 }, ([p, df]) => { df = Math.trunc(df); if (p <= 0 || p > 1 || df < 1) return E.NUM; return inv((x) => igamma(df / 2, x / 2), 1 - p, 0, 1e5); });
  def('CONFIDENCE.NORM', 'INTERVALLE.CONFIANCE.NORMAL', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'stat', x: 1 }, ([a, s, n]) => a <= 0 || a >= 1 || s <= 0 || n < 1 ? E.NUM : -ninv(a / 2) * s / Math.sqrt(Math.trunc(n)));
  alias('CONFIDENCE', 'CONFIDENCE.NORM'); FN.CONFIDENCE.fr = 'INTERVALLE.CONFIANCE'; FN.CONFIDENCE.x = 0; FR['INTERVALLE.CONFIANCE'] = 'CONFIDENCE';
  def('CONFIDENCE.T', 'INTERVALLE.CONFIANCE.STUDENT', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'stat', x: 1 }, ([a, s, n]) => { n = Math.trunc(n); if (a <= 0 || a >= 1 || s <= 0 || n < 2) return E.NUM; return inv((t) => tcdf(t, n - 1), 1 - a / 2, 0, 1e6) * s / Math.sqrt(n); });

  /* =====================================================================
     Logique
     ===================================================================== */
  const lz = (n, cx, ev) => ev(n, cx);
  def('IF', 'SI', { min: 1, max: 3, lazy: true, cat: 'logic' }, (a, cx, ev) => {
    const c = ev(a[0], cx);
    if ((c instanceof Ref || c instanceof Arr) && !(c.h === 1 && c.w === 1)) {
      const t = a[1] ? ev(a[1], cx) : true, f = a[2] ? ev(a[2], cx) : false;
      return TB.binopIf(c, t, f);
    }
    const b = bool(sc(c)); if (isE(b)) return b;
    if (b) return a.length > 1 ? (a[1].t === 'miss' ? 0 : lz(a[1], cx, ev)) : true;
    return a.length > 2 ? (a[2].t === 'miss' ? 0 : lz(a[2], cx, ev)) : false;
  });
  TB.binopIf = function (c, t, f) {
    const C = c instanceof Ref ? c.trimmedFull() : c; const out = [];
    for (let i = 0; i < C.h; i++) { const row = []; for (let j = 0; j < C.w; j++) { const b = bool(C.v(i, j)); row.push(isE(b) ? b : TB.at(b ? t : f, i, j)); } out.push(row); }
    return new Arr(out);
  };
  def('IFS', 'SI.CONDITIONS', { min: 2, lazy: true, cat: 'logic', x: 1 }, (a, cx, ev) => { if (a.length % 2) return E.VALUE; for (let i = 0; i < a.length; i += 2) { const b = bool(sc(ev(a[i], cx))); if (isE(b)) return b; if (b) return ev(a[i + 1], cx); } return E.NA; });
  def('IFERROR', 'SIERREUR', { min: 2, max: 2, lazy: true, cat: 'logic' }, (a, cx, ev) => { const v = ev(a[0], cx); if (v instanceof Arr || (v instanceof Ref && !v.single())) { const fb = ev(a[1], cx); return TB.lift1(v, cx, (x) => x instanceof Err ? sc(fb) : x); } const s = sc(v); return s instanceof Err ? ev(a[1], cx) : v; });
  def('IFNA', 'SI.NON.DISP', { min: 2, max: 2, lazy: true, cat: 'logic', x: 1 }, (a, cx, ev) => { const v = ev(a[0], cx); if (v instanceof Arr || (v instanceof Ref && !v.single())) { const fb = ev(a[1], cx); return TB.lift1(v, cx, (x) => x === E.NA ? sc(fb) : x); } return sc(v) === E.NA ? ev(a[1], cx) : v; });
  const bools = (a) => { const l = []; for (const x of a) { let e = null; each(x, (v, rng) => { if (e) return; if (typeof v === 'boolean') l.push(v); else if (typeof v === 'number') l.push(v !== 0); else if (v instanceof Err) e = v; else if (!rng && typeof v === 'string') { const b = bool(v); if (isE(b)) e = b; else l.push(b); } }); if (e) return e; } return l.length ? l : E.VALUE; };
  def('AND', 'ET', { min: 1, cat: 'logic' }, (a) => { const l = bools(a); return isE(l) ? l : l.every(Boolean); });
  def('OR', 'OU', { min: 1, cat: 'logic' }, (a) => { const l = bools(a); return isE(l) ? l : l.some(Boolean); });
  def('XOR', 'OUX', { min: 1, cat: 'logic', x: 1 }, (a) => { const l = bools(a); return isE(l) ? l : l.filter(Boolean).length % 2 === 1; });
  def('NOT', 'NON', { min: 1, max: 1, lift: ['b'], cat: 'logic' }, ([b]) => !b);
  def('TRUE', 'VRAI', { min: 0, max: 0, cat: 'logic' }, () => true);
  def('FALSE', 'FAUX', { min: 0, max: 0, cat: 'logic' }, () => false);
  def('SWITCH', 'SI.MULTIPLE', { min: 3, lazy: true, cat: 'logic', x: 1 }, (a, cx, ev) => { const v = sc(ev(a[0], cx)); if (isE(v)) return v; let i = 1; for (; i + 1 < a.length; i += 2) { const k = sc(ev(a[i], cx)); if (TB.compare(v, k) === 0 && typeof v === typeof k) return ev(a[i + 1], cx); } return i < a.length ? ev(a[i], cx) : E.NA; });
  def('LET', 'LET', { min: 3, lazy: true, cat: 'logic', x: 1 }, (a, cx, ev) => { if (a.length % 2 === 0) return E.VALUE; const vars = new Map(); const sub = Object.assign({}, cx, { env: { vars, up: cx.env } }); for (let i = 0; i < a.length - 1; i += 2) { if (a[i].t !== 'name') return E.VALUE; vars.set(a[i].n.toUpperCase(), ev(a[i + 1], sub)); } return ev(a[a.length - 1], sub); });
  def('LAMBDA', 'LAMBDA', { min: 1, lazy: true, cat: 'logic', x: 1 }, (a, cx) => { const p = []; for (let i = 0; i < a.length - 1; i++) { if (a[i].t !== 'name') return E.VALUE; p.push(a[i].n.toUpperCase()); } return new TB.Lambda(p, a[a.length - 1], cx.env); });
  const lam = (v) => v instanceof TB.Lambda ? v : null;
  def('MAP', 'MAP', { min: 2, cat: 'logic', x: 1 }, (a, cx) => { const f = lam(a[a.length - 1]); if (!f) return E.VALUE; const gs = a.slice(0, -1).map(grid); const H = gs[0].length, W = gs[0][0].length; const out = []; for (let i = 0; i < H; i++) { const r = []; for (let j = 0; j < W; j++) r.push(sc(TB.applyLambda(f, gs.map((g) => (g[i] || [])[j] === undefined ? E.NA : g[i][j]), cx))); out.push(r); } return arr(out); });
  def('REDUCE', 'REDUCE', { min: 3, max: 3, cat: 'logic', x: 1 }, ([init, a, fn], cx) => { const f = lam(fn); if (!f) return E.VALUE; let acc = init === MISSING ? 0 : sc(init); for (const x of flat(a)) acc = sc(TB.applyLambda(f, [acc, x], cx)); return acc; });
  def('SCAN', 'SCAN', { min: 3, max: 3, cat: 'logic', x: 1 }, ([init, a, fn], cx) => { const f = lam(fn); if (!f) return E.VALUE; let acc = init === MISSING ? 0 : sc(init); return arr(grid(a).map((r) => r.map((x) => (acc = sc(TB.applyLambda(f, [acc, x], cx)))))); });
  def('BYROW', 'BYROW', { min: 2, max: 2, cat: 'logic', x: 1 }, ([a, fn], cx) => { const f = lam(fn); if (!f) return E.VALUE; return arr(grid(a).map((r) => [sc(TB.applyLambda(f, [new Arr([r])], cx))])); });
  def('BYCOL', 'BYCOL', { min: 2, max: 2, cat: 'logic', x: 1 }, ([a, fn], cx) => { const f = lam(fn); if (!f) return E.VALUE; const g = grid(a); return arr([g[0].map((_, j) => sc(TB.applyLambda(f, [new Arr(g.map((r) => [r[j]]))], cx)))]); });
  def('MAKEARRAY', 'MAKEARRAY', { min: 3, max: 3, cat: 'logic', x: 1 }, ([r, c, fn], cx) => { const f = lam(fn); r = intN(sc(r)); c = intN(sc(c)); if (!f || isE(r) || isE(c) || r < 1 || c < 1) return E.VALUE; const out = []; for (let i = 1; i <= r; i++) { const row = []; for (let j = 1; j <= c; j++) row.push(sc(TB.applyLambda(f, [i, j], cx))); out.push(row); } return arr(out); });
  def('ISOMITTED', 'ESTOMIS', { min: 1, max: 1, cat: 'info', x: 1 }, ([v]) => v === MISSING);

  /* =====================================================================
     Recherche et matrices
     ===================================================================== */
  /** égalité de recherche exacte (texte sans casse, jokers si wild) */
  const eqLook = (a, b, wild) => { if (typeof a === 'string' && typeof b === 'string') { if (wild && TB.hasWild(a)) return TB.wildRe(a).test(b); return a.toLowerCase() === b.toLowerCase(); } if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) < 1e-12 * Math.max(1, Math.abs(a)); return a === b; };
  /** recherche approximative (plus grande valeur ≤ x, données triées croissantes), à la façon d'une dichotomie */
  function approx(list, x, desc) {
    let lo = 0, hi = list.length - 1, best = -1;
    const t = typeof x;
    while (lo <= hi) {
      const m = (lo + hi) >> 1; let v = list[m];
      // valeurs d'un autre type : on cherche une voisine du bon type
      let k = m; while (k >= lo && (v === null || typeof v !== t)) { k--; v = list[k]; }
      if (k < lo) { lo = m + 1; continue; }
      const c = TB.compare(v, x);
      if (desc ? c >= 0 : c <= 0) { best = k; lo = m + 1; } else hi = k - 1;
    }
    return best;
  }
  function vec(v) { // liste de valeurs d'une plage d'une ligne ou d'une colonne
    if (v instanceof Ref) { const R = v.trimmedFull(); const l = []; if (R.h === 1) for (let j = 0; j < R.w; j++) l.push(R.v(0, j)); else for (let i = 0; i < R.h; i++) l.push(R.v(i, 0)); return l; }
    if (v instanceof Arr) { if (v.h === 1) return v.d[0].slice(); return v.d.map((r) => r[0]); }
    return [sc(v)];
  }
  def('VLOOKUP', 'RECHERCHEV', { min: 3, max: 4, cat: 'lookup' }, ([x, t, col, mode], cx) => {
    const T = baseOf(t); if (!(T instanceof Ref || T instanceof Arr)) return E.VALUE;
    const exact = mode !== undefined && mode !== MISSING && !bool(sc(mode));
    const ci = intN(sc(col)); if (isE(ci)) return ci; if (ci < 1) return E.VALUE; if (ci > T.w) return E.REF;
    const first = []; for (let i = 0; i < T.h; i++) first.push(T.v(i, 0));
    return TB.lift1(x, cx, (xv) => { if (xv instanceof Err) return xv; if (xv === null) xv = exact ? '' : 0; let k = -1; if (exact) { for (let i = 0; i < first.length; i++) if (eqLook(xv, first[i], true)) { k = i; break; } } else k = approx(first, xv); if (k < 0) return E.NA; const r = T.v(k, ci - 1); return r === null ? 0 : r; });
  });
  def('HLOOKUP', 'RECHERCHEH', { min: 3, max: 4, cat: 'lookup' }, ([x, t, row, mode], cx) => {
    const T = baseOf(t); if (!(T instanceof Ref || T instanceof Arr)) return E.VALUE;
    const exact = mode !== undefined && mode !== MISSING && !bool(sc(mode));
    const ri = intN(sc(row)); if (isE(ri)) return ri; if (ri < 1) return E.VALUE; if (ri > T.h) return E.REF;
    const first = []; for (let j = 0; j < T.w; j++) first.push(T.v(0, j));
    return TB.lift1(x, cx, (xv) => { if (xv instanceof Err) return xv; let k = -1; if (exact) { for (let j = 0; j < first.length; j++) if (eqLook(xv, first[j], true)) { k = j; break; } } else k = approx(first, xv); if (k < 0) return E.NA; const r = T.v(ri - 1, k); return r === null ? 0 : r; });
  });
  def('LOOKUP', 'RECHERCHE', { min: 2, max: 3, cat: 'lookup' }, ([x, a, b], cx) => {
    let A = baseOf(a), look, res;
    if (b !== undefined && b !== MISSING) { look = vec(A); res = baseOf(b); }
    else { const [h, w] = dim(A); if (w > h) { look = []; for (let j = 0; j < A.w; j++) look.push(A.v(0, j)); res = { pick: (k) => A.v(A.h - 1, k) }; } else { look = []; for (let i = 0; i < A.h; i++) look.push(A.v(i, 0)); res = { pick: (k) => A.v(k, A.w - 1) }; } }
    return TB.lift1(x, cx, (xv) => { const k = approx(look, xv); if (k < 0) return E.NA; if (res.pick) return res.pick(k); const rv = vec(res); return k < rv.length ? rv[k] : E.NA; });
  });
  function matchIn(list, x, type) {
    if (type === 0) { for (let i = 0; i < list.length; i++) if (eqLook(x, list[i], true)) return i; return -1; }
    if (type > 0) return approx(list, x);
    // décroissant : plus petite valeur ≥ x
    let best = -1; for (let i = 0; i < list.length; i++) { const v = list[i]; if (v === null) continue; if (TB.compare(v, x) >= 0) best = i; else break; } return best;
  }
  def('MATCH', 'EQUIV', { min: 2, max: 3, cat: 'lookup' }, ([x, a, t], cx) => {
    const l = vec(a); let ty = t === undefined || t === MISSING ? 1 : num(sc(t)); if (isE(ty)) return ty; ty = Math.sign(ty);
    return TB.lift1(x, cx, (xv) => { if (xv instanceof Err) return xv; const k = matchIn(l, xv === null ? 0 : xv, ty); return k < 0 ? E.NA : k + 1; });
  });
  function xfind(l, x, mm, sm) {
    // mm : 0 exact, -1 exact ou inférieur, 1 exact ou supérieur, 2 jokers ; sm : 1, -1, 2 (dichotomie croissante), -2
    if (sm === 2 || sm === -2) { const asc = sm === 2; let lo = 0, hi = l.length - 1, best = -1; while (lo <= hi) { const m = (lo + hi) >> 1; const c = TB.compare(l[m], x); if (c === 0) return m; if ((c < 0) === asc) { if (mm === -1 && asc || mm === 1 && !asc) best = m; lo = m + 1; } else { if (mm === 1 && asc || mm === -1 && !asc) best = m; hi = m - 1; } } return mm ? best : -1; }
    const idx = []; for (let i = 0; i < l.length; i++) idx.push(i); if (sm === -1) idx.reverse();
    let best = -1, bv = null;
    for (const i of idx) {
      const v = l[i];
      if (mm === 2 ? eqLook(x, v, true) : eqLook(x, v, false)) return i;
      if (mm === -1 || mm === 1) { if (v === null || typeof v !== typeof x) continue; const c = TB.compare(v, x); if ((mm === -1 && c < 0 && (best < 0 || TB.compare(v, bv) > 0)) || (mm === 1 && c > 0 && (best < 0 || TB.compare(v, bv) < 0))) { best = i; bv = v; } }
    }
    return best;
  }
  def('XLOOKUP', 'RECHERCHEX', { min: 3, max: 6, cat: 'lookup', x: 1 }, ([x, la, ra, nf, mm, sm], cx) => {
    const l = vec(la); const R = baseOf(ra); if (!(R instanceof Ref || R instanceof Arr)) return E.VALUE;
    const horiz = la instanceof Ref ? la.trimmedFull().h === 1 && la.w > 1 : la instanceof Arr && la.h === 1 && la.w > 1;
    mm = intN(opt(sc(mm), 0)); sm = intN(opt(sc(sm), 1)); if (isE(mm)) return mm; if (isE(sm)) return sm;
    const pick = (k) => { if (horiz) { if (R.h === 1) return R.v(0, k); const out = []; for (let i = 0; i < R.h; i++) out.push([R.v(i, k)]); return new Arr(out); } if (R.w === 1) return R.v(k, 0); const row = []; for (let j = 0; j < R.w; j++) row.push(R.v(k, j)); return new Arr([row]); };
    const one = (xv) => { if (xv instanceof Err) return xv; const k = xfind(l, xv, mm, sm); if (k < 0) return nf !== undefined && nf !== MISSING ? sc(nf) : E.NA; const v = pick(k); return v === null ? 0 : v; };
    if ((x instanceof Ref || x instanceof Arr) && !(x.h === 1 && x.w === 1)) return TB.lift1(x, cx, (xv) => sc(one(xv)));
    const r = one(sc(x)); if (r instanceof Arr && R instanceof Ref) { /* renvoie une ligne : référence pour permettre A1:XLOOKUP(…) */ const k = xfind(l, sc(x), mm, sm); if (k >= 0) return horiz ? new Ref(R.sh, R.r1, R.c1 + k, R.r2, R.c1 + k) : new Ref(R.sh, R.r1 + k, R.c1, R.r1 + k, R.c2); }
    if (R instanceof Ref && !(r instanceof Arr) && !(r instanceof Err) && r !== sc(nf)) { const k = xfind(l, sc(x), mm, sm); if (k >= 0) return horiz ? new Ref(R.sh, R.r1, R.c1 + k, R.r1, R.c1 + k) : new Ref(R.sh, R.r1 + k, R.c1, R.r1 + k, R.c1); }
    return r;
  });
  def('XMATCH', 'EQUIVX', { min: 2, max: 4, cat: 'lookup', x: 1 }, ([x, la, mm, sm], cx) => { const l = vec(la); mm = intN(opt(sc(mm), 0)); sm = intN(opt(sc(sm), 1)); return TB.lift1(x, cx, (xv) => { const k = xfind(l, xv, mm, sm); return k < 0 ? E.NA : k + 1; }); });
  def('INDEX', 'INDEX', { min: 2, max: 4, cat: 'lookup' }, ([a, r, c, area]) => {
    let A = a; if (A instanceof Ref3) { const k = intN(opt(sc(area), 1)); if (isE(k)) return k; A = A.list[k - 1]; if (!A) return E.REF; }
    r = intN(opt(sc(r), 0)); c = intN(opt(sc(c), 0)); if (isE(r)) return r; if (isE(c)) return c;
    if (!(A instanceof Ref || A instanceof Arr)) { if (r <= 1 && c <= 1) return A; return E.REF; }
    let h = A.h, w = A.w;
    if (h === 1 && c === 0 && r > 0 && w > 1) { c = r; r = 1; }
    if (r < 0 || c < 0 || r > h || c > w) return E.REF;
    if (A instanceof Ref) { const r1 = r ? A.r1 + r - 1 : A.r1, r2 = r ? r1 : A.r2, c1 = c ? A.c1 + c - 1 : A.c1, c2 = c ? c1 : A.c2; return new Ref(A.sh, r1, c1, r2, c2); }
    if (r && c) return A.v(r - 1, c - 1);
    if (r) return new Arr([A.d[r - 1].slice()]);
    return new Arr(A.d.map((row) => [row[c - 1]]));
  });
  def('CHOOSE', 'CHOISIR', { min: 2, lazy: true, cat: 'lookup' }, (a, cx, ev) => { const k = ev(a[0], cx); if ((k instanceof Ref || k instanceof Arr) && !(k.h === 1 && k.w === 1)) { const opts = a.slice(1).map((x) => ev(x, cx)); return TB.lift1(k, cx, (kv) => { kv = intN(kv); if (isE(kv)) return kv; return kv < 1 || kv >= a.length ? E.VALUE : sc(opts[kv - 1]); }); } const i = intN(sc(k)); if (isE(i)) return i; if (i < 1 || i >= a.length) return E.VALUE; return ev(a[i], cx); });
  def('OFFSET', 'DECALER', { min: 3, max: 5, cat: 'lookup', dyn: true }, ([ref, dr, dc, h, w], cx) => {
    if (!(ref instanceof Ref)) return E.VALUE;
    dr = intN(sc(dr)); dc = intN(sc(dc)); if (isE(dr)) return dr; if (isE(dc)) return dc;
    h = h === undefined || h === MISSING ? ref.h : intN(sc(h)); w = w === undefined || w === MISSING ? ref.w : intN(sc(w)); if (isE(h)) return h; if (isE(w)) return w;
    if (h === 0 || w === 0) return E.REF;
    let r1 = ref.r1 + dr, c1 = ref.c1 + dc, r2 = r1 + (h > 0 ? h - 1 : h + 1), c2 = c1 + (w > 0 ? w - 1 : w + 1);
    if (r2 < r1) { const t = r1; r1 = r2; r2 = t; } if (c2 < c1) { const t = c1; c1 = c2; c2 = t; }
    if (r1 < 0 || c1 < 0 || r2 >= TB.MAX_ROWS || c2 >= TB.MAX_COLS) return E.REF;
    return TB.ensureDeps(cx, new Ref(ref.sh, r1, c1, r2, c2));
  });
  def('INDIRECT', 'INDIRECT', { min: 1, max: 2, cat: 'lookup', dyn: true }, ([t, a1], cx) => {
    let s = str(sc(t)); if (isE(s)) return s; s = s.trim(); if (!s) return E.REF;
    const isA1 = a1 === undefined || a1 === MISSING || bool(sc(a1));
    let sh = cx.sh, m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(s);
    if (m) { sh = cx.wb.sheet((m[1] || m[2]).replace(/''/g, "'")); if (!sh) return E.REF; s = m[3]; }
    if (!isA1) { const r = /^R(\[?-?\d*\]?)C(\[?-?\d*\]?)(?::R(\[?-?\d*\]?)C(\[?-?\d*\]?))?$/i.exec(s); if (!r) return E.REF; const pr = (x, base) => !x ? base : x[0] === '[' ? base + +x.slice(1, -1) : +x - 1; const r1 = pr(r[1], cx.r), c1 = pr(r[2], cx.c); const r2 = r[3] != null ? pr(r[3], cx.r) : r1, c2 = r[4] != null ? pr(r[4], cx.c) : c1; return TB.ensureDeps(cx, new Ref(sh, Math.min(r1, r2), Math.min(c1, c2), Math.max(r1, r2), Math.max(c1, c2))); }
    const g = TB.parseRange(s);
    if (!g) { const nm = cx.wb.findName(s, sh); if (nm) { const v = TB.ev({ t: 'name', n: s }, cx); return v instanceof Ref ? v : E.REF; } return E.REF; }
    return TB.ensureDeps(cx, new Ref(sh, g.r1, g.c1, g.r2, g.c2));
  });
  def('ROW', 'LIGNE', { min: 0, max: 1, cat: 'lookup' }, ([r], cx) => { if (r === undefined || r === MISSING) return cx.r + 1; if (!(r instanceof Ref)) return E.VALUE; if (r.h === 1) return r.r1 + 1; const R = r.trimmedFull(); return arr(Array.from({ length: R.h }, (_, i) => [R.r1 + i + 1])); });
  def('COLUMN', 'COLONNE', { min: 0, max: 1, cat: 'lookup' }, ([r], cx) => { if (r === undefined || r === MISSING) return cx.c + 1; if (!(r instanceof Ref)) return E.VALUE; if (r.w === 1) return r.c1 + 1; return arr([Array.from({ length: r.w }, (_, j) => r.c1 + j + 1)]); });
  def('ROWS', 'LIGNES', { min: 1, max: 1, cat: 'lookup' }, ([r]) => r instanceof Ref || r instanceof Arr ? r.h : r instanceof Ref3 ? E.VALUE : 1);
  def('COLUMNS', 'COLONNES', { min: 1, max: 1, cat: 'lookup' }, ([r]) => r instanceof Ref || r instanceof Arr ? r.w : r instanceof Ref3 ? E.VALUE : 1);
  def('AREAS', 'ZONES', { min: 1, max: 1, cat: 'lookup' }, ([r]) => r instanceof Ref3 ? r.list.length : r instanceof Ref ? 1 : E.VALUE);
  def('ADDRESS', 'ADRESSE', { min: 2, max: 5, lift: ['n', 'n', 'n', 'b', 's'], cat: 'lookup' }, ([r, c, k, a1, sh]) => {
    r = Math.trunc(r); c = Math.trunc(c); k = Math.trunc(opt(k, 1)); if (r < 1 || c < 1 || k < 1 || k > 4) return E.VALUE;
    const ar = k === 1 || k === 2, ac = k === 1 || k === 3; let s;
    if (a1 === MISSING || a1 === undefined || a1) s = (ac ? '$' : '') + TB.colName(c - 1) + (ar ? '$' : '') + r; else s = 'R' + (ar ? r : '[' + r + ']') + 'C' + (ac ? c : '[' + c + ']');
    return sh !== MISSING && sh !== undefined && sh !== '' ? TB.quoteSheet(sh) + '!' + s : s;
  });
  def('TRANSPOSE', 'TRANSPOSE', { min: 1, max: 1, cat: 'lookup' }, ([a]) => { const g = grid(a); return arr(g[0].map((_, j) => g.map((r) => r[j] === null ? 0 : r[j]))); });
  def('FILTER', 'FILTRE', { min: 2, max: 3, cat: 'lookup', x: 2 }, ([a, inc, empty]) => {
    const g = grid(a), m = grid(inc);
    const H = g.length, W = g[0].length;
    let out;
    if (m.length === H && m[0].length === 1) { out = []; for (let i = 0; i < H; i++) { const b = bool(m[i][0]); if (isE(b)) return b; if (b) out.push(g[i].slice()); } }
    else if (m.length === 1 && m[0].length === W) { const keep = []; for (let j = 0; j < W; j++) { const b = bool(m[0][j]); if (isE(b)) return b; if (b) keep.push(j); } out = keep.length ? g.map((r) => keep.map((j) => r[j])) : []; }
    else return E.VALUE;
    if (!out.length) return empty !== undefined && empty !== MISSING ? sc(empty) : E.CALC;
    return arr(out.map((r) => r.map((x) => x === null ? '' : x)));
  });
  function sortRows(rows, keys) { return rows.map((r, i) => [r, i]).sort((x, y) => { for (const k of keys) { const c = TB.compare(k.get(x[0], x[1]), k.get(y[0], y[1])); if (c) return c * k.o; } return x[1] - y[1]; }).map((x) => x[0]); }
  def('SORT', 'TRIER', { min: 1, max: 4, cat: 'lookup', x: 2 }, ([a, idx, ord, byCol]) => {
    let g = grid(a).map((r) => r.slice()); const bc = bool(opt(sc(byCol), false)); if (isE(bc)) return bc;
    if (bc) g = g[0].map((_, j) => g.map((r) => r[j]));
    const ix = idx === undefined || idx === MISSING ? [1] : flat(idx).map((x) => intN(x)); const os = ord === undefined || ord === MISSING ? [1] : flat(ord).map((x) => intN(x));
    for (const k of ix) if (isE(k) || k < 1 || k > g[0].length) return E.VALUE;
    const keys = ix.map((k, i) => ({ get: (r) => r[k - 1], o: (os[i] || os[0] || 1) < 0 ? -1 : 1 }));
    g = sortRows(g, keys); if (bc) g = g[0].map((_, j) => g.map((r) => r[j]));
    return arr(g.map((r) => r.map((x) => x === null ? 0 : x)));
  });
  def('SORTBY', 'TRIERPAR', { min: 2, cat: 'lookup', x: 1 }, (a) => {
    const g = grid(a[0]); const keys = [];
    for (let k = 1; k < a.length; k += 2) { const kv = flat(a[k]); if (kv.length !== g.length) return E.VALUE; const o = a[k + 1] === undefined || a[k + 1] === MISSING ? 1 : intN(sc(a[k + 1])); keys.push({ get: (r, i) => kv[i], o: o < 0 ? -1 : 1 }); }
    return arr(sortRows(g, keys).map((r) => r.map((x) => x === null ? 0 : x)));
  });
  def('UNIQUE', 'UNIQUE', { min: 1, max: 3, cat: 'lookup', x: 1 }, ([a, byCol, once]) => {
    let g = grid(a); const bc = bool(opt(sc(byCol), false)), on = bool(opt(sc(once), false)); if (bc) g = g[0].map((_, j) => g.map((r) => r[j]));
    const keyOf = (r) => r.map((x) => x === null ? '' : typeof x === 'string' ? 's' + x.toLowerCase() : typeof x + String(x)).join('\u0001');
    const cnt = new Map(); g.forEach((r) => { const k = keyOf(r); cnt.set(k, (cnt.get(k) || 0) + 1); });
    const seen = new Set(), out = [];
    g.forEach((r) => { const k = keyOf(r); if (seen.has(k)) return; seen.add(k); if (on && cnt.get(k) > 1) return; out.push(r.map((x) => x === null ? 0 : x)); });
    if (!out.length) return E.CALC;
    return arr(bc ? out[0].map((_, j) => out.map((r) => r[j])) : out);
  });
  def('TAKE', 'PRENDRE', { min: 2, max: 3, cat: 'lookup', x: 1 }, ([a, r, c]) => { let g = grid(a); r = opt(sc(r), MISSING); c = opt(sc(c), MISSING); if (r !== MISSING) { r = intN(r); if (isE(r)) return r; g = r >= 0 ? g.slice(0, r) : g.slice(r); } if (c !== MISSING) { c = intN(c); if (isE(c)) return c; g = g.map((x) => c >= 0 ? x.slice(0, c) : x.slice(c)); } return g.length && g[0].length ? arr(g) : E.CALC; });
  def('DROP', 'EXCLURE', { min: 2, max: 3, cat: 'lookup', x: 1 }, ([a, r, c]) => { let g = grid(a); r = opt(sc(r), MISSING); c = opt(sc(c), MISSING); if (r !== MISSING) { r = intN(r); if (isE(r)) return r; g = r >= 0 ? g.slice(r) : g.slice(0, r); } if (c !== MISSING) { c = intN(c); if (isE(c)) return c; g = g.map((x) => c >= 0 ? x.slice(c) : x.slice(0, c)); } return g.length && g[0].length ? arr(g) : E.CALC; });
  def('CHOOSECOLS', 'CHOISIRCOLS', { min: 2, cat: 'lookup', x: 1 }, (a) => { const g = grid(a[0]); const ix = []; for (const x of a.slice(1)) for (const v of flat(x)) { const k = intN(v); if (isE(k)) return k; if (k === 0 || Math.abs(k) > g[0].length) return E.VALUE; ix.push(k > 0 ? k - 1 : g[0].length + k); } return arr(g.map((r) => ix.map((j) => r[j]))); });
  def('CHOOSEROWS', 'CHOISIRLIGNES', { min: 2, cat: 'lookup', x: 1 }, (a) => { const g = grid(a[0]); const ix = []; for (const x of a.slice(1)) for (const v of flat(x)) { const k = intN(v); if (isE(k)) return k; if (k === 0 || Math.abs(k) > g.length) return E.VALUE; ix.push(k > 0 ? k - 1 : g.length + k); } return arr(ix.map((i) => g[i].slice())); });
  def('VSTACK', 'ASSEMB.V', { min: 1, cat: 'lookup', x: 1 }, (a) => { const gs = a.map(grid); const W = Math.max(...gs.map((g) => g[0].length)); const out = []; gs.forEach((g) => g.forEach((r) => { const x = r.slice(); while (x.length < W) x.push(E.NA); out.push(x); })); return arr(out); });
  def('HSTACK', 'ASSEMB.H', { min: 1, cat: 'lookup', x: 1 }, (a) => { const gs = a.map(grid); const H = Math.max(...gs.map((g) => g.length)); const out = []; for (let i = 0; i < H; i++) { let row = []; gs.forEach((g) => { const r = g[i] || new Array(g[0].length).fill(E.NA); row = row.concat(r); }); out.push(row); } return arr(out); });
  def('TOCOL', null, { min: 1, max: 3, cat: 'lookup', x: 1 }, ([a, ig, byCol]) => { let g = grid(a); ig = intN(opt(sc(ig), 0)); if (bool(opt(sc(byCol), false))) g = g[0].map((_, j) => g.map((r) => r[j])); const l = []; g.forEach((r) => r.forEach((x) => { if ((ig === 1 || ig === 3) && x === null) return; if ((ig === 2 || ig === 3) && x instanceof Err) return; l.push([x === null ? 0 : x]); })); return arr(l); });
  def('TOROW', null, { min: 1, max: 3, cat: 'lookup', x: 1 }, ([a, ig, byCol]) => { const c = FN.TOCOL.f([a, ig, byCol]); return c instanceof Arr ? arr([c.d.map((r) => r[0])]) : c; });
  def('WRAPROWS', null, { min: 2, max: 3, cat: 'lookup', x: 1 }, ([a, n, pad]) => { const l = flat(a); n = intN(sc(n)); if (isE(n) || n < 1) return E.VALUE; const p = pad === undefined || pad === MISSING ? E.NA : sc(pad); const out = []; for (let i = 0; i < l.length; i += n) { const r = l.slice(i, i + n); while (r.length < n) r.push(p); out.push(r); } return arr(out); });
  def('WRAPCOLS', null, { min: 2, max: 3, cat: 'lookup', x: 1 }, ([a, n, pad]) => { const r = FN.WRAPROWS.f([a, n, pad]); return r instanceof Arr ? arr(r.d[0].map((_, j) => r.d.map((x) => x[j]))) : r; });
  def('EXPAND', null, { min: 2, max: 4, cat: 'lookup', x: 1 }, ([a, r, c, pad]) => { const g = grid(a); r = intN(opt(sc(r), g.length)); c = intN(opt(sc(c), g[0].length)); if (isE(r) || isE(c) || r < g.length || c < g[0].length) return E.VALUE; const p = pad === undefined || pad === MISSING ? E.NA : sc(pad); const out = []; for (let i = 0; i < r; i++) { const row = []; for (let j = 0; j < c; j++) row.push(g[i] && j < g[i].length ? g[i][j] : p); out.push(row); } return arr(out); });
  def('HYPERLINK', 'LIEN_HYPERTEXTE', { min: 1, max: 2, lift: ['s', 'v'], cat: 'lookup' }, ([u, t]) => t === undefined || t === MISSING ? u : t);

  /* =====================================================================
     Texte
     ===================================================================== */
  def('CONCATENATE', 'CONCATENER', { min: 1, lift: ['s'], cat: 'text' }, (a) => a.map((x) => x === MISSING ? '' : x).join(''));
  def('CONCAT', 'CONCAT', { min: 1, cat: 'text', x: 1 }, (a) => { let s = ''; for (const x of a) { let e = null; each(x, (v) => { if (e) return; const t = str(v); if (isE(t)) e = t; else s += t; }); if (e) return e; } return s; });
  def('TEXTJOIN', 'JOINDRE.TEXTE', { min: 3, cat: 'text', x: 1 }, (a) => { const d = str(sc(a[0])), ig = bool(sc(a[1])); if (isE(d)) return d; const l = []; for (const x of a.slice(2)) { let e = null; const vals = x instanceof Ref || x instanceof Arr ? flat(x) : [x === MISSING ? null : x]; vals.forEach((v) => { if (e) return; const t = str(v); if (isE(t)) e = t; else if (!(ig && t === '')) l.push(t); }); if (e) return e; } return l.join(d); });
  def('LEFT', 'GAUCHE', { min: 1, max: 2, lift: ['s', 'n'], cat: 'text' }, ([s, n]) => { n = opt(n, 1); return n < 0 ? E.VALUE : Array.from(s).slice(0, Math.trunc(n)).join(''); });
  def('RIGHT', 'DROITE', { min: 1, max: 2, lift: ['s', 'n'], cat: 'text' }, ([s, n]) => { n = Math.trunc(opt(n, 1)); if (n < 0) return E.VALUE; const a = Array.from(s); return n ? a.slice(-n).join('') : ''; });
  def('MID', 'STXT', { min: 3, max: 3, lift: ['s', 'n', 'n'], cat: 'text' }, ([s, p, n]) => { p = Math.trunc(p); n = Math.trunc(n); if (p < 1 || n < 0) return E.VALUE; return Array.from(s).slice(p - 1, p - 1 + n).join(''); });
  def('LEN', 'NBCAR', { min: 1, max: 1, lift: ['s'], cat: 'text' }, ([s]) => s.length);
  def('FIND', 'TROUVE', { min: 2, max: 3, lift: ['s', 's', 'n'], cat: 'text' }, ([f, s, p]) => { p = Math.trunc(opt(p, 1)); if (p < 1 || p > s.length + 1) return E.VALUE; const i = s.indexOf(f, p - 1); return i < 0 ? E.VALUE : i + 1; });
  def('SEARCH', 'CHERCHE', { min: 2, max: 3, lift: ['s', 's', 'n'], cat: 'text' }, ([f, s, p]) => { p = Math.trunc(opt(p, 1)); if (p < 1 || p > s.length + 1) return E.VALUE; const re = TB.wildRe(f, false); const m = re.exec(s.slice(p - 1)); return m ? m.index + p : E.VALUE; });
  def('REPLACE', 'REMPLACER', { min: 4, max: 4, lift: ['s', 'n', 'n', 's'], cat: 'text' }, ([s, p, n, t]) => { p = Math.trunc(p); n = Math.trunc(n); if (p < 1 || n < 0) return E.VALUE; return s.slice(0, p - 1) + t + s.slice(p - 1 + n); });
  def('SUBSTITUTE', 'SUBSTITUE', { min: 3, max: 4, lift: ['s', 's', 's', 'n'], cat: 'text' }, ([s, o, n, k]) => { if (!o) return s; if (k === undefined || k === MISSING) return s.split(o).join(n); k = Math.trunc(k); if (k < 1) return E.VALUE; let i = -1; for (let j = 0; j < k; j++) { i = s.indexOf(o, i + 1); if (i < 0) return s; } return s.slice(0, i) + n + s.slice(i + o.length); });
  def('UPPER', 'MAJUSCULE', { min: 1, max: 1, lift: ['s'], cat: 'text' }, ([s]) => s.toUpperCase());
  def('LOWER', 'MINUSCULE', { min: 1, max: 1, lift: ['s'], cat: 'text' }, ([s]) => s.toLowerCase());
  def('PROPER', 'NOMPROPRE', { min: 1, max: 1, lift: ['s'], cat: 'text' }, ([s]) => s.toLowerCase().replace(/(^|[^A-Za-zÀ-ÿ])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()));
  def('TRIM', 'SUPPRESPACE', { min: 1, max: 1, lift: ['s'], cat: 'text' }, ([s]) => s.replace(/ +/g, ' ').trim());
  def('CLEAN', 'EPURAGE', { min: 1, max: 1, lift: ['s'], cat: 'text' }, ([s]) => s.replace(/[\x00-\x1f]/g, ''));
  def('TEXT', 'TEXTE', { min: 2, max: 2, lift: ['v', 's'], cat: 'text' }, ([v, f]) => { if (v instanceof Err) return v; if (v === MISSING) v = null; let n = typeof v === 'string' ? num(v) : v; if (isE(n)) n = v; const code = TB.loc.sep === 'fr' ? TB.Fmt.fromLocal(f) : f; return TB.Fmt.format(n === null ? 0 : n, code).s; });
  def('FIXED', 'CTXT', { min: 1, max: 3, lift: ['n', 'n', 'b'], cat: 'text' }, ([x, d, ns]) => { d = Math.trunc(opt(d, 2)); return TB.Fmt.text(d < 0 ? FN.ROUND.f([x, d]) : x, (ns === MISSING || ns === undefined || !ns ? '#,##0' : '0') + (d > 0 ? '.' + '0'.repeat(d) : '')); });
  def('DOLLAR', 'DEVISE', { min: 1, max: 2, lift: ['n', 'n'], cat: 'text' }, ([x, d]) => { d = Math.trunc(opt(d, 2)); return TB.Fmt.text(d < 0 ? FN.ROUND.f([x, d]) : x, '#,##0' + (d > 0 ? '.' + '0'.repeat(d) : '') + '\\ "€";-#,##0' + (d > 0 ? '.' + '0'.repeat(d) : '') + '\\ "€"'); });
  def('VALUE', 'CNUM', { min: 1, max: 1, lift: ['v'], cat: 'text' }, ([v]) => { if (v instanceof Err) return v; if (typeof v === 'number') return v; if (v === null || v === MISSING) return 0; if (typeof v === 'boolean') return E.VALUE; const p = TB.parseInput(String(v).trim()); return typeof p.v === 'number' ? p.v : E.VALUE; });
  def('NUMBERVALUE', 'VALEURNOMBRE', { min: 1, max: 3, lift: ['s', 's', 's'], cat: 'text', x: 1 }, ([s, d, g]) => { d = opt(d, TB.loc.dec); g = opt(g, TB.loc.dec === ',' ? ' ' : ','); let t = s.replace(/\s/g, ''); if (g) t = t.split(g).join(''); t = t.split(d[0] || '.').join('.'); let pct = 0; while (/%$/.test(t)) { t = t.slice(0, -1); pct++; } if (t === '') return 0; const v = Number(t); return isNaN(v) ? E.VALUE : v / Math.pow(100, pct); });
  def('REPT', 'REPT', { min: 2, max: 2, lift: ['s', 'n'], cat: 'text' }, ([s, n]) => { n = Math.trunc(n); if (n < 0 || s.length * n > 32767) return E.VALUE; return s.repeat(n); });
  def('EXACT', 'EXACT', { min: 2, max: 2, lift: ['s', 's'], cat: 'text' }, ([a, b]) => a === b);
  const CP1252 = { 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352, 139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376 };
  const CP_REV = {}; Object.keys(CP1252).forEach((k) => { CP_REV[CP1252[k]] = +k; });
  def('CHAR', 'CAR', { min: 1, max: 1, lift: ['n'], cat: 'text' }, ([n]) => { n = Math.trunc(n); if (n < 1 || n > 255) return E.VALUE; return String.fromCharCode(CP1252[n] || n); });
  def('CODE', 'CODE', { min: 1, max: 1, lift: ['s'], cat: 'text' }, ([s]) => { if (!s) return E.VALUE; const c = s.charCodeAt(0); return CP_REV[c] || (c < 256 ? c : 63); });
  def('UNICHAR', 'UNICAR', { min: 1, max: 1, lift: ['n'], cat: 'text', x: 1 }, ([n]) => { n = Math.trunc(n); if (n < 1 || n > 0x10FFFF) return E.VALUE; return String.fromCodePoint(n); });
  def('UNICODE', 'UNICODE', { min: 1, max: 1, lift: ['s'], cat: 'text', x: 1 }, ([s]) => s ? s.codePointAt(0) : E.VALUE);
  def('T', 'T', { min: 1, max: 1, lift: ['v'], cat: 'text' }, ([v]) => typeof v === 'string' ? v : v instanceof Err ? v : '');
  def('N', 'N', { min: 1, max: 1, lift: ['v'], cat: 'info' }, ([v]) => typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : v instanceof Err ? v : 0);
  const textPos = (s, d, k, mm, me, after) => {
    if (d === '') return after ? (k >= 0 ? 0 : s.length) : (k >= 0 ? 0 : s.length);
    const S = mm ? s.toLowerCase() : s, D = mm ? d.toLowerCase() : d;
    const idx = []; let i = S.indexOf(D); while (i >= 0) { idx.push(i); i = S.indexOf(D, i + D.length); }
    if (me) { if (k > 0) idx.push(s.length); else idx.unshift(-D.length); }
    const n = k > 0 ? k - 1 : idx.length + k; if (n < 0 || n >= idx.length) return -1; return idx[n];
  };
  def('TEXTBEFORE', 'TEXTE.AVANT', { min: 2, max: 6, cat: 'text', x: 1 }, ([t, d, k, mm, me, nf], cx) => TB.lift1(t, cx, (tv) => { const s = str(tv); if (isE(s)) return s; const ds = flat(d).map(str); k = intN(opt(sc(k), 1)); if (k === 0) return E.VALUE; const m = bool(opt(sc(mm), false)), e = bool(opt(sc(me), false)); let best = -1, bl = 0; for (const x of ds) { const p = textPos(s, x, k, m, e); if (p >= 0 && (best < 0 || (k > 0 ? p < best : p > best))) { best = p; bl = x.length; } } void bl; return best < 0 ? (nf !== undefined && nf !== MISSING ? sc(nf) : E.NA) : s.slice(0, Math.max(0, best)); }));
  def('TEXTAFTER', 'TEXTE.APRES', { min: 2, max: 6, cat: 'text', x: 1 }, ([t, d, k, mm, me, nf], cx) => TB.lift1(t, cx, (tv) => { const s = str(tv); if (isE(s)) return s; const ds = flat(d).map(str); k = intN(opt(sc(k), 1)); if (k === 0) return E.VALUE; const m = bool(opt(sc(mm), false)), e = bool(opt(sc(me), false)); let best = -1, bl = 0; for (const x of ds) { const p = textPos(s, x, k, m, e, true); if (p >= 0 && (best < 0 || (k > 0 ? p < best : p > best))) { best = p; bl = x.length; } } return best < 0 ? (nf !== undefined && nf !== MISSING ? sc(nf) : E.NA) : s.slice(best + bl); }));
  def('TEXTSPLIT', 'FRACTIONNER.TEXTE', { min: 2, max: 6, cat: 'text', x: 1 }, ([t, cd, rd, ig, mm, pad]) => {
    const s = str(sc(t)); if (isE(s)) return s;
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = (d) => { const l = d === undefined || d === MISSING ? [] : flat(d).map(str).filter((x) => x !== ''); return l.length ? new RegExp(l.map(esc).join('|'), bool(opt(sc(mm), false)) ? 'gi' : 'g') : null; };
    const C = re(cd), Rr = re(rd), igv = bool(opt(sc(ig), false));
    let rows = Rr ? s.split(Rr) : [s]; if (igv) rows = rows.filter((x) => x !== '');
    let g = rows.map((r) => { let c = C ? r.split(C) : [r]; if (igv) c = c.filter((x) => x !== ''); return c; });
    const W = Math.max(...g.map((r) => r.length)); const p = pad === undefined || pad === MISSING ? E.NA : sc(pad);
    g = g.map((r) => { const x = r.slice(); while (x.length < W) x.push(p); return x; });
    return arr(g);
  });
  def('VALUETOTEXT', null, { min: 1, max: 2, lift: ['v', 'n'], cat: 'text', x: 1 }, ([v, f]) => { const s = v instanceof Err ? TB.errText(v) : str(v); return opt(f, 0) && typeof v === 'string' ? '"' + s + '"' : s; });
  def('ARRAYTOTEXT', null, { min: 1, max: 2, cat: 'text', x: 1 }, ([a, f]) => { const g = grid(a); const strict = intN(opt(sc(f), 0)) === 1; const t = (v) => v instanceof Err ? TB.errText(v) : typeof v === 'string' && strict ? '"' + v + '"' : str(v); return strict ? '{' + g.map((r) => r.map(t).join(TB.loc.arrCol)).join(TB.loc.arrRow) + '}' : flat(a).map(t).join(TB.loc.arg + ' '); });

  /* =====================================================================
     Dates et heures
     ===================================================================== */
  const dateNum = (v) => { v = sc(v); if (v === null || v === MISSING) return 0; if (typeof v === 'string') { const d = TB.parseDate(v); if (d) return d.v; } return num(v); };
  def('TODAY', 'AUJOURDHUI', { min: 0, max: 0, cat: 'date' }, () => TB.today());
  def('NOW', 'MAINTENANT', { min: 0, max: 0, cat: 'date' }, () => TB.now());
  def('DATE', 'DATE', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'date' }, ([y, m, d]) => { y = Math.trunc(y); m = Math.trunc(m); d = Math.trunc(d); if (y < 0 || y > 9999) return E.NUM; if (y < 1900) y += 1900; const s = TB.serial(y, m, d); return s < 0 ? E.NUM : s; });
  def('TIME', 'TEMPS', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'date' }, ([h, m, s]) => { const t = (Math.trunc(h) * 3600 + Math.trunc(m) * 60 + Math.trunc(s)); if (t < 0) return E.NUM; return (t % 86400) / 86400; });
  const dpart = (k) => ([v]) => { const n = dateNum(v); if (isE(n)) return n; if (n < 0) return E.NUM; const d = TB.ymd(n); return d[k]; };
  def('YEAR', 'ANNEE', { min: 1, max: 1, lift: ['v'], cat: 'date' }, dpart('y'));
  def('MONTH', 'MOIS', { min: 1, max: 1, lift: ['v'], cat: 'date' }, dpart('m'));
  def('DAY', 'JOUR', { min: 1, max: 1, lift: ['v'], cat: 'date' }, dpart('d'));
  const tpart = (k) => ([v]) => { const n = dateNum(v); if (isE(n)) return n; if (n < 0) return E.NUM; const t = TB.hms(n); return k === 's' ? Math.round(t.s) % 60 : t[k]; };
  def('HOUR', 'HEURE', { min: 1, max: 1, lift: ['v'], cat: 'date' }, tpart('h'));
  def('MINUTE', 'MINUTE', { min: 1, max: 1, lift: ['v'], cat: 'date' }, ([v]) => { const n = dateNum(v); if (isE(n)) return n; const tot = Math.round((n - Math.floor(n)) * 86400); return Math.floor(tot % 3600 / 60); });
  def('SECOND', 'SECONDE', { min: 1, max: 1, lift: ['v'], cat: 'date' }, ([v]) => { const n = dateNum(v); if (isE(n)) return n; const tot = Math.round((n - Math.floor(n)) * 86400); return tot % 60; });
  def('WEEKDAY', 'JOURSEM', { min: 1, max: 2, lift: ['v', 'n'], cat: 'date' }, ([v, t]) => { const n = dateNum(v); if (isE(n)) return n; const wd = TB.weekday(n); t = Math.trunc(opt(t, 1)); if (t === 1 || t === 17) return wd + 1; if (t === 2 || t === 11) return (wd + 6) % 7 + 1; if (t === 3) return (wd + 6) % 7; if (t >= 12 && t <= 16) return (wd - (t - 10) + 7) % 7 + 1; return E.NUM; });
  def('WEEKNUM', 'NO.SEMAINE', { min: 1, max: 2, lift: ['v', 'n'], cat: 'date' }, ([v, t]) => { const n = dateNum(v); if (isE(n)) return n; t = Math.trunc(opt(t, 1)); if (t === 21) return isoWeek(n); const start = t === 1 || t === 17 ? 0 : t === 2 || t === 11 ? 1 : t >= 12 && t <= 16 ? t - 10 : -1; if (start < 0) return E.NUM; const y = TB.ymd(n).y, j1 = TB.serial(y, 1, 1); const off = (TB.weekday(j1) - start + 7) % 7; return Math.floor((n - j1 + off) / 7) + 1; });
  function isoWeek(n) { n = Math.floor(n); const wd = (TB.weekday(n) + 6) % 7; const th = n - wd + 3; const y = TB.ymd(th).y; const j1 = TB.serial(y, 1, 1); return Math.floor((th - j1) / 7) + 1; }
  def('ISOWEEKNUM', 'NO.SEMAINE.ISO', { min: 1, max: 1, lift: ['v'], cat: 'date', x: 1 }, ([v]) => { const n = dateNum(v); return isE(n) ? n : isoWeek(n); });
  def('DATEVALUE', 'DATEVAL', { min: 1, max: 1, lift: ['s'], cat: 'date' }, ([s]) => { const d = TB.parseDate(s); return d && d.v >= 1 ? Math.floor(d.v) : E.VALUE; });
  def('TIMEVALUE', 'TEMPSVAL', { min: 1, max: 1, lift: ['s'], cat: 'date' }, ([s]) => { const d = TB.parseDate(s); return d ? d.v - Math.floor(d.v) : E.VALUE; });
  const addMonths = (n, m) => { const d = TB.ymd(n); let y = d.y, mo = d.m + m; y += Math.floor((mo - 1) / 12); mo = ((mo - 1) % 12 + 12) % 12 + 1; return TB.serial(y, mo, Math.min(d.d, TB.daysInMonth(y, mo))); };
  def('EDATE', 'MOIS.DECALER', { min: 2, max: 2, lift: ['v', 'n'], cat: 'date' }, ([v, m]) => { const n = dateNum(v); if (isE(n)) return n; return addMonths(Math.floor(n), Math.trunc(m)); });
  def('EOMONTH', 'FIN.MOIS', { min: 2, max: 2, lift: ['v', 'n'], cat: 'date' }, ([v, m]) => { const n = dateNum(v); if (isE(n)) return n; const d = TB.ymd(addMonths(Math.floor(n), Math.trunc(m))); return TB.serial(d.y, d.m, TB.daysInMonth(d.y, d.m)); });
  function weekendMask(w) { if (w === undefined || w === MISSING) return [0, 0, 0, 0, 0, 1, 1]; w = sc(w); if (typeof w === 'string') { if (!/^[01]{7}$/.test(w)) return E.VALUE; return w.split('').map(Number); } const k = intN(w); const M = { 1: [5, 6], 2: [6, 0], 3: [0, 1], 4: [1, 2], 5: [2, 3], 6: [3, 4], 7: [4, 5], 11: [6], 12: [0], 13: [1], 14: [2], 15: [3], 16: [4], 17: [5] }; if (!M[k]) return E.NUM; const m = [0, 0, 0, 0, 0, 0, 0]; M[k].forEach((i) => { m[i] = 1; }); return m; }
  const holSet = (h) => { const s = new Set(); if (h !== undefined && h !== MISSING) flat(h).forEach((x) => { const n = dateNum(x); if (typeof n === 'number') s.add(Math.floor(n)); }); return s; };
  const isWork = (n, mask, hol) => !mask[(TB.weekday(n) + 6) % 7] && !hol.has(n);
  function netdays(a, b, mask, hol) { a = Math.floor(a); b = Math.floor(b); const s = a <= b ? 1 : -1; let n = 0; for (let d = a; s > 0 ? d <= b : d >= b; d += s) if (isWork(d, mask, hol)) n++; return n * s; }
  def('NETWORKDAYS', 'NB.JOURS.OUVRES', { min: 2, max: 3, cat: 'date' }, ([a, b, h]) => { const x = dateNum(a), y = dateNum(b); if (isE(x)) return x; if (isE(y)) return y; return netdays(x, y, [0, 0, 0, 0, 0, 1, 1], holSet(h)); });
  def('NETWORKDAYS.INTL', 'NB.JOURS.OUVRES.INTL', { min: 2, max: 4, cat: 'date', x: 1 }, ([a, b, w, h]) => { const x = dateNum(a), y = dateNum(b); if (isE(x)) return x; if (isE(y)) return y; const m = weekendMask(w); if (isE(m)) return m; return netdays(x, y, m, holSet(h)); });
  function workday(n, k, mask, hol) { n = Math.floor(n); k = Math.trunc(k); const s = k >= 0 ? 1 : -1; let left = Math.abs(k); while (left > 0) { n += s; if (isWork(n, mask, hol)) left--; } return n; }
  def('WORKDAY', 'SERIE.JOUR.OUVRE', { min: 2, max: 3, cat: 'date' }, ([a, k, h]) => { const x = dateNum(a), d = num(sc(k)); if (isE(x)) return x; if (isE(d)) return d; return workday(x, d, [0, 0, 0, 0, 0, 1, 1], holSet(h)); });
  def('WORKDAY.INTL', 'SERIE.JOUR.OUVRE.INTL', { min: 2, max: 4, cat: 'date', x: 1 }, ([a, k, w, h]) => { const x = dateNum(a), d = num(sc(k)); if (isE(x)) return x; if (isE(d)) return d; const m = weekendMask(w); if (isE(m)) return m; return workday(x, d, m, holSet(h)); });
  def('DATEDIF', 'DATEDIF', { min: 3, max: 3, lift: ['v', 'v', 's'], cat: 'date' }, ([a, b, u]) => {
    const x = dateNum(a), y = dateNum(b); if (isE(x)) return x; if (isE(y)) return y; if (x > y) return E.NUM;
    const A = TB.ymd(x), B = TB.ymd(y); u = u.toUpperCase();
    let months = (B.y - A.y) * 12 + B.m - A.m; if (B.d < A.d) months--;
    switch (u) {
      case 'D': return Math.floor(y) - Math.floor(x);
      case 'M': return months;
      case 'Y': return Math.floor(months / 12);
      case 'YM': return months % 12;
      case 'MD': { let d = B.d - A.d; if (d < 0) { const pm = B.m === 1 ? 12 : B.m - 1, py = B.m === 1 ? B.y - 1 : B.y; d += TB.daysInMonth(py, pm); } return d; }
      case 'YD': { let s = TB.serial(B.y, A.m, Math.min(A.d, TB.daysInMonth(B.y, A.m))); if (s > Math.floor(y)) s = TB.serial(B.y - 1, A.m, Math.min(A.d, TB.daysInMonth(B.y - 1, A.m))); return Math.floor(y) - s; }
    }
    return E.NUM;
  });
  def('DAYS', 'JOURS', { min: 2, max: 2, lift: ['v', 'v'], cat: 'date', x: 1 }, ([b, a]) => { const x = dateNum(a), y = dateNum(b); if (isE(x)) return x; if (isE(y)) return y; return Math.floor(y) - Math.floor(x); });
  def('DAYS360', 'JOURS360', { min: 2, max: 3, lift: ['v', 'v', 'b'], cat: 'date' }, ([a, b, eu]) => {
    const x = dateNum(a), y = dateNum(b); if (isE(x)) return x; if (isE(y)) return y; const A = TB.ymd(x), B = TB.ymd(y);
    let d1 = A.d, d2 = B.d;
    if (eu && eu !== MISSING) { if (d1 === 31) d1 = 30; if (d2 === 31) d2 = 30; }
    else { const lastFeb = (D) => D.m === 2 && D.d === TB.daysInMonth(D.y, 2); if (lastFeb(A)) { if (lastFeb(B)) d2 = 30; d1 = 30; } if (d1 === 31) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; }
    return (B.y - A.y) * 360 + (B.m - A.m) * 30 + d2 - d1;
  });
  def('YEARFRAC', 'FRACTION.ANNEE', { min: 2, max: 3, lift: ['v', 'v', 'n'], cat: 'date' }, ([a, b, basis]) => {
    let x = Math.floor(dateNum(a)), y = Math.floor(dateNum(b)); if (isE(x)) return x; if (isE(y)) return y; if (x > y) { const t = x; x = y; y = t; }
    basis = Math.trunc(opt(basis, 0));
    const A = TB.ymd(x), B = TB.ymd(y);
    switch (basis) {
      case 0: { let d1 = A.d, d2 = B.d; if (d1 === 31) d1 = 30; if (d2 === 31 && d1 >= 30) d2 = 30; if (A.m === 2 && A.d === TB.daysInMonth(A.y, 2)) { d1 = 30; if (B.m === 2 && B.d === TB.daysInMonth(B.y, 2)) d2 = 30; } return ((B.y - A.y) * 360 + (B.m - A.m) * 30 + d2 - d1) / 360; }
      case 1: { if (A.y === B.y || (B.y === A.y + 1 && (B.m < A.m || (B.m === A.m && B.d <= A.d)))) { const ly = A.y === B.y ? TB.isLeap(A.y) : (TB.isLeap(A.y) && (A.m < 3)) || (TB.isLeap(B.y) && (B.m > 2 || (B.m === 2 && B.d === 29))); return (y - x) / (ly ? 366 : 365); } let tot = 0; for (let k = A.y; k <= B.y; k++) tot += TB.isLeap(k) ? 366 : 365; return (y - x) / (tot / (B.y - A.y + 1)); }
      case 2: return (y - x) / 360;
      case 3: return (y - x) / 365;
      case 4: { let d1 = Math.min(A.d, 30), d2 = Math.min(B.d, 30); return ((B.y - A.y) * 360 + (B.m - A.m) * 30 + d2 - d1) / 360; }
    }
    return E.NUM;
  });

  /* =====================================================================
     Finances
     ===================================================================== */
  const pmt = (r, n, pv, fv, t) => { if (r === 0) return -(pv + fv) / n; const k = Math.pow(1 + r, n); return -(r * (pv * k + fv)) / ((1 + r * t) * (k - 1)); };
  const fvf = (r, n, p, pv, t) => r === 0 ? -(pv + p * n) : -(pv * Math.pow(1 + r, n) + p * (1 + r * t) * (Math.pow(1 + r, n) - 1) / r);
  const pvf = (r, n, p, fv, t) => r === 0 ? -(fv + p * n) : -(fv + p * (1 + r * t) * (Math.pow(1 + r, n) - 1) / r) / Math.pow(1 + r, n);
  def('PMT', 'VPM', { min: 3, max: 5, lift: ['n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([r, n, pv, fv, t]) => n === 0 ? E.NUM : pmt(r, n, pv, opt(fv, 0), opt(t, 0) ? 1 : 0));
  def('FV', 'VC', { min: 3, max: 5, lift: ['n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([r, n, p, pv, t]) => fvf(r, n, p, opt(pv, 0), opt(t, 0) ? 1 : 0));
  def('PV', 'VA', { min: 3, max: 5, lift: ['n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([r, n, p, fv, t]) => pvf(r, n, p, opt(fv, 0), opt(t, 0) ? 1 : 0));
  def('NPER', 'NPM', { min: 3, max: 5, lift: ['n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([r, p, pv, fv, t]) => { fv = opt(fv, 0); t = opt(t, 0) ? 1 : 0; if (r === 0) return p === 0 ? E.NUM : -(pv + fv) / p; const z = p * (1 + r * t) / r; const v = (z - fv) / (z + pv); return v <= 0 ? E.NUM : Math.log(v) / Math.log(1 + r); });
  def('RATE', 'TAUX', { min: 3, max: 6, lift: ['n', 'n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([n, p, pv, fv, t, g]) => {
    fv = opt(fv, 0); t = opt(t, 0) ? 1 : 0; let r = opt(g, 0.1);
    const f = (x) => x === 0 ? pv + p * n + fv : pv * Math.pow(1 + x, n) + p * (1 + x * t) * (Math.pow(1 + x, n) - 1) / x + fv;
    for (let i = 0; i < 200; i++) { const y = f(r), h = 1e-7 * Math.max(1, Math.abs(r)), d = (f(r + h) - y) / h; if (!isFinite(d) || d === 0) return E.NUM; const r2 = r - y / d; if (Math.abs(r2 - r) < 1e-12) return r2; r = r2; if (r <= -1) r = -0.999999; }
    return E.NUM;
  });
  def('IPMT', 'INTPER', { min: 4, max: 6, lift: ['n', 'n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([r, per, n, pv, fv, t]) => { fv = opt(fv, 0); t = opt(t, 0) ? 1 : 0; if (per < 1 || per > n) return E.NUM; const p = pmt(r, n, pv, fv, t); let ip; if (per === 1) ip = t ? 0 : -pv; else ip = t ? fvf(r, per - 2, p, pv, 1) - p : fvf(r, per - 1, p, pv, 0); return ip * r; });
  def('PPMT', 'PRINCPER', { min: 4, max: 6, lift: ['n', 'n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([r, per, n, pv, fv, t]) => { fv = opt(fv, 0); t = opt(t, 0) ? 1 : 0; if (per < 1 || per > n) return E.NUM; const p = pmt(r, n, pv, fv, t); const ip = FN.IPMT.f([r, per, n, pv, fv, t]); return isE(ip) ? ip : p - ip; });
  def('CUMIPMT', 'CUMUL.INTER', { min: 6, max: 6, lift: ['n', 'n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([r, n, pv, a, b, t]) => { if (r <= 0 || n <= 0 || pv <= 0 || a < 1 || b < a || b > n) return E.NUM; let s = 0; for (let k = Math.trunc(a); k <= Math.trunc(b); k++) s += FN.IPMT.f([r, k, n, pv, 0, t]); return s; });
  def('CUMPRINC', 'CUMUL.PRINCPER', { min: 6, max: 6, lift: ['n', 'n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([r, n, pv, a, b, t]) => { if (r <= 0 || n <= 0 || pv <= 0 || a < 1 || b < a || b > n) return E.NUM; let s = 0; for (let k = Math.trunc(a); k <= Math.trunc(b); k++) s += FN.PPMT.f([r, k, n, pv, 0, t]); return s; });
  def('ISPMT', 'ISPMT', { min: 4, max: 4, lift: ['n', 'n', 'n', 'n'], cat: 'fin' }, ([r, per, n, pv]) => pv * r * (per / n - 1));
  def('NPV', 'VAN', { min: 2, cat: 'fin' }, (a) => { const r = num(sc(a[0])); if (isE(r)) return r; const l = nums(a.slice(1)); if (isE(l)) return l; return l.reduce((s, v, i) => s + v / Math.pow(1 + r, i + 1), 0); });
  function irr(vals, g, dates) {
    const f = (r) => vals.reduce((s, v, i) => s + v / Math.pow(1 + r, dates ? (dates[i] - dates[0]) / 365 : i), 0);
    let r = g; for (let i = 0; i < 300; i++) { const y = f(r), h = 1e-7, d = (f(r + h) - y) / h; if (!isFinite(d) || d === 0) break; const r2 = r - y / d; if (Math.abs(r2 - r) < 1e-12) return r2; r = r2 <= -1 ? (r - 1) / 2 : r2; }
    // dichotomie de secours
    let lo = -0.99, hi = 10, flo = f(lo); if (flo * f(hi) > 0) return E.NUM; for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2, fm = f(m); if (Math.abs(fm) < 1e-10) return m; if (fm * flo < 0) hi = m; else { lo = m; flo = fm; } } return (lo + hi) / 2;
  }
  def('IRR', 'TRI', { min: 1, max: 2, cat: 'fin' }, ([v, g]) => { const l = nums([v]); if (isE(l)) return l; if (!l.some((x) => x > 0) || !l.some((x) => x < 0)) return E.NUM; return irr(l, num(opt(sc(g), 0.1))); });
  def('XNPV', 'VAN.PAIEMENTS', { min: 3, max: 3, cat: 'fin' }, ([r, v, d]) => { r = num(sc(r)); const l = flat(v).map(num), ds = flat(d).map(dateNum); if (l.length !== ds.length) return E.NUM; return l.reduce((s, x, i) => s + x / Math.pow(1 + r, (ds[i] - ds[0]) / 365), 0); });
  def('XIRR', 'TRI.PAIEMENTS', { min: 2, max: 3, cat: 'fin' }, ([v, d, g]) => { const l = flat(v).map(num), ds = flat(d).map(dateNum); if (l.length !== ds.length) return E.NUM; return irr(l, num(opt(sc(g), 0.1)), ds); });
  def('MIRR', 'TRIM', { min: 3, max: 3, cat: 'fin' }, ([v, fr, rr]) => { const l = nums([v]); if (isE(l)) return l; fr = num(sc(fr)); rr = num(sc(rr)); const n = l.length; let pos = 0, neg = 0; l.forEach((x, i) => { if (x > 0) pos += x * Math.pow(1 + rr, n - 1 - i); else neg += x / Math.pow(1 + fr, i); }); if (!pos || !neg) return E.DIV0; return Math.pow(-pos / neg, 1 / (n - 1)) - 1; });
  def('SLN', 'AMORLIN', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'fin' }, ([c, s, l]) => l === 0 ? E.DIV0 : (c - s) / l);
  def('SYD', 'SYD', { min: 4, max: 4, lift: ['n', 'n', 'n', 'n'], cat: 'fin' }, ([c, s, l, p]) => l <= 0 || p < 1 || p > l ? E.NUM : (c - s) * (l - p + 1) * 2 / (l * (l + 1)));
  def('DDB', 'DDB', { min: 4, max: 5, lift: ['n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([c, s, l, p, f]) => { f = opt(f, 2); if (l <= 0 || p < 1 || p > l) return E.NUM; let bv = c, dep = 0; for (let i = 1; i <= p; i++) { dep = Math.min(bv * f / l, Math.max(0, bv - s)); bv -= dep; } return dep; });
  def('DB', 'DB', { min: 4, max: 5, lift: ['n', 'n', 'n', 'n', 'n'], cat: 'fin' }, ([c, s, l, p, m]) => { m = opt(m, 12); if (l <= 0 || p < 1 || c < 0) return E.NUM; const rate = Math.round((1 - Math.pow(s / c, 1 / l)) * 1000) / 1000; let tot = 0, dep = c * rate * m / 12; if (p === 1) return dep; tot = dep; for (let i = 2; i <= p; i++) { dep = i > l ? (c - tot) * rate * (12 - m) / 12 : (c - tot) * rate; tot += dep; } return dep; });
  def('EFFECT', 'TAUX.EFFECTIF', { min: 2, max: 2, lift: ['n', 'n'], cat: 'fin' }, ([r, n]) => { n = Math.trunc(n); return r <= 0 || n < 1 ? E.NUM : Math.pow(1 + r / n, n) - 1; });
  def('NOMINAL', 'TAUX.NOMINAL', { min: 2, max: 2, lift: ['n', 'n'], cat: 'fin' }, ([r, n]) => { n = Math.trunc(n); return r <= 0 || n < 1 ? E.NUM : n * (Math.pow(1 + r, 1 / n) - 1); });
  def('RRI', 'TAUX.INT.EQUIV', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'fin', x: 1 }, ([n, pv, fv]) => n <= 0 || pv === 0 ? E.NUM : Math.pow(fv / pv, 1 / n) - 1);
  def('PDURATION', 'PDUREE', { min: 3, max: 3, lift: ['n', 'n', 'n'], cat: 'fin', x: 1 }, ([r, pv, fv]) => r <= 0 || pv <= 0 || fv <= 0 ? E.NUM : (Math.log(fv) - Math.log(pv)) / Math.log(1 + r));

  /* =====================================================================
     Information
     ===================================================================== */
  const isf = (en, fr, t, extra) => def(en, fr, Object.assign({ min: 1, max: 1, lift: ['v'], cat: 'info', errOk: true }, extra || {}), ([v]) => t(v === MISSING ? null : v));
  isf('ISBLANK', 'ESTVIDE', (v) => v === null);
  isf('ISNUMBER', 'ESTNUM', (v) => typeof v === 'number');
  isf('ISTEXT', 'ESTTEXTE', (v) => typeof v === 'string');
  isf('ISNONTEXT', 'ESTNONTEXTE', (v) => typeof v !== 'string');
  isf('ISLOGICAL', 'ESTLOGIQUE', (v) => typeof v === 'boolean');
  isf('ISERROR', 'ESTERREUR', (v) => v instanceof Err);
  isf('ISERR', 'ESTERR', (v) => v instanceof Err && v !== E.NA);
  isf('ISNA', 'ESTNA', (v) => v === E.NA);
  def('ISEVEN', 'EST.PAIR', { min: 1, max: 1, lift: ['n'], cat: 'info' }, ([x]) => Math.trunc(x) % 2 === 0);
  def('ISODD', 'EST.IMPAIR', { min: 1, max: 1, lift: ['n'], cat: 'info' }, ([x]) => Math.abs(Math.trunc(x) % 2) === 1);
  def('ISREF', 'ESTREF', { min: 1, max: 1, cat: 'info' }, ([v]) => v instanceof Ref || v instanceof Ref3);
  def('ISFORMULA', 'ESTFORMULE', { min: 1, max: 1, cat: 'info', x: 1 }, ([v]) => v instanceof Ref ? v.sh.fml.has(TB.key(v.r1, v.c1)) : E.VALUE);
  def('FORMULATEXT', 'FORMULETEXTE', { min: 1, max: 1, cat: 'info', x: 1 }, ([v]) => { if (!(v instanceof Ref)) return E.VALUE; const f = v.sh.fml.get(TB.key(v.r1, v.c1)); return f ? '=' + TB.Formula.toUser(f.src) : E.NA; });
  def('NA', 'NA', { min: 0, max: 0, cat: 'info' }, () => E.NA);
  def('TYPE', 'TYPE', { min: 1, max: 1, cat: 'info' }, ([v]) => { if (v instanceof Arr || (v instanceof Ref && !v.single())) return 64; v = sc(v); return v === null || typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : v instanceof Err ? 16 : 1; });
  def('ERROR.TYPE', 'TYPE.ERREUR', { min: 1, max: 1, lift: ['v'], cat: 'info', errOk: true }, ([v]) => v instanceof Err ? TB.ERR_NUM[v.e] || E.NA : E.NA);
  def('SHEET', 'FEUILLE', { min: 0, max: 1, cat: 'info', x: 1 }, ([v], cx) => { if (v === undefined || v === MISSING) return cx.wb.sheets.indexOf(cx.sh) + 1; if (v instanceof Ref) return cx.wb.sheets.indexOf(v.sh) + 1; const s = cx.wb.sheet(str(sc(v))); return s ? cx.wb.sheets.indexOf(s) + 1 : E.NA; });
  def('SHEETS', 'FEUILLES', { min: 0, max: 1, cat: 'info', x: 1 }, ([v], cx) => v instanceof Ref3 ? v.list.length : v instanceof Ref ? 1 : cx.wb.sheets.length);
  def('CELL', 'CELLULE', { min: 1, max: 2, cat: 'info' }, ([t, ref], cx) => {
    const k = str(sc(t)); if (isE(k)) return k; const R = ref instanceof Ref ? ref : new Ref(cx.sh, cx.r, cx.c, cx.r, cx.c);
    const v = R.v(0, 0), st = cx.wb.styles.get(R.sh.styleAt(R.r1, R.c1));
    switch (k.toLowerCase()) {
      case 'address': case 'adresse': return TB.addr(R.r1, R.c1, true, true);
      case 'row': case 'ligne': return R.r1 + 1;
      case 'col': case 'colonne': return R.c1 + 1;
      case 'contents': case 'contenu': return v === null ? 0 : v;
      case 'type': return v === null ? 'b' : typeof v === 'string' ? 'l' : 'v';
      case 'width': case 'largeur': return Math.round((R.sh.colWidth(R.c1) - 5) / 7);
      case 'format': { const nf = st.nf || 'General'; if (nf === 'General') return 'G'; if (TB.Fmt.isDate(nf)) return 'D1'; const d = TB.Fmt.decimals(nf) || 0; return (/%/.test(nf) ? 'P' : /€|\$/.test(nf) ? 'C' : /,/.test(nf) ? ',' : 'F') + d; }
      case 'filename': case 'nomfichier': return '[' + (cx.wb.fileName || 'Classeur') + ']' + R.sh.name;
      case 'protect': case 'protege': return st.lk === false ? 0 : 1;
      case 'prefix': case 'prefixe': return typeof v === 'string' ? (st.ha === 'right' ? '"' : st.ha === 'center' ? '^' : "'") : '';
    }
    return E.VALUE;
  });
  def('INFO', 'INFORMATIONS', { min: 1, max: 1, lift: ['s'], cat: 'info' }, ([k], cx) => { k = k.toLowerCase(); if (k === 'numfile' || k === 'nbfich') return cx.wb.sheets.length; if (k === 'recalc' || k === 'calcul') return cx.wb.settings.calc === 'manual' ? 'Manuel' : 'Automatique'; if (k === 'system' || k === 'systexpl') return 'pcdos'; if (k === 'release' || k === 'version') return '16.0'; if (k === 'osversion' || k === 'syst') return 'Suite MAG'; return E.VALUE; });

  /* =====================================================================
     Ingénierie
     ===================================================================== */
  const toBase = (n, b, digits, places) => { n = Math.trunc(n); const lim = Math.pow(b, digits); if (n < -lim / 2 || n >= lim / 2) return E.NUM; let s = (n < 0 ? lim + n : n).toString(b).toUpperCase(); if (places !== undefined && places !== MISSING) { if (n < 0) return s; if (s.length > places) return E.NUM; s = s.padStart(Math.trunc(places), '0'); } return s; };
  const fromBase = (s, b, digits) => { s = String(s).trim(); if (s.length > digits || !s.length) return E.NUM; const v = parseInt(s, b); if (isNaN(v) || !new RegExp('^[' + '0123456789ABCDEF'.slice(0, b) + ']+$', 'i').test(s)) return E.NUM; const lim = Math.pow(b, digits); return s.length === digits && v >= lim / 2 ? v - lim : v; };
  def('DEC2BIN', 'DECBIN', { min: 1, max: 2, lift: ['n', 'v'], cat: 'eng' }, ([n, p]) => toBase(n, 2, 10, p));
  def('DEC2HEX', 'DECHEX', { min: 1, max: 2, lift: ['n', 'v'], cat: 'eng' }, ([n, p]) => toBase(n, 16, 10, p));
  def('DEC2OCT', 'DECOCT', { min: 1, max: 2, lift: ['n', 'v'], cat: 'eng' }, ([n, p]) => toBase(n, 8, 10, p));
  def('BIN2DEC', 'BINDEC', { min: 1, max: 1, lift: ['s'], cat: 'eng' }, ([s]) => fromBase(s, 2, 10));
  def('HEX2DEC', 'HEXDEC', { min: 1, max: 1, lift: ['s'], cat: 'eng' }, ([s]) => fromBase(s, 16, 10));
  def('OCT2DEC', 'OCTDEC', { min: 1, max: 1, lift: ['s'], cat: 'eng' }, ([s]) => fromBase(s, 8, 10));
  def('BIN2HEX', 'BINHEX', { min: 1, max: 2, lift: ['s', 'v'], cat: 'eng' }, ([s, p]) => { const v = fromBase(s, 2, 10); return isE(v) ? v : toBase(v, 16, 10, p); });
  def('HEX2BIN', 'HEXBIN', { min: 1, max: 2, lift: ['s', 'v'], cat: 'eng' }, ([s, p]) => { const v = fromBase(s, 16, 10); return isE(v) ? v : toBase(v, 2, 10, p); });
  def('DELTA', 'DELTA', { min: 1, max: 2, lift: ['n', 'n'], cat: 'eng' }, ([a, b]) => a === opt(b, 0) ? 1 : 0);
  def('GESTEP', 'SUP.SEUIL', { min: 1, max: 2, lift: ['n', 'n'], cat: 'eng' }, ([a, b]) => a >= opt(b, 0) ? 1 : 0);
  def('BITAND', 'BITET', { min: 2, max: 2, lift: ['n', 'n'], cat: 'eng', x: 1 }, ([a, b]) => Number(BigInt(Math.trunc(a)) & BigInt(Math.trunc(b))));
  def('BITOR', 'BITOU', { min: 2, max: 2, lift: ['n', 'n'], cat: 'eng', x: 1 }, ([a, b]) => Number(BigInt(Math.trunc(a)) | BigInt(Math.trunc(b))));
  def('BITXOR', 'BITOUEXCLUSIF', { min: 2, max: 2, lift: ['n', 'n'], cat: 'eng', x: 1 }, ([a, b]) => Number(BigInt(Math.trunc(a)) ^ BigInt(Math.trunc(b))));
  // CONVERT : unités courantes (longueurs, masses, volumes, surfaces, températures, temps, énergie, puissance, pression, force)
  const U = {
    m: ['L', 1], mi: ['L', 1609.344], Nmi: ['L', 1852], in: ['L', 0.0254], ft: ['L', 0.3048], yd: ['L', 0.9144], ang: ['L', 1e-10], ell: ['L', 1.143], Pica: ['L', 0.0254 / 6],
    g: ['M', 1], lbm: ['M', 453.59237], ozm: ['M', 28.349523125], u: ['M', 1.66053906660e-24], stone: ['M', 6350.29318], ton: ['M', 907184.74], uk_ton: ['M', 1016046.9088],
    l: ['V', 1], L: ['V', 1], lt: ['V', 1], gal: ['V', 3.785411784], uk_gal: ['V', 4.54609], qt: ['V', 0.946352946], pt: ['V', 0.473176473], cup: ['V', 0.2365882365], tbs: ['V', 0.01478676478125], tsp: ['V', 0.00492892159375], oz: ['V', 0.0295735295625], m3: ['V', 1000], 'ft3': ['V', 28.316846592], 'in3': ['V', 0.016387064], barrel: ['V', 158.987294928],
    m2: ['A', 1], 'ft2': ['A', 0.09290304], 'in2': ['A', 0.00064516], ha: ['A', 10000], ar: ['A', 100], acre: ['A', 4046.8564224], 'mi2': ['A', 2589988.110336], 'yd2': ['A', 0.83612736],
    sec: ['T', 1], s: ['T', 1], mn: ['T', 60], min: ['T', 60], hr: ['T', 3600], day: ['T', 86400], d: ['T', 86400], yr: ['T', 31557600],
    J: ['E', 1], e: ['E', 1e-7], c: ['E', 4.184], cal: ['E', 4.1868], eV: ['E', 1.602176634e-19], ev: ['E', 1.602176634e-19], Wh: ['E', 3600], wh: ['E', 3600], BTU: ['E', 1055.05585262], btu: ['E', 1055.05585262], HPh: ['E', 2684519.537696],
    W: ['P', 1], w: ['P', 1], HP: ['P', 745.69987158227], h: ['P', 745.69987158227], PS: ['P', 735.49875],
    Pa: ['Pr', 1], p: ['Pr', 1], atm: ['Pr', 101325], at: ['Pr', 101325], mmHg: ['Pr', 133.322387415], bar: ['Pr', 100000], psi: ['Pr', 6894.75729316836], Torr: ['Pr', 133.322368421],
    N: ['F', 1], dyn: ['F', 1e-5], dy: ['F', 1e-5], lbf: ['F', 4.4482216152605], pond: ['F', 0.00980665],
    'm/s': ['S', 1], 'm/h': ['S', 1 / 3600], 'mph': ['S', 0.44704], kn: ['S', 0.514444444444444], admkn: ['S', 0.514773333333333]
  };
  const PFX = { Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 1e1, d: 1e-1, c: 1e-2, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18 };
  function unit(u) {
    if (U[u]) return U[u];
    const m = /^(.*?)(2|3)$/.exec(u);
    for (const p of Object.keys(PFX).sort((a, b) => b.length - a.length)) if (u.startsWith(p) && u.length > p.length) {
      const base = u.slice(p.length);
      if (U[base]) { let k = PFX[p]; if (/2$/.test(base) && U[base][0] === 'A') k = k * k; else if (/3$/.test(base) && U[base][0] === 'V') k = k * k * k; return [U[base][0], U[base][1] * k]; }
    }
    void m; return null;
  }
  def('CONVERT', 'CONVERT', { min: 3, max: 3, lift: ['n', 's', 's'], cat: 'eng' }, ([x, a, b]) => {
    const T = { C: (v) => v, cel: (v) => v, F: (v) => (v - 32) * 5 / 9, fah: (v) => (v - 32) * 5 / 9, K: (v) => v - 273.15, kel: (v) => v - 273.15, Rank: (v) => (v - 491.67) * 5 / 9, Reau: (v) => v * 1.25 };
    const TI = { C: (v) => v, cel: (v) => v, F: (v) => v * 9 / 5 + 32, fah: (v) => v * 9 / 5 + 32, K: (v) => v + 273.15, kel: (v) => v + 273.15, Rank: (v) => (v + 273.15) * 9 / 5, Reau: (v) => v * 0.8 };
    if (T[a] && TI[b]) return R15(TI[b](T[a](x)));
    const ua = unit(a), ub = unit(b); if (!ua || !ub || ua[0] !== ub[0]) return E.NA;
    return R15(x * ua[1] / ub[1]);
  });

  /* =====================================================================
     Base de données (BDSOMME…)
     ===================================================================== */
  function dbRows(db, field, crit2) {
    const D = grid(db), C = grid(crit2); if (D.length < 1) return E.VALUE;
    const hdr = D[0].map((x) => String(x == null ? '' : x).toLowerCase());
    let fi = -1; const f = sc(field);
    if (f !== MISSING && f !== undefined) { if (typeof f === 'number') fi = Math.trunc(f) - 1; else fi = hdr.indexOf(String(f).toLowerCase()); if (fi < 0 || fi >= hdr.length) return E.VALUE; }
    const ch = C[0].map((x) => String(x == null ? '' : x).toLowerCase());
    const conds = C.slice(1).map((row) => row.map((v, j) => v === null || v === '' ? null : [hdr.indexOf(ch[j]), crit(v)]).filter(Boolean));
    const rows = D.slice(1).filter((r) => !conds.length || conds.some((cs) => cs.every(([k, t]) => k >= 0 && t(r[k]))));
    return { rows, fi };
  }
  const dbf = (en, fr, agg) => def(en, fr, { min: 3, max: 3, cat: 'db' }, ([d, f, c], cx) => { const x = dbRows(d, f, c); if (isE(x)) return x; const vals = x.rows.map((r) => x.fi >= 0 ? r[x.fi] : null); return agg(vals, cx); });
  const numsOf = (vals) => vals.filter((v) => typeof v === 'number');
  dbf('DSUM', 'BDSOMME', (v) => sum(numsOf(v)));
  dbf('DAVERAGE', 'BDMOYENNE', (v) => { const l = numsOf(v); return l.length ? mean(l) : E.DIV0; });
  dbf('DCOUNT', 'BDNB', (v) => numsOf(v).length);
  dbf('DCOUNTA', 'BDNBVAL', (v) => v.filter((x) => x !== null && x !== '').length);
  dbf('DMAX', 'BDMAX', (v) => { const l = numsOf(v); return l.length ? Math.max(...l) : 0; });
  dbf('DMIN', 'BDMIN', (v) => { const l = numsOf(v); return l.length ? Math.min(...l) : 0; });
  dbf('DPRODUCT', 'BDPRODUIT', (v) => numsOf(v).reduce((a, b) => a * b, 1));
  dbf('DGET', 'BDLIRE', (v) => v.length === 1 ? (v[0] === null ? 0 : v[0]) : v.length ? E.NUM : E.VALUE);
  dbf('DSTDEV', 'BDECARTYPE', (v) => { const x = variance(numsOf(v)); return isE(x) ? x : Math.sqrt(x); });
  dbf('DVAR', 'BDVAR', (v) => variance(numsOf(v)));

  /* =====================================================================
     Aide : catégories, syntaxe et description (barre de formule, « Insérer une fonction »)
     ===================================================================== */
  TB.FN_CATS = { math: 'Maths et trigonométrie', stat: 'Statistiques', logic: 'Logique', lookup: 'Recherche et référence', text: 'Texte', date: 'Date et heure', fin: 'Finances', info: 'Information', eng: 'Ingénierie', db: 'Base de données' };
  // syntaxe (arguments) et description des fonctions les plus courantes ; les autres : nom et catégorie
  const D = {
    SUM: ['nombre1; [nombre2]; …', 'Additionne des nombres ou des plages.'], AVERAGE: ['nombre1; [nombre2]; …', 'Moyenne arithmétique.'], COUNT: ['valeur1; [valeur2]; …', 'Compte les cellules qui contiennent des nombres.'], COUNTA: ['valeur1; [valeur2]; …', 'Compte les cellules non vides.'], COUNTBLANK: ['plage', 'Compte les cellules vides.'],
    MAX: ['nombre1; [nombre2]; …', 'Plus grande valeur.'], MIN: ['nombre1; [nombre2]; …', 'Plus petite valeur.'], IF: ['test_logique; [valeur_si_vrai]; [valeur_si_faux]', 'Renvoie une valeur si la condition est vraie, une autre sinon.'], IFS: ['test1; valeur1; [test2; valeur2]; …', 'Première condition vraie.'],
    IFERROR: ['valeur; valeur_si_erreur', 'Valeur de remplacement en cas d\'erreur.'], IFNA: ['valeur; valeur_si_na', 'Valeur de remplacement si #N/A.'], AND: ['logique1; [logique2]; …', 'VRAI si toutes les conditions sont vraies.'], OR: ['logique1; [logique2]; …', 'VRAI si au moins une condition est vraie.'], NOT: ['logique', 'Inverse une valeur logique.'],
    VLOOKUP: ['valeur_cherchée; table; no_index_col; [valeur_proche]', 'Cherche dans la 1re colonne d\'une table et renvoie la valeur d\'une autre colonne (FAUX : correspondance exacte).'], HLOOKUP: ['valeur_cherchée; table; no_index_lig; [valeur_proche]', 'Recherche horizontale.'],
    XLOOKUP: ['valeur_cherchée; tableau_recherche; tableau_renvoyé; [si_non_trouvé]; [mode_correspondance]; [mode_recherche]', 'Recherche moderne, dans les deux sens, exacte par défaut.'], INDEX: ['tableau; no_ligne; [no_colonne]', 'Valeur à l\'intersection d\'une ligne et d\'une colonne.'], MATCH: ['valeur_cherchée; tableau_recherche; [type]', 'Position d\'une valeur (0 : exacte).'], XMATCH: ['valeur_cherchée; tableau; [mode_correspondance]; [mode_recherche]', 'Position d\'une valeur (exacte par défaut).'],
    COUNTIF: ['plage; critère', 'Compte les cellules qui remplissent un critère (« >10 », « Paris », « a* »).'], COUNTIFS: ['plage1; critère1; [plage2; critère2]; …', 'Compte avec plusieurs critères.'], SUMIF: ['plage; critère; [somme_plage]', 'Somme des cellules qui remplissent un critère.'], SUMIFS: ['somme_plage; plage1; critère1; [plage2; critère2]; …', 'Somme avec plusieurs critères.'], AVERAGEIF: ['plage; critère; [moyenne_plage]', 'Moyenne avec un critère.'], AVERAGEIFS: ['moyenne_plage; plage1; critère1; …', 'Moyenne avec plusieurs critères.'], MAXIFS: ['max_plage; plage1; critère1; …', 'Maximum avec critères.'], MINIFS: ['min_plage; plage1; critère1; …', 'Minimum avec critères.'],
    ROUND: ['nombre; no_chiffres', 'Arrondit au nombre de décimales indiqué.'], ROUNDUP: ['nombre; no_chiffres', 'Arrondit vers le haut (en s\'éloignant de 0).'], ROUNDDOWN: ['nombre; no_chiffres', 'Arrondit vers le bas (vers 0).'], INT: ['nombre', 'Partie entière (vers le bas).'], MOD: ['nombre; diviseur', 'Reste de la division.'], ABS: ['nombre', 'Valeur absolue.'], SQRT: ['nombre', 'Racine carrée.'], POWER: ['nombre; puissance', 'Puissance.'], PI: ['', 'Valeur de π.'], PRODUCT: ['nombre1; [nombre2]; …', 'Produit.'], SUMPRODUCT: ['matrice1; [matrice2]; …', 'Somme des produits terme à terme.'], CEILING: ['nombre; précision', 'Arrondit au multiple supérieur.'], FLOOR: ['nombre; précision', 'Arrondit au multiple inférieur.'], MROUND: ['nombre; multiple', 'Arrondit au multiple le plus proche.'], TRUNC: ['nombre; [no_chiffres]', 'Tronque.'], RAND: ['', 'Nombre aléatoire entre 0 et 1.'], RANDBETWEEN: ['min; max', 'Entier aléatoire.'], SUBTOTAL: ['no_fonction; réf1; …', 'Sous-total (9 = somme, 1 = moyenne… ; +100 ignore les lignes masquées).'],
    MEDIAN: ['nombre1; …', 'Médiane.'], 'STDEV.S': ['nombre1; …', 'Écart type d\'un échantillon.'], 'STDEV.P': ['nombre1; …', 'Écart type d\'une population.'], LARGE: ['matrice; k', 'k-ième plus grande valeur.'], SMALL: ['matrice; k', 'k-ième plus petite valeur.'], RANK: ['nombre; référence; [ordre]', 'Rang d\'un nombre dans une liste.'], 'RANK.EQ': ['nombre; référence; [ordre]', 'Rang d\'un nombre dans une liste.'],
    CONCATENATE: ['texte1; [texte2]; …', 'Assemble des textes.'], CONCAT: ['texte1; …', 'Assemble des textes et des plages.'], TEXTJOIN: ['séparateur; ignorer_vides; texte1; …', 'Assemble avec un séparateur.'], LEFT: ['texte; [nb_car]', 'Premiers caractères.'], RIGHT: ['texte; [nb_car]', 'Derniers caractères.'], MID: ['texte; no_départ; nb_car', 'Caractères au milieu d\'un texte.'], LEN: ['texte', 'Nombre de caractères.'], FIND: ['texte_cherché; texte; [no_départ]', 'Position (respecte la casse).'], SEARCH: ['texte_cherché; texte; [no_départ]', 'Position (sans casse, jokers).'], SUBSTITUTE: ['texte; ancien; nouveau; [no_position]', 'Remplace un texte par un autre.'], REPLACE: ['ancien_texte; no_départ; nb_car; nouveau_texte', 'Remplace des caractères.'], UPPER: ['texte', 'Majuscules.'], LOWER: ['texte', 'Minuscules.'], PROPER: ['texte', 'Majuscule à chaque mot.'], TRIM: ['texte', 'Supprime les espaces en trop.'], TEXT: ['valeur; format', 'Met en forme un nombre (« 0,00 », « jj/mm/aaaa »…).'], VALUE: ['texte', 'Convertit un texte en nombre.'], TEXTBEFORE: ['texte; délimiteur; [no_instance]; …', 'Texte avant un délimiteur.'], TEXTAFTER: ['texte; délimiteur; [no_instance]; …', 'Texte après un délimiteur.'], TEXTSPLIT: ['texte; délim_col; [délim_lig]; …', 'Découpe un texte en colonnes / lignes.'],
    TODAY: ['', 'Date du jour.'], NOW: ['', 'Date et heure actuelles.'], DATE: ['année; mois; jour', 'Construit une date.'], TIME: ['heure; minute; seconde', 'Construit une heure.'], YEAR: ['date', 'Année.'], MONTH: ['date', 'Mois (1 à 12).'], DAY: ['date', 'Jour du mois.'], WEEKDAY: ['date; [type]', 'Jour de la semaine (type 2 : lundi = 1).'], WEEKNUM: ['date; [type]', 'Numéro de semaine.'], ISOWEEKNUM: ['date', 'Numéro de semaine ISO.'], EDATE: ['date; mois', 'Date décalée de n mois.'], EOMONTH: ['date; mois', 'Dernier jour du mois (décalé de n mois).'], NETWORKDAYS: ['début; fin; [jours_fériés]', 'Jours ouvrés entre deux dates.'], WORKDAY: ['début; nb_jours; [jours_fériés]', 'Date après n jours ouvrés.'], DATEDIF: ['début; fin; unité', 'Écart entre deux dates (« Y », « M », « D », « YM », « MD », « YD »).'], DAYS: ['fin; début', 'Nombre de jours.'], YEARFRAC: ['début; fin; [base]', 'Fraction d\'année.'],
    PMT: ['taux; npm; va; [vc]; [type]', 'Mensualité d\'un emprunt (taux par période).'], PV: ['taux; npm; vpm; [vc]; [type]', 'Valeur actuelle.'], FV: ['taux; npm; vpm; [va]; [type]', 'Valeur future.'], RATE: ['npm; vpm; va; [vc]; [type]; [estimation]', 'Taux d\'intérêt par période.'], NPER: ['taux; vpm; va; [vc]; [type]', 'Nombre de périodes.'], NPV: ['taux; valeur1; …', 'Valeur actuelle nette.'], IRR: ['valeurs; [estimation]', 'Taux de rendement interne.'], IPMT: ['taux; pér; npm; va; [vc]; [type]', 'Part d\'intérêts d\'une échéance.'], PPMT: ['taux; pér; npm; va; [vc]; [type]', 'Part de capital d\'une échéance.'], SLN: ['coût; valeur_rés; durée', 'Amortissement linéaire.'],
    ISBLANK: ['valeur', 'VRAI si la cellule est vide.'], ISNUMBER: ['valeur', 'VRAI si c\'est un nombre.'], ISTEXT: ['valeur', 'VRAI si c\'est du texte.'], ISERROR: ['valeur', 'VRAI si c\'est une erreur.'], ISNA: ['valeur', 'VRAI si c\'est #N/A.'], NA: ['', 'Renvoie #N/A.'],
    FILTER: ['tableau; inclure; [si_vide]', 'Filtre les lignes selon une condition (résultat propagé).'], SORT: ['tableau; [index_tri]; [ordre_tri]; [par_colonne]', 'Trie (résultat propagé).'], SORTBY: ['tableau; par_tableau1; [ordre1]; …', 'Trie selon d\'autres plages.'], UNIQUE: ['tableau; [par_colonne]; [une_seule_fois]', 'Valeurs uniques (résultat propagé).'], SEQUENCE: ['lignes; [colonnes]; [début]; [pas]', 'Suite de nombres (résultat propagé).'], TRANSPOSE: ['tableau', 'Échange lignes et colonnes.'], CHOOSE: ['no_index; valeur1; valeur2; …', 'Choisit une valeur dans une liste.'], OFFSET: ['réf; lignes; colonnes; [hauteur]; [largeur]', 'Référence décalée.'], INDIRECT: ['réf_texte; [a1]', 'Référence écrite sous forme de texte.'], ROW: ['[référence]', 'Numéro de ligne.'], COLUMN: ['[référence]', 'Numéro de colonne.'], ROWS: ['tableau', 'Nombre de lignes.'], COLUMNS: ['tableau', 'Nombre de colonnes.'], LET: ['nom1; valeur1; …; calcul', 'Nomme des valeurs intermédiaires.'], LAMBDA: ['[paramètre1]; …; calcul', 'Fonction personnalisée.'],
    CONVERT: ['nombre; de_unité; vers_unité', 'Convertit des unités (« m », « mm », « in », « ft », « kg », « l », « m2 », « C », « F »…).'], HYPERLINK: ['adresse; [nom_convivial]', 'Lien hypertexte.']
  };
  Object.keys(FN).forEach((k) => { INFO[k] = { args: (D[k] || [''])[0], desc: (D[k] || ['', ''])[1] || '', cat: FN[k].cat || 'math' }; });
  TB.fnList = () => Object.keys(FN).sort();
  TB.fnArgs = (canon) => { const a = (INFO[canon] || {}).args || ''; return TB.loc.arg === ';' ? a : a.replace(/;/g, ','); };
})(typeof window !== 'undefined' ? window : globalThis);
