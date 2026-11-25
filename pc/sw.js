/* Service worker du lanceur « Suite MAG sur PC » : fichier GÉNÉRÉ par pc/build-pc.py depuis
   pc/shared/sw-lanceur-template.js — ne pas le modifier à la main.
   Garde la page du lanceur et les icônes des applis pour l'ouvrir sans internet.
   Portée pc/ : chaque appli a son propre service worker (portée pc/<appli>/), prioritaire sur celui-ci ;
   celui-ci ne répond QUE pour ses propres fichiers et laisse passer tout le reste. */
'use strict';
var VERSION = '26d3b86f7f4e';
var CACHE = 'mag-pc-lanceur-' + VERSION;
var PRECACHE = [
  "./",
  "index.html",
  "lecteur/icon-192.png",
  "pdf/icon-192.png",
  "budget/icon-192.png",
  "liseuse/icon-192.png",
  "fichiers/icon-192.png",
  "actualites/icon-192.png",
  "notes/icon-192.png",
  "agenda/icon-192.png",
  "contacts/icon-192.png",
  "calcul/icon-192.png",
  "qr/icon-192.png",
  "meteo/icon-192.png",
  "bourse/icon-192.png",
  "ciel/icon-192.png",
  "sentiers/icon-192.png",
  "solaire/icon-192.png",
  "musique/icon-192.png",
  "ondes/icon-192.png",
  "ecran/icon-192.png",
  "galerie/icon-192.png",
  "toile/icon-192.png",
  "scan/icon-192.png",
  "dicta/icon-192.png",
  "coffre/icon-192.png",
  "petitspas/icon-192.png",
  "chasse/icon-192.png",
  "presentation/icon-192.png",
  "voyage/icon-192.png",
  "texte/icon-192.png",
  "cadrans/icon-192.png",
  "langues/icon-192.png",
  "majordome/icon-192.png",
  "fond-jarvis/icon-192.png",
  "correcteur/icon-192.png",
  "tableur/icon-192.png"
];
var SCOPE = self.registration.scope;
var OWN = {};
PRECACHE.forEach(function (p) { OWN[new URL(p, self.location.href).href] = 1; });

function get(u, n) {
  n = n || 0;
  return fetch(new Request(u, { cache: 'reload' })).then(function (r) {
    if (!r.ok) throw new Error(u + ' : ' + r.status);
    return r;
  }).catch(function (err) {
    if (n >= 2) throw err;
    return new Promise(function (ok) { setTimeout(ok, 1500 * (n + 1)); }).then(function () { return get(u, n + 1); });
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) { return get(u).then(function (r) { return c.put(u, r); }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('mag-pc-lanceur-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u = new URL(req.url); u.hash = ''; u.search = '';
  var key = (u.href === SCOPE || u.href === SCOPE + 'index.html') ? SCOPE + 'index.html' : (OWN[u.href] ? u.href : null);
  if (!key) return;   // fichiers des applis, versions.json… : le réseau (ou le service worker de l'appli)
  // la page du lanceur : réseau d'abord (versions à jour), copie gardée sans internet ; les icônes : copie d'abord
  if (key === SCOPE + 'index.html') {
    e.respondWith(fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(key, cp); }); }
      return r;
    }).catch(function () { return caches.open(CACHE).then(function (c) { return c.match(key); }).then(function (hit) { return hit || Response.error(); }); }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(function (c) { return c.match(key); }).then(function (hit) { return hit || fetch(req); }));
});
