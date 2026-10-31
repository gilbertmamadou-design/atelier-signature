# Usage : python3 pc/shared/office/tools/carte-carnet-build.py ne_50m_admin_0_countries.geojson applis/www-voyage/cv-carte-data.js 0.04
# (fichier GeoJSON du dépôt github.com/nvkelso/natural-earth-vector, dossier geojson/)
# Fond de carte simplifié du Carnet de voyage : pays de Natural Earth 1:50m (domaine public), simplifiés (Douglas-Peucker),
# quantifiés au 1/20e de degré, chaque anneau codé en différences successives (entiers séparés par des virgules).
import json, sys, math
src, out, tol = sys.argv[1], sys.argv[2], float(sys.argv[3] if len(sys.argv) > 3 else 0.05)
Q = 20
def dp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]; dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy)
        d = math.hypot(p[0]-a[0], p[1]-a[1]) if L == 0 else abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0]) / L
        if d > dmax: dmax, idx = d, i
    if dmax > eps: return dp(pts[:idx+1], eps)[:-1] + dp(pts[idx:], eps)
    return [a, b]
def area(r):
    return abs(sum(r[i][0]*r[i-1][1]-r[i-1][0]*r[i][1] for i in range(len(r)))) / 2
d = json.load(open(src)); feats = []; npts = 0
for f in d['features']:
    p = f['properties']; g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    rings = []
    for poly in polys:
        r = poly[0]
        if area(r) < 0.02: continue
        s = dp(r, tol)
        q = []
        for x, y in s:
            pt = (round(x * Q), round(y * Q))
            if not q or q[-1] != pt: q.append(pt)
        if len(q) < 4: continue
        enc = [q[0][0], q[0][1]]
        for i in range(1, len(q)): enc += [q[i][0]-q[i-1][0], q[i][1]-q[i-1][1]]
        rings.append(','.join(map(str, enc))); npts += len(q)
    if rings:
        feats.append([p.get('NAME_FR') or p.get('NAME'), p.get('ISO_A2_EH') or p.get('ISO_A2'), rings])
js = ('/* Fond de carte du Carnet de voyage : pays de Natural Earth 1:50m (naturalearthdata.com, DOMAINE PUBLIC),\n'
      '   simplifiés et quantifiés par pc/shared/office/tools/carte-carnet-build.py. [nom, code ISO, anneaux] ;\n'
      '   un anneau = lon0,lat0 puis différences, en 1/%d de degré. */\nwindow.CV_CARTE={q:%d,pays:%s};\n') % (Q, Q, json.dumps(feats, ensure_ascii=False, separators=(',', ':')))
open(out, 'w', encoding='utf-8').write(js)
print(len(feats), 'pays', npts, 'points', len(js), 'octets')
