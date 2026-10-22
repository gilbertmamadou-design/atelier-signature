package __PKG__;

// Sauvegarde : copie automatique des données du téléphone vers un dossier choisi (carte SD, clé USB, stockage, fournisseur de documents).
//  - photos et vidéos (copie incrémentale, rangées par année / mois), musique, documents
//  - contacts (.vcf), agendas (un .ics par agenda), données des applis MAG (canal privé .widget/backup), SMS (facultatif)
//  - JobScheduler persistant (la nuit de préférence), reprise automatique si Android interrompt la tâche
//  - restauration des photos vers DCIM/Restaurés (jamais de suppression sur le téléphone)
// Le pont SauvegardeBridge parle à cette classe par réflexion : il compile même dans les applis qui ne l'embarquent pas.

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.os.PersistableBundle;
import android.os.storage.StorageManager;
import android.os.storage.StorageVolume;
import android.provider.CalendarContract;
import android.provider.ContactsContract;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

public class SauvegardeJob extends JobService {
    public static final int JOB_AUTO = 5790, JOB_NOW = 5791, JOB_RESTORE = 5792;
    static final String ROOT = "Sauvegarde MAG", INDEX = "index-sauvegarde.tsv";
    static final String CH_RUN = "sauvegarde", CH_END = "sauvegarde_fin";
    static final int NOTIF_RUN = 5795, NOTIF_END = 5796;
    public static final String[] MAG = {
        "fr.magformation13.carnet", "fr.magformation13.scan", "fr.magformation13.mesure", "fr.magformation13.photo",
        "fr.magformation13.ondes", "fr.magformation13.toile", "fr.magformation13.socle", "fr.magformation13.suite",
        "fr.magformation13.qhse", "fr.magformation13.chasse", "fr.magformation13.sentiers", "fr.magformation13.vigie",
        "fr.magformation13.petitspas", "fr.magformation13.reveil", "fr.magformation13.musique", "fr.magformation13.fichiers",
        "fr.magformation13.ciel", "fr.magformation13.pdf", "fr.magformation13.echafaudage", "fr.magformation13.lecteur" };

    static final Object LOCK = new Object();
    static volatile boolean running = false;
    static volatile int runningId = 0;
    static volatile boolean userCancel = false;
    static volatile boolean sysStop = false;
    /** Progression en cours (JSON), lue par le pont. Vide quand rien ne tourne. */
    public static volatile String prog = "";

    // ======================================================================
    // JobService
    // ======================================================================
    @Override
    public boolean onStartJob(final JobParameters p) {
        final Context c = getApplicationContext();
        final int id = p.getJobId();
        final PersistableBundle ex = p.getExtras();
        new Thread(new Runnable() { public void run() {
            synchronized (LOCK) {
            running = true; runningId = id; sysStop = false;
            if (id == JOB_AUTO) userCancel = false;
            try {
                if (id == JOB_RESTORE) new Engine(c, "restore").restore(ex == null ? "" : ex.getString("months", ""));
                else new Engine(c, id == JOB_AUTO ? "auto" : "manuel").backup();
            } catch (Throwable t) { }
            finally {
                boolean stopped = sysStop && !userCancel;
                running = false;
                if (stopped && id != JOB_AUTO) {
                    try { prog = new JSONObject(prog.isEmpty() ? "{}" : prog).put("run", true).put("paused", true).put("phase", "Pause imposée par Android, reprise automatique…").toString(); } catch (Exception e) { prog = ""; }
                } else prog = "";
                runningId = 0;
                // Fin de tâche d'abord : replanifier le même identifiant pendant qu'il tourne l'arrêterait.
                if (!stopped) try { jobFinished(p, false); } catch (Throwable t) { }
                if (!stopped) { try { schedule(c); } catch (Throwable t) { } }
            }
            }
        } }, "sauvegarde").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters p) {
        // Android reprend la main (temps écoulé, conditions perdues) : on s'arrête proprement et la tâche reprendra plus tard,
        // sans recopier ce qui est déjà fait (index incrémental).
        sysStop = true;
        return !userCancel;
    }

