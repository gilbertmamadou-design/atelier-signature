/* COPIE GÉNÉRÉE par pc/build-pc.py depuis applis/www-majordome/mj-visage3d.js : ne pas modifier ici. */
/* =====================================================================
   Majordome : visage 3D (three.js, WebGL), à la place de la sphère ou du visage dessiné.
   Modèles : avatars Microsoft Rocketbox (licence MIT) convertis en GLB (applis/visage3d, workflow « Visage 3D »),
   avec expressions ARKit (sourcils, paupières, regard, sourire…) et visèmes (formes de bouche des sons).
   MJFace3D.create(canvas, {pad, model, frame, expr, onLevel, onFail, onReady}) → même API que MJOrb / MJFace :
     state, get, level, speak, word, voice, pulse, mood, look, metrics, stop
   Animation : clignements, saccades du regard, respiration, mouvements de tête et de cou (os du squelette),
   bouche synchronisée sur le niveau réel de la voix Piper (ou sur les syllabes de la voix du système), forme de bouche
   selon la voyelle prononcée ; écoute, réflexion, erreur, veille ; humeurs (joie, clin d'œil, tristesse, surprise).
   Lumière : clé chaude en haut à gauche, contre-jour coloré selon l'état (écoute, réflexion, parole…), halo derrière.
   Économie : 30 images/s au plus, résolution limitée sur téléphone, arrêt quand la page est cachée.
   ===================================================================== */
