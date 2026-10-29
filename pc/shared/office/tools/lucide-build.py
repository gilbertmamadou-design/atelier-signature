# Construit pc/shared/vendor/lucide-icons.js depuis les SVG de Lucide (tag git) : nom -> contenu SVG (24x24, trait)
import json, os, re, sys
src, out, ver, commit = sys.argv[1:5]
icons, tags = {}, {}
for f in sorted(os.listdir(src)):
    if not f.endswith('.svg'): continue
    n = f[:-4]
    s = open(os.path.join(src, f), encoding='utf-8').read()
    body = re.sub(r'^.*?<svg[^>]*>', '', s, flags=re.S).replace('</svg>', '')
    body = re.sub(r'\s*\n\s*', '', body).replace(' />', '/>')
    icons[n] = body
    j = os.path.join(src, n + '.json')
    if os.path.exists(j):
        m = json.load(open(j, encoding='utf-8'))
        t = list(dict.fromkeys((m.get('tags') or []) + (m.get('categories') or [])))
        if t: tags[n] = ' '.join(t)
lic = open(os.path.join(src, '..', 'LICENSE'), encoding='utf-8').read().split('---')[0].strip()
hdr = '/*! Lucide %s (ISC) — https://github.com/lucide-icons/lucide, tag %s (commit %s). Icônes : fichiers icons/*.svg et mots-clés icons/*.json,\n   regroupés pour la Suite MAG par pc/shared/office/tools/lucide-build.py. Licence : pc/shared/vendor/LICENSES/lucide-ISC.txt */\n' % (ver, ver, commit)
js = hdr + 'window.LUCIDE=' + json.dumps({'version': ver, 'icons': icons, 'tags': tags}, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(out, 'w', encoding='utf-8').write(js)
print(len(icons), len(js))
