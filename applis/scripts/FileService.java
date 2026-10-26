package __PKG__;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.MediaScannerConnection;
import android.media.ThumbnailUtils;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import android.webkit.MimeTypeMap;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** Gestionnaire de fichiers : liste, analyse, corbeille, copie, déplacement, applications. */
public class FileService {
    static final String ROOT = Environment.getExternalStorageDirectory().getAbsolutePath();
    static File trashDir() { File d = new File(ROOT, ".Corbeille-Rangement"); if (!d.exists()) { d.mkdirs(); try { new File(d, ".nomedia").createNewFile(); } catch (Exception e) { } } return d; }

    // ---------- Accès ----------
    static boolean hasAll(Context c) {
        if (Build.VERSION.SDK_INT >= 30) return Environment.isExternalStorageManager();
        return c.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    // ---------- Volumes ----------
    static String roots(Context c) {
        JSONArray a = new JSONArray();
        try {
            ArrayList<String> seen = new ArrayList<String>();
            File[] dirs = c.getExternalFilesDirs(null);
            for (int i = 0; i < dirs.length; i++) {
                if (dirs[i] == null) continue;
                String p = dirs[i].getAbsolutePath();
                int k = p.indexOf("/Android/data/");
                if (k > 0) p = p.substring(0, k);
                if (seen.contains(p)) continue;
                seen.add(p);
                StatFs s = new StatFs(p);
                JSONObject o = new JSONObject();
                o.put("path", p); o.put("name", i == 0 ? "Mémoire interne" : "Carte SD");
                o.put("total", s.getTotalBytes()); o.put("free", s.getAvailableBytes());
                a.put(o);
            }
        } catch (Exception e) { }
        return a.toString();
    }

    // ---------- Liste d'un dossier ----------
    static String list(String path) {
        JSONArray a = new JSONArray();
        try {
            File[] fs = new File(path).listFiles();
            if (fs == null) return "null";
            for (File f : fs) {
                JSONObject o = new JSONObject();
                boolean d = f.isDirectory();
                o.put("n", f.getName()); o.put("d", d); o.put("m", f.lastModified());
                if (d) { String[] ch = f.list(); o.put("c", ch == null ? -1 : ch.length); } else o.put("s", f.length());
                a.put(o);
            }
        } catch (Exception e) { }
        return a.toString();
    }

    // ---------- Opérations en arrière-plan ----------
    static final Object LOCK = new Object();
    static String opKind = "", opCur = "", opErr = "";
    static int opDone = 0, opTotal = 0;
    static long opBytes = 0;
    static volatile boolean opRunning = false, opCancel = false;
    static JSONObject opResult = new JSONObject();
    static StringBuilder scanOut = new StringBuilder();

    static String opState() {
        try {
            JSONObject o = new JSONObject();
            synchronized (LOCK) {
                o.put("kind", opKind); o.put("running", opRunning); o.put("done", opDone); o.put("total", opTotal);
                o.put("cur", opCur); o.put("err", opErr); o.put("bytes", opBytes);
                if (!opRunning) o.put("result", opResult);
            }
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
    static String scanChunk(int i) {
        int a = i * 400000;
        if (a >= scanOut.length()) return "";
        return scanOut.substring(a, Math.min(scanOut.length(), a + 400000));
    }

    static boolean start(final Context c, final String kind, final String json, final String dest) {
        if (opRunning) return false;
        opRunning = true; opCancel = false; opKind = kind; opDone = 0; opTotal = 0; opCur = ""; opErr = ""; opBytes = 0; opResult = new JSONObject();
        new Thread(new Runnable() { public void run() {
            final ArrayList<String> touched = new ArrayList<String>();
            try {
                JSONArray items = json == null || json.isEmpty() ? new JSONArray() : new JSONArray(json);
                opTotal = items.length();
                if ("scan".equals(kind)) doScan(items);
                else if ("hash".equals(kind)) doHash(items);
                else if ("apk".equals(kind)) doApk(c, items);
                else if ("trash".equals(kind)) doTrash(items, touched);
                else if ("restore".equals(kind)) doRestore(items, touched);
                else if ("purge".equals(kind)) doPurge(items);
                else if ("zip".equals(kind)) doZip(items, dest, touched);
                else if ("unzip".equals(kind)) doUnzip(items, dest, touched);
                else if ("delete".equals(kind)) { for (int i = 0; i < items.length() && !opCancel; i++) { String p = items.getString(i); opCur = name(p); File f = new File(p); opBytes += size(f); if (!delTree(f)) err("Suppression impossible : " + name(p)); else touched.add(p); opDone++; } }
                else if ("copy".equals(kind) || "move".equals(kind)) {
                    boolean mv = "move".equals(kind);
                    for (int i = 0; i < items.length() && !opCancel; i++) {
                        File src = new File(items.getString(i)); opCur = src.getName();
                        File dst = unique(new File(dest, src.getName()));
                        if (src.getAbsolutePath().equals(dst.getParent()) || dst.getAbsolutePath().startsWith(src.getAbsolutePath() + "/")) { err("Impossible de mettre un dossier dans lui-même"); opDone++; continue; }
                        boolean ok;
                        if (mv && src.renameTo(dst)) ok = true;
                        else { ok = copyTree(src, dst); if (ok && mv) ok = delTree(src); }
                        if (!ok) err("Échec : " + src.getName());
                        touched.add(src.getAbsolutePath()); touched.add(dst.getAbsolutePath());
                        opDone++;
                    }
                }
            } catch (Throwable t) { err(String.valueOf(t.getMessage())); }
            if (!touched.isEmpty()) mediaScan(c, touched);
            synchronized (LOCK) { opRunning = false; }
        } }).start();
        return true;
    }
    static void err(String s) { synchronized (LOCK) { if (opErr.length() < 2000) opErr += (opErr.isEmpty() ? "" : "\n") + s; } }
    static String name(String p) { int k = p.lastIndexOf('/'); return k >= 0 ? p.substring(k + 1) : p; }

    // Analyse complète : une ligne par fichier « F\tchemin\ttaille\tdate », par dossier « D\tchemin\tnombre »
    static void doScan(JSONArray roots) throws Exception {
        scanOut = new StringBuilder(1 << 20);
        String trash = trashDir().getAbsolutePath();
        for (int i = 0; i < roots.length() && !opCancel; i++) walk(new File(roots.getString(i)), trash, 0);
    }
    static void walk(File d, String trash, int depth) {
        if (opCancel || depth > 40) return;
        String dp = d.getAbsolutePath();
        if (dp.equals(trash) || dp.endsWith("/Android/data") || dp.endsWith("/Android/obb")) return;
        File[] fs = d.listFiles();
        if (fs == null) return;
        scanOut.append("D\t").append(dp).append('\t').append(fs.length).append('\n');
        opCur = d.getName();
        for (File f : fs) {
            if (opCancel) return;
            if (f.isDirectory()) walk(f, trash, depth + 1);
            else { scanOut.append("F\t").append(f.getAbsolutePath()).append('\t').append(f.length()).append('\t').append(f.lastModified()).append('\n'); opDone++; opBytes += f.length(); }
        }
    }

    // Empreinte pour repérer les doublons (fichier entier jusqu'à 16 Mo, sinon 4 échantillons)
    static void doHash(JSONArray items) throws Exception {
        JSONObject r = new JSONObject();
        byte[] buf = new byte[65536];
        for (int i = 0; i < items.length() && !opCancel; i++) {
            String p = items.getString(i); opCur = name(p);
            try {
                File f = new File(p); long len = f.length();
                MessageDigest md = MessageDigest.getInstance("MD5");
                if (len <= 16L * 1024 * 1024) {
                    try (InputStream in = new FileInputStream(f)) { int n; while ((n = in.read(buf)) > 0) md.update(buf, 0, n); }
                } else {
                    try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
                        long[] at = {0, len / 3, 2 * len / 3, len - buf.length};
                        for (long a : at) { raf.seek(Math.max(0, a)); int n = raf.read(buf); if (n > 0) md.update(buf, 0, n); }
                    }
                    md.update(String.valueOf(len).getBytes());
                }
                byte[] h = md.digest(); StringBuilder sb = new StringBuilder();
                for (byte b : h) sb.append(String.format("%02x", b));
                r.put(p, sb.toString());
                opBytes += Math.min(len, 16L * 1024 * 1024);
            } catch (Exception e) { }
            opDone++;
        }
        opResult = r;
    }

    // Fichiers d'installation : l'application est-elle déjà installée ?
    static void doApk(Context c, JSONArray items) throws Exception {
        JSONObject r = new JSONObject();
        PackageManager pm = c.getPackageManager();
        for (int i = 0; i < items.length() && !opCancel; i++) {
            String p = items.getString(i); opCur = name(p);
            JSONObject o = new JSONObject();
            try {
                PackageInfo pi = pm.getPackageArchiveInfo(p, 0);
                if (pi != null) {
                    pi.applicationInfo.sourceDir = p; pi.applicationInfo.publicSourceDir = p;
                    o.put("label", String.valueOf(pi.applicationInfo.loadLabel(pm))); o.put("pkg", pi.packageName); o.put("ver", pi.versionName);
                    long vc = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
                    try {
                        PackageInfo inst = pm.getPackageInfo(pi.packageName, 0);
                        long ivc = Build.VERSION.SDK_INT >= 28 ? inst.getLongVersionCode() : inst.versionCode;
                        o.put("installed", true); o.put("instVer", inst.versionName); o.put("older", vc <= ivc);
                    } catch (PackageManager.NameNotFoundException e) { o.put("installed", false); }
                } else o.put("bad", true);
            } catch (Exception e) { o.put("bad", true); }
            r.put(p, o); opDone++;
        }
        opResult = r;
    }

    // ---------- Corbeille ----------
    static File indexFile() { return new File(trashDir(), "index.json"); }
    static JSONArray readIndex() {
        try { File f = indexFile(); if (!f.exists()) return new JSONArray(); byte[] b = new byte[(int) f.length()]; try (FileInputStream in = new FileInputStream(f)) { int o = 0, n; while (o < b.length && (n = in.read(b, o, b.length - o)) > 0) o += n; } return new JSONArray(new String(b, "UTF-8")); }
        catch (Exception e) { return new JSONArray(); }
    }
    static void writeIndex(JSONArray a) { try (FileOutputStream o = new FileOutputStream(indexFile())) { o.write(a.toString().getBytes("UTF-8")); } catch (Exception e) { } }
    static String trashList() {
        JSONArray a = readIndex(), out = new JSONArray();
        File d = trashDir();
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && new File(d, o.optString("id")).exists()) out.put(o); }
        return out.toString();
    }
    static void doTrash(JSONArray items, ArrayList<String> touched) throws Exception {
        JSONArray idx = readIndex(); File d = trashDir();
        for (int i = 0; i < items.length() && !opCancel; i++) {
            String p = items.getString(i); File f = new File(p); opCur = f.getName();
            if (!f.exists()) { opDone++; continue; }
            String id = System.currentTimeMillis() + "_" + i;
            File to = new File(d, id);
            long sz = size(f); boolean dir = f.isDirectory();
            boolean ok = f.renameTo(to);
            if (!ok) { ok = copyTree(f, to) && delTree(f); }   // autre volume (carte SD)
            if (ok) {
                JSONObject o = new JSONObject(); o.put("id", id); o.put("path", p); o.put("size", sz); o.put("dir", dir); o.put("t", System.currentTimeMillis());
                idx.put(o); touched.add(p); opBytes += sz;
            } else err("Impossible de mettre à la corbeille : " + f.getName());
            opDone++;
        }
        writeIndex(idx);
    }
    static void doRestore(JSONArray ids, ArrayList<String> touched) throws Exception {
        JSONArray idx = readIndex(), keep = new JSONArray(); File d = trashDir();
        ArrayList<String> want = new ArrayList<String>(); for (int i = 0; i < ids.length(); i++) want.add(ids.getString(i));
        for (int i = 0; i < idx.length(); i++) {
            JSONObject o = idx.getJSONObject(i);
            if (!want.contains(o.optString("id")) || opCancel) { keep.put(o); continue; }
            File src = new File(d, o.optString("id")), dst = unique(new File(o.optString("path")));
            opCur = dst.getName();
            if (dst.getParentFile() != null) dst.getParentFile().mkdirs();
            boolean ok = src.renameTo(dst) || (copyTree(src, dst) && delTree(src));
            if (ok) touched.add(dst.getAbsolutePath()); else { keep.put(o); err("Restauration impossible : " + dst.getName()); }
            opDone++;
        }
        writeIndex(keep);
    }
    static void doPurge(JSONArray ids) throws Exception {
        JSONArray idx = readIndex(), keep = new JSONArray(); File d = trashDir();
        boolean all = ids.length() == 1 && "*".equals(ids.getString(0));
        long older = ids.length() == 1 && ids.getString(0).startsWith("older:") ? Long.parseLong(ids.getString(0).substring(6)) : 0;
        ArrayList<String> want = new ArrayList<String>(); for (int i = 0; i < ids.length(); i++) want.add(ids.getString(i));
        if (all || older > 0) opTotal = idx.length();
        for (int i = 0; i < idx.length(); i++) {
            JSONObject o = idx.getJSONObject(i);
            boolean go = all || want.contains(o.optString("id")) || (older > 0 && o.optLong("t") < older);
            if (!go || opCancel) { keep.put(o); continue; }
            File f = new File(d, o.optString("id")); opCur = name(o.optString("path"));
            opBytes += o.optLong("size");
            if (!delTree(f) && f.exists()) keep.put(o);
            opDone++;
        }
        writeIndex(keep);
    }

