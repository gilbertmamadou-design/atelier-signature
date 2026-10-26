package __PKG__;

// Solaire : pont natif minimal, exposé en JavaScript sous window.MAGSolaire.
//  - http(clé, url, base64) : requête GET faite par Android (sans la règle CORS du navigateur).
//    Sert surtout à PVGIS (Commission européenne), dont l'API refuse les appels depuis une page web,
//    et de repli pour les services de l'IGN si le réseau ou le navigateur bloque l'appel direct.
//    Réponse poussée à la page : window.solaireHttp(clé, statut, corps, erreur)
//    (corps en base64 si base64 = true : tuiles de la vue aérienne).
//    Seuls quelques serveurs publics sont autorisés (liste HOSTS), en https : ce pont est chargé
//    dans toutes les applis, il ne doit pas servir de relais vers n'importe quelle adresse.
//  - openUrl(url) : ouvre un lien https (Légifrance, service-public…) dans le navigateur.
// Le constructeur ne fait rien : aucune connexion tant que la page ne le demande pas.
// Aucun code de requête d'activité utilisé (plage réservée 6500–6509 si besoin plus tard).

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SolaireBridge {
    private static final String[] HOSTS = {
        "re.jrc.ec.europa.eu",          // PVGIS (production estimée)
        "data.geopf.fr",                // Géoplateforme IGN : géocodage, WFS BD TOPO, WMTS orthophotos
        "apicarto.ign.fr",              // API Carto : cadastre, Géoportail de l'urbanisme
        "api-adresse.data.gouv.fr"      // ancienne adresse de l'API Adresse (redirigée vers l'IGN)
    };
    private static final int MAX = 8 * 1024 * 1024;
    private static ExecutorService NET;

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());

    public SolaireBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    // Cycle de vie (appelé par MainActivity, rien à faire ici)
    public void onResult(int requestCode, int resultCode, Intent data) { }
    public void onPermissions(int requestCode) { }
    public void onResume() { }
    public void onIntent(Intent i) { }

    @JavascriptInterface public String version() { return "1"; }

    static boolean allowed(String u) {
        try {
            URL url = new URL(u);
            if (!"https".equals(url.getProtocol())) return false;
            String h = url.getHost().toLowerCase(java.util.Locale.ROOT);
            for (String x : HOSTS) if (h.equals(x)) return true;
        } catch (Throwable t) { }
        return false;
    }

    private static synchronized ExecutorService net() {
        if (NET == null) NET = Executors.newFixedThreadPool(4);
        return NET;
    }

    @JavascriptInterface public void http(final String key, final String url, final boolean b64) {
        if (!allowed(url)) { deliver(key, 0, "", "Adresse non autorisée"); return; }
        net().execute(new Runnable() { public void run() { get(key, url, b64, 0); } });
    }

    private void get(String key, String u, boolean b64, int hops) {
        HttpURLConnection h = null;
        try {
            h = (HttpURLConnection) new URL(u).openConnection();
            h.setConnectTimeout(15000); h.setReadTimeout(45000);
            h.setRequestProperty("User-Agent", "Solaire/1.0 (Android)");
            h.setRequestProperty("Accept", b64 ? "image/*,*/*" : "application/json, application/geo+json, */*");
            h.setInstanceFollowRedirects(false);
            int code = h.getResponseCode();
            if (code >= 300 && code < 400 && hops < 4) {
                String loc = h.getHeaderField("Location");
                if (loc != null) {
                    String next = new URL(new URL(u), loc).toString();
                    if (allowed(next)) { h.disconnect(); get(key, next, b64, hops + 1); return; }
                }
            }
            InputStream in = code >= 400 ? h.getErrorStream() : h.getInputStream();
            byte[] body = new byte[0];
            if (in != null) {
                try (InputStream s = in) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n;
                    while ((n = s.read(b)) > 0) { bo.write(b, 0, n); if (bo.size() > MAX) break; }
                    body = bo.toByteArray();
                }
            }
            String txt = b64 ? Base64.encodeToString(body, Base64.NO_WRAP) : new String(body, "UTF-8");
            deliver(key, code, txt, code >= 400 ? "HTTP " + code : "");
        } catch (Throwable t) {
            deliver(key, 0, "", t.getClass().getSimpleName() + (t.getMessage() != null ? " : " + t.getMessage() : ""));
        } finally { if (h != null) try { h.disconnect(); } catch (Throwable t) { } }
    }

    private void deliver(String key, int code, String body, String err) {
        final String js = "window.solaireHttp&&solaireHttp(" + JSONObject.quote(key) + "," + code + "," + JSONObject.quote(body == null ? "" : body) + "," + JSONObject.quote(err == null ? "" : err) + ")";
        ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } } });
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
