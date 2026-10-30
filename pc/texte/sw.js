/* Service worker de « Texte » (Suite MAG sur PC) : fichier GÉNÉRÉ par pc/build-pc.py depuis
   pc/shared/sw-template.js — ne pas le modifier à la main.
   - installation : tous les fichiers de l'appli et ses bibliothèques sont mis en cache (hors ligne) ;
   - VERSION change dès qu'un fichier précaché change : le navigateur installe la nouvelle version,
     la page affiche « Nouvelle version disponible » et l'active sur demande (message SKIP_WAITING) ;
   - message VERSION : répond {app, version, date} (« Version du JJ/MM » de l'appli et du lanceur) ;
   - réponses : cache d'abord pour les fichiers précachés, réseau puis cache pour le reste (polices…). */
'use strict';
var VERSION = '3de7238e1c7c';
var DATE = '2026-10-30';          // jour de publication de cette version (« Version du JJ/MM » dans l'appli et le lanceur)
var APP = 'texte';
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
  "../shared/vendor/jszip.min.js",
  "../shared/vendor/jspdf.umd.min.js",
  "../shared/vendor/prosemirror.min.js",
  "../shared/vendor/prosemirror.css",
  "../shared/vendor/lucide-icons.js",
  "../shared/vendor/katex/katex.min.js",
  "../shared/vendor/katex/katex.min.css",
  "../shared/vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "../shared/vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "../shared/vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "../shared/vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "../shared/vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2",
  "../shared/vendor/fonts/Caladea-Bold.ttf",
  "../shared/vendor/fonts/Caladea-BoldItalic.ttf",
  "../shared/vendor/fonts/Caladea-Italic.ttf",
  "../shared/vendor/fonts/Caladea-Regular.ttf",
  "../shared/vendor/fonts/MagMono-Bold.ttf",
  "../shared/vendor/fonts/MagMono-BoldItalic.ttf",
  "../shared/vendor/fonts/MagMono-Italic.ttf",
  "../shared/vendor/fonts/MagMono-Regular.ttf",
  "../shared/vendor/fonts/MagSans-Bold.ttf",
  "../shared/vendor/fonts/MagSans-BoldItalic.ttf",
  "../shared/vendor/fonts/MagSans-Italic.ttf",
  "../shared/vendor/fonts/MagSans-Regular.ttf",
  "../shared/vendor/fonts/MagSansDouce-Bold.ttf",
  "../shared/vendor/fonts/MagSansDouce-BoldItalic.ttf",
  "../shared/vendor/fonts/MagSansDouce-Italic.ttf",
  "../shared/vendor/fonts/MagSansDouce-Regular.ttf",
  "../shared/vendor/fonts/MagSerif-Bold.ttf",
  "../shared/vendor/fonts/MagSerif-BoldItalic.ttf",
  "../shared/vendor/fonts/MagSerif-Italic.ttf",
  "../shared/vendor/fonts/MagSerif-Regular.ttf",
  "../shared/vendor/fonts/fonts.css",
  "../shared/vendor/fonts/metrics.json",
  "../shared/office/office-core.js",
  "../shared/office/office-files.js",
  "../shared/office/office-history.js",
  "../shared/office/office-pdf.js",
  "../shared/office/office-raster.js",
  "../shared/office/office-ribbon.js",
  "../shared/office/office-richtext.js",
  "../shared/office/office-themes.js",
  "../shared/office/office.css",
  "pres-charts.js",
  "pres-shapes.js",
  "texte-doc.css",
  "texte.css",
  "tx-app.js",
  "tx-commands.js",
  "tx-dialogs.js",
  "tx-docx.js",
  "tx-editor.js",
  "tx-io.js",
  "tx-layout.js",
  "tx-merge.js",
  "tx-model.js",
  "tx-odt.js",
  "tx-panes.js",
  "tx-pdf.js",
  "tx-schema.js",
  "tx-templates.js",
  "tx-ui.js",
  "tx-views.js"
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
