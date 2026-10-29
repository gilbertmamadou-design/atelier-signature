/* COPIE GÉNÉRÉE par pc/build-pc.py depuis pc/shared/toile-worker.js : ne pas modifier ici. */
/* =====================================================================
   Toile sur PC : moteur de recadrage (worker, OffscreenCanvas).
   Portage en JavaScript de applis/scripts/WallpaperJob.java (appli Android
   Toile) : mêmes étapes, mêmes seuils, mêmes arrondis (division entière,
   Math.round sur des float) pour obtenir les mêmes zones gardées.
     borders     bordures unies (tolérance « tol »)
     textBands   bandeau de texte en haut / en bas
     logoBands   logo ou écriture incrustés près du haut / du bas
     trim        rognage des bords (%)
     fit         auto (= retire seulement ce qui est détecté, puis pleine largeur),
                 smart (bestOffset), width (pleine largeur, bandes floues),
                 center, blur (blurFit)
   Messages reçus  : {id, cmd:'process', file, opt:{sw, sh, tol, borders, text, trim, fit, q, out, preview}}
                     {id, cmd:'thumb', file, size}
   Réponses        : {id, ok:true, ...} ou {id, ok:false, error, code}
   Une seule image en mémoire à la fois ; les grandes images sont décodées
   directement à taille réduite (createImageBitmap + resizeWidth/Height),
   l'orientation EXIF est appliquée par le navigateur (imageOrientation).
   ===================================================================== */
'use strict';

/* ---------------- Rectangles (android.graphics.Rect) ---------------- */
function R(l, t, r, b) { return { l: l, t: t, r: r, b: b }; }
function W(r) { return r.r - r.l; }
function H(r) { return r.b - r.t; }
function cp(r) { return R(r.l, r.t, r.r, r.b); }
function eq(a, b) { return a.l === b.l && a.t === b.t && a.r === b.r && a.b === b.b; }
function idiv(a, b) { return Math.trunc(a / b); }            // division entière Java
var f32 = Math.fround;                                          // float Java
function jround(x) { return Math.floor(x + 0.5); }             // Math.round Java

/* ---------------- Image source : pixels RGB empaquetés ---------------- */
// S = {w, h, px: Int32Array (0xRRGGBB), canvas}
function pixelsOf(canvas) {
  var w = canvas.width, h = canvas.height, d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  var px = new Int32Array(w * h);
  for (var i = 0, j = 0; i < px.length; i++, j += 4) px[i] = (d[j] << 16) | (d[j + 1] << 8) | d[j + 2];
  return px;
}
function getRow(S, x, y, len, buf) { var o = y * S.w + x; for (var i = 0; i < len; i++) buf[i] = S.px[o + i]; }
function getCol(S, x, y, len, buf) { var o = y * S.w + x; for (var i = 0; i < len; i++) buf[i] = S.px[o + i * S.w]; }

