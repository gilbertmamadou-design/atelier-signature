/* =====================================================================
   Agenda sur PC : pont simulé window.MAGAgenda (même interface que
   applis/scripts/AgendaBridge.java).
   Sur Android, l'appli lit les agendas du téléphone (Google…). Sur PC il n'y a
   pas d'accès aux comptes : les événements sont gardés dans ce navigateur
   (localStorage « agenda-pc.v1 », un agenda « Sur cet ordinateur »), et on
   échange avec le téléphone ou d'autres agendas par fichiers .ics
   (Réglages › Exporter / Importer, glisser-déposer, « Ouvrir avec »).
   - instances / search : occurrences calculées ici (RRULE : DAILY, WEEKLY,
     MONTHLY, YEARLY avec INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH),
     exceptions d'une série (oid / oit) comme sur Android ;
   - rappels : notifications Windows tant que l'appli est ouverte (même réduite) ;
   - sync, comptes, couleurs Google : sans objet sur PC.
   ===================================================================== */
(function () {
  'use strict';
  var M = window.MAGPC; if (!M) return;
  var KEY = 'agenda-pc.v1', DAY = 86400000, HOUR = 3600000;
  var LOCAL = 'Sur cet ordinateur';
  var D = M.store.get(KEY, null);
  if (!D || !Array.isArray(D.cals)) D = { seq: 1, cals: [], ev: [] };
  if (!D.cals.length) D.cals.push({ id: D.seq++, name: LOCAL, color: '#33B679', visible: true });
  var saveT = null;
  function persist() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (!M.store.set(KEY, D)) M.toast('Stockage du navigateur plein : exporte ton agenda en .ics', { bad: true, ms: 7000 });
      planReminders();
    }, 30);
  }
  window.addEventListener('pagehide', function () { if (saveT) { clearTimeout(saveT); M.store.set(KEY, D); } });
  function emit(kind, data) { if (window.agendaEvent) window.agendaEvent(kind, data); }
  function err(m) { return JSON.stringify({ ok: false, err: m }); }
  function cal(id) { for (var i = 0; i < D.cals.length; i++) if (D.cals[i].id === +id) return D.cals[i]; return null; }
  function ev(id) { for (var i = 0; i < D.ev.length; i++) if (D.ev[i].id === +id) return D.ev[i]; return null; }
  function colorOf(e) { if (e.c) return e.c; var c = cal(e.cal); return c ? c.color : '#33B679'; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* ---------------- Répétitions (RRULE) ---------------- */
  var WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  function rule(r) { var o = {}; String(r || '').replace(/^RRULE:/i, '').split(';').forEach(function (p) { var kv = p.split('='); if (kv[0]) o[kv[0].toUpperCase()] = kv[1] || ''; }); return o; }
  function icsUntil(v, all) {
    var m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?/.exec(v || ''); if (!m) return Infinity;
    if (!m[4]) return all ? Date.UTC(+m[1], m[2] - 1, +m[3]) : new Date(+m[1], m[2] - 1, +m[3], 23, 59, 59).getTime();
    return m[7] ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  }
  /** Débuts d'occurrence (ms) d'un événement répété, de start jusqu'à « to » (exclu), au plus max */
  function occurrences(e, to, max) {
    var o = rule(e.rrule), f = o.FREQ, n = Math.max(1, +(o.INTERVAL || 1)), count = +(o.COUNT || 0), until = o.UNTIL ? icsUntil(o.UNTIL, e.all) : Infinity;
    var all = !!e.all, s0 = new Date(e.start), out = [], k = 0;
    // composants de la date de départ (UTC pour une journée entière, heure locale sinon : suit les changements d'heure)
    var g = all ? { y: s0.getUTCFullYear(), m: s0.getUTCMonth(), d: s0.getUTCDate(), wd: s0.getUTCDay() } : { y: s0.getFullYear(), m: s0.getMonth(), d: s0.getDate(), wd: s0.getDay() };
    var hh = all ? 0 : s0.getHours(), mi = all ? 0 : s0.getMinutes(), ss = all ? 0 : s0.getSeconds();
    function mk(y, m, d) { return all ? Date.UTC(y, m, d) : new Date(y, m, d, hh, mi, ss).getTime(); }
    function dim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
    function push(t) {
      if (t < e.start) return true;
      if (t > until || (count && k >= count) || t >= to || out.length >= max) return false;
      k++; out.push(t); return true;
    }
    var byday = (o.BYDAY || '').split(',').filter(Boolean), bymd = (o.BYMONTHDAY || '').split(',').filter(Boolean).map(Number), bymonth = (o.BYMONTH || '').split(',').filter(Boolean).map(function (x) { return +x - 1; });
    var guard = 0;
    if (f === 'DAILY') {
      for (var i = 0; guard++ < 200000; i += n) { var t = mk(g.y, g.m, g.d + i); if (byday.length && byday.map(function (x) { return WD[x.slice(-2)]; }).indexOf(new Date(t)[all ? 'getUTCDay' : 'getDay']()) < 0) { if (t >= to || t > until) break; continue; } if (!push(t)) break; }
    } else if (f === 'WEEKLY') {
      var days = byday.length ? byday.map(function (x) { return WD[x.slice(-2)]; }).filter(function (x) { return x != null; }).sort() : [g.wd];
      var wkst = g.d - ((g.wd + 6) % 7);   // lundi de la première semaine
      for (var w = 0; guard++ < 50000; w += n) {
        var stop = false;
        for (var j = 0; j < 7 && !stop; j++) {
          var wd = (j + 1) % 7; if (days.indexOf(wd) < 0) continue;
          var t2 = mk(g.y, g.m, wkst + w * 7 + j); if (!push(t2)) stop = true;
        }
        if (stop || mk(g.y, g.m, wkst + w * 7) >= to) break;
      }
    } else if (f === 'MONTHLY' || f === 'YEARLY') {
      var step = f === 'MONTHLY' ? n : 12 * n;
      for (var mm = 0; guard++ < 20000; mm += step) {
        var Y = g.y + Math.floor((g.m + mm) / 12), Mo = (g.m + mm) % 12, list = [];
        var months = f === 'YEARLY' && bymonth.length ? bymonth : [Mo];
        if (f === 'YEARLY' && bymonth.length) Y = g.y + mm / 12;
        months.forEach(function (mo) {
          var nd = dim(Y, mo);
          if (byday.length) {
            byday.forEach(function (x) {
              var mt = /^([+-]?\d+)?([A-Z]{2})$/.exec(x); if (!mt || WD[mt[2]] == null) return;
              var want = WD[mt[2]], pos = mt[1] ? +mt[1] : 0, hits = [];
              for (var d = 1; d <= nd; d++) if (new Date(Date.UTC(Y, mo, d)).getUTCDay() === want) hits.push(d);
              if (pos > 0 && hits[pos - 1]) list.push([mo, hits[pos - 1]]);
              else if (pos < 0 && hits[hits.length + pos]) list.push([mo, hits[hits.length + pos]]);
              else if (!pos) hits.forEach(function (d) { list.push([mo, d]); });
            });
          } else if (bymd.length) bymd.forEach(function (d) { var dd = d < 0 ? nd + d + 1 : d; if (dd >= 1 && dd <= nd) list.push([mo, dd]); });
          else if (g.d <= nd) list.push([mo, g.d]);   // le 31 : les mois plus courts sont sautés (comme Android)
        });
        list.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
        var stop2 = false;
        for (var q = 0; q < list.length && !stop2; q++) if (!push(mk(Y, list[q][0], list[q][1]))) stop2 = true;
        if (stop2 || mk(Y, Mo, 1) >= to) break;
      }
    } else out.push(e.start);
    return out;
  }

  /* ---------------- Occurrences ---------------- */
  function inst(e, b, en, oid) {
    var o = { id: e.id, b: b, e: en, all: !!e.all, t: e.t || '', l: e.l || '', c: colorOf(e), cal: e.cal, rec: !!(e.rrule || e.oid), al: !!(e.rem && e.rem.length) };
    if (e.oid) o.oid = e.oid;
    return o;
  }
  function instancesBetween(from, to, max, filter) {
    var out = [], exc = {};
    D.ev.forEach(function (e) { if (e.oid) (exc[e.oid] = exc[e.oid] || {})[e.oit] = 1; });
    D.ev.forEach(function (e) {
      if (filter && !filter(e)) return;
      if (e.cancel) return;
      var dur = Math.max(0, e.end - e.start);
      if (!e.rrule || e.oid) { if (e.start < to && Math.max(e.end, e.start + 1) > from) out.push(inst(e, e.start, e.end)); return; }
      var ex = exc[e.id] || {};
      occurrences(e, to, 5000).forEach(function (t) { if (ex[t]) return; if (t + Math.max(dur, 1) > from) out.push(inst(e, t, t + dur)); });
    });
    out.sort(function (a, b) { return a.b - b.b; });
    return out.slice(0, max);
  }

  /* ---------------- Rappels (notifications tant que l'appli est ouverte) ---------------- */
  var planned = [], planT = null;
  function planReminders() {
    planned.forEach(function (k) { M.cancel(k); }); planned = [];
    var now = Date.now(), horizon = now + 2 * DAY;
    instancesBetween(now - DAY, horizon + 7 * DAY, 2000).forEach(function (x) {
      var e = ev(x.id); if (!e || !e.rem || !e.rem.length) return;
      e.rem.forEach(function (m) {
        var at = (x.all ? new Date(new Date(x.b).getUTCFullYear(), new Date(x.b).getUTCMonth(), new Date(x.b).getUTCDate()).getTime() : x.b) - m * 60000;
        if (at < now - 30000 || at > horizon) return;
        var k = 'agenda-' + x.id + '-' + x.b + '-' + m;
        var when = x.all ? 'Toute la journée' : new Date(x.b).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        M.schedule(k, at - now, x.t || 'Événement', when + (x.l ? ' · ' + x.l : '')); planned.push(k);
      });
    });
    clearTimeout(planT); planT = setTimeout(planReminders, 6 * HOUR);
  }

  /* ---------------- Pont ---------------- */
  var B = {
    version: function () { return '1-pc'; },
    perm: function () { return true; },
    ask: function () { setTimeout(function () { emit('perm', '1'); }, 0); },
    blocked: function () { return false; },
    calendars: function () {
      return JSON.stringify(D.cals.map(function (c) { return { id: c.id, name: c.name, account: LOCAL, type: 'LOCAL', color: c.color, visible: true, write: true, primary: true, local: true }; }));
    },
    createLocal: function (name, color) {
      var n = String(name || '').trim(); if (!n || /téléphone/i.test(n)) n = LOCAL;
      var c = { id: D.seq++, name: n, color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#33B679', visible: true };
      D.cals.push(c); persist();
      return JSON.stringify({ ok: true, id: c.id });
    },
    deleteLocal: function (id) {
      if (!cal(id)) return err('Agenda introuvable');
      D.cals = D.cals.filter(function (c) { return c.id !== +id; });
      D.ev = D.ev.filter(function (e) { return e.cal !== +id; });
      persist(); return '{"ok":true}';
    },
    colors: function () { return '[]'; },
    sync: function () { },                       // aucun compte à synchroniser sur PC
    instances: function (from, to) { return JSON.stringify(instancesBetween(+from, +to, 5000)); },
    search: function (q, from, to) {
      var w = norm(q).trim(); if (!w) return '[]';
      return JSON.stringify(instancesBetween(+from, +to, 300, function (e) { return norm((e.t || '') + '\n' + (e.l || '') + '\n' + (e.d || '')).indexOf(w) >= 0; }));
    },
    event: function (id) {
      var e = ev(id); if (!e) return 'null';
      var o = { id: e.id, cal: e.cal, t: e.t || '', d: e.d || '', l: e.l || '', start: e.start, end: e.end, all: !!e.all, rrule: e.rrule || '', tz: e.all ? 'UTC' : (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
        ck: '', c: colorOf(e), own: !!e.c, org: '', uid: e.uid || '', rem: (e.rem || []).slice().sort(function (a, b) { return a - b; }), att: [] };
      if (e.oid) { o.oid = e.oid; o.oit = e.oit; }
      return JSON.stringify(o);
    },
    save: function (json) {
      var o; try { o = JSON.parse(json); } catch (x) { return err('Données illisibles'); }
      var id = +o.id || 0, mode = o.mode || 'all', start = +o.start, end = Math.max(+o.end || start, start);
      if (!isFinite(start)) return err('Date de début manquante');
      var rem = Array.isArray(o.rem) ? o.rem.filter(function (m, i, a) { return m >= 0 && a.indexOf(m) === i; }) : null;
      var fields = { t: String(o.t || ''), l: String(o.l || ''), d: String(o.d || ''), all: !!o.all, start: start, end: end, c: /^#/.test(o.c || '') ? o.c : '' };
      if (!id) {
        var c = cal(o.cal) || D.cals[0]; if (!c) return err('Aucun agenda');
        var n = Object.assign({ id: D.seq++, cal: c.id, rrule: String(o.rrule || ''), rem: rem || [], uid: o.uid || '' }, fields);
        D.ev.push(n); persist(); return JSON.stringify({ ok: true, id: n.id });
      }
      var e = ev(id); if (!e) return err('Événement introuvable');
      if (mode === 'one' && !e.oid && e.rrule) {      // nouvelle exception d'une série
        var x = Object.assign({ id: D.seq++, cal: e.cal, rrule: '', rem: rem || (e.rem || []).slice(), oid: e.id, oit: +o.ib }, fields);
        D.ev = D.ev.filter(function (y) { return !(y.oid === e.id && y.oit === +o.ib); });
        D.ev.push(x); persist(); return JSON.stringify({ ok: true, id: x.id });
      }
      Object.assign(e, fields);
      e.rrule = e.oid ? '' : String(o.rrule || '');
      if (rem) e.rem = rem;
      if (!e.oid && o.cal && cal(o.cal) && +o.cal !== e.cal) { e.cal = +o.cal; D.ev.forEach(function (y) { if (y.oid === e.id) y.cal = e.cal; }); }
      persist(); return JSON.stringify({ ok: true, id: e.id });
    },
    remove: function (id, mode, ib) {
      var e = ev(id); if (!e) return err('Événement introuvable');
      if (mode === 'one' && e.oid) e.cancel = true;
      else if (mode === 'one' && e.rrule) D.ev.push({ id: D.seq++, cal: e.cal, t: e.t, l: '', d: '', all: e.all, start: +ib, end: +ib, rrule: '', rem: [], oid: e.id, oit: +ib, cancel: true });
      else { var root = e.oid && mode === 'all' ? e.oid : e.id; D.ev = D.ev.filter(function (y) { return y.id !== root && y.oid !== root && y.id !== e.id; }); }
      persist(); return '{"ok":true}';
    },
    dump: function (ids) {
      var want = String(ids || '').split(',').map(Number);
      return JSON.stringify(D.ev.filter(function (e) { return want.indexOf(e.cal) >= 0; }).sort(function (a, b) { return a.start - b.start; }).map(function (e) {
        var o = { id: e.id, t: e.t || '', d: e.d || '', l: e.l || '', start: e.start, end: e.end, all: !!e.all, rrule: e.rrule || '', exdate: '', cancel: !!e.cancel, rem: e.rem || [] };
        if (e.uid) o.uid = e.uid;
        if (e.oid) { o.oid = e.oid; o.oit = e.oit; }
        return o;
      }));
    },
    open: function (kind, arg) {
      arg = String(arg || '');
      if (kind === 'geo') { window.open('https://www.openstreetmap.org/search?query=' + encodeURIComponent(arg), '_blank', 'noopener'); return; }
      if (kind === 'url') { window.open(/^[a-z]+:/i.test(arg) ? arg : 'https://' + arg, '_blank', 'noopener'); return; }
      if (kind === 'mail') { location.href = 'mailto:' + arg; return; }
      if (kind === 'tel' || kind === 'sms') { M.clip.write(arg).then(function (ok) { M.toast(ok ? 'Numéro copié : ' + arg + ' (pas de téléphone sur PC)' : 'Appeler n\'est pas possible sur PC : ' + arg); }); return; }
      if (kind === 'share') {
        if (navigator.share) { navigator.share({ text: arg }).catch(function (e) { if (!e || e.name !== 'AbortError') copyShare(arg); }); return; }
        copyShare(arg); return;
      }
      M.unavailable(kind === 'accounts' ? 'L\'ajout d\'un compte Google' : 'Les réglages Android', 'utilise l\'import / export .ics');
    },
    pickFile: function () {
      M.fs.open({ types: [{ description: 'Agenda (.ics)', accept: { 'text/calendar': ['.ics', '.ical', '.ifb'] } }], accept: '.ics,.ical,text/calendar', id: 'agenda' }).then(function (l) {
        if (!l.length) return;
        return l[0].file.text().then(function (t) { emit('file', t); });
      }).catch(function (e) { M.toast('Lecture du fichier impossible : ' + (e && e.message || e), { bad: true }); });
    },
    pending: function () { var p = pend; pend = ''; return p; }
  };
  function copyShare(t) { M.clip.write(t).then(function (ok) { M.toast(ok ? 'Événement copié dans le presse-papier' : 'Partage impossible', { bad: !ok }); }); }
  var pend = '';
  window.MAGAgenda = B;

  /* .ics déposé sur la fenêtre ou ouvert avec « Ouvrir avec › Agenda » */
  M.conf.dropHint = 'Fichier agenda .ics à importer';
  M.onFiles(function (o) {
    var f = o.items.map(function (x) { return x.file; }).filter(function (f) { return f && (/calendar/.test(f.type) || /\.(ics|ical|ifb)$/i.test(f.name)); })[0];
    if (!f) { M.toast('Dépose un fichier agenda .ics', { bad: true }); return; }
    f.text().then(function (t) {
      var j = JSON.stringify({ k: 'ics', text: t });
      if (window.agendaEvent && document.readyState !== 'loading') emit('intent', j); else pend = j;
    });
  });

  /* Souris : boutons « précédent / suivant » dans l'en-tête (sur le téléphone, on balaie l'écran) */
  M.whenBody(function () {
    var h = document.querySelector('#app > header'), t = document.getElementById('bSearch'); if (!h || !t) return;
    var mk = function (n, lab, d) { var b = document.createElement('button'); b.className = 'hb mpc-step'; b.setAttribute('aria-label', lab); b.title = lab + (n < 0 ? ' (←)' : ' (→)'); b.innerHTML = '<svg class="ic" viewBox="0 0 24 24"><path d="' + d + '"/></svg>'; b.onclick = function () { if (typeof window.__agendaStep === 'function') window.__agendaStep(n); }; return b; };
    h.insertBefore(mk(-1, 'Période précédente', 'm15 6-6 6 6 6'), t); h.insertBefore(mk(1, 'Période suivante', 'm9 6 6 6-6 6'), t);
  });
  /* Clavier : Ctrl+N nouvel événement, Ctrl+F chercher, T aujourd'hui, ← → période, 1 à 4 vues, Échap fermer */
  function click(sel) { var b = document.querySelector(sel); if (b && b.getClientRects().length) { b.click(); return true; } return false; }
  function free() { return !document.querySelector('.sheet.on, .full.on'); }
  function k(fn) { return function () { if (!free()) return false; return fn() === false ? false : undefined; }; }
  M.keys({
    'mod+n': k(function () { return click('#fab'); }),
    'n': k(function () { return click('#fab'); }),
    'mod+f': k(function () { return click('#bSearch'); }),
    't': k(function () { return click('#bToday'); }),
    'arrowleft': k(function () { if (typeof window.__agendaStep !== 'function') return false; window.__agendaStep(-1); }),
    'arrowright': k(function () { if (typeof window.__agendaStep !== 'function') return false; window.__agendaStep(1); }),
    '1': k(function () { return click('#tabs [data-v="month"]'); }),
    '2': k(function () { return click('#tabs [data-v="week"]'); }),
    '3': k(function () { return click('#tabs [data-v="day"]'); }),
    '4': k(function () { return click('#tabs [data-v="agenda"]'); }),
    'escape': function () { if (window.agendaBack && window.agendaBack()) return; return false; }
  });
  setTimeout(planReminders, 1500);
})();
