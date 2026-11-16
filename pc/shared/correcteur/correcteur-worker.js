/* Correcteur de français de la Suite MAG — tâche de fond (Web Worker) autour de Grammalecte 2.3 (GPL v3, grammalecte.net).
   Tout est calculé sur l'appareil : aucun texte ne part sur Internet.
   Messages reçus : { id, cmd, ... } ; réponse : { id, ok, res } ou { id, ok: false, err }.
     init                         → { options }
     check   { text, opts }       → [ { s, e, t: 'gram'|'ortho', msg, sugg: [], rule, url } ] (positions dans le texte entier)
     suggest { word }             → [ suggestions ]
     word    { word }             → { known, lemmas: [], labels: [], syns: [ [nature, [mots]] ], verb: lemme|null }
     conj    { verb, pro, neg, tco, int, fem } → { infi, table } (tableau de conjugaison) ou null */
'use strict';
var BASE = 'grammalecte/';
var ready = false, oSpell = null, oTok = null;

function load() {
  if (ready) return;
  ['graphspell/helpers.js', 'graphspell/str_transform.js', 'graphspell/char_player.js', 'graphspell/lexgraph_fr.js', 'graphspell/ibdawg.js',
    'graphspell/spellchecker.js', 'text.js', 'graphspell/tokenizer.js', 'fr/conj.js', 'fr/mfsp.js', 'fr/phonet.js', 'fr/thesaurus.js', 'fr/cregex.js',
    'fr/gc_options.js', 'fr/gc_functions.js', 'fr/gc_rules.js', 'fr/gc_rules_graph.js', 'fr/gc_engine.js'].forEach(function (f) { importScripts(BASE + f); });
  var L = function (f) { var t = helpers.loadFile(BASE + f); if (!t) throw new Error('Fichier du correcteur introuvable : ' + f); return t; };
  conj.init(L('fr/conj_data.json'));
  phonet.init(L('fr/phonet_data.json'));
  mfsp.init(L('fr/mfsp_data.json'));
  try { thesaurus.init(L('fr/thesaurus1_data.json'), L('fr/thesaurus2_data.json')); } catch (e) { /* synonymes facultatifs */ }
  gc_engine.load('JavaScript', 'aHSL', BASE + 'graphspell/_dictionaries');
  oSpell = gc_engine.getSpellChecker();
  oTok = new Tokenizer('fr');
  ready = true;
}

function sugg(word, n) {
  var out = [];
  try { for (var a of oSpell.suggest(word, n || 8)) for (var i = 0; i < a.length; i++) if (out.indexOf(a[i]) < 0) out.push(a[i]); } catch (e) { }
  return out.slice(0, n || 8);
}

function check(t, opts) {
  opts = opts || {};
  var out = [], ign = new Set((opts.ignore || []).map(function (w) { return String(w).toLowerCase(); }));
  t = String(t || '').replace(/­/g, ' ');
  var pos = 0, paras = t.split('\n');
  for (var p = 0; p < paras.length; p++) {
    var para = paras[p], base = pos; pos += para.length + 1;
    if (!para.trim()) continue;
    var norm = para.normalize('NFC'), same = norm.length === para.length;
    var gram = [], spell = [];
    try { gram = gc_engine.parse(same ? norm : para, 'FR', false, null, false) || []; } catch (e) { gram = []; }
    try { spell = oSpell.parseParagraph(same ? norm : para) || []; } catch (e) { spell = []; }
    gram.forEach(function (g) {
      out.push({ s: base + g.nStart, e: base + g.nEnd, t: 'gram', msg: g.sMessage || '', sugg: (g.aSuggestions || []).slice(0, 8), rule: g.sRuleId || '', kind: g.sType || '', url: g.URL || '' });
    });
    spell.forEach(function (w) {
      var v = w.sValue || para.slice(w.nStart, w.nEnd);
      if (ign.has(v.toLowerCase())) return;
      // une faute d'orthographe déjà couverte par une règle de grammaire : on garde la grammaire (plus précise)
      if (gram.some(function (g) { return g.nStart <= w.nStart && g.nEnd >= w.nEnd; })) return;
      out.push({ s: base + w.nStart, e: base + w.nEnd, t: 'ortho', msg: 'Mot inconnu du dictionnaire.', sugg: sugg(v, 8), rule: 'ortho', word: v });
    });
  }
  out.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
  return out;
}

function word(w) {
  w = String(w || '').trim();
  var r = { word: w, known: false, lemmas: [], labels: [], syns: [], verb: null };
  if (!w) return r;
  try { r.known = oSpell.isValid(w); } catch (e) { }
  try { r.lemmas = (oSpell.getLemma(w) || []).filter(function (x, i, a) { return x && a.indexOf(x) === i; }); } catch (e) { }
  // nature grammaticale lisible (« nom féminin singulier », « verbe … ») par le lexicographe de Grammalecte
  try { oSpell.analyze(w).forEach(function (x) { (x[1] || []).forEach(function (m) { var l = Array.isArray(m[1]) ? m[1].join(' ') : m[1]; if (l && r.labels.indexOf(l) < 0) r.labels.push(l); }); }); r.labels = r.labels.slice(0, 8); } catch (e) { }
  try { var vb = r.lemmas.filter(function (l) { return conj.isVerb(l); })[0] || (conj.isVerb(w) ? w : null); r.verb = vb || null; } catch (e) { }
  try { var seen = {}; [w].concat(r.lemmas).forEach(function (x) { if (seen[x]) return; seen[x] = 1; (thesaurus.getSyns(x) || []).forEach(function (s) { r.syns.push([s[0], (s[1] || []).slice(0, 20)]); }); }); r.syns = r.syns.slice(0, 8); } catch (e) { }
  if (!r.known) r.sugg = sugg(w, 8);
  return r;
}

function conjugue(v, o) {
  o = o || {};
  if (!conj.isVerb(v)) return null;
  var verb = new Verb(v);
  return { infi: v, info: verb.sInfo || '', table: verb.createConjTable(!!o.pro, !!o.neg, !!o.tco, !!o.int, !!o.fem) };
}

onmessage = function (e) {
  var d = e.data || {}, res;
  try {
    if (d.base) BASE = d.base;
    load();
    switch (d.cmd) {
      case 'init': res = { options: helpers.mapToObject(gc_engine.getOptions()) }; break;
      case 'check': res = check(d.text, d.opts); break;
      case 'suggest': res = sugg(d.word, d.n); break;
      case 'word': res = word(d.word); break;
      case 'conj': res = conjugue(String(d.verb || '').trim().toLowerCase(), d); break;
      case 'options': if (d.set) gc_engine.setOptions(helpers.objectToMap(d.set)); res = helpers.mapToObject(gc_engine.getOptions()); break;
      default: throw new Error('Commande inconnue : ' + d.cmd);
    }
    postMessage({ id: d.id, ok: true, res: res });
  } catch (err) {
    postMessage({ id: d.id, ok: false, err: String(err && err.message || err) });
  }
};
