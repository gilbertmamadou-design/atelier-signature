/* Tableur — données : presse-papiers (HTML, texte tabulé), recopie incrémentée (nombres, dates, jours, mois, listes),
   tri multicritère, filtres automatiques, filtre avancé, doublons, conversion en colonnes, sous-totaux et plan,
   tableaux croisés dynamiques, valeur cible, remplissage instantané, lecture CSV. */
(function (G) {
  'use strict';
  const TB = G.Tableur, P = TB.Formula;
  const KEY = TB.key;
  const D = TB.Data = {};

  /* =====================================================================
     Presse-papiers
     ===================================================================== */
  const Clip = TB.Clip = {};
  const css = (o) => Object.keys(o).filter((k) => o[k] != null && o[k] !== '').map((k) => k + ':' + o[k]).join(';');
  const bcss = (b) => b ? (b.s === 'medium' ? '2px' : b.s === 'thick' ? '3px' : b.s === 'double' ? '3px double' : '1px') + ' ' + (b.s === 'double' ? '' : /dash|dot/.test(b.s) ? 'dashed' : 'solid') + ' ' + (b.c || '#000') : null;
  Clip.toHtml = function (wb, sh, g) {
    if (TB.rangeSize(g) > 200000) return '';
    let h = '<table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse">';
    for (let r = g.r1; r <= g.r2; r++) {
      if (sh.hidR.has(r)) continue;
      h += '<tr style="height:' + Math.round(sh.rowHeight(r) * 0.75) + 'pt">';
      for (let c = g.c1; c <= g.c2; c++) {
        if (sh.hidC.has(c)) continue;
        const m = sh.mergeAt(r, c); if (m && (m.r1 !== r || m.c1 !== c)) continue;
        const v = sh.get(r, c), st = wb.styles.get(sh.styleAt(r, c));
        const txt = v === null ? '' : TB.Fmt.format(v, st.nf).s;
        const style = css({ 'font-family': st.fn ? "'" + st.fn + "'" : null, 'font-size': st.fs ? st.fs + 'pt' : null, 'font-weight': st.b ? '700' : null, 'font-style': st.i ? 'italic' : null, 'text-decoration': st.u ? 'underline' : st.st ? 'line-through' : null, color: st.fc, background: st.bg, 'text-align': st.ha && st.ha !== 'general' ? st.ha : (typeof v === 'number' ? 'right' : null), 'vertical-align': st.va === 'center' ? 'middle' : st.va || null, 'white-space': st.wr ? 'normal' : 'nowrap', 'border-top': bcss(st.bt), 'border-bottom': bcss(st.bb), 'border-left': bcss(st.bl), 'border-right': bcss(st.br), 'mso-number-format': st.nf && st.nf !== 'General' ? '"' + st.nf.replace(/"/g, '\\"') + '"' : null, width: r === g.r1 ? Math.round(sh.colWidth(c) * 0.75) + 'pt' : null });
        const span = m ? (m.c2 > m.c1 ? ' colspan="' + (m.c2 - m.c1 + 1) + '"' : '') + (m.r2 > m.r1 ? ' rowspan="' + (m.r2 - m.r1 + 1) + '"' : '') : '';
        const num = typeof v === 'number' ? ' x:num="' + v + '" sdval="' + v + '"' : typeof v === 'boolean' ? ' x:bool="' + (v ? 'TRUE' : 'FALSE') + '"' : '';
        const f = sh.fml.get(KEY(r, c));
        h += '<td' + span + num + (f ? ' x:fmla="=' + TB.esc(f.src) + '"' : '') + (style ? ' style="' + TB.esc(style) + '"' : '') + '>' + TB.esc(txt).replace(/\n/g, '<br>') + '</td>';
      }
      h += '</tr>';
    }
    return '<html><head><meta charset="utf-8"><meta name="generator" content="Tableur (Suite MAG)"></head><body>' + h + '</table></body></html>';
  };
  Clip.writeSystem = async function (text, html) {
    try {
      if (navigator.clipboard && window.ClipboardItem && html) { await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]); return true; }
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { }
    return false;
  };
  Clip.same = (a, b) => String(a || '').replace(/\r/g, '').replace(/\n+$/, '') === String(b || '').replace(/\r/g, '').replace(/\n+$/, '');
  /** texte tabulé (guillemets gérés) → {rows:[[{v}]]} */
  Clip.fromText = function (text) {
    text = String(text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
    if (!text) return { rows: [] };
    const sep = text.indexOf('\t') >= 0 || text.indexOf('\n') >= 0 ? '\t' : '\t';
    const rows = D.splitCsv(text, sep, '"');
    return { rows: rows.map((r) => r.map((x) => x === '' ? null : { v: x })) };
  };
  /** tableau HTML (Excel, LibreOffice, pages web) → {rows, merges, cw} */
  Clip.fromHtml = function (html, wb) {
    let doc; try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return null; }
    const table = doc.querySelector('table'); if (!table) return null;
    // classes CSS (Excel : .xl65 {…})
    const classes = {};
    doc.querySelectorAll('style').forEach((s) => { const t = s.textContent.replace(/<!--|-->/g, ''); const re = /([.\w\s,-]+)\{([^}]*)\}/g; let m; while ((m = re.exec(t))) m[1].split(',').forEach((sel) => { const k = sel.trim(); if (/^\.\w/.test(k) || /^td\.\w/.test(k)) classes[k.replace(/^td/, '')] = (classes[k.replace(/^td/, '')] || '') + ';' + m[2]; else if (k === 'td') classes.td = (classes.td || '') + ';' + m[2]; }); });
    const rows = [], merges = [], occ = {};
    const parseStyle = (s) => { const o = {}; String(s || '').split(';').forEach((d) => { const i = d.indexOf(':'); if (i < 0) return; o[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim(); }); return o; };
    const color = (c) => { if (!c) return null; c = c.replace(/!important/, '').trim(); if (/^(transparent|inherit|initial|none|windowtext|auto)$/i.test(c)) return null; if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase(); if (/^#[0-9a-f]{3}$/i.test(c)) return ('#' + c.slice(1).split('').map((x) => x + x).join('')).toUpperCase(); const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c); if (m) { if (m[4] != null && +m[4] === 0) return null; return '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); } const named = { black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', gray: '#808080', grey: '#808080', silver: '#C0C0C0', orange: '#FFA500', navy: '#000080', maroon: '#800000', purple: '#800080' }; return named[c.toLowerCase()] || null; };
    const border = (v) => { if (!v || /none|0px|\.5pt none/.test(v)) return null; const m = /([\d.]+)(px|pt)?\s+(solid|dashed|dotted|double|hairline)?\s*(.*)$/.exec(v) || []; const w = parseFloat(m[1] || 1); const st = /double/.test(v) ? 'double' : /dash/.test(v) ? 'dashed' : /dot/.test(v) ? 'dotted' : w >= 2.5 ? 'thick' : w >= 1.5 ? 'medium' : 'thin'; return { s: st, c: color((m[4] || '').trim()) || '#000000' }; };
    let ri = 0;
    const cw = [];
    table.querySelectorAll('tr').forEach((tr) => {
      const row = rows[ri] || (rows[ri] = []);
      let ci = 0;
      tr.querySelectorAll('td,th').forEach((td) => {
        while (occ[ri + ':' + ci]) ci++;
        const cs = +td.getAttribute('colspan') || 1, rs = +td.getAttribute('rowspan') || 1;
        if (cs > 1 || rs > 1) { merges.push({ r1: ri, c1: ci, r2: ri + rs - 1, c2: ci + cs - 1 }); for (let a = 0; a < rs; a++) for (let b = 0; b < cs; b++) if (a || b) occ[(ri + a) + ':' + (ci + b)] = 1; }
        let st = Object.assign({}, parseStyle(classes.td));
        (td.getAttribute('class') || '').split(/\s+/).forEach((k) => { if (k && classes['.' + k]) Object.assign(st, parseStyle(classes['.' + k])); });
        Object.assign(st, parseStyle(td.getAttribute('style')));
        // mise en forme des éléments internes (b, i, font…)
        const inner = td.querySelector('b,strong'), it = td.querySelector('i,em'), fontEl = td.querySelector('font[color],span[style*="color"]');
        const o = {};
        if (/bold|[6-9]00/.test(st['font-weight'] || '') || inner || td.tagName === 'TH') o.b = true;
        if (/italic/.test(st['font-style'] || '') || it) o.i = true;
        if (/underline/.test(st['text-decoration'] || '')) o.u = 'single';
        if (/line-through/.test(st['text-decoration'] || '')) o.st = true;
        const fc = color(st.color) || (fontEl && color(fontEl.getAttribute('color') || parseStyle(fontEl.getAttribute('style')).color)); if (fc && fc !== '#000000') o.fc = fc;
        const bg = color(st['background-color'] || st.background || td.getAttribute('bgcolor')); if (bg && bg !== '#FFFFFF') o.bg = bg;
        const ta = st['text-align']; if (/^(center|right|left|justify)$/.test(ta || '') && ta !== 'left') o.ha = ta;
        const va = st['vertical-align']; if (/middle|top/.test(va || '')) o.va = va === 'middle' ? 'center' : 'top';
        const fs = parseFloat(st['font-size']); if (fs && /pt/.test(st['font-size'])) o.fs = Math.round(fs * 2) / 2; else if (fs && /px/.test(st['font-size'])) o.fs = Math.round(fs * 0.75 * 2) / 2;
        const ff = (st['font-family'] || '').split(',')[0].replace(/["']/g, '').trim(); if (ff && !/^(sans-serif|serif|monospace|system-ui|-apple-system|inherit)$/i.test(ff)) o.fn = ff;
        if (/normal/.test(st['white-space'] || '') && /<br/i.test(td.innerHTML)) o.wr = true;
        ['top', 'bottom', 'left', 'right'].forEach((k) => { const b = border(st['border-' + k] || st.border); if (b) o['b' + k[0]] = b; });
        let nf = st['mso-number-format']; if (nf) { nf = nf.replace(/^"|"$/g, '').replace(/\\(.)/g, '$1'); if (/^(General|Standard)$/i.test(nf)) nf = null; else if (nf === '@') nf = '@'; if (nf) o.nf = nf; }
        let text = (td.innerText != null ? td.innerText : td.textContent);
        text = td.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n\s+/g, '\n').trim();
        void text; const tc = (td.textContent || '').replace(/ /g, ' ');
        const txt = /<br/i.test(td.innerHTML) ? text : tc.replace(/\s+/g, ' ').trim();
        const cell = {};
        const xnum = td.getAttribute('x:num') != null ? td.getAttribute('x:num') : td.getAttribute('sdval');
        const xb = td.getAttribute('x:bool');
        if (xnum != null && xnum !== '' && !isNaN(+xnum)) { cell.v = +xnum; cell.raw = true; }
        else if (xb) { cell.v = /true/i.test(xb); cell.raw = true; }
        else cell.v = txt === '' ? null : txt;
        const xf = td.getAttribute('x:fmla'); if (xf && wb) { try { cell.f = P.write(P.parse(xf.replace(/^=/, ''), P.CANON)); } catch (e) { } }
        if (Object.keys(o).length) cell.st = o;
        const a = td.querySelector('a[href]'); if (a && /^(https?:|mailto:)/i.test(a.getAttribute('href'))) cell.link = a.getAttribute('href');
        row[ci] = cell.v === null && !cell.st && !cell.f ? null : cell;
        const w = parseFloat(st.width); if (ri === 0 && w) cw[ci] = /pt/.test(st.width) ? Math.round(w / 0.75) : /px/.test(st.width) ? Math.round(w) : null;
        ci += cs;
      });
      ri++;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return { rows, merges, cw: cw.some(Boolean) ? cw : null };
  };

  /* =====================================================================
     CSV
     ===================================================================== */
  D.splitCsv = function (text, sep, quote) {
    const rows = []; let row = [], cell = '', q = false, i = 0; const n = text.length, Q = quote || '"';
    while (i < n) {
      const ch = text[i];
      if (q) { if (ch === Q) { if (text[i + 1] === Q) { cell += Q; i += 2; continue; } q = false; i++; continue; } cell += ch; i++; continue; }
      if (ch === Q && cell === '') { q = true; i++; continue; }
      if (ch === sep) { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  };
  D.guessSep = function (text) {
    // enregistrements entiers (un champ entre guillemets peut contenir un saut de ligne ou le séparateur d'un autre format)
    let sample = String(text).slice(0, 30000); if (text.length > 30000) { const nl = sample.lastIndexOf('\n'); if (nl > 0) sample = sample.slice(0, nl); }
    let best = ';', bs = -1;
    for (const s of [';', ',', '\t', '|']) {
      const rows = D.splitCsv(sample, s, '"').filter((r) => r.length > 1 || (r[0] || '').trim()).slice(0, 40);
      const counts = rows.map((r) => r.length - 1); if (!counts.length) continue;
      const mn = Math.min(...counts), avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const sc = mn > 0 ? avg + (counts.every((x) => x === counts[0]) ? 100 : 0) : 0;
      if (sc > bs) { bs = sc; best = s; }
    }
    return best;
  };
  /** octets → texte : UTF-8 (avec ou sans BOM), UTF-16, sinon Windows-1252 */
  D.decode = function (bytes, enc) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (!enc || enc === 'auto') {
      if (u[0] === 0xEF && u[1] === 0xBB && u[2] === 0xBF) enc = 'utf-8';
      else if (u[0] === 0xFF && u[1] === 0xFE) enc = 'utf-16le';
      else if (u[0] === 0xFE && u[1] === 0xFF) enc = 'utf-16be';
      else { try { new TextDecoder('utf-8', { fatal: true }).decode(u); enc = 'utf-8'; } catch (e) { enc = 'windows-1252'; } }
    }
    let t = new TextDecoder(enc).decode(u);
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    return { text: t, enc };
  };
  /** valeur d'un champ CSV selon les options {dec, thou, dateOrder:'DMY'|'MDY'|'YMD', type:'general'|'text'|'date'|'skip'} */
  D.csvValue = function (s, o) {
    if (s === '' || s == null) return { v: null };
    if (o.type === 'text') return { v: s, fmt: '@' };
    const t = s.trim();
    const dec = o.dec || ',', thou = o.thou;
    let x = t; if (thou) x = x.split(thou).join(''); x = x.replace(/[   ]/g, '');
    const neg = /^\(.*\)$/.test(x); if (neg) x = x.slice(1, -1);
    const pct = /%$/.test(x); if (pct) x = x.slice(0, -1);
    const cur = /^[€$£]|[€$£]$|EUR$/i.test(x); if (cur) x = x.replace(/[€$£]|EUR/gi, '').trim();
    if (dec === '.' ? /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(x) : /^[+-]?(\d+,?\d*|,\d+)([eE][+-]?\d+)?$/.test(x)) {
      let v = parseFloat(dec === ',' ? x.replace(',', '.') : x); if (neg) v = -v; if (pct) v /= 100;
      return { v, fmt: pct ? '0.00%' : cur ? '#,##0.00\\ "€"' : null };
    }
    if (o.type !== 'general' || true) {
      let m = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
      if (m) {
        let y, mo, d; const ord = o.dateOrder || 'DMY';
        if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; } else if (ord === 'MDY') { mo = +m[1]; d = +m[2]; y = +m[3]; } else { d = +m[1]; mo = +m[2]; y = +m[3]; }
        if (y < 100) y += y < 30 ? 2000 : 1900;
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= TB.daysInMonth(y, mo)) { let v = TB.serial(y, mo, d); if (m[4]) v += (+m[4] * 3600 + +m[5] * 60 + +(m[6] || 0)) / 86400; return { v, fmt: m[4] ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy' }; }
      }
      m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t); if (m) return { v: (+m[1] * 3600 + +m[2] * 60 + +(m[3] || 0)) / 86400, fmt: m[3] ? 'hh:mm:ss' : 'hh:mm' };
      if (/^(vrai|true|faux|false)$/i.test(t)) return { v: /^(vrai|true)$/i.test(t) };
    }
    return { v: s };
  };

  /* =====================================================================
     Recopie incrémentée
     ===================================================================== */
  const BUILTIN_LISTS = [
    ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'], ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
    ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'], ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'], ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'], ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
    ['T1', 'T2', 'T3', 'T4'], ['trimestre 1', 'trimestre 2', 'trimestre 3', 'trimestre 4']
  ];
  D.userLists = () => { try { return JSON.parse(localStorage.getItem('tableur:listes') || '[]'); } catch (e) { return []; } };
  D.allLists = (wb) => (wb.lists || []).concat(D.userLists()).concat(BUILTIN_LISTS);
  function caseOf(s) { return s === s.toUpperCase() && s !== s.toLowerCase() ? 'U' : s[0] === s[0].toUpperCase() && s[0] !== s[0].toLowerCase() ? 'C' : 'L'; }
  function applyCase(s, k) { return k === 'U' ? s.toUpperCase() : k === 'C' ? s[0].toUpperCase() + s.slice(1) : s; }
  function findList(wb, s) { const l = String(s).toLowerCase(); for (const L of D.allLists(wb)) { const i = L.findIndex((x) => x.toLowerCase() === l); if (i >= 0) return { L, i }; } return null; }
  /** générateur pour une suite de valeurs source (une ligne ou colonne) : k → valeur (k : position après la source, 0 = première nouvelle) */
  function seriesOf(wb, sh, cells, mode, styles) {
    const vals = cells.map((x) => x.v);
    const ctrl = mode === 'ctrl', force = mode === 'copy' || mode === true; let copy = force || ctrl;
    const n = vals.length;
    const isDate = (i) => { const nf = wb.styles.get(styles[i]).nf; return nf && TB.Fmt.isDate(nf); };
    // tous des nombres
    if (vals.every((v) => typeof v === 'number') && cells.every((x) => !x.f)) {
      if (force) return (k) => vals[(n + k) % n];
      if (n === 1) { const inc = isDate(0) ? !ctrl : ctrl; return inc ? (k) => vals[0] + k + 1 : () => vals[0]; }
      if (ctrl) return (k) => vals[(n + k) % n];
      // dates : mois / années
      if (cells.every((_, i) => isDate(i)) && vals.every((v) => v === Math.floor(v))) {
        const ds = vals.map((v) => TB.ymd(v));
        const sameDay = ds.every((d) => d.d === ds[0].d), mdiff = (ds[1].y - ds[0].y) * 12 + ds[1].m - ds[0].m;
        if (sameDay && mdiff && ds.every((d, i) => i === 0 || (d.y - ds[i - 1].y) * 12 + d.m - ds[i - 1].m === mdiff)) return (k) => { const tot = (ds[0].y * 12 + ds[0].m - 1) + mdiff * (n + k); const y = Math.floor(tot / 12), m = tot % 12 + 1; return TB.serial(y, m, Math.min(ds[0].d, TB.daysInMonth(y, m))); };
      }
      // tendance linéaire (moindres carrés)
      let sx = 0, sy = 0, sxy = 0, sxx = 0; vals.forEach((v, i) => { sx += i; sy += v; sxy += i * v; sxx += i * i; });
      const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
      return (k) => TB.round15(a + b * (n + k));
    }
    const TN = /^(.*?)(\d+)(\D*)$/;
    const padTo = (num, w, zero) => zero ? String(num).padStart(w, '0') : String(num);
    // suite « texte + nombre » (Article 1, Lot 001…)
    const tn = vals.map((v, i) => typeof v === 'string' && !cells[i].f ? TN.exec(v) : null);
    if (!copy && tn.every((m) => m && m[1] === tn[0][1] && m[3] === tn[0][3])) {
      const nums = tn.map((m) => +m[2]); const w = tn[0][2].length, zero = tn[0][2][0] === '0' && w > 1;
      const step = n === 1 ? 1 : (nums[n - 1] - nums[0]) / (n - 1) || 1;
      return (k) => tn[0][1] + padTo(nums[0] + step * (n + k), w, zero) + tn[0][3];
    }
    // suite d'une liste (jours, mois, listes personnalisées)
    const ls = vals.map((v, i) => typeof v === 'string' && !cells[i].f ? findList(wb, v) : null);
    if (!copy && ls.every((x) => x && x.L === ls[0].L)) {
      const L = ls[0].L, len = L.length, cs = caseOf(vals[0]);
      const step = n === 1 ? 1 : ((ls[1].i - ls[0].i) % len + len) % len || 1;
      return (k) => applyCase(L[(ls[0].i + step * (n + k)) % len], cs);
    }
    // sinon : répétition du motif (formules décalées par l'appelant ; « texte + nombre » isolé incrémenté)
    return (k) => {
      const i = (n + k) % n, cyc = Math.floor(k / n) + 1;
      if (cells[i].f) return { f: cells[i].f, from: i };
      const m = tn[i];
      if (!copy && m) return m[1] + padTo(+m[2] + cyc, m[2].length, m[2][0] === '0' && m[2].length > 1) + m[3];
      if (!copy && ls[i]) return applyCase(ls[i].L[(ls[i].i + cyc) % ls[i].L.length], caseOf(vals[i]));
      return vals[i];
    };
  }
  /** recopie de la plage g vers la plage cible t (qui contient g) */
  D.fill = function (wb, sh, g, t, opt) {
    opt = opt || {};
    const down = t.r2 > g.r2, up = t.r1 < g.r1, right = t.c2 > g.c2, left = t.c1 < g.c1;
    const vert = down || up;
    const list = [];
    const lines = vert ? g.c2 - g.c1 + 1 : g.r2 - g.r1 + 1;
    for (let L = 0; L < lines; L++) {
      const src = [], st = [];
      const len = vert ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
      for (let i = 0; i < len; i++) { const r = vert ? g.r1 + i : g.r1 + L, c = vert ? g.c1 + L : g.c1 + i; const o = wb.snap(sh, r, c) || {}; const f = sh.fml.get(KEY(r, c)); src.push({ v: sh.get(r, c), f: f ? f.src : null, o, r, c }); st.push(sh.styleAt(r, c)); }
      const back = up || left;
      const seq = back ? src.slice().reverse() : src, sts = back ? st.slice().reverse() : st;
      const gen = seriesOf(wb, sh, seq, opt.copy ? 'copy' : opt.ctrl ? 'ctrl' : 'auto', sts);
      const count = vert ? (down ? t.r2 - g.r2 : g.r1 - t.r1) : (right ? t.c2 - g.c2 : g.c1 - t.c1);
      for (let k = 0; k < count; k++) {
        const r = vert ? (down ? g.r2 + 1 + k : g.r1 - 1 - k) : g.r1 + L, c = vert ? g.c1 + L : (right ? g.c2 + 1 + k : g.c1 - 1 - k);
        const i = (len + k) % len; const s0 = seq[i];
        let o = {};
        const v = gen(k);
        if (v && typeof v === 'object' && v.f) { const from = seq[v.from]; o.f = P.write(P.shift(P.parse(v.f), r - from.r, c - from.c)); }
        else if (s0.f) { o.f = P.write(P.shift(P.parse(s0.f), r - s0.r, c - s0.c)); }
        else if (v !== null && v !== undefined) o.v = v;
        const sid = sts[i]; if (sid) o.s = sid;
        list.push([r, c, Object.keys(o).length ? o : null]);
      }
    }
    wb.setCells(sh, list);
    // validation, MFC : prolonger
    const dv = sh.dv.map((d) => { const has = d.ranges.some((x) => TB.intersect(x, g)); return has ? Object.assign({}, d, { ranges: d.ranges.concat([t]) }) : d; });
    if (JSON.stringify(dv) !== JSON.stringify(sh.dv)) wb.setProp(sh, 'dv', dv);
  };
  D.fillPreview = function (wb, sh, g, t) {
    const vert = t.r2 > g.r2 || t.r1 < g.r1; const back = t.r1 < g.r1 || t.c1 < g.c1;
    const len = vert ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1; const src = [], st = [];
    for (let i = 0; i < len; i++) { const r = vert ? g.r1 + i : g.r1, c = vert ? g.c1 : g.c1 + i; const f = sh.fml.get(KEY(r, c)); src.push({ v: sh.get(r, c), f: f ? f.src : null, r, c }); st.push(sh.styleAt(r, c)); }
    if (src.every((x) => x.v === null && !x.f)) return null;
    const seq = back ? src.reverse() : src, sts = back ? st.reverse() : st;
    const gen = seriesOf(wb, sh, seq, 'auto', sts);
    const count = vert ? (t.r2 > g.r2 ? t.r2 - g.r2 : g.r1 - t.r1) : (t.c2 > g.c2 ? t.c2 - g.c2 : g.c1 - t.c1);
    const v = gen(count - 1); if (v && typeof v === 'object') return null;
    return TB.Fmt.format(v, wb.styles.get(sts[(len + count - 1) % len]).nf).s;
  };
  /** série (boîte « Série ») : type linear|growth|date ; unit day|weekday|month|year */
  D.series = function (wb, sh, g, o) {
    const vert = o.dir === 'col'; const list = [];
    const lines = vert ? g.c2 - g.c1 + 1 : g.r2 - g.r1 + 1, len = vert ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
    for (let L = 0; L < lines; L++) {
      const r0 = vert ? g.r1 : g.r1 + L, c0 = vert ? g.c1 + L : g.c1; let v = sh.get(r0, c0); if (typeof v !== 'number') continue;
      for (let i = 1; i < len; i++) {
        if (o.type === 'growth') v = v * o.step; else if (o.type === 'date') { if (o.unit === 'month' || o.unit === 'year') { const d = TB.ymd(v), mm = d.m + (o.unit === 'month' ? o.step : 12 * o.step); const y = d.y + Math.floor((mm - 1) / 12), m = (mm - 1) % 12 + 1; v = TB.serial(y, m, Math.min(d.d, TB.daysInMonth(y, m))); } else if (o.unit === 'weekday') { let k = o.step; while (k > 0) { v++; const w = TB.weekday(v); if (w !== 0 && w !== 6) k--; } } else v = v + o.step; } else v = TB.round15(v + o.step);
        if (o.stop != null && (o.step >= 0 ? v > o.stop : v < o.stop)) break;
        const r = vert ? r0 + i : r0, c = vert ? c0 : c0 + i; const cur = wb.snap(sh, r, c) || {}; cur.v = v; delete cur.f; if (cur.s === undefined && sh.styleAt(r0, c0)) cur.s = sh.styleAt(r0, c0); list.push([r, c, cur]);
      }
    }
    wb.setCells(sh, list);
  };

  /* =====================================================================
     Tri
     ===================================================================== */
  /** keys : [{c (colonne de la feuille), desc, by:'value'|'bg'|'fc'|'icon', color, list:[…]}] ; opt : {header, byCols} */
  D.sort = function (wb, sh, g, keys, opt) {
    opt = opt || {};
    const hdr = opt.header ? 1 : 0;
    const byCols = !!opt.byCols;
    const a = byCols ? g.c1 + hdr : g.r1 + hdr, b = byCols ? g.c2 : g.r2;
    if (b <= a) return;
    const idx = []; for (let i = a; i <= b; i++) idx.push(i);
    const keyVal = (k, i) => {
      const r = byCols ? k.c : i, c = byCols ? i : k.c;
      if (k.by === 'bg' || k.by === 'fc') { const st = wb.styles.get(sh.styleAt(r, c)); return (st[k.by] || '').toUpperCase() === String(k.color || '').toUpperCase() ? 0 : 1; }
      return sh.get(r, c);
    };
    const cmp = (x, y) => {
      for (const k of keys) {
        let va = keyVal(k, x), vb = keyVal(k, y);
        if (k.by === 'bg' || k.by === 'fc') { const d = va - vb; if (d) return k.desc ? -d : d; continue; }
        // vides toujours à la fin
        const ea = va === null || va === '', eb = vb === null || vb === '';
        if (ea || eb) { if (ea && eb) continue; return ea ? 1 : -1; }
        let d;
        if (k.list) { const L = k.list.map((s) => s.toLowerCase()); const ia = L.indexOf(String(va).toLowerCase()), ib = L.indexOf(String(vb).toLowerCase()); d = (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); }
        else if (va instanceof TB.Err || vb instanceof TB.Err) d = (va instanceof TB.Err ? 1 : 0) - (vb instanceof TB.Err ? 1 : 0);
        else d = k.case && typeof va === 'string' && typeof vb === 'string' ? (va < vb ? -1 : va > vb ? 1 : 0) : TB.cmp(va, vb);
        if (d) return k.desc ? -d : d;
      }
      return x - y;
    };
    const order = idx.slice().sort(cmp);
    if (order.every((v, i) => v === idx[i])) return false;
    const perm = order; // nouvelle position i ← ancienne ligne order[i]
    const apply = (pm) => permute(wb, sh, g, a, pm, byCols);
    const inv = new Array(perm.length); perm.forEach((old, i) => { inv[old - a] = a + i; });
    wb.fnEntry(() => apply(perm), () => apply(inv));
    apply(perm);
    return true;
  };
  /** réordonne les lignes (ou colonnes) de la plage : la ligne a+i reçoit l'ancienne ligne pm[i] */
  function permute(wb, sh, g, a, pm, byCols) {
    const n = pm.length;
    const lines = byCols ? [g.r1, g.r2] : [g.c1, g.c2];
    // contenus par position
    for (let L = lines[0]; L <= lines[1]; L++) {
      const vals = [], sty = [], fml = [];
      for (let i = 0; i < n; i++) { const r = byCols ? L : pm[i], c = byCols ? pm[i] : L; vals.push(sh.get(r, c)); sty.push(sh.ownStyle(r, c)); fml.push(sh.fml.get(KEY(r, c)) || null); }
      for (let i = 0; i < n; i++) {
        const r = byCols ? L : a + i, c = byCols ? a + i : L;
        const col = sh.vals[c] || (sh.vals[c] = []); col[r] = vals[i] === null ? undefined : vals[i];
        const sc = sh.sty[c] || (sh.sty[c] = []); sc[r] = sty[i];
      }
      // formules : déplacer et décaler les références relatives
      for (let i = 0; i < n; i++) { const f = fml[i]; if (f) sh.fml.delete(KEY(f.r, f.c)); }
      for (let i = 0; i < n; i++) {
        const f = fml[i]; if (!f) continue;
        const nr = byCols ? f.r : a + i, nc = byCols ? a + i : f.c;
        const ast = P.shift(f.ast, nr - f.r, nc - f.c); f.ast = ast; f.src = P.write(ast); f.r = nr; f.c = nc; f.spill = null;
        sh.fml.set(KEY(nr, nc), f);
      }
    }
    // notes et liens : suivent leur ligne
    [sh.notes, sh.links, sh.threads].forEach((m) => {
      const moved = []; m.forEach((v, k) => { const p = TB.unkey(k); const pos = byCols ? p.c : p.r, other = byCols ? p.r : p.c; if (pos >= a && pos < a + n && other >= lines[0] && other <= lines[1]) moved.push([k, v, p]); });
      moved.forEach(([k]) => m.delete(k));
      moved.forEach(([, v, p]) => { const pos = byCols ? p.c : p.r; const ni = pm.indexOf(pos); const np = a + ni; m.set(byCols ? KEY(p.r, np) : KEY(np, p.c), v); });
    });
    sh.spills.clear(); sh.spillOwner.clear(); sh._ext = null;
  }

  /* =====================================================================
     Filtres
     ===================================================================== */
  /** critère d'une colonne : {type:'values', vals:[textes affichés], blank} | {type:'custom', op1, v1, op2, v2, and} | {type:'top', n, pct, bottom} | {type:'avg', above} | {type:'color', bg|fc} | {type:'date', period} */
  D.filterTest = function (wb, sh, crit, r, c, colStats) {
    const v = sh.get(r, c);
    switch (crit.type) {
      case 'values': { if (v === null || v === '') return !!crit.blank; const t = wb.displayText(sh, r, c); return crit.vals.indexOf(t) >= 0; }
      case 'custom': { const t1 = custom(crit.op1, crit.v1, v, wb, sh, r, c), t2 = crit.op2 ? custom(crit.op2, crit.v2, v, wb, sh, r, c) : null; return t2 == null ? t1 : crit.and ? t1 && t2 : t1 || t2; }
      case 'top': { if (typeof v !== 'number') return false; const l = colStats.nums; const k = crit.pct ? Math.max(1, Math.floor(l.length * crit.n / 100)) : Math.min(crit.n, l.length); return crit.bottom ? v <= l[k - 1] : v >= l[l.length - k]; }
      case 'avg': return typeof v === 'number' && (crit.above ? v > colStats.mean : v < colStats.mean);
      case 'color': { const st = wb.styles.get(sh.styleAt(r, c)); return crit.bg !== undefined ? (st.bg || null) === (crit.bg || null) : (st.fc || '#000000') === crit.fc; }
      case 'date': { if (typeof v !== 'number') return false; return TB.CF ? (function () { const ctx = { wb, sh, stats: new Map(), res: new Map() }; void ctx; const t = TB.today(), d = Math.floor(v), wd = TB.weekday(t), y = TB.ymd(t), dd = TB.ymd(d); switch (crit.period) { case 'today': return d === t; case 'yesterday': return d === t - 1; case 'tomorrow': return d === t + 1; case 'thisWeek': return d >= t - wd && d < t - wd + 7; case 'lastWeek': return d >= t - wd - 7 && d < t - wd; case 'nextWeek': return d >= t - wd + 7 && d < t - wd + 14; case 'thisMonth': return dd.y === y.y && dd.m === y.m; case 'lastMonth': { const pm = y.m === 1 ? 12 : y.m - 1, py = y.m === 1 ? y.y - 1 : y.y; return dd.y === py && dd.m === pm; } case 'nextMonth': { const nm = y.m === 12 ? 1 : y.m + 1, ny = y.m === 12 ? y.y + 1 : y.y; return dd.y === ny && dd.m === nm; } case 'thisYear': return dd.y === y.y; case 'lastYear': return dd.y === y.y - 1; case 'nextYear': return dd.y === y.y + 1; case 'q1': case 'q2': case 'q3': case 'q4': return Math.ceil(dd.m / 3) === +crit.period[1]; } return false; })() : true; }
    }
    return true;
  };
  function custom(op, x, v, wb, sh, r, c) {
    const t = v === null ? '' : typeof v === 'string' ? v : wb.displayText(sh, r, c);
    let n = TB.parseNum(x); if (n == null) { const d = TB.parseDate(x); if (d) n = d.v; }
    const num = typeof v === 'number' ? v : null;
    const lx = String(x).toLowerCase(), lt = String(t).toLowerCase();
    switch (op) {
      case 'eq': return n != null && num != null ? num === n : TB.hasWild(x) ? TB.wildRe(x).test(t) : lt === lx;
      case 'ne': return !(n != null && num != null ? num === n : TB.hasWild(x) ? TB.wildRe(x).test(t) : lt === lx);
      case 'gt': return n != null && num != null ? num > n : lt > lx;
      case 'ge': return n != null && num != null ? num >= n : lt >= lx;
      case 'lt': return n != null && num != null ? num < n : lt < lx;
      case 'le': return n != null && num != null ? num <= n : lt <= lx;
      case 'begins': return lt.startsWith(lx); case 'nbegins': return !lt.startsWith(lx);
      case 'ends': return lt.endsWith(lx); case 'nends': return !lt.endsWith(lx);
      case 'contains': return lt.indexOf(lx) >= 0; case 'ncontains': return lt.indexOf(lx) < 0;
    }
    return true;
  }
  /** applique les critères du filtre automatique (ou d'un tableau) : masque / affiche les lignes */
  D.applyFilter = function (wb, sh, area, cols) {
    const r1 = area.r1 + 1, r2 = area.r2;
    const stats = {};
    Object.keys(cols).forEach((k) => { const c = +k; const nums = []; let s = 0; for (let r = r1; r <= r2; r++) { const v = sh.get(r, c); if (typeof v === 'number') { nums.push(v); s += v; } } nums.sort((a, b) => a - b); stats[c] = { nums, mean: nums.length ? s / nums.length : 0 }; });
    const prev = sh.afHid || new Set();
    const hid = new Set();
    for (let r = r1; r <= r2; r++) { let ok = true; for (const k of Object.keys(cols)) { const crit = cols[k]; if (crit && !D.filterTest(wb, sh, crit, r, +k, stats[+k])) { ok = false; break; } } if (!ok) hid.add(r); }
    prev.forEach((r) => { if (r >= r1 && r <= r2 && !hid.has(r) && sh.hidR.has(r)) wb.setProp(sh.hidR, r, false); });
    hid.forEach((r) => { if (!sh.hidR.has(r)) wb.setProp(sh.hidR, r, true); });
    const all = new Set(Array.from(prev).filter((r) => r < r1 || r > r2)); hid.forEach((r) => all.add(r));
    wb.setProp(sh, 'afHid', all);
    return hid.size;
  };
  /** valeurs distinctes affichées d'une colonne (liste du filtre) */
  D.distinct = function (wb, sh, r1, r2, c, limit) {
    const m = new Map(); let blank = false;
    for (let r = r1; r <= r2; r++) { const v = sh.get(r, c); if (v === null || v === '') { blank = true; continue; } const t = wb.displayText(sh, r, c); if (!m.has(t)) { m.set(t, v); if (m.size > (limit || 10000)) break; } }
    const l = Array.from(m.entries()).sort((a, b) => TB.cmp(a[1], b[1])).map((x) => x[0]);
    return { list: l, blank };
  };
  D.dataEnd = function (sh, area) { let r = area.r2; const e = sh.extent(); for (let rr = area.r2 + 1; rr <= e.r + 1; rr++) { let has = false; for (let c = area.c1; c <= area.c2; c++) if (sh.get(rr, c) !== null) { has = true; break; } if (!has) break; r = rr; } return r; };
  /** filtre avancé : critères dans une plage (lignes OU, colonnes ET) ; copie ailleurs si dest */
  D.advancedFilter = function (wb, sh, list, critG, dest, unique) {
    const hdr = []; for (let c = list.c1; c <= list.c2; c++) hdr.push(String(sh.get(list.r1, c) == null ? '' : sh.get(list.r1, c)).toLowerCase());
    const crows = [];
    for (let r = critG.r1 + 1; r <= critG.r2; r++) { const conds = []; for (let c = critG.c1; c <= critG.c2; c++) { const v = sh.get(r, c); if (v === null || v === '') continue; const h = String(sh.get(critG.r1, c) == null ? '' : sh.get(critG.r1, c)).toLowerCase(); const ci = hdr.indexOf(h); if (ci < 0) continue; conds.push([list.c1 + ci, TB.crit(v)]); } if (conds.length) crows.push(conds); }
    const keep = [];
    const seen = new Set();
    for (let r = list.r1 + 1; r <= list.r2; r++) {
      const ok = !crows.length || crows.some((cs) => cs.every(([c, t]) => t(sh.get(r, c))));
      if (!ok) continue;
      if (unique) { const k = []; for (let c = list.c1; c <= list.c2; c++) k.push(String(sh.get(r, c))); const kk = k.join('\u0001'); if (seen.has(kk)) continue; seen.add(kk); }
      keep.push(r);
    }
    if (dest) {
      const out = []; const W = list.c2 - list.c1 + 1;
      const rows = [list.r1].concat(keep);
      rows.forEach((r, i) => { for (let j = 0; j < W; j++) { const v = sh.get(r, list.c1 + j); out.push([dest.r + i, dest.c + j, v === null ? null : { v, s: sh.styleAt(r, list.c1 + j) || undefined }]); } });
      wb.setCells(dest.sh || sh, out);
      return keep.length;
    }
    const ks = new Set(keep);
    const prev = sh.afHid || new Set(); const all = new Set(prev);
    for (let r = list.r1 + 1; r <= list.r2; r++) { if (!ks.has(r)) { if (!sh.hidR.has(r)) wb.setProp(sh.hidR, r, true); all.add(r); } else if (sh.hidR.has(r) && prev.has(r)) { wb.setProp(sh.hidR, r, false); all.delete(r); } }
    wb.setProp(sh, 'afHid', all);
    return keep.length;
  };

  /* =====================================================================
     Doublons, conversion, sous-totaux, plan
     ===================================================================== */
  D.removeDuplicates = function (wb, sh, g, cols, header) {
    const r1 = g.r1 + (header ? 1 : 0); const seen = new Set(); const keep = [];
    for (let r = r1; r <= g.r2; r++) { const k = cols.map((c) => { const v = sh.get(r, c); return typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + String(v); }).join('\u0001'); if (seen.has(k)) continue; seen.add(k); keep.push(r); }
    const removed = g.r2 - r1 + 1 - keep.length; if (!removed) return 0;
    const list = [];
    keep.forEach((src, i) => { const r = r1 + i; if (r === src) return; for (let c = g.c1; c <= g.c2; c++) { const o = wb.snap(sh, src, c); const f = sh.fml.get(KEY(src, c)); if (o && f) o.f = P.write(P.shift(f.ast, r - src, 0)); list.push([r, c, o]); } });
    for (let r = r1 + keep.length; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) list.push([r, c, null]);
    wb.setCells(sh, list);
    return removed;
  };
  /** convertir une colonne de texte en colonnes ; o : {mode:'delim'|'fixed', seps:[…], other, consecutive, quote, widths:[positions], types:[…], dest:{r,c}, dec, dateOrder} */
  D.splitText = function (s, o) {
    if (o.mode === 'fixed') { const pos = [0].concat(o.widths || []).concat([s.length]); const out = []; for (let i = 0; i < pos.length - 1; i++) out.push(s.slice(pos[i], pos[i + 1]).trim()); return out; }
    let seps = (o.seps || []).slice(); if (o.other) seps.push(o.other);
    if (!seps.length) return [s];
    const re = new RegExp('(' + seps.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')' + (o.consecutive ? '+' : ''));
    if (o.quote) { const sep0 = seps[0]; if (seps.length === 1) return D.splitCsv(s, sep0, o.quote)[0] || ['']; }
    return s.split(re).filter((x, i) => i % 2 === 0);
  };
  D.textToColumns = function (wb, sh, g, o) {
    const list = []; const dest = o.dest || { r: g.r1, c: g.c1 };
    for (let r = g.r1; r <= g.r2; r++) {
      const v = sh.get(r, g.c1); if (v === null) continue;
      const parts = D.splitText(typeof v === 'string' ? v : wb.displayText(sh, r, g.c1), o);
      let j = 0;
      parts.forEach((p, k) => { const ty = (o.types || [])[k] || 'general'; if (ty === 'skip') return; const x = D.csvValue(p, { dec: o.dec || TB.loc.dec, dateOrder: o.dateOrder, type: ty }); const cell = { v: x.v }; if (x.fmt) cell.s = wb.styles.with(sh.styleAt(r, g.c1), { nf: x.fmt }); else if (sh.ownStyle(r, g.c1) !== undefined) cell.s = sh.ownStyle(r, g.c1); list.push([dest.r + (r - g.r1), dest.c + j, cell.v === null ? null : cell]); j++; });
    }
    wb.setCells(sh, list);
    return list.length;
  };
  /** sous-totaux : g (avec en-têtes), byCol, fn (n° SOUS.TOTAL : 9 somme, 1 moyenne, 2 nb, 3 nbval, 4 max, 5 min, 6 produit), cols, below */
  D.subtotals = function (wb, sh, g, o) {
    const FN_NAMES = { 9: 'Total', 1: 'Moyenne', 2: 'Nombre', 3: 'Nombre', 4: 'Max', 5: 'Min', 6: 'Produit', 7: 'Écart type', 10: 'Variance' };
    const lab = FN_NAMES[o.fn] || 'Total';
    const r1 = g.r1 + 1;
    const groups = []; let start = r1;
    for (let r = r1 + 1; r <= g.r2 + 1; r++) { const a = sh.get(r, o.by), b = sh.get(start, o.by); if (r > g.r2 || TB.cmp(a, b) !== 0) { groups.push([start, r - 1, b]); start = r; } }
    const add = groups.length + 1;
    // place : insérer des lignes après la plage
    wb.shiftCells(sh, 'r', g.r2 + 1, add);
    // reconstruire le bloc
    const out = [];
    const snaps = []; for (let r = r1; r <= g.r2; r++) { const row = []; for (let c = g.c1; c <= g.c2; c++) { const o2 = wb.snap(sh, r, c); const f = sh.fml.get(KEY(r, c)); row.push([o2, f]); } snaps.push(row); }
    let y = r1; const totRows = [];
    const bold = (sid) => wb.styles.with(sid || 0, { b: true });
    groups.forEach(([a, b, key]) => {
      for (let r = a; r <= b; r++) { const row = snaps[r - r1]; row.forEach(([o2, f], j) => { const c = g.c1 + j; let x = o2 ? Object.assign({}, o2) : null; if (x && f) x.f = P.write(P.shift(f.ast, y - r, 0)); out.push([y, c, x]); }); wb.setProp(sh.outR, y, 2); y++; }
      for (let c = g.c1; c <= g.c2; c++) {
        if (c === o.by) out.push([y, c, { v: 'Total ' + (key == null ? '' : TB.Fmt.text(key, wb.styles.get(sh.styleAt(a, c)).nf)).trim(), s: bold(sh.styleAt(a, c)) }]);
        else if (o.cols.indexOf(c) >= 0) out.push([y, c, { f: 'SUBTOTAL(' + o.fn + ',' + TB.rangeStr({ r1: y - (b - a + 1), c1: c, r2: y - 1, c2: c }) + ')', s: bold(sh.styleAt(a, c)) }]);
        else out.push([y, c, null]);
      }
      wb.setProp(sh.outR, y, 1); totRows.push(y); y++;
    });
    for (let c = g.c1; c <= g.c2; c++) {
      if (c === o.by) out.push([y, c, { v: (lab === 'Total' ? 'Total' : lab) + ' général', s: bold(sh.styleAt(r1, c)) }]);
      else if (o.cols.indexOf(c) >= 0) out.push([y, c, { f: 'SUBTOTAL(' + o.fn + ',' + TB.rangeStr({ r1, c1: c, r2: y - 1, c2: c }) + ')', s: bold(sh.styleAt(r1, c)) }]);
      else out.push([y, c, null]);
    }
    wb.setCells(sh, out);
    void lab;
    return groups.length;
  };
  D.removeSubtotals = function (wb, sh, g) {
    const rows = [];
    for (let r = g.r1; r <= g.r2; r++) { let st = false; for (let c = g.c1; c <= g.c2; c++) { const f = sh.fml.get(KEY(r, c)); if (f && /^SUBTOTAL\(/i.test(f.src)) { st = true; break; } } if (st) rows.push(r); }
    for (let i = rows.length - 1; i >= 0; i--) wb.shiftCells(sh, 'r', rows[i], -1);
    for (let r = g.r1; r <= g.r2; r++) if (sh.outR[r]) wb.setProp(sh.outR, r, undefined);
    return rows.length;
  };
  D.group = function (wb, sh, axis, a, b, d) {
    const arr = axis === 'r' ? sh.outR : sh.outC;
    for (let i = a; i <= b; i++) { const v = Math.max(0, Math.min(7, (arr[i] || 0) + d)); wb.setProp(arr, i, v || undefined); }
  };
  /** replier / déplier un niveau de plan : afficher seulement les niveaux ≤ lv */
  D.showLevel = function (wb, sh, axis, lv) {
    const arr = axis === 'r' ? sh.outR : sh.outC, hid = axis === 'r' ? sh.hidR : sh.hidC;
    arr.forEach((v, i) => { const h = (v || 0) >= lv; if (h !== hid.has(i)) wb.setProp(hid, i, h); });
    wb.setProp(sh, 'collapsedR', null);
  };
  D.toggleGroup = function (wb, sh, axis, i, L) {
    const arr = axis === 'r' ? sh.outR : sh.outC, hid = axis === 'r' ? sh.hidR : sh.hidC;
    // groupe au-dessus de la ligne de synthèse i (ou contenant i)
    let a = i - 1, b = i - 1;
    if ((arr[i] || 0) >= L) { a = i; b = i; }
    while (a > 0 && (arr[a - 1] || 0) >= L) a--;
    while ((arr[b + 1] || 0) >= L) b++;
    if ((arr[a] || 0) < L) return;
    const hide = !hid.has(a);
    for (let k = a; k <= b; k++) if ((arr[k] || 0) >= L) wb.setProp(hid, k, hide);
    if (axis === 'r') { const cr = Object.assign({}, sh.collapsedR || {}); if (hide) cr[b + 1] = L; else delete cr[b + 1]; wb.setProp(sh, 'collapsedR', cr); }
  };

  /* =====================================================================
     Tableau croisé dynamique
     ===================================================================== */
  const PV = TB.Pivot = {};
  PV.AGGS = [['sum', 'Somme'], ['count', 'Nombre'], ['avg', 'Moyenne'], ['max', 'Max'], ['min', 'Min'], ['product', 'Produit'], ['countNums', 'Nombre (nombres)'], ['stdev', 'Écart type'], ['var', 'Variance']];
  PV.SHOWS = [['normal', 'Valeur'], ['pctTotal', '% du total général'], ['pctCol', '% du total de la colonne'], ['pctRow', '% du total de la ligne']];
  /** lecture de la source : {fields:[noms], rows:[[valeurs]]} */
  PV.source = function (wb, srcRef) {
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(srcRef); const sh = m ? wb.sheet((m[1] || m[2]).replace(/''/g, "'")) : null; const g = m && TB.parseRange(m[3]);
    if (!sh || !g) return null;
    const g2 = { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, sh.extent().r), c2: Math.min(g.c2, sh.extent().c) };
    const fields = []; for (let c = g2.c1; c <= g2.c2; c++) { const v = sh.get(g2.r1, c); fields.push(v == null || v === '' ? 'Colonne ' + TB.colName(c) : TB.Fmt.text(v, 'General')); }
    const rows = [], fmts = [];
    for (let r = g2.r1 + 1; r <= g2.r2; r++) { const row = []; let any = false; for (let c = g2.c1; c <= g2.c2; c++) { const v = sh.get(r, c); row.push(v); if (v !== null) any = true; } if (any) rows.push(row); }
    for (let c = g2.c1; c <= g2.c2; c++) fmts.push(wb.styles.get(sh.styleAt(g2.r1 + 1, c)).nf || 'General');
    return { fields, rows, fmts, sh, g: g2 };
  };
  const keyOf = (v) => v === null || v === '' ? '\u0000(vide)' : typeof v === 'string' ? 's' + v.toLowerCase() : (typeof v === 'number' ? 'n' : typeof v) + String(v);
  function groupVal(v, grp) { if (typeof v !== 'number' || !grp) return v; const d = TB.ymd(v); if (grp === 'year') return d.y; if (grp === 'quarter') return d.y + ' T' + Math.ceil(d.m / 3); if (grp === 'month') return TB.serial(d.y, d.m, 1); return v; }
  /** calcul : cfg {rows:[i], cols:[i], vals:[{f, agg, show, name}], filters:[{f, vals:[clés exclues]}], grand:{rows, cols}, groups:{i:'month'|'year'|'quarter'}} → {grid:[[{v, k:'h'|'rh'|'ch'|'v'|'st'|'gt', b}]], fmt} */
  PV.compute = function (src, cfg) {
    const R = cfg.rows || [], Cc = cfg.cols || [], V = cfg.vals && cfg.vals.length ? cfg.vals : [{ f: null, agg: 'count' }];
    const grp = cfg.groups || {};
    const data = src.rows.filter((row) => (cfg.filters || []).every((f) => !(f.vals || []).includes(keyOf(groupVal(row[f.f], grp[f.f])))));
    // combinaisons
    const rowKeys = new Map(), colKeys = new Map();
    const tupleOf = (row, idx) => idx.map((i) => groupVal(row[i], grp[i]));
    const tk = (t) => t.map(keyOf).join('\u0001');
    const cells = new Map();
    const acc = () => V.map(() => ({ sum: 0, n: 0, cnt: 0, nums: [], prod: 1, max: -Infinity, min: Infinity }));
    const push = (key, row) => { let a = cells.get(key); if (!a) cells.set(key, a = acc()); V.forEach((v, k) => { const x = v.f == null ? 1 : row[v.f]; const s = a[k]; if (x !== null && x !== '') s.cnt++; if (typeof x === 'number') { s.sum += x; s.n++; s.nums.push(x); s.prod *= x; if (x > s.max) s.max = x; if (x < s.min) s.min = x; } }); };
    data.forEach((row) => {
      const rt = tupleOf(row, R), ct = tupleOf(row, Cc);
      // tous les niveaux de regroupement (sous-totaux)
      for (let i = 0; i <= rt.length; i++) for (let j = 0; j <= ct.length; j++) push(tk(rt.slice(0, i)) + '|' + tk(ct.slice(0, j)) + '|' + i + '|' + j, row);
      for (let i = 1; i <= rt.length; i++) { const k = tk(rt.slice(0, i)); if (!rowKeys.has(k)) rowKeys.set(k, rt.slice(0, i)); }
      for (let j = 1; j <= ct.length; j++) { const k = tk(ct.slice(0, j)); if (!colKeys.has(k)) colKeys.set(k, ct.slice(0, j)); }
    });
    const val = (a, v) => { switch (v.agg) { case 'sum': return a.sum; case 'count': return a.cnt; case 'countNums': return a.n; case 'avg': return a.n ? a.sum / a.n : TB.E.DIV0; case 'max': return a.n ? a.max : 0; case 'min': return a.n ? a.min : 0; case 'product': return a.n ? a.prod : 0; case 'stdev': case 'var': { if (a.n < 2) return TB.E.DIV0; const m = a.sum / a.n; const s = a.nums.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.n - 1); return v.agg === 'var' ? s : Math.sqrt(s); } } return a.sum; };
    const sortT = (l) => l.sort((x, y) => { for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = TB.cmp(x[i], y[i]); if (c) return c; } return x.length - y.length; });
    // lignes de sortie (ordre hiérarchique, sous-totaux après chaque groupe en mode compact)
    const leafR = sortT(Array.from(rowKeys.values()).filter((t) => t.length === R.length));
    const leafC = sortT(Array.from(colKeys.values()).filter((t) => t.length === Cc.length));
    const rowsOut = []; // {t, level, sub}
    if (!R.length) rowsOut.push({ t: [], level: 0 });
    else {
      const walk = (prefix, depth) => {
        const kids = sortT(Array.from(rowKeys.values()).filter((t) => t.length === depth + 1 && tk(t.slice(0, depth)) === tk(prefix)));
        kids.forEach((t) => { if (depth + 1 < R.length) { rowsOut.push({ t, level: depth, head: true }); walk(t, depth + 1); if (cfg.subtotals !== false) rowsOut.push({ t, level: depth, sub: true }); } else rowsOut.push({ t, level: depth }); });
      };
      walk([], 0);
    }
    const colsOut = Cc.length ? leafC.map((t) => ({ t })) : [{ t: [] }];
    const grand = cfg.grand || { rows: true, cols: true };
    const nV = V.length;
    const grid = [];
    // en-tête
    const head = [{ v: R.length ? 'Étiquettes de lignes' : '', k: 'h' }];
    const valName = (v) => v.name || ((PV.AGGS.find((a) => a[0] === v.agg) || [0, 'Somme'])[1] + ' de ' + (v.f == null ? 'lignes' : src.fields[v.f]));
    if (Cc.length) {
      const h0 = [{ v: nV === 1 ? valName(V[0]) : '', k: 'h' }]; colsOut.forEach((col) => V.forEach((v, k) => h0.push({ v: k === 0 ? col.t.map((x) => x === null ? '(vide)' : x).join(' – ') : '', k: 'ch' }))); if (grand.cols !== false) V.forEach((v, k) => h0.push({ v: k === 0 ? 'Total général' : '', k: 'ch', b: true }));
      grid.push(h0);
    }
    colsOut.forEach((col) => V.forEach((v) => head.push({ v: Cc.length ? (nV > 1 ? valName(v) : '') : valName(v), k: 'ch' })));
    if (Cc.length && grand.cols !== false) V.forEach((v) => head.push({ v: nV > 1 ? valName(v) : '', k: 'ch' }));
    if (!Cc.length || nV > 1) grid.push(head); else grid[grid.length - 1][0].v = 'Étiquettes de lignes';
    const totalAll = cells.get('||0|0');
    const pct = (x, base) => typeof x === 'number' && typeof base === 'number' && base ? x / base : (typeof x === 'number' ? 0 : x);
    const outRow = (o) => {
      const i = o.t.length, label = o.t.length ? o.t[o.t.length - 1] : 'Total';
      const row = [{ v: o.sub ? 'Total ' + (label === null ? '(vide)' : TB.Fmt.text(label, 'General')) : (label === null ? '(vide)' : label), k: 'rh', level: o.level, b: o.head || o.sub }];
      const rkey = tk(o.t);
      const rowTot = cells.get(rkey + '||' + i + '|0');
      colsOut.forEach((col) => { const a = cells.get(rkey + '|' + tk(col.t) + '|' + i + '|' + col.t.length); V.forEach((v, k) => { let x = a ? val(a[k], v) : null; if (v.show === 'pctTotal' && x != null) x = pct(x, totalAll ? val(totalAll[k], v) : 0); else if (v.show === 'pctRow' && x != null) x = pct(x, rowTot ? val(rowTot[k], v) : 0); else if (v.show === 'pctCol' && x != null) { const ct = cells.get('|' + tk(col.t) + '|0|' + col.t.length); x = pct(x, ct ? val(ct[k], v) : 0); } row.push({ v: o.head && cfg.subtotals !== false ? null : x, k: 'v', b: o.sub, pct: v.show && v.show !== 'normal', fi: k }); }); });
      if (Cc.length && grand.cols !== false) V.forEach((v, k) => { let x = rowTot ? val(rowTot[k], v) : null; if (v.show === 'pctTotal') x = pct(x, totalAll ? val(totalAll[k], v) : 0); else if (v.show === 'pctRow') x = x == null ? null : 1; row.push({ v: o.head && cfg.subtotals !== false ? null : x, k: 'v', b: true, pct: v.show && v.show !== 'normal', fi: k }); });
      return row;
    };
    rowsOut.forEach((o) => { if (R.length) grid.push(outRow(o)); });
    if (grand.rows !== false || !R.length) {
      const row = [{ v: 'Total général', k: 'gt', b: true }];
      colsOut.forEach((col) => { const a = cells.get('|' + tk(col.t) + '|0|' + col.t.length); V.forEach((v, k) => { let x = a ? val(a[k], v) : null; if (v.show === 'pctTotal' || v.show === 'pctCol') x = v.show === 'pctCol' ? (x == null ? null : 1) : pct(x, totalAll ? val(totalAll[k], v) : 0); else if (v.show === 'pctRow') x = pct(x, totalAll ? val(totalAll[k], v) : 0); row.push({ v: x, k: 'v', b: true, gt: true, pct: v.show && v.show !== 'normal', fi: k }); }); });
      if (Cc.length && grand.cols !== false) V.forEach((v, k) => { let x = totalAll ? val(totalAll[k], v) : null; if (v.show && v.show !== 'normal') x = 1; row.push({ v: x, k: 'v', b: true, gt: true, pct: v.show && v.show !== 'normal', fi: k }); });
      grid.push(row);
    }
    void leafR;
    return { grid, valFmts: V.map((v) => v.f != null && (v.agg === 'sum' || v.agg === 'avg' || v.agg === 'max' || v.agg === 'min') ? src.fmts[v.f] : 'General'), rowFmts: R.map((i) => grp[i] === 'month' ? 'mmm yyyy' : src.fmts[i]) };
  };
  /** écrit le résultat dans la feuille à partir de anchor, efface l'ancienne zone ; renvoie la zone écrite */
  PV.write = function (wb, sh, anchor, res, old) {
    const W = wb; const list = [];
    if (old) for (let r = old.r1; r <= old.r2; r++) for (let c = old.c1; c <= old.c2; c++) list.push([r, c, null]);
    const H = res.grid.length, Wd = Math.max(...res.grid.map((r) => r.length));
    const st = (o) => W.styles.add(o);
    const sHead = st({ b: true, bg: '#DDEBF7', bb: { s: 'thin', c: '#8EA9DB' } }), sGt = st({ b: true, bg: '#DDEBF7', bt: { s: 'thin', c: '#8EA9DB' } });
    res.grid.forEach((row, i) => row.forEach((cell, j) => {
      const r = anchor.r + i, c = anchor.c + j;
      let s = 0;
      if (cell.k === 'h' || cell.k === 'ch') s = sHead;
      else if (cell.k === 'gt' || cell.gt) s = cell.k === 'v' ? W.styles.with(sGt, { nf: cell.pct ? '0.00%' : res.valFmts[cell.fi] !== 'General' ? res.valFmts[cell.fi] : null }) : sGt;
      else if (cell.k === 'rh') s = st({ b: cell.b || undefined, ind: cell.level || undefined, nf: typeof cell.v === 'number' && res.rowFmts[cell.level] !== 'General' ? res.rowFmts[cell.level] : undefined });
      else if (cell.k === 'v') s = st({ b: cell.b || undefined, nf: cell.pct ? '0.00%' : (res.valFmts[cell.fi] !== 'General' ? res.valFmts[cell.fi] : undefined) });
      const idx = list.findIndex((x) => x[0] === r && x[1] === c); const o = cell.v === null || cell.v === undefined ? (s ? { s } : null) : { v: cell.v, s: s || undefined };
      if (idx >= 0) list[idx] = [r, c, o]; else list.push([r, c, o]);
    }));
    W.setCells(sh, list);
    return { r1: anchor.r, c1: anchor.c, r2: anchor.r + H - 1, c2: anchor.c + Wd - 1 };
  };
  /** actualiser tous les TCD (ou un seul) */
  PV.refresh = function (wb, only) {
    let n = 0;
    wb.sheets.forEach((sh) => (sh.pivots || []).forEach((p, i) => {
      if (only && only !== p) return;
      const src = PV.source(wb, p.src); if (!src) return;
      const res = PV.compute(src, p.cfg);
      const range = PV.write(wb, sh, p.anchor, res, p.range);
      const l = sh.pivots.slice(); l[i] = Object.assign({}, p, { range }); wb.setProp(sh, 'pivots', l); n++;
    }));
    return n;
  };

  /* =====================================================================
     Valeur cible
     ===================================================================== */
  D.goalSeek = function (wb, sh, setCell, target, chSh, chCell) {
    const f = sh.fml.get(KEY(setCell.r, setCell.c)); if (!f) return { ok: false, err: 'La cellule à définir doit contenir une formule.' };
    if (chSh.fml.has(KEY(chCell.r, chCell.c))) return { ok: false, err: 'La cellule à modifier doit contenir une valeur (pas une formule).' };
    const orig = chSh.get(chCell.r, chCell.c);
    const evalAt = (x) => { TB._setVal(chSh, chCell.r, chCell.c, x); wb.recalcFrom([[chSh, chCell.r, chCell.c]]); const v = sh.get(setCell.r, setCell.c); return typeof v === 'number' ? v - target : NaN; };
    let x0 = typeof orig === 'number' ? orig : 0, x1 = x0 === 0 ? 1 : x0 * 1.01 + 0.01;
    let f0 = evalAt(x0), f1 = evalAt(x1), best = { x: x0, f: Math.abs(f0) };
    for (let i = 0; i < 200 && isFinite(f1); i++) {
      if (Math.abs(f1) < best.f) best = { x: x1, f: Math.abs(f1) };
      if (Math.abs(f1) < 1e-9 * Math.max(1, Math.abs(target))) break;
      let x2 = f1 === f0 ? x1 + (x1 - x0 || 1) : x1 - f1 * (x1 - x0) / (f1 - f0);
      if (!isFinite(x2)) x2 = x1 * 2 + 1;
      x0 = x1; f0 = f1; x1 = x2; f1 = evalAt(x1);
    }
    if (isFinite(f1) && Math.abs(f1) < best.f) best = { x: x1, f: Math.abs(f1) };
    // remettre la valeur d'origine (l'écriture finale passe par une transaction annulable)
    TB._setVal(chSh, chCell.r, chCell.c, orig); wb.recalcFrom([[chSh, chCell.r, chCell.c]]);
    const ok = best.f < 1e-6 * Math.max(1, Math.abs(target));
    return { ok, x: TB.round15(best.x), err: ok ? null : 'Aucune solution trouvée (écart restant : ' + TB.numText(best.f) + ').' };
  };

  /* =====================================================================
     Remplissage instantané (Ctrl+E)
     ===================================================================== */
  const SEPS = /([\s,;\-_/@.|:()]+)/;
  const CASES = [(s) => s, (s) => s.toUpperCase(), (s) => s.toLowerCase(), (s) => s.toLowerCase().replace(/(^|[^a-zà-ÿ])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()), (s) => s.slice(0, 1).toUpperCase(), (s) => s.slice(0, 1)];
  function pieces(src) {
    // morceaux possibles d'une ligne : [{key, text}]
    const out = [];
    src.forEach((s, j) => {
      if (s == null) return; s = String(s);
      const toks = s.split(SEPS).filter((x, i) => i % 2 === 0 && x !== '');
      CASES.forEach((cf, ci) => {
        out.push({ key: 'c' + j + ':all:' + ci, text: cf(s) });
        toks.forEach((t, ti) => { out.push({ key: 'c' + j + ':t' + ti + ':' + ci, text: cf(t) }); out.push({ key: 'c' + j + ':t-' + (toks.length - ti) + ':' + ci, text: cf(t) }); });
      });
      for (let n = 1; n <= Math.min(6, s.length); n++) { out.push({ key: 'c' + j + ':l' + n + ':0', text: s.slice(0, n) }); out.push({ key: 'c' + j + ':r' + n + ':0', text: s.slice(-n) }); }
    });
    return out;
  }
  function apply(key, src) {
    const m = /^c(\d+):(all|t(-?\d+)|l(\d+)|r(\d+)):(\d+)$/.exec(key); if (!m) return null;
    let s = src[+m[1]]; if (s == null) return null; s = String(s);
    let t;
    if (m[2] === 'all') t = s;
    else if (m[3] != null) { const toks = s.split(SEPS).filter((x, i) => i % 2 === 0 && x !== ''); const k = +m[3]; t = k >= 0 ? toks[k] : toks[toks.length + k]; if (t == null) return null; }
    else if (m[4]) t = s.slice(0, +m[4]); else t = s.slice(-(+m[5]));
    return CASES[+m[6]](t);
  }
  /** programmes possibles qui produisent target à partir des morceaux */
  function programs(target, ps, depth) {
    const res = [];
    const rec = (pos, acc) => {
      if (acc.length > (depth || 4)) return;
      if (pos === target.length) { res.push(acc.slice()); return; }
      if (res.length > 400) return;
      for (const p of ps) if (p.text && target.startsWith(p.text, pos)) { acc.push({ k: p.key }); rec(pos + p.text.length, acc); acc.pop(); }
      // littéral (séparateur court)
      const m = /^[^A-Za-z0-9À-ÿ]{1,3}|^[A-Za-zÀ-ÿ0-9]{1,2}(?=[^A-Za-z0-9À-ÿ]|$)/.exec(target.slice(pos));
      if (m && acc.length < (depth || 4)) { acc.push({ lit: m[0] }); rec(pos + m[0].length, acc); acc.pop(); }
    };
    rec(0, []);
    return res;
  }
  /** examples : [{src:[…], out:'…'}] ; rows : [[…]] → sorties (ou null) */
  D.flashFill = function (examples, rows) {
    if (!examples.length) return null;
    let cands = programs(examples[0].out, pieces(examples[0].src));
    const run = (prog, src) => { let s = ''; for (const p of prog) { if (p.lit != null) s += p.lit; else { const t = apply(p.k, src); if (t == null) return null; s += t; } } return s; };
    cands = cands.filter((prog) => examples.every((e) => run(prog, e.src) === e.out));
    if (!cands.length) return null;
    // le plus simple : moins de morceaux, moins de littéraux
    cands.sort((a, b) => a.length - b.length || a.filter((p) => p.lit != null).length - b.filter((p) => p.lit != null).length);
    const best = cands[0];
    return rows.map((src) => run(best, src));
  };
})(typeof window !== 'undefined' ? window : globalThis);
