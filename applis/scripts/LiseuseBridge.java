package __PKG__;

// Liseuse : lecture de livres EPUB et PDF.
// Exposé en JavaScript sous window.MAGLiseuse. Aucun effet au chargement : la classe est présente dans toutes les applis,
// elle ne fait rien tant que la page Liseuse ne l'appelle pas (les intents « Ouvrir avec » ne sont traités qu'après un
// premier appel de la page : pending() ou cleanup()).
// Les fichiers (choisis, reçus ou téléchargés) sont copiés dans le cache de l'appli, puis lus par morceaux en base64
// avec readChunk() : la page les range ensuite dans IndexedDB et appelle release().
// Réseau limité au catalogue libre de droits : Project Gutenberg, Gutendex, Wikisource (et son outil d'export), Wiktionnaire.

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class LiseuseBridge {
    private static final int REQ_PICK = 6050;
    private static final long MAX_FILE = 400L * 1024 * 1024;
    private static final String UA = "Mozilla/5.0 (Linux; Android 15) Liseuse/1.0";
    private static final String[] HOSTS = { "gutendex.com", "gutenberg.org", "gutenberg.pglaf.org", "pglaf.org",
        "ws-export.wmcloud.org", "fr.wikisource.org", "fr.wiktionary.org" };

    private final Activity a;
    private final WebView wv;
    private volatile boolean active = false;          // la page Liseuse s'est annoncée
    private Intent handledLaunch = null;
    private final Set<String> cancelled = java.util.Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());
    private TextToSpeech tts;
    private volatile int ttsState = 0;                // 0 rien, 1 en cours d'init, 2 prêt, -1 indisponible
    private final List<String[]> ttsQueue = new ArrayList<String[]>();

    public LiseuseBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Rappels de MainActivity ----------
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_PICK) return;
        final List<Uri> l = new ArrayList<Uri>();
        if (resultCode == Activity.RESULT_OK && data != null) {
            ClipData cd = data.getClipData();
            if (cd != null) for (int k = 0; k < cd.getItemCount(); k++) { Uri u = cd.getItemAt(k).getUri(); if (u != null) l.add(u); }
            else if (data.getData() != null) l.add(data.getData());
        }
        if (l.isEmpty()) { emit("files", "{\"src\":\"pick\",\"files\":[],\"cancel\":true}"); return; }
        new Thread(new Runnable() { public void run() { emit("files", intake(l, "pick").toString()); } }).start();
    }
    public void onPermissions(int requestCode) { }
    public void onResume() { if (active) emit("resume", "{}"); }
    public void onIntent(Intent i) {
        if (!active) return;
        final List<Uri> l = viewed(i);
        if (l.isEmpty()) return;
        try { i.setAction(Intent.ACTION_MAIN); } catch (Exception e) { }
        new Thread(new Runnable() { public void run() { emit("files", intake(l, "view").toString()); } }).start();
    }

    private void emit(final String type, final String json) {
        final String js = "window.liseuseEvent&&liseuseEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "{}" : json) + ")";
        a.runOnUiThread(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } } });
    }

    // ---------- Fichiers ----------
    private File dir() { File d = new File(a.getCacheDir(), "liseuse"); if (!d.exists()) d.mkdirs(); return d; }
    private File fileOf(String id) {
        if (id == null || !id.matches("[a-z0-9]{6,40}")) return null;
        return new File(dir(), id + ".bin");
    }
    private static String newId() { return Long.toString(System.currentTimeMillis(), 36) + Integer.toString((int) (Math.random() * 1e6), 36); }

    /** Ouvre le sélecteur de fichiers d'Android (plusieurs livres à la fois). Réponse : événement « files ». */
    @JavascriptInterface public void pick() {
        active = true;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "application/epub+zip", "application/pdf", "application/x-pdf", "application/zip", "application/octet-stream" });
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                a.startActivityForResult(i, REQ_PICK);
            } catch (Exception e) { toast("Sélecteur de fichiers indisponible"); emit("files", "{\"src\":\"pick\",\"files\":[],\"cancel\":true}"); }
        } });
    }

    /** Livre reçu par « Ouvrir avec Liseuse » au lancement : {"src":"view","files":[…]} ou "" (une seule fois). */
    @JavascriptInterface public String pending() {
        active = true;
        try {
            Intent i = a.getIntent();
            if (i == null || i == handledLaunch) return "";
            handledLaunch = i;
            List<Uri> l = viewed(i);
            if (l.isEmpty()) return "";
            i.setAction(Intent.ACTION_MAIN);   // pas de nouvel import au rechargement de la page
            return intake(l, "view").toString();
        } catch (Throwable t) { return ""; }
    }

    private static List<Uri> viewed(Intent i) {
        List<Uri> l = new ArrayList<Uri>();
        if (i == null) return l;
        try {
            if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) {
                String s = i.getData().getScheme();
                if ("content".equals(s) || "file".equals(s)) l.add(i.getData());
            } else if (Intent.ACTION_SEND.equals(i.getAction())) {
                Uri u = (Uri) i.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) l.add(u);
            }
        } catch (Throwable t) { }
        return l;
    }

    /** Copie chaque document dans le cache. Retourne {src, files:[{id,name,size,kind}], errors:[nom…]} */
    private JSONObject intake(List<Uri> l, String src) {
        JSONObject o = new JSONObject();
        JSONArray files = new JSONArray(), errors = new JSONArray();
        for (Uri u : l) {
            String name = displayName(u);
            try {
                String id = newId();
                File f = fileOf(id);
                long n = 0;
                InputStream in = a.getContentResolver().openInputStream(u);
                if (in == null) throw new Exception("illisible");
                OutputStream out = new FileOutputStream(f);
                try {
                    byte[] buf = new byte[65536]; int r;
                    while ((r = in.read(buf)) > 0) { out.write(buf, 0, r); n += r; if (n > MAX_FILE) throw new Exception("trop gros"); }
                } finally { try { in.close(); } catch (Exception e) { } out.close(); }
                String kind = kindOf(f, name);
                if (kind.isEmpty()) { f.delete(); errors.put(name + " (ni EPUB ni PDF)"); continue; }
                JSONObject x = new JSONObject();
                x.put("id", id); x.put("name", name); x.put("size", n); x.put("kind", kind);
                files.put(x);
            } catch (Throwable t) { errors.put(name); }
        }
        try { o.put("src", src); o.put("files", files); o.put("errors", errors); } catch (Exception e) { }
        return o;
    }

    private String displayName(Uri u) {
        String n = null;
        try (Cursor c = a.getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) n = c.getString(0);
        } catch (Throwable t) { }
        if (n == null) n = u.getLastPathSegment();
        return n == null ? "livre" : n;
    }

    /** epub, pdf ou "" d'après les premiers octets */
    private static String kindOf(File f, String name) {
        byte[] h = new byte[4];
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) { if (r.read(h) < 4) return ""; } catch (Exception e) { return ""; }
        if (h[0] == '%' && h[1] == 'P' && h[2] == 'D' && h[3] == 'F') return "pdf";
        if (h[0] == 'P' && h[1] == 'K') return "epub";
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".pdf") && h[0] == '%') return "pdf";
        return "";
    }

    /** Lit un morceau d'un fichier du cache, en base64. "" à la fin ou en cas d'erreur. */
    @JavascriptInterface public String readChunk(String id, double offset, int len) {
        File f = fileOf(id);
        if (f == null || !f.exists()) return "";
        len = Math.max(1, Math.min(len, 4 * 1024 * 1024));
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            long off = (long) offset;
            if (off >= r.length()) return "";
            r.seek(off);
            byte[] b = new byte[(int) Math.min(len, r.length() - off)];
            r.readFully(b);
            return Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Throwable t) { return ""; }
    }

    /** Oublie un fichier du cache (après son rangement dans la bibliothèque) */
    @JavascriptInterface public boolean release(String id) { File f = fileOf(id); return f != null && f.delete(); }

    /** Supprime les fichiers du cache de plus de 6 heures */
    @JavascriptInterface public void cleanup() {
        active = true;
        new Thread(new Runnable() { public void run() {
            try {
                File[] l = dir().listFiles();
                long lim = System.currentTimeMillis() - 6L * 3600 * 1000;
                if (l != null) for (File f : l) if (f.lastModified() < lim) f.delete();
            } catch (Throwable t) { }
        } }).start();
    }

    // ---------- Réseau (catalogue libre de droits uniquement) ----------
    static boolean allowedUrl(String url) {
        try {
            Uri u = Uri.parse(url);
            if (!"https".equals(u.getScheme())) return false;
            String h = u.getHost();
            if (h == null) return false;
            h = h.toLowerCase(Locale.ROOT);
            for (String x : HOSTS) if (h.equals(x) || h.endsWith("." + x)) return true;
        } catch (Exception e) { }
        return false;
    }
    @JavascriptInterface public boolean allowed(String url) { return allowedUrl(url); }

    private static HttpURLConnection open(String url, int readTimeout) throws Exception {
        String cur = url;
        for (int hop = 0; hop < 8; hop++) {
            if (!allowedUrl(cur)) throw new Exception("Site non autorisé");
            HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000); c.setReadTimeout(readTimeout);
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

    /** Requête texte (JSON, OPDS, HTML) : événement « fetch » {req, ok, status, body, url, err} */
    @JavascriptInterface public void fetch(final String req, final String url) {
        active = true;
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            try {
                o.put("req", req);
                HttpURLConnection c = open(url, 30000);
                int code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] buf = new byte[16384]; int n; long tot = 0;
                    while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); tot += n; if (tot > 8_000_000) break; }
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

    /** Télécharge un livre dans le cache. Événements « progress » {req, got, total} puis « download » {req, ok, file:{id,name,size,kind}, err} */
    @JavascriptInterface public void download(final String req, final String url, final String name) {
        active = true;
        cancelled.remove(req);
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            File f = null;
            try {
                o.put("req", req);
                HttpURLConnection c = open(url, 180000);   // l'export Wikisource peut prendre une à deux minutes
                int code = c.getResponseCode();
                if (code >= 400) throw new Exception("Erreur du serveur (" + code + ")");
                long total = c.getContentLengthLong();
                String id = newId();
                f = fileOf(id);
                InputStream in = c.getInputStream();
                OutputStream out = new FileOutputStream(f);
                long got = 0, last = 0;
                try {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) {
                        if (cancelled.contains(req)) throw new Exception("Annulé");
                        out.write(buf, 0, n); got += n;
                        if (got > MAX_FILE) throw new Exception("Fichier trop gros");
                        long now = System.currentTimeMillis();
                        if (now - last > 300) { last = now; emit("progress", "{\"req\":" + JSONObject.quote(req) + ",\"got\":" + got + ",\"total\":" + total + "}"); }
                    }
                } finally { try { in.close(); } catch (Exception e) { } out.close(); c.disconnect(); }
                String kind = kindOf(f, name);
                if (kind.isEmpty()) { f.delete(); throw new Exception("Le serveur n'a pas renvoyé de livre"); }
                JSONObject x = new JSONObject();
                x.put("id", id); x.put("name", name == null ? "livre" : name); x.put("size", got); x.put("kind", kind);
                o.put("ok", true); o.put("file", x);
            } catch (Throwable t) {
                if (f != null) f.delete();
                try { o.put("ok", false); o.put("err", t.getMessage() == null ? "Pas de connexion" : t.getMessage()); } catch (Exception e) { }
            }
            cancelled.remove(req);
            emit("download", o.toString());
        } }).start();
    }

    @JavascriptInterface public void cancel(String req) { if (req != null) cancelled.add(req); }

    // ---------- Lecture à voix haute (synthèse vocale d'Android, phrase par phrase) ----------
    private void ttsInit() {
        if (ttsState != 0) return;
        ttsState = 1;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                tts = new TextToSpeech(a.getApplicationContext(), new TextToSpeech.OnInitListener() {
                    public void onInit(int status) {
                        if (status != TextToSpeech.SUCCESS) { ttsState = -1; emit("tts", "{\"ev\":\"unavailable\"}"); return; }
                        try { int r = tts.setLanguage(Locale.FRANCE); if (r < 0) tts.setLanguage(Locale.FRENCH); } catch (Exception e) { }
                        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            public void onStart(String id) { emit("tts", "{\"ev\":\"start\",\"id\":" + JSONObject.quote(id) + "}"); }
                            public void onDone(String id) { emit("tts", "{\"ev\":\"done\",\"id\":" + JSONObject.quote(id) + "}"); }
                            @Deprecated public void onError(String id) { emit("tts", "{\"ev\":\"error\",\"id\":" + JSONObject.quote(id) + "}"); }
                            @Override public void onStop(String id, boolean interrupted) { emit("tts", "{\"ev\":\"stop\",\"id\":" + JSONObject.quote(id) + "}"); }
                        });
                        ttsState = 2;
                        synchronized (ttsQueue) { for (String[] q : ttsQueue) say(q[0], q[1], Float.parseFloat(q[2])); ttsQueue.clear(); }
                    }
                });
            } catch (Throwable t) { ttsState = -1; emit("tts", "{\"ev\":\"unavailable\"}"); }
        } });
    }
    private void say(String id, String text, float rate) {
        try {
            tts.setSpeechRate(rate);
            Bundle b = new Bundle();
            tts.speak(text, TextToSpeech.QUEUE_ADD, b, id);
        } catch (Throwable t) { emit("tts", "{\"ev\":\"error\",\"id\":" + JSONObject.quote(id) + "}"); }
    }

    /** Ajoute une phrase à la file de lecture. Événements « tts » {ev: start|done|stop|error|unavailable, id} */
    @JavascriptInterface public void ttsSpeak(String id, String text, double rate) {
        active = true;
        float r = (float) Math.max(0.5, Math.min(2.5, rate <= 0 ? 1 : rate));
        if (ttsState == 2) { say(id, text, r); return; }
        if (ttsState == -1) { emit("tts", "{\"ev\":\"unavailable\"}"); return; }
        synchronized (ttsQueue) { ttsQueue.add(new String[]{ id, text, String.valueOf(r) }); }
        ttsInit();
    }
    @JavascriptInterface public void ttsStop() {
        synchronized (ttsQueue) { ttsQueue.clear(); }
        try { if (tts != null) tts.stop(); } catch (Throwable t) { }
    }
    @JavascriptInterface public void ttsPrepare() { active = true; ttsInit(); }

    // ---------- Divers ----------
    @JavascriptInterface public String version() { return "1"; }

    @JavascriptInterface public void share(final String text) {
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Partager")); } catch (Exception e) { }
        } });
    }

    /** Ouvre une page du catalogue (Gutenberg, Wikisource, Wiktionnaire) dans le navigateur */
    @JavascriptInterface public void openUrl(final String url) {
        if (!allowedUrl(url)) return;
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { toast("Impossible d'ouvrir le lien"); }
        } });
    }

    @JavascriptInterface public void toast(final String t) {
        a.runOnUiThread(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_LONG).show(); } });
    }
}
