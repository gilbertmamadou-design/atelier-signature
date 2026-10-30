#!/usr/bin/env python3
"""
Cadran « Jarvis » : génère toutes les images du cadran (assets/trex3/images) et deux aperçus 480 × 480.

  python3 outils/generer.py [dossier_apercus]

- La disposition vient de shared/cadran.js (lue par Node) : une seule source pour la montre, les images et les essais.
- Sphère : même logique que la sphère de Majordome (applis/www-majordome/mj-orb.js) : points sur une spirale de
  Fibonacci, rotation (tilt 0,35), perspective 1,9 / (2,6 − z), déformation par un bruit lisse, taille et opacité
  selon la profondeur, halo radial, mélange additif. Ici le temps est périodique : 24 images forment une boucle
  sans saut (un tour complet, respiration et bruit sur des harmoniques entières de la boucle).
- Polices : Inter (SIL OFL 1.1) et DejaVu Sans Mono (licence Bitstream Vera / domaine public), rendues en images ;
  aucun fichier de police n'est copié dans le paquet.
- Aucun élément de marque : sphère, lignes fines, coins marqués, turquoise de Majordome.
Dépendances : Python 3, Pillow, NumPy, Node (pour lire la disposition).
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
IMG = os.path.join(RACINE, 'assets', 'trex3', 'images')
SS = 4  # suréchantillonnage pour l'anticrénelage


def lire_cadran():
    js = ("import(process.argv[1]).then(m=>console.log(JSON.stringify({D:m.DISPOSITION,C:m.COUL,J:m.JOURS,M:m.MOIS,"
          "S:m.SALUTS,A:m.ANIM,L:m.LIBELLES,METEO:m.METEO,jours:Array.from({length:31},(_, i)=>m.jourTexte(i+1))})))")
    out = subprocess.check_output(['node', '--input-type=module', '-e', js, os.path.join(RACINE, 'shared', 'cadran.js')])
    return json.loads(out)


K = lire_cadran()
D, C, ANIM = K['D'], K['C'], K['A']


def rgb(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def police(noms, taille):
    dossiers = ['/usr/share/fonts', os.path.expanduser('~/.fonts'), '/usr/local/share/fonts', '/Library/Fonts', 'C:/Windows/Fonts']
    for nom in noms:
        for d in dossiers:
            for r, _, fs in os.walk(d):
                if nom in fs:
                    return ImageFont.truetype(os.path.join(r, nom), taille)
    raise SystemExit('Police introuvable : ' + ' / '.join(noms) + ' (installez Inter et DejaVu Sans Mono)')


F_FIN = ['Inter-ExtraLight.otf', 'Inter-ExtraLight.ttf', 'InterDisplay-ExtraLight.otf']
F_THIN = ['Inter-Thin.otf', 'Inter-Thin.ttf', 'InterDisplay-Thin.otf']
F_LIGHT = ['Inter-Light.otf', 'Inter-Light.ttf']
F_MED = ['Inter-Medium.otf', 'Inter-Medium.ttf']
F_MONO = ['DejaVuSansMono.ttf']


def sauver(im, chemin):
    p = os.path.join(IMG, chemin)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)
    return p


def reduire(im, w, h):
    return im.resize((w, h), Image.LANCZOS)


# ---------------------------------------------------------------- texte en image
def texte_image(t, w, h, noms, taille, couleur, align='centre', espace=0, decal_y=0):
    """Texte sur fond transparent, w × h, aligné à gauche / centre / droite, centré verticalement (sur les capitales)"""
    f = police(noms, taille * SS)
    im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    larg = [d.textlength(c, font=f) for c in t]
    total = sum(larg) + espace * SS * max(0, len(t) - 1)
    x = {'gauche': 0, 'centre': (w * SS - total) / 2, 'droite': w * SS - total}[align]
    bb = d.textbbox((0, 0), 'H0', font=f)
    y = (h * SS - (bb[3] - bb[1])) / 2 - bb[1] + decal_y * SS
    for c, lc in zip(t, larg):
        d.text((x, y), c, font=f, fill=couleur)
        x += lc + espace * SS
    return reduire(im, w, h)


def chiffres(dossier, w, h, noms, taille, couleur, extras=None, espace=0):
    """0-9 de même largeur (pas de saut de l'heure), plus les images supplémentaires (unités, signe, invalide)"""
    for i in range(10):
        sauver(texte_image(str(i), w, h, noms, taille, couleur), '%s/%d.png' % (dossier, i))
    for nom, (t, lw) in (extras or {}).items():
        sauver(texte_image(t, lw, h, noms, taille, couleur, espace=espace), '%s/%s.png' % (dossier, nom))


# ---------------------------------------------------------------- sphère (logique de mj-orb.js)
def points_fibonacci(n):
    ga = math.pi * (3 - math.sqrt(5))
    rnd = np.random.default_rng(7)          # graine fixe : images identiques à chaque génération
    i = np.arange(n)
    y = 1 - (i / (n - 1)) * 2
    r = np.sqrt(1 - y * y)
    th = ga * i
    return np.cos(th) * r, y, np.sin(th) * r, rnd.random(n) * 6.283, 0.6 + rnd.random(n) * 0.8


def sphere(taille, phase, n=300, couleur='#46d9c2', halo=True, amp=0.05, souffle=0.025, eclat=1.0):
    """Une image de la sphère ; phase ∈ [0, 1) : position dans la boucle"""
    S = taille * SS
    acc = np.zeros((S, S, 3), dtype=np.float32)
    col = np.array(rgb(couleur)[:3], dtype=np.float32) / 255.0
    cx = cy = S / 2
    tau = 2 * math.pi * phase
    base = S * 0.36 * (1 + souffle * math.sin(tau))
    if halo:
        yy, xx = np.mgrid[0:S, 0:S]
        dist = np.hypot(xx - cx, yy - cy)
        g = np.clip(1 - (dist - base * 0.2) / (base * 1.4), 0, 1) ** 1.6 * 0.16 * eclat
        acc += g[..., None] * col
    px_, py_, pz_, ph, sp = points_fibonacci(n)
    rot, tilt = tau, 0.35                     # un tour complet par boucle
    # bruit lisse de mj-orb (sin(t·sp·2,1 + ph) · sin(4y + 1,3t)) avec t périodique : harmoniques entières de la boucle
    k = np.round(sp * 2).astype(np.float32)
    nz = np.sin(tau * k + ph) * np.sin(py_ * 4 + tau) * amp
    x, y, z = px_ * (1 + nz), py_ * (1 + nz), pz_ * (1 + nz)
    cr, sr, ct, st = math.cos(rot), math.sin(rot), math.cos(tilt), math.sin(tilt)
    x1, z1 = x * cr + z * sr, -x * sr + z * cr
    y1, z2 = y * ct - z1 * st, y * st + z1 * ct
    persp = 1.9 / (2.6 - z2)
    sx, sy = cx + x1 * base * persp, cy + y1 * base * persp
    depth = (z2 + 1) / 2
    al = (0.18 + depth * 0.72) * eclat
    # mj-orb dessine des carrés de côté (0,7 + 1,5·profondeur) px sur un panneau ; ici des points ronds de même diamètre,
    # agrandis à l'échelle de l'écran de la montre (sphère de 150 px)
    rayon = (0.7 + depth * 1.5) * 0.62 * SS * taille / 110
    for j in np.argsort(depth):
        r = rayon[j]
        x0, y0 = int(sx[j] - r - 1), int(sy[j] - r - 1)
        x1_, y1_ = int(sx[j] + r + 2), int(sy[j] + r + 2)
        ya, yb, xa, xb = max(0, y0), min(S, y1_), max(0, x0), min(S, x1_)
        if ya >= yb or xa >= xb:
            continue
        gy, gx = np.mgrid[ya:yb, xa:xb]
        disque = np.clip(r + 0.5 - np.hypot(gx + 0.5 - sx[j], gy + 0.5 - sy[j]), 0, 1)
        acc[ya:yb, xa:xb] += disque[..., None] * col * al[j]   # « lighter » : addition
    acc = np.clip(acc, 0, 1)
    lum = acc.max(axis=2)
    a = np.clip(lum * 1.0, 0, 1)
    rgbim = np.where(a[..., None] > 0, acc / np.maximum(a[..., None], 1e-6), 0)
    out = np.dstack([rgbim, a]) * 255
    im = Image.fromarray(out.astype(np.uint8), 'RGBA')
    return reduire(im, taille, taille)


# ---------------------------------------------------------------- dessin vectoriel
class Toile:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def P(self, *v):
        return [c * SS for c in v]

    def ligne(self, pts, coul, ep=1.5):
        self.d.line([(x * SS, y * SS) for x, y in pts], fill=coul, width=max(1, int(ep * SS)), joint='curve')

    def arc(self, cx, cy, r, a0, a1, coul, ep=1.5):
        self.d.arc(self.P(cx - r, cy - r, cx + r, cy + r), a0, a1, fill=coul, width=max(1, int(ep * SS)))

    def cercle(self, cx, cy, r, coul=None, contour=None, ep=1.5):
        self.d.ellipse(self.P(cx - r, cy - r, cx + r, cy + r), fill=coul, outline=contour, width=max(1, int(ep * SS)))

    def poly(self, pts, coul):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=coul)

    def coins(self, x, y, w, h, coul, l=9, ep=2, coul2=None):
        """Coins marqués (comme .jc:before / .jc:after de la page Jarvis) : haut-gauche plein, bas-droit atténué"""
        c2 = coul2 or coul
        self.ligne([(x, y + l), (x, y), (x + l, y)], coul, ep)
        self.ligne([(x + w - l, y + h), (x + w, y + h), (x + w, y + h - l)], c2, ep)

    def texte(self, t, x, y, noms, taille, coul, centre=False, espace=0):
        f = police(noms, taille * SS)
        larg = [self.d.textlength(c, font=f) for c in t]
        total = sum(larg) + espace * SS * (len(t) - 1)
        xx = x * SS - (total / 2 if centre else 0)
        bb = self.d.textbbox((0, 0), 'H', font=f)
        yy = y * SS - (bb[3] - bb[1]) / 2 - bb[1]
        for c, lc in zip(t, larg):
            self.d.text((xx, yy), c, font=f, fill=coul)
            xx += lc + espace * SS

    def image(self):
        return reduire(self.im, self.w, self.h)


