/* Calcul sur PC : le clavier est déjà géré par la page (chiffres, opérateurs, Entrée, Retour arrière, Échap = C).
   En plus : Échap ferme l'historique ou les réglages, Ctrl+C copie le résultat (sans texte sélectionné), F1/F2/F3 changent de mode. */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  function openSheet() { return Array.prototype.some.call(document.querySelectorAll('.sheet'), function (s) { return !s.hidden; }); }
  M.keys({
    'escape': function () { if (!openSheet()) return false; history.back(); },
    'mod+c': function () { if (openSheet() || String(window.getSelection() || '') || M.typing()) return false; var b = document.getElementById('bCopy'); if (!b) return false; b.click(); },
    'f1': function () { var b = document.querySelector('#tabs [data-m="std"]'); if (b) b.click(); },
    'f2': function () { var b = document.querySelector('#tabs [data-m="sci"]'); if (b) b.click(); },
    'f3': function () { var b = document.querySelector('#tabs [data-m="ch"]'); if (b) b.click(); }
  });
})();
