/* =====================================================================
   Toile — onglet « Images en ligne » : partie commune à l'appli Android
   (applis/www-fonds/index.html) et à Toile sur PC (pc/shared/toile.html,
   copié dans pc/toile/toile-en-ligne.js par pc/build-pc.py).

   - THEMES : thèmes prédéfinis, requêtes adaptées à chaque source
     (anglais pour Wikimedia Commons et Openverse, dont les mots-clés sont
     surtout anglais, plus quelques termes français ; français pour Pixabay).
   - Licences acceptées : CC0, domaine public, CC BY, CC BY-SA, licence
     Pixabay. Jamais NC, ND, « fair use » ni fichier marqué non libre.
   - Engine : moteur de récupération du PC (fetch direct, CORS vérifié,
     aucun proxy). Sur Android le même travail est fait par
     applis/scripts/ToileBridge.java (tâche de fond WorkManager), avec les
     mêmes règles (licences, orientation, résolution, doublons, plafond).
   - mount(élément, adaptateur) : l'interface (thèmes, sources, clés,
     quantité, galerie, crédit du fond actuel), identique sur les deux.
   Unsplash et Pexels ne sont pas utilisés : leurs règles d'API interdisent
   les applications de fonds d'écran (voir NON_RETENUES).
   ===================================================================== */
