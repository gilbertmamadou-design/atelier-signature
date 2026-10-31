/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-voyage/cv-ui.js : ne pas modifier ici. */
/* =====================================================================
   Carnet de voyage — interface : bibliothèque des carnets, éditeur (outils, propriétés), couverture,
   photos (galerie du téléphone ou fichiers du PC), textes, dessin, décorations, carte, Composer, pages.
   Exports, diaporama et réglages : cv-share.js.
   ===================================================================== */
(function () {
  'use strict';
  const CV = window.CV = window.CV || {};
  const O = window.Office, A = CV.Art, R = CV.R, M = CV.M, E = CV.E, W = A.W, H = A.H;
  const U = CV.U = {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = A.esc, ic = (n) => O.icon(n);
  const PHONE = () => innerWidth < 900;
  const TOUCHE = () => window.MAGPC ? 'Clique sur' : 'Touche';

  /* ---------------- Réglages ---------------- */
  const SK = 'voyage.settings';
  CV.settings = Object.assign({ motion: 'auto', snap: true, geo: false, view: '' }, (() => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } })());
  CV.saveSettings = () => { try { localStorage.setItem(SK, JSON.stringify(CV.settings)); } catch (e) { } };
  CV.motionOk = () => CV.settings.motion === 'on' ? true : CV.settings.motion === 'off' ? false : !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const applyMotion = () => document.documentElement.classList.toggle('calme', !CV.motionOk());

  U.INK = ['#2E2620', '#1D2A5C', '#9E3B2E', '#2F6F73', '#B5532F', '#5B7F3A', '#7A4E9C', '#C9A04A', '#E05A5A', '#3E6FB0', '#F4C542', '#FFFFFF'];
  U.PAPERS = ['#C9A06A', '#B5532F', '#2F6F73', '#E6A1A0', '#FFFDF5', '#9FC5D9', '#F4C542', '#5B7F3A', '#2E2620'];

  /* ---------------- Retour Android : couches (dialogues, feuilles, éditeur…) ---------------- */
  const LAYERS = [];
  U.push = (fn) => { LAYERS.push(fn); try { history.pushState({ cv: LAYERS.length }, ''); } catch (e) { } };
  let skip = 0;
  U.pop = () => { if (LAYERS.length) { LAYERS.pop(); skip++; try { history.back(); } catch (e) { skip--; } } };
  window.addEventListener('popstate', () => {
    if (skip) { skip--; return; }
    if (O.closeTopDialog && O.dialogOpen && O.dialogOpen()) { O.closeTopDialog(); try { history.pushState({ cv: LAYERS.length }, ''); } catch (e) { } return; }
    if (O.menuOpen && O.menuOpen()) { O.closeMenu(); try { history.pushState({ cv: LAYERS.length }, ''); } catch (e) { } return; }
    const fn = LAYERS.pop(); if (fn) fn();
  });

  /* ---------------- Bibliothèque ---------------- */
  U.home = async function () {
    document.body.dataset.screen = 'home';
    const list = await M.carnets();
    const covers = list.map((c) => c.cover && c.cover.photo).filter(Boolean);
    await M.ensureUrls(covers);
    const box = $('#homeList');
    if (!list.length) {
      box.innerHTML = '<div class="empty"><div class="emptyArt">' + homeArt() + '</div><h2>Ton premier carnet t\'attend</h2><p>Choisis tes photos de voyage, habille-les en timbres, Polaroid ou tickets, et écris tes souvenirs à la main.</p><button class="btn pri big" data-a="new">' + ic('plus') + 'Créer un carnet</button></div>';
    } else {
      box.innerHTML = '<div class="shelf">' + list.map((c) => '<div class="book" data-id="' + esc(c.id) + '"><button class="bookCover" data-a="open" aria-label="Ouvrir ' + esc(c.title) + '">' + R.pageSvg(c, { id: 'cover', items: c.coverItems || [] }, { pfx: 'h' + c.id + '-', href: M.url, media: M.info, cover: true }) + '</button><div class="bookInfo"><b>' + esc(c.title) + '</b><small>' + esc(M.stats(c)) + ' · ' + esc(O.ago(c.updated)) + '</small></div><button class="ibtn bookMore" data-a="more" aria-label="Plus d\'actions">' + ic('ellipsis-vertical') + '</button></div>').join('') + '<button class="book add" data-a="new"><span>' + ic('plus') + '</span><b>Nouveau carnet</b></button></div>';
    }
    U.socle(list);
  };
  function homeArt() {
    return '<svg viewBox="0 0 300 200"><g transform="translate(60 30) rotate(-8)">' + A.sticker('valise', 90, 90, '', 'ha') + '</g><g transform="translate(160 70) rotate(6)"><rect x="-55" y="-45" width="110" height="90" fill="#fff" stroke="#d8ccb6"/><rect x="-46" y="-36" width="92" height="62" fill="#9FC5D9"/>' + '<path d="M-46 26 L-10 -6 L14 14 L28 2 L46 20 V26Z" fill="#5B7F3A"/><circle cx="26" cy="-18" r="9" fill="#F4C542"/></g><g transform="translate(240 150) rotate(-12)">' + A.sticker('avion', 70, 70, '', 'hb') + '</g></svg>';
  }
  U.homeClick = async function (e) {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const book = e.target.closest('.book'), id = book && book.dataset.id;
    const k = a.dataset.a;
    if (k === 'new') U.newCarnet();
    else if (k === 'open') U.open(id);
    else if (k === 'import') U.importCarnet();
    else if (k === 'settings') CV.X.settings();
    else if (k === 'more') {
      const c = await M.getCarnet(id); if (!c) return;
      O.menu(a, [
        { label: 'Ouvrir', icon: 'book-open', on: () => U.open(id) },
        { label: 'Diaporama', icon: 'play', on: async () => { await U.open(id); CV.X.show(-1); } },
        { label: 'Sauvegarde .magcarnet', icon: 'archive', on: async () => { await M.loadMedia(id); CV.X.saveFile(c); } },
        { label: 'Supprimer…', icon: 'trash', danger: true, on: async () => { if (await O.confirm('Supprimer « ' + c.title + ' » ?', 'Le carnet et ses photos seront effacés de cet appareil (les photos d\'origine ne sont pas touchées).', 'Supprimer', true)) { await M.delCarnet(id); O.toast('Carnet supprimé'); U.home(); } } }
      ], { title: c.title });
    }
  };

  /* ---------------- Nouveau carnet ---------------- */
  U.newCarnet = async function () {
    let style = 'cuir', color = A.COVER_COLORS.cuir[0];
    const body = O.h('div', { cls: 'newc' });
    body.innerHTML = '<label class="o-field"><span>Titre</span><input class="o-in" id="ncT" maxlength="60" placeholder="Ex. : Été à Marseille"></label>' +
      '<div class="o-form"><label class="o-field half"><span>Du</span><input class="o-in" type="date" id="ncD1"></label><label class="o-field half"><span>Au</span><input class="o-in" type="date" id="ncD2"></label></div>' +
      '<div class="o-field"><span>Couverture</span><div class="chips" id="ncS">' + A.COVERS.map((s) => '<button type="button" class="chip' + (s[0] === style ? ' on' : '') + '" data-s="' + s[0] + '">' + s[1] + '</button>').join('') + '</div><div class="swatches" id="ncC"></div></div>' +
      '<div class="ncPrev" id="ncP"></div>';
    const prev = () => {
      const t = $('#ncT', body).value.trim() || 'Mon carnet de voyage';
      const c = { title: t, dates: U.fmtDates($('#ncD1', body).value, $('#ncD2', body).value), cover: { style, color } };
      $('#ncP', body).innerHTML = R.pageSvg(c, { id: 'cover', items: [] }, { pfx: 'nc-', href: () => '', media: () => null, cover: true });
      $('#ncC', body).innerHTML = A.COVER_COLORS[style].map((x) => '<button type="button" class="sw' + (x === color ? ' on' : '') + '" data-c="' + x + '" style="background:' + x + '" aria-label="Couleur ' + x + '"></button>').join('');
    };
    body.addEventListener('input', prev);
    body.addEventListener('click', (e) => { const s = e.target.closest('[data-s]'); if (s) { style = s.dataset.s; color = A.COVER_COLORS[style][0]; $$('#ncS .chip', body).forEach((b) => b.classList.toggle('on', b === s)); prev(); } const c = e.target.closest('[data-c]'); if (c) { color = c.dataset.c; prev(); } });
    prev();
    const v = await O.dialog({ title: 'Nouveau carnet', body, cls: 'cv-dlg', buttons: [{ label: 'Annuler', value: null }, { label: 'Créer le carnet', value: 'ok', primary: true }], onOpen: () => setTimeout(() => { if (!O.touch()) $('#ncT', body).focus(); }, 50) });
    if (v !== 'ok') return;
    const c = M.newCarnet({ title: $('#ncT', body).value.trim() || 'Mon carnet de voyage', dates: U.fmtDates($('#ncD1', body).value, $('#ncD2', body).value), style, color });
    await M.putCarnet(c);
    await U.open(c.id, -1);
    O.toast('Carnet créé : ajoute tes photos avec « Photos »');
  };
  U.fmtDates = function (a, b) {
    const d = (s) => s ? new Date(s + 'T12:00') : null, x = d(a), y = d(b);
    const M2 = (t) => t.toLocaleDateString('fr-FR', { month: 'long' }), Y = (t) => t.getFullYear();
    if (x && y) {
      if (Y(x) === Y(y) && x.getMonth() === y.getMonth()) return x.getDate() + ' – ' + y.getDate() + ' ' + M2(y) + ' ' + Y(y);
      if (Y(x) === Y(y)) return x.getDate() + ' ' + M2(x) + ' – ' + y.getDate() + ' ' + M2(y) + ' ' + Y(y);
      return x.toLocaleDateString('fr-FR') + ' – ' + y.toLocaleDateString('fr-FR');
    }
    if (x) return x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    return '';
  };

  /* ---------------- Ouvrir un carnet ---------------- */
  U.open = async function (id, pi) {
    const c = await M.getCarnet(id); if (!c) { O.toast('Carnet introuvable', { bad: true }); return; }
    M.releaseUrls();
    await M.loadMedia(id);
    await M.ensureUrls(Array.from(M.mediaIds(c)));
    E.c = c; E.sel = []; E.pi = pi == null ? (c.lastPage == null ? -1 : Math.min(c.lastPage, c.pages.length - 1)) : pi;
    E.view = CV.settings.view || (PHONE() ? 'simple' : 'double');
    E.hist.reset();
    try { localStorage.setItem('voyage.last', id); } catch (e) { }
    if (document.body.dataset.screen !== 'ed') U.push(() => U.close(true));
    document.body.dataset.screen = 'ed';
    $('#edTitle').textContent = c.title;
    U.tools(); E.render(); U.props(); U.pagesBar(); U.hist();
    setTimeout(() => E.layout(), 30);
  };
  U.close = async function (fromBack) {
    if (E.drawing) E.endDraw();
    await E.saveNow();
    E.c = null; E.sel = [];
    document.body.dataset.screen = 'home';
    if (!fromBack) U.pop();
    U.home();
  };
  E.onHist = () => U.hist();
  U.hist = function () { const u = $('#bUndo'), r = $('#bRedo'); if (u) { u.disabled = !E.hist.canUndo(); u.title = 'Annuler ' + (E.hist.undoLabel() || '') + ' (Ctrl+Z)'; } if (r) { r.disabled = !E.hist.canRedo(); r.title = 'Rétablir (Ctrl+Y)'; } };
  E.onSelect = () => { U.props(); };
  E.onPage = () => { if (E.c) E.c.lastPage = E.pi; U.pagesBar(); U.props(); U.tools(); };
  E.onLive = (it) => { const r = $('#pRot'); if (r && it.rot != null) { r.value = Math.round(it.rot); const o = $('#pRotV'); if (o) o.textContent = Math.round(it.rot) + '°'; } };
  E.onDouble = (it) => { if (it.type === 'text') U.editText(it); else if (it.type === 'map') U.mapDialog(it); else if (PHONE()) U.openSheet(); };
  E.onChange = () => { U.pagesThumbSoon(); };
  E.onSaved = () => { clearTimeout(U._sT); U._sT = setTimeout(() => U.socle(), 2500); };

  /* ---------------- Barre du haut et outils ---------------- */
  U.tools = function () {
    const cover = E.pi === -1;
    $('#tools').innerHTML = [
      ['photos', 'images', 'Photos'], ['text', 'type', 'Texte'], ['draw', 'pen-line', 'Dessin'], ['deco', 'sticker', 'Déco'], ['compose', 'layout-dashboard', 'Composer'], [cover ? 'cover' : 'page', cover ? 'book' : 'file', cover ? 'Couverture' : 'Page']
    ].map((t) => '<button type="button" class="tool" data-t="' + t[0] + '">' + ic(t[1]) + '<span>' + t[2] + '</span></button>').join('');
    const pn = $('#pageNav');
    if (pn) pn.innerHTML = '<button class="ibtn" data-nav="-1" aria-label="Page précédente"' + (E.pi <= -1 ? ' disabled' : '') + '>' + ic('chevron-left') + '</button><button class="pgLabel" data-nav="pages">' + (E.pi === -1 ? 'Couverture' : 'Page ' + (E.pi + 1) + ' / ' + E.c.pages.length) + '</button><button class="ibtn" data-nav="1" aria-label="Page suivante">' + ic(E.pi >= E.c.pages.length - 1 ? 'file-plus' : 'chevron-right') + '</button>';
  };
  U.toolClick = function (e) {
    const t = e.target.closest('[data-t]'); if (!t) return;
    const k = t.dataset.t;
    if (k === 'photos') U.photosMenu(t);
    else if (k === 'text') U.textMenu(t);
    else if (k === 'draw') U.draw();
    else if (k === 'deco') U.deco();
    else if (k === 'compose') U.compose();
    else if (k === 'page') U.pageMenu(t);
    else if (k === 'cover') U.coverDialog();
  };
  U.navClick = function (e) {
    const b = e.target.closest('[data-nav]'); if (!b) return;
    const v = b.dataset.nav;
    if (v === 'pages') { U.pagesDialog(); return; }
    const step = E.view === 'double' && E.pi >= 0 ? 2 : 1;
    let np = E.pi + (+v) * step;
    if (E.view === 'double' && +v > 0 && E.pi === -1) np = 0;
    if (+v > 0 && np > E.c.pages.length - 1) {
      if (E.pi >= E.c.pages.length - 1 || (E.view === 'double' && E.visible().includes(E.c.pages.length - 1))) { U.addPage(); return; }
      np = E.c.pages.length - 1;
    }
    if (E.view === 'double' && np >= 0) np = np - (np % 2);
    E.go(np);
  };
  U.topClick = function (e) {
    const b = e.target.closest('[data-top]'); if (!b) return;
    const k = b.dataset.top;
    if (k === 'back') U.close();
    else if (k === 'undo') { if (E.drawing) E.endDraw(); E.hist.undo(); }
    else if (k === 'redo') E.hist.redo();
    else if (k === 'view') { E.view = E.view === 'double' ? 'simple' : 'double'; CV.settings.view = E.view; CV.saveSettings(); E.render(); U.tools(); O.toast(E.view === 'double' ? 'Double page' : 'Page simple'); }
    else if (k === 'title') U.coverDialog();
    else if (k === 'share') CV.X.exportDialog();
    else if (k === 'more') O.menu(b, [
      { label: 'Exporter, partager, imprimer…', icon: 'share-2', on: () => CV.X.exportDialog() },
      { label: 'Diaporama', icon: 'play', kbd: 'F5', on: () => CV.X.show(E.pi) },
      { label: 'Sauvegarde .magcarnet', icon: 'archive', on: () => CV.X.saveFile(E.c) },
      '-',
      { label: E.view === 'double' ? 'Page simple' : 'Double page', icon: 'book-open', on: () => U.topClick({ target: { closest: () => ({ dataset: { top: 'view' } }) } }) },
      { label: 'Toutes les pages…', icon: 'layout-grid', on: () => U.pagesDialog() },
      { label: 'Couverture…', icon: 'book', on: () => U.coverDialog() },
      { label: 'Sélection multiple', icon: 'square-check', checked: E.multi, on: () => { E.multi = !E.multi; O.toast(E.multi ? 'Sélection multiple : touche les éléments un par un' : 'Sélection simple'); } },
      { label: 'Magnétisme', icon: 'magnet', checked: CV.settings.snap !== false, on: () => { CV.settings.snap = CV.settings.snap === false; CV.saveSettings(); } },
      '-',
      { label: 'Réglages et licences', icon: 'settings', on: () => CV.X.settings() }
    ], { title: 'Carnet' });
  };

  /* ---------------- Photos ---------------- */
  U.photosMenu = function (at) {
    O.menu(at, [
      { label: window.MAGPC ? 'Ajouter des photos du PC…' : (window.MAGOffice ? 'Choisir dans la galerie…' : 'Ajouter des photos…'), icon: 'image-plus', on: () => U.addPhotos() },
      { label: 'Photos du carnet…', icon: 'images', on: () => U.tray() },
      E.c && E.c.pages.length ? { label: 'Composer une page (3 à 6 photos)…', icon: 'layout-dashboard', on: () => U.compose() } : null
    ], { title: 'Photos' });
  };
  /** Choix des photos : sélecteur d'Android (plusieurs à la fois) ou fichiers du PC */
  U.pickImages = async function () {
    const B = !window.MAGPC && window.MAGOffice;
    if (B && B.pick) {
      const V = window.MAGVoyage;
      // lieu des photos : Android le retire sans l'autorisation « Accès à la position des contenus multimédias »
      if (V && V.locState && V.locState() === 'ask' && !CV.settings.locAsked) {
        CV.settings.locAsked = true; CV.saveSettings();
        await new Promise((res) => { U._permWait = res; try { V.askLoc(); } catch (e) { res(); } setTimeout(res, 20000); });
      }
      const d = await new Promise((res) => {
        const prev = window.officeEvent;
        window.officeEvent = function (type, json) { if (type === 'files') { window.officeEvent = prev; let o = {}; try { o = JSON.parse(json || '{}'); } catch (e) { } res(o); return; } if (prev) prev(type, json); };
        B.pick('image/*', true, false);
      });
      if (d.cancel || !d.files) return [];
      const out = [];
      for (const f of d.files) {
        try {
          const o = JSON.parse(B.open(f.src) || '{}'); if (!o.ok) throw new Error(o.err || 'lecture');
          const parts = []; let off = 0;
          while (off < o.size || o.size < 0) { const b = B.read(o.h, off, 2 * 1024 * 1024); if (!b) break; const u = O.b64ToBytes(b); parts.push(u); off += u.length; if (o.size < 0 && u.length === 0) break; }
          B.close(o.h);
          let extra = null; try { if (V && V.exif) extra = JSON.parse(V.exif(f.src) || 'null'); } catch (e) { }
          out.push({ blob: new Blob(parts, { type: O.mimeOf(f.name, 'image/jpeg') }), name: f.name, extra });
        } catch (e) { O.toast(f.name + ' : lecture impossible', { bad: true }); }
      }
      return out;
    }
    const l = await O.Files.pickMedia('image/*', true);
    return l.map((f) => ({ blob: f, name: f.name || 'photo.jpg' }));
  };
  window.voyageEvent = function (type, json) { if (type === 'perm' && U._permWait) { const w = U._permWait; U._permWait = null; w(json); } };
  U.addPhotos = async function (files) {
    if (!E.c) return;
    files = files || await U.pickImages();
    if (!files.length) return;
    const added = await U.importList(files);
    if (!added.length) return;
    U.place(added);
  };
  U.importList = async function (files) {
    const pr = U.progress('Import des photos…', files.length);
    const added = [];
    for (let i = 0; i < files.length; i++) {
      pr(i);
      try { added.push(await M.importPhoto(files[i].blob, files[i].name, E.c.id, files[i].extra)); }
      catch (e) { O.toast(e.message || String(e), { bad: true }); }
    }
    pr(-1);
    await M.ensureUrls(added.map((m) => m.id));
    if (CV.settings.geo) U.geocode(added);
    return added;
  };
  /** Pose les photos importées sur la page : composition automatique (3 à 6 sur une page vide) ou en cascade */
  U.place = function (added) {
    const page = E.page(E.pi), ids = added.map((m) => m.id);
    if (page && !page.cover && !page.items.length && ids.length >= 3 && ids.length <= 6) {
      const props = M.compose(ids); const p = props[1] || props[0];
      p.items.forEach((it) => page.items.push(it));
      E.renderItems(E.pi); E.select(p.items.map((x) => x.id)); E.commit('Ajouter des photos');
      O.toast(ids.length + ' photos posées en « ' + p.name + ' » : « Composer » propose d\'autres agencements');
      return;
    }
    const n = ids.length, sel = [];
    ids.forEach((id, i) => {
      const inf = M.info(id) || {}, w = n === 1 ? 560 : 420, h = A.idealH('bord', w, inf);
      const it = M.photoItem(id, { frame: 'bord', w, h, x: 140 + (i % 4) * 60 + (n === 1 ? 80 : 0), y: 160 + i * 70, rot: (i % 2 ? 3 : -3) });
      page.items.push(it); sel.push(it.id);
    });
    E.renderItems(E.pi); E.select(sel); E.commit('Ajouter des photos');
    O.toast(n > 1 ? n + ' photos ajoutées' : 'Photo ajoutée');
  };
  U.geocode = async function (ms) {
    let n = 0;
    for (const m of ms) {
      const ex = m.exif || {}; if (ex.lat == null || ex.place) continue;
      try { ex.place = await M.place(ex.lat, ex.lon); m.exif = ex; await M.putMedia(m); const i = M.info(m.id); if (i) i.exif = ex; n++; }
      catch (e) { O.toast('Lieu en clair indisponible : ' + e.message, { bad: true }); break; }
    }
    if (n) U.props();
    return n;
  };
  U.progress = function (label, n) {
    let el = $('#prog'); if (!el) { el = O.h('div', { id: 'prog', role: 'progressbar' }); document.body.appendChild(el); }
    return (i) => {
      if (i < 0) { el.classList.remove('on'); return; }
      el.classList.add('on'); el.innerHTML = '<span>' + esc(label) + (n > 1 ? ' ' + (i + 1) + ' / ' + n : '') + '</span><i style="width:' + Math.round((i + 0.5) / Math.max(1, n) * 100) + '%"></i>';
    };
  };
  /** Photos du carnet (plateau) : poser sur la page, couverture, supprimer */
  U.tray = async function (opt) {
    opt = opt || {};
    const ms = (await M.mediaOf(E.c.id)).sort((a, b) => (a.exif && a.exif.t || a.added) - (b.exif && b.exif.t || b.added));
    await M.ensureUrls(ms.map((m) => m.id));
    const used = M.mediaIds(E.c);
    const body = O.h('div', { cls: 'tray' });
    body.innerHTML = (ms.length ? '<div class="trayGrid">' + ms.map((m) => '<button type="button" class="tph' + (used.has(m.id) ? ' used' : '') + '" data-m="' + m.id + '"><img src="' + M.url(m.id) + '" alt=""><span>' + esc(m.exif && m.exif.t ? new Date(m.exif.t).toLocaleDateString('fr-FR') : '') + '</span></button>').join('') + '</div>' : '<p class="hint">Aucune photo dans ce carnet pour l\'instant.</p>') +
      '<p class="hint">' + (opt.pick ? 'Touche une photo pour la choisir.' : 'Touche une photo pour la poser sur la page. Les photos déjà utilisées sont marquées d\'un point.') + '</p>';
    let chosen = null;
    const v = await O.dialog({
      title: opt.title || 'Photos du carnet', body, wide: true, cls: 'cv-dlg',
      onOpen: (w, close) => { body.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) { chosen = b.dataset.m; close('pick'); } }); },
      buttons: [{ label: 'Ajouter des photos…', value: 'add', left: true }, { label: 'Fermer', value: null, primary: true }]
    });
    if (v === 'add') { const added = await U.importList(await U.pickImages()); if (opt.pick) return added[0] ? added[0].id : null; if (added.length) U.place(added); return null; }
    if (v === 'pick' && chosen) {
      if (opt.pick) return chosen;
      const inf = M.info(chosen) || {}, w = 520, h = A.idealH('polaroid', w, inf);
      E.addItem(M.photoItem(chosen, { frame: 'polaroid', w, h, x: (W - w) / 2, y: (H - h) / 2, rot: -2 }));
    }
    return null;
  };

  /* ---------------- Texte ---------------- */
  U.textMenu = function (at) {
    O.menu(at, [
      { label: 'Texte manuscrit', icon: 'pen-line', on: () => U.addText({ font: 'manuscrit', size: 54, text: 'Quelle journée !' }) },
      { label: 'Titre', icon: 'heading', on: () => U.addText({ font: 'titre', size: 110, text: 'Titre', align: 'center', w: 760 }) },
      { label: 'Machine à écrire', icon: 'keyboard', on: () => U.addText({ font: 'machine', size: 34, text: 'Jour 1 — arrivée.' }) },
      { label: 'Étiquette', icon: 'tag', on: () => U.addText({ font: 'machine', size: 34, text: 'Marseille', style: 'etiquette', w: 360 }) },
      { label: 'Bannière de titre', icon: 'flag', on: () => U.addText({ font: 'titre', size: 72, text: 'Souvenirs', style: 'banniere', align: 'center', w: 560 }) },
      { label: 'Morceau de papier', icon: 'sticky-note', on: () => U.addText({ font: 'ecolier', size: 36, text: 'Écris ici…', style: 'papier', w: 480 }) },
      '-',
      { label: 'Date, lieu et météo du jour…', icon: 'calendar-days', on: () => U.dayInfo() }
    ], { title: 'Texte' });
  };
  U.addText = function (o) {
    const it = Object.assign({ id: M.uid('i'), type: 'text', text: 'Texte', font: 'manuscrit', size: 48, color: '#2E2620', align: 'left', style: 'aucun', rot: 0, w: 520 }, o);
    it.h = R.textLayout(it).h; it.x = (W - it.w) / 2; it.y = H * 0.42 - it.h / 2;
    E.addItem(it);
    U.editText(it, true);
  };
  U.editText = async function (it, fresh) {
    const body = O.h('div', { cls: 'txtEd' });
    body.innerHTML = '<textarea class="o-in" rows="4" id="teT" style="font-family:\'' + esc(A.font(it.font)[2]) + '\';font-size:22px">' + esc(it.text) + '</textarea><p class="hint">Retour à la ligne : touche Entrée. Police, taille et couleur : dans les propriétés.</p>';
    const v = await O.dialog({ title: fresh ? 'Écris ton texte' : 'Modifier le texte', body, cls: 'cv-dlg', buttons: [{ label: 'Annuler', value: null }, { label: 'OK', value: 'ok', primary: true }], onOpen: () => setTimeout(() => { const t = $('#teT', body); t.focus(); if (fresh) t.select(); }, 60) });
    if (v !== 'ok') return;
    E.change(it, { text: $('#teT', body).value || ' ' }, 'Texte', true);
    U.props();
  };
  U.dayInfo = async function () {
    const today = new Date().toISOString().slice(0, 10);
    // position : celle des photos de la page (sinon du carnet)
    const page = E.page(E.pi), pm = (page.items || []).filter((x) => x.type === 'photo').map((x) => M.info(x.media)).filter((i) => i && i.exif && i.exif.lat != null);
    const ex = pm[0] && pm[0].exif;
    const body = O.h('div', { cls: 'o-form' });
    body.innerHTML = '<label class="o-field half"><span>Date</span><input class="o-in" type="date" id="diD" value="' + (ex && ex.t ? new Date(ex.t - new Date(ex.t).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : today) + '"></label>' +
      '<label class="o-field half"><span>Lieu</span><input class="o-in" id="diL" value="' + esc(ex && ex.place || '') + '" placeholder="Ex. : Marseille"></label>' +
      '<label class="o-field"><span>Météo</span><input class="o-in" id="diW" placeholder="Ex. : ☀ 26 °C, grand soleil"></label>' +
      '<div class="row"><button type="button" class="btn" id="diM">' + ic('cloud-sun') + 'Chercher la météo de ce jour</button></div><p class="hint" id="diH">Météo : Open-Meteo (gratuit, sans clé), d\'après la position des photos de la page' + (ex ? '' : ' ou celle de l\'appareil') + '. Internet nécessaire.</p>';
    const v = await O.dialog({
      title: 'Date, lieu et météo du jour', body, cls: 'cv-dlg',
      onOpen: () => {
        $('#diM', body).onclick = async () => {
          const hint = $('#diH', body); hint.textContent = 'Recherche…';
          try {
            let lat = ex && ex.lat, lon = ex && ex.lon;
            if (lat == null) { const p = await new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => rej(new Error('position refusée')), { timeout: 15000, maximumAge: 600000 }) : rej(new Error('position indisponible'))); lat = p.coords.latitude; lon = p.coords.longitude; }
            const w = await M.weather(lat, lon, $('#diD', body).value || today);
            $('#diW', body).value = w.sym + ' ' + Math.round(w.tmax) + ' °C' + (w.txt ? ', ' + w.txt : '');
            if (!$('#diL', body).value && CV.settings.geo) { try { $('#diL', body).value = await M.place(lat, lon); } catch (e) { } }
            hint.textContent = 'Météo trouvée (Open-Meteo).';
          } catch (e) { hint.textContent = 'Météo indisponible : ' + e.message; }
        };
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Ajouter', value: 'ok', primary: true }]
    });
    if (v !== 'ok') return;
    const d = $('#diD', body).value, l = $('#diL', body).value.trim(), w = $('#diW', body).value.trim();
    const ds = d ? new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const text = [ds && ds[0].toUpperCase() + ds.slice(1), l && '📍 ' + l, w].filter(Boolean).join('\n');
    U.addText({ font: 'machine', size: 30, text: text || 'Aujourd\'hui', style: 'papier', w: 520 });
  };

  /* ---------------- Dessin ---------------- */
  U.draw = function () {
    if (E.drawing) { U.endDraw(); return; }
    E.startDraw(); U.drawBar(); U.push(() => U.endDraw(true));
    O.toast('Dessine avec le doigt, le stylet ou la souris');
  };
  U.endDraw = function (fromBack) { E.endDraw(); $('#drawBar').hidden = true; $('#tools').hidden = false; if (!fromBack) U.pop(); U.props(); };
  U.drawBar = function () {
    const b = $('#drawBar'); b.hidden = false; $('#tools').hidden = true;
    const p = E.pen;
    b.innerHTML = '<div class="pens">' + R.PENS.map((x) => '<button class="chip' + (p.pen === x[0] ? ' on' : '') + '" data-pen="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="swatches">' + ['#1D2A5C', '#2E2620', '#9E3B2E', '#2F6F73', '#5B7F3A', '#B5532F', '#7A4E9C', '#F4C542', '#E05A5A', '#FFFFFF'].map((c) => '<button class="sw' + (p.color === c ? ' on' : '') + '" data-col="' + c + '" style="background:' + c + '" aria-label="Couleur"></button>').join('') + '</div>' +
      '<label class="thick">' + ic('minus') + '<input type="range" min="1.5" max="22" step="0.5" value="' + p.width + '" id="penW" aria-label="Épaisseur">' + ic('plus') + '</label>' +
      '<div class="row"><button class="btn" data-dact="undo">' + ic('undo-2') + 'Effacer le dernier trait</button><button class="btn pri" data-dact="done">' + ic('check') + 'Terminé</button></div>';
  };
  U.drawClick = function (e) {
    const t = e.target.closest('[data-pen],[data-col],[data-dact]'); if (!t) return;
    if (t.dataset.pen) E.pen.pen = t.dataset.pen;
    if (t.dataset.col) E.pen.color = t.dataset.col;
    if (t.dataset.dact === 'undo') { E.undoStroke(); return; }
    if (t.dataset.dact === 'done') { U.endDraw(); return; }
    U.drawBar();
  };

  /* ---------------- Décorations : autocollants, icônes, carte ---------------- */
  U.deco = async function () {
    const body = O.h('div', { cls: 'deco' });
    let tab = 'st';
    const render = () => {
      body.innerHTML = '<div class="chips tabs"><button class="chip' + (tab === 'st' ? ' on' : '') + '" data-tab="st">Autocollants</button><button class="chip' + (tab === 'ic' ? ' on' : '') + '" data-tab="ic">Icônes</button><button class="chip' + (tab === 'map' ? ' on' : '') + '" data-tab="map">Carte</button><button class="chip' + (tab === 'tape' ? ' on' : '') + '" data-tab="tape">Ruban</button></div>';
      if (tab === 'st') body.innerHTML += '<div class="stGrid">' + A.STICKERS.map((s) => '<button class="stk" data-st="' + s[0] + '" title="' + esc(s[1]) + '"><svg viewBox="-60 -40 120 80">' + A.sticker(s[0], A.stickerRatio(s[0]) === 2 ? 110 : 70, A.stickerRatio(s[0]) === 2 ? 55 : 70, '', 'dk' + s[0]) + '</svg><span>' + esc(s[1]) + '</span></button>').join('') + '</div>';
      else if (tab === 'ic') { body.innerHTML += '<input class="o-in" id="icQ" placeholder="Chercher (ex. : soleil, carte, avion, plage)"><div class="icGrid" id="icG"></div><p class="hint">Icônes Lucide (licence ISC).</p>'; fillIcons(''); }
      else if (tab === 'map') body.innerHTML += '<div class="mapPrev">' + '<svg viewBox="-260 -170 520 340">' + '</svg></div><p>Une petite carte de l\'itinéraire, sur un fond de carte simplifié (Natural Earth, domaine public). Les étapes viennent des photos géolocalisées ou se posent à la main.</p><button class="btn pri" data-map="1">' + ic('map') + 'Créer la carte</button>';
      else if (tab === 'tape') body.innerHTML += '<div class="stGrid">' + A.WASHI.map((t, i) => '<button class="stk" data-tape="' + t[0] + '"><svg viewBox="-70 -25 140 50">' + A.tape('dt' + i, 0, 0, 120, 30, -6, t[0], ['#E6A1A0', '#9FC5D9', '#C5D9A0', '#F4C542', '#C9A06A', '#B7AEDB'][i % 6]) + '</svg><span>' + t[1] + '</span></button>').join('') + '</div>';
    };
    const fillIcons = (q) => { const g = $('#icG', body); if (!g) return; const names = O.searchIcons(q || 'plane map camera sun mountain palm compass heart star', q ? 60 : 48); g.innerHTML = names.map((n) => '<button class="icb" data-ic="' + n + '" title="' + esc(n) + '">' + O.icon(n) + '</button>').join(''); };
    render();
    const d = O.dialog({
      title: 'Décorations', body, wide: true, cls: 'cv-dlg',
      onOpen: (w, close) => {
        body.addEventListener('input', (e) => { if (e.target.id === 'icQ') fillIcons(e.target.value); });
        body.addEventListener('click', (e) => {
          const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); return; }
          const s = e.target.closest('[data-st]'); if (s) { const r = A.stickerRatio(s.dataset.st), w0 = r === 2 ? 340 : 200; E.addItem({ id: M.uid('i'), type: 'sticker', name: s.dataset.st, x: (W - w0) / 2, y: H * 0.4, w: w0, h: w0 / r, rot: s.dataset.st.startsWith('tampon') ? -8 : 0 }); close(null); return; }
          const i = e.target.closest('[data-ic]'); if (i) { E.addItem({ id: M.uid('i'), type: 'icon', name: i.dataset.ic, x: W / 2 - 70, y: H * 0.4, w: 140, h: 140, rot: 0, color: '#2E2620', stroke: 1.8 }); close(null); return; }
          const tp = e.target.closest('[data-tape]'); if (tp) { E.addItem({ id: M.uid('i'), type: 'text', text: ' ', style: 'ruban', tape: tp.dataset.tape, bg: '#E6A1A0', font: 'machine', size: 34, w: 360, x: W / 2 - 180, y: H * 0.3, rot: -6, h: 70 }); const it = E.selItems()[0]; if (it) { it.h = 70; E.updateItem(it, true); } close(null); return; }
          if (e.target.closest('[data-map]')) { close(null); U.mapDialog(null); }
        });
      },
      buttons: [{ label: 'Fermer', value: null, primary: true }]
    });
    await d;
  };

  /* ---------------- Carte de l'itinéraire ---------------- */
  U.mapDialog = async function (it) {
    try { if (!window.CV_CARTE) await O.loadScript('cv-carte-data.js'); } catch (e) { O.toast('Fond de carte introuvable', { bad: true }); return; }
    const fresh = !it;
    const m = it ? JSON.parse(JSON.stringify(it)) : { id: M.uid('i'), type: 'map', region: 'auto', style: 'ancienne', title: '', points: [], w: 640, h: 480, rot: 0 };
    if (fresh) {
      // étapes : lieux des photos du carnet (dans l'ordre des dates)
      const ms = (await M.mediaOf(E.c.id)).filter((x) => x.exif && x.exif.lat != null).sort((a, b) => (a.exif.t || 0) - (b.exif.t || 0));
      const pts = []; ms.forEach((x) => { const l = pts[pts.length - 1]; if (!l || Math.hypot(l.lat - x.exif.lat, l.lon - x.exif.lon) > 0.05) pts.push({ lat: x.exif.lat, lon: x.exif.lon, name: (x.exif.place || '').split(',')[0] }); });
      m.points = pts.slice(0, 12);
    }
    const body = O.h('div', { cls: 'mapEd' });
    const draw = () => {
      const pv = { ...m, w: 640, h: 480 };
      $('.mapPv', body).innerHTML = '<svg viewBox="-320 -240 640 480">' + R.itemSvg({ ...pv, x: -320, y: -240 }, { pfx: 'mp-', href: () => '', media: () => ({}) }).replace(/^<g data-id="[^"]*"/, '<g') + '</svg>';
      $('.mapPts', body).innerHTML = m.points.map((p, i) => '<div class="mpt"><b>' + (i + 1) + '</b><input class="o-in" data-pn="' + i + '" value="' + esc(p.name || '') + '" placeholder="Nom de l\'étape"><button class="ibtn" data-up="' + i + '" aria-label="Monter">' + ic('arrow-up') + '</button><button class="ibtn" data-rm="' + i + '" aria-label="Retirer">' + ic('x') + '</button></div>').join('') || '<p class="hint">Aucune étape : touche la carte pour en poser une.</p>';
    };
    body.innerHTML = '<div class="o-form"><label class="o-field half"><span>Zone</span><select class="o-in" id="mpR">' + R.REGIONS.map((r) => '<option value="' + r[0] + '"' + (m.region === r[0] ? ' selected' : '') + '>' + r[1] + '</option>').join('') + '</select></label><label class="o-field half"><span>Style</span><select class="o-in" id="mpS">' + R.MAP_STYLES.map((r) => '<option value="' + r[0] + '"' + (m.style === r[0] ? ' selected' : '') + '>' + r[1] + '</option>').join('') + '</select></label><label class="o-field"><span>Titre (facultatif)</span><input class="o-in" id="mpT" value="' + esc(m.title || '') + '" placeholder="Ex. : Notre route"></label></div>' +
      '<div class="mapPv" title="Touche la carte pour ajouter une étape"></div><div class="mapPts"></div><p class="hint">Touche la carte pour poser une étape. Fond de carte : Natural Earth (domaine public).</p>';
    draw();
    const v = await O.dialog({
      title: fresh ? 'Carte de l\'itinéraire' : 'Modifier la carte', body, wide: true, cls: 'cv-dlg',
      onOpen: () => {
        body.addEventListener('change', (e) => { if (e.target.id === 'mpR') { m.region = e.target.value; draw(); } if (e.target.id === 'mpS') { m.style = e.target.value; draw(); } });
        body.addEventListener('input', (e) => { if (e.target.id === 'mpT') { m.title = e.target.value; draw(); } if (e.target.dataset.pn != null) { m.points[+e.target.dataset.pn].name = e.target.value; clearTimeout(U._mt); U._mt = setTimeout(() => { const a = document.activeElement, k = a && a.dataset.pn; draw(); if (k != null) { const n = body.querySelector('[data-pn="' + k + '"]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } } }, 500); } });
        body.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-rm]'); if (rm) { m.points.splice(+rm.dataset.rm, 1); draw(); return; }
          const up = e.target.closest('[data-up]'); if (up) { const i = +up.dataset.up; if (i > 0) { const t = m.points[i]; m.points.splice(i, 1); m.points.splice(i - 1, 0, t); draw(); } return; }
          const pv = e.target.closest('.mapPv'); if (pv) {
            const svg = pv.querySelector('svg'), r = svg.getBoundingClientRect();
            const b0 = 0.035 * 480, aw = 640 - 2 * b0, ah = 480 - 2 * b0;
            const x = (e.clientX - r.left) / r.width * 640 - b0, y = (e.clientY - r.top) / r.height * 480 - b0;
            if (x < 0 || y < 0 || x > aw || y > ah) return;
            const b = R.mapBox({ region: m.region === 'auto' && !m.points.length ? 'france' : m.region, points: m.points, w: aw, h: ah });
            if (m.region === 'auto') m.region = R.REGIONS.find((q) => q[2] && q[2][0] <= b[0] + 0.01 && q[2][2] >= b[2] - 0.01) ? m.region : m.region;
            const lon = b[0] + x / aw * (b[2] - b[0]), lat = b[3] - y / ah * (b[3] - b[1]);
            if (m.region === 'auto') m.region = m.points.length ? 'auto' : 'france';
            m.points.push({ lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000, name: 'Étape ' + (m.points.length + 1) });
            draw();
          }
        });
      },
      buttons: [{ label: 'Annuler', value: null }, { label: fresh ? 'Poser la carte' : 'Appliquer', value: 'ok', primary: true }]
    });
    if (v !== 'ok') return;
    if (fresh) { m.x = (W - m.w) / 2; m.y = H * 0.3; E.addItem(m); }
    else E.change(it, { region: m.region, style: m.style, title: m.title, points: m.points }, 'Carte', true);
  };

  /* ---------------- Page : fond, ajout, duplication, ordre, suppression ---------------- */
  U.pageMenu = function (at) {
    const p = E.page(E.pi);
    O.menu(at, [
      { head: 'Fond de la page' },
      { node: (() => { const d = O.h('div', { cls: 'bgPick' }); d.innerHTML = A.BG.map((b) => '<button class="bgb' + (p.bg === b[0] ? ' on' : '') + '" data-bg="' + b[0] + '"><svg viewBox="0 0 1000 1414">' + A.bg(b[0], 'bgp' + b[0], 'x') + '</svg><span>' + b[1] + '</span></button>').join(''); d.onclick = (e) => { const b = e.target.closest('[data-bg]'); if (!b) return; O.closeMenu(); U.setBg(b.dataset.bg); }; return d; })() },
      { label: 'Ce fond pour toutes les pages', icon: 'copy-check', on: () => { E.c.pages.forEach((q) => { q.bg = p.bg; }); E.render(); E.commit('Fond'); U.pagesBar(); } },
      '-',
      { label: 'Ajouter une page', icon: 'file-plus', on: () => U.addPage() },
      { label: 'Dupliquer la page', icon: 'copy', on: () => U.dupPage() },
      { label: 'Déplacer vers la gauche', icon: 'arrow-left', disabled: E.pi <= 0, on: () => U.movePage(-1) },
      { label: 'Déplacer vers la droite', icon: 'arrow-right', disabled: E.pi >= E.c.pages.length - 1, on: () => U.movePage(1) },
      { label: 'Toutes les pages…', icon: 'layout-grid', on: () => U.pagesDialog() },
      { label: 'Supprimer la page', icon: 'trash', danger: true, disabled: E.c.pages.length <= 1, on: () => U.delPage() }
    ], { title: 'Page ' + (E.pi + 1), cls: 'pageMenu' });
  };
  U.setBg = function (bg) { const p = E.page(E.pi); if (!p || p.cover) return; p.bg = bg; E.renderBg(E.pi); E.commit('Fond'); U.pagesBar(); };
  U.addPage = function (after) {
    const i = after == null ? (E.pi < 0 ? 0 : E.pi + 1) : after + 1;
    const bg = (E.page(Math.max(0, E.pi)) || {}).bg || 'creme';
    E.c.pages.splice(i, 0, M.newPage(bg)); E.commit('Ajouter une page'); E.go(i); U.pagesBar(); O.toast('Page ' + (i + 1) + ' ajoutée');
  };
  U.dupPage = function () {
    if (E.pi < 0) return;
    const p = JSON.parse(JSON.stringify(E.page(E.pi))); p.id = M.uid('p'); p.items.forEach((it) => { it.id = M.uid('i'); });
    E.c.pages.splice(E.pi + 1, 0, p); E.commit('Dupliquer la page'); E.go(E.pi + 1); U.pagesBar();
  };
  U.movePage = function (d) {
    const i = E.pi, j = i + d; if (i < 0 || j < 0 || j >= E.c.pages.length) return;
    const p = E.c.pages.splice(i, 1)[0]; E.c.pages.splice(j, 0, p); E.commit('Déplacer la page'); E.pi = j; E.render(); U.pagesBar(); E.onPage();
  };
  U.delPage = async function () {
    if (E.c.pages.length <= 1 || E.pi < 0) return;
    const p = E.page(E.pi);
    if (p.items.length && !(await O.confirm('Supprimer la page ' + (E.pi + 1) + ' ?', 'Elle contient ' + p.items.length + ' élément(s). « Annuler » (Ctrl+Z) la fera revenir.', 'Supprimer', true))) return;
    E.c.pages.splice(E.pi, 1); E.sel = []; E.commit('Supprimer la page'); E.pi = Math.min(E.pi, E.c.pages.length - 1); E.render(); U.pagesBar(); E.onPage();
  };
  /** Vignettes des pages (barre latérale sur PC) */
  U.pagesBar = function () {
    const b = $('#pagesBar'); if (!b || !E.c) return;
    if (PHONE()) { b.innerHTML = ''; return; }
    const th = (pi) => { const p = E.page(pi); return '<button class="pth' + (E.visible().includes(pi) ? ' on' : '') + '" data-go="' + pi + '" draggable="' + (pi >= 0) + '">' + R.pageSvg(E.c, p, { pfx: 't' + pi + '-', href: M.url, media: M.info, cover: pi === -1 }) + '<span>' + (pi === -1 ? 'Couverture' : pi + 1) + '</span></button>'; };
    b.innerHTML = th(-1) + E.c.pages.map((p, i) => th(i)).join('') + '<button class="pth add" data-addp="1">' + ic('plus') + '<span>Page</span></button>';
  };
  U.pagesThumbSoon = function () { clearTimeout(U._pt); U._pt = setTimeout(U.pagesBar, 700); };
  U.pagesBarClick = function (e) {
    const g = e.target.closest('[data-go]'); if (g) { E.go(+g.dataset.go); return; }
    if (e.target.closest('[data-addp]')) U.addPage(E.c.pages.length - 1);
  };
  U.pagesDialog = async function () {
    const body = O.h('div', { cls: 'pagesAll' });
    const draw = () => {
      body.innerHTML = '<div class="pgGrid">' + [-1].concat(E.c.pages.map((p, i) => i)).map((pi) => '<div class="pgc' + (pi === E.pi ? ' on' : '') + '" data-pi="' + pi + '"><button class="pgThumb" data-open="' + pi + '">' + R.pageSvg(E.c, E.page(pi), { pfx: 'pa' + pi + '-', href: M.url, media: M.info, cover: pi === -1 }) + '</button><div class="pgAct"><b>' + (pi === -1 ? 'Couverture' : pi + 1) + '</b>' + (pi >= 0 ? '<button class="ibtn" data-mv="' + pi + ':-1" aria-label="Avant"' + (pi === 0 ? ' disabled' : '') + '>' + ic('chevron-left') + '</button><button class="ibtn" data-mv="' + pi + ':1" aria-label="Après"' + (pi === E.c.pages.length - 1 ? ' disabled' : '') + '>' + ic('chevron-right') + '</button><button class="ibtn" data-dup="' + pi + '" aria-label="Dupliquer">' + ic('copy') + '</button><button class="ibtn" data-del="' + pi + '" aria-label="Supprimer"' + (E.c.pages.length <= 1 ? ' disabled' : '') + '>' + ic('trash') + '</button>' : '') + '</div></div>').join('') + '</div>';
    };
    draw();
    await O.dialog({
      title: 'Pages du carnet', body, wide: true, cls: 'cv-dlg',
      onOpen: (w, close) => body.addEventListener('click', (e) => {
        const o = e.target.closest('[data-open]'); if (o) { close(null); E.go(+o.dataset.open, true); return; }
        const mv = e.target.closest('[data-mv]'); if (mv) { const [i, d] = mv.dataset.mv.split(':').map(Number); E.pi = i; U.movePage(d); draw(); return; }
        const du = e.target.closest('[data-dup]'); if (du) { E.pi = +du.dataset.dup; U.dupPage(); draw(); return; }
        const de = e.target.closest('[data-del]'); if (de) { E.pi = +de.dataset.del; const p = E.page(E.pi); E.c.pages.splice(E.pi, 1); void p; E.commit('Supprimer la page'); E.pi = Math.min(E.pi, E.c.pages.length - 1); E.render(); U.pagesBar(); draw(); O.toast('Page supprimée (Ctrl+Z pour annuler)'); }
      }),
      buttons: [{ label: 'Ajouter une page', value: 'add', left: true }, { label: 'Fermer', value: null, primary: true }]
    }).then((v) => { if (v === 'add') U.addPage(E.c.pages.length - 1); });
  };

  /* ---------------- Couverture ---------------- */
  U.coverDialog = async function () {
    const c = E.c, cv = c.cover;
    const body = O.h('div', { cls: 'covEd' });
    const draw = () => {
      body.innerHTML = '<div class="covGrid"><div class="covPv">' + R.pageSvg(c, { id: 'cover', items: c.coverItems || [] }, { pfx: 'cd-', href: M.url, media: M.info, cover: true }) + '</div><div>' +
        '<label class="o-field"><span>Titre</span><input class="o-in" id="cvT" value="' + esc(c.title) + '" maxlength="60"></label>' +
        '<label class="o-field"><span>Dates</span><input class="o-in" id="cvD" value="' + esc(c.dates || '') + '" placeholder="Ex. : 12 – 26 juillet 2026"></label>' +
        '<div class="o-field"><span>Matière</span><div class="chips">' + A.COVERS.map((s) => '<button class="chip' + (cv.style === s[0] ? ' on' : '') + '" data-cs="' + s[0] + '">' + s[1] + '</button>').join('') + '</div></div>' +
        '<div class="o-field"><span>Couleur</span><div class="swatches">' + A.COVER_COLORS[cv.style || 'cuir'].map((x) => '<button class="sw' + ((cv.color || A.COVER_COLORS[cv.style || 'cuir'][0]) === x ? ' on' : '') + '" data-cc="' + x + '" style="background:' + x + '"></button>').join('') + '<input type="color" id="cvC" value="' + (cv.color || A.COVER_COLORS[cv.style || 'cuir'][0]) + '" aria-label="Autre couleur"></div></div>' +
        '<div class="o-field"><span>Titre</span><div class="chips">' + [['etiquette', 'Étiquette'], ['dorure', 'Dorure'], ['simple', 'Simple']].map((s) => '<button class="chip' + ((cv.titleStyle || (cv.style === 'cuir' ? 'dorure' : 'etiquette')) === s[0] ? ' on' : '') + '" data-ts="' + s[0] + '">' + s[1] + '</button>').join('') + '</div></div>' +
        '<label class="o-field"><span>Police du titre</span><select class="o-in" id="cvF">' + A.FONTS.map((x) => '<option value="' + x[0] + '"' + ((cv.font || (cv.style === 'cuir' ? 'serif' : 'manuscrit')) === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></label>' +
        '<div class="o-field"><span>Photo de couverture</span><div class="row"><button class="btn" data-cp="pick">' + ic('image') + (cv.photo ? 'Changer' : 'Choisir') + '</button>' + (cv.photo ? '<select class="o-in" id="cvPF">' + [['polaroid', 'Polaroid'], ['bord', 'Bord blanc'], ['coins', 'Coins photo'], ['timbre', 'Timbre'], ['washi', 'Washi']].map((x) => '<option value="' + x[0] + '"' + ((cv.photoFrame || 'polaroid') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select><button class="btn" data-cp="rm">' + ic('x') + 'Retirer</button>' : '') + '</div>' + (cv.photo && (cv.photoFrame || 'polaroid') === 'polaroid' ? '<input class="o-in" id="cvCap" value="' + esc(cv.caption || '') + '" placeholder="Légende du Polaroid" style="margin-top:6px">' : '') + '</div>' +
        '</div></div>';
    };
    draw();
    const upd = (label) => { const k = body.querySelector('.covPv'); if (k) k.innerHTML = R.pageSvg(c, { id: 'cover', items: c.coverItems || [] }, { pfx: 'cd-', href: M.url, media: M.info, cover: true }); if (E.pi === -1) E.render(); $('#edTitle').textContent = c.title; clearTimeout(U._cv); U._cv = setTimeout(() => E.commit(label || 'Couverture'), 400); };
    await O.dialog({
      title: 'Couverture', body, wide: true, cls: 'cv-dlg',
      onOpen: () => {
        body.addEventListener('input', (e) => {
          const t = e.target;
          if (t.id === 'cvT') c.title = t.value || 'Mon carnet';
          else if (t.id === 'cvD') c.dates = t.value;
          else if (t.id === 'cvC') cv.color = t.value;
          else if (t.id === 'cvCap') cv.caption = t.value;
          else return;
          upd();
        });
        body.addEventListener('change', (e) => { if (e.target.id === 'cvF') { cv.font = e.target.value; upd(); } if (e.target.id === 'cvPF') { cv.photoFrame = e.target.value; draw(); upd(); } });
        body.addEventListener('click', async (e) => {
          const s = e.target.closest('[data-cs]'); if (s) { cv.style = s.dataset.cs; cv.color = A.COVER_COLORS[cv.style][0]; cv.titleStyle = ''; cv.font = ''; draw(); upd(); return; }
          const cc = e.target.closest('[data-cc]'); if (cc) { cv.color = cc.dataset.cc; draw(); upd(); return; }
          const ts = e.target.closest('[data-ts]'); if (ts) { cv.titleStyle = ts.dataset.ts; draw(); upd(); return; }
          const cp = e.target.closest('[data-cp]'); if (cp) {
            if (cp.dataset.cp === 'rm') { cv.photo = null; draw(); upd(); return; }
            const id = await U.tray({ pick: true, title: 'Photo de couverture' }); if (id) { cv.photo = id; await M.ensureUrls([id]); draw(); upd(); }
          }
        });
      },
      buttons: [{ label: 'Terminé', value: null, primary: true }]
    });
    E.commit('Couverture'); U.home && 0;
    U.pagesBar();
  };

  /* ---------------- Composer ---------------- */
  U.compose = async function () {
    if (!E.c) return;
    if (E.pi < 0) { E.go(0, true); }
    const all = (await M.mediaOf(E.c.id)).sort((a, b) => (a.exif && a.exif.t || a.added) - (b.exif && b.exif.t || b.added));
    if (all.length < 3) { const v = await O.dialog({ title: 'Composer une page', body: '<p>Il faut au moins 3 photos dans le carnet (tu en as ' + all.length + ').</p>', buttons: [{ label: 'Fermer', value: null }, { label: 'Ajouter des photos…', value: 'add', primary: true }] }); if (v === 'add') U.addPhotos(); return; }
    await M.ensureUrls(all.map((m) => m.id));
    const page = E.page(E.pi);
    let pre = E.selItems().filter((x) => x.type === 'photo').map((x) => x.media);
    if (pre.length < 3) pre = page.items.filter((x) => x.type === 'photo').map((x) => x.media);
    if (pre.length < 3) { const used = M.mediaIds(E.c); pre = all.filter((m) => !used.has(m.id)).map((m) => m.id); }
    if (pre.length < 3) pre = all.map((m) => m.id);
    const chosen = new Set(pre.slice(0, 6));
    const body = O.h('div', { cls: 'compose' });
    let step = 1, props = [], where = page.items.some((x) => x.type === 'photo') ? 'here' : 'here';
    const draw = () => {
      if (step === 1) {
        body.innerHTML = '<p class="hint"><b id="cpN">' + chosen.size + '</b> photo(s) choisie(s) — choisis-en de 3 à 6.</p><div class="trayGrid">' + all.map((m) => '<button type="button" class="tph sel' + (chosen.has(m.id) ? ' on' : '') + '" data-m="' + m.id + '"><img src="' + M.url(m.id) + '" alt=""><i>' + ic('check') + '</i></button>').join('') + '</div>';
      } else {
        body.innerHTML = '<p class="hint">Touche l\'agencement qui te plaît.</p><div class="propGrid">' + props.map((p, i) => '<button class="prop" data-p="' + i + '">' + R.pageSvg(E.c, { id: 'cp' + i, bg: page.bg, items: p.items }, { pfx: 'cp' + i + '-', href: M.url, media: M.info }) + '<span>' + esc(p.name) + '</span></button>').join('') + '</div>' +
          '<div class="chips"><button class="chip' + (where === 'here' ? ' on' : '') + '" data-w="here">Sur cette page</button><button class="chip' + (where === 'new' ? ' on' : '') + '" data-w="new">Sur une nouvelle page</button></div>';
      }
    };
    draw();
    const v = await O.dialog({
      title: 'Composer une page', body, wide: true, cls: 'cv-dlg compose-dlg',
      onOpen: (w, close) => {
        body.addEventListener('click', (e) => {
          const m = e.target.closest('[data-m]');
          if (m) { const id = m.dataset.m; if (chosen.has(id)) chosen.delete(id); else if (chosen.size < 6) chosen.add(id); else O.toast('6 photos au plus'); m.classList.toggle('on', chosen.has(id)); $('#cpN', body).textContent = chosen.size; return; }
          const p = e.target.closest('[data-p]'); if (p) { close('p' + p.dataset.p); return; }
          const wh = e.target.closest('[data-w]'); if (wh) { where = wh.dataset.w; $$('[data-w]', body).forEach((b) => b.classList.toggle('on', b === wh)); }
        });
        const go = w.querySelector('.o-dlg-ft .pri'); go.id = 'cpGo';
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Composer', primary: true, onClick: (close, w) => {
        const go = w.querySelector('#cpGo');
        if (step === 1) { if (chosen.size < 3) { O.toast('Choisis au moins 3 photos', { bad: true }); return false; } props = M.compose(Array.from(chosen)); step = 2; go.textContent = 'Autres photos'; draw(); }
        else { step = 1; go.textContent = 'Composer'; draw(); }
        return false;
      } }]
    });
    if (!v || v[0] !== 'p') return;
    const p = props[+v.slice(1)];
    let pi = E.pi;
    if (where === 'new') { E.c.pages.splice(E.pi + 1, 0, M.newPage(page.bg)); pi = E.pi + 1; }
    const tgt = E.page(pi);
    if (where === 'here') { for (let i = tgt.items.length - 1; i >= 0; i--) if (tgt.items[i].type === 'photo' && chosen.has(tgt.items[i].media)) tgt.items.splice(i, 1); }
    p.items.forEach((it) => tgt.items.push(it));
    E.sel = p.items.map((x) => x.id);
    E.pi = pi; E.render(); E.commit('Composer « ' + p.name + ' »'); U.pagesBar(); E.onPage();
    O.toast('Page composée : « ' + p.name + ' »');
  };

  /* ---------------- Panneau des propriétés ---------------- */
  const SEC = {};
  U.sheetTab = null;
  U.openSheet = function () { document.body.classList.add('sheetOpen'); };
  U.props = function () {
    const box = $('#props'); if (!box || !E.c) return;
    const its = E.selItems();
    if (E.drawing || !its.length) {
      document.body.classList.remove('hasSel', 'sheetOpen');
      box.innerHTML = PHONE() ? '' : U.pageProps();
      return;
    }
    document.body.classList.add('hasSel');
    const it = its[0];
    const secs = its.length > 1 ? [['dispo', 'Disposition']] : sectionsFor(it);
    const kind = its.length > 1 ? 'multi' : it.type;
    if (kind !== U._kind || !U.sheetTab || !secs.find((s) => s[0] === U.sheetTab)) U.sheetTab = secs[0][0];
    U._kind = kind;
    const phone = PHONE();
    let h = '<div class="pHead"><b>' + (its.length > 1 ? its.length + ' éléments' : ({ photo: 'Photo', text: 'Texte', draw: 'Dessin', sticker: 'Autocollant', icon: 'Icône', map: 'Carte' }[it.type])) + '</b>' + (phone ? '<button class="ibtn" data-pa="dup" aria-label="Dupliquer">' + ic('copy') + '</button><button class="ibtn" data-pa="del" aria-label="Supprimer">' + ic('trash') + '</button><button class="ibtn" data-pa="sheet" aria-label="Options">' + ic(document.body.classList.contains('sheetOpen') ? 'chevron-down' : 'chevron-up') + '</button><button class="ibtn" data-pa="desel" aria-label="Fermer">' + ic('x') + '</button>' : '') + '</div>';
    if (phone) h += '<div class="chips tabs">' + secs.map((s) => '<button class="chip' + (U.sheetTab === s[0] ? ' on' : '') + '" data-sec="' + s[0] + '">' + s[1] + '</button>').join('') + '</div>';
    h += '<div class="pBody">' + secs.filter((s) => !phone || s[0] === U.sheetTab).map((s) => '<section class="psec" data-s="' + s[0] + '">' + (phone ? '' : '<h4>' + s[1] + '</h4>') + SEC[s[0]](it, its) + '</section>').join('') + '</div>';
    box.innerHTML = h;
  };
  function sectionsFor(it) {
    if (it.type === 'photo') { const s = [['cadre', 'Cadre'], ['opts', 'Options'], ['filtre', 'Filtre'], ['reglages', 'Réglages'], ['legende', 'Légende'], ['dispo', 'Disposition']]; return s.filter((x) => x[0] !== 'opts' || hasOpts(it)); }
    if (it.type === 'text') return [['texte', 'Texte'], ['police', 'Police'], ['tstyle', 'Style'], ['dispo', 'Disposition']];
    if (it.type === 'sticker' || it.type === 'icon') return [['couleur', 'Couleur'], ['dispo', 'Disposition']];
    if (it.type === 'map') return [['carte', 'Carte'], ['dispo', 'Disposition']];
    return [['dispo', 'Disposition']];
  }
  const hasOpts = (it) => !['aucun', 'coins', 'trombone', 'dechire'].includes(it.frame) || it.frame === 'coins';
  const chips = (key, list, cur) => '<div class="chips">' + list.map((x) => '<button class="chip' + (cur === x[0] ? ' on' : '') + '" data-' + key + '="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div>';
  const swatches = (key, list, cur, custom) => '<div class="swatches">' + list.map((c) => '<button class="sw' + (String(cur).toLowerCase() === c.toLowerCase() ? ' on' : '') + '" data-' + key + '="' + c + '" style="background:' + c + '" aria-label="Couleur ' + c + '"></button>').join('') + (custom ? '<input type="color" data-' + key + 'in="1" value="' + (/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#2E2620') + '" aria-label="Autre couleur">' : '') + '</div>';
  const slider = (id, label, min, max, step, v, unit) => '<label class="sl"><span>' + label + '</span><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '"><output id="' + id + 'V">' + v + (unit || '') + '</output></label>';
  const field = (k, label, v, ph) => '<label class="o-field"><span>' + label + '</span><input class="o-in" data-fo="' + k + '" value="' + esc(v == null ? '' : v) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
  const check = (k, label, v) => '<label class="o-check"><input type="checkbox" data-fc="' + k + '"' + (v ? ' checked' : '') + '><span>' + label + '</span></label>';
  SEC.cadre = (it) => '<div class="frGrid">' + A.FRAMES.map((x) => '<button class="frb' + (it.frame === x[0] ? ' on' : '') + '" data-frame="' + x[0] + '" title="' + esc(x[1]) + '">' + frameThumb(x[0]) + '<span>' + esc(x[1]) + '</span></button>').join('') + '</div>' +
    ((it.frame === 'aucun' || it.frame === 'bord') ? '<h5>Forme</h5>' + chips('shape', A.SHAPES, it.shape || 'rect') : '') + check('shadow', 'Ombre portée', it.shadow !== false && !(it.frame === 'aucun' && !it.shadow));
  const ftCache = {};
  function frameThumb(fr) {
    if (ftCache[fr]) return ftCache[fr];
    const w = fr === 'ticket' ? 140 : fr === 'etiquette' ? 130 : 90, h = A.idealH(fr, w, { w: 4, h: 3 });
    const it = { id: 'ft' + fr, w, h, frame: fr, o: { cap: fr === 'polaroid' ? 'Été' : fr === 'carte-postale' ? 'Soleil' : fr === 'etiquette' ? 'Nice' : '', pm: fr === 'timbre', pmCity: 'Nice', pmDate: '' }, shadow: true };
    const vb = Math.max(w, h) * 1.25;
    return (ftCache[fr] = '<svg viewBox="' + (-vb / 2) + ' ' + (-vb / 2) + ' ' + vb + ' ' + vb + '"><defs><linearGradient id="ftg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FC5D9"/><stop offset=".6" stop-color="#F2D6A2"/><stop offset=".61" stop-color="#5B7F3A"/></linearGradient></defs>' + A.photo(it, '', { w: 4, h: 3 }, 'ft').replace(/fill="#cfc6b6"/g, 'fill="url(#ftg)"') + '</svg>');
  }
  SEC.opts = function (it) {
    const o = it.o || {};
    switch (it.frame) {
      case 'polaroid': return field('cap', 'Légende', o.cap, 'Ex. : Calanques, juillet') + '<h5>Couleur de l\'encre</h5>' + swatches('capColor', ['#2D2A6E', '#2E2620', '#9E3B2E', '#2F6F73'], o.capColor || '#2D2A6E');
      case 'timbre': return '<div class="o-form">' + field('sv', 'Valeur faciale', o.sv == null ? '2,50 €' : o.sv).replace('o-field', 'o-field half') + field('sc', 'Pays', o.sc == null ? 'FRANCE' : o.sc).replace('o-field', 'o-field half') + '</div>' + field('st', 'Petit texte', o.st, 'Ex. : Calanques') + '<h5>Encre du timbre</h5>' + swatches('ink', ['#9E3B2E', '#1D2A5C', '#2F6F73', '#5B7F3A', '#7A4E9C', '#2E2620'], o.ink || '#9E3B2E') + check('pm', 'Cachet de la poste', o.pm) + (o.pm ? '<div class="o-form">' + field('pmCity', 'Ville du cachet', o.pmCity == null ? 'MARSEILLE' : o.pmCity).replace('o-field', 'o-field half') + field('pmDate', 'Date', o.pmDate, '31.10.2026').replace('o-field', 'o-field half') + '</div>' : '');
      case 'washi': return '<h5>Motif</h5>' + chips('tape', A.WASHI, o.tape || 'rayures') + '<h5>Couleur</h5>' + swatches('tapeColor', ['#E6A1A0', '#9FC5D9', '#C5D9A0', '#F4C542', '#C9A06A', '#B7AEDB', '#2F6F73'], o.tapeColor || '#E6A1A0') + check('tape4', 'Ruban aux 4 coins', o.tape4);
      case 'ticket': return '<h5>Type</h5>' + chips('tk', A.TICKETS, o.tk || 'train') + '<div class="o-form">' + field('tFrom', o.tk === 'musee' ? 'Musée / lieu' : 'Départ', o.tFrom).replace('o-field', 'o-field half') + field('tTo', o.tk === 'musee' ? 'Admis' : 'Arrivée', o.tTo).replace('o-field', 'o-field half') + field('tDate', 'Date', o.tDate).replace('o-field', 'o-field half') + field('tSeat', o.tk === 'avion' ? 'Siège' : o.tk === 'musee' ? 'Tarif' : 'Place', o.tSeat).replace('o-field', 'o-field half') + '</div>';
      case 'etiquette': return field('cap', 'Destination', o.cap == null ? 'Marseille' : o.cap) + '<h5>Couleur</h5>' + swatches('tagColor', ['#C9A06A', '#E9D8B4', '#B5532F', '#2F6F73', '#9FC5D9'], o.tagColor || '#C9A06A');
      case 'carte-postale': return field('sub', 'Petite ligne', o.sub == null ? 'Bons baisers de' : o.sub) + field('cap', 'Grand texte', o.cap == null ? 'MARSEILLE' : o.cap) + '<h5>Couleur des lettres</h5>' + swatches('capColor', ['#F4C542', '#FFFFFF', '#E05A5A', '#9FC5D9', '#B5532F'], o.capColor || '#F4C542');
      case 'bord': return check('ds', 'Date imprimée (orange, comme les vieux appareils)', o.ds) + (o.ds ? field('dsText', 'Date', o.dsText || '31 10 ’26') : '');
      case 'coins': return '<h5>Couleur des coins</h5>' + swatches('cornerColor', ['#2B2621', '#C9A06A', '#FFFFFF', '#9E3B2E', '#2F6F73'], o.cornerColor || '#2B2621');
      case 'punaise': return '<h5>Couleur de la punaise</h5>' + swatches('pinColor', ['#C7362F', '#2B5BA8', '#F4C542', '#5B7F3A', '#7A4E9C', '#2E2620'], o.pinColor || '#C7362F');
      default: return '<p class="hint">Pas d\'option pour ce cadre.</p>';
    }
  };
  SEC.filtre = (it) => '<div class="flGrid">' + A.FILTERS.map((x) => '<button class="flb' + ((it.filter || 'aucun') === x[0] ? ' on' : '') + '" data-filter="' + x[0] + '"><span class="flPv" style="' + filterCss(x[0]) + '"></span><span>' + x[1] + '</span></button>').join('') + '</div>' + check('vignette', 'Vignette (bords assombris)', it.vignette);
  function filterCss(k) { const m = { aucun: '', sepia: 'filter:sepia(1)', vintage: 'filter:sepia(.4) saturate(.8) contrast(.9) brightness(1.05)', nb: 'filter:grayscale(1) contrast(1.08)', chaud: 'filter:sepia(.2) saturate(1.2)', froid: 'filter:hue-rotate(12deg) saturate(.9) brightness(1.03)', fondu: 'filter:contrast(.8) saturate(.75) brightness(1.08)' }; return m[k] || ''; }
  SEC.reglages = (it) => { const a = it.adj || {}; return slider('aLum', 'Luminosité', -60, 60, 1, a.lum || 0) + slider('aCon', 'Contraste', -60, 60, 1, a.con || 0) + slider('aSat', 'Saturation', -100, 80, 1, a.sat || 0) + slider('aGrain', 'Grain', 0, 60, 1, it.grain || 0) + '<h5>Cadrage</h5>' + slider('cZoom', 'Zoom', 1, 3, 0.05, (it.crop && it.crop.s) || 1, '×') + slider('cX', 'Horizontal', -1, 1, 0.02, (it.crop && it.crop.x) || 0) + slider('cY', 'Vertical', -1, 1, 0.02, (it.crop && it.crop.y) || 0) + '<button class="btn" data-pa="resetAdj">' + ic('rotate-ccw') + 'Réinitialiser</button>'; };
  SEC.legende = function (it) {
    const inf = M.info(it.media) || {}, ex = inf.exif || {};
    const d = ex.t ? new Date(ex.t) : null;
    let h = '';
    if (d) h += '<p>' + ic('calendar') + ' ' + esc(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '</p>';
    if (ex.lat != null) h += '<p>' + ic('map-pin') + ' ' + esc(ex.place || M.fmtCoord(ex.lat, ex.lon)) + '</p>';
    if (!d && ex.lat == null) h += '<p class="hint">Cette photo n\'a ni date ni position (EXIF).</p>';
    const sugg = [];
    if (d) { sugg.push(d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })); sugg.push(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })); }
    if (ex.place) { sugg.push(ex.place.split(',')[0]); if (d) sugg.push(ex.place.split(',')[0] + ', ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })); }
    if (sugg.length) h += '<h5>Légendes proposées</h5><div class="chips">' + sugg.map((s) => '<button class="chip" data-cap="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div><p class="hint">Touche une légende : ' + (['polaroid', 'etiquette', 'carte-postale'].includes(it.frame) ? 'elle s\'écrit dans le cadre.' : 'elle s\'ajoute sous la photo, en manuscrit.') + '</p>';
    if (ex.lat != null && !ex.place) h += CV.settings.geo ? '<button class="btn" data-pa="geo">' + ic('map-pin') + 'Trouver le nom du lieu</button>' : '<p class="hint">Le nom du lieu en clair demande Internet (service BigDataCloud, gratuit et sans clé) : à activer dans Réglages › « Lieu en clair ».</p><button class="btn" data-pa="geoOn">' + ic('map-pin') + 'Activer et trouver le lieu</button>';
    return h;
  };
  SEC.texte = (it) => '<textarea class="o-in" id="tTxt" rows="3">' + esc(it.text) + '</textarea>' + slider('tSize', 'Taille', 12, 220, 1, Math.round(it.size || 40)) + '<h5>Alignement</h5>' + chips('align', [['left', 'Gauche'], ['center', 'Centré'], ['right', 'Droite']], it.align || 'left') + check('bold', 'Gras', it.bold) + '<h5>Couleur</h5>' + swatches('color', U.INK, it.color || '#2E2620', true);
  SEC.police = (it) => '<div class="fontList">' + A.FONTS.map((x) => '<button class="fontb' + (it.font === x[0] ? ' on' : '') + '" data-font="' + x[0] + '" style="font-family:\'' + esc(x[2]) + '\';font-weight:' + x[3] + '">' + esc(x[1].split(' (')[0]) + ' <small>' + esc((x[1].split(' (')[1] || '').replace(')', '')) + '</small></button>').join('') + '</div>';
  SEC.tstyle = (it) => chips('tst', R.TEXT_STYLES, it.style || 'aucun') + (['etiquette', 'banniere', 'ruban', 'papier'].includes(it.style) ? '<h5>Couleur du fond</h5>' + swatches('bg', U.PAPERS, it.bg || '', true) : '') + (it.style === 'ruban' ? '<h5>Motif</h5>' + chips('ttape', A.WASHI, it.tape || 'uni') : '');
  SEC.couleur = (it) => (it.type === 'sticker' ? '<button class="chip' + (!it.color ? ' on' : '') + '" data-scol="">Couleurs d\'origine</button>' : '') + swatches('scol', U.INK, it.color || '', true) + (it.type === 'icon' ? slider('iStroke', 'Épaisseur du trait', 0.8, 3.5, 0.1, it.stroke || 1.8) + check('fillIc', 'Remplir', !!it.fill) : '');
  SEC.carte = (it) => '<p>' + (it.points || []).length + ' étape(s) · ' + esc((R.REGIONS.find((r) => r[0] === it.region) || [0, ''])[1]) + '</p><button class="btn pri" data-pa="map">' + ic('map') + 'Modifier la carte…</button>';
  SEC.dispo = (it, its) => {
    const one = its.length === 1;
    return (one ? slider('pRot', 'Rotation', -180, 180, 1, Math.round(it.rot || 0), '°') + '<div class="row"><button class="btn" data-pa="tilt">' + ic('dices') + 'De travers</button><button class="btn" data-pa="straight">' + ic('square') + 'Droit</button></div>' : '') +
      '<h5>Ordre</h5><div class="row"><button class="btn" data-pa="front" title="Premier plan">' + ic('bring-to-front') + 'Devant</button><button class="btn" data-pa="up" title="Avancer">' + ic('arrow-up') + '</button><button class="btn" data-pa="down" title="Reculer">' + ic('arrow-down') + '</button><button class="btn" data-pa="back" title="Arrière-plan">' + ic('send-to-back') + 'Derrière</button></div>' +
      '<h5>Aligner' + (one ? ' sur la page' : '') + '</h5><div class="row al">' + [['left', 'align-start-vertical', 'À gauche'], ['hcenter', 'align-center-vertical', 'Au centre'], ['right', 'align-end-vertical', 'À droite'], ['top', 'align-start-horizontal', 'En haut'], ['vcenter', 'align-center-horizontal', 'Au milieu'], ['bottom', 'align-end-horizontal', 'En bas']].map((a) => '<button class="ibtn" data-al="' + a[0] + '" title="' + a[2] + '" aria-label="' + a[2] + '">' + ic(a[1]) + '</button>').join('') + '</div>' +
      (its.length > 1 ? '<div class="row"><button class="btn" data-pa="group">' + ic('group') + 'Grouper</button>' + (its.some((x) => x.group) ? '<button class="btn" data-pa="ungroup">' + ic('ungroup') + 'Dégrouper</button>' : '') + '</div>' : (it.group ? '<div class="row"><button class="btn" data-pa="ungroup">' + ic('ungroup') + 'Dégrouper</button></div>' : '')) +
      '<div class="row"><button class="btn" data-pa="dup">' + ic('copy') + 'Dupliquer</button><button class="btn bad" data-pa="del">' + ic('trash') + 'Supprimer</button></div>';
  };
  U.pageProps = function () {
    const p = E.page(E.pi); if (!p) return '';
    if (p.cover) return '<div class="pHead"><b>Couverture</b></div><div class="pBody"><p class="hint">' + TOUCHE() + ' « Couverture » pour changer le titre, les dates, la matière, la couleur et la photo.</p><button class="btn pri" data-pa="cover">' + ic('book') + 'Modifier la couverture…</button></div>';
    return '<div class="pHead"><b>Page ' + (E.pi + 1) + '</b></div><div class="pBody"><h4>Fond</h4><div class="bgPick small">' + A.BG.map((b) => '<button class="bgb' + (p.bg === b[0] ? ' on' : '') + '" data-bg="' + b[0] + '"><svg viewBox="0 0 1000 1414">' + A.bg(b[0], 'pp' + b[0], 'x') + '</svg><span>' + b[1] + '</span></button>').join('') + '</div><p class="hint">' + (window.MAGPC ? 'Clique sur un élément pour le modifier (Maj+clic : plusieurs). Double-clic sur un texte pour le réécrire. Dépose des photos sur la page pour les ajouter.' : 'Touche un élément pour le modifier. Touche deux fois un texte pour le réécrire.') + '</p></div>';
  };
  // événements du panneau (délégués)
  U.propsClick = function (e) {
    const t = e.target.closest('button'); if (!t) return;
    const its = E.selItems(), it = its[0], d = t.dataset;
    if (d.bg && !it) { U.setBg(d.bg); $$('#props .bgb').forEach((b) => b.classList.toggle('on', b === t)); return; }
    if (d.sec) { U.sheetTab = d.sec; document.body.classList.add('sheetOpen'); U.props(); return; }
    if (d.pa) {
      const a = d.pa;
      if (a === 'del') E.remove(); else if (a === 'dup') E.duplicate(); else if (a === 'desel') E.select([]);
      else if (a === 'sheet') { document.body.classList.toggle('sheetOpen'); U.props(); }
      else if (['front', 'back', 'up', 'down'].includes(a)) E.order(a);
      else if (a === 'group') E.group(true); else if (a === 'ungroup') E.group(false);
      else if (a === 'tilt') { E.change(it, { rot: Math.round(((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 5)) * 10) / 10 }, 'De travers', true); U.props(); }
      else if (a === 'straight') { E.change(it, { rot: 0 }, 'Droit', true); U.props(); }
      else if (a === 'resetAdj') { E.change(it, { adj: {}, grain: 0, crop: {} }, 'Réglages', true); U.props(); }
      else if (a === 'map') U.mapDialog(it);
      else if (a === 'cover') U.coverDialog();
      else if (a === 'geo' || a === 'geoOn') { if (a === 'geoOn') { CV.settings.geo = true; CV.saveSettings(); } M.getMedia(it.media).then((m) => U.geocode([m])).then((n) => { if (n) O.toast('Lieu trouvé'); }); }
      return;
    }
    if (d.al) { E.align(d.al); return; }
    if (!it) return;
    if (d.frame) {
      const patch = { frame: d.frame }; const o = Object.assign({}, it.o || {});
      const inf = M.info(it.media) || {};
      if (d.frame === 'carte-postale' && !o.cap) o.cap = (inf.exif && inf.exif.place || E.c.title || 'Souvenir').split(',')[0];
      if (d.frame === 'polaroid' && !o.cap && inf.exif && inf.exif.place) o.cap = inf.exif.place.split(',')[0];
      patch.o = o;
      const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      patch.w = d.frame === 'ticket' || d.frame === 'etiquette' ? Math.max(it.w, 560) : it.w;
      patch.h = A.idealH(d.frame, patch.w, inf, it.shape);
      patch.x = cx - patch.w / 2; patch.y = cy - patch.h / 2;
      E.change(it, patch, 'Cadre', true); U.props(); return;
    }
    if (d.shape) { const inf = M.info(it.media) || {}; const cx = it.x + it.w / 2, cy = it.y + it.h / 2, h = A.idealH(it.frame, it.w, inf, d.shape); E.change(it, { shape: d.shape, h, y: cy - h / 2, x: cx - it.w / 2 }, 'Forme', true); U.props(); return; }
    if (d.filter) { E.change(it, { filter: d.filter }, 'Filtre', true); U.props(); return; }
    if (d.cap != null && it.type === 'photo') {
      if (['polaroid', 'etiquette', 'carte-postale'].includes(it.frame)) { E.change(it, { o: Object.assign({}, it.o, { cap: d.cap }) }, 'Légende', true); }
      else { const b = E.aabb(it); const t = { id: M.uid('i'), type: 'text', text: d.cap, font: 'manuscrit', size: 44, color: '#2E2620', align: 'center', style: 'aucun', rot: 0, w: Math.max(260, it.w) }; t.h = R.textLayout(t).h; t.x = (b[0] + b[2]) / 2 - t.w / 2; t.y = Math.min(H - t.h - 10, b[3] + 6); E.addItem(t); }
      U.props(); return;
    }
    if (d.tape) { E.change(it, { o: Object.assign({}, it.o, { tape: d.tape }) }, 'Motif', true); U.props(); return; }
    if (d.tk) { E.change(it, { o: Object.assign({}, it.o, { tk: d.tk }) }, 'Billet', true); U.props(); return; }
    for (const k of ['capColor', 'ink', 'tapeColor', 'tagColor', 'cornerColor', 'pinColor']) if (d[k]) { E.change(it, { o: Object.assign({}, it.o, { [k]: d[k] }) }, 'Couleur', true); U.props(); return; }
    if (d.align) { E.change(it, { align: d.align }, 'Alignement', true); U.props(); return; }
    if (d.color) { E.change(it, { color: d.color, colorSet: true }, 'Couleur', true); U.props(); return; }
    if (d.font) { E.change(it, { font: d.font }, 'Police', true); U.props(); return; }
    if (d.tst) { const st = d.tst; const patch = { style: st }; if (st === 'banniere' && it.align !== 'center') patch.align = 'center'; E.change(it, patch, 'Style', true); U.props(); return; }
    if (d.bg != null && it.type === 'text') { E.change(it, { bg: d.bg }, 'Fond', true); U.props(); return; }
    if (d.ttape) { E.change(it, { tape: d.ttape }, 'Motif', true); U.props(); return; }
    if (d.scol != null) { E.change(it, { color: d.scol }, 'Couleur', true); U.props(); }
  };
  U.propsInput = function (e) {
    const t = e.target, it = E.selItems()[0]; if (!it) return;
    const v = t.type === 'range' ? parseFloat(t.value) : t.value;
    const out = $('#' + t.id + 'V'); if (out) out.textContent = (t.id === 'pRot' ? Math.round(v) + '°' : t.id === 'cZoom' ? v + '×' : v);
    if (t.id === 'pRot') E.change(it, { rot: v }, 'Rotation');
    else if (t.id === 'aLum' || t.id === 'aCon' || t.id === 'aSat') E.change(it, { adj: Object.assign({}, it.adj, { [{ aLum: 'lum', aCon: 'con', aSat: 'sat' }[t.id]]: v }) }, 'Réglages');
    else if (t.id === 'aGrain') E.change(it, { grain: v }, 'Grain');
    else if (t.id === 'cZoom' || t.id === 'cX' || t.id === 'cY') E.change(it, { crop: Object.assign({}, it.crop, { [{ cZoom: 's', cX: 'x', cY: 'y' }[t.id]]: v }) }, 'Cadrage');
    else if (t.id === 'tTxt') E.change(it, { text: v || ' ' }, 'Texte');
    else if (t.id === 'tSize') E.change(it, { size: v }, 'Taille');
    else if (t.id === 'iStroke') E.change(it, { stroke: v }, 'Trait');
    else if (t.dataset.fo) E.change(it, { o: Object.assign({}, it.o, { [t.dataset.fo]: t.value }) }, 'Cadre');
    else if (t.dataset.colorin) E.change(it, { color: t.value, colorSet: true }, 'Couleur');
    else if (t.dataset.scolin) E.change(it, { color: t.value }, 'Couleur');
    else if (t.dataset.bgin) E.change(it, { bg: t.value }, 'Fond');
  };
  U.propsChange = function (e) {
    const t = e.target, it = E.selItems()[0]; if (!it) return;
    if (t.dataset.fc) {
      const k = t.dataset.fc;
      if (k === 'shadow') E.change(it, { shadow: t.checked }, 'Ombre', true);
      else if (k === 'vignette') E.change(it, { vignette: t.checked }, 'Vignette', true);
      else if (k === 'bold') E.change(it, { bold: t.checked }, 'Gras', true);
      else if (k === 'fillIc') E.change(it, { fill: t.checked ? (it.color || '#2E2620') : '' }, 'Remplir', true);
      else E.change(it, { o: Object.assign({}, it.o, { [k]: t.checked }) }, 'Cadre', true);
      U.props();
    }
  };

  /* ---------------- Fichiers reçus (.magcarnet, images) ---------------- */
  U.importCarnet = async function () {
    const l = await O.Files.open({ types: [{ description: 'Carnet de voyage', accept: { 'application/x-magcarnet': ['.magcarnet'] } }], multiple: false, write: false });
    if (l[0]) await U.receive(l);
  };
  U.receive = async function (list) {
    const cars = list.filter((x) => /\.magcarnet$/i.test(x.name || '')), imgs = list.filter((x) => /^image\//.test((x.blob && x.blob.type) || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(x.name || ''));
    for (const x of cars) {
      try { const pr = U.progress('Ouverture du carnet…', 1); pr(0); const c = await M.importFile(x.blob); pr(-1); O.toast('Carnet « ' + c.title + ' » importé'); await U.open(c.id, -1); }
      catch (e) { U.progress('', 1)(-1); O.alert('Fichier illisible', '<p>' + esc(x.name) + ' : ' + esc(e.message) + '</p>'); }
    }
    if (imgs.length) {
      if (!E.c) { const last = localStorage.getItem('voyage.last'); const c = last && await M.getCarnet(last); if (c) await U.open(c.id); else { const n = M.newCarnet({ title: 'Nouveau voyage' }); await M.putCarnet(n); await U.open(n.id, 0); } }
      if (E.pi < 0) E.go(0, true);
      U.addPhotos(imgs.map((x) => ({ blob: x.blob, name: x.name })));
    }
  };

  /* ---------------- Tuile Socle (Android) ---------------- */
  U.socle = async function (list) {
    const Mp = window.MAGPrint; if (!Mp || !Mp.widgetPut || window.MAGPC) return;
    try {
      list = list || await M.carnets();
      const c = list[0]; let thumb = '';
      if (c) {
        if (c.cover && c.cover.photo) await M.ensureUrls([c.cover.photo]);
        const svg = R.pageSvg(c, { id: 'cover', items: c.coverItems || [] }, { pfx: 'so-', href: (id) => '', media: M.info, cover: true });
        let s = svg;
        if (c.cover && c.cover.photo) { const du = await M.dataUrl(c.cover.photo, 'mid'); s = R.pageSvg(c, { id: 'cover', items: c.coverItems || [] }, { pfx: 'so-', href: () => du, media: M.info, cover: true }); }
        s = s.replace('<svg ', '<svg ').replace(/(<svg[^>]*>)/, '$1<style>' + await R.fontsCss(s) + '</style>');
        const cv = await R.raster(s, 180); thumb = cv.toDataURL('image/jpeg', 0.72); if (thumb.length > 60000) thumb = cv.toDataURL('image/jpeg', 0.5);
      }
      Mp.widgetPut(JSON.stringify({ last: c ? { id: c.id, title: c.title, info: M.stats(c), thumb, at: c.updated } : null, count: list.length }));
    } catch (e) { console.warn('socle', e); }
  };
  window.onSocle = function (json) {
    let a = {}; try { a = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { }
    if (a.open) U.open(a.open); else if (a['new']) U.newCarnet(); else if (a.last) { const l = localStorage.getItem('voyage.last'); if (l) U.open(l); }
  };

  /* ---------------- Démarrage ---------------- */
  U.boot = async function () {
    applyMotion();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener && matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', applyMotion);
    CV.applyMotion = applyMotion;
    O.Files.configure({ app: 'voyage', name: 'Carnet', types: [{ description: 'Carnet de voyage', accept: { 'application/x-magcarnet': ['.magcarnet'] } }], ext: '.magcarnet', mime: 'application/x-magcarnet' });
    document.documentElement.classList.toggle('pc', !!window.MAGPC);
    // polices : chargées avant toute mesure de texte
    try { await Promise.all(A.FONTS.map((x) => document.fonts.load(x[3] + ' 40px "' + x[2] + '"'))).then(() => Promise.all(['Caveat', 'Kalam', 'Amatic SC', 'Caladea'].map((n) => document.fonts.load('700 40px "' + n + '"')))); } catch (e) { }
    $('#home').addEventListener('click', U.homeClick);
    $('#edTop').addEventListener('click', U.topClick);
    $('#tools').addEventListener('click', U.toolClick);
    $('#drawBar').addEventListener('click', U.drawClick);
    $('#drawBar').addEventListener('input', (e) => { if (e.target.id === 'penW') E.pen.width = parseFloat(e.target.value); });
    $('#pageNav').addEventListener('click', U.navClick);
    $('#pagesBar').addEventListener('click', U.pagesBarClick);
    const pr = $('#props'); pr.addEventListener('click', U.propsClick); pr.addEventListener('input', U.propsInput); pr.addEventListener('change', U.propsChange);
    const st = $('#stage');
    st.addEventListener('pointerdown', E.pointerDown);
    st.addEventListener('dragover', (e) => { e.preventDefault(); st.classList.add('dropping'); });
    st.addEventListener('dragleave', () => st.classList.remove('dropping'));
    st.addEventListener('drop', (e) => { e.preventDefault(); st.classList.remove('dropping'); const l = Array.from(e.dataTransfer.files || []).map((f) => ({ name: f.name, blob: f })); if (l.length) U.receive(l); });
    st.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); E.zoom = Math.max(0.5, Math.min(3, (E.zoom || 1) * (e.deltaY < 0 ? 1.1 : 0.9))); E.layout(); }, { passive: false });
    addEventListener('resize', O.raf(() => { if (E.c) { E.layout(); U.pagesBar(); U.props(); } }));
    // la scène change de taille (feuille des propriétés, barre de dessin…) : pages recentrées, sélection replacée
    if (window.ResizeObserver) new ResizeObserver(O.raf(() => { if (E.c) E.layout(); })).observe(st);
    document.addEventListener('visibilitychange', () => { if (document.hidden && E.c) E.saveNow(); });
    addEventListener('pagehide', () => { if (E.c) E.saveNow(); });
    CV.keys();
    O.Files.onLaunch((l) => U.receive(l));
    await U.home();
    try { history.replaceState({ cv: 0 }, ''); } catch (e) { }
    setTimeout(() => { try { const Mp = window.MAGPrint; if (Mp && Mp.takeSocle && !window.MAGPC) { const x = Mp.takeSocle(); if (x) window.onSocle(x); } } catch (e) { } }, 300);
    document.documentElement.classList.add('ready');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => U.boot()); else U.boot();
})();
