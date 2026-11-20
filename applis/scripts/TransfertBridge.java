package __PKG__;

/* Socle : transfert de la Suite vers un autre appareil, et installation / mise à jour de toute la Suite.
   Page : MAGTransfert (Socle seulement ; le constructeur refuse les autres applis).
     apps()                 → applis MAG installées [{pkg, nom, vc}]
     exporter(code)         → fichier chiffré (AES-256-GCM, clé tirée du code par PBKDF2) dans Téléchargements/MAG-Suite,
                              puis partage (Quick Share, e-mail, Drive…) ; etat() suit l'avancée
     importer(texte, code)  → déchiffre et dépose les données de chaque appli installée ; chaque appli les reprend
                              à sa prochaine ouverture (SuiteTransfert.appliquer) ; Socle tout de suite
     liste()                → dernières versions publiées de chaque appli (dépôt public GitHub) et version installée
     telecharger(url, nom)  → APK copiée dans le cache ; la page lance ensuite l'installation (MAGPrint.fsOpen)
   Les données ne passent que par le fichier que l'utilisateur crée et envoie lui-même ; sans le code, il est illisible. */

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

public class TransfertBridge {
    static final String SUITE = "fr.magformation13.";
    static final String DEPOT = "gilbertmamadou-design/atelier-signature";
    final Activity a; final WebView wv;
    volatile JSONObject etat = new JSONObject();

    public TransfertBridge(Activity a, WebView wv) {
        if (!a.getPackageName().endsWith(".socle")) throw new IllegalStateException("Réservé à Socle");
        this.a = a; this.wv = wv;
    }

    void maj(String job, String txt, int n, int total) {
        try { JSONObject o = new JSONObject(); o.put("job", job); o.put("txt", txt); o.put("n", n); o.put("total", total); o.put("fini", false); etat = o; } catch (Exception e) { }
    }
    void fin(String job, JSONObject res, String err) {
        try { JSONObject o = new JSONObject(); o.put("job", job); o.put("fini", true); if (res != null) o.put("res", res); if (err != null) o.put("err", err); etat = o; } catch (Exception e) { }
    }
    @JavascriptInterface public String etat() { return etat.toString(); }