    // ---------- Archives zip ----------
    // Compresser : crée une nouvelle archive (jamais d'écrasement, nom unique), les originaux ne sont pas touchés
    static int countFiles(File f) { if (!f.isDirectory()) return 1; int n = 0; File[] fs = f.listFiles(); if (fs != null) for (File x : fs) n += countFiles(x); return n; }
    static void doZip(JSONArray items, String dest, ArrayList<String> touched) throws Exception {
        File out = unique(new File(dest));
        if (out.getParentFile() != null) out.getParentFile().mkdirs();
        ArrayList<File> srcs = new ArrayList<File>();
        int tot = 0;
        for (int i = 0; i < items.length(); i++) { File f = new File(items.getString(i)); if (f.exists()) { srcs.add(f); tot += countFiles(f); } }
        opTotal = tot;
        boolean ok = false;
        byte[] buf = new byte[262144];
        try (ZipOutputStream zo = new ZipOutputStream(new java.io.BufferedOutputStream(new FileOutputStream(out), 262144))) {
            for (File f : srcs) { if (opCancel) break; zipAdd(zo, f, f.getName(), out, buf); }
            ok = !opCancel;
        } catch (Throwable e) { if (!opCancel) err("Compression impossible : " + e.getMessage()); }
        if (!ok) { out.delete(); if (opCancel) err("Compression arrêtée"); return; }
        JSONObject r = new JSONObject(); r.put("path", out.getAbsolutePath()); opResult = r;
        touched.add(out.getAbsolutePath());
    }
    static void zipAdd(ZipOutputStream zo, File f, String name, File out, byte[] buf) throws Exception {
        if (opCancel) throw new Exception("arrêt");
        if (f.getAbsolutePath().equals(out.getAbsolutePath())) return;
        if (f.isDirectory()) {
            ZipEntry e = new ZipEntry(name + "/"); e.setTime(f.lastModified()); zo.putNextEntry(e); zo.closeEntry();
            File[] fs = f.listFiles();
            if (fs != null) for (File x : fs) zipAdd(zo, x, name + "/" + x.getName(), out, buf);
            return;
        }
        opCur = f.getName();
        ZipEntry e = new ZipEntry(name); e.setTime(f.lastModified()); zo.putNextEntry(e);
        try (InputStream in = new FileInputStream(f)) { int n; while ((n = in.read(buf)) > 0) { if (opCancel) throw new Exception("arrêt"); zo.write(buf, 0, n); opBytes += n; } }
        zo.closeEntry(); opDone++;
    }
    // Décompresser : toujours dans un NOUVEAU dossier (nom unique), protection contre les chemins « ../ »
    static ZipFile openZip(File f) throws Exception {
        try { ZipFile z = new ZipFile(f); Enumeration<? extends ZipEntry> en = z.entries(); while (en.hasMoreElements()) en.nextElement().getName(); return z; }
        catch (IllegalArgumentException e) {
            if (Build.VERSION.SDK_INT >= 24) return new ZipFile(f, java.nio.charset.Charset.forName("IBM437"));
            throw e;
        }
    }
    static void doUnzip(JSONArray items, String dest, ArrayList<String> touched) throws Exception {
        File zf = new File(items.getString(0));
        File outDir = unique(new File(dest));
        ZipFile z;
        try { z = openZip(zf); } catch (Throwable e) { err("Archive illisible : " + zf.getName()); return; }
        try {
            ArrayList<ZipEntry> list = new ArrayList<ZipEntry>();
            Enumeration<? extends ZipEntry> en = z.entries();
            while (en.hasMoreElements()) list.add(en.nextElement());
            opTotal = list.size();
            if (!outDir.mkdirs() && !outDir.isDirectory()) { err("Création du dossier impossible"); return; }
            String base = outDir.getCanonicalPath(), canon = base + File.separator;
            byte[] buf = new byte[262144];
            for (ZipEntry e : list) {
                if (opCancel) break;
                File t = new File(outDir, e.getName());
                String tc = t.getCanonicalPath();
                if (tc.equals(base)) { opDone++; continue; }
                if (!tc.startsWith(canon)) { err("Élément ignoré (chemin non sûr) : " + e.getName()); opDone++; continue; }
                if (e.isDirectory()) { t.mkdirs(); opDone++; continue; }
                if (t.getParentFile() != null) t.getParentFile().mkdirs();
                t = unique(t); opCur = t.getName();
                boolean ok = true;
                try (InputStream in = z.getInputStream(e); OutputStream o = new FileOutputStream(t)) {
                    int n; while ((n = in.read(buf)) > 0) { if (opCancel) { ok = false; break; } o.write(buf, 0, n); opBytes += n; }
                } catch (Throwable x) { ok = false; err("Extraction impossible : " + e.getName()); }
                if (!ok) t.delete(); else if (e.getTime() > 0) t.setLastModified(e.getTime());
                opDone++;
            }
            if (opCancel) { delTreeForce(outDir); err("Décompression arrêtée"); return; }
            JSONObject r = new JSONObject(); r.put("path", outDir.getAbsolutePath()); opResult = r;
            touched.add(outDir.getAbsolutePath());
        } finally { try { z.close(); } catch (Exception e) { } }
    }
    // Supprime le dossier que l'on vient de créer nous-mêmes (même après une annulation)
    static void delTreeForce(File f) {
        if (f.isDirectory()) { File[] fs = f.listFiles(); if (fs != null) for (File x : fs) delTreeForce(x); }
        f.delete();
    }

