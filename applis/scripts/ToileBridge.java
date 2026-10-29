package __PKG__;

// Toile : « Images en ligne », pont natif exposé en JavaScript sous window.MAGToile.
//  - Récupère des images selon des thèmes, UNIQUEMENT depuis des sources qui autorisent la réutilisation :
//    Wikimedia Commons, Openverse (Flickr, Wikimedia, Metropolitan Museum), NASA APOD, Pixabay (clé de l'utilisateur).
//    Licences gardées : CC0, domaine public, CC BY, CC BY-SA, licence Pixabay ; jamais NC, ND, « fair use », non libre.
//    Mêmes règles que applis/www-fonds/en-ligne.js (moteur du PC) : requêtes, filtres, doublons, plafond.
//  - Réseau en liste blanche d'hôtes (API et serveurs d'images de ces sources), https seulement, sans cookies,
//    User-Agent identifiable (exigé par Wikimedia), délais et tailles maximum, réponses d'API gardées 24 h.
//  - Les fichiers vont dans files/toile-en-ligne/ (dossier privé de l'appli) ; WallpaperJob les ajoute à la rotation
//    et leur applique les mêmes traitements que les images des dossiers choisis.
//  - Tâche de fond WorkManager (classe Collecte) : N images par jour ou par semaine, Wi-Fi seulement par défaut,
//    plafond de stockage, suppression des plus anciennes non favorites.
//  - Les clés (Pixabay, NASA) restent sur le téléphone : fichier dans getNoBackupFilesDir() (exclu des sauvegardes).
// Ce pont est chargé dans toutes les applis : il ne fait rien hors de Toile (paquet ….toile).
// Le constructeur ne fait rien : aucune connexion tant que la page ou la tâche de fond ne le demande pas.

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.CookieHandler;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ToileBridge {
    static final String[] HOSTS = {
        "commons.wikimedia.org", "upload.wikimedia.org",            // Wikimedia Commons : API, fichiers
        "api.openverse.org",                                         // Openverse : API
        "live.staticflickr.com", "images.metmuseum.org",            // Openverse : images Flickr, Metropolitan Museum
        "api.nasa.gov", "apod.nasa.gov",                             // NASA APOD : API, images
        "pixabay.com", "cdn.pixabay.com"                             // Pixabay : API et images (pixabay.com/get/…)
    };
    static final Pattern FARM = Pattern.compile("^farm\\d+\\.staticflickr\\.com$");
    static final Pattern IMG_HOST = Pattern.compile("^(upload\\.wikimedia\\.org|live\\.staticflickr\\.com|farm\\d+\\.staticflickr\\.com|images\\.metmuseum\\.org|apod\\.nasa\\.gov|pixabay\\.com|cdn\\.pixabay\\.com)$");
    static final String UA = "Toile/1.0 (Android; fonds d'ecran sous licence libre; https://github.com/gilbertmamadou-design/atelier-signature)";
    static final int MAX_JSON = 4 * 1024 * 1024, MAX_IMG = 30 * 1024 * 1024;
    static final int[] STEPS = { 960, 1280, 1920, 3840 };
    static final String OV_SOURCES = "flickr,wikimedia,met";
    static final Pattern MATURE = Pattern.compile("(^|[^a-zà-ÿ])(nude?s?|nudity|naked|nudism|nudists?|naturism|naturists?|nudisme|naturisme|nudistes?|naturistes?|topless|erotica?|érotiques?|erotique|porn\\w*|sexy|sexual|sexe|lingerie|nue?s?|seins?|breasts?|genitals?|penis|vagina|fetish)([^a-zà-ÿ]|$)", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    static final String[] ORDER = { "commons", "openverse", "pixabay", "apod" };
    static final String PREFS = "toile_web", WORK = "toile-web", WORK_NOW = "toile-web-now";
    static final long CACHE_MS = 24 * 3600000L;
    static final Object LOCK = new Object();
    static final AtomicBoolean RUNNING = new AtomicBoolean(false);

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());

    public ToileBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // Cycle de vie (appelé par MainActivity, rien à faire ici)
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) { }
    public void onResume() { }
    public void onIntent(Intent i) { }

    static boolean isToile(Context c) { return c.getPackageName().endsWith(".toile"); }
    private boolean ok() { return isToile(a); }

    // ---------------------------------------------------------------- stockage
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static File dir(Context c) { File d = new File(c.getFilesDir(), "toile-en-ligne"); if (!d.exists()) d.mkdirs(); return d; }
    static File thumbDir(Context c) { File d = new File(dir(c), ".min"); if (!d.exists()) d.mkdirs(); return d; }
    static File keyFile(Context c) { return new File(c.getNoBackupFilesDir(), "toile-cles.json"); }

    static JSONObject cfg(Context c) {
        JSONObject o;
        try { o = new JSONObject(prefs(c).getString("cfg", "{}")); } catch (Exception e) { o = new JSONObject(); }
        try {
            if (!o.has("n")) o.put("n", 3);
            if (!o.has("per")) o.put("per", "day");
            if (!o.has("auto")) o.put("auto", false);
            if (!o.has("wifi")) o.put("wifi", true);
            if (!o.has("capMo")) o.put("capMo", 300);
            if (!o.has("rot")) o.put("rot", true);
            if (!o.has("minRes")) o.put("minRes", 1);
            if (!o.has("src")) o.put("src", new JSONObject().put("commons", true).put("openverse", true).put("apod", true).put("pixabay", false));
        } catch (Exception e) { }
        return o;
    }

    static JSONArray items(Context c) {
        try { return new JSONArray(prefs(c).getString("items", "[]")); } catch (Exception e) { return new JSONArray(); }
    }
    static void saveItems(Context c, JSONArray a) { prefs(c).edit().putString("items", a.toString()).apply(); }

    static JSONObject keys(Context c) {
        try (FileInputStream in = new FileInputStream(keyFile(c))) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[4096]; int n;
            while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            return new JSONObject(new String(bo.toByteArray(), "UTF-8"));
        } catch (Exception e) { return new JSONObject(); }
    }
    static void saveKeys(Context c, JSONObject k) {
        try (FileOutputStream o = new FileOutputStream(keyFile(c))) { o.write(k.toString().getBytes("UTF-8")); } catch (Exception e) { }
    }
    static String mask(String k) { return k == null || k.isEmpty() ? "" : "••••" + k.substring(Math.max(0, k.length() - 4)); }

    // ---------------------------------------------------------------- rotation (pour WallpaperJob)
    static boolean rotationOn(Context c) { return isToile(c) && cfg(c).optBoolean("rot", true) && items(c).length() > 0; }

    static List<String[]> rotation(Context c) {
        List<String[]> out = new ArrayList<String[]>();
        if (!isToile(c) || !cfg(c).optBoolean("rot", true)) return out;
        JSONArray a = items(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i); if (o == null) continue;
            File f = new File(dir(c), o.optString("file"));
            if (f.isFile()) out.add(new String[]{ o.optString("file"), Uri.fromFile(f).toString() });
        }
        return out;
    }

    static JSONObject byFile(Context c, String name) {
        JSONArray a = items(c);
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && name.equals(o.optString("file"))) return o; }
        return null;
    }
    static boolean ours(Context c, Uri u) {
        try { return u != null && "file".equals(u.getScheme()) && new File(u.getPath()).getParentFile().getCanonicalPath().equals(dir(c).getCanonicalPath()); }
        catch (Exception e) { return false; }
    }
    // Nom affiché par WallpaperJob (aperçu, « Nouveau fond : … ») : titre et auteur
    static String label(Context c, Uri u) {
        if (!ours(c, u)) return null;
        JSONObject o = byFile(c, new File(u.getPath()).getName());
        return o == null ? null : o.optString("title") + " — " + o.optString("author");
    }

    // ---------------------------------------------------------------- réseau
    static boolean allowed(String u) {
        try {
            URL url = new URL(u);
            if (!"https".equals(url.getProtocol())) return false;
            if (url.getUserInfo() != null) return false;
            int p = url.getPort(); if (p != -1 && p != 443) return false;
            String h = url.getHost().toLowerCase(Locale.ROOT);
            for (String x : HOSTS) if (h.equals(x)) return true;
            return FARM.matcher(h).matches();
        } catch (Throwable t) { return false; }
    }

    // Aucun cookie envoyé ni gardé pour les requêtes de ce pont
    static final ThreadLocal<Boolean> OURS = new ThreadLocal<Boolean>();
    static class NoCookies extends CookieHandler {
        final CookieHandler prev;
        NoCookies(CookieHandler p) { prev = p; }
        @Override public Map<String, List<String>> get(URI u, Map<String, List<String>> h) throws java.io.IOException {
            if (Boolean.TRUE.equals(OURS.get()) || prev == null) return Collections.<String, List<String>>emptyMap();
            return prev.get(u, h);
        }
        @Override public void put(URI u, Map<String, List<String>> h) throws java.io.IOException {
            if (Boolean.TRUE.equals(OURS.get()) || prev == null) return;
            prev.put(u, h);
        }
    }
    static synchronized void noCookies() {
        try { CookieHandler c = CookieHandler.getDefault(); if (!(c instanceof NoCookies)) CookieHandler.setDefault(new NoCookies(c)); } catch (Throwable t) { }
    }

    static class Resp { int code; byte[] body = new byte[0]; String type = ""; String err = ""; }

    static Resp get(String u, int max, boolean image) {
        Resp r = new Resp();
        noCookies();
        OURS.set(true);
        try {
            String cur = u;
            for (int hops = 0; hops < 5; hops++) {
                if (!allowed(cur)) { r.err = "Adresse non autorisée"; return r; }
                HttpURLConnection h = null;
                try {
                    h = (HttpURLConnection) new URL(cur).openConnection();
                    h.setConnectTimeout(15000); h.setReadTimeout(image ? 60000 : 25000);
                    h.setUseCaches(false);
                    h.setInstanceFollowRedirects(false);
                    h.setRequestProperty("User-Agent", UA);
                    h.setRequestProperty("Accept", image ? "image/jpeg, image/png, image/webp;q=0.9" : "application/json");
                    int code = h.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = h.getHeaderField("Location");
                        if (loc == null) { r.code = code; r.err = "Redirection sans adresse"; return r; }
                        cur = new URL(new URL(cur), loc).toString();
                        continue;
                    }
                    r.code = code; r.type = h.getContentType() == null ? "" : h.getContentType().toLowerCase(Locale.ROOT);
                    long len = h.getContentLengthLong();
                    if (len > max) { r.err = "Fichier trop volumineux"; return r; }
                    InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
                    if (in != null) {
                        try (InputStream s = in) {
                            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[32768]; int n;
                            while ((n = s.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > max) { r.err = "Fichier trop volumineux"; return r; } }
                            r.body = bo.toByteArray();
                        }
                    }
                    if (code >= 400) r.err = "HTTP " + code;
                    return r;
                } finally { if (h != null) try { h.disconnect(); } catch (Throwable t) { } }
            }
            r.err = "Trop de redirections";
            return r;
        } catch (Throwable t) {
            r.code = 0; r.err = t.getClass().getSimpleName() + (t.getMessage() != null ? " : " + t.getMessage() : "");
            return r;
        } finally { OURS.remove(); }
    }

    // Réponses d'API gardées 24 h (Pixabay l'exige ; ménage les autres services). La clé n'entre pas dans le nom du fichier.
    static String api(Context c, String url, boolean cacheable, int[] status) throws Exception {
        String ck = url.replaceAll("([?&](?:key|api_key)=)[^&]*", "$1*");
        File cf = new File(c.getCacheDir(), "toile-api-" + sha(ck.getBytes("UTF-8")).substring(0, 24) + ".json");
        if (cacheable && cf.isFile() && System.currentTimeMillis() - cf.lastModified() < CACHE_MS) {
            status[0] = 200; return new String(readFile(cf), "UTF-8");
        }
        Resp r = get(url, MAX_JSON, false);
        status[0] = r.code;
        String body = new String(r.body, "UTF-8");
        if (r.code != 200) return body;
        if (cacheable) try (FileOutputStream o = new FileOutputStream(cf)) { o.write(r.body); } catch (Exception e) { }
        return body;
    }

    static byte[] readFile(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[32768]; int n;
            while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            return bo.toByteArray();
        }
    }

    static String sha(byte[] b) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] d = md.digest(b);
        StringBuilder s = new StringBuilder();
        for (byte x : d) s.append(String.format(Locale.ROOT, "%02x", x));
        return s.toString();
    }

    static String enc(String s) { try { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (Exception e) { return ""; } }

    // ---------------------------------------------------------------- règles (identiques à en-ligne.js)
    static class Opt { int minW, minH, page; boolean portrait; String lic = "", key = ""; }
    static class Cand {
        String id, src, via, title, author, authorUrl = "", license, licenseUrl = "", page, img; int w, h; List<String> keys = new ArrayList<String>();
    }

    static boolean fits(int w, int h, Opt o) { return w >= o.minW && h >= o.minH && (o.portrait ? h > w : w > h); }

    static String strip(String h) {
        if (h == null) return "";
        return h.replaceAll("<[^>]*>", " ").replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", "\"").replace("&#039;", "'").replace("&#39;", "'")
            .replace("&lt;", "<").replace("&gt;", ">").replaceAll("\\s+", " ").trim();
    }
    static String cut(String s, int n) { s = strip(s); return s.length() > n ? s.substring(0, n - 1) + "…" : s; }
    static String href(String h) {
        Matcher m = Pattern.compile("href=\"([^\"]+)\"").matcher(h == null ? "" : h);
        if (!m.find()) return "";
        String u = m.group(1).replace("&amp;", "&");
        if (u.startsWith("//")) u = "https:" + u; else if (u.startsWith("/")) u = "https://commons.wikimedia.org" + u;
        return u.startsWith("https://") ? u : "";
    }
    static String host(String u) {
        Matcher m = Pattern.compile("^https://([^/:?#]+)", Pattern.CASE_INSENSITIVE).matcher(u == null ? "" : u);
        return m.find() ? m.group(1).toLowerCase(Locale.ROOT) : "";
    }
    static final Pattern WM = Pattern.compile("^https://upload\\.wikimedia\\.org/wikipedia/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+)");
    static final Pattern WM_ORIG = Pattern.compile("^https://upload\\.wikimedia\\.org/wikipedia/commons/([0-9a-f])/([0-9a-f]{2})/([^/]+)$");
    static String wmKey(String u) { Matcher m = WM.matcher(u == null ? "" : u); return m.find() ? "wm:" + m.group(1) : "url:" + u; }

    // {url, w, h} : vignette standard juste assez grande pour couvrir l'écran, sinon l'original
    static Object[] wmPick(String u, int ow, int oh, String mime, long size, Opt o) {
        if (ow <= 0 || oh <= 0 || !fits(ow, oh, o)) return null;
        int need = Math.max(o.minW, (int) Math.ceil(o.minH * (double) ow / oh)), step = 0;
        for (int s : STEPS) if (s >= need) { step = s; break; }
        Matcher m = WM_ORIG.matcher(u == null ? "" : u);
        if (step > 0 && step < ow && m.find() && m.group(3).toLowerCase(Locale.ROOT).matches(".*\\.jpe?g") && m.group(3).length() <= 140 && (mime == null || mime.contains("jpeg")))
            return new Object[]{ "https://upload.wikimedia.org/wikipedia/commons/thumb/" + m.group(1) + "/" + m.group(2) + "/" + m.group(3) + "/" + step + "px-" + m.group(3), step, (int) Math.round(oh * (double) step / ow) };
        if (size > MAX_IMG) return null;
        return new Object[]{ u, ow, oh };
    }

    static String emv(JSONObject em, String k) {
        JSONObject x = em == null ? null : em.optJSONObject(k);
        if (x == null || x.isNull("value")) return "";
        return String.valueOf(x.opt("value"));
    }
    static final Pattern NOT_FREE = Pattern.compile("(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no ?deriv|fair use|non-?free");
    // {genre, libellé, adresse} ou null si la licence n'est pas libre
    static String[] commonsLicense(JSONObject em) {
        if (emv(em, "NonFree").trim().equalsIgnoreCase("true")) return null;
        String lic = emv(em, "License").toLowerCase(Locale.ROOT).trim(), sh = strip(emv(em, "LicenseShortName"));
        String all = (lic + " " + sh + " " + strip(emv(em, "UsageTerms"))).toLowerCase(Locale.ROOT);
        if (NOT_FREE.matcher(all).find()) return null;
        String shl = sh.toLowerCase(Locale.ROOT), kind;
        if (lic.startsWith("cc0") || shl.startsWith("cc0") || shl.contains("cc zero")) kind = "cc0";
        else if (lic.matches("^(pd|cc-pd|public domain).*") || shl.matches("^(public domain|domaine public|pd)\\b.*")) kind = "pd";
        else if (lic.matches("^cc-by-sa-\\d.*")) kind = "by-sa";
        else if (lic.matches("^cc-by-\\d.*")) kind = "by";
        else return null;
        String url = emv(em, "LicenseUrl");
        return new String[]{ kind, sh.isEmpty() ? lic.toUpperCase(Locale.ROOT) : sh, url.matches("^https?://.*") ? url.replaceFirst("^http:", "https:") : "" };
    }
    static boolean pdOnly(Opt o, String kind) { return "pd".equals(o.lic) && !"pd".equals(kind) && !"cc0".equals(kind); }

    static String url(String src, Object q, Opt o) {
        if ("commons".equals(src)) return "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=6&gsrlimit=40&gsroffset=" + (o.page * 40)
            + "&gsrsearch=" + enc(q + " filetype:bitmap filew:>" + (o.minW - 1) + " fileh:>" + (o.minH - 1))
            + "&prop=imageinfo&iiprop=" + enc("url|size|mime|extmetadata") + "&iiextmetadatafilter=" + enc("License|LicenseShortName|LicenseUrl|Artist|UsageTerms|NonFree|ObjectName|Categories|ImageDescription")
            + "&iiextmetadatalanguage=fr";
        if ("openverse".equals(src)) return "https://api.openverse.org/v1/images/?q=" + enc(String.valueOf(q)) + "&license=" + enc("pd".equals(o.lic) ? "cc0,pdm" : "by,by-sa,cc0,pdm")
            + "&mature=false&aspect_ratio=" + (o.portrait ? "tall" : "wide") + "&size=large&source=" + enc(OV_SOURCES) + "&extension=jpg&page_size=20&page=" + (o.page + 1);
        if ("pixabay".equals(src)) {
            JSONObject p = (JSONObject) q;
            return "https://pixabay.com/api/?key=" + enc(o.key) + "&q=" + enc(p.optString("q")) + "&lang=fr&image_type=" + p.optString("type", "photo") + "&orientation=" + (o.portrait ? "vertical" : "horizontal")
                + "&safesearch=true&min_width=" + o.minW + "&min_height=" + o.minH + "&per_page=50&page=" + (o.page + 1) + (p.optString("cat").isEmpty() ? "" : "&category=" + p.optString("cat"));
        }
        return "https://api.nasa.gov/planetary/apod?api_key=" + enc(o.key.isEmpty() ? "DEMO_KEY" : o.key) + "&count=8&thumbs=false";
    }

    static List<Cand> parse(String src, String body, Opt o) {
        List<Cand> out = new ArrayList<Cand>();
        try {
            if ("commons".equals(src)) {
                JSONObject j = new JSONObject(body), q = j.optJSONObject("query");
                JSONArray pages = q == null ? null : q.optJSONArray("pages");
                if (pages == null) return out;
                for (int i = 0; i < pages.length(); i++) {
                    JSONObject p = pages.optJSONObject(i); if (p == null || p.optLong("pageid") <= 0) continue;
                    JSONArray iia = p.optJSONArray("imageinfo"); JSONObject ii = iia == null ? null : iia.optJSONObject(0); if (ii == null) continue;
                    String mime = ii.optString("mime");
                    if (!mime.matches("^image/(jpeg|png|webp)$")) continue;
                    JSONObject em = ii.optJSONObject("extmetadata"); if (em == null) em = new JSONObject();
                    String[] L = commonsLicense(em); if (L == null || pdOnly(o, L[0])) continue;
                    String title0 = p.optString("title");
                    if (MATURE.matcher(title0 + " " + emv(em, "ObjectName") + " " + emv(em, "Categories") + " " + strip(emv(em, "ImageDescription"))).find()) continue;
                    Object[] k = wmPick(ii.optString("url"), ii.optInt("width"), ii.optInt("height"), mime, ii.optLong("size"), o); if (k == null) continue;
                    Cand c = new Cand();
                    c.id = "commons:" + p.optLong("pageid"); c.src = "commons"; c.via = "Wikimedia Commons";
                    String t = cut(emv(em, "ObjectName"), 90);
                    c.title = t.isEmpty() ? cut(title0.replaceFirst("^File:", "").replaceFirst("\\.[A-Za-z0-9]+$", "").replace('_', ' '), 90) : t;
                    String au = cut(emv(em, "Artist"), 80); c.author = au.isEmpty() ? "Auteur inconnu" : au; c.authorUrl = href(emv(em, "Artist"));
                    c.license = L[1]; c.licenseUrl = L[2];
                    c.page = ii.optString("descriptionurl", "https://commons.wikimedia.org/wiki/" + enc(title0.replace(' ', '_')));
                    c.img = (String) k[0]; c.w = (Integer) k[1]; c.h = (Integer) k[2];
                    c.keys.add(c.id); c.keys.add(wmKey(ii.optString("url")));
                    out.add(c);
                }
            } else if ("openverse".equals(src)) {
                JSONArray rs = new JSONObject(body).optJSONArray("results");
                if (rs == null) return out;
                for (int i = 0; i < rs.length(); i++) {
                    JSONObject r = rs.optJSONObject(i); if (r == null || r.optBoolean("mature")) continue;
                    String l = r.optString("license").toLowerCase(Locale.ROOT);
                    if (!(l.equals("by") || l.equals("by-sa") || l.equals("cc0") || l.equals("pdm"))) continue;
                    if (pdOnly(o, l.equals("pdm") ? "pd" : l)) continue;
                    String u = r.optString("url"), h = host(u);
                    if (!IMG_HOST.matcher(h).matches()) continue;
                    StringBuilder tg = new StringBuilder(r.optString("title"));
                    JSONArray tags = r.optJSONArray("tags");
                    if (tags != null) for (int t = 0; t < tags.length(); t++) { JSONObject x = tags.optJSONObject(t); if (x != null) tg.append(' ').append(x.optString("name")); }
                    if (MATURE.matcher(tg.toString()).find()) continue;
                    int w = r.optInt("width"), ht = r.optInt("height");
                    Object[] k;
                    if ("upload.wikimedia.org".equals(h)) k = wmPick(u, w, ht, u.toLowerCase(Locale.ROOT).matches(".*\\.jpe?g$") ? "image/jpeg" : "image/png", r.optLong("filesize"), o);
                    else k = w > 0 && ht > 0 && fits(w, ht, o) ? new Object[]{ u, w, ht } : null;
                    if (k == null) continue;
                    Cand c = new Cand();
                    c.id = "openverse:" + r.optString("id"); c.src = "openverse";
                    String s = r.optString("source");
                    c.via = "Openverse · " + ("flickr".equals(s) ? "Flickr" : "wikimedia".equals(s) ? "Wikimedia" : "met".equals(s) ? "Metropolitan Museum" : s);
                    c.title = cut(r.optString("title", "Sans titre"), 90); if (c.title.isEmpty()) c.title = "Sans titre";
                    String au = cut(r.optString("creator"), 80); c.author = au.isEmpty() || "null".equals(au) ? "Auteur inconnu" : au;
                    c.authorUrl = r.optString("creator_url").startsWith("https://") ? r.optString("creator_url") : "";
                    String v = r.optString("license_version");
                    c.license = l.equals("pdm") ? "Domaine public" : l.equals("cc0") ? "CC0" : "CC " + l.toUpperCase(Locale.ROOT) + (v.isEmpty() || "null".equals(v) ? "" : " " + v);
                    c.licenseUrl = r.optString("license_url").replaceFirst("^http:", "https:");
                    String land = r.optString("foreign_landing_url");
                    c.page = land.matches("^https?://.*") ? land : "https://openverse.org/image/" + r.optString("id");
                    c.img = (String) k[0]; c.w = (Integer) k[1]; c.h = (Integer) k[2];
                    c.keys.add(c.id); c.keys.add("upload.wikimedia.org".equals(h) ? wmKey(u) : "url:" + u);
                    out.add(c);
                }
            } else if ("pixabay".equals(src)) {
                JSONArray hs = new JSONObject(body).optJSONArray("hits");
                if (hs == null) return out;
                for (int i = 0; i < hs.length(); i++) {
                    JSONObject x = hs.optJSONObject(i); if (x == null || x.optLong("id") <= 0) continue;
                    if (MATURE.matcher(x.optString("tags")).find()) continue;
                    int iw = x.optInt("imageWidth"), ih = x.optInt("imageHeight"), w, h; String u;
                    if (!x.optString("imageURL").isEmpty()) { u = x.optString("imageURL"); w = iw; h = ih; }
                    else if (!x.optString("fullHDURL").isEmpty()) { double s = Math.min(1, 1920.0 / Math.max(iw, ih)); u = x.optString("fullHDURL"); w = (int) Math.round(iw * s); h = (int) Math.round(ih * s); }
                    else { double s = Math.min(1, 1280.0 / Math.max(iw, ih)); u = x.optString("largeImageURL"); w = (int) Math.round(iw * s); h = (int) Math.round(ih * s); }
                    if (u.isEmpty() || !IMG_HOST.matcher(host(u)).matches() || !fits(w, h, o)) continue;
                    StringBuilder tags = new StringBuilder(); int nt = 0;
                    for (String t : x.optString("tags").split(",")) { t = t.trim(); if (t.isEmpty() || nt >= 3) continue; if (nt++ > 0) tags.append(", "); tags.append(t); }
                    Cand c = new Cand();
                    c.id = "pixabay:" + x.optLong("id"); c.src = "pixabay"; c.via = "Pixabay";
                    c.title = tags.length() == 0 ? "Image Pixabay" : cut(Character.toUpperCase(tags.charAt(0)) + tags.substring(1), 90);
                    String user = x.optString("user"); c.author = user.isEmpty() ? "Auteur Pixabay" : cut(user, 80);
                    c.authorUrl = user.isEmpty() ? "" : "https://pixabay.com/users/" + enc(user) + "-" + x.optLong("user_id") + "/";
                    c.license = "Licence de contenu Pixabay"; c.licenseUrl = "https://pixabay.com/service/license-summary/";
                    c.page = x.optString("pageURL").startsWith("https://") ? x.optString("pageURL") : "https://pixabay.com/";
                    c.img = u; c.w = w; c.h = h; c.keys.add(c.id);
                    out.add(c);
                }
            } else {
                String b = body.trim();
                JSONArray arr = b.startsWith("[") ? new JSONArray(b) : new JSONArray().put(new JSONObject(b));
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject x = arr.optJSONObject(i);
                    if (x == null || !"image".equals(x.optString("media_type")) || x.has("copyright") || !x.optString("date").matches("^\\d{4}-\\d\\d-\\d\\d$")) continue;
                    String u = x.optString("hdurl", x.optString("url")).replaceFirst("^http://apod\\.nasa\\.gov/", "https://apod.nasa.gov/");
                    if (u.isEmpty()) u = x.optString("url");
                    if (!"apod.nasa.gov".equals(host(u)) || !u.toLowerCase(Locale.ROOT).matches(".*\\.(jpe?g|png)$")) continue;
                    String d = x.optString("date");
                    Cand c = new Cand();
                    c.id = "apod:" + d; c.src = "apod"; c.via = "NASA · APOD";
                    c.title = cut(x.optString("title", "Image astronomique du jour"), 90);
                    c.author = "NASA (APOD du " + d.substring(8) + "/" + d.substring(5, 7) + "/" + d.substring(0, 4) + ")";
                    c.license = "Domaine public (NASA)"; c.licenseUrl = "https://www.nasa.gov/nasa-brand-center/images-and-media/";
                    c.page = "https://apod.nasa.gov/apod/ap" + d.substring(2).replace("-", "") + ".html";
                    c.img = u; c.keys.add(c.id); c.keys.add("url:" + u);
                    out.add(c);
                }
            }
        } catch (Exception e) { }
        return out;
    }

    static String httpMsg(String src, int st, String body) {
        String n = "commons".equals(src) ? "Wikimedia Commons" : "openverse".equals(src) ? "Openverse" : "pixabay".equals(src) ? "Pixabay" : "NASA";
        if ("pixabay".equals(src) && (st == 400 || st == 401 || st == 403) && (body == null || body.toLowerCase(Locale.ROOT).contains("key"))) return "Pixabay : clé refusée, vérifiez-la";
        if ("apod".equals(src) && st == 403) return "NASA : clé refusée, vérifiez-la";
        if (st == 429) return n + ("apod".equals(src) ? " : limite de la clé atteinte (DEMO_KEY : 30 par heure, 50 par jour) ; ajoutez votre clé gratuite"
            : "openverse".equals(src) ? " : limite anonyme atteinte (20 par minute, 200 par jour), réessayez plus tard" : " : trop de demandes, réessayez plus tard");
        if (st == 0) return n + " : pas de réponse (connexion ?)";
        return n + " : erreur " + st;
    }

    // Répartition de n images entre les thèmes selon leur poids (plus forts restes, départage au hasard)
    static List<JSONObject> allocate(JSONArray plan, int n, Random rnd) {
        List<JSONObject> th = new ArrayList<JSONObject>(), out = new ArrayList<JSONObject>();
        double W = 0;
        for (int i = 0; plan != null && i < plan.length(); i++) { JSONObject o = plan.optJSONObject(i); if (o != null && o.optInt("w") > 0) { th.add(o); W += Math.min(3, o.optInt("w")); } }
        if (th.isEmpty() || n <= 0) return out;
        int[] cnt = new int[th.size()]; double[] fr = new double[th.size()]; int used = 0;
        for (int i = 0; i < th.size(); i++) { double e = n * Math.min(3, th.get(i).optInt("w")) / W; cnt[i] = (int) Math.floor(e); fr[i] = e - cnt[i] + rnd.nextDouble() * 1e-6; used += cnt[i]; }
        while (used < n) {
            int b = 0; for (int i = 1; i < fr.length; i++) if (fr[i] > fr[b]) b = i;
            if (fr[b] < 0) b = rnd.nextInt(th.size()); else fr[b] = -1;
            cnt[b]++; used++;
        }
        for (int i = 0; i < th.size(); i++) for (int k = 0; k < cnt[i]; k++) out.add(th.get(i));
        Collections.shuffle(out, rnd);
        return out;
    }

    // ---------------------------------------------------------------- récupération
    static void state(Context c, JSONObject st) { prefs(c).edit().putString("state", st.toString()).apply(); }

    static JSONObject run(Context c, int want, boolean manual) {
        JSONObject st = new JSONObject();
        if (!RUNNING.compareAndSet(false, true)) { try { st.put("msgs", new JSONArray().put("Récupération déjà en cours")); } catch (Exception e) { } return st; }
        List<String> msgs = new ArrayList<String>();
        int added = 0;
        try {
            st.put("running", true); st.put("started", System.currentTimeMillis()); st.put("wanted", want); state(c, st);
            JSONObject cfg = cfg(c), src = cfg.optJSONObject("src"), keys = keys(c);
            if (src == null) src = new JSONObject();
            int[] scr = WallpaperJob.screen(c);
            double f = cfg.optDouble("minRes", 1) == 0.5 ? 0.5 : 1;
            Opt o0 = new Opt(); o0.portrait = true; o0.minW = (int) Math.round(scr[0] * f); o0.minH = (int) Math.round(scr[1] * f);
            JSONArray plan = cfg.optJSONArray("plan");
            Random rnd = new Random();
            List<JSONObject> slots = allocate(plan, want, rnd);
            if (slots.isEmpty()) throw new Exception("Choisissez au moins un thème");
            List<String> srcs = new ArrayList<String>();
            for (String s : ORDER) {
                if (!src.optBoolean(s, false)) continue;
                if ("pixabay".equals(s) && keys.optString("pixabay").isEmpty()) continue;
                srcs.add(s);
            }
            if (srcs.isEmpty()) throw new Exception("Aucune source utilisable : activez Wikimedia Commons ou Openverse");
            Set<String> seen;
            JSONObject cur;
            JSONArray all;
            synchronized (LOCK) {
                seen = new LinkedHashSet<String>();
                try { JSONArray sa = new JSONArray(prefs(c).getString("seen", "[]")); for (int i = 0; i < sa.length(); i++) seen.add(sa.optString(i)); } catch (Exception e) { }
                try { cur = new JSONObject(prefs(c).getString("cursor", "{}")); } catch (Exception e) { cur = new JSONObject(); }
            }
            Map<String, Pool> pools = new java.util.HashMap<String, Pool>();
            int reqs = 0, maxReq = 6 + want * 4, dls = 0, maxDl = want * 3 + 3, si = 0;
            for (JSONObject th : slots) {
                si++;
                st.put("prog", si + "/" + slots.size()); st.put("theme", th.optString("name")); state(c, st);
                Pool pool = pools.get(th.optString("id"));
                if (pool == null) { pool = new Pool(combos(th, srcs, rnd)); pools.put(th.optString("id"), pool); }
                boolean got = false;
                while (!got && dls < maxDl) {
                    if (pool.cands.isEmpty()) {
                        boolean filled = false;
                        while (!pool.combos.isEmpty() && reqs < maxReq && !filled) {
                            Object[] cb = pool.combos.remove(0);
                            String s = (String) cb[0]; Object q = cb[1];
                            if (!srcs.contains(s)) continue;
                            String qs = "pixabay".equals(s) ? ((JSONObject) q).optString("q") : String.valueOf(q);
                            String lic = th.optString("lic");
                            String ck = s + "|" + qs + "|p|" + lic;
                            Opt o = new Opt(); o.portrait = o0.portrait; o.minW = o0.minW; o.minH = o0.minH; o.lic = lic;
                            o.page = cur.has(ck) ? cur.optInt(ck) : rnd.nextInt(3);
                            o.key = keys.optString(s);
                            if (reqs > 0) try { Thread.sleep("openverse".equals(s) ? 1500 : 700); } catch (InterruptedException e) { }
                            reqs++;
                            int[] code = new int[1];
                            String body;
                            try { body = api(c, url(s, q, o), !"apod".equals(s), code); } catch (Exception e) { code[0] = 0; body = ""; }
                            if (code[0] != 200) {
                                String m = httpMsg(s, code[0], body); if (!msgs.contains(m)) msgs.add(m);
                                if (code[0] == 401 || code[0] == 403 || code[0] == 429 || ("pixabay".equals(s) && code[0] == 400)) srcs.remove(s);
                                continue;
                            }
                            List<Cand> cs = parse(s, body, o);
                            boolean more = true;
                            try {
                                if ("commons".equals(s)) more = new JSONObject(body).has("continue");
                                else if ("openverse".equals(s)) more = new JSONObject(body).optInt("page_count") > o.page + 1 && o.page < 11;
                                else if ("pixabay".equals(s)) more = new JSONObject(body).optInt("totalHits") > (o.page + 1) * 50;
                            } catch (Exception e) { more = false; }
                            cur.put(ck, more ? o.page + 1 : 0);
                            List<Cand> fresh = new ArrayList<Cand>();
                            for (Cand x : cs) { boolean dup = false; for (String k : x.keys) if (seen.contains(k)) dup = true; if (!dup) fresh.add(x); }
                            Collections.shuffle(fresh, rnd);
                            if (!fresh.isEmpty()) { pool.cands.addAll(fresh); filled = true; }
                        }
                        if (!filled) break;
                    }
                    Cand x = pool.cands.remove(0);
                    boolean dup = false; for (String k : x.keys) if (seen.contains(k)) dup = true;
                    if (dup || !IMG_HOST.matcher(host(x.img)).matches()) continue;
                    dls++;
                    st.put("title", x.title); state(c, st);
                    JSONObject it = download(c, x, o0, seen, th);
                    if (it != null) {
                        synchronized (LOCK) { JSONArray a = items(c); a.put(it); saveItems(c, a); }
                        added++; got = true;
                    }
                }
            }
            synchronized (LOCK) {
                List<String> sl = new ArrayList<String>(seen);
                JSONArray sa = new JSONArray();
                for (int i = Math.max(0, sl.size() - 8000); i < sl.size(); i++) sa.put(sl.get(i));
                prefs(c).edit().putString("seen", sa.toString()).putString("cursor", cur.toString()).apply();
            }
            int rm = cleanup(c);
            if (rm > 0) st.put("removed", rm);
        } catch (Throwable t) {
            String m = t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
            if (!msgs.contains(m)) msgs.add(m);
        } finally {
            try {
                st.put("running", false); st.put("at", System.currentTimeMillis()); st.put("added", added); st.put("wanted", want);
                JSONArray ma = new JSONArray(); for (String m : msgs) ma.put(m); st.put("msgs", ma);
                st.put("auto", !manual); st.remove("prog"); st.remove("title"); st.remove("theme");
            } catch (Exception e) { }
            state(c, st);
            RUNNING.set(false);
        }
        return st;
    }

    static class Pool { List<Object[]> combos; List<Cand> cands = new ArrayList<Cand>(); Pool(List<Object[]> c) { combos = c; } }

    // Requêtes du thème, sources entrelacées (Commons 1, Openverse 1, Pixabay, Commons 2…), départ au hasard
    static List<Object[]> combos(JSONObject th, List<String> srcs, Random rnd) {
        List<Object[]> L = new ArrayList<Object[]>();
        int m = 0;
        for (String s : srcs) m = Math.max(m, queries(th, s).size());
        for (int i = 0; i < m; i++) for (String s : srcs) { List<Object> q = queries(th, s); if (i < q.size()) L.add(new Object[]{ s, q.get(i) }); }
        if (L.isEmpty()) return L;
        int k = rnd.nextInt(L.size());
        List<Object[]> out = new ArrayList<Object[]>(L.subList(k, L.size())); out.addAll(L.subList(0, k));
        return out;
    }
    static List<Object> queries(JSONObject th, String s) {
        List<Object> q = new ArrayList<Object>();
        if ("commons".equals(s) || "openverse".equals(s)) {
            JSONArray a = th.optJSONArray("commons".equals(s) ? "c" : "o");
            for (int i = 0; a != null && i < a.length(); i++) if (!a.optString(i).isEmpty()) q.add(a.optString(i));
        } else if ("pixabay".equals(s)) { JSONObject p = th.optJSONObject("p"); if (p != null && !p.optString("q").isEmpty()) q.add(p); }
        else if (th.optBoolean("apod")) q.add("apod");
        return q;
    }

    // Téléchargement, vérifications (type, taille, orientation, résolution, empreinte), enregistrement et vignette
    static JSONObject download(Context c, Cand x, Opt o, Set<String> seen, JSONObject th) {
        Resp r = get(x.img, MAX_IMG, true);
        if (r.code != 200 || r.body.length < 2000) { if (r.code >= 400) seen.addAll(x.keys); return null; }
        if (!r.type.isEmpty() && !r.type.matches("^image/(jpeg|png|webp).*")) { seen.addAll(x.keys); return null; }
        BitmapFactory.Options b = new BitmapFactory.Options(); b.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(r.body, 0, r.body.length, b);
        int w = b.outWidth, h = b.outHeight, rot = 0;
        if (w <= 0 || h <= 0) { seen.addAll(x.keys); return null; }
        try {
            int or = new ExifInterface(new ByteArrayInputStream(r.body)).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
            rot = or == 6 ? 90 : or == 3 ? 180 : or == 8 ? 270 : 0;
        } catch (Throwable t) { }
        if (rot == 90 || rot == 270) { int z = w; w = h; h = z; }
        if (!fits(w, h, o)) { seen.addAll(x.keys); return null; }
        String hash;
        try { hash = sha(r.body).substring(0, 32); } catch (Exception e) { return null; }
        if (seen.contains("h:" + hash)) { seen.addAll(x.keys); return null; }
        String mime = b.outMimeType == null ? r.type : b.outMimeType;
        String ext = mime.contains("png") ? ".png" : mime.contains("webp") ? ".webp" : ".jpg";
        String file = x.src + "-" + x.id.substring(x.id.indexOf(':') + 1).replaceAll("[^A-Za-z0-9_-]+", "-") + ext;
        if (file.length() > 90) file = file.substring(0, 86) + ext;
        File f = new File(dir(c), file);
        try (FileOutputStream out = new FileOutputStream(f)) { out.write(r.body); } catch (Exception e) { f.delete(); return null; }
        thumb(r.body, rot, new File(thumbDir(c), file + ".jpg"));
        seen.addAll(x.keys); seen.add("h:" + hash);
        try {
            JSONObject it = new JSONObject();
            it.put("id", x.id); it.put("src", x.src); it.put("via", x.via); it.put("title", x.title); it.put("author", x.author); it.put("authorUrl", x.authorUrl);
            it.put("license", x.license); it.put("licenseUrl", x.licenseUrl); it.put("page", x.page); it.put("img", x.img); it.put("file", file);
            it.put("w", w); it.put("h", h); it.put("bytes", r.body.length); it.put("hash", hash); it.put("at", System.currentTimeMillis());
            it.put("theme", th.optString("id")); it.put("themeName", th.optString("name")); it.put("fav", false);
            return it;
        } catch (Exception e) { return null; }
    }

    static void thumb(byte[] data, int rot, File out) {
        try {
            BitmapFactory.Options b = new BitmapFactory.Options(); b.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, b);
            int ss = 1; while (Math.min(b.outWidth, b.outHeight) / (ss * 2) >= 360) ss *= 2;
            BitmapFactory.Options d = new BitmapFactory.Options(); d.inSampleSize = ss;
            Bitmap bm = BitmapFactory.decodeByteArray(data, 0, data.length, d);
            if (bm == null) return;
            if (rot != 0) { Matrix m = new Matrix(); m.postRotate(rot); Bitmap rb = Bitmap.createBitmap(bm, 0, 0, bm.getWidth(), bm.getHeight(), m, true); if (rb != bm) bm.recycle(); bm = rb; }
            try (FileOutputStream o = new FileOutputStream(out)) { bm.compress(Bitmap.CompressFormat.JPEG, 78, o); }
            bm.recycle();
        } catch (Throwable t) { }
    }

    // Plafond : les plus anciennes non favorites sont supprimées
    static int cleanup(Context c) {
        synchronized (LOCK) {
            long cap = Math.max(50, cfg(c).optInt("capMo", 300)) * 1048576L, tot = 0;
            JSONArray a = items(c);
            List<JSONObject> l = new ArrayList<JSONObject>();
            for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null) { l.add(o); tot += o.optLong("bytes"); } }
            List<JSONObject> old = new ArrayList<JSONObject>();
            for (JSONObject o : l) if (!o.optBoolean("fav")) old.add(o);
            Collections.sort(old, (p, q) -> Long.compare(p.optLong("at"), q.optLong("at")));
            int rm = 0;
            while (tot > cap && !old.isEmpty()) { JSONObject o = old.remove(0); tot -= o.optLong("bytes"); l.remove(o); delete(c, o); rm++; }
            if (rm > 0) { JSONArray n = new JSONArray(); for (JSONObject o : l) n.put(o); saveItems(c, n); }
            return rm;
        }
    }
    static void delete(Context c, JSONObject o) {
        new File(dir(c), o.optString("file")).delete();
        new File(thumbDir(c), o.optString("file") + ".jpg").delete();
    }

    // ---------------------------------------------------------------- tâche de fond
    public static class Collecte extends Worker {
        public Collecte(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }
        @NonNull @Override public Result doWork() {
            Context c = getApplicationContext();
            if (!isToile(c)) return Result.success();
            int n = getInputData().getInt("n", -1);
            JSONObject cfg = cfg(c);
            run(c, n > 0 ? n : Math.max(1, Math.min(20, cfg.optInt("n", 3))), n > 0);
            return Result.success();
        }
    }

    static void schedule(Context c) {
        try {
            WorkManager wm = WorkManager.getInstance(c);
            JSONObject o = cfg(c);
            if (!o.optBoolean("auto")) { wm.cancelUniqueWork(WORK); prefs(c).edit().remove("sched").apply(); return; }
            boolean week = "week".equals(o.optString("per"));
            Constraints cs = new Constraints.Builder()
                .setRequiredNetworkType(o.optBoolean("wifi", true) ? NetworkType.UNMETERED : NetworkType.CONNECTED)
                .setRequiresStorageNotLow(true).setRequiresBatteryNotLow(true).build();
            PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(Collecte.class, week ? 7 : 1, TimeUnit.DAYS).setConstraints(cs).build();
            String sig = (week ? "w" : "d") + (o.optBoolean("wifi", true) ? "1" : "0");
            wm.enqueueUniquePeriodicWork(WORK, sig.equals(prefs(c).getString("sched", "")) ? ExistingPeriodicWorkPolicy.KEEP : ExistingPeriodicWorkPolicy.UPDATE, r);
            prefs(c).edit().putString("sched", sig).apply();
        } catch (Throwable t) { }
    }

    // ---------------------------------------------------------------- pont JavaScript
    @JavascriptInterface public String version() { return "1"; }

    @JavascriptInterface public String config() { return ok() ? cfg(a).toString() : "{}"; }

    @JavascriptInterface public void setConfig(String json) {
        if (!ok()) return;
        try { new JSONObject(json); } catch (Exception e) { return; }
        Context c = a.getApplicationContext();
        prefs(c).edit().putString("cfg", json).apply();
        schedule(c);
        WallpaperJob.schedule(c);
    }

    @JavascriptInterface public String keys() {
        JSONObject o = new JSONObject();
        if (!ok()) return "{}";
        JSONObject k = keys(a);
        try { for (String s : new String[]{ "pixabay", "apod" }) o.put(s, mask(k.optString(s))); } catch (Exception e) { }
        return o.toString();
    }

    @JavascriptInterface public void setKey(String src, String key) {
        if (!ok() || !("pixabay".equals(src) || "apod".equals(src))) return;
        String k = key == null ? "" : key.trim();
        if (!k.isEmpty() && !k.matches("^[A-Za-z0-9_-]{8,80}$")) return;
        JSONObject o = keys(a);
        try { if (k.isEmpty()) o.remove(src); else o.put(src, k); } catch (Exception e) { }
        saveKeys(a, o);
    }

    @JavascriptInterface public String items() {
        if (!ok()) return "[]";
        JSONArray a0 = items(a), out = new JSONArray();
        for (int i = 0; i < a0.length(); i++) {
            JSONObject o = a0.optJSONObject(i); if (o == null) continue;
            try { o.put("uri", Uri.fromFile(new File(dir(a), o.optString("file"))).toString()); } catch (Exception e) { }
            out.put(o);
        }
        return out.toString();
    }

    @JavascriptInterface public String thumb(String id) {
        if (!ok()) return "";
        JSONArray l = items(a);
        for (int i = 0; i < l.length(); i++) {
            JSONObject o = l.optJSONObject(i);
            if (o == null || !o.optString("id").equals(id)) continue;
            File t = new File(thumbDir(a), o.optString("file") + ".jpg");
            try { if (t.isFile()) return "data:image/jpeg;base64," + Base64.encodeToString(readFile(t), Base64.NO_WRAP); } catch (Exception e) { }
        }
        return "";
    }

    @JavascriptInterface public void fetchNow(int n) {
        if (!ok()) return;
        int k = Math.max(1, Math.min(30, n));
        Context c = a.getApplicationContext();
        try { JSONObject st = new JSONObject(prefs(c).getString("state", "{}")); st.put("running", true); st.put("started", System.currentTimeMillis()); st.put("queued", true); state(c, st); } catch (Exception e) { }
        Constraints cs = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(Collecte.class).setConstraints(cs).setInputData(new Data.Builder().putInt("n", k).build()).build();
        WorkManager.getInstance(c).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.KEEP, r);
    }

    @JavascriptInterface public String state() {
        if (!ok()) return "{}";
        try {
            JSONObject st = new JSONObject(prefs(a).getString("state", "{}"));
            if (st.optBoolean("running") && !RUNNING.get() && !st.optBoolean("queued")) st.put("running", false);   // processus arrêté pendant une récupération
            if (st.optBoolean("queued") && System.currentTimeMillis() - st.optLong("started") > 15 * 60000L && !RUNNING.get()) st.put("running", false);
            st.put("count", items(a).length());
            st.put("rot", rotationOn(a));
            return st.toString();
        } catch (Exception e) { return "{}"; }
    }

    @JavascriptInterface public void fav(String id, boolean on) {
        if (!ok()) return;
        synchronized (LOCK) {
            JSONArray l = items(a);
            for (int i = 0; i < l.length(); i++) { JSONObject o = l.optJSONObject(i); if (o != null && o.optString("id").equals(id)) try { o.put("fav", on); } catch (Exception e) { } }
            saveItems(a, l);
        }
    }

    @JavascriptInterface public void refuse(String id) {
        if (!ok()) return;
        synchronized (LOCK) {
            JSONArray l = items(a), n = new JSONArray();
            for (int i = 0; i < l.length(); i++) { JSONObject o = l.optJSONObject(i); if (o == null) continue; if (o.optString("id").equals(id)) delete(a, o); else n.put(o); }
            saveItems(a, n);
            try {
                JSONArray r = new JSONArray(prefs(a).getString("refused", "[]")); r.put(id);
                JSONArray s = new JSONArray(prefs(a).getString("seen", "[]")); s.put(id);
                prefs(a).edit().putString("refused", r.toString()).putString("seen", s.toString()).apply();
            } catch (Exception e) { }
        }
    }

    @JavascriptInterface public void report(String id, String page) { refuse(id); openUrl(page); }

    @JavascriptInterface public String current() {
        if (!ok()) return "null";
        try {
            List<String> h = WallpaperJob.history(a);
            if (h.isEmpty()) return "null";
            Uri u = Uri.parse(h.get(h.size() - 1));
            if (ours(a, u)) { JSONObject o = byFile(a, new File(u.getPath()).getName()); if (o != null) return o.toString(); }
            return new JSONObject().put("local", true).put("name", WallpaperJob.name(a, u)).toString();
        } catch (Exception e) { return "null"; }
    }

    @JavascriptInterface public void openUrl(final String url) {
        ui.post(new Runnable() { public void run() {
            try {
                if (url == null || !url.startsWith("https://")) return;
                a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Throwable t) { Toast.makeText(a, "Impossible d'ouvrir le lien", Toast.LENGTH_SHORT).show(); }
        } });
    }
}
