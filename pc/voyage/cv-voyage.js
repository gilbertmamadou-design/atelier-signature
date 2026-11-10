/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-voyage/cv-voyage.js : ne pas modifier ici. */
/* =====================================================================
   Carnet de voyage — photos du voyage prises avec l'appli Photo en « mode voyage ».
   Téléphone : à l'ouverture d'un carnet (et « Actualiser les photos du voyage »), les nouvelles photos de
   DCIM/Photo/Voyage/<titre> sont lues par le fournisseur protégé de Photo (MAGVoyage.photos / photoLire : index du
   voyage, mêmes données que voyage.json, photo d'origine avec sa position GPS). Bandeau « N nouvelles photos du voyage » :
   Ajouter (tout) ou Choisir… (grille). Une page par jour (plusieurs s'il y en a beaucoup : « Photos par page », réglage du
   carnet, Automatique = 6 au plus, ou 1 à 9 avec « Équilibrer » ; jamais deux jours sur une page), mise en page par Composer
   (M.compose), titre = date en français + lieu principal du jour, légendes en manuscrit, cadres selon le style choisi une
   fois (Classique, Timbres, Polaroid, Mélange). Étapes ajoutées à la carte de l'itinéraire, sans doublon de ville.
   Mémoire par carnet (c.voyage.imp, clé « dossier/fichier ») : une photo n'est jamais ajoutée deux fois, et une photo
   supprimée du carnet n'est pas réimportée. La mémoire part avec le carnet dans le .magcarnet.
   PC : pas de mode voyage (pas d'appareil photo) ; « Importer un dossier de voyage » lit le dossier copié depuis le
   téléphone (photos + voyage.json ; sans voyage.json : date et GPS de l'EXIF), aussi par « Ouvrir avec » et dépôt.
   Carnets demandés par Photo ou Majordome (« commence le carnet Italie ») : créés ici à l'ouverture (MAGVoyage.attente),
   liste publiée pour eux (MAGVoyage.publier : id, titre, dates, couverture).
   ===================================================================== */
