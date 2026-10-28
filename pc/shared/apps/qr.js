/* QR sur PC : lecture à la webcam (page), depuis une image choisie, déposée ou collée (Ctrl+V).
   Les codes-barres (EAN, Code 128…) ne sont lus que si le navigateur fournit BarcodeDetector (pas Chrome/Edge
   sous Windows aujourd'hui) : la page l'indique (« Lit les QR codes… »). */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  function feed(f) {
    var inp = document.getElementById('galIn'); if (!inp) return;
    var dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  M.conf.dropHint = 'Image contenant un QR code à lire';
  M.onFiles(function (o) {
    var f = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && /^image\//.test(f.type); })[0];
    if (!f) { M.toast('Dépose une image (photo, capture d\'écran) contenant un QR code', { bad: true }); return; }
    feed(f);
  });
  window.addEventListener('paste', function (e) {
    if (M.typing()) return;
    var it = Array.prototype.filter.call((e.clipboardData && e.clipboardData.items) || [], function (i) { return i.kind === 'file' && /^image\//.test(i.type); })[0];
    if (!it) return;
    e.preventDefault(); feed(it.getAsFile());
  });
  M.whenBody(function () {
    var s = document.querySelector('#bScan b + span');
    if (s && !('BarcodeDetector' in window)) s.textContent = 'QR code, avec la webcam';
    else if (s) s.textContent = 'QR code ou code-barres, avec la webcam';
  });
  M.keys({ 'escape': function () { if (!document.querySelector('.layer, .sheet, .cam')) return false; history.back(); } });
})();
