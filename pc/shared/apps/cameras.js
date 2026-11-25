/* Caméras sur PC : la recherche ONVIF et la lecture des flux RTSP ont besoin du programme Suite MAG.exe
   (un navigateur ne peut ni parler en UDP ni lire le RTSP). Dans le navigateur : un bandeau l'explique. */
(function () {
  'use strict';
  if (window.MAGCameras) return;
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.setAttribute('role', 'note');
    b.style.cssText = 'margin:10px 16px 0;padding:12px 14px;border-radius:14px;background:#ffb85c1f;border:1px solid #ffb85c66;color:#ffd9a6;font-size:14px;line-height:1.45';
    b.innerHTML = '<b>Caméras fonctionne dans le programme Suite MAG.exe.</b><br>Un navigateur ne peut pas chercher les caméras sur le Wi-Fi ni lire leur vidéo. Installez Suite MAG (Suite-MAG-Installation.exe), puis ouvrez Caméras depuis le programme.';
    var h = document.querySelector('header'); if (h && h.parentNode) h.parentNode.insertBefore(b, h.nextSibling); else document.body.insertBefore(b, document.body.firstChild);
  });
})();
