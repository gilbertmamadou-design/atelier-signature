/* Carnet sur PC : la page marche déjà dans un navigateur (notes dans localStorage « carnet.* », images dans la base
   IndexedDB « carnet »). Ici : colonnes selon la largeur de la fenêtre, raccourcis clavier, images déposées. */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var rT = null, lastW = 0;
  window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(function () { var w = Math.floor(innerWidth / 250); if (w !== lastW && window.__carnetRender && !document.querySelector('#ed:not([hidden])')) window.__carnetRender(); lastW = w; }, 200); });
  lastW = Math.floor(innerWidth / 250);
  function editing() { var e = document.getElementById('ed'); return !!(e && !e.hidden && e.offsetParent !== null) || !!(e && !e.hidden && getComputedStyle(e).display !== 'none'); }
  function sheet() { return !!document.querySelector('.sheet:not([hidden])') || !!document.querySelector('#drawer.on'); }
  M.keys({
    'n': function () { if (editing() || sheet()) return false; document.getElementById('fab').click(); },
    'mod+f': function () { if (editing() || sheet()) return false; var q = document.getElementById('q'); q.focus(); q.select(); },
    '/': function () { if (editing() || sheet()) return false; document.getElementById('q').focus(); },
    'escape': function () {
      if (M.typing() && !editing()) { document.activeElement.blur(); return; }
      if (editing() || sheet()) { history.back(); return; }
      return false;
    }
  });
  /* Images déposées sur la fenêtre : nouvelle note avec ces photos (même chemin que le bouton « photo ») */
  M.conf.dropHint = 'Images à mettre dans une note';
  M.onFiles(function (o) {
    var imgs = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && /^image\//.test(f.type); });
    if (!imgs.length) { M.toast('Dépose des images (JPG, PNG…)', { bad: true }); return; }
    var inp = document.querySelector('input[type=file][accept^="image"]');
    if (!inp) { M.toast('Ajout d\'images impossible ici', { bad: true }); return; }
    if (!editing()) { var b = document.getElementById('qPhoto'); var click = inp.click; inp.click = function () { }; b.click(); inp.click = click; }
    // la page ajoute une image à la fois : les suivantes vont dans la note qui vient de s'ouvrir
    (function next(i) {
      if (i >= imgs.length) return;
      var dt = new DataTransfer(); dt.items.add(imgs[i]); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(function () { next(i + 1); }, 700);
    })(0);
  });
})();
