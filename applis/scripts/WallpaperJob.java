package __PKG__;

// Toile : fonds d'écran automatiques, recadrés pour ne garder que l'image.
//  - lecture d'un dossier choisi par l'utilisateur (sous-dossiers compris)
//  - retrait des bordures unies, des bandeaux de texte en bord, rognage des bords
//  - adaptation au format de l'écran : recadrage intelligent, centré, ou image entière sur fond flou
//  - changement automatique (JobScheduler, survit au redémarrage), précédent, aperçu
//  - « Images en ligne » (ToileBridge.java) : les images récupérées rejoignent la rotation, avec les mêmes traitements

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
        Res r = process(c, u, false);
        try {
            WallpaperManager.getInstance(c).setBitmap(r.out, null, true, flags);
            // Miniature pour la tuile « Fond d'écran » de Socle
            if ((flags & WallpaperManager.FLAG_SYSTEM) != 0) {
                try {
                    Bitmap th = Bitmap.createScaledBitmap(r.out, 180, Math.max(1, Math.round(180f * r.out.getHeight() / r.out.getWidth())), true);
                    prefs(c).edit().putString("thumb", jpeg(th)).putString("thumbName", name(c, u)).apply();
                    th.recycle();
                } catch (Throwable t) { }
            }
        }
        finally { r.out.recycle(); }
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
        Res r = process(c, u, true);
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
            before.recycle(); after.recycle();
            return o.toString();
        } finally { r.src.recycle(); r.out.recycle(); }
    }

    private static String jpeg(Bitmap b) {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 85, bo);
        return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
    }

    // ---------- Traitement de l'image ----------
    static class Res { Bitmap src, out; Rect keep; String info = ""; }

    static int[] screen(Context c) {
        DisplayMetrics dm = new DisplayMetrics();
        Display d = c.getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
        d.getRealMetrics(dm);
        return new int[]{ Math.min(dm.widthPixels, dm.heightPixels), Math.max(dm.widthPixels, dm.heightPixels) };
    }

    static Res process(Context c, Uri u, boolean keepSrc) throws Exception {
        int[] s = screen(c);
        int sw = s[0], sh = s[1];
        JSONObject o = settings(c);
        Bitmap src = load(c, u, sh);
        Rect full = new Rect(0, 0, src.getWidth(), src.getHeight());
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
        Res res = new Res();
        res.src = src;
        String fit = o.optString("fit", "smart");
        if (autoFit) fit = "width"; // recadrage automatique : seuls bordures, bandeaux, logos et écritures détectés sont retirés, le reste en pleine largeur
        res.keep = new Rect(r);
        res.out = fit(src, r, sw, sh, fit, res);
        if (("blur".equals(fit) || ("width".equals(fit) && r.width() / (float) r.height() > sw / (float) sh)) && !aspectClose(r, sw, sh)) info.add("width".equals(fit) ? "pleine largeur, bandes floues" : "image entière sur fond flou");
        else info.add("ajustée à l'écran " + sw + "×" + sh);
        res.info = String.join(", ", info);
        if (!keepSrc) { src.recycle(); res.src = null; }
        return res;
    }

    static Bitmap load(Context c, Uri u, int target) throws Exception {
        ContentResolver cr = c.getContentResolver();
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        try (InputStream in = cr.openInputStream(u)) { BitmapFactory.decodeStream(in, null, o); }
        if (o.outWidth <= 0 || o.outHeight <= 0) throw new Exception("Image illisible : " + name(c, u));
        int w = o.outWidth, h = o.outHeight, ss = 1;
        while (Math.min(w, h) / (ss * 2) >= target || (long) w * h / ((long) ss * ss) > 16000000L) ss *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = ss;
        d.inPreferredConfig = Bitmap.Config.ARGB_8888;
        d.inMutable = false;
        Bitmap b;
        try (InputStream in = cr.openInputStream(u)) { b = BitmapFactory.decodeStream(in, null, d); }
        if (b == null) throw new Exception("Image illisible : " + name(c, u));
        int rot = 0;
        try (InputStream in = cr.openInputStream(u)) {
            int or = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
            rot = or == 6 ? 90 : or == 3 ? 180 : or == 8 ? 270 : 0;
        } catch (Exception e) { }
        if (rot != 0) {
            Matrix m = new Matrix();
            m.postRotate(rot);
            Bitmap rb = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
            if (rb != b) b.recycle();
            b = rb;
        }
        return b;
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
}
