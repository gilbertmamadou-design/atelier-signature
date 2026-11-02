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
     ecouter(req, lang) / arreter()  → « micro » {req, etat: perm|refuse|ecoute|fin|erreur, partiel, final, niveau, msg}
     barres()                        → {haut, bas} en px CSS (barres système, la page passe dessous)
   ===================================================================== */

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
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
import java.util.ArrayList;
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

    /* ================= Micro : reconnaissance vocale d'Android (hors ligne si la langue est installée) ================= */
    static final int REQ_MIC = 6301;
    private SpeechRecognizer sr = null;
    private boolean srOnDevice = false;
    private String micReq = "", micLang = "";
    private long lastLvl = 0;
    private boolean micOk() { return a.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED; }
    /** Appelé par MainActivity.onRequestPermissionsResult (extraCall « onPermissions ») */
    public void onPermissions(int code) {
        if (code == REQ_MIC) send("micro", o("req", micReq, "etat", micOk() ? "autorise" : "refuse"));
    }
    @JavascriptInterface public void ecouter(final String req, final String lang) {
        micReq = req; micLang = lang;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (!micOk()) { send("micro", o("req", req, "etat", "perm")); a.requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC); return; }
                boolean any = false, dev = false;
                try { any = SpeechRecognizer.isRecognitionAvailable(a); } catch (Throwable e) { }
                try { dev = android.os.Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(a); } catch (Throwable e) { }
                if (!any && !dev) { send("micro", o("req", req, "etat", "erreur", "msg", "Aucune reconnaissance vocale sur ce téléphone (installe l'appli Google)")); return; }
                // service standard d'abord (hors ligne si le pack de langue est installé) : plus fiable que la reconnaissance
                // « sur l'appareil », qui sur certains téléphones rend un résultat final vide ; celle-ci sert de repli
                creer(!any && dev);
                ecoute();
            } catch (Throwable t) { send("micro", o("req", req, "etat", "erreur", "msg", msg(t))); }
        } });
    }
    @JavascriptInterface public void arreter() {
        a.runOnUiThread(new Runnable() { public void run() { try { if (sr != null) sr.stopListening(); } catch (Throwable t) { } } });
    }
    private void detruire() { if (sr != null) { try { sr.destroy(); } catch (Throwable e) { } sr = null; } }
    private void creer(boolean onDevice) {
        detruire();
        srOnDevice = onDevice;
        sr = onDevice ? SpeechRecognizer.createOnDeviceSpeechRecognizer(a) : SpeechRecognizer.createSpeechRecognizer(a);
        sr.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle b) { send("micro", o("req", micReq, "etat", "ecoute")); }
            public void onBeginningOfSpeech() { }
            public void onRmsChanged(float db) {
                long now = System.currentTimeMillis(); if (now - lastLvl < 90) return; lastLvl = now;
                send("micro", o("req", micReq, "niveau", Math.max(0, Math.min(1, (db + 2) / 12.0))));
            }
            public void onBufferReceived(byte[] b) { }
            public void onEndOfSpeech() { }
            public void onError(int err) {
                if (sr == null) return;   // après le résultat (certains téléphones envoient encore une erreur) : ignorée
                // langue absente de la reconnaissance « sur l'appareil » : repli sur le service standard (hors ligne si le pack est installé)
                if (srOnDevice && (err == 12 || err == 13)) { creer(false); ecoute(); return; }
                String m;
                switch (err) {
                    case SpeechRecognizer.ERROR_NO_MATCH: case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: m = "Je n'ai rien entendu"; break;
                    case SpeechRecognizer.ERROR_NETWORK: case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: case SpeechRecognizer.ERROR_SERVER:
                        m = "Pas de réseau, et cette langue n'est pas installée pour la reconnaissance vocale hors connexion"; break;
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: m = "Autorisation du micro refusée"; break;
                    case SpeechRecognizer.ERROR_AUDIO: m = "Micro occupé par une autre appli"; break;
                    case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: m = "Reconnaissance vocale occupée, réessaie"; break;
                    case 12: case 13: m = "Cette langue n'est pas disponible pour la reconnaissance vocale sur ce téléphone"; break;
                    default: m = "Écoute interrompue (code " + err + ")";
                }
                send("micro", o("req", micReq, "etat", "erreur", "msg", m, "code", err));
                detruire();
            }
            public void onResults(Bundle b) {
                ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                final SpeechRecognizer done = sr; sr = null;
                send("micro", o("req", micReq, "etat", "fin", "final", r != null && !r.isEmpty() ? r.get(0) : ""));
                wv.postDelayed(new Runnable() { public void run() { try { done.destroy(); } catch (Throwable e) { } } }, 300);
            }
            public void onPartialResults(Bundle b) {
                ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (r != null && !r.isEmpty()) send("micro", o("req", micReq, "partiel", r.get(0)));
            }
            public void onEvent(int t, Bundle b) { }
        });
    }
    private void ecoute() {
        if (sr == null) return;
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, micLang);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, micLang);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, a.getPackageName());
        try { sr.startListening(i); } catch (Throwable e) { send("micro", o("req", micReq, "etat", "erreur", "msg", msg(e))); detruire(); }
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