/* ---------------- Bordures ---------------- */
// Lignes unies depuis chaque bord. Gardées seulement si la couleur est neutre (noir, blanc, gris)
// ou identique sur les deux côtés opposés (cadre, bandes de format) : un ciel bleu en haut n'est pas coupé.
function borders(S, r, tol) {
  var buf = new Int32Array(Math.max(S.w, S.h));
  var maxV = idiv(H(r) * 2, 5), maxH = idiv(W(r) * 2, 5);
  var t = band(S, r, 0, maxV, tol, buf), bo = band(S, r, 1, maxV, tol, buf);
  var l = band(S, r, 2, maxH, tol, buf), ri = band(S, r, 3, maxH, tol, buf);
  var pairV = t[0] > 0 && bo[0] > 0 && near(t[1], bo[1], tol * 2);
  var pairH = l[0] > 0 && ri[0] > 0 && near(l[1], ri[1], tol * 2);
  var top = (t[0] > 1 && (pairV || neutral(t[1]))) ? t[0] + 1 : 0;
  var bot = (bo[0] > 1 && (pairV || neutral(bo[1]))) ? bo[0] + 1 : 0;
  var lef = (l[0] > 1 && (pairH || neutral(l[1]))) ? l[0] + 1 : 0;
  var rig = (ri[0] > 1 && (pairH || neutral(ri[1]))) ? ri[0] + 1 : 0;
  var n = R(r.l + lef, r.t + top, r.r - rig, r.b - bot);
  if (W(n) < idiv(W(r), 5) || H(n) < idiv(H(r), 5)) return cp(r);
  return n;
}
// side : 0 haut, 1 bas, 2 gauche, 3 droite. Retourne [épaisseur, couleur]
function band(S, r, side, max, tol, buf) {
  var edge = lineColor(S, r, side, 0, tol, buf);
  if (edge === -1) return [0, 0];
  var n = 1;
  while (n < max) {
    var cc = lineColor(S, r, side, n, tol, buf);
    if (cc === -1 || !near(cc, edge, tol)) break;
    n++;
  }
  if (n >= max) return [0, 0];
  return [n, edge];
}
function lineColor(S, r, side, k, tol, buf) {
  var len;
  if (side < 2) { var y = side === 0 ? r.t + k : r.b - 1 - k; len = W(r); if (y < r.t || y >= r.b) return -1; getRow(S, r.l, y, len, buf); }
  else { var x = side === 2 ? r.l + k : r.r - 1 - k; len = H(r); if (x < r.l || x >= r.r) return -1; getCol(S, x, r.t, len, buf); }
  return uniform(buf, len, tol);
}
function uniform(px, n, tol) {
  if (n <= 0) return -1;
  var sr = 0, sg = 0, sb = 0, i, p;
  for (i = 0; i < n; i++) { p = px[i]; sr += (p >> 16) & 255; sg += (p >> 8) & 255; sb += p & 255; }
  var mr = idiv(sr, n), mg = idiv(sg, n), mb = idiv(sb, n);
  var bad = 0, allow = Math.max(1, idiv(n, 50));
  for (i = 0; i < n; i++) {
    p = px[i];
    if (Math.abs(((p >> 16) & 255) - mr) > tol || Math.abs(((p >> 8) & 255) - mg) > tol || Math.abs((p & 255) - mb) > tol)
      if (++bad > allow) return -1;
  }
  return (mr << 16) | (mg << 8) | mb;
}
function near(a, b, tol) {
  return Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= tol && Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= tol && Math.abs((a & 255) - (b & 255)) <= tol;
}
function neutral(c) {
  var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn < 30 && (mx < 60 || mn > 200 || mx - mn < 12);
}

/* ---------------- Bandeaux de texte ---------------- */
// En haut ou en bas : fond d'une seule couleur (≥ 45 % de la ligne) avec des traits de lettres.
function textBands(S, r) {
  var zone = idiv(H(r) * 22, 100);
  var minLen = Math.max(4, idiv(H(r) * 15, 1000));
  var buf = new Int32Array(W(r)), hist = new Int32Array(4096);
  var top = textBand(S, r, true, zone, minLen, buf, hist);
  var bot = textBand(S, r, false, zone, minLen, buf, hist);
  var margin = idiv(H(r), 200);
  var n = R(r.l, r.t + (top > 0 ? top + margin : 0), r.r, r.b - (bot > 0 ? bot + margin : 0));
  return H(n) < idiv(H(r), 2) ? cp(r) : n;
}
function textBand(S, r, fromTop, zone, minLen, buf, hist) {
  var w = W(r), step = Math.max(1, idiv(w, 400));
  var edgeBin = -1, len = 0, textRows = 0;
  for (var k = 0; k < zone; k++) {
    var y = fromTop ? r.t + k : r.b - 1 - k;
    getRow(S, r.l, y, w, buf);
    hist.fill(0);
    var n = 0, edges = 0, prevL = -1;
    for (var x = 0; x < w; x += step) {
      var p = buf[x], pr = (p >> 16) & 255, pg = (p >> 8) & 255, pb = p & 255;
      hist[((pr >> 4) << 8) | ((pg >> 4) << 4) | (pb >> 4)]++;
      var lum = idiv(pr * 3 + pg * 6 + pb, 10);
      if (prevL >= 0 && Math.abs(lum - prevL) > 70) edges++;
      prevL = lum;
      n++;
    }
    var best = 0, bin = 0;
    for (var i = 0; i < 4096; i++) if (hist[i] > best) { best = hist[i]; bin = i; }
    var caption = best >= n * 0.45;
    if (!caption) break;
    if (edgeBin === -1) edgeBin = bin;
    else if (!binNear(bin, edgeBin)) break;
    len++;
    if (edges >= 2) textRows++;
  }
  if (len >= zone) return 0;
  if (len < minLen || textRows < 3) return 0;
  return len;
}
function binNear(a, b) {
  return Math.abs((a >> 8) - (b >> 8)) <= 1 && Math.abs(((a >> 4) & 15) - ((b >> 4) & 15)) <= 1 && Math.abs((a & 15) - (b & 15)) <= 1;
}

