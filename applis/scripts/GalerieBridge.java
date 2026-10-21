package __PKG__;

import android.app.Activity;
import android.app.PendingIntent;
import android.app.WallpaperManager;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapRegionDecoder;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.Size;
import android.view.View;
import android.view.Window;
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
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingDeque;

/**
 * Galerie : pont entre la page www-galerie et les photos/vidéos du téléphone (MediaStore).
 * Exposé en JS sous window.MAGGalerie. Événements asynchrones : window.galerieEvent(type, json).
 *
 * Jeton d'élément (« tok ») utilisé par la plupart des méthodes : "id:v" ou "id:v:mod"
 *   id = MediaStore _ID, v = 1 pour une vidéo, 0 pour une image, mod = date de modification (s).
 *   Le jeton spécial "ext" désigne le fichier reçu par « Ouvrir avec ».
 * Plusieurs jetons : séparés par des virgules.
 */
public class GalerieBridge {
    private static final int REQ_PERM = 5100, REQ_FAV = 5110, REQ_TRASH = 5111, REQ_RESTORE = 5112,
            REQ_DELETE = 5113, REQ_DEL_LEGACY = 5114;
    private static final String P_IMAGES = "android.permission.READ_MEDIA_IMAGES",
            P_VIDEO = "android.permission.READ_MEDIA_VIDEO",
            P_PARTIAL = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
            P_LEGACY = "android.permission.READ_EXTERNAL_STORAGE",
            P_WRITE = "android.permission.WRITE_EXTERNAL_STORAGE",
            P_LOC = "android.permission.ACCESS_MEDIA_LOCATION";
    private static final int SDK = Build.VERSION.SDK_INT;

