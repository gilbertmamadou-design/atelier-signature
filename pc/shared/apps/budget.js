/* =====================================================================
   Budget sur PC : la page fonctionne déjà dans un navigateur (données dans
   localStorage « budget.v1 », import CSV/OFX, export CSV/Excel/PDF/JSON).
   Ici : raccourcis clavier, code de verrouillage au clavier, relevés bancaires
   et copies de sauvegarde déposés sur la fenêtre.
   Les opérations du PC et du téléphone ne se synchronisent pas : passer par
   « Plus › Sauvegarde et données › Exporter / Restaurer une copie ».
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  function $(id) { return document.getElementById(id); }
  function layer() { return document.querySelector('.veil, .page'); }
  function click(id) { var b = $(id); if (!b) return false; b.click(); }
  M.keys({
    'n': function () { if (layer()) return false; return click('fab'); },
    'mod+n': function () { if (layer()) return false; return click('fab'); },
    'arrowleft': function () { if (layer()) return false; return click('mPrev'); },
    'arrowright': function () { if (layer()) return false; return click('mNext'); },
    '1': function () { if (layer()) return false; var b = document.querySelector('#nav [data-tab="home"]'); if (b) b.click(); },
    '2': function () { if (layer()) return false; var b = document.querySelector('#nav [data-tab="ops"]'); if (b) b.click(); },
    '3': function () { if (layer()) return false; var b = document.querySelector('#nav [data-tab="bud"]'); if (b) b.click(); },
    '4': function () { if (layer()) return false; var b = document.querySelector('#nav [data-tab="more"]'); if (b) b.click(); },
    'escape': function () { if ($('lock')) return false; if (!layer()) return false; history.back(); }
  });
  /* Code de verrouillage : chiffres et effacement au clavier */
  window.addEventListener('keydown', function (e) {
    var l = $('lock'); if (!l || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key === 'Backspace' ? 'del' : /^[0-9]$/.test(e.key) ? e.key : null; if (!k) return;
    var b = l.querySelector('[data-p="' + k + '"]'); if (b) { e.preventDefault(); b.click(); }
  }, true);
  /* Saisie d'une opération : le pavé numérique de la page suit le clavier (chiffres, virgule, + −, Retour arrière, Entrée) */
  window.addEventListener('keydown', function (e) {
    var pad = $('ePad'); if (!pad || $('lock') || e.ctrlKey || e.metaKey || e.altKey || M.typing()) return;
    var m = { ',': ',', '.': ',', '+': '+', '-': '−', 'Backspace': 'del', 'Enter': 'ok' }, k = /^[0-9]$/.test(e.key) ? e.key : m[e.key]; if (!k) return;
    var b = pad.querySelector('[data-k="' + k + '"]'); if (b) { e.preventDefault(); e.stopPropagation(); b.click(); }
  }, true);
  /* Fichiers déposés : relevé bancaire (CSV, OFX…) → Importer ; copie .json → Restaurer */
  M.conf.dropHint = 'Relevé bancaire (CSV, OFX) ou copie de sauvegarde Budget (.json)';
  M.onFiles(function (o) {
    var f = o.items.map(function (x) { return x.file; }).filter(Boolean)[0]; if (!f) return;
    var json = /\.json$/i.test(f.name) || /json/.test(f.type), stmt = /\.(csv|txt|ofx|qfx|tsv)$/i.test(f.name);
    var inp = $(json ? 'fRestore' : stmt ? 'fImport' : '');
    if (!inp) { M.toast('Dépose un relevé CSV ou OFX, ou une copie Budget .json', { bad: true }); return; }
    var put = function () { var dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); };
    var openImport = function () {   // l'aperçu d'un relevé s'affiche dans la page « Importer un relevé »
      var t = document.querySelector('#nav [data-tab="more"]'); if (t && !t.classList.contains('on')) t.click();
      setTimeout(function () { var r = document.querySelector('#main [data-page="import"]'); if (r) r.click(); setTimeout(put, 300); }, 120);
    };
    if (layer()) { history.back(); setTimeout(json ? put : openImport, 300); } else if (json) put(); else openImport();
  });
})();
