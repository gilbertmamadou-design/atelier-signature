/* =====================================================================
   Suite MAG — ruban (onglets, groupes, commandes) commun aux applis bureautiques.
   const r = Office.Ribbon(conteneur, {tabs, ctx, file:{label, on}, search:true})
   Onglet : {id, label, contextual(ctx) → bool, accent:true, groups:[{label, items:[commande…]}]}
   Commande :
     {type:'btn', id, icon, label, size:'lg'|'sm', title, kbd, on(ctx), active(ctx), disabled(ctx), hidden(ctx), showLabel}
     {type:'split', …btn, menu(ctx) → items}      bouton + flèche (menu)
     {type:'menu', icon, label, size, items(ctx) → items}
     {type:'select', id, width, options(ctx) → [[valeur, libellé, style?]], value(ctx), on(ctx, v), edit:true (saisie libre), title}
     {type:'color', id, icon, label, value(ctx), on(ctx, c), picker(ctx, ancre, appliquer), title}
     {type:'num', id, label, value(ctx), on(ctx, v), min, max, step, unit, width}
     {type:'gallery', id, items(ctx) → [{id, html, title}], on(ctx, item), cols, w, h, current(ctx)}
     {type:'col', items:[…]}  pile verticale de petites commandes ; {type:'row', items:[…]}  rangée
     {type:'html', html(ctx), mount(el, ctx)}
   r.refresh() met à jour états/valeurs ; r.select(id) ; r.run(id) exécute une commande ; r.commands() liste (recherche).
   ===================================================================== */
