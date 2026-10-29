#!/usr/bin/env python3
"""Polices libres des applis bureautiques (Texte, puis Tableur) : pc/shared/vendor/fonts/.

Sources (TTF officiels, paquets Debian 13 construits depuis les dépôts amont) :
  Liberation 2.1.5 (SIL OFL 1.1, Red Hat) ......... fonts-liberation 1:2.1.5-3   (github.com/liberationfonts/liberation-fonts)
  Carlito 20230309 (SIL OFL 1.1, tyPoland) ........ fonts-crosextra-carlito       (github.com/googlefonts/carlito)
  Caladea 20200211 (SIL OFL 1.1, Huerta Tipográfica) fonts-crosextra-caladea       (github.com/huertatipografica/Caladea)
Liberation Sans / Serif / Mono ont les mêmes métriques qu'Arial / Times New Roman / Courier New, Carlito que Calibri,
Caladea que Cambria : un document .docx garde sa mise en page sans ces polices propriétaires.

Chaque fichier est renommé (voir SRC) et réduit (fontTools) aux alphabets latins, au grec, à la ponctuation, aux symboles courants et aux
flèches / formes géométriques, sans « hinting » : le même TTF sert à l'affichage (@font-face) et à l'export PDF (jsPDF).
    python3 pc/shared/office/tools/fonts-build.py
Écrit fonts/*.ttf, fonts/fonts.css et fonts/metrics.json (ascendante / descendante pour placer le texte dans le PDF).
"""
import json
import os
from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'vendor', 'fonts')
# Nom donné à la version réduite. La licence OFL interdit de garder un « nom de police réservé » (Liberation, Arimo,
# Tinos, Cousine, Carlito) pour une version modifiée : ces polices sont donc renommées « Mag … ». Caladea n'a pas de nom
# réservé et garde le sien.
SRC = {
    'Mag Sans': ('/usr/share/fonts/truetype/liberation/LiberationSans-%s.ttf', 'MagSans'),           # Liberation Sans
    'Mag Serif': ('/usr/share/fonts/truetype/liberation/LiberationSerif-%s.ttf', 'MagSerif'),        # Liberation Serif
    'Mag Mono': ('/usr/share/fonts/truetype/liberation/LiberationMono-%s.ttf', 'MagMono'),           # Liberation Mono
    'Mag Sans Douce': ('/usr/share/fonts/truetype/crosextra/Carlito-%s.ttf', 'MagSansDouce'),       # Carlito
    'Caladea': ('/usr/share/fonts/truetype/crosextra/Caladea-%s.ttf', 'Caladea'),
}
STYLE_NAMES = {'Regular': 'Regular', 'Bold': 'Bold', 'Italic': 'Italic', 'BoldItalic': 'Bold Italic'}


def rename(f, fam, face):
    """Noms internes (table name) : famille, style, nom complet, nom PostScript."""
    if fam == 'Caladea':
        return
    st = STYLE_NAMES[face]
    full, ps = fam + ('' if face == 'Regular' else ' ' + st), fam.replace(' ', '') + '-' + face
    nt = f['name']
    for rec in list(nt.names):
        if rec.nameID in (1, 16):
            nt.setName(fam, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
        elif rec.nameID in (2, 17):
            nt.setName(st, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
        elif rec.nameID == 4:
            nt.setName(full, 4, rec.platformID, rec.platEncID, rec.langID)
        elif rec.nameID == 6:
            nt.setName(ps, 6, rec.platformID, rec.platEncID, rec.langID)
        elif rec.nameID == 3:
            nt.setName(ps + ';Suite MAG', 3, rec.platformID, rec.platEncID, rec.langID)
    nt.names = [r for r in nt.names if r.nameID not in (18, 21, 22)]
FACES = [('Regular', 400, 'normal'), ('Bold', 700, 'normal'), ('Italic', 400, 'italic'), ('BoldItalic', 700, 'italic')]
RANGES = ('U+0000-007E,U+00A0-024F,U+0259,U+02B0-02FF,U+0300-036F,U+0370-03FF,U+1E00-1EFF,U+2000-206F,U+2070-209F,'
          'U+20A0-20CF,U+2100-218F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+2460-24FF,U+2500-257F,U+25A0-25FF,U+2600-26FF,'
          'U+2700-27BF,U+FB00-FB06,U+FFFD')


def unicodes():
    out = []
    for r in RANGES.split(','):
        a, _, b = r[2:].partition('-')
        out += list(range(int(a, 16), int(b or a, 16) + 1))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    css = ['/* Polices libres Mag Sans / Serif / Mono (Liberation 2.1.5 renommée), Mag Sans Douce (Carlito renommée), Caladea : SIL OFL 1.1, voir LICENSES/ */']
    metrics = {}
    for fam, (pat, base) in SRC.items():
        for face, weight, style in FACES:
            src = pat % face
            f = TTFont(src)
            opt = subset.Options()
            opt.hinting = False
            opt.desubroutinize = True
            opt.layout_features = ['kern', 'liga', 'clig', 'calt', 'ccmp', 'locl', 'mark', 'mkmk']
            opt.name_IDs = ['*']
            opt.notdef_outline = True
            s = subset.Subsetter(opt)
            s.populate(unicodes=unicodes())
            s.subset(f)
            rename(f, fam, face)
            if 'FFTM' in f:
                del f['FFTM']
            name = base + '-' + face + '.ttf'
            f.save(os.path.join(OUT, name))
            hh, upm = f['hhea'], f['head'].unitsPerEm
            os2 = f['OS/2']
            metrics[fam + '|' + face] = {'file': name, 'ascent': round(hh.ascent / upm, 4), 'descent': round(-hh.descent / upm, 4),
                                         'winAscent': round(os2.usWinAscent / upm, 4), 'winDescent': round(os2.usWinDescent / upm, 4)}
            css.append("@font-face{font-family:'%s';src:url('%s') format('truetype');font-weight:%d;font-style:%s;font-display:swap}" % (fam, name, weight, style))
            print(name, os.path.getsize(os.path.join(OUT, name)))
    with open(os.path.join(OUT, 'fonts.css'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(css) + '\n')
    with open(os.path.join(OUT, 'metrics.json'), 'w', encoding='utf-8') as fh:
        json.dump(metrics, fh, indent=1)


if __name__ == '__main__':
    main()
