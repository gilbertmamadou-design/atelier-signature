package __PKG__;

// Scan : pont natif exposé sous window.MAGScan
//  - réception « Partager vers Scan » (SEND / SEND_MULTIPLE image/* et application/pdf) : count(), next(), pending()
//  - sélection multiple dans la galerie : pickImages() puis événement scanEvent("files", {count})
//  - enregistrement direct dans Documents/Scan (MediaStore) : saveFile(base64, nom, type) puis scanEvent("saved", {...})
//  - ouverture d'un fichier enregistré : openUri(uri)
// Les images sont renvoyées à la page en data:base64 (JPEG ramené à 3000 px au plus, orientation EXIF appliquée).

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
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
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

public class ScanBridge {
    private static final int REQ_PICK = 5501;
    private static final int MAX_SIDE = 3000;
    private static final int MAX_FILES = 40;

    private final Activity a;
    private final WebView wv;
    private final ConcurrentLinkedQueue<String> queue = new ConcurrentLinkedQueue<String>();
    private boolean launchChecked = false;
    private volatile int working = 0;

    public ScanBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ================= Méthodes appelées par la page =================
    @JavascriptInterface
    public String version() { return "1"; }

    /** Nombre de fichiers reçus en attente (et -1 si une lecture est encore en cours sans rien de prêt). */
    @JavascriptInterface
    public int count() { checkLaunch(); return queue.isEmpty() && working > 0 ? -1 : queue.size(); }

    /** Fichier suivant : {"name","mime","data":"data:...;base64,..."} ou "" s'il n'y a plus rien. */
    @JavascriptInterface
    public String next() { checkLaunch(); String s = queue.poll(); return s == null ? "" : s; }

    /** Tous les fichiers reçus d'un coup (tableau JSON de {"name","mime","data"}), la file est vidée. */
    @JavascriptInterface
    public String pending() {
        checkLaunch();
        JSONArray arr = new JSONArray();
        String s;
        while ((s = queue.poll()) != null) { try { arr.put(new JSONObject(s)); } catch (Exception e) { } }
        return arr.toString();
    }

    /** Ouvre le sélecteur de photos (plusieurs à la fois). Résultat : scanEvent("files", {"count":n}). */
    @JavascriptInterface
    public void pickImages() {
        ui(new Runnable() { public void run() {
            Intent i;
            if (Build.VERSION.SDK_INT >= 33) {
                i = new Intent(MediaStore.ACTION_PICK_IMAGES);
                i.setType("image/*");
                try { i.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(MAX_FILES, MediaStore.getPickImagesMaxLimit())); } catch (Throwable t) { }
            } else {
                i = new Intent(Intent.ACTION_GET_CONTENT);
                i.setType("image/*");
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            try { a.startActivityForResult(i, REQ_PICK); }
            catch (Throwable t) {
                try {
                    Intent g = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    a.startActivityForResult(g, REQ_PICK);
                } catch (Throwable t2) { emit("files", "{\"count\":0,\"error\":\"Galerie indisponible\"}"); }
            }
        } });
    }