    /* ---------- applis de la Suite installées ---------- */
    static long vc(PackageManager pm, String pkg) {
        try { PackageInfo i = pm.getPackageInfo(pkg, 0); return Build.VERSION.SDK_INT >= 28 ? i.getLongVersionCode() : i.versionCode; } catch (Throwable t) { return -1; }
    }
    JSONArray suite() throws Exception {
        PackageManager pm = a.getPackageManager(); JSONArray l = new JSONArray(); HashMap<String, Boolean> vu = new HashMap<>();
        List<ResolveInfo> r = pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0);
        for (ResolveInfo i : r) {
            String p = i.activityInfo.packageName; if (!p.startsWith(SUITE) || vu.containsKey(p)) continue; vu.put(p, true);
            JSONObject o = new JSONObject(); o.put("pkg", p); o.put("nom", String.valueOf(i.loadLabel(pm))); o.put("vc", vc(pm, p)); l.put(o);
        }
        return l;
    }
    @JavascriptInterface public String apps() { try { return suite().toString(); } catch (Throwable t) { return "[]"; } }

    /* ---------- chiffrement ---------- */
    static byte[] cle(String code, byte[] sel) throws Exception {
        PBEKeySpec k = new PBEKeySpec(code.toCharArray(), sel, 150000, 256);
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(k).getEncoded();
    }
    static String chiffrer(String clair, String code) throws Exception {
        SecureRandom r = new SecureRandom(); byte[] sel = new byte[16], iv = new byte[12]; r.nextBytes(sel); r.nextBytes(iv);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cle(code, sel), "AES"), new GCMParameterSpec(128, iv));
        byte[] out = c.doFinal(clair.getBytes("UTF-8"));
        JSONObject o = new JSONObject(); o.put("magsuite", 1); o.put("sel", Base64.encodeToString(sel, Base64.NO_WRAP)); o.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP)); o.put("data", Base64.encodeToString(out, Base64.NO_WRAP));
        return o.toString();
    }
    static String dechiffrer(String fichier, String code) throws Exception {
        JSONObject o = new JSONObject(fichier);
        if (o.optInt("magsuite", 0) != 1) throw new IllegalArgumentException("Ce fichier n'est pas un transfert de la Suite");
        byte[] sel = Base64.decode(o.getString("sel"), Base64.NO_WRAP), iv = Base64.decode(o.getString("iv"), Base64.NO_WRAP), d = Base64.decode(o.getString("data"), Base64.NO_WRAP);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cle(code, sel), "AES"), new GCMParameterSpec(128, iv));
        try { return new String(c.doFinal(d), "UTF-8"); } catch (javax.crypto.AEADBadTagException e) { throw new IllegalArgumentException("Code incorrect"); }
    }
    static String lire(InputStream in) throws Exception {
        try (InputStream i = in) { ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] t = new byte[65536]; int n; while ((n = i.read(t)) > 0) b.write(t, 0, n); return b.toString("UTF-8"); }
    }

    /* ---------- exporter ---------- */
    @JavascriptInterface public void exporter(final String code) {
        maj("export", "Préparation…", 0, 0);
        new Thread(new Runnable() { public void run() {
            try {
                if (code == null || code.length() < 4) throw new IllegalArgumentException("Code trop court (4 caractères au moins)");
                JSONArray l = suite(); JSONObject apps = new JSONObject(); JSONArray manque = new JSONArray(), pris = new JSONArray();
                for (int i = 0; i < l.length(); i++) {
                    JSONObject x = l.getJSONObject(i); String p = x.getString("pkg");
                    maj("export", x.getString("nom"), i + 1, l.length());
                    try {
                        String t = lire(a.getContentResolver().openInputStream(Uri.parse("content://" + p + ".widget/transfert")));
                        JSONObject d = new JSONObject(t); d.put("nom", x.getString("nom")); apps.put(p, d); pris.put(x.getString("nom"));
                    } catch (Throwable e) { manque.put(x.getString("nom")); }
                }
                JSONObject tout = new JSONObject(); tout.put("v", 1); tout.put("at", System.currentTimeMillis()); tout.put("de", Build.MANUFACTURER + " " + Build.MODEL); tout.put("apps", apps);
                maj("export", "Chiffrement…", l.length(), l.length());
                String f = chiffrer(tout.toString(), code);
                String nom = "Transfert-Suite-" + new SimpleDateFormat("yyyy-MM-dd-HHmm", Locale.FRANCE).format(new Date()) + ".magsuite";
                Uri u = enregistrer(nom, f.getBytes("UTF-8"));
                JSONObject res = new JSONObject(); res.put("nom", nom); res.put("pris", pris); res.put("manque", manque); res.put("taille", f.length());
                fin("export", res, null);
                partager(u, nom);
            } catch (Throwable e) { fin("export", null, e.getMessage() == null ? e.toString() : e.getMessage()); }
        } }).start();
    }
    Uri enregistrer(String nom, byte[] b) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, nom); v.put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream");
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/MAG-Suite");
            Uri u = a.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            try (OutputStream o = a.getContentResolver().openOutputStream(u)) { o.write(b); }
            return u;
        }
        File d = new File(a.getExternalFilesDir(null), "MAG-Suite"); d.mkdirs(); File f = new File(d, nom);
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(b); }
        return androidx.core.content.FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", f);
    }
    void partager(final Uri u, final String nom) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                Intent i = new Intent(Intent.ACTION_SEND).setType("application/octet-stream").putExtra(Intent.EXTRA_STREAM, u).putExtra(Intent.EXTRA_SUBJECT, nom)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                a.startActivity(Intent.createChooser(i, "Envoyer le transfert vers l'autre appareil"));
            } catch (Throwable e) { }
        } });
    }

    /* ---------- importer ---------- */
    @JavascriptInterface public void importer(final String texte, final String code) {
        maj("import", "Déchiffrement…", 0, 0);
        new Thread(new Runnable() { public void run() {
            try {
                JSONObject tout = new JSONObject(dechiffrer(texte, code)), apps = tout.getJSONObject("apps");
                JSONArray ok = new JSONArray(), absent = new JSONArray(); JSONArray cles = apps.names(); boolean moi = false;
                PackageManager pm = a.getPackageManager();
                for (int i = 0; cles != null && i < cles.length(); i++) {
                    String p = cles.getString(i); JSONObject d = apps.getJSONObject(p); String nom = d.optString("nom", p);
                    maj("import", nom, i + 1, cles.length());
                    if (vc(pm, p) < 0) { absent.put(nom); continue; }
                    JSONObject dep = new JSONObject(); dep.put("at", d.optLong("at")); dep.put("ls", d.optJSONObject("ls"));
                    if (p.equals(a.getPackageName())) { try (FileOutputStream o = new FileOutputStream(SuiteTransfert.depot(a))) { o.write(dep.toString().getBytes("UTF-8")); } moi = true; ok.put(nom); continue; }
                    try (OutputStream o = a.getContentResolver().openOutputStream(Uri.parse("content://" + p + ".widget/import"), "wt")) { o.write(dep.toString().getBytes("UTF-8")); ok.put(nom); }
                    catch (Throwable e) { absent.put(nom + " (à mettre à jour)"); }
                }
                JSONObject res = new JSONObject(); res.put("ok", ok); res.put("absent", absent); res.put("de", tout.optString("de")); res.put("at", tout.optLong("at")); res.put("socle", moi);
                fin("import", res, null);
            } catch (Throwable e) { fin("import", null, e.getMessage() == null ? e.toString() : e.getMessage()); }
        } }).start();
    }
    /** Socle reprend ses propres réglages (disposition, tuiles…) : appelé par la page après avoir affiché le bilan */
    @JavascriptInterface public void reprendreSocle() { a.runOnUiThread(new Runnable() { public void run() { SuiteTransfert.appliquer(a, wv); } }); }

    /* ---------- installer / mettre à jour toute la Suite ---------- */
    static String http(String u) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(u).openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(30000); h.setRequestProperty("User-Agent", "MAG-Socle"); h.setRequestProperty("Accept", "application/vnd.github+json");
        if (h.getResponseCode() >= 400) throw new Exception("Réponse " + h.getResponseCode() + (h.getResponseCode() == 403 ? " (trop de demandes, réessayez dans une heure)" : ""));
        return lire(h.getInputStream());
    }
    @JavascriptInterface public void liste() {
        maj("liste", "Liste des applis…", 0, 0);
        new Thread(new Runnable() { public void run() {
            try {
                JSONArray apps = new JSONArray(http("https://raw.githubusercontent.com/" + DEPOT + "/main/applis/apps.json"));
                HashMap<String, JSONObject> par = new HashMap<>(); HashMap<String, Integer> der = new HashMap<>();
                for (int i = 0; i < apps.length(); i++) { JSONObject x = apps.getJSONObject(i); par.put(x.getString("app"), x); }
                Pattern T = Pattern.compile("^([a-z0-9]+)-(\\d+)$");
                JSONObject trouve = new JSONObject();
                for (int page = 1; page <= 10 && trouve.length() < par.size(); page++) {
                    maj("liste", "Dernières versions… (page " + page + ")", page, 10);
                    JSONArray r = new JSONArray(http("https://api.github.com/repos/" + DEPOT + "/releases?per_page=100&page=" + page));
                    if (r.length() == 0) break;
                    for (int i = 0; i < r.length(); i++) {
                        JSONObject rel = r.getJSONObject(i); if (rel.optBoolean("draft") || rel.optBoolean("prerelease")) continue;
                        Matcher m = T.matcher(rel.optString("tag_name")); if (!m.find() || !par.containsKey(m.group(1))) continue;
                        int n = Integer.parseInt(m.group(2)); String app = m.group(1);
                        if (der.containsKey(app) && der.get(app) >= n) continue;
                        JSONArray as = rel.optJSONArray("assets"); JSONObject apk = null;
                        for (int k = 0; as != null && k < as.length(); k++) if (as.getJSONObject(k).optString("name").endsWith(".apk")) { apk = as.getJSONObject(k); break; }
                        if (apk == null) continue;
                        der.put(app, n);
                        JSONObject o = new JSONObject(); o.put("n", n); o.put("url", apk.getString("browser_download_url")); o.put("taille", apk.optLong("size")); o.put("fichier", apk.getString("name"));
                        trouve.put(app, o);
                    }
                }
                PackageManager pm = a.getPackageManager(); JSONArray l = new JSONArray();
                for (int i = 0; i < apps.length(); i++) {
                    JSONObject x = apps.getJSONObject(i), t = trouve.optJSONObject(x.getString("app")); if (t == null) continue;
                    JSONObject o = new JSONObject(); o.put("app", x.getString("app")); o.put("nom", x.optString("name")); o.put("pkg", x.optString("appid"));
                    long v = vc(pm, x.optString("appid")); o.put("installe", v); o.put("dispo", 1000 + t.getInt("n"));
                    o.put("url", t.getString("url")); o.put("taille", t.optLong("taille")); o.put("fichier", t.getString("fichier"));
                    l.put(o);
                }
                JSONObject res = new JSONObject(); res.put("apps", l); fin("liste", res, null);
            } catch (Throwable e) { fin("liste", null, e.getMessage() == null ? e.toString() : e.getMessage()); }
        } }).start();
    }
    @JavascriptInterface public void telecharger(final String url, final String nom) {
        maj("apk", nom, 0, 100);
        new Thread(new Runnable() { public void run() {
            try {
                if (!url.startsWith("https://github.com/" + DEPOT + "/releases/download/")) throw new Exception("Adresse refusée");
                File d = new File(a.getCacheDir(), "suite-apk"); d.mkdirs();
                File f = new File(d, nom.replaceAll("[^A-Za-z0-9._-]", "_"));
                HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection(); h.setInstanceFollowRedirects(true); h.setConnectTimeout(15000); h.setReadTimeout(60000);
                int code = h.getResponseCode();
                if (code >= 300 && code < 400) { h = (HttpURLConnection) new URL(h.getHeaderField("Location")).openConnection(); code = h.getResponseCode(); }
                if (code >= 400) throw new Exception("Téléchargement refusé (" + code + ")");
                long tot = h.getContentLengthLong(), lu = 0;
                try (InputStream in = h.getInputStream(); FileOutputStream o = new FileOutputStream(f)) {
                    byte[] t = new byte[65536]; int n; while ((n = in.read(t)) > 0) { o.write(t, 0, n); lu += n; if (tot > 0) maj("apk", nom, (int) (lu * 100 / tot), 100); }
                }
                JSONObject res = new JSONObject(); res.put("chemin", f.getAbsolutePath()); fin("apk", res, null);
            } catch (Throwable e) { fin("apk", null, e.getMessage() == null ? e.toString() : e.getMessage()); }
        } }).start();
    }
}