/* ---------------- Logo ou écriture incrustés ---------------- */
// Rangées où les contrastes forts sont bien plus denses qu'au cœur de l'image, regroupées contre le bord.
function smallCopy(S, r, w, h) {
  var c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';   // bilinéaire, comme Paint.FILTER_BITMAP_FLAG
  g.drawImage(S.canvas, r.l, r.t, W(r), H(r), 0, 0, w, h);
  return c;
}
function logoBands(S, r) {
  var Wd = 640, Hd = Math.max(40, jround(f32(f32(640 * H(r)) / Math.max(1, W(r)))));
  var px = pixelsOf(smallCopy(S, r, Wd, Hd));
  var nSeg = 6, d = new Int32Array(Hd), seg = new Int32Array(nSeg);
  for (var y = 0; y < Hd; y++) {
    seg.fill(0);
    var prev = -1;
    for (var x = 0; x < Wd; x++) {
      var p = px[y * Wd + x];
      var l = idiv(((p >> 16) & 255) * 3 + ((p >> 8) & 255) * 6 + (p & 255), 10);
      if (prev >= 0 && Math.abs(l - prev) > 40) seg[Math.min(nSeg - 1, idiv(x * nSeg, Wd))]++;
      prev = l;
    }
    var m = 0; for (var i = 0; i < nSeg; i++) m = Math.max(m, seg[i]);
    d[y] = m;
  }
  var mid = Array.prototype.slice.call(d, idiv(Hd, 4), Math.max(idiv(Hd, 4) + 1, idiv(Hd * 3, 4))).sort(function (a, b) { return a - b; });
  var thr = Math.max(7, mid[idiv(mid.length, 2)] * 2.5 + 3);
  var zone = Math.max(3, idiv(Hd * 18, 100));
  var top = logoCut(d, zone, thr, true), bot = logoCut(d, zone, thr, false);
  var k = f32(H(r) / Hd);
  var n = R(r.l, r.t + jround(f32(top * k)), r.r, r.b - jround(f32(bot * k)));
  return H(n) < f32(H(r) * f32(0.65)) ? cp(r) : n;
}
function logoCut(d, zone, thr, fromTop) {
  var Hd = d.length, hot = 0, last = -1, k, y;
  for (k = 0; k < zone; k++) { y = fromTop ? k : Hd - 1 - k; if (d[y] > thr) { hot++; last = k; } }
  if (hot < 3 || last < 0) return 0;
  // l'écriture doit être isolée contre le bord : juste après, l'image redevient calme
  var look = Math.max(3, idiv(zone, 2));
  for (k = last + 1; k <= last + look && k < Hd; k++) { y = fromTop ? k : Hd - 1 - k; if (d[y] > thr) return 0; }
  return last + 2;
}

