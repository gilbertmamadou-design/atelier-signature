"""Avant la fabrication : icônes .ico de chaque appli et raccourcis du menu Démarrer pour l'installateur.
Écrit build/icones/<id>.ico, build/icone.ico et build/installer.nsh (lu automatiquement par electron-builder)."""
import json, os, sys
from PIL import Image
ICI = os.path.dirname(os.path.abspath(__file__))
PC = os.path.join(ICI, '..', 'pc')
B = os.path.join(ICI, 'build'); os.makedirs(os.path.join(B, 'icones'), exist_ok=True)
apps = [a for a in json.load(open(os.path.join(PC, 'pc-apps.json'), encoding='utf-8'))['apps'] if os.path.exists(os.path.join(PC, a['id'], 'index.html'))]
TAILLES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
def ico(src, dst):
    Image.open(src).convert('RGBA').resize((256, 256), Image.LANCZOS).save(dst, sizes=TAILLES)
noms = {}
for a in apps:
    src = os.path.join(PC, a['id'], 'icon-512.png')
    if not os.path.exists(src): src = os.path.join(PC, a['id'], 'icon-192.png')
    ico(src, os.path.join(B, 'icones', a['id'] + '.ico'))
    noms[a['id']] = a.get('name') or a['id']
ico(os.path.join(PC, 'lecteur', 'icon-512.png'), os.path.join(B, 'icone.ico'))
json.dump(noms, open(os.path.join(B, 'icones', 'noms.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
def q(s): return s.replace('$', '$$').replace('"', "'")
L = ['!macro customInstall', '  CreateDirectory "$SMPROGRAMS\\Suite MAG"']
for i, n in noms.items():
    L.append('  CreateShortCut "$SMPROGRAMS\\Suite MAG\\%s.lnk" "$INSTDIR\\Suite MAG.exe" "--app=%s" "$INSTDIR\\resources\\icones\\%s.ico" 0' % (q(n), i, i))
L += ['!macroend', '', '!macro customUnInstall', '  RMDir /r "$SMPROGRAMS\\Suite MAG"', '!macroend', '']
open(os.path.join(B, 'installer.nsh'), 'w', encoding='utf-8-sig').write('\n'.join(L))
print(len(noms), 'applis')
