/* Suite MAG.exe : Google Agenda et Gmail, sans « Se connecter avec Google ».
   - Agenda : « adresse secrète au format iCal » de Google Agenda (Paramètres de l'agenda › Intégrer l'agenda).
     Le programme la télécharge (une page ne le peut pas : Google n'autorise pas les autres sites à la lire),
     la garde sur le disque pour les jours sans internet ; la page Agenda (pc/shared/apps/agenda.js) la lit.
   - Gmail : IMAP (imap.gmail.com:993) avec un « mot de passe d'application » Google (compte avec validation en
     deux étapes › Mots de passe des applications). Lecture seule : nombre de non lus de la boîte principale,
     expéditeur, objet et heure des derniers ; rien n'est marqué lu ni supprimé.
   Les réglages sont dans %APPDATA%\Suite MAG\google.json ; le mot de passe d'application y est chiffré par
   Windows (safeStorage, lié à la session de l'utilisateur) et n'est jamais renvoyé aux pages. */
'use strict';
const { net, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

module.exports = function (app, ipcMain) {
  const DIR = app.getPath('userData');
  const CONF = path.join(DIR, 'google.json');
  const ICS = path.join(DIR, 'google-agenda.ics');
  let conf = {};
  try { conf = JSON.parse(fs.readFileSync(CONF, 'utf8')) || {}; } catch (e) { conf = {}; }
  function save() { try { fs.writeFileSync(CONF, JSON.stringify(conf)); } catch (e) { } }
  function pass() {
    if (!conf.passEnc) return '';
    try { return safeStorage.decryptString(Buffer.from(conf.passEnc, 'base64')); } catch (e) { return ''; }
  }
  function etat() {
    return { ical: !!conf.ical, icalAt: conf.icalAt || 0, icalErr: conf.icalErr || '', gmail: conf.gmail || '', gmailOk: !!(conf.gmail && conf.passEnc), gmailErr: conf.gmailErr || '' };
  }
  function lienIcal(u) {
    u = String(u || '').trim().replace(/^webcal:\/\//i, 'https://');
    return /^https:\/\/calendar\.google\.com\/calendar\/ical\/.+\.ics$/i.test(u) || /^https:\/\/[^\s]+\.ics(\?.*)?$/i.test(u) ? u : '';
  }

  ipcMain.handle('google-etat', () => etat());
  ipcMain.handle('google-reglage', (e, o) => {
    o = o || {};
    if ('ical' in o) {
      if (!o.ical) { delete conf.ical; delete conf.icalAt; delete conf.icalErr; try { fs.unlinkSync(ICS); } catch (x) { } }
      else { const u = lienIcal(o.ical); if (!u) return Object.assign(etat(), { err: 'Ce lien ne ressemble pas à une adresse iCal (il doit finir par .ics).' }); conf.ical = u; delete conf.icalErr; }
    }
    if ('gmail' in o) {
      const g = String(o.gmail || '').trim().toLowerCase();
      if (!g) { delete conf.gmail; delete conf.passEnc; delete conf.gmailErr; }
      else {
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(g)) return Object.assign(etat(), { err: 'Adresse Gmail invalide.' });
        conf.gmail = g;
      }
    }
    if (o.pass) {
      const p = String(o.pass).replace(/\s+/g, '');
      if (!safeStorage.isEncryptionAvailable()) return Object.assign(etat(), { err: 'Windows ne permet pas de chiffrer le mot de passe sur ce PC.' });
      conf.passEnc = safeStorage.encryptString(p).toString('base64'); delete conf.gmailErr;
    }
    save();
    return etat();
  });

  /* ---------------- Agenda : fichier iCal ---------------- */
  ipcMain.handle('google-ical', async (e, force) => {
    if (!conf.ical) return { ok: false, err: 'aucun lien' };
    const recent = conf.icalAt && Date.now() - conf.icalAt < 10 * 60000;
    if (!force && recent) { try { return { ok: true, ics: fs.readFileSync(ICS, 'utf8'), at: conf.icalAt }; } catch (x) { } }
    try {
      const r = await net.fetch(conf.ical, { headers: { 'user-agent': 'Suite MAG' } });
      if (!r.ok) throw new Error(r.status === 404 ? 'lien introuvable (réinitialisé dans Google Agenda ?)' : 'réponse ' + r.status);
      const t = await r.text();
      if (!/BEGIN:VCALENDAR/.test(t)) throw new Error('ce lien ne renvoie pas un agenda');
      fs.writeFileSync(ICS, t); conf.icalAt = Date.now(); delete conf.icalErr; save();
      return { ok: true, ics: t, at: conf.icalAt };
    } catch (x) {
      conf.icalErr = String(x && x.message || x); save();
      try { return { ok: true, old: true, err: conf.icalErr, ics: fs.readFileSync(ICS, 'utf8'), at: conf.icalAt || 0 }; } catch (y) { return { ok: false, err: conf.icalErr }; }
    }
  });

  /* ---------------- Gmail : IMAP, lecture seule ---------------- */
  let enCours = null;
  async function gmail() {
    const user = conf.gmail, pw = pass();
    if (!user || !pw) return { ok: false, err: 'Gmail non configuré' };
    const { ImapFlow } = require('imapflow');
    const c = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: user, pass: pw }, logger: false, connectionTimeout: 20000, greetingTimeout: 15000 });
    try {
      await c.connect();
      const lock = await c.getMailboxLock('INBOX', { readOnly: true });
      let liste = [], total = 0;
      try {
        // boîte principale seulement (sans Promotions ni Réseaux sociaux) ; repli : tous les non lus
        let uids;
        try { uids = await c.search({ gmraw: 'is:unread category:primary' }, { uid: true }); } catch (x) { uids = null; }
        if (!Array.isArray(uids)) uids = await c.search({ seen: false }, { uid: true });
        uids = (uids || []).sort(function (a, b) { return a - b; });
        total = uids.length;
        const der = uids.slice(-20);
        if (der.length) {
          for await (const m of c.fetch(der.join(','), { uid: true, envelope: true, internalDate: true }, { uid: true })) {
            const en = m.envelope || {}, f = (en.from && en.from[0]) || {};
            liste.push({ uid: m.uid, from: f.name || f.address || '', addr: f.address || '', subject: en.subject || '(sans objet)', t: +(m.internalDate || en.date || Date.now()) });
          }
        }
      } finally { lock.release(); }
      await c.logout();
      delete conf.gmailErr; save();
      return { ok: true, total: total, list: liste.sort(function (a, b) { return a.t - b.t; }) };
    } catch (x) {
      try { c.close(); } catch (y) { }
      const m = String(x && (x.responseText || x.message) || x);
      conf.gmailErr = /AUTHENTICATIONFAILED|Invalid credentials|auth/i.test(m) ? 'Adresse ou mot de passe d\'application refusés par Google' : /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|timeout|EAI_AGAIN/i.test(m) ? 'Pas de connexion internet' : m.slice(0, 160);
      save();
      return { ok: false, err: conf.gmailErr };
    }
  }
  ipcMain.handle('google-gmail', () => { if (!enCours) enCours = gmail().finally(function () { enCours = null; }); return enCours; });
};
