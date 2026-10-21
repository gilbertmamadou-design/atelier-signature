package __PKG__;

// Météo (prévisions personnelles) : exposé en JavaScript sous window.MAGMeteo.
//  - fetch(req, url)      : téléchargement natif (repli si la WebView refuse la requête), événement « fetch »
//  - locate()             : position approximative (LocationManager) + nom du lieu (Geocoder), événement « location »
//  - alertsSet / alertsGet / alertsState / alertsTest : alertes perso vérifiées par MeteoPersoJob (JobScheduler)
//  - notifPerm / askNotif, openUrl, share, openSettings
// Le constructeur ne fait rien : cette classe est chargée dans toutes les applis.
// MeteoPersoJob est appelé par réflexion : ce pont compile et fonctionne même sans lui (alertes alors indisponibles).
// Codes de requête : 6201 (position), 6202 (notifications).

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Locale;

public class MeteoBridge {
    static final int REQ_LOC = 6201, REQ_NOTIF = 6202;
    static final String PREFS = "meteo_perso";
    private static final String UA = "Mozilla/5.0 (Linux; Android 15) Meteo/1.0";
    private static final String[] HOSTS = { "open-meteo.com", "rainviewer.com" };

    private final Activity a;
    private final WebView wv;
    private boolean pendingLocate = false;
    private boolean locBusy = false;

