package __PKG__;

// Actualités : pont natif exposé en JavaScript sous window.MAGActualites.
//  - http(clé, url) : lit un flux RSS/Atom (ou la vigilance MeteoAlarm) en https, par Android (sans la règle CORS).
//    Réponse poussée à la page : window.actuHttp(clé, statut, corps, erreur).
//    Seuls les serveurs de flux choisis sont autorisés (liste HOSTS) : ce pont est chargé dans toutes les applis,
//    il ne doit pas servir de relais vers n'importe quelle adresse. Sans cookies, délai d'attente et taille maximale.
//  - openUrl(url) : ouvre la page de l'article (https) dans le navigateur ; share(titre, url) : partage Android.
//  - setup(json) : réglages des alertes ; une tâche de fond (WorkManager, classe Veille) relit les flux « À la une »
//    et la vigilance météo du département, et prévient par une notification (heures calmes, plafond par jour,
//    jamais deux fois le même sujet).
// Le constructeur ne fait rien : aucune connexion tant que la page ou la tâche de fond ne le demande pas.
// Code de requête d'activité : 6510 (autorisation des notifications) ; notifications 6519 à 6529.

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
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
import org.xmlpull.v1.XmlPullParser;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.CookieHandler;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.text.Normalizer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ActualitesBridge {
    // Serveurs des flux publics (médias) et des données publiques (vigilance, découpage administratif)
    static final String[] HOSTS = {
        "www.francetvinfo.fr", "www.franceinfo.fr", "www.lemonde.fr", "www.lefigaro.fr", "www.liberation.fr",
        "www.rfi.fr", "www.france24.com", "www.20minutes.fr", "www.ouest-france.fr", "feeds.leparisien.fr",
        "www.la-croix.com", "fr.euronews.com", "www.euronews.com", "feeds.bbci.co.uk", "www.theguardian.com",
        "www.brut.media", "www.sudouest.fr", "www.ladepeche.fr", "www.nicematin.com", "www.dna.fr", "actu.fr",
        "feeds.meteoalarm.org", "geo.api.gouv.fr"
    };
    static final int MAX = 4 * 1024 * 1024;
    static final String PREFS = "magactu";
    static final String CH_NEWS = "actu_info", CH_VIG = "actu_meteo";
    static final int REQ_NOTIF = 6510, ID_VIG = 6519, ID_NEWS = 6520;
    static final String VIG_URL = "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-france";
    private static ExecutorService NET;

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());

    public ActualitesBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // Cycle de vie (appelé par MainActivity)
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) { if (requestCode == REQ_NOTIF) js("window.actuPerm&&actuPerm()"); }
    public void onResume() { }
    public void onIntent(Intent i) { }

    @JavascriptInterface public String version() { return "1"; }

    // ---------- Réseau ----------
    static boolean allowed(String u) {
        try {
            URL url = new URL(u);
            if (!"https".equals(url.getProtocol())) return false;
            if (url.getUserInfo() != null) return false;
            int p = url.getPort(); if (p != -1 && p != 443) return false;
            String h = url.getHost().toLowerCase(Locale.ROOT);
            for (String x : HOSTS) if (h.equals(x)) return true;
        } catch (Throwable t) { }
        return false;
    }

    private static synchronized ExecutorService net() {
        if (NET == null) NET = Executors.newFixedThreadPool(4);
        return NET;
    }

    // Aucun cookie envoyé ni gardé pour les requêtes de ce pont (les autres requêtes de l'appli ne changent pas)
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

    static Resp get(String u) {
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
                    h.setConnectTimeout(10000); h.setReadTimeout(20000);
                    h.setUseCaches(false);
                    h.setInstanceFollowRedirects(false);
                    h.setRequestProperty("User-Agent", "Actualites/1.0 (Android; lecteur de flux RSS)");
                    h.setRequestProperty("Accept", "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5");
                    h.setRequestProperty("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.6");
                    int code = h.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = h.getHeaderField("Location");
                        if (loc == null) { r.code = code; r.err = "Redirection sans adresse"; return r; }
                        cur = new URL(new URL(cur), loc).toString();
                        continue;
                    }
                    r.code = code; r.type = h.getContentType() == null ? "" : h.getContentType();
                    long len = h.getContentLength();
                    if (len > MAX) { r.err = "Flux trop volumineux"; return r; }
                    InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
                    if (in != null) {
                        try (InputStream s = in) {
                            ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n;
                            while ((n = s.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > MAX) { r.err = "Flux trop volumineux"; return r; } }
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

    // Texte du flux : jeu de caractères de l'en-tête HTTP, sinon du prologue XML, sinon UTF-8 (repli Windows-1252)
    static String decode(byte[] b, String ctype) {
        String cs = null;
        Matcher m = Pattern.compile("charset=\"?([A-Za-z0-9._-]+)", Pattern.CASE_INSENSITIVE).matcher(ctype == null ? "" : ctype);
        if (m.find()) cs = m.group(1);
        if (cs == null) {
            String head = new String(b, 0, Math.min(b.length, 300), Charset.forName("ISO-8859-1"));
            Matcher x = Pattern.compile("<\\?xml[^>]*encoding=[\"']([A-Za-z0-9._-]+)[\"']").matcher(head);
            if (x.find()) cs = x.group(1);
        }
        int off = (b.length >= 3 && (b[0] & 0xff) == 0xEF && (b[1] & 0xff) == 0xBB && (b[2] & 0xff) == 0xBF) ? 3 : 0;
        if (cs != null && !cs.equalsIgnoreCase("utf-8") && !cs.equalsIgnoreCase("utf8")) {
            try { return new String(b, off, b.length - off, Charset.forName(cs)); } catch (Throwable t) { }
        }
        try {
            return Charset.forName("UTF-8").newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(b, off, b.length - off)).toString();
        } catch (CharacterCodingException e) {
            return new String(b, off, b.length - off, Charset.forName("windows-1252"));
        }
    }

    @JavascriptInterface public void http(final String key, final String url) {
        if (!allowed(url)) { deliver(key, 0, "", "Adresse non autorisée"); return; }
        net().execute(new Runnable() { public void run() {
            Resp r = get(url);
            deliver(key, r.code, r.body.length > 0 ? decode(r.body, r.type) : "", r.err);
        } });
    }

    private void deliver(String key, int code, String body, String err) {
        js("window.actuHttp&&actuHttp(" + JSONObject.quote(key) + "," + code + "," + JSONObject.quote(body == null ? "" : body) + "," + JSONObject.quote(err == null ? "" : err) + ")");
    }
    private void js(final String s) { ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript(s, null); } catch (Throwable t) { } } }); }

    @JavascriptInterface public void openUrl(final String url) {
        ui.post(new Runnable() { public void run() {
            try {
                if (url == null || !url.startsWith("https://")) return;
                a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Throwable t) { Toast.makeText(a, "Impossible d'ouvrir le lien", Toast.LENGTH_SHORT).show(); }
        } });
    }

    @JavascriptInterface public void share(final String title, final String url) {
        ui.post(new Runnable() { public void run() {
            try {
                Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, title == null ? "" : title);
                i.putExtra(Intent.EXTRA_TEXT, (title == null ? "" : title + "\n") + (url == null ? "" : url));
                a.startActivity(Intent.createChooser(i, "Partager l'article"));
            } catch (Throwable t) { Toast.makeText(a, "Partage impossible", Toast.LENGTH_SHORT).show(); }
        } });
    }

    // ---------- Notifications ----------
    static boolean canNotify(Context c) {
        return Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }
    @JavascriptInterface public boolean notifAllowed() { return canNotify(a); }
    @JavascriptInterface public void askNotif() {
        ui.post(new Runnable() { public void run() {
            if (!canNotify(a)) ActivityCompat.requestPermissions(a, new String[]{ Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIF);
        } });
    }
    @JavascriptInterface public void notifSettings() {
        ui.post(new Runnable() { public void run() {
            try {
                Intent i = Build.VERSION.SDK_INT >= 26 ? new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, a.getPackageName())
                    : new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()));
                a.startActivity(i);
            } catch (Throwable t) { }
        } });
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel n = new NotificationChannel(CH_NEWS, "Infos importantes", NotificationManager.IMPORTANCE_HIGH);
            n.setDescription("Sujet repris par plusieurs grands médias, ou titre marqué « Alerte » / « Urgent »");
            nm.createNotificationChannel(n);
            NotificationChannel v = new NotificationChannel(CH_VIG, "Vigilance météo", NotificationManager.IMPORTANCE_HIGH);
            v.setDescription("Vigilance orange ou rouge (jaune en option) pour votre département");
            nm.createNotificationChannel(v);
        }
    }

    static void post(Context c, String ch, int id, String title, String text, String socle) {
        try {
            channels(c);
            if (!canNotify(c)) return;
            Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (i == null) return;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (socle != null) i.putExtra("socle", socle);
            PendingIntent pi = PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, ch)
                .setSmallIcon(c.getApplicationInfo().icon)
                .setContentTitle(title).setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
                .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(pi);
            NotificationManagerCompat.from(c).notify(id, b.build());
        } catch (Throwable t) { }
    }

    @JavascriptInterface public void testNotif() {
        final Context c = a.getApplicationContext();
        post(c, CH_NEWS, ID_NEWS + 9, "Actualités : notification d'essai", "Les alertes arriveront comme ceci. Touchez pour ouvrir L'essentiel.", "{\"tab\":\"essentiel\"}");
    }

    // ---------- Tâche de fond ----------
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /* Réglages envoyés par la page :
       {on, every (min), quietOn, qFrom, qTo, maxDay, minSrc, winH, markers:[..], feeds:[{u, m, n}],
        vigOn, vigYellow, vigNight, dept:{code, name}} */
    @JavascriptInterface public boolean setup(String json) { boolean r = setup(a.getApplicationContext(), json); if (r) askNotif(); return r; }

    static boolean setup(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            prefs(c).edit().putString("cfg", o.toString()).apply();
            boolean news = o.optBoolean("on", true), vig = o.optBoolean("vigOn", true) && o.optJSONObject("dept") != null;
            WorkManager wm = WorkManager.getInstance(c);
            if (news || vig) {
                int every = Math.max(15, Math.min(180, o.optInt("every", 30)));
                Constraints cs = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
                PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(Veille.class, every, TimeUnit.MINUTES).setConstraints(cs).build();
                int old = prefs(c).getInt("every", -1);
                wm.enqueueUniquePeriodicWork("magactu", old == every ? ExistingPeriodicWorkPolicy.KEEP : ExistingPeriodicWorkPolicy.UPDATE, r);
                prefs(c).edit().putInt("every", every).apply();
                return true;
            }
            wm.cancelUniqueWork("magactu");
            prefs(c).edit().remove("every").apply();
            return false;
        } catch (Throwable t) { return false; }
    }

    @JavascriptInterface public void runNow() {
        Constraints cs = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(Veille.class).setConstraints(cs).build();
        WorkManager.getInstance(a.getApplicationContext()).enqueueUniqueWork("magactu-now", ExistingWorkPolicy.REPLACE, r);
    }

    // État de la dernière vérification (pour l'écran Réglages) : {at, feeds, ok, notifs, day, vig, err}
    @JavascriptInterface public String state() { return prefs(a).getString("state", "{}"); }
    // Sujets déjà signalés (pour ne pas les montrer comme nouveaux)
    @JavascriptInterface public String notified() { return prefs(a).getString("topics", "[]"); }
    @JavascriptInterface public void resetNotified() { prefs(a).edit().remove("topics").remove("links").remove("vigKey").apply(); }

    // ---------- Analyse des flux (tâche de fond) ----------
    static class Item { String title = "", link = "", src = "", srcName = ""; long ts; Map<String, String> f = new HashMap<String, String>(); Set<String> tok; }

    static final Pattern TAG = Pattern.compile("<[^>]+>");
    static String clean(String s) {
        if (s == null) return "";
        s = TAG.matcher(s).replaceAll(" ");
        s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&rsquo;", "’").replace("&laquo;", "«").replace("&raquo;", "»")
            .replace("&eacute;", "é").replace("&egrave;", "è").replace("&ecirc;", "ê").replace("&agrave;", "à").replace("&acirc;", "â").replace("&ccedil;", "ç").replace("&ocirc;", "ô").replace("&icirc;", "î").replace("&ugrave;", "ù").replace("&Eacute;", "É").replace("&hellip;", "…").replace("&ndash;", "–").replace("&mdash;", "—").replace("&lsquo;", "‘").replace("&ldquo;", "“").replace("&rdquo;", "”");
        Matcher m = Pattern.compile("&#(x?)([0-9a-fA-F]+);").matcher(s); StringBuffer sb = new StringBuffer();
        while (m.find()) { int cp; try { cp = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16); } catch (Exception e) { cp = 32; } m.appendReplacement(sb, Matcher.quoteReplacement(new String(Character.toChars(cp)))); }
        m.appendTail(sb);
        return sb.toString().replaceAll("\\s+", " ").trim();
    }

    static List<Item> parse(byte[] body) {
        List<Item> out = new ArrayList<Item>();
        try {
            XmlPullParser p = android.util.Xml.newPullParser();
            p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false);
            try { p.setFeature("http://xmlpull.org/v1/doc/features.html#relaxed", true); } catch (Throwable t) { }
            p.setInput(new ByteArrayInputStream(body), null);
            Item cur = null; String field = null; StringBuilder txt = new StringBuilder(); int depth = 0, itemDepth = -1;
            for (int ev = p.getEventType(); ev != XmlPullParser.END_DOCUMENT; ev = p.next()) {
                if (ev == XmlPullParser.START_TAG) {
                    depth++;
                    String n = p.getName();
                    if (cur == null && ("item".equals(n) || "entry".equals(n))) { cur = new Item(); itemDepth = depth; }
                    else if (cur != null) {
                        field = n; txt.setLength(0);
                        if ("link".equals(n)) { String href = p.getAttributeValue(null, "href"), rel = p.getAttributeValue(null, "rel"); if (href != null && (rel == null || "alternate".equals(rel)) && cur.link.isEmpty()) cur.link = href; }
                    }
                } else if (ev == XmlPullParser.TEXT || ev == XmlPullParser.CDSECT) {
                    if (cur != null && field != null) txt.append(p.getText());
                } else if (ev == XmlPullParser.END_TAG) {
                    String n = p.getName();
                    if (cur != null && depth == itemDepth) {
                        finish(cur); if (!cur.title.isEmpty()) out.add(cur); cur = null; itemDepth = -1;
                    } else if (cur != null && field != null) {
                        String v = txt.toString().trim();
                        if (!v.isEmpty()) {
                            if (!cur.f.containsKey(n)) cur.f.put(n, v);
                            if ("value".equals(n)) cur.f.put("geocodes", (cur.f.containsKey("geocodes") ? cur.f.get("geocodes") + " " : "") + v);
                        }
                        txt.setLength(0); field = null;
                    }
                    depth--;
                }
            }
        } catch (Throwable t) {
            // Flux mal formé : extraction simple des éléments <item>/<entry>
            if (out.isEmpty()) {
                String s = new String(body, Charset.forName("UTF-8"));
                Matcher m = Pattern.compile("<(item|entry)[\\s>][\\s\\S]*?</\\1>").matcher(s);
                while (m.find()) {
                    Item it = new Item(); String b = m.group();
                    for (String k : new String[]{ "title", "link", "pubDate", "published", "updated", "dc:date", "guid", "id" }) {
                        Matcher x = Pattern.compile("<" + k + "[^>]*>([\\s\\S]*?)</" + k + ">").matcher(b);
                        if (x.find()) it.f.put(k, x.group(1).replace("<![CDATA[", "").replace("]]>", "").trim());
                    }
                    Matcher l = Pattern.compile("<link[^>]*href=[\"']([^\"']+)").matcher(b); if (l.find()) it.link = l.group(1);
                    finish(it); if (!it.title.isEmpty()) out.add(it);
                }
            }
        }
        return out;
    }
    static void finish(Item it) {
        it.title = clean(it.f.get("title"));
        if (it.link.isEmpty()) it.link = clean(it.f.containsKey("link") ? it.f.get("link") : it.f.containsKey("guid") ? it.f.get("guid") : "");
        String d = it.f.containsKey("pubDate") ? it.f.get("pubDate") : it.f.containsKey("published") ? it.f.get("published") : it.f.containsKey("dc:date") ? it.f.get("dc:date") : it.f.get("updated");
        it.ts = date(d);
    }

    static final String[] MON = { "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec" };
    static final Pattern ISO = Pattern.compile("(\\d{4})-(\\d{2})-(\\d{2})(?:[T ](\\d{2}):(\\d{2})(?::(\\d{2}))?(?:\\.\\d+)?)?\\s*(Z|[+-]\\d{2}:?\\d{2})?");
    static final Pattern RFC = Pattern.compile("(\\d{1,2})\\s+([A-Za-zéû]{3,})\\.?\\s+(\\d{2,4})\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*([A-Za-z]{1,5}|[+-]\\d{4})?");
    static long date(String s) {
        if (s == null) return 0;
        s = s.trim();
        try {
            Matcher m = ISO.matcher(s);
            if (m.find() && m.start() == 0) {
                Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC")); c.clear();
                c.set(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)) - 1, Integer.parseInt(m.group(3)),
                    m.group(4) == null ? 0 : Integer.parseInt(m.group(4)), m.group(5) == null ? 0 : Integer.parseInt(m.group(5)), m.group(6) == null ? 0 : Integer.parseInt(m.group(6)));
                long t = c.getTimeInMillis();
                String z = m.group(7);
                if (z == null) t -= TimeZone.getTimeZone("Europe/Paris").getOffset(t);
                else if (!"Z".equals(z)) { String zz = z.replace(":", ""); int sg = zz.charAt(0) == '-' ? -1 : 1; t -= sg * (Integer.parseInt(zz.substring(1, 3)) * 3600000L + Integer.parseInt(zz.substring(3, 5)) * 60000L); }
                return t;
            }
            m = RFC.matcher(s);
            if (m.find()) {
                String mo = m.group(2).toLowerCase(Locale.ROOT).substring(0, 3); int mi = -1;
                for (int i = 0; i < 12; i++) if (MON[i].equals(mo)) mi = i;
                if (mi < 0) { String[] fr = { "jan", "fév", "mar", "avr", "mai", "jui", "jui", "aoû", "sep", "oct", "nov", "déc" }; for (int i = 0; i < 12; i++) if (fr[i].equals(mo)) { mi = i; break; } }
                if (mi < 0) return 0;
                int y = Integer.parseInt(m.group(3)); if (y < 100) y += 2000;
                Calendar c = Calendar.getInstance(TimeZone.getTimeZone("UTC")); c.clear();
                c.set(y, mi, Integer.parseInt(m.group(1)), Integer.parseInt(m.group(4)), Integer.parseInt(m.group(5)), m.group(6) == null ? 0 : Integer.parseInt(m.group(6)));
                long t = c.getTimeInMillis(); String z = m.group(7);
                if (z != null && (z.startsWith("+") || z.startsWith("-"))) { int sg = z.charAt(0) == '-' ? -1 : 1; t -= sg * (Integer.parseInt(z.substring(1, 3)) * 3600000L + Integer.parseInt(z.substring(3, 5)) * 60000L); }
                else if (z != null) {
                    String Z = z.toUpperCase(Locale.ROOT); int h = 0;
                    if (Z.equals("EST")) h = -5; else if (Z.equals("EDT")) h = -4; else if (Z.equals("CST")) h = -6; else if (Z.equals("CDT")) h = -5;
                    else if (Z.equals("MST")) h = -7; else if (Z.equals("MDT")) h = -6; else if (Z.equals("PST")) h = -8; else if (Z.equals("PDT")) h = -7;
                    else if (Z.equals("CET")) h = 1; else if (Z.equals("CEST")) h = 2; else if (Z.equals("BST")) h = 1;
                    t -= h * 3600000L;
                } else t -= TimeZone.getTimeZone("Europe/Paris").getOffset(t);
                return t;
            }
        } catch (Throwable e) { }
        return 0;
    }

    // ---------- Sujets : mots-clés des titres (même méthode que la page) ----------
    static final Set<String> STOP = new HashSet<String>();
    static {
        String w = "les des une un le la du de au aux et ou en dans sur sous par pour pas plus moins avec sans chez entre vers apres avant depuis pendant contre selon "
            + "est sont ete etre avoir fait faire font dit dire va vont peut doit cette ces ses son sa leur leurs nos notre votre vos qui que quoi dont quand comme mais donc car "
            + "tout tous toute toutes tres aussi encore deja ici elle elles ils lui eux nous vous on se ce cela ca quel quelle quels quelles "
            + "the and for with from that this are was were has have had will would into over after about than they their there what when where who why how not but its his her "
            + "new says said say video photos photo direct live alerte urgent breaking info infos actu actualite actualites france24 franceinfo lemonde figaro "
            + "nouveau nouvelle nouveaux nouvelles premier premiere deux trois ans annee jour jours mois semaine heure heures hier demain aujourd aujourdhui "
            + "veut veulent face ainsi enfin bien fois autre autres meme memes faut fin pourquoi comment voici quoi pres lors";
        for (String x : w.split("\\s+")) STOP.add(x);
    }
    // Quelques mots anglais courants de l'actualité ramenés au français (BBC, Guardian… rapprochés des médias français)
    static final Map<String, String> SYN = new HashMap<String, String>();
    static { String[] p = "japan:japon,earthquake:seisme,quake:seisme,china:chine,russia:russie,russian:russe,germany:allemagne,german:allemand,spain:espagne,italy:italie,mexico:mexique,brazil:bresil,india:inde,turkey:turquie,egypt:egypte,syria:syrie,lebanon:liban,jordan:jordanie,morocco:maroc,algeria:algerie,tunisia:tunisie,belgium:belgique,switzerland:suisse,greece:grece,poland:pologne,american:americain,america:amerique,african:africain,africa:afrique,europe:europe,european:europeen,flood:inondation,storm:tempete,hurricane:ouragan,typhoon:typhon,wildfire:incendie,war:guerre,ceasefire:cessez,attack:attaque,hostage:otage,minister:ministre,government:gouvernement,pope:pape,election:election,vote:vote,president:president,parliament:parlement,police:police,eruption:eruption,volcano:volcan,crash:accident,plane:avion,missile:missile,drone:drone,nuclear:nucleaire,climate:climat,summit:sommet,trade:commerce,tariff:droit,tariffs:droit".split(","); for (String x : p) { String[] kv = x.split(":"); SYN.put(kv[0], kv[1]); } }
    static Set<String> tokens(String s) {
        Set<String> r = new HashSet<String>();
        if (s == null) return r;
        String n = Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        for (String t : n.split("[^a-z0-9]+")) {
            if (t.length() < 3 || STOP.contains(t)) continue;
            if (t.length() > 4 && (t.endsWith("s") || t.endsWith("x"))) t = t.substring(0, t.length() - 1);
            if (SYN.containsKey(t)) t = SYN.get(t);
            if (t.matches("\\d+") && t.length() < 4) continue;
            r.add(t);
        }
        return r;
    }
    static double w(Map<String, Integer> df, int N, String t) { Integer d = df.get(t); return Math.log(1.0 + N / (double) (d == null ? 1 : d)); }
    static boolean same(Set<String> a, Set<String> b, Map<String, Integer> df, int N) {
        int inter = 0; double wi = 0, wa = 0, wb = 0;
        for (String t : a) { double x = df == null ? 1 : w(df, N, t); wa += x; if (b.contains(t)) { inter++; wi += x; } }
        for (String t : b) wb += df == null ? 1 : w(df, N, t);
        if (inter < 2) return false;
        if (inter >= 3 && inter / (double) Math.min(a.size(), b.size()) >= 0.5) return true;
        double m = Math.min(wa, wb);
        return m > 0 && wi / m >= 0.45;
    }

    // ---------- Vigilance : MeteoAlarm (données Météo-France) ----------
    static int level(Map<String, String> f, String title) {
        String al = (f.containsKey("awareness_level") ? f.get("awareness_level") : "") + " " + title + " " + (f.containsKey("cap:event") ? f.get("cap:event") : "");
        String s = al.toLowerCase(Locale.ROOT);
        Matcher m = Pattern.compile("(\\d)\\s*;\\s*(green|yellow|orange|red)").matcher(s);
        if (m.find()) return Integer.parseInt(m.group(1));
        String sev = f.containsKey("cap:severity") ? f.get("cap:severity").toLowerCase(Locale.ROOT) : "";
        if (sev.contains("extreme")) return 4;
        if (sev.contains("severe")) return 3;
        if (sev.contains("moderate")) return 2;
        if (s.contains("rouge") || s.contains(" red")) return 4;
        if (s.contains("orange")) return 3;
        if (s.contains("jaune") || s.contains("yellow")) return 2;
        return 1;
    }
    static String phen(String e) {
        String s = e == null ? "" : Normalizer.normalize(e.toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        if (s.contains("thunder") || s.contains("orage")) return "orages";
        if (s.contains("avalanch")) return "avalanches";
        if (s.contains("rain") || s.contains("pluie")) return "pluie-inondation";
        if (s.contains("flood") || s.contains("crue")) return "crues";
        if (s.contains("snow") || s.contains("ice") || s.contains("neige") || s.contains("verglas")) return "neige-verglas";
        if (s.contains("coast") || s.contains("wave") || s.contains("vague") || s.contains("submersion")) return "vagues-submersion";
        if (s.contains("wind") || s.contains("vent")) return "vent violent";
        if (s.contains("high-temp") || s.contains("high temp") || s.contains("heat") || s.contains("canicule") || s.contains("chaleur")) return "canicule";
        if (s.contains("low-temp") || s.contains("low temp") || s.contains("cold") || s.contains("froid")) return "grand froid";
        if (s.contains("fire") || s.contains("feu")) return "feux de forêt";
        if (s.contains("fog") || s.contains("brouillard")) return "brouillard";
        return e == null ? "phénomène" : e;
    }
    static String norm(String s) {
        return s == null ? "" : Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}+", "").replaceAll("[^a-z0-9]+", " ").trim();
    }
    static String deptGeo(String code) { // MeteoAlarm EMMA_ID : FR + n° de département sur 3 caractères (FR013, FR02A…)
        String c = code.length() == 1 ? "00" + code : code.length() == 2 ? "0" + code : code;
        return "FR" + c;
    }

    // ---------- Décision des alertes (fonctions pures, testables hors Android) ----------
    static class Cfg {
        boolean on = true, quietOn = true, vigOn = true, vigYellow = false, vigNight = true;
        int qFrom = 22, qTo = 7, maxDay = 5, minSrc = 3; double winH = 2;
        List<String> markers = new ArrayList<String>();
        static Cfg of(JSONObject o) {
            Cfg c = new Cfg();
            c.on = o.optBoolean("on", true); c.quietOn = o.optBoolean("quietOn", true); c.vigOn = o.optBoolean("vigOn", true);
            c.vigYellow = o.optBoolean("vigYellow", false); c.vigNight = o.optBoolean("vigNight", true);
            c.qFrom = o.optInt("qFrom", 22); c.qTo = o.optInt("qTo", 7); c.maxDay = o.optInt("maxDay", 5);
            c.minSrc = Math.max(2, o.optInt("minSrc", 3)); c.winH = Math.max(0.5, o.optDouble("winH", 2));
            JSONArray m = o.optJSONArray("markers");
            if (m != null) for (int i = 0; i < m.length(); i++) { String s = m.optString(i).trim(); if (s.length() >= 3) c.markers.add(s); }
            return c;
        }
    }
    static class Seen { Set<String> tok = new HashSet<String>(); long at; String t = ""; }
    static class Notif { String title, text, subject, link; boolean multi; Set<String> tok; }

    static boolean quietAt(Cfg c, int hour) {
        if (!c.quietOn || c.qFrom == c.qTo) return false;
        return c.qFrom < c.qTo ? (hour >= c.qFrom && hour < c.qTo) : (hour >= c.qFrom || hour < c.qTo);
    }

    // Regroupement par sujet : mots-clés des titres pondérés par leur rareté (même méthode que la page)
    static List<List<Item>> cluster(List<Item> all, long now) {
        Map<String, Integer> df = new HashMap<String, Integer>();
        for (Item it : all) { if (it.tok == null) it.tok = tokens(it.title); for (String t : it.tok) df.put(t, df.containsKey(t) ? df.get(t) + 1 : 1); }
        int N = Math.max(1, all.size());
        List<List<Item>> cl = new ArrayList<List<Item>>();
        for (Item it : all) {
            List<Item> best = null;
            if (it.tok.size() >= 2) {
                for (List<Item> l : cl) { for (Item o : l) if (same(it.tok, o.tok, df, N)) { best = l; break; } if (best != null) break; }
            }
            if (best == null) { best = new ArrayList<Item>(); cl.add(best); }
            best.add(it);
        }
        final Map<List<Item>, Double> score = new java.util.IdentityHashMap<List<Item>, Double>();
        for (List<Item> l : cl) {
            Set<String> s = new HashSet<String>(); long newest = 0; for (Item o : l) { s.add(o.src); newest = Math.max(newest, o.ts); }
            double age = newest > 0 ? (now - newest) / 3600000.0 : 12;
            score.put(l, Math.pow(s.size(), 1.6) * Math.exp(-Math.max(0, age) / 10.0));
        }
        Collections.sort(cl, new java.util.Comparator<List<Item>>() { public int compare(List<Item> x, List<Item> y) { return Double.compare(score.get(y), score.get(x)); } });
        return cl;
    }

    static Pattern marker(String m) { return Pattern.compile("(^|[^\\p{L}])" + Pattern.quote(m) + "($|[^\\p{L}])", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE); }

    /* Alertes à envoyer maintenant. Règles :
       - sujet repris par au moins minSrc médias différents dans les winH dernières heures ;
       - ou titre de moins de 90 min contenant un marqueur d'alerte (« ALERTE », « URGENT »…) ;
       - jamais pendant les heures calmes, au plus maxDay par jour, jamais deux fois le même sujet (72 h).
       seen et links sont mis à jour pour les sujets retenus. */
    static List<Notif> decide(List<List<Item>> cl, Cfg cfg, List<Seen> seen, Set<String> links, int countToday, long now, boolean quiet) {
        List<Notif> out = new ArrayList<Notif>();
        if (!cfg.on || quiet) return out;
        List<Pattern> marks = new ArrayList<Pattern>(); for (String m : cfg.markers) marks.add(marker(m));
        int count = countToday;
        for (List<Item> l : cl) {
            if (count >= cfg.maxDay) break;
            Set<String> srcs = new HashSet<String>(); Set<String> names = new java.util.LinkedHashSet<String>(); Item lead = null, markItem = null;
            for (Item o : l) {
                if (o.ts > 0 && now - o.ts <= cfg.winH * 3600000L && now - o.ts >= -600000L) { srcs.add(o.src); names.add(o.srcName); if (lead == null) lead = o; }
                if (markItem == null && !marks.isEmpty() && o.ts > 0 && now - o.ts <= 90 * 60000L) for (Pattern p : marks) if (p.matcher(o.title).find()) { markItem = o; break; }
            }
            boolean multi = srcs.size() >= cfg.minSrc;
            if (!multi && markItem == null) continue;
            Item it = multi ? lead : markItem;
            Set<String> tk = new HashSet<String>(); for (Item o : l) tk.addAll(o.tok);
            boolean dup = it.link != null && !it.link.isEmpty() && links.contains(it.link);
            for (Seen s : seen) { if (dup) break; if (same(it.tok, s.tok, null, 0) || (same(tk, s.tok, null, 0) && overlap(tk, s.tok) >= 0.6)) dup = true; }
            if (dup) continue;
            Notif n = new Notif(); n.multi = multi; n.subject = it.title; n.link = it.link; n.tok = it.tok;
            n.title = (multi ? "📰 " : "🔴 ") + it.title;
            StringBuilder txt = new StringBuilder();
            if (multi) { txt.append("Repris par ").append(srcs.size()).append(" médias : "); int k = 0; for (String nm : names) { if (k++ > 0) txt.append(", "); txt.append(nm); if (k >= 5) break; } }
            else txt.append(it.srcName).append(" · titre marqué comme alerte");
            n.text = txt.toString();
            out.add(n);
            Seen s = new Seen(); s.tok = new HashSet<String>(it.tok); s.at = now; s.t = it.title; seen.add(s);
            if (it.link != null && !it.link.isEmpty()) links.add(it.link);
            count++;
        }
        return out;
    }

    // Vigilance d'un département dans le flux MeteoAlarm : niveau maximal, phénomènes, période
    static class Vig { int lvl; Map<String, Integer> ph = new java.util.TreeMap<String, Integer>(); long from, to; String key() { StringBuilder k = new StringBuilder(String.valueOf(lvl)); for (Map.Entry<String, Integer> e : ph.entrySet()) k.append('|').append(e.getKey()).append(e.getValue()); return k.toString(); } }
    static Vig vigilance(List<Item> entries, String code, String name, long now) {
        Vig v = new Vig(); String dn = norm(name), geo = deptGeo(code);
        for (Item it : entries) {
            String area = norm(it.f.get("cap:areaDesc")), gc = it.f.containsKey("geocodes") ? it.f.get("geocodes") : "";
            if (!(area.equals(dn) || (" " + gc + " ").contains(" " + geo + " "))) continue;
            String mt = it.f.containsKey("cap:message_type") ? it.f.get("cap:message_type") : it.f.containsKey("cap:msgType") ? it.f.get("cap:msgType") : "";
            if (mt.toLowerCase(Locale.ROOT).contains("cancel")) continue;
            long ex = date(it.f.get("cap:expires")); if (ex > 0 && ex < now) continue;
            int lv = level(it.f, it.title); if (lv < 2) continue;
            String p = phen(it.f.containsKey("cap:event") ? it.f.get("cap:event") : it.title);
            if (!v.ph.containsKey(p) || v.ph.get(p) < lv) v.ph.put(p, lv);
            v.lvl = Math.max(v.lvl, lv);
            long on = date(it.f.containsKey("cap:onset") ? it.f.get("cap:onset") : it.f.get("cap:effective"));
            if (on > 0 && (v.from == 0 || on < v.from)) v.from = on;
            if (ex > v.to) v.to = ex;
        }
        return v;
    }

    public static class Veille extends Worker {
        public Veille(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

        @NonNull @Override public Result doWork() {
            Context c = getApplicationContext(); SharedPreferences sp = prefs(c);
            JSONObject st = new JSONObject();
            try {
                JSONObject cj = new JSONObject(sp.getString("cfg", "{}"));
                Cfg cfg = Cfg.of(cj);
                long now = System.currentTimeMillis();
                Calendar cal = Calendar.getInstance();
                String day = new SimpleDateFormat("yyyyMMdd", Locale.ROOT).format(cal.getTime());
                boolean quiet = quietAt(cfg, cal.get(Calendar.HOUR_OF_DAY));
                if (!day.equals(sp.getString("day", ""))) sp.edit().putString("day", day).putInt("count", 0).apply();
                int count = sp.getInt("count", 0);
                st.put("at", now); st.put("quiet", quiet);

                // 1) Vigilance météo du département
                JSONObject vigOut = null;
                JSONObject dept = cj.optJSONObject("dept");
                if (cfg.vigOn && dept != null) {
                    Resp r = get(VIG_URL);
                    if (r.code == 200) {
                        Vig v = vigilance(parse(r.body), dept.optString("code"), dept.optString("name"), now);
                        vigOut = new JSONObject(); vigOut.put("lvl", v.lvl); vigOut.put("dept", dept.optString("name")); vigOut.put("code", dept.optString("code"));
                        JSONArray pa = new JSONArray(); StringBuilder txt = new StringBuilder();
                        for (Map.Entry<String, Integer> e : v.ph.entrySet()) { pa.put(new JSONObject().put("p", e.getKey()).put("lvl", e.getValue())); if (txt.length() > 0) txt.append(", "); txt.append(e.getKey()); }
                        vigOut.put("ph", pa); vigOut.put("from", v.from); vigOut.put("to", v.to); vigOut.put("at", now);
                        st.put("vig", vigOut);
                        int minLv = cfg.vigYellow ? 2 : 3;
                        String old = sp.getString("vigKey", ""), key = v.key();
                        if (v.lvl >= minLv && !key.equals(old)) {
                            boolean hold = quiet && !(v.lvl >= 4 && cfg.vigNight);
                            if (!hold) {
                                String col = v.lvl >= 4 ? "rouge" : v.lvl == 3 ? "orange" : "jaune";
                                String ic = v.lvl >= 4 ? "🔴" : v.lvl == 3 ? "🟠" : "🟡";
                                post(c, CH_VIG, ID_VIG, ic + " Vigilance " + col + " : " + dept.optString("name"), cap(txt.toString()) + period(v.from, v.to) + ". Consignes sur vigilance.meteofrance.fr", "{\"tab\":\"meteo\"}");
                                sp.edit().putString("vigKey", key).apply();
                            }
                        } else if (v.lvl < minLv && old.length() > 0) sp.edit().putString("vigKey", "").apply();
                    } else st.put("vigErr", r.err.isEmpty() ? "HTTP " + r.code : r.err);
                }

                // 2) Infos importantes : flux « À la une » des grands médias
                JSONArray feeds = cj.optJSONArray("feeds");
                List<Item> all = new ArrayList<Item>(); int ok = 0;
                if (feeds != null) {
                    for (int i = 0; i < feeds.length() && i < 16; i++) {
                        JSONObject fd = feeds.optJSONObject(i); if (fd == null) continue;
                        Resp r = get(fd.optString("u")); if (r.code != 200) continue; ok++;
                        int n = 0;
                        for (Item it : parse(r.body)) {
                            if (n++ >= 40) break;
                            if (it.ts > now) it.ts = now;
                            if (it.ts > 0 && now - it.ts > 36 * 3600000L) continue;
                            it.src = fd.optString("m"); it.srcName = fd.optString("n", it.src); it.tok = tokens(it.title);
                            all.add(it);
                        }
                    }
                }
                st.put("feeds", feeds == null ? 0 : feeds.length()); st.put("ok", ok); st.put("items", all.size());
                List<List<Item>> cl = cluster(all, now);

                List<Seen> seen = new ArrayList<Seen>(); JSONArray sa = new JSONArray(sp.getString("topics", "[]"));
                for (int i = 0; i < sa.length(); i++) {
                    JSONObject o = sa.optJSONObject(i); if (o == null || now - o.optLong("at") > 72 * 3600000L) continue;
                    Seen s = new Seen(); s.at = o.optLong("at"); s.t = o.optString("t"); JSONArray ta = o.optJSONArray("tok");
                    if (ta != null) for (int j = 0; j < ta.length(); j++) s.tok.add(ta.optString(j));
                    seen.add(s);
                }
                Set<String> links = new java.util.LinkedHashSet<String>(); JSONArray la = new JSONArray(sp.getString("links", "[]"));
                for (int i = 0; i < la.length(); i++) links.add(la.optString(i));
                List<Notif> ns = decide(cl, cfg, seen, links, count, now, quiet);
                for (Notif n : ns) { post(c, CH_NEWS, ID_NEWS + (count % 9), n.title, n.text, new JSONObject().put("sujet", n.subject).toString()); count++; }
                JSONArray so = new JSONArray();
                for (Seen s : seen) { JSONArray ta = new JSONArray(); for (String t : s.tok) ta.put(t); so.put(new JSONObject().put("tok", ta).put("at", s.at).put("t", s.t)); }
                List<String> ll = new ArrayList<String>(links); JSONArray lo = new JSONArray();
                for (int i = Math.max(0, ll.size() - 300); i < ll.size(); i++) lo.put(ll.get(i));
                sp.edit().putString("topics", so.toString()).putString("links", lo.toString()).putInt("count", count).apply();
                st.put("sent", ns.size()); st.put("count", count); st.put("maxDay", cfg.maxDay);

                // 3) Tuile Socle : 3 sujets et la vigilance
                if (!cl.isEmpty() || vigOut != null) {
                    JSONObject wd = new JSONObject(); JSONArray tp = new JSONArray();
                    for (List<Item> l : cl) {
                        if (tp.length() >= 3) break;
                        Set<String> s = new HashSet<String>(); for (Item o : l) s.add(o.src);
                        Item lead = l.get(0);
                        tp.put(new JSONObject().put("t", lead.title).put("n", s.size()).put("src", lead.srcName).put("at", lead.ts));
                    }
                    JSONObject prev = null;
                    try { prev = new JSONObject(c.getSharedPreferences("socle_widget", Context.MODE_PRIVATE).getString("data", "{}")); } catch (Throwable t) { }
                    if (tp.length() > 0) wd.put("top", tp); else if (prev != null && prev.has("top")) wd.put("top", prev.get("top"));
                    if (vigOut != null) wd.put("vig", vigOut); else if (prev != null && prev.has("vig")) wd.put("vig", prev.get("vig"));
                    wd.put("by", "fond"); wd.put("t", now);
                    WidgetProvider.put(c, wd.toString());
                }
            } catch (Throwable t) {
                try { st.put("err", String.valueOf(t.getMessage())); } catch (Throwable e) { }
            }
            sp.edit().putString("state", st.toString()).apply();
            return Result.success();
        }
    }
    static double overlap(Set<String> a, Set<String> b) { int i = 0; for (String t : a) if (b.contains(t)) i++; int m = Math.min(a.size(), b.size()); return m == 0 ? 0 : i / (double) m; }
    static String cap(String s) { return s == null || s.isEmpty() ? "Phénomène" : Character.toUpperCase(s.charAt(0)) + s.substring(1); }
    static String period(long from, long to) {
        SimpleDateFormat f = new SimpleDateFormat("EEE d 'à' H 'h'", Locale.FRANCE);
        if (from > 0 && to > 0) return " du " + f.format(new java.util.Date(from)) + " au " + f.format(new java.util.Date(to));
        if (to > 0) return " jusqu'au " + f.format(new java.util.Date(to));
        return "";
    }
}
