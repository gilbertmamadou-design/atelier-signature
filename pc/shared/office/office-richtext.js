/* =====================================================================
   Suite MAG — texte riche commun (zones de texte de Présentation, futur Texte, cellules de Tableur).
   Office.RichText :
     attach(el, {onInput, onKey, placeholder}) / detach(el)   rend un élément éditable (correcteur du navigateur, collage nettoyé)
     editing()                       élément éditable qui a le curseur (ou null)
     apply(cmd, valeur, cible?)      mise en forme de la sélection, ou de tout le texte de « cible » (élément non édité)
        cmd : bold italic underline strike sup sub | font size color highlight spacing case | align (left|center|right|justify)
              list (ul|ol|none) listStyle (disc|circle|square|dash|arrow|check|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman)
              indent outdent lineHeight spaceBefore spaceAfter | link unlink | clear | grow shrink
     state(cible?)                   {bold, italic, underline, strike, sup, sub, font, size(pt), color, highlight, align, list, listStyle, lineHeight, link}
     sanitize(html) / textOf(html) / fromText(texte) / isEmpty(html)
   Les styles sont posés en ligne (span style=…) : le HTML produit reste lisible par les exports (.pptx, .docx).
   Les couleurs de thème s'écrivent « var(--t-accent1) » : elles suivent le thème choisi.
   ===================================================================== */