    public MeteoBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Cycle de vie (appelé par MainActivity) ----------
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) {
        if (requestCode == REQ_LOC && pendingLocate) {
            pendingLocate = false;
            if (hasLoc()) locateNow();
            else emit("location", "{\"ok\":false,\"err\":\"perm\"}");
        } else if (requestCode == REQ_NOTIF) {
            emit("notif", "{\"state\":" + JSONObject.quote(notifPerm()) + "}");
        }
    }
    public void onResume() { emit("resume", "{}"); }
    public void onIntent(Intent i) { }

    private void emit(final String type, final String json) {
        final String js = "window.meteoEvent&&meteoEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "{}" : json) + ")";
        a.runOnUiThread(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } } });
    }
    private SharedPreferences prefs() { return a.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    @JavascriptInterface public String version() { return "1"; }

    // ---------- Réseau (repli natif) ----------
    static boolean allowed(String url) {
        try {
            Uri u = Uri.parse(url);
            if (!"https".equals(u.getScheme()) || u.getHost() == null) return false;
            String h = u.getHost().toLowerCase(Locale.ROOT);
            for (String s : HOSTS) if (h.equals(s) || h.endsWith("." + s)) return true;
        } catch (Exception e) { }
        return false;
    }

    /** Événement « fetch » {req, ok, status, body} ou {req, ok:false, err} */
    @JavascriptInterface public void fetch(final String req, final String url) {
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                o.put("req", req);
                if (!allowed(url)) throw new Exception("Adresse non autorisée");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000); c.setReadTimeout(25000);
                c.setRequestProperty("User-Agent", UA);
                c.setRequestProperty("Accept", "application/json");
                int code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] buf = new byte[16384]; int n; long tot = 0;
                    while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); tot += n; if (tot > 6_000_000) break; }
                    in.close();
                }
                c.disconnect();
                o.put("ok", code < 400); o.put("status", code); o.put("body", new String(bo.toByteArray(), "UTF-8"));
            } catch (Throwable t) {
                try { o.put("ok", false); o.put("status", 0); o.put("err", t.getMessage() == null ? "Pas de connexion" : t.getMessage()); } catch (Exception e) { }
            }
            emit("fetch", o.toString());
        } }).start();
    }

    // ---------- Position ----------
    private boolean hasLoc() {
        return a.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || a.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** "granted", "ask" (jamais demandé ou redemandable) ou "blocked" (refusé définitivement : passer par les réglages) */
    @JavascriptInterface public String locPerm() {
        if (hasLoc()) return "granted";
        boolean asked = prefs().getBoolean("locAsked", false);
        if (asked && !a.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_COARSE_LOCATION)) return "blocked";
        return "ask";
    }

    /** Position approximative. Événement « location » {ok, lat, lon, acc, at, name, sub} ou {ok:false, err:"perm"|"off"|"timeout"} */
    @JavascriptInterface public void locate() {
        a.runOnUiThread(new Runnable() { public void run() {
            if (hasLoc()) { locateNow(); return; }
            pendingLocate = true;
            prefs().edit().putBoolean("locAsked", true).apply();
            a.requestPermissions(new String[]{ Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }, REQ_LOC);
        } });
    }

    @SuppressWarnings({"MissingPermission", "deprecation"})
    private void locateNow() {
        if (locBusy) return;
        final LocationManager lm = (LocationManager) a.getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) { emit("location", "{\"ok\":false,\"err\":\"off\"}"); return; }
        boolean net = false, gps = false;
        try { net = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } catch (Exception e) { }
        try { gps = lm.isProviderEnabled(LocationManager.GPS_PROVIDER); } catch (Exception e) { }
        Location best = null;
        try {
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
        } catch (Exception e) { }
        // Une position de moins de 20 min suffit pour la météo
        if (best != null && System.currentTimeMillis() - best.getTime() < 20 * 60000L) { deliver(best); return; }
        if (!net && !gps) {
            if (best != null) deliver(best); else emit("location", "{\"ok\":false,\"err\":\"off\"}");
            return;
        }
        final String prov = net ? LocationManager.NETWORK_PROVIDER : LocationManager.GPS_PROVIDER;
        final Location fallback = best;
        final Handler h = new Handler(Looper.getMainLooper());
        final boolean[] done = { false };
        locBusy = true;
        final LocationListener ll = new LocationListener() {
            public void onLocationChanged(Location l) { if (done[0]) return; done[0] = true; locBusy = false; try { lm.removeUpdates(this); } catch (Exception e) { } deliver(l); }
            public void onStatusChanged(String p, int s, Bundle b) { }
            public void onProviderEnabled(String p) { }
            public void onProviderDisabled(String p) { }
        };
        h.postDelayed(new Runnable() { public void run() {
            if (done[0]) return; done[0] = true; locBusy = false;
            try { lm.removeUpdates(ll); } catch (Exception e) { }
            if (fallback != null) deliver(fallback); else emit("location", "{\"ok\":false,\"err\":\"timeout\"}");
        } }, 20000);
        try { lm.requestLocationUpdates(prov, 0L, 0f, ll, Looper.getMainLooper()); }
        catch (Throwable t) {
            done[0] = true; locBusy = false;
            if (fallback != null) deliver(fallback); else emit("location", "{\"ok\":false,\"err\":\"off\"}");
        }
    }

    private void deliver(final Location l) {
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                o.put("ok", true);
                o.put("lat", Math.round(l.getLatitude() * 1000) / 1000.0);
                o.put("lon", Math.round(l.getLongitude() * 1000) / 1000.0);
                o.put("acc", Math.round(l.getAccuracy()));
                o.put("at", l.getTime());
                try {
                    if (Geocoder.isPresent()) {
                        @SuppressWarnings("deprecation")
                        List<Address> r = new Geocoder(a, Locale.FRANCE).getFromLocation(l.getLatitude(), l.getLongitude(), 1);
                        if (r != null && !r.isEmpty()) {
                            Address ad = r.get(0);
                            String n = ad.getLocality() != null ? ad.getLocality() : ad.getSubAdminArea() != null ? ad.getSubAdminArea() : ad.getAdminArea();
                            if (n != null) o.put("name", n);
                            if (ad.getSubAdminArea() != null) o.put("sub", ad.getSubAdminArea());
                            if (ad.getCountryCode() != null) o.put("cc", ad.getCountryCode());
                        }
                    }
                } catch (Throwable t) { }
            } catch (Exception e) { }
            emit("location", o.toString());
        } }).start();
    }

    // ---------- Notifications ----------
    @JavascriptInterface public String notifPerm() {
        if (Build.VERSION.SDK_INT < 33) return "granted";
        if (a.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED) return "granted";
        if (prefs().getBoolean("notifAsked", false) && !a.shouldShowRequestPermissionRationale("android.permission.POST_NOTIFICATIONS")) return "blocked";
        return "ask";
    }
    @JavascriptInterface public void askNotif() {
        if (Build.VERSION.SDK_INT < 33 || "granted".equals(notifPerm())) return;
        a.runOnUiThread(new Runnable() { public void run() {
            prefs().edit().putBoolean("notifAsked", true).apply();
            a.requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" }, REQ_NOTIF);
        } });
    }

    // ---------- Alertes perso (MeteoPersoJob, par réflexion) ----------
    private Class<?> job() {
        try { return Class.forName(MeteoBridge.class.getPackage().getName() + ".MeteoPersoJob"); } catch (Throwable t) { return null; }
    }
    @JavascriptInterface public boolean alertsAvailable() { return job() != null; }

    @JavascriptInterface public String alertsGet() { return prefs().getString("cfg", "{}"); }

    /** Enregistre les réglages et (re)planifie la vérification. Retourne {ok, job, planned} */
    @JavascriptInterface public String alertsSet(String json) {
        JSONObject r = new JSONObject();
        try {
            new JSONObject(json);   // validation
            prefs().edit().putString("cfg", json).apply();
            Class<?> k = job();
            r.put("job", k != null);
            boolean planned = false;
            if (k != null) planned = (Boolean) k.getMethod("schedule", Context.class).invoke(null, a.getApplicationContext());
            r.put("planned", planned);
            r.put("ok", true);
        } catch (Throwable t) {
            try { r.put("ok", false).put("err", t.getMessage() == null ? "Réglages illisibles" : t.getMessage()); } catch (Exception e) { }
        }
        return r.toString();
    }

    /** {job, planned, last, lastMsg, log:[{at,type,title,text}]} */
    @JavascriptInterface public String alertsState() {
        JSONObject o = new JSONObject();
        try {
            SharedPreferences p = prefs();
            Class<?> k = job();
            o.put("job", k != null);
            boolean planned = false;
            if (k != null) { try { planned = (Boolean) k.getMethod("planned", Context.class).invoke(null, a.getApplicationContext()); } catch (Throwable t) { } }
            o.put("planned", planned);
            o.put("last", p.getLong("last", 0));
            o.put("lastMsg", p.getString("lastMsg", ""));
            o.put("log", new org.json.JSONArray(p.getString("log", "[]")));
            o.put("notif", notifPerm());
        } catch (Exception e) { }
        return o.toString();
    }

    /** Vérification immédiate (envoie les notifications utiles). Événement « alertsTest » {ok, msg} */
    @JavascriptInterface public void alertsTest() {
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                Class<?> k = job();
                if (k == null) throw new Exception("Alertes indisponibles dans cette version de l'appli");
                String msg = (String) k.getMethod("check", Context.class, boolean.class).invoke(null, a.getApplicationContext(), true);
                o.put("ok", true).put("msg", msg);
            } catch (Throwable t) {
                Throwable c = t.getCause() != null ? t.getCause() : t;
                try { o.put("ok", false).put("msg", c.getMessage() == null ? "Vérification impossible" : c.getMessage()); } catch (Exception e) { }
            }
            emit("alertsTest", o.toString());
        } }).start();
    }

    // ---------- Divers ----------
    @JavascriptInterface public void openUrl(final String url) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { }
        } });
    }

    @JavascriptInterface public void share(final String text) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Partager")); } catch (Exception e) { }
        } });
    }

    /** what : "location" (réglage Position du téléphone), "notif" (notifications de l'appli), sinon fiche de l'appli */
    @JavascriptInterface public void openSettings(final String what) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                Intent i;
                if ("location".equals(what)) i = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                else if ("notif".equals(what) && Build.VERSION.SDK_INT >= 26) i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName());
                else i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()));
                a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e) { }
        } });
    }
}
