/* Sentiers sur PC : préparer une randonnée (carte topo, itinéraires, traces GPX, points, sorties).
   L'enregistrement d'une sortie demande le GPS du téléphone : bouton masqué sur PC (Sentiers Android, puis
   sauvegarde ou trace GPX à importer ici). Traces .gpx : glisser-déposer ou « Ouvrir avec › Sentiers ». */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  M.conf.dropHint = 'Trace GPX à importer';
  M.onFiles(function (o) {
    var f = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && /\.gpx$/i.test(f.name); })[0];
    if (!f) { M.toast('Dépose une trace .gpx', { bad: true }); return; }
    var go = function () { if (typeof importGpx === 'function') importGpx(f); else M.toast('Import GPX indisponible', { bad: true }); };   // eslint-disable-line no-undef
    if (document.readyState === 'complete') go(); else window.addEventListener('load', function () { setTimeout(go, 300); });
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#recBtn')) { e.preventDefault(); e.stopPropagation(); M.unavailable('L\'enregistrement d\'une sortie (GPS)', 'utilise Sentiers sur le téléphone, puis importe la trace GPX ou la sauvegarde ici'); }
  }, true);
  M.keys({ 'escape': function () { var b = document.querySelector('.page [data-b], .page #bk, .modal [data-x]'); if (!b) return false; b.click(); } });
})();
