package __PKG__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.database.Cursor;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import android.os.StatFs;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Dictaphone : service au premier plan qui enregistre (type « microphone ») et lit les notes (type « mediaPlayback »).
 * L'enregistrement continue écran éteint ou appli fermée. Notification avec Pause / Marqueur / Arrêter.
 * Appelé par DictaBridge par réflexion : DictaService.cmd(Context, action, argument) et DictaService.setSink(ValueCallback).
 * Événements envoyés au pont : "type\u0001json".
 */
public class DictaService extends Service {
    static final String CH_REC = "dicta_rec", CH_PLAY = "dicta_play";
    static final int NID = 6151;
    static final long MIN_FREE = 40L * 1024 * 1024;   // en dessous : arrêt propre
    static final String PREFS = "dicta";
    static final Handler H = new Handler(Looper.getMainLooper());

    static volatile ValueCallback<String> sink;
    static DictaService inst;

    // ----- État de l'enregistrement -----
    static volatile boolean rec = false, paused = false;
    static String quality = "voice";
    static long recStartWall = 0, accMs = 0, segStart = 0;
    static float level = 0;
    static JSONArray marks = new JSONArray();
    static String recName = "";
    static Uri recUri;
    static File recFile;          // Android 9 et moins : fichier direct puis analyse MediaStore
    static String lastEnd = "";

    // ----- État de la lecture -----
    static volatile boolean playing = false;
    static long playId = -1;
    static String playName = "", playUri = "";
    static float speed = 1f;
    static boolean prepared = false;

    // ----- Instance -----
    private MediaRecorder mr;
    private AudioRecord ar;
    private Thread wavThread;
    private volatile boolean wavRun = false;
    private volatile int wavPeak = 0;
    private FileOutputStream wavOut;
    private long wavBytes = 0;
    private ParcelFileDescriptor pfd;
    private PowerManager.WakeLock wl;
    private MediaPlayer mp;
    private AudioManager am;
    private boolean fg = false;
    private int ticks = 0;

    // ================= API statique (réflexion depuis DictaBridge) =================
    public static void setSink(ValueCallback<String> s) { sink = s; }

    public static String cmd(Context c, String action, String arg) {
        try {
            switch (action) {
                case "start": {
                    if (rec) return state();
                    quality = arg == null || arg.isEmpty() ? "voice" : arg;
                    return startSvc(c, new Intent(c, DictaService.class).setAction("rec").putExtra("q", quality)) ? "ok" : "fgs";
                }
                case "pause": case "resume": case "stop": case "discard":
                case "toggle": case "seek": case "skip": case "speed": case "pstop": {
                    final String act = action, a = arg;
                    if (action.equals("speed")) { try { speed = Float.parseFloat(arg); } catch (Exception e) { } }
                    H.post(new Runnable() { public void run() { if (inst != null) inst.handle(act, a); } });
                    return "ok";
                }
                case "mark": {
                    synchronized (DictaService.class) {
                        if (!rec) return "-1";
                        JSONObject m = new JSONObject();
                        m.put("t", elapsed()); m.put("note", arg == null ? "" : arg);
                        marks.put(m);
                        int n = marks.length() - 1;
                        H.post(new Runnable() { public void run() { if (inst != null) { inst.notifyRec(); emit("state", stateObj()); } } });
                        return String.valueOf(n);
                    }
                }
                case "note": {
                    synchronized (DictaService.class) {
                        int k = arg.indexOf('\n');
                        int i = Integer.parseInt(arg.substring(0, k));
                        if (i >= 0 && i < marks.length()) marks.getJSONObject(i).put("note", arg.substring(k + 1));
                    }
                    return state();
                }
                case "state": return state();
                case "play": {
                    JSONObject o = new JSONObject(arg);
                    if (rec) return "rec";
                    Intent i = new Intent(c, DictaService.class).setAction("play")
                        .putExtra("uri", o.optString("uri")).putExtra("id", o.optLong("id", -1))
                        .putExtra("name", o.optString("name")).putExtra("pos", o.optInt("pos", 0));
                    if (o.has("speed")) speed = (float) o.optDouble("speed", 1);
                    return startSvc(c, i) ? "ok" : "fgs";
                }
                case "pstate": return pstateObj().toString();
                case "last": { String s = lastEnd; return s; }
            }
        } catch (Throwable e) { return "err:" + e.getMessage(); }
        return "";
    }

