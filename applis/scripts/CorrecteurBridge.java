package __PKG__;

/* Correcteur : texte reçu d'une autre appli.
   - Menu de sélection d'Android (« Corriger », ACTION_PROCESS_TEXT) : le texte choisi arrive ici ; le texte corrigé repart
     vers l'appli d'origine (setResult) quand la sélection est modifiable ;
   - « Partager » vers Correcteur (ACTION_SEND text/plain).
   Page : MAGCorrecteur.take() → {"text","mode":"process"|"send","ro":bool} (une seule fois), reply(texte), share(texte).
   Aucune permission, rien sur Internet. */

import android.app.Activity;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;

public class CorrecteurBridge {
    private final Activity a;
    private final WebView wv;
    private String text = null, mode = null;
    private boolean ro = false;
    private boolean process = false;

    public CorrecteurBridge(Activity a, WebView wv) {
        this.a = a; this.wv = wv;
        read(a.getIntent());
    }

    private void read(Intent i) {
        if (i == null) return;
        try {
            String act = i.getAction();
            if (Intent.ACTION_PROCESS_TEXT.equals(act)) {
                CharSequence cs = i.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
                if (cs != null) { text = cs.toString(); mode = "process"; ro = i.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false); process = true; }
            } else if (Intent.ACTION_SEND.equals(act)) {
                CharSequence cs = i.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (cs != null) { text = cs.toString(); mode = "send"; ro = false; }
            }
        } catch (Throwable t) { }
    }

    /** Nouvel intent (appli déjà ouverte) : la page est prévenue */
    public void onIntent(Intent i) {
        read(i);
        if (text != null) wv.post(() -> { try { wv.evaluateJavascript("window.correcteurIntent&&correcteurIntent()", null); } catch (Throwable t) { } });
    }

    @JavascriptInterface public String take() {
        if (text == null) return "null";
        try {
            JSONObject o = new JSONObject();
            o.put("text", text); o.put("mode", mode); o.put("ro", ro);
            text = null;
            return o.toString();
        } catch (Throwable t) { return "null"; }
    }

    /** Renvoie le texte corrigé à l'appli d'où vient la sélection, puis ferme le Correcteur */
    @JavascriptInterface public void reply(final String t) {
        a.runOnUiThread(() -> {
            try {
                Intent r = new Intent();
                r.putExtra(Intent.EXTRA_PROCESS_TEXT, t == null ? "" : t);
                a.setResult(Activity.RESULT_OK, r);
            } catch (Throwable e) { }
            a.finish();
        });
    }

    @JavascriptInterface public void share(final String t) {
        a.runOnUiThread(() -> {
            try { a.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, t == null ? "" : t), "Partager")); } catch (Throwable e) { }
        });
    }
}
