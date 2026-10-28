/* Météo sur PC : la page marche dans le navigateur (Open-Meteo, RainViewer : réseau direct, CORS ouvert ;
   position par le navigateur / Windows). Pas d'alertes en arrière-plan (la page le dit).
   Ici : raccourcis clavier 1 à 5 (onglets), Échap (fermer), Ctrl+F (chercher une ville). */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  function sheet() { return !!document.querySelector('.sheet.on'); }
  function tab(i) { return function () { if (sheet()) return false; var b = document.querySelectorAll('nav.tabs button')[i]; if (!b) return false; b.click(); }; }
  M.keys({
    '1': tab(0), '2': tab(1), '3': tab(2), '4': tab(3), '5': tab(4),
    'mod+f': function () { if (sheet()) return false; var b = document.getElementById('bCities'); if (!b) return false; b.click(); setTimeout(function () { var i = document.querySelector('.sheet.on input'); if (i) i.focus(); }, 300); },
    'escape': function () { if (!sheet()) return false; history.back(); }
  });
})();