(function () {
  'use strict';
  const CV = window.CV = window.CV || {};
  const O = window.Office, A = CV.Art, R = CV.R, M = CV.M, E = CV.E, U = CV.U, W = A.W, H = A.H;
  const VX = CV.V = {};
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = A.esc, ic = (n) => O.icon(n);
  /** Pont de l'appli Android (fournisseur de Photo) ; rien sur PC */
  const B = () => (!window.MAGPC && window.MAGVoyage && window.MAGVoyage.photos) ? window.MAGVoyage : null;
  const PCV = () => !!window.MAGPC;

  VX.STYLES = [
    ['classique', 'Classique', 'Bords blancs argentiques, sobre et net'],
    ['timbres', 'Timbres', 'Timbres dentelés et cachets de la poste'],
    ['polaroid', 'Polaroid', 'Légendes écrites dans le cadre'],
    ['melange', 'Mélange', 'Polaroid, timbres, washi, coins photo…']
  ];
  // agencement de Composer préféré, selon le style et le nombre de photos de la page
  const PREF = VX.PREF = {
    classique: { 1: 'Pleine page', 2: 'Duo empilé', 3: 'Classique', 4: 'Grille', 5: 'Mosaïque', 6: 'Planche contact', 7: 'Mosaïque', 8: 'Grille', 9: 'Grille' },
    timbres: { 1: 'Pleine page', 2: 'Duo empilé', 3: 'Timbres', 4: 'Album', 5: 'Collection de timbres', 6: 'Planche contact', 7: 'Collection de timbres', 8: 'Collection de timbres', 9: 'Collection de timbres' },
    polaroid: { 1: 'Vedette', 2: 'Duo empilé', 3: 'Classique', 4: 'Album', 5: 'Mosaïque', 6: 'Planche contact', 7: 'De travers', 8: 'De travers', 9: 'De travers' },   // légendes lisibles
    melange: { 1: 'Vedette', 2: 'Duo', 3: 'Bandeau', 4: 'Bric-à-brac', 5: 'Washi', 6: 'Souvenirs', 7: 'Souvenirs', 8: 'Souvenirs', 9: 'Souvenirs' }
  };
  const FRAME = { classique: () => 'bord', timbres: () => 'timbre', polaroid: () => 'polaroid', melange: (f) => f === 'aucun' ? 'bord' : f };
  const TITLE = {
    classique: { font: 'serif', size: 54, style: 'aucun', color: '#3A2E24' },
    timbres: { font: 'machine', size: 40, style: 'etiquette', color: '#2E2620' },
    polaroid: { font: 'manuscrit', size: 72, style: 'aucun', color: '#1D2A5C' },
    melange: { font: 'titre', size: 74, style: 'banniere', color: '#FFFFFF' }
  };
  const AREA = { x: 0, y: 0.125, w: 1, h: 0.865 };   // sous le titre de la page

  /* ---------------- Outils ---------------- */
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const exifDate = (t) => { const d = new Date(t); return d.getFullYear() + ':' + pad(d.getMonth() + 1) + ':' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  /** Clé d'une photo du voyage : « dossier/fichier » (dernier dossier du chemin), la même au téléphone et sur PC */
  VX.cle = function (e) {
    const parts = String(e.chemin || '').split('/').filter(Boolean);
    const dir = parts.length >= 2 ? parts[parts.length - 2] : (e.dossierNom || String(e.dossier || '').split('/').pop() || e.titre || '');
    return (norm(dir) + '/' + String(e.nom || e.fichier || parts[parts.length - 1] || '').toLowerCase()).replace(/\s+/g, '_');
  };
  VX.memo = (c) => { if (!c.voyage || typeof c.voyage !== 'object') c.voyage = {}; if (!c.voyage.imp) c.voyage.imp = {}; return c.voyage; };
  VX.dayTitle = function (day, place, part) {
    const d = new Date(day + 'T12:00'), s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^(\D+) 1 /, '$1 1er ');
    return s.charAt(0).toUpperCase() + s.slice(1) + (part > 1 ? ' (suite)' : '') + (place && part <= 1 ? ' · ' + place : '');
  };
  /** Lieu principal d'un jour : la ville la plus fréquente */
  VX.mainPlace = function (list) {
    const n = {}; let best = '', bn = 0;
    list.forEach((e) => { const v = (e.ville || '').trim(); if (!v) return; n[v] = (n[v] || 0) + 1; if (n[v] > bn) { bn = n[v]; best = v; } });
    return best;
  };
  /** Répartit une liste en pages selon « Photos par page » (pp : {k, eq} ; sans pp : automatique, 6 au plus, 7 → 4 + 3) */
  VX.chunks = function (list, pp) {
    const sizes = M.split(list.length, pp ? pp.k : 'auto', pp ? pp.eq : true), out = []; let k = 0;
    sizes.forEach((n) => { out.push(list.slice(k, k + n)); k += n; });
    return out.length ? out : [list.slice()];
  };

  /* ---------------- Photos par page : réglage du carnet ---------------- */
  VX.PP = ['auto', 1, 2, 3, 4, 5, 6, 8, 9];
  /** Réglage du carnet : {k: 'auto' | 1…9, eq: équilibrer} */
  VX.pp = function (c) { const p = (c && c.parPage) || {}; const k = VX.PP.includes(+p.k) ? +p.k : 'auto'; return { k, eq: p.eq !== false }; };
  VX.setPp = function (c, st) {
    if (!c) return;
    c.parPage = { k: st.k === 'auto' ? 'auto' : +st.k, eq: st.eq !== false };
    persist(c);
  };
  const persist = (c) => { if (E.c && E.c.id === c.id) E.save(); else { c.updated = Date.now(); M.putCarnet(c).catch(() => { }); } };
  VX.ppLabel = (st) => st.k === 'auto' ? 'Auto' : st.k + ' par page';
  const sizesTxt = (l) => l.length > 6 ? l.slice(0, 5).join(' + ') + ' + … (' + l.length + ' pages)' : l.join(' + ');
  /** Résumé de la répartition : photos d'un voyage (par jour) ou simple nombre de photos */
  VX.ppPlan = function (st, what) {
    if (Array.isArray(what) && what.length && what[0] && what[0].date != null) {
      const by = {}; what.forEach((e) => { const d = dayKey(e.date || Date.now()); by[d] = (by[d] || 0) + 1; });
      const days = Object.keys(by).sort(), per = days.map((d) => M.split(by[d], st.k, st.eq)), pages = per.reduce((s, l) => s + l.length, 0);
      return what.length + ' photo' + (what.length > 1 ? 's' : '') + (days.length > 1 ? ' sur ' + days.length + ' jours' : '') + ' → ' + pages + ' page' + (pages > 1 ? 's' : '') + ' (' + (days.length > 1 ? per.map((l) => l.join('+')).join(' · ') : sizesTxt(per[0])) + ')';
    }
    const n = Array.isArray(what) ? what.length : +what;
    if (!n) return st.k === 'auto' ? 'Automatique : de 1 à 6 photos par page, selon le nombre.' : 'Ex. : 10 photos → ' + sizesTxt(M.split(10, st.k, st.eq));
    const l = M.split(n, st.k, st.eq);
    return n + ' photo' + (n > 1 ? 's' : '') + ' → ' + l.length + ' page' + (l.length > 1 ? 's' : '') + ' (' + sizesTxt(l) + ')';
  };
  /** Choix « Photos par page » (Automatique, 1 à 6, 8, 9) et « Équilibrer » : HTML, puis VX.ppBind */
  VX.ppHtml = function (st, title) {
    return '<div class="ppCtl"><div class="ppHd"><b>' + esc(title || 'Photos par page') + '</b></div><div class="ppK" role="radiogroup" aria-label="Photos par page">' +
      VX.PP.map((k) => '<button type="button" class="chip' + (st.k === k ? ' on' : '') + '" role="radio" aria-checked="' + (st.k === k) + '" data-ppk="' + k + '"' + (k === 'auto' ? ' title="Automatique : comme avant, 6 au plus"' : ' aria-label="' + k + ' par page"') + '>' + (k === 'auto' ? 'Auto' : k) + '</button>').join('') + '</div>' +
      '<label class="o-check ppEq"><input type="checkbox" data-ppeq' + (st.eq ? ' checked' : '') + (st.k === 'auto' ? ' disabled' : '') + '><span>Équilibrer (pages de tailles voisines : 10 à 4 par page → 4 + 3 + 3)</span></label>' +
      '<p class="hint ppHint"></p></div>';
  };
  /** Branche le choix : st modifié sur place, hint recalculé (what : liste ou nombre), onChange(st) */
  VX.ppBind = function (root, st, what, onChange) {
    const ctl = root.querySelector('.ppCtl'); if (!ctl) return;
    const hint = () => { const h = ctl.querySelector('.ppHint'); if (h) h.textContent = VX.ppPlan(st, typeof what === 'function' ? what() : what); };
    hint();
    ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ppk]'); if (!b) return;
      st.k = b.dataset.ppk === 'auto' ? 'auto' : +b.dataset.ppk;
      ctl.querySelectorAll('[data-ppk]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      ctl.querySelector('[data-ppeq]').disabled = st.k === 'auto';
      hint(); if (onChange) onChange(st);
    });
    ctl.addEventListener('change', (e) => { if (e.target.matches('[data-ppeq]')) { st.eq = e.target.checked; hint(); if (onChange) onChange(st); } });
    ctl._hint = hint;
  };
  /* ---------------- Ordre des photos : réglage du carnet ---------------- */
  VX.ord = (c) => M.ordre(c);
  VX.setOrd = function (c, st) { if (!c) return; c.ordre = { mode: st.mode || 'date', fill: !!st.fill }; persist(c); };
  VX.ordLabel = (st) => (M.ORD.find((x) => x[0] === st.mode) || M.ORD[0])[1];
  /** Choix « Ordre des photos » (date, sélection, nom) et « Optimiser le remplissage » : HTML, puis VX.ordBind */
  VX.ordHtml = function (st) {
    return '<div class="ordCtl"><div class="ppHd"><b>Ordre des photos</b></div><div class="ordK" role="radiogroup" aria-label="Ordre des photos">' +
      M.ORD.map((o) => '<button type="button" class="chip' + (st.mode === o[0] ? ' on' : '') + '" role="radio" aria-checked="' + (st.mode === o[0]) + '" data-ordm="' + o[0] + '" title="' + esc(o[2]) + '">' + esc(o[1]) + '</button>').join('') + '</div>' +
      '<p class="hint ordHint">' + esc((M.ORD.find((x) => x[0] === st.mode) || M.ORD[0])[2]) + '. Les photos sont posées à la suite : de gauche à droite, puis de haut en bas, page après page.</p>' +
      '<label class="o-check ordFill"><input type="checkbox" data-ordfill' + (st.fill ? ' checked' : '') + '><span>Optimiser le remplissage (photos larges dans les cases larges : peut changer l’ordre)</span></label></div>';
  };
  VX.ordBind = function (root, st, onChange) {
    const ctl = root.querySelector('.ordCtl'); if (!ctl) return;
    ctl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ordm]'); if (!b) return;
      st.mode = b.dataset.ordm;
      ctl.querySelectorAll('[data-ordm]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      const h = ctl.querySelector('.ordHint'); if (h) h.firstChild.textContent = (M.ORD.find((x) => x[0] === st.mode) || M.ORD[0])[2] + '. Les photos sont posées à la suite : de gauche à droite, puis de haut en bas, page après page.';
      if (onChange) onChange(st);
    });
    ctl.addEventListener('change', (e) => { if (e.target.matches('[data-ordfill]')) { st.fill = e.target.checked; if (onChange) onChange(st); } });
  };
  /** Petite feuille « Photos par page » (bandeau, menu Photos, après un ajout) → réglage enregistré, ou null si annulé */
  VX.ppDialog = async function (c, what) {
    c = c || E.c; if (!c) return null;
    const st = VX.pp(c), od = VX.ord(c), body = O.h('div', { cls: 'ppDlg' });
    body.innerHTML = VX.ppHtml(st) + VX.ordHtml(od) + '<p class="hint">Réglages du carnet « ' + esc(c.title) + ' » : ils servent aux imports du voyage, aux ajouts de plusieurs photos et aux photos en trop de « Composer ». Aussi dans ⋮ › Réglages du carnet.</p>';
    VX.ppBind(body, st, what); VX.ordBind(body, od);
    const v = await O.dialog({ title: 'Photos par page', body, cls: 'cv-dlg', buttons: [{ label: 'Annuler', value: null }, { label: 'OK', value: 'ok', primary: true }] });
    if (v !== 'ok') return null;
    VX.setPp(c, st); VX.setOrd(c, od); VX.banner($('#voyBan') ? VX.pending.length : 0);
    return st;
  };
  /** Réglages du carnet : style des pages du voyage et photos par page (enregistrés aussitôt) */
  VX.carnetSettings = async function (c) {
    c = c || E.c; if (!c) return;
    const memo = VX.memo(c), st = VX.pp(c), od = VX.ord(c), body = O.h('div', { cls: 'voyStyles cvSet' });
    body.innerHTML = VX.ppHtml(st) + VX.ordHtml(od) +
      (E.c && E.c.id === c.id ? '<div class="row ordAct"><button type="button" class="btn" data-ordgo="page">' + ic('list-ordered') + 'Remettre cette page dans l’ordre</button><button type="button" class="btn" data-ordgo="all">' + ic('list-ordered') + 'Tout le carnet</button><button type="button" class="btn" data-ordgo="pages">' + ic('calendar-days') + 'Trier les pages par date</button></div>' : '') +
      '<h5>Style des pages du voyage</h5>' +
      VX.STYLES.map((s) => '<button type="button" class="vsb' + (s[0] === (memo.style || '') ? ' on' : '') + '" data-st="' + s[0] + '"><b>' + esc(s[1]) + '</b><small>' + esc(s[2]) + '</small></button>').join('') +
      '<p class="hint">Ces réglages valent pour les prochaines pages de ce carnet ; les pages déjà faites se réagencent avec « Composer ».</p>';
    VX.ppBind(body, st, 0, () => VX.setPp(c, st));
    VX.ordBind(body, od, () => VX.setOrd(c, od));
    body.addEventListener('click', (e) => { const g = e.target.closest('[data-ordgo]'); if (g) { if (g.dataset.ordgo === 'pages') U.sortPages(); else U.reorder(g.dataset.ordgo); } });
    body.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; memo.style = b.dataset.st; $$('.vsb', body).forEach((x) => x.classList.toggle('on', x === b)); persist(c); });
    await O.dialog({ title: 'Réglages du carnet', body, cls: 'cv-dlg', buttons: [{ label: 'Fermer', value: null, primary: true }] });
    VX.banner($('#voyBan') ? VX.pending.length : 0);
  };

  /* ---------------- Événements du pont (photos, vignettes, ville) ---------------- */
  const WAIT = {}; let seq = 0;
  const prevEvent = window.voyageEvent;
  window.voyageEvent = function (type, json) {
    if (type === 'photo' || type === 'vignette' || type === 'ville') {
      let o = {}; try { o = JSON.parse(json || '{}'); } catch (e) { }
      const k = o.req + (type === 'vignette' ? ':' + o.id : ''), w = WAIT[k]; if (w) { delete WAIT[k]; w(o); }
      return;
    }
    if (prevEvent) prevEvent(type, json);
  };
  function call(fn, key, timeout) { return new Promise((res) => { WAIT[key] = res; try { fn(); } catch (e) { delete WAIT[key]; res({}); } setTimeout(() => { if (WAIT[key]) { delete WAIT[key]; res({ ok: false, err: 'délai dépassé' }); } }, timeout || 60000); }); }
  function readPhoto(id) { const r = 'p' + (++seq); return call(() => B().photoLire(r, id, M.MAX), r, 90000); }
  function thumbOf(id) { const r = 't' + (++seq); return call(() => B().vignettes(r, id), r + ':' + id, 20000).then((o) => o.data || ''); }
  /** Ville d'une position : géocodeur d'Android (téléphone) ou service en ligne si « Lieu en clair » est activé (PC) */
  VX.villeDe = async function (lat, lon) {
    const key = 'ville:' + lat.toFixed(2) + ',' + lon.toFixed(2);
    const c = await M.kvGet(key).catch(() => null); if (c != null) return c;
    let v = '';
    if (B() && B().ville) { const r = 'v' + (++seq); const o = await call(() => B().ville(r, lat, lon), r, 15000); v = o.ville || ''; }
    else if (CV.settings.geo) { try { v = (await M.place(lat, lon)).split(',')[0]; } catch (e) { } }
    if (v) await M.kvPut(key, v).catch(() => { });
    return v;
  };

  /* ---------------- Téléphone : détection des nouvelles photos du voyage ---------------- */
  /** Photos du voyage de ce carnet pas encore importées (ni écartées) */
  VX.fresh = function (c) {
    const b = B(); if (!b || !c) return [];
    let l = []; try { l = JSON.parse(b.photos(c.id, c.title) || 'null') || []; } catch (e) { l = []; }
    const memo = VX.memo(c);
    return l.filter((e) => !(VX.cle(e) in memo.imp)).sort((a, b2) => (a.date || 0) - (b2.date || 0));
  };
  VX.pending = [];
  /** Ouverture d'un carnet, retour dans l'appli, « Actualiser » : bandeau s'il y a des nouvelles photos */
  VX.check = function (quiet) {
    const c = E.c; if (!c || !B()) { VX.banner(0); return 0; }
    VX.pending = VX.fresh(c);
    VX.banner(VX.pending.length);
    if (!quiet && !VX.pending.length) O.toast('Aucune nouvelle photo du voyage');
    return VX.pending.length;
  };
  VX.banner = function (n) {
    let b = $('#voyBan');
    if (!n) { if (b) b.remove(); return; }
    if (!b) {
      b = O.h('div', { id: 'voyBan', cls: 'voyBan', role: 'status' });
      $('#ed').insertBefore(b, $('#edMain'));
      b.addEventListener('click', (e) => {
        const a = e.target.closest('[data-vb]'); if (!a) return;
        if (a.dataset.vb === 'add') VX.add(VX.pending.slice());
        else if (a.dataset.vb === 'pick') VX.choose(VX.pending.slice());
        else if (a.dataset.vb === 'pp') VX.ppDialog(E.c, VX.pending.slice());
        else VX.banner(0);
      });
    }
    b.innerHTML = '<span class="vbIc">' + ic('plane') + '</span><b>' + n + ' nouvelle' + (n > 1 ? 's' : '') + ' photo' + (n > 1 ? 's' : '') + ' du voyage</b>' +
      '<button class="btn pri" data-vb="add">' + ic('image-plus') + 'Ajouter</button><button class="btn" data-vb="pick">Choisir…</button>' +
      '<button class="btn ppB" data-vb="pp" title="Photos par page" aria-label="Photos par page : ' + esc(VX.ppLabel(VX.pp(E.c))) + '">' + ic('layout-grid') + esc(VX.pp(E.c).k === 'auto' ? 'Auto' : VX.pp(E.c).k + '/page') + '</button><button class="ibtn" data-vb="x" aria-label="Plus tard">' + ic('x') + '</button>';
  };

  /** Grille de sélection : les photos non cochées peuvent être écartées pour de bon */
  VX.choose = async function (list) {
    if (!list.length) return;
    const body = O.h('div', { cls: 'tray voyPick' });
    const chosen = new Set(list.map((e, i) => i)), st = VX.pp(E.c), od = VX.ord(E.c);
    const byDay = {}; list.forEach((e, i) => { (byDay[dayKey(e.date)] = byDay[dayKey(e.date)] || []).push(i); });
    body.innerHTML = '<p class="hint"><b id="vpN">' + list.length + '</b> photo(s) cochée(s) sur ' + list.length + '.</p>' +
      Object.keys(byDay).sort().map((d) => '<h5 class="vpDay">' + esc(VX.dayTitle(d, VX.mainPlace(byDay[d].map((i) => list[i])))) + '</h5><div class="trayGrid">' +
        byDay[d].map((i) => { const e = list[i]; return '<button type="button" class="tph sel on" data-vi="' + i + '"><img alt="" data-vt="' + i + '"' + (e.url ? ' src="' + esc(e.url) + '"' : '') + '><i>' + ic('check') + '</i>' + (e.legende ? '<span>' + esc(e.legende) + '</span>' : '') + '</button>'; }).join('') + '</div>').join('') +
      '<label class="o-check"><input type="checkbox" id="vpForget" checked><span>Ne plus proposer les photos non cochées</span></label>' + VX.ppHtml(st) + VX.ordHtml(od);
    const fill = async () => { if (!B()) return; for (let i = 0; i < list.length; i++) { const im = body.querySelector('[data-vt="' + i + '"]'); if (!im || im.src) continue; const d = await thumbOf(list[i].id); if (d) im.src = d; } };
    const v = await O.dialog({
      title: 'Photos du voyage', body, wide: true, cls: 'cv-dlg',
      onOpen: () => {
        fill();
        VX.ppBind(body, st, () => list.filter((e, i) => chosen.has(i))); VX.ordBind(body, od);
        body.addEventListener('click', (e) => { const b = e.target.closest('[data-vi]'); if (!b) return; const i = +b.dataset.vi; if (chosen.has(i)) chosen.delete(i); else chosen.add(i); b.classList.toggle('on', chosen.has(i)); $('#vpN', body).textContent = chosen.size; const c = $('.ppCtl', body); if (c && c._hint) c._hint(); });
      },
      buttons: [{ label: 'Annuler', value: null }, { label: 'Ajouter au carnet', value: 'ok', primary: true }]
    });
    if (v !== 'ok') return;
    VX.setPp(E.c, st); VX.setOrd(E.c, od);
    const forget = $('#vpForget', body).checked;
    const pick = list.filter((e, i) => chosen.has(i)), drop = list.filter((e, i) => !chosen.has(i));
    if (forget && drop.length) { const memo = VX.memo(E.c); drop.forEach((e) => { memo.imp[VX.cle(e)] = ''; }); E.save(); }
    if (pick.length) await VX.add(pick);
    else { VX.check(true); E.saveNow(); }
  };

  /** Style des pages, choisi une fois par carnet (avec « Photos par page ») ; opt : {list (photos à importer), title, ok} :
      feuille d'import montrée même si le style est déjà choisi (« Importer un dossier de voyage ») */
  VX.askStyle = async function (c, force, opt) {
    opt = opt || {};
    const memo = VX.memo(c);
    if (memo.style && !force) return memo.style;
    let st = memo.style || 'melange';
    const pp = VX.pp(c), od = VX.ord(c), body = O.h('div', { cls: 'voyStyles' });
    body.innerHTML = '<p class="hint">Une page par journée (jamais deux jours sur une page), titre avec la date et le lieu, légendes écrites à la main. Le style vaut pour tout le carnet (modifiable ensuite dans ⋮ › Réglages du carnet).</p>' +
      VX.STYLES.map((s) => '<button type="button" class="vsb' + (s[0] === st ? ' on' : '') + '" data-st="' + s[0] + '"><b>' + esc(s[1]) + '</b><small>' + esc(s[2]) + '</small></button>').join('') + VX.ppHtml(pp) + VX.ordHtml(od);
    const v = await O.dialog({
      title: opt.title || 'Style des pages du voyage', body, cls: 'cv-dlg',
      onOpen: () => { VX.ppBind(body, pp, opt.list || 0); VX.ordBind(body, od); body.addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; st = b.dataset.st; $$('.vsb', body).forEach((x) => x.classList.toggle('on', x === b)); }); },
      buttons: [{ label: 'Annuler', value: null }, { label: opt.ok || 'Choisir', value: 'ok', primary: true }]
    });
    if (v !== 'ok') return null;
    memo.style = st; VX.setPp(c, pp); VX.setOrd(c, od); E.save();
    return st;
  };

  /* ---------------- Import ---------------- */
  /** Ajoute des photos du voyage au carnet ouvert : import, pages par jour, carte. list : entrées de l'index (téléphone) ou du dossier (PC, avec blob) */
  VX.add = async function (list, opt) {
    opt = opt || {};
    const c = E.c; if (!c || !list.length) return 0;
    const style = opt.style || await VX.askStyle(c);
    if (!style) return 0;
    VX.banner(0);
    const memo = VX.memo(c);
    if (!memo.style) memo.style = style;   // style imposé (essais, Majordome) : retenu pour le carnet
    // importées dans l'ordre de la liste reçue (« Ordre de sélection »), sinon chronologique ; rangées ensuite selon le réglage
    const mode = VX.ord(c).mode;
    list = list.filter((e) => !(VX.cle(e) in memo.imp));
    if (mode !== 'selection') list = list.slice().sort((a, b) => (a.date || 0) - (b.date || 0));
    if (!list.length) { O.toast('Ces photos sont déjà dans le carnet'); return 0; }
    const pr = U.progress('Photos du voyage…', list.length), done = [];
    for (let i = 0; i < list.length; i++) {
      pr(i);
      const e = list[i];
      try {
        let blob = e.blob;
        if (!blob) {
          const o = await readPhoto(e.id);
          if (!o.ok || !o.data) throw new Error(o.err || 'lecture impossible');
          blob = new Blob([O.b64ToBytes(o.data.slice(o.data.indexOf(',') + 1))], { type: 'image/jpeg' });
        }
        const m = await M.importPhoto(blob, e.nom || e.fichier || 'photo.jpg', c.id, { lat: e.lat != null ? e.lat : undefined, lon: e.lng != null ? e.lng : undefined, date: e.date ? exifDate(e.date) : '' });
        // l'index du voyage (ou voyage.json) fait foi : même photo, heure locale de la prise
        if (e.date) { m.exif.t = e.date; m.exif.date = exifDate(e.date); }
        if (e.lat != null) { m.exif.lat = e.lat; m.exif.lon = e.lng; }
        if (e.ville) m.exif.place = e.ville + (e.pays ? ', ' + e.pays : '');
        if (e.legende) m.exif.legende = e.legende;
        if (e.lieu) m.exif.lieu = e.lieu;
        m.voyage = { cle: VX.cle(e), src: e.blob ? 'dossier' : 'photo', id: e.id || '' };
        await M.putMedia(m);
        const inf = M.info(m.id); if (inf) inf.exif = m.exif;
        memo.imp[VX.cle(e)] = m.id;
        done.push({ e, m });
      } catch (err) { O.toast((e.nom || e.fichier || 'photo') + ' : ' + (err.message || err), { bad: true }); }
    }
    pr(-1);
    if (!done.length) { E.saveNow(); return 0; }
    await M.ensureUrls(done.map((x) => x.m.id));
    // lieu des jours sans ville connue (géocodeur d'Android, ou service en ligne s'il est activé sur PC)
    for (const x of done) {
      if (x.e.ville || x.m.exif.lat == null) continue;
      const v = await VX.villeDe(x.m.exif.lat, x.m.exif.lon).catch(() => '');
      if (v) { x.e.ville = v; if (!x.m.exif.place) { x.m.exif.place = v; await M.putMedia(x.m); const inf = M.info(x.m.id); if (inf) inf.exif = x.m.exif; } }
    }
    const b0 = U.orderBroken();
    const res = VX.layout(c, done, style);
    VX.addToMap(c, done);
    const ids = new Set(done.map((x) => x.m.id)), firstPage = c.pages.findIndex((p) => (p.items || []).some((it) => ids.has(it.media)));
    E.sel = []; E.render(); E.commit('Photos du voyage'); U.pagesBar(); U.tools();
    if (firstPage >= 0) E.go(firstPage, true);
    await E.saveNow();
    const broken = U.orderBroken() > b0;
    O.toast(done.length + ' photo' + (done.length > 1 ? 's' : '') + ' du voyage ajoutée' + (done.length > 1 ? 's' : '') + ' : ' + (res.filled ? res.filled + ' page' + (res.filled > 1 ? 's' : '') + ' complétée' + (res.filled > 1 ? 's' : '') + ', ' : '') + (res.pages || !res.filled ? res.pages + ' nouvelle' + (res.pages > 1 ? 's' : '') + ' page' + (res.pages > 1 ? 's' : '') + ', ' : '') + res.days + ' jour' + (res.days > 1 ? 's' : '') + (broken ? ' · ordre des dates à revoir' : ''), broken ? { action: { label: 'Remettre dans l’ordre', fn: () => U.reorder('all') }, ms: 9000 } : {});
    if (B()) VX.check(true);
    return done.length;
  };

  /** Pages par jour (titre, Composer, cadres du style, légendes manuscrites). done : [{e, m}]
      Les pages libres du jour d'abord : pages du jour vides ou incomplètes (titre seul, moins de photos que « Photos par
      page »), et pages vides sans jour placées entre deux pages de ce jour ; ensuite seulement des pages « (suite) », après la
      dernière page du jour (une page vide sans jour à cet endroit est reprise). Titres « (suite) » remis à jour à la fin. */
  VX.layout = function (c, done, style) {
    const byDay = {};
    done.forEach((x) => { const t = x.m.exif.t || x.e.date || Date.now(); (byDay[dayKey(t)] = byDay[dayKey(t)] || []).push(x); });
    const days = Object.keys(byDay).sort(); let pages = 0, first = -1, filled = 0;
    const bg = (c.pages.find((p) => p.items && p.items.length) || c.pages[0] || {}).bg || 'creme';
    const pp = VX.pp(c), cap = U.capOf(pp);
    days.forEach((day) => {
      // photos du jour selon « Ordre des photos » (par défaut chronologique) ; les jours toujours dans l'ordre du calendrier
      const by = {}; byDay[day].forEach((x) => { by[x.m.id] = x; });
      const list = M.sortIds(byDay[day].map((x) => x.m.id), VX.ord(c).mode).map((id) => by[id]);
      const place = VX.mainPlace(list.map((x) => x.e)), again = c.pages.some((p) => p.jour === day) ? 1 : 0;
      let rest = list.slice();
      // 1. pages libres de ce jour (dans l'ordre des pages)
      const own = c.pages.map((p, i) => p.jour === day ? i : -1).filter((i) => i >= 0);
      if (own.length) {
        for (let i = own[0]; i <= own[own.length - 1] && rest.length; i++) {
          const p = c.pages[i], gap = !p.jour && M.isEmptyPage(p);
          if ((p.jour !== day && !gap) || !U.usablePage(p)) continue;
          const have = U.pagePhotos(p).length, room = have ? cap - have : M.split(rest.length, pp.k, pp.eq)[0];
          if (room <= 0) continue;
          const take = rest.splice(0, room);
          if (gap) { p.jour = day; p.voyage = 1; p.items = [VX.titleItem(style, VX.dayTitle(day, '', 2))]; }
          if (!p.voyage) p.voyage = 1;
          U.fillPage(p, take.map((x) => x.m.id));
          filled++;
          if (first < 0 || i <= first) first = i;
        }
      }
      // 2. le reste sur des pages ajoutées après le jour
      VX.chunks(rest, pp).forEach((chunk, k) => {
        if (!chunk.length) return;
        const page = M.newPage(bg); page.jour = day; page.voyage = 1;
        page.items = VX.pageItems(chunk, style, VX.dayTitle(day, place, k + 1 + again)); M.setSlots(page);
        const at = VX.placePage(c, page);
        if (first < 0 || at <= first) first = at;
        pages++;
      });
    });
    VX.fixDayTitles(c);
    return { pages, days: days.length, first, filled };
  };
  /** Titres des pages d'un jour : la première porte la date et le lieu, les suivantes « (suite) » (après une suppression, un
      remplissage, un import). Seuls les titres posés par l'appli sont réécrits. */
  VX.fixDayTitles = function (c) {
    const by = {}; c.pages.forEach((p) => { if (p.jour) (by[p.jour] = by[p.jour] || []).push(p); });
    let n = 0;
    Object.keys(by).forEach((day) => {
      const base = VX.dayTitle(day, '', 1);
      const auto = (x) => x === base || x === base + ' (suite)' || (x.indexOf(base + ' · ') === 0 && x.indexOf('\n') < 0);
      const tt = (p) => (p.items || []).find((it) => it.type === 'text' && typeof it.text === 'string' && auto(it.text) && (it.dt || it.y < AREA.y * H + 20));
      const list = by[day].filter((p) => tt(p)); if (!list.length) return;
      let place = '';
      list.forEach((p) => { const m = / · (.+)$/.exec(tt(p).text); if (m && !place) place = m[1]; });
      if (!place) place = VX.mainPlace(by[day].flatMap((p) => M.pageMedia(p)).map((id) => ({ ville: (((M.info(id) || {}).exif || {}).place || '').split(',')[0].trim() })));
      list.forEach((p, k) => {
        const t = tt(p), want = VX.dayTitle(day, place, k ? 2 : 1);
        if (t.text === want) return;
        t.text = want; t.h = R.textLayout(t).h;
        if (t.dt) { while (t.h > AREA.y * H - 24 && t.size > 30) { t.size -= 4; t.h = R.textLayout(t).h; } t.y = Math.max(14, (AREA.y * H - t.h) / 2); }
        n++;
      });
    });
    return n;
  };
  /** Titre d'une page du voyage (date et lieu), au style du carnet */
  VX.titleItem = function (style, title) {
    const T = TITLE[style] || TITLE.melange;
    const t = { id: M.uid('i'), type: 'text', text: title, font: T.font, size: T.size, color: T.color, align: 'center', style: T.style, rot: style === 'polaroid' ? -1.5 : 0, w: 860, bg: style === 'melange' ? '#2F6F73' : '', dt: 1 };
    t.h = R.textLayout(t).h;
    while (t.h > AREA.y * H - 24 && t.size > 30) { t.size -= 4; t.h = R.textLayout(t).h; }   // titre sur une ligne si possible
    t.x = (W - t.w) / 2; t.y = Math.max(14, (AREA.y * H - t.h) / 2);
    if (!t.bg) delete t.bg;
    return t;
  };
  /** Légende d'une photo seule sur sa page (pleine page) : légende, sinon lieu, sinon date */
  VX.soloCap = function (id) {
    const ex = (M.info(id) || {}).exif || {};
    if (ex.legende) return ex.legende;
    const town = (ex.place || '').split(',')[0].trim(), d = ex.t ? new Date(ex.t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    return [town, d].filter(Boolean).join(', ');
  };
  /** Propositions habillées : photos composées (cadres du style), légendes manuscrites sous les photos, dans leur case.
      opt : style (classique, timbres, polaroid, melange ; vide : cadres de l'agencement), area, caps {media: légende} */
  VX.dress = function (ids, opt) {
    opt = opt || {};
    const style = opt.style || '', cap = {}, n = Math.min(ids.length, M.MAXN);
    ids.forEach((id) => { cap[id] = String((opt.caps || {})[id] || '').trim(); });
    const inFrame = (id, fr) => fr === 'polaroid' && cap[id] && cap[id].length <= 30;
    const frameOf = style ? (FRAME[style] || FRAME.melange) : null;
    const capSize = n <= 2 ? 46 : n <= 6 ? 38 : 30;
    // légende inclinée comme sa photo (moins) : sa boîte grandit, comptée pour rester sous la photo, dans sa case
    const capRot = (r) => Math.max(-3, Math.min(3, (r || 0) * 0.6));
    const tiltX = (q, r) => { const a = Math.abs(r) * Math.PI / 180; return (q.w * Math.sin(a) + q.h * Math.cos(a) - q.h) / 2; };
    const fit = {};
    const capBox = (txt, cw, size) => { const q = { type: 'text', text: txt, font: 'manuscrit', size, align: 'center', style: 'aucun', w: Math.min(W - 40, Math.max(n >= 7 ? 150 : 240, cw * 0.96)) }; q.h = R.textLayout(q).h; return q; };
    const props = M.compose(ids, {
      fill: opt.fill != null ? opt.fill : VX.ord(E.c).fill,
      area: opt.area || { x: 0, y: 0, w: 1, h: 1 },
      frame: frameOf ? (f) => frameOf(f) : null,
      rot: style === 'polaroid' ? (i, r) => r || [-3, 2.5, -1.5, 3, -2, 1.5, -2.5, 2, -1][i % 9] : null,   // Polaroid posés à la main
      room: (id, cw, ch, rot) => {
        if (!cap[id] || (style === 'polaroid' && cap[id].length <= 30)) return 0;
        // taille (et au besoin texte raccourci) décidée une fois pour cette case, reprise au placement
        const need = (q) => q.h + 2 * tiltX(q, capRot(rot)) + 8;
        let q = capBox(cap[id], cw, capSize);
        if (need(q) > ch * 0.3 && capSize > 26) q = capBox(cap[id], cw, 26);
        while (need(q) > ch * 0.38 && q.text.length > 12) q = capBox(q.text.replace(/\s*\S+…?$/, '') + '…', cw, q.size);
        fit[id + '|' + Math.round(cw) + '|' + Math.round(ch)] = q;
        return Math.max(n <= 2 ? 0.1 : 0.12, need(q) / ch);
      }
    });
    return props.map((p) => {
      const items = [];
      p.items.forEach((it, i) => {
        const cell = p.cells[i], id = it.media, txt = cap[id], ex = (M.info(id) || {}).exif || {};
        const town = (ex.place || '').split(',')[0];
        it.o = it.o || {};
        if (style && it.frame === 'timbre') { it.o.pm = n >= 7 ? i % 3 === 0 : (i % 2 === 0 || n <= 2); if (town) it.o.pmCity = town.toUpperCase(); it.o.sc = ''; it.o.st = ''; }
        if (it.frame === 'polaroid') it.o.cap = inFrame(id, 'polaroid') ? txt : (town || it.o.cap || '');
        if (it.frame === 'carte-postale') it.o.cap = (town || 'Souvenir').toUpperCase();
        items.push(it);
        if (txt && !inFrame(id, it.frame)) {
          const b = E.aabb ? E.aabb(it) : [it.x, it.y, it.x + it.w, it.y + it.h];
          const q = Object.assign({}, fit[id + '|' + Math.round(cell.w) + '|' + Math.round(cell.h)] || capBox(txt, cell.w, capSize));
          Object.assign(q, { id: M.uid('i'), cap: id, color: '#2E2620', rot: capRot(cell.rot) });
          const ex = tiltX(q, q.rot);
          q.x = Math.max(20, Math.min(W - q.w - 20, cell.x + (cell.w - q.w) / 2));
          q.y = Math.min(H - q.h - ex - 8, cell.y + cell.h - q.h - ex, b[3] + 2 + ex);   // sous la photo, dans sa case
          items.push(q);
        }
      });
      return { name: p.name, items, cells: p.cells };
    });
  };
  /** Éléments d'une page : titre, photos composées, légendes */
  VX.pageItems = function (chunk, style, title) {
    const ids = chunk.map((x) => x.m.id), caps = {}, n = ids.length;
    chunk.forEach((x) => { caps[x.m.id] = (x.m.exif.legende || x.e.legende || '').trim() || (n === 1 ? (x.e.lieu || VX.soloCap(x.m.id) || '').split(',')[0] : ''); });
    const props = VX.dress(ids, { style, area: AREA, caps });
    const want = (PREF[style] || PREF.melange)[n];
    const p = props.find((x) => x.name === want) || props[0];
    return [VX.titleItem(style, title)].concat(p.items);
  };
  VX.AREA = AREA;
  /** Pages en plus après la page « at » pour des photos (Composer : photos en trop), selon « Photos par page ».
      ref : page d'origine (page du voyage : même jour, titre « (suite) », style du carnet). → nombre de pages */
  VX.morePages = function (c, at, ids, ref, caps) {
    ref = ref || {};
    const style = ref.voyage && c.voyage && c.voyage.style ? c.voyage.style : '';
    let k = 0;
    VX.chunks(ids, VX.pp(c)).forEach((chunk) => {
      const page = M.newPage(ref.bg), cc = {};
      chunk.forEach((id) => { cc[id] = (caps && caps[id]) || (chunk.length === 1 ? VX.soloCap(id) : ''); });
      if (ref.jour) { page.jour = ref.jour; page.voyage = 1; }
      if (ref.jour) {
        const props = VX.dress(chunk, { style, area: AREA, caps: cc }), p = props.find((x) => x.name === (PREF[style] || PREF.melange)[chunk.length]) || props[0];
        page.items = [VX.titleItem(style || 'melange', VX.dayTitle(ref.jour, '', 2))].concat(p.items);
      } else {
        const props = VX.dress(chunk, { style, caps: cc });
        page.items = (props[1] || props[0]).items;
      }
      M.setSlots(page);
      c.pages.splice(at + 1 + k, 0, page); k++;
    });
    return k;
  };
  /** Insère une page du voyage dans l'ordre des jours (réutilise une page vide à cet endroit) → index */
  VX.placePage = function (c, page) {
    let after = -1, before = -1, last = -1;
    c.pages.forEach((p, i) => { if (p.jour) { if (p.jour <= page.jour) after = i; else if (before < 0) before = i; } if ((p.items || []).length) last = i; });
    const at = after >= 0 ? after + 1 : before >= 0 ? before : last + 1;
    const here = c.pages[at];
    if (here && !(here.items || []).length && !here.jour) { here.items = page.items; here.jour = page.jour; here.voyage = 1; if (page.slots) here.slots = page.slots; return at; }
    c.pages.splice(at, 0, page);
    return at;
  };
  /** Étapes ajoutées à la carte de l'itinéraire (créée sur sa page si besoin), sans doublon de ville */
  VX.addToMap = function (c, done) {
    const pts = done.map((x) => x.m).filter((m) => m.exif && m.exif.lat != null).sort((a, b) => (a.exif.t || 0) - (b.exif.t || 0))
      .map((m) => ({ lat: Math.round(m.exif.lat * 1000) / 1000, lon: Math.round(m.exif.lon * 1000) / 1000, name: (m.exif.place || '').split(',')[0].trim() }));
    if (!pts.length) return 0;
    let map = null;
    c.pages.forEach((p) => (p.items || []).forEach((it) => { if (!map && it.type === 'map') map = it; }));
    const fresh = !map;
    if (fresh) map = { id: M.uid('i'), type: 'map', region: 'auto', style: 'ancienne', title: '', points: [], w: 860, h: 645, x: 70, y: 250, rot: -1 };
    let added = 0;
    pts.forEach((q) => {
      const dup = map.points.some((o) => (q.name && o.name && norm(o.name) === norm(q.name)) || (!q.name || !o.name) && Math.hypot(o.lat - q.lat, o.lon - q.lon) < 0.05);
      if (dup || map.points.length >= 20) return;
      map.points.push(q); added++;
    });
    if (fresh && added) {
      const t = { id: M.uid('i'), type: 'text', text: 'Notre itinéraire', font: 'titre', size: 96, color: '#3A2E24', align: 'center', style: 'aucun', rot: -1, w: 760 };
      t.h = R.textLayout(t).h; t.x = (W - t.w) / 2; t.y = 90;
      const page = M.newPage((c.pages[0] || {}).bg || 'creme'); page.carte = 1; page.items = [t, map];
      const firstDay = c.pages.findIndex((p) => p.jour);
      const at = firstDay < 0 ? c.pages.length : firstDay;
      if (at > 0 && !(c.pages[at - 1].items || []).length && !c.pages[at - 1].jour) c.pages[at - 1].items = page.items, c.pages[at - 1].carte = 1;
      else c.pages.splice(at, 0, page);
    }
    return added;
  };

  /** Photos supprimées du carnet : les étapes de la carte qui ne venaient que d'elles disparaissent. Une étape posée à la main
      (manual) reste ; une étape qui correspond encore à une photo du carnet (posée ou en réserve) aussi. → étapes retirées */
  VX.pruneMap = function (c, deadIds) {
    const loc = (id) => { const ex = (M.info(id) || {}).exif || {}; return ex.lat != null ? { lat: ex.lat, lon: ex.lon, name: (ex.place || '').split(',')[0].trim() } : null; };
    const dead = deadIds.map(loc).filter(Boolean); if (!dead.length) return 0;
    const live = Array.from(M.mediaIds(c)).concat(c.reserve || []).filter((id) => !deadIds.includes(id)).map(loc).filter(Boolean);
    const match = (pt, q) => (pt.name && q.name && norm(pt.name) === norm(q.name)) || Math.hypot(pt.lat - q.lat, pt.lon - q.lon) < 0.05;
    let n = 0;
    c.pages.forEach((p) => (p.items || []).forEach((it) => {
      if (it.type !== 'map' || !it.points) return;
      const keep = it.points.filter((pt) => pt.manual || !dead.some((q) => match(pt, q)) || live.some((q) => match(pt, q)));
      n += it.points.length - keep.length; it.points = keep;
    }));
    return n;
  };

  /* ---------------- PC (et téléphone) : dossier de voyage copié depuis le téléphone ---------------- */
  /** Lit des fichiers d'un dossier de voyage [{name, blob, path?}] → {carnet:{id,titre,debut,fin}, entries:[…]} */
  VX.readFolder = async function (files, folderName) {
    files = files.filter((f) => !/(^|\/)Originaux\//i.test(f.path || '') && !/_original\.jpe?g$/i.test(f.name));
    const jf = files.find((f) => /^voyage\.json$/i.test(f.name));
    let j = null;
    if (jf) { try { j = JSON.parse(await jf.blob.text()); } catch (e) { throw new Error('voyage.json illisible'); } if (!j || j.format !== 'magvoyage') throw new Error('ce voyage.json ne vient pas de l\'appli Photo'); }
    const imgs = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    const meta = {}; ((j && j.photos) || []).forEach((p) => { meta[String(p.fichier || '').toLowerCase()] = p; });
    const dirName = folderName || (j && (j.dossier || '').split('/').pop()) || (j && j.carnet && j.carnet.titre) || '';
    const entries = [];
    for (const f of imgs) {
      const p = meta[f.name.toLowerCase()] || {};
      const e = { nom: f.name, blob: f.blob, chemin: p.chemin || ('DCIM/Photo/Voyage/' + dirName + '/' + f.name), legende: p.legende || '', lieu: p.lieu || '', ville: p.ville || '', pays: p.pays || '', carnet: p.carnet || '' };
      if (p.date) e.date = Date.parse(p.date) || 0;
      if (p.lat != null) { e.lat = p.lat; e.lng = p.lng; }
      if (!e.date || e.lat == null) {
        try { const ex = M.exif(await f.blob.slice(0, 256 * 1024).arrayBuffer()); if (!e.date && ex.date) e.date = M.exifTime(ex.date); if (e.lat == null && ex.lat != null) { e.lat = ex.lat; e.lng = ex.lon; } } catch (err) { }
      }
      if (!e.date) e.date = f.blob.lastModified || Date.now();
      entries.push(e);
    }
    const car = (j && j.carnet) || {};
    // l'ordre rendu par le navigateur (FileSystemAccess, sélecteur de dossier) n'est pas garanti : noms en ordre naturel, comme
    // dans l'explorateur (c'est « l'ordre de sélection » d'un dossier) ; VX.add range ensuite selon « Ordre des photos »
    return { carnet: { id: car.id || '', titre: car.titre || dirName || 'Voyage', debut: car.debut || '', fin: car.fin || '' }, entries: entries.sort((a, b) => M.natCmp(a.nom, b.nom)), json: !!j };
  };
  /** Choisir le dossier du voyage (sélecteur de dossier du navigateur) → [{name, blob, path}] */
  VX.pickFolder = async function () {
    if (window.showDirectoryPicker) {
      let dir; try { dir = await window.showDirectoryPicker({ id: 'voyage', mode: 'read' }); } catch (e) { return null; }
      const out = [];
      for await (const [name, h] of dir.entries()) { if (h.kind === 'file') out.push({ name, blob: await h.getFile(), path: dir.name + '/' + name }); }
      return { name: dir.name, files: out };
    }
    return new Promise((resolve) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.webkitdirectory = true; inp.id = 'cvDirIn'; inp.style.display = 'none'; document.body.appendChild(inp);
      inp.onchange = () => {
        const l = Array.from(inp.files || []), name = l[0] && l[0].webkitRelativePath ? l[0].webkitRelativePath.split('/')[0] : '';
        inp.remove();
        resolve({ name, files: l.filter((f) => !f.webkitRelativePath || f.webkitRelativePath.split('/').length <= 2).map((f) => ({ name: f.name, blob: f, path: f.webkitRelativePath || f.name })) });
      };
      inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
      inp.click();
    });
  };
  /** « Importer un dossier de voyage » : dans le carnet ouvert, ou dans le carnet du même voyage (créé au besoin) */
  VX.importFolder = async function (picked) {
    picked = picked || await VX.pickFolder();
    if (!picked || !picked.files.length) return 0;
    let r;
    try { r = await VX.readFolder(picked.files, picked.name); } catch (e) { O.alert('Dossier de voyage illisible', '<p>' + esc(e.message) + '</p>'); return 0; }
    if (!r.entries.length) { O.alert('Aucune photo', '<p>Ce dossier ne contient pas de photo du voyage (JPEG). Choisis le dossier <b>DCIM/Photo/Voyage/&lt;titre&gt;</b> copié depuis le téléphone.</p>'); return 0; }
    if (!E.c) {
      const all = await M.carnets();
      let c = all.find((x) => r.carnet.id && x.id === r.carnet.id) || all.find((x) => norm(x.title) === norm(r.carnet.titre));
      if (!c) { c = M.newCarnet({ title: r.carnet.titre, dates: U.fmtDates(r.carnet.debut, r.carnet.fin) }); if (r.carnet.id && !all.some((x) => x.id === r.carnet.id)) c.id = r.carnet.id; await M.putCarnet(c); }
      await U.open(c.id, 0);
    }
    const memo = VX.memo(E.c), fresh = r.entries.filter((e) => !(VX.cle(e) in memo.imp));
    if (!fresh.length) { O.toast('Toutes les photos de ce dossier sont déjà dans le carnet'); return 0; }
    // feuille d'import : style (choisi une fois) et photos par page, avec la répartition prévue
    const style = await VX.askStyle(E.c, true, memo.style ? { list: fresh, title: 'Importer ' + fresh.length + ' photo' + (fresh.length > 1 ? 's' : '') + ' du voyage', ok: 'Importer' } : { list: fresh });
    if (!style) return 0;
    return VX.add(fresh, { style });
  };
  /** Fichiers reçus (« Ouvrir avec », dépôt) contenant voyage.json : avec ses photos, ou demande du dossier */
  VX.receive = async function (list) {
    const files = list.map((x) => ({ name: x.name, blob: x.blob, path: x.name }));
    if (!files.some((f) => /\.(jpe?g|png|webp)$/i.test(f.name))) {
      const go = await O.dialog({ title: 'Dossier de voyage', body: '<p>Ce <b>voyage.json</b> décrit les photos d\'un dossier de voyage. Choisis maintenant ce dossier (copié depuis le téléphone) pour importer ses photos.</p>', buttons: [{ label: 'Annuler', value: null }, { label: 'Choisir le dossier…', value: 'ok', primary: true }] });
      return go === 'ok' ? VX.importFolder() : 0;
    }
    return VX.importFolder({ name: '', files });
  };

  /* ---------------- Carnets demandés par Photo ou Majordome, liste publiée ---------------- */
  VX.attente = async function () {
    const b = window.MAGVoyage; if (!b || !b.attente || PCV()) return 0;
    let l = []; try { l = JSON.parse(b.attente() || '[]'); } catch (e) { }
    let n = 0;
    for (const w of l) {
      if (!w || !w.id || await M.getCarnet(w.id)) continue;
      const c = M.newCarnet({ title: w.titre || 'Mon carnet de voyage', dates: U.fmtDates(w.debut, w.fin) });
      c.id = w.id; c.voyage = { imp: {}, src: w.source || '', debut: w.debut || '', fin: w.fin || '' };
      await M.putCarnet(c); n++;
    }
    if (n) O.toast(n > 1 ? n + ' carnets créés depuis Photo ou Majordome' : 'Carnet « ' + l.filter((w) => w && w.titre).map((w) => w.titre).pop() + ' » créé');
    return n;
  };
  const covCache = {};
  VX.publish = async function (list) {
    const b = window.MAGVoyage; if (!b || !b.publier || PCV()) return;
    try {
      list = list || await M.carnets();
      const out = [];
      for (const c of list.slice(0, 40)) {
        let th = '';
        const key = c.id + ':' + (c.updated || 0);
        if (covCache[c.id] && covCache[c.id].k === key) th = covCache[c.id].v;
        else if (out.length < 12) {
          try {
            let du = '';
            if (c.cover && c.cover.photo) { await M.ensureUrls([c.cover.photo]); du = await M.dataUrl(c.cover.photo, 'mid'); }
            let s = R.pageSvg(c, { id: 'cover', items: c.coverItems || [] }, { pfx: 'pb' + c.id + '-', href: () => du, media: M.info, cover: true });
            s = s.replace(/(<svg[^>]*>)/, '$1<style>' + await R.fontsCss(s) + '</style>');
            const cv = await R.raster(s, 96); th = cv.toDataURL('image/jpeg', 0.6);
            covCache[c.id] = { k: key, v: th };
          } catch (e) { th = ''; }
        }
        out.push({ id: c.id, titre: c.title, dates: c.dates || '', debut: (c.voyage && c.voyage.debut) || '', fin: (c.voyage && c.voyage.fin) || '', style: (c.cover || {}).style || '', couleur: (c.cover || {}).color || '', vignette: th, maj: c.updated || 0, pages: (c.pages || []).length, photos: M.mediaIds(c).size });
      }
      b.publier(JSON.stringify(out));
    } catch (e) { console.warn('publier', e); }
  };

  /* ---------------- Majordome : « ajoute les photos du jour au carnet » ---------------- */
  /** Carnet du voyage actif dans Photo (sinon le dernier ouvert) */
  VX.activeCarnet = async function () {
    const b = B(); let id = '';
    if (b && b.photoEtat) { try { const s = JSON.parse(b.photoEtat() || 'null'); if (s && s.voyage) { id = s.voyage.id || ''; if (!(await M.getCarnet(id)) && s.voyage.titre) { const l = await M.carnets(); const c = l.find((x) => norm(x.title) === norm(s.voyage.titre)); id = c ? c.id : ''; } } } catch (e) { } }
    if (!id || !(await M.getCarnet(id))) id = localStorage.getItem('voyage.last') || '';
    return id && await M.getCarnet(id) ? id : '';
  };
  VX.importToday = async function () {
    const id = await VX.activeCarnet();
    if (!id) { O.toast('Aucun carnet de voyage : crée-en un d\'abord', { bad: true }); return 0; }
    if (!E.c || E.c.id !== id) await U.open(id);
    const today = dayKey(Date.now());
    const l = VX.fresh(E.c).filter((e) => dayKey(e.date) === today);
    if (!l.length) { VX.check(true); O.toast('Aucune nouvelle photo du voyage aujourd\'hui'); return 0; }
    return VX.add(l);
  };
})();
