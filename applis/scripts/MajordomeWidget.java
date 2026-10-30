package __PKG__;

// Majordome : widget Android « Jarvis » pour n'importe quel lanceur (Oukitel, Nova, Socle…), redimensionnable jusqu'au plein écran.
//  - contenu : image de la sphère (redessinée à chaque mise à jour, angle différent ; RemoteViews ne permet pas d'animation),
//    nom choisi dans Majordome et salutation, heure et date (TextClock, tenues à jour par le lanceur lui-même),
//    météo et vent avec le seuil de chantier, prochain rendez-vous, prochain réveil, minuteur, lumières Hue, dernière réponse
//  - boutons : « Parler » (Majordome s'ouvre en écoute), « Éteindre » (lumières Hue éteintes directement par le pont, sans
//    ouvrir l'appli), « Bonjour » (routine du matin)
//  - 4 mises en page : petite, moyenne, grande, plein écran ; Android 12+ : RemoteViews à tailles multiples (le lanceur choisit
//    selon la place) ; avant : choix d'après les dimensions envoyées par onAppWidgetOptionsChanged
//  - mises à jour : au plus toutes les 30 min par le système (updatePeriodMillis), et quand Majordome publie un vrai changement
//    (WidgetProvider.put / putHue → changed : regroupé sur 1,5 s, ignoré si le contenu affiché est identique). Aucune boucle.
// Données : résumé publié par la page de Majordome (widgetPut), état Hue (putHue), agenda (CalendarContract, si autorisé),
// prochain réveil d'Android (AlarmManager.getNextAlarmClock). Aucune requête réseau.

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.CalendarContract;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MajordomeWidget extends AppWidgetProvider {
    // Tailles (dp) : petite, moyenne, grande, plein écran
    static final int S = 0, M = 1, L = 2, XL = 3;
    static final String[] LAYOUT = { "mj_widget_s", "mj_widget_m", "mj_widget_l", "mj_widget_xl" };
    static final float[][] SIZES = { { 40, 40 }, { 200, 100 }, { 200, 230 }, { 250, 420 } };
    static final int[] CARDS = { 0, 2, 4, 6 };   // nombre de cartes par taille
    // Actions des boutons : lancement de Majordome (extra « socle », comme depuis Socle) ou action directe
    static final String TALK = "{\"listen\":1}", HELLO = "{\"routine\":\"matin\"}";
    static final String ACT_HUE_OFF = "fr.magformation13.majordome.WIDGET_HUE_OFF";

    /** Mise en page selon la place réelle (dp) : repli d'avant Android 12, et tests */
    static int pick(float w, float h) {
        if (w < 180 || h < 90) return S;
        if (h < 220) return M;
        if (h < 410 || w < 240) return L;
        return XL;
    }

    // ---------- Contenu (Java pur, testable) ----------
    static final class Model {
        String name = "Majordome", sir = "Monsieur";
        boolean wake = false;
        Integer temp = null, wind = null, gust = null; int windLimit = 45; String where = "", sky = "";
        String evTitle = null; long evAt = 0; boolean evAll = false;
        long alarmAt = 0;
        long timerAt = 0; String timerLabel = "";
        boolean huePaired = false; int hueOn = -1, hueTotal = 0; String hueErr = null;
        String lastA = null; long lastAt = 0;
        long now = System.currentTimeMillis();
    }
    static String greet(Model m, int hour) { return (hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour") + (m.sir == null || m.sir.isEmpty() ? "" : " " + m.sir); }
    static String hm(long t) { Calendar c = Calendar.getInstance(); c.setTimeInMillis(t); return c.get(Calendar.HOUR_OF_DAY) + " h " + String.format(Locale.FRANCE, "%02d", c.get(Calendar.MINUTE)); }
    static String day(long t, long now) {
        Calendar a = Calendar.getInstance(); a.setTimeInMillis(now); Calendar b = Calendar.getInstance(); b.setTimeInMillis(t);
        int d = (b.get(Calendar.YEAR) - a.get(Calendar.YEAR)) * 366 + b.get(Calendar.DAY_OF_YEAR) - a.get(Calendar.DAY_OF_YEAR);
        return d == 0 ? "aujourd'hui" : d == 1 ? "demain" : new SimpleDateFormat("EEEE", Locale.FRANCE).format(b.getTime());
    }
    /** Niveau du vent pour le chantier : 0 OK, 1 prudence (≥ 75 % du seuil), 2 au-delà du seuil */
    static int windLevel(Model m) { if (m.wind == null) return -1; int g = Math.max(m.wind, m.gust == null ? 0 : m.gust); return g >= m.windLimit ? 2 : g >= m.windLimit * 0.75 ? 1 : 0; }
    /** Cartes [étiquette, valeur, niveau] dans l'ordre d'importance ; la mise en page en garde 0, 2, 4 ou 6 */
    static List<String[]> cards(Model m) {
        List<String[]> l = new ArrayList<>();
        if (m.temp != null) { int wl = windLevel(m); l.add(new String[]{ "MÉTÉO" + (m.where.isEmpty() ? "" : " · " + m.where.toUpperCase(Locale.FRANCE)), m.temp + "° " + m.sky + " · vent " + m.wind + (m.gust != null ? " (raf. " + m.gust + ")" : "") + " km/h", wl == 2 ? "Chantier : au-delà du seuil (" + m.windLimit + ")" : wl == 1 ? "Chantier : prudence (" + m.windLimit + ")" : "Chantier : vent OK (" + m.windLimit + ")", String.valueOf(wl) }); }
        else l.add(new String[]{ "MÉTÉO", "Demandez « quel temps fait-il ? »", "", "-1" });
        l.add(m.evTitle != null ? new String[]{ "RENDEZ-VOUS", m.evTitle, m.evAll ? capital(day(m.evAt, m.now)) + " · journée" : capital(day(m.evAt, m.now)) + " à " + hm(m.evAt), "-1" } : new String[]{ "RENDEZ-VOUS", "Rien de prévu", "dans les 7 jours", "-1" });
        l.add(m.alarmAt > m.now ? new String[]{ "RÉVEIL", hm(m.alarmAt), day(m.alarmAt, m.now), "-1" } : new String[]{ "RÉVEIL", "—", "aucun réveil prévu", "-1" });
        if (m.huePaired) l.add(new String[]{ "LUMIÈRES", m.hueErr != null ? ("unauthorized".equals(m.hueErr) ? "pont à rejumeler" : "pont injoignable") : m.hueOn < 0 ? "…" : m.hueOn == 0 ? "tout est éteint" : m.hueOn + " allumée" + (m.hueOn > 1 ? "s" : "") + (m.hueTotal > 0 ? " sur " + m.hueTotal : ""), "", "-1" });
        if (m.timerAt > m.now) l.add(new String[]{ "MINUTEUR", (m.timerLabel.isEmpty() ? "Minuteur" : capital(m.timerLabel)) + " · fin à " + hm(m.timerAt), "", "-1" });
        if (m.lastA != null && m.now - m.lastAt < 12 * 3600000L) l.add(new String[]{ m.name.toUpperCase(Locale.FRANCE), "« " + m.lastA + " »", "", "-1" });
        return l;
    }
    static String capital(String s) { return s == null || s.isEmpty() ? "" : Character.toUpperCase(s.charAt(0)) + s.substring(1); }
    static String sky(int code) {
        if (code == 0 || code == 1) return "dégagé"; if (code == 2) return "nuageux"; if (code == 3) return "couvert"; if (code == 45 || code == 48) return "brouillard";
        if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return "pluie"; if (code >= 71 && code <= 77 || code == 85 || code == 86) return "neige"; if (code >= 95) return "orage"; return "";
    }

    // ---------- Lecture des données (Android) ----------
    static Model read(Context c) {
        Model m = new Model();
        try {
            JSONObject d = new JSONObject(WidgetProvider.prefs(c).getString("data", "{}"));
            m.name = d.optString("name", "Majordome"); if (m.name.isEmpty()) m.name = "Majordome";
            m.sir = d.has("sir") ? d.optString("sir", "") : "Monsieur"; m.wake = d.optBoolean("wake", false);
            m.windLimit = d.optInt("windLimit", 45);
            JSONObject wx = d.optJSONObject("wx");
            if (wx != null && m.now - wx.optLong("at") < 3 * 3600000L) { m.temp = wx.optInt("t"); m.wind = wx.optInt("wind"); m.gust = wx.optInt("gust"); m.where = wx.optString("where", ""); m.sky = sky(wx.optInt("code", -1)); }
            JSONArray tl = d.optJSONArray("timers"); JSONObject t0 = tl != null && tl.length() > 0 ? tl.optJSONObject(0) : d.optJSONObject("timer");
            if (t0 != null) { m.timerAt = t0.optLong("at"); m.timerLabel = t0.optString("label", ""); }
            JSONObject la = d.optJSONObject("last"); if (la != null && !la.optString("a").isEmpty()) { m.lastA = la.optString("a"); m.lastAt = la.optLong("at"); if (m.lastA.length() > 110) m.lastA = m.lastA.substring(0, 108) + "…"; }
            JSONObject nx = d.optJSONObject("next"); if (nx != null && "alarm".equals(nx.optString("kind"))) m.alarmAt = nx.optLong("at");
        } catch (Throwable t) { }
        try {
            String hs = WidgetProvider.prefs(c).getString("hue", "");
            if (!hs.isEmpty()) { JSONObject h = new JSONObject(hs); m.huePaired = h.optBoolean("paired"); m.hueOn = h.has("on") ? h.optInt("on") : -1; m.hueTotal = h.optInt("total"); m.hueErr = h.has("err") ? h.optString("err") : null; }
        } catch (Throwable t) { }
        try {
            AlarmManager.AlarmClockInfo ai = ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).getNextAlarmClock();
            if (ai != null && (m.alarmAt <= m.now || ai.getTriggerTime() < m.alarmAt)) m.alarmAt = ai.getTriggerTime();
        } catch (Throwable t) { }
        if (c.checkSelfPermission("android.permission.READ_CALENDAR") == PackageManager.PERMISSION_GRANTED) {
            try {
                Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
                ContentUris.appendId(b, m.now - 3600000L); ContentUris.appendId(b, m.now + 7 * 86400000L);
                try (Cursor cu = c.getContentResolver().query(b.build(), new String[]{ CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY },
                        CalendarContract.Instances.END + " > ?", new String[]{ String.valueOf(m.now) }, CalendarContract.Instances.BEGIN + " ASC")) {
                    String allT = null; long allAt = 0;
                    while (cu != null && cu.moveToNext()) {
                        boolean all = cu.getInt(3) != 0; String t = cu.getString(0);
                        if (all) { if (allT == null) { allT = t; Calendar u = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")); u.setTimeInMillis(cu.getLong(1)); Calendar l = Calendar.getInstance(); l.set(u.get(Calendar.YEAR), u.get(Calendar.MONTH), u.get(Calendar.DAY_OF_MONTH), 0, 0, 0); allAt = l.getTimeInMillis(); } continue; }
                        m.evTitle = t; m.evAt = cu.getLong(1); break;
                    }
                    if (m.evTitle == null && allT != null) { m.evTitle = allT; m.evAt = allAt; m.evAll = true; }
                }
            } catch (Throwable t) { }
        }
        return m;
    }

    // ---------- Construction des vues ----------
    static int res(Context c, String type, String name) { return c.getResources().getIdentifier(name, type, c.getPackageName()); }
    static PendingIntent launch(Context c, String json, int code) {
        Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (i == null) i = new Intent();
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        i.putExtra("socle", json);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    static PendingIntent hueOff(Context c) {
        Intent i = new Intent(ACT_HUE_OFF).setComponent(new ComponentName(c, Act.class));
        return PendingIntent.getBroadcast(c, 6650, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    static CharSequence card(String[] k, boolean small) {
        SpannableStringBuilder b = new SpannableStringBuilder();
        b.append(k[0]); b.setSpan(new ForegroundColorSpan(0xFF7FE6D2), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE); b.setSpan(new RelativeSizeSpan(0.72f), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        b.setSpan(new StyleSpan(Typeface.BOLD), 0, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        b.append('\n'); int s = b.length(); b.append(k[1]); b.setSpan(new ForegroundColorSpan(0xFFEAFFFB), s, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (!small && k[2] != null && !k[2].isEmpty()) {
            b.append('\n'); int s2 = b.length(); b.append(k[2]);
            int lv = Integer.parseInt(k[3]);
            b.setSpan(new ForegroundColorSpan(lv == 2 ? 0xFFFF7D7D : lv == 1 ? 0xFFFFC46B : lv == 0 ? 0xFF6FE3B4 : 0xBFD6F7F0), s2, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            b.setSpan(new RelativeSizeSpan(0.85f), s2, b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        return b;
    }
    /** Image de la sphère (fond transparent), un angle différent à chaque mise à jour */
    static Bitmap orb(int px, long now) {
        Bitmap bm = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bm);
        MajordomeWallpaper.Sphere s = new MajordomeWallpaper.Sphere(420, 7);
        MajordomeWallpaper.drawSphere(cv, s, new float[s.n * 4], new Paint(Paint.ANTI_ALIAS_FLAG), 0xFF46D9C2, (now / 1000) % 3600, (now / 60000 % 360) * 0.3, 0.05, px / 2f, px / 2f, px * 0.3f, 0.05f);
        // anneau fin et trois arcs, comme la page Jarvis de Socle
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setStyle(Paint.Style.STROKE);
        p.setColor(0x3846D9C2); p.setStrokeWidth(Math.max(1, px / 220f)); cv.drawCircle(px / 2f, px / 2f, px * 0.46f, p);
        p.setColor(0x8046D9C2); p.setStrokeWidth(Math.max(2, px / 110f));
        float a0 = (now / 60000 % 360) * 7;
        android.graphics.RectF r = new android.graphics.RectF(px * 0.07f, px * 0.07f, px * 0.93f, px * 0.93f);
        for (int i = 0; i < 3; i++) cv.drawArc(r, a0 + i * 120, 52, false, p);
        return bm;
    }
    static void click(Context c, RemoteViews v, String name, PendingIntent pi) { int id = res(c, "id", name); if (id != 0) v.setOnClickPendingIntent(id, pi); }
    static RemoteViews build(Context c, Model m, int size, Bitmap orb) {
        RemoteViews v = new RemoteViews(c.getPackageName(), res(c, "layout", LAYOUT[size]));
        v.setImageViewBitmap(res(c, "id", "mj_orb"), orb);
        v.setTextViewText(res(c, "id", "mj_name"), m.name.toUpperCase(Locale.FRANCE));
        if (size > S) v.setTextViewText(res(c, "id", "mj_greet"), greet(m, Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) + (size >= L ? (m.wake ? " · dites « " + m.name + " »" : " · touchez la sphère") : ""));
        List<String[]> cl = cards(m);
        for (int i = 0; i < 6; i++) {
            int id = res(c, "id", "mj_c" + i); if (id == 0) continue;
            if (i < CARDS[size] && i < cl.size()) { v.setViewVisibility(id, View.VISIBLE); v.setTextViewText(id, card(cl.get(i), size == M)); }
            else v.setViewVisibility(id, View.GONE);
        }
        PendingIntent talk = launch(c, TALK, 6651);
        click(c, v, "mj_root", talk); click(c, v, "mj_orb", talk); click(c, v, "mj_b_talk", talk);
        if (size >= L) {
            click(c, v, "mj_b_off", hueOff(c)); click(c, v, "mj_b_hello", launch(c, HELLO, 6652));
            v.setViewVisibility(res(c, "id", "mj_b_off"), m.huePaired ? View.VISIBLE : View.GONE);
        }
        return v;
    }
    static RemoteViews views(Context c, AppWidgetManager am, int id, Model m, Bitmap orb) {
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> map = new HashMap<>();
            for (int s = S; s <= XL; s++) map.put(new SizeF(SIZES[s][0], SIZES[s][1]), build(c, m, s, orb));   // même image partagée : envoyée une fois
            return new RemoteViews(map);
        }
        Bundle o = am.getAppWidgetOptions(id);
        float w = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250), h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110);
        return build(c, m, pick(w, h), orb);
    }
    static void updateAll(Context c) {
        AppWidgetManager am = AppWidgetManager.getInstance(c);
        int[] ids = am.getAppWidgetIds(new ComponentName(c, MajordomeWidget.class));
        if (ids == null || ids.length == 0) return;
        Model m = read(c); Bitmap orb = orb(Build.VERSION.SDK_INT >= 31 ? 300 : 260, System.currentTimeMillis());
        for (int id : ids) { try { am.updateAppWidget(id, views(c, am, id, m, orb)); } catch (Throwable t) { } }
    }

    // ---------- Changements publiés par Majordome : regroupés, et seulement si le contenu affiché change ----------
    static Handler H;   // créé au premier changement (pas à l'initialisation de la classe)
    static volatile String lastSig = "";
    static Runnable pending = null;
    static void changed(final Context c0) {
        final Context c = c0.getApplicationContext();
        synchronized (MajordomeWidget.class) { if (H == null) H = new Handler(Looper.getMainLooper()); }
        H.post(new Runnable() { public void run() {
            if (pending != null) H.removeCallbacks(pending);
            pending = new Runnable() { public void run() {
                pending = null;
                try {
                    AppWidgetManager am = AppWidgetManager.getInstance(c);
                    int[] ids = am.getAppWidgetIds(new ComponentName(c, MajordomeWidget.class));
                    if (ids == null || ids.length == 0) return;
                    Model m = read(c); StringBuilder b = new StringBuilder(m.name).append('|').append(m.sir).append('|').append(m.wake);
                    for (String[] k : cards(m)) b.append('|').append(k[0]).append(k[1]).append(k[2]);
                    String sig = b.toString(); if (sig.equals(lastSig)) return;
                    lastSig = sig; updateAll(c);
                } catch (Throwable t) { }
            } };
            H.postDelayed(pending, 1500);
        } });
    }

    @Override public void onUpdate(Context c, AppWidgetManager am, int[] ids) { lastSig = ""; updateAll(c); }
    @Override public void onAppWidgetOptionsChanged(Context c, AppWidgetManager am, int id, Bundle o) {
        try { Model m = read(c); am.updateAppWidget(id, views(c, am, id, m, orb(260, System.currentTimeMillis()))); } catch (Throwable t) { }
    }

    /** Actions directes des boutons (non exporté : seuls les boutons du widget peuvent l'appeler) */
    public static class Act extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent i) {
            if (!ACT_HUE_OFF.equals(i.getAction())) return;
            boolean ok = false;
            try { ok = MajordomeBridge.widgetCall(c, "hue_all_off"); } catch (Throwable t) { }
            if (!ok) try { android.widget.Toast.makeText(c, "Aucun pont Hue jumelé dans Majordome", android.widget.Toast.LENGTH_SHORT).show(); } catch (Throwable t) { }
        }
    }
}
