package __PKG__;

// Toile : fonds d'écran automatiques, recadrés pour ne garder que l'image.
//  - lecture d'un dossier choisi par l'utilisateur (sous-dossiers compris)
//  - retrait des bordures unies, des bandeaux de texte en bord, rognage des bords
//  - adaptation au format de l'écran : recadrage intelligent, centré, ou image entière sur fond flou
//  - changement automatique (JobScheduler, survit au redémarrage), précédent, aperçu
//  - « Images en ligne » (ToileBridge.java) : les images récupérées rejoignent la rotation, avec les mêmes traitements
//  - cadrage manuel par image (éditeur applis/www-fonds/recadrage.js) : prioritaire sur le mode automatique,
//    rangé à part (préférence « crops »), un cadrage par format d'écran et pour le verrouillage ; fichiers jamais modifiés

import android.app.WallpaperManager;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.media.ExifInterface;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

public class WallpaperJob extends JobService {
    static final int JOB_AUTO = 7701, JOB_NOW = 7702, JOB_PREV = 7703;
    static final Object LOCK = new Object();
    static volatile boolean busy = false;

    @Override
    public boolean onStartJob(final JobParameters p) {
        final Context c = getApplicationContext();
        new Thread(new Runnable() { public void run() {
            try {
                if (p.getJobId() == JOB_PREV) previous(c); else change(c);
            } catch (Throwable t) { status(c, msg(t)); }
            jobFinished(p, false);
        } }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters p) { return false; }

    // ---------- Réglages ----------
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("toile", Context.MODE_PRIVATE); }

    static JSONObject settings(Context c) {
        JSONObject o;
        try { o = new JSONObject(prefs(c).getString("settings", "{}")); } catch (Exception e) { o = new JSONObject(); }
        def(o, "auto", false); def(o, "interval", 360); def(o, "charging", false);
        def(o, "order", "random"); def(o, "sub", true);
        def(o, "borders", true); def(o, "tol", 24); def(o, "text", false); def(o, "trim", 0);
        def(o, "fit", "smart"); def(o, "target", "both");
        return o;
    }
    private static void def(JSONObject o, String k, Object v) { if (!o.has(k)) try { o.put(k, v); } catch (Exception e) { } }

    static void saveSettings(Context c, String json) {
        try { new JSONObject(json); } catch (Exception e) { return; }
        prefs(c).edit().putString("settings", json).apply();
        schedule(c);
    }

