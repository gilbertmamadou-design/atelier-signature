/* Suite MAG.exe : les applis de pc/ dans un vrai programme Windows, sans navigateur ni service worker.
   Les fichiers sont servis depuis le disque par le protocole « mag://suite/… » (origine fixe : les données
   localStorage / IndexedDB restent dans %APPDATA%\Suite MAG et ne sont jamais effacées par le navigateur). */
'use strict';
const { app, BrowserWindow, protocol, session, shell, Menu, desktopCapturer, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const SMOKE = process.argv.includes('--smoke');
const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'pc') : path.join(__dirname, '..', 'pc');
const ORIGIN = 'mag://suite';
const ICONES = app.isPackaged ? path.join(process.resourcesPath, 'icones') : path.join(__dirname, 'build', 'icones');
// chemin du programme lui-même (la version portable se décompresse ailleurs : on garde l'original)
const EXE = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
let NOMS = {};
try { NOMS = JSON.parse(fs.readFileSync(path.join(ICONES, 'noms.json'), 'utf8')); } catch (e) { }
function ico(id) { const f = path.join(ICONES, (id || 'lecteur') + '.ico'); return fs.existsSync(f) ? f : null; }

protocol.registerSchemesAsPrivileged([{
  scheme: 'mag',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true, allowServiceWorkers: false }
}]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.map': 'application/json',
  '.bin': 'application/octet-stream', '.gz': 'application/gzip', '.zip': 'application/zip', '.traineddata': 'application/octet-stream'
};

function fichier(url) {
  let p;
  try { p = decodeURIComponent(new URL(url).pathname); } catch (e) { return null; }
  let f = path.normalize(path.join(ROOT, p));
  if (f !== ROOT && !f.startsWith(ROOT + path.sep)) return null;
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (e) { }
  return f;
}

async function servir(req) {
  const f = fichier(req.url);
  if (!f) return new Response('Interdit', { status: 403 });
  let st;
  try { st = await fs.promises.stat(f); } catch (e) { return new Response('Introuvable : ' + req.url, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } }); }
  const type = MIME[path.extname(f).toLowerCase()] || 'application/octet-stream';
  const h = { 'content-type': type, 'cache-control': 'no-cache', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' };
  const range = req.headers.get('range');
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m && st.size) {
    let a = m[1] ? +m[1] : st.size - +m[2], b = m[1] && m[2] ? +m[2] : st.size - 1;
    if (!m[1]) b = st.size - 1;
    if (a < 0) a = 0; if (b >= st.size) b = st.size - 1;
    if (a > b) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + st.size } });
    const fd = await fs.promises.open(f, 'r');
    const buf = Buffer.alloc(b - a + 1);
    try { await fd.read(buf, 0, buf.length, a); } finally { await fd.close(); }
    return new Response(buf, { status: 206, headers: Object.assign(h, { 'content-range': 'bytes ' + a + '-' + b + '/' + st.size, 'content-length': String(buf.length) }) });
  }
  return new Response(await fs.promises.readFile(f), { status: 200, headers: Object.assign(h, { 'content-length': String(st.size) }) });
}

/* ---------- fenêtres : le lanceur, puis une fenêtre par appli (comme les applis installées) ---------- */
const fenetres = new Map(); // id d'appli -> BrowserWindow
let lanceur = null;

function idAppli(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'mag:' || u.host !== 'suite') return null;
    const seg = u.pathname.split('/').filter(Boolean);
    if (!seg.length || seg[0] === 'index.html' || seg[0] === 'shared') return null;
    return fs.existsSync(path.join(ROOT, seg[0], 'index.html')) ? seg[0] : null;
  } catch (e) { return null; }
}

function icone(id) {
  const f = path.join(ROOT, id || 'lecteur', 'icon-192.png');
  return fs.existsSync(f) ? f : undefined;
}

function brancher(win) {
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel):/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    const id = idAppli(url);
    if (id && url.startsWith(ORIGIN)) { ouvrir(id, url); return { action: 'deny' }; }
    if (/^mag:\/\/suite\/?(index\.html)?([?#].*)?$/.test(url)) { demarrer([]); return { action: 'deny' }; }
    // blob:, about:blank, aperçus d'impression… : fenêtre fille ordinaire
    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: icone(idAppli(wc.getURL())), webPreferences: prefs() } };
  });
  wc.on('will-navigate', (e, url) => {
    if (/^(https?|mailto|tel):/i.test(url)) { e.preventDefault(); shell.openExternal(url); return; }
    // depuis le lanceur, une tuile ouvre l'appli dans sa propre fenêtre
    if (win === lanceur) { const id = idAppli(url); if (id) { e.preventDefault(); ouvrir(id, url); } }
  });
  wc.on('page-title-updated', (e, t) => { if (!t) e.preventDefault(); });
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r')) { wc.reload(); e.preventDefault(); }
    else if (i.key === 'F12' || (i.control && i.shift && i.key.toLowerCase() === 'i')) { wc.toggleDevTools(); e.preventDefault(); }
    else if (i.control && (i.key === '+' || i.key === '=')) { wc.setZoomLevel(wc.getZoomLevel() + 0.5); e.preventDefault(); }
    else if (i.control && i.key === '-') { wc.setZoomLevel(wc.getZoomLevel() - 0.5); e.preventDefault(); }
    else if (i.control && i.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
  });
}

function prefs() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, nodeIntegration: false, sandbox: false, spellcheck: true, backgroundThrottling: false };
}