# ---------------------------------------------------------------- icônes météo (traits fins, 52 × 52)
def icone_meteo(genre, coul):
    t = Toile(52, 52)
    c, ep = coul, 2

    def soleil(cx, cy, r, rayons=True):
        t.cercle(cx, cy, r, contour=c, ep=ep)
        if rayons:
            for k in range(8):
                a = k * math.pi / 4
                t.ligne([(cx + math.cos(a) * (r + 4), cy + math.sin(a) * (r + 4)), (cx + math.cos(a) * (r + 8), cy + math.sin(a) * (r + 8))], c, ep)

    def lune(cx, cy, r):
        t.arc(cx, cy, r, 60, 330, c, ep)
        t.arc(cx + r * 0.55, cy - r * 0.35, r * 0.8, 95, 250, c, ep)

    def nuage(dy=0, plein=False):
        pts = [(12, 34 + dy), (40, 34 + dy)]
        t.arc(18, 28 + dy, 6, 90, 270, c, ep)
        t.arc(27, 23 + dy, 9, 180, 360, c, ep)
        t.arc(38, 28 + dy, 6, 270, 450, c, ep)
        t.ligne([(18, 34 + dy), (38, 34 + dy)], c, ep)

    def gouttes(n, long=6, y0=39):
        for k in range(n):
            x = 17 + k * (18 / max(1, n - 1)) if n > 1 else 26
            t.ligne([(x + 2, y0), (x - 1, y0 + long)], c, ep)

    def flocons(n, y0=42):
        for k in range(n):
            x = 18 + k * (16 / max(1, n - 1)) if n > 1 else 26
            t.cercle(x, y0 + (k % 2) * 4, 1.8, coul=c)

    g = genre
    if g == 'soleil':
        soleil(26, 26, 9)
    elif g == 'nuit':
        lune(26, 26, 13)
    elif g in ('nuages', 'nuages_nuit'):
        (soleil(34, 18, 6) if g == 'nuages' else lune(36, 17, 7))
        nuage(2)
    elif g == 'couvert':
        t.ligne([(20, 20), (36, 20)], c, ep)
        nuage(2)
    elif g in ('averses', 'averses_nuit'):
        (soleil(36, 15, 5, False) if g == 'averses' else lune(37, 14, 6))
        nuage(-4); gouttes(2)
    elif g == 'pluie_faible':
        nuage(-4); gouttes(2)
    elif g == 'pluie':
        nuage(-4); gouttes(3)
    elif g == 'pluie_forte':
        nuage(-4); gouttes(4, 9)
    elif g in ('neige_faible', 'averses_neige'):
        nuage(-4); flocons(2)
    elif g == 'neige':
        nuage(-4); flocons(3)
    elif g in ('neige_forte', 'tempete_neige'):
        nuage(-4); flocons(4)
        if g == 'tempete_neige':
            t.ligne([(10, 48), (42, 48)], c, 1.5)
    elif g == 'pluie_neige':
        nuage(-4); gouttes(2); t.cercle(26, 44, 1.8, coul=c)
    elif g == 'grele':
        nuage(-4); [t.cercle(x, 42, 2.4, contour=c, ep=1.5) for x in (18, 26, 34)]
    elif g == 'orage':
        nuage(-4); t.ligne([(28, 33), (22, 41), (29, 41), (24, 49)], c, ep)
    elif g in ('brouillard', 'brume'):
        for k, y in enumerate((18, 26, 34, 42)):
            t.ligne([(10 + (k % 2) * 6, y), (42 - ((k + 1) % 2) * 6, y)], c, ep if g == 'brouillard' else 1.5)
    elif g in ('sable', 'poussiere'):
        for y in (18, 28, 38):
            t.ligne([(10 + 4 * math.sin(i / 2) + i * 1.0, y + 3 * math.sin(i / 3)) for i in range(0, 32, 2)], c, 1.5)
        if g == 'poussiere':
            [t.cercle(x, y, 1.4, coul=c) for x, y in ((14, 46), (26, 44), (38, 47))]
    else:
        t.texte('?', 26, 26, F_LIGHT, 30, c, centre=True)
    return t.image()


