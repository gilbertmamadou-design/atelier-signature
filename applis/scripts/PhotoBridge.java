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
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognizerIntent;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Photo : pont entre la page www-photo et l'appareil photo natif (PhotoCamera) / MediaStore.
 * Exposé en JS sous window.MAGPhoto. Événements : window.photoEvent(type, json).
 * Les images ne sont jamais transmises par chemin de fichier : toujours en data:image/jpeg;base64.
 * Identifiant d'un élément : « id » MediaStore (images) ou « v<id> » (vidéos).
 *
 * Mode voyage (exclusif du mode chantier) : photos rangées dans DCIM/Photo/Voyage/<titre du carnet>, index privé des photos
 * du voyage (Voy : date, position, lieu, ville, légende, carnet) recopié dans un voyage.json du dossier, et fournisseur
 * PhotoBridge$Voyage (content://fr.magformation13.photo.voyage, déclaré dans l'appli Photo seule, permission « signature »
 * fr.magformation13.permission.WIDGET et signature de l'appelant vérifiée) lu par Carnet de voyage et Majordome.
 */
public class PhotoBridge {
    private static final int REQ_CAMERA = 5410, REQ_PERM = 5420, REQ_DELETE = 5430, REQ_MOVE = 5431, REQ_DICT = 5440;
    private static final int SDK = Build.VERSION.SDK_INT;
    static final String PREFS = "photo", ROOT = "DCIM/Photo";
    private final Activity a;
    private final WebView wv;
    private ExecutorService io, thumbs;
    private String pendDelete = "", pendMove = "", pendDict = "";

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
            } else if (requestCode == REQ_DICT) {
                JSONObject o = new JSONObject(); o.put("req", pendDict); pendDict = "";
                ArrayList<String> l = data == null || resultCode != Activity.RESULT_OK ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                o.put("text", l == null || l.isEmpty() ? "" : l.get(0)); o.put("ok", l != null && !l.isEmpty());
                emit("dictee", o.toString());
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
    /** Dossier relatif : « Villa Martin » → DCIM/Photo/Villa Martin/ ; « Voyage/Italie » → DCIM/Photo/Voyage/Italie/ (chaque partie nettoyée) */
    static String rel(String dir) {
        StringBuilder b = new StringBuilder();
        if (dir != null) for (String part : dir.split("/")) { String d = safeName(part); if (!d.isEmpty()) b.append('/').append(d); }
        return ROOT + b + "/";
    }
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
    // voyMode : mode voyage (exclusif de siteMode, le mode chantier) ; voyStamp : bandeau « carte postale » (désactivé par défaut :
    // le Carnet de voyage ajoute ses propres légendes) ; voyKeepOrig : original sans bandeau ; voyCaption : « Légende ? » après la prise
    private static final String[] BOOL = { "siteMode", "stamp", "keepOrig", "geo", "sound", "grid", "level", "voyMode", "voyStamp", "voyKeepOrig", "voyCaption" };
    private static final boolean[] BOOL_DEF = { false, true, true, true, true, false, true, false, false, true, true };

    @JavascriptInterface public String getSettings() {
        SharedPreferences s = sp(); JSONObject o = new JSONObject();
        try {
            for (int i = 0; i < BOOL.length; i++) o.put(BOOL[i], s.getBoolean(BOOL[i], BOOL_DEF[i]));
            o.put("quality", s.getString("quality", "max")); o.put("flash", s.getString("flash", "auto"));
            o.put("timer", s.getInt("timer", 0)); o.put("note", s.getString("note", "")); o.put("author", s.getString("author", ""));
            o.put("lens", s.getString("lens", ""));
            o.put("voyStyle", s.getString("voyStyle", "carte")); o.put("voyPos", s.getString("voyPos", "bas"));
        } catch (Throwable e) { }
        return o.toString();
    }
    @JavascriptInterface public void setSettings(String json) {
        try {
            JSONObject o = new JSONObject(json); SharedPreferences.Editor e = sp().edit();
            for (String k : BOOL) if (o.has(k)) e.putBoolean(k, o.getBoolean(k));
            for (String k : new String[]{ "quality", "flash", "note", "author", "voyStyle", "voyPos" }) if (o.has(k)) e.putString(k, o.getString(k));
            if (o.has("timer")) e.putInt("timer", o.getInt("timer"));
            // les deux modes s'excluent : chantier ou voyage (ou aucun)
            if (o.optBoolean("voyMode", false)) e.putBoolean("siteMode", false);
            if (o.optBoolean("siteMode", false)) e.putBoolean("voyMode", false);
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

    // ================= Mode voyage =================
    /** Voyage actif (objet JSON {id, titre, dir, debut, fin, local}, « {} » si aucun) */
    @JavascriptInterface public String getVoyage() { return sp().getString("voyage", "{}"); }
    @JavascriptInterface public void setVoyage(String json) { try { Voy.setVoyage(a, new JSONObject(json == null || json.isEmpty() ? "{}" : json)); } catch (Throwable e) { } }
    /** Voyages connus de Photo (locaux, ou carnets déjà utilisés) : JSON [{id, titre, dir, debut, fin, local, created}] */
    @JavascriptInterface public String getVoyages() { return sp().getString("voyages", "[]"); }
    @JavascriptInterface public void setVoyages(String json) { try { new JSONArray(json); sp().edit().putString("voyages", json).apply(); } catch (Throwable e) { } }
    /** Photos du voyage d'un dossier (« Voyage/Italie ») avec date, lieu, ville, légende : JSON [{id, nom, date, lat, lng, lieu, ville, legende, carnet}] */
    @JavascriptInterface public String voyageIndex(String dir) {
        JSONArray out = new JSONArray(), l = Voy.load(a);
        for (int i = 0; i < l.length(); i++) { JSONObject o = l.optJSONObject(i); if (o != null && (dir == null || dir.isEmpty() || o.optString("dossier").equalsIgnoreCase(dir))) out.put(o); }
        return out.toString();
    }
    /** Légende d'une photo du voyage (index, voyage.json du dossier et description MediaStore) */
    @JavascriptInterface public boolean voyageLegende(final String id, final String text) { return Voy.setLegende(a, id, text); }
    /** Où est écrit voyage.json pour un dossier (« DCIM/Photo/Voyage/Italie/voyage.json », ou Documents/… si Android refuse) */
    @JavascriptInterface public String voyageJson(String dir) { return sp().getString("voyJson:" + dir, ""); }
    /** Dictée par la reconnaissance vocale d'Android : photoEvent("dictee", {req, ok, text}) */
    @JavascriptInterface public boolean canDictate() { try { return !a.getPackageManager().queryIntentActivities(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH), 0).isEmpty(); } catch (Throwable e) { return false; } }
    @JavascriptInterface public void dictate(final String req) {
        ui(() -> {
            try {
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR"); i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Légende de la photo");
                pendDict = req == null ? "" : req;
                a.startActivityForResult(i, REQ_DICT);
            } catch (Throwable e) { emit("dictee", "{\"req\":" + JSONObject.quote(req == null ? "" : req) + ",\"ok\":false,\"text\":\"\",\"error\":\"indisponible\"}"); }
        });
    }
    /** Page des versions (installer le Carnet de voyage) : seulement le dépôt de la Suite MAG */
    @JavascriptInterface public void openUrl(final String url) {
        if (url == null || !url.startsWith("https://github.com/gilbertmamadou-design/atelier-signature/")) return;
        ui(() -> { try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Throwable e) { toast("Aucun navigateur"); } });
    }

    /**
     * Index des photos du voyage (fichier privé files/voyage/index.json) et voyage.json du dossier.
     * Utilisé par la page, l'appareil photo (PhotoCamera) et le fournisseur. Une entrée :
     * {id, nom, chemin, dossier, date, dateTxt, lat, lng, lieu, ville, pays, legende, carnet, titre, w, h}
     */
    static final class Voy {
        private static final Object LOCK = new Object();
        static File file(Context c) { File d = new File(c.getFilesDir(), "voyage"); d.mkdirs(); return new File(d, "index.json"); }
        static JSONArray load(Context c) {
            synchronized (LOCK) {
                File f = file(c); if (!f.exists()) return new JSONArray();
                try (InputStream in = new java.io.FileInputStream(f)) { ByteArrayOutputStream o = new ByteArrayOutputStream(); copy(in, o); return new JSONArray(o.toString("UTF-8")); }
                catch (Throwable e) { return new JSONArray(); }
            }
        }
        static void save(Context c, JSONArray l) {
            synchronized (LOCK) {
                File f = file(c), t = new File(f.getParentFile(), "index.tmp");
                try (FileOutputStream o = new FileOutputStream(t)) { o.write(l.toString().getBytes("UTF-8")); } catch (Throwable e) { return; }
                if (!t.renameTo(f)) { f.delete(); t.renameTo(f); }
            }
        }
        static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
        static String norm(String s) { return VoyageBridge.norm(s); }
        static String isoLocal(long t) {
            String s = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US).format(new Date(t));
            return s.substring(0, s.length() - 2) + ":" + s.substring(s.length() - 2);
        }
        /** Voyage actif ; ajouté à la liste « voyages » s'il n'y est pas (ou mis à jour) */
        static void setVoyage(Context c, JSONObject v) {
            try {
                if (v.has("titre") && !v.has("dir")) v.put("dir", safeName(v.getString("titre")));
                if (v.has("dir")) v.put("dir", safeName(v.getString("dir")));
                SharedPreferences.Editor e = prefs(c).edit().putString("voyage", v.toString());
                if (v.optString("id").length() > 0) {
                    JSONArray l = VoyageBridge.arr(prefs(c).getString("voyages", "[]")), out = new JSONArray(); boolean found = false;
                    for (int i = 0; i < l.length(); i++) { JSONObject o = l.optJSONObject(i); if (o == null) continue; if (o.optString("id").equals(v.optString("id"))) { found = true; JSONObject m = new JSONObject(v.toString()); if (o.has("created")) m.put("created", o.get("created")); out.put(m); } else out.put(o); }
                    if (!found) { JSONObject m = new JSONObject(v.toString()); m.put("created", System.currentTimeMillis()); out.put(m); }
                    e.putString("voyages", out.toString());
                }
                e.apply();
            } catch (Throwable x) { }
        }
        static JSONObject etat(Context c) {
            JSONObject o = new JSONObject();
            try {
                SharedPreferences s = prefs(c);
                boolean voy = s.getBoolean("voyMode", false), site = s.getBoolean("siteMode", false);
                o.put("mode", voy ? "voyage" : site ? "chantier" : "normal");
                o.put("voyage", new JSONObject(s.getString("voyage", "{}")));
                o.put("stamp", s.getBoolean("voyStamp", false)); o.put("caption", s.getBoolean("voyCaption", true));
                int n = 0; JSONObject v = o.getJSONObject("voyage"); JSONArray l = load(c);
                for (int i = 0; i < l.length(); i++) { JSONObject x = l.optJSONObject(i); if (x != null && x.optString("dossier").equalsIgnoreCase("Voyage/" + v.optString("dir"))) n++; }
                o.put("photos", n);
            } catch (Throwable e) { }
            return o;
        }
        /** Change le mode depuis une autre appli (Majordome) ou la page : {mode, carnet:{id, titre, debut, fin}} */
        static JSONObject mode(Context c, JSONObject arg) {
            try {
                String m = arg.optString("mode", "voyage");
                SharedPreferences.Editor e = prefs(c).edit();
                if ("voyage".equals(m)) {
                    JSONObject k = arg.optJSONObject("carnet");
                    if (k != null && k.optString("titre").length() > 0) {
                        JSONObject v = new JSONObject();
                        v.put("id", k.optString("id", "v" + System.currentTimeMillis())); v.put("titre", k.optString("titre")); v.put("dir", safeName(k.optString("titre")));
                        v.put("debut", k.optString("debut")); v.put("fin", k.optString("fin")); v.put("local", k.optBoolean("local", false));
                        setVoyage(c, v);
                    } else if (new JSONObject(prefs(c).getString("voyage", "{}")).optString("titre").isEmpty()) {
                        JSONObject r = etat(c); r.put("ok", false); r.put("besoin", "carnet"); return r;
                    }
                    e.putBoolean("voyMode", true).putBoolean("siteMode", false);
                } else if ("chantier".equals(m)) e.putBoolean("siteMode", true).putBoolean("voyMode", false);
                else e.putBoolean("voyMode", false);
                e.commit();
                JSONObject r = etat(c); r.put("ok", true); return r;
            } catch (Throwable x) { return new JSONObject(); }
        }
        /** Nouvelle photo du voyage (appelé par PhotoCamera après l'enregistrement) */
        static JSONObject add(Context c, String id, String nom, String voyDir, long t, android.location.Location l, String lieu, String ville, String pays, JSONObject voyage, int w, int h) {
            JSONObject o = new JSONObject();
            try {
                String dossier = "Voyage/" + safeName(voyDir);
                o.put("id", id); o.put("nom", nom); o.put("dossier", dossier); o.put("chemin", rel(dossier) + nom);
                o.put("date", t); o.put("dateTxt", isoLocal(t));
                if (l != null) { o.put("lat", l.getLatitude()); o.put("lng", l.getLongitude()); }
                o.put("lieu", lieu == null ? "" : lieu); o.put("ville", ville == null ? "" : ville); o.put("pays", pays == null ? "" : pays);
                o.put("legende", ""); o.put("carnet", voyage.optBoolean("local") ? "" : voyage.optString("id")); o.put("voyage", voyage.optString("id"));
                o.put("titre", voyage.optString("titre")); o.put("w", w); o.put("h", h);
                synchronized (LOCK) { JSONArray all = load(c); all.put(o); save(c, all); }
                writeFolder(c, dossier);
            } catch (Throwable e) { }
            return o;
        }
        static boolean setLegende(Context c, String id, String text) {
            String dossier = null, lieu = "";
            synchronized (LOCK) {
                JSONArray all = load(c);
                for (int i = 0; i < all.length(); i++) {
                    JSONObject o = all.optJSONObject(i);
                    if (o != null && o.optString("id").equals(id)) { try { o.put("legende", text == null ? "" : text.trim()); } catch (Throwable e) { } dossier = o.optString("dossier"); lieu = o.optString("lieu"); }
                }
                if (dossier == null) return false;
                save(c, all);
            }
            try {
                String t = text == null ? "" : text.trim();
                ContentValues v = new ContentValues(); v.put(MediaStore.Images.ImageColumns.DESCRIPTION, (lieu.isEmpty() ? "" : lieu) + (t.isEmpty() ? "" : (lieu.isEmpty() ? "" : "\n") + t));
                c.getContentResolver().update(uriOf(id), v, null, null);
            } catch (Throwable e) { }
            writeFolder(c, dossier);
            return true;
        }
        /** Photos d'un carnet : même id de carnet, ou même titre (voyage local renommé ensuite en carnet) */
        static List<JSONObject> forCarnet(Context c, String carnet, String titre) {
            List<JSONObject> out = new ArrayList<>(); JSONArray all = load(c);
            String nt = norm(titre), dir = titre == null ? "" : safeName(titre);
            for (int i = 0; i < all.length(); i++) {
                JSONObject o = all.optJSONObject(i); if (o == null) continue;
                boolean byId = carnet != null && !carnet.isEmpty() && carnet.equals(o.optString("carnet"));
                boolean byTitle = !nt.isEmpty() && (o.optString("carnet").isEmpty() || carnet == null || carnet.isEmpty()) && (norm(o.optString("titre")).equals(nt) || o.optString("dossier").equalsIgnoreCase("Voyage/" + dir));
                if (byId || byTitle) out.add(o);
            }
            return out;
        }
        /** Retire de la liste les photos supprimées du téléphone (une requête MediaStore pour toutes) */
        static List<JSONObject> existing(Context c, List<JSONObject> l) {
            if (l.isEmpty()) return l;
            Set<String> ok = new HashSet<>();
            StringBuilder in = new StringBuilder();
            for (JSONObject o : l) { long n = num(o.optString("id")); if (n >= 0) { if (in.length() > 0) in.append(','); in.append(n); } }
            try (Cursor k = c.getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, new String[]{ MediaStore.MediaColumns._ID }, MediaStore.MediaColumns._ID + " IN (" + in + ")", null, null)) {
                if (k == null) return l;
                while (k.moveToNext()) ok.add(String.valueOf(k.getLong(0)));
            } catch (Throwable e) { return l; }
            List<JSONObject> out = new ArrayList<>();
            for (JSONObject o : l) if (ok.contains(o.optString("id"))) out.add(o);
            return out;
        }
        /**
         * voyage.json du dossier : DCIM/Photo/Voyage/<titre>/voyage.json. Android 10+ n'accepte en principe que des images et
         * des vidéos dans DCIM : essai par MediaStore, puis par chemin direct ; s'il refuse, copie dans Documents/Photo/Voyage/<titre>/.
         * L'emplacement retenu est gardé (préférence « voyJson:<dossier> »).
         */
        static void writeFolder(Context c, String dossier) {
            try {
                JSONObject j = new JSONObject(); JSONArray ph = new JSONArray(); JSONObject car = null;
                JSONArray all = load(c);
                for (int i = 0; i < all.length(); i++) {
                    JSONObject o = all.optJSONObject(i); if (o == null || !o.optString("dossier").equalsIgnoreCase(dossier)) continue;
                    JSONObject p = new JSONObject();
                    p.put("fichier", o.optString("nom")); p.put("chemin", o.optString("chemin")); p.put("date", o.optString("dateTxt"));
                    if (o.has("lat")) { p.put("lat", o.optDouble("lat")); p.put("lng", o.optDouble("lng")); }
                    p.put("lieu", o.optString("lieu")); p.put("ville", o.optString("ville")); p.put("pays", o.optString("pays"));
                    p.put("legende", o.optString("legende")); p.put("carnet", o.optString("carnet")); p.put("w", o.optInt("w")); p.put("h", o.optInt("h"));
                    ph.put(p);
                    if (car == null) { car = new JSONObject(); car.put("id", o.optString("carnet")); car.put("titre", o.optString("titre")); }
                }
                JSONObject v = new JSONObject(prefs(c).getString("voyage", "{}"));
                if (car != null && v.optString("titre").length() > 0 && ("Voyage/" + v.optString("dir")).equalsIgnoreCase(dossier)) { car.put("debut", v.optString("debut")); car.put("fin", v.optString("fin")); }
                j.put("format", "magvoyage"); j.put("version", 1); j.put("app", "Photo (Suite MAG)"); j.put("dossier", dossier);
                j.put("carnet", car == null ? new JSONObject() : car); j.put("maj", isoLocal(System.currentTimeMillis())); j.put("photos", ph);
                byte[] data = j.toString(1).getBytes("UTF-8");
                String where = writeJson(c, rel(dossier), data);
                if (where == null) where = writeJson(c, "Documents/Photo/" + rel(dossier).substring(ROOT.length() + 1), data);
                prefs(c).edit().putString("voyJson:" + dossier, where == null ? "" : where + "voyage.json").apply();
            } catch (Throwable e) { }
        }
        @SuppressWarnings("deprecation")
        private static String writeJson(Context c, String relp, byte[] data) {
            ContentResolver cr = c.getContentResolver();
            if (SDK >= 29) {
                Uri files = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                try {
                    Uri u = null;
                    try (Cursor k = cr.query(files, new String[]{ MediaStore.MediaColumns._ID }, MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?", new String[]{ relp, "voyage.json" }, null)) {
                        if (k != null && k.moveToFirst()) u = ContentUris.withAppendedId(files, k.getLong(0));
                    }
                    if (u == null) {
                        ContentValues v = new ContentValues();
                        v.put(MediaStore.MediaColumns.DISPLAY_NAME, "voyage.json"); v.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                        v.put(MediaStore.MediaColumns.RELATIVE_PATH, relp);
                        u = cr.insert(files, v);
                    }
                    if (u != null) { try (OutputStream o = cr.openOutputStream(u, "wt")) { o.write(data); } return relp; }
                } catch (Throwable e) { }
            }
            try {
                File d = new File(Environment.getExternalStorageDirectory(), relp); d.mkdirs();
                try (FileOutputStream o = new FileOutputStream(new File(d, "voyage.json"))) { o.write(data); }
                try { android.media.MediaScannerConnection.scanFile(c, new String[]{ new File(d, "voyage.json").getAbsolutePath() }, null, null); } catch (Throwable e) { }
                return relp;
            } catch (Throwable e) { return null; }
        }
    }

    /** Fournisseur de l'appli Photo pour le mode voyage (déclaré dans le manifeste de Photo seulement). */
    public static class Voyage extends android.content.ContentProvider {
        @Override public boolean onCreate() { return true; }
        private void check() {
            int uid = android.os.Binder.getCallingUid();
            if (uid == android.os.Process.myUid()) return;
            if (getContext().getPackageManager().checkSignatures(uid, android.os.Process.myUid()) != PackageManager.SIGNATURE_MATCH) throw new SecurityException("réservé aux applis MAG");
        }
        /** content://…voyage/photos?carnet=&titre= : photos du voyage encore présentes sur le téléphone ; …/voyages : dossiers */
        @Override public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
            check();
            android.database.MatrixCursor m = new android.database.MatrixCursor(new String[]{ "id", "json" });
            Context c = getContext();
            if ("voyages".equals(uri.getLastPathSegment())) {
                Map<String, Integer> n = new HashMap<>(); JSONArray all = Voy.load(c);
                for (int i = 0; i < all.length(); i++) { JSONObject o = all.optJSONObject(i); if (o != null) n.put(o.optString("dossier"), (n.containsKey(o.optString("dossier")) ? n.get(o.optString("dossier")) : 0) + 1); }
                for (Map.Entry<String, Integer> e : n.entrySet()) { try { JSONObject o = new JSONObject(); o.put("dossier", e.getKey()); o.put("n", e.getValue()); m.addRow(new Object[]{ e.getKey(), o.toString() }); } catch (Throwable x) { } }
                return m;
            }
            List<JSONObject> l = Voy.existing(c, Voy.forCarnet(c, uri.getQueryParameter("carnet"), uri.getQueryParameter("titre")));
            for (JSONObject o : l) m.addRow(new Object[]{ o.optString("id"), o.toString() });
            return m;
        }
        /** content://…voyage/photo/<id> : la photo d'origine (position GPS comprise), seulement si elle est dans l'index du voyage */
        @Override public android.os.ParcelFileDescriptor openFile(Uri uri, String mode) throws java.io.FileNotFoundException {
            check();
            if (mode == null || !mode.equals("r")) throw new SecurityException("lecture seule");
            List<String> seg = uri.getPathSegments();
            if (seg.size() != 2 || !"photo".equals(seg.get(0))) throw new java.io.FileNotFoundException("adresse inconnue");
            String id = seg.get(1); boolean known = false; JSONArray all = Voy.load(getContext());
            for (int i = 0; i < all.length() && !known; i++) { JSONObject o = all.optJSONObject(i); known = o != null && id.equals(o.optString("id")); }
            if (!known || num(id) < 0) throw new java.io.FileNotFoundException("photo hors du voyage");
            Uri u = uriOf(id);
            if (SDK >= 29 && getContext().checkSelfPermission("android.permission.ACCESS_MEDIA_LOCATION") == PackageManager.PERMISSION_GRANTED) { try { u = MediaStore.setRequireOriginal(u); } catch (Throwable e) { } }
            try { return getContext().getContentResolver().openFileDescriptor(u, "r"); }
            catch (Throwable e) { throw new java.io.FileNotFoundException(String.valueOf(e.getMessage())); }
        }
        @Override public Bundle call(String method, String arg, Bundle extras) {
            check();
            Bundle b = new Bundle(); Context c = getContext();
            try {
                if ("etat".equals(method)) b.putString("json", Voy.etat(c).toString());
                else if ("mode".equals(method)) b.putString("json", Voy.mode(c, new JSONObject(arg == null ? "{}" : arg)).toString());
                else if ("vignette".equals(method) && arg != null) {
                    boolean known = false; JSONArray all = Voy.load(c);
                    for (int i = 0; i < all.length() && !known; i++) { JSONObject o = all.optJSONObject(i); known = o != null && arg.equals(o.optString("id")); }
                    if (known) {
                        Bitmap bm = SDK >= 29 ? c.getContentResolver().loadThumbnail(uriOf(arg), new Size(240, 240), null) : null;
                        if (bm != null) { b.putString("data", dataUrl(bm, 78)); bm.recycle(); }
                    }
                }
            } catch (Throwable e) { b.putString("err", String.valueOf(e.getMessage())); }
            return b;
        }
        @Override public String getType(Uri uri) { return uri.getPathSegments().size() == 2 ? "image/jpeg" : "application/json"; }
        @Override public Uri insert(Uri uri, ContentValues v) { throw new SecurityException("lecture seule"); }
        @Override public int delete(Uri uri, String s, String[] a) { throw new SecurityException("lecture seule"); }
        @Override public int update(Uri uri, ContentValues v, String s, String[] a) { throw new SecurityException("lecture seule"); }
    }
}
