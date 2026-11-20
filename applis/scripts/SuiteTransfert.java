package __PKG__;

/* Transfert de la Suite vers un autre appareil (toutes les applis MAG).
   - photo() : à chaque mise en arrière-plan, copie de tout le stockage de la page (localStorage) dans
     files/suite-transfert.json. Socle la lit par le canal privé WidgetProvider (content://<appli>.widget/transfert),
     réservé aux applis signées avec la même clé. Rien ne sort de l'appareil sans l'action de l'utilisateur.
   - appliquer() : si Socle a déposé files/suite-import.json (content://<appli>.widget/import), les valeurs sont remises
     dans le stockage de la page au retour dans l'appli, puis la page est rechargée. Le fichier est ensuite effacé. */

import android.app.Activity;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.widget.Toast;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

public class SuiteTransfert {
    static File export(android.content.Context c) { return new File(c.getFilesDir(), "suite-transfert.json"); }
    static File depot(android.content.Context c) { return new File(c.getFilesDir(), "suite-import.json"); }

    static final String LIRE = "(function(){try{var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);o[k]=localStorage.getItem(k);}"
        + "return JSON.stringify({at:Date.now(),ls:o});}catch(e){return '';}})()";

    static void photo(final Activity a, final WebView wv) {
        if (a == null || wv == null) return;
        try {
            wv.evaluateJavascript(LIRE, new ValueCallback<String>() {
                public void onReceiveValue(String v) {
                    if (v == null || v.length() < 4 || "null".equals(v)) return;
                    try {
                        final String s = new JSONArray("[" + v + "]").getString(0);   // la valeur arrive entre guillemets
                        if (s.isEmpty()) return;
                        new Thread(new Runnable() { public void run() {
                            try {
                                File t = new File(a.getFilesDir(), "suite-transfert.tmp");
                                try (FileOutputStream o = new FileOutputStream(t)) { o.write(s.getBytes("UTF-8")); }
                                t.renameTo(export(a));
                            } catch (Throwable e) { }
                        } }).start();
                    } catch (Throwable e) { }
                }
            });
        } catch (Throwable e) { }
    }

    static String lire(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f)) { ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] t = new byte[65536]; int n; while ((n = in.read(t)) > 0) b.write(t, 0, n); return b.toString("UTF-8"); }
    }

    static void appliquer(final Activity a, final WebView wv) {
        if (a == null || wv == null) return;
        final File f = depot(a); if (!f.exists()) return;
        try {
            JSONObject o = new JSONObject(lire(f)), ls = o.optJSONObject("ls");
            f.delete();
            if (ls == null || ls.length() == 0) return;
            // après la reprise, plus aucune écriture jusqu'au rechargement : une sauvegarde faite par la page en partant
            // ne peut pas écraser les valeurs reprises
            final String js = "(function(d){var n=0;for(var k in d){try{localStorage.setItem(k,d[k]);n++;}catch(e){}}"
                + "try{var S=Storage.prototype;S.setItem=function(){};S.removeItem=function(){};S.clear=function(){};}catch(e){}return n;})(" + ls.toString() + ")";
            wv.postDelayed(new Runnable() { public void run() {
                try {
                    wv.evaluateJavascript(js, new ValueCallback<String>() { public void onReceiveValue(String n) {
                        try { Toast.makeText(a, "Données transférées : " + n + " réglages repris", Toast.LENGTH_LONG).show(); } catch (Throwable e) { }
                        wv.postDelayed(new Runnable() { public void run() { try { wv.reload(); } catch (Throwable e) { } } }, 300);
                    } });
                } catch (Throwable e) { }
            } }, 1200);
        } catch (Throwable e) { try { f.delete(); } catch (Throwable x) { } }
    }
}
