package __PKG__;

// Liseuse : lecture de livres EPUB et PDF.
// Exposé en JavaScript sous window.MAGLiseuse. Aucun effet au chargement : la classe est présente dans toutes les applis,
// elle ne fait rien tant que la page Liseuse ne l'appelle pas (les intents « Ouvrir avec » ne sont traités qu'après un
// premier appel de la page : pending() ou cleanup()).
// Les fichiers (choisis, reçus ou téléchargés) sont copiés dans le cache de l'appli, puis lus par morceaux en base64
// avec readChunk() : la page les range ensuite dans IndexedDB et appelle release().
// Réseau limité au catalogue libre de droits : Project Gutenberg, Gutendex, Wikisource (et son outil d'export), Wiktionnaire.
//
// Lecture à voix haute (livre audio, page : lis-audio.js) :
//  - voix Piper : celles de Majordome, lues sans copie à travers son fournisseur protégé par signature
//    (content://fr.magformation13.majordome.voix, MajordomeBridge$Voix) ; la page synthétise (sherpa-onnx WASM) ;
//  - lecture native ici (classe Lecteur) : file de phrases déjà synthétisées (PCM, AudioTrack) ou de textes (voix du
//    système, TextToSpeech), quelques minutes d'avance ; la lecture continue écran éteint même si la WebView ralentit ;
//  - service au premier plan « mediaPlayback » (Lecture), MediaSession (notification, écran verrouillé, écouteurs
//    Bluetooth), navigation pour Android Auto (MediaBrowserService), focus audio (appel, autre appli),
//    pause quand les écouteurs sont débranchés, verrou de veille partiel pendant la lecture, minuterie de sommeil ;
//  - commandes sans ouvrir l'appli (Jarvis de Majordome, tuile Socle) : WidgetProvider.call « liseuse_audio ».

