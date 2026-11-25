/* Exécuté dans la page avant ses scripts (contextIsolation désactivée, sans Node) :
   - la reconnaissance vocale Web Speech de Chrome ne fonctionne pas hors de Chrome : on la retire pour que
     Majordome et Dictaphone utilisent leur modèle vocal local (hors ligne) ;
   - les boutons du lanceur liés au navigateur (hors ligne, mises à jour du site) n'ont pas lieu d'être. */
try { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; } catch (e) { }
try { Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); } catch (e) { }
window.MAG_EXE = true;
var ipc = null; try { ipc = require('electron').ipcRenderer; } catch (e) { }
// pour les pages (Fond Jarvis, lanceur) : démarrage avec Windows
window.MAGEXE = {
  demarrage: function (on) { return ipc ? ipc.invoke('demarrage', on) : Promise.resolve({ ok: false }); },
  veille: function (on, min) { return ipc ? ipc.invoke('veille', on, min) : Promise.resolve({ ok: false }); },
  essaiVeille: function () { if (ipc) ipc.send('veille-essai'); },
  cameras: function (name, move) { try { return ipc ? ipc.sendSync('cam-voice', String(name || ''), String(move || '')) : 'absent'; } catch (e) { return 'absent'; } }
};
// Caméras : pont MAGCameras (comme CamerasBridge.java sur Android) et mosaïque
if (ipc && /^\/cameras\//.test(location.pathname)) {
  var camEmit = function (o) { try { if (window.camerasEvent) window.camerasEvent(JSON.stringify(o)); } catch (e) { } };
  window.MAGCameras = {
    discover: function () { ipc.invoke('cam-discover').then(function (l) { camEmit({ op: 'discover', list: l || [] }); }, function (e) { camEmit({ op: 'discover', list: [], err: String(e) }); }); },
    probe: function (id, ip, user, pwd, xaddr) { ipc.invoke('cam-probe', id, ip, user, pwd, xaddr).then(camEmit, function (e) { camEmit({ op: 'probe', id: id, ok: false, err: 'closed', diag: String(e) }); }); },
    store: function (json) { ipc.send('cam-store', json); },
    show: function (json, k) { ipc.send('cam-show', json, k); return true; },
    ptzMove: function (json, dir) { return true; },
    quit: function () { window.close(); }
  };
}
if (ipc && /^\/shared\/cameras\/viewer\.html/.test(location.pathname)) {
  window.MAGCamViewer = { data: function () { return ipc.invoke('cam-data'); }, ptz: function (i, d) { return ipc.invoke('cam-ptz', i, d); } };
}
// Fond Jarvis lancé en écran de veille : plein écran sans barre ni curseur ; la souris qui bouge le referme
if (/[?&]veille=1/.test(location.search)) {
  window.MAG_VEILLE = true;
  document.addEventListener('DOMContentLoaded', function () {
    var s = document.createElement('style');
    s.textContent = '#dock,#bar,#keys,#timers,#sheet,#bien,#gear{display:none!important}*{cursor:none!important}';
    document.head.appendChild(s);
  });
  var x0 = null, y0 = null, t0 = Date.now();
  function fin() { if (Date.now() - t0 > 1500 && ipc) ipc.send('veille-fin'); }
  window.addEventListener('mousemove', function (e) { if (x0 == null) { x0 = e.screenX; y0 = e.screenY; return; } if (Math.abs(e.screenX - x0) + Math.abs(e.screenY - y0) > 14) fin(); }, true);
  ['mousedown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) { window.addEventListener(ev, fin, true); });
}
document.addEventListener('DOMContentLoaded', function () {
  document.documentElement.classList.add('mag-exe');
  var st = document.createElement('style');
  st.textContent = '.mag-exe #offBtn,.mag-exe #majBtn{display:none!important}';
  document.head.appendChild(st);
  var off = document.getElementById('offMsg');
  if (off) off.textContent = 'version programme Windows : toutes les applis sont déjà sur cet ordinateur et s\'ouvrent sans internet.';
  // lanceur : un bouton « 📌 Bureau » par appli pour en faire un raccourci sur le Bureau
  if (ipc && document.querySelector('.tw[data-app]')) {
    st.textContent += '.mag-exe .tw{position:relative}.mag-pin{position:absolute;right:38px;top:8px;border:1px solid var(--line,#ccc);background:var(--card,#fff);color:inherit;border-radius:10px;padding:3px 8px;font:inherit;font-size:12px;cursor:pointer;opacity:.75}.mag-pin:hover{opacity:1;border-color:var(--acc,#06c)}';
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#222;color:#fff;padding:10px 18px;border-radius:12px;font:15px system-ui;z-index:99999;display:none';
    document.body.appendChild(toast);
    Array.prototype.forEach.call(document.querySelectorAll('.tw[data-app]'), function (tw) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mag-pin'; b.textContent = '📌 Bureau';
      b.title = 'Mettre un raccourci de cette appli sur le Bureau';
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        ipc.invoke('raccourci', tw.getAttribute('data-app')).then(function (r) {
          toast.textContent = r.msg; toast.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { toast.style.display = 'none'; }, 3000);
        });
      });
      tw.appendChild(b);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('header p, .hd p, p'), function (p) {
    if (/installer depuis Edge ou Chrome/.test(p.textContent) && !p.children.length) p.textContent = 'Les applis du téléphone, version ordinateur : installées sur ce PC, utilisables partout sans internet.';
  });
  // lanceur : case « Jarvis au démarrage de Windows »
  var foot = document.querySelector('footer');
  if (ipc && foot && document.querySelector('.tw[data-app]')) {
    var box = document.createElement('label');
    box.className = 'mag-boot';
    box.innerHTML = '<input type="checkbox"> <span><b>Ouvrir Jarvis en plein écran au démarrage de Windows</b><small>Le Fond Jarvis s\'ouvre tout seul à l\'ouverture de votre session. F11 pour quitter le plein écran.</small></span>';
    st.textContent += '.mag-boot{display:flex;gap:.7em;align-items:flex-start;margin:1.2em auto .4em;max-width:60em;padding:.8em 1em;border:1px solid var(--line,#ccc);border-radius:12px;background:var(--card,#fff);cursor:pointer}.mag-boot input{width:1.2em;height:1.2em;margin-top:.15em}.mag-boot small{display:block;opacity:.7;margin-top:.2em}';
    foot.parentNode.insertBefore(box, foot);
    var cb = box.querySelector('input');
    window.MAGEXE.demarrage().then(function (r) { cb.checked = !!r.on; if (!r.ok) box.style.display = 'none'; });
    cb.addEventListener('change', function () { window.MAGEXE.demarrage(cb.checked).then(function (r) { cb.checked = !!r.on; }); });
    var vb = document.createElement('label');
    vb.className = 'mag-boot';
    vb.innerHTML = '<input type="checkbox"> <span><b>Jarvis comme écran de veille</b><small>Après <select aria-label="Minutes d\'inactivité">' + [1, 3, 5, 10, 15, 20, 30, 45, 60].map(function (m) { return '<option value="' + m + '">' + m + ' min</option>'; }).join('') + '</select> sans toucher le PC, le Fond Jarvis s\'affiche en plein écran. Bougez la souris pour revenir.</small></span>';
    foot.parentNode.insertBefore(vb, foot);
    var vc = vb.querySelector('input'), vm = vb.querySelector('select');
    window.MAGEXE.veille().then(function (r) { if (!r.ok) { vb.querySelector('small').textContent = r.portable ? 'Disponible avec la version installée (Suite-MAG-Installation.exe).' : 'Non disponible sur ce PC.'; vc.disabled = true; return; } vc.checked = !!r.on; vm.value = String(r.min || 10); });
    function setV() { window.MAGEXE.veille(vc.checked, +vm.value).then(function (r) { vc.checked = !!r.on; }); }
    vc.addEventListener('change', setV);
    vm.addEventListener('change', function () { if (vc.checked) setV(); });
  }
  var maj = document.getElementById('majMsg');
  if (maj) maj.textContent = 'version programme (Suite MAG.exe). Pour une nouvelle version, téléchargez de nouveau le programme.';
});
