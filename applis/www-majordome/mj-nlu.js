/* =====================================================================
   Majordome : analyse des commandes en français (sans IA, sans réseau).
   MJNLU.parse(texte, ctx) → { intent, p: {paramètres}, t: texte normalisé, raw }
     ctx : { now (ms), names: ['majordome','jarvis'], expect: {intent, slot} | null,
             routines: [{id, name, phrase}], lists: ['courses', …] }
   Tolérant : majuscules, accents, ponctuation, nombres en lettres (« deux cent
   quarante », « soixante-dix », « quatre-vingt-dix »), formules de politesse,
   fautes de reconnaissance fréquentes (« quelle heure et il », « met »…).
   Aucune réponse n'est inventée : une phrase non reconnue donne
   { intent: 'unknown', p: { suggest } } avec l'exemple le plus proche.
   Utilisé tel quel par l'APK (applis/www-majordome) et par le PC (copie).
   ===================================================================== */
(function (root) {
  'use strict';
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;

  /* ---------------- Normalisation ---------------- */
  function deacc(s) { return String(s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Fautes de reconnaissance et variantes d'écriture (sur des mots déjà sans accents)
  var FIX = {
    'met': 'mets', 'mais': 'mets', 'mai': 'mai', 'rapel': 'rappel', 'rappelles': 'rappelle', 'rapelle': 'rappelle', 'appel': 'appelle',
    'minuterie': 'minuteur', 'minutteur': 'minuteur', 'timer': 'minuteur', 'chronometre': 'chrono', 'chronos': 'chrono',
    'wifi': 'wifi', 'wi': 'wi', 'pourcent': '%', 'pourcents': '%', 'euros': '€', 'euro': '€', 'eur': '€', 'balles': '€',
    'aujourdhui': 'aujourd hui', 'rdv': 'rendez vous', 'rendezvous': 'rendez vous', 'svp': 's il vous plait', 'stp': 's il te plait',
    'okay': 'ok', 'oké': 'ok', 'ouais': 'oui', 'ouaip': 'oui', 'yes': 'oui', 'nan': 'non', 'meteo': 'meteo', 'temperatures': 'temperature',
    'kilos': 'kilo', 'kilogrammes': 'kg', 'kilogramme': 'kg', 'grammes': 'g', 'gramme': 'g', 'tonnes': 'tonne', 'litres': 'litre',
    'metres': 'metre', 'centimetres': 'cm', 'centimetre': 'cm', 'millimetres': 'mm', 'millimetre': 'mm', 'kilometres': 'km', 'kilometre': 'km',
    'pouces': 'pouce', 'pieds': 'pied', 'bars': 'bar', 'degres': 'degre', 'secondes': 'seconde', 'minutes': 'minute', 'heures': 'heure',
    'jours': 'jour', 'semaines': 'semaine', 'centimes': 'centime', 'livres': 'livre', 'onces': 'once', 'gallons': 'gallon', 'miles': 'mile',
    'atmospheres': 'atm', 'atmosphere': 'atm', 'pascals': 'pa', 'pascal': 'pa', 'kilopascals': 'kpa', 'kilopascal': 'kpa', 'megapascals': 'mpa', 'megapascal': 'mpa',
    'millibars': 'mbar', 'millibar': 'mbar', 'noeuds': 'noeud', 'yards': 'yard', 'kelvins': 'kelvin', 'mn': 'minute', 'min': 'minute', 'mins': 'minute',
    'sec': 'seconde', 'secs': 'seconde', 'hrs': 'heure', 'fahrenheit': 'fahrenheit', 'farenheit': 'fahrenheit', 'farenheight': 'fahrenheit', 'celcius': 'celsius',
    'minuteurs': 'minuteur', 'heur': 'heure', 'chui': 'je suis', 'jsuis': 'je suis', 'texto': 'sms', 'textos': 'sms', 'textot': 'sms', 'massage': 'message', 'courses': 'courses'
  };
  var NUMW = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
    treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
    septante: 70, huitante: 80, octante: 80, nonante: 90, cent: 100, cents: 100, mille: 1000, mil: 1000, million: 1e6, millions: 1e6,
    milliard: 1e9, milliards: 1e9, premier: 1, premiere: 1 };
  // mots après lesquels « un / une » est un nombre (unités, durées, opérations)
  var UNITW = /^(seconde|minute|heure|h|jour|semaine|mois|an|ans|annee|annees|quart|quarts|demi|demie|€|centime|%|kilo|kg|g|tonne|litre|l|ml|metre|m|cm|mm|km|pouce|pied|mile|yard|degre|°|bar|psi|pa|kpa|mpa|atm|mbar|livre|once|gallon|noeud|plus|moins|fois|x|divise|sur|multiplie|puissance|et|virgule)$/;
  var OPW = /^(plus|moins|fois|x|divise|par|sur|multiplie|egal|a|de)$/;

  function tokenize(text) {
    var out = [], re = /\d+(?:[.,]\d+)?|[a-zà-ÿœæç]+|[%€°:\/+*=×÷]/gi, m;
    while ((m = re.exec(text))) {
      var raw = m[0], n = deacc(raw);
      if (/^\d/.test(n)) n = n.replace(',', '.');
      if (n === '×') n = 'fois'; if (n === '÷') n = 'divise';
      if (n === '*') n = 'fois';
      out.push({ n: n, s: m.index, e: m.index + raw.length });
    }
    // corrections mot à mot (les remplacements à deux mots sont éclatés en deux jetons)
    var res = [];
    out.forEach(function (t) {
      var f = Object.prototype.hasOwnProperty.call(FIX, t.n) ? FIX[t.n] : t.n;
      f.split(' ').forEach(function (w) { res.push({ n: w, s: t.s, e: t.e }); });
    });
    return res;
  }
  function isNumW(w) { return Object.prototype.hasOwnProperty.call(NUMW, w); }
  /** Regroupe les nombres écrits en lettres : [quinze][pour][cent] → 15 % ; « deux cent quarante » → 240 */
  function numberize(T) {
    var out = [], i = 0;
    function val(k) { return NUMW[T[k].n]; }
    // milliers séparés par une espace : « 1 250 » → 1250
    for (var q = 0; q < T.length - 1; q++) {
      while (T[q + 1] && /^\d{1,3}$/.test(T[q].n) && /^\d{3}(\.\d+)?$/.test(T[q + 1].n) && T[q + 1].s - T[q].e === 1 && !(q > 0 && /^\d+$/.test(T[q - 1].n))) {
        T.splice(q, 2, { n: T[q].n + T[q + 1].n, s: T[q].s, e: T[q + 1].e });
      }
    }
    while (i < T.length) {
      var w = T[i].n;
      // « pour cent » → %
      if (w === 'pour' && T[i + 1] && T[i + 1].n === 'cent' && (i === 0 || /^\d|^%$/.test(out.length ? out[out.length - 1].n : '') || true) && out.length && /^\d/.test(out[out.length - 1].n)) {
        out.push({ n: '%', s: T[i].s, e: T[i + 1].e }); i += 2; continue;
      }
      if (/^\d+(\.\d+)?$/.test(w) && T[i + 1] && T[i + 1].n === 'virgule' && T[i + 2] && (/^\d+$/.test(T[i + 2].n) || isNumW(T[i + 2].n))) {
        // 12 virgule 5 (chiffres) ou « douze virgule cinq » déjà converti
        var j0 = i + 2, dec = '', e0 = T[i + 1].e;
        if (/^\d+$/.test(T[j0].n)) { dec = T[j0].n; e0 = T[j0].e; j0++; }
        else { var r0 = readNumber(T, j0); if (r0) { dec = String(r0.v); e0 = T[r0.end - 1].e; j0 = r0.end; } }
        out.push({ n: w + '.' + dec, s: T[i].s, e: e0 }); i = j0; continue;
      }
      if ((w === 'dis' || w === 'sis') && T[i + 1] && /^(seconde|minute|heure|h|jour|€|%|kilo|kg|metre|bar)$/.test(T[i + 1].n)) { out.push({ n: w === 'dis' ? '10' : '6', s: T[i].s, e: T[i].e }); i++; continue; }
      if (isNumW(w) && !(w === 'premier' || w === 'premiere') ) {
        var r = readNumber(T, i);
        if (r) {
          var single = r.end - i === 1 && (w === 'un' || w === 'une');
          if (single) {
            var nx = T[r.end] ? T[r.end].n : '', pv = out.length ? out[out.length - 1].n : '';
            var numeric = UNITW.test(nx) || /^(plus|moins|fois|x|divise|multiplie)$/.test(pv) || /^\d/.test(nx) || (pv === 'a' && /^(heure|h)$/.test(nx));
            if (!numeric) { out.push(T[i]); i++; continue; }
          }
          var v = r.v, end = r.end;
          // décimales : « deux virgule cinq »
          if (T[end] && T[end].n === 'virgule' && T[end + 1]) {
            if (/^\d+$/.test(T[end + 1].n)) { out.push({ n: v + '.' + T[end + 1].n, s: T[i].s, e: T[end + 1].e }); i = end + 2; continue; }
            var r2 = readNumber(T, end + 1);
            if (r2) { out.push({ n: v + '.' + r2.v, s: T[i].s, e: T[r2.end - 1].e }); i = r2.end; continue; }
          }
          out.push({ n: String(v), s: T[i].s, e: T[end - 1].e }); i = end; continue;
        }
      }
      if ((w === 'premier' || w === 'premiere') && T[i + 1] && /^(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)$/.test(T[i + 1].n)) { out.push({ n: '1', s: T[i].s, e: T[i].e }); i++; continue; }
      if (w === 'er' && out.length && out[out.length - 1].n === '1') { i++; continue; }   // 1er
      out.push(T[i]); i++;
    }
    return out;
  }
  /** Lit un nombre en lettres à partir de T[i] → {v, end} (end exclu) ou null */
  function readNumber(T, i) {
    var total = 0, cur = 0, k = i, any = false, last = null;
    while (k < T.length) {
      var w = T[k].n;
      if (w === 'et' && any && T[k + 1] && /^(un|une|onze)$/.test(T[k + 1].n) && cur % 10 === 0 && cur % 100 >= 20) { k++; continue; }
      if (!isNumW(w) || w === 'premier' || w === 'premiere') break;
      var v = NUMW[w];
      if (v === 100) { if (cur % 100 === 0 && cur >= 100) break; cur = cur - cur % 100 + (cur % 100 || 1) * 100; }
      else if (v === 1000) { total += (cur || 1) * 1000; cur = 0; }
      else if (v >= 1e6) { total += (cur || 1) * v; cur = 0; }
      else if (v === 20 && last === 4 && cur % 100 === 4) { cur += 76; }             // quatre-vingt(s)
      else if (v >= 10 && v <= 19 && (cur % 100 === 60 || cur % 100 === 80)) { cur += v; }   // soixante-dix, quatre-vingt-onze
      else if (v >= 7 && v <= 9 && cur % 100 === 10 && last === 10) { cur += v; }   // dix-sept
      else if (v < 10 && cur % 100 >= 20 && cur % 10 === 0) { cur += v; }            // vingt-deux
      else if (v < 100 && v >= 20 && cur % 100 === 0) { cur += v; }
      else if (v < 20 && cur % 100 === 0) { cur += v; }
      else break;
      last = v; any = true; k++;
    }
    if (!any) return null;
    return { v: total + cur, end: k };
  }

  /** Prépare une phrase : jetons normalisés (avec position dans l'original) et texte de travail */
  function prep(raw, ctx) {
    var T = numberize(tokenize(String(raw || '')));
    // retire le mot de réveil et les formules de politesse en début et en fin de phrase
    var names = (ctx && ctx.names || []).map(deacc).concat(['majordome', 'jarvis', 'jarvice', 'jarvi', 'djarvis']);
    var lead = [['ok'], ['hey'], ['he'], ['eh'], ['dis'], ['alors'], ['bon'], ['euh'], ['heu'], ['allo'], ['et']];
    var polite = [['s', 'il', 'te', 'plait'], ['s', 'il', 'vous', 'plait'], ['merci'], ['est', 'ce', 'que', 'tu', 'peux'], ['est', 'ce', 'que', 'vous', 'pouvez'],
      ['tu', 'peux'], ['tu', 'pourrais'], ['peux', 'tu'], ['pourrais', 'tu'], ['pouvez', 'vous'], ['pourriez', 'vous'], ['vous', 'pouvez'],
      ['je', 'voudrais', 'que', 'tu'], ['je', 'veux', 'que', 'tu'], ['je', 'voudrais'], ['j', 'aimerais'], ['je', 'veux'], ['veux', 'tu'], ['voudrais', 'tu']];
    var nameToks = names.map(function (n) { return n.split(/\s+/); }).concat([['major', 'dome'], ['majors', 'dome'], ['jar', 'vis'], ['jarre', 'vis']]);
    function startsWith(seq, at) { for (var q = 0; q < seq.length; q++) if (!T[at + q] || T[at + q].n !== seq[q]) return false; return true; }
    var changed = true, guard = 0, wake = false;
    while (changed && guard++ < 12) {
      changed = false;
      if ((startsWith(['dis', 'moi'], 0) || startsWith(['dites', 'moi'], 0) || startsWith(['donne', 'moi'], 0) || startsWith(['donnez', 'moi'], 0)) && T.length > 2) { T = T.slice(2); changed = true; }
      for (var a = 0; a < lead.length; a++) if (startsWith(lead[a], 0) && T.length > lead[a].length && !(lead[a][0] === 'dis' && T[1] && /^(moi|a|au|lui|leur)$/.test(T[1].n))) { T = T.slice(lead[a].length); changed = true; }
      for (var b = 0; b < nameToks.length; b++) if (startsWith(nameToks[b], 0)) { T = T.slice(nameToks[b].length); changed = true; wake = true; }
      for (var c = 0; c < polite.length; c++) if (startsWith(polite[c], 0) && T.length > polite[c].length) { T = T.slice(polite[c].length); changed = true; }
      for (var d = 0; d < nameToks.length; d++) { var L = nameToks[d].length; if (T.length > L && startsWith(nameToks[d], T.length - L)) { T = T.slice(0, T.length - L); changed = true; wake = true; } }
      for (var e = 0; e < polite.length; e++) { var L2 = polite[e].length; if (T.length > L2 && startsWith(polite[e], T.length - L2) && polite[e][0] !== 'merci') { T = T.slice(0, T.length - L2); changed = true; } }
    }
    var text = '', pos = [];
    T.forEach(function (t, k) { if (k) text += ' '; pos.push(text.length); text += t.n; });
    return { T: T, t: text, pos: pos, raw: String(raw || ''), wake: wake };
  }
  /** Morceau de la phrase d'origine (accents, majuscules) correspondant à t[i0, i1) */
  function orig(P, i0, i1) {
    if (i1 == null) i1 = P.t.length;
    var a = -1, b = -1;
    for (var k = 0; k < P.T.length; k++) {
      var s = P.pos[k], e = s + P.T[k].n.length;
      if (e > i0 && s < i1) { if (a < 0) a = k; b = k; }
    }
    if (a < 0) return '';
    return P.raw.slice(P.T[a].s, P.T[b].e).replace(/^[\s,;:.!?«»"']+|[\s,;:.!?«»"']+$/g, '');
  }

  /* ---------------- Dates et heures ---------------- */
  var MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  var WDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var UNIT_MS = { seconde: 1000, s: 1000, minute: MIN, heure: HOUR, h: HOUR, jour: DAY, semaine: 7 * DAY };
  function startOfDay(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(ms, n) { var d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }

  /** Durée à la position de t (chaîne normalisée) : « 1 heure 30 », « 10 minute », « 1 quart d heure »… → {ms, i0, i1} */
  var DUR_RE = new RegExp('(?:(\\d+(?:\\.\\d+)?) (heure|h|minute|seconde|s|jour|semaine)(?: (?:et )?(\\d+)(?: (minute|seconde))?)?(?: et (demie?|quart))?' +
    '|(?:(\\d) )?quarts? d heure|(?:1 )?demie? heure|(?:1 )?demie? minute|(?:1 )?demie? journee|(\\d+) h (\\d+))', 'g');
  function durations(t) {
    var out = [], m; DUR_RE.lastIndex = 0;
    while ((m = DUR_RE.exec(t))) {
      var s = m[0], ms = 0;
      if (m[2]) {
        var u = UNIT_MS[m[2]] || MIN, v = parseFloat(m[1]);
        ms = v * u;
        if (m[3]) { var sub = m[4] ? UNIT_MS[m[4]] : (u === HOUR ? MIN : u === MIN ? 1000 : 0); ms += parseFloat(m[3]) * sub; }
        if (m[5]) ms += (/demi/.test(m[5]) ? 0.5 : 0.25) * u;
      } else if (/quarts? d heure/.test(s)) ms = (m[6] ? +m[6] : 1) * 15 * MIN;
      else if (/demie? heure/.test(s)) ms = 30 * MIN;
      else if (/demie? minute/.test(s)) ms = 30000;
      else if (/demie? journee/.test(s)) ms = 12 * HOUR;
      else if (m[7]) ms = +m[7] * HOUR + +m[8] * MIN;
      if (ms > 0) out.push({ ms: Math.round(ms), i0: m.index, i1: m.index + s.length });
    }
    return out;
  }

  /** Repère les expressions de temps dans t → {at, day, hasTime, hasDay, rel, spans, range, allDay} (at en ms) */
  function findWhen(t, now) {
    now = now || Date.now();
    var spans = [], res = { spans: spans, hasTime: false, hasDay: false, rel: false };
    function mark(i0, i1) { spans.push([i0, i1]); }
    function masked(i) { return spans.some(function (s) { return i >= s[0] && i < s[1]; }); }
    var m;
    // 1. relatif : « dans 10 minute », « dans 1 heure et demie »
    var dre = /\bdans (\d+(?:\.\d+)? (?:heure|h|minute|seconde|s|jour|semaine)\b(?: (?:et )?\d+(?: (?:minute|seconde))?)?(?: et (?:demie?|quart))?|(?:\d )?quarts? d heure|(?:1 )?demie? heure|(?:1 )?demie? minute|\d+ h \d+)/g;
    while ((m = dre.exec(t))) {
      var ds = durations(m[1]);
      if (ds.length) { res.at = now + ds[0].ms; res.rel = true; res.hasTime = true; res.relMs = ds[0].ms; mark(m.index, m.index + m[0].length); break; }
    }
    if (res.rel) return res;
    // 2. jour
    var day = null, dayRe;
    if ((m = /\b(apres demain)\b/.exec(t))) { day = startOfDay(addDays(now, 2)); mark(m.index, m.index + m[0].length); }
    else if ((m = /\b(avant hier)\b/.exec(t))) { day = startOfDay(addDays(now, -2)); mark(m.index, m.index + m[0].length); }
    else if ((m = /\b(demain)\b/.exec(t))) { day = startOfDay(addDays(now, 1)); mark(m.index, m.index + m[0].length); }
    else if ((m = /\b(hier)\b/.exec(t))) { day = startOfDay(addDays(now, -1)); mark(m.index, m.index + m[0].length); }
    else if ((m = /\b(aujourd hui|ce jour)\b/.exec(t))) { day = startOfDay(now); mark(m.index, m.index + m[0].length); }
    if (day == null && (m = /\b(?:le |ce |du |au )?(?:(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) )?(?:le )?(\d{1,2})(?: (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)| \/ (\d{1,2}))(?: (\d{4}))?\b/.exec(t))) {
      var dd = +m[2], mo = m[3] ? MONTHS.indexOf(m[3]) : +m[4] - 1, yy = m[5] ? +m[5] : new Date(now).getFullYear();
      if (dd >= 1 && dd <= 31 && mo >= 0 && mo < 12) {
        var dt = new Date(yy, mo, dd).getTime();
        if (!m[5] && dt < startOfDay(now)) dt = new Date(yy + 1, mo, dd).getTime();
        day = dt; mark(m.index, m.index + m[0].length);
      }
    }
    if (day == null && (dayRe = /\b(?:(ce|cette) )?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?: (prochain|qui vient|en huit))?\b/.exec(t))) {
      var wd = WDAYS.indexOf(dayRe[2]), cur = new Date(now).getDay(), diff = (wd - cur + 7) % 7;
      if (dayRe[3] === 'en huit') diff += 7;
      else if (diff === 0 && !dayRe[1]) diff = 7;
      day = startOfDay(addDays(now, diff)); mark(dayRe.index, dayRe.index + dayRe[0].length);
    }
    if (day == null && (m = /\b(?:le )?(\d{1,2})(?: du mois)?\b(?! ?(?:h|heure|minute|seconde|%|€|jour|semaine|mois))/.exec(t)) && /\ble \d{1,2}\b/.test(t.slice(m.index, m.index + 6))) {
      var d1 = +m[1];
      if (d1 >= 1 && d1 <= 31) { var nd = new Date(now); var cand = new Date(nd.getFullYear(), nd.getMonth(), d1).getTime(); if (cand < startOfDay(now)) cand = new Date(nd.getFullYear(), nd.getMonth() + 1, d1).getTime(); day = cand; mark(m.index, m.index + m[0].length); }
    }
    // moment de la journée
    var part = null;
    if ((m = /\b(ce soir|du soir|le soir|dans la soiree|cette nuit|de la nuit)\b/.exec(t))) { part = 'soir'; mark(m.index, m.index + m[0].length); }
    else if ((m = /\b(cet apres midi|de l apres midi|l apres midi|apres midi|de l aprem|cet aprem)\b/.exec(t))) { part = 'aprem'; mark(m.index, m.index + m[0].length); }
    else if ((m = /\b(ce matin|du matin|le matin|dans la matinee)\b/.exec(t))) { part = 'matin'; mark(m.index, m.index + m[0].length); }
    else if ((m = /\b(a midi|midi)\b/.exec(t)) && !/\bapres midi\b/.test(t)) { /* traité plus bas */ }
    var explicitDay = day != null;
    if (part && day == null) day = startOfDay(now);
    // 3. heure
    var hh = null, mm = 0, tm;
    if ((tm = /\b(?:a |vers |pour |des |de |a partir de |jusqu a )?(\d{1,2}) ?(?:h|heure)(?: ?(\d{1,2})(?! ?(?:minute|seconde|%|€|jour))(?: minute)?)?(?: (et demie?|et quart|moins le quart|moins (\d{1,2})))?\b/.exec(t)) && !masked(tm.index)) {
      hh = +tm[1]; mm = tm[2] ? +tm[2] : 0;
      if (tm[3] === 'et demi' || tm[3] === 'et demie') mm = 30; else if (tm[3] === 'et quart') mm = 15; else if (tm[3] === 'moins le quart') { hh -= 1; mm = 45; } else if (tm[4]) { hh -= 1; mm = 60 - +tm[4]; }
      mark(tm.index, tm.index + tm[0].length);
    } else if ((tm = /\b(?:a |vers |pour )?(\d{1,2}) : (\d{2})\b/.exec(t))) {
      hh = +tm[1]; mm = +tm[2]; mark(tm.index, tm.index + tm[0].length);
    } else if ((tm = /\b(?:a |vers |pour )?(midi|minuit)(?: (et demie?|et quart|moins le quart))?\b/.exec(t)) && !/\bapres midi\b/.test(t.slice(Math.max(0, tm.index - 6), tm.index + 5))) {
      hh = tm[1] === 'midi' ? 12 : 0; mm = 0;
      if (tm[2] && /demi/.test(tm[2])) mm = 30; else if (tm[2] === 'et quart') mm = 15; else if (tm[2] === 'moins le quart') { hh = (hh + 23) % 24; mm = 45; }
      mark(tm.index, tm.index + tm[0].length);
    }
    if (hh != null && hh >= 0 && hh <= 24 && mm >= 0 && mm < 60) {
      if (hh === 24) hh = 0;
      if ((part === 'soir' || part === 'aprem') && hh < 12) hh += 12;
      if (part === 'soir' && hh === 24) hh = 0;
      res.hasTime = true;
      var base = day != null ? day : startOfDay(now);
      var at = new Date(base); at.setHours(hh, mm, 0, 0);
      if (!explicitDay && at.getTime() <= now) {
        // heure passée aujourd'hui : demain (ou ce soir pour « 7 h » quand il est 15 h ? on garde la règle simple : prochaine occurrence)
        if (!part && hh < 12 && hh + 12 > new Date(now).getHours() && at.getTime() + 12 * HOUR > now && hh !== 0 && /\b(ce soir|tout a l heure|tantot)\b/.test(t)) at.setHours(hh + 12);
        else at = new Date(addDays(at.getTime(), 1));
        res.nextDay = true;
      }
      res.at = at.getTime();
    } else if (day != null) {
      res.at = part === 'soir' ? day + 20 * HOUR : part === 'aprem' ? day + 14 * HOUR : part === 'matin' ? day + 8 * HOUR : day;
      res.allDay = !part;
    }
    if (res.nextDay) day = startOfDay(res.at);
    if (day != null) { res.hasDay = explicitDay; res.day = day; }
    else if (res.at != null) res.day = startOfDay(res.at);
    res.part = part;
    return res;
  }
  /** Retire des morceaux (spans) d'une chaîne */
  function cut(t, spans) {
    var s = spans.slice().sort(function (a, b) { return b[0] - a[0]; }), r = t;
    s.forEach(function (x) { r = r.slice(0, x[0]) + ' ' + r.slice(x[1]); });
    return r.replace(/\s+/g, ' ').trim();
  }
  /** Version « originale » d'un texte normalisé obtenu en retirant des morceaux : on garde les jetons d'origine hors des spans */
  function origCut(P, from, to, spans) {
    var keep = [];
    for (var k = 0; k < P.T.length; k++) {
      var s = P.pos[k], e = s + P.T[k].n.length;
      if (s < from || e > to) continue;
      if (spans.some(function (x) { return s < x[1] && e > x[0]; })) continue;
      keep.push(k);
    }
    if (!keep.length) return '';
    // regroupe les jetons contigus pour garder la ponctuation et l'écriture d'origine
    var out = [], a = keep[0], b = keep[0];
    for (var i = 1; i < keep.length; i++) { if (keep[i] === b + 1) b = keep[i]; else { out.push(P.raw.slice(P.T[a].s, P.T[b].e)); a = b = keep[i]; } }
    out.push(P.raw.slice(P.T[a].s, P.T[b].e));
    return out.join(' ').replace(/\s+/g, ' ').replace(/^[\s,;:.!?«»"'-]+|[\s,;:.!?«»"'-]+$/g, '');
  }

  /* ---------------- Fêtes et dates connues ---------------- */
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  function lastSundayOfMay(y) { var d = new Date(y, 4, 31); d.setDate(31 - d.getDay()); return d; }
  var FETES = [
    { re: /\b(noel|la noel)\b/, n: 'Noël', f: function (y) { return new Date(y, 11, 25); } },
    { re: /\b(nouvel an|jour de l an|premier de l an|reveillon du nouvel an|saint sylvestre)\b/, n: 'le jour de l\'An', f: function (y) { return new Date(y, 0, 1); }, next: true },
    { re: /\b(paques)\b/, n: 'Pâques', f: easter },
    { re: /\b(ascension)\b/, n: 'l\'Ascension', f: function (y) { var e = easter(y); e.setDate(e.getDate() + 39); return e; } },
    { re: /\b(pentecote)\b/, n: 'la Pentecôte', f: function (y) { var e = easter(y); e.setDate(e.getDate() + 49); return e; } },
    { re: /\b(fete nationale|14 juillet)\b/, n: 'le 14 Juillet', f: function (y) { return new Date(y, 6, 14); } },
    { re: /\b(toussaint)\b/, n: 'la Toussaint', f: function (y) { return new Date(y, 10, 1); } },
    { re: /\b(armistice|11 novembre)\b/, n: 'le 11 Novembre', f: function (y) { return new Date(y, 10, 11); } },
    { re: /\b(fete du travail|1 mai)\b/, n: 'le 1er Mai', f: function (y) { return new Date(y, 4, 1); } },
    { re: /\b(8 mai|victoire 1945)\b/, n: 'le 8 Mai', f: function (y) { return new Date(y, 4, 8); } },
    { re: /\b(assomption|15 aout)\b/, n: 'l\'Assomption', f: function (y) { return new Date(y, 7, 15); } },
    { re: /\b(saint valentin)\b/, n: 'la Saint-Valentin', f: function (y) { return new Date(y, 1, 14); } },
    { re: /\b(halloween)\b/, n: 'Halloween', f: function (y) { return new Date(y, 9, 31); } },
    { re: /\b(fete des meres)\b/, n: 'la fête des Mères', f: function (y) { var d = lastSundayOfMay(y), p = easter(y); p.setDate(p.getDate() + 49); if (d.getTime() === p.getTime()) d.setDate(d.getDate() + 7); return d; } },
    { re: /\b(fete des peres)\b/, n: 'la fête des Pères', f: function (y) { var d = new Date(y, 5, 1); var add = (7 - d.getDay()) % 7; d.setDate(1 + add + 14); return d; } },
    { re: /\b(epiphanie|galette des rois)\b/, n: 'l\'Épiphanie', f: function (y) { return new Date(y, 0, 6); } },
    { re: /\b(chandeleur)\b/, n: 'la Chandeleur', f: function (y) { return new Date(y, 1, 2); } },
    { re: /\b(fete de la musique)\b/, n: 'la fête de la Musique', f: function (y) { return new Date(y, 5, 21); } }
  ];
  function nextFete(t, now) {
    for (var i = 0; i < FETES.length; i++) {
      if (!FETES[i].re.test(t)) continue;
      var y = new Date(now).getFullYear(), d = FETES[i].f(y);
      if (d.getTime() < startOfDay(now)) d = FETES[i].f(y + 1);
      return { name: FETES[i].n, at: d.getTime() };
    }
    return null;
  }

  /* ---------------- Calcul ---------------- */
  /** Évalue une expression dite : « 15 % de 240 », « 3 plus 4 fois 2 », « racine carree de 144 », « 2 puissance 10 » → nombre ou null */
  function calcExpr(t) {
    var s = ' ' + t + ' ';
    s = s.replace(/\b(combien (font|fait|ca fait|font|egal|egale)|ca fait combien|calcule|calcul|le resultat de|resultat de|combien|ca fait|fait|font|egal a|egale|egal|est egal a|c est combien|s il te plait|merci)\b/g, ' ');
    s = s.replace(/\bmultiplie(?:e|s)? par\b/g, ' * ').replace(/\bdivise(?:e|s)? par\b/g, ' / ').replace(/\bdivise\b/g, ' / ')
      .replace(/\bfois\b/g, ' * ').replace(/(\d) x (\d)/g, '$1 * $2').replace(/\bplus\b/g, ' + ').replace(/\bmoins\b/g, ' - ').replace(/\bsur\b/g, ' / ')
      .replace(/\b(puissance|exposant|a la puissance)\b/g, ' ^ ').replace(/\bau carre\b/g, ' ^ 2 ').replace(/\bau cube\b/g, ' ^ 3 ')
      .replace(/\bracine(?: carree)? (?:de |d )?/g, ' sqrt ').replace(/\b(la )?moitie (de |d )/g, ' 0.5 * ').replace(/\b(le )?double (de |d )/g, ' 2 * ')
      .replace(/\b(le )?triple (de |d )/g, ' 3 * ').replace(/\b(le )?tiers (de |d )/g, ' (1/3) * ').replace(/\b(le )?quart (de |d )/g, ' 0.25 * ')
      .replace(/(\d+(?:\.\d+)?) ?% (?:de |d |des |du )/g, ' $1 / 100 * ').replace(/(\d+(?:\.\d+)?) ?%/g, ' $1 / 100 ').replace(/€/g, ' ')
      .replace(/\b(le|la|les|de|d|du|des|a|et)\b/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (!/\d/.test(s) || /[a-z]{2,}/.test(s.replace(/sqrt/g, ''))) return null;
    var toks = s.match(/sqrt|\d+(?:\.\d+)?|[-+*/^()]/g); if (!toks) return null;
    var i = 0;
    function peek() { return toks[i]; }
    function expr() { var v = term(); while (peek() === '+' || peek() === '-') { var o = toks[i++], w = term(); v = o === '+' ? v + w : v - w; } return v; }
    function term() { var v = pow(); while (peek() === '*' || peek() === '/') { var o = toks[i++], w = pow(); v = o === '*' ? v * w : v / w; } return v; }
    function pow() { var v = unary(); if (peek() === '^') { i++; var w = pow(); v = Math.pow(v, w); } return v; }
    function unary() { if (peek() === '-') { i++; return -unary(); } if (peek() === 'sqrt') { i++; return Math.sqrt(unary()); } return prim(); }
    function prim() { var x = toks[i++]; if (x === '(') { var v = expr(); if (toks[i] === ')') i++; return v; } var n = parseFloat(x); if (isNaN(n)) throw new Error('nb'); return n; }
    try { var v = expr(); if (i !== toks.length || !isFinite(v)) return null; return v; } catch (e) { return null; }
  }

  /* ---------------- Conversions d'unités ---------------- */
  var UNITS = {
    mm: ['l', 0.001, 'millimètre'], cm: ['l', 0.01, 'centimètre'], m: ['l', 1, 'mètre'], metre: ['l', 1, 'mètre'], km: ['l', 1000, 'kilomètre'],
    pouce: ['l', 0.0254, 'pouce'], pied: ['l', 0.3048, 'pied'], yard: ['l', 0.9144, 'yard'], mile: ['l', 1609.344, 'mile'],
    g: ['w', 0.001, 'gramme'], kg: ['w', 1, 'kilo'], kilo: ['w', 1, 'kilo'], tonne: ['w', 1000, 'tonne'], livre: ['w', 0.45359237, 'livre'], once: ['w', 0.028349523125, 'once'],
    bar: ['p', 1e5, 'bar'], mbar: ['p', 100, 'millibar'], psi: ['p', 6894.757293168, 'psi'], pa: ['p', 1, 'pascal'], kpa: ['p', 1000, 'kilopascal'], mpa: ['p', 1e6, 'mégapascal'], atm: ['p', 101325, 'atmosphère'],
    litre: ['v', 0.001, 'litre'], l: ['v', 0.001, 'litre'], ml: ['v', 1e-6, 'millilitre'], gallon: ['v', 0.003785411784, 'gallon'], m3: ['v', 1, 'mètre cube'],
    kmh: ['s', 1 / 3.6, 'kilomètre-heure'], ms: ['s', 1, 'mètre par seconde'], noeud: ['s', 0.514444, 'nœud'], mph: ['s', 0.44704, 'mile par heure'],
    celsius: ['t', 'C', 'degré Celsius'], fahrenheit: ['t', 'F', 'degré Fahrenheit'], kelvin: ['t', 'K', 'kelvin']
  };
  function unitAt(t) {
    // repère les unités (formes normalisées) dans t, dans l'ordre
    var re = /(?:\b|°)(km \/ h|km h|kilometre heure|kilometres heure|m \/ s|metre par seconde|metre cube|degre celsius|degre fahrenheit|° ?c|° ?f|mm|cm|km|metre|m3|m|pouce|pied|yard|mile|kg|kilo|g|tonne|livre|once|mbar|bar|psi|kpa|mpa|pa|atm|litre|l|ml|gallon|noeud|mph|celsius|fahrenheit|kelvin|degre)\b/g, m, out = [];
    while ((m = re.exec(t))) {
      var u = m[1].replace(/\s+/g, ' ');
      if (/^(degre celsius|celsius|° ?c)$/.test(u)) u = 'celsius';
      else if (/^(degre fahrenheit|fahrenheit|° ?f)$/.test(u)) u = 'fahrenheit';
      else if (/^(km \/ h|km h|kilometres? heure)$/.test(u)) u = 'kmh';
      else if (/^(m \/ s|metre par seconde)$/.test(u)) u = 'ms';
      else if (u === 'metre cube') u = 'm3';
      else if (u === 'degre') u = 'deg?';
      out.push({ u: u, i: m.index, len: m[0].length });
    }
    return out;
  }
  // tuyauterie : diamètre nominal (pouces → DN, diamètre extérieur en mm, séries EN 10255 / ASME B36.10)
  var DN = [[0.125, 6, 10.2], [0.25, 8, 13.5], [0.375, 10, 17.2], [0.5, 15, 21.3], [0.75, 20, 26.9], [1, 25, 33.7], [1.25, 32, 42.4], [1.5, 40, 48.3],
    [2, 50, 60.3], [2.5, 65, 76.1], [3, 80, 88.9], [4, 100, 114.3], [5, 125, 139.7], [6, 150, 168.3], [8, 200, 219.1], [10, 250, 273], [12, 300, 323.9]];
  function convert(t) {
    if (!/\b(en|vers|convertis|convertir|conversion|combien de|combien d|ca fait combien)\b/.test(t)) return null;
    var us = unitAt(t);
    if (us.length < 2) return null;
    var a = us[0], b = us[us.length - 1];
    // « combien de psi font 6 bars » : l'unité cible est la première
    var target, source;
    var cm = /\bcombien (?:de |d )/.exec(t);
    if (cm && cm.index + cm[0].length === a.i) { target = a; source = us[1]; }
    else { source = a; target = b; for (var k = 1; k < us.length; k++) { if (/\b(en|vers)\s*$/.test(t.slice(0, us[k].i))) { target = us[k]; break; } } }
    if (source === target) return null;
    var su = source.u, tu = target.u;
    if (su === 'deg?') su = tu === 'fahrenheit' ? 'celsius' : tu === 'celsius' ? 'fahrenheit' : 'celsius';
    if (tu === 'deg?') tu = su === 'fahrenheit' ? 'celsius' : 'fahrenheit';
    if (!UNITS[su] || !UNITS[tu] || UNITS[su][0] !== UNITS[tu][0]) return { error: 'incompatible', from: su, to: tu };
    // valeur : nombre juste avant l'unité source (« 1 pouce et demi », « 3 / 4 de pouce », « 2 pouce 1 / 2 »)
    var before = t.slice(0, source.i).trim(), after = t.slice(source.i + source.len), v = null, m;
    if ((m = /(\d) quarts? (?:de |d )?$/.exec(before + ' '))) v = m[1] / 4;
    else if (/\bdemie? (?:de |d )?$/.test(before + ' ')) v = 0.5;
    else if ((m = /(\d+) \/ (\d+) (?:de |d )?$/.exec(before + ' '))) {
      var whole = /(\d+) (?:et )?(\d+) \/ (\d+) (?:de |d )?$/.exec(before + ' ');
      v = whole ? +whole[1] + whole[2] / whole[3] : m[1] / m[2];
    } else if ((m = /(\d+(?:\.\d+)?)\s*$/.exec(before))) v = parseFloat(m[1]);
    else if (/\bun$|\bune$/.test(before)) v = 1;
    if (v == null && (m = /^\s*(\d+(?:\.\d+)?)/.exec(after)) && cm) v = parseFloat(m[1]);
    if (v == null) { var m2 = /(\d+(?:\.\d+)?)/.exec(t); if (m2) v = parseFloat(m2[1]); }
    if (v == null) v = 1;
    if (/^ et demie?\b/.test(after)) v += 0.5; else if (/^ et quart\b/.test(after)) v += 0.25; else if ((m = /^ (\d) \/ (\d)/.exec(after))) v += m[1] / m[2];
    if (/^\s*-/.test(before.slice(-2)) || /\bmoins (\d+(?:\.\d+)?)\s*$/.test(before)) v = -Math.abs(v);
    var r;
    if (UNITS[su][0] === 't') {
      var c = su === 'celsius' ? v : su === 'fahrenheit' ? (v - 32) * 5 / 9 : v - 273.15;
      r = tu === 'celsius' ? c : tu === 'fahrenheit' ? c * 9 / 5 + 32 : c + 273.15;
    } else r = v * UNITS[su][1] / UNITS[tu][1];
    var o = { value: v, from: su, to: tu, result: r, kind: UNITS[su][0] };
    if (su === 'pouce' && (tu === 'mm' || tu === 'cm')) { var dn = DN.filter(function (x) { return Math.abs(x[0] - v) < 1e-6; })[0]; if (dn) o.dn = { dn: dn[1], od: dn[2] }; }
    if (tu === 'pouce' && su === 'mm') { var dn2 = DN.filter(function (x) { return Math.abs(x[2] - v) < 0.6; })[0]; if (dn2) o.dnFromOd = { inch: dn2[0], dn: dn2[1] }; }
    return o;
  }

  /* ---------------- Budget ---------------- */
  var CATS = [
    [/\b(carburant|essence|gasoil|gazole|diesel|sans plomb|plein|station service|super)\b/, 'c_carbu', 'Carburant'],
    [/\b(courses|supermarche|alimentation|epicerie|marche|nourriture|leclerc|carrefour|auchan|lidl|intermarche)\b/, 'c_courses', 'Alimentation'],
    [/\b(restaurant|resto|repas|dejeuner|diner|cafe|sandwich|boulangerie|kebab|pizza|mcdo|brasserie)\b/, 'c_resto', 'Restaurants'],
    [/\b(loyer)\b/, 'c_loyer', 'Loyer'], [/\b(charges|syndic)\b/, 'c_charges', 'Charges'],
    [/\b(electricite|edf)\b/, 'c_elec', 'Électricité'], [/\b(gaz)\b/, 'c_gaz', 'Gaz'], [/\b(eau)\b/, 'c_eau', 'Eau'],
    [/\b(peage|parking|autoroute|stationnement)\b/, 'c_transp', 'Transport'], [/\b(train|bus|metro|tram|billet|sncf|navigo|taxi|uber)\b/, 'c_tc', 'Transports en commun'],
    [/\b(garage|vidange|pneus?|entretien de la voiture|controle technique|reparation de la voiture)\b/, 'c_entr', 'Entretien'],
    [/\b(pharmacie|medicaments?)\b/, 'c_pharma', 'Pharmacie'], [/\b(medecin|docteur|dentiste|kine|ophtalmo|hopital|consultation)\b/, 'c_sante', 'Santé'],
    [/\b(mutuelle)\b/, 'c_mutu', 'Mutuelle'], [/\b(telephone|forfait)\b/, 'c_tel', 'Téléphone'], [/\b(internet|box)\b/, 'c_net', 'Internet'],
    [/\b(netflix|spotify|deezer|disney|streaming)\b/, 'c_stream', 'Streaming'], [/\b(abonnement)\b/, 'c_abo', 'Abonnements'],
    [/\b(cinema|loisirs?|sortie|concert|spectacle|jeu|jeux)\b/, 'c_loisirs', 'Loisirs'], [/\b(sport|salle de sport|piscine|club)\b/, 'c_sport', 'Sport'],
    [/\b(vetements?|habits|chaussures|pantalon|blouson|tenue)\b/, 'c_vet', 'Vêtements'], [/\b(shopping|amazon|achats? en ligne)\b/, 'c_shop', 'Shopping'],
    [/\b(bricolage|maison|meubles?|outils?|quincaillerie|materiel|brico|castorama|leroy merlin)\b/, 'c_maison', 'Maison'],
    [/\b(cadeaux?)\b/, 'c_cadeaux', 'Cadeaux'], [/\b(voyages?|hotel|avion|vacances)\b/, 'c_voyage', 'Voyages'],
    [/\b(impots?|taxe)\b/, 'c_impots', 'Impôts'], [/\b(frais bancaires|agios|commission)\b/, 'c_frais', 'Frais bancaires']
  ];
  var RCATS = [[/\b(salaire|paie|paye)\b/, 'c_salaire', 'Salaire'], [/\b(remboursements?|rembourse)\b/, 'c_rembt', 'Remboursements'],
    [/\b(caf|allocations?|prime)\b/, 'c_alloc', 'Allocations'], [/\b(vente|vendu|leboncoin|vinted)\b/, 'c_ventes', 'Ventes']];
  function amountOf(t) {
    var m;
    if ((m = /(\d+(?:\.\d+)?) ?€ (?:et )?(\d{1,2})\b(?! ?(?:h|heure|minute))/.exec(t))) return { cents: Math.round(parseFloat(m[1]) * 100) + (+m[2] < 10 && m[2].length === 1 ? +m[2] * 10 : +m[2]), i0: m.index, i1: m.index + m[0].length };
    if ((m = /(\d+(?:\.\d+)?) ?€/.exec(t))) return { cents: Math.round(parseFloat(m[1]) * 100), i0: m.index, i1: m.index + m[0].length };
    if ((m = /€ ?(\d+(?:\.\d+)?)/.exec(t))) return { cents: Math.round(parseFloat(m[1]) * 100), i0: m.index, i1: m.index + m[0].length };
    if ((m = /\b(\d+(?:\.\d+)?) centime\b/.exec(t))) return { cents: Math.round(parseFloat(m[1])), i0: m.index, i1: m.index + m[0].length };
    if ((m = /\b(?:depense|paye|achete|regle|recu|touche|de|pour)\s(\d+(?:\.\d+)?)\b(?! ?(?:h|heure|minute|%|jour|kilo|kg|litre|l|m|metre))/.exec(t))) return { cents: Math.round(parseFloat(m[1]) * 100), i0: m.index + m[0].indexOf(m[1]), i1: m.index + m[0].length, guess: true };
    return null;
  }

  /* ---------------- Applis de la Suite ---------------- */
  var APPS = [
    ['presentation', 'Présentation', 'fr.magformation13.presentation', /\b(presentations?|diaporamas?|power ?point|diapos?)\b/],
    ['texte', 'Texte', 'fr.magformation13.texte', /\b(textes?|traitement de texte|word|redaction)\b/],
    ['tableur', 'Tableur', 'fr.magformation13.tableur', /\b(tableurs?|tableaux?|excel|feuilles? de calcul|classeur)\b/],
    ['pdf', 'Atelier PDF', 'fr.magformation13.pdf', /\batelier (?:pdf|p d f)\b/],
    ['lecteur', 'Lecteur PDF', 'fr.magformation13.lecteur', /\b(lecteur (?:de )?(?:pdf|p d f)|(?:pdf|p d f)|lecteur de documents?)\b/],
    ['fichiers', 'Rangement', 'fr.magformation13.fichiers', /\b(rangements?|mes fichiers|fichiers|gestionnaire de fichiers|explorateur)\b/],
    ['echafaudage', 'Échafaudage', 'fr.magformation13.echafaudage', /\b(echafaudages?|echaf)\b/],
    ['agenda', 'Agenda', 'fr.magformation13.agenda', /\b(agenda|calendrier)\b/],
    ['contacts', 'Contacts', 'fr.magformation13.contacts', /\b(contacts?|repertoire)\b/],
    ['notes', 'Carnet', 'fr.magformation13.carnet', /\b(carnet|bloc notes?|keep)\b/],
    ['calcul', 'Calcul', 'fr.magformation13.calcul', /\b(calculatrice|calculette|calcul)\b/],
    ['meteo', 'Météo', 'fr.magformation13.meteo', /\b(meteo|l appli meteo|application meteo)\b/],
    ['ciel', 'Ciel', 'fr.magformation13.ciel', /\b(ciel)\b/],
    ['actualites', 'Actualités', 'fr.magformation13.actualites', /\b(actualites|actu|actus)\b/],
    ['budget', 'Budget', 'fr.magformation13.budget', /\b(budget|mes comptes)\b/],
    ['musique', 'Mélodie', 'fr.magformation13.musique', /\b(melodie|lecteur de musique|ma musique)\b/],
    ['ondes', 'Ondes', 'fr.magformation13.ondes', /\b(ondes|podcasts?)\b/],
    ['ecran', 'Écran', 'fr.magformation13.ecran', /\b(ecran|videos?)\b/],
    ['galerie', 'Galerie', 'fr.magformation13.galerie', /\b(galerie|mes photos|photos)\b/],
    ['photo', 'Photo', 'fr.magformation13.photo', /\b(appareil photo|camera|photo)\b/],
    ['scan', 'Scan', 'fr.magformation13.scan', /\b(scan|scanner|numeriser|numerisation)\b/],
    ['dicta', 'Dictaphone', 'fr.magformation13.dicta', /\b(dictaphone|dicta|enregistreur)\b/],
    ['coffre', 'Coffre', 'fr.magformation13.coffre', /\b(coffre|coffre fort|mots de passe)\b/],
    ['qr', 'QR', 'fr.magformation13.qr', /\b(qr|q r|code qr|qr code|lecteur qr|cache r)\b/],
    ['liseuse', 'Liseuse', 'fr.magformation13.liseuse', /\b(liseuse|livres?)\b/],
    ['reseau', 'Réseau', 'fr.magformation13.reseau', /\b(reseau|appli reseau)\b/],
    ['solaire', 'Solaire', 'fr.magformation13.solaire', /\b(solaire|panneaux solaires)\b/],
    ['sentiers', 'Sentiers', 'fr.magformation13.sentiers', /\b(sentiers?|randonnee|rando)\b/],
    ['reveil', 'Aube', 'fr.magformation13.reveil', /\b(aube|appli reveil)\b/],
    ['urgence', 'Urgence', 'fr.magformation13.urgence', /\b(urgence|sos)\b/],
    ['mesure', 'Mesure', 'fr.magformation13.mesure', /\b(mesure|niveau a bulle|sonometre)\b/],
    ['fonds', 'Toile', 'fr.magformation13.toile', /\b(toile|fonds? d ecran)\b/],
    ['sauvegarde', 'Sauvegarde', 'fr.magformation13.sauvegarde', /\b(sauvegarde)\b/],
    ['petitspas', 'Petits Pas', 'fr.magformation13.petitspas', /\b(petits pas|petit pas)\b/],
    ['chasse', 'Carnet de chasse', 'fr.magformation13.chasse', /\b(chasse|carnet de chasse)\b/],
    ['accueil', 'Socle', 'fr.magformation13.socle', /\b(socle|accueil)\b/]
  ];
  var SITES = [
    [/\b(youtube|you tube)\b/, 'YouTube', 'https://www.youtube.com/'], [/\b(wikipedia|wiki)\b/, 'Wikipédia', 'https://fr.wikipedia.org/'],
    [/\b(franceinfo|france info)\b/, 'franceinfo', 'https://www.franceinfo.fr/'], [/\b(vigilance meteo|vigilance)\b/, 'Vigilance Météo-France', 'https://vigilance.meteofrance.fr/'],
    [/\b(meteo france)\b/, 'Météo-France', 'https://meteofrance.com/'], [/\b(legifrance)\b/, 'Légifrance', 'https://www.legifrance.gouv.fr/'],
    [/\b(service public|service-public)\b/, 'Service-Public', 'https://www.service-public.fr/'], [/\b(impots|impot)\b/, 'impots.gouv', 'https://www.impots.gouv.fr/'],
    [/\b(ameli|securite sociale)\b/, 'ameli', 'https://www.ameli.fr/'], [/\b(caf)\b/, 'CAF', 'https://www.caf.fr/'],
    [/\b(leboncoin|le bon coin)\b/, 'leboncoin', 'https://www.leboncoin.fr/'], [/\b(openstreetmap|carte)\b/, 'OpenStreetMap', 'https://www.openstreetmap.org/'],
    [/\b(la poste|laposte)\b/, 'La Poste', 'https://www.laposte.fr/'], [/\b(sncf|train)\b/, 'SNCF Connect', 'https://www.sncf-connect.com/'],
    [/\b(doctolib)\b/, 'Doctolib', 'https://www.doctolib.fr/'], [/\b(inrs)\b/, 'INRS', 'https://www.inrs.fr/'],
    [/\b(oppbtp|preventionbtp|prevention btp)\b/, 'OPPBTP (preventionbtp.fr)', 'https://www.preventionbtp.fr/'], [/\b(france travail|pole emploi)\b/, 'France Travail', 'https://www.francetravail.fr/'],
    [/\b(geoportail)\b/, 'Géoportail', 'https://www.geoportail.gouv.fr/'], [/\b(cadastre)\b/, 'Cadastre', 'https://cadastre.data.gouv.fr/'],
    [/\b(github)\b/, 'GitHub', 'https://github.com/'], [/\b(atelier signature|suite mag)\b/, 'Suite MAG', 'https://gilbertmamadou-design.github.io/atelier-signature/pc/']
  ];
  function findApp(s) { for (var i = 0; i < APPS.length; i++) if (APPS[i][3].test(s)) return { id: APPS[i][0], name: APPS[i][1], pkg: APPS[i][2] }; return null; }
  function findSite(s) { for (var i = 0; i < SITES.length; i++) if (SITES[i][0].test(s)) return { name: SITES[i][1], url: SITES[i][2] }; return null; }

  /* ---------------- Lumières (Philips Hue, pont du réseau local : mj-maison.js) ----------------
     → { intent: 'light', p: { act, target, full, all, bri, dir, ct, color, scene, sceneFull, delay, at, ask } }
       act : on | off | bri | step (dir up/down) | ct | color | scene | scenes | query | list | screen | again
       target : nom de pièce, de zone ou d'ampoule, sans accents ni articles (« chambre de lea ») ; full : avec le nom
       commun (« lampe de chevet ») ; all : toute la maison. La correspondance avec les noms du pont se fait dans mj-maison.js. */
  var LNOUN = 'lumieres?|lampes?|ampoules?|eclairages?|plafonniers?|luminaires?|spots?|appliques?|lustres?|leds?|veilleuses?|guirlandes?|suspensions?|lampadaires?|luminosite';
  var LNOUN_RE = new RegExp('\\b(' + LNOUN + ')\\b');
  var LCOLORS = [[/^rouges?$/, 'rouge'], [/^(oranges?|orangee?s?)$/, 'orange'], [/^jaunes?$/, 'jaune'], [/^verte?s?$/, 'vert'], [/^bleue?s?$/, 'bleu'],
    [/^(violets?|violettes?|mauves?|pourpres?|lilas)$/, 'violet'], [/^(roses?|fuchsias?)$/, 'rose'], [/^(turquoises?|cyans?)$/, 'turquoise'], [/^magentas?$/, 'magenta'],
    [/^indigos?$/, 'indigo'], [/^(ambres?|dorees?|dores?)$/, 'ambre']];
  function colorWord(w) { for (var i = 0; i < LCOLORS.length; i++) if (LCOLORS[i][0].test(w)) return LCOLORS[i][1]; return null; }
  var LSTOP = /^(le|la|les|l|du|de|des|d|dans|au|aux|a|en|sur|pour|ma|mon|mes|notre|nos|ta|ton|tes|un|une|cette|ce|cet|ces|toute|tout|toutes|tous|qui|est|sont)$/;
  var LALL = /^(maison|appartement|logement|partout|ensemble|baraque|chez moi|chez nous|tout le monde|la maison|l appartement)$/;
  var LNOT = /^(lampe|lampe de poche|lampe torche|torche|flash|lampe du telephone|lumiere du telephone|flash du telephone|wifi|wi fi|bluetooth|blue tooth|son|volume|musique|radio|telephone|portable|micro|ecoute|ecoute continue|ecran|tele|television|tv|reveil|alarme|minuteur|chrono|chronometre|sonnerie|gps|localisation|position|donnees|ordinateur|pc|chauffage|radiateur|thermostat|clim|climatisation|four|volets?|stores?|vibreur|ne pas deranger|plein ecran|historique|mode \w+)$/;
  /** Désignation de la pièce ou de l'ampoule : « la lumière de la cuisine » → {target:'cuisine', full:'lumiere de la cuisine'} */
  function lightTarget(r) {
    var w = r.replace(/\b(s il te plait|s il vous plait|stp|svp|maintenant|aussi|tout de suite|immediatement|merci|encore)\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    var hadAll = w.some(function (x) { return /^(tout|toutes|tous|partout)$/.test(x); });
    while (w.length && LSTOP.test(w[0])) w.shift();
    while (w.length && LSTOP.test(w[w.length - 1]) && !/^(a|d|l)$/.test(w[w.length - 1])) w.pop();
    var full = w.join(' ');
    var plural = /^(lumieres|lampes|ampoules|spots|eclairages|leds|plafonniers|luminaires|appliques|veilleuses|guirlandes|suspensions|lampadaires)$/.test(w[0] || '');
    if (w.length && LNOUN_RE.test(w[0]) && new RegExp('^(' + LNOUN + ')$').test(w[0])) { w.shift(); while (w.length && LSTOP.test(w[0])) w.shift(); }
    var core = w.join(' ');
    if (LNOT.test(full)) return null;
    if (core && LALL.test(core)) return { all: true, target: null, full: full };
    if (!core) return { all: hadAll || plural, target: null, full: full };
    if (LNOT.test(core)) return null;
    return { all: false, target: core, full: full };
  }
  function parseLight(t, P, ctx, now) {
    if (/\b(liste|listes|note|rappelle|rappel|agenda|rendez vous)\b/.test(t)) return null;
    var s = t, p = {}, m;
    // minuterie : « dans 10 minutes », « dans une heure », « d'ici un quart d'heure », « à 23 h »
    var ds = durations(s);
    for (var i = 0; i < ds.length; i++) {
      var pre = s.slice(0, ds[i].i0), mm = /\b(dans|d ici) $/.exec(pre);
      if (mm) { p.delay = ds[i].ms; s = (pre.slice(0, mm.index) + ' ' + s.slice(ds[i].i1)).replace(/\s+/g, ' ').trim(); break; }
    }
    if (!p.delay && (m = /\ba (?:(\d{1,2}) (?:h|heure)(?: (\d{1,2}))?|minuit)\b/.exec(s)) && (LNOUN_RE.test(s) || /^(eteins|eteint|eteindre|eteignez|coupe|allume|allumez|rallume)\b/.test(s))) {
      var d = new Date(now), h = m[1] != null ? +m[1] : 0, mi = m[2] ? +m[2] : 0;
      if (h < 24 && mi < 60) { d.setHours(h, mi, 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1); p.at = d.getTime(); s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(); }
    }
    function out(act, extra) { p.act = act; for (var k in extra) if (extra[k] !== undefined) p[k] = extra[k]; return p; }
    function tgt(rest) { var x = lightTarget(rest); return x; }
    // « plus fort », « moins fort », « encore » juste après une commande de lumière
    if (ctx.lightRecent && /^(plus fort|moins fort|un peu plus fort|un peu moins fort|plus|moins|un peu plus|un peu moins|plus clair|plus sombre|plus lumineux|moins lumineux|encore|encore un peu|encore plus|encore moins)$/.test(s)) {
      if (/^encore( un peu)?$/.test(s)) return out('again', {});
      return out('step', { dir: /moins|sombre/.test(s) ? 'down' : 'up' });
    }
    // écran « Maison »
    if (/^(?:ouvre|affiche|montre|montre moi|va dans|va sur) (?:la |l |les |mes |l ecran )?(maison|domotique|lumieres|ecran maison|pieces)$/.test(s) || /^(maison|domotique)$/.test(s)) return out('screen', {});
    // liste des scènes
    if (/\b(quelles?|liste|lis|donne moi|montre|affiche|quels sont|c est quoi)\b.*\b(scenes|ambiances)\b/.test(s) || /^(mes |les )?(scenes|ambiances)$/.test(s)) return out('scenes', {});
    // état : « est-ce que la lumière du garage est allumée ? », « quelles lumières sont allumées ? »
    var verbStart = /^(allume|allumes|allumez|allumer|rallume|rallumez|eteins|eteint|eteindre|eteignez|eteigne|coupe|coupez|mets|met|baisse|augmente|monte)\b/.test(s);
    var adj = /\b(allumee?s?|eteinte?s?|eteints?)\b/;
    var isQ = /^(est ce que|est ce qu|est ce qui|y a t il|il y a|quelles?|quels?|combien|qu est ce qui|lesquelles|lesquels|dis moi si|dis moi quelles?|reste t il|ai je laisse|j ai laisse|tout est|toutes les|la lumiere|les lumieres|le |la |l )/.test(s) || /\b(est elle|est il|sont elles|sont ils|t elle|t il)\b/.test(s);
    if (!verbStart && adj.test(s) && isQ && (LNOUN_RE.test(s) || /\b(est|sont|tout|qu est ce qui|quoi|reste)\b/.test(s))) {
      var askOff = /\betein/.test(s.match(adj)[0]);
      var rest = s.replace(/^(est ce que|est ce qu|est ce qui|y a t il|il y a|dis moi si|dis moi|reste t il|ai je laisse|j ai laisse)\b/, ' ')
        .replace(/\b(est elle|est il|sont elles|sont ils|est|sont|t elle|t il|il|elle|elles|ils|encore|toujours|bien|deja|laisse|reste|restee?s?|y a|des|qu est ce qui|quoi)\b/g, ' ').replace(adj, ' ').replace(/\s+/g, ' ').trim();
      var list = /^(quelles?|quels?|combien|lesquelles|lesquels)\b/.test(rest) || /^(est ce qui|qu est ce qui|y a t il|il y a|reste t il|dis moi quelles?)\b/.test(s);
      rest = rest.replace(/^(quelles?|quels?|combien de|combien|lesquelles|lesquels)\b/, ' ').trim();
      var tq = tgt(rest);
      if (!tq) return null;
      if (list || tq.all || !tq.target) return out('list', { ask: askOff ? 'off' : 'on', target: tq.target, full: tq.full, all: !tq.target });
      return out('query', { ask: askOff ? 'off' : 'on', target: tq.target, full: tq.full });
    }
    // scènes : « active la scène Lecture », « mets l'ambiance détente dans le salon », « mets le salon en mode lecture »
    if ((m = /^(?:active|activez|lance|lancez|mets|met|passe|passez|demarre|joue|choisis|allume|bascule|on passe|je veux|rappelle)? ?(?:la |une |l |en )?(?:scene|ambiance|atmosphere)(?: (?:de |d |du |en mode |mode ))?(.*)$/.exec(s))) {
      var sr = m[1].trim(), room = null, sm2;
      if ((sm2 = /^(.+?) (?:dans|pour|au|sur|du|de la|de l) (.+)$/.exec(sr))) { var rt = tgt(sm2[2]); if (rt && (rt.target || rt.all)) { room = rt; sr = sm2[1]; } }
      sr = sr.replace(/^(?:la |le |l |les )/, '');
      return out('scene', { scene: sr || null, sceneFull: m[1].trim().replace(/^(?:la |le |l |les )/, '') || null, target: room ? room.target : null, full: room ? room.full : null, all: room ? room.all : false });
    }
    if ((m = /^(?:mets|met|passe|bascule|passez) (.+?) en mode (.+)$/.exec(s))) { var rm = tgt(m[1]); if (rm) return out('scene', { scene: m[2], sceneFull: m[2], target: rm.target, full: rm.full, all: rm.all }); }
    // couleur : « mets le salon en bleu », « lumière rouge dans la chambre », « change la couleur de la cuisine en vert »
    var ws = s.split(' '), ci = -1, col = null;
    for (var k2 = 0; k2 < ws.length; k2++) { var cw = colorWord(ws[k2]); if (cw) { ci = k2; col = cw; break; } }
    if (col && ws[ci + 1] === 'ciel' && col === 'bleu') col = 'bleu ciel';
    if (col) {
      var prev = ws[ci - 1] || '', lightish = LNOUN_RE.test(s) || /\bcouleur\b/.test(s) || prev === 'en';
      if (lightish && (verbStart || /^(passe|change|colore|fais|regle|choisis|lumiere|lumieres|en|couleur|eclairage)\b/.test(s) || LNOUN_RE.test(prev) || prev === 'en')) {
        var cut = ws.slice(); cut.splice(ci, col === 'bleu ciel' ? 2 : 1); if (prev === 'en') cut.splice(ci - 1, 1);
        var cs = cut.join(' ').replace(/^(mets|met|passe|passez|change|changez|colore|fais|regle|choisis|allume|allumez|rallume)\b ?/, '').replace(/\b(la |une )?couleur( de| du| des| d)?\b/, ' ').replace(/\s+/g, ' ').trim();
        var tc = tgt(cs); if (!tc) return null;
        return out('color', { color: col, target: tc.target, full: tc.full, all: tc.all });
      }
    }
    // température de blanc : « lumière chaude », « mets le salon en blanc froid », « lumière plus chaude »
    if ((m = /\b(?:(?:en |une |un )?(?:lumieres? |eclairage |blanc |ambiance )(?:plus |tres |bien )?|en (?:blanc )?(?:plus )?)(chaude?s?|froide?s?|neutres?|naturelle|tamisee|du jour)\b/.exec(s)) || (m = /^(?:mets |met )?(?:en )?(blanc)$/.exec(s)) || (m = /\ben (blanc)\b/.exec(s))) {
      var w0 = m[1], rel = /\bplus\b/.test(m[0]);
      var ct = /^chaud/.test(w0) ? (rel ? 'warmer' : 'warm') : /^froid|du jour/.test(w0) ? (rel ? 'cooler' : 'cold') : /tamisee/.test(w0) ? 'warm' : 'neutral';
      var cr = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/^ ?(mets|met|passe|regle|change|choisis|allume|allumez|fais|donne moi|je veux)\b/, ' ').replace(/\s+/g, ' ').trim();
      var tt = tgt(cr); if (!tt) return null;
      return out('ct', { ct: ct, bri: /tamisee/.test(w0) ? 30 : undefined, target: tt.target, full: tt.full, all: tt.all });
    }
    // luminosité : « mets le salon à 30 % », « lumière à fond », « baisse la lumière du salon », « plus de lumière »
    var hasLN = LNOUN_RE.test(s);
    var bri = null, bspan = null;
    if ((m = /\b(?:a|au|sur|de|en) (\d{1,3}) ?%/.exec(s)) || (m = /\b(\d{1,3}) ?%/.exec(s))) { bri = Math.min(100, +m[1]); bspan = m; }
    else if ((m = /\b(?:a|au) (\d{1,3})$/.exec(s)) && (hasLN || /^(mets|met|regle|allume|allumez|baisse|monte)\b/.test(s)) && +m[1] <= 100) { bri = +m[1]; bspan = m; }
    else if ((m = /\b(a fond|au max|au maximum|plein pot|a pleine puissance|en pleine puissance|au plus fort|au plus lumineux|a 100)\b/.exec(s))) { bri = 100; bspan = m; }
    else if ((m = /\b(au minimum|au mini|au plus bas|au plus faible|tout doux|en veilleuse|au plus sombre)\b/.exec(s))) { bri = 1; bspan = m; }
    else if ((m = /\b(a moitie|a la moitie|a mi puissance|a demi|a mi hauteur)\b/.exec(s))) { bri = 50; bspan = m; }
    else if ((m = /^(tamise|tamisez|attenue)\b/.exec(s))) { bri = 30; bspan = m; }
    if (bri != null && (hasLN || /^(mets|met|regle|reglez|allume|allumez|rallume|tamise|tamisez|attenue|baisse|monte|augmente|passe)\b/.test(s) || /\b(luminosite)\b/.test(s))) {
      var br = (s.slice(0, bspan.index) + ' ' + s.slice(bspan.index + bspan[0].length)).replace(/^ ?(mets|met|regle|reglez|allume|allumez|rallume|tamise|tamisez|attenue|baisse|monte|augmente|passe)\b/, ' ').replace(/\b(la )?luminosite( de| du| des| d)?\b/, ' ').replace(/\s+/g, ' ').trim();
      var tb = tgt(br); if (!tb) return null;
      return out(bri === 0 ? 'off' : 'bri', { bri: bri || undefined, target: tb.target, full: tb.full, all: tb.all });
    }
    var up = /^(augmente|augmentez|monte|montez|remonte|intensifie|eclaire plus|plus de lumiere|un peu plus de lumiere|mets plus de lumiere|donne moi plus de lumiere|il faut plus de lumiere|plus lumineux|plus clair)\b/.exec(s);
    var dn = !up && /^(baisse|baissez|diminue|diminuez|descends|reduis|reduisez|moins de lumiere|un peu moins de lumiere|mets moins de lumiere|moins lumineux|plus sombre|assombris)\b/.exec(s);
    if (up || dn) {
      var ur = s.slice((up || dn)[0].length).replace(/^ ?(un peu|d un cran|encore)\b/, ' ').replace(/\b(un peu|d un cran)\b/g, ' ').replace(/\b(la )?luminosite( de| du| des| d)?\b/, ' lumiere ').replace(/\s+/g, ' ').trim();
      if (hasLN || /lumiere/.test((up || dn)[0]) || /\b(lumineux|clair|sombre)\b/.test((up || dn)[0]) || ur && !/^(le |la |les |l )?(son|volume|musique|chauffage|radio|tele|sonnerie)\b/.test(ur) && /^(le |la |les |l )/.test(ur)) {
        var tu = tgt(ur); if (!tu) return null;
        return out('step', { dir: up ? 'up' : 'down', target: tu.target, full: tu.full, all: tu.all });
      }
    }
    // allumer / éteindre
    var on = /^(allume|allumes|allumez|allumer|rallume|rallumez|fais de la lumiere|de la lumiere|lumiere)\b ?/.exec(s);
    var off = !on && (/^(eteins|eteint|eteindre|eteignez|eteigne|eteinds|coupe|coupez)\b ?/.exec(s) || (hasLN && /^(ferme|fermez)\b ?/.exec(s)));
    if (on || off) {
      var orest = s.slice((on || off)[0].length).trim();
      if (on && /^lumiere/.test(on[0]) && orest && !/^(dans|du|de|des|d|au|aux|sur|partout)\b/.test(orest)) return null;
      if (/^(coupe|coupez)/.test((on || off)[0]) && !hasLN && !/^(tout|toutes|tous)\b/.test(orest) && !/^(le |la |les |l )/.test(orest)) return null;
      var to = tgt(orest); if (!to) return null;
      if (/^(coupe|coupez)/.test((on || off)[0]) && !hasLN && !to.all && !to.target) return null;
      if (!orest && !/lumiere/.test((on || off)[0])) return null;
      return out(on ? 'on' : 'off', { target: to.target, full: to.full, all: to.all });
    }
    return null;
  }

  /* ---------------- Climatisation (Panasonic Comfort Cloud) ----------------
     Majordome ne pilote pas la clim (pas d'API officielle Panasonic, pas d'émetteur infrarouge sur le téléphone) :
     il ouvre l'appli Comfort Cloud, et pour un réglage il le dit honnêtement (l'utilisateur passe par Alexa).
     → { intent: 'clim', p: { act: 'open' } } ou { act: 'ctl', what: on | off | temp | mode | fan | timer | query | other } */
  var CLIM_RE = /\b(clim|clims|clime|climatisation|climatiseurs?|air conditionne|pompe a chaleur)\b/;
  var CLIM_APP = /\b(comfort|confort) (cloud|clouds|clou|claude)\b|\bpanasonic\b/;
  function parseClim(t) {
    var app = CLIM_APP.test(t), dev = CLIM_RE.test(t);
    if (!app && !dev) {
      // sans le mot « clim » : seulement des formules propres à la clim
      if (/\btemperature (demandee|de consigne|reglee|programmee|affichee)\b/.test(t) || /\b(la )?consigne de temperature\b/.test(t)) return { act: 'ctl', what: 'query' };
      if (/^(?:mets |met |regle |passe )?(?:la )?ventilation (?:au |a |en |sur )?(maximum|max|fond|auto|automatique|minimum|mini|silencieuse?)\b/.test(t)) return { act: 'ctl', what: 'fan' };
      return null;
    }
    if (/\b(liste|listes|note|notes|rappelle|rappel|agenda|rendez vous|achete|acheter|courses)\b/.test(t)) return null;
    // ouvrir l'appli : « ouvre la clim », « lance Comfort Cloud », « l'appli de la clim »
    if (/^(ouvre|ouvrir|ouvrez|affiche|montre|montre moi|va dans|va sur|aller dans|aller sur|passe sur|bascule sur)\b/.test(t) && !/\b(fenetre|porte|volets?|stores?)\b/.test(t)) return { act: 'open' };
    if (app && !/\b(degres?|mode|ventilation|allume|eteins|eteint|eteindre|coupe|mets|met|regle|baisse|monte|augmente|diminue)\b/.test(t)) return { act: 'open' };
    if (/\b(appli|application)\b/.test(t)) return { act: 'open' };
    var what = /\b(eteins|eteint|eteindre|eteignez|coupe|coupez|arrete|arretez|stoppe|desactive)\b/.test(t) ? 'off'
      : /\b(pendant|dans|d ici|minuterie|programmateur|programme)\b/.test(t) && /\b(minutes?|heures?|h|quart|demi)\b/.test(t) ? 'timer'
      : /\b(quelle|quel|combien|est ce que|est elle|est il)\b/.test(t) ? 'query'
      : /\b(mode|froid|chaud|chauffage|deshumidific\w*|deshumidifie|sec|dry|ventilation seule)\b/.test(t) ? 'mode'
      : /\b(ventilation|ventilateur|vitesse|soufflerie)\b/.test(t) ? 'fan'
      : /\b\d{2}\b|\b(degres?|plus chaud|plus froid|plus frais|baisse|monte|augmente|diminue|temperature)\b/.test(t) ? 'temp'
      : /\b(allume|allumes|allumez|allumer|demarre|demarrez|lance|lancez|mets en marche|mets la|met la|active|activez|rallume)\b/.test(t) ? 'on' : 'other';
    return { act: 'ctl', what: what };
  }

  /* ---------------- Aide : exemples (servent aussi aux suggestions) ---------------- */
  var EXAMPLES = [
    ['time', 'Quelle heure est-il ?'], ['date', 'Quel jour sommes-nous ?'], ['countdown', 'Dans combien de jours est Noël ?'],
    ['calc', 'Combien font 15 % de 240 ?'], ['calc', 'Combien font 12 fois 8 ?'], ['convert', 'Convertis 2 pouces en millimètres'],
    ['convert', '20 degrés Celsius en Fahrenheit'], ['convert', 'Combien de psi font 6 bars ?'],
    ['timer', 'Mets un minuteur de 10 minutes'], ['stopwatch', 'Lance le chronomètre'], ['alarm', 'Réveille-moi demain à 6 h 30'],
    ['reminder', 'Rappelle-moi d\'appeler le plombier à 17 h'], ['reminder', 'Rappelle-moi dans 20 minutes de sortir le linge'],
    ['weather', 'Quel temps fait-il ?'], ['weather', 'Est-ce qu\'il va pleuvoir demain ?'], ['wind', 'Y a-t-il du vent pour monter l\'échafaudage ?'],
    ['vigilance', 'Y a-t-il une vigilance météo ?'], ['news', 'Les titres'], ['news', 'L\'essentiel de l\'actualité'],
    ['agenda', 'Qu\'est-ce que j\'ai aujourd\'hui ?'], ['agenda', 'Mes rendez-vous de demain'], ['agenda_add', 'Ajoute un rendez-vous chez le dentiste jeudi à 14 h'],
    ['note_add', 'Note : commander les vis de 6'], ['list_add', 'Ajoute du pain à la liste de courses'], ['list_read', 'Lis ma liste de courses'],
    ['budget_add', 'J\'ai dépensé 45 euros de carburant sur le compte courant'], ['open_app', 'Ouvre Présentation'], ['open_app', 'Ouvre le lecteur PDF'],
    ['music', 'Mets de la musique'], ['music', 'Chanson suivante'], ['call', 'Appelle Paul'], ['sms', 'Envoie un SMS à Paul : j\'arrive dans 10 minutes'],
    ['torch', 'Allume la lampe'], ['volume', 'Monte le son'], ['silent', 'Mode silencieux'], ['wifi', 'Active le Wi-Fi'], ['bluetooth', 'Ouvre le Bluetooth'],
    ['battery', 'Niveau de batterie'], ['fullscreen', 'Plein écran'], ['website', 'Ouvre YouTube'], ['routine', 'Bonjour Majordome'], ['routine', 'Bonne nuit'],
    ['light', 'Allume le salon'], ['light', 'Éteins tout'], ['light', 'Mets le salon à 30 %'], ['light', 'Mets la chambre en bleu'], ['light', 'Lumière chaude dans le salon'],
    ['light', 'Active la scène Lecture'], ['light', 'Quelles lumières sont allumées ?'], ['light', 'Éteins le salon dans 10 minutes'],
    ['clim', 'Ouvre la clim'], ['clim', 'Ouvre Comfort Cloud'],
    ['help', 'Qu\'est-ce que tu sais faire ?'], ['repeat', 'Répète'], ['stop', 'Stop']
  ];
  function grams(s) { var g = {}; s = ' ' + s + ' '; for (var i = 0; i < s.length - 2; i++) g[s.substr(i, 3)] = 1; return g; }
  function sim(a, b) { var A = grams(a), B = grams(b), n = 0, ka = Object.keys(A), kb = Object.keys(B); ka.forEach(function (k) { if (B[k]) n++; }); return n / Math.max(1, ka.length + kb.length - n); }
  function suggest(t) {
    var best = null, bs = 0;
    EXAMPLES.forEach(function (e) { var s = sim(t, prep(e[1], {}).t); if (s > bs) { bs = s; best = e; } });
    return bs >= 0.28 ? { intent: best[0], phrase: best[1], score: +bs.toFixed(2) } : null;
  }

  /* Correction orthographique prudente (pour proposer, jamais pour exécuter) : mots à une ou deux lettres près du vocabulaire */
  var VOCAB = null;
  function lev(a, b) {
    var d = [], i, j; for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function spell(t) {
    if (!VOCAB) {
      VOCAB = {};
      EXAMPLES.forEach(function (e) { prep(e[1], {}).t.split(' ').forEach(function (w) { if (w.length >= 4 && !/\d/.test(w)) VOCAB[w] = 1; }); });
      ('meteo demain minuteur reveil rappelle musique chanson suivante precedente agenda rendez vous liste courses note batterie volume silencieux lampe torche ' +
       'appelle message envoie ouvre presentation tableur texte rangement echafaudage budget depense carburant convertis pouces millimetres combien heure jour date ' +
       'semaine titres actualites essentiel pleuvoir temperature vigilance vent rafales chrono chronometre calcule aujourd bonjour bonne nuit routine').split(' ').forEach(function (w) { VOCAB[w] = 1; });
    }
    var words = Object.keys(VOCAB);
    return t.split(' ').map(function (w) {
      if (w.length < 4 || VOCAB[w] || /\d/.test(w)) return w;
      var best = w, bd = w.length >= 7 ? 3 : 2;
      words.forEach(function (v) { if (Math.abs(v.length - w.length) > 2) return; var d = lev(w, v); if (d < bd) { bd = d; best = v; } });
      return best;
    }).join(' ');
  }

  /* ---------------- Oui / non ---------------- */
  function yesNo(t) {
    if (/^(oui|ouais|ok|d accord|daccord|vas y|allez y|vas y envoie|envoie|envoie le|appelle|confirme|je confirme|confirmer|c est bon|parfait|exactement|tout a fait|absolument|bien sur|go|valide|valider|affirmatif|oui oui|oui vas y|oui envoie|oui merci|oui s il te plait|c est ca|exact|bien|ajoute|ajoute la|ajoute le|supprime|efface|vide|oui confirme|on y va|fais le)$/.test(t)) return 'yes';
    if (/^(non|non merci|annule|annuler|pas maintenant|laisse tomber|stop|arrete|surtout pas|negatif|pas question|non non|ne fais rien|oublie|rien|attends|attend|non annule|pas du tout|je ne veux pas)$/.test(t)) return 'no';
    if (/^oui\b/.test(t)) return 'yes';
    if (/^non\b/.test(t)) return 'no';
    return null;
  }

  /* ---------------- Analyse ---------------- */
  function parse(raw, ctx) {
    ctx = ctx || {};
    var now = ctx.now || Date.now();
    var P = prep(raw, ctx), t = P.t, m;
    function R(intent, p) { return { intent: intent, p: p || {}, t: t, raw: P.raw, wake: P.wake }; }
    if (!t) return R(P.wake ? 'wake' : 'empty');
    // réponse attendue (confirmation, précision)
    if (ctx.expect) {
      var ex = ctx.expect;
      if (ex.slot === 'yesno') { var yn = yesNo(t); if (yn) return R(yn === 'yes' ? 'confirm_yes' : 'confirm_no'); }
      if (ex.slot === 'when') { var w0 = findWhen(t, now); if (w0.at != null) return R('slot', { when: w0 }); if (yesNo(t) === 'no') return R('confirm_no'); }
      if (ex.slot === 'duration') { var d0 = durations(t); if (d0.length) return R('slot', { ms: d0[0].ms }); if (yesNo(t) === 'no') return R('confirm_no'); }
      if (ex.slot === 'text') { if (yesNo(t) === 'no' && t.split(' ').length <= 2) return R('confirm_no'); return R('slot', { text: P.raw.trim() }); }
      if (ex.slot === 'choice') { var nb = /^(?:le |la )?(\d|premier|premiere|deuxieme|second|seconde|troisieme)\b/.exec(t); if (nb) { var map = { premier: 1, premiere: 1, deuxieme: 2, second: 2, seconde: 2, troisieme: 3 }; return R('slot', { choice: map[nb[1]] || +nb[1] }); } if (yesNo(t) === 'no') return R('confirm_no'); return R('slot', { text: P.raw.trim() }); }
    }
    // --- formules courtes ---
    if (/^(stop|arrete|arrete toi|arrete de parler|tais toi|taisez vous|tais toi s il te plait|silence|chut|annule|annule tout|laisse tomber|oublie|ca suffit|c est tout|rien|non rien|ferme la|la ferme|stoppe)$/.test(t)) return R('stop');
    if (/^(merci|merci beaucoup|merci bien|merci a toi|merci mon ami|c est gentil|parfait merci|super merci|merci c est parfait|top merci|nickel merci|cool merci)$/.test(t)) return R('thanks');
    if (/^(repete|repetes|repeter|tu peux repeter|peux tu repeter|redis|redit|redis le|repete s il te plait|pardon|comment|hein|quoi|qu est ce que tu as dit|j ai pas compris|je n ai pas compris)$/.test(t)) return R('repeat');
    if (/^(oui|non|ok|d accord)$/.test(t)) return R(yesNo(t) === 'yes' ? 'confirm_yes' : 'confirm_no');
    // --- routines ---
    var routines = ctx.routines || [];
    for (var ri = 0; ri < routines.length; ri++) {
      var rp = prep(routines[ri].phrase || '', ctx).t;
      if (rp && (t === rp || t === 'routine ' + rp || t === 'lance la routine ' + rp || t === 'lance ' + rp)) return R('routine', { id: routines[ri].id });
    }
    if ((m = /^(?:lance|demarre|execute|fais|joue) (?:la )?routine (.+)$/.exec(t)) || (m = /^routine (.+)$/.exec(t))) return R('routine', { name: orig(P, m.index + m[0].length - m[1].length) });
    if (/^(bonjour|bonjour a toi|bon matin|salut bonjour|bonjour bonjour|debut de journee|on commence|briefing|le point du matin|ma journee|resume de la journee)$/.test(t)) return R('routine', { id: 'matin' });
    if (/^(bonne nuit|bonsoir et bonne nuit|je vais me coucher|je vais dormir|au lit|dodo|fin de journee|bonne soiree)$/.test(t)) return R('routine', { id: 'nuit' });
    if (/^(salut|coucou|hello|bonsoir|yo|hey)$/.test(t)) return R('greet', { kind: 'hello' });
    if (/^(ca va|comment ca va|comment vas tu|comment allez vous|tu vas bien|vous allez bien|la forme)$/.test(t)) return R('greet', { kind: 'howareyou' });
    if (/^(qui es tu|qui etes vous|tu es qui|c est quoi ton nom|comment tu t appelles|comment vous appelez vous|quel est ton nom|tu t appelles comment|presente toi)$/.test(t)) return R('greet', { kind: 'who' });
    if (/^(tu es la|t es la|es tu la|vous etes la|tu m entends|tu m ecoutes|test|test test|essai)$/.test(t)) return R('greet', { kind: 'here' });
    // --- climatisation (ouvrir Comfort Cloud ; réglage : réponse honnête) ---
    var cl = parseClim(t);
    if (cl) return R('clim', cl);
    // --- aide ---
    if (/\b(qu est ce que tu (sais|peux) faire|que (sais|peux) tu faire|tu (sais|peux) faire quoi|qu est ce que vous (savez|pouvez) faire|que (savez|pouvez) vous faire|liste des commandes|quelles (sont les )?commandes|comment ca marche|tes fonctions|quelles sont tes capacites|que puis je te demander|qu est ce que je peux te demander|aide moi)\b/.test(t) || /^(aide|l aide|help|au secours d utilisation|exemples|des exemples)$/.test(t)) return R('help');
    // --- réglages, écoute, historique ---
    if (/\b(efface|supprime|vide|nettoie|oublie)\b.*\bhistorique\b/.test(t)) return R('history_clear');
    if (/\b(arrete|cesse|desactive|coupe|stoppe|suspends?|eteins)\b.*\b(d ecouter|l ecoute|ecoute continue|le micro|ecouter|ton micro)\b/.test(t) || /^(mets toi en veille|va te coucher|veille|mode veille|ne m ecoute plus|ne m ecoutez plus)$/.test(t)) return R('listen_off');
    if (/\b(active|reprends|relance|allume|demarre)\b.*\b(l ecoute|ecoute continue|le micro|mot de reveil)\b/.test(t)) return R('listen_on');
    if ((m = /\bparle (plus|moins) (lentement|vite|rapidement|fort|doucement|grave|aigu)\b/.test(t) ? /\bparle (plus|moins) (lentement|vite|rapidement|fort|doucement|grave|aigu)\b/.exec(t) : null)) {
      var more = m[1] === 'plus', k = m[2];
      if (k === 'lentement') return R('voice', { rate: more ? -1 : 1 });
      if (k === 'vite' || k === 'rapidement') return R('voice', { rate: more ? 1 : -1 });
      if (k === 'fort') return R('voice', { volume: more ? 1 : -1 });
      if (k === 'doucement') return R('voice', { volume: more ? -1 : 1 });
      if (k === 'grave') return R('voice', { pitch: more ? -1 : 1 });
      if (k === 'aigu') return R('voice', { pitch: more ? 1 : -1 });
    }
    if (/\b(change (de |ta )?voix|autre voix|une autre voix)\b/.test(t)) return R('settings', { panel: 'voix' });
    if (/\b(ouvre|affiche|montre)\b.*\b(tes |les |mes )?(reglages|parametres|options)\b/.test(t) && !/\b(wifi|wi fi|bluetooth|telephone|son|volume|batterie)\b/.test(t)) return R('settings', { panel: '' });
    if ((m = /^(?:appelle moi|appelez moi|tu peux m appeler|tu m appelles|dorenavant appelle moi|maintenant appelle moi) (.+)$/.exec(t))) {
      var who = m[1];
      if (/^(monsieur|madame|mademoiselle)$/.test(who)) return R('address', { mode: who });
      if (/^(par mon prenom|par mon nom)$/.test(who)) return R('address', { mode: 'prenom' });
      if (!/^(un|une|le|la|les|des|du|quand|si|dans|demain|plus)\b/.test(who) && who.split(' ').length <= 3) return R('address', { mode: 'prenom', name: orig(P, m.index + m[0].length - who.length) });
    }
    if (/\b(ne m appelle plus|arrete de m appeler|plus de) (monsieur|madame)\b/.test(t)) return R('address', { mode: 'rien' });
    // --- solde : jamais lu (discrétion) ---
    if (/\b(solde|combien (j ai|il me reste|reste t il) (sur|dans|en|d argent)|argent (sur|dans) (mon|le|mes) comptes?|total (de |sur )?mes comptes|combien (sur|dans) mon compte|etat de mes comptes|ma situation bancaire|mon compte en banque)\b/.test(t)) return R('budget_balance');
    // --- budget : dépense / revenu ---
    var isRev = /\b(j ai recu|j ai touche|j ai encaisse|recu un virement|revenu de|ajoute un revenu|nouveau revenu|on m a rembourse|j ai ete rembourse|j ai vendu)\b/.test(t);
    if (isRev || /\b(j ai depense|j ai paye|j ai achete|j ai regle|depense de|une depense|ajoute (une )?depense|note (une )?depense|nouvelle depense|enregistre (une )?depense|ca m a coute|j ai claque|j ai mis)\b/.test(t)) {
      var am = amountOf(t);
      if (am && !/\bj ai mis\b/.test(t) || (am && /€/.test(t))) {
        var cats = isRev ? RCATS : CATS, cat = null;
        for (var ci = 0; ci < cats.length; ci++) if (cats[ci][0].test(t)) { cat = { id: cats[ci][1], name: cats[ci][2] }; break; }
        if (!cat) cat = isRev ? { id: 'c_autrerev', name: 'Autres revenus' } : { id: 'c_divers', name: 'Divers' };
        var acc = null, am2;
        if ((am2 = /\b(?:sur|dans|avec|depuis|du) (?:le |la |mon |ma )?(compte(?: [a-z]+)?|livret(?: a| [a-z]+)?|carte(?: [a-z]+)?|especes|liquide|cash|porte monnaie)\b/.exec(t))) {
          acc = am2[1].replace(/^carte.*$/, '').replace(/^(liquide|cash|porte monnaie)$/, 'especes');
          if (acc === 'especes') acc = 'Espèces'; else if (/^livret a$/.test(acc)) acc = 'Livret A';
          else if (acc) acc = orig(P, am2.index + am2[0].length - am2[1].length, am2.index + am2[0].length) || acc;
        }
        if (/\ben (especes|liquide|cash)\b/.test(t)) acc = 'Espèces';
        var pay = /\b(par carte|en carte|carte bleue|cb|carte bancaire)\b/.test(t) ? 'carte' : /\b(en especes|en liquide|cash)\b/.test(t) ? 'especes' : /\b(par cheque|en cheque|cheque)\b/.test(t) ? 'cheque' : /\b(par virement)\b/.test(t) ? 'virement' : '';
        var note = '', nm;
        if ((nm = /\b(?:chez|a|au) ([a-z][a-z ]{1,30}?)(?= sur | avec | par | en | dans |$)/.exec(t.slice(am.i1))) && !/^(la |le |l )?(compte|livret|carte|especes)/.test(nm[1])) {
          var base = am.i1; note = orig(P, base + nm.index + nm[0].length - nm[1].length, base + nm.index + nm[0].length);
        }
        var w = findWhen(t, now), date = w.hasDay ? w.day : startOfDay(now);
        return R('budget_add', { type: isRev ? 'rev' : 'dep', cents: am.cents, cat: cat.id, catName: cat.name, account: acc, pay: pay, note: note, date: date, guess: !!am.guess });
      }
      return R('budget_add', { missing: 'amount', type: isRev ? 'rev' : 'dep' });
    }
    // --- rappels ---
    var remList = /\b(quels sont|liste|lis|lis moi|mes|ai je des|j ai quels|montre)\b.*\brappels\b/.test(t) || /^(mes rappels|rappels)$/.test(t);
    if (remList) return R('reminder_list');
    if (/\b(annule|supprime|efface|enleve|retire|desactive)\b.*\b(rappel|rappels)\b/.test(t)) return R('reminder_cancel', { all: /\b(tous|toutes)\b/.test(t) });
    if ((m = /\b(rappelle moi|rappelez moi|rappel moi|rappelle nous|fais moi penser|fait moi penser|faites moi penser|n oublie pas de me rappeler|previens moi|pense a me rappeler|rappelle toi de me dire|mets (?:moi )?un rappel|cree un rappel|nouveau rappel|ajoute un rappel|programme un rappel|rappel)\b/.exec(t))) {
      var wr = findWhen(t, now), rest = cut(t.slice(m.index + m[0].length), []);
      var spans = wr.spans.map(function (s) { return [s[0], s[1]]; });
      var txtN = cut(t.slice(m.index + m[0].length), spans.map(function (s) { return [s[0] - m.index - m[0].length, s[1] - m.index - m[0].length]; }).filter(function (s) { return s[1] > 0; }));
      var txt = origCut(P, m.index + m[0].length, t.length, wr.spans);
      txt = txt.replace(/^(?:de |d'|d’|d |qu'|qu’|que |qu |pour |:\s*|à |a )/i, '').replace(/^(?:de |d'|d’)/i, '').trim();
      if (!txtN) txt = '';
      return R('reminder', { at: wr.at != null ? wr.at : null, text: txt, rel: !!wr.rel, nextDay: !!wr.nextDay });
    }
    // --- réveil ---
    if (/\b(reveil|reveils|alarme|alarmes|reveille moi|reveillez moi|reveiller|me reveiller|sonnerie du matin)\b/.test(t) && !/\b(app|appli|application|ouvre)\b/.test(t)) {
      if (/\b(quels sont|liste|mes reveils|mes alarmes|a quelle heure (sonne|est)|quand sonne|prochain reveil|il sonne a quelle heure|j ai un reveil|ai je un reveil)\b/.test(t)) return R('alarm_list');
      if (/\b(annule|supprime|efface|enleve|retire|desactive|arrete|coupe|stop)\b/.test(t)) {
        var wc = findWhen(t, now);
        return R('alarm_cancel', { at: wc.hasTime ? wc.at : null, all: /\b(tous|toutes)\b/.test(t), ringing: /\b(arrete|coupe|stop)\b/.test(t) && !wc.hasTime });
      }
      var wa = findWhen(t, now);
      return R('alarm', { at: wa.hasTime ? wa.at : null, nextDay: !!wa.nextDay });
    }
    // --- minuteur ---
    var hasTimer = /\b(minuteur|compte a rebours|minute heure|sablier)\b/.test(t);
    if (hasTimer || /^(\d+ (minute|seconde|heure))( \d+)?$/.test(t)) {
      if (/\b(annule|supprime|efface|arrete|stoppe|stop|coupe|enleve|retire|desactive)\b/.test(t)) return R('timer_cancel', { all: /\b(tous|toutes)\b/.test(t) });
      if (/\b(combien de temps|reste t il|il reste|restant|ou en est|temps restant|reste combien)\b/.test(t)) return R('timer_query');
      var ds = durations(t), lab = '';
      if ((m = /\bpour (?:les |la |le |l )?([a-z][a-z ]{1,30})$/.exec(cut(t, ds.map(function (d) { return [d.i0, d.i1]; }))))) lab = m[1];
      if (lab && /^(minute|seconde|heure)/.test(lab)) lab = '';
      return R('timer', { ms: ds.length ? ds[0].ms : null, label: lab ? orig(P, t.lastIndexOf(lab), t.lastIndexOf(lab) + lab.length) : '' });
    }
    if (/\b(combien de temps (reste t il|il reste|me reste t il)|temps restant)\b/.test(t)) return R('timer_query');
    // --- chronomètre ---
    if (/\bchrono\b/.test(t)) {
      if (/\b(remets? a (?:zero|0)|remise a (?:zero|0)|a 0|reinitialise|efface|raz|reset|recommence)\b/.test(t)) return R('stopwatch', { cmd: 'reset' });
      if (/\b(arrete|stop|stoppe|pause|bloque|fige|coupe)\b/.test(t)) return R('stopwatch', { cmd: 'stop' });
      if (/\b(combien|ou en est|temps|il affiche|dis moi)\b/.test(t) && !/\b(lance|demarre|declenche|commence|start|mets|active|reprends)\b/.test(t)) return R('stopwatch', { cmd: 'query' });
      return R('stopwatch', { cmd: 'start' });
    }
    // --- appels et SMS ---
    if ((m = /^(?:envoie|envoyer|envoi|ecris|ecrit|ecrire|redige|tape|manda) (?:un |une )?(?:sms|message|msg|petit message) (?:a|au|aux|pour) (.+)$/.exec(t)) || (m = /^(?:sms|message) (?:a|au|pour) (.+)$/.exec(t)) || (m = /^(?:ecris|ecrit|dis|dit|previens) (?:a|au) (.+?) (?:que|qu) (.+)$/.exec(t))) {
      var rest2 = m[1], toN = rest2, bodyN = '', sep;
      if (m[2]) { toN = m[1]; bodyN = m[2]; }
      else if ((sep = /^(.+?) (?::|disant|pour dire|pour lui dire|en disant|qui dit|dis lui|dites lui|que|qu|avec le texte|texte) (.+)$/.exec(rest2))) { toN = sep[1]; bodyN = sep[2]; }
      var base2 = t.indexOf(toN, m.index);
      var toO = orig(P, base2, base2 + toN.length), bodyO = bodyN ? orig(P, t.lastIndexOf(bodyN)) : '';
      if (m[2]) bodyO = orig(P, t.lastIndexOf(bodyN));
      // dans l'original, le texte après « : » est gardé tel quel
      var colon = P.raw.indexOf(':');
      if (colon > 0 && !m[2]) { var aft = P.raw.slice(colon + 1).trim(); if (aft) { bodyO = aft; var bt = prep(aft, {}).t; if (t.lastIndexOf(bt) > 0) toO = orig(P, base2, t.lastIndexOf(bt)).replace(/\s*:\s*$/, ''); } }
      return R('sms', { to: toO.replace(/^(a|à|au)\s+/i, ''), number: digits(toO), text: bodyO });
    }
    if ((m = /^(?:appelle|appeler|appelez|telephone a|telephone au|telephoner a|passe un coup de fil a|passe moi|compose le|compose|a pelle|appelle le|appelle la) (.+)$/.exec(t)) && !/^(moi|nous)\b/.test(m[1])) {
      var whoO = orig(P, m.index + m[0].length - m[1].length);
      return R('call', { to: whoO.replace(/^(le|la|l'|au)\s+/i, ''), number: digits(whoO) });
    }
    // --- lumières de la maison (Philips Hue) ---
    var lg = parseLight(t, P, ctx, now);
    if (lg) return R('light', lg);
    // --- téléphone : lampe, volume, silencieux, wifi, bluetooth, batterie ---
    if (/\b(lampe|torche|lampe de poche|flash|lumiere du telephone)\b/.test(t) && !/\b(achete|liste)\b/.test(t)) return R('torch', { on: !/\b(eteins|eteint|eteindre|coupe|desactive|arrete|stop|ferme)\b/.test(t) });
    if (/\b(mode silencieux|silencieux|mode vibreur|vibreur|ne pas deranger|mode silence|mode avion|mode normal|mode sonnerie|remets la sonnerie|reactive la sonnerie)\b/.test(t)) {
      var off = /\b(desactive|enleve|retire|quitte|sors|arrete|coupe le mode|remets la sonnerie|reactive la sonnerie|mode normal|mode sonnerie)\b/.test(t);
      var mode = /avion/.test(t) ? 'avion' : /vibreur/.test(t) ? 'vibrate' : /ne pas deranger/.test(t) ? 'dnd' : 'silent';
      if (/\b(mode normal|mode sonnerie|remets la sonnerie|reactive la sonnerie)\b/.test(t)) mode = 'normal';
      return R('silent', { mode: mode, off: off });
    }
    if (/\b(volume|le son|plus fort|moins fort|monte le son|baisse le son|coupe le son|mets le son|remets le son)\b/.test(t) && !/\b(musique suivante)\b/.test(t)) {
      var lvl = /\b(?:a|au|sur) (\d+) ?%/.exec(t) || /\bvolume (?:a|au|sur) (\d+)\b/.exec(t);
      var dir = /\b(coupe|muet|sourdine|mute)\b/.test(t) ? 'mute' : /\b(au max|maximum|a fond|au maximum|max)\b/.test(t) ? 'max' : /\b(monte|augmente|plus fort|hausse|monter|plus haut|remets)\b/.test(t) ? 'up' : /\b(baisse|diminue|moins fort|descends|descend|plus bas|reduis)\b/.test(t) ? 'down' : lvl ? 'set' : 'query';
      return R('volume', { dir: dir, level: lvl ? Math.min(100, +lvl[1]) : null, stream: /\b(sonnerie)\b/.test(t) ? 'ring' : /\b(alarme|reveil)\b/.test(t) ? 'alarm' : 'music' });
    }
    if (/\b(wifi|wi fi)\b/.test(t)) return R('wifi', { on: /\b(active|allume|connecte|mets|ouvre|demarre|branche)\b/.test(t) ? true : /\b(desactive|coupe|eteins|deconnecte|arrete)\b/.test(t) ? false : null });
    if (/\b(bluetooth|blue tooth|bluetouth)\b/.test(t)) return R('bluetooth', { on: /\b(active|allume|connecte|mets|ouvre|demarre)\b/.test(t) ? true : /\b(desactive|coupe|eteins|deconnecte|arrete)\b/.test(t) ? false : null });
    if (/\b(batterie|charge du telephone|niveau de charge|autonomie|pourcentage de charge)\b/.test(t)) return R('battery');
    if (/\bplein ecran\b/.test(t)) return R('fullscreen', { on: !/\b(quitte|sors|sortir|enleve|desactive|arrete|reduis)\b/.test(t) });
    // --- musique ---
    if (/^(pause|mets en pause|mets pause|pause la musique|arrete la musique|stop la musique|coupe la musique|stoppe la musique|eteins la musique|arrete le son de la musique)$/.test(t) || /\b(mets la musique en pause|pause musique)\b/.test(t)) return R('music', { cmd: 'pause' });
    if (/\b(chanson suivante|morceau suivant|titre suivant|piste suivante|musique suivante|passe a la suivante|suivant|suivante|next|zappe|passe la chanson|change de chanson|chanson d apres)\b/.test(t)) return R('music', { cmd: 'next' });
    if (/\b(chanson precedente|morceau precedent|titre precedent|piste precedente|precedent|precedente|reviens a la chanson d avant|chanson d avant)\b/.test(t)) return R('music', { cmd: 'prev' });
    if (/\b(reprends la musique|relance la musique|continue la musique|remets la musique|reprise de la musique|lecture)\b/.test(t) || /^(reprends|reprend|play|continue)$/.test(t)) return R('music', { cmd: 'play' });
    if (/\b(mets|joue|lance|demarre|passe|ecouter|ecoute|je veux|j ai envie)\b.*\b(musique|chanson|chansons|zik|playlist|morceau|son)\b/.test(t) || /^(musique|de la musique|un peu de musique)$/.test(t)) return R('music', { cmd: 'start' });
    // --- conversions et calculs ---
    var cv = convert(t);
    if (cv && !cv.error) return R('convert', cv);
    if (cv && cv.error) return R('convert', cv);
    // --- dates, fêtes ---
    var fete = nextFete(t, now);
    if (/\b(dans combien de (jour|temps|semaine|mois)|combien de (jour|semaine|nuits?|mois) (avant|jusqu a|jusqu au|reste t il avant|il reste avant|d ici|reste avant|restent avant)|combien de temps (avant|jusqu a|jusqu au|d ici)|c est quand|quand est ce|quand est|quand tombe|quel jour tombe|ca tombe quel jour|c est quel jour)\b/.test(t)) {
      if (fete) return R('countdown', { name: fete.name, at: fete.at, ask: /\b(quel jour|quand)\b/.test(t) && !/\bcombien\b/.test(t) ? 'day' : 'count' });
      var wd2 = findWhen(t, now);
      if (wd2.hasDay) return R('countdown', { name: '', at: wd2.day, ask: /\b(quel jour|quand)\b/.test(t) && !/\bcombien\b/.test(t) ? 'day' : 'count' });
      if (/\b(anniversaire|vacances|conges|week end|weekend)\b/.test(t)) return R('countdown', { unknown: true });
    }
    if (/\b(quel jour (sommes nous|on est|est on|nous sommes|est il|c est|aujourd hui|serons nous|sera t il|etait hier|etions nous|on sera|sera demain)|quelle (est la )?date|on est le combien|nous sommes le combien|la date (d aujourd hui|de demain|du jour)|c est quoi la date|on est quel jour|quel jour c est|quelle date|en quelle annee|quelle annee|quel mois|on est en quel mois|quelle semaine|numero de la semaine|quel est le numero de semaine)\b/.test(t) || /^(la date|date|aujourd hui|quel jour)$/.test(t)) {
      var off = /\bdemain\b/.test(t) ? 1 : /\bhier\b/.test(t) ? -1 : /\bapres demain\b/.test(t) ? 2 : 0;
      if (/\bapres demain\b/.test(t)) off = 2;
      return R('date', { offset: off, what: /\bannee\b/.test(t) ? 'year' : /\bmois\b/.test(t) ? 'month' : /\bsemaine\b/.test(t) ? 'week' : 'date' });
    }
    if (/\b(quel(le)? heure|qu elle heure|l heure qu il est|l heure s il|il est quelle heure|il est quel heure|donne moi l heure|tu as l heure|vous avez l heure|heure actuelle|quelle heure il est)\b/.test(t) || /^(l heure|heure|quelle heure)$/.test(t)) {
      if (!/\b(rendez vous|agenda|reunion|demain|a quelle heure (est|commence|finit|ferme|ouvre)|leve|couche|soleil|pleuvoir|pluie)\b/.test(t)) return R('time');
      if (/\b(lever|leve|coucher|couche)\b.*\bsoleil\b/.test(t)) return R('sun', { what: /\b(lever|leve)\b/.test(t) ? 'rise' : 'set' });
    }
    if (/\b(lever|leve|coucher|couche) du soleil\b/.test(t)) return R('sun', { what: /\b(lever|leve)\b/.test(t) ? 'rise' : 'set' });
    var cx = (/\b(combien (font|fait|ca fait|egal|egale)|calcule|calcul|ca fait combien|racine|au carre|au cube|puissance|pour cent|fois|divise|multiplie|plus|moins|la moitie|le double|le triple|le tiers)\b/.test(t) || /%/.test(t)) && /\d/.test(t);
    if (cx) { var v = calcExpr(t); if (v != null) return R('calc', { value: v, expr: t }); if (/\b(combien font|calcule|calcul)\b/.test(t)) return R('calc', { value: null, expr: t }); }
    // --- agenda ---
    var agQ = /\b(qu est ce que j ai|qu est ce qu on a|j ai quoi|on a quoi|mon agenda|mes rendez vous|mon planning|mon programme|ai je (des |un )?rendez vous|est ce que j ai (des |un )?rendez vous|j ai (des |un )?rendez vous|prochain rendez vous|mon emploi du temps|qu est ce qui est prevu|qu y a t il (a|dans) (mon |l )?agenda|quoi de prevu|c est quoi mon programme|mes evenements|ma journee de|mon prochain rdv|est ce que je suis libre|suis je libre|je suis libre)\b/.test(t);
    var agAdd = /\b(ajoute|ajouter|cree|creer|note|noter|programme|programmer|planifie|mets|enregistre|prends|fixe|inscris|place|cale)\b(?: moi)? (?:un |une |le |la )?(?:nouveau |nouvel |nouvelle )?(rendez vous|evenement|reunion|rencontre|visite|consultation)\b/.test(t) || /^(nouveau |nouvel )?(rendez vous|evenement) /.test(t) || /^(j ai|j aurai) (un |une )?(rendez vous|reunion) /.test(t);
    if (agAdd) {
      var wg = findWhen(t, now), km = /\b(rendez vous|evenement|reunion|rencontre|visite|consultation)\b/.exec(t);
      var kw = km ? km[1] : 'rendez vous', after = km ? km.index + km[0].length : 0;
      var endAt = null, mm2;
      if ((mm2 = /\b(?:jusqu a|a) (\d{1,2}) ?(?:h|heure)(?: ?(\d{1,2}))?\b/.exec(t.slice(after))) && wg.hasTime) {
        var e1 = new Date(wg.at); e1.setHours(+mm2[1], mm2[2] ? +mm2[2] : 0, 0, 0); if (e1.getTime() > wg.at) { endAt = e1.getTime(); wg.spans.push([after + mm2.index, after + mm2.index + mm2[0].length]); }
      }
      if ((mm2 = /\bpendant (\d+(?:\.\d+)? (?:heure|h|minute)(?: \d+)?|(?:1 )?demie? heure)\b/.exec(t)) && wg.at != null) { var dd2 = durations(mm2[1]); if (dd2.length) { endAt = wg.at + dd2[0].ms; wg.spans.push([mm2.index, mm2.index + mm2[0].length]); } }
      var titleO = origCut(P, after, t.length, wg.spans).replace(/^:\s*/, '');
      var kwO = { 'rendez vous': 'Rendez-vous', evenement: 'Événement', reunion: 'Réunion', rencontre: 'Rencontre', visite: 'Visite', consultation: 'Consultation' }[kw];
      var title = titleO ? (kw === 'evenement' ? titleO.charAt(0).toUpperCase() + titleO.slice(1) : kwO + ' ' + titleO) : kwO;
      return R('agenda_add', { title: title, at: wg.at != null ? wg.at : null, hasTime: wg.hasTime, allDay: !wg.hasTime && wg.hasDay, day: wg.day != null ? wg.day : null, end: endAt });
    }
    if (agQ || /\b(agenda|rendez vous|rdv)\b/.test(t) && /\b(aujourd hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|prochain|ce soir|ce matin|cet apres midi|quoi|quels|quel|lis|dis)\b/.test(t)) {
      var wq = findWhen(t, now), from, to;
      if (/\b(cette semaine|la semaine)\b/.test(t)) { from = startOfDay(now); var dow = (new Date(now).getDay() + 6) % 7; to = addDays(startOfDay(now), 7 - dow); }
      else if (/\b(semaine prochaine)\b/.test(t)) { var dw = (new Date(now).getDay() + 6) % 7; from = addDays(startOfDay(now), 7 - dw); to = addDays(from, 7); }
      else if (/\b(week end|weekend)\b/.test(t)) { var dw2 = new Date(now).getDay(); from = addDays(startOfDay(now), (6 - dw2 + 7) % 7); if (dw2 === 0) from = addDays(startOfDay(now), -1); to = addDays(from, 2); }
      else if (/\b(prochain|prochaine|suivant)\b/.test(t) && !wq.hasDay) return R('agenda', { next: true });
      else { from = wq.hasDay ? wq.day : startOfDay(now); to = addDays(from, 1); if (wq.part === 'soir') from = from + 17 * HOUR; if (wq.part === 'aprem') { from += 12 * HOUR; to = from + 6 * HOUR; } if (wq.part === 'matin') to = from + 12 * HOUR; }
      if (!wq.hasDay && !/\b(semaine|week end|weekend)\b/.test(t) && from === startOfDay(now) && !wq.part) from = startOfDay(now);
      return R('agenda', { from: from, to: to, free: /\b(libre|dispo|disponible)\b/.test(t) });
    }
    // --- météo, vent, vigilance ---
    var isVig = /\b(vigilance|alerte meteo|alertes meteo|bulletin d alerte|alerte (orange|rouge|jaune)|vigilance (orange|rouge|jaune))\b/.test(t);
    var isWind = /\b(vent|vents|rafales?|venter|venteux|ca souffle|souffle t il|mistral|tramontane|tempete)\b/.test(t) || /\b(monter|monte|montage|demonter|demontage|travailler en hauteur|lever)\b.*\b(echafaudage|echafaudages|nacelle|grue|toiture)\b/.test(t);
    var isWx = /\b(meteo|quel temps|le temps qu il|temps fait il|temps va t il|temps demain|pleuvoir|pleut|pluie|pleuvra|parapluie|neige|neiger|neigera|soleil|ensoleille|temperature|chaud|froid|degres dehors|il fait combien|orage|orages|previsions|nuageux|beau temps|mauvais temps|gel|geler|il gele|grele|brouillard|humidite)\b/.test(t) && !/\b(ouvre|lance|appli|application)\b/.test(t);
    if ((isVig || isWind || isWx) && !/^(ouvre|ouvrir|va sur|va dans|lance|affiche|montre moi)\b/.test(t)) {
      var wh = 'now';
      var ww = findWhen(t, now), dayOff = null;
      if (ww.hasDay) dayOff = Math.round((ww.day - startOfDay(now)) / DAY);
      if (/\b(semaine|prochains jours|week end|weekend|jours qui viennent)\b/.test(t)) wh = 'week';
      else if (dayOff === 1) wh = 'tomorrow'; else if (dayOff != null && dayOff > 1) wh = 'day';
      else if (/\b(aujourd hui|ce matin|cet apres midi|ce soir|cette nuit|de la journee|dans la journee|tout a l heure|plus tard)\b/.test(t) || /\b(va t il|vas t il|va pleuvoir|va neiger|pleuvra|risque)\b/.test(t)) wh = 'today';
      var focus = isVig ? 'vigilance' : isWind ? 'wind' : /\b(pleuvoir|pleut|pluie|pleuvra|parapluie|averse|averses)\b/.test(t) ? 'rain' : /\b(neige|neiger|neigera)\b/.test(t) ? 'snow' : /\b(temperature|chaud|froid|degres|il fait combien|gel|geler|il gele)\b/.test(t) ? 'temp' : /\borages?\b/.test(t) ? 'storm' : '';
      var city = '';
      var STOPC = /^(la|le|les|l|ce|cette|demain|aujourd|maintenant|quelle|quel|combien|monter|monte|demonter|l echafaudage|echafaudage|la semaine|semaine|ce soir|midi|minuit|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|hauteur|chantier|venir|prevoir|l heure|nouveau|la journee|journee|partir|cause|la maison|maison|l exterieur|dehors|pluie|vent|rafales?|t il|t elle|il|elle|temps|meteo|ici|chez moi|nous|moi|toi|travailler|lever|faire|sortir|aller|rouler|un|une|des|du|de)\b/;
      var cre = /\b(a|au|aux|sur|pour|vers|en|de|du|d) ([a-z][a-z ]*?)(?= (?:demain|aujourd hui|ce soir|ce matin|cet apres midi|cette semaine|maintenant|apres demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|ce week end|cette nuit|la semaine|dans|pour|est ce|va t il|vers)\b|$)/g, cm2, best = null;
      while ((cm2 = cre.exec(t))) {
        var pre = t.slice(0, cm2.index); cre.lastIndex = cm2.index + cm2[1].length + 1;
        if (/\by $/.test(pre) && cm2[1] === 'a') continue;                 // « y a-t-il »
        if (/^(de|du|d)$/.test(cm2[1]) && !/\b(meteo|temps|previsions?|vent|vigilance|temperature)$/.test(pre.trim())) continue;
        if (STOPC.test(cm2[2]) || cm2[2].split(' ').length > 4) continue;
        best = cm2; cre.lastIndex = cm2.index + cm2[0].length;
      }
      if (best) city = orig(P, best.index + best[0].length - best[2].length, best.index + best[0].length);
      var intent = isVig ? 'vigilance' : isWind ? 'wind' : 'weather';
      return R(intent, { when: wh, offset: dayOff, city: city, focus: focus, scaffold: /\b(echafaudage|echafaudages|nacelle|grue|hauteur|toiture|levage)\b/.test(t) });
    }
    // --- actualités ---
    if (/\b(titres|les titres|actu|actus|actualite|actualites|infos|les informations|nouvelles|journal|l essentiel|quoi de neuf|flash info|les news|a la une|gros titres|derniere minute|dernieres nouvelles|que se passe t il)\b/.test(t) && !/\b(ouvre|lance|appli|application)\b/.test(t)) {
      var rub = /\bsports?\b/.test(t) ? 'sports' : /\b(monde|international|internationales|etranger)\b/.test(t) ? 'monde' : /\b(politique)\b/.test(t) ? 'politique' : /\b(economie|economiques|eco|bourse)\b/.test(t) ? 'economie' : /\b(sante)\b/.test(t) ? 'sante' : /\b(culture|culturelles)\b/.test(t) ? 'culture' : /\b(sciences?|tech|technologie|internet)\b/.test(t) ? 'sciences' : 'titres';
      var nn = /\b(\d+) (titres|infos|nouvelles|actualites)\b/.exec(t);
      return R('news', { rub: rub, n: nn ? Math.min(10, +nn[1]) : (/\bessentiel\b/.test(t) ? 3 : 5) });
    }
    // --- notes et listes ---
    if ((m = /\b(?:ajoute|ajouter|rajoute|mets|met|inscris|note|ecris|marque) (.+?) (?:a|sur|dans|en) (?:la |ma |notre )?liste(?: (?:de |des |du |d |pour (?:le |la |les )?)?([a-z][a-z ]*))?$/.exec(t)) || (m = /\b(?:ajoute|rajoute|mets|inscris) (?:a|sur|dans) (?:la |ma )?liste(?: (?:de |des |du |d )?([a-z]+))? (.+)$/.exec(t))) {
      var itemsN, listN;
      if (/liste(?: (?:de |des |du |d )?([a-z]+))? (.+)$/.test(m[0]) && m[0].indexOf(' liste') < m[0].indexOf(m[2] || '~') && /^(ajoute|rajoute|mets|inscris) (a|sur|dans)/.test(m[0])) { listN = m[1] || 'courses'; itemsN = m[2]; }
      else { itemsN = m[1]; listN = (m[2] || 'courses').trim(); }
      var io = t.indexOf(itemsN, m.index), itemsO = orig(P, io, io + itemsN.length);
      var items = itemsO.split(/\s*(?:,|\bet\b|\bpuis\b)\s*/i).map(function (x) { return x.replace(/^(?:du|de la|de l'|de l’|des|de|d'|d’|un|une|le|la|les|l'|l’|quelques|encore)\s+/i, '').trim(); }).filter(Boolean);
      return R('list_add', { list: listN.replace(/^(?:la |les |le )/, ''), items: items });
    }
    if (/\b(?:enleve|retire|supprime|efface|raye|coche|barre|ote|vire)\b/.test(t) && /\bliste\b/.test(t)) {
      if ((m = /\b(?:vide|efface|supprime) (?:toute )?(?:la |ma )?liste(?: (?:de |des |du |d )?([a-z]+))?$/.exec(t))) return R('list_clear', { list: m[1] || 'courses' });
      if ((m = /\b(?:enleve|retire|supprime|efface|raye|coche|barre|ote|vire) (.+?) (?:de|sur|dans|a) (?:la |ma )?liste(?: (?:de |des |du |d )?([a-z][a-z ]*))?$/.exec(t))) {
        var it2 = m[1].replace(/^(?:le|la|les|l|du|de la|des|un|une)\s+/, '');
        return R('list_remove', { list: (m[2] || 'courses').trim(), item: orig(P, t.indexOf(it2, m.index), t.indexOf(it2, m.index) + it2.length) });
      }
    }
    if ((m = /^(?:vide|efface) (?:toute )?(?:la |ma )?liste(?: (?:de |des |du |d )?([a-z]+))?$/.exec(t))) return R('list_clear', { list: m[1] || 'courses' });
    if (/\b(lis|lire|relis|dis moi|donne moi|qu est ce qu il y a|qu y a t il|quoi|montre|affiche|c est quoi)\b.*\b(liste|listes)\b/.test(t) || /^(?:ma |la )?liste(?: (?:de |des |du |d )?[a-z]+)?$/.test(t)) {
      var lm = /\bliste(?: (?:de |des |du |d |pour (?:le |la |les )?)?([a-z][a-z ]*))?$/.exec(t);
      return R('list_read', { list: lm && lm[1] && !/^(s|des|mes)$/.test(lm[1]) ? lm[1].trim() : 'courses' });
    }
    if (/\b(lis|lire|relis|dis moi|donne moi|montre|affiche)\b.*\b(mes notes|les notes|ma derniere note|derniere note|notes)\b/.test(t) || /^(mes notes|les notes)$/.test(t)) return R('notes_read');
    if ((m = /^(?:note|notes|prends note|prendre note|prends en note|ecris|ecris une note|nouvelle note|cree une note|ajoute une note|ajoute la note|memo|memorise|retiens|souviens toi|n oublie pas|garde en memoire|note bien|prends note de) (?:que |qu |ceci |ca |cela |de |:)?\s*(.+)$/.exec(t)) || (m = /^(?:note) (.+)$/.exec(t))) {
      var colon2 = P.raw.indexOf(':');
      var txt2 = colon2 > 0 && colon2 < P.raw.length - 1 && prep(P.raw.slice(0, colon2), ctx).t.split(' ').length <= 4 ? P.raw.slice(colon2 + 1).trim() : orig(P, m.index + m[0].length - m[1].length);
      txt2 = txt2.replace(/^(?:que |qu'|qu’|de |ceci |:\s*)/i, '');
      return R('note_add', { text: txt2 });
    }
    // --- ouvrir une appli, un site ---
    if ((m = /^(?:ouvre|ouvrir|ouvrez|lance|lancer|lancez|demarre|demarrer|va dans|va sur|aller sur|aller dans|affiche|montre moi|passe sur|bascule sur|je veux|j ai besoin de|emmene moi sur|direction) (?:l appli |l application |le logiciel |le site (?:de |du |des |d )?|le site |le |la |les |l |mon |ma |mes |un |une )*(.+)$/.exec(t))) {
      var what = m[1];
      var site0 = /\bsite\b/.test(t) ? findSite(what) : null;
      if (site0) return R('website', site0);
      if (/^(reglages|parametres)$/.test(what)) return R('settings', { panel: '' });
      var ap = findApp(what);
      if (ap && !(ap.id === 'qr' && !/\b(qr|q r)\b/.test(what))) return R('open_app', ap);
      var site = findSite(what);
      if (site) return R('website', site);
      if (/\bsite\b/.test(t)) return R('website', { unknown: orig(P, m.index + m[0].length - what.length) });
      var near = null, nd = 3;
      APPS.forEach(function (a) { var d = lev(what, deacc(a[1])); if (d < nd) { nd = d; near = { id: a[0], name: a[1], pkg: a[2] }; } });
      return R('open_app', { unknown: orig(P, m.index + m[0].length - what.length), near: near });
    }
    if (/^(?:youtube|wikipedia|leboncoin|le bon coin|doctolib)$/.test(t)) return R('website', findSite(t));
    // une appli seule : « présentation », « le tableur »
    var only = /^(?:l appli |l application |le |la |les |l )?(.+)$/.exec(t), ap2 = only && only[1].split(' ').length <= 3 ? findApp(only[1]) : null;
    if (ap2 && ap2.id !== 'photo' && ap2.id !== 'calcul') return R('open_app', ap2);
    // --- heure simple après coup (« il est quelle heure à … ») ---
    if (/\bheure\b/.test(t) && /\b(quel|quelle)\b/.test(t)) return R('time');
    var sg = null;
    if (!ctx._noFix) {
      var fixed = spell(t);
      if (fixed !== t) { var r2 = parse(fixed, Object.assign({}, ctx, { _noFix: true, names: [] })); if (r2.intent !== 'unknown' && r2.intent !== 'empty') sg = { intent: r2.intent, phrase: fixed, corrected: true }; }
    }
    if (!sg) sg = suggest(t);
    return R('unknown', { suggest: sg });
  }
  function digits(s) {
    var d = String(s || '').replace(/[^\d+]/g, '');
    if (/^(\+33|0033)\d{9}$/.test(d)) return d.replace(/^0033/, '+33');
    if (/^0\d{9}$/.test(d)) return d;
    if (/^\d{2,5}$/.test(d) && /^(1[0-9]|3\d{3}|11[0-9])$/.test(d)) return d;   // numéros courts (15, 17, 18, 112, 3646…)
    return '';
  }

  /* ---------------- Formats de réponse ---------------- */
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '';
    dec = dec == null ? (Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 1 ? 2 : 4) : dec;
    var r = Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);
    var s = r.toLocaleString('fr-FR', { maximumFractionDigits: dec });
    return s.replace(/ /g, ' ');
  }

  var NLU = {
    parse: parse, prep: prep, numberize: numberize, tokenize: tokenize, findWhen: findWhen, durations: durations, calcExpr: calcExpr,
    convert: convert, parseClim: parseClim, parseLight: parseLight, lightTarget: lightTarget, colorWord: colorWord, nextFete: nextFete, easter: easter, findApp: findApp, findSite: findSite, APPS: APPS, SITES: SITES, EXAMPLES: EXAMPLES,
    suggest: suggest, spell: spell, yesNo: yesNo, deacc: deacc, num: num, DN: DN, UNITS: UNITS, MONTHS: MONTHS, WDAYS: WDAYS, startOfDay: startOfDay, addDays: addDays
  };
  root.MJNLU = NLU;
  if (typeof module !== 'undefined' && module.exports) module.exports = NLU;
})(typeof window !== 'undefined' ? window : this);
