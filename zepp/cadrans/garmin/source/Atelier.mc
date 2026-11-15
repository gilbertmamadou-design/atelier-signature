// Cadran Garmin générique de l'« Atelier de cadrans » (Fenix 6X Pro, Fenix 6S).
// Le dessin fixe (fond, motif, anneau, icônes, étiquettes, cases) est l'image « Fond » ; tout ce qui bouge est décrit
// par Spec.ops() (fabriqué par outils/fabriquer-garmin.mjs) et dessiné ici : heure, date, nombres, barres, jauges,
// icône météo, aiguilles (polygones tournés). Les polices viennent des mêmes fichiers que la T-Rex 3.
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.ActivityMonitor;
import Toybox.Activity;
import Toybox.Math;

class AtelierApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }
    function getInitialView() { return [new AtelierVue()]; }
}

class AtelierVue extends WatchUi.WatchFace {
    var fond = null;
    var polices = [];
    var icones = {};
    var ops = [];
    var eveil = true;

    function initialize() {
        WatchFace.initialize();
        ops = Spec.ops();
    }

    function onLayout(dc) {
        fond = WatchUi.loadResource(Rez.Drawables.Fond);
        var ids = Spec.polices();
        polices = new [ids.size()];
        for (var i = 0; i < ids.size(); i++) { polices[i] = WatchUi.loadResource(ids[i]); }
    }

