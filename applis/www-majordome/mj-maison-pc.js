/* =====================================================================
   Majordome sur PC (programme Suite MAG.exe) : lumières Philips Hue et volets Somfy TaHoma, comme sur le téléphone.
   Le programme parle lui-même au pont Hue et au boîtier TaHoma (pc-exe/maison.js) ; ce fichier lui branche les
   mêmes fonctions que le pont Android (MajordomeBridge.java) : hueInfo, hueReq, huePair…, somfyInfo, somfyReq…,
   alarmSet / alarmCancel (actions programmées). Réponses par window.majordomeEvent('hue' | 'somfy', …).
   mj-maison.js et mj-somfy.js voient alors B.maisonPC et fonctionnent comme sur le téléphone.
   Chargé avant mj-maison.js ; sans le programme (navigateur, téléphone) : rien ne se passe.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome, M = window.MAGEXE && window.MAGEXE.maison, B = window.MAGMajordome;
  if (!MJ || !MJ._ || !M || !B) return;
  ['hueInfo', 'hueReq', 'huePair', 'huePairCancel', 'hueForget', 'hueMove', 'hueDiscover', 'somfyInfo', 'somfySet', 'somfyReq', 'somfyForget', 'somfyDiscover']
    .forEach(function (k) { B[k] = M[k]; });
  // actions programmées : seulement celles des lumières et des volets (les minuteurs et rappels restent dans la page)
  var prevSet = B.alarmSet, prevCancel = B.alarmCancel;
  B.alarmSet = function (json) {
    var o = MJ._.J(json, {}) || {};
    if (o.kind === 'hue' || o.kind === 'somfy') return M.alarmSet(json);
    if (prevSet) return prevSet(json);
  };
  B.alarmCancel = function (id) { M.alarmCancel(id); if (prevCancel) return prevCancel(id); };
  B.maisonPC = true;
})();
