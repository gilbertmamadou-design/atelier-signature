/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-google.js : ne pas modifier ici. */
/* =====================================================================
   Majordome sur PC (programme Suite MAG.exe) : Google Agenda et Gmail.
   - Réglages › Google : « adresse secrète au format iCal » de Google Agenda, adresse Gmail et « mot de passe
     d'application » Google. Tout est gardé par le programme (pc-exe/google.js), le mot de passe chiffré par Windows.
   - Agenda : les rendez-vous Google arrivent dans l'agenda du PC (pc/shared/apps/agenda.js, agenda « Google Agenda »
     en lecture seule) : « mes rendez-vous », case Prochain rendez-vous, rappels, Fond Jarvis, appli Agenda.
   - Gmail : les mails non lus de la boîte principale passent par les mêmes fonctions que les messages du téléphone
     (mj-messages.js) : « j'ai des mails ? », « lis-moi mes mails », case Messages et mails, annonce des nouveaux mails
     selon le profil (Maison et Formation : l'arrivée et le nombre ; Chantier : qui écrit et l'objet).
     Vérification toutes les 3 minutes tant que Majordome est ouvert ; rien n'est marqué lu dans Gmail.
   Chargé avant mj-messages.js ; sans le programme (navigateur, téléphone) : rien ne se passe.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome, G = window.MAGEXE && window.MAGEXE.google, B = window.MAGMajordome;
  if (!MJ || !MJ._ || !G || !B) return;
  var X = MJ._, S = X.S, esc = X.esc, $ = function (id) { return document.getElementById(id); };
  var CACHE = /[?&]cerveau=1/.test(location.search);   // fenêtre cachée du fond d'écran : pas de vérification ici
  var ETAT = { gmailOk: false, gmail: '', ical: false };
  var MAILS = [], vu = null, dernier = 0, err = '';

  /* ---------------- les mails comme des notifications (pour mj-messages.js) ---------------- */
  function asMsg(m) { return { id: 'g' + m.uid, key: 'g' + m.uid, pkg: 'com.google.android.gm', app: 'Gmail', from: m.from || m.addr, text: m.subject, t: m.t, mail: true, reply: false }; }
  B.gmail = true;
  B.notifList = function () { return JSON.stringify(MAILS.map(asMsg)); };
  B.notifAccess = function () { return !!ETAT.gmailOk; };
  B.notifClear = function () { MAILS = []; };
  B.notifSettings = function () { X.settingsSheet('google'); };
  B.appInfo = function () { X.settingsSheet('google'); };
  B.notifReply = function () { return JSON.stringify({ ok: false, err: 'Répondre à un mail se fait dans Gmail' }); };

  function verifier(annoncer) {
    if (!ETAT.gmailOk) return Promise.resolve(false);
    return G.gmail().then(function (r) {
      dernier = Date.now();
      if (!r || !r.ok) { err = r && r.err || 'Gmail injoignable'; return false; }
      err = '';
      var avant = vu, neufs = [];
      MAILS = r.list || [];
      vu = {}; MAILS.forEach(function (m) { vu[m.uid] = 1; if (avant && !avant[m.uid]) neufs.push(m); });
      // nouveaux mails depuis la dernière vérification : annoncés comme les messages du téléphone
      if (annoncer && neufs.length && window.majordomeEvent) try { window.majordomeEvent('notif', JSON.stringify(neufs.map(asMsg).map(function (m) { m.t = Math.max(m.t, Date.now() - 60000); return m; }))); } catch (e) { }
      if (MJ.moment) MJ.moment();
      return true;
    }, function () { return false; });
  }
  function etat() { return G.etat().then(function (e) { if (e) ETAT = e; return ETAT; }); }
  // l'agenda du PC (avec Google Agenda) est chargé tout de suite quand un lien est enregistré
  function agenda() { return (B.loadAgenda ? B.loadAgenda() : Promise.resolve(null)).then(function () { return window.MAGAgendaGoogle || null; }, function () { return null; }); }
  etat().then(function () { if (ETAT.ical) agenda(); if (!CACHE) verifier(false); });
  if (!CACHE) setInterval(function () { if (ETAT.gmailOk) verifier(true); }, 3 * 60000);
  window.addEventListener('focus', function () { if (!CACHE && ETAT.gmailOk && Date.now() - dernier > 60000) verifier(true); });

  /* ---------------- Réglages › Google ---------------- */
  function quand(t) { if (!t) return 'jamais'; var m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'à l\'instant' : m < 60 ? 'il y a ' + m + ' min' : new Date(t).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }); }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () {
    var h = prevExtra ? prevExtra() : '', ag = window.MAGAgendaGoogle ? window.MAGAgendaGoogle.etat() : null;
    return h + '<div class="sect" id="f-google">Google : Agenda et Gmail</div>' +
      '<div class="set"><div class="t">Google Agenda<small>' + (ETAT.ical ? (ag && ag.on ? ag.n + ' événements, mis à jour ' + quand(ag.at) + (ag.err ? ' (dernier essai : ' + esc(ag.err) + ')' : '') : 'Lien enregistré' + (ETAT.icalErr ? ' : ' + esc(ETAT.icalErr) : '')) : 'Pas encore relié') + '</small></div>' +
      (ETAT.ical ? '<button class="btn sm" id="ggIcalOff">Retirer</button>' : '') + '</div>' +
      '<input class="in" id="ggIcal" type="url" spellcheck="false" autocomplete="off" placeholder="' + (ETAT.ical ? 'Nouveau lien (facultatif)' : 'https://calendar.google.com/calendar/ical/…/basic.ics') + '" style="width:100%">' +
      '<p class="note">Dans Google Agenda sur ordinateur : ⚙ Paramètres › à gauche, votre agenda › « Intégrer l\'agenda » › <b>Adresse secrète au format iCal</b> › copier, puis coller ici. Les rendez-vous arrivent en lecture seule (pour en ajouter : Google Agenda ou le téléphone). Gardez ce lien pour vous : il donne accès à votre agenda.</p>' +
      '<div class="set"><div class="t">Gmail<small>' + (ETAT.gmailOk ? esc(ETAT.gmail) + (err || ETAT.gmailErr ? ' : ' + esc(err || ETAT.gmailErr) : ' : ' + MAILS.length + ' non lu' + (MAILS.length > 1 ? 's' : '') + ' (boîte principale), vérifié ' + quand(dernier)) : 'Pas encore relié') + '</small></div>' +
      (ETAT.gmailOk ? '<button class="btn sm" id="ggMailOff">Retirer</button>' : '') + '</div>' +
      '<input class="in" id="ggMail" type="email" autocomplete="off" placeholder="votre.adresse@gmail.com" value="' + esc(ETAT.gmail || '') + '" style="width:100%;margin-bottom:6px">' +
      '<input class="in" id="ggPass" type="password" autocomplete="new-password" placeholder="' + (ETAT.gmailOk ? 'Nouveau mot de passe d\'application (facultatif)' : 'Mot de passe d\'application (16 lettres)') + '" style="width:100%">' +
      '<p class="note">Pas votre mot de passe Google habituel : un <b>mot de passe d\'application</b>. Compte Google › Sécurité › Validation en deux étapes (à activer) › <b>Mots de passe des applications</b> › nom « Majordome » › Créer, puis copier les 16 lettres ici. Majordome lit seulement : nombre de non lus, expéditeur et objet ; rien n\'est marqué lu. Vous pouvez supprimer ce mot de passe à tout moment dans votre compte Google.</p>' +
      '<div class="row" style="gap:8px;margin:4px 0 10px"><button class="btn" id="ggSave">Enregistrer et tester</button></div><p class="note" id="ggMsg" style="min-height:1.2em"></p>';
  };
  MJ.settingsBind = function (b) {
    if (prevBind) prevBind(b);
    var msg = function (t, bad) { var m = $('ggMsg'); if (m) { m.textContent = t; m.style.color = bad ? '#ff8a80' : ''; } };
    var rouvrir = function () { setTimeout(function () { X.settingsSheet('google'); }, 300); };
    var s = $('ggSave'); if (!s) return;
    s.onclick = function () {
      var o = {}, ic = $('ggIcal').value.trim(), gm = $('ggMail').value.trim(), pw = $('ggPass').value.trim();
      if (ic) o.ical = ic;
      if (gm && gm !== ETAT.gmail) o.gmail = gm;
      if (pw) { o.pass = pw; if (!gm && !ETAT.gmail) return msg('Indiquez aussi votre adresse Gmail.', true); if (gm) o.gmail = gm; }
      if (!Object.keys(o).length) return msg('Rien de nouveau à enregistrer.');
      s.disabled = true; msg('Enregistrement…');
      G.regler(o).then(function (e) {
        if (e && e.err) { s.disabled = false; return msg(e.err, true); }
        ETAT = e || ETAT;
        var tests = [];
        if (o.ical) { msg('Lecture de Google Agenda…'); tests.push(agenda().then(function (A) { return A ? A.lire(true) : false; }).then(function (ok) { return ok ? 'Agenda relié' : 'Agenda : lien refusé ou injoignable'; })); }
        if (o.pass || o.gmail) { msg('Connexion à Gmail…'); tests.push(etat().then(function () { return verifier(false); }).then(function (ok) { return ok ? 'Gmail relié : ' + MAILS.length + ' non lu' + (MAILS.length > 1 ? 's' : '') : 'Gmail : ' + (err || 'connexion refusée'); })); }
        return Promise.all(tests).then(function (l) {
          s.disabled = false; var bad = l.some(function (x) { return / refus|injoignable|Gmail : /.test(x) && !/relié/.test(x); });
          msg(l.join(' · ') || 'Enregistré', bad); X.toast(l.join(' · ') || 'Enregistré'); if (!bad) rouvrir();
        });
      }, function () { s.disabled = false; msg('Enregistrement impossible.', true); });
    };
    var io = $('ggIcalOff'); if (io) io.onclick = function () { G.regler({ ical: '' }).then(function (e) { ETAT = e || ETAT; if (window.MAGAgendaGoogle) window.MAGAgendaGoogle.lire(true); X.toast('Google Agenda retiré'); rouvrir(); }); };
    var mo = $('ggMailOff'); if (mo) mo.onclick = function () { G.regler({ gmail: '' }).then(function (e) { ETAT = e || ETAT; MAILS = []; if (MJ.moment) MJ.moment(); X.toast('Gmail retiré'); rouvrir(); }); };
  };
})();
