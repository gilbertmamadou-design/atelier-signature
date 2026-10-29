/* =====================================================================
   Suite MAG — fichiers des applis bureautiques : ouvrir, enregistrer (sur place ou sous), exporter, partager,
   « Ouvrir avec », documents récents, enregistrement automatique (IndexedDB) et récupération.
   Trois moteurs, même interface :
     - PC (Suite MAG sur PC) : File System Access par window.MAGPC (poignées gardées dans IndexedDB) ;
     - Android : pont window.MAGOffice (applis/scripts/OfficeBridge.java), lecture/écriture par morceaux base64 ;
     - navigateur simple : <input type=file> et téléchargement.
   Office.Files.configure({app, name, types:[{description, accept:{mime:[ext]}}], ext, mime})
   Une « référence » de fichier : {kind:'handle', handle} | {kind:'uri', uri, write} | null (pas d'enregistrement sur place).
   ===================================================================== */
(function () {
  'use strict';
  const O = window.Office;
  const F = O.Files = { conf: { app: 'office', name: 'Document', types: [], ext: '', mime: 'application/octet-stream' } };
  F.configure = (c) => { Object.assign(F.conf, c); return F; };
  const PC = () => window.MAGPC;
  const AND = () => (!window.MAGPC && window.MAGOffice) || null;

  /* ---------------- Petite base IndexedDB ---------------- */
  F.db = function (name, stores, version) {
    let p = null;
    function open() {
      if (p) return p;
      p = new Promise((res, rej) => {
        const r = indexedDB.open(name, version || 1);
        r.onupgradeneeded = () => { const d = r.result; stores.forEach((s) => { const o = typeof s === 'string' ? { name: s } : s; if (!d.objectStoreNames.contains(o.name)) d.createObjectStore(o.name, o.keyPath ? { keyPath: o.keyPath } : undefined); }); };
        r.onsuccess = () => res(r.result); r.onerror = () => { p = null; rej(r.error); }; r.onblocked = () => { p = null; rej(new Error('Base occupée')); };
      });
      return p;
    }
    const req = (st, mode, fn) => open().then((d) => new Promise((res, rej) => { const t = d.transaction(st, mode), s = t.objectStore(st); let out; const q = fn(s); if (q) q.onsuccess = () => { out = q.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Stockage plein')); }));
    return {
      get: (st, k) => req(st, 'readonly', (s) => s.get(k)), put: (st, v, k) => req(st, 'readwrite', (s) => k === undefined ? s.put(v) : s.put(v, k)),
      del: (st, k) => req(st, 'readwrite', (s) => s.delete(k)), all: (st) => req(st, 'readonly', (s) => s.getAll()), keys: (st) => req(st, 'readonly', (s) => s.getAllKeys()),
      clear: (st) => req(st, 'readwrite', (s) => s.clear()),
      putMany: (st, list) => open().then((d) => new Promise((res, rej) => { const t = d.transaction(st, 'readwrite'), s = t.objectStore(st); list.forEach((x) => x[1] === undefined ? s.put(x[0]) : s.put(x[0], x[1])); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Stockage plein')); }))
    };
  };
  let DB = null;
  F.store = () => DB || (DB = F.db('office-' + F.conf.app, ['kv', 'media', { name: 'recents', keyPath: 'id' }], 1));

  /* ---------------- Android : pont MAGOffice ---------------- */
  const waiters = {}; let pickWait = null; let launchFn = null; const launchQ = [];
  window.officeEvent = function (type, json) {
    let d = {}; try { d = JSON.parse(json || '{}'); } catch (e) { }
    if (type === 'out' && waiters[d.token]) { const w = waiters[d.token]; delete waiters[d.token]; w(d); }
    else if (type === 'files') {
      if (d.src === 'pick' && pickWait) { const w = pickWait; pickWait = null; w(d); }
      else if (d.src === 'view') deliverLaunch(d);
    }
  };
  function andRead(src, name) {
    const B = AND();
    const o = JSON.parse(B.open(src) || '{}');
    if (!o.ok) { const e = new Error(o.err === 'perm' ? 'Autorisation perdue : rouvre le fichier' : o.err === 'missing' ? 'Fichier introuvable (déplacé ou supprimé)' : 'Lecture impossible : ' + (o.err || '')); e.code = o.err; return Promise.reject(e); }
    const parts = []; let off = 0;
    return new Promise((res, rej) => {
      (function step() {
        try {
          const b = B.read(o.h, off, 2 * 1024 * 1024);
          if (!b) { B.close(o.h); res(new File(parts, name || 'document', { type: O.mimeOf(name) })); return; }
          const u = O.b64ToBytes(b); parts.push(u); off += u.length;
          if (off >= o.size) { B.close(o.h); res(new File(parts, name || 'document', { type: O.mimeOf(name) })); return; }
          setTimeout(step, 0);
        } catch (e) { try { B.close(o.h); } catch (x) { } rej(e); }
      })();
    });
  }
  async function andOut(blob, mode, name, mime, target) {
    const B = AND(); const tok = B.outBegin(); if (!tok) throw new Error('Écriture impossible');
    const buf = new Uint8Array(await blob.arrayBuffer());
    for (let i = 0; i < buf.length; i += 768 * 1024) { if (!B.outChunk(tok, O.bytesToB64(buf.subarray(i, i + 768 * 1024)))) { B.outCancel(tok); throw new Error('Écriture interrompue'); } }
    return new Promise((res) => { waiters[tok] = res; B.outEnd(tok, mode, name, mime || blob.type || O.mimeOf(name), target || ''); });
  }
  function deliverLaunch(d) {
    const files = (d.files || []);
    Promise.all(files.map((f) => andRead(f.src, f.name).then((blob) => ({ name: f.name, blob, ref: { kind: 'uri', uri: f.src, write: !!f.write } }), () => null))).then((l) => {
      l = l.filter(Boolean); if (!l.length) return;
      if (launchFn) launchFn(l); else launchQ.push(l);
    });
  }

  /* ---------------- Ouvrir ---------------- */
  function acceptOf(types) { const a = []; (types || []).forEach((t) => Object.keys(t.accept).forEach((m) => { a.push(m); a.push.apply(a, t.accept[m]); })); return a.join(','); }
  /** Choisir un ou des fichiers → [{name, blob, ref}] ([] si annulé) */
  F.open = async function (opt) {
    opt = opt || {}; const types = opt.types || F.conf.types;
    if (PC()) {
      const l = await PC().fs.open({ types, multiple: !!opt.multiple, accept: acceptOf(types), id: opt.id });
      return l.map((x) => ({ name: x.name, blob: x.file, ref: x.handle ? { kind: 'handle', handle: x.handle } : null }));
    }
    if (AND() && opt.native !== false) {
      const mimes = []; types.forEach((t) => Object.keys(t.accept).forEach((m) => mimes.push(m)));
      const d = await new Promise((res) => { pickWait = res; AND().pick(mimes.join(','), !!opt.multiple, opt.write !== false); });
      if (d.cancel || !d.files) return [];
      const out = [];
      for (const f of d.files) { try { out.push({ name: f.name, blob: await andRead(f.src, f.name), ref: { kind: 'uri', uri: f.src, write: !!f.write } }); } catch (e) { O.toast(f.name + ' : ' + e.message, { bad: true }); } }
      return out;
    }
    if (window.showOpenFilePicker && opt.picker !== false) {
      try {
        const hs = await window.showOpenFilePicker({ types, multiple: !!opt.multiple, excludeAcceptAllOption: false });
        return Promise.all(hs.map(async (h) => { const f = await h.getFile(); return { name: f.name, blob: f, ref: { kind: 'handle', handle: h } }; }));
      } catch (e) { if (e && e.name === 'AbortError') return []; }
    }
    return new Promise((resolve) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = !!opt.multiple; inp.accept = opt.accept || acceptOf(types);
      inp.style.display = 'none'; document.body.appendChild(inp);
      inp.onchange = () => { const l = Array.from(inp.files || []).map((f) => ({ name: f.name, blob: f, ref: null })); inp.remove(); resolve(l); };
      inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
      inp.click();
    });
  };
  /** Choisir des médias (images, vidéos…) : toujours le sélecteur simple (pas de référence gardée) */
  F.pickMedia = function (accept, multiple) {
    if (AND() && AND().pick) {
      const mimes = accept.split(',').filter((x) => x.indexOf('/') > 0);
      return new Promise((res) => { pickWait = res; AND().pick(mimes.join(',') || '*/*', !!multiple, false); }).then(async (d) => {
        if (d.cancel || !d.files) return []; const out = [];
        for (const f of d.files) { try { out.push(await andRead(f.src, f.name)); } catch (e) { O.toast(e.message, { bad: true }); } }
        return out;
      });
    }
    return new Promise((resolve) => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = !!multiple; inp.accept = accept; inp.style.display = 'none'; document.body.appendChild(inp);
      inp.onchange = () => { const l = Array.from(inp.files || []); inp.remove(); resolve(l); };
      inp.addEventListener('cancel', () => { inp.remove(); resolve([]); }); inp.click();
    });
  };
  /** Relire un fichier par sa référence (récents) → Blob */
  F.read = async function (ref, name) {
    if (!ref) throw new Error('Fichier non disponible');
    if (ref.kind === 'handle') { if (PC()) return PC().fs.read(ref.handle, F.conf.name); const p = await ref.handle.queryPermission({ mode: 'read' }); if (p !== 'granted' && (await ref.handle.requestPermission({ mode: 'read' })) !== 'granted') throw new Error('Autorisation refusée'); return ref.handle.getFile(); }
    if (ref.kind === 'uri') return andRead(ref.uri, name);
    if (ref.kind === 'blob') return ref.blob;
    throw new Error('Fichier non disponible');
  };
  F.canWrite = (ref) => !!ref && (ref.kind === 'handle' || (ref.kind === 'uri' && ref.write));
  /** Enregistrer sur place → {ok} */
  F.write = async function (ref, blob, name) {
    if (ref.kind === 'handle') { if (PC()) await PC().fs.write(ref.handle, blob); else { const w = await ref.handle.createWritable(); await w.write(blob); await w.close(); } return { ok: true }; }
    if (ref.kind === 'uri') { const r = await andOut(blob, 'write', name, blob.type, ref.uri); if (!r.ok) { const e = new Error(r.err === 'perm' ? 'Autorisation d\'écriture refusée' : r.err || 'Écriture impossible'); e.code = r.err === 'perm' ? 'perm' : 'io'; throw e; } return { ok: true }; }
    throw new Error('Enregistrement sur place impossible');
  };
  /** Enregistrer sous → {ok, ref, name} | {ok:false, cancel:true} */
  F.saveAs = async function (blob, name, opt) {
    opt = opt || {}; const types = opt.types || F.conf.types;
    if (PC()) { const r = await PC().fs.saveAs(blob, name, { types, id: opt.id }); return r.ok ? { ok: true, ref: r.handle ? { kind: 'handle', handle: r.handle } : null, name: r.name || name, downloaded: r.downloaded } : r; }
    if (AND()) { const r = await andOut(blob, 'saveas', name, opt.mime || blob.type); if (!r.ok) return r.err === 'Annulé' ? { ok: false, cancel: true } : { ok: false, err: r.err }; return { ok: true, ref: { kind: 'uri', uri: r.uri, write: true }, name: r.name || name }; }
    if (window.showSaveFilePicker && opt.picker !== false) {
      try { const h = await window.showSaveFilePicker({ suggestedName: name, types }); const w = await h.createWritable(); await w.write(blob); await w.close(); return { ok: true, ref: { kind: 'handle', handle: h }, name: h.name }; }
      catch (e) { if (e && e.name === 'AbortError') return { ok: false, cancel: true }; }
    }
    F.download(blob, name); return { ok: true, ref: null, name, downloaded: true };
  };
  F.download = function (blob, name) {
    if (AND()) return andOut(blob, 'download', name, blob.type).then((r) => { O.toast(r.ok ? '« ' + (r.name || name) + ' » enregistré dans Téléchargements' : 'Enregistrement impossible : ' + (r.err || ''), { bad: !r.ok }); return r; });
    if (PC()) { PC().fs.download(blob, name); return Promise.resolve({ ok: true }); }
    const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
    return Promise.resolve({ ok: true });
  };
  /** Exporter (PDF, PPTX, PNG…) : emplacement au choix */
  F.export = (blob, name, opt) => F.saveAs(blob, name, Object.assign({ id: 'export' }, opt || {}));
  F.share = async function (blob, name) {
    if (AND()) { const r = await andOut(blob, 'share', name, blob.type); return r; }
    if (PC()) return PC().share(blob, name);
    const f = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: name }); return { ok: true }; } catch (e) { return { ok: false, cancel: true }; } }
    return F.download(blob, name);
  };
  F.printPdf = async function (blob, name) {
    if (AND()) return andOut(blob, 'print', name, 'application/pdf');
    if (window.MAGPrint && window.MAGPrint.printPdf) { window.MAGPrint.printPdf(O.bytesToB64(new Uint8Array(await blob.arrayBuffer())), name); return { ok: true }; }
    return null;
  };
  /** « Ouvrir avec » (PC : file_handlers et dépôt ; Android : intent VIEW / SEND) → fn([{name, blob, ref}], via) */
  F.onLaunch = function (fn) {
    launchFn = fn; launchQ.splice(0).forEach((l) => fn(l, 'launch'));
    if (PC()) PC().onFiles((o) => { const l = o.items.filter((x) => x.file).map((x) => ({ name: x.file.name, blob: x.file, ref: x.handle ? { kind: 'handle', handle: x.handle } : null })); if (l.length) fn(l, o.via); });
    if (AND()) { try { const p = AND().pending(); if (p) deliverLaunch(JSON.parse(p)); } catch (e) { } }
  };

  /* ---------------- Récents ---------------- */
  F.recents = {
    async list() { try { const l = await F.store().all('recents'); return (l || []).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.at - a.at); } catch (e) { return []; } },
    async add(o) {
      // o : {name, ref, thumb, info, blob (copie si aucune référence)}
      const l = await F.recents.list();
      const same = l.find((x) => x.name === o.name && sameRef(x.ref, o.ref));
      const id = same ? same.id : O.uid('r');
      let ref = o.ref;
      if (!ref && o.blob && o.blob.size < 40 * 1024 * 1024) ref = { kind: 'blob', blob: o.blob };
      const rec = { id, name: o.name, ref: ref || null, thumb: o.thumb || (same && same.thumb) || '', info: o.info || '', at: Date.now(), pin: same ? !!same.pin : false };
      try { await F.store().put('recents', rec); } catch (e) { rec.ref = ref && ref.kind === 'blob' ? null : ref; try { await F.store().put('recents', rec); } catch (x) { } }
      // 30 récents au plus (les épinglés restent)
      const all = await F.recents.list(); const extra = all.filter((x) => !x.pin).slice(30);
      for (const x of extra) await F.store().del('recents', x.id);
      return id;
    },
    get: (id) => F.store().get('recents', id),
    async remove(id) { const r = await F.store().get('recents', id).catch(() => null); if (r && r.ref && r.ref.kind === 'uri' && AND() && AND().forget) { try { AND().forget(r.ref.uri); } catch (e) { } } return F.store().del('recents', id); },
    async pin(id, v) { const r = await F.store().get('recents', id); if (r) { r.pin = v; await F.store().put('recents', r); } },
    async clear() { const l = await F.recents.list(); for (const x of l) if (!x.pin) await F.store().del('recents', x.id); }
  };
  function sameRef(a, b) { if (!a || !b) return false; if (a.kind === 'uri' && b.kind === 'uri') return a.uri === b.uri; return false; }
  /** Les poignées PC : même fichier ? */
  F.sameHandle = async (a, b) => { try { return !!(a && b && a.isSameEntry && (await a.isSameEntry(b))); } catch (e) { return false; } };
  /** Retire les doublons d'un fichier du PC (même fichier ouvert plusieurs fois) ; keepId : l'entrée à garder */
  F.dedupeRecents = async function (ref, name, keepId) {
    if (!ref || ref.kind !== 'handle') return;
    const l = await F.recents.list();
    for (const x of l) if (x.id !== keepId && x.name === name && x.ref && x.ref.kind === 'handle' && (await F.sameHandle(x.ref.handle, ref.handle))) await F.store().del('recents', x.id);
  };
  F.vignette = async function (canvas, max) { // vignette JPEG (data URL) d'un canvas
    max = max || 320; const k = Math.min(1, max / canvas.width); const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.75);
  };

  /* ---------------- Enregistrement automatique ----------------
     F.autosave.put(clé, objet JSON, médias {id: Blob}) ; F.autosave.get(clé) → {data, at, media:{id: Blob}} ; F.autosave.drop(clé) */
  F.autosave = {
    async put(key, data, media) {
      const st = F.store();
      const known = new Set((await st.keys('media')).map(String));
      const add = []; for (const id in (media || {})) if (!known.has(key + ':' + id)) add.push([media[id], key + ':' + id]);
      if (add.length) await st.putMany('media', add);
      await st.put('kv', { data, at: Date.now(), mediaIds: Object.keys(media || {}) }, 'auto:' + key);
      // médias qui ne servent plus
      for (const k of known) if (k.startsWith(key + ':') && !(k.slice(key.length + 1) in (media || {}))) await st.del('media', k);
    },
    async get(key) {
      const st = F.store(); const r = await st.get('kv', 'auto:' + key); if (!r) return null;
      const media = {}; for (const id of r.mediaIds || []) { const b = await st.get('media', key + ':' + id); if (b) media[id] = b; }
      return { data: r.data, at: r.at, media };
    },
    async drop(key) { const st = F.store(); await st.del('kv', 'auto:' + key); for (const k of await st.keys('media')) if (String(k).startsWith(key + ':')) await st.del('media', k); },
    async list() { const st = F.store(); return (await st.keys('kv')).filter((k) => String(k).startsWith('auto:')).map((k) => String(k).slice(5)); }
  };
})();