(function (root) {
  'use strict';
  var TEL = {};

  /* ---------------- Sources ---------------- */
  var SOURCES = {
    commons: {
      name: 'Wikimedia Commons', key: '', site: 'https://commons.wikimedia.org',
      txt: "Sans clé. Photos et illustrations sous licence libre ; Toile ne garde que CC0, domaine public, CC BY et CC BY-SA, et affiche l'auteur et la licence."
    },
    openverse: {
      name: 'Openverse', key: '', site: 'https://openverse.org',
      txt: "Sans clé (20 recherches par minute, 200 par jour). Moteur de recherche d'œuvres sous licence Creative Commons (Flickr, Wikimedia, Metropolitan Museum) ; contenus « adultes » exclus."
    },
    apod: {
      name: 'NASA · image astronomique du jour', key: 'optional', site: 'https://apod.nasa.gov/apod/', themes: ['espace'],
      txt: "Thème Espace seulement. Clé DEMO_KEY partagée (30 par heure, 50 par jour) ou votre clé gratuite. Les images marquées d'un droit d'auteur sont exclues.",
      keyName: 'Clé NASA (facultative)', keyUrl: 'https://api.nasa.gov/',
      keySteps: ["Ouvrez <b>api.nasa.gov</b> (lien ci-dessous).", "Dans « Generate API Key », saisissez votre prénom, votre nom et votre adresse e-mail, puis <b>Signup</b>.", "La clé s'affiche tout de suite (et arrive par e-mail) : copiez-la ici."]
    },
    pixabay: {
      name: 'Pixabay', key: 'required', site: 'https://pixabay.com',
      txt: "Clé gratuite nécessaire. Recherche filtrée « tout public » (safesearch). Sans compte approuvé, les images font au plus 1 280 px : sur un écran plus grand elles ne passent qu'avec la résolution « tolérante ».",
      keyName: 'Clé Pixabay', keyUrl: 'https://pixabay.com/api/docs/',
      keySteps: ["Créez un compte gratuit sur <b>pixabay.com</b> (adresse e-mail et mot de passe), puis connectez-vous.", "Ouvrez la page <b>pixabay.com/api/docs</b> (lien ci-dessous).", "Dans la partie « Parameters », à la ligne <b>key</b>, votre clé est écrite en vert : copiez-la ici."]
    }
  };
  var NON_RETENUES = [
    { name: 'Unsplash', url: 'https://help.unsplash.com/api-guidelines/unsplash-api-guidelines', why: "Ses règles d'API interdisent les « applications de fonds d'écran » et imposent d'afficher les images depuis leurs serveurs (pas de copie sur l'appareil)." },
    { name: 'Pexels', url: 'https://www.pexels.com/api/documentation/', why: "Ses conditions d'API interdisent de « rendre les contenus Pexels disponibles comme application de fonds d'écran »." }
  ];
  var ORDER = ['commons', 'openverse', 'pixabay', 'apod'];

  /* ---------------- Thèmes ---------------- */
  // c : Commons, o : Openverse, p : Pixabay {q, type, cat}, apod : NASA, lic 'pd' : domaine public / CC0 seulement
  var THEMES = [
    { id: 'voitures', name: 'Voitures', c: ['sports car', 'classic car', 'voiture de sport'], o: ['sports car', 'classic car', 'supercar'], p: { q: 'voiture de sport', cat: 'transportation' } },
    { id: 'motos', name: 'Motos', c: ['motorcycle', 'moto'], o: ['motorcycle', 'motorbike'], p: { q: 'moto', cat: 'transportation' } },
    { id: 'paysages', name: 'Paysages', c: ['landscape', 'scenic view', 'paysage'], o: ['landscape', 'scenery'], p: { q: 'paysage', cat: 'nature' } },
    { id: 'montagne', name: 'Montagne', c: ['mountain landscape', 'Alps', 'montagne'], o: ['mountains', 'alpine landscape'], p: { q: 'montagne', cat: 'nature' } },
    { id: 'mer', name: 'Mer et plages', c: ['seascape', 'beach landscape', 'coast', 'plage'], o: ['seascape', 'beach', 'coastline'], p: { q: 'plage mer', cat: 'nature' } },
    { id: 'nature', name: 'Nature et forêts', c: ['forest', 'woodland', 'forêt'], o: ['forest', 'woods'], p: { q: 'forêt', cat: 'nature' } },
    { id: 'animaux', name: 'Animaux', c: ['wildlife', 'animal portrait', 'animaux'], o: ['wildlife', 'animal'], p: { q: 'animaux sauvages', cat: 'animals' } },
    { id: 'villes', name: 'Villes', c: ['cityscape', 'skyline', 'city at night'], o: ['cityscape', 'skyline'], p: { q: 'ville', cat: 'places' } },
    { id: 'espace', name: 'Espace', c: ['nebula', 'galaxy', 'Milky Way'], o: ['nebula', 'galaxy', 'milky way'], p: { q: 'galaxie', cat: 'science' }, apod: true },
    { id: 'architecture', name: 'Architecture', c: ['architecture', 'cathedral interior', 'modern architecture'], o: ['architecture', 'building facade'], p: { q: 'architecture', cat: 'buildings' } },
    { id: 'avions', name: 'Avions', c: ['airliner', 'aircraft in flight', 'avion'], o: ['airplane', 'aircraft'], p: { q: 'avion', cat: 'transportation' } },
    { id: 'bateaux', name: 'Bateaux', c: ['sailing ship', 'tall ship', 'voilier'], o: ['sailboat', 'ship'], p: { q: 'voilier bateau', cat: 'transportation' } },
    { id: 'art', name: 'Art et peinture', sub: 'domaine public', lic: 'pd', c: ['oil painting landscape', 'painting', 'impressionism painting'], o: ['painting', 'oil painting'], p: { q: 'peinture tableau', type: 'illustration' } },
    { id: 'manga', name: 'Manga / anime', sub: 'style', c: ['anime style illustration', 'manga style drawing'], o: ['anime illustration', 'manga art'], p: { q: 'anime', type: 'illustration' },
      note: "Illustrations dans le style manga ou anime sous licence libre seulement : les personnages de séries (One Piece, Naruto, Pokémon…) sont protégés par le droit d'auteur et ne sont pas proposés." },
    { id: 'fleurs', name: 'Fleurs', c: ['flower macro', 'flowers', 'fleurs'], o: ['flowers', 'flower macro'], p: { q: 'fleurs', cat: 'nature' } },
    { id: 'couchers', name: 'Couchers de soleil', c: ['sunset', 'sunset sky', 'coucher de soleil'], o: ['sunset', 'sunset landscape'], p: { q: 'coucher de soleil', cat: 'nature' } }
  ];
  var DEFAULT = { v: 1, themes: { paysages: 1, nature: 1, mer: 1 }, free: [], src: { commons: true, openverse: true, apod: true, pixabay: false },
    n: 3, per: 'day', auto: false, wifi: true, capMo: 300, rot: true, minRes: 1 };

  function config(c) {
    var o = JSON.parse(JSON.stringify(DEFAULT));
    if (c && typeof c === 'object') Object.keys(c).forEach(function (k) { if (k !== 'plan') o[k] = c[k]; });
    o.src = Object.assign({}, DEFAULT.src, (c && c.src) || {});
    o.themes = Object.assign({}, (c && c.themes) || DEFAULT.themes);
    o.free = Array.isArray(o.free) ? o.free.slice(0, 5) : [];
    return o;
  }
  // Plan transmis au moteur (et à ToileBridge.java) : thèmes actifs, poids et requêtes de chaque source
  function buildPlan(cfg) {
    var plan = [];
    THEMES.forEach(function (t) {
      var w = +(cfg.themes || {})[t.id] || 0;
      if (w > 0) plan.push({ id: t.id, name: t.name, w: Math.min(3, w), lic: t.lic || '', c: t.c, o: t.o, p: t.p, apod: !!t.apod });
    });
    (cfg.free || []).forEach(function (f) {
      var q = String(f.q || '').trim().slice(0, 80);
      if (q && (+f.w || 0) > 0) plan.push({ id: 'libre:' + q.toLowerCase(), name: q, w: Math.min(3, +f.w), lic: '', c: [q], o: [q], p: { q: q }, apod: false });
    });
    return plan;
  }
  // Répartition de n images entre les thèmes selon leur poids (plus forts restes, départage au hasard)
  function allocate(plan, n, rnd) {
    rnd = rnd || Math.random;
    var th = plan.filter(function (t) { return t.w > 0; }), W = th.reduce(function (s, t) { return s + t.w; }, 0), out = [];
    if (!th.length || n <= 0) return out;
    var cnt = th.map(function (t) { return Math.floor(n * t.w / W); }), fr = th.map(function (t, i) { return n * t.w / W - cnt[i] + rnd() * 1e-6; });
    var used = cnt.reduce(function (s, x) { return s + x; }, 0);
    while (used < n) {
      var b = -1; fr.forEach(function (f, i) { if (b < 0 || f > fr[b]) b = i; });
      if (fr[b] < 0) { b = Math.floor(rnd() * th.length); } else fr[b] = -1;
      cnt[b]++; used++;
    }
    th.forEach(function (t, i) { for (var k = 0; k < cnt[i]; k++) out.push(t); });
    for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), x = out[i]; out[i] = out[j]; out[j] = x; }
    return out;
  }

  /* ---------------- Règles communes (identiques dans ToileBridge.java) ---------------- */
  var STEPS = [960, 1280, 1920, 3840];          // tailles de vignettes standard de Wikimedia (les autres sont limitées)
  var MAX_BYTES = 30 * 1024 * 1024;
  var MATURE = /(^|[^a-zà-ÿ])(nude?s?|nudity|naked|nudism|nudists?|naturism|naturists?|nudisme|naturisme|nudistes?|naturistes?|topless|erotica?|érotiques?|erotique|porn\w*|sexy|sexual|sexe|lingerie|nue?s?|seins?|breasts?|genitals?|penis|vagina|fetish)([^a-zà-ÿ]|$)/i;
  var OV_SOURCES = 'flickr,wikimedia,met';
  // Hôtes d'images acceptés (la même liste blanche que ToileBridge.java)
  var IMG_HOST = /^(upload\.wikimedia\.org|live\.staticflickr\.com|farm\d+\.staticflickr\.com|images\.metmuseum\.org|apod\.nasa\.gov|pixabay\.com|cdn\.pixabay\.com)$/;

  function strip(h) {
    return String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim();
  }
  function cut(s, n) { s = strip(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function href(h) {
    var m = /href="([^"]+)"/.exec(String(h || '')); if (!m) return '';
    var u = m[1].replace(/&amp;/g, '&');
    if (u.indexOf('//') === 0) u = 'https:' + u; else if (u[0] === '/') u = 'https://commons.wikimedia.org' + u;
    return /^https:\/\//.test(u) ? u : '';
  }
  function host(u) { var m = /^https:\/\/([^/:?#]+)/i.exec(u || ''); return m ? m[1].toLowerCase() : ''; }
  function fits(w, h, o) { return w >= o.minW && h >= o.minH && (o.portrait ? h > w : w > h); }
  function wmKey(u) {
    var m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(u || '');
    return m ? 'wm:' + m[1] : 'url:' + u;
  }
  // Fichier Wikimedia : vignette standard juste assez grande pour couvrir l'écran, sinon l'original
  function wmPick(u, ow, oh, mime, size, o) {
    if (!ow || !oh || !fits(ow, oh, o)) return null;
    var need = Math.max(o.minW, Math.ceil(o.minH * ow / oh)), step = 0;
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i] >= need) { step = STEPS[i]; break; }
    var m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/.exec(u || '');
    if (step && step < ow && m && /jpe?g$/i.test(m[3]) && m[3].length <= 140 && /jpeg/.test(mime || 'image/jpeg'))
      return { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/' + m[1] + '/' + m[2] + '/' + m[3] + '/' + step + 'px-' + m[3], w: step, h: Math.round(oh * step / ow) };
    if (size && size > MAX_BYTES) return null;
    return { url: u, w: ow, h: oh };
  }
  function emv(em, k) { return em && em[k] && em[k].value != null ? String(em[k].value) : ''; }
  function commonsLicense(em) {
    if (/^\s*true\s*$/i.test(emv(em, 'NonFree'))) return null;
    var lic = emv(em, 'License').toLowerCase().trim(), short = strip(emv(em, 'LicenseShortName')), all = (lic + ' ' + short + ' ' + strip(emv(em, 'UsageTerms'))).toLowerCase();
    if (/(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no ?deriv|fair use|non-?free/.test(all)) return null;
    var kind = /^cc0/.test(lic) || /^cc0|cc zero/i.test(short) ? 'cc0'
      : /^(pd|cc-pd|public domain)/.test(lic) || /^(public domain|domaine public|pd)\b/i.test(short) ? 'pd'
      : /^cc-by-sa-\d/.test(lic) ? 'by-sa' : /^cc-by-\d/.test(lic) ? 'by' : '';
    if (!kind) return null;
    return { kind: kind, label: short || lic.toUpperCase(), url: /^https?:\/\//.test(emv(em, 'LicenseUrl')) ? emv(em, 'LicenseUrl').replace(/^http:/, 'https:') : '' };
  }
  function ovLicense(r) {
    var l = String(r.license || '').toLowerCase();
    if (['by', 'by-sa', 'cc0', 'pdm'].indexOf(l) < 0) return null;
    return { kind: l === 'pdm' ? 'pd' : l, label: l === 'pdm' ? 'Domaine public' : l === 'cc0' ? 'CC0' : 'CC ' + l.toUpperCase() + (r.license_version ? ' ' + r.license_version : ''), url: String(r.license_url || '').replace(/^http:/, 'https:') };
  }
  var PROV = { flickr: 'Flickr', wikimedia: 'Wikimedia', met: 'Metropolitan Museum' };

  /* ---------------- Adresses d'API (mêmes paramètres que ToileBridge.java) ---------------- */
  function enc(s) { return encodeURIComponent(s); }
  var URLS = {
    commons: function (q, o) {
      return 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&gsrlimit=40&gsroffset=' + (o.page * 40) +
        '&gsrsearch=' + enc(q + ' filetype:bitmap filew:>' + (o.minW - 1) + ' fileh:>' + (o.minH - 1)) +
        '&prop=imageinfo&iiprop=' + enc('url|size|mime|extmetadata') + '&iiextmetadatafilter=' + enc('License|LicenseShortName|LicenseUrl|Artist|UsageTerms|NonFree|ObjectName|Categories|ImageDescription') +
        '&iiextmetadatalanguage=fr' + (o.pc ? '&origin=*' : '');
    },
    openverse: function (q, o) {
      return 'https://api.openverse.org/v1/images/?q=' + enc(q) + '&license=' + enc(o.lic === 'pd' ? 'cc0,pdm' : 'by,by-sa,cc0,pdm') + '&mature=false&aspect_ratio=' + (o.portrait ? 'tall' : 'wide') +
        '&size=large&source=' + enc(OV_SOURCES) + '&extension=jpg&page_size=20&page=' + (o.page + 1);
    },
    pixabay: function (p, o) {
      return 'https://pixabay.com/api/?key=' + enc(o.key || '') + '&q=' + enc(p.q) + '&lang=fr&image_type=' + (p.type || 'photo') + '&orientation=' + (o.portrait ? 'vertical' : 'horizontal') +
        '&safesearch=true&min_width=' + o.minW + '&min_height=' + o.minH + '&per_page=50&page=' + (o.page + 1) + (p.cat ? '&category=' + p.cat : '');
    },
    apod: function (q, o) { return 'https://api.nasa.gov/planetary/apod?api_key=' + enc(o.key || 'DEMO_KEY') + '&count=8&thumbs=false'; }
  };

  /* ---------------- Lecture des réponses (mêmes filtres que ToileBridge.java) ---------------- */
  var PARSE = {
    commons: function (j, o) {
      var pages = (j && j.query && j.query.pages) || [], out = [];
      if (!Array.isArray(pages)) pages = Object.keys(pages).map(function (k) { return pages[k]; });
      pages.forEach(function (p) {
        var ii = p.imageinfo && p.imageinfo[0]; if (!ii || !p.pageid) return;
        if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) return;
        var em = ii.extmetadata || {}, L = commonsLicense(em);
        if (!L || (o.lic === 'pd' && L.kind !== 'pd' && L.kind !== 'cc0')) return;
        if (MATURE.test([p.title, emv(em, 'ObjectName'), emv(em, 'Categories'), strip(emv(em, 'ImageDescription'))].join(' '))) return;
        var k = wmPick(ii.url, +ii.width, +ii.height, ii.mime, +ii.size, o); if (!k) return;
        var title = cut(emv(em, 'ObjectName'), 90) || cut(String(p.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '), 90);
        out.push({ id: 'commons:' + p.pageid, src: 'commons', via: 'Wikimedia Commons', title: title, author: cut(emv(em, 'Artist'), 80) || 'Auteur inconnu', authorUrl: href(emv(em, 'Artist')),
          license: L.label, licenseUrl: L.url, page: ii.descriptionurl || 'https://commons.wikimedia.org/wiki/' + enc(String(p.title || '').replace(/ /g, '_')), img: k.url, w: k.w, h: k.h, keys: ['commons:' + p.pageid, wmKey(ii.url)] });
      });
      return out;
    },
    openverse: function (j, o) {
      var out = [];
      ((j && j.results) || []).forEach(function (r) {
        if (r.mature) return;
        var L = ovLicense(r); if (!L || (o.lic === 'pd' && L.kind !== 'pd' && L.kind !== 'cc0')) return;
        var u = String(r.url || ''), h = host(u); if (!IMG_HOST.test(h)) return;
        if (MATURE.test([r.title, (r.tags || []).map(function (t) { return t && t.name; }).join(' ')].join(' '))) return;
        var w = +r.width || 0, ht = +r.height || 0;
        var k = h === 'upload.wikimedia.org' ? wmPick(u, w, ht, /\.jpe?g$/i.test(u) ? 'image/jpeg' : 'image/png', +r.filesize || 0, o) : (w && ht && fits(w, ht, o) ? { url: u, w: w, h: ht } : null);
        if (!k) return;
        out.push({ id: 'openverse:' + r.id, src: 'openverse', via: 'Openverse · ' + (PROV[r.source] || r.source || r.provider || ''), title: cut(r.title || 'Sans titre', 90), author: cut(r.creator || 'Auteur inconnu', 80),
          authorUrl: /^https:\/\//.test(r.creator_url || '') ? r.creator_url : '', license: L.label, licenseUrl: L.url, page: /^https?:\/\//.test(r.foreign_landing_url || '') ? r.foreign_landing_url : 'https://openverse.org/image/' + r.id,
          img: k.url, w: k.w, h: k.h, keys: ['openverse:' + r.id, h === 'upload.wikimedia.org' ? wmKey(u) : 'url:' + u] });
      });
      return out;
    },
    pixabay: function (j, o) {
      var out = [];
      ((j && j.hits) || []).forEach(function (x) {
        if (!x || !x.id) return;
        if (MATURE.test(String(x.tags || ''))) return;
        var iw = +x.imageWidth || 0, ih = +x.imageHeight || 0, u, w, h, s;
        if (x.imageURL) { u = x.imageURL; w = iw; h = ih; }
        else if (x.fullHDURL) { s = Math.min(1, 1920 / Math.max(iw, ih)); u = x.fullHDURL; w = Math.round(iw * s); h = Math.round(ih * s); }
        else { s = Math.min(1, 1280 / Math.max(iw, ih)); u = x.largeImageURL; w = Math.round(iw * s); h = Math.round(ih * s); }
        if (!u || !IMG_HOST.test(host(u)) || !fits(w, h, o)) return;
        var tags = String(x.tags || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 3).join(', ');
        out.push({ id: 'pixabay:' + x.id, src: 'pixabay', via: 'Pixabay', title: cut(tags ? tags[0].toUpperCase() + tags.slice(1) : 'Image Pixabay', 90), author: cut(x.user || 'Auteur Pixabay', 80),
          authorUrl: x.user ? 'https://pixabay.com/users/' + enc(x.user) + '-' + (+x.user_id || 0) + '/' : '', license: 'Licence de contenu Pixabay', licenseUrl: 'https://pixabay.com/service/license-summary/',
          page: /^https:\/\//.test(x.pageURL || '') ? x.pageURL : 'https://pixabay.com/', img: u, w: w, h: h, keys: ['pixabay:' + x.id] });
      });
      return out;
    },
    apod: function (j, o) {
      var out = [];
      (Array.isArray(j) ? j : j ? [j] : []).forEach(function (a) {
        if (!a || a.media_type !== 'image' || a.copyright || !/^\d{4}-\d\d-\d\d$/.test(a.date || '')) return;
        var u = String(a.hdurl || a.url || '').replace(/^http:\/\/apod\.nasa\.gov\//, 'https://apod.nasa.gov/');
        if (host(u) !== 'apod.nasa.gov' || !/\.(jpe?g|png)$/i.test(u)) return;
        out.push({ id: 'apod:' + a.date, src: 'apod', via: 'NASA · APOD', title: cut(a.title || 'Image astronomique du jour', 90), author: 'NASA (APOD du ' + a.date.split('-').reverse().join('/') + ')', authorUrl: '',
          license: 'Domaine public (NASA)', licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', page: 'https://apod.nasa.gov/apod/ap' + a.date.slice(2).replace(/-/g, '') + '.html', img: u, w: 0, h: 0, keys: ['apod:' + a.date, 'url:' + u] });
      });
      return out;
    }
  };
  function credit(it) {
    if (!it) return '';
    if (it.src === 'pixabay') return 'Image de ' + it.author + ' sur Pixabay';
    return '« ' + it.title + ' » · ' + it.author + ' · ' + it.license + ' · ' + String(it.via || '').replace(/^Openverse · /, 'via Openverse, ');
  }

  /* =====================================================================
     Moteur du PC : appels directs (fetch), sans cookies, sans proxy.
     E = { fetch, store:{get,set}, files:{put(nom, blob), del(nom)}, measure(blob) → {w,h},
           keys() → {pixabay, apod}, screen() → {w,h}, wait(ms) }
     ===================================================================== */
  function Engine(E) {
    var BLK = 'web-blocked', BLOCK_MS = 7 * 864e5, CACHE_MS = 864e5;
    async function get(k, d) { var v = await E.store.get(k); return v == null ? d : v; }
    async function blocked() { var b = await get(BLK, {}), now = Date.now(), o = {}; Object.keys(b).forEach(function (k) { if (now - b[k].at < BLOCK_MS) o[k] = b[k]; }); return o; }
    async function block(k, msg) { var b = await blocked(); b[k] = { at: Date.now(), msg: msg }; await E.store.set(BLK, b); }
    async function unblock() { await E.store.set(BLK, {}); }
    async function items() { return (await get('web-items', [])).slice(); }
    async function saveItems(a) { await E.store.set('web-items', a); }

    async function api(src, url, cacheable) {
      var c = cacheable ? await get('web-cache', {}) : null, ck = url.replace(/([?&](?:key|api_key)=)[^&]*/, '$1*');
      if (c && c[ck] && Date.now() - c[ck].at < CACHE_MS) return c[ck].body;
      var r, init = { credentials: 'omit', referrerPolicy: 'no-referrer', headers: src === 'commons' ? { 'Api-User-Agent': 'Toile-PC/1.0 (Suite MAG; https://github.com/gilbertmamadou-design/atelier-signature)' } : {} };
      try { r = await E.fetch(url, init); }
      catch (e) {
        if (src === 'commons') { try { r = await E.fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' }); } catch (e2) { } }
        if (!r) { var x = new Error('réseau'); x.net = true; throw x; }
      }
      if (!r.ok) {
        var t = ''; try { t = (await r.text()).slice(0, 300); } catch (e) { }
        var er = new Error(httpMsg(src, r.status, t)); er.status = r.status; throw er;
      }
      var body = await r.json();
      if (c) { c[ck] = { at: Date.now(), body: body }; var ks = Object.keys(c); if (ks.length > 60) ks.sort(function (a, b) { return c[a].at - c[b].at; }).slice(0, ks.length - 60).forEach(function (k) { delete c[k]; }); await E.store.set('web-cache', c); }
      return body;
    }
    async function collect(cfg, n, prog) {
      cfg = config(cfg); prog = prog || function () { };
      var res = { wanted: n, added: [], msgs: [], tried: 0 };
      var scr = E.screen(), portrait = scr.h > scr.w, f = cfg.minRes === 0.5 ? 0.5 : 1;
      var o0 = { minW: Math.round(Math.min(scr.w, scr.h) * f), minH: Math.round(Math.max(scr.w, scr.h) * f), portrait: portrait, pc: true };
      if (!portrait) { var t = o0.minW; o0.minW = o0.minH; o0.minH = t; }
      var plan = buildPlan(cfg); if (!plan.length) throw new Error('Choisissez au moins un thème');
      var keys = E.keys() || {}, blk = await blocked();
      var srcs = ORDER.filter(function (s) { return cfg.src[s] && !(SOURCES[s].key === 'required' && !keys[s]) && !blk['api:' + s]; });
      if (!srcs.length) throw new Error('Aucune source utilisable : activez Wikimedia Commons ou Openverse');
      var slots = allocate(plan, n);
      var seen = new Set(await get('web-seen', [])), cur = await get('web-cursor', {}), all = await items();
      var pools = {}, reqs = 0, maxReq = 6 + n * 4, dls = 0, maxDl = n * 3 + 3, okNet = 0, fails = {};
      function combos(th) {
        var L = [], i, s, m = 0;
        srcs.forEach(function (s) { var q = s === 'commons' ? th.c : s === 'openverse' ? th.o : s === 'pixabay' ? [th.p] : th.apod ? [null] : []; m = Math.max(m, (q || []).length); });
        for (i = 0; i < m; i++) srcs.forEach(function (s) {
          var q = s === 'commons' ? th.c : s === 'openverse' ? th.o : s === 'pixabay' ? [th.p] : th.apod ? [null] : [];
          if (q && i < q.length && q[i] !== undefined) L.push([s, q[i]]);
        });
        var k = Math.floor(Math.random() * L.length); return L.slice(k).concat(L.slice(0, k));
      }
      async function refill(th, pool) {
        while (pool.combos.length && reqs < maxReq) {
          var cb = pool.combos.shift(), s = cb[0], q = cb[1], qs = s === 'pixabay' ? q.q : String(q);
          var ck = s + '|' + qs + '|' + (o0.portrait ? 'p' : 'l') + '|' + th.lic, page = cur[ck] == null ? Math.floor(Math.random() * 3) : cur[ck];
          var o = Object.assign({}, o0, { page: page, lic: th.lic, key: keys[s] || '' });
          if (reqs > 0 && E.wait) await E.wait(s === 'openverse' ? 1500 : 700);
          reqs++;
          prog({ step: 'search', src: s, theme: th.name });
          var j;
          try { j = await api(s, URLS[s](q, o), s !== 'apod'); okNet++; }
          catch (e) {
            if (e.net) { fails['api:' + s] = (fails['api:' + s] || 0) + 1; if (fails['api:' + s] >= 2) pool.combos = pool.combos.filter(function (x) { return x[0] !== s; }); }
            else { pushMsg(res, e.message); if (e.status === 401 || e.status === 403 || e.status === 429 || (s === 'pixabay' && e.status === 400)) { srcs = srcs.filter(function (x) { return x !== s; }); pool.combos = pool.combos.filter(function (x) { return x[0] !== s; }); } }
            continue;
          }
          var c = PARSE[s](j, o);
          var more = s === 'commons' ? !!(j && j.continue) : s === 'openverse' ? (j && j.page_count > o.page + 1 && o.page < 11) : s === 'pixabay' ? (j && j.totalHits > (o.page + 1) * 50) : true;
          cur[ck] = more ? page + 1 : 0;
          c = c.filter(function (x) { return !x.keys.some(function (k) { return seen.has(k); }) && !blk['img:' + host(x.img)]; });
          for (var i = c.length - 1; i > 0; i--) { var r = Math.floor(Math.random() * (i + 1)), z = c[i]; c[i] = c[r]; c[r] = z; }
          if (c.length) { pool.cands = pool.cands.concat(c); return true; }
        }
        return false;
      }
      for (var si = 0; si < slots.length; si++) {
        var th = slots[si], pool = pools[th.id] || (pools[th.id] = { cands: [], combos: combos(th) }), got = false;
        prog({ step: 'slot', i: si, n: slots.length, theme: th.name });
        while (!got && dls < maxDl) {
          if (!pool.cands.length && !(await refill(th, pool))) break;
          var c = pool.cands.shift(); if (!c || c.keys.some(function (k) { return seen.has(k); })) continue;
          var h = host(c.img); if (!IMG_HOST.test(h) || blk['img:' + h]) continue;
          dls++; res.tried++;
          prog({ step: 'download', i: si, n: slots.length, theme: th.name, title: c.title });
          try {
            var r = await E.fetch(c.img, { credentials: 'omit', referrerPolicy: 'no-referrer' });
            okNet++;
            if (!r.ok) throw new Error('HTTP ' + r.status);
            var len = +r.headers.get('content-length') || 0; if (len > MAX_BYTES) throw new Error('fichier trop gros');
            var ty = (r.headers.get('content-type') || '').toLowerCase(); if (ty && !/^image\/(jpeg|png|webp)/.test(ty)) throw new Error('pas une image');
            var blob = await r.blob(); if (blob.size > MAX_BYTES || blob.size < 2000) throw new Error('taille inattendue');
            var d = await E.measure(blob);
            if (!d || !fits(d.w, d.h, o0)) { c.keys.forEach(function (k) { seen.add(k); }); continue; }
            var hash = await E.hash(await blob.arrayBuffer());
            if (seen.has('h:' + hash)) { c.keys.forEach(function (k) { seen.add(k); }); continue; }
            var ext = /png/.test(blob.type || ty) ? '.png' : /webp/.test(blob.type || ty) ? '.webp' : '.jpg';
            var file = c.src + '-' + String(c.id.split(':')[1]).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) + ext;
            await E.files.put(file, blob);
            var it = { id: c.id, src: c.src, via: c.via, title: c.title, author: c.author, authorUrl: c.authorUrl, license: c.license, licenseUrl: c.licenseUrl, page: c.page, img: c.img,
              file: file, w: d.w, h: d.h, bytes: blob.size, hash: hash, at: Date.now(), theme: th.id, themeName: th.name, fav: false };
            all.push(it); res.added.push(it);
            c.keys.concat(['h:' + hash]).forEach(function (k) { seen.add(k); });
            got = true;
          } catch (e) {
            if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e && e.message)) {
              fails['img:' + h] = (fails['img:' + h] || 0) + 1;
              if (fails['img:' + h] >= 2 && okNet > 0) { blk['img:' + h] = { at: Date.now() }; await block('img:' + h, 'Les images de ' + h + ' ne sont pas lisibles par une page web (CORS) : ignorées sur PC.'); pushMsg(res, 'Images de ' + h + ' bloquées par le navigateur (CORS) : source ignorée sur PC.'); }
            } else c.keys.forEach(function (k) { seen.add(k); });
          }
        }
      }
      // sources dont l'API ne répond jamais alors que le réseau marche : CORS refusé, désactivées avec un message
      for (var k in fails) if (/^api:/.test(k) && fails[k] >= 2 && okNet > 0) { var nm = SOURCES[k.slice(4)].name; await block(k, nm + " : l'API refuse les appels d'une page web (CORS)."); pushMsg(res, nm + " : l'API refuse les appels d'une page web (CORS) : source désactivée sur PC."); }
      if (!okNet && (reqs || dls)) pushMsg(res, 'Pas de connexion internet (ou toutes les sources ont échoué).');
      await saveItems(all);
      var sa = Array.from(seen); if (sa.length > 8000) sa = sa.slice(sa.length - 8000);
      await E.store.set('web-seen', sa); await E.store.set('web-cursor', cur);
      res.removed = await cleanup(cfg.capMo);
      res.at = Date.now();
      await E.store.set('web-last', { at: res.at, added: res.added.length, wanted: n, msgs: res.msgs });
      return res;
    }
    function pushMsg(res, m) { if (m && res.msgs.indexOf(m) < 0) res.msgs.push(m); }
    async function cleanup(capMo) {
      var all = await items(), tot = all.reduce(function (s, x) { return s + (x.bytes || 0); }, 0), cap = (capMo || 300) * 1048576, rm = 0;
      var old = all.filter(function (x) { return !x.fav; }).sort(function (a, b) { return a.at - b.at; });
      while (tot > cap && old.length) { var x = old.shift(); tot -= x.bytes || 0; all.splice(all.indexOf(x), 1); try { await E.files.del(x.file); } catch (e) { } rm++; }
      if (rm) await saveItems(all);
      return rm;
    }
    async function setFav(id, on) { var a = await items(); a.forEach(function (x) { if (x.id === id) x.fav = !!on; }); await saveItems(a); }
    async function refuse(id) {
      var a = await items(), x = a.filter(function (y) { return y.id === id; })[0];
      var ref = await get('web-refused', []); if (ref.indexOf(id) < 0) ref.push(id); await E.store.set('web-refused', ref.slice(-3000));
      if (!x) return;
      a.splice(a.indexOf(x), 1); await saveItems(a);
      try { await E.files.del(x.file); } catch (e) { }
    }
    return { collect: collect, items: items, setFav: setFav, refuse: refuse, cleanup: cleanup, blocked: blocked, unblock: unblock, last: function () { return get('web-last', null); } };
  }
  function httpMsg(src, st, body) {
    var n = SOURCES[src] ? SOURCES[src].name : src;
    if (src === 'pixabay' && (st === 400 || st === 401 || st === 403) && /key/i.test(body || 'key')) return 'Pixabay : clé refusée, vérifiez-la';
    if (src === 'apod' && st === 403) return 'NASA : clé refusée, vérifiez-la';
    if (st === 429) return n + (src === 'apod' ? ' : limite de la clé atteinte (DEMO_KEY : 30 par heure, 50 par jour) ; ajoutez votre clé gratuite' : src === 'openverse' ? ' : limite anonyme atteinte (20 par minute, 200 par jour), réessayez plus tard' : ' : trop de demandes, réessayez plus tard');
    return n + ' : erreur ' + st;
  }

  /* =====================================================================
     Interface commune. Adaptateur A (Android : pont MAGToile ; PC : Engine + OPFS) :
       platform, features:{auto, current, apply, lookup}, screen(), getConfig(), setConfig(cfg),
       keys() → {src: masque}, setKey(src, clé), items(), thumb(item) → url, status(), fetch(n, prog),
       fav(id, on), refuse(id), report(item), open(url), current(), preview(item), apply(item), lookup(nom)
     ===================================================================== */
  var CSS = [
    '.tel{container-type:inline-size;--tel-gap:12px}',
    '.tel .tc{background:var(--bg2,#181b23);border:1px solid var(--line,#ffffff14);border-radius:var(--r,18px);padding:16px;margin-bottom:12px;min-width:0}',
    '.tel h3{margin:0 0 12px;font-size:12.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--tx3,#7d8294);font-weight:700;display:flex;align-items:center;gap:8px}',
    '.tel h3 .cnt{margin-left:auto;text-transform:none;letter-spacing:0;font-weight:600;color:var(--tx2,#b4b8c7)}',
    '.tel .hint{font-size:12.5px;color:var(--tx3,#7d8294);margin-top:6px;line-height:1.45}',
    '.tel .tb{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;border-radius:13px;background:var(--bg3,#222632);border:1px solid var(--line,#ffffff14);font:inherit;font-weight:600;font-size:14px;color:inherit;cursor:pointer;white-space:nowrap;min-width:0}',
    '.tel .tb:hover{background:var(--bg4,#2c3140)}.tel .tb[disabled]{opacity:.5;pointer-events:none}',
    '.tel .tb.main{background:linear-gradient(135deg,var(--acc,#8fb4ff),var(--acc2,#b79bff));color:#10131c;border:0}',
    '.tel .tb.sm{padding:6px 10px;font-size:12.5px;border-radius:10px}',
    '.tel .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.tel .row .tb.grow{flex:1}',
    '.tel .stat{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.tel .stat b{font-size:22px}.tel .stat span{color:var(--tx2,#b4b8c7);font-size:13.5px}',
    '.tel .prog{height:7px;border-radius:7px;background:var(--bg4,#2c3140);overflow:hidden;margin-top:10px}.tel .prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--acc,#8fb4ff),var(--acc2,#b79bff));transition:width .2s}',
    '.tel .msg{font-size:13px;color:var(--tx2,#b4b8c7);margin-top:8px;line-height:1.45}.tel .msg.bad{color:#ffb4a8}',
    '.tel .themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}',
    '.tel .th{border:1px solid var(--line,#ffffff14);background:var(--bg3,#222632);border-radius:13px;padding:9px 10px;display:flex;flex-direction:column;gap:6px;min-width:0}',
    '.tel .th.on{border-color:#8fb4ff80;background:#8fb4ff14}',
    '.tel .th button.tn{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;min-width:0}',
    '.tel .th .bx{width:18px;height:18px;border-radius:6px;border:2px solid var(--tx3,#7d8294);flex:none;display:grid;place-items:center;font-size:12px;color:#10131c}',
    '.tel .th.on .bx{background:var(--acc,#8fb4ff);border-color:var(--acc,#8fb4ff)}',
    '.tel .th small{display:block;font-weight:500;color:var(--tx3,#7d8294);font-size:11.5px}',
    '.tel .wt{display:flex;gap:3px;background:var(--bg2,#181b23);border-radius:9px;padding:2px}',
    '.tel .wt button{all:unset;cursor:pointer;flex:1;text-align:center;font-size:11.5px;font-weight:600;padding:4px 2px;border-radius:7px;color:var(--tx3,#7d8294)}',
    '.tel .wt button.on{background:var(--bg4,#2c3140);color:var(--tx,#f2f3f7)}',
    '.tel .th:not(.on) .wt{visibility:hidden;height:0;padding:0;margin:-3px 0}',
    '.tel .free{display:flex;gap:8px;margin-top:10px}.tel .free input,.tel .kin{flex:1;min-width:0;padding:10px 12px;border-radius:11px;border:1px solid var(--line,#ffffff14);background:var(--bg,#0f1116);color:inherit;font:inherit}',
    '.tel .free input:focus,.tel .kin:focus{outline:2px solid var(--acc,#8fb4ff);border-color:transparent}',
    '.tel .note{font-size:12.5px;color:#ffd7a8;background:#ffb35c14;border:1px solid #ffb35c33;border-radius:11px;padding:8px 10px;margin-top:10px;line-height:1.45}',
    '.tel .src{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--line,#ffffff14)}.tel .src:first-of-type{border-top:0;padding-top:0}',
    '.tel .src .t{flex:1;min-width:0}.tel .src .t>b{display:block}.tel .src .t .d{font-size:12.5px;color:var(--tx3,#7d8294);margin-top:2px;line-height:1.45}',
    '.tel .src .k{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px;font-size:12.5px;color:var(--tx2,#b4b8c7)}',
    '.tel .src .warn{color:#ffd7a8}',
    '.tel .sw{position:relative;width:46px;height:28px;flex:none;cursor:pointer;display:block}',
    '.tel .sw input{opacity:0;position:absolute;inset:0;margin:0;z-index:1;cursor:pointer}',
    '.tel .sw span{position:absolute;inset:0;border-radius:99px;background:var(--bg4,#2c3140);transition:.2s}',
    '.tel .sw span:after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#cfd3df;transition:.2s}',
    '.tel .sw input:checked+span{background:var(--acc,#8fb4ff)}.tel .sw input:checked+span:after{transform:translateX(18px);background:#fff}',
    '.tel .sw input:focus-visible+span{outline:2px solid var(--acc,#8fb4ff);outline-offset:2px}',
    '.tel details.nr{margin-top:10px;font-size:12.5px;color:var(--tx3,#7d8294)}.tel details.nr summary{cursor:pointer;font-weight:600;color:var(--tx2,#b4b8c7)}',
    '.tel details.nr p{margin:6px 0}',
    '.tel .set{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line,#ffffff14)}.tel .set:first-of-type{border-top:0;padding-top:0}',
    '.tel .set .t{flex:1;min-width:0}.tel .set .t div:first-child{font-weight:600}.tel .set .t div+div{font-size:12.5px;color:var(--tx3,#7d8294);margin-top:2px}',
    '.tel .blk{padding:11px 0;border-top:1px solid var(--line,#ffffff14)}.tel .blk .lab{display:flex;justify-content:space-between;font-weight:600;gap:8px}.tel .blk .lab span{color:var(--acc,#8fb4ff);font-variant-numeric:tabular-nums}',
    '.tel input[type=range]{width:100%;margin:12px 0 2px;accent-color:var(--acc,#8fb4ff)}',
    '.tel .seg{display:flex;background:var(--bg3,#222632);border-radius:12px;padding:3px;gap:3px;margin-top:8px;flex-wrap:wrap}',
    '.tel .seg button{all:unset;cursor:pointer;flex:1 1 auto;padding:8px 6px;border-radius:9px;font-size:13px;font-weight:600;color:var(--tx2,#b4b8c7);text-align:center}',
    '.tel .seg button.on{background:var(--bg4,#2c3140);color:var(--tx,#f2f3f7);box-shadow:0 0 0 1px #ffffff1c inset}',
    '.tel .dis{opacity:.45}',
    '.tel .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}',
    '.tel .chip{all:unset;cursor:pointer;padding:6px 11px;border-radius:99px;background:var(--bg3,#222632);border:1px solid var(--line,#ffffff14);font-size:12.5px;font-weight:600;color:var(--tx2,#b4b8c7)}',
    '.tel .chip.on{color:var(--tx,#f2f3f7);border-color:#8fb4ff66;background:#8fb4ff1a}',
    '.tel .gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:9px}',
    '.tel .it{background:var(--bg3,#222632);border:1px solid var(--line,#ffffff14);border-radius:13px;overflow:hidden;display:flex;flex-direction:column;min-width:0}',
    '.tel .it .im{all:unset;cursor:pointer;display:block;aspect-ratio:3/4;background:var(--bg4,#2c3140) center/cover no-repeat;position:relative}',
    '.tel.land .it .im{aspect-ratio:16/10}',
    '.tel .it .im .fv{position:absolute;right:6px;top:6px;background:#000a;color:#ffd76a;border-radius:99px;padding:1px 7px;font-size:13px}',
    '.tel .it .bd{padding:7px 9px 8px;min-width:0}.tel .it .nm{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.tel .it .sb{font-size:11px;color:var(--tx3,#7d8294);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}',
    '.tel .it .ac{display:flex;gap:4px;margin-top:6px}.tel .it .ac button{all:unset;cursor:pointer;flex:1;text-align:center;padding:5px 0;border-radius:8px;background:var(--bg2,#181b23);font-size:13px;color:var(--tx2,#b4b8c7)}',
    '.tel .it .ac button:hover{color:var(--tx,#f2f3f7)}.tel .it .ac button.on{color:#ffd76a}',
    '.tel .empty{color:var(--tx3,#7d8294);font-size:13.5px;text-align:center;padding:26px 12px;border:1px dashed var(--line,#ffffff24);border-radius:14px}',
    '.tel a{color:var(--acc,#8fb4ff)}',
    '@container (min-width:860px){.tel .cols{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:0 12px;align-items:start}.tel .gal{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}}',
    '.tel-dlg{position:fixed;inset:0;z-index:90;background:#07080bcc;display:flex;align-items:flex-end;justify-content:center;padding:12px}',
    '@media (min-width:700px){.tel-dlg{align-items:center}}',
    '.tel-dlg .box{background:#1d212b;color:#eef0f5;border:1px solid #ffffff24;border-radius:18px;width:min(560px,100%);max-height:calc(100vh - 24px);overflow:auto;padding:18px;box-shadow:0 20px 60px #000a;font-size:14px;line-height:1.5}',
    '.tel-dlg h4{margin:0 0 10px;font-size:17px}.tel-dlg ol{padding-left:20px;margin:8px 0}.tel-dlg li{margin:6px 0;color:#c9ccd8}',
    '.tel-dlg .pv{width:100%;max-height:46vh;object-fit:contain;border-radius:12px;background:#0f1116;display:block;margin-bottom:10px}',
    '.tel-dlg dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:8px 0;font-size:13.5px}.tel-dlg dt{color:#9aa0b2}.tel-dlg dd{margin:0;word-break:break-word}',
    '.tel-dlg .cr{background:#0f1116;border:1px solid #ffffff1c;border-radius:10px;padding:8px 10px;font-size:13px;margin:8px 0;user-select:all}',
    '.tel-dlg .btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:14px}'
  ].join('\n');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fsz(b) { return b < 1048576 ? Math.max(1, Math.round(b / 1024)) + ' Ko' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' Mo'; }
  function ago(t) {
    if (!t) return ''; var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "à l'instant"; if (m < 60) return 'il y a ' + m + ' min'; if (m < 1440) return 'il y a ' + Math.round(m / 60) + ' h';
    var d = new Date(t); return 'le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  function pl(n, w, ws) { return n + ' ' + (n > 1 ? (ws || w + 's') : w); }

  function mount(el, A) {
    if (!document.getElementById('tel-css')) { var st = document.createElement('style'); st.id = 'tel-css'; st.textContent = CSS; document.head.appendChild(st); }
    var cfg, items = [], keys = {}, status = {}, FILTER = 'all', BUSY = false, PROG = null, RES = null, thumbs = {}, IO = null, shown = 60;
    var SCR = A.screen(), land = SCR.w > SCR.h;
    el.innerHTML = '';
    var root = document.createElement('div'); root.className = 'tel' + (land ? ' land' : ''); el.appendChild(root);

    async function load() {
      cfg = config(await A.getConfig());
      keys = (await A.keys()) || {};
      items = (await A.items()) || [];
      status = (await A.status()) || {};
    }
    async function save() { await A.setConfig(cfg); }
    function toast(t, bad) { if (A.toast) A.toast(t, bad); }

    function head() {
      var tot = items.reduce(function (s, x) { return s + (x.bytes || 0); }, 0), fav = items.filter(function (x) { return x.fav; }).length;
      var last = status.at ? 'Dernière récupération ' + ago(status.at) + (status.added != null ? ' : ' + pl(status.added, 'image ajoutée', 'images ajoutées') : '') : 'Aucune récupération pour le moment';
      var next = A.features.auto ? (cfg.auto ? ' · automatique : ' + pl(cfg.n, 'image') + ' par ' + (cfg.per === 'week' ? 'semaine' : 'jour') + (cfg.wifi ? ', en Wi-Fi' : '') : ' · récupération automatique arrêtée') : '';
      var msgs = (RES && RES.msgs) || status.msgs || [];
      var h = '<section class="tc" id="telHead"><h3>Images en ligne<span class="cnt">' + esc(SCR.w + '×' + SCR.h) + (land ? ' · paysage' : ' · portrait') + '</span></h3>' +
        '<div class="stat"><b>' + items.length + '</b><span>' + (items.length > 1 ? 'images' : 'image') + ' · ' + fsz(tot) + ' sur ' + cfg.capMo + ' Mo' + (fav ? ' · ' + pl(fav, 'favori') : '') + '</span></div>' +
        '<div class="msg" id="telLast">' + esc(last + next) + '</div>' +
        (msgs.length ? '<div class="msg bad">' + msgs.map(esc).join('<br>') + '</div>' : '') +
        '<div class="row"><button class="tb main grow" id="telGo"' + (BUSY ? ' disabled' : '') + '>' + (BUSY ? 'Récupération…' : 'Récupérer ' + pl(cfg.n, 'image')) + '</button>' +
        (A.features.current ? '<button class="tb" id="telCur">Infos du fond actuel</button>' : '') + '</div>' +
        '<div class="prog" id="telProg"' + (BUSY ? '' : ' hidden') + '><i style="width:' + (PROG ? Math.round(PROG * 100) : 3) + '%"></i></div><div class="msg" id="telStep"></div>' +
        (A.features.lookup ? '<div class="free"><input id="telLook" placeholder="Nom d\'un fond (ex. toile-commons-123…jpg)" aria-label="Nom du fichier d\'un fond"><button class="tb" id="telLookB">Crédit</button></div><div class="hint">Windows n\'indique pas quel fond est affiché : son nom de fichier (clic droit sur le bureau › Fond d\'écran suivant, ou dans « Fonds Toile ») retrouve l\'auteur et la licence. La liste complète est aussi dans <b>toile-credits.txt</b>.</div>' : '') +
        '</section>';
      return h;
    }
    function themesCard() {
      var activeN = THEMES.filter(function (t) { return cfg.themes[t.id] > 0; }).length + cfg.free.filter(function (f) { return f.w > 0; }).length;
      var h = '<section class="tc"><h3>Thèmes<span class="cnt">' + pl(activeN, 'actif', 'actifs') + '</span></h3><div class="themes">';
      THEMES.forEach(function (t) { h += tile('t:' + t.id, t.name, t.sub, cfg.themes[t.id] || 0, false); });
      cfg.free.forEach(function (f, i) { h += tile('f:' + i, f.q, 'thème libre', f.w || 0, true); });
      h += '</div>';
      if (cfg.themes.manga > 0) h += '<div class="note">' + esc(THEMES.filter(function (t) { return t.id === 'manga'; })[0].note) + '</div>';
      h += '<div class="free"><input id="telFree" maxlength="80" placeholder="Thème libre : mots-clés (ex. phare, aurore boréale)" aria-label="Thème libre"><button class="tb" id="telAdd">Ajouter</button></div>' +
        '<div class="hint">Touchez un thème pour l\'activer, puis choisissez sa part : <b>Peu</b>, <b>Normal</b> ou <b>Beaucoup</b> d\'images.</div></section>';
      return h;
    }
    function tile(k, name, sub, w, free) {
      return '<div class="th' + (w > 0 ? ' on' : '') + '" data-th="' + esc(k) + '"><button class="tn" aria-pressed="' + (w > 0) + '"><span class="bx">' + (w > 0 ? '✓' : '') + '</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis">' + esc(name) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
        (free ? '<span data-rmf title="Supprimer ce thème" aria-label="Supprimer le thème ' + esc(name) + '" style="margin-left:auto;color:var(--tx3,#7d8294);padding:0 2px">✕</span>' : '') + '</button>' +
        '<div class="wt">' + [[1, 'Peu'], [2, 'Normal'], [3, 'Beaucoup']].map(function (x) { return '<button data-w="' + x[0] + '" class="' + (w === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    }
    function sourcesCard() {
      var h = '<section class="tc"><h3>Sources</h3>';
      ORDER.forEach(function (s) {
        var S = SOURCES[s], on = !!cfg.src[s], k = keys[s] || '', bl = status.blocked && status.blocked['api:' + s];
        var need = S.key === 'required' && !k;
        h += '<div class="src" data-src="' + s + '"><div class="t"><b>' + esc(S.name) + '</b><div class="d">' + esc(S.txt) + '</div>';
        if (S.key) h += '<div class="k">' + (k ? 'Clé enregistrée <b>' + esc(k) + '</b>' : S.key === 'required' ? '<span class="warn">Clé nécessaire</span>' : 'Clé : DEMO_KEY (partagée)') +
          ' <button class="tb sm" data-key="' + s + '">' + (k ? 'Changer' : 'Ajouter une clé') + '</button>' + (k ? '<button class="tb sm" data-delkey="' + s + '">Retirer</button>' : '') + '</div>';
        if (bl) h += '<div class="k warn">' + esc(bl.msg || 'Indisponible sur PC') + ' <button class="tb sm" data-unblock>Réessayer</button></div>';
        h += '</div><label class="sw' + (need ? ' dis' : '') + '"><input type="checkbox" data-on="' + s + '"' + (on && !need ? ' checked' : '') + (need ? ' disabled' : '') + ' aria-label="Utiliser ' + esc(S.name) + '"><span></span></label></div>';
      });
      var hosts = status.blockedHosts || [];
      if (hosts.length) h += '<div class="note">' + hosts.map(function (b) { return esc(b.msg); }).join('<br>') + ' <button class="tb sm" data-unblock>Réessayer</button></div>';
      h += '<details class="nr"><summary>Sources non retenues : Unsplash, Pexels</summary>' + NON_RETENUES.map(function (n) { return '<p><b>' + esc(n.name) + '</b> : ' + esc(n.why) + ' <a href="' + esc(n.url) + '" data-open="' + esc(n.url) + '">Leurs règles</a></p>'; }).join('') +
        '<p>Toile n\'utilise que des sources qui autorisent la réutilisation, en indiquant l\'auteur et la licence de chaque image. Pas de copie de sites ni de contenus protégés.</p></details></section>';
      return h;
    }
    function freqCard() {
      var a = A.features.auto, h = '<section class="tc"><h3>Quantité' + (a ? ' et fréquence' : ' et stockage') + '</h3>';
      if (a) h += '<div class="set"><div class="t"><div>Récupérer automatiquement</div><div>En arrière-plan, même appli fermée</div></div><label class="sw"><input type="checkbox" data-k="auto" aria-label="Récupérer automatiquement"' + (cfg.auto ? ' checked' : '') + '><span></span></label></div>';
      h += '<div class="blk' + (a && !cfg.auto ? '' : '') + '"><div class="lab">' + (a ? 'Nouvelles images' : 'Images par récupération') + ' <span>' + cfg.n + (a ? ' par ' + (cfg.per === 'week' ? 'semaine' : 'jour') : '') + '</span></div>' +
        '<input type="range" min="1" max="' + (a ? 20 : 30) + '" step="1" data-k="n" value="' + cfg.n + '" aria-label="Nombre d\'images">' +
        (a ? '<div class="seg" data-seg="per"><button data-v="day" class="' + (cfg.per !== 'week' ? 'on' : '') + '">Par jour</button><button data-v="week" class="' + (cfg.per === 'week' ? 'on' : '') + '">Par semaine</button></div>' : '') + '</div>';
      if (a) h += '<div class="set"><div class="t"><div>Wi-Fi seulement</div><div>La récupération automatique attend une connexion sans limite de données</div></div><label class="sw"><input type="checkbox" data-k="wifi" aria-label="Wi-Fi seulement"' + (cfg.wifi ? ' checked' : '') + '><span></span></label></div>';
      h += '<div class="blk"><div class="lab">Plafond de stockage <span>' + (cfg.capMo >= 1000 ? (cfg.capMo / 1000).toString().replace('.', ',') + ' Go' : cfg.capMo + ' Mo') + '</span></div><input type="range" min="50" max="2000" step="50" data-k="capMo" value="' + cfg.capMo + '" aria-label="Plafond de stockage">' +
        '<div class="hint">Au-delà, les images les plus anciennes sont supprimées, sauf les favoris.</div></div>';
      h += '<div class="blk"><div class="lab">Résolution minimale</div><div class="seg" data-seg="minRes"><button data-v="1" class="' + (cfg.minRes !== 0.5 ? 'on' : '') + '">Celle de l\'écran (net)</button><button data-v="0.5" class="' + (cfg.minRes === 0.5 ? 'on' : '') + '">Tolérante (la moitié)</button></div>' +
        '<div class="hint">Images ' + (land ? 'en paysage' : 'en portrait') + ' d\'au moins ' + Math.round(SCR.w * (cfg.minRes === 0.5 ? 0.5 : 1)) + '×' + Math.round(SCR.h * (cfg.minRes === 0.5 ? 0.5 : 1)) + ' pixels ; les autres sont ignorées.</div></div>';
      h += '<div class="set"><div class="t"><div>' + (a ? 'Ajouter à la rotation des fonds' : 'Préparer dans « Fonds Toile »') + '</div><div>' + (a ? 'Les images en ligne passent par le même recadrage que vos dossiers' : 'Mêmes traitements que vos photos (mode d\'adaptation choisi)') + '</div></div><label class="sw"><input type="checkbox" data-k="rot" aria-label="Ajouter à la rotation"' + (cfg.rot ? ' checked' : '') + '><span></span></label></div>';
      return h + '</section>';
    }
    function galCard() {
      var list = items.slice().sort(function (a, b) { return b.at - a.at; }).filter(function (x) { return FILTER === 'all' || (FILTER === 'fav' ? x.fav : x.theme === FILTER); });
      var thm = {}; items.forEach(function (x) { thm[x.theme] = x.themeName || x.theme; });
      var h = '<section class="tc" id="telGal"><h3>Galerie « En ligne »<span class="cnt">' + pl(items.length, 'image') + '</span></h3>';
      if (!items.length) return h + '<div class="empty">Aucune image pour le moment. Choisissez des thèmes, puis « Récupérer ».</div></section>';
      h += '<div class="chips"><button class="chip' + (FILTER === 'all' ? ' on' : '') + '" data-f="all">Toutes</button><button class="chip' + (FILTER === 'fav' ? ' on' : '') + '" data-f="fav">Favoris</button>' +
        Object.keys(thm).map(function (k) { return '<button class="chip' + (FILTER === k ? ' on' : '') + '" data-f="' + esc(k) + '">' + esc(thm[k]) + '</button>'; }).join('') + '</div>';
      if (!list.length) return h + '<div class="empty">Rien dans ce filtre.</div></section>';
      h += '<div class="gal">' + list.slice(0, shown).map(function (x) {
        var t = thumbs[x.id];
        return '<div class="it" data-id="' + esc(x.id) + '"><button class="im" data-d aria-label="Détails de ' + esc(x.title) + '" style="' + (t ? "background-image:url('" + t + "')" : '') + '">' + (x.fav ? '<span class="fv">★</span>' : '') + '</button>' +
          '<div class="bd"><div class="nm" title="' + esc(x.title) + '">' + esc(x.title) + '</div><div class="sb" title="' + esc(credit(x)) + '">' + esc(x.author) + ' · ' + esc(x.license) + '</div><div class="sb">' + esc(x.via) + '</div>' +
          '<div class="ac"><button data-fav class="' + (x.fav ? 'on' : '') + '" title="' + (x.fav ? 'Retirer des favoris' : 'Garder (favori)') + '" aria-label="Favori">' + (x.fav ? '★' : '☆') + '</button>' +
          '<button data-orig title="Page d\'origine" aria-label="Page d\'origine">↗</button><button data-ref title="Ne plus montrer" aria-label="Ne plus montrer">⊘</button><button data-rep title="Signaler" aria-label="Signaler">⚑</button></div></div></div>';
      }).join('') + '</div>' + (list.length > shown ? '<div class="row"><button class="tb grow" id="telMore">Afficher plus (' + (list.length - shown) + ')</button></div>' : '');
      return h + '</section>';
    }
    function paint() {
      var y = window.scrollY;
      root.innerHTML = head() + '<div class="cols"><div>' + themesCard() + '</div><div>' + sourcesCard() + freqCard() + '</div></div>' + galCard();
      window.scrollTo(0, y);
      observe();
    }
    function observe() {
      if (!('IntersectionObserver' in window)) return;
      if (!IO) IO = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return; IO.unobserve(e.target);
          var id = e.target.closest('.it').dataset.id, x = items.filter(function (y) { return y.id === id; })[0];
          if (!x || thumbs[id] !== undefined) return;
          thumbs[id] = null;
          Promise.resolve(A.thumb(x)).then(function (u) { thumbs[id] = u || ''; root.querySelectorAll('.it[data-id="' + cssq(id) + '"] .im').forEach(function (b) { if (u) b.style.backgroundImage = "url('" + u + "')"; }); }).catch(function () { thumbs[id] = ''; });
        });
      }, { rootMargin: '300px' });
      root.querySelectorAll('.it .im').forEach(function (b) { if (thumbs[b.closest('.it').dataset.id] === undefined) IO.observe(b); });
    }
    function cssq(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'); }
    function byId(id) { return items.filter(function (x) { return x.id === id; })[0]; }

    /* ---- dialogues ---- */
    function dialog(html, onOpen) {
      var d = document.createElement('div'); d.className = 'tel-dlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
      d.innerHTML = '<div class="box tel">' + html + '</div>';
      document.body.appendChild(d);
      function close() { d.remove(); document.removeEventListener('keydown', k, true); }
      function k(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
      document.addEventListener('keydown', k, true);
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-close]')) close(); var o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); A.open(o.dataset.open); } });
      if (onOpen) onOpen(d, close);
      return close;
    }
    function keyDialog(s) {
      var S = SOURCES[s];
      dialog('<h4>' + esc(S.keyName) + '</h4><p style="margin:0;color:#c9ccd8">Deux minutes, gratuit :</p><ol>' + S.keySteps.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>' +
        '<p><a href="' + esc(S.keyUrl) + '" data-open="' + esc(S.keyUrl) + '">Ouvrir ' + esc(S.keyUrl.replace(/^https:\/\//, '')) + '</a></p>' +
        '<input class="kin" id="telKey" autocomplete="off" spellcheck="false" placeholder="Collez la clé ici" aria-label="Clé" style="width:100%;padding:11px 12px;border-radius:11px;border:1px solid #ffffff24;background:#0f1116;color:#eef0f5;font:inherit">' +
        '<p style="font-size:12.5px;color:#9aa0b2;margin:8px 0 0">La clé reste <b>sur cet appareil</b> : elle n\'est jamais envoyée ailleurs qu\'à ' + esc(S.name) + ', ni enregistrée dans le dépôt ou dans les sauvegardes.</p>' +
        '<div class="btns"><button class="tb" data-close>Annuler</button><button class="tb main" id="telKeyOk">Enregistrer</button></div>', function (d, close) {
        var i = d.querySelector('#telKey'); i.focus();
        d.querySelector('#telKeyOk').onclick = async function () {
          var v = i.value.trim();
          if (!/^[A-Za-z0-9_-]{8,80}$/.test(v)) { i.style.outline = '2px solid #ff7b7b'; toast('Clé invalide : copiez-la sans espace', true); return; }
          await A.setKey(s, v); keys = (await A.keys()) || {}; cfg.src[s] = true; await save(); close(); paint(); toast(S.name + ' : clé enregistrée');
        };
        i.onkeydown = function (e) { if (e.key === 'Enter') d.querySelector('#telKeyOk').click(); };
      });
    }
    function detail(x, extra) {
      if (!x) return;
      var t = thumbs[x.id];
      dialog((extra ? '<p style="margin:0 0 8px;color:#9aa0b2">' + extra + '</p>' : '') + (t ? '<img class="pv" alt="" src="' + t + '">' : '') + '<h4>' + esc(x.title) + '</h4>' +
        '<dl><dt>Auteur</dt><dd>' + (x.authorUrl ? '<a href="' + esc(x.authorUrl) + '" data-open="' + esc(x.authorUrl) + '">' + esc(x.author) + '</a>' : esc(x.author)) + '</dd>' +
        '<dt>Licence</dt><dd>' + (x.licenseUrl ? '<a href="' + esc(x.licenseUrl) + '" data-open="' + esc(x.licenseUrl) + '">' + esc(x.license) + '</a>' : esc(x.license)) + '</dd>' +
        '<dt>Source</dt><dd>' + esc(x.via) + '</dd><dt>Thème</dt><dd>' + esc(x.themeName || x.theme || '') + '</dd><dt>Taille</dt><dd>' + (x.w ? x.w + '×' + x.h + ' · ' : '') + fsz(x.bytes || 0) + ' · ' + esc(ago(x.at)) + '</dd>' +
        (x.file ? '<dt>Fichier</dt><dd>' + esc(x.file) + '</dd>' : '') + '</dl><div class="cr">' + esc(credit(x)) + '</div>' +
        '<div class="btns"><button class="tb" data-a="orig">Page d\'origine ↗</button><button class="tb" data-a="fav">' + (x.fav ? '★ Favori' : '☆ Garder') + '</button><button class="tb" data-a="ref">Ne plus montrer</button><button class="tb" data-a="rep">Signaler</button>' +
        (A.preview ? '<button class="tb main" data-a="pv">' + (A.features.apply ? 'Aperçu sur l\'écran' : 'Aperçu recadré') + '</button>' : '') + '<button class="tb" data-close>Fermer</button></div>', function (d, close) {
        d.querySelector('.btns').onclick = function (e) { var b = e.target.closest('[data-a]'); if (!b) return; close(); act(b.dataset.a, x); };
      });
    }
    async function act(a, x) {
      if (a === 'orig') return A.open(x.page);
      if (a === 'fav') { await A.fav(x.id, !x.fav); x.fav = !x.fav; paint(); toast(x.fav ? 'Gardée : jamais supprimée par le nettoyage' : 'Retirée des favoris'); return; }
      if (a === 'ref' || a === 'rep') {
        if (a === 'rep') {
          var ok = await confirmDlg('Signaler cette image', 'Elle sera retirée de Toile et ne reviendra plus. Pour la signaler à ' + esc(String(x.via).replace(/^Openverse · /, '')) + ' (contenu choquant, mauvaise licence…), utilisez sa page d\'origine, qui va s\'ouvrir.', 'Retirer et ouvrir la page');
          if (!ok) return;
        }
        await (a === 'rep' ? A.report(x) : A.refuse(x.id));
        items = items.filter(function (y) { return y.id !== x.id; }); paint();
        toast(a === 'rep' ? 'Image retirée ; signalez-la sur sa page d\'origine' : 'Image retirée : elle ne reviendra plus');
        return;
      }
      if (a === 'pv' && A.preview) return A.preview(x);
    }
    function confirmDlg(title, html, yes) {
      return new Promise(function (res) {
        dialog('<h4>' + esc(title) + '</h4><p style="color:#c9ccd8">' + html + '</p><div class="btns"><button class="tb" data-close>Annuler</button><button class="tb main" id="telYes">' + esc(yes) + '</button></div>', function (d, close) {
          var done = false; d.querySelector('#telYes').onclick = function () { done = true; close(); res(true); };
          new MutationObserver(function (m, o) { if (!d.isConnected) { o.disconnect(); if (!done) res(false); } }).observe(document.body, { childList: true });
        });
      });
    }

    /* ---- actions ---- */
    async function go() {
      if (BUSY) return;
      if (!buildPlan(cfg).length) { toast('Choisissez au moins un thème', true); return; }
      BUSY = true; PROG = 0.03; RES = null; paint();
      var stepEl = function () { return root.querySelector('#telStep'); };
      try {
        RES = await A.fetch(cfg.n, function (p) {
          if (p.n) PROG = Math.max(PROG || 0, Math.min(0.97, (p.i + (p.step === 'download' ? 0.6 : 0.2)) / p.n));
          var bar = root.querySelector('#telProg i'); if (bar) bar.style.width = Math.round(PROG * 100) + '%';
          var s = stepEl(); if (s) s.textContent = p.step === 'search' ? 'Recherche : ' + p.theme + ' (' + SOURCES[p.src].name + ')…' : p.step === 'download' ? 'Téléchargement : ' + (p.title || p.theme) + '…' : p.text || '';
        });
        var n = RES.added ? (RES.added.length != null ? RES.added.length : RES.added) : 0;
        toast(n ? pl(n, 'image ajoutée', 'images ajoutées') + (n < cfg.n ? ' sur ' + cfg.n + ' demandées' : '') : 'Aucune nouvelle image trouvée' + (RES.msgs && RES.msgs.length ? ' : ' + RES.msgs[0] : ''), !n);
      } catch (e) { RES = { msgs: [(e && e.message) || String(e)] }; toast(RES.msgs[0], true); }
      BUSY = false; PROG = null;
      items = (await A.items()) || []; status = (await A.status()) || {};
      paint();
      if (A.after) A.after(RES);
    }
    async function current() {
      var c = await A.current();
      if (!c) { dialog('<h4>Fond actuel</h4><p style="color:#c9ccd8">Toile n\'a pas encore changé le fond d\'écran.</p><div class="btns"><button class="tb main" data-close>Fermer</button></div>'); return; }
      if (c.local) { dialog('<h4>Fond actuel</h4><p style="color:#c9ccd8">Il vient de vos dossiers : <b>' + esc(c.name || '') + '</b>. Pas de crédit à afficher.</p><div class="btns"><button class="tb main" data-close>Fermer</button></div>'); return; }
      var x = byId(c.id) || c;
      if (thumbs[x.id] === undefined) { try { thumbs[x.id] = (await A.thumb(x)) || ''; } catch (e) { } }
      detail(x, 'Fond d\'écran actuel');
    }
    root.addEventListener('click', async function (e) {
      var t = e.target;
      if (t.closest('#telGo')) return go();
      if (t.closest('#telCur')) return current();
      if (t.closest('#telLookB')) { var v = root.querySelector('#telLook').value.trim(); if (!v) return; var r = await A.lookup(v); if (r) detail(byId(r.id) || r, 'Fond « ' + esc(v) + ' »'); else toast('Aucune image en ligne ne correspond à « ' + v + ' »', true); return; }
      if (t.closest('#telMore')) { shown += 120; paint(); return; }
      var o = t.closest('[data-open]'); if (o) { e.preventDefault(); A.open(o.dataset.open); return; }
      var th = t.closest('[data-th]');
      if (th) {
        var k = th.dataset.th, w = t.closest('[data-w]');
        if (t.closest('[data-rmf]')) { cfg.free.splice(+k.slice(2), 1); await save(); paint(); return; }
        var curW = k[0] === 't' ? (cfg.themes[k.slice(2)] || 0) : (cfg.free[+k.slice(2)].w || 0);
        var nw = w ? +w.dataset.w : curW > 0 ? 0 : 2;
        if (k[0] === 't') { if (nw) cfg.themes[k.slice(2)] = nw; else delete cfg.themes[k.slice(2)]; } else cfg.free[+k.slice(2)].w = nw;
        await save(); paint(); return;
      }
      if (t.closest('#telAdd')) return addFree();
      var kb = t.closest('[data-key]'); if (kb) return keyDialog(kb.dataset.key);
      var dk = t.closest('[data-delkey]'); if (dk) { await A.setKey(dk.dataset.delkey, ''); keys = (await A.keys()) || {}; if (SOURCES[dk.dataset.delkey].key === 'required') cfg.src[dk.dataset.delkey] = false; await save(); paint(); toast('Clé retirée de cet appareil'); return; }
      if (t.closest('[data-unblock]')) { if (A.unblock) await A.unblock(); status = (await A.status()) || {}; paint(); toast('Sources réactivées : elles seront réessayées'); return; }
      var sg = t.closest('[data-seg] button');
      if (sg) { var key = sg.parentNode.dataset.seg; cfg[key] = key === 'minRes' ? +sg.dataset.v : sg.dataset.v; await save(); paint(); return; }
      var f = t.closest('[data-f]'); if (f) { FILTER = f.dataset.f; shown = 60; paint(); return; }
      var it = t.closest('.it');
      if (it) {
        var x = byId(it.dataset.id); if (!x) return;
        if (t.closest('[data-d]')) return detail(x);
        if (t.closest('[data-fav]')) return act('fav', x);
        if (t.closest('[data-orig]')) return act('orig', x);
        if (t.closest('[data-ref]')) return act('ref', x);
        if (t.closest('[data-rep]')) return act('rep', x);
      }
    });
    root.addEventListener('change', async function (e) {
      var i = e.target;
      if (i.dataset.on) { cfg.src[i.dataset.on] = i.checked; await save(); paint(); return; }
      if (i.dataset.k) {
        var k = i.dataset.k; cfg[k] = i.type === 'checkbox' ? i.checked : +i.value;
        await save(); paint();
        if (k === 'auto' && cfg.auto) toast('Récupération automatique : ' + pl(cfg.n, 'image') + ' par ' + (cfg.per === 'week' ? 'semaine' : 'jour') + (cfg.wifi ? ', en Wi-Fi' : ''));
      }
    });
    root.addEventListener('input', function (e) {
      var i = e.target; if (i.type !== 'range') return;
      var lab = i.parentNode.querySelector('.lab span'); if (!lab) return;
      var v = +i.value; lab.textContent = i.dataset.k === 'capMo' ? (v >= 1000 ? (v / 1000).toString().replace('.', ',') + ' Go' : v + ' Mo') : v + (A.features.auto && i.dataset.k === 'n' ? ' par ' + (cfg.per === 'week' ? 'semaine' : 'jour') : '');
    });
    root.addEventListener('keydown', function (e) { if (e.target.id === 'telFree' && e.key === 'Enter') addFree(); if (e.target.id === 'telLook' && e.key === 'Enter') root.querySelector('#telLookB').click(); });
    async function addFree() {
      var i = root.querySelector('#telFree'), q = (i.value || '').trim().replace(/\s+/g, ' ');
      if (q.length < 2) { toast('Écrivez un ou plusieurs mots-clés', true); return; }
      if (cfg.free.some(function (f) { return f.q.toLowerCase() === q.toLowerCase(); })) { toast('Ce thème existe déjà', true); return; }
      if (cfg.free.length >= 5) { toast('5 thèmes libres au plus', true); return; }
      cfg.free.push({ q: q.slice(0, 80), w: 2 }); await save(); paint(); toast('Thème « ' + q + ' » ajouté');
    }

    var api = {
      refresh: async function () { await load(); paint(); },
      busy: function () { return BUSY; },
      config: function () { return cfg; }
    };
    return load().then(async function () { if (A.ensurePlan) await save(); paint(); return api; });
  }

  TEL.SOURCES = SOURCES; TEL.NON_RETENUES = NON_RETENUES; TEL.THEMES = THEMES; TEL.DEFAULT = DEFAULT;
  TEL.config = config; TEL.buildPlan = buildPlan; TEL.allocate = allocate; TEL.URLS = URLS; TEL.PARSE = PARSE; TEL.credit = credit;
  TEL.commonsLicense = commonsLicense; TEL.wmPick = wmPick; TEL.MATURE = MATURE; TEL.IMG_HOST = IMG_HOST;
  TEL.Engine = Engine; TEL.mount = mount; TEL.esc = esc;
  root.TEL = TEL;
})(typeof window !== 'undefined' ? window : this);
