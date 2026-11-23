/* COPIE GÉNÉRÉE par pc/build-pc.py depuis pc/shared/ocr-worker.js : ne pas modifier ici. */
/* Suite MAG sur PC : reconnaissance de texte hors ligne (Web Worker).
   Moteur : Tesseract compilé en WebAssembly (tesseract.js-core 7.0.0, Apache-2.0), variante « SIMD + LSTM ».
   Langue : français, modèle tessdata_fast (Apache-2.0). Fichiers dans vendor/tesseract/ (voir vendor/VENDOR.json).
   pc/build-pc.py COPIE ce fichier dans le dossier de chaque appli qui l'utilise (pc/<appli>/ocr-worker.js) : un worker
   doit être dans la portée du service worker de l'appli pour fonctionner hors ligne.
   Messages : {id, cmd:'rec', img:ArrayBuffer (JPEG/PNG), lang:'fra', base:'…/vendor/tesseract/'} → {id, ok, tsv} ou {id, ok:false, err}.
   Le TSV (une ligne par bloc, paragraphe, ligne, mot, avec leurs cadres en pixels) est converti par pc-shim.js. */
'use strict';
var BASE = new URL('../shared/vendor/tesseract/', self.location.href).href;   // remplacé par d.base (chemin envoyé par pc-shim.js)
var TM = null, api = null, cur = '';

async function init(lang) {
  if (!/^[a-z_]{3,12}$/.test(lang)) throw new Error('langue inconnue');
  if (!TM) {
    importScripts(BASE + 'tesseract-core-simd-lstm.js');
    TM = await self.TesseractCore({ locateFile: function (f) { return BASE + f; } });
  }
  if (api && cur === lang) return;
  var r = await fetch(BASE + lang + '.traineddata');
  if (!r.ok) throw new Error('données de langue absentes (' + lang + ')');
  TM.FS.writeFile('/' + lang + '.traineddata', new Uint8Array(await r.arrayBuffer()));
  if (api) { try { api.End(); } catch (e) { } }
  api = new TM.TessBaseAPI();
  if (api.Init(null, lang, 1) !== 0) { api = null; throw new Error('initialisation de Tesseract impossible'); }   // 1 = moteur LSTM
  api.SetVariable('tessedit_pageseg_mode', '3');        // découpage automatique de la page (colonnes, blocs)
  api.SetVariable('user_defined_dpi', '300');
  cur = lang;
}

self.onmessage = async function (e) {
  var d = e.data || {};
  try {
    if (d.cmd !== 'rec') throw new Error('commande inconnue');
    if (d.base && !TM && new URL(d.base).origin === self.location.origin) BASE = d.base;
    await init(d.lang || 'fra');
    TM.FS.writeFile('/input', new Uint8Array(d.img));
    if (api.SetImageFile(1, 0) === 1) throw new Error('image illisible');
    api.Recognize(null);
    var tsv = api.GetTSVText(0);
    api.Clear();
    try { TM.FS.unlink('/input'); } catch (x) { }
    self.postMessage({ id: d.id, ok: true, tsv: tsv });
  } catch (err) {
    self.postMessage({ id: d.id, ok: false, err: String(err && err.message || err) });
  }
};
