/* Texte — volets et outils : navigation (titres, pages, résultats), styles, rechercher / remplacer, commentaires
   (volet et marge), révisions, publipostage, accessibilité ; règle (retraits, taquets, marges) ; modification des
   en-têtes / pieds et des notes ; images et objets ; mode lecture (pages côte à côte) ; lecture à voix haute. */
(function () {
  'use strict';
  const O = window.Office, TX = window.Texte, PM = window.PM;
  const A = window.TexteApp = window.TexteApp || {};
  const C = A.cmd = A.cmd || {};
  const X = TX.C, D = window.TexteDialogs = window.TexteDialogs || {};
  const $ = (s) => document.querySelector(s);
  const V = () => A.view();
  const { TextSelection, NodeSelection } = PM.state;
  const NT = TX.schema.nodes;
  const r2 = (v) => Math.round(v * 100) / 100;

  /* ================= positions, navigation ================= */
  /** Largeur du texte (pt) à l'endroit du curseur : section, en-tête, cellule */
  TX.contentWidthAt = function (view) {
    const s = view.state, $f = s.selection.$from;
    const pg = view === A.ed.view ? TX.pg(s.doc.child(Math.min($f.index(0), s.doc.childCount - 1))) : A.curPg();
    let w = pg.w - pg.ml - pg.mr - (pg.gut || 0);
    if ((pg.cols || {}).n > 1) w = (w - (pg.cols.n - 1) * (pg.cols.gap || 35.4)) / pg.cols.n;
    for (let d = $f.depth; d > 0; d--) { const n = $f.node(d); if (/table_(cell|header)/.test(n.type.name) && n.attrs.colwidth) { w = n.attrs.colwidth.reduce((a, b) => a + b, 0) * 0.75 - 10.8; break; } }
    return Math.max(36, w);
  };
  A.goTo = function (pos) {
    const v = A.ed.view; if (A.partEd) A.closePart(true);
    try { v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(Math.min(pos + 1, v.state.doc.content.size)))).scrollIntoView()); } catch (e) { }
    v.focus();
    setTimeout(() => { const c = v.coordsAtPos(v.state.selection.from); const sc = $('#docScroll'), r = sc.getBoundingClientRect(); if (c.top < r.top + 40 || c.top > r.bottom - 60) sc.scrollBy({ top: c.top - r.top - r.height / 3, behavior: 'smooth' }); }, 30);
  };
  A.followLink = function (href) {
    if (!href) return;
    if (href[0] === '#') { const name = href.replace(/^#(bk-)?/, ''); const doc = A.ed.view.state.doc; let pos = null; doc.descendants((n, p) => { if (pos == null && ((n.type.name === 'bookmark' && n.attrs.name === name) || (n.type.name === 'paragraph' && n.attrs.pid === name))) pos = p; return pos == null; }); if (pos != null) A.goTo(pos); else O.toast('Signet introuvable : ' + name, { bad: true }); return; }
    if (/^(https?:|mailto:|tel:)/i.test(href)) { if (window.MAGPC && window.MAGPC.nativeOpen) window.MAGPC.nativeOpen(href); else window.open(href, '_blank', 'noopener'); }
  };

  /* ================= volet de navigation (gauche) ================= */
  A.navTab = 'heads';
  A.toggleNav = () => { const n = $('#nav'); if (n.hidden) A.openNav(A.navTab); else { n.hidden = true; A.settings.nav = false; A.saveSettings(); A.relayout(); } A.refreshUi(); };
  A.openNav = function (tab) {
    const n = $('#nav'); A.navTab = tab || A.navTab; n.hidden = false; A.settings.nav = true; A.saveSettings();
    n.innerHTML = '<div class="pane-hd"><b>Navigation</b><button type="button" class="o-x" aria-label="Fermer">' + O.icon('x') + '</button></div><div class="find-row" style="padding:0 10px"><input type="search" id="navQ" placeholder="Rechercher dans le document" aria-label="Rechercher dans le document"></div><div class="pane-tabs"><button type="button" data-t="heads">Titres</button><button type="button" data-t="pages">Pages</button><button type="button" data-t="results">Résultats</button></div><div class="pane-bd" id="navBd"></div>';
    n.querySelector('.o-x').onclick = () => A.toggleNav();
    O.$$('[data-t]', n).forEach((b) => { b.classList.toggle('on', b.dataset.t === A.navTab); b.onclick = () => { A.navTab = b.dataset.t; O.$$('[data-t]', n).forEach((x) => x.classList.toggle('on', x === b)); A.navRefresh(); }; });
    const q = $('#navQ'); const fst = TX.findKey.getState(A.ed.view.state); if (fst.q && fst.q.text) q.value = fst.q.text;
    q.addEventListener('input', O.debounce(() => { A.find({ text: q.value }); if (q.value) { A.navTab = 'results'; O.$$('[data-t]', n).forEach((x) => x.classList.toggle('on', x.dataset.t === 'results')); } A.navRefresh(); }, 200));
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); A.findNext(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { q.value = ''; A.find(null); A.ed.view.focus(); } });
    if (tab === 'results') setTimeout(() => { q.focus(); q.select(); }, 30);
    A.navRefresh(); A.relayout();
  };
  A.navRefresh = O.debounce(function () {
    const bd = $('#navBd'); if (!bd || $('#nav').hidden) return;
    const st = TX.numKey.getState(A.ed.view.state);
    if (A.navTab === 'heads') {
      const cur = A.ed.view.state.selection.from; let on = -1; st.heads.forEach((h, i) => { if (h.pos <= cur) on = i; });
      bd.innerHTML = st.heads.length ? st.heads.map((h, i) => '<div class="nv-h l' + h.level + (i === on ? ' on' : '') + '" data-pos="' + h.pos + '" style="padding-left:' + (6 + (h.level - 1) * 14) + 'px" role="button" tabindex="0"><span>' + O.esc((h.label ? h.label + ' ' : '') + (h.text || '(titre vide)')) + '</span></div>').join('') : '<p class="o-hint">Aucun titre. Appliquez les styles « Titre 1 », « Titre 2 »… (Accueil › Styles) pour structurer le document : la navigation, la table des matières et les signets du PDF les utilisent.</p>';
    } else if (A.navTab === 'pages') {
      const L = A.layout; const vp = L.visiblePage();
      bd.innerHTML = L.mode === 'page' ? L.pages.map((p, i) => { const h = st.heads.filter((x) => x.pos >= p.startPos && (!L.pages[i + 1] || x.pos < L.pages[i + 1].startPos))[0]; return '<div class="nv-pg' + (i === vp ? ' on' : '') + '" data-page="' + i + '" role="button" tabindex="0"><i>' + O.esc(p.label) + '</i><span>' + O.esc(h ? h.text : 'Page ' + (i + 1)) + '</span></div>'; }).join('') : '<p class="o-hint">Passez en mode Page pour voir les pages.</p>';
    } else {
      const fst = TX.findKey.getState(A.ed.view.state);
      if (!fst.q || !fst.q.text) { bd.innerHTML = '<p class="o-hint">Tapez un mot à rechercher.</p>'; return; }
      const doc = A.ed.view.state.doc;
      bd.innerHTML = '<p class="find-res">' + fst.matches.length + ' résultat(s)</p>' + fst.matches.slice(0, 300).map((m, i) => { const $p = doc.resolve(m.from), t = $p.parent.textContent, o = $p.parentOffset; const a = Math.max(0, o - 30), b = Math.min(t.length, o + m.text.length + 40); return '<div class="nv-res' + (i === fst.cur ? ' on' : '') + '" data-i="' + i + '">' + (a > 0 ? '…' : '') + O.esc(t.slice(a, o)) + '<b>' + O.esc(t.slice(o, o + m.text.length)) + '</b>' + O.esc(t.slice(o + m.text.length, b)) + (b < t.length ? '…' : '') + '</div>'; }).join('');
    }
    bd.onclick = (e) => {
      const h = e.target.closest('[data-pos]'); if (h) { A.goTo(+h.dataset.pos); return; }
      const p = e.target.closest('[data-page]'); if (p) { A.layout.scrollToPage(+p.dataset.page); return; }
      const r = e.target.closest('[data-i]'); if (r) A.findGo(+r.dataset.i);
    };
  }, 150);

  /* ================= recherche ================= */
  A.find = function (q, near) {
    const v = A.ed.view;
    if (!q || (!q.text && !q.fmt)) { v.dispatch(v.state.tr.setMeta(TX.findKey, { clear: true }).setMeta('addToHistory', false).setMeta('tx-layout', 1)); return 0; }
    v.dispatch(v.state.tr.setMeta(TX.findKey, { q, near: near != null ? near : v.state.selection.from }).setMeta('addToHistory', false).setMeta('tx-layout', 1));
    return TX.findKey.getState(v.state).matches.length;
  };
  A.findGo = function (i) {
    const v = A.ed.view, st = TX.findKey.getState(v.state); const m = st.matches[i]; if (!m) return;
    v.dispatch(v.state.tr.setMeta(TX.findKey, { q: st.q, cur: i }).setSelection(TextSelection.create(v.state.doc, m.from, m.to)).scrollIntoView().setMeta('tx-layout', 1));
    A.navRefresh(); A.paneRefresh();
  };
  A.findNext = function (dir) {
    const st = TX.findKey.getState(A.ed.view.state); if (!st.matches.length) { O.toast('Aucun résultat'); return false; }
    let i = st.cur + (dir || 1); if (i >= st.matches.length) i = 0; if (i < 0) i = st.matches.length - 1;
    A.findGo(i); return true;
  };

  /* ================= volets (droite) ================= */
  A.pane = null;
  A.openPane = function (name, opt) {
    const p = $('#pane');
    if (!name || (A.pane === name && !opt)) { p.hidden = true; A.pane = null; A.relayout(); A.refreshUi(); return; }
    A.pane = name; A.paneOpt = opt || {}; p.hidden = false;
    renderPane(); A.relayout(); A.refreshUi();
  };
  A.paneRefresh = O.debounce(() => { if (A.pane && !$('#pane').hidden && !($('#pane').contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) renderPane(); }, 250);
  function paneShell(title, body) {
    const p = $('#pane');
    p.innerHTML = '<div class="pane-hd"><b>' + O.esc(title) + '</b><button type="button" class="o-x" aria-label="Fermer">' + O.icon('x') + '</button></div><div class="pane-bd">' + body + '</div>';
    p.querySelector('.o-x').onclick = () => A.openPane(null);
    return p.querySelector('.pane-bd');
  }
  function renderPane() {
    const n = A.pane;
    if (n === 'styles') return stylesPane();
    if (n === 'find') return findPane();
    if (n === 'comments') return commentsPane();
    if (n === 'revisions') return revisionsPane();
    if (n === 'merge') return mergePane();
    if (n === 'a11y') return a11yPane();
  }
  /* ---- styles ---- */
  function stylesPane() {
    const at = A.attrs(), st = at.styles || {}, cur = TX.fmtState(V().state, at);
    const theme = A.theme();
    const ids = Object.keys(st).sort((a, b) => (st[b].q ? 1 : 0) - (st[a].q ? 1 : 0) || String(st[a].n).localeCompare(st[b].n, 'fr'));
    const show = A.paneOpt.all ? ids : ids.filter((id) => st[id].q || id === cur.style);
    const bd = paneShell('Styles', '<p style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn" data-a="new">' + O.icon('plus') + 'Nouveau style</button><button type="button" class="mini-btn" data-a="clear">' + O.icon('remove-formatting') + 'Effacer la mise en forme</button><button type="button" class="mini-btn' + (A.paneOpt.all ? ' on' : '') + '" data-a="all">' + O.icon('list') + 'Tous les styles</button></p><div class="st-list">' + show.map((id) => {
      const R = TX.resolveStyle(st, id), r = R.r;
      const css = 'font-family:' + O.fontStack(r.f === '+major' ? theme.fonts.major : r.f === '+minor' ? theme.fonts.minor : (r.f || theme.fonts.minor)).replace(/"/g, "'") + ';font-size:' + Math.min(18, Math.max(11, (r.sz || 11) * 1.05)) + 'px;' + (r.b ? 'font-weight:700;' : '') + (r.i ? 'font-style:italic;' : '') + (r.c ? 'color:' + (O.Themes.resolve(r.c, theme) || r.c) + ';' : '') + (r.caps ? 'text-transform:uppercase;' : '');
      return '<div class="st-it' + (id === cur.style || id === cur.cstyle ? ' on' : '') + '" data-id="' + O.esc(id) + '" role="button" tabindex="0"><span class="pv" style="' + css + '">' + O.esc(st[id].n) + '</span><span class="k">' + (st[id].t === 'c' ? 'a' : '¶') + '</span><button type="button" data-edit="' + O.esc(id) + '" title="Modifier le style">' + O.icon('square-pen') + '</button></div>';
    }).join('') + '</div><p class="o-hint">Cliquez pour appliquer. ¶ : style de paragraphe ; a : style de caractère. Modifier un style change tous les paragraphes qui l\'utilisent.</p>');
    bd.onclick = (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) { D.editStyle(ed.dataset.edit); return; }
      const a = e.target.closest('[data-a]'); if (a) { if (a.dataset.a === 'new') D.newStyle(); else if (a.dataset.a === 'clear') X.clearAll(V()); else { A.paneOpt.all = !A.paneOpt.all; stylesPane(); } return; }
      const it = e.target.closest('[data-id]'); if (it) { X.setStyle(V(), it.dataset.id); stylesPane(); }
    };
  }
  /* ---- rechercher / remplacer ---- */
  function findPane() {
    const fst = TX.findKey.getState(A.ed.view.state), q = fst.q || {};
    const bd = paneShell('Rechercher et remplacer', '<label class="o-field"><span>Rechercher</span><input class="o-in" id="fQ" value="' + O.esc(q.text || '') + '"></label><div class="find-opts"><label><input type="checkbox" id="fCs"' + (q.cs ? ' checked' : '') + '>Respecter la casse</label><label><input type="checkbox" id="fW"' + (q.whole ? ' checked' : '') + '>Mot entier</label><label><input type="checkbox" id="fRe"' + (q.regex ? ' checked' : '') + '>Expression régulière</label></div><details class="fp-sec"' + (q.fmt ? ' open' : '') + '><summary>Mise en forme recherchée</summary><div class="find-opts"><label><input type="checkbox" id="fB"' + (q.fmt && q.fmt.b ? ' checked' : '') + '>Gras</label><label><input type="checkbox" id="fI"' + (q.fmt && q.fmt.i ? ' checked' : '') + '>Italique</label><label><input type="checkbox" id="fU"' + (q.fmt && q.fmt.u ? ' checked' : '') + '>Souligné</label><label><input type="checkbox" id="fH"' + (q.fmt && q.fmt.hl ? ' checked' : '') + '>Surligné</label></div><label class="o-field"><span>Style de paragraphe</span><select class="o-in" id="fSt"><option value="">(tous)</option>' + Object.keys(A.attrs().styles || {}).filter((k) => A.attrs().styles[k].t !== 'c').map((k) => '<option value="' + O.esc(k) + '"' + (q.fmt && q.fmt.style === k ? ' selected' : '') + '>' + O.esc(A.attrs().styles[k].n) + '</option>').join('') + '</select></label></details><p class="find-res" id="fRes">' + (fst.q ? fst.matches.length + ' résultat(s)' : '') + '</p><p style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn" data-a="prev">' + O.icon('chevron-up') + 'Précédent</button><button type="button" class="mini-btn pri" data-a="next">' + O.icon('chevron-down') + 'Suivant</button></p>' +
      '<label class="o-field" style="margin-top:12px"><span>Remplacer par</span><input class="o-in" id="fR" value="' + O.esc(A._repl || '') + '"></label><div class="find-opts"><label><input type="checkbox" id="fRB">en gras</label><label><input type="checkbox" id="fRI">en italique</label><label><input type="checkbox" id="fRH">surligné</label></div><p class="o-hint" id="fReHint"' + (q.regex ? '' : ' hidden') + '>Expression régulière : $1, $2… reprennent les groupes entre parenthèses.</p><p style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn" data-a="one">' + O.icon('replace') + 'Remplacer</button><button type="button" class="mini-btn" data-a="all">' + O.icon('replace-all') + 'Remplacer tout</button></p><p class="o-hint">Le remplacement suit le suivi des modifications s\'il est activé.</p>');
    const get = () => { const fmt = { b: $('#fB').checked, i: $('#fI').checked, u: $('#fU').checked, hl: $('#fH').checked, style: $('#fSt').value || null }; const hasFmt = fmt.b || fmt.i || fmt.u || fmt.hl || fmt.style; return { text: $('#fQ').value, cs: $('#fCs').checked, whole: $('#fW').checked, regex: $('#fRe').checked, fmt: hasFmt ? fmt : null }; };
    const upd = () => { const q2 = get(); let ok = true; if (q2.regex) { try { new RegExp(q2.text); } catch (e) { ok = false; } } $('#fReHint').hidden = !q2.regex; if (!ok) { $('#fRes').textContent = 'Expression régulière incorrecte'; return; } const n = A.find(q2); $('#fRes').textContent = n + ' résultat(s)'; A.navRefresh(); };
    O.$$('input,select', bd).forEach((i) => { if (i.id === 'fR' || /^fR[BIH]$/.test(i.id)) return; i.addEventListener(i.type === 'checkbox' || i.tagName === 'SELECT' ? 'change' : 'input', O.debounce(upd, 150)); });
    $('#fQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); A.findNext(e.shiftKey ? -1 : 1); } });
    bd.onclick = (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return; const k = a.dataset.a;
      A._repl = $('#fR').value;
      const rf = { b: $('#fRB').checked, i: $('#fRI').checked, hl: $('#fRH').checked ? 'yellow' : null }; const hasRf = rf.b || rf.i || rf.hl;
      if (k === 'next' || k === 'prev') { upd(); A.findNext(k === 'next' ? 1 : -1); }
      if (k === 'one') {
        const v = A.ed.view, st = TX.findKey.getState(v.state); const m = st.matches[st.cur];
        if (!m || v.state.selection.from !== m.from || v.state.selection.to !== m.to) { upd(); A.findNext(1); return; }
        let r = A._repl; if (get().regex) r = r.replace(/\$(\d)/g, (x, d) => m.groups[+d - 1] || '');
        const marks = v.state.doc.resolve(m.from).marksAcross(v.state.doc.resolve(m.to)) || [];
        const tr = r ? v.state.tr.replaceWith(m.from, m.to, TX.schema.text(r, hasRf ? TX.marksWith(marks, rf) : marks)) : v.state.tr.delete(m.from, m.to);
        v.dispatch(tr.setMeta('tx-label', 'Remplacer')); upd(); A.findNext(1);
      }
      if (k === 'all') { const q2 = Object.assign(get(), { replFmt: hasRf ? rf : null }); const n = TX.replaceAll(A.ed.view, q2, A._repl); O.toast(n + ' remplacement(s)'); upd(); }
    };
    setTimeout(() => { const i = A.paneOpt.replace ? $('#fR') : $('#fQ'); if (i && !O.touch()) { i.focus(); i.select(); } }, 30);
    if (!fst.q && A.ed.view.state.selection.empty === false) { const t = A.ed.view.state.doc.textBetween(A.ed.view.state.selection.from, A.ed.view.state.selection.to, ' '); if (t.length < 80) { $('#fQ').value = t; upd(); } }
  }
  /* ---- commentaires ---- */
  const avatarColor = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return 'hsl(' + h + ',55%,42%)'; };
  const initials = (n) => String(n || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  /** Commentaires racines avec leurs réponses, dans l'ordre du texte */
  A.commentList = function () {
    const cm = A.attrs().comments || {}, doc = A.ed.view.state.doc, pos = {}, text = {};
    doc.descendants((n, p) => { if (n.isInline) n.marks.forEach((m) => { if (m.type.name === 'cmt' && cm[m.attrs.id]) { if (pos[m.attrs.id] == null) pos[m.attrs.id] = p; text[m.attrs.id] = (text[m.attrs.id] || '') + (n.isText ? n.text : ''); } }); return true; });
    const roots = Object.keys(cm).filter((id) => !cm[id].p && pos[id] != null).sort((a, b) => pos[a] - pos[b]);
    return roots.map((id) => ({ id, c: cm[id], pos: pos[id], quote: text[id] || '', replies: Object.keys(cm).filter((r) => cm[r].p === id).sort((a, b) => String(cm[a].d).localeCompare(cm[b].d)).map((r) => ({ id: r, c: cm[r] })) }));
  };
  function cmHtml(x, card) {
    const who = (c) => '<div class="who"><span class="av" style="background:' + avatarColor(c.a) + '">' + O.esc(initials(c.a)) + '</span>' + O.esc(c.a || 'Auteur') + '<small>' + O.esc(c.d ? O.ago(new Date(c.d).getTime()) : '') + '</small></div>';
    const editing = A._cmEdit === x.id;
    return '<div class="' + (card ? 'cm-card' : 'cm') + (x.c.done ? ' done' : '') + (A.activeComment === x.id ? ' on' : '') + '" data-cm="' + x.id + '">' + who(x.c) + (card ? '' : '<q>' + O.esc(x.quote) + '</q>') + (editing ? '<textarea data-edit="' + x.id + '">' + O.esc(x.c.t || '') + '</textarea>' : '<p>' + (O.esc(x.c.t || '') || '<i style="opacity:.6">(vide)</i>') + '</p>') +
      x.replies.map((r) => '<div class="rep">' + who(r.c) + '<p>' + O.esc(r.c.t || '') + '</p></div>').join('') +
      (A._cmReply === x.id ? '<textarea data-reply="' + x.id + '" placeholder="Répondre…"></textarea>' : '') +
      '<div class="acts">' + (editing || A._cmReply === x.id ? '<button type="button" class="pri" data-ca="ok:' + x.id + '">OK</button><button type="button" data-ca="cancel:' + x.id + '">Annuler</button>' : '<button type="button" data-ca="reply:' + x.id + '">Répondre</button><button type="button" data-ca="edit:' + x.id + '">Modifier</button><button type="button" data-ca="done:' + x.id + '">' + (x.c.done ? 'Rouvrir' : 'Résolu') + '</button><button type="button" data-ca="del:' + x.id + '">Supprimer</button>') + '</div></div>';
  }
  function commentsPane() {
    const l = A.commentList();
    const bd = paneShell('Commentaires', '<p><button type="button" class="mini-btn pri" data-ca="new">' + O.icon('message-square-plus') + 'Nouveau commentaire</button></p>' + (l.length ? l.map((x) => cmHtml(x, false)).join('') : '<p class="o-hint">Aucun commentaire. Sélectionnez du texte puis « Nouveau commentaire » (Ctrl+Alt+M).</p>'));
    bd.onclick = cmClick; bd.addEventListener('click', (e) => { const c = e.target.closest('[data-cm]'); if (c && !e.target.closest('button,textarea')) { const x = l.find((y) => y.id === c.dataset.cm); if (x) { A.activeComment = x.id; A.goTo(x.pos); setActive(x.id); } } });
    focusCmText(bd);
  }
  function focusCmText(root) { const t = root.querySelector('textarea'); if (t) setTimeout(() => { t.focus(); t.selectionStart = t.value.length; }, 30); }
  function setActive(id) { A.activeComment = id; const v = A.ed.view; v.dispatch(v.state.tr.setMeta(TX.cmtKey, { active: id }).setMeta('addToHistory', false).setMeta('tx-layout', 1)); O.$$('[data-cm]').forEach((e) => e.classList.toggle('on', e.dataset.cm === id)); }
  function setComment(id, patch, label) { const cm = Object.assign({}, A.attrs().comments || {}); if (patch === null) delete cm[id]; else cm[id] = Object.assign({}, cm[id], patch); A.setAttr('comments', cm, label || 'Commentaire'); }
  function cmClick(e) {
    const b = e.target.closest('[data-ca]'); if (!b) return; e.stopPropagation();
    const [k, id] = b.dataset.ca.split(':');
    if (k === 'new') { C.addComment(); return; }
    if (k === 'reply') { A._cmReply = id; A._cmEdit = null; rerender(); return; }
    if (k === 'edit') { A._cmEdit = id; A._cmReply = null; rerender(); return; }
    if (k === 'cancel') { const c = (A.attrs().comments || {})[id]; if (A._cmEdit === id && c && !c.t && A._cmNew === id) C.deleteComment(id); A._cmEdit = null; A._cmReply = null; rerender(); return; }
    if (k === 'ok') {
      const root = b.closest('[data-cm]');
      const ta = root.querySelector('textarea'); const val = ta ? ta.value.trim() : '';
      if (A._cmReply === id) { if (val) { const rid = TX.uid('k'); const cm = Object.assign({}, A.attrs().comments); cm[rid] = { a: TX.userName() || 'Auteur', d: new Date().toISOString(), t: val, p: id }; A.setAttr('comments', cm, 'Réponse'); } }
      else if (A._cmEdit === id) setComment(id, { t: val }, 'Commentaire');
      A._cmEdit = null; A._cmReply = null; A._cmNew = null; rerender(); return;
    }
    if (k === 'done') { const c = (A.attrs().comments || {})[id]; setComment(id, { done: !(c && c.done) }, 'Commentaire résolu'); setTimeout(rerender, 0); return; }
    if (k === 'del') { C.deleteComment(id); return; }
  }
  function rerender() { if (A.pane === 'comments') commentsPane(); A.renderComments(); }
  C.addComment = function () {
    if (A.partEd) { O.toast('Les commentaires se placent dans le corps du document', { bad: true }); return; }
    const id = X.comment(A.ed.view, ''); if (!id) return;
    A._cmEdit = id; A._cmNew = id; A.activeComment = id;
    if (O.narrow() || A.settings.view !== 'page' || A.settings.cmts === false) A.openPane('comments'); else setTimeout(() => { A.renderComments(); }, 50);
  };
  C.deleteComment = function (id) {
    if (!id) { O.toast('Placez le curseur dans un commentaire'); return; }
    const v = A.ed.view, tr = v.state.tr, cm = Object.assign({}, A.attrs().comments || {});
    const ids = [id].concat(Object.keys(cm).filter((k) => cm[k].p === id));
    v.state.doc.descendants((n, p) => { if (n.isInline) n.marks.forEach((m) => { if (m.type.name === 'cmt' && ids.indexOf(m.attrs.id) >= 0) tr.removeMark(p, p + n.nodeSize, m); }); return true; });
    ids.forEach((k) => delete cm[k]); tr.setDocAttribute('comments', cm).setMeta('notrack', true).setMeta('tx-label', 'Supprimer le commentaire');
    v.dispatch(tr); A.activeComment = null; rerender();
  };
  C.deleteAllComments = function () {
    const v = A.ed.view, tr = v.state.tr; tr.removeMark(0, v.state.doc.content.size, TX.schema.marks.cmt); tr.setDocAttribute('comments', {}).setMeta('notrack', true).setMeta('tx-label', 'Supprimer les commentaires'); v.dispatch(tr); rerender();
  };
  C.nextComment = function (dir) {
    const l = A.commentList(); if (!l.length) { O.toast('Aucun commentaire'); return; }
    const cur = A.ed.view.state.selection.from;
    let x = dir > 0 ? l.find((c) => c.pos > cur) || l[0] : l.slice().reverse().find((c) => c.pos < cur) || l[l.length - 1];
    A.goTo(x.pos); setActive(x.id); A.renderComments();
  };
  A.syncComment = function () {
    const $f = A.ed.view.state.selection.$from; const m = ($f.marks() || []).find((x) => x.type.name === 'cmt') || ($f.nodeAfter && $f.nodeAfter.marks.find((x) => x.type.name === 'cmt'));
    const id = m ? m.attrs.id : null;
    if (id !== A.activeComment && (id || A.activeComment)) { if (id) { const root = (A.attrs().comments || {})[id]; setActive(root && root.p ? root.p : id); } else setActive(null); }
  };
  /** Commentaires dans la marge droite (mode Page, grand écran) */
  A.renderComments = function (quick) {
    const paper = $('#paper'), col = paper.querySelector('.tx-cmts');
    const show = A.settings.cmts !== false && A.settings.view === 'page' && !O.narrow() && Object.keys(A.attrs().comments || {}).length > 0;
    if (show !== paper.classList.contains('cmts-on')) { paper.classList.toggle('cmts-on', show); if (!quick) { A.relayout(); return; } }
    if (!show) { col.innerHTML = ''; return; }
    const l = A.commentList(); const v = A.ed.view, pr = paper.getBoundingClientRect(), s = A.layout.scale || 1;
    let y = 0; let h = '';
    const items = l.map((x) => { let top = 0; try { top = (v.coordsAtPos(x.pos + 1).top - pr.top) / s; } catch (e) { } return { x, top }; });
    col.innerHTML = items.map((it) => cmHtml(it.x, true)).join('');
    O.$$('.cm-card', col).forEach((card, i) => { const want = items[i].top - 6; const t = Math.max(want, y); card.style.top = t + 'px'; y = t + card.offsetHeight + 8; });
    col.onclick = cmClick; col.addEventListener('click', (e) => { const c = e.target.closest('[data-cm]'); if (c && !e.target.closest('button,textarea')) { const x = l.find((z) => z.id === c.dataset.cm); if (x) { A.goTo(x.pos); setActive(x.id); } } });
    focusCmText(col); void h;
  };

  /* ---- révisions ---- */
  function revisionsPane() {
    const revs = TX.revisions(A.ed.view.state.doc);
    const bd = paneShell('Révisions', '<p style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn pri" data-ra="accall">' + O.icon('check-check') + 'Tout accepter</button><button type="button" class="mini-btn" data-ra="rejall">' + O.icon('x') + 'Tout refuser</button></p><p class="find-res">' + revs.length + ' révision(s) : ' + revs.filter((r) => r.kind === 'ins').length + ' insertion(s), ' + revs.filter((r) => r.kind === 'del').length + ' suppression(s)</p>' + revs.map((r, i) => '<div class="rv-it" data-ri="' + i + '"><span class="k ' + r.kind + '">' + (r.kind === 'ins' ? 'Insertion' : 'Suppression') + '</span> · ' + O.esc(r.a || '') + ' <small class="o-hint">' + O.esc(r.d ? O.ago(new Date(r.d).getTime()) : '') + '</small><q>' + O.esc(r.text) + '</q><div class="acts"><button type="button" class="mini-btn" data-ra="acc:' + i + '">' + O.icon('check') + 'Accepter</button><button type="button" class="mini-btn" data-ra="rej:' + i + '">' + O.icon('x') + 'Refuser</button></div></div>').join(''));
    bd.onclick = (e) => {
      const b = e.target.closest('[data-ra]'); const v = A.ed.view;
      if (b) { const [k, i] = b.dataset.ra.split(':'); if (k === 'accall' || k === 'rejall') v.dispatch(TX.resolveRevisions(v.state, revs, k === 'accall').setMeta('tx-label', k === 'accall' ? 'Tout accepter' : 'Tout refuser')); else v.dispatch(TX.resolveRevisions(v.state, [revs[+i]], k === 'acc').setMeta('tx-label', 'Révision')); setTimeout(revisionsPane, 0); return; }
      const it = e.target.closest('[data-ri]'); if (it) { const r = revs[+it.dataset.ri]; v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, r.from, r.to)).scrollIntoView()); v.focus(); }
    };
  }
  C.revAccept = function (accept, all, stay) {
    const v = A.ed.view, revs = TX.revisions(v.state.doc); if (!revs.length) { O.toast('Aucune révision dans le document'); return; }
    let target = all ? revs : revs.filter((r) => r.from <= v.state.selection.to && r.to >= v.state.selection.from);
    if (!target.length) { C.nextRev(1); return; }
    // une révision « mot » peut être découpée : on prend toutes celles de même identifiant
    if (!all) { const ids = new Set(target.map((r) => r.id)); target = revs.filter((r) => ids.has(r.id)); }
    v.dispatch(TX.resolveRevisions(v.state, target, accept).setMeta('tx-label', accept ? 'Accepter' : 'Refuser'));
    if (!all && !stay) C.nextRev(1, true);
    A.paneRefresh();
  };
  C.nextRev = function (dir, quiet) {
    const v = A.ed.view, revs = TX.revisions(v.state.doc); if (!revs.length) { if (!quiet) O.toast('Aucune révision'); return; }
    const cur = dir > 0 ? v.state.selection.to : v.state.selection.from;
    const r = dir > 0 ? revs.find((x) => x.from >= cur) || revs[0] : revs.slice().reverse().find((x) => x.to <= cur) || revs[revs.length - 1];
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, r.from, r.to)).scrollIntoView()); v.focus();
  };
  /* ---- publipostage ---- */
  function mergePane() {
    const m = A.merge && A.merge.data;
    let body = '<p class="o-hint">Créez des documents personnalisés (attestations, convocations, courriers) à partir d\'une liste : un fichier CSV (tableur, export d\'une liste de stagiaires) dont la première ligne contient les noms des colonnes.</p><p style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="mini-btn pri" data-m="csv">' + O.icon('file-input') + 'Choisir un fichier CSV</button><button type="button" class="mini-btn" data-m="newlist">' + O.icon('user-round-plus') + 'Saisir une liste</button>' + (m ? '<button type="button" class="mini-btn" data-m="edit">' + O.icon('square-pen') + 'Modifier la liste</button>' : '<button type="button" class="mini-btn" data-m="sample">' + O.icon('graduation-cap') + 'Exemple</button>') + '</p>';
    if (m) {
      body += '<div class="dlg-sec">Champs (cliquer pour insérer)</div><div class="fld-list">' + m.cols.map((c) => '<button type="button" data-f="' + O.esc(c) + '">«' + O.esc(c) + '»</button>').join('') + '</div>';
      body += '<div class="dlg-sec">Destinataires (' + m.rows.length + ')</div><div style="max-height:220px;overflow:auto"><table class="mg-tbl"><tr><th>#</th>' + m.cols.slice(0, 4).map((c) => '<th>' + O.esc(c) + '</th>').join('') + '</tr>' + m.rows.map((r, i) => '<tr data-r="' + i + '" class="' + (A.merge.preview === i ? 'on' : '') + '" style="cursor:pointer"><td>' + (i + 1) + '</td>' + m.cols.slice(0, 4).map((c) => '<td>' + O.esc(r[c] == null ? '' : r[c]) + '</td>').join('') + '</tr>').join('') + '</table></div>';
      body += '<div class="dlg-sec">Aperçu</div><p style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><button type="button" class="mini-btn' + (A.merge.preview != null ? ' on' : '') + '" data-m="pv">' + O.icon('eye') + 'Aperçu des résultats</button><button type="button" class="mini-btn" data-m="prev" aria-label="Précédent">' + O.icon('chevron-left') + '</button><span>' + (A.merge.preview != null ? (A.merge.preview + 1) + ' / ' + m.rows.length : '—') + '</span><button type="button" class="mini-btn" data-m="next" aria-label="Suivant">' + O.icon('chevron-right') + '</button></p>';
      body += '<div class="dlg-sec">Terminer</div><p style="display:flex;flex-direction:column;gap:6px;align-items:flex-start"><button type="button" class="mini-btn pri" data-m="run:pdf">' + O.icon('file-badge') + 'Un seul PDF pour tous (impression)</button><button type="button" class="mini-btn" data-m="run:doc">' + O.icon('file-text') + 'Un seul document modifiable</button><button type="button" class="mini-btn" data-m="run:pdfs">' + O.icon('files') + 'Un PDF par destinataire (zip)</button><button type="button" class="mini-btn" data-m="run:docxs">' + O.icon('files') + 'Un .docx par destinataire (zip)</button></p><label class="o-field"><span>Nom des fichiers (champs entre accolades)</span><input class="o-in" id="mgName" value="' + O.esc(A.merge.nameTpl || ('{' + (m.cols.find((c) => /^nom$/i.test(c)) || m.cols[0]) + '}')) + '"></label>';
    }
    const bd = paneShell('Publipostage', body);
    bd.onclick = (e) => {
      const f = e.target.closest('[data-f]'); if (f) { X.insertNode(A.ed.view, NT.field.create({ f: 'merge', name: f.dataset.f })); return; }
      const r = e.target.closest('[data-r]'); if (r) { C.mergePreview(+r.dataset.r); return; }
      const b = e.target.closest('[data-m]'); if (!b) return; const k = b.dataset.m;
      if (k === 'csv') C.mergeImport(); if (k === 'newlist') C.mergeNewList(); if (k === 'edit') C.mergeEdit(); if (k === 'sample') C.mergeSample();
      if (k === 'pv') C.mergePreview(A.merge.preview == null ? 0 : null); if (k === 'prev') C.mergePreview(Math.max(0, (A.merge.preview || 0) - 1)); if (k === 'next') C.mergePreview(Math.min(m.rows.length - 1, (A.merge.preview == null ? -1 : A.merge.preview) + 1));
      if (k.startsWith('run:')) { A.merge.nameTpl = $('#mgName').value; C.mergeRun(k.slice(4)); }
    };
  }
  /* ---- accessibilité ---- */
  A.a11yIssues = function () {
    const out = [], doc = A.ed.view.state.doc, st = TX.numKey.getState(A.ed.view.state);
    doc.descendants((n, p) => {
      if ((n.type.name === 'image' || (n.type.name === 'drawing' && n.attrs.kind !== 'shape' && n.attrs.kind !== 'textbox')) && !n.attrs.alt && !n.attrs.dec) out.push({ pos: p, msg: (n.type.name === 'image' ? 'Image' : 'Objet') + ' sans texte de remplacement', fix: 'alt' });
      if (n.type.name === 'table') { const f = n.firstChild; if (f && !f.attrs.hdr && !(n.attrs.look || {}).hdr) out.push({ pos: p, msg: 'Tableau sans ligne d\'en-tête', fix: 'hdr' }); let merged = false; n.descendants((c) => { if (c.attrs && (c.attrs.colspan > 1 || c.attrs.rowspan > 1)) merged = true; return true; }); if (merged) out.push({ pos: p, msg: 'Tableau avec cellules fusionnées (lecture difficile pour un lecteur d\'écran)' }); }
      if (n.type.name === 'paragraph') { const t = n.textContent; if (/^\s*$/.test(t) && n.childCount === 0) { /* paragraphes vides : mise en page par retours répétés */ } }
      return true;
    });
    let prev = 0; st.heads.forEach((h) => { if (h.level > prev + 1) out.push({ pos: h.pos, msg: 'Niveau de titre sauté (Titre ' + h.level + ' après Titre ' + (prev || '—') + ')' }); prev = h.level; });
    if (!st.heads.length && doc.textContent.length > 1500) out.push({ pos: 0, msg: 'Document long sans titres (styles Titre 1, Titre 2…) : la navigation est difficile' });
    let empties = 0; doc.descendants((n) => { if (n.type.name === 'paragraph' && !n.content.size) empties++; return n.type.name !== 'paragraph'; }); if (empties > 12) out.push({ pos: 0, msg: empties + ' paragraphes vides : utilisez l\'espacement des paragraphes ou des sauts de page' });
    if (!(A.attrs().props || {}).title) out.push({ pos: 0, msg: 'Titre du document non renseigné (Fichier › Informations)', fix: 'title' });
    return out;
  };
  function a11yPane() {
    const l = A.a11yIssues();
    const bd = paneShell('Accessibilité', l.length ? '<p class="find-res">' + l.length + ' point(s) à vérifier</p>' + l.map((x, i) => '<div class="a11y-it ko" data-i="' + i + '">' + O.icon('triangle-alert') + '<span>' + O.esc(x.msg) + (x.fix === 'alt' ? '<br><small class="o-hint">Cliquer pour saisir le texte de remplacement</small>' : '') + '</span></div>').join('') : '<div class="a11y-it ok">' + O.icon('circle-check') + '<span>Aucun problème détecté. Titres structurés, images décrites, tableaux avec en-têtes.</span></div>');
    bd.onclick = (e) => { const it = e.target.closest('[data-i]'); if (!it) return; const x = l[+it.dataset.i]; if (x.fix === 'title') { A.openBackstage('info'); return; } const v = A.ed.view; if (x.fix === 'alt' || x.fix === 'hdr') { v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, x.pos)).scrollIntoView()); v.focus(); if (x.fix === 'alt') D.altText(() => a11yPane()); else { X.setRows(v, { hdr: true }); X.setTable(v, (a) => ({ look: Object.assign({}, a.look, { hdr: true }) })); a11yPane(); } return; } A.goTo(x.pos); };
  }
  C.inspect = async function () {
    const r = await O.form('Inspecter le document', [{ type: 'html', html: '<p>Retirer du document avant de le partager :</p>' }, { id: 'cm', type: 'check', label: 'Les commentaires', value: true }, { id: 'rv', type: 'check', label: 'Les révisions (elles sont acceptées)', value: true }, { id: 'pr', type: 'check', label: 'L\'auteur et les propriétés', value: false }, { id: 'hid', type: 'check', label: 'Le texte masqué', value: false }], { ok: 'Retirer' });
    if (!r) return;
    const v = A.ed.view;
    if (r.rv) v.dispatch(TX.resolveRevisions(v.state, TX.revisions(v.state.doc), true));
    if (r.cm) C.deleteAllComments();
    if (r.pr) A.setAttr('props', Object.assign({}, A.attrs().props, { author: '', subject: '', keywords: '' }));
    if (r.hid) { const tr = v.state.tr; const rs = []; v.state.doc.descendants((n, p) => { if (n.isText && n.marks.some((m) => m.type.name === 'hidden')) rs.push([p, p + n.nodeSize]); return true; }); rs.reverse().forEach(([a, b]) => tr.delete(a, b)); v.dispatch(tr.setMeta('notrack', true)); }
    O.toast('Document nettoyé');
  };

  /* ================= règle ================= */
  let tabKind = 'left';
  const TABK = ['left', 'center', 'right', 'decimal'];
  const TABSVG = { left: '<svg viewBox="0 0 10 10"><path d="M2 1v8h7" fill="none" stroke="currentColor" stroke-width="2"/></svg>', center: '<svg viewBox="0 0 10 10"><path d="M5 1v8M1 9h8" fill="none" stroke="currentColor" stroke-width="2"/></svg>', right: '<svg viewBox="0 0 10 10"><path d="M8 1v8H1" fill="none" stroke="currentColor" stroke-width="2"/></svg>', decimal: '<svg viewBox="0 0 10 10"><path d="M5 1v8M1 9h8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="5" r="1.2"/></svg>' };
  A.renderRuler = O.raf(function () {
    const host = $('#rulerH'); if (!host || A.settings.ruler === false || A.settings.view !== 'page' || !A.layout.pages.length) return;
    const corner = $('#rulerCorner'); corner.innerHTML = TABSVG[tabKind]; corner.title = 'Tabulation : ' + { left: 'gauche', center: 'centrée', right: 'droite', decimal: 'décimale' }[tabKind] + ' (cliquer pour changer)';
    corner.onclick = () => { tabKind = TABK[(TABK.indexOf(tabKind) + 1) % 4]; A.renderRuler(); };
    const L = A.layout, s = L.scale, v = A.view();
    const si = A.partEd ? A.partEd.si : Math.min(v.state.selection.$from.index(0), A.ed.view.state.doc.childCount - 1);
    const pg = TX.pg(A.ed.view.state.doc.child(Math.min(si, A.ed.view.state.doc.childCount - 1)));
    const page = L.pages.find((p) => p.si === si) || L.pages[0];
    const hr = host.getBoundingClientRect(), pr = $('#paper').getBoundingClientRect();
    const x0 = pr.left - hr.left + page.left * s; const P = (pt) => x0 + (pt * TX.PX) * s;
    const ml = pg.ml + (pg.gut || 0), cw = pg.w - ml - pg.mr;
    let h = '<div class="rl-page" style="left:' + x0 + 'px;width:' + pg.w * TX.PX * s + 'px"></div><div class="rl-marg" style="left:' + x0 + 'px;width:' + ml * TX.PX * s + 'px"></div><div class="rl-marg" style="left:' + P(pg.w - pg.mr) + 'px;width:' + pg.mr * TX.PX * s + 'px"></div>';
    // graduations (cm), origine à la marge gauche
    const cm = TX.cm2pt(1);
    for (let k = -Math.floor(ml / cm * 4); k <= Math.ceil((pg.w - ml) / cm * 4); k++) { const x = P(ml + k * cm / 4); const big = k % 4 === 0; h += '<i class="rl-tick" style="left:' + x + 'px;height:' + (big ? 0 : k % 2 === 0 ? 5 : 3) + 'px"></i>'; if (big && k) h += '<span class="rl-num" style="left:' + x + 'px">' + Math.abs(k / 4) + '</span>'; }
    // retraits du paragraphe courant
    const f = TX.fmtState(v.state, A.attrs()); let il = f.p.il || 0, ir = f.p.ir || 0, fi = f.p.fi || 0;
    if (f.list) { const d = (A.attrs().lists || {})[f.list.id]; const lv = d && d.lv[f.list.l || 0]; if (lv) { if (f.par.attrs.il == null) il = lv.il; if (f.par.attrs.fi == null) fi = -lv.hg; } }
    let base = ml;
    // dans une cellule : la règle suit la cellule
    h += '<div class="rl-h fi" data-h="fi" style="left:' + P(base + il + fi) + 'px" title="Retrait de première ligne"></div><div class="rl-h hg" data-h="hg" style="left:' + P(base + il) + 'px" title="Retrait négatif"></div><div class="rl-h li" data-h="li" style="left:' + P(base + il) + 'px" title="Retrait à gauche"></div><div class="rl-h ri" data-h="ri" style="left:' + P(base + cw - ir) + 'px" title="Retrait à droite"></div>';
    h += '<div class="rl-m" data-m="ml" style="left:' + P(ml) + 'px" title="Marge gauche"></div><div class="rl-m" data-m="mr" style="left:' + P(pg.w - pg.mr) + 'px" title="Marge droite"></div>';
    const tabs = f.p.tabs || [];
    tabs.forEach((t, i) => { h += '<div class="rl-tab" data-tab="' + i + '" style="left:' + P(base + t.pos) + 'px" title="Taquet ' + { left: 'gauche', center: 'centré', right: 'droit', decimal: 'décimal', bar: 'barre' }[t.t || 'left'] + ' (glisser hors de la règle pour supprimer)">' + (TABSVG[t.t] || TABSVG.left) + '</div>'; });
    host.innerHTML = h;
    host.onpointerdown = (e) => {
      const hd = e.target.closest('[data-h]'), mg = e.target.closest('[data-m]'), tb = e.target.closest('[data-tab]');
      const toPt = (clientX) => ((clientX - hr.left - x0) / s) / TX.PX;
      if (hd) {
        e.preventDefault(); const k = hd.dataset.h; const el = hd;
        O.drag(e, { threshold: 0, move: (dx, dy, ev) => { el.style.left = (ev.clientX - hr.left) + 'px'; }, end: (dx, dy, ev, moved) => {
          if (!moved) return; const pt = Math.round((toPt(ev.clientX) - base) * 2) / 2;
          if (k === 'fi') X.setPara(V(), { fi: Math.round((pt - il) * 10) / 10 }, 'Retrait');
          else if (k === 'hg') X.setPara(V(), { il: pt, fi: Math.round((il + fi - pt) * 10) / 10 }, 'Retrait');
          else if (k === 'li') X.setPara(V(), { il: pt }, 'Retrait');
          else if (k === 'ri') X.setPara(V(), { ir: Math.max(-72, Math.round((cw - pt) * 10) / 10) }, 'Retrait');
        } });
        return;
      }
      if (mg) {
        e.preventDefault(); const k = mg.dataset.m;
        O.drag(e, { threshold: 0, move: (dx, dy, ev) => { mg.style.left = (ev.clientX - hr.left) + 'px'; }, end: (dx, dy, ev, moved) => { if (!moved) return; const pt = toPt(ev.clientX); const val = k === 'ml' ? Math.max(0, pt) : Math.max(0, pg.w - pt); X.setPage(A.ed.view, { [k]: Math.round(val * 10) / 10 }, A.multiSection() ? 'section' : 'all'); } });
        return;
      }
      if (tb) {
        e.preventDefault(); const i = +tb.dataset.tab;
        O.drag(e, { threshold: 0, move: (dx, dy, ev) => { tb.style.left = (ev.clientX - hr.left) + 'px'; tb.style.opacity = Math.abs(dy) > 25 ? 0.3 : 1; }, end: (dx, dy, ev, moved) => {
          const l = tabs.slice(); if (Math.abs(dy) > 25) l.splice(i, 1); else if (moved) l[i] = Object.assign({}, l[i], { pos: Math.round((toPt(ev.clientX) - base) * 2) / 2 }); else return;
          X.setPara(V(), { tabs: l.length ? l.sort((a, b) => a.pos - b.pos) : null }, 'Tabulations');
        } });
        return;
      }
      // clic dans la règle : nouveau taquet
      const pt = Math.round((toPt(e.clientX) - base) * 2) / 2;
      if (pt > 0 && pt < cw) X.setPara(V(), { tabs: tabs.concat([{ pos: pt, t: tabKind }]).sort((a, b) => a.pos - b.pos) }, 'Tabulation');
    };
    host.ondblclick = () => D.tabs();
  });
  $('#docScroll') && $('#docScroll').addEventListener('scroll', () => { A.renderRuler(); if (A.navTab === 'pages') A.navRefresh(); A.updateStatus && A.updateStatus(); }, { passive: true });

  /* ================= en-têtes et pieds de page ================= */
  A.partCtx = function (page) {
    return Object.assign({}, A.ctx, { pageLabel: () => page ? page.label : '1', pageCount: () => page ? page.total : 1 });
  };
  A.editPart = function (pi, kind) {
    if (A.settings.view !== 'page') { A.setView('page'); setTimeout(() => A.editPart(pi, kind), 300); return; }
    if (A.partEd) A.closePart(true);
    const L = A.layout, p = L.pages[pi]; if (!p) return;
    const v = A.ed.view, doc = v.state.doc, settings = A.attrs().settings || {};
    const which = p.first && p.pg.titlePg ? 'first' : (settings.evenOdd && p.num % 2 === 0 ? 'even' : 'def');
    let id = L.partFor(doc, p.si, kind, which);
    if (!id) {
      id = TX.uid('P');
      const parts = Object.assign({}, A.attrs().parts || {}); parts[id] = { doc: TX.B.part([TX.B.p(kind === 'hdr' ? 'EnTete' : 'PiedPage', '')]) };
      // section qui porte l'en-tête : la section courante si elle a déjà ses propres en-têtes, sinon la première de la chaîne liée
      let si = p.si; while (si > 0 && TX.pg(doc.child(si))[kind][which] == null && which === 'def') si--;
      const secPos = (() => { let q = 0; for (let i = 0; i < si; i++) q += doc.child(i).nodeSize; return q; })();
      const pg = Object.assign({}, TX.pg(doc.child(si))); pg[kind] = Object.assign({}, pg[kind], { [which]: id });
      v.dispatch(v.state.tr.setDocAttribute('parts', parts).setNodeMarkup(secPos, null, { pg }).setMeta('tx-label', kind === 'hdr' ? 'En-tête' : 'Pied de page'));
      L.run();
    }
    const pg2 = TX.pg(A.ed.view.state.doc.child(p.si));
    const zoneSel = '.tx-hz[data-kind="' + kind + '"][data-page="' + pi + '"]';
    const zone = $('#paper .tx-over').querySelector(zoneSel); if (!zone) return;
    zone.innerHTML = ''; zone.classList.add('editing');
    zone.appendChild(O.h('span', { cls: 'tx-hz-lbl' }, (kind === 'hdr' ? 'En-tête' : 'Pied de page') + (which === 'first' ? ' de la première page' : which === 'even' ? ' de page paire' : settings.evenOdd ? ' de page impaire' : '') + (doc.childCount > 1 ? ' – Section ' + (p.si + 1) : '') + (p.si > 0 && pg2[kind][which] == null ? ' (identique au précédent)' : '')));
    const host = O.h('div', { cls: 'tx-part-host' }); zone.appendChild(host);
    const part = (A.attrs().parts || {})[id];
    A.partEd = new TX.Editor({
      host, doc: part ? part.doc || part : TX.B.part([TX.B.p('EnTete', '')]), kind: 'part', ctx: A.partCtx(p), attrs: () => A.attrs(), label: kind === 'hdr' ? 'En-tête' : 'Pied de page',
      track: () => !!(A.attrs().settings || {}).track, auto: () => A.settings.auto !== false,
      onChange: (tr, view) => { if (tr.docChanged) { A.partDraft = { kind: 'part', id, json: view.state.doc.toJSON() }; A.dirty = true; partRedraw(); } A.refreshUi(); A.renderTitle(); }
    });
    A.partEd.kind = 'part'; A.partEd.partId = id; A.partEd.si = p.si; A.partEd.page = pi; A.partEd.linked = p.si > 0 && pg2[kind][which] == null; A.partEd.zoneSel = zoneSel;
    L.keep = { sel: zoneSel, el: zone };
    A.ed.view.dom.classList.add('tx-dim');
    TX.layoutTabs(host, A.attrs(), L.scale);
    A.partEd.view.focus();
    A.partEd.view.dispatch(A.partEd.view.state.tr.setSelection(PM.state.Selection.atEnd(A.partEd.view.state.doc)));
    ctxbar('<b>' + (kind === 'hdr' ? 'En-tête' : 'Pied de page') + '</b><span>Modifiez puis fermez (Échap ou double-clic dans le texte)</span><span class="sp"></span><button type="button" data-cb="close">' + O.icon('x') + 'Fermer l\'en-tête et le pied de page</button>');
    A.ribbon.refresh(); A.ribbon.select('hf');
  };
  const partRedraw = O.debounce(() => { if (!A.partEd) return; const L = A.layout; const hBefore = L.pages.map((p) => p.hdrH + ':' + p.ftrH).join(','); L.clearCache(); L.run(); const hAfter = L.pages.map((p) => p.hdrH + ':' + p.ftrH).join(','); void hBefore; void hAfter; if (A.partEd && A.partEd.view) TX.layoutTabs(A.partEd.view.dom, A.attrs(), L.scale); }, 300);
  A.commitPart = function (keepOpen) {
    const d = A.partDraft; if (!d) return;
    if (d.kind === 'part') { const parts = Object.assign({}, A.ed.view.state.doc.attrs.parts || {}); parts[d.id] = { doc: d.json }; if (JSON.stringify(A.ed.view.state.doc.attrs.parts[d.id]) !== JSON.stringify(parts[d.id])) A.ed.view.dispatch(A.ed.view.state.tr.setDocAttribute('parts', parts).setMeta('tx-label', 'En-tête / pied de page')); }
    else { const notes = Object.assign({}, A.ed.view.state.doc.attrs.notes || {}); notes[d.id] = { doc: d.json }; A.ed.view.dispatch(A.ed.view.state.tr.setDocAttribute('notes', notes).setMeta('tx-label', 'Note')); }
    if (!keepOpen) A.partDraft = null; else A.partDraft = Object.assign({}, d);
  };
  A.closePart = function (commit) {
    if (!A.partEd) return;
    if (commit !== false) A.commitPart(false); A.partDraft = null;
    try { A.partEd.destroy(); } catch (e) { }
    A.partEd = null; A.layout.keep = null;
    A.ed.view.dom.classList.remove('tx-dim'); ctxbar(null);
    A.layout.clearCache(); A.relayout(true); A.ed.view.focus(); A.refreshUi();
    if (A.ribbon.tab === 'hf') A.ribbon.select('home');
  };
  A.partOption = function (k) {
    const v = A.ed.view, si = A.partEd.si, kind = A.partEd.zoneSel.indexOf('hdr') > 0 ? 'hdr' : 'ftr', pi = A.partEd.page;
    A.closePart(true);
    if (k === 'titlePg') X.setPage(v, (pg) => ({ titlePg: !pg.titlePg }), 'section');
    if (k === 'evenOdd') { const s = Object.assign({}, A.attrs().settings || {}); s.evenOdd = !s.evenOdd; A.setAttr('settings', s, 'Pages paires et impaires'); }
    if (k === 'link') {
      const doc = v.state.doc; const pg = TX.pg(doc.child(si)); const p = A.layout.pages[pi];
      const which = p.first && pg.titlePg ? 'first' : ((A.attrs().settings || {}).evenOdd && p.num % 2 === 0 ? 'even' : 'def');
      if (pg[kind][which] == null) { // délier : copie de l'en-tête hérité
        const src = A.layout.partFor(doc, si, kind, which); const nid = TX.uid('P'); const parts = Object.assign({}, A.attrs().parts); parts[nid] = O.clone(parts[src] || { doc: TX.B.part([TX.B.p(kind === 'hdr' ? 'EnTete' : 'PiedPage', '')]) });
        const npg = Object.assign({}, pg); npg[kind] = Object.assign({}, pg[kind], { [which]: nid });
        let off = 0; for (let i = 0; i < si; i++) off += doc.child(i).nodeSize;
        v.dispatch(v.state.tr.setDocAttribute('parts', parts).setNodeMarkup(off, null, { pg: npg }).setMeta('tx-label', 'Délier'));
      } else { const npg = Object.assign({}, pg); npg[kind] = Object.assign({}, pg[kind], { [which]: null }); let off = 0; for (let i = 0; i < si; i++) off += doc.child(i).nodeSize; v.dispatch(v.state.tr.setNodeMarkup(off, null, { pg: npg }).setMeta('tx-label', 'Lier au précédent')); }
    }
    A.layout.run(); setTimeout(() => A.editPart(pi, kind), 50);
  };
  /** En-tête / pied prédéfini : remplace celui de la section courante (et des sections liées) */
  A.applyPartTemplate = function (kind, tplId) {
    if (A.partEd) A.closePart(true);
    const tpl = TX.Templates.PARTS.find((x) => x.id === tplId); if (!tpl) return;
    const v = A.ed.view, doc = v.state.doc, si = Math.min(v.state.selection.$from.index(0), doc.childCount - 1);
    let id = A.layout.partFor(doc, si, kind, 'def');
    const parts = Object.assign({}, A.attrs().parts || {}); const tr = v.state.tr;
    const info = { title: (A.attrs().props || {}).title || A.docName(), author: (A.attrs().props || {}).author || TX.userName() };
    if (!id) { id = TX.uid('P'); const pg = Object.assign({}, TX.pg(doc.child(0))); pg[kind] = Object.assign({}, pg[kind], { def: id }); tr.setNodeMarkup(0, null, { pg }); }
    parts[id] = { doc: TX.B.part(tpl.build(info)) };
    tr.setDocAttribute('parts', parts).setMeta('tx-label', kind === 'hdr' ? 'En-tête' : 'Pied de page');
    v.dispatch(tr); A.layout.clearCache(); A.relayout(true);
  };
  A.removePart = function (kind) {
    if (A.partEd) A.closePart(true);
    const v = A.ed.view, tr = v.state.tr;
    v.state.doc.forEach((sec, off) => { const pg = Object.assign({}, TX.pg(sec)); pg[kind] = { def: null, first: null, even: null }; tr.setNodeMarkup(off, null, { pg }); });
    v.dispatch(tr.setMeta('tx-label', 'Supprimer')); A.relayout(true);
  };
  A.pageNumber = function (kind, align, xOfY) {
    const al = { left: null, center: 'center', right: 'right' }[align];
    const content = xOfY ? ['Page ', TX.B.field('page'), ' sur ', TX.B.field('pages')] : [TX.B.field('page')];
    const v = A.ed.view, doc = v.state.doc; const si = Math.min(v.state.selection.$from.index(0), doc.childCount - 1);
    let id = A.layout.partFor(doc, si, kind, 'def'); const parts = Object.assign({}, A.attrs().parts || {}); const tr = v.state.tr;
    if (!id) { id = TX.uid('P'); const pg = Object.assign({}, TX.pg(doc.child(0))); pg[kind] = Object.assign({}, pg[kind], { def: id }); tr.setNodeMarkup(0, null, { pg }); parts[id] = { doc: TX.B.part([TX.B.p(kind === 'hdr' ? 'EnTete' : 'PiedPage', content, { al })]) }; }
    else { const j = O.clone(parts[id].doc || parts[id]); const blocks = j.content[0].content; blocks.push(TX.B.p(kind === 'hdr' ? 'EnTete' : 'PiedPage', content, { al })); parts[id] = { doc: j }; }
    v.dispatch(tr.setDocAttribute('parts', parts).setMeta('tx-label', 'Numéro de page')); A.relayout(true);
  };
  A.removePageNumbers = function () {
    const parts = O.clone(A.attrs().parts || {}); let n = 0;
    Object.keys(parts).forEach((k) => { const j = parts[k].doc || parts[k]; (function walk(x) { if (x.content) x.content = x.content.filter((c) => { if (c.type === 'field' && /^(page|pages|sectionpages)$/.test(c.attrs.f)) { n++; return false; } walk(c); return true; }); })(j); j.content[0].content = j.content[0].content.filter((p) => !(p.type === 'paragraph' && (!p.content || !p.content.some((c) => c.type !== 'text' || /\S/.test(c.text.replace(/^(Page|sur)$/i, ''))))) || true); parts[k] = { doc: j }; });
    A.setAttr('parts', parts, 'Supprimer les numéros de page'); A.relayout(true); O.toast(n + ' numéro(s) de page retiré(s)');
  };
  // double-clic sur la marge haute / basse : modifier l'en-tête / le pied ; clic sur une note : la modifier
  A.panesInit = function () {
    const over = $('#paper .tx-over');
    over.addEventListener('dblclick', (e) => { const z = e.target.closest('.tx-hz'); if (z && !z.classList.contains('editing')) { e.preventDefault(); A.editPart(+z.dataset.page, z.dataset.kind); } });
    over.addEventListener('mousedown', (e) => { const z = e.target.closest('.tx-hz'); if (z && !z.classList.contains('editing') && e.detail === 1) { /* clic simple : le texte du corps le plus proche reçoit le curseur */ } });
    over.addEventListener('click', (e) => {
      const n = e.target.closest('.tx-note[data-note]'); if (n && !n.classList.contains('editing')) { A.editNote(n.dataset.note, n); return; }
      const z = e.target.closest('.tx-hz'); if (z && !z.classList.contains('editing') && O.touch()) { if (z._t && Date.now() - z._t < 450) { A.editPart(+z.dataset.page, z.dataset.kind); } z._t = Date.now(); }
    });
    // double-clic dans le corps pendant la modification d'un en-tête : retour au texte
    $('#docBody').addEventListener('dblclick', () => { if (A.partEd) A.closePart(true); });
    $('#docBody').addEventListener('mousedown', () => { if (A.partEd && A.partEd.kind === 'note') A.closePart(true); });
    $('#ctxbar').addEventListener('click', (e) => { const b = e.target.closest('[data-cb]'); if (!b) return; const k = b.dataset.cb; if (k === 'close') A.closePart(true); if (k === 'mergeoff') C.mergePreview(null); if (k === 'mprev') C.mergePreview(Math.max(0, A.merge.preview - 1)); if (k === 'mnext') C.mergePreview(Math.min(A.merge.data.rows.length - 1, A.merge.preview + 1)); });
    tableResize();
    if (A.settings.nav) setTimeout(() => A.openNav(A.navTab), 0);
  };
  function ctxbar(html, cls) { const b = $('#ctxbar'); if (!html) { b.hidden = true; b.innerHTML = ''; b.className = ''; return; } b.hidden = false; b.className = cls || ''; b.innerHTML = html; }
  A.ctxbar = ctxbar;

  /* ================= notes ================= */
  A.editNote = function (id, el) {
    if (A.partEd) A.closePart(true);
    if (A.settings.view !== 'page') { O.toast('Les notes se modifient en mode Page (ou dans « Afficher les notes »)'); return; }
    el = el || $('#paper .tx-over').querySelector('.tx-note[data-note="' + id + '"]');
    if (!el) { A.layout.run(); el = $('#paper .tx-over').querySelector('.tx-note[data-note="' + id + '"]'); if (!el) return; }
    const note = (A.attrs().notes || {})[id];
    el.innerHTML = ''; el.classList.add('editing');
    const num = O.h('sup', { cls: 'tx-fnn', style: { float: 'left', marginRight: '3px' } }, O.esc(el.dataset.n || A.ctx.noteLabel(id, el.classList.contains('end'))));
    el.appendChild(num);
    const host = O.h('div', { cls: 'tx-part-host' }); el.appendChild(host);
    A.partEd = new TX.Editor({
      host, doc: note ? note.doc || note : TX.B.part([TX.B.p('NoteBas', '')]), kind: 'note', ctx: A.ctx, attrs: () => A.attrs(), label: 'Note',
      track: () => !!(A.attrs().settings || {}).track, auto: () => A.settings.auto !== false,
      onChange: (tr, view) => { if (tr.docChanged) { A.partDraft = { kind: 'note', id, json: view.state.doc.toJSON() }; A.dirty = true; noteRedraw(); } A.refreshUi(); }
    });
    A.partEd.kind = 'note'; A.partEd.noteId = id; A.partEd.si = 0;
    A.layout.keep = { sel: '.tx-note[data-note="' + id + '"]', el };
    A.partEd.view.focus(); A.partEd.view.dispatch(A.partEd.view.state.tr.setSelection(PM.state.Selection.atEnd(A.partEd.view.state.doc)));
    A.partEd.view.dom.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); A.closePart(true); } });
    ctxbar('<b>Note</b><span>Modifiez le texte de la note</span><span class="sp"></span><button type="button" data-cb="close">' + O.icon('x') + 'Fermer</button>');
  };
  const noteRedraw = O.debounce(() => { if (A.partEd && A.partEd.kind === 'note') { A.layout.clearCache(); A.layout.run(); } }, 400);
  C.footnote = function (end) {
    if (A.partEd) A.closePart(true);
    const id = X.footnote(A.ed.view, end, '');
    A.relayout(true);
    setTimeout(() => { if (A.settings.view === 'page') { A.layout.run(); A.editNote(id); } else C.showNotes(id); }, 120);
  };
  C.nextNote = function () { const v = A.ed.view, cur = v.state.selection.to; let pos = null, first = null; v.state.doc.descendants((n, p) => { if (n.type.name === 'fnref') { if (first == null) first = p; if (pos == null && p >= cur) pos = p; } return true; }); const t = pos != null ? pos : first; if (t == null) { O.toast('Aucune note'); return; } v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, t)).scrollIntoView()); v.focus(); };
  /** Toutes les notes dans une fenêtre (utile hors mode Page et sur téléphone) */
  C.showNotes = function (focusId) {
    const st = TX.numKey.getState(A.ed.view.state); const notes = A.attrs().notes || {};
    const all = Object.keys(st.notes.foot).map((id) => ({ id, n: st.notes.foot[id], end: false })).concat(Object.keys(st.notes.end).map((id) => ({ id, n: st.notes.end[id], end: true })));
    if (!all.length) { O.toast('Aucune note. Références › Insérer une note de bas de page'); return; }
    const txt = (id) => { try { return TX.textOf(TX.schema.nodeFromJSON((notes[id] || {}).doc || TX.B.part([TX.B.p('NoteBas', '')]))); } catch (e) { return ''; } };
    O.dialog({ title: 'Notes', wide: true, body: all.map((x) => '<label class="o-field"><span>' + (x.end ? 'Note de fin ' : 'Note ') + O.esc(A.ctx.noteLabel(x.id, x.end)) + '</span><textarea class="o-in" rows="2" data-note="' + x.id + '">' + O.esc(txt(x.id)) + '</textarea></label>').join(''), onOpen: (el) => { if (focusId) { const t = el.querySelector('[data-note="' + focusId + '"]'); if (t) setTimeout(() => t.focus(), 50); } }, buttons: [{ label: 'Annuler', value: null }, { label: 'Enregistrer', primary: true, value: 'ok', onClick: (c, w) => { const nn = Object.assign({}, notes); O.$$('[data-note]', w).forEach((t) => { const id = t.dataset.note; if (txt(id) !== t.value) nn[id] = { doc: TX.B.part(t.value.split('\n').map((l) => TX.B.p(st.notes.end[id] ? 'NoteFin' : 'NoteBas', l))) }; }); A.setAttr('notes', nn, 'Notes'); A.layout.clearCache(); A.relayout(); } }] });
  };

  /* ================= images, objets ================= */
  C.insertImage = async function () {
    const files = await O.Files.pickMedia('image/*', true); for (const f of files) await C.insertImageFile(f);
  };
  C.insertImageFile = async function (file) {
    if (!/^image\//.test(file.type)) { O.toast('Ce fichier n\'est pas une image', { bad: true }); return; }
    let blob = file;
    // très grandes photos : réduites (2400 px) pour garder un document léger
    try { const dim = await imgSize(file); if (Math.max(dim.w, dim.h) > 2400 && !/svg|gif/.test(file.type)) { blob = await shrink(file, 2400); } const id = TX.media.add(blob, file.name || 'image', { w: dim.w, h: dim.h }); const k = 0.75 * Math.min(1, 1800 / Math.max(dim.w, dim.h)); X.insertImage(V(), id, dim.w * k, dim.h * k, { alt: '' }); }
    catch (e) { O.toast('Image illisible : ' + e.message, { bad: true }); }
  };
  function imgSize(blob) { return new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { res({ w: im.naturalWidth || 300, h: im.naturalHeight || 200 }); URL.revokeObjectURL(u); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('format non reconnu')); }; im.src = u; }); }
  TX.imgSize = imgSize;
  async function shrink(blob, max) { const u = URL.createObjectURL(blob); const im = new Image(); await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = u; }); const k = max / Math.max(im.naturalWidth, im.naturalHeight); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); return new Promise((r) => c.toBlob(r, blob.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88)); }
  A.onPasteFiles = function (e) {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const img = items.find((i) => i.kind === 'file' && /^image\//.test(i.type));
    const html = e.clipboardData && e.clipboardData.getData('text/html');
    if (img && !html) { e.preventDefault(); C.insertImageFile(img.getAsFile()); return true; }
    return false;
  };
  A.onDropFiles = function (e) {
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (!files.length) return false;
    const imgs = files.filter((f) => /^image\//.test(f.type)); const docs = files.filter((f) => /\.(magdoc|docx|odt|rtf|txt|md|html?)$/i.test(f.name));
    if (docs.length) { e.preventDefault(); A.openBlob(docs[0], docs[0].name, null); return true; }
    if (!imgs.length) return false;
    e.preventDefault(); const v = A.ed.view; const pos = v.posAtCoords({ left: e.clientX, top: e.clientY }); if (pos) v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(pos.pos))));
    imgs.forEach((f) => C.insertImageFile(f)); return true;
  };
  C.addShape = (shape) => X.insertDrawing(V(), { kind: 'shape', shape, w: window.Pres.isLineShape(shape) ? 144 : 108, h: window.Pres.isLineShape(shape) ? 36 : 72, wrap: 'square', al: 'left', fill: window.Pres.isLineShape(shape) ? null : 't:accent1', line: { c: window.Pres.isLineShape(shape) ? 't:tx1' : 't:accent1/-25', w: 1 } });
  C.addTextBox = () => X.insertDrawing(V(), { kind: 'textbox', w: 180, h: 72, wrap: 'square', al: 'right', fill: '#FFFFFF', line: { c: '#000000', w: 0.75 }, html: '<div>Zone de texte</div>', va: 'top' });
  C.addChart = (kind) => { X.insertDrawing(V(), { kind: 'chart', chart: window.Pres.newChart(kind), w: 360, h: 216, wrap: 'topBottom', al: 'center', fill: null, alt: 'Graphique' }); setTimeout(() => { const n = A.objSel(); if (n) D.chart(); }, 50); };
  C.addSmart = (kind) => { X.insertDrawing(V(), { kind: 'smart', smart: window.Pres.newSmart(kind), w: 420, h: 180, wrap: 'topBottom', al: 'center', fill: null, alt: 'Schéma' }); setTimeout(() => D.smart(), 50); };
  A.objectDblClick = function (node, pos) {
    const v = V(); try { v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, pos))); } catch (e) { }
    if (node.type.name === 'math') D.equation(node, pos);
    else if (node.type.name === 'drawing' && node.attrs.kind === 'chart') D.chart();
    else if (node.type.name === 'drawing' && node.attrs.kind === 'smart') D.smart();
    else if (node.type.name === 'drawing' && node.attrs.kind === 'icon') D.icons(true);
    else D.objectProps('size');
  };
  A.insertQuickTable = function (kind) {
    const B = TX.B, v = V(); let t;
    if (kind === 'planning') t = B.table([['Horaire', 'Séquence', 'Méthode', 'Durée'], ['08:30', 'Accueil, tour de table, objectifs', 'Échanges', '30 min'], ['09:00', 'Réglementation et responsabilités', 'Exposé', '1 h'], ['10:15', 'Pratique : montage', 'Atelier', '2 h'], ['14:00', 'Vérifications et réception', 'Démonstration', '1 h 30'], ['16:30', 'Évaluation et bilan', 'QCM', '30 min']], { ts: 'moyen1', hdr: true, band: true, widths: [70, 210, 100, 70] });
    else if (kind === 'emargement') t = B.table([['Nom', 'Prénom', 'Matin', 'Après-midi']].concat(Array.from({ length: 10 }, () => ['', '', '', ''])), { ts: 'Grille', hdr: true, widths: [130, 120, 100, 100], heights: [null].concat(Array.from({ length: 10 }, () => 28)) });
    else t = B.table([['Désignation', 'Quantité', 'Prix unitaire HT', 'Total HT'], ['Formation (jour)', '1', '0,00', '0,00'], ['', '', '', ''], ['', '', 'Total HT', '0,00']], { ts: 'clair1', hdr: true, widths: [210, 70, 90, 80] });
    const node = TX.schema.nodeFromJSON(t); const $f = v.state.selection.$from;
    v.dispatch(v.state.tr.insert($f.after(Math.min(2, $f.depth)), node).setMeta('tx-label', 'Tableau rapide')); v.focus();
  };
  /* ---- page de garde ---- */
  A.insertCover = function (id) {
    const cov = TX.Templates.COVERS.find((c) => c.id === id); if (!cov) return;
    const v = A.ed.view, props = A.attrs().props || {};
    const blocks = cov.build({ title: props.title || A.docName(), subtitle: props.subject || '', author: props.author || TX.userName(), date: TX.fmtDate(Date.now(), 'd MMMM yyyy') }).map((b) => TX.schema.nodeFromJSON(b));
    blocks.forEach((b, i) => { if (i === 0) b.attrs.ctx; });
    const tr = v.state.tr; if (A._coverLen && v.state.doc.firstChild.childCount > A._coverLen) { /* page de garde existante : remplacée */ }
    const first = v.state.doc.firstChild; let n = 0; first.forEach((b) => { if (b.attrs && b.attrs.ctx === 'cover') n += b.nodeSize; else if (n && b.type.name === 'page_break' && !tr._covEnd) { n += b.nodeSize; tr._covEnd = true; } });
    if (n) tr.delete(1, 1 + n);
    tr.insert(1, blocks.map((b) => b.type.name === 'paragraph' ? b.type.create(Object.assign({}, b.attrs, { ctx: 'cover' }), b.content, b.marks) : b).concat([TX.schema.nodes.page_break.create()]));
    v.dispatch(tr.setMeta('tx-label', 'Page de garde')); A.goTo(1);
    // la page de garde n'a pas d'en-tête / pied : première page différente
    X.setPage(v, { titlePg: true }, 'all');
  };
  A.removeCover = function () { const v = A.ed.view, tr = v.state.tr; const first = v.state.doc.firstChild; let n = 0, done = false; first.forEach((b) => { if (done) return; if (b.attrs && b.attrs.ctx === 'cover') n += b.nodeSize; else if (n && b.type.name === 'page_break') { n += b.nodeSize; done = true; } else if (n) done = true; }); if (!n) { O.toast('Aucune page de garde'); return; } tr.delete(1, 1 + n); v.dispatch(tr.setMeta('tx-label', 'Supprimer la page de garde')); };
  /* ---- tables des matières ---- */
  C.insertToc = function (a) {
    const v = A.ed.view; const node = NT.toc.create(Object.assign({ kind: 'toc', levels: 3, links: true, leader: 'dot' }, a || {}));
    const $f = v.state.selection.$from; const tr = v.state.tr;
    if ($f.parent.type === NT.paragraph && !$f.parent.content.size && $f.depth === 2) tr.replaceWith($f.before(), $f.after(), node); else tr.insert($f.after(Math.min(2, $f.depth)), node);
    v.dispatch(tr.setMeta('tx-label', 'Table des matières')); A.relayout(true);
  };
  C.removeToc = function () { const v = A.ed.view, tr = v.state.tr; const rs = []; v.state.doc.descendants((n, p) => { if (n.type.name === 'toc' && n.attrs.kind === 'toc') rs.push([p, p + n.nodeSize]); return true; }); if (!rs.length) { O.toast('Aucune table des matières'); return; } rs.reverse().forEach(([a, b]) => tr.delete(a, b)); v.dispatch(tr.setMeta('tx-label', 'Supprimer la table des matières')); };

  /* ================= colonnes de tableau : poignées de largeur ================= */
  function tableResize() {
    const body = $('#docBody'); let hdl = null, info = null;
    body.addEventListener('pointermove', (e) => {
      if (info && info.drag) return;
      const cell = e.target.closest && e.target.closest('td,th'); if (!cell || !cell.closest('.tx-pm')) { if (hdl) hdl.style.display = 'none'; info = null; return; }
      const r = cell.getBoundingClientRect(); const nearR = Math.abs(e.clientX - r.right) < 4, nearL = Math.abs(e.clientX - r.left) < 4 && cell.cellIndex > 0;
      if (!nearR && !nearL) { if (hdl) hdl.style.display = 'none'; info = null; return; }
      const target = nearR ? cell : cell.previousElementSibling; if (!target) return;
      const tr = target.getBoundingClientRect(), tbl = target.closest('table').getBoundingClientRect();
      if (!hdl) { hdl = O.h('div', { cls: 'tx-colhdl' }); document.body.appendChild(hdl); hdl.style.position = 'fixed'; hdl.addEventListener('pointerdown', startDrag); }
      hdl.style.display = 'block'; hdl.style.left = tr.right + 'px'; hdl.style.top = tbl.top + 'px'; hdl.style.height = tbl.height + 'px'; hdl.style.bottom = 'auto';
      info = { cell: target };
    });
    function startDrag(e) {
      if (!info) return; e.preventDefault();
      const v = A.ed.view, cell = info.cell; let pos; try { pos = v.posAtDOM(cell, 0) - 1; } catch (x) { return; }
      const $p = v.state.doc.resolve(pos + 1); let t = null;
      for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'table') { t = { node: $p.node(d), pos: $p.before(d), start: $p.start(d), map: PM.tables.TableMap.get($p.node(d)) }; break; }
      if (!t) return;
      const rect = t.map.findCell(pos - t.start); const col = rect.right - 1;
      const s = A.layout.scale || 1, x0 = e.clientX; info.drag = true; hdl.classList.add('on');
      const widths = []; const first = t.node.firstChild; first.forEach((c) => { for (let k = 0; k < c.attrs.colspan; k++) widths.push((c.attrs.colwidth && c.attrs.colwidth[k]) || 80); });
      O.drag(e, { threshold: 0, move: (dx) => { hdl.style.left = (x0 + dx) + 'px'; }, end: (dx, dy, ev, moved) => {
        hdl.classList.remove('on'); info.drag = false; if (!moved) return;
        const d = Math.round(dx / s); const nw = widths.slice(); nw[col] = Math.max(20, nw[col] + d); if (col + 1 < nw.length && !ev.shiftKey) nw[col + 1] = Math.max(20, nw[col + 1] - d);
        const tr = v.state.tr;
        t.node.descendants((n, p) => { if (/table_(cell|header)/.test(n.type.name)) { const r = t.map.findCell(p); tr.setNodeMarkup(t.start + p, null, Object.assign({}, n.attrs, { colwidth: nw.slice(r.left, r.right) })); return false; } return true; });
        v.dispatch(tr.setMeta('tx-label', 'Largeur de colonne'));
      } });
    }
  }

  /* ================= mode lecture : pages côte à côte ================= */
  let spreadObs = null;
  A.showSpread = function () {
    const L = A.layout; const sp = $('#spread');
    setTimeout(() => {
      L.mode = 'page'; L.run();
      sp.hidden = false; $('#docScroll').style.display = 'none';
      const vh = sp.clientHeight - 60, vw = sp.clientWidth - 60;
      const p0 = L.pages[0] || { W: 794, H: 1123 };
      const two = vw > 900;
      const k = Math.min(vh / p0.H, (two ? vw / 2 - 20 : vw) / p0.W);
      sp.innerHTML = L.pages.map((p, i) => '<div class="sp-pg" data-i="' + i + '" style="width:' + Math.round(p.W * k) + 'px;height:' + Math.round(p.H * k) + 'px"><span class="sp-num">' + O.esc(p.label) + '</span></div>').join('');
      sp._k = k;
      if (spreadObs) spreadObs.disconnect();
      spreadObs = new IntersectionObserver((ents) => ents.forEach((en) => { const el = en.target; if (en.isIntersecting && !el._f) fillSpread(el, +el.dataset.i); else if (!en.isIntersecting && el._f && el._f.parentNode) { el._f.remove(); el._f = null; } }), { root: sp, rootMargin: '400px' });
      O.$$('.sp-pg', sp).forEach((el) => spreadObs.observe(el));
    }, 50);
  };
  function fillSpread(el, i) {
    const L = A.layout, p = L.pages[i], k = $('#spread')._k;
    const paper = $('#paper'); const clone = paper.cloneNode(true);
    clone.removeAttribute('id'); clone.style.transform = 'none'; clone.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable')); clone.classList.add('tx-print');
    const inner = O.h('div', { cls: 'sp-in', style: { transform: 'scale(' + k + ') translate(' + (-p.left) + 'px,' + (-p.top) + 'px)', width: L.paperW + 'px', height: L.paperH + 'px' } });
    clone.querySelectorAll('.tx-cmts').forEach((c) => c.remove());
    inner.appendChild(clone); el.appendChild(inner); el._f = inner;
  }
  A.hideSpread = function () { const sp = $('#spread'); if (sp.hidden) return; sp.hidden = true; sp.innerHTML = ''; $('#docScroll').style.display = ''; if (spreadObs) spreadObs.disconnect(); };
  $('#spread') && $('#spread').addEventListener('dblclick', (e) => { const pg = e.target.closest('.sp-pg'); A.setView('page'); if (pg) setTimeout(() => A.layout.scrollToPage(+pg.dataset.i), 200); });

  /* ================= lecture à voix haute ================= */
  C.readAloud = function () {
    if (A.speaking) { stopSpeech(); return; }
    const v = A.ed.view, s = v.state.selection; const doc = v.state.doc;
    const from = s.empty ? s.$from.before(Math.min(2, s.$from.depth)) : s.from, to = s.empty ? doc.content.size : s.to;
    const chunks = []; doc.nodesBetween(from, to, (n, p) => { if (n.type.name === 'paragraph') { const t = TX.textOf(n).trim(); if (t) t.split(/(?<=[.!?…])\s+/).forEach((x) => { if (x.trim()) chunks.push({ t: x, pos: p }); }); return false; } return true; });
    if (!chunks.length) { O.toast('Rien à lire'); return; }
    const syn = window.speechSynthesis;
    A.speaking = true; A.refreshUi();
    if (syn && (!O.isAndroid || (syn.getVoices && syn.getVoices().length))) {
      const voices = syn.getVoices ? syn.getVoices() : []; const fr = voices.find((x) => /^fr(-FR)?$/i.test(x.lang)) || voices.find((x) => /^fr/i.test(x.lang));
      let i = 0;
      const next = () => { if (!A.speaking || i >= chunks.length) { stopSpeech(); return; } const c = chunks[i++]; const u = new SpeechSynthesisUtterance(c.t); u.lang = 'fr-FR'; if (fr) u.voice = fr; u.rate = A.settings.rate || 1; u.onend = next; u.onerror = next; try { A.goTo(c.pos); } catch (e) { } syn.speak(u); };
      syn.cancel(); next();
      O.toast('Lecture en cours (Échap ou le bouton pour arrêter)', { ms: 2500 });
    } else if (window.MAGPrint && window.MAGPrint.speak) { window.MAGPrint.speak(chunks.map((c) => c.t).join(' ').slice(0, 3900)); O.toast('Lecture en cours', { action: { label: 'Arrêter', fn: stopSpeech } }); setTimeout(() => { A.speaking = false; A.refreshUi(); }, 1000); }
    else { A.speaking = false; O.toast('Synthèse vocale indisponible sur cet appareil', { bad: true }); }
  };
  function stopSpeech() { A.speaking = false; try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { } try { if (window.MAGPrint && window.MAGPrint.speak && O.isAndroid) window.MAGPrint.speak(''); } catch (e) { } A.refreshUi(); }
})();
