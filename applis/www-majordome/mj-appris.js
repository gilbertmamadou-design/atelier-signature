/* =====================================================================
   Majordome › Apprentissage : mieux se comprendre
   1. Phrases apprises : « quand je dis soirée film, ferme les volets du salon puis allume le salon à 20 % ».
      Chaque phrase devient une routine marquée « apprise » (visible et modifiable dans Réglages › Routines).
   2. Ce qu'il rate : quand une phrase n'est pas comprise, il demande de la dire autrement et retient l'équivalence.
   3. Habitudes : la même commande de volets ou de lumières, à la même heure, trois jours ou plus → il propose
      de la programmer (programmes Volets et stores / Lumières, alarmes Android).
   4. Révisions : « interroge-moi sur les capitales », tables de multiplication, calcul mental, fiches personnelles.
   Tout reste sur l'appareil (réglages et stockage local), rien n'est envoyé.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, S = X.S, esc = X.esc, NLU = window.MJNLU, deacc = X.deacc;
  var DAY = 864e5, HK = 'majordome:habitudes';
  if (S.learnOn == null) S.learnOn = true;
  if (S.habitsOn == null) S.habitsOn = true;
  if (!S.habitNo || typeof S.habitNo !== 'object') S.habitNo = {};
  if (!Array.isArray(S.quizCards)) S.quizCards = [];

  function ctx(extra) { var c = X.ctx ? X.ctx() : { now: Date.now(), names: [] }; return extra ? Object.assign(c, extra) : c; }
  function known(r) { return !!r && !/^(unknown|empty|wake|slot|confirm_yes|confirm_no)$/.test(r.intent); }
  function key(s) { return NLU.prep(String(s || ''), ctx()).t; }
  function clean(s) { return String(s || '').replace(/[,;\/|«»"]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/, ''); }
  function learned() { return (S.routines || []).filter(function (r) { return r.learned; }); }
  function learnedOf(k) { return learned().filter(function (r) { return String(r.phrase || '').split(/[,;\/|]+/).some(function (x) { return key(x) === k; }); })[0]; }
  function saveLearned(say, steps) {
    say = clean(say);
    var r = learnedOf(key(say));
    if (r) r.steps = steps;
    else { r = { id: 'ap' + X.uid(), name: X.cap(say), phrase: say, btn: false, learned: true, steps: steps }; S.routines.push(r); }
    X.saveS(); return r;
  }
  function stepTxt(s) { return /^cmd:/.test(s) ? '« ' + s.slice(4) + ' »' : /^dit:/.test(s) ? 'dire « ' + s.slice(4) + ' »' : s; }

  /* ---------- Découpe d'une suite d'actions : « ferme les volets, puis allume le salon et lance la musique » ---------- */
  function stepOf(piece) {
    piece = String(piece || '').trim().replace(/^(?:tu |et |puis |alors |de |d')/i, '').trim();
    if (!piece) return { ok: false };
    var d = /^(?:dis|dis-moi|dis moi|réponds|reponds|réponds-moi|annonce)\s+(?:que\s+)?(.+)$/i.exec(piece);
    if (d) return { ok: true, step: 'dit:' + d[1].trim(), txt: piece };
    var r = NLU.parse(piece, ctx());
    if (!known(r)) return { ok: false, txt: piece };
    return { ok: true, step: 'cmd:' + piece, txt: piece };
  }
  function splitEt(p) {
    var re = /\s+et\s+/gi, m;
    while ((m = re.exec(p))) {
      var a = p.slice(0, m.index), b = p.slice(m.index + m[0].length);
      if (stepOf(a).ok) { var rest = splitEt(b); if (rest.every(function (x) { return stepOf(x).ok; })) return [a].concat(rest); }
    }
    return [p];
  }
  function splitActs(raw) {
    var parts = String(raw || '').split(/\s*(?:[,;]|\bet puis\b|\bpuis\b|\bet ensuite\b|\bensuite\b|\bet après\b|\bet apres\b|\baprès ça\b|\bapres ca\b)\s*/i).map(function (x) { return x.trim(); }).filter(Boolean), out = [];
    parts.forEach(function (p) { out = out.concat(splitEt(p)); });
    return out;
  }

  MJ.splitActs = splitActs; MJ.known = known;

  /* ---------- 1. Phrases apprises ---------- */
  H.teach = function (p) {
    var say = p.say, todo = p.todo;
    var getSay = say ? Promise.resolve(say) : X.ask('Quelle phrase voulez-vous m\'apprendre ?', 'text', { k: 'Apprentissage', show: 'Quelle phrase voulez-vous m\'apprendre ? Par exemple « soirée film ».' });
    return getSay.then(function (s) {
      if (!s) return X.answer('D\'accord, ce sera pour une autre fois.').done;
      say = clean(s);
      var getTodo = todo ? Promise.resolve(todo) : X.ask('Quand vous direz « ' + say + ' », que dois-je faire ?', 'text', { k: 'Apprentissage', show: 'Quand vous direz « ' + say + ' », que dois-je faire ? Vous pouvez enchaîner : « ferme les volets du salon, puis allume le salon à 20 % ».' });
      return getTodo.then(function (td) {
        if (!td) return X.answer('D\'accord, je n\'apprends rien.').done;
        var steps = [], ok = [], bad = [];
        splitActs(td).forEach(function (pc) { var st = stepOf(pc); if (st.ok) { steps.push(st.step); ok.push(st.txt); } else bad.push(pc); });
        if (!steps.length) return X.answer({ say: 'Je ne sais pas encore faire « ' + td + ' ». Je n\'ai rien appris.', k: 'Apprentissage' }).done;
        var mine = learnedOf(key(say));
        var clash = NLU.parse(say, ctx({ routines: (S.routines || []).filter(function (r) { return !r.learned; }).map(function (r) { return { id: r.id, name: r.name, phrase: r.phrase }; }) }));
        saveLearned(say, steps);
        var t = (mine ? 'C\'est modifié. ' : 'C\'est noté. ') + 'Quand vous direz « ' + say + ' », je ferai ' + (ok.length > 1 ? 'ceci : « ' + ok.join(' », puis « ') + ' »' : '« ' + ok[0] + ' »') + '.';
        if (bad.length) t += ' Mais je ne sais pas faire « ' + bad.join(' », « ') + ' », je l\'ai laissé de côté.';
        if (known(clash)) t += ' Attention, cette phrase avait déjà un sens pour moi : c\'est désormais la vôtre qui compte.';
        var c = X.answer({ say: t, k: 'Apprentissage', html: '<div class="k">Apprentissage</div><p>' + esc(t) + '</p><div class="row"><button class="btn sm pri" data-tt>Essayer</button><button class="btn sm" data-tset>Mes phrases</button></div>' });
        c.querySelector('[data-tt]').onclick = function () { X.handle(say, 'click'); };
        c.querySelector('[data-tset]').onclick = function () { X.settingsSheet('apprentissage'); };
        return c.done;
      });
    });
  };
  H.teach_list = function () {
    var l = learned();
    if (!l.length) return X.answer({ say: 'Je n\'ai encore rien appris. Dites par exemple : quand je dis soirée film, ferme les volets du salon.', k: 'Apprentissage' }).done;
    var say = 'J\'ai appris ' + l.length + ' phrase' + (l.length > 1 ? 's' : '') + ' : ' + l.slice(0, 8).map(function (r) { return r.phrase; }).join(', ') + (l.length > 8 ? ', et d\'autres' : '') + '.';
    var c = X.answer({ say: say, html: '<div class="k">Phrases apprises</div><ul>' + l.map(function (r) { return '<li><b>« ' + esc(r.phrase) + ' »</b> → ' + esc((r.steps || []).map(stepTxt).join(', puis ')) + '</li>'; }).join('') + '</ul><div class="row"><button class="btn sm" data-tset>Modifier</button></div>' });
    c.querySelector('[data-tset]').onclick = function () { X.settingsSheet('apprentissage'); };
    return c.done;
  };
  H.teach_forget = function (p) {
    if (p.all) {
      var n = learned().length; if (!n) return X.answer('Je n\'ai rien appris pour le moment.').done;
      return X.ask('Oublier les ' + n + ' phrases apprises ?', 'yesno', { yes: 'Tout oublier', danger: true }).then(function (y) {
        if (!y) return X.answer('D\'accord, je garde tout.').done;
        S.routines = S.routines.filter(function (r) { return !r.learned; }); X.saveS();
        return X.answer('C\'est fait, j\'ai tout oublié.').done;
      });
    }
    var r = learnedOf(key(p.say));
    if (!r) return X.answer('Je n\'ai pas appris la phrase « ' + p.say + ' ».').done;
    S.routines = S.routines.filter(function (x) { return x !== r; }); X.saveS();
    return X.answer('C\'est oublié : « ' + r.phrase + ' » ne veut plus rien dire pour moi.').done;
  };

  /* ---------- 2. Ce qu'il ne comprend pas : il demande, puis retient ---------- */
  var prevUnknown = H.unknown, inLearn = false;
  H.unknown = function (p, r) {
    var heard = clean((r && r.raw) || (MJ.cur && MJ.cur.q) || ''), n = heard.split(' ').length;
    if (!S.learnOn || inLearn || !heard || n > 12 || key(heard).length < 3) return prevUnknown(p, r);
    inLearn = true;
    var sg = p.suggest && p.suggest.phrase ? p.suggest : null;
    // une seule question, en texte libre : « oui » reprend la suggestion, sinon la phrase dite autrement
    var first = X.ask(sg ? 'Je n\'ai pas compris. Vouliez-vous dire : ' + sg.phrase + ' ? Dites oui, ou dites-le autrement.' : 'Je n\'ai pas compris. Dites-le autrement, et je m\'en souviendrai.', 'text', {
      k: 'Apprentissage', show: 'Je n\'ai pas compris « ' + heard + ' ».' + (sg ? ' Vouliez-vous dire « ' + sg.phrase + ' » ? Dites « oui », ou dites-le autrement :' : ' Dites-le autrement (avec une commande que je connais) :') + ' je retiendrai que c\'est la même chose.'
    }).then(function (v) { return v && sg && NLU.yesNo(NLU.prep(v, {}).t) === 'yes' ? sg.phrase : v; });
    return first.then(function (v) {
      if (!v) { X.card('<p class="note">D\'accord. Dites « aide » pour voir ce que je sais faire.</p>'); return; }
      var r2 = NLU.parse(v, ctx());
      if (!known(r2) || /^(stop|thanks|repeat|greet|help)$/.test(r2.intent)) return X.answer({ say: 'Je ne comprends pas non plus. Dites « aide » pour la liste de ce que je sais faire.', cls: 'warn' }).done;
      if (key(v) !== key(heard)) saveLearned(heard, ['cmd:' + clean(v)]);
      X.card('<div class="k">Apprentissage</div><p>Retenu : « ' + esc(heard) + ' » = « ' + esc(clean(v)) + ' ».</p><p class="note">À modifier ou oublier dans Réglages › Apprentissage.</p>');
      if (MJ.cur) { MJ.cur.intent = r2.intent; }
      return Promise.resolve(X.exec(r2));
    }).then(function () { inLearn = false; }, function (e) { inLearn = false; throw e; });
  };

  /* ---------- 3. Habitudes : volets et lumières à heure fixe ---------- */
  var DN = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function habitKey(r) {
    var p = r.p || {};
    if (r.intent === 'shutter' && /^(open|close|my|pos)$/.test(p.act) && p.at == null && !p.delay) return 'sh|' + p.act + '|' + (p.act === 'pos' ? p.pos : '') + '|' + (p.kind || '') + '|' + deacc(p.target || '');
    if (r.intent === 'light' && /^(on|off|bri|scene)$/.test(p.act) && p.at == null && !p.delay) return 'li|' + p.act + '|' + (p.act === 'bri' ? p.bri : '') + '|' + deacc(p.target || p.full || (p.all ? '*' : '')) + '|' + deacc(p.scene || p.sceneFull || '');
    return null;
  }
  function minOf(t) { var d = new Date(t); return d.getHours() * 60 + d.getMinutes(); }
  function ymd(t) { var d = new Date(t); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function hSay(m) { var h = Math.floor(m / 60), mm = m % 60; return h + ' h' + (mm ? ' ' + String(mm).padStart(2, '0') : ''); }
  function daysSay(days) { return days.length === 7 ? 'tous les jours' : days.join() === '1,2,3,4,5' ? 'en semaine' : days.join() === '0,6' ? 'le week-end' : 'le ' + days.map(function (d) { return DN[d]; }).join(', le '); }
  MJ.afterCmd = function (text, r) {
    if (!S.habitsOn || !r || X.PC) return;
    var k = habitKey(r); if (!k) return;
    var t = Date.now(), l = X.lsGet(HK, []).filter(function (e) { return t - e.at < 60 * DAY; });
    l.push({ k: k, q: text, at: t }); while (l.length > 600) l.shift(); X.lsSet(HK, l);
    var cur = minOf(t), near = l.filter(function (e) { return e.k === k && t - e.at < 28 * DAY && Math.abs(minOf(e.at) - cur) <= 40; });
    var byDay = {}; near.forEach(function (e) { byDay[ymd(e.at)] = e; });
    var ev = Object.keys(byDay).map(function (d) { return byDay[d]; });
    if (ev.length < 3) return;
    var slot = k + '@' + Math.round(cur / 60), no = S.habitNo[slot] || {};
    if (no.never || (no.at && t - no.at < 7 * DAY)) return;
    var ms = ev.map(function (e) { return minOf(e.at); }).sort(function (a, b) { return a - b; }), med = ms[Math.floor(ms.length / 2)];
    med = Math.round(med / 5) * 5 % 1440;
    var wd = ev.map(function (e) { return new Date(e.at).getDay(); });
    var days = wd.every(function (d) { return d >= 1 && d <= 5; }) ? [1, 2, 3, 4, 5] : wd.every(function (d) { return d === 0 || d === 6; }) ? [0, 6] : [0, 1, 2, 3, 4, 5, 6];
    var fn = r.intent === 'shutter' ? MJ.shutterHabit : MJ.lightHabit;
    if (!fn) return;
    var q = 'J\'ai remarqué que vous me demandez souvent « ' + clean(text) + ' » vers ' + hSay(med) + '. Voulez-vous que je le fasse tout seul, ' + daysSay(days) + ', à ' + hSay(med) + ' ?';
    return X.ask(q, 'yesno', { yes: 'Oui, programme-le', k: 'Habitude' }).then(function (y) {
      if (!y) { no.at = t; no.n = (no.n || 0) + 1; if (no.n >= 2) no.never = true; S.habitNo[slot] = no; X.saveS(); return X.answer(no.never ? 'D\'accord, je ne vous le proposerai plus.' : 'D\'accord, je ne change rien.').done; }
      return fn(r.p, hhmm(med), days).then(function (res) {
        S.habitNo[slot] = { never: true }; X.saveS();
        if (!res) return X.answer({ say: 'Je n\'ai pas réussi à le programmer. Vous pouvez le faire dans les programmes de la maison.', cls: 'warn' }).done;
        return X.answer({ say: X.ack('C\'est programmé : ' + daysSay(days) + ' à ' + hSay(med) + '.'), html: '<div class="k">Habitude</div><p>Programmé : ' + esc(res.label || clean(text)) + ', ' + esc(daysSay(days)) + ' à ' + esc(hSay(med)) + '.</p><p class="note">Modifiable dans ' + esc(res.where) + ' (Programmes). Le téléphone doit être sur le Wi-Fi de la maison à cette heure-là.</p>' }).done;
      });
    });
  };

  /* ---------- 4. Révisions ---------- */
  var CAP = [['de la France', 'Paris'], ['de l\'Espagne', 'Madrid'], ['de l\'Italie', 'Rome'], ['de l\'Allemagne', 'Berlin'], ['du Portugal', 'Lisbonne'], ['de la Belgique', 'Bruxelles'], ['de la Suisse', 'Berne'], ['des Pays-Bas', 'Amsterdam'],
    ['du Royaume-Uni', 'Londres'], ['de l\'Irlande', 'Dublin'], ['de l\'Autriche', 'Vienne'], ['de la Pologne', 'Varsovie'], ['de la Grèce', 'Athènes'], ['de la Suède', 'Stockholm'], ['de la Norvège', 'Oslo'], ['du Danemark', 'Copenhague'],
    ['de la Finlande', 'Helsinki'], ['de la Hongrie', 'Budapest'], ['de la République tchèque', 'Prague'], ['de la Roumanie', 'Bucarest'], ['de la Bulgarie', 'Sofia'], ['de la Croatie', 'Zagreb'], ['de la Russie', 'Moscou'], ['de l\'Ukraine', 'Kiev', 'kyiv'],
    ['de la Turquie', 'Ankara'], ['de l\'Islande', 'Reykjavik'], ['du Maroc', 'Rabat'], ['de l\'Algérie', 'Alger'], ['de la Tunisie', 'Tunis'], ['du Sénégal', 'Dakar'], ['de l\'Égypte', 'Le Caire', 'caire'], ['du Mali', 'Bamako'],
    ['du Cameroun', 'Yaoundé'], ['de Madagascar', 'Antananarivo', 'tananarive'], ['du Kenya', 'Nairobi'], ['du Canada', 'Ottawa'], ['des États-Unis', 'Washington'], ['du Mexique', 'Mexico'], ['du Brésil', 'Brasilia'], ['de l\'Argentine', 'Buenos Aires'],
    ['du Chili', 'Santiago'], ['du Pérou', 'Lima'], ['de la Colombie', 'Bogota'], ['de Cuba', 'La Havane', 'havane'], ['du Japon', 'Tokyo'], ['de la Chine', 'Pékin', 'beijing'], ['de l\'Inde', 'New Delhi', 'delhi'], ['de l\'Australie', 'Canberra'],
    ['de la Nouvelle-Zélande', 'Wellington'], ['de la Corée du Sud', 'Séoul'], ['du Vietnam', 'Hanoï'], ['de la Thaïlande', 'Bangkok'], ['du Liban', 'Beyrouth'], ['de l\'Iran', 'Téhéran'], ['de l\'Arabie saoudite', 'Riyad']];
  function rnd(n) { return Math.floor(Math.random() * n); }
  function lev(a, b) { var m = [], i, j; for (i = 0; i <= a.length; i++) { m[i] = [i]; } for (j = 1; j <= b.length; j++) m[0][j] = j; for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; }
  function nkey(s) { return deacc(String(s || '')).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(le|la|les|l|c est|cest|c|est|ca|un|une|de|du|des|d)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
  function sameText(said, good) { var a = nkey(said), b = nkey(good); if (!a || !b) return false; return a === b || (' ' + a + ' ').indexOf(' ' + b + ' ') >= 0 || lev(a, b) <= Math.max(1, Math.floor(b.length / 5)); }
  function numIn(s) { var t = NLU.prep(String(s || ''), {}).t, m = /-?\d+(?:[.,]\d+)?/.exec(t); return m ? +m[0].replace(',', '.') : null; }
  var THEMES = {
    tables: { name: 'Tables de multiplication', gen: function (o) { var a = o.n || 2 + rnd(9), b = 1 + rnd(10); if (!o.n && Math.random() < .5) { var x = a; a = b; b = x; } return { q: a + ' fois ' + b + ' ?', show: a + ' × ' + b + ' = ?', num: a * b }; } },
    calcul: { name: 'Calcul mental', gen: function () { var k = rnd(3), a, b; if (k === 0) { a = 10 + rnd(90); b = 10 + rnd(90); return { q: a + ' plus ' + b + ' ?', show: a + ' + ' + b + ' = ?', num: a + b }; } if (k === 1) { a = 30 + rnd(70); b = 5 + rnd(a - 5); return { q: a + ' moins ' + b + ' ?', show: a + ' − ' + b + ' = ?', num: a - b }; } b = 2 + rnd(9); a = b * (2 + rnd(9)); return { q: a + ' divisé par ' + b + ' ?', show: a + ' ÷ ' + b + ' = ?', num: a / b }; } },
    capitales: { name: 'Capitales', gen: function (o) { var c = CAP[o.pool.pop()]; return { q: 'Quelle est la capitale ' + c[0] + ' ?', show: 'Capitale ' + c[0] + ' ?', txt: c[1], alt: c.slice(2) }; }, pool: CAP.length },
    fiches: { name: 'Mes fiches', gen: function (o) { var c = S.quizCards[o.pool.pop()]; return { q: c.q, show: c.q, txt: c.a }; }, pool: -1 }
  };
  function themeOf(s) {
    var t = deacc(String(s || '')).toLowerCase(), n = /\btables? (?:de |du )?(\d+)\b/.exec(NLU.prep(s || '', {}).t);
    if (/table|multipli/.test(t)) return { id: 'tables', n: n ? Math.max(1, Math.min(20, +n[1])) : 0 };
    if (/calcul|addition|soustraction|division|math/.test(t)) return { id: 'calcul' };
    if (/capitale|pays|geo/.test(t)) return { id: 'capitales' };
    if (/fiche|carte|perso|mes questions|cours/.test(t)) return { id: 'fiches' };
    return null;
  }
  function shuffled(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); for (var j = n - 1; j > 0; j--) { var k = rnd(j + 1), x = a[j]; a[j] = a[k]; a[k] = x; } return a; }
  H.quiz = function (p) {
    var th = themeOf(p.theme);
    var ids = ['tables', 'calcul', 'capitales'].concat(S.quizCards.length ? ['fiches'] : []);
    var pickTh = th ? Promise.resolve(th) : X.ask('Sur quoi voulez-vous réviser ? ' + ids.map(function (i) { return THEMES[i].name; }).join(', ') + ' ?', 'choice', { choices: ids.map(function (i) { return THEMES[i].name; }), k: 'Révision' }).then(function (v) {
      if (v == null) return null; if (typeof v === 'number') return ids[v - 1] ? { id: ids[v - 1] } : null; return themeOf(v);
    });
    return pickTh.then(function (o) {
      if (!o) return X.answer('D\'accord, une autre fois.').done;
      var T = THEMES[o.id];
      if (o.id === 'fiches' && !S.quizCards.length) { var c0 = X.answer({ say: 'Vous n\'avez pas encore de fiches. Ajoutez vos questions et réponses dans les réglages, Apprentissage.', html: '<p>Vous n\'avez pas encore de fiches.</p><div class="row"><button class="btn sm pri" data-tset>Ajouter des fiches</button></div>' }); c0.querySelector('[data-tset]').onclick = function () { X.settingsSheet('apprentissage'); }; return c0.done; }
      var total = o.id === 'fiches' ? Math.min(10, S.quizCards.length) : 10, pool = T.pool ? shuffled(T.pool === -1 ? S.quizCards.length : T.pool) : null, score = 0, i = 0, pre = 'C\'est parti : ' + total + ' questions. Dites « je ne sais pas » pour passer, ou « stop » pour arrêter. ';
      o.pool = pool;
      function next() {
        if (i >= total) {
          var t = 'Terminé : ' + score + ' sur ' + total + '. ' + (score === total ? 'Parfait, bravo !' : score >= total * 0.7 ? 'Très bien !' : score >= total / 2 ? 'Pas mal, on continue de réviser.' : 'Il faudra revoir ça, courage.');
          return X.answer({ say: pre + t, html: '<div class="k">' + esc(T.name) + '</div><div class="big">' + score + ' / ' + total + '</div><p>' + esc(t.replace(/^Terminé : \d+ sur \d+\. /, '')) + '</p>' }).done;
        }
        var Q = T.gen(o); i++;
        return X.ask(pre + Q.q, 'text', { k: T.name + ' · ' + i + '/' + total, show: (pre ? pre.replace(/ $/, '') + ' — ' : '') + Q.show, timeout: 60000 }).then(function (v) {
          if (v == null) return X.answer({ say: 'On s\'arrête là : ' + score + ' sur ' + (i - 1) + '.', k: T.name }).done;
          var good = Q.num != null ? numIn(v) === Q.num : sameText(v, Q.txt) || (Q.alt || []).some(function (a) { return sameText(v, a); });
          var skip = /\b(sais pas|sait pas|passe|aucune idee|joker)\b/.test(deacc(String(v)).toLowerCase());
          if (good) { score++; pre = ['Bravo !', 'Exact !', 'Bonne réponse !', 'Oui !'][rnd(4)] + ' '; }
          else pre = (skip ? 'La réponse était : ' : 'Non, c\'était : ') + (Q.num != null ? Q.num : Q.txt) + '. ';
          return next();
        });
      }
      return next();
    });
  };

  /* ---------- Réglages › Apprentissage ---------- */
  function html() {
    var l = learned(), h = '<div class="sect" id="f-apprentissage">Apprentissage</div>' +
      '<div class="set"><div class="t">Apprendre ce que je ne comprends pas<small>Je vous demande de le dire autrement, puis je retiens que c\'est la même chose.</small></div><label class="sw"><input type="checkbox" id="apOn"' + (S.learnOn ? ' checked' : '') + '><span></span></label></div>' +
      (X.PC ? '' : '<div class="set"><div class="t">Repérer vos habitudes<small>Volets et lumières : la même commande vers la même heure trois jours ou plus, et je propose de la programmer.</small></div><label class="sw"><input type="checkbox" id="apHab"' + (S.habitsOn ? ' checked' : '') + '><span></span></label></div>') +
      '<div class="set"><div class="t">Phrases apprises<small>Dites « quand je dis soirée film, ferme les volets du salon puis allume le salon à 20 % ».</small></div></div>' +
      (l.length ? l.map(function (r) { return '<div class="set"><div class="t">« ' + esc(r.phrase) + ' »<small>' + esc((r.steps || []).map(stepTxt).join(', puis ')) + '</small></div><button class="btn sm" data-apdel="' + esc(r.id) + '">Oublier</button></div>'; }).join('') : '<p class="note">Aucune pour le moment.</p>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><input class="in" id="apSay" placeholder="Quand je dis… (ex. soirée film)" style="flex:1 1 160px;min-width:0"><input class="in" id="apDo" placeholder="…fais (ex. ferme les volets puis éteins le salon)" style="flex:2 1 220px;min-width:0"><button class="btn sm pri" id="apAdd">Apprendre</button></div>' +
      '<div class="set"><div class="t">Fiches de révision<small>Vos questions et réponses : « interroge-moi sur mes fiches ». Aussi : tables, calcul mental, capitales.</small></div></div>' +
      S.quizCards.map(function (c, i) { return '<div class="set"><div class="t">' + esc(c.q) + '<small>' + esc(c.a) + '</small></div><button class="btn sm" data-qdel="' + i + '">Supprimer</button></div>'; }).join('') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0"><input class="in" id="qQ" placeholder="Question" style="flex:2 1 200px;min-width:0"><input class="in" id="qA" placeholder="Réponse" style="flex:1 1 120px;min-width:0"><button class="btn sm" id="qAdd">Ajouter</button></div>' +
      (X.PC ? '' : '<div class="row" style="display:flex;gap:8px;margin-top:6px"><button class="btn sm" id="apHabReset">Oublier mes habitudes</button></div>');
    return h;
  }
  function bind(b) {
    var $ = function (id) { return b.querySelector('#' + id); };
    if ($('apOn')) $('apOn').onchange = function () { S.learnOn = this.checked; X.saveS(); };
    if ($('apHab')) $('apHab').onchange = function () { S.habitsOn = this.checked; X.saveS(); };
    if ($('apAdd')) $('apAdd').onclick = function () {
      var s = $('apSay').value.trim(), d = $('apDo').value.trim(); if (!s || !d) { X.toast('Remplissez la phrase et ce qu\'il faut faire'); return; }
      var steps = splitActs(d).map(stepOf), bad = steps.filter(function (x) { return !x.ok; });
      if (bad.length) { X.toast('Je ne sais pas faire : ' + bad.map(function (x) { return x.txt; }).join(', ')); return; }
      saveLearned(s, steps.map(function (x) { return x.step; })); X.toast('Appris : « ' + clean(s) + ' »'); X.settingsSheet('apprentissage');
    };
    if ($('qAdd')) $('qAdd').onclick = function () { var q = $('qQ').value.trim(), a = $('qA').value.trim(); if (!q || !a) { X.toast('Question et réponse'); return; } S.quizCards.push({ q: q, a: a }); X.saveS(); X.settingsSheet('apprentissage'); };
    if ($('apHabReset')) $('apHabReset').onclick = function () { if (!confirm('Oublier les habitudes repérées et les propositions refusées ?')) return; X.lsSet(HK, []); S.habitNo = {}; X.saveS(); X.toast('Habitudes oubliées'); };
    b.addEventListener('click', function (e) {
      var d = e.target.closest('[data-apdel]'); if (d) { S.routines = S.routines.filter(function (r) { return r.id !== d.dataset.apdel; }); X.saveS(); X.settingsSheet('apprentissage'); return; }
      var q = e.target.closest('[data-qdel]'); if (q) { S.quizCards.splice(+q.dataset.qdel, 1); X.saveS(); X.settingsSheet('apprentissage'); }
    });
  }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + html(); };
  MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };

  if (X.HELP) X.HELP.splice(X.HELP.length - 1, 0, ['Apprentissage et révisions', ['Quand je dis soirée film, ferme les volets du salon puis allume le salon à 20 %', 'Apprends une nouvelle phrase', 'Qu\'est-ce que tu as appris ?', 'Oublie la phrase soirée film', 'Interroge-moi sur les capitales', 'Fais-moi réviser la table de 7', 'Un quiz de calcul mental', 'Interroge-moi sur mes fiches']]);
})();