(function () {
  'use strict';
  const O = window.Office;
  O.Ribbon = function (host, cfg) {
    const ctx = cfg.ctx || {};
    const R = { host, cfg, tab: null, collapsed: false, byId: {} };
    const el = O.h('div', { cls: 'o-ribbon', role: 'toolbar', 'aria-label': 'Ruban' });
    el.innerHTML = '<div class="o-rb-tabs" role="tablist"></div><div class="o-rb-body"></div>';
    host.appendChild(el);
    const tabsEl = el.querySelector('.o-rb-tabs'), body = el.querySelector('.o-rb-body');
    const refreshers = [];

    function visibleTabs() { return cfg.tabs.filter((t) => !t.contextual || t.contextual(ctx)); }
    function renderTabs() {
      const vis = visibleTabs();
      let h = '';
      if (cfg.file) h += '<button type="button" class="o-rb-tab o-rb-file" data-file="1">' + O.esc(cfg.file.label || 'Fichier') + '</button>';
      h += vis.map((t) => '<button type="button" role="tab" class="o-rb-tab' + (t.accent ? ' accent' : '') + (t.contextual ? ' ctxl' : '') + (R.tab === t.id ? ' on' : '') + '" data-tab="' + t.id + '" aria-selected="' + (R.tab === t.id) + '">' + O.esc(t.label) + '</button>').join('');
      h += '<span class="o-rb-sp"></span>';
      if (cfg.search !== false) h += '<label class="o-rb-search">' + O.icon('search') + '<input type="search" placeholder="Rechercher une commande" aria-label="Rechercher une commande (Alt+Q)"></label>';
      h += '<button type="button" class="o-rb-col" title="Réduire / afficher le ruban (Ctrl+F1)" aria-label="Réduire le ruban">' + O.icon(R.collapsed ? 'chevron-down' : 'chevron-up') + '</button>';
      const q = tabsEl.querySelector('.o-rb-search input'), qv = q ? q.value : '';
      tabsEl.innerHTML = h;
      if (qv) tabsEl.querySelector('.o-rb-search input').value = qv;
    }
    function ctrlHtml(c) {
      const id = c.id || (c.id = O.uid('c'));
      R.byId[id] = c;
      const icon = c.icon ? O.icon(c.icon) : '';
      const t = c.title || c.label || '';
      const tt = O.esc(t + (c.kbd ? ' (' + O.kbdLabel(c.kbd) + ')' : ''));
      switch (c.type || 'btn') {
        case 'col': return '<div class="o-rb-colm">' + c.items.map(ctrlHtml).join('') + '</div>';
        case 'row': return '<div class="o-rb-row">' + c.items.map(ctrlHtml).join('') + '</div>';
        case 'sep': return '<span class="o-rb-vsep"></span>';
        case 'html': return '<div class="o-rb-html" data-id="' + id + '"></div>';
        case 'select': return '<span class="o-rb-sel' + (c.edit ? ' edit' : '') + '" data-id="' + id + '" title="' + tt + '" style="width:' + (c.width || 120) + 'px">' + (c.edit ? '<input type="text" aria-label="' + O.esc(t) + '"><button type="button" class="o-rb-dd" aria-label="Liste">' + O.icon('chevron-down') + '</button>' : '<select aria-label="' + O.esc(t) + '"></select>') + '</span>';
        case 'num': return '<label class="o-rb-num" data-id="' + id + '" title="' + tt + '">' + (c.icon ? icon : '<span>' + O.esc(c.label || '') + '</span>') + '<input type="number" step="' + (c.step || 1) + '"' + (c.min != null ? ' min="' + c.min + '"' : '') + (c.max != null ? ' max="' + c.max + '"' : '') + ' style="width:' + (c.width || 58) + 'px" aria-label="' + O.esc(t) + '">' + (c.unit ? '<small>' + O.esc(c.unit) + '</small>' : '') + '</label>';
        case 'gallery': return '<div class="o-rb-gal" data-id="' + id + '" style="--gw:' + (c.w || 64) + 'px;--gh:' + (c.h || 40) + 'px"><div class="o-rb-gal-in"></div><button type="button" class="o-rb-gal-more" title="Plus" aria-label="Afficher tout">' + O.icon('chevron-down') + '</button></div>';
        case 'color': return '<span class="o-rb-split o-rb-color" data-id="' + id + '" title="' + tt + '"><button type="button" class="o-rb-b sm main">' + icon + (c.showLabel ? '<span class="l">' + O.esc(c.label) + '</span>' : '') + '<i class="o-rb-bar"></i></button><button type="button" class="o-rb-b sm arr" aria-label="' + O.esc(t) + ' : choisir">' + O.icon('chevron-down') + '</button></span>';
        case 'split': return '<span class="o-rb-split ' + (c.size === 'lg' ? 'lg' : 'sm') + '" data-id="' + id + '" title="' + tt + '"><button type="button" class="o-rb-b ' + (c.size === 'lg' ? 'lg' : 'sm') + ' main">' + icon + '<span class="l">' + O.esc(c.label || '') + '</span></button><button type="button" class="o-rb-b arr" aria-label="' + O.esc(t) + ' : options">' + O.icon('chevron-down') + '</button></span>';
        case 'menu': return '<button type="button" class="o-rb-b ' + (c.size === 'lg' ? 'lg' : 'sm') + ' o-rb-menu" data-id="' + id + '" title="' + tt + '" aria-haspopup="menu">' + icon + (c.label && (c.size === 'lg' || c.showLabel !== false) ? '<span class="l">' + O.esc(c.label) + '</span>' : '') + O.icon('chevron-down', 'dd') + '</button>';
        default: return '<button type="button" class="o-rb-b ' + (c.size === 'lg' ? 'lg' : 'sm') + (c.showLabel === false ? ' nolab' : '') + '" data-id="' + id + '" title="' + tt + '" aria-label="' + O.esc(t) + '">' + icon + (c.label && c.showLabel !== false ? '<span class="l">' + O.esc(c.label) + '</span>' : '') + '</button>';
      }
    }
    function renderBody() {
      refreshers.length = 0;
      const t = cfg.tabs.find((x) => x.id === R.tab);
      if (!t) { body.innerHTML = ''; return; }
      body.innerHTML = '<div class="o-rb-groups">' + t.groups.filter((g) => !g.hidden || !g.hidden(ctx)).map((g) => '<div class="o-rb-grp"><div class="o-rb-items">' + g.items.map(ctrlHtml).join('') + '</div><div class="o-rb-glab">' + O.esc(g.label || '') + (g.launcher ? '<button type="button" class="o-rb-launch" data-launch="' + O.esc(g.label) + '" title="Plus d\'options">' + O.icon('square-arrow-out-down-right') + '</button>' : '') + '</div></div>').join('') + '</div>';
      t.groups.forEach((g) => { if (g.launcher) R.byId['launch:' + g.label] = { on: g.launcher }; });
      O.$$('.o-rb-html', body).forEach((n) => { const c = R.byId[n.dataset.id]; if (c.html) n.innerHTML = c.html(ctx); if (c.mount) c.mount(n, ctx); });
      O.$$('.o-rb-sel', body).forEach(mountSelect);
      O.$$('.o-rb-num', body).forEach(mountNum);
      O.$$('.o-rb-gal', body).forEach(mountGallery);
      R.refresh();
      fit();
    }
    /** Ruban trop large : on masque d'abord les libellés des petites commandes, puis ceux des grandes */
    function fit() {
      el.classList.remove('c1', 'c2');
      if (O.narrow()) return;
      if (body.scrollWidth > body.clientWidth + 2) el.classList.add('c1');
      if (body.scrollWidth > body.clientWidth + 2) el.classList.add('c2');
    }
    R.fit = fit;
    if (window.ResizeObserver) new ResizeObserver(O.debounce(fit, 120)).observe(el);
    function mountSelect(n) {
      const c = R.byId[n.dataset.id];
      if (!c.edit) {
        const s = n.querySelector('select');
        s.addEventListener('change', () => { c.on(ctx, s.value); R.refresh(); });
        refreshers.push(() => {
          const opts = c.options(ctx), v = c.value ? c.value(ctx) : '';
          const sig = JSON.stringify(opts);
          if (s._sig !== sig) { s._sig = sig; s.innerHTML = opts.map((o) => '<option value="' + O.esc(o[0]) + '"' + (o[2] ? ' style="' + O.esc(o[2]) + '"' : '') + '>' + O.esc(o[1]) + '</option>').join(''); }
          if (v == null || v === '' || !opts.some((o) => String(o[0]) === String(v))) s.selectedIndex = -1; else s.value = v;
          s.disabled = !!(c.disabled && c.disabled(ctx));
        });
        return;
      }
      const inp = n.querySelector('input');
      const commit = () => { const v = inp.value.trim(); if (v !== '' && v !== inp._v) c.on(ctx, v); R.refresh(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); if (c.afterEnter) c.afterEnter(ctx); } else if (e.key === 'Escape') { inp.value = inp._v || ''; inp.blur(); } });
      inp.addEventListener('change', commit);
      inp.addEventListener('mousedown', (e) => e.stopPropagation());
      const open = () => {
        const opts = c.options(ctx), v = c.value ? String(c.value(ctx)) : '';
        O.menu(n, opts.map((o) => ({ label: o[1], html: o[2] ? '<span style="' + O.esc(o[2]) + '">' + O.esc(o[1]) + '</span>' + (o[3] ? '<small class="o-mi-note">' + O.esc(o[3]) + '</small>' : '') : null, checked: String(o[0]) === v, on: () => { c.on(ctx, o[0]); R.refresh(); } })), { cls: 'o-menu-list', title: c.title });
      };
      n.querySelector('.o-rb-dd').addEventListener('click', open);
      n.querySelector('.o-rb-dd').addEventListener('mousedown', (e) => e.preventDefault());
      refreshers.push(() => {
        const v = c.value ? c.value(ctx) : ''; const opts = c.options(ctx); const o = opts.find((x) => String(x[0]) === String(v));
        const txt = o ? o[1] : (v == null ? '' : String(v));
        if (document.activeElement !== inp) { inp.value = txt; inp._v = txt; }
        const dis = !!(c.disabled && c.disabled(ctx)); inp.disabled = dis; n.querySelector('.o-rb-dd').disabled = dis;
      });
    }
    function mountNum(n) {
      const c = R.byId[n.dataset.id], inp = n.querySelector('input');
      const commit = () => { const v = parseFloat(String(inp.value).replace(',', '.')); if (!isNaN(v) && String(v) !== inp._v) { c.on(ctx, v); R.refresh(); } };
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      refreshers.push(() => { const v = c.value ? c.value(ctx) : ''; if (document.activeElement !== inp) { inp.value = v == null || v === '' ? '' : O.round(v, 2); inp._v = String(inp.value); } inp.disabled = !!(c.disabled && c.disabled(ctx)); });
    }
    function mountGallery(n) {
      const c = R.byId[n.dataset.id], inner = n.querySelector('.o-rb-gal-in');
      inner.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; const it = c._items.find((x) => String(x.id) === b.dataset.g); if (it) { c.on(ctx, it); R.refresh(); } });
      if (c.preview) {
        inner.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-g]'); if (!b || O.touch()) return; const it = c._items.find((x) => String(x.id) === b.dataset.g); if (it) c.preview(ctx, it); });
        inner.addEventListener('pointerleave', () => c.preview(ctx, null));
      }
      n.querySelector('.o-rb-gal-more').addEventListener('click', () => {
        const items = c.items(ctx), cur = c.current ? c.current(ctx) : null;
        const node = O.h('div', { cls: 'o-gal-pop', style: { '--gw': (c.w || 64) + 'px', '--gh': (c.h || 40) + 'px' } });
        node.innerHTML = (c.groups ? c.groups(ctx) : [{ label: '', items }]).map((g) => (g.label ? '<div class="o-cp-lbl">' + O.esc(g.label) + '</div>' : '') + '<div class="o-gal-grid">' + g.items.map((it) => '<button type="button" class="o-gal-it' + (cur != null && String(cur) === String(it.id) ? ' on' : '') + '" data-g="' + O.esc(it.id) + '" title="' + O.esc(it.title || '') + '">' + it.html + '</button>').join('') + '</div>').join('') + (c.footer ? c.footer(ctx) : '');
        node.addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (b) { const it = items.find((x) => String(x.id) === b.dataset.g); O.closeMenu(); if (it) { c.on(ctx, it); R.refresh(); } return; } const a = e.target.closest('[data-gact]'); if (a) { O.closeMenu(); c.footerAct && c.footerAct(ctx, a.dataset.gact); } });
        O.menu(n, [{ node }], { cls: 'o-menu-gal', title: c.title || c.label });
      });
      refreshers.push(() => {
        const items = c.items(ctx), cur = c.current ? c.current(ctx) : null;
        const sig = items.map((x) => x.id + ':' + (x.sig || '')).join('|') + '#' + cur;
        c._items = items;
        if (inner._sig === sig) return; inner._sig = sig;
        inner.innerHTML = items.map((it) => '<button type="button" class="o-gal-it' + (cur != null && String(cur) === String(it.id) ? ' on' : '') + '" data-g="' + O.esc(it.id) + '" title="' + O.esc(it.title || '') + '">' + it.html + '</button>').join('');
      });
    }
    // clics
    el.addEventListener('mousedown', (e) => {
      // garder la sélection de texte en cours d'édition (sauf champs de saisie)
      if (!e.target.closest('input, select, textarea, .o-rb-search')) e.preventDefault();
    });
    // double-clic sur un onglet : réduire / afficher le ruban
    el.addEventListener('dblclick', (e) => { const tb = e.target.closest('.o-rb-tab[data-tab]'); if (tb && !O.narrow()) setCollapsed(!R.collapsed); });
    el.addEventListener('click', (e) => {
      const tb = e.target.closest('.o-rb-tab');
      if (tb) { if (tb.dataset.file) { cfg.file.on(ctx); return; } if (R.tab !== tb.dataset.tab) R.select(tb.dataset.tab); if (R.collapsed) body.classList.toggle('peek'); return; }
      if (e.target.closest('.o-rb-col')) { setCollapsed(!R.collapsed); return; }
      const la = e.target.closest('[data-launch]'); if (la) { R.byId['launch:' + la.dataset.launch].on(ctx); return; }
      const sp = e.target.closest('.o-rb-split');
      if (sp) {
        const c = R.byId[sp.dataset.id];
        if (e.target.closest('.arr')) {
          if (c.type === 'color') { c.picker(ctx, sp, (v) => { c._last = v; c.on(ctx, v); R.refresh(); }); return; }
          O.menu(sp, c.menu(ctx), { title: c.label }); return;
        }
        if (c.type === 'color') { c.on(ctx, c._last !== undefined ? c._last : (c.def !== undefined ? c.def : null)); R.refresh(); }
        else c.on(ctx);
        R.refresh(); peekDone(); return;
      }
      const b = e.target.closest('.o-rb-b[data-id]');
      if (b && !b.disabled) {
        const c = R.byId[b.dataset.id];
        if (c.type === 'menu') { O.menu(b, c.items(ctx), { title: c.label || c.title }); return; }
        if (c.on) { c.on(ctx, b); R.refresh(); peekDone(); }
      }
    });
    function peekDone() { if (R.collapsed) body.classList.remove('peek'); }
    function setCollapsed(v) { R.collapsed = v; el.classList.toggle('collapsed', v); body.classList.remove('peek'); renderTabs(); if (cfg.onLayout) cfg.onLayout(); }
    R.setCollapsed = setCollapsed;
    // recherche de commandes
    el.addEventListener('input', (e) => {
      if (!e.target.closest('.o-rb-search')) return;
      const q = e.target.value.trim().toLowerCase(); if (!q) { O.closeMenu(); return; }
      const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const res = R.commands().filter((c) => norm(c.label + ' ' + (c.tab || '') + ' ' + (c.keywords || '')).includes(norm(q))).slice(0, 14);
      O.menu(e.target, res.length ? res.map((c) => ({ label: c.label, html: O.esc(c.label) + ' <small class="o-mi-note">' + O.esc(c.tab) + '</small>', icon: c.icon, kbd: c.kbd ? O.kbdLabel(c.kbd) : '', on: () => { e.target.value = ''; R.runCmd(c); } })) : [{ label: 'Aucune commande', disabled: true }], { sheet: false });
      setTimeout(() => e.target.focus(), 0);
    });
    el.addEventListener('keydown', (e) => { if (e.target.closest('.o-rb-search') && e.key === 'Escape') { e.target.value = ''; O.closeMenu(); e.target.blur(); } });
    R.focusSearch = () => { if (R.collapsed) setCollapsed(false); const i = el.querySelector('.o-rb-search input'); if (i) i.focus(); };
    R.commands = function () {
      const out = [];
      const walk = (items, tab) => items.forEach((c) => { if (c.items && (c.type === 'col' || c.type === 'row')) return walk(c.items, tab); if (c.label && (c.on || c.items || c.menu) && c.type !== 'select' && c.type !== 'num' && c.type !== 'gallery') out.push({ label: c.label, icon: c.icon, kbd: c.kbd, tab: tab.label, c, keywords: c.keywords }); });
      cfg.tabs.forEach((t) => t.groups.forEach((g) => walk(g.items, t)));
      (cfg.extraCommands || []).forEach((c) => out.push(c));
      return out;
    };
    R.runCmd = function (x) {
      const c = x.c || x;
      if (c.type === 'menu') { const t = cfg.tabs.find((tt) => tt.groups.some((g) => JSON.stringify(g.items.map((i) => i.id)).includes(c.id))); if (t) R.select(t.id); setTimeout(() => { const b = body.querySelector('[data-id="' + c.id + '"]'); O.menu(b || el, c.items(ctx), { title: c.label }); }, 30); return; }
      if (c.type === 'split' && !c.on) { O.menu(el, c.menu(ctx)); return; }
      if (c.on) { c.on(ctx); R.refresh(); }
    };
    R.select = function (id) { if (!cfg.tabs.some((t) => t.id === id)) return; R.tab = id; renderTabs(); renderBody(); if (cfg.onTab) cfg.onTab(id); };
    R.refresh = function () {
      // onglets contextuels apparus / disparus
      const sig = visibleTabs().map((t) => t.id).join(',');
      if (sig !== R._tabsSig) {
        const prev = R._tabsSig ? R._tabsSig.split(',') : [];
        R._tabsSig = sig; const vis = visibleTabs();
        if (!vis.some((t) => t.id === R.tab)) { R.tab = (vis.find((t) => !t.contextual) || vis[0]).id; renderTabs(); renderBody(); return; }
        // un onglet contextuel vient d'apparaître : on le signale sans y basculer
        renderTabs(); vis.filter((t) => t.contextual && prev.indexOf(t.id) < 0).forEach((t) => { const b = tabsEl.querySelector('[data-tab="' + t.id + '"]'); if (b) b.classList.add('new'); });
      }
      O.$$('[data-id]', body).forEach((n) => {
        const c = R.byId[n.dataset.id]; if (!c) return;
        const hid = c.hidden && c.hidden(ctx); n.hidden = !!hid;
        const dis = !!(c.disabled && c.disabled(ctx));
        if (n.tagName === 'BUTTON') { n.disabled = dis; if (c.active) { const a = !!c.active(ctx); n.classList.toggle('on', a); n.setAttribute('aria-pressed', a); } }
        else if (n.classList.contains('o-rb-split')) { O.$$('button', n).forEach((b) => b.disabled = dis); if (c.active) n.classList.toggle('on', !!c.active(ctx)); if (c.type === 'color') { const v = c.value ? c.value(ctx) : c._last; n.querySelector('.o-rb-bar').style.background = v && v !== 'auto' ? (c.css ? c.css(v) : v) : 'transparent'; } }
      });
      refreshers.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
    };
    R.el = el;
    R.tab = (cfg.tabs.find((t) => t.id === cfg.start) || cfg.tabs[0]).id;
    renderTabs(); R._tabsSig = visibleTabs().map((t) => t.id).join(','); renderBody();
    if (O.narrow()) setCollapsed(false);
    return R;
  };
})();
