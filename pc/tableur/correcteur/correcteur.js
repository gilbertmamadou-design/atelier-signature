/* COPIE GÉNÉRÉE par pc/build-pc.py depuis pc/shared/correcteur/correcteur.js : ne pas modifier ici. */
/* Correcteur de français de la Suite MAG — orthographe, grammaire, conjugaison, synonymes, hors ligne.
   Moteur : Grammalecte 2.3 (GPL v3) dans une tâche de fond (correcteur-worker.js, dossier grammalecte/ à côté).
   Rien n'est envoyé sur Internet.

   Utilisation dans une appli :
     <script src="correcteur/correcteur.js"></script>
     MagCorrecteur.open(champ)          champ : <textarea>, <input>, élément modifiable (contenteditable)
                                        ou adaptateur { getText(), replace(debut, fin, texte), select(debut, fin), label }
     MagCorrecteur.hotkey()             F7 : corrige le champ où se trouve le curseur
     MagCorrecteur.button(champ, parent) petit bouton « Corriger » pour un champ
     MagCorrecteur.check(texte)         → Promise<[ { s, e, t: 'gram'|'ortho', msg, sugg, url } ]>
     MagCorrecteur.word(mot), .conj(verbe), .dico(mot) (fenêtre Dictionnaire : nature, synonymes, conjugaison) */
