package __PKG__;

// Carnet de voyage (Suite MAG) : lieu (GPS) et date d'origine des photos choisies dans la galerie.
// Exposé en JavaScript sous window.MAGVoyage. Les photos elles-mêmes passent par MAGOffice (OfficeBridge.java : sélecteur
// d'Android, plusieurs à la fois, lecture par morceaux) ; Android retire la position GPS des fichiers transmis aux applis qui
// n'ont pas l'autorisation « Accès à la position des contenus multimédias » (ACCESS_MEDIA_LOCATION, déclarée pour toutes les
// applis par print-patch.sh). Ce pont la demande (une fois, sur action de l'utilisateur) et relit les métadonnées d'origine
// (MediaStore.setRequireOriginal) avec android.media.ExifInterface.
// Aucun effet au chargement : la classe est copiée dans toutes les applis et ne fait rien tant que la page ne l'appelle pas.
// Événement vers la page : window.voyageEvent('perm', '{"state":"granted|denied"}'). Aucun accès réseau.

import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.InputStream;

public class VoyageBridge {
    private static final int REQ_LOC = 6420;
    private static final String P_LOC = "android.permission.ACCESS_MEDIA_LOCATION";
    private final Activity a;
    private final WebView wv;

    public VoyageBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    @JavascriptInterface public String version() { return "1"; }

    /** « na » (Android 9 et avant : rien n'est retiré), « granted » ou « ask » */
    @JavascriptInterface public String locState() {
        if (Build.VERSION.SDK_INT < 29) return "na";
        return a.checkSelfPermission(P_LOC) == PackageManager.PERMISSION_GRANTED ? "granted" : "ask";
    }

    /** Demande l'autorisation ; réponse : événement « perm » */
    @JavascriptInterface public void askLoc() {
        if (Build.VERSION.SDK_INT < 29 || a.checkSelfPermission(P_LOC) == PackageManager.PERMISSION_GRANTED) { emit("perm", "{\"state\":\"granted\"}"); return; }
        a.runOnUiThread(new Runnable() { public void run() {
            try { a.requestPermissions(new String[]{ P_LOC }, REQ_LOC); }
            catch (Throwable t) { emit("perm", "{\"state\":\"denied\"}"); }
        } });
    }

    /** Appelé par MainActivity.onRequestPermissionsResult (extraCall « onPermissions ») */
    public void onPermissions(int code) {
        if (code != REQ_LOC) return;
        emit("perm", "{\"state\":\"" + ("granted".equals(locState()) ? "granted" : "denied") + "\"}");
    }

    /** Métadonnées d'origine d'une photo choisie : {"lat":…,"lon":…,"date":"2026:07:12 10:14:00"} ou "null" */
    @JavascriptInterface public String exif(String src) {
        if (src == null || !src.startsWith("content://") || Build.VERSION.SDK_INT < 24) return "null";
        Uri u = Uri.parse(src);
        InputStream in = null;
        try {
            Uri orig = u;
            if (Build.VERSION.SDK_INT >= 29 && "granted".equals(locState())) {
                try { Uri m = MediaStore.getMediaUri(a, u); if (m != null) orig = MediaStore.setRequireOriginal(m); } catch (Throwable t) { }
                if (orig == u) { try { orig = MediaStore.setRequireOriginal(u); } catch (Throwable t) { orig = u; } }
            }
            try { in = a.getContentResolver().openInputStream(orig); } catch (Throwable t) { in = null; }
            if (in == null) in = a.getContentResolver().openInputStream(u);
            if (in == null) return "null";
            ExifInterface ex = new ExifInterface(in);
            JSONObject o = new JSONObject();
            float[] ll = new float[2];
            if (ex.getLatLong(ll) && (ll[0] != 0 || ll[1] != 0)) { o.put("lat", (double) ll[0]); o.put("lon", (double) ll[1]); }
            String d = ex.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
            if (d == null) d = ex.getAttribute(ExifInterface.TAG_DATETIME);
            if (d != null) o.put("date", d);
            return o.length() > 0 ? o.toString() : "null";
        } catch (Throwable t) { return "null"; }
        finally { try { if (in != null) in.close(); } catch (Throwable t) { } }
    }

    private void emit(final String type, final String json) {
        final String js = "window.voyageEvent&&voyageEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json) + ")";
        wv.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } } });
    }
}
