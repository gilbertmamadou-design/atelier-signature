/* Tableur — volets latéraux : Rechercher et remplacer (feuille ou classeur, valeurs, formules ou notes, casse,
   cellule entière, jokers * ?) ; Commentaires (fils de discussion avec réponses, résolus) et notes. */
(function () {
  'use strict';
  const O = window.Office, TB = window.Tableur;
  const A = window.TableurApp = window.TableurApp || {};
  const C = A.cmd = A.cmd || {};
  const wb = () => A.wb, sh = () => A.wb.cur, G = () => A.grid;
  const KEY = TB.key, esc = O.esc;
  let pane = null, hd = null, bd = null;
  A.pane = null;
  A.panesInit = function () {
    pane = document.getElementById('pane'); if (!pane) return;
    pane.innerHTML = '<div class="pane-hd"><b id="paneT"></b><button type="button" class="o-x" id="paneX" aria-label="Fermer">' + O.icon('x') + '</button></div><div class="pane-bd" id="paneB"></div>';
    hd = pane.querySelector('#paneT'); bd = pane.querySelector('#paneB');
    pane.querySelector('#paneX').onclick = () => A.openPane(null);
  };
  A.openPane = function (kind, opt) {
    if (!pane) A.panesInit(); if (!pane) return;
    opt = opt || {};
    A.pane = kind || null;
    pane.hidden = !kind;
    if (kind === 'find') renderFind(opt);
    else if (kind === 'comments') renderComments(opt);
    if (A.grid) setTimeout(() => { A.grid.resize && A.grid.resize(); A.grid.draw(); if (!kind) A.grid.focus(); }, 0);
    A.refreshUi && A.refreshUi();
  };
  A.paneRefresh = function () { if (A.pane === 'comments') renderComments({ keep: true }); };
  A.paneOnSelect = function () { if (A.pane === 'comments') highlight(); };

  /* ---------------- rechercher / remplacer ---------------- */
  const F = { q: '', r: '', cs: false, whole: false, look: 'formulas', within: 'sheet', res: [], i: -1, rep: false };
  function renderFind(opt) {
    if (opt.replace) F.rep = true;
    const g = G(); if (!opt.keep && g && !g.edit) { const v = sh().get(g.sel.r, g.sel.c); if (!F.q && typeof v === 'string' && v.length < 60) F.q = v; }
    hd.textContent = F.rep ? 'Rechercher et remplacer' : 'Rechercher';
    bd.innerHTML = '<div class="find-row"><input id="fdQ" placeholder="Rechercher" value="' + esc(F.q) + '" aria-label="Rechercher"><button type="button" class="mini-btn" id="fdPrev" title="Précédent (Maj+Entrée)">' + O.icon('chevron-up') + '</button><button type="button" class="mini-btn" id="fdNext" title="Suivant (Entrée)">' + O.icon('chevron-down') + '</button></div>' +
      '<div class="find-row"' + (F.rep ? '' : ' hidden') + ' id="fdRrow"><input id="fdR" placeholder="Remplacer par" value="' + esc(F.r) + '" aria-label="Remplacer par"></div>' +
      '<div class="find-opts"><label><input type="checkbox" id="fdCs"' + (F.cs ? ' checked' : '') + '>Respecter la casse</label><label><input type="checkbox" id="fdW"' + (F.whole ? ' checked' : '') + '>Cellule entière</label>' +
      '<label>Dans <select id="fdIn" class="o-in" style="height:28px;padding:0 4px"><option value="sheet"' + (F.within === 'sheet' ? ' selected' : '') + '>la feuille</option><option value="book"' + (F.within === 'book' ? ' selected' : '') + '>le classeur</option></select></label>' +
      '<label>Regarder dans <select id="fdLk" class="o-in" style="height:28px;padding:0 4px"><option value="formulas"' + (F.look === 'formulas' ? ' selected' : '') + '>les formules</option><option value="values"' + (F.look === 'values' ? ' selected' : '') + '>les valeurs</option><option value="notes"' + (F.look === 'notes' ? ' selected' : '') + '>les notes</option></select></label></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn pri" id="fdAll">' + O.icon('list') + ' Tout rechercher</button><button type="button" class="mini-btn' + (F.rep ? ' on' : '') + '" id="fdRep">' + O.icon('replace') + ' Remplacer…</button>' + (F.rep ? '<button type="button" class="mini-btn" id="fdR1">Remplacer</button><button type="button" class="mini-btn" id="fdRA">Remplacer tout</button>' : '') + '</div>' +
      '<div class="find-res" id="fdN"></div><div class="fr-list" id="fdL"></div><p class="o-hint" style="margin-top:12px">Jokers : ? un caractère, * plusieurs ; ~* pour chercher un astérisque.</p>';
    const $ = (id) => bd.querySelector('#' + id);
    const read = () => { F.q = $('fdQ').value; F.r = $('fdR') ? $('fdR').value : F.r; F.cs = $('fdCs').checked; F.whole = $('fdW').checked; F.within = $('fdIn').value; F.look = $('fdLk').value; };
    $('fdQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); read(); step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') A.openPane(null); });
    $('fdQ').addEventListener('input', () => { read(); F.res = []; F.i = -1; $('fdN').textContent = ''; });
    if ($('fdR')) $('fdR').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); read(); replaceOne(); } });
    ['fdCs', 'fdW', 'fdIn', 'fdLk'].forEach((id) => $(id).addEventListener('change', () => { read(); F.res = []; F.i = -1; }));
    $('fdNext').onclick = () => { read(); step(1); }; $('fdPrev').onclick = () => { read(); step(-1); };
    $('fdAll').onclick = () => { read(); findAll(true); };
    $('fdRep').onclick = () => { read(); F.rep = !F.rep; renderFind({ keep: true }); };
    if ($('fdR1')) $('fdR1').onclick = () => { read(); replaceOne(); };
    if ($('fdRA')) $('fdRA').onclick = () => { read(); replaceAll(); };
    setTimeout(() => { try { $('fdQ').focus(); $('fdQ').select(); } catch (e) { } }, 30);
  }
  function matcher() {
    const q = F.q; if (!q) return null;
    const re = TB.hasWild(q) ? new RegExp((F.whole ? '^' : '') + TB.wildRe(q, false).source.replace(/^\^|\$$/g, '') + (F.whole ? '$' : ''), F.cs ? 'g' : 'gi') : new RegExp((F.whole ? '^' : '') + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (F.whole ? '$' : ''), F.cs ? 'g' : 'gi');
    return re;
  }
  function textOf(s, r, c) {
    if (F.look === 'notes') { const n = s.notes.get(KEY(r, c)); const t = s.threads.get(KEY(r, c)); return n ? n.text : t && t.items ? t.items.map((x) => x.text).join('\n') : null; }
    if (F.look === 'formulas') { const f = s.formula(r, c); if (f && !f.arrChild) return wb().editText(s, r, c); }
    const v = s.get(r, c); if (v === null || v === '') return null; if (s.spillOwner.has(KEY(r, c)) && F.look === 'formulas') return null;
    return wb().displayText(s, r, c);
  }
  function findAll(show) {
    const re = matcher(); F.res = []; F.i = -1; if (!re) return [];
    const list = F.within === 'book' ? wb().sheets.filter((s) => !s.hidden) : [sh()];
    for (const s of list) {
      const e = s.extent(); const cells = [];
      if (F.look === 'notes') { [s.notes, s.threads].forEach((m) => m.forEach((v, k) => { const p = TB.unkey(k); cells.push([p.r, p.c]); })); cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]); }
      else for (let r = 0; r <= e.r; r++) for (let c = 0; c <= e.c; c++) { const col = s.vals[c]; if ((col && col[r] !== undefined && col[r] !== null) || s.fml.has(KEY(r, c))) cells.push([r, c]); }
      for (const [r, c] of cells) { const t = textOf(s, r, c); if (t == null) continue; re.lastIndex = 0; if (re.test(String(t))) F.res.push({ s, r, c, t: String(t) }); if (F.res.length >= 20000) break; }
    }
    if (show) list2();
    const n = bd.querySelector('#fdN'); if (n) n.textContent = F.res.length ? F.res.length + ' cellule(s) trouvée(s)' : 'Aucun résultat';
    return F.res;
  }
  function list2() {
    const L = bd.querySelector('#fdL'); if (!L) return;
    L.innerHTML = F.res.slice(0, 500).map((x, i) => '<div class="fr-it' + (i === F.i ? ' on' : '') + '" data-i="' + i + '"><b>' + esc((F.within === 'book' ? x.s.name + '!' : '') + TB.addr(x.r, x.c)) + '</b><span></span><small>' + esc(x.t.slice(0, 120)) + '</small></div>').join('') + (F.res.length > 500 ? '<p class="o-hint">… ' + (F.res.length - 500) + ' autres</p>' : '');
    O.$$('.fr-it', L).forEach((it) => it.onclick = () => go(+it.dataset.i));
  }
  function go(i) {
    const x = F.res[i]; if (!x) return; F.i = i;
    if (x.s !== sh()) A.showSheet(x.s);
    G().select(x.r, x.c);
    O.$$('.fr-it', bd).forEach((it) => it.classList.toggle('on', +it.dataset.i === i));
    const n = bd.querySelector('#fdN'); if (n) n.textContent = (i + 1) + ' sur ' + F.res.length;
  }
  function step(d) {
    if (!F.res.length) findAll(false);
    if (!F.res.length) { O.toast('« ' + F.q + ' » introuvable', { ms: 1600 }); return; }
    // à partir de la cellule active
    const s = sh(), r0 = G().sel.r, c0 = G().sel.c; const si = wb().sheets.indexOf(s);
    const ord = (x) => [wb().sheets.indexOf(x.s), x.r, x.c];
    const cmp = (a, b) => { for (let k = 0; k < 3; k++) if (a[k] !== b[k]) return a[k] - b[k]; return 0; };
    const cur = [si, r0, c0]; let i;
    if (d > 0) { i = F.res.findIndex((x) => cmp(ord(x), cur) > 0); if (i < 0) i = 0; }
    else { i = -1; for (let k = F.res.length - 1; k >= 0; k--) if (cmp(ord(F.res[k]), cur) < 0) { i = k; break; } if (i < 0) i = F.res.length - 1; }
    go(i);
  }
  function newText(t, re) { re.lastIndex = 0; return F.whole ? F.r : String(t).replace(re, () => F.r); }
  function writeBack(s, r, c, t) {
    if (F.look === 'notes') { const k = KEY(r, c); const n = s.notes.get(k); if (n) wb().setProp(s.notes, k, Object.assign({}, n, { text: t })); return; }
    const cell = wb().inputToCell(s, r, c, t); if (cell.error) return false;
    if (!A.canEdit(s, r, c)) return false;
    wb().setCell(s, r, c, cell); return true;
  }
  function replaceOne() {
    const re = matcher(); if (!re) return;
    const s = sh(), r = G().sel.r, c = G().sel.c; const t = textOf(s, r, c);
    re.lastIndex = 0;
    if (t != null && re.test(t) && (F.look !== 'values' || !s.formula(r, c))) { const nt = newText(F.look === 'formulas' || F.look === 'notes' ? t : (typeof s.get(r, c) === 'string' ? s.get(r, c) : t), re); A.tx('Remplacer', () => writeBack(s, r, c, nt)); }
    F.res = []; step(1);
  }
  function replaceAll() {
    const re = matcher(); if (!re) return; findAll(false); let n = 0;
    if (!F.res.length) { O.toast('Aucun résultat', { ms: 1500 }); return; }
    A.tx('Remplacer tout', () => { for (const x of F.res) { if (F.look === 'values' && x.s.formula(x.r, x.c)) continue; const base = F.look === 'values' && typeof x.s.get(x.r, x.c) === 'string' ? x.s.get(x.r, x.c) : x.t; if (writeBack(x.s, x.r, x.c, newText(base, re)) !== false) n++; } });
    F.res = []; list2();
    O.alert('Remplacer tout', '<p>' + n + ' remplacement(s) effectué(s).</p>');
  }

  /* ---------------- commentaires et notes ---------------- */
  let showNotes = false, showDone = true;
  const initials = (n) => String(n || '?').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';
  const when = (t) => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  async function me() { let n = A.userName(); if (!n) { n = await O.prompt('Votre nom', 'Nom affiché dans les commentaires', '', { ok: 'Enregistrer' }); if (n == null) return null; n = n.trim() || 'Moi'; try { localStorage.setItem('tableur:auteur', n); } catch (e) { } } return n; }
  function renderComments(opt) {
    opt = opt || {};
    if (opt.notes) showNotes = true;
    hd.textContent = showNotes ? 'Notes' : 'Commentaires';
    const s = sh();
    const items = []; (showNotes ? s.notes : s.threads).forEach((v, k) => { const p = TB.unkey(k); items.push({ k, r: p.r, c: p.c, v }); });
    items.sort((a, b) => a.r - b.r || a.c - b.c);
    const r0 = G().sel.r, c0 = G().sel.c; const curK = KEY(r0, c0);
    let h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"><button type="button" class="mini-btn' + (showNotes ? '' : ' on') + '" data-m="c">' + O.icon('messages-square') + ' Commentaires</button><button type="button" class="mini-btn' + (showNotes ? ' on' : '') + '" data-m="n">' + O.icon('sticky-note') + ' Notes</button><span style="flex:1"></span><button type="button" class="mini-btn pri" id="cmNew">' + O.icon('plus') + ' Nouveau</button></div>';
    if (!showNotes) h += '<label class="o-check" style="font-size:12.5px"><input type="checkbox" id="cmDone"' + (showDone ? ' checked' : '') + '><span>Afficher les fils résolus</span></label>';
    if (opt.add && !(showNotes ? s.notes : s.threads).has(curK)) h += editor(TB.addr(r0, c0), '', 'new');
    h += items.filter((x) => showNotes || showDone || !x.v.done).map((x) => showNotes ? noteHtml(x, x.k === curK) : threadHtml(x, x.k === curK)).join('') || (opt.add ? '' : '<p class="o-hint">' + (showNotes ? 'Aucune note sur cette feuille. Clic droit › Nouvelle note, ou Maj+F2.' : 'Aucun commentaire sur cette feuille. Sélectionnez une cellule puis « Nouveau ».') + '</p>');
    bd.innerHTML = h;
    O.$$('[data-m]', bd).forEach((b) => b.onclick = () => { showNotes = b.dataset.m === 'n'; renderComments({}); });
    const dn = bd.querySelector('#cmDone'); if (dn) dn.onchange = () => { showDone = dn.checked; renderComments({}); };
    bd.querySelector('#cmNew').onclick = () => { if (showNotes) { C.note(); return; } renderComments({ add: true }); };
    wire();
    const ta = bd.querySelector('[data-ed="new"] textarea'); if (ta) setTimeout(() => ta.focus(), 30);
  }
  const editor = (ref, text, kind) => '<div class="cm on" data-ed="' + kind + '"><div class="ref">' + esc(ref) + '</div><textarea placeholder="' + (kind === 'reply' ? 'Répondre…' : 'Écrire un commentaire…') + '">' + esc(text) + '</textarea><div class="acts" style="margin-top:6px"><button type="button" class="mini-btn pri" data-a="save">' + O.icon('send') + ' Publier</button><button type="button" class="mini-btn" data-a="cancel">Annuler</button></div></div>';
  function threadHtml(x, on) {
    const t = x.v; const it = t.items || [];
    return '<div class="cm' + (t.done ? ' done' : '') + (on ? ' on' : '') + '" data-k="' + x.k + '"><div class="ref">' + esc(TB.addr(x.r, x.c)) + (t.done ? ' · résolu' : '') + '</div>' + it.map((m, i) => '<div class="' + (i ? 'rep' : '') + '"><div class="who"><span class="av">' + esc(initials(m.author)) + '</span>' + esc(m.author || 'Anonyme') + '<small>' + esc(when(m.at)) + '</small></div><p>' + esc(m.text) + '</p></div>').join('') +
      '<div class="acts"><button type="button" class="mini-btn" data-a="reply">' + O.icon('reply') + ' Répondre</button><button type="button" class="mini-btn" data-a="done">' + O.icon(t.done ? 'rotate-ccw' : 'check') + (t.done ? ' Rouvrir' : ' Résoudre') + '</button><button type="button" class="mini-btn" data-a="del">' + O.icon('trash-2') + '</button></div></div>';
  }
  function noteHtml(x, on) { return '<div class="cm' + (on ? ' on' : '') + '" data-k="' + x.k + '" data-note="1"><div class="ref">' + esc(TB.addr(x.r, x.c)) + '</div>' + (x.v.author ? '<div class="who">' + esc(x.v.author) + '</div>' : '') + '<p>' + esc(x.v.text) + '</p><div class="acts"><button type="button" class="mini-btn" data-a="editn">' + O.icon('pencil') + ' Modifier</button><button type="button" class="mini-btn" data-a="toThread">' + O.icon('messages-square') + ' Convertir en commentaire</button><button type="button" class="mini-btn" data-a="deln">' + O.icon('trash-2') + '</button></div></div>'; }
  function wire() {
    bd.onclick = async (e) => {
      const card = e.target.closest('.cm'); if (!card) return;
      const a = e.target.closest('[data-a]');
      const s = sh();
      if (!a) { if (card.dataset.k) { const p = TB.unkey(+card.dataset.k); G().select(p.r, p.c); } return; }
      const k = card.dataset.k != null ? +card.dataset.k : null;
      switch (a.dataset.a) {
        case 'save': {
          const t = card.querySelector('textarea').value.trim(); if (!t) return; const who = await me(); if (who == null) return;
          if (card.dataset.ed === 'new') { const kk = KEY(G().sel.r, G().sel.c); A.tx('Nouveau commentaire', () => wb().setProp(s.threads, kk, { items: [{ author: who, text: t, at: Date.now() }], done: false })); }
          else if (card.dataset.ed === 'reply') { const kk = +card.dataset.for; const th = s.threads.get(kk); if (th) A.tx('Répondre', () => wb().setProp(s.threads, kk, Object.assign({}, th, { items: th.items.concat([{ author: who, text: t, at: Date.now() }]) }))); }
          G().invalidate(); renderComments({}); return;
        }
        case 'cancel': renderComments({}); return;
        case 'reply': { const d = O.h('div'); d.innerHTML = editor('Réponse', '', 'reply'); const ed = d.firstChild; ed.dataset.for = k; card.after(ed); ed.querySelector('textarea').focus(); return; }
        case 'done': { const th = s.threads.get(k); A.tx(th.done ? 'Rouvrir' : 'Résoudre', () => wb().setProp(s.threads, k, Object.assign({}, th, { done: !th.done }))); G().invalidate(); renderComments({}); return; }
        case 'del': if (await O.confirm('Supprimer le fil', 'Supprimer ce fil de commentaires ?', 'Supprimer', true)) { A.tx('Supprimer le commentaire', () => wb().setProp(s.threads, k, undefined)); G().invalidate(); renderComments({}); } return;
        case 'editn': { const p = TB.unkey(k); G().select(p.r, p.c); await C.note(); renderComments({}); return; }
        case 'deln': A.tx('Supprimer la note', () => wb().setProp(s.notes, k, undefined)); G().invalidate(); renderComments({}); return;
        case 'toThread': { const n = s.notes.get(k); A.tx('Convertir la note', () => { wb().setProp(s.threads, k, { items: [{ author: n.author || A.userName() || '', text: n.text, at: Date.now() }], done: false }); wb().setProp(s.notes, k, undefined); }); G().invalidate(); showNotes = false; renderComments({}); return; }
      }
    };
  }
  function highlight() { const k = KEY(G().sel.r, G().sel.c); O.$$('.cm[data-k]', bd).forEach((c) => c.classList.toggle('on', +c.dataset.k === k)); }
})();
