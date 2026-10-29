/* Présentation — interface : ruban (onglets et onglets contextuels), volets (format, arrière-plan, animations,
   commentaires, rechercher/remplacer, accessibilité, sélection), miniatures, trieuse, barre d'état. */
(function () {
  'use strict';
  const O = window.Office, RT = O.RichText, P = window.Pres, A = window.PresApp, T = O.Themes, C = A.cmd;
  const $ = (s) => document.querySelector(s);
  const one = () => A.one();
  const selType = (...types) => A.sel.length > 0 && A.selEls().every((e) => types.indexOf(e.type) >= 0);
  const hasSel = () => A.sel.length > 0;
  const textish = () => !!A.editing || selType('text', 'shape') || !!A.tableSel;
  const palette = () => T.palette(A.theme());
  const pick = (ctx, anchor, apply, opt) => O.colorPicker(anchor, Object.assign({ theme: palette(), onPick: apply }, opt || {}));
  const colorCss = (ref) => T.resolve(ref, A.theme()) || ref;
  const shapeSvg = (id, s) => { s = s || 22; if (P.isLineShape(id)) return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '"><path d="' + (/^elbow/.test(id) ? 'M3,5 H12 V19 H21' : /^curve/.test(id) ? 'M3,5 C12,5 12,19 21,19' : 'M3,21 L21,3') + '" fill="none" stroke="currentColor" stroke-width="1.6"' + (/Arrow|Double/.test(id) ? ' marker-end="url(#ah)"' : '') + '/><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10Z" fill="currentColor"/></marker></defs></svg>'; if (id === 'freeform') return O.icon('pencil'); return '<svg viewBox="-1 -1 26 26" width="' + s + '" height="' + s + '">' + P.shapeParts(id, 24, id === 'wave' || /Arrow$/.test(id) && !/up|down/i.test(id) || id === 'chevron' || id === 'homePlate' || id === 'ribbon2' ? 16 : 24).map((p) => '<path d="' + p.d + '" fill="' + (p.fill === 'none' ? 'none' : 'currentColor') + '" fill-opacity="' + (p.fill === 'darken' ? 0.55 : p.fill === 'lighten' ? 0.15 : 0.3) + '" fill-rule="evenodd" stroke="currentColor" stroke-width="1.2"' + (id === 'wave' || /Arrow$/.test(id) && !/up|down/i.test(id) || id === 'chevron' || id === 'homePlate' || id === 'ribbon2' ? ' transform="translate(0 4)"' : '') + '/>').join('') + '</svg>'; };
  A.shapeSvg = shapeSvg;
  function shapesMenu(onPick) {
    const node = O.h('div', { cls: 'o-gal-pop' });
    node.innerHTML = P.SHAPE_CATS.map((c) => '<div class="o-cp-lbl">' + c[1] + '</div><div class="sh-grid">' + P.SHAPES.filter((s) => s.cat === c[0]).map((s) => '<button type="button" data-s="' + s.id + '" title="' + O.esc(s.name) + '">' + shapeSvg(s.id) + '</button>').join('') + '</div>').join('');
    node.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { O.closeMenu(); onPick(b.dataset.s); } });
    return [{ node }];
  }
  A.shapesMenu = shapesMenu;
  const layoutPv = (id) => { const W = 160, H = 90; return '<div class="lay-pv">' + P.layoutBoxes(id, W, H).map((b) => '<i class="' + (P.isTitlePh(b.ph) ? 't' : '') + '" style="left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px"></i>').join('') + '</div>'; };
  function layoutMenu(apply) {
    const node = O.h('div', { cls: 'o-gal-pop', style: { '--gw': '120px', '--gh': '90px' } });
    node.innerHTML = '<div class="o-gal-grid">' + P.LAYOUTS.map((l) => '<button type="button" class="o-gal-it" data-l="' + l.id + '" title="' + O.esc(l.name) + '" style="width:120px;height:92px;display:flex;flex-direction:column"><div style="flex:1;transform:scale(.75);transform-origin:0 0;width:160px;height:90px">' + layoutPv(l.id) + '</div><small style="padding:2px 4px;font-size:10.5px">' + O.esc(l.name) + '</small></button>').join('') + '</div>';
    node.addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b) { O.closeMenu(); apply(b.dataset.l); } });
    return [{ node }];
  }
  /* ---------------- valeurs courantes ---------------- */
  const ts = () => A.textState();
  const fontOptions = () => { const t = A.theme(); const l = [['var(--t-major)', t.fonts.major + ' (titres)', 'font-family:' + O.fontStack(t.fonts.major), 'Police du thème'], ['var(--t-minor)', t.fonts.minor + ' (corps)', 'font-family:' + O.fontStack(t.fonts.minor), 'Police du thème']]; O.FONTS.forEach((f) => l.push([f[1], f[0], 'font-family:' + f[1], O.fontAvailable(f[0]) ? '' : 'remplacée sur cet appareil'])); return l; };
  const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 120, 144];
  /* ---------------- styles rapides des formes ---------------- */
  function quickStyles() {
    const out = [];
    for (let i = 1; i <= 6; i++) out.push({ id: 's' + i, title: 'Rempli, accent ' + i, apply: { fill: { type: 'solid', color: 't:accent' + i }, line: { color: 't:accent' + i + '/-25', w: 1.5 }, txColor: 't:lt1' } });
    for (let i = 1; i <= 6; i++) out.push({ id: 'o' + i, title: 'Contour, accent ' + i, apply: { fill: { type: 'solid', color: 't:bg1' }, line: { color: 't:accent' + i, w: 2.25 }, txColor: 't:accent' + i + '/-25' } });
    for (let i = 1; i <= 6; i++) out.push({ id: 'l' + i, title: 'Clair, accent ' + i, apply: { fill: { type: 'solid', color: 't:accent' + i + '/+80' }, line: null, txColor: 't:accent' + i + '/-50' } });
    for (let i = 1; i <= 6; i++) out.push({ id: 'g' + i, title: 'Dégradé, accent ' + i, apply: { fill: { type: 'gradient', kind: 'linear', angle: 180, stops: [{ c: 't:accent' + i + '/+40', p: 0 }, { c: 't:accent' + i + '/-25', p: 100 }] }, line: null, txColor: 't:lt1', shadow: { color: '#000000', blur: 6, x: 0, y: 3, alpha: 0.3 } } });
    out.push({ id: 'n0', title: 'Sans remplissage ni contour', apply: { fill: null, line: null, txColor: 't:tx1', shadow: null } });
    return out.map((q) => Object.assign(q, { html: '<div style="width:100%;height:100%;padding:5px"><div style="width:100%;height:100%;border-radius:4px;display:flex;align-items:center;justify-content:center;font:700 13px system-ui;' + previewCss(q.apply) + '">Abc</div></div>' }));
  }
  function previewCss(a) {
    let s = '';
    if (a.fill && a.fill.type === 'solid') s += 'background:' + colorCss(a.fill.color) + ';';
    else if (a.fill && a.fill.type === 'gradient') s += 'background:linear-gradient(180deg,' + a.fill.stops.map((x) => colorCss(x.c) + ' ' + x.p + '%').join(',') + ');';
    else s += 'background:transparent;';
    if (a.line) s += 'border:2px solid ' + colorCss(a.line.color) + ';'; else s += 'border:1px dashed #9996;';
    s += 'color:' + colorCss(a.txColor || 't:tx1') + ';';
    if (a.shadow) s += 'box-shadow:0 2px 5px #0005;';
    return s;
  }
  const picStyles = () => [
    { id: 'none', title: 'Aucun', apply: { line: null, shadow: null, mask: null } },
    { id: 'white', title: 'Cadre blanc épais', apply: { line: { color: '#FFFFFF', w: 8 }, shadow: { color: '#000000', blur: 10, x: 0, y: 4, alpha: 0.35 }, mask: null } },
    { id: 'thin', title: 'Bordure fine', apply: { line: { color: 't:tx1', w: 1 }, shadow: null, mask: null } },
    { id: 'shadow', title: 'Ombre portée', apply: { line: null, shadow: { color: '#000000', blur: 18, x: 6, y: 8, alpha: 0.4 }, mask: null } },
    { id: 'round', title: 'Coins arrondis', apply: { line: null, shadow: { color: '#000000', blur: 10, x: 0, y: 4, alpha: 0.3 }, mask: 'roundRect' } },
    { id: 'oval', title: 'Ovale', apply: { line: { color: 't:accent1', w: 3 }, shadow: null, mask: 'ellipse' } },
    { id: 'accent', title: 'Bordure accent', apply: { line: { color: 't:accent1', w: 6 }, shadow: null, mask: null } },
    { id: 'hex', title: 'Hexagone', apply: { line: null, shadow: null, mask: 'hexagon' } },
    { id: 'diamond', title: 'Losange', apply: { line: null, shadow: null, mask: 'diamond' } }
  ].map((p) => Object.assign(p, { html: '<div style="width:100%;height:100%;padding:6px"><div style="width:100%;height:100%;background:linear-gradient(135deg,#8fb3d9,#e3a36b);' + (p.apply.mask === 'ellipse' ? 'border-radius:50%;' : p.apply.mask === 'roundRect' ? 'border-radius:8px;' : p.apply.mask === 'hexagon' ? 'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);' : p.apply.mask === 'diamond' ? 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);' : '') + (p.apply.line ? 'border:' + Math.max(1, p.apply.line.w / 2) + 'px solid ' + colorCss(p.apply.line.color) + ';' : '') + (p.apply.shadow ? 'box-shadow:2px 3px 6px #0006;' : '') + '"></div></div>' }));
  const TSTYLES = [];
  ['none', 'light', 'medium', 'dark', 'grid'].forEach((k) => { for (let a = 1; a <= 6; a++) { if (k === 'none' && a > 1) continue; TSTYLES.push({ id: k + a, kind: k, accent: a, title: { none: 'Sans style', light: 'Clair', medium: 'Moyen', dark: 'Foncé', grid: 'Grille' }[k] + (k === 'none' ? '' : ', accent ' + a) }); } });
  function tstyleHtml(s) {
    const e = { tstyle: { id: s.kind, accent: s.accent, header: true, banded: true }, rows: [0, 1, 2, 3].map(() => ({ cells: [{}, {}, {}] })) };
    let h = '<div class="tstyle">';
    for (let r = 0; r < 4; r++) { h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px">'; for (let c = 0; c < 3; c++) { const cs = P.tableCellStyle(e, r, c, A.doc); h += '<i style="background:' + (cs.bg || 'transparent') + ';border:1px solid ' + (cs.border || '#ccc') + '"></i>'; } h += '</div>'; }
    return h + '</div>';
  }
  /* ---------------- animations : ajouter / modifier ---------------- */
  const selAnim = () => { const s = A.slide(); return (s.anims || []).find((a) => a.id === A.animSel) || (A.sel.length === 1 ? (s.anims || []).filter((a) => a.el === A.sel[0]).slice(-1)[0] : null); };
  A.selAnim = selAnim;
  C.addAnim = function (cat, fx, replace) {
    const s = A.doc.slides[A.cur]; if (!s || !A.sel.length) { O.toast('Sélectionnez d\'abord un objet à animer'); return; }
    s.anims = s.anims || [];
    A.sel.forEach((id, k) => {
      const ex = s.anims.filter((a) => a.el === id);
      if (replace !== false && ex.length) { const a = ex[ex.length - 1]; a.cat = cat; a.fx = fx; if (!P.ANIM_DIRS[fx]) delete a.dir; else a.dir = a.dir || (cat === 'out' ? 'b' : 'b'); A.animSel = a.id; }
      else { const a = { id: P.uid('a'), el: id, cat, fx, start: k === 0 ? 'click' : 'with', delay: 0, dur: fx === 'appear' || fx === 'disappear' ? 0 : 0.5 }; if (P.ANIM_DIRS[fx]) a.dir = 'b'; s.anims.push(a); A.animSel = a.id; }
    });
    A.change('Animation'); A.cmd.previewAnim(A.animSel);
  };
  C.animProp = function (k, v) { const a = selAnim(); if (!a) return; a[k] = v; A.change('Animation'); };
  C.animMove = function (dir) { const s = A.doc.slides[A.cur], a = selAnim(); if (!a) return; const i = s.anims.indexOf(a), j = i + dir; if (j < 0 || j >= s.anims.length) return; s.anims.splice(i, 1); s.anims.splice(j, 0, a); A.change('Ordre des animations'); };
  C.animDel = function () { const s = A.doc.slides[A.cur], a = selAnim(); if (!a) return; s.anims.splice(s.anims.indexOf(a), 1); A.animSel = null; A.change('Supprimer l\'animation'); };
  function animGallery() {
    const g = [];
    P.ANIMS.in.forEach((x) => g.push({ id: 'in:' + x[0], title: 'Entrée : ' + x[1], html: '<div class="tr-gal" style="color:#2F9E44">' + O.icon(ANIM_IC[x[0]] || 'star') + '<span style="color:var(--o-tx)">' + x[1] + '</span></div>' }));
    P.ANIMS.em.forEach((x) => g.push({ id: 'em:' + x[0], title: 'Emphase : ' + x[1], html: '<div class="tr-gal" style="color:#E8A400">' + O.icon(ANIM_IC[x[0]] || 'star') + '<span style="color:var(--o-tx)">' + x[1] + '</span></div>' }));
    P.ANIMS.out.forEach((x) => g.push({ id: 'out:' + x[0], title: 'Sortie : ' + x[1], html: '<div class="tr-gal" style="color:#E03131">' + O.icon(ANIM_IC[x[0]] || 'star') + '<span style="color:var(--o-tx)">' + x[1] + '</span></div>' }));
    return g;
  }
  const ANIM_IC = { appear: 'square', fade: 'blend', fly: 'arrow-up-from-line', float: 'move-up', zoom: 'zoom-in', wipe: 'move-right', split: 'columns-2', bounce: 'circle-arrow-down', growTurn: 'rotate-cw-square', swivel: 'refresh-cw', pulse: 'activity', spin: 'rotate-cw', grow: 'maximize-2', teeter: 'waves', blink: 'lightbulb', colorPulse: 'palette', disappear: 'square-dashed', fadeOut: 'blend', flyOut: 'arrow-down-to-line', floatOut: 'move-down', zoomOut: 'zoom-out', wipeOut: 'move-left', shrinkTurn: 'rotate-ccw-square' };
  /* ---------------- transitions ---------------- */
  C.setTransition = function (patch, all) {
    const ids = all ? A.doc.slides.map((s) => s.id) : (A.selSlides.length ? A.selSlides : [A.doc.slides[A.cur].id]);
    ids.forEach((id) => { const s = A.doc.slides[P.slideIndex(A.doc, id)]; if (s) s.transition = Object.assign({ type: 'none', dur: 0.7, dir: 'l' }, s.transition, patch); });
    A.change(all ? 'Transition appliquée partout' : 'Transition');
    if (patch.type && patch.type !== 'none' && !all) A.cmd.previewTransition();
  };
  C.setAdvance = function (patch) { const ids = A.selSlides.length ? A.selSlides : [A.doc.slides[A.cur].id]; ids.forEach((id) => { const s = A.doc.slides[P.slideIndex(A.doc, id)]; if (s) s.advance = Object.assign({ click: true, after: null }, s.advance, patch); }); A.change('Minutage'); };
  /* ---------------- thème, taille ---------------- */
  C.theme = function (id) { A.doc.theme = { id }; A.change('Thème'); O.Raster && O.Raster.resetCss(); };
  C.themeColors = function (fromId) { const src = T.get(fromId); A.doc.theme = Object.assign({}, A.doc.theme, { colors: Object.assign({}, src.colors), dark: src.dark }); A.change('Couleurs du thème'); };
  C.themeFonts = function (pair) { A.doc.theme = Object.assign({}, A.doc.theme, { fonts: { major: pair[0], minor: pair[1] } }); A.change('Polices du thème'); };
  C.customColors = function () {
    const t = A.theme(); const keys = [['dk1', 'Texte / arrière-plan foncé 1'], ['lt1', 'Texte / arrière-plan clair 1'], ['dk2', 'Foncé 2'], ['lt2', 'Clair 2'], ['accent1', 'Accent 1'], ['accent2', 'Accent 2'], ['accent3', 'Accent 3'], ['accent4', 'Accent 4'], ['accent5', 'Accent 5'], ['accent6', 'Accent 6'], ['hlink', 'Lien hypertexte']];
    O.form('Couleurs du thème personnalisées', keys.map((k) => ({ id: k[0], label: k[1], type: 'color', value: t.colors[k[0]], half: true })).concat([{ id: 'dark', type: 'check', label: 'Fond foncé (texte clair)', value: !!t.dark }]), { wide: true, ok: 'Enregistrer' }).then((r) => {
      if (!r) return; const colors = {}; keys.forEach((k) => { colors[k[0]] = r[k[0]].toUpperCase(); });
      A.doc.theme = Object.assign({}, A.doc.theme, { colors, dark: r.dark });
      const ck = T.check(P.theme(A.doc)).filter((c) => !c.ok); A.change('Couleurs du thème');
      if (ck.length) O.toast('Attention : contraste insuffisant (' + ck.map((c) => c.label + ' ' + String(c.ratio).replace('.', ',')).join(' ; ') + ')', { bad: true, ms: 7000 });
    });
  };
  C.slideSize = function (id) {
    let sz = P.SIZES.find((s) => s.id === id);
    const go = (w, h, name) => {
      const ow = A.doc.size.w, oh = A.doc.size.h; if (w === ow && h === oh) return;
      O.dialog({ title: 'Taille des diapositives', body: '<p>Le contenu doit-il être agrandi au maximum ou réduit pour tenir sur les nouvelles diapositives ?</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Ajuster', value: 'fit' }, { label: 'Agrandir au maximum', value: 'max', primary: true }] }).then((mode) => {
        if (!mode) return;
        const kx = w / ow, ky = h / oh, k = mode === 'fit' ? Math.min(kx, ky) : Math.max(kx, ky);
        const dx = (w - ow * k) / 2, dy = (h - oh * k) / 2;
        const scaleEl = (e, top) => { e.x = (top ? dx : 0) + e.x * k; e.y = (top ? dy : 0) + e.y * k; e.w *= k; e.h *= k; if (e.cols) e.cols = e.cols.map((c) => c * k); if (e.rows) e.rows.forEach((r) => { r.h = (r.h || 40) * k; }); if (e.children) e.children.forEach((c) => scaleEl(c, false)); };
        A.doc.size = { w, h, name };
        A.doc.slides.forEach((s) => s.elements.forEach((e) => { if (e.ph) { const b = P.layoutBoxes(s.layout, w, h).find((x) => x.ph === e.ph); if (b && !e.moved) { Object.assign(e, { x: b.x, y: b.y, w: b.w, h: b.h }); return; } } scaleEl(e, true); }));
        (A.doc.master.elements || []).forEach((e) => scaleEl(e, true));
        A.thumbsReset = true; A.change('Taille des diapositives'); A.renderThumbs(true); A.setZoom('fit');
      });
    };
    if (sz) { go(sz.w, sz.h, sz.id); return; }
    O.form('Taille personnalisée', [{ id: 'w', type: 'number', label: 'Largeur (cm)', value: O.round(A.doc.size.w / 96 * 2.54, 2), min: 2, max: 140, step: 0.01, half: true }, { id: 'h', type: 'number', label: 'Hauteur (cm)', value: O.round(A.doc.size.h / 96 * 2.54, 2), min: 2, max: 140, step: 0.01, half: true }], { validate: (r) => (!(r.w > 1) || !(r.h > 1)) ? 'Dimensions incorrectes' : null }).then((r) => { if (r) go(Math.round(r.w / 2.54 * 96), Math.round(r.h / 2.54 * 96), 'custom'); });
  };
  C.headerFooter = function () {
    const m = A.doc.master;
    O.form('En-tête et pied de page', [
      { id: 'date', type: 'check', label: 'Date', value: m.date.show }, { id: 'fixed', type: 'text', label: 'Date fixe (vide = date du jour)', value: m.date.fixed || '' },
      { id: 'num', type: 'check', label: 'Numéro de diapositive', value: m.number.show }, { id: 'first', type: 'number', label: 'Numéroter à partir de', value: A.doc.settings.firstNumber || 1, min: 0 },
      { id: 'foot', type: 'check', label: 'Pied de page', value: m.footer.show }, { id: 'text', type: 'text', label: 'Texte du pied de page', value: m.footer.text || '' },
      { id: 'hide', type: 'check', label: 'Ne pas afficher sur la diapositive de titre', value: m.hideOnTitle }
    ], { ok: 'Appliquer partout' }).then((r) => { if (!r) return; m.date.show = r.date; m.date.fixed = r.fixed; m.number.show = r.num; A.doc.settings.firstNumber = r.first || 0; m.footer.show = r.foot; m.footer.text = r.text; m.hideOnTitle = r.hide; A.change('En-tête et pied de page'); });
  };
  C.logo = async function () {
    const m = A.doc.master;
    if (m.logo.media) {
      const r = await O.form('Logo du masque', [{ id: 'show', type: 'check', label: 'Afficher le logo', value: m.logo.show }, { id: 'pos', type: 'select', label: 'Position', value: m.logo.pos, options: [['tr', 'En haut à droite'], ['tl', 'En haut à gauche'], ['br', 'En bas à droite'], ['bl', 'En bas à gauche'], ['bc', 'En bas au centre']] }, { id: 'w', type: 'number', label: 'Largeur (px)', value: m.logo.w, min: 20, max: 600 }, { id: 'title', type: 'check', label: 'Aussi sur la diapositive de titre', value: m.logo.onTitle !== false }, { id: 'change', type: 'check', label: 'Choisir une autre image', value: false }, { id: 'del', type: 'check', label: 'Retirer le logo', value: false }]);
      if (!r) return;
      if (r.del) { m.logo.media = null; A.change('Logo retiré'); return; }
      Object.assign(m.logo, { show: r.show, pos: r.pos, w: r.w, onTitle: r.title });
      if (!r.change) { A.change('Logo'); return; }
    }
    const f = (await O.Files.pickMedia('image/*', false))[0]; if (!f) return;
    const d = await P.imageSize(f);
    m.logo.media = P.addMedia(A.doc, f, f.name, { w: d.w, h: d.h }); m.logo.show = true; A.change('Logo');
  };
  C.masterStyles = function () {
    const st = A.doc.master.styles; const fonts = [['major', 'Police des titres du thème'], ['minor', 'Police du corps du thème']].concat(O.FONTS.map((f) => [f[0], f[0]]));
    O.form('Styles du masque', [
      { id: 'tf', type: 'select', label: 'Titre : police', value: st.title.font, options: fonts, half: true }, { id: 'ts', type: 'number', label: 'Titre : taille (pt)', value: st.title.size, min: 8, max: 120, half: true },
      { id: 'tb', type: 'check', label: 'Titres en gras', value: st.title.bold }, { id: 'tc', type: 'check', label: 'Titres en majuscules', value: st.title.caps },
      { id: 'ta', type: 'select', label: 'Titre : alignement', value: st.title.align, options: [['left', 'Gauche'], ['center', 'Centré'], ['right', 'Droite']], half: true }, { id: 'cs', type: 'number', label: 'Titre de la diapo de titre (pt)', value: st.ctitle.size, min: 8, max: 160, half: true },
      { id: 'bf', type: 'select', label: 'Corps : police', value: st.body.font, options: fonts, half: true }, { id: 'bs', type: 'number', label: 'Corps : taille (pt)', value: st.body.size, min: 8, max: 80, half: true },
      { id: 'bl', type: 'number', label: 'Interligne du corps', value: st.body.lineHeight || 1.15, min: 0.8, max: 3, step: 0.05, half: true }, { id: 'bu', type: 'select', label: 'Puces', value: st.body.bullet || 'disc', options: [['disc', '● Disque'], ['circle', '○ Cercle'], ['square', '■ Carré'], ['dash', '– Tiret'], ['arrow', '➤ Flèche'], ['check', '✔ Coche'], ['diamond', '◆ Losange']], half: true },
      { id: 'ss', type: 'number', label: 'Sous-titre (pt)', value: st.subtitle.size, min: 8, max: 80, half: true }
    ], { wide: true, ok: 'Appliquer' }).then((r) => {
      if (!r) return;
      Object.assign(st.title, { font: r.tf, size: r.ts, bold: r.tb, caps: r.tc, align: r.ta }); Object.assign(st.ctitle, { font: r.tf, size: r.cs, caps: r.tc });
      Object.assign(st.body, { font: r.bf, size: r.bs, lineHeight: r.bl, bullet: r.bu }); Object.assign(st.subtitle, { font: r.bf, size: r.ss });
      A.change('Styles du masque');
    });
  };
  /* ---------------- ruban ---------------- */
  const TABS = [];
  const sel = (fn) => fn;
  TABS.push({ id: 'home', label: 'Accueil', groups: [
    { label: 'Presse-papiers', items: [
      { type: 'split', id: 'paste', icon: 'clipboard-paste', label: 'Coller', size: 'lg', kbd: 'mod+v', on: () => { if (A.clip) A.pasteClip(); else if (navigator.clipboard && navigator.clipboard.read) pasteFromSystem(); else O.toast('Utilisez Ctrl+V'); }, menu: () => [{ label: 'Coller', icon: 'clipboard-paste', on: () => A.pasteClip(), disabled: !A.clip }, { label: 'Coller le texte seul', icon: 'type', on: () => pasteFromSystem(true) }, { label: 'Coller les diapositives', icon: 'gallery-vertical', disabled: !A.slideClip, on: () => C.pasteSlides() }] },
      { type: 'col', items: [{ id: 'cut', icon: 'scissors', label: 'Couper', kbd: 'mod+x', disabled: () => !hasSel(), on: () => { A.copySel(true); } }, { id: 'copy', icon: 'copy', label: 'Copier', kbd: 'mod+c', disabled: () => !hasSel(), on: () => { A.copySel(false); O.toast('Copié', { ms: 900 }); } }, { id: 'painter', icon: 'paintbrush', label: 'Reproduire la mise en forme', title: 'Reproduire la mise en forme (double-clic : plusieurs fois)', active: () => !!A.painter, disabled: () => !hasSel() && !A.editing, on: () => { if (A.painter) { A.painter = null; return; } const t = Date.now(); if (A._pt && t - A._pt < 400) { A.painter = null; C.painter(true); } else C.painter(false); A._pt = t; } }] }
    ] },
    { label: 'Diapositives', items: [
      { type: 'split', icon: 'square-plus', label: 'Nouvelle diapositive', size: 'lg', kbd: 'mod+m', on: () => C.newSlide(), menu: () => layoutMenu((l) => C.newSlide(l)).concat(['-', { label: 'Dupliquer la diapositive', icon: 'copy-plus', on: () => C.dupSlide() }, { label: 'Diapositives d\'une autre présentation…', icon: 'file-input', on: () => A.importSlides() }]) },
      { type: 'col', items: [{ type: 'menu', icon: 'layout-template', label: 'Disposition', items: () => layoutMenu((l) => C.layout(l)) }, { icon: 'rotate-ccw', label: 'Rétablir', title: 'Rétablir la position et la mise en forme des espaces réservés', on: () => C.resetSlide() }, { type: 'menu', icon: 'folder-tree', label: 'Section', items: () => [{ label: 'Ajouter une section', icon: 'plus', on: () => C.addSection() }].concat((A.doc.sections || []).map((s) => ({ label: s.name, icon: 'folder', sub: [{ label: 'Renommer…', on: () => C.sectionMenu(s.id, A.ribbon.el) }] }))) }] }
    ] },
    { label: 'Police', items: [
      { type: 'col', items: [
        { type: 'row', items: [
          { type: 'select', id: 'font', edit: true, width: 150, title: 'Police', options: fontOptions, value: () => ts().font || '', disabled: () => !textish(), on: (c, v) => { const f = O.FONTS.find((x) => x[1] === v || x[0].toLowerCase() === String(v).toLowerCase()); A.fmt('font', /^var\(/.test(v) ? v : f ? f[1] : O.fontStack(v)); } },
          { type: 'select', id: 'size', edit: true, width: 62, title: 'Taille de police', options: () => SIZES.map((s) => [s, String(s).replace('.', ',')]), value: () => { const s = ts().size; return s ? String(O.round(s, 1)).replace('.', ',') : ''; }, disabled: () => !textish(), on: (c, v) => { const n = parseFloat(String(v).replace(',', '.')); if (n > 0 && n < 1000) A.fmt('size', n); } },
          { id: 'grow', icon: 'a-arrow-up', label: 'Agrandir la police', showLabel: false, kbd: 'mod+]', disabled: () => !textish(), on: () => A.fmt('grow') },
          { id: 'shrink', icon: 'a-arrow-down', label: 'Réduire la police', showLabel: false, kbd: 'mod+[', disabled: () => !textish(), on: () => A.fmt('shrink') },
          { id: 'clearf', icon: 'remove-formatting', label: 'Effacer la mise en forme', showLabel: false, disabled: () => !textish(), on: () => A.fmt('clear') }
        ] },
        { type: 'row', items: [
          { id: 'b', icon: 'bold', label: 'Gras', showLabel: false, kbd: 'mod+b', active: () => ts().bold, disabled: () => !textish(), on: () => A.fmt('bold') },
          { id: 'i', icon: 'italic', label: 'Italique', showLabel: false, kbd: 'mod+i', active: () => ts().italic, disabled: () => !textish(), on: () => A.fmt('italic') },
          { id: 'u', icon: 'underline', label: 'Souligné', showLabel: false, kbd: 'mod+u', active: () => ts().underline, disabled: () => !textish(), on: () => A.fmt('underline') },
          { id: 's', icon: 'strikethrough', label: 'Barré', showLabel: false, active: () => ts().strike, disabled: () => !textish(), on: () => A.fmt('strike') },
          { id: 'sup', icon: 'superscript', label: 'Exposant', showLabel: false, active: () => ts().sup, disabled: () => !textish(), on: () => A.fmt('sup') },
          { id: 'sub', icon: 'subscript', label: 'Indice', showLabel: false, active: () => ts().sub, disabled: () => !textish(), on: () => A.fmt('sub') },
          { type: 'menu', icon: 'case-sensitive', label: 'Majuscules/minuscules', showLabel: false, disabled: () => !textish(), items: () => [['sentence', 'Majuscule en début de phrase'], ['lower', 'minuscules'], ['upper', 'MAJUSCULES'], ['title', 'Chaque Mot En Majuscule'], ['toggle', 'iNVERSER lA cASSE']].map((x) => ({ label: x[1], on: () => A.fmt('case', x[0]) })) },
          { type: 'menu', icon: 'move-horizontal', label: 'Espacement des caractères', showLabel: false, disabled: () => !textish(), items: () => [[-1.5, 'Très serré'], [-0.75, 'Serré'], [0, 'Normal'], [1.5, 'Large'], [3, 'Très large']].map((x) => ({ label: x[1], checked: (ts().spacing || 0) === x[0], on: () => A.fmt('spacing', x[0]) })) },
          { type: 'color', id: 'fcolor', icon: 'baseline', label: 'Couleur de police', def: '#C00000', css: colorCss, disabled: () => !textish(), value: () => ts().color, on: (c, v) => A.fmt('color', v === 'auto' ? null : T.css(v)), picker: (c, a, ap) => pick(c, a, ap, { auto: 'Automatique', title: 'Couleur de police' }) },
          { type: 'color', id: 'hcolor', icon: 'highlighter', label: 'Surlignage', def: '#FFFF00', css: colorCss, disabled: () => !textish(), value: () => ts().highlight || null, on: (c, v) => A.fmt('highlight', v ? T.css(v) : null), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucun surlignage', title: 'Surlignage' }) }
        ] }
      ] }
    ] },
    { label: 'Paragraphe', items: [
      { type: 'col', items: [
        { type: 'row', items: [
          { type: 'split', id: 'ul', icon: 'list', label: 'Puces', active: () => ts().list === 'ul', disabled: () => !textish(), on: () => A.fmt('list', 'ul'), menu: () => [['disc', '● Disque'], ['circle', '○ Cercle'], ['square', '■ Carré'], ['dash', '– Tiret'], ['arrow', '➤ Flèche'], ['check', '✔ Coche'], ['diamond', '◆ Losange']].map((x) => ({ label: x[1], on: () => A.fmt('listStyle', x[0]) })).concat(['-', { label: 'Aucune', on: () => A.fmt('list', 'none') }]) },
          { type: 'split', id: 'ol', icon: 'list-ordered', label: 'Numérotation', active: () => ts().list === 'ol', disabled: () => !textish(), on: () => A.fmt('list', 'ol'), menu: () => [['decimal', '1. 2. 3.'], ['lower-alpha', 'a. b. c.'], ['upper-alpha', 'A. B. C.'], ['lower-roman', 'i. ii. iii.'], ['upper-roman', 'I. II. III.']].map((x) => ({ label: x[1], on: () => A.fmt('listStyle', x[0]) })) },
          { id: 'outd', icon: 'indent-decrease', label: 'Diminuer le niveau', showLabel: false, disabled: () => !textish(), on: () => A.fmt('outdent') },
          { id: 'ind', icon: 'indent-increase', label: 'Augmenter le niveau', showLabel: false, disabled: () => !textish(), on: () => A.fmt('indent') },
          { type: 'menu', icon: 'list-collapse', label: 'Interligne', showLabel: false, disabled: () => !textish(), items: () => [1, 1.15, 1.5, 2, 2.5, 3].map((v) => ({ label: String(v).replace('.', ','), checked: Math.abs((ts().lineHeight || 1.2) - v) < 0.03, on: () => A.fmt('lineHeight', v) })).concat(['-', { label: 'Espace avant 0 / 6 / 12 pt', sub: [0, 6, 12, 18].map((v) => ({ label: v + ' pt', on: () => A.fmt('spaceBefore', v) })) }, { label: 'Espace après', sub: [0, 6, 12, 18].map((v) => ({ label: v + ' pt', on: () => A.fmt('spaceAfter', v) })) }]) },
          { type: 'menu', icon: 'columns-2', label: 'Colonnes', showLabel: false, disabled: () => !selType('text', 'shape'), items: () => [1, 2, 3].map((n) => ({ label: n + ' colonne' + (n > 1 ? 's' : ''), checked: ((one() || {}).cols || 1) === n, on: () => C.setProp((e) => { e.cols = n; }, 'Colonnes') })) }
        ] },
        { type: 'row', items: [
          { id: 'al', icon: 'align-left', label: 'Aligner à gauche', showLabel: false, kbd: 'mod+l', active: () => textish() && ts().align === 'left', disabled: () => !textish(), on: () => A.fmt('align', 'left') },
          { id: 'ac', icon: 'align-center', label: 'Centrer', showLabel: false, kbd: 'mod+e', active: () => ts().align === 'center', disabled: () => !textish(), on: () => A.fmt('align', 'center') },
          { id: 'ar', icon: 'align-right', label: 'Aligner à droite', showLabel: false, kbd: 'mod+r', active: () => ts().align === 'right', disabled: () => !textish(), on: () => A.fmt('align', 'right') },
          { id: 'aj', icon: 'align-justify', label: 'Justifier', showLabel: false, kbd: 'mod+j', active: () => ts().align === 'justify', disabled: () => !textish(), on: () => A.fmt('align', 'justify') },
          { type: 'menu', icon: 'align-vertical-justify-center', label: 'Aligner le texte', showLabel: false, disabled: () => !selType('text', 'shape'), items: () => [['top', 'En haut', 'align-vertical-justify-start'], ['middle', 'Au milieu', 'align-vertical-justify-center'], ['bottom', 'En bas', 'align-vertical-justify-end']].map((x) => ({ label: x[1], icon: x[2], checked: (one() || {}).va === x[0], on: () => C.setProp((e) => { e.va = x[0]; }, 'Alignement vertical') })) },
          { type: 'menu', icon: 'arrow-down-up', label: 'Orientation du texte', showLabel: false, disabled: () => !selType('text', 'shape'), items: () => [['horz', 'Horizontal'], ['vert', 'Rotation 90°'], ['vert270', 'Rotation 270°']].map((x) => ({ label: x[1], checked: ((one() || {}).vert || 'horz') === x[0], on: () => C.setProp((e) => { e.vert = x[0]; }, 'Orientation du texte') })) },
          { id: 'autofitB', icon: 'shrink', label: 'Ajustement automatique', showLabel: false, title: 'Ajustement automatique : réduire le texte en cas de dépassement', active: () => (one() || {}).autofit === 'shrink', disabled: () => !selType('text', 'shape'), on: () => C.setProp((e) => { e.autofit = e.autofit === 'shrink' ? 'none' : 'shrink'; delete e.fit; }, 'Ajustement automatique') }
        ] }
      ] }
    ] },
    { label: 'Dessin', items: [
      { type: 'menu', icon: 'shapes', label: 'Formes', size: 'lg', items: () => shapesMenu((s) => C.addShape(s)) },
      { type: 'menu', icon: 'layers', label: 'Organiser', size: 'lg', disabled: () => !hasSel(), items: () => arrangeMenu() },
      { type: 'gallery', id: 'qstyle', title: 'Styles rapides', w: 46, h: 34, items: () => quickStyles(), on: (c, q) => applyQuick(q), disabled: () => !selType('shape', 'text') },
      { type: 'col', items: [
        { type: 'color', id: 'sfill', icon: 'paint-bucket', label: 'Remplissage', showLabel: true, def: 't:accent1', css: colorCss, disabled: () => !selType('shape', 'text', 'icon'), value: () => { const e = one(); return e && e.fill && e.fill.type === 'solid' ? e.fill.color : e && e.type === 'icon' ? e.iconFill : null; }, on: (c, v) => setFill(v), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucun remplissage', title: 'Remplissage' }) },
        { type: 'color', id: 'sline', icon: 'pen-tool', label: 'Contour', showLabel: true, def: 't:tx1', css: colorCss, disabled: () => !selType('shape', 'text', 'line', 'image', 'icon'), value: () => { const e = one(); return e && e.type === 'icon' ? e.color : e && e.line ? e.line.color : null; }, on: (c, v) => setLine({ color: v }), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucun contour', title: 'Contour' }) },
        { type: 'menu', icon: 'sparkles', label: 'Effets', disabled: () => !hasSel(), items: () => effectsMenu() }
      ] }
    ] },
    { label: 'Modification', items: [{ type: 'col', items: [{ icon: 'search', label: 'Rechercher', kbd: 'mod+f', on: () => C.find() }, { icon: 'replace', label: 'Remplacer', kbd: 'mod+h', on: () => C.find(true) }, { type: 'menu', icon: 'mouse-pointer-2', label: 'Sélectionner', items: () => [{ label: 'Tout sélectionner', kbd: 'Ctrl+A', on: () => { A.sel = A.els().map((e) => e.id); A.renderOverlay(); A.refreshUi(); } }, { label: 'Volet Sélection', icon: 'layers-3', on: () => A.openPane('selection') }] }] }] }
  ] });
  async function pasteFromSystem(plain) {
    try {
      if (plain) { const t = await navigator.clipboard.readText(); if (t) { if (A.editing) document.execCommand('insertText', false, t); else C.addTextBox(RT.fromText(t)); } return; }
      const items = await navigator.clipboard.read();
      for (const it of items) { const im = it.types.find((x) => /^image\//.test(x)); if (im) { const b = await it.getType(im); await A.insertImages([new File([b], 'image.' + im.split('/')[1], { type: im })]); return; } }
      const t = await navigator.clipboard.readText(); if (t) C.addTextBox(RT.fromText(t));
    } catch (e) { O.toast('Utilisez Ctrl+V (le navigateur protège le presse-papiers)'); }
  }
  function applyQuick(q) { C.setProp((e) => { if (e.type !== 'shape' && e.type !== 'text') return; e.fill = O.clone(q.apply.fill); e.line = O.clone(q.apply.line); e.txColor = q.apply.txColor; if ('shadow' in q.apply) e.shadow = O.clone(q.apply.shadow); }, 'Style rapide'); }
  function setFill(v) { C.setProp((e) => { if (e.type === 'icon') { e.iconFill = v; return; } e.fill = v ? Object.assign({}, e.fill && e.fill.type === 'solid' ? e.fill : {}, { type: 'solid', color: v }) : null; }, 'Remplissage'); }
  function setLine(p) { C.setProp((e) => { if (e.type === 'icon' && 'color' in p) { e.color = p.color || 't:tx1'; return; } if ('color' in p && !p.color) { e.line = null; return; } e.line = Object.assign({ color: 't:tx1', w: e.type === 'image' ? 3 : 1.5, dash: 'solid' }, e.line || {}, p); }, 'Contour'); }
  A.uiSetFill = setFill; A.uiSetLine = setLine;
  function arrangeMenu() {
    return [{ head: 'Ordre des plans' }, { label: 'Mettre au premier plan', icon: 'bring-to-front', on: () => C.order('front') }, { label: 'Avancer', icon: 'arrow-up', on: () => C.order('up') }, { label: 'Reculer', icon: 'arrow-down', on: () => C.order('down') }, { label: 'Mettre à l\'arrière-plan', icon: 'send-to-back', on: () => C.order('back') },
      { head: 'Grouper' }, { label: 'Grouper', icon: 'group', kbd: 'Ctrl+G', disabled: A.sel.length < 2, on: () => C.group() }, { label: 'Dissocier', icon: 'ungroup', kbd: 'Ctrl+Maj+G', disabled: !A.selEls().some((e) => e.type === 'group'), on: () => C.ungroup() },
      { head: 'Positionner' }, { label: 'Aligner', icon: 'align-horizontal-justify-center', sub: alignItems() }, { label: 'Rotation', icon: 'rotate-cw', sub: [{ label: 'Rotation de 90° à droite', on: () => C.rotate(90) }, { label: 'Rotation de 90° à gauche', on: () => C.rotate(-90) }, { label: 'Retourner verticalement', on: () => C.flip('v') }, { label: 'Retourner horizontalement', on: () => C.flip('h') }] },
      { label: (one() || {}).locked ? 'Déverrouiller' : 'Verrouiller', icon: (one() || {}).locked ? 'lock-open' : 'lock', on: () => C.lock() }, { label: 'Volet Sélection', icon: 'layers-3', on: () => A.openPane('selection') }];
  }
  function alignItems() {
    return [{ label: 'Aligner à gauche', icon: 'align-start-vertical', on: () => C.align('left') }, { label: 'Centrer', icon: 'align-center-vertical', on: () => C.align('center') }, { label: 'Aligner à droite', icon: 'align-end-vertical', on: () => C.align('right') }, { label: 'Aligner en haut', icon: 'align-start-horizontal', on: () => C.align('top') }, { label: 'Aligner au milieu', icon: 'align-center-horizontal', on: () => C.align('middle') }, { label: 'Aligner en bas', icon: 'align-end-horizontal', on: () => C.align('bottom') }, '-',
      { label: 'Distribuer horizontalement', icon: 'align-horizontal-space-around', on: () => C.distribute('h') }, { label: 'Distribuer verticalement', icon: 'align-vertical-space-around', on: () => C.distribute('v') }, '-',
      { label: 'Aligner sur la diapositive', checked: !!A.settings.alignSlide, on: () => { A.settings.alignSlide = true; A.saveSettings(); } }, { label: 'Aligner les objets sélectionnés', checked: !A.settings.alignSlide, on: () => { A.settings.alignSlide = false; A.saveSettings(); } }];
  }
  function effectsMenu() {
    const sh = (s) => () => C.setProp((e) => { e.shadow = s; }, 'Ombre');
    return [{ head: 'Ombre' }, { label: 'Aucune', on: sh(null) }, { label: 'Portée en bas à droite', on: sh({ color: '#000000', blur: 8, x: 5, y: 5, alpha: 0.4 }) }, { label: 'Portée en dessous', on: sh({ color: '#000000', blur: 12, x: 0, y: 6, alpha: 0.35 }) }, { label: 'Diffuse', on: sh({ color: '#000000', blur: 24, x: 0, y: 0, alpha: 0.45 }) }, { label: 'Lueur (couleur d\'accent)', on: sh({ color: 't:accent1', blur: 18, x: 0, y: 0, alpha: 0.9 }) },
      { head: 'Transparence de l\'objet' }, ...[1, 0.85, 0.7, 0.5, 0.3].map((v) => ({ label: Math.round((1 - v) * 100) + ' %', checked: ((one() || {}).opacity == null ? 1 : one().opacity) === v, on: () => C.setProp((e) => { e.opacity = v === 1 ? undefined : v; }, 'Transparence') })), '-', { label: 'Plus d\'options…', icon: 'sliders-horizontal', on: () => A.openPane('format') }];
  }
  TABS.push({ id: 'insert', label: 'Insertion', groups: [
    { label: 'Diapositives', items: [{ type: 'split', icon: 'square-plus', label: 'Nouvelle diapositive', size: 'lg', on: () => C.newSlide(), menu: () => layoutMenu((l) => C.newSlide(l)) }] },
    { label: 'Tableaux', items: [{ icon: 'table', label: 'Tableau', size: 'lg', on: () => C.tableDialog() }] },
    { label: 'Images', items: [{ icon: 'image', label: 'Images', size: 'lg', on: () => C.insertImage(one() && one().type === 'placeholder' ? one() : null), title: 'Images de cet appareil' }, { icon: 'smile-plus', label: 'Icônes', size: 'lg', on: () => C.addIcon() }] },
    { label: 'Illustrations', items: [
      { type: 'menu', icon: 'shapes', label: 'Formes', size: 'lg', items: () => shapesMenu((s) => C.addShape(s)) },
      { type: 'menu', icon: 'network', label: 'SmartArt', size: 'lg', items: () => P.SMART_KINDS.map((k) => ({ label: k[1], icon: k[2], on: () => C.addSmart(k[0]) })) },
      { type: 'menu', icon: 'chart-column', label: 'Graphique', size: 'lg', items: () => P.CHART_KINDS.map((k) => ({ label: k[1], icon: k[2], on: () => C.addChart(k[0]) })) }
    ] },
    { label: 'Liens', items: [{ icon: 'link', label: 'Lien', size: 'lg', kbd: 'mod+k', disabled: () => !hasSel() && !A.editing, on: () => C.link() }] },
    { label: 'Commentaires', items: [{ icon: 'message-square-plus', label: 'Commentaire', size: 'lg', on: () => C.comment() }] },
    { label: 'Texte', items: [{ icon: 'text-cursor-input', label: 'Zone de texte', size: 'lg', on: () => C.startDraw('text') }, { type: 'col', items: [{ icon: 'panel-bottom', label: 'En-tête / pied', on: () => C.headerFooter() }, { icon: 'calendar', label: 'Date et numéro', on: () => C.headerFooter() }, { icon: 'image-up', label: 'Logo', on: () => C.logo() }] }] },
    { label: 'Symboles', items: [{ icon: 'sigma', label: 'Équation', size: 'lg', on: () => C.equation() }, { type: 'menu', icon: 'omega', label: 'Symbole', size: 'lg', items: () => symbolMenu() }] },
    { label: 'Médias', items: [{ type: 'menu', icon: 'film', label: 'Vidéo', size: 'lg', items: () => [{ label: 'Vidéo de cet appareil…', icon: 'hard-drive', on: () => C.addVideoFile() }, { label: 'Vidéo en ligne (YouTube)…', icon: 'youtube', on: () => C.addVideoLink() }] }, { icon: 'audio-lines', label: 'Audio', size: 'lg', on: () => C.addAudioFile() }] }
  ] });
  function symbolMenu() {
    const sy = '€ £ $ ¥ © ® ™ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ π Ω µ α β γ Δ θ λ σ φ → ← ↑ ↓ ↔ ⇒ ⇔ • · … « » ‰ § ¶ ✓ ✔ ✗ ★ ☆ ♥ ◆ ■ □ ● ○ ▲ ▼ ► ◄ ☎ ✉ ⚠ ☀ ☁ ⚡ ½ ¼ ¾ ² ³ ¹ œ Œ æ Æ ç Ç É È Ê À Â Ô Û Ù Î Ï'.split(' ');
    const node = O.h('div', { cls: 'o-gal-pop' }); node.innerHTML = '<div class="eq-sym">' + sy.map((s) => '<button type="button" data-s="' + s + '">' + s + '</button>').join('') + '</div><p class="o-hint" style="margin:6px 0 0">Insère le symbole dans le texte en cours (ou dans une nouvelle zone de texte).</p>';
    node.addEventListener('mousedown', (e) => e.preventDefault());
    node.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; O.closeMenu(); if (A.editing) { document.execCommand('insertText', false, b.dataset.s); A.onTyping(); } else C.addTextBox('<div><span style="font-size:44pt">' + O.esc(b.dataset.s) + '</span></div>'); });
    return [{ node }];
  }
  TABS.push({ id: 'design', label: 'Création', groups: [
    { label: 'Thèmes', items: [{ type: 'gallery', id: 'themes', title: 'Thèmes', w: 96, h: 56, items: () => T.list.map((t) => ({ id: t.id, title: t.name, sig: '', html: themeThumb(t) })), current: () => A.doc.theme.id, on: (c, it) => C.theme(it.id) }] },
    { label: 'Variantes', items: [{ type: 'col', items: [
      { type: 'menu', icon: 'palette', label: 'Couleurs', items: () => T.list.map((t) => ({ html: '<span style="display:inline-flex;gap:1px;margin-right:6px;vertical-align:middle">' + ['dk1', 'lt1', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((k) => '<i style="width:10px;height:14px;background:' + t.colors[k] + ';display:inline-block;border:1px solid #0002"></i>').join('') + '</span>' + O.esc(t.name), on: () => C.themeColors(t.id) })).concat(['-', { label: 'Personnaliser les couleurs…', icon: 'pipette', on: () => C.customColors() }]) },
      { type: 'menu', icon: 'type', label: 'Polices', items: () => T.fontPairs.map((p) => ({ html: '<span style="font-family:' + O.fontStack(p[0]) + ';font-weight:700">' + O.esc(p[0]) + '</span> <small class="o-mi-note">/ <span style="font-family:' + O.fontStack(p[1]) + '">' + O.esc(p[1]) + '</span></small>', checked: A.theme().fonts.major === p[0] && A.theme().fonts.minor === p[1], on: () => C.themeFonts(p) })) },
      { id: 'decor', icon: 'brush', label: 'Graphiques du thème', title: 'Afficher les formes décoratives du thème sur toutes les diapositives', active: () => A.doc.master.decor, on: () => { A.doc.master.decor = !A.doc.master.decor; A.change('Graphiques du thème'); } }
    ] }] },
    { label: 'Personnaliser', items: [
      { type: 'menu', icon: 'ratio', label: 'Taille des diapositives', size: 'lg', items: () => P.SIZES.map((s) => ({ label: s.name, checked: A.doc.size.name === s.id, on: () => C.slideSize(s.id) })).concat(['-', { label: 'Taille personnalisée…', on: () => C.slideSize('custom') }]) },
      { icon: 'paint-bucket', label: 'Format de l\'arrière-plan', size: 'lg', on: () => A.openPane('bg') },
      { icon: 'layout-panel-top', label: 'Masque des diapositives', size: 'lg', active: () => A.view === 'master', on: () => A.setView(A.view === 'master' ? 'normal' : 'master') }
    ] }
  ] });
  function themeThumb(t) {
    const bg = t.bg && t.bg.type === 'solid' ? T.resolve(t.bg.color, t) : t.bg && t.bg.type === 'gradient' ? 'linear-gradient(135deg,' + t.bg.stops.map((s) => T.resolve(s.c, t)).join(',') + ')' : T.roles(t).bg1;
    return '<div class="th-gal" style="background:' + bg + ';color:' + T.roles(t).tx1 + ';font-family:' + O.fontStack(t.fonts.major) + '"><span>Aa</span><span style="font-family:' + O.fontStack(t.fonts.minor) + ';font-weight:400;font-size:8.5px;opacity:.85">' + O.esc(t.name) + '</span><div class="bars">' + ['accent1', 'accent2', 'accent3', 'accent4'].map((k) => '<i style="background:' + t.colors[k] + '"></i>').join('') + '</div></div>';
  }
  const curTr = () => (A.doc.slides[A.cur] || {}).transition || { type: 'none' };
  TABS.push({ id: 'transitions', label: 'Transitions', groups: [
    { label: 'Aperçu', items: [{ icon: 'eye', label: 'Aperçu', size: 'lg', disabled: () => curTr().type === 'none', on: () => A.cmd.previewTransition() }] },
    { label: 'Transition vers cette diapositive', items: [{ type: 'gallery', id: 'trs', w: 70, h: 52, title: 'Transitions', items: () => P.TRANSITIONS.map((t) => ({ id: t[0], title: t[1], html: '<div class="tr-gal">' + O.icon(t[2]) + '<span>' + t[1] + '</span></div>' })), current: () => curTr().type, on: (c, it) => C.setTransition({ type: it.id }) }, { type: 'menu', icon: 'move', label: 'Options d\'effet', size: 'lg', disabled: () => !P.TR_DIRS[curTr().type], items: () => [['l', 'Depuis la droite'], ['r', 'Depuis la gauche'], ['u', 'Depuis le bas'], ['d', 'Depuis le haut']].map((d) => ({ label: d[1], checked: (curTr().dir || 'l') === d[0], on: () => C.setTransition({ dir: d[0] }) })) }] },
    { label: 'Minutage', items: [{ type: 'col', items: [
      { type: 'num', id: 'trdur', icon: 'timer', label: 'Durée', unit: 's', step: 0.05, min: 0.05, max: 10, width: 60, value: () => curTr().dur || 0.7, on: (c, v) => C.setTransition({ dur: v }) },
      { id: 'trall', icon: 'copy-check', label: 'Appliquer partout', on: () => C.setTransition(Object.assign({}, curTr()), true) }
    ] }, { type: 'col', items: [
      { id: 'advclick', icon: 'mouse-pointer-click', label: 'Manuellement (au clic)', active: () => ((A.doc.slides[A.cur] || {}).advance || {}).click !== false, on: () => { const a = (A.doc.slides[A.cur].advance || {}); C.setAdvance({ click: a.click === false }); } },
      { type: 'num', id: 'advafter', icon: 'hourglass', label: 'Après', unit: 's (vide = non)', step: 1, min: 0, width: 56, value: () => { const a = (A.doc.slides[A.cur] || {}).advance || {}; return a.after == null ? '' : a.after; }, on: (c, v) => C.setAdvance({ after: v > 0 ? v : null }) }
    ] }] }
  ] });
  TABS.push({ id: 'animations', label: 'Animations', groups: [
    { label: 'Aperçu', items: [{ icon: 'eye', label: 'Aperçu', size: 'lg', disabled: () => !((A.doc.slides[A.cur] || {}).anims || []).length, on: () => A.cmd.previewAnim() }] },
    { label: 'Animation', items: [{ type: 'gallery', id: 'anims', w: 64, h: 52, title: 'Animations', items: () => animGallery(), current: () => { const a = selAnim(); return a ? a.cat + ':' + a.fx : null; }, on: (c, it) => { const p = it.id.split(':'); C.addAnim(p[0], p[1], true); }, groups: () => [{ label: 'Entrée', items: animGallery().filter((x) => /^in:/.test(x.id)) }, { label: 'Emphase', items: animGallery().filter((x) => /^em:/.test(x.id)) }, { label: 'Sortie', items: animGallery().filter((x) => /^out:/.test(x.id)) }] },
      { type: 'menu', icon: 'move', label: 'Options d\'effet', size: 'lg', disabled: () => { const a = selAnim(); return !a || !P.ANIM_DIRS[a.fx]; }, items: () => [['b', 'Par le bas'], ['l', 'Par la gauche'], ['r', 'Par la droite'], ['t', 'Par le haut']].map((d) => ({ label: d[1], checked: (selAnim() || {}).dir === d[0], on: () => C.animProp('dir', d[0]) })) }] },
    { label: 'Animation avancée', items: [{ type: 'menu', icon: 'sparkles', label: 'Ajouter une animation', size: 'lg', disabled: () => !hasSel(), items: () => [{ head: 'Entrée' }].concat(P.ANIMS.in.map((x) => ({ label: x[1], on: () => C.addAnim('in', x[0], false) }))).concat([{ head: 'Emphase' }]).concat(P.ANIMS.em.map((x) => ({ label: x[1], on: () => C.addAnim('em', x[0], false) }))).concat([{ head: 'Sortie' }]).concat(P.ANIMS.out.map((x) => ({ label: x[1], on: () => C.addAnim('out', x[0], false) }))) },
      { type: 'col', items: [{ icon: 'list-video', label: 'Volet Animation', active: () => A.pane === 'anim', on: () => A.openPane(A.pane === 'anim' ? null : 'anim') }, { icon: 'trash-2', label: 'Supprimer l\'animation', disabled: () => !selAnim(), on: () => C.animDel() }] }] },
    { label: 'Minutage', items: [{ type: 'col', items: [
      { type: 'select', id: 'astart', width: 170, title: 'Démarrer', options: () => [['click', 'Au clic'], ['with', 'Avec la précédente'], ['after', 'Après la précédente']], value: () => (selAnim() || {}).start || '', disabled: () => !selAnim(), on: (c, v) => C.animProp('start', v) },
      { type: 'num', id: 'adur', icon: 'timer', label: 'Durée', unit: 's', step: 0.1, min: 0, max: 60, width: 56, value: () => (selAnim() || {}).dur, disabled: () => !selAnim(), on: (c, v) => C.animProp('dur', v) },
      { type: 'num', id: 'adel', icon: 'hourglass', label: 'Délai', unit: 's', step: 0.1, min: 0, max: 60, width: 56, value: () => (selAnim() || {}).delay, disabled: () => !selAnim(), on: (c, v) => C.animProp('delay', v) }
    ] }, { type: 'col', items: [{ icon: 'arrow-up', label: 'Avancer', title: 'Déplacer plus tôt', disabled: () => !selAnim(), on: () => C.animMove(-1) }, { icon: 'arrow-down', label: 'Reculer', title: 'Déplacer plus tard', disabled: () => !selAnim(), on: () => C.animMove(1) }] }] }
  ] });
  TABS.push({ id: 'show', label: 'Diaporama', groups: [
    { label: 'Démarrer', items: [{ icon: 'play', label: 'À partir du début', size: 'lg', kbd: 'f5', on: () => C.showFrom(0) }, { icon: 'square-play', label: 'À partir de la diapositive actuelle', size: 'lg', kbd: 'shift+f5', on: () => C.showFrom(A.cur) }, { icon: 'presentation', label: 'Mode présentateur', size: 'lg', kbd: 'alt+f5', on: () => C.presenter() }] },
    { label: 'Configurer', items: [{ icon: 'settings-2', label: 'Configurer le diaporama', size: 'lg', on: () => showSettings() }, { icon: 'eye-off', label: 'Masquer la diapositive', size: 'lg', active: () => !!(A.doc.slides[A.cur] || {}).hidden, on: () => C.hideSlide() }, { icon: 'timer-reset', label: 'Vérifier le minutage', size: 'lg', on: () => C.rehearse() },
      { type: 'col', items: [{ id: 'usetim', icon: 'clock', label: 'Utiliser le minutage', active: () => A.doc.settings.useTimings, on: () => { A.doc.settings.useTimings = !A.doc.settings.useTimings; A.change('Utiliser le minutage'); } }, { id: 'loop', icon: 'repeat', label: 'En boucle', active: () => A.doc.settings.loop, on: () => { A.doc.settings.loop = !A.doc.settings.loop; A.change('Boucle'); } }] }] }
  ] });
  function showSettings() {
    const s = A.doc.settings;
    O.form('Configurer le diaporama', [{ id: 'loop', type: 'check', label: 'Exécuter en continu jusqu\'à Échap', value: s.loop }, { id: 'tim', type: 'check', label: 'Utiliser le minutage des diapositives', value: s.useTimings }, { id: 'pen', type: 'color', label: 'Couleur du stylo', value: s.pen || '#E03131', half: true }, { id: 'laser', type: 'color', label: 'Couleur du pointeur laser', value: s.laser || '#FF1F1F', half: true }], { ok: 'Enregistrer' }).then((r) => { if (!r) return; s.loop = r.loop; s.useTimings = r.tim; s.pen = r.pen; s.laser = r.laser; A.change('Configurer le diaporama'); });
  }
  TABS.push({ id: 'review', label: 'Révision', groups: [
    { label: 'Vérification', items: [{ icon: 'spell-check', label: 'Orthographe', size: 'lg', active: () => A.settings.spell !== false, title: 'Vérification orthographique du navigateur (soulignement en rouge pendant la saisie). Clic droit sur un mot pour les suggestions.', on: () => { A.settings.spell = A.settings.spell === false; A.saveSettings(); document.documentElement.spellcheck = A.settings.spell !== false; O.toast(A.settings.spell === false ? 'Vérification orthographique désactivée' : 'Vérification orthographique activée (clic droit sur un mot souligné)'); } }, { icon: 'accessibility', label: 'Vérifier l\'accessibilité', size: 'lg', on: () => A.openPane('a11y') }, { icon: 'chart-no-axes-column', label: 'Statistiques', size: 'lg', on: () => stats() }] },
    { label: 'Commentaires', items: [{ icon: 'message-square-plus', label: 'Nouveau commentaire', size: 'lg', on: () => C.comment() }, { type: 'col', items: [{ icon: 'messages-square', label: 'Afficher les commentaires', active: () => A.pane === 'comments', on: () => A.openPane(A.pane === 'comments' ? null : 'comments') }, { icon: 'map-pin', label: 'Marques sur la diapositive', active: () => !!A.settings.showComments, on: () => C.toggle('showComments') }] }] },
    { label: 'Rechercher', items: [{ icon: 'search', label: 'Rechercher', size: 'lg', on: () => C.find() }, { icon: 'replace', label: 'Remplacer', size: 'lg', on: () => C.find(true) }] }
  ] });
  function stats() {
    let words = 0, chars = 0, imgs = 0, objs = 0, notesW = 0;
    A.doc.slides.forEach((s) => { const t = P.slideText(s); words += (t.match(/[\p{L}\p{N}’'-]+/gu) || []).length; chars += t.replace(/\s/g, '').length; P.walk(s.elements, (e) => { objs++; if (e.type === 'image') imgs++; }); notesW += (RT.textOf(s.notes || '').match(/[\p{L}\p{N}’'-]+/gu) || []).length; });
    const dur = A.doc.slides.reduce((a, s) => a + ((s.advance || {}).after || 0), 0);
    O.alert('Statistiques', '<table class="kbd-tbl"><tr><td>Diapositives</td><td>' + A.doc.slides.length + ' (' + A.doc.slides.filter((s) => s.hidden).length + ' masquées)</td></tr><tr><td>Mots</td><td>' + words + '</td></tr><tr><td>Caractères (sans espaces)</td><td>' + chars + '</td></tr><tr><td>Mots dans les notes</td><td>' + notesW + '</td></tr><tr><td>Objets</td><td>' + objs + '</td></tr><tr><td>Images</td><td>' + imgs + '</td></tr><tr><td>Minutage enregistré</td><td>' + (dur ? Math.floor(dur / 60) + ' min ' + Math.round(dur % 60) + ' s' : '—') + '</td></tr><tr><td>Temps de parole estimé (notes, 130 mots/min)</td><td>' + Math.ceil(notesW / 130) + ' min</td></tr></table>');
  }
  TABS.push({ id: 'view', label: 'Affichage', groups: [
    { label: 'Modes', items: [{ icon: 'panels-top-left', label: 'Normal', size: 'lg', active: () => A.view === 'normal', on: () => A.setView('normal') }, { icon: 'layout-grid', label: 'Trieuse', size: 'lg', active: () => A.view === 'sorter', on: () => A.setView('sorter') }, { icon: 'book-open', label: 'Lecture', size: 'lg', active: () => A.view === 'reading', on: () => A.setView(A.view === 'reading' ? 'normal' : 'reading') }, { icon: 'layout-panel-top', label: 'Masque', size: 'lg', active: () => A.view === 'master', on: () => A.setView(A.view === 'master' ? 'normal' : 'master') }] },
    { label: 'Afficher', items: [{ type: 'col', items: [{ icon: 'ruler', label: 'Règles', active: () => A.settings.rulers, on: () => C.toggle('rulers') }, { icon: 'grid-3x3', label: 'Quadrillage', active: () => A.settings.grid, on: () => C.toggle('grid') }, { icon: 'crosshair', label: 'Repères intelligents', active: () => A.settings.guides !== false, on: () => C.toggle('guides') }] }, { type: 'col', items: [{ icon: 'magnet', label: 'Magnétisme', active: () => A.settings.snap !== false, on: () => C.toggle('snap') }, { icon: 'notebook-pen', label: 'Notes', active: () => A.settings.notes !== false, on: () => C.toggle('notes') }, { type: 'menu', icon: 'grid-2x2', label: 'Taille de la grille', items: () => [12, 24, 48].map((g) => ({ label: g + ' px (' + O.round(g / 96 * 2.54, 2).toString().replace('.', ',') + ' cm)', checked: A.settings.gridSize === g, on: () => { A.settings.gridSize = g; A.saveSettings(); A.drawGrid(); } })) }] }] },
    { label: 'Zoom', items: [{ type: 'menu', icon: 'zoom-in', label: 'Zoom', size: 'lg', items: () => [25, 50, 66, 75, 100, 150, 200, 300].map((z) => ({ label: z + ' %', checked: !A.fit && Math.round(A.zoom * 100) === z, on: () => A.setZoom(z / 100) })) }, { icon: 'scan', label: 'Ajuster à la fenêtre', size: 'lg', kbd: 'mod+0', active: () => A.fit, on: () => A.setZoom('fit') }] },
    { label: 'Interface', items: [{ type: 'menu', icon: 'sun-moon', label: 'Apparence', size: 'lg', items: () => [['', 'Comme le système'], ['clair', 'Claire'], ['sombre', 'Sombre']].map((x) => ({ label: x[1], checked: (A.settings.ui || '') === x[0], on: () => { A.settings.ui = x[0]; A.saveSettings(); A.applyUi(); } })) }, { icon: 'keyboard', label: 'Raccourcis', size: 'lg', kbd: 'f1', on: () => C.shortcuts() }] }
  ] });
  /* ----- onglets contextuels ----- */
  const sizeItems = () => ({ type: 'col', items: [
    { type: 'num', id: 'szh', icon: 'move-vertical', label: 'Hauteur', unit: 'cm', step: 0.1, min: 0.05, width: 62, value: () => { const e = one(); return e ? O.round(e.h / 96 * 2.54, 2) : ''; }, disabled: () => !one(), on: (c, v) => sizeSet('h', v) },
    { type: 'num', id: 'szw', icon: 'move-horizontal', label: 'Largeur', unit: 'cm', step: 0.1, min: 0.05, width: 62, value: () => { const e = one(); return e ? O.round(e.w / 96 * 2.54, 2) : ''; }, disabled: () => !one(), on: (c, v) => sizeSet('w', v) },
    { id: 'lockr', icon: 'link-2', label: 'Proportions', title: 'Conserver les proportions', active: () => !!(one() || {}).lockRatio || (one() || {}).type === 'image', on: () => C.setProp((e) => { e.lockRatio = !e.lockRatio; }, 'Proportions') }
  ] });
  function sizeSet(k, cmv) { const e = one(); if (!e) return; const px = cmv / 2.54 * 96; const r = e.w / e.h; const g = { x: e.x, y: e.y, w: e.w, h: e.h }; if (k === 'w') { g.w = px; if (e.lockRatio || e.type === 'image') g.h = px / r; } else { g.h = px; if (e.lockRatio || e.type === 'image') g.w = px * r; } A.setGeom(e, g); A.change('Taille'); }
  const arrangeGroup = () => ({ label: 'Organiser', items: [{ type: 'menu', icon: 'bring-to-front', label: 'Avancer', size: 'lg', items: () => [{ label: 'Mettre au premier plan', on: () => C.order('front') }, { label: 'Avancer', on: () => C.order('up') }] }, { type: 'menu', icon: 'send-to-back', label: 'Reculer', size: 'lg', items: () => [{ label: 'Mettre à l\'arrière-plan', on: () => C.order('back') }, { label: 'Reculer', on: () => C.order('down') }] }, { type: 'col', items: [{ type: 'menu', icon: 'align-horizontal-justify-center', label: 'Aligner', items: () => alignItems() }, { type: 'menu', icon: 'group', label: 'Grouper', items: () => [{ label: 'Grouper', on: () => C.group(), disabled: A.sel.length < 2 }, { label: 'Dissocier', on: () => C.ungroup() }] }, { type: 'menu', icon: 'rotate-cw', label: 'Rotation', items: () => [{ label: '90° à droite', on: () => C.rotate(90) }, { label: '90° à gauche', on: () => C.rotate(-90) }, { label: 'Retourner verticalement', on: () => C.flip('v') }, { label: 'Retourner horizontalement', on: () => C.flip('h') }] }] }, { type: 'col', items: [{ icon: 'lock', label: 'Verrouiller', active: () => !!(one() || {}).locked, on: () => C.lock() }, { icon: 'scan-text', label: 'Texte de remplacement', on: () => C.altText() }, { icon: 'layers-3', label: 'Volet Sélection', on: () => A.openPane('selection') }] }] });
  TABS.push({ id: 'shapefmt', label: 'Forme', contextual: () => !A.editing && selType('shape', 'text', 'line', 'icon'), groups: [
    { label: 'Insérer des formes', items: [{ type: 'menu', icon: 'shapes', label: 'Formes', size: 'lg', items: () => shapesMenu((s) => C.addShape(s)) }, { type: 'menu', icon: 'pencil-ruler', label: 'Modifier la forme', size: 'lg', disabled: () => !selType('shape', 'text'), items: () => shapesMenu((s) => { if (P.isLineShape(s) || s === 'freeform') return; C.setProp((e) => { if (e.type === 'text') { e.type = 'shape'; if (!e.fill) e.fill = { type: 'solid', color: 't:accent1' }; } if (e.type === 'shape') { e.shape = s; e.adj = null; } }, 'Modifier la forme'); }) }] },
    { label: 'Styles de forme', items: [{ type: 'gallery', id: 'qstyle2', w: 46, h: 34, title: 'Styles rapides', items: () => quickStyles(), on: (c, q) => applyQuick(q) }, { type: 'col', items: [
      { type: 'color', id: 'sfill2', icon: 'paint-bucket', label: 'Remplissage', showLabel: true, def: 't:accent1', css: colorCss, value: () => { const e = one(); return e && e.fill && e.fill.type === 'solid' ? e.fill.color : e && e.type === 'icon' ? e.iconFill : null; }, on: (c, v) => setFill(v), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucun remplissage' }) },
      { type: 'color', id: 'sline2', icon: 'pen-tool', label: 'Contour', showLabel: true, def: 't:tx1', css: colorCss, value: () => { const e = one(); return e && e.type === 'icon' ? e.color : e && e.line ? e.line.color : null; }, on: (c, v) => setLine({ color: v }), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucun contour' }) },
      { type: 'menu', icon: 'sparkles', label: 'Effets', items: () => effectsMenu() }
    ] }, { type: 'col', items: [
      { type: 'menu', icon: 'minus', label: 'Épaisseur', items: () => [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6, 10].map((w) => ({ label: String(w).replace('.', ',') + ' pt', checked: ((one() || {}).line || {}).w === w, on: () => { const e = one(); if (e && e.type === 'icon') C.setProp((x) => { x.sw = Math.max(0.5, w / 1.2); }, 'Épaisseur'); else setLine({ w }); } })) },
      { type: 'menu', icon: 'ellipsis', label: 'Tirets', items: () => [['solid', 'Continu'], ['dash', 'Tirets'], ['dot', 'Points'], ['dashDot', 'Tiret-point'], ['longDash', 'Tirets longs']].map((d) => ({ label: d[1], checked: ((one() || {}).line || {}).dash === d[0], on: () => setLine({ dash: d[0] }) })) },
      { type: 'menu', icon: 'move-right', label: 'Flèches', disabled: () => !selType('line'), items: () => [['none', 'none', 'Sans flèche'], ['none', 'triangle', 'Flèche à la fin'], ['triangle', 'none', 'Flèche au début'], ['triangle', 'triangle', 'Double flèche'], ['none', 'stealth', 'Pointe effilée'], ['none', 'arrow', 'Flèche ouverte'], ['oval', 'oval', 'Ronds'], ['diamond', 'diamond', 'Losanges']].map((x) => ({ label: x[2], on: () => setLine({ tail: x[0], head: x[1] }) })) }
    ] }] },
    { label: 'Texte', items: [{ type: 'col', items: [{ type: 'color', id: 'txfill', icon: 'baseline', label: 'Couleur du texte', showLabel: true, def: 't:tx1', css: colorCss, disabled: () => !selType('shape', 'text'), value: () => (one() || {}).txColor || null, on: (c, v) => C.setProp((e) => { e.txColor = v === 'auto' ? undefined : v; }, 'Couleur du texte'), picker: (c, a, ap) => pick(c, a, ap, { auto: 'Automatique' }) }, { icon: 'sliders-horizontal', label: 'Options de texte', on: () => A.openPane('format') }] }] },
    arrangeGroup(),
    { label: 'Taille', items: [sizeItems()] }
  ] });
  TABS.push({ id: 'picfmt', label: 'Image', contextual: () => selType('image'), groups: [
    { label: 'Ajuster', items: [{ icon: 'wand-sparkles', label: 'Supprimer l\'arrière-plan', size: 'lg', title: 'Détoure un fond uni (blanc, couleur unie) à partir des bords de l\'image', on: () => C.removeBg(40) },
      { type: 'menu', icon: 'sun', label: 'Corrections', size: 'lg', items: () => { const l = []; [-40, -20, 0, 20, 40].forEach((b) => [-40, 0, 40].forEach((c) => l.push({ label: 'Luminosité ' + (b > 0 ? '+' : '') + b + ' %, contraste ' + (c > 0 ? '+' : '') + c + ' %', on: () => C.setProp((e) => { e.fx = Object.assign({}, e.fx, { bright: b, contrast: c }); }, 'Corrections') }))); return l.concat(['-', { label: 'Options de correction…', on: () => A.openPane('format') }]); } },
      { type: 'menu', icon: 'palette', label: 'Couleur', size: 'lg', items: () => [{ label: 'Couleurs d\'origine', on: () => C.setProp((e) => { e.fx = Object.assign({}, e.fx, { gray: false, sepia: false, sat: 100 }); }, 'Couleur') }, { label: 'Niveaux de gris', on: () => C.setProp((e) => { e.fx = Object.assign({}, e.fx, { gray: true, sepia: false }); }, 'Couleur') }, { label: 'Sépia', on: () => C.setProp((e) => { e.fx = Object.assign({}, e.fx, { sepia: true, gray: false }); }, 'Couleur') }, '-', ...[0, 33, 66, 150, 200].map((s) => ({ label: 'Saturation ' + s + ' %', on: () => C.setProp((e) => { e.fx = Object.assign({}, e.fx, { sat: s }); }, 'Saturation') }))] },
      { type: 'menu', icon: 'blend', label: 'Transparence', size: 'lg', items: () => [0, 15, 30, 50, 65, 80].map((t) => ({ label: t + ' %', checked: Math.round((1 - (((one() || {}).fx || {}).alpha == null ? 1 : one().fx.alpha)) * 100) === t, on: () => C.setProp((e) => { e.fx = Object.assign({}, e.fx, { alpha: 1 - t / 100 }); }, 'Transparence') })) },
      { type: 'col', items: [{ icon: 'replace', label: 'Changer l\'image', on: () => C.replaceImage() }, { icon: 'rotate-ccw', label: 'Rétablir l\'image', on: () => C.resetImage() }, { icon: 'download', label: 'Enregistrer l\'image', on: () => C.saveImage() }] }] },
    { label: 'Styles d\'image', items: [{ type: 'gallery', id: 'picst', w: 50, h: 40, title: 'Styles d\'image', items: () => picStyles(), on: (c, p) => C.setProp((e) => { if (e.type !== 'image') return; e.line = O.clone(p.apply.line); e.shadow = O.clone(p.apply.shadow); e.mask = p.apply.mask; }, 'Style d\'image') }, { type: 'col', items: [{ type: 'color', id: 'pborder', icon: 'square', label: 'Bordure', showLabel: true, def: 't:tx1', css: colorCss, value: () => ((one() || {}).line || {}).color || null, on: (c, v) => setLine({ color: v }), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucune bordure' }) }, { type: 'menu', icon: 'sparkles', label: 'Effets', items: () => effectsMenu() }] }] },
    { label: 'Accessibilité', items: [{ icon: 'scan-text', label: 'Texte de remplacement', size: 'lg', on: () => C.altText() }] },
    arrangeGroup(),
    { label: 'Taille', items: [{ type: 'split', icon: 'crop', label: 'Rogner', size: 'lg', active: () => !!A.cropping, on: () => C.crop(), menu: () => [{ label: 'Rogner', icon: 'crop', on: () => C.crop() }, { label: 'Rogner à la forme', icon: 'shapes', sub: () => shapesMenu((s) => C.cropShape(s)) }, { label: 'Rapport hauteur/largeur', icon: 'ratio', sub: [[1, '1:1 (carré)'], [4 / 3, '4:3'], [3 / 2, '3:2'], [16 / 9, '16:9'], [3 / 4, '3:4 (portrait)'], [9 / 16, '9:16']].map((r) => ({ label: r[1], on: () => C.cropAspect(r[0]) })) }, '-', { label: 'Remplissage (couvrir le cadre)', on: () => C.fitImage('fill') }, { label: 'Ajuster (image entière)', on: () => C.fitImage('fit') }] }, sizeItems()] }
  ] });
  TABS.push({ id: 'tablefmt', label: 'Tableau', contextual: () => selType('table') || !!A.tableSel, groups: [
    { label: 'Options', items: [{ type: 'col', items: [
      { id: 'tsh', icon: 'panel-top', label: 'Ligne d\'en-tête', active: () => tstyle().header !== false, on: () => C.tableStyle({ header: tstyle().header === false }) },
      { id: 'tst', icon: 'panel-bottom', label: 'Ligne des totaux', active: () => !!tstyle().lastRow, on: () => C.tableStyle({ lastRow: !tstyle().lastRow }) },
      { id: 'tsb', icon: 'rows-3', label: 'Lignes à bandes', active: () => tstyle().banded !== false, on: () => C.tableStyle({ banded: tstyle().banded === false }) }
    ] }, { type: 'col', items: [
      { id: 'tsf', icon: 'panel-left', label: 'Première colonne', active: () => !!tstyle().firstCol, on: () => C.tableStyle({ firstCol: !tstyle().firstCol }) },
      { id: 'tsl', icon: 'panel-right', label: 'Dernière colonne', active: () => !!tstyle().lastCol, on: () => C.tableStyle({ lastCol: !tstyle().lastCol }) },
      { id: 'tsbd', icon: 'grid-3x3', label: 'Bordures', active: () => tstyle().borders !== false, on: () => C.tableStyle({ borders: tstyle().borders === false }) }
    ] }] },
    { label: 'Styles de tableau', items: [{ type: 'gallery', id: 'tstyles', w: 50, h: 40, title: 'Styles de tableau', items: () => TSTYLES.map((s) => Object.assign({}, s, { html: tstyleHtml(s) })), current: () => tstyle().id + (tstyle().accent || 1), on: (c, s) => C.tableStyle({ id: s.kind, accent: s.accent }) }, { type: 'color', id: 'cfill', icon: 'paint-bucket', label: 'Trame de fond', showLabel: true, def: 't:accent2/+60', css: colorCss, value: () => null, on: (c, v) => C.cellProp((x) => { x.fill = v || undefined; }, 'Trame des cellules'), picker: (c, a, ap) => pick(c, a, ap, { none: 'Style du tableau' }) }] },
    { label: 'Lignes et colonnes', items: [{ type: 'col', items: [{ icon: 'arrow-up-to-line', label: 'Insérer au-dessus', on: () => C.tableRow(-1) }, { icon: 'arrow-down-to-line', label: 'Insérer en dessous', on: () => C.tableRow(1) }, { type: 'menu', icon: 'trash-2', label: 'Supprimer', items: () => [{ label: 'Supprimer les lignes', on: () => C.tableDel('row') }, { label: 'Supprimer les colonnes', on: () => C.tableDel('col') }, { label: 'Supprimer le tableau', on: () => C.tableDel('table') }] }] }, { type: 'col', items: [{ icon: 'arrow-left-to-line', label: 'Insérer à gauche', on: () => C.tableCol(-1) }, { icon: 'arrow-right-to-line', label: 'Insérer à droite', on: () => C.tableCol(1) }] }] },
    { label: 'Fusionner', items: [{ icon: 'merge', label: 'Fusionner les cellules', size: 'lg', on: () => C.tableMerge() }, { icon: 'split', label: 'Fractionner', size: 'lg', on: () => C.tableSplit() }] },
    { label: 'Taille des cellules', items: [{ type: 'col', items: [{ icon: 'rows-2', label: 'Répartir les lignes', on: () => C.tableEven('rows') }, { icon: 'columns-2', label: 'Répartir les colonnes', on: () => C.tableEven('cols') }, { type: 'num', id: 'tfs', icon: 'type', label: 'Taille du texte', unit: 'pt', width: 52, min: 6, max: 60, value: () => { const e = A.tableSel ? A.get(A.tableSel.id) : one(); return e && e.type === 'table' ? (e.fontSize || 16) : ''; }, on: (c, v) => { const e = A.tableSel ? A.get(A.tableSel.id) : one(); if (e) { e.fontSize = v; A.change('Taille du texte'); } } }] }] },
    { label: 'Alignement', items: [{ type: 'col', items: [['top', 'Haut', 'align-vertical-justify-start'], ['middle', 'Milieu', 'align-vertical-justify-center'], ['bottom', 'Bas', 'align-vertical-justify-end']].map((x) => ({ icon: x[2], label: 'Aligner en ' + x[1].toLowerCase(), on: () => C.cellProp((c) => { c.va = x[0]; }, 'Alignement des cellules') })) }] }
  ] });
  const tstyle = () => { const e = A.tableSel ? A.get(A.tableSel.id) : one(); return (e && e.tstyle) || {}; };
  const chartOf = () => (one() || {}).chart || {};
  const chartSet = (fn, label) => C.setProp((e) => { if (e.type === 'chart') fn(e.chart); }, label || 'Graphique');
  TABS.push({ id: 'chartfmt', label: 'Graphique', contextual: () => selType('chart'), groups: [
    { label: 'Données', items: [{ icon: 'table', label: 'Modifier les données', size: 'lg', on: () => C.chartData() }] },
    { label: 'Type', items: [{ type: 'menu', icon: 'chart-column', label: 'Type de graphique', size: 'lg', items: () => P.CHART_KINDS.map((k) => ({ label: k[1], icon: k[2], checked: chartOf().kind === k[0], on: () => chartSet((c) => { c.kind = k[0]; }) })) }] },
    { label: 'Éléments', items: [{ type: 'col', items: [{ icon: 'heading', label: 'Titre', active: () => !!chartOf().title, on: async () => { const t = await O.prompt('Titre du graphique', 'Titre', chartOf().title || ''); if (t != null) chartSet((c) => { c.title = t; }); } }, { type: 'menu', icon: 'list', label: 'Légende', items: () => [['bottom', 'En bas'], ['top', 'En haut'], ['right', 'À droite'], ['none', 'Aucune']].map((x) => ({ label: x[1], checked: chartOf().legend === x[0], on: () => chartSet((c) => { c.legend = x[0]; }) })) }, { icon: 'tag', label: 'Étiquettes de données', active: () => !!chartOf().labels, on: () => chartSet((c) => { c.labels = !c.labels; }) }] }, { type: 'col', items: [{ icon: 'grid-3x3', label: 'Quadrillage', active: () => chartOf().grid !== false, on: () => chartSet((c) => { c.grid = c.grid === false; }) }, { icon: 'spline', label: 'Courbes lissées', active: () => !!chartOf().smooth, on: () => chartSet((c) => { c.smooth = !c.smooth; }) }, { type: 'num', id: 'cfs', icon: 'type', label: 'Texte', unit: 'px', width: 50, min: 8, max: 40, value: () => chartOf().fontSize || 14, on: (c, v) => chartSet((x) => { x.fontSize = v; }) }] }] },
    { label: 'Couleurs', items: [{ type: 'menu', icon: 'palette', label: 'Couleurs des séries', size: 'lg', items: () => (chartOf().kind === 'pie' || chartOf().kind === 'doughnut' ? (chartOf().cats || []).map((n, i) => ({ label: n, on: () => pick(null, A.ribbon.el, (v) => chartSet((c) => { c.catColors = c.catColors || []; c.catColors[i] = v; }), {}) })) : (chartOf().series || []).map((s, i) => ({ label: s.name, html: '<span style="display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:6px;background:' + P.seriesColor(i, A.doc, s.color) + '"></span>' + O.esc(s.name), on: () => pick(null, A.ribbon.el, (v) => chartSet((c) => { c.series[i].color = v || undefined; }), { none: 'Couleur du thème' }) }))).concat(['-', { label: 'Couleurs du thème', on: () => chartSet((c) => { c.series.forEach((s) => delete s.color); delete c.catColors; }) }]) }] },
    { label: 'Accessibilité', items: [{ icon: 'scan-text', label: 'Texte de remplacement', size: 'lg', on: () => C.altText() }] },
    arrangeGroup(), { label: 'Taille', items: [sizeItems()] }
  ] });
  TABS.push({ id: 'smartfmt', label: 'SmartArt', contextual: () => selType('smartart'), groups: [
    { label: 'Contenu', items: [{ icon: 'list-tree', label: 'Modifier le texte', size: 'lg', on: () => C.smartText() }] },
    { label: 'Dispositions', items: [{ type: 'gallery', id: 'sakinds', w: 70, h: 52, title: 'Dispositions', items: () => P.SMART_KINDS.map((k) => ({ id: k[0], title: k[1], html: '<div class="tr-gal">' + O.icon(k[2]) + '<span>' + k[1] + '</span></div>' })), current: () => (one() || {}).kind, on: (c, k) => C.setProp((e) => { if (e.type === 'smartart') e.kind = k.id; }, 'Disposition SmartArt') }] },
    { label: 'Styles', items: [{ type: 'menu', icon: 'palette', label: 'Couleurs', size: 'lg', items: () => [['accent', 'Accent 1'], ['colorful', 'Multicolore'], ['gradient', 'Dégradé'], ['mono', 'Nuances']].map((x) => ({ label: x[1], checked: (one() || {}).palette === x[0], on: () => C.setProp((e) => { e.palette = x[0]; }, 'Couleurs SmartArt') })) }, { icon: 'shapes', label: 'Convertir en formes', size: 'lg', on: () => C.smartToShapes() }] },
    arrangeGroup(), { label: 'Taille', items: [sizeItems()] }
  ] });
  TABS.push({ id: 'mediafmt', label: 'Lecture', contextual: () => selType('video', 'audio'), groups: [
    { label: 'Options', items: [{ icon: 'settings-2', label: 'Options du média', size: 'lg', on: () => C.mediaOptions() }, { type: 'col', items: [{ icon: 'play', label: 'Lecture automatique', active: () => !!(one() || {}).autoplay, on: () => C.setProp((e) => { e.autoplay = !e.autoplay; }, 'Lecture automatique') }, { icon: 'repeat', label: 'En boucle', active: () => !!(one() || {}).loop, on: () => C.setProp((e) => { e.loop = !e.loop; }, 'Boucle') }, { icon: 'image', label: 'Image d\'aperçu (image actuelle)', disabled: () => !selType('video') || !!(one() || {}).url, on: () => C.posterFromFrame() }] }] },
    { label: 'Accessibilité', items: [{ icon: 'scan-text', label: 'Texte de remplacement', size: 'lg', on: () => C.altText() }] },
    arrangeGroup(), { label: 'Taille', items: [sizeItems()] }
  ] });
  TABS.push({ id: 'eqfmt', label: 'Équation', contextual: () => selType('equation'), groups: [
    { label: 'Équation', items: [{ icon: 'sigma', label: 'Modifier', size: 'lg', on: () => C.equation(one()) }, { type: 'color', id: 'eqc', icon: 'baseline', label: 'Couleur', showLabel: true, def: 't:accent1', css: colorCss, value: () => (one() || {}).color || 't:tx1', on: (c, v) => C.setProp((e) => { e.color = v || 't:tx1'; }, 'Couleur'), picker: (c, a, ap) => pick(c, a, ap, {}) }] },
    arrangeGroup()
  ] });
  TABS.push({ id: 'iconfmt', label: 'Icône', contextual: () => selType('icon'), groups: [
    { label: 'Icône', items: [{ icon: 'smile-plus', label: 'Changer l\'icône', size: 'lg', on: () => C.changeIcon() }, { type: 'col', items: [{ type: 'color', id: 'icc', icon: 'pen-tool', label: 'Couleur', showLabel: true, def: 't:accent1', css: colorCss, value: () => (one() || {}).color, on: (c, v) => C.setProp((e) => { e.color = v || 't:tx1'; }, 'Couleur'), picker: (c, a, ap) => pick(c, a, ap, {}) }, { type: 'color', id: 'icf', icon: 'paint-bucket', label: 'Remplissage', showLabel: true, def: 't:accent1/+60', css: colorCss, value: () => (one() || {}).iconFill || null, on: (c, v) => C.setProp((e) => { e.iconFill = v || null; }, 'Remplissage'), picker: (c, a, ap) => pick(c, a, ap, { none: 'Aucun' }) }, { type: 'num', id: 'icsw', icon: 'minus', label: 'Trait', width: 50, step: 0.25, min: 0.5, max: 4, value: () => (one() || {}).sw || 2, on: (c, v) => C.setProp((e) => { e.sw = v; }, 'Épaisseur') }] }] },
    arrangeGroup(), { label: 'Taille', items: [sizeItems()] }
  ] });

  /* ---------------- volets ---------------- */
  A.pane = null;
  A.openPane = function (name) {
    A.pane = name;
    const p = $('#pane'); p.hidden = !name;
    if (name) renderPane();
    A.layoutStage(); A.refreshUi();
  };
  const PANES = { format: 'Format', bg: 'Format de l\'arrière-plan', anim: 'Volet Animation', comments: 'Commentaires', find: 'Rechercher et remplacer', a11y: 'Accessibilité', selection: 'Sélection' };
  function renderPane() {
    const p = $('#pane'); if (!A.pane) return;
    if (!p._init) { p._init = true; p.innerHTML = '<div class="pane-hd"><b></b><button type="button" class="o-x" aria-label="Fermer le volet">' + O.icon('x') + '</button></div><div class="pane-bd"></div>'; p.querySelector('.o-x').onclick = () => A.openPane(null); }
    p.querySelector('.pane-hd b').textContent = PANES[A.pane] || '';
    const bd = p.querySelector('.pane-bd');
    const f = { format: paneFormat, bg: paneBg, anim: paneAnim, comments: paneComments, find: paneFind, a11y: paneA11y, selection: paneSelection }[A.pane];
    if (f) f(bd);
  }
  let paneT = null;
  A.paneRefresh = function () { if (!A.pane || A.pane === 'find') return; const ae = document.activeElement; if (ae && ae.closest && ae.closest('#pane') && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return; clearTimeout(paneT); paneT = setTimeout(renderPane, 30); };
  const row = (label, inner) => '<div class="fp-row"><label>' + label + '</label>' + inner + '</div>';
  const sw = (k, val) => '<button type="button" class="swatch" data-sw="' + k + '" aria-label="Couleur"><i style="background:' + (val ? colorCss(val) : 'transparent') + '"></i></button>';
  const seg = (k, opts, cur) => '<div class="seg2" data-seg="' + k + '">' + opts.map((o) => '<button type="button" data-v="' + o[0] + '"' + (String(cur) === String(o[0]) ? ' class="on"' : '') + '>' + o[1] + '</button>').join('') + '</div>';
  const nm = (k, v, step, min, max) => '<input type="number" data-n="' + k + '" value="' + (v == null ? '' : O.round(v, 2)) + '" step="' + (step || 1) + '"' + (min != null ? ' min="' + min + '"' : '') + (max != null ? ' max="' + max + '"' : '') + '>';
  const rng = (k, v, min, max, step) => '<input type="range" data-r="' + k + '" value="' + v + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '"><span style="min-width:40px;text-align:right">' + v + '</span>';
  function bindPane(bd, h) {
    bd.oninput = (ev) => { const r = ev.target.dataset.r; if (r) { ev.target.nextElementSibling.textContent = ev.target.value; h.range && h.range(r, +ev.target.value, false); } };
    bd.onchange = (ev) => { const t = ev.target; if (t.dataset.r) h.range && h.range(t.dataset.r, +t.value, true); else if (t.dataset.n) { const v = parseFloat(String(t.value).replace(',', '.')); if (!isNaN(v)) h.num && h.num(t.dataset.n, v); } else if (t.dataset.c) h.check && h.check(t.dataset.c, t.checked); else if (t.dataset.s) h.select && h.select(t.dataset.s, t.value); else if (t.dataset.t) h.text && h.text(t.dataset.t, t.value); };
    bd.onclick = (ev) => {
      const s = ev.target.closest('[data-sw]'); if (s) { h.swatch && h.swatch(s.dataset.sw, s); return; }
      const g = ev.target.closest('[data-seg] [data-v]'); if (g) { h.seg && h.seg(g.closest('[data-seg]').dataset.seg, g.dataset.v); return; }
      const b = ev.target.closest('[data-act]'); if (b) { h.act && h.act(b.dataset.act, b); }
    };
  }
  function paneFormat(bd) {
    const els = A.selEls(), e = els[0];
    if (!e) { bd.innerHTML = '<p class="o-hint">Sélectionnez un objet pour modifier son format.</p><p><button type="button" class="mini-btn" data-act="bg">' + O.icon('paint-bucket') + 'Format de l\'arrière-plan</button></p>'; bindPane(bd, { act: () => A.openPane('bg') }); return; }
    const isShape = e.type === 'shape' || e.type === 'text', isImg = e.type === 'image';
    const fill = e.fill || null, ft = !fill ? 'none' : fill.type;
    let h = '';
    if (isShape) {
      h += '<details class="fp-sec" open><summary>Remplissage</summary>' + seg('ftype', [['none', 'Aucun'], ['solid', 'Uni'], ['gradient', 'Dégradé'], ['image', 'Image']], ft);
      if (ft === 'solid') h += row('Couleur', sw('fill', fill.color)) + row('Transparence', rng('falpha', Math.round((1 - (fill.alpha == null ? 1 : fill.alpha)) * 100), 0, 100));
      if (ft === 'gradient') { const st = fill.stops || []; h += row('Couleur 1', sw('g0', (st[0] || {}).c)) + row('Couleur 2', sw('g1', (st[st.length - 1] || {}).c)) + row('Type', seg('gkind', [['linear', 'Linéaire'], ['radial', 'Radial']], fill.kind || 'linear')) + row('Angle', rng('gang', fill.angle || 0, 0, 359)); }
      if (ft === 'image') h += '<p><button type="button" class="mini-btn" data-act="fillimg">' + O.icon('image') + 'Choisir une image…</button></p>';
      h += '</details>';
    }
    if (isShape || isImg || e.type === 'line') {
      const l = e.line;
      h += '<details class="fp-sec" open><summary>Trait</summary>' + seg('ltype', [['none', 'Aucun'], ['solid', 'Trait']], l && l.w ? 'solid' : 'none');
      if (l && l.w) h += row('Couleur', sw('line', l.color)) + row('Épaisseur (pt)', nm('lw', l.w, 0.25, 0.25, 50)) + row('Tirets', '<select data-s="dash">' + [['solid', 'Continu'], ['dash', 'Tirets'], ['dot', 'Points'], ['dashDot', 'Tiret-point'], ['longDash', 'Tirets longs']].map((d) => '<option value="' + d[0] + '"' + (l.dash === d[0] ? ' selected' : '') + '>' + d[1] + '</option>').join('') + '</select>') + row('Transparence', rng('lalpha', Math.round((1 - (l.alpha == null ? 1 : l.alpha)) * 100), 0, 100));
      if (e.type === 'line' && l) { const ar = [['none', 'Aucune'], ['triangle', 'Triangle'], ['arrow', 'Ouverte'], ['stealth', 'Effilée'], ['oval', 'Rond'], ['diamond', 'Losange']]; h += row('Début', '<select data-s="tail">' + ar.map((a) => '<option value="' + a[0] + '"' + ((l.tail || 'none') === a[0] ? ' selected' : '') + '>' + a[1] + '</option>').join('') + '</select>') + row('Fin', '<select data-s="head">' + ar.map((a) => '<option value="' + a[0] + '"' + ((l.head || 'none') === a[0] ? ' selected' : '') + '>' + a[1] + '</option>').join('') + '</select>'); }
      h += '</details>';
    }
    const sh = e.shadow;
    h += '<details class="fp-sec"><summary>Ombre et transparence</summary>' + seg('shon', [['0', 'Sans ombre'], ['1', 'Ombre']], sh ? '1' : '0');
    if (sh) h += row('Couleur', sw('shc', sh.color || '#000000')) + row('Flou', rng('shb', sh.blur == null ? 6 : sh.blur, 0, 60)) + row('Décalage X', rng('shx', sh.x == null ? 3 : sh.x, -40, 40)) + row('Décalage Y', rng('shy', sh.y == null ? 3 : sh.y, -40, 40)) + row('Opacité', rng('sha', Math.round((sh.alpha == null ? 0.4 : sh.alpha) * 100), 0, 100));
    h += row('Transparence de l\'objet', rng('opac', Math.round((1 - (e.opacity == null ? 1 : e.opacity)) * 100), 0, 100)) + '</details>';
    if (isImg) { const fx = e.fx || {}; h += '<details class="fp-sec" open><summary>Corrections de l\'image</summary>' + row('Luminosité', rng('fxb', fx.bright || 0, -100, 100)) + row('Contraste', rng('fxc', fx.contrast || 0, -100, 100)) + row('Saturation', rng('fxs', fx.sat == null ? 100 : fx.sat, 0, 300)) + row('Transparence', rng('fxa', Math.round((1 - (fx.alpha == null ? 1 : fx.alpha)) * 100), 0, 100)) + row('Flou', rng('fxbl', fx.blur || 0, 0, 20)) + '<label class="o-check"><input type="checkbox" data-c="gray"' + (fx.gray ? ' checked' : '') + '><span>Niveaux de gris</span></label><label class="o-check"><input type="checkbox" data-c="sepia"' + (fx.sepia ? ' checked' : '') + '><span>Sépia</span></label><p><button type="button" class="mini-btn" data-act="rmbg">' + O.icon('wand-sparkles') + 'Supprimer l\'arrière-plan</button> <button type="button" class="mini-btn" data-act="reset">' + O.icon('rotate-ccw') + 'Rétablir</button></p>' + row('Tolérance du détourage', rng('tol', A._tol || 40, 5, 120)) + '</details>'; }
    if (isShape) {
      const pad = e.pad || [9.6, 4.8, 9.6, 4.8], cmv = (px) => O.round(px / 96 * 2.54, 2);
      h += '<details class="fp-sec"><summary>Zone de texte</summary>' + row('Alignement vertical', seg('va', [['top', 'Haut'], ['middle', 'Milieu'], ['bottom', 'Bas']], e.va || 'top')) +
        row('Ajustement', '<select data-s="autofit"><option value="none"' + (e.autofit === 'none' ? ' selected' : '') + '>Ne pas ajuster</option><option value="shrink"' + (e.autofit === 'shrink' ? ' selected' : '') + '>Réduire le texte en cas de dépassement</option><option value="grow"' + (e.autofit === 'grow' ? ' selected' : '') + '>Ajuster la forme au texte</option></select>') +
        row('Marge gauche (cm)', nm('pl', cmv(pad[0]), 0.05, 0)) + row('Marge droite (cm)', nm('pr', cmv(pad[2]), 0.05, 0)) + row('Marge haut (cm)', nm('pt', cmv(pad[1]), 0.05, 0)) + row('Marge bas (cm)', nm('pb', cmv(pad[3]), 0.05, 0)) +
        '<label class="o-check"><input type="checkbox" data-c="wrap"' + (e.wrap !== false ? ' checked' : '') + '><span>Renvoyer le texte à la ligne</span></label>' + row('Colonnes', nm('cols', e.cols || 1, 1, 1, 6)) + row('Espacement des colonnes (cm)', nm('colGap', cmv(e.colGap || 24), 0.1, 0)) + '</details>';
    }
    const a = A.abs(e), cmv2 = (px) => O.round(px / 96 * 2.54, 2);
    h += '<details class="fp-sec"><summary>Taille et position</summary>' + row('Largeur (cm)', nm('w', cmv2(e.w), 0.1, 0.05)) + row('Hauteur (cm)', nm('h', cmv2(e.h), 0.1, 0.05)) + row('Rotation (°)', nm('rot', e.rot || 0, 1, -360, 360)) + row('Position X (cm)', nm('x', cmv2(a.x), 0.1)) + row('Position Y (cm)', nm('y', cmv2(a.y), 0.1)) + '<label class="o-check"><input type="checkbox" data-c="lockRatio"' + (e.lockRatio ? ' checked' : '') + '><span>Conserver les proportions</span></label><label class="o-check"><input type="checkbox" data-c="locked"' + (e.locked ? ' checked' : '') + '><span>Verrouiller la position</span></label></details>';
    h += '<details class="fp-sec"' + (isImg && !e.alt ? ' open' : '') + '><summary>Texte de remplacement</summary><div class="fp-row"><textarea data-t="alt" rows="3" placeholder="Description pour les lecteurs d\'écran">' + O.esc(e.alt || '') + '</textarea></div><label class="o-check"><input type="checkbox" data-c="decorative"' + (e.decorative ? ' checked' : '') + '><span>Marquer comme décoratif</span></label></details>';
    h += '<details class="fp-sec"><summary>Nom</summary><div class="fp-row"><input type="text" data-t="name" value="' + O.esc(e.name || '') + '" placeholder="Nom dans le volet Sélection"></div></details>';
    bd.innerHTML = h;
    const set = (fn, label, live) => { els.forEach(fn); if (live) { A.renderCanvas(); A.renderOverlay(); } else A.change(label || 'Format'); };
    bindPane(bd, {
      seg: (k, v) => {
        if (k === 'ftype') set((x) => { if (v === 'none') x.fill = null; else if (v === 'solid') x.fill = { type: 'solid', color: (x.fill && (x.fill.color || (x.fill.stops && x.fill.stops[0].c))) || 't:accent1' }; else if (v === 'gradient') { const c = (x.fill && x.fill.color) || 't:accent1'; x.fill = { type: 'gradient', kind: 'linear', angle: 180, stops: [{ c: c.replace(/\/.*/, '') + '/+40', p: 0 }, { c: c.replace(/\/.*/, '') + '/-25', p: 100 }] }; } else { C.pickFillImage(); } }, 'Remplissage');
        if (k === 'gkind') set((x) => { if (x.fill) x.fill.kind = v; }, 'Dégradé');
        if (k === 'ltype') set((x) => { x.line = v === 'none' ? null : Object.assign({ color: 't:tx1', w: 1.5, dash: 'solid' }, x.line || {}, { w: (x.line && x.line.w) || 1.5 }); }, 'Trait');
        if (k === 'shon') set((x) => { x.shadow = v === '1' ? { color: '#000000', blur: 8, x: 4, y: 4, alpha: 0.4 } : null; }, 'Ombre');
        if (k === 'va') set((x) => { x.va = v; }, 'Alignement vertical');
      },
      swatch: (k, el) => pick(null, el, (v) => {
        if (k === 'fill') set((x) => { x.fill = v ? Object.assign({}, x.fill, { type: 'solid', color: v }) : null; }, 'Remplissage');
        if (k === 'g0' || k === 'g1') set((x) => { if (x.fill && x.fill.stops) x.fill.stops[k === 'g0' ? 0 : x.fill.stops.length - 1].c = v || '#FFFFFF'; }, 'Dégradé');
        if (k === 'line') set((x) => { if (!v) x.line = null; else x.line = Object.assign({}, x.line, { color: v }); }, 'Trait');
        if (k === 'shc') set((x) => { if (x.shadow) x.shadow.color = v || '#000000'; }, 'Ombre');
      }, { none: k === 'fill' || k === 'line' ? 'Aucun' : null }),
      range: (k, v, commit) => {
        const map = {
          falpha: (x) => { if (x.fill) x.fill.alpha = O.round(1 - v / 100, 2); }, gang: (x) => { if (x.fill) x.fill.angle = v; }, lalpha: (x) => { if (x.line) x.line.alpha = O.round(1 - v / 100, 2); },
          shb: (x) => { if (x.shadow) x.shadow.blur = v; }, shx: (x) => { if (x.shadow) x.shadow.x = v; }, shy: (x) => { if (x.shadow) x.shadow.y = v; }, sha: (x) => { if (x.shadow) x.shadow.alpha = v / 100; },
          opac: (x) => { x.opacity = v ? O.round(1 - v / 100, 2) : undefined; },
          fxb: (x) => { x.fx = Object.assign({}, x.fx, { bright: v }); }, fxc: (x) => { x.fx = Object.assign({}, x.fx, { contrast: v }); }, fxs: (x) => { x.fx = Object.assign({}, x.fx, { sat: v }); }, fxa: (x) => { x.fx = Object.assign({}, x.fx, { alpha: O.round(1 - v / 100, 2) }); }, fxbl: (x) => { x.fx = Object.assign({}, x.fx, { blur: v }); },
          tol: () => { A._tol = v; }
        };
        if (map[k]) set(map[k], 'Format', !commit);
      },
      num: (k, v) => {
        const px = v / 2.54 * 96;
        if (k === 'lw') set((x) => { if (x.line) x.line.w = v; }, 'Épaisseur');
        if (k === 'cols') set((x) => { x.cols = Math.max(1, Math.round(v)); }, 'Colonnes');
        if (k === 'colGap') set((x) => { x.colGap = px; }, 'Colonnes');
        if (/^p[lrtb]$/.test(k)) set((x) => { const p = (x.pad || [9.6, 4.8, 9.6, 4.8]).slice(); p[{ pl: 0, pt: 1, pr: 2, pb: 3 }[k]] = O.round(px, 1); x.pad = p; }, 'Marges');
        if (k === 'w' || k === 'h') { sizeSet(k, v); return; }
        if (k === 'rot') set((x) => { x.rot = ((v % 360) + 360) % 360; }, 'Rotation');
        if (k === 'x' || k === 'y') set((x) => { const o = A.offset(x); x[k] = px - (k === 'x' ? o.dx : o.dy); }, 'Position');
      },
      check: (k, v) => {
        if (k === 'gray' || k === 'sepia') set((x) => { x.fx = Object.assign({}, x.fx, { [k]: v }); }, 'Couleur');
        if (k === 'wrap') set((x) => { x.wrap = v; }, 'Renvoi à la ligne');
        if (k === 'lockRatio' || k === 'locked' || k === 'decorative') set((x) => { x[k] = v; }, 'Format');
      },
      select: (k, v) => { if (k === 'dash') set((x) => { if (x.line) x.line.dash = v; }, 'Tirets'); if (k === 'autofit') set((x) => { x.autofit = v; delete x.fit; }, 'Ajustement'); if (k === 'head' || k === 'tail') set((x) => { if (x.line) x.line[k] = v; }, 'Flèches'); },
      text: (k, v) => set((x) => { x[k] = v; }, k === 'alt' ? 'Texte de remplacement' : 'Nom'),
      act: (k) => { if (k === 'rmbg') C.removeBg(A._tol || 40); if (k === 'reset') C.resetImage(); if (k === 'fillimg') C.pickFillImage(); }
    });
  }
  C.pickFillImage = async function () { const f = (await O.Files.pickMedia('image/*', false))[0]; if (!f) return; const id = P.addMedia(A.doc, f, f.name); C.setProp((x) => { x.fill = { type: 'image', media: id }; }, 'Remplissage image'); };
  function paneBg(bd) {
    const s = A.view === 'master' ? null : A.doc.slides[A.cur];
    const bg = s ? (s.bg || null) : A.doc.master.bg; const eff = s ? P.effectiveBg(A.doc, s) : (A.doc.master.bg || P.theme(A.doc).bg);
    const tp = !bg ? 'theme' : bg.type;
    let h = seg('bt', [['theme', 'Thème'], ['solid', 'Uni'], ['gradient', 'Dégradé'], ['image', 'Image']], tp);
    if (tp === 'solid') h += row('Couleur', sw('bc', bg.color));
    if (tp === 'gradient') h += row('Couleur 1', sw('b0', bg.stops[0].c)) + row('Couleur 2', sw('b1', bg.stops[bg.stops.length - 1].c)) + row('Type', seg('bk', [['linear', 'Linéaire'], ['radial', 'Radial']], bg.kind || 'linear')) + row('Angle', rng('ba', bg.angle || 0, 0, 359));
    if (tp === 'image') h += '<p><button type="button" class="mini-btn" data-act="img">' + O.icon('image') + 'Choisir une image…</button></p>' + row('Ajustement', seg('bf', [['cover', 'Remplir'], ['contain', 'Ajuster'], ['stretch', 'Étirer'], ['tile', 'Mosaïque']], bg.fit || 'cover'));
    if (s) h += '<label class="o-check"><input type="checkbox" data-c="hide"' + (s.hideMaster ? ' checked' : '') + '><span>Masquer les graphiques d\'arrière-plan</span></label>';
    h += '<p style="display:flex;gap:6px;flex-wrap:wrap">' + (s ? '<button type="button" class="mini-btn" data-act="all">' + O.icon('copy-check') + 'Appliquer partout</button>' : '') + '<button type="button" class="mini-btn" data-act="reset">' + O.icon('rotate-ccw') + 'Rétablir l\'arrière-plan</button></p>';
    h += '<p class="o-hint">Le fond du thème suit le thème choisi (onglet Création). Contraste : ' + (function () { const c = O.contrast(T.resolve(bgMain(eff), A.theme()) || '#ffffff', T.resolve('t:tx1', A.theme())); return O.round(c, 1).toString().replace('.', ',') + ' : 1 avec le texte' + (c < 4.5 ? ' (insuffisant)' : ''); })() + '</p>';
    bd.innerHTML = h;
    const setBg = (v, label) => { if (s) s.bg = v; else A.doc.master.bg = v; A.change(label || 'Arrière-plan'); };
    bindPane(bd, {
      seg: (k, v) => {
        if (k === 'bt') { if (v === 'theme') setBg(null); else if (v === 'solid') setBg({ type: 'solid', color: eff && eff.color || 't:bg1' }); else if (v === 'gradient') setBg({ type: 'gradient', kind: 'linear', angle: 180, stops: [{ c: 't:bg1', p: 0 }, { c: 't:accent1/+60', p: 100 }] }); else pickBg(); }
        if (k === 'bk' && bg) { bg.kind = v; setBg(bg); } if (k === 'bf' && bg) { bg.fit = v; setBg(bg); }
      },
      swatch: (k, el) => pick(null, el, (v) => { if (!v) return; if (k === 'bc') setBg({ type: 'solid', color: v }); else if (bg && bg.stops) { bg.stops[k === 'b0' ? 0 : bg.stops.length - 1].c = v; setBg(bg); } }),
      range: (k, v, commit) => { if (k === 'ba' && bg) { bg.angle = v; if (commit) setBg(bg); else { if (s) s.bg = bg; A.renderCanvas(); } } },
      check: (k, v) => { if (k === 'hide' && s) { s.hideMaster = v; A.change('Graphiques d\'arrière-plan'); } },
      act: (k) => { if (k === 'img') pickBg(); if (k === 'all') { const v = O.clone(s.bg); A.doc.slides.forEach((x) => { x.bg = O.clone(v); }); A.change('Arrière-plan appliqué partout'); } if (k === 'reset') setBg(null, 'Rétablir l\'arrière-plan'); }
    });
    async function pickBg() { const f = (await O.Files.pickMedia('image/*', false))[0]; if (!f) return; const d = await P.imageSize(f); setBg({ type: 'image', media: P.addMedia(A.doc, f, f.name, { w: d.w, h: d.h }), fit: 'cover' }, 'Image d\'arrière-plan'); }
  }
  const bgMain = (b) => !b ? 't:bg1' : b.type === 'solid' ? b.color : b.type === 'gradient' ? b.stops[0].c : 't:bg1';
  function paneAnim(bd) {
    const s = A.doc.slides[A.cur]; if (!s || A.view === 'master') { bd.innerHTML = '<p class="o-hint">Les animations se règlent sur les diapositives.</p>'; return; }
    const list = s.anims || [], a = selAnim();
    let h = '<p style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0"><button type="button" class="mini-btn pri" data-act="play">' + O.icon('play') + 'Lire tout</button><button type="button" class="mini-btn" data-act="playone"' + (a ? '' : ' disabled') + '>' + O.icon('play') + 'Lire la sélection</button></p>';
    if (!list.length) h += '<p class="o-hint">Aucune animation. Sélectionnez un objet puis choisissez un effet dans l\'onglet Animations.</p>';
    let click = 0;
    h += '<div class="an-list">' + list.map((x) => { if (x.start === 'click') click++; const el = P.findEl(s, x.el); const lab = el ? (el.name || (el.html ? RT.textOf(el.html).slice(0, 30) : '') || { image: 'Image', shape: 'Forme', text: 'Zone de texte', chart: 'Graphique', table: 'Tableau', icon: 'Icône', video: 'Vidéo', smartart: 'SmartArt', equation: 'Équation', group: 'Groupe', line: 'Ligne', audio: 'Son' }[el.type] || el.type) : '(objet supprimé)'; return '<div class="an-it' + (a && a.id === x.id ? ' on' : '') + '" data-a="' + x.id + '" draggable="true"><span class="n">' + (x.start === 'click' ? click : '') + '</span>' + O.icon(x.start === 'click' ? 'mouse-pointer-click' : x.start === 'after' ? 'clock' : 'link') + '<i class="k ' + x.cat + '"></i><span class="l">' + O.esc(lab) + ' · ' + O.esc(P.animName(x)) + '</span><span class="bar" style="width:' + Math.max(6, Math.min(60, (x.dur || 0.5) * 20)) + 'px;margin-left:' + Math.min(30, (x.delay || 0) * 10) + 'px"></span></div>'; }).join('') + '</div>';
    if (a) {
      const fx = P.ANIMS[a.cat] || [];
      h += '<div class="fp-sec">' + row('Effet', '<select data-s="fx">' + fx.map((f) => '<option value="' + f[0] + '"' + (f[0] === a.fx ? ' selected' : '') + '>' + f[1] + '</option>').join('') + '</select>') + row('Démarrer', '<select data-s="start"><option value="click"' + (a.start === 'click' ? ' selected' : '') + '>Au clic</option><option value="with"' + (a.start === 'with' ? ' selected' : '') + '>Avec la précédente</option><option value="after"' + (a.start === 'after' ? ' selected' : '') + '>Après la précédente</option></select>') +
        (P.ANIM_DIRS[a.fx] ? row('Direction', '<select data-s="dir">' + [['b', 'Par le bas'], ['l', 'Par la gauche'], ['r', 'Par la droite'], ['t', 'Par le haut']].map((d) => '<option value="' + d[0] + '"' + ((a.dir || 'b') === d[0] ? ' selected' : '') + '>' + d[1] + '</option>').join('') + '</select>') : '') +
        row('Durée (s)', nm('dur', a.dur, 0.1, 0, 60)) + row('Délai (s)', nm('delay', a.delay || 0, 0.1, 0, 60)) + row('Répéter', nm('repeat', a.repeat || 1, 1, 1, 20)) +
        '<p style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn" data-act="up">' + O.icon('arrow-up') + 'Plus tôt</button><button type="button" class="mini-btn" data-act="down">' + O.icon('arrow-down') + 'Plus tard</button><button type="button" class="mini-btn" data-act="del">' + O.icon('trash-2') + 'Supprimer</button></p></div>';
    }
    bd.innerHTML = h;
    bd.querySelectorAll('.an-it').forEach((it) => {
      it.addEventListener('click', () => { A.animSel = it.dataset.a; const x = list.find((q) => q.id === it.dataset.a); if (x && P.findEl(s, x.el)) { A.sel = [x.el]; A.renderOverlay(); } A.refreshUi(); renderPane(); });
      it.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-anim', it.dataset.a); });
      it.addEventListener('dragover', (e) => e.preventDefault());
      it.addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/x-anim'); const from = list.findIndex((q) => q.id === id), to = list.findIndex((q) => q.id === it.dataset.a); if (from < 0 || to < 0 || from === to) return; const [m] = list.splice(from, 1); list.splice(to, 0, m); A.change('Ordre des animations'); });
    });
    bindPane(bd, { select: (k, v) => C.animProp(k, v), num: (k, v) => C.animProp(k, v), act: (k) => { if (k === 'play') A.cmd.previewAnim(); if (k === 'playone' && a) A.cmd.previewAnim(a.id); if (k === 'up') C.animMove(-1); if (k === 'down') C.animMove(1); if (k === 'del') C.animDel(); } });
  }
  function paneComments(bd) {
    const s = A.doc.slides[A.cur]; const list = (s && s.comments) || [];
    let h = '<p><button type="button" class="mini-btn pri" data-act="new">' + O.icon('message-square-plus') + 'Nouveau commentaire</button></p>';
    if (!list.length) h += '<p class="o-hint">Aucun commentaire sur cette diapositive.</p>';
    h += list.map((c, i) => '<div class="cm' + (c.done ? ' done' : '') + '" data-c="' + c.id + '"><div class="who"><span class="av">' + O.esc((c.author || '?').slice(0, 1).toUpperCase()) + '</span>' + O.esc(c.author || '') + '<small>' + (i + 1) + ' · ' + O.ago(c.at) + '</small></div><p>' + O.esc(c.text) + '</p>' + (c.replies || []).map((r) => '<div class="rep"><div class="who" style="font-size:12px">' + O.esc(r.author) + '<small>' + O.ago(r.at) + '</small></div><p>' + O.esc(r.text) + '</p></div>').join('') + '<div class="acts"><button type="button" class="mini-btn" data-act="reply">' + O.icon('reply') + 'Répondre</button><button type="button" class="mini-btn" data-act="done">' + O.icon(c.done ? 'rotate-ccw' : 'check') + (c.done ? 'Rouvrir' : 'Résoudre') + '</button><button type="button" class="mini-btn" data-act="del">' + O.icon('trash-2') + '</button></div></div>').join('');
    const others = A.doc.slides.map((x, i) => ({ i, n: (x.comments || []).filter((c) => !c.done).length })).filter((x) => x.n && x.i !== A.cur);
    if (others.length) h += '<h4 style="margin:14px 0 6px;font-size:13px">Autres diapositives</h4>' + others.map((x) => '<button type="button" class="mini-btn" data-act="go" data-i="' + x.i + '" style="margin:2px">Diapo ' + (x.i + 1) + ' (' + x.n + ')</button>').join('');
    bd.innerHTML = h;
    bindPane(bd, { act: async (k, b) => {
      if (k === 'new') { C.comment(); return; }
      if (k === 'go') { A.goto(+b.dataset.i); renderPane(); return; }
      const c = list.find((x) => x.id === b.closest('[data-c]').dataset.c); if (!c) return;
      if (k === 'reply') { const t = await O.prompt('Répondre', 'Réponse', '', { multiline: true, rows: 3 }); if (t && t.trim()) { c.replies = c.replies || []; c.replies.push({ author: localStorage.getItem('presentation:auteur') || 'Moi', at: Date.now(), text: t.trim() }); A.change('Réponse'); } }
      if (k === 'done') { c.done = !c.done; A.change(c.done ? 'Commentaire résolu' : 'Commentaire rouvert'); }
      if (k === 'del') { s.comments = list.filter((x) => x !== c); A.change('Supprimer le commentaire'); }
    } });
  }
  /* ----- rechercher / remplacer ----- */
  let findState = { q: '', r: '', cs: false, whole: false, notes: false, hits: [], k: -1 };
  C.find = function (replace) { A.openPane('find'); findState.replace = !!replace; renderPane(); setTimeout(() => { const i = document.querySelector('#pane [data-t="q"]'); if (i) { i.focus(); i.select(); } }, 30); };
  function findHits() {
    const hits = []; const q = findState.q; if (!q) return hits;
    const opt = { caseSensitive: findState.cs, whole: findState.whole };
    A.doc.slides.forEach((s, i) => {
      P.walk(s.elements, (e) => { if (e.html) { const n = RT.countIn(e.html, q, opt); for (let k = 0; k < n; k++) hits.push({ i, el: e.id, k }); } if (e.type === 'table') e.rows.forEach((r, ri) => r.cells.forEach((c, ci) => { const n = RT.countIn(c.html || '', q, opt); for (let k = 0; k < n; k++) hits.push({ i, el: e.id, cell: [ri, ci], k }); })); });
      if (findState.notes) { const n = RT.countIn(s.notes || '', q, opt); for (let k = 0; k < n; k++) hits.push({ i, notes: true, k }); }
    });
    return hits;
  }
  function paneFind(bd) {
    const f = findState;
    bd.innerHTML = '<div class="fp-row"><input type="text" data-t="q" placeholder="Rechercher" value="' + O.esc(f.q) + '"></div>' + (f.replace ? '<div class="fp-row"><input type="text" data-t="r" placeholder="Remplacer par" value="' + O.esc(f.r) + '"></div>' : '') +
      '<label class="o-check"><input type="checkbox" data-c="cs"' + (f.cs ? ' checked' : '') + '><span>Respecter la casse</span></label><label class="o-check"><input type="checkbox" data-c="whole"' + (f.whole ? ' checked' : '') + '><span>Mot entier</span></label><label class="o-check"><input type="checkbox" data-c="notes"' + (f.notes ? ' checked' : '') + '><span>Chercher aussi dans les notes</span></label>' +
      '<p style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn" data-act="prev">' + O.icon('chevron-up') + 'Précédent</button><button type="button" class="mini-btn pri" data-act="next">' + O.icon('chevron-down') + 'Suivant</button>' + (f.replace ? '<button type="button" class="mini-btn" data-act="rep">Remplacer</button><button type="button" class="mini-btn" data-act="all">Remplacer tout</button>' : '<button type="button" class="mini-btn" data-act="showrep">' + O.icon('replace') + 'Remplacer…</button>') + '</p><p class="find-res"></p>';
    const res = bd.querySelector('.find-res');
    const upd = () => { f.hits = findHits(); res.textContent = f.q ? (f.hits.length ? f.hits.length + ' résultat' + (f.hits.length > 1 ? 's' : '') + (f.k >= 0 ? ' · ' + (f.k + 1) + '/' + f.hits.length : '') : 'Aucun résultat') : ''; };
    upd();
    const go = (d) => {
      upd(); if (!f.hits.length) return;
      f.k = (f.k + d + f.hits.length) % f.hits.length; const h = f.hits[f.k];
      if (A.editing) A.stopEdit();
      if (h.i !== A.cur) A.goto(h.i);
      if (h.notes) { const ne = $('#notesEd'); ne.focus(); RT.selectMatch(ne, f.q, { caseSensitive: f.cs, whole: f.whole }, h.k); }
      else if (h.cell) { A.select([h.el]); A.startEdit(h.el, { cell: h.cell }); RT.selectMatch(A.editing.el, f.q, { caseSensitive: f.cs, whole: f.whole }, h.k); }
      else { A.select([h.el]); const e = A.get(h.el); if (e && (e.type === 'text' || e.type === 'shape') && A.startEdit(h.el)) RT.selectMatch(A.editing.el, f.q, { caseSensitive: f.cs, whole: f.whole }, h.k); }
      upd();
      const q = bd.querySelector('[data-t="q"]'); if (q && !O.touch()) setTimeout(() => {}, 0);
    };
    const replaceIn = (all) => {
      const opt = { caseSensitive: f.cs, whole: f.whole }; let n = 0;
      if (A.editing) A.stopEdit();
      const doOne = (html) => { if (all) { const r = RT.replaceIn(html, f.q, f.r, opt); n += r.n; return r.html; } return html; };
      if (all) {
        A.doc.slides.forEach((s) => { P.walk(s.elements, (e) => { if (e.html) e.html = doOne(e.html); if (e.type === 'table') e.rows.forEach((r) => r.cells.forEach((c) => { if (c.html) c.html = doOne(c.html); })); }); if (f.notes && s.notes) s.notes = doOne(s.notes); });
        A.change('Remplacer tout'); O.toast(n + ' remplacement' + (n > 1 ? 's' : ''));
      } else {
        const h = f.hits[f.k]; if (!h) { go(1); return; }
        // remplacement de l'occurrence sélectionnée
        const s = A.doc.slides[h.i];
        const target = h.notes ? { get: () => s.notes, set: (v) => { s.notes = v; } } : h.cell ? (() => { const e = P.findEl(s, h.el); const c = e.rows[h.cell[0]].cells[h.cell[1]]; return { get: () => c.html, set: (v) => { c.html = v; } }; })() : (() => { const e = P.findEl(s, h.el); return { get: () => e.html, set: (v) => { e.html = v; } }; })();
        const d = document.createElement('div'); d.innerHTML = target.get();
        if (RT.selectMatch(d, f.q, opt, h.k)) { /* sélection hors page : on remplace à la main */ }
        let cnt = -1; const re = new RegExp(f.whole ? '(?<![\\p{L}\\p{N}_])' + f.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])' : f.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), (f.cs ? 'g' : 'gi') + 'u');
        const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let done = false;
        while (!done && w.nextNode()) { const t = w.currentNode; t.textContent = t.textContent.replace(re, (m) => { cnt++; if (cnt === h.k && !done) { done = true; return f.r; } return m; }); }
        target.set(d.innerHTML); A.change('Remplacer'); f.k--; go(1);
      }
      upd();
    };
    bindPane(bd, {
      text: (k, v) => { f[k] = v; f.k = -1; upd(); }, check: (k, v) => { f[k] = v; f.k = -1; upd(); },
      act: (k) => { if (k === 'next') go(1); if (k === 'prev') go(-1); if (k === 'rep') replaceIn(false); if (k === 'all') replaceIn(true); if (k === 'showrep') C.find(true); }
    });
    bd.querySelector('[data-t="q"]').addEventListener('input', (e) => { f.q = e.target.value; f.k = -1; upd(); });
    bd.querySelector('[data-t="q"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } });
    const r = bd.querySelector('[data-t="r"]'); if (r) r.addEventListener('input', (e) => { f.r = e.target.value; });
  }
  /* ----- accessibilité ----- */
  A.a11yIssues = function () {
    const out = []; const t = A.theme();
    T.check(t).forEach((c) => { if (!c.ok) out.push({ kind: 'Contraste du thème', text: c.label + ' : ' + String(c.ratio).replace('.', ',') + ' : 1 (minimum ' + c.min + ')', fix: 'Choisissez d\'autres couleurs (Création › Couleurs).' }); });
    A.doc.slides.forEach((s, i) => {
      if (!P.slideTitle(s)) out.push({ i, kind: 'Titre manquant', text: 'La diapositive ' + (i + 1) + ' n\'a pas de titre.', fix: 'Ajoutez un titre (éventuellement masqué hors de la diapositive) pour la navigation.' });
      P.walk(s.elements, (e) => {
        if ((e.type === 'image' || e.type === 'chart' || e.type === 'icon' || e.type === 'video' || e.type === 'smartart') && !e.alt && !e.decorative) out.push({ i, el: e.id, kind: 'Texte de remplacement manquant', text: ({ image: 'Image', chart: 'Graphique', icon: 'Icône', video: 'Vidéo', smartart: 'SmartArt' }[e.type]) + ' sur la diapositive ' + (i + 1), fix: 'Clic droit › Texte de remplacement.' });
        if ((e.type === 'shape') && e.html && e.fill && e.fill.type === 'solid') { const bg = T.resolve(e.fill.color, t), fg = T.resolve(e.txColor || 't:lt1', t); const r = O.contrast(bg, fg); if (r < 4.5) out.push({ i, el: e.id, kind: 'Contraste du texte', text: 'Texte peu lisible dans une forme (diapositive ' + (i + 1) + ', ' + String(O.round(r, 1)).replace('.', ',') + ' : 1)', fix: 'Changez la couleur du texte ou du remplissage.' }); }
        if (e.type === 'table' && e.tstyle && e.tstyle.header === false) out.push({ i, el: e.id, kind: 'Tableau sans en-tête', text: 'Tableau sans ligne d\'en-tête (diapositive ' + (i + 1) + ')', fix: 'Onglet Tableau › Ligne d\'en-tête.' });
      });
      const titles = A.doc.slides.map(P.slideTitle); if (P.slideTitle(s) && titles.filter((x) => x === P.slideTitle(s)).length > 1 && titles.indexOf(P.slideTitle(s)) !== i) out.push({ i, kind: 'Titre en double', text: 'Le titre de la diapositive ' + (i + 1) + ' est identique à un autre.', fix: 'Donnez un titre unique à chaque diapositive.' });
    });
    return out;
  };
  function paneA11y(bd) {
    const l = A.a11yIssues();
    bd.innerHTML = (l.length ? '<p class="o-hint">' + l.length + ' point' + (l.length > 1 ? 's' : '') + ' à vérifier. Cliquez pour y aller.</p>' : '') + (l.length ? l.map((x, k) => '<div class="a11y-it ko" data-k="' + k + '">' + O.icon('triangle-alert') + '<div><b>' + O.esc(x.kind) + '</b><br>' + O.esc(x.text) + '<br><small class="o-hint">' + O.esc(x.fix) + '</small></div></div>').join('') : '<div class="a11y-it ok">' + O.icon('circle-check') + '<div><b>Aucun problème détecté</b><br>Titres, textes de remplacement et contrastes sont corrects.</div></div>');
    bd.onclick = (e) => { const it = e.target.closest('[data-k]'); if (!it) return; const x = l[+it.dataset.k]; if (x.i != null) A.goto(x.i); if (x.el) A.select([x.el]); };
  }
  /* ----- sélection ----- */
  function paneSelection(bd) {
    const els = A.els().slice().reverse();
    const label = (e) => e.name || (e.ph ? (P.PH[e.ph] || {}).prompt || e.ph : '') || (e.html ? RT.textOf(e.html).slice(0, 28) : '') || ({ image: 'Image', shape: 'Forme', text: 'Zone de texte', chart: 'Graphique', table: 'Tableau', icon: 'Icône ' + (e.icon || ''), video: 'Vidéo', smartart: 'SmartArt', equation: 'Équation', group: 'Groupe', line: 'Ligne', audio: 'Son', placeholder: 'Espace réservé (image)' }[e.type] || e.type);
    bd.innerHTML = '<p class="o-hint">Du premier plan (en haut) à l\'arrière-plan. Glissez pour réordonner.</p><div class="an-list">' + els.map((e) => '<div class="an-it' + (A.sel.indexOf(e.id) >= 0 ? ' on' : '') + '" data-e="' + e.id + '" draggable="true">' + O.icon({ image: 'image', shape: 'shapes', text: 'type', chart: 'chart-column', table: 'table', icon: 'smile', video: 'film', smartart: 'network', equation: 'sigma', group: 'group', line: 'minus', audio: 'volume-2', placeholder: 'image-plus' }[e.type] || 'square') + '<span class="l">' + O.esc(label(e)) + '</span><button type="button" class="o-x" data-lk="' + e.id + '" title="' + (e.locked ? 'Déverrouiller' : 'Verrouiller') + '">' + O.icon(e.locked ? 'lock' : 'lock-open') + '</button></div>').join('') + '</div>';
    O.$$('.an-it', bd).forEach((it) => {
      it.addEventListener('click', (ev) => { const lk = ev.target.closest('[data-lk]'); const e = A.get(it.dataset.e); if (lk) { e.locked = !e.locked; A.change(e.locked ? 'Verrouiller' : 'Déverrouiller'); return; } A.select([it.dataset.e], ev.ctrlKey || ev.shiftKey); });
      it.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/x-el', it.dataset.e));
      it.addEventListener('dragover', (ev) => ev.preventDefault());
      it.addEventListener('drop', (ev) => { ev.preventDefault(); const id = ev.dataTransfer.getData('text/x-el'); const list = A.els(); const a = list.findIndex((x) => x.id === id), b = list.findIndex((x) => x.id === it.dataset.e); if (a < 0 || b < 0 || a === b) return; const [m] = list.splice(a, 1); list.splice(b, 0, m); A.change('Ordre des plans'); });
    });
  }

  /* ---------------- miniatures : clic, glisser, menu, clavier ---------------- */
  A.thumbsInit = function () {
    const el = $('#thumbs');
    el.tabIndex = 0; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', 'Diapositives');
    let drag = null, lt = null;
    // au doigt : une fois le glisser armé par l'appui long, le bandeau ne défile plus (sinon le navigateur annule le geste)
    el.addEventListener('touchmove', (e) => { if (drag && e.cancelable) e.preventDefault(); }, { passive: false });
    el.addEventListener('pointerdown', (ev) => {
      const sec = ev.target.closest('.sec'); if (sec) { if (ev.button === 0) { const s = (A.doc.sections || []).find((x) => x.id === sec.dataset.sec); if (s) { s.closed = !s.closed; A.renderThumbs(true); } } return; }
      const th = ev.target.closest('.th'); if (!th || ev.button === 2) return;
      const i = +th.dataset.i, id = th.dataset.sid;
      if (ev.shiftKey) { const a = P.slideIndex(A.doc, A.selSlides[0] || A.doc.slides[A.cur].id); const lo = Math.min(a, i), hi = Math.max(a, i); A.selSlides = A.doc.slides.slice(lo, hi + 1).map((s) => s.id); A.goto(i, { keepSlides: true }); return; }
      if (O.modKey(ev)) { const k = A.selSlides.indexOf(id); if (k >= 0 && A.selSlides.length > 1) A.selSlides.splice(k, 1); else A.selSlides.push(id); A.goto(i, { keepSlides: true }); return; }
      if (A.selSlides.indexOf(id) < 0 || A.selSlides.length < 2) A.selSlides = [id];
      if (i !== A.cur) A.goto(i, { keepSlides: true }); else A.renderThumbs();
      // glisser pour réordonner (souris tout de suite ; doigt après un appui long)
      const touch = ev.pointerType === 'touch';
      const start = () => {
        drag = { ids: A.selSlides.slice(), over: null };
        th.style.opacity = '.5';
        O.drag(ev, {
          threshold: touch ? 0 : 6,
          move: (dx, dy, e2) => {
            const t = document.elementFromPoint(e2.clientX, e2.clientY); const o = t && t.closest('.th');
            O.$$('.th', el).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
            if (o) { const r = o.getBoundingClientRect(); const horiz = O.narrow(); const after = horiz ? e2.clientX > r.left + r.width / 2 : e2.clientY > r.top + r.height / 2; o.classList.add(after ? 'drop-after' : 'drop-before'); drag.over = +o.dataset.i + (after ? 1 : 0); }
            const r2 = el.getBoundingClientRect(); if (e2.clientY < r2.top + 30) el.scrollTop -= 12; if (e2.clientY > r2.bottom - 30) el.scrollTop += 12;
          },
          end: (dx, dy, e2, moved) => { th.style.opacity = ''; O.$$('.th', el).forEach((x) => x.classList.remove('drop-before', 'drop-after')); if (moved && drag && drag.over != null) C.moveSlides(drag.ids, drag.over); drag = null; }
        });
      };
      if (!touch) start();
      else { clearTimeout(lt); lt = setTimeout(() => { if (navigator.vibrate) navigator.vibrate(15); start(); }, 450); const cancel = () => { clearTimeout(lt); el.removeEventListener('pointerup', cancel); el.removeEventListener('pointercancel', cancel); }; el.addEventListener('pointerup', cancel); el.addEventListener('pointercancel', cancel); el.addEventListener('scroll', cancel, { once: true }); }
    });
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const sec = ev.target.closest('.sec'); if (sec) { C.sectionMenu(sec.dataset.sec, { x: ev.clientX, y: ev.clientY }); return; }
      const th = ev.target.closest('.th'); if (th && A.selSlides.indexOf(th.dataset.sid) < 0) { A.selSlides = [th.dataset.sid]; A.goto(+th.dataset.i, { keepSlides: true }); }
      slideMenu({ x: ev.clientX, y: ev.clientY });
    });
    el.addEventListener('dblclick', (ev) => { if (!ev.target.closest('.th')) C.newSlide(); });
    el.addEventListener('keydown', (ev) => {
      const k = O.keyName(ev);
      const map = { arrowdown: () => A.goto(A.cur + 1), arrowright: () => A.goto(A.cur + 1), arrowup: () => A.goto(A.cur - 1), arrowleft: () => A.goto(A.cur - 1), home: () => A.goto(0), end: () => A.goto(A.doc.slides.length - 1), delete: () => C.delSlides(), backspace: () => C.delSlides(), enter: () => C.newSlide(), 'mod+d': () => C.dupSlide(), 'mod+a': () => { A.selSlides = A.doc.slides.map((s) => s.id); A.renderThumbs(); }, 'mod+arrowup': () => C.moveSlides(A.selSlides, Math.max(0, A.cur - 1)), 'mod+arrowdown': () => C.moveSlides(A.selSlides, A.cur + 2) };
      if (map[k]) { ev.preventDefault(); ev.stopPropagation(); map[k](); el.focus(); }
    });
  };
  function slideMenu(at) {
    const s = A.doc.slides[A.cur];
    O.menu(at, [
      { label: 'Nouvelle diapositive', icon: 'square-plus', kbd: 'Ctrl+M', on: () => C.newSlide() }, { label: 'Dupliquer', icon: 'copy-plus', kbd: 'Ctrl+D', on: () => C.dupSlide() }, { label: 'Supprimer', icon: 'trash-2', kbd: 'Suppr', on: () => C.delSlides() }, '-',
      { label: 'Couper', icon: 'scissors', on: () => C.copySlides(true) }, { label: 'Copier', icon: 'copy', on: () => C.copySlides(false) }, { label: 'Coller', icon: 'clipboard-paste', disabled: !A.slideClip, on: () => C.pasteSlides() }, '-',
      { label: 'Ajouter une section', icon: 'folder-plus', on: () => C.addSection() }, { label: 'Disposition', icon: 'layout-template', sub: P.LAYOUTS.map((l) => ({ label: l.name, checked: s.layout === l.id, on: () => C.layout(l.id) })) }, { label: 'Rétablir la diapositive', icon: 'rotate-ccw', on: () => C.resetSlide() },
      { label: 'Format de l\'arrière-plan…', icon: 'paint-bucket', on: () => A.openPane('bg') }, { label: s.hidden ? 'Afficher la diapositive' : 'Masquer la diapositive', icon: s.hidden ? 'eye' : 'eye-off', on: () => C.hideSlide() },
      { label: 'Transition', icon: 'blend', sub: P.TRANSITIONS.map((t) => ({ label: t[1], checked: (s.transition || {}).type === t[0], on: () => C.setTransition({ type: t[0] }) })) }
    ], { title: 'Diapositive ' + (A.cur + 1) });
  }
  A.slideMenu = slideMenu;
  /* ---------------- trieuse ---------------- */
  A.renderSorter = function () {
    const el = $('#sorter'); if (!el || A.view !== 'sorter') return;
    const W = A.slideW(), H = A.slideH(); el.style.setProperty('--ar', W + '/' + H);
    const sw = A.settings.sorterW || (O.narrow() ? 150 : 220); el.style.setProperty('--sw', sw + 'px');
    const secs = A.doc.sections || [];
    let h = '<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px"><b style="flex:1">Trieuse de diapositives</b><label style="display:flex;gap:6px;align-items:center;font-size:12.5px">Taille <input type="range" min="110" max="400" value="' + sw + '" data-sw></label></div>';
    let open = false;
    A.doc.slides.forEach((s, i) => {
      const sec = secs.find((x) => x.at === s.id);
      if (sec || i === 0) { if (open) h += '</div>'; h += sec ? '<div class="so-sec">' + O.icon('folder') + O.esc(sec.name) + ' <small style="font-weight:400;color:var(--o-tx3)">' + A.countSec(sec) + ' diapositive(s)</small></div>' : ''; h += '<div class="so-grid">'; open = true; }
      h += '<div class="so-it' + (A.selSlides.indexOf(s.id) >= 0 ? ' sel' : '') + (s.hidden ? ' hid' : '') + '" data-i="' + i + '" data-sid="' + s.id + '"><div class="th-box"></div><div class="cap"><span>' + (i + 1) + (s.hidden ? ' (masquée)' : '') + '</span><span>' + ((s.transition || {}).type !== 'none' ? O.icon('blend') : '') + ((s.anims || []).length ? O.icon('sparkles') : '') + ((s.advance || {}).after ? ' ' + s.advance.after + ' s' : '') + '</span></div></div>';
    });
    if (open) h += '</div>';
    el.innerHTML = h;
    O.$$('.so-it .th-box', el).forEach((b) => { const i = +b.parentNode.dataset.i; const n = A.thumbNode(A.doc.slides[i], i); n.style.transform = 'scale(' + (b.clientWidth / W) + ')'; n.style.transformOrigin = '0 0'; n.style.position = 'absolute'; b.appendChild(n); P.fitAll(n, A.doc, O.clone(A.doc.slides[i])); });
  };
  A.sorterInit = function () {
    const el = $('#sorter'); el.tabIndex = 0;
    el.addEventListener('input', (e) => { if (e.target.dataset.sw != null) { A.settings.sorterW = +e.target.value; A.saveSettings(); A.renderSorter(); } });
    el.addEventListener('pointerdown', (ev) => {
      const it = ev.target.closest('.so-it'); if (!it || ev.button === 2) return;
      const id = it.dataset.sid, i = +it.dataset.i;
      if (O.modKey(ev)) { const k = A.selSlides.indexOf(id); if (k >= 0) A.selSlides.splice(k, 1); else A.selSlides.push(id); A.cur = i; A.renderSorter(); A.refreshUi(); return; }
      if (ev.shiftKey) { const a = A.cur; A.selSlides = A.doc.slides.slice(Math.min(a, i), Math.max(a, i) + 1).map((s) => s.id); A.renderSorter(); return; }
      if (A.selSlides.indexOf(id) < 0) A.selSlides = [id];
      A.cur = i; A.renderSorter(); A.refreshUi();
      let over = null;
      O.drag(ev, { threshold: ev.pointerType === 'touch' ? 14 : 6,
        move: (dx, dy, e2) => { const t = document.elementFromPoint(e2.clientX, e2.clientY); const o = t && t.closest('.so-it'); O.$$('.so-it', el).forEach((x) => x.classList.remove('drop-before')); if (o) { const r = o.getBoundingClientRect(); const after = e2.clientX > r.left + r.width / 2; over = +o.dataset.i + (after ? 1 : 0); (after ? (o.nextElementSibling || o) : o).classList.add('drop-before'); } },
        end: (dx, dy, e2, moved) => { O.$$('.so-it', el).forEach((x) => x.classList.remove('drop-before')); if (moved && over != null) { C.moveSlides(A.selSlides.slice(), over); A.renderSorter(); } }
      });
    });
    el.addEventListener('dblclick', (ev) => { const it = ev.target.closest('.so-it'); if (it) { A.setView('normal'); A.goto(+it.dataset.i); } });
    el.addEventListener('contextmenu', (ev) => { const it = ev.target.closest('.so-it'); if (!it) return; ev.preventDefault(); if (A.selSlides.indexOf(it.dataset.sid) < 0) { A.selSlides = [it.dataset.sid]; A.cur = +it.dataset.i; } slideMenu({ x: ev.clientX, y: ev.clientY }); });
    el.addEventListener('keydown', (ev) => { const k = O.keyName(ev); if (k === 'delete' || k === 'backspace') { ev.preventDefault(); C.delSlides(); A.renderSorter(); } if (k === 'mod+d') { ev.preventDefault(); C.dupSlide(); A.renderSorter(); } if (k === 'arrowright' || k === 'arrowleft') { ev.preventDefault(); A.cur = O.clamp(A.cur + (k === 'arrowright' ? 1 : -1), 0, A.doc.slides.length - 1); A.selSlides = [A.doc.slides[A.cur].id]; A.renderSorter(); } if (k === 'enter') { A.setView('normal'); } });
  };
  /* ---------------- vues ---------------- */
  A.setView = function (v) {
    if (A.editing) A.stopEdit();
    const prev = A.view; A.view = v; A.sel = []; A.groupIn = null;
    const app = $('#app');
    app.classList.toggle('view-sorter', v === 'sorter'); app.classList.toggle('view-reading', v === 'reading'); app.classList.toggle('view-master', v === 'master');
    $('#masterBanner').hidden = v !== 'master';
    if (v === 'master') { A.masterKind = A.masterKind || 'content'; renderMasterBanner(); }
    if (v === 'sorter') A.renderSorter();
    if (prev === 'master' && v !== 'master') { A.renderThumbs(true); }
    setTimeout(() => { A.layoutStage(); A.renderCanvas(); A.renderOverlay(); A.refreshUi(); }, 0);
  };
  function renderMasterBanner() {
    const b = $('#masterBanner');
    b.innerHTML = O.icon('layout-panel-top') + '<span>Masque des diapositives : les objets ajoutés ici apparaissent sur toutes les diapositives.</span>' + '<select aria-label="Modèle" style="border-radius:6px;border:0;padding:3px 6px"><option value="content">Diapositives de contenu</option><option value="title">Diapositive de titre</option><option value="section">En-tête de section</option></select>' +
      '<button type="button" data-m="styles" style="background:#ffffff30;color:#fff">Styles du texte</button><button type="button" data-m="logo" style="background:#ffffff30;color:#fff">Logo</button><button type="button" data-m="hf" style="background:#ffffff30;color:#fff">En-tête et pied</button><button type="button" data-m="close">Fermer le masque</button>';
    b.querySelector('select').value = A.masterKind;
    b.querySelector('select').onchange = (e) => { A.masterKind = e.target.value; A.renderCanvas(); A.renderOverlay(); };
    b.onclick = (e) => { const k = e.target.closest('[data-m]'); if (!k) return; if (k.dataset.m === 'close') A.setView('normal'); if (k.dataset.m === 'styles') C.masterStyles(); if (k.dataset.m === 'logo') C.logo(); if (k.dataset.m === 'hf') C.headerFooter(); };
  }
  /* ---------------- barre d'état ---------------- */
  A.renderStatus = function () {
    const st = $('#status'); if (!st) return;
    if (!st._init) {
      st._init = true;
      st.innerHTML = '<span id="stPos"></span><button type="button" class="st-b hide-m" id="stSpell" title="Vérification orthographique du navigateur">' + O.icon('spell-check') + '<span>Français (France)</span></button><span style="flex:1"></span>' +
        '<button type="button" class="st-b" id="stNotes" title="Notes">' + O.icon('notebook-pen') + '<span class="hide-m">Notes</span></button><button type="button" class="st-b hide-m" id="stCom" title="Commentaires">' + O.icon('message-square') + '<span>Commentaires</span></button>' +
        '<button type="button" class="st-b" data-v="normal" title="Normal">' + O.icon('panels-top-left') + '</button><button type="button" class="st-b" data-v="sorter" title="Trieuse">' + O.icon('layout-grid') + '</button><button type="button" class="st-b hide-m" data-v="reading" title="Lecture">' + O.icon('book-open') + '</button><button type="button" class="st-b" id="stShow" title="Diaporama (Maj+F5)">' + O.icon('square-play') + '</button>' +
        '<button type="button" class="st-b hide-m" id="stZm" title="Zoom arrière">' + O.icon('minus') + '</button><input type="range" id="zoomRange" min="10" max="400" aria-label="Zoom"><button type="button" class="st-b hide-m" id="stZp" title="Zoom avant">' + O.icon('plus') + '</button><span id="zoomVal"></span><button type="button" class="st-b" id="stFit" title="Ajuster à la fenêtre (Ctrl+0)">' + O.icon('scan') + '</button>';
      st.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.v) A.setView(b.dataset.v);
        if (b.id === 'stNotes') C.toggle('notes'); if (b.id === 'stCom') A.openPane(A.pane === 'comments' ? null : 'comments');
        if (b.id === 'stShow') C.showFrom(A.cur); if (b.id === 'stFit') A.setZoom('fit');
        if (b.id === 'stZm') A.setZoom(A.zoom / 1.15); if (b.id === 'stZp') A.setZoom(A.zoom * 1.15);
        if (b.id === 'stSpell') { A.ribbon.select('review'); }
      });
      st.querySelector('#zoomRange').addEventListener('input', (e) => A.setZoom(+e.target.value / 100));
    }
    const s = A.doc.slides[A.cur];
    $('#stPos').textContent = A.view === 'master' ? 'Masque des diapositives' : 'Diapositive ' + (A.cur + 1) + ' sur ' + A.doc.slides.length + (A.selSlides.length > 1 ? ' (' + A.selSlides.length + ' sélectionnées)' : '') + (s && s.hidden ? ' · masquée' : '');
    O.$$('[data-v]', st).forEach((b) => b.classList.toggle('on', b.dataset.v === A.view));
    $('#stNotes').classList.toggle('on', A.settings.notes !== false); $('#stCom').classList.toggle('on', A.pane === 'comments');
    const zr = $('#zoomRange'); if (document.activeElement !== zr) zr.value = Math.round(A.zoom * 100);
    $('#zoomVal').textContent = Math.round(A.zoom * 100) + ' %';
  };
  /* ---------------- ruban : montage ---------------- */
  A.mountRibbon = function () {
    A.ribbon = O.Ribbon($('#ribbonHost'), { tabs: TABS, ctx: A, file: { label: 'Fichier', on: () => A.openBackstage() }, start: 'home', onLayout: () => setTimeout(() => A.layoutStage(), 0),
      extraCommands: [{ label: 'Enregistrer', tab: 'Fichier', icon: 'save', kbd: 'mod+s', c: { on: () => C.save() } }, { label: 'Ouvrir', tab: 'Fichier', icon: 'folder-open', kbd: 'mod+o', c: { on: () => C.open() } }, { label: 'Exporter en PDF', tab: 'Fichier', icon: 'file-text', c: { on: () => A.openBackstage('export') } }, { label: 'Exporter en .pptx', tab: 'Fichier', icon: 'file-down', c: { on: () => C.exportPptx() } }, { label: 'Imprimer', tab: 'Fichier', icon: 'printer', kbd: 'mod+p', c: { on: () => C.print() } }, { label: 'Nouvelle présentation', tab: 'Fichier', icon: 'file-plus', kbd: 'mod+n', c: { on: () => C.newDoc() } }, { label: 'Raccourcis clavier', tab: 'Aide', icon: 'keyboard', kbd: 'f1', c: { on: () => C.shortcuts() } }] });
    // un onglet contextuel apparaît : on y bascule pour les objets « spéciaux »
    let last = '';
    const prevRefresh = A.ribbon.refresh;
    A.ribbon.refresh = function () {
      const sig = A.sel.join(',') + (A.tableSel ? 't' : '');
      if (sig !== last) {
        last = sig; const e = one();
        if (e && !A.editing && A._fresh === e.id) { A._fresh = null; const want = { table: 'tablefmt', chart: 'chartfmt', smartart: 'smartfmt', image: 'picfmt', video: 'mediafmt', audio: 'mediafmt', equation: 'eqfmt', icon: 'iconfmt' }[e.type]; if (want && A.ribbon.tab !== want && ['home', 'insert'].indexOf(A.ribbon.tab) >= 0) { prevRefresh(); A.ribbon.select(want); return; } }
        if (!e && /fmt$/.test(A.ribbon.tab)) { prevRefresh(); return; }
      }
      prevRefresh();
    };
  };
})();
