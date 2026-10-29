/* =====================================================================
   Suite MAG — rendu d'un morceau de page (DOM) en image, sans bibliothèque :
   le nœud est cloné dans un SVG <foreignObject> avec les styles de la page, ses images en data: URL,
   puis dessiné dans un canvas. Sert aux exports PNG/JPG/PDF et aux vignettes.
   Office.Raster.canvas(nœud, {width, height, scale, bg}) → Promise<HTMLCanvasElement>
   Office.Raster.blob(nœud, opt, type, qualité) → Promise<Blob>
   Vidéos : image en cours ; iframes (YouTube…) : vignette neutre (rien n'est téléchargé).
   ===================================================================== */
(function () {
  'use strict';
  const O = window.Office;
  const R = O.Raster = {};
  const cache = new Map();
  async function toData(url) {
    if (!url || url.startsWith('data:')) return url;
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then((r) => r.blob()).then(O.blobToDataURL).catch(() => '');
    cache.set(url, p);
    return p;
  }
  R.forget = (url) => cache.delete(url);
  let cssText = null, fontCss = null;
  function pageCss() {
    if (cssText != null) return cssText;
    let s = '';
    for (const sh of Array.from(document.styleSheets)) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (const r of Array.from(rules)) { if (r.type === CSSRule.FONT_FACE_RULE) continue; s += r.cssText + '\n'; }
    }
    return (cssText = s);
  }
  R.resetCss = () => { cssText = null; };
  /** @font-face des polices de la page (KaTeX…) en data: URL — seulement si le nœud en a besoin */
  async function fonts() {
    if (fontCss != null) return fontCss;
    let out = '';
    for (const sh of Array.from(document.styleSheets)) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      for (const r of Array.from(rules || [])) {
        if (r.type !== CSSRule.FONT_FACE_RULE) continue;
        let t = r.cssText; const m = /url\(["']?([^"')]+)["']?\)/.exec(t); if (!m) continue;
        const abs = new URL(m[1], sh.href || location.href).href;
        const d = await toData(abs); if (!d) continue;
        t = t.replace(/src:[^;]+;/, 'src: url(' + d + ') format("woff2");');
        out += t + '\n';
      }
    }
    return (fontCss = out);
  }
  function placeholder(w, h, label) {
    const d = document.createElement('div');
    d.setAttribute('style', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;background:#1c1f26;color:#fff;font:600 ' + Math.max(12, Math.min(w, h) / 10) + 'px system-ui,sans-serif');
    d.innerHTML = '<svg viewBox="0 0 24 24" style="width:' + Math.min(w, h) / 3 + 'px;height:' + Math.min(w, h) / 3 + 'px;fill:none;stroke:#fff;stroke-width:1.6"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="#fff"/></svg><span style="opacity:.8">' + O.esc(label || '') + '</span>';
    return d;
  }
  R.canvas = async function (node, opt) {
    opt = opt || {};
    const W = opt.width || node.offsetWidth, H = opt.height || node.offsetHeight, k = opt.scale || 1;
    const clone = node.cloneNode(true);
    // vidéos : image courante (ou vignette)
    const vids = Array.from(node.querySelectorAll('video')), cv = Array.from(clone.querySelectorAll('video'));
    cv.forEach((v, i) => {
      const src = vids[i]; let img = null;
      try { if (src && src.readyState >= 2 && src.videoWidth) { const c = document.createElement('canvas'); c.width = src.videoWidth; c.height = src.videoHeight; c.getContext('2d').drawImage(src, 0, 0); img = document.createElement('img'); img.src = c.toDataURL('image/jpeg', 0.85); img.setAttribute('style', 'width:100%;height:100%;object-fit:contain;background:#000'); } } catch (e) { img = null; }
      if (!img && src && src.poster) { img = document.createElement('img'); img.src = src.poster; img.setAttribute('style', 'width:100%;height:100%;object-fit:contain;background:#000'); }
      v.replaceWith(img || placeholder(v.offsetWidth || 320, v.offsetHeight || 180, 'Vidéo'));
    });
    clone.querySelectorAll('iframe').forEach((f) => { const p = f.parentNode; const ph = placeholder(+f.getAttribute('width') || 320, +f.getAttribute('height') || 180, f.getAttribute('title') || 'Vidéo en ligne'); f.replaceWith(ph); if (p && getComputedStyle(node).position === 'static') p.style.position = 'relative'; });
    clone.querySelectorAll('audio').forEach((a) => a.remove());
    const canvases = Array.from(node.querySelectorAll('canvas')), cc = Array.from(clone.querySelectorAll('canvas'));
    cc.forEach((c, i) => { const im = document.createElement('img'); try { im.src = canvases[i].toDataURL(); } catch (e) { } im.setAttribute('style', c.getAttribute('style') || ''); im.style.width = canvases[i].style.width || canvases[i].width + 'px'; c.replaceWith(im); });
    clone.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
    // images et fonds en data: URL
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(async (im) => { const s = im.getAttribute('src'); if (s && !s.startsWith('data:')) im.setAttribute('src', await toData(new URL(s, location.href).href)); }));
    await Promise.all(Array.from(clone.querySelectorAll('image')).map(async (im) => { const s = im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href'); if (s && !s.startsWith('data:')) im.setAttribute('href', await toData(new URL(s, location.href).href)); }));
    const withBg = [clone].concat(Array.from(clone.querySelectorAll('[style*="url("]')));
    await Promise.all(withBg.map(async (e) => {
      const st = e.getAttribute && e.getAttribute('style'); if (!st || st.indexOf('url(') < 0) return;
      let out = st; const re = /url\((["']?)(?!data:)([^"')]+)\1\)/g; let m; const reps = [];
      while ((m = re.exec(st))) reps.push([m[0], m[2]]);
      for (const r of reps) { const d = await toData(new URL(r[1], location.href).href); out = out.split(r[0]).join('url("' + d + '")'); }
      e.setAttribute('style', out);
    }));
    const needFonts = !!clone.querySelector('.katex') || opt.fonts;
    const css = pageCss() + (needFonts ? await fonts() : '') + (opt.css || '');
    clone.style.margin = '0';
    clone.style.transform = 'none';
    clone.style.position = 'relative'; clone.style.left = '0'; clone.style.top = '0';
    const wrap = document.createElement('div');
    wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    wrap.setAttribute('style', 'width:' + W + 'px;height:' + H + 'px;overflow:hidden;transform:scale(' + k + ');transform-origin:0 0;' + (opt.bg ? 'background:' + opt.bg : ''));
    wrap.appendChild(clone);
    const style = '<style>' + css.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</style>';
    const ser = new XMLSerializer().serializeToString(wrap), cut = ser.indexOf('>') + 1;
    const xhtml = ser.slice(0, cut) + style + ser.slice(cut);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.ceil(W * k) + '" height="' + Math.ceil(H * k) + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xhtml + '</foreignObject></svg>';
    const img = new Image();
    img.decoding = 'sync';
    // data: URL (et non blob:) : Chromium considère une image SVG <foreignObject> chargée depuis blob: comme « sale »
    // et refuserait ensuite toDataURL / toBlob sur le canvas.
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Rendu de l\'image impossible')); img.src = url; });
      const c = document.createElement('canvas'); c.width = Math.ceil(W * k); c.height = Math.ceil(H * k);
      const x = c.getContext('2d');
      if (opt.bg) { x.fillStyle = opt.bg; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(img, 0, 0);
      return c;
    } finally { img.src = ''; }
  };
  R.blob = async function (node, opt, type, q) { const c = await R.canvas(node, opt); return new Promise((res) => c.toBlob(res, type || 'image/png', q || 0.92)); };
})();
