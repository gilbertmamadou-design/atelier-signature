/* =====================================================================
   Majordome › Jarvis+ : mémoire, mode nuit, profils, lecture de l'écran, interruption, Home Assistant
   (idées reprises des assistants « Jarvis » libres publiés sur GitHub, adaptées à Majordome, hors ligne)

   Mémoire personnelle (sur l'appareil, clé « majordome:memoire ») :
     « retiens que le code du portail est 1234 », « souviens-toi que la perceuse est dans le garage »,
     « où est la perceuse ? », « quel est le code du portail ? », « qu'est-ce que tu sais sur Paul ? »,
     « qu'est-ce que tu as retenu ? », « oublie le code du portail ».
     (« note que… » reste une note du Carnet.)
   Mode nuit : après « bonne nuit » (ou « mode nuit »), voix plus douce, écran noir avec l'heure, pas d'annonce
     spontanée (présence, pause) ; fin à « bonjour », « fin du mode nuit », ou à l'heure réglée (7 h par défaut).
   Profils : « passe en mode chantier / travail / maison », « quel profil ? » : volume, débit de la voix, bips,
     présence et gestes de la caméra, annonce des messages (chantier : lus à voix haute, maison : rien) ; chaque profil garde ses propres réglages.
   Lecture de l'écran (PC) : « lis l'écran », « qu'est-ce qu'il y a à l'écran ? » : vous choisissez l'écran ou la
     fenêtre (le navigateur le demande à chaque fois), une seule image est lue par le moteur hors ligne de la Suite.
   Interruption : pendant qu'il parle, dire son nom l'arrête et il vous écoute (écoute continue activée).
   Home Assistant (facultatif) : adresse https et jeton d'accès longue durée dans les réglages ; « allume la lampe
     du salon », « ferme le volet de la cuisine », « quelle est la température du salon » utilisent alors les
     appareils de Home Assistant dont le nom correspond (sinon les commandes habituelles : Hue, Somfy…).
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, S = X.S, esc = X.esc;
  var NLU = window.MJNLU;
  var PCAPI = window.MAGPC || null;

  function norm(s) { return X.deacc(String(s || '').toLowerCase()).replace(/[’']/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  var STOP = { le: 1, la: 1, les: 1, l: 1, un: 1, une: 1, des: 1, de: 1, du: 1, d: 1, a: 1, au: 1, aux: 1, et: 1, est: 1, sont: 1, mon: 1, ma: 1, mes: 1, ton: 1, ta: 1, tes: 1, son: 1, sa: 1, ses: 1, notre: 1, nos: 1, votre: 1, vos: 1, que: 1, qu: 1, qui: 1, quoi: 1, ou: 1, quel: 1, quelle: 1, quels: 1, quelles: 1, ce: 1, cet: 1, cette: 1, ces: 1, c: 1, j: 1, je: 1, tu: 1, il: 1, elle: 1, on: 1, nous: 1, vous: 1, y: 1, en: 1, dans: 1, sur: 1, sous: 1, pour: 1, par: 1, avec: 1, chez: 1, ai: 1, as: 1, a: 1, avons: 1, avez: 1, ont: 1, mis: 1, mise: 1, range: 1, rangee: 1, sais: 1, souviens: 1, rappelle: 1, moi: 1, toi: 1, se: 1, s: 1, n: 1, pas: 1, ne: 1, plus: 1, tout: 1, bien: 1, alors: 1, donc: 1 };
  function keys(s) { return norm(s).split(' ').filter(function (w) { return w && !STOP[w] && w.length > 1; }).map(function (w) { return w.length > 4 ? w.replace(/s$/, '') : w; }); }
  function sayFirst(t) {
    // « je », « mon » → « vous », « votre » : la phrase est redite à la personne
    return String(t).replace(/\bj'ai\b/gi, 'vous avez').replace(/\bje suis\b/gi, 'vous êtes').replace(/\bj'/gi, 'vous ').replace(/\bje\b/gi, 'vous')
      .replace(/\bmon\b/gi, 'votre').replace(/\bma\b/gi, 'votre').replace(/\bmes\b/gi, 'vos').replace(/\bmoi\b/gi, 'vous').replace(/\bme\b/gi, 'vous').replace(/\bm'/gi, 'vous ');
  }

  /* =========================== 1. Mémoire personnelle =========================== */
  var MKEY = 'majordome:memoire', MMAX = 500;
  function mLoad() { try { var l = JSON.parse(localStorage.getItem(MKEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function mSave(l) { try { localStorage.setItem(MKEY, JSON.stringify(l.slice(-MMAX))); } catch (e) { } }
  function mFind(q, min) {
    var qk = keys(q); if (!qk.length) return [];
    return mLoad().map(function (f) {
      var fk = keys(f.t), hit = 0;
      qk.forEach(function (k) { if (fk.some(function (w) { return w === k || (k.length > 4 && (w.indexOf(k) === 0 || k.indexOf(w) === 0) && Math.min(w.length, k.length) > 4); })) hit++; });
      return { f: f, s: hit / qk.length, n: hit };
    }).filter(function (x) { return x.n && x.s >= (min || 0.5); }).sort(function (a, b) { return b.s - a.s || b.f.at - a.f.at; });
  }
  function mAdd(t) {
    t = String(t || '').trim().replace(/[.!]+$/, ''); if (!t) return null;
    var l = mLoad(), k = keys(t).join(' ');
    // même sujet déjà retenu (« le code du portail est… ») : remplacé par la nouvelle version
    var subj = keys(t.split(/\s(?:est|sont|c'est|se trouve|se trouvent|a|ont|vaut|=)\s/i)[0] || t).join(' ');
    l = l.filter(function (f) { var fs = keys(String(f.t).split(/\s(?:est|sont|c'est|se trouve|se trouvent|a|ont|vaut|=)\s/i)[0] || f.t).join(' '); return !(subj && fs === subj) && keys(f.t).join(' ') !== k; });
    var f = { id: X.uid(), at: Date.now(), t: t }; l.push(f); mSave(l); return f;
  }
  function mParse(t) {
    var m;
    if ((m = /^(?:(?:est ce que tu peux|tu peux|peux tu) )?(?:retiens|retient|retenir|souviens toi|souviens toi bien|rappelle toi|memorise|memoriser|n oublie pas|garde en memoire|enregistre dans ta memoire|mets dans ta memoire)(?: bien)? (?:que |qu )(.+)$/.exec(t)) && !/\b(quand je dis|si je dis|lorsque je dis)\b/.test(t))
      return { act: 'add', raw: true };
    if (/^(?:qu est ce que tu as retenu|que sais tu de moi|qu est ce que tu sais de moi|ta memoire|montre(?: moi)? ta memoire|qu est ce que tu te rappelles|de quoi tu te souviens|liste (?:de )?(?:ta |la )?memoire)$/.test(t)) return { act: 'list' };
    if ((m = /^(?:oublie|oublier|efface|effacer|supprime|supprimer)(?: de ta memoire)?(?: ce que je t ai dit sur| ce que tu sais sur)? (.+?)(?: de ta memoire)?$/.exec(t)) && !/^(?:tout|la liste|le minuteur|les minuteurs|le reveil|les reveils|le rappel|les rappels|le carnet|les notes?)\b/.test(m[1])) return { act: 'del', q: m[1] };
    if (/^(?:vide|efface|oublie) (?:toute )?ta memoire$|^oublie tout ce que (?:je t ai dit|tu sais)$/.test(t)) return { act: 'clear' };
    if ((m = /^(?:ou (?:est|sont|se trouve|se trouvent|ai je (?:mis|range|laisse|pose)|j ai (?:mis|range|laisse|pose)|est ce que j ai (?:mis|range))|tu te souviens (?:de|du|des|d)|tu te rappelles (?:de|du|des|d)|qu est ce que tu sais (?:sur|de|du|des|d)|que sais tu (?:sur|de|du|des|d)|rappelle moi(?= (?:le|la|les|l|mon|ma|mes|ou|quel|quelle|qui) )|c est quoi deja|quel(?:le)?s? (?:est|sont|etait|etaient) deja) (.+)$/.exec(t))) return { act: 'ask', q: m[1], strong: true };
    if ((m = /^(?:quel(?:le)?s? (?:est|sont)|c est quoi|qui a|a qui (?:j ai|ai je) prete|combien|quand (?:est|a lieu))(.+)$/.exec(t))) return { act: 'ask', q: m[1] || t, strong: false };
    return null;
  }
  function mAnswer(p, raw) {
    if (p.act === 'add') {
      var txt = String(raw || '').replace(/^.*?\b(?:que|qu')\s*/i, '');
      var f = mAdd(txt);
      return X.answer({ say: f ? 'C\'est noté : ' + sayFirst(f.t) + '.' : 'Je n\'ai pas compris quoi retenir.', k: 'Mémoire' }).done;
    }
    if (p.act === 'export') { var okx = mExport(); return X.answer(okx ? (X.ANDROID ? 'Choisissez où envoyer ma mémoire, par exemple vers votre PC.' : 'Voici ma mémoire dans un fichier : ouvrez-le dans Majordome sur l\'autre appareil, Réglages, Mémoire, Recevoir.') : 'Ma mémoire est vide.').done; }
    if (p.act === 'list') {
      var l = mLoad().slice(-8).reverse();
      if (!l.length) return X.answer({ say: 'Je n\'ai encore rien retenu. Dites par exemple : retiens que le code du portail est 1234.', k: 'Mémoire' }).done;
      return X.answer({ say: 'Je retiens ' + mLoad().length + ' chose' + (mLoad().length > 1 ? 's' : '') + '. Les dernières : ' + l.slice(0, 3).map(function (f) { return sayFirst(f.t); }).join(' ; ') + '.', k: 'Mémoire',
        html: '<ul>' + l.map(function (f) { return '<li>' + esc(f.t) + '</li>'; }).join('') + '</ul>' }).done;
    }
    if (p.act === 'clear') {
      return X.ask('Effacer tout ce que j\'ai retenu ?', 'yesno', { danger: true, yes: 'Tout effacer' }).then(function (ok) { if (ok) mSave([]); return X.answer(ok ? 'Ma mémoire est vide.' : 'Je garde tout.').done; });
    }
    if (p.act === 'del') {
      var hit = mFind(p.q, 0.5);
      if (!hit.length) return X.answer({ say: 'Je n\'avais rien retenu sur ' + p.q + '.', k: 'Mémoire' }).done;
      var gone = hit[0].f; mSave(mLoad().filter(function (f) { return f.id !== gone.id; }));
      return X.answer({ say: 'J\'ai oublié : ' + sayFirst(gone.t) + '.', k: 'Mémoire' }).done;
    }
    var h = mFind(p.q, p.strong ? 0.5 : 0.75), rl = rappelsLies(p.q);
    if (!h.length && rl.length) return X.answer({ say: 'Je n\'ai rien retenu là-dessus, mais un rappel est prévu ' + quand(rl[0].at) + ' : ' + rl[0].text + '.', k: 'Mémoire' }).done;
    if (h.length && rl.length) { var b0 = h[0].f; return X.answer({ say: 'Vous m\'avez dit : ' + sayFirst(b0.t) + '. Et un rappel est prévu ' + quand(rl[0].at) + ' : ' + rl[0].text + '.', k: 'Mémoire' }).done; }
    if (!h.length) return X.answer({ say: 'Je ne m\'en souviens pas : vous ne me l\'avez pas dit. Dites par exemple : retiens que ' + p.q + ' est…', k: 'Mémoire' }).done;
    var best = h.slice(0, 3).map(function (x) { return x.f; });
    return X.answer({ say: 'Vous m\'avez dit : ' + sayFirst(best[0].t) + '.', k: 'Mémoire', html: best.length > 1 ? '<ul>' + best.map(function (f) { return '<li>' + esc(f.t) + ' <small>(' + new Date(f.at).toLocaleDateString('fr-FR') + ')</small></li>'; }).join('') + '</ul>' : null }).done;
  }
  H.memoire = function (p, r) { return mAnswer(p, r && r.raw); };

  /* =========================== 2. Mode nuit =========================== */
  S.nuit = Object.assign({ on: false, fin: 7, vol: 0.45, ecran: true, auto: true, vol0: null }, S.nuit || {});
  MJ.nuit = !!S.nuit.on;
  var nuitEl = null, nuitT = 0;
  function nuitOverlay(on) {
    if (on && S.nuit.ecran && !nuitEl) {
      nuitEl = document.createElement('div'); nuitEl.className = 'jv-nuit';
      nuitEl.innerHTML = '<div class="jv-h"></div><div class="jv-s">Mode nuit · touchez pour afficher Majordome</div>';
      nuitEl.onclick = function () { nuitEl.classList.remove('on'); setTimeout(function () { if (MJ.nuit && nuitEl) nuitEl.classList.add('on'); }, 30000); };
      document.body.appendChild(nuitEl);
      var paint = function () { if (nuitEl) nuitEl.querySelector('.jv-h').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
      paint(); nuitT = setInterval(paint, 20000);
      requestAnimationFrame(function () { if (nuitEl) nuitEl.classList.add('on'); });
    } else if (!on && nuitEl) { clearInterval(nuitT); var e = nuitEl; nuitEl = null; e.classList.remove('on'); setTimeout(function () { e.remove(); }, 600); }
  }
  function nuit(on, quiet) {
    if (on === !!S.nuit.on) { nuitOverlay(on); return; }
    S.nuit.on = on; MJ.nuit = on;
    if (on) { S.nuit.vol0 = S.volume || 1; S.volume = Math.min(S.volume || 1, S.nuit.vol); S.nuit.since = Date.now(); }
    else if (S.nuit.vol0 != null) { S.volume = S.nuit.vol0; S.nuit.vol0 = null; }
    X.saveS(); nuitOverlay(on);
    if (!quiet) X.answer({ say: on ? 'Mode nuit. Je parle doucement et je reste discret jusqu\'à ' + S.nuit.fin + ' heures.' : 'Fin du mode nuit.', k: 'Mode nuit' });
  }
  setInterval(function () {
    if (!S.nuit.on || !S.nuit.auto) return;
    var d = new Date(), since = S.nuit.since || 0;
    if (d.getHours() === +S.nuit.fin && Date.now() - since > 3600000) { nuit(false, true); S.nuit.brief = true; X.saveS(); }   // résumé du matin au premier passage
  }, 60000);
  if (S.nuit.on) setTimeout(function () { nuitOverlay(true); }, 800);
  H.nuit = function (p) { nuit(!!p.on); return Promise.resolve(); };

  /* =========================== 3. Profils =========================== */
  var PROFILS = {
    maison: { name: 'Maison', d: { volume: 0.9, rate: 1, beeps: true, presence: false, gestes: false, msg: 'off' } },
    travail: { name: 'Travail', d: { volume: 0.6, rate: 1.05, beeps: false, presence: false, gestes: false, msg: 'qui' } },
    chantier: { name: 'Chantier', d: { volume: 1, rate: 1, beeps: true, presence: false, gestes: true, msg: 'texte' } }
  };
  S.profils = Object.assign({ cur: '', saved: {} }, S.profils || {});
  // msg : annonce des nouveaux messages (mj-messages.js) : off | qui | texte ; chantier : lus à voix haute, maison : silence
  function snap() { var o = S.oeil || {}; return { volume: S.volume, rate: S.rate, beeps: S.beeps, presence: !!o.presence, gestes: !!o.gestes, msg: S.msgAnnonce || 'off' }; }
  function applyP(v) {
    if (v.volume != null) S.volume = v.volume; if (v.rate != null) S.rate = v.rate; if (v.beeps != null) S.beeps = v.beeps;
    if (S.oeil) { S.oeil.presence = !!v.presence; S.oeil.gestes = !!v.gestes; }
    if (v.msg) S.msgAnnonce = v.msg;
    X.saveS(); if (MJ.oeil && MJ.oeil.refresh) MJ.oeil.refresh(true);
  }
  function profil(id, auto) {
    var P = PROFILS[id]; if (!P) return X.answer('Je ne connais que les profils Maison, Travail et Chantier.').done;
    if (!auto) S.pauto.manualAt = Date.now();   // choisi à la main : le profil automatique attend 3 h
    if (S.nuit.on) nuit(false, true);
    if (S.profils.cur) S.profils.saved[S.profils.cur] = snap();
    var v = Object.assign({}, P.d, S.profils.saved[id] || {});   // un profil enregistré avant l'annonce des messages la reçoit de P.d
    S.profils.cur = id; applyP(v);
    if (auto) { X.saveS(); return Promise.resolve(); }
    var det = { maison: 'Voix normale.', travail: 'Voix plus douce et un peu plus rapide, sans bips.', chantier: 'Voix forte, et commande par gestes devant la caméra pour les mains occupées.' }[id];
    var ann = { off: 'Je ne lis plus les messages qui arrivent.', qui: 'Je vous dis qui vous écrit.', texte: 'Je vous lis les messages qui arrivent.' }[S.msgAnnonce];
    if (ann) det += ' ' + ann;
    return X.answer({ say: 'Profil ' + P.name + '. ' + det, k: 'Profil' }).done;
  }
  H.profil = function (p) {
    if (p.act === 'which') return X.answer(S.profils.cur ? 'Profil ' + PROFILS[S.profils.cur].name + '.' : 'Aucun profil choisi : réglages personnels.').done;
    return profil(p.id);
  };

  /* =========================== 4. Lecture de l'écran (PC) =========================== */
  function lireEcran() {
    var ocr = PCAPI && PCAPI.ocr && PCAPI.ocr.supported && PCAPI.ocr.supported();
    var MD = navigator.mediaDevices;
    if (!ocr || !MD || !MD.getDisplayMedia) return X.answer('La lecture de l\'écran marche dans la version PC de Majordome, avec Edge ou Chrome.').done;
    X.answer({ say: 'Choisissez l\'écran ou la fenêtre à lire.', k: 'Écran' });
    return MD.getDisplayMedia({ video: { cursor: 'never' }, audio: false }).then(function (s) {
      var v = document.createElement('video'); v.muted = true; v.srcObject = s;
      return v.play().catch(function () { }).then(function () {
        return new Promise(function (ok) { var t0 = Date.now(); (function w() { if (v.videoWidth || Date.now() - t0 > 3000) return ok(); setTimeout(w, 80); })(); });
      }).then(function () { return new Promise(function (ok) { setTimeout(ok, 350); }); }).then(function () {
        var c = document.createElement('canvas'), k = Math.min(1, 2600 / (v.videoWidth || 1));
        c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        s.getTracks().forEach(function (t) { t.stop(); }); v.srcObject = null;
        return new Promise(function (ok, ko) { c.toBlob(function (b) { if (b) ok(b); else ko(new Error('capture vide')); }, 'image/png'); });
      }, function (e) { s.getTracks().forEach(function (t) { t.stop(); }); throw e; });
    }).then(function (b) {
      X.answer({ say: 'Je lis…', k: 'Écran' });
      return PCAPI.ocr.recognize(b, { lang: 'fra' });
    }).then(function (r) {
      var txt = String(r && r.text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (txt.replace(/\W/g, '').length < 4) return X.answer('Je ne trouve pas de texte lisible sur cet écran.').done;
      var said = txt.replace(/\s*\n\s*/g, '. ').replace(/\.\s*\./g, '.');
      if (said.length > 700) said = said.slice(0, 700).replace(/\s\S*$/, '') + '… La suite est affichée.';
      var c = X.answer({ say: said, k: 'Écran', html: '<div class="jv-txt"></div><div class="row"><button class="btn sm" data-jv="copy">Copier le texte</button></div>' });
      c.querySelector('.jv-txt').textContent = txt;
      c.addEventListener('click', function (e) { if (e.target.closest('[data-jv="copy"]') && navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { X.toast('Texte copié'); }); });
      return c.done;
    }).catch(function (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return X.answer('Lecture de l\'écran annulée.').done;
      return X.errorReply('Lecture de l\'écran impossible : ' + (e && e.message || e) + '.').done;
    });
  }
  H.ecran_lire = function () { return lireEcran(); };

  /* =========================== 5. Interruption par le nom =========================== */
  S.barge = S.barge !== false;
  function bargeApply() { try { if (X.B && X.B.barge) X.B.barge(!!S.barge); } catch (e) { } }
  bargeApply();
  var prevEvt = window.majordomeEvent;
  window.majordomeEvent = function (type, data) {
    if (type === 'barge') {
      var d = {}; try { d = JSON.parse(data) || {}; } catch (e) { }
      if (!S.barge || !(X.speaking && X.speaking())) return;
      // le nom prononcé par Majordome lui-même (écho) ne compte pas
      var said = norm(MJ.last && MJ.last.a), w = norm(d.word || '');
      if (w && said.indexOf(w) >= 0) return;
      try { X.exec({ intent: 'stop', p: {} }); } catch (e) { }
      setTimeout(function () { MJ.voiceTurn = true; try { X.exec({ intent: 'wake', p: {} }); } catch (e) { } }, 250);
      return;
    }
    return prevEvt ? prevEvt.apply(this, arguments) : undefined;
  };

  /* =========================== 6. Home Assistant =========================== */
  var HAK = 'majordome:ha';
  function haCfg() { try { return JSON.parse(localStorage.getItem(HAK) || '{}') || {}; } catch (e) { return {}; } }
  function haSet(o) { try { localStorage.setItem(HAK, JSON.stringify(o)); } catch (e) { } }
  var haStates = [], haAt = 0;
  function haOn() { var c = haCfg(); return !!(c.url && c.token); }
  function haReq(path, body) {
    var c = haCfg(); if (!c.url || !c.token) return Promise.reject(new Error('Home Assistant non configuré'));
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(c.url.replace(/\/+$/, '') + '/api/' + path, {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined, credentials: 'omit', cache: 'no-store'
    }).then(function (r) { clearTimeout(to); if (r.status === 401) throw new Error('jeton refusé'); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
      function (e) { clearTimeout(to); throw new Error(e && e.name === 'AbortError' ? 'pas de réponse' : 'injoignable (adresse https et autorisation CORS à vérifier)'); });
  }
  function haLoad(force) {
    if (!haOn()) return Promise.resolve([]);
    if (!force && haStates.length && Date.now() - haAt < 5 * 60000) return Promise.resolve(haStates);
    return haReq('states').then(function (l) { haStates = (l || []).filter(function (s) { return s && s.entity_id; }); haAt = Date.now(); return haStates; });
  }
  var DOM_ACT = /^(light|switch|fan|input_boolean|media_player|cover|lock|scene|script|climate|vacuum|humidifier|sensor|binary_sensor)\./;
  function haName(s) { return (s.attributes && s.attributes.friendly_name) || s.entity_id.split('.')[1].replace(/_/g, ' '); }
  function haLow(s) { var n = haName(s); return /^[A-ZÀ-Ý][a-zà-ÿ]/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n; }   // « J'allume lampe du salon »
  function haMatch(q, filter) {
    var qk = keys(q); if (!qk.length) return null;
    var best = null;
    haStates.forEach(function (s) {
      if (!DOM_ACT.test(s.entity_id) || (filter && !filter(s))) return;
      var nk = keys(haName(s) + ' ' + s.entity_id.split('.')[1].replace(/_/g, ' ')), hit = 0;
      qk.forEach(function (k) { if (nk.indexOf(k) >= 0) hit++; });
      var sc = hit / qk.length;
      if (hit && sc >= 0.67 && (!best || sc > best.sc || (sc === best.sc && nk.length < best.n))) best = { s: s, sc: sc, n: nk.length };
    });
    return best && best.s;
  }
  function haDo(s, act) {
    var dom = s.entity_id.split('.')[0], svc;
    if (dom === 'cover') svc = act === 'on' || act === 'open' ? 'open_cover' : act === 'stop' ? 'stop_cover' : 'close_cover';
    else if (dom === 'lock') svc = act === 'on' || act === 'open' ? 'unlock' : 'lock';
    else if (dom === 'scene' || dom === 'script') svc = 'turn_on';
    else if (dom === 'vacuum') svc = act === 'on' || act === 'open' ? 'start' : 'return_to_base';
    else svc = act === 'on' || act === 'open' ? 'turn_on' : 'turn_off';
    return haReq('services/' + dom + '/' + svc, { entity_id: s.entity_id }).then(function () {
      var verb = { open_cover: 'J\'ouvre', close_cover: 'Je ferme', stop_cover: 'J\'arrête', unlock: 'Je déverrouille', lock: 'Je verrouille', turn_on: dom === 'scene' || dom === 'script' ? 'Je lance' : 'J\'allume', turn_off: 'J\'éteins', start: 'Je lance', return_to_base: 'Je renvoie à sa base' }[svc];
      if (svc === 'turn_on' && /^(switch|input_boolean|climate|fan|humidifier|media_player)$/.test(dom)) verb = 'J\'active';
      if (svc === 'turn_off' && /^(switch|input_boolean|climate|fan|humidifier|media_player)$/.test(dom)) verb = 'Je coupe';
      return X.answer({ say: verb + ' ' + haLow(s) + '.', k: 'Home Assistant' }).done;
    }, function (e) { return X.errorReply('Home Assistant : ' + e.message + '.').done; });
  }
  function haEtat(s) {
    var u = (s.attributes && s.attributes.unit_of_measurement) || '', v = s.state;
    var fr = { on: 'allumé', off: 'éteint', open: 'ouvert', closed: 'fermé', locked: 'verrouillé', unlocked: 'déverrouillé', unavailable: 'indisponible', home: 'à la maison', not_home: 'absent', heat: 'en chauffe', cool: 'en froid' }[v] || v;
    var num = /^-?\d+(\.\d+)?$/.test(v) ? String(Math.round(+v * 10) / 10).replace('.', ',') : null;
    return X.answer({ say: haName(s) + ' : ' + (num ? num + (u === '°C' ? ' degrés' : u === '%' ? ' pour cent' : ' ' + u) : fr) + '.', k: 'Home Assistant' }).done;
  }
  // les commandes habituelles passent d'abord par Home Assistant quand un appareil y porte ce nom
  function wrap(intent, fn) {
    var prev = H[intent];
    H[intent] = function (p, r) {
      if (!haOn()) return prev ? prev(p, r) : X.answer('Je ne sais pas encore faire ça.').done;
      return haLoad().then(function () {
        var res = fn(p || {}, r); if (res) return res;
        // aucun appareil de ce nom : la phrase entière est confiée à l'assistant de Home Assistant, puis aux commandes habituelles
        var q = String(r && r.raw || '').trim();
        return (q ? haConv(q).catch(function () { return null; }) : Promise.resolve(null)).then(function (said) {
          if (said) return X.answer({ say: said, k: 'Home Assistant' }).done;
          return prev ? prev(p, r) : X.answer('Je ne trouve pas cet appareil.').done;
        });
      },
        function () { return prev ? prev(p, r) : X.errorReply('Home Assistant injoignable.').done; });
    };
  }
  wrap('light', function (p) {
    if (p.all || !(p.full || p.target)) return null;
    var s = haMatch(p.full || p.target, function (x) { return /^(light|switch|fan|input_boolean|media_player|scene|script|humidifier)\./.test(x.entity_id); }); if (!s) return null;
    return haDo(s, p.act === 'off' ? 'off' : 'on');
  });
  wrap('shutter', function (p) {
    if (p.all || !p.target || p.pos != null || p.at) return null;
    var s = haMatch((p.kind || '') + ' ' + p.target, function (x) { return /^cover\./.test(x.entity_id); }) || haMatch(p.target, function (x) { return /^cover\./.test(x.entity_id); });
    if (!s) return null;
    return haDo(s, p.act === 'open' ? 'open' : p.act === 'stop' ? 'stop' : 'close');
  });
  wrap('weather', function (p, r) {
    var t = norm(r && r.t || ''); if (!/\b(temperature|humidite|degres?|fait il)\b/.test(t) || !p.city) return null;
    var what = /humidite/.test(t) ? 'humidite' : 'temperature';
    var s = haMatch(what + ' ' + p.city, function (x) { return /^sensor\./.test(x.entity_id); }) || haMatch(p.city, function (x) { return /^sensor\./.test(x.entity_id) && ((x.attributes || {}).device_class === what.replace('humidite', 'humidity')); });
    return s ? haEtat(s) : null;
  });
  H.ha = function (p) {
    if (!haOn()) return X.answer('Home Assistant n\'est pas configuré : Réglages › Home Assistant.').done;
    return haLoad(true).then(function () {
      var s = haMatch(p.q, p.act === 'etat' ? null : function (x) { return !/^(sensor|binary_sensor)\./.test(x.entity_id); });
      if (!s) return X.answer('Je ne trouve pas « ' + p.q + ' » dans Home Assistant.').done;
      return p.act === 'etat' ? haEtat(s) : haDo(s, p.act);
    }, function (e) { return X.errorReply('Home Assistant : ' + e.message + '.').done; });
  };

  /* =========================== 7. Couleur =========================== */
  var COULEURS = { cyan: ['Cyan', '#46d9c2', '#2bb8a3'], bleu: ['Bleu', '#4a9bff', '#2f7be0'], violet: ['Violet', '#a084ff', '#7f62e6'], vert: ['Vert', '#55e07f', '#35b85f'],
    ambre: ['Ambre', '#ffb547', '#e0952a'], rouge: ['Rouge', '#ff6464', '#e04646'], blanc: ['Blanc', '#dfe9f5', '#b8c8db'] };
  S.couleur = COULEURS[S.couleur] ? S.couleur : 'cyan';
  function couleur(c) {
    if (!COULEURS[c]) c = 'cyan';
    S.couleur = c;
    try { if (window.MJOrb && window.MJOrb.theme) window.MJOrb.theme(c); } catch (e) { }
    var r = document.documentElement.style, k = COULEURS[c];
    if (c === 'cyan') ['--acc', '--acc2', '--line', '--line2'].forEach(function (v) { r.removeProperty(v); });
    else { r.setProperty('--acc', k[1]); r.setProperty('--acc2', k[2]); r.setProperty('--line', k[1] + '1f'); r.setProperty('--line2', k[1] + '3d'); }
    try { if (MJ.fx && MJ.fx.couleur) MJ.fx.couleur(); } catch (e) { }
  }
  couleur(S.couleur);
  H.couleur = function (p) {
    if (!COULEURS[p.c]) return X.answer('Couleurs possibles : cyan, bleu, violet, vert, ambre, rouge ou blanc.').done;
    couleur(p.c); X.saveS();
    return X.answer({ say: 'Voilà, je suis en ' + COULEURS[p.c][0].toLowerCase() + '.', k: 'Apparence' }).done;
  };

  /* =========================== 8. Mémoire partagée entre appareils =========================== */
  function mExport() {
    var l = mLoad(); if (!l.length) { X.toast('Mémoire vide : rien à envoyer'); return false; }
    var txt = JSON.stringify({ majordome: 'memoire', v: 1, at: Date.now(), faits: l });
    var name = 'Majordome mémoire ' + new Date().toLocaleDateString('fr-FR').replace(/\//g, '-') + '.json';
    if (X.B && X.B.shareText && X.ANDROID) { X.B.shareText('Mémoire de Majordome', txt); return true; }
    var blob = new Blob([txt], { type: 'application/json' });
    if (PCAPI && PCAPI.fs && PCAPI.fs.saveAs) { PCAPI.fs.saveAs(blob, name, { types: [{ description: 'Mémoire Majordome', accept: { 'application/json': ['.json'] } }] }).then(function (r) { if (r && r.ok) X.toast('Mémoire enregistrée'); }, function () { }); return true; }
    var a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
    return true;
  }
  /** fusionne une mémoire reçue : les faits les plus récents gagnent sur le même sujet */
  function mImport(txt) {
    var o; try { o = JSON.parse(String(txt || '').trim()); } catch (e) { return -1; }
    var l = o && o.majordome === 'memoire' && Array.isArray(o.faits) ? o.faits : null; if (!l) return -1;
    var mine = mLoad(), seen = {}; mine.forEach(function (f) { seen[norm(f.t)] = 1; });
    var n = 0;
    l.concat(mine).sort(function (a, b) { return (a.at || 0) - (b.at || 0); }).forEach(function (f) {
      if (!f || !f.t) return;
      var cur = mLoad(), had = cur.some(function (x) { return norm(x.t) === norm(f.t); });
      if (had) return;
      var g = mAdd(f.t); if (g) { var c2 = mLoad(); c2[c2.length - 1].at = f.at || Date.now(); mSave(c2); if (!seen[norm(f.t)]) n++; }
    });
    return n;
  }
  function mImportUi() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
    inp.onchange = function () { var f = inp.files && inp.files[0]; if (!f) return; f.text().then(function (t) { var n = mImport(t); X.toast(n < 0 ? 'Fichier de mémoire illisible' : n + ' nouvelle(s) chose(s) retenue(s)'); X.settingsSheet('jarvis'); }); };
    inp.click();
  }

  /* =========================== 9. Profil automatique =========================== */
  S.pauto = Object.assign({ on: false, manualAt: 0, regles: { travail: { jours: 'aucun', de: 8, a: 17, lieu: null }, chantier: { jours: 'aucun', de: 7, a: 16, lieu: null } } }, S.pauto || {});
  var JOURS = { aucun: [], semaine: [1, 2, 3, 4, 5], tous: [0, 1, 2, 3, 4, 5, 6], weekend: [0, 6] };
  var pos = null, posAt = 0;
  function dist(a, b) { var R = 6371000, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function here(force) {
    if (!force && pos && Date.now() - posAt < 10 * 60000) return Promise.resolve(pos);
    return new Promise(function (ok, ko) {
      if (!navigator.geolocation) return ko(new Error('position indisponible'));
      navigator.geolocation.getCurrentPosition(function (p) { pos = { lat: p.coords.latitude, lon: p.coords.longitude }; posAt = Date.now(); ok(pos); }, ko, { maximumAge: 300000, timeout: 15000, enableHighAccuracy: false });
    });
  }
  function voulu(p) {
    var R = S.pauto.regles, d = new Date(), j = d.getDay(), h = d.getHours() + d.getMinutes() / 60;
    var ids = Object.keys(R);
    for (var i = 0; i < ids.length; i++) { var r = R[ids[i]]; if (r.lieu && p && dist(p, r.lieu) < 400) return ids[i]; }
    for (var k = 0; k < ids.length; k++) { var q = R[ids[k]]; if ((JOURS[q.jours] || []).indexOf(j) >= 0 && h >= q.de && h < q.a) return ids[k]; }
    return 'maison';
  }
  function autoTick() {
    if (!S.pauto.on || S.nuit.on || Date.now() - (S.pauto.manualAt || 0) < 3 * 3600000) return;
    var needPos = Object.keys(S.pauto.regles).some(function (k) { return !!S.pauto.regles[k].lieu; });
    (needPos ? here().catch(function () { return null; }) : Promise.resolve(null)).then(function (p) {
      var w = voulu(p);
      if (w && w !== S.profils.cur) { profil(w, true); X.toast('Profil ' + PROFILS[w].name + ' (automatique)'); }
    });
  }
  setInterval(autoTick, 5 * 60000); setTimeout(autoTick, 4000);

  /* =========================== 10. Résumé du matin après la nuit =========================== */
  function brief() {
    if (!S.nuit.brief) return false;
    var h = new Date().getHours(); if (h >= 12) { S.nuit.brief = false; X.saveS(); return false; }
    if ((X.speaking && X.speaking()) || MJ.listening || MJ.wait) return false;
    S.nuit.brief = false; X.saveS();
    try { X.exec({ intent: 'routine', p: { id: 'matin' } }); } catch (e) { }
    return true;
  }
  MJ.onPresence = function () { return brief(); };
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { if (S.nuit.brief) setTimeout(brief, 300); }, true); });

  /* =========================== 11. Plaques et étiquettes du chantier =========================== */
  function plaque() {
    if (!MJ.oeil || !MJ.oeil.lireTexte) return X.answer('La caméra n\'est pas disponible ici.').done;
    X.answer({ say: 'Montrez la plaque ou l\'étiquette, bien en face.', k: 'Plaque' });
    return MJ.oeil.lireTexte('Plaque ou étiquette en face de la caméra, bien éclairée', 4).then(function (txt) {
      if (txt.replace(/\W/g, '').length < 4) return X.answer('Je ne lis rien sur cette plaque. Rapprochez-la, avec plus de lumière.').done;
      var t1 = txt.replace(/\s+/g, ' '), f = [], m;
      if ((m = /\b(?:CMU|CMR|WLL|SWL|charge (?:maxi(?:male)?|max\.?)(?: d'utilisation)?)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(kg|t|tonnes?|daN|kN)\b/i.exec(t1))) f.push('CMU ' + m[1] + ' ' + m[2]);
      else if ((m = /\b(\d+(?:[.,]\d+)?)\s*(kg|t)\b/i.exec(t1))) f.push('Charge lue ' + m[1] + ' ' + m[2]);
      if ((m = /\b(?:r[ée]f(?:[ée]rence)?|type|mod[eè]le|n[°o]\s*(?:de\s*)?s[ée]rie|s\/n|sn|lot)\s*[.:°]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,})/i.exec(t1))) f.push('Réf. ' + m[1]);
      var dates = t1.match(/\b(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}[\/.\-]\d{4})\b/g) || ((m = /\b(?:ann[ée]e|fabrication|fab\.?|construit en|mise en service)\s*[:.]?\s*((?:19|20)\d{2})\b/i.exec(t1)) ? [m[1]] : null);
      if (dates) f.push('Date(s) ' + dates.slice(0, 3).join(', '));
      if ((m = /\b(?:CE|EN\s?\d{3,5}(?:-\d+)?|NF\s?[A-Z]?\s?\d{2,5})\b/.exec(t1))) f.push('Marquage ' + m[0]);
      var note = 'Plaque relevée le ' + new Date().toLocaleDateString('fr-FR') + (f.length ? ' : ' + f.join(' ; ') : '') + '. Texte : ' + t1.slice(0, 400);
      return X.exec({ intent: 'note_add', p: { text: note } }).then(function () {
        return X.answer({ say: f.length ? 'J\'ai noté dans le Carnet : ' + f.join(', ') + '.' : 'J\'ai noté le texte de la plaque dans le Carnet.', k: 'Plaque', html: '<p>' + esc(f.join(' · ') || 'Texte noté') + '</p>' }).done;
      });
    }).catch(function (e) { if (e && e.cancel) return X.answer('Lecture annulée.').done; return X.errorReply('Lecture de la plaque impossible : ' + (e && e.message || e) + '.').done; });
  }
  H.plaque = function () { return plaque(); };

  /* =========================== 12. Économie de batterie =========================== */
  S.ecoBat = S.ecoBat !== false;
  function batSet(level, charging) {
    var low = S.ecoBat && level >= 0 && level < 0.2 && !charging;
    if (low !== !!MJ.batterieBasse) {
      MJ.batterieBasse = low;
      if (MJ.oeil && MJ.oeil.refresh) MJ.oeil.refresh();
      if (low && S.oeil && (S.oeil.presence || S.oeil.gestes)) X.toast('Batterie faible : présence et gestes en pause');
    }
  }
  function batPoll() {
    if (X.P && X.P.homeBattery && !X.PC) { try { var b = JSON.parse(X.P.homeBattery() || '{}'); if (b.level >= 0) batSet(b.level / 100, !!b.plugged); } catch (e) { } return; }
    if (navigator.getBattery) navigator.getBattery().then(function (b) { batSet(b.level, b.charging); if (!batPoll.on) { batPoll.on = 1; b.addEventListener('levelchange', function () { batSet(b.level, b.charging); }); b.addEventListener('chargingchange', function () { batSet(b.level, b.charging); }); } }).catch(function () { });
  }
  batPoll(); setInterval(batPoll, 2 * 60000);

  /* =========================== 13. Rappels liés à la mémoire =========================== */
  function rappelsLies(q) {
    var qk = keys(q); if (!qk.length || !MJ.AL) return [];
    return (MJ.AL() || []).filter(function (o) { return o.kind === 'reminder' && o.at > Date.now() && keys(o.text).some(function (k) { return qk.indexOf(k) >= 0; }); });
  }
  function quand(t) { var d = new Date(t); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' à ' + d.getHours() + ' h' + (d.getMinutes() ? (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() : ''); }

  /* =========================== 14. Cerveau local (IA de Chrome, hors ligne) =========================== */
  // Gemini Nano dans Chrome (Prompt API, « LanguageModel ») : sur PC récent, sans internet une fois le modèle installé.
  // Seulement quand je ne comprends pas une phrase : il la réécrit en commande(s) connue(s), ou répond en une ou deux phrases.
  S.cerveau = !!S.cerveau;
  var LM = window.LanguageModel || null, lmBase = null, lmBusy = false, lmEtat = LM ? '…' : 'absent';
  var LMOPT = { expectedInputs: [{ type: 'text', languages: ['fr'] }], expectedOutputs: [{ type: 'text', languages: ['fr'] }] };
  function lmDispo() {
    if (!LM || !LM.availability) return Promise.resolve('absent');
    return LM.availability(LMOPT).then(function (a) { lmEtat = a; return a; }, function () { lmEtat = 'absent'; return 'absent'; });
  }
  lmDispo();
  function exemples() { var o = []; (X.HELP || []).forEach(function (g) { (g[1] || []).forEach(function (e) { o.push(e); }); }); return o.slice(0, 160); }
  function lmSession(progress) {
    if (lmBase) return Promise.resolve(lmBase);
    var sys = 'Tu es le cerveau local de « ' + (S.name || 'Majordome') + ' », assistant vocal français. Il ne comprend que des commandes proches de ces exemples. ' +
      'On te donne une phrase qu\'il n\'a pas comprise (souvent mal transcrite). Réponds en JSON : {"commandes": [...], "reponse": "..."}. ' +
      '« commandes » : 0 à 3 commandes simples proches des exemples, avec les noms, pièces, heures et nombres de la phrase. ' +
      '« reponse » : si ce n\'est pas une commande, une réponse courte et chaleureuse en une ou deux phrases à l\'oral, sinon vide. Jamais de conseil dangereux ; urgence : le 112.\nExemples :\n- ' + exemples().join('\n- ');
    return LM.create(Object.assign({ initialPrompts: [{ role: 'system', content: sys }], monitor: function (m) { m.addEventListener('downloadprogress', function (e) { if (progress) progress(e.loaded); }); } }, LMOPT))
      .then(function (s2) { lmBase = s2; return s2; });
  }
  var LMSCHEMA = { type: 'object', properties: { commandes: { type: 'array', items: { type: 'string' }, maxItems: 3 }, reponse: { type: 'string' } }, required: ['commandes', 'reponse'] };
  function lmAsk(q) {
    return lmSession().then(function (base) { return base.clone ? base.clone() : base; }).then(function (sess) {
      var d = new Date();
      return sess.prompt('Nous sommes le ' + d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ', il est ' + d.getHours() + ' h ' + d.getMinutes() + '. Phrase : « ' + q + ' »', { responseConstraint: LMSCHEMA })
        .then(function (t) { try { if (sess !== lmBase && sess.destroy) sess.destroy(); } catch (e) { } var o = JSON.parse(t); return { commandes: (o.commandes || []).filter(function (c) { return typeof c === 'string' && c.trim(); }).slice(0, 3), reponse: String(o.reponse || '').trim() }; });
    });
  }

  /* =========================== 15. Home Assistant : conversation =========================== */
  // phrase non comprise et Home Assistant configuré : elle est confiée à l'assistant de Home Assistant (Assist), qui connaît
  // tous vos appareils, pièces et scénarios ; sa réponse est dite telle quelle
  function haConv(q) {
    return haReq('conversation/process', { text: q, language: 'fr', conversation_id: haConv.id || undefined }).then(function (r) {
      var res = r && r.response || {}; haConv.id = r && r.conversation_id || haConv.id;
      var said = res.speech && res.speech.plain && res.speech.plain.speech || '';
      if (res.response_type === 'error' || !said) return null;
      return said;
    });
  }

  var prevUnknown2 = H.unknown;
  H.unknown = function (p, r) {
    var q = String((r && r.raw) || (MJ.cur && MJ.cur.q) || '').trim();
    if (!q) return prevUnknown2(p, r);
    var step = Promise.resolve(null);
    if (haOn()) step = haConv(q).then(function (said) { return said ? X.answer({ say: said, k: 'Home Assistant' }).done.then(function () { return true; }) : null; }, function () { return null; });
    return step.then(function (done) {
      if (done) return;
      if (!S.cerveau || !LM || lmBusy || lmEtat !== 'available') return prevUnknown2(p, r);
      lmBusy = true; try { if (MJ.avatar) MJ.avatar.state('think'); } catch (e) { }
      return lmAsk(q).then(function (res) {
        lmBusy = false;
        var ok = res.commandes.map(function (c) { return { c: c, r: NLU.parse(c, X.ctx()) }; }).filter(function (x) { return x.r && x.r.intent && x.r.intent !== 'unknown'; });
        if (ok.length) {
          if (MJ.carnet && MJ.carnet.note) MJ.carnet.note(q, ok.map(function (x) { return x.c; }).join(' ; '), ok.map(function (x) { return x.r.intent; }).join(', ') + ' local');
          X.card('<p class="note">Compris (cerveau local) : « ' + esc(ok.map(function (x) { return x.c; }).join(' », puis « ')) + ' »</p>');
          return ok.reduce(function (pr, x) { return pr.then(function () { return X.exec(x.r); }); }, Promise.resolve());
        }
        if (res.reponse) return X.answer({ say: res.reponse, k: S.name || 'Majordome' }).done;
        return prevUnknown2(p, r);
      }, function () { lmBusy = false; return prevUnknown2(p, r); });
    });
  };

  /* =========================== 16. Personnalités =========================== */
  // nom, voix et couleur enregistrés ensemble : « passe à Jarvis », « je veux parler à Majordome »
  var PKEYS = ['name', 'couleur', 'tts', 'voice', 'piperVoice', 'rate', 'pitch', 'fx', 'fxo', 'avatar'];
  S.personas = Array.isArray(S.personas) ? S.personas : [];
  function persoSave() {
    var o = {}; PKEYS.forEach(function (k) { if (S[k] !== undefined) o[k] = S[k]; });
    var i = S.personas.findIndex(function (x) { return norm(x.name) === norm(o.name); });
    if (i >= 0) S.personas[i] = o; else S.personas.push(o);
    X.saveS(); return o;
  }
  function persoApply(name) {
    var o = S.personas.filter(function (x) { return norm(x.name) === norm(name); })[0]; if (!o) return false;
    PKEYS.forEach(function (k) { if (o[k] !== undefined) S[k] = o[k]; });
    X.saveS(); couleur(S.couleur);
    try { X.applyName(); X.applyWake(); } catch (e) { }
    try { if (MJ.avatar && MJ.avatar.apply) MJ.avatar.apply(); } catch (e) { }
    return true;
  }
  H.persona = function (p) {
    if (p.act === 'save') { var o = persoSave(); return X.answer('Personnalité « ' + o.name + ' » enregistrée : nom, voix, couleur et apparence.').done; }
    if (!persoApply(p.name)) return X.answer(S.personas.length ? 'Je connais ces personnalités : ' + S.personas.map(function (x) { return x.name; }).join(', ') + '.' : 'Aucune personnalité enregistrée. Réglez nom, voix et couleur, puis dites : enregistre cette personnalité.').done;
    return X.answer({ say: 'Ici ' + S.name + '. À votre service.', k: 'Personnalité' }).done;
  };

  /* =========================== Compréhension des phrases =========================== */
  var PRO = { maison: 'maison', domicile: 'maison', perso: 'maison', personnel: 'maison', travail: 'travail', bureau: 'travail', boulot: 'travail', chantier: 'chantier', terrain: 'chantier', atelier: 'chantier' };
  function parse(t, r) {
    var m;
    var mp = mParse(t);
    if (mp) {
      // question ordinaire (« quel est le code du portail ») : seulement si la mémoire a la réponse et que rien d'autre n'a compris
      if (mp.act === 'ask' && !mp.strong && !((r.intent === 'unknown' || r.intent === 'wiki') && mFind(mp.q, 0.75).length)) return null;
      return { intent: 'memoire', p: mp };
    }
    if (/^(?:mode nuit|active (?:le )?mode nuit|passe en mode nuit|mets (?:le )?mode nuit|mode silencieux de nuit)$/.test(t)) return { intent: 'nuit', p: { on: true } };
    if (/^(?:fin du mode nuit|arrete (?:le )?mode nuit|desactive (?:le )?mode nuit|quitte (?:le )?mode nuit|sors du mode nuit|mode jour)$/.test(t)) return { intent: 'nuit', p: { on: false } };
    if ((m = /^(?:passe|passer|bascule|mets toi|mets|active|activer|lance)?(?: en| le)? ?(?:mode|profil) (maison|domicile|perso|personnel|travail|bureau|boulot|chantier|terrain|atelier)$/.exec(t)) || (m = /^(?:je suis|je suis au|je suis en|je suis sur|je suis a|je suis sur le|je pars au|je pars sur le) (?:la |le )?(travail|bureau|chantier|boulot|maison)$/.exec(t)))
      if (PRO[m[1]]) return { intent: 'profil', p: { id: PRO[m[1]] } };
    if ((m = /^(?:(?:mets|passe|change|changer|habille)(?: toi)?(?: de couleur)?(?: en| au)?|couleur|deviens|sois|prends la couleur|en couleur|change ta couleur(?: en| pour)?|ta couleur(?: en)?) ?(cyan|turquoise|bleu|bleue|violet|violette|mauve|vert|verte|ambre|orange|jaune|dore|rouge|blanc|blanche)$/.exec(t)))
      return { intent: 'couleur', p: { c: { turquoise: 'cyan', bleue: 'bleu', violette: 'violet', mauve: 'violet', verte: 'vert', orange: 'ambre', jaune: 'ambre', dore: 'ambre', blanche: 'blanc' }[m[1]] || m[1] } };
    if (/^(?:enregistre|sauvegarde|garde|retiens|memorise)(?: cette| ta| la)? personnalite$/.test(t)) return { intent: 'persona', p: { act: 'save' } };
    var traw = norm(r.raw || t);   // le nom d'une personnalité peut être un mot de réveil, retiré de r.t
    if ((m = /^(?:passe a|passe en|bascule (?:sur|vers|a)|je veux parler a|appelle|reveille|active (?:la )?personnalite|personnalite|mets la personnalite|change de personnalite pour) (.+)$/.exec(traw)) && S.personas.some(function (x) { return norm(x.name) === m[1]; }))
      return { intent: 'persona', p: { name: m[1] } };
    if (/^(?:envoie|envoyer|exporte|exporter|partage|partager|sauvegarde|sauvegarder|copie|transfere)(?: moi)? (?:ma |ta |la )?memoire(?: (?:vers|sur|au|a) (?:l autre appareil|le telephone|le pc|l ordinateur|mon telephone|mon pc))?$/.test(t)) return { intent: 'memoire', p: { act: 'export' } };
    if (/^(?:lis|lit|scanne|scanner|releve|relever|note|noter|photographie|lire)(?: moi)? (?:la |cette |l |une |le )?(?:plaque(?: de charge| signaletique| constructeur)?|etiquette|marquage|plaque de l (?:elingue|appareil|echafaudage|engin|palan))$/.test(t)) return { intent: 'plaque', p: {} };
    if (/^(?:quel (?:est le |est ton )?profil|quel mode|dans quel mode es tu|quel profil est actif)$/.test(t)) return { intent: 'profil', p: { act: 'which' } };
    if (/^(?:lis|lit|lire|lis moi|peux tu lire|tu peux lire)(?: moi)? (?:l ecran|mon ecran|ce qu il y a (?:a|sur) l ecran|ce qui est (?:a|sur) l ecran|ce qui est affiche|la fenetre|cette fenetre|ce qui s affiche)$|^(?:qu est ce qu il y a (?:a|sur) l ecran|qu est ce qui est (?:ecrit|affiche) (?:a|sur) l ecran|que dit l ecran)$/.test(t)) return { intent: 'ecran_lire', p: {} };
    if (haOn()) {
      if ((m = /^(allume|eteins|ouvre|ferme|active|desactive|lance|coupe|verrouille|deverrouille|demarre)(?: la| le| les| l)? (.+?)(?: (?:dans|sur|avec|par) home assistant)$/.exec(t)))
        return { intent: 'ha', p: { act: /^(allume|ouvre|active|lance|deverrouille|demarre)$/.test(m[1]) ? (m[1] === 'ouvre' ? 'open' : 'on') : (m[1] === 'ferme' ? 'close' : 'off'), q: m[2] } };
      if ((m = /^(?:quel est l etat (?:de|du|des|d)|etat (?:de|du|des|d)) (.+?)(?: (?:dans|sur) home assistant)?$/.exec(t))) return { intent: 'ha', p: { act: 'etat', q: m[1] } };
      if (r.intent === 'unknown' && (m = /^(active|desactive|lance|coupe|demarre|arrete)(?: la| le| les| l)? (.+)$/.exec(t)) && haStates.length && haMatch(m[2]))
        return { intent: 'ha', p: { act: /^(active|lance|demarre)$/.test(m[1]) ? 'on' : 'off', q: m[2] } };
    }
    return null;
  }
  if (NLU && NLU.parse) {
    var orig = NLU.parse;
    NLU.parse = function (raw, ctx) {
      var r = orig.apply(this, arguments);
      try {
        if (!r || (ctx && ctx.expect) || !r.t) return r;
        if (r.intent === 'oeil') return r;
        var t = norm(r.t).replace(/ (?:s il (?:te|vous) plait|stp|svp)$/, '');
        var x = parse(t, r);
        if (x) return { intent: x.intent, p: x.p, t: r.t, raw: r.raw, wake: r.wake };
      } catch (e) { console.warn(e); }
      return r;
    };
  }
  // fin de « bonne nuit » → mode nuit ; « bonjour » (routine du matin) → fin du mode nuit
  var prevAfter = MJ.afterCmd;
  MJ.afterCmd = function (text, r) {
    try {
      if (r && r.intent === 'reminder' && r.p && r.p.text) {
        var lie = mFind(r.p.text, 0.3)[0];
        if (lie) X.answer({ say: 'Je me souviens aussi : ' + sayFirst(lie.f.t) + '.', k: 'Mémoire' });
      }
      if (r && r.intent === 'routine' && r.p && r.p.id === 'matin') { S.nuit.brief = false; }
      if (r && r.intent === 'routine' && r.p) {
        if (r.p.id === 'nuit' && S.nuit.auto) nuit(true, true);
        if (r.p.id === 'matin' && S.nuit.on) nuit(false, true);
      }
    } catch (e) { }
    return prevAfter ? prevAfter(text, r) : undefined;
  };
  if (X.HELP && X.HELP.push) X.HELP.push(['Mémoire, nuit et profils', ['Retiens que le code du portail est 1234', 'Où est la perceuse ?', 'Qu\'est-ce que tu as retenu ?', 'Oublie le code du portail', 'Mode nuit', 'Fin du mode nuit', 'Passe en mode chantier', 'Quel profil ?', 'Lis l\'écran', 'Allume la lampe du salon dans Home Assistant', 'Mets-toi en bleu', 'Lis la plaque', 'Envoie ma mémoire']]);

  /* =========================== Styles et réglages =========================== */
  var css = document.createElement('style');
  css.textContent = '.jv-nuit{position:fixed;inset:0;z-index:56;background:#000;opacity:0;pointer-events:none;transition:opacity .8s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}' +
    '.jv-nuit.on{opacity:.96;pointer-events:auto}.jv-nuit .jv-h{font:200 min(20vw,150px)/1 system-ui,sans-serif;color:#5a3d2b;letter-spacing:.04em}.jv-nuit .jv-s{color:#3b2b22;font-size:13px}' +
    '.jv-txt{white-space:pre-wrap;max-height:40vh;overflow:auto;background:rgba(255,255,255,.04);border-radius:10px;padding:8px 10px;font-size:14px}';
  document.head.appendChild(css);
  function sw(id, on, t, s) { return '<div class="set"><div class="t">' + t + '<small>' + s + '</small></div><label class="sw"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label></div>'; }
  function html() {
    var mem = mLoad(), ha = haCfg();
    return '<div class="sect" id="f-jarvis">Mémoire</div>' +
      '<p class="note">' + (mem.length ? mem.length + ' chose(s) retenue(s), gardées sur cet appareil seulement.' : 'Rien pour l\'instant. Dites « retiens que… ».') + '</p>' +
      (mem.length ? '<div class="list">' + mem.slice(-20).reverse().map(function (f) { return '<div class="set"><div class="t">' + esc(f.t) + '<small>' + new Date(f.at).toLocaleDateString('fr-FR') + '</small></div><button class="btn sm" data-jvdel="' + esc(f.id) + '">Oublier</button></div>'; }).join('') + '</div>' : '') +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><button class="btn sm" id="jvMemOut">Envoyer vers un autre appareil</button><button class="btn sm" id="jvMemIn">Recevoir une mémoire</button></div>' +
      '<div class="sect">Couleur</div><div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' + Object.keys(COULEURS).map(function (c) { return '<button class="btn sm' + (S.couleur === c ? ' pri' : '') + '" data-jvc="' + c + '"><span style="display:inline-block;width:.8em;height:.8em;border-radius:50%;background:' + COULEURS[c][1] + ';margin-right:.4em;vertical-align:-.05em"></span>' + COULEURS[c][0] + '</button>'; }).join('') + '</div>' +
      '<div class="sect">Personnalités</div><p class="note">Nom, voix, couleur et apparence enregistrés ensemble. « Passe à Jarvis ».</p>' +
      (S.personas.length ? '<div class="list">' + S.personas.map(function (o, i) { return '<div class="set"><div class="t">' + esc(o.name) + '<small>' + esc((COULEURS[o.couleur] || ['Cyan'])[0]) + (o.tts === 'piper' ? ' · voix Piper ' + esc(o.piperVoice || '') : '') + '</small></div><button class="btn sm" data-jvpa="' + i + '">Activer</button><button class="btn sm" data-jvpd="' + i + '">Supprimer</button></div>'; }).join('') + '</div>' : '') +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><button class="btn sm" id="jvPersoSave">Enregistrer « ' + esc(S.name || 'Majordome') + ' » tel qu\'il est</button></div>' +
      '<div class="sect">Cerveau local (IA de Chrome)</div>' +
      '<p class="note">' + ({ absent: 'Indisponible ici : il faut Chrome ou Edge récent sur PC (Chrome 148 ou plus), avec 16 Go de mémoire ou une carte graphique de plus de 4 Go, et 22 Go libres.', unavailable: 'Cet ordinateur ne peut pas le faire tourner.', downloadable: 'Modèle à installer (plusieurs Go, une seule fois, puis hors ligne).', downloading: 'Installation du modèle en cours…', available: 'Prêt, hors ligne.' }[lmEtat] || 'Vérification…') + ' Il ne sert que quand je ne comprends pas une phrase.</p>' +
      (LM && lmEtat !== 'absent' && lmEtat !== 'unavailable' ? sw('jvCerveau', S.cerveau, 'Utiliser le cerveau local', 'Réécrit les phrases difficiles en commandes, ou répond aux questions simples, sans internet') + (lmEtat !== 'available' ? '<div class="row"><button class="btn sm" id="jvLmGet">Installer le modèle</button></div><p class="note" id="jvLmMsg"></p>' : '') : '') +
      '<div class="sect">Mode nuit</div>' +
      sw('jvNuitAuto', S.nuit.auto, 'Après « Bonne nuit »', 'Voix douce, écran noir avec l\'heure, pas d\'annonce spontanée, jusqu\'à l\'heure de fin') +
      sw('jvNuitEcran', S.nuit.ecran, 'Écran noir la nuit', 'Touchez l\'écran pour revoir Majordome 30 s') +
      '<div class="set"><div class="t">Fin du mode nuit<small>Ou en disant « bonjour »</small></div><select id="jvNuitFin" class="btn sm">' + [5, 6, 7, 8, 9].map(function (h) { return '<option value="' + h + '"' + (+S.nuit.fin === h ? ' selected' : '') + '>' + h + ' h</option>'; }).join('') + '</select></div>' +
      '<div class="set"><div class="t">Mode nuit maintenant<small>' + (S.nuit.on ? 'Actif' : 'Inactif') + '</small></div><button class="btn sm" id="jvNuitBtn">' + (S.nuit.on ? 'Arrêter' : 'Activer') + '</button></div>' +
      '<div class="sect">Profils</div><p class="note">« Passe en mode chantier » : chaque profil garde son volume, sa vitesse de voix, ses bips, ses réglages de caméra et l\'annonce des messages (Chantier : lus à voix haute ; Maison : aucune annonce ; Travail : qui écrit).</p>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' + Object.keys(PROFILS).map(function (k) { return '<button class="btn sm' + (S.profils.cur === k ? ' pri' : '') + '" data-jvp="' + k + '">' + PROFILS[k].name + '</button>'; }).join('') + '</div>' +
      sw('jvPauto', S.pauto.on, 'Profil automatique', 'Selon le jour, l\'heure ou le lieu ci-dessous ; un choix à la main est gardé 3 h') +
      ['travail', 'chantier'].map(function (k) { var r = S.pauto.regles[k]; return '<div class="set"><div class="t">' + PROFILS[k].name + '<small>' + (r.lieu ? 'Lieu enregistré (400 m)' : 'Pas de lieu') + '</small></div>' +
        '<select class="btn sm" data-jvj="' + k + '">' + [['aucun', 'Jamais par l\'heure'], ['semaine', 'Lun–ven'], ['tous', 'Tous les jours'], ['weekend', 'Week-end']].map(function (o) { return '<option value="' + o[0] + '"' + (r.jours === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
        '<select class="btn sm" data-jvde="' + k + '">' + [5, 6, 7, 8, 9, 10, 12, 13, 14].map(function (h) { return '<option' + (+r.de === h ? ' selected' : '') + '>' + h + '</option>'; }).join('') + '</select>' +
        '<select class="btn sm" data-jva="' + k + '">' + [12, 14, 15, 16, 17, 18, 19, 20, 22].map(function (h) { return '<option' + (+r.a === h ? ' selected' : '') + '>' + h + '</option>'; }).join('') + '</select>' +
        '<button class="btn sm" data-jvl="' + k + '">' + (r.lieu ? 'Oublier le lieu' : 'Ici = ' + PROFILS[k].name) + '</button></div>'; }).join('') +
      '<div class="sect">Batterie</div>' +
      sw('jvEco', S.ecoBat, 'Économie de batterie', 'Sous 20 % et hors charge : présence et gestes de la caméra en pause (la surveillance continue)') +
      '<div class="sect">Interruption</div>' +
      sw('jvBarge', S.barge, 'M\'arrêter en disant mon nom', 'Pendant que je parle, dites « ' + esc(S.name || 'Majordome') + ' » : je me tais et je vous écoute (écoute continue activée)') +
      '<div class="sect">Home Assistant</div>' +
      '<p class="note">Facultatif. Adresse <b>https</b> de votre Home Assistant (par exemple Nabu Casa) et un jeton d\'accès longue durée (Profil › Sécurité). Dans configuration.yaml, autorisez cette page : <code>http: cors_allowed_origins: ' + esc(location.origin) + '</code>. Le jeton reste sur cet appareil.</p>' +
      '<div class="set"><div class="t">Adresse</div><input id="jvHaUrl" class="btn sm" style="min-width:220px" placeholder="https://maison.ui.nabu.casa" value="' + esc(ha.url || '') + '"></div>' +
      '<div class="set"><div class="t">Jeton</div><input id="jvHaTok" class="btn sm" type="password" style="min-width:220px" placeholder="eyJ…" value="' + esc(ha.token ? '••••••••' : '') + '"></div>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><button class="btn sm pri" id="jvHaSave">Enregistrer et tester</button>' + (ha.url ? '<button class="btn sm" id="jvHaDel">Déconnecter</button>' : '') + '</div><p class="note" id="jvHaMsg"></p>';
  }
  function bind() {
    var g = function (id) { return document.getElementById(id); };
    document.querySelectorAll('[data-jvdel]').forEach(function (b) { b.onclick = function () { var id = b.dataset.jvdel; mSave(mLoad().filter(function (f) { return f.id !== id; })); X.settingsSheet('jarvis'); }; });
    if (g('jvNuitAuto')) g('jvNuitAuto').onchange = function () { S.nuit.auto = this.checked; X.saveS(); };
    if (g('jvNuitEcran')) g('jvNuitEcran').onchange = function () { S.nuit.ecran = this.checked; X.saveS(); if (!this.checked) nuitOverlay(false); };
    if (g('jvNuitFin')) g('jvNuitFin').onchange = function () { S.nuit.fin = +this.value; X.saveS(); };
    if (g('jvNuitBtn')) g('jvNuitBtn').onclick = function () { X.closeSheet(); nuit(!S.nuit.on); };
    document.querySelectorAll('[data-jvp]').forEach(function (b) { b.onclick = function () { X.closeSheet(); profil(b.dataset.jvp); }; });
    document.querySelectorAll('[data-jvpa]').forEach(function (b) { b.onclick = function () { var o = S.personas[+b.dataset.jvpa]; if (o) { X.closeSheet(); H.persona({ name: o.name }); } }; });
    document.querySelectorAll('[data-jvpd]').forEach(function (b) { b.onclick = function () { S.personas.splice(+b.dataset.jvpd, 1); X.saveS(); X.settingsSheet('jarvis'); }; });
    if (g('jvPersoSave')) g('jvPersoSave').onclick = function () { persoSave(); X.toast('Personnalité enregistrée'); X.settingsSheet('jarvis'); };
    if (g('jvCerveau')) g('jvCerveau').onchange = function () { S.cerveau = this.checked; X.saveS(); };
    if (g('jvLmGet')) g('jvLmGet').onclick = function () {
      var msg = g('jvLmMsg'); msg.textContent = 'Installation… (gardez la page ouverte)';
      lmSession(function (k) { msg.textContent = 'Installation : ' + Math.round(k * 100) + ' %'; }).then(function () { lmEtat = 'available'; S.cerveau = true; X.saveS(); msg.textContent = 'Cerveau local prêt.'; },
        function (e) { msg.textContent = 'Échec : ' + (e && e.message || e) + '.'; });
    };
    if (g('jvMemOut')) g('jvMemOut').onclick = function () { mExport(); };
    if (g('jvMemIn')) g('jvMemIn').onclick = function () { mImportUi(); };
    document.querySelectorAll('[data-jvc]').forEach(function (b) { b.onclick = function () { couleur(b.dataset.jvc); X.saveS(); X.settingsSheet('jarvis'); }; });
    if (g('jvPauto')) g('jvPauto').onchange = function () { S.pauto.on = this.checked; S.pauto.manualAt = 0; X.saveS(); autoTick(); };
    var rset = function (attr, key, num) { document.querySelectorAll('[' + attr + ']').forEach(function (el) { el.onchange = function () { S.pauto.regles[el.getAttribute(attr)][key] = num ? +el.value : el.value; X.saveS(); }; }); };
    rset('data-jvj', 'jours'); rset('data-jvde', 'de', 1); rset('data-jva', 'a', 1);
    document.querySelectorAll('[data-jvl]').forEach(function (b) { b.onclick = function () {
      var k = b.dataset.jvl, r = S.pauto.regles[k];
      if (r.lieu) { r.lieu = null; X.saveS(); X.settingsSheet('jarvis'); return; }
      X.toast('Recherche de la position…');
      here(true).then(function (p) { r.lieu = { lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) }; X.saveS(); X.toast('Lieu enregistré pour ' + PROFILS[k].name); X.settingsSheet('jarvis'); }, function () { X.toast('Position indisponible : autorisez la localisation'); });
    }; });
    if (g('jvEco')) g('jvEco').onchange = function () { S.ecoBat = this.checked; X.saveS(); batPoll(); if (!S.ecoBat) batSet(1, true); };
    if (g('jvBarge')) g('jvBarge').onchange = function () { S.barge = this.checked; X.saveS(); bargeApply(); };
    if (g('jvHaSave')) g('jvHaSave').onclick = function () {
      var c = haCfg(), url = g('jvHaUrl').value.trim(), tok = g('jvHaTok').value.trim(), msg = g('jvHaMsg');
      if (!/^https:\/\//.test(url)) { msg.textContent = 'L\'adresse doit commencer par https://'; return; }
      haSet({ url: url, token: /^•+$/.test(tok) ? c.token : tok });
      msg.textContent = 'Test…';
      haLoad(true).then(function (l) { msg.textContent = 'Connecté : ' + l.filter(function (s) { return DOM_ACT.test(s.entity_id); }).length + ' appareils et capteurs.'; }, function (e) { msg.textContent = 'Échec : ' + e.message + '.'; });
    };
    if (g('jvHaDel')) g('jvHaDel').onclick = function () { try { localStorage.removeItem(HAK); } catch (e) { } haStates = []; X.settingsSheet('jarvis'); };
  }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + html(); };
  MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };
  if (haOn()) haLoad().catch(function () { });

  MJ.jarvis = { haConv: haConv, lmAsk: lmAsk, persoSave: persoSave, persoApply: persoApply, couleur: couleur, mImport: mImport, voulu: voulu, brief: brief, batSet: batSet, parse: function (q) { return parse(norm(q), { intent: 'unknown' }); }, memoire: { load: mLoad, add: mAdd, find: mFind }, nuit: nuit, profil: profil, haMatch: function (q) { return haMatch(q); }, _haSet: function (l) { haStates = l; haAt = Date.now(); } };
})();