    static void setFolder(Context c, Uri tree) {
        prefs(c).edit().putString("folder", tree.toString()).remove("bag").putInt("seq", -1).putInt("count", -1).apply();
        schedule(c);
    }

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        JSONObject s = settings(c);
        if (!s.optBoolean("auto") || (prefs(c).getString("folder", null) == null && !ToileBridge.rotationOn(c))) { js.cancel(JOB_AUTO); return; }
        long ms = Math.max(15, s.optInt("interval", 360)) * 60000L;
        JobInfo ji = new JobInfo.Builder(JOB_AUTO, new ComponentName(c, WallpaperJob.class))
            .setPeriodic(ms).setPersisted(true).setRequiresCharging(s.optBoolean("charging")).build();
        js.schedule(ji);
    }

    static void runSoon(Context c, int id) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        js.schedule(new JobInfo.Builder(id, new ComponentName(c, WallpaperJob.class)).setOverrideDeadline(0).build());
    }

    static void status(Context c, String m) {
        prefs(c).edit().putString("msg", m).putLong("at", System.currentTimeMillis()).apply();
    }

    static String msg(Throwable t) {
        if (t instanceof SecurityException) return "Accès au dossier perdu : choisis-le de nouveau";
        if (t instanceof OutOfMemoryError) return "Image trop grande pour la mémoire du téléphone";
        String m = t.getMessage();
        return m == null || m.isEmpty() ? "Changement impossible" : m;
    }

    static String state(Context c) {
        try {
            SharedPreferences p = prefs(c);
            JSONObject o = new JSONObject();
            String f = p.getString("folder", null);
            o.put("folder", f == null ? "" : folderName(f));
            o.put("count", p.getInt("count", -1));
            o.put("web", ToileBridge.rotation(c).size());
            o.put("msg", p.getString("msg", ""));
            o.put("at", p.getLong("at", 0));
            o.put("busy", busy);
            o.put("history", history(c).size());
            o.put("planned", c.getSystemService(JobScheduler.class).getPendingJob(JOB_AUTO) != null);
            int[] s = screen(c);
            o.put("sw", s[0]); o.put("sh", s[1]);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    static String folderName(String tree) {
        try {
            String id = DocumentsContract.getTreeDocumentId(Uri.parse(tree));
            int i = id.indexOf(':');
            String path = i >= 0 ? id.substring(i + 1) : id;
            String vol = i >= 0 ? id.substring(0, i) : "";
            if (path.isEmpty()) return "primary".equals(vol) ? "Mémoire du téléphone" : "Carte SD";
            return path;
        } catch (Exception e) { return "Dossier choisi"; }
    }

    // ---------- Liste des images ----------
    static List<Uri> list(Context c) throws Exception {
        String f = prefs(c).getString("folder", null);
        List<String[]> web = ToileBridge.rotation(c);
        if (f == null && web.isEmpty()) throw new Exception("Choisis d'abord un dossier d'images");
        List<String[]> found = new ArrayList<>();
        if (f != null) {
            Uri tree = Uri.parse(f);
            walk(c, tree, DocumentsContract.getTreeDocumentId(tree), settings(c).optBoolean("sub", true) ? 4 : 0, found);
        }
        for (String[] w : web) if (found.size() < 5000) found.add(w);
        Collections.sort(found, (a, b) -> a[0].compareToIgnoreCase(b[0]));
        List<Uri> out = new ArrayList<>();
        for (String[] s : found) out.add(Uri.parse(s[1]));
        prefs(c).edit().putInt("count", out.size()).apply();
        return out;
    }

    private static void walk(Context c, Uri tree, String docId, int depth, List<String[]> out) {
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId);
        String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
        List<String> dirs = new ArrayList<>();
        try (Cursor cur = c.getContentResolver().query(kids, cols, null, null, null)) {
            while (cur != null && cur.moveToNext() && out.size() < 5000) {
                String id = cur.getString(0), mime = cur.getString(1), name = cur.getString(2);
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) { if (depth > 0) dirs.add(id); }
                else if (mime != null && mime.startsWith("image/") && !mime.contains("gif") && !mime.contains("svg"))
                    out.add(new String[]{ name == null ? "" : name, DocumentsContract.buildDocumentUriUsingTree(tree, id).toString() });
            }
        }
        for (String d : dirs) walk(c, tree, d, depth - 1, out);
    }

    static String name(Context c, Uri u) {
        String t = ToileBridge.label(c, u);
        if (t != null) return t;
        try (Cursor cur = c.getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cur != null && cur.moveToFirst()) { String n = cur.getString(0); if (n != null) return n; }
        } catch (Exception e) { }
        String s = u.getLastPathSegment();
        return s == null ? "image" : s.substring(s.lastIndexOf('/') + 1);
    }

    // Tirage : aléatoire sans répétition avant d'avoir tout vu, ou dans l'ordre
    static Uri pick(Context c, List<Uri> all) {
        SharedPreferences p = prefs(c);
        if ("seq".equals(settings(c).optString("order"))) {
            int i = p.getInt("seq", -1) + 1;
            if (i >= all.size() || i < 0) i = 0;
            p.edit().putInt("seq", i).apply();
            return all.get(i);
        }
        Set<String> valid = new HashSet<>();
        for (Uri u : all) valid.add(u.toString());
        List<String> bag = new ArrayList<>(Arrays.asList(p.getString("bag", "").split("\n")));
        bag.removeIf(s -> s.isEmpty() || !valid.contains(s));
        if (bag.isEmpty()) {
            for (Uri u : all) bag.add(u.toString());
            Collections.shuffle(bag);
            List<String> h = history(c);
            if (bag.size() > 1 && !h.isEmpty() && bag.get(0).equals(h.get(h.size() - 1))) Collections.swap(bag, 0, bag.size() - 1);
        }
        String u = bag.remove(0);
        p.edit().putString("bag", String.join("\n", bag)).apply();
        return Uri.parse(u);
    }

    static List<String> history(Context c) {
        List<String> h = new ArrayList<>();
        try { JSONArray a = new JSONArray(prefs(c).getString("history", "[]")); for (int i = 0; i < a.length(); i++) h.add(a.getString(i)); } catch (Exception e) { }
        return h;
    }
    private static void saveHistory(Context c, List<String> h) {
        while (h.size() > 30) h.remove(0);
        prefs(c).edit().putString("history", new JSONArray(h).toString()).apply();
    }

    // ---------- Changer ----------
    static int flags(String target) {
        if ("home".equals(target)) return WallpaperManager.FLAG_SYSTEM;
        if ("lock".equals(target)) return WallpaperManager.FLAG_LOCK;
        return WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK;
    }

    static String change(Context c) throws Exception {
        synchronized (LOCK) {
            busy = true;
            try {
                List<Uri> all = list(c);
                if (all.isEmpty()) throw new Exception("Aucune image dans ce dossier");
                String target = settings(c).optString("target", "both");
                Uri home;
                if ("split".equals(target)) {
                    home = applyRandom(c, all, WallpaperManager.FLAG_SYSTEM);
                    if (all.size() > 1) applyRandom(c, all, WallpaperManager.FLAG_LOCK);
                    else apply(c, home, WallpaperManager.FLAG_LOCK);
                } else home = applyRandom(c, all, flags(target));
                List<String> h = history(c);
                h.add(home.toString());
                saveHistory(c, h);
                String m = "Nouveau fond : " + name(c, home);
                status(c, m);
                return m;
            } finally { busy = false; }
        }
    }

    private static Uri applyRandom(Context c, List<Uri> all, int flags) throws Exception {
        Exception last = null;
        for (int t = 0; t < 6; t++) {
            Uri u = pick(c, all);
            try { apply(c, u, flags); return u; }
            catch (Exception e) { last = e; }
            catch (OutOfMemoryError e) { last = new Exception(msg(e)); }
        }
        throw last == null ? new Exception("Changement impossible") : last;
    }

    static void apply(Context c, Uri u, int flags) throws Exception {
        boolean home = (flags & WallpaperManager.FLAG_SYSTEM) != 0, lock = (flags & WallpaperManager.FLAG_LOCK) != 0;
        Res r = process(c, u, false, home ? "home" : "lock");
        Res rl = null;
        try {
            // cadrage manuel propre au verrouillage : image préparée à part
            if (home && lock && hasExactCrop(c, u.toString(), "lock")) rl = process(c, u, false, "lock");
            WallpaperManager wm = WallpaperManager.getInstance(c);
            if (home && liveOn(c)) {
                // Fond « Toile (double tap) » actif : l'image de l'accueil est dessinée par Live, pas posée par Android
                writeLive(c, r.out);
                if (lock) {
                    int lockId = -1; try { lockId = wm.getWallpaperId(WallpaperManager.FLAG_LOCK); } catch (Throwable t) { }
                    if (lockId >= 0 || rl != null) wm.setBitmap(rl != null ? rl.out : r.out, null, true, WallpaperManager.FLAG_LOCK);   // verrouillage avec sa propre image
                }
            } else if (rl != null) {
                wm.setBitmap(r.out, null, true, WallpaperManager.FLAG_SYSTEM);
                wm.setBitmap(rl.out, null, true, WallpaperManager.FLAG_LOCK);
            } else wm.setBitmap(r.out, null, true, flags);
            // Miniature pour la tuile « Fond d'écran » de Socle
            if ((flags & WallpaperManager.FLAG_SYSTEM) != 0) {
                try {
                    Bitmap th = Bitmap.createScaledBitmap(r.out, 180, Math.max(1, Math.round(180f * r.out.getHeight() / r.out.getWidth())), true);
                    prefs(c).edit().putString("thumb", jpeg(th)).putString("thumbName", name(c, u)).apply();
                    th.recycle();
                } catch (Throwable t) { }
            }
        }
        finally { r.out.recycle(); if (rl != null) rl.out.recycle(); }
    }

    static String applyUri(Context c, Uri u) throws Exception {
        synchronized (LOCK) {
            busy = true;
            try {
                String target = settings(c).optString("target", "both");
                apply(c, u, "split".equals(target) ? WallpaperManager.FLAG_SYSTEM : flags(target));
                List<String> h = history(c);
                h.add(u.toString());
                saveHistory(c, h);
                String m = "Nouveau fond : " + name(c, u);
                status(c, m);
                return m;
            } finally { busy = false; }
        }
    }

    static String previous(Context c) throws Exception {
        synchronized (LOCK) {
            List<String> h = history(c);
            if (h.size() < 2) throw new Exception("Pas de fond d'écran précédent");
            busy = true;
            try {
                h.remove(h.size() - 1);
                Uri u = Uri.parse(h.get(h.size() - 1));
                String target = settings(c).optString("target", "both");
                apply(c, u, "split".equals(target) ? WallpaperManager.FLAG_SYSTEM : flags(target));
                saveHistory(c, h);
                String m = "Fond précédent : " + name(c, u);
                status(c, m);
                return m;
            } finally { busy = false; }
        }
    }

    // Aperçu : avant (zone gardée en clair) et après, en JPEG base64
    static String preview(Context c, String uri) throws Exception {
        Uri u;
        if (uri == null || uri.isEmpty()) {
            List<Uri> all = list(c);
            if (all.isEmpty()) throw new Exception("Aucune image dans ce dossier");
            u = all.get(new Random().nextInt(all.size()));
        } else u = Uri.parse(uri);
        Res r = process(c, u, true, "home");
        try {
            int bw = r.src.getWidth(), bh = r.src.getHeight();
            float s = Math.min(1f, 640f / Math.max(bw, bh));
            Bitmap before = Bitmap.createBitmap(Math.max(1, Math.round(bw * s)), Math.max(1, Math.round(bh * s)), Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(before);
            Paint fp = new Paint(Paint.FILTER_BITMAP_FLAG);
            cv.drawBitmap(r.src, null, new Rect(0, 0, before.getWidth(), before.getHeight()), fp);
            Rect k = new Rect(Math.round(r.keep.left * s), Math.round(r.keep.top * s), Math.round(r.keep.right * s), Math.round(r.keep.bottom * s));
            Paint dim = new Paint(); dim.setColor(0xB0000000);
            cv.drawRect(0, 0, before.getWidth(), k.top, dim);
            cv.drawRect(0, k.bottom, before.getWidth(), before.getHeight(), dim);
            cv.drawRect(0, k.top, k.left, k.bottom, dim);
            cv.drawRect(k.right, k.top, before.getWidth(), k.bottom, dim);
            Paint line = new Paint(Paint.ANTI_ALIAS_FLAG); line.setStyle(Paint.Style.STROKE); line.setStrokeWidth(3); line.setColor(0xFFFFFFFF);
            cv.drawRect(k, line);
            float s2 = Math.min(1f, 720f / r.out.getHeight());
            Bitmap after = Bitmap.createScaledBitmap(r.out, Math.max(1, Math.round(r.out.getWidth() * s2)), Math.max(1, Math.round(r.out.getHeight() * s2)), true);
            JSONObject o = new JSONObject();
            o.put("uri", u.toString());
            o.put("name", name(c, u));
            o.put("before", jpeg(before));
            o.put("after", jpeg(after));
            o.put("w", r.src.getWidth()); o.put("h", r.src.getHeight());
            o.put("kw", r.keep.width()); o.put("kh", r.keep.height());
            o.put("info", r.info);
            o.put("manual", r.manual);
            before.recycle(); after.recycle();
            return o.toString();
        } finally { r.src.recycle(); r.out.recycle(); }
    }

    private static String jpeg(Bitmap b) {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 85, bo);
        return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
    }

    // ---------- Cadrage manuel : rangement ----------
    // Préférence « crops » : { "<uri>": { "9:20": {x, y, w, h, free, bg, at}, "9:20@lock": {…} } },
    // rectangle en fractions de l'image d'origine (orientation EXIF comprise). L'image elle-même n'est jamais modifiée.
    static JSONObject crops(Context c) {
        try { return new JSONObject(prefs(c).getString("crops", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    static JSONObject cropsOf(Context c, String uri) {
        JSONObject o = crops(c).optJSONObject(uri);
        return o == null ? new JSONObject() : o;
    }
    static void saveCropsOf(Context c, String uri, JSONObject entries) {
        synchronized (LOCK) {
            JSONObject all = crops(c);
            try {
                if (entries == null || entries.length() == 0) all.remove(uri); else all.put(uri, entries);
            } catch (Exception e) { return; }
            prefs(c).edit().putString("crops", all.toString()).apply();
        }
    }
    static boolean hasExactCrop(Context c, String uri, String variant) {
        int[] s = screen(c);
        return cropsOf(c, uri).optJSONObject(cropKey(s[0], s[1], variant)) != null;
    }

    // ---------- Traitement de l'image ----------
    static class Res { Bitmap src, out; Rect keep; String info = ""; boolean manual, fill; }

    static int[] screen(Context c) {
        DisplayMetrics dm = new DisplayMetrics();
        Display d = c.getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
        d.getRealMetrics(dm);
        return new int[]{ Math.min(dm.widthPixels, dm.heightPixels), Math.max(dm.widthPixels, dm.heightPixels) };
    }

    static Res process(Context c, Uri u, boolean keepSrc) throws Exception { return process(c, u, keepSrc, "home"); }

    /** variant : « home » (accueil) ou « lock » (verrouillage) : choisit le cadrage manuel à appliquer. */
    static Res process(Context c, Uri u, boolean keepSrc, String variant) throws Exception {
        int[] s = screen(c);
        int sw = s[0], sh = s[1];
        JSONObject o = settings(c);
        int[] dim = bounds(c, u);
        float[] man = resolveCrop(cropsOf(c, u.toString()), sw, sh, variant, dim[0], dim[1]);
        Bitmap src = load(c, u, sh, dim, man, sw, sh);
        Res res = processBitmap(src, sw, sh, o, man);
        if (!keepSrc) { src.recycle(); res.src = null; }
        return res;
    }

    /** Dimensions affichées de l'image d'origine (orientation EXIF comprise) : {largeur, hauteur, largeur brute, hauteur brute, rotation}. */
    static int[] bounds(Context c, Uri u) throws Exception {
        ContentResolver cr = c.getContentResolver();
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        try (InputStream in = cr.openInputStream(u)) { BitmapFactory.decodeStream(in, null, o); }
        if (o.outWidth <= 0 || o.outHeight <= 0) throw new Exception("Image illisible : " + name(c, u));
        int rot = 0;
        try (InputStream in = cr.openInputStream(u)) {
            int or = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
            rot = or == 6 ? 90 : or == 3 ? 180 : or == 8 ? 270 : 0;
        } catch (Exception e) { }
        boolean sw = rot == 90 || rot == 270;
        return new int[]{ sw ? o.outHeight : o.outWidth, sw ? o.outWidth : o.outHeight, o.outWidth, o.outHeight, rot };
    }

    static Bitmap load(Context c, Uri u, int target) throws Exception { return load(c, u, target, bounds(c, u), null, 0, 0); }

    // Réduction à la lecture (inSampleSize) : le petit côté reste ≥ target ; avec un cadrage manuel, c'est la zone
    // choisie qui doit rester au moins aussi grande que l'écran (zoom sur un détail = lecture plus fine). 16 Mpx au plus.
    static Bitmap load(Context c, Uri u, int target, int[] dim, float[] man, int sw, int sh) throws Exception {
        ContentResolver cr = c.getContentResolver();
        int w = dim[2], h = dim[3], ss = 1, rot = dim[4];
        while (true) {
            int n = ss * 2;
            boolean more;
            if (man == null) more = Math.min(w, h) / n >= target;
            else {
                float zw = man[2] * dim[0] / n, zh = man[3] * dim[1] / n;
                more = man[4] > 0 ? (zw >= sw || zh >= sh) : (zw >= sw && zh >= sh);
            }
            if (more || (long) w * h / ((long) ss * ss) > 16000000L) ss *= 2; else break;
        }
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = ss;
        d.inPreferredConfig = Bitmap.Config.ARGB_8888;
        d.inMutable = false;
        Bitmap b;
        try (InputStream in = cr.openInputStream(u)) { b = BitmapFactory.decodeStream(in, null, d); }
        if (b == null) throw new Exception("Image illisible : " + name(c, u));
        if (rot != 0) {
            Matrix m = new Matrix();
            m.postRotate(rot);
            Bitmap rb = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
            if (rb != b) b.recycle();
            b = rb;
        }
        return b;
    }

    // ================= Partie sans Context (testée telle quelle sur la JVM, avec un faux android.graphics) =================
    static String cropKey(int sw, int sh, String variant) {
        int a = sw, b = sh; while (b != 0) { int t = a % b; a = b; b = t; } if (a == 0) a = 1;
        return (sw / a) + ":" + (sh / a) + ("lock".equals(variant) ? "@lock" : "");
    }
    private static boolean cropOk(JSONObject e) {
        if (e == null) return false;
        double w = e.optDouble("w", -1), h = e.optDouble("h", -1), x = e.optDouble("x", Double.NaN), y = e.optDouble("y", Double.NaN);
        return !Double.isNaN(x) && !Double.isNaN(y) && !Double.isInfinite(x) && !Double.isInfinite(y) && w > 0 && h > 0 && w <= 4 && h <= 4;
    }
    private static int cropBg(JSONObject e) {
        String bg = e.optString("bg", "blur");
        if (bg.matches("^#[0-9a-fA-F]{6}$")) return Integer.parseInt(bg.substring(1), 16);
        return -1;
    }
    /** Cadrage à appliquer pour cet écran : celui du format exact, sinon celui d'un autre format recentré
     *  (même centre, même surface, nouveau ratio, dans l'image). {x, y, w, h, libre (0/1), fond (-1 flou ou 0xRRGGBB), exact (0/1)}.
     *  Même calcul que resolve() de recadrage.js et resolveCrop() de toile-worker.js. */
    static float[] resolveCrop(JSONObject E, int sw, int sh, String variant, int ow, int oh) {
        if (E == null || E.length() == 0 || ow <= 0 || oh <= 0) return null;
        String k = cropKey(sw, sh, variant), other = "lock".equals(variant) ? cropKey(sw, sh, null) : cropKey(sw, sh, "lock");
        JSONObject e = E.optJSONObject(k);
        if (cropOk(e)) return new float[]{ (float) e.optDouble("x"), (float) e.optDouble("y"), (float) e.optDouble("w"), (float) e.optDouble("h"), e.optBoolean("free") ? 1 : 0, cropBg(e), 1 };
        final JSONObject EE = E;
        List<String> rest = new ArrayList<>();
        java.util.Iterator<String> it = E.keys();
        while (it.hasNext()) { String q = it.next(); if (!q.equals(k) && !q.equals(other) && cropOk(E.optJSONObject(q))) rest.add(q); }
        Collections.sort(rest, (a, b) -> {
            int c = Double.compare(EE.optJSONObject(b).optDouble("at", 0), EE.optJSONObject(a).optDouble("at", 0));
            return c != 0 ? c : a.compareTo(b);
        });
        List<String> order = new ArrayList<>();
        if (cropOk(E.optJSONObject(other))) order.add(other);
        order.addAll(rest);
        if (order.isEmpty()) return null;
        JSONObject f = E.optJSONObject(order.get(0));
        double x = f.optDouble("x"), y = f.optDouble("y"), w = f.optDouble("w"), h = f.optDouble("h");
        if (f.optBoolean("free")) return new float[]{ (float) x, (float) y, (float) w, (float) h, 1, cropBg(f), 0 };
        double tr = sw / (double) sh, cx = (x + w / 2) * ow, cy = (y + h / 2) * oh, A = (w * ow) * (h * oh);
        double nw = Math.sqrt(A * tr), nh = nw / tr, s = Math.min(1, Math.min(ow / nw, oh / nh));
        nw *= s; nh *= s;
        double nx = Math.max(0, Math.min(ow - nw, cx - nw / 2)), ny = Math.max(0, Math.min(oh - nh, cy - nh / 2));
        return new float[]{ (float) (nx / ow), (float) (ny / oh), (float) (nw / ow), (float) (nh / oh), 0, cropBg(f), 0 };
    }

    /** Traitement complet d'une image déjà lue : cadrage manuel s'il y en a un (prioritaire), sinon le mode automatique choisi. */
    static Res processBitmap(Bitmap src, int sw, int sh, JSONObject o, float[] man) {
        Rect full = new Rect(0, 0, src.getWidth(), src.getHeight());
        Res res = new Res();
        res.src = src;
        if (man != null) {
            int W = src.getWidth(), H = src.getHeight();
            Rect f = new Rect(Math.round(man[0] * W), Math.round(man[1] * H), Math.round((man[0] + man[2]) * W), Math.round((man[1] + man[3]) * H));
            if (f.right <= f.left) f.right = f.left + 1;
            if (f.bottom <= f.top) f.bottom = f.top + 1;
            res.manual = true;
            if (man[4] > 0) {
                // format libre : partie de l'image dans le cadre, centrée sur l'écran, bandes floues ou de couleur autour
                Rect k = new Rect(Math.max(0, f.left), Math.max(0, f.top), Math.min(W, f.right), Math.min(H, f.bottom));
                if (k.width() <= 0 || k.height() <= 0) { f = new Rect(full); k = new Rect(full); }
                res.keep = k;
                res.fill = true;
                res.out = freeFit(src, f, k, sw, sh, (int) man[5]);
                res.info = "cadrage manuel, format libre" + (aspectClose(f, sw, sh) && f.equals(k) ? "" : (int) man[5] == -1 ? ", bandes floues" : ", bandes de couleur");
            } else {
                // cadre au format de l'écran, toujours dans l'image
                int w = Math.max(1, Math.min(W, f.width())), h = Math.max(1, Math.min(H, f.height()));
                int l = Math.max(0, Math.min(W - w, f.left)), t = Math.max(0, Math.min(H - h, f.top));
                res.keep = new Rect(l, t, l + w, t + h);
                res.out = scaleRegion(src, res.keep, sw, sh);
                res.info = "cadrage manuel" + (res.keep.width() < sw ? ", agrandi (moins net)" : "");
            }
            return res;
        }
        Rect r = new Rect(full);
        List<String> info = new ArrayList<>();
        int tol = Math.max(4, Math.min(80, o.optInt("tol", 24)));
        boolean autoFit = "auto".equals(o.optString("fit", "smart"));
        if (autoFit || o.optBoolean("borders", true)) { Rect b = borders(src, r, tol); if (!b.equals(r)) info.add("bordures retirées"); r = b; }
        if (autoFit) {
            Rect t = textBands(src, r);
            if (!t.equals(r)) { info.add("bandeau de texte coupé"); r = borders(src, t, tol); }
            Rect g = logoBands(src, r);
            if (!g.equals(r)) { info.add(g.top > r.top && g.bottom < r.bottom ? "logo ou texte retiré en haut et en bas" : g.top > r.top ? "logo ou texte retiré en haut" : "logo ou texte retiré en bas"); r = g; }
            if (info.isEmpty()) info.add("rien à retirer, image gardée");
        }
        if (!autoFit && o.optBoolean("text", false)) {
            Rect t = textBands(src, r);
            if (!t.equals(r)) { info.add("bandeau de texte coupé"); r = t; if (o.optBoolean("borders", true)) r = borders(src, r, tol); }
        }
        int trim = Math.max(0, Math.min(15, o.optInt("trim", 0)));
        if (trim > 0) { r.inset(r.width() * trim / 100, r.height() * trim / 100); info.add("bords rognés de " + trim + " %"); }
        if (r.width() < full.width() / 4 || r.height() < full.height() / 4 || r.isEmpty()) { r = new Rect(full); info.clear(); }
        String fit = o.optString("fit", "smart");
        if (autoFit) fit = "width"; // recadrage automatique : seuls bordures, bandeaux, logos et écritures détectés sont retirés, le reste en pleine largeur
        res.keep = new Rect(r);
        res.out = fit(src, r, sw, sh, fit, res);
        if (("blur".equals(fit) || ("width".equals(fit) && r.width() / (float) r.height() > sw / (float) sh)) && !aspectClose(r, sw, sh)) { info.add("width".equals(fit) ? "pleine largeur, bandes floues" : "image entière sur fond flou"); res.fill = true; }
        else info.add("ajustée à l'écran " + sw + "×" + sh);
        res.info = String.join(", ", info);
        return res;
    }

    // Format libre : le cadre f (qui peut dépasser l'image) est ajusté dans l'écran ; la partie k de l'image qu'il contient
    // est dessinée à sa place, le reste est rempli de flou (comme blurFit, à partir de k) ou d'une couleur unie.
    static Bitmap freeFit(Bitmap src, Rect f, Rect k, int sw, int sh, int bg) {
        Bitmap out = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        if (bg == -1) {
            float cover = Math.max(sw / (float) k.width(), sh / (float) k.height());
            int cw = Math.min(k.width(), Math.round(sw / cover)), ch = Math.min(k.height(), Math.round(sh / cover));
            Rect cr = new Rect(k.left + (k.width() - cw) / 2, k.top + (k.height() - ch) / 2, k.left + (k.width() - cw) / 2 + cw, k.top + (k.height() - ch) / 2 + ch);
            int tw = Math.max(2, sw / 40), th = Math.max(2, sh / 40);
            Bitmap tiny = Bitmap.createBitmap(tw, th, Bitmap.Config.ARGB_8888);
            new Canvas(tiny).drawBitmap(src, cr, new Rect(0, 0, tw, th), p);
            Bitmap mid = Bitmap.createScaledBitmap(tiny, tw * 4, th * 4, true);
            tiny.recycle();
            cv.drawBitmap(mid, null, new Rect(0, 0, sw, sh), p);
            mid.recycle();
            cv.drawColor(0x73000000);
        } else cv.drawColor(0xFF000000 | bg);
        float s = Math.min(sw / (float) f.width(), sh / (float) f.height());
        float fx = (sw - f.width() * s) / 2f, fy = (sh - f.height() * s) / 2f;
        int dl = Math.round(fx + (k.left - f.left) * s), dt = Math.round(fy + (k.top - f.top) * s);
        int dw = Math.max(1, Math.round(k.width() * s)), dh = Math.max(1, Math.round(k.height() * s));
        Bitmap scaled = scaleRegion(src, k, dw, dh);
        cv.drawBitmap(scaled, dl, dt, p);
        scaled.recycle();
        return out;
    }

    // Bordures : lignes unies depuis chaque bord. Gardées seulement si la couleur est neutre (noir, blanc, gris)
    // ou identique sur les deux côtés opposés (cadre, bandes de format) : un ciel bleu en haut n'est pas coupé.
    static Rect borders(Bitmap b, Rect r, int tol) {
        int[] buf = new int[Math.max(b.getWidth(), b.getHeight())];
        int maxV = r.height() * 2 / 5, maxH = r.width() * 2 / 5;
        int[] t = band(b, r, 0, maxV, tol, buf), bo = band(b, r, 1, maxV, tol, buf);
        int[] l = band(b, r, 2, maxH, tol, buf), ri = band(b, r, 3, maxH, tol, buf);
        boolean pairV = t[0] > 0 && bo[0] > 0 && near(t[1], bo[1], tol * 2);
        boolean pairH = l[0] > 0 && ri[0] > 0 && near(l[1], ri[1], tol * 2);
        int top = (t[0] > 1 && (pairV || neutral(t[1]))) ? t[0] + 1 : 0;
        int bot = (bo[0] > 1 && (pairV || neutral(bo[1]))) ? bo[0] + 1 : 0;
        int lef = (l[0] > 1 && (pairH || neutral(l[1]))) ? l[0] + 1 : 0;
        int rig = (ri[0] > 1 && (pairH || neutral(ri[1]))) ? ri[0] + 1 : 0;
        Rect n = new Rect(r.left + lef, r.top + top, r.right - rig, r.bottom - bot);
        if (n.width() < r.width() / 5 || n.height() < r.height() / 5) return new Rect(r);
        return n;
    }

    // side : 0 haut, 1 bas, 2 gauche, 3 droite. Retourne {épaisseur, couleur}
    private static int[] band(Bitmap b, Rect r, int side, int max, int tol, int[] buf) {
        int edge = lineColor(b, r, side, 0, tol, buf);
        if (edge == -1) return new int[]{ 0, 0 };
        int n = 1;
        while (n < max) {
            int cc = lineColor(b, r, side, n, tol, buf);
            if (cc == -1 || !near(cc, edge, tol)) break;
            n++;
        }
        if (n >= max) return new int[]{ 0, 0 };
        return new int[]{ n, edge };
    }

    private static int lineColor(Bitmap b, Rect r, int side, int k, int tol, int[] buf) {
        int len;
        if (side < 2) {
            int y = side == 0 ? r.top + k : r.bottom - 1 - k;
            len = r.width();
            b.getPixels(buf, 0, len, r.left, y, len, 1);
        } else {
            int x = side == 2 ? r.left + k : r.right - 1 - k;
            len = r.height();
            b.getPixels(buf, 0, 1, x, r.top, 1, len);
        }
        return uniform(buf, len, tol);
    }

    private static int uniform(int[] px, int n, int tol) {
        if (n <= 0) return -1;
        long sr = 0, sg = 0, sb = 0;
        for (int i = 0; i < n; i++) { int p = px[i]; sr += (p >> 16) & 255; sg += (p >> 8) & 255; sb += p & 255; }
        int mr = (int) (sr / n), mg = (int) (sg / n), mb = (int) (sb / n);
        int bad = 0, allow = Math.max(1, n / 50);
        for (int i = 0; i < n; i++) {
            int p = px[i];
            if (Math.abs(((p >> 16) & 255) - mr) > tol || Math.abs(((p >> 8) & 255) - mg) > tol || Math.abs((p & 255) - mb) > tol)
                if (++bad > allow) return -1;
        }
        return Color.rgb(mr, mg, mb) & 0xFFFFFF;
    }

    private static boolean near(int a, int b, int tol) {
        return Math.abs(((a >> 16) & 255) - ((b >> 16) & 255)) <= tol && Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= tol && Math.abs((a & 255) - (b & 255)) <= tol;
    }

    private static boolean neutral(int c) {
        int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        int mx = Math.max(r, Math.max(g, b)), mn = Math.min(r, Math.min(g, b));
        return mx - mn < 30 && (mx < 60 || mn > 200 || mx - mn < 12);
    }

    // Bandeaux de texte en haut ou en bas : fond d'une seule couleur (≥ 60 % de la ligne) avec des traits de lettres.
    static Rect textBands(Bitmap b, Rect r) {
        int zone = r.height() * 22 / 100;
        int minLen = Math.max(4, r.height() * 15 / 1000);
        int[] buf = new int[r.width()];
        int[] hist = new int[4096];
        int top = textBand(b, r, true, zone, minLen, buf, hist);
        int bot = textBand(b, r, false, zone, minLen, buf, hist);
        int margin = r.height() / 200;
        Rect n = new Rect(r.left, r.top + (top > 0 ? top + margin : 0), r.right, r.bottom - (bot > 0 ? bot + margin : 0));
        return n.height() < r.height() / 2 ? new Rect(r) : n;
    }

    // Logo, signature ou écriture incrustés près du haut ou du bas (filigrane sur la photo) :
    // rangées où les contrastes forts sont bien plus denses qu'au cœur de l'image, regroupées contre le bord.
    static Rect logoBands(Bitmap b, Rect r) {
        int W = 640, H = Math.max(40, Math.round(640f * r.height() / Math.max(1, r.width())));
        Bitmap sm = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        new Canvas(sm).drawBitmap(b, r, new Rect(0, 0, W, H), new Paint(Paint.FILTER_BITMAP_FLAG));
        int[] px = new int[W * H];
        sm.getPixels(px, 0, W, 0, 0, W, H);
        sm.recycle();
        int nSeg = 6;
        int[] d = new int[H];
        int[] seg = new int[nSeg];
        for (int y = 0; y < H; y++) {
            Arrays.fill(seg, 0);
            int prev = -1;
            for (int x = 0; x < W; x++) {
                int p = px[y * W + x];
                int l = (((p >> 16) & 255) * 3 + ((p >> 8) & 255) * 6 + (p & 255)) / 10;
                if (prev >= 0 && Math.abs(l - prev) > 40) seg[Math.min(nSeg - 1, x * nSeg / W)]++;
                prev = l;
            }
            int m = 0; for (int v : seg) m = Math.max(m, v);
            d[y] = m; // densité d'écriture : la portion de rangée (1/6 de largeur) la plus chargée en contrastes
        }
        int[] mid = Arrays.copyOfRange(d, H / 4, Math.max(H / 4 + 1, H * 3 / 4));
        Arrays.sort(mid);
        double thr = Math.max(7, mid[mid.length / 2] * 2.5 + 3);
        int zone = Math.max(3, H * 18 / 100);
        int top = logoCut(d, zone, thr, true), bot = logoCut(d, zone, thr, false);
        float k = r.height() / (float) H;
        Rect n = new Rect(r.left, r.top + Math.round(top * k), r.right, r.bottom - Math.round(bot * k));
        return n.height() < r.height() * 0.65f ? new Rect(r) : n;
    }

    private static int logoCut(int[] d, int zone, double thr, boolean fromTop) {
        int H = d.length, hot = 0, last = -1;
        for (int k = 0; k < zone; k++) { int y = fromTop ? k : H - 1 - k; if (d[y] > thr) { hot++; last = k; } }
        if (hot < 3 || last < 0) return 0;
        // l'écriture doit être isolée contre le bord : juste après, l'image redevient calme
        int look = Math.max(3, zone / 2);
        for (int k = last + 1; k <= last + look && k < H; k++) { int y = fromTop ? k : H - 1 - k; if (d[y] > thr) return 0; }
        return last + 2;
    }

    private static int textBand(Bitmap b, Rect r, boolean fromTop, int zone, int minLen, int[] buf, int[] hist) {
        int w = r.width(), step = Math.max(1, w / 400);
        int edgeBin = -1, len = 0, textRows = 0;
        for (int k = 0; k < zone; k++) {
            int y = fromTop ? r.top + k : r.bottom - 1 - k;
            b.getPixels(buf, 0, w, r.left, y, w, 1);
            Arrays.fill(hist, 0);
            int n = 0, edges = 0, prevL = -1;
            for (int x = 0; x < w; x += step) {
                int p = buf[x];
                int pr = (p >> 16) & 255, pg = (p >> 8) & 255, pb = p & 255;
                hist[((pr >> 4) << 8) | ((pg >> 4) << 4) | (pb >> 4)]++;
                int lum = (pr * 3 + pg * 6 + pb) / 10;
                if (prevL >= 0 && Math.abs(lum - prevL) > 70) edges++;
                prevL = lum;
                n++;
            }
            int best = 0, bin = 0;
            for (int i = 0; i < 4096; i++) if (hist[i] > best) { best = hist[i]; bin = i; }
            boolean caption = best >= n * 0.45;
            if (!caption) break;
            if (edgeBin == -1) edgeBin = bin;
            else if (!binNear(bin, edgeBin)) break;
            len++;
            if (edges >= 2) textRows++;
        }
        if (len >= zone) return 0;
        if (len < minLen || textRows < 3) return 0;
        return len;
    }

    private static boolean binNear(int a, int b) {
        return Math.abs((a >> 8) - (b >> 8)) <= 1 && Math.abs(((a >> 4) & 15) - ((b >> 4) & 15)) <= 1 && Math.abs((a & 15) - (b & 15)) <= 1;
    }

    private static boolean aspectClose(Rect r, int sw, int sh) {
        float ir = r.width() / (float) r.height(), tr = sw / (float) sh;
        return Math.abs(ir / tr - 1f) <= 0.08f;
    }

    static Bitmap fit(Bitmap src, Rect r, int sw, int sh, String mode, Res res) {
        float tr = sw / (float) sh, ir = r.width() / (float) r.height();
        if ("blur".equals(mode) && !aspectClose(r, sw, sh)) return blurFit(src, r, sw, sh);
        // Pleine largeur : toute la largeur de l'image est gardée ; image plus large que l'écran → bandes floues en haut et en bas, plus haute → recadrage vertical intelligent
        if ("width".equals(mode) && ir > tr && !aspectClose(r, sw, sh)) return blurFit(src, r, sw, sh);
        Rect crop = new Rect(r);
        boolean center = "center".equals(mode);
        if (ir > tr) {
            int cw = Math.max(1, Math.min(r.width(), Math.round(r.height() * tr)));
            int x = center ? r.left + (r.width() - cw) / 2 : bestOffset(src, r, cw, true);
            crop = new Rect(x, r.top, x + cw, r.bottom);
        } else if (ir < tr) {
            int ch = Math.max(1, Math.min(r.height(), Math.round(r.width() / tr)));
            int y = center ? r.top + (r.height() - ch) / 2 : bestOffset(src, r, ch, false);
            crop = new Rect(r.left, y, r.right, y + ch);
        }
        res.keep = crop;
        return scaleRegion(src, crop, sw, sh);
    }

    // Réduction par moitiés successives puis au format exact : image nette, sans crénelage
    static Bitmap scaleRegion(Bitmap src, Rect crop, int w, int h) {
        Bitmap cur = Bitmap.createBitmap(src, crop.left, crop.top, crop.width(), crop.height());
        boolean owned = cur != src;
        while (cur.getWidth() / 2 >= w && cur.getHeight() / 2 >= h) {
            Bitmap half = Bitmap.createScaledBitmap(cur, cur.getWidth() / 2, cur.getHeight() / 2, true);
            if (owned) cur.recycle();
            cur = half; owned = true;
        }
        Bitmap out = Bitmap.createScaledBitmap(cur, w, h, true);
        if (owned && out != cur) cur.recycle();
        if (out == src) out = out.copy(Bitmap.Config.ARGB_8888, false);
        return out;
    }

    // Recadrage intelligent : on garde la zone la plus riche en détails et en couleurs, avec une légère préférence pour le centre
    static int bestOffset(Bitmap src, Rect r, int len, boolean horizontal) {
        float s = 160f / Math.max(r.width(), r.height());
        int smw = Math.max(2, Math.round(r.width() * s)), smh = Math.max(2, Math.round(r.height() * s));
        Bitmap sm = Bitmap.createBitmap(smw, smh, Bitmap.Config.ARGB_8888);
        new Canvas(sm).drawBitmap(src, r, new Rect(0, 0, smw, smh), new Paint(Paint.FILTER_BITMAP_FLAG));
        int[] px = new int[smw * smh];
        sm.getPixels(px, 0, smw, 0, 0, smw, smh);
        sm.recycle();
        int n = horizontal ? smw : smh;
        double[] prof = new double[n];
        for (int y = 0; y < smh; y++) for (int x = 0; x < smw; x++) {
            int p = px[y * smw + x];
            int pr = (p >> 16) & 255, pg = (p >> 8) & 255, pb = p & 255;
            int l = (pr * 3 + pg * 6 + pb) / 10;
            double e = 0;
            if (x + 1 < smw) { int q = px[y * smw + x + 1]; e += Math.abs(l - (((q >> 16) & 255) * 3 + ((q >> 8) & 255) * 6 + (q & 255)) / 10); }
            if (y + 1 < smh) { int q = px[(y + 1) * smw + x]; e += Math.abs(l - (((q >> 16) & 255) * 3 + ((q >> 8) & 255) * 6 + (q & 255)) / 10); }
            e += 0.25 * (Math.max(pr, Math.max(pg, pb)) - Math.min(pr, Math.min(pg, pb)));
            prof[horizontal ? x : y] += e;
        }
        int win = Math.max(1, Math.min(n, Math.round(len * s)));
        int range = n - win;
        if (range <= 0) return horizontal ? r.left : r.top;
        double sum = 0, total = 0;
        for (int i = 0; i < n; i++) total += prof[i];
        for (int i = 0; i < win; i++) sum += prof[i];
        double bestScore = -1e18; int best = range / 2;
        double mid = range / 2.0;
        for (int off = 0; off <= range; off++) {
            if (off > 0) sum += prof[off + win - 1] - prof[off - 1];
            double score = sum - 0.2 * (total * win / n) * Math.abs(off - mid) / Math.max(1, mid);
            if (score > bestScore) { bestScore = score; best = off; }
        }
        int full = horizontal ? r.width() : r.height();
        int o = Math.round(best / s);
        o = Math.max(0, Math.min(full - len, o));
        return (horizontal ? r.left : r.top) + o;
    }

    static Bitmap blurFit(Bitmap src, Rect r, int sw, int sh) {
        Bitmap out = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint p = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        float cover = Math.max(sw / (float) r.width(), sh / (float) r.height());
        int cw = Math.min(r.width(), Math.round(sw / cover)), ch = Math.min(r.height(), Math.round(sh / cover));
        Rect cr = new Rect(r.left + (r.width() - cw) / 2, r.top + (r.height() - ch) / 2, r.left + (r.width() - cw) / 2 + cw, r.top + (r.height() - ch) / 2 + ch);
        int tw = Math.max(2, sw / 40), th = Math.max(2, sh / 40);
        Bitmap tiny = Bitmap.createBitmap(tw, th, Bitmap.Config.ARGB_8888);
        new Canvas(tiny).drawBitmap(src, cr, new Rect(0, 0, tw, th), p);
        Bitmap mid = Bitmap.createScaledBitmap(tiny, tw * 4, th * 4, true);
        tiny.recycle();
        cv.drawBitmap(mid, null, new Rect(0, 0, sw, sh), p);
        mid.recycle();
        cv.drawColor(0x73000000);
        float fs = Math.min(sw / (float) r.width(), sh / (float) r.height());
        int fw = Math.max(1, Math.round(r.width() * fs)), fh = Math.max(1, Math.round(r.height() * fs));
        Bitmap scaled = scaleRegion(src, r, fw, fh);
        int x = (sw - fw) / 2, y = (sh - fh) / 2;
        cv.drawBitmap(scaled, x, y, p);
        scaled.recycle();
        return out;
    }

    // ================= Fin de la partie sans Context =================

    // ================= Fond « Toile (double tap) » =================
    // Fond d'écran Android tenu par Toile : il affiche l'image recadrée de l'accueil et passe à la suivante
    // quand on tapote deux fois une zone vide de l'écran d'accueil (commande « tap » envoyée par le lanceur ;
    // à défaut, toucher direct). Rien n'est animé : dessin uniquement au changement d'image ou à l'affichage.
    static File liveFile(Context c) { return new File(c.getFilesDir(), "toile-live.jpg"); }

    static boolean liveOn(Context c) {
        try {
            android.app.WallpaperInfo wi = WallpaperManager.getInstance(c).getWallpaperInfo();
            return wi != null && c.getPackageName().equals(wi.getPackageName()) && wi.getServiceName().endsWith("WallpaperJob$Live");
        } catch (Throwable t) { return false; }
    }

    static void writeLive(Context c, Bitmap b) throws Exception {
        File f = liveFile(c), tmp = new File(c.getFilesDir(), "toile-live.tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) { b.compress(Bitmap.CompressFormat.JPEG, 95, o); }
        if (!tmp.renameTo(f)) { f.delete(); if (!tmp.renameTo(f)) throw new Exception("Écriture du fond impossible"); }
        Live.refresh();
    }

    /** Prépare l'image du fond Toile avant son activation : dernier fond posé par Toile, sinon une image du dossier. */
    static void livePrepare(Context c) {
        if (liveFile(c).exists()) return;
        synchronized (LOCK) {
            try {
                List<String> h = history(c);
                Uri u = null;
                if (!h.isEmpty()) u = Uri.parse(h.get(h.size() - 1));
                else { List<Uri> all = list(c); if (!all.isEmpty()) u = pick(c, all); }
                if (u == null) return;
                Res r = process(c, u, false, "home");
                try { File f = liveFile(c); try (FileOutputStream o = new FileOutputStream(f)) { r.out.compress(Bitmap.CompressFormat.JPEG, 95, o); } }
                finally { r.out.recycle(); }
            } catch (Throwable t) { }
        }
    }

    // ================= Séquence animée (vidéo en boucle comme fond « Toile (double tap) ») =================
    // La vidéo choisie est copiée dans le dossier privé de Toile (files/toile-video.mp4). Réglages (préférence
    // « toile_video ») : on, debut / fin (ms, boucle entre les deux), haut / bas / gauche / droite (% rognés : barres d'un
    // enregistrement d'écran…). Lecture sans son par MediaPlayer, dessinée en OpenGL ES (texture externe) pour pouvoir
    // rogner puis remplir l'écran ; en pause dès que le fond n'est plus visible (écran éteint, appli par-dessus).
    static File videoFile(Context c) { return new File(c.getFilesDir(), "toile-video.mp4"); }
    static SharedPreferences vprefs(Context c) { return c.getSharedPreferences("toile_video", Context.MODE_PRIVATE); }
    static JSONObject videoCfg(Context c) {
        JSONObject o; try { o = new JSONObject(vprefs(c).getString("cfg", "{}")); } catch (Exception e) { o = new JSONObject(); }
        try { o.put("existe", videoFile(c).exists()); } catch (Exception e) { }
        return o;
    }
    static void videoSave(Context c, String json) {
        try {
            JSONObject o = videoCfg(c), n = new JSONObject(json); JSONArray k = n.names();
            for (int i = 0; k != null && i < k.length(); i++) o.put(k.getString(i), n.get(k.getString(i)));
            o.remove("existe"); vprefs(c).edit().putString("cfg", o.toString()).apply();
        } catch (Exception e) { }
        Live.refresh();
    }
    static String videoSet(Context c, Uri u) throws Exception {
        File f = videoFile(c), tmp = new File(c.getFilesDir(), "toile-video.tmp"); long n = 0;
        try (InputStream in = c.getContentResolver().openInputStream(u); FileOutputStream o = new FileOutputStream(tmp)) {
            byte[] b = new byte[1 << 16]; int r; while ((r = in.read(b)) > 0) { o.write(b, 0, r); n += r; if (n > 400L * 1024 * 1024) throw new Exception("Vidéo trop lourde (400 Mo au plus)"); }
        }
        String nom = "vidéo"; try (Cursor cu = c.getContentResolver().query(u, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null)) { if (cu != null && cu.moveToFirst()) nom = cu.getString(0); } catch (Exception e) { }
        return videoInstall(c, tmp, nom, null);
    }
    /** vidéo déjà copiée dans toile-video.tmp (galerie ou téléchargement) : vérifiée, mise en place, réglages remis à zéro ;
     *  credit = auteur / licence / page pour une vidéo en ligne */
    static String videoInstall(Context c, File tmp, String nom, JSONObject credit) throws Exception {
        File f = videoFile(c);
        android.media.MediaMetadataRetriever mr = new android.media.MediaMetadataRetriever();
        long duree; int w, h;
        try {
            mr.setDataSource(tmp.getAbsolutePath());
            duree = Long.parseLong(mr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));
            w = Integer.parseInt(mr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            h = Integer.parseInt(mr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            String rot = mr.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
            if ("90".equals(rot) || "270".equals(rot)) { int t = w; w = h; h = t; }
        } catch (Exception e) { tmp.delete(); throw new Exception("Ce fichier n'est pas une vidéo lisible"); }
        finally { try { mr.release(); } catch (Throwable t) { } }
        f.delete(); if (!tmp.renameTo(f)) throw new Exception("Copie de la vidéo impossible");
        JSONObject o = new JSONObject();
        o.put("on", true); o.put("debut", 0); o.put("fin", duree); o.put("duree", duree); o.put("w", w); o.put("h", h); o.put("nom", nom);
        o.put("haut", 0); o.put("bas", 0); o.put("gauche", 0); o.put("droite", 0);
        if (credit != null) o.put("credit", credit);
        vprefs(c).edit().putString("cfg", o.toString()).apply();
        Live.refresh();
        o.put("existe", true); return o.toString();
    }
    /** image de la vidéo à l'instant ms (aperçu du découpage dans la page) */
    static String videoFrame(Context c, long ms) throws Exception {
        android.media.MediaMetadataRetriever mr = new android.media.MediaMetadataRetriever();
        try {
            mr.setDataSource(videoFile(c).getAbsolutePath());
            Bitmap b = mr.getFrameAtTime(ms * 1000L, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
            if (b == null) throw new Exception("Image introuvable");
            float k = Math.min(1f, 480f / Math.max(b.getWidth(), b.getHeight()));
            Bitmap s = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * k)), Math.max(1, Math.round(b.getHeight() * k)), true);
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); s.compress(Bitmap.CompressFormat.JPEG, 80, bo);
            return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } finally { try { mr.release(); } catch (Throwable t) { } }
    }
    static boolean videoActive(Context c) { JSONObject o = videoCfg(c); return o.optBoolean("on") && o.optBoolean("existe"); }

    /** Lecture de la vidéo sur la surface du fond, dans son propre fil (OpenGL ES 2, texture externe) */
    static final class VideoGl implements android.graphics.SurfaceTexture.OnFrameAvailableListener {
        final android.os.HandlerThread th = new android.os.HandlerThread("toile-video");
        final android.os.Handler gh;
        android.opengl.EGLDisplay dpy; android.opengl.EGLContext ctx; android.opengl.EGLSurface surf;
        android.graphics.SurfaceTexture st; android.view.Surface sf; android.media.MediaPlayer mp;
        int prog, tex, aPos, aTex, uM; final float[] mtx = new float[16];
        volatile int sw, sh; volatile boolean vis, mort; JSONObject cfg; long debut, fin;

        VideoGl(final android.view.SurfaceHolder holder, final File f, final JSONObject cfg, int w, int h, boolean visible) {
            this.cfg = cfg; sw = w; sh = h; vis = visible; debut = cfg.optLong("debut", 0); fin = cfg.optLong("fin", 0);
            th.start(); gh = new android.os.Handler(th.getLooper());
            gh.post(new Runnable() { public void run() { try { init(holder, f); } catch (Throwable t) { liberer(); } } });
        }
        static int shader(int type, String src) { int s = android.opengl.GLES20.glCreateShader(type); android.opengl.GLES20.glShaderSource(s, src); android.opengl.GLES20.glCompileShader(s); return s; }
        void init(android.view.SurfaceHolder holder, File f) throws Exception {
            dpy = android.opengl.EGL14.eglGetDisplay(android.opengl.EGL14.EGL_DEFAULT_DISPLAY);
            int[] v = new int[2]; android.opengl.EGL14.eglInitialize(dpy, v, 0, v, 1);
            int[] at = { android.opengl.EGL14.EGL_RED_SIZE, 8, android.opengl.EGL14.EGL_GREEN_SIZE, 8, android.opengl.EGL14.EGL_BLUE_SIZE, 8,
                android.opengl.EGL14.EGL_RENDERABLE_TYPE, android.opengl.EGL14.EGL_OPENGL_ES2_BIT, android.opengl.EGL14.EGL_SURFACE_TYPE, android.opengl.EGL14.EGL_WINDOW_BIT, android.opengl.EGL14.EGL_NONE };
            android.opengl.EGLConfig[] cf = new android.opengl.EGLConfig[1]; int[] nc = new int[1];
            android.opengl.EGL14.eglChooseConfig(dpy, at, 0, cf, 0, 1, nc, 0);
            if (nc[0] < 1) throw new Exception("EGL");
            ctx = android.opengl.EGL14.eglCreateContext(dpy, cf[0], android.opengl.EGL14.EGL_NO_CONTEXT, new int[]{ android.opengl.EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, android.opengl.EGL14.EGL_NONE }, 0);
            surf = android.opengl.EGL14.eglCreateWindowSurface(dpy, cf[0], holder.getSurface(), new int[]{ android.opengl.EGL14.EGL_NONE }, 0);
            android.opengl.EGL14.eglMakeCurrent(dpy, surf, surf, ctx);
            String vs = "attribute vec4 aPos; attribute vec4 aTex; uniform mat4 uM; varying vec2 vT; void main(){ gl_Position = aPos; vT = (uM * aTex).xy; }";
            String fs = "#extension GL_OES_EGL_image_external : require\nprecision mediump float; uniform samplerExternalOES sT; varying vec2 vT; void main(){ gl_FragColor = texture2D(sT, vT); }";
            prog = android.opengl.GLES20.glCreateProgram();
            android.opengl.GLES20.glAttachShader(prog, shader(android.opengl.GLES20.GL_VERTEX_SHADER, vs));
            android.opengl.GLES20.glAttachShader(prog, shader(android.opengl.GLES20.GL_FRAGMENT_SHADER, fs));
            android.opengl.GLES20.glLinkProgram(prog);
            aPos = android.opengl.GLES20.glGetAttribLocation(prog, "aPos"); aTex = android.opengl.GLES20.glGetAttribLocation(prog, "aTex"); uM = android.opengl.GLES20.glGetUniformLocation(prog, "uM");
            int[] t = new int[1]; android.opengl.GLES20.glGenTextures(1, t, 0); tex = t[0];
            android.opengl.GLES20.glBindTexture(android.opengl.GLES11Ext.GL_TEXTURE_EXTERNAL_OES, tex);
            android.opengl.GLES20.glTexParameteri(android.opengl.GLES11Ext.GL_TEXTURE_EXTERNAL_OES, android.opengl.GLES20.GL_TEXTURE_MIN_FILTER, android.opengl.GLES20.GL_LINEAR);
            android.opengl.GLES20.glTexParameteri(android.opengl.GLES11Ext.GL_TEXTURE_EXTERNAL_OES, android.opengl.GLES20.GL_TEXTURE_MAG_FILTER, android.opengl.GLES20.GL_LINEAR);
            android.opengl.GLES20.glTexParameteri(android.opengl.GLES11Ext.GL_TEXTURE_EXTERNAL_OES, android.opengl.GLES20.GL_TEXTURE_WRAP_S, android.opengl.GLES20.GL_CLAMP_TO_EDGE);
            android.opengl.GLES20.glTexParameteri(android.opengl.GLES11Ext.GL_TEXTURE_EXTERNAL_OES, android.opengl.GLES20.GL_TEXTURE_WRAP_T, android.opengl.GLES20.GL_CLAMP_TO_EDGE);
            st = new android.graphics.SurfaceTexture(tex); st.setOnFrameAvailableListener(this, gh); sf = new android.view.Surface(st);
            mp = new android.media.MediaPlayer();
            mp.setDataSource(f.getAbsolutePath()); mp.setSurface(sf); mp.setVolume(0f, 0f); mp.setLooping(fin <= 0 || fin >= cfg.optLong("duree", 0) - 50 && debut <= 0);
            mp.setOnCompletionListener(new android.media.MediaPlayer.OnCompletionListener() { public void onCompletion(android.media.MediaPlayer m) { if (mort) return; aller(debut); if (vis) m.start(); } });
            mp.prepare();
            if (debut > 0) aller(debut);
            if (vis) mp.start();
            boucle();
        }
        void aller(long ms) { try { if (android.os.Build.VERSION.SDK_INT >= 26) mp.seekTo(ms, android.media.MediaPlayer.SEEK_CLOSEST); else mp.seekTo((int) ms); } catch (Throwable t) { } }
        void boucle() {
            if (mort) return;
            try { if (mp != null && mp.isPlaying() && fin > debut && fin < cfg.optLong("duree", 0) - 50 && mp.getCurrentPosition() >= fin) aller(debut); } catch (Throwable t) { }
            gh.postDelayed(new Runnable() { public void run() { boucle(); } }, 120);
        }
        @Override public void onFrameAvailable(android.graphics.SurfaceTexture s) { if (!mort) try { dessiner(); } catch (Throwable t) { } }
        void dessiner() {
            st.updateTexImage(); st.getTransformMatrix(mtx);
            float W = Math.max(1, cfg.optInt("w", 1)), H = Math.max(1, cfg.optInt("h", 1));
            float x0 = (float) cfg.optDouble("gauche", 0) / 100f, x1 = 1f - (float) cfg.optDouble("droite", 0) / 100f, y0 = (float) cfg.optDouble("haut", 0) / 100f, y1 = 1f - (float) cfg.optDouble("bas", 0) / 100f;
            if (x1 - x0 < .1f) { x0 = 0; x1 = 1; } if (y1 - y0 < .1f) { y0 = 0; y1 = 1; }
            float ra = (x1 - x0) * W / ((y1 - y0) * H), rs = sw / (float) Math.max(1, sh);
            if (ra > rs) { float nw = (y1 - y0) * H * rs / W, cx = (x0 + x1) / 2; x0 = cx - nw / 2; x1 = cx + nw / 2; }
            else { float nh = (x1 - x0) * W / rs / H, cy = (y0 + y1) / 2; y0 = cy - nh / 2; y1 = cy + nh / 2; }
            float[] pos = { -1, -1, 1, -1, -1, 1, 1, 1 };
            float[] tc = { x0, 1 - y1, 0, 1, x1, 1 - y1, 0, 1, x0, 1 - y0, 0, 1, x1, 1 - y0, 0, 1 };
            java.nio.FloatBuffer pb = java.nio.ByteBuffer.allocateDirect(pos.length * 4).order(java.nio.ByteOrder.nativeOrder()).asFloatBuffer(); pb.put(pos).position(0);
            java.nio.FloatBuffer tb = java.nio.ByteBuffer.allocateDirect(tc.length * 4).order(java.nio.ByteOrder.nativeOrder()).asFloatBuffer(); tb.put(tc).position(0);
            android.opengl.GLES20.glViewport(0, 0, sw, sh);
            android.opengl.GLES20.glClearColor(0, 0, 0, 1); android.opengl.GLES20.glClear(android.opengl.GLES20.GL_COLOR_BUFFER_BIT);
            android.opengl.GLES20.glUseProgram(prog);
            android.opengl.GLES20.glActiveTexture(android.opengl.GLES20.GL_TEXTURE0);
            android.opengl.GLES20.glBindTexture(android.opengl.GLES11Ext.GL_TEXTURE_EXTERNAL_OES, tex);
            android.opengl.GLES20.glUniformMatrix4fv(uM, 1, false, mtx, 0);
            android.opengl.GLES20.glEnableVertexAttribArray(aPos); android.opengl.GLES20.glVertexAttribPointer(aPos, 2, android.opengl.GLES20.GL_FLOAT, false, 0, pb);
            android.opengl.GLES20.glEnableVertexAttribArray(aTex); android.opengl.GLES20.glVertexAttribPointer(aTex, 4, android.opengl.GLES20.GL_FLOAT, false, 0, tb);
            android.opengl.GLES20.glDrawArrays(android.opengl.GLES20.GL_TRIANGLE_STRIP, 0, 4);
            android.opengl.EGL14.eglSwapBuffers(dpy, surf);
        }
        void taille(int w, int h) { sw = w; sh = h; }
        void visible(final boolean v) { vis = v; gh.post(new Runnable() { public void run() { try { if (mp == null) return; if (v) mp.start(); else if (mp.isPlaying()) mp.pause(); } catch (Throwable t) { } } }); }
        void liberer() {
            mort = true;
            try { if (mp != null) { mp.setSurface(null); mp.release(); } } catch (Throwable t) { } mp = null;
            try { if (sf != null) sf.release(); } catch (Throwable t) { }
            try { if (st != null) st.release(); } catch (Throwable t) { }
            try {
                if (dpy != null) {
                    android.opengl.EGL14.eglMakeCurrent(dpy, android.opengl.EGL14.EGL_NO_SURFACE, android.opengl.EGL14.EGL_NO_SURFACE, android.opengl.EGL14.EGL_NO_CONTEXT);
                    if (surf != null) android.opengl.EGL14.eglDestroySurface(dpy, surf);
                    if (ctx != null) android.opengl.EGL14.eglDestroyContext(dpy, ctx);
                    android.opengl.EGL14.eglReleaseThread(); android.opengl.EGL14.eglTerminate(dpy);
                }
            } catch (Throwable t) { }
            dpy = null;
        }
        /** arrêt : attend que le fil ait tout libéré (la surface redevient utilisable pour le dessin des images) */
        void arreter() {
            final java.util.concurrent.CountDownLatch l = new java.util.concurrent.CountDownLatch(1);
            gh.removeCallbacksAndMessages(null);
            gh.post(new Runnable() { public void run() { liberer(); l.countDown(); } });
            try { l.await(1500, java.util.concurrent.TimeUnit.MILLISECONDS); } catch (Throwable t) { }
            th.quitSafely();
        }
    }

    public static class Live extends android.service.wallpaper.WallpaperService {
        static final Set<Live.Eng> engines = Collections.synchronizedSet(new HashSet<Live.Eng>());
        static volatile boolean gotCommand = false;   // le lanceur envoie « tap » : on ignore alors le toucher brut
        static void refresh() { Live.Eng[] a; synchronized (engines) { a = engines.toArray(new Live.Eng[0]); } for (Live.Eng e : a) e.reload(); }

        @Override public Engine onCreateEngine() { return new Eng(); }

        final class Eng extends Engine {
            private final android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
            private Bitmap bm, old; private long fadeAt; private boolean visible, changing;
            private long lastTap; private float lx, ly, dx0, dy0; private int w, hh;
            private final Paint p = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);

            private VideoGl vgl; private boolean surface; private String vcle = "";
            @Override public void onCreate(android.view.SurfaceHolder s) { super.onCreate(s); setTouchEventsEnabled(true); engines.add(this); load(); }
            @Override public void onDestroy() { engines.remove(this); h.removeCallbacksAndMessages(null); videoStop(); super.onDestroy(); }
            @Override public void onVisibilityChanged(boolean v) { visible = v; if (vgl != null) vgl.visible(v); else if (v) draw(); }
            @Override public void onSurfaceCreated(android.view.SurfaceHolder s) { super.onSurfaceCreated(s); surface = true; }
            @Override public void onSurfaceDestroyed(android.view.SurfaceHolder s) { surface = false; videoStop(); super.onSurfaceDestroyed(s); }
            @Override public void onSurfaceChanged(android.view.SurfaceHolder s, int f, int width, int height) { w = width; hh = height; surface = true; if (vgl != null) vgl.taille(w, hh); else if (!videoCheck()) draw(); }
            @Override public void onSurfaceRedrawNeeded(android.view.SurfaceHolder s) { if (vgl == null) draw(); }

            /** séquence animée : démarre ou arrête la vidéo selon les réglages ; vrai si la vidéo tourne */
            private boolean videoCheck() {
                Context c = getApplicationContext();
                if (videoActive(c)) {
                    if (vgl == null && surface && w > 0) { try { vcle = videoCfg(c).toString(); vgl = new VideoGl(getSurfaceHolder(), videoFile(c), videoCfg(c), w, hh, visible); } catch (Throwable t) { vgl = null; } }
                    return vgl != null;
                }
                if (vgl != null) { videoStop(); draw(); }
                return false;
            }
            private void videoStop() { if (vgl != null) { VideoGl v = vgl; vgl = null; v.arreter(); } }

            void reload() { h.post(new Runnable() { public void run() {
                if (vgl != null && videoActive(getApplicationContext()) && videoCfg(getApplicationContext()).toString().equals(vcle)) return;   // rien n'a changé pour la vidéo
                if (vgl != null) videoStop();   // réglages changés : la vidéo repart avec les nouveaux
                if (videoCheck()) return;
                old = bm; load(); fadeAt = android.os.SystemClock.uptimeMillis(); frame();
            } }); }

            private void load() {
                try {
                    File f = liveFile(getApplicationContext());
                    bm = f.exists() ? BitmapFactory.decodeFile(f.getAbsolutePath()) : null;
                    if (bm == null && !changing && !videoActive(getApplicationContext())) next();   // première fois : on prend une image
                } catch (Throwable t) { bm = null; }
            }

            private void frame() {
                draw();
                if (old != null) {
                    if (android.os.SystemClock.uptimeMillis() - fadeAt < 450) h.postDelayed(new Runnable() { public void run() { frame(); } }, 30);
                    else { old = null; draw(); }
                }
            }

            private void drawImg(Canvas c, Bitmap b, int alpha) {
                if (b == null || b.isRecycled()) return;
                int cw = c.getWidth(), ch = c.getHeight();
                float sc = Math.max(cw / (float) b.getWidth(), ch / (float) b.getHeight());
                float dw = b.getWidth() * sc, dh = b.getHeight() * sc;
                p.setAlpha(alpha);
                c.drawBitmap(b, null, new android.graphics.RectF((cw - dw) / 2, (ch - dh) / 2, (cw + dw) / 2, (ch + dh) / 2), p);
            }

            private void draw() {
                if (vgl != null) return;
                android.view.SurfaceHolder s = getSurfaceHolder();
                Canvas c = null;
                try {
                    c = s.lockCanvas();
                    if (c == null) return;
                    c.drawColor(0xff101418);
                    if (bm == null) {
                        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG); t.setColor(0xffcfd6e0); t.setTextAlign(Paint.Align.CENTER);
                        t.setTextSize(c.getWidth() / 22f);
                        c.drawText("Toile : choisis un dossier d'images", c.getWidth() / 2f, c.getHeight() / 2f, t);
                        return;
                    }
                    if (old != null) {
                        float k = Math.min(1f, (android.os.SystemClock.uptimeMillis() - fadeAt) / 450f);
                        drawImg(c, old, 255); drawImg(c, bm, Math.round(255 * k));
                    } else drawImg(c, bm, 255);
                } catch (Throwable t) {
                } finally { if (c != null) try { s.unlockCanvasAndPost(c); } catch (Throwable t) { } }
            }

            @Override public android.os.Bundle onCommand(String action, int x, int y, int z, android.os.Bundle extras, boolean res) {
                if (WallpaperManager.COMMAND_TAP.equals(action)) { gotCommand = true; tap(x, y); }
                return null;
            }

            @Override public void onTouchEvent(android.view.MotionEvent e) {
                if (gotCommand) return;
                if (e.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) { dx0 = e.getX(); dy0 = e.getY(); }
                else if (e.getActionMasked() == android.view.MotionEvent.ACTION_UP && e.getEventTime() - e.getDownTime() < 300
                        && Math.hypot(e.getX() - dx0, e.getY() - dy0) < 24 * getResources().getDisplayMetrics().density) tap(e.getX(), e.getY());
            }

            private void tap(float x, float y) {
                long t = android.os.SystemClock.uptimeMillis();
                float tol = 60 * getResources().getDisplayMetrics().density;
                if (t - lastTap < 450 && Math.hypot(x - lx, y - ly) < tol) { lastTap = 0; next(); }
                else { lastTap = t; lx = x; ly = y; }
            }

            private void next() {
                if (changing) return;
                changing = true;
                final Context ctx = getApplicationContext();
                new Thread(new Runnable() { public void run() {
                    String err = null;
                    try { change(ctx); } catch (Throwable t) { err = t.getMessage(); }
                    final String m = err;
                    h.post(new Runnable() { public void run() {
                        changing = false;
                        if (m != null) try { android.widget.Toast.makeText(ctx, "Toile : " + m, android.widget.Toast.LENGTH_SHORT).show(); } catch (Throwable t) { }
                    } });
                } }).start();
            }
        }
    }
}