function creer(url, id, show) {
  const win = new BrowserWindow({
    width: id ? 1280 : 1100, height: id ? 820 : 860, minWidth: 360, minHeight: 300,
    show: false, autoHideMenuBar: true, backgroundColor: '#ffffff', icon: icone(id), title: 'Suite MAG',
    webPreferences: prefs()
  });
  brancher(win);
  if (show !== false) win.once('ready-to-show', () => win.show());
  win.loadURL(url);
  return win;
}

function ouvrir(id, url) {
  const w = fenetres.get(id);
  if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.focus(); return w; }
  const win = creer(url || ORIGIN + '/' + id + '/', id);
  fenetres.set(id, win);
  if (process.platform === 'win32' && ico(id)) {
    // chaque appli a sa propre icône dans la barre des tâches (et peut y être épinglée)
    try { win.setAppDetails({ appId: 'fr.magformation13.suite.' + id, appIconPath: ico(id), appIconIndex: 0, relaunchCommand: '"' + EXE + '" --app=' + id, relaunchDisplayName: NOMS[id] || id }); } catch (e) { }
  }
  win.on('closed', () => fenetres.delete(id));
  return win;
}

function demarrer(argv) {
  // « Suite MAG.exe --app=texte » ouvre directement une appli (raccourcis sur le bureau)
  const a = (argv || []).find((x) => /^--app=/.test(x));
  const id = a && a.slice(6);
  if (id && fs.existsSync(path.join(ROOT, id, 'index.html'))) { ouvrir(id); return; }
  if (lanceur && !lanceur.isDestroyed()) { if (lanceur.isMinimized()) lanceur.restore(); lanceur.focus(); return; }
  lanceur = creer(ORIGIN + '/index.html', null);
  lanceur.on('closed', () => { lanceur = null; });
}

/* ---------- autorisations : micro, caméra, notifications, presse-papiers, capture d'écran ---------- */
function autorisations(ses) {
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(true));
  ses.setPermissionCheckHandler(() => true);
  ses.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((src) => {
      const ecran = src.find((s) => s.id.startsWith('screen:')) || src[0];
      if (!ecran) return cb({});
      cb(req.audioRequested && process.platform === 'win32' ? { video: ecran, audio: 'loopback' } : { video: ecran });
    }).catch(() => cb({}));
  }, { useSystemPicker: true });
}

/* ---------- vérification automatique (CI) : chaque appli s'ouvre sans erreur ---------- */
async function verifier() {
  const ids = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, 'index.html')) && d !== 'shared');
  const res = [];
  for (const id of ['', ...ids]) {
    const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: prefs() });
    const err = [];
    win.webContents.on('console-message', (e, lvl, msg, line, src) => {
      const level = typeof e === 'object' && e && e.level ? e.level : lvl;
      const text = typeof e === 'object' && e && e.message ? e.message : msg;
      if (level === 3 || level === 'error') err.push(String(text).slice(0, 300));
    });
    win.webContents.session.webRequest.onCompleted({ urls: ['mag://*/*'] }, (d) => { if (d.statusCode >= 400) err.push(d.statusCode + ' ' + d.url); });
    let ok = true;
    try { await win.loadURL(ORIGIN + '/' + (id ? id + '/' : 'index.html')); } catch (e) { ok = false; err.push('chargement : ' + e.message); }
    await new Promise((r) => setTimeout(r, 2500));
    let titre = '', corps = 0;
    try { titre = await win.webContents.executeJavaScript('document.title'); corps = await win.webContents.executeJavaScript('document.body ? document.body.innerText.length : 0'); } catch (e) { ok = false; }
    res.push({ id: id || '(lanceur)', ok: ok && corps > 0, titre, texte: corps, erreurs: err });
    win.destroy();
  }
  const out = process.env.SMOKE_OUT || path.join(process.cwd(), 'verification.json');
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  res.forEach((r) => console.log((r.ok ? 'OK  ' : 'ÉCHEC ') + r.id + ' — ' + r.titre + (r.erreurs.length ? '\n     ' + r.erreurs.join('\n     ') : '')));
  app.exit(res.every((r) => r.ok) ? 0 : 1);
}

if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (e, argv) => demarrer(argv));
  app.setAppUserModelId('fr.magformation13.suite');
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle('mag', servir);
    // raccourci d'une appli sur le Bureau (bouton « 📌 Bureau » du lanceur)
    ipcMain.handle('raccourci', (e, id) => {
      if (!/^[a-z0-9-]+$/.test(id || '') || !fs.existsSync(path.join(ROOT, id, 'index.html'))) return { ok: false, msg: 'Appli inconnue' };
      if (process.platform !== 'win32') return { ok: false, msg: 'Seulement sous Windows' };
      const nom = (NOMS[id] || id).replace(/[\\/:*?"<>|]/g, '');
      const lnk = path.join(app.getPath('desktop'), nom + '.lnk');
      const ok = shell.writeShortcutLink(lnk, { target: EXE, args: '--app=' + id, icon: ico(id) || EXE, iconIndex: 0, description: nom + ' (Suite MAG)', appUserModelId: 'fr.magformation13.suite.' + id });
      return { ok, msg: ok ? 'Raccourci « ' + nom + ' » créé sur le Bureau' : 'Création impossible' };
    });
    ipcMain.handle('portable', () => !!process.env.PORTABLE_EXECUTABLE_FILE);
    autorisations(session.defaultSession);
    if (SMOKE) return verifier();
    demarrer(process.argv);
  });
  app.on('window-all-closed', () => app.quit());
  process.on('uncaughtException', (e) => { try { dialog.showErrorBox('Suite MAG', String(e && e.stack || e)); } catch (x) { } });
}
