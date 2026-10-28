/* =====================================================================
   Atelier PDF sur PC : pont simulé window.MAGPdf (même interface que
   applis/scripts/PdfBridge.java), fichiers déposés, « Ouvrir avec »,
   documents envoyés par Lecteur PDF (boîte « mag-pc/inbox »), clavier.
     - begin / chunk / size / read / drop : octets gardés en mémoire ;
     - ocr : Tesseract (français) via MAGPC.ocr, résultat au format ML Kit attendu par la page ;
     - protect / unlock / pdfboxReady : NON fournis. pdf-lib ne sait pas chiffrer un PDF et aucune
       bibliothèque de chiffrement fiable n'est intégrée : la page affiche alors son message
       « indisponible » (outils Protéger / Retirer le mot de passe) ;
     - pending : PDF reçus (Lecteur PDF, dépôt sur la fenêtre, « Ouvrir avec »).
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var FILES = {}, INBOX = [], myId = 'fr.magformation13.pdf';

  function put(bytes) { var t = M.uid('b'); FILES[t] = { parts: [bytes], u: null }; return t; }
  function full(t) {
    var f = FILES[t]; if (!f) return null;
    if (!f.u) { var n = 0; f.parts.forEach(function (p) { n += p.length; }); var u = new Uint8Array(n), o = 0; f.parts.forEach(function (p) { u.set(p, o); o += p.length; }); f.u = u; f.parts = [u]; }
    return f.u;
  }
  function emit(o) { if (window.pdfBridgeEvent) window.pdfBridgeEvent(JSON.stringify(o)); }

  var B = {
    version: function () { return '1-pc'; },
    toast: function (t) { M.toast(t); },
    begin: function () { var t = M.uid('b'); FILES[t] = { parts: [], u: null }; return t; },
    chunk: function (t, b64) { var f = FILES[t]; if (!f) return false; try { f.parts.push(M.b64ToBytes(b64)); f.u = null; return true; } catch (e) { return false; } },
    size: function (t) { var u = full(t); return u ? u.length : -1; },
    read: function (t, off, len) { var u = full(t); if (!u) return ''; off = Math.floor(off); if (off >= u.length) return ''; return M.bytesToB64(u.subarray(off, Math.min(u.length, off + Math.max(1, Math.min(len, 4194304))))); },
    drop: function (t) { delete FILES[t]; },
    /* Reconnaissance de texte : Tesseract hors ligne au lieu de ML Kit */
    ocrReady: function () { return M.ocr.supported(); },
    ocr: function (t, job) {
      var u = full(t); delete FILES[t];
      if (!u) { emit({ job: job, ok: false, err: 'Image introuvable' }); return; }
      M.ocr.recognize(new Blob([u], { type: 'image/jpeg' }), { lang: 'fra' })
        .then(function (r) { emit({ job: job, ok: true, result: { w: r.w, h: r.h, blocks: r.blocks } }); })
        .catch(function (e) { emit({ job: job, ok: false, err: 'Reconnaissance impossible : ' + (e && e.message || e), code: 'nocr' }); });
    },
    /* PDF reçus : {"files":[{token,name,size}],"errors":[…]} ou "" */
    pending: function () {
      if (!INBOX.length) return '';
      var l = INBOX; INBOX = [];
      return JSON.stringify({ files: l.filter(function (x) { return !x.err; }).map(function (x) { return { token: x.token, name: x.name, size: x.size }; }), errors: l.filter(function (x) { return x.err; }).map(function (x) { return x.name; }) });
    }
  };
  /** PC seulement : ouvre ce PDF dans le Lecteur PDF de la Suite (boîte « mag-pc/inbox », comme Lecteur → Atelier) */
  B.toLecteur = function (blob, name) {
    var w = null;
    try { w = M.nativeOpen('about:blank'); } catch (e) { }      // pendant le clic : sinon la fenêtre serait bloquée
    return M.db.put('inbox', { id: M.uid('i'), to: 'fr.magformation13.lecteur', name: M.safeName(name, '.pdf'), blob: blob, at: Date.now() }).then(function () {
      var u = new URL(M.conf.apps['fr.magformation13.lecteur'] || '../lecteur/', location.href).href;
      if (w) w.location.href = u; else M.nativeOpen(u);
      M.toast('Ouverture dans le Lecteur PDF…');
    }).catch(function (e) { if (w) w.close(); M.toast('Envoi au Lecteur PDF impossible : ' + (e && e.message || e), { bad: true }); });
  };
  window.MAGPdf = B;

  function receive(list) {
    if (!list.length) return;
    list.forEach(function (x) { INBOX.push(x); });
    if (window.atelierIncoming) window.atelierIncoming();
  }
  function fromFiles(items) {
    return Promise.all(items.map(function (it) {
      var f = it.file;
      return f.arrayBuffer().then(function (b) {
        var u = new Uint8Array(b), s = ''; for (var k = 0; k < Math.min(1024, u.length); k++) s += String.fromCharCode(u[k]);
        if (s.indexOf('%PDF') < 0) return { name: f.name, err: 'pas un PDF' };
        return { token: put(u), name: M.safeName(f.name, '.pdf'), size: u.length };
      }, function () { return { name: f.name, err: 'illisible' }; });
    }));
  }
  /* Documents envoyés par Lecteur PDF (même origine) : lus une fois au démarrage, puis supprimés */
  function takeInbox() {
    return M.db.all('inbox').then(function (l) {
      l = (l || []).filter(function (x) { return x.to === myId; });
      return Promise.all(l.map(function (x) {
        return M.db.del('inbox', x.id).then(function () {
          if (Date.now() - (x.at || 0) > 30 * 60000) return null;            // trop ancien : ignoré
          return x.blob.arrayBuffer().then(function (b) { return { token: put(new Uint8Array(b)), name: x.name, size: b.byteLength }; });
        });
      }));
    }).then(function (l) { receive(l.filter(Boolean)); }).catch(function (e) { console.warn('boîte de réception', e); });
  }
  if (document.readyState === 'complete') takeInbox(); else window.addEventListener('load', takeInbox);

  /* Fichiers déposés sur la fenêtre ou ouverts avec « Ouvrir avec » */
  M.conf.dropHint = 'PDF pour l\'outil ouvert (ou à choisir ensuite), images pour « Images en PDF »';
  M.onFiles(function (o) {
    var fin = document.getElementById('fin'), acc = fin ? (fin.getAttribute('accept') || '') : '';
    var files = o.items.map(function (x) { return x.file; }).filter(Boolean);
    if (o.via === 'drop' && fin) {
      // un outil est ouvert : les fichiers vont directement dans son champ « Choisir »
      var ok = files.filter(function (f) { return /^image/.test(acc) ? /^image\//.test(f.type) : (/pdf/.test(f.type) || /\.pdf$/i.test(f.name)); });
      if (!ok.length) { M.toast(/^image/.test(acc) ? 'Cet outil attend des images (JPG, PNG)' : 'Cet outil attend des fichiers PDF', { bad: true }); return; }
      var dt = new DataTransfer(); ok.forEach(function (f) { dt.items.add(f); });
      fin.files = dt.files; fin.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    var pdfs = o.items.filter(function (x) { return x.file && (/pdf/.test(x.file.type) || /\.pdf$/i.test(x.file.name)); });
    if (!pdfs.length) { M.toast('Ouvrez d\'abord un outil (par exemple « Images en PDF »), puis déposez les fichiers', { bad: true, ms: 5000 }); return; }
    fromFiles(pdfs).then(receive);
  });

  /* Clavier */
  M.keys({
    'mod+o': function () { var fin = document.getElementById('fin'); if (fin) fin.click(); else M.toast('Choisissez d\'abord un outil, ou déposez un PDF sur la fenêtre'); },
    'mod+s': function () { var b = document.querySelector('#out [data-dl]'); if (!b) return false; b.click(); },
    'mod+p': function () { var b = document.querySelector('#out [data-pr]'); if (!b) return false; b.click(); },
    'escape': function () {
      var ov = document.querySelector('.overlay, .cropov'); if (ov) return false;          // fenêtres de la page : elles gardent leurs boutons
      if (typeof go === 'function' && typeof S === 'object' && S.tool) { go(null); return; }   // eslint-disable-line no-undef
      return false;
    }
  });
})();
