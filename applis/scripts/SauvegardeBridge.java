package __PKG__;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Sauvegarde : pont entre la page www-sauvegarde et le moteur natif SauvegardeJob.
 * Exposé en JS sous window.MAGSauvegarde. Le constructeur n'a aucun effet de bord : cette classe est chargée dans toutes les applis MAG.
 * SauvegardeJob est appelé par réflexion : le pont compile et se charge même dans une appli qui n'embarque pas le moteur
 * (available() renvoie alors false).
 * Événements asynchrones : window.sauvegardeEvent(type, json).
 *   dest       {ok, dest:{label, kind, path, free, total, present, perm}}     destination choisie
 *   folder     {ok, folders:[…]}                                               dossier source ajouté
 *   perms      {…état des autorisations…}                                      après la demande d'autorisations
 *   apps       [{pkg, label, installed, has, size, at}]                        applis MAG et données déposées
 *   restore    {contacts:[], calendars:[], apps:[], sms:[], months:[], snaps:[]}
 *   file       {ok, name, text}                                                contenu d'un fichier de la sauvegarde
 *   resume     {}                                                              retour dans l'appli
 */
public class SauvegardeBridge {
    private static final int REQ_DEST = 5701, REQ_FOLDER = 5702, REQ_PERM = 5710;
    private final Activity a;
    private final WebView wv;

    public SauvegardeBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // ---------- Outils ----------
    private Context ctx() { return a.getApplicationContext(); }
    private void ui(Runnable r) { a.runOnUiThread(r); }
    private void bg(Runnable r) { new Thread(r, "sauvegarde-pont").start(); }
    private boolean can(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    private void toast(final String t) { ui(() -> Toast.makeText(a, t, Toast.LENGTH_SHORT).show()); }
    private void emit(String type, String json) {
        final String js = "window.sauvegardeEvent&&sauvegardeEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json == null ? "{}" : json) + ")";
        ui(() -> { try { wv.evaluateJavascript(js, null); } catch (Exception e) { } });
    }
    private Class<?> job() {
        try { return Class.forName(SauvegardeBridge.class.getPackage().getName() + ".SauvegardeJob"); } catch (Throwable t) { return null; }
    }
    /** Appel statique SauvegardeJob.m(Context, args…). Renvoie null si le moteur est absent ou en erreur. */
    private Object call(String m, Object... args) {
        Class<?> k = job();
        if (k == null) return null;
        try {
            Class<?>[] types = new Class<?>[args.length + 1];
            Object[] all = new Object[args.length + 1];
            types[0] = Context.class; all[0] = ctx();
            for (int i = 0; i < args.length; i++) { types[i + 1] = args[i] == null ? String.class : args[i].getClass(); all[i + 1] = args[i]; }
            Method me = k.getMethod(m, types);
            return me.invoke(null, all);
        } catch (Throwable t) { return null; }
    }
    private Object call0(String m) {
        Class<?> k = job();
        if (k == null) return null;
        try { return k.getMethod(m).invoke(null); } catch (Throwable t) { return null; }
    }
    private static String str(Object o, String def) { return o == null ? def : String.valueOf(o); }
    private static String err(String m) { try { return new JSONObject().put("ok", false).put("err", m).toString(); } catch (Exception e) { return "{\"ok\":false}"; } }

    // ---------- État et réglages ----------
    @JavascriptInterface public String version() { return "1"; }
    @JavascriptInterface public boolean available() { return job() != null; }
    @JavascriptInterface public String state() { return str(call("state"), "{}"); }
    @JavascriptInterface public String settings() { return str(call("getSettings"), "{}"); }
    /** Fusionne les réglages reçus et replanifie la sauvegarde automatique. */
    @JavascriptInterface public void saveSettings(String json) { call("saveSettings", json == null ? "{}" : json); }
    @JavascriptInterface public String history() { return str(call("history"), "[]"); }
    @JavascriptInterface public void clearHistory() { ctx().getSharedPreferences("sauvegarde", Context.MODE_PRIVATE).edit().putString("history", "[]").apply(); }
    /** Progression de la sauvegarde ou restauration en cours ("" si rien ne tourne). */
    @JavascriptInterface public String progress() { return str(call0("progress"), ""); }
    @JavascriptInterface public boolean running() { Object o = call0("isRunning"); return o instanceof Boolean && (Boolean) o; }

