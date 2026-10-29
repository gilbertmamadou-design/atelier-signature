/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-tableur/tb-core.js : ne pas modifier ici. */
/* Tableur — noyau : adresses de cellules, erreurs, dates (système 1900), paramètres régionaux (séparateurs, langue des
   fonctions), lecture d'une saisie (nombres, dates, heures, pourcentages, monnaie), styles de cellule (réserve partagée).
   Exposé sous window.Tableur (alias TB). Aucun accès au DOM : le moteur (tb-core, tb-format, tb-formula, tb-functions,
   tb-engine) tourne aussi dans Node pour les essais. */
(function (G) {
  'use strict';
  const TB = G.Tableur = G.Tableur || {};
  TB.MAX_ROWS = 1048576; TB.MAX_COLS = 16384;

  /* ---------------- adresses ---------------- */
  const COLN = [];
  TB.colName = function (c) { if (COLN[c]) return COLN[c]; let s = '', n = c + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } if (c < 20000) COLN[c] = s; return s; };
  TB.colIndex = function (s) { s = String(s).toUpperCase(); let n = 0; for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n - 1; };
  TB.addr = (r, c, ra, ca) => (ca ? '$' : '') + TB.colName(c) + (ra ? '$' : '') + (r + 1);
  TB.parseAddr = function (s) { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(s).trim()); if (!m) return null; const r = +m[2] - 1, c = TB.colIndex(m[1]); if (r < 0 || r >= TB.MAX_ROWS || c >= TB.MAX_COLS) return null; return { r, c }; };
  /** « A1:B5 », « A:C », « 3:7 », « A1 » → {r1,c1,r2,c2} */
  TB.parseRange = function (s) {
    s = String(s || '').trim().replace(/\$/g, ''); if (!s) return null;
    const p = s.split(':');
    if (p.length === 1) { const a = TB.parseAddr(p[0]); return a ? { r1: a.r, c1: a.c, r2: a.r, c2: a.c } : null; }
    if (p.length !== 2) return null;
    if (/^[A-Za-z]{1,3}$/.test(p[0]) && /^[A-Za-z]{1,3}$/.test(p[1])) { const a = TB.colIndex(p[0]), b = TB.colIndex(p[1]); return { r1: 0, c1: Math.min(a, b), r2: TB.MAX_ROWS - 1, c2: Math.max(a, b) }; }
    if (/^\d+$/.test(p[0]) && /^\d+$/.test(p[1])) { const a = +p[0] - 1, b = +p[1] - 1; return { r1: Math.min(a, b), c1: 0, r2: Math.max(a, b), c2: TB.MAX_COLS - 1 }; }
    const a = TB.parseAddr(p[0]), b = TB.parseAddr(p[1]); if (!a || !b) return null;
    return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
  };
  TB.rangeStr = function (g, abs) {
    if (!g) return '';
    if (g.r1 === 0 && g.r2 >= TB.MAX_ROWS - 1) return (abs ? '$' : '') + TB.colName(g.c1) + ':' + (abs ? '$' : '') + TB.colName(g.c2);
    if (g.c1 === 0 && g.c2 >= TB.MAX_COLS - 1) return (abs ? '$' : '') + (g.r1 + 1) + ':' + (abs ? '$' : '') + (g.r2 + 1);
    const a = TB.addr(g.r1, g.c1, abs, abs); return g.r1 === g.r2 && g.c1 === g.c2 ? a : a + ':' + TB.addr(g.r2, g.c2, abs, abs);
  };
  TB.quoteSheet = (n) => /^[A-Za-z_À-ɏ][A-Za-z0-9_.À-ɏ]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) && !/^(R\d*C\d*|TRUE|FALSE|VRAI|FAUX)$/i.test(n) ? n : "'" + String(n).replace(/'/g, "''") + "'";
  TB.key = (r, c) => r * 16384 + c;
  TB.unkey = (k) => ({ r: Math.floor(k / 16384), c: k % 16384 });
  TB.inRange = (g, r, c) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
  TB.intersect = (a, b) => { const r1 = Math.max(a.r1, b.r1), r2 = Math.min(a.r2, b.r2), c1 = Math.max(a.c1, b.c1), c2 = Math.min(a.c2, b.c2); return r1 <= r2 && c1 <= c2 ? { r1, c1, r2, c2 } : null; };
  TB.union = (a, b) => ({ r1: Math.min(a.r1, b.r1), c1: Math.min(a.c1, b.c1), r2: Math.max(a.r2, b.r2), c2: Math.max(a.c2, b.c2) });
  TB.sameRange = (a, b) => !!a && !!b && a.r1 === b.r1 && a.r2 === b.r2 && a.c1 === b.c1 && a.c2 === b.c2;
  /** g privé de x : liste de rectangles (au plus 4) */
  TB.subtract = (g, x) => { if (!TB.intersect(g, x)) return [g]; const out = []; if (x.r1 > g.r1) out.push({ r1: g.r1, c1: g.c1, r2: x.r1 - 1, c2: g.c2 }); if (x.r2 < g.r2) out.push({ r1: x.r2 + 1, c1: g.c1, r2: g.r2, c2: g.c2 }); const r1 = Math.max(g.r1, x.r1), r2 = Math.min(g.r2, x.r2); if (x.c1 > g.c1) out.push({ r1, c1: g.c1, r2, c2: x.c1 - 1 }); if (x.c2 < g.c2) out.push({ r1, c1: x.c2 + 1, r2, c2: g.c2 }); return out; };
  TB.rangeSize = (g) => (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1);

  /* ---------------- erreurs ---------------- */
  class Err { constructor(code) { this.e = code; } toString() { return this.e; } }
  TB.Err = Err;
  const E = TB.E = {};
  [['NULL', '#NULL!'], ['DIV0', '#DIV/0!'], ['VALUE', '#VALUE!'], ['REF', '#REF!'], ['NAME', '#NAME?'], ['NUM', '#NUM!'], ['NA', '#N/A'], ['SPILL', '#SPILL!'], ['CALC', '#CALC!'], ['GETTING', '#GETTING_DATA'], ['CIRC', '#CIRC!']].forEach(([k, v]) => { E[k] = new Err(v); E[v] = E[k]; });
  TB.isErr = (v) => v instanceof Err;
  TB.errOf = (code) => E[code] || E[String(code).toUpperCase()] || null;
  TB.ERR_FR = { '#NULL!': '#NUL!', '#VALUE!': '#VALEUR!', '#NAME?': '#NOM?', '#NUM!': '#NOMBRE!', '#SPILL!': '#PROPAGATION!', '#DIV/0!': '#DIV/0!', '#REF!': '#REF!', '#N/A': '#N/A', '#CALC!': '#CALC!', '#GETTING_DATA': '#CHARGEMENT_DONNEES', '#CIRC!': '#CIRC!' };
  TB.ERR_EN = {}; Object.keys(TB.ERR_FR).forEach((k) => { TB.ERR_EN[TB.ERR_FR[k]] = k; });
  TB.ERR_NUM = { '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4, '#NAME?': 5, '#NUM!': 6, '#N/A': 7, '#GETTING_DATA': 8, '#SPILL!': 9, '#CALC!': 14, '#CIRC!': 3 };
  TB.ERR_HELP = { '#DIV/0!': 'Division par zéro (ou par une cellule vide).', '#N/A': 'Valeur non disponible : la recherche n\'a rien trouvé.', '#VALUE!': 'Type de valeur incorrect (du texte là où un nombre est attendu…).', '#REF!': 'Référence non valide (cellule supprimée, hors de la feuille).', '#NAME?': 'Nom inconnu : fonction mal orthographiée ou nom non défini.', '#NUM!': 'Nombre non valide (résultat trop grand, racine d\'un nombre négatif…).', '#NULL!': 'Intersection vide entre deux plages.', '#SPILL!': 'Le résultat matriciel ne peut pas se propager : des cellules voisines ne sont pas vides.', '#CALC!': 'Calcul impossible (tableau vide…).', '#CIRC!': 'Référence circulaire.' };
  TB.errText = (e) => TB.loc.fn === 'fr' ? (TB.ERR_FR[e.e] || e.e) : e.e;

  /* ---------------- paramètres régionaux ---------------- */
  // sep : 'fr' → « ; » entre arguments, virgule décimale ; 'en' → « , » et point décimal. fn : langue des noms de fonctions.
  TB.loc = { sep: 'fr', fn: 'fr', dec: ',', arg: ';', arrCol: '.', arrRow: ';', thou: ' ' };
  TB.setLocale = function (o) {
    o = o || {};
    if (o.sep) TB.loc.sep = o.sep; if (o.fn) TB.loc.fn = o.fn;
    const fr = TB.loc.sep === 'fr';
    Object.assign(TB.loc, fr ? { dec: ',', arg: ';', arrCol: '.', arrRow: ';', thou: ' ' } : { dec: '.', arg: ',', arrCol: ',', arrRow: ';', thou: ',' });
    TB.fmtCache && TB.fmtCache.clear && TB.fmtCache.clear();
  };
  TB.TRUE = () => TB.loc.fn === 'fr' ? 'VRAI' : 'TRUE';
  TB.FALSE = () => TB.loc.fn === 'fr' ? 'FAUX' : 'FALSE';
  TB.boolText = (b) => b ? TB.TRUE() : TB.FALSE();
  TB.MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  TB.MONTHS_S = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  TB.DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  TB.DAYS_S = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  TB.MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  TB.DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ---------------- dates (numéros de série Excel, système 1900, avec le 29/02/1900 fictif) ---------------- */
  const DAY = 86400000, EPOCH = Date.UTC(1899, 11, 30);
  TB.serial = function (y, m, d) { // m : 1 à 12 (dépassements acceptés comme DATE())
    if (y >= 0 && y < 1900) y += 1900;
    const t = Date.UTC(y, m - 1, 1) + (d - 1) * DAY;
    let s = Math.round((t - EPOCH) / DAY);
    if (s < 61) { if (y === 1900 && m === 2 && d === 29) return 60; s -= 1; }
    return s;
  };
  TB.ymd = function (s) {
    s = Math.floor(s);
    if (s === 60) return { y: 1900, m: 2, d: 29, wd: 3 };
    const t = EPOCH + (s < 60 ? s + 1 : s) * DAY, dt = new Date(t);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: s < 60 ? (dt.getUTCDay() + 6) % 7 : dt.getUTCDay() };
  };
  TB.weekday = (s) => s < 60 ? ((Math.floor(s) + 6) % 7) : ((Math.floor(s) - 1) % 7 + 7) % 7; // 0 = dimanche (Excel : 1 = dimanche le 1/1/1900)
  TB.hms = function (s) { let f = s - Math.floor(s); let ms = Math.round(f * DAY); if (ms >= DAY) ms = DAY - 1; const h = Math.floor(ms / 3600000), mi = Math.floor(ms % 3600000 / 60000), se = (ms % 60000) / 1000; return { h, mi, s: se }; };
  TB.fromJsDate = (d) => TB.serial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000) / 86400;
  TB.toJsDate = (s) => { const a = TB.ymd(s), t = TB.hms(s); return new Date(a.y, a.m - 1, a.d, t.h, t.mi, Math.floor(t.s), Math.round((t.s % 1) * 1000)); };
  TB.today = () => { const d = new Date(); return TB.serial(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  TB.now = () => { const d = new Date(); return TB.today() + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; };
  TB.isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  TB.daysInMonth = (y, m) => [31, TB.isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

  /* ---------------- nombres ---------------- */
  /** Arrondi façon Excel (15 chiffres significatifs, puis arrondi « commercial ») */
  TB.round15 = (v) => (typeof v !== 'number' || !isFinite(v) || v === 0) ? v : parseFloat(v.toPrecision(15));
  TB.roundHalf = function (v, d) { const k = Math.pow(10, d); const x = TB.round15(Math.abs(v) * k); return Math.sign(v) * Math.round(x) / k; };
  /** Texte en nombre (paramètres régionaux) : « 1 234,5 », « -12 », « 1,5E3 » ; null si ce n'est pas un nombre */
  TB.parseNum = function (s, dec) {
    if (typeof s === 'number') return s;
    dec = dec || TB.loc.dec;
    s = String(s).trim().replace(/[    ]/g, ''); if (!s) return null;
    const th = dec === ',' ? '.' : ',';
    if (dec === ',') { if (/^[+-]?(\d{1,3}(\.\d{3})+)(,\d+)?$/.test(s)) s = s.replace(/\./g, ''); }
    else if (/^[+-]?(\d{1,3}(,\d{3})+)(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    if (dec === ',') s = s.replace(',', '.'); else if (s.indexOf(th) >= 0) return null;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
    const v = parseFloat(s); return isFinite(v) ? v : null;
  };
  const MON_RE = TB.MONTHS.map((m, i) => [m.normalize('NFD').replace(/[̀-ͯ]/g, ''), i]);
  function monthOf(w) {
    w = w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.$/, '');
    if (w.length < 3) return -1;
    for (const [m, i] of MON_RE) if (m.startsWith(w) || (w.length >= 3 && m.slice(0, w.length) === w)) return i;
    const en = TB.MONTHS_EN.findIndex((m) => m.toLowerCase().startsWith(w)); return en;
  }
  /** Saisie d'une date ou d'une heure (formats français) → {v, fmt} ou null */
  TB.parseDate = function (s) {
    s = String(s).trim(); let m;
    const cy = new Date().getFullYear();
    const yy = (y) => y.length <= 2 ? (+y < 30 ? 2000 + +y : 1900 + +y) : +y;
    const ok = (y, mo, d) => mo >= 1 && mo <= 12 && d >= 1 && d <= TB.daysInMonth(y, mo) && y >= 1900 && y <= 9999;
    let date = null, fmt = null, rest = s;
    if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?=$|\s)/.exec(s))) { const y = yy(m[3]); if (ok(y, +m[2], +m[1])) { date = TB.serial(y, +m[2], +m[1]); fmt = 'dd/mm/yyyy'; rest = s.slice(m[0].length); } }
    else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[\sT])/.exec(s))) { if (ok(+m[1], +m[2], +m[3])) { date = TB.serial(+m[1], +m[2], +m[3]); fmt = 'dd/mm/yyyy'; rest = s.slice(m[0].length).replace(/^T/, ' '); } }
    else if ((m = /^(\d{1,2})\/(\d{1,2})(?=$|\s)/.exec(s))) { if (ok(cy, +m[2], +m[1])) { date = TB.serial(cy, +m[2], +m[1]); fmt = 'dd/mm'; rest = s.slice(m[0].length); } }
    else if ((m = /^(\d{1,2})(?:er)?[\s-]+([A-Za-zÀ-ÿ.]+)[\s-]+(\d{2,4})(?=$|\s)/.exec(s))) { const mo = monthOf(m[2]); const y = yy(m[3]); if (mo >= 0 && ok(y, mo + 1, +m[1])) { date = TB.serial(y, mo + 1, +m[1]); fmt = 'd mmmm yyyy'; rest = s.slice(m[0].length); } }
    else if ((m = /^(\d{1,2})(?:er)?[\s-]+([A-Za-zÀ-ÿ.]+)(?=$)/.exec(s))) { const mo = monthOf(m[2]); if (mo >= 0 && ok(cy, mo + 1, +m[1])) { date = TB.serial(cy, mo + 1, +m[1]); fmt = 'd-mmm'; rest = ''; } }
    else if ((m = /^([A-Za-zÀ-ÿ.]+)[\s-]+(\d{4})$/.exec(s))) { const mo = monthOf(m[1]); if (mo >= 0) { date = TB.serial(+m[2], mo + 1, 1); fmt = 'mmm-yy'; rest = ''; } }
    rest = rest.trim();
    let time = null, tfmt = null;
    if (rest || date == null) {
      const t = date == null ? s : rest;
      if ((m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:[.,]\d+)?))?\s*(am|pm|AM|PM)?$/.exec(t)) || (m = /^(\d{1,2})\s*h\s*(\d{1,2})?$/i.exec(t))) {
        let h = +m[1]; const mi = +(m[2] || 0), se = m[3] ? parseFloat(m[3].replace(',', '.')) : 0;
        if (m[4]) { const pm = /pm/i.test(m[4]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
        if (mi < 60 && se < 60 && (h < 24 || date == null)) { time = (h * 3600 + mi * 60 + se) / 86400; tfmt = m[3] ? 'hh:mm:ss' : 'hh:mm'; if (date == null && h >= 24) tfmt = '[h]:mm' + (m[3] ? ':ss' : ''); }
      }
      if (time == null) return date != null && !rest ? { v: date, fmt } : null;
    }
    if (date == null) return { v: time, fmt: tfmt };
    return { v: date + (time || 0), fmt: time != null ? 'dd/mm/yyyy hh:mm' + (tfmt === 'hh:mm:ss' ? ':ss' : '') : fmt };
  };
  /**
   * Lecture d'une saisie dans une cellule → {v, fmt?} ; v : nombre, texte, booléen ou erreur.
   * « '… » force le texte ; « = » est une formule (traitée ailleurs).
   */
  TB.parseInput = function (s, opt) {
    opt = opt || {};
    if (s == null) return { v: null };
    if (typeof s !== 'string') return { v: s };
    if (s === '') return { v: null };
    if (s[0] === "'") return { v: s.slice(1), text: true };
    const t = s.trim();
    if (/^(vrai|true)$/i.test(t)) return { v: true };
    if (/^(faux|false)$/i.test(t)) return { v: false };
    if (/^#/.test(t)) { const e = TB.errOf(TB.ERR_EN[t.toUpperCase()] || t.toUpperCase()); if (e) return { v: e }; }
    let n = TB.parseNum(t);
    if (n != null) return { v: n, fmt: /e/i.test(t) && !/^0x/i.test(t) ? '0.00E+00' : null };
    // pourcentage
    let m = /^([+-]?[\d\s .,]+)\s*%$/.exec(t);
    if (m && (n = TB.parseNum(m[1])) != null) return { v: n / 100, fmt: /[.,]\d/.test(m[1]) ? '0.00%' : '0%' };
    // monnaie
    m = /^([+-]?)\s*(€|\$|£)\s*([\d\s .,]+)$/.exec(t) || /^([+-]?)([\d\s .,]+)\s*(€|\$|£|EUR)$/i.exec(t);
    if (m) { const sym = /€|EUR/i.test(t) ? '€' : /\$/.test(t) ? '$' : '£'; const num = TB.parseNum(m[1] + (m[3] && /\d/.test(m[3]) ? m[3] : m[2])); if (num != null) return { v: num, fmt: '#,##0' + (Math.round(num) !== num ? '.00' : '') + (sym === '€' ? '\\ "€"' : '') , cur: sym, fmtPre: sym !== '€' ? '"' + sym + '"' : '' }; }
    // négatif entre parenthèses (comptabilité)
    m = /^\(([\d\s .,]+)\)$/.exec(t); if (m && (n = TB.parseNum(m[1])) != null) return { v: -n };
    // fraction « 1/4 », « 2 1/2 » (seulement si ce n'est pas une date valide)
    const d = TB.parseDate(t); if (d) return d;
    m = /^(-?)(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(t); if (m && +m[4]) { const v = (+(m[2] || 0) + m[3] / m[4]) * (m[1] ? -1 : 1); return { v, fmt: '# ?/?' }; }
    return { v: s };
  };

  /* ---------------- valeurs ---------------- */
  TB.typeOf = (v) => v == null ? 'blank' : typeof v === 'number' ? 'num' : typeof v === 'string' ? 'str' : typeof v === 'boolean' ? 'bool' : v instanceof Err ? 'err' : 'other';
  /** Nombre en texte « Standard » (15 chiffres significatifs, séparateur décimal local) */
  TB.numText = function (v, dec) {
    if (!isFinite(v)) return TB.loc.fn === 'fr' ? '#NOMBRE!' : '#NUM!';
    let s;
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e15 || a < 1e-9)) { s = v.toExponential(14).replace(/\.?0+e/, 'E').replace(/E\+?(-?)(\d)$/, 'E+$1$2').replace('E+-', 'E-'); s = s.replace(/E([+-])(\d)$/, 'E$10$2'); }
    else s = String(TB.round15(v));
    if (/e/.test(s)) s = v.toExponential(14).replace(/\.?0+e/, 'E').replace(/E\+?(-?)(\d+)$/, (x, sg, d) => 'E' + (sg || '+') + (d.length < 2 ? '0' + d : d));
    return (dec || TB.loc.dec) === ',' ? s.replace('.', ',') : s;
  };
  /** Comparaison façon Excel (tri, RECHERCHE…) : nombres < texte < booléens ; texte sans casse */
  TB.cmp = function (a, b) {
    const ta = a == null ? 0 : typeof a === 'number' ? 1 : typeof a === 'string' ? 2 : typeof a === 'boolean' ? 3 : 4;
    const tb = b == null ? 0 : typeof b === 'number' ? 1 : typeof b === 'string' ? 2 : typeof b === 'boolean' ? 3 : 4;
    if (ta !== tb) return ta - tb;
    if (ta === 1) return a - b;
    if (ta === 2) return TB.strCmp(a, b);
    if (ta === 3) return (a ? 1 : 0) - (b ? 1 : 0);
    return 0;
  };
  let collator = null;
  TB.strCmp = (a, b) => { if (!collator) { try { collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: false }); } catch (e) { collator = { compare: (x, y) => x.toLowerCase() < y.toLowerCase() ? -1 : x.toLowerCase() > y.toLowerCase() ? 1 : 0 }; } } return collator.compare(a, b); };
  TB.eqText = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  /* ---------------- styles de cellule ----------------
     Style « à plat » : fn (police), fs (taille), b, i, u ('single'|'double'), st (barré), fc (couleur du texte), bg (remplissage),
     pat (motif), bt/bb/bl/br/bd/bu ({s:'thin'|'medium'|'thick'|'dashed'|'dotted'|'double'|'hair'…, c:'#000000'}),
     ha (left|center|right|fill|justify|centerContinuous|distributed), va (top|center|bottom|justify), wr (renvoi), rot (−90…90, 255 vertical),
     ind (retrait), shr (ajuster), nf (code de format), lk:false (déverrouillée), hd (formule masquée), sup/sub. */
  TB.DEFAULT_FONT = 'Calibri'; TB.DEFAULT_SIZE = 11;
  TB.StylePool = function (list) {
    const P = { list: [], map: new Map() };
    const keyOf = (s) => { const k = Object.keys(s).filter((x) => s[x] != null && s[x] !== false && s[x] !== '').sort(); return JSON.stringify(k.map((x) => [x, s[x]])); };
    P.add = function (s) {
      const o = {}; Object.keys(s || {}).forEach((k) => { if (s[k] != null && s[k] !== false && s[k] !== '') o[k] = s[k]; });
      if (o.fn === TB.DEFAULT_FONT) delete o.fn; if (o.fs === TB.DEFAULT_SIZE) delete o.fs; if (o.nf === 'General') delete o.nf;
      const k = keyOf(o); let id = P.map.get(k);
      if (id == null) { id = P.list.length; P.list.push(Object.freeze(o)); P.map.set(k, id); }
      return id;
    };
    P.get = (id) => P.list[id || 0] || P.list[0];
    P.with = (id, patch) => { const s = Object.assign({}, P.get(id)); Object.keys(patch).forEach((k) => { if (patch[k] == null || patch[k] === false) delete s[k]; else s[k] = patch[k]; }); return P.add(s); };
    P.add({});
    (list || []).slice(1).forEach((s) => P.add(s));
    if (list && list.length) { P.list = []; P.map = new Map(); list.forEach((s) => { const o = Object.freeze(Object.assign({}, s)); P.map.set(keyOf(o), P.list.length); P.list.push(o); }); if (!P.list.length) P.add({}); }
    return P;
  };

  /* ---------------- divers ---------------- */
  TB.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  TB.uid = (p) => (p || '') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
  TB.deepClone = (o) => o == null ? o : JSON.parse(JSON.stringify(o));
  TB.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  TB.norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  /** Motif à jokers (* ? ~) → expression régulière (sans casse) */
  TB.wildRe = function (p, whole) {
    let s = ''; p = String(p);
    for (let i = 0; i < p.length; i++) { const ch = p[i]; if (ch === '~' && i + 1 < p.length) { s += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; } if (ch === '*') s += '[\\s\\S]*'; else if (ch === '?') s += '[\\s\\S]'; else s += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    return new RegExp(whole === false ? s : '^' + s + '$', 'i');
  };
  TB.hasWild = (p) => /[*?~]/.test(String(p));
})(typeof window !== 'undefined' ? window : globalThis);
