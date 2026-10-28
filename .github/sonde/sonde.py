# Sonde temporaire (branche sonde-cors-pc, à supprimer) : chaque adresse est lue comme le ferait la page PC
# (GET avec l'en-tête Origin du site), on note le code HTTP et l'en-tête Access-Control-Allow-Origin.
import json, urllib.request, urllib.error, ssl
ORIGIN = 'https://gilbertmamadou-design.github.io'
G = json.load(open('.github/sonde/urls.json'))
def probe(u):
    q = urllib.request.Request(u, headers={'Origin': ORIGIN, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', 'Accept': '*/*'})
    try:
        r = urllib.request.urlopen(q, timeout=25); code = r.status; h = r.headers; n = len(r.read(200000))
    except urllib.error.HTTPError as e:
        code = e.code; h = e.headers; n = 0
    except Exception as e:
        return {'u': u, 'code': 0, 'err': str(e)[:120]}
    return {'u': u, 'code': code, 'acao': h.get('Access-Control-Allow-Origin'), 'type': (h.get('Content-Type') or '')[:40], 'n': n}
# podcasts : adresses de flux réelles trouvées par la recherche iTunes
try:
    d = json.load(urllib.request.urlopen('https://itunes.apple.com/search?media=podcast&entity=podcast&country=FR&limit=12&term=france', timeout=20))
    G['ondes-flux'] = [x['feedUrl'] for x in d.get('results', []) if x.get('feedUrl')][:12]
except Exception as e:
    G['ondes-flux'] = []
out = {k: [probe(u) for u in v] for k, v in G.items()}
for k, l in out.items():
    print('== ' + k)
    for x in l: print('%s\t%s\tACAO=%s\t%s\t%s' % (x['code'], x.get('n', ''), x.get('acao'), x.get('type', x.get('err', '')), x['u']))
json.dump(out, open('resultat.json', 'w'), indent=1)