    /** Enregistre un fichier dans Documents/Scan. Résultat : scanEvent("saved", {"ok","name","uri","error"}). */
    @JavascriptInterface
    public void saveFile(final String b64, final String name, final String mime) {
        new Thread(new Runnable() { public void run() {
            JSONObject r = new JSONObject();
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                String m = (mime == null || mime.isEmpty()) ? "application/pdf" : mime;
                String n = clean(name, m);
                Uri u;
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, n);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, m);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS + "/Scan");
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    ContentResolver cr = a.getContentResolver();
                    u = cr.insert(MediaStore.Files.getContentUri("external"), v);
                    if (u == null) throw new Exception("Dossier Documents inaccessible");
                    OutputStream o = cr.openOutputStream(u);
                    try { o.write(data); } finally { o.close(); }
                    ContentValues done = new ContentValues();
                    done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    cr.update(u, done, null, null);
                    Cursor c = cr.query(u, new String[]{ MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null);
                    if (c != null) { try { if (c.moveToFirst()) n = c.getString(0); } finally { c.close(); } }
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "Scan");
                    if (!dir.exists() && !dir.mkdirs()) throw new Exception("Dossier Documents/Scan impossible à créer");
                    File f = new File(dir, n);
                    int k = 1;
                    String base = n.contains(".") ? n.substring(0, n.lastIndexOf('.')) : n, ext = n.contains(".") ? n.substring(n.lastIndexOf('.')) : "";
                    while (f.exists()) { f = new File(dir, base + " (" + (k++) + ")" + ext); }
                    FileOutputStream o = new FileOutputStream(f);
                    try { o.write(data); } finally { o.close(); }
                    n = f.getName();
                    u = Uri.fromFile(f);
                    try { android.media.MediaScannerConnection.scanFile(a, new String[]{ f.getAbsolutePath() }, new String[]{ m }, null); } catch (Throwable t) { }
                }
                r.put("ok", true); r.put("name", n); r.put("uri", u.toString()); r.put("folder", "Documents/Scan");
            } catch (Throwable t) {
                try { r.put("ok", false); r.put("error", msg(t)); } catch (Exception e) { }
            }
            emit("saved", r.toString());
        } }).start();
    }

    /** Ouvre un fichier enregistré (uri renvoyée par saveFile) dans l'appli adaptée. */
    @JavascriptInterface
    public void openUri(final String uri, final String mime) {
        ui(new Runnable() { public void run() {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), mime == null || mime.isEmpty() ? "application/pdf" : mime);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                a.startActivity(Intent.createChooser(i, "Ouvrir avec"));
            } catch (Throwable t) { toast("Aucune application pour ouvrir ce fichier"); }
        } });
    }

    // ================= Cycle de vie (appelé par MainActivity) =================
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_PICK) return;
        if (resultCode != Activity.RESULT_OK || data == null) { emit("files", "{\"count\":0}"); return; }
        List<Uri> l = new ArrayList<Uri>();
        if (data.getClipData() != null) {
            for (int k = 0; k < data.getClipData().getItemCount() && l.size() < MAX_FILES; k++) {
                Uri u = data.getClipData().getItemAt(k).getUri();
                if (u != null) l.add(u);
            }
        } else if (data.getData() != null) l.add(data.getData());
        intake(l, "pick");
    }

    public void onPermissions(int requestCode) { }

    public void onResume() { }

    public void onIntent(Intent i) {
        List<Uri> l = shared(i);
        if (!l.isEmpty()) intake(l, "share");
    }

    // ================= Lecture des fichiers reçus =================
    private synchronized void checkLaunch() {
        if (launchChecked) return;
        launchChecked = true;
        try {
            Intent i = a.getIntent();
            List<Uri> l = shared(i);
            if (l.isEmpty()) return;
            i.setAction(Intent.ACTION_MAIN); // ne pas réimporter au rechargement de la page
            for (Uri u : l) { String s = read(u); if (s != null) queue.add(s); }
        } catch (Throwable t) { }
    }

    private List<Uri> shared(Intent i) {
        List<Uri> l = new ArrayList<Uri>();
        if (i == null || i.getAction() == null) return l;
        try {
            if (Intent.ACTION_SEND.equals(i.getAction())) {
                Uri u = (Uri) i.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u == null && i.getClipData() != null && i.getClipData().getItemCount() > 0) u = i.getClipData().getItemAt(0).getUri();
                if (u != null) l.add(u);
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) {
                ArrayList<Uri> s = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (s != null) for (Uri u : s) { if (u != null && l.size() < MAX_FILES) l.add(u); }
            } else if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) {
                String t = i.getType();
                if (t != null && (t.startsWith("image/") || t.contains("pdf"))) l.add(i.getData());
            }
        } catch (Throwable t) { }
        return l;
    }

    private void intake(final List<Uri> l, final String src) {
        if (l.isEmpty()) { emit("files", "{\"count\":0}"); return; }
        working++;
        new Thread(new Runnable() { public void run() {
            int n = 0;
            try {
                for (Uri u : l) { String s = read(u); if (s != null) { queue.add(s); n++; } }
            } finally { working--; }
            emit("files", "{\"count\":" + n + ",\"src\":\"" + src + "\",\"failed\":" + (l.size() - n) + "}");
        } }).start();
    }

    /** Lit un fichier et le renvoie en JSON {"name","mime","data"} ; null si illisible. */
    private String read(Uri u) {
        try {
            ContentResolver cr = a.getContentResolver();
            String name = displayName(u);
            String mime = cr.getType(u);
            if (mime == null) mime = name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg";
            JSONObject o = new JSONObject();
            o.put("name", name);
            if (mime.contains("pdf")) {
                byte[] b = readAll(cr.openInputStream(u));
                o.put("mime", "application/pdf");
                o.put("data", "data:application/pdf;base64," + Base64.encodeToString(b, Base64.NO_WRAP));
            } else {
                Bitmap bm = decode(u);
                if (bm == null) return null;
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bm.compress(Bitmap.CompressFormat.JPEG, 90, out);
                bm.recycle();
                o.put("mime", "image/jpeg");
                o.put("data", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            }
            return o.toString();
        } catch (Throwable t) { return null; }
    }

    private Bitmap decode(Uri u) throws Exception {
        ContentResolver cr = a.getContentResolver();
        if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.Source s = ImageDecoder.createSource(cr, u);
            return ImageDecoder.decodeBitmap(s, new ImageDecoder.OnHeaderDecodedListener() {
                public void onHeaderDecoded(ImageDecoder d, ImageDecoder.ImageInfo info, ImageDecoder.Source src) {
                    d.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                    int w = info.getSize().getWidth(), h = info.getSize().getHeight(), m = Math.max(w, h);
                    if (m > MAX_SIDE) { float k = MAX_SIDE / (float) m; d.setTargetSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); }
                }
            });
        }
        BitmapFactory.Options op = new BitmapFactory.Options();
        op.inJustDecodeBounds = true;
        InputStream in = cr.openInputStream(u);
        try { BitmapFactory.decodeStream(in, null, op); } finally { in.close(); }
        int smp = 1;
        while (Math.max(op.outWidth, op.outHeight) / (smp * 2) >= MAX_SIDE) smp *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = smp;
        in = cr.openInputStream(u);
        Bitmap bm;
        try { bm = BitmapFactory.decodeStream(in, null, o2); } finally { in.close(); }
        if (bm == null) return null;
        int rot = 0;
        try {
            InputStream e = cr.openInputStream(u);
            try {
                int or = new android.media.ExifInterface(e).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1);
                rot = or == 6 ? 90 : or == 3 ? 180 : or == 8 ? 270 : 0;
            } finally { e.close(); }
        } catch (Throwable t) { }
        int m = Math.max(bm.getWidth(), bm.getHeight());
        float k = m > MAX_SIDE ? MAX_SIDE / (float) m : 1f;
        if (rot != 0 || k < 1f) {
            Matrix mx = new Matrix();
            mx.postScale(k, k);
            mx.postRotate(rot);
            Bitmap r = Bitmap.createBitmap(bm, 0, 0, bm.getWidth(), bm.getHeight(), mx, true);
            if (r != bm) bm.recycle();
            bm = r;
        }
        return bm;
    }

    private String displayName(Uri u) {
        String n = null;
        try {
            Cursor c = a.getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null) { try { if (c.moveToFirst()) n = c.getString(0); } finally { c.close(); } }
        } catch (Throwable t) { }
        if (n == null) { n = u.getLastPathSegment(); if (n == null) n = "fichier"; }
        return n;
    }

    // ================= Outils =================
    private static byte[] readAll(InputStream in) throws Exception {
        if (in == null) throw new Exception("Fichier illisible");
        try {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] b = new byte[65536];
            int r;
            while ((r = in.read(b)) > 0) o.write(b, 0, r);
            return o.toByteArray();
        } finally { in.close(); }
    }
    private static String clean(String name, String mime) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\n\\r\\t]", " ").trim();
        if (n.isEmpty()) n = "Scan";
        String ext = mime.contains("pdf") ? ".pdf" : mime.contains("jpeg") ? ".jpg" : mime.contains("zip") ? ".zip" : mime.contains("png") ? ".png" : "";
        if (!ext.isEmpty() && !n.toLowerCase().endsWith(ext)) n += ext;
        return n;
    }
    private void ui(Runnable r) { a.runOnUiThread(r); }
    private void toast(final String t) { ui(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_SHORT).show(); } }); }
    private void emit(String type, String json) {
        final String js = "window.scanEvent&&scanEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "" : json) + ")";
        ui(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable e) { } } });
    }
    private static String msg(Throwable t) { return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage(); }
}