(function (root) {
  'use strict';
  var COLORS = { idle: [70, 217, 194], listen: [96, 255, 160], think: [150, 128, 255], speak: [125, 200, 255], error: [255, 92, 115], sleep: [90, 110, 130] };
  var SHAPES = { A: { v: 'aa', o: 1.0 }, E: { v: 'e', o: 0.75 }, I: { v: 'i', o: 0.55 }, O: { v: 'o', o: 0.9 }, U: { v: 'u', o: 0.7 } };
  var LIB = null, libWait = null;
  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function vowels(t) { return root.MJFace && root.MJFace.vowels ? root.MJFace.vowels(t) : []; }
  function syllables(w) { return root.MJOrb && root.MJOrb.syllables ? root.MJOrb.syllables(w) : 1; }
  function loadLib(base) {
    if (LIB) return Promise.resolve(LIB);
    if (root.MJ3) { LIB = root.MJ3; return Promise.resolve(LIB); }
    if (libWait) return libWait;
    libWait = new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = base + 'three-mj.js';
      s.onload = function () { if (root.MJ3) { LIB = root.MJ3; ok(LIB); } else ko(new Error('three.js absent')); };
      s.onerror = function () { libWait = null; ko(new Error('three.js introuvable')); };
      document.head.appendChild(s);
    });
    return libWait;
  }
  /* nom d'expression normalisé : « AK_12_EyeBlinkLeft » → « eyeblinkleft », « AA_VI_10_aa » → « aa » */
  function normName(n) { return String(n).replace(/^.*\./, '').replace(/^(AA_VI_\d+_|AK_\d+_)/i, '').replace(/[^a-z]/gi, '').toLowerCase(); }

  function create(cv, opt) {
    opt = opt || {};
    var base = opt.base || '3d/';
    var look = { model: opt.model || 'Female_Adult_01', frame: opt.frame || 'buste', expr: opt.expr || 'normal', style: opt.style || 'naturel' };
    var U = null;   // uniformes partagés par les matériaux du modèle (hologramme, couleur de l'état, temps)
    var reduce = false;
    try { reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
    var small = Math.min(root.innerWidth || 800, root.innerHeight || 800) < 600 || /Android|Mobile/i.test(navigator.userAgent || '');
    var st = 'idle', col = COLORS.idle.slice(), t0 = performance.now(), raf = 0, tmo = 0, running = true, last = 0, lastDraw = 0;
    var mic = 0, micAt = 0, env = 0, envSlow = 0;
    var spk = 0, spkT = 0, spkText = '', spkRate = 1, words = 0, sylls = [], quietUntil = 0, sEnv = 0, burst = 0, vReal = 0, vRealAt = -1e9;
    var lvlS = 0, M = { level: 0, frames: 0, mouth: 0, loaded: false, error: '' };
    var vseq = [], vIdx = -1, vCur = 'A', armed = true;
    var A = { yaw: 0, pitch: 0, roll: 0, gx: 0, gy: 0, open: 1, brow: 0, worry: 0, furrow: 0, smile: 0.25, mouth: 0, pupil: 1, wink: 0, cons: 0 };
    var blinkAt = 0, blinkDur = 150, nextBlink = performance.now() + 1500, gazeT = { x: 0, y: 0 }, nextGaze = 0, shakeAt = -1e9, nodK = 0;
    var moodN = '', moodUntil = 0;
    var amb = 0, ambAt = 0, ambS = 0;
    var folX = 0, folY = 0, folAt = -1e9;   // votre position vue par la caméra (option « Me suivre du regard »)   // son de la pièce (option « Réagir à l'ambiance »)
    // three.js
    var T = null, renderer = null, scene = null, cam = null, model = null, morphs = {}, bones = {}, rest = {}, lights = {}, halo = null, headPos = null, W = 0, H = 0;

    function morph(name, v) { var l = morphs[name]; if (!l) return; for (var i = 0; i < l.length; i++) l[i][0].morphTargetInfluences[l[i][1]] = v; }
    function hasMorph(n) { return !!morphs[n]; }

    function setup(L) {
      T = L.THREE;
      renderer = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
      scene = new T.Scene();
      U = { uHolo: { value: 0 }, uHoloCol: { value: new T.Color(0x46d9c2) }, uTime: { value: 0 } };
      cam = new T.PerspectiveCamera(20, 1, 0.05, 100);
      lights.hemi = new T.HemisphereLight(0xf2f4f8, 0x4a4040, 1.05); scene.add(lights.hemi);
      lights.key = new T.DirectionalLight(0xfffaf4, 1.55); lights.key.position.set(-0.9, 1.3, 2.6); scene.add(lights.key);
      lights.fill = new T.DirectionalLight(0xf0f2ff, 0.95); lights.fill.position.set(1.4, 0.5, 1.8); scene.add(lights.fill);
      lights.rim = new T.DirectionalLight(0x46d9c2, 2.0); lights.rim.position.set(0.4, 1.2, -2.0); scene.add(lights.rim);
      // halo derrière la tête (dégradé radial, teinte de l'état)
      var hc = document.createElement('canvas'); hc.width = hc.height = 128;
      var g = hc.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      var ht = new T.CanvasTexture(hc); ht.colorSpace = T.SRGBColorSpace;
      halo = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: ht, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0x46d9c2 }));
      scene.add(halo);
      size();
    }
    function size() {
      if (!renderer) return;
      var b = cv.getBoundingClientRect(); W = Math.max(10, b.width); H = Math.max(10, b.height);
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, small ? 1.5 : 2));
      renderer.setSize(W, H, false);
      cam.aspect = W / H; frameCam();
    }
    var ro = root.ResizeObserver ? new ResizeObserver(function () { size(); }) : null;
    if (ro) ro.observe(cv);

    function findBone(re) { var f = null; model.traverse(function (o) { if (!f && o.isBone && re.test(o.name.replace(/[_\s]+/g, ' '))) f = o; }); return f; }
    function prepBone(k, b) {
      if (!b) return;
      bones[k] = b;
      var wq = new T.Quaternion(); b.getWorldQuaternion(wq);
      var inv = wq.clone().invert();
      rest[k] = { q: b.quaternion.clone(), ax: new T.Vector3(1, 0, 0).applyQuaternion(inv), ay: new T.Vector3(0, 1, 0).applyQuaternion(inv), az: new T.Vector3(0, 0, 1).applyQuaternion(inv) };
    }
    /* rotation d'un os autour des axes du monde (x : tangage, y : lacet, z : roulis), à partir de sa pose de repos */
    var _q = null, _q2 = null;
    function turn(k, rx, ry, rz) {
      var b = bones[k], r = rest[k]; if (!b) return;
      _q = _q || new T.Quaternion(); _q2 = _q2 || new T.Quaternion();
      b.quaternion.copy(r.q);
      if (ry) { _q.setFromAxisAngle(r.ay, ry); b.quaternion.multiply(_q); }
      if (rx) { _q2.setFromAxisAngle(r.ax, rx); b.quaternion.multiply(_q2); }
      if (rz) { _q.setFromAxisAngle(r.az, rz); b.quaternion.multiply(_q); }
    }
    function lowerArms() {
      // pose en T des modèles : bras ramenés le long du corps (sens choisi pour que la main descende)
      ['L', 'R'].forEach(function (sd) {
        var up = findBone(new RegExp('\\b' + sd + ' UpperArm$', 'i')), hand = findBone(new RegExp('\\b' + sd + ' Hand$', 'i'));
        if (!up || !hand) return;
        prepBone('arm' + sd, up);
        // angle qui amène la main sous l'épaule, un peu à l'extérieur du corps (les modèles sont en T ou en A)
        var best = 0, be = Infinity, p = new T.Vector3(), u = new T.Vector3(); up.getWorldPosition(u);
        var tx = u.x * 1.45;
        for (var a = -1.6; a <= 1.6; a += 0.04) { turn('arm' + sd, 0, 0, a); model.updateMatrixWorld(true); hand.getWorldPosition(p); var e = Math.abs(p.x - tx) + (p.y > u.y - 0.2 ? 10 : 0); if (e < be) { be = e; best = a; } }
        turn('arm' + sd, 0, 0, best); rest['arm' + sd].q.copy(up.quaternion);
        var fo = findBone(new RegExp('\\b' + sd + ' Forearm$', 'i'));
        if (fo) { prepBone('fore' + sd, fo); }
      });
      model.updateMatrixWorld(true);
    }
    function frameCam() {
      if (!headPos || !cam) return;
      var close = look.frame === 'proche', corps = look.frame === 'corps', hh = headPos.h;
      var tgt = headPos.p.clone(); tgt.y -= close ? hh * 0.05 : hh * 0.42;
      var fovR = cam.fov * Math.PI / 180, span = close ? hh * 1.55 : hh * 2.45, pad = opt.pad || 1;
      if (corps && headPos.box) { tgt.set(headPos.p.x, (headPos.box.min.y + headPos.p.y + hh * 0.6) / 2, headPos.p.z); span = (headPos.p.y + hh * 0.7 - headPos.box.min.y) * 1.04; }
      var dist = corps ? (span * pad / 2) / Math.tan(fovR / 2) : (span * pad / 2) / Math.tan(fovR / 2) / Math.min(1, cam.aspect);
      cam.position.set(tgt.x, tgt.y + hh * 0.08, tgt.z + dist);
      cam.lookAt(tgt);
      cam.updateProjectionMatrix();
      if (halo) { halo.position.set(headPos.p.x, headPos.p.y, headPos.p.z - hh * 0.8); halo.scale.setScalar(hh * (close ? 3.2 : 4.2)); }
    }
    /* Intérieur de la bouche assombri (dents, langue, palais) : les modèles n'ont pas d'occlusion, la bouche ouverte
       paraissait éclairée comme le visage. Sommets en retrait derrière les lèvres → attribut « aDark » (0..1). */
    function darkMouth(hh) {
      var S = hh / 0.22, done = 0;
      model.traverse(function (o) {
        if (!o.isMesh || !o.geometry.morphAttributes.position || !o.morphTargetDictionary) return;
        var mats = [].concat(o.material); if (!mats.some(function (m) { return /head/i.test(m.name); })) return;
        var ia = null; Object.keys(o.morphTargetDictionary).forEach(function (n) { if (normName(n) === 'aa' && !/SR_/.test(n)) ia = o.morphTargetDictionary[n]; });
        if (ia == null) return;
        var g = o.geometry, nrm = g.attributes.normal, pos = g.attributes.position, del = g.morphAttributes.position[ia], n = pos.count, v = new T.Vector3(), W2 = [], mx = 0, i;
        for (i = 0; i < n; i++) { v.fromBufferAttribute(pos, i); if (!o.isSkinnedMesh) v.applyMatrix4(o.matrixWorld); W2.push(v.clone()); /* maillage avec os : positions déjà dans l espace de liaison */ var dl = Math.hypot(del.getX(i), del.getY(i), del.getZ(i)); if (dl > mx) mx = dl; }
        var cx = headPos ? headPos.p.x : 0, lipZ = -Infinity, lipY = 0;
        for (i = 0; i < n; i++) { var dd = Math.hypot(del.getX(i), del.getY(i), del.getZ(i)); if (dd > mx * 0.35 && Math.abs(W2[i].x - cx) < 0.012 * S && W2[i].z > lipZ) { lipZ = W2[i].z; lipY = W2[i].y; } }
        if (!isFinite(lipZ)) return;
        var dark = new Float32Array(n);
        for (i = 0; i < n; i++) {
          var p = W2[i], behind = (lipZ - p.z) / S, ax = Math.abs(p.x - cx) / S, yr = (p.y - lipY) / S;
          // dans la cavité : derrière les lèvres, entre les commissures, au-dessus de la lèvre inférieure (plus bas seulement en profondeur)
          var e2 = Math.pow(ax / 0.022, 2) + Math.pow((yr - 0.006) / (behind > 0.014 ? 0.03 : 0.016), 2), nz = nrm ? nrm.getZ(i) : 0;
          if (behind > 0.007 && e2 < 1 && !(nz > 0.7 && behind < 0.014)) { dark[i] = 0.55 + clamp((behind - 0.007) / 0.01, 0, 1) * 0.35; done++; }
        }
        g.setAttribute('aDark', new T.BufferAttribute(dark, 1));
      });
      M.dark = done;
    }
    /* Modification des shaders de tous les matériaux du modèle :
       - intérieur de la bouche assombri (attribut aDark, voir darkMouth) ;
       - style « Hologramme » : couleur de l'état selon la luminosité, contour lumineux (effet Fresnel), lignes de balayage,
         bande qui défile, léger scintillement, transparence partielle. */
    var HOLO = [
      'if (uHolo > 0.5) {',
      '  if (diffuseColor.a < 0.6) discard;',
      '  float lum = dot(gl_FragColor.rgb, vec3(0.3, 0.55, 0.15));',
      '  float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);',
      '  float sl = 0.7 + 0.3 * step(0.5, fract(gl_FragCoord.y * 0.33 - uTime * 1.5));',
      '  float sw = smoothstep(0.965, 1.0, fract(gl_FragCoord.y / 650.0 - uTime * 0.22)) * 0.8;',
      '  float fl = 0.93 + 0.07 * sin(uTime * 37.0) * sin(uTime * 13.0);',
      '  gl_FragColor.rgb = (uHoloCol * (0.08 + lum * 0.95) * sl + uHoloCol * fr * 1.5 + uHoloCol * sw) * fl;',
      '  gl_FragColor.a = diffuseColor.a * clamp(0.55 + fr * 0.45 + sw, 0.0, 1.0);',
      '}'].join('\n');
    function patchMat(m) {
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uHolo = U.uHolo; sh.uniforms.uHoloCol = U.uHoloCol; sh.uniforms.uTime = U.uTime;
        sh.vertexShader = 'attribute float aDark;\nvarying float vDark;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDark = aDark;');
        sh.fragmentShader = 'varying float vDark;\nuniform float uHolo;\nuniform vec3 uHoloCol;\nuniform float uTime;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>',
          'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.42, 0.13, 0.14) * min(dot(gl_FragColor.rgb, vec3(0.3, 0.5, 0.2)), 1.0), clamp(vDark, 0.0, 1.0));\n#include <tonemapping_fragment>\n' + HOLO);
      };
      m.customProgramCacheKey = function () { return 'mj3d-1'; };
      m.needsUpdate = true;
    }
    function loadModel() {
      M.loaded = false;
      return new LIB.GLTFLoader().loadAsync((opt.urlFor ? opt.urlFor(look.model) : base + look.model + '.glb')).then(function (gl) {
        if (!running) return;
        if (model) { scene.remove(model); model.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(function (m) { for (var k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); }); }); }
        model = gl.scene; morphs = {}; bones = {}; rest = {};
        model.traverse(function (o) {
          if (o.isMesh) {
            o.frustumCulled = false;
            [].concat(o.material).forEach(function (m) {
              if (m.transparent || (m.map && /opacity|hair|lash/i.test(m.name + ' ' + (m.map.name || '')))) { m.transparent = false; m.alphaTest = 0.35; m.alphaToCoverage = true; m.depthWrite = true; m.side = T.DoubleSide; }
              if (m.normalMap) m.normalScale.set(0.65, 0.65);
              patchMat(m);
              if (/head|body/i.test(m.name)) { m.roughness = Math.max(m.roughness || 0, /head/i.test(m.name) ? 0.68 : 0.8); m.metalness = 0; if (m.color) m.color.setRGB(0.97, 0.95, 0.96); }   // peau plus mate, un peu moins orangée
            });
            if (o.morphTargetDictionary) Object.keys(o.morphTargetDictionary).forEach(function (n) { if (/^(.*\.)?SR_/i.test(n)) return; var k = normName(n); (morphs[k] = morphs[k] || []).push([o, o.morphTargetDictionary[n]]); });   // SR_ : formes du traqueur Vive, doublons
          }
        });
        scene.add(model);
        model.updateMatrixWorld(true);
        var head = findBone(/ Head$/i) || findBone(/head/i), neck = findBone(/ Neck$/i), spine = findBone(/ Spine2$/i) || findBone(/ Spine1$/i);
        prepBone('head', head); prepBone('neck', neck); prepBone('spine', spine);
        lowerArms();
        // taille de la tête : boîte des sommets proches de l'os de la tête
        var hp = new T.Vector3(); if (head) head.getWorldPosition(hp);
        var box = new T.Box3().setFromObject(model), tall = box.max.y - box.min.y;
        var hh = tall * 0.13;
        headPos = { p: hp.add(new T.Vector3(0, hh * 0.35, 0)), h: hh, box: box };
        darkMouth(hh);
        frameCam();
        M.loaded = true; M.error = '';
        if (opt.onReady) try { opt.onReady(Object.keys(morphs)); } catch (e) { }
        kick();
      });
    }

    function voiceTarget(now) {
      if (!spk) return 0;
      if (now - vRealAt < 160) return vReal;
      var v = 0, any = false, cls = null;
      for (var k = 0; k < sylls.length; k++) {
        var s = sylls[k], ph = (now - s.at) / s.dur;
        if (ph < 0) { any = true; continue; }
        if (ph > 1) continue;
        any = true;
        var a = s.amp * Math.pow(Math.sin(Math.PI * ph), 0.6);
        if (a > v) { v = a; cls = s.v; }
      }
      while (sylls.length && now - sylls[0].at > sylls[0].dur) sylls.shift();
      if (cls) vCur = cls;
      if (any) return v * 0.9;
      if (now < quietUntil) return 0;
      if (!words && now - spkT > 350) { var s2 = now - spkT; return 0.25 + 0.45 * Math.pow(Math.abs(Math.sin(s2 / 105)), 0.8); }
      return 0.05;
    }
    function exprK() { return look.expr === 'calme' ? 0.55 : look.expr === 'expressif' ? 1.45 : 1; }

    function frame(now) {
      raf = 0; tmo = 0;
      if (!running) return;
      var t = (now - t0) / 1000, dt = last ? clamp((now - last) / 1000, 0.001, 0.1) : 0.016; last = now;
      if (now - micAt > 260) mic *= Math.pow(0.02, dt);
      var aA = 1 - Math.exp(-dt / 0.035), aR = 1 - Math.exp(-dt / 0.22);
      env += (mic - env) * (mic > env ? aA : aR);
      envSlow += (env - envSlow) * (1 - Math.exp(-dt / 0.5));
      var vt = voiceTarget(now);
      sEnv += (vt - sEnv) * (vt > sEnv ? 1 - Math.exp(-dt / 0.03) : 1 - Math.exp(-dt / 0.07));
      burst *= Math.pow(0.02, dt);
      lvlS = clamp((st === 'listen' ? env : spk ? sEnv : 0) + burst, 0, 1.2);
      if (spk && now - vRealAt < 160) {
        if (armed && sEnv > 0.3) { armed = false; vIdx++; if (vseq.length) vCur = vseq[Math.min(vIdx, vseq.length - 1)]; nodK = Math.min(1, nodK + 0.5 * sEnv); }
        else if (!armed && sEnv < 0.16) { armed = true; A.cons = 1; }
      } else if (spk && sEnv > 0.5 && armed) { armed = false; nodK = Math.min(1, nodK + 0.3); } else if (sEnv < 0.2) armed = true;
      nodK *= Math.pow(0.05, dt); A.cons *= Math.pow(0.0005, dt);
      var c = COLORS[st] || COLORS.idle;
      for (var k = 0; k < 3; k++) col[k] = lerp(col[k], c[k], 1 - Math.exp(-dt / 0.25));
      var mood = now < moodUntil ? moodN : '', ek = exprK(), mv = reduce ? 0 : ek;
      var G = { yaw: 0, pitch: 0, roll: 0, open: 1, brow: 0, worry: 0, furrow: 0, smile: 0.25, pupil: 1 };
      if (st === 'idle') { G.yaw = mv * (0.07 * Math.sin(t * 0.31) + 0.03 * Math.sin(t * 0.83)); G.pitch = mv * 0.03 * Math.sin(t * 0.47); G.roll = mv * 0.025 * Math.sin(t * 0.23); }
      if (performance.now() - ambAt > 600) amb = 0;
      ambS += (amb - ambS) * (1 - Math.exp(-dt / 0.4));
      if (st === 'idle' && (ambS > 0.02 || nodK > 0.02)) { G.pitch += mv * nodK * 0.07; G.roll += mv * Math.min(1, ambS * 1.6) * 0.06 * Math.sin(t * 2.3); G.yaw += mv * Math.min(1, ambS * 1.6) * 0.05 * Math.sin(t * 1.15); }   // en rythme avec la pièce
      else if (st === 'listen') { G.roll = mv * 0.08; G.pitch = mv * -0.03; G.yaw = mv * 0.02 * Math.sin(t * 0.6); G.open = 1.1; G.brow = (0.45 + env * 0.4) * ek; G.smile = 0.35; }
      else if (st === 'think') { G.yaw = mv * (0.14 + 0.03 * Math.sin(t * 0.9)); G.roll = mv * -0.05; G.pitch = mv * -0.06; G.furrow = 0.6 * ek; G.smile = 0.0; G.open = 0.9; }
      else if (st === 'speak') { G.yaw = mv * (0.05 * Math.sin(t * 0.7) + 0.02 * Math.sin(t * 1.9)); G.pitch = mv * (0.02 * Math.sin(t * 1.3) + nodK * 0.06); G.roll = mv * 0.03 * Math.sin(t * 0.5); G.brow = (0.1 + nodK * 0.5) * ek; G.smile = 0.2; }
      else if (st === 'error') { var ea = (now - shakeAt) / 1000; G.yaw = mv * (ea < 0.9 ? 0.1 * Math.sin(ea * 22) * (1 - ea / 0.9) : 0); G.worry = 0.8; G.smile = -0.5; G.pitch = mv * 0.05; }
      else if (st === 'sleep') { G.pitch = (reduce ? 0 : 1) * 0.16; G.roll = (reduce ? 0 : 1) * 0.08; G.open = 0; G.smile = 0.1; }
      if (mood === 'joie') { G.smile = 1; G.brow = Math.max(G.brow, 0.4); G.open = Math.min(G.open, 0.85); }
      else if (mood === 'clin') { G.smile = 0.8; }
      else if (mood === 'triste') { G.smile = -0.6; G.worry = 1; G.pitch += mv * 0.06; }
      else if (mood === 'surprise') { G.brow = 1; G.open = 1.25; G.smile = 0; }
      if (now > nextGaze) {
        var gr = Math.min(1.3, ek);
        if (st === 'think') { gazeT = { x: 0.55 + Math.random() * 0.35, y: 0.65 + Math.random() * 0.25 }; nextGaze = now + 900 + Math.random() * 1400; }
        else if (st === 'listen') { gazeT = { x: (Math.random() - 0.5) * 0.12, y: (Math.random() - 0.5) * 0.08 }; nextGaze = now + 700 + Math.random() * 900; }
        else if (st === 'speak') { gazeT = Math.random() < 0.7 ? { x: (Math.random() - 0.5) * 0.15, y: 0 } : { x: (Math.random() - 0.5) * 0.9 * gr, y: (Math.random() - 0.4) * 0.5 * gr }; nextGaze = now + 900 + Math.random() * 1800; }
        else if (st === 'error' || mood === 'triste') { gazeT = { x: -0.2, y: -0.55 }; nextGaze = now + 1500; }
        else if (st === 'sleep') { gazeT = { x: 0, y: -0.4 }; nextGaze = now + 3000; }
        else { gazeT = Math.random() < 0.55 ? { x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.1 } : { x: (Math.random() - 0.5) * 1.1 * gr, y: (Math.random() - 0.5) * 0.6 * gr }; nextGaze = now + 1300 + Math.random() * 2800; }
        if (reduce) gazeT = { x: 0, y: 0 };
      }
      var suit = now - folAt < 2000 && st !== 'think' && st !== 'sleep' && mood !== 'triste';
      if (suit) { gazeT = { x: -folX * 0.9, y: folY * 0.5 }; nextGaze = now + 400; G.yaw += mv * folX * 0.13; G.pitch += mv * -folY * 0.06; }   // vous suivre des yeux, la tête un peu tournée vers vous
      var gk = 1 - Math.exp(-dt / 0.06);
      A.gx += (gazeT.x * 0.6 - A.gx) * gk; A.gy += (gazeT.y * 0.6 - A.gy) * gk;   // amplitude réduite : moins de regards « fixes » ou exorbités
      if (now > nextBlink && st !== 'sleep') { blinkAt = now; blinkDur = 130 + Math.random() * 60; nextBlink = now + (Math.random() < 0.15 ? 260 : (st === 'think' ? 1800 : 2400) + Math.random() * 3800); }
      var bp = (now - blinkAt) / blinkDur, blink = bp >= 0 && bp < 1 ? Math.sin(Math.PI * bp) : 0;
      var sk = 1 - Math.exp(-dt / 0.6), fk = 1 - Math.exp(-dt / 0.16);
      A.yaw += (G.yaw - A.yaw) * (st === 'error' ? 1 - Math.exp(-dt / 0.04) : sk); A.pitch += (G.pitch - A.pitch) * (1 - Math.exp(-dt / 0.15)); A.roll += (G.roll - A.roll) * sk;
      A.open += (G.open - A.open) * fk; A.brow += (G.brow - A.brow) * fk; A.worry += (G.worry - A.worry) * fk; A.furrow += (G.furrow - A.furrow) * fk;
      A.smile += (G.smile - A.smile) * (1 - Math.exp(-dt / 0.2));
      A.wink += ((mood === 'clin' ? 1 : 0) - A.wink) * (1 - Math.exp(-dt / 0.06));
      var shp = SHAPES[vCur] || SHAPES.A, mo = spk ? clamp(sEnv * 1.2, 0, 1) * shp.o : 0;
      if (mood === 'surprise' && !spk) mo = 0.35;
      A.mouth += (mo - A.mouth) * (1 - Math.exp(-dt / (mo > A.mouth ? 0.05 : 0.09)));
      M.level = lvlS; M.mouth = A.mouth;
      if (opt.onLevel) try { opt.onLevel(lvlS * (reduce ? 0.35 : 1)); } catch (e) { }
      // 30 images/s au plus
      if (model && now - lastDraw >= 31) { lastDraw = now; apply(t, blink, mood); renderer.render(scene, cam); M.frames++; }
      schedule();
    }

    var VIS = ['aa', 'e', 'i', 'o', 'u', 'pp', 'ff', 'ss', 'sil', 'dd', 'kk', 'ch', 'th', 'nn', 'rr'];
    function apply(t, blink, mood) {
      var eo = clamp(A.open * (1 - blink), 0, 1.15) * 0.9;   // paupières légèrement baissées : regard plus doux
      var bl = 1 - Math.min(1, eo), wide = Math.max(0, eo - 1) * 3;
      var squint = 0.12 + Math.max(0, A.smile - 0.3) * 0.55;
      morph('eyeblinkleft', clamp(bl + squint * 0.3, 0, 1)); morph('eyeblinkright', clamp(bl + squint * 0.3 + A.wink, 0, 1));
      wide *= 0.45; morph('eyewideleft', wide); morph('eyewideright', wide);
      morph('eyesquintleft', squint); morph('eyesquintright', squint);
      var gx = A.gx, gy = A.gy;
      morph('eyelookoutleft', Math.max(0, -gx)); morph('eyelookinleft', Math.max(0, gx));
      morph('eyelookinright', Math.max(0, -gx)); morph('eyelookoutright', Math.max(0, gx));
      morph('eyelookupleft', Math.max(0, gy)); morph('eyelookupright', Math.max(0, gy));
      morph('eyelookdownleft', Math.max(0, -gy)); morph('eyelookdownright', Math.max(0, -gy));
      morph('browinnerup', clamp(A.brow * 0.6 + A.worry * 0.9, 0, 1));
      morph('browouterupleft', clamp(A.brow * 0.7, 0, 1)); morph('browouterupright', clamp(A.brow * 0.7, 0, 1));
      morph('browdownleft', clamp(A.furrow, 0, 1)); morph('browdownright', clamp(A.furrow, 0, 1));
      var sm = Math.max(0, A.smile), fr = Math.max(0, -A.smile);
      morph('mouthsmileleft', sm * 0.75); morph('mouthsmileright', sm * 0.75);
      morph('cheeksquintleft', sm * 0.45); morph('cheeksquintright', sm * 0.45);
      morph('mouthfrownleft', fr); morph('mouthfrownright', fr);
      // bouche : visème de la voyelle × ouverture, petites fermetures entre syllabes
      var m = A.mouth, cur = (SHAPES[vCur] || SHAPES.A).v;
      for (var i = 0; i < VIS.length; i++) morph(VIS[i], 0);
      if (hasMorph(cur)) { morph(cur, clamp(m * 0.55, 0, 1)); morph('jawopen', clamp(m * 0.08, 0, 1)); }
      else morph('jawopen', clamp(m * 0.7, 0, 1));
      if (spk && A.cons > 0.05) morph('pp', clamp(A.cons * 0.3 * (1 - m), 0, 1));
      // tête, cou, respiration
      var br = reduce ? 0 : Math.sin(t * 1.6) * 0.012;
      turn('neck', A.pitch * 0.25, A.yaw * 0.25, A.roll * 0.25);
      turn('head', A.pitch * 0.45, A.yaw * 0.45, A.roll * 0.45);
      if (bones.spine) turn('spine', br, 0, 0);
      // lumières : contre-jour et halo à la couleur de l'état
      var cc = new T.Color(col[0] / 255, col[1] / 255, col[2] / 255);
      lights.rim.color.copy(cc); lights.rim.intensity = (st === 'sleep' ? 0.6 : 1.2) + lvlS * 1.4;
      halo.material.color.copy(cc).multiplyScalar(st === 'sleep' ? 0.25 : 0.45 + lvlS * 0.5);
      halo.lookAt(cam.position);
      U.uHolo.value = look.style === 'holo' ? 1 : 0; U.uTime.value = t;
      U.uHoloCol.value.setRGB(Math.min(1, col[0] / 255 * 1.1), Math.min(1, col[1] / 255 * 1.1), Math.min(1, col[2] / 255 * 1.1));
    }

    function active() { return st === 'listen' || spk || burst > 0.01 || lvlS > 0.01 || A.mouth > 0.01; }
    function schedule() {
      if (raf || tmo || !running || document.hidden) return;
      if (!reduce) { raf = requestAnimationFrame(frame); return; }
      tmo = setTimeout(function () { frame(performance.now()); }, active() ? 120 : 600);
    }
    function kick() { schedule(); }
    function onVis() { if (!document.hidden) { last = 0; kick(); } else { if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; } }
    document.addEventListener('visibilitychange', onVis);

    var api = {
      state: function (s) { if (!COLORS[s]) s = 'idle'; if (s === 'error' && st !== 'error') shakeAt = performance.now(); if (s !== st) nextGaze = 0; st = s; if (s !== 'listen') mic = 0; kick(); },
      get: function () { return st; },
      level: function (v) { v = clamp(+v || 0, 0, 1); mic = Math.pow(v, 0.75); micAt = performance.now(); kick(); },
      speak: function (on, text, rate) {
        if (on && !spk) { spkT = performance.now(); words = 0; sylls = []; quietUntil = 0; vIdx = -1; armed = true; }
        if (on && text != null) { spkText = String(text); spkRate = clamp(+rate || 1, 0.4, 3); vseq = vowels(spkText); vIdx = -1; }
        spk = on ? 1 : 0; if (on) api.state('speak'); else { sylls = []; }
        kick();
      },
      word: function (text, s, e) {
        if (text != null) spkText = String(text);
        var tx = spkText, now = performance.now();
        s = Math.max(0, +s || 0);
        if (!(e > s)) { var mm = /^[^\s.,;:!?…]+/.exec(tx.slice(s)); e = s + (mm ? mm[0].length : 1); }
        var w = tx.slice(s, e), vs = vowels(w), n = Math.max(1, Math.min(vs.length || 1, syllables(w) || 1)), per = clamp(175 / spkRate, 90, 360);
        if (sylls.length) { var lastS = sylls[sylls.length - 1]; now = Math.max(now, lastS.at + lastS.dur * 0.8); }
        for (var k = 0; k < n; k++) sylls.push({ at: now + k * per, dur: per * 0.95, amp: k === 0 ? 1 : 0.8, v: vs[k] || 'E' });
        var after = tx.slice(e, e + 3);
        if (/^\s*[.!?…]/.test(after)) quietUntil = now + n * per + 320; else if (/^\s*[,;:]/.test(after)) quietUntil = now + n * per + 170;
        words++; kick();
      },
      pulse: function () { burst = Math.min(0.45, burst + 0.24); kick(); },
      voice: function (v) { vReal = clamp(+v || 0, 0, 1); vRealAt = performance.now(); if (!spk) api.speak(true); kick(); },
      follow: function (x, y) { folX = +x || 0; folY = +y || 0; folAt = performance.now(); kick(); },
      ambient: function (v, beat, startle) { amb = Math.max(0, Math.min(1, +v || 0)); ambAt = performance.now(); if (beat) nodK = Math.min(1, nodK + 0.55); if (startle) { moodN = 'surprise'; moodUntil = performance.now() + 900; nextGaze = 0; } kick(); },
      mood: function (n, ms) { moodN = n || ''; moodUntil = performance.now() + (ms || 2600); kick(); },
      look: function (o) {
        if (!o) return;
        var mdl = o.model && o.model !== look.model;
        ['model', 'frame', 'expr', 'style'].forEach(function (k) { if (o[k]) look[k] = o[k]; });
        if (mdl && LIB) loadModel().catch(fail); else frameCam();
        kick();
      },
      metrics: function () { return { level: M.level, mouth: M.mouth, frames: M.frames, state: st, loaded: M.loaded, error: M.error, dark: M.dark, morphs: Object.keys(morphs).length, running: !!(raf || tmo) }; },
      morphNames: function () { return Object.keys(morphs); },
      _model: function () { return model; }, _renderer: function () { return renderer; },
      stop: function () {
        running = false; if (raf) cancelAnimationFrame(raf); if (tmo) clearTimeout(tmo); raf = tmo = 0; if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
        try { if (renderer) { renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); } } catch (e) { }
      },
      reduced: reduce, kind: 'visage3d'
    };
    function fail(e) { M.error = String(e && e.message || e); console.warn('Visage 3D :', e); if (opt.onFail) try { opt.onFail(e); } catch (x) { } }
    loadLib(opt.libBase || '3d/').then(function (L) { if (!running) return; setup(L); return loadModel(); }).catch(fail);
    frame(performance.now());
    return api;
  }
  // modèles proposés (Microsoft Rocketbox, licence MIT) : nom affiché, fichier
  var MODELES = [['Female_Adult_08', 'Léa (brune, cheveux longs)'], ['Female_Adult_15', 'Chloé (châtain, cheveux longs)'], ['Female_Adult_05', 'Inès (brune, carré)'],
    ['Female_Party_02', 'Maya (cheveux bouclés)'], ['Female_Party_01', 'Jade (blonde bouclée)'], ['Female_Adult_03', 'Mei (brune, mi-longs)']];
  root.MJFace3D = { create: create, MODELES: MODELES, DEFAUT: 'Female_Adult_08' };
})(window);