/* ---------------- Adapter à l'écran ---------------- */
function aspectClose(r, sw, sh) {
  var ir = f32(W(r) / H(r)), tr = f32(sw / sh);
  return Math.abs(f32(ir / tr) - 1) <= f32(0.08);
}
function fit(S, r, sw, sh, mode, res) {
  var tr = f32(sw / sh), ir = f32(W(r) / H(r));
  if (mode === 'blur' && !aspectClose(r, sw, sh)) return blurFit(S, r, sw, sh);
  // Pleine largeur : image plus large que l'écran → bandes floues en haut et en bas, plus haute → recadrage vertical intelligent
  if (mode === 'width' && ir > tr && !aspectClose(r, sw, sh)) return blurFit(S, r, sw, sh);
  var crop = cp(r), center = mode === 'center';
  if (ir > tr) {
    var cw = Math.max(1, Math.min(W(r), jround(f32(H(r) * tr))));
    var x = center ? r.l + idiv(W(r) - cw, 2) : bestOffset(S, r, cw, true);
    crop = R(x, r.t, x + cw, r.b);
  } else if (ir < tr) {
    var ch = Math.max(1, Math.min(H(r), jround(f32(W(r) / tr))));
    var y = center ? r.t + idiv(H(r) - ch, 2) : bestOffset(S, r, ch, false);
    crop = R(r.l, y, r.r, y + ch);
  }
  res.keep = crop;
  return scaleRegion(S.canvas, crop, sw, sh);
}
// Réduction par moitiés successives puis au format exact : image nette, sans crénelage
function scaleRegion(src, crop, w, h) {
  var cur = src, x = crop.l, y = crop.t, cw = W(crop), ch = H(crop), owned = null;
  while (idiv(cw, 2) >= w && idiv(ch, 2) >= h) {
    var half = new OffscreenCanvas(idiv(cw, 2), idiv(ch, 2)), g = half.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cur, x, y, cw, ch, 0, 0, half.width, half.height);
    if (owned) owned.width = 0;
    cur = owned = half; x = 0; y = 0; cw = half.width; ch = half.height;
  }
  var out = new OffscreenCanvas(w, h), go = out.getContext('2d');
  go.imageSmoothingEnabled = true; go.imageSmoothingQuality = 'high';
  go.drawImage(cur, x, y, cw, ch, 0, 0, w, h);
  if (owned) owned.width = 0;
  return out;
}
// Recadrage intelligent : la zone la plus riche en détails et en couleurs, avec une légère préférence pour le centre
function bestOffset(S, r, len, horizontal) {
  var s = f32(160 / Math.max(W(r), H(r)));
  var smw = Math.max(2, jround(f32(W(r) * s))), smh = Math.max(2, jround(f32(H(r) * s)));
  var px = pixelsOf(smallCopy(S, r, smw, smh));
  var n = horizontal ? smw : smh, prof = new Float64Array(n);
  var lum = function (q) { return idiv(((q >> 16) & 255) * 3 + ((q >> 8) & 255) * 6 + (q & 255), 10); };
  for (var y = 0; y < smh; y++) for (var x = 0; x < smw; x++) {
    var p = px[y * smw + x], pr = (p >> 16) & 255, pg = (p >> 8) & 255, pb = p & 255;
    var l = idiv(pr * 3 + pg * 6 + pb, 10), e = 0;
    if (x + 1 < smw) e += Math.abs(l - lum(px[y * smw + x + 1]));
    if (y + 1 < smh) e += Math.abs(l - lum(px[(y + 1) * smw + x]));
    e += 0.25 * (Math.max(pr, pg, pb) - Math.min(pr, pg, pb));
    prof[horizontal ? x : y] += e;
  }
  var win = Math.max(1, Math.min(n, jround(f32(len * s))));
  var range = n - win;
  if (range <= 0) return horizontal ? r.l : r.t;
  var sum = 0, total = 0, i;
  for (i = 0; i < n; i++) total += prof[i];
  for (i = 0; i < win; i++) sum += prof[i];
  var bestScore = -1e18, best = idiv(range, 2), mid = range / 2;
  for (var off = 0; off <= range; off++) {
    if (off > 0) sum += prof[off + win - 1] - prof[off - 1];
    var score = sum - 0.2 * (total * win / n) * Math.abs(off - mid) / Math.max(1, mid);
    if (score > bestScore) { bestScore = score; best = off; }
  }
  var full = horizontal ? W(r) : H(r);
  var o = jround(f32(best / s));
  o = Math.max(0, Math.min(full - len, o));
  return (horizontal ? r.l : r.t) + o;
}
function blurFit(S, r, sw, sh) {
  var out = new OffscreenCanvas(sw, sh), cv = out.getContext('2d');
  cv.imageSmoothingEnabled = true; cv.imageSmoothingQuality = 'low';
  var cover = f32(Math.max(f32(sw / W(r)), f32(sh / H(r))));
  var cw = Math.min(W(r), jround(f32(sw / cover))), ch = Math.min(H(r), jround(f32(sh / cover)));
  var cl = r.l + idiv(W(r) - cw, 2), ct = r.t + idiv(H(r) - ch, 2);
  var tw = Math.max(2, idiv(sw, 40)), th = Math.max(2, idiv(sh, 40));
  var tiny = new OffscreenCanvas(tw, th), gt = tiny.getContext('2d');
  gt.imageSmoothingEnabled = true; gt.imageSmoothingQuality = 'low';
  gt.drawImage(S.canvas, cl, ct, cw, ch, 0, 0, tw, th);
  var mid = new OffscreenCanvas(tw * 4, th * 4), gm = mid.getContext('2d');
  gm.imageSmoothingEnabled = true; gm.imageSmoothingQuality = 'low';
  gm.drawImage(tiny, 0, 0, tw * 4, th * 4);
  tiny.width = 0;
  cv.drawImage(mid, 0, 0, sw, sh);
  mid.width = 0;
  cv.fillStyle = 'rgba(0,0,0,' + (0x73 / 255) + ')';
  cv.fillRect(0, 0, sw, sh);
  var fs = f32(Math.min(f32(sw / W(r)), f32(sh / H(r))));
  var fw = Math.max(1, jround(f32(W(r) * fs))), fh = Math.max(1, jround(f32(H(r) * fs)));
  var scaled = scaleRegion(S.canvas, r, fw, fh);
  cv.imageSmoothingQuality = 'high';
  cv.drawImage(scaled, idiv(sw - fw, 2), idiv(sh - fh, 2));
  scaled.width = 0;
  return out;
}

