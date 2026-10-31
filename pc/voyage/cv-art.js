/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-voyage/cv-art.js : ne pas modifier ici. */
/* =====================================================================
   Carnet de voyage (Suite MAG) — dessins originaux en SVG : papiers, couvertures, cadres photo, filtres,
   autocollants et tampons. Tout est généré ici (aucune image extérieure) : même rendu à l'écran, en PDF et en PNG.
   Unités : une page mesure 1000 × 1414 (proportions A4 / A5). Chaque élément est dessiné centré sur (0, 0).
   CV.Art.bg(clé, pfx, graine)          fond de page         CV.Art.cover(carnet, pfx, photoHref, media)  couverture
   CV.Art.photo(it, href, media, pfx)   photo et son cadre   CV.Art.sticker(nom, w, h, couleur, pfx, graine)
   « pfx » rend les identifiants uniques par rendu (plusieurs pages dans le même document).
   ===================================================================== */
(function () {
  'use strict';
  const CV = window.CV = window.CV || {};
  const A = CV.Art = {};
  const W = A.W = 1000, H = A.H = 1414;
  const esc = A.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f = A.n = (v) => Math.round(v * 100) / 100;
  function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  A.rng = function (seed) { let a = hash(seed) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  A.hash = hash;

  /* ---------------- Polices ---------------- */
  // [clé, nom affiché, famille CSS, graisse, interligne, hauteur x relative]
  A.FONTS = [
    ['manuscrit', 'Manuscrit (Caveat)', 'Caveat', 500, 1.12],
    ['ecolier', 'Écolier (Kalam)', 'Kalam', 400, 1.25],
    ['titre', 'Titre (Amatic SC)', 'Amatic SC', 700, 1.05],
    ['machine', 'Machine à écrire (Special Elite)', 'Special Elite', 400, 1.3],
    ['serif', 'Élégante (Caladea)', 'Caladea', 400, 1.25]
  ];
  A.font = (k) => A.FONTS.find((x) => x[0] === k) || A.FONTS[0];
  A.fontAttr = (k, bold) => { const F = A.font(k); return 'font-family="' + esc(F[2]) + '" font-weight="' + (bold ? (F[2] === 'Amatic SC' ? 700 : F[2] === 'Caveat' ? 700 : 700) : F[3]) + '"'; };

  /* ---------------- Textures communes ---------------- */
  function grain(id, opt) {
    opt = opt || {};
    const c = opt.color || [0.32, 0.22, 0.1], a = opt.alpha || 0.9, b = opt.bias || -0.36;
    return '<filter id="' + id + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + (opt.freq || 0.85) + '" numOctaves="' + (opt.oct || 2) + '" seed="' + (opt.seed || 3) + '" stitchTiles="stitch"/>' +
      '<feColorMatrix type="matrix" values="0 0 0 0 ' + c[0] + ' 0 0 0 0 ' + c[1] + ' 0 0 0 0 ' + c[2] + ' ' + a + ' 0 0 0 ' + b + '"/></filter>';
  }
  function mottle(id, opt) {
    opt = opt || {};
    const c = opt.color || [0.45, 0.32, 0.15];
    return '<filter id="' + id + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="' + (opt.freq || 0.006) + '" numOctaves="3" seed="' + (opt.seed || 7) + '"/>' +
      '<feColorMatrix type="matrix" values="0 0 0 0 ' + c[0] + ' 0 0 0 0 ' + c[1] + ' 0 0 0 0 ' + c[2] + ' ' + (opt.a || 0.55) + ' 0 0 0 ' + (opt.b || -0.2) + '"/></filter>';
  }
  function fibers(r, n, color, op, x0, y0, w, h) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * w, y = y0 + r() * h, a = r() * Math.PI * 2, L = 6 + r() * 26;
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L, cx = (x + x2) / 2 + (r() - 0.5) * 10, cy = (y + y2) / 2 + (r() - 0.5) * 10;
      s += 'M' + f(x) + ' ' + f(y) + 'Q' + f(cx) + ' ' + f(cy) + ' ' + f(x2) + ' ' + f(y2);
    }
    return '<path d="' + s + '" fill="none" stroke="' + color + '" stroke-width="0.9" stroke-linecap="round" opacity="' + op + '"/>';
  }

  /* ---------------- Fonds de page ---------------- */
  A.BG = [
    ['creme', 'Papier crème'], ['kraft', 'Kraft'], ['quadrille', 'Quadrillé'], ['ligne', 'Ligné'], ['pointille', 'Pointillé'],
    ['aquarelle', 'Aquarelle'], ['carte', 'Carte ancienne'], ['album', 'Album noir']
  ];
  A.bgBase = { creme: '#F6EEDC', kraft: '#C49A68', quadrille: '#FAF6EC', ligne: '#FAF6EC', pointille: '#F8F4EA', aquarelle: '#FBF8F1', carte: '#EBDAB2', album: '#2A2622' };
  A.bg = function (key, pfx, seed) {
    key = A.bgBase[key] ? key : 'creme';
    const id = (x) => pfx + 'bg' + x, r = A.rng((seed || 'p') + key);
    let defs = '', s = '<rect width="' + W + '" height="' + H + '" fill="' + A.bgBase[key] + '"/>';
    const paper = (opt) => { defs += grain(id('g'), opt); s += '<rect width="' + W + '" height="' + H + '" filter="url(#' + id('g') + ')"/>'; };
    const tone = (opt) => { defs += mottle(id('m'), opt); s += '<rect width="' + W + '" height="' + H + '" filter="url(#' + id('m') + ')"/>'; };
    if (key === 'creme') { tone({ a: 0.35, b: -0.12 }); paper({ alpha: 0.55, bias: -0.25 }); s += fibers(r, 70, '#9c7b4a', 0.18, 0, 0, W, H); }
    else if (key === 'kraft') { tone({ color: [0.3, 0.18, 0.06], a: 0.7, b: -0.2 }); paper({ color: [0.22, 0.13, 0.04], alpha: 1.1, bias: -0.38, freq: 0.7 }); s += fibers(r, 220, '#6b4423', 0.35, 0, 0, W, H) + fibers(r, 120, '#f0d6a8', 0.35, 0, 0, W, H); }
    else if (key === 'quadrille' || key === 'pointille' || key === 'ligne') {
      tone({ a: 0.25, b: -0.1 }); paper({ alpha: 0.45, bias: -0.22 });
      if (key === 'quadrille') {
        const g = 33.8;
        defs += '<pattern id="' + id('q') + '" width="' + g + '" height="' + g + '" patternUnits="userSpaceOnUse" x="13" y="20"><path d="M' + g + ' 0V' + g + 'M0 ' + g + 'H' + g + '" fill="none" stroke="#7FA2C2" stroke-width="1.1" opacity=".55"/></pattern>';
        s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + id('q') + ')"/>';
      } else if (key === 'pointille') {
        const g = 33.8;
        defs += '<pattern id="' + id('q') + '" width="' + g + '" height="' + g + '" patternUnits="userSpaceOnUse" x="13" y="20"><circle cx="' + g / 2 + '" cy="' + g / 2 + '" r="1.9" fill="#857a6c" opacity=".6"/></pattern>';
        s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + id('q') + ')"/>';
      } else {
        let d = ''; for (let y = 150; y < H - 40; y += 54) d += 'M0 ' + y + 'H' + W;
        s += '<path d="' + d + '" stroke="#88A8C8" stroke-width="1.4" opacity=".6"/><path d="M118 0V' + H + '" stroke="#D9706A" stroke-width="1.6" opacity=".7"/>';
      }
    } else if (key === 'aquarelle') {
      paper({ alpha: 0.4, bias: -0.2 });
      defs += '<filter id="' + id('w') + '" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="' + Math.floor(r() * 90) + '"/><feDisplacementMap in="SourceGraphic" scale="90" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="14"/></filter>';
      defs += '<filter id="' + id('e') + '" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="' + Math.floor(r() * 90) + '"/><feDisplacementMap in="SourceGraphic" scale="90" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="2.5"/></filter>';
      const pal = ['#8FC1D4', '#F2B39C', '#BFD69B', '#F5D48E', '#B7AEDB', '#9FD3C7'];
      let blobs = '', edges = '';
      const spots = [[0.12, 0.08], [0.85, 0.16], [0.2, 0.55], [0.82, 0.62], [0.5, 0.92], [0.55, 0.35]];
      spots.forEach((p, i) => {
        const cx = p[0] * W + (r() - 0.5) * 120, cy = p[1] * H + (r() - 0.5) * 140, rx = 130 + r() * 170, ry = 110 + r() * 150, c = pal[(i + Math.floor(r() * 6)) % pal.length];
        blobs += '<ellipse cx="' + f(cx) + '" cy="' + f(cy) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + c + '" opacity=".42"/>';
        edges += '<ellipse cx="' + f(cx) + '" cy="' + f(cy) + '" rx="' + f(rx * 0.92) + '" ry="' + f(ry * 0.92) + '" fill="none" stroke="' + c + '" stroke-width="7" opacity=".45"/>';
      });
      s += '<g filter="url(#' + id('w') + ')">' + blobs + '</g><g filter="url(#' + id('e') + ')">' + edges + '</g>';
    } else if (key === 'carte') {
      tone({ color: [0.48, 0.32, 0.12], a: 0.75, b: -0.15 }); paper({ color: [0.35, 0.22, 0.08], alpha: 0.8, bias: -0.3 });
      defs += '<radialGradient id="' + id('v') + '" cx="50%" cy="50%" r="72%"><stop offset=".55" stop-color="#7a5524" stop-opacity="0"/><stop offset="1" stop-color="#6b4517" stop-opacity=".55"/></radialGradient>';
      let d = '';
      for (let i = 1; i < 8; i++) { const x = i * W / 8; d += 'M' + f(x) + ' 0C' + f(x + (i - 4) * 18) + ' ' + H * 0.33 + ' ' + f(x + (i - 4) * 18) + ' ' + H * 0.66 + ' ' + f(x) + ' ' + H; }
      for (let j = 1; j < 10; j++) { const y = j * H / 10; d += 'M0 ' + f(y) + 'Q' + W / 2 + ' ' + f(y - 26) + ' ' + W + ' ' + f(y); }
      s += '<path d="' + d + '" fill="none" stroke="#7d5a2c" stroke-width="1.2" opacity=".28"/>';
      // côtes imaginaires
      let coast = 'M-20 ' + (H * 0.72);
      for (let x = 0; x <= W + 40; x += 40) coast += 'L' + x + ' ' + f(H * 0.72 + Math.sin(x / 90) * 40 + (r() - 0.5) * 30);
      s += '<path d="' + coast + '" fill="none" stroke="#6d4c22" stroke-width="2" opacity=".22"/><path d="' + coast + '" transform="translate(0 16)" fill="none" stroke="#6d4c22" stroke-width="1" opacity=".16" stroke-dasharray="3 6"/>';
      // taches
      for (let i = 0; i < 4; i++) s += '<circle cx="' + f(r() * W) + '" cy="' + f(r() * H) + '" r="' + f(30 + r() * 70) + '" fill="#8a5a1c" opacity=".07"/>';
      s += '<g transform="translate(830 1240)" opacity=".38">' + A.rose(95, '#5b3d18') + '</g>';
      s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + id('v') + ')"/>';
    } else if (key === 'album') {
      paper({ color: [0.95, 0.92, 0.85], alpha: 0.5, bias: -0.32, freq: 0.9 });
      s += fibers(r, 90, '#bfb3a0', 0.12, 0, 0, W, H);
    }
    return '<defs>' + defs + '</defs>' + s;
  };
  /** Rose des vents (rayon R) */
  A.rose = function (R, c) {
    let s = '<circle r="' + R + '" fill="none" stroke="' + c + '" stroke-width="2"/><circle r="' + (R * 0.82) + '" fill="none" stroke="' + c + '" stroke-width="1"/>';
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8, L = i % 4 === 0 ? R * 1.05 : i % 2 === 0 ? R * 0.62 : R * 0.42, w = i % 4 === 0 ? R * 0.13 : R * 0.08;
      const x = Math.sin(a) * L, y = -Math.cos(a) * L, lx = Math.cos(a) * w, ly = Math.sin(a) * w;
      s += '<path d="M0 0L' + f(lx) + ' ' + f(ly) + 'L' + f(x) + ' ' + f(y) + 'Z" fill="' + c + '"/><path d="M0 0L' + f(-lx) + ' ' + f(-ly) + 'L' + f(x) + ' ' + f(y) + 'Z" fill="' + c + '" opacity=".45"/>';
    }
    s += '<text y="' + f(-R * 1.18) + '" text-anchor="middle" font-family="Caladea" font-weight="700" font-size="' + f(R * 0.32) + '" fill="' + c + '">N</text>';
    return s;
  };

  /* ---------------- Couvertures ---------------- */
  A.COVERS = [['cuir', 'Cuir'], ['kraft', 'Kraft'], ['lin', 'Lin']];
  A.COVER_COLORS = { cuir: ['#7B3F2A', '#3E2A1E', '#2F4A3A', '#1F3550', '#8A2B2B', '#A0622D'], kraft: ['#B98A55', '#C9A574', '#8F6A42', '#D8BC8E'], lin: ['#C9BBA0', '#5D7B88', '#7E8C6A', '#B57B6B', '#3F4E63', '#E3D9C4'] };
  function shade(hex, k) {
    const n = parseInt(String(hex).replace('#', ''), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    const t = k < 0 ? 0 : 255, p = Math.abs(k); r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  A.shade = shade;
  function lum(hex) { const n = parseInt(String(hex).replace('#', ''), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; }
  A.lum = lum;
  /** Fond de couverture (cuir, kraft, lin) */
  A.coverBg = function (style, color, pfx) {
    const id = (x) => pfx + 'cv' + x;
    color = color || (A.COVER_COLORS[style] || A.COVER_COLORS.cuir)[0];
    let defs = '', s = '<rect width="' + W + '" height="' + H + '" fill="' + color + '"/>';
    if (style === 'kraft') {
      defs += mottle(id('m'), { color: [0.25, 0.15, 0.05], a: 0.7, b: -0.2 }) + grain(id('g'), { color: [0.2, 0.12, 0.04], alpha: 1.1, bias: -0.38, freq: 0.7 });
      s += '<rect width="' + W + '" height="' + H + '" filter="url(#' + id('m') + ')"/><rect width="' + W + '" height="' + H + '" filter="url(#' + id('g') + ')"/>' + fibers(A.rng(pfx + 'k'), 260, '#5d3b1c', 0.35, 0, 0, W, H) + fibers(A.rng(pfx + 'k2'), 140, '#f3dcb0', 0.3, 0, 0, W, H);
      // dos relié (bande et coutures)
      s += '<rect width="92" height="' + H + '" fill="' + shade(color, -0.35) + '"/><path d="M92 0V' + H + '" stroke="#00000033" stroke-width="3"/>';
      let st = ''; for (let y = 60; y < H - 40; y += 110) st += 'M46 ' + y + 'v46';
      s += '<path d="' + st + '" stroke="#efe2c4" stroke-width="5" stroke-linecap="round" opacity=".85"/>';
    } else if (style === 'lin') {
      defs += '<filter id="' + id('h') + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.9" numOctaves="2" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0.9 0 0 0 -0.32"/></filter>';
      defs += '<filter id="' + id('v') + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.012" numOctaves="2" seed="9"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0 0 0 -0.34"/></filter>';
      defs += mottle(id('m'), { color: [0.2, 0.18, 0.15], a: 0.4, b: -0.15 });
      defs += '<pattern id="' + id('p') + '" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 1.2H5M1.2 0V5" stroke="#000" stroke-width=".8" opacity=".12"/></pattern>';
      s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + id('p') + ')"/><rect width="' + W + '" height="' + H + '" filter="url(#' + id('h') + ')"/><rect width="' + W + '" height="' + H + '" filter="url(#' + id('v') + ')"/><rect width="' + W + '" height="' + H + '" filter="url(#' + id('m') + ')"/>';
      s += '<rect width="70" height="' + H + '" fill="#000" opacity=".12"/><path d="M70 0V' + H + '" stroke="#ffffff40" stroke-width="2"/>';
    } else {
      // cuir : grain en relief (éclairage), marbrures, coutures
      defs += '<filter id="' + id('l') + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="11" result="n"/>' +
        '<feDiffuseLighting in="n" surfaceScale="2.2" lighting-color="#fff" result="d"><feDistantLight azimuth="235" elevation="52"/></feDiffuseLighting>' +
        '<feColorMatrix in="d" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -0.9 0 0 0 0.62"/></filter>';
      defs += mottle(id('m'), { color: [0.05, 0.03, 0.02], a: 0.85, b: -0.25, freq: 0.004 });
      defs += '<radialGradient id="' + id('r') + '" cx="45%" cy="40%" r="80%"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>';
      defs += '<linearGradient id="' + id('s') + '" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".08" stop-color="#000" stop-opacity=".12"/><stop offset=".1" stop-color="#fff" stop-opacity=".08"/><stop offset=".14" stop-color="#000" stop-opacity="0"/></linearGradient>';
      s += '<rect width="' + W + '" height="' + H + '" filter="url(#' + id('m') + ')"/><rect width="' + W + '" height="' + H + '" filter="url(#' + id('l') + ')"/><rect width="' + W + '" height="' + H + '" fill="url(#' + id('r') + ')"/><rect width="' + W + '" height="' + H + '" fill="url(#' + id('s') + ')"/>';
      s += '<rect x="44" y="40" width="' + (W - 84) + '" height="' + (H - 80) + '" rx="26" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3" transform="translate(1.5 2)"/>';
      s += '<rect x="44" y="40" width="' + (W - 84) + '" height="' + (H - 80) + '" rx="26" fill="none" stroke="' + shade(color, 0.45) + '" stroke-width="3.2" stroke-dasharray="15 10" stroke-linecap="round" opacity=".85"/>';
      // élastique
      s += '<rect x="868" y="0" width="38" height="' + H + '" fill="#1b1714"/><rect x="868" y="0" width="38" height="' + H + '" fill="url(#' + id('s') + ')" opacity=".6"/><path d="M872 0V' + H + 'M902 0V' + H + '" stroke="#ffffff22" stroke-width="2"/>';
    }
    return '<defs>' + defs + '</defs>' + s;
  };
  /** Couverture complète : fond, étiquette de titre (ou dorure), dates, photo */
  A.cover = function (c, pfx, photoHref, media) {
    const cv = c.cover || {}, style = cv.style || 'cuir', color = cv.color || A.COVER_COLORS[style][0];
    const dark = lum(color) < 0.5;
    let s = A.coverBg(style, color, pfx);
    const title = c.title || 'Mon carnet', dates = c.dates || '';
    const F = A.font(cv.font || (style === 'cuir' ? 'serif' : 'manuscrit'));
    const ts = cv.titleStyle || (style === 'cuir' ? 'dorure' : 'etiquette');
    const hasPhoto = !!photoHref;
    const ty = hasPhoto ? 270 : 560;
    const CX = style === 'cuir' ? 456 : style === 'kraft' ? 546 : 535;
    const size = Math.min(104, Math.max(54, 1500 / Math.max(8, title.length)));
    const lines = A.wrapSimple(title, 18);
    if (ts === 'etiquette') {
      const lh = size * 1.05, bh = 90 + lines.length * lh + (dates ? 60 : 0), bw = 680, x = CX - bw / 2, y = ty - bh / 2;
      s += '<defs>' + grain(pfx + 'lbg', { alpha: 0.4, bias: -0.2 }) + '</defs>';
      s += '<g filter="none"><rect x="' + (x + 6) + '" y="' + (y + 10) + '" width="' + bw + '" height="' + bh + '" rx="10" fill="#000" opacity=".28"/>';
      s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="10" fill="#FBF5E6"/><rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="10" filter="url(#' + pfx + 'lbg)"/>';
      s += '<rect x="' + (x + 16) + '" y="' + (y + 16) + '" width="' + (bw - 32) + '" height="' + (bh - 32) + '" rx="6" fill="none" stroke="' + color + '" stroke-width="3"/><rect x="' + (x + 24) + '" y="' + (y + 24) + '" width="' + (bw - 48) + '" height="' + (bh - 48) + '" rx="4" fill="none" stroke="' + color + '" stroke-width="1.2"/></g>';
      lines.forEach((l, i) => { s += '<text x="' + CX + '" y="' + f(y + 50 + lh * (i + 0.78)) + '" text-anchor="middle" font-family="' + esc(F[2]) + '" font-weight="700" font-size="' + f(size) + '" fill="#3A2B20">' + esc(l) + '</text>'; });
      if (dates) s += '<text x="' + CX + '" y="' + f(y + bh - 46) + '" text-anchor="middle" font-family="Special Elite" font-size="34" fill="' + shade(color, -0.2) + '">' + esc(dates) + '</text>';
    } else {
      const lh = size * 1.08, y0 = ty - (lines.length * lh) / 2 + lh * 0.75;
      const gold = '<linearGradient id="' + pfx + 'gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7E3A1"/><stop offset=".5" stop-color="#C9A04A"/><stop offset=".52" stop-color="#B08530"/><stop offset="1" stop-color="#E9CB7A"/></linearGradient>';
      const fill = ts === 'dorure' ? 'url(#' + pfx + 'gold)' : (dark ? '#F4EBDD' : '#2E241B');
      s += '<defs>' + gold + '</defs>';
      lines.forEach((l, i) => {
        const y = f(y0 + i * lh);
        s += '<text x="' + CX + '" y="' + y + '" text-anchor="middle" font-family="' + esc(F[2]) + '" font-weight="700" font-size="' + f(size) + '" fill="#000" opacity=".45" transform="translate(-2 -2)">' + esc(l) + '</text>';
        s += '<text x="' + CX + '" y="' + y + '" text-anchor="middle" font-family="' + esc(F[2]) + '" font-weight="700" font-size="' + f(size) + '" fill="' + fill + '">' + esc(l) + '</text>';
      });
      if (dates) s += '<text x="' + CX + '" y="' + f(y0 + lines.length * lh + 6) + '" text-anchor="middle" font-family="Special Elite" font-size="36" letter-spacing="3" fill="' + fill + '">' + esc(dates) + '</text>';
    }
    if (hasPhoto) {
      const pw = 560, ph = 600;
      const it = { id: 'cover', w: pw, h: ph, frame: cv.photoFrame || 'polaroid', o: { cap: cv.caption || '' }, crop: cv.crop || {}, shadow: true };
      s += '<g transform="translate(' + CX + ' ' + (ty + 160 + 400) + ') rotate(' + (cv.photoRot == null ? -3 : cv.photoRot) + ')">' + A.photo(it, photoHref, media || { w: 4, h: 3 }, pfx + 'c') + '</g>';
    }
    return s;
  };
  A.wrapSimple = function (t, n) {
    const words = String(t).split(/\s+/); const out = []; let cur = '';
    words.forEach((w) => { if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) out.push(cur);
    return out.slice(0, 3);
  };

  /* ---------------- Formes ---------------- */
  A.SHAPES = [['rect', 'Rectangle'], ['arrondi', 'Arrondi'], ['cercle', 'Cercle'], ['coeur', 'Cœur'], ['hexagone', 'Hexagone']];
  A.shapeD = function (k, x, y, w, h) {
    if (k === 'cercle') { const rx = w / 2, ry = h / 2; return 'M' + f(x) + ' ' + f(y + ry) + 'a' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(w) + ' 0a' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(-w) + ' 0Z'; }
    if (k === 'arrondi') { const r = Math.min(w, h) * 0.14; return 'M' + f(x + r) + ' ' + f(y) + 'H' + f(x + w - r) + 'Q' + f(x + w) + ' ' + f(y) + ' ' + f(x + w) + ' ' + f(y + r) + 'V' + f(y + h - r) + 'Q' + f(x + w) + ' ' + f(y + h) + ' ' + f(x + w - r) + ' ' + f(y + h) + 'H' + f(x + r) + 'Q' + f(x) + ' ' + f(y + h) + ' ' + f(x) + ' ' + f(y + h - r) + 'V' + f(y + r) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(x + r) + ' ' + f(y) + 'Z'; }
    if (k === 'coeur') {
      const P = (u, v) => f(x + u * w) + ' ' + f(y + v * h);
      return 'M' + P(0.5, 0.97) + 'C' + P(0.18, 0.74) + ' ' + P(0, 0.52) + ' ' + P(0, 0.3) + 'C' + P(0, 0.11) + ' ' + P(0.14, 0) + ' ' + P(0.29, 0) + 'C' + P(0.39, 0) + ' ' + P(0.46, 0.06) + ' ' + P(0.5, 0.15) + 'C' + P(0.54, 0.06) + ' ' + P(0.61, 0) + ' ' + P(0.71, 0) + 'C' + P(0.86, 0) + ' ' + P(1, 0.11) + ' ' + P(1, 0.3) + 'C' + P(1, 0.52) + ' ' + P(0.82, 0.74) + ' ' + P(0.5, 0.97) + 'Z';
    }
    if (k === 'hexagone') { const P = (u, v) => f(x + u * w) + ' ' + f(y + v * h); return 'M' + P(0.25, 0) + 'L' + P(0.75, 0) + 'L' + P(1, 0.5) + 'L' + P(0.75, 1) + 'L' + P(0.25, 1) + 'L' + P(0, 0.5) + 'Z'; }
    return 'M' + f(x) + ' ' + f(y) + 'h' + f(w) + 'v' + f(h) + 'h' + f(-w) + 'Z';
  };

  /* ---------------- Filtres photo ---------------- */
  A.FILTERS = [['aucun', 'Original'], ['sepia', 'Sépia'], ['vintage', 'Vintage'], ['nb', 'Noir et blanc'], ['chaud', 'Chaud'], ['froid', 'Froid'], ['fondu', 'Fondu']];
  const I5 = () => [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  function mul(a, b) {   // a ∘ b : appliquer b puis a (matrices 4×5 de feColorMatrix)
    const o = new Array(20).fill(0);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        let v = 0;
        for (let k = 0; k < 4; k++) v += a[r * 5 + k] * b[k * 5 + c];
        if (c === 4) v += a[r * 5 + 4];
        o[r * 5 + c] = v;
      }
    }
    return o;
  }
  const mix = (m, k) => { const I = I5(); return m.map((v, i) => I[i] + (v - I[i]) * k); };
  const sat = (s) => { const r = 0.2126, g = 0.7152, b = 0.0722; return [r + (1 - r) * s, g - g * s, b - b * s, 0, 0, r - r * s, g + (1 - g) * s, b - b * s, 0, 0, r - r * s, g - g * s, b + (1 - b) * s, 0, 0, 0, 0, 0, 1, 0]; };
  const con = (c) => { const o = 0.5 * (1 - c); return [c, 0, 0, 0, o, 0, c, 0, 0, o, 0, 0, c, 0, o, 0, 0, 0, 1, 0]; };
  const bri = (k) => [k, 0, 0, 0, 0, 0, k, 0, 0, 0, 0, 0, k, 0, 0, 0, 0, 0, 1, 0];
  const lift = (l) => [1 - l, 0, 0, 0, l, 0, 1 - l, 0, 0, l, 0, 0, 1 - l, 0, l, 0, 0, 0, 1, 0];
  const SEPIA = [0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0];
  const tint = (r, g, b, o) => [r, 0, 0, 0, o[0], 0, g, 0, 0, o[1], 0, 0, b, 0, o[2], 0, 0, 0, 1, 0];
  A.filterMatrix = function (it) {
    let m = I5();
    const fl = it.filter || 'aucun';
    if (fl === 'sepia') m = mul(SEPIA, m);
    else if (fl === 'nb') m = mul(con(1.08), mul(sat(0), m));
    else if (fl === 'vintage') m = mul(tint(1.06, 1.0, 0.86, [0.03, 0.02, 0]), mul(lift(0.07), mul(mix(SEPIA, 0.38), mul(sat(0.8), m))));
    else if (fl === 'chaud') m = mul(tint(1.08, 1.02, 0.86, [0.02, 0.01, 0]), m);
    else if (fl === 'froid') m = mul(tint(0.9, 1.0, 1.1, [0, 0.01, 0.03]), m);
    else if (fl === 'fondu') m = mul(lift(0.1), mul(con(0.84), mul(sat(0.78), m)));
    const ad = it.adj || {};
    if (ad.sat) m = mul(sat(1 + ad.sat / 100), m);
    if (ad.con) m = mul(con(1 + ad.con / 100), m);
    if (ad.lum) m = mul(bri(1 + ad.lum / 100), m);
    return m;
  };
  /** Définition du filtre d'une photo (ou '' si aucun effet) */
  A.photoFilter = function (id, it) {
    const m = A.filterMatrix(it), I = I5();
    const plain = m.every((v, i) => Math.abs(v - I[i]) < 1e-6);
    if (plain && !it.grain) return '';
    let s = '<filter id="' + id + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">';
    s += '<feColorMatrix in="SourceGraphic" type="matrix" values="' + m.map((v) => Math.round(v * 10000) / 10000).join(' ') + '" result="c"/>';
    if (it.grain) {
      s += '<feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="' + (hash(it.id) % 97) + '" result="n"/>' +
        '<feColorMatrix in="n" type="saturate" values="0" result="ng"/>' +
        '<feComponentTransfer in="ng" result="nk"><feFuncR type="linear" slope="' + (1 + it.grain / 60) + '" intercept="' + (-0.5 * it.grain / 60) + '"/><feFuncG type="linear" slope="' + (1 + it.grain / 60) + '" intercept="' + (-0.5 * it.grain / 60) + '"/><feFuncB type="linear" slope="' + (1 + it.grain / 60) + '" intercept="' + (-0.5 * it.grain / 60) + '"/></feComponentTransfer>' +
        '<feBlend in="c" in2="nk" mode="overlay" result="b"/><feComposite in="b" in2="SourceGraphic" operator="in"/>';
    }
    return s + '</filter>';
  };

  /* ---------------- Cadres ---------------- */
  A.FRAMES = [
    ['aucun', 'Sans cadre'], ['bord', 'Bord blanc argentique'], ['polaroid', 'Polaroid'], ['timbre', 'Timbre-poste'], ['coins', 'Coins photo'],
    ['washi', 'Ruban adhésif (washi)'], ['trombone', 'Trombone'], ['punaise', 'Punaise'], ['dechire', 'Papier déchiré'],
    ['carte-postale', 'Carte postale'], ['ticket', 'Ticket / billet'], ['etiquette', 'Étiquette à bagage']
  ];
  A.WASHI = [['rayures', 'Rayures'], ['pois', 'Pois'], ['carreaux', 'Carreaux'], ['fleurs', 'Fleurs'], ['uni', 'Uni'], ['zigzag', 'Zigzag']];
  A.TICKETS = [['train', 'Train'], ['avion', 'Avion'], ['musee', 'Musée']];
  /** Hauteur conseillée d'un cadre pour une largeur et une photo données */
  A.idealH = function (frame, w, media, shape) {
    const r = media && media.w && media.h ? media.w / media.h : 4 / 3;
    if (shape === 'cercle' || shape === 'hexagone') return frame === 'bord' ? w : w * (shape === 'hexagone' ? 0.87 : 1);
    if (shape === 'coeur') return w * 0.92;
    const m = (b) => (w - 2 * b) / r + 2 * b;
    switch (frame) {
      case 'polaroid': { const b = w * 0.06; return b + (w - 2 * b) * 0.97 + w * 0.24; }
      case 'timbre': return r >= 1 ? w / 1.22 : w / 0.8;
      case 'ticket': return w * 0.44;
      case 'etiquette': return w * 0.54;
      case 'carte-postale': return r >= 1 ? w / 1.45 : w * 1.42;
      case 'bord': case 'trombone': case 'punaise': case 'washi': return m(w * 0.045);
      case 'dechire': return m(w * 0.06);
      default: return w / r;
    }
  };
  function imgFit(href, media, ax, ay, aw, ah, crop, filt) {
    crop = crop || {};
    const mw = media.w || 4, mh = media.h || 3;
    const k = Math.max(aw / mw, ah / mh) * Math.max(1, crop.s || 1);
    const dw = mw * k, dh = mh * k;
    const x = ax + (aw - dw) / 2 - (crop.x || 0) * (dw - aw) / 2, y = ay + (ah - dh) / 2 - (crop.y || 0) * (dh - ah) / 2;
    return '<image href="' + esc(href) + '" x="' + f(x) + '" y="' + f(y) + '" width="' + f(dw) + '" height="' + f(dh) + '" preserveAspectRatio="none"' + (filt ? ' filter="url(#' + filt + ')"' : '') + '/>';
  }
  /** Ombre portée réaliste : contact net + halo doux, plus marqué aux coins du bas (photo légèrement soulevée) */
  function shadow(pfx, d, w, h) {
    const id = pfx + 'sh';
    return '<defs><filter id="' + id + 'a" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="' + f(Math.max(3, Math.min(w, h) * 0.022)) + '"/></filter><filter id="' + id + 'b" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="' + f(Math.max(1, Math.min(w, h) * 0.005)) + '"/></filter></defs>' +
      '<path d="' + d + '" fill="#2a1a0a" opacity=".32" filter="url(#' + id + 'a)" transform="translate(' + f(w * 0.012) + ' ' + f(h * 0.028) + ') scale(1.005 1.01)"/>' +
      '<path d="' + d + '" fill="#1a1006" opacity=".3" filter="url(#' + id + 'b)" transform="translate(' + f(w * 0.003) + ' ' + f(h * 0.006) + ')"/>';
  }
  function paperNoise(pfx, d, op) {
    return '<defs>' + grain(pfx + 'pn', { alpha: op || 0.35, bias: -0.2, freq: 0.9 }) + '</defs><path d="' + d + '" filter="url(#' + pfx + 'pn)"/>';
  }
  function vignette(pfx, ax, ay, aw, ah, clip) {
    return '<defs><radialGradient id="' + pfx + 'vg" cx="50%" cy="50%" r="72%"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#140c04" stop-opacity=".62"/></radialGradient></defs><rect x="' + f(ax) + '" y="' + f(ay) + '" width="' + f(aw) + '" height="' + f(ah) + '" fill="url(#' + pfx + 'vg)"' + (clip ? ' clip-path="url(#' + clip + ')"' : '') + '/>';
  }
  /** Photo dans un zone (forme, filtre, vignette) */
  function photoArea(it, href, media, pfx, ax, ay, aw, ah, shape) {
    const cid = pfx + 'cl', fid = pfx + 'fx';
    const fdef = A.photoFilter(fid, it);
    let s = '<defs><clipPath id="' + cid + '"><path d="' + A.shapeD(shape || 'rect', ax, ay, aw, ah) + '"/></clipPath>' + fdef + '</defs>';
    s += '<g clip-path="url(#' + cid + ')">' + (href ? imgFit(href, media, ax, ay, aw, ah, it.crop, fdef ? fid : '') : '<rect x="' + f(ax) + '" y="' + f(ay) + '" width="' + f(aw) + '" height="' + f(ah) + '" fill="#cfc6b6"/>') + '</g>';
    if (it.vignette) s += vignette(pfx, ax, ay, aw, ah, cid);
    return s;
  }
  A.photo = function (it, href, media, pfx) {
    pfx = pfx + (it.id || 'x');
    const w = it.w, h = it.h, x = -w / 2, y = -h / 2, o = it.o || {}, fr = it.frame || 'aucun', m = Math.min(w, h);
    const shape = (fr === 'aucun' || fr === 'bord') ? (it.shape || 'rect') : 'rect';
    const sh = it.shadow !== false && fr !== 'aucun' || (it.shadow && fr === 'aucun');
    let s = '';
    const outer = A.shapeD(shape, x, y, w, h);
    if (fr === 'aucun') {
      if (sh) s += shadow(pfx, outer, w, h);
      s += photoArea(it, href, media, pfx, x, y, w, h, shape);
    } else if (fr === 'bord') {
      const b = (shape === 'rect' ? 0.045 : 0.05) * m;
      if (sh) s += shadow(pfx, outer, w, h);
      s += '<path d="' + outer + '" fill="#FCFAF4"/>' + paperNoise(pfx, outer, 0.2);
      s += photoArea(it, href, media, pfx, x + b, y + b, w - 2 * b, h - 2 * b, shape);
      if (o.ds) {
        const t = esc(o.dsText || '31 10 ’26'), fs = m * 0.065;
        s += '<text x="' + f(x + w - b - m * 0.05) + '" y="' + f(y + h - b - m * 0.05) + '" text-anchor="end" font-family="Special Elite" font-size="' + f(fs) + '" fill="#FF8A2B" opacity=".9" style="letter-spacing:.08em">' + t + '</text>';
      }
    } else if (fr === 'polaroid') {
      const b = w * 0.06, bot = w * 0.24, d = 'M' + f(x) + ' ' + f(y) + 'h' + f(w) + 'v' + f(h) + 'h' + f(-w) + 'Z';
      if (sh) s += shadow(pfx, d, w, h);
      s += '<path d="' + d + '" fill="#FDFCF7"/>' + paperNoise(pfx, d, 0.25);
      s += '<rect x="' + f(x + b - 1) + '" y="' + f(y + b - 1) + '" width="' + f(w - 2 * b + 2) + '" height="' + f(h - b - bot + 2) + '" fill="#000" opacity=".12"/>';
      s += photoArea(it, href, media, pfx, x + b, y + b, w - 2 * b, h - b - bot);
      if (o.cap) {
        const fs = Math.min(bot * 0.48, (w - 2 * b) / Math.max(6, o.cap.length) * 1.9);
        s += '<text x="0" y="' + f(y + h - bot * 0.36) + '" text-anchor="middle" font-family="Caveat" font-weight="600" font-size="' + f(fs) + '" fill="' + esc(o.capColor || '#2D2A6E') + '">' + esc(o.cap) + '</text>';
      }
    } else if (fr === 'timbre') {
      const r = m * 0.032, step = r * 2.7;
      const nx = Math.max(3, Math.round(w / step)), ny = Math.max(3, Math.round(h / step));
      let holes = '';
      for (let i = 0; i <= nx; i++) { const px = x + i * w / nx; holes += '<circle cx="' + f(px) + '" cy="' + f(y) + '" r="' + f(r) + '"/><circle cx="' + f(px) + '" cy="' + f(y + h) + '" r="' + f(r) + '"/>'; }
      for (let j = 1; j < ny; j++) { const py = y + j * h / ny; holes += '<circle cx="' + f(x) + '" cy="' + f(py) + '" r="' + f(r) + '"/><circle cx="' + f(x + w) + '" cy="' + f(py) + '" r="' + f(r) + '"/>'; }
      const mid = pfx + 'pm', d = 'M' + f(x) + ' ' + f(y) + 'h' + f(w) + 'v' + f(h) + 'h' + f(-w) + 'Z';
      s += '<defs><mask id="' + mid + '" maskUnits="userSpaceOnUse" x="' + f(x - 20) + '" y="' + f(y - 20) + '" width="' + f(w + 40) + '" height="' + f(h + 40) + '"><rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(h) + '" fill="#fff"/><g fill="#000">' + holes + '</g></mask></defs>';
      if (sh) s += '<g mask="url(#' + mid + ')">' + shadow(pfx, d, w, h).replace(/opacity="\.32"/, 'opacity=".22"') + '</g>';
      const ink = o.ink || '#9E3B2E';
      const b = m * 0.085, band = h * 0.15;
      s += '<g mask="url(#' + mid + ')"><path d="' + d + '" fill="#FFFDF5"/>' + paperNoise(pfx, d, 0.22) + '</g>';
      s += '<rect x="' + f(x + b * 0.62) + '" y="' + f(y + b * 0.62) + '" width="' + f(w - b * 1.24) + '" height="' + f(h - b * 1.24) + '" fill="none" stroke="' + esc(ink) + '" stroke-width="' + f(m * 0.008) + '"/>';
      s += photoArea(it, href, media, pfx, x + b, y + b, w - 2 * b, h - 2 * b - band);
      const by = y + h - b - band;
      const val = o.sv == null ? '2,50 €' : o.sv, ctry = o.sc == null ? 'FRANCE' : o.sc;
      s += '<text x="' + f(x + b) + '" y="' + f(by + band * 0.72) + '" font-family="Caladea" font-weight="700" font-size="' + f(band * 0.5) + '" letter-spacing="' + f(band * 0.05) + '" fill="' + esc(ink) + '">' + esc(ctry) + '</text>';
      s += '<text x="' + f(x + w - b) + '" y="' + f(by + band * 0.78) + '" text-anchor="end" font-family="Caladea" font-weight="700" font-size="' + f(band * 0.66) + '" fill="' + esc(ink) + '">' + esc(val) + '</text>';
      if (o.st) s += '<text x="' + f(x + b + (w - 2 * b) * 0.03) + '" y="' + f(y + b + m * 0.1) + '" font-family="Caladea" font-weight="700" font-style="italic" font-size="' + f(m * 0.078) + '" fill="#fff" stroke="#000" stroke-opacity=".45" stroke-width="' + f(m * 0.012) + '" paint-order="stroke">' + esc(o.st) + '</text>';
      if (o.pm) s += A.postmark(pfx, x + w * 0.84, y + h * 0.26, m * 0.44, o.pmCity || 'MARSEILLE', o.pmDate || '', o.pmColor || '#2B2F3A');
    } else if (fr === 'coins') {
      const d = 'M' + f(x) + ' ' + f(y) + 'h' + f(w) + 'v' + f(h) + 'h' + f(-w) + 'Z';
      if (sh) s += shadow(pfx, d, w, h);
      s += photoArea(it, href, media, pfx, x, y, w, h);
      const c = m * 0.17, col = o.cornerColor || '#2B2621', e = m * 0.012;
      const corner = (cx, cy, sx, sy) => '<path d="M' + f(cx - sx * e) + ' ' + f(cy - sy * e) + 'h' + f(sx * c) + 'L' + f(cx - sx * e) + ' ' + f(cy - sy * e + sy * c) + 'Z" fill="' + esc(col) + '"/><path d="M' + f(cx - sx * e + sx * c) + ' ' + f(cy - sy * e) + 'L' + f(cx - sx * e) + ' ' + f(cy - sy * e + sy * c) + '" stroke="#fff" stroke-opacity=".25" stroke-width="' + f(m * 0.006) + '"/>';
      s += '<g filter="url(#' + pfx + 'cs)"><defs><filter id="' + pfx + 'cs" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="' + f(m * 0.004) + '" dy="' + f(m * 0.008) + '" stdDeviation="' + f(m * 0.006) + '" flood-opacity=".35"/></filter></defs>' +
        corner(x, y, 1, 1) + corner(x + w, y, -1, 1) + corner(x, y + h, 1, -1) + corner(x + w, y + h, -1, -1) + '</g>';
    } else if (fr === 'washi' || fr === 'trombone' || fr === 'punaise') {
      const b = m * 0.045, d = 'M' + f(x) + ' ' + f(y) + 'h' + f(w) + 'v' + f(h) + 'h' + f(-w) + 'Z';
      if (sh) s += shadow(pfx, d, w, h);
      s += '<path d="' + d + '" fill="#FCFAF4"/>' + paperNoise(pfx, d, 0.2);
      s += photoArea(it, href, media, pfx, x + b, y + b, w - 2 * b, h - 2 * b);
      if (fr === 'washi') {
        const tl = m * 0.42, tw = m * 0.12;
        s += A.tape(pfx + 'a', x + m * 0.03, y + m * 0.03, tl, tw, -40, o.tape || 'rayures', o.tapeColor || '#E6A1A0');
        s += A.tape(pfx + 'b', x + w - m * 0.03, y + m * 0.03, tl, tw, 40, o.tape || 'rayures', o.tapeColor || '#E6A1A0');
        if (o.tape4) { s += A.tape(pfx + 'c', x + m * 0.03, y + h - m * 0.03, tl, tw, 40, o.tape || 'rayures', o.tapeColor || '#E6A1A0') + A.tape(pfx + 'd', x + w - m * 0.03, y + h - m * 0.03, tl, tw, -40, o.tape || 'rayures', o.tapeColor || '#E6A1A0'); }
      } else if (fr === 'trombone') s += A.clip(x + w * 0.18, y - m * 0.07, m * 0.11, m * 0.36, o.clipColor);
      else s += A.pin(0, y + m * 0.07, m * 0.075, o.pinColor || '#C7362F', pfx);
    } else if (fr === 'dechire') {
      const R = A.rng(it.id + 'torn');
      const pts = []; const jag = m * 0.022;
      const edge = (x1, y1, x2, y2, nx, ny) => { const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(8, Math.round(L / (m * 0.025))); for (let i = 0; i < n; i++) { const t = i / n, j = (R() - 0.5) * 2 * jag + (R() < 0.15 ? jag * 1.5 * (R() - 0.5) : 0); pts.push([x1 + (x2 - x1) * t + nx * j, y1 + (y2 - y1) * t + ny * j]); } };
      edge(x, y, x + w, y, 0, 1); edge(x + w, y, x + w, y + h, 1, 0); edge(x + w, y + h, x, y + h, 0, 1); edge(x, y + h, x, y, 1, 0);
      const d = 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
      if (sh) s += shadow(pfx, d, w, h);
      s += '<path d="' + d + '" fill="#FBF8EF"/>' + paperNoise(pfx, d, 0.3);
      // fibres blanches du bord déchiré
      s += '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="' + f(m * 0.012) + '" opacity=".9"/>';
      const b = m * 0.06;
      const inner = []; const R2 = A.rng(it.id + 'torn2'); const jag2 = m * 0.012;
      const edge2 = (x1, y1, x2, y2, nx, ny) => { const L = Math.hypot(x2 - x1, y2 - y1), n = Math.max(8, Math.round(L / (m * 0.03))); for (let i = 0; i < n; i++) { const t = i / n, j = (R2() - 0.5) * 2 * jag2; inner.push([x1 + (x2 - x1) * t + nx * j, y1 + (y2 - y1) * t + ny * j]); } };
      edge2(x + b, y + b, x + w - b, y + b, 0, 1); edge2(x + w - b, y + b, x + w - b, y + h - b, 1, 0); edge2(x + w - b, y + h - b, x + b, y + h - b, 0, 1); edge2(x + b, y + h - b, x + b, y + b, 1, 0);
      const di = 'M' + inner.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
      const cid = pfx + 'tc', fid = pfx + 'fx', fdef = A.photoFilter(fid, it);
      s += '<defs><clipPath id="' + cid + '"><path d="' + di + '"/></clipPath>' + fdef + '</defs><g clip-path="url(#' + cid + ')">' + (href ? imgFit(href, media, x + b, y + b, w - 2 * b, h - 2 * b, it.crop, fdef ? fid : '') : '') + '</g>';
      if (it.vignette) s += vignette(pfx, x + b, y + b, w - 2 * b, h - 2 * b, cid);
    } else if (fr === 'carte-postale') {
      const b = m * 0.04, rr = m * 0.02, d = A.shapeD('arrondi', x, y, w, h).replace(/Q/g, 'Q');
      const dd = 'M' + f(x + rr) + ' ' + f(y) + 'H' + f(x + w - rr) + 'Q' + f(x + w) + ' ' + f(y) + ' ' + f(x + w) + ' ' + f(y + rr) + 'V' + f(y + h - rr) + 'Q' + f(x + w) + ' ' + f(y + h) + ' ' + f(x + w - rr) + ' ' + f(y + h) + 'H' + f(x + rr) + 'Q' + f(x) + ' ' + f(y + h) + ' ' + f(x) + ' ' + f(y + h - rr) + 'V' + f(y + rr) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(x + rr) + ' ' + f(y) + 'Z';
      void d;
      if (sh) s += shadow(pfx, dd, w, h);
      s += '<path d="' + dd + '" fill="#FFFDF7"/>' + paperNoise(pfx, dd, 0.22);
      s += photoArea(it, href, media, pfx, x + b, y + b, w - 2 * b, h - 2 * b);
      const sub = o.sub == null ? 'Bons baisers de' : o.sub, big = (o.cap == null ? 'MARSEILLE' : o.cap).toUpperCase();
      const fs = Math.min(h * 0.22, (w - 4 * b) / Math.max(4, big.length) * 1.75);
      const ty = y + h - b - h * 0.1;
      if (sub) s += '<text x="' + f(x + 2 * b) + '" y="' + f(ty - fs * 0.92) + '" font-family="Caveat" font-weight="700" font-size="' + f(fs * 0.5) + '" fill="#fff" stroke="#3a2412" stroke-width="' + f(fs * 0.05) + '" paint-order="stroke">' + esc(sub) + '</text>';
      s += '<text x="' + f(x + 2 * b) + '" y="' + f(ty) + '" font-family="Amatic SC" font-weight="700" font-size="' + f(fs) + '" letter-spacing="' + f(fs * 0.04) + '" fill="' + esc(o.capColor || '#F4C542') + '" stroke="#3a2412" stroke-width="' + f(fs * 0.06) + '" stroke-linejoin="round" paint-order="stroke">' + esc(big) + '</text>';
    } else if (fr === 'ticket') {
      s += ticket(it, href, media, pfx, x, y, w, h, sh);
    } else if (fr === 'etiquette') {
      s += tag(it, href, media, pfx, x, y, w, h, sh);
    }
    return s;
  };
  /** Cachet de la poste : double cercle, ville en arc, date, lignes ondulées */
  A.postmark = function (pfx, cx, cy, R, city, date, col) {
    const id = pfx + 'pmk';
    const r1 = R * 0.5, r2 = R * 0.38, arc = r1 * 0.78;
    let s = '<defs><path id="' + id + 'a" d="M' + f(cx - arc) + ' ' + f(cy) + 'A' + f(arc) + ' ' + f(arc) + ' 0 0 1 ' + f(cx + arc) + ' ' + f(cy) + '"/><path id="' + id + 'b" d="M' + f(cx - arc) + ' ' + f(cy) + 'A' + f(arc) + ' ' + f(arc) + ' 0 0 0 ' + f(cx + arc) + ' ' + f(cy) + '"/>' +
      '<filter id="' + id + 'f" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.2 0 0 0 1.55"/><feComposite in="SourceGraphic" operator="in"/></filter></defs>';
    s += '<g filter="url(#' + id + 'f)" opacity=".8" fill="none" stroke="' + esc(col) + '" transform="rotate(-12 ' + f(cx) + ' ' + f(cy) + ')">';
    s += '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r1) + '" stroke-width="' + f(R * 0.035) + '"/><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r2 * 0.62) + '" stroke-width="' + f(R * 0.02) + '"/>';
    let wv = '';
    for (let i = -2; i <= 2; i++) {
      const yy = cy + i * R * 0.12; let d = 'M' + f(cx - r1 - R * 0.05) + ' ' + f(yy);
      for (let k = 1; k <= 8; k++) { const xx = cx - r1 - R * 0.05 - k * R * 0.17; d += 'Q' + f(xx + R * 0.085) + ' ' + f(yy + (k % 2 ? -1 : 1) * R * 0.06) + ' ' + f(xx) + ' ' + f(yy); }
      wv += d;
    }
    s += '<path d="' + wv + '" stroke-width="' + f(R * 0.025) + '"/>';
    s += '<text font-family="Caladea" font-weight="700" font-size="' + f(R * 0.15) + '" letter-spacing="' + f(R * 0.02) + '" fill="' + esc(col) + '" stroke="none"><textPath href="#' + id + 'a" startOffset="50%" text-anchor="middle">' + esc(String(city).toUpperCase()) + '</textPath></text>';
    s += '<text font-family="Caladea" font-size="' + f(R * 0.11) + '" fill="' + esc(col) + '" stroke="none" dy="' + f(R * 0.1) + '"><textPath href="#' + id + 'b" startOffset="50%" text-anchor="middle">★ POSTE ★</textPath></text>';
    s += '<text x="' + f(cx) + '" y="' + f(cy + R * 0.055) + '" text-anchor="middle" font-family="Special Elite" font-size="' + f(R * 0.13) + '" fill="' + esc(col) + '" stroke="none">' + esc(date || '') + '</text>';
    return s + '</g>';
  };
  /** Ruban adhésif décoratif (bandes, extrémités dentelées) */
  A.tape = function (id, cx, cy, L, T, rot, motif, color) {
    const R = A.rng(id), z = T * 0.12;
    let d = 'M' + f(-L / 2) + ' ' + f(-T / 2) + 'H' + f(L / 2);
    for (let i = 1; i <= 6; i++) d += 'L' + f(L / 2 + (i % 2 ? z : -z * R())) + ' ' + f(-T / 2 + i * T / 6);
    d += 'H' + f(-L / 2);
    for (let i = 5; i >= 0; i--) d += 'L' + f(-L / 2 + (i % 2 ? -z : z * R())) + ' ' + f(-T / 2 + i * T / 6);
    d += 'Z';
    const pid = id + 'p', dark = shade(color, -0.25), light = shade(color, 0.55);
    let pat = '';
    const sz = T * 0.38;
    if (motif === 'rayures') pat = '<pattern id="' + pid + '" width="' + f(sz) + '" height="' + f(sz) + '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="' + f(sz) + '" height="' + f(sz) + '" fill="' + color + '"/><rect width="' + f(sz / 2) + '" height="' + f(sz) + '" fill="' + light + '"/></pattern>';
    else if (motif === 'pois') pat = '<pattern id="' + pid + '" width="' + f(sz) + '" height="' + f(sz) + '" patternUnits="userSpaceOnUse"><rect width="' + f(sz) + '" height="' + f(sz) + '" fill="' + color + '"/><circle cx="' + f(sz / 4) + '" cy="' + f(sz / 4) + '" r="' + f(sz * 0.14) + '" fill="#fff"/><circle cx="' + f(sz * 0.75) + '" cy="' + f(sz * 0.75) + '" r="' + f(sz * 0.14) + '" fill="#fff"/></pattern>';
    else if (motif === 'carreaux') pat = '<pattern id="' + pid + '" width="' + f(sz) + '" height="' + f(sz) + '" patternUnits="userSpaceOnUse"><rect width="' + f(sz) + '" height="' + f(sz) + '" fill="' + light + '"/><rect width="' + f(sz / 2) + '" height="' + f(sz) + '" fill="' + color + '" opacity=".6"/><rect width="' + f(sz) + '" height="' + f(sz / 2) + '" fill="' + color + '" opacity=".6"/></pattern>';
    else if (motif === 'fleurs') { const q = sz * 1.4; pat = '<pattern id="' + pid + '" width="' + f(q) + '" height="' + f(q) + '" patternUnits="userSpaceOnUse"><rect width="' + f(q) + '" height="' + f(q) + '" fill="' + color + '"/>' + [0, 72, 144, 216, 288].map((a) => '<ellipse cx="' + f(q / 2) + '" cy="' + f(q / 2 - q * 0.16) + '" rx="' + f(q * 0.08) + '" ry="' + f(q * 0.15) + '" fill="#fff" opacity=".9" transform="rotate(' + a + ' ' + f(q / 2) + ' ' + f(q / 2) + ')"/>').join('') + '<circle cx="' + f(q / 2) + '" cy="' + f(q / 2) + '" r="' + f(q * 0.07) + '" fill="#F2C14E"/></pattern>'; }
    else if (motif === 'zigzag') pat = '<pattern id="' + pid + '" width="' + f(sz) + '" height="' + f(sz) + '" patternUnits="userSpaceOnUse"><rect width="' + f(sz) + '" height="' + f(sz) + '" fill="' + color + '"/><path d="M0 ' + f(sz * 0.6) + 'L' + f(sz / 2) + ' ' + f(sz * 0.25) + 'L' + f(sz) + ' ' + f(sz * 0.6) + '" fill="none" stroke="#fff" stroke-width="' + f(sz * 0.14) + '"/></pattern>';
    const fill = motif === 'uni' ? color : 'url(#' + pid + ')';
    return '<g transform="translate(' + f(cx) + ' ' + f(cy) + ') rotate(' + rot + ')"><defs>' + pat + '</defs><path d="' + d + '" fill="' + fill + '" opacity=".86"/><path d="' + d + '" fill="#fff" opacity=".12"/><path d="M' + f(-L / 2) + ' ' + f(-T / 2) + 'H' + f(L / 2) + '" stroke="' + dark + '" stroke-opacity=".25" stroke-width="' + f(T * 0.03) + '"/></g>';
  };
  /** Trombone */
  A.clip = function (x, y, w, h, col) {
    const c = col || '#9AA3AD', r = w / 2;
    const d = 'M' + f(x + w * 0.25) + ' ' + f(y + h * 0.72) + 'V' + f(y + r * 0.6) + 'a' + f(r * 0.25) + ' ' + f(r * 0.25) + ' 0 0 1 ' + f(r * 0.5) + ' 0V' + f(y + h * 0.82) + 'a' + f(r * 0.75) + ' ' + f(r * 0.75) + ' 0 0 1 ' + f(-w * 0.75) + ' 0V' + f(y + r) + 'a' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(w) + ' 0V' + f(y + h * 0.75);
    return '<path d="' + d + '" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="' + f(w * 0.11) + '" stroke-linecap="round" transform="translate(' + f(w * 0.05) + ' ' + f(w * 0.08) + ')"/><path d="' + d + '" fill="none" stroke="' + esc(c) + '" stroke-width="' + f(w * 0.1) + '" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="' + f(w * 0.03) + '" stroke-linecap="round" transform="translate(' + f(-w * 0.015) + ' 0)"/>';
  };
  /** Punaise vue de dessus, ombre portée */
  A.pin = function (cx, cy, r, col, pfx) {
    const id = pfx + 'pin';
    return '<defs><radialGradient id="' + id + '" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="' + shade(col, 0.55) + '"/><stop offset=".45" stop-color="' + esc(col) + '"/><stop offset="1" stop-color="' + shade(col, -0.45) + '"/></radialGradient><filter id="' + id + 'b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="' + f(r * 0.25) + '"/></filter></defs>' +
      '<ellipse cx="' + f(cx + r * 0.7) + '" cy="' + f(cy + r * 0.9) + '" rx="' + f(r * 1.05) + '" ry="' + f(r * 0.8) + '" fill="#000" opacity=".35" filter="url(#' + id + 'b)"/>' +
      '<path d="M' + f(cx) + ' ' + f(cy) + 'L' + f(cx + r * 0.9) + ' ' + f(cy + r * 1.3) + '" stroke="#8d8d8d" stroke-width="' + f(r * 0.14) + '" stroke-linecap="round"/>' +
      '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="url(#' + id + ')"/><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * 0.55) + '" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="' + f(r * 0.1) + '"/><ellipse cx="' + f(cx - r * 0.35) + '" cy="' + f(cy - r * 0.38) + '" rx="' + f(r * 0.25) + '" ry="' + f(r * 0.15) + '" fill="#fff" opacity=".7" transform="rotate(-35 ' + f(cx - r * 0.35) + ' ' + f(cy - r * 0.38) + ')"/>';
  };
  function barcode(seed, x, y, w, h, col) {
    const R = A.rng(seed); let d = '', cx = x;
    while (cx < x + w) { const bw = (R() < 0.5 ? 1 : R() < 0.7 ? 2 : 3) * w / 90; if (R() > 0.35) d += 'M' + f(cx + bw / 2) + ' ' + f(y) + 'v' + f(h); cx += bw * 1.6; void bw; }
    return '<path d="' + d + '" stroke="' + col + '" stroke-width="' + f(w / 80) + '"/>';
  }
  function ticket(it, href, media, pfx, x, y, w, h, sh) {
    const o = it.o || {}, kind = o.tk || 'train';
    const theme = { train: { band: '#2F6F73', paper: '#F1F4EA', label: 'BILLET DE TRAIN', icon: 'train' }, avion: { band: '#1F4E8C', paper: '#FFFFFF', label: 'CARTE D’EMBARQUEMENT', icon: 'avion' }, musee: { band: '#9E3B2E', paper: '#FBF3E2', label: 'BILLET D’ENTRÉE', icon: 'musee' } }[kind] || {};
    const stub = w * 0.3, sx = x + w - stub, nr = h * 0.08, rr = h * 0.05;
    const d = 'M' + f(x + rr) + ' ' + f(y) + 'H' + f(sx - nr) + 'A' + f(nr) + ' ' + f(nr) + ' 0 0 0 ' + f(sx + nr) + ' ' + f(y) + 'H' + f(x + w - rr) + 'Q' + f(x + w) + ' ' + f(y) + ' ' + f(x + w) + ' ' + f(y + rr) + 'V' + f(y + h - rr) + 'Q' + f(x + w) + ' ' + f(y + h) + ' ' + f(x + w - rr) + ' ' + f(y + h) + 'H' + f(sx + nr) + 'A' + f(nr) + ' ' + f(nr) + ' 0 0 0 ' + f(sx - nr) + ' ' + f(y + h) + 'H' + f(x + rr) + 'Q' + f(x) + ' ' + f(y + h) + ' ' + f(x) + ' ' + f(y + h - rr) + 'V' + f(y + rr) + 'Q' + f(x) + ' ' + f(y) + ' ' + f(x + rr) + ' ' + f(y) + 'Z';
    let s = '';
    if (sh) s += shadow(pfx, d, w, h);
    const cid = pfx + 'tk';
    s += '<defs><clipPath id="' + cid + '"><path d="' + d + '"/></clipPath></defs><path d="' + d + '" fill="' + theme.paper + '"/>' + paperNoise(pfx, d, 0.25);
    const band = h * 0.17;
    s += '<g clip-path="url(#' + cid + ')"><rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(band) + '" fill="' + theme.band + '"/></g>';
    s += '<g transform="translate(' + f(x + band * 0.62) + ' ' + f(y + band / 2) + ') scale(' + f(band / 100 * 0.7) + ')">' + A.miniIcon(theme.icon, '#fff') + '</g>';
    s += '<text x="' + f(x + band * 1.2) + '" y="' + f(y + band * 0.66) + '" font-family="Special Elite" font-size="' + f(band * 0.42) + '" fill="#fff" letter-spacing="' + f(band * 0.03) + '">' + theme.label + '</text>';
    s += '<path d="M' + f(sx) + ' ' + f(y + nr + 4) + 'V' + f(y + h - nr - 4) + '" stroke="#7a6a58" stroke-width="' + f(h * 0.008) + '" stroke-dasharray="' + f(h * 0.025) + ' ' + f(h * 0.02) + '"/>';
    const pad = h * 0.07;
    s += photoArea(it, href, media, pfx, x + pad, y + band + pad, sx - x - 2 * pad, h - band - 2 * pad);
    const tx = sx + stub * 0.1, fs = Math.min(h * 0.062, stub * 0.1), col = '#2E2A26';
    const lab = (t, yy) => '<text x="' + f(tx) + '" y="' + f(yy) + '" font-family="Special Elite" font-size="' + f(fs * 0.7) + '" fill="#8a7a66">' + esc(t) + '</text>';
    const val = (t, yy, big) => '<text x="' + f(tx) + '" y="' + f(yy) + '" font-family="' + (big ? 'Caveat' : 'Special Elite') + '" font-weight="' + (big ? 700 : 400) + '" font-size="' + f(big ? fs * 1.55 : fs) + '" fill="' + col + '">' + esc(t) + '</text>';
    let yy = y + band + fs * 1.4;
    if (kind === 'musee') { s += lab('ENTRÉE', yy) + val(o.tFrom || 'Musée', yy + fs * 1.5, true); yy += fs * 2.8; s += lab('ADMIS·E', yy) + val(o.tTo || '1 adulte', yy + fs * 1.1); yy += fs * 2.2; }
    else { s += lab('DE', yy) + val(o.tFrom || (kind === 'avion' ? 'CDG' : 'Paris'), yy + fs * 1.45, true); yy += fs * 2.6; s += lab('À', yy) + val(o.tTo || (kind === 'avion' ? 'MRS' : 'Marseille'), yy + fs * 1.45, true); yy += fs * 2.6; }
    s += lab('DATE', yy) + val(o.tDate || '', yy + fs * 1.1); yy += fs * 2.1;
    s += lab(kind === 'avion' ? 'SIÈGE' : kind === 'musee' ? 'TARIF' : 'PLACE', yy) + val(o.tSeat || (kind === 'avion' ? '14A' : kind === 'musee' ? '12 €' : 'V12 · 64'), yy + fs * 1.15);
    s += barcode(it.id, tx, y + h - h * 0.13, stub * 0.8, h * 0.08, col);
    return s;
  }
  function tag(it, href, media, pfx, x, y, w, h, sh) {
    const o = it.o || {}, c = h * 0.28, col = o.tagColor || '#C9A06A';
    const d = 'M' + f(x + c) + ' ' + f(y) + 'H' + f(x + w - h * 0.05) + 'Q' + f(x + w) + ' ' + f(y) + ' ' + f(x + w) + ' ' + f(y + h * 0.05) + 'V' + f(y + h * 0.95) + 'Q' + f(x + w) + ' ' + f(y + h) + ' ' + f(x + w - h * 0.05) + ' ' + f(y + h) + 'H' + f(x + c) + 'L' + f(x) + ' ' + f(y + h - c) + 'V' + f(y + c) + 'Z';
    let s = '';
    if (sh) s += shadow(pfx, d, w, h);
    s += '<path d="' + d + '" fill="' + esc(col) + '"/>' + paperNoise(pfx, d, 0.6);
    s += fibers(A.rng(it.id + 'f'), 40, '#5d3b1c', 0.3, x, y, w, h).replace('<path', '<path clip-path="url(#' + pfx + 'tgc)"') + '<defs><clipPath id="' + pfx + 'tgc"><path d="' + d + '"/></clipPath></defs>';
    const hx = x + c * 0.75, hy = y + h / 2, hr = h * 0.06;
    s += '<circle cx="' + f(hx) + '" cy="' + f(hy) + '" r="' + f(hr * 1.9) + '" fill="#E9E4DA" stroke="#9c8a70" stroke-width="' + f(h * 0.01) + '"/><circle cx="' + f(hx) + '" cy="' + f(hy) + '" r="' + f(hr) + '" fill="#3b2f25" opacity=".85"/>';
    s += '<path d="M' + f(hx) + ' ' + f(hy) + 'C' + f(hx - w * 0.15) + ' ' + f(hy - h * 0.4) + ' ' + f(hx - w * 0.2) + ' ' + f(hy + h * 0.1) + ' ' + f(hx - w * 0.28) + ' ' + f(hy - h * 0.25) + '" fill="none" stroke="#B4413A" stroke-width="' + f(h * 0.025) + '" stroke-linecap="round"/>';
    const px = x + c * 1.5, pw = (w - c * 1.5) * 0.48, pad = h * 0.1;
    s += '<rect x="' + f(px - 2) + '" y="' + f(y + pad - 2) + '" width="' + f(pw + 4) + '" height="' + f(h - 2 * pad + 4) + '" fill="#fff"/>';
    s += photoArea(it, href, media, pfx, px, y + pad, pw, h - 2 * pad);
    const tx = px + pw + h * 0.08, tw = x + w - tx - h * 0.06, fs = Math.min(h * 0.09, tw * 0.11);
    s += '<text x="' + f(tx) + '" y="' + f(y + h * 0.26) + '" font-family="Special Elite" font-size="' + f(fs) + '" fill="#4a3320">DESTINATION</text>';
    let ly = y + h * 0.44; for (let i = 0; i < 3; i++) { s += '<path d="M' + f(tx) + ' ' + f(ly + i * h * 0.17) + 'h' + f(tw) + '" stroke="#4a3320" stroke-width="' + f(h * 0.006) + '" opacity=".6"/>'; }
    const txt = (o.cap == null ? 'Marseille' : o.cap);
    const lines = A.wrapSimple(txt, 12).slice(0, 3);
    lines.forEach((l, i) => { s += '<text x="' + f(tx + 4) + '" y="' + f(ly - h * 0.025 + i * h * 0.17) + '" font-family="Caveat" font-weight="700" font-size="' + f(Math.min(h * 0.16, tw / Math.max(5, l.length) * 1.9)) + '" fill="#1d2a5c">' + esc(l) + '</text>'; });
    return s;
  }

  /* ---------------- Petits pictogrammes (billets) ---------------- */
  A.miniIcon = function (k, c) {
    if (k === 'avion') return '<path d="M-40 6 L-8 2 L12 -36 L22 -36 L12 2 L36 2 L46 -12 L52 -12 L46 6 L52 24 L46 24 L36 10 L12 10 L22 48 L12 48 L-8 10 L-40 6Z" transform="translate(-6 -6) scale(.9)" fill="' + c + '"/>';
    if (k === 'musee') return '<path d="M-44 -14 L0 -42 L44 -14 Z M-38 -8h76v8h-76z M-32 4h10v28h-10z M-5 4h10v28h-10z M22 4h10v28h-10z M-42 36h84v8h-84z" fill="' + c + '"/>';
    return '<path d="M-30 -40h60a12 12 0 0 1 12 12v44a12 12 0 0 1 -12 12h-60a12 12 0 0 1 -12 -12v-44a12 12 0 0 1 12 -12z M-30 -28v18h60v-18z M-22 14a7 7 0 1 0 0.1 0z M22 14a7 7 0 1 0 0.1 0z M-26 30 L-36 46 M26 30 L36 46" fill="' + c + '" stroke="' + c + '" stroke-width="6" fill-rule="evenodd"/>';
  };

  /* ---------------- Autocollants et tampons (dessins originaux) ---------------- */
  A.STICKERS = [
    ['avion', 'Avion'], ['valise', 'Valise'], ['boussole', 'Boussole'], ['palmier', 'Palmier'], ['montagne', 'Montagne'], ['soleil', 'Soleil'],
    ['appareil', 'Appareil photo'], ['coeur', 'Cœur'], ['fleche', 'Flèche'], ['tampon-vu', 'Tampon « VU »'], ['tampon-souvenir', 'Tampon « SOUVENIR »'], ['tampon-bon-voyage', 'Tampon « BON VOYAGE »']
  ];
  A.stickerRatio = (k) => /^tampon-(souvenir|bon)/.test(k) ? 2 : k === 'fleche' ? 2 : 1;
  const OUT = '#2E2620';
  const ST = {
    avion: (c) => '<g stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"><path d="M10 58 C30 52 55 47 80 40 C90 37 95 41 88 47 C70 58 45 66 22 72 Z" fill="' + (c || '#F3F1EA') + '"/><path d="M44 50 L60 18 L70 20 L62 46Z" fill="' + (c ? shade(c, -0.2) : '#D9534F') + '"/><path d="M40 64 L48 88 L58 86 L56 60Z" fill="' + (c ? shade(c, -0.2) : '#D9534F') + '"/><path d="M14 57 L8 40 L16 40 L26 54Z" fill="' + (c ? shade(c, -0.2) : '#D9534F') + '"/><circle cx="70" cy="46" r="2.6" fill="#7FB3D5" stroke="none"/><circle cx="62" cy="49" r="2.6" fill="#7FB3D5" stroke="none"/><circle cx="54" cy="52" r="2.6" fill="#7FB3D5" stroke="none"/></g><path d="M8 80 Q20 72 30 80 T52 80" fill="none" stroke="#9AB" stroke-width="2.5" stroke-dasharray="4 5"/>',
    valise: (c) => '<g stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"><path d="M38 26 V16 a6 6 0 0 1 6 -6 h12 a6 6 0 0 1 6 6 V26" fill="none" stroke-width="5"/><rect x="14" y="26" width="72" height="56" rx="9" fill="' + (c || '#C8743A') + '"/><path d="M14 44 H86" stroke-width="2.5"/><rect x="28" y="26" width="8" height="56" fill="' + shade(c || '#C8743A', -0.3) + '"/><rect x="64" y="26" width="8" height="56" fill="' + shade(c || '#C8743A', -0.3) + '"/><circle cx="26" cy="86" r="4" fill="' + OUT + '"/><circle cx="74" cy="86" r="4" fill="' + OUT + '"/></g><rect x="42" y="52" width="18" height="12" rx="2" fill="#FBF3DC" stroke="' + OUT + '" stroke-width="2" transform="rotate(-8 51 58)"/>',
    boussole: (c) => '<g stroke="' + OUT + '" stroke-width="3"><circle cx="50" cy="52" r="38" fill="' + (c || '#C9A04A') + '"/><circle cx="50" cy="52" r="30" fill="#FBF6E9"/><path d="M50 8 v6" stroke-width="5"/><circle cx="50" cy="8" r="5" fill="' + (c || '#C9A04A') + '"/></g><g stroke="' + OUT + '" stroke-width="1.5"><path d="M50 26 L57 52 L50 50 Z" fill="#C7362F"/><path d="M50 26 L43 52 L50 50 Z" fill="#E1564F"/><path d="M50 78 L57 52 L50 54 Z" fill="#5A5F66"/><path d="M50 78 L43 52 L50 54 Z" fill="#7C838B"/></g><circle cx="50" cy="52" r="3" fill="' + OUT + '"/><g font-family="Caladea" font-weight="700" font-size="9" fill="' + OUT + '" text-anchor="middle"><text x="50" y="33">N</text><text x="50" y="78">S</text><text x="27" y="55">O</text><text x="73" y="55">E</text></g>',
    palmier: (c) => '<path d="M52 92 C50 70 48 52 56 34" fill="none" stroke="' + OUT + '" stroke-width="9" stroke-linecap="round"/><path d="M52 92 C50 70 48 52 56 34" fill="none" stroke="#A9743F" stroke-width="5" stroke-linecap="round" stroke-dasharray="4 3"/><g fill="' + (c || '#4E9A5B') + '" stroke="' + OUT + '" stroke-width="2.5" stroke-linejoin="round"><path d="M56 34 C40 20 20 22 10 34 C26 30 40 32 56 34Z"/><path d="M56 34 C46 14 30 8 18 12 C32 16 44 24 56 34Z"/><path d="M56 34 C64 14 80 10 90 16 C76 18 66 24 56 34Z"/><path d="M56 34 C74 26 90 30 96 42 C82 36 70 36 56 34Z"/><path d="M56 34 C58 18 54 8 46 4 C52 14 54 24 56 34Z"/></g><circle cx="52" cy="38" r="4" fill="#7A4E2D" stroke="' + OUT + '" stroke-width="2"/><circle cx="60" cy="39" r="4" fill="#7A4E2D" stroke="' + OUT + '" stroke-width="2"/><path d="M20 94 Q50 84 82 94" fill="#E8C98B" stroke="' + OUT + '" stroke-width="2.5"/>',
    montagne: (c) => '<g stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"><path d="M4 86 L38 30 L56 58 L68 42 L96 86 Z" fill="' + (c || '#6F8FA6') + '"/><path d="M38 30 L48 46 L42 44 L36 50 L30 44 Z" fill="#fff"/><path d="M68 42 L75 53 L70 52 L66 56 L62 51Z" fill="#fff"/></g><path d="M4 86 H96" stroke="' + OUT + '" stroke-width="3"/><circle cx="80" cy="20" r="8" fill="#F4C542" stroke="' + OUT + '" stroke-width="2.5"/>',
    soleil: (c) => { let r = ''; for (let i = 0; i < 12; i++) r += '<path d="M50 50 L' + f(50 + Math.cos(i * Math.PI / 6 - 0.13) * 46) + ' ' + f(50 + Math.sin(i * Math.PI / 6 - 0.13) * 46) + ' L' + f(50 + Math.cos(i * Math.PI / 6 + 0.13) * 46) + ' ' + f(50 + Math.sin(i * Math.PI / 6 + 0.13) * 46) + 'Z" fill="' + (c ? shade(c, 0.2) : '#F6A93B') + '" stroke="' + OUT + '" stroke-width="2.5" stroke-linejoin="round"/>'; return r + '<circle cx="50" cy="50" r="27" fill="' + (c || '#F4C542') + '" stroke="' + OUT + '" stroke-width="3"/><path d="M40 46 q3 -4 6 0 M54 46 q3 -4 6 0 M41 57 q9 8 18 0" fill="none" stroke="' + OUT + '" stroke-width="2.5" stroke-linecap="round"/>'; },
    appareil: (c) => '<g stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"><rect x="10" y="30" width="80" height="54" rx="8" fill="' + (c || '#3E4A57') + '"/><path d="M34 30 L40 20 H60 L66 30" fill="' + shade(c || '#3E4A57', -0.25) + '"/><rect x="10" y="40" width="80" height="12" fill="#B07A4C"/><circle cx="50" cy="58" r="20" fill="#20262C"/><circle cx="50" cy="58" r="13" fill="#4F6D86"/><rect x="72" y="34" width="12" height="6" rx="2" fill="#F4F0E6" stroke-width="2"/></g><circle cx="45" cy="53" r="4" fill="#fff" opacity=".7"/><rect x="18" y="24" width="10" height="6" rx="1.5" fill="' + OUT + '"/>',
    coeur: (c) => '<path d="' + A.shapeD('coeur', 8, 12, 84, 80) + '" fill="' + (c || '#E05A5A') + '" stroke="' + OUT + '" stroke-width="3" stroke-linejoin="round"/><path d="M26 30 q6 -8 14 -4" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>',
    fleche: (c) => '<path d="M8 62 C40 30 110 30 160 48" fill="none" stroke="' + (c || '#2E2620') + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 12"/><path d="M160 48 C120 46 128 46 120 36 M160 48 C130 52 134 54 128 66" fill="none" stroke="' + (c || '#2E2620') + '" stroke-width="5" stroke-linecap="round"/><path d="M8 62 C40 30 110 30 160 48" fill="none" stroke="' + (c || '#2E2620') + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="18 12"/>'
  };
  function rubber(pfx, inner, c, wv, hv) {
    const id = pfx + 'rb';
    return '<defs><filter id="' + id + '" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="' + (hash(pfx) % 50) + '"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 0 0 0 1.75"/><feComposite in="SourceGraphic" operator="in"/></filter></defs>' +
      '<g filter="url(#' + id + ')" opacity=".88" fill="none" stroke="' + c + '" color="' + c + '">' + inner + '</g>';
    void wv; void hv;
  }
  ST['tampon-vu'] = (c, pfx) => rubber(pfx, '<circle cx="50" cy="50" r="44" stroke-width="5"/><circle cx="50" cy="50" r="36" stroke-width="2"/><text x="50" y="66" text-anchor="middle" font-family="Caladea" font-weight="700" font-size="46" fill="currentColor" stroke="none">VU</text><text x="50" y="24" text-anchor="middle" font-family="Special Elite" font-size="9" fill="currentColor" stroke="none" letter-spacing="2">★ ★ ★</text>', c || '#2B5BA8', 100, 100);
  ST['tampon-souvenir'] = (c, pfx) => rubber(pfx, '<rect x="6" y="10" width="188" height="80" rx="12" stroke-width="5"/><rect x="14" y="18" width="172" height="64" rx="7" stroke-width="2"/><text x="100" y="64" text-anchor="middle" font-family="Special Elite" font-size="34" letter-spacing="3" fill="currentColor" stroke="none">SOUVENIR</text>', c || '#B23A2E', 200, 100);
  ST['tampon-bon-voyage'] = (c, pfx) => rubber(pfx, '<path d="M8 50 L24 12 H176 L192 50 L176 88 H24 Z" stroke-width="5" stroke-linejoin="round"/><text x="100" y="62" text-anchor="middle" font-family="Caladea" font-weight="700" font-size="33" letter-spacing="2" fill="currentColor" stroke="none">BON VOYAGE</text><text x="100" y="80" text-anchor="middle" font-family="Special Elite" font-size="9" letter-spacing="3" fill="currentColor" stroke="none">✈ CARNET DE ROUTE ✈</text><text x="100" y="28" text-anchor="middle" font-family="Special Elite" font-size="9" letter-spacing="3" fill="currentColor" stroke="none">— ' + new Date().getFullYear() + ' —</text>', c || '#2F6F73', 200, 100);
  A.sticker = function (k, w, h, color, pfx) {
    const r = A.stickerRatio(k), vw = r === 2 ? 200 : 100, vh = 100;
    const body = ST[k] ? ST[k](color, pfx) : ST.coeur(color);
    return '<svg x="' + f(-w / 2) + '" y="' + f(-h / 2) + '" width="' + f(w) + '" height="' + f(h) + '" viewBox="0 0 ' + vw + ' ' + vh + '" overflow="visible">' + body + '</svg>';
  };
})();
