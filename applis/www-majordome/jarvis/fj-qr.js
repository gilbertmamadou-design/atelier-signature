/* GÉNÉRÉ par pc/build-pc.py depuis pc/shared/fond-jarvis/fj-qr.js : ne pas modifier ici (source : pc/shared/fond-jarvis/, voir pc/README.md). */
/* =====================================================================
   Fond Jarvis : petit générateur de QR codes (hors ligne, sans bibliothèque).
   Mode octets (UTF-8), correction d'erreurs M, versions 1 à 15 (jusqu'à ~410 octets).
   Algorithme de la norme ISO/IEC 18004, écrit d'après la description publique
   du projet « QR Code generator » de Nayuki (licence MIT).
   FJQR.matrix(texte) → tableau de lignes de booléens ; FJQR.svg(texte, opts) → <svg>.
   ===================================================================== */
(function (root) {
  'use strict';
  var ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];   // octets de correction par bloc (niveau M)
  var BLK = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];                // nombre de blocs (niveau M)

  function rawModules(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) { var n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(v) { return Math.floor(rawModules(v) / 8) - ECC[v] * BLK[v]; }
  function mul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
  function divisor(d) {
    var r = []; for (var i = 0; i < d - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (i = 0; i < d; i++) {
      for (var j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = mul(root, 2);
    }
    return r;
  }
  function remainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); for (var i = 0; i < div.length; i++) r[i] ^= mul(div[i], f); });
    return r;
  }
  function utf8(s) { var u = unescape(encodeURIComponent(String(s))), a = []; for (var i = 0; i < u.length; i++) a.push(u.charCodeAt(i)); return a; }
  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function matrix(text) {
    var bytes = utf8(text), v, cc;
    for (v = 1; v <= 15; v++) { cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= dataCodewords(v) * 8) break; }
    if (v > 15) throw new Error('texte trop long pour un QR code');
    // flux de bits
    var bb = [];
    function put(val, n) { for (var i = n - 1; i >= 0; i--) bb.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, cc); bytes.forEach(function (b) { put(b, 8); });
    var cap = dataCodewords(v) * 8;
    put(0, Math.min(4, cap - bb.length));
    put(0, (8 - bb.length % 8) % 8);
    for (var pad = 0xEC; bb.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bb.length; i += 8) { var x = 0; for (var k = 0; k < 8; k++) x = x << 1 | bb[i + k]; data.push(x); }
    // correction d'erreurs et entrelacement
    var nb = BLK[v], el = ECC[v], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    var div = divisor(el), blocks = [], off = 0;
    for (i = 0; i < nb; i++) {
      var dat = data.slice(off, off + shortLen - el + (i < nShort ? 0 : 1)); off += dat.length;
      var ecc = remainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var cw = [];
    for (i = 0; i < blocks[0].length; i++) for (var j = 0; j < blocks.length; j++) if (i !== shortLen - el || j >= nShort) cw.push(blocks[j][i]);

    // matrice
    var size = v * 4 + 17, M = [], F = [];
    for (i = 0; i < size; i++) { M.push(new Array(size).fill(false)); F.push(new Array(size).fill(false)); }
    function setF(x, y, d) { M[y][x] = d; F[y][x] = true; }
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var al = [];
    if (v > 1) {
      var na = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
      al = [6]; for (var p = size - 7; al.length < na; p -= step) al.splice(1, 0, p);
    }
    for (i = 0; i < al.length; i++) for (j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setF(al[i] + ax, al[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
    }
    function format(mask) {
      var d = (0 << 3) | mask, r = d;           // niveau M : bits 00
      for (var q = 0; q < 10; q++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bits = ((d << 10) | r) ^ 0x5412;
      for (q = 0; q <= 5; q++) setF(8, q, bit(bits, q));
      setF(8, 7, bit(bits, 6)); setF(8, 8, bit(bits, 7)); setF(7, 8, bit(bits, 8));
      for (q = 9; q < 15; q++) setF(14 - q, 8, bit(bits, q));
      for (q = 0; q < 8; q++) setF(size - 1 - q, 8, bit(bits, q));
      for (q = 8; q < 15; q++) setF(8, size - 15 + q, bit(bits, q));
      setF(8, size - 8, true);
    }
    format(0);
    if (v >= 7) {
      var r = v; for (i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      var vb = v << 12 | r;
      for (i = 0; i < 18; i++) { var b = bit(vb, i), a = size - 11 + i % 3, c = Math.floor(i / 3); setF(a, c, b); setF(c, a, b); }
    }
    // données en zigzag
    var n = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) {
        var xx = right - j, up = ((right + 1) & 2) === 0, yy = up ? size - 1 - vert : vert;
        if (!F[yy][xx] && n < cw.length * 8) { M[yy][xx] = bit(cw[n >>> 3], 7 - (n & 7)); n++; }
      }
    }
    // masque : le moins pénalisant
    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; }, function (x) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; }, function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; }, function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }];
    function apply(m) { for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; }
    function penalty() {
      var s = 0, dark = 0, x, y, run, c;
      for (y = 0; y < size; y++) { run = 1; for (x = 1; x <= size; x++) { if (x < size && M[y][x] === M[y][x - 1]) run++; else { if (run >= 5) s += run - 2; run = 1; } } }
      for (x = 0; x < size; x++) { run = 1; for (y = 1; y <= size; y++) { if (y < size && M[y][x] === M[y - 1][x]) run++; else { if (run >= 5) s += run - 2; run = 1; } } }
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) { c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) s += 3; }
      var pat = [true, false, true, true, true, false, true];
      function finderLike(get) {
        var t = 0;
        for (var a = 0; a < size; a++) for (var b = 0; b + 7 <= size; b++) {
          var ok = true; for (var q = 0; q < 7; q++) if (get(a, b + q) !== pat[q]) { ok = false; break; }
          if (!ok) continue;
          var before = true, after = true;
          for (q = 1; q <= 4; q++) { if (b - q >= 0 && get(a, b - q)) before = false; if (b + 6 + q < size && get(a, b + 6 + q)) after = false; }
          if (before || after) t += 40;
        }
        return t;
      }
      s += finderLike(function (a, b) { return M[a][b]; }) + finderLike(function (a, b) { return M[b][a]; });
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (M[y][x]) dark++;
      s += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return s;
    }
    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) { apply(m); format(m); var pn = penalty(); if (pn < bestP) { bestP = pn; best = m; } apply(m); }
    apply(best); format(best);
    return M;
  }

  /** SVG carré (modules sombres en currentColor, fond transparent ou opts.bg), marge de 4 modules par défaut */
  function svg(text, opts) {
    opts = opts || {};
    var M = matrix(text), n = M.length, q = opts.quiet == null ? 4 : opts.quiet, W = n + q * 2, d = '';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (M[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + W + '" shape-rendering="crispEdges"' + (opts.cls ? ' class="' + opts.cls + '"' : '') + '>' +
      (opts.bg ? '<rect width="' + W + '" height="' + W + '" fill="' + opts.bg + '"/>' : '') + '<path d="' + d + '" fill="' + (opts.fg || 'currentColor') + '"/></svg>';
  }
  root.FJQR = { matrix: matrix, svg: svg };
})(typeof window !== 'undefined' ? window : globalThis);