# ---------------------------------------------------------------- fond (écran normal)
def fond_normal():
    t = Toile(480, 480)
    ac, cl, li = rgb(C['accent']), rgb(C['clair']), rgb(C['ligne'])
    faible = rgb(C['accent'], 70)
    # anneau de graduations : 60 traits, les heures plus longues ; ouvert en haut (titre) et en bas
    for k in range(60):
        a = math.radians(k * 6 - 90)
        if k in (0, 30):
            continue
        r0, r1 = (224, 236) if k % 5 == 0 else (230, 236)
        t.ligne([(240 + math.cos(a) * r0, 240 + math.sin(a) * r0), (240 + math.cos(a) * r1, 240 + math.sin(a) * r1)],
                rgb(C['accent'], 200 if k % 5 == 0 else 80), 2 if k % 5 == 0 else 1.2)
    # arcs fins intérieurs, interrompus (instrument)
    for a0, a1 in ((200, 250), (290, 340), (20, 70), (110, 160)):
        t.arc(240, 240, 216, a0, a1, faible, 1)
    # cadre de la sphère : coins marqués et repères de visée
    s = D['sphere']
    t.coins(s['x'] - 4, s['y'] - 4, s['w'] + 8, s['h'] + 8, ac, l=12, ep=2, coul2=rgb(C['accent'], 140))
    cx, cy = s['x'] + s['w'] / 2, s['y'] + s['h'] / 2
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        r0, r1 = s['w'] / 2 + 8, s['w'] / 2 + 15
        t.ligne([(cx + dx * r0, cy + dy * r0), (cx + dx * r1, cy + dy * r1)], rgb(C['accent'], 150), 1.2)
    # blocs météo et cœur : coins marqués
    for z in ('meteo', 'coeur'):
        b = D['zones'][z]
        t.coins(b['x'] + 4, b['y'] + 4, b['w'] - 8, b['h'] - 10, ac, l=9, ep=2, coul2=rgb(C['accent'], 140))
    # cœur (contour) au-dessus de la fréquence cardiaque
    ci = D['coeurIcone']
    hx, hy, hs = ci['x'] + ci['w'] / 2, ci['y'] + ci['h'] / 2 + 2, ci['w'] / 44
    pts = []
    for i in range(0, 361, 6):
        u = math.radians(i)
        x = 16 * math.sin(u) ** 3
        y = -(13 * math.cos(u) - 5 * math.cos(2 * u) - 2 * math.cos(3 * u) - math.cos(4 * u))
        pts.append((hx + x * hs * 1.05, hy + y * hs * 1.05))
    t.ligne(pts, ac, 2)
    # séparateurs fins sous la date et au-dessus des données
    t.ligne([(120, 204 - 4), (165 - 14, 200)], li, 1)
    t.ligne([(315 + 14, 200), (360, 200)], li, 1)
    t.ligne([(104, 386), (376, 386)], li, 1)
    t.ligne([(136, 417), (344, 417)], li, 1)
    t.ligne([(240, 348), (240, 378)], li, 1)
    # lever / coucher du soleil : demi-soleil et flèche
    for b, haut in ((D['leve'], True), (D['couche'], False)):
        x, y = b['x'] - 22, b['y'] + b['h'] / 2 + 4
        t.arc(x + 9, y, 7, 180, 360, ac, 1.6)
        t.ligne([(x, y), (x + 18, y)], ac, 1.6)
        f = -1 if haut else 1
        t.ligne([(x + 9, y - 12 if haut else y - 16), (x + 9, y - 16 if haut else y - 11)], ac, 1.6)
        ay = y - 16 if haut else y - 11
        t.ligne([(x + 6, ay - f * 3), (x + 9, ay), (x + 12, ay - f * 3)], ac, 1.6)
    # libellés monospace (comme .jl de Socle)
    for l in K['L']:
        t.texte(l['t'], l['x'], l['y'], F_MONO, l['taille'], rgb(C[l['couleur']], 215), centre=l.get('centre', False), espace=l.get('espace', 1.2))
    return t.image()


