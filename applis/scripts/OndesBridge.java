package __PKG__;

// Ondes : podcasts, musique libre (Internet Archive, ccMixter) et fichiers audio/vidéo par lien direct.
// Exposé en JavaScript sous window.MAGOndes. Aucun effet au chargement : rien ne se passe tant que la page n'appelle pas.
// Les sites qui interdisent le téléchargement (YouTube, Spotify, Deezer…) sont refusés.

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.Locale;

public class OndesBridge {
    private final Activity a;
    private final WebView wv;
    private String pendingShare = "";
    private static final String UA = "Mozilla/5.0 (Linux; Android 15) Ondes/1.0";
    private static final String[] BLOCKED = { "youtube.com", "youtu.be", "googlevideo.com", "spotify.com", "deezer.com", "music.apple.com",
        "tidal.com", "qobuz.com", "netflix.com", "primevideo.com", "disneyplus.com", "canalplus.com", "tiktok.com", "instagram.com",
        "facebook.com", "fb.watch", "twitch.tv", "dailymotion.com", "vimeo.com", "soundcloud.com", "napster.com", "amazon." };

    public OndesBridge(Activity a, WebView wv) {
        this.a = a; this.wv = wv;
        try { take(a.getIntent()); } catch (Exception e) { }
    }

    // ---------- Cycle de vie (appelé par MainActivity) ----------
    public void onIntent(Intent i) { if (take(i)) emit("share", pendingShare); }
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) { }
    public void onResume() { }

    private boolean take(Intent i) {
        if (i == null) return false;
        String t = null;
        if (Intent.ACTION_SEND.equals(i.getAction())) t = i.getStringExtra(Intent.EXTRA_TEXT);
        else if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null && "http".equals(scheme(i.getData()))) t = i.getData().toString();
        if (t == null || t.trim().isEmpty()) return false;
        pendingShare = t.trim();
        return true;
    }
    private static String scheme(Uri u) { String s = u.getScheme(); return s != null && s.startsWith("http") ? "http" : ""; }

    private void emit(final String type, final String data) {
        final String js = "window.ondesEvent&&ondesEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(data == null ? "" : data) + ")";
        a.runOnUiThread(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } } });
    }

    static boolean blocked(String url) {
        try {
            String h = Uri.parse(url).getHost();
            if (h == null) return false;
            h = h.toLowerCase(Locale.ROOT);
            for (String b : BLOCKED) if (h.equals(b) || h.endsWith("." + b) || (b.endsWith(".") && h.contains(b))) return true;
        } catch (Exception e) { }
        return false;
    }

    // ---------- Réseau ----------
    private static HttpURLConnection open(String url, String method) throws Exception {
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000); c.setReadTimeout(30000);
            c.setRequestMethod(method);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new Exception("Redirection sans adresse");
                cur = new URL(new URL(cur), loc).toString();
                continue;
            }
            return c;
        }
        throw new Exception("Trop de redirections");
    }

    /** Télécharge une page ou un flux (RSS, JSON) : événement « fetch » {req, ok, status, body, url} */
    @JavascriptInterface public void fetch(final String req, final String url) {
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                o.put("req", req);
                HttpURLConnection c = open(url, "GET");
                int code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] buf = new byte[16384]; int n; long tot = 0;
                    while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); tot += n; if (tot > 12_000_000) break; }
                    in.close();
                }
                String cs = "UTF-8";
                String ct = c.getContentType();
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

    /** Vérifie un lien : type, taille, nom de fichier. Événement « probe » */
    @JavascriptInterface public void probe(final String req, final String url) {
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                o.put("req", req); o.put("url", url);
                if (blocked(url)) { o.put("ok", false); o.put("blocked", true); emit("probe", o.toString()); return; }
                HttpURLConnection c;
                try { c = open(url, "HEAD"); if (c.getResponseCode() >= 400) throw new Exception(); }
                catch (Exception e) { c = open(url, "GET"); }
                int code = c.getResponseCode();
                String type = c.getContentType() == null ? "" : c.getContentType().split(";")[0].trim().toLowerCase(Locale.ROOT);
                long size = c.getContentLengthLong();
                String finalUrl = c.getURL().toString();
                if (blocked(finalUrl)) { c.disconnect(); o.put("ok", false); o.put("blocked", true); emit("probe", o.toString()); return; }
                String name = fileName(c.getHeaderField("Content-Disposition"), finalUrl);
                if ((type.isEmpty() || type.equals("application/octet-stream") || type.equals("binary/octet-stream")) && name.contains(".")) {
                    String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT));
                    if (m != null) type = m;
                }
                c.disconnect();
                o.put("ok", code < 400); o.put("status", code); o.put("type", type); o.put("size", size); o.put("name", name); o.put("final", finalUrl);
            } catch (Throwable t) {
                try { o.put("ok", false); o.put("err", t.getMessage() == null ? "Lien injoignable" : t.getMessage()); } catch (Exception e) { }
            }
            emit("probe", o.toString());
        } }).start();
    }

    private static String fileName(String cd, String url) {
        try {
            if (cd != null) {
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("filename\\*?=(?:UTF-8'')?\"?([^\";]+)\"?", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(cd);
                if (m.find()) return Uri.decode(m.group(1)).trim();
            }
            String p = Uri.parse(url).getLastPathSegment();
            if (p != null && !p.isEmpty()) return Uri.decode(p);
        } catch (Exception e) { }
        return "fichier";
    }

    // ---------- Téléchargements (gestionnaire de téléchargements d'Android) ----------
    private SharedPreferences prefs() { return a.getSharedPreferences("ondes", Context.MODE_PRIVATE); }
    private DownloadManager dm() { return (DownloadManager) a.getSystemService(Context.DOWNLOAD_SERVICE); }

    /** kind : music | podcast | video. Retourne {ok, id} ou {ok:false, err} */
    @JavascriptInterface public String download(String url, String name, String kind, String title, String meta) {
        try {
            if (blocked(url)) return "{\"ok\":false,\"err\":\"Ce site ne permet pas le téléchargement\"}";
            String safe = name == null ? "fichier" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
            if (safe.length() > 120) safe = safe.substring(0, 120);
            if (safe.isEmpty()) safe = "fichier";
            String dir = "video".equals(kind) ? Environment.DIRECTORY_MOVIES : "podcast".equals(kind) ? Environment.DIRECTORY_PODCASTS : Environment.DIRECTORY_MUSIC;
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setTitle(title == null || title.isEmpty() ? safe : title);
            r.setDescription("Ondes");
            r.addRequestHeader("User-Agent", UA);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(dir, "Ondes/" + safe);
            String ext = safe.contains(".") ? safe.substring(safe.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if (mime != null) r.setMimeType(mime);
            if (android.os.Build.VERSION.SDK_INT < 29) { try { r.allowScanningByMediaScanner(); } catch (Exception e) { } }
            long id = dm().enqueue(r);
            JSONArray l = list();
            JSONObject o = new JSONObject();
            o.put("id", id); o.put("title", title); o.put("name", safe); o.put("kind", kind); o.put("at", System.currentTimeMillis());
            try { o.put("meta", meta == null || meta.isEmpty() ? new JSONObject() : new JSONObject(meta)); } catch (Exception e) { o.put("meta", new JSONObject()); }
            l.put(o);
            prefs().edit().putString("list", l.toString()).apply();
            return "{\"ok\":true,\"id\":" + id + "}";
        } catch (Throwable t) {
            return "{\"ok\":false,\"err\":" + JSONObject.quote(t.getMessage() == null ? "Téléchargement impossible" : t.getMessage()) + "}";
        }
    }

    private JSONArray list() {
        try { return new JSONArray(prefs().getString("list", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    /** État de tous les téléchargements d'Ondes (du plus récent au plus ancien) */
    @JavascriptInterface public String downloads() {
        JSONArray out = new JSONArray(), keep = new JSONArray();
        try {
            JSONArray l = list();
            if (l.length() == 0) return "[]";
            long[] ids = new long[l.length()];
            for (int i = 0; i < l.length(); i++) ids[i] = l.getJSONObject(i).getLong("id");
            java.util.HashMap<Long, JSONObject> st = new java.util.HashMap<>();
            try (Cursor c = dm().query(new DownloadManager.Query().setFilterById(ids))) {
                while (c != null && c.moveToNext()) {
                    JSONObject s = new JSONObject();
                    long id = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_ID));
                    int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    s.put("status", status == DownloadManager.STATUS_SUCCESSFUL ? "done" : status == DownloadManager.STATUS_FAILED ? "failed" : status == DownloadManager.STATUS_PAUSED ? "paused" : "running");
                    s.put("got", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
                    s.put("total", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
                    s.put("reason", c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)));
                    st.put(id, s);
                }
            }
            for (int i = l.length() - 1; i >= 0; i--) {
                JSONObject o = l.getJSONObject(i);
                JSONObject s = st.get(o.getLong("id"));
                if (s == null) continue;   // supprimé ailleurs : on l'oublie
                keep.put(o);
                JSONObject r = new JSONObject(o.toString());
                java.util.Iterator<String> it = s.keys();
                while (it.hasNext()) { String k = it.next(); r.put(k, s.get(k)); }
                out.put(r);
            }
            if (keep.length() != l.length()) {
                JSONArray asc = new JSONArray();
                for (int i = keep.length() - 1; i >= 0; i--) asc.put(keep.get(i));
                prefs().edit().putString("list", asc.toString()).apply();
            }
        } catch (Throwable t) { }
        return out.toString();
    }

    /** Ouvre un fichier téléchargé (lecteur audio/vidéo du téléphone, Mélodie, Galerie…) */
    @JavascriptInterface public void openDownload(final double idD) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                long id = (long) idD;
                Uri u = dm().getUriForDownloadedFile(id);
                if (u == null) { toast("Fichier introuvable"); return; }
                String mime = dm().getMimeTypeForDownloadedFile(id);
                Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(u, mime == null ? "audio/*" : mime);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                a.startActivity(Intent.createChooser(i, "Ouvrir avec"));
            } catch (Exception e) { toast("Aucune appli pour lire ce fichier"); }
        } });
    }

    /** Supprime le téléchargement et son fichier */
    @JavascriptInterface public boolean removeDownload(double idD) {
        try {
            long id = (long) idD;
            dm().remove(id);
            JSONArray l = list(), k = new JSONArray();
            for (int i = 0; i < l.length(); i++) if (l.getJSONObject(i).getLong("id") != id) k.put(l.get(i));
            prefs().edit().putString("list", k.toString()).apply();
            return true;
        } catch (Throwable t) { return false; }
    }

    // ---------- Divers ----------
    @JavascriptInterface public String pending() { String s = pendingShare; pendingShare = ""; return s; }
    @JavascriptInterface public boolean isBlocked(String url) { return blocked(url); }

    @JavascriptInterface public void openUrl(final String url) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { toast("Impossible d'ouvrir le lien"); }
        } });
    }

    @JavascriptInterface public void share(final String text) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Partager")); } catch (Exception e) { }
        } });
    }

    @JavascriptInterface public void openApp(final String pkg) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { Intent i = a.getPackageManager().getLaunchIntentForPackage(pkg); if (i == null) { toast("Appli non installée"); return; } i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); a.startActivity(i); } catch (Exception e) { }
        } });
    }

    @JavascriptInterface public boolean installed(String pkg) {
        try { a.getPackageManager().getPackageInfo(pkg, 0); return true; } catch (Exception e) { return false; }
    }

    private void toast(final String t) {
        a.runOnUiThread(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_LONG).show(); } });
    }
}
