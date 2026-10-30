/* =====================================================================
   Suite MAG — pièces communes des applis bureautiques (Présentation, Texte, Tableur)
   office-core.js : outils, icônes (Lucide), toasts, dialogues, menus, sélecteur de couleur,
   raccourcis clavier, plateforme (PC / Android / navigateur).
   Exposé sous window.Office (alias O). Aucune dépendance (Lucide facultatif : window.LUCIDE).
   Même fichier dans l'APK (copié par applis/scripts/office-deps.sh) et sur PC (pc/shared/office/).
   ===================================================================== */
(function () {
  'use strict';
  if (window.Office) return;
  const O = window.Office = {};

  /* ---------------- Outils ---------------- */
  O.uid = (p) => (p || '') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
  O.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  O.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  O.round = (v, d) => { const k = Math.pow(10, d || 0); return Math.round(v * k) / k; };
  O.debounce = (fn, ms) => { let t; const f = function () { const a = arguments, s = this; clearTimeout(t); t = setTimeout(() => fn.apply(s, a), ms); }; f.flush = () => { clearTimeout(t); fn(); }; f.cancel = () => clearTimeout(t); return f; };
  O.raf = (fn) => { let q = false, a; return function () { a = arguments; if (q) return; q = true; requestAnimationFrame(() => { q = false; fn.apply(null, a); }); }; };
  O.clone = (o) => o == null ? o : JSON.parse(JSON.stringify(o));
  O.$ = (s, r) => (r || document).querySelector(s);
  O.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  O.h = function (tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'style' && typeof v === 'object') Object.assign(e.style, v); else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v); else if (k === 'cls') e.className = v; else e.setAttribute(k, v === true ? '' : v); }
    if (html != null) { if (typeof html === 'string') e.innerHTML = html; else if (Array.isArray(html)) html.forEach((c) => c && e.append(c)); else e.append(html); }
    return e;
  };
  O.kb = (n) => !(n > 0) ? '' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' Ko' : (n / 1048576).toFixed(1).replace('.', ',') + ' Mo';
  O.fmtNum = (v, d) => (d == null ? v : O.round(v, d)).toLocaleString('fr-FR');
  O.fmtDate = (t, withTime) => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + (withTime ? ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''); };
  O.ago = (t) => { const s = (Date.now() - t) / 1000; if (s < 60) return 'à l\'instant'; if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min'; if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h'; if (s < 172800) return 'hier'; return O.fmtDate(t); };
  O.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  O.blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  O.dataURLToBlob = (u) => { const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(u || ''); if (!m) return null; const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]); const a = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i); return new Blob([a], { type: m[1] || 'application/octet-stream' }); };
  O.bytesToB64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  O.b64ToBytes = (b) => { const s = atob(b || ''), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  O.extOf = (n) => ((String(n || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  O.baseName = (n) => String(n || '').replace(/\.[a-z0-9]+$/i, '');
  O.safeName = (n, ext) => { n = String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'document'; if (ext && !n.toLowerCase().endsWith(ext)) n += ext; return n.length > 140 ? n.slice(0, 130) + (ext || '') : n; };
  O.MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', flac: 'audio/flac', txt: 'text/plain', json: 'application/json', zip: 'application/zip', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magpres: 'application/x-magpres', csv: 'text/csv', html: 'text/html', emf: 'image/x-emf', wmf: 'image/x-wmf', tif: 'image/tiff', tiff: 'image/tiff', svm: 'image/x-svm' };
  O.mimeOf = (n, d) => O.MIME[O.extOf(n)] || d || 'application/octet-stream';
  /** Images que le navigateur ne sait pas afficher (EMF / WMF de Word ou PowerPoint, TIFF…) : gardées telles quelles
      à l'enregistrement, montrées par un cadre (O.placeholderImage) */
  O.unviewableImage = (type) => /(^|\/)(x-)?(emf|wmf|wmz|emz|svm)$|tiff?$|x-pict|x-wpg|^image\/x-ms-bmp-rle$/i.test(String(type || ''));
  /** Type d'une image d'après ses premiers octets (fichiers sans extension, extension trompeuse) ; null si inconnu */
  O.sniffImage = function (u8) {
    if (!u8 || u8.length < 12) return null;
    const s = (a, b) => String.fromCharCode.apply(null, u8.subarray(a, b));
    if (u8[0] === 0x89 && s(1, 4) === 'PNG') return 'image/png';
    if (u8[0] === 0xFF && u8[1] === 0xD8) return 'image/jpeg';
    if (s(0, 3) === 'GIF') return 'image/gif';
    if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'image/webp';
    if (s(0, 2) === 'BM') return 'image/bmp';
    if ((u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 42) || (u8[0] === 0x4D && u8[1] === 0x4D && u8[3] === 42)) return 'image/tiff';
    if (s(0, 6) === 'VCLMTF') return 'image/x-svm';
    if (u8.length > 44 && u8[0] === 1 && u8[1] === 0 && u8[2] === 0 && u8[3] === 0 && s(40, 44) === ' EMF') return 'image/x-emf';
    if ((u8[0] === 0xD7 && u8[1] === 0xCD && u8[2] === 0xC6 && u8[3] === 0x9A) || (u8[0] === 1 && u8[1] === 0 && u8[2] === 9 && u8[3] === 0)) return 'image/x-wmf';
    const head = s(0, Math.min(u8.length, 300)); if (/<svg[\s>]/.test(head) || /^\s*<\?xml[\s\S]*<svg/.test(head)) return 'image/svg+xml';
    return null;
  };
  O.imageKind = (type) => { const t = String(type || ''); return /emf/i.test(t) ? 'EMF' : /wmf/i.test(t) ? 'WMF' : /tif/i.test(t) ? 'TIFF' : /svm/i.test(t) ? 'SVM' : /pict/i.test(t) ? 'PICT' : (t.split('/')[1] || 'image').toUpperCase(); };
  const phCache = {};
  /** Cadre SVG (data: URL) à la place d'une image illisible ou d'un objet non affiché ; w, h en pixels (proportions seulement) */
  O.placeholderImage = function (label, sub, w, h) {
    w = Math.max(60, Math.round(w || 320)); h = Math.max(30, Math.round(h || 180));
    const k = label + '|' + sub + '|' + w + 'x' + h; if (phCache[k]) return phCache[k];
    const fs = Math.max(9, Math.min(18, Math.round(Math.min(w / 14, h / 4))));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" fill="#F1F3F5" stroke="#868E96" stroke-width="1.5" stroke-dasharray="6 4"/>' +
      '<path d="M' + (w / 2 - fs) + ' ' + (h / 2 - fs * 1.6) + 'h' + 2 * fs + 'v' + 1.4 * fs + 'h' + -2 * fs + 'z" fill="none" stroke="#868E96" stroke-width="1.5"/>' +
      '<text x="50%" y="' + (h / 2 + fs * 0.9) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + fs + '" fill="#495057" font-weight="bold">' + O.esc(label) + '</text>' +
      (sub && h > fs * 4 ? '<text x="50%" y="' + (h / 2 + fs * 2.3) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + Math.round(fs * 0.75) + '" fill="#868E96">' + O.esc(sub) + '</text>' : '') + '</svg>';
    return (phCache[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  };
  /* ---------------- fichiers abîmés : archive et XML ---------------- */
  /** Fichier Office protégé par mot de passe (conteneur OLE avec « EncryptedPackage ») */
  O.isEncryptedOffice = function (u8) {
    if (!(u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0)) return false;
    const pat = [69, 0, 110, 0, 99, 0, 114, 0, 121, 0, 112, 0, 116, 0, 101, 0, 100, 0, 80, 0, 97, 0, 99, 0, 107, 0, 97, 0, 103, 0, 101, 0]; // « EncryptedPackage » en UTF-16
    const n = Math.min(u8.length, 1 << 20);
    outer: for (let i = 0; i < n - pat.length; i++) { if (u8[i] !== 69) continue; for (let k = 1; k < pat.length; k++) if (u8[i + k] !== pat[k]) continue outer; return true; }
    return false;
  };
  O.ENCRYPTED_MSG = 'Ce fichier est protégé par un mot de passe. Ouvrez-le dans Word, Excel ou LibreOffice, retirez le mot de passe (Fichier › Informations › Protéger), enregistrez-le, puis rouvrez-le ici.';
  /** Archive zip (.docx, .xlsx, .odt…) : lecture normale, sinon récupération des fichiers lisibles d'une archive tronquée
      ou abîmée (en-têtes locaux). → {zip, repaired, lost} ; erreur en français si rien n'est lisible. */
  O.openZip = async function (data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data);
    if (O.isEncryptedOffice(u8)) { const e = new Error(O.ENCRYPTED_MSG); e.user = true; throw e; }
    try { return { zip: await window.JSZip.loadAsync(u8), repaired: false, lost: [] }; }
    catch (e0) {
      const z = new window.JSZip(); const lost = []; let found = 0;
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      for (let i = 0; i + 30 <= u8.length; i++) {
        if (u8[i] !== 0x50 || u8[i + 1] !== 0x4B || u8[i + 2] !== 3 || u8[i + 3] !== 4) continue;
        const flags = dv.getUint16(i + 6, true), method = dv.getUint16(i + 8, true); let csize = dv.getUint32(i + 18, true);
        const nl = dv.getUint16(i + 26, true), xl = dv.getUint16(i + 28, true), start = i + 30 + nl + xl;
        if (start > u8.length) break;
        const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'utf-8').decode(u8.subarray(i + 30, i + 30 + nl));
        if (!name || /\/$/.test(name)) { i = start - 1; continue; }
        if ((flags & 8) || !csize) { // taille inconnue (descripteur) : jusqu'à l'en-tête suivant
          let j = start; while (j + 4 <= u8.length && !(u8[j] === 0x50 && u8[j + 1] === 0x4B && (u8[j + 2] === 3 || u8[j + 2] === 1 || u8[j + 2] === 7))) j++; csize = j - start;
        }
        const raw = u8.subarray(start, Math.min(u8.length, start + csize)); const whole = start + csize <= u8.length;
        try {
          let out;
          if (method === 0) out = raw;
          else if (method === 8 && typeof DecompressionStream !== 'undefined') {
            const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(raw).catch(() => { }); w.close().catch(() => { });
            const chunks = []; const rd = ds.readable.getReader();
            try { for (;;) { const r = await rd.read(); if (r.done) break; chunks.push(r.value); } } catch (e) { if (!chunks.length) throw e; } // données tronquées : début gardé
            let n = 0; chunks.forEach((c) => { n += c.length; }); out = new Uint8Array(n); n = 0; chunks.forEach((c) => { out.set(c, n); n += c.length; });
          } else { lost.push(name); continue; }
          z.file(name, out); found++; if (!whole) lost.push(name + ' (incomplet)');
        } catch (e) { lost.push(name); }
        i = start + Math.max(0, csize) - 1;
      }
      if (!found) { const e = new Error('Le fichier est abîmé ou incomplet : son contenu n\'est pas lisible (' + (e0 && e0.message || 'archive illisible') + ').'); e.user = true; throw e; }
      return { zip: z, repaired: true, lost };
    }
  };
  /** XML lu avec tolérance : un document tronqué ou mal fermé est complété (balises refermées, fin incomplète retirée).
      → {doc, repaired} ; doc = null si rien n'est lisible */
  O.parseXmlLenient = function (s) {
    // déclarations DOCTYPE retirées : jamais utiles dans un fichier Office, et une entité externe ferait charger une adresse
    const P = (x) => new DOMParser().parseFromString(/<!DOCTYPE/i.test(x.slice(0, 2000)) ? x.replace(/<!DOCTYPE[^\[>]*(\[[\s\S]*?\])?\s*>/i, '') : x, 'application/xml');
    const bad = (d) => d.getElementsByTagName('parsererror').length > 0 || !d.documentElement;
    let d = P(s); if (!bad(d)) return { doc: d, repaired: false };
    // fin incomplète retirée ; balise fermante en trop ignorée ; éléments restés ouverts refermés au bon endroit
    let t = String(s); const lt = t.lastIndexOf('<'), gt = t.lastIndexOf('>'); if (lt > gt) t = t.slice(0, lt);
    const stack = []; const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
    let m, out = '', last = 0;
    while ((m = re.exec(t))) {
      out += t.slice(last, m.index); last = re.lastIndex;
      if (!m[2]) { out += m[0]; continue; }
      if (m[1]) { const k = stack.lastIndexOf(m[2]); if (k < 0) continue; while (stack.length > k + 1) out += '</' + stack.pop() + '>'; stack.pop(); out += m[0]; }
      else { if (!m[4]) stack.push(m[2]); out += m[0]; }
    }
    out += t.slice(last).replace(/[<&][^>;]*$/, '');
    const fixed = out + stack.reverse().map((n) => '</' + n + '>').join('');
    d = P(fixed); if (!bad(d)) return { doc: d, repaired: true };
    return { doc: null, repaired: true };
  };
  /** Rend la main au navigateur (dessin, saisie) pendant un long traitement : au plus toutes les `ms` millisecondes */
  let lastYield = 0;
  O.yieldUi = function (ms) {
    const now = performance.now(); if (now - lastYield < (ms || 40)) return null;
    return new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { lastYield = performance.now(); r(); }; ch.port2.postMessage(0); });
  };
  /** Barre de progression d'une opération longue (ouverture, export) : affichée au-delà de 300 ms, donc toujours visible
      au-delà de 2 s. prog(i, n) avance ; prog(0, 0, true) termine ; prog.text('…') change le libellé. */
  O.progress = function (label, opt) {
    opt = opt || {};
    let bar = null, last = 0, done = false; const t0 = Date.now();
    const show = () => {
      if (!bar) { bar = O.h('div', { cls: 'o-prog', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100' }); bar.innerHTML = '<span></span><b><i></i></b>'; O.layer().appendChild(bar); }
      return bar;
    };
    const timer = setTimeout(() => { if (!done) { show().querySelector('span').textContent = label; bar.classList.add('ind'); } }, opt.delay == null ? 300 : opt.delay);
    const f = (i, n, end) => {
      if (end) { done = true; clearTimeout(timer); if (bar) { bar.remove(); bar = null; } if (opt.doneToast !== false && Date.now() - t0 > 1500) O.toast('Terminé', { ms: 600 }); return; }
      if (done || (Date.now() - last < 100 && i < n)) return; last = Date.now();
      if (Date.now() - t0 < (opt.delay == null ? 300 : opt.delay) && !bar) return;
      const b = show(), pc = n ? Math.round(Math.min(n, i) / n * 100) : 0;
      b.classList.toggle('ind', !n);
      b.querySelector('span').textContent = f.label + (n ? ' ' + pc + ' %' : '');
      b.querySelector('i').style.width = (n ? pc : 100) + '%'; b.setAttribute('aria-valuenow', pc);
    };
    f.label = label; f.text = (t) => { f.label = t; if (bar) bar.querySelector('span').textContent = t; };
    f.end = () => f(0, 0, true);
    return f;
  };
  /** Dossier des bibliothèques : à côté de la page (APK) ou pc/shared/vendor/ (Suite MAG sur PC) */
  O.vendor = (window.MAGPC_CONF && window.MAGPC_CONF.vendor) || '';
  const scripts = {};
  O.loadScript = (src) => scripts[src] || (scripts[src] = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete scripts[src]; ko(new Error('Bibliothèque introuvable : ' + src)); }; document.head.appendChild(s); }));
  O.loadCss = (href) => scripts[href] || (scripts[href] = new Promise((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = ok; l.onerror = ok; document.head.appendChild(l); }));

  /* ---------------- Plateforme ---------------- */
  O.isPC = !!window.MAGPC;
  O.isAndroid = !window.MAGPC && !!window.MAGPrint;
  O.touch = () => matchMedia('(pointer:coarse)').matches;
  O.narrow = () => innerWidth < 760;
  O.isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  O.modKey = (e) => O.isMac ? e.metaKey : e.ctrlKey;

  /* ---------------- Icônes (Lucide, ISC) ---------------- */
  // anciens noms (Lucide < 1.0) → noms actuels : les applis peuvent garder des noms courants
  const ALIAS = { open: 'folder-open', new: 'file-plus', close: 'x', bold: 'letter-b', 'align-left': 'text-align-start', 'align-center': 'text-align-center', 'align-right': 'text-align-end', 'align-justify': 'text-align-justify', 'indent-decrease': 'list-indent-decrease', 'indent-increase': 'list-indent-increase', 'circles-intersect': 'blend', 'flip-horizontal-2': 'square-centerline-dashed-vertical', heading: 'heading-1', 'layers-3': 'layers-2', smile: 'face-slightly-smiling', 'smile-plus': 'face-slightly-smiling-plus', 'trash-2': 'trash', waves: 'waves-horizontal', youtube: 'tv-minimal-play', 'circle-help': 'circle-question-mark', help: 'circle-question-mark', home: 'house' };
  O.iconSvg = function (name) { const L = window.LUCIDE; const n = ALIAS[name] || name; return L && L.icons[n] || (L && L.icons['square']) || '<rect x="4" y="4" width="16" height="16" rx="2"/>'; };
  O.icon = function (name, cls, extra) { return '<svg class="oi' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"' + (extra || '') + '>' + O.iconSvg(name) + '</svg>'; };
  O.iconNames = () => window.LUCIDE ? Object.keys(window.LUCIDE.icons) : [];
  // recherche d'icônes en français : mots courants traduits vers les mots-clés anglais de Lucide
  const FR = { maison: 'house home', accueil: 'house home', fleche: 'arrow', flèche: 'arrow', personne: 'user person', utilisateur: 'user', equipe: 'users team', équipe: 'users team', groupe: 'users group', securite: 'shield lock safety', sécurité: 'shield lock safety', danger: 'triangle-alert alert warning', attention: 'triangle-alert warning', alerte: 'alert bell', casque: 'hard-hat helmet', chantier: 'hard-hat construction', travaux: 'construction hammer', outil: 'wrench tool hammer', outils: 'wrench tool hammer', marteau: 'hammer', cle: 'wrench key', clé: 'wrench key', echelle: 'ladder', échelle: 'ladder', echafaudage: 'construction ladder', échafaudage: 'construction ladder', feu: 'flame fire', incendie: 'flame fire-extinguisher', telephone: 'phone', téléphone: 'phone', courriel: 'mail', mail: 'mail', calendrier: 'calendar', horloge: 'clock', temps: 'clock timer', argent: 'euro coins wallet', euro: 'euro', graphique: 'chart', courbe: 'chart-line', camembert: 'chart-pie', etoile: 'star', étoile: 'star', coeur: 'heart', cœur: 'heart', valider: 'check', ok: 'check circle-check', interdit: 'ban', non: 'x ban', oui: 'check', livre: 'book', formation: 'graduation-cap school book', ecole: 'school', école: 'school', idee: 'lightbulb', idée: 'lightbulb', ampoule: 'lightbulb', cible: 'target', objectif: 'target goal', drapeau: 'flag', carte: 'map', lieu: 'map-pin', voiture: 'car', camion: 'truck', usine: 'factory', batiment: 'building', bâtiment: 'building', document: 'file-text', fichier: 'file', dossier: 'folder', photo: 'image camera', image: 'image', video: 'video', vidéo: 'video', musique: 'music', son: 'volume', micro: 'mic', recherche: 'search', loupe: 'search', reglage: 'settings', réglage: 'settings', parametre: 'settings', paramètre: 'settings', main: 'hand', poignee: 'handshake', poignée: 'handshake', soleil: 'sun', pluie: 'cloud-rain', vent: 'wind', neige: 'snowflake', thermometre: 'thermometer', thermomètre: 'thermometer', chaud: 'thermometer-sun flame', froid: 'snowflake thermometer-snowflake', isolation: 'layers thermometer', tuyau: 'pipe', eau: 'droplet', electricite: 'zap', électricité: 'zap', eclair: 'zap', éclair: 'zap', cadenas: 'lock', verrou: 'lock', oeil: 'eye', œil: 'eye', lunettes: 'glasses', gant: 'hand', harnais: 'shield', chute: 'arrow-down triangle-alert', hauteur: 'mountain arrow-up', medecin: 'stethoscope', médecin: 'stethoscope', sante: 'heart-pulse', santé: 'heart-pulse', secours: 'cross siren', trousse: 'briefcase-medical', question: 'circle-help help', info: 'info', information: 'info', liste: 'list', tableau: 'table', ordinateur: 'laptop monitor', reunion: 'users presentation', réunion: 'users presentation', presentation: 'presentation', présentation: 'presentation', croissance: 'trending-up', baisse: 'trending-down', fusee: 'rocket', fusée: 'rocket', trophee: 'trophy', trophée: 'trophy', medaille: 'medal', médaille: 'medal', cadeau: 'gift', panier: 'shopping-cart', magasin: 'store', planete: 'globe', planète: 'globe', monde: 'globe', nature: 'leaf trees', arbre: 'tree', feuille: 'leaf', recyclage: 'recycle', poubelle: 'trash' };
  O.searchIcons = function (q, max) {
    const L = window.LUCIDE; if (!L) return [];
    q = String(q || '').toLowerCase().trim(); max = max || 400;
    if (!q) return Object.keys(L.icons).slice(0, max);
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = q.split(/\s+/).map((w) => FR[w] || FR[norm(w)] || w).join(' ').split(/\s+/).filter(Boolean);
    const out = [];
    for (const n of Object.keys(L.icons)) {
      const hay = n + ' ' + (L.tags[n] || '');
      let sc = 0; for (const w of words) { if (n === w) sc += 5; else if (n.startsWith(w)) sc += 3; else if (n.includes(w)) sc += 2; else if (hay.includes(w)) sc += 1; }
      if (sc) out.push([sc, n]);
    }
    return out.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1])).slice(0, max).map((x) => x[1]);
  };

  /* ---------------- Couche d'interface ---------------- */
  let layer = null;
  O.layer = () => { if (!layer) { layer = O.h('div', { id: 'o-layer' }); document.body.appendChild(layer); } return layer; };

  /* Toasts : O.toast('texte', {bad, ms, action:{label, fn}}) */
  let toastT = null;
  O.toast = function (text, opt) {
    opt = opt || {};
    let t = O.$('#o-toast'); if (!t) { t = O.h('div', { id: 'o-toast', role: 'status', 'aria-live': 'polite' }); O.layer().appendChild(t); }
    t.innerHTML = '<span>' + O.esc(text) + '</span>' + (opt.action ? '<button type="button">' + O.esc(opt.action.label) + '</button>' : '');
    t.className = 'on' + (opt.bad ? ' bad' : '');
    if (opt.action) t.querySelector('button').onclick = () => { t.className = ''; opt.action.fn(); };
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, opt.ms || (opt.bad ? 5500 : 3000));
  };

  /* Dialogues : O.dialog({title, body (html ou nœud), buttons:[{label, value, primary, bad, onClick(close, el)}], onOpen(el, close), cls, wide})
     → Promise(valeur du bouton, ou null si fermé) */
  const stack = [];
  O.dialog = function (opt) {
    opt = opt || {};
    return new Promise((resolve) => {
      const wrap = O.h('div', { cls: 'o-dlg-wrap' + (opt.cls ? ' ' + opt.cls : '') });
      const btns = opt.buttons || [{ label: 'Fermer', value: null, primary: true }];
      wrap.innerHTML = '<div class="o-dlg' + (opt.wide ? ' wide' : '') + (opt.full ? ' full' : '') + '" role="dialog" aria-modal="true" aria-label="' + O.esc(opt.title || '') + '">' +
        '<div class="o-dlg-hd"><b>' + O.esc(opt.title || '') + '</b><button type="button" class="o-x" aria-label="Fermer">' + O.icon('x') + '</button></div>' +
        '<div class="o-dlg-bd"></div>' + (btns.length ? '<div class="o-dlg-ft">' + btns.map((b, i) => '<button type="button" data-i="' + i + '" class="o-btn' + (b.primary ? ' pri' : '') + (b.bad ? ' bad' : '') + (b.left ? ' left' : '') + '">' + O.esc(b.label) + '</button>').join('') + '</div>' : '') + '</div>';
      const bd = wrap.querySelector('.o-dlg-bd');
      if (typeof opt.body === 'string') bd.innerHTML = opt.body; else if (opt.body) bd.appendChild(opt.body);
      const prevFocus = document.activeElement;
      let done = false;
      function close(v) {
        if (done) return; done = true;
        wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 150);
        const i = stack.indexOf(close); if (i >= 0) stack.splice(i, 1);
        try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch (e) { }
        resolve(v === undefined ? null : v);
      }
      stack.push(close);
      wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap && !opt.modal) wrap._down = true; });
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap && wrap._down) { close(null); return; }
        wrap._down = false;
        if (e.target.closest('.o-x')) { close(null); return; }
        const b = e.target.closest('.o-dlg-ft button'); if (!b) return;
        const d = btns[+b.dataset.i];
        if (d.onClick) { const r = d.onClick(close, wrap); if (r === false) return; if (r && r.then) { r.then((v) => { if (v !== false) close(d.value); }); return; } }
        close(d.value);
      });
      wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && opt.enter !== false && e.target.tagName !== 'TEXTAREA' && !e.target.isContentEditable && !(e.target.tagName === 'BUTTON')) { const p = wrap.querySelector('.o-dlg-ft .pri'); if (p) { e.preventDefault(); p.click(); } }
      });
      O.layer().appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('on'));
      if (opt.onOpen) opt.onOpen(wrap.querySelector('.o-dlg'), close);
      const f = wrap.querySelector('[autofocus]') || wrap.querySelector('.o-dlg-bd input, .o-dlg-bd textarea, .o-dlg-bd select') || wrap.querySelector('.o-dlg-ft .pri');
      if (f && !O.touch()) setTimeout(() => { try { f.focus(); if (f.select && f.type !== 'number') f.select(); } catch (e) { } }, 30);
    });
  };
  O.dialogOpen = () => stack.length > 0;
  O.closeTopDialog = () => { const c = stack[stack.length - 1]; if (c) { c(null); return true; } return false; };
  // Échap ferme la boîte de dialogue du dessus (sauf si un menu y est ouvert : il se ferme d'abord)
  window.addEventListener('keydown', (e) => { if (e.key !== 'Escape' || !stack.length || openMenu || e.defaultPrevented) return; e.preventDefault(); e.stopPropagation(); O.closeTopDialog(); }, true);
  O.confirm = (title, text, ok, bad) => O.dialog({ title, body: '<p>' + O.esc(text || '') + '</p>', buttons: [{ label: 'Annuler', value: false }, { label: ok || 'OK', value: true, primary: true, bad }] }).then((v) => !!v);
  O.alert = (title, html) => O.dialog({ title, body: html, buttons: [{ label: 'OK', value: true, primary: true }] });
  O.prompt = function (title, label, value, opt) {
    opt = opt || {};
    return O.dialog({
      title, body: '<label class="o-field"><span>' + O.esc(label || '') + '</span>' + (opt.multiline ? '<textarea rows="' + (opt.rows || 5) + '" class="o-in" autofocus></textarea>' : '<input class="o-in" type="' + (opt.type || 'text') + '" autofocus>') + '</label>' + (opt.hint ? '<p class="o-hint">' + opt.hint + '</p>' : ''),
      onOpen: (el) => { el.querySelector('.o-in').value = value == null ? '' : value; },
      buttons: [{ label: 'Annuler', value: null }, { label: opt.ok || 'OK', primary: true, value: '__ok', onClick: (c, w) => { c('§' + w.querySelector('.o-in').value); return false; } }]
    }).then((v) => typeof v === 'string' && v[0] === '§' ? v.slice(1) : null);
  };
  /** Formulaire simple : fields [{id, label, type:'text'|'number'|'select'|'check'|'color'|'textarea'|'range', value, options:[[v,l]], min, max, step, hint}] → objet ou null */
  O.form = function (title, fields, opt) {
    opt = opt || {};
    const html = fields.map((f) => {
      if (f.type === 'html') return f.html;
      const id = 'f_' + f.id;
      let inp;
      if (f.type === 'select') inp = '<select class="o-in" id="' + id + '">' + f.options.map((o) => '<option value="' + O.esc(o[0]) + '"' + (String(o[0]) === String(f.value) ? ' selected' : '') + '>' + O.esc(o[1]) + '</option>').join('') + '</select>';
      else if (f.type === 'check') return '<label class="o-check"><input type="checkbox" id="' + id + '"' + (f.value ? ' checked' : '') + '><span>' + O.esc(f.label) + '</span></label>' + (f.hint ? '<p class="o-hint">' + f.hint + '</p>' : '');
      else if (f.type === 'textarea') inp = '<textarea class="o-in" id="' + id + '" rows="' + (f.rows || 4) + '">' + O.esc(f.value == null ? '' : f.value) + '</textarea>';
      else inp = '<input class="o-in" id="' + id + '" type="' + (f.type || 'text') + '" value="' + O.esc(f.value == null ? '' : f.value) + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + (f.step != null ? ' step="' + f.step + '"' : '') + (f.placeholder ? ' placeholder="' + O.esc(f.placeholder) + '"' : '') + '>';
      return '<label class="o-field' + (f.half ? ' half' : '') + '"><span>' + O.esc(f.label) + '</span>' + inp + '</label>' + (f.hint ? '<p class="o-hint">' + f.hint + '</p>' : '');
    }).join('');
    return O.dialog({
      title, wide: opt.wide, body: '<div class="o-form">' + html + '</div>', onOpen: opt.onOpen,
      buttons: [{ label: 'Annuler', value: null }, { label: opt.ok || 'OK', primary: true, value: '__ok', onClick: (c, w) => {
        const r = {}; fields.forEach((f) => { if (f.type === 'html') return; const e = w.querySelector('#f_' + f.id); r[f.id] = f.type === 'check' ? e.checked : (f.type === 'number' || f.type === 'range') ? parseFloat(String(e.value).replace(',', '.')) : e.value; });
        if (opt.validate) { const err = opt.validate(r); if (err) { O.toast(err, { bad: true }); return false; } }
        c(r); return false;
      } }]
    }).then((v) => v && typeof v === 'object' ? v : null);
  };

  /* ---------------- Menus (contextuels, déroulants) ----------------
     items : [{label, icon, kbd, on(), disabled, checked, danger, sub:[…], html}] ou '-' (séparateur) ou {head:'Titre'}
     at : élément (menu sous l'élément) ou {x, y}. Sur téléphone : feuille du bas. */
  let openMenu = null;
  O.closeMenu = () => { if (openMenu) { const m = openMenu; openMenu = null; m.close(); } };
  O.menu = function (at, items, opt) {
    O.closeMenu(); opt = opt || {};
    const sheet = O.narrow() && opt.sheet !== false;
    const root = O.h('div', { cls: 'o-menu-wrap' + (sheet ? ' sheet' : '') });
    let subOpen = null;
    function build(list, parent) {
      const m = O.h('div', { cls: 'o-menu' + (opt.cls ? ' ' + opt.cls : ''), role: 'menu' });
      if (sheet && opt.title && !parent) m.appendChild(O.h('div', { cls: 'o-menu-title' }, O.esc(opt.title)));
      list.filter(Boolean).forEach((it) => {
        if (it === '-') { m.appendChild(O.h('div', { cls: 'o-sep' })); return; }
        if (it.head) { m.appendChild(O.h('div', { cls: 'o-menu-head' }, O.esc(it.head))); return; }
        if (it.node) { m.appendChild(it.node); return; }
        const b = O.h('button', { type: 'button', cls: 'o-mi' + (it.danger ? ' danger' : '') + (it.checked ? ' checked' : ''), role: 'menuitem', disabled: !!it.disabled, title: it.title || null });
        b.innerHTML = '<span class="o-mi-ic">' + (it.checked ? O.icon('check') : it.icon ? (it.icon.startsWith('<') ? it.icon : O.icon(it.icon)) : '') + '</span><span class="o-mi-l">' + (it.html || O.esc(it.label)) + '</span>' + (it.kbd ? '<kbd>' + O.esc(it.kbd) + '</kbd>' : '') + (it.sub ? O.icon('chevron-right', 'o-mi-sub') : '');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (it.sub) { if (subOpen) subOpen.remove(); const s = build(typeof it.sub === 'function' ? it.sub() : it.sub, b); subOpen = s; root.appendChild(s); place(s, sheet ? null : b, true); return; }
          O.closeMenu(); if (it.on) setTimeout(() => it.on(), 0);
        });
        if (it.sub && !sheet && !O.touch()) b.addEventListener('pointerenter', () => { if (subOpen && subOpen._from === b) return; if (subOpen) subOpen.remove(); const s = build(typeof it.sub === 'function' ? it.sub() : it.sub, b); s._from = b; subOpen = s; root.appendChild(s); place(s, b, true); });
        else if (!sheet && !O.touch()) b.addEventListener('pointerenter', () => { if (subOpen && parent == null) { subOpen.remove(); subOpen = null; } });
        m.appendChild(b);
      });
      return m;
    }
    function place(m, anchor, side) {
      if (sheet) { m.classList.add('o-sheet'); return; }
      const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y };
      m.style.left = '0px'; m.style.top = '0px';
      const mw = m.offsetWidth, mh = m.offsetHeight;
      let x = side ? r.right - 2 : r.left, y = side ? r.top - 4 : r.bottom + 2;
      if (x + mw > innerWidth - 4) x = side ? r.left - mw + 2 : innerWidth - mw - 4;
      if (y + mh > innerHeight - 4) y = Math.max(4, side ? innerHeight - mh - 4 : r.top - mh - 2);
      if (y < 4) y = 4;
      m.style.left = Math.max(4, x) + 'px'; m.style.top = y + 'px';
      m.style.maxHeight = (innerHeight - 8) + 'px';
    }
    const m = build(typeof items === 'function' ? items() : items);
    root.appendChild(m);
    O.layer().appendChild(root);
    place(m, at && at.getBoundingClientRect ? at : null);
    requestAnimationFrame(() => root.classList.add('on'));
    // un menu ouvert par un appui long : le relâchement du doigt produit un « click » qui ne doit rien choisir
    let armed = false;
    root.addEventListener('click', (e) => { if (!armed && e.detail > 0) { e.stopPropagation(); e.preventDefault(); } }, true);
    const off = (e) => { armed = true; if (!root.contains(e.target) || e.target === root) { e.preventDefault && e.type === 'pointerdown' && e.target === root && e.preventDefault(); O.closeMenu(); } };
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); O.closeMenu(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const l = O.$$('.o-mi:not([disabled])', subOpen || m); const i = l.indexOf(document.activeElement); const n = l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]; if (n) n.focus(); }
    };
    setTimeout(() => { document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', key, true); }, 0);
    openMenu = { root, close: () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', key, true); root.remove(); if (opt.onClose) opt.onClose(); } };
    if (!O.touch()) { const f = m.querySelector('.o-mi:not([disabled])'); if (f && opt.focus) f.focus(); }
    return openMenu;
  };
  O.menuOpen = () => !!openMenu;

  /* ---------------- Couleurs ---------------- */
  O.hexToRgb = (h) => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h.slice(0, 6), 16); return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  O.rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => O.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  O.cssToHex = (c) => {
    if (!c) return null; c = String(c).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(c)) { const r = O.hexToRgb(c); return O.rgbToHex(r[0], r[1], r[2]); }
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?/.exec(c);
    if (m) { if (m[4] != null && parseFloat(m[4]) === 0) return null; return O.rgbToHex(+m[1], +m[2], +m[3]); }
    if (c === 'transparent') return null;
    const cv = document.createElement('canvas').getContext('2d'); cv.fillStyle = '#000'; cv.fillStyle = c; return /^#/.test(cv.fillStyle) ? cv.fillStyle.toUpperCase() : O.cssToHex(cv.fillStyle);
  };
  /** Éclaircir (+) ou assombrir (−) : k de −1 à 1 */
  O.tint = (hex, k) => { const c = O.hexToRgb(hex); if (!c) return hex; return O.rgbToHex.apply(null, c.map((v) => k >= 0 ? v + (255 - v) * k : v * (1 + k))); };
  O.mix = (a, b, k) => { const x = O.hexToRgb(a), y = O.hexToRgb(b); return O.rgbToHex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k); };
  O.luminance = (hex) => { const c = O.hexToRgb(hex) || [0, 0, 0]; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  O.contrast = (a, b) => { const l1 = O.luminance(a), l2 = O.luminance(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  O.readable = (bg) => O.luminance(bg) > 0.45 ? '#111111' : '#FFFFFF';
  O.STD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
  const RECENT_K = 'office:couleurs-recentes';
  O.recentColors = () => { try { return JSON.parse(localStorage.getItem(RECENT_K)) || []; } catch (e) { return []; } };
  O.pushRecentColor = (c) => { if (!c || c[0] !== '#') return; const l = O.recentColors().filter((x) => x !== c); l.unshift(c); try { localStorage.setItem(RECENT_K, JSON.stringify(l.slice(0, 10))); } catch (e) { } };
  /** Sélecteur de couleur : O.colorPicker(ancre, {theme:[{ref, hex, name}], value, none:'Aucune', auto:'Automatique', onPick(couleur|null), title})
      Une couleur de thème est rendue sous la forme « t:accent1 » ou « t:accent1/+40 » (éclaircie de 40 %). */
  O.colorPicker = function (anchor, opt) {
    opt = opt || {};
    const node = O.h('div', { cls: 'o-cpick' });
    let h = '';
    if (opt.auto) h += '<button type="button" class="o-cp-wide" data-c="auto">' + O.icon('wand-sparkles') + O.esc(opt.auto) + '</button>';
    if (opt.theme && opt.theme.length) {
      h += '<div class="o-cp-lbl">Couleurs du thème</div><div class="o-cp-grid">';
      const steps = [0, 80, 60, 40, -25, -50];
      for (const s of steps) for (const t of opt.theme) {
        const hex = s === 0 ? t.hex : O.tint(t.hex, s / 100);
        const ref = s === 0 ? 't:' + t.ref : 't:' + t.ref + '/' + (s > 0 ? '+' : '') + s;
        h += '<button type="button" class="o-sw" style="background:' + hex + '" data-c="' + ref + '" title="' + O.esc(t.name + (s ? (s > 0 ? ', plus clair ' + s + ' %' : ', plus sombre ' + -s + ' %') : '')) + '"></button>';
      }
      h += '</div>';
    }
    h += '<div class="o-cp-lbl">Couleurs standard</div><div class="o-cp-grid">' + O.STD_COLORS.map((c) => '<button type="button" class="o-sw" style="background:' + c + '" data-c="' + c + '" title="' + c + '"></button>').join('') + '</div>';
    const rec = O.recentColors();
    if (rec.length) h += '<div class="o-cp-lbl">Récentes</div><div class="o-cp-grid">' + rec.map((c) => '<button type="button" class="o-sw" style="background:' + c + '" data-c="' + c + '" title="' + c + '"></button>').join('') + '</div>';
    h += '<div class="o-cp-row">' + (opt.none ? '<button type="button" class="o-cp-wide" data-c="none">' + O.icon('ban') + O.esc(opt.none) + '</button>' : '') +
      '<label class="o-cp-wide o-cp-more">' + O.icon('palette') + 'Autre…<input type="color" value="' + (opt.value && opt.value[0] === '#' ? opt.value.slice(0, 7) : '#3366CC') + '"></label>' +
      (window.EyeDropper ? '<button type="button" class="o-cp-wide" data-c="eye">' + O.icon('pipette') + 'Pipette</button>' : '') + '</div>';
    node.innerHTML = h;
    const done = (c) => { if (c && c[0] === '#') O.pushRecentColor(c); O.closeMenu(); opt.onPick && opt.onPick(c); };
    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      const c = b.dataset.c;
      if (c === 'eye') { O.closeMenu(); new window.EyeDropper().open().then((r) => { O.pushRecentColor(r.sRGBHex.toUpperCase()); opt.onPick && opt.onPick(r.sRGBHex.toUpperCase()); }).catch(() => { }); return; }
      done(c === 'none' ? null : c === 'auto' ? 'auto' : c);
    });
    node.querySelector('input[type=color]').addEventListener('change', (e) => done(e.target.value.toUpperCase()));
    return O.menu(anchor, [{ node }], { cls: 'o-menu-cp', title: opt.title || 'Couleur' });
  };

  /* ---------------- Raccourcis clavier ----------------
     O.keys({'mod+s': fn, 'mod+shift+z': fn, 'f5': fn, 'delete': fn}, {when: () => bool}) ; fn(e) → false pour laisser passer */
  const KEYS = [];
  O.keyName = function (e) {
    let k = e.key; if (!k) return '';
    if (k === ' ') k = 'space'; else if (k.length === 1) k = k.toLowerCase();
    else k = k.toLowerCase();
    // AZERTY : Ctrl+Maj+< etc. ; on garde aussi le code physique pour les chiffres
    const p = [];
    if (O.modKey(e)) p.push('mod'); if (e.altKey) p.push('alt'); if (e.shiftKey && k.length > 1 || e.shiftKey && /[a-z]/.test(k)) p.push('shift');
    p.push(k);
    return p.join('+');
  };
  O.keys = function (map, opt) { opt = opt || {}; Object.keys(map).forEach((k) => KEYS.push({ k: k.toLowerCase().replace(/\s+/g, ''), fn: map[k], when: opt.when, typing: opt.typing })); };
  O.typing = () => { const a = document.activeElement; return !!(a && (a.isContentEditable || /^(input|textarea|select)$/i.test(a.tagName)) && !(a.type && /^(button|checkbox|radio|range|submit|color)$/i.test(a.type))); };
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const n = O.keyName(e), alt = e.code && /^Digit\d$/.test(e.code) ? n.replace(/[^+]*$/, e.code.slice(5)) : null;
    for (let i = KEYS.length - 1; i >= 0; i--) {
      const s = KEYS[i];
      if (s.k !== n && s.k !== alt) continue;
      if (s.when && !s.when(e)) continue;
      if (!s.typing && O.typing() && !/^mod\+/.test(s.k) && !/^f\d+$/.test(s.k) && s.k !== 'escape') continue;
      if (s.fn(e) === false) continue;
      e.preventDefault(); e.stopPropagation(); return;
    }
  }, false);
  O.kbdLabel = (k) => k.split('+').map((p) => ({ mod: O.isMac ? '⌘' : 'Ctrl', shift: 'Maj', alt: 'Alt', delete: 'Suppr', escape: 'Échap', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', pageup: 'Pg préc.', pagedown: 'Pg suiv.', space: 'Espace', enter: 'Entrée', backspace: 'Retour arr.', home: 'Début', end: 'Fin', tab: 'Tab' }[p] || (p.length === 1 ? p.toUpperCase() : p.toUpperCase()))).join('+');

  /* ---------------- Glisser (souris et doigt) ----------------
     O.drag(e, {move(dx, dy, e), end(dx, dy, e, moved), threshold}) — à appeler dans pointerdown */
  O.drag = function (e0, h) {
    const x0 = e0.clientX, y0 = e0.clientY, th = h.threshold == null ? 3 : h.threshold, id = e0.pointerId;
    let moved = false;
    const tgt = e0.target; try { tgt.setPointerCapture && tgt.setPointerCapture(id); } catch (e) { }
    const mv = (e) => { if (e.pointerId !== id) return; const dx = e.clientX - x0, dy = e.clientY - y0; if (!moved && Math.hypot(dx, dy) < th) return; moved = true; h.move && h.move(dx, dy, e); };
    const up = (e) => { if (e.pointerId !== id) return; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); h.end && h.end(e.clientX - x0, e.clientY - y0, e, moved); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  /* ---------------- Fonctions diverses ---------------- */
  /** Polices : pile de secours pour chaque police proposée (polices du système uniquement : rien n'est téléchargé) */
  O.FONTS = [
    ['Segoe UI', "'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif"],
    ['Calibri', "Calibri, Carlito, 'Segoe UI', Roboto, Arial, sans-serif"],
    ['Arial', "Arial, 'Liberation Sans', Helvetica, Roboto, sans-serif"],
    ['Verdana', "Verdana, 'DejaVu Sans', Geneva, sans-serif"],
    ['Tahoma', "Tahoma, Verdana, 'DejaVu Sans', sans-serif"],
    ['Trebuchet MS', "'Trebuchet MS', 'Segoe UI', Roboto, sans-serif"],
    ['Exo', "Exo, 'Trebuchet MS', 'Segoe UI', Roboto, Arial, sans-serif"],
    ['Candara', "Candara, Calibri, 'Segoe UI', sans-serif"],
    ['Corbel', "Corbel, 'Segoe UI', Roboto, sans-serif"],
    ['Century Gothic', "'Century Gothic', 'URW Gothic', 'Avenir', 'Segoe UI', sans-serif"],
    ['Gill Sans', "'Gill Sans MT', 'Gill Sans', Calibri, 'Segoe UI', sans-serif"],
    ['Franklin Gothic', "'Franklin Gothic Medium', 'Franklin Gothic', 'Arial Narrow', Arial, sans-serif"],
    ['Bahnschrift', "Bahnschrift, 'DIN Alternate', 'Roboto Condensed', 'Arial Narrow', sans-serif"],
    ['Arial Narrow', "'Arial Narrow', 'Roboto Condensed', 'Liberation Sans Narrow', sans-serif"],
    ['Impact', "Impact, Haettenschweiler, 'Arial Black', sans-serif"],
    ['Arial Black', "'Arial Black', 'Arial Bold', Gadget, sans-serif"],
    ['Georgia', "Georgia, 'DejaVu Serif', 'Noto Serif', serif"],
    ['Cambria', "Cambria, Caladea, Georgia, 'Noto Serif', serif"],
    ['Times New Roman', "'Times New Roman', 'Liberation Serif', Times, 'Noto Serif', serif"],
    ['Garamond', "Garamond, 'EB Garamond', 'Times New Roman', serif"],
    ['Palatino', "'Palatino Linotype', Palatino, 'Book Antiqua', 'Noto Serif', serif"],
    ['Constantia', "Constantia, Georgia, 'Noto Serif', serif"],
    ['Rockwell', "Rockwell, 'Roboto Slab', 'Courier New', serif"],
    ['Consolas', "Consolas, 'Cascadia Mono', 'DejaVu Sans Mono', 'Roboto Mono', monospace"],
    ['Courier New', "'Courier New', Courier, 'Liberation Mono', monospace"],
    ['Comic Sans MS', "'Comic Sans MS', 'Comic Neue', 'Segoe Print', cursive"],
    ['Segoe Print', "'Segoe Print', 'Comic Sans MS', cursive"],
    ['Roboto', "Roboto, 'Segoe UI', Arial, sans-serif"],
    ['Noto Serif', "'Noto Serif', Georgia, serif"]
  ];
  O.fontStack = (name) => { const f = O.FONTS.find((x) => x[0].toLowerCase() === String(name || '').toLowerCase()); return f ? f[1] : "'" + String(name).replace(/'/g, '') + "', 'Segoe UI', Roboto, Arial, sans-serif"; };
  /** Première police de la pile (nom affiché) */
  O.fontName = (stack) => String(stack || '').split(',')[0].replace(/['"]/g, '').trim();
  const fontCache = {};
  /** La police est-elle installée sur cet appareil ? (mesure de largeur) */
  O.fontAvailable = function (name) {
    if (name in fontCache) return fontCache[name];
    const c = document.createElement('canvas').getContext('2d'), s = 'mmmmmmmmmmlli1WQ@#àé';
    const res = ['monospace', 'serif', 'sans-serif'].some((b) => { c.font = '40px ' + b; const w0 = c.measureText(s).width; c.font = "40px '" + name + "', " + b; return c.measureText(s).width !== w0; });
    return (fontCache[name] = res);
  };
  O.copyText = (t) => navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t).then(() => true, () => false) : Promise.resolve(false);
})();
