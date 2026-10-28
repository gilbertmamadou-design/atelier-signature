/* =====================================================================
   Relais réseau FACULTATIF de la Suite MAG sur PC (Cloudflare Worker).

   Pourquoi : dans un navigateur, une page ne peut lire un flux d'un autre
   site que si ce site l'autorise (en-tête Access-Control-Allow-Origin, « CORS »).
   Sur Android, l'appli lit les flux elle-même ; sur PC, beaucoup de médias
   (Le Monde, Le Figaro, BBC…), Project Gutenberg, PVGIS, etc. bloquent.
   Ce relais personnel lit ces adresses à la place du navigateur, comme le
   ferait l'appli Android, et rien d'autre :
     - seulement pour les pages du site de la Suite (ORIGINS) ;
     - seulement en lecture (GET), en https ;
     - seulement les sites de la liste HOSTS, ou un flux RSS/Atom (podcasts) ;
     - rien n'est stocké (cache de 5 minutes de Cloudflare au plus).
   Il ne republie rien : chaque lecture est faite pour la personne qui utilise
   l'appli, comme sur le téléphone.

   Mise en place (gratuit, 5 minutes) : voir pc/README.md › « Relais réseau ».
   Garder la liste HOSTS identique à MAGPC.net.HOSTS (pc/shared/pc-shim.js).
   ===================================================================== */
const ORIGINS = ['https://gilbertmamadou-design.github.io'];
const HOSTS = [
  // Actualités : médias sans CORS
  'lemonde.fr', 'lefigaro.fr', 'liberation.fr', 'rfi.fr', 'france24.com', '20minutes.fr', 'ouest-france.fr', 'leparisien.fr',
  'la-croix.com', 'euronews.com', 'bbci.co.uk', 'theguardian.com', 'brut.media', 'sudouest.fr', 'nicematin.com', 'actu.fr', 'meteoalarm.org',
  // Ondes : musique libre ; Écran : flux des chaînes YouTube
  'ccmixter.org', 'youtube.com',
  // Petits Pas : Journal officiel (legifrss), Service-Public
  'legifrss.org', 'service-public.gouv.fr',
  // Solaire : production PVGIS (Commission européenne)
  're.jrc.ec.europa.eu',
  // Liseuse : livres libres de droits
  'gutenberg.org', 'gutendex.com', 'ws-export.wmcloud.org'
];
const MAX = 40 * 1024 * 1024;
const FEED = /(rss|atom|xml)/i;

function allowedHost(h) { h = String(h || '').toLowerCase(); return HOSTS.some(d => h === d || h.endsWith('.' + d)); }
function cors(origin) { return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Expose-Headers': 'Content-Type, Content-Length, X-Relais-Url' }; }
function fail(status, msg, origin) { return new Response(msg, { status, headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, origin ? cors(origin) : {}) }); }

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    if (!ORIGINS.includes(origin)) return fail(403, 'Origine refusée');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: Object.assign(cors(origin), { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || '', 'Access-Control-Max-Age': '86400' }) });
    if (req.method !== 'GET') return fail(405, 'Lecture seulement', origin);
    let target;
    try { target = new URL(new URL(req.url).searchParams.get('url') || ''); } catch (e) { return fail(400, 'Adresse invalide', origin); }
    if (target.protocol !== 'https:') return fail(400, 'https seulement', origin);
    const listed = allowedHost(target.hostname);
    let r;
    try {
      r = await fetch(target.href, { headers: { 'User-Agent': 'Mozilla/5.0 (Suite MAG sur PC, usage personnel)', 'Accept': req.headers.get('Accept') || '*/*', 'Accept-Language': 'fr-FR,fr;q=0.9' }, redirect: 'follow', cf: { cacheTtl: 300, cacheEverything: true } });
    } catch (e) { return fail(502, 'Site injoignable', origin); }
    const finalUrl = new URL(r.url || target.href), type = r.headers.get('Content-Type') || '';
    // une redirection ne doit pas faire sortir de la liste ; hors liste, seuls les flux RSS/Atom passent (podcasts)
    if (!(listed && allowedHost(finalUrl.hostname)) && !(FEED.test(type) && r.ok)) return fail(403, 'Site non autorisé par le relais', origin);
    const len = +(r.headers.get('Content-Length') || 0);
    if (len > MAX) return fail(413, 'Fichier trop gros pour le relais', origin);
    const h = new Headers(cors(origin));
    h.set('Content-Type', type || 'application/octet-stream');
    if (len) h.set('Content-Length', String(len));
    h.set('Cache-Control', 'private, max-age=300');
    h.set('X-Relais-Url', finalUrl.href);
    return new Response(r.body, { status: r.status, headers: h });
  }
};
