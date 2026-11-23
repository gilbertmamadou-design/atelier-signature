/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-jarvis.js : ne pas modifier ici. */
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
     présence et gestes de la caméra ; chaque profil garde ses propres réglages.
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
    if ((m = /^(?:ou (?:est|sont|se trouve|se trouvent|ai je (?:mis|range|laisse|pose)|j ai (?:mis|range|laisse|pose)|est ce que j ai (?:mis|range))|tu te souviens (?:de|du|des|d)|tu te rappelles (?:de|du|des|d)|qu est ce que tu sais (?:sur|de|du|des|d)|que sais tu (?:sur|de|du|des|d)|rappelle moi|c est quoi deja|quel(?:le)?s? (?:est|sont|etait|etaient) deja) (.+)$/.exec(t))) return { act: 'ask', q: m[1], strong: true };
    if ((m = /^(?:quel(?:le)?s? (?:est|sont)|c est quoi|qui a|a qui (?:j ai|ai je) prete|combien|quand (?:est|a lieu))(.+)$/.exec(t))) return { act: 'ask', q: m[1] || t, strong: false };
    return null;
  }
  function mAnswer(p, raw) {
    if (p.act === 'add') {
      var txt = String(raw || '').replace(/^.*?\b(?:que|qu')\s*/i, '');
      var f = mAdd(txt);
      return X.answer({ say: f ? 'C\'est noté : ' + sayFirst(f.t) + '.' : 'Je n\'ai pas compris quoi retenir.', k: 'Mémoire' }).done;
    }
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
    var h = mFind(p.q, p.strong ? 0.5 : 0.75);
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
    if (d.getHours() === +S.nuit.fin && Date.now() - since > 3600000) nuit(false, true);
  }, 60000);
  if (S.nuit.on) setTimeout(function () { nuitOverlay(true); }, 800);
  H.nuit = function (p) { nuit(!!p.on); return Promise.resolve(); };

  /* =========================== 3. Profils =========================== */
  var PROFILS = {
    maison: { name: 'Maison', d: { volume: 0.9, rate: 1, beeps: true, presence: false, gestes: false } },
    travail: { name: 'Travail', d: { volume: 0.6, rate: 1.05, beeps: false, presence: false, gestes: false } },
    chantier: { name: 'Chantier', d: { volume: 1, rate: 1, beeps: true, presence: false, gestes: true } }
  };
  S.profils = Object.assign({ cur: '', saved: {} }, S.profils || {});
  function snap() { var o = S.oeil || {}; return { volume: S.volume, rate: S.rate, beeps: S.beeps, presence: !!o.presence, gestes: !!o.gestes }; }
  function applyP(v) {
    if (v.volume != null) S.volume = v.volume; if (v.rate != null) S.rate = v.rate; if (v.beeps != null) S.beeps = v.beeps;
    if (S.oeil) { S.oeil.presence = !!v.presence; S.oeil.gestes = !!v.gestes; }
    X.saveS(); if (MJ.oeil && MJ.oeil.refresh) MJ.oeil.refresh(true);
  }
  function profil(id) {
    var P = PROFILS[id]; if (!P) return X.answer('Je ne connais que les profils Maison, Travail et Chantier.').done;
    if (S.nuit.on) nuit(false, true);
    if (S.profils.cur) S.profils.saved[S.profils.cur] = snap();
    var v = S.profils.saved[id] || P.d;
    S.profils.cur = id; applyP(v);
    var det = { maison: 'Voix normale.', travail: 'Voix plus douce et un peu plus rapide, sans bips.', chantier: 'Voix forte, et commande par gestes devant la caméra pour les mains occupées.' }[id];
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
      return haLoad().then(function () { var res = fn(p || {}, r); return res || (prev ? prev(p, r) : X.answer('Je ne trouve pas cet appareil.').done); },
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
      if (r && r.intent === 'routine' && r.p) {
        if (r.p.id === 'nuit' && S.nuit.auto) nuit(true, true);
        if (r.p.id === 'matin' && S.nuit.on) nuit(false, true);
      }
    } catch (e) { }
    return prevAfter ? prevAfter(text, r) : undefined;
  };
  if (X.HELP && X.HELP.push) X.HELP.push(['Mémoire, nuit et profils', ['Retiens que le code du portail est 1234', 'Où est la perceuse ?', 'Qu\'est-ce que tu as retenu ?', 'Oublie le code du portail', 'Mode nuit', 'Fin du mode nuit', 'Passe en mode chantier', 'Quel profil ?', 'Lis l\'écran', 'Allume la lampe du salon dans Home Assistant']]);

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
      '<div class="sect">Mode nuit</div>' +
      sw('jvNuitAuto', S.nuit.auto, 'Après « Bonne nuit »', 'Voix douce, écran noir avec l\'heure, pas d\'annonce spontanée, jusqu\'à l\'heure de fin') +
      sw('jvNuitEcran', S.nuit.ecran, 'Écran noir la nuit', 'Touchez l\'écran pour revoir Majordome 30 s') +
      '<div class="set"><div class="t">Fin du mode nuit<small>Ou en disant « bonjour »</small></div><select id="jvNuitFin" class="btn sm">' + [5, 6, 7, 8, 9].map(function (h) { return '<option value="' + h + '"' + (+S.nuit.fin === h ? ' selected' : '') + '>' + h + ' h</option>'; }).join('') + '</select></div>' +
      '<div class="set"><div class="t">Mode nuit maintenant<small>' + (S.nuit.on ? 'Actif' : 'Inactif') + '</small></div><button class="btn sm" id="jvNuitBtn">' + (S.nuit.on ? 'Arrêter' : 'Activer') + '</button></div>' +
      '<div class="sect">Profils</div><p class="note">« Passe en mode chantier » : chaque profil garde son volume, sa vitesse de voix, ses bips et ses réglages de caméra.</p>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0">' + Object.keys(PROFILS).map(function (k) { return '<button class="btn sm' + (S.profils.cur === k ? ' pri' : '') + '" data-jvp="' + k + '">' + PROFILS[k].name + '</button>'; }).join('') + '</div>' +
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

  MJ.jarvis = { parse: function (q) { return parse(norm(q), { intent: 'unknown' }); }, memoire: { load: mLoad, add: mAdd, find: mFind }, nuit: nuit, profil: profil, haMatch: function (q) { return haMatch(q); }, _haSet: function (l) { haStates = l; haAt = Date.now(); } };
})();
