package __PKG__;

/* =====================================================================
   MAGSerenite : lecture des sons de l'appli Sérénité par le téléphone, écran éteint compris.
   La page fabrique le son par tranches (Web Audio hors ligne) et les confie ici, quelques secondes d'avance écran allumé,
   plusieurs minutes écran éteint. Un service au premier plan (notification « Séance en cours ») et un verrou de veille
   gardent la lecture en marche ; les consignes des méditations guidées sont dites au bon moment par la voix du téléphone.
     demarrer(sr)            : nouvelle séance (mono 16 bits, sr Hz)
     pousser(base64)         : tranche de son (PCM 16 bits petit-boutiste)
     avance()                : secondes de son prêtes, pas encore entendues
     position()              : secondes entendues depuis le début
     duree(s) / finale(b64)  : fin de séance tenue par le téléphone (fondu de 8 s et cloches), même si la page dort ;
                               s'il manque de son, il rejoue les 2 dernières minutes
     finir()                 : plus de tranche à venir (écoute sans fin) ; le service s'arrête à la fin du son
     arreter(ms)             : fondu puis arrêt
     dire(json)              : [[seconde, texte], …] à dire à ces moments du son
   Événements vers la page : window.sereniteEvent('fin' | 'stop')
   ===================================================================== */

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Locale;

public class SereniteBridge {
    private final Activity a;
    private final WebView wv;
    private static boolean notifAsked = false;

    public SereniteBridge(Activity a, WebView wv) { this.a = a; this.wv = wv; }

    @JavascriptInterface public String version() { return "1"; }