def fond_aod():
    """AOD : 12 repères faibles et un cadre discret ; tout le reste noir (pixels éteints sur l'AMOLED)"""
    t = Toile(480, 480)
    for k in range(12):
        if k in (0, 6):
            continue
        a = math.radians(k * 30 - 90)
        t.ligne([(240 + math.cos(a) * 226, 240 + math.sin(a) * 226), (240 + math.cos(a) * 236, 240 + math.sin(a) * 236)], rgb(C['aod'], 160), 1.6)
    s = D['sphere']
    t.coins(s['x'] - 4, s['y'] - 4, s['w'] + 8, s['h'] + 8, rgb(C['aod'], 150), l=10, ep=1.5)
    return t.image()


# ---------------------------------------------------------------- tout générer
def generer():
    ac, tx, dx, ao = rgb(C['accent']), rgb(C['texte']), rgb(C['doux']), rgb(C['aod'])
    h = D['heure']
    # heure
    chiffres('heure', h['chiffre'], h['h'], F_FIN, 92, tx)
    chiffres('heure_aod', h['chiffre'], h['h'], F_THIN, 92, ao)
    for dossier, coul in (('heure', ac), ('heure_aod', ao)):
        t = Toile(h['deuxPoints'], h['h'])
        for y in (h['h'] * 0.36, h['h'] * 0.68):
            t.cercle(h['deuxPoints'] / 2, y, 3.2, coul=coul)
        sauver(t.image(), dossier + '/dp.png')
    # date
    for suffixe, coul in (('', tx), ('_aod', ao)):
        for i, j in enumerate(K['J']):
            b = D['semaine']; sauver(texte_image(j, b['w'], b['h'], F_MED, 21, coul, 'droite', 1.5), 'semaine%s/%d.png' % (suffixe, i))
        for i, j in enumerate(K['jours']):
            b = D['jour']; sauver(texte_image(j, b['w'], b['h'], F_MED, 21, rgb(C['accent']) if not suffixe else coul, 'centre', 1), 'jour%s/%d.png' % (suffixe, i))
        for i, m in enumerate(K['M']):
            b = D['mois']; sauver(texte_image(m, b['w'], b['h'], F_MED, 21, coul, 'gauche', 1.5), 'mois%s/%d.png' % (suffixe, i))
    # salutation
    b = D['salut']
    for i, s in enumerate(K['S']):
        sauver(texte_image(s, b['w'], b['h'], F_LIGHT, 21, dx, 'centre', 0.5), 'salut/%d.png' % i)
    # chiffres moyens (température, cœur) et petits (données)
    mh = D['meteoTemp']['h']
    chiffres('moyen', 19, mh, F_LIGHT, 32, tx, {'moins': ('-', 12), 'deg': ('°', 12), 'dp': (':', 8), 'invalide': ('--', 30)})
    ph = D['pas']['h']
    chiffres('petit', 11, ph, F_MONO, 18, tx, {'moins': ('-', 11), 'pct': ('%', 13), 'dp': (':', 7), 'invalide': ('--', 22)})
    chiffres('mini', 10, D['altitude']['h'], F_MONO, 16, tx, {'moins': ('-', 10), 'm': (' m', 20), 'hpa': (' hPa', 40), 'dp': (':', 7), 'invalide': ('--', 20)})
    # batterie : 11 niveaux
    bb = D['barreBatterie']
    for n in range(11):
        t = Toile(bb['w'], bb['h'])
        t.d.rectangle(t.P(0, 0, bb['w'], bb['h']), fill=rgb(C['accent'], 45))
        if n:
            col = rgb('#ff6b6b') if n <= 2 else ac
            t.d.rectangle(t.P(0, 0, bb['w'] * n / 10, bb['h']), fill=col)
        sauver(t.image(), 'batterie/%d.png' % n)
    # météo : 29 icônes, code Zepp OS 0 à 28
    for i, g in enumerate(K['METEO']):
        sauver(icone_meteo(g, ac), 'meteo/%d.png' % i)
    # zones tactiles : images transparentes à la taille exacte
    for nom, z in D['zones'].items():
        sauver(Image.new('RGBA', (z['w'], z['h']), (0, 0, 0, 0)), 'zone/%s.png' % nom)
    # sphère : séquence animée, image fixe (veille de l'animation) et image AOD
    s = D['sphere']
    for i in range(ANIM['images']):
        sauver(sphere(s['w'], i / ANIM['images']), '%s/%s_%d.png' % (ANIM['dossier'].split('/', 1)[1], ANIM['prefixe'], i))
    sauver(sphere(s['w'], 0, n=170, couleur=C['aodSphere'], halo=False, eclat=0.62), 'sphere_aod.png')
    sauver(fond_normal(), 'fond.png')
    sauver(fond_aod(), 'fond_aod.png')


