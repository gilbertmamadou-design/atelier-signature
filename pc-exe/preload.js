/* Exécuté dans la page avant ses scripts (contextIsolation désactivée, sans Node) :
   - la reconnaissance vocale Web Speech de Chrome ne fonctionne pas hors de Chrome : on la retire pour que
     Majordome et Dictaphone utilisent leur modèle vocal local (hors ligne) ;
   - les boutons du lanceur liés au navigateur (hors ligne, mises à jour du site) n'ont pas lieu d'être. */
try { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; } catch (e) { }
try { Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); } catch (e) { }
window.MAG_EXE = true;
var ipc = null; try { ipc = require('electron').ipcRenderer; } catch (e) { }
// pour les pages (Fond Jarvis, lanceur) : démarrage avec Windows
window.MAGEXE = { demarrage: function (on) { return ipc ? ipc.invoke('demarrage', on) : Promise.resolve({ ok: false }); } };
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
  }
  var maj = document.getElementById('majMsg');
  if (maj) maj.textContent = 'version programme (Suite MAG.exe). Pour une nouvelle version, téléchargez de nouveau le programme.';
});
