/* =====================================================================
   Rangement sur PC : la page a déjà son mode « ordinateur » (pilote PcDrv :
   dossier choisi avec File System Access, analyse, doublons, gros fichiers,
   suppression définitive avec Edge ou Chrome).
   Ici : le dossier choisi est retenu (bouton « Reprendre » à l'ouverture
   suivante, Windows redemande l'accès d'un clic), raccourcis clavier,
   onglet « Applis » masqué (liste des applis Android : sans objet sur PC).
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var KEY = 'fichiers-dossier';
  function remember(h) { return M.db.put('files', { id: KEY, app: M.app, name: h.name, handle: h, dir: true, at: Date.now() }).catch(function () { }); }
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof PcDrv === 'undefined') return;                           // eslint-disable-line no-undef
    var D = PcDrv;                                                      // eslint-disable-line no-undef
    var pick0 = D.pick;
    D.pick = async function () { var ok = await pick0.apply(D, arguments); if (ok && D.rootH) remember(D.rootH); return ok; };
    // écran d'accueil : reprendre le dernier dossier
    var tries = 0, t = setInterval(function () {
      var pb = document.getElementById('pickBtn');
      if (!pb && ++tries < 40) return;
      clearInterval(t); if (!pb) return;
      M.db.get('files', KEY).then(function (r) {
        if (!r || !r.handle || document.getElementById('mpcResume')) return;
        var b = document.createElement('button'); b.className = 'btn'; b.id = 'mpcResume'; b.style.cssText = 'padding:13px 22px;font-size:16px;margin:10px 0 0 10px';
        b.textContent = 'Reprendre « ' + r.name + ' »';
        pb.insertAdjacentElement('afterend', b);
        b.onclick = function () {
          r.handle.requestPermission({ mode: 'readwrite' }).then(function (s) {
            if (s !== 'granted') return r.handle.requestPermission({ mode: 'read' }).then(function (s2) { return s2 === 'granted' ? 'read' : null; });
            return 'readwrite';
          }).then(function (mode) {
            if (!mode) { M.toast('Accès refusé : choisis le dossier de nouveau', { bad: true }); return; }
            D.rootH = r.handle; D.rootName = r.handle.name; D.canWrite = mode === 'readwrite'; D.files = null;
            DRV = D; ungate(); fullScan(true);                          // eslint-disable-line no-undef
          }).catch(function (e) { M.toast('Dossier introuvable : ' + (e && e.message || e), { bad: true }); });
        };
      });
    }, 150);
  });
  M.keys({
    'mod+f': function () { var q = document.querySelector('input[type=search]'); if (!q) return false; q.focus(); q.select(); },
    'escape': function () { if (M.typing()) { document.activeElement.blur(); return; } return false; }
  });
})();
