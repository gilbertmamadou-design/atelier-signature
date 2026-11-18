/* =====================================================================
   Majordome › Réagir à l'ambiance (option, désactivée par défaut)
   Quand Majordome est à l'écran et ne vous écoute pas, le niveau sonore de la pièce anime l'apparence :
   hochements de tête sur les temps forts de la musique, léger balancement selon le volume, sursaut (surprise)
   sur un bruit soudain ; la sphère pulse en rythme.
   Android : niveau mesuré par le téléphone (MajordomeBridge.ambientStart) ; PC : micro du navigateur (Web Audio).
   Rien n'est enregistré ni envoyé : seuls trois nombres (niveau, graves, aigus) sont calculés, puis oubliés.
   Arrêt automatique pendant l'écoute d'une commande, quand Majordome parle, quand la page est cachée, et sur
   Android quand l'écoute continue (mot de réveil) utilise déjà le micro.
   ===================================================================== */
(function () {
  'use strict';
  var MJ = window.Majordome; if (!MJ || !MJ._) return;
  var X = MJ._, S = X.S, B = X.B || window.MAGMajordome || null;
  var ANDROID = !!X.ANDROID && B && B.ambientStart;
  var on = false, stream = null, actx = null, an = null, timer = 0, lastBeat = 0, lastStartle = 0;
  var fast = 0, slow = 0.02, lf = 0, ls = 0.02, err = '';

  function want() { return !!S.ambiance && !document.hidden && !MJ.listening && !(X.ANDROID && S.wakeOn); }
  /* niveau → hochements (temps forts dans les graves), balancement, sursaut */
  function feed(v, lo, hi) {
    var av = MJ.avatar; if (!av) return;
    var st = av.get ? av.get() : 'idle';
    if (st === 'speak' || st === 'listen' || st === 'think') return;   // sa propre voix ou une commande : on ignore
    var now = Date.now(), prevFast = fast;
    fast += (v - fast) * 0.45; slow += (v - slow) * 0.03;
    lf += (lo - lf) * 0.5; ls += (lo - ls) * 0.04;
    var beat = lf > ls * 1.45 + 0.03 && lf > 0.07 && now - lastBeat > 280;
    if (beat) lastBeat = now;
    var startle = v > 0.55 && prevFast < 0.14 && now - lastStartle > 4000;
    if (startle) lastStartle = now;
    if (av.ambient) av.ambient(Math.min(1, slow * 2.2), beat, startle);
    else if (beat && av.pulse) av.pulse();
  }
  function startPc() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { err = 'micro indisponible'; return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
      if (!on) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s;
      actx = new (window.AudioContext || window.webkitAudioContext)();
      var src = actx.createMediaStreamSource(s); an = actx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      var td = new Float32Array(an.fftSize), fd = new Uint8Array(an.frequencyBinCount), hz = actx.sampleRate / an.fftSize;
      timer = setInterval(function () {
        an.getFloatTimeDomainData(td); an.getByteFrequencyData(fd);
        var e = 0, i; for (i = 0; i < td.length; i++) e += td[i] * td[i];
        var lo = 0, nl = 0, hi = 0, nh = 0;
        for (i = 1; i < fd.length; i++) { var f = i * hz; if (f < 220) { lo += fd[i]; nl++; } else if (f > 2000 && f < 8000) { hi += fd[i]; nh++; } }
        feed(Math.min(1, Math.sqrt(e / td.length) * 7), nl ? Math.min(1, lo / nl / 160) : 0, nh ? Math.min(1, hi / nh / 120) : 0);
      }, 50);
    }).catch(function (e) { err = e && e.name === 'NotAllowedError' ? 'micro refusé' : 'micro indisponible'; stop(); });
  }
  function start() {
    if (on) return; on = true; err = '';
    if (ANDROID) { try { if (!B.ambientStart()) { on = false; err = 'autorisez le micro'; } } catch (e) { on = false; } }
    else startPc();
  }
  function stop() {
    if (!on) return; on = false;
    if (ANDROID) { try { B.ambientStop(); } catch (e) { } }
    if (timer) clearInterval(timer); timer = 0;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null;
    if (actx) try { actx.close(); } catch (e) { } actx = null; an = null;
    if (MJ.avatar && MJ.avatar.ambient) MJ.avatar.ambient(0, false, false);
  }
  function refresh() { if (want()) start(); else stop(); }
  MJ.onAmbient = function (d) { if (d.err) { err = d.err; on = false; return; } if (on) feed(+d.v || 0, +d.lo || 0, +d.hi || 0); };
  MJ.ambiance = { refresh: refresh, state: function () { return { on: on, err: err }; } };
  document.addEventListener('visibilitychange', refresh);
  setInterval(refresh, 1000);   // suit l'écoute (micro libéré pendant une commande), l'écoute continue, l'option
  refresh();
})();
