#!/usr/bin/env python3
"""Fabrique la Suite MAG sur PC (applis web installables) à partir des pages Android.

    python3 pc/build-pc.py                 # régénère pc/<appli>/ et le lanceur pc/index.html
    python3 pc/build-pc.py --vendor        # en plus, recopie les bibliothèques depuis pc/node_modules (après « npm ci » dans pc/)
    python3 pc/build-pc.py --vendor=exceljs.min.js   # idem pour les seules bibliothèques nommées (séparées par des virgules)
    python3 pc/build-pc.py --check         # vérifie seulement que les fichiers générés sont à jour (code 1 sinon)

Pour chaque appli de pc/pc-apps.json :
  applis/www-<web>/index.html  →  pc/<id>/index.html   (copie + injection du shim PC + adaptations de libellés)
                                  (« office » : chemins office/ → ../shared/office/, pièces communes précachées)
                                  pc/<id>/manifest.webmanifest, icônes 192/512/maskable, sw.js
Rien n'est écrit dans applis/ : les APK Android ne changent pas.
Voir pc/README.md pour les conventions (ponts simulés, CSS, raccourcis…).
"""
import datetime
import hashlib
import html
import json
import os
import re
import shutil
import sys

PC = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(PC)
APPLIS = os.path.join(REPO, 'applis')
SHARED = os.path.join(PC, 'shared')
VENDOR = os.path.join(SHARED, 'vendor')
CHECK = '--check' in sys.argv
WARN = []
CHANGED = []


def read(p, mode='r'):
    with open(p, mode, **({} if 'b' in mode else {'encoding': 'utf-8'})) as f:
        return f.read()


def write(p, data):
    """Écrit seulement si le contenu change (dates de fichiers stables, --check possible)."""
    b = data if isinstance(data, bytes) else data.encode('utf-8')
    if os.path.exists(p) and read(p, 'rb') == b:
        return
    CHANGED.append(os.path.relpath(p, REPO))
    if CHECK:
        return
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as f:
        f.write(b)


def sha(b):
    return hashlib.sha256(b).hexdigest()


# ---------------------------------------------------------------- bibliothèques
def vendor(conf):
    nm = os.path.join(PC, 'node_modules')
    arg = next((a for a in sys.argv if a == '--vendor' or a.startswith('--vendor=')), None)
    if arg:
        only = set(arg.split('=', 1)[1].split(',')) if '=' in arg else None
        if not os.path.isdir(nm):
            sys.exit('pc/node_modules absent : lancer « npm ci » dans pc/ (voir pc/package.json)')
        for dest, v in conf['vendor'].items():
            if not v.get('from') or (only and dest not in only):
                continue
            src = os.path.join(nm, v['package'], v['from'])
            if not os.path.exists(src):
                WARN.append('vendor : %s introuvable' % src)
                continue
            b = read(src, 'rb')
            if dest.endswith('.js'):          # pas de carte de sources (fichier absent : erreur 404 dans la console)
                b = re.sub(rb'\n//# sourceMappingURL=[^\n]*\s*$', b'\n', b)
            write(os.path.join(VENDOR, dest), b)
            if v.get('licenseFrom'):          # licence du paquet recopiée telle quelle
                lic = os.path.join(nm, v['package'], v['licenseFrom'])
                if os.path.exists(lic):
                    write(os.path.join(VENDOR, v['licenseFile']), read(lic, 'rb'))
    meta = {}
    for dest, v in sorted(conf['vendor'].items()):
        p = os.path.join(VENDOR, dest)
        if dest.endswith('/'):              # dossier entier (ex. katex/fonts/) : une ligne par fichier
            if not os.path.isdir(p):
                WARN.append('bibliothèque manquante : pc/shared/vendor/' + dest)
                continue
            for f in vendor_dir(dest):
                b = read(os.path.join(VENDOR, f), 'rb')
                meta[f] = dict(v, size=len(b), sha256=sha(b))
            continue
        if not os.path.exists(p):
            WARN.append('bibliothèque manquante : pc/shared/vendor/' + dest)
            continue
        b = read(p, 'rb')
        meta[dest] = dict(v, size=len(b), sha256=sha(b))
    write(os.path.join(VENDOR, 'VENDOR.json'), json.dumps(meta, ensure_ascii=False, indent=2) + '\n')


