package __PKG__;

/* =====================================================================
   MAGTraducteur : traduction hors ligne de l'appli Traducteur (copié dans cette appli seule par print-patch.sh,
   avec ML Kit Translate et Language ID ajoutés à son build.gradle).

   Les modèles de langue (≈ 30 Mo chacun) sont téléchargés une fois depuis les serveurs de Google, puis tout se fait
   sur le téléphone, sans connexion. Les réponses arrivent dans la page par window.tradEvent(type, json) :
     langues()                       → liste JSON des codes de langue disponibles (synchrone)
     modeles(req)                    → « modeles » {req, ok, list:[codes téléchargés]}
     telecharger(req, lang, wifi)    → « telecharge » {req, lang, ok, err} (wifi faux : file d'attente Wi-Fi annulée d'abord)
     etat()                          → téléchargements en cours [{statut, raison, recu, total}] (synchrone)
     supprimer(req, lang)            → « supprime » {req, lang, ok, err}
     traduire(req, src, dst, texte)  → « traduit » {req, ok, text, err}
     detecter(req, texte)            → « detecte » {req, lang} (« und » si inconnue)
     parler(req, texte, lang) / taire() → « parole » {req, etat: debut|fin|erreur, err}
     barres()                        → {haut, bas} en px CSS (barres système, la page passe dessous)
   ===================================================================== */

import android.app.Activity;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.nl.languageid.LanguageIdentification;
import com.google.mlkit.nl.languageid.LanguageIdentifier;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.TranslateRemoteModel;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.Set;

public class TraducteurBridge {
    private final Activity a;
    private final WebView wv;
    private Translator tr = null;
    private String trKey = "";
    private LanguageIdentifier lid = null;
    private TextToSpeech tts = null;
    private boolean ttsReady = false;
    private String ttsPending = null, ttsPendingLang = null, ttsPendingReq = null;

    public TraducteurBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    @JavascriptInterface public String version() { return "1"; }

    @JavascriptInterface public String langues() {
        JSONArray l = new JSONArray();
        try { for (String c : TranslateLanguage.getAllLanguages()) l.put(c); } catch (Throwable t) { }
        return l.toString();
    }

