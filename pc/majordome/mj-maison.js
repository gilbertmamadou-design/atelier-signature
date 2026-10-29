/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-maison.js : ne pas modifier ici. */
/* =====================================================================
   Majordome : lumières Philips Hue (pont Hue du réseau local).
   - Android seulement : la page ne parle jamais au pont elle-même. MajordomeBridge.java (window.MAGMajordome.hue…)
     fait les requêtes, garde la clé d'application (fichier privé de l'appli, hors sauvegardes), accepte le
     certificat du pont seulement s'il est celui enregistré au jumelage (épinglage), et refuse toute adresse
     qui n'est pas celle du pont jumelé, sur le réseau local (10/8, 172.16/12, 192.168/16).
   - API CLIP v2 (https://<ip>/clip/v2/resource/…) ; repli sur l'API v1 pour les anciens ponts.
   - Sur PC : explication honnête (le navigateur ne peut pas joindre le pont).
   Fonctions pures (correspondance des noms, couleurs, plan des requêtes) exportées sous window.MJHue
   (et module.exports pour les essais sous Node).
   ===================================================================== */
(function (root) {
  'use strict';
  /* ---------------- Fonctions pures ---------------- */
  function deacc(s) { return String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  var STOP = { le: 1, la: 1, les: 1, l: 1, de: 1, du: 1, des: 1, d: 1, a: 1, au: 1, aux: 1, en: 1, et: 1, dans: 1, sur: 1, un: 1, une: 1, mon: 1, ma: 1, mes: 1 };
  function sing(w) { return w.length > 3 ? w.replace(/(s|x)$/, '') : w; }
  function toks(s) { return deacc(s).split(' ').filter(function (w) { return w && !STOP[w]; }).map(sing); }
  function lev(a, b) {
    var d = [], i, j; for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function tokEq(a, b) { if (a === b) return true; var n = Math.min(a.length, b.length); if (n >= 7) return lev(a, b) <= 2; if (n >= 4) return lev(a, b) <= 1; return false; }
  /** Ressemblance d'une désignation (« salle de bain ») et d'un nom du pont (« Salle de bains ») : 0 à 1 */
  function score(q, name) {
    var qa = toks(q), na = toks(name); if (!qa.length || !na.length) return 0;
    if (qa.join(' ') === na.join(' ')) return 1;
    var mq = qa.filter(function (a) { return na.some(function (b) { return tokEq(a, b); }); }).length;
    var mn = na.filter(function (b) { return qa.some(function (a) { return tokEq(a, b); }); }).length;
    if (mq === qa.length && mn === na.length) return 0.95;
    if (mq === qa.length) return Math.max(0.6, 0.8 - 0.05 * (na.length - mn));
    if (mn === na.length) return Math.max(0.6, 0.7 - 0.05 * (qa.length - mq));
    return 0.5 * mq / qa.length;
  }
  /** Ce que désigne la commande : {sel:{type:'all'|'group'|'light', obj}} | {ambiguous:[obj…]} | {none:true} | {need:true} */
  function resolve(model, p) {
    if (p.all) return { sel: { type: 'all' } };
    var qs = [p.full, p.target].filter(Boolean);
    if (!qs.length) return { need: true };
    var cands = [];
    (model.groups || []).forEach(function (g) { var s = 0; qs.forEach(function (q) { s = Math.max(s, score(q, g.name)); }); if (s > 0) cands.push({ o: g, type: 'group', s: s + (g.kind === 'room' ? 0.02 : 0.01) }); });
    (model.lights || []).forEach(function (l) { var s = 0; qs.forEach(function (q) { s = Math.max(s, score(q, l.name)); }); if (s > 0) cands.push({ o: l, type: 'light', s: s }); });
    cands.sort(function (a, b) { return b.s - a.s; });
    if (!cands.length || cands[0].s < 0.6) return { none: true };
    var best = cands[0], close = cands.filter(function (c) { return c === best || (c.s >= 0.6 && best.s - c.s < 0.06 && deacc(c.o.name) !== deacc(best.o.name)); });
    // même nom pour une pièce et sa seule ampoule : la pièce
    if (close.length > 1) {
      var names = {}; close = close.filter(function (c) { var k = deacc(c.o.name); if (names[k]) return false; names[k] = 1; return true; });
      if (close.length > 1) return { ambiguous: close.slice(0, 4).map(function (c) { return { type: c.type, obj: c.o }; }) };
    }
    return { sel: { type: best.type, obj: best.o } };
  }
  function pickByText(list, text) {
    var best = null, bs = 0;
    list.forEach(function (c, i) { var s = score(text, c.obj ? c.obj.name : c.name); if (s > bs) { bs = s; best = i; } });
    return bs >= 0.6 ? best : null;
  }
  /* Article pour une question naturelle : « Le salon ou la salle à manger ? » */
  var MASC = /^(salon|sejour|bureau|couloir|garage|jardin|grenier|sous sol|cellier|dressing|palier|hall|living|studio|atelier|balcon|escalier|plafonnier|spot|lampadaire|lustre|ruban|coin|patio|porche|perron|abri|parking|wc|bain|lit|chevet|meuble|canape|portail|cabanon|veranda)\b/;
  var FEM = /^(cuisine|chambre|salle|entree|terrasse|buanderie|cave|mezzanine|lampe|ampoule|suspension|applique|guirlande|veilleuse|piece|maison|douche|cour|allee|bibliotheque|lingerie|baie|table|tele|television|led)\b/;
  function withArt(name) {
    var n = String(name || ''), d = deacc(n), low = n.charAt(0).toLowerCase() + n.slice(1);
    if (/^(toilettes|wc|escaliers|combles)\b/.test(d)) return 'les ' + low;
    if (/^[aeiouyh]/.test(d)) return 'l\'' + low;
    if (MASC.test(d)) return 'le ' + low;
    if (FEM.test(d)) return 'la ' + low;
    return '« ' + n + ' »';
  }
  function orList(names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' ou ' + names[names.length - 1]; }
  function andList(names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1]; }

  /* Couleurs : sRGB → xy (méthode documentée par Philips Hue), ramené dans le gamut de l'ampoule */
  var COLORS = { rouge: [255, 0, 0], orange: [255, 110, 0], jaune: [255, 210, 0], vert: [0, 255, 0], bleu: [0, 0, 255], 'bleu ciel': [100, 180, 255], violet: [140, 0, 255],
    rose: [255, 50, 150], turquoise: [0, 220, 200], magenta: [255, 0, 255], indigo: [75, 0, 180], ambre: [255, 160, 0] };
  var GAMUTS = { A: { red: { x: 0.704, y: 0.296 }, green: { x: 0.2151, y: 0.7106 }, blue: { x: 0.138, y: 0.08 } },
    B: { red: { x: 0.675, y: 0.322 }, green: { x: 0.409, y: 0.518 }, blue: { x: 0.167, y: 0.04 } },
    C: { red: { x: 0.6915, y: 0.3083 }, green: { x: 0.17, y: 0.7 }, blue: { x: 0.1532, y: 0.0475 } } };
  function rgbToXy(rgb) {
    var c = rgb.map(function (v) { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; });
    var X = c[0] * 0.664511 + c[1] * 0.154324 + c[2] * 0.162028, Y = c[0] * 0.283881 + c[1] * 0.668433 + c[2] * 0.047685, Z = c[0] * 0.000088 + c[1] * 0.072310 + c[2] * 0.986039, s = X + Y + Z;
    return s ? { x: X / s, y: Y / s } : { x: 0.3127, y: 0.329 };
  }
  function cross(a, b) { return a.x * b.y - a.y * b.x; }
  function inGamut(p, g) {
    var v1 = { x: g.green.x - g.red.x, y: g.green.y - g.red.y }, v2 = { x: g.blue.x - g.red.x, y: g.blue.y - g.red.y }, q = { x: p.x - g.red.x, y: p.y - g.red.y };
    var d = cross(v1, v2), s = cross(q, v2) / d, t = cross(v1, q) / d;
    return s >= 0 && t >= 0 && s + t <= 1;
  }
  function closest(a, b, p) {
    var ap = { x: p.x - a.x, y: p.y - a.y }, ab = { x: b.x - a.x, y: b.y - a.y }, t = (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y);
    t = Math.max(0, Math.min(1, t)); return { x: a.x + ab.x * t, y: a.y + ab.y * t };
  }
  function clampXy(p, g) {
    g = g || GAMUTS.C; if (inGamut(p, g)) return p;
    var c = [closest(g.red, g.green, p), closest(g.green, g.blue, p), closest(g.blue, g.red, p)], best = c[0], bd = 9;
    c.forEach(function (q) { var d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y); if (d < bd) { bd = d; best = q; } });
    return best;
  }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function colorXy(name, gamut) { var rgb = COLORS[name]; if (!rgb) return null; var p = clampXy(rgbToXy(rgb), gamut); return { x: r4(p.x), y: r4(p.y) }; }
  // Blancs : chaud 2700 K, neutre 4000 K, froid 6000 K (mirek = 1 000 000 / kelvins)
  var MIREK = { warm: 370, neutral: 250, cold: 167 };

  /* Modèle commun (v2 ou v1) : {api, groups:[{id, kind, name, gl, lights, on, bri}], lights:[{id, name, on, bri, color, gamut, ct, dim, mirek}], scenes:[{id, name, group}], home} */
  function fromV2(r) {
    var by = function (k) { return (r[k] && r[k].data) || []; };
    var dev = {}; by('device').forEach(function (d) { dev[d.id] = d; });
    var gl = {}; by('grouped_light').forEach(function (g) { gl[g.id] = g; });
    var lights = by('light').map(function (l) {
      var g = l.color && l.color.gamut ? l.color.gamut : l.color ? GAMUTS[l.color.gamut_type] || GAMUTS.C : null;
      var ms = l.color_temperature && l.color_temperature.mirek_schema;
      return { id: l.id, name: (l.metadata && l.metadata.name) || (dev[l.owner && l.owner.rid] && dev[l.owner.rid].metadata.name) || 'Ampoule', on: !!(l.on && l.on.on),
        bri: l.dimming ? Math.round(l.dimming.brightness) : null, dim: !!l.dimming, color: !!l.color, gamut: g,
        ct: ms ? { min: ms.mirek_minimum, max: ms.mirek_maximum } : (l.color_temperature ? { min: 153, max: 500 } : null), mirek: l.color_temperature ? l.color_temperature.mirek : null, rooms: [] };
    });
    var lid = {}; lights.forEach(function (l) { lid[l.id] = l; });
    var groups = [];
    ['room', 'zone'].forEach(function (k) {
      by(k).forEach(function (g) {
        var ids = [];
        (g.children || []).forEach(function (c) {
          if (c.rtype === 'light' && lid[c.rid]) ids.push(c.rid);
          else if (c.rtype === 'device' && dev[c.rid]) (dev[c.rid].services || []).forEach(function (sv) { if (sv.rtype === 'light' && lid[sv.rid]) ids.push(sv.rid); });
        });
        var s = (g.services || []).filter(function (x) { return x.rtype === 'grouped_light'; })[0], st = s && gl[s.rid];
        if (!s) return;
        ids.forEach(function (i) { if (k === 'room') lid[i].rooms.push(g.id); });
        groups.push({ id: g.id, kind: k, name: (g.metadata && g.metadata.name) || (k === 'room' ? 'Pièce' : 'Zone'), arche: g.metadata && g.metadata.archetype, gl: s.rid, lights: ids,
          on: st ? !!(st.on && st.on.on) : ids.some(function (i) { return lid[i].on; }), bri: st && st.dimming ? Math.round(st.dimming.brightness) : null });
      });
    });
    var home = null;
    by('bridge_home').forEach(function (h) { (h.services || []).forEach(function (x) { if (x.rtype === 'grouped_light') home = { gl: x.rid }; }); });
    if (!home) by('grouped_light').forEach(function (g) { if (g.owner && g.owner.rtype === 'bridge_home') home = { gl: g.id }; });
    var scenes = by('scene').map(function (s) { return { id: s.id, name: (s.metadata && s.metadata.name) || 'Scène', group: s.group && s.group.rid, active: s.status && s.status.active !== 'inactive' }; });
    return { api: 'v2', groups: groups, lights: lights, scenes: scenes, home: home };
  }
  function fromV1(r) {
    var L = r.lights || {}, G = r.groups || {}, Sc = r.scenes || {};
    var lights = Object.keys(L).map(function (k) {
      var l = L[k], st = l.state || {}, cap = (l.capabilities && l.capabilities.control) || {};
      var g = cap.colorgamut ? { red: { x: cap.colorgamut[0][0], y: cap.colorgamut[0][1] }, green: { x: cap.colorgamut[1][0], y: cap.colorgamut[1][1] }, blue: { x: cap.colorgamut[2][0], y: cap.colorgamut[2][1] } } : (st.xy ? GAMUTS[cap.colorgamuttype] || GAMUTS.B : null);
      return { id: k, name: l.name || 'Ampoule ' + k, on: !!st.on, bri: st.bri != null ? Math.max(1, Math.round(st.bri / 2.54)) : null, dim: st.bri != null, color: !!st.xy, gamut: g,
        ct: cap.ct ? { min: cap.ct.min, max: cap.ct.max } : (st.ct != null ? { min: 153, max: 500 } : null), mirek: st.ct != null ? st.ct : null, rooms: [] };
    });
    var lid = {}; lights.forEach(function (l) { lid[l.id] = l; });
    var groups = [];
    Object.keys(G).forEach(function (k) {
      var g = G[k], kind = g.type === 'Room' ? 'room' : g.type === 'Zone' ? 'zone' : null; if (!kind) return;
      var ids = (g.lights || []).filter(function (i) { return lid[i]; });
      if (kind === 'room') ids.forEach(function (i) { lid[i].rooms.push(k); });
      groups.push({ id: k, kind: kind, name: g.name || 'Pièce', gl: k, lights: ids, on: !!(g.state && g.state.any_on), bri: g.action && g.action.bri != null ? Math.round(g.action.bri / 2.54) : null });
    });
    var scenes = Object.keys(Sc).filter(function (k) { return !Sc[k].recycle || Sc[k].type === 'GroupScene'; }).map(function (k) { return { id: k, name: Sc[k].name || 'Scène', group: Sc[k].group || null }; });
    return { api: 'v1', groups: groups, lights: lights, scenes: scenes, home: { gl: '0' } };
  }
  /** Requêtes à envoyer : [{method, path, body}] (path v2 « /clip/v2/resource/… », v1 « v1:/groups/… ») */
  function plan(model, sel, cmd) {
    var v2 = model.api === 'v2', out = [];
    var lightsOf = function () {
      if (sel.type === 'light') return [sel.obj];
      var ids = sel.type === 'all' ? model.lights.map(function (l) { return l.id; }) : sel.obj.lights;
      return model.lights.filter(function (l) { return ids.indexOf(l.id) >= 0; });
    };
    if (cmd.act === 'scene') {
      out.push(v2 ? { method: 'PUT', path: '/clip/v2/resource/scene/' + cmd.scene.id, body: { recall: { action: 'active' } } } : { method: 'PUT', path: 'v1:/groups/' + (cmd.scene.group || '0') + '/action', body: { scene: cmd.scene.id } });
      return out;
    }
    if (cmd.act === 'color') {
      lightsOf().filter(function (l) { return l.color; }).forEach(function (l) {
        var xy = colorXy(cmd.color, l.gamut);
        out.push(v2 ? { method: 'PUT', path: '/clip/v2/resource/light/' + l.id, body: { on: { on: true }, color: { xy: xy } } } : { method: 'PUT', path: 'v1:/lights/' + l.id + '/state', body: { on: true, xy: [xy.x, xy.y] } });
      });
      return out;
    }
    var body;
    if (cmd.act === 'on') body = v2 ? { on: { on: true } } : { on: true };
    else if (cmd.act === 'off') body = v2 ? { on: { on: false } } : { on: false };
    else if (cmd.act === 'bri') { var b = Math.max(1, Math.min(100, cmd.bri)); body = v2 ? { on: { on: true }, dimming: { brightness: b } } : { on: true, bri: Math.max(1, Math.min(254, Math.round(b * 2.54))) }; }
    else if (cmd.act === 'step') body = v2 ? (cmd.dir === 'up' ? { on: { on: true }, dimming_delta: { action: 'up', brightness_delta: 25 } } : { dimming_delta: { action: 'down', brightness_delta: 25 } }) : (cmd.dir === 'up' ? { on: true, bri_inc: 64 } : { bri_inc: -64 });
    else if (cmd.act === 'ct') {
      var ls = lightsOf().filter(function (l) { return l.ct; }), mk = MIREK[cmd.ct];
      if (!mk) { var cur = ls.filter(function (l) { return l.mirek; }).map(function (l) { return l.mirek; }); var avg = cur.length ? cur.reduce(function (a, b) { return a + b; }, 0) / cur.length : 300; mk = avg + (cmd.ct === 'warmer' ? 60 : -60); }
      var lo = 153, hi = 500; if (sel.type === 'light' && sel.obj.ct) { lo = sel.obj.ct.min; hi = sel.obj.ct.max; } else if (ls.length) { lo = Math.max.apply(null, ls.map(function (l) { return l.ct.min; })); hi = Math.min.apply(null, ls.map(function (l) { return l.ct.max; })); if (lo > hi) { lo = 153; hi = 454; } }
      mk = Math.round(Math.max(lo, Math.min(hi, mk)));
      body = v2 ? { on: { on: true }, color_temperature: { mirek: mk } } : { on: true, ct: mk };
      if (cmd.bri) { if (v2) body.dimming = { brightness: cmd.bri }; else body.bri = Math.round(cmd.bri * 2.54); }
    }
    if (!body) return out;
    if (sel.type === 'light') out.push(v2 ? { method: 'PUT', path: '/clip/v2/resource/light/' + sel.obj.id, body: body } : { method: 'PUT', path: 'v1:/lights/' + sel.obj.id + '/state', body: body });
    else {
      var gid = sel.type === 'all' ? model.home && model.home.gl : sel.obj.gl;
      if (gid == null) return out;
      out.push(v2 ? { method: 'PUT', path: '/clip/v2/resource/grouped_light/' + gid, body: body } : { method: 'PUT', path: 'v1:/groups/' + gid + '/action', body: body });
    }
    return out;
  }
  /** Applique l'effet attendu au modèle (affichage immédiat, avant la relecture) */
  function apply(model, sel, cmd) {
    var ls = sel.type === 'light' ? [sel.obj] : model.lights.filter(function (l) { return sel.type === 'all' || sel.obj.lights.indexOf(l.id) >= 0; });
    ls.forEach(function (l) {
      if (cmd.act === 'off') l.on = false; else if (cmd.act !== 'scene') l.on = true;
      if (cmd.act === 'bri') l.bri = cmd.bri;
      if (cmd.act === 'step' && l.bri != null) { l.bri = Math.max(1, Math.min(100, l.bri + (cmd.dir === 'up' ? 25 : -25))); if (cmd.dir === 'down') l.on = l.on; }
    });
    model.groups.forEach(function (g) { g.on = model.lights.some(function (l) { return g.lights.indexOf(l.id) >= 0 && l.on; }); if (cmd.act === 'bri' && (sel.type === 'all' || sel.obj === g)) g.bri = cmd.bri; });
  }
  var MJHue = { deacc: deacc, toks: toks, score: score, resolve: resolve, pickByText: pickByText, withArt: withArt, orList: orList, andList: andList, rgbToXy: rgbToXy, clampXy: clampXy, inGamut: inGamut,
    colorXy: colorXy, COLORS: COLORS, GAMUTS: GAMUTS, MIREK: MIREK, fromV2: fromV2, fromV1: fromV1, plan: plan, apply: apply };
  root.MJHue = MJHue;
  if (typeof module !== 'undefined' && module.exports) module.exports = MJHue;
  if (typeof window === 'undefined' || !window.Majordome || !window.Majordome._) return;

  /* ---------------- Majordome : branchement ---------------- */
  var MJ = window.Majordome, X = MJ._, H = X.H, S = X.S, esc = X.esc, answer = X.answer, ask = X.ask, B = X.B;
  var HUE = !!(B && B.hueInfo && B.hueReq && !X.PC);
  var KEYM = 'majordome:maison';                       // noms des pièces, ampoules et scènes (jamais la clé du pont)
  var model = X.lsGet(KEYM, null), modelAt = model ? model.at || 0 : 0;
  var info = { paired: false };
  function J(s) { return X.J(s, {}) || {}; }
  function refreshInfo() { if (HUE) try { info = J(B.hueInfo()); } catch (e) { info = { paired: false }; } return info; }
  refreshInfo();
  if (!info.paired && model) { model = null; X.lsSet(KEYM, null); }
  MJ.hueReady = function () { return HUE && !!refreshInfo().paired; };
  MJ.lightCheck = function (phrase) { var r = window.MJNLU.parse(phrase, { now: Date.now(), names: [] }); return r.intent === 'light'; };
  MJ.ctxExtra = function () { return { lightRecent: !!(MJ.lastLight && Date.now() - MJ.lastLight.at < 120000) }; };

  /* Requêtes : le pont natif répond par l'événement « hue » */
  var waits = {}, pairing = null, discover = null;
  var prevEv = window.majordomeEvent;
  window.majordomeEvent = function (type, data) {
    if (type !== 'hue') return prevEv ? prevEv(type, data) : undefined;
    var d = J(data);
    if (d.op === 'res' && waits[d.id]) {
      var w = waits[d.id]; delete waits[d.id]; clearTimeout(w.t);
      if (d.err) { var e = new Error(d.err); e.code = d.err; e.msg = d.msg; w.ko(e); return; }
      var body = X.J(d.body, null);
      if (d.code === 403 || d.code === 401 || (Array.isArray(body) && body.some(function (x) { return x && x.error && x.error.type === 1; }))) { var e2 = new Error('unauthorized'); e2.code = 'unauthorized'; w.ko(e2); return; }
      if (d.code === 404) { var e3 = new Error('gone'); e3.code = 'gone'; w.ko(e3); return; }
      if (d.code >= 400) { var e4 = new Error('http'); e4.code = 'http'; e4.msg = 'HTTP ' + d.code; w.ko(e4); return; }
      w.ok(body);
    } else if (d.op === 'pair') onPair(d);
    else if (d.op === 'discover') onDiscover(d);
    else if (d.op === 'later') {
      X.setAL(MJ.AL().filter(function (o) { return o.id !== d.id; }));
      if (d.ok) X.card('<div class="k">Lumières</div><p>' + esc(d.label || 'Minuterie exécutée') + ' : c\'est fait.</p>');
      else X.card('<div class="k">Lumières</div><p>' + esc(d.label || 'Minuterie') + ' : ' + esc(errText(d.err)) + '</p>', 'err');
    } else if (d.op === 'move') { refreshInfo(); if (X.curSheet() === 'settings') X.settingsSheet('maison'); X.toast(d.ok ? 'Nouvelle adresse du pont enregistrée' : 'Ce n\'est pas le pont jumelé : adresse refusée'); }
  };
  function req(method, path, body) {
    return new Promise(function (ok, ko) {
      var id = 'h' + X.uid();
      waits[id] = { ok: ok, ko: ko, t: setTimeout(function () { if (waits[id]) { delete waits[id]; var e = new Error('unreachable'); e.code = 'unreachable'; ko(e); } }, 15000) };
      try { B.hueReq(id, method, path, body ? JSON.stringify(body) : ''); } catch (e) { delete waits[id]; ko(e); }
    });
  }
  function errText(code) {
    return code === 'unreachable' ? 'Le pont Hue ne répond pas, êtes-vous sur le Wi-Fi de la maison ?' :
      code === 'unauthorized' ? 'Le pont Hue ne reconnaît plus ' + (S.name || 'Majordome') + ' : la clé a sans doute été supprimée dans l\'appli Hue. Il faut jumeler le pont à nouveau.' :
      code === 'cert' ? 'Le certificat du pont Hue n\'est plus celui enregistré au jumelage : par prudence, je n\'envoie rien. Si le pont a été remplacé ou mis à jour, jumelez-le à nouveau.' :
      code === 'notpaired' ? 'Le pont Hue n\'est pas jumelé : Réglages › Maison › Philips Hue.' :
      code === 'notprivate' ? 'Cette adresse n\'est pas celle d\'un appareil du réseau local : refusée.' :
      code === 'gone' ? 'Cette pièce ou cette lumière n\'existe plus sur le pont : j\'actualise la liste.' :
      'Le pont Hue a répondu par une erreur.';
  }
  function fail(e) {
    var code = (e && e.code) || 'http', t = errText(code);
    if (code === 'gone') { fetchModel(true).catch(function () { }); }
    MJ.lastLight = null;
    if (code === 'unauthorized' || code === 'cert' || code === 'notpaired') {
      var c = X.errorReply(t); c.insertAdjacentHTML('beforeend', '<div class="row"><button class="btn pri" data-hp>' + (code === 'notpaired' ? 'Jumeler le pont' : 'Jumeler à nouveau') + '</button></div>');
      c.querySelector('[data-hp]').onclick = function () { X.settingsSheet('maison'); };
      return c.done;
    }
    return X.errorReply(t).done;
  }

  /* Lecture des pièces, zones, ampoules, groupes et scènes */
  var fetching = null;
  function fetchModel(force) {
    if (!force && model && Date.now() - modelAt < 30000) return Promise.resolve(model);
    if (fetching) return fetching;
    var api = refreshInfo().api;
    var p = api === 'v2'
      ? Promise.all(['room', 'zone', 'device', 'light', 'grouped_light', 'scene', 'bridge_home'].map(function (k) { return req('GET', '/clip/v2/resource/' + k).then(function (b) { return [k, b]; }, function (e) { if (k === 'bridge_home' && e.code === 'gone') return [k, { data: [] }]; throw e; }); }))
        .then(function (l) { var r = {}; l.forEach(function (x) { r[x[0]] = x[1]; }); return fromV2(r); })
      : Promise.all(['lights', 'groups', 'scenes'].map(function (k) { return req('GET', 'v1:/' + k).then(function (b) { return [k, b]; }); }))
        .then(function (l) { var r = {}; l.forEach(function (x) { r[x[0]] = x[1]; }); return fromV1(r); });
    fetching = p.then(function (m) { m.at = Date.now(); model = m; modelAt = m.at; X.lsSet(KEYM, m); fetching = null; renderHome(); return m; }, function (e) { fetching = null; throw e; });
    return fetching;
  }
  function freshStates() {   // relit seulement l'état (allumé, luminosité) pour répondre aux questions
    return fetchModel(true);
  }
  function selName(sel) { return sel.type === 'all' ? 'toute la maison' : withArt(sel.obj.name); }

  /* ---------------- Commandes vocales ---------------- */
  function notReady() {
    if (X.PC || !B) return X.answer({ say: 'Sur l\'ordinateur, je ne peux pas commander les lumières Philips Hue : le navigateur ne peut pas joindre le pont de la maison. C\'est disponible sur le téléphone.', html: pcHtml(), k: 'Lumières' }).done;
    if (!HUE) return answer('Les lumières ne sont pas disponibles dans cette version de l\'appli.').done;
    if (S.hueNone) return answer({ say: 'Vous avez indiqué ne pas avoir de pont Hue. Les ampoules Hue en Bluetooth se commandent avec l\'appli Hue : je ne peux pas les piloter.', k: 'Lumières' }).done;
    return fail({ code: 'notpaired' });
  }
  function pcHtml() {
    return '<div class="k">Lumières</div><p>Sur l\'ordinateur, ' + esc(S.name || 'Majordome') + ' ne peut pas commander les lumières Philips Hue. Une page web ne peut pas joindre le pont Hue de la maison :</p><ul>' +
      '<li>le pont répond en <b>https</b> avec un certificat auto-signé de Signify, que le navigateur refuse (et ses anciennes adresses en http sont bloquées : contenu mixte) ;</li>' +
      '<li>les navigateurs limitent l\'accès d\'un site internet aux appareils du réseau local (<i>Private Network Access</i>) ;</li>' +
      '<li>passer par le cloud Hue demanderait un compte développeur Signify et une connexion à votre compte Hue.</li></ul><p>C\'est disponible sur le téléphone : appli Majordome › Réglages › Maison › Philips Hue.</p>';
  }
  var lastSel = null;
  function chooseTarget(p) {
    var r = resolve(model, p);
    if (r.sel) return Promise.resolve(r.sel);
    if (r.need) {
      if (MJ.lastLight && MJ.lastLight.sel && Date.now() - MJ.lastLight.at < 10 * 60000) return Promise.resolve(MJ.lastLight.sel);
      var rooms = model.groups.filter(function (g) { return g.kind === 'room'; });
      if (rooms.length === 1) return Promise.resolve({ type: 'group', obj: rooms[0] });
      if (!rooms.length) return Promise.resolve({ type: 'all' });
      var l = rooms.slice(0, 6).map(function (g) { return { type: 'group', obj: g }; });
      return askAmong('Dans quelle pièce ?', l);
    }
    if (r.ambiguous) {
      var names = r.ambiguous.map(function (c) { return withArt(c.obj.name); });
      return askAmong(X.cap(orList(names)) + ' ?', r.ambiguous);
    }
    if (Date.now() - modelAt > 60000) return fetchModel(true).then(function () { var r2 = resolve(model, p); if (r2.sel) return r2.sel; if (r2.ambiguous) return askAmong(X.cap(orList(r2.ambiguous.map(function (c) { return withArt(c.obj.name); }))) + ' ?', r2.ambiguous); return unknownTarget(p); });
    return unknownTarget(p);
  }
  function unknownTarget(p) {
    var names = model.groups.filter(function (g) { return g.kind === 'room'; }).map(function (g) { return g.name; }).slice(0, 8);
    answer({ say: 'Je ne trouve pas « ' + (p.target || p.full) + ' » parmi vos pièces et vos lumières.', show: 'Je ne trouve pas « ' + (p.target || p.full) + ' » parmi vos pièces et vos lumières.' + (names.length ? ' Pièces : ' + names.join(', ') + '.' : ''), cls: 'warn' });
    return Promise.resolve(null);
  }
  function askAmong(q, list) {
    return ask(q, 'choice', { choices: list.map(function (c) { return c.obj.name; }), k: 'Lumières' }).then(function (v) {
      if (v == null) { answer('D\'accord, je ne touche à rien.'); return null; }
      var i = typeof v === 'number' ? v - 1 : pickByText(list, String(v));
      if (i == null || !list[i]) { answer('Je n\'ai pas compris : je ne touche à rien.'); return null; }
      return list[i];
    });
  }
  function done(detail, quiet) {
    var t = X.withSir('C\'est fait') + '.';
    if (quiet) { X.card('<div class="k">Lumières</div><p>' + esc(detail) + '</p>'); return Promise.resolve(); }
    return answer({ say: t, html: '<div class="k">Lumières</div><p>' + esc(t) + '</p>' + (detail ? '<p class="note">' + esc(detail) + '</p>' : '') }).done;
  }
  function send(reqs) {
    var chain = Promise.resolve();
    reqs.forEach(function (r, i) { chain = chain.then(function () { return req(r.method, r.path, r.body); }).then(function (b) { if (i < reqs.length - 1 && reqs.length > 3) return new Promise(function (ok) { setTimeout(ok, 110); }); return b; }); });
    return chain;
  }
  function describe(sel, cmd) {
    var n = sel.type === 'all' ? 'Toute la maison' : X.cap(sel.obj.name);
    return n + ' : ' + (cmd.act === 'on' ? 'allumé' : cmd.act === 'off' ? 'éteint' : cmd.act === 'bri' ? cmd.bri + ' %' : cmd.act === 'step' ? (cmd.dir === 'up' ? 'plus de lumière' : 'moins de lumière') :
      cmd.act === 'ct' ? { warm: 'blanc chaud', neutral: 'blanc neutre', cold: 'blanc froid', warmer: 'plus chaud', cooler: 'plus froid' }[cmd.ct] : cmd.act === 'color' ? cmd.color : cmd.act === 'scene' ? 'scène « ' + cmd.scene.name + ' »' : '');
  }
  function run(sel, cmd, opt) {
    opt = opt || {};
    var reqs = plan(model, sel, cmd);
    if (!reqs.length) {
      if (cmd.act === 'color') return answer((sel.type === 'light' ? X.cap(withArt(sel.obj.name)) + ' ne fait' : sel.type === 'all' ? 'Vos lumières ne font' : 'Les lumières de ' + withArt(sel.obj.name) + ' ne font') + ' pas de couleur.').done;
      return answer('Je ne sais pas faire cela avec cette lumière.').done;
    }
    MJ.lastLight = { at: Date.now(), sel: sel, cmd: cmd };
    var label = describe(sel, cmd);
    if (opt.delay || opt.at) {
      var at = opt.at || Date.now() + opt.delay, txt = (cmd.act === 'off' ? 'Éteindre ' : cmd.act === 'on' ? 'Allumer ' : 'Lumières : ') + selName(sel);
      X.addAlarm({ kind: 'hue', at: at, label: txt, reqs: reqs });
      var when = opt.delay ? 'dans ' + X.dur(opt.delay) : 'à ' + X.hmSay(at);
      return answer({ say: X.ack((cmd.act === 'off' ? 'J\'éteindrai ' : cmd.act === 'on' ? 'J\'allumerai ' : 'Je réglerai ') + selName(sel) + ' ' + when + '.'), show: txt + ' ' + when + '.', k: 'Lumières' }).done;
    }
    return send(reqs).then(function () { apply(model, sel, cmd); X.lsSet(KEYM, model); renderHome(); if (opt.quiet) return done(label, true); return done(label); }, opt.quiet ? function (e) { X.card('<div class="k">Lumières</div><p>' + esc(errText(e.code)) + '</p>', 'err'); } : fail);
  }
  function findScene(p) {
    var name = p.scene || p.sceneFull || '';
    var room = null;
    if (p.target || p.full) { var rr = resolve(model, { target: p.target, full: p.full }); if (rr.sel && rr.sel.type === 'group') room = rr.sel.obj; }
    var pool = model.scenes.filter(function (s) { return !room || s.group === room.id; });
    var sc = function (s) { return Math.max(score(name, s.name), p.sceneFull ? score(p.sceneFull, s.name) : 0); };
    var c = pool.map(function (s) { return { s: s, v: sc(s) }; }).filter(function (x) { return x.v >= 0.6; }).sort(function (a, b) { return b.v - a.v; });
    if (!c.length && room) { pool = model.scenes; c = pool.map(function (s) { return { s: s, v: Math.max(score(p.sceneFull || name, s.name), sc(s)) }; }).filter(function (x) { return x.v >= 0.6; }).sort(function (a, b) { return b.v - a.v; }); }
    if (!c.length) return { none: true };
    var top = c.filter(function (x) { return c[0].v - x.v < 0.06; });
    if (top.length > 1 && MJ.lastLight && MJ.lastLight.sel && MJ.lastLight.sel.type === 'group') { var pref = top.filter(function (x) { return x.s.group === MJ.lastLight.sel.obj.id; }); if (pref.length === 1) top = pref; }
    if (top.length > 1) return { ambiguous: top.slice(0, 4).map(function (x) { var g = model.groups.filter(function (gg) { return gg.id === x.s.group; })[0]; return { obj: { name: x.s.name + (g ? ' (' + g.name + ')' : '') }, scene: x.s }; }) };
    return { scene: top[0].s };
  }
  function roomName(id) { var g = model.groups.filter(function (x) { return x.id === id; })[0]; return g ? g.name : ''; }
  function lightCmd(p, opt) {
    opt = opt || {};
    if (!HUE || S.hueNone || !refreshInfo().paired) return opt.quiet ? Promise.resolve() : notReady();
    if (p.act === 'screen') { homeSheet(); return answer('Voici la maison.').done; }
    return fetchModel(false).then(function () {
      if (p.act === 'scenes') {
        if (!model.scenes.length) return answer('Aucune scène sur le pont. Créez-en dans l\'appli Hue.').done;
        var byRoom = {}; model.scenes.forEach(function (s) { var r = roomName(s.group) || 'Autres'; (byRoom[r] = byRoom[r] || []).push(s.name); });
        return answer({ say: 'Vos scènes : ' + Object.keys(byRoom).map(function (r) { return r + ' : ' + byRoom[r].join(', '); }).join(' ; ') + '.', html: '<div class="k">Scènes</div><ul>' + Object.keys(byRoom).map(function (r) { return '<li><b>' + esc(r) + '</b> : ' + esc(byRoom[r].join(', ')) + '</li>'; }).join('') + '</ul>' }).done;
      }
      if (p.act === 'list' || p.act === 'query') {
        return freshStates().then(function () {
          if (p.act === 'query') {
            return chooseTarget(p).then(function (sel) {
              if (!sel) return;
              var on = sel.type === 'light' ? sel.obj.on : sel.type === 'all' ? model.lights.some(function (l) { return l.on; }) : sel.obj.on;
              var bri = sel.type === 'light' ? sel.obj.bri : sel.type === 'group' ? sel.obj.bri : null;
              var n = X.cap(selName(sel)), fem = /^(la |l')/.test(selName(sel)) && sel.type === 'light' || /^la /.test(selName(sel));
              MJ.lastLight = { at: Date.now(), sel: sel, cmd: null };
              return answer((on ? 'Oui, ' : 'Non, ') + selName(sel) + ' est ' + (on ? 'allumé' + (fem ? 'e' : '') + (bri ? ' (' + bri + ' %)' : '') : 'éteint' + (fem ? 'e' : '')) + '.').done;
            });
          }
          var onL = model.lights.filter(function (l) { return l.on; });
          if (!onL.length) return answer(p.ask === 'off' ? 'Oui, tout est éteint.' : 'Aucune lumière allumée.').done;
          var rooms = model.groups.filter(function (g) { return g.kind === 'room' && g.lights.some(function (i) { return onL.some(function (l) { return l.id === i; }); }); });
          var loose = onL.filter(function (l) { return !l.rooms.length; });
          var parts = rooms.map(function (g) { return withArt(g.name); }).concat(loose.map(function (l) { return withArt(l.name); }));
          var n = onL.length + ' lumière' + (onL.length > 1 ? 's allumées' : ' allumée');
          return answer({ say: (p.ask === 'off' ? 'Non : ' : '') + n + ' : ' + andList(parts) + '.', html: '<div class="k">Lumières</div><p>' + esc((p.ask === 'off' ? 'Non : ' : '') + n) + '</p><ul>' + onL.map(function (l) { return '<li>' + esc(l.name) + (l.bri ? ' · ' + l.bri + ' %' : '') + (l.rooms.length ? ' <span class="note">(' + esc(roomName(l.rooms[0])) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' }).done;
        });
      }
      if (p.act === 'again' || (p.act === 'step' && !p.target && !p.full && !p.all && MJ.lastLight && MJ.lastLight.sel)) {
        var last = MJ.lastLight; if (!last || !last.sel) return answer('Je ne sais plus de quelle lumière il s\'agit.').done;
        var cmd0 = p.act === 'again' ? (last.cmd && last.cmd.act === 'step' ? last.cmd : { act: 'step', dir: 'up' }) : { act: 'step', dir: p.dir };
        return run(last.sel, cmd0, opt);
      }
      if (p.act === 'scene') {
        if (!p.scene && !p.sceneFull) return lightCmd({ act: 'scenes' }, opt);
        var f = findScene(p);
        if (f.none) return answer('Je ne trouve pas de scène « ' + (p.sceneFull || p.scene) + ' ». Dites « quelles sont mes scènes ? » pour la liste.').done;
        var pickS = f.scene ? Promise.resolve(f.scene) : askAmong('Laquelle ? ' + X.cap(orList(f.ambiguous.map(function (x) { return x.obj.name; }))) + ' ?', f.ambiguous).then(function (x) { return x && x.scene; });
        return pickS.then(function (scn) { if (!scn) return; var g = model.groups.filter(function (x) { return x.id === scn.group; })[0]; return run(g ? { type: 'group', obj: g } : { type: 'all' }, { act: 'scene', scene: scn }, opt); });
      }
      return chooseTarget(p).then(function (sel) {
        if (!sel) return;
        var cmd = { act: p.act, bri: p.bri, dir: p.dir, ct: p.ct, color: p.color };
        return run(sel, cmd, { delay: p.delay, at: p.at, quiet: opt.quiet });
      });
    }, opt.quiet ? function (e) { X.card('<div class="k">Lumières</div><p>' + esc(errText(e.code)) + '</p>', 'err'); } : fail);
  }
  H.light = function (p) { return lightCmd(p || {}); };
  MJ.lightStep = function (phrase) {
    var r = window.MJNLU.parse(phrase, { now: Date.now(), names: [] });
    if (r.intent !== 'light') return Promise.resolve();
    return lightCmd(r.p, { quiet: true });
  };
  X.HELP.splice(X.HELP.length - 1, 0, ['Lumières Philips Hue' + (HUE ? '' : ' (sur le téléphone seulement)'), ['Allume le salon', 'Éteins tout', 'Allume la lumière de la cuisine', 'Mets le salon à 30 %', 'Baisse la lumière du salon', 'Lumière chaude dans le salon', 'Mets la chambre en bleu', 'Active la scène Lecture', 'Mets l\'ambiance détente', 'Est-ce que la lumière du garage est allumée ?', 'Quelles lumières sont allumées ?', 'Éteins le salon dans 10 minutes', 'Ouvre la maison']]);

  /* ---------------- Écran « Maison » ---------------- */
  var DOTS = [['warm', '#ffc884', 'Blanc chaud'], ['neutral', '#fff3df', 'Blanc neutre'], ['cold', '#dbe9ff', 'Blanc froid'], ['rouge', '#ff3b30', 'Rouge'], ['orange', '#ff8a00', 'Orange'], ['jaune', '#ffd60a', 'Jaune'], ['vert', '#34c759', 'Vert'], ['bleu', '#2f6bff', 'Bleu'], ['violet', '#8e44ff', 'Violet'], ['rose', '#ff4fa3', 'Rose']];
  var css = document.createElement('style');
  css.textContent = '.room{border:1px solid var(--line2);border-radius:14px;padding:10px 12px;margin:8px 0;background:var(--bg3)}.room.on{border-color:#ffd27a66;box-shadow:inset 0 0 0 1px #ffd27a22}.room h3{margin:0;font-size:15.5px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.room .rt{display:flex;align-items:center;gap:10px}.room .rt small{color:var(--tx3);font-size:12px}.room input[type=range]{width:100%;margin:8px 0 2px}.dots{display:flex;gap:7px;flex-wrap:wrap;margin-top:6px}.dots button{width:28px;height:28px;border-radius:50%;border:2px solid #0006;box-shadow:0 0 0 1px var(--line2)}.dots button:active{transform:scale(.9)}.scn{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.scn button{border:1px solid var(--line2);border-radius:14px;padding:5px 10px;font-size:13px;background:var(--bg2)}.scn button:hover{border-color:var(--acc)}.bulbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.bulbs button{font-size:12.5px;border-radius:12px;padding:4px 9px;border:1px solid var(--line2);color:var(--tx2)}.bulbs button.on{color:#2a1d00;background:#ffd27a;border-color:#ffd27a}.hbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px}.hbar .t{flex:1;min-width:160px;color:var(--tx2);font-size:13.5px}';
  document.head.appendChild(css);
  function roomCard(g) {
    var ls = model.lights.filter(function (l) { return g.lights.indexOf(l.id) >= 0; }), anyColor = ls.some(function (l) { return l.color; }), anyCt = ls.some(function (l) { return l.ct; }), anyDim = ls.some(function (l) { return l.dim; });
    var sc = model.scenes.filter(function (s) { return s.group === g.id; });
    var onN = ls.filter(function (l) { return l.on; }).length;
    return '<div class="room' + (g.on ? ' on' : '') + '" data-g="' + esc(g.id) + '"><div class="rt"><h3>' + esc(g.name) + '</h3><small>' + (g.kind === 'zone' ? 'zone · ' : '') + onN + '/' + ls.length + '</small><label class="sw"><input type="checkbox" data-sw' + (g.on ? ' checked' : '') + ' aria-label="Allumer ' + esc(g.name) + '"><span></span></label></div>' +
      (anyDim ? '<input type="range" min="1" max="100" step="1" data-bri value="' + (g.bri || 100) + '" aria-label="Luminosité ' + esc(g.name) + '">' : '') +
      (anyColor || anyCt ? '<div class="dots">' + DOTS.filter(function (d) { return MIREK[d[0]] ? anyCt : anyColor; }).map(function (d) { return '<button data-dot="' + d[0] + '" title="' + d[2] + '" aria-label="' + d[2] + '" style="background:' + d[1] + '"></button>'; }).join('') + '</div>' : '') +
      (sc.length ? '<div class="scn">' + sc.map(function (s) { return '<button data-scene="' + esc(s.id) + '">' + esc(s.name) + '</button>'; }).join('') + '</div>' : '') +
      (ls.length > 1 ? '<div class="bulbs">' + ls.map(function (l) { return '<button data-bulb="' + esc(l.id) + '" class="' + (l.on ? 'on' : '') + '">' + esc(l.name) + '</button>'; }).join('') + '</div>' : '') + '</div>';
  }
  function homeHtml() {
    if (X.PC || !B) return pcHtml();
    if (!HUE) return '<p class="note">Les lumières ne sont pas disponibles dans cette version de l\'appli.</p>';
    if (S.hueNone) return '<p class="note">Vous avez indiqué ne pas avoir de pont Hue (ampoules Bluetooth seulement). ' + esc(S.name) + ' ne commande que les lumières reliées à un pont Hue : les ampoules Bluetooth se pilotent avec l\'appli Hue.</p><div class="row"><button class="btn sm" data-hset>Réglages › Maison</button></div>';
    if (!refreshInfo().paired) return '<p class="note">Aucun pont Hue jumelé.</p><div class="row"><button class="btn pri" data-hset>Jumeler le pont Hue</button></div>';
    if (!model) return '<p class="note">Lecture des pièces…</p>';
    var onN = model.lights.filter(function (l) { return l.on; }).length;
    var rooms = model.groups.filter(function (g) { return g.kind === 'room'; }), zones = model.groups.filter(function (g) { return g.kind === 'zone'; });
    var loose = model.lights.filter(function (l) { return !l.rooms.length; });
    return '<div class="hbar"><div class="t">' + onN + ' lumière' + (onN > 1 ? 's' : '') + ' allumée' + (onN > 1 ? 's' : '') + ' sur ' + model.lights.length + ' · ' + esc(new Date(modelAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })) + '</div><button class="btn sm" data-alloff>Tout éteindre</button><button class="btn sm" data-hrf>Actualiser</button></div>' +
      (rooms.length ? rooms.map(roomCard).join('') : '<p class="note">Aucune pièce sur le pont.</p>') +
      (zones.length ? '<div class="sect">Zones</div>' + zones.map(roomCard).join('') : '') +
      (loose.length ? '<div class="sect">Autres ampoules</div><div class="bulbs">' + loose.map(function (l) { return '<button data-bulb="' + esc(l.id) + '" class="' + (l.on ? 'on' : '') + '">' + esc(l.name) + '</button>'; }).join('') + '</div>' : '') +
      '<p class="note" style="margin-top:12px">Pont « ' + esc(info.name || 'Hue') + ' » · ' + esc(info.ip || '') + ' · ' + (info.api === 'v2' ? 'API CLIP v2' : 'API v1') + '. Appui sur une scène : elle s\'active.</p>';
  }
  function renderHome() { if (X.curSheet() === 'maison') { var b = document.getElementById('shB'); if (b) b.innerHTML = homeHtml(); } }
  function groupById(id) { return model && model.groups.filter(function (g) { return g.id === id; })[0]; }
  function homeAct(sel, cmd) {
    var reqs = plan(model, sel, cmd); if (!reqs.length) { X.toast('Pas de couleur sur ces lumières'); return; }
    MJ.lastLight = { at: Date.now(), sel: sel, cmd: cmd };
    send(reqs).then(function () { apply(model, sel, cmd); X.lsSet(KEYM, model); renderHome(); setTimeout(function () { if (X.curSheet() === 'maison') fetchModel(true).catch(function () { }); }, 1500); }, function (e) { X.toast(errText(e.code)); renderHome(); });
  }
  function homeSheet() {
    var b = X.openSheet('Maison', homeHtml(), 'maison');
    b.onclick = function (e) {
      var t = e.target, c;
      if (t.closest('[data-hset]')) { X.settingsSheet('maison'); return; }
      if (t.closest('[data-hrf]')) { X.toast('Actualisation…'); fetchModel(true).then(function () { X.toast('Actualisé'); }, function (er) { X.toast(errText(er.code)); }); return; }
      if (t.closest('[data-alloff]')) { homeAct({ type: 'all' }, { act: 'off' }); return; }
      var room = t.closest('[data-g]'), g = room && groupById(room.dataset.g);
      if ((c = t.closest('[data-dot]')) && g) { var k = c.dataset.dot; homeAct({ type: 'group', obj: g }, MIREK[k] ? { act: 'ct', ct: k } : { act: 'color', color: k }); return; }
      if ((c = t.closest('[data-scene]'))) { var s = model.scenes.filter(function (x) { return x.id === c.dataset.scene; })[0]; if (s) homeAct(g ? { type: 'group', obj: g } : { type: 'all' }, { act: 'scene', scene: s }); return; }
      if ((c = t.closest('[data-bulb]'))) { var l = model.lights.filter(function (x) { return x.id === c.dataset.bulb; })[0]; if (l) homeAct({ type: 'light', obj: l }, { act: l.on ? 'off' : 'on' }); }
    };
    b.onchange = function (e) {
      var room = e.target.closest('[data-g]'), g = room && groupById(room.dataset.g); if (!g) return;
      if (e.target.matches('[data-sw]')) homeAct({ type: 'group', obj: g }, { act: e.target.checked ? 'on' : 'off' });
      else if (e.target.matches('[data-bri]')) homeAct({ type: 'group', obj: g }, { act: 'bri', bri: +e.target.value });
    };
    if (HUE && !S.hueNone && refreshInfo().paired) fetchModel(false).catch(function (er) { if (X.curSheet() === 'maison') { var bb = document.getElementById('shB'); if (bb) bb.insertAdjacentHTML('afterbegin', '<p class="note warn">' + esc(errText(er.code)) + '</p>'); } });
  }
  MJ.homeSheet = homeSheet;
  var hb = document.getElementById('bHome'); if (hb) hb.onclick = homeSheet;

  /* ---------------- Réglages › Maison › Philips Hue ---------------- */
  var found = [];
  MJ.settingsExtra = function () {
    var h = '<div class="sect" id="f-maison">Maison › Philips Hue</div>';
    if (X.PC || !B) return h + '<p class="note">Sur l\'ordinateur, le navigateur ne peut pas joindre le pont Hue (certificat auto-signé du pont, contenu mixte, protection du réseau local des navigateurs). Les lumières se commandent depuis le téléphone.</p>';
    if (!HUE) return h + '<p class="note">Non disponible dans cette version de l\'appli.</p>';
    h += '<div class="set"><div class="t">Je n\'ai pas de pont Hue<small>Ampoules Hue en Bluetooth seulement : elles se commandent avec l\'appli Hue, je n\'essaie rien.</small></div><label class="sw"><input type="checkbox" id="hNone"' + (S.hueNone ? ' checked' : '') + '><span></span></label></div>';
    if (S.hueNone) return h + '<p class="note">Sans pont Hue, ' + esc(S.name) + ' ne peut pas commander les lumières : le pont (Hue Bridge, relié à la box) est la seule porte d\'entrée locale. Aucune recherche ni connexion n\'est faite.</p>';
    var i = refreshInfo();
    if (pairing) return h + '<div class="room on"><p><b>Appuyez sur le bouton rond au centre du pont Hue.</b></p><p class="note" id="hLeft">' + (pairing.left != null ? 'J\'attends encore ' + pairing.left + ' s…' : 'Connexion au pont ' + esc(pairing.ip) + '…') + '</p><div class="bar"><i id="hBar" style="width:' + Math.round(100 * (30 - (pairing.left == null ? 30 : pairing.left)) / 30) + '%"></i></div><div class="row"><button class="btn sm" id="hCancel">Annuler</button></div></div>';
    if (i.paired) {
      return h + '<div class="set"><div class="t">Pont « ' + esc(i.name || 'Hue') + ' »<small>' + esc(i.ip) + ' · ' + (i.api === 'v2' ? 'API CLIP v2, https' : i.api === 'v1s' ? 'API v1, https' : 'API v1, http (ancien pont, réseau local seulement)') + (i.fp ? ' · certificat épinglé ' + esc(String(i.fp).slice(0, 8).match(/../g).join(':')) + '…' : '') + '</small></div><span class="chip on"><b></b>Jumelé</span></div>' +
        (model ? '<p class="note">' + model.groups.filter(function (g) { return g.kind === 'room'; }).length + ' pièces, ' + model.groups.filter(function (g) { return g.kind === 'zone'; }).length + ' zones, ' + model.lights.length + ' ampoules, ' + model.scenes.length + ' scènes.</p>' : '') +
        '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm pri" id="hHome">Ouvrir Maison</button><button class="btn sm" id="hRefresh">Actualiser</button><button class="btn sm" id="hRepair">Jumeler à nouveau</button><button class="btn sm bad" id="hForget">Oublier le pont</button></div>' +
        '<p class="note">La clé d\'application du pont reste dans un fichier privé de l\'appli, exclu des sauvegardes : jamais dans l\'historique, l\'export ou internet. Seule l\'adresse du pont jumelé, sur le réseau local, est contactée.</p>';
    }
    h += '<p class="note">Le pont Hue (Hue Bridge) est le boîtier relié à la box. Le téléphone doit être sur le Wi-Fi de la maison.</p>' +
      '<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm pri" id="hFind">' + (discover ? 'Recherche…' : 'Rechercher le pont') + '</button><button class="btn sm" id="hCloud">Chercher sur internet</button></div>' +
      '<p class="note">« Rechercher » interroge le réseau local seulement (mDNS). « Chercher sur internet » envoie une requête à discovery.meethue.com (Signify), qui renvoie l\'adresse locale des ponts vus depuis votre connexion : c\'est la seule requête internet des lumières.</p>' +
      (found.length ? found.map(function (f) { return '<div class="set"><div class="t">' + esc(f.name || 'Pont Hue') + '<small>' + esc(f.ip) + (f.id ? ' · ' + esc(f.id) : '') + (f.via === 'cloud' ? ' · trouvé par discovery.meethue.com' : '') + '</small></div><button class="btn sm pri" data-pair="' + esc(f.ip) + '">Jumeler</button></div>'; }).join('') : (discover === false ? '<p class="note warn">Aucun pont trouvé sur le réseau local.</p>' : '')) +
      '<div class="set"><div class="t">Adresse IP du pont<small>Visible dans l\'appli Hue (Paramètres › Ponts Hue › ⓘ) ou dans la box</small></div></div><div style="display:flex;gap:8px"><input class="in" id="hIp" inputmode="decimal" placeholder="ex. 192.168.1.20"><button class="btn sm" id="hIpGo">Jumeler</button></div>' +
      (i.err ? '<p class="note warn">' + esc(i.err) + '</p>' : '');
    return h;
  };
  function lastErr(t) { info.err = t; }
  MJ.settingsBind = function (b) {
    var on = function (id, fn) { var e = document.getElementById(id); if (e) e.onclick = fn; };
    var none = document.getElementById('hNone');
    if (none) none.onchange = function () { S.hueNone = this.checked; X.saveS(); X.settingsSheet('maison'); };
    on('hFind', function () { if (discover) return; discover = true; found = []; X.settingsSheet('maison'); B.hueDiscover(false); });
    on('hCloud', function () { discover = true; X.toast('Requête à discovery.meethue.com…'); B.hueDiscover(true); });
    on('hIpGo', function () { var v = document.getElementById('hIp').value.trim(); startPair(v); });
    on('hCancel', function () { B.huePairCancel(); });
    on('hHome', homeSheet);
    on('hRefresh', function () { fetchModel(true).then(function () { X.toast('Actualisé'); X.settingsSheet('maison'); }, function (e) { X.toast(errText(e.code)); }); });
    on('hRepair', function () { var ip = refreshInfo().ip; startPair(ip); });
    on('hForget', function () {
      ask('Oublier le pont Hue ? La clé de ' + S.name + ' est effacée du téléphone (elle reste dans la liste des applis du pont, à supprimer depuis l\'appli Hue si vous le souhaitez).', 'yesno', { danger: true, yes: 'Oublier', k: 'Philips Hue' }).then(function (ok) {
        if (!ok) return; B.hueForget(); model = null; X.lsSet(KEYM, null); refreshInfo(); MJ.lastLight = null;
        X.setAL(MJ.AL().filter(function (o) { if (o.kind === 'hue') { try { B.alarmCancel(o.id); } catch (e) { } return false; } return true; }));
        answer('Pont Hue oublié.');
      });
    });
    b.addEventListener('click', function (e) { var p = e.target.closest('[data-pair]'); if (p) startPair(p.dataset.pair); });
  };
  function privateIp(ip) {
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip || ''); if (!m) return false;
    var o = m.slice(1).map(Number); if (o.some(function (x) { return x > 255; })) return false;
    return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
  }
  function startPair(ip) {
    if (!privateIp(ip)) { X.toast('Adresse refusée : il faut une adresse du réseau local (10.x, 172.16-31.x ou 192.168.x)'); return; }
    pairing = { ip: ip, left: null }; info.err = '';
    B.huePair(ip);
    X.settingsSheet('maison');
    answer({ say: 'Appuyez sur le bouton du pont.', show: 'Appuyez sur le bouton rond au centre du pont Hue (j\'attends 30 secondes).', k: 'Philips Hue' });
  }
  function onPair(d) {
    if (d.state === 'wait') {
      if (!pairing) pairing = { ip: d.ip };
      pairing.left = d.left;
      var l = document.getElementById('hLeft'), br = document.getElementById('hBar');
      if (l) l.textContent = 'J\'attends encore ' + d.left + ' s…'; if (br) br.style.width = Math.round(100 * (30 - d.left) / 30) + '%';
      return;
    }
    pairing = null;
    if (d.state === 'ok') {
      refreshInfo(); model = null; modelAt = 0;
      fetchModel(true).then(function (m) {
        var added = addRoutineDefaults(m);
        answer({ say: X.withSir('Pont Hue jumelé') + '. ' + m.lights.length + ' lumières trouvées.', show: 'Pont Hue jumelé : ' + m.groups.filter(function (g) { return g.kind === 'room'; }).length + ' pièces, ' + m.lights.length + ' ampoules, ' + m.scenes.length + ' scènes.' + (added ? ' ' + added : ''), k: 'Philips Hue' });
        if (X.curSheet() === 'settings') X.settingsSheet('maison');
      }, function (e) { answer({ say: 'Pont jumelé, mais la lecture des pièces a échoué.', show: 'Pont jumelé, mais la lecture des pièces a échoué : ' + errText(e.code), cls: 'warn' }); if (X.curSheet() === 'settings') X.settingsSheet('maison'); });
      return;
    }
    var t = d.code === 'timeout' ? 'Le bouton du pont n\'a pas été pressé à temps (30 secondes). Réessayez.' : d.code === 'cancel' ? 'Jumelage annulé.' : d.code === 'unreachable' ? 'Le pont Hue ne répond pas à cette adresse, êtes-vous sur le Wi-Fi de la maison ?' :
      d.code === 'notprivate' ? 'Adresse refusée : ce n\'est pas une adresse du réseau local.' : d.code === 'notbridge' ? 'L\'appareil à cette adresse ne se présente pas comme un pont Hue.' : d.code === 'certid' ? 'Le certificat présenté ne correspond pas à l\'identifiant du pont : jumelage refusé par prudence.' : 'Jumelage impossible' + (d.msg ? ' : ' + d.msg : '.');
    lastErr(t);
    if (d.code !== 'cancel') X.errorReply(t); else answer(t);
    if (X.curSheet() === 'settings') X.settingsSheet('maison');
  }
  function onDiscover(d) {
    discover = d.list && d.list.length ? null : false;
    (d.list || []).forEach(function (f) { if (privateIp(f.ip) && !found.some(function (x) { return x.ip === f.ip; })) found.push(f); });
    if (d.err && d.via === 'cloud') X.toast('discovery.meethue.com : ' + d.err);
    // le pont jumelé a changé d'adresse (DHCP) : proposer la nouvelle, vérifiée par son certificat
    var i = refreshInfo();
    if (i.paired && i.id) found.forEach(function (f) { if (f.id && f.id.toLowerCase() === String(i.id).toLowerCase() && f.ip !== i.ip) B.hueMove(f.ip); });
    if (X.curSheet() === 'settings') X.settingsSheet('maison');
  }
  /* Routines : « Bonne nuit » éteint tout, « Bonjour » allume la cuisine à 60 % (si la pièce existe) ; modifiables dans Réglages › Routines */
  function addRoutineDefaults(m) {
    var added = [], has = function (r) { return (r.steps || []).some(function (s) { return /^lum:/.test(s); }); };
    S.routines.forEach(function (r) {
      if (r.id === 'nuit' && !has(r)) { r.steps = (r.steps || []).concat(['lum:éteins tout']); added.push('« Bonne nuit » éteint tout'); }
      if (r.id === 'matin' && !has(r)) {
        var k = m.groups.filter(function (g) { return g.kind === 'room' && /cuisine/.test(deacc(g.name)); })[0];
        if (k) { r.steps = (r.steps || []).concat(['lum:allume ' + withArt(k.name) + ' à 60 %']); added.push('« Bonjour » allume ' + withArt(k.name) + ' à 60 %'); }
      }
    });
    if (added.length) { X.saveS(); return 'Routines complétées : ' + added.join(', ') + ' (modifiables dans les réglages).'; }
    return '';
  }
})(typeof window !== 'undefined' ? window : this);
