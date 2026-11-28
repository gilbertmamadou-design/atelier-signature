/* Raccourcis de Jarvis vers les dossiers et programmes du PC.
   Sécurité : la page ne peut ouvrir QUE les chemins choisis par l'utilisateur dans la fenêtre Windows
   (ou les dossiers usuels : Documents, Bureau…). La liste autorisée est gardée ici, dans userData/chemins.json. */
const path = require('path');
const fs = require('fs');
module.exports = function (app, ipcMain, shell, dialog, BrowserWindow) {
  const F = path.join(app.getPath('userData'), 'chemins.json');
  let ok = [];
  try { ok = JSON.parse(fs.readFileSync(F, 'utf8')).filter((x) => typeof x === 'string'); } catch (e) { }
  const cle = (p) => path.resolve(String(p || '')).toLowerCase();
  function autoriser(p) { const k = cle(p); if (!ok.some((x) => cle(x) === k)) { ok.push(path.resolve(p)); try { fs.writeFileSync(F, JSON.stringify(ok)); } catch (e) { } } }
  function nom(p, type) {
    const b = path.basename(p);
    if (!b || /^[a-z]:\\?$/i.test(p)) return 'Disque ' + p.slice(0, 2).toUpperCase();
    return type === 'programme' ? b.replace(/\.(exe|lnk|url|appref-ms|bat|cmd)$/i, '') : b;
  }
  const SPECIAUX = { documents: 'Documents', downloads: 'Téléchargements', desktop: 'Bureau', pictures: 'Images', videos: 'Vidéos', music: 'Musique', home: 'Dossier personnel' };
  ipcMain.handle('chemin-choisir', async (e, type) => {
    const prog = type === 'programme';
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), prog
      ? { title: 'Choisir un programme pour Jarvis', properties: ['openFile'], filters: [{ name: 'Programmes et raccourcis', extensions: ['exe', 'lnk', 'url', 'appref-ms'] }, { name: 'Tous les fichiers', extensions: ['*'] }] }
      : { title: 'Choisir un dossier pour Jarvis', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, annule: true };
    const p = r.filePaths[0]; autoriser(p);
    return { ok: true, path: p, nom: nom(p, prog ? 'programme' : 'dossier') };
  });
  ipcMain.handle('chemin-special', (e, id) => {
    if (!SPECIAUX[id]) return { ok: false };
    const p = app.getPath(id); autoriser(p);
    return { ok: true, path: p, nom: SPECIAUX[id] };
  });
  ipcMain.handle('chemin-ouvrir', async (e, p) => {
    const k = cle(p);
    if (!p || !ok.some((x) => cle(x) === k)) return { ok: false, err: 'Chemin non autorisé : choisissez-le à nouveau dans ⚙ › Raccourcis' };
    if (!fs.existsSync(p)) return { ok: false, err: 'Introuvable (clé USB débranchée, dossier déplacé ?)' };
    const err = await shell.openPath(p);
    return err ? { ok: false, err: err } : { ok: true };
  });
};