    private final Activity a;
    private final WebView wv;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();     // listes, opérations
    private final ExecutorService big = Executors.newFixedThreadPool(2);        // aperçus, régions, infos
    private final ExecutorService geo = Executors.newSingleThreadExecutor();    // analyse des lieux
    private final LinkedBlockingDeque<String[]> tq = new LinkedBlockingDeque<>(); // miniatures en attente
    private final Set<String> inFlight = Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());
    private final List<JSONArray> thumbOut = new ArrayList<>();
    private boolean thumbFlushPlanned;
    private File thumbDir, prevDir;

    // Opération en attente de confirmation système
    private String pendOp; private String pendToks;
    private ArrayList<Uri> legacyLeft;
    // Fichier reçu par « Ouvrir avec »
    private volatile String pendingOpen = "";
    private Uri extUri; private String extMime = "", extPath = "", extName = "";
    private Intent lastIntent;
    private ContentObserver observer;
    private boolean geoRunning;

    public GalerieBridge(Activity a, WebView wv) {
        this.a = a; this.wv = wv;
        thumbDir = new File(a.getCacheDir(), "galerie-mini"); thumbDir.mkdirs();
        prevDir = new File(a.getCacheDir(), "galerie-apercu"); prevDir.mkdirs();
        for (int i = 0; i < 3; i++) {
            Thread t = new Thread(this::thumbLoop, "galerie-mini-" + i);
            t.setDaemon(true); t.setPriority(Thread.NORM_PRIORITY - 1); t.start();
        }
        try { handleIntent(a.getIntent()); } catch (Throwable e) { }
        try {
            observer = new ContentObserver(main) {
                final Runnable fire = () -> emit("changed", "{}");
                @Override public void onChange(boolean self) { main.removeCallbacks(fire); main.postDelayed(fire, 1500); }
            };
            ContentResolver cr = a.getContentResolver();
            cr.registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, observer);
            cr.registerContentObserver(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true, observer);
        } catch (Throwable e) { }
        // Nettoyage des aperçus de plus de 3 jours
        big.execute(() -> {
            long lim = System.currentTimeMillis() - 3L * 86400000L;
            File[] fs = prevDir.listFiles();
            if (fs != null) for (File f : fs) if (f.lastModified() < lim) f.delete();
            // Miniatures : au-delà de 400 Mo, on retire les plus anciennes
            File[] ts = thumbDir.listFiles();
            if (ts != null) {
                long total = 0;
                for (File f : ts) total += f.length();
                if (total > 400L * 1048576L) {
                    java.util.Arrays.sort(ts, (x, y) -> Long.compare(x.lastModified(), y.lastModified()));
                    for (File f : ts) { if (total < 300L * 1048576L) break; total -= f.length(); f.delete(); }
                }
            }
        });
    }

    // ================= Cycle de vie (appelé par MainActivity) =================
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode < 5100 || requestCode > 5199) return;
        boolean ok = resultCode == Activity.RESULT_OK;
        if (requestCode == REQ_DEL_LEGACY) {
            if (ok && legacyLeft != null) { final ArrayList<Uri> l = legacyLeft; io.execute(() -> legacyDelete(l)); }
            else { opDone("trash", false, pendToks); legacyLeft = null; }
            return;
        }
        String op = requestCode == REQ_FAV ? pendOp : requestCode == REQ_TRASH ? "trash" : requestCode == REQ_RESTORE ? "restore" : requestCode == REQ_DELETE ? "delete" : "?";
        opDone(op, ok, pendToks);
    }
    public void onPermissions(int requestCode) { if (requestCode == REQ_PERM) emit("perm", permState()); }
    public void onResume() { emit("resume", permState()); }
    public void onIntent(Intent i) { try { handleIntent(i); } catch (Throwable e) { } }

    // ================= Outils =================
    private ContentResolver cr() { return a.getContentResolver(); }
    private boolean can(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private void ui(Runnable r) { a.runOnUiThread(r); }
    private void toast(final String t) { ui(() -> Toast.makeText(a, t, Toast.LENGTH_SHORT).show()); }
    private void emit(String type, String json) {
        final String js = "window.galerieEvent&&galerieEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "" : json) + ")";
        ui(() -> { try { wv.evaluateJavascript(js, null); } catch (Throwable e) { } });
    }
    private static String msg(Throwable t) { return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage(); }
    private SharedPreferences prefs() { return a.getSharedPreferences("galerie", Context.MODE_PRIVATE); }

    private static boolean isVid(String tok) { String[] p = tok.split(":"); return p.length > 1 && "1".equals(p[1]); }
    private static long idOf(String tok) { try { return Long.parseLong(tok.split(":")[0]); } catch (Exception e) { return -1; } }
    private static long modOf(String tok) { String[] p = tok.split(":"); try { return p.length > 2 ? Long.parseLong(p[2]) : 0; } catch (Exception e) { return 0; } }
    private Uri uriOf(String tok) {
        if ("ext".equals(tok)) return extUri;
        long id = idOf(tok); if (id < 0) return null;
        return ContentUris.withAppendedId(isVid(tok) ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
    }
    private ArrayList<Uri> uris(String csv) {
        ArrayList<Uri> l = new ArrayList<>();
        if (csv == null) return l;
        for (String t : csv.split(",")) { t = t.trim(); if (t.isEmpty()) continue; Uri u = uriOf(t); if (u != null) l.add(u); }
        return l;
    }
    /** Uri qui donne accès aux métadonnées d'origine (GPS) quand ACCESS_MEDIA_LOCATION est accordée */
    private Uri original(Uri u) {
        if (SDK >= 29 && u != null && "media".equals(u.getAuthority()) && can(P_LOC)) {
            try { return MediaStore.setRequireOriginal(u); } catch (Throwable e) { }
        }
        return u;
    }
    private InputStream open(Uri u) throws Exception {
        if (u == extUri && extPath != null && !extPath.isEmpty()) return new FileInputStream(extPath);
        return cr().openInputStream(u);
    }

    // ================= Autorisations =================
    @JavascriptInterface public String version() { return "1"; }
    @JavascriptInterface public int sdk() { return SDK; }

    /** {sdk, any, full, partial, video, loc, write, asked, blocked} */
    @JavascriptInterface public String permState() {
        boolean full, video, partial = false;
        if (SDK >= 33) {
            full = can(P_IMAGES); video = can(P_VIDEO);
            if (SDK >= 34) partial = !full && can(P_PARTIAL);
        } else { full = can(P_LEGACY); video = full; }
        boolean any = full || video || partial;
        boolean asked = prefs().getBoolean("asked", false);
        boolean blocked = false;
        if (!any && asked) {
            String p = SDK >= 33 ? P_IMAGES : P_LEGACY;
            blocked = !a.shouldShowRequestPermissionRationale(p);
        }
        try {
            return new JSONObject().put("sdk", SDK).put("any", any).put("full", full).put("partial", partial)
                    .put("video", video).put("loc", SDK < 29 || can(P_LOC)).put("write", SDK >= 30 || can(P_WRITE))
                    .put("asked", asked).put("blocked", blocked).put("trash", SDK >= 30).toString();
        } catch (Exception e) { return "{}"; }
    }
    /** Demande l'accès aux photos et vidéos (sur Android 14+, propose aussi « Sélectionner des photos ») */
    @JavascriptInterface public void askPerm() {
        final ArrayList<String> l = new ArrayList<>();
        if (SDK >= 33) { l.add(P_IMAGES); l.add(P_VIDEO); if (SDK >= 34) l.add(P_PARTIAL); }
        else { l.add(P_LEGACY); if (SDK <= 28) l.add(P_WRITE); }
        if (SDK >= 29) l.add(P_LOC);
        prefs().edit().putBoolean("asked", true).apply();
        ui(() -> { try { a.requestPermissions(l.toArray(new String[0]), REQ_PERM); } catch (Throwable e) { emit("perm", permState()); } });
    }
    @JavascriptInterface public void openSettings() {
        ui(() -> {
            try { a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()))); }
            catch (Throwable e) { toast("Réglages indisponibles"); }
        });
    }

    // ================= Liste =================
    /**
     * Charge la liste ; what = "all" (photos et vidéos) ou "trash" (corbeille, Android 11+).
     * Événements "items" : {req, start, items:[[id, v, date(ms), mod(s), w, h, durée(ms), bucketId, album, nom, chemin, favori(0/1), taille, mime, dossier relatif, expire(s)]...], done, total}
     */
    @JavascriptInterface public void load(final String req, final String what) {
        io.execute(() -> {
            ArrayList<Object[]> rows = new ArrayList<>();
            boolean trash = "trash".equals(what);
            String err = null;
            try {
                if (!trash || SDK >= 30) {
                    query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, false, trash, rows);
                    query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true, trash, rows);
                }
            } catch (Throwable e) { err = msg(e); }
            Collections.sort(rows, (x, y) -> Long.compare((Long) y[0], (Long) x[0]));
            int total = rows.size(), step = 2500;
            try {
                if (total == 0) {
                    emit("items", new JSONObject().put("req", req).put("start", 0).put("items", new JSONArray()).put("done", true).put("total", 0).put("err", err == null ? "" : err).toString());
                    return;
                }
                for (int s = 0; s < total; s += step) {
                    JSONArray arr = new JSONArray();
                    for (int i = s; i < Math.min(total, s + step); i++) arr.put(rows.get(i)[1]);
                    emit("items", new JSONObject().put("req", req).put("start", s).put("items", arr).put("done", s + step >= total).put("total", total).toString());
                }
            } catch (Exception e) { }
        });
    }
    /** Un seul élément (même format que load), ou "" */
    @JavascriptInterface public String item(String tok) {
        ArrayList<Object[]> rows = new ArrayList<>();
        try {
            boolean v = isVid(tok);
            queryWhere(v ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v, false, "_id=" + idOf(tok), rows);
        } catch (Throwable e) { }
        return rows.isEmpty() ? "" : rows.get(0)[1].toString();
    }
    private void query(Uri base, boolean video, boolean trash, ArrayList<Object[]> out) { queryWhere(base, video, trash, null, out); }
    private void queryWhere(Uri base, boolean video, boolean trash, String where, ArrayList<Object[]> out) {
        ArrayList<String> p = new ArrayList<>();
        Collections.addAll(p, "_id", "datetaken", "date_modified", "date_added", "width", "height", "bucket_id", "bucket_display_name", "_display_name", "_data", "_size", "mime_type");
        boolean hasOri = SDK >= 29 || !video, hasDur = video || SDK >= 29;
        if (hasOri) p.add("orientation");
        if (hasDur) p.add("duration");
        if (SDK >= 29) { p.add("relative_path"); p.add("date_expires"); }
        if (SDK >= 30) p.add("is_favorite");
        String[] proj = p.toArray(new String[0]);
        HashMap<String, Integer> ix = new HashMap<>();
        for (int i = 0; i < proj.length; i++) ix.put(proj[i], i);
        Set<String> localFav = SDK < 30 ? prefs().getStringSet("favs", new HashSet<String>()) : null;
        Cursor c;
        if (SDK >= 30) {
            Bundle b = new Bundle();
            if (trash) b.putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_ONLY);
            if (where != null) b.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, where);
            c = cr().query(base, proj, b, null);
        } else c = cr().query(base, proj, where, null, null);
        if (c == null) return;
        try {
            while (c.moveToNext()) {
                long id = c.getLong(0);
                long taken = c.isNull(1) ? 0 : c.getLong(1), mod = c.getLong(2), added = c.getLong(3);
                long date = taken > 0 ? taken : (mod > 0 ? mod * 1000 : added * 1000);
                int w = c.getInt(4), h = c.getInt(5);
                int ori = hasOri ? c.getInt(ix.get("orientation")) : 0;
                if (ori == 90 || ori == 270) { int t = w; w = h; h = t; }
                long dur = hasDur && !c.isNull(ix.get("duration")) ? c.getLong(ix.get("duration")) : 0;
                boolean fav = SDK >= 30 ? c.getInt(ix.get("is_favorite")) == 1 : localFav.contains((video ? "v" : "i") + id);
                String rel = SDK >= 29 ? str(c.getString(ix.get("relative_path"))) : "";
                long exp = SDK >= 29 && !c.isNull(ix.get("date_expires")) ? c.getLong(ix.get("date_expires")) : 0;
                JSONArray r = new JSONArray();
                r.put(id).put(video ? 1 : 0).put(date).put(mod).put(w).put(h).put(video ? dur : 0)
                        .put(str(c.getString(6))).put(str(c.getString(7))).put(str(c.getString(8))).put(str(c.getString(9)))
                        .put(fav ? 1 : 0).put(c.getLong(10)).put(str(c.getString(11))).put(rel).put(trash ? exp : 0);
                out.add(new Object[]{ date, r });
            }
        } finally { c.close(); }
    }
    private static String str(String s) { return s == null ? "" : s; }

    // ================= Miniatures =================
    /**
     * Demande des miniatures (remplace la file d'attente précédente : les éléments visibles d'abord).
     * csv : jetons "id:v:mod". Événement "thumbs" : [[tok, chemin du fichier jpeg en cache, dataUrl si inline], ...] ; chemin "" = échec.
     */
    @JavascriptInterface public void thumbs(String csv, int size, boolean inline) {
        tq.clear();
        if (csv == null) return;
        int sz = Math.max(64, Math.min(size, 1024));
        for (String t : csv.split(",")) { t = t.trim(); if (!t.isEmpty()) tq.addLast(new String[]{ t, String.valueOf(sz), inline ? "1" : "0" }); }
    }
    /** Dossier des miniatures en cache : <dir>/<id>_<mod>_<taille>.jpg */
    @JavascriptInterface public String thumbDir() { return thumbDir.getAbsolutePath(); }
    @JavascriptInterface public void clearCache() {
        big.execute(() -> {
            for (File d : new File[]{ thumbDir, prevDir }) { File[] fs = d.listFiles(); if (fs != null) for (File f : fs) f.delete(); }
            emit("cache", "{}");
        });
    }
    private void thumbLoop() {
        while (true) {
            String[] job;
            try { job = tq.takeFirst(); } catch (InterruptedException e) { return; }
            String tok = job[0];
            if (!inFlight.add(tok + "/" + job[1])) continue;
            try {
                int size = Integer.parseInt(job[1]);
                File f = thumbFile(tok, size);
                if (!f.exists() || f.length() == 0) makeThumb(tok, size, f);
                String data = "";
                if ("1".equals(job[2]) && f.exists()) data = "data:image/jpeg;base64," + Base64.encodeToString(readAll(new FileInputStream(f)), Base64.NO_WRAP);
                pushThumb(new JSONArray().put(tok).put(f.exists() ? f.getAbsolutePath() : "").put(data));
            } catch (Throwable e) {
                pushThumb(new JSONArray().put(tok).put("").put(""));
            } finally { inFlight.remove(tok + "/" + job[1]); }
        }
    }
    private File thumbFile(String tok, int size) {
        if ("ext".equals(tok)) return new File(thumbDir, "ext_" + Math.abs(extPath.hashCode()) + "_" + size + ".jpg");
        return new File(thumbDir, idOf(tok) + "_" + modOf(tok) + "_" + size + ".jpg");
    }
    private void makeThumb(String tok, int size, File f) throws Exception {
        Bitmap b = null;
        Uri u = uriOf(tok);
        boolean v = isVid(tok) || ("ext".equals(tok) && extMime.startsWith("video"));
        if ("ext".equals(tok)) {
            if (v) b = videoFrame(Uri.fromFile(new File(extPath)), size);
            else b = decode(Uri.fromFile(new File(extPath)), size * 2);
        } else if (SDK >= 29) {
            b = cr().loadThumbnail(u, new Size(size, size), null);
        } else {
            long id = idOf(tok);
            if (v) b = MediaStore.Video.Thumbnails.getThumbnail(cr(), id, MediaStore.Video.Thumbnails.MINI_KIND, null);
            else {
                b = MediaStore.Images.Thumbnails.getThumbnail(cr(), id, MediaStore.Images.Thumbnails.MINI_KIND, null);
                int ori = 0;
                try (Cursor c = cr().query(u, new String[]{ "orientation" }, null, null, null)) { if (c != null && c.moveToFirst()) ori = c.getInt(0); }
                if (b != null && ori != 0) b = rotate(b, ori, false);
            }
            if (b == null && !v) b = decode(u, size * 2);
        }
        if (b == null) throw new Exception("miniature");
        int s = Math.min(b.getWidth(), b.getHeight());
        if (s > size * 1.15) {
            float k = (float) size / s;
            Bitmap sc = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * k)), Math.max(1, Math.round(b.getHeight() * k)), true);
            if (sc != b) b.recycle();
            b = sc;
        }
        File tmp = new File(f.getPath() + ".tmp");
        try (OutputStream o = new FileOutputStream(tmp)) { b.compress(Bitmap.CompressFormat.JPEG, 78, o); }
        b.recycle();
        tmp.renameTo(f);
    }
    private void pushThumb(JSONArray r) {
        synchronized (thumbOut) {
            thumbOut.add(r);
            if (thumbFlushPlanned) return;
            thumbFlushPlanned = true;
        }
        main.postDelayed(() -> {
            JSONArray all = new JSONArray();
            synchronized (thumbOut) { for (JSONArray x : thumbOut) all.put(x); thumbOut.clear(); thumbFlushPlanned = false; }
            emit("thumbs", all.toString());
        }, 45);
    }

    // ================= Décodage =================
    private Bitmap decode(Uri u, final int max) throws Exception {
        if (SDK >= 28 && !(u == extUri && extPath.isEmpty())) {
            ImageDecoder.Source src = "file".equals(u.getScheme()) ? ImageDecoder.createSource(new File(u.getPath()))
                    : (u == extUri ? ImageDecoder.createSource(new File(extPath)) : ImageDecoder.createSource(cr(), u));
            return ImageDecoder.decodeBitmap(src, (dec, info, s) -> {
                int w = info.getSize().getWidth(), h = info.getSize().getHeight();
                float k = Math.min(1f, (float) max / Math.max(w, h));
                if (k < 1f) dec.setTargetSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
                dec.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                dec.setMemorySizePolicy(ImageDecoder.MEMORY_POLICY_LOW_RAM);
            });
        }
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        try (InputStream in = openAny(u)) { BitmapFactory.decodeStream(in, null, o); }
        int s = 1;
        while (Math.max(o.outWidth, o.outHeight) / (s * 2) >= max) s *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = s;
        Bitmap b;
        try (InputStream in = openAny(u)) { b = BitmapFactory.decodeStream(in, null, o2); }
        if (b == null) throw new Exception("Format non pris en charge");
        int ori = exifRotation(u);
        if (ori != 0) b = rotate(b, ori, true);
        int m = Math.max(b.getWidth(), b.getHeight());
        if (m > max) {
            float k = (float) max / m;
            Bitmap sc = Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * k), Math.round(b.getHeight() * k), true);
            if (sc != b) b.recycle();
            b = sc;
        }
        return b;
    }
    private InputStream openAny(Uri u) throws Exception {
        if ("file".equals(u.getScheme())) return new FileInputStream(u.getPath());
        return open(u);
    }
    private int exifRotation(Uri u) {
        try (InputStream in = openAny(u)) {
            ExifInterface e = new ExifInterface(in);
            switch (e.getAttributeInt(ExifInterface.TAG_ORIENTATION, 1)) {
                case ExifInterface.ORIENTATION_ROTATE_90: return 90;
                case ExifInterface.ORIENTATION_ROTATE_180: return 180;
                case ExifInterface.ORIENTATION_ROTATE_270: return 270;
                default: return 0;
            }
        } catch (Throwable t) { return 0; }
    }
    private static Bitmap rotate(Bitmap b, int deg, boolean recycle) {
        Matrix m = new Matrix(); m.postRotate(deg);
        Bitmap r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
        if (recycle && r != b) b.recycle();
        return r;
    }
    private Bitmap videoFrame(Uri u, int max) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            if ("file".equals(u.getScheme())) r.setDataSource(u.getPath()); else r.setDataSource(a, u);
            Bitmap b = r.getFrameAtTime(1000000);
            if (b == null) return null;
            int m = Math.max(b.getWidth(), b.getHeight());
            if (m > max) { float k = (float) max / m; b = Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * k), Math.round(b.getHeight() * k), true); }
            return b;
        } catch (Throwable t) { return null; }
        finally { try { r.release(); } catch (Throwable t) { } }
    }
    private static byte[] readAll(InputStream in) throws Exception {
        try (InputStream i = in) {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            byte[] buf = new byte[65536]; int n;
            while ((n = i.read(buf)) > 0) o.write(buf, 0, n);
            return o.toByteArray();
        }
    }

    // ================= Aperçu et zoom profond =================
    /**
     * Version réduite (côté le plus long ≤ max) d'une image, pour la visionneuse ou l'éditeur.
     * Événement "preview" : {req, ok, p: chemin jpeg en cache, d: dataUrl si inline, w, h, err}
     */
    @JavascriptInterface public void preview(final String req, final String tok, final int max, final boolean inline) {
        big.execute(() -> {
            JSONObject r = new JSONObject();
            try {
                r.put("req", req);
                int mx = Math.max(256, Math.min(max, 4096));
                String key = "ext".equals(tok) ? "ext_" + Math.abs(extPath.hashCode()) : idOf(tok) + "_" + modOf(tok);
                File f = new File(prevDir, key + "_" + mx + ".jpg");
                int w = 0, h = 0;
                if (!f.exists() || f.length() == 0) {
                    Uri u = uriOf(tok);
                    boolean v = isVid(tok) || ("ext".equals(tok) && extMime.startsWith("video"));
                    Bitmap b;
                    if (v) b = "ext".equals(tok) ? videoFrame(Uri.fromFile(new File(extPath)), mx) : (SDK >= 29 ? cr().loadThumbnail(u, new Size(mx, mx), null) : videoFrame(u, mx));
                    else b = decode(u, mx);
                    if (b == null) throw new Exception("Image illisible");
                    w = b.getWidth(); h = b.getHeight();
                    File tmp = new File(f.getPath() + ".tmp");
                    try (OutputStream o = new FileOutputStream(tmp)) { b.compress(Bitmap.CompressFormat.JPEG, 90, o); }
                    b.recycle(); tmp.renameTo(f);
                } else {
                    BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true;
                    BitmapFactory.decodeFile(f.getPath(), o); w = o.outWidth; h = o.outHeight;
                }
                f.setLastModified(System.currentTimeMillis());
                r.put("ok", true).put("p", f.getAbsolutePath()).put("w", w).put("h", h);
                if (inline) r.put("d", "data:image/jpeg;base64," + Base64.encodeToString(readAll(new FileInputStream(f)), Base64.NO_WRAP));
            } catch (Throwable e) {
                try { r.put("ok", false).put("err", msg(e)); } catch (Exception x) { }
            }
            emit("preview", r.toString());
        });
    }
    /**
     * Zone d'une très grande image en pleine définition (zoom profond, ex. 108 Mpx).
     * l,t,r,b : rectangle normalisé (0..1) dans l'image affichée (orientation appliquée) ; max : côté le plus long voulu.
     * Événement "region" : {req, ok, p, d?, l, t, r, b}
     */
    @JavascriptInterface public void region(final String req, final String tok, final double l, final double t, final double r, final double b, final int max, final boolean inline) {
        big.execute(() -> {
            JSONObject o = new JSONObject();
            try {
                o.put("req", req).put("l", l).put("t", t).put("r", r).put("b", b);
                Uri u = uriOf(tok);
                int ori = exifRotation(u);
                BitmapRegionDecoder d;
                try (InputStream in = open(u)) { d = BitmapRegionDecoder.newInstance(in, false); }
                int W = d.getWidth(), H = d.getHeight();
                double x0, x1, y0, y1;
                if (ori == 90) { x0 = t * W; x1 = b * W; y0 = (1 - r) * H; y1 = (1 - l) * H; }
                else if (ori == 180) { x0 = (1 - r) * W; x1 = (1 - l) * W; y0 = (1 - b) * H; y1 = (1 - t) * H; }
                else if (ori == 270) { x0 = (1 - b) * W; x1 = (1 - t) * W; y0 = l * H; y1 = r * H; }
                else { x0 = l * W; x1 = r * W; y0 = t * H; y1 = b * H; }
                Rect rc = new Rect((int) Math.max(0, Math.floor(x0)), (int) Math.max(0, Math.floor(y0)), (int) Math.min(W, Math.ceil(x1)), (int) Math.min(H, Math.ceil(y1)));
                if (rc.width() <= 0 || rc.height() <= 0) throw new Exception("zone vide");
                BitmapFactory.Options op = new BitmapFactory.Options();
                int s = 1, m = Math.max(rc.width(), rc.height());
                while (m / (s * 2) >= max) s *= 2;
                op.inSampleSize = s;
                Bitmap bm = d.decodeRegion(rc, op);
                d.recycle();
                if (bm == null) throw new Exception("zone illisible");
                if (ori != 0) bm = rotate(bm, ori, true);
                long lim = System.currentTimeMillis() - 60000L;
                File[] olds = prevDir.listFiles();
                if (olds != null) for (File x : olds) if (x.getName().startsWith("zone_") && x.lastModified() < lim) x.delete();
                File f = new File(prevDir, "zone_" + System.nanoTime() + ".jpg");
                try (OutputStream os = new FileOutputStream(f)) { bm.compress(Bitmap.CompressFormat.JPEG, 90, os); }
                bm.recycle();
                o.put("ok", true).put("p", f.getAbsolutePath());
                if (inline) o.put("d", "data:image/jpeg;base64," + Base64.encodeToString(readAll(new FileInputStream(f)), Base64.NO_WRAP));
            } catch (Throwable e) {
                try { o.put("ok", false).put("err", msg(e)); } catch (Exception x) { }
            }
            emit("region", o.toString());
        });
    }

    // ================= Infos (EXIF, lieu) =================
    /** Événement "info" : {req, ok, name, path, size, mime, w, h, date, make, model, lens, f, exp, iso, focal, lat, lon, dur, loc (accès au lieu)} */
    @JavascriptInterface public void info(final String req, final String tok) {
        big.execute(() -> {
            JSONObject o = new JSONObject();
            try {
                o.put("req", req).put("tok", tok).put("loc", SDK < 29 || can(P_LOC));
                Uri u = uriOf(tok);
                boolean v = isVid(tok) || ("ext".equals(tok) && extMime.startsWith("video"));
                if (!"ext".equals(tok)) {
                    try (Cursor c = cr().query(u, new String[]{ "_display_name", "_data", "_size", "mime_type", "width", "height" }, null, null, null)) {
                        if (c != null && c.moveToFirst()) o.put("name", str(c.getString(0))).put("path", str(c.getString(1))).put("size", c.getLong(2)).put("mime", str(c.getString(3)));
                    }
                } else o.put("name", extName).put("path", extPath).put("mime", extMime).put("size", new File(extPath).length());
                if (v) {
                    MediaMetadataRetriever r = new MediaMetadataRetriever();
                    try {
                        if ("ext".equals(tok)) r.setDataSource(extPath); else r.setDataSource(a, original(u));
                        String loc = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_LOCATION);
                        if (loc != null) {
                            java.util.regex.Matcher m = java.util.regex.Pattern.compile("([+-][0-9.]+)([+-][0-9.]+)").matcher(loc);
                            if (m.find()) { double la = Double.parseDouble(m.group(1)), lo = Double.parseDouble(m.group(2)); if (la != 0 || lo != 0) o.put("lat", la).put("lon", lo); }
                        }
                        o.put("w", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)).put("h", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
                        o.put("dur", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
                        o.put("rot", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
                        String fps = SDK >= 23 ? r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE) : null;
                        if (fps != null) o.put("fps", fps);
                        o.put("bitrate", r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE));
                    } catch (Throwable e) { } finally { try { r.release(); } catch (Throwable e) { } }
                } else {
                    ExifInterface e;
                    try (InputStream in = "ext".equals(tok) ? new FileInputStream(extPath) : cr().openInputStream(original(u))) { e = new ExifInterface(in); }
                    o.put("make", str(e.getAttribute("Make")).trim()).put("model", str(e.getAttribute("Model")).trim());
                    o.put("lens", str(e.getAttribute("LensModel")).trim());
                    o.put("f", e.getAttributeDouble("FNumber", 0)).put("exp", e.getAttributeDouble("ExposureTime", 0));
                    o.put("iso", e.getAttributeInt("ISOSpeedRatings", 0)).put("focal", e.getAttributeDouble("FocalLength", 0));
                    o.put("focal35", e.getAttributeInt("FocalLengthIn35mmFilm", 0));
                    o.put("flash", e.getAttributeInt("Flash", 0) & 1);
                    o.put("exifDate", str(e.getAttribute("DateTimeOriginal")));
                    int ew = e.getAttributeInt("ImageWidth", 0), eh = e.getAttributeInt("ImageLength", 0);
                    if (ew == 0) { ew = e.getAttributeInt("PixelXDimension", 0); eh = e.getAttributeInt("PixelYDimension", 0); }
                    int ori = e.getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
                    if (ori >= 5) { int x = ew; ew = eh; eh = x; }
                    if (ew > 0) o.put("w", ew).put("h", eh);
                    float[] ll = new float[2];
                    if (e.getLatLong(ll) && (ll[0] != 0 || ll[1] != 0)) o.put("lat", ll[0]).put("lon", ll[1]);
                    double alt = e.getAltitude(Double.NaN);
                    if (!Double.isNaN(alt)) o.put("alt", Math.round(alt));
                }
                o.put("ok", true);
            } catch (Throwable e) {
                try { o.put("ok", false).put("err", msg(e)); } catch (Exception x) { }
            }
            emit("info", o.toString());
        });
    }

    // ================= Lieux (carte) =================
    /**
     * Analyse le GPS de toutes les photos (avec cache). Événements "geo" : {pts:[[id, lat, lon], ...], done, total, end, loc}
     * Les premiers points (déjà en cache) arrivent tout de suite.
     */
    @JavascriptInterface public void geoScan() {
        synchronized (this) { if (geoRunning) return; geoRunning = true; }
        geo.execute(() -> {
            try { doGeo(); } catch (Throwable e) { } finally { synchronized (this) { geoRunning = false; } }
        });
    }
    private void doGeo() throws Exception {
        boolean loc = SDK < 29 || can(P_LOC);
        File cf = new File(a.getFilesDir(), "galerie-lieux.txt");
        HashMap<String, double[]> cache = new HashMap<>();
        if (cf.exists()) {
            for (String line : new String(readAll(new FileInputStream(cf)), "UTF-8").split("\n")) {
                String[] p = line.split(";");
                if (p.length == 3) try { cache.put(p[0], new double[]{ Double.parseDouble(p[1]), Double.parseDouble(p[2]) }); } catch (Exception e) { }
            }
        }
        ArrayList<long[]> todo = new ArrayList<>();
        JSONArray first = new JSONArray();
        HashMap<String, double[]> keep = new HashMap<>();
        try (Cursor c = cr().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, new String[]{ "_id", "date_modified" }, null, null, "date_modified DESC")) {
            while (c != null && c.moveToNext()) {
                long id = c.getLong(0), mod = c.getLong(1);
                String k = id + "_" + mod;
                double[] g = cache.get(k);
                if (g != null) { keep.put(k, g); if (g[0] != 0 || g[1] != 0) first.put(new JSONArray().put(id).put(g[0]).put(g[1])); }
                else todo.add(new long[]{ id, mod });
            }
        }
        int total = keep.size() + todo.size(), done = keep.size();
        emit("geo", new JSONObject().put("pts", first).put("done", done).put("total", total).put("end", todo.isEmpty()).put("loc", loc).toString());
        if (todo.isEmpty() || !loc) { if (!loc) emit("geo", new JSONObject().put("pts", new JSONArray()).put("done", total).put("total", total).put("end", true).put("loc", false).toString()); return; }
        JSONArray batch = new JSONArray();
        long lastEmit = System.currentTimeMillis();
        for (long[] it : todo) {
            double la = 0, lo = 0;
            try (InputStream in = cr().openInputStream(original(ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, it[0])))) {
                ExifInterface e = new ExifInterface(in);
                float[] ll = new float[2];
                if (e.getLatLong(ll)) { la = ll[0]; lo = ll[1]; }
            } catch (Throwable e) { }
            keep.put(it[0] + "_" + it[1], new double[]{ la, lo });
            if (la != 0 || lo != 0) batch.put(new JSONArray().put(it[0]).put(la).put(lo));
            done++;
            if (System.currentTimeMillis() - lastEmit > 700) {
                emit("geo", new JSONObject().put("pts", batch).put("done", done).put("total", total).put("end", false).put("loc", true).toString());
                batch = new JSONArray(); lastEmit = System.currentTimeMillis();
                if (done % 500 == 0) saveGeo(cf, keep);
            }
        }
        saveGeo(cf, keep);
        emit("geo", new JSONObject().put("pts", batch).put("done", done).put("total", total).put("end", true).put("loc", true).toString());
    }
    private void saveGeo(File cf, HashMap<String, double[]> m) {
        StringBuilder sb = new StringBuilder();
        for (java.util.Map.Entry<String, double[]> e : m.entrySet()) sb.append(e.getKey()).append(';').append((float) e.getValue()[0]).append(';').append((float) e.getValue()[1]).append('\n');
        try (OutputStream o = new FileOutputStream(cf)) { o.write(sb.toString().getBytes("UTF-8")); } catch (Exception e) { }
    }

    // ================= Partager, ouvrir, utiliser comme =================
    private String mimeOf(Uri u) {
        if (u == extUri) return extMime.isEmpty() ? "*/*" : extMime;
        try { String m = cr().getType(u); if (m != null) return m; } catch (Throwable e) { }
        return u.toString().contains("/video/") ? "video/*" : "image/*";
    }
    @JavascriptInterface public void share(final String csv) {
        ui(() -> {
            ArrayList<Uri> l = uris(csv);
            if (l.isEmpty()) return;
            try {
                Intent i;
                if (l.size() == 1) {
                    i = new Intent(Intent.ACTION_SEND).setType(mimeOf(l.get(0))).putExtra(Intent.EXTRA_STREAM, l.get(0));
                } else {
                    boolean img = false, vid = false;
                    for (Uri u : l) { if (mimeOf(u).startsWith("video")) vid = true; else img = true; }
                    i = new Intent(Intent.ACTION_SEND_MULTIPLE).setType(img && vid ? "*/*" : vid ? "video/*" : "image/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM, l);
                }
                ClipData cd = ClipData.newRawUri("", l.get(0));
                for (int k = 1; k < l.size(); k++) cd.addItem(new ClipData.Item(l.get(k)));
                i.setClipData(cd);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                a.startActivity(Intent.createChooser(i, l.size() == 1 ? "Partager" : "Partager " + l.size() + " éléments"));
            } catch (Throwable e) { toast("Partage impossible"); }
        });
    }
    /** Ouvrir avec une autre appli (lecteur, visionneuse…) */
    @JavascriptInterface public void openWith(final String tok) { send(Intent.ACTION_VIEW, tok, "Ouvrir avec"); }
    /** « Utiliser comme » : fond d'écran, photo de contact… */
    @JavascriptInterface public void useAs(final String tok) { send(Intent.ACTION_ATTACH_DATA, tok, "Utiliser comme"); }
    /** Modifier avec une autre appli */
    @JavascriptInterface public void editWith(final String tok) { send(Intent.ACTION_EDIT, tok, "Modifier avec"); }
    private void send(final String action, final String tok, final String title) {
        ui(() -> {
            Uri u = uriOf(tok);
            if (u == null) return;
            try {
                Intent i = new Intent(action).setDataAndType(u, mimeOf(u));
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | (Intent.ACTION_EDIT.equals(action) ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0));
                if (Intent.ACTION_ATTACH_DATA.equals(action)) i.putExtra("mimeType", mimeOf(u));
                a.startActivity(Intent.createChooser(i, title));
            } catch (Throwable e) { toast("Aucune appli ne peut faire ça"); }
        });
    }
    /** Ouvre une adresse (geo:, https:) dans l'appli adaptée */
    @JavascriptInterface public void openUrl(final String url) {
        ui(() -> {
            try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Throwable e) { toast("Aucune appli pour ouvrir ce lien"); }
        });
    }
    /** Plein écran (masque les barres système) pendant la visionneuse */
    @JavascriptInterface public void immersive(final boolean on) {
        ui(() -> {
            try {
                Window w = a.getWindow();
                View d = w.getDecorView();
                if (on) d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
                else d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            } catch (Throwable e) { }
        });
    }
    /** Fond d'écran direct : which = "home", "lock" ou "both". Événement "op" {op:"wallpaper", ok} */
    @JavascriptInterface public void setWallpaper(final String tok, final String which) {
        big.execute(() -> {
            boolean ok = false;
            try {
                DisplayMetrics dm = new DisplayMetrics();
                a.getWindowManager().getDefaultDisplay().getRealMetrics(dm);
                int sw = Math.min(dm.widthPixels, dm.heightPixels), sh = Math.max(dm.widthPixels, dm.heightPixels);
                Bitmap b = decode(uriOf(tok), Math.max(sw, sh) * 2);
                float k = Math.max((float) sw / b.getWidth(), (float) sh / b.getHeight());
                int cw = Math.round(sw / k), ch = Math.round(sh / k);
                Bitmap c = Bitmap.createBitmap(b, Math.max(0, (b.getWidth() - cw) / 2), Math.max(0, (b.getHeight() - ch) / 2), Math.min(cw, b.getWidth()), Math.min(ch, b.getHeight()));
                Bitmap out = Bitmap.createScaledBitmap(c, sw, sh, true);
                int fl = "home".equals(which) ? WallpaperManager.FLAG_SYSTEM : "lock".equals(which) ? WallpaperManager.FLAG_LOCK : WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK;
                WallpaperManager.getInstance(a).setBitmap(out, null, true, fl);
                ok = true;
            } catch (Throwable e) { toast("Fond d'écran impossible : " + msg(e)); }
            opDone("wallpaper", ok, tok);
        });
    }

    // ================= Favoris, corbeille, suppression =================
    private void opDone(String op, boolean ok, String toks) {
        try { emit("op", new JSONObject().put("op", op).put("ok", ok).put("toks", toks == null ? "" : toks).toString()); } catch (Exception e) { }
        pendOp = null; pendToks = null;
    }
    private void askSystem(final PendingIntent pi, final int code, String op, String toks) {
        pendOp = op; pendToks = toks;
        ui(() -> {
            try { a.startIntentSenderForResult(pi.getIntentSender(), code, null, 0, 0, 0); }
            catch (Throwable e) { toast("Action impossible : " + msg(e)); opDone(pendOp, false, pendToks); }
        });
    }
    /** Ajoute ou retire des favoris. Android 11+ : confirmation système. Événement "op" {op:"fav"|"unfav", ok, toks} */
    @JavascriptInterface public void favorite(final String csv, final boolean on) {
        if (SDK >= 30) {
            try { askSystem(MediaStore.createFavoriteRequest(cr(), uris(csv), on), REQ_FAV, on ? "fav" : "unfav", csv); }
            catch (Throwable e) { toast("Favori impossible"); opDone(on ? "fav" : "unfav", false, csv); }
            return;
        }
        Set<String> s = new HashSet<>(prefs().getStringSet("favs", new HashSet<String>()));
        for (String t : csv.split(",")) { if (t.isEmpty()) continue; String k = (isVid(t) ? "v" : "i") + idOf(t); if (on) s.add(k); else s.remove(k); }
        prefs().edit().putStringSet("favs", s).apply();
        opDone(on ? "fav" : "unfav", true, csv);
    }
    /** Met à la corbeille (Android 11+, 30 jours) ; avant Android 11 : suppression définitive. Événement "op" {op:"trash"} */
    @JavascriptInterface public void trash(final String csv) {
        final ArrayList<Uri> l = uris(csv);
        if (l.isEmpty()) return;
        if (SDK >= 30) {
            try { askSystem(MediaStore.createTrashRequest(cr(), l, true), REQ_TRASH, "trash", csv); }
            catch (Throwable e) { toast("Suppression impossible"); opDone("trash", false, csv); }
            return;
        }
        pendToks = csv;
        io.execute(() -> legacyDelete(l));
    }
    private void legacyDelete(ArrayList<Uri> l) {
        ArrayList<Uri> left = new ArrayList<>(l);
        while (!left.isEmpty()) {
            Uri u = left.get(0);
            try { cr().delete(u, null, null); left.remove(0); }
            catch (SecurityException e) {
                if (SDK >= 29 && e instanceof android.app.RecoverableSecurityException) {
                    legacyLeft = left;
                    final android.app.RecoverableSecurityException r = (android.app.RecoverableSecurityException) e;
                    ui(() -> {
                        try { a.startIntentSenderForResult(r.getUserAction().getActionIntent().getIntentSender(), REQ_DEL_LEGACY, null, 0, 0, 0); }
                        catch (Throwable x) { opDone("trash", false, pendToks); }
                    });
                    return;
                }
                toast("Suppression refusée"); opDone("trash", false, pendToks); return;
            } catch (Throwable e) { left.remove(0); }
        }
        legacyLeft = null;
        opDone("trash", true, pendToks);
    }
    /** Restaure depuis la corbeille (Android 11+) */
    @JavascriptInterface public void restore(final String csv) {
        if (SDK < 30) return;
        try { askSystem(MediaStore.createTrashRequest(cr(), uris(csv), false), REQ_RESTORE, "restore", csv); }
        catch (Throwable e) { toast("Restauration impossible"); opDone("restore", false, csv); }
    }
    /** Supprime définitivement (Android 11+, confirmation système) */
    @JavascriptInterface public void deleteForever(final String csv) {
        if (SDK < 30) { trash(csv); return; }
        try { askSystem(MediaStore.createDeleteRequest(cr(), uris(csv)), REQ_DELETE, "delete", csv); }
        catch (Throwable e) { toast("Suppression impossible"); opDone("delete", false, csv); }
    }

    // ================= Enregistrer une copie (éditeur) =================
    /**
     * Enregistre un JPEG (base64, avec ou sans préfixe data:) dans Pictures/Galerie.
     * srcTok : élément d'origine (copie la date et le GPS) ou "". Événement "saved" : {ok, tok, path, item, err}
     */
    @JavascriptInterface public void saveCopy(final String b64, final String name, final String srcTok) {
        io.execute(() -> {
            JSONObject r = new JSONObject();
            try {
                String s = b64; int c = s.indexOf(','); if (s.startsWith("data:") && c > 0) s = s.substring(c + 1);
                byte[] data = Base64.decode(s, Base64.DEFAULT);
                String n = (name == null || name.trim().isEmpty()) ? "Galerie_" + System.currentTimeMillis() + ".jpg" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (!n.toLowerCase().endsWith(".jpg") && !n.toLowerCase().endsWith(".jpeg")) n += ".jpg";
                File tmp = new File(a.getCacheDir(), "galerie-copie.jpg");
                try (OutputStream o = new FileOutputStream(tmp)) { o.write(data); }
                long taken = System.currentTimeMillis();
                // Reprend les métadonnées utiles de l'original
                if (srcTok != null && !srcTok.isEmpty()) {
                    try {
                        ExifInterface src;
                        try (InputStream in = "ext".equals(srcTok) ? new FileInputStream(extPath) : cr().openInputStream(original(uriOf(srcTok)))) { src = new ExifInterface(in); }
                        ExifInterface dst = new ExifInterface(tmp.getAbsolutePath());
                        for (String t : new String[]{ "DateTime", "DateTimeOriginal", "DateTimeDigitized", "Make", "Model", "FNumber", "ExposureTime", "ISOSpeedRatings", "FocalLength",
                                "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef", "GPSAltitude", "GPSAltitudeRef", "GPSTimeStamp", "GPSDateStamp" }) {
                            String v = src.getAttribute(t); if (v != null) dst.setAttribute(t, v);
                        }
                        dst.setAttribute(ExifInterface.TAG_ORIENTATION, "1");
                        dst.setAttribute("Software", "Galerie");
                        dst.saveAttributes();
                    } catch (Throwable e) { }
                    if (!"ext".equals(srcTok)) {
                        try (Cursor cu = cr().query(uriOf(srcTok), new String[]{ "datetaken" }, null, null, null)) { if (cu != null && cu.moveToFirst() && cu.getLong(0) > 0) taken = cu.getLong(0) + 1000; } catch (Throwable e) { }
                    }
                }
                Uri out;
                if (SDK >= 29) {
                    ContentValues v = new ContentValues();
                    v.put("_display_name", n); v.put("mime_type", "image/jpeg");
                    v.put("relative_path", Environment.DIRECTORY_PICTURES + "/Galerie");
                    v.put("datetaken", taken); v.put("is_pending", 1);
                    out = cr().insert(MediaStore.Images.Media.getContentUri("external_primary"), v);
                    if (out == null) throw new Exception("insertion refusée");
                    try (OutputStream o = cr().openOutputStream(out); InputStream in = new FileInputStream(tmp)) { copy(in, o); }
                    ContentValues v2 = new ContentValues(); v2.put("is_pending", 0);
                    cr().update(out, v2, null, null);
                    try (Cursor cu = cr().query(out, new String[]{ "_data" }, null, null, null)) { if (cu != null && cu.moveToFirst()) r.put("path", str(cu.getString(0))); }
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Galerie");
                    dir.mkdirs();
                    File f = new File(dir, n); int k = 1;
                    while (f.exists()) f = new File(dir, n.replaceAll("(\\.jpe?g)$", "_" + (k++) + "$1"));
                    try (OutputStream o = new FileOutputStream(f); InputStream in = new FileInputStream(tmp)) { copy(in, o); }
                    ContentValues v = new ContentValues();
                    v.put("_data", f.getAbsolutePath()); v.put("_display_name", f.getName()); v.put("mime_type", "image/jpeg"); v.put("datetaken", taken);
                    out = cr().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                    if (out == null) MediaScannerConnection.scanFile(a, new String[]{ f.getAbsolutePath() }, new String[]{ "image/jpeg" }, null);
                    r.put("path", f.getAbsolutePath());
                }
                tmp.delete();
                long id = out == null ? -1 : ContentUris.parseId(out);
                r.put("ok", true).put("tok", id + ":0");
                if (id > 0) { String it = item(id + ":0"); if (!it.isEmpty()) r.put("item", new JSONArray(it)); }
            } catch (Throwable e) {
                try { r.put("ok", false).put("err", msg(e)); } catch (Exception x) { }
            }
            emit("saved", r.toString());
        });
    }
    private static void copy(InputStream in, OutputStream o) throws Exception {
        byte[] buf = new byte[65536]; int n;
        while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
    }

    // ================= « Ouvrir avec Galerie » =================
    /** Élément reçu d'une autre appli et pas encore affiché : {kind:"media", item:[...]} ou {kind:"ext", p, name, mime}, sinon "" */
    @JavascriptInterface public String pendingOpen() { String s = pendingOpen; pendingOpen = ""; return s; }
    /** La page a affiché l'élément reçu : retour à l'appli d'origine au bouton Retour */
    @JavascriptInterface public void finish() { ui(() -> { try { a.moveTaskToBack(true); } catch (Throwable e) { } }); }

    private void handleIntent(Intent i) {
        if (i == null || i == lastIntent) return;
        String act = i.getAction();
        Uri u = i.getData();
        if (u == null && Intent.ACTION_SEND.equals(act)) { try { u = i.getParcelableExtra(Intent.EXTRA_STREAM); } catch (Throwable e) { } }
        if (u == null || !(Intent.ACTION_VIEW.equals(act) || Intent.ACTION_SEND.equals(act) || "com.android.camera.action.REVIEW".equals(act))) return;
        lastIntent = i;
        final Uri uri = u;
        final String type = i.getType() != null ? i.getType() : "";
        io.execute(() -> {
            JSONObject o = new JSONObject();
            try {
                String mime = type.isEmpty() ? str(cr().getType(uri)) : type;
                boolean media = "media".equals(uri.getAuthority());
                if (media) {
                    long id = -1;
                    try { id = ContentUris.parseId(uri); } catch (Throwable e) { }
                    boolean v = mime.startsWith("video") || uri.getPath().contains("/video/");
                    String it = id > 0 ? item(id + ":" + (v ? 1 : 0)) : "";
                    if (!it.isEmpty()) {
                        o.put("kind", "media").put("item", new JSONArray(it));
                        publishOpen(o.toString());
                        return;
                    }
                }
                // Fichier d'une autre appli : copie locale pour l'afficher
                String name = "fichier";
                try (Cursor c = cr().query(uri, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) { if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0); } catch (Throwable e) { }
                if ("file".equals(uri.getScheme()) && uri.getLastPathSegment() != null) name = uri.getLastPathSegment();
                File dir = new File(a.getCacheDir(), "galerie-recu"); dir.mkdirs();
                File[] old = dir.listFiles(); if (old != null) for (File f : old) f.delete();
                File f = new File(dir, name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                try (InputStream in = "file".equals(uri.getScheme()) ? new FileInputStream(uri.getPath()) : cr().openInputStream(uri); OutputStream out = new FileOutputStream(f)) { copy(in, out); }
                if (mime.isEmpty()) mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substring(name.lastIndexOf('.') + 1).toLowerCase());
                extUri = uri; extMime = mime == null ? "" : mime; extPath = f.getAbsolutePath(); extName = name;
                o.put("kind", "ext").put("p", extPath).put("name", name).put("mime", extMime).put("size", f.length()).put("date", System.currentTimeMillis());
                publishOpen(o.toString());
            } catch (Throwable e) { toast("Impossible d'ouvrir ce fichier : " + msg(e)); }
        });
    }
    private void publishOpen(String json) {
        pendingOpen = json;
        emit("open", json);
    }
}
