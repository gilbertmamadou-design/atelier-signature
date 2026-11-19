/* =====================================================================
   Majordome › Bourse : « comment va Anthropic ? », « le cours de l'action Airbus », « mon portefeuille ».
   - Actions suivies et portefeuille : résumé publié par l'appli Bourse (MAGPrint.homeWidget, canal privé de la Suite ;
     sur PC, localStorage « bourse:resume », même site).
   - Cours : Yahoo Finance (données publiques, parfois différées), lus par le lecteur réseau partagé du téléphone
     (MAGActualites), ou directement / par le relais personnel sur PC.
   Jamais de conseil : seulement le cours, la variation et la valeur du portefeuille.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, esc = X.esc, P = window.MAGPrint || null;
  var PKG = 'fr.magformation13.bourse', YF = 'https://query1.finance.yahoo.com';

  function deacc(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-.,]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function resume() {
    var o = null;
    try { if (P && P.homeWidget) { var j = P.homeWidget(PKG); o = j ? JSON.parse(j).bourse : null; } } catch (e) { }
    if (!o) try { o = JSON.parse(localStorage.getItem('bourse:resume') || 'null'); } catch (e) { }
    return o && Array.isArray(o.list) ? o : { list: [], rates: {} };
  }
  // noms connus de la liste (pour « comment va Anthropic ? » sans le mot « action »)
  function names() {
    var l = []; resume().list.forEach(function (x) { l.push(deacc(x.nom).replace(/\b(inc|pbc|sa|se|corp|corporation|group|plc|ltd|nv)\b/g, '').trim(), deacc(x.sym)); });
    if (window.MJNLU) window.MJNLU.bourse = l.filter(Boolean);
  }
  names(); setInterval(names, 10 * 60e3);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) names(); });

  function get(url) { return X.httpText(url, true).then(function (t) { return JSON.parse(t); }); }
  function quote(sym) {
    return get(YF + '/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=1d').then(function (d) {
      var m = d.chart.result[0].meta; return { sym: sym, price: m.regularMarketPrice, prev: m.chartPreviousClose != null ? m.chartPreviousClose : m.previousClose, cur: m.currency, nom: m.longName || m.shortName || sym };
    });
  }
  function find(q, R) {
    var n = deacc(q), hit = R.list.filter(function (x) { var a = deacc(x.nom), s = deacc(x.sym); return s === n || a === n || a.indexOf(n) === 0 || (n.length >= 4 && a.indexOf(n) >= 0); })[0];
    if (hit) return Promise.resolve(hit);
    if (/^anthropic$/.test(n)) return Promise.resolve({ sym: 'ANT', nom: 'Anthropic' });
    return get(YF + '/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=5&newsCount=0&lang=fr-FR&region=FR').then(function (d) {
      var x = (d.quotes || []).filter(function (o) { return o.symbol && /EQUITY|ETF|INDEX/.test(o.quoteType || ''); })[0];
      return x ? { sym: x.symbol, nom: x.shortname || x.longname || x.symbol } : null;
    });
  }
  var DEV = { USD: ['dollar', 'dollars', '$'], EUR: ['euro', 'euros', '€'], GBP: ['livre', 'livres', '£'], CHF: ['franc suisse', 'francs suisses', 'CHF'] };
  function fr(n, d) { return n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function dire(n, cur) { var d = DEV[cur], v = fr(n, Math.abs(n) >= 1000 ? 0 : 2); return v + ' ' + (d ? (Math.abs(n) >= 2 ? d[1] : d[0]) : cur || ''); }
  function voir(n, cur) { var d = DEV[cur]; return fr(n, Math.abs(n) >= 1000 ? 0 : 2) + ' ' + (d ? d[2] : cur || ''); }
  function nomCourt(s) { return String(s || '').replace(/,?\s+(Inc\.?|PBC|SA|SE|Corp\.?|Corporation|Group|plc|Ltd\.?|N\.V\.)$/i, '').trim(); }
  function bouger(q) {
    if (!q.prev) return '';
    var c = (q.price - q.prev) / q.prev * 100;
    return Math.abs(c) < 0.05 ? ', stable aujourd\'hui' : ', en ' + (c > 0 ? 'hausse' : 'baisse') + ' de ' + fr(Math.abs(c), 1) + ' % aujourd\'hui';
  }
  function carte(html, sym) {
    var c = X.answer({ say: html.say, html: html.html + (P && P.homeLaunch ? '<div class="row" style="margin-top:8px"><button class="btn sm" data-bo>Ouvrir Bourse</button></div>' : ''), k: 'Bourse' });
    var b = c && c.querySelector && c.querySelector('[data-bo]');
    if (b) b.onclick = function () { if (P.homeInstalled && P.homeInstalled(PKG) !== '1') { X.toast('L\'appli Bourse n\'est pas installée'); return; } if (P.homeLaunchWith) P.homeLaunchWith(PKG, JSON.stringify({ sym: sym || '' })); else P.homeLaunch(PKG, ''); };
    return c.done;
  }

  H.bourse = function (p) {
    var R = resume();
    if (!X.online()) return X.answer('Il me faut internet pour lire les cours de la bourse.').done;
    if (!p.q) {
      var held = R.list.filter(function (x) { return x.n > 0; });
      if (!R.list.length) return X.answer('Vous ne suivez encore aucune action. Ouvrez l\'appli Bourse pour en ajouter, ou demandez-moi par exemple : comment va Anthropic ?').done;
      return Promise.all(R.list.slice(0, 6).map(function (x) { return quote(x.sym).catch(function () { return null; }); })).then(function (qs) {
        var tot = 0, paid = 0, day = 0, ok = 0, lines = [];
        R.list.slice(0, 6).forEach(function (x, i) {
          var q = qs[i]; if (!q) return; var r = R.rates[q.cur] != null ? R.rates[q.cur] : (q.cur === 'EUR' ? 1 : null);
          lines.push('<tr><td>' + esc(nomCourt(x.nom)) + '</td><td style="text-align:right"><b>' + esc(voir(q.price, q.cur)) + '</b></td><td style="text-align:right;color:' + (q.prev && q.price >= q.prev ? '#4fd18b' : '#ff6b6b') + '">' + (q.prev ? (q.price >= q.prev ? '+' : '−') + fr(Math.abs((q.price - q.prev) / q.prev * 100), 2) + ' %' : '') + '</td></tr>');
          if (x.n > 0 && r != null) { ok++; tot += x.n * q.price * r; paid += x.paidE; if (q.prev) day += x.n * (q.price - q.prev) * r; }
        });
        if (!lines.length) return X.answer('Je n\'arrive pas à lire les cours pour le moment.').done;
        var say;
        if (held.length && ok) {
          var g = tot - paid;
          say = 'Votre portefeuille vaut ' + dire(tot, 'EUR') + ', ' + (Math.abs(g) < 1 ? 'à l\'équilibre' : (g > 0 ? 'avec une plus-value de ' : 'avec une moins-value de ') + dire(Math.abs(g), 'EUR')) + '. Aujourd\'hui : ' + (Math.abs(day) < 1 ? 'stable' : (day > 0 ? 'plus ' : 'moins ') + dire(Math.abs(day), 'EUR')) + '.';
        } else {
          var q0 = qs.filter(Boolean)[0], x0 = R.list[qs.indexOf(q0)];
          say = nomCourt(x0.nom) + ' cote ' + dire(q0.price, q0.cur) + bouger(q0) + '.';
        }
        return carte({ say: say, html: '<p>' + esc(say) + '</p><table style="width:100%;font-size:14px">' + lines.join('') + '</table><p class="note">Cours Yahoo Finance, parfois différés.</p>' });
      }, function () { return X.answer('Je n\'arrive pas à lire les cours pour le moment.').done; });
    }
    return find(p.q, R).then(function (x) {
      if (!x) return X.answer('Je ne trouve pas d\'action cotée qui s\'appelle « ' + p.q + ' ».').done;
      return quote(x.sym).then(function (q) {
        var nom = nomCourt(x.nom || q.nom), say = nom + ' cote ' + dire(q.price, q.cur) + bouger(q) + '.';
        var mine = R.list.filter(function (y) { return y.sym === x.sym && y.n > 0; })[0], r = R.rates[q.cur] != null ? R.rates[q.cur] : (q.cur === 'EUR' ? 1 : null);
        if (mine && r != null) { var v = mine.n * q.price * r, g = v - mine.paidE; say += ' Vos ' + fr(mine.n, mine.n % 1 ? 2 : 0) + ' actions valent ' + dire(v, 'EUR') + (Math.abs(g) >= 1 ? ', ' + (g > 0 ? 'soit ' + dire(g, 'EUR') + ' de plus-value' : 'soit ' + dire(-g, 'EUR') + ' de moins-value') : '') + '.'; }
        return carte({ say: say, html: '<p>' + esc(say) + '</p><p class="note">' + esc(x.sym) + ' · cours Yahoo Finance, parfois différé.</p>' }, x.sym);
      });
    }).catch(function () { return X.answer('Je n\'arrive pas à lire le cours pour le moment.' + (X.PC ? ' Sur PC, il faut le relais réseau de la Suite.' : '')).done; });
  };
})();
