/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-visage.js : ne pas modifier ici. */
/* Majordome — apparence Jarvis (Réglages › Apparence)
   L'écran d'accueil de Majordome prend l'apparence du Fond Jarvis : sphère, anneaux, fond étoilé, panneaux Horloge,
   Météo, Agenda, Tâches, Ciel, Actualités, raccourcis, bouton Affichage (téléphone, tablette, PC).
   - La page Jarvis est affichée dans un cadre plein écran au-dessus de Majordome :
       appli Android : jarvis/index.html (copie générée par pc/build-pc.py, entrée « apk » du Fond Jarvis) ;
       PC (Suite MAG) : ../fond-jarvis/index.html.
     L'adresse porte ?mj=1 : Jarvis se sait « visage de Majordome » (FJ.mode = 'mj').
   - Majordome reste le cerveau, la voix et le micro : Jarvis lui passe chaque demande par le canal « mag-visage »
     (BroadcastChannel, même origine), Majordome répond avec sa voix et renvoie ses réponses à afficher ; il envoie aussi
     son état (écoute, réponse, réflexion) pour animer la sphère, et ce qu'il entend.
   - Les fenêtres de Majordome (réglages, choix, caméra, tiroir) passent par-dessus le cadre ; le bouton « Majordome »
     de Jarvis montre l'interface classique, le bouton « Jarvis » y ramène.
   - Pas dans Socle (Majordome intégré à l'accueil) : Socle a déjà son interface.
   Messages du canal : Jarvis → Majordome : ping, ask {id, text, via}, ecoute, classique, dire {text} (réponse de Jarvis à dire)
                       Majordome → Jarvis : pong, ack {id}, say {id, item}, wait {id}, done {id, wait}, etat {s}, entendu {text, fin} */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._ || !window.BroadcastChannel) return;
  if (window.MJ_DANS_ACCUEIL) return;
  if (/[?&]cerveau=1/.test(location.search)) return;   // Suite MAG.exe : fenêtre cachée « cerveau » du fond d'écran, sans écran
  var X = MJ._, S = X.S;
  if (S.apparence == null) S.apparence = 'jarvis';
  var PC = !!(X.PC || window.MAGPC);
  var SRC = (PC ? '../fond-jarvis/index.html' : 'jarvis/index.html') + '?mj=1';

  var st = document.createElement('style');
  st.textContent =
    '#visage{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:25;background:#03070c;display:block}' +
    '#visage[hidden]{display:none}' +
    'html.visage-on #toast{z-index:45}' +
    '#visRet{position:fixed;right:calc(12px + env(safe-area-inset-right,0px));bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:24;' +
    'display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:22px;background:#071520e6;border:1px solid #46d9c27a;color:#bff7ee;' +
    'font:700 12px/1 ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;box-shadow:0 0 18px #46d9c233}' +
    '#visRet svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8}';
  document.head.appendChild(st);

  var fr = null, ret = null;
  function ensure() {
    if (fr) return fr;
    fr = document.createElement('iframe');
    fr.id = 'visage'; fr.title = 'Majordome – apparence Jarvis'; fr.src = SRC;
    fr.setAttribute('allow', 'autoplay; fullscreen');
    document.body.appendChild(fr);
    return fr;
  }
  function retour() {
    if (ret) return ret;
    ret = document.createElement('button');
    ret.id = 'visRet'; ret.type = 'button'; ret.title = 'Revenir à l\'écran Jarvis';
    ret.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(-60 12 12)"/></svg>Jarvis';
    ret.onclick = function () { show(true); };
    document.body.appendChild(ret);
    return ret;
  }
  var on = false;
  function show(v) {
    on = !!v && S.apparence === 'jarvis';
    if (on) ensure().hidden = false; else if (fr) fr.hidden = true;
    document.documentElement.classList.toggle('visage-on', on);
    retour().hidden = on || S.apparence !== 'jarvis';
    if (on) { lastEtat = ''; envoyerEtat(); }
  }
  MJ.visage = { show: show, actif: function () { return on; } };

  /* ---------------- canal avec Jarvis ---------------- */
  var bc = new BroadcastChannel('mag-visage'), pending = 0, cur = '', taire = false;
  function post(m) { try { bc.postMessage(m); } catch (e) { } }
  var prevAns = MJ.onAnswer;
  MJ.onAnswer = function (o) {
    if (on && !taire) {
      // boutons de Majordome retirés : on répond à Jarvis à la voix ou au clavier
      var html = String(o.html || '').replace(/<button[\s\S]*?<\/button>/gi, '').replace(/<div class="row">\s*<\/div>/gi, '');
      post({ t: 'say', id: pending > 0 ? cur : '', item: { say: o.say || '', show: o.show || '', html: html, k: o.k || '', cls: o.cls || '', ask: o.ask || '', choices: o.choices || null } });
    }
    if (prevAns) try { prevAns(o); } catch (e) { }
  };
  bc.onmessage = function (e) {
    var m = e.data || {};
    if (m.t === 'ping') return post({ t: 'pong' });
    if (m.t === 'ecoute') { var b = document.getElementById('mic'); if (b) b.click(); return; }
    if (m.t === 'classique') return show(false);
    // réponse faite par Jarvis lui-même (thème, tâches, lune…) : Majordome la dit, sans la renvoyer à Jarvis
    if (m.t === 'dire') { taire = true; try { X.answer({ say: String(m.text || '') }); } finally { taire = false; } return; }
    if (m.t !== 'ask') return;
    post({ t: 'ack', id: m.id });
    pending++; cur = m.id;
    var fin = function () { pending = Math.max(0, pending - 1); post({ t: 'done', id: m.id, wait: !!MJ.wait }); };
    try { Promise.resolve(MJ.handle(String(m.text || ''), m.via === 'voice' ? 'voice' : 'text')).then(fin, fin); } catch (x) { fin(); }
    setTimeout(function () { if (MJ.wait) post({ t: 'wait', id: m.id }); }, 400);
  };

  /* état de Majordome pour la sphère de Jarvis, et ce qu'il entend */
  var lastEtat = '';
  function etat() {
    if (MJ.listening) return 'listen';
    if (X.speaking && X.speaking()) return 'speak';
    var o = MJ.orb && MJ.orb.get && MJ.orb.get();
    return o === 'think' ? 'think' : 'idle';
  }
  function envoyerEtat() { var s = etat(); if (s !== lastEtat) { lastEtat = s; post({ t: 'etat', s: s }); } }
  setInterval(function () { if (on) envoyerEtat(); }, 180);
  var heard = document.getElementById('heard');
  if (heard && window.MutationObserver) new MutationObserver(function () {
    if (!on || pending > 0) return;   // une demande tapée dans Jarvis y est déjà affichée
    var t = (heard.textContent || '').replace(/^«\s*|\s*»$/g, '').trim();
    if (t) post({ t: 'entendu', text: t, fin: !heard.classList.contains('partial') });
  }).observe(heard, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  /* ---------------- Réglages › Apparence ---------------- */
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () {
    var h = prevExtra ? prevExtra() : '';
    return h + '<div class="sect" id="f-apparence">Apparence</div>' +
      '<div class="set"><div class="t">Écran d\'accueil<small>Jarvis : sphère, fond étoilé, horloge, météo, agenda, tâches, ciel et actualités, comme le fond d\'écran du PC. Classique : l\'écran habituel de Majordome.</small></div>' +
      '<select class="in" id="mjvApp" style="width:auto">' + [['jarvis', 'Jarvis'], ['classique', 'Classique']].map(function (o) { return '<option value="' + o[0] + '"' + (S.apparence === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<p class="note">Dans l\'écran Jarvis : touchez la sphère ou le micro pour parler, écrivez dans la barre, le bouton « Majordome » ramène ici, le bouton « Jarvis » y retourne. Le bouton Affichage (à côté de ⚙) choisit Téléphone, Tablette ou PC.</p>';
  };
  MJ.settingsBind = function (b) {
    if (prevBind) prevBind(b);
    var a = document.getElementById('mjvApp');
    if (a) a.onchange = function () { S.apparence = this.value; X.saveS(); show(S.apparence === 'jarvis'); X.toast(S.apparence === 'jarvis' ? 'Apparence Jarvis' : 'Apparence classique'); };
  };

  // à l'ouverture : écran Jarvis (si choisi), une fois Majordome prêt
  setTimeout(function () { show(S.apparence === 'jarvis'); }, 60);
})();