    // ---------- Destination ----------
    @JavascriptInterface public void pickDest() { pickTree(REQ_DEST); }
    @JavascriptInterface public String destInfo() {
        String d = str(call("dest"), "");
        if (d.isEmpty()) return "null";
        Object o = call("destInfo", d);
        return o == null ? "null" : o.toString();
    }
    /** Ouvre la destination dans le gestionnaire de fichiers, quand le fournisseur le permet. */
    @JavascriptInterface public void openDest() {
        final String d = str(call("dest"), "");
        if (d.isEmpty()) { toast("Aucune destination choisie"); return; }
        ui(() -> {
            try {
                Uri t = Uri.parse(d);
                Uri doc = DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(doc, DocumentsContract.Document.MIME_TYPE_DIR);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                a.startActivity(i);
            } catch (Exception e) { toast("Ouvre l'appli Fichiers puis le dossier « Sauvegarde MAG »"); }
        });
    }
    private void pickTree(final int req) {
        ui(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | (req == REQ_DEST ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0));
                a.startActivityForResult(i, req);
            } catch (ActivityNotFoundException e) { toast("Aucun sélecteur de dossier sur ce téléphone"); }
        });
    }

    // ---------- Dossiers source supplémentaires ----------
    @JavascriptInterface public void addFolder() { pickTree(REQ_FOLDER); }
    @JavascriptInterface public String folders() { return str(call("folders"), "[]"); }
    @JavascriptInterface public void removeFolder(String uri) { if (uri != null) call("removeFolder", uri); }

    // ---------- Autorisations ----------
    private boolean mediaOk() {
        if (Build.VERSION.SDK_INT >= 33) return can("android.permission.READ_MEDIA_IMAGES") && can("android.permission.READ_MEDIA_VIDEO");
        return can(Manifest.permission.READ_EXTERNAL_STORAGE);
    }
    private boolean mediaPartial() {
        return Build.VERSION.SDK_INT >= 34 && !mediaOk() && can("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
    }
    /** {contacts, calendar, media, mediaPartial, audio, sms, smsPossible, notif, allFiles, allFilesPossible} */
    @JavascriptInterface public String perms() {
        try {
            JSONObject o = new JSONObject();
            o.put("contacts", can(Manifest.permission.READ_CONTACTS));
            o.put("calendar", can(Manifest.permission.READ_CALENDAR));
            o.put("media", mediaOk());
            o.put("mediaPartial", mediaPartial());
            o.put("audio", Build.VERSION.SDK_INT >= 33 ? can("android.permission.READ_MEDIA_AUDIO") : can(Manifest.permission.READ_EXTERNAL_STORAGE));
            o.put("sms", can(Manifest.permission.READ_SMS));
            o.put("smsPossible", a.getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY) && declared(Manifest.permission.READ_SMS));
            o.put("notif", Build.VERSION.SDK_INT < 33 || can("android.permission.POST_NOTIFICATIONS"));
            o.put("allFiles", Build.VERSION.SDK_INT < 30 ? can(Manifest.permission.READ_EXTERNAL_STORAGE) : Environment.isExternalStorageManager());
            o.put("allFilesPossible", Build.VERSION.SDK_INT >= 30 && declared("android.permission.MANAGE_EXTERNAL_STORAGE"));
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
    private boolean declared(String perm) {
        try {
            String[] r = a.getPackageManager().getPackageInfo(a.getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
            if (r != null) for (String p : r) if (perm.equals(p)) return true;
        } catch (Exception e) { }
        return false;
    }
    /** Demande les autorisations utiles aux types cochés. kinds : liste séparée par des virgules (contacts, calendar, media, audio, sms, notif). */
    @JavascriptInterface public void askPerms(String kinds) {
        final List<String> l = new ArrayList<>();
        String k = "," + (kinds == null ? "" : kinds) + ",";
        if (k.contains(",contacts,")) l.add(Manifest.permission.READ_CONTACTS);
        if (k.contains(",calendar,")) l.add(Manifest.permission.READ_CALENDAR);
        if (k.contains(",media,")) {
            if (Build.VERSION.SDK_INT >= 33) { l.add("android.permission.READ_MEDIA_IMAGES"); l.add("android.permission.READ_MEDIA_VIDEO"); }
            else l.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            if (Build.VERSION.SDK_INT >= 29) l.add("android.permission.ACCESS_MEDIA_LOCATION");
        }
        if (k.contains(",audio,")) l.add(Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_AUDIO" : Manifest.permission.READ_EXTERNAL_STORAGE);
        if (k.contains(",sms,")) l.add(Manifest.permission.READ_SMS);
        if (k.contains(",notif,") && Build.VERSION.SDK_INT >= 33) l.add("android.permission.POST_NOTIFICATIONS");
        List<String> miss = new ArrayList<>();
        for (String p : l) if (!can(p) && !miss.contains(p)) miss.add(p);
        if (miss.isEmpty()) { emit("perms", perms()); return; }
        final String[] arr = miss.toArray(new String[0]);
        ui(() -> a.requestPermissions(arr, REQ_PERM));
    }
    /** Ouvre les réglages : "app" (fiche de l'appli), "files" (accès à tous les fichiers), "battery" (pas d'optimisation), "notif". */
    @JavascriptInterface public void openSettings(final String what) {
        ui(() -> {
            Uri pkg = Uri.parse("package:" + a.getPackageName());
            try {
                if ("files".equals(what) && Build.VERSION.SDK_INT >= 30) a.startActivity(new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, pkg));
                else if ("battery".equals(what)) a.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                else if ("notif".equals(what) && Build.VERSION.SDK_INT >= 26) a.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName()));
                else a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg));
            } catch (Exception e) {
                try { a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)); } catch (Exception e2) { toast("Ouvre Paramètres > Applications"); }
            }
        });
    }

    // ---------- Sauvegarde ----------
    /** Lance une sauvegarde maintenant. Renvoie "" si elle démarre, sinon la raison. */
    @JavascriptInterface public String start() {
        if (job() == null) return "Le moteur de sauvegarde n'est pas installé dans cette appli";
        return str(call("start"), "Lancement impossible");
    }
    @JavascriptInterface public void cancel() { call("cancel"); }

    /** Applis MAG installées et données qu'elles ont déposées (événement « apps »). */
    @JavascriptInterface public void scanApps() { bg(() -> emit("apps", str(call("appsScan"), "[]"))); }

    // ---------- Restauration ----------
    /** Contenu restaurable (événement « restore »). snap : "" pour la dernière, sinon une date AAAA-MM-JJ de l'historique. */
    @JavascriptInterface public void restoreList(final String snap) { bg(() -> emit("restore", str(call("restoreList", snap == null ? "" : snap), err("Moteur absent")))); }
    /** Recopie les photos des mois choisis (« 2025-06,2025-07 ») vers DCIM/Restaurés. Renvoie "" si lancé. */
    @JavascriptInterface public String restorePhotos(String months) {
        if (job() == null) return "Le moteur de sauvegarde n'est pas installé dans cette appli";
        if (Build.VERSION.SDK_INT < 29 && !can("android.permission.WRITE_EXTERNAL_STORAGE")) {
            ui(() -> a.requestPermissions(new String[]{ "android.permission.WRITE_EXTERNAL_STORAGE" }, REQ_PERM + 1));
            return "Autorise d'abord l'écriture dans la galerie, puis relance";
        }
        return str(call("startRestore", months == null ? "" : months), "Lancement impossible");
    }
    /** Ouvre un fichier de la sauvegarde avec l'appli qui sait le lire (.vcf → Contacts, .ics → Agenda). */
    @JavascriptInterface public void openFile(final String uri, final String mime) {
        ui(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                Uri u = Uri.parse(uri);
                i.setDataAndType(u, mime == null || mime.isEmpty() ? "*/*" : mime);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                i.setClipData(ClipData.newRawUri("", u));
                a.startActivity(Intent.createChooser(i, "Ouvrir avec").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
            } catch (Exception e) { toast("Aucune appli ne sait ouvrir ce fichier"); }
        });
    }
    @JavascriptInterface public void shareFile(final String uri, final String mime) {
        ui(() -> {
            try {
                Uri u = Uri.parse(uri);
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_STREAM, u);
                i.setClipData(ClipData.newRawUri("", u));
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                a.startActivity(Intent.createChooser(i, "Envoyer").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
            } catch (Exception e) { toast("Envoi impossible"); }
        });
    }
    /** Lit un fichier texte de la sauvegarde (3 Mo au plus), événement « file ». */
    @JavascriptInterface public void readFile(final String uri) {
        bg(() -> {
            try (InputStream in = a.getContentResolver().openInputStream(Uri.parse(uri))) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] b = new byte[65536]; int n; boolean cut = false;
                while (in != null && (n = in.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > 3 * 1024 * 1024) { cut = true; break; } }
                emit("file", new JSONObject().put("ok", true).put("uri", uri).put("cut", cut).put("text", new String(bo.toByteArray(), StandardCharsets.UTF_8)).toString());
            } catch (Exception e) { emit("file", err("Lecture impossible : " + e.getMessage())); }
        });
    }
    /** Ouvre une appli MAG (pour y réimporter des données). */
    @JavascriptInterface public boolean launch(String pkg) {
        try {
            Intent i = a.getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            a.startActivity(i);
            return true;
        } catch (Exception e) { return false; }
    }

    // ---------- Cycle de vie de l'activité ----------
    public void onResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_DEST && requestCode != REQ_FOLDER) return;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            emit(requestCode == REQ_DEST ? "dest" : "folder", err("cancel"));
            return;
        }
        final Uri u = data.getData();
        int fl = Intent.FLAG_GRANT_READ_URI_PERMISSION | (requestCode == REQ_DEST ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
        try { a.getContentResolver().takePersistableUriPermission(u, fl); }
        catch (Exception e) { emit(requestCode == REQ_DEST ? "dest" : "folder", err("Ce dossier ne peut pas être gardé en mémoire : choisis-en un autre")); return; }
        if (requestCode == REQ_DEST) {
            final String old = str(call("dest"), "");
            call("setDest", u.toString());
            if (!old.isEmpty() && !old.equals(u.toString())) {
                boolean used = false;
                try { JSONArray f = new JSONArray(folders()); for (int i = 0; i < f.length(); i++) if (old.equals(f.getJSONObject(i).optString("uri"))) used = true; } catch (Exception e) { }
                if (!used) try { a.getContentResolver().releasePersistableUriPermission(Uri.parse(old), Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception e) { }
            }
            bg(() -> {
                try { emit("dest", new JSONObject().put("ok", true).put("dest", new JSONObject(destInfo())).toString()); }
                catch (Exception e) { emit("dest", err("Destination illisible")); }
            });
        } else {
            call("addFolder", u.toString());
            try { emit("folder", new JSONObject().put("ok", true).put("folders", new JSONArray(folders())).toString()); } catch (Exception e) { }
        }
    }
    public void onPermissions(int requestCode) {
        if (requestCode == REQ_PERM || requestCode == REQ_PERM + 1) emit("perms", perms());
    }
    public void onResume() { emit("resume", "{}"); }
    public void onIntent(Intent i) { }
}