def vendor_dir(dest):
    """Fichiers d'un dossier de pc/shared/vendor (chemins relatifs à vendor/, triés)."""
    out = []
    for root, _, fs in os.walk(os.path.join(VENDOR, dest)):
        for f in fs:
            out.append(os.path.relpath(os.path.join(root, f), VENDOR).replace(os.sep, '/'))
    return sorted(out)


def office_files():
    """Pièces communes des applis bureautiques (pc/shared/office, sans les outils de fabrication)."""
    d = os.path.join(SHARED, 'office')
    return sorted(f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f)))


# ---------------------------------------------------------------- icônes
def icons(app, out):
    src = os.path.join(APPLIS, 'www-' + app['android'] if 'web' not in app else app['web'], 'icon-512.png')
    if not os.path.exists(src):
        src = os.path.join(APPLIS, 'android-icons-' + app['android'], 'mipmap-xxxhdpi', 'ic_launcher.png')
    try:
        from PIL import Image
    except ImportError:
        WARN.append('Pillow absent : icônes copiées sans redimensionnement')
        for n in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png'):
            write(os.path.join(out, n), read(src, 'rb'))
        return
    import io
    im = Image.open(src).convert('RGBA')

    def png(img):
        b = io.BytesIO()
        img.save(b, 'PNG', optimize=True)
        return b.getvalue()
    write(os.path.join(out, 'icon-512.png'), png(im.resize((512, 512), Image.LANCZOS)))
    write(os.path.join(out, 'icon-192.png'), png(im.resize((192, 192), Image.LANCZOS)))
    # « maskable » : fond plein (couleur du bord de l'icône) et dessin dans la zone sûre (80 %)
    big = im.resize((512, 512), Image.LANCZOS)
    px = [big.getpixel((x, 256)) for x in range(20, 60)] + [big.getpixel((256, y)) for y in range(20, 60)]
    px = [p for p in px if p[3] > 200] or [(255, 255, 255, 255)]
    bg = tuple(sum(p[i] for p in px) // len(px) for i in range(3)) + (255,)
    m = Image.new('RGBA', (512, 512), bg)
    inner = big.resize((420, 420), Image.LANCZOS)
    m.alpha_composite(inner, (46, 46))
    write(os.path.join(out, 'icon-maskable-512.png'), png(m))


# ---------------------------------------------------------------- page
def page(app, conf, apps_android):
    web = app.get('web') or 'www-' + app['android']
    # « page » : page propre au PC (ex. Toile : pc/shared/toile.html), sinon la page Android applis/www-<appli>/index.html
    src_rel = app['page'] if app.get('page') else 'applis/%s/index.html' % web
    src = read(os.path.join(REPO, src_rel))
    out = src
    # 1. adaptations de libellés (téléphone → ordinateur…) ; une phrase Android modifiée = simple avertissement
    for p in app.get('patches', []):
        n = out.count(p['from'])
        want = p.get('count', 1)          # 0 = toutes les occurrences (au moins une)
        if (n != want and want) or (not want and n == 0):
            WARN.append('%s : libellé trouvé %d fois au lieu de %s (adaptation ignorée) : %s…' % (app['id'], n, want or 'au moins 1', p['from'][:70]))
            if n == 0:
                continue
        out = out.replace(p['from'], p['to'])
    # 2. bibliothèques : 'pdf.min.js' → '../shared/vendor/pdf.min.js' (chaînes entre guillemets seulement, pas les adresses CDN)
    for lib in sorted(conf['vendor'], key=len, reverse=True):
        base = os.path.basename(lib)
        if lib.endswith('/') and lib in app.get('vendor', []) and lib.count('/') == 1:
            # dossier de premier niveau (ex. « fonts/ ») : 'fonts/x.css' → '../shared/vendor/fonts/x.css'
            for q in ('"', "'"):
                out = out.replace(q + lib, q + '../shared/vendor/' + lib)
            continue
        if '/' in lib:
            continue
        for q in ('"', "'"):
            out = out.replace(q + base + q, q + '../shared/vendor/' + base + q)
    # 2 bis. applis bureautiques : pièces communes « office/x.js » de l'APK → ../shared/office/x.js (même source)
    if app.get('office'):
        for q in ('"', "'"):
            out = out.replace(q + 'office/', q + '../shared/office/')
    # 3. injection dans <head> : manifeste, icônes, styles et scripts PC (avant tout le code de la page)
    pcconf = {
        'app': app['id'], 'name': app['name'], 'vendor': '../shared/vendor/', 'ocrWorker': 'ocr-worker.js', 'sw': 'sw.js', 'office': bool(app.get('office')),
        'apps': {apps_android[a['android']]['appid']: '../' + a['id'] + '/' for a in conf['apps'] if a['android'] in apps_android},
    }
    adapter = app.get('adapter', app['id'])
    inj = ('\n<!-- Suite MAG sur PC : ajouté par pc/build-pc.py (source : %s) -->\n'
           '<link rel="manifest" href="manifest.webmanifest">\n'
           '<link rel="icon" type="image/png" href="icon-192.png">\n'
           '<link rel="apple-touch-icon" href="icon-192.png">\n'
           '<link rel="stylesheet" href="../shared/pc.css">\n' % src_rel)
    for c in app.get('styles', []):          # feuilles communes à plusieurs applis (ex. « fenetres » : feuilles et pages centrées)
        inj += '<link rel="stylesheet" href="../shared/apps/%s.css">\n' % c
    if os.path.exists(os.path.join(SHARED, 'apps', adapter + '.css')):
        inj += '<link rel="stylesheet" href="../shared/apps/%s.css">\n' % adapter
    inj += '<script>window.MAGPC_CONF=%s;</script>\n' % json.dumps(pcconf, ensure_ascii=False)
    inj += '<script src="../shared/pc-shim.js"></script>\n'
    for mod in app.get('modules', []):      # modules communs à plusieurs applis (ex. « folders » : dossiers du PC mémorisés)
        inj += '<script src="../shared/%s.js"></script>\n' % mod
    if os.path.exists(os.path.join(SHARED, 'apps', adapter + '.js')):
        inj += '<script src="../shared/apps/%s.js"></script>\n' % adapter
    m = re.search(r'<meta charset="?utf-8"?\s*/?>', out, re.I)
    if not m:
        sys.exit('%s : <meta charset="utf-8"> introuvable' % src_rel)
    out = out[:m.end()] + inj + out[m.end():]
    head = '<!-- FICHIER GÉNÉRÉ par pc/build-pc.py depuis %s : ne pas modifier ici. -->\n' % src_rel
    return head + out


def app_id(app, conf):
    """Identifiant unique et stable de l'appli installée. Il est résolu par rapport à l'ORIGINE (pas au dossier) :
    un id relatif comme "./" donnerait le même identifiant à toutes les applis du site, que Edge et Chrome confondraient."""
    from urllib.parse import urlparse
    base = urlparse(conf['site']).path.rstrip('/') + '/'
    return base + app['id'] + '/'


def manifest(app, conf):
    m = {
        'id': app_id(app, conf), 'name': app['name'], 'short_name': app.get('short_name', app['name']), 'description': app.get('description', ''),
        'lang': 'fr', 'dir': 'ltr', 'start_url': './', 'scope': './', 'display': 'standalone',
        'background_color': app.get('background_color', '#ffffff'), 'theme_color': app.get('theme_color', '#ffffff'),
        'categories': ['productivity', 'utilities'],
        'icons': [
            {'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
        'launch_handler': {'client_mode': ['focus-existing', 'auto']},
    }
    if app.get('file_handlers'):
        m['file_handlers'] = [dict({'action': './', 'launch_type': 'single-client',
                                    'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'}]}, **fh)
                              for fh in app['file_handlers']]
    return json.dumps(m, ensure_ascii=False, indent=2) + '\n'


# ---------------------------------------------------------------- dates de version
# pc/versions.json : pour chaque appli, l'empreinte publiée et le jour où elle a changé (« Version du JJ/MM » affichée
# dans l'appli et le lanceur). Une empreinte inchangée garde sa date : --check reste stable d'un jour à l'autre.
VERSIONS_FILE = None
VERSIONS = {}


def today():
    try:
        from zoneinfo import ZoneInfo
        return datetime.datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()
    except Exception:
        return datetime.date.today().isoformat()


def version_date(key, h):
    old = VERSIONS.get(key) or {}
    if old.get('v') == h and old.get('date'):
        return old['date']
    VERSIONS[key] = {'v': h, 'date': today()}
    return VERSIONS[key]['date']


def service_worker(app, conf, out_dir, files):
    """sw.js : liste à précacher + VERSION = empreinte de tous ces fichiers (toute modification = nouvelle version)."""
    h = hashlib.sha256()
    tpl = read(os.path.join(SHARED, 'sw-template.js'))
    h.update(tpl.encode())
    for rel in files:
        p = os.path.normpath(os.path.join(out_dir, rel))
        if os.path.exists(p):
            h.update(rel.encode()); h.update(read(p, 'rb'))
        elif CHECK and rel in GENERATED.get(app['id'], {}):
            h.update(rel.encode()); h.update(GENERATED[app['id']][rel])
        else:
            WARN.append('%s : fichier à précacher absent : %s' % (app['id'], rel))
    v = h.hexdigest()[:12]
    date = version_date(app['id'], v)
    return (tpl.replace('__VERSION__', v).replace('__DATE__', date).replace('__APP__', app['id']).replace('__NAME__', app['name'])
            .replace('__PRECACHE__', json.dumps(files, indent=2))), v


GENERATED = {}


def fr_date(iso):
    y, m, d = iso.split('-')
    return '%s/%s/%s' % (d, m, y)


def launcher(conf, versions, apps_android):
    tiles, data = [], {}
    vinfo = {a['id']: {'v': versions.get(a['id'], ''), 'date': (VERSIONS.get(a['id']) or {}).get('date', ''), 'name': a['name']} for a in conf['apps']}
    for a in conf['apps']:
        d = a.get('data')
        if d:
            data[a['id']] = {'name': a['name'], 'ls': d.get('ls', []), 'idb': d.get('idb', []), 'note': d.get('note', '')}
        tiles.append(
            '<div class="tw" data-app="%(id)s"><a class="tile" href="%(id)s/"><img src="%(id)s/icon-192.png" alt="" width="64" height="64">'
            '<span class="tx"><b>%(name)s</b><small>%(desc)s</small><i class="ver" title="Code de version %(v)s">Version du %(date)s</i></span><span class="go" aria-hidden="true">›</span></a>%(dat)s</div>'
            % {'id': a['id'], 'name': html.escape(a['name']), 'desc': html.escape(a.get('description', '')), 'v': vinfo[a['id']]['v'], 'date': fr_date(vinfo[a['id']]['date'])[:5] if vinfo[a['id']]['date'] else '',
               'dat': ('<button class="dat" type="button" data-app="%s">⇅ Exporter / importer mes données</button>' % a['id']) if d else ''})
    tpl = read(os.path.join(SHARED, 'launcher.html'))
    # date du lanceur : la plus récente des applis et du modèle du lanceur
    lh = hashlib.sha256((tpl + json.dumps(conf['apps'], sort_keys=True, ensure_ascii=False)).encode()).hexdigest()[:12]
    ldate = max([version_date('_lanceur', lh)] + [v['date'] for v in vinfo.values() if v['date']])
    return (tpl.replace('<!--TUILES-->', '\n'.join(tiles))
            .replace('/*VERSIONS*/{}', json.dumps({'apps': vinfo, 'date': ldate}, ensure_ascii=False).replace('</', '<\\/'))
            .replace('<!--DATE-->', fr_date(ldate))
            .replace('/*DONNEES*/{}', json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
            .replace('<!--NB-->', str(len(conf['apps'])))
            .replace('<!--VERSIONS-->', html.escape(', '.join('%s %s' % (a['name'], versions.get(a['id'], '')) for a in conf['apps']))))


def main():
    global VERSIONS_FILE, VERSIONS
    conf = json.loads(read(os.path.join(PC, 'pc-apps.json')))
    VERSIONS_FILE = os.path.join(PC, 'versions.json')
    if os.path.exists(VERSIONS_FILE):
        VERSIONS = json.loads(read(VERSIONS_FILE))
    apps_android = {a['app']: a for a in json.loads(read(os.path.join(APPLIS, 'apps.json')))}
    vendor(conf)
    versions = {}
    for app in conf['apps']:
        if app['android'] not in apps_android:
            sys.exit('%s : absent de applis/apps.json' % app['android'])
        out_dir = os.path.join(PC, app['id'])
        adapter = app.get('adapter', app['id'])
        idx = page(app, conf, apps_android)
        man = manifest(app, conf)
        GENERATED[app['id']] = {'index.html': idx.encode(), 'manifest.webmanifest': man.encode()}
        write(os.path.join(out_dir, 'index.html'), idx)
        write(os.path.join(out_dir, 'manifest.webmanifest'), man)
        icons(app, out_dir)
        # workers : copiés dans le dossier de l'appli (un worker hors de la portée du service worker ne marche pas hors ligne)
        for wk in app.get('workers', []):
            write(os.path.join(out_dir, wk), '/* COPIE GÉNÉRÉE par pc/build-pc.py depuis pc/shared/%s : ne pas modifier ici. */\n' % wk + read(os.path.join(SHARED, wk)))
        # copies : fichiers communs avec l'APK (ex. Toile : applis/www-fonds/en-ligne.js → pc/toile/toile-en-ligne.js)
        for dest, src_rel in sorted(app.get('copies', {}).items()):
            write(os.path.join(out_dir, dest), '/* COPIE GÉNÉRÉE par pc/build-pc.py depuis %s : ne pas modifier ici. */\n' % src_rel + read(os.path.join(REPO, src_rel)))
        files = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
                 '../shared/pc-shim.js', '../shared/pc.css']
        files += ['../shared/apps/%s.css' % c for c in app.get('styles', [])]
        files += ['../shared/%s.js' % m for m in app.get('modules', [])]
        for ext in ('.js', '.css'):
            if os.path.exists(os.path.join(SHARED, 'apps', adapter + ext)):
                files.append('../shared/apps/' + adapter + ext)
        for v in app.get('vendor', []):
            files += ['../shared/vendor/' + f for f in (vendor_dir(v) if v.endswith('/') else [v])]
        if app.get('office'):
            files += ['../shared/office/' + f for f in office_files()]
        files += app.get('workers', [])
        files += sorted(app.get('copies', {}))
        files += app.get('extra', [])
        sw, v = service_worker(app, conf, out_dir, [f for f in files if f != './'])
        sw = sw.replace('var PRECACHE = [', 'var PRECACHE = [\n  "./",', 1)
        versions[app['id']] = v
        write(os.path.join(out_dir, 'sw.js'), sw)
    write(os.path.join(PC, 'index.html'), launcher(conf, versions, apps_android))
    keep = set(a['id'] for a in conf['apps']) | {'_lanceur'}
    VERSIONS = {k: v for k, v in sorted(VERSIONS.items()) if k in keep}
    write(VERSIONS_FILE, json.dumps(VERSIONS, ensure_ascii=False, indent=1, sort_keys=True) + '\n')
    # identifiants des manifestes : tous différents une fois résolus sur l'origine du site
    from urllib.parse import urljoin
    ids = {}
    for a in conf['apps']:
        rid = urljoin(urljoin(conf['site'], a['id'] + '/'), app_id(a, conf))
        if rid in ids:
            WARN.append('identifiant de manifeste en double : %s et %s (%s)' % (ids[rid], a['id'], rid))
        ids[rid] = a['id']
    if any(w.startswith('identifiant de manifeste') for w in WARN):
        for w in WARN:
            print('ATTENTION : ' + w)
        sys.exit('Identifiants de manifeste en double : corriger app_id()')
    for w in WARN:
        print('ATTENTION : ' + w)
    if CHECK:
        print('À régénérer : ' + ', '.join(CHANGED) if CHANGED else 'Tout est à jour.')
        sys.exit(1 if CHANGED else 0)
    print('Suite MAG sur PC : %d appli(s) — %s' % (len(conf['apps']), ', '.join('%s (%s)' % (k, v) for k, v in versions.items())))
    print('Fichiers modifiés : ' + (', '.join(CHANGED) if CHANGED else 'aucun'))


if __name__ == '__main__':
    main()