# ---------------------------------------------------------------- aperçus (composition des vraies images)
def ouvrir(p):
    return Image.open(os.path.join(IMG, p)).convert('RGBA')


def coller(dst, im, x, y):
    dst.alpha_composite(im, (int(x), int(y)))


def texte_img(dst, valeur, dossier, b, align='droite', unite=None, sp=0):
    """Comme TEXT_IMG : chiffres juxtaposés puis unité, alignés dans la boîte"""
    morceaux = []
    for c in valeur:
        morceaux.append(ouvrir('%s/%s.png' % (dossier, {'-': 'moins', ':': 'dp'}.get(c, c))))
    if unite:
        morceaux.append(ouvrir('%s/%s.png' % (dossier, unite)))
    w = sum(m.width for m in morceaux) + sp * (len(morceaux) - 1)
    x = {'gauche': b['x'], 'centre': b['x'] + (b['w'] - w) / 2, 'droite': b['x'] + b['w'] - w}[align]
    for m in morceaux:
        coller(dst, m, x, b['y'] + (b['h'] - m.height) / 2)
        x += m.width + sp


def masque_rond(im):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, im.width - 1, im.height - 1), fill=255)
    noir = Image.new('RGBA', im.size, (0, 0, 0, 255))
    noir.paste(im, (0, 0), m)
    return noir


