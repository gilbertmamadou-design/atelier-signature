/* Solaire sur PC : la page marche dans le navigateur (adresse, cadastre IGN, Géoportail de l'urbanisme : CORS ouvert).
   PVGIS (production) refuse la lecture depuis une page web : sans relais réseau, la page affiche « PVGIS ne répond pas »
   avec la raison, et propose de saisir un productible connu. Pas de capteurs (pente, boussole) : saisie à la main.
   Ici : Échap ferme les fenêtres. */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  M.keys({ 'escape': function () { var s = document.getElementById('sheet'); if (!s || s.hidden) return false; history.back(); } });
})();
