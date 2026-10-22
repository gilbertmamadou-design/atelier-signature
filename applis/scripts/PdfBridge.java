package __PKG__;

// Atelier PDF : reconnaissance de texte hors ligne, mot de passe, fichiers reçus d'autres applis.
// Exposé en JavaScript sous window.MAGPdf. Constructeur sans effet : rien ne se passe tant que la page n'appelle pas le pont.
// Cette classe n'est copiée QUE dans l'appli « pdf » (print-patch.sh) : elle dépend de deux bibliothèques ajoutées pour elle seule :
//  - ML Kit Text Recognition, version embarquée (com.google.mlkit:text-recognition) : modèle latin dans l'APK,
//    fonctionne sans Google Play Services et sans réseau ;
//  - PDFBox-Android (com.tom-roush:pdfbox-android, Apache 2.0) : ajout / retrait d'un mot de passe (AES 256).
//
// Échanges de fichiers avec la page : jamais de chaîne géante.
//  - la page envoie des octets par morceaux base64 : begin() -> jeton, chunk(jeton, b64)… (fichier dans cache/atelier) ;
//  - les traitements longs (ocr, protect, unlock) tournent en arrière-plan et répondent par
//    window.pdfBridgeEvent({job, ok, …}) ; un PDF produit est lu par morceaux : read(jeton, début, longueur), puis drop(jeton).
//  - PDF reçus par « Partager » (ACTION_SEND / SEND_MULTIPLE, par ex. depuis Lecteur PDF) : pending() les copie
//    dans le cache et renvoie {files:[{token,name,size}]} ; à chaque nouvel envoi, window.atelierIncoming() est appelé.
// Aucun code de requête utilisé (plage réservée 6400–6409).

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Point;
import android.graphics.Rect;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission;
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException;
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class PdfBridge {
    private static final long MAX_IN = 300L * 1024 * 1024;

    private final Activity a;
    private final WebView wv;
    private TextRecognizer recognizer;
    private boolean pdfboxReady = false;
    private Intent handledLaunch = null;
    private final List<JSONObject> inbox = new ArrayList<JSONObject>();
    private final Map<String, File> files = new HashMap<String, File>();
    private int seq = 0;

    public PdfBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Rappels de MainActivity ----------
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) { }
    public void onResume() { }
    public void onIntent(final Intent i) {
        if (!isShare(i)) return;
        new Thread(new Runnable() { public void run() {
            int n = intake(i);
            if (n > 0) js("window.atelierIncoming&&atelierIncoming()");
        } }).start();
    }

    private void js(final String code) {
        a.runOnUiThread(new Runnable() { public void run() { try { wv.evaluateJavascript(code, null); } catch (Exception e) { } } });
    }
    private void emit(JSONObject o) { js("window.pdfBridgeEvent&&pdfBridgeEvent(" + JSONObject.quote(o.toString()) + ")"); }
    private void fail(String job, String err, String code) {
        try { JSONObject o = new JSONObject(); o.put("job", job); o.put("ok", false); o.put("err", err == null ? "erreur" : err); if (code != null) o.put("code", code); emit(o); } catch (Exception e) { }
    }
    private static String msg(Throwable t) { return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage(); }

    private File dir() { File d = new File(a.getCacheDir(), "atelier"); if (!d.exists()) d.mkdirs(); return d; }
    private synchronized String newToken(String p) {
        return p + (++seq) + Long.toString(System.nanoTime() % 1000000L, 36);
    }
    private synchronized File fileOf(String t) { return t == null ? null : files.get(t); }
    private synchronized String register(String prefix, File f) { String t = newToken(prefix); files.put(t, f); return t; }

    // ---------- Échange d'octets avec la page ----------
    @JavascriptInterface public String version() { return "1"; }

    /** Nouveau fichier vide à remplir par chunk(). */
    @JavascriptInterface public String begin() {
        try { String t = newToken("b"); File f = new File(dir(), "in-" + t); new FileOutputStream(f).close(); synchronized (this) { files.put(t, f); } return t; }
        catch (Exception e) { return ""; }
    }
    /** Ajoute un morceau (base64 d'un nombre d'octets multiple de 3, sauf le dernier). */
    @JavascriptInterface public boolean chunk(String token, String b64) {
        File f = fileOf(token); if (f == null) return false;
        try (FileOutputStream o = new FileOutputStream(f, true)) { o.write(Base64.decode(b64, Base64.DEFAULT)); return true; }
        catch (Exception e) { return false; }
    }
    @JavascriptInterface public double size(String token) { File f = fileOf(token); return f == null ? -1 : f.length(); }
    /** Lit un morceau du fichier « token » en base64 (chaîne vide à la fin). */
    @JavascriptInterface public String read(String token, double offset, int len) {
        File f = fileOf(token); if (f == null) return "";
        try (RandomAccessFile r = new RandomAccessFile(f, "r")) {
            long off = (long) offset; if (off >= r.length()) return "";
            int n = (int) Math.min((long) Math.max(1, Math.min(len, 4 * 1024 * 1024)), r.length() - off);
            byte[] b = new byte[n]; r.seek(off); r.readFully(b);
            return Base64.encodeToString(b, Base64.NO_WRAP);
        } catch (Exception e) { return ""; }
    }
    @JavascriptInterface public void drop(String token) { File f; synchronized (this) { f = files.remove(token); } if (f != null) f.delete(); }

    // ---------- Reconnaissance de texte (ML Kit, hors ligne) ----------
    @JavascriptInterface public boolean ocrReady() {
        try { Class.forName("com.google.mlkit.vision.text.latin.TextRecognizerOptions"); return true; } catch (Throwable t) { return false; }
    }
    /** Image (JPEG/PNG) envoyée par begin/chunk -> mots et lignes avec leurs coins, en pixels de l'image. */
    @JavascriptInterface public void ocr(final String token, final String job) {
        final File f = fileOf(token);
        if (f == null) { fail(job, "Image introuvable", null); return; }
        new Thread(new Runnable() { public void run() {
            final Bitmap bmp;
            try {
                BitmapFactory.Options op = new BitmapFactory.Options();
                op.inPreferredConfig = Bitmap.Config.ARGB_8888;
                bmp = BitmapFactory.decodeFile(f.getAbsolutePath(), op);
            } catch (Throwable t) { drop(token); fail(job, "Image illisible : " + msg(t), null); return; }
            drop(token);
            if (bmp == null) { fail(job, "Image illisible", null); return; }
            a.runOnUiThread(new Runnable() { public void run() {
                try {
                    if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
                    final int w = bmp.getWidth(), h = bmp.getHeight();
                    recognizer.process(InputImage.fromBitmap(bmp, 0))
                        .addOnSuccessListener(new OnSuccessListener<Text>() { public void onSuccess(final Text t) {
                            new Thread(new Runnable() { public void run() {
                                try {
                                    JSONObject o = new JSONObject();
                                    o.put("job", job); o.put("ok", true);
                                    JSONObject r = new JSONObject(); r.put("w", w); r.put("h", h);
                                    JSONArray blocks = new JSONArray();
                                    for (Text.TextBlock b : t.getTextBlocks()) {
                                        JSONArray lines = new JSONArray();
                                        for (Text.Line l : b.getLines()) {
                                            JSONObject lo = new JSONObject();
                                            lo.put("t", l.getText()); lo.put("p", pts(l.getCornerPoints(), l.getBoundingBox()));
                                            JSONArray words = new JSONArray();
                                            for (Text.Element e : l.getElements()) {
                                                JSONObject wo = new JSONObject();
                                                wo.put("t", e.getText()); wo.put("p", pts(e.getCornerPoints(), e.getBoundingBox()));
                                                words.put(wo);
                                            }
                                            lo.put("words", words);
                                            lines.put(lo);
                                        }
                                        JSONObject bo = new JSONObject(); bo.put("lines", lines); blocks.put(bo);
                                    }
                                    r.put("blocks", blocks);
                                    o.put("result", r);
                                    emit(o);
                                } catch (Throwable x) { fail(job, msg(x), null); }
                                bmp.recycle();
                            } }).start();
                        } })
                        .addOnFailureListener(new OnFailureListener() { public void onFailure(Exception e) { bmp.recycle(); fail(job, "Reconnaissance impossible : " + msg(e), null); } });
                } catch (Throwable t) { bmp.recycle(); fail(job, "Reconnaissance indisponible : " + msg(t), "nocr"); }
            } });
        } }).start();
    }
    // Coins dans l'ordre : haut-gauche, haut-droite, bas-droite, bas-gauche (sens de lecture)
    private static JSONArray pts(Point[] p, Rect r) {
        JSONArray a = new JSONArray();
        if (p != null && p.length == 4) { for (Point q : p) { a.put(q.x); a.put(q.y); } return a; }
        if (r == null) r = new Rect();
        a.put(r.left); a.put(r.top); a.put(r.right); a.put(r.top); a.put(r.right); a.put(r.bottom); a.put(r.left); a.put(r.bottom);
        return a;
    }

    // ---------- Mot de passe (PDFBox-Android) ----------
    private void pdfbox() { if (!pdfboxReady) { PDFBoxResourceLoader.init(a.getApplicationContext()); pdfboxReady = true; } }
    @JavascriptInterface public boolean pdfboxReady() {
        try { Class.forName("com.tom_roush.pdfbox.pdmodel.PDDocument"); return true; } catch (Throwable t) { return false; }
    }
    /** Protège le PDF « token » : mot de passe d'ouverture, droits (impression, copie, modification). */
    @JavascriptInterface public void protect(final String token, final String userPw, final String ownerPw, final boolean print, final boolean copy, final boolean modify, final String job) {
        final File f = fileOf(token);
        if (f == null) { fail(job, "Fichier introuvable", null); return; }
        new Thread(new Runnable() { public void run() {
            PDDocument d = null;
            try {
                pdfbox();
                try { d = PDDocument.load(f); }
                catch (InvalidPasswordException e) { fail(job, "Ce PDF a déjà un mot de passe : retirez-le d'abord", "pw"); return; }
                if (d.isEncrypted()) d.setAllSecurityToBeRemoved(true);
                AccessPermission ap = new AccessPermission();
                ap.setCanPrint(print); ap.setCanPrintFaithful(print);
                ap.setCanExtractContent(copy); ap.setCanExtractForAccessibility(true);
                ap.setCanModify(modify); ap.setCanAssembleDocument(modify); ap.setCanFillInForm(true); ap.setCanModifyAnnotations(modify);
                StandardProtectionPolicy sp = new StandardProtectionPolicy(ownerPw, userPw, ap);
                sp.setEncryptionKeyLength(256);
                d.protect(sp);
                done(job, d);
            } catch (Throwable t) { fail(job, "Protection impossible : " + msg(t), null); }
            finally { try { if (d != null) d.close(); } catch (Exception e) { } drop(token); }
        } }).start();
    }
    /** Retire la protection du PDF « token » avec le mot de passe donné (d'ouverture ou du propriétaire). */
    @JavascriptInterface public void unlock(final String token, final String pw, final String job) {
        final File f = fileOf(token);
        if (f == null) { fail(job, "Fichier introuvable", null); return; }
        new Thread(new Runnable() { public void run() {
            PDDocument d = null;
            try {
                pdfbox();
                try { d = PDDocument.load(f, pw == null ? "" : pw); }
                catch (InvalidPasswordException e) { fail(job, "Mot de passe incorrect", "pw"); return; }
                boolean was = d.isEncrypted();
                d.setAllSecurityToBeRemoved(true);
                JSONObject extra = new JSONObject(); extra.put("was", was);
                done(job, d, extra);
            } catch (Throwable t) { fail(job, "Ouverture impossible : " + msg(t), null); }
            finally { try { if (d != null) d.close(); } catch (Exception e) { } drop(token); }
        } }).start();
    }
    @JavascriptInterface public boolean isEncrypted(String token) {
        File f = fileOf(token); if (f == null) return false;
        PDDocument d = null;
        try { pdfbox(); d = PDDocument.load(f, ""); return d.isEncrypted(); }
        catch (InvalidPasswordException e) { return true; }
        catch (Throwable t) { return false; }
        finally { try { if (d != null) d.close(); } catch (Exception e) { } }
    }
    private void done(String job, PDDocument d) throws Exception { done(job, d, new JSONObject()); }
    private void done(String job, PDDocument d, JSONObject o) throws Exception {
        File out = new File(dir(), "out-" + newToken("o") + ".pdf");
        try (OutputStream os = new FileOutputStream(out)) { d.save(os); }
        String t = register("o", out);
        o.put("job", job); o.put("ok", true); o.put("token", t); o.put("size", out.length());
        emit(o);
    }

    // ---------- PDF reçus par « Partager » (Lecteur PDF, Fichiers, e-mail…) ----------
    /** {"files":[{token,name,size}],"errors":[…]} ou "" s'il n'y a rien. Le fichier se lit ensuite avec read(), puis drop(). */
    @JavascriptInterface public String pending() {
        try {
            Intent i = a.getIntent();
            if (i != null && i != handledLaunch && isShare(i)) { handledLaunch = i; intake(i); try { i.setAction(Intent.ACTION_MAIN); } catch (Exception e) { } }
            synchronized (inbox) {
                if (inbox.isEmpty()) return "";
                JSONObject o = new JSONObject(); JSONArray fs = new JSONArray(), errs = new JSONArray();
                for (JSONObject x : inbox) { if (x.has("err")) errs.put(x.optString("name")); else fs.put(x); }
                inbox.clear();
                o.put("files", fs); o.put("errors", errs);
                return o.toString();
            }
        } catch (Throwable t) { return ""; }
    }
    private static boolean isShare(Intent i) {
        if (i == null) return false;
        String ac = i.getAction();
        return Intent.ACTION_SEND.equals(ac) || Intent.ACTION_SEND_MULTIPLE.equals(ac);
    }
    private int intake(Intent i) {
        List<Uri> l = new ArrayList<Uri>();
        try {
            if (Intent.ACTION_SEND.equals(i.getAction())) { Uri u = (Uri) i.getParcelableExtra(Intent.EXTRA_STREAM); if (u != null) l.add(u); }
            else { ArrayList<Uri> us = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM); if (us != null) l.addAll(us); }
        } catch (Throwable t) { }
        int n = 0;
        ContentResolver cr = a.getContentResolver();
        for (Uri u : l) {
            String name = displayName(u);
            try {
                File f = new File(dir(), "recu-" + newToken("r") + ".pdf");
                long total = 0;
                try (InputStream in = cr.openInputStream(u); OutputStream out = new FileOutputStream(f)) {
                    if (in == null) throw new Exception("illisible");
                    byte[] b = new byte[65536]; int k;
                    while ((k = in.read(b)) > 0) { out.write(b, 0, k); total += k; if (total > MAX_IN) throw new Exception("trop volumineux"); }
                }
                String t = register("r", f);
                JSONObject o = new JSONObject(); o.put("token", t); o.put("name", name); o.put("size", total);
                synchronized (inbox) { inbox.add(o); }
                n++;
            } catch (Throwable t) {
                try { JSONObject o = new JSONObject(); o.put("name", name); o.put("err", msg(t)); synchronized (inbox) { inbox.add(o); } } catch (Exception e) { }
            }
        }
        return n;
    }
    private String displayName(Uri u) {
        String n = null;
        try (Cursor c = a.getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) n = c.getString(0);
        } catch (Throwable t) { }
        if (n == null || n.trim().isEmpty()) { n = u.getLastPathSegment(); }
        if (n == null || n.trim().isEmpty()) n = "document.pdf";
        n = n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        if (!n.toLowerCase().endsWith(".pdf")) n += ".pdf";
        return n;
    }

    @JavascriptInterface public void toast(final String t) {
        a.runOnUiThread(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_LONG).show(); } });
    }
}
