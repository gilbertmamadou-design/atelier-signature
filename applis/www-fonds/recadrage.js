/* =====================================================================
   Toile — recadrage manuel d'une image : partie commune à l'appli Android
   (applis/www-fonds/index.html) et à Toile sur PC (pc/shared/toile.html,
   copié dans pc/toile/toile-recadrage.js par pc/build-pc.py).

   - Le cadre a le format exact de l'écran (téléphone : écran d'accueil ou de
     verrouillage ; PC : résolution choisie). On le déplace au doigt ou à la
     souris, on l'agrandit ou le rétrécit au pincement, à la molette, avec les
     poignées d'angle ou au clavier (flèches, + et −). Le ratio est conservé et
     le cadre ne sort jamais de l'image.
   - « Ajuster au format libre » : ratio libre, le cadre peut dépasser l'image ;
     le reste de l'écran est rempli de bandes floues ou d'une couleur.
   - Le cadrage est rangé avec l'image : { "<format>": {x, y, w, h, free, bg, at} },
     rectangle en fractions de l'image d'origine (orientation EXIF comprise).
     Format : ratio réduit de l'écran (« 9:20 », « 16:9 »), « @lock » pour le
     verrouillage. Aucun fichier d'origine n'est modifié.
   - resolve() : cadrage à utiliser pour un écran donné ; à défaut du format
     exact, celui d'un autre format est recentré sur le même centre d'intérêt
     (même surface, nouveau ratio). Même calcul dans WallpaperJob.java
     (resolveCrop) et dans pc/shared/toile-worker.js (resolveCrop).
   ===================================================================== */
