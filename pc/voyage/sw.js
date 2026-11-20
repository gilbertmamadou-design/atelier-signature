/* Service worker de « Carnet de voyage » (Suite MAG sur PC) : fichier GÉNÉRÉ par pc/build-pc.py depuis
   pc/shared/sw-template.js — ne pas le modifier à la main.
   - installation : tous les fichiers de l'appli et ses bibliothèques sont mis en cache (hors ligne) ;
   - VERSION change dès qu'un fichier précaché change : le navigateur installe la nouvelle version,
     la page affiche « Nouvelle version disponible » et l'active sur demande (message SKIP_WAITING) ;
   - message VERSION : répond {app, version, date} (« Version du JJ/MM » de l'appli et du lanceur) ;
   - réponses : cache d'abord pour les fichiers précachés, réseau puis cache pour le reste (polices…). */
'use strict';
var VERSION = 'a63f267ab575';
var DATE = '2026-11-20';          // jour de publication de cette version (« Version du JJ/MM » dans l'appli et le lanceur)
var APP = 'voyage';
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
  "../shared/correcteur/correcteur.js",
  "../shared/vendor/jszip.min.js",
  "../shared/vendor/jspdf.umd.min.js",
  "../shared/vendor/lucide-icons.js",
  "../shared/vendor/fonts-carnet/AmaticSC-Bold.woff",
  "../shared/vendor/fonts-carnet/AmaticSC-Regular.woff",
  "../shared/vendor/fonts-carnet/Caveat.woff",
  "../shared/vendor/fonts-carnet/Kalam-Bold.woff",
  "../shared/vendor/fonts-carnet/Kalam-Regular.woff",
  "../shared/vendor/fonts-carnet/SpecialElite-Regular.woff",
  "../shared/vendor/fonts-carnet/fonts.css",
  "../shared/vendor/fonts/Caladea-Regular.ttf",
  "../shared/vendor/fonts/Caladea-Bold.ttf",
  "../shared/vendor/grammalecte/LICENSE-GPL-3.0.txt",
  "../shared/vendor/grammalecte/LISEZ-MOI.txt",
  "../shared/vendor/grammalecte/README-grammalecte.txt",
  "../shared/vendor/grammalecte/README-thesaurus-LGPL.txt",
  "../shared/vendor/grammalecte/fr/conj.js",
  "../shared/vendor/grammalecte/fr/conj_data.json",
  "../shared/vendor/grammalecte/fr/conj_generator.js",
  "../shared/vendor/grammalecte/fr/cregex.js",
  "../shared/vendor/grammalecte/fr/gc_engine.js",
  "../shared/vendor/grammalecte/fr/gc_functions.js",
  "../shared/vendor/grammalecte/fr/gc_options.js",
  "../shared/vendor/grammalecte/fr/gc_rules.js",
  "../shared/vendor/grammalecte/fr/gc_rules_graph.js",
  "../shared/vendor/grammalecte/fr/mfsp.js",
  "../shared/vendor/grammalecte/fr/mfsp_data.json",
  "../shared/vendor/grammalecte/fr/phonet.js",
  "../shared/vendor/grammalecte/fr/phonet_data.json",
  "../shared/vendor/grammalecte/fr/thesaurus.js",
  "../shared/vendor/grammalecte/fr/thesaurus1_data.json",
  "../shared/vendor/grammalecte/fr/thesaurus2_data.json",
  "../shared/vendor/grammalecte/graphspell/_dictionaries/fr-allvars.json",
  "../shared/vendor/grammalecte/graphspell/char_player.js",
  "../shared/vendor/grammalecte/graphspell/helpers.js",
  "../shared/vendor/grammalecte/graphspell/ibdawg.js",
  "../shared/vendor/grammalecte/graphspell/lexgraph_fr.js",
  "../shared/vendor/grammalecte/graphspell/spellchecker.js",
  "../shared/vendor/grammalecte/graphspell/str_transform.js",
  "../shared/vendor/grammalecte/graphspell/tokenizer.js",
  "../shared/vendor/grammalecte/text.js",
  "../shared/office/office-core.js",
  "../shared/office/office-files.js",
  "../shared/office/office-history.js",
  "../shared/office/office-pdf.js",
  "../shared/office/office-raster.js",
  "../shared/office/office-ribbon.js",
  "../shared/office/office-richtext.js",
  "../shared/office/office-themes.js",
  "../shared/office/office.css",
  "correcteur/correcteur-worker.js",
  "cv-art.js",
  "cv-carte-data.js",
  "cv-editor.js",
  "cv-model.js",
  "cv-render.js",
  "cv-share.js",
  "cv-ui.js",
  "cv-voyage.js",
  "cv.css"
];
// gros fichiers communs à plusieurs applis (moteur du correcteur, 16 Mo) : un seul cache partagé, pas une copie par appli
var COMMUN = 'mag-pc-commun-31f1edb1c086';
function commun(u) { return u.indexOf('/shared/vendor/grammalecte/') >= 0; }

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) {
      var au = new URL(u, self.location.href).href;
      if (commun(au)) return caches.open(COMMUN).then(function (cc) { return cc.match(au).then(function (hit) { return hit || fetch(new Request(au, { cache: 'reload' })).then(function (r) { if (!r.ok) throw new Error(u + ' : ' + r.status); return cc.put(au, r); }); }); });
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
    return Promise.all(keys.filter(function (k) { return (k.indexOf('mag-pc-' + APP + '-') === 0 && k !== CACHE && k !== RUNTIME) || (k.indexOf('mag-pc-commun-') === 0 && k !== COMMUN && PRECACHE.some(function (u) { return commun(new URL(u, self.location.href).href); })); }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  // version de ce service worker (page de l'appli, lanceur) : réponse sur le port fourni
  if (e.data && e.data.type === 'VERSION' && e.ports && e.ports[0]) e.ports[0].postMessage({ app: APP, version: VERSION, date: DATE });
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
    e.respondWith(caches.open(key && commun(key) ? COMMUN : CACHE).then(function (c) {
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