    // ======================================================================
    // Réglages, planification, état (appelés par le pont)
    // ======================================================================
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("sauvegarde", Context.MODE_PRIVATE); }

    public static JSONObject settings(Context c) {
        JSONObject o;
        try { o = new JSONObject(prefs(c).getString("settings", "{}")); } catch (Exception e) { o = new JSONObject(); }
        def(o, "photos", true); def(o, "videos", true); def(o, "photosAll", false);
        def(o, "music", false); def(o, "docs", false);
        def(o, "contacts", true); def(o, "calendars", true); def(o, "apps", true); def(o, "sms", false);
        def(o, "auto", true); def(o, "freq", "day"); def(o, "hour", 2);
        def(o, "charging", true); def(o, "wifi", false); def(o, "battery", true);
        def(o, "snapshots", 30);
        return o;
    }
    private static void def(JSONObject o, String k, Object v) { if (!o.has(k)) try { o.put(k, v); } catch (Exception e) { } }

    public static String getSettings(Context c) { return settings(c).toString(); }

    public static void saveSettings(Context c, String json) {
        try {
            JSONObject in = new JSONObject(json), cur = settings(c);
            java.util.Iterator<String> it = in.keys();
            while (it.hasNext()) { String k = it.next(); cur.put(k, in.get(k)); }
            prefs(c).edit().putString("settings", cur.toString()).apply();
        } catch (Exception e) { return; }
        schedule(c);
    }

    public static void setDest(Context c, String tree) {
        prefs(c).edit().putString("dest", tree).apply();
        schedule(c);
    }

    public static String dest(Context c) { return prefs(c).getString("dest", ""); }

    /** Prochaine sauvegarde automatique : à l'heure choisie (la nuit), un jour ou une semaine après la dernière réussie. */
    public static long nextTime(Context c) {
        JSONObject s = settings(c);
        long period = "week".equals(s.optString("freq")) ? 7 * 86400000L : 86400000L;
        long lastOk = prefs(c).getLong("lastOk", 0), now = System.currentTimeMillis();
        long base = lastOk == 0 ? now : Math.max(now, lastOk + period - 3 * 3600000L);
        Calendar k = Calendar.getInstance();
        k.setTimeInMillis(base);
        k.set(Calendar.HOUR_OF_DAY, Math.max(0, Math.min(23, s.optInt("hour", 2))));
        k.set(Calendar.MINUTE, 0); k.set(Calendar.SECOND, 0); k.set(Calendar.MILLISECOND, 0);
        while (k.getTimeInMillis() < base) k.add(Calendar.DAY_OF_MONTH, 1);
        return k.getTimeInMillis();
    }

    public static void schedule(Context c) {
        // Sauvegarde automatique en cours : on ne la coupe pas, elle se replanifie en finissant.
        if (running && runningId == JOB_AUTO) return;
        JobScheduler js = c.getSystemService(JobScheduler.class);
        JSONObject s = settings(c);
        if (!s.optBoolean("auto") || dest(c).isEmpty()) { js.cancel(JOB_AUTO); prefs(c).edit().putLong("next", 0).apply(); return; }
        long at = nextTime(c), delay = Math.max(0, at - System.currentTimeMillis());
        JobInfo.Builder b = new JobInfo.Builder(JOB_AUTO, new ComponentName(c, SauvegardeJob.class))
            .setPersisted(true)
            .setMinimumLatency(delay)
            // Filet de sécurité : si les conditions ne sont jamais réunies (jamais en charge), on sauvegarde quand même 36 h plus tard
            .setOverrideDeadline(delay + 36 * 3600000L)
            .setRequiresCharging(s.optBoolean("charging"))
            .setBackoffCriteria(15 * 60000L, JobInfo.BACKOFF_POLICY_LINEAR);
        if (s.optBoolean("wifi")) b.setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED);
        if (Build.VERSION.SDK_INT >= 26 && s.optBoolean("battery", true)) b.setRequiresBatteryNotLow(true);
        js.schedule(b.build());
        prefs(c).edit().putLong("next", at).apply();
    }

    /** Sauvegarde immédiate. Renvoie "" si lancée, sinon le message d'erreur. */
    public static String start(Context c) {
        if (dest(c).isEmpty()) return "Choisis d'abord où sauvegarder";
        if (running) return "Une sauvegarde est déjà en cours";
        userCancel = false;
        JobScheduler js = c.getSystemService(JobScheduler.class);
        int r = js.schedule(new JobInfo.Builder(JOB_NOW, new ComponentName(c, SauvegardeJob.class))
            .setOverrideDeadline(0).setBackoffCriteria(10000L, JobInfo.BACKOFF_POLICY_LINEAR).build());
        if (r != JobScheduler.RESULT_SUCCESS) return "Android refuse de lancer la sauvegarde";
        prog = initialProg("manuel");
        return "";
    }

    public static String startRestore(Context c, String months) {
        if (dest(c).isEmpty()) return "Aucune destination choisie";
        if (running) return "Attends la fin de la sauvegarde en cours";
        userCancel = false;
        PersistableBundle ex = new PersistableBundle();
        ex.putString("months", months == null ? "" : months);
        JobScheduler js = c.getSystemService(JobScheduler.class);
        int r = js.schedule(new JobInfo.Builder(JOB_RESTORE, new ComponentName(c, SauvegardeJob.class))
            .setOverrideDeadline(0).setExtras(ex).build());
        if (r != JobScheduler.RESULT_SUCCESS) return "Android refuse de lancer la restauration";
        prog = initialProg("restore");
        return "";
    }

    private static String initialProg(String mode) {
        try { return new JSONObject().put("run", true).put("mode", mode).put("phase", "Préparation…").put("start", System.currentTimeMillis()).put("steps", new JSONArray()).toString(); }
        catch (Exception e) { return ""; }
    }

    public static void cancel(Context c) {
        userCancel = true;
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (!running) { js.cancel(JOB_NOW); js.cancel(JOB_RESTORE); prog = ""; prefs(c).edit().remove("carry").apply(); }
    }

    public static String progress() { return prog == null ? "" : prog; }
    public static boolean isRunning() { return running || !progress().isEmpty(); }

    // ---------- Dossiers source supplémentaires (Documents, sous-dossiers de Download, chantiers…) ----------
    public static String folders(Context c) {
        JSONArray out = new JSONArray();
        try {
            JSONArray a = new JSONArray(prefs(c).getString("folders", "[]"));
            for (int i = 0; i < a.length(); i++) {
                String u = a.getString(i);
                out.put(new JSONObject().put("uri", u).put("name", treeName(u)).put("ok", present(c, Uri.parse(u))));
            }
        } catch (Exception e) { }
        return out.toString();
    }
    public static void addFolder(Context c, String uri) {
        try {
            JSONArray a = new JSONArray(prefs(c).getString("folders", "[]"));
            for (int i = 0; i < a.length(); i++) if (a.getString(i).equals(uri)) return;
            a.put(uri);
            prefs(c).edit().putString("folders", a.toString()).apply();
        } catch (Exception e) { }
    }
    public static void removeFolder(Context c, String uri) {
        try {
            JSONArray a = new JSONArray(prefs(c).getString("folders", "[]")), n = new JSONArray();
            for (int i = 0; i < a.length(); i++) if (!a.getString(i).equals(uri)) n.put(a.getString(i));
            prefs(c).edit().putString("folders", n.toString()).apply();
            if (!uri.equals(dest(c))) try { c.getContentResolver().releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception e) { }
        } catch (Exception e) { }
    }
    static String treeName(String tree) {
        try {
            String id = DocumentsContract.getTreeDocumentId(Uri.parse(tree));
            int i = id.indexOf(':');
            String path = i >= 0 ? id.substring(i + 1) : id;
            if (path.isEmpty()) return "primary".equals(i >= 0 ? id.substring(0, i) : "") ? "Mémoire du téléphone" : "Racine";
            return path;
        } catch (Exception e) { return "Dossier"; }
    }

    public static String history(Context c) { return prefs(c).getString("history", "[]"); }

    static void addHistory(Context c, JSONObject h) {
        try {
            JSONArray a = new JSONArray(history(c)), n = new JSONArray();
            n.put(h);
            for (int i = 0; i < a.length() && n.length() < 80; i++) n.put(a.get(i));
            prefs(c).edit().putString("history", n.toString()).apply();
        } catch (Exception e) { }
    }

    public static String state(Context c) {
        try {
            SharedPreferences p = prefs(c);
            JSONObject o = new JSONObject();
            String d = dest(c);
            o.put("dest", d.isEmpty() ? JSONObject.NULL : destInfo(c, d));
            o.put("settings", settings(c));
            o.put("running", isRunning());
            o.put("next", settings(c).optBoolean("auto") && !d.isEmpty() ? p.getLong("next", 0) : 0);
            o.put("lastOk", p.getLong("lastOk", 0));
            JSONArray h = new JSONArray(history(c));
            o.put("last", h.length() > 0 ? h.get(0) : JSONObject.NULL);
            o.put("planned", c.getSystemService(JobScheduler.class).getPendingJob(JOB_AUTO) != null);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }

    /** Nom lisible, type (Carte SD, Clé USB…), dossier, espace libre et présence de la destination. */
    public static JSONObject destInfo(Context c, String tree) {
        JSONObject o = new JSONObject();
        try {
            Uri t = Uri.parse(tree);
            String auth = t.getAuthority(), id = DocumentsContract.getTreeDocumentId(t);
            int i = id.indexOf(':');
            String vol = i >= 0 ? id.substring(0, i) : "", path = i >= 0 ? id.substring(i + 1) : id;
            String kind = "other", label = "Dossier choisi";
            if ("com.android.externalstorage.documents".equals(auth)) {
                if ("primary".equals(vol)) { kind = "phone"; label = "Mémoire du téléphone"; }
                else {
                    kind = "sd"; label = "Carte SD";
                    if (Build.VERSION.SDK_INT >= 24) {
                        try {
                            for (StorageVolume v : c.getSystemService(StorageManager.class).getStorageVolumes()) {
                                if (vol.equalsIgnoreCase(v.getUuid())) {
                                    String desc = String.valueOf(v.getDescription(c));
                                    if (desc.toUpperCase(Locale.ROOT).contains("USB")) { kind = "usb"; label = "Clé USB"; }
                                    o.put("desc", desc);
                                }
                            }
                        } catch (Exception e) { }
                    }
                }
            } else {
                kind = "cloud";
                label = rootTitle(c, auth);
            }
            o.put("uri", tree); o.put("kind", kind); o.put("label", label); o.put("path", path);
            long[] sp = space(c, t, vol);
            o.put("free", sp[0]); o.put("total", sp[1]);
            boolean perm = false;
            for (UriPermission up : c.getContentResolver().getPersistedUriPermissions())
                if (up.getUri().equals(t) && up.isWritePermission()) perm = true;
            o.put("perm", perm);
            o.put("present", present(c, t));
        } catch (Exception e) { try { o.put("label", "Dossier choisi").put("kind", "other").put("present", false); } catch (Exception e2) { } }
        return o;
    }

    private static String rootTitle(Context c, String auth) {
        try (Cursor cur = c.getContentResolver().query(DocumentsContract.buildRootsUri(auth), null, null, null, null)) {
            if (cur != null && cur.moveToFirst()) {
                int k = cur.getColumnIndex(DocumentsContract.Root.COLUMN_TITLE);
                if (k >= 0 && !cur.isNull(k)) return cur.getString(k);
            }
        } catch (Exception e) { }
        return "Dossier choisi";
    }

    static boolean present(Context c, Uri tree) {
        try (Cursor cur = c.getContentResolver().query(DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)),
                new String[]{ DocumentsContract.Document.COLUMN_DOCUMENT_ID }, null, null, null)) {
            return cur != null && cur.moveToFirst();
        } catch (Exception e) { return false; }
    }

    /** {libre, total} en octets, -1 si inconnu. */
    static long[] space(Context c, Uri tree, String vol) {
        long[] r = { -1, -1 };
        try (Cursor cur = c.getContentResolver().query(DocumentsContract.buildRootsUri(tree.getAuthority()), null, null, null, null)) {
            while (cur != null && cur.moveToNext()) {
                int kd = cur.getColumnIndex(DocumentsContract.Root.COLUMN_DOCUMENT_ID), ka = cur.getColumnIndex(DocumentsContract.Root.COLUMN_AVAILABLE_BYTES);
                int kc = cur.getColumnIndex("capacity_bytes"), kr = cur.getColumnIndex(DocumentsContract.Root.COLUMN_ROOT_ID);
                String did = kd >= 0 ? cur.getString(kd) : null, rid = kr >= 0 ? cur.getString(kr) : null;
                boolean match = cur.getCount() == 1 || (did != null && !vol.isEmpty() && did.startsWith(vol + ":")) || vol.equals(rid);
                if (!match) continue;
                if (ka >= 0 && !cur.isNull(ka)) r[0] = cur.getLong(ka);
                if (kc >= 0 && !cur.isNull(kc)) r[1] = cur.getLong(kc);
                break;
            }
        } catch (Exception e) { }
        // Repli : statvfs du volume réel (cartes SD et clés USB)
        if (r[0] < 0 || r[1] < 0) {
            try {
                File f = null;
                if ("primary".equals(vol)) f = Environment.getExternalStorageDirectory();
                else if (!vol.isEmpty()) f = new File("/storage/" + vol);
                if (f != null && f.exists()) {
                    android.os.StatFs st = new android.os.StatFs(f.getPath());
                    if (r[0] < 0) r[0] = st.getAvailableBytes();
                    if (r[1] < 0) r[1] = st.getTotalBytes();
                }
            } catch (Exception e) { }
        }
        return r;
    }

    /** Applis MAG présentes et taille de leurs données déposées sur le canal privé. */
    public static String appsScan(Context c) {
        JSONArray a = new JSONArray();
        PackageManager pm = c.getPackageManager();
        for (String pkg : MAG) {
            try {
                JSONObject o = new JSONObject().put("pkg", pkg);
                String label = null;
                try { label = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0))); } catch (Exception e) { }
                o.put("installed", label != null);
                o.put("label", label != null ? label : shortName(pkg));
                if (label != null) {
                    String j = readMag(c, pkg);
                    o.put("has", j != null && !j.isEmpty());
                    o.put("size", j == null ? 0 : j.length());
                    if (j != null && !j.isEmpty()) { try { o.put("at", new JSONObject(j).optLong("at")); } catch (Exception e) { } }
                    if (j == null) o.put("err", true);
                }
                a.put(o);
            } catch (Exception e) { }
        }
        return a.toString();
    }

    static String shortName(String pkg) { String s = pkg.substring(pkg.lastIndexOf('.') + 1); return s.substring(0, 1).toUpperCase(Locale.ROOT) + s.substring(1); }

    /** "" si l'appli n'a rien déposé, null si inaccessible. */
    static String readMag(Context c, String pkg) {
        try (Cursor cur = c.getContentResolver().query(Uri.parse("content://" + pkg + ".widget/backup"), new String[]{ "json" }, null, null, null)) {
            if (cur != null && cur.moveToFirst()) { String s = cur.getString(0); return s == null ? "" : s; }
            return null;
        } catch (Throwable t) { return null; }
    }

    // ---------- Liste des fichiers restaurables ----------
    public static String restoreList(Context c, String snap) {
        JSONObject o = new JSONObject();
        try {
            String d = dest(c);
            if (d.isEmpty()) return o.put("err", "Aucune destination choisie").toString();
            Dest ds = new Dest(c, Uri.parse(d));
            String root = ds.find(ds.top, ROOT);
            if (root == null) return o.put("err", "Aucune sauvegarde dans ce dossier pour l'instant").toString();
            String base = root;
            if (snap != null && !snap.isEmpty()) { String h = ds.find(root, "Historique"); base = h == null ? null : ds.find(h, snap); }
            o.put("snap", snap == null ? "" : snap);
            o.put("contacts", files(ds, base, "Contacts", ".vcf"));
            o.put("calendars", files(ds, base, "Agendas", ".ics"));
            o.put("apps", files(ds, base, "applis", ".json"));
            o.put("sms", files(ds, base, "SMS", ".xml"));
            JSONArray snaps = new JSONArray();
            String h = ds.find(root, "Historique");
            if (h != null) {
                List<String> names = new ArrayList<>();
                for (String[] e : ds.list(h)) if (ds.isDir(e)) names.add(e[1]);
                Collections.sort(names, Collections.reverseOrder());
                for (String n : names) snaps.put(n);
            }
            o.put("snaps", snaps);
            JSONArray months = new JSONArray();
            String ph = ds.find(root, "Photos");
            if (ph != null) {
                List<String[]> years = new ArrayList<>(ds.list(ph));
                Collections.sort(years, (x, y) -> y[1].compareTo(x[1]));
                for (String[] y : years) {
                    if (!ds.isDir(y)) continue;
                    List<String[]> ms = new ArrayList<>(ds.list(y[0]));
                    Collections.sort(ms, (x, z) -> z[1].compareTo(x[1]));
                    for (String[] m : ms) {
                        if (!ds.isDir(m)) continue;
                        long n = 0, size = 0;
                        for (String[] f : ds.list(m[0])) if (!ds.isDir(f)) { n++; size += parseLong(f[3]); }
                        months.put(new JSONObject().put("m", m[1]).put("n", n).put("size", size));
                    }
                }
            }
            o.put("months", months);
        } catch (Exception e) { try { o.put("err", "Lecture de la sauvegarde impossible : " + msg(e)); } catch (Exception e2) { } }
        return o.toString();
    }

    private static JSONArray files(Dest ds, String base, String dir, String ext) throws Exception {
        JSONArray a = new JSONArray();
        if (base == null) return a;
        String d = ds.find(base, dir);
        if (d == null) return a;
        for (String[] f : ds.list(d)) {
            if (ds.isDir(f) || !f[1].toLowerCase(Locale.ROOT).endsWith(ext)) continue;
            a.put(new JSONObject().put("name", f[1]).put("uri", ds.uri(f[0]).toString()).put("size", parseLong(f[3])).put("date", parseLong(f[4])).put("mime", f[2]));
        }
        return a;
    }

    static long parseLong(String s) { try { return Long.parseLong(s); } catch (Exception e) { return 0; } }

    static String msg(Throwable t) {
        if (t instanceof SecurityException) return "accès refusé";
        String m = t.getMessage();
        return m == null || m.isEmpty() ? t.getClass().getSimpleName() : m;
    }

    // ======================================================================
    // Accès à la destination (Storage Access Framework)
    // ======================================================================
    static class Dest {
        final Context c; final ContentResolver cr; final Uri tree; final String top;
        // Cache : dossier → (nom → {docId, nom, mime, taille, date})
        final Map<String, Map<String, String[]>> cache = new HashMap<>();
        Dest(Context c, Uri tree) { this.c = c; this.cr = c.getContentResolver(); this.tree = tree; this.top = DocumentsContract.getTreeDocumentId(tree); }

        Uri uri(String docId) { return DocumentsContract.buildDocumentUriUsingTree(tree, docId); }
        boolean isDir(String[] e) { return DocumentsContract.Document.MIME_TYPE_DIR.equals(e[2]); }

        Map<String, String[]> map(String dir) {
            Map<String, String[]> m = cache.get(dir);
            if (m != null) return m;
            m = new LinkedHashMap<>();
            String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED };
            try (Cursor cur = cr.query(DocumentsContract.buildChildDocumentsUriUsingTree(tree, dir), cols, null, null, null)) {
                while (cur != null && cur.moveToNext()) {
                    String n = cur.getString(1);
                    if (n == null) continue;
                    m.put(n, new String[]{ cur.getString(0), n, cur.getString(2), cur.isNull(3) ? "0" : String.valueOf(cur.getLong(3)), cur.isNull(4) ? "0" : String.valueOf(cur.getLong(4)) });
                }
            }
            cache.put(dir, m);
            return m;
        }
        List<String[]> list(String dir) { return new ArrayList<>(map(dir).values()); }
        String find(String dir, String name) { String[] e = map(dir).get(name); return e == null ? null : e[0]; }
        String[] entry(String dir, String name) { return map(dir).get(name); }

        String mkdir(String parent, String name) throws Exception {
            String[] e = map(parent).get(name);
            if (e != null && isDir(e)) return e[0];
            Uri u = DocumentsContract.createDocument(cr, uri(parent), DocumentsContract.Document.MIME_TYPE_DIR, name);
            if (u == null) throw new Exception("Création du dossier « " + name + " » impossible");
            String id = DocumentsContract.getDocumentId(u);
            String real = displayName(u, name);
            map(parent).put(real, new String[]{ id, real, DocumentsContract.Document.MIME_TYPE_DIR, "0", "0" });
            cache.put(id, new LinkedHashMap<>());
            return id;
        }
        String mkdirs(String parent, String path) throws Exception {
            String cur = parent;
            for (String p : path.split("/")) if (!p.isEmpty()) cur = mkdir(cur, p);
            return cur;
        }
        String displayName(Uri u, String def) {
            try (Cursor cur = cr.query(u, new String[]{ DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                if (cur != null && cur.moveToFirst() && cur.getString(0) != null) return cur.getString(0);
            } catch (Exception e) { }
            return def;
        }
        /** Crée un nouveau fichier (nom rendu unique par nous, pas par le fournisseur). Renvoie {docId, nom réel}. */
        String[] create(String dir, String name, String mime) throws Exception {
            Map<String, String[]> m = map(dir);
            String n = name;
            if (m.containsKey(n)) {
                int dot = name.lastIndexOf('.');
                String b = dot > 0 ? name.substring(0, dot) : name, x = dot > 0 ? name.substring(dot) : "";
                for (int i = 2; m.containsKey(n); i++) n = b + " (" + i + ")" + x;
            }
            Uri u = DocumentsContract.createDocument(cr, uri(dir), mime == null || mime.isEmpty() ? "application/octet-stream" : mime, n);
            if (u == null) throw new Exception("Création de « " + n + " » impossible");
            String id = DocumentsContract.getDocumentId(u);
            String real = displayName(u, n);
            m.put(real, new String[]{ id, real, mime, "0", String.valueOf(System.currentTimeMillis()) });
            return new String[]{ id, real };
        }
        void setSize(String dir, String name, long size) { String[] e = map(dir).get(name); if (e != null) e[3] = String.valueOf(size); }
        void delete(String dir, String name) {
            String[] e = map(dir).get(name);
            if (e == null) return;
            try { DocumentsContract.deleteDocument(cr, uri(e[0])); } catch (Exception x) { }
            map(dir).remove(name);
        }
        /** Ouvre en écriture un fichier qu'on remplace entièrement (le crée s'il n'existe pas). */
        OutputStream replace(String dir, String name, String mime) throws Exception {
            String[] e = map(dir).get(name);
            if (e != null && !isDir(e)) {
                try { OutputStream o = cr.openOutputStream(uri(e[0]), "wt"); if (o != null) return o; } catch (Exception x) { }
                delete(dir, name);
            }
            String[] n = create(dir, name, mime);
            OutputStream o = cr.openOutputStream(uri(n[0]), "w");
            if (o == null) throw new Exception("Écriture impossible : " + name);
            return o;
        }
        InputStream open(String docId) throws Exception {
            InputStream in = cr.openInputStream(uri(docId));
            if (in == null) throw new Exception("Lecture impossible");
            return in;
        }
    }

    // ======================================================================
    // Moteur : sauvegarde et restauration
    // ======================================================================
    static class Item {
        String key, name, dir, mime; long size, mod, taken; Uri src; File file;
    }

    static class Engine {
        final Context c; final ContentResolver cr; final String mode; final SharedPreferences p;
        final JSONObject s;
        final long t0 = System.currentTimeMillis();
        long t0c = 0, bytesCarry = 0;
        Dest ds; String root;
        // Index incrémental : clé → {taille, date, date de prise, chemin}
        final Map<String, String[]> index = new LinkedHashMap<>();
        boolean indexDirty = false; long indexSaved = 0;
        final List<String> errs = new ArrayList<>();
        int errCount = 0;
        long files = 0, already = 0, bytes = 0, total = 0, totalBytes = 0, cpStart = 0, lastUi = 0, lastNotif = 0;
        double speed = 0; long spT = 0, spB = 0;
        String phase = "", file = "";
        final JSONArray steps = new JSONArray();
        final JSONObject parts = new JSONObject();
        final String day = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new java.util.Date());
        String snapDir = null;

        Engine(Context c, String mode) { this.c = c; this.cr = c.getContentResolver(); this.mode = mode; this.p = prefs(c); this.s = settings(c); }

        boolean stop() { return userCancel || sysStop; }
        boolean can(String perm) { return c.checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED; }

        void err(String m) { errCount++; if (errs.size() < 20) errs.add(m); }

        // ---------- Étapes et progression ----------
        void step(String k, String label) {
            try { steps.put(new JSONObject().put("k", k).put("label", label).put("state", "wait").put("info", "")); } catch (Exception e) { }
        }
        void stepState(String k, String st, String info) {
            try {
                for (int i = 0; i < steps.length(); i++) {
                    JSONObject o = steps.getJSONObject(i);
                    if (o.getString("k").equals(k)) { o.put("state", st); if (info != null) o.put("info", info); if ("run".equals(st)) phase = o.getString("label"); }
                }
            } catch (Exception e) { }
            publish(true);
        }

        void publish(boolean force) {
            long now = System.currentTimeMillis();
            if (!force && now - lastUi < 300) return;
            lastUi = now;
            if (cpStart > 0 && now - spT >= 1000) {
                double inst = (bytes - spB) * 1000.0 / Math.max(1, now - spT);
                speed = speed == 0 ? inst : speed * 0.7 + inst * 0.3;
                spT = now; spB = bytes;
            }
            try {
                JSONObject o = new JSONObject();
                o.put("run", true).put("mode", mode).put("phase", phase).put("file", file)
                 .put("files", files).put("already", already).put("total", total)
                 .put("bytes", bytes).put("totalBytes", totalBytes).put("speed", (long) speed)
                 .put("start", t0).put("errors", errCount).put("steps", steps).put("cancel", userCancel);
                prog = o.toString();
            } catch (Exception e) { }
            if (force || now - lastNotif > 1500) { lastNotif = now; notifRun(); }
        }

        // ---------- Notifications ----------
        void channels() {
            if (Build.VERSION.SDK_INT < 26) return;
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            NotificationChannel a = new NotificationChannel(CH_RUN, "Sauvegarde en cours", NotificationManager.IMPORTANCE_LOW);
            a.setDescription("Progression de la copie");
            a.setShowBadge(false);
            nm.createNotificationChannel(a);
            NotificationChannel b = new NotificationChannel(CH_END, "Résultat des sauvegardes", NotificationManager.IMPORTANCE_DEFAULT);
            b.setDescription("Sauvegarde terminée, ou problème à régler (carte absente, plus de place)");
            nm.createNotificationChannel(b);
        }
        boolean notifOk() { return Build.VERSION.SDK_INT < 33 || can(Manifest.permission.POST_NOTIFICATIONS); }
        @SuppressWarnings("deprecation")
        Notification.Builder nb(String ch) {
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c);
            b.setSmallIcon(c.getApplicationInfo().icon);
            Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (i != null) b.setContentIntent(PendingIntent.getActivity(c, 5797, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            return b;
        }
        void notifRun() {
            if (!notifOk()) return;
            try {
                Notification.Builder b = nb(CH_RUN).setOngoing(true).setOnlyAlertOnce(true)
                    .setContentTitle("restore".equals(mode) ? "Restauration des photos" : "Sauvegarde en cours")
                    .setContentText(phase + (total > 0 ? " · " + (files + already) + " / " + (total + already) : "") + (totalBytes > 0 ? " · " + human(bytes) + " / " + human(totalBytes) : ""));
                if (totalBytes > 0) b.setProgress(1000, (int) Math.min(1000, bytes * 1000 / Math.max(1, totalBytes)), false);
                else b.setProgress(0, 0, true);
                c.getSystemService(NotificationManager.class).notify(NOTIF_RUN, b.build());
            } catch (Exception e) { }
        }
        void notifEnd(String title, String text) {
            try { c.getSystemService(NotificationManager.class).cancel(NOTIF_RUN); } catch (Exception e) { }
            if (!notifOk()) return;
            try {
                c.getSystemService(NotificationManager.class).notify(NOTIF_END, nb(CH_END).setAutoCancel(true)
                    .setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).build());
            } catch (Exception e) { }
        }

        // ---------- Sauvegarde ----------
        void backup() {
            channels();
            try {
                JSONObject cy = new JSONObject(p.getString("carry", "{}"));
                if (cy.has("t0") && System.currentTimeMillis() - cy.getLong("t0") < 86400000L) {
                    t0c = cy.getLong("t0"); files = cy.optLong("files"); bytesCarry = cy.optLong("bytes"); errCount = cy.optInt("errors");
                }
            } catch (Exception e) { }
            p.edit().remove("carry").apply();
            String d = dest(c);
            boolean ok = false, cancelled = false;
            String fatal = null;
            boolean any = hasFolders() || s.optBoolean("contacts") || s.optBoolean("calendars") || s.optBoolean("apps") || s.optBoolean("sms")
                || s.optBoolean("photos") || s.optBoolean("videos") || s.optBoolean("music") || s.optBoolean("docs");
            if (s.optBoolean("contacts")) step("contacts", "Contacts");
            if (s.optBoolean("calendars")) step("calendars", "Agendas");
            if (s.optBoolean("apps")) step("apps", "Données des applis MAG");
            if (s.optBoolean("sms")) step("sms", "SMS");
            if (s.optBoolean("photos") || s.optBoolean("videos")) step("photos", s.optBoolean("videos") ? (s.optBoolean("photos") ? "Photos et vidéos" : "Vidéos") : "Photos");
            if (s.optBoolean("music")) step("music", "Musique");
            if (s.optBoolean("docs")) step("docs", "Documents");
            if (hasFolders()) step("folders", "Dossiers choisis");
            phase = "Préparation…";
            publish(true);
            try {
                if (d.isEmpty()) throw new Exception("Aucune destination choisie");
                if (!any) throw new Exception("Rien à sauvegarder : coche au moins un type de données");
                Uri tree = Uri.parse(d);
                if (!present(c, tree)) {
                    JSONObject di = destInfo(c, d);
                    String k = di.optString("kind");
                    throw new Exception("usb".equals(k) ? "Clé USB absente : branche-la puis relance" : "sd".equals(k) ? "Carte SD absente ou illisible" : "Destination inaccessible : choisis-la de nouveau");
                }
                ds = new Dest(c, tree);
                root = ds.mkdir(ds.top, ROOT);
                readme();
                loadIndex();
                if (s.optBoolean("contacts") && !stop()) run("contacts", this::contacts);
                if (s.optBoolean("calendars") && !stop()) run("calendars", this::calendars);
                if (s.optBoolean("apps") && !stop()) run("apps", this::apps);
                if (s.optBoolean("sms") && !stop()) run("sms", this::sms);
                if (!stop()) media();
                saveIndex(true);
                if (snapDir != null) purgeSnapshots();
                cancelled = stop();
                ok = !cancelled && errCount == 0;
            } catch (Throwable t) {
                fatal = msg(t);
                if (t instanceof SecurityException) fatal = "Accès à la destination perdu : choisis-la de nouveau";
                err(fatal);
                try { saveIndex(true); } catch (Throwable t2) { }
            }
            cancelled = cancelled || stop();
            if (sysStop && !userCancel) {
                // Interrompue par Android : pas d'entrée d'historique, elle reprendra toute seule là où elle en était.
                try { p.edit().putString("carry", new JSONObject().put("t0", t0c > 0 ? t0c : t0).put("files", files).put("bytes", bytes + bytesCarry).put("errors", errCount).toString()).apply(); } catch (Exception e) { }
                try { c.getSystemService(NotificationManager.class).cancel(NOTIF_RUN); } catch (Exception e) { }
                return;
            }
            long end = System.currentTimeMillis();
            long start = t0c > 0 ? t0c : t0;
            bytes += bytesCarry;
            JSONObject h = new JSONObject();
            try {
                JSONObject di = d.isEmpty() ? new JSONObject() : destInfo(c, d);
                h.put("start", start).put("end", end).put("dur", end - start).put("mode", mode)
                 .put("ok", ok).put("cancelled", cancelled && userCancel).put("fatal", fatal == null ? "" : fatal)
                 .put("files", files).put("already", already).put("size", bytes)
                 .put("errors", errCount).put("errs", new JSONArray(errs)).put("parts", parts)
                 .put("dest", di.optString("label", "")).put("free", di.optLong("free", -1));
            } catch (Exception e) { }
            addHistory(c, h);
            if (ok || (fatal == null && !cancelled)) p.edit().putLong("lastOk", end).apply();
            publishTile(ok || (fatal == null && !cancelled), end);
            String sum = files + " fichier" + (files > 1 ? "s" : "") + " copié" + (files > 1 ? "s" : "") + " (" + human(bytes) + ")" + (already > 0 ? ", " + already + " déjà à jour" : "");
            if (cancelled && userCancel) notifEnd("Sauvegarde annulée", sum + ". Ce qui est copié est gardé.");
            else if (fatal != null) notifEnd("Sauvegarde impossible", fatal);
            else if (errCount > 0) notifEnd("Sauvegarde terminée avec " + errCount + " erreur" + (errCount > 1 ? "s" : ""), sum + ". " + (errs.isEmpty() ? "" : errs.get(0)));
            else notifEnd("Sauvegarde terminée", sum + " en " + dur(end - start) + ".");
        }

        interface Part { void go() throws Exception; }
        void run(String k, Part part) {
            stepState(k, "run", null);
            try { part.go(); if (!stop()) stepState(k, "ok", null); }
            catch (Throwable t) { err(labelOf(k) + " : " + msg(t)); stepState(k, "err", msg(t)); }
        }
        String labelOf(String k) {
            try { for (int i = 0; i < steps.length(); i++) if (steps.getJSONObject(i).getString("k").equals(k)) return steps.getJSONObject(i).getString("label"); } catch (Exception e) { }
            return k;
        }

        void readme() {
            try {
                if (ds.find(root, "LISEZMOI.txt") != null) return;
                try (Writer w = new OutputStreamWriter(ds.replace(root, "LISEZMOI.txt", "text/plain"), StandardCharsets.UTF_8)) {
                    w.write("Sauvegarde MAG\r\n==============\r\n\r\n"
                        + "Photos/AAAA/AAAA-MM : photos et vidéos, rangées par mois de prise de vue.\r\n"
                        + "Musique, Documents : copies de la musique et des documents (Download, Documents).\r\n"
                        + "Contacts/contacts.vcf : tous les contacts. Ouvre-le avec l'appli Contacts pour les réimporter.\r\n"
                        + "Agendas : un fichier .ics par agenda. Ouvre-le avec l'appli Agenda pour réimporter les rendez-vous.\r\n"
                        + "applis : données des applis MAG (texte JSON lisible).\r\n"
                        + "SMS/sms.xml : messages (format compatible « SMS Backup & Restore »).\r\n"
                        + "Historique/AAAA-MM-JJ : copies datées des contacts, agendas, applis et SMS.\r\n"
                        + INDEX + " : liste de ce qui est déjà copié (ne pas supprimer, sinon tout est recopié).\r\n\r\n"
                        + "Rien n'est jamais effacé sur le téléphone.\r\n");
                }
            } catch (Exception e) { }
        }

        // ---------- Index incrémental ----------
        void loadIndex() {
            String[] e = ds.entry(root, INDEX);
            if (e == null) return;
            try (BufferedReader r = new BufferedReader(new InputStreamReader(ds.open(e[0]), StandardCharsets.UTF_8))) {
                String l;
                while ((l = r.readLine()) != null) {
                    String[] f = l.split("\t", -1);
                    if (f.length >= 5) index.put(f[0], new String[]{ f[1], f[2], f[3], f[4] });
                }
            } catch (Exception x) { err("Index illisible : tout sera vérifié de nouveau"); }
        }
        void saveIndex(boolean force) {
            if (!indexDirty || ds == null) return;
            long now = System.currentTimeMillis();
            if (!force && now - indexSaved < 20000) return;
            try (Writer w = new OutputStreamWriter(ds.replace(root, INDEX, "text/tab-separated-values"), StandardCharsets.UTF_8)) {
                StringBuilder sb = new StringBuilder(64 * 1024);
                for (Map.Entry<String, String[]> m : index.entrySet()) {
                    String[] v = m.getValue();
                    sb.append(m.getKey()).append('\t').append(v[0]).append('\t').append(v[1]).append('\t').append(v[2]).append('\t').append(v[3]).append('\n');
                    if (sb.length() > 60000) { w.write(sb.toString()); sb.setLength(0); }
                }
                w.write(sb.toString());
                indexDirty = false; indexSaved = now;
            } catch (Exception x) { err("Index non enregistré : " + msg(x)); }
        }

        // ---------- Petits fichiers : version courante + copie datée ----------
        interface Body { void write(OutputStream o) throws Exception; }
        void small(String dir, String name, String mime, Body body) throws Exception {
            if (snapDir == null) snapDir = ds.mkdirs(root, "Historique/" + day);
            String sd = ds.mkdir(snapDir, dir);
            try (OutputStream o = ds.replace(sd, name, mime)) { body.write(o); }
            String cd = ds.mkdir(root, dir);
            String[] e = ds.entry(sd, name);
            try (InputStream in = ds.open(e[0]); OutputStream o = ds.replace(cd, name, mime)) { copy(in, o, false); }
        }
        void purgeSnapshots() {
            // Ne touche qu'aux copies datées dans « Sauvegarde MAG/Historique » sur la destination, jamais au téléphone.
            try {
                int keep = Math.max(5, s.optInt("snapshots", 30));
                String h = ds.find(root, "Historique");
                if (h == null) return;
                List<String> names = new ArrayList<>();
                for (String[] e : ds.list(h)) if (ds.isDir(e) && e[1].matches("\\d{4}-\\d{2}-\\d{2}")) names.add(e[1]);
                Collections.sort(names);
                for (int i = 0; i < names.size() - keep; i++) ds.delete(h, names.get(i));
            } catch (Exception e) { }
        }

        // ---------- Contacts ----------
        void contacts() throws Exception {
            if (!can(Manifest.permission.READ_CONTACTS)) throw new Exception("autorisation Contacts non accordée");
            final List<String> keys = new ArrayList<>();
            try (Cursor cur = cr.query(ContactsContract.Contacts.CONTENT_URI, new String[]{ ContactsContract.Contacts.LOOKUP_KEY }, null, null, null)) {
                while (cur != null && cur.moveToNext()) { String k = cur.getString(0); if (k != null && !k.isEmpty()) keys.add(k); }
            }
            if (keys.isEmpty()) { stepState("contacts", "ok", "aucun contact"); put("contacts", 0); return; }
            file = "contacts.vcf";
            final int[] ko = { 0 };
            small("Contacts", "contacts.vcf", "text/x-vcard", o -> {
                for (int i = 0; i < keys.size(); i += 100) {
                    if (stop()) break;
                    List<String> part = keys.subList(i, Math.min(keys.size(), i + 100));
                    try { vcards(TextUtilsJoin(":", part), o); }
                    catch (Exception e) { for (String k : part) { try { vcard(k, o); } catch (Exception e2) { ko[0]++; } } }
                }
            });
            put("contacts", keys.size() - ko[0]);
            if (ko[0] > 0) err(ko[0] + " contact(s) non exporté(s)");
            stepState("contacts", "ok", (keys.size() - ko[0]) + " contact" + (keys.size() > 1 ? "s" : ""));
        }
        void vcards(String joined, OutputStream o) throws Exception {
            Uri u = Uri.withAppendedPath(ContactsContract.Contacts.CONTENT_MULTI_VCARD_URI, Uri.encode(joined));
            try (InputStream in = cr.openAssetFileDescriptor(u, "r").createInputStream()) { copy(in, o, false); }
        }
        void vcard(String key, OutputStream o) throws Exception {
            Uri u = Uri.withAppendedPath(ContactsContract.Contacts.CONTENT_VCARD_URI, key);
            try (InputStream in = cr.openAssetFileDescriptor(u, "r").createInputStream()) { copy(in, o, false); }
        }

        // ---------- Agendas ----------
        void calendars() throws Exception {
            if (!can(Manifest.permission.READ_CALENDAR)) throw new Exception("autorisation Agenda non accordée");
            List<long[]> ids = new ArrayList<>();
            List<String> names = new ArrayList<>();
            try (Cursor cur = cr.query(CalendarContract.Calendars.CONTENT_URI, new String[]{ CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CalendarContract.Calendars.ACCOUNT_NAME }, null, null, null)) {
                while (cur != null && cur.moveToNext()) {
                    ids.add(new long[]{ cur.getLong(0) });
                    String n = cur.getString(1), a = cur.getString(2);
                    if (n == null || n.isEmpty()) n = a == null ? "Agenda" : a;
                    if (a != null && !a.isEmpty() && !a.equals(n) && a.contains("@")) n = n + " (" + a + ")";
                    names.add(n);
                }
            }
            Set<String> used = new HashSet<>();
            int evs = 0;
            for (int i = 0; i < ids.size() && !stop(); i++) {
                final long cid = ids.get(i)[0];
                final String cname = names.get(i);
                String fn = safe(cname);
                String f = fn; for (int k = 2; used.contains(f.toLowerCase(Locale.ROOT)); k++) f = fn + " " + k;
                used.add(f.toLowerCase(Locale.ROOT));
                file = f + ".ics";
                final int[] n = { 0 };
                small("Agendas", f + ".ics", "text/calendar", o -> n[0] = ics(cid, cname, o));
                evs += n[0];
            }
            put("calendars", ids.size()); put("events", evs);
            stepState("calendars", "ok", ids.size() + " agenda" + (ids.size() > 1 ? "s" : "") + ", " + evs + " événement" + (evs > 1 ? "s" : ""));
        }

        int ics(long cid, String cname, OutputStream os) throws Exception {
            Writer w = new OutputStreamWriter(os, StandardCharsets.UTF_8);
            w.write("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MAG Formation 13//Sauvegarde//FR\r\nCALSCALE:GREGORIAN\r\n");
            line(w, "X-WR-CALNAME:" + esc(cname));
            String[] cols = { CalendarContract.Events._ID, CalendarContract.Events.TITLE, CalendarContract.Events.DESCRIPTION, CalendarContract.Events.EVENT_LOCATION,
                CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND, CalendarContract.Events.DURATION, CalendarContract.Events.ALL_DAY,
                CalendarContract.Events.RRULE, CalendarContract.Events.RDATE, CalendarContract.Events.EXRULE, CalendarContract.Events.EXDATE,
                CalendarContract.Events.EVENT_TIMEZONE, CalendarContract.Events.ORIGINAL_ID, CalendarContract.Events.ORIGINAL_INSTANCE_TIME,
                CalendarContract.Events.STATUS, CalendarContract.Events.ORIGINAL_ALL_DAY, "uid2445" };
            // Identifiants stables (UID) : celui de l'agenda s'il existe, sinon fabriqué à partir de l'identifiant interne
            Map<Long, String> uids = new HashMap<>();
            List<Object[]> rows = new ArrayList<>();
            Cursor cur;
            try { cur = cr.query(CalendarContract.Events.CONTENT_URI, cols, CalendarContract.Events.CALENDAR_ID + "=? AND " + CalendarContract.Events.DELETED + "=0", new String[]{ String.valueOf(cid) }, null); }
            catch (Exception e) {
                cols = Arrays.copyOf(cols, cols.length - 1);
                cur = cr.query(CalendarContract.Events.CONTENT_URI, cols, CalendarContract.Events.CALENDAR_ID + "=? AND " + CalendarContract.Events.DELETED + "=0", new String[]{ String.valueOf(cid) }, null);
            }
            try {
                while (cur != null && cur.moveToNext()) {
                    Object[] r = new Object[cols.length];
                    for (int i = 0; i < cols.length; i++) r[i] = cur.isNull(i) ? null : cur.getString(i);
                    rows.add(r);
                    long id = cur.getLong(0);
                    String u = cols.length > 17 && r[17] != null && !((String) r[17]).isEmpty() ? (String) r[17] : "mag-" + cid + "-" + id + "@sauvegarde";
                    uids.put(id, u);
                }
            } finally { if (cur != null) cur.close(); }
            // Rappels, par lots d'identifiants d'événements
            Map<Long, List<int[]>> rem = new HashMap<>();
            List<Long> evIds = new ArrayList<>(uids.keySet());
            for (int i = 0; i < evIds.size(); i += 400) {
                List<Long> part = evIds.subList(i, Math.min(evIds.size(), i + 400));
                StringBuilder in = new StringBuilder();
                for (Long l : part) { if (in.length() > 0) in.append(','); in.append(l); }
                try (Cursor rc = cr.query(CalendarContract.Reminders.CONTENT_URI, new String[]{ CalendarContract.Reminders.EVENT_ID, CalendarContract.Reminders.MINUTES, CalendarContract.Reminders.METHOD },
                        CalendarContract.Reminders.EVENT_ID + " IN (" + in + ")", null, null)) {
                    while (rc != null && rc.moveToNext()) {
                        List<int[]> l = rem.get(rc.getLong(0));
                        if (l == null) { l = new ArrayList<>(); rem.put(rc.getLong(0), l); }
                        l.add(new int[]{ rc.getInt(1), rc.getInt(2) });
                    }
                } catch (Exception e) { }
            }
            SimpleDateFormat utc = new SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.ROOT); utc.setTimeZone(TimeZone.getTimeZone("UTC"));
            SimpleDateFormat dd = new SimpleDateFormat("yyyyMMdd", Locale.ROOT); dd.setTimeZone(TimeZone.getTimeZone("UTC"));
            String stamp = utc.format(new java.util.Date());
            int n = 0;
            for (Object[] r : rows) {
                long id = Long.parseLong((String) r[0]);
                boolean all = "1".equals(r[7]);
                long st = parseLong((String) r[4]);
                String ou = r[13] != null ? uids.get(parseLong((String) r[13])) : null;
                w.write("BEGIN:VEVENT\r\n");
                line(w, "UID:" + (ou != null ? ou : uids.get(id)));
                w.write("DTSTAMP:" + stamp + "\r\n");
                if (all) w.write("DTSTART;VALUE=DATE:" + dd.format(new java.util.Date(st)) + "\r\n");
                else w.write("DTSTART:" + utc.format(new java.util.Date(st)) + "\r\n");
                if (r[5] != null && r[8] == null) {
                    long en = parseLong((String) r[5]);
                    if (all) w.write("DTEND;VALUE=DATE:" + dd.format(new java.util.Date(Math.max(en, st + 86400000L))) + "\r\n");
                    else w.write("DTEND:" + utc.format(new java.util.Date(Math.max(en, st))) + "\r\n");
                } else if (r[6] != null) w.write("DURATION:" + r[6] + "\r\n");
                if (r[1] != null) line(w, "SUMMARY:" + esc((String) r[1]));
                if (r[2] != null && !((String) r[2]).isEmpty()) line(w, "DESCRIPTION:" + esc((String) r[2]));
                if (r[3] != null && !((String) r[3]).isEmpty()) line(w, "LOCATION:" + esc((String) r[3]));
                if (r[8] != null) line(w, "RRULE:" + r[8]);
                if (r[9] != null) line(w, "RDATE:" + r[9]);
                if (r[10] != null) line(w, "EXRULE:" + r[10]);
                if (r[11] != null) for (String x : ((String) r[11]).split("[,\n]")) if (!x.trim().isEmpty()) line(w, "EXDATE" + (x.trim().length() == 8 ? ";VALUE=DATE:" : ":") + x.trim());
                if (ou != null && r[14] != null) {
                    long oi = parseLong((String) r[14]);
                    line(w, "RECURRENCE-ID" + ("1".equals(r[16]) ? ";VALUE=DATE:" + dd.format(new java.util.Date(oi)) : ":" + utc.format(new java.util.Date(oi))));
                }
                if ("2".equals(r[15])) w.write("STATUS:CANCELLED\r\n");
                else if ("0".equals(r[15])) w.write("STATUS:TENTATIVE\r\n");
                List<int[]> l = rem.get(id);
                if (l != null) for (int[] a : l) {
                    int min = a[0] < 0 ? 15 : a[0];
                    w.write("BEGIN:VALARM\r\nACTION:" + (a[1] == CalendarContract.Reminders.METHOD_EMAIL ? "EMAIL" : "DISPLAY") + "\r\n");
                    line(w, "DESCRIPTION:" + esc(r[1] == null ? "Rappel" : (String) r[1]));
                    w.write("TRIGGER:-PT" + min + "M\r\nEND:VALARM\r\n");
                }
                w.write("END:VEVENT\r\n");
                n++;
            }
            w.write("END:VCALENDAR\r\n");
            w.flush();
            return n;
        }

        void line(Writer w, String l) throws Exception {
            // Pliage RFC 5545 : 75 octets maximum par ligne
            byte[] b = l.getBytes(StandardCharsets.UTF_8);
            if (b.length <= 75) { w.write(l); w.write("\r\n"); return; }
            int lim = 75; StringBuilder sb = new StringBuilder();
            int bytesInLine = 0;
            for (int k = 0; k < l.length(); ) {
                int cp = l.codePointAt(k), len = new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8).length;
                if (bytesInLine + len > lim) { sb.append("\r\n "); bytesInLine = 1; lim = 75; }
                sb.appendCodePoint(cp); bytesInLine += len; k += Character.charCount(cp);
            }
            w.write(sb.toString()); w.write("\r\n");
        }
        String esc(String s) { return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", ""); }

        // ---------- Applis MAG ----------
        void apps() throws Exception {
            PackageManager pm = c.getPackageManager();
            int saved = 0, empty = 0;
            for (String pkg : MAG) {
                if (stop()) return;
                String label;
                try { label = String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0))); } catch (Exception e) { continue; }
                file = label;
                publish(false);
                String j = readMag(c, pkg);
                if (j == null) { err(label + " : données inaccessibles (appli trop ancienne ou trop de données)"); continue; }
                if (j.isEmpty()) { empty++; continue; }
                String out;
                try {
                    JSONObject o = new JSONObject(j);
                    JSONObject w = new JSONObject();
                    w.put("paquet", pkg).put("appli", label).put("sauvegarde", System.currentTimeMillis()).put("at", o.optLong("at")).put("data", o.opt("data"));
                    out = w.toString(1);
                } catch (Exception e) { out = j; }
                final byte[] bb = out.getBytes(StandardCharsets.UTF_8);
                small("applis", pkg + ".json", "application/json", o -> o.write(bb));
                saved++;
            }
            put("apps", saved);
            stepState("apps", "ok", saved + " appli" + (saved > 1 ? "s" : "") + (empty > 0 ? ", " + empty + " sans données" : ""));
        }

        // ---------- SMS (lecture seule, format « SMS Backup & Restore ») ----------
        void sms() throws Exception {
            if (!can(Manifest.permission.READ_SMS)) throw new Exception("autorisation SMS non accordée");
            final int[] n = { 0 };
            small("SMS", "sms.xml", "text/xml", os -> {
                Writer w = new OutputStreamWriter(os, StandardCharsets.UTF_8);
                String[] cols = { "address", "date", "date_sent", "type", "body", "read", "status", "subject", "service_center", "locked", "protocol" };
                SimpleDateFormat rd = new SimpleDateFormat("d MMM yyyy HH:mm:ss", Locale.FRANCE);
                try (Cursor cur = cr.query(Uri.parse("content://sms"), cols, null, null, "date ASC")) {
                    int count = cur == null ? 0 : cur.getCount();
                    w.write("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n<smses count=\"" + count + "\">\n");
                    while (cur != null && cur.moveToNext() && !stop()) {
                        w.write("  <sms protocol=\"" + x(cur.getString(10), "0") + "\" address=\"" + x(cur.getString(0), "") + "\" date=\"" + x(cur.getString(1), "0")
                            + "\" type=\"" + x(cur.getString(3), "1") + "\" subject=\"" + x(cur.getString(7), "null") + "\" body=\"" + x(cur.getString(4), "")
                            + "\" toa=\"null\" sc_toa=\"null\" service_center=\"" + x(cur.getString(8), "null") + "\" read=\"" + x(cur.getString(5), "1")
                            + "\" status=\"" + x(cur.getString(6), "-1") + "\" locked=\"" + x(cur.getString(9), "0") + "\" date_sent=\"" + x(cur.getString(2), "0")
                            + "\" readable_date=\"" + x(rd.format(new java.util.Date(cur.getLong(1))), "") + "\" contact_name=\"(Unknown)\" />\n");
                        n[0]++;
                    }
                }
                w.write("</smses>\n");
                w.flush();
            });
            put("sms", n[0]);
            stepState("sms", "ok", n[0] + " message" + (n[0] > 1 ? "s" : ""));
        }
        String x(String v, String def) {
            if (v == null) return def;
            StringBuilder b = new StringBuilder(v.length() + 16);
            for (int i = 0; i < v.length(); i++) {
                char ch = v.charAt(i);
                switch (ch) {
                    case '&': b.append("&amp;"); break; case '<': b.append("&lt;"); break; case '>': b.append("&gt;"); break;
                    case '"': b.append("&quot;"); break; case '\'': b.append("&apos;"); break;
                    case '\n': b.append("&#10;"); break; case '\r': b.append("&#13;"); break;
                    default: if (ch < 0x20 && ch != '\t') break; b.append(ch);
                }
            }
            return b.toString();
        }

        // ---------- Médias et documents ----------
        boolean hasFolders() { try { return s.optBoolean("folders", true) && new JSONArray(p.getString("folders", "[]")).length() > 0; } catch (Exception e) { return false; } }

        void media() {
            boolean ph = s.optBoolean("photos"), vi = s.optBoolean("videos"), mu = s.optBoolean("music"), dc = s.optBoolean("docs"), fo = hasFolders();
            if (!ph && !vi && !mu && !dc && !fo) return;
            List<Item> todo = new ArrayList<>();
            Map<String, Integer> cnt = new HashMap<>();
            Map<String, Long> sz = new HashMap<>();
            // 1. Inventaire et comparaison avec l'index
            phase = "Recherche des nouveaux fichiers…"; publish(true);
            String[][] parts = { { "photos", ph || vi ? "1" : "" }, { "music", mu ? "1" : "" }, { "docs", dc ? "1" : "" }, { "folders", fo ? "1" : "" } };
            for (String[] pt : parts) {
                if (pt[1].isEmpty() || stop()) continue;
                List<Item> found = new ArrayList<>();
                try {
                    if (pt[0].equals("photos")) {
                        if (!mediaPerm(true)) throw new Exception("autorisation Photos et vidéos non accordée");
                        if (ph) scan(found, "img", "image");
                        if (vi) scan(found, "vid", "video");
                    } else if (pt[0].equals("music")) {
                        if (!mediaPerm(false)) throw new Exception("autorisation Musique non accordée");
                        scan(found, "aud", "audio");
                    } else if (pt[0].equals("docs")) docs(found);
                    else trees(found);
                } catch (Throwable t) { err(labelOf(pt[0]) + " : " + msg(t)); stepState(pt[0], "err", msg(t)); continue; }
                int k = 0; long b = 0;
                for (Item it : found) {
                    String[] e = index.get(it.key);
                    if (e != null && e[0].equals(String.valueOf(it.size)) && e[1].equals(String.valueOf(it.mod))) { already++; continue; }
                    it.dir = pt[0] + "\u0000" + it.dir;
                    todo.add(it); k++; b += it.size; total++; totalBytes += it.size;
                }
                cnt.put(pt[0], k); sz.put(pt[0], b);
                stepState(pt[0], "wait", k == 0 ? "déjà à jour (" + found.size() + ")" : k + " nouveau" + (k > 1 ? "x" : "") + " · " + human(b));
            }
            // 2. Place disponible
            long free = space(c, ds.tree, volOf(ds.tree))[0];
            if (free >= 0 && totalBytes > free - 50L * 1024 * 1024) err("Pas assez de place sur la destination : il manque " + human(totalBytes - free + 50L * 1024 * 1024) + ". La copie s'arrêtera quand ce sera plein.");
            // 3. Copie
            cpStart = System.currentTimeMillis(); spT = cpStart; spB = 0;
            String curPart = "";
            for (Item it : todo) {
                if (stop()) break;
                String part = it.dir.substring(0, it.dir.indexOf('\u0000'));
                String rel = it.dir.substring(it.dir.indexOf('\u0000') + 1);
                if (!part.equals(curPart)) { if (!curPart.isEmpty()) finishPart(curPart); curPart = part; stepState(part, "run", null); }
                file = it.name;
                publish(false);
                try { copyItem(it, rel); }
                catch (Throwable t) {
                    String m = msg(t);
                    err(it.name + " : " + m);
                    if (m.contains("ENOSPC") || m.toLowerCase(Locale.ROOT).contains("no space")) { err("Destination pleine : copie arrêtée"); break; }
                }
                saveIndex(false);
            }
            if (!curPart.isEmpty()) finishPart(curPart);
            for (String[] pt : parts) if (!pt[1].isEmpty() && !stop() && cnt.containsKey(pt[0]) && cnt.get(pt[0]) == 0) stepState(pt[0], "ok", null);
            try { put("media", (int) files); } catch (Exception e) { }
        }
        void finishPart(String part) { if (!stop()) stepState(part, "ok", null); }

        boolean mediaPerm(boolean visual) {
            if (Build.VERSION.SDK_INT >= 33) {
                if (visual) return can("android.permission.READ_MEDIA_IMAGES") || can("android.permission.READ_MEDIA_VIDEO") || can("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
                return can("android.permission.READ_MEDIA_AUDIO");
            }
            return can(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        List<String> volumes() {
            List<String> v = new ArrayList<>();
            if (Build.VERSION.SDK_INT >= 29) { try { v.addAll(MediaStore.getExternalVolumeNames(c)); } catch (Exception e) { } }
            if (v.isEmpty()) v.add("external");
            return v;
        }

        Uri base(String kind, String vol) {
            switch (kind) {
                case "image": return Build.VERSION.SDK_INT >= 29 ? MediaStore.Images.Media.getContentUri(vol) : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
                case "video": return Build.VERSION.SDK_INT >= 29 ? MediaStore.Video.Media.getContentUri(vol) : MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                case "audio": return Build.VERSION.SDK_INT >= 29 ? MediaStore.Audio.Media.getContentUri(vol) : MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                default: return Build.VERSION.SDK_INT >= 29 ? MediaStore.Files.getContentUri(vol) : MediaStore.Files.getContentUri("external");
            }
        }

        @SuppressWarnings("deprecation")
        void scan(List<Item> out, String pre, String kind) {
            boolean all = s.optBoolean("photosAll");
            boolean q = Build.VERSION.SDK_INT >= 29;
            String destVol = volOf(ds.tree);
            for (String vol : volumes()) {
                boolean audio = "audio".equals(kind);
                String[] cols = { MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED,
                    audio ? MediaStore.MediaColumns.DATE_ADDED : "datetaken", MediaStore.MediaColumns.MIME_TYPE, q ? MediaStore.MediaColumns.RELATIVE_PATH : MediaStore.MediaColumns.DATA,
                    MediaStore.MediaColumns.TITLE, audio ? MediaStore.Audio.AudioColumns.IS_MUSIC : MediaStore.MediaColumns.SIZE };
                Uri b = base(kind, vol);
                try (Cursor cur = cr.query(b, cols, null, null, null)) {
                    while (cur != null && cur.moveToNext()) {
                        if (stop()) return;
                        long size = cur.getLong(2);
                        if (size <= 0) continue;
                        String rel = cur.isNull(6) ? "" : cur.getString(6);
                        if (!q) { // chemin complet → chemin relatif
                            int k = rel.indexOf("/0/"); if (k >= 0) rel = rel.substring(k + 3);
                            int sl = rel.lastIndexOf('/'); rel = sl >= 0 ? rel.substring(0, sl + 1) : "";
                            if (rel.startsWith("/storage/")) { String[] seg = rel.split("/", 4); rel = seg.length > 3 ? seg[3] : ""; }
                        }
                        // Ne jamais resauvegarder la sauvegarde elle-même (destination sur le même volume)
                        if (rel.startsWith(ROOT + "/") || rel.contains("/" + ROOT + "/")) continue;
                        if (!"audio".equals(kind) && !all && !(rel.startsWith("DCIM/") || rel.startsWith("Pictures/"))) continue;
                        if (audio && !"1".equals(cur.getString(8)) && !rel.startsWith("Music/")) continue;
                        Item it = new Item();
                        long id = cur.getLong(0);
                        it.key = pre + ":" + vol + ":" + id;
                        it.name = cur.getString(1) == null ? "fichier-" + id : cur.getString(1);
                        it.size = size;
                        it.mod = cur.getLong(3);
                        it.taken = cur.isNull(4) ? 0 : cur.getLong(4);
                        if ("audio".equals(kind)) it.taken *= 1000;
                        if (it.taken <= 0) it.taken = it.mod * 1000;
                        it.mime = cur.getString(5);
                        it.src = ContentUris.withAppendedId(b, id);
                        if ("audio".equals(kind)) {
                            String r = rel.replaceFirst("^(Music|Musique)/", "");
                            it.dir = "Musique/" + (r.isEmpty() ? "" : r);
                        } else {
                            String ym = new SimpleDateFormat("yyyy/yyyy-MM", Locale.ROOT).format(new java.util.Date(it.taken));
                            it.dir = "Photos/" + ym;
                        }
                        out.add(it);
                    }
                } catch (Exception e) { if (!"external".equals(vol)) continue; throw e; }
            }
        }

        @SuppressWarnings("deprecation")
        void docs(List<Item> out) {
            boolean allFiles = Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager();
            if (allFiles || Build.VERSION.SDK_INT < 29) {
                if (Build.VERSION.SDK_INT < 30 && !can(Manifest.permission.READ_EXTERNAL_STORAGE)) throw new SecurityException("autorisation Fichiers non accordée");
                File ext = Environment.getExternalStorageDirectory();
                for (String d : new String[]{ "Download", "Documents" }) walk(new File(ext, d), d + "/", out, 0);
                return;
            }
            // Sans « accès à tous les fichiers » : Android 11+ ne montre que les documents créés par cette appli et les médias.
            for (String vol : volumes()) {
                String[] cols = { MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.DATE_MODIFIED,
                    MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.RELATIVE_PATH };
                Uri b = MediaStore.Files.getContentUri(vol);
                try (Cursor cur = cr.query(b, cols, MediaStore.MediaColumns.RELATIVE_PATH + " LIKE 'Download/%' OR " + MediaStore.MediaColumns.RELATIVE_PATH + " LIKE 'Documents/%'", null, null)) {
                    while (cur != null && cur.moveToNext()) {
                        if (stop()) return;
                        long size = cur.getLong(2);
                        String mime = cur.getString(4);
                        if (size <= 0 || DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) continue;
                        String rel = cur.getString(5);
                        if (rel == null || rel.contains(ROOT + "/")) continue;
                        Item it = new Item();
                        long id = cur.getLong(0);
                        it.key = "doc:" + vol + ":" + id; it.name = cur.getString(1); it.size = size; it.mod = cur.getLong(3);
                        it.taken = it.mod * 1000; it.mime = mime; it.src = ContentUris.withAppendedId(b, id);
                        if (it.name == null) continue;
                        it.dir = "Documents/" + rel;
                        out.add(it);
                    }
                } catch (Exception e) { if (!"external".equals(vol) && !"external_primary".equals(vol)) continue; throw e; }
            }
        }
        void walk(File d, String rel, List<Item> out, int depth) {
            File[] l = d.listFiles();
            if (l == null || depth > 8) return;
            for (File f : l) {
                if (stop()) return;
                if (f.getName().startsWith(".")) continue;
                if (f.isDirectory()) { if (!f.getName().equals(ROOT)) walk(f, rel + f.getName() + "/", out, depth + 1); continue; }
                if (f.length() <= 0) continue;
                Item it = new Item();
                it.key = "f:" + f.getAbsolutePath(); it.name = f.getName(); it.size = f.length(); it.mod = f.lastModified() / 1000;
                it.taken = f.lastModified(); it.file = f; it.mime = mimeOf(f.getName()); it.dir = "Documents/" + rel;
                out.add(it);
            }
        }

        void trees(List<Item> out) throws Exception {
            JSONArray a = new JSONArray(p.getString("folders", "[]"));
            for (int i = 0; i < a.length() && !stop(); i++) {
                Uri t = Uri.parse(a.getString(i));
                if (!present(c, t)) { err("Dossier inaccessible : " + treeName(t.toString())); continue; }
                String nm = treeName(t.toString());
                nm = nm.substring(nm.lastIndexOf('/') + 1);
                walkTree(t, DocumentsContract.getTreeDocumentId(t), "Dossiers/" + safe(nm) + "/", out, 0);
            }
        }
        void walkTree(Uri tree, String doc, String rel, List<Item> out, int depth) {
            if (depth > 10) return;
            String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE, DocumentsContract.Document.COLUMN_LAST_MODIFIED };
            List<String[]> dirs = new ArrayList<>();
            try (Cursor cur = cr.query(DocumentsContract.buildChildDocumentsUriUsingTree(tree, doc), cols, null, null, null)) {
                while (cur != null && cur.moveToNext()) {
                    if (stop()) return;
                    String id = cur.getString(0), n = cur.getString(1), m = cur.getString(2);
                    if (n == null || n.startsWith(".")) continue;
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(m)) { if (!n.equals(ROOT)) dirs.add(new String[]{ id, n }); continue; }
                    long size = cur.isNull(3) ? 0 : cur.getLong(3);
                    if (size <= 0) continue;
                    Item it = new Item();
                    it.key = "saf:" + id; it.name = n; it.size = size; it.mod = cur.isNull(4) ? 0 : cur.getLong(4) / 1000;
                    it.taken = it.mod * 1000; it.mime = m; it.src = DocumentsContract.buildDocumentUriUsingTree(tree, id); it.dir = rel;
                    out.add(it);
                }
            } catch (Exception e) { err(rel + " : " + msg(e)); }
            for (String[] d : dirs) walkTree(tree, d[0], rel + safe(d[1]) + "/", out, depth + 1);
        }

        void copyItem(Item it, String rel) throws Exception {
            String dir = ds.mkdirs(root, rel);
            String[] ex = ds.entry(dir, it.name);
            // Déjà présent avec la même taille (index perdu, ou copie faite par un autre téléphone) : on le note sans recopier
            if (ex != null && !ds.isDir(ex) && String.valueOf(it.size).equals(ex[3])) {
                index.put(it.key, new String[]{ String.valueOf(it.size), String.valueOf(it.mod), String.valueOf(it.taken), rel + it.name });
                indexDirty = true; already++; total--; totalBytes -= it.size;
                return;
            }
            InputStream in = null;
            if (it.file != null) in = new FileInputStream(it.file);
            else {
                if (Build.VERSION.SDK_INT >= 29 && can("android.permission.ACCESS_MEDIA_LOCATION")) {
                    try { in = cr.openInputStream(MediaStore.setRequireOriginal(it.src)); } catch (Exception e) { in = null; }
                }
                if (in == null) in = cr.openInputStream(it.src);
            }
            if (in == null) throw new Exception("lecture impossible");
            String[] nd = ds.create(dir, it.name, it.mime);
            boolean done = false;
            long before = bytes;
            try (InputStream i2 = in; OutputStream o = cr.openOutputStream(ds.uri(nd[0]), "w")) {
                if (o == null) throw new Exception("écriture impossible");
                copy(i2, o, true);
                done = !stop();
            } finally {
                if (!done) { ds.delete(dir, nd[1]); bytes = before; } // fichier incomplet sur la destination : retiré
            }
            ds.setSize(dir, nd[1], it.size);
            files++;
            index.put(it.key, new String[]{ String.valueOf(it.size), String.valueOf(it.mod), String.valueOf(it.taken), rel + nd[1] });
            indexDirty = true;
        }

        void copy(InputStream in, OutputStream o, boolean count) throws Exception {
            byte[] buf = new byte[256 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                o.write(buf, 0, n);
                if (count) { bytes += n; publish(false); if (stop()) return; }
            }
            o.flush();
        }

        void put(String k, int v) { try { parts.put(k, v); } catch (Exception e) { } }

        void publishTile(boolean ok, long end) {
            try {
                JSONObject di = destInfo(c, dest(c));
                JSONObject o = new JSONObject();
                o.put("last", new JSONObject().put("date", end).put("ok", ok).put("files", files).put("size", bytes).put("errors", errCount));
                o.put("next", settings(c).optBoolean("auto") ? nextTime(c) : 0);
                o.put("dest", di.optString("label", ""));
                Class<?> k = Class.forName(SauvegardeJob.class.getPackage().getName() + ".WidgetProvider");
                k.getDeclaredMethod("put", Context.class, String.class).invoke(null, c, o.toString());
            } catch (Throwable t) { }
        }

        // ---------- Restauration des photos vers DCIM/Restaurés ----------
        void restore(String months) {
            channels();
            List<String> ms = new ArrayList<>();
            for (String m : months.split(",")) if (m.trim().matches("\\d{4}-\\d{2}")) ms.add(m.trim());
            String fatal = null;
            try {
                Uri tree = Uri.parse(dest(c));
                if (!present(c, tree)) throw new Exception("Destination absente : branche la carte ou la clé");
                ds = new Dest(c, tree);
                root = ds.find(ds.top, ROOT);
                String ph = root == null ? null : ds.find(root, "Photos");
                if (ph == null) throw new Exception("Aucune photo dans la sauvegarde");
                List<String[]> todo = new ArrayList<>();
                for (String m : ms) {
                    step(m, m);
                    String y = ds.find(ph, m.substring(0, 4));
                    String md = y == null ? null : ds.find(y, m);
                    if (md == null) continue;
                    for (String[] f : ds.list(md)) if (!ds.isDir(f)) { todo.add(new String[]{ m, f[0], f[1], f[2], f[3] }); total++; totalBytes += parseLong(f[3]); }
                }
                cpStart = System.currentTimeMillis(); spT = cpStart;
                String cur = "";
                for (String[] f : todo) {
                    if (stop()) break;
                    if (!f[0].equals(cur)) { if (!cur.isEmpty()) stepState(cur, "ok", null); cur = f[0]; stepState(cur, "run", null); }
                    file = f[2];
                    publish(false);
                    try { if (!restoreOne(f[0], f[1], f[2], f[3], parseLong(f[4]))) { already++; total--; totalBytes -= parseLong(f[4]); } else files++; }
                    catch (Throwable t) { err(f[2] + " : " + msg(t)); }
                }
                if (!cur.isEmpty() && !stop()) stepState(cur, "ok", null);
            } catch (Throwable t) { fatal = msg(t); err(fatal); }
            if (sysStop && !userCancel) { try { c.getSystemService(NotificationManager.class).cancel(NOTIF_RUN); } catch (Exception e) { } return; }
            long end = System.currentTimeMillis();
            JSONObject h = new JSONObject();
            try {
                h.put("start", t0).put("end", end).put("dur", end - t0).put("mode", "restore").put("ok", fatal == null && errCount == 0 && !stop())
                 .put("cancelled", userCancel).put("fatal", fatal == null ? "" : fatal).put("files", files).put("already", already).put("size", bytes)
                 .put("errors", errCount).put("errs", new JSONArray(errs)).put("parts", new JSONObject().put("months", new JSONArray(ms)));
            } catch (Exception e) { }
            addHistory(c, h);
            if (fatal != null) notifEnd("Restauration impossible", fatal);
            else notifEnd(userCancel ? "Restauration annulée" : "Photos restaurées", files + " fichier" + (files > 1 ? "s" : "") + " copié" + (files > 1 ? "s" : "") + " dans DCIM/Restaurés" + (already > 0 ? ", " + already + " déjà présent" + (already > 1 ? "s" : "") : ""));
        }

        /** false si déjà présent dans DCIM/Restaurés. */
        @SuppressWarnings("deprecation")
        boolean restoreOne(String month, String docId, String name, String mime, long size) throws Exception {
            String relPath = Environment.DIRECTORY_DCIM + "/Restaurés/" + month + "/";
            if (mime == null || mime.isEmpty()) mime = mimeOf(name);
            boolean video = mime.startsWith("video/");
            if (Build.VERSION.SDK_INT >= 29) {
                Uri col = video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                try (Cursor cur = cr.query(col, new String[]{ MediaStore.MediaColumns._ID }, MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?", new String[]{ relPath, name }, null)) {
                    if (cur != null && cur.moveToFirst()) return false;
                }
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, relPath);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                long taken = takenFor(name);
                if (taken > 0) v.put("datetaken", taken);
                Uri u = cr.insert(col, v);
                if (u == null) throw new Exception("ajout à la galerie refusé");
                boolean ok = false;
                try (InputStream in = ds.open(docId); OutputStream o = cr.openOutputStream(u, "w")) {
                    copy(in, o, true);
                    ok = !stop();
                } finally {
                    if (ok) { ContentValues d = new ContentValues(); d.put(MediaStore.MediaColumns.IS_PENDING, 0); cr.update(u, d, null, null); }
                    else { try { cr.delete(u, null, null); } catch (Exception e) { } } // notre propre ajout inachevé, rien d'autre
                }
                return true;
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "Restaurés/" + month);
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("dossier DCIM/Restaurés inaccessible");
                File f = new File(dir, name);
                if (f.exists() && f.length() == size) return false;
                if (f.exists()) { int dot = name.lastIndexOf('.'); for (int i = 2; f.exists(); i++) f = new File(dir, (dot > 0 ? name.substring(0, dot) : name) + " (" + i + ")" + (dot > 0 ? name.substring(dot) : "")); }
                try (InputStream in = ds.open(docId); OutputStream o = new FileOutputStream(f)) { copy(in, o, true); }
                MediaScannerConnection.scanFile(c, new String[]{ f.getAbsolutePath() }, null, null);
                return true;
            }
        }
        Map<String, Long> takenByName = null;
        long takenFor(String name) {
            if (takenByName == null) {
                takenByName = new HashMap<>();
                try {
                    String[] e = ds.entry(root, INDEX);
                    if (e != null) try (BufferedReader r = new BufferedReader(new InputStreamReader(ds.open(e[0]), StandardCharsets.UTF_8))) {
                        String l;
                        while ((l = r.readLine()) != null) {
                            String[] f = l.split("\t", -1);
                            if (f.length >= 5) { String n = f[4].substring(f[4].lastIndexOf('/') + 1); takenByName.put(n, parseLong(f[3])); }
                        }
                    }
                } catch (Exception x) { }
            }
            Long t = takenByName.get(name);
            return t == null ? 0 : t;
        }
    }

    // ======================================================================
    // Outils
    // ======================================================================
    static String volOf(Uri tree) {
        try { String id = DocumentsContract.getTreeDocumentId(tree); int i = id.indexOf(':'); return i >= 0 ? id.substring(0, i) : ""; } catch (Exception e) { return ""; }
    }
    static String TextUtilsJoin(String sep, List<String> l) { StringBuilder b = new StringBuilder(); for (String s : l) { if (b.length() > 0) b.append(sep); b.append(s); } return b.toString(); }
    static String safe(String n) {
        String s = n.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1F]", "_").trim();
        if (s.length() > 80) s = s.substring(0, 80);
        return s.isEmpty() ? "Agenda" : s;
    }
    static String mimeOf(String name) {
        String ext = name.lastIndexOf('.') >= 0 ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        String m = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m == null ? "application/octet-stream" : m;
    }
    static String human(long b) {
        if (b < 1024) return b + " o";
        double v = b; String[] u = { "Ko", "Mo", "Go", "To" }; int i = -1;
        do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
        return String.format(Locale.FRANCE, v >= 100 ? "%.0f %s" : "%.1f %s", v, u[i]);
    }
    static String dur(long ms) {
        long s = ms / 1000;
        if (s < 60) return s + " s";
        if (s < 3600) return (s / 60) + " min " + (s % 60 > 0 ? (s % 60) + " s" : "");
        return (s / 3600) + " h " + ((s % 3600) / 60) + " min";
    }
}
