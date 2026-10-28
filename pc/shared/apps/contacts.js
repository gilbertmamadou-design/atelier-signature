/* =====================================================================
   Contacts sur PC : pont simulé window.MAGContacts (même interface que
   applis/scripts/ContactsBridge.java).
   Pas d'accès aux comptes Google sur PC : le carnet est gardé dans ce
   navigateur (localStorage « contacts-pc.v1 » ; photos dans la base
   IndexedDB « contacts-pc »). Échanges avec le téléphone ou d'autres
   carnets par fichiers vCard (.vcf) : menu ⋮ › Exporter / Importer,
   glisser-déposer, « Ouvrir avec › Contacts ».
   - fusion des doublons : les fiches sont réunies en une seule ;
   - appeler / SMS : le numéro est copié (pas de téléphone sur PC) ;
     WhatsApp : WhatsApp Web ou l'appli de bureau ; e-mail : messagerie par défaut.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var KEY = 'contacts-pc.v1', ACC = 'Cet ordinateur';
  var D = M.store.get(KEY, null);
  if (!D || !Array.isArray(D.c)) D = { seq: 1, c: [] };
  var PH = {}, phReady = false;                                  // photos : id → {thumb, big}
  var pdb = M.openDb('contacts-pc', ['photos'], 1);
  pdb.keys('photos').then(function (ks) {
    return Promise.all(ks.map(function (k) { return pdb.get('photos', k).then(function (v) { PH[k] = v; }); }));
  }).then(function () { phReady = true; if (Object.keys(PH).length && window.contactsEvent) window.contactsEvent('pcphotos', ''); }).catch(function () { phReady = true; });

  var saveT = null;
  function persist() { clearTimeout(saveT); saveT = setTimeout(function () { if (!M.store.set(KEY, D)) M.toast('Stockage du navigateur plein : exporte tes contacts en .vcf', { bad: true, ms: 7000 }); }, 30); }
  window.addEventListener('pagehide', function () { if (saveT) { clearTimeout(saveT); M.store.set(KEY, D); } });
  function emit(kind, data) { if (window.contactsEvent) window.contactsEvent(kind, data); }
  function err(m) { return JSON.stringify({ ok: false, err: m }); }
  function get(id) { for (var i = 0; i < D.c.length; i++) if (D.c[i].id === +id) return D.c[i]; return null; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function display(c) {
    var n = [c.pre, c.g, c.mid, c.f, c.suf].filter(function (x) { return x && String(x).trim(); }).join(' ').trim();
    return n || c.co || (c.tel[0] && c.tel[0].v) || (c.mail[0] && c.mail[0].v) || '';
  }
  function alt(c) { return c.f || c.g ? [c.f, [c.g, c.mid].filter(Boolean).join(' ')].filter(Boolean).join(', ') : display(c); }
  function clean(o) {
    return {
      g: String(o.g || '').trim(), f: String(o.f || '').trim(), mid: String(o.mid || '').trim(), pre: String(o.pre || '').trim(), suf: String(o.suf || '').trim(),
      tel: arr(o.tel).filter(function (x) { return x && String(x.v || '').trim(); }).map(function (x) { return { v: String(x.v).trim(), t: x.t == null ? 2 : +x.t, l: x.l || '', p: !!x.p }; }),
      mail: arr(o.mail).filter(function (x) { return x && String(x.v || '').trim(); }).map(function (x) { return { v: String(x.v).trim(), t: x.t == null ? 1 : +x.t, l: x.l || '' }; }),
      adr: arr(o.adr).filter(function (x) { return x && (x.street || x.city || x.zip || x.country || x.v); }).map(function (x) { return { street: x.street || '', city: x.city || '', zip: x.zip || '', country: x.country || '', v: x.v || '', t: x.t == null ? 1 : +x.t }; }),
      co: String(o.co || '').trim(), job: String(o.job || '').trim(),
      ev: arr(o.ev).filter(function (x) { return x && String(x.v || '').trim(); }).map(function (x) { return { v: String(x.v).trim(), t: x.t == null ? 3 : +x.t }; }),
      note: String(o.note || '').trim(), web: arr(o.web).map(function (x) { return String(x || '').trim(); }).filter(Boolean)
    };
  }
  function adrText(a) { return a.v || [a.street, [a.zip, a.city].filter(Boolean).join(' '), a.country].filter(Boolean).join('\n'); }

  /* ---------------- Photos ---------------- */
  function setPhoto(id, dataUrl) {
    if (!dataUrl) { delete PH[id]; pdb.del('photos', id).catch(function () { }); return Promise.resolve(); }
    return fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (b) { return Promise.all([M.scaleImage(b, { max: 720, square: true }), M.scaleImage(b, { max: 128, square: true, quality: 0.8 })]); })
      .then(function (r) { PH[id] = { big: r[0], thumb: r[1] }; return pdb.put('photos', PH[id], id); })
      .then(function () { emit('pcphotos', ''); })
      .catch(function (e) { M.toast('Photo non enregistrée : ' + (e && e.message || e), { bad: true }); });
  }

  /* ---------------- vCard 3.0 ---------------- */
  function vEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
  function fold(line) { var out = '', n = 0; for (var i = 0; i < line.length; i++) { var ch = line[i], b = unescape(encodeURIComponent(ch)).length; if (n + b > 74) { out += '\r\n '; n = 1; } out += ch; n += b; } return out + '\r\n'; }
  var TELT = { 1: 'HOME,VOICE', 2: 'CELL', 3: 'WORK,VOICE', 4: 'WORK,FAX', 5: 'HOME,FAX', 6: 'PAGER', 7: 'VOICE', 12: 'MAIN', 17: 'WORK,CELL' };
  function vcardOf(c) {
    var s = 'BEGIN:VCARD\r\nVERSION:3.0\r\n';
    s += fold('N:' + [c.f, c.g, c.mid, c.pre, c.suf].map(vEsc).join(';'));
    s += fold('FN:' + vEsc(display(c)));
    if (c.co || c.job) { if (c.co) s += fold('ORG:' + vEsc(c.co)); if (c.job) s += fold('TITLE:' + vEsc(c.job)); }
    c.tel.forEach(function (t) { s += fold('TEL;TYPE=' + (TELT[t.t] || 'VOICE') + (t.p ? ',PREF' : '') + ':' + t.v); });
    c.mail.forEach(function (m) { s += fold('EMAIL;TYPE=INTERNET' + (m.t === 2 ? ',WORK' : m.t === 1 ? ',HOME' : '') + ':' + m.v); });
    c.adr.forEach(function (a) { s += fold('ADR;TYPE=' + (a.t === 2 ? 'WORK' : a.t === 1 ? 'HOME' : 'OTHER') + ':;;' + [a.street || (a.v || '').replace(/\n/g, ', '), a.city, '', a.zip, a.country].map(vEsc).join(';')); });
    c.ev.forEach(function (e) { if (e.t === 3) s += 'BDAY:' + e.v + '\r\n'; else s += fold('X-ANNIVERSARY:' + e.v); });
    if (c.note) s += fold('NOTE:' + vEsc(c.note));
    c.web.forEach(function (w) { s += fold('URL:' + w); });
    var ph = PH[c.id]; if (ph && ph.big) s += fold('PHOTO;ENCODING=b;TYPE=JPEG:' + ph.big.replace(/^data:[^,]*,/, ''));
    return s + 'END:VCARD\r\n';
  }

  /* ---------------- Pont ---------------- */
  var B = {
    version: function () { return '1-pc'; },
    perm: function () { return true; },
    ask: function () { setTimeout(function () { emit('perm', '1'); }, 0); },
    blocked: function () { return false; },
    accounts: function () { return JSON.stringify([{ name: '', type: '', label: ACC }]); },
    list: function () {
      return JSON.stringify(D.c.map(function (c) {
        return { id: c.id, k: String(c.id), n: display(c), alt: alt(c), st: !!c.st, ph: !!c.ph, g: c.g, f: c.f, tel: c.tel.map(function (t) { return t.v; }), mail: c.mail.map(function (m) { return m.v; }), org: c.co };
      }).sort(function (a, b) { return a.n.localeCompare(b.n, 'fr', { sensitivity: 'base' }); }));
    },
    photo: function (id, big) { var p = PH[+id]; return p ? (big ? p.big : p.thumb) || '' : ''; },
    contact: function (id) {
      var c = get(id); if (!c) return 'null';
      var card = function () {
        return {
          name: { full: display(c), g: c.g, f: c.f, pre: c.pre, mid: c.mid, suf: c.suf },
          tel: c.tel.map(function (t) { return { v: t.v, t: t.t, l: t.l, p: t.p }; }), mail: c.mail.map(function (m) { return { v: m.v, t: m.t, l: m.l }; }),
          adr: c.adr.map(function (a) { return { v: adrText(a), t: a.t, l: '', street: a.street, city: a.city, zip: a.zip, country: a.country }; }),
          org: c.co || c.job ? { co: c.co, job: c.job, dep: '' } : undefined, ev: c.ev.map(function (e) { return { v: e.v, t: e.t, l: '' }; }), note: c.note, web: c.web.slice()
        };
      };
      var o = card(); o.id = c.id; o.k = String(c.id); o.n = display(c); o.st = !!c.st; o.ph = !!c.ph; o.raws = [{ raw: c.id, name: '', type: '' }];
      var ed = card(); ed.raw = c.id; ed.acc = ''; ed.type = ''; o.edit = ed;
      return JSON.stringify(o);
    },
    save: function (json) {
      var o; try { o = JSON.parse(json); } catch (e) { return err('Données illisibles'); }
      var c = o.raw > 0 ? get(o.raw) : null;
      if (o.raw > 0 && !c) return err('Contact introuvable');
      if (!c) { c = { id: D.seq++, st: !!o.st, ph: false, at: Date.now() }; D.c.push(c); }
      Object.assign(c, clean(o));
      if (o.st !== undefined) c.st = !!o.st;
      if (o.photo === '-') { c.ph = false; setPhoto(c.id, ''); }
      else if (/^data:/.test(o.photo || '')) { c.ph = true; setPhoto(c.id, o.photo); }
      persist();
      return JSON.stringify({ ok: true, id: c.id, raw: c.id });
    },
    saveMany: function (json) {
      var ok = 0, ko = 0, l = []; try { l = JSON.parse(json); } catch (e) { }
      l.forEach(function (o) { o.raw = 0; try { JSON.parse(B.save(JSON.stringify(o))).ok ? ok++ : ko++; } catch (e) { ko++; } });
      return JSON.stringify({ ok: ok, ko: ko });
    },
    star: function (id, on) { var c = get(id); if (!c) return false; c.st = !!on; persist(); return true; },
    remove: function (ids) {
      var l = String(ids || '').split(',').map(Number), n = 0;
      D.c = D.c.filter(function (c) { if (l.indexOf(c.id) >= 0) { n++; setPhoto(c.id, ''); return false; } return true; });
      persist(); return JSON.stringify({ ok: true, n: n });
    },
    merge: function (ids) { return B.mergeKeep(ids, 0); },
    /** Fusion : une seule fiche, avec le nom (et la photo) de keep et toutes les coordonnées des autres */
    mergeKeep: function (ids, keep) {
      var cs = String(ids || '').split(',').map(get).filter(Boolean);
      if (cs.length < 2) return err('Rien à fusionner');
      var k = get(keep) || cs[0], others = cs.filter(function (c) { return c !== k; });
      var seenT = {}, seenM = {}, norm = function (v) { return String(v).replace(/[^0-9+]/g, '').replace(/^\+33/, '0'); };
      k.tel.forEach(function (t) { seenT[norm(t.v)] = 1; }); k.mail.forEach(function (m) { seenM[m.v.toLowerCase()] = 1; });
      others.forEach(function (o) {
        o.tel.forEach(function (t) { if (!seenT[norm(t.v)]) { seenT[norm(t.v)] = 1; k.tel.push(t); } });
        o.mail.forEach(function (m) { if (!seenM[m.v.toLowerCase()]) { seenM[m.v.toLowerCase()] = 1; k.mail.push(m); } });
        k.adr = k.adr.concat(o.adr); k.ev = k.ev.concat(o.ev.filter(function (e) { return !k.ev.some(function (x) { return x.v === e.v; }); }));
        k.web = k.web.concat(o.web.filter(function (w) { return k.web.indexOf(w) < 0; }));
        if (!k.co) k.co = o.co; if (!k.job) k.job = o.job; if (o.note) k.note = (k.note ? k.note + '\n' : '') + o.note;
        if (o.st) k.st = true;
        if (!k.ph && o.ph && PH[o.id]) { PH[k.id] = PH[o.id]; k.ph = true; pdb.put('photos', PH[k.id], k.id).catch(function () { }); }
        setPhoto(o.id, '');
      });
      D.c = D.c.filter(function (c) { return others.indexOf(c) < 0; });
      persist(); return JSON.stringify({ ok: true, id: k.id });
    },
    names: function () { return '[]'; },
    setName: function () { return '{"ok":true}'; },
    vcard: function (keys) {
      var ks = String(keys || '').split(':').filter(Boolean).map(Number);
      return (ks.length ? ks.map(get).filter(Boolean) : D.c).map(vcardOf).join('');
    },
    hasWhatsApp: function () { return true; },     // WhatsApp Web ou l'appli WhatsApp de Windows
    open: function (kind, arg) {
      arg = String(arg || '');
      if (kind === 'tel' || kind === 'sms') { M.clip.write(arg).then(function (ok) { M.toast(ok ? 'Numéro copié : ' + arg + ' (pas d\'appel ni de SMS depuis le PC)' : 'Pas d\'appel ni de SMS depuis le PC : ' + arg); }); return; }
      if (kind === 'wa') {
        var n = arg.replace(/[^0-9+]/g, ''); n = /^00/.test(n) ? n.slice(2) : /^\+/.test(n) ? n.slice(1) : /^0/.test(n) ? '33' + n.slice(1) : n;
        window.open('https://api.whatsapp.com/send?phone=' + n, '_blank', 'noopener'); return;
      }
      if (kind === 'mail') { location.href = 'mailto:' + arg; return; }
      if (kind === 'geo') { window.open('https://www.openstreetmap.org/search?query=' + encodeURIComponent(arg), '_blank', 'noopener'); return; }
      if (kind === 'url') { window.open(/^[a-z]+:/i.test(arg) ? arg : 'https://' + arg, '_blank', 'noopener'); return; }
      if (kind === 'share') {
        var cp = function () { M.clip.write(arg).then(function (ok) { M.toast(ok ? 'Fiche copiée dans le presse-papier' : 'Partage impossible', { bad: !ok }); }); };
        if (navigator.share) navigator.share({ text: arg }).catch(function (e) { if (!e || e.name !== 'AbortError') cp(); }); else cp();
        return;
      }
      M.unavailable('Les réglages Android');
    },
    pickPhoto: function () {
      M.fs.open({ types: [{ description: 'Images', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'] } }], accept: 'image/*', id: 'contacts-photo' }).then(function (l) {
        if (!l.length) return;
        return M.scaleImage(l[0].file, { max: 720, square: true }).then(function (u) { emit('photo', u); });
      }).catch(function (e) { M.toast('Image illisible : ' + (e && e.message || e), { bad: true }); });
    },
    pickFile: function () {
      M.fs.open({ types: [{ description: 'Contacts (.vcf)', accept: { 'text/vcard': ['.vcf', '.vcard'] } }], accept: '.vcf,.vcard,text/vcard,text/x-vcard', id: 'contacts' }).then(function (l) {
        if (!l.length) return;
        return l[0].file.text().then(function (t) { emit('file', t); });
      }).catch(function (e) { M.toast('Lecture du fichier impossible : ' + (e && e.message || e), { bad: true }); });
    },
    pending: function () { var p = pend; pend = ''; return p; },
    done: function () { }
  };
  var pend = '';
  window.MAGContacts = B;

  /* .vcf déposé sur la fenêtre ou ouvert avec « Ouvrir avec › Contacts » ; une image sur l'éditeur = photo du contact */
  M.conf.dropHint = 'Fichier de contacts .vcf à importer';
  M.onFiles(function (o) {
    var files = o.items.map(function (x) { return x.file; }).filter(Boolean);
    var img = files.filter(function (f) { return /^image\//.test(f.type); })[0];
    if (img && window.__photoTarget && document.querySelector('#ePh')) { M.scaleImage(img, { max: 720, square: true }).then(function (u) { emit('photo', u); }); return; }
    var f = files.filter(function (f) { return /vcard|directory/.test(f.type) || /\.(vcf|vcard)$/i.test(f.name); })[0];
    if (!f) { M.toast('Dépose un fichier de contacts .vcf', { bad: true }); return; }
    f.text().then(function (t) {
      var j = JSON.stringify({ k: 'vcf', text: t });
      if (window.contactsEvent && document.readyState !== 'loading') emit('intent', j); else pend = j;
    });
  });

  /* Clavier : Ctrl+F ou / chercher, N nouveau contact, Échap fermer */
  function free() { return !document.querySelector('.sheet.on, .full.on'); }
  M.keys({
    'mod+f': function () { if (!free()) return false; var q = document.getElementById('q'); if (!q) return false; q.focus(); q.select(); },
    '/': function () { if (!free()) return false; var q = document.getElementById('q'); if (!q) return false; q.focus(); },
    'n': function () { if (!free()) return false; var b = document.getElementById('fab'); if (!b) return false; b.click(); },
    'escape': function () { if (window.contactsBack && window.contactsBack()) return; if (M.typing()) { document.activeElement.blur(); return; } return false; }
  });
})();
