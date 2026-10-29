/* Tableur — formats de nombre (codes Excel : sections ; conditions [>100] ; couleurs [Red] ; 0 # ? . , % E+ ; fractions ;
   dates et heures d m y h s AM/PM [h] ; texte @ ; littéraux "…" \x _x *x). Affichage à la française (virgule, espace insécable)
   selon TB.loc. TB.Fmt.format(valeur, code, {width}) → {s, c (couleur), num}. */
(function (G) {
  'use strict';
  const TB = G.Tableur;
  const F = TB.Fmt = {};
  const cache = TB.fmtCache = new Map();
  const COLORS = { black: '#000000', blue: '#0000FF', cyan: '#00FFFF', green: '#00FF00', magenta: '#FF00FF', red: '#FF0000', white: '#FFFFFF', yellow: '#FFFF00', noir: '#000000', bleu: '#0000FF', vert: '#00FF00', rouge: '#FF0000', blanc: '#FFFFFF', jaune: '#FFFF00' };
  const IDX = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080', '#9999FF', '#993366', '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF', '#000080', '#FF00FF', '#FFFF00', '#00FFFF', '#800080', '#800000', '#008080', '#0000FF', '#00CCFF', '#CCFFFF', '#CCFFCC', '#FFFF99', '#99CCFF', '#FF99CC', '#CC99FF', '#FFCC99', '#3366FF', '#33CCCC', '#99CC00', '#FFCC00', '#FF9900', '#FF6600', '#666699', '#969696', '#003366', '#339966', '#003300', '#333300', '#993300', '#993366', '#333399', '#333333'];
  TB.INDEXED = IDX;

  /* ---------------- découpage d'un code ---------------- */
  function splitSections(code) {
    const out = []; let cur = '', q = false, br = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (q) { cur += ch; if (ch === '"') q = false; continue; }
      if (ch === '"') { q = true; cur += ch; continue; }
      if (ch === '\\' || ch === '_' || ch === '*') { cur += ch + (code[i + 1] || ''); i++; continue; }
      if (ch === '[') br = true; else if (ch === ']') br = false;
      if (ch === ';' && !br) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur); return out;
  }
  function tokenize(sec) {
    const t = []; let i = 0; const s = sec;
    const lit = (x) => { const l = t[t.length - 1]; if (l && l.t === 'lit') l.s += x; else t.push({ t: 'lit', s: x }); };
    const info = { color: null, cond: null, date: false, elapsed: false, text: false, general: false, ampm: false, locale: null, fill: null };
    while (i < s.length) {
      const ch = s[i], rest = s.slice(i);
      if (ch === '"') { const j = s.indexOf('"', i + 1); lit(j < 0 ? s.slice(i + 1) : s.slice(i + 1, j)); i = j < 0 ? s.length : j + 1; continue; }
      if (ch === '\\') { lit(s[i + 1] || ''); i += 2; continue; }
      if (ch === '_') { lit(' '); i += 2; continue; }
      if (ch === '*') { info.fill = s[i + 1] || ' '; t.push({ t: 'fill', c: s[i + 1] || ' ' }); i += 2; continue; }
      if (ch === '[') {
        const j = s.indexOf(']', i); const inner = s.slice(i + 1, j < 0 ? s.length : j); i = j < 0 ? s.length : j + 1;
        let m;
        if ((m = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+(?:e[+-]?\d+)?)$/i.exec(inner))) info.cond = { op: m[1], v: parseFloat(m[2]) };
        else if (COLORS[inner.toLowerCase()]) info.color = COLORS[inner.toLowerCase()];
        else if ((m = /^(?:color|couleur)\s*(\d+)$/i.exec(inner))) info.color = IDX[(+m[1] + 7)] || IDX[+m[1]] || null;
        else if (/^h+$/i.test(inner) || /^m+$/i.test(inner) || /^s+$/i.test(inner)) { t.push({ t: 'el', c: inner[0].toLowerCase(), n: inner.length }); info.date = true; info.elapsed = true; }
        else if (inner[0] === '$') { const p = inner.slice(1).split('-'); if (p[0]) lit(p[0]); info.locale = p[1] || null; }
        continue;
      }
      if (/^general/i.test(rest) || /^standard/i.test(rest)) { t.push({ t: 'gen' }); info.general = true; i += /^general/i.test(rest) ? 7 : 8; continue; }
      if (/^(am\/pm|a\/p)/i.test(rest)) { const m = /^(am\/pm|a\/p)/i.exec(rest)[0]; t.push({ t: 'ampm', s: m }); info.ampm = true; info.date = true; i += m.length; continue; }
      if (/[yYdDhHsSeE]/.test(ch) && !(ch === 'E' || ch === 'e') || (ch === 'e' && !/^e[+-]/.test(rest))) {
        if (/[eE]/.test(ch) && /^[eE][+-]/.test(rest)) { /* exposant */ } else {
          let n = 1; while (s[i + n] && s[i + n].toLowerCase() === ch.toLowerCase()) n++;
          const c = ch.toLowerCase() === 'e' ? 'y' : ch.toLowerCase();
          t.push({ t: 'd', c, n: c === 'y' && ch.toLowerCase() === 'e' ? 4 : n }); info.date = true; i += n; continue;
        }
      }
      if (ch === 'm' || ch === 'M') { let n = 1; while (s[i + n] && s[i + n].toLowerCase() === 'm') n++; t.push({ t: 'd', c: 'm', n }); info.date = true; i += n; continue; }
      if (ch === '0' || ch === '#' || ch === '?') { t.push({ t: 'ph', c: ch }); i++; continue; }
      if (ch === '.') { t.push({ t: 'dot' }); i++; continue; }
      if (ch === ',') { t.push({ t: 'comma' }); i++; continue; }
      if (ch === '%') { t.push({ t: 'pct' }); i++; continue; }
      if ((ch === 'E' || ch === 'e') && (s[i + 1] === '+' || s[i + 1] === '-')) { t.push({ t: 'exp', s: s[i + 1] }); i += 2; continue; }
      if (ch === '/') { t.push({ t: 'slash' }); i++; continue; }
      if (ch === '@') { t.push({ t: 'at' }); info.text = true; i++; continue; }
      if (/[1-9]/.test(ch)) { t.push({ t: 'digit', c: ch }); i++; continue; }
      lit(ch); i++;
    }
    // m après h ou avant s → minutes
    if (info.date) {
      for (let k = 0; k < t.length; k++) {
        if (t[k].t !== 'd' || t[k].c !== 'm' || t[k].n > 2) continue;
        let p = k - 1; while (p >= 0 && t[p].t === 'lit') p--;
        let n = k + 1; while (n < t.length && (t[n].t === 'lit' || t[n].t === 'dot')) n++;
        if ((p >= 0 && ((t[p].t === 'd' && t[p].c === 'h') || (t[p].t === 'el' && t[p].c === 'h'))) || (n < t.length && ((t[n].t === 'd' && t[n].c === 's') || (t[n].t === 'el' && t[n].c === 's')))) t[k].c = 'mi';
      }
      // secondes fractionnaires : s.00
      for (let k = 0; k < t.length; k++) if (t[k].t === 'd' && t[k].c === 's' || t[k].t === 'el' && t[k].c === 's') { if (t[k + 1] && t[k + 1].t === 'dot') { let n = 0; while (t[k + 2 + n] && t[k + 2 + n].t === 'ph' && t[k + 2 + n].c === '0') n++; if (n) { t[k].frac = n; t.splice(k + 1, n + 1); } } }
    }
    return { tokens: t, info };
  }
  function compile(code) {
    let c = cache.get(code); if (c) return c;
    const secs = splitSections(code == null || code === '' ? 'General' : String(code)).map((s) => tokenize(s));
    c = { code, secs, date: secs[0] && secs[0].info.date, text: secs.length === 1 && secs[0].info.text && !secs[0].tokens.some((x) => x.t === 'ph') };
    if (cache.size > 2000) cache.clear();
    cache.set(code, c); return c;
  }
  F.compile = compile;
  F.isDate = (code) => !!code && compile(code).secs.some((s) => s.info.date);
  F.isText = (code) => code === '@' || (!!code && compile(code).text);
  F.isTime = (code) => { if (!F.isDate(code)) return false; const t = compile(code).secs[0].tokens; return !t.some((x) => x.t === 'd' && /^[ydm]$/.test(x.c)); };

  /* ---------------- nombres ---------------- */
  const pad = (s, n) => { s = String(s); while (s.length < n) s = '0' + s; return s; };
  function fracApprox(x, maxDen) {
    // fractions continues : meilleure approximation de x (0 ≤ x < 1) avec dénominateur ≤ maxDen
    let a = Math.floor(x), h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
    let best = [Math.round(x), 1];
    for (let i = 0; i < 64; i++) {
      a = Math.floor(b);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      best = [h2, k2]; h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(b - a) < 1e-12) break; b = 1 / (b - a);
    }
    // vérifier aussi les semi-convergentes simples
    let bn = best[0], bd = best[1], be = Math.abs(x - bn / bd);
    for (let d = 1; d <= maxDen && maxDen <= 999; d++) { const n = Math.round(x * d); const e = Math.abs(x - n / d); if (e < be - 1e-15) { be = e; bn = n; bd = d; } }
    return [bn, bd];
  }
  function fmtNumber(v, sec, neg) {
    const T = sec.tokens, L = TB.loc;
    let pcts = 0; T.forEach((x) => { if (x.t === 'pct') pcts++; });
    let x = Math.abs(v) * Math.pow(100, pcts);
    const expAt = T.findIndex((t) => t.t === 'exp');
    const slashAt = T.findIndex((t) => t.t === 'slash');
    // parties : avant le point (entier), après (décimales)
    const dotAt = T.findIndex((t) => t.t === 'dot');
    const endInt = dotAt >= 0 ? dotAt : expAt >= 0 ? expAt : T.length;
    // mise à l'échelle par virgules finales, regroupement des milliers
    let scale = 0, group = false;
    const intPh = [];
    for (let k = 0; k < endInt; k++) if (T[k].t === 'ph') intPh.push(k);
    for (let k = 0; k < endInt; k++) if (T[k].t === 'comma') { const before = intPh.some((p) => p < k), after = intPh.some((p) => p > k); if (before && after) group = true; else if (before && !after) scale++; }
    if (dotAt >= 0 && expAt < 0) { for (let k = dotAt + 1; k < T.length && T[k].t === 'comma'; k++) scale++; }
    if (scale) x = x / Math.pow(1000, scale);
    const out = [];
    if (slashAt >= 0) return fmtFraction(x, sec, neg, v);
    let exp = null;
    if (expAt >= 0) {
      const nInt = intPh.length || 1;
      if (x === 0) exp = 0; else { exp = Math.floor(Math.log10(x)); if (nInt > 1 && T.slice(0, endInt).some((t) => t.t === 'ph' && t.c === '#')) exp = Math.floor(exp / nInt) * nInt; else exp -= (nInt - 1); }
      x = x / Math.pow(10, exp);
    }
    const decPh = []; if (dotAt >= 0) for (let k = dotAt + 1; k < (expAt >= 0 ? expAt : T.length); k++) if (T[k].t === 'ph') decPh.push(k);
    const nd = decPh.length;
    let r = TB.roundHalf(x, nd);
    if (expAt >= 0 && r >= Math.pow(10, intPh.length || 1) && x !== 0) { exp += 1; x = x / 10; r = TB.roundHalf(x, nd); }
    let ip = Math.floor(r + 1e-9 * (r ? 1 : 0));
    let fp = nd ? Math.round((r - ip) * Math.pow(10, nd)) : 0;
    if (fp >= Math.pow(10, nd) && nd) { ip += 1; fp = 0; }
    let intStr = ip ? String(ip) : '';
    if (ip >= 1e21) intStr = BigInt(Math.round(ip)).toString();
    const fracStr = nd ? pad(fp, nd) : '';
    let lastNZ = -1; for (let k = 0; k < fracStr.length; k++) if (fracStr[k] !== '0') lastNZ = k;
    // entier, chiffre par chiffre
    const n = intPh.length; let pi = 0; const intOut = [];
    const firstZero = intPh.findIndex((k) => T[k].c === '0');
    for (let k = 0; k < endInt; k++) {
      const t = T[k];
      if (t.t === 'ph') {
        const p = n - 1 - pi; // position depuis la droite
        if (pi === 0 && intStr.length > n) { const lead = intStr.slice(0, intStr.length - n + 1); for (let j = 0; j < lead.length; j++) intOut.push({ d: lead[j], q: intStr.length - 1 - j }); }
        else { const di = intStr.length - 1 - p; if (di >= 0) intOut.push({ d: intStr[di], q: p }); else if (t.c === '0' || (firstZero >= 0 && pi >= firstZero && t.c !== '?')) intOut.push({ d: t.c === '#' && !(firstZero >= 0 && pi > firstZero) ? '' : '0', q: p }); else if (t.c === '?') intOut.push({ d: ' ', q: p, sp: true }); }
        pi++;
      } else if (t.t === 'lit') intOut.push({ s: t.s }); else if (t.t === 'pct') intOut.push({ s: '%' }); else if (t.t === 'digit') intOut.push({ s: t.c }); else if (t.t === 'at') intOut.push({ s: '' });
    }
    if (!n && intStr && dotAt < 0 && expAt < 0 && !T.some((t) => t.t === 'ph')) { /* aucun chiffre dans le code : rien */ }
    for (let k = 0; k < intOut.length; k++) {
      const o = intOut[k];
      if (o.d != null) { out.push(o.d); if (group && o.q > 0 && o.q % 3 === 0 && o.d !== '') out.push(o.sp ? ' ' : L.thou); }
      else out.push(o.s);
    }
    if (dotAt >= 0) {
      out.push(L.dec);
      let j = 0;
      for (let k = dotAt + 1; k < (expAt >= 0 ? expAt : T.length); k++) {
        const t = T[k];
        if (t.t === 'ph') { const d = fracStr[j]; out.push(j <= lastNZ ? d : t.c === '0' ? '0' : t.c === '?' ? ' ' : ''); j++; }
        else if (t.t === 'lit') out.push(t.s); else if (t.t === 'pct') out.push('%'); else if (t.t === 'digit') out.push(t.c);
      }
    }
    if (expAt >= 0) {
      const et = T[expAt]; const expPh = T.slice(expAt + 1).filter((t) => t.t === 'ph');
      const e = Math.abs(exp); out.push('E' + (exp < 0 ? '-' : et.s === '+' ? '+' : '') + pad(e, Math.max(1, expPh.filter((t) => t.c === '0').length)));
      T.slice(expAt + 1).forEach((t) => { if (t.t === 'lit') out.push(t.s); else if (t.t === 'pct') out.push('%'); });
    }
    let s = out.join('');
    if (neg) s = '-' + s;
    return s;
  }
  function fmtFraction(x, sec, neg) {
    const T = sec.tokens, sl = T.findIndex((t) => t.t === 'slash');
    let k = sl - 1; while (k >= 0 && T[k].t === 'ph') k--;
    const head = T.slice(0, k + 1), hasInt = head.some((t) => t.t === 'ph');
    let firstPh = head.findIndex((t) => t.t === 'ph'), lastPh = -1; head.forEach((t, i) => { if (t.t === 'ph') lastPh = i; });
    const pre = head.slice(0, firstPh < 0 ? head.length : firstPh).filter((t) => t.t === 'lit').map((t) => t.s).join('');
    const mid = hasInt ? head.slice(lastPh + 1).filter((t) => t.t === 'lit').map((t) => t.s).join('') || ' ' : '';
    let j = sl + 1, denN = 0, fixed = '';
    while (j < T.length && (T[j].t === 'ph' || T[j].t === 'digit')) { if (T[j].t === 'digit' || (fixed && T[j].c === '0')) fixed += T[j].t === 'digit' ? T[j].c : '0'; else denN++; j++; }
    const tail = T.slice(j).filter((t) => t.t === 'lit').map((t) => t.s).join('');
    let ip = hasInt ? Math.floor(x) : 0; const fr = x - ip; let num, den;
    if (fixed) { den = +fixed; num = Math.round(fr * den); } else[num, den] = fracApprox(fr, Math.pow(10, Math.max(1, denN)) - 1);
    if (hasInt && num >= den) { ip += 1; num = 0; }
    let s;
    if (hasInt) s = num ? (ip ? ip + mid : '') + num + '/' + den : String(ip);
    else s = num + '/' + den;
    return (neg ? '-' : '') + pre + s + tail;
  }

  /* ---------------- dates ---------------- */
  function fmtDate(v, sec) {
    const T = sec.tokens, I = sec.info;
    const en = I.locale && /^(409|809|1009|c09)$/i.test(I.locale);
    const fracN = Math.max(0, ...T.filter((t) => t.frac).map((t) => t.frac));
    const unit = 86400 * Math.pow(10, fracN);
    let x = Math.round(v * unit) / unit;
    if (x < 0 || x >= 2958466) return null;
    const d = TB.ymd(x), tm = TB.hms(x);
    let s = '';
    const wd = TB.weekday(x);
    for (const t of T) {
      if (t.t === 'lit') s += t.s;
      else if (t.t === 'd') {
        switch (t.c) {
          case 'y': s += t.n <= 2 ? pad(d.y % 100, 2) : String(d.y); break;
          case 'm': s += t.n === 1 ? d.m : t.n === 2 ? pad(d.m, 2) : t.n === 3 ? (en ? TB.MONTHS_EN[d.m - 1].slice(0, 3) : TB.MONTHS_S[d.m - 1]) : t.n === 5 ? (en ? TB.MONTHS_EN : TB.MONTHS)[d.m - 1][0].toUpperCase() : (en ? TB.MONTHS_EN : TB.MONTHS)[d.m - 1]; break;
          case 'd': s += t.n === 1 ? d.d : t.n === 2 ? pad(d.d, 2) : t.n === 3 ? (en ? TB.DAYS_EN[wd].slice(0, 3) : TB.DAYS_S[wd]) : (en ? TB.DAYS_EN : TB.DAYS)[wd]; break;
          case 'h': { let h = tm.h; if (I.ampm) { h = h % 12; if (h === 0) h = 12; } s += t.n >= 2 ? pad(h, 2) : h; break; }
          case 'mi': s += t.n >= 2 ? pad(tm.mi, 2) : tm.mi; break;
          case 's': { const sv = Math.floor(tm.s + 1e-9); s += t.n >= 2 ? pad(sv, 2) : sv; if (t.frac) s += TB.loc.dec + pad(Math.round((tm.s - sv) * Math.pow(10, t.frac)) % Math.pow(10, t.frac), t.frac); break; }
        }
      } else if (t.t === 'el') {
        const tot = x * 86400;
        if (t.c === 'h') s += pad(Math.floor(tot / 3600 + 1e-9), t.n);
        else if (t.c === 'm') s += pad(Math.floor(tot / 60 + 1e-9), t.n);
        else s += pad(Math.floor(tot + 1e-9), t.n);
      } else if (t.t === 'ampm') { const pm = tm.h >= 12; s += t.s.length > 3 ? (pm ? 'PM' : 'AM') : (pm ? 'P' : 'A'); }
      else if (t.t === 'dot') s += TB.loc.dec;
      else if (t.t === 'comma') s += ',';
      else if (t.t === 'ph') s += t.c === '0' ? '0' : '';
      else if (t.t === 'digit') s += t.c;
      else if (t.t === 'pct') s += '%';
      else if (t.t === 'slash') s += '/';
    }
    return s;
  }

  /* ---------------- « Standard » ---------------- */
  /** width : nombre de caractères disponibles (affichage dans la grille) */
  F.general = function (v, width) {
    let s = TB.numText(v);
    if (!width || s.length <= width) return s;
    const a = Math.abs(v);
    if (a >= 1e-4 && a < 1e11) {
      const ip = String(Math.floor(a)).length + (v < 0 ? 1 : 0);
      for (let d = Math.min(10, width - ip - 1); d >= 0; d--) { const t = TB.numText(TB.roundHalf(v, d)); if (t.length <= width) return t; }
      if (ip <= width) return TB.numText(Math.round(v));
    }
    for (let d = 5; d >= 0; d--) { let t = v.toExponential(d).replace(/e\+?(-?)(\d+)$/, (x, sg, e) => 'E' + (sg || '+') + pad(e, 2)); if (TB.loc.dec === ',') t = t.replace('.', ','); if (t.length <= width) return t; }
    return '#'.repeat(Math.max(1, width));
  };

  /* ---------------- format ---------------- */
  F.format = function (v, code, opt) {
    if (v == null) return { s: '', c: null };
    if (v instanceof TB.Err) return { s: TB.errText(v), c: null, err: true };
    if (typeof v === 'boolean') return { s: TB.boolText(v), c: null, bool: true };
    const C = compile(code || 'General'), S = C.secs;
    if (typeof v === 'string') {
      const sec = S.length >= 4 ? S[3] : S.find((x) => x.info.text) || null;
      if (sec && sec.tokens.some((t) => t.t === 'at')) return { s: sec.tokens.map((t) => t.t === 'at' ? v : t.t === 'lit' ? t.s : '').join(''), c: sec.info.color };
      return { s: v, c: sec ? sec.info.color : null };
    }
    if (typeof v !== 'number') return { s: String(v), c: null };
    if (!isFinite(v)) return { s: TB.errText(TB.E.NUM), c: null, err: true };
    // choix de la section
    let sec, neg = v < 0, absolute = false;
    const numSecs = S.filter((x, i) => i < 3 && !(x.info.text && !x.tokens.some((t) => t.t === 'ph' || t.t === 'd' || t.t === 'gen')) || i < 3 && x.tokens.length === 0);
    const hasCond = S.some((x) => x.info.cond);
    const test = (c, x) => c.op === '<' ? x < c.v : c.op === '<=' ? x <= c.v : c.op === '>' ? x > c.v : c.op === '>=' ? x >= c.v : c.op === '=' ? x === c.v : x !== c.v;
    if (hasCond) {
      const c0 = S[0].info.cond || { op: '>=', v: 0 }, c1 = S[1] && (S[1].info.cond || (S.length > 2 ? { op: '<', v: 0 } : null));
      if (test(c0, v)) sec = S[0]; else if (S[1] && (!c1 || test(c1, v))) { sec = S[1]; } else sec = S[2] || S[1] || S[0];
      absolute = sec !== S[0] && !sec.info.cond && v < 0 ? true : (sec !== S[0] && v < 0);
    } else if (numSecs.length <= 1 || S.length === 1) { sec = S[0]; }
    else if (v > 0 || (v === 0 && S.length < 3)) sec = S[0];
    else if (v < 0) { sec = S[1]; absolute = true; }
    else sec = S[2] && S[2].tokens.length ? S[2] : S[2] ? S[2] : S[0];
    if (S.length >= 3 && v === 0 && !hasCond) sec = S[2];
    if (!sec) sec = S[0];
    const I = sec.info;
    if (I.general || (!sec.tokens.length && !I.date)) {
      if (!sec.tokens.length && S.length > 1) return { s: '', c: I.color };
      const g = F.general(absolute ? Math.abs(v) : v, opt && opt.width);
      const lits = sec.tokens.map((t) => t.t === 'gen' ? g : t.t === 'lit' ? t.s : '').join('');
      return { s: lits, c: I.color, num: true, gen: true };
    }
    if (I.date) {
      const s = fmtDate(absolute ? Math.abs(v) : v, sec);
      if (s == null) return { s: '#'.repeat(Math.min(12, (opt && opt.width) || 8)), c: null, num: true, hash: true };
      return { s, c: I.color, num: true, date: true };
    }
    if (!sec.tokens.some((t) => t.t === 'ph' || t.t === 'digit')) {
      // section sans chiffres (texte fixe)
      return { s: (v < 0 && !absolute ? '-' : '') + sec.tokens.map((t) => t.t === 'lit' ? t.s : t.t === 'pct' ? '%' : '').join(''), c: I.color, num: true };
    }
    const s = fmtNumber(v, sec, v < 0 && !absolute);
    return { s, c: I.color, num: true, fill: I.fill };
  };
  F.text = (v, code, opt) => F.format(v, code, opt).s;

  /* ---------------- codes « locaux » (interface en français) ↔ codes Excel ---------------- */
  function mapOutside(code, fn) {
    let out = '', q = false, br = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (q) { out += ch; if (ch === '"') q = false; continue; }
      if (ch === '"') { q = true; out += ch; continue; }
      if (ch === '\\' || ch === '_' || ch === '*') { out += ch + (code[i + 1] || ''); i++; continue; }
      if (ch === '[') br = true; if (br) { out += ch; if (ch === ']') br = false; continue; }
      out += fn(ch, i, code);
    }
    return out;
  }
  /** Code saisi en français (« # ##0,00 € », « jj/mm/aaaa ») → code Excel (« #,##0.00\ "€" », « dd/mm/yyyy ») */
  F.fromLocal = function (code) {
    if (!code || /^(standard|general)$/i.test(code)) return 'General';
    let s = String(code);
    const isDate = /[jJaA]{1,4}|[dDyY]/.test(s.replace(/"[^"]*"/g, '').replace(/am\/pm|a\/p/ig, '')) && /[hHmMsSjJaAdDyY]/.test(s);
    if (TB.loc.dec === ',') {
      s = mapOutside(s, (ch) => ch === ',' ? '\u0001' : ch === '.' ? ',' : ch).replace(/\u0001/g, '.');
      // espace des milliers : « # ##0 » (groupe de 3 chiffres) → « #,##0 »
      s = s.replace(/([#0?])[   ]([#0?]{3})(?![#0?])/g, '$1,$2').replace(/([#0?])[   ]([#0?]{3})(?![#0?])/g, '$1,$2');
    }
    if (isDate || /[jJ]/.test(s.replace(/"[^"]*"/g, ''))) s = mapOutside(s, (ch, i, all) => ch === 'j' || ch === 'J' ? 'd' : (ch === 'a' || ch === 'A') && !/^a\/p|^am\/pm/i.test(all.slice(i)) ? 'y' : ch);
    s = s.replace(/\[(rouge|bleu|vert|noir|blanc|jaune)\]/gi, (x, c) => '[' + ({ rouge: 'Red', bleu: 'Blue', vert: 'Green', noir: 'Black', blanc: 'White', jaune: 'Yellow' })[c.toLowerCase()] + ']');
    s = s.replace(/(^|;)standard(?=;|$)/gi, '$1General');
    // « € » nu → \ "€" n'est pas nécessaire (Excel accepte "€" entre guillemets) ; on laisse tel quel
    return s;
  };
  /** Code Excel → affichage en français */
  F.toLocal = function (code) {
    if (!code || code === 'General') return 'Standard';
    let s = String(code);
    if (TB.loc.dec === ',') {
      s = s.replace(/([#0?]),([#0?]{3})/g, '$1\u0002$2');
      s = mapOutside(s, (ch) => ch === '.' ? '\u0001' : ch === ',' ? '.' : ch).replace(/\u0001/g, ',').replace(/\u0002/g, ' ');
    }
    if (F.isDate(code)) s = mapOutside(s, (ch, i, all) => ch === 'd' || ch === 'D' ? 'j' : (ch === 'y' || ch === 'Y') ? 'a' : ch);
    return s.replace(/(^|;)General(?=;|$)/g, '$1Standard');
  };

  /* ---------------- catégories (boîte « Format de cellule ») ---------------- */
  F.EURO = '\\ "€"';
  F.build = function (kind, o) {
    o = o || {};
    const d = o.dec == null ? 2 : o.dec, dp = d ? '.' + '0'.repeat(d) : '';
    const sym = o.sym == null ? '€' : o.sym;
    const symAfter = sym === '€' || sym === 'CHF' || sym === 'F';
    const sy = sym ? (symAfter ? '\\ "' + sym + '"' : '"' + sym + '"') : '';
    switch (kind) {
      case 'general': return 'General';
      case 'number': { const b = (o.sep ? '#,##0' : '0') + dp; return o.neg === 'red' ? b + ';[Red]' + b : o.neg === 'paren' ? b + '_);(' + b + ')' : o.neg === 'redparen' ? b + '_);[Red](' + b + ')' : o.neg === 'redminus' ? b + ';[Red]-' + b : b; }
      case 'currency': { const b = symAfter ? '#,##0' + dp + sy : sy + '#,##0' + dp; return o.neg === 'red' ? b + ';[Red]-' + b : o.neg === 'redminus' ? b + ';[Red]-' + b : b; }
      case 'accounting': return symAfter ? '_-* #,##0' + dp + sy + '_-;-* #,##0' + dp + sy + '_-;_-* "-"' + (d ? '??' : '') + sy + '_-;_-@_-' : '_-' + sy + '* #,##0' + dp + '_-;-' + sy + '* #,##0' + dp + '_-;_-' + sy + '* "-"' + (d ? '??' : '') + '_-;_-@_-';
      case 'percent': return '0' + dp + '%';
      case 'scientific': return '0' + dp + 'E+00';
      case 'fraction': return o.code || '# ?/?';
      case 'text': return '@';
      default: return 'General';
    }
  };
  F.DATES = ['dd/mm/yyyy', 'dd/mm/yy', 'd/m/yy', 'dddd d mmmm yyyy', 'd mmmm yyyy', 'd-mmm', 'd-mmm-yy', 'mmm-yy', 'mmmm yyyy', 'mmmm', 'dd/mm/yyyy hh:mm', 'yyyy-mm-dd', 'ddd dd/mm'];
  F.TIMES = ['hh:mm', 'hh:mm:ss', 'h:mm AM/PM', 'h:mm:ss AM/PM', '[h]:mm:ss', '[h]:mm', 'mm:ss', 'mm:ss.0'];
  F.SPECIAL = [['00000', 'Code postal'], ['0# ## ## ## ##', 'Numéro de téléphone'], ['0 00 00 00 000 000 00', 'Numéro de sécurité sociale'], ['[<=999999]0;0" "000" "000', 'Grand nombre groupé']];
  F.kindOf = function (code) {
    if (!code || code === 'General') return 'general';
    if (code === '@') return 'text';
    if (F.isDate(code)) return F.isTime(code) ? 'time' : 'date';
    if (/E[+-]/.test(code)) return 'scientific';
    if (/\?\/|#\/|\/\d/.test(code)) return 'fraction';
    if (/%/.test(code.replace(/"[^"]*"/g, ''))) return 'percent';
    if (/\*/.test(code) && /€|\$|£/.test(code)) return 'accounting';
    if (/€|\$|£|\[\$/.test(code)) return 'currency';
    if (/^[#,0.]+(;|$)/.test(code) || /^\[Red\]/.test(code)) return 'number';
    return 'custom';
  };
  F.decimals = function (code) { const C = compile(code || 'General').secs[0]; if (C.info.general) return null; const t = C.tokens; const d = t.findIndex((x) => x.t === 'dot'); if (d < 0) return 0; let n = 0; for (let k = d + 1; k < t.length && (t[k].t === 'ph'); k++) n++; return n; };
  /** Ajouter / réduire une décimale (boutons du ruban) */
  F.addDecimal = function (code, delta, value) {
    if (!code || code === 'General') { let n = 0; if (typeof value === 'number') { const s = TB.numText(value); const i = s.indexOf(TB.loc.dec); n = i < 0 ? 0 : s.length - i - 1; } n = Math.max(0, n + delta); return n ? '0.' + '0'.repeat(n) : '0'; }
    if (F.isDate(code)) return code;
    return splitSections(code).map((sec) => {
      let q = false, i = 0, out = '', done = false;
      // trouver le dernier placeholder de la partie nombre (avant E, %, littéral final)
      const idx = []; for (i = 0; i < sec.length; i++) { const ch = sec[i]; if (ch === '"') q = !q; if (q) continue; if (ch === '\\' || ch === '_' || ch === '*') { i++; continue; } if (ch === '0' || ch === '#' || ch === '?' || ch === '.') idx.push([i, ch]); if (ch === 'E' || ch === 'e') break; }
      if (!idx.length) return sec;
      const dot = idx.find((x) => x[1] === '.');
      const last = idx[idx.length - 1][0];
      if (delta > 0) { out = dot ? sec.slice(0, last + 1) + '0' + sec.slice(last + 1) : sec.slice(0, last + 1) + '.0' + sec.slice(last + 1); }
      else if (dot) { const after = idx.filter((x) => x[0] > dot[0]); if (after.length <= 1) out = sec.slice(0, dot[0]) + sec.slice(last + 1); else out = sec.slice(0, last) + sec.slice(last + 1); }
      else out = sec;
      void done; return out;
    }).join(';');
  };
})(typeof window !== 'undefined' ? window : globalThis);
