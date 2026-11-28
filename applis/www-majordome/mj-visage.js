/* Majordome — un seul écran : celui de Jarvis.
   Majordome est le noyau (voix, micro, mémoire, profils, messages, Google, caméra, maison) ; son écran est la page Jarvis,
   affichée en plein écran dans un cadre (panneaux à gauche et à droite, effets, raccourcis, sphère au centre).
     appli Android : jarvis/index.html (copie générée par pc/build-pc.py, entrée « apk » du Fond Jarvis) ;
     PC (Suite MAG) : ../fond-jarvis/index.html (mêmes réglages que l'ancien Jarvis : même origine, même stockage).
   L'adresse porte ?mj=1 : la page se sait « écran de Majordome » (FJ.mode = 'mj').
   - Plus d'interface « classique » ni de bascule. Les fenêtres de Majordome (réglages, choix, caméra, tiroir des applis,
     notes, historique…) passent par-dessus le cadre.
   - Un seul menu de réglages : ⚙ de l'écran ouvre les Réglages de Majordome ; leur rubrique « Écran » ouvre les onglets
     de l'écran (panneaux et places, affichage, raccourcis, météo, agenda…), qui ont un bouton « ‹ Réglages » pour revenir.
   - Pas dans Socle (Majordome intégré à l'accueil) ni dans la fenêtre cachée « cerveau » de Suite MAG.exe.
   Canal « mag-visage » (BroadcastChannel, même origine) :
     écran → Majordome : ping, ask {id, text, via}, ecoute, dire {text}, reglages {focus}, menu, action {id}
     Majordome → écran : pong, ack/say/wait/done {id…}, etat {s}, entendu {text, fin}, reglagesEcran {tab}, menu {items} */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._ || !window.BroadcastChannel) return;
  if (window.MJ_DANS_ACCUEIL) return;
  if (/[?&]cerveau=1/.test(location.search)) return;
  var X = MJ._, S = X.S;
  var PC = !!(X.PC || window.MAGPC);
  var SRC = (PC ? '../fond-jarvis/index.html' : 'jarvis/index.html') + '?mj=1';

  var st = document.createElement('style');
  st.textContent =
    '#visage{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:25;background:#03070c;display:block}' +
    'html.visage-on #toast{z-index:45}';
  document.head.appendChild(st);

  var fr = document.createElement('iframe');
  fr.id = 'visage'; fr.title = 'Majordome'; fr.src = SRC;
  fr.setAttribute('allow', 'autoplay; fullscreen; microphone; camera');
  document.body.appendChild(fr);
  document.documentElement.classList.add('visage-on');
  MJ.visage = { actif: function () { return true; }, cadre: fr };

  /* ---------------- canal avec l'écran ---------------- */
  var bc = new BroadcastChannel('mag-visage'), pending = 0, cur = '', taire = false;
  function post(m) { try { bc.postMessage(m); } catch (e) { } }
  var prevAns = MJ.onAnswer;
  MJ.onAnswer = function (o) {
    if (!taire) {
      // boutons de Majordome retirés : on répond à la voix ou au clavier
      var html = String(o.html || '').replace(/<button[\s\S]*?<\/button>/gi, '').replace(/<div class="row">\s*<\/div>/gi, '');
      post({ t: 'say', id: pending > 0 ? cur : '', item: { say: o.say || '', show: o.show || '', html: html, k: o.k || '', cls: o.cls || '', ask: o.ask || '', choices: o.choices || null } });
    }
    if (prevAns) try { prevAns(o); } catch (e) { }
  };

  // menu ☰ de l'écran : les boutons de la barre du haut de Majordome qui sont disponibles ici
  var MENU = [['bHome', 'Lumières'], ['bStores', 'Volets et stores'], ['bLists', 'Notes et listes'], ['bHist', 'Historique'], ['applis', 'Toutes les applis'], ['bHelp', 'Ce que je sais faire'], ['bSet', 'Réglages']];
  function menuItems() {
    return MENU.filter(function (m) {
      if (m[0] === 'applis') return !!(MJ.lanceur && MJ.lanceur.open);
      var b = document.getElementById(m[0]); return b && !b.hidden;
    }).map(function (m) { return { id: m[0], label: m[1] }; });
  }
  function action(id) {
    if (id === 'bSet') return X.settingsSheet();
    if (id === 'applis') {
      if (MJ.lanceur && MJ.lanceur.open) MJ.lanceur.open();
      return;
    }
    if (!MENU.some(function (m) { return m[0] === id; })) return;
    var el = document.getElementById(id); if (el) el.click();
  }

  bc.onmessage = function (e) {
    var m = e.data || {};
    if (m.t === 'ping') return post({ t: 'pong' });
    if (m.t === 'ecoute') { var b = document.getElementById('mic'); if (b) b.click(); return; }
    if (m.t === 'reglages') return X.settingsSheet(m.focus === 'ecran' ? 'ecran' : undefined);
    if (m.t === 'menu') return post({ t: 'menu', items: menuItems() });
    if (m.t === 'action') return action(String(m.id || ''));
    // réponse faite par l'écran lui-même (thème, tâches, lune…) : Majordome la dit, sans la renvoyer
    if (m.t === 'dire') { taire = true; try { X.answer({ say: String(m.text || '') }); } finally { taire = false; } return; }
    if (m.t !== 'ask') return;
    post({ t: 'ack', id: m.id });
    pending++; cur = m.id;
    var fin = function () { pending = Math.max(0, pending - 1); post({ t: 'done', id: m.id, wait: !!MJ.wait }); };
    try { Promise.resolve(MJ.handle(String(m.text || ''), m.via === 'voice' ? 'voice' : 'text')).then(fin, fin); } catch (x) { fin(); }
    setTimeout(function () { if (MJ.wait) post({ t: 'wait', id: m.id }); }, 400);
  };

  /* état de Majordome pour la sphère de l'écran, et ce qu'il entend */
  var lastEtat = '';
  function etat() {
    if (MJ.listening) return 'listen';
    if (X.speaking && X.speaking()) return 'speak';
    var o = MJ.orb && MJ.orb.get && MJ.orb.get();
    return o === 'think' ? 'think' : 'idle';
  }
  setInterval(function () { var s = etat(); if (s !== lastEtat) { lastEtat = s; post({ t: 'etat', s: s }); } }, 180);
  var heard = document.getElementById('heard');
  if (heard && window.MutationObserver) new MutationObserver(function () {
    if (pending > 0) return;   // une demande tapée sur l'écran y est déjà affichée
    var t = (heard.textContent || '').replace(/^«\s*|\s*»$/g, '').trim();
    if (t) post({ t: 'entendu', text: t, fin: !heard.classList.contains('partial') });
  }).observe(heard, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  /* ---------------- Réglages › Écran : les onglets de l'écran ---------------- */
  // les anciennes rubriques « Écran » (cases sous la sphère) et « Visuel et effets » de l'écran classique sont remplacées
  var ONGLETS = [['ecran', 'Panneaux et places', 'Panneaux à afficher, à gauche ou à droite, dans quel ordre, ou à la souris ; effets visuels'],
    ['general', 'Affichage', 'Téléphone, tablette ou PC ; disposition, place des réponses, thème, modèle au centre'],
    ['raccourcis', 'Raccourcis', 'Applis, sites, dossiers et programmes du PC'],
    ['meteo', 'Météo et actualités', 'Ville, titres'],
    ['agenda', 'Agenda', 'Rendez-vous affichés'],
    ['affichage', 'Taille et animations', 'Taille du texte, intensité des effets, images par seconde, économie sur batterie'],
    ['formation', 'Formation', 'Panneau du stage en cours'],
    ['plus', 'Plus', 'Calendrier, tâches, ciel et monde, commandes']];
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () {
    var h = prevExtra ? prevExtra() : '';
    var mien = '<div class="sect" id="f-ecran">Écran</div>' + ONGLETS.map(function (o) {
      return '<div class="set"><div class="t">' + o[1] + '<small>' + o[2] + '</small></div><button class="btn sm" data-vtab="' + o[0] + '">Régler</button></div>';
    }).join('');
    var re = /<div class="sect" id="f-ecran">[\s\S]*?(?=<div class="sect"(?! id="f-effets"))/;
    return re.test(h) ? h.replace(re, mien) : h + mien;
  };
  MJ.settingsBind = function (b) {
    if (prevBind) prevBind(b);
    document.querySelectorAll('[data-vtab]').forEach(function (x) {
      x.onclick = function () { var c = document.getElementById('shX'); if (c) c.click(); post({ t: 'reglagesEcran', tab: x.dataset.vtab }); };
    });
  };
})();