(function () {
  'use strict';
  if (window.MagCorrecteur) return;
  var cur = document.currentScript, DIR = cur && cur.src ? cur.src.replace(/[^/]*$/, '') : 'correcteur/';
  // Suite sur PC : le moteur (16 Mo) est partagé par toutes les applis (../shared/vendor/grammalecte/), la tâche de fond reste
  // dans le dossier de l'appli (portée de son service worker, hors ligne). MagCorrecteurConfig = { worker, engine, auto }
  var CFG = window.MagCorrecteurConfig || {};
  var abs = function (u) { try { return new URL(u, location.href).href; } catch (e) { return u; } };
  var WURL = abs(CFG.worker || DIR + 'correcteur-worker.js'), EURL = abs(CFG.engine || DIR + 'grammalecte/');
  var KEY = 'mag-correcteur', worker = null, seq = 0, pending = {}, initP = null;

  /* ---------------- réglages (communs à toutes les applis du même site) ---------------- */
  function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function lsSet(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } }
  var S = Object.assign({ ignore: [], typo: false, style: true }, lsGet());
  function save() { lsSet(S); }
  function engineOpts() {
    // typographie stricte (apostrophes courbes, insécables…) : inutile pour un texte tapé au clavier ; désactivée par défaut
    var t = !!S.typo, st = S.style !== false;
    return { apos: t, typo: t, nbsp: t, esp: t, unit: t, num: t, bs: st, pleo: st, redon1: false, redon2: false };
  }

  /* ---------------- tâche de fond ---------------- */
  function call(cmd, data) {
    if (!worker) {
      try { worker = new Worker(WURL); } catch (e) { return Promise.reject(new Error('Correcteur indisponible : ' + e.message)); }
      worker.onmessage = function (e) { var d = e.data || {}, p = pending[d.id]; if (!p) return; delete pending[d.id]; if (d.ok) p.res(d.res); else p.rej(new Error(d.err)); };
      worker.onerror = function (e) { Object.keys(pending).forEach(function (k) { pending[k].rej(new Error('Le correcteur n\'a pas pu démarrer' + (e && e.message ? ' : ' + e.message : ''))); delete pending[k]; }); };
    }
    return new Promise(function (res, rej) { var id = ++seq; pending[id] = { res: res, rej: rej }; worker.postMessage(Object.assign({ id: id, cmd: cmd, base: EURL }, data || {})); });
  }
  function ready() { if (!initP) initP = call('options', { set: engineOpts() }).catch(function (e) { initP = null; throw e; }); return initP; }
  var M = window.MagCorrecteur = {
    ready: ready,
    check: function (t) { return ready().then(function () { return call('check', { text: t, opts: { ignore: S.ignore } }); }); },
    suggest: function (w) { return ready().then(function () { return call('suggest', { word: w }); }); },
    word: function (w) { return ready().then(function () { return call('word', { word: w }); }); },
    conj: function (v, o) { return ready().then(function () { return call('conj', Object.assign({ verb: v }, o || {})); }); },
    settings: S,
    setSetting: function (k, v) { S[k] = v; save(); if (worker) call('options', { set: engineOpts() }); },
    addWord: function (w) { w = String(w || '').trim(); if (w && S.ignore.indexOf(w) < 0) { S.ignore.push(w); if (S.ignore.length > 2000) S.ignore.shift(); save(); } },
    removeWord: function (w) { S.ignore = S.ignore.filter(function (x) { return x !== w; }); save(); }
  };

  /* ---------------- adaptateurs de champs ---------------- */
  function fire(el) { try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' })); } catch (e) { el.dispatchEvent(new Event('input', { bubbles: true })); } try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { } }
  var BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TR|TD|TH|SECTION|ARTICLE|HEADER|FOOTER|UL|OL|DT|DD|FIGCAPTION)$/;
  function editableMap(root) {
    // texte d'un élément modifiable : nœuds texte en ordre, un saut de ligne entre blocs et pour <br>
    var parts = [], txt = '';
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { parts.push({ n: c, s: txt.length }); txt += c.data; }
        else if (c.nodeType === 1) {
          if (c.getAttribute('contenteditable') === 'false' || /^(SCRIPT|STYLE)$/.test(c.tagName)) continue;
          if (c.tagName === 'BR') { txt += '\n'; continue; }
          var blk = BLOCK.test(c.tagName); if (blk && txt && !/\n$/.test(txt)) txt += '\n';
          walk(c); if (blk && txt && !/\n$/.test(txt)) txt += '\n';
        }
      }
    })(root);
    return { text: txt, parts: parts };
  }
  function posIn(map, off, end) {
    for (var i = 0; i < map.parts.length; i++) { var p = map.parts[i], L = p.n.data.length; if (off >= p.s && (off < p.s + L || (end && off === p.s + L))) return { node: p.n, off: off - p.s }; }
    var last = map.parts[map.parts.length - 1]; return last ? { node: last.n, off: last.n.data.length } : null;
  }
  M.adapter = function (el) {
    if (!el) return null;
    if (typeof el.getText === 'function') return el;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return { el: el, label: el.getAttribute('aria-label') || el.placeholder || '',
        getText: function () { return el.value; },
        replace: function (s, e, t) { el.focus(); if (el.setRangeText) el.setRangeText(t, s, e, 'end'); else el.value = el.value.slice(0, s) + t + el.value.slice(e); fire(el); },
        select: function (s, e) { try { el.focus({ preventScroll: true }); el.setSelectionRange(s, e); } catch (x) { } } };
    }
    var root = el.isContentEditable ? (function (r) { while (r.parentElement && r.parentElement.isContentEditable) r = r.parentElement; return r; })(el) : el;
    return { el: root, label: root.getAttribute('aria-label') || '',
      getText: function () { return editableMap(root).text; },
      replace: function (s, e, t) {
        var map = editableMap(root), a = posIn(map, s, false), b = posIn(map, e, true); if (!a || !b) return;
        var r = document.createRange(); r.setStart(a.node, a.off); r.setEnd(b.node, b.off);
        root.focus(); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        // insertText garde l'annulation (Ctrl+Z) et prévient l'éditeur de l'appli ; sinon remplacement direct
        var ok = false; try { ok = document.execCommand('insertText', false, t); } catch (x) { }
        if (!ok) { r.deleteContents(); r.insertNode(document.createTextNode(t)); fire(root); }
      },
      select: function (s, e) { var map = editableMap(root), a = posIn(map, s, false), b = posIn(map, e, true); if (!a || !b) return; var r = document.createRange(); r.setStart(a.node, a.off); r.setEnd(b.node, b.off); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); try { (a.node.parentElement || root).scrollIntoView({ block: 'nearest' }); } catch (x) { } } };
  };
  M.editableText = function (el) { return editableMap(el).text; };

  /* ---------------- interface ---------------- */
  var CSS = '.mgc{position:fixed;z-index:2147483000;right:12px;top:12px;bottom:12px;width:min(420px,calc(100vw - 24px));display:flex;flex-direction:column;background:var(--mgc-bg,#fff);color:var(--mgc-tx,#1d2330);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}' +
    '@media (max-width:640px){.mgc{left:0;right:0;bottom:0;top:auto;width:auto;max-height:78vh;border-radius:16px 16px 0 0}}' +
    '@media (prefers-color-scheme:dark){.mgc{--mgc-bg:#1d2129;--mgc-tx:#e8eaf0;--mgc-mut:#9aa3b2;--mgc-line:#333a46;--mgc-chip:#2a303b;--mgc-hi:#3a2f12}}' +
    '.mgc *{box-sizing:border-box}.mgc-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--mgc-line,#e4e7ec)}.mgc-h b{flex:1;font-size:16px}' +
    '.mgc-tabs{display:flex;gap:4px;padding:8px 10px 0}.mgc-tab{border:0;background:none;color:var(--mgc-mut,#5b6474);padding:6px 10px;border-radius:8px;font:inherit;cursor:pointer}.mgc-tab.on{background:var(--mgc-chip,#eef1f5);color:inherit;font-weight:600}' +
    '.mgc-x{border:0;background:var(--mgc-chip,#eef1f5);color:inherit;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer}' +
    '.mgc-b{flex:1;overflow:auto;padding:10px 12px 16px}.mgc-sum{color:var(--mgc-mut,#5b6474);margin:2px 2px 10px}' +
    '.mgc-c{border:1px solid var(--mgc-line,#e4e7ec);border-radius:12px;padding:10px 12px;margin-bottom:10px;cursor:pointer}.mgc-c.on{border-color:#2f6fed;box-shadow:0 0 0 2px rgba(47,111,237,.18)}' +
    '.mgc-k{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}.mgc-k.gram{color:#2f6fed}.mgc-k.ortho{color:#d33}' +
    '.mgc-ctx{font-family:Georgia,"Noto Serif",serif;font-size:15px;margin:2px 0 6px;word-break:break-word}.mgc-ctx mark{background:var(--mgc-hi,#fff1c2);color:inherit;border-bottom:2px solid #d33;padding:0 1px}.mgc-ctx mark.gram{border-bottom-color:#2f6fed}' +
    '.mgc-m{margin:0 0 8px}.mgc-s{display:flex;flex-wrap:wrap;gap:6px}.mgc-btn{border:1px solid var(--mgc-line,#d5dae2);background:var(--mgc-chip,#f6f7f9);color:inherit;border-radius:999px;padding:5px 12px;font:inherit;cursor:pointer}' +
    '.mgc-btn.pri{background:#2f6fed;border-color:#2f6fed;color:#fff;font-weight:600}.mgc-btn.lnk{border:0;background:none;color:#2f6fed;padding:5px 4px}.mgc-ok{text-align:center;padding:30px 10px;color:var(--mgc-mut,#5b6474)}.mgc-ok b{display:block;font-size:40px;color:#1a9e5b}' +
    '.mgc-in{width:100%;padding:9px 12px;border:1px solid var(--mgc-line,#d5dae2);border-radius:10px;font:inherit;background:var(--mgc-bg,#fff);color:inherit}' +
    '.mgc-t{width:100%;border-collapse:collapse;font-size:13px;margin:4px 0 10px}.mgc-t td{padding:2px 4px;vertical-align:top}.mgc-t th{text-align:left;padding:8px 4px 2px;color:#2f6fed;font-size:12px}' +
    '.mgc-g{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.mgc-g h4{margin:10px 0 2px;font-size:13px;color:#2f6fed}.mgc-g div{font-size:13px}' +
    '.mgc-fab{position:absolute;z-index:2147482999;border:0;border-radius:999px;padding:4px 10px;font:600 12px system-ui,sans-serif;background:#2f6fed;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;opacity:.92}' +
    '.mgc-load{display:flex;gap:8px;align-items:center;color:var(--mgc-mut,#5b6474);padding:14px 2px}.mgc-load i{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:mgcr .8s linear infinite}@keyframes mgcr{to{transform:rotate(360deg)}}';
  function css() { if (document.getElementById('mgc-css')) return; var s = document.createElement('style'); s.id = 'mgc-css'; s.textContent = CSS; document.head.appendChild(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function msgHtml(m) { return esc(m).replace(/[“«]\s?([^”»]+?)\s?[”»]/g, '« <b>$1</b> »'); }
  var panel = null;
  function close() { if (panel) { panel.remove(); panel = null; document.removeEventListener('keydown', escKey, true); } }
  function escKey(e) { if (e.key === 'Escape' && panel) { e.stopPropagation(); close(); } }
  function shell(title) {
    css(); close();
    panel = document.createElement('div'); panel.className = 'mgc'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', title);
    panel.innerHTML = '<div class="mgc-h"><b></b><button type="button" class="mgc-x" aria-label="Fermer" title="Fermer (Échap)">×</button></div><div class="mgc-tabs"><button type="button" class="mgc-tab on" data-t="cor">Correction</button><button type="button" class="mgc-tab" data-t="dic">Dictionnaire</button><button type="button" class="mgc-tab" data-t="reg">Réglages</button></div><div class="mgc-b"></div>';
    panel.querySelector('b').textContent = title;
    panel.querySelector('.mgc-x').onclick = close;
    document.body.appendChild(panel); document.addEventListener('keydown', escKey, true);
    return panel;
  }
  function tabs(p, onCor) {
    p.querySelectorAll('.mgc-tab').forEach(function (b) { b.onclick = function () { p.querySelectorAll('.mgc-tab').forEach(function (x) { x.classList.toggle('on', x === b); }); var t = b.dataset.t; if (t === 'cor') onCor(); else if (t === 'dic') dicoIn(p.querySelector('.mgc-b'), ''); else reglages(p.querySelector('.mgc-b')); }; });
  }
  function loading(b, t) { b.innerHTML = '<div class="mgc-load"><i></i>' + esc(t || 'Vérification…') + '</div>'; }

  /** Fenêtre de correction d'un champ */
  M.open = function (target, opt) {
    opt = opt || {};
    var A = M.adapter(target || document.activeElement);
    var p = shell(opt.title || 'Correcteur');
    var B = p.querySelector('.mgc-b'), skipped = new Set(), sel = -1;
    tabs(p, run);
    if (!A) { dicoIn(B, opt.word || ''); p.querySelectorAll('.mgc-tab').forEach(function (x) { x.classList.toggle('on', x.dataset.t === 'dic'); }); return; }
    function run() {
      loading(B, 'Vérification du texte…');
      var text = A.getText();
      M.check(text).then(function (list) {
        if (!panel || panel !== p) return;
        list = list.filter(function (x) { return !skipped.has(x.s + ':' + text.slice(x.s, x.e)); });
        if (!text.trim()) { B.innerHTML = '<div class="mgc-ok">Le champ est vide.</div>'; return; }
        if (!list.length) { B.innerHTML = '<div class="mgc-ok"><b>✓</b>Aucune faute trouvée.<br><small>Orthographe, grammaire et conjugaison vérifiées sur l\'appareil.</small></div>'; if (opt.onDone) opt.onDone(0); return; }
        var ng = list.filter(function (x) { return x.t === 'gram'; }).length, no = list.length - ng;
        B.innerHTML = '<p class="mgc-sum">' + list.length + ' point' + (list.length > 1 ? 's' : '') + ' à revoir : ' + no + ' en orthographe, ' + ng + ' en grammaire. Touchez une suggestion pour corriger.</p>';
        list.forEach(function (x, i) {
          var a = Math.max(0, x.s - 40), b = Math.min(text.length, x.e + 40);
          var c = document.createElement('div'); c.className = 'mgc-c'; c.dataset.i = i;
          c.innerHTML = '<div class="mgc-k ' + x.t + '">' + (x.t === 'ortho' ? 'Orthographe' : 'Grammaire') + '</div>' +
            '<div class="mgc-ctx">' + (a > 0 ? '…' : '') + esc(text.slice(a, x.s)).replace(/\n/g, ' ') + '<mark class="' + x.t + '">' + esc(text.slice(x.s, x.e)) + '</mark>' + esc(text.slice(x.e, b)).replace(/\n/g, ' ') + (b < text.length ? '…' : '') + '</div>' +
            '<p class="mgc-m">' + msgHtml(x.msg) + '</p><div class="mgc-s">' +
            (x.sugg || []).slice(0, 6).map(function (s, k) { return '<button type="button" class="mgc-btn' + (k ? '' : ' pri') + '" data-s="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') +
            (x.sugg && x.sugg.length ? '' : '<span class="mgc-sum" style="margin:0">Pas de suggestion.</span>') +
            '<button type="button" class="mgc-btn lnk" data-ign>Ignorer</button>' +
            (x.t === 'ortho' ? '<button type="button" class="mgc-btn lnk" data-add>Ajouter au dictionnaire</button>' : '') +
            (x.t === 'ortho' || (x.e - x.s < 30) ? '<button type="button" class="mgc-btn lnk" data-dico>Dictionnaire</button>' : '') +
            (x.url ? '<button type="button" class="mgc-btn lnk" data-url>En savoir plus</button>' : '') + '</div>';
          c.onclick = function (ev) {
            var t = ev.target.closest('button'), cur = A.getText();
            if (cur.slice(x.s, x.e) !== text.slice(x.s, x.e)) { run(); return; }   // le texte a changé entre-temps : on revérifie
            if (!t) { A.select(x.s, x.e); B.querySelectorAll('.mgc-c').forEach(function (k) { k.classList.toggle('on', k === c); }); return; }
            if (t.dataset.s != null) { A.replace(x.s, x.e, t.dataset.s); run(); }
            else if (t.hasAttribute('data-ign')) { skipped.add(x.s + ':' + text.slice(x.s, x.e)); c.remove(); }
            else if (t.hasAttribute('data-add')) { M.addWord(text.slice(x.s, x.e)); run(); }
            else if (t.hasAttribute('data-dico')) { p.querySelectorAll('.mgc-tab').forEach(function (k) { k.classList.toggle('on', k.dataset.t === 'dic'); }); dicoIn(B, x.word || text.slice(x.s, x.e)); }
            else if (t.hasAttribute('data-url')) { try { if (window.MAGPC && MAGPC.nativeOpen) MAGPC.nativeOpen(x.url, '_blank'); else window.open(x.url, '_blank', 'noopener'); } catch (e2) { } }
          };
          B.appendChild(c);
        });
        if (opt.onDone) opt.onDone(list.length);
      }).catch(function (e) { B.innerHTML = '<div class="mgc-ok" style="color:#d33">' + esc(e.message) + '</div>'; });
    }
    if (opt.word) { p.querySelectorAll('.mgc-tab').forEach(function (x) { x.classList.toggle('on', x.dataset.t === 'dic'); }); dicoIn(B, opt.word); } else run();
    return { close: close, recheck: run };
  };
  M.close = close;

  /** Dictionnaire : nature, synonymes, conjugaison */
  M.dico = function (w) { var p = shell('Dictionnaire'); tabs(p, function () { p.querySelector('.mgc-b').innerHTML = '<div class="mgc-ok">Ouvrez le correcteur depuis un texte pour le vérifier.</div>'; }); p.querySelectorAll('.mgc-tab').forEach(function (x) { x.classList.toggle('on', x.dataset.t === 'dic'); }); dicoIn(p.querySelector('.mgc-b'), w || ''); };
  var TEMPS = [['Indicatif', [['t_ipre', 'ipre'], ['t_iimp', 'iimp'], ['t_ipsi', 'ipsi'], ['t_ifut', 'ifut']]], ['Conditionnel', [['t_conda', 'conda'], ['t_condb', 'condb']]], ['Subjonctif', [['t_spre', 'spre'], ['t_simp', 'simp']]]];
  function conjHtml(c) {
    var T = c.table, h = '<p class="mgc-sum" style="margin:6px 0">' + esc(c.info || '') + '</p><p style="margin:0 0 4px"><b>Participe présent</b> ' + esc(T.ppre) + ' · <b>Participe passé</b> ' + esc([T.ppas1, T.ppas2, T.ppas3, T.ppas4].filter(Boolean).join(', ')) + '</p>';
    TEMPS.forEach(function (g) { h += '<h4 style="margin:12px 0 0">' + g[0] + '</h4><div class="mgc-g">'; g[1].forEach(function (t) { if (!T[t[0]]) return; h += '<div><h4>' + esc(T[t[0]]) + '</h4>' + [1, 2, 3, 4, 5, 6].map(function (k) { return esc(T[t[1] + k] || ''); }).join('<br>') + '</div>'; }); h += '</div>'; });
    if (T.t_impe) h += '<h4 style="margin:12px 0 0">Impératif ' + esc(T.t_impe.toLowerCase()) + '</h4><div style="font-size:13px">' + esc([T.impe1, T.impe2, T.impe3].filter(Boolean).join(' · ')) + '</div>';
    return h;
  }
  function dicoIn(B, w) {
    css();
    B.innerHTML = '<input class="mgc-in" type="search" placeholder="Un mot ou un verbe (ex. « mangeaient », « aller »)" aria-label="Mot à chercher"><div class="mgc-dr" style="margin-top:10px"></div>';
    var inp = B.querySelector('input'), R = B.querySelector('.mgc-dr'), t = 0;
    function go() {
      var v = inp.value.trim().split(/\s+/)[0] || ''; if (!v) { R.innerHTML = '<p class="mgc-sum">Nature du mot, mot de base, synonymes et conjugaison complète des verbes, sans Internet.</p>'; return; }
      loading(R, 'Recherche…');
      M.word(v).then(function (r) {
        var h = '<p style="font-size:20px;margin:0 0 4px"><b>' + esc(r.word) + '</b> ' + (r.known ? '<span style="color:#1a9e5b;font-size:13px">✓ bien écrit</span>' : '<span style="color:#d33;font-size:13px">mot inconnu</span>') + '</p>';
        if (!r.known && r.sugg && r.sugg.length) h += '<p class="mgc-m">Vouliez-vous dire : ' + r.sugg.map(function (s) { return '<button type="button" class="mgc-btn" data-w="' + esc(s) + '">' + esc(s) + '</button>'; }).join(' ') + '</p>';
        if (r.labels && r.labels.length) h += '<p class="mgc-m">' + r.labels.map(function (l) { return '• ' + esc(String(l).trim()); }).join('<br>') + '</p>';
        if (r.lemmas && r.lemmas.length && !(r.lemmas.length === 1 && r.lemmas[0] === r.word)) h += '<p class="mgc-m">Mot de base : ' + r.lemmas.map(function (l) { return '<button type="button" class="mgc-btn" data-w="' + esc(l) + '">' + esc(l) + '</button>'; }).join(' ') + '</p>';
        if (r.syns && r.syns.length) h += '<h4 style="margin:12px 0 4px;color:#2f6fed">Synonymes</h4>' + r.syns.map(function (s) { return '<p class="mgc-m"><i>' + esc(String(s[0]).replace(/[()]/g, '')) + '</i> — ' + s[1].map(function (x) { return '<a href="#" data-w="' + esc(x) + '" style="color:inherit">' + esc(x) + '</a>'; }).join(', ') + '</p>'; }).join('');
        if (r.verb) h += '<div class="mgc-cj"><h4 style="margin:14px 0 0;color:#2f6fed">Conjugaison de « ' + esc(r.verb) + ' »</h4><div class="mgc-load"><i></i>…</div></div>';
        R.innerHTML = h;
        R.querySelectorAll('[data-w]').forEach(function (b) { b.onclick = function (e) { e.preventDefault(); inp.value = b.dataset.w; go(); }; });
        if (r.verb) M.conj(r.verb).then(function (c) { var box = R.querySelector('.mgc-cj'); if (box && c) box.innerHTML = '<h4 style="margin:14px 0 0;color:#2f6fed">Conjugaison de « ' + esc(r.verb) + ' »</h4>' + conjHtml(c); });
      }).catch(function (e) { R.innerHTML = '<p style="color:#d33">' + esc(e.message) + '</p>'; });
    }
    inp.oninput = function () { clearTimeout(t); t = setTimeout(go, 350); };
    inp.value = w || ''; go(); if (!w) setTimeout(function () { inp.focus(); }, 50);
  }
  M.dicoIn = dicoIn;
  function reglages(B) {
    B.innerHTML = '<label style="display:flex;gap:10px;margin:8px 2px"><input type="checkbox" data-k="style"' + (S.style !== false ? ' checked' : '') + '><span><b>Conseils de style</b><br><small>Pléonasmes (« monter en haut »), tournures populaires (« malgré que »).</small></span></label>' +
      '<label style="display:flex;gap:10px;margin:12px 2px"><input type="checkbox" data-k="typo"' + (S.typo ? ' checked' : '') + '><span><b>Typographie stricte</b><br><small>Apostrophes et guillemets typographiques, espaces insécables, espaces en trop. Utile pour un document à imprimer.</small></span></label>' +
      '<h4 style="margin:16px 2px 6px">Mots ajoutés au dictionnaire (' + S.ignore.length + ')</h4><div class="mgc-s mgc-words">' + (S.ignore.length ? S.ignore.slice().sort().map(function (w) { return '<button type="button" class="mgc-btn" data-rm="' + esc(w) + '" title="Retirer">' + esc(w) + ' ×</button>'; }).join('') : '<span class="mgc-sum">Aucun. Utilisez « Ajouter au dictionnaire » sur un nom propre ou un mot technique.</span>') + '</div>' +
      '<p class="mgc-sum" style="margin-top:18px">Moteur : Grammalecte (grammalecte.net, licence libre GPL). Tout se fait sur l\'appareil, sans Internet.</p>';
    B.querySelectorAll('input[data-k]').forEach(function (c) { c.onchange = function () { M.setSetting(c.dataset.k, c.checked); }; });
    B.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { M.removeWord(b.dataset.rm); reglages(B); }; });
  }

  /* ---------------- raccourcis et boutons ---------------- */
  function editableOf(el) {
    if (!el || el === document.body) return null;
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|)$/i.test(el.type || '') && el.type !== 'email')) return el;
    if (el.isContentEditable) return el;
    return null;
  }
  M.editableOf = editableOf;
  var hkGet = null;
  M.hotkey = function (getTarget) {
    if (getTarget) hkGet = getTarget;
    if (M._hk) return; M._hk = true;
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'F7' || e.ctrlKey || e.altKey || e.metaKey) return;
      var t = (hkGet && hkGet()) || editableOf(document.activeElement);
      e.preventDefault(); e.stopPropagation(); if (panel) { close(); return; }
      if (t) M.open(t); else M.dico(String(getSelection() || '').trim());
    }, true);
  };
  /** Petit bouton « Corriger » qui apparaît sous le champ de texte où l'on écrit (zones de texte, éditeurs) */
  M.auto = function () {
    if (M._auto) return; M._auto = true; css();
    var chip = document.createElement('button'); chip.type = 'button'; chip.className = 'mgc-fab'; chip.textContent = '✓ Corriger'; chip.title = 'Vérifier l\'orthographe et la grammaire (F7)'; chip.hidden = true;
    chip.style.position = 'fixed'; var field = null, hideT = 0;
    chip.addEventListener('pointerdown', function (e) { e.preventDefault(); });   // le champ garde le curseur
    chip.onclick = function () { if (field) M.open(field); chip.hidden = true; };
    document.body.appendChild(chip);
    function place() {
      if (!field || !document.contains(field)) { chip.hidden = true; return; }
      var r = field.getBoundingClientRect(); if (r.width < 120 || r.height < 28) { chip.hidden = true; return; }
      var y = Math.min(r.bottom, innerHeight - 8) - 30, x = Math.min(r.right, innerWidth - 8) - chip.offsetWidth - 6;
      if (y < r.top + 2) y = r.top + 2;
      chip.style.left = Math.max(4, x) + 'px'; chip.style.top = Math.max(4, y) + 'px';
    }
    document.addEventListener('focusin', function (e) {
      var t = e.target; if (panel && panel.contains(t)) return;
      var f = t && (t.tagName === 'TEXTAREA' ? t : t.isContentEditable ? t : null);
      if (!f || f.closest('[data-mgc="off"]') || f.readOnly) return;
      clearTimeout(hideT); field = f; chip.hidden = false; place();
    });
    document.addEventListener('focusout', function () { clearTimeout(hideT); hideT = setTimeout(function () { var a = document.activeElement; if (!a || a === document.body || !(a === field || (field && field.contains(a)))) chip.hidden = true; }, 250); });
    addEventListener('scroll', function () { if (!chip.hidden) place(); }, true);
    addEventListener('resize', function () { if (!chip.hidden) place(); });
    document.addEventListener('input', function () { if (!chip.hidden) place(); }, true);
  };
  if (CFG.auto) { var go = function () { M.auto(); M.hotkey(); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); }
  M.button = function (field, label) {
    css(); var b = document.createElement('button'); b.type = 'button'; b.className = 'mgc-btn'; b.textContent = label || '✓ Corriger';
    b.title = 'Vérifier l\'orthographe et la grammaire (F7)'; b.onclick = function () { M.open(typeof field === 'function' ? field() : field); }; return b;
  };
})();