    // ---------- Outils fichiers ----------
    static long size(File f) { if (!f.isDirectory()) return f.length(); long s = 0; File[] fs = f.listFiles(); if (fs != null) for (File x : fs) s += size(x); return s; }
    static boolean delTree(File f) {
        if (f.isDirectory()) { File[] fs = f.listFiles(); if (fs != null) for (File x : fs) { if (opCancel) return false; delTree(x); } }
        return f.delete() || !f.exists();
    }
    static boolean copyTree(File src, File dst) {
        if (opCancel) return false;
        if (src.isDirectory()) {
            if (!dst.exists() && !dst.mkdirs()) return false;
            File[] fs = src.listFiles(); boolean ok = true;
            if (fs != null) for (File x : fs) ok &= copyTree(x, new File(dst, x.getName()));
            return ok;
        }
        opCur = src.getName();
        byte[] buf = new byte[262144];
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
            int n; while ((n = in.read(buf)) > 0) { if (opCancel) return false; out.write(buf, 0, n); opBytes += n; }
        } catch (Exception e) { return false; }
        dst.setLastModified(src.lastModified());
        return true;
    }
    static File unique(File f) {
        if (!f.exists()) return f;
        String n = f.getName(), base = n, ext = "";
        int k = n.lastIndexOf('.');
        if (k > 0 && !f.isDirectory()) { base = n.substring(0, k); ext = n.substring(k); }
        for (int i = 1; i < 10000; i++) { File g = new File(f.getParentFile(), base + " (" + i + ")" + ext); if (!g.exists()) return g; }
        return f;
    }
    static String rename(Context c, String path, String newName) {
        if (newName == null || newName.trim().isEmpty() || newName.contains("/")) return "Nom invalide";
        File f = new File(path), g = new File(f.getParentFile(), newName.trim());
        if (g.exists()) return "Un élément porte déjà ce nom";
        if (!f.renameTo(g)) return "Renommage impossible";
        ArrayList<String> t = new ArrayList<String>(); t.add(path); t.add(g.getAbsolutePath()); mediaScan(c, t);
        return "";
    }
    static String mkdir(String parent, String name) {
        if (name == null || name.trim().isEmpty() || name.contains("/")) return "Nom invalide";
        File d = new File(parent, name.trim());
        if (d.exists()) return "Ce dossier existe déjà";
        return d.mkdirs() ? "" : "Création impossible";
    }
    static void mediaScan(Context c, List<String> paths) {
        try {
            ArrayList<String> fs = new ArrayList<String>();
            for (String p : paths) { File f = new File(p); if (f.isDirectory()) { File[] ch = f.listFiles(); if (ch != null) for (File x : ch) if (x.isFile() && fs.size() < 500) fs.add(x.getAbsolutePath()); } else fs.add(p); }
            MediaScannerConnection.scanFile(c, fs.toArray(new String[0]), null, null);
        } catch (Exception e) { }
    }
    static String mime(String path) {
        int k = path.lastIndexOf('.');
        String ext = k > 0 ? path.substring(k + 1).toLowerCase() : "";
        if ("apk".equals(ext)) return "application/vnd.android.package-archive";
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m == null ? "*/*" : m;
    }

    // ---------- Miniatures ----------
    static String thumb(Context c, String path, int size) {
        try {
            Bitmap b = null; String n = path.toLowerCase();
            File f = new File(path);
            if (n.endsWith(".apk")) {
                PackageManager pm = c.getPackageManager();
                PackageInfo pi = pm.getPackageArchiveInfo(path, 0);
                if (pi != null) { pi.applicationInfo.sourceDir = path; pi.applicationInfo.publicSourceDir = path; b = drawable(pi.applicationInfo.loadIcon(pm), size); }
            } else if (n.matches(".*\\.(mp4|mkv|mov|3gp|webm|avi|m4v)$")) {
                if (Build.VERSION.SDK_INT >= 29) b = ThumbnailUtils.createVideoThumbnail(f, new Size(size, size), null);
                else b = ThumbnailUtils.createVideoThumbnail(path, MediaStore.Images.Thumbnails.MINI_KIND);
            } else if (n.matches(".*\\.(mp3|m4a|flac|ogg|opus|aac|wav)$") && Build.VERSION.SDK_INT >= 29) {
                b = ThumbnailUtils.createAudioThumbnail(f, new Size(size, size), null);
            } else {
                if (Build.VERSION.SDK_INT >= 29) { try { b = ThumbnailUtils.createImageThumbnail(f, new Size(size, size), null); } catch (Exception e) { b = null; } }
                if (b == null) {
                    BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true; BitmapFactory.decodeFile(path, o);
                    int s = 1; while (o.outWidth / (s * 2) >= size && o.outHeight / (s * 2) >= size) s *= 2;
                    o = new BitmapFactory.Options(); o.inSampleSize = s; b = BitmapFactory.decodeFile(path, o);
                }
            }
            if (b == null) return "";
            if (b.getWidth() > size * 1.5 || b.getHeight() > size * 1.5) { float r = (float) size / Math.min(b.getWidth(), b.getHeight()); b = Bitmap.createScaledBitmap(b, Math.max(1, (int) (b.getWidth() * r)), Math.max(1, (int) (b.getHeight() * r)), true); }
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            boolean png = n.endsWith(".apk") || n.endsWith(".png");
            b.compress(png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, 80, bo);
            return (png ? "data:image/png;base64," : "data:image/jpeg;base64,") + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable e) { return ""; }
    }
    static Bitmap drawable(Drawable d, int size) {
        if (d instanceof BitmapDrawable) return ((BitmapDrawable) d).getBitmap();
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b); d.setBounds(0, 0, size, size); d.draw(cv);
        return b;
    }

    // ---------- Applications ----------
    static String apps(Context c) {
        JSONArray a = new JSONArray();
        PackageManager pm = c.getPackageManager();
        try {
            for (PackageInfo pi : pm.getInstalledPackages(0)) {
                ApplicationInfo ai = pi.applicationInfo;
                if (ai == null) continue;
                boolean sys = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
                if (sys || pi.packageName.equals(c.getPackageName())) continue;
                JSONObject o = new JSONObject();
                o.put("pkg", pi.packageName); o.put("label", String.valueOf(ai.loadLabel(pm))); o.put("ver", pi.versionName);
                long s = new File(ai.sourceDir).length();
                if (Build.VERSION.SDK_INT >= 21 && ai.splitSourceDirs != null) for (String sp : ai.splitSourceDirs) s += new File(sp).length();
                o.put("size", s); o.put("inst", pi.firstInstallTime); o.put("upd", pi.lastUpdateTime);
                o.put("upsys", (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0);
                a.put(o);
            }
        } catch (Exception e) { }
        return a.toString();
    }
    static String appIcon(Context c, String pkg, int size) {
        try {
            Bitmap b = drawable(c.getPackageManager().getApplicationIcon(pkg), size);
            if (b.getWidth() > size * 1.5) b = Bitmap.createScaledBitmap(b, size, size, true);
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); b.compress(Bitmap.CompressFormat.PNG, 90, bo);
            return "data:image/png;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable e) { return ""; }
    }
}