    @JavascriptInterface public void modeles(final String req) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel.class)
                    .addOnSuccessListener(new OnSuccessListener<Set<TranslateRemoteModel>>() { public void onSuccess(Set<TranslateRemoteModel> s) {
                        JSONArray l = new JSONArray();
                        for (TranslateRemoteModel m : s) l.put(m.getLanguage());
                        send("modeles", o("req", req, "ok", true, "list", l));
                    } })
                    .addOnFailureListener(new OnFailureListener() { public void onFailure(Exception e) { send("modeles", o("req", req, "ok", false, "err", msg(e))); } });
            } catch (Throwable t) { send("modeles", o("req", req, "ok", false, "err", msg(t))); }
        } });
    }

    @JavascriptInterface public void telecharger(final String req, final String lang, final boolean wifi) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                final TranslateRemoteModel m = new TranslateRemoteModel.Builder(lang).build();
                if (wifi) { lancer(req, lang, m, true); return; }
                // données mobiles permises : un téléchargement de ce modèle demandé plus tôt « en Wi-Fi seulement » serait repris
                // tel quel ; on l'efface d'abord (s'il n'est pas déjà complet), puis on relance sans condition de réseau
                RemoteModelManager.getInstance().isModelDownloaded(m)
                    .addOnSuccessListener(new OnSuccessListener<Boolean>() { public void onSuccess(Boolean ok) {
                        if (ok != null && ok) { send("telecharge", o("req", req, "lang", lang, "ok", true)); return; }
                        RemoteModelManager.getInstance().deleteDownloadedModel(m)
                            .addOnCompleteListener(new com.google.android.gms.tasks.OnCompleteListener<Void>() { public void onComplete(com.google.android.gms.tasks.Task<Void> t) { lancer(req, lang, m, false); } });
                    } })
                    .addOnFailureListener(new OnFailureListener() { public void onFailure(Exception e) { lancer(req, lang, m, false); } });
            } catch (Throwable t) { send("telecharge", o("req", req, "lang", lang, "ok", false, "err", msg(t))); }
        } });
    }
    private void lancer(final String req, final String lang, TranslateRemoteModel m, boolean wifi) {
        try {
            DownloadConditions.Builder b = new DownloadConditions.Builder();
            if (wifi) b.requireWifi();
            RemoteModelManager.getInstance().download(m, b.build())
                .addOnSuccessListener(new OnSuccessListener<Void>() { public void onSuccess(Void v) { send("telecharge", o("req", req, "lang", lang, "ok", true)); } })
                .addOnFailureListener(new OnFailureListener() { public void onFailure(Exception e) { send("telecharge", o("req", req, "lang", lang, "ok", false, "err", msg(e))); } });
        } catch (Throwable t) { send("telecharge", o("req", req, "lang", lang, "ok", false, "err", msg(t))); }
    }
    /** Téléchargements de l'appli encore en attente dans le gestionnaire d'Android (ML Kit s'en sert) : annulés.
     *  Appelé une fois par la page quand on passe aux données mobiles, avant de relancer les langues une à une. */
    @JavascriptInterface public void viderFile() {
        try {
            android.app.DownloadManager dm = (android.app.DownloadManager) a.getSystemService(android.content.Context.DOWNLOAD_SERVICE);
            android.database.Cursor c = dm.query(new android.app.DownloadManager.Query().setFilterByStatus(
                android.app.DownloadManager.STATUS_PENDING | android.app.DownloadManager.STATUS_PAUSED));
            if (c == null) return;
            java.util.List<Long> ids = new java.util.ArrayList<Long>();
            while (c.moveToNext()) ids.add(c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_ID)));
            c.close();
            for (Long id : ids) dm.remove(id);
        } catch (Throwable t) { }
    }
    /** État des téléchargements en cours : [{statut, raison, recu, total}] (octets ; total −1 si inconnu) */
    @JavascriptInterface public String etat() {
        JSONArray l = new JSONArray();
        try {
            android.app.DownloadManager dm = (android.app.DownloadManager) a.getSystemService(android.content.Context.DOWNLOAD_SERVICE);
            android.database.Cursor c = dm.query(new android.app.DownloadManager.Query().setFilterByStatus(
                android.app.DownloadManager.STATUS_PENDING | android.app.DownloadManager.STATUS_RUNNING | android.app.DownloadManager.STATUS_PAUSED | android.app.DownloadManager.STATUS_FAILED));
            if (c != null) {
                long now = System.currentTimeMillis();
                while (c.moveToNext()) {
                    int st = c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_STATUS));
                    long mod = c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP));
                    if (st == android.app.DownloadManager.STATUS_FAILED && now - mod > 10 * 60 * 1000L) continue;
                    l.put(o("statut", st, "raison", c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_REASON)),
                        "recu", c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
                        "total", c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_TOTAL_SIZE_BYTES))));
                }
                c.close();
            }
        } catch (Throwable t) { }
        return l.toString();
    }

    @JavascriptInterface public void supprimer(final String req, final String lang) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (trKey.contains(lang)) { try { tr.close(); } catch (Throwable x) { } tr = null; trKey = ""; }
                TranslateRemoteModel m = new TranslateRemoteModel.Builder(lang).build();
                RemoteModelManager.getInstance().deleteDownloadedModel(m)
                    .addOnSuccessListener(new OnSuccessListener<Void>() { public void onSuccess(Void v) { send("supprime", o("req", req, "lang", lang, "ok", true)); } })
                    .addOnFailureListener(new OnFailureListener() { public void onFailure(Exception e) { send("supprime", o("req", req, "lang", lang, "ok", false, "err", msg(e))); } });
            } catch (Throwable t) { send("supprime", o("req", req, "lang", lang, "ok", false, "err", msg(t))); }
        } });
    }

    @JavascriptInterface public void traduire(final String req, final String src, final String dst, final String text) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                String key = src + ">" + dst;
                if (tr == null || !key.equals(trKey)) {
                    if (tr != null) { try { tr.close(); } catch (Throwable x) { } }
                    tr = Translation.getClient(new TranslatorOptions.Builder().setSourceLanguage(src).setTargetLanguage(dst).build());
                    trKey = key;
                }
                // pas de téléchargement caché ici : la page vérifie d'abord que les deux langues sont sur le téléphone
                tr.translate(text == null ? "" : text)
                    .addOnSuccessListener(new OnSuccessListener<String>() { public void onSuccess(String s) { send("traduit", o("req", req, "ok", true, "text", s)); } })
                    .addOnFailureListener(new OnFailureListener() { public void onFailure(Exception e) { send("traduit", o("req", req, "ok", false, "err", msg(e))); } });
            } catch (Throwable t) { send("traduit", o("req", req, "ok", false, "err", msg(t))); }
        } });
    }

    @JavascriptInterface public void detecter(final String req, final String text) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (lid == null) lid = LanguageIdentification.getClient();
                lid.identifyLanguage(text == null ? "" : text)
                    .addOnSuccessListener(new OnSuccessListener<String>() { public void onSuccess(String l) { send("detecte", o("req", req, "lang", l == null ? "und" : l)); } })
                    .addOnFailureListener(new OnFailureListener() { public void onFailure(Exception e) { send("detecte", o("req", req, "lang", "und")); } });
            } catch (Throwable t) { send("detecte", o("req", req, "lang", "und")); }
        } });
    }

    /** Lecture à voix haute par la voix du téléphone (hors ligne si la voix de la langue est installée) */
    @JavascriptInterface public void parler(final String req, final String text, final String lang) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (tts == null) {
                    ttsPending = text; ttsPendingLang = lang; ttsPendingReq = req;
                    tts = new TextToSpeech(a.getApplicationContext(), new TextToSpeech.OnInitListener() { public void onInit(int st) {
                        ttsReady = st == TextToSpeech.SUCCESS;
                        if (!ttsReady) { send("parole", o("req", ttsPendingReq, "etat", "erreur", "err", "voix du téléphone indisponible")); return; }
                        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            public void onStart(String id) { send("parole", o("req", id, "etat", "debut")); }
                            public void onDone(String id) { send("parole", o("req", id, "etat", "fin")); }
                            @Deprecated public void onError(String id) { send("parole", o("req", id, "etat", "erreur", "err", "lecture impossible")); }
                        });
                        if (ttsPending != null) say(ttsPendingReq, ttsPending, ttsPendingLang);
                        ttsPending = null;
                    } });
                    return;
                }
                if (!ttsReady) { ttsPending = text; ttsPendingLang = lang; ttsPendingReq = req; return; }
                say(req, text, lang);
            } catch (Throwable t) { send("parole", o("req", req, "etat", "erreur", "err", msg(t))); }
        } });
    }
    private void say(String req, String text, String lang) {
        int r = tts.setLanguage(Locale.forLanguageTag(lang));
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            send("parole", o("req", req, "etat", "erreur", "err", "voix absente"));
            return;
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, req);
    }
    @JavascriptInterface public void taire() {
        a.runOnUiThread(new Runnable() { public void run() { try { if (tts != null) tts.stop(); } catch (Throwable t) { } } });
    }

    /** Hauteur des barres système en px CSS {haut, bas} : env(safe-area-inset-*) vaut 0 dans certaines WebView */
    @JavascriptInterface public String barres() {
        try {
            android.view.WindowInsets w = a.getWindow().getDecorView().getRootWindowInsets();
            if (w == null) return "{}";
            float d = a.getResources().getDisplayMetrics().density;
            int top, bot;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = w.getInsetsIgnoringVisibility(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                top = i.top; bot = i.bottom;
            } else { top = w.getStableInsetTop(); bot = w.getStableInsetBottom(); }
            return "{\"haut\":" + Math.round(top / d) + ",\"bas\":" + Math.round(bot / d) + "}";
        } catch (Throwable e) { return "{}"; }
    }

    /* --- outils --- */
    private static String msg(Throwable t) { String m = t == null ? "" : t.getMessage(); return m == null ? t.getClass().getSimpleName() : m; }
    private static JSONObject o(Object... kv) {
        JSONObject j = new JSONObject();
        try { for (int i = 0; i + 1 < kv.length; i += 2) j.put(String.valueOf(kv[i]), kv[i + 1]); } catch (Throwable t) { }
        return j;
    }
    private void send(final String type, final JSONObject j) {
        final String js = "window.tradEvent&&tradEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(j.toString()) + ")";
        wv.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } } });
    }
}