def apercu(aod, ex):
    im = Image.new('RGBA', (480, 480), (0, 0, 0, 255))
    s = '_aod' if aod else ''
    coller(im, ouvrir('fond_aod.png' if aod else 'fond.png'), 0, 0)
    sp = D['sphere']
    coller(im, ouvrir('sphere_aod.png') if aod else ouvrir('anim/%s_%d.png' % (ANIM['prefixe'], ex['image'])), sp['x'], sp['y'])
    h = D['heure']; x = h['x']
    hh, mm = ex['heure'].split(':')
    for c in hh:
        coller(im, ouvrir('heure%s/%s.png' % (s, c)), x, h['y']); x += h['chiffre']
    coller(im, ouvrir('heure%s/dp.png' % s), x, h['y']); x += h['deuxPoints']
    for c in mm:
        coller(im, ouvrir('heure%s/%s.png' % (s, c)), x, h['y']); x += h['chiffre']
    coller(im, ouvrir('semaine%s/%d.png' % (s, ex['semaine'])), D['semaine']['x'], D['semaine']['y'])
    coller(im, ouvrir('jour%s/%d.png' % (s, ex['jour'] - 1)), D['jour']['x'], D['jour']['y'])
    coller(im, ouvrir('mois%s/%d.png' % (s, ex['mois'])), D['mois']['x'], D['mois']['y'])
    if not aod:
        coller(im, ouvrir('salut/%d.png' % ex['salut']), D['salut']['x'], D['salut']['y'])
        coller(im, ouvrir('meteo/%d.png' % ex['meteo']), D['meteoIcone']['x'], D['meteoIcone']['y'])
        texte_img(im, str(ex['temp']), 'moyen', D['meteoTemp'], 'centre', 'deg')
        texte_img(im, str(ex['vent']), 'petit', D['vent'], 'gauche')
        texte_img(im, str(ex['coeur']), 'moyen', D['coeur'], 'centre')
        texte_img(im, str(ex['pas']), 'petit', D['pas'], 'droite')
        texte_img(im, str(ex['batterie']), 'petit', D['batterie'], 'droite', 'pct')
        coller(im, ouvrir('batterie/%d.png' % round(ex['batterie'] / 10)), D['barreBatterie']['x'], D['barreBatterie']['y'])
        texte_img(im, ex['leve'], 'petit', D['leve'], 'gauche')
        texte_img(im, ex['couche'], 'petit', D['couche'], 'gauche')
        texte_img(im, str(ex['altitude']), 'mini', D['altitude'], 'droite', 'm')
        texte_img(im, str(ex['pression']), 'mini', D['pression'], 'gauche', 'hpa')
    return masque_rond(im)


