package __PKG__;

// Écran : vidéos du téléphone, PeerTube, domaine public (Internet Archive, NASA, Wikimedia Commons),
// flux RSS officiels des chaînes YouTube (lecture uniquement dans l'appli YouTube) et raccourcis vers les applis TV officielles.
// Exposé en JavaScript sous window.MAGEcran. Le constructeur ne fait rien : la classe est chargée dans toutes les applis.
// Aucun téléchargement, aucune extraction de flux de sites qui l'interdisent.

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class EcranBridge {
    static final int REQ_PERM = 5801;
    static final String PREFS = "ecran_player";   // partagé avec EcranPlayer
    /** Dernier pont actif : EcranPlayer y renvoie les positions (référence faible) */
    static java.lang.ref.WeakReference<EcranBridge> current;
    private static final String UA = "Mozilla/5.0 (Linux; Android 15; WP60) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 Ecran/1.0";
    // Hôtes de flux vidéo qu'on ne lit jamais directement (on ouvre les applis officielles à la place)
    private static final String[] NO_STREAM = { "googlevideo.com", "youtube-nocookie.com", "ytimg.googleusercontent.com", "nflxvideo.net", "netflix.com",
        "primevideo.com", "disneyplus.com", "canalplus.com", "dailymotion.com", "vimeocdn.com", "twitch.tv", "ttvnw.net" };

    private final Activity a;
    private final WebView wv;
    private ExecutorService thumbExec;
    private boolean used = false;
    private long lastProgress = 0;

    public EcranBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Cycle de vie (appelé par MainActivity) ----------
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) { if (requestCode == REQ_PERM) emit("perm", perm()); }
    public void onResume() { if (used) emit("progress", positions()); }
    public void onIntent(Intent i) { }

    void emit(final String type, final String json) {
        final String js = "window.ecranEvent&&ecranEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "" : json) + ")";
        a.runOnUiThread(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } } });
    }

    /** Appelé par EcranPlayer quand une position est enregistrée */
    void progressChanged() {
        long now = System.currentTimeMillis();
        if (now - lastProgress < 1500) return;
        lastProgress = now;
        emit("progress", positions());
    }

    private static String host(String url) {
        try { String h = Uri.parse(url).getHost(); return h == null ? "" : h.toLowerCase(Locale.ROOT); } catch (Exception e) { return ""; }
    }
    static boolean noStream(String url) {
        String h = host(url);
        for (String b : NO_STREAM) if (h.equals(b) || h.endsWith("." + b)) return true;
        if (h.endsWith("youtube.com") && url.contains("videoplayback")) return true;
        return false;
    }

    // ---------- Réseau : requêtes des API (sans la restriction CORS de la WebView) ----------
    private static HttpURLConnection open(String url) throws Exception {
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000); c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "application/json, application/xml, text/html;q=0.9, */*;q=0.8");
            c.setRequestProperty("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.6");
            // Page de chaîne YouTube : évite la page de consentement (on n'y lit que l'identifiant de la chaîne)
            if (host(cur).endsWith("youtube.com")) c.setRequestProperty("Cookie", "SOCS=CAI; CONSENT=YES+cb");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new Exception("Redirection sans adresse");
                cur = new URL(new URL(cur), loc).toString();
                if (noStream(cur)) throw new Exception("Adresse non autorisée");
                continue;
            }
            return c;
        }
        throw new Exception("Trop de redirections");
    }

    /** Télécharge le texte d'une API, d'un flux RSS ou d'une page : événement « fetch » {req, ok, status, body, url} */
    @JavascriptInterface public void fetch(final String req, final String url) {
        used = true;
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                o.put("req", req);
                if (url == null || !url.startsWith("https://") && !url.startsWith("http://")) throw new Exception("Adresse invalide");
                if (noStream(url)) throw new Exception("Adresse non autorisée");
                HttpURLConnection c = open(url);
                int code = c.getResponseCode();
                String ct = c.getContentType();
                if (ct != null && (ct.startsWith("video/") || ct.startsWith("audio/"))) { c.disconnect(); throw new Exception("Ce lien est un fichier vidéo, pas une page"); }
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] buf = new byte[16384]; int n; long tot = 0;
                    while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); tot += n; if (tot > 6_000_000) break; }
                    in.close();
                }
                String cs = "UTF-8";
                if (ct != null) for (String p : ct.split(";")) { p = p.trim(); if (p.toLowerCase(Locale.ROOT).startsWith("charset=")) cs = p.substring(8).replace("\"", "").trim(); }
                String body;
                try { body = new String(bo.toByteArray(), Charset.forName(cs)); } catch (Exception e) { body = new String(bo.toByteArray(), "UTF-8"); }
                o.put("ok", code < 400); o.put("status", code); o.put("body", body); o.put("url", c.getURL().toString());
                c.disconnect();
            } catch (Throwable t) {
                try { o.put("ok", false); o.put("status", 0); o.put("err", t.getMessage() == null ? "Pas de connexion" : t.getMessage()); } catch (Exception e) { }
            }
            emit("fetch", o.toString());
        } }).start();
    }

    // ---------- Autorisation « Vidéos » ----------
    private String videoPerm() { return Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_VIDEO" : "android.permission.READ_EXTERNAL_STORAGE"; }

    /** "all" | "partial" (Android 14 : quelques vidéos choisies) | "none" */
    @JavascriptInterface public String perm() {
        try {
            if (a.checkSelfPermission(videoPerm()) == PackageManager.PERMISSION_GRANTED) return "all";
            if (Build.VERSION.SDK_INT >= 34 && a.checkSelfPermission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED") == PackageManager.PERMISSION_GRANTED) return "partial";
        } catch (Throwable t) { }
        return "none";
    }

    @JavascriptInterface public void askPerm() {
        used = true;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (Build.VERSION.SDK_INT >= 23 && !a.shouldShowRequestPermissionRationale(videoPerm()) && a.getSharedPreferences("ecran", Context.MODE_PRIVATE).getBoolean("asked", false)) {
                    appSettings(); return;   // déjà refusé définitivement : on ouvre les réglages de l'appli
                }
                a.getSharedPreferences("ecran", Context.MODE_PRIVATE).edit().putBoolean("asked", true).apply();
                a.requestPermissions(new String[]{ videoPerm() }, REQ_PERM);
            } catch (Throwable t) { toast("Autorisation impossible à demander"); }
        } });
    }

    @JavascriptInterface public void appSettings() {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()))); } catch (Exception e) { toast("Réglages indisponibles"); }
        } });
    }

    // ---------- Mes vidéos (MediaStore) ----------
    /** Lance l'inventaire des vidéos du téléphone. Événement « scan » : [{id, url, name, title, folder, path, date, dur, size, w, h, mime}] */
    @JavascriptInterface public void scan() {
        used = true;
        new Thread(new Runnable() { public void run() {
            JSONArray out = new JSONArray();
            Uri base = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            boolean q = Build.VERSION.SDK_INT >= 29;
            String[] proj = { "_id", "_display_name", "title", "duration", "_size", "date_added", "date_modified", "datetaken", "bucket_display_name",
                "width", "height", "mime_type", q ? "relative_path" : "_data" };
            try (Cursor c = a.getContentResolver().query(base, proj, null, null, "date_modified DESC")) {
                while (c != null && c.moveToNext()) {
                    try {
                        JSONObject o = new JSONObject();
                        long id = c.getLong(0);
                        long size = c.getLong(4);
                        if (size <= 0) continue;
                        o.put("id", id);
                        o.put("url", ContentUris.withAppendedId(base, id).toString());
                        o.put("name", str(c, 1));
                        o.put("title", str(c, 2));
                        o.put("dur", c.getLong(3));
                        o.put("size", size);
                        long taken = c.getLong(7);
                        o.put("date", taken > 0 ? taken : Math.max(c.getLong(5), c.getLong(6)) * 1000L);
                        o.put("mod", c.getLong(6));
                        o.put("folder", str(c, 8));
                        o.put("w", c.getInt(9)); o.put("h", c.getInt(10));
                        o.put("mime", str(c, 11));
                        String p = str(c, 12);
                        if (!q && p.contains("/")) {   // _data : chemin complet → chemin relatif
                            int i = p.indexOf("/0/"); p = i >= 0 ? p.substring(i + 3) : p;
                            p = p.substring(0, p.lastIndexOf('/') + 1);
                        }
                        o.put("path", p);
                        out.put(o);
                    } catch (Exception e) { }
                }
                emit("scan", out.toString());
            } catch (Throwable t) {
                emit("scan", "{\"err\":" + JSONObject.quote(t.getMessage() == null ? "Lecture impossible" : t.getMessage()) + "}");
            }
        } }).start();
    }
    private static String str(Cursor c, int i) { try { String s = c.getString(i); return s == null ? "" : s; } catch (Exception e) { return ""; } }

    /** Miniatures en data:image/jpeg (la WebView n'affiche pas content://). ids : "[12,34]". Événement « thumb » {id, w, data} par vidéo */
    @JavascriptInterface public void thumbs(final String idsJson, final int width) {
        used = true;
        if (thumbExec == null) thumbExec = Executors.newSingleThreadExecutor();
        final int w = Math.max(96, Math.min(640, width));
        thumbExec.execute(new Runnable() { public void run() {
            JSONArray ids;
            try { ids = new JSONArray(idsJson); } catch (Exception e) { return; }
            for (int i = 0; i < ids.length(); i++) {
                long id = ids.optLong(i, -1);
                if (id < 0) continue;
                String d = thumb(id, w);
                try { JSONObject o = new JSONObject(); o.put("id", id); o.put("w", w); o.put("data", d); emit("thumb", o.toString()); } catch (Exception e) { }
            }
        } });
    }

    private String thumb(long id, int w) {
        File dir = new File(a.getCacheDir(), "ecran-thumbs");
        File f = new File(dir, id + "_" + w + ".jpg");
        try {
            byte[] b;
            if (f.exists() && f.length() > 0 && System.currentTimeMillis() - f.lastModified() < 30L * 86400000L) {
                try (FileInputStream in = new FileInputStream(f)) { b = readAll(in); }
            } else {
                Bitmap bm;
                Uri u = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id);
                if (Build.VERSION.SDK_INT >= 29) bm = a.getContentResolver().loadThumbnail(u, new android.util.Size(w, w * 9 / 16 + 1), null);
                else bm = MediaStore.Video.Thumbnails.getThumbnail(a.getContentResolver(), id, MediaStore.Video.Thumbnails.MINI_KIND, null);
                if (bm == null) return "";
                if (bm.getWidth() > w) {
                    Bitmap s = Bitmap.createScaledBitmap(bm, w, Math.max(1, bm.getHeight() * w / bm.getWidth()), true);
                    if (s != bm) bm.recycle();
                    bm = s;
                }
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                bm.compress(Bitmap.CompressFormat.JPEG, 74, bo);
                bm.recycle();
                b = bo.toByteArray();
                try { dir.mkdirs(); try (FileOutputStream o = new FileOutputStream(f)) { o.write(b); } } catch (Exception e) { }
            }
            return "data:image/jpeg;base64," + Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Throwable t) { return ""; }
    }
    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toByteArray();
    }

    // ---------- Lecture (activité native EcranPlayer) ----------
    /** list : [{url, title, sub, id, thumb?, srt?, lid?}] ; lance la lecture plein écran à l'index donné */
    @JavascriptInterface public boolean play(final String listJson, final int index) {
        used = true;
        try {
            JSONArray in = new JSONArray(listJson), l = new JSONArray();
            for (int i = 0; i < in.length(); i++) {
                JSONObject o = in.getJSONObject(i);
                String u = o.optString("url", "");
                if (u.isEmpty() || noStream(u)) continue;
                if (o.optString("thumb", "").startsWith("data:")) o.remove("thumb");   // trop lourd pour les préférences
                l.put(o);
            }
            if (l.length() == 0) { toast("Rien à lire"); return false; }
            final int idx = Math.max(0, Math.min(l.length() - 1, index - (in.length() - l.length() > 0 ? countSkipped(in, index) : 0)));
            final String lj = l.toString();
            current = new java.lang.ref.WeakReference<EcranBridge>(this);
            a.runOnUiThread(new Runnable() { public void run() {
                try {
                    // Par son nom : ce pont est copié dans toutes les applis, EcranPlayer seulement dans Écran
                    Intent i = new Intent().setClassName(a, EcranBridge.class.getPackage().getName() + ".EcranPlayer").putExtra("list", lj).putExtra("index", idx);
                    a.startActivity(i);
                } catch (Throwable t) { toast("Lecteur indisponible"); }
            } });
            return true;
        } catch (Throwable t) { toast("Liste de lecture invalide"); return false; }
    }
    private static int countSkipped(JSONArray in, int upTo) {
        int n = 0;
        for (int i = 0; i < Math.min(upTo, in.length()); i++) { String u = in.optJSONObject(i) == null ? "" : in.optJSONObject(i).optString("url", ""); if (u.isEmpty() || noStream(u)) n++; }
        return n;
    }

    /** Relance la dernière vidéo (tuile Socle) ; false s'il n'y en a pas */
    @JavascriptInterface public boolean resume() {
        try {
            JSONObject last = new JSONObject(a.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("last", "{}"));
            if (!last.has("list")) return false;
            return play(last.getJSONArray("list").toString(), last.optInt("index", 0));
        } catch (Throwable t) { return false; }
    }

    /** Dernière vidéo lue : {item, pos, dur, at} ou {} */
    @JavascriptInterface public String last() {
        try {
            SharedPreferences p = a.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject last = new JSONObject(p.getString("last", "{}"));
            if (!last.has("list")) return "{}";
            JSONObject it = last.getJSONArray("list").getJSONObject(last.optInt("index", 0));
            JSONObject o = new JSONObject();
            o.put("item", it);
            JSONObject pos = new JSONObject(p.getString("p:" + it.optString("id", it.optString("url")), "{}"));
            o.put("pos", pos.optLong("pos", 0)); o.put("dur", pos.optLong("dur", 0)); o.put("at", pos.optLong("at", 0)); o.put("done", pos.optBoolean("done", false));
            return o.toString();
        } catch (Throwable t) { return "{}"; }
    }

    /** Positions de lecture mémorisées : {id: {pos, dur, at, done, item}} (millisecondes) */
    @JavascriptInterface public String positions() {
        JSONObject out = new JSONObject();
        try {
            for (Map.Entry<String, ?> e : a.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getAll().entrySet()) {
                if (!e.getKey().startsWith("p:") || !(e.getValue() instanceof String)) continue;
                try { out.put(e.getKey().substring(2), new JSONObject((String) e.getValue())); } catch (Exception x) { }
            }
        } catch (Throwable t) { }
        return out.toString();
    }

    @JavascriptInterface public void forget(String id) {
        a.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("p:" + id).apply();
    }

    // ---------- Applis officielles ----------
    /** Ouvre une vidéo YouTube dans l'appli YouTube officielle (ou le navigateur). Rien n'est lu ni téléchargé ici. */
    @JavascriptInterface public void openYouTube(final String videoId) {
        a.runOnUiThread(new Runnable() { public void run() {
            if (videoId == null || !videoId.matches("[A-Za-z0-9_-]{11}")) { toast("Vidéo introuvable"); return; }
            Uri u = Uri.parse("https://www.youtube.com/watch?v=" + videoId);
            Intent i = new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { a.startActivity(new Intent(i).setPackage("com.google.android.youtube")); }
            catch (ActivityNotFoundException e) { try { a.startActivity(i); } catch (Exception x) { toast("Aucune appli pour ouvrir YouTube"); } }
        } });
    }

    @JavascriptInterface public void openUrl(final String url) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { toast("Impossible d'ouvrir le lien"); }
        } });
    }

    /** Ouvre l'appli si elle est installée, sinon sa fiche Play Store (ou une recherche par nom si pkg est vide) */
    @JavascriptInterface public void openApp(final String pkg, final String name) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (pkg != null && !pkg.isEmpty()) {
                    Intent i = a.getPackageManager().getLaunchIntentForPackage(pkg);
                    if (i != null) { a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; }
                }
                store(pkg, name);
            } catch (Exception e) { toast("Impossible d'ouvrir " + (name == null ? "l'appli" : name)); }
        } });
    }

    /** Fiche Play Store */
    @JavascriptInterface public void openStore(final String pkg, final String name) {
        a.runOnUiThread(new Runnable() { public void run() { store(pkg, name); } });
    }
    private void store(String pkg, String name) {
        boolean byId = pkg != null && !pkg.isEmpty();
        String q = byId ? "details?id=" + pkg : "search?q=" + Uri.encode(name == null ? "" : name) + "&c=apps";
        try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://" + q)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (Exception e) {
            try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/" + q)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (Exception x) { toast("Play Store indisponible"); }
        }
    }

    /** pkgs : ["a.b","c.d"] → {"a.b":true,...} */
    @JavascriptInterface public String installed(String pkgsJson) {
        JSONObject o = new JSONObject();
        try {
            JSONArray l = new JSONArray(pkgsJson);
            for (int i = 0; i < l.length(); i++) {
                String p = l.optString(i, "");
                boolean ok;
                try { a.getPackageManager().getPackageInfo(p, 0); ok = true; } catch (Exception e) { ok = false; }
                o.put(p, ok);
            }
        } catch (Throwable t) { }
        return o.toString();
    }

    @JavascriptInterface public void share(final String text) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Partager")); } catch (Exception e) { }
        } });
    }

    @JavascriptInterface public void toastMsg(String t) { toast(t); }

    private void toast(final String t) {
        a.runOnUiThread(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_LONG).show(); } });
    }

}
