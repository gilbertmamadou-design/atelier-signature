package __PKG__;

/* =====================================================================
   MAGLangues : voix et écoute de l'appli Langues (copié dans cette appli seule par print-patch.sh).
   Repris de TraducteurBridge (sans ML Kit) : la voix du téléphone lit les mots et les phrases (hors ligne si la voix
   de la langue est installée), la reconnaissance vocale d'Android vérifie la prononciation.
   Réponses dans la page par window.languesEvent(type, json) :
     parler(req, texte, lang) / taire() / vitesse(0.5…1.5) → « parole » {req, etat: debut|fin|erreur, err}
     voix(lang)                     → « voix » {lang, etat: ok|absente|inconnue} (voix installée ?)
     reglagesVoix()                 → ouvre les réglages de synthèse vocale d'Android (installer une voix)
     ecouter(req, lang) / arreter() → « micro » {req, etat: perm|refuse|ecoute|fin|erreur, partiel, final, niveau, msg}
     barres()                       → {haut, bas} en px CSS
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
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Locale;

public class LanguesBridge {
    private final Activity a;
    private final WebView wv;
    private TextToSpeech tts = null;
    private boolean ttsReady = false;
    private String ttsPending = null, ttsPendingLang = null, ttsPendingReq = null;
    private float rate = 0.9f;

    public LanguesBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    @JavascriptInterface public String version() { return "1"; }
    @JavascriptInterface public void vitesse(float r) { rate = Math.max(0.4f, Math.min(1.6f, r)); }
    /** Voix de la langue installée ? (prépare la voix du téléphone au premier appel) */
    @JavascriptInterface public void voix(final String lang) {
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (tts == null) {
                    tts = new TextToSpeech(a.getApplicationContext(), new TextToSpeech.OnInitListener() { public void onInit(int st) {
                        ttsReady = st == TextToSpeech.SUCCESS;
                        if (ttsReady) listener();
                        voixEtat(lang);
                        if (ttsReady && ttsPending != null) say(ttsPendingReq, ttsPending, ttsPendingLang);
                        ttsPending = null;
                    } });
                    return;
                }
                voixEtat(lang);
            } catch (Throwable t) { send("voix", o("lang", lang, "etat", "inconnue")); }
        } });
    }
    private void voixEtat(String lang) {
        if (!ttsReady) { send("voix", o("lang", lang, "etat", "inconnue")); return; }
        int r = tts.isLanguageAvailable(Locale.forLanguageTag(lang));
        send("voix", o("lang", lang, "etat", r >= TextToSpeech.LANG_AVAILABLE ? "ok" : r == TextToSpeech.LANG_MISSING_DATA ? "absente" : "inconnue"));
    }
    private void listener() {
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            public void onStart(String id) { send("parole", o("req", id, "etat", "debut")); }
            public void onDone(String id) { send("parole", o("req", id, "etat", "fin")); }
            @Deprecated public void onError(String id) { send("parole", o("req", id, "etat", "erreur", "err", "lecture impossible")); }
        });
    }
    @JavascriptInterface public void reglagesVoix() {
        a.runOnUiThread(new Runnable() { public void run() {
            try { Intent i = new Intent("com.android.settings.TTS_SETTINGS"); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); a.startActivity(i); }
            catch (Throwable t) { try { Intent i = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); a.startActivity(i); } catch (Throwable t2) { } }
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
        try { tts.setSpeechRate(rate); } catch (Throwable t) { }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, req);
    }
    @JavascriptInterface public void taire() {
        a.runOnUiThread(new Runnable() { public void run() { try { if (tts != null) tts.stop(); } catch (Throwable t) { } } });
    }

    /* ================= Micro : reconnaissance vocale d'Android (hors ligne si la langue est installée) ================= */
    static final int REQ_MIC = 6301;
    private SpeechRecognizer sr = null;
    private boolean srOnDevice = false, preferOffline = true, devOk = false, anyOk = false;
    private int attempt = 0;
    private String micReq = "", micLang = "";
    private long lastLvl = 0;
    private boolean micOk() { return a.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED; }
    /** Appelé par MainActivity.onRequestPermissionsResult (extraCall « onPermissions ») */
    public void onPermissions(int code) {
        if (code == REQ_MIC) send("micro", o("req", micReq, "etat", micOk() ? "autorise" : "refuse"));
    }
    @JavascriptInterface public void ecouter(final String req, final String lang) {
        micReq = req; micLang = lang; attempt = 0; preferOffline = true;
        a.runOnUiThread(new Runnable() { public void run() {
            try {
                if (!micOk()) { send("micro", o("req", req, "etat", "perm")); a.requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC); return; }
                boolean any = false, dev = false;
                try { any = SpeechRecognizer.isRecognitionAvailable(a); } catch (Throwable e) { }
                try { dev = android.os.Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(a); } catch (Throwable e) { }
                if (!any && !dev) { send("micro", o("req", req, "etat", "erreur", "msg", "Aucune reconnaissance vocale sur ce téléphone (installe l'appli Google)")); return; }
                // service standard d'abord (hors ligne si le pack de langue est installé) : plus fiable que la reconnaissance
                // « sur l'appareil », qui sur certains téléphones rend un résultat final vide ; celle-ci sert de repli
                anyOk = any; devOk = dev;
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
                // langue absente, réseau absent ou service d'écoute déconnecté (code 11) : on essaie les autres façons
                // d'écouter avant d'abandonner : 1) service standard hors ligne → 2) en ligne → 3) « sur l'appareil »
                // → 4) fenêtre d'écoute de Google (elle sait télécharger la langue ou passer par le réseau)
                boolean langErr = err == 12 || err == 13, netErr = err == SpeechRecognizer.ERROR_NETWORK || err == SpeechRecognizer.ERROR_NETWORK_TIMEOUT || err == SpeechRecognizer.ERROR_SERVER;
                boolean svcErr = err == 11 || err == SpeechRecognizer.ERROR_CLIENT || err == SpeechRecognizer.ERROR_RECOGNIZER_BUSY;
                if (langErr || netErr || svcErr) {
                    if (!srOnDevice && preferOffline && (langErr || svcErr) && attempt < 1) { attempt = 1; preferOffline = false; relance(false); return; }
                    if (devOk && attempt < 3 && !srOnDevice) { attempt = 3; preferOffline = true; relance(true); return; }
                    if (srOnDevice && langErr && devOk && android.os.Build.VERSION.SDK_INT >= 33) {
                        try { Intent di = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH); di.putExtra(RecognizerIntent.EXTRA_LANGUAGE, micLang); SpeechRecognizer.createOnDeviceSpeechRecognizer(a).triggerModelDownload(di); } catch (Throwable x) { }
                    }
                    if (attempt < 4) { attempt = 4; detruire(); fenetre(); return; }
                }
                String m;
                switch (err) {
                    case SpeechRecognizer.ERROR_NO_MATCH: case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: m = "Je n'ai rien entendu"; break;
                    case SpeechRecognizer.ERROR_NETWORK: case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: case SpeechRecognizer.ERROR_SERVER:
                        m = "Pas de réseau, et cette langue n'est pas installée pour la reconnaissance vocale hors connexion"; break;
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: m = "Autorisation du micro refusée"; break;
                    case SpeechRecognizer.ERROR_AUDIO: m = "Micro occupé par une autre appli"; break;
                    case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: m = "Reconnaissance vocale occupée, réessaie"; break;
                    case 11: m = "Service d'écoute du téléphone déconnecté, réessaie"; break;
                    case 12: case 13: m = "L'écoute de cette langue n'est pas installée sur le téléphone"; break;
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
    /** Nouvel essai un peu plus tard : relancer dans le rappel d'erreur déconnecte parfois le service (code 11) */
    private void relance(final boolean onDevice) {
        detruire();
        wv.postDelayed(new Runnable() { public void run() { try { creer(onDevice); ecoute(); } catch (Throwable t) { fenetre(); } } }, 350);
    }
    /** Dernier recours : la fenêtre d'écoute du téléphone (Google) ; résultat dans onResult */
    static final int REQ_DIALOG = 6302;
    private void fenetre() {
        try {
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, micLang);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, micLang);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Je vous écoute…");
            a.startActivityForResult(i, REQ_DIALOG);
            send("micro", o("req", micReq, "etat", "fenetre"));
        } catch (Throwable t) {
            send("micro", o("req", micReq, "etat", "erreur", "code", 11, "msg", "Aucune écoute disponible : installe ou mets à jour l'appli Google"));
        }
    }
    /** Appelé par MainActivity.onActivityResult (extraCall « onResult ») */
    public void onResult(int code, int res, Intent data) {
        if (code != REQ_DIALOG) return;
        ArrayList<String> r = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (res == Activity.RESULT_OK && r != null && !r.isEmpty()) send("micro", o("req", micReq, "etat", "fin", "final", r.get(0)));
        else send("micro", o("req", micReq, "etat", "erreur", "code", 7, "msg", "Je n'ai rien entendu"));
    }

    private void ecoute() {
        if (sr == null) return;
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, micLang);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, micLang);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline);
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
        final String js = "window.languesEvent&&languesEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(j.toString()) + ")";
        wv.post(new Runnable() { public void run() { try { wv.evaluateJavascript(js, null); } catch (Throwable t) { } } });
    }
}