def pixels_allumes(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    lum = a.max(axis=2)
    yy, xx = np.mgrid[0:480, 0:480]
    dedans = np.hypot(xx - 239.5, yy - 239.5) <= 240
    return float(((lum > 24) & dedans).sum() / dedans.sum())


if __name__ == '__main__':
    generer()
    sortie = sys.argv[1] if len(sys.argv) > 1 else None
    # exemple : vendredi 30 octobre 2026, 10 h 42
    ex = {'heure': '10:42', 'jour': 30, 'mois': 9, 'salut': 0, 'meteo': 0, 'temp': 14, 'vent': 3,
          'coeur': 72, 'pas': 8452, 'batterie': 87, 'leve': '08:21', 'couche': '17:39', 'altitude': 245, 'pression': 1016, 'image': 0}
    # jour de la semaine calculé par la même fonction que les essais (lundi = 0)
    ex['semaine'] = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import(process.argv[1]).then(m=>console.log(m.indexSemaine(new Date(2026,9,30))))", os.path.join(RACINE, 'shared', 'cadran.js')]))
    n, a = apercu(False, ex), apercu(True, ex)
    apercu_pref = os.path.join(IMG, 'preview.png')
    n.convert('RGB').resize((324, 324), Image.LANCZOS).save(apercu_pref, optimize=True)
    rapport = {'pixels_allumes_normal': round(pixels_allumes(n), 4), 'pixels_allumes_aod': round(pixels_allumes(a), 4)}
    if sortie:
        os.makedirs(sortie, exist_ok=True)
        n.convert('RGB').save(os.path.join(sortie, 'apercu-normal.png'))
        a.convert('RGB').save(os.path.join(sortie, 'apercu-aod.png'))
        # planche de l'animation (4 × 6 images)
        sp = D['sphere']['w']
        pl = Image.new('RGB', (sp * 6, sp * 4), (0, 0, 0))
        for i in range(ANIM['images']):
            pl.paste(ouvrir('anim/%s_%d.png' % (ANIM['prefixe'], i)), ((i % 6) * sp, (i // 6) * sp), ouvrir('anim/%s_%d.png' % (ANIM['prefixe'], i)))
        pl.save(os.path.join(sortie, 'apercu-animation.png'))
    total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(IMG) for f in fs)
    nb = sum(len(fs) for _, _, fs in os.walk(IMG))
    rapport.update({'images': nb, 'octets_png': total})
    print(json.dumps(rapport))