    @JavascriptInterface public void demarrer(final int sr) {
        if (!notifAsked && Build.VERSION.SDK_INT >= 33) {
            notifAsked = true;
            a.runOnUiThread(new Runnable() { public void run() { try { a.requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" }, 6401); } catch (Throwable t) { } } });
        }
        Player.start(a.getApplicationContext(), sr, wv);
    }
    @JavascriptInterface public void pousser(String b64) {
        try {
            byte[] by = Base64.decode(b64, Base64.DEFAULT);
            short[] s = new short[by.length / 2];
            ByteBuffer.wrap(by).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(s);
            Player.push(s);
        } catch (Throwable t) { }
    }
    @JavascriptInterface public double avance() { return Player.ahead(); }
    @JavascriptInterface public double position() { return Player.pos(); }
    @JavascriptInterface public boolean actif() { return Player.run; }
    @JavascriptInterface public void finir() { Player.finish(); }
    @JavascriptInterface public void arreter(int ms) { Player.fadeStop(Math.max(50, ms), false); }
    @JavascriptInterface public void dire(String json) { Player.say(json); }
    /** Durée prévue de la séance en secondes (0 : sans fin) : le téléphone finit seul, même si la page dort */
    @JavascriptInterface public void duree(double sec) { Player.total = sec > 0 ? Math.round(sec * Player.sr) : 0; }
    /** Cloches de fin (PCM 16 bits, base64), jouées par-dessus le fondu final */
    @JavascriptInterface public void finale(String b64) {
        try {
            byte[] by = Base64.decode(b64, Base64.DEFAULT); short[] f = new short[by.length / 2];
            ByteBuffer.wrap(by).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(f); Player.finale = f;
        } catch (Throwable t) { }
    }

    // =====================================================================
    static final class Player {
        static final Object L = new Object();
        static final ArrayDeque<short[]> q = new ArrayDeque<>();
        static volatile boolean run = false, ending = false;
        static int sr = 32000;
        static long queued = 0, written = 0;
        static AudioTrack t; static Thread th; static PowerManager.WakeLock wl;
        static volatile float gain = 1f, target = 1f, step = 0f;
        static Context app; static WebView wv;
        static final Handler h = new Handler(Looper.getMainLooper());
        static final ArrayList<Object[]> speech = new ArrayList<>();
        static TextToSpeech tts; static boolean ttsOk = false;
        static Object focusReq;

        static void start(Context c, int rate, WebView w) {
            stopNow(false);
            app = c; wv = w; sr = rate; ending = false; gain = 1f; target = 1f; step = 0f; total = 0; finale = null;
            synchronized (L) { q.clear(); queued = 0; speech.clear(); }
            written = 0;
            int min = AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
            t = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setAudioFormat(new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(Math.max(min, sr)).setTransferMode(AudioTrack.MODE_STREAM).build();
            t.play();
            run = true;
            try {
                PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
                wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "serenite:lecture");
                wl.setReferenceCounted(false); wl.acquire(6 * 3600 * 1000L);
            } catch (Throwable e) { }
            focus(true);
            try {
                Intent i = new Intent(app, Seance.class);
                if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(i); else app.startService(i);
            } catch (Throwable e) { }
            th = new Thread(new Runnable() { public void run() { loop(); } }, "serenite-son");
            th.start();
        }
        static void push(short[] s) { synchronized (L) { q.add(s); queued += s.length; L.notifyAll(); } }
        static long head() { try { return t == null ? 0 : (t.getPlaybackHeadPosition() & 0xffffffffL); } catch (Throwable e) { return 0; } }
        static double ahead() { if (t == null || !run) return 0; synchronized (L) { return Math.max(0, (written - head() + queued)) / (double) sr; } }
        static double pos() { return head() / (double) sr; }
        static void finish() { synchronized (L) { ending = true; L.notifyAll(); } }

        // ---- fin de séance tenue par le téléphone, même si la page dort ----
        static volatile long total = 0;          // durée prévue en échantillons (0 : sans fin)
        static volatile short[] finale = null;   // cloches de fin, jouées par-dessus le fondu
        static boolean endPhase = false; static int fpos = 0;
        // ---- son déjà entendu (2 min), rejoué si la page n'a pas fourni la suite à temps ----
        static short[] hist = null; static int hpos = 0, hfill = 0, hread = -1;
        static short[] cur = null; static int curPos = 0;

        static void remember(short[] s) {
            if (hist == null) return;
            for (int i = 0; i < s.length; i++) { hist[hpos] = s[i]; hpos = (hpos + 1) % hist.length; }
            hfill = Math.min(hist.length, hfill + s.length); hread = -1;
        }
        static short[] fromHistory(int len) {
            int H = hist.length, oldest = (hpos - hfill + H) % H;
            if (hread < 0) hread = oldest;
            short[] o = new short[len];
            for (int i = 0; i < len; i++) {
                o[i] = hist[hread]; hread = (hread + 1) % H;
                if (hread == hpos) hread = oldest;   // retour au début de la réserve
            }
            return o;
        }
        /** remplit out ; rend le nombre d'échantillons, 0 s'il faut attendre, -1 si la séance est finie */
        static int fill(short[] out) {
            int n = out.length, got = 0;
            if (total > 0 && written >= total && !endPhase) {   // heure de fin : fondu de 8 s, cloches par-dessus
                endPhase = true; fpos = 0; target = 0f; step = -gain / (8f * sr);
            }
            if (endPhase && gain <= 0.0005f && (finale == null || fpos >= finale.length)) return -1;
            while (got < n) {
                if (cur == null || curPos >= cur.length) {
                    short[] nx;
                    synchronized (L) { nx = q.poll(); if (nx != null) queued -= nx.length; }
                    if (nx != null) { remember(nx); cur = nx; curPos = 0; }
                    else if (ending && total == 0 && !endPhase) { return got > 0 ? got : -1; }
                    else if (hfill >= sr * 15) { cur = fromHistory(sr * 2); curPos = 0; }   // la page dort : on rejoue la réserve
                    else break;
                }
                int k = Math.min(n - got, cur.length - curPos);
                System.arraycopy(cur, curPos, out, got, k); got += k; curPos += k;
            }
            if (got == 0 && !endPhase) return 0;
            if (got < n) java.util.Arrays.fill(out, got, n, (short) 0);
            return n;
        }
        static void loop() {
            final int SLICE = 2048;
            AudioTrack tr = t; short[] buf = new short[SLICE];
            hist = new short[sr * 120]; hpos = 0; hfill = 0; hread = -1; cur = null; curPos = 0; endPhase = false; fpos = 0;
            while (run && tr == t) {
                int n = fill(buf);
                if (n < 0) {   // fin : laisser le son se terminer
                    long end = System.currentTimeMillis() + 3000;
                    while (run && ahead() > 0.05 && System.currentTimeMillis() < end) { speakDue(); try { Thread.sleep(60); } catch (InterruptedException e) { return; } }
                    h.post(new Runnable() { public void run() { stopNow(true); event("fin"); } });
                    return;
                }
                if (n == 0) { synchronized (L) { try { L.wait(200); } catch (InterruptedException e) { return; } } speakDue(); continue; }
                for (int i = 0; i < n; i++) {
                    if (gain != target) { gain += step; if ((step > 0 && gain > target) || (step < 0 && gain < target) || step == 0) gain = target; }
                    int v = Math.round(buf[i] * gain);
                    short[] fin = finale;
                    if (endPhase && fin != null && fpos < fin.length) v += fin[fpos++];
                    buf[i] = (short) Math.max(-32768, Math.min(32767, v));
                }
                int off = 0;
                while (run && off < n) {
                    int w;
                    try { w = tr.write(buf, off, n - off); } catch (Throwable e) { return; }
                    if (w < 0) return;
                    off += w; written += w;
                }
                speakDue();
            }
        }
        static void fadeStop(int ms, final boolean fromNotif) {
            if (!run) return;
            step = -gain / Math.max(1f, ms * sr / 1000f); target = 0f;
            h.postDelayed(new Runnable() { public void run() { stopNow(true); if (fromNotif) event("stop"); } }, ms + 120);
        }
        static void stopNow(boolean svc) {
            run = false;
            synchronized (L) { q.clear(); queued = 0; speech.clear(); L.notifyAll(); }
            AudioTrack tr = t; t = null;
            if (tr != null) { try { tr.pause(); tr.flush(); tr.release(); } catch (Throwable e) { } }
            try { if (tts != null) tts.stop(); } catch (Throwable e) { }
            try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable e) { }
            focus(false);
            if (svc && app != null) { try { app.stopService(new Intent(app, Seance.class)); } catch (Throwable e) { } }
        }
        static void event(final String ev) {
            final WebView w = wv; if (w == null) return;
            w.post(new Runnable() { public void run() { try { w.evaluateJavascript("window.sereniteEvent&&sereniteEvent('" + ev + "')", null); } catch (Throwable e) { } } });
        }
        // ---- consignes dites au bon moment du son ----
        static void say(String json) {
            try {
                JSONArray l = new JSONArray(json);
                synchronized (L) { speech.clear(); for (int i = 0; i < l.length(); i++) { JSONArray x = l.getJSONArray(i); speech.add(new Object[]{ x.getDouble(0), x.getString(1) }); } }
                if (tts == null) {
                    h.post(new Runnable() { public void run() {
                        tts = new TextToSpeech(app, new TextToSpeech.OnInitListener() { public void onInit(int st) {
                            if (st != TextToSpeech.SUCCESS) return;
                            try { tts.setLanguage(Locale.FRANCE); tts.setSpeechRate(0.88f); tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()); } catch (Throwable e) { }
                            ttsOk = true;
                        } });
                    } });
                }
            } catch (Throwable e) { }
        }
        static void speakDue() {
            if (!ttsOk || speech.isEmpty()) return;
            double p = pos(); String txt = null;
            synchronized (L) { if (!speech.isEmpty() && (double) speech.get(0)[0] <= p) txt = (String) speech.remove(0)[1]; }
            if (txt != null) { final String s = txt; h.post(new Runnable() { public void run() { try { tts.speak(s, TextToSpeech.QUEUE_ADD, null, "srn"); } catch (Throwable e) { } } }); }
        }
        // ---- focus audio : une autre appli qui joue longtemps arrête la séance ----
        static final AudioManager.OnAudioFocusChangeListener afl = new AudioManager.OnAudioFocusChangeListener() {
            public void onAudioFocusChange(int f) { if (f == AudioManager.AUDIOFOCUS_LOSS) fadeStop(800, true); }
        };
        static void focus(boolean on) {
            if (app == null) return;
            try {
                AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
                if (Build.VERSION.SDK_INT >= 26) {
                    if (on) {
                        AudioFocusRequest r = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                            .setOnAudioFocusChangeListener(afl).build();
                        focusReq = r; am.requestAudioFocus(r);
                    } else if (focusReq != null) { am.abandonAudioFocusRequest((AudioFocusRequest) focusReq); focusReq = null; }
                } else {
                    if (on) am.requestAudioFocus(afl, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN); else am.abandonAudioFocus(afl);
                }
            } catch (Throwable e) { }
        }
    }

    // =====================================================================
    // Service au premier plan : garde la séance en marche écran éteint
    public static class Seance extends Service {
        static final int NID = 6402; static final String CH = "serenite_seance";
        @Override public int onStartCommand(Intent i, int flags, int id) {
            if (i != null && "stop".equals(i.getAction())) { Player.fadeStop(1200, true); return START_NOT_STICKY; }
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
                NotificationChannel c = new NotificationChannel(CH, "Séance en cours", NotificationManager.IMPORTANCE_LOW);
                c.setShowBadge(false); nm.createNotificationChannel(c);
            }
            int f = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent pOpen = open == null ? null : PendingIntent.getActivity(this, 1, open, f);
            PendingIntent pStop = PendingIntent.getService(this, 2, new Intent(this, Seance.class).setAction("stop"), f);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
            b.setSmallIcon(getApplicationInfo().icon).setContentTitle("Sérénité").setContentText("Séance en cours")
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .addAction(new Notification.Action.Builder(null, "Arrêter", pStop).build());
            if (pOpen != null) b.setContentIntent(pOpen);
            try {
                if (Build.VERSION.SDK_INT >= 29) startForeground(NID, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                else startForeground(NID, b.build());
            } catch (Throwable e) { }
            return START_NOT_STICKY;
        }
        @Override public IBinder onBind(Intent i) { return null; }
        @Override public void onTaskRemoved(Intent root) { Player.fadeStop(300, false); stopSelf(); }
        @Override public void onDestroy() {
            try { if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true); } catch (Throwable e) { }
            super.onDestroy();
        }
    }
}
