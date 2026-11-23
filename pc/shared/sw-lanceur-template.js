/* Service worker du lanceur « Suite MAG sur PC » : fichier GÉNÉRÉ par pc/build-pc.py depuis
   pc/shared/sw-lanceur-template.js — ne pas le modifier à la main.
   Garde la page du lanceur et les icônes des applis pour l'ouvrir sans internet.
   Portée pc/ : chaque appli a son propre service worker (portée pc/<appli>/), prioritaire sur celui-ci ;
   celui-ci ne répond QUE pour ses propres fichiers et laisse passer tout le reste. */
'use strict';
var VERSION = '__VERSION__';
var CACHE = 'mag-pc-lanceur-' + VERSION;
var PRECACHE = __PRECACHE__;
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
