/* =====================================================================
   Actualités sur PC. Sur Android, l'appli lit les flux RSS elle-même (pont
   MAGActualites.http). Dans un navigateur, un flux ne se lit que si le média
   l'autorise (CORS). Vérifié le 28/10/2026 : 14 flux sur 75 (franceinfo,
   La Dépêche, DNA) ; Le Monde, Le Figaro, Libération, RFI, France 24,
   20 Minutes, Ouest-France, Le Parisien, La Croix, Euronews, BBC, Guardian,
   Brut, Sud Ouest, Nice-Matin, actu.fr et MeteoAlarm refusent.
   - sans relais : les flux refusés sont sautés tout de suite (pas de requête),
     un bandeau l'explique ;
   - avec le relais personnel (pc/relais/worker.js, adresse saisie dans le
     lanceur), tous les flux passent, comme sur le téléphone (voir pc-shim.js › MAGPC.net).
   Pas d'alertes en arrière-plan sur PC (la page le dit déjà).
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  M.whenBody(function () {
    if (M.net.proxy()) return;
    var main = document.getElementById('main'); if (!main) return;
    var b = document.createElement('div'); b.id = 'mpcCors'; b.className = 'mpc-cors';
    b.innerHTML = '<b>Sur PC, seuls franceinfo, La Dépêche et DNA sont lus.</b> Les autres médias (Le Monde, Le Figaro, BBC…) interdisent la lecture de leurs flux depuis une page web : sans leurs titres, « couvert par N médias » et la vigilance météo restent incomplets. ' +
      'Pour tout lire comme sur le téléphone, installe ton relais personnel (gratuit) : <a href="../#relais" target="_blank" rel="noopener">Suite MAG › Relais réseau</a>. <button type="button" aria-label="Masquer">✕</button>';
    b.querySelector('button').onclick = function () { b.remove(); M.store.set('actu-pc-bandeau', Date.now()); };
    var seen = M.store.get('actu-pc-bandeau', 0);
    if (Date.now() - seen > 7 * 864e5) main.insertBefore(b, main.firstChild);
  });
  function sheet() { return !!document.querySelector('#sheets .sheet'); }
  function tab(i) { return function () { if (sheet()) return false; var x = document.querySelectorAll('#tabs button')[i]; if (!x) return false; x.click(); }; }
  M.keys({
    '1': tab(0), '2': tab(1), '3': tab(2), '4': tab(3), '5': tab(4),
    'f5': function () { var r = document.getElementById('bRef'); if (!r) return false; r.click(); },
    'mod+r': function () { var r = document.getElementById('bRef'); if (!r || sheet()) return false; r.click(); },
    'mod+f': function () { if (sheet()) return false; document.getElementById('bSearch').click(); },
    'escape': function () { if (!sheet()) return false; history.back(); }
  });
})();