    private static boolean startSvc(Context c, Intent i) {
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
            return true;
        } catch (Throwable e) { emit("error", msg("Impossible de démarrer en arrière-plan : " + e.getMessage())); return false; }
    }

    static long elapsed() { return !rec ? 0 : accMs + (paused ? 0 : SystemClock.elapsedRealtime() - segStart); }

    static synchronized JSONObject stateObj() {
        JSONObject o = new JSONObject();
        try {
            o.put("rec", rec); o.put("paused", paused); o.put("t", elapsed()); o.put("q", quality);
            o.put("name", recName); o.put("since", recStartWall); o.put("level", level);
            o.put("markers", new JSONArray(marks.toString()));
            o.put("playing", playing); o.put("playId", playId);
        } catch (Exception e) { }
        return o;
    }
    static String state() { return stateObj().toString(); }

    static JSONObject pstateObj() {
        JSONObject o = new JSONObject();
        try {
            int p = 0, d = 0;
            DictaService s = inst;
            if (s != null && s.mp != null && prepared) { try { p = s.mp.getCurrentPosition(); d = s.mp.getDuration(); } catch (Exception e) { } }
            o.put("id", playId); o.put("name", playName); o.put("playing", playing); o.put("pos", p); o.put("dur", d); o.put("speed", speed);
            o.put("active", s != null && s.mp != null);
        } catch (Exception e) { }
        return o;
    }

    static JSONObject msg(String m) { JSONObject o = new JSONObject(); try { o.put("msg", m); } catch (Exception e) { } return o; }

    static void emit(final String type, final JSONObject o) {
        final ValueCallback<String> s = sink;
        if (s == null) return;
        final String payload = type + "\u0001" + (o == null ? "{}" : o.toString());
        if (Looper.myLooper() == Looper.getMainLooper()) { try { s.onReceiveValue(payload); } catch (Throwable e) { } }
        else H.post(new Runnable() { public void run() { try { s.onReceiveValue(payload); } catch (Throwable e) { } } });
    }

    // ================= Service =================
    @Override public void onCreate() {
        super.onCreate();
        inst = this;
        am = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            NotificationChannel a = new NotificationChannel(CH_REC, "Enregistrement en cours", NotificationManager.IMPORTANCE_LOW);
            a.setDescription("Affichée pendant l'enregistrement, avec Pause et Arrêter"); a.setShowBadge(false);
            nm.createNotificationChannel(a);
            NotificationChannel b = new NotificationChannel(CH_PLAY, "Lecture des notes", NotificationManager.IMPORTANCE_LOW);
            b.setShowBadge(false);
            nm.createNotificationChannel(b);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if (a == null) { if (!rec && !playing) { fgNow(false); stopAll(); } return START_NOT_STICKY; }
        switch (a) {
            case "rec": {
                fgNow(true);
                if (rec) break;
                if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    emit("error", msg("Autorisation du micro refusée")); stopAll(); break;
                }
                if (mp != null) stopPlayer();
                try { begin(intent.getStringExtra("q")); }
                catch (Throwable e) { cleanupFailed(); emit("error", msg("Enregistrement impossible : " + e.getMessage())); stopAll(); }
                break;
            }
            case "play": {
                if (rec) { emit("error", msg("Arrête d'abord l'enregistrement")); break; }
                playId = intent.getLongExtra("id", -1); playName = intent.getStringExtra("name"); playUri = intent.getStringExtra("uri");
                if (playName == null) playName = "";
                fgNow(false);
                startPlayer(intent.getIntExtra("pos", 0));
                break;
            }
            case "n_pause": handle("pause", null); break;
            case "n_resume": handle("resume", null); break;
            case "n_stop": handle("stop", null); break;
            case "n_mark": cmd(this, "mark", ""); break;
            case "p_toggle": handle("toggle", null); break;
            case "p_back": handle("skip", "-10000"); break;
            case "p_fwd": handle("skip", "10000"); break;
            case "p_close": handle("pstop", null); break;
            default: if (!rec && mp == null) stopAll();
        }
        return START_NOT_STICKY;
    }

    /** Actions venant de l'appli ou de la notification (fil principal) */
    void handle(String a, String arg) {
        switch (a) {
            case "pause":
                if (!rec || paused || Build.VERSION.SDK_INT < 24) return;
                try { if (mr != null) mr.pause(); } catch (Throwable e) { return; }
                synchronized (DictaService.class) { accMs += SystemClock.elapsedRealtime() - segStart; paused = true; level = 0; }
                notifyRec(); emit("state", stateObj()); return;
            case "resume":
                if (!rec || !paused) return;
                try { if (mr != null && Build.VERSION.SDK_INT >= 24) mr.resume(); } catch (Throwable e) { return; }
                synchronized (DictaService.class) { segStart = SystemClock.elapsedRealtime(); paused = false; }
                notifyRec(); emit("state", stateObj()); return;
            case "stop": finish("stop"); return;
            case "discard": finish("discard"); return;
            case "toggle":
                if (mp == null || !prepared) return;
                if (mp.isPlaying()) { mp.pause(); playing = false; }
                else { focus(); mp.start(); applySpeed(); playing = true; H.removeCallbacks(playTick); H.post(playTick); }
                notifyPlay(); emit("play", pstateObj()); return;
            case "seek": case "skip":
                if (mp == null || !prepared) return;
                try {
                    int v = Integer.parseInt(arg), d = mp.getDuration();
                    int p = a.equals("seek") ? v : mp.getCurrentPosition() + v;
                    mp.seekTo(Math.max(0, Math.min(p, Math.max(0, d - 200))));
                } catch (Exception e) { }
                emit("play", pstateObj()); return;
            case "speed": if (playing) applySpeed(); notifyPlay(); emit("play", pstateObj()); return;
            case "pstop": stopPlayer(); emit("play", pstateObj()); if (!rec) stopAll(); return;
        }
    }

    // ================= Enregistrement =================
    private void begin(String q) throws Exception {
        quality = q == null ? "voice" : q;
        boolean wav = "wav".equals(quality);
        String ext = wav ? "wav" : "m4a", mime = wav ? "audio/x-wav" : "audio/mp4";
        recName = "Note " + new SimpleDateFormat("yyyy-MM-dd HH'h'mm", Locale.FRANCE).format(new Date());
        if (freeBytes() < MIN_FREE) throw new Exception("espace de stockage insuffisant");
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, recName + "." + ext);
            v.put(MediaStore.MediaColumns.TITLE, recName);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, relDir());
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            if (Build.VERSION.SDK_INT >= 31) v.put(MediaStore.Audio.AudioColumns.IS_RECORDING, 1);
            else v.put(MediaStore.Audio.AudioColumns.IS_MUSIC, 0);
            recUri = getContentResolver().insert(MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
            if (recUri == null) throw new Exception("MediaStore refuse le fichier");
            pfd = getContentResolver().openFileDescriptor(recUri, "rw");
            recFile = null;
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "Dictaphone");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("dossier Music/Dictaphone inaccessible");
            File f = new File(dir, recName + "." + ext);
            for (int k = 1; f.exists(); k++) f = new File(dir, recName + " (" + k + ")." + ext);
            recFile = f; recUri = null;
            pfd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE);
        }
        if (wav) startWav(); else startRecorder("hq".equals(quality));
        synchronized (DictaService.class) {
            marks = new JSONArray(); accMs = 0; segStart = SystemClock.elapsedRealtime(); recStartWall = System.currentTimeMillis();
            paused = false; rec = true; level = 0;
        }
        try {
            wl = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dicta:rec");
            wl.acquire(12 * 3600 * 1000L);
        } catch (Throwable e) { }
        notifyRec();
        ticks = 0; H.removeCallbacks(recTick); H.postDelayed(recTick, 66);
        emit("state", stateObj());
        publishWidget(this, true, null);
    }

    static String relDir() {
        return (Build.VERSION.SDK_INT >= 31 ? Environment.DIRECTORY_RECORDINGS : Environment.DIRECTORY_MUSIC) + "/Dictaphone";
    }

    @SuppressWarnings("deprecation")
    private void startRecorder(boolean hq) throws Exception {
        mr = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
        mr.setAudioSource(MediaRecorder.AudioSource.MIC);
        mr.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        mr.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        mr.setAudioChannels(1);
        mr.setAudioSamplingRate(hq ? 48000 : 44100);
        mr.setAudioEncodingBitRate(hq ? 128000 : 64000);
        mr.setOutputFile(pfd.getFileDescriptor());
        mr.setOnErrorListener(new MediaRecorder.OnErrorListener() {
            public void onError(MediaRecorder r, int what, int extra) { H.post(new Runnable() { public void run() { finish("error"); } }); }
        });
        mr.prepare();
        mr.start();
    }

    private void startWav() throws Exception {
        final int rate = 44100;
        int min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (min <= 0) throw new Exception("format audio non pris en charge");
        final int bs = Math.max(min * 2, rate / 5 * 2);
        ar = new AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bs);
        if (ar.getState() != AudioRecord.STATE_INITIALIZED) throw new Exception("micro indisponible");
        wavOut = new FileOutputStream(pfd.getFileDescriptor());
        wavOut.write(wavHeader(0, rate));
        wavBytes = 0;
        ar.startRecording();
        wavRun = true;
        wavThread = new Thread(new Runnable() { public void run() {
            byte[] buf = new byte[bs];
            try {
                while (wavRun) {
                    int n = ar.read(buf, 0, buf.length);
                    if (n <= 0) { if (n < 0) { H.post(new Runnable() { public void run() { finish("error"); } }); break; } continue; }
                    int pk = 0;
                    for (int i = 0; i + 1 < n; i += 2) { int s = (short) ((buf[i] & 0xff) | (buf[i + 1] << 8)); if (s < 0) s = -s; if (s > pk) pk = s; }
                    if (pk > wavPeak) wavPeak = pk;
                    if (!paused) { wavOut.write(buf, 0, n); wavBytes += n; }
                }
            } catch (Throwable e) { H.post(new Runnable() { public void run() { finish("error"); } }); }
        } }, "dicta-wav");
        wavThread.start();
    }

    static byte[] wavHeader(long dataLen, int rate) {
        ByteBuffer b = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{'R', 'I', 'F', 'F'}); b.putInt((int) Math.min(0xFFFFFFFFL, dataLen + 36)); b.put(new byte[]{'W', 'A', 'V', 'E'});
        b.put(new byte[]{'f', 'm', 't', ' '}); b.putInt(16); b.putShort((short) 1); b.putShort((short) 1);
        b.putInt(rate); b.putInt(rate * 2); b.putShort((short) 2); b.putShort((short) 16);
        b.put(new byte[]{'d', 'a', 't', 'a'}); b.putInt((int) Math.min(0xFFFFFFFFL, dataLen));
        return b.array();
    }

    private final Runnable recTick = new Runnable() { public void run() {
        if (!rec) return;
        int amp = 0;
        if (!paused) {
            if (mr != null) { try { amp = mr.getMaxAmplitude(); } catch (Throwable e) { } }
            else { amp = wavPeak; wavPeak = 0; }
        } else wavPeak = 0;
        double db = amp > 0 ? 20 * Math.log10(amp / 32767.0) : -90;
        level = (float) Math.max(0, Math.min(1, (db + 60) / 60));
        try {
            JSONObject o = new JSONObject();
            o.put("l", Math.round(level * 1000) / 1000.0); o.put("db", Math.round(db)); o.put("t", elapsed()); o.put("p", paused);
            emit("level", o);
        } catch (Exception e) { }
        if (++ticks % 15 == 0) {
            long free = freeBytes();
            if (free < MIN_FREE) { finish("space"); return; }
        }
        H.postDelayed(this, 66);
    } };

    static long freeBytes() {
        try { StatFs s = new StatFs(Environment.getExternalStorageDirectory().getPath()); return s.getAvailableBytes(); }
        catch (Throwable e) { return Long.MAX_VALUE; }
    }

    /** Arrêt de l'enregistrement : stop, discard, space, error */
    void finish(final String reason) {
        if (!rec) return;
        final long dur;
        final JSONArray mk;
        synchronized (DictaService.class) { dur = elapsed(); rec = false; paused = false; level = 0; mk = marks; }
        H.removeCallbacks(recTick);
        boolean bad = false;
        if (mr != null) {
            try { mr.stop(); } catch (Throwable e) { bad = true; }
            try { mr.release(); } catch (Throwable e) { }
            mr = null;
        }
        if (ar != null) {
            wavRun = false;
            try { ar.stop(); } catch (Throwable e) { }
            try { if (wavThread != null) wavThread.join(1500); } catch (Throwable e) { }
            try { ar.release(); } catch (Throwable e) { }
            ar = null; wavThread = null;
            try { wavOut.flush(); wavOut.getChannel().position(0); wavOut.getChannel().write(ByteBuffer.wrap(wavHeader(wavBytes, 44100))); } catch (Throwable e) { bad = wavBytes == 0; }
            try { wavOut.close(); } catch (Throwable e) { }
            wavOut = null;
            if (wavBytes == 0) bad = true;
        }
        try { if (pfd != null) pfd.close(); } catch (Throwable e) { }
        pfd = null;
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable e) { }
        wl = null;
        final boolean drop = bad || "discard".equals(reason) || dur < 400;
        if (drop) {
            try { if (recUri != null) getContentResolver().delete(recUri, null, null); } catch (Throwable e) { }
            try { if (recFile != null) recFile.delete(); } catch (Throwable e) { }
            JSONObject o = new JSONObject();
            try { o.put("discarded", true); o.put("reason", bad && !"discard".equals(reason) ? "error" : reason); o.put("dur", dur); } catch (Exception e) { }
            lastEnd = o.toString();
            emit("end", o);
            emit("state", stateObj());
            publishWidget(this, false, null);
            endFg();
            return;
        }
        if (recUri != null) {
            try {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContentResolver().update(recUri, v, null, null);
            } catch (Throwable e) { }
            done(ContentUris.parseId(recUri), recUri, dur, mk, reason);
        } else if (recFile != null) {
            final File f = recFile;
            MediaScannerConnection.scanFile(this, new String[]{ f.getAbsolutePath() }, null, new MediaScannerConnection.OnScanCompletedListener() {
                public void onScanCompleted(String path, final Uri uri) {
                    H.post(new Runnable() { public void run() { done(uri == null ? -1 : ContentUris.parseId(uri), uri, dur, mk, reason); } });
                }
            });
        }
    }

    private void done(long id, Uri uri, long dur, JSONArray mk, String reason) {
        JSONObject meta = new JSONObject();
        try {
            meta.put("markers", mk); meta.put("dur", dur); meta.put("q", quality); meta.put("tags", new JSONArray()); meta.put("chantier", "");
            meta.put("date", recStartWall);
            if (id >= 0) {
                SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
                String nx = p.getString("nextMeta", null);
                if (nx != null) { try { JSONObject o = new JSONObject(nx); if (o.has("tags")) meta.put("tags", o.get("tags")); if (o.has("chantier")) meta.put("chantier", o.get("chantier")); } catch (Exception e) { } }
                String old = p.getString("m_" + id, null);
                if (old != null) { JSONObject o = new JSONObject(old); if (o.has("tags")) meta.put("tags", o.get("tags")); if (o.has("chantier")) meta.put("chantier", o.get("chantier")); }
                p.edit().putString("m_" + id, meta.toString()).apply();
            }
            JSONObject o = new JSONObject();
            o.put("id", id); o.put("uri", uri == null ? "" : uri.toString()); o.put("name", recName); o.put("dur", dur);
            o.put("reason", reason); o.put("markers", mk); o.put("date", recStartWall); o.put("q", quality);
            lastEnd = o.toString();
            emit("end", o);
            emit("state", stateObj());
            JSONObject last = new JSONObject(); last.put("name", recName); last.put("dur", dur); last.put("date", recStartWall);
            publishWidget(this, false, last);
        } catch (Exception e) { }
        if ("space".equals(reason)) notifyEnd("Enregistrement arrêté : stockage presque plein", recName + " a été gardé.");
        else if ("error".equals(reason)) notifyEnd("Enregistrement interrompu", recName + " a été gardé jusqu'à l'interruption.");
        endFg();
    }

    private void cleanupFailed() {
        try { if (mr != null) mr.release(); } catch (Throwable e) { } mr = null;
        wavRun = false;
        try { if (ar != null) ar.release(); } catch (Throwable e) { } ar = null;
        try { if (pfd != null) pfd.close(); } catch (Throwable e) { } pfd = null;
        try { if (recUri != null) getContentResolver().delete(recUri, null, null); } catch (Throwable e) { }
        try { if (recFile != null) recFile.delete(); } catch (Throwable e) { }
        rec = false; paused = false;
    }

    // ================= Lecture =================
    @SuppressWarnings("deprecation")
    private final AudioManager.OnAudioFocusChangeListener afl = new AudioManager.OnAudioFocusChangeListener() {
        public void onAudioFocusChange(int f) {
            if (f < 0 && mp != null && playing) { try { mp.pause(); } catch (Exception e) { } playing = false; notifyPlay(); emit("play", pstateObj()); }
        }
    };
    @SuppressWarnings("deprecation")
    private void focus() { try { am.requestAudioFocus(afl, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN); } catch (Throwable e) { } }

    private void startPlayer(final int pos) {
        stopPlayer();
        try {
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            mp.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            mp.setDataSource(this, Uri.parse(playUri));
            mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() { public void onPrepared(MediaPlayer m) {
                prepared = true;
                if (pos > 0) m.seekTo(pos);
                focus(); m.start(); applySpeed(); playing = true;
                notifyPlay(); emit("play", pstateObj());
                H.removeCallbacks(playTick); H.post(playTick);
            } });
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() { public void onCompletion(MediaPlayer m) {
                playing = false; notifyPlay();
                JSONObject o = pstateObj(); try { o.put("ended", true); } catch (Exception e) { }
                emit("play", o);
            } });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() { public boolean onError(MediaPlayer m, int w, int x) {
                emit("error", msg("Lecture impossible (" + w + ")")); stopPlayer(); emit("play", pstateObj()); if (!rec) stopAll(); return true;
            } });
            mp.prepareAsync();
        } catch (Throwable e) {
            emit("error", msg("Lecture impossible : " + e.getMessage())); stopPlayer(); stopAll();
        }
    }
    private void applySpeed() {
        if (mp == null || !prepared) return;
        try { mp.setPlaybackParams(mp.getPlaybackParams().setSpeed(Math.max(0.5f, Math.min(2f, speed)))); } catch (Throwable e) { }
    }
    private final Runnable playTick = new Runnable() { public void run() {
        if (mp == null || !playing) return;
        emit("play", pstateObj());
        H.postDelayed(this, 250);
    } };
    @SuppressWarnings("deprecation")
    private void stopPlayer() {
        H.removeCallbacks(playTick);
        playing = false; prepared = false;
        if (mp != null) { try { mp.release(); } catch (Throwable e) { } mp = null; }
        try { am.abandonAudioFocus(afl); } catch (Throwable e) { }
    }

    // ================= Notifications =================
    private PendingIntent act(String a, int rc) {
        return PendingIntent.getService(this, rc, new Intent(this, DictaService.class).setAction(a), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private PendingIntent openApp() {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (i == null) i = new Intent();
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 6152, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    @SuppressWarnings("deprecation")
    private Notification.Builder nb(String ch) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, ch) : new Notification.Builder(this);
        b.setSmallIcon(getApplicationInfo().icon).setContentIntent(openApp()).setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b;
    }
    private Notification.Action action(int icon, String t, PendingIntent pi) {
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), t, pi).build();
    }
    private Notification recNotif() {
        Notification.Builder b = nb(CH_REC).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE);
        int n = marks.length();
        b.setContentTitle(rec ? (paused ? "Enregistrement en pause" : "Enregistrement en cours") : "Dictaphone")
         .setContentText(recName + (n > 0 ? " · " + n + " marqueur" + (n > 1 ? "s" : "") : ""));
        if (rec && !paused) { b.setShowWhen(true).setUsesChronometer(true).setWhen(System.currentTimeMillis() - elapsed()); }
        else b.setShowWhen(false);
        if (rec) {
            if (Build.VERSION.SDK_INT >= 24) {
                b.addAction(paused ? action(android.R.drawable.ic_media_play, "Reprendre", act("n_resume", 6153))
                                   : action(android.R.drawable.ic_media_pause, "Pause", act("n_pause", 6154)));
            }
            b.addAction(action(android.R.drawable.ic_menu_add, "Marqueur", act("n_mark", 6155)));
            b.addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", act("n_stop", 6156)));
        }
        return b.build();
    }
    static String fmtSpeed(float v) {
        String t = String.format(Locale.US, "%.2f", v);
        while (t.endsWith("0")) t = t.substring(0, t.length() - 1);
        if (t.endsWith(".")) t = t.substring(0, t.length() - 1);
        return t.replace('.', ',');
    }
    private Notification playNotif() {
        Notification.Builder b = nb(CH_PLAY).setOngoing(playing).setShowWhen(false)
            .setContentTitle(playName.isEmpty() ? "Dictaphone" : playName)
            .setContentText((playing ? "Lecture" : "En pause") + (Math.abs(speed - 1f) > 0.01 ? " · " + fmtSpeed(speed) + "×" : ""))
            .setDeleteIntent(act("p_close", 6160))
            .addAction(action(android.R.drawable.ic_media_rew, "−10 s", act("p_back", 6157)))
            .addAction(playing ? action(android.R.drawable.ic_media_pause, "Pause", act("p_toggle", 6158))
                               : action(android.R.drawable.ic_media_play, "Lecture", act("p_toggle", 6158)))
            .addAction(action(android.R.drawable.ic_media_ff, "+10 s", act("p_fwd", 6159)))
            .addAction(action(android.R.drawable.ic_menu_close_clear_cancel, "Fermer", act("p_close", 6160)))
            .setStyle(new Notification.MediaStyle().setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }
    /** startForeground doit être appelé très vite après startForegroundService */
    private void fgNow(boolean recording) {
        Notification n = recording ? recNotif() : playNotif();
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NID, n, recording ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else if (Build.VERSION.SDK_INT >= 29 && !recording) startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NID, n);
            fg = true;
        } catch (Throwable e) {
            emit("error", msg("Android refuse le service au premier plan : " + e.getMessage()));
        }
    }
    void notifyRec() { if (!rec) return; try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NID, recNotif()); } catch (Throwable e) { } }
    void notifyPlay() { if (rec || mp == null) return; try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NID, playNotif()); } catch (Throwable e) { } }
    private void notifyEnd(String t, String x) {
        try {
            Notification.Builder b = nb(CH_REC).setContentTitle(t).setContentText(x).setAutoCancel(true);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NID + 1, b.build());
        } catch (Throwable e) { }
    }

    private void endFg() { if (mp == null) stopAll(); }
    @SuppressWarnings("deprecation")
    private void stopAll() {
        try { stopForeground(true); } catch (Throwable e) { }
        fg = false;
        try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(NID); } catch (Throwable e) { }
        stopSelf();
    }

    // ================= Tuile Socle =================
    static void publishWidget(Context c, boolean recording, JSONObject last) {
        try {
            JSONObject o = new JSONObject();
            o.put("recording", recording); o.put("since", recording ? recStartWall : 0);
            SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
            if (last != null) p.edit().putString("widgetLast", last.toString()).apply();
            String l = p.getString("widgetLast", null);
            o.put("last", l == null ? JSONObject.NULL : new JSONObject(l));
            o.put("count", count(c));
            java.lang.reflect.Method m = Class.forName(DictaService.class.getPackage().getName() + ".WidgetProvider").getDeclaredMethod("put", Context.class, String.class);
            m.setAccessible(true);
            m.invoke(null, c, o.toString());
        } catch (Throwable e) { }
    }
    static int count(Context c) {
        Cursor q = null;
        try {
            Uri u; String sel; String[] args;
            if (Build.VERSION.SDK_INT >= 29) {
                u = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
                sel = MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ? OR " + MediaStore.MediaColumns.RELATIVE_PATH + " LIKE ?";
                args = new String[]{ Environment.DIRECTORY_MUSIC + "/Dictaphone%", "Recordings/Dictaphone%" };
            } else {
                u = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                sel = MediaStore.MediaColumns.DATA + " LIKE ?";
                args = new String[]{ "%/Music/Dictaphone/%" };
            }
            q = c.getContentResolver().query(u, new String[]{ MediaStore.MediaColumns._ID }, sel, args, null);
            return q == null ? 0 : q.getCount();
        } catch (Throwable e) { return 0; }
        finally { if (q != null) q.close(); }
    }

    @Override public void onTaskRemoved(Intent i) {
        // L'enregistrement continue quand l'appli est balayée des récentes ; la lecture en pause s'arrête
        if (!rec && !playing) { stopPlayer(); stopAll(); }
        super.onTaskRemoved(i);
    }
    @Override public void onDestroy() {
        if (rec) finish("stop");
        stopPlayer();
        H.removeCallbacks(recTick);
        if (inst == this) inst = null;
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
