/* Scan sur PC : la page marche dans le navigateur (webcam, images, PDF ; documents dans IndexedDB « mag-scan »).
   Ici : images et PDF déposés sur la fenêtre (ajoutés au document ouvert, sinon à un nouveau document),
   Ctrl+V d'une image (capture d'écran, photo copiée), Échap. */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  /* global S, newDoc, importInto */
  function add(files) {
    if (typeof importInto !== 'function') return;
    var doc = S.doc || newDoc(S.type || 'doc');
    importInto(doc, files, !S.doc);
  }
  M.conf.dropHint = 'Photos de documents ou PDF à ajouter';
  M.onFiles(function (o) {
    var fs = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && (/^image\//.test(f.type) || /pdf/.test(f.type) || /\.(pdf|jpe?g|png|webp)$/i.test(f.name)); });
    if (!fs.length) { M.toast('Dépose des images ou des PDF', { bad: true }); return; }
    add(fs);
  });
  window.addEventListener('paste', function (e) {
    if (M.typing()) return;
    var it = Array.prototype.filter.call((e.clipboardData && e.clipboardData.items) || [], function (i) { return i.kind === 'file' && /^image\//.test(i.type); })[0];
    if (!it) return; e.preventDefault();
    var f = it.getAsFile(); add([new File([f], 'collage.png', { type: f.type })]);
  });
  M.keys({ 'escape': function () { if (!document.querySelector('.layer, .sheet')) return false; history.back(); } });
})();
