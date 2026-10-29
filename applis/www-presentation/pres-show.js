/* Présentation — diaporama : transitions, animations (entrée, emphase, sortie ; au clic, avec, après),
   minutage automatique, boucle, écran noir/blanc, stylo, surligneur et pointeur laser, mode présentateur
   (fenêtre publique synchronisée par BroadcastChannel), répétition du minutage. */
(function () {
  'use strict';
  const O = window.Office, P = window.Pres;
  /* ---------------- Catalogue ---------------- */
  P.TRANSITIONS = [['none', 'Aucune', 'square-dashed'], ['fade', 'Fondu', 'blend'], ['fadeBlack', 'Fondu par le noir', 'moon'], ['push', 'Pousser', 'arrow-left-to-line'], ['cover', 'Couvrir', 'panel-left-close'], ['uncover', 'Découvrir', 'panel-left-open'], ['wipe', 'Balayer', 'move-horizontal'], ['split', 'Fractionner', 'columns-2'], ['zoom', 'Zoom', 'zoom-in'], ['circle', 'Cercle', 'circle'], ['flip', 'Retourner', 'flip-horizontal-2'], ['blinds', 'Stores', 'align-justify']];
  P.TR_DIRS = { push: 1, cover: 1, uncover: 1, wipe: 1 };
  P.ANIMS = {
    in: [['appear', 'Apparaître'], ['fade', 'Fondu'], ['fly', 'Entrée brusque'], ['float', 'Flottant'], ['zoom', 'Zoom'], ['wipe', 'Balayer'], ['split', 'Fractionner'], ['bounce', 'Rebond'], ['growTurn', 'Agrandir et tourner'], ['swivel', 'Pivoter']],
    em: [['pulse', 'Impulsion'], ['spin', 'Rotation'], ['grow', 'Agrandir / réduire'], ['teeter', 'Bascule'], ['blink', 'Clignotement'], ['colorPulse', 'Éclat de couleur']],
    out: [['disappear', 'Disparaître'], ['fadeOut', 'Fondu'], ['flyOut', 'Sortie brusque'], ['floatOut', 'Flottant'], ['zoomOut', 'Zoom'], ['wipeOut', 'Balayer'], ['shrinkTurn', 'Réduire et tourner']]
  };
  P.ANIM_DIRS = { fly: 1, float: 1, wipe: 1, flyOut: 1, floatOut: 1, wipeOut: 1 };
  P.animName = (a) => { const l = P.ANIMS[a.cat] || []; const x = l.find((k) => k[0] === a.fx); return x ? x[1] : a.fx; };
  /** Étapes d'animation d'une diapo : [{auto:bool, items:[{a, t0}]}] (t0 en secondes depuis le début de l'étape) */
  P.animSteps = function (slide) {
    const steps = []; let cur = null, prevStart = 0, prevEnd = 0;
    (slide.anims || []).forEach((a, i) => {
      if (a.start === 'click' || !cur) { cur = { auto: a.start !== 'click', items: [] }; steps.push(cur); prevStart = 0; prevEnd = 0; if (a.start !== 'click' && i > 0) cur.auto = false; }
      const t0 = (a.start === 'after' ? prevEnd : prevStart) + (a.delay || 0);
      if (a.start !== 'click' || cur.items.length === 0) { /* rien */ }
      cur.items.push({ a, t0 });
      prevStart = t0; prevEnd = Math.max(prevEnd, t0 + (a.fx === 'appear' || a.fx === 'disappear' ? 0 : (a.dur || 0.5)) * (a.repeat || 1));
    });
    if (steps.length && (slide.anims || [])[0] && slide.anims[0].start !== 'click') steps[0].auto = true;
    return steps;
  };
  function kf(a, e, W, H) {
    const dir = a.dir || 'b', dur = (a.dur || 0.5) * 1000;
    const off = () => { if (dir === 'l') return [-(e.x + e.w + 20), 0]; if (dir === 'r') return [W - e.x + 20, 0]; if (dir === 't') return [0, -(e.y + e.h + 20)]; return [0, H - e.y + 20]; };
    const wipeFrom = { l: 'inset(0 100% 0 0)', r: 'inset(0 0 0 100%)', t: 'inset(0 0 100% 0)', b: 'inset(100% 0 0 0)' }[dir] || 'inset(0 100% 0 0)';
    switch (a.fx) {
      case 'appear': return [[{ visibility: 'hidden' }, { visibility: 'visible' }], 1];
      case 'fade': return [[{ opacity: 0 }, { opacity: 1 }], dur];
      case 'fly': { const o = off(); return [[{ translate: o[0] + 'px ' + o[1] + 'px' }, { translate: '0 0' }], dur, 'cubic-bezier(.2,.8,.3,1)']; }
      case 'float': return [[{ opacity: 0, translate: '0 ' + (dir === 't' ? -60 : 60) + 'px' }, { opacity: 1, translate: '0 0' }], dur, 'ease-out'];
      case 'zoom': return [[{ opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1 }], dur, 'ease-out'];
      case 'wipe': return [[{ clipPath: wipeFrom }, { clipPath: 'inset(0 0 0 0)' }], dur];
      case 'split': return [[{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }], dur];
      case 'bounce': return [[{ opacity: 0, translate: '0 -' + (e.y + e.h) + 'px' }, { opacity: 1, translate: '0 0', offset: 0.55 }, { translate: '0 -40px', offset: 0.72 }, { translate: '0 0', offset: 0.86 }, { translate: '0 -12px', offset: 0.93 }, { translate: '0 0' }], dur * 1.6, 'ease-in'];
      case 'growTurn': return [[{ opacity: 0, scale: 0.1, rotate: '-90deg' }, { opacity: 1, scale: 1, rotate: '0deg' }], dur, 'ease-out'];
      case 'swivel': return [[{ opacity: 0, transform: 'perspective(800px) rotateY(90deg)' }, { opacity: 1, transform: 'perspective(800px) rotateY(0deg)' }], dur];
      case 'pulse': return [[{ scale: 1 }, { scale: 1.1 }, { scale: 1 }], dur];
      case 'spin': return [[{ rotate: '0deg' }, { rotate: '360deg' }], dur * 1.5, 'ease-in-out'];
      case 'grow': return [[{ scale: 1 }, { scale: 1.5 }], dur, 'ease-out', 'forwards'];
      case 'teeter': return [[{ rotate: '0deg' }, { rotate: '6deg' }, { rotate: '-6deg' }, { rotate: '4deg' }, { rotate: '-4deg' }, { rotate: '0deg' }], dur];
      case 'blink': return [[{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], dur];
      case 'colorPulse': return [[{ filter: 'brightness(1)' }, { filter: 'brightness(1.6) saturate(1.5)' }, { filter: 'brightness(1)' }], dur];
      case 'disappear': return [[{ visibility: 'visible' }, { visibility: 'hidden' }], 1];
      case 'fadeOut': return [[{ opacity: 1 }, { opacity: 0 }], dur];
      case 'flyOut': { const o = off(); return [[{ translate: '0 0' }, { translate: o[0] + 'px ' + o[1] + 'px' }], dur, 'cubic-bezier(.7,0,.8,.2)']; }
      case 'floatOut': return [[{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 ' + (dir === 'b' ? 60 : -60) + 'px' }], dur, 'ease-in'];
      case 'zoomOut': return [[{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.3 }], dur, 'ease-in'];
      case 'wipeOut': return [[{ clipPath: 'inset(0 0 0 0)' }, { clipPath: wipeFrom }], dur];
      case 'shrinkTurn': return [[{ opacity: 1, scale: 1, rotate: '0deg' }, { opacity: 0, scale: 0.1, rotate: '90deg' }], dur, 'ease-in'];
      default: return [[{ opacity: 0 }, { opacity: 1 }], dur];
    }
  }
  /** Prépare l'état initial (objets à entrée animée cachés) et joue une étape */
  P.animPrepare = function (root, slide) {
    (slide.anims || []).forEach((a) => {
      const n = root.querySelector('.el[data-id="' + a.el + '"]'); if (!n) return;
      if (a.cat === 'in' && !n.dataset.animInit) { n.dataset.animInit = 1; n.style.visibility = 'hidden'; }
    });
  };
  function playOne(root, slide, a, delay, doc, instant) {
    const n = root.querySelector('.el[data-id="' + a.el + '"]'); if (!n) return Promise.resolve();
    const e = P.findEl(slide, a.el) || { x: 0, y: 0, w: 100, h: 100 };
    const [frames, dur, easing, fill] = kf(a, e, doc.size.w, doc.size.h);
    if (a.cat === 'in') n.style.visibility = 'visible';
    if (instant) { if (a.cat === 'out') n.style.visibility = 'hidden'; return Promise.resolve(); }
    const anim = n.animate(frames, { duration: Math.max(1, dur), delay: delay * 1000, easing: easing || 'ease', fill: fill || 'both', iterations: a.repeat || 1 });
    n._anims = (n._anims || []).concat(anim);
    return anim.finished.then(() => { if (a.cat === 'out') n.style.visibility = 'hidden'; if (a.cat !== 'em' || !fill) anim.cancel(); if (a.cat === 'in') n.style.visibility = 'visible'; }).catch(() => { });
  }
  P.animPlayStep = function (root, slide, step, doc, instant) {
    return Promise.all(step.items.map((it) => playOne(root, slide, it.a, it.t0, doc, instant)));
  };

  /* ---------------- Transitions ---------------- */
  function transition(oldN, newN, tr, dir, instant) {
    const type = tr && tr.type || 'none', dur = Math.max(0.05, (tr && tr.dur) || 0.7) * 1000;
    if (instant || type === 'none' || !oldN) return Promise.resolve();
    const d = tr.dir || dir || 'l';
    const v = { l: ['100%', '0'], r: ['-100%', '0'], u: ['0', '100%'], d: ['0', '-100%'] }[d];
    const opp = { l: ['-100%', '0'], r: ['100%', '0'], u: ['0', '-100%'], d: ['0', '100%'] }[d];
    const go = (n, frames, o) => n.animate(frames, Object.assign({ duration: dur, easing: 'ease-in-out', fill: 'both' }, o || {})).finished;
    switch (type) {
      case 'fade': return go(newN, [{ opacity: 0 }, { opacity: 1 }]);
      case 'fadeBlack': return go(oldN, [{ opacity: 1 }, { opacity: 0 }], { duration: dur / 2 }).then(() => { oldN.style.visibility = 'hidden'; return go(newN, [{ opacity: 0 }, { opacity: 1 }], { duration: dur / 2 }); });
      case 'push': return Promise.all([go(oldN, [{ translate: '0 0' }, { translate: opp.join(' ') }]), go(newN, [{ translate: v.join(' ') }, { translate: '0 0' }])]);
      case 'cover': return go(newN, [{ translate: v.join(' ') }, { translate: '0 0' }]);
      case 'uncover': newN.parentNode.insertBefore(newN, oldN); return go(oldN, [{ translate: '0 0' }, { translate: opp.join(' ') }]);
      case 'wipe': { const from = { l: 'inset(0 0 0 100%)', r: 'inset(0 100% 0 0)', u: 'inset(100% 0 0 0)', d: 'inset(0 0 100% 0)' }[d]; return go(newN, [{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }]); }
      case 'split': return go(newN, [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }]);
      case 'zoom': return go(newN, [{ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1 }]);
      case 'circle': return go(newN, [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }]);
      case 'flip': return go(oldN, [{ transform: 'perspective(1600px) rotateY(0deg)' }, { transform: 'perspective(1600px) rotateY(90deg)' }], { duration: dur / 2, easing: 'ease-in' }).then(() => { oldN.style.visibility = 'hidden'; return go(newN, [{ transform: 'perspective(1600px) rotateY(-90deg)' }, { transform: 'perspective(1600px) rotateY(0deg)' }], { duration: dur / 2, easing: 'ease-out' }); });
      case 'blinds': { const st = []; for (let i = 0; i <= 10; i++) { const k = i / 10; st.push({ maskImage: 'repeating-linear-gradient(180deg,#000 0 ' + (k * 10) + '%,transparent ' + (k * 10) + '% 10%)', WebkitMaskImage: 'repeating-linear-gradient(180deg,#000 0 ' + (k * 10) + '%,transparent ' + (k * 10) + '% 10%)' }); } return go(newN, st, { easing: 'linear' }).then(() => { newN.style.maskImage = ''; }); }
      default: return go(newN, [{ opacity: 0 }, { opacity: 1 }]);
    }
  }
  P.transition = transition;

  /* ---------------- Moteur ---------------- */
  /** new P.Show(hôte, doc, {follower, onState, onEnd, preview, quiet}) */
  P.Show = function (host, doc, opt) {
    opt = opt || {};
    const S = this; S.doc = doc; S.host = host; S.i = -1; S.step = 0; S.ink = {}; S.blackMode = null;
    const stage = O.h('div', { cls: 'show-stage' }); host.appendChild(stage);
    const ink = O.h('canvas', { cls: 'show-ink' }); host.appendChild(ink);
    const black = O.h('div', { cls: 'show-black' }); host.appendChild(black);
    const laser = O.h('div', { cls: 'show-laser' }); host.appendChild(laser);
    S.stage = stage; S.inkCanvas = ink; S.laserEl = laser; S.blackEl = black;
    let cur = null, steps = [], busy = Promise.resolve(), timer = null, slideStart = 0;
    S.fit = function () {
      const W = doc.size.w, H = doc.size.h, hw = host.clientWidth, hh = host.clientHeight;
      const k = Math.min(hw / W, hh / H); S.k = k;
      stage.style.width = W + 'px'; stage.style.height = H + 'px';
      stage.style.transform = 'translate(' + (-W * k / 2) + 'px,' + (-H * k / 2) + 'px) scale(' + k + ')';
      const dpr = devicePixelRatio || 1; ink.width = hw * dpr; ink.height = hh * dpr; ink.style.width = hw + 'px'; ink.style.height = hh + 'px';
      S.ox = (hw - W * k) / 2; S.oy = (hh - H * k) / 2; redrawInk();
    };
    S.visible = () => doc.slides.map((s, i) => i).filter((i) => !doc.slides[i].hidden || i === S.forceIdx);
    function render(i) {
      const s = doc.slides[i];
      const n = P.renderSlide(doc, s, { mode: 'show', index: i });
      stage.appendChild(n);
      P.fitAll(n, doc, s);
      if (window.katex === undefined && n.querySelector('.eq-raw') && window.PresApp && window.PresApp.loadKatex) window.PresApp.loadKatex().then(() => { O.$$('.eq-raw', n).forEach((r) => { r.outerHTML = P.katexHtml(r.dataset.tex, true) || r.outerHTML; }); });
      P.animPrepare(n, s);
      return n;
    }
    function stopMedia(n, keepAcross) { if (!n) return; O.$$('video,audio', n).forEach((m) => { if (keepAcross && m.dataset.across === '1') { document.body.appendChild(m); m.style.display = 'none'; return; } try { m.pause(); } catch (e) { } }); O.$$('iframe', n).forEach((f) => f.remove()); }
    function startMedia(n) {
      O.$$('video[data-auto="1"],audio[data-auto="1"]', n).forEach((m) => { try { m.currentTime = +m.dataset.start || 0; } catch (e) { } const p = m.play(); if (p && p.catch) p.catch(() => { }); });
      O.$$('video', n).forEach((v) => { const end = +v.dataset.end; if (end) v.addEventListener('timeupdate', () => { if (v.currentTime >= end) { v.pause(); } }); if (+v.dataset.start) v.addEventListener('loadedmetadata', () => { v.currentTime = +v.dataset.start; }, { once: true }); });
    }
    S.go = function (i, opt2) {
      opt2 = opt2 || {};
      busy = busy.then(async () => {
        if (i < 0 || i >= doc.slides.length) return;
        clearTimeout(timer);
        const prev = cur, back = opt2.back;
        const n = render(i);
        S.i = i; S.step = 0; steps = P.animSteps(doc.slides[i]); slideStart = Date.now();
        if (opt2.toEnd) { for (const st of steps) await P.animPlayStep(n, doc.slides[i], st, doc, true); S.step = steps.length; }
        cur = n;
        S.emit();
        stopMedia(prev, true);
        await transition(prev, n, back ? null : doc.slides[i].transition, null, opt2.instant || back || opt.preview === 'still');
        if (prev) prev.remove();
        redrawInk();
        startMedia(n);
        if (!opt2.toEnd && steps[0] && steps[0].auto) { S.step = 1; S.emit(); await P.animPlayStep(n, doc.slides[i], steps[0], doc, opt2.instant); }
        armTimer();
      });
      return busy;
    };
    function armTimer() {
      clearTimeout(timer);
      const s = doc.slides[S.i]; if (!s || opt.follower || !doc.settings.useTimings) return;
      const after = s.advance && s.advance.after; if (after == null || after === '') return;
      const left = Math.max(0, after * 1000 - (Date.now() - slideStart));
      timer = setTimeout(() => S.next(), S.step < steps.length ? Math.min(left, 1) || 1 : left);
      if (S.step < steps.length) { clearTimeout(timer); timer = setTimeout(() => S.next(), left / Math.max(1, steps.length - S.step + 1)); }
    }
    S.next = function () {
      if (S.blackMode) { S.setBlack(null); return; }
      busy = busy.then(async () => {
        if (S.ended) return;
        if (S.step < steps.length) { const st = steps[S.step]; S.step++; S.emit(); await P.animPlayStep(cur, doc.slides[S.i], st, doc); armTimer(); return; }
        const vis = S.visible(), k = vis.indexOf(S.i);
        let nx = vis.find((x) => x > S.i);
        if (nx == null) { if (doc.settings.loop) nx = vis[0]; else { S.showEnd(); return; } }
        void k; S.go(nx);
      });
      return busy;
    };
    S.prev = function () {
      if (S.blackMode) { S.setBlack(null); return; }
      if (S.ended) { S.ended = false; const e = host.querySelector('.show-end'); if (e) e.remove(); S.emit(); return; }
      busy = busy.then(async () => {
        if (S.step > (steps[0] && steps[0].auto ? 1 : 0)) { // revenir d'une étape : on rejoue la diapo jusqu'à l'étape précédente
          const target = S.step - 1; const n = render(S.i); for (let k = 0; k < target; k++) await P.animPlayStep(n, doc.slides[S.i], steps[k], doc, true); stopMedia(cur); cur.remove(); cur = n; S.step = target; S.emit(); return;
        }
        const vis = S.visible(); let pv = vis.slice().reverse().find((x) => x < S.i);
        if (pv == null) { if (doc.settings.loop) pv = vis[vis.length - 1]; else return; }
        S.go(pv, { back: true, toEnd: true });
      });
      return busy;
    };
    S.showEnd = function () { S.ended = true; clearTimeout(timer); const e = O.h('div', { cls: 'show-end' }, 'Fin du diaporama. Cliquez pour quitter.'); host.appendChild(e); S.emit(); };
    S.setBlack = function (m) { S.blackMode = m; black.className = 'show-black' + (m ? ' on' : '') + (m === 'white' ? ' white' : ''); S.emit(); };
    S.state = () => ({ i: S.i, step: S.step, black: S.blackMode, ended: !!S.ended, steps: steps.length });
    S.emit = function () { if (opt.onState) opt.onState(S.state()); };
    /** Suiveur (fenêtre publique) : rejoint l'état du présentateur */
    S.apply = async function (st) {
      if (st.ended && !S.ended) { S.showEnd(); return; }
      if (!st.ended && S.ended) { S.ended = false; const e = host.querySelector('.show-end'); if (e) e.remove(); }
      if (st.black !== S.blackMode) S.setBlack(st.black);
      if (st.i !== S.i) { await S.go(st.i, { toEnd: false, instant: false }); await busy; }
      while (S.step < st.step && S.step < steps.length) { const s2 = steps[S.step]; S.step++; await P.animPlayStep(cur, doc.slides[S.i], s2, doc); }
      if (st.step < S.step) { const n = render(S.i); for (let k = 0; k < st.step; k++) await P.animPlayStep(n, doc.slides[S.i], steps[k], doc, true); stopMedia(cur); cur.remove(); cur = n; S.step = st.step; }
    };
    S.destroy = function () { clearTimeout(timer); stopMedia(cur); O.$$('audio,video', document.body).forEach((m) => { if (m.parentNode === document.body) { m.pause(); m.remove(); } }); host.innerHTML = ''; };
    S.current = () => cur;
    /* ---------- encre ---------- */
    function redrawInk() {
      const x = ink.getContext('2d'); const dpr = devicePixelRatio || 1; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, ink.width, ink.height);
      const list = S.ink[S.i] || []; x.setTransform(dpr * S.k, 0, 0, dpr * S.k, dpr * S.ox, dpr * S.oy);
      x.lineCap = 'round'; x.lineJoin = 'round';
      list.forEach((st) => { x.strokeStyle = st.c; x.globalAlpha = st.hl ? 0.4 : 1; x.lineWidth = st.w; x.beginPath(); st.p.forEach((p, k) => k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.stroke(); });
      x.globalAlpha = 1;
    }
    S.redrawInk = redrawInk;
    S.addStroke = (st) => { (S.ink[S.i] = S.ink[S.i] || []).push(st); redrawInk(); };
    S.clearInk = () => { S.ink[S.i] = []; redrawInk(); };
    S.toSlide = (cx, cy) => { const r = host.getBoundingClientRect(); return [(cx - r.left - S.ox) / S.k, (cy - r.top - S.oy) / S.k]; };
    S.setLaser = (on, p, color) => { laser.style.display = on ? 'block' : 'none'; if (color) host.style.setProperty('--laser', color); if (on && p) { laser.style.left = (S.ox + p[0] * S.k) + 'px'; laser.style.top = (S.oy + p[1] * S.k) + 'px'; } };
    new ResizeObserver(() => S.fit()).observe(host);
    S.fit();
  };

  /* ---------------- Diaporama dans l'appli ---------------- */
  const A = window.PresApp;
  let chan = null, show = null, pres = null, keyFn = null, tools = { mode: null, color: '#E03131' }, gotoBuf = '', rehearse = null, timerStart = 0, timerPause = 0, paused = false, clockT = null;
  function channel() { if (!chan && 'BroadcastChannel' in window) { chan = new BroadcastChannel('magpres-show'); chan.onmessage = (m) => onMsg(m.data); } return chan; }
  function post(m) { try { const c = channel(); if (c) c.postMessage(m); } catch (e) { } }
  function onMsg(m) {
    if (!m) return;
    if (m.type === 'hello' && A.showing && A.presenterMode) post({ type: 'state', st: show.state() });
    if (m.type === 'key' && A.showing && A.presenterMode) handleKey({ key: m.key, preventDefault() { }, stopPropagation() { } });
    if (m.type === 'closed' && A.presenterMode) { A.audienceWin = null; }
  }
  A.startShow = async function (from, opt) {
    opt = opt || {};
    if (A.editing) A.stopEdit();
    if (!A.doc.slides.length) return;
    const host = document.getElementById('show');
    host.innerHTML = ''; host.className = 'on';
    A.showing = true; A.presenterMode = !!opt.presenter;
    const doc = A.doc;
    let idx = from || 0; if (doc.slides[idx].hidden && !opt.forceHidden) { const v = doc.slides.findIndex((s, i) => i >= idx && !s.hidden); idx = v >= 0 ? v : idx; }
    if (A.presenterMode) { setupPresenter(); host.className = ''; }
    const target = A.presenterMode ? document.querySelector('#presenter .pr-cur .pr-host') : host;
    show = new P.Show(target, doc, { onState: (st) => { post({ type: 'state', st }); updatePresenter(st); updateNum(st); if (rehearse) rehearseTick(st); } });
    A.show = show;
    if (!A.presenterMode) buildBar(host);
    attachInput(A.presenterMode ? document.querySelector('#presenter .pr-cur') : host);
    keyFn = (e) => handleKey(e);
    window.addEventListener('keydown', keyFn, true);
    timerStart = Date.now(); timerPause = 0; paused = false;
    if (!A.presenterMode && !opt.noFullscreen) { try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { } }
    if (window.MAGPC) window.MAGPC.keepScreen(true);
    else if (window.MAGPrint && window.MAGPrint.keepScreen) window.MAGPrint.keepScreen(true);
    if (opt.rehearse) { rehearse = { times: {}, at: Date.now(), i: idx }; }
    document.addEventListener('fullscreenchange', fsChange);
    await show.go(idx, { instant: false });
    if (A.presenterMode) { const n = document.querySelector('#presenter .pr-cur'); n.focus && n.focus(); }
  };
  function fsChange() { if (!document.fullscreenElement && A.showing && !A.presenterMode && !A._leavingFs) { /* Échap quitte le plein écran : on termine aussi */ A.endShow(); } }
  A.endShow = function () {
    if (!A.showing) return;
    const last = show ? show.i : A.cur;
    A.showing = false; A._leavingFs = true;
    window.removeEventListener('keydown', keyFn, true);
    document.removeEventListener('fullscreenchange', fsChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    setTimeout(() => { A._leavingFs = false; }, 300);
    post({ type: 'end' });
    if (show) show.destroy(); show = null; A.show = null;
    const host = document.getElementById('show'); host.className = ''; host.innerHTML = '';
    document.getElementById('presenter').classList.remove('on');
    clearInterval(clockT);
    if (window.MAGPC) window.MAGPC.keepScreen(false); else if (window.MAGPrint && window.MAGPrint.keepScreen) window.MAGPrint.keepScreen(false);
    if (rehearse) finishRehearse();
    // annotations : proposer de les garder
    const inked = Object.keys(A._lastInk || {}).filter((k) => (A._lastInk[k] || []).length);
    if (inked.length) O.confirm('Annotations', 'Conserver les annotations faites pendant le diaporama (' + inked.length + ' diapositive' + (inked.length > 1 ? 's' : '') + ') ?', 'Conserver').then((ok) => { if (ok) keepInk(A._lastInk); A._lastInk = null; });
    if (last >= 0 && last < A.doc.slides.length) A.goto(last);
  };
  function keepInk(map) {
    Object.keys(map).forEach((i) => {
      const s = A.doc.slides[+i]; if (!s) return;
      map[i].forEach((st) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; st.p.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
        const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
        const d = 'M' + st.p.map((p) => O.round(p[0] - x0, 1) + ',' + O.round(p[1] - y0, 1)).join(' L');
        s.elements.push({ id: P.uid(), type: 'shape', shape: 'custom', path: { d, vw: w, vh: h }, x: x0, y: y0, w, h, rot: 0, fill: null, line: { color: st.c, w: st.w * 0.75, alpha: st.hl ? 0.4 : 1 }, html: '', name: 'Annotation', alt: 'Annotation à main levée' });
      });
    });
    A.change('Conserver les annotations');
  }
  function buildBar(host) {
    const bar = O.h('div', { cls: 'show-bar' });
    bar.innerHTML = [['prev', 'chevron-left', 'Précédente (←)'], ['next', 'chevron-right', 'Suivante (→)'], ['pen', 'pen-line', 'Stylo (Ctrl+P)'], ['hl', 'highlighter', 'Surligneur'], ['laser', 'locate-fixed', 'Pointeur laser (Ctrl+L)'], ['erase', 'eraser', 'Effacer les annotations (E)'], ['grid', 'layout-grid', 'Toutes les diapositives (G)'], ['menu', 'ellipsis', 'Plus'], ['end', 'x', 'Terminer (Échap)']].map((b) => '<button type="button" data-b="' + b[0] + '" title="' + b[2] + '" aria-label="' + b[2] + '">' + O.icon(b[1]) + '</button>').join('');
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (b) toolAction(b.dataset.b, b); });
    host.appendChild(bar);
    host.appendChild(O.h('div', { cls: 'show-num' }));
    host.appendChild(O.h('div', { cls: 'show-goto' }));
    let t = null; host.addEventListener('pointermove', () => { host.classList.add('cur'); clearTimeout(t); t = setTimeout(() => host.classList.remove('cur'), 2200); });
  }
  function updateNum(st) { const n = document.querySelector('#show .show-num'); if (n) n.textContent = (st.i + 1) + ' / ' + A.doc.slides.length; }
  function toolAction(k, btn) {
    if (k === 'prev') show.prev(); else if (k === 'next') show.next();
    else if (k === 'pen' || k === 'hl' || k === 'laser') setTool(tools.mode === k ? null : k);
    else if (k === 'erase') { show.clearInk(); post({ type: 'ink-clear', i: show.i }); }
    else if (k === 'grid') toggleGrid();
    else if (k === 'end') A.endShow();
    else if (k === 'menu') O.menu(btn, [
      { label: 'Écran noir', kbd: 'B', on: () => setBlackLocal('black') }, { label: 'Écran blanc', kbd: 'W', on: () => setBlackLocal('white') },
      { label: 'Couleur de l\'encre', sub: ['#E03131', '#1971C2', '#2F9E44', '#F59F00', '#000000', '#FFFFFF'].map((c) => ({ html: '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:' + c + ';border:1px solid #0003;vertical-align:middle"></span> ' + c, checked: tools.color === c, on: () => { tools.color = c; } })) },
      { label: 'Aller à la diapositive…', on: () => toggleGrid() },
      { label: 'Afficher les raccourcis', kbd: 'F1', on: () => A.cmd.shortcuts(true) }
    ], { sheet: false });
  }
  function setTool(m) {
    tools.mode = m;
    const h = document.getElementById(A.presenterMode ? 'presenter' : 'show');
    const host = document.getElementById('show'); host.classList.toggle('pen-on', m === 'pen' || m === 'hl'); host.classList.toggle('laser-on', m === 'laser');
    O.$$('.show-bar [data-b], .pr-bot [data-b]', document).forEach((b) => b.classList.toggle('on', b.dataset.b === m));
    if (m !== 'laser' && show) { show.setLaser(false); post({ type: 'laser', on: false }); }
    void h;
  }
  function setBlackLocal(m) { show.setBlack(show.blackMode === m ? null : m); }
  function toggleGrid() {
    const host = A.presenterMode ? document.getElementById('presenter') : document.getElementById('show');
    let g = host.querySelector('.show-grid');
    if (g && g.classList.contains('on')) { g.classList.remove('on'); return; }
    if (!g) { g = O.h('div', { cls: 'show-grid' }); host.appendChild(g); g.addEventListener('click', (e) => { const it = e.target.closest('[data-i]'); if (it) { g.classList.remove('on'); show.forceIdx = +it.dataset.i; show.go(+it.dataset.i); } }); g.addEventListener('pointerdown', (e) => e.stopPropagation()); }
    const W = A.doc.size.w; g.style.setProperty('--ar', W + '/' + A.doc.size.h);
    g.innerHTML = A.doc.slides.map((s, i) => '<div data-i="' + i + '" class="so-it' + (s.hidden ? ' hid' : '') + '" style="cursor:pointer"><div class="th-box" style="aspect-ratio:' + W + '/' + A.doc.size.h + '"></div><div class="cap">' + (i + 1) + '. ' + O.esc(P.slideTitle(s) || '') + (s.hidden ? ' (masquée)' : '') + '</div></div>').join('');
    g.classList.add('on');
    requestAnimationFrame(() => O.$$('.th-box', g).forEach((b, i) => { const n = P.renderSlide(A.doc, A.doc.slides[i], { mode: 'thumb', index: i }); n.style.transform = 'scale(' + (b.clientWidth / W) + ')'; n.style.transformOrigin = '0 0'; n.style.position = 'absolute'; b.style.position = 'relative'; b.appendChild(n); }));
  }
  function attachInput(host) {
    let stroke = null, swipe = null;
    host.addEventListener('pointerdown', (e) => {
      if (!A.showing || e.button === 2) return;
      if (e.target.closest('.show-bar, video, audio, iframe, .show-grid, button, .vid-ph, .show-end')) { if (e.target.closest('.show-end')) A.endShow(); if (e.target.closest('.vid-ph')) playYt(e.target.closest('.vid-yt')); return; }
      const p = show.toSlide(e.clientX, e.clientY);
      if (tools.mode === 'pen' || tools.mode === 'hl') { e.preventDefault(); stroke = { c: tools.color, w: tools.mode === 'hl' ? 22 : 4, hl: tools.mode === 'hl', p: [p] }; host.setPointerCapture(e.pointerId); return; }
      if (tools.mode === 'laser') { show.setLaser(true, p, A.doc.settings.laser); post({ type: 'laser', on: true, p, c: A.doc.settings.laser }); return; }
      const link = e.target.closest('.el.has-link'); if (link) { e.preventDefault(); followShowLink(JSON.parse(link.dataset.link)); return; }
      const a = e.target.closest('.el-tx-in a'); if (a) { e.preventDefault(); const h = a.getAttribute('href'); if (/^#slide:/.test(h)) followShowLink({ type: 'slide', slide: h.slice(7) }); else if (/^#/.test(h)) followShowLink({ type: h.slice(1) }); else followShowLink({ type: 'url', url: h }); return; }
      swipe = { x: e.clientX, y: e.clientY, t: Date.now(), touch: e.pointerType === 'touch' };
    });
    host.addEventListener('pointermove', (e) => {
      if (!A.showing) return;
      const p = show.toSlide(e.clientX, e.clientY);
      if (stroke) { stroke.p.push(p); const x = show.inkCanvas.getContext('2d'); const dpr = devicePixelRatio || 1; x.setTransform(dpr * show.k, 0, 0, dpr * show.k, dpr * show.ox, dpr * show.oy); x.strokeStyle = stroke.c; x.globalAlpha = stroke.hl ? 0.4 : 1; x.lineWidth = stroke.w; x.lineCap = 'round'; const q = stroke.p[stroke.p.length - 2]; x.beginPath(); x.moveTo(q[0], q[1]); x.lineTo(p[0], p[1]); x.stroke(); x.globalAlpha = 1; return; }
      if (tools.mode === 'laser') { show.setLaser(true, p, A.doc.settings.laser); post({ type: 'laser', on: true, p, c: A.doc.settings.laser }); }
    });
    const up = (e) => {
      if (stroke) { if (stroke.p.length > 1) { show.addStroke(stroke); post({ type: 'ink', i: show.i, st: stroke }); A._lastInk = show.ink; } stroke = null; return; }
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; const s = swipe; swipe = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) show.next(); else show.prev(); return; }
      if (Math.hypot(dx, dy) < 12 && Date.now() - s.t < 600 && !A.presenterMode) show.next();
      else if (A.presenterMode && Math.hypot(dx, dy) < 12) show.next();
    };
    host.addEventListener('pointerup', up); host.addEventListener('pointercancel', () => { stroke = null; swipe = null; });
    host.addEventListener('contextmenu', (e) => { if (!A.showing) return; e.preventDefault(); toolAction('menu', { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }); });
    host.addEventListener('wheel', (e) => { if (!A.showing || e.target.closest('.show-grid, .pr-notes')) return; e.preventDefault(); if (e.deltaY > 0) show.next(); else if (e.deltaY < 0) show.prev(); }, { passive: false });
  }
  function playYt(box) {
    if (!box) return;
    const id = box.dataset.yt, st = +box.dataset.start || 0;
    const f = document.createElement('iframe');
    f.className = 'show-yt'; f.title = 'Vidéo YouTube'; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.setAttribute('allowfullscreen', '');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1' + (st ? '&start=' + st : '');
    box.innerHTML = ''; box.appendChild(f);
  }
  function followShowLink(l) {
    if (!l) return;
    if (l.type === 'url') { const w = (window.MAGPC && window.MAGPC.nativeOpen) || window.open; w.call(window, l.url, '_blank', 'noopener'); return; }
    if (l.type === 'slide') { const i = P.slideIndex(A.doc, l.slide); if (i >= 0) { show.forceIdx = i; show.go(i); } return; }
    if (l.type === 'next') show.next(); if (l.type === 'prev') show.prev();
    if (l.type === 'first') show.go(show.visible()[0]); if (l.type === 'last') { const v = show.visible(); show.go(v[v.length - 1]); }
    if (l.type === 'end') A.endShow();
  }
  function handleKey(e) {
    if (!A.showing) return;
    if (O.dialogOpen() || O.menuOpen()) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (/^[0-9]$/.test(k) && !mod) { gotoBuf += k; const g = document.querySelector('.show-goto'); if (g) { g.textContent = gotoBuf; g.style.display = 'block'; } stop(); return; }
    if (k === 'Enter' && gotoBuf) { const n = parseInt(gotoBuf, 10) - 1; gotoBuf = ''; const g = document.querySelector('.show-goto'); if (g) g.style.display = 'none'; if (n >= 0 && n < A.doc.slides.length) { show.forceIdx = n; show.go(n); } stop(); return; }
    if (gotoBuf && k !== 'Enter') { gotoBuf = ''; const g = document.querySelector('.show-goto'); if (g) g.style.display = 'none'; }
    if (mod && (k === 'p' || k === 'P')) { setTool(tools.mode === 'pen' ? null : 'pen'); stop(); return; }
    if (mod && (k === 'l' || k === 'L')) { setTool(tools.mode === 'laser' ? null : 'laser'); stop(); return; }
    if (mod && (k === 'a' || k === 'A')) { setTool(null); stop(); return; }
    if (mod && (k === 'i' || k === 'I')) { setTool(tools.mode === 'hl' ? null : 'hl'); stop(); return; }
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'n': case 'N': case 'Enter': show.next(); stop(); return;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': case 'p': case 'P': show.prev(); stop(); return;
      case 'Home': show.go(show.visible()[0]); stop(); return;
      case 'End': { const v = show.visible(); show.go(v[v.length - 1]); stop(); return; }
      case 'b': case 'B': case '.': case ';': setBlackLocal('black'); stop(); return;
      case 'w': case 'W': case ',': setBlackLocal('white'); stop(); return;
      case 'e': case 'E': show.clearInk(); post({ type: 'ink-clear', i: show.i }); stop(); return;
      case 'g': case 'G': case '-': toggleGrid(); stop(); return;
      case 'Escape': { const g = document.querySelector('.show-grid.on'); if (g) { g.classList.remove('on'); stop(); return; } if (tools.mode) { setTool(null); stop(); return; } A.endShow(); stop(); return; }
      case 'F1': A.cmd.shortcuts(true); stop(); return;
      case 'F5': stop(); return;
      default: break;
    }
  }
  /* ---------- mode présentateur ---------- */
  function setupPresenter() {
    const pr = document.getElementById('presenter');
    pr.style.setProperty('--ar', A.doc.size.w + '/' + A.doc.size.h);
    pr.innerHTML = '<div class="pr-top"><span class="tm" id="prTimer">0:00:00</span><button type="button" data-p="pause" title="Pause du chronomètre">' + O.icon('pause') + '</button><button type="button" data-p="reset" title="Remettre à zéro">' + O.icon('rotate-ccw') + '</button><span class="clk" id="prClock"></span><span style="flex:1"></span><span id="prAud" style="font-size:12.5px;color:#adb5bd"></span><button type="button" data-p="aud" title="Ouvrir ou rouvrir la fenêtre publique (à placer sur l\'écran du projecteur)">' + O.icon('monitor-up') + 'Fenêtre publique</button><button type="button" data-p="end">' + O.icon('x') + 'Terminer</button></div>' +
      '<div class="pr-cur" tabindex="0"><span class="lbl">Diapositive actuelle</span><div class="pr-host" style="position:absolute;inset:0"></div></div>' +
      '<div class="pr-side"><div class="pr-next"><span class="lbl">Suivante</span></div><div class="pr-notes" id="prNotes"></div></div>' +
      '<div class="pr-bot"><button type="button" data-p="prev">' + O.icon('chevron-left') + 'Précédente</button><span class="pos" id="prPos"></span><button type="button" data-p="next">Suivante' + O.icon('chevron-right') + '</button><span style="flex:1"></span><button type="button" data-b="pen" title="Stylo">' + O.icon('pen-line') + '</button><button type="button" data-b="hl" title="Surligneur">' + O.icon('highlighter') + '</button><button type="button" data-b="laser" title="Laser">' + O.icon('locate-fixed') + '</button><button type="button" data-b="erase" title="Effacer">' + O.icon('eraser') + '</button><button type="button" data-p="black" title="Écran noir (B)">' + O.icon('square') + 'Noir</button><button type="button" data-p="white" title="Écran blanc (W)">' + O.icon('square-dashed') + 'Blanc</button><button type="button" data-b="grid" title="Toutes les diapositives">' + O.icon('layout-grid') + '</button><button type="button" data-p="zm" title="Texte des notes plus petit">A−</button><button type="button" data-p="zp" title="Texte des notes plus grand">A+</button></div>';
    pr.classList.add('on');
    pr.onclick = (e) => {
      const b = e.target.closest('[data-p],[data-b]'); if (!b) return;
      if (b.dataset.b) { toolAction(b.dataset.b, b); return; }
      const k = b.dataset.p;
      if (k === 'next') show.next(); if (k === 'prev') show.prev(); if (k === 'end') A.endShow();
      if (k === 'black') setBlackLocal('black'); if (k === 'white') setBlackLocal('white');
      if (k === 'pause') { paused = !paused; if (paused) timerPause = Date.now(); else { timerStart += Date.now() - timerPause; } b.innerHTML = O.icon(paused ? 'play' : 'pause'); }
      if (k === 'reset') { timerStart = Date.now(); timerPause = Date.now(); }
      if (k === 'aud') openAudience();
      if (k === 'zp' || k === 'zm') { const n = document.getElementById('prNotes'); const v = parseFloat(getComputedStyle(n).fontSize) + (k === 'zp' ? 2 : -2); n.style.setProperty('--nfs', O.clamp(v, 10, 48) + 'px'); }
    };
    clearInterval(clockT);
    clockT = setInterval(() => {
      const el = document.getElementById('prTimer'); if (!el) return;
      const t = Math.floor(((paused ? timerPause : Date.now()) - timerStart) / 1000);
      el.textContent = Math.floor(t / 3600) + ':' + String(Math.floor(t / 60) % 60).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
      document.getElementById('prClock').textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const au = document.getElementById('prAud'); if (au) au.textContent = A.audienceWin && !A.audienceWin.closed ? 'Fenêtre publique ouverte' : 'Aucune fenêtre publique';
    }, 500);
  }
  function updatePresenter(st) {
    if (!A.presenterMode) return;
    const d = A.doc, s = d.slides[st.i];
    const pos = document.getElementById('prPos'); if (pos) pos.textContent = 'Diapositive ' + (st.i + 1) + ' sur ' + d.slides.length + (st.steps ? ' · animation ' + st.step + '/' + st.steps : '');
    const notes = document.getElementById('prNotes'); if (notes) notes.textContent = s ? O.RichText.textOf(s.notes || '') || '(Pas de notes pour cette diapositive)' : '';
    const nx = document.querySelector('#presenter .pr-next'); if (!nx) return;
    O.$$('.sl', nx).forEach((n) => n.remove());
    const v = show.visible(), j = v.find((x) => x > st.i);
    if (st.step < st.steps) { const n = P.renderSlide(d, s, { mode: 'thumb', index: st.i }); n.style.transform = 'scale(' + (nx.clientWidth / d.size.w) + ')'; nx.appendChild(n); nx.querySelector('.lbl').textContent = 'Suivante : animation ' + (st.step + 1); }
    else if (j != null) { const n = P.renderSlide(d, d.slides[j], { mode: 'thumb', index: j }); n.style.transform = 'scale(' + (nx.clientWidth / d.size.w) + ')'; nx.appendChild(n); nx.querySelector('.lbl').textContent = 'Suivante : ' + (j + 1); P.fitAll(n, d, d.slides[j]); }
    else nx.querySelector('.lbl').textContent = 'Fin du diaporama';
  }
  async function openAudience() {
    if (A.audienceWin && !A.audienceWin.closed) { A.audienceWin.focus(); return true; }
    const url = location.pathname + '?public=1';
    let feat = 'popup=yes,width=960,height=600';
    const w = window.open(url, 'magpres-public', feat);
    if (!w) { O.toast('La fenêtre publique a été bloquée : autorisez les fenêtres surgissantes', { bad: true }); return false; }
    A.audienceWin = w;
    // deuxième écran (API de gestion des fenêtres, Chrome / Edge)
    try {
      if (window.getScreenDetails) {
        const sd = await window.getScreenDetails();
        const other = sd.screens.find((s) => s !== sd.currentScreen);
        if (other) { w.moveTo(other.availLeft, other.availTop); w.resizeTo(other.availWidth, other.availHeight); }
      }
    } catch (e) { }
    return true;
  }
  A.openAudience = openAudience;
  A.cmd.presenter = function () {
    const narrow = O.narrow() || O.isAndroid;
    A.startShow(A.cur, { presenter: true }).then(() => { if (!narrow) openAudience(); });
  };
  /* ---------- fenêtre publique ---------- */
  A.startAudience = function () {
    document.body.innerHTML = '<div id="aud" style="position:fixed;inset:0;background:#000;cursor:none"><div class="aud-msg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:#ddd;font:600 18px system-ui;z-index:20;text-align:center;padding:20px">Fenêtre publique du diaporama<br><small style="font-weight:400;opacity:.8">Placez cette fenêtre sur l\'écran du projecteur, puis cliquez ici pour le plein écran.</small></div></div>';
    const host = document.getElementById('aud');
    let doc = null, sh = null;
    try { doc = window.opener && window.opener.PresApp && window.opener.PresApp.doc; } catch (e) { doc = null; }
    if (!doc) { host.querySelector('.aud-msg').innerHTML = 'Aucun diaporama en cours.<br><small>Lancez le mode présentateur depuis Présentation.</small>'; return; }
    // médias : les adresses blob: de la fenêtre principale restent valables (même origine)
    try { const op = window.opener.Pres; P.blobs = op.blobs; P.mediaUrl = op.mediaUrl; } catch (e) { }
    doc = JSON.parse(JSON.stringify(doc));
    const box = O.h('div', { style: { position: 'absolute', inset: '0' } }); host.appendChild(box);
    sh = new P.Show(box, doc, { follower: true });
    const c = new BroadcastChannel('magpres-show');
    c.onmessage = (m) => {
      const d = m.data; if (!d) return;
      if (d.type === 'state') sh.apply(d.st);
      if (d.type === 'ink') { sh.ink[d.i] = sh.ink[d.i] || []; sh.ink[d.i].push(d.st); if (d.i === sh.i) sh.redrawInk(); }
      if (d.type === 'ink-clear') { sh.ink[d.i] = []; sh.redrawInk(); }
      if (d.type === 'laser') sh.setLaser(d.on, d.p, d.c);
      if (d.type === 'end') { sh.destroy(); host.innerHTML = '<div style="color:#999;font:16px system-ui;display:flex;align-items:center;justify-content:center;height:100%">Diaporama terminé. Vous pouvez fermer cette fenêtre.</div>'; setTimeout(() => window.close(), 1500); }
    };
    c.postMessage({ type: 'hello' });
    host.addEventListener('click', () => { const m = host.querySelector('.aud-msg'); if (m) m.remove(); if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { }); });
    window.addEventListener('keydown', (e) => { if (e.key === 'F11' || e.key === 'f') { document.documentElement.requestFullscreen().catch(() => { }); return; } c.postMessage({ type: 'key', key: e.key }); e.preventDefault(); });
    window.addEventListener('beforeunload', () => c.postMessage({ type: 'closed' }));
    // le message devient un bandeau discret en bas, puis disparaît
    setTimeout(() => { const m = host.querySelector('.aud-msg'); if (m && sh.i >= 0) { Object.assign(m.style, { inset: 'auto 0 16px 0', background: 'rgba(0,0,0,.65)', padding: '10px', font: '600 14px system-ui', margin: '0 auto', width: 'max-content', maxWidth: '90%', borderRadius: '8px', transition: 'opacity .6s' }); setTimeout(() => { m.style.opacity = '0'; setTimeout(() => m.remove(), 700); }, 5000); } }, 600);
  };
  /* ---------- répétition du minutage ---------- */
  function rehearseTick(st) {
    if (!rehearse) return;
    if (st.i !== rehearse.i) { rehearse.times[rehearse.i] = (rehearse.times[rehearse.i] || 0) + (Date.now() - rehearse.at) / 1000; rehearse.i = st.i; rehearse.at = Date.now(); }
  }
  function finishRehearse() {
    const r = rehearse; rehearse = null;
    r.times[r.i] = (r.times[r.i] || 0) + (Date.now() - r.at) / 1000;
    const total = Object.values(r.times).reduce((a, b) => a + b, 0);
    O.confirm('Minutage', 'Durée totale : ' + Math.floor(total / 60) + ' min ' + Math.round(total % 60) + ' s. Enregistrer ces durées pour le défilement automatique ?', 'Enregistrer').then((ok) => {
      if (!ok) return;
      Object.keys(r.times).forEach((i) => { const s = A.doc.slides[+i]; if (s) s.advance = Object.assign({}, s.advance, { after: Math.max(1, Math.round(r.times[i])) }); });
      A.doc.settings.useTimings = true; A.change('Minutage enregistré');
    });
  }
  A.cmd.showFrom = (i) => A.startShow(i);
  A.cmd.rehearse = () => A.startShow(0, { rehearse: true });
  /** Aperçu d'une transition ou des animations dans l'éditeur */
  A.cmd.previewAnim = function (onlyId) {
    const s = A.doc.slides[A.cur]; const box = A.canvasEl;
    const n = P.renderSlide(A.doc, s, { mode: 'show', index: A.cur }); n.style.transform = 'scale(' + A.zoom + ')'; n.style.transformOrigin = '0 0'; n.style.position = 'absolute';
    box.innerHTML = ''; box.appendChild(n); P.fitAll(n, A.doc, s);
    const steps = P.animSteps(s);
    const one = onlyId ? s.anims.filter((a) => a.id === onlyId) : null;
    (async () => {
      if (one) { await P.animPlayStep(n, s, { items: one.map((a) => ({ a, t0: 0 })) }, A.doc); }
      else { P.animPrepare(n, s); for (const st of steps) await P.animPlayStep(n, s, st, A.doc); }
      setTimeout(() => A.renderCanvas(), 600);
    })();
  };
  A.cmd.previewTransition = function () {
    const s = A.doc.slides[A.cur]; const box = A.canvasEl;
    const prevI = Math.max(0, A.cur - 1);
    const old = A.cur > 0 ? P.renderSlide(A.doc, A.doc.slides[prevI], { mode: 'thumb', index: prevI }) : O.h('div', { cls: 'sl', style: { width: A.doc.size.w + 'px', height: A.doc.size.h + 'px', background: '#000' } });
    const n = P.renderSlide(A.doc, s, { mode: 'thumb', index: A.cur });
    [old, n].forEach((x) => { x.style.transform = 'scale(' + A.zoom + ')'; x.style.transformOrigin = '0 0'; x.style.position = 'absolute'; });
    box.innerHTML = ''; box.style.overflow = 'hidden'; box.appendChild(old); box.appendChild(n);
    const wrap = O.h('div', { style: { position: 'absolute', inset: 0 } }); void wrap;
    transition(old, n, s.transition, null, false).then(() => { box.style.overflow = ''; setTimeout(() => A.renderCanvas(), 300); });
  };
})();