(function (root) {
  'use strict';
  var T = {};

  /* ---------------- Formats et cadrages rangés ---------------- */
  function gcd(a, b) { a = Math.abs(a | 0); b = Math.abs(b | 0); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function key(sw, sh, variant) { var g = gcd(sw, sh); return (sw / g) + ':' + (sh / g) + (variant === 'lock' ? '@lock' : ''); }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function valid(e) { return e && typeof e === 'object' && num(e.x) && num(e.y) && num(e.w) && num(e.h) && e.w > 0 && e.h > 0 && e.w <= 4 && e.h <= 4 ? e : null; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // Même centre, même surface, nouveau ratio, dans l'image
  function refit(e, sw, sh, ow, oh) {
    var tr = sw / sh, cx = (e.x + e.w / 2) * ow, cy = (e.y + e.h / 2) * oh, A = (e.w * ow) * (e.h * oh);
    var nw = Math.sqrt(A * tr), nh = nw / tr, s = Math.min(1, ow / nw, oh / nh);
    nw *= s; nh *= s;
    var nx = clamp(cx - nw / 2, 0, ow - nw), ny = clamp(cy - nh / 2, 0, oh - nh);
    return { x: nx / ow, y: ny / oh, w: nw / ow, h: nh / oh, free: false, bg: e.bg || 'blur', derived: true };
  }
  function resolve(E, sw, sh, variant, ow, oh) {
    if (!E || typeof E !== 'object') return null;
    var k = key(sw, sh, variant), e = valid(E[k]);
    if (e) return { x: e.x, y: e.y, w: e.w, h: e.h, free: !!e.free, bg: e.bg || 'blur', exact: true };
    var other = variant === 'lock' ? key(sw, sh, null) : key(sw, sh, 'lock');
    var rest = Object.keys(E).filter(function (q) { return q !== k && q !== other && valid(E[q]); })
      .sort(function (a, b) { return ((+E[b].at || 0) - (+E[a].at || 0)) || (a < b ? -1 : a > b ? 1 : 0); });
    var order = (valid(E[other]) ? [other] : []).concat(rest);
    for (var i = 0; i < order.length; i++) {
      var f = E[order[i]];
      if (f.free) return { x: f.x, y: f.y, w: f.w, h: f.h, free: true, bg: f.bg || 'blur', derived: true };
      return refit(f, sw, sh, ow, oh);
    }
    return null;
  }
  // Point de départ « Recadrage auto » : zone gardée par le calcul automatique ({x,y,w,h} relatifs, fill : image entière sur bandes floues)
  function fromAuto(a, sw, sh, ow, oh) {
    if (!a || !valid(a)) return maxRect(sw, sh, ow, oh);
    if (a.fill) return { x: a.x, y: a.y, w: a.w, h: a.h, free: true, bg: 'blur' };
    var r = refit(a, sw, sh, ow, oh); delete r.derived; return r;
  }
  function maxRect(sw, sh, ow, oh) {
    var tr = sw / sh, w = Math.min(ow, oh * tr), h = w / tr;
    return { x: (ow - w) / 2 / ow, y: (oh - h) / 2 / oh, w: w / ow, h: h / oh, free: false, bg: 'blur' };
  }
  function count(E) { return E && typeof E === 'object' ? Object.keys(E).filter(function (k) { return valid(E[k]); }).length : 0; }

  /* ---------------- Interface ---------------- */
  var CSS = [
    '.tcr{position:fixed;inset:0;z-index:200;background:#07080b;color:#f2f3f7;display:flex;flex-direction:column;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none;overscroll-behavior:none}',
    '.tcr *{box-sizing:border-box}',
    '.tcr button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}',
    '.tcr-top{display:flex;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top,0px)) 12px 8px;border-bottom:1px solid #ffffff14;min-height:52px}',
    '.tcr-x{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#181b23;border:1px solid #ffffff14!important;font-size:17px!important;flex:none}',
    '.tcr-tt{flex:1;min-width:0;line-height:1.2}.tcr-tt b{display:block;font-size:16px}.tcr-tt span{display:block;font-size:12px;color:#7d8294;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tcr-seg{display:flex;background:#222632;border-radius:11px;padding:3px;gap:3px;flex:none}',
    '.tcr-seg button{padding:7px 10px;border-radius:8px;font-size:12.5px!important;font-weight:600;color:#b4b8c7!important;white-space:nowrap}',
    '.tcr-seg button.on{background:#2c3140;color:#f2f3f7!important;box-shadow:0 0 0 1px #ffffff1c inset}',
    '.tcr-main{flex:1;min-height:0;display:flex;flex-direction:column}',
    '.tcr-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;background:#0b0c10;outline:none;cursor:grab;contain:strict}',
    '.tcr-stage:focus-visible{box-shadow:inset 0 0 0 2px #8fb4ff}',
    '.tcr-stage.drag{cursor:grabbing}',
    '.tcr-img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;pointer-events:none;will-change:transform;image-rendering:auto}',
    '.tcr-band{position:absolute;left:0;top:0;pointer-events:none;background:repeating-linear-gradient(45deg,#ffffff10 0 8px,#ffffff05 8px 16px);will-change:transform}',
    '.tcr-frame{position:absolute;left:0;top:0;box-shadow:0 0 0 9999px #000000a6;outline:2px solid #fff;will-change:transform;pointer-events:none;transition:outline-color .15s}',
    '.tcr-frame.edge{outline-color:#ffb35c}',
    '.tcr-frame i{position:absolute;background:#ffffff59;pointer-events:none}',
    '.tcr-frame i.v{top:0;bottom:0;width:1px}.tcr-frame i.h{left:0;right:0;height:1px}',
    '.tcr-frame i.v1{left:33.333%}.tcr-frame i.v2{left:66.667%}.tcr-frame i.h1{top:33.333%}.tcr-frame i.h2{top:66.667%}',
    '.tcr-frame b{position:absolute;width:44px;height:44px;pointer-events:auto;touch-action:none}',
    '.tcr-frame b:after{content:"";position:absolute;width:18px;height:18px;border:4px solid #fff;border-radius:2px}',
    '.tcr-frame b[data-h=nw]{left:-22px;top:-22px;cursor:nwse-resize}.tcr-frame b[data-h=nw]:after{left:18px;top:18px;border-right:0;border-bottom:0}',
    '.tcr-frame b[data-h=ne]{right:-22px;top:-22px;cursor:nesw-resize}.tcr-frame b[data-h=ne]:after{right:18px;top:18px;border-left:0;border-bottom:0}',
    '.tcr-frame b[data-h=sw]{left:-22px;bottom:-22px;cursor:nesw-resize}.tcr-frame b[data-h=sw]:after{left:18px;bottom:18px;border-right:0;border-top:0}',
    '.tcr-frame b[data-h=se]{right:-22px;bottom:-22px;cursor:nwse-resize}.tcr-frame b[data-h=se]:after{right:18px;bottom:18px;border-left:0;border-top:0}',
    '.tcr-zoom{position:absolute;left:8px;top:6px;background:#000000b3;border-radius:99px;padding:2px 9px;font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;pointer-events:none}',
    '.tcr-tip{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);background:#000000b3;border-radius:99px;padding:4px 12px;font-size:12px;color:#d6d9e3;pointer-events:none;white-space:nowrap;transition:opacity .4s}',
    '.tcr-side{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 12px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid #ffffff14;background:#0f1116}',
    '.tcr-pvw{grid-row:1;display:flex;flex-direction:column;align-items:center;gap:4px}',
    '.tcr-pv{display:block;border-radius:10px;border:2px solid #3a3f50;background:#181b23}',
    '.tcr-pvcap{font-size:10.5px;color:#7d8294;font-weight:600;text-align:center}',
    '.tcr-opts{grid-row:1;min-width:0;display:flex;flex-direction:column;gap:7px;font-size:13px}',
    '.tcr-chk{display:flex;align-items:center;gap:9px;font-weight:600;cursor:pointer}',
    '.tcr-chk input{width:20px;height:20px;accent-color:#8fb4ff;margin:0;flex:none}',
    '.tcr-chk small{display:block;font-weight:500;color:#7d8294;font-size:11.5px}',
    '.tcr-bg{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
    '.tcr-bg>button,.tcr-bg label{height:30px;min-width:30px;border-radius:9px;border:2px solid #ffffff24!important;font-size:12px!important;font-weight:600;padding:0 8px!important;display:inline-flex;align-items:center;justify-content:center;position:relative;cursor:pointer}',
    '.tcr-bg>button.on,.tcr-bg label.on{border-color:#8fb4ff!important;box-shadow:0 0 0 2px #8fb4ff55}',
    '.tcr-bg input[type=color]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}',
    '.tcr-info{font-size:12px;color:#b4b8c7;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tcr-warn{position:absolute;left:10px;right:10px;top:44px;font-size:12.5px;color:#ffe3c2;background:#3a2a12e6;border:1px solid #ffb35c88;border-radius:10px;padding:6px 9px;line-height:1.35;pointer-events:none;text-align:center}',
    '.tcr-link{font-size:12.5px!important;color:#8fb4ff!important;text-decoration:underline;text-align:left;align-self:flex-start}',
    '.tcr-btns{grid-column:1/-1;display:flex;gap:8px}',
    '.tcr-btns button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 8px!important;border-radius:13px;background:#222632!important;border:1px solid #ffffff14!important;font-weight:600;font-size:14px!important;white-space:nowrap;min-width:0}',
    '.tcr-btns button:hover{background:#2c3140!important}',
    '.tcr-btns button.main{background:linear-gradient(135deg,#8fb4ff,#b79bff)!important;color:#10131c!important;border:0!important}',
    '.tcr-keys{grid-column:1/-1;font-size:11.5px;color:#7d8294}',
    '.tcr-keys kbd{font:inherit;background:#222632;border:1px solid #ffffff1f;border-radius:5px;padding:0 5px;color:#b4b8c7}',
    '.tcr-err{position:absolute;inset:0;display:grid;place-items:center;color:#ff9a9a;padding:20px;text-align:center}',
    '@media (min-width:900px){.tcr-main{flex-direction:row}.tcr-side{width:340px;flex:none;border-top:0;border-left:1px solid #ffffff14;grid-template-columns:minmax(0,1fr);align-content:start;overflow:auto;padding:16px}',
    '.tcr-pvw,.tcr-opts{grid-row:auto}.tcr-btns{flex-wrap:wrap}.tcr-btns button.main{flex-basis:100%;order:-1;padding:13px 8px!important;font-size:15px!important}}',
    '@media (max-width:899px){.tcr-keys{display:none}}'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fr(n, d) { return n.toFixed(d == null ? 1 : d).replace('.', ','); }

  // Surimpression factice de l'aperçu : heure, icônes, barre des tâches
  function overlay(g, W, H, variant, platform) {
    var d = new Date(), hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    var u = Math.min(W, H) / 100;
    g.save();
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.textBaseline = 'middle';
    g.shadowColor = '#0009'; g.shadowBlur = u * 1.5;
    if (platform === 'pc') {
      var tb = Math.max(6, H * 0.065);
      g.fillStyle = '#1b1f2ad9'; g.fillRect(0, H - tb, W, tb);
      g.shadowBlur = 0;
      for (var i = -3; i <= 3; i++) { g.fillStyle = i === 0 ? '#8fb4ff' : '#ffffffb3'; var s = tb * 0.5; g.fillRect(W / 2 + i * tb * 0.8 - s / 2, H - tb / 2 - s / 2, s, s); }
      g.fillStyle = '#fff'; g.font = '600 ' + Math.round(tb * 0.36) + 'px system-ui,sans-serif'; g.textAlign = 'right';
      g.fillText(hh, W - tb * 0.4, H - tb / 2);
      g.fillStyle = '#ffffffcc';
      for (var j = 0; j < 3; j++) { var ds = W * 0.03; g.fillRect(W * 0.015, H * 0.03 + j * ds * 1.7, ds, ds); }
    } else {
      g.font = '600 ' + Math.round(u * 3.6) + 'px system-ui,sans-serif'; g.textAlign = 'left';
      g.fillText(hh, u * 5, u * 4.5);
      g.textAlign = 'right';
      g.fillRect(W - u * 9, u * 3.2, u * 5, u * 2.6);   // batterie
      g.fillRect(W - u * 16, u * 3.2, u * 4.5, u * 2.6); // réseau
      if (variant === 'lock') {
        g.textAlign = 'center';
        g.font = '300 ' + Math.round(u * 21) + 'px system-ui,sans-serif';
        g.fillText(hh, W / 2, H * 0.2);
        g.font = '500 ' + Math.round(u * 4) + 'px system-ui,sans-serif';
        g.fillText(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), W / 2, H * 0.2 + u * 15);
        g.globalAlpha = 0.85;
        [[0.16, 0.92], [0.84, 0.92]].forEach(function (p) { g.beginPath(); g.arc(W * p[0], H * p[1], u * 6, 0, 7); g.fillStyle = '#ffffff40'; g.fill(); });
        g.fillStyle = '#fff'; g.fillRect(W / 2 - u * 3, H * 0.035 + u * 3, u * 6, u * 4.5); g.lineWidth = u; g.beginPath(); g.arc(W / 2, H * 0.035 + u * 3, u * 2.2, Math.PI, 0); g.stroke();
      } else {
        g.textAlign = 'center';
        g.font = '300 ' + Math.round(u * 11) + 'px system-ui,sans-serif';
        g.fillText(hh, W / 2, H * 0.12);
        var cell = W / 4, ic = cell * 0.56;
        g.globalAlpha = 0.8;
        for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) { g.fillStyle = ['#8fb4ff', '#6fd6a4', '#ffb35c', '#b79bff'][(r + c) % 4]; rr(g, c * cell + (cell - ic) / 2, H * 0.58 + r * cell * 1.1, ic, ic, ic * 0.28); }
        g.fillStyle = '#ffffff33'; rr(g, W * 0.04, H * 0.84, W * 0.92, cell * 0.92, cell * 0.3);
        for (var k = 0; k < 4; k++) { g.fillStyle = '#ffffffd9'; rr(g, k * cell + (cell - ic) / 2, H * 0.84 + (cell * 0.92 - ic) / 2, ic, ic, ic * 0.28); }
        g.fillStyle = '#ffffff40'; rr(g, W * 0.1, H * 0.955, W * 0.8, u * 4.5, u * 2.25);
      }
    }
    g.restore();
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); }

  /* opts : { name, src, ow, oh, sw, sh, entries, auto:{x,y,w,h,fill}, variants:[{id,label}], variant, platform, haptic(), toast() }
     → Promise : null (fermé) ou { entries, changed } */
  function open(o) {
    if (!document.getElementById('tcr-css')) { var st = document.createElement('style'); st.id = 'tcr-css'; st.textContent = CSS; document.head.appendChild(st); }
    return new Promise(function (done) {
      var ow = o.ow, oh = o.oh, sw = o.sw, sh = o.sh, tr = sw / sh;
      var E = JSON.parse(JSON.stringify(o.entries || {}));
      var variants = o.variants && o.variants.length > 1 ? o.variants : null;
      var V = (variants && o.variant) || (variants ? variants[0].id : null);
      var ST = {};              // par variante : {x, y, w, h (pixels de l'image d'origine), free, bg, touched}
      var img = new Image(), loaded = false, avg = '#202430';
      var el = document.createElement('div');
      el.className = 'tcr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Recadrer l\'image');
      el.innerHTML =
        '<div class="tcr-top"><button class="tcr-x" data-a="close" aria-label="Fermer sans enregistrer" title="Fermer sans enregistrer (Échap)">✕</button>' +
        '<div class="tcr-tt"><b>Recadrer</b><span>' + esc(o.name || '') + '</span></div>' +
        (variants ? '<div class="tcr-seg" role="tablist" aria-label="Écran">' + variants.map(function (v) { return '<button role="tab" data-v="' + esc(v.id) + '">' + esc(v.label) + '</button>'; }).join('') + '</div>' : '') + '</div>' +
        '<div class="tcr-main"><div class="tcr-stage" tabindex="0" role="application" aria-label="Zone de recadrage : glisser pour déplacer le cadre, pincer ou molette pour le zoom, flèches et touches plus et moins au clavier">' +
        '<div class="tcr-band" hidden></div><img class="tcr-img" alt="" draggable="false">' +
        '<div class="tcr-frame"><i class="v v1"></i><i class="v v2"></i><i class="h h1"></i><i class="h h2"></i><b data-h="nw"></b><b data-h="ne"></b><b data-h="sw"></b><b data-h="se"></b></div>' +
        '<div class="tcr-zoom"></div><div class="tcr-warn" role="status" hidden></div><div class="tcr-tip">' + (o.platform === 'pc' ? 'Glissez le cadre · molette ou poignées pour la taille' : 'Glisse le cadre · pince à deux doigts pour la taille') + '</div></div>' +
        '<div class="tcr-side"><div class="tcr-pvw"><canvas class="tcr-pv" aria-label="Aperçu de l\'écran"></canvas><div class="tcr-pvcap"></div></div>' +
        '<div class="tcr-opts"><label class="tcr-chk"><input type="checkbox" class="tcr-free"><span>Ajuster au format libre<small>Ratio libre, bandes floues ou de couleur autour</small></span></label>' +
        '<div class="tcr-bg" hidden><button data-bg="blur">Flou</button><button data-bg="avg" title="Couleur moyenne de l\'image">Image</button><button data-bg="#000000" style="background:#000" aria-label="Noir"></button><button data-bg="#ffffff" style="background:#fff" aria-label="Blanc"></button>' +
        '<label title="Autre couleur" aria-label="Autre couleur">🎨<input type="color" class="tcr-col" value="#1b1f2a"></label><button data-a="whole">Image entière</button></div>' +
        '<div class="tcr-info"></div><button class="tcr-link" data-a="unset" hidden>Revenir au recadrage automatique</button></div>' +
        '<div class="tcr-btns"><button data-a="reset" title="Cadre le plus grand possible, centré">Réinitialiser</button><button data-a="auto" title="Repartir du calcul automatique de Toile">Recadrage auto</button><button class="main" data-a="ok">Valider</button></div>' +
        (o.platform === 'pc' ? '<div class="tcr-keys"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> déplacer (<kbd>Maj</kbd> : plus vite) · <kbd>+</kbd> <kbd>−</kbd> zoom · <kbd>Entrée</kbd> valider · <kbd>Échap</kbd> fermer</div>' : '') +
        '</div></div>';
      document.body.appendChild(el);
      var q = function (s) { return el.querySelector(s); };
      var stage = q('.tcr-stage'), im = q('.tcr-img'), frame = q('.tcr-frame'), band = q('.tcr-band'), pv = q('.tcr-pv'), pg = pv.getContext('2d');
      var prevFocus = document.activeElement;
      var view = { k: 1, ox: 0, oy: 0, bx: 0, by: 0 }, frozen = false, raf = 0, edgeOn = false, scrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';

      /* ---- état ---- */
      function toPx(e) { return { x: e.x * ow, y: e.y * oh, w: e.w * ow, h: e.h * oh, free: !!e.free, bg: e.bg || 'blur' }; }
      function autoPx() { return toPx(fromAuto(o.auto, sw, sh, ow, oh)); }
      function init(v) {
        var e = resolve(E, sw, sh, v, ow, oh);
        if (!e && variants) { var ot = variants.filter(function (x) { return x.id !== v && ST[x.id]; })[0]; if (ot) { var s0 = ST[ot.id]; e = { x: s0.x / ow, y: s0.y / oh, w: s0.w / ow, h: s0.h / oh, free: s0.free, bg: s0.bg }; } }
        ST[v] = Object.assign(e ? toPx(e) : autoPx(), { touched: false, manual: !!(e && e.exact) });
      }
      function VK() { return V || '_'; }
      function S() { return ST[VK()]; }
      init(VK());

      /* ---- contraintes ---- */
      function limits(s) {
        if (!s.free) { var mx = Math.min(ow, oh * tr); return { minW: Math.max(mx * 0.06, Math.min(8, mx)), maxW: mx }; }
        return { minW: Math.max(8, Math.min(ow, oh) * 0.04), maxW: ow * 3, maxH: oh * 3 };
      }
      function constrain(s) {
        var L = limits(s), hit = false, x0 = s.x, y0 = s.y;
        if (!s.free) {
          var w = clamp(s.w, L.minW, L.maxW); if (w !== s.w) { hit = w >= L.maxW - 0.01 ? true : hit; }
          var cx = s.x + s.w / 2, cy = s.y + s.h / 2;
          s.w = w; s.h = w / tr; s.x = cx - s.w / 2; s.y = cy - s.h / 2;
          x0 = s.x; y0 = s.y;
          s.x = clamp(s.x, 0, ow - s.w); s.y = clamp(s.y, 0, oh - s.h);
        } else {
          s.w = clamp(s.w, L.minW, L.maxW); s.h = clamp(s.h, L.minW, L.maxH);
          x0 = s.x; y0 = s.y;
          s.x = clamp(s.x, -s.w / 2, ow - s.w / 2); s.y = clamp(s.y, -s.h / 2, oh - s.h / 2);
        }
        if (Math.abs(s.x - x0) > 0.01 || Math.abs(s.y - y0) > 0.01) hit = true;
        return hit;
      }
      function edge(hit) {
        if (hit && !edgeOn && o.haptic) { try { o.haptic(); } catch (e) { } }
        edgeOn = hit; frame.classList.toggle('edge', hit);
      }

      /* ---- affichage ---- */
      function layoutView() {
        var s = S(), Wst = stage.clientWidth, Hst = stage.clientHeight, pad = Wst < 500 ? 32 : 40;
        var bx0 = 0, by0 = 0, bx1 = ow, by1 = oh;
        if (s.free) { bx0 = Math.min(0, s.x); by0 = Math.min(0, s.y); bx1 = Math.max(ow, s.x + s.w); by1 = Math.max(oh, s.y + s.h); }
        var k = Math.min((Wst - pad * 2) / (bx1 - bx0), (Hst - pad * 2) / (by1 - by0));
        if (!(k > 0)) k = 1;
        view = { k: k, ox: (Wst - (bx1 - bx0) * k) / 2 - bx0 * k, oy: (Hst - (by1 - by0) * k) / 2 - by0 * k };
        im.style.width = ow + 'px'; im.style.height = oh + 'px';
        im.style.transform = 'translate(' + view.ox + 'px,' + view.oy + 'px) scale(' + k + ')';
      }
      function paint() {
        raf = 0;
        var s = S();
        drawPreview();            // d'abord : l'aperçu fixe la hauteur du panneau, donc la taille de la zone
        if (!frozen) layoutView();
        var k = view.k, fx = view.ox + s.x * k, fy = view.oy + s.y * k, fw = s.w * k, fh = s.h * k;
        frame.style.width = fw + 'px'; frame.style.height = fh + 'px'; frame.style.transform = 'translate(' + fx + 'px,' + fy + 'px)';
        band.hidden = !s.free;
        if (s.free) { band.style.width = fw + 'px'; band.style.height = fh + 'px'; band.style.transform = 'translate(' + fx + 'px,' + fy + 'px)'; }
        var L = limits(s), z = s.free ? Math.max(ow / s.w, oh / s.h) : L.maxW / s.w;
        q('.tcr-zoom').textContent = (s.free ? 'Format libre · ' : 'Zoom ×') + (s.free ? Math.round(s.w) + '×' + Math.round(s.h) : fr(z));
        // informations et avertissement de flou
        var kw = s.free ? Math.max(0, Math.min(ow, s.x + s.w) - Math.max(0, s.x)) : s.w, kh = s.free ? Math.max(0, Math.min(oh, s.y + s.h) - Math.max(0, s.y)) : s.h;
        var up = s.free ? Math.min(sw / s.w, sh / s.h) : sw / s.w;
        q('.tcr-info').textContent = 'Zone ' + Math.round(kw) + '×' + Math.round(kh) + ' px · écran ' + sw + '×' + sh;
        q('.tcr-info').title = 'Zone gardée de l\'image d\'origine : ' + Math.round(kw) + '×' + Math.round(kh) + ' pixels ; écran : ' + sw + '×' + sh;
        var wn = q('.tcr-warn'), blurry = up > 1.02;
        wn.hidden = !blurry;
        if (blurry) { wn.textContent = '⚠ L\'image sera floue : zone plus petite que l\'écran (×' + fr(up) + ')'; wn.title = 'La zone choisie sera agrandie ×' + fr(up) + ' pour remplir l\'écran : élargissez le cadre pour plus de netteté.'; }
        el.dataset.blurry = blurry ? '1' : '0';
        q('.tcr-free').checked = !!s.free;
        q('.tcr-bg').hidden = !s.free;
        el.querySelectorAll('.tcr-bg [data-bg], .tcr-bg label').forEach(function (b) {
          var v = b.dataset ? b.dataset.bg : null, on = v ? (v === 'avg' ? s.bg === avg : s.bg === v) : (s.bg !== 'blur' && s.bg !== avg && s.bg !== '#000000' && s.bg !== '#ffffff');
          b.classList.toggle('on', on);
        });
        q('[data-bg="avg"]').style.background = avg;
        q('[data-a="unset"]').hidden = !(s.manual && !s.touched);
        if (variants) el.querySelectorAll('.tcr-seg button').forEach(function (b) { var on = b.dataset.v === V; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      }
      function req() { if (!raf) raf = requestAnimationFrame(paint); }
      function drawPreview() {
        var s = S(), maxW = el.clientWidth >= 900 ? 300 : 0, maxH = el.clientWidth >= 900 ? 300 : Math.min(190, Math.max(120, el.clientHeight * 0.2));
        var pw, ph;
        if (maxW && tr >= 1) { pw = maxW; ph = Math.round(pw / tr); } else if (maxW) { ph = maxH; pw = Math.round(ph * tr); if (pw > maxW) { pw = maxW; ph = Math.round(pw / tr); } } else { ph = Math.round(maxH); pw = Math.round(ph * tr); if (pw > el.clientWidth * 0.45) { pw = Math.round(el.clientWidth * 0.45); ph = Math.round(pw / tr); } }
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        if (pv.width !== Math.round(pw * dpr) || pv.height !== Math.round(ph * dpr)) { pv.width = Math.round(pw * dpr); pv.height = Math.round(ph * dpr); pv.style.width = pw + 'px'; pv.style.height = ph + 'px'; }
        var W = pv.width, H = pv.height, g = pg;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = '#181b23'; g.fillRect(0, 0, W, H);
        if (!loaded) return;
        var fx = img.naturalWidth / ow, fy = img.naturalHeight / oh;
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
        if (!s.free) {
          g.drawImage(img, s.x * fx, s.y * fy, s.w * fx, s.h * fy, 0, 0, W, H);
        } else {
          var kx0 = Math.max(0, s.x), ky0 = Math.max(0, s.y), kx1 = Math.min(ow, s.x + s.w), ky1 = Math.min(oh, s.y + s.h);
          if (s.bg === 'blur') {
            var kw = kx1 - kx0, kh = ky1 - ky0, cov = Math.max(W / kw, H / kh), cw = W / cov, ch = H / cov;
            g.save(); g.filter = 'blur(' + Math.round(W / 40) + 'px)';
            g.drawImage(img, (kx0 + (kw - cw) / 2) * fx, (ky0 + (kh - ch) / 2) * fy, cw * fx, ch * fy, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
            g.restore(); g.fillStyle = 'rgba(0,0,0,' + (0x73 / 255) + ')'; g.fillRect(0, 0, W, H);
          } else { g.fillStyle = s.bg; g.fillRect(0, 0, W, H); }
          var sc = Math.min(W / s.w, H / s.h), ox = (W - s.w * sc) / 2, oy = (H - s.h * sc) / 2;
          if (kx1 > kx0 && ky1 > ky0) g.drawImage(img, kx0 * fx, ky0 * fy, (kx1 - kx0) * fx, (ky1 - ky0) * fy, ox + (kx0 - s.x) * sc, oy + (ky0 - s.y) * sc, (kx1 - kx0) * sc, (ky1 - ky0) * sc);
        }
        overlay(g, W, H, V === 'lock' ? 'lock' : 'home', o.platform);
        q('.tcr-pvcap').textContent = (variants ? (V === 'lock' ? 'Verrouillage' : 'Accueil') + ' · ' : 'Aperçu · ') + sw + '×' + sh;
      }

      /* ---- gestes ---- */
      var P = new Map(), G = null;
      function imgPt(cx, cy) { var b = stage.getBoundingClientRect(); return { x: (cx - b.left - view.ox) / view.k, y: (cy - b.top - view.oy) / view.k }; }
      function touch(s) { s.touched = true; s.manual = false; }
      function startGesture() {
        var s = S(), pts = Array.from(P.values());
        if (pts.length >= 2) {
          var a = pts[0], b = pts[1];
          G = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: imgPt((a.x + b.x) / 2, (a.y + b.y) / 2), r0: { x: s.x, y: s.y, w: s.w, h: s.h } };
        } else if (pts.length === 1) {
          var p = pts[0];
          G = { kind: p.h ? 'resize' : 'move', h: p.h, p0: imgPt(p.x, p.y), r0: { x: s.x, y: s.y, w: s.w, h: s.h } };
        } else G = null;
      }
      stage.addEventListener('pointerdown', function (e) {
        if (e.button > 0) return;
        e.preventDefault();
        try { stage.setPointerCapture(e.pointerId); } catch (x) { }
        var hd = e.target.closest && e.target.closest('[data-h]');
        P.set(e.pointerId, { x: e.clientX, y: e.clientY, h: hd ? hd.dataset.h : null });
        frozen = true; stage.classList.add('drag'); q('.tcr-tip').style.opacity = 0;
        startGesture();
        if (document.activeElement !== stage) stage.focus({ preventScroll: true });
      });
      stage.addEventListener('pointermove', function (e) {
        var p = P.get(e.pointerId); if (!p || !G) return;
        p.x = e.clientX; p.y = e.clientY;
        var s = S(), r0 = G.r0, pts = Array.from(P.values());
        if (G.kind === 'move') {
          var c = imgPt(p.x, p.y); s.x = r0.x + (c.x - G.p0.x); s.y = r0.y + (c.y - G.p0.y);
        } else if (G.kind === 'resize') {
          var c2 = imgPt(p.x, p.y), h = G.h;
          var ax = h[1] === 'w' ? r0.x + r0.w : r0.x, ay = h[0] === 'n' ? r0.y + r0.h : r0.y;
          var dw = Math.abs(c2.x - ax), dh = Math.abs(c2.y - ay);
          var sx = h[1] === 'w' ? -1 : 1, sy = h[0] === 'n' ? -1 : 1;
          if (!s.free) {
            var L = limits(s), mxw = Math.min(sx > 0 ? ow - ax : ax, (sy > 0 ? oh - ay : ay) * tr, L.maxW);
            var w = clamp(Math.max(dw, dh * tr), L.minW, Math.max(L.minW, mxw));
            edge(w >= mxw - 0.01);
            s.w = w; s.h = w / tr;
          } else { var L2 = limits(s); s.w = clamp(dw, L2.minW, L2.maxW); s.h = clamp(dh, L2.minW, L2.maxH); }
          s.x = sx > 0 ? ax : ax - s.w; s.y = sy > 0 ? ay : ay - s.h;
          touch(s);
          var hit0 = constrain(s); if (s.free) edge(hit0);
          req(); return;
        } else if (G.kind === 'pinch' && pts.length >= 2) {
          var a = pts[0], b = pts[1], f = Math.hypot(a.x - b.x, a.y - b.y) / G.d0, m = imgPt((a.x + b.x) / 2, (a.y + b.y) / 2);
          // agrandi autour du milieu des doigts, puis déplacé avec eux
          s.w = r0.w * f; s.h = r0.h * f;
          s.x = G.m0.x + (r0.x - G.m0.x) * f + (m.x - G.m0.x); s.y = G.m0.y + (r0.y - G.m0.y) * f + (m.y - G.m0.y);
          if (!s.free) { var L3 = limits(s), w3 = clamp(s.w, L3.minW, L3.maxW); if (w3 !== s.w) { var c3x = s.x + s.w / 2, c3y = s.y + s.h / 2; s.w = w3; s.h = w3 / tr; s.x = c3x - s.w / 2; s.y = c3y - s.h / 2; } }
        }
        touch(s);
        edge(constrain(s));
        req();
      });
      function up(e) {
        if (!P.has(e.pointerId)) return;
        P.delete(e.pointerId);
        if (P.size) { startGesture(); return; }
        G = null; frozen = false; stage.classList.remove('drag'); edge(false); req();
      }
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up); stage.addEventListener('lostpointercapture', up);
      stage.addEventListener('wheel', function (e) {
        e.preventDefault();
        var f = Math.exp(clamp(e.deltaY, -120, 120) * 0.0018);
        zoomBy(f, imgPt(e.clientX, e.clientY));
      }, { passive: false });
      function zoomBy(f, at) {
        var s = S(); at = at || { x: s.x + s.w / 2, y: s.y + s.h / 2 };
        var nw = s.w * f, nh = s.h * f;
        if (!s.free) { var L = limits(s); nw = clamp(nw, L.minW, L.maxW); nh = nw / tr; } else { var L2 = limits(s); nw = clamp(nw, L2.minW, L2.maxW); nh = clamp(nh, L2.minW, L2.maxH); }
        var fx = nw / s.w, fy = nh / s.h;
        s.x = at.x - (at.x - s.x) * fx; s.y = at.y - (at.y - s.y) * fy; s.w = nw; s.h = nh;
        touch(s); var hit = constrain(s); edge(hit); setTimeout(function () { if (!G) edge(false); }, 250);
        req();
      }
      function moveBy(dx, dy) { var s = S(); s.x += dx; s.y += dy; touch(s); var hit = constrain(s); edge(hit); setTimeout(function () { if (!G) edge(false); }, 250); req(); }

      /* ---- boutons et clavier ---- */
      function close(res) {
        cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', req); if (RO) RO.disconnect();
        el.remove(); document.documentElement.style.overflow = ''; window.scrollTo(0, scrollY);
        if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { }
        T._open = null;
        done(res);
      }
      function entry(s) {
        var r6 = function (v) { return Math.round(v * 1e6) / 1e6; };
        var e = { x: r6(s.x / ow), y: r6(s.y / oh), w: r6(s.w / ow), h: r6(s.h / oh), at: Date.now() };
        if (s.free) { e.free = true; e.bg = s.bg || 'blur'; }
        return e;
      }
      function validate() {
        var s = S(); s.touched = true;
        Object.keys(ST).forEach(function (v) { if (ST[v].touched) E[key(sw, sh, v === '_' ? null : v)] = entry(ST[v]); });
        close({ entries: E, changed: true, key: key(sw, sh, V) });
      }
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var a = b.dataset.a, s = S();
        if (b.dataset.v && variants) { V = b.dataset.v; if (!ST[V]) init(V); edge(false); req(); return; }
        if (b.dataset.bg) { s.bg = b.dataset.bg === 'avg' ? avg : b.dataset.bg; touch(s); req(); return; }
        if (a === 'close') return close(null);
        if (a === 'ok') return validate();
        if (a === 'reset') { var m = toPx(maxRect(sw, sh, ow, oh)); Object.assign(s, m); touch(s); req(); return; }
        if (a === 'auto') { Object.assign(s, autoPx()); touch(s); req(); return; }
        if (a === 'whole') { s.x = 0; s.y = 0; s.w = ow; s.h = oh; touch(s); req(); return; }
        if (a === 'unset') { delete E[key(sw, sh, V)]; close({ entries: E, changed: true, unset: true, key: key(sw, sh, V) }); return; }
      });
      q('.tcr-free').addEventListener('change', function (e) {
        var s = S();
        if (e.target.checked) { s.free = true; }
        else {
          var r = refit({ x: s.x / ow, y: s.y / oh, w: s.w / ow, h: s.h / oh }, sw, sh, ow, oh);
          var c = toPx(r); s.x = c.x; s.y = c.y; s.w = c.w; s.h = c.h; s.free = false;
        }
        touch(s); constrain(s); req();
      });
      q('.tcr-col').addEventListener('input', function (e) { var s = S(); s.bg = e.target.value; touch(s); req(); });
      function onKey(e) {
        if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'color' && e.key !== 'Escape') return;
        var s = S(), big = e.shiftKey ? 0.1 : 0.02, k = e.key;
        if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); return; }
        if (k === 'ArrowLeft') moveBy(-s.w * big, 0);
        else if (k === 'ArrowRight') moveBy(s.w * big, 0);
        else if (k === 'ArrowUp') moveBy(0, -s.h * big);
        else if (k === 'ArrowDown') moveBy(0, s.h * big);
        else if (k === '+' || k === '=' || k === 'Add') zoomBy(1 / 1.1);
        else if (k === '-' || k === '_' || k === 'Subtract') zoomBy(1.1);
        else if (k === 'Enter' && (e.target === stage || e.target === el || e.target === document.body)) validate();
        else return;
        e.preventDefault(); e.stopPropagation();
      }
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', req);
      var RO = window.ResizeObserver ? new ResizeObserver(function () { if (!frozen) req(); }) : null;
      if (RO) RO.observe(stage);
      setTimeout(function () { var t = q('.tcr-tip'); if (t) t.style.opacity = 0; }, 3500);

      img.onload = function () {
        loaded = true;
        try { var c = document.createElement('canvas'); c.width = c.height = 1; var g = c.getContext('2d'); g.drawImage(img, 0, 0, 1, 1); var d = g.getImageData(0, 0, 1, 1).data; avg = '#' + [d[0], d[1], d[2]].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); } catch (x) { }
        im.src = img.src; req();
      };
      img.onerror = function () { var d = document.createElement('div'); d.className = 'tcr-err'; d.textContent = 'Image illisible : impossible de l\'afficher pour la recadrer.'; stage.appendChild(d); };
      img.src = o.src;
      constrain(S()); req();
      stage.focus({ preventScroll: true });
      T._open = { state: function () { var s = S(); return { x: s.x, y: s.y, w: s.w, h: s.h, free: s.free, bg: s.bg, variant: V, view: view, ow: ow, oh: oh, sw: sw, sh: sh }; }, close: function () { close(null); } };
    });
  }

  T.key = key; T.resolve = resolve; T.refit = refit; T.fromAuto = fromAuto; T.maxRect = maxRect; T.count = count; T.valid = valid; T.open = open; T.overlay = overlay;
  root.TCROP = T;
})(typeof window !== 'undefined' ? window : this);
