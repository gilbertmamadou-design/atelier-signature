package __PKG__;

// Majordome : pont natif exposé en JavaScript sous window.MAGMajordome (appli fr.magformation13.majordome seulement :
// copié par print-patch.sh pour APP=majordome, avec les bibliothèques Vosk et JNA). Chargé par réflexion par MainActivity.
//  - Reconnaissance vocale hors ligne : Vosk (com.alphacephei:vosk-android, Apache-2.0), modèle vosk-model-small-fr-0.22
//    (Apache-2.0) téléchargé une fois depuis alphacephei.com (ou choisi comme fichier .zip), décompressé dans files/vosk-fr.
//    Repli : SpeechRecognizer d'Android avec EXTRA_PREFER_OFFLINE.
//  - Écoute continue du mot de réveil : service au premier plan (micro) avec notification, option « seulement en charge ».
//  - Voix : TextToSpeech (voix françaises du téléphone, vitesse, hauteur, volume) ; fin de phrase signalée à la page.
//  - Minuteurs, réveils, rappels : AlarmManager (setAlarmClock / setExactAndAllowWhileIdle), notification plein écran, redémarrage.
//  - Téléphone : appel et SMS (toujours après confirmation dans la page), volume, sonnerie / ne pas déranger, panneaux Wi-Fi
//    et Bluetooth (Android impose de passer par eux), touches multimédia.
// Événements vers la page : window.majordomeEvent(type, json). Codes de requête 6600 à 6619 ; notifications 6620 à 6640.

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
import java.util.Iterator;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MajordomeBridge {
    static final String MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip";
    static final String PREFS = "majordome";
    static final int REQ_MIC = 6600, REQ_PICK = 6601, REQ_PERM = 6602;
    static final int N_WAKE = 6620, N_CMD = 6621, N_ALARM_BASE = 6630;
    static final String CH_WAKE = "mj_ecoute", CH_ALARM = "mj_alarme", CH_RAPPEL = "mj_rappel", CH_CMD = "mj_commande";

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
                public void onActivityResumed(Activity x) { if (x == MajordomeBridge.this.a) { resumed = true; live = MajordomeBridge.this; } }
                public void onActivityPaused(Activity x) { if (x == MajordomeBridge.this.a) resumed = false; }
                public void onActivityCreated(Activity x, Bundle b) { }
                public void onActivityStarted(Activity x) { }
                public void onActivityStopped(Activity x) { }
                public void onActivitySaveInstanceState(Activity x, Bundle b) { }
                public void onActivityDestroyed(Activity x) { if (x == MajordomeBridge.this.a) { if (live == MajordomeBridge.this) live = null; resumed = false; } }
            });
        } catch (Throwable t) { }
        takeIntent(a.getIntent());
    }

    // ---------- Cycle de vie (appelé par MainActivity) ----------
    public void onResume() { resumed = true; live = this; emit("perm", "{}"); }
    public void onPermissions(int code) { emit("perm", "{}"); }
    public void onIntent(Intent i) { takeIntent(i); }
    public void onResult(int code, int res, Intent data) {
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
                public void onRmsChanged(float db) { emit("level", obj("v", Math.max(0, Math.min(1, (db + 2) / 12.0)))); }
                public void onBufferReceived(byte[] b) { }
                public void onEndOfSpeech() { }
                public void onError(int err) { if (got[0]) return; got[0] = true; if (err == SpeechRecognizer.ERROR_NO_MATCH || err == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) emit("result", obj("text", "")); else emit("error", obj("msg", "Reconnaissance d'Android : erreur " + err + (err == SpeechRecognizer.ERROR_NETWORK || err == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ? " (pas de pack hors ligne français : installez-le, ou utilisez Vosk)" : ""))); }
                public void onResults(Bundle b) { if (got[0]) return; got[0] = true; ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); emit("result", obj("text", l != null && !l.isEmpty() ? l.get(0) : "")); }
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
        static void cancelCommand() { synchronized (LOCK) { if (cmdRec != null) { try { cmdRec.close(); } catch (Throwable t) { } cmdRec = null; } } send("end", "{}"); }
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
                short[] buf = new short[1600]; long lastLvl = 0;
                while (true) {
                    Recognizer c, w; boolean wake;
                    synchronized (LOCK) { c = cmdRec; w = wakeRec; wake = wakeOn && !wakePaused && !Ecoute.paused; }
                    if (c == null && (!wake || w == null)) break;
                    int n = rec.read(buf, 0, buf.length);
                    if (n <= 0) continue;
                    long now = System.currentTimeMillis();
                    if (c != null) {
                        if (now - lastLvl > 70) { lastLvl = now; double s = 0; for (int i = 0; i < n; i += 4) s += (double) buf[i] * buf[i]; double rms = Math.sqrt(s / (n / 4.0)) / 32768.0; send("level", obj("v", Math.min(1, rms * 9))); }
                        String done = null; boolean end = false;
                        synchronized (LOCK) {
                            if (cmdRec == c) {
                                if (c.acceptWaveForm(buf, n)) { String t = field(c.getResult(), "text"); if (!t.trim().isEmpty()) { done = t; end = true; } }
                                else { String p = field(c.getPartialResult(), "partial"); if (!p.isEmpty()) send("partial", obj("text", p)); }
                                if (!end && now > cmdEnd) { done = field(c.getFinalResult(), "text"); end = true; }
                                if (end) { try { c.close(); } catch (Throwable t) { } cmdRec = null; }
                            }
                        }
                        if (end) deliver(done == null ? "" : done, cmdFromWake);
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
                send("level", obj("v", 0));
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
        Notification.Builder b = nb(c, CH_CMD).setSmallIcon(c.getApplicationInfo().icon).setContentTitle("« " + text + " »").setContentText("Touchez pour la réponse")
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
    private void ttsInit() {
        if (tts != null) return;
        tts = new TextToSpeech(a.getApplicationContext(), new TextToSpeech.OnInitListener() { public void onInit(int st) {
            ttsOk = st == TextToSpeech.SUCCESS;
            if (!ttsOk) { for (String[] q : ttsQ) emit("spoken", obj("id", q[2])); ttsQ.clear(); return; }
            tts.setLanguage(Locale.FRANCE);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                public void onStart(String id) { }
                public void onDone(String id) { emit("spoken", obj("id", id)); }
                @SuppressWarnings("deprecation") public void onError(String id) { emit("spoken", obj("id", id)); }
                public void onRangeStart(String id, int s, int e, int f) { emit("boundary", "{}"); }
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
            tts.speak(text, TextToSpeech.QUEUE_ADD, p, id);
        } catch (Throwable t) { emit("spoken", obj("id", id)); }
    }
    @JavascriptInterface public void shush() { ui.post(new Runnable() { public void run() { if (tts != null) tts.stop(); } }); }

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
                    if (live != null && resumed) { send("alarm", obj("id", id)); return; }   // page ouverte : elle sonne et parle elle-même
                    channels(c);
                    boolean loud = !"reminder".equals(o.optString("kind"));
                    Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
                    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    PendingIntent pi = PendingIntent.getActivity(c, 6607 + (id.hashCode() & 0xff), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                    PendingIntent stop = PendingIntent.getBroadcast(c, 6608 + (id.hashCode() & 0xff), new Intent(c, Rappel.class).setAction("mj.STOP").putExtra("id", id), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                    Notification.Builder b = nb(c, loud ? CH_ALARM : CH_RAPPEL).setSmallIcon(c.getApplicationInfo().icon)
                        .setContentTitle(o.optString("title", "Majordome")).setContentText(o.optString("text", ""))
                        .setStyle(new Notification.BigTextStyle().bigText(o.optString("text", "")))
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
            WidgetProvider.putHue(c, s.put("on", on).put("total", total).put("names", names).toString());
        } catch (Throwable t) { }
    }
    static void hueStatusErr(Context c, String err) { try { WidgetProvider.putHue(c, new JSONObject().put("paired", hueLoad(c) != null).put("err", err).put("at", System.currentTimeMillis()).toString()); } catch (Throwable t) { } }
    /** Socle (WidgetProvider.call, permission « signature ») : relire l'état, ou tout éteindre, sans ouvrir Majordome */
    public static boolean widgetCall(final Context c0, final String m) {
        final Context c = c0.getApplicationContext();
        final JSONObject o = hueLoad(c);
        if (o == null) { try { WidgetProvider.putHue(c, "{\"paired\":false}"); } catch (Throwable t) { } return false; }
        final boolean v2 = "v2".equals(o.optString("api"));
        if ("hue_refresh".equals(m) || "hue_all_off".equals(m)) {
            HX.execute(new Runnable() { public void run() {
                try {
                    if ("hue_all_off".equals(m)) {
                        if (v2) {
                            Hue.Resp g = hueCall(c, "GET", "/clip/v2/resource/grouped_light", null);
                            JSONArray d = new JSONObject(g.body).optJSONArray("data"); String home = null;
                            for (int i = 0; d != null && i < d.length(); i++) { JSONObject x = d.getJSONObject(i); JSONObject ow = x.optJSONObject("owner"); if (ow != null && "bridge_home".equals(ow.optString("rtype"))) home = x.optString("id"); }
                            if (home != null && home.matches("[0-9a-fA-F\\-]{8,64}")) hueCall(c, "PUT", "/clip/v2/resource/grouped_light/" + home, "{\"on\":{\"on\":false}}");
                        } else hueCall(c, "PUT", "v1:/groups/0/action", "{\"on\":false}");
                    }
                    hueCall(c, "GET", v2 ? "/clip/v2/resource/light" : "v1:/lights", null);
                } catch (Hue.HueErr e) { hueStatusErr(c, e.code); }
                catch (Throwable t) { hueStatusErr(c, "unreachable"); }
            } });
            return true;
        }
        return false;
    }
    static String hueEv(String op, Object... kv) {
        try { JSONObject o = new JSONObject().put("op", op); for (int i = 0; i + 1 < kv.length; i += 2) if (kv[i + 1] != null) o.put((String) kv[i], kv[i + 1]); return o.toString(); }
        catch (Exception e) { return "{}"; }
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
                    Notification n = nb(c, CH_RAPPEL).setSmallIcon(c.getApplicationInfo().icon).setContentTitle("Lumières : " + o.optString("text", ""))
                        .setContentText("unreachable".equals(err) ? "Le pont Hue ne répond pas." : "Le pont Hue a refusé la commande.").setAutoCancel(true).build();
                    ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(N_ALARM_BASE + (id.hashCode() & 0x3ff), n);
                } catch (Throwable t) { }
            }
            if (pr != null) pr.finish();
        } }, "majordome-hue-later").start();
    }
}
