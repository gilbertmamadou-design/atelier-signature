package __PKG__;

// Majordome : pont natif exposé en JavaScript sous window.MAGMajordome (appli fr.magformation13.majordome seulement :
// copié par print-patch.sh pour APP=majordome, avec les bibliothèques Vosk et JNA). Chargé par réflexion par MainActivity.
//  - Reconnaissance vocale hors ligne : Vosk (com.alphacephei:vosk-android, Apache-2.0), modèle vosk-model-small-fr-0.22
//    (Apache-2.0) téléchargé une fois depuis alphacephei.com (ou choisi comme fichier .zip), décompressé dans files/vosk-fr.
//    Repli : SpeechRecognizer d'Android avec EXTRA_PREFER_OFFLINE.
//  - Écoute continue du mot de réveil : service au premier plan (micro) avec notification, option « seulement en charge ».
//  - Voix : TextToSpeech (voix françaises du téléphone, vitesse, hauteur, volume) ; fin de phrase signalée à la page.
//  - Voix Piper (hors ligne) : la page synthétise (sherpa-onnx WASM, mj-voix.js) ; ici, les fichiers des voix
//    (téléchargés depuis huggingface.co/rhasspy/piper-voices, SHA-256 vérifiée, stockage privé files/piper/, lus par
//    la page via Capacitor.convertFileSrc) et la lecture : AudioTrack, focus audio, micro de veille coupé, niveau réel
//    (RMS) envoyé au fond animé et à Socle (MajordomeWallpaper.Voix.speakLevel).
//  - Minuteurs, réveils, rappels : AlarmManager (setAlarmClock / setExactAndAllowWhileIdle), notification plein écran, redémarrage.
//  - Téléphone : appel et SMS (toujours après confirmation dans la page), volume, sonnerie / ne pas déranger, panneaux Wi-Fi
//    et Bluetooth (Android impose de passer par eux), touches multimédia.
//  - Ouvrir n'importe quelle appli (« Ouvre WhatsApp ») : liste MAIN/LAUNCHER en cache (appList), lancement (appLaunch)
//    et raccourcis du système par intents standard (sysOpen), en respectant les règles d'Android hors premier plan.
//  - Montre connectée (Amazfit T-Rex 3) : notifications courtes recopiées par l'appli Zepp, et serveur local 127.0.0.1
//    à jeton pour la mini-appli Zepp OS « Jarvis » (zepp/jarvis/), voir « Montre connectée » plus bas.
// Événements vers la page : window.majordomeEvent(type, json). Codes de requête 6600 à 6619 ; notifications 6620 à 6640,
// 6630 + 0..1023 (alarmes), 7700 à 7710 (montre), 7720 (ouvrir une appli) ; PendingIntent 6680 à 6692 (montre), 6900 (ouvrir une appli).

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.AlarmClock;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MajordomeBridge {
    static final String MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip";
    static final String PREFS = "majordome";
    static final int REQ_MIC = 6600, REQ_PICK = 6601, REQ_PERM = 6602, REQ_PIPER = 6603;
    static final int N_WAKE = 6620, N_CMD = 6621, N_ALARM_BASE = 6630;
    static final String CH_WAKE = "mj_ecoute", CH_ALARM = "mj_alarme", CH_RAPPEL = "mj_rappel", CH_CMD = "mj_commande";
    static final String CH_WATCH = "mj_montre", CH_LINK = "mj_montre_liaison";
    static final int N_WATCH_BASE = 7700, N_LINK = 7710;
    static final int N_OPEN = 7720, PI_OPEN = 6900;   // « ouvre WhatsApp » hors premier plan : notification à toucher   // au-delà des notifications d'alarme (6630 + 0..1023)

    static volatile MajordomeBridge live;
    static volatile boolean resumed;
    static volatile String pendingCmd = "";
    static volatile boolean pendingAssist = false;

    private final Activity a;
    private final WebView wv;
    private final Handler ui = new Handler(Looper.getMainLooper());

    public MajordomeBridge(Activity a, WebView wv) {
        this.a = a; this.wv = wv; live = this; resumed = true;
        try {
            a.getApplication().registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
                public void onActivityResumed(Activity x) { if (x == MajordomeBridge.this.a) { resumed = true; live = MajordomeBridge.this; MajordomeWallpaper.Voix.front = !(Build.VERSION.SDK_INT >= 24 && x.isInMultiWindowMode()); } }
                public void onActivityPaused(Activity x) { if (x == MajordomeBridge.this.a) { resumed = false; MajordomeWallpaper.Voix.front = false; } }
                public void onActivityCreated(Activity x, Bundle b) { }
                public void onActivityStarted(Activity x) { }
                public void onActivityStopped(Activity x) { }
                public void onActivitySaveInstanceState(Activity x, Bundle b) { }
                public void onActivityDestroyed(Activity x) { if (x == MajordomeBridge.this.a) { if (live == MajordomeBridge.this) live = null; resumed = false; } }
            });
        } catch (Throwable t) { }
        takeIntent(a.getIntent());
        watchPackages(a.getApplicationContext());
    }

    // ---------- Cycle de vie (appelé par MainActivity) ----------
    public void onResume() { resumed = true; live = this; emit("perm", "{}"); refreshApps(a.getApplicationContext()); }
    public void onPermissions(int code) { emit("perm", "{}"); }
    public void onIntent(Intent i) { takeIntent(i); }
    public void onResult(int code, int res, Intent data) {
        if (code == REQ_PIPER) { piperPicked(res, data); return; }
        if (code != REQ_PICK) return;
        if (res != Activity.RESULT_OK || data == null || data.getData() == null) return;
        final Uri u = data.getData();
        final Context c = a.getApplicationContext();
        new Thread(new Runnable() { public void run() {
            try (InputStream in = c.getContentResolver().openInputStream(u)) { installZip(c, in, -1); }
            catch (Throwable t) { modelState(c, "error", 0, "Ce fichier n'est pas un modèle Vosk utilisable (" + t.getMessage() + ")."); }
        } }).start();
    }
    private void takeIntent(Intent i) {
        if (i == null) return;
        String c = i.getStringExtra("majordome_cmd");
        if (c != null && !c.isEmpty()) { i.removeExtra("majordome_cmd"); pendingCmd = ""; emitLater("command", obj("text", c)); }
        // Assistant du téléphone : appui long sur le bouton d'accueil / geste d'assistant (intent ACTION_ASSIST,
        // filtre ajouté par print-patch.sh). On note la demande (prise une fois par la page) et on neutralise l'intent
        // pour qu'une recréation de l'activité ne relance pas l'écoute.
        if (Intent.ACTION_ASSIST.equals(i.getAction())) { i.setAction(Intent.ACTION_MAIN); pendingAssist = true; emitLater("assist", "{}"); }
        try { ((NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(N_CMD); } catch (Throwable t) { }
    }

    // ---------- Événements vers la page ----------
    static String obj(String k, Object v) { try { return new JSONObject().put(k, v).toString(); } catch (Exception e) { return "{}"; } }
    void emit(final String type, final String json) {
        ui.post(new Runnable() { public void run() { try { wv.evaluateJavascript("window.majordomeEvent&&majordomeEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(json) + ")", null); } catch (Throwable t) { } } });
    }
    void emitLater(final String type, final String json) { ui.postDelayed(new Runnable() { public void run() { emit(type, json); } }, 900); }
    static void send(String type, String json) { MajordomeBridge b = live; if (b != null) b.emit(type, json); }

    @JavascriptInterface public String version() { return "1"; }

    // =====================================================================
    // Modèle Vosk
    // =====================================================================
    static File modelDir(Context c) { return new File(c.getFilesDir(), "vosk-fr"); }
    static boolean modelReady(Context c) { return new File(modelDir(c), "majordome.ok").exists(); }
    static volatile String mState = null; static volatile double mProg = 0; static volatile String mMsg = "";
    static void modelState(Context c, String st, double prog, String msg) {
        mState = st; mProg = prog; mMsg = msg == null ? "" : msg;
        try {
            JSONObject o = new JSONObject().put("state", st).put("progress", prog).put("msg", mMsg);
            if ("ready".equals(st)) { o.put("size", c.getSharedPreferences(PREFS, 0).getLong("modelSize", 0)); o.put("fresh", true); }
            send("model", o.toString());
        } catch (Exception e) { }
    }
    static JSONObject modelJson(Context c) throws Exception {
        JSONObject o = new JSONObject();
        if (mState != null && !"ready".equals(mState) && !"none".equals(mState)) { o.put("state", mState).put("progress", mProg).put("msg", mMsg); return o; }
        if (modelReady(c)) return o.put("state", "ready").put("size", c.getSharedPreferences(PREFS, 0).getLong("modelSize", 0));
        return o.put("state", mState != null && "error".equals(mState) ? "error" : "none").put("msg", mMsg);
    }
    @JavascriptInterface public String sttInfo() {
        try {
            JSONObject o = new JSONObject();
            o.put("model", modelJson(a));
            o.put("android", SpeechRecognizer.isRecognitionAvailable(a));
            o.put("web", false);
            o.put("wake", new JSONObject().put("on", prefs(a).getBoolean("wake", false)).put("running", Ecoute.running));
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
    @JavascriptInterface public void modelDownload() {
        if ("downloading".equals(mState) || "extracting".equals(mState)) return;
        final Context c = a.getApplicationContext();
        modelState(c, "downloading", 0, "");
        new Thread(new Runnable() { public void run() {
            HttpURLConnection h = null;
            try {
                String cur = MODEL_URL;
                for (int hop = 0; hop < 5; hop++) {
                    h = (HttpURLConnection) new URL(cur).openConnection();
                    h.setConnectTimeout(15000); h.setReadTimeout(30000); h.setInstanceFollowRedirects(false);
                    h.setRequestProperty("User-Agent", "Majordome/1.0 (Android)");
                    int code = h.getResponseCode();
                    if (code >= 300 && code < 400 && h.getHeaderField("Location") != null) { String loc = new URL(new URL(cur), h.getHeaderField("Location")).toString(); h.disconnect(); if (!loc.startsWith("https://")) throw new Exception("redirection refusée"); cur = loc; continue; }
                    if (code != 200) throw new Exception("HTTP " + code);
                    break;
                }
                long total = h.getContentLengthLong();
                File tmp = new File(c.getCacheDir(), "vosk-model.zip");
                try (InputStream in = h.getInputStream(); OutputStream out = new FileOutputStream(tmp)) {
                    byte[] b = new byte[65536]; long got = 0, last = 0; int n;
                    while ((n = in.read(b)) > 0) {
                        out.write(b, 0, n); got += n;
                        if (got > 300L * 1024 * 1024) throw new Exception("fichier trop gros");
                        long now = System.currentTimeMillis();
                        if (now - last > 400) { last = now; modelState(c, "downloading", total > 0 ? Math.min(0.97, (double) got / total) : 0.5, ""); }
                    }
                }
                try (InputStream in = new java.io.FileInputStream(tmp)) { installZip(c, in, tmp.length()); }
                tmp.delete();
            } catch (Throwable t) {
                modelState(c, "error", 0, "Téléchargement impossible (" + t.getMessage() + "). Vérifiez la connexion, ou téléchargez vosk-model-small-fr-0.22.zip avec le navigateur puis « Choisir le fichier du modèle ».");
            } finally { if (h != null) try { h.disconnect(); } catch (Throwable t) { } }
        } }).start();
    }
    @JavascriptInterface public void modelPick() {
        ui.post(new Runnable() { public void run() {
            try { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "application/zip", "application/x-zip-compressed", "application/octet-stream" }); a.startActivityForResult(i, REQ_PICK); }
            catch (Throwable t) { toast("Sélecteur de fichiers indisponible"); }
        } });
    }
    @JavascriptInterface public void modelDelete() {
        Ear.stopAll(); Ecoute.stop(a); Ear.dropModel();
        deleteTree(modelDir(a)); mState = "none"; prefs(a).edit().putBoolean("wake", false).apply();
    }
    static void deleteTree(File f) { File[] l = f.listFiles(); if (l != null) for (File x : l) deleteTree(x); f.delete(); }
    /** Décompresse le .zip officiel (dossier racine retiré) ; refuse les chemins qui sortent du dossier */
    static void installZip(Context c, InputStream in, long size) throws Exception {
        modelState(c, "extracting", 0.98, "");
        Ear.stopAll(); Ear.dropModel();
        File dir = modelDir(c), tmp = new File(c.getFilesDir(), "vosk-fr.tmp");
        deleteTree(tmp); tmp.mkdirs();
        String base = tmp.getCanonicalPath() + File.separator;
        int files = 0; long bytes = 0;
        try (ZipInputStream z = new ZipInputStream(new java.io.BufferedInputStream(in))) {
            ZipEntry e; byte[] b = new byte[65536];
            while ((e = z.getNextEntry()) != null) {
                String name = e.getName().replace('\\', '/');
                int k = name.indexOf('/'); if (k < 0) continue;
                name = name.substring(k + 1); if (name.isEmpty()) continue;
                File out = new File(tmp, name);
                if (!out.getCanonicalPath().startsWith(base)) throw new Exception("archive invalide");
                if (e.isDirectory()) { out.mkdirs(); continue; }
                out.getParentFile().mkdirs();
                try (OutputStream o = new FileOutputStream(out)) { int n; while ((n = z.read(b)) > 0) { o.write(b, 0, n); bytes += n; if (bytes > 600L * 1024 * 1024) throw new Exception("archive trop grosse"); } }
                files++;
            }
        }
        if (!new File(tmp, "am/final.mdl").exists() || !new File(tmp, "conf/model.conf").exists()) { deleteTree(tmp); throw new Exception("ce n'est pas un modèle Vosk (am/final.mdl absent)"); }
        deleteTree(dir); if (!tmp.renameTo(dir)) throw new Exception("installation impossible");
        new File(dir, "majordome.ok").createNewFile();
        prefs(c).edit().putLong("modelSize", size > 0 ? size : bytes).apply();
        modelState(c, "ready", 1, "");
    }

    // =====================================================================
    // Écoute : Vosk (Ear) ou reconnaissance d'Android
    // =====================================================================
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    boolean hasMic() { return a.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED; }
    private SpeechRecognizer sr;
    @JavascriptInterface public void listen(String json) {
        JSONObject o; try { o = new JSONObject(json == null ? "{}" : json); } catch (Exception e) { o = new JSONObject(); }
        if (!hasMic()) { ui.post(new Runnable() { public void run() { a.requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC); } }); emit("error", obj("msg", "Autorisez le micro, puis touchez à nouveau le micro.")); return; }
        final int max = Math.max(3000, o.optInt("maxMs", 9000));
        if ("android".equals(o.optString("engine"))) { ui.post(new Runnable() { public void run() { androidListen(max); } }); return; }
        if (!modelReady(a)) { emit("error", obj("msg", "Le modèle vocal n'est pas installé.")); return; }
        Ear.command(a.getApplicationContext(), max, false);
    }
    @JavascriptInterface public void stop() {
        Ear.cancelCommand();
        ui.post(new Runnable() { public void run() { if (sr != null) { try { sr.cancel(); sr.destroy(); } catch (Throwable t) { } sr = null; } } });
    }
    private void androidListen(int max) {
        try {
            if (sr != null) { sr.destroy(); sr = null; }
            sr = SpeechRecognizer.createSpeechRecognizer(a);
            final boolean[] got = { false };
            sr.setRecognitionListener(new RecognitionListener() {
                public void onReadyForSpeech(Bundle b) { }
                public void onBeginningOfSpeech() { }
                public void onRmsChanged(float db) { double v = Math.max(0, Math.min(1, (db + 2) / 12.0)); emit("level", obj("v", v)); MajordomeWallpaper.Voix.mic(a, v); }
                public void onBufferReceived(byte[] b) { }
                public void onEndOfSpeech() { }
                public void onError(int err) { MajordomeWallpaper.Voix.end("listen"); if (got[0]) return; got[0] = true; if (err == SpeechRecognizer.ERROR_NO_MATCH || err == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) emit("result", obj("text", "")); else emit("error", obj("msg", "Reconnaissance d'Android : erreur " + err + (err == SpeechRecognizer.ERROR_NETWORK || err == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ? " (pas de pack hors ligne français : installez-le, ou utilisez Vosk)" : ""))); }
                public void onResults(Bundle b) { MajordomeWallpaper.Voix.end("listen"); if (got[0]) return; got[0] = true; ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); emit("result", obj("text", l != null && !l.isEmpty() ? l.get(0) : "")); }
                public void onPartialResults(Bundle b) { ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (l != null && !l.isEmpty()) emit("partial", obj("text", l.get(0))); }
                public void onEvent(int t, Bundle b) { }
            });
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
            i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, a.getPackageName());
            Ear.pauseWake(true);
            sr.startListening(i);
            ui.postDelayed(new Runnable() { public void run() { if (!got[0] && sr != null) try { sr.stopListening(); } catch (Throwable t) { } } }, max);
            ui.postDelayed(new Runnable() { public void run() { Ear.pauseWake(false); } }, max + 1500);
        } catch (Throwable t) { emit("error", obj("msg", "Reconnaissance d'Android indisponible : " + t.getMessage())); }
    }
    @JavascriptInterface public void hold(boolean on) { Ear.hold(on); }
    @JavascriptInterface public boolean takeAssist() { boolean b = pendingAssist; pendingAssist = false; return b; }
    @JavascriptInterface public String takeCommand() { String c = pendingCmd; pendingCmd = ""; return c == null ? "" : c; }

    /** Moteur Vosk partagé par la page et le service d'écoute continue : un seul micro, deux modes (commande, mot de réveil) */
    static class Ear implements Runnable {
        static final Object LOCK = new Object();
        static Model model; static Ear I; static Thread th;
        static volatile boolean wakeOn = false, holding = false, wakePaused = false;
        static volatile long holdUntil = 0;
        static volatile String[] words = { "majordome" };
        static volatile Recognizer cmdRec = null; static volatile long cmdEnd = 0; static volatile boolean cmdFromWake = false;
        static Recognizer wakeRec = null;
        static Context ctx;
        static ToneGenerator tone;

        static Model model(Context c) throws Exception {
            synchronized (LOCK) { if (model == null) model = new Model(modelDir(c).getAbsolutePath()); return model; }
        }
        static void dropModel() { synchronized (LOCK) { if (model != null) { try { model.close(); } catch (Throwable t) { } model = null; } } }
        static void hold(boolean on) { holding = on; if (!on) holdUntil = System.currentTimeMillis() + 700; }
        static void pauseWake(boolean on) { wakePaused = on; }
        static void command(Context c, int maxMs, boolean fromWake) {
            ctx = c.getApplicationContext();
            new Thread(new Runnable() { public void run() {
                try {
                    Model m = model(ctx);
                    synchronized (LOCK) {
                        if (cmdRec != null) { try { cmdRec.close(); } catch (Throwable t) { } }
                        cmdRec = new Recognizer(m, 16000.0f); cmdEnd = System.currentTimeMillis() + maxMs; cmdFromWake = fromWake;
                    }
                    ensure();
                } catch (Throwable t) { send("error", obj("msg", "Modèle vocal illisible : " + t.getMessage() + ". Réinstallez-le.")); }
            } }).start();
        }
        static void cancelCommand() { synchronized (LOCK) { if (cmdRec != null) { try { cmdRec.close(); } catch (Throwable t) { } cmdRec = null; } } send("end", "{}"); MajordomeWallpaper.Voix.end("listen"); }
        static void setWake(Context c, boolean on, String[] w) {
            ctx = c.getApplicationContext(); wakeOn = on; if (w != null && w.length > 0) words = w;
            if (on) { try { Model m = model(ctx); synchronized (LOCK) { if (wakeRec == null) wakeRec = new Recognizer(m, 16000.0f); } ensure(); } catch (Throwable t) { send("error", obj("msg", "Écoute continue impossible : " + t.getMessage())); } }
            else synchronized (LOCK) { if (wakeRec != null) { try { wakeRec.close(); } catch (Throwable t) { } wakeRec = null; } }
        }
        static void stopAll() { wakeOn = false; synchronized (LOCK) { if (cmdRec != null) { try { cmdRec.close(); } catch (Throwable t) { } cmdRec = null; } if (wakeRec != null) { try { wakeRec.close(); } catch (Throwable t) { } wakeRec = null; } } }
        static synchronized void ensure() { if (th != null && th.isAlive()) return; I = new Ear(); th = new Thread(I, "majordome-micro"); th.start(); }

        static String norm(String s) { return Normalizer.normalize(s == null ? "" : s.toLowerCase(Locale.FRENCH), Normalizer.Form.NFD).replaceAll("\\p{M}", "").replaceAll("[^a-z0-9 ]+", " ").replaceAll("\\s+", " ").trim(); }
        static String hit(String text) {
            String t = " " + norm(text) + " ", compact = t.replace(" ", "");
            for (String w0 : words) {
                String w = norm(w0); if (w.isEmpty()) continue;
                if (t.contains(" " + w + " ") || compact.contains(w.replace(" ", ""))) return w;
                if (w.equals("majordome") && t.matches(".*\\bmajor ?dome?s?\\b.*")) return w;
                if (w.equals("jarvis") && t.matches(".*\\b(jar ?vi[sc]e?|jarvi|djarvis)\\b.*")) return w;
            }
            return "";
        }
        static String field(String json, String k) { try { return new JSONObject(json).optString(k, ""); } catch (Exception e) { return ""; } }
        static void beep() { try { if (tone == null) tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 70); tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 160); } catch (Throwable t) { } }

        public void run() {
            int rate = 16000, min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            AudioRecord rec = null;
            try {
                rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, 8192) * 2);
                if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new Exception("micro occupé ou refusé");
                rec.startRecording();
                short[] buf = new short[1600]; double lp1 = 0, lp2 = 0;
                while (true) {
                    Recognizer c, w; boolean wake;
                    synchronized (LOCK) { c = cmdRec; w = wakeRec; wake = wakeOn && !wakePaused && !Ecoute.paused; }
                    if (c == null && (!wake || w == null)) break;
                    int n = rec.read(buf, 0, c != null ? 800 : buf.length);
                    if (n <= 0) continue;
                    long now = System.currentTimeMillis();
                    if (c != null) {
                        // niveau (RMS) et 3 bandes par filtres passe-bas du premier ordre (≈ 400 Hz et 2 kHz à 16 kHz) : quelques opérations par échantillon
                        double s = 0, sl = 0, sh = 0;
                        for (int i = 0; i < n; i++) { double x = buf[i]; lp1 += 0.145 * (x - lp1); lp2 += 0.55 * (x - lp2); double hi = x - lp2; s += x * x; sl += lp1 * lp1; sh += hi * hi; }
                        double rms = Math.sqrt(s / n) / 32768.0, v = Math.min(1, rms * 9), lo = Math.min(1, Math.sqrt(sl / n) / 32768.0 * 11), hb = Math.min(1, Math.sqrt(sh / n) / 32768.0 * 22), mid = Math.max(0, Math.min(1, v - (lo + hb) * 0.5));
                        try { send("level", new JSONObject().put("v", Math.round(v * 1000) / 1000.0).put("b", new JSONArray().put(Math.round(lo * 1000) / 1000.0).put(Math.round(mid * 1000) / 1000.0).put(Math.round(hb * 1000) / 1000.0)).toString()); } catch (Exception e) { }
                        MajordomeWallpaper.Voix.mic(ctx, v);
                        String done = null; boolean end = false;
                        synchronized (LOCK) {
                            if (cmdRec == c) {
                                if (c.acceptWaveForm(buf, n)) { String t = field(c.getResult(), "text"); if (!t.trim().isEmpty()) { done = t; end = true; } }
                                else { String p = field(c.getPartialResult(), "partial"); if (!p.isEmpty()) send("partial", obj("text", p)); }
                                if (!end && now > cmdEnd) { done = field(c.getFinalResult(), "text"); end = true; }
                                if (end) { try { c.close(); } catch (Throwable t) { } cmdRec = null; }
                            }
                        }
                        if (end) { MajordomeWallpaper.Voix.end("listen"); deliver(done == null ? "" : done, cmdFromWake); }
                        continue;
                    }
                    if (holding || now < holdUntil) continue;
                    String got = null, full = null;
                    synchronized (LOCK) {
                        if (wakeRec == w) {
                            if (w.acceptWaveForm(buf, n)) { full = field(w.getResult(), "text"); got = hit(full); }
                            else { String p = field(w.getPartialResult(), "partial"); if (!p.isEmpty() && norm(p).split(" ").length <= 2) got = hit(p); }
                            if (got != null && !got.isEmpty()) { try { w.close(); } catch (Throwable t) { } try { wakeRec = new Recognizer(model, 16000.0f); } catch (Throwable t) { wakeRec = null; } }
                        }
                    }
                    if (got == null || got.isEmpty()) continue;
                    String rest = "";
                    if (full != null) { String t = norm(full); int k = t.indexOf(got); rest = k >= 0 ? t.substring(k + got.length()).trim() : ""; }
                    if (rest.split(" ").length >= 2) deliver(full, true);
                    else { beep(); onWake(); }
                }
            } catch (Throwable t) {
                send("error", obj("msg", "Micro indisponible : " + t.getMessage()));
            } finally {
                if (rec != null) { try { rec.stop(); } catch (Throwable t) { } rec.release(); }
                send("level", obj("v", 0)); MajordomeWallpaper.Voix.end("listen");
            }
        }
        /** Mot de réveil entendu : page ouverte → elle écoute ; sinon le service écoute la commande lui-même */
        static void onWake() {
            if (live != null && resumed) { send("wake", "{}"); return; }
            command(ctx, 8000, true);
        }
        static void deliver(String text, boolean fromWake) {
            String js; try { js = new JSONObject().put("text", text == null ? "" : text).put("wake", fromWake).toString(); } catch (Exception e) { js = "{}"; }
            if (live != null && resumed) { send("result", js); return; }
            if (!fromWake) { send("result", js); return; }
            if (text == null || text.trim().isEmpty()) return;
            pendingCmd = text;
            bringUp(ctx, text);
        }
    }

    /** Ouvre l'appli avec la commande (Android limite l'ouverture depuis l'arrière-plan : « affichage par-dessus » ou notification plein écran) */
    static void bringUp(Context c, String text) {
        Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (i == null) return;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        i.putExtra("majordome_cmd", text);
        boolean overlay = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
        if (overlay) { try { c.startActivity(i); return; } catch (Throwable t) { } }
        channels(c);
        PendingIntent pi = PendingIntent.getActivity(c, 6603, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = nb(c, CH_CMD).setSmallIcon(c.getApplicationInfo().icon).setContentTitle(Lien.clip("« " + text + " »", Lien.TITLE_MAX)).setContentText("Touchez pour la réponse")
            .setAutoCancel(true).setContentIntent(pi).setFullScreenIntent(pi, true).setCategory(Notification.CATEGORY_CALL);
        try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_CMD, b.build()); } catch (Throwable t) { }
    }

    @SuppressWarnings("deprecation")
    static Notification.Builder nb(Context c, String ch) { return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c); }
    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel w = new NotificationChannel(CH_WAKE, "Écoute continue", NotificationManager.IMPORTANCE_LOW); w.setDescription("Indique que le micro attend le mot de réveil"); nm.createNotificationChannel(w);
        NotificationChannel k = new NotificationChannel(CH_CMD, "Commande vocale", NotificationManager.IMPORTANCE_HIGH); nm.createNotificationChannel(k);
        NotificationChannel al = new NotificationChannel(CH_ALARM, "Réveils et minuteurs", NotificationManager.IMPORTANCE_HIGH);
        al.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        al.enableVibration(true); al.setBypassDnd(true); nm.createNotificationChannel(al);
        NotificationChannel r = new NotificationChannel(CH_RAPPEL, "Rappels", NotificationManager.IMPORTANCE_HIGH); r.enableVibration(true); nm.createNotificationChannel(r);
        // Montre connectée : alertes courtes recopiées par l'appli Zepp (silencieuses sur le téléphone, la montre vibre),
        // et liaison locale (service au premier plan, importance minimale : rien à voir ni à entendre)
        NotificationChannel wa = new NotificationChannel(CH_WATCH, "Montre connectée : alertes", NotificationManager.IMPORTANCE_HIGH);
        wa.setDescription("Vent fort, vigilance, résumé du matin, réponses : textes courts pour la montre"); wa.setSound(null, null); wa.enableVibration(true); nm.createNotificationChannel(wa);
        NotificationChannel li = new NotificationChannel(CH_LINK, "Montre connectée : liaison", NotificationManager.IMPORTANCE_MIN);
        li.setDescription("Indique que la mini-appli Jarvis de la montre peut joindre Majordome"); li.setShowBadge(false); nm.createNotificationChannel(li);
    }

    // ---------- Écoute continue : service au premier plan ----------
    @JavascriptInterface public void wake(String json) {
        try {
            JSONObject o = new JSONObject(json == null ? "{}" : json);
            boolean on = o.optBoolean("on", false);
            JSONArray w = o.optJSONArray("words"); StringBuilder sb = new StringBuilder();
            if (w != null) for (int i = 0; i < w.length(); i++) { if (i > 0) sb.append('|'); sb.append(w.optString(i)); }
            prefs(a).edit().putBoolean("wake", on && modelReady(a)).putString("words", sb.length() > 0 ? sb.toString() : "majordome").putBoolean("charging", o.optBoolean("charging", false)).putString("name", o.optString("name", "Majordome")).apply();
            if (on && modelReady(a)) {
                if (!hasMic()) { ui.post(new Runnable() { public void run() { a.requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_MIC); } }); return; }
                askNotif();
                Ecoute.start(a);
            } else { Ecoute.stop(a); Ear.setWake(a, false, null); }
        } catch (Exception e) { }
    }
    @JavascriptInterface public String wakeState() { try { return new JSONObject().put("on", prefs(a).getBoolean("wake", false)).put("running", Ecoute.running).put("paused", Ecoute.paused).toString(); } catch (Exception e) { return "{}"; } }

    public static class Ecoute extends Service {
        static volatile boolean running = false, paused = false;
        private BroadcastReceiver power;
        static void start(Context c) { Intent i = new Intent(c, Ecoute.class); if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); }
        static void stop(Context c) { try { c.stopService(new Intent(c, Ecoute.class)); } catch (Throwable t) { } }
        @Override public IBinder onBind(Intent i) { return null; }
        @Override public int onStartCommand(Intent intent, int flags, int id) {
            channels(this);
            if (intent != null && "stop".equals(intent.getAction())) { prefs(this).edit().putBoolean("wake", false).apply(); send("wakestate", "{\"on\":false}"); stopSelf(); return START_NOT_STICKY; }
            fg();
            if (!prefs(this).getBoolean("wake", false) || !modelReady(this)) { stopSelf(); return START_NOT_STICKY; }
            running = true;
            if (power == null) {
                power = new BroadcastReceiver() { public void onReceive(Context c, Intent i) { apply(); } };
                IntentFilter f = new IntentFilter(); f.addAction(Intent.ACTION_POWER_CONNECTED); f.addAction(Intent.ACTION_POWER_DISCONNECTED);
                registerReceiver(power, f);
            }
            apply();
            return START_STICKY;
        }
        void apply() {
            boolean onlyCharging = prefs(this).getBoolean("charging", false);
            boolean charging = isCharging(this);
            paused = onlyCharging && !charging;
            Ear.setWake(this, !paused, prefs(this).getString("words", "majordome").split("\\|"));
            fg();
            send("wakestate", "{\"on\":true,\"running\":true,\"paused\":" + paused + "}");
        }
        static boolean isCharging(Context c) {
            Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            return b != null && b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
        }
        void fg() {
            String name = prefs(this).getString("name", "Majordome");
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent pi = PendingIntent.getActivity(this, 6604, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            PendingIntent st = PendingIntent.getService(this, 6605, new Intent(this, Ecoute.class).setAction("stop"), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = nb(this, CH_WAKE).setSmallIcon(getApplicationInfo().icon).setOngoing(true).setContentIntent(pi)
                .setContentTitle(paused ? name + " : en pause" : name + " vous écoute")
                .setContentText(paused ? "Écoute seulement quand le téléphone est en charge" : "Dites « " + name + " » · rien n'est enregistré ni envoyé")
                .addAction(new Notification.Action.Builder(null, "Arrêter l'écoute", st).build()).build();
            try {
                if (Build.VERSION.SDK_INT >= 30) startForeground(N_WAKE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
                else startForeground(N_WAKE, n);
            } catch (Throwable t) { send("error", obj("msg", "Android refuse l'écoute en arrière-plan : ouvrez " + name + " puis réactivez l'écoute continue.")); stopSelf(); }
        }
        @Override public void onDestroy() {
            running = false; paused = false;
            if (power != null) { try { unregisterReceiver(power); } catch (Throwable t) { } power = null; }
            Ear.setWake(this, false, null);
            send("wakestate", "{\"on\":false,\"running\":false}");
            super.onDestroy();
        }
    }

    // =====================================================================
    // Voix (TextToSpeech)
    // =====================================================================
    private TextToSpeech tts; private boolean ttsOk = false; private final ArrayList<String[]> ttsQ = new ArrayList<>();
    private final java.util.Map<String, String[]> ttsText = new java.util.concurrent.ConcurrentHashMap<>();   // texte et débit de chaque phrase (enveloppe de Voix)
    private void ttsInit() {
        if (tts != null) return;
        tts = new TextToSpeech(a.getApplicationContext(), new TextToSpeech.OnInitListener() { public void onInit(int st) {
            ttsOk = st == TextToSpeech.SUCCESS;
            if (!ttsOk) { for (String[] q : ttsQ) emit("spoken", obj("id", q[2])); ttsQ.clear(); return; }
            tts.setLanguage(Locale.FRANCE);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                public void onStart(String id) { String[] u = ttsText.get(id); MajordomeWallpaper.Voix.speakStart(a, u != null ? u[0] : "", u != null ? Float.parseFloat(u[1]) : 1f); }
                public void onDone(String id) { ttsText.remove(id); MajordomeWallpaper.Voix.end("speak"); emit("spoken", obj("id", id)); }
                @SuppressWarnings("deprecation") public void onError(String id) { ttsText.remove(id); MajordomeWallpaper.Voix.end("speak"); emit("spoken", obj("id", id)); }
                public void onStop(String id, boolean interrupted) { ttsText.remove(id); MajordomeWallpaper.Voix.end("speak"); }
                // mot prononcé (Android 8+) : la page et Voix en tirent une enveloppe syllabique
                public void onRangeStart(String id, int s, int e, int f) { MajordomeWallpaper.Voix.word(s, e); try { emit("boundary", new JSONObject().put("s", s).put("e", e).toString()); } catch (Exception x) { emit("boundary", "{}"); } }
            });
            for (String[] q : ttsQ) sayNow(q[0], q[1], q[2]); ttsQ.clear();
        } });
    }
    @JavascriptInterface public String voices() {
        JSONArray r = new JSONArray();
        try {
            ttsInit();
            if (ttsOk && tts.getVoices() != null) for (Voice v : tts.getVoices()) {
                if (v.getLocale() == null || !"fr".equals(v.getLocale().getLanguage())) continue;
                if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                String n = v.getName(), c = v.getLocale().getCountry();
                r.put(new JSONObject().put("id", n).put("name", (c.isEmpty() ? "Français" : "Français (" + c + ")") + " · " + n.replaceAll("^[a-z]{2}-[a-z]{2}-x-", "").replaceAll("-(local|network)$", "") + (v.getQuality() >= Voice.QUALITY_HIGH ? " ★" : "")).put("lang", v.getLocale().toLanguageTag()).put("local", !v.isNetworkConnectionRequired()));
            }
        } catch (Exception e) { }
        return r.toString();
    }
    @JavascriptInterface public void say(final String text, final String json) {
        ui.post(new Runnable() { public void run() {
            ttsInit();
            String id = "s"; try { id = new JSONObject(json).optString("id", "s"); } catch (Exception e) { }
            if (!ttsOk) { ttsQ.add(new String[]{ text, json, id }); return; }
            sayNow(text, json, id);
        } });
    }
    private void sayNow(String text, String json, String id) {
        try {
            JSONObject o = new JSONObject(json == null ? "{}" : json);
            String vn = o.optString("voice", "");
            if (!vn.isEmpty() && tts.getVoices() != null) for (Voice v : tts.getVoices()) if (v.getName().equals(vn)) { tts.setVoice(v); break; }
            tts.setSpeechRate((float) o.optDouble("rate", 1));
            tts.setPitch((float) o.optDouble("pitch", 1));
            Bundle p = new Bundle(); p.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, (float) Math.max(0.05, Math.min(1, o.optDouble("volume", 1))));
            ttsText.put(id, new String[]{ text, String.valueOf((float) o.optDouble("rate", 1)) });
            tts.speak(text, TextToSpeech.QUEUE_ADD, p, id);
        } catch (Throwable t) { emit("spoken", obj("id", id)); }
    }
    @JavascriptInterface public void shush() { piperStop(); ui.post(new Runnable() { public void run() { if (tts != null) tts.stop(); ttsText.clear(); MajordomeWallpaper.Voix.end("speak"); } }); }

    // =====================================================================
    // Voix Piper : fichiers (stockage privé) et lecture (AudioTrack)
    // =====================================================================
    static File piperRoot(Context c) { return new File(c.getFilesDir(), "piper"); }
    static boolean piperName(String m) { return m != null && m.matches("fr_FR-[a-z]+-(x_low|low|medium|high)"); }
    static String readText(File f) throws Exception { try (InputStream in = new java.io.FileInputStream(f)) { return new String(readAll(in, 1 << 20), "UTF-8"); } }
    static byte[] readAll(InputStream in, int max) throws Exception {
        java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream(); byte[] b = new byte[16384]; int n;
        while ((n = in.read(b)) > 0) { o.write(b, 0, n); if (o.size() > max) throw new Exception("fichier trop gros"); }
        return o.toByteArray();
    }
    static String hex(byte[] d) { StringBuilder s = new StringBuilder(); for (byte x : d) s.append(String.format("%02x", x & 0xff)); return s.toString(); }
    static void piperEvent(String m, String st, double prog, String msg, Boolean verified) {
        try { JSONObject o = new JSONObject().put("model", m).put("state", st).put("progress", prog); if (msg != null) o.put("msg", msg); if (verified != null) o.put("verified", verified.booleanValue()); send("piper", o.toString()); } catch (Exception e) { }
    }
    /** Connexion https (redirections https seulement, comme pour le modèle Vosk) */
    static HttpURLConnection httpsOpen(String url) throws Exception {
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection h = (HttpURLConnection) new URL(cur).openConnection();
            h.setConnectTimeout(15000); h.setReadTimeout(30000); h.setInstanceFollowRedirects(false);
            h.setRequestProperty("User-Agent", "Majordome/1.0 (Android)");
            int code = h.getResponseCode();
            if (code >= 300 && code < 400 && h.getHeaderField("Location") != null) { String loc = new URL(new URL(cur), h.getHeaderField("Location")).toString(); h.disconnect(); if (!loc.startsWith("https://")) throw new Exception("redirection refusée"); cur = loc; continue; }
            if (code != 200) { h.disconnect(); throw new Exception("HTTP " + code); }
            return h;
        }
        throw new Exception("trop de redirections");
    }
    /** Sommes attendues (API de HuggingFace) : nom → {sha256 (LFS), oid (git), size} ; vide si injoignable */
    static JSONObject piperExpected(String api) {
        JSONObject o = new JSONObject();
        try {
            HttpURLConnection h = httpsOpen(api);
            try (InputStream in = h.getInputStream()) {
                JSONArray l = new JSONArray(new String(readAll(in, 1 << 20), "UTF-8"));
                for (int i = 0; i < l.length(); i++) {
                    JSONObject f = l.getJSONObject(i), lfs = f.optJSONObject("lfs"); String p = f.optString("path"); p = p.substring(p.lastIndexOf('/') + 1);
                    o.put(p, new JSONObject().put("sha256", lfs != null ? lfs.optString("oid") : "").put("oid", f.optString("oid")).put("size", lfs != null ? lfs.optLong("size") : f.optLong("size")));
                }
            } finally { h.disconnect(); }
        } catch (Throwable t) { }
        return o;
    }
    static String gitSha1(byte[] b) throws Exception { java.security.MessageDigest d = java.security.MessageDigest.getInstance("SHA-1"); d.update(("blob " + b.length + "\0").getBytes("UTF-8")); d.update(b); return hex(d.digest()); }
    static void piperCheckJson(byte[] b) throws Exception {
        JSONObject j = new JSONObject(new String(b, "UTF-8"));
        if (j.optJSONObject("phoneme_id_map") == null || j.optJSONObject("audio") == null) throw new Exception("fichier .onnx.json invalide");
        JSONObject es = j.optJSONObject("espeak"); if (es != null && !es.optString("voice", "fr").startsWith("fr")) throw new Exception("ce n'est pas une voix française");
    }
    /** Installe : dossier temporaire → files/piper/<modèle>/ (+ ok.json : taille, somme, vérifiée) */
    static void piperInstall(Context c, String m, File tmpOnnx, byte[] json, String sha, boolean verified) throws Exception {
        File dir = new File(piperRoot(c), m), tmp = new File(piperRoot(c), m + ".tmp");
        deleteTree(tmp); tmp.mkdirs();
        if (!tmpOnnx.renameTo(new File(tmp, m + ".onnx"))) throw new Exception("installation impossible");
        try (OutputStream o = new FileOutputStream(new File(tmp, m + ".onnx.json"))) { o.write(json); }
        long size = new File(tmp, m + ".onnx").length();
        try (OutputStream o = new FileOutputStream(new File(tmp, "ok.json"))) { o.write(new JSONObject().put("size", size).put("sha256", sha).put("verified", verified).put("at", System.currentTimeMillis()).toString().getBytes("UTF-8")); }
        deleteTree(dir); if (!tmp.renameTo(dir)) throw new Exception("installation impossible");
    }
    static final java.util.Set<String> piperBusy = Collections.synchronizedSet(new java.util.HashSet<String>());
    @JavascriptInterface public String piperDir() { return piperRoot(a).getAbsolutePath(); }
    @JavascriptInterface public String piperState() {
        JSONObject ms = new JSONObject();
        File[] l = piperRoot(a).listFiles();
        if (l != null) for (File d : l) { File ok = new File(d, "ok.json"); if (d.isDirectory() && ok.exists()) try { ms.put(d.getName(), new JSONObject(readText(ok))); } catch (Exception e) { } }
        try { return new JSONObject().put("models", ms).put("busy", new JSONArray(new ArrayList<String>(piperBusy))).toString(); } catch (Exception e) { return "{}"; }
    }
    @JavascriptInterface public void piperDownload(final String m, final String base, final String api) {
        if (!piperName(m) || base == null || !base.startsWith("https://huggingface.co/") || api == null || !api.startsWith("https://huggingface.co/api/")) { piperEvent(m, "error", 0, "adresse refusée", null); return; }
        if (!piperBusy.add(m)) return;
        final Context c = a.getApplicationContext();
        new Thread(new Runnable() { public void run() {
            File part = new File(c.getCacheDir(), m + ".onnx.part");
            try {
                piperEvent(m, "downloading", 0, null, null);
                JSONObject exp = piperExpected(api);
                JSONObject ej = exp.optJSONObject(m + ".onnx.json"), eo = exp.optJSONObject(m + ".onnx");
                HttpURLConnection h = httpsOpen(base + m + ".onnx.json"); byte[] json;
                try (InputStream in = h.getInputStream()) { json = readAll(in, 1 << 20); } finally { h.disconnect(); }
                piperCheckJson(json);
                if (ej != null && ej.optString("oid").length() == 40 && !ej.optString("oid").equals(gitSha1(json))) throw new Exception("somme du fichier .onnx.json incorrecte");
                h = httpsOpen(base + m + ".onnx");
                long total = h.getContentLengthLong(); if (total <= 0 && eo != null) total = eo.optLong("size");
                java.security.MessageDigest d = java.security.MessageDigest.getInstance("SHA-256");
                try (InputStream in = h.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                    byte[] b = new byte[65536]; long got = 0, last = 0; int n;
                    while ((n = in.read(b)) > 0) {
                        out.write(b, 0, n); d.update(b, 0, n); got += n;
                        if (got > 250L * 1024 * 1024) throw new Exception("fichier trop gros");
                        long now = System.currentTimeMillis();
                        if (now - last > 400) { last = now; piperEvent(m, "downloading", total > 0 ? Math.min(0.99, (double) got / total) : 0.5, null, null); }
                    }
                } finally { h.disconnect(); }
                String sha = hex(d.digest()), want = eo != null ? eo.optString("sha256") : "";
                if (want.length() == 64 && !want.equals(sha)) throw new Exception("somme SHA-256 incorrecte (fichier abîmé)");
                piperInstall(c, m, part, json, sha, want.length() == 64);
                piperEvent(m, "ready", 1, null, want.length() == 64);
            } catch (Throwable t) {
                piperEvent(m, "error", 0, "Téléchargement impossible (" + t.getMessage() + "). Vérifiez la connexion, ou téléchargez les deux fichiers de la voix avec le navigateur puis « Choisir les fichiers téléchargés ».", null);
            } finally { part.delete(); piperBusy.remove(m); }
        } }).start();
    }
    @JavascriptInterface public void piperDelete(String m) {
        if (!piperName(m)) return;
        piperStop(); deleteTree(new File(piperRoot(a), m)); piperEvent(m, "removed", 0, null, null);
    }
    @JavascriptInterface public void piperPick() {
        ui.post(new Runnable() { public void run() {
            try { Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true); a.startActivityForResult(i, REQ_PIPER); }
            catch (Throwable t) { toast("Sélecteur de fichiers indisponible"); }
        } });
    }
    /** Fichiers choisis : la voix (.onnx) et sa description (.onnx.json) ; somme vérifiée si HuggingFace répond */
    private void piperPicked(int res, Intent data) {
        if (res != Activity.RESULT_OK || data == null) return;
        final ArrayList<Uri> us = new ArrayList<>();
        if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) us.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) us.add(data.getData());
        final Context c = a.getApplicationContext();
        new Thread(new Runnable() { public void run() {
            String m = null;
            try {
                Uri uo = null, uj = null;
                for (Uri u : us) {
                    String n = displayName(c, u);
                    if (n.endsWith(".onnx.json")) uj = u; else if (n.endsWith(".onnx")) { uo = u; m = n.substring(0, n.length() - 5); }
                }
                if (uo == null || uj == null) throw new Exception("choisissez les deux fichiers : la voix (.onnx) et sa description (.onnx.json)");
                if (!piperName(m)) throw new Exception("nom de voix inattendu : " + m);
                piperEvent(m, "downloading", 0.5, null, null);
                byte[] json; try (InputStream in = c.getContentResolver().openInputStream(uj)) { json = readAll(in, 1 << 20); }
                piperCheckJson(json);
                File part = new File(c.getCacheDir(), m + ".onnx.part");
                java.security.MessageDigest d = java.security.MessageDigest.getInstance("SHA-256");
                try (InputStream in = c.getContentResolver().openInputStream(uo); OutputStream out = new FileOutputStream(part)) {
                    byte[] b = new byte[65536]; int n; long got = 0;
                    while ((n = in.read(b)) > 0) { out.write(b, 0, n); d.update(b, 0, n); got += n; if (got > 250L * 1024 * 1024) throw new Exception("fichier trop gros"); }
                }
                String sha = hex(d.digest());
                String dir = m.replaceAll("^fr_FR-([a-z]+)-([a-z_]+)$", "fr/fr_FR/$1/$2");
                JSONObject eo = piperExpected("https://huggingface.co/api/models/rhasspy/piper-voices/tree/main/" + dir).optJSONObject(m + ".onnx");
                String want = eo != null ? eo.optString("sha256") : "";
                if (want.length() == 64 && !want.equals(sha)) { part.delete(); throw new Exception("somme SHA-256 différente de celle de HuggingFace"); }
                piperInstall(c, m, part, json, sha, want.length() == 64);
                piperEvent(m, "ready", 1, null, want.length() == 64);
            } catch (Throwable t) { piperEvent(m == null ? "" : m, "error", 0, "Fichiers refusés : " + t.getMessage(), null); }
        } }).start();
    }
    static String displayName(Context c, Uri u) {
        try (android.database.Cursor q = c.getContentResolver().query(u, new String[]{ android.provider.OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (q != null && q.moveToFirst()) return q.getString(0);
        } catch (Throwable t) { }
        String p = u.getLastPathSegment(); return p == null ? "" : p.substring(p.lastIndexOf('/') + 1);
    }

    // ---------- Lecture : file de phrases, un fil « piper », AudioTrack en flux ----------
    private final java.util.ArrayDeque<Object[]> pq = new java.util.ArrayDeque<>();
    private Thread pth; private volatile boolean pstop = false; private Object afr;
    private final AudioManager.OnAudioFocusChangeListener afl = new AudioManager.OnAudioFocusChangeListener() { public void onAudioFocusChange(int f) { if (f == AudioManager.AUDIOFOCUS_LOSS) piperStop(); } };
    @JavascriptInterface public void piperPlay(String id, String b64, int sr) {
        byte[] b = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
        short[] s = new short[b.length / 2];
        java.nio.ByteBuffer.wrap(b).order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(s);
        synchronized (pq) {
            pq.add(new Object[]{ id, s, Math.max(8000, Math.min(48000, sr)) }); pq.notifyAll();
            if (pth == null || !pth.isAlive()) { pstop = false; pth = new Thread(new Runnable() { public void run() { playLoop(); } }, "piper"); pth.start(); }
        }
    }
    @JavascriptInterface public void piperStop() { synchronized (pq) { pstop = true; pq.clear(); pq.notifyAll(); } }
    private void focus(boolean on) {
        try {
            AudioManager am = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) {
                if (on) { android.media.AudioFocusRequest r = new android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setOnAudioFocusChangeListener(afl).build(); afr = r; am.requestAudioFocus(r); }
                else if (afr != null) { am.abandonAudioFocusRequest((android.media.AudioFocusRequest) afr); afr = null; }
            } else {
                if (on) am.requestAudioFocus(afl, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK); else am.abandonAudioFocus(afl);
            }
        } catch (Throwable t) { }
    }
    private void playLoop() {
        final Context c = a.getApplicationContext();
        android.media.AudioTrack t = null; int curSr = 0;
        focus(true); Ear.hold(true);
        try {
            while (true) {
                Object[] it;
                synchronized (pq) {
                    long until = System.currentTimeMillis() + 700;   // attend la phrase suivante un instant (focus gardé)
                    while (pq.isEmpty() && !pstop) { long w = until - System.currentTimeMillis(); if (w <= 0) break; try { pq.wait(w); } catch (InterruptedException e) { break; } }
                    if (pstop || pq.isEmpty()) break;
                    it = pq.poll();
                }
                String id = (String) it[0]; short[] s = (short[]) it[1]; int sr = (Integer) it[2];
                if (t == null || curSr != sr) {
                    if (t != null) { try { t.stop(); } catch (Throwable x) { } t.release(); }
                    int min = android.media.AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
                    t = new android.media.AudioTrack.Builder()
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                        .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                        .setBufferSizeInBytes(Math.max(min, sr / 5 * 2)).setTransferMode(android.media.AudioTrack.MODE_STREAM).build();
                    t.play(); curSr = sr;
                }
                emit("pchunk", "{\"id\":" + JSONObject.quote(id) + ",\"phase\":\"start\"}");
                int frame = Math.max(1, sr / 50); long head0 = t.getPlaybackHeadPosition() & 0xffffffffL, written = 0;
                for (int off = 0; off < s.length && !pstop; off += frame) {
                    int n = Math.min(frame, s.length - off); double acc = 0;
                    for (int k = off; k < off + n; k++) acc += (double) s[k] * s[k];
                    double rms = Math.sqrt(acc / n) / 32768.0;
                    MajordomeWallpaper.Voix.speakLevel(c, (float) Math.min(1, Math.pow(rms * 5.5, 0.8)));
                    int w = t.write(s, off, n); if (w < 0) break; written += w;
                }
                long end = System.currentTimeMillis() + 3000;   // fin réelle du son : tête de lecture
                while (!pstop && ((t.getPlaybackHeadPosition() & 0xffffffffL) - head0) < written && System.currentTimeMillis() < end) { try { Thread.sleep(15); } catch (InterruptedException e) { break; } }
                emit("pchunk", "{\"id\":" + JSONObject.quote(id) + ",\"phase\":\"end\"}");
            }
        } catch (Throwable e) {
            synchronized (pq) { for (Object[] it : pq) emit("pchunk", "{\"id\":" + JSONObject.quote((String) it[0]) + ",\"phase\":\"end\"}"); pq.clear(); }
        } finally {
            if (t != null) { try { if (pstop) t.pause(); t.flush(); t.stop(); } catch (Throwable x) { } t.release(); }
            Ear.hold(false); focus(false); MajordomeWallpaper.Voix.end("speak");
            synchronized (pq) { pth = null; }
        }
    }

    // =====================================================================
    // Minuteurs, réveils, rappels (AlarmManager)
    // =====================================================================
    static JSONObject alarms(Context c) { try { return new JSONObject(prefs(c).getString("alarms", "{}")); } catch (Exception e) { return new JSONObject(); } }
    static void saveAlarms(Context c, JSONObject o) { prefs(c).edit().putString("alarms", o.toString()).apply(); }
    static PendingIntent ringPi(Context c, String id) {
        Intent i = new Intent(c, Rappel.class).setAction("mj.RING").putExtra("id", id);
        return PendingIntent.getBroadcast(c, 7000 + (id.hashCode() & 0xffff), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    static boolean canExact(Context c) { if (Build.VERSION.SDK_INT < 31) return true; try { return ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms(); } catch (Throwable t) { return false; } }
    static void schedule(Context c, JSONObject o) {
        AlarmManager m = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        long at = o.optLong("at"); PendingIntent p = ringPi(c, o.optString("id"));
        try {
            if ("alarm".equals(o.optString("kind"))) {
                Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
                m.setAlarmClock(new AlarmManager.AlarmClockInfo(at, PendingIntent.getActivity(c, 6606, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)), p);
            } else if (canExact(c)) m.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            else m.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        } catch (SecurityException e) { try { m.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p); } catch (Throwable t) { } }
    }
    @JavascriptInterface public void alarmSet(String json) {
        try {
            JSONObject o = new JSONObject(json), all = alarms(a);
            all.put(o.getString("id"), o); saveAlarms(a, all); schedule(a, o); askNotif();
        } catch (Exception e) { toast("Alarme impossible : " + e.getMessage()); }
    }
    @JavascriptInterface public void alarmCancel(String id) {
        JSONObject all = alarms(a); all.remove(id); saveAlarms(a, all);
        try { ((AlarmManager) a.getSystemService(Context.ALARM_SERVICE)).cancel(ringPi(a, id)); } catch (Throwable t) { }
        try { ((NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(N_ALARM_BASE + (id.hashCode() & 0x3ff)); } catch (Throwable t) { }
    }
    @JavascriptInterface public String alarmList() { return alarms(a).toString(); }

    public static class Rappel extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent in) {
            String act = in.getAction(); if (act == null) return;
            String id = in.getStringExtra("id");
            try {
                if ("mj.RING".equals(act) && id != null) {
                    JSONObject all = alarms(c), o = all.optJSONObject(id);
                    if (o == null) return;
                    if ("hue".equals(o.optString("kind"))) { all.remove(id); saveAlarms(c, all); hueLater(c, id, o, goAsync()); return; }
                    // page ouverte : elle sonne et parle elle-même ; montre connectée : copie silencieuse pour que Zepp la recopie
                    if (live != null && resumed) { send("alarm", obj("id", id)); if (watchOn(c)) watchAlarmCopy(c, id, o); return; }
                    channels(c);
                    boolean loud = !"reminder".equals(o.optString("kind"));
                    Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
                    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    PendingIntent pi = PendingIntent.getActivity(c, 6607 + (id.hashCode() & 0xff), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                    PendingIntent stop = PendingIntent.getBroadcast(c, 6608 + (id.hashCode() & 0xff), new Intent(c, Rappel.class).setAction("mj.STOP").putExtra("id", id), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                    // titre ≤ 30 caractères, texte ≤ 120 : lisibles tels quels sur une montre (Zepp recopie titre et texte)
                    String[] tt = Lien.alarmContent(o.optString("title", "Majordome"), o.optString("text", ""));
                    Notification.Builder b = nb(c, loud ? CH_ALARM : CH_RAPPEL).setSmallIcon(c.getApplicationInfo().icon)
                        .setContentTitle(tt[0]).setContentText(tt[1])
                        .setStyle(new Notification.BigTextStyle().bigText(tt[1]))
                        .setCategory(loud ? Notification.CATEGORY_ALARM : Notification.CATEGORY_REMINDER).setAutoCancel(true)
                        .setContentIntent(pi).setDeleteIntent(stop).setVisibility(Notification.VISIBILITY_PUBLIC)
                        .addAction(new Notification.Action.Builder(null, "Arrêter", stop).build());
                    if (loud) { b.setFullScreenIntent(pi, true); if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(5 * 60000L); }
                    Notification n = b.build();
                    if (loud) n.flags |= Notification.FLAG_INSISTENT;
                    ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_ALARM_BASE + (id.hashCode() & 0x3ff), n);
                    all.remove(id); saveAlarms(c, all);
                } else if ("mj.STOP".equals(act) && id != null) {
                    ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(N_ALARM_BASE + (id.hashCode() & 0x3ff));
                    JSONObject all = alarms(c); all.remove(id); saveAlarms(c, all);
                } else {
                    // démarrage du téléphone, mise à jour de l'appli : on reprogramme ce qui est à venir
                    JSONObject all = alarms(c); long now = System.currentTimeMillis();
                    Iterator<String> k = all.keys(); ArrayList<String> old = new ArrayList<>();
                    while (k.hasNext()) { String x = k.next(); JSONObject o = all.optJSONObject(x); if (o == null || o.optLong("at") < now - 60000) old.add(x); else schedule(c, o); }
                    for (String x : old) all.remove(x);
                    saveAlarms(c, all);
                    // montre connectée : le serveur local repart s'il était actif (démarrage, mise à jour de l'appli)
                    if (watchOn(c)) Montre.sync(c);
                }
            } catch (Throwable t) { }
        }
    }

    // =====================================================================
    // Téléphone
    // =====================================================================
    boolean has(String p) { return a.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED; }
    void askNotif() { if (Build.VERSION.SDK_INT >= 33 && !has("android.permission.POST_NOTIFICATIONS")) ui.post(new Runnable() { public void run() { a.requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" }, REQ_PERM); } }); }
    void toast(final String t) { ui.post(new Runnable() { public void run() { Toast.makeText(a, t, Toast.LENGTH_LONG).show(); } }); }
    /** Appel : la page a déjà demandé et obtenu la confirmation. Sans l'autorisation « Téléphone », le numéro est composé et l'utilisateur appuie lui-même. */
    @JavascriptInterface public void call(final String num) {
        ui.post(new Runnable() { public void run() {
            String n = num == null ? "" : num.replaceAll("[^0-9+*#]", "");
            if (n.isEmpty()) return;
            try {
                if (has(Manifest.permission.CALL_PHONE)) a.startActivity(new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(n))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                else { a.requestPermissions(new String[]{ Manifest.permission.CALL_PHONE }, REQ_PERM); a.startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(n))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            } catch (Throwable t) { toast("Appel impossible : " + t.getMessage()); }
        } });
    }
    /** SMS : envoyé seulement après confirmation dans la page */
    @JavascriptInterface public void sms(final String num, final String text) {
        ui.post(new Runnable() { public void run() {
            String n = num == null ? "" : num.replaceAll("[^0-9+]", "");
            if (n.isEmpty() || text == null || text.isEmpty()) { emit("sms", "{\"ok\":false,\"err\":\"numéro ou texte manquant\"}"); return; }
            if (!has(Manifest.permission.SEND_SMS)) { a.requestPermissions(new String[]{ Manifest.permission.SEND_SMS }, REQ_PERM); emit("sms", obj("err", "autorisez l'envoi de SMS puis redemandez")); return; }
            try {
                android.telephony.SmsManager sm = Build.VERSION.SDK_INT >= 31 ? a.getSystemService(android.telephony.SmsManager.class) : android.telephony.SmsManager.getDefault();
                ArrayList<String> parts = sm.divideMessage(text);
                sm.sendMultipartTextMessage(n, null, parts, null, null);
                emit("sms", "{\"ok\":true}");
            } catch (Throwable t) { emit("sms", obj("err", String.valueOf(t.getMessage()))); }
        } });
    }
    @JavascriptInterface public String volume(String json) {
        try {
            JSONObject o = new JSONObject(json);
            AudioManager am = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
            int st = "ring".equals(o.optString("stream")) ? AudioManager.STREAM_RING : "alarm".equals(o.optString("stream")) ? AudioManager.STREAM_ALARM : AudioManager.STREAM_MUSIC;
            int max = am.getStreamMaxVolume(st), cur = am.getStreamVolume(st);
            switch (o.optString("dir")) {
                case "up": am.adjustStreamVolume(st, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI); am.adjustStreamVolume(st, AudioManager.ADJUST_RAISE, 0); break;
                case "down": am.adjustStreamVolume(st, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI); am.adjustStreamVolume(st, AudioManager.ADJUST_LOWER, 0); break;
                case "max": am.setStreamVolume(st, max, AudioManager.FLAG_SHOW_UI); break;
                case "mute": am.adjustStreamVolume(st, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI); break;
                case "set": am.setStreamVolume(st, Math.round(max * Math.max(0, Math.min(100, o.optInt("level", 50))) / 100f), AudioManager.FLAG_SHOW_UI); break;
                default: break;
            }
            return new JSONObject().put("level", am.getStreamVolume(st)).put("max", max).put("before", cur).toString();
        } catch (SecurityException e) { return obj("err", "Android refuse ce changement de volume en mode Ne pas déranger."); }
        catch (Exception e) { return obj("err", "Volume : " + e.getMessage()); }
    }
    @JavascriptInterface public String ringer(String mode) {
        try {
            AudioManager am = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
            NotificationManager nm = (NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE);
            boolean policy = Build.VERSION.SDK_INT < 23 || nm.isNotificationPolicyAccessGranted();
            if (("silent".equals(mode) || "dnd".equals(mode) || "normal".equals(mode)) && !policy) {
                if (!"normal".equals(mode)) { fix("dnd"); return "{\"ok\":false,\"need\":\"dnd\"}"; }
            }
            switch (mode) {
                case "vibrate": am.setRingerMode(AudioManager.RINGER_MODE_VIBRATE); break;
                case "silent": am.setRingerMode(AudioManager.RINGER_MODE_SILENT); break;
                case "dnd": nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY); break;
                default: if (policy && Build.VERSION.SDK_INT >= 23) nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL); am.setRingerMode(AudioManager.RINGER_MODE_NORMAL);
            }
            return "{\"ok\":true}";
        } catch (Throwable t) { return obj("err", String.valueOf(t.getMessage())); }
    }
    @JavascriptInterface public void panel(final String what) {
        ui.post(new Runnable() { public void run() {
            try {
                Intent i;
                switch (what) {
                    case "wifi": i = new Intent(Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_WIFI : Settings.ACTION_WIFI_SETTINGS); break;
                    case "internet": i = new Intent(Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_INTERNET_CONNECTIVITY : Settings.ACTION_WIRELESS_SETTINGS); break;
                    case "bluetooth": i = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS); break;
                    case "volume": i = new Intent(Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_VOLUME : Settings.ACTION_SOUND_SETTINGS); break;
                    case "airplane": i = new Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS); break;
                    default: i = new Intent(Settings.ACTION_SETTINGS);
                }
                a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Throwable t) { toast("Réglage indisponible"); }
        } });
    }
    /** Touches multimédia (lecture, pause, suivant, précédent) envoyées au lecteur actif (Mélodie ou autre) */
    @JavascriptInterface public boolean media(String cmd) {
        int k;
        switch (cmd == null ? "" : cmd) {
            case "play": k = KeyEvent.KEYCODE_MEDIA_PLAY; break;
            case "pause": k = KeyEvent.KEYCODE_MEDIA_PAUSE; break;
            case "next": k = KeyEvent.KEYCODE_MEDIA_NEXT; break;
            case "prev": k = KeyEvent.KEYCODE_MEDIA_PREVIOUS; break;
            default: k = KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE;
        }
        try {
            AudioManager am = (AudioManager) a.getSystemService(Context.AUDIO_SERVICE);
            am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, k)); am.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, k));
            return true;
        } catch (Throwable t) { return false; }
    }
    @JavascriptInterface public void openUrl(final String url) {
        ui.post(new Runnable() { public void run() {
            try { if (url != null && url.startsWith("https://")) a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (Throwable t) { toast("Impossible d'ouvrir le lien"); }
        } });
    }

    // =====================================================================
    // Ouvrir n'importe quelle appli (« Ouvre WhatsApp ») et les raccourcis du système
    // =====================================================================
    // Liste des applis lançables : queryIntentActivities(MAIN/LAUNCHER), visibles sur Android 11+ grâce à
    // <queries><intent> MAIN/LAUNCHER du manifeste (pas besoin de QUERY_ALL_PACKAGES). Libellé, paquet, activité.
    // Gardée en mémoire ; effacée à chaque installation / désinstallation / mise à jour (récepteur inscrit tant que
    // Majordome tourne : Android ne livre plus ces diffusions aux récepteurs du manifeste) et refaite au retour dans Majordome.
    static volatile String appsCache = null;
    static volatile boolean pkgRx = false;
    static String appsJson(Context c) {
        JSONArray out = new JSONArray();
        try {
            PackageManager pm = c.getPackageManager();
            List<ResolveInfo> l = pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0);
            ArrayList<JSONObject> rows = new ArrayList<>();
            for (ResolveInfo r : l) {
                if (r.activityInfo == null) continue;
                String pkg = r.activityInfo.packageName;
                if (pkg.equals(c.getPackageName())) continue;
                CharSequence lb = r.loadLabel(pm);
                String label = lb == null ? "" : lb.toString().replaceAll("\\s+", " ").trim();
                if (label.isEmpty()) continue;
                rows.add(new JSONObject().put("label", label).put("pkg", pkg).put("cls", r.activityInfo.name));
            }
            Collections.sort(rows, new Comparator<JSONObject>() { public int compare(JSONObject x, JSONObject y) { return x.optString("label").compareToIgnoreCase(y.optString("label")); } });
            for (JSONObject o : rows) out.put(o);
        } catch (Throwable t) { }
        return out.toString();
    }
    static void watchPackages(Context c) {
        if (pkgRx) return;
        pkgRx = true;
        try {
            BroadcastReceiver rx = new BroadcastReceiver() { public void onReceive(Context x, Intent i) { appsCache = null; } };
            IntentFilter f = new IntentFilter();
            f.addAction(Intent.ACTION_PACKAGE_ADDED); f.addAction(Intent.ACTION_PACKAGE_REMOVED); f.addAction(Intent.ACTION_PACKAGE_CHANGED); f.addAction(Intent.ACTION_PACKAGE_REPLACED);
            f.addDataScheme("package");
            if (Build.VERSION.SDK_INT >= 33) c.registerReceiver(rx, f, Context.RECEIVER_EXPORTED); else c.registerReceiver(rx, f);
        } catch (Throwable t) { pkgRx = false; }
    }
    static void refreshApps(final Context c) { new Thread(new Runnable() { public void run() { appsCache = appsJson(c); } }).start(); }
    @JavascriptInterface public String appList() {
        String s = appsCache;
        if (s == null) { s = appsJson(a.getApplicationContext()); appsCache = s; }
        return s;
    }
    /** Démarre l'activité d'une autre appli. Majordome au premier plan : tout de suite. Hors premier plan (écoute continue,
     *  montre) : Android bloque sans le dire les lancements depuis l'arrière-plan, sauf avec « Affichage par-dessus » ;
     *  sinon notification à toucher (comme pour les commandes de l'écoute continue). → ok | notif | none | err */
    static String startOrNotify(Context c, Intent i, String name) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MajordomeBridge b = live;
        boolean front = b != null && resumed, overlay = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
        if (front || overlay) {
            try { if (front) b.a.startActivity(i); else c.startActivity(i); return "ok"; }
            catch (ActivityNotFoundException e) { return "none"; }
            catch (Throwable t) { if (front) return "err"; }
        }
        try {
            channels(c);
            PendingIntent pi = PendingIntent.getActivity(c, PI_OPEN, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder n = nb(c, CH_CMD).setSmallIcon(c.getApplicationInfo().icon).setContentTitle(Lien.clip("Ouvrir " + name, Lien.TITLE_MAX))
                .setContentText("Touchez pour ouvrir " + name).setAutoCancel(true).setContentIntent(pi).setCategory(Notification.CATEGORY_RECOMMENDATION);
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_OPEN, n.build());
            return "notif";
        } catch (Throwable t) { return "err"; }
    }
    /** Ouvre une appli installée (paquet + activité de la liste, ou l'activité de lancement du paquet). Sans confirmation. */
    @JavascriptInterface public String appLaunch(String pkg, String cls, String name) {
        if (pkg == null || pkg.isEmpty()) return "err";
        Context c = a.getApplicationContext();
        PackageManager pm = c.getPackageManager();
        Intent i = null;
        if (cls != null && !cls.isEmpty()) {
            Intent j = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setComponent(new ComponentName(pkg, cls));
            if (j.resolveActivity(pm) != null) i = j;
        }
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        if (i == null) { appsCache = null; return "absent"; }
        i.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return startOrNotify(c, i, name == null || name.isEmpty() ? pkg : name);
    }
    /** Raccourcis du système par intents standard : paramètres (et sous-pages), appareil photo, téléphone, messages,
     *  agenda, horloge, galerie, contacts, calculatrice, navigateur, messagerie, musique, Play Store. */
    @JavascriptInterface public String sysOpen(String what, String sub, String name) {
        Context c = a.getApplicationContext();
        Intent i = sysIntent(c, what == null ? "" : what, sub == null ? "" : sub);
        if (i == null) return "none";
        return startOrNotify(c, i, name == null || name.isEmpty() ? "l'appli" : name);
    }
    static Intent selector(String cat) { return Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, cat); }
    static String settingsAction(String sub) {
        switch (sub) {
            case "wifi": return Settings.ACTION_WIFI_SETTINGS;
            case "bluetooth": return Settings.ACTION_BLUETOOTH_SETTINGS;
            case "battery": return Intent.ACTION_POWER_USAGE_SUMMARY;
            case "display": return Settings.ACTION_DISPLAY_SETTINGS;
            case "sound": return Settings.ACTION_SOUND_SETTINGS;
            case "apps": return Settings.ACTION_APPLICATION_SETTINGS;
            case "location": return Settings.ACTION_LOCATION_SOURCE_SETTINGS;
            case "storage": return Settings.ACTION_INTERNAL_STORAGE_SETTINGS;
            case "security": return Settings.ACTION_SECURITY_SETTINGS;
            case "a11y": return Settings.ACTION_ACCESSIBILITY_SETTINGS;
            case "date": return Settings.ACTION_DATE_SETTINGS;
            case "lang": return Settings.ACTION_LOCALE_SETTINGS;
            case "network": return Settings.ACTION_WIRELESS_SETTINGS;
            case "nfc": return Settings.ACTION_NFC_SETTINGS;
            case "airplane": return Settings.ACTION_AIRPLANE_MODE_SETTINGS;
            default: return Settings.ACTION_SETTINGS;
        }
    }
    static Intent sysIntent(Context c, String what, String sub) {
        PackageManager pm = c.getPackageManager();
        Intent i;
        switch (what) {
            case "settings":
                i = new Intent(settingsAction(sub));
                if (i.resolveActivity(pm) == null) i = new Intent(Settings.ACTION_SETTINGS);
                return i;
            case "camera":
                i = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
                return i.resolveActivity(pm) != null ? i : new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            case "dialer": return new Intent(Intent.ACTION_DIAL);
            case "sms": return selector(Intent.CATEGORY_APP_MESSAGING);
            case "calendar": return selector(Intent.CATEGORY_APP_CALENDAR);
            case "clock": return new Intent(AlarmClock.ACTION_SHOW_ALARMS);
            case "gallery": return selector(Intent.CATEGORY_APP_GALLERY);
            case "contacts": return selector(Intent.CATEGORY_APP_CONTACTS);
            case "calculator": return selector(Intent.CATEGORY_APP_CALCULATOR);
            case "browser": return selector(Intent.CATEGORY_APP_BROWSER);
            case "email": return selector(Intent.CATEGORY_APP_EMAIL);
            case "music": return selector(Intent.CATEGORY_APP_MUSIC);
            case "maps": return selector(Intent.CATEGORY_APP_MAPS);
            case "store":
                i = pm.getLaunchIntentForPackage("com.android.vending");
                return i != null ? i : new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps"));
            default: return null;
        }
    }

    // ---------- Autorisations ----------
    @JavascriptInterface public String perms() {
        try {
            NotificationManager nm = (NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE);
            boolean bat = true; try { bat = ((android.os.PowerManager) a.getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(a.getPackageName()); } catch (Throwable t) { }
            return new JSONObject()
                .put("mic", hasMic())
                .put("notif", Build.VERSION.SDK_INT < 33 || has("android.permission.POST_NOTIFICATIONS"))
                .put("exact", canExact(a))
                .put("contacts", has(Manifest.permission.READ_CONTACTS))
                .put("phone", has(Manifest.permission.CALL_PHONE))
                .put("sms", has(Manifest.permission.SEND_SMS))
                .put("calendar", has(Manifest.permission.READ_CALENDAR) && has(Manifest.permission.WRITE_CALENDAR))
                .put("location", has(Manifest.permission.ACCESS_COARSE_LOCATION))
                .put("dnd", Build.VERSION.SDK_INT < 23 || nm.isNotificationPolicyAccessGranted())
                .put("overlay", Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(a))
                .put("battery", bat)
                .put("assist", isAssistant()).toString();
        } catch (Exception e) { return "{}"; }
    }
    // Majordome est-il l'« assistant numérique » du téléphone ? (rôle ASSISTANT depuis Android 10, réglage « assistant » avant)
    private boolean isAssistant() {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                android.app.role.RoleManager rm = a.getSystemService(android.app.role.RoleManager.class);
                if (rm != null && rm.isRoleAvailable(android.app.role.RoleManager.ROLE_ASSISTANT)) return rm.isRoleHeld(android.app.role.RoleManager.ROLE_ASSISTANT);
            }
            String s = Settings.Secure.getString(a.getContentResolver(), "assistant");
            return s != null && s.startsWith(a.getPackageName() + "/");
        } catch (Throwable t) { return false; }
    }
    @JavascriptInterface public void fix(final String what) {
        if ("assist".equals(what)) {
            // Le rôle « assistant » ne peut pas être demandé par une boîte de dialogue : on ouvre la page des applis par défaut
            ui.post(new Runnable() { public void run() {
                String[] acts = { Settings.ACTION_VOICE_INPUT_SETTINGS, Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS, Settings.ACTION_SETTINGS };
                for (String x : acts) { try { a.startActivity(new Intent(x)); toast("Assistant numérique : choisissez Majordome"); return; } catch (Throwable t) { } }
            } });
            return;
        }
        ui.post(new Runnable() { public void run() {
            try {
                String pkg = "package:" + a.getPackageName();
                switch (what) {
                    case "mic": a.requestPermissions(new String[]{ Manifest.permission.RECORD_AUDIO }, REQ_PERM); break;
                    case "notif": if (Build.VERSION.SDK_INT >= 33) a.requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" }, REQ_PERM); break;
                    case "contacts": a.requestPermissions(new String[]{ Manifest.permission.READ_CONTACTS }, REQ_PERM); break;
                    case "phone": a.requestPermissions(new String[]{ Manifest.permission.CALL_PHONE }, REQ_PERM); break;
                    case "sms": a.requestPermissions(new String[]{ Manifest.permission.SEND_SMS }, REQ_PERM); break;
                    case "calendar": a.requestPermissions(new String[]{ Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }, REQ_PERM); break;
                    case "location": a.requestPermissions(new String[]{ Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }, REQ_PERM); break;
                    case "exact": if (Build.VERSION.SDK_INT >= 31) a.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse(pkg))); break;
                    case "dnd": a.startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)); break;
                    case "overlay": a.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse(pkg))); break;
                    case "battery": a.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse(pkg))); break;
                    case "full": if (Build.VERSION.SDK_INT >= 34) a.startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse(pkg))); break;
                    default: a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse(pkg)));
                }
            } catch (Throwable t) {
                try { a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName()))); } catch (Throwable t2) { toast("Ouvrez Paramètres › Applications › Majordome"); }
            }
        } });
    }

    // =====================================================================
    // Philips Hue : pont Hue du réseau local (mj-maison.js)
    //  - Découverte : mDNS « _hue._tcp » (NsdManager) ; sur demande explicite, https://discovery.meethue.com (seule
    //    requête internet des lumières). Jumelage : « appuyez sur le bouton du pont », POST /api avec devicetype et
    //    generateclientkey, répété 30 s (erreur 101 « link button not pressed » tant que le bouton n'est pas pressé).
    //  - Clé d'application : fichier privé no_backup/hue.json (hors sauvegardes Android), jamais transmise à la page.
    //  - Réseau : seule l'adresse du pont jumelé, et seulement une adresse privée (10/8, 172.16/12, 192.168/16).
    //    API CLIP v2 en https ; le certificat du pont (auto-signé ou émis par Signify) est accepté seulement s'il est
    //    celui noté au jumelage (empreinte SHA-256 épinglée, « TOFU »), et pour cette connexion seulement : TLS n'est
    //    jamais désactivé ailleurs. Repli API v1 (https épinglé, ou http pour les anciens ponts sans https).
    //  - Requêtes faites avec des sockets directes (HTTP/1.1 minimal) : le http en clair des anciens ponts ne demande
    //    aucune exception dans la configuration réseau de l'appli (network_security_config inchangée).
    // =====================================================================
    static final java.util.concurrent.ExecutorService HX = java.util.concurrent.Executors.newSingleThreadExecutor();
    static final java.util.concurrent.atomic.AtomicBoolean pairStop = new java.util.concurrent.atomic.AtomicBoolean();
    static final Object HLOCK = new Object();

    /** Partie réseau en Java pur (testée hors d'Android) : liste blanche, TLS épinglé, HTTP minimal, jumelage. */
    static final class Hue {
        interface Dialer { java.net.Socket open(String ip, int port, int timeoutMs) throws java.io.IOException; }
        interface Progress { void left(int seconds); }
        static volatile Dialer dialer = null;   // banc d'essai Java seulement ; null dans l'appli
        static final String DEVICETYPE = "majordome#android";

        static final class Resp { int code; String body = ""; String fp, cn; }
        static final class HueErr extends Exception { final String code; HueErr(String c) { super(c); code = c; } }
        static final class Pair { String user, clientkey, fp, api, bridgeId, name, model, sw, err, msg; boolean tls; }

        /** Adresse IPv4 littérale d'un réseau privé (RFC 1918) ; rien d'autre (ni nom, ni 127.x, ni 169.254.x, ni IPv6) */
        static boolean privateIp(String ip) {
            if (ip == null || !ip.matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")) return false;
            String[] p = ip.split("\\."); int[] o = new int[4];
            for (int i = 0; i < 4; i++) { if (p[i].length() > 1 && p[i].charAt(0) == '0') return false; o[i] = Integer.parseInt(p[i]); if (o[i] > 255) return false; }
            if (o[3] == 0 || o[3] == 255) return false;
            return o[0] == 10 || (o[0] == 172 && o[1] >= 16 && o[1] <= 31) || (o[0] == 192 && o[1] == 168);
        }
        static boolean okPath(String p) { return p != null && p.length() <= 200 && p.matches("/[A-Za-z0-9/_\\-]*") && !p.contains("//"); }
        static boolean okKey(String k) { return k != null && k.matches("[A-Za-z0-9\\-]{8,80}"); }
        static String sha256(byte[] b) {
            try { byte[] d = java.security.MessageDigest.getInstance("SHA-256").digest(b); StringBuilder s = new StringBuilder(); for (byte x : d) s.append(String.format("%02x", x & 0xff)); return s.toString(); }
            catch (Exception e) { return ""; }
        }
        static String cnOf(String dn) { java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?:^|,)\\s*CN=([^,]+)").matcher(dn == null ? "" : dn); return m.find() ? m.group(1).trim() : null; }
        static String str(String json, String key) { java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]*)\"").matcher(json == null ? "" : json); return m.find() ? m.group(1) : null; }
        static String num(String json, String key) { java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"" + key + "\"\\s*:\\s*(\\d+)").matcher(json == null ? "" : json); return m.find() ? m.group(1) : null; }

        /** Certificat accepté seulement s'il a l'empreinte attendue ; want == null : premier contact (jumelage), empreinte notée */
        static final class Pin implements javax.net.ssl.X509TrustManager {
            final String want; volatile String seen, cn;
            Pin(String want) { this.want = want; }
            public void checkClientTrusted(java.security.cert.X509Certificate[] c, String t) throws java.security.cert.CertificateException { throw new java.security.cert.CertificateException("client"); }
            public void checkServerTrusted(java.security.cert.X509Certificate[] c, String t) throws java.security.cert.CertificateException {
                if (c == null || c.length == 0) throw new java.security.cert.CertificateException("aucun certificat");
                seen = sha256(c[0].getEncoded());
                try { cn = cnOf(c[0].getSubjectX500Principal().getName()); } catch (Exception e) { }
                if (want != null && !want.equalsIgnoreCase(seen)) throw new java.security.cert.CertificateException("pin");
            }
            public java.security.cert.X509Certificate[] getAcceptedIssuers() { return new java.security.cert.X509Certificate[0]; }
        }

        static java.net.Socket connect(String ip, int port, int timeout) throws java.io.IOException {
            String[] p = ip.split("\\."); byte[] b = new byte[4]; for (int i = 0; i < 4; i++) b[i] = (byte) Integer.parseInt(p[i]);
            java.net.Socket s = new java.net.Socket();
            s.connect(new java.net.InetSocketAddress(java.net.InetAddress.getByAddress(b), port), timeout);
            return s;
        }
        /** Une requête HTTP/1.1 vers le pont (Connection: close). tofu : accepte et note le certificat (jumelage seulement). */
        static Resp http(String ip, boolean tls, String pin, boolean tofu, String method, String path, String key, String body, int timeout) throws java.io.IOException {
            if (!privateIp(ip)) throw new java.io.IOException("notprivate");
            if (!okPath(path)) throw new java.io.IOException("path");
            if (!"GET".equals(method) && !"PUT".equals(method) && !"POST".equals(method)) throw new java.io.IOException("method");
            if (tls && (pin == null || pin.isEmpty()) && !tofu) throw new java.io.IOException("cert");
            if (key != null && !okKey(key)) throw new java.io.IOException("key");
            if (body != null && (body.length() > 8192 || !body.trim().startsWith("{"))) throw new java.io.IOException("body");
            int port = tls ? 443 : 80;
            Dialer d = dialer;
            java.net.Socket raw = d != null ? d.open(ip, port, timeout) : connect(ip, port, timeout), s = raw;
            Pin tm = null;
            try {
                raw.setSoTimeout(timeout);
                if (tls) {
                    tm = new Pin(tofu ? null : pin);
                    javax.net.ssl.SSLContext ctx;
                    try { ctx = javax.net.ssl.SSLContext.getInstance("TLS"); ctx.init(null, new javax.net.ssl.TrustManager[]{ tm }, new java.security.SecureRandom()); }
                    catch (java.security.GeneralSecurityException e) { throw new java.io.IOException("tls"); }
                    javax.net.ssl.SSLSocket ss = (javax.net.ssl.SSLSocket) ctx.getSocketFactory().createSocket(raw, ip, port, true);
                    try { ss.startHandshake(); }
                    catch (javax.net.ssl.SSLException e) { if (tm.seen != null && pin != null && !tofu && !pin.equalsIgnoreCase(tm.seen)) throw new java.io.IOException("cert"); throw e; }
                    s = ss;
                }
                byte[] b = body == null ? new byte[0] : body.getBytes("UTF-8");
                StringBuilder h = new StringBuilder();
                h.append(method).append(' ').append(path).append(" HTTP/1.1\r\nHost: ").append(ip).append("\r\nConnection: close\r\nAccept: application/json\r\nUser-Agent: Majordome\r\n");
                if (key != null) h.append("hue-application-key: ").append(key).append("\r\n");
                if (body != null) h.append("Content-Type: application/json\r\nContent-Length: ").append(b.length).append("\r\n");
                h.append("\r\n");
                java.io.OutputStream o = s.getOutputStream(); o.write(h.toString().getBytes("UTF-8")); o.write(b); o.flush();
                Resp r = read(s.getInputStream());
                if (tm != null) { r.fp = tm.seen; r.cn = tm.cn; }
                return r;
            } finally { try { s.close(); } catch (Exception e) { } try { raw.close(); } catch (Exception e) { } }
        }
        static String line(java.io.InputStream in) throws java.io.IOException {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); int c;
            while ((c = in.read()) >= 0) { if (c == '\n') break; if (c != '\r') b.write(c); if (b.size() > 8192) throw new java.io.IOException("ligne trop longue"); }
            if (c < 0 && b.size() == 0) return null;
            return b.toString("UTF-8");
        }
        static Resp read(java.io.InputStream in0) throws java.io.IOException {
            java.io.InputStream in = new java.io.BufferedInputStream(in0);
            Resp r = new Resp(); String st = line(in);
            if (st == null || !st.startsWith("HTTP/1.")) throw new java.io.IOException("réponse invalide");
            String[] sp = st.split(" "); r.code = sp.length > 1 ? Integer.parseInt(sp[1].trim()) : 0;
            long len = -1; boolean chunked = false; String l;
            while ((l = line(in)) != null && !l.isEmpty()) {
                int k = l.indexOf(':'); if (k < 0) continue;
                String n = l.substring(0, k).trim().toLowerCase(Locale.ROOT), v = l.substring(k + 1).trim();
                if ("content-length".equals(n)) try { len = Long.parseLong(v); } catch (Exception e) { }
                if ("transfer-encoding".equals(n) && v.toLowerCase(Locale.ROOT).contains("chunked")) chunked = true;
            }
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192]; final int MAX = 4 << 20;
            if (chunked) {
                while (true) {
                    String sz = line(in); if (sz == null) break; sz = sz.trim(); int sc = sz.indexOf(';'); if (sc >= 0) sz = sz.substring(0, sc);
                    if (sz.isEmpty()) continue;
                    int n = Integer.parseInt(sz, 16); if (n == 0) break;
                    while (n > 0) { int k = in.read(buf, 0, Math.min(buf.length, n)); if (k < 0) throw new java.io.IOException("fin inattendue"); out.write(buf, 0, k); n -= k; if (out.size() > MAX) throw new java.io.IOException("réponse trop grande"); }
                    line(in);
                }
            } else {
                long left = len; int k;
                while ((left < 0 || left > 0) && (k = in.read(buf, 0, (int) (left < 0 ? buf.length : Math.min(buf.length, left)))) >= 0) { out.write(buf, 0, k); if (left > 0) left -= k; if (out.size() > MAX) throw new java.io.IOException("réponse trop grande"); }
            }
            r.body = out.toString("UTF-8");
            return r;
        }
        static String codeOf(java.io.IOException e) {
            String m = e.getMessage();
            if ("notprivate".equals(m) || "path".equals(m) || "cert".equals(m) || "method".equals(m) || "key".equals(m) || "body".equals(m)) return m;
            return "unreachable";
        }
        /** Requête de l'appli vers le pont jumelé (le chemin et la clé sont vérifiés, le certificat doit être l'épinglé) */
        static Resp call(String ip, boolean tls, String pin, String method, String path, String key, String body) throws HueErr {
            try { return http(ip, tls, pin, false, method, path, key, body, 6000); }
            catch (java.io.IOException e) { throw new HueErr(codeOf(e)); }
        }
        /** Jumelage : qui est là (/api/config), puis POST /api répété jusqu'à l'appui sur le bouton (au plus totalMs) */
        static Pair pair(String ip, long totalMs, long stepMs, Progress pr, java.util.concurrent.atomic.AtomicBoolean stop) {
            Pair res = new Pair();
            if (!privateIp(ip)) { res.err = "notprivate"; return res; }
            boolean tls = true; String fp = null; Resp cfg = null;
            try { cfg = http(ip, true, null, true, "GET", "/api/config", null, null, 4000); fp = cfg.fp; }
            catch (java.net.ConnectException e) { tls = false; }          // port 443 fermé : ancien pont, http seulement
            catch (java.io.IOException e) { res.err = codeOf(e); res.msg = e.getMessage(); return res; }
            if (!tls) {
                try { cfg = http(ip, false, null, false, "GET", "/api/config", null, null, 4000); }
                catch (java.io.IOException e) { res.err = codeOf(e); res.msg = e.getMessage(); return res; }
            }
            if (cfg.code != 200 || (!cfg.body.contains("\"bridgeid\"") && !cfg.body.contains("\"swversion\""))) { res.err = "notbridge"; return res; }
            res.bridgeId = str(cfg.body, "bridgeid"); res.name = str(cfg.body, "name"); res.model = str(cfg.body, "modelid"); res.sw = str(cfg.body, "swversion");
            // le nom commun du certificat d'un pont Hue est son identifiant : s'il en a la forme, il doit être le même
            if (tls && cfg.cn != null && cfg.cn.matches("[0-9A-Fa-f]{16}") && res.bridgeId != null && !cfg.cn.equalsIgnoreCase(res.bridgeId)) { res.err = "certid"; return res; }
            long end = System.currentTimeMillis() + totalMs;
            String bodyPair = "{\"devicetype\":\"" + DEVICETYPE + "\",\"generateclientkey\":true}";
            while (true) {
                if (stop != null && stop.get()) { res.err = "cancel"; return res; }
                try {
                    Resp r = http(ip, tls, fp, false, "POST", "/api", null, bodyPair, 5000);
                    String u = str(r.body, "username");
                    if (u != null) {
                        if (!okKey(u)) { res.err = "notbridge"; return res; }
                        res.user = u; res.clientkey = str(r.body, "clientkey"); res.tls = tls; res.fp = tls ? fp : null;
                        res.api = detect(ip, tls, fp, u);
                        return res;
                    }
                    if (!"101".equals(num(r.body, "type"))) { res.err = "bridge"; res.msg = str(r.body, "description"); return res; }
                } catch (java.io.IOException e) { res.err = codeOf(e); res.msg = e.getMessage(); return res; }
                long left = end - System.currentTimeMillis();
                if (left <= 0) { res.err = "timeout"; return res; }
                if (pr != null) pr.left((int) Math.ceil(left / 1000.0));
                try { Thread.sleep(Math.min(stepMs, left)); } catch (InterruptedException e) { res.err = "cancel"; return res; }
            }
        }
        /** v2 si /clip/v2 répond, sinon v1 (« v1s » : https épinglé, « v1 » : http des anciens ponts) */
        static String detect(String ip, boolean tls, String fp, String user) {
            if (!tls) return "v1";
            try { Resp r = http(ip, true, fp, false, "GET", "/clip/v2/resource/bridge", user, null, 5000); if (r.code == 200 && r.body.contains("\"data\"")) return "v2"; }
            catch (java.io.IOException e) { }
            return "v1s";
        }
        /** Le pont a changé d'adresse : même certificat et même identifiant exigés */
        static boolean sameBridge(String ip, String fp, String id) {
            try { Resp r = http(ip, true, fp, false, "GET", "/api/config", null, null, 4000); String b = str(r.body, "bridgeid"); return r.code == 200 && b != null && b.equalsIgnoreCase(id); }
            catch (java.io.IOException e) { return false; }
        }
    }

    static File hueFile(Context c) { return new File(c.getNoBackupFilesDir(), "hue.json"); }
    static JSONObject hueLoad(Context c) {
        synchronized (HLOCK) {
            try {
                File f = hueFile(c); if (!f.exists()) return null;
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n;
                try (InputStream in = new java.io.FileInputStream(f)) { while ((n = in.read(buf)) > 0) b.write(buf, 0, n); }
                JSONObject o = new JSONObject(b.toString("UTF-8"));
                return Hue.okKey(o.optString("user")) && Hue.privateIp(o.optString("ip")) ? o : null;
            } catch (Exception e) { return null; }
        }
    }
    static void hueSave(Context c, JSONObject o) {
        synchronized (HLOCK) {
            try {
                File f = hueFile(c), t = new File(f.getPath() + ".tmp");
                try (FileOutputStream out = new FileOutputStream(t)) { out.write(o.toString().getBytes("UTF-8")); out.getFD().sync(); }
                if (!t.renameTo(f)) { f.delete(); t.renameTo(f); }
            } catch (Exception e) { }
        }
    }
    static Hue.Resp hueCall(Context c, String method, String path, String body) throws Hue.HueErr {
        JSONObject o = hueLoad(c);
        if (o == null) throw new Hue.HueErr("notpaired");
        if (!"GET".equals(method) && !"PUT".equals(method)) throw new Hue.HueErr("method");
        String ip = o.optString("ip"), api = o.optString("api"), user = o.optString("user"), fp = o.optString("fp", "");
        boolean tls; String full; String key = null;
        // seulement les ressources des lumières (rien sur la configuration du pont, pas de suppression)
        if (path != null && path.matches("/clip/v2/resource/(light|room|zone|device|grouped_light|scene|bridge_home|bridge)(/[0-9a-fA-F\\-]{8,64})?")) { if (!"v2".equals(api)) throw new Hue.HueErr("path"); tls = true; full = path; key = user; }
        else if (path != null && path.matches("v1:/(lights|groups|scenes)(/[A-Za-z0-9\\-]{1,64}(/(state|action))?)?")) { tls = !"v1".equals(api); full = "/api/" + user + path.substring(3); }
        else throw new Hue.HueErr("path");
        if (tls && fp.isEmpty()) throw new Hue.HueErr("cert");
        Hue.Resp r = Hue.call(ip, tls, tls ? fp : null, method, full, key, body == null || body.isEmpty() ? null : body);
        if ("GET".equals(method) && ("/clip/v2/resource/light".equals(path) || "v1:/lights".equals(path))) hueStatusFrom(c, path, r);
        return r;
    }
    /** Résumé pour le panneau Jarvis de Socle : nombre de lumières allumées (canal privé WidgetProvider) */
    static void hueStatusFrom(Context c, String path, Hue.Resp r) {
        try {
            JSONObject s = new JSONObject().put("paired", true).put("at", System.currentTimeMillis());
            if (r.code == 403 || r.code == 401) { WidgetProvider.putHue(c, s.put("err", "unauthorized").toString()); return; }
            if (r.code != 200) { WidgetProvider.putHue(c, s.put("err", "http").toString()); return; }
            int on = 0, total = 0; JSONArray names = new JSONArray();
            if (path.startsWith("/clip")) {
                JSONArray d = new JSONObject(r.body).optJSONArray("data");
                for (int i = 0; d != null && i < d.length(); i++) { JSONObject l = d.getJSONObject(i); total++; if (l.optJSONObject("on") != null && l.getJSONObject("on").optBoolean("on")) { on++; if (names.length() < 3) names.put(l.optJSONObject("metadata") != null ? l.getJSONObject("metadata").optString("name") : ""); } }
            } else {
                JSONObject d = new JSONObject(r.body); Iterator<String> k = d.keys();
                while (k.hasNext()) { JSONObject l = d.optJSONObject(k.next()); if (l == null) continue; total++; if (l.optJSONObject("state") != null && l.getJSONObject("state").optBoolean("on")) { on++; if (names.length() < 3) names.put(l.optString("name")); } }
            }
            // les pièces (relues juste après par hueRooms) restent affichées entre-temps
            try { JSONObject prev = new JSONObject(WidgetProvider.prefs(c).getString("hue", "{}")); if (prev.has("rooms")) s.put("rooms", prev.get("rooms")); } catch (Throwable t) { }
            WidgetProvider.putHue(c, s.put("on", on).put("total", total).put("names", names).toString());
        } catch (Throwable t) { }
    }
    /** Pièces (12 au plus) et leur état, pour les 3 pièces favorites de la page Jarvis de Socle : id = grouped_light (v2) ou groupe (v1) */
    static void hueRooms(Context c, boolean v2) {
        try {
            JSONArray rooms = new JSONArray();
            if (v2) {
                java.util.HashMap<String, Boolean> on = new java.util.HashMap<>();
                JSONArray g = new JSONObject(hueCall(c, "GET", "/clip/v2/resource/grouped_light", null).body).optJSONArray("data");
                for (int i = 0; g != null && i < g.length(); i++) { JSONObject x = g.getJSONObject(i); on.put(x.optString("id"), x.optJSONObject("on") != null && x.getJSONObject("on").optBoolean("on")); }
                JSONArray r = new JSONObject(hueCall(c, "GET", "/clip/v2/resource/room", null).body).optJSONArray("data");
                for (int i = 0; r != null && i < r.length() && rooms.length() < 12; i++) {
                    JSONObject x = r.getJSONObject(i); JSONArray sv = x.optJSONArray("services"); String gl = null;
                    for (int j = 0; sv != null && j < sv.length(); j++) if ("grouped_light".equals(sv.getJSONObject(j).optString("rtype"))) gl = sv.getJSONObject(j).optString("rid");
                    if (gl == null) continue;
                    rooms.put(new JSONObject().put("id", gl).put("name", x.optJSONObject("metadata") != null ? x.getJSONObject("metadata").optString("name") : "Pièce").put("on", Boolean.TRUE.equals(on.get(gl))));
                }
            } else {
                JSONObject d = new JSONObject(hueCall(c, "GET", "v1:/groups", null).body); Iterator<String> k = d.keys();
                while (k.hasNext() && rooms.length() < 12) { String id = k.next(); JSONObject x = d.optJSONObject(id); if (x == null || !"Room".equals(x.optString("type"))) continue;
                    rooms.put(new JSONObject().put("id", id).put("name", x.optString("name")).put("on", x.optJSONObject("state") != null && x.getJSONObject("state").optBoolean("any_on"))); }
            }
            JSONObject s = new JSONObject(WidgetProvider.prefs(c).getString("hue", "{}"));
            if (!s.has("err")) WidgetProvider.putHue(c, s.put("rooms", rooms).toString());
        } catch (Throwable t) { }
    }
    /** Socle : allumer / éteindre une pièce (arg = id de hueRooms) ; les autres méthodes passent par widgetCall(c, m) */
    public static boolean widgetCall(final Context c0, final String m, final String arg) {
        if (!"hue_room".equals(m)) return widgetCall(c0, m);
        final Context c = c0.getApplicationContext();
        final JSONObject o = hueLoad(c);
        if (o == null || arg == null || !arg.matches("[A-Za-z0-9\\-]{1,64}")) return false;
        HX.execute(new Runnable() { public void run() { hueDo(c, "hue_room", arg); } });
        return true;
    }
    /** Lumières, exécuté sur le fil appelant (serveur de la montre, ou HX pour Socle et le widget) :
     *  « hue_room » bascule une pièce (id de hueRooms), « hue_all_off » éteint tout, « hue_refresh » relit l'état.
     *  Rend null si tout s'est bien passé, sinon le code d'erreur (notpaired, unreachable, unauthorized…). */
    static String hueDo(Context c, String m, String arg) {
        JSONObject o = hueLoad(c);
        if (o == null) { try { WidgetProvider.putHue(c, "{\"paired\":false}"); } catch (Throwable t) { } return "notpaired"; }
        boolean v2 = "v2".equals(o.optString("api"));
        try {
            if ("hue_room".equals(m)) {
                if (arg == null || !arg.matches("[A-Za-z0-9\\-]{1,64}")) return "path";
                boolean was = false;
                try { JSONArray r = new JSONObject(WidgetProvider.prefs(c).getString("hue", "{}")).optJSONArray("rooms"); for (int i = 0; r != null && i < r.length(); i++) if (arg.equals(r.getJSONObject(i).optString("id"))) was = r.getJSONObject(i).optBoolean("on"); } catch (Throwable t) { }
                Hue.Resp x = v2 ? hueCall(c, "PUT", "/clip/v2/resource/grouped_light/" + arg, "{\"on\":{\"on\":" + !was + "}}")
                    : hueCall(c, "PUT", "v1:/groups/" + arg + "/action", "{\"on\":" + !was + "}");
                if (x.code >= 400) return x.code == 403 || x.code == 401 ? "unauthorized" : "http";
            } else if ("hue_all_off".equals(m)) {
                if (v2) {
                    Hue.Resp g = hueCall(c, "GET", "/clip/v2/resource/grouped_light", null);
                    JSONArray d = new JSONObject(g.body).optJSONArray("data"); String home = null;
                    for (int i = 0; d != null && i < d.length(); i++) { JSONObject x = d.getJSONObject(i); JSONObject ow = x.optJSONObject("owner"); if (ow != null && "bridge_home".equals(ow.optString("rtype"))) home = x.optString("id"); }
                    if (home != null && home.matches("[0-9a-fA-F\\-]{8,64}")) hueCall(c, "PUT", "/clip/v2/resource/grouped_light/" + home, "{\"on\":{\"on\":false}}");
                } else hueCall(c, "PUT", "v1:/groups/0/action", "{\"on\":false}");
            } else if (!"hue_refresh".equals(m)) return "method";
            hueCall(c, "GET", v2 ? "/clip/v2/resource/light" : "v1:/lights", null);
            hueRooms(c, v2);
            return null;
        } catch (Hue.HueErr e) { hueStatusErr(c, e.code); return e.code; }
        catch (Throwable t) { hueStatusErr(c, "unreachable"); return "unreachable"; }
    }
    static void hueStatusErr(Context c, String err) { try { WidgetProvider.putHue(c, new JSONObject().put("paired", hueLoad(c) != null).put("err", err).put("at", System.currentTimeMillis()).toString()); } catch (Throwable t) { } }
    /** Socle (WidgetProvider.call, permission « signature ») : relire l'état, ou tout éteindre, sans ouvrir Majordome */
    public static boolean widgetCall(final Context c0, final String m) {
        final Context c = c0.getApplicationContext();
        final JSONObject o = hueLoad(c);
        if (o == null) { try { WidgetProvider.putHue(c, "{\"paired\":false}"); } catch (Throwable t) { } return false; }
        if ("hue_refresh".equals(m) || "hue_all_off".equals(m)) {
            HX.execute(new Runnable() { public void run() { hueDo(c, m, null); } });
            return true;
        }
        return false;
    }
    static String hueEv(String op, Object... kv) {
        try { JSONObject o = new JSONObject().put("op", op); for (int i = 0; i + 1 < kv.length; i += 2) if (kv[i + 1] != null) o.put((String) kv[i], kv[i + 1]); return o.toString(); }
        catch (Exception e) { return "{}"; }
    }

    // ---------- Widget Android et fond d'écran animé (pour tous les lanceurs) ----------
    @JavascriptInterface public String wallpaperGet() {
        JSONObject o = MajordomeWallpaper.settings(a);
        try {
            android.app.WallpaperInfo wi = android.app.WallpaperManager.getInstance(a).getWallpaperInfo();
            o.put("active", wi != null && a.getPackageName().equals(wi.getPackageName()));
            int[] ids = android.appwidget.AppWidgetManager.getInstance(a).getAppWidgetIds(new android.content.ComponentName(a, MajordomeWidget.class));
            o.put("widgets", ids == null ? 0 : ids.length);
        } catch (Throwable t) { }
        return o.toString();
    }
    @JavascriptInterface public void wallpaperSet(String json) { MajordomeWallpaper.save(a, json); }
    /** « Définir comme fond d'écran animé » : aperçu d'Android avec le bouton Appliquer (repli : liste des fonds animés) */
    @JavascriptInterface public void wallpaperOpen() {
        ui.post(new Runnable() { public void run() {
            try {
                Intent i = new Intent(android.app.WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                i.putExtra(android.app.WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, new android.content.ComponentName(a, MajordomeWallpaper.class));
                a.startActivity(i);
            } catch (Throwable t) {
                try { a.startActivity(new Intent(android.app.WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER)); }
                catch (Throwable t2) { emit("toast", obj("text", "Ce téléphone ne propose pas de fonds d'écran animés")); }
            }
        } });
    }
    /** « Ajouter le widget » : demande au lanceur de l'épingler (Android 8+, si le lanceur le permet) ; false → ajout manuel */
    @JavascriptInterface public boolean widgetPin() {
        try {
            android.appwidget.AppWidgetManager m = android.appwidget.AppWidgetManager.getInstance(a);
            if (Build.VERSION.SDK_INT >= 26 && m.isRequestPinAppWidgetSupported()) return m.requestPinAppWidget(new android.content.ComponentName(a, MajordomeWidget.class), null, null);
        } catch (Throwable t) { }
        return false;
    }

    @JavascriptInterface public String hueInfo() {
        try {
            JSONObject o = hueLoad(a), r = new JSONObject();
            if (o == null) return r.put("paired", false).toString();
            return r.put("paired", true).put("ip", o.optString("ip")).put("id", o.optString("id")).put("name", o.optString("name")).put("api", o.optString("api"))
                .put("model", o.optString("model")).put("fp", o.optString("fp")).put("at", o.optLong("at")).toString();   // jamais la clé
        } catch (Exception e) { return "{\"paired\":false}"; }
    }
    @JavascriptInterface public void hueReq(final String id, final String method, final String path, final String body) {
        final Context c = a.getApplicationContext();
        HX.execute(new Runnable() { public void run() {
            String ev;
            try { Hue.Resp r = hueCall(c, method, path, body); ev = hueEv("res", "id", id, "code", r.code, "body", r.body); }
            catch (Hue.HueErr e) { ev = hueEv("res", "id", id, "err", e.code); }
            catch (Throwable t) { ev = hueEv("res", "id", id, "err", "unreachable"); }
            emit("hue", ev);
        } });
    }
    @JavascriptInterface public void huePair(final String ip) {
        final Context c = a.getApplicationContext();
        pairStop.set(false);
        new Thread(new Runnable() { public void run() {
            Hue.Pair p = Hue.pair(ip, 30000, 1500, new Hue.Progress() { public void left(int s) { emit("hue", hueEv("pair", "state", "wait", "left", s, "ip", ip)); } }, pairStop);
            if (p.user == null) { emit("hue", hueEv("pair", "state", "error", "code", p.err, "msg", p.msg)); return; }
            try {
                JSONObject o = new JSONObject().put("ip", ip).put("user", p.user).put("clientkey", p.clientkey == null ? "" : p.clientkey).put("fp", p.fp == null ? "" : p.fp)
                    .put("api", p.api).put("id", p.bridgeId == null ? "" : p.bridgeId).put("name", p.name == null ? "Hue" : p.name).put("model", p.model == null ? "" : p.model)
                    .put("sw", p.sw == null ? "" : p.sw).put("at", System.currentTimeMillis());
                hueSave(c, o);
                emit("hue", hueEv("pair", "state", "ok", "api", p.api, "name", p.name));
                widgetCall(c, "hue_refresh");
            } catch (Exception e) { emit("hue", hueEv("pair", "state", "error", "code", "save", "msg", e.getMessage())); }
        } }, "majordome-hue").start();
    }
    @JavascriptInterface public void huePairCancel() { pairStop.set(true); }
    @JavascriptInterface public void hueForget() {
        synchronized (HLOCK) { hueFile(a).delete(); }
        try { WidgetProvider.putHue(a, "{\"paired\":false}"); } catch (Throwable t) { }
    }
    @JavascriptInterface public void hueMove(final String ip) {
        final Context c = a.getApplicationContext();
        HX.execute(new Runnable() { public void run() {
            JSONObject o = hueLoad(c); boolean ok = false;
            if (o != null && Hue.privateIp(ip) && !o.optString("fp").isEmpty() && Hue.sameBridge(ip, o.optString("fp"), o.optString("id"))) {
                try { o.put("ip", ip); hueSave(c, o); ok = true; } catch (Exception e) { }
            }
            emit("hue", hueEv("move", "ok", ok, "ip", ip));
        } });
    }
    @JavascriptInterface public void hueDiscover(final boolean cloud) {
        final Context c = a.getApplicationContext();
        if (cloud) {
            new Thread(new Runnable() { public void run() {
                JSONArray l = new JSONArray(); String err = null;
                try {
                    HttpURLConnection h = (HttpURLConnection) new URL("https://discovery.meethue.com/").openConnection();
                    h.setConnectTimeout(8000); h.setReadTimeout(8000); h.setRequestProperty("Accept", "application/json");
                    int code = h.getResponseCode();
                    if (code != 200) err = code == 429 ? "trop de demandes, réessayez dans quelques minutes" : "HTTP " + code;
                    else {
                        java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[4096]; int n;
                        try (InputStream in = h.getInputStream()) { while ((n = in.read(buf)) > 0 && b.size() < 65536) b.write(buf, 0, n); }
                        JSONArray a0 = new JSONArray(b.toString("UTF-8"));
                        for (int i = 0; i < a0.length(); i++) { JSONObject x = a0.getJSONObject(i); String ip = x.optString("internalipaddress"); if (Hue.privateIp(ip)) l.put(new JSONObject().put("ip", ip).put("id", x.optString("id")).put("name", "Pont Hue").put("via", "cloud")); }
                    }
                } catch (Throwable t) { err = "injoignable"; }
                emit("hue", hueEv("discover", "via", "cloud", "list", l, "err", err));
            } }, "majordome-hue-cloud").start();
            return;
        }
        ui.post(new Runnable() { public void run() { mdns(c); } });
    }
    private void mdns(final Context c) {
        final android.net.nsd.NsdManager nm = (android.net.nsd.NsdManager) c.getSystemService(Context.NSD_SERVICE);
        final JSONArray list = new JSONArray();
        final java.util.ArrayDeque<android.net.nsd.NsdServiceInfo> q = new java.util.ArrayDeque<>();
        final boolean[] busy = { false }, over = { false };
        if (nm == null) { emit("hue", hueEv("discover", "via", "mdns", "list", list, "err", "mDNS indisponible")); return; }
        final Runnable[] next = new Runnable[1];
        next[0] = new Runnable() { public void run() {
            if (busy[0] || over[0] || q.isEmpty()) return;
            busy[0] = true;
            nm.resolveService(q.poll(), new android.net.nsd.NsdManager.ResolveListener() {
                public void onResolveFailed(android.net.nsd.NsdServiceInfo si, int e) { ui.post(new Runnable() { public void run() { busy[0] = false; next[0].run(); } }); }
                public void onServiceResolved(final android.net.nsd.NsdServiceInfo si) {
                    ui.post(new Runnable() { public void run() {
                        try {
                            java.net.InetAddress h = si.getHost(); String ip = h instanceof java.net.Inet4Address ? h.getHostAddress() : null; String id = "";
                            try { byte[] b = si.getAttributes().get("bridgeid"); if (b != null) id = new String(b, "UTF-8"); } catch (Throwable t) { }
                            boolean dup = false; for (int i = 0; i < list.length(); i++) if (list.getJSONObject(i).optString("ip").equals(ip)) dup = true;
                            if (ip != null && Hue.privateIp(ip) && !dup) list.put(new JSONObject().put("ip", ip).put("id", id).put("name", si.getServiceName()).put("via", "mdns"));
                        } catch (Throwable t) { }
                        busy[0] = false; next[0].run();
                    } });
                }
            });
        } };
        final android.net.nsd.NsdManager.DiscoveryListener dl = new android.net.nsd.NsdManager.DiscoveryListener() {
            public void onStartDiscoveryFailed(String t, int e) { if (!over[0]) { over[0] = true; emit("hue", hueEv("discover", "via", "mdns", "list", list, "err", "recherche impossible (" + e + ")")); } }
            public void onStopDiscoveryFailed(String t, int e) { }
            public void onDiscoveryStarted(String t) { }
            public void onDiscoveryStopped(String t) { }
            public void onServiceFound(final android.net.nsd.NsdServiceInfo si) { ui.post(new Runnable() { public void run() { q.add(si); next[0].run(); } }); }
            public void onServiceLost(android.net.nsd.NsdServiceInfo si) { }
        };
        try { nm.discoverServices("_hue._tcp", android.net.nsd.NsdManager.PROTOCOL_DNS_SD, dl); }
        catch (Throwable t) { emit("hue", hueEv("discover", "via", "mdns", "list", list, "err", "recherche impossible")); return; }
        ui.postDelayed(new Runnable() { public void run() {
            try { nm.stopServiceDiscovery(dl); } catch (Throwable t) { }
            if (!over[0]) { over[0] = true; emit("hue", hueEv("discover", "via", "mdns", "list", list)); }
        } }, 6000);
    }
    /** Minuterie des lumières (« éteins le salon dans 10 minutes ») : exécutée ici, même appli fermée */
    static void hueLater(final Context c, final String id, final JSONObject o, final BroadcastReceiver.PendingResult pr) {
        new Thread(new Runnable() { public void run() {
            boolean ok = true; String err = null;
            try {
                JSONArray reqs = o.optJSONArray("reqs");
                for (int i = 0; reqs != null && i < reqs.length(); i++) {
                    JSONObject r = reqs.getJSONObject(i); Object b = r.opt("body");
                    Hue.Resp x = hueCall(c, r.optString("method", "PUT"), r.optString("path"), b == null ? null : b.toString());
                    if (x.code >= 400) { ok = false; err = x.code == 403 ? "unauthorized" : "http"; }
                    if (i < reqs.length() - 1) Thread.sleep(110);
                }
            } catch (Hue.HueErr e) { ok = false; err = e.code; }
            catch (Throwable t) { ok = false; err = "unreachable"; }
            if (live != null) send("hue", hueEv("later", "id", id, "ok", ok, "err", err, "label", o.optString("text")));
            if (!ok && (live == null || !resumed)) {
                try {
                    channels(c);
                    Notification n = nb(c, CH_RAPPEL).setSmallIcon(c.getApplicationInfo().icon).setContentTitle(Lien.clip("Lumières : " + o.optString("text", ""), Lien.TITLE_MAX))
                        .setContentText("unreachable".equals(err) ? "Le pont Hue ne répond pas." : "Le pont Hue a refusé la commande.").setAutoCancel(true).build();
                    ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_ALARM_BASE + (id.hashCode() & 0x3ff), n);
                } catch (Throwable t) { }
            }
            if (pr != null) pr.finish();
        } }, "majordome-hue-later").start();
    }

    // =====================================================================
    // Montre connectée (Amazfit T-Rex 3, Zepp OS 4) : voir zepp/jarvis/ à la racine du dépôt
    //  1. Notifications : l'appli Zepp recopie sur la montre les notifications des applis cochées
    //     (Zepp › Profil › la montre › Notifications des applis › Majordome). Rappels, minuteurs, réveils :
    //     titre ≤ 30 caractères, texte ≤ 120 (Lien.alarmContent). Alertes facultatives (vent fort, vigilance orange
    //     ou rouge, résumé du matin, réponse de Jarvis) : canal CH_WATCH ; c'est la page qui les décide, au moment où
    //     elle lit déjà la météo, la vigilance ou exécute la routine « Bonjour » : aucune tâche réseau ajoutée.
    //  2. Mini-appli « Jarvis » : son Side Service tourne dans l'appli Zepp du téléphone et appelle
    //     http://127.0.0.1:<port>/… Ce serveur (Lien.Server) n'écoute que l'adresse de bouclage, exige le jeton
    //     (« Authorization: Bearer … », comparaison à temps constant, blocage après 10 refus en une minute), n'accepte
    //     que 6 actions (Lien.ROUTES), refuse les en-têtes Host étrangers (pages web : « DNS rebinding ») et les
    //     requêtes OPTIONS (aucun en-tête CORS), borne les corps, et ne tourne que si l'option « Montre connectée »
    //     est active (service au premier plan Montre, arrêté avec l'option).
    // =====================================================================
    static volatile String pendingWatch = "";

    /** Partie en Java pur (testée hors d'Android) : textes courts, jeton, serveur HTTP local, routeur, relais, Opus. */
    static final class Lien {
        static final int TITLE_MAX = 30, TEXT_MAX = 120, PORT = 47615;
        static final int MAX_HEAD = 8192, MAX_BODY = 8192, MAX_AUDIO = 600 * 1024;
        static final String[] KINDS = { "vent", "vigilance", "matin", "reponse" };
        /** Liste blanche : méthode, chemin, action */
        static final String[][] ROUTES = { { "GET", "/etat", "etat" }, { "POST", "/commande", "commande" }, { "POST", "/audio", "audio" },
            { "POST", "/lumieres", "lumieres" }, { "POST", "/routine", "routine" }, { "POST", "/clim", "clim" } };
        static final java.nio.charset.Charset UTF8 = java.nio.charset.Charset.forName("UTF-8");

        // ---------- Textes courts pour la montre ----------
        /** Espaces réduits ; au-delà de max, coupé au dernier mot entier (s'il n'est pas trop loin) avec « … » */
        static String clip(String s, int max) {
            if (s == null) return "";
            String t = s.replaceAll("[\\r\\n\\t]+", " ").replaceAll(" {2,}", " ").trim();
            if (t.length() <= max) return t;
            int cut = max - 1;
            if (cut > 0 && Character.isHighSurrogate(t.charAt(cut - 1))) cut--;
            String head = t.substring(0, cut);
            int sp = head.lastIndexOf(' ');
            if (sp >= max / 2) head = head.substring(0, sp);
            head = head.replaceAll("[\\s,;:.·«(\\-–—]+$", "");
            return head + "…";
        }
        static String[] alarmContent(String title, String text) {
            return new String[]{ clip(title == null || title.trim().isEmpty() ? "Majordome" : title, TITLE_MAX), clip(text, TEXT_MAX) };
        }
        static int kindIndex(String k) { for (int i = 0; i < KINDS.length; i++) if (KINDS[i].equals(k)) return i; return -1; }

        // ---------- Jeton ----------
        static final String ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // sans 0/O ni 1/I/L : se recopie sans erreur
        static String newToken(java.security.SecureRandom r) { StringBuilder b = new StringBuilder(); for (int i = 0; i < 20; i++) b.append(ALPHA.charAt(r.nextInt(ALPHA.length()))); return b.toString(); }
        static String normToken(String s) { if (s == null) return ""; String t = s.toUpperCase(Locale.ROOT).replaceAll("[\\s\\-]", ""); return t.matches("[A-Z0-9]{1,64}") ? t : ""; }
        static String grouped(String t) { StringBuilder b = new StringBuilder(); for (int i = 0; i < t.length(); i++) { if (i > 0 && i % 4 == 0) b.append('-'); b.append(t.charAt(i)); } return b.toString(); }
        /** Comparaison à temps constant (ne dépend que de la longueur attendue) */
        static boolean sameToken(String want, String got) {
            String a = normToken(want), b = normToken(got);
            if (a.length() < 16) return false;
            int diff = a.length() ^ b.length();
            for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ (i < b.length() ? b.charAt(i) : 0);
            return diff == 0;
        }

        // ---------- Serveur HTTP local (127.0.0.1 seulement) ----------
        interface Tok { String get(); }
        interface Handler { Resp handle(String action, String body) throws Exception; }
        static final class Resp { final int code; final String body; Resp(int c, String b) { code = c; body = b == null ? "{}" : b; } }
        static final class Req { String method, path, host, auth; int len = -1; boolean chunked; }
        static final class Bad extends Exception { final int code; final String msg; Bad(int c, String m) { super(m); code = c; msg = m; } }
        static String err(String m) { return "{\"ok\":false,\"erreur\":" + quote(m) + "}"; }
        static String quote(String s) {
            StringBuilder b = new StringBuilder("\"");
            for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); if (c == '"' || c == '\\') b.append('\\').append(c); else if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
            return b.append('"').toString();
        }
        static String[] route(String path) { for (String[] r : ROUTES) if (r[1].equals(path)) return r; return null; }

        static final class Server {
            final int port; final Tok tok; final Handler h;
            private java.net.ServerSocket ss; private java.util.concurrent.ThreadPoolExecutor pool;
            volatile boolean running; volatile long lastAt = 0; volatile String lastAction = "";
            final java.util.concurrent.atomic.AtomicInteger served = new java.util.concurrent.atomic.AtomicInteger(), refused = new java.util.concurrent.atomic.AtomicInteger();
            private final java.util.ArrayDeque<Long> bad = new java.util.ArrayDeque<>(); private volatile long lockUntil = 0;
            Server(int port, Tok tok, Handler h) { this.port = port; this.tok = tok; this.h = h; }

            synchronized void start() throws java.io.IOException {
                if (running) return;
                java.net.ServerSocket s = new java.net.ServerSocket();
                s.setReuseAddress(true);
                s.bind(new java.net.InetSocketAddress(java.net.InetAddress.getByAddress(new byte[]{ 127, 0, 0, 1 }), port), 16);
                ss = s;
                pool = new java.util.concurrent.ThreadPoolExecutor(3, 3, 30, java.util.concurrent.TimeUnit.SECONDS, new java.util.concurrent.ArrayBlockingQueue<Runnable>(8));
                running = true;
                Thread th = new Thread(new Runnable() { public void run() { loop(s); } }, "majordome-montre");
                th.setDaemon(true); th.start();
            }
            synchronized void stop() {
                running = false;
                try { if (ss != null) ss.close(); } catch (Exception e) { }
                if (pool != null) pool.shutdownNow();
            }
            boolean isRunning() { return running && ss != null && !ss.isClosed(); }

            private void loop(java.net.ServerSocket s) {
                while (running) {
                    final java.net.Socket c;
                    try { c = s.accept(); } catch (java.io.IOException e) { if (!running || s.isClosed()) break; continue; }
                    if (!c.getInetAddress().isLoopbackAddress()) { close(c); continue; }   // impossible (bouclage), par prudence
                    try { pool.execute(new Runnable() { public void run() { serve(c); } }); }
                    catch (java.util.concurrent.RejectedExecutionException e) { try { write(c.getOutputStream(), new Resp(503, err("occupé"))); } catch (Exception x) { } close(c); }
                }
            }
            static void close(java.net.Socket c) { try { c.close(); } catch (Exception e) { } }

            void serve(java.net.Socket c) {
                try {
                    c.setSoTimeout(6000);
                    java.io.InputStream in = new java.io.BufferedInputStream(c.getInputStream());
                    Resp r;
                    try { r = answer(in); }
                    catch (Bad b) { r = new Resp(b.code, err(b.msg)); }
                    catch (java.net.SocketTimeoutException e) { r = new Resp(408, err("délai dépassé")); }
                    if (r.code >= 400) refused.incrementAndGet();
                    write(c.getOutputStream(), r);
                } catch (Throwable t) {
                } finally { close(c); }
            }
            Resp answer(java.io.InputStream in) throws Exception {
                Req q = head(in);
                // Host : seulement l'adresse de bouclage (une page web ne peut pas se faire passer pour 127.0.0.1)
                if (!hostOk(q.host)) throw new Bad(403, "hôte refusé");
                if ("OPTIONS".equals(q.method)) throw new Bad(405, "méthode refusée");
                if (System.currentTimeMillis() < lockUntil) throw new Bad(429, "trop de jetons refusés : réessayez dans une minute");
                String want = tok == null ? null : tok.get();
                String a = q.auth == null ? "" : q.auth.trim();
                if (want == null || !a.regionMatches(true, 0, "Bearer ", 0, 7) || !sameToken(want, a.substring(7))) { noteBad(); throw new Bad(401, "jeton absent ou refusé"); }
                String p = q.path; int k = p.indexOf('?'); if (k >= 0) p = p.substring(0, k);
                String[] rt = route(p);
                if (rt == null) throw new Bad(404, "action inconnue");
                if (!rt[0].equals(q.method)) throw new Bad(405, "méthode refusée");
                String body = "";
                if ("POST".equals(q.method)) {
                    int max = "audio".equals(rt[2]) ? MAX_AUDIO : MAX_BODY;
                    if (q.chunked) body = new String(chunked(in, max), UTF8);   // certains clients n'annoncent pas la longueur
                    else {
                        if (q.len < 0) throw new Bad(411, "longueur exigée");
                        if (q.len > max) throw new Bad(413, "corps trop gros");
                        byte[] b = new byte[q.len]; int got = 0;
                        while (got < q.len) { int n = in.read(b, got, q.len - got); if (n < 0) throw new Bad(400, "corps incomplet"); got += n; }
                        body = new String(b, UTF8);
                    }
                }
                lastAt = System.currentTimeMillis(); lastAction = rt[2]; served.incrementAndGet();
                try { Resp r = h.handle(rt[2], body); return r == null ? new Resp(500, err("pas de réponse")) : r; }
                catch (Bad b) { throw b; }
                catch (org.json.JSONException e) { throw new Bad(400, "JSON illisible"); }
                catch (Exception e) { return new Resp(500, err("erreur : " + e.getMessage())); }
            }
            private synchronized void noteBad() {
                long now = System.currentTimeMillis();
                bad.addLast(now);
                while (!bad.isEmpty() && now - bad.peekFirst() > 60000) bad.pollFirst();
                if (bad.size() >= 10) { lockUntil = now + 60000; bad.clear(); }
            }
            boolean hostOk(String host) {
                if (host == null) return false;
                String x = host.trim().toLowerCase(Locale.ROOT);
                return x.equals("127.0.0.1:" + port) || x.equals("localhost:" + port) || x.equals("127.0.0.1") || x.equals("localhost");
            }
            static Req head(java.io.InputStream in) throws Exception {
                Req q = new Req(); int[] used = { 0 };
                String l = line(in, used);
                if (l == null) throw new Bad(400, "requête vide");
                String[] p = l.split(" ");
                if (p.length != 3 || !p[2].startsWith("HTTP/1.") || !p[0].matches("[A-Z]{3,7}") || !p[1].startsWith("/")) throw new Bad(400, "requête invalide");
                q.method = p[0]; q.path = p[1];
                while (true) {
                    String h = line(in, used);
                    if (h == null) throw new Bad(400, "en-têtes incomplets");
                    if (h.isEmpty()) break;
                    int k = h.indexOf(':'); if (k <= 0) continue;
                    String n = h.substring(0, k).trim().toLowerCase(Locale.ROOT), v = h.substring(k + 1).trim();
                    if ("host".equals(n)) q.host = v;
                    else if ("authorization".equals(n)) q.auth = v;
                    else if ("content-length".equals(n)) { try { q.len = Integer.parseInt(v); } catch (Exception e) { throw new Bad(400, "longueur invalide"); } if (q.len < 0) throw new Bad(400, "longueur invalide"); }
                    else if ("transfer-encoding".equals(n)) q.chunked = true;
                }
                return q;
            }
            /** Corps « Transfer-Encoding: chunked », borné à max octets */
            static byte[] chunked(java.io.InputStream in, int max) throws Exception {
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(); int[] used = { 0 };
                while (true) {
                    used[0] = 0;
                    String sz = line(in, used); if (sz == null) throw new Bad(400, "corps incomplet");
                    int sc = sz.indexOf(';'); if (sc >= 0) sz = sz.substring(0, sc); sz = sz.trim();
                    if (sz.isEmpty()) continue;
                    int n; try { n = Integer.parseInt(sz, 16); } catch (Exception e) { throw new Bad(400, "morceau invalide"); }
                    if (n < 0 || out.size() + n > max) throw new Bad(413, "corps trop gros");
                    if (n == 0) { while (true) { used[0] = 0; String t = line(in, used); if (t == null || t.isEmpty()) break; } break; }
                    byte[] b = new byte[n]; int got = 0;
                    while (got < n) { int k = in.read(b, got, n - got); if (k < 0) throw new Bad(400, "corps incomplet"); got += k; }
                    out.write(b, 0, n);
                    used[0] = 0; line(in, used);
                }
                return out.toByteArray();
            }
            static String line(java.io.InputStream in, int[] used) throws Exception {
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream(); int c;
                while ((c = in.read()) >= 0) { if (++used[0] > MAX_HEAD) throw new Bad(431, "en-têtes trop longs"); if (c == '\n') break; if (c != '\r') b.write(c); }
                if (c < 0 && b.size() == 0) return null;
                return b.toString("UTF-8");
            }
            static void write(java.io.OutputStream o, Resp r) throws java.io.IOException {
                byte[] b = r.body.getBytes(UTF8);
                String reason = r.code == 200 ? "OK" : r.code == 400 ? "Bad Request" : r.code == 401 ? "Unauthorized" : r.code == 403 ? "Forbidden" : r.code == 404 ? "Not Found" : r.code == 405 ? "Method Not Allowed"
                    : r.code == 408 ? "Request Timeout" : r.code == 411 ? "Length Required" : r.code == 413 ? "Payload Too Large" : r.code == 429 ? "Too Many Requests" : r.code == 431 ? "Request Header Fields Too Large" : r.code == 503 ? "Service Unavailable" : "Error";
                String h = "HTTP/1.1 " + r.code + " " + reason + "\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: " + b.length
                    + "\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";
                o.write(h.getBytes(UTF8)); o.write(b); o.flush();
            }
        }

        // ---------- Routeur : actions de la liste blanche ----------
        interface Actions {
            String etat() throws Exception;
            String lumieres(String action, String id) throws Exception;
            String clim() throws Exception;
            String relay(String kind, String arg) throws Exception;     // « commande » (texte) ou « routine » (identifiant)
            String suite(String id) throws Exception;                   // réponse d'une commande encore en cours
            String audio(byte[] opus) throws Exception;
        }
        static final String ID = "[A-Za-z0-9\\-]{1,64}";
        static Handler router(final Actions a) {
            return new Handler() { public Resp handle(String action, String body) throws Exception {
                org.json.JSONObject o = body == null || body.trim().isEmpty() ? new org.json.JSONObject() : new org.json.JSONObject(body);
                switch (action) {
                    case "etat": return new Resp(200, a.etat());
                    case "clim": return new Resp(200, a.clim());
                    case "lumieres": {
                        String act = o.optString("action"), id = o.optString("id", "");
                        if ("tout_eteindre".equals(act)) return new Resp(200, a.lumieres(act, null));
                        if ("piece".equals(act) && id.matches(ID)) return new Resp(200, a.lumieres(act, id));
                        throw new Bad(400, "action de lumière inconnue");
                    }
                    case "routine": {
                        String id = o.optString("id");
                        if (!id.matches("[A-Za-z0-9_\\-]{1,32}")) throw new Bad(400, "routine inconnue");
                        return new Resp(200, a.relay("routine", id));
                    }
                    case "commande": {
                        String s = o.optString("suite", "");
                        if (!s.isEmpty()) { if (!s.matches("[0-9a-f]{16}")) throw new Bad(400, "suite inconnue"); return new Resp(200, a.suite(s)); }
                        String t = o.optString("texte", "").replaceAll("[\\p{Cntrl}]+", " ").trim();
                        if (t.isEmpty() || t.length() > 200) throw new Bad(400, "texte vide ou trop long");
                        return new Resp(200, a.relay("commande", t));
                    }
                    case "audio": {
                        byte[] d = b64(o.optString("opus", ""));
                        if (d == null || d.length < 16) throw new Bad(400, "audio vide ou illisible");
                        return new Resp(200, a.audio(d));
                    }
                }
                throw new Bad(404, "action inconnue");
            } };
        }

        // ---------- Relais vers la page (commande, routine) : réponse attendue 7 s, puis « suite » ----------
        static final class Relay {
            static final class P { final java.util.concurrent.CountDownLatch l = new java.util.concurrent.CountDownLatch(1); volatile String json; final long at = System.currentTimeMillis(); }
            final java.util.concurrent.ConcurrentHashMap<String, P> map = new java.util.concurrent.ConcurrentHashMap<>();
            final java.security.SecureRandom rnd = new java.security.SecureRandom();
            String open() {
                purge();
                byte[] b = new byte[8]; rnd.nextBytes(b); StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x & 0xff));
                map.put(s.toString(), new P()); return s.toString();
            }
            boolean has(String id) { return id != null && map.containsKey(id); }
            void reply(String id, String json) { P p = id == null ? null : map.get(id); if (p != null && p.json == null) { p.json = json; p.l.countDown(); } }
            /** Réponse de la page, ou null si elle n'est pas encore arrivée (la demande reste ouverte 3 minutes) */
            String await(String id, long ms) throws InterruptedException {
                P p = map.get(id); if (p == null) return null;
                p.l.await(ms, java.util.concurrent.TimeUnit.MILLISECONDS);
                if (p.json != null) map.remove(id);
                return p.json;
            }
            void purge() { long now = System.currentTimeMillis(); for (java.util.Map.Entry<String, P> e : map.entrySet()) if (now - e.getValue().at > 180000) map.remove(e.getKey()); }
        }
        /** Réponse de la page nettoyée : {ok, texte (≤ 600), question, entendu} */
        static String cleanReply(String json) {
            try {
                org.json.JSONObject o = new org.json.JSONObject(json), r = new org.json.JSONObject();
                r.put("ok", o.optBoolean("ok", true)).put("texte", clip(o.optString("texte", ""), 600));
                if (o.optBoolean("question")) r.put("question", true);
                if (o.optBoolean("ouinon")) r.put("ouinon", true);
                return r.toString();
            } catch (Exception e) { return "{\"ok\":false,\"texte\":\"Réponse illisible.\"}"; }
        }
        static String pendingJson(String id) { return "{\"ok\":true,\"attente\":\"" + id + "\",\"texte\":\"Un instant…\"}"; }

        // ---------- État pour l'écran principal de la montre ----------
        static String etat(MajordomeWidget.Model m, String hueJson, String favsCsv, long now) throws org.json.JSONException {
            org.json.JSONObject o = new org.json.JSONObject().put("v", 1).put("nom", m.name).put("appel", m.sir == null ? "" : m.sir).put("t", now);
            if (m.temp != null) {
                org.json.JSONObject w = new org.json.JSONObject().put("t", m.temp).put("ciel", m.sky == null ? "" : m.sky).put("vent", m.wind == null ? 0 : m.wind)
                    .put("rafales", m.gust == null ? 0 : m.gust).put("seuil", m.windLimit).put("niveau", MajordomeWidget.windLevel(m)).put("lieu", m.where == null ? "" : m.where);
                o.put("meteo", w);
            }
            if (m.evTitle != null) o.put("rdv", new org.json.JSONObject().put("titre", clip(m.evTitle, 40)).put("quand", MajordomeWidget.capital(MajordomeWidget.day(m.evAt, now)) + (m.evAll ? " · journée" : " à " + MajordomeWidget.hm(m.evAt))));
            if (m.alarmAt > now) o.put("reveil", new org.json.JSONObject().put("heure", MajordomeWidget.hm(m.alarmAt)).put("jour", MajordomeWidget.day(m.alarmAt, now)));
            if (m.timerAt > now) o.put("minuteur", new org.json.JSONObject().put("label", m.timerLabel == null || m.timerLabel.isEmpty() ? "Minuteur" : clip(MajordomeWidget.capital(m.timerLabel), 24)).put("fin", m.timerAt));
            org.json.JSONObject l = new org.json.JSONObject().put("jumele", m.huePaired).put("allumees", m.hueOn).put("total", m.hueTotal);
            if (m.hueErr != null) l.put("erreur", m.hueErr);
            org.json.JSONArray rooms = new org.json.JSONArray(), all = null;
            try { all = new org.json.JSONObject(hueJson == null || hueJson.isEmpty() ? "{}" : hueJson).optJSONArray("rooms"); } catch (Exception e) { }
            java.util.List<String> favs = new java.util.ArrayList<>();
            for (String f : (favsCsv == null ? "" : favsCsv).split(",")) if (f.trim().matches(ID)) favs.add(f.trim());
            if (all != null) {
                for (String f : favs) for (int i = 0; i < all.length(); i++) { org.json.JSONObject r = all.optJSONObject(i); if (r != null && f.equals(r.optString("id")) && rooms.length() < 3) rooms.put(room(r)); }
                for (int i = 0; favs.isEmpty() && i < all.length() && rooms.length() < 3; i++) { org.json.JSONObject r = all.optJSONObject(i); if (r != null) rooms.put(room(r)); }
            }
            o.put("lumieres", l.put("pieces", rooms));
            if (m.lastA != null && now - m.lastAt < 12 * 3600000L) o.put("derniere", clip(m.lastA, 120));
            return o.toString();
        }
        static org.json.JSONObject room(org.json.JSONObject r) throws org.json.JSONException { return new org.json.JSONObject().put("id", r.optString("id")).put("nom", clip(r.optString("name", "Pièce"), 18)).put("on", r.optBoolean("on")); }

        // ---------- Audio de la montre : Opus brut du Recorder de Zepp OS ----------
        /** Paquets Opus du Recorder (@zos/media, codec.OPUS) : sans conteneur, chacun « [u32 BE longueur][u32 BE état final
         *  du codeur][paquet] » (disposition de l'outil opus_demo de libopus), relevée sur une T-Rex 3 Pro par le projet
         *  public SDarioosh/odysseus-sound. null si les données n'ont pas cette forme. */
        static java.util.List<byte[]> opusPackets(byte[] d) {
            java.util.List<byte[]> out = new java.util.ArrayList<>();
            int pos = 0, stereo = -1;
            while (pos + 8 <= d.length) {
                int len = ((d[pos] & 0xff) << 24) | ((d[pos + 1] & 0xff) << 16) | ((d[pos + 2] & 0xff) << 8) | (d[pos + 3] & 0xff);
                if (len < 1 || len > 1275) return null;
                int start = pos + 8;
                if (start + len > d.length) break;              // dernier paquet coupé : ignoré
                byte[] p = java.util.Arrays.copyOfRange(d, start, start + len);
                int st = p[0] & 0x04;
                if (stereo < 0) stereo = st; else if (st != stereo) return null;
                out.add(p); pos = start + len;
                if (out.size() > 20000) return null;
            }
            return out.isEmpty() ? null : out;
        }
        /** Échantillons à 48 kHz d'un paquet Opus (RFC 6716, § 3.1) */
        static int packetSamples48(byte[] p) {
            int config = (p[0] & 0xff) >> 3, frame;
            if (config < 12) frame = new int[]{ 480, 960, 1920, 2880 }[config % 4];
            else if (config < 16) frame = new int[]{ 480, 960 }[config % 2];
            else frame = new int[]{ 120, 240, 480, 960 }[config % 4];
            int code = p[0] & 3, frames = code == 0 ? 1 : code < 3 ? 2 : (p.length > 1 ? p[1] & 0x3f : 0);
            return frame * frames;
        }
        /** En-tête « OpusHead » (RFC 7845, § 5.1), donné au décodeur d'Android comme csd-0 */
        static byte[] opusHead(int channels, int preskip, int inputRate) {
            byte[] h = new byte[19]; byte[] magic = "OpusHead".getBytes(UTF8);
            System.arraycopy(magic, 0, h, 0, 8); h[8] = 1; h[9] = (byte) channels;
            h[10] = (byte) preskip; h[11] = (byte) (preskip >> 8);
            for (int i = 0; i < 4; i++) h[12 + i] = (byte) (inputRate >> (8 * i));
            return h;   // gain 0, famille de canaux 0
        }
        static byte[] le64(long v) { byte[] b = new byte[8]; for (int i = 0; i < 8; i++) b[i] = (byte) (v >> (8 * i)); return b; }
        /** Mono, puis rééchantillonnage par moyenne sur la fenêtre (passe-bas simple, suffisant pour la reconnaissance) */
        static short[] resample(short[] in, int rate, int channels, int out) {
            if (channels < 1) channels = 1;
            int n = in.length / channels; double[] mono = new double[n];
            for (int i = 0; i < n; i++) { double s = 0; for (int c = 0; c < channels; c++) s += in[i * channels + c]; mono[i] = s / channels; }
            if (rate == out) { short[] r = new short[n]; for (int i = 0; i < n; i++) r[i] = (short) Math.round(mono[i]); return r; }
            int m = (int) ((long) n * out / rate); short[] r = new short[m]; double step = (double) rate / out;
            for (int i = 0; i < m; i++) {
                int a = (int) Math.floor(i * step), b = Math.max(a + 1, (int) Math.floor((i + 1) * step)); b = Math.min(b, n);
                double s = 0; for (int k = a; k < b; k++) s += mono[k];
                r[i] = (short) Math.max(-32768, Math.min(32767, Math.round(s / Math.max(1, b - a))));
            }
            return r;
        }
        /** Base64 standard (sans dépendre de java.util.Base64, absent avant Android 8) ; null si illisible */
        static byte[] b64(String s) {
            if (s == null) return null;
            String t = s.replaceAll("\\s", ""); if (t.isEmpty() || t.length() % 4 != 0) return null;
            int pad = t.endsWith("==") ? 2 : t.endsWith("=") ? 1 : 0;
            byte[] out = new byte[t.length() / 4 * 3 - pad]; int o = 0;
            for (int i = 0; i < t.length(); i += 4) {
                int v = 0;
                for (int j = 0; j < 4; j++) {
                    char c = t.charAt(i + j); int x;
                    if (c >= 'A' && c <= 'Z') x = c - 'A'; else if (c >= 'a' && c <= 'z') x = c - 'a' + 26; else if (c >= '0' && c <= '9') x = c - '0' + 52;
                    else if (c == '+') x = 62; else if (c == '/') x = 63; else if (c == '=' && i + j >= t.length() - pad) x = 0; else return null;
                    v = (v << 6) | x;
                }
                for (int j = 0; j < 3 && o < out.length; j++) out[o++] = (byte) (v >> (16 - 8 * j));
            }
            return out;
        }
    }

    // ---------- Réglages de la montre (préférences privées de l'appli ; le jeton n'est jamais dans la page web) ----------
    static JSONObject watchPrefs(Context c) { try { return new JSONObject(prefs(c).getString("montre", "{}")); } catch (Exception e) { return new JSONObject(); } }
    static boolean watchOn(Context c) { return watchPrefs(c).optBoolean("on", false); }
    static int watchPort(Context c) { int p = watchPrefs(c).optInt("port", Lien.PORT); return p >= 1024 && p <= 65535 ? p : Lien.PORT; }
    static synchronized String watchToken(Context c) {
        String t = prefs(c).getString("montreJeton", "");
        if (Lien.normToken(t).length() < 16) { t = Lien.newToken(new java.security.SecureRandom()); prefs(c).edit().putString("montreJeton", t).apply(); }
        return t;
    }
    /** Alerte facultative pour la montre (vent, vigilance, matin, réponse), seulement si l'option et le type sont actifs */
    static boolean watchPost(Context c, String kind, String title, String text) {
        boolean essai = "essai".equals(kind);   // bouton « Envoyer un essai » des réglages
        int k = essai ? Lien.KINDS.length : Lien.kindIndex(kind);
        if (k < 0) return false;
        JSONObject p = watchPrefs(c);
        if (!p.optBoolean("on", false) || (!essai && !p.optBoolean(kind, !"reponse".equals(kind)))) return false;
        try {
            channels(c);
            String[] tt = Lien.alarmContent(title, text);
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            PendingIntent pi = open == null ? null : PendingIntent.getActivity(c, 6680 + k, open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = nb(c, CH_WATCH).setSmallIcon(c.getApplicationInfo().icon).setContentTitle(tt[0]).setContentText(tt[1])
                .setStyle(new Notification.BigTextStyle().bigText(tt[1])).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory("reponse".equals(kind) ? Notification.CATEGORY_MESSAGE : "matin".equals(kind) ? Notification.CATEGORY_EVENT : Notification.CATEGORY_STATUS);
            if (pi != null) b.setContentIntent(pi);
            if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter("reponse".equals(kind) ? 15 * 60000L : "matin".equals(kind) ? 4 * 3600000L : 12 * 3600000L);
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_WATCH_BASE + k, b.build());
            return true;
        } catch (Throwable t) { return false; }
    }
    /** Page ouverte : elle sonne elle-même ; la copie (canal silencieux) suffit pour que Zepp fasse vibrer la montre */
    static void watchAlarmCopy(Context c, String id, JSONObject o) {
        try {
            channels(c);
            String[] tt = Lien.alarmContent(o.optString("title", "Majordome"), o.optString("text", ""));
            Notification.Builder b = nb(c, CH_WATCH).setSmallIcon(c.getApplicationInfo().icon).setContentTitle(tt[0]).setContentText(tt[1])
                .setStyle(new Notification.BigTextStyle().bigText(tt[1])).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory("reminder".equals(o.optString("kind")) ? Notification.CATEGORY_REMINDER : Notification.CATEGORY_ALARM);
            if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(10 * 60000L);
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_ALARM_BASE + (id.hashCode() & 0x3ff), b.build());
        } catch (Throwable t) { }
    }

    @JavascriptInterface public String watchInfo() {
        try {
            JSONObject p = watchPrefs(a), o = new JSONObject();
            o.put("on", p.optBoolean("on", false)).put("port", watchPort(a)).put("token", Lien.grouped(watchToken(a)));
            for (String k : Lien.KINDS) o.put(k, p.optBoolean(k, !"reponse".equals(k)));
            o.put("favs", p.optString("favs", "")).put("parle", p.optBoolean("parle", false));
            Lien.Server s = Montre.server;
            o.put("running", s != null && s.isRunning()).put("lastAt", s == null ? 0 : s.lastAt).put("served", s == null ? 0 : s.served.get()).put("refused", s == null ? 0 : s.refused.get()).put("err", Montre.lastErr);
            try { JSONArray r = new JSONObject(WidgetProvider.prefs(a).getString("hue", "{}")).optJSONArray("rooms"); o.put("rooms", r == null ? new JSONArray() : r); } catch (Throwable t) { o.put("rooms", new JSONArray()); }
            o.put("notif", Build.VERSION.SDK_INT < 33 || has("android.permission.POST_NOTIFICATIONS"));
            o.put("zepp", a.getPackageManager().getLaunchIntentForPackage("com.huami.watch.hmwatchmanager") != null);
            return o.toString();
        } catch (Exception e) { return "{}"; }
    }
    @JavascriptInterface public void watchSet(String json) {
        try {
            JSONObject in = new JSONObject(json == null ? "{}" : json), p = watchPrefs(a);
            if (in.has("on")) p.put("on", in.optBoolean("on"));
            if (in.has("port")) { int port = in.optInt("port", Lien.PORT); p.put("port", port >= 1024 && port <= 65535 ? port : Lien.PORT); }
            for (String k : Lien.KINDS) if (in.has(k)) p.put(k, in.optBoolean(k));
            if (in.has("parle")) p.put("parle", in.optBoolean("parle"));
            if (in.has("favs")) { StringBuilder f = new StringBuilder(); for (String x : in.optString("favs", "").split(",")) if (x.trim().matches(Lien.ID) && f.length() < 400) f.append(f.length() > 0 ? "," : "").append(x.trim()); p.put("favs", f.toString()); }
            prefs(a).edit().putString("montre", p.toString()).apply();
            watchToken(a);
            if (p.optBoolean("on")) askNotif();
            Montre.sync(a);
        } catch (Exception e) { }
    }
    @JavascriptInterface public String watchNewToken() {
        String t = Lien.newToken(new java.security.SecureRandom());
        prefs(a).edit().putString("montreJeton", t).apply();
        return Lien.grouped(t);
    }
    @JavascriptInterface public void watchCopy() {
        final String t = Lien.grouped(watchToken(a));
        ui.post(new Runnable() { public void run() {
            try { ((android.content.ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("Jeton Jarvis", t)); toast("Jeton copié : collez-le dans Zepp › Jarvis › Réglages"); }
            catch (Throwable x) { toast("Copie impossible"); }
        } });
    }
    @JavascriptInterface public boolean watchNotify(String json) {
        try { JSONObject o = new JSONObject(json); return watchPost(a, o.optString("kind"), o.optString("title"), o.optString("text")); } catch (Exception e) { return false; }
    }
    @JavascriptInterface public void watchReply(String id, String json) { Montre.RELAY.reply(id, Lien.cleanReply(json)); }
    @JavascriptInterface public String takeWatch() { String w = pendingWatch; pendingWatch = ""; return w == null ? "" : w; }

    /** Service au premier plan « appareil connecté » : tient le serveur local tant que l'option « Montre connectée » est active */
    public static class Montre extends Service {
        static volatile Lien.Server server;
        static volatile String lastErr = "";
        static final Lien.Relay RELAY = new Lien.Relay();
        static void sync(Context c) {
            Intent i = new Intent(c, Montre.class);
            if (watchOn(c)) { try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i); } catch (Throwable t) { lastErr = "Android refuse le service : ouvrez Majordome"; } }
            else { try { c.stopService(i); } catch (Throwable t) { } stopServer(); }
        }
        static synchronized void stopServer() { Lien.Server s = server; server = null; if (s != null) s.stop(); }
        static synchronized void startServer(final Context c) {
            int port = watchPort(c);
            Lien.Server s = server;
            if (s != null && s.port == port && s.isRunning()) return;
            stopServer();
            s = new Lien.Server(port, new Lien.Tok() { public String get() { return watchOn(c) ? watchToken(c) : null; } }, Lien.router(new Acts(c.getApplicationContext())));
            try { s.start(); server = s; lastErr = ""; }
            catch (java.io.IOException e) { lastErr = "port " + port + " déjà utilisé : choisissez-en un autre"; }
        }
        @Override public IBinder onBind(Intent i) { return null; }
        @Override public int onStartCommand(Intent intent, int flags, int id) {
            channels(this);
            fg();
            if (!watchOn(this)) { stopServer(); stopSelf(); return START_NOT_STICKY; }
            startServer(this);
            return START_STICKY;
        }
        void fg() {
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent pi = open == null ? null : PendingIntent.getActivity(this, 6690, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = nb(this, CH_LINK).setSmallIcon(getApplicationInfo().icon).setOngoing(true)
                .setContentTitle("Montre connectée").setContentText("Jarvis peut joindre Majordome sur ce téléphone");
            if (pi != null) b.setContentIntent(pi);
            try {
                if (Build.VERSION.SDK_INT >= 29) startForeground(N_LINK, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
                else startForeground(N_LINK, b.build());
            } catch (Throwable t) { lastErr = "Android refuse le service au premier plan"; }
        }
        @Override public void onDestroy() { stopServer(); super.onDestroy(); }

        /** Actions réelles (Android) derrière le routeur */
        static final class Acts implements Lien.Actions {
            final Context c;
            Acts(Context c) { this.c = c; }
            public String etat() throws Exception {
                JSONObject p = watchPrefs(c);
                String hue = WidgetProvider.prefs(c).getString("hue", "");
                // lumières relues en tâche de fond si l'état a plus de 2 minutes (pont du réseau local seulement)
                try { JSONObject h = new JSONObject(hue.isEmpty() ? "{}" : hue); if (h.optBoolean("paired") && System.currentTimeMillis() - h.optLong("at") > 120000) HX.execute(new Runnable() { public void run() { hueDo(c, "hue_refresh", null); } }); } catch (Throwable t) { }
                return Lien.etat(MajordomeWidget.read(c), hue, p.optString("favs", ""), System.currentTimeMillis());
            }
            public String lumieres(String action, String id) throws Exception {
                String name = null; boolean was = false;
                if (id != null) try { JSONArray r = new JSONObject(WidgetProvider.prefs(c).getString("hue", "{}")).optJSONArray("rooms"); for (int i = 0; r != null && i < r.length(); i++) if (id.equals(r.getJSONObject(i).optString("id"))) { name = r.getJSONObject(i).optString("name"); was = r.getJSONObject(i).optBoolean("on"); } } catch (Throwable t) { }
                String e = hueDo(c, id == null ? "hue_all_off" : "hue_room", id);
                if (e == null) return new JSONObject().put("ok", true).put("texte", id == null ? "Lumières éteintes." : (name == null ? "Pièce" : name) + (was ? " : éteinte." : " : allumée.")).toString();
                String t = "notpaired".equals(e) ? "Aucun pont Hue n'est jumelé dans Majordome." : "unauthorized".equals(e) ? "Le pont Hue refuse Majordome : jumelez-le à nouveau." : "unreachable".equals(e) ? "Le pont Hue ne répond pas (téléphone sur le Wi-Fi de la maison ?)." : "Le pont Hue a refusé la commande.";
                return new JSONObject().put("ok", false).put("texte", t).put("erreur", e).toString();
            }
            public String clim() throws Exception {
                Intent li = c.getPackageManager().getLaunchIntentForPackage("com.panasonic.ACCsmart");
                if (li == null) return new JSONObject().put("ok", false).put("texte", "Comfort Cloud n'est pas installée sur le téléphone.").toString();
                li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c)) {
                    try { c.startActivity(li); return new JSONObject().put("ok", true).put("texte", "Comfort Cloud s'ouvre sur le téléphone.").toString(); } catch (Throwable t) { }
                }
                channels(c);
                PendingIntent pi = PendingIntent.getActivity(c, 6691, li, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                Notification.Builder b = nb(c, CH_CMD).setSmallIcon(c.getApplicationInfo().icon).setContentTitle("Climatisation").setContentText("Touchez pour ouvrir Comfort Cloud").setAutoCancel(true).setContentIntent(pi);
                ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_CMD, b.build());
                return new JSONObject().put("ok", true).put("texte", "Touchez la notification sur le téléphone pour ouvrir Comfort Cloud.").toString();
            }
            public String relay(String kind, String arg) throws Exception {
                String id = RELAY.open();
                JSONObject w = new JSONObject().put("id", id).put("kind", kind);
                if ("routine".equals(kind)) w.put("routine", arg); else w.put("text", arg);
                dispatch(c, w.toString());
                String r = RELAY.await(id, 7000);
                return r != null ? r : Lien.pendingJson(id);
            }
            public String suite(String id) throws Exception {
                if (!RELAY.has(id)) return new JSONObject().put("ok", false).put("texte", "Réponse perdue : redemandez.").toString();
                String r = RELAY.await(id, 7000);
                if (r != null) return r;
                return live == null ? new JSONObject().put("ok", true).put("attente", id).put("texte", "Majordome s'ouvre sur le téléphone…").toString() : Lien.pendingJson(id);
            }
            public String audio(byte[] data) throws Exception {
                if (!modelReady(c)) return new JSONObject().put("ok", false).put("texte", "Installez d'abord le modèle vocal dans Majordome (Réglages › Reconnaissance vocale).").toString();
                java.util.List<byte[]> pk = Lien.opusPackets(data);
                if (pk == null) return new JSONObject().put("ok", false).put("texte", "Enregistrement illisible (format inattendu).").toString();
                String text;
                try { text = recognize(c, decodeOpus(pk)); }
                catch (Throwable t) { return new JSONObject().put("ok", false).put("texte", "Décodage impossible sur ce téléphone : " + t.getMessage()).toString(); }
                if (text == null || text.trim().isEmpty()) return new JSONObject().put("ok", true).put("entendu", "").put("texte", "Je n'ai rien entendu.").toString();
                JSONObject r = new JSONObject(relay("commande", text.trim()));
                return r.put("entendu", text.trim()).toString();
            }
        }
        /** Vers la page : ouverte → événement « watch » ; fermée → on l'ouvre (comme après « Jarvis » téléphone en veille) */
        static void dispatch(Context c, String payload) {
            MajordomeBridge b = live;
            if (b != null) { b.emit("watch", payload); return; }
            pendingWatch = payload;
            Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (i == null) return;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            if (Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c)) { try { c.startActivity(i); return; } catch (Throwable t) { } }
            channels(c);
            PendingIntent pi = PendingIntent.getActivity(c, 6692, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder nbu = nb(c, CH_CMD).setSmallIcon(c.getApplicationInfo().icon).setContentTitle("Jarvis (montre)").setContentText("Touchez pour la réponse").setAutoCancel(true).setContentIntent(pi).setFullScreenIntent(pi, true);
            try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_CMD, nbu.build()); } catch (Throwable t) { }
        }
        /** Opus → PCM 16 bits par le décodeur d'Android (MediaCodec « audio/opus », Android 5+), puis 16 kHz mono pour Vosk */
        static short[] decodeOpus(java.util.List<byte[]> pk) throws Exception {
            android.media.MediaFormat f = android.media.MediaFormat.createAudioFormat("audio/opus", 48000, 1);
            f.setByteBuffer("csd-0", java.nio.ByteBuffer.wrap(Lien.opusHead(1, 0, 16000)));
            f.setByteBuffer("csd-1", java.nio.ByteBuffer.wrap(Lien.le64(0)));
            f.setByteBuffer("csd-2", java.nio.ByteBuffer.wrap(Lien.le64(80000000L)));
            android.media.MediaCodec d = android.media.MediaCodec.createDecoderByType("audio/opus");
            java.io.ByteArrayOutputStream pcm = new java.io.ByteArrayOutputStream();
            int rate = 48000, ch = 1;
            try {
                d.configure(f, null, null, 0); d.start();
                android.media.MediaCodec.BufferInfo bi = new android.media.MediaCodec.BufferInfo();
                int i = 0; long pts = 0, end = System.currentTimeMillis() + 10000; boolean inDone = false, outDone = false;
                while (!outDone && System.currentTimeMillis() < end) {
                    if (!inDone) {
                        int ix = d.dequeueInputBuffer(10000);
                        if (ix >= 0) {
                            java.nio.ByteBuffer b = d.getInputBuffer(ix); b.clear();
                            if (i < pk.size()) { byte[] p = pk.get(i++); b.put(p); d.queueInputBuffer(ix, 0, p.length, pts, 0); pts += Lien.packetSamples48(p) * 1000000L / 48000; }
                            else { d.queueInputBuffer(ix, 0, 0, pts, android.media.MediaCodec.BUFFER_FLAG_END_OF_STREAM); inDone = true; }
                        }
                    }
                    int ox = d.dequeueOutputBuffer(bi, 10000);
                    if (ox >= 0) {
                        if (bi.size > 0) { java.nio.ByteBuffer o = d.getOutputBuffer(ox); byte[] t = new byte[bi.size]; o.position(bi.offset); o.get(t); pcm.write(t, 0, t.length); }
                        d.releaseOutputBuffer(ox, false);
                        if ((bi.flags & android.media.MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outDone = true;
                    } else if (ox == android.media.MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        android.media.MediaFormat of = d.getOutputFormat();
                        if (of.containsKey(android.media.MediaFormat.KEY_SAMPLE_RATE)) rate = of.getInteger(android.media.MediaFormat.KEY_SAMPLE_RATE);
                        if (of.containsKey(android.media.MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(android.media.MediaFormat.KEY_CHANNEL_COUNT);
                    }
                }
            } finally { try { d.stop(); } catch (Throwable t) { } d.release(); }
            byte[] b = pcm.toByteArray(); short[] s = new short[b.length / 2];
            java.nio.ByteBuffer.wrap(b).order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(s);
            return Lien.resample(s, rate, ch, 16000);
        }
        /** Vosk sur le son décodé (modèle partagé avec l'écoute du téléphone, reconnaissance indépendante) */
        static String recognize(Context c, short[] pcm) throws Exception {
            if (pcm.length < 1600) return "";
            Recognizer r = new Recognizer(Ear.model(c), 16000.0f);
            try {
                short[] buf = new short[3200];
                for (int o = 0; o < pcm.length; o += buf.length) { int n = Math.min(buf.length, pcm.length - o); System.arraycopy(pcm, o, buf, 0, n); r.acceptWaveForm(buf, n); }
                return Ear.field(r.getFinalResult(), "text");
            } finally { try { r.close(); } catch (Throwable t) { } }
        }
    }
}
