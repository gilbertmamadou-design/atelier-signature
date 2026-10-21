package __PKG__;

// Météo : alertes personnelles vérifiées en arrière-plan (JobScheduler périodique, 1 à 3 h, réseau requis).
// Pluie dans l'heure, gel la nuit (plantes), canicule, vent fort, orage. Prévisions Open-Meteo (Météo-France AROME/ARPEGE).
// Réglages écrits par MeteoBridge dans les préférences « meteo_perso » (clé « cfg ») :
// {place:{name,lat,lon}, every:1..3, quiet:true, model:"mf"|"auto",
//  rain:{on,mm}, frost:{on,t}, heat:{on,t}, wind:{on,kmh}, storm:{on}}
// Aucune dépendance androidx. Ne pas confondre avec MeteoWorker (autre appli).

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

public class MeteoPersoJob extends JobService {
    public static final int JOB_ID = 6210;
    static final String PREFS = "meteo_perso", CH = "meteo_alertes";
    static final int N_RAIN = 6221, N_FROST = 6222, N_HEAT = 6223, N_WIND = 6224, N_STORM = 6225;

    // ======================================================================
    // JobService
    // ======================================================================
    @Override
    public boolean onStartJob(final JobParameters p) {
        final Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {
            boolean retry = false;
            try { check(c, false); }
            catch (Throwable t) { retry = true; note(c, "Vérification impossible : " + (t.getMessage() == null ? "pas de réseau" : t.getMessage())); }
            try { jobFinished(p, retry); } catch (Throwable t) { }
        } }, "meteo-perso").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters p) { return true; }

    // ======================================================================
    // Planification (appelée par le pont, par réflexion)
    // ======================================================================
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static JSONObject cfg(Context c) {
        try { return new JSONObject(prefs(c).getString("cfg", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static boolean anyOn(JSONObject k) {
        for (String s : new String[]{ "rain", "frost", "heat", "wind", "storm" }) { JSONObject o = k.optJSONObject(s); if (o != null && o.optBoolean("on")) return true; }
        return false;
    }

    static boolean hasPlace(JSONObject k) {
        JSONObject pl = k.optJSONObject("place");
        return pl != null && pl.has("lat") && pl.has("lon");
    }

    public static boolean schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        JSONObject k = cfg(c);
        if (!anyOn(k) || !hasPlace(k)) { js.cancel(JOB_ID); return false; }
        int h = Math.max(1, Math.min(3, k.optInt("every", 1)));
        long period = h * 3600000L;
        // Même réglage déjà planifié : on ne touche à rien (replanifier repousserait la prochaine vérification)
        JobInfo cur = js.getPendingJob(JOB_ID);
        if (cur != null && cur.getIntervalMillis() == period) return true;
        JobInfo.Builder b = new JobInfo.Builder(JOB_ID, new ComponentName(c, MeteoPersoJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(c.checkSelfPermission("android.permission.RECEIVE_BOOT_COMPLETED") == PackageManager.PERMISSION_GRANTED)
            .setBackoffCriteria(10 * 60000L, JobInfo.BACKOFF_POLICY_LINEAR);
        if (Build.VERSION.SDK_INT >= 24) b.setPeriodic(period, Math.min(period / 3, 30 * 60000L));
        else b.setPeriodic(period);
        return js.schedule(b.build()) == JobScheduler.RESULT_SUCCESS;
    }

    public static boolean planned(Context c) { return c.getSystemService(JobScheduler.class).getPendingJob(JOB_ID) != null; }

    static void note(Context c, String msg) {
        prefs(c).edit().putLong("last", System.currentTimeMillis()).putString("lastMsg", msg).apply();
    }

    // ======================================================================
    // Vérification : télécharge la prévision, compare aux seuils, notifie
    // ======================================================================
    static class Alert { String type, key, title, text; int id; Alert(String type, String key, int id, String title, String text) { this.type = type; this.key = key; this.id = id; this.title = title; this.text = text; } }

    /** manual = true : vérification demandée depuis l'appli (ignore les heures calmes et la limite « gel en soirée »). Retourne un résumé. */
    public static String check(Context c, boolean manual) throws Exception {
        JSONObject k = cfg(c);
        if (!hasPlace(k)) return "Choisis d'abord le lieu à surveiller";
        if (!anyOn(k)) return "Aucune alerte activée";
        JSONObject pl = k.getJSONObject("place");
        String place = pl.optString("name", "ton lieu");
        double lat = pl.getDouble("lat"), lon = pl.getDouble("lon");
        String base = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon
            + "&minutely_15=precipitation&forecast_minutely_15=8"
            + "&hourly=temperature_2m,precipitation,weather_code,wind_gusts_10m"
            + "&daily=temperature_2m_max&timezone=auto&timeformat=unixtime&forecast_days=3";
        JSONObject d;
        try { d = new JSONObject(get(base + ("auto".equals(k.optString("model")) ? "" : "&models=meteofrance_seamless"))); }
        catch (Exception e) { d = new JSONObject(get(base)); }
        int off = d.optInt("utc_offset_seconds", 0);
        long now = System.currentTimeMillis() / 1000;
        List<Alert> out = new ArrayList<>();

        // --- Pluie dans l'heure (pas de 15 min) ---
        JSONObject ro = k.optJSONObject("rain");
        if (ro != null && ro.optBoolean("on")) {
            double th = ro.optDouble("mm", 0.2);
            JSONObject m = d.optJSONObject("minutely_15");
            if (m != null) {
                JSONArray t = m.getJSONArray("time"), pr = m.getJSONArray("precipitation");
                boolean rainingNow = false; long first = 0; double sum = 0;
                for (int i = 0; i < t.length(); i++) {
                    long ti = t.getLong(i); double v = pr.isNull(i) ? 0 : pr.getDouble(i);
                    if (ti <= now && ti + 900 > now && v >= th / 4) rainingNow = true;
                    if (ti >= now - 450 && ti < now + 3600) { sum += v; if (first == 0 && v >= th / 4 && ti > now) first = ti; }
                }
                if (!rainingNow && first > 0 && sum >= th) {
                    long lastRain = prefs(c).getLong("sent_rain_at", 0);
                    if (manual || now - lastRain > 3 * 3600) {
                        out.add(new Alert("rain", "rain", N_RAIN, "Pluie dans l'heure à " + place,
                            "Début vers " + hm(first, off) + ", environ " + mm(sum) + " mm dans l'heure."));
                    }
                }
            }
        }

        JSONObject h = d.getJSONObject("hourly");
        JSONArray ht = h.getJSONArray("time"), temp = h.getJSONArray("temperature_2m"), code = h.getJSONArray("weather_code"), gust = h.getJSONArray("wind_gusts_10m");
        int localHourNow = (int) (((now + off) / 3600) % 24);

        // --- Gel la nuit (pour les plantes) : de maintenant à 10 h demain matin, prévenu en fin d'après-midi / soirée ---
        JSONObject fo = k.optJSONObject("frost");
        if (fo != null && fo.optBoolean("on") && (manual || (localHourNow >= 15 && localHourNow <= 22))) {
            double th = fo.optDouble("t", 1);
            long end = nextLocal(now, off, 10);
            double min = 99; long at = 0;
            for (int i = 0; i < ht.length(); i++) {
                long ti = ht.getLong(i);
                if (ti < now || ti > end || temp.isNull(i)) continue;
                double v = temp.getDouble(i);
                if (v < min) { min = v; at = ti; }
            }
            if (at > 0 && min <= th) {
                String key = "frost:" + day(end, off);
                out.add(new Alert("frost", key, N_FROST, "Gel possible cette nuit à " + place,
                    "Jusqu'à " + deg(min) + " vers " + hm(at, off) + ". Pense à rentrer ou couvrir les plantes fragiles."));
            }
        }

        // --- Canicule : maximum d'aujourd'hui (le matin) ou de demain ---
        JSONObject co = k.optJSONObject("heat");
        if (co != null && co.optBoolean("on")) {
            double th = co.optDouble("t", 35);
            JSONObject dl = d.getJSONObject("daily");
            JSONArray dt = dl.getJSONArray("time"), mx = dl.getJSONArray("temperature_2m_max");
            for (int i = 0; i < Math.min(2, dt.length()); i++) {
                if (i == 0 && localHourNow >= 13 && !manual) continue;
                if (mx.isNull(i)) continue;
                double v = mx.getDouble(i);
                if (v >= th) {
                    out.add(new Alert("heat", "heat:" + day(dt.getLong(i) + 43200, off), N_HEAT, "Forte chaleur " + (i == 0 ? "aujourd'hui" : "demain") + " à " + place,
                        "Jusqu'à " + deg(v) + ". Bois souvent, ferme les volets aux heures chaudes et arrose les plantes le soir."));
                    break;
                }
            }
        }

        // --- Vent fort et orage : 12 prochaines heures ---
        JSONObject wo = k.optJSONObject("wind"), so = k.optJSONObject("storm");
        double wTh = wo != null ? wo.optDouble("kmh", 70) : 999;
        double gMax = 0; long gAt = 0; long sAt = 0;
        for (int i = 0; i < ht.length(); i++) {
            long ti = ht.getLong(i);
            if (ti < now - 1800 || ti > now + 12 * 3600) continue;
            if (!gust.isNull(i) && gust.getDouble(i) > gMax) { gMax = gust.getDouble(i); gAt = ti; }
            int cd = code.isNull(i) ? 0 : code.getInt(i);
            if (sAt == 0 && (cd == 95 || cd == 96 || cd == 99)) sAt = ti;
        }
        if (wo != null && wo.optBoolean("on") && gMax >= wTh) {
            out.add(new Alert("wind", "wind:" + day(gAt, off) + ":" + (hour(gAt, off) < 12 ? "am" : "pm"), N_WIND, "Vent fort à " + place,
                "Rafales jusqu'à " + Math.round(gMax) + " km/h vers " + hm(gAt, off) + ". Range ce qui peut s'envoler."));
        }
        if (so != null && so.optBoolean("on") && sAt > 0) {
            out.add(new Alert("storm", "storm:" + day(sAt, off) + ":" + (hour(sAt, off) < 12 ? "am" : "pm"), N_STORM, "Orage possible à " + place,
                "Risque d'orage à partir de " + hm(sAt, off) + (day(sAt, off).equals(day(now, off)) ? "" : " demain") + ". Évite les sorties en montagne et les bords de cours d'eau."));
        }

        // --- Envoi (sans doublon) ---
        SharedPreferences p = prefs(c);
        JSONObject sent;
        try { sent = new JSONObject(p.getString("sent", "{}")); } catch (Exception e) { sent = new JSONObject(); }
        Calendar cal = Calendar.getInstance();
        int hr = cal.get(Calendar.HOUR_OF_DAY);
        boolean quiet = !manual && k.optBoolean("quiet", true) && (hr >= 22 || hr < 7);
        int n = 0;
        StringBuilder sum = new StringBuilder();
        for (Alert al : out) {
            if (sum.length() > 0) sum.append(" · ");
            sum.append(al.title);
            if (!manual && sent.has(al.key)) continue;
            if (quiet) continue;
            if (notify(c, al, place)) {
                n++;
                sent.put(al.key, System.currentTimeMillis() / 1000);
                if ("rain".equals(al.type)) p.edit().putLong("sent_rain_at", now).apply();
                log(c, al);
            }
        }
        // On oublie les alertes de plus de 3 jours
        JSONObject keep = new JSONObject();
        java.util.Iterator<String> it = sent.keys();
        while (it.hasNext()) { String s = it.next(); if (now - sent.optLong(s) < 3 * 86400) keep.put(s, sent.optLong(s)); }
        p.edit().putString("sent", keep.toString()).apply();

        String msg = out.isEmpty() ? "Rien à signaler pour " + place
            : (quiet ? "Heures calmes : " : "") + sum + (n == 0 && !quiet ? " (déjà signalé)" : "");
        note(c, msg);
        return msg;
    }

    // ---------- Notification ----------
    static boolean notify(Context c, Alert al, String place) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return false;
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "Alertes météo", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Pluie dans l'heure, gel, canicule, vent fort, orage");
                nm.createNotificationChannel(ch);
            }
            @SuppressWarnings("deprecation")
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
            b.setSmallIcon(c.getApplicationInfo().icon).setAutoCancel(true)
             .setContentTitle(al.title).setContentText(al.text)
             .setStyle(new Notification.BigTextStyle().bigText(al.text))
             .setCategory(Notification.CATEGORY_REMINDER);
            Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (i != null) {
                // Ouvre la ville concernée : MainActivity transmet l'extra « socle » à window.onSocle
                i.putExtra("socle", new JSONObject().put("place", place).put("from", "alert").toString());
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                b.setContentIntent(PendingIntent.getActivity(c, al.id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            }
            nm.notify(al.id, b.build());
            return true;
        } catch (Throwable t) { return false; }
    }

    static void log(Context c, Alert al) {
        try {
            SharedPreferences p = prefs(c);
            JSONArray a = new JSONArray(p.getString("log", "[]")), n = new JSONArray();
            n.put(new JSONObject().put("at", System.currentTimeMillis()).put("type", al.type).put("title", al.title).put("text", al.text));
            for (int i = 0; i < a.length() && n.length() < 20; i++) n.put(a.get(i));
            p.edit().putString("log", n.toString()).apply();
        } catch (Exception e) { }
    }

    // ---------- Outils ----------
    static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(25000);
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 15) Meteo/1.0");
        int code = c.getResponseCode();
        if (code >= 400) { c.disconnect(); throw new Exception("Service météo indisponible (" + code + ")"); }
        InputStream in = c.getInputStream();
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close(); c.disconnect();
        return new String(bo.toByteArray(), "UTF-8");
    }

    static int hour(long t, int off) { return (int) (((t + off) / 3600) % 24); }
    static String hm(long t, int off) {
        long l = t + off; int hh = (int) ((l / 3600) % 24), mi = (int) ((l / 60) % 60);
        return hh + " h" + (mi == 0 ? "" : String.format(Locale.FRANCE, "%02d", mi));
    }
    static String day(long t, int off) { return String.valueOf((t + off) / 86400); }
    /** Prochain instant (UTC, s) où il est hh:00 à l'heure locale du lieu */
    static long nextLocal(long now, int off, int hh) {
        long l = now + off, d0 = l - (l % 86400), at = d0 + hh * 3600L;
        if (at <= l) at += 86400;
        return at - off;
    }
    static String deg(double v) { return String.format(Locale.FRANCE, "%.0f", v).replace("-0", "0") + " °C"; }
    static String mm(double v) { return String.format(Locale.FRANCE, v < 10 ? "%.1f" : "%.0f", v); }
}
