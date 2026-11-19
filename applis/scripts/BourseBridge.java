package __PKG__;

/* Bourse : cours des actions (Yahoo Finance, données publiques, parfois en différé), graphique, portefeuille, alertes.
   Page : MAGBourse.
     get(key, url)  → lecture en arrière-plan (sans les blocages CORS du navigateur) ; take(key) → texte, "__wait__" ou "__err__"
     alerts(json)   → règles d'alerte {on, rules:[{sym, nom, above, below, move}]} : vérifiées toutes les 15 min, appli fermée
     alertLog()     → alertes déclenchées depuis la dernière lecture (JSON), pour les afficher dans la page
   Seules des adresses query1/query2.finance.yahoo.com sont lues. Rien n'est envoyé : le portefeuille reste dans la page. */

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

public class BourseBridge {
    final Activity a; final WebView wv;
    public BourseBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    static final HashMap<String, String> RES = new HashMap<String, String>();
    static final ExecutorService NET = Executors.newFixedThreadPool(4);
    static boolean allowed(String u) {
        try { String h = new URL(u).getHost().toLowerCase(Locale.ROOT); return u.startsWith("https://") && (h.equals("query1.finance.yahoo.com") || h.equals("query2.finance.yahoo.com")); }
        catch (Throwable t) { return false; }
    }
    static String http(String u) {
        if (!allowed(u)) return null;
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(u).openConnection();
            h.setConnectTimeout(12000); h.setReadTimeout(15000);
            h.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36");
            h.setRequestProperty("Accept", "application/json,*/*");
            int code = h.getResponseCode();
            if (code >= 400) return null;
            try (InputStream in = h.getInputStream()) { ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n; while ((n = in.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > 3000000) break; } return bo.toString("UTF-8"); }
        } catch (Throwable e) { return null; }
    }

    @JavascriptInterface public void get(final String key, final String url) {
        synchronized (RES) { RES.put(key, "__wait__"); }
        NET.execute(new Runnable() { public void run() { String t = http(url); synchronized (RES) { RES.put(key, t == null ? "__err__" : t); } } });
    }
    @JavascriptInterface public String take(String key) { synchronized (RES) { String v = RES.get(key); if (v != null && !"__wait__".equals(v)) RES.remove(key); return v; } }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("magbourse", Context.MODE_PRIVATE); }

    @JavascriptInterface public boolean alerts(String json) {
        try {
            Context c = a.getApplicationContext();
            JSONObject o = new JSONObject(json);
            JSONArray rules = o.optJSONArray("rules"); if (rules == null) rules = new JSONArray();
            boolean on = o.optBoolean("on", true) && rules.length() > 0;
            prefs(c).edit().putBoolean("on", on).putString("rules", rules.toString()).apply();
            WorkManager wm = WorkManager.getInstance(c);
            if (on) {
                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    a.runOnUiThread(new Runnable() { public void run() { try { ActivityCompat.requestPermissions(a, new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 4311); } catch (Throwable t) { } } });
                Constraints cs = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
                PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(Veille.class, 15, TimeUnit.MINUTES).setConstraints(cs).build();
                wm.enqueueUniquePeriodicWork("magbourse", ExistingPeriodicWorkPolicy.KEEP, r);
            } else wm.cancelUniqueWork("magbourse");
            return on;
        } catch (Throwable t) { return false; }
    }
    @JavascriptInterface public String alertLog() {
        SharedPreferences sp = prefs(a.getApplicationContext());
        String v = sp.getString("log", "[]"); sp.edit().putString("log", "[]").apply(); return v;
    }
    @JavascriptInterface public boolean notifOk() {
        return Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }
    @JavascriptInterface public void quit() { a.runOnUiThread(new Runnable() { public void run() { try { a.finishAndRemoveTask(); } catch (Throwable t) { a.finish(); } } }); }

    static String fr(double v) { return String.format(Locale.FRANCE, Math.abs(v) >= 1000 ? "%,.0f" : "%,.2f", v); }

    /** Vérification des alertes, appli fermée (WorkManager, toutes les 15 min au plus souvent permis par Android) */
    public static class Veille extends Worker {
        public Veille(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }
        @NonNull @Override public Result doWork() {
            Context c = getApplicationContext(); SharedPreferences sp = prefs(c);
            if (!sp.getBoolean("on", false)) return Result.success();
            try {
                JSONArray rules = new JSONArray(sp.getString("rules", "[]"));
                JSONObject st = new JSONObject(sp.getString("etat", "{}"));
                JSONArray log = new JSONArray(sp.getString("log", "[]"));
                HashMap<String, double[]> q = new HashMap<String, double[]>();
                HashMap<String, String> cur = new HashMap<String, String>();
                for (int i = 0; i < rules.length(); i++) {
                    JSONObject r = rules.getJSONObject(i); String sym = r.optString("sym", "");
                    if (sym.isEmpty()) continue;
                    if (!q.containsKey(sym)) {
                        String t = http("https://query1.finance.yahoo.com/v8/finance/chart/" + URLEncoder.encode(sym, "UTF-8") + "?range=1d&interval=1d");
                        if (t == null) { q.put(sym, null); continue; }
                        JSONObject m = new JSONObject(t).getJSONObject("chart").getJSONArray("result").getJSONObject(0).getJSONObject("meta");
                        double p = m.optDouble("regularMarketPrice", Double.NaN), pc = m.optDouble("chartPreviousClose", m.optDouble("previousClose", Double.NaN));
                        q.put(sym, new double[]{ p, pc }); cur.put(sym, m.optString("currency", ""));
                    }
                    double[] v = q.get(sym); if (v == null || Double.isNaN(v[0])) continue;
                    String nom = r.optString("nom", sym), dev = cur.get(sym) == null ? "" : cur.get(sym), unit = "USD".equals(dev) ? " $" : "EUR".equals(dev) ? " €" : " " + dev;
                    String id = r.optString("id", sym + i);
                    check(c, st, log, id + ":h", r.has("above") && !r.isNull("above") && v[0] >= r.optDouble("above"), nom + " au-dessus de " + fr(r.optDouble("above")) + unit, "Cours : " + fr(v[0]) + unit, 7401 + i * 3);
                    check(c, st, log, id + ":b", r.has("below") && !r.isNull("below") && v[0] <= r.optDouble("below"), nom + " en dessous de " + fr(r.optDouble("below")) + unit, "Cours : " + fr(v[0]) + unit, 7402 + i * 3);
                    if (r.has("move") && !r.isNull("move") && !Double.isNaN(v[1]) && v[1] > 0) {
                        double ch = (v[0] - v[1]) / v[1] * 100, lim = Math.abs(r.optDouble("move"));
                        String jour = new java.text.SimpleDateFormat("yyyyMMdd", Locale.ROOT).format(new java.util.Date());
                        check(c, st, log, id + ":m" + jour, Math.abs(ch) >= lim, nom + (ch >= 0 ? " monte de " : " baisse de ") + String.format(Locale.FRANCE, "%.1f", Math.abs(ch)) + " % aujourd'hui", "Cours : " + fr(v[0]) + unit, 7403 + i * 3);
                    }
                }
                while (log.length() > 50) log.remove(0);
                sp.edit().putString("etat", st.toString()).putString("log", log.toString()).apply();
            } catch (Throwable e) { return Result.retry(); }
            return Result.success();
        }
        /** prévient une seule fois quand la condition devient vraie ; se réarme quand elle redevient fausse */
        static void check(Context c, JSONObject st, JSONArray log, String k, boolean now, String titre, String txt, int nid) throws Exception {
            boolean was = st.optBoolean(k, false);
            if (now && !was) {
                MainActivity.postNotif(c, "📈 " + titre, txt, nid);
                JSONObject o = new JSONObject(); o.put("at", System.currentTimeMillis()); o.put("t", titre); o.put("x", txt); log.put(o);
            }
            st.put(k, now);
        }
    }
}