(function () {
  'use strict';
  const O = window.Office;
  const RT = O.RichText = {};
  const BLOCKS = /^(P|DIV|LI|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|UL|OL)$/;

  /* ---------------- Nettoyage ---------------- */
  const TAGS = { P: 1, DIV: 1, BR: 1, SPAN: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, SUB: 1, SUP: 1, A: 1, UL: 1, OL: 1, LI: 1, FONT: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, CODE: 1, MARK: 1, INS: 1, SMALL: 1 };
  const STYLES = ['font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'text-align', 'line-height', 'margin-left', 'margin-top', 'margin-bottom', 'padding-left', 'list-style-type', 'letter-spacing', 'text-transform', 'vertical-align', 'text-indent', 'font-variant'];
  RT.sanitize = function (html, opt) {
    opt = opt || {};
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
    (function walk(n) {
      Array.from(n.childNodes).forEach((c) => {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1) { c.remove(); return; }
        const t = c.tagName;
        if (/^(SCRIPT|STYLE|META|LINK|TITLE|HEAD|IFRAME|OBJECT|EMBED|SVG|MATH|NOSCRIPT|TEMPLATE|XML)$/.test(t) || c.namespaceURI !== 'http://www.w3.org/1999/xhtml') { c.remove(); return; }
        walk(c);
        if (!TAGS[t]) {
          if (t === 'TABLE' || t === 'TR') { const d = document.createElement('div'); while (c.firstChild) d.appendChild(c.firstChild); c.replaceWith(d); return; }
          if (t === 'TD' || t === 'TH') { c.replaceWith(...Array.from(c.childNodes), document.createTextNode(' ')); return; }
          if (t === 'IMG') { c.remove(); return; }
          c.replaceWith(...Array.from(c.childNodes)); return;
        }
        // <font> → <span style>
        let el = c;
        if (t === 'FONT') {
          const s = document.createElement('span');
          if (c.getAttribute('face')) s.style.fontFamily = c.getAttribute('face');
          if (c.getAttribute('color')) s.style.color = c.getAttribute('color');
          if (c.style && c.style.cssText) s.style.cssText += c.style.cssText;
          while (c.firstChild) s.appendChild(c.firstChild);
          c.replaceWith(s); el = s;
        }
        const keep = {};
        STYLES.forEach((p) => { const v = el.style && el.style.getPropertyValue(p); if (v && !/expression|url\(/i.test(v)) keep[p] = v; });
        if (opt.plainStyles) Object.keys(keep).forEach((k) => { if (!/^(font-weight|font-style|text-decoration|text-decoration-line|text-align|vertical-align)$/.test(k)) delete keep[k]; });
        const href = el.tagName === 'A' ? el.getAttribute('href') : null;
        Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
        Object.keys(keep).forEach((p) => el.style.setProperty(p, keep[p]));
        if (href && /^(https?:|mailto:|tel:|#)/i.test(href)) el.setAttribute('href', href);
        if (el.tagName === 'SPAN' && !el.getAttribute('style')) el.replaceWith(...Array.from(el.childNodes));
      });
    })(tpl.content);
    return tpl.innerHTML.replace(/​/g, '');
  };
  RT.textOf = (html) => { const d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<\/(p|div|li|h\d)>/gi, '\n</$1>').replace(/<br\s*\/?>/gi, '\n'); return (d.textContent || '').replace(/​/g, '').replace(/\n{3,}/g, '\n\n').trim(); };
  RT.isEmpty = (html) => !RT.textOf(html).trim() && !/<(img|hr)/i.test(html || '');
  RT.fromText = (t, block) => String(t || '').split(/\r?\n/).map((l) => '<' + (block || 'div') + '>' + (O.esc(l) || '<br>') + '</' + (block || 'div') + '>').join('');
  RT.listFromLines = (lines, ordered) => { const tag = ordered ? 'ol' : 'ul'; let h = '', lv = 0; lines.forEach((l) => { const m = /^(\s*)(.*)$/.exec(l), n = Math.min(4, Math.floor(m[1].replace(/\t/g, '  ').length / 2)); while (lv < n + 1) { h += '<' + tag + '>'; lv++; } while (lv > n + 1) { h += '</' + tag + '>'; lv--; } h += '<li>' + (O.esc(m[2]) || '<br>') + '</li>'; }); while (lv-- > 0) h += '</' + tag + '>'; return h; };

  /* ---------------- Édition ---------------- */
  let current = null;
  /** Zone éditable qui a le focus (racine attachée par attach), sinon null */
  RT.editing = () => {
    const a = document.activeElement; if (!a || !a.isContentEditable) return null;
    let n = a; while (n.parentNode && n.parentNode.isContentEditable) n = n.parentNode;
    return n._rt ? n : null;
  };
  RT.lastAttached = () => (current && document.contains(current) ? current : null);
  RT.attach = function (el, opt) {
    opt = opt || {};
    el.contentEditable = 'true'; el.spellcheck = true; el.setAttribute('lang', 'fr');
    el.setAttribute('role', 'textbox'); el.setAttribute('aria-multiline', 'true');
    current = el;
    try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) { }
    const onPaste = (e) => {
      const dt = e.clipboardData; if (!dt) return;
      if (opt.onPaste && opt.onPaste(e) === false) return;
      const html = dt.getData('text/html'), text = dt.getData('text/plain');
      if (!html && !text) return;
      e.preventDefault();
      if (html && !RT._plainNext) { let h = RT.sanitize(html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '')); document.execCommand('insertHTML', false, h); }
      else document.execCommand('insertText', false, text);
      RT._plainNext = false;
      opt.onInput && opt.onInput();
    };
    const onKey = (e) => {
      if (opt.onKey && opt.onKey(e) === false) return;
      if (e.key === 'Tab') {
        const li = closest(selNode(), 'LI', el);
        if (li || opt.tabIndent !== false) { e.preventDefault(); RT.apply(e.shiftKey ? 'outdent' : 'indent'); opt.onInput && opt.onInput(); }
      }
    };
    const onInput = () => { fixEmpty(el); opt.onInput && opt.onInput(); };
    el.addEventListener('paste', onPaste); el.addEventListener('keydown', onKey); el.addEventListener('input', onInput);
    el._rt = { onPaste, onKey, onInput, opt };
    return el;
  };
  RT.detach = function (el) {
    if (!el || !el._rt) return;
    el.removeEventListener('paste', el._rt.onPaste); el.removeEventListener('keydown', el._rt.onKey); el.removeEventListener('input', el._rt.onInput);
    delete el._rt; el.removeAttribute('contenteditable'); el.removeAttribute('role'); el.removeAttribute('aria-multiline');
    if (current === el) current = null;
    cleanup(el);
  };
  function fixEmpty(el) { if (el.innerHTML === '<br>') el.innerHTML = ''; }
  function selNode() { const s = getSelection(); return s && s.rangeCount ? s.focusNode : null; }
  function closest(n, tag, root) { while (n && n !== root) { if (n.nodeType === 1 && (typeof tag === 'string' ? n.tagName === tag : tag.test(n.tagName))) return n; n = n.parentNode; } return null; }
  RT.closest = closest;
  RT.selectAll = function (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  RT.saveSel = () => { const s = getSelection(); return s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null; };
  RT.restoreSel = (r) => { if (!r) return; const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  RT.placeCaretEnd = (el) => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };

  /** Exécute fn avec la totalité du texte de « target » sélectionnée (élément non édité) ; rend la main proprement */
  function withAll(target, fn) {
    const was = target.isContentEditable, saved = RT.saveSel(), act = document.activeElement;
    if (!was) target.contentEditable = 'true';
    try { target.focus({ preventScroll: true }); } catch (e) { }
    try { document.execCommand('styleWithCSS', false, true); } catch (e) { }
    RT.selectAll(target);
    try { fn(); } finally {
      if (!was) { target.removeAttribute('contenteditable'); const s = getSelection(); s.removeAllRanges(); try { if (act && act !== target && act.focus && act !== document.body) act.focus({ preventScroll: true }); else target.blur(); } catch (e) { } }
      else RT.restoreSel(saved);
      cleanup(target);
    }
  }
  function rootOf(n) { while (n && n.nodeType !== 1) n = n.parentNode; while (n && !n.isContentEditable) n = n.parentNode; if (!n) return null; while (n.parentNode && n.parentNode.isContentEditable) n = n.parentNode; return n; }

  /** Pose une propriété CSS sur le texte sélectionné (découpe des nœuds texte, sans execCommand) */
  function styleRange(prop, value, root) {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0); root = root || rootOf(r.commonAncestorContainer); if (!root) return;
    if (r.collapsed) {
      // curseur : un span vide (avec espace sans chasse) reçoit le style de la frappe suivante
      const sp = document.createElement('span'); sp.style.setProperty(prop, value); sp.textContent = '​';
      r.insertNode(sp); const r2 = document.createRange(); r2.setStart(sp.firstChild, 1); r2.collapse(true); s.removeAllRanges(); s.addRange(r2); return;
    }
    // découpe aux bornes
    let sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    if (ec.nodeType === 3 && eo < ec.length && eo > 0) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0 && so < sc.length) { const nn = sc.splitText(so); if (ec === sc) { ec = nn; eo = eo - so; } sc = nn; so = 0; }
    const rr = document.createRange();
    try { rr.setStart(sc, so); rr.setEnd(ec, eo); } catch (e) { rr.selectNodeContents(root); }
    const texts = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const t = w.currentNode; if (!t.length) continue; if (rr.intersectsNode(t)) { const tr = document.createRange(); tr.selectNodeContents(t); if (rr.compareBoundaryPoints(Range.END_TO_START, tr) >= 0 && rr.endContainer !== t) continue; if (rr.compareBoundaryPoints(Range.START_TO_END, tr) <= 0 && rr.startContainer !== t) continue; texts.push(t); } }
    const spans = [];
    texts.forEach((t) => {
      const p = t.parentNode;
      if (p.tagName === 'SPAN' && p.childNodes.length === 1 && p !== root) { p.style.setProperty(prop, value); spans.push(p); return; }
      const sp = document.createElement('span'); sp.style.setProperty(prop, value); p.insertBefore(sp, t); sp.appendChild(t); spans.push(sp);
    });
    // listes : la puce suit la taille / couleur du texte quand tout l'élément est concerné
    if (/^(font-size|color|font-family)$/.test(prop)) {
      const lis = new Set(); texts.forEach((t) => { const li = closest(t, 'LI', root); if (li) lis.add(li); });
      lis.forEach((li) => { const all = []; const w2 = document.createTreeWalker(li, NodeFilter.SHOW_TEXT); while (w2.nextNode()) if (w2.currentNode.textContent.trim() && closest(w2.currentNode, 'LI', root) === li) all.push(w2.currentNode); if (all.every((t) => texts.indexOf(t) >= 0)) li.style.setProperty(prop, value); });
    }
    if (spans.length) { const r3 = document.createRange(); r3.setStartBefore(spans[0]); r3.setEndAfter(spans[spans.length - 1]); s.removeAllRanges(); s.addRange(r3); }
  }
  /** Retire une propriété des descendants de la sélection (ex. avant de poser une nouvelle taille) */
  function clearProp(prop, root) {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0);
    O.$$('[style]', root).forEach((n) => { if (r.intersectsNode(n) && n !== root) { const tr = document.createRange(); tr.selectNodeContents(n); if (r.compareBoundaryPoints(Range.START_TO_START, tr) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, tr) >= 0) n.style.removeProperty(prop); } });
  }
  /** Blocs (div, p, li…) touchés par la sélection ; le texte nu de la racine est d'abord mis dans un <div> */
  function blocks(root) {
    const s = getSelection(); if (!s.rangeCount) return [];
    if (Array.from(root.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim() || c.nodeType === 1 && !BLOCKS.test(c.tagName))) {
      const saved = RT.saveSel(); const d = document.createElement('div');
      const kids = Array.from(root.childNodes); let cur = null;
      kids.forEach((c) => { if (c.nodeType === 1 && BLOCKS.test(c.tagName)) { cur = null; return; } if (!cur) { cur = document.createElement('div'); root.insertBefore(cur, c); } cur.appendChild(c); });
      void d; RT.restoreSel(saved);
    }
    const r = s.getRangeAt(0), out = [];
    O.$$('div,p,li,h1,h2,h3,h4,h5,h6,blockquote', root).forEach((b) => { if (r.intersectsNode(b) && !O.$$('div,p,li,h1,h2,h3,blockquote', b).some((x) => r.intersectsNode(x))) out.push(b); });
    if (!out.length) { const b = closest(r.startContainer, /^(DIV|P|LI|H\d|BLOCKQUOTE)$/, root); if (b) out.push(b); }
    return out;
  }
  function cleanup(root) {
    if (!root) return;
    // spans vides, espaces sans chasse inutiles, spans imbriqués identiques
    O.$$('span', root).forEach((sp) => { if (!sp.getAttribute('style')) { sp.replaceWith(...Array.from(sp.childNodes)); return; } if (!sp.textContent && !sp.querySelector('br') && sp !== root) sp.remove(); });
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const zs = [];
    while (w.nextNode()) if (w.currentNode.textContent.indexOf('​') >= 0 && w.currentNode.textContent.length > 1) zs.push(w.currentNode);
    if (!root.isContentEditable) zs.forEach((t) => { t.textContent = t.textContent.replace(/​/g, ''); });
    // fusion de spans voisins de même style
    O.$$('span + span', root).forEach((b) => { const a = b.previousSibling; if (a && a.nodeType === 1 && a.tagName === 'SPAN' && a.getAttribute('style') === b.getAttribute('style')) { while (b.firstChild) a.appendChild(b.firstChild); b.remove(); } });
    root.normalize();
  }
  RT.cleanup = cleanup;

  const PT = (px) => O.round(px * 0.75, 1);
  RT.pxToPt = PT;
  /** Mise en forme. target : élément dont tout le texte est formaté (sans édition en cours) */
  RT.apply = function (cmd, val, target, _root) {
    const ed = _root || RT.editing();
    if (!ed && target) { withAll(target, () => RT.apply(cmd, val, null, target)); return true; }
    const root = ed || target; if (!root) return false;
    const exec = (c, v) => { try { document.execCommand('styleWithCSS', false, true); } catch (e) { } return document.execCommand(c, false, v); };
    switch (cmd) {
      case 'bold': exec('bold'); break;
      case 'italic': exec('italic'); break;
      case 'underline': exec('underline'); break;
      case 'strike': exec('strikeThrough'); break;
      case 'sup': exec('superscript'); break;
      case 'sub': exec('subscript'); break;
      case 'font': clearProp('font-family', root); styleRange('font-family', val, root); break;
      case 'size': clearProp('font-size', root); styleRange('font-size', (typeof val === 'number' ? val + 'pt' : val), root); break;
      case 'grow': case 'shrink': {
        const st = RT.state(root), sz = st.size || 18;
        const steps = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 120, 144];
        const n = cmd === 'grow' ? steps.find((x) => x > sz + 0.01) || sz + 12 : steps.slice().reverse().find((x) => x < sz - 0.01) || Math.max(1, sz - 1);
        clearProp('font-size', root); styleRange('font-size', n + 'pt', root); break;
      }
      case 'color': clearProp('color', root); styleRange('color', val || 'inherit', root); break;
      case 'highlight': clearProp('background-color', root); if (val) styleRange('background-color', val, root); break;
      case 'spacing': clearProp('letter-spacing', root); styleRange('letter-spacing', val ? val + 'pt' : 'normal', root); break;
      case 'case': changeCase(val, root); break;
      case 'align': blocks(root).forEach((b) => { b.style.textAlign = val; }); break;
      case 'list': {
        const want = val; const cur = RT.state(root).list;
        if (want === 'none' || want === cur) exec(cur === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
        else exec(want === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
        O.$$('ul,ol', root).forEach((l) => { l.removeAttribute('class'); });
        break;
      }
      case 'listStyle': {
        let lists = new Set(); blocks(root).forEach((b) => { const l = closest(b, /^(UL|OL)$/, root); if (l) lists.add(l); });
        if (!lists.size) { const ord = /decimal|alpha|roman/.test(val); exec(ord ? 'insertOrderedList' : 'insertUnorderedList'); blocks(root).forEach((b) => { const l = closest(b, /^(UL|OL)$/, root); if (l) lists.add(l); }); }
        const map = { dash: '"– "', arrow: '"➤ "', check: '"✔ "', diamond: '"◆ "', star: '"★ "', square: 'square', circle: 'circle', disc: 'disc' };
        lists.forEach((l) => { l.style.listStyleType = map[val] || val; });
        break;
      }
      case 'indent': {
        const li = closest(selNode(), 'LI', root);
        if (li) exec('indent');
        else blocks(root).forEach((b) => { b.style.marginLeft = ((parseFloat(b.style.marginLeft) || 0) + 36) + 'pt'; });
        break;
      }
      case 'outdent': {
        const li = closest(selNode(), 'LI', root);
        if (li) exec('outdent');
        else blocks(root).forEach((b) => { const m = Math.max(0, (parseFloat(b.style.marginLeft) || 0) - 36); b.style.marginLeft = m ? m + 'pt' : ''; });
        break;
      }
      case 'lineHeight': blocks(root).forEach((b) => { b.style.lineHeight = val; }); break;
      case 'spaceBefore': blocks(root).forEach((b) => { b.style.marginTop = val ? val + 'pt' : ''; }); break;
      case 'spaceAfter': blocks(root).forEach((b) => { b.style.marginBottom = val ? val + 'pt' : ''; }); break;
      case 'link': if (val) { exec('createLink', val); } break;
      case 'unlink': exec('unlink'); break;
      case 'clear': exec('removeFormat'); O.$$('span', root).forEach((s) => { const r = getSelection().rangeCount && getSelection().getRangeAt(0); if (r && r.intersectsNode(s)) s.replaceWith(...Array.from(s.childNodes)); }); blocks(root).forEach((b) => { b.style.removeProperty('line-height'); b.style.removeProperty('text-align'); }); break;
      default: return false;
    }
    cleanup(root);
    return true;
  };
  function changeCase(mode, root) {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0); const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let first = true;
    const nodes = []; while (w.nextNode()) if (r.intersectsNode(w.currentNode)) nodes.push(w.currentNode);
    nodes.forEach((t) => {
      let a = 0, b = t.length; if (t === r.startContainer) a = r.startOffset; if (t === r.endContainer) b = r.endOffset;
      const src = t.textContent, mid = src.slice(a, b);
      let out;
      if (mode === 'upper') out = mid.toLocaleUpperCase('fr');
      else if (mode === 'lower') out = mid.toLocaleLowerCase('fr');
      else if (mode === 'title') out = mid.toLocaleLowerCase('fr').replace(/(^|[\s'’(«-])(\p{L})/gu, (m, p, c) => p + c.toLocaleUpperCase('fr'));
      else if (mode === 'sentence') { out = mid.toLocaleLowerCase('fr'); if (first) out = out.replace(/\p{L}/u, (c) => c.toLocaleUpperCase('fr')); out = out.replace(/([.!?]\s+)(\p{L})/gu, (m, p, c) => p + c.toLocaleUpperCase('fr')); }
      else if (mode === 'toggle') out = Array.from(mid).map((c) => c === c.toLocaleUpperCase('fr') ? c.toLocaleLowerCase('fr') : c.toLocaleUpperCase('fr')).join('');
      else out = mid;
      first = false;
      t.textContent = src.slice(0, a) + out + src.slice(b);
    });
  }

  /** État de mise en forme au curseur (ou au début du texte de « target ») */
  RT.state = function (target) {
    const ed = RT.editing();
    let n = null, root = ed || target;
    if (ed) n = selNode();
    if (!n || !root || !root.contains(n)) { if (!root) return {}; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (w.nextNode()) if (w.currentNode.textContent.replace(/​/g, '').trim()) { n = w.currentNode; break; } if (!n) n = root.querySelector('li,div,p') || root; }
    const e = n.nodeType === 1 ? n : n.parentNode;
    const cs = getComputedStyle(e);
    let deco = '', sup = false, sub = false, link = null;
    for (let x = e; x && x !== root.parentNode; x = x.parentNode) { if (x.nodeType !== 1) continue; const c = getComputedStyle(x); deco += ' ' + (c.textDecorationLine || ''); if (c.verticalAlign === 'super' || x.tagName === 'SUP') sup = true; if (c.verticalAlign === 'sub' || x.tagName === 'SUB') sub = true; if (x.tagName === 'A' && !link) link = x.getAttribute('href'); if (x === root) break; }
    const blk = closest(e, /^(DIV|P|LI|H\d)$/, root) || root;
    const bcs = getComputedStyle(blk);
    const lst = closest(e, /^(UL|OL)$/, root);
    const fam = cs.fontFamily;
    let hl = null; for (let x = e; x && x !== root; x = x.parentNode) { const bg = x.style && x.style.backgroundColor; if (bg && bg !== 'transparent') { hl = bg; break; } }
    const lh = bcs.lineHeight === 'normal' ? 1.2 : parseFloat(blk.style.lineHeight) || O.round(parseFloat(bcs.lineHeight) / parseFloat(bcs.fontSize), 2);
    return {
      bold: parseInt(cs.fontWeight, 10) >= 600, italic: cs.fontStyle === 'italic', underline: /underline/.test(deco), strike: /line-through/.test(deco), sup, sub,
      font: O.fontName(fam), fontStack: fam, size: PT(parseFloat(cs.fontSize)), color: O.cssToHex(cs.color), highlight: hl ? O.cssToHex(hl) : null,
      align: ({ start: 'left', left: 'left', center: 'center', right: 'right', end: 'right', justify: 'justify' })[bcs.textAlign] || 'left',
      list: lst ? lst.tagName.toLowerCase() : null, listStyle: lst ? getComputedStyle(lst).listStyleType : null,
      lineHeight: lh, spaceBefore: PT(parseFloat(bcs.marginTop) || 0), spaceAfter: PT(parseFloat(bcs.marginBottom) || 0), link,
      spacing: cs.letterSpacing === 'normal' ? 0 : PT(parseFloat(cs.letterSpacing))
    };
  };
  /** Copie la mise en forme de caractère (reproduire la mise en forme) */
  RT.captureFormat = function (target) {
    const s = RT.state(target);
    return { bold: s.bold, italic: s.italic, underline: s.underline, strike: s.strike, font: s.fontStack, size: s.size, color: s.color, highlight: s.highlight, align: s.align };
  };
  RT.pasteFormat = function (f, target) {
    const st = RT.state(target);
    ['bold', 'italic', 'underline', 'strike'].forEach((k) => { if (!!st[k] !== !!f[k]) RT.apply(k, null, target); });
    RT.apply('font', f.font, target); RT.apply('size', f.size, target); RT.apply('color', f.color, target); RT.apply('highlight', f.highlight, target); RT.apply('align', f.align, target);
  };
  /** Recherche / remplacement dans un HTML (texte seulement, balises préservées). Renvoie {html, n} */
  RT.replaceIn = function (html, find, repl, opt) {
    opt = opt || {};
    const d = document.createElement('div'); d.innerHTML = html;
    const flags = opt.caseSensitive ? 'g' : 'gi';
    const pat = opt.whole ? '(?<![\\p{L}\\p{N}_])' + escRe(find) + '(?![\\p{L}\\p{N}_])' : escRe(find);
    const re = new RegExp(pat, flags + 'u');
    let n = 0;
    const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((t) => { const s = t.textContent; const r = s.replace(re, () => { n++; return repl; }); if (r !== s) t.textContent = r; });
    return { html: d.innerHTML, n };
  };
  RT.countIn = function (html, find, opt) { opt = opt || {}; if (!find) return 0; const t = RT.textOf(html); const pat = opt.whole ? '(?<![\\p{L}\\p{N}_])' + escRe(find) + '(?![\\p{L}\\p{N}_])' : escRe(find); const m = t.match(new RegExp(pat, (opt.caseSensitive ? 'g' : 'gi') + 'u')); return m ? m.length : 0; };
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /** Sélectionne la n-ième occurrence de « find » dans un élément affiché (pour Rechercher) */
  RT.selectMatch = function (el, find, opt, idx) {
    opt = opt || {}; idx = idx || 0;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const nodes = []; let full = '';
    while (w.nextNode()) { nodes.push([w.currentNode, full.length]); full += w.currentNode.textContent; }
    const pat = opt.whole ? '(?<![\\p{L}\\p{N}_])' + escRe(find) + '(?![\\p{L}\\p{N}_])' : escRe(find);
    const re = new RegExp(pat, (opt.caseSensitive ? 'g' : 'gi') + 'u'); let m, k = 0;
    while ((m = re.exec(full))) { if (k++ === idx) { const a = m.index, b = a + m[0].length; const at = (p) => { for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i][1] <= p) return [nodes[i][0], p - nodes[i][1]]; return [nodes[0][0], 0]; }; const s1 = at(a), s2 = at(b); const r = document.createRange(); r.setStart(s1[0], s1[1]); r.setEnd(s2[0], Math.min(s2[1], s2[0].length)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } }
    return false;
  };
})();