import android.app.Activity;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaDescription;
import android.media.MediaMetadata;
import android.media.browse.MediaBrowser;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.service.media.MediaBrowserService;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
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
    private static final int REQ_TREE = 6051;
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

    public LiseuseBridge(Activity a, WebView wv) {
        this.a = a; this.wv = wv;
        // Page Liseuse vivante : destinataire des événements du lecteur natif (seulement dans l'appli Liseuse)
        if (a.getPackageName().endsWith(".liseuse")) {
            live = this;
            try {
                a.getApplication().registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
                    public void onActivityDestroyed(Activity x) { if (x == LiseuseBridge.this.a && live == LiseuseBridge.this) live = null; }
                    public void onActivityCreated(Activity x, Bundle b) { } public void onActivityStarted(Activity x) { } public void onActivityResumed(Activity x) { }
                    public void onActivityPaused(Activity x) { } public void onActivityStopped(Activity x) { } public void onActivitySaveInstanceState(Activity x, Bundle b) { }
                });
            } catch (Throwable t) { }
        }
    }

    // ---------- Rappels de MainActivity ----------
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_TREE) { onTree(resultCode, data); return; }
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
                x.put("id", id); x.put("name", name); x.put("size", n); x.put("kind", kind); x.put("uri", u.toString());
                files.put(x);
            } catch (Throwable t) { errors.put(name); }
        }
        try { o.put("src", src); o.put("files", files); o.put("errors", errors); } catch (Exception e) { }
        return o;
    }

    // ---------- Dossiers suivis (sélecteur de dossiers d'Android : accès en lecture gardé, sans autorisation de stockage) ----------
    /** Choisir un dossier à suivre. Réponse : événement « folder » {uri, name} ou {cancel:true} */
    @JavascriptInterface public void pickFolder() {
        active = true;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                a.startActivityForResult(i, REQ_TREE);
            } catch (Exception e) { toast("Sélecteur de dossiers indisponible"); emit("folder", "{\"cancel\":true}"); }
        } });
    }
    private void onTree(int resultCode, Intent data) {
        JSONObject o = new JSONObject();
        try {
            Uri u = resultCode == Activity.RESULT_OK && data != null ? data.getData() : null;
            if (u == null) o.put("cancel", true);
            else {
                try { a.getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception e) { }
                o.put("uri", u.toString()); o.put("name", treeName(u));
            }
        } catch (Exception e) { }
        emit("folder", o.toString());
    }
    private String treeName(Uri t) {
        try {
            Uri d = DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
            try (Cursor c = a.getContentResolver().query(d, new String[]{ DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
            }
        } catch (Throwable e) { }
        String s = t.getLastPathSegment();
        if (s == null) return "Dossier";
        int k = s.lastIndexOf(':'); if (k >= 0 && k < s.length() - 1) s = s.substring(k + 1);
        int j = s.lastIndexOf('/'); return j >= 0 ? s.substring(j + 1) : s;
    }
    /** Oublie un dossier suivi (rend l'autorisation de lecture) */
    @JavascriptInterface public void forgetFolder(String uri) {
        try { a.getContentResolver().releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Throwable t) { }
    }
    /** Cherche les EPUB et PDF des dossiers suivis (sous-dossiers compris, 6 niveaux, 5000 éléments au plus par dossier).
     *  Réponse : événement « scan » {folders:[{uri, ok, err}], found:[{uri, name, size, mod}]} */
    @JavascriptInterface public void scanFolders(final String json) {
        active = true;
        new Thread(new Runnable() { public void run() {
            JSONObject o = new JSONObject();
            JSONArray found = new JSONArray(), st = new JSONArray();
            try {
                JSONArray l = new JSONArray(json == null || json.isEmpty() ? "[]" : json);
                for (int k = 0; k < l.length(); k++) {
                    String s = l.optString(k, "");
                    if (s.isEmpty()) continue;
                    JSONObject f = new JSONObject();
                    f.put("uri", s);
                    try {
                        Uri t = Uri.parse(s);
                        walk(t, DocumentsContract.getTreeDocumentId(t), 0, new int[]{ 5000 }, found);
                        f.put("ok", true);
                    } catch (SecurityException se) { f.put("ok", false); f.put("err", "perm"); }
                    catch (Throwable e) { f.put("ok", false); f.put("err", String.valueOf(e.getMessage())); }
                    st.put(f);
                }
                o.put("folders", st); o.put("found", found);
            } catch (Throwable t) { }
            emit("scan", o.toString());
        } }).start();
    }
    private void walk(Uri tree, String docId, int depth, int[] budget, JSONArray out) throws Exception {
        if (depth > 6 || budget[0] <= 0) return;
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        List<String> dirs = new ArrayList<String>();
        try (Cursor c = a.getContentResolver().query(kids, new String[]{ DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED }, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (--budget[0] <= 0) break;
                String id = c.getString(0), name = c.getString(1), mime = c.getString(2);
                if (id == null) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) { if (name == null || !name.startsWith(".")) dirs.add(id); continue; }
                String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
                if (!(n.endsWith(".epub") || n.endsWith(".pdf") || "application/epub+zip".equals(mime) || "application/pdf".equals(mime))) continue;
                JSONObject x = new JSONObject();
                x.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                x.put("name", name == null ? "livre" : name);
                x.put("size", c.isNull(3) ? 0 : c.getLong(3));
                x.put("mod", c.isNull(4) ? 0 : c.getLong(4));
                out.put(x);
            }
        }
        for (String d : dirs) walk(tree, d, depth + 1, budget, out);
    }
    /** Copie dans le cache des livres trouvés dans les dossiers suivis (liste JSON d'uri). Réponse : événement « files » (src « dir ») */
    @JavascriptInterface public void importUris(final String json) {
        active = true;
        final List<Uri> l = new ArrayList<Uri>();
        try { JSONArray j = new JSONArray(json); for (int k = 0; k < j.length(); k++) l.add(Uri.parse(j.getString(k))); } catch (Exception e) { }
        new Thread(new Runnable() { public void run() { emit("files", intake(l, "dir").toString()); } }).start();
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

    // =====================================================================
    // Voix Piper de Majordome : fournisseur protégé par signature (aucune seconde copie des 60 à 73 Mo)
    // =====================================================================
    static final String MAJ = "fr.magformation13.majordome", VOIX = "content://" + MAJ + ".voix";
    /** Base des fichiers des voix : la page la passe à Capacitor.convertFileSrc (route _capacitor_content_ → ContentResolver) */
    @JavascriptInterface public String voixDir() { return VOIX; }
    /** Voix installées dans Majordome : {"models":{modèle:{size, sha256, verified}}} ; {"absent":true} sans Majordome ; {"err"} sinon */
    @JavascriptInterface public String voixEtat() {
        active = true;
        try { a.getPackageManager().getPackageInfo(MAJ, 0); } catch (Throwable t) { return "{\"models\":{},\"absent\":true}"; }
        JSONObject ms = new JSONObject();
        try (Cursor c = a.getContentResolver().query(Uri.parse(VOIX + "/etat"), null, null, null, null)) {
            if (c == null) return "{\"models\":{},\"err\":\"Majordome doit être mis à jour\"}";
            JSONObject choix = null;
            while (c.moveToNext()) { try { if ("_choix".equals(c.getString(0))) choix = new JSONObject(c.getString(1)); else ms.put(c.getString(0), new JSONObject(c.getString(1))); } catch (Exception e) { } }
            JSONObject o = new JSONObject().put("models", ms); if (choix != null) o.put("choix", choix);   // {tts, piper} : voix choisie dans Majordome
            return o.toString();
        } catch (SecurityException se) { return "{\"models\":{},\"err\":\"accès refusé (applis signées différemment ?)\"}"; }
        catch (Throwable t) { return "{\"models\":{},\"err\":" + JSONObject.quote(String.valueOf(t.getMessage())) + "}"; }
    }

    // =====================================================================
    // Livre audio : API de la page (lis-audio.js)
    // =====================================================================
    static volatile LiseuseBridge live;
    static void toPage(String type, String json) { LiseuseBridge l = live; if (l != null && l.active) l.emit(type, json); }
    /** Ouvre la session de lecture (service au premier plan, MediaSession) : {book, title, author, chapter, cover} → "" ou "err:…" */
    @JavascriptInterface public String audioOpen(String json) { active = true; return Lecteur.open(a.getApplicationContext(), json); }
    @JavascriptInterface public void audioMeta(String json) { Lecteur.meta(a.getApplicationContext(), json); }
    /** Phrase synthétisée par la page : PCM 16 bits mono en base64 */
    @JavascriptInterface public void audioPush(String id, String b64, int sr, String meta) {
        byte[] b = Base64.decode(b64, Base64.DEFAULT); short[] pcm = new short[b.length / 2];
        java.nio.ByteBuffer.wrap(b).order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(pcm);
        Lecteur.push(new Item(id, pcm, Math.max(8000, Math.min(48000, sr)), null, 1f, meta));
    }
    /** Phrase à dire avec la voix du système (TextToSpeech) */
    @JavascriptInterface public void audioPushText(String id, String text, double rate, String meta) { Lecteur.push(new Item(id, null, 0, text, (float) Math.max(0.5, Math.min(2.5, rate)), meta)); }
    @JavascriptInterface public void audioPlay() { Lecteur.play(true); }
    @JavascriptInterface public void audioPause() { Lecteur.pause(false); }
    @JavascriptInterface public void audioSkip(int d) { Lecteur.skip(d); }
    @JavascriptInterface public void audioClear(boolean keepCurrent) { Lecteur.clear(keepCurrent); }
    @JavascriptInterface public void audioStop() { Lecteur.stop(false); }   // demandé par la page : pas d'événement en retour
    /** Minuterie : ms > 0 (durée) ; chap ≥ 0 (pause avant la première phrase d'un autre chapitre) ; 0 et -1 : annulée */
    @JavascriptInterface public void audioSleep(double ms, int chap) { Lecteur.sleep((long) ms, chap); }
    @JavascriptInterface public String audioState() { return Lecteur.state().toString(); }
    /** Dernière phrase commencée (mémorisée ici même si la page dormait) : {book, s, o, at} */
    @JavascriptInterface public String audioPos() { return Lecteur.prefs(a.getApplicationContext()).getString("pos", ""); }

    /** Commande venue d'une autre appli MAG (Jarvis de Majordome, tuile Socle) par WidgetProvider.call « liseuse_audio ».
     *  true : commande prise ici ; false : Liseuse doit être ouverte (l'appelant la lance avec l'action). */
    public static Object widgetCall(Context c, String method, String arg) {
        JSONObject o; try { o = new JSONObject(arg == null || arg.isEmpty() ? "{}" : arg); } catch (Exception e) { return false; }
        String cmd = o.optString("audio", "toggle"), title = o.optString("title", "");
        boolean open = Lecteur.isOpen(), fg = Lecteur.foreground, page = live != null && live.active;
        if ("pause".equals(cmd) || "stop".equals(cmd) || "next".equals(cmd) || "prev".equals(cmd) || "nextch".equals(cmd) || "prevch".equals(cmd) || "sleep".equals(cmd)) {
            if (!open) return false;
            if ("pause".equals(cmd)) { Lecteur.pause(false); return true; }
            if ("next".equals(cmd) || "prev".equals(cmd)) { Lecteur.skip("next".equals(cmd) ? 1 : -1); return true; }
            if ("sleep".equals(cmd)) { long ms = (long) (o.optDouble("min", 0) * 60000); if (o.optBoolean("chap")) { if (page) toPage("cmd", arg); else Lecteur.sleep(0, Lecteur.curSection()); } else Lecteur.sleep(ms, -1); toPage("audio", "{\"ev\":\"sleepset\",\"ms\":" + ms + "}"); return true; }
            if (page) { toPage("cmd", arg); return true; }
            if ("stop".equals(cmd)) { Lecteur.stop(); return true; }
            return false;
        }
        // lecture, reprise : seulement si le service tourne déjà au premier plan (Android interdit de le démarrer depuis l'arrière-plan)
        if (!open || !fg) return false;
        if (title.isEmpty() && Lecteur.hasQueue() && ("toggle".equals(cmd) || "resume".equals(cmd) || "play".equals(cmd) || "read".equals(cmd))) {
            if ("toggle".equals(cmd) && Lecteur.playing) Lecteur.pause(false); else Lecteur.play(true);
            return true;
        }
        if (page) { toPage("cmd", arg); return true; }
        return false;
    }

    /** Une phrase de la file : son (pcm) ou texte (voix du système) */
    static final class Item {
        final String id, text; final short[] pcm; final int sr; final float rate; JSONObject meta; int pos; long t0;
        Item(String id, short[] pcm, int sr, String text, float rate, String meta) {
            this.id = id; this.pcm = pcm; this.sr = sr; this.text = text; this.rate = rate;
            try { this.meta = new JSONObject(meta == null || meta.isEmpty() ? "{}" : meta); } catch (Exception e) { this.meta = new JSONObject(); }
        }
        double dur() { return pcm != null ? (double) (pcm.length - pos) / sr : Math.max(0.6, text.length() / (14.5 * rate)); }
        int section() { return meta.optInt("s", -1); }
    }

    // =====================================================================
    // Lecteur natif : file de phrases, fil de lecture, focus, session, notification
    // =====================================================================
    static final class Lecteur {
        static final Object L = new Object();
        static final java.util.ArrayDeque<Item> q = new java.util.ArrayDeque<>(), hist = new java.util.ArrayDeque<>();
        static Item cur; static volatile boolean playing, alive, foreground; static boolean focusPaused, emptySent;
        static Context app; static Thread th; static JSONObject meta = new JSONObject(); static Bitmap cover; static String coverSrc = "";
        static MediaSession session; static PowerManager.WakeLock wl; static Object focusReq; static boolean noisyOn;
        static long sleepAt; static int sleepChap = -1; static long pausedAt;
        static final Handler h = new Handler(Looper.getMainLooper());
        static TextToSpeech tts; static volatile int ttsState; static volatile String ttsDone = "";

        static SharedPreferences prefs(Context c) { return c.getSharedPreferences("liseuse_audio", Context.MODE_PRIVATE); }
        static boolean isOpen() { return alive; }
        static boolean hasQueue() { synchronized (L) { return cur != null || !q.isEmpty(); } }
        static int curSection() { synchronized (L) { return cur != null ? cur.section() : -1; } }
        static void ev(String json) { toPage("audio", json); }
        static void ev(String e, String id) { ev("{\"ev\":\"" + e + "\"" + (id != null ? ",\"id\":" + JSONObject.quote(id) : "") + "}"); }

        static String open(Context c, String json) {
            app = c.getApplicationContext();
            meta(c, json);
            synchronized (L) {
                alive = true;
                if (th == null || !th.isAlive()) { th = new Thread(new Runnable() { public void run() { loop(); } }, "liseuse-lecture"); th.start(); }
            }
            ensureSession(app);
            try {
                Intent i = new Intent(app, Lecture.class);
                if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(i); else app.startService(i);
                foreground = true;
            } catch (Throwable t) { return "err:Android refuse de démarrer la lecture en arrière-plan : " + t.getMessage(); }
            return "";
        }
        static void meta(Context c, String json) {
            try {
                JSONObject m = new JSONObject(json == null || json.isEmpty() ? "{}" : json);
                synchronized (L) { java.util.Iterator<String> k = m.keys(); while (k.hasNext()) { String n = k.next(); meta.put(n, m.get(n)); } }
                String cv = meta.optString("cover", "");
                if (!cv.equals(coverSrc)) { coverSrc = cv; cover = null; int k2 = cv.indexOf(","); if (k2 > 0) { byte[] b = Base64.decode(cv.substring(k2 + 1), Base64.DEFAULT); cover = BitmapFactory.decodeByteArray(b, 0, b.length); } }
            } catch (Throwable t) { }
            refresh();
        }
        static void push(Item it) {
            synchronized (L) { q.add(it); emptySent = false; L.notifyAll(); }
        }
        /** fromPage : la page relance elle-même la production ; sinon (notification, écouteurs, Auto) et file vide, on la lui demande */
        static void play(boolean fromPage) {
            synchronized (L) { if (!alive) return; playing = true; focusPaused = false; pausedAt = 0; L.notifyAll(); }
            focus(true); noisy(true); wake(true);
            if (!fromPage && !hasQueue()) ev("{\"ev\":\"cmd\",\"cmd\":\"play\",\"arg\":\"{\\\"audio\\\":\\\"resume\\\"}\"}");
            ev("playing", null); refresh(); keepForeground();
        }
        static void pause(boolean byFocus) {
            synchronized (L) { if (!playing) return; playing = false; focusPaused = byFocus; pausedAt = System.currentTimeMillis(); L.notifyAll(); }
            if (!byFocus) focus(false);
            noisy(false); wake(false); ev("paused", null); refresh();
            // pause longue : la notification reste, le service quitte le premier plan (Android peut alors arrêter l'appli)
            h.postDelayed(new Runnable() { public void run() { if (!playing && pausedAt > 0 && System.currentTimeMillis() - pausedAt >= 15 * 60000L) { Lecture s = Lecture.me; if (s != null) s.background(); } } }, 15 * 60000L + 500);
        }
        static void skip(int d) {
            synchronized (L) {
                if (d > 0) { if (cur != null) { Item it = cur; cur = null; hist.add(it); while (hist.size() > 3) hist.poll(); ev("end", it.id); } }
                else {
                    Item back = cur != null && System.currentTimeMillis() - cur.t0 < 2500 && !hist.isEmpty() ? hist.pollLast() : (cur == null && !hist.isEmpty() ? hist.pollLast() : null);
                    if (cur != null) { q.addFirst(cur); cur = null; }
                    if (back != null) q.addFirst(back);
                }
                L.notifyAll();
            }
        }
        static void clear(boolean keep) {
            synchronized (L) { q.clear(); if (!keep) { cur = null; hist.clear(); } emptySent = false; L.notifyAll(); }
        }
        static void stop() { stop(true); }
        /** notify : prévenir la page (arrêt venu de la notification, d'Android Auto, de Jarvis) */
        static void stop(boolean notify) {
            synchronized (L) { alive = false; playing = false; q.clear(); hist.clear(); cur = null; sleepAt = 0; sleepChap = -1; L.notifyAll(); }
            h.removeCallbacks(sleepRun);
            focus(false); noisy(false); wake(false);
            try { if (tts != null) tts.stop(); } catch (Throwable t) { }
            if (session != null) { session.setPlaybackState(new PlaybackState.Builder().setState(PlaybackState.STATE_STOPPED, 0, 1f).build()); session.setActive(false); }
            Lecture s = Lecture.me; if (s != null) s.finish();
            foreground = false;
            if (notify) ev("stopped", null);
        }
        static final Runnable sleepRun = new Runnable() { public void run() { sleepAt = 0; pause(false); ev("sleep", null); } };
        static void sleep(long ms, int chap) {
            h.removeCallbacks(sleepRun); sleepAt = 0;
            synchronized (L) { sleepChap = chap; }
            if (ms > 0) { sleepAt = System.currentTimeMillis() + ms; h.postDelayed(sleepRun, ms); }
        }
        static JSONObject state() {
            JSONObject o = new JSONObject();
            try {
                synchronized (L) {
                    double secs = 0; for (Item it : q) secs += it.dur(); if (cur != null) secs += cur.dur();
                    Item last = q.peekLast() != null ? q.peekLast() : cur;
                    o.put("open", alive).put("playing", playing).put("paused", alive && !playing).put("book", meta.optString("book", ""))
                     .put("cur", cur != null ? cur.meta : JSONObject.NULL).put("last", last != null ? last.meta : JSONObject.NULL)
                     .put("queued", Math.round(secs)).put("items", q.size() + (cur != null ? 1 : 0)).put("sleepAt", sleepAt).put("foreground", foreground);
                }
            } catch (Exception e) { }
            return o;
        }

        // ---- fil de lecture ----
        static void loop() {
            AudioTrack t = null; int trackSr = 0;
            try {
                while (true) {
                    Item it;
                    synchronized (L) {
                        while (alive && (!playing || (cur == null && q.isEmpty()))) {
                            if (playing && cur == null && q.isEmpty() && !emptySent) { emptySent = true; ev("empty", null); refresh(); }
                            try { L.wait(1000); } catch (InterruptedException e) { return; }
                        }
                        if (!alive) break;
                        if (cur == null) {
                            Item n = q.poll();
                            if (sleepChap >= 0 && n.section() >= 0 && n.section() != sleepChap) { q.addFirst(n); sleepChap = -1; h.post(new Runnable() { public void run() { pause(false); ev("sleep", null); } }); continue; }
                            cur = n; n.pos = 0; n.t0 = System.currentTimeMillis();
                            started(n);
                        }
                        it = cur;
                    }
                    if (it.pcm != null) {
                        if (t == null || trackSr != it.sr) {
                            if (t != null) { try { t.stop(); } catch (Throwable x) { } t.release(); }
                            int min = AudioTrack.getMinBufferSize(it.sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
                            t = new AudioTrack.Builder()
                                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(it.sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                                .setBufferSizeInBytes(Math.max(min, it.sr / 4 * 2)).setTransferMode(AudioTrack.MODE_STREAM).build();
                            trackSr = it.sr;
                        }
                        playPcm(t, it);
                    } else playText(it);
                }
            } catch (Throwable e) {
                android.util.Log.w("Liseuse", "lecture", e);
            } finally {
                if (t != null) { try { t.pause(); t.flush(); t.stop(); } catch (Throwable x) { } t.release(); }
                synchronized (L) { th = null; }
            }
        }
        static void started(Item n) {
            ev("start", n.id);
            try {
                JSONObject p = new JSONObject().put("book", meta.optString("book", "")).put("s", n.meta.optInt("s")).put("o", n.meta.optInt("o")).put("at", System.currentTimeMillis());
                prefs(app).edit().putString("pos", p.toString()).apply();
                String lab = n.meta.optString("label", "");
                if (!lab.isEmpty() && !lab.equals(meta.optString("chapter"))) { meta.put("chapter", lab); refresh(); }
            } catch (Exception e) { }
        }
        static boolean still(Item it) { synchronized (L) { return alive && cur == it; } }
        static void finished(Item it) {
            synchronized (L) { if (cur != it) return; cur = null; hist.add(it); while (hist.size() > 3) hist.poll(); }
            ev("end", it.id);
        }
        static void playPcm(AudioTrack t, Item it) {
            int frame = Math.max(1, it.sr / 50);
            if (t.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) t.play();
            long head0 = t.getPlaybackHeadPosition() & 0xffffffffL, written = 0;
            while (it.pos < it.pcm.length) {
                if (!still(it)) { t.pause(); t.flush(); return; }
                if (!playing) {
                    t.pause();
                    synchronized (L) { while (alive && !playing && cur == it) { try { L.wait(1000); } catch (InterruptedException e) { return; } } }
                    if (!still(it)) { t.flush(); return; }
                    t.play();
                }
                int n = Math.min(frame, it.pcm.length - it.pos);
                int w = t.write(it.pcm, it.pos, n);
                if (w < 0) break;
                it.pos += w; written += w;
            }
            long end = System.currentTimeMillis() + 4000;   // fin réelle du son (tête de lecture)
            while (still(it) && ((t.getPlaybackHeadPosition() & 0xffffffffL) - head0) < written && System.currentTimeMillis() < end) {
                if (!playing) { t.pause(); synchronized (L) { while (alive && !playing && cur == it) { try { L.wait(1000); } catch (InterruptedException e) { return; } } } if (!still(it)) { t.flush(); return; } t.play(); end = System.currentTimeMillis() + 4000; }
                try { Thread.sleep(15); } catch (InterruptedException e) { return; }
            }
            if (!still(it)) { t.pause(); t.flush(); return; }
            finished(it);
        }
        static void playText(final Item it) {
            if (!ttsReady()) { finished(it); return; }
            while (still(it)) {
                if (!playing) { synchronized (L) { while (alive && !playing && cur == it) { try { L.wait(1000); } catch (InterruptedException e) { return; } } } continue; }
                ttsDone = "";
                try { tts.setSpeechRate(it.rate); Bundle b = new Bundle(); b.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC); tts.speak(it.text, TextToSpeech.QUEUE_FLUSH, b, it.id); } catch (Throwable x) { finished(it); return; }
                long end = System.currentTimeMillis() + 8000 + (long) (it.text.length() * 160 / it.rate);
                while (still(it) && playing && !it.id.equals(ttsDone) && System.currentTimeMillis() < end) { try { Thread.sleep(40); } catch (InterruptedException e) { return; } }
                if (still(it) && playing) { finished(it); return; }
                try { tts.stop(); } catch (Throwable x) { }   // pause (la phrase reprendra au début) ou phrase passée
                if (!still(it)) return;
            }
        }
        static boolean ttsReady() {
            if (ttsState == 0) {
                ttsState = 1;
                h.post(new Runnable() { public void run() {
                    try {
                        tts = new TextToSpeech(app, new TextToSpeech.OnInitListener() { public void onInit(int st) {
                            if (st != TextToSpeech.SUCCESS) { ttsState = -1; return; }
                            try { int r = tts.setLanguage(Locale.FRANCE); if (r < 0) tts.setLanguage(Locale.FRENCH); } catch (Exception e) { }
                            try { tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()); } catch (Throwable t) { }
                            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                                public void onStart(String id) { }
                                public void onDone(String id) { ttsDone = id; }
                                @Deprecated public void onError(String id) { ttsDone = id; }
                            });
                            ttsState = 2;
                        } });
                    } catch (Throwable t) { ttsState = -1; }
                } });
            }
            long end = System.currentTimeMillis() + 6000;
            while (ttsState == 1 && System.currentTimeMillis() < end) { try { Thread.sleep(50); } catch (InterruptedException e) { return false; } }
            return ttsState == 2;
        }

        // ---- focus audio, écouteurs débranchés, veille ----
        static final AudioManager.OnAudioFocusChangeListener afl = new AudioManager.OnAudioFocusChangeListener() {
            public void onAudioFocusChange(int f) {
                if (f == AudioManager.AUDIOFOCUS_LOSS) pause(false);
                else if (f == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || f == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) { if (playing) pause(true); }   // appel, GPS, Majordome qui parle
                else if (f == AudioManager.AUDIOFOCUS_GAIN) { if (focusPaused && alive) play(true); }
            }
        };
        static void focus(boolean on) {
            if (app == null) return;
            try {
                AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
                if (Build.VERSION.SDK_INT >= 26) {
                    if (on) { if (focusReq == null) { AudioFocusRequest r = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setWillPauseWhenDucked(true).setOnAudioFocusChangeListener(afl, h).build(); focusReq = r; } am.requestAudioFocus((AudioFocusRequest) focusReq); }
                    else if (focusReq != null) { am.abandonAudioFocusRequest((AudioFocusRequest) focusReq); }
                } else { if (on) am.requestAudioFocus(afl, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN); else am.abandonAudioFocus(afl); }
            } catch (Throwable t) { }
        }
        static final BroadcastReceiver noisyRx = new BroadcastReceiver() { public void onReceive(Context c, Intent i) { if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) pause(false); } };
        static void noisy(boolean on) {
            if (app == null || on == noisyOn) return;
            try { if (on) app.registerReceiver(noisyRx, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY)); else app.unregisterReceiver(noisyRx); noisyOn = on; } catch (Throwable t) { }
        }
        static void wake(boolean on) {
            try {
                if (wl == null) { wl = ((PowerManager) app.getSystemService(Context.POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "liseuse:lecture"); wl.setReferenceCounted(false); }
                if (on) wl.acquire(4 * 3600 * 1000L); else if (wl.isHeld()) wl.release();
            } catch (Throwable t) { }
        }
        static void keepForeground() {
            if (foreground || app == null) return;
            try { Intent i = new Intent(app, Lecture.class); if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(i); else app.startService(i); foreground = true; } catch (Throwable t) { }
        }

        // ---- MediaSession : notification, écran verrouillé, écouteurs, Android Auto ----
        static final long ACTIONS = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
            | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_FAST_FORWARD | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_STOP | PlaybackState.ACTION_PLAY_FROM_MEDIA_ID;
        static void ensureSession(Context c) {
            if (session != null) return;
            app = c.getApplicationContext();
            session = new MediaSession(app, "Liseuse");
            session.setCallback(new MediaSession.Callback() {
                @Override public void onPlay() { command("play"); }
                @Override public void onPause() { command("pause"); }
                @Override public void onStop() { command("stop"); }
                @Override public void onSkipToNext() { command("next"); }
                @Override public void onSkipToPrevious() { command("prev"); }
                @Override public void onFastForward() { command("nextch"); }
                @Override public void onRewind() { command("prevch"); }
                @Override public void onCustomAction(String a, Bundle b) { command(a); }
                @Override public void onPlayFromMediaId(String id, Bundle b) { command("play"); }
            }, h);
            try { session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS); } catch (Throwable t) { }
            try { Intent li = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName()); if (li != null) session.setSessionActivity(PendingIntent.getActivity(app, 6060, li, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)); } catch (Throwable t) { }
        }
        /** Commandes de la notification, de l'écran verrouillé, des écouteurs, d'Android Auto */
        static void command(String c) {
            if ("play".equals(c)) {
                if (!alive) { reopen(); return; }
                play(false);
            }
            else if ("pause".equals(c)) pause(false);
            else if ("toggle".equals(c)) { if (playing) pause(false); else command("play"); }
            else if ("next".equals(c)) skip(1);
            else if ("prev".equals(c)) skip(-1);
            else if ("nextch".equals(c) || "prevch".equals(c)) {
                if (live != null && live.active) ev("{\"ev\":\"cmd\",\"cmd\":\"" + c + "\",\"arg\":\"{\\\"audio\\\":\\\"" + c + "\\\"}\"}");
                else if ("nextch".equals(c)) { synchronized (L) { int s = cur != null ? cur.section() : -1; while (!q.isEmpty() && q.peek().section() == s) q.poll(); if (cur != null) cur = null; L.notifyAll(); } }
            }
            else if ("stop".equals(c)) { if (live != null && live.active) ev("{\"ev\":\"cmd\",\"cmd\":\"stop\",\"arg\":\"{\\\"audio\\\":\\\"stop\\\"}\"}"); else stop(); }
        }
        /** Lecture demandée (Android Auto, écouteurs) alors que rien ne joue : la page doit produire la suite */
        static void reopen() {
            if (live != null && live.active) { ev("{\"ev\":\"cmd\",\"cmd\":\"play\",\"arg\":\"{\\\"audio\\\":\\\"read\\\"}\"}"); return; }
            try {   // Android peut refuser d'ouvrir une appli depuis l'arrière-plan : la session l'explique alors (Android Auto l'affiche)
                Intent li = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
                li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP).putExtra("socle", "{\"audio\":\"read\"}");
                app.startActivity(li);
            } catch (Throwable t) { }
            if (session != null) session.setPlaybackState(new PlaybackState.Builder().setActions(ACTIONS).setState(PlaybackState.STATE_ERROR, 0, 1f).setErrorMessage("Ouvrez Liseuse sur le téléphone pour lancer la lecture").build());
        }
        static final Runnable refreshRun = new Runnable() { public void run() { refreshNow(); } };
        static void refresh() { h.removeCallbacks(refreshRun); h.post(refreshRun); }
        static void refreshNow() {
            if (session == null || app == null) return;
            try {
                String title = meta.optString("title", "Liseuse"), chap = meta.optString("chapter", ""), author = meta.optString("author", "");
                MediaMetadata.Builder mb = new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, chap.isEmpty() ? title : chap)
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, title).putString(MediaMetadata.METADATA_KEY_ARTIST, author)
                    .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, chap.isEmpty() ? title : chap).putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, title + (author.isEmpty() ? "" : " · " + author));
                if (cover != null) mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, cover);
                session.setMetadata(mb.build());
                PlaybackState.Builder pb = new PlaybackState.Builder().setActions(ACTIONS)
                    .setState(playing ? (hasQueue() ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_BUFFERING) : alive ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_STOPPED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                    .addCustomAction(new PlaybackState.CustomAction.Builder("prevch", "Chapitre précédent", android.R.drawable.ic_media_rew).build())
                    .addCustomAction(new PlaybackState.CustomAction.Builder("nextch", "Chapitre suivant", android.R.drawable.ic_media_ff).build());
                session.setPlaybackState(pb.build());
                session.setActive(alive);
            } catch (Throwable t) { }
            Lecture s = Lecture.me; if (s != null) s.notif();
        }
    }

    /** Service au premier plan « lecture » : garde l'appli (et sa WebView) en vie écran éteint, porte la notification média ;
     *  c'est aussi le MediaBrowserService qu'Android Auto parcourt (livre en cours). */
    public static class Lecture extends MediaBrowserService {
        static volatile Lecture me;
        static final int NID = 6070; static final String CH = "lis_lecture";
        @Override public void onCreate() {
            super.onCreate(); me = this;
            Lecteur.ensureSession(this);
            setSessionToken(Lecteur.session.getSessionToken());
        }
        @Override public int onStartCommand(Intent i, int flags, int id) {
            String act = i != null ? i.getAction() : null;
            Lecteur.foreground = true; notif();   // démarré par startForegroundService : premier plan tout de suite
            if (act != null && act.startsWith("lis.")) Lecteur.command(act.substring(4));
            return START_NOT_STICKY;
        }
        @Override public IBinder onBind(Intent i) { return super.onBind(i); }
        @Override public void onTaskRemoved(Intent root) { if (!Lecteur.playing) Lecteur.stop(); }
        @Override public void onDestroy() { if (me == this) me = null; Lecteur.foreground = false; super.onDestroy(); }
        // Android Auto, contrôles multimédias du système : un seul élément, le livre en cours
        @Override public BrowserRoot onGetRoot(String pkg, int uid, Bundle hints) {
            if (pkg == null) return null;
            boolean ok = pkg.equals(getPackageName()) || pkg.equals("com.google.android.projection.gearhead") || pkg.equals("com.google.android.autosimulator")
                || pkg.equals("com.android.systemui") || pkg.equals("com.google.android.carassistant") || pkg.startsWith("fr.magformation13.");
            if (!ok) try { ok = getPackageManager().checkSignatures(uid, android.os.Process.myUid()) == android.content.pm.PackageManager.SIGNATURE_MATCH; } catch (Throwable t) { }
            return ok ? new BrowserRoot("racine", null) : null;
        }
        @Override public void onLoadChildren(String parent, Result<List<MediaBrowser.MediaItem>> result) {
            List<MediaBrowser.MediaItem> l = new ArrayList<>();
            String title = Lecteur.meta.optString("title", ""), author = Lecteur.meta.optString("author", "");
            if (title.isEmpty()) try {   // livre en cours publié pour Socle (WidgetProvider) quand la lecture n'a pas encore commencé
                JSONObject r = new JSONObject(getSharedPreferences("socle_widget", MODE_PRIVATE).getString("data", "{}")).optJSONObject("reading");
                if (r != null) { title = r.optString("title", ""); author = r.optString("author", ""); }
            } catch (Throwable t) { }
            if ("racine".equals(parent) && !title.isEmpty()) {
                MediaDescription.Builder d = new MediaDescription.Builder().setMediaId("reprendre").setTitle(title).setSubtitle((Lecteur.playing ? "En lecture" : "Reprendre la lecture") + (author.isEmpty() ? "" : " · " + author));
                if (Lecteur.cover != null) d.setIconBitmap(Lecteur.cover);
                l.add(new MediaBrowser.MediaItem(d.build(), MediaBrowser.MediaItem.FLAG_PLAYABLE));
            }
            result.sendResult(l);
        }
        void background() { try { if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_DETACH); else stopForeground(false); Lecteur.foreground = false; notif(); } catch (Throwable t) { } }
        void finish() { try { if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true); } catch (Throwable t) { } stopSelf(); }
        PendingIntent act(String a, int code) {
            Intent i = new Intent(this, Lecture.class).setAction("lis." + a);
            int f = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
            return Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(this, code, i, f) : PendingIntent.getService(this, code, i, f);
        }
        void notif() {
            try {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) { NotificationChannel ch = new NotificationChannel(CH, "Lecture à voix haute", NotificationManager.IMPORTANCE_LOW); ch.setShowBadge(false); nm.createNotificationChannel(ch); }
                JSONObject m = Lecteur.meta; String chap = m.optString("chapter", ""), title = m.optString("title", "Liseuse");
                Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
                b.setSmallIcon(getApplicationInfo().icon).setContentTitle(chap.isEmpty() ? title : chap).setContentText(title + (m.optString("author").isEmpty() ? "" : " · " + m.optString("author")))
                 .setOngoing(Lecteur.playing).setShowWhen(false).setVisibility(Notification.VISIBILITY_PUBLIC).setCategory(Notification.CATEGORY_TRANSPORT)
                 .setDeleteIntent(act("stop", 6079));
                if (Lecteur.cover != null) b.setLargeIcon(Lecteur.cover);
                if (Lecteur.session != null) b.setContentIntent(Lecteur.session.getController().getSessionActivity());
                b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_rew, "Chapitre précédent", act("prevch", 6071)).build());
                b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Phrase précédente", act("prev", 6072)).build());
                b.addAction(Lecteur.playing ? new Notification.Action.Builder(android.R.drawable.ic_media_pause, "Pause", act("pause", 6073)).build() : new Notification.Action.Builder(android.R.drawable.ic_media_play, "Lecture", act("play", 6074)).build());
                b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Phrase suivante", act("next", 6075)).build());
                b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_ff, "Chapitre suivant", act("nextch", 6076)).build());
                Notification.MediaStyle st = new Notification.MediaStyle().setShowActionsInCompactView(1, 2, 3);
                if (Lecteur.session != null) st.setMediaSession(Lecteur.session.getSessionToken());
                b.setStyle(st);
                Notification n = b.build();
                if (Lecteur.foreground || Lecteur.playing) {
                    if (Build.VERSION.SDK_INT >= 29) startForeground(NID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK); else startForeground(NID, n);
                    Lecteur.foreground = true;
                } else nm.notify(NID, n);
            } catch (Throwable t) { android.util.Log.w("Liseuse", "notification", t); }
        }
    }
}
