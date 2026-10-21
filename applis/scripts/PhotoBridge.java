package __PKG__;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.graphics.drawable.Icon;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Size;
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
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Photo : pont entre la page www-photo et l'appareil photo natif (PhotoCamera) / MediaStore.
 * Exposé en JS sous window.MAGPhoto. Événements : window.photoEvent(type, json).
 * Les images ne sont jamais transmises par chemin de fichier : toujours en data:image/jpeg;base64.
 * Identifiant d'un élément : « id » MediaStore (images) ou « v<id> » (vidéos).
 */
public class PhotoBridge {
    private static final int REQ_CAMERA = 5410, REQ_PERM = 5420, REQ_DELETE = 5430, REQ_MOVE = 5431;
    private static final int SDK = Build.VERSION.SDK_INT;
    static final String PREFS = "photo", ROOT = "DCIM/Photo";
    private final Activity a;
    private final WebView wv;
    private ExecutorService io, thumbs;
    private String pendDelete = "", pendMove = "";

    public PhotoBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    private synchronized ExecutorService io() { if (io == null) io = Executors.newSingleThreadExecutor(); return io; }
    private synchronized ExecutorService th() { if (thumbs == null) thumbs = Executors.newFixedThreadPool(2); return thumbs; }

    // ================= Cycle de vie =================
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode < 5400 || requestCode > 5499) return;
        try {
            if (requestCode == REQ_CAMERA) {
                JSONObject o = new JSONObject();
                o.put("shots", data == null ? 0 : data.getIntExtra("shots", 0));
                o.put("ok", resultCode == Activity.RESULT_OK);
                emit("camera", o.toString());
            } else if (requestCode == REQ_DELETE) {
                JSONObject o = new JSONObject(); o.put("ok", resultCode == Activity.RESULT_OK); o.put("ids", pendDelete);
                pendDelete = ""; emit("deleted", o.toString());
            } else if (requestCode == REQ_MOVE) {
                final String[] p = pendMove.split("\n", -1); pendMove = "";
                if (resultCode == Activity.RESULT_OK && p.length == 2) io().execute(() -> doRename(p[0], p[1], false));
                else emit("renamed", "{\"ok\":false,\"moved\":0,\"failed\":0}");
            }
        } catch (Throwable e) { }
    }
    public void onPermissions(int requestCode) { if (requestCode == REQ_PERM || requestCode == 5401) emit("perm", permState()); }
    public void onResume() { emit("resume", "{}"); }
    public void onIntent(Intent i) { }

    // ================= Outils =================
    private SharedPreferences sp() { return a.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private ContentResolver cr() { return a.getContentResolver(); }
    private boolean can(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private void ui(Runnable r) { a.runOnUiThread(r); }
    private void toast(final String t) { ui(() -> Toast.makeText(a, t, Toast.LENGTH_SHORT).show()); }
    private void emit(String type, String json) {
        final String js = "window.photoEvent&&photoEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "" : json) + ")";
        ui(() -> { try { wv.evaluateJavascript(js, null); } catch (Throwable e) { } });
    }
    private static String err(Throwable t) { return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage(); }
    private static boolean isVid(String id) { return id != null && id.startsWith("v"); }
    private static long num(String id) { try { return Long.parseLong(isVid(id) ? id.substring(1) : id); } catch (Exception e) { return -1; } }
    private static Uri uriOf(String id) {
        long n = num(id); if (n < 0) return null;
        return ContentUris.withAppendedId(isVid(id) ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, n);
    }
    private Uri original(Uri u) {
        if (SDK >= 29 && can("android.permission.ACCESS_MEDIA_LOCATION")) { try { return MediaStore.setRequireOriginal(u); } catch (Throwable e) { } }
        return u;
    }
    private static String rel(String dir) { String d = safeName(dir); return ROOT + (d.isEmpty() ? "" : "/" + d) + "/"; }
    /** Même règle que PhotoCamera.safeDir (dupliquée : ce pont est compilé dans toutes les applis, même sans PhotoCamera) */
    static String safeName(String s) {
        if (s == null) return "";
        s = s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
        while (s.startsWith(".")) s = s.substring(1);
        if (s.length() > 60) s = s.substring(0, 60).trim();
        return s;
    }
    static String ascii(String s) {
        if (s == null) return "";
        s = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").replace("\u00b1", "+/-").replace("\u00b7", "-");
        return s.replaceAll("[^\\x20-\\x7E]", " ");
    }
    static void copy(InputStream in, OutputStream o) throws java.io.IOException { byte[] b = new byte[1 << 16]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); }
    static final String[] EXIF_TAGS = {
        ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME_DIGITIZED, ExifInterface.TAG_OFFSET_TIME, ExifInterface.TAG_OFFSET_TIME_ORIGINAL,
        ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL, ExifInterface.TAG_ARTIST, ExifInterface.TAG_IMAGE_DESCRIPTION,
        ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF, ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_LONGITUDE_REF,
        ExifInterface.TAG_GPS_ALTITUDE, ExifInterface.TAG_GPS_ALTITUDE_REF, ExifInterface.TAG_GPS_DATESTAMP, ExifInterface.TAG_GPS_TIMESTAMP
    };
    static void copyExif(ExifInterface from, ExifInterface to) { for (String t : EXIF_TAGS) { try { String v = from.getAttribute(t); if (v != null) to.setAttribute(t, v); } catch (Throwable e) { } } }

    // ================= Général =================
    @JavascriptInterface public String version() { return "1"; }
    @JavascriptInterface public int sdk() { return SDK; }
    @JavascriptInterface public String device() { return Build.MANUFACTURER + " " + Build.MODEL + " · Android " + Build.VERSION.RELEASE; }

    /** Ouvre l'appareil photo natif. */
    @JavascriptInterface public void openCamera() {
        ui(() -> {
            try { a.startActivityForResult(new Intent().setClassName(a, cam()), REQ_CAMERA); a.overridePendingTransition(0, 0); }
            catch (Throwable e) { toast("Appareil photo indisponible : " + err(e)); }
        });
    }

    /** Nom complet de la classe de l'activité native (même paquet Java que ce pont) */
    private String cam() { return PhotoBridge.class.getName().replace("PhotoBridge", "PhotoCamera"); }

    /** Tous les objectifs déclarés par Android (JSON, voir PhotoCamera.describe). */
    @JavascriptInterface public String lenses() {
        try { return (String) Class.forName(cam()).getMethod("describe", Context.class).invoke(null, a); }
        catch (Throwable e) { return "{\"lenses\":[],\"error\":\"PhotoCamera absent de cette application\"}"; }
    }
    /** true si l'activité PhotoCamera est bien déclarée dans le manifeste de cette application */
    @JavascriptInterface public boolean hasCamera() {
        try { a.getPackageManager().getActivityInfo(new android.content.ComponentName(a, cam()), 0); return true; }
        catch (Throwable e) { return false; }
    }

    // ================= Réglages partagés avec l'appareil photo =================
    private static final String[] BOOL = { "siteMode", "stamp", "keepOrig", "geo", "sound", "grid", "level" };
    private static final boolean[] BOOL_DEF = { false, true, true, true, true, false, true };

    @JavascriptInterface public String getSettings() {
        SharedPreferences s = sp(); JSONObject o = new JSONObject();
        try {
            for (int i = 0; i < BOOL.length; i++) o.put(BOOL[i], s.getBoolean(BOOL[i], BOOL_DEF[i]));
            o.put("quality", s.getString("quality", "max")); o.put("flash", s.getString("flash", "auto"));
            o.put("timer", s.getInt("timer", 0)); o.put("note", s.getString("note", "")); o.put("author", s.getString("author", ""));
            o.put("lens", s.getString("lens", ""));
        } catch (Throwable e) { }
        return o.toString();
    }
    @JavascriptInterface public void setSettings(String json) {
        try {
            JSONObject o = new JSONObject(json); SharedPreferences.Editor e = sp().edit();
            for (String k : BOOL) if (o.has(k)) e.putBoolean(k, o.getBoolean(k));
            for (String k : new String[]{ "quality", "flash", "note", "author" }) if (o.has(k)) e.putString(k, o.getString(k));
            if (o.has("timer")) e.putInt("timer", o.getInt("timer"));
            e.apply();
        } catch (Throwable x) { }
    }

    /** Liste des chantiers (JSON [{id,name,dir,client,addr,created,archived}]) : la même pour la page et l'appareil photo. */
    @JavascriptInterface public String getSites() { return sp().getString("sites", "[]"); }
    @JavascriptInterface public void setSites(String json) { try { new JSONArray(json); sp().edit().putString("sites", json).apply(); } catch (Throwable e) { } }
    /** Chantier actif (objet JSON, « {} » si aucun) */
    @JavascriptInterface public String getActive() { return sp().getString("site", "{}"); }
    @JavascriptInterface public void setActive(String json) {
        try {
            JSONObject o = new JSONObject(json == null || json.isEmpty() ? "{}" : json);
            if (o.has("name") && !o.has("dir")) o.put("dir", safeName(o.getString("name")));
            sp().edit().putString("site", o.toString()).apply();
        } catch (Throwable e) { }
    }
    /** Nom de dossier sûr pour un nom de chantier */
    @JavascriptInterface public String safeDir(String name) { return safeName(name); }

    // ================= Autorisations =================
    /** {camera, location, read, mediaLoc, sdk} */
    @JavascriptInterface public String permState() {
        JSONObject o = new JSONObject();
        try {
            o.put("camera", can(Manifest.permission.CAMERA));
            o.put("location", can(Manifest.permission.ACCESS_FINE_LOCATION) || can(Manifest.permission.ACCESS_COARSE_LOCATION));
            o.put("read", SDK >= 33 ? can("android.permission.READ_MEDIA_IMAGES") : can(Manifest.permission.READ_EXTERNAL_STORAGE));
            o.put("mediaLoc", SDK < 29 || can("android.permission.ACCESS_MEDIA_LOCATION"));
            o.put("sdk", SDK);
        } catch (Throwable e) { }
        return o.toString();
    }
    /** what : « all », « camera », « location », « photos » */
    @JavascriptInterface public void askPerm(final String what) {
        ui(() -> {
            List<String> p = new ArrayList<>();
            boolean all = "all".equals(what);
            if (all || "camera".equals(what)) p.add(Manifest.permission.CAMERA);
            if (all || "location".equals(what)) { p.add(Manifest.permission.ACCESS_FINE_LOCATION); p.add(Manifest.permission.ACCESS_COARSE_LOCATION); }
            if (all || "photos".equals(what)) {
                if (SDK >= 33) { p.add("android.permission.READ_MEDIA_IMAGES"); p.add("android.permission.READ_MEDIA_VIDEO"); }
                else p.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                if (SDK >= 29) p.add("android.permission.ACCESS_MEDIA_LOCATION");
                if (SDK <= 28) p.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
            List<String> need = new ArrayList<>();
            for (String x : p) if (!can(x)) need.add(x);
            if (need.isEmpty()) { emit("perm", permState()); return; }
            a.requestPermissions(need.toArray(new String[0]), REQ_PERM);
        });
    }
    @JavascriptInterface public void openSettings() {
        ui(() -> { try { a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()))); } catch (Throwable e) { } });
    }

    // ================= Lecture des photos =================
    /**
     * Photos d'un dossier : dir = nom du chantier (sous-dossier de DCIM/Photo), « » = DCIM/Photo seul, « * » = tout DCIM/Photo.
     * Réponse : photoEvent("list", {req, dir, items:[{id, name, date, w, h, video, size, desc, folder}]}) du plus récent au plus ancien.
     */
    @JavascriptInterface public void list(final String req, final String dir, final int limit) {
        io().execute(() -> {
            JSONObject r = new JSONObject();
            try {
                r.put("req", req); r.put("dir", dir);
                JSONArray items = new JSONArray();
                query(items, false, dir, limit);
                query(items, true, dir, limit);
                // Tri par date décroissante
                List<JSONObject> l = new ArrayList<>();
                for (int i = 0; i < items.length(); i++) l.add(items.getJSONObject(i));
                java.util.Collections.sort(l, (x, y) -> Long.compare(y.optLong("date"), x.optLong("date")));
                JSONArray out = new JSONArray();
                for (int i = 0; i < l.size() && (limit <= 0 || i < limit); i++) out.put(l.get(i));
                r.put("items", out);
            } catch (Throwable e) { try { r.put("error", err(e)); } catch (Throwable x) { } }
            emit("list", r.toString());
        });
    }

    @SuppressWarnings("deprecation")
    private void query(JSONArray out, boolean video, String dir, int limit) {
        Uri base = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        boolean all = "*".equals(dir);
        String want = all ? ROOT + "/" : rel(dir);
        List<String> cols = new ArrayList<>();
        cols.add(MediaStore.MediaColumns._ID); cols.add(MediaStore.MediaColumns.DISPLAY_NAME); cols.add(MediaStore.MediaColumns.SIZE);
        cols.add(MediaStore.MediaColumns.WIDTH); cols.add(MediaStore.MediaColumns.HEIGHT); cols.add(MediaStore.MediaColumns.DATE_MODIFIED);
        cols.add(MediaStore.Images.ImageColumns.DATE_TAKEN);
        if (!video) cols.add(MediaStore.Images.ImageColumns.DESCRIPTION);
        cols.add(SDK >= 29 ? MediaStore.MediaColumns.RELATIVE_PATH : MediaStore.MediaColumns.DATA);
        String sel; String[] args;
        if (SDK >= 29) {
            if (all) { sel = MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?"; args = new String[]{ want + "%" }; }
            else { sel = MediaStore.MediaColumns.RELATIVE_PATH + "=?"; args = new String[]{ want }; }
        } else {
            sel = MediaStore.MediaColumns.DATA + " LIKE ?";
            args = new String[]{ "%/" + want + "%" };
        }
        try (Cursor c = cr().query(base, cols.toArray(new String[0]), sel, args, MediaStore.Images.ImageColumns.DATE_TAKEN + " DESC")) {
            if (c == null) return;
            int n = 0;
            while (c.moveToNext() && (limit <= 0 || n < limit)) {
                String path = c.getString(cols.size() - 1);
                String relp;
                if (SDK >= 29) relp = path == null ? "" : path;
                else {
                    if (path == null) continue;
                    int k = path.indexOf("/" + ROOT + "/"); if (k < 0) continue;
                    relp = path.substring(k + 1, path.lastIndexOf('/') + 1);
                    if (!all && !relp.equals(want)) continue;
                }
                JSONObject o = new JSONObject();
                long id = c.getLong(0);
                o.put("id", (video ? "v" : "") + id);
                o.put("name", c.getString(1));
                o.put("size", c.getLong(2));
                o.put("w", c.getInt(3)); o.put("h", c.getInt(4));
                long taken = c.getLong(6); if (taken <= 0) taken = c.getLong(5) * 1000L;
                o.put("date", taken);
                o.put("video", video);
                if (!video) { String d = c.getString(7); o.put("desc", d == null ? "" : d); }
                String folder = relp.startsWith(ROOT + "/") ? relp.substring(ROOT.length() + 1) : relp;
                if (folder.endsWith("/")) folder = folder.substring(0, folder.length() - 1);
                o.put("folder", folder);
                out.put(o); n++;
            }
        } catch (Throwable e) { }
    }

    /** Nombre de photos et dernière photo par sous-dossier de DCIM/Photo : photoEvent("stats", {req, dirs:{"Villa Martin":{n, last, date}}, total}) */
    @JavascriptInterface public void stats(final String req) {
        io().execute(() -> {
            JSONObject r = new JSONObject();
            try {
                JSONArray items = new JSONArray();
                query(items, false, "*", 0);
                query(items, true, "*", 0);
                JSONObject dirs = new JSONObject();
                for (int i = 0; i < items.length(); i++) {
                    JSONObject it = items.getJSONObject(i);
                    String f = it.optString("folder");
                    if (f.endsWith("/Originaux") || f.equals("Originaux")) continue;
                    JSONObject d = dirs.optJSONObject(f);
                    if (d == null) { d = new JSONObject(); d.put("n", 0); d.put("date", 0); dirs.put(f, d); }
                    d.put("n", d.getInt("n") + 1);
                    if (it.getLong("date") > d.getLong("date") && !it.optBoolean("video")) { d.put("date", it.getLong("date")); d.put("last", it.getString("id")); }
                }
                r.put("req", req); r.put("dirs", dirs); r.put("total", items.length());
            } catch (Throwable e) { try { r.put("error", err(e)); } catch (Throwable x) { } }
            emit("stats", r.toString());
        });
    }

    /** Miniatures carrées : photoEvent("thumb", {req, id, data}) pour chaque id (séparés par des virgules). */
    @JavascriptInterface public void thumbs(final String req, final String csv, final int size) {
        if (csv == null) return;
        for (final String id : csv.split(",")) {
            if (id.trim().isEmpty()) continue;
            th().execute(() -> {
                JSONObject r = new JSONObject();
                try {
                    r.put("req", req); r.put("id", id.trim());
                    Bitmap b = thumbBitmap(id.trim(), Math.max(48, Math.min(size, 512)));
                    r.put("data", b == null ? "" : dataUrl(b, 80));
                    if (b != null) b.recycle();
                } catch (Throwable e) { try { r.put("data", ""); } catch (Throwable x) { } }
                emit("thumb", r.toString());
            });
        }
    }

    /** Miniature synchrone (pour la tuile de l'écran d'accueil) : data:… ou « » */
    @JavascriptInterface public String thumbSync(String id, int size) {
        try { Bitmap b = thumbBitmap(id, Math.max(48, Math.min(size, 512))); if (b == null) return ""; String s = dataUrl(b, 75); b.recycle(); return s; }
        catch (Throwable e) { return ""; }
    }

    @SuppressWarnings("deprecation")
    private Bitmap thumbBitmap(String id, int size) throws Exception {
        Uri u = uriOf(id); if (u == null) return null;
        Bitmap b = null;
        if (SDK >= 29) b = cr().loadThumbnail(u, new Size(size, size), null);
        else if (isVid(id)) b = MediaStore.Video.Thumbnails.getThumbnail(cr(), num(id), MediaStore.Video.Thumbnails.MINI_KIND, null);
        else b = decode(u, size);
        if (b == null) return null;
        // Recadrage carré au centre
        int w = b.getWidth(), h = b.getHeight(), s = Math.min(w, h);
        Bitmap c = Bitmap.createBitmap(b, (w - s) / 2, (h - s) / 2, s, s);
        if (s > size) { Bitmap d = Bitmap.createScaledBitmap(c, size, size, true); if (c != b) c.recycle(); c = d; }
        if (c != b) b.recycle();
        return c;
    }

    /** Décode une image avec l'orientation EXIF appliquée, côté le plus long <= max */
    private Bitmap decode(Uri u, int max) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true;
        try (InputStream in = cr().openInputStream(u)) { BitmapFactory.decodeStream(in, null, o); }
        int s = 1;
        while (Math.max(o.outWidth, o.outHeight) / (s * 2) >= max) s *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options(); d.inSampleSize = s;
        Bitmap b;
        try (InputStream in = cr().openInputStream(u)) { b = BitmapFactory.decodeStream(in, null, d); }
        if (b == null) return null;
        int ori = ExifInterface.ORIENTATION_NORMAL;
        try (InputStream in = cr().openInputStream(u)) { ori = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL); } catch (Throwable e) { }
        int deg = ori == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : ori == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : ori == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
        float sc = Math.min(1f, (float) max / Math.max(b.getWidth(), b.getHeight()));
        if (deg != 0 || sc < 1f) {
            Matrix m = new Matrix(); m.postScale(sc, sc); m.postRotate(deg);
            Bitmap r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
            if (r != b) b.recycle();
            b = r;
        }
        return b;
    }

    private static String dataUrl(Bitmap b, int q) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, q, o);
        return "data:image/jpeg;base64," + Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP);
    }

    /** Image entière réduite (annotation, rapport) : photoEvent("image", {req, id, data, w, h}) */
    @JavascriptInterface public void image(final String req, final String id, final int max) {
        io().execute(() -> {
            JSONObject r = new JSONObject();
            try {
                r.put("req", req); r.put("id", id);
                Bitmap b;
                if (isVid(id)) b = thumbBitmap(id, Math.min(max, 512));
                else b = decode(uriOf(id), Math.max(200, Math.min(max, 4096)));
                if (b == null) throw new Exception("image illisible");
                r.put("w", b.getWidth()); r.put("h", b.getHeight());
                r.put("data", dataUrl(b, 88));
                b.recycle();
            } catch (OutOfMemoryError e) { try { r.put("error", "mémoire insuffisante"); } catch (Throwable x) { } }
            catch (Throwable e) { try { r.put("error", err(e)); } catch (Throwable x) { } }
            emit("image", r.toString());
        });
    }

    /** Informations d'une photo (synchrone) : {date, lat, lng, desc, make, model, w, h} */
    @JavascriptInterface public String info(String id) {
        JSONObject o = new JSONObject();
        try {
            Uri u = uriOf(id); if (u == null || isVid(id)) return "{}";
            try (InputStream in = cr().openInputStream(original(u))) {
                ExifInterface ex = new ExifInterface(in);
                String d = ex.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
                if (d == null) d = ex.getAttribute(ExifInterface.TAG_DATETIME);
                if (d != null) { try { o.put("date", new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US).parse(d).getTime()); } catch (Throwable e) { } }
                float[] ll = new float[2];
                if (ex.getLatLong(ll)) { o.put("lat", ll[0]); o.put("lng", ll[1]); }
                String desc = ex.getAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION); if (desc != null) o.put("exifDesc", desc.trim());
                o.put("make", ex.getAttribute(ExifInterface.TAG_MAKE)); o.put("model", ex.getAttribute(ExifInterface.TAG_MODEL));
            }
            try (Cursor c = cr().query(u, new String[]{ MediaStore.Images.ImageColumns.DESCRIPTION, MediaStore.Images.ImageColumns.DATE_TAKEN }, null, null, null)) {
                if (c != null && c.moveToFirst()) { String d = c.getString(0); if (d != null) o.put("desc", d); if (!o.has("date") && c.getLong(1) > 0) o.put("date", c.getLong(1)); }
            }
        } catch (Throwable e) { try { o.put("error", err(e)); } catch (Throwable x) { } }
        return o.toString();
    }

    // ================= Écriture =================
    /**
     * Enregistre une image JPEG (base64, sans préfixe ou avec « data:… ») dans DCIM/Photo/<dir>.
     * srcId : photo d'origine dont on reprend la date et la position EXIF. Réponse : photoEvent("saved", {req, ok, id, error})
     */
    @JavascriptInterface public void saveImage(final String req, final String b64, final String name, final String dir, final String srcId, final String desc) {
        io().execute(() -> {
            JSONObject r = new JSONObject();
            File tmp = new File(a.getCacheDir(), "annot-" + System.currentTimeMillis() + ".jpg");
            try {
                r.put("req", req);
                String s = b64; int k = s.indexOf("base64,"); if (k >= 0) s = s.substring(k + 7);
                try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(Base64.decode(s, Base64.DEFAULT)); }
                ExifInterface ex = new ExifInterface(tmp.getAbsolutePath());
                long t = System.currentTimeMillis();
                if (srcId != null && !srcId.isEmpty() && !isVid(srcId)) {
                    try (InputStream in = cr().openInputStream(original(uriOf(srcId)))) { copyExif(new ExifInterface(in), ex); } catch (Throwable e) { }
                }
                SimpleDateFormat f = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
                if (ex.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL) == null) ex.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, f.format(new Date(t)));
                ex.setAttribute(ExifInterface.TAG_DATETIME, f.format(new Date(t)));
                ex.setAttribute(ExifInterface.TAG_SOFTWARE, "Photo - MAG Formation 13 (annotation)");
                ex.setAttribute(ExifInterface.TAG_ORIENTATION, String.valueOf(ExifInterface.ORIENTATION_NORMAL));
                if (desc != null && !desc.isEmpty()) ex.setAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION, ascii(desc));
                ex.saveAttributes();
                long taken = t;
                if (srcId != null && !srcId.isEmpty()) {
                    try (Cursor c = cr().query(uriOf(srcId), new String[]{ MediaStore.Images.ImageColumns.DATE_TAKEN }, null, null, null)) { if (c != null && c.moveToFirst() && c.getLong(0) > 0) taken = c.getLong(0) + 1000; } catch (Throwable e) { }
                }
                String n = name == null || name.isEmpty() ? "Annotation_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date(t)) + ".jpg" : name;
                if (!n.toLowerCase(Locale.ROOT).endsWith(".jpg")) n += ".jpg";
                Uri u = insert(tmp, n, dir, taken, desc);
                r.put("ok", u != null); r.put("id", u == null ? "" : String.valueOf(ContentUris.parseId(u)));
            } catch (Throwable e) { try { r.put("ok", false); r.put("error", err(e)); } catch (Throwable x) { } }
            finally { tmp.delete(); }
            emit("saved", r.toString());
        });
    }

    @SuppressWarnings("deprecation")
    private Uri insert(File f, String name, String dir, long taken, String desc) throws Exception {
        String relp = rel(dir);
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
        v.put(MediaStore.Images.ImageColumns.DATE_TAKEN, taken);
        if (desc != null) v.put(MediaStore.Images.ImageColumns.DESCRIPTION, desc);
        if (SDK >= 29) {
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, relp);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri u = cr().insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
            if (u == null) throw new Exception("MediaStore refuse l'ajout");
            try (InputStream in = new java.io.FileInputStream(f); OutputStream o = cr().openOutputStream(u)) { copy(in, o); }
            ContentValues d = new ContentValues(); d.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr().update(u, d, null, null);
            return u;
        }
        File folder = new File(Environment.getExternalStorageDirectory(), relp); folder.mkdirs();
        File out = new File(folder, name);
        int i = 2; while (out.exists()) out = new File(folder, name.replaceFirst("(\\.jpg)$", "_" + (i++) + "$1"));
        try (InputStream in = new java.io.FileInputStream(f); OutputStream o = new FileOutputStream(out)) { copy(in, o); }
        v.put(MediaStore.MediaColumns.DATA, out.getAbsolutePath());
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, out.getName());
        return cr().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
    }

    /** Légende d'une photo (colonne DESCRIPTION de MediaStore, en plus de la copie gardée par la page). */
    @JavascriptInterface public boolean setCaption(String id, String text) {
        try { ContentValues v = new ContentValues(); v.put(MediaStore.Images.ImageColumns.DESCRIPTION, text); return !isVid(id) && cr().update(uriOf(id), v, null, null) > 0; }
        catch (Throwable e) { return false; }
    }

    // ================= Actions =================
    @JavascriptInterface public void open(final String id) {
        ui(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uriOf(id), isVid(id) ? "video/*" : "image/*");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                a.startActivity(i);
            } catch (Throwable e) { toast("Aucune application pour ouvrir ce fichier"); }
        });
    }

    @JavascriptInterface public void share(final String csv) {
        ui(() -> {
            try {
                ArrayList<Uri> l = new ArrayList<>(); boolean vid = false, img = false;
                for (String id : csv.split(",")) { Uri u = uriOf(id.trim()); if (u != null) { l.add(u); if (isVid(id.trim())) vid = true; else img = true; } }
                if (l.isEmpty()) return;
                Intent i = new Intent(l.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE);
                i.setType(vid && img ? "*/*" : vid ? "video/*" : "image/jpeg");
                if (l.size() == 1) i.putExtra(Intent.EXTRA_STREAM, l.get(0)); else i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, l);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                a.startActivity(Intent.createChooser(i, "Partager"));
            } catch (Throwable e) { toast("Partage impossible"); }
        });
    }

    /** Supprime (avec confirmation système sur Android 11+) : photoEvent("deleted", {ok, ids}) */
    @JavascriptInterface public void delete(final String csv) {
        ui(() -> {
            ArrayList<Uri> l = new ArrayList<>();
            for (String id : csv.split(",")) { Uri u = uriOf(id.trim()); if (u != null) l.add(u); }
            if (l.isEmpty()) return;
            try {
                if (SDK >= 30) {
                    pendDelete = csv;
                    PendingIntent pi = MediaStore.createDeleteRequest(cr(), l);
                    a.startIntentSenderForResult(pi.getIntentSender(), REQ_DELETE, null, 0, 0, 0);
                } else {
                    int n = 0;
                    for (Uri u : l) { try { n += cr().delete(u, null, null); } catch (Throwable e) { } }
                    emit("deleted", "{\"ok\":" + (n > 0) + ",\"ids\":" + JSONObject.quote(csv) + "}");
                }
            } catch (Throwable e) { toast("Suppression impossible : " + err(e)); }
        });
    }

    /** Renomme le dossier d'un chantier (déplace ses photos) : photoEvent("renamed", {ok, moved, failed}) */
    @JavascriptInterface public void renameFolder(final String from, final String to) {
        io().execute(() -> doRename(from, to, true));
    }

    @SuppressWarnings("deprecation")
    private void doRename(String from, String to, boolean mayAsk) {
        int moved = 0, failed = 0;
        String a1 = rel(from), b1 = rel(to);
        if (a1.equals(b1)) { emit("renamed", "{\"ok\":true,\"moved\":0,\"failed\":0}"); return; }
        ArrayList<Uri> refused = new ArrayList<>();
        for (boolean video : new boolean[]{ false, true }) {
            Uri base = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            if (SDK >= 29) {
                try (Cursor c = cr().query(base, new String[]{ MediaStore.MediaColumns._ID, MediaStore.MediaColumns.RELATIVE_PATH }, MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?", new String[]{ a1 + "%" }, null)) {
                    while (c != null && c.moveToNext()) {
                        Uri u = ContentUris.withAppendedId(base, c.getLong(0));
                        String np = b1 + c.getString(1).substring(a1.length());
                        ContentValues v = new ContentValues(); v.put(MediaStore.MediaColumns.RELATIVE_PATH, np);
                        try { if (cr().update(u, v, null, null) > 0) moved++; else failed++; }
                        catch (SecurityException e) { refused.add(u); failed++; }
                        catch (Throwable e) { failed++; }
                    }
                } catch (Throwable e) { }
            } else {
                File src = new File(Environment.getExternalStorageDirectory(), a1), dst = new File(Environment.getExternalStorageDirectory(), b1);
                if (!video && src.isDirectory()) {
                    dst.getParentFile().mkdirs();
                    if (!dst.exists() && src.renameTo(dst)) {
                        try { android.media.MediaScannerConnection.scanFile(a, new String[]{ src.getAbsolutePath(), dst.getAbsolutePath() }, null, null); } catch (Throwable e) { }
                        try (Cursor c = cr().query(base, new String[]{ MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATA }, MediaStore.MediaColumns.DATA + " LIKE ?", new String[]{ src.getAbsolutePath() + "/%" }, null)) {
                            while (c != null && c.moveToNext()) {
                                ContentValues v = new ContentValues(); v.put(MediaStore.MediaColumns.DATA, dst.getAbsolutePath() + c.getString(1).substring(src.getAbsolutePath().length()));
                                try { cr().update(ContentUris.withAppendedId(base, c.getLong(0)), v, null, null); moved++; } catch (Throwable e) { failed++; }
                            }
                        } catch (Throwable e) { }
                    } else failed++;
                }
            }
        }
        // Photos créées avant une réinstallation : Android demande l'accord pour les modifier
        if (!refused.isEmpty() && mayAsk && SDK >= 30) {
            final ArrayList<Uri> l = refused;
            pendMove = from + "\n" + to;
            ui(() -> {
                try { a.startIntentSenderForResult(MediaStore.createWriteRequest(cr(), l).getIntentSender(), REQ_MOVE, null, 0, 0, 0); }
                catch (Throwable e) { emit("renamed", "{\"ok\":false,\"moved\":0,\"failed\":" + l.size() + "}"); }
            });
            return;
        }
        emit("renamed", "{\"ok\":" + (failed == 0) + ",\"moved\":" + moved + ",\"failed\":" + failed + "}");
    }

    // ================= Raccourci « Prendre une photo » =================
    /** Raccourci dynamique (appui long sur l'icône) : ouvre l'appli avec l'extra socle {"camera":1}. Appelé par la page au démarrage. */
    @JavascriptInterface public boolean setupShortcut() {
        if (SDK < 25) return false;
        try {
            ShortcutManager sm = a.getSystemService(ShortcutManager.class);
            if (sm == null) return false;
            List<ShortcutInfo> l = new ArrayList<>();
            l.add(shortcut());
            sm.setDynamicShortcuts(l);
            return true;
        } catch (Throwable e) { return false; }
    }
    /** Épingle le raccourci sur l'écran d'accueil (Android 8+, l'écran d'accueil demande confirmation) */
    @JavascriptInterface public boolean pinShortcut() {
        if (SDK < 26) return false;
        try {
            ShortcutManager sm = a.getSystemService(ShortcutManager.class);
            if (sm == null || !sm.isRequestPinShortcutSupported()) return false;
            return sm.requestPinShortcut(shortcut(), null);
        } catch (Throwable e) { return false; }
    }
    private ShortcutInfo shortcut() {
        Intent i = new Intent(Intent.ACTION_MAIN);
        i.setClassName(a.getPackageName(), a.getClass().getName());
        i.putExtra("socle", "{\"camera\":1}");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        ShortcutInfo.Builder b = new ShortcutInfo.Builder(a, "photo-camera")
                .setShortLabel("Prendre une photo").setLongLabel("Prendre une photo").setIntent(i);
        try { b.setIcon(Icon.createWithResource(a, a.getApplicationInfo().icon)); } catch (Throwable e) { }
        return b.build();
    }
}
