#!/usr/bin/env python3
"""
Cadran « Jarvis Simple » : génère les images (assets/trex3/images) et, sur demande, des aperçus 480 × 480.

  python3 outils/generer.py [dossier_apercus]

- fond.png : décor HUD et sphère pré-dessinés (image 0 de la sphère du grand cadran), transparent ailleurs pour laisser
  voir la couleur du FILL_RECT ; aucune animation.
- aod/0-9.png, aod/dp.png : chiffres de l'heure en AOD (IMG_TIME).
- preview.png : aperçu 324 × 324 (même taille que l'exemple officiel zeppos-samples/watchface/3.0).
Le dessin de la sphère et les outils de tracé viennent de zepp/jarvis-cadran/outils/generer.py.
Dépendances : Python 3, Pillow, NumPy, Node, polices Inter et DejaVu Sans Mono.
"""
import importlib.util, json, math, os, subprocess, sys
from PIL import Image, ImageDraw

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
IMG = os.path.join(RACINE, 'assets', 'trex3', 'images')

spec = importlib.util.spec_from_file_location('generer_cadran', os.path.join(RACINE, '..', 'jarvis-cadran', 'outils', 'generer.py'))
G = importlib.util.module_from_spec(spec)
spec.loader.exec_module(G)


def lire():
    js = ("import(process.argv[1]).then(m=>{const t={h:9,m:41,jour:30,mois:10,semaine:4};"
          "console.log(JSON.stringify({D:m.DISPOSITION,C:m.COUL,heure:m.texteHeure(t),date:m.texteDate(t),bat:m.texteBatterie(82)}))})")
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js, os.path.join(RACINE, 'shared', 'simple.js')]))


K = lire()
D, C = K['D'], K['C']
hexa = lambda n, a=255: ((n >> 16) & 255, (n >> 8) & 255, n & 255, a)
ACC = G.rgb('#46d9c2')


def sauver(im, chemin):
    p = os.path.join(IMG, chemin)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)
    return p


def fond():
    t = G.Toile(480, 480)
    for k in range(60):
        if k in (0, 30):
            continue
        a = math.radians(k * 6 - 90)
        r0, r1 = (224, 236) if k % 5 == 0 else (230, 236)
        t.ligne([(240 + math.cos(a) * r0, 240 + math.sin(a) * r0), (240 + math.cos(a) * r1, 240 + math.sin(a) * r1)],
                G.rgb('#46d9c2', 200 if k % 5 == 0 else 80), 2 if k % 5 == 0 else 1.2)
    for a0, a1 in ((200, 250), (290, 340), (20, 70), (110, 160)):
        t.arc(240, 240, 216, a0, a1, G.rgb('#46d9c2', 70), 1)
    s = D['sphere']
    t.coins(s['x'] - 4, s['y'] - 4, s['w'] + 8, s['h'] + 8, ACC, l=12, ep=2, coul2=G.rgb('#46d9c2', 140))
    cx, cy = s['x'] + s['w'] / 2, s['y'] + s['h'] / 2
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        r0, r1 = s['w'] / 2 + 8, s['w'] / 2 + 15
        t.ligne([(cx + dx * r0, cy + dy * r0), (cx + dx * r1, cy + dy * r1)], G.rgb('#46d9c2', 150), 1.2)
    t.ligne([(110, 220), (s['x'] - 18, 220)], G.rgb('#1f5f57'), 1)
    t.ligne([(s['x'] + s['w'] + 18, 220), (370, 220)], G.rgb('#1f5f57'), 1)
    t.ligne([(150, 386), (330, 386)], G.rgb('#1f5f57'), 1)
    im = t.image()
    im.alpha_composite(G.sphere(s['w'], 0.0), (s['x'], s['y']))
    return im


def chiffres_aod():
    b = D['heureAod']
    coul = hexa(C['aod'])
    for i in range(10):
        sauver(G.texte_image(str(i), b['chiffre'], b['h'], G.F_LIGHT, b['taille'], coul), 'aod/%d.png' % i)
    sauver(G.texte_image(':', b['deuxPoints'], b['h'], G.F_LIGHT, b['taille'], coul), 'aod/dp.png')


def rond(im):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, im.size[0] - 1, im.size[1] - 1), fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 255))
    out.paste(im, (0, 0), m)
    return out


def texte(dst, b, valeur, coul, noms=G.F_LIGHT):
    # aperçu seulement : sur la montre, TEXT utilise la police système
    dst.alpha_composite(G.texte_image(valeur, b['w'], b['h'], noms, b['taille'], hexa(coul)), (b['x'], b['y']))


def rendu(f):
    im = Image.new('RGBA', (480, 480), hexa(C['fond']))
    texte(im, D['titre'], 'JARVIS', C['titre'], G.F_MED)
    im.alpha_composite(f)
    texte(im, D['heure'], K['heure'], C['heure'])
    texte(im, D['date'], K['date'], C['date'])
    texte(im, D['batterie'], K['bat'], C['batterie'])
    return rond(im)


def aod():
    im = Image.new('RGBA', (480, 480), (0, 0, 0, 255))
    b = D['heureAod']
    x = b['x'] + round((b['w'] - 4 * b['chiffre'] - b['deuxPoints']) / 2)
    for c in K['heure']:
        p = os.path.join(IMG, 'aod', ('dp' if c == ':' else c) + '.png')
        g = Image.open(p).convert('RGBA')
        im.alpha_composite(g, (x, b['y']))
        x += g.size[0]
    return rond(im)


if __name__ == '__main__':
    f = fond()
    sauver(f, 'fond.png')
    chiffres_aod()
    r = rendu(f)
    sauver(r.convert('RGB').resize((324, 324), Image.LANCZOS), 'preview.png')
    if len(sys.argv) > 1:
        out = sys.argv[1]
        os.makedirs(out, exist_ok=True)
        fc = Image.new('RGBA', (480, 480), hexa(C['fond']))
        fc.alpha_composite(f)
        rond(fc).convert('RGB').save(os.path.join(out, 'jarvis-simple-fond.png'))
        r.convert('RGB').save(os.path.join(out, 'jarvis-simple-rendu.png'))
        aod().convert('RGB').save(os.path.join(out, 'jarvis-simple-aod.png'))
    print('images :', IMG)
