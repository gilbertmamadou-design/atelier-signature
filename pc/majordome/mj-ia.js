/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-ia.js : ne pas modifier ici. */
/* =====================================================================
   Majordome › Compréhension en ligne (option, désactivée par défaut)
   Quand Majordome ne comprend pas une phrase, et seulement dans ce cas, il peut l'envoyer à Claude (API d'Anthropic)
   avec la liste de ce qu'il sait faire. Claude la réécrit en commande(s) simple(s) que Majordome comprend
   (« fais briller la cuisine un max » → « allume la cuisine à 100 % »), ou, si ce n'est pas une commande,
   répond lui-même en une ou deux phrases (option « répondre aux questions »).
   - Clé d'API personnelle (console.anthropic.com), saisie dans les réglages et gardée sur l'appareil.
   - Seules les phrases non comprises partent sur internet ; jamais sans connexion ni sans la clé.
   - Chaque phrase rattrapée est notée dans le carnet (« (IA) »), pour l'ajouter ensuite hors ligne.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, H = X.H, S = X.S, esc = X.esc;
  var MODELS = [['claude-haiku-5-5', 'Rapide (Claude Haiku)'], ['claude-sonnet-5-5', 'Plus fin (Claude Sonnet)']];
  var busy = false;

  function examples() {
    var out = [];
    (X.HELP || []).forEach(function (g) { (g[1] || []).forEach(function (e) { out.push(e); }); });
    return out;
  }
  function system() {
    return 'Tu aides « ' + (S.name || 'Majordome') + ' », un assistant vocal français sur téléphone. Il ne comprend que des commandes formulées ' +
      'comme ses exemples ci-dessous (avec d\'autres noms de pièces, de personnes, d\'heures, de villes…). L\'utilisateur a dit une phrase ' +
      'qu\'il n\'a pas comprise (souvent mal transcrite par la dictée vocale : mots qui se ressemblent à l\'oreille, ponctuation absente).\n' +
      'Réponds UNIQUEMENT par un objet JSON, sans texte autour :\n' +
      '{"commandes": ["…"], "reponse": "…"}\n' +
      '- « commandes » : 1 à 3 commandes en français simple, chacune proche d\'un exemple, qui font ce que l\'utilisateur veut, dans l\'ordre. ' +
      'Garde les noms propres, pièces, heures et nombres de l\'utilisateur. Liste vide si ce n\'est pas une demande d\'action.\n' +
      '- « reponse » : si ce n\'est pas une commande (question générale, discussion), une réponse courte et chaleureuse en une ou deux phrases, ' +
      'à l\'oral (pas de liste, pas d\'emoji) ; sinon chaîne vide.\n' +
      'Ne donne jamais de conseil dangereux ; pour une urgence, dis d\'appeler le 112.\n\nExemples de commandes comprises :\n- ' + examples().join('\n- ');
  }
  function call(q) {
    var ctl = window.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    var now = new Date();
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { 'content-type': 'application/json', 'x-api-key': S.iaKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: S.iaModel || MODELS[0][0], max_tokens: 400,
        system: [{ type: 'text', text: system(), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: 'Nous sommes le ' + now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', il est ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.\nPhrase entendue : « ' + q + ' »' }]
      })
    }).then(function (r) {
      clearTimeout(tm);
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(r.status === 401 ? 'clé refusée' : r.status === 429 ? 'trop de demandes' : r.status === 529 || r.status === 503 ? 'service surchargé' : (j && j.error && j.error.message) || ('erreur ' + r.status));
        var t = (j.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('');
        var m = /\{[\s\S]*\}/.exec(t); if (!m) throw new Error('réponse illisible');
        var o = JSON.parse(m[0]);
        return { commandes: Array.isArray(o.commandes) ? o.commandes.filter(function (c) { return typeof c === 'string' && c.trim(); }).slice(0, 3) : [], reponse: typeof o.reponse === 'string' ? o.reponse.trim() : '' };
      });
    }, function (e) { clearTimeout(tm); throw new Error(e && e.name === 'AbortError' ? 'délai dépassé' : 'pas de connexion au service'); });
  }
  function known(r) { return r && r.intent && r.intent !== 'unknown' && (!MJ.known || MJ.known(r)); }
  function runAll(list) {
    return list.reduce(function (p, r) { return p.then(function () { return X.exec(r); }); }, Promise.resolve());
  }

  var prevUnknown = H.unknown;
  H.unknown = function (p, r) {
    var q = String((r && r.raw) || (MJ.cur && MJ.cur.q) || '').trim();
    if (!S.iaOn || !S.iaKey || busy || !q || !X.online()) return prevUnknown(p, r);
    busy = true;
    try { if (MJ.avatar) MJ.avatar.state('think'); } catch (e) { }
    return call(q).then(function (res) {
      var parsed = res.commandes.map(function (c) { return { c: c, r: window.MJNLU ? window.MJNLU.parse(c, X.ctx()) : null }; }).filter(function (x) { return known(x.r); });
      if (parsed.length) {
        if (MJ.carnet && MJ.carnet.note) MJ.carnet.note(q, parsed.map(function (x) { return x.c; }).join(' ; '), parsed.map(function (x) { return x.r.intent; }).join(', '));
        X.card('<p class="note">Compris : « ' + esc(parsed.map(function (x) { return x.c; }).join(' », puis « ')) + ' »</p>');
        return runAll(parsed.map(function (x) { return x.r; }));
      }
      if (res.reponse && S.iaChat !== false) return X.answer({ say: res.reponse, k: S.name || 'Majordome' }).done;
      return prevUnknown(p, r);
    }, function (e) {
      X.toast('Compréhension en ligne indisponible : ' + e.message);
      return prevUnknown(p, r);
    }).then(function (v) { busy = false; return v; }, function (e) { busy = false; throw e; });
  };

  /* ---------- réglages ---------- */
  function html() {
    return '<div class="sect" id="f-ia">Compréhension en ligne (IA)</div>' +
      '<div class="set"><div class="t">Comprendre les phrases difficiles<small>Seulement quand je ne comprends pas : la phrase est envoyée à Claude (Anthropic), qui la traduit en commande. Il faut internet et votre clé d\'API</small></div><label class="sw"><input type="checkbox" id="iaOn"' + (S.iaOn ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="set"><div class="t">Clé d\'API Anthropic' + (S.iaKey ? '<small>Enregistrée · laissez vide pour la garder</small>' : '<small>À créer sur console.anthropic.com (compte et moyen de paiement) ; elle reste sur cet appareil</small>') + '</div></div>' +
      '<input class="in" id="iaKey" type="password" autocomplete="off" spellcheck="false" placeholder="' + (S.iaKey ? '•••••••• (enregistrée)' : 'sk-ant-…') + '">' +
      '<div class="set"><div class="t">Modèle</div><select class="in" id="iaModel">' + MODELS.map(function (m) { return '<option value="' + m[0] + '"' + ((S.iaModel || MODELS[0][0]) === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="set"><div class="t">Répondre aussi aux questions<small>Si la phrase n\'est pas une commande (« pourquoi le ciel est bleu ? »), Claude répond en une ou deux phrases</small></div><label class="sw"><input type="checkbox" id="iaChat"' + (S.iaChat !== false ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button class="btn sm" id="iaTest">Tester</button>' + (S.iaKey ? '<button class="btn sm" id="iaForget">Oublier la clé</button>' : '') + '</div>' +
      '<p class="note" id="iaRes">Coût : quelques centimes par mois pour un usage quotidien (facturé par Anthropic sur votre compte). Les commandes que je comprends seul ne partent jamais sur internet.</p>';
  }
  function bind() {
    var g = function (id) { return document.getElementById(id); };
    if (!g('iaOn')) return;
    g('iaOn').onchange = function () { S.iaOn = this.checked; X.saveS(); if (S.iaOn && !S.iaKey) X.toast('Ajoutez votre clé d\'API Anthropic ci-dessous.'); };
    g('iaKey').onchange = function () { var v = this.value.trim(); if (v) { S.iaKey = v; X.saveS(); this.value = ''; this.placeholder = '•••••••• (enregistrée)'; X.toast('Clé enregistrée sur cet appareil'); } };
    g('iaModel').onchange = function () { S.iaModel = this.value; X.saveS(); };
    g('iaChat').onchange = function () { S.iaChat = this.checked; X.saveS(); };
    if (g('iaForget')) g('iaForget').onclick = function () { S.iaKey = ''; S.iaOn = false; X.saveS(); (MJ.settingsSheet || X.settingsSheet)('ia'); };
    g('iaTest').onclick = function () {
      var out = g('iaRes'); if (!S.iaKey) { out.textContent = 'Ajoutez d\'abord votre clé.'; return; }
      out.textContent = 'Test en cours…';
      var q = 'fais briller la cuisine un max et dis moi s il va flotter demain';
      call(q).then(function (res) { out.textContent = 'Ça marche. « ' + q + ' » → ' + (res.commandes.length ? '« ' + res.commandes.join(' », « ') + ' »' : res.reponse || '(rien)'); },
        function (e) { out.textContent = 'Échec : ' + e.message + '.'; });
    };
  }
  var prevExtra = MJ.settingsExtra, prevBind = MJ.settingsBind;
  MJ.settingsExtra = function () { return (prevExtra ? prevExtra() : '') + html(); };
  MJ.settingsBind = function (b) { if (prevBind) prevBind(b); bind(b); };
})();