/* ---------------- Traitement complet (WallpaperJob.process) ---------------- */
function process(S, o) {
  var sw = o.sw, sh = o.sh;
  var full = R(0, 0, S.w, S.h), r = cp(full), info = [], steps = {};
  var tol = Math.max(4, Math.min(80, o.tol == null ? 24 : +o.tol));
  var autoFit = o.fit === 'auto';
  if (autoFit || o.borders !== false) { var b = borders(S, r, tol); if (!eq(b, r)) info.push('bordures retirées'); r = b; steps.borders = cp(r); }
  if (autoFit) {
    var t = textBands(S, r);
    if (!eq(t, r)) { info.push('bandeau de texte coupé'); r = borders(S, t, tol); steps.text = cp(r); }
    var g = logoBands(S, r);
    if (!eq(g, r)) { info.push(g.t > r.t && g.b < r.b ? 'logo ou texte retiré en haut et en bas' : g.t > r.t ? 'logo ou texte retiré en haut' : 'logo ou texte retiré en bas'); r = g; steps.logo = cp(r); }
    if (!info.length) info.push('rien à retirer, image gardée');
  }
  if (!autoFit && o.text) {
    var t2 = textBands(S, r);
    if (!eq(t2, r)) { info.push('bandeau de texte coupé'); r = t2; if (o.borders !== false) r = borders(S, r, tol); steps.text = cp(r); }
  }
  var trim = Math.max(0, Math.min(15, +o.trim || 0));
  if (trim > 0) { var dx = idiv(W(r) * trim, 100), dy = idiv(H(r) * trim, 100); r = R(r.l + dx, r.t + dy, r.r - dx, r.b - dy); info.push('bords rognés de ' + trim + ' %'); }
  if (W(r) < idiv(W(full), 4) || H(r) < idiv(H(full), 4) || W(r) <= 0 || H(r) <= 0) { r = cp(full); info = []; }
  var mode = autoFit ? 'width' : (o.fit || 'smart');
  var res = { keep: cp(r), detected: cp(r) };
  var out = fit(S, r, sw, sh, mode, res);
  if ((mode === 'blur' || (mode === 'width' && f32(W(r) / H(r)) > f32(sw / sh))) && !aspectClose(r, sw, sh)) info.push(mode === 'width' ? 'pleine largeur, bandes floues' : 'image entière sur fond flou');
  else info.push('ajustée à l\'écran ' + sw + '×' + sh);
  res.out = out; res.info = info.join(', '); res.steps = steps;
  return res;
}

