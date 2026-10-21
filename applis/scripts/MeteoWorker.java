package __PKG__;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.ArrayList;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/* Météo du chantier : vérifie le temps toutes les 30 minutes, même application fermée,
   et prévient par une notification quand il change (alerte, vigilance, retour au beau temps). */
public class MeteoWorker extends Worker {
    public MeteoWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("magmeteo", Context.MODE_PRIVATE); }

    /* appelé par la page : {on, lat, lon, name, lim, roul, al} */
    static boolean setup(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            boolean on = o.optBoolean("on", true);
            SharedPreferences.Editor e = prefs(c).edit().putBoolean("on", on);
            if (o.has("lat")) e.putString("lat", o.optString("lat")).putString("lon", o.optString("lon")).putString("name", o.optString("name", "chantier"));
            if (o.has("lim")) e.putInt("lim", o.optInt("lim", 60));
            if (o.has("roul")) e.putBoolean("roul", o.optBoolean("roul", false));
            if (o.has("al")) e.putString("al", o.optString("al", ""));
            e.apply();
            WorkManager wm = WorkManager.getInstance(c);
            if (on && prefs(c).contains("lat")) {
                Constraints cs = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
                PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(MeteoWorker.class, 30, TimeUnit.MINUTES).setConstraints(cs).build();
                wm.enqueueUniquePeriodicWork("magmeteo", ExistingPeriodicWorkPolicy.KEEP, r);
                return true;
            }
            wm.cancelUniqueWork("magmeteo");
            return false;
        } catch (Exception e) { return false; }
    }

    static class J { String st = "ok"; ArrayList<String> ko = new ArrayList<String>(), att = new ArrayList<String>(); }
    static J judge(double v, double g, int code, double pr, double t, int lim, boolean roul) {
        J j = new J(); double m = Math.max(v, g);
        if (code >= 95) j.ko.add("orage : risque de foudre, descendre de l'échafaudage");
        if (m > lim) j.ko.add((g > v ? "rafales " : "vent ") + Math.round(m) + " km/h > " + lim + " km/h admis");
        else if (m >= 0.75 * lim) j.att.add("vent fort (" + Math.round(m) + " km/h), proche de la limite de " + lim + " km/h");
        if ((code >= 71 && code <= 77) || code == 85 || code == 86 || (t <= 0 && pr > 0)) j.ko.add("neige ou verglas : planchers glissants");
        else if (t <= 1) j.att.add("risque de gel : vérifier planchers et échelles");
        if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82) || pr >= 1) j.att.add("pluie : planchers glissants");
        else if (code >= 51 && code <= 57) j.att.add("bruine : planchers humides");
        if (code == 45 || code == 48) j.att.add("brouillard : visibilité réduite");
        if (t >= 33) j.att.add("forte chaleur (" + Math.round(t) + " °C)");
        else if (t <= -5) j.att.add("grand froid (" + Math.round(t) + " °C)");
        j.st = !j.ko.isEmpty() ? "ko" : !j.att.isEmpty() ? "att" : "ok";
        return j;
    }
    static String join(ArrayList<String> a) { StringBuilder s = new StringBuilder(); for (String x : a) { if (s.length() > 0) s.append(" · "); s.append(x); } return s.toString(); }

    @NonNull @Override public Result doWork() {
        Context c = getApplicationContext(); SharedPreferences sp = prefs(c);
        if (!sp.getBoolean("on", true) || !sp.contains("lat")) return Result.success();
        try {
            String u = "https://api.open-meteo.com/v1/forecast?latitude=" + sp.getString("lat", "") + "&longitude=" + sp.getString("lon", "")
                + "&timezone=auto&forecast_days=2&wind_speed_unit=kmh&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation"
                + "&hourly=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation";
            String txt = VeilleWorker.get(u);
            if (txt == null) return Result.retry();
            JSONObject d = new JSONObject(txt), cu = d.getJSONObject("current"), H = d.getJSONObject("hourly");
            int lim = sp.getInt("lim", 60); boolean roul = sp.getBoolean("roul", false); String name = sp.getString("name", "chantier");
            J now = judge(cu.optDouble("wind_speed_10m", 0), cu.optDouble("wind_gusts_10m", 0), cu.optInt("weather_code", 0), cu.optDouble("precipitation", 0), cu.optDouble("temperature_2m", 10), lim, roul);
            JSONArray tm = H.getJSONArray("time"); String tnow = cu.optString("time", "");
            String koH = null; J koJ = null, attJ = null; String attH = null; int n = 0;
            for (int i = 0; i < tm.length() && n < 12; i++) {
                String ti = tm.getString(i); if (ti.compareTo(tnow) <= 0) continue; n++;
                J jh = judge(H.getJSONArray("wind_speed_10m").optDouble(i, 0), H.getJSONArray("wind_gusts_10m").optDouble(i, 0), H.getJSONArray("weather_code").optInt(i, 0),
                    H.getJSONArray("precipitation").optDouble(i, 0), H.getJSONArray("temperature_2m").optDouble(i, 10), lim, roul);
                String hh = ti.length() >= 13 ? String.valueOf(Integer.parseInt(ti.substring(11, 13))) : "?";
                if ("ko".equals(jh.st) && koJ == null) { koJ = jh; koH = hh; }
                if ("att".equals(jh.st) && attJ == null) { attJ = jh; attH = hh; }
            }
            String lv, key, title, text;
            if ("ko".equals(now.st)) { lv = "ko"; key = "ko";
                title = "⛔ Alerte météo — travail en hauteur interdit (" + name + ")";
                text = join(now.ko) + ". Arrêter, faire descendre tout le monde, ranger le matériel léger" + (roul ? ", rentrer ou amarrer la tour roulante." : ", vérifier les amarrages."); }
            else if (koJ != null) { lv = "bientot"; key = "bientot" + koH;
                title = "⚠ Alerte météo — dégradation prévue à " + koH + " h (" + name + ")";
                text = join(koJ.ko) + ". Finir et redescendre avant " + koH + " h, sécuriser l'échafaudage."; }
            else if ("att".equals(now.st)) { lv = "att"; key = "att";
                title = "⚠ Vigilance météo (" + name + ")"; text = join(now.att) + ". Travail possible avec précautions."; }
            else if (attJ != null) { lv = "att"; key = "attp" + attH;
                title = "⚠ Vigilance météo — prévue à " + attH + " h (" + name + ")"; text = join(attJ.att) + "."; }
            else { lv = "ok"; key = "ok";
                title = "✔ Conditions météo revenues favorables (" + name + ")";
                text = "Travail en hauteur possible. Vérifier l'échafaudage (amarrages, planchers, garde-corps) avant de remonter."; }
            String old = sp.getString("al", "");
            if (!key.equals(old)) {
                sp.edit().putString("al", key).apply();
                boolean wasBad = old.length() > 0 && !old.equals("ok");
                if (!"ok".equals(lv) || wasBad) MainActivity.postNotif(c, title, text, 7401);
            }
        } catch (Exception e) { return Result.retry(); }
        return Result.success();
    }
}
