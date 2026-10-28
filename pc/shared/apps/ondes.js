/* Ondes sur PC : écoute en ligne des podcasts (recherche iTunes) et de la musique libre (Internet Archive ; ccMixter
   seulement avec le relais réseau). Les flux de podcasts : environ la moitié autorise la lecture depuis une page web
   (sonde du 28/10/2026) ; les autres passent par le relais personnel s'il est installé, sinon la page dit que le flux
   est injoignable. Pas de téléchargement pour l'écoute hors ligne (onglets « Lien » et « Fichiers » masqués).
   Clavier : Espace lecture/pause, ← → reculer/avancer, Échap retour. */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  function au() { return document.getElementById('audio'); }
  M.keys({
    'space': function () { var a = au(), b = document.getElementById('pPlay'); if (!a || !a.src || !b) return false; b.click(); },
    'arrowleft': function () { var b = document.getElementById('pBack'); if (!b || !au().src) return false; b.click(); },
    'arrowright': function () { var b = document.getElementById('pFwd'); if (!b || !au().src) return false; b.click(); },
    'escape': function () { var b = document.getElementById('bBack'); if (!b || b.hidden) return false; b.click(); }
  });
})();
