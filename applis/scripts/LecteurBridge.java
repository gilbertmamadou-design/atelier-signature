package __PKG__;

// Lecteur PDF : ouverture, lecture et enregistrement de documents PDF.
// Exposé en JavaScript sous window.MAGLecteur. Aucun effet au chargement : la classe est présente dans toutes les applis,
// elle ne fait rien tant que la page Lecteur ne l'appelle pas (les intents « Ouvrir avec » ne sont traités qu'après un
// premier appel de la page : pending() ou pick()).
//
// Sources d'un document (chaîne « src ») :
//  - « content://… » : document choisi avec le sélecteur d'Android, autorisation de lecture gardée
//    (takePersistableUriPermission) : on le relit à chaque ouverture, sans copie ;
//  - « local:<id> » : copie dans le stockage privé de l'appli (files/lecteur/<id>.pdf) quand l'autorisation
//    ne peut pas être gardée (pièce jointe d'un e-mail, « Ouvrir avec », « Partager »…).
// La page lit les octets par morceaux en base64 (open / read / close) : jamais de chaîne géante.
// Enregistrement : la page envoie le PDF produit par morceaux (outBegin / outChunk / outEnd) ; le fichier va dans
// Téléchargements/Lecteur PDF (nouveau fichier, jamais d'écrasement), ou dans un dossier choisi, ou part au partage
// ou à l'impression. Aucun accès réseau.
// Codes de requête : 6300 (choix de PDF), 6301 (« Enregistrer sous… »).

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class LecteurBridge {
    private static final int REQ_PICK = 6300, REQ_SAVE = 6301;
    private static final long MAX_FILE = 600L * 1024 * 1024;

    private final Activity a;
    private final WebView wv;
    private volatile boolean active = false;          // la page Lecteur s'est annoncée
    private Intent handledLaunch = null;

    // Documents ouverts en lecture (descripteur + canal positionnable)
    private static class H { ParcelFileDescriptor pfd; FileInputStream fis; RandomAccessFile raf; FileChannel ch; long size; File tmp; }
    private final Map<String, H> handles = new HashMap<String, H>();
    // Fichiers en cours d'écriture par la page
    private final Map<String, File> outs = new HashMap<String, File>();
    private File pendingSave = null; private String pendingSaveToken = null, pendingSaveName = null;
    private int seq = 0;

    private TextToSpeech tts;
    private volatile int ttsState = 0;                // 0 rien, 1 en cours d'init, 2 prêt, -1 indisponible
    private final List<String[]> ttsQueue = new ArrayList<String[]>();

    public LecteurBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Rappels de MainActivity ----------
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK) {
            final List<Uri> l = new ArrayList<Uri>();
            if (resultCode == Activity.RESULT_OK && data != null) {
                ClipData cd = data.getClipData();
                if (cd != null) for (int k = 0; k < cd.getItemCount(); k++) { Uri u = cd.getItemAt(k).getUri(); if (u != null) l.add(u); }
                else if (data.getData() != null) l.add(data.getData());
            }
            if (l.isEmpty()) { emit("files", "{\"src\":\"pick\",\"files\":[],\"cancel\":true}"); return; }
            new Thread(new Runnable() { public void run() { emit("files", intake(l, "pick", true).toString()); } }).start();
        } else if (requestCode == REQ_SAVE) {
            final File f = pendingSave; final String tok = pendingSaveToken, name = pendingSaveName;
            pendingSave = null; pendingSaveToken = null; pendingSaveName = null;
            if (f == null) return;
            if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) { f.delete(); emitOut(tok, "saveas", false, null, name, "Annulé"); return; }
            final Uri u = data.getData();
            new Thread(new Runnable() { public void run() {
                try {
                    copy(new FileInputStream(f), a.getContentResolver().openOutputStream(u, "w"));
                    try { a.getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Throwable t) { }
                    emitOut(tok, "saveas", true, u.toString(), displayName(u, name), null);
                } catch (Throwable t) { emitOut(tok, "saveas", false, null, name, msg(t)); }
                f.delete();
            } }).start();
        }
    }
    public void onPermissions(int requestCode) { }
    public void onResume() { if (active) emit("resume", "{}"); }
    public void onIntent(Intent i) {
        if (!active) return;
        final List<Uri> l = viewed(i);
        if (l.isEmpty()) return;
        try { i.setAction(Intent.ACTION_MAIN); } catch (Exception e) { }
        new Thread(new Runnable() { public void run() { emit("files", intake(l, "view", false).toString()); } }).start();
    }

    private void emit(final String type, final String json) {
        final String js = "window.lecteurEvent&&lecteurEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "{}" : json) + ")";
        a.runOnUiThread(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } } });
    }
    private void emitOut(String token, String mode, boolean ok, String uri, String name, String err) {
        try {
            JSONObject o = new JSONObject();
            o.put("token", token == null ? "" : token); o.put("mode", mode); o.put("ok", ok);
            if (uri != null) o.put("uri", uri);
            if (name != null) o.put("name", name);
            if (err != null) o.put("err", err);
            emit("out", o.toString());
        } catch (Exception e) { }
    }
    private static String msg(Throwable t) { return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage(); }

    // ---------- Dossiers ----------
    private File docsDir() { File d = new File(a.getFilesDir(), "lecteur"); if (!d.exists()) d.mkdirs(); return d; }
    private File tmpDir() { File d = new File(a.getCacheDir(), "lecteur"); if (!d.exists()) d.mkdirs(); return d; }
    private File localFile(String id) {
        if (id == null || !id.matches("[a-z0-9]{6,40}")) return null;
        return new File(docsDir(), id + ".pdf");
    }
    private static String newId() { return Long.toString(System.currentTimeMillis(), 36) + Integer.toString((int) (Math.random() * 1e6), 36); }
    private synchronized String tok(String p) { return p + (++seq) + Integer.toString((int) (Math.random() * 1e5), 36); }

    // ---------- Ouvrir ----------
    /** Ouvre le sélecteur de fichiers d'Android (plusieurs PDF à la fois). Réponse : événement « files ». */
    @JavascriptInterface public void pick() {
        active = true;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/pdf");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "application/pdf", "application/x-pdf" });
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                a.startActivityForResult(i, REQ_PICK);
            } catch (Exception e) { toast("Sélecteur de fichiers indisponible"); emit("files", "{\"src\":\"pick\",\"files\":[],\"cancel\":true}"); }
        } });
    }

    /** PDF reçu par « Ouvrir avec » / « Partager » au lancement : {"src":"view","files":[…]} ou "" (une seule fois). */
    @JavascriptInterface public String pending() {
        active = true;
        try {
            Intent i = a.getIntent();
            if (i == null || i == handledLaunch) return "";
            handledLaunch = i;
            List<Uri> l = viewed(i);
            if (l.isEmpty()) return "";
            i.setAction(Intent.ACTION_MAIN);   // pas de nouvel import au rechargement de la page
            return intake(l, "view", false).toString();
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
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) {
                ArrayList<Uri> us = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (us != null) l.addAll(us);
            }
        } catch (Throwable t) { }
        return l;
    }

    /** Garde l'autorisation de lecture si possible, sinon copie dans le stockage privé.
     *  Retourne {src, files:[{src, name, size, persist}], errors:[nom…]} */
    private JSONObject intake(List<Uri> l, String from, boolean tryPersist) {
        JSONObject o = new JSONObject();
        JSONArray files = new JSONArray(), errors = new JSONArray();
        ContentResolver cr = a.getContentResolver();
        for (Uri u : l) {
            String name = displayName(u, "document.pdf");
            try {
                if (!isPdf(u)) { errors.put(name + " (ce n'est pas un PDF)"); continue; }
                JSONObject x = new JSONObject();
                boolean kept = false;
                if ("content".equals(u.getScheme())) {
                    try { cr.takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION); kept = true; } catch (Throwable t) { kept = false; }
                    if (kept) {
                        // l'autorisation est là : vérifier qu'on relit bien le document
                        try (InputStream in = cr.openInputStream(u)) { if (in == null) kept = false; } catch (Throwable t) { kept = false; }
                    }
                }
                if (kept) {
                    x.put("src", u.toString()); x.put("persist", true); x.put("size", sizeOf(u));
                } else {
                    String id = newId();
                    File f = localFile(id);
                    long n = copy(cr.openInputStream(u), new FileOutputStream(f));
                    x.put("src", "local:" + id); x.put("persist", false); x.put("size", n);
                }
                x.put("name", name);
                files.put(x);
            } catch (Throwable t) { errors.put(name); }
        }
        try { o.put("src", from); o.put("files", files); o.put("errors", errors); } catch (Exception e) { }
        return o;
    }

    private boolean isPdf(Uri u) {
        try (InputStream in = a.getContentResolver().openInputStream(u)) {
            if (in == null) return false;
            byte[] b = new byte[1024]; int n = 0, r;
            while (n < b.length && (r = in.read(b, n, b.length - n)) > 0) n += r;
            String s = new String(b, 0, n, "ISO-8859-1");
            return s.contains("%PDF");
        } catch (Throwable t) { return false; }
    }

    private String displayName(Uri u, String def) {
        String n = null;
        try (Cursor c = a.getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) n = c.getString(0);
        } catch (Throwable t) { }
        if (n == null) n = u.getLastPathSegment();
        return n == null ? def : n;
    }
    private long sizeOf(Uri u) {
        try (Cursor c = a.getContentResolver().query(u, new String[]{ OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Throwable t) { }
        return -1;
    }

    private static long copy(InputStream in, OutputStream out) throws Exception {
        if (in == null) throw new Exception("illisible");
        long n = 0;
        try {
            byte[] buf = new byte[65536]; int r;
            while ((r = in.read(buf)) > 0) { out.write(buf, 0, r); n += r; if (n > MAX_FILE) throw new Exception("Fichier trop gros"); }
        } finally { try { in.close(); } catch (Exception e) { } out.close(); }
        return n;
    }

    // ---------- Lecture par morceaux ----------
    /** Ouvre un document : {"ok":true,"h":…,"size":…} ou {"ok":false,"err":"perm"|"missing"|message} */
    @JavascriptInterface public String open(String src) {
        active = true;
        JSONObject o = new JSONObject();
        H h = new H();
        try {
            if (src != null && src.startsWith("local:")) {
                File f = localFile(src.substring(6));
                if (f == null || !f.exists()) throw new java.io.FileNotFoundException();
                h.raf = new RandomAccessFile(f, "r"); h.ch = h.raf.getChannel(); h.size = h.raf.length();
            } else {
                Uri u = Uri.parse(src);
                boolean ok = false;
                try {
                    h.pfd = a.getContentResolver().openFileDescriptor(u, "r");
                    if (h.pfd != null) {
                        h.size = h.pfd.getStatSize();
                        h.fis = new FileInputStream(h.pfd.getFileDescriptor());
                        h.ch = h.fis.getChannel();
                        if (h.size > 0) { h.ch.read(ByteBuffer.allocate(8), 0); ok = true; }
                    }
                } catch (SecurityException se) { throw se; }
                catch (java.io.FileNotFoundException fe) { throw fe; }
                catch (Throwable t) { ok = false; }
                if (!ok) {
                    // flux non positionnable (certaines applis) : copie temporaire dans le cache
                    closeH(h); h = new H();
                    File tmp = new File(tmpDir(), "lecture-" + newId() + ".pdf");
                    copy(a.getContentResolver().openInputStream(u), new FileOutputStream(tmp));
                    h.tmp = tmp; h.raf = new RandomAccessFile(tmp, "r"); h.ch = h.raf.getChannel(); h.size = h.raf.length();
                }
            }
            String id = tok("h");
            synchronized (handles) { handles.put(id, h); }
            o.put("ok", true); o.put("h", id); o.put("size", h.size);
        } catch (SecurityException e) {
            closeH(h); try { o.put("ok", false); o.put("err", "perm"); } catch (Exception x) { }
        } catch (java.io.FileNotFoundException e) {
            closeH(h); try { o.put("ok", false); o.put("err", "missing"); } catch (Exception x) { }
        } catch (Throwable t) {
            closeH(h); try { o.put("ok", false); o.put("err", msg(t)); } catch (Exception x) { }
        }
        return o.toString();
    }

    /** Morceau d'un document ouvert, en base64 ("" à la fin ou en cas d'erreur) */
    @JavascriptInterface public String read(String hid, double offset, int len) {
        H h; synchronized (handles) { h = handles.get(hid); }
        if (h == null || h.ch == null) return "";
        len = Math.max(1, Math.min(len, 4 * 1024 * 1024));
        try {
            long off = (long) offset;
            if (off >= h.size) return "";
            ByteBuffer bb = ByteBuffer.allocate((int) Math.min(len, h.size - off));
            synchronized (h) {
                while (bb.hasRemaining()) { int r = h.ch.read(bb, off + bb.position()); if (r <= 0) break; }
            }
            return Base64.encodeToString(bb.array(), 0, bb.position(), Base64.NO_WRAP);
        } catch (Throwable t) { return ""; }
    }

    @JavascriptInterface public void close(String hid) {
        H h; synchronized (handles) { h = handles.remove(hid); }
        closeH(h);
    }
    private static void closeH(H h) {
        if (h == null) return;
        try { if (h.ch != null) h.ch.close(); } catch (Throwable t) { }
        try { if (h.fis != null) h.fis.close(); } catch (Throwable t) { }
        try { if (h.raf != null) h.raf.close(); } catch (Throwable t) { }
        try { if (h.pfd != null) h.pfd.close(); } catch (Throwable t) { }
        if (h.tmp != null) h.tmp.delete();
    }

    /** Retire un document de la liste : rend l'autorisation ou supprime la copie privée */
    @JavascriptInterface public void forget(String src) {
        if (src == null) return;
        try {
            if (src.startsWith("local:")) { File f = localFile(src.substring(6)); if (f != null) f.delete(); }
            else a.getContentResolver().releasePersistableUriPermission(Uri.parse(src), Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Throwable t) { }
    }

    /** Copies privées présentes (pour le ménage des copies orphelines) : ["local:…", …] */
    @JavascriptInterface public String locals() {
        JSONArray r = new JSONArray();
        File[] l = docsDir().listFiles();
        if (l != null) for (File f : l) { String n = f.getName(); if (n.endsWith(".pdf")) r.put("local:" + n.substring(0, n.length() - 4)); }
        return r.toString();
    }

    // ---------- Enregistrer, partager, imprimer ----------
    /** Début d'un fichier envoyé par la page : renvoie un jeton */
    @JavascriptInterface public String outBegin() {
        active = true;
        try {
            String t = tok("o");
            File f = new File(tmpDir(), "sortie-" + t + ".pdf");
            new FileOutputStream(f).close();
            synchronized (outs) { outs.put(t, f); }
            return t;
        } catch (Throwable t) { return ""; }
    }
    @JavascriptInterface public boolean outChunk(String token, String b64) {
        File f; synchronized (outs) { f = outs.get(token); }
        if (f == null) return false;
        try (FileOutputStream o = new FileOutputStream(f, true)) { o.write(Base64.decode(b64, Base64.DEFAULT)); return true; }
        catch (Throwable t) { return false; }
    }
    /** Fin : mode = download (Téléchargements/Lecteur PDF), saveas (choisir l'emplacement), share, print, view.
     *  Réponse : événement « out » {token, mode, ok, uri, name, err} */
    @JavascriptInterface public void outEnd(final String token, final String mode, final String name) {
        final File f; synchronized (outs) { f = outs.remove(token); }
        if (f == null) { emitOut(token, mode, false, null, name, "Fichier introuvable"); return; }
        deliver(f, safeName(name), mode, token);
    }
    @JavascriptInterface public void outCancel(String token) { File f; synchronized (outs) { f = outs.remove(token); } if (f != null) f.delete(); }

    /** Même chose avec le document d'origine (sans modification) */
    @JavascriptInterface public void srcAction(final String src, final String name, final String mode) {
        active = true;
        final String token = tok("s");
        new Thread(new Runnable() { public void run() {
            try {
                File f = new File(tmpDir(), "sortie-" + token + ".pdf");
                InputStream in;
                if (src.startsWith("local:")) { File lf = localFile(src.substring(6)); if (lf == null) throw new Exception("Fichier introuvable"); in = new FileInputStream(lf); }
                else in = a.getContentResolver().openInputStream(Uri.parse(src));
                copy(in, new FileOutputStream(f));
                deliver(f, safeName(name), mode, token);
            } catch (Throwable t) { emitOut(token, mode, false, null, name, msg(t)); }
        } }).start();
    }

    private static String safeName(String n) {
        if (n == null || n.trim().isEmpty()) n = "document.pdf";
        n = n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (!n.toLowerCase(Locale.ROOT).endsWith(".pdf")) n += ".pdf";
        if (n.length() > 120) n = n.substring(0, 116) + ".pdf";
        return n;
    }

    private void deliver(final File f, final String name, final String mode, final String token) {
        if ("saveas".equals(mode) || ("download".equals(mode) && Build.VERSION.SDK_INT < 29)) {
            a.runOnUiThread(new Runnable() { public void run() {
                try {
                    if (pendingSave != null) pendingSave.delete();
                    pendingSave = f; pendingSaveToken = token; pendingSaveName = name;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/pdf");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    a.startActivityForResult(i, REQ_SAVE);
                } catch (Throwable t) { f.delete(); pendingSave = null; emitOut(token, "saveas", false, null, name, "Enregistrement impossible sur cet appareil"); }
            } });
            return;
        }
        if ("download".equals(mode)) {
            new Thread(new Runnable() { public void run() {
                Uri u = null;
                try {
                    ContentResolver cr = a.getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Lecteur PDF");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    u = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) throw new Exception("Téléchargements indisponible");
                    copy(new FileInputStream(f), cr.openOutputStream(u, "w"));
                    ContentValues d = new ContentValues();
                    d.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    cr.update(u, d, null, null);
                    emitOut(token, "download", true, u.toString(), displayName(u, name), null);
                } catch (Throwable t) {
                    if (u != null) try { a.getContentResolver().delete(u, null, null); } catch (Throwable x) { }
                    emitOut(token, "download", false, null, name, msg(t));
                }
                f.delete();
            } }).start();
            return;
        }
        if ("print".equals(mode)) {
            a.runOnUiThread(new Runnable() { public void run() { print(f, name, token); } });
            return;
        }
        // share / view : copie lisible par l'autre appli (FileProvider, dossier cache/partage)
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                File dir = new File(a.getCacheDir(), "partage"); dir.mkdirs();
                File g = new File(dir, name);
                if (g.exists()) g.delete();
                if (!f.renameTo(g)) { copy(new FileInputStream(f), new FileOutputStream(g)); f.delete(); }
                Uri u = androidx.core.content.FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", g);
                Intent i;
                if ("view".equals(mode)) { i = new Intent(Intent.ACTION_VIEW); i.setDataAndType(u, "application/pdf"); }
                else { i = new Intent(Intent.ACTION_SEND); i.setType("application/pdf"); i.putExtra(Intent.EXTRA_STREAM, u); }
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                a.startActivity(Intent.createChooser(i, "view".equals(mode) ? "Ouvrir avec" : "Partager"));
                emitOut(token, mode, true, null, name, null);
            } catch (Throwable t) { f.delete(); emitOut(token, mode, false, null, name, msg(t)); }
        } });
    }

    private void print(final File f, final String name, String token) {
        try {
            PrintManager pm = (PrintManager) a.getSystemService(Activity.PRINT_SERVICE);
            pm.print(name, new PrintDocumentAdapter() {
                @Override public void onLayout(PrintAttributes oldA, PrintAttributes newA, android.os.CancellationSignal cs, LayoutResultCallback cb, Bundle extras) {
                    if (cs.isCanceled()) { cb.onLayoutCancelled(); return; }
                    cb.onLayoutFinished(new PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true);
                }
                @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor dest, android.os.CancellationSignal cs, WriteResultCallback cb) {
                    try {
                        copy(new FileInputStream(f), new FileOutputStream(dest.getFileDescriptor()));
                        cb.onWriteFinished(new PageRange[]{ PageRange.ALL_PAGES });
                    } catch (Throwable t) { cb.onWriteFailed(msg(t)); }
                }
                @Override public void onFinish() { f.delete(); }
            }, null);
            emitOut(token, "print", true, null, name, null);
        } catch (Throwable t) { f.delete(); emitOut(token, "print", false, null, name, "Impression impossible"); }
    }

    // ---------- Autres applis ----------
    @JavascriptInterface public boolean installed(String pkg) {
        try { return a.getPackageManager().getLaunchIntentForPackage(pkg) != null; } catch (Throwable t) { return false; }
    }
    @JavascriptInterface public boolean launch(final String pkg) {
        try {
            final Intent i = a.getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            a.runOnUiThread(new Runnable() { public void run() { try { a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Throwable t) { toast("Impossible d'ouvrir l'appli"); } } });
            return true;
        } catch (Throwable t) { return false; }
    }

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
        try { tts.setSpeechRate(rate); tts.speak(text, TextToSpeech.QUEUE_ADD, new Bundle(), id); }
        catch (Throwable t) { emit("tts", "{\"ev\":\"error\",\"id\":" + JSONObject.quote(id) + "}"); }
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

    // ---------- Divers ----------
    @JavascriptInterface public String version() { return "1"; }
    @JavascriptInterface public void toast(final String t) {
        a.runOnUiThread(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_LONG).show(); } });
    }
}
