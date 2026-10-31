# Sous-ensembles latins (WOFF 1.0, zlib) des polices du Carnet de voyage, depuis le dépôt github.com/google/fonts (non modifiées par ailleurs).
# Usage : python3 pc/shared/office/tools/fonts-carnet-build.py <clone de google/fonts> pc/shared/vendor/fonts-carnet
import os, sys
from fontTools import subset
from fontTools.ttLib import TTFont
G = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
UNI = 'U+0020-007E,U+00A0-024F,U+0259,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303,U+0308,U+0327,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD'
SRC = {
  'Caveat.woff': 'ofl/caveat/Caveat[wght].ttf',
  'Kalam-Regular.woff': 'ofl/kalam/Kalam-Regular.ttf',
  'Kalam-Bold.woff': 'ofl/kalam/Kalam-Bold.ttf',
  'AmaticSC-Regular.woff': 'ofl/amaticsc/AmaticSC-Regular.ttf',
  'AmaticSC-Bold.woff': 'ofl/amaticsc/AmaticSC-Bold.ttf',
  'SpecialElite-Regular.woff': 'apache/specialelite/SpecialElite-Regular.ttf',
}
for out, src in SRC.items():
    opt = subset.Options(); opt.flavor = 'woff'; opt.layout_features = ['*']; opt.name_IDs = ['*']; opt.name_languages = ['*']; opt.notdef_outline = True
    opt.unicodes = subset.parse_unicodes(UNI)
    f = TTFont(os.path.join(G, src))
    s = subset.Subsetter(opt); s.populate(unicodes=opt.unicodes); s.subset(f)
    f.flavor = 'woff'; f.save(os.path.join(OUT, out))
    print(out, os.path.getsize(os.path.join(G, src)), '->', os.path.getsize(os.path.join(OUT, out)))
