/* Exécuté dans la page avant ses scripts (contextIsolation désactivée, sans Node) :
   - la reconnaissance vocale Web Speech de Chrome ne fonctionne pas hors de Chrome : on la retire pour que
     Majordome et Dictaphone utilisent leur modèle vocal local (hors ligne) ;
   - les boutons du lanceur liés au navigateur (hors ligne, mises à jour du site) n'ont pas lieu d'être. */
try { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; } catch (e) { }
try { Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); } catch (e) { }
window.MAG_EXE = true;
document.addEventListener('DOMContentLoaded', function () {
  document.documentElement.classList.add('mag-exe');
  var st = document.createElement('style');
  st.textContent = '.mag-exe #offBtn,.mag-exe #majBtn{display:none!important}';
  document.head.appendChild(st);
  var off = document.getElementById('offMsg');
  if (off) off.textContent = 'version programme Windows : toutes les applis sont déjà sur cet ordinateur et s\'ouvrent sans internet.';
  var maj = document.getElementById('majMsg');
  if (maj) maj.textContent = 'version programme (Suite MAG.exe). Pour une nouvelle version, téléchargez de nouveau le programme.';
});
