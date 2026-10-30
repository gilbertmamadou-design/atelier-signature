#!/usr/bin/env python3
"""
Variante « preview » d'un paquet .zab construit par zeus build (même méthode que pour la mini-appli Jarvis, voir
.github/workflows/zepp.yml) : packageInfo.mode = preview dans chaque app.json, puis md5 du .zpk et manifest.json recalculés.
  python3 variante_apercu.py entree.zab sortie.zab [sortie.zpk]
"""
import hashlib, io, json, sys, zipfile


def walk(data, depth=0, path=''):
    src = zipfile.ZipFile(io.BytesIO(data)); out = io.BytesIO(); dst = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    for i in src.infolist():
        b = src.read(i.filename)
        print('  ' * depth + path + i.filename, len(b))
        if i.filename.endswith(('.zpk', '.zip')):
            b = walk(b, depth + 1, path + i.filename + ' › ')
        elif i.filename == 'app.json':
            o = json.loads(b)
            if 'app' in o:
                o.setdefault('packageInfo', {})['mode'] = 'preview'
                b = json.dumps(o, ensure_ascii=False).encode('utf-8')
                print('  ' * depth + '    → packageInfo.mode = preview (appType ' + str(o['app'].get('appType')) + ')')
        dst.writestr(i, b)
    dst.close()
    return out.getvalue()


def main(entree, sortie, zpk=None):
    src = zipfile.ZipFile(entree); ren = {}; parts = []
    for i in src.infolist():
        b = src.read(i.filename)
        if i.filename.endswith('.zpk'):
            b = walk(b, 1, i.filename + ' › '); m = hashlib.md5(b).hexdigest(); ren[i.filename[:-4]] = m; parts.append((m + '.zpk', b))
        elif i.filename != 'manifest.json':
            parts.append((i.filename, b))
    man = json.loads(src.read('manifest.json'))
    for z in man.get('zpks', []):
        old = z['name'][:-4]
        if old in ren:
            z['name'] = ren[old] + '.zpk'; z['md5'] = ren[old]
    out = zipfile.ZipFile(sortie, 'w', zipfile.ZIP_DEFLATED)
    for n, b in parts:
        out.writestr(n, b)
    out.writestr('manifest.json', json.dumps(man, separators=(',', ':')))
    out.close()
    print('manifest de la variante « preview » :', json.dumps(man))
    if zpk:
        noms = [n for n in src.namelist() if n.endswith('.zpk')]
        if noms:
            open(zpk, 'wb').write(src.read(noms[0]))


if __name__ == '__main__':
    main(*sys.argv[1:4])