/* ---------------- Lecture des fichiers ---------------- */
// Dimensions sans tout décoder : JPEG (SOFn + orientation EXIF), PNG, WebP, GIF, BMP, HEIC/AVIF (ispe)
function probe(u) {
  var dv = new DataView(u.buffer, u.byteOffset, u.byteLength), n = u.length;
  function str(o, l) { var s = ''; for (var i = 0; i < l && o + i < n; i++) s += String.fromCharCode(u[o + i]); return s; }
  try {
    if (u[0] === 0xFF && u[1] === 0xD8) {
      var o = 2, orient = 1;
      while (o + 9 < n) {
        if (u[o] !== 0xFF) { o++; continue; }
        var m = u[o + 1];
        if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { o += 2; continue; }
        var len = dv.getUint16(o + 2);
        if (m === 0xE1 && str(o + 4, 4) === 'Exif') {
          var t = o + 10, le = str(t, 2) === 'II', g16 = function (p) { return dv.getUint16(t + p, le); }, g32 = function (p) { return dv.getUint32(t + p, le); };
          var ifd = g32(4), cnt = g16(ifd);
          for (var i = 0; i < cnt; i++) { var e = ifd + 2 + i * 12; if (g16(e) === 0x0112) orient = g16(e + 8); }
        }
        if ((m >= 0xC0 && m <= 0xCF) && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          var h = dv.getUint16(o + 5), w = dv.getUint16(o + 7);
          return { w: w, h: h, swap: orient >= 5 && orient <= 8, type: 'jpeg' };
        }
        o += 2 + len;
      }
      return null;
    }
    if (u[0] === 0x89 && str(1, 3) === 'PNG') return { w: dv.getUint32(16), h: dv.getUint32(20), type: 'png' };
    if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {
      var c = str(12, 4);
      if (c === 'VP8X') return { w: 1 + (u[24] | u[25] << 8 | u[26] << 16), h: 1 + (u[27] | u[28] << 8 | u[29] << 16), type: 'webp' };
      if (c === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3FFF, h: dv.getUint16(28, true) & 0x3FFF, type: 'webp' };
      if (c === 'VP8L') { var b0 = u[21], b1 = u[22], b2 = u[23], b3 = u[24]; return { w: 1 + (((b1 & 0x3F) << 8) | b0), h: 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)), type: 'webp' }; }
    }
    if (str(0, 3) === 'GIF') return { w: dv.getUint16(6, true), h: dv.getUint16(8, true), type: 'gif' };
    if (str(0, 2) === 'BM') return { w: dv.getInt32(18, true), h: Math.abs(dv.getInt32(22, true)), type: 'bmp' };
    if (str(4, 4) === 'ftyp') {
      // HEIC / AVIF : plus grande boîte « ispe » (image principale) ; « irot » 90/270 → largeur et hauteur échangées
      var bw = 0, bh = 0, rot = 0;
      for (var k = 8; k + 20 < n; k++) {
        if (u[k] === 0x69 && str(k, 4) === 'ispe') { var iw = dv.getUint32(k + 8), ih = dv.getUint32(k + 12); if (iw * ih > bw * bh) { bw = iw; bh = ih; } }
        else if (u[k] === 0x69 && str(k, 4) === 'irot') rot = u[k + 4] & 3;
      }
      if (bw && bh) return { w: bw, h: bh, swap: rot === 1 || rot === 3, type: /avi[fs]/.test(str(8, 4)) ? 'avif' : 'heic' };
    }
  } catch (e) { }
  return null;
}
function kindOf(name, type) {
  var e = (String(name).match(/\.([a-z0-9]+)$/i) || [])[1] || '';
  return /^(heic|heif)$/i.test(e) || /hei[cf]/.test(type || '') ? 'HEIC' : e.toUpperCase() || 'image';
}
function unreadable(file) {
  var k = kindOf(file.name, file.type), e = new Error(k === 'HEIC'
    ? 'HEIC : ce navigateur ne sait pas lire ce format (image ignorée)'
    : 'Image illisible : ' + file.name);
  e.code = k === 'HEIC' ? 'heic' : 'decode';
  return e;
}
// Décodage à la bonne taille, comme WallpaperJob.load : réduction par 2, 4, 8… tant que le petit côté reste ≥ target
// et au plus 16 millions de pixels ; orientation EXIF appliquée.
async function load(file, target) {
  var head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
  var d = probe(head), bm;
  if (!d || !(d.w > 0 && d.h > 0)) {
    try { bm = await createImageBitmap(file); } catch (e) { throw unreadable(file); }
    d = { w: bm.width, h: bm.height, swap: false };
  }
  var w = d.w, h = d.h, ss = 1;
  while (idiv(Math.min(w, h), ss * 2) >= target || w * h / (ss * ss) > 16000000) ss *= 2;
  var ow = d.swap ? h : w, oh = d.swap ? w : h;          // dimensions affichées (après orientation)
  var tw = Math.max(1, Math.round(ow / ss)), th = Math.max(1, Math.round(oh / ss));
  if (!bm || bm.width !== tw || bm.height !== th) {
    if (bm) bm.close();
    try { bm = await createImageBitmap(file, ss > 1 ? { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high', imageOrientation: 'from-image' } : { imageOrientation: 'from-image' }); }
    catch (e) { throw unreadable(file); }
  }
  var c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bm, 0, 0);
  bm.close();
  return { w: c.width, h: c.height, canvas: c, px: pixelsOf(c), ow: ow, oh: oh, ss: ss };
}

/* ---------------- Aperçu avant / après (WallpaperJob.preview) ---------------- */
async function previews(S, res) {
  var bw = S.w, bh = S.h, s = Math.min(1, 640 / Math.max(bw, bh));
  var before = new OffscreenCanvas(Math.max(1, Math.round(bw * s)), Math.max(1, Math.round(bh * s))), cv = before.getContext('2d');
  cv.imageSmoothingEnabled = true; cv.imageSmoothingQuality = 'high';
  cv.drawImage(S.canvas, 0, 0, before.width, before.height);
  var k = R(Math.round(res.keep.l * s), Math.round(res.keep.t * s), Math.round(res.keep.r * s), Math.round(res.keep.b * s));
  cv.fillStyle = 'rgba(0,0,0,' + (0xB0 / 255) + ')';
  cv.fillRect(0, 0, before.width, k.t);
  cv.fillRect(0, k.b, before.width, before.height - k.b);
  cv.fillRect(0, k.t, k.l, H(k));
  cv.fillRect(k.r, k.t, before.width - k.r, H(k));
  cv.strokeStyle = '#fff'; cv.lineWidth = 3; cv.strokeRect(k.l, k.t, W(k), H(k));
  var o = res.out, s2 = Math.min(1, 960 / Math.max(o.width, o.height));
  var after = new OffscreenCanvas(Math.max(1, Math.round(o.width * s2)), Math.max(1, Math.round(o.height * s2))), ga = after.getContext('2d');
  ga.imageSmoothingEnabled = true; ga.imageSmoothingQuality = 'high';
  ga.drawImage(o, 0, 0, after.width, after.height);
  var r = { before: await before.convertToBlob({ type: 'image/jpeg', quality: 0.85 }), after: await after.convertToBlob({ type: 'image/jpeg', quality: 0.85 }) };
  before.width = 0; after.width = 0;
  return r;
}

/* ---------------- Messages ---------------- */
var queue = Promise.resolve();
self.onmessage = function (e) {
  var m = e.data || {};
  queue = queue.then(function () { return handle(m); }).catch(function () { });
};
async function handle(m) {
  try {
    if (m.cmd === 'thumb') {
      var size = m.size || 220, bm;
      try { bm = await createImageBitmap(m.file, { resizeHeight: size, resizeQuality: 'medium', imageOrientation: 'from-image' }); }
      catch (e) { throw unreadable(m.file); }
      var c = new OffscreenCanvas(bm.width, bm.height); c.getContext('2d').drawImage(bm, 0, 0); bm.close();
      var blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }); c.width = 0;
      self.postMessage({ id: m.id, ok: true, thumb: blob });
      return;
    }
    if (m.cmd === 'process') {
      var o = m.opt || {};
      var S = await load(m.file, Math.max(o.sw, o.sh));
      var res = process(S, o), msg = { id: m.id, ok: true, info: res.info, keep: res.keep, detected: res.detected, steps: res.steps, w: S.w, h: S.h, ow: S.ow, oh: S.oh, ss: S.ss };
      if (o.out !== false) msg.out = await res.out.convertToBlob({ type: 'image/jpeg', quality: Math.max(0.3, Math.min(1, (o.q || 90) / 100)) });
      if (o.preview) { var p = await previews(S, res); msg.before = p.before; msg.after = p.after; }
      if (o.pixels) msg.outSize = [res.out.width, res.out.height];
      res.out.width = 0; S.canvas.width = 0; S.px = null;
      self.postMessage({ id: m.id, ok: true, ...msg });
      return;
    }
    throw new Error('commande inconnue');
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: (err && err.message) || String(err), code: err && err.code });
  }
}
