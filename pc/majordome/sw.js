/* Service worker de « Majordome » (Suite MAG sur PC) : fichier GÉNÉRÉ par pc/build-pc.py depuis
   pc/shared/sw-template.js — ne pas le modifier à la main.
   - installation : tous les fichiers de l'appli et ses bibliothèques sont mis en cache (hors ligne) ;
   - VERSION change dès qu'un fichier précaché change : le navigateur installe la nouvelle version,
     la page affiche « Nouvelle version disponible » et l'active sur demande (message SKIP_WAITING) ;
   - réponses : cache d'abord pour les fichiers précachés, réseau puis cache pour le reste (polices…). */
'use strict';
var VERSION = 'fd3c6dac29d9';
var APP = 'majordome';
var CACHE = 'mag-pc-' + APP + '-' + VERSION, RUNTIME = 'mag-pc-' + APP + '-rt';
var PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "../shared/pc-shim.js",
  "../shared/pc.css",
  "../shared/apps/majordome.js",
  "../shared/vendor/vosk/vosk-worker.js",
  "mj-app.js",
  "mj-depts.js",
  "mj-maison.js",
  "mj-nlu.js",
  "mj-orb.js",
  "../shared/apps/agenda.js"
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (r) {
        if (!r.ok) throw new Error(u + ' : ' + r.status);
        return c.put(u, r);
      });
    }));
  }).then(function () {
    // première installation : rien à remplacer, on prend la main tout de suite
    return self.registration.active ? null : self.skipWaiting();
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('mag-pc-' + APP + '-') === 0 && k !== CACHE && k !== RUNTIME; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

var SCOPE = self.registration.scope;
function precached(url) {
  var u = new URL(url); u.hash = ''; u.search = '';            // ?socle=… : même page
  if (u.href === SCOPE || u.href === SCOPE + 'index.html') return SCOPE + 'index.html';
  return PRECACHE_ABS[u.origin + u.pathname] ? u.origin + u.pathname : null;
}
var PRECACHE_ABS = {};
PRECACHE.forEach(function (p) { PRECACHE_ABS[new URL(p, self.location.href).href] = 1; });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  var key = url.origin === self.location.origin ? precached(req.url) : null;
  if (key || req.mode === 'navigate') {
    var k = key || SCOPE + 'index.html';
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(k).then(function (hit) { return hit || fetch(req); });
    }).catch(function () { return fetch(req); }));
    return;
  }
  // polices Google, fichiers du même site non précachés : réseau, sinon copie gardée
  if (url.origin === self.location.origin || /^https:\/\/fonts\.(googleapis|gstatic)\.com$/.test(url.origin)) {
    e.respondWith(fetch(req).then(function (r) {
      if (r && (r.ok || r.type === 'opaque')) { var cp = r.clone(); caches.open(RUNTIME).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () { return caches.match(req).then(function (hit) { return hit || Response.error(); }); }));
  }
});