    function onExitSleep() { eveil = true; WatchUi.requestUpdate(); }
    function onEnterSleep() { eveil = false; WatchUi.requestUpdate(); }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        if (fond != null) { dc.drawBitmap(0, 0, fond); }
        var D = new Donnees();
        for (var i = 0; i < ops.size(); i++) {
            var o = ops[i];
            var k = o["k"];
            if (k.equals("h")) { heure(dc, o); }
            else if (k.equals("n")) { nombre(dc, o, D); }
            else if (k.equals("d")) { date(dc, o); }
            else if (k.equals("b")) { barre(dc, o, D); }
            else if (k.equals("a")) { arc(dc, o, D); }
            else if (k.equals("m")) { dessineMeteo(dc, o, D); }
            else if (k.equals("p")) { aiguilles(dc, o); }
        }
    }

    // texte avec effet : 1 relief, 2 ombre, 3 biseau, 4 contour (ou lueur), 5 creux
    function texte(dc, x, y, f, s, just, o, c) {
        var fx = o["fx"];
        var n = o["n"];
        var T = Graphics.COLOR_TRANSPARENT;
        if (fx == 1) {
            dc.setColor(o["c2"], T);
            for (var i = n; i >= 1; i--) { dc.drawText(x + i, y + i, f, s, just); }
        } else if (fx == 2) {
            dc.setColor(0x000000, T);
            dc.drawText(x + n, y + n, f, s, just);
        } else if (fx == 3) {
            dc.setColor(o["c3"], T);
            dc.drawText(x - 1, y - 1, f, s, just);
            dc.setColor(o["c2"], T);
            dc.drawText(x + 1, y + 1, f, s, just);
        } else if (fx == 4 || fx == 5) {
            if (fx == 5) { dc.setColor(c, T); } else { dc.setColor(o["c2"], T); }
            for (var a = -n; a <= n; a += n) {
                for (var b = -n; b <= n; b += n) {
                    if (a != 0 || b != 0) { dc.drawText(x + a, y + b, f, s, just); }
                }
            }
            if (fx == 5) { c = o["c2"]; }
        }
        dc.setColor(c, T);
        dc.drawText(x, y, f, s, just);
    }

    function heure(dc, o) {
        var t = System.getClockTime();
        var h = t.hour;
        if (!System.getDeviceSettings().is24Hour) {
            h = h % 12;
            if (h == 0) { h = 12; }
        }
        var s = h.format("%02d") + ":" + t.min.format("%02d");
        var xs = o["xs"];
        var f = polices[o["f"]];
        for (var i = 0; i < 5; i++) {
            var c = o["c"];
            if (i == 2) { c = o["cdp"]; }
            texte(dc, xs[i], o["y"], f, s.substring(i, i + 1), Graphics.TEXT_JUSTIFY_CENTER, o, c);
        }
        if (eveil && o.hasKey("sxs")) {
            var ss = t.sec.format("%02d");
            var sf = polices[o["sf"]];
            var sx = o["sxs"];
            dc.setColor(o["sc"], Graphics.COLOR_TRANSPARENT);
            dc.drawText(sx[0], o["sy"], sf, ss.substring(0, 1), Graphics.TEXT_JUSTIFY_CENTER);
            dc.drawText(sx[1], o["sy"], sf, ss.substring(1, 2), Graphics.TEXT_JUSTIFY_CENTER);
        }
    }

    function nombre(dc, o, D) {
        var v = D.valeur(o["t"]);
        var s = "--";
        if (v != null) { s = v; }
        var f = polices[o["f"]];
        var u = o["u"];
        var fu = o["fu"];
        var wv = dc.getTextWidthInPixels(s, f);
        var wu = 0;
        if (v != null && u.length() > 0) {
            if (fu >= 0) { wu = dc.getTextWidthInPixels(u, polices[fu]); } else { wu = dc.getTextWidthInPixels(u, f); }
        }
        var x = o["x"];
        var al = o["al"];
        if (al == 1) { x = x + (o["w"] - wv - wu) / 2; } else if (al == 2) { x = x + o["w"] - wv - wu; }
        texte(dc, x, o["y"], f, s, Graphics.TEXT_JUSTIFY_LEFT, o, o["c"]);
        if (wu > 0) {
            if (fu >= 0) {
                dc.setColor(o["cu"], Graphics.COLOR_TRANSPARENT);
                dc.drawText(x + wv, o["y"], polices[fu], u, Graphics.TEXT_JUSTIFY_LEFT);
            } else {
                texte(dc, x + wv, o["y"], f, u, Graphics.TEXT_JUSTIFY_LEFT, o, o["c"]);
            }
        }
    }

    function date(dc, o) {
        var g = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        var js = (g.day_of_week + 5) % 7;
        var parts = o["parts"];
        for (var i = 0; i < parts.size(); i++) {
            var p = parts[i];
            var t = p["t"];
            var idx = g.month - 1;
            if (t.equals("s")) { idx = js; } else if (t.equals("j")) { idx = g.day - 1; }
            var l = p["l"];
            if (idx < 0 || idx >= l.size()) { continue; }
            var x = p["x"];
            var al = p["al"];
            var just = Graphics.TEXT_JUSTIFY_LEFT;
            if (al == 1) { x = x + p["w"] / 2; just = Graphics.TEXT_JUSTIFY_CENTER; }
            else if (al == 2) { x = x + p["w"]; just = Graphics.TEXT_JUSTIFY_RIGHT; }
            texte(dc, x, o["y"], polices[p["f"]], l[idx], just, p, p["c"]);
        }
    }

    function barre(dc, o, D) {
        var f = D.fraction(o["t"]);
        if (f > 1.0) { f = 1.0; }
        if (f <= 0.0) { return; }
        var w = (o["w"] * f).toNumber();
        if (w < o["h"]) { w = o["h"]; }
        dc.setColor(o["c"], Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(o["x"], o["y"], w, o["h"], o["h"] / 2);
    }

    function arc(dc, o, D) {
        dc.setPenWidth(o["pw"]);
        if (o.hasKey("cb")) {
            dc.setColor(o["cb"], Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(o["cx"], o["cy"], o["r"]);
        }
        var f = D.fraction(o["t"]);
        if (f > 1.0) { f = 1.0; }
        if (f > 0.005) {
            dc.setColor(o["c"], Graphics.COLOR_TRANSPARENT);
            if (f >= 0.999 && o["span"] >= 360) {
                dc.drawCircle(o["cx"], o["cy"], o["r"]);
            } else {
                var s = o["s"];
                var e = (s - o["span"] * f).toNumber();
                while (e < 0) { e = e + 360; }
                dc.drawArc(o["cx"], o["cy"], o["r"], Graphics.ARC_CLOCKWISE, s, e);
            }
        }
        dc.setPenWidth(1);
    }

    function dessineMeteo(dc, o, D) {
        var c = D.condition();
        var g = 11;
        var m = Spec.meteo();
        if (c != null && c >= 0 && c < m.size()) { g = m[c]; }
        var id = o["ic"][g];
        if (!icones.hasKey(id)) {
            icones = {};
            icones.put(id, WatchUi.loadResource(Spec.icones()[id]));
        }
        dc.drawBitmap(o["x"], o["y"], icones[id]);
    }

    function aiguilles(dc, o) {
        var t = System.getClockTime();
        var cx = o["cx"];
        var cy = o["cy"];
        var ah = ((t.hour % 12) + t.min / 60.0) / 12.0 * Math.PI * 2;
        var am = (t.min + t.sec / 60.0) / 60.0 * Math.PI * 2;
        forme(dc, cx, cy, ah, o["h"]);
        forme(dc, cx, cy, am, o["m"]);
        if (eveil && o["s"] != null) { forme(dc, cx, cy, t.sec / 60.0 * Math.PI * 2, o["s"]); }
        forme(dc, cx, cy, 0.0, o["cap"]);
    }

    function forme(dc, cx, cy, ang, l) {
        var co = Math.cos(ang);
        var si = Math.sin(ang);
        for (var i = 0; i < l.size(); i++) {
            var e = l[i];
            dc.setColor(e["c"], Graphics.COLOR_TRANSPARENT);
            if (e.hasKey("r")) {
                var r = e["r"];
                dc.fillCircle(cx + r[0] * co - r[1] * si, cy + r[0] * si + r[1] * co, r[2]);
            } else {
                var p = e["p"];
                var n = p.size() / 2;
                var pts = new [n];
                for (var j = 0; j < n; j++) {
                    var x = p[2 * j];
                    var y = p[2 * j + 1];
                    pts[j] = [cx + x * co - y * si, cy + x * si + y * co];
                }
                if (e["l"] == 1) {
                    dc.setPenWidth(e["w"]);
                    for (var j2 = 0; j2 < n; j2++) {
                        var a = pts[j2];
                        var b = pts[(j2 + 1) % n];
                        dc.drawLine(a[0], a[1], b[0], b[1]);
                    }
                    dc.setPenWidth(1);
                } else {
                    dc.fillPolygon(pts);
                }
            }
        }
    }
}

// valeurs de la montre (lues une fois par dessin)
class Donnees {
    var cache = {};
    var cond = null;
    var condLue = false;

    function initialize() {}

    function valeur(t) {
        if (cache.hasKey(t)) { return cache[t]; }
        var v = null;
        try { v = lire(t); } catch (ex) { v = null; }
        cache.put(t, v);
        return v;
    }

    function lire(t) {
        var a = null;
        var i = null;
        if (t.equals("STEP")) { a = ActivityMonitor.getInfo(); if (a != null && a.steps != null) { return a.steps.toString(); } return null; }
        if (t.equals("CAL")) { a = ActivityMonitor.getInfo(); if (a != null && a.calories != null) { return a.calories.toString(); } return null; }
        if (t.equals("DISTANCE")) { a = ActivityMonitor.getInfo(); if (a != null && a.distance != null) { return (a.distance / 100000.0).format("%.1f"); } return null; }
        if (t.equals("BATTERY")) { return System.getSystemStats().battery.toNumber().toString(); }
        if (t.equals("HEART")) { return coeur(); }
        if (t.equals("ALTITUDE")) { i = Activity.getActivityInfo(); if (i != null && i.altitude != null) { return i.altitude.toNumber().toString(); } return null; }
        if (t.equals("ALTIMETER")) { i = Activity.getActivityInfo(); if (i != null && i.ambientPressure != null) { return (i.ambientPressure / 100.0).toNumber().toString(); } return null; }
        if (t.equals("STRESS")) { return stress(); }
        return meteo(t);
    }

    function coeur() {
        var i = Activity.getActivityInfo();
        if (i != null && i.currentHeartRate != null) { return i.currentHeartRate.toString(); }
        if (ActivityMonitor has :getHeartRateHistory) {
            var it = ActivityMonitor.getHeartRateHistory(1, true);
            if (it != null) {
                var s = it.next();
                if (s != null && s.heartRate != null && s.heartRate != ActivityMonitor.INVALID_HR_SAMPLE) { return s.heartRate.toString(); }
            }
        }
        return null;
    }

    function stress() {
        if ((Toybox has :SensorHistory) && (Toybox.SensorHistory has :getStressHistory)) {
            var it = Toybox.SensorHistory.getStressHistory({:period => 1});
            if (it != null) {
                var s = it.next();
                if (s != null && s.data != null) { return s.data.toNumber().toString(); }
            }
        }
        return null;
    }

    function conditions() {
        if (Toybox has :Weather) { return Toybox.Weather.getCurrentConditions(); }
        return null;
    }

    function condition() {
        if (!condLue) {
            condLue = true;
            try {
                var w = conditions();
                if (w != null && w.condition != null) { cond = w.condition; }
            } catch (ex) { cond = null; }
        }
        return cond;
    }

    function meteo(t) {
        var w = conditions();
        if (w == null) { return null; }
        if (t.equals("WEATHER_CURRENT")) { if (w.temperature != null) { return w.temperature.toNumber().toString(); } return null; }
        if (t.equals("WEATHER_LOW")) { if (w.lowTemperature != null) { return w.lowTemperature.toNumber().toString(); } return null; }
        if (t.equals("WEATHER_HIGH")) { if (w.highTemperature != null) { return w.highTemperature.toNumber().toString(); } return null; }
        if (t.equals("HUMIDITY")) { if (w.relativeHumidity != null) { return w.relativeHumidity.toNumber().toString(); } return null; }
        if (t.equals("WIND")) { if (w.windSpeed != null) { return (w.windSpeed * 3.6).toNumber().toString(); } return null; }
        if ((t.equals("SUN_RISE") || t.equals("SUN_SET")) && (Toybox.Weather has :getSunrise)) {
            var pos = w.observationLocationPosition;
            if (pos == null) { return null; }
            var m = null;
            if (t.equals("SUN_RISE")) { m = Toybox.Weather.getSunrise(pos, Time.now()); } else { m = Toybox.Weather.getSunset(pos, Time.now()); }
            if (m == null) { return null; }
            var g = Gregorian.info(m, Time.FORMAT_SHORT);
            return g.hour.format("%02d") + ":" + g.min.format("%02d");
        }
        return null;
    }

    function fraction(t) {
        try {
            if (t.equals("STEP")) {
                var a = ActivityMonitor.getInfo();
                if (a != null && a.steps != null && a.stepGoal != null && a.stepGoal > 0) { return a.steps.toFloat() / a.stepGoal; }
            } else if (t.equals("CAL")) {
                var a2 = ActivityMonitor.getInfo();
                if (a2 != null && a2.calories != null) { return a2.calories.toFloat() / 2500.0; }
            } else if (t.equals("BATTERY")) {
                return System.getSystemStats().battery / 100.0;
            }
        } catch (ex) { }
        return 0.0;
    }
}
